import React, { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  CheckCircle2,
  Cpu,
  Edit3,
  Filter,
  RefreshCw,
  Save,
  Server,
  AlertCircle,
} from 'lucide-react';
import {
  computeGradeFormula,
  fetchAdminEnrollments,
  fetchCampusesStats,
  fetchWorkerQueueMetrics,
  updateStudentGrade,
  type WorkerQueueMetrics,
} from '../../services/apiClient';
import type { AdminEnrollmentRecord, CampusStatItem } from '../../stores/academicStore';

interface AdminMultiCampusIslandProps {
  token?: string | null;
  userRole: string;
  initialCampuses?: CampusStatItem[];
  initialEnrollments?: AdminEnrollmentRecord[];
  initialQueueMetrics?: WorkerQueueMetrics | null;
}

export default function AdminMultiCampusIsland({
  token,
  userRole,
  initialCampuses = [],
  initialEnrollments = [],
  initialQueueMetrics = null,
}: AdminMultiCampusIslandProps) {
  const [campuses, setCampuses] = useState<CampusStatItem[]>(initialCampuses);
  const [enrollments, setEnrollments] = useState<AdminEnrollmentRecord[]>(initialEnrollments);
  const [queueMetrics, setQueueMetrics] = useState<WorkerQueueMetrics | null>(
    initialQueueMetrics
  );
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string>('ALL');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadAllAdminData = async () => {
    setLoading(true);
    try {
      const [campusesData, enrollmentsData, workerData] = await Promise.allSettled([
        fetchCampusesStats(token),
        fetchAdminEnrollments(token),
        fetchWorkerQueueMetrics(),
      ]);

      if (campusesData.status === 'fulfilled' && campusesData.value.length > 0) {
        setCampuses(campusesData.value);
      }
      if (enrollmentsData.status === 'fulfilled' && enrollmentsData.value.length > 0) {
        setEnrollments(enrollmentsData.value);
      }
      if (workerData.status === 'fulfilled') {
        setQueueMetrics(workerData.value);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
    const interval = setInterval(async () => {
      try {
        const metrics = await fetchWorkerQueueMetrics();
        setQueueMetrics(metrics);
      } catch {
        // Silencioso si el worker está reiniciando
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFieldChange = (
    enrollmentId: string,
    field: 'cut1' | 'cut2' | 'cut3' | 'observations',
    rawValue: string
  ) => {
    setEnrollments((prev) =>
      prev.map((row) => {
        if (row.enrollmentId !== enrollmentId) return row;

        if (field === 'observations') {
          return { ...row, observations: rawValue };
        }

        const numVal =
          rawValue.trim() === ''
            ? null
            : Math.min(5.0, Math.max(0.0, Number(parseFloat(rawValue).toFixed(2))));

        const updatedRow = {
          ...row,
          [field]: Number.isNaN(numVal as number) ? null : numVal,
        };
        const calc = computeGradeFormula(updatedRow.cut1, updatedRow.cut2, updatedRow.cut3);
        return {
          ...updatedRow,
          finalGrade: calc.finalGrade,
          passed: calc.passed,
          statusText: calc.statusText,
        };
      })
    );
  };

  const handleSaveGrade = async (row: AdminEnrollmentRecord) => {
    setFeedback(null);
    setSavingId(row.enrollmentId);
    try {
      await updateStudentGrade({
        enrollmentId: row.enrollmentId,
        cut1: row.cut1,
        cut2: row.cut2,
        cut3: row.cut3,
        observations: row.observations,
        token,
      });

      setFeedback({
        type: 'success',
        text: `Calificación guardada para ${row.studentName} en ${row.courseCode} (${row.campusCode}). Definitiva recalculada: ${row.finalGrade.toFixed(2)}`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al actualizar calificación en el servicio Core Academic.';
      setFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setSavingId(null);
    }
  };

  const filteredEnrollments =
    selectedCampusFilter === 'ALL'
      ? enrollments
      : enrollments.filter((e) => e.campusCode === selectedCampusFilter);

  return (
    <div className="space-y-8">
      {/* 1. Vista Consolidada de las 4 Sedes Universitarias */}
      <section aria-label="Métricas Regionales de las 4 Sedes USCO">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-usco-gold" />
              Consolidado Multi-Sede Universidad Surcolombiana (4 Nodos Regionales)
            </h2>
            <p className="text-xs text-slate-400">
              Haz clic en una sede para filtrar el registro de matrículas y calificaciones en vivo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCampusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                selectedCampusFilter === 'ALL'
                  ? 'bg-usco-wine text-white border-usco-gold'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              Todas las Sedes (4)
            </button>
            <button
              type="button"
              onClick={loadAllAdminData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-usco-gold' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {campuses.map((campus) => {
            const isSelected = selectedCampusFilter === campus.code;
            return (
              <button
                key={campus.id || campus.code}
                type="button"
                data-testid={`campus-card-${campus.code}`}
                onClick={() =>
                  setSelectedCampusFilter(isSelected ? 'ALL' : campus.code)
                }
                className={`text-left p-5 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-usco-wine/25 border-usco-gold shadow-xl'
                    : 'glass-card border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-usco-wine/40 text-usco-gold border border-usco-gold/30">
                    SEDE {campus.code}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Online
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">{campus.city}</h3>
                <p className="text-xs text-slate-400 truncate mt-0.5">{campus.name}</p>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-center">
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Estudiantes</p>
                    <p className="font-mono font-bold text-sm text-white">
                      {campus.studentsCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Secciones</p>
                    <p className="font-mono font-bold text-sm text-white">
                      {campus.activeSectionsCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Promedio</p>
                    <p className="font-mono font-bold text-sm text-usco-gold">
                      {campus.averageGrade.toFixed(2)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Monitor en Tiempo Real de Colas Redis / BullMQ (Puerto 4002) */}
      <section
        aria-label="Monitor en Tiempo Real de Colas Redis y BullMQ"
        className="glass-card rounded-2xl p-6 border border-slate-800"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-usco-gold" />
            <div>
              <h2 className="text-base font-bold text-white">
                Monitor en Tiempo Real de Colas Asíncronas Redis / BullMQ (Worker :4002)
              </h2>
              <p className="text-xs text-slate-400">
                Telemetría de trabajos en segundo plano: generación criptográfica de PDFs y notificaciones.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700/60 self-start">
            <Cpu className="w-3.5 h-3.5" />
            {queueMetrics?.redisConnected !== false ? 'Redis / BullMQ Conectado' : 'Modo Local'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            data-testid="queue-card-certificates"
            className="p-4 rounded-xl bg-slate-950/90 border border-slate-800"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold text-usco-gold">
                COLA: certificatePdfQueue
              </span>
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" /> Latencia Media:{' '}
                {queueMetrics?.certificatePdfQueue.avgProcessingTimeMs ?? 142} ms
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">En Cola</p>
                <p className="font-mono font-bold text-white">
                  {queueMetrics?.certificatePdfQueue.waiting ?? 0}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">Activos</p>
                <p className="font-mono font-bold text-amber-300">
                  {queueMetrics?.certificatePdfQueue.active ?? 0}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">Completados</p>
                <p className="font-mono font-bold text-emerald-400">
                  {queueMetrics?.certificatePdfQueue.completed ?? 2}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">Fallidos</p>
                <p className="font-mono font-bold text-red-400">
                  {queueMetrics?.certificatePdfQueue.failed ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div
            data-testid="queue-card-notifications"
            className="p-4 rounded-xl bg-slate-950/90 border border-slate-800"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold text-usco-gold">
                COLA: notificationQueue
              </span>
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" /> Latencia Media:{' '}
                {queueMetrics?.notificationQueue.avgProcessingTimeMs ?? 38} ms
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">En Cola</p>
                <p className="font-mono font-bold text-white">
                  {queueMetrics?.notificationQueue.waiting ?? 0}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">Activos</p>
                <p className="font-mono font-bold text-amber-300">
                  {queueMetrics?.notificationQueue.active ?? 0}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">Completados</p>
                <p className="font-mono font-bold text-emerald-400">
                  {queueMetrics?.notificationQueue.completed ?? 4}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-[10px] text-slate-400">Fallidos</p>
                <p className="font-mono font-bold text-red-400">
                  {queueMetrics?.notificationQueue.failed ?? 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Editor de Calificaciones en Vivo Multi-Sede */}
      <section
        aria-label="Editor de Calificaciones Ponderadas en Vivo"
        className="glass-card rounded-2xl p-6 border border-slate-800"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-usco-gold" />
              <h2 className="text-lg font-bold text-white">
                Editor de Calificaciones en Vivo ({userRole === 'ADMIN' ? 'Acceso Global Multi-Sede' : 'Rol Docente'})
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Modifica los Cortes 1 (30%), 2 (30%) y 3 (40%) y guarda directamente contra `PUT /api/v1/grades`.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-usco-gold" />
            <select
              aria-label="Filtrar matrículas por sede"
              data-testid="admin-campus-filter-select"
              value={selectedCampusFilter}
              onChange={(e) => setSelectedCampusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-semibold text-white"
            >
              <option value="ALL">Todas las Sedes (NEI, PIT, GAR, LPL)</option>
              <option value="NEI">Sede Central Neiva (NEI)</option>
              <option value="PIT">Sede Regional Pitalito (PIT)</option>
              <option value="GAR">Sede Regional Garzón (GAR)</option>
              <option value="LPL">Sede Regional La Plata (LPL)</option>
            </select>
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            data-testid="admin-grade-save-feedback"
            className={`mb-4 p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                : 'bg-red-950/80 border-red-700 text-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table
            data-testid="admin-grades-editor-table"
            className="w-full text-left border-collapse text-sm"
          >
            <thead>
              <tr className="bg-slate-950/90 text-slate-300 border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="py-3.5 px-4 font-semibold">Sede</th>
                <th className="py-3.5 px-4 font-semibold">Estudiante</th>
                <th className="py-3.5 px-4 font-semibold">Asignatura</th>
                <th className="py-3.5 px-2 font-semibold text-center">Corte 1 (30%)</th>
                <th className="py-3.5 px-2 font-semibold text-center">Corte 2 (30%)</th>
                <th className="py-3.5 px-2 font-semibold text-center">Corte 3 (40%)</th>
                <th className="py-3.5 px-3 font-semibold text-center">Definitiva</th>
                <th className="py-3.5 px-4 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
              {filteredEnrollments.map((row) => {
                const isSaving = savingId === row.enrollmentId;
                return (
                  <tr key={row.enrollmentId} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-usco-wine/40 text-usco-gold border border-usco-gold/30">
                        {row.campusCode}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-white">{row.studentName}</p>
                      <p className="text-xs font-mono text-slate-400">
                        Cód. {row.studentCode || 'N/A'}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-100">
                        {row.courseCode} — {row.courseName}
                      </p>
                      <p className="text-xs text-slate-400">{row.groupNumber}</p>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        aria-label={`Corte 1 de ${row.studentName} en ${row.courseCode}`}
                        data-testid={`grade-input-c1-${row.enrollmentId}`}
                        value={row.cut1 ?? ''}
                        onChange={(e) =>
                          handleFieldChange(row.enrollmentId, 'cut1', e.target.value)
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-xs text-white focus:border-usco-gold"
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        aria-label={`Corte 2 de ${row.studentName} en ${row.courseCode}`}
                        data-testid={`grade-input-c2-${row.enrollmentId}`}
                        value={row.cut2 ?? ''}
                        onChange={(e) =>
                          handleFieldChange(row.enrollmentId, 'cut2', e.target.value)
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-xs text-white focus:border-usco-gold"
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        placeholder="Pend."
                        aria-label={`Corte 3 de ${row.studentName} en ${row.courseCode}`}
                        data-testid={`grade-input-c3-${row.enrollmentId}`}
                        value={row.cut3 ?? ''}
                        onChange={(e) =>
                          handleFieldChange(row.enrollmentId, 'cut3', e.target.value)
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-xs text-white focus:border-usco-gold"
                      />
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block font-mono font-bold text-xs px-2.5 py-1 rounded-lg ${
                          row.finalGrade >= 3.0
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                            : 'bg-red-950 text-red-300 border border-red-700/60'
                        }`}
                      >
                        {row.finalGrade.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        data-testid={`save-grade-btn-${row.enrollmentId}`}
                        disabled={isSaving}
                        onClick={() => handleSaveGrade(row)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-usco-wine hover:bg-usco-wineLight text-white border border-usco-gold/40 text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5 text-usco-gold" />
                        <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
