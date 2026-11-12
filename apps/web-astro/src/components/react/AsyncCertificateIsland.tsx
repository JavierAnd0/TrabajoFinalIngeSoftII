import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  FileCheck2,
  FileDown,
  FileText,
  Loader2,
  QrCode,
  ShieldCheck,
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
    label: 'Certificado de Estudio Oficial (Periodo 2026-2)',
    description: 'Constancia institucional de matrícula activa, programa académico y sede.',
  },
  {
    value: 'GRADES',
    label: 'Certificado Oficial de Calificaciones y PGA',
    description: 'Detalle histórico de asignaturas cursadas, notas por corte y promedio ponderado.',
  },
  {
    value: 'GOOD_STANDING',
    label: 'Certificado de Paz y Salvo Académico y Financiero',
    description: 'Certificación de cumplimiento financiero, biblioteca y ausencia de sanciones.',
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

      const directWorkerPdfUrl = resolveCertificatePdfUrl({ jobId: res.jobId });
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
            pdfUrl: resolveCertificatePdfUrl(jobState),
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
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No fue posible procesar la solicitud del certificado.';
      setErrorMsg(msg);
      setRequesting(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 sm:p-6 border border-slate-800 space-y-5 min-w-0 max-w-full overflow-hidden">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-usco-gold" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              Certificados Académicos Oficiales
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Documentos oficiales con código QR para verificar su autenticidad
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#070A12] text-usco-gold border border-slate-800 shrink-0">
          <QrCode className="w-3.5 h-3.5" /> Verificable
        </span>
      </div>

      {/* Selector de Tipo de Certificado */}
      <div className="space-y-3">
        <label
          htmlFor="certificate-type-select"
          className="block text-xs font-medium text-slate-300"
        >
          Tipo de certificado a expedir
        </label>
        <select
          id="certificate-type-select"
          data-testid="certificate-type-select"
          value={selectedType}
          onChange={(e) =>
            setSelectedType(e.target.value as 'STUDY' | 'GRADES' | 'GOOD_STANDING')
          }
          className="w-full min-w-0 max-w-full truncate px-3.5 py-2.5 rounded-lg bg-[#070A12] border border-slate-700/90 text-xs sm:text-sm text-white font-medium focus:border-usco-gold focus:outline-none"
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
          className="w-full py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold text-white bg-usco-wine hover:bg-usco-wineLight border border-usco-gold/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {requesting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-usco-gold" />
              <span>Generando y firmando documento PDF...</span>
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 text-usco-gold" />
              <span>Solicitar Certificado Oficial en PDF</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-xs text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {/* Barra de Progreso Asíncrona en Vivo (QUEUED -> PROCESSING -> COMPLETED) */}
      {activeJob && (
        <div
          data-testid="certificate-job-status-card"
          className="p-4 rounded-lg bg-[#070A12] border border-slate-800 space-y-3"
        >
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-mono text-slate-400 truncate">
              Radicado: <strong className="text-white">{activeJob.verificationCode}</strong>
            </span>
            <span
              data-testid="certificate-job-state"
              className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold shrink-0 ${
                activeJob.status === 'COMPLETED'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/70'
                  : 'bg-amber-950/80 text-amber-300 border border-amber-800/70'
              }`}
            >
              {activeJob.status}
            </span>
          </div>

          {/* Pasos de la Cola Asíncrona */}
          <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
            <div
              className={`py-1 rounded border ${
                activeJob.progressPct >= 25
                  ? 'bg-usco-wine/25 border-usco-gold/40 text-usco-gold font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              1. EN COLA
            </div>
            <div
              className={`py-1 rounded border ${
                activeJob.progressPct >= 65
                  ? 'bg-usco-wine/25 border-usco-gold/40 text-usco-gold font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              2. FIRMANDO
            </div>
            <div
              className={`py-1 rounded border ${
                activeJob.status === 'COMPLETED'
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              3. EXPEDIDO
            </div>
          </div>

          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                activeJob.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-usco-gold'
              }`}
              style={{ width: `${activeJob.progressPct}%` }}
            />
          </div>

          <div className="pt-1 space-y-2.5">
            <div className="text-xs text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verificación QR:</span>
              </span>
              <strong className="font-mono text-usco-gold">{activeJob.verificationCode}</strong>
            </div>

            {activeJob.status === 'COMPLETED' && (
              <a
                href={activeJob.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="certificate-download-link"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs transition-colors"
              >
                <FileDown className="w-4 h-4" />
                <span>Abrir Certificado PDF Oficial</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Historial de Certificados Emitidos */}
      <div className="pt-3 border-t border-slate-800/80">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
          Documentos Expedidos Recientemente
        </h3>
        <div className="space-y-2">
          {certificates.map((cert, idx) => {
            const pdfHref = resolveCertificatePdfUrl(cert);
            const isPrimaryLink = !activeJob && idx === 0 && cert.status === 'COMPLETED';
            return (
              <div
                key={cert.id || cert.verificationCode}
                className="p-3 rounded-lg bg-[#070A12] border border-slate-800/90 flex items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-usco-gold shrink-0" />
                  <div className="truncate">
                    <p className="text-xs font-semibold text-white truncate">
                      {cert.certificateType === 'STUDY'
                        ? 'Certificado de Estudio'
                        : cert.certificateType === 'GRADES'
                          ? 'Certificado de Calificaciones'
                          : 'Paz y Salvo Académico'}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">
                      Código {cert.verificationCode}
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
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-usco-gold border border-slate-700 text-xs font-medium transition-colors shrink-0"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-300 font-mono shrink-0">
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
