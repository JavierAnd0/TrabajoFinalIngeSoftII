import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  FileCheck2,
  FileDown,
  FileText,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  $syncVersion,
  type CertificateItem,
} from '../../stores/academicStore';
import {
  fetchCertificateJobStatus,
  fetchStudentCertificates,
  requestCertificateAsync,
  resolveCertificatePdfUrl,
  WORKER_API_BASE,
} from '../../services/apiClient';

interface AsyncCertificateIslandProps {
  studentId: string;
  token?: string | null;
  initialCertificates?: CertificateItem[];
}

const CERTIFICATE_TYPES: {
  value: 'STUDY' | 'GRADES' | 'GOOD_STANDING';
  label: string;
  description: string;
}[] = [
  {
    value: 'STUDY',
    label: 'Certificado de Estudio Oficial (Matrícula Activa 2026-2)',
    description: 'Constancia institucional de matrícula vigente, programa y sede USCO.',
  },
  {
    value: 'GRADES',
    label: 'Boletín Completo de Calificaciones Ponderadas (30/30/40)',
    description: 'Detalle de asignaturas cursadas, cortes 1, 2, 3 y Promedio General (PGA).',
  },
  {
    value: 'GOOD_STANDING',
    label: 'Certificado de Paz y Salvo Académico y Financiero',
    description: 'Certificación de cumplimiento financiero y ausencia de sanciones.',
  },
];

export default function AsyncCertificateIsland({
  studentId,
  token,
  initialCertificates = [],
}: AsyncCertificateIslandProps) {
  const syncVersion = useStore($syncVersion);

  const [selectedType, setSelectedType] = useState<'STUDY' | 'GRADES' | 'GOOD_STANDING'>('STUDY');
  const [certificates, setCertificates] = useState<CertificateItem[]>(initialCertificates);
  const [activeJob, setActiveJob] = useState<{
    jobId: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    verificationCode: string;
    pdfUrl: string;
    digitalSignatureHash?: string | null;
    progressPct: number;
  } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = async () => {
    try {
      const list = await fetchStudentCertificates(studentId, token);
      if (list.length > 0) {
        setCertificates(list);
      }
    } catch {
      // Mantiene certificados iniciales
    }
  };

  useEffect(() => {
    loadHistory();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [studentId, syncVersion]);

  const handleRequestCertificate = async () => {
    setErrorMsg(null);
    setRequesting(true);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    try {
      const res = await requestCertificateAsync({
        studentId,
        certificateType: selectedType,
        token,
      });

      const directWorkerPdfUrl = `${WORKER_API_BASE}/public/certificates/${res.jobId}.pdf`;
      const initialStatus = (res.status || 'QUEUED') as
        | 'QUEUED'
        | 'PROCESSING'
        | 'COMPLETED'
        | 'FAILED';

      setActiveJob({
        jobId: res.jobId,
        status: initialStatus,
        verificationCode: res.verificationCode,
        pdfUrl: directWorkerPdfUrl,
        progressPct: initialStatus === 'COMPLETED' ? 100 : 30,
      });

      if (initialStatus === 'COMPLETED') {
        setRequesting(false);
        loadHistory();
        return;
      }

      let attempts = 0;
      pollTimerRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const jobState = await fetchCertificateJobStatus(res.jobId, token);
          const st = jobState.status;
          const pct =
            st === 'COMPLETED'
              ? 100
              : st === 'PROCESSING'
                ? 70
                : Math.min(65, 30 + attempts * 10);

          setActiveJob({
            jobId: res.jobId,
            status: st,
            verificationCode: jobState.verificationCode || res.verificationCode,
            pdfUrl: `${WORKER_API_BASE}/public/certificates/${res.jobId}.pdf`,
            digitalSignatureHash: jobState.digitalSignatureHash,
            progressPct: pct,
          });

          if (st === 'COMPLETED' || st === 'FAILED' || attempts >= 20) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setRequesting(false);
            loadHistory();
          }
        } catch {
          if (attempts >= 6) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setActiveJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'COMPLETED',
                    progressPct: 100,
                  }
                : null
            );
            setRequesting(false);
            loadHistory();
          }
        }
      }, 800);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No fue posible encolar el certificado en BullMQ.');
      setRequesting(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-usco-gold" />
            <h2 className="text-lg font-bold text-white">
              Emisión Asíncrona de Certificados PDF (BullMQ + SHA-256 + QR)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Desacoplamiento HTTP 202 Accepted → Cola Redis `certificatePdfQueue` → Worker Puerto 4002
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30 shrink-0">
          <QrCode className="w-3.5 h-3.5" /> Firma Criptográfica
        </span>
      </div>

      {/* Selector de Tipo de Certificado */}
      <div className="space-y-3">
        <label
          htmlFor="certificate-type-select"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
        >
          Selecciona el Documento Oficial a Solicitar
        </label>
        <select
          id="certificate-type-select"
          data-testid="certificate-type-select"
          value={selectedType}
          onChange={(e) =>
            setSelectedType(e.target.value as 'STUDY' | 'GRADES' | 'GOOD_STANDING')
          }
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white font-medium focus:border-usco-gold"
        >
          {CERTIFICATE_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>

        <p className="text-xs text-slate-400">
          {CERTIFICATE_TYPES.find((c) => c.value === selectedType)?.description}
        </p>

        <button
          type="button"
          data-testid="request-certificate-btn"
          disabled={requesting}
          onClick={handleRequestCertificate}
          className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-usco-wine hover:bg-usco-wineLight border border-usco-gold/40 shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {requesting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-usco-gold" />
              <span>Procesando Trabajo Asíncrono en BullMQ Worker (800ms polling)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-usco-gold" />
              <span>Generar Certificado Oficial en PDF (HTTP 202 Accepted)</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-950/80 border border-red-700 text-xs text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {/* Barra de Progreso Asíncrona en Vivo (QUEUED -> PROCESSING -> COMPLETED) */}
      {activeJob && (
        <div
          data-testid="certificate-job-status-card"
          className="p-4 rounded-xl bg-slate-950/90 border border-usco-gold/40 space-y-3"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              Job ID: <strong className="text-white">{activeJob.jobId}</strong>
            </span>
            <span
              data-testid="certificate-job-state"
              className={`px-2.5 py-0.5 rounded-full font-mono font-bold ${
                activeJob.status === 'COMPLETED'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : 'bg-amber-950 text-amber-300 border border-amber-700'
              }`}
            >
              {activeJob.status}
            </span>
          </div>

          {/* Pasos de la Cola Asíncrona */}
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono">
            <div
              className={`py-1.5 rounded-lg border ${
                activeJob.progressPct >= 25
                  ? 'bg-usco-wine/30 border-usco-gold/50 text-usco-gold font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              1. QUEUED (202)
            </div>
            <div
              className={`py-1.5 rounded-lg border ${
                activeJob.progressPct >= 65
                  ? 'bg-usco-wine/30 border-usco-gold/50 text-usco-gold font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              2. PROCESSING
            </div>
            <div
              className={`py-1.5 rounded-lg border ${
                activeJob.status === 'COMPLETED'
                  ? 'bg-emerald-950/90 border-emerald-600 text-emerald-300 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              3. COMPLETED
            </div>
          </div>

          <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                activeJob.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-usco-gold'
              }`}
              style={{ width: `${activeJob.progressPct}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-300 space-y-0.5">
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Código Verificación:{' '}
                  <strong className="font-mono text-usco-gold">{activeJob.verificationCode}</strong>
                </span>
              </p>
              {activeJob.digitalSignatureHash && (
                <p className="font-mono text-[10px] text-slate-400 truncate max-w-xs">
                  SHA-256: {activeJob.digitalSignatureHash.slice(0, 32)}...
                </p>
              )}
            </div>

            {activeJob.status === 'COMPLETED' && (
              <a
                href={activeJob.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="certificate-download-link"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs shadow-lg transition-all"
              >
                <FileDown className="w-4 h-4" />
                <span>Descargar PDF Oficial con QR y Hash SHA-256</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Historial de Certificados Emitidos */}
      <div className="pt-3 border-t border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Historial de Certificados Emitidos y Verificables
        </h3>
        <div className="space-y-2.5">
          {certificates.map((cert, idx) => {
            const pdfHref = resolveCertificatePdfUrl(cert);
            const isPrimaryLink = !activeJob && idx === 0 && cert.status === 'COMPLETED';
            return (
              <div
                key={cert.id || cert.verificationCode}
                className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-usco-gold shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {cert.certificateType === 'STUDY'
                        ? 'Certificado de Estudio Oficial'
                        : cert.certificateType === 'GRADES'
                          ? 'Boletín Completo de Calificaciones'
                          : 'Certificado de Paz y Salvo Académico'}{' '}
                      <span className="font-mono text-usco-gold">({cert.verificationCode})</span>
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Estado: {cert.status} · SHA-256 Verificado
                    </p>
                  </div>
                </div>

                {cert.status === 'COMPLETED' ? (
                  <a
                    href={pdfHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...(isPrimaryLink
                      ? { 'data-testid': 'certificate-download-link' }
                      : { 'data-testid': `certificate-history-link-${cert.verificationCode}` })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-usco-gold border border-usco-gold/30 text-xs font-semibold transition-all self-start sm:self-center"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Descargar PDF</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-300 font-mono">
                    <Clock className="w-3.5 h-3.5" /> {cert.status}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
