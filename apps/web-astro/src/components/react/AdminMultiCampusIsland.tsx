import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Edit3,
  Filter,
  Users,
  BookOpen,
  RefreshCw,
  Save,
  Server,
  AlertCircle,
  LayoutGrid,
  Table as TableIcon,
  Search,
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
  userCampusCode?: string;
  userFullName?: string;
  initialCampuses?: CampusStatItem[];
  initialEnrollments?: AdminEnrollmentRecord[];
  initialQueueMetrics?: WorkerQueueMetrics | null;
}

export default function AdminMultiCampusIsland({
  token,
  userRole,
  userCampusCode = 'NEI',
  userFullName = '',
  initialCampuses = [],
  initialEnrollments = [],
  initialQueueMetrics = null,
}: AdminMultiCampusIslandProps) {
  const isTeacherOnly = userRole === 'TEACHER';
  const CAMPUS_FULL_NAMES: Record<string, string> = {
    NEI: 'Sede Central Neiva',
    PIT: 'Sede Pitalito',
    GAR: 'Sede Garzón',
    LPL: 'Sede La Plata',
  };

  const [campuses, setCampuses] = useState<CampusStatItem[]>(initialCampuses);
  const [enrollments, setEnrollments] = useState<AdminEnrollmentRecord[]>(initialEnrollments);
  const [queueMetrics, setQueueMetrics] = useState<WorkerQueueMetrics | null>(
    initialQueueMetrics
  );
  // El backend ya devuelve al docente solo las matrículas de sus grupos (que pueden estar
  // en varias sedes): en el cliente no se filtra por sede para los docentes.
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Últimos valores confirmados por el servidor: permiten saber qué filas tienen cambios sin guardar.
  const snapshotOf = (rows: AdminEnrollmentRecord[]) =>
    Object.fromEntries(
      rows.map((r) => [r.enrollmentId, JSON.stringify([r.cut1, r.cut2, r.cut3, r.observations ?? ''])])
    );
  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, string>>(() =>
    snapshotOf(initialEnrollments)
  );
  const isDirty = (row: AdminEnrollmentRecord) =>
    savedSnapshot[row.enrollmentId] !==
    JSON.stringify([row.cut1, row.cut2, row.cut3, row.observations ?? '']);
  const dirtyCount = enrollments.filter(isDirty).length;

  // En pantallas móviles se activa por defecto la vista de tarjetas
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('cards');
    }
  }, []);

  // Evita perder notas escritas y no guardadas al cerrar o recargar la página.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

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
      if (enrollmentsData.status === 'fulfilled') {
        setEnrollments(enrollmentsData.value);
        setSavedSnapshot(snapshotOf(enrollmentsData.value));
      } else {
        setFeedback({ type: 'error', text: enrollmentsData.reason?.message || 'No se pudo cargar la planilla.' });
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
        // Mantiene métricas actuales
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

      setSavedSnapshot((prev) => ({
        ...prev,
        [row.enrollmentId]: JSON.stringify([row.cut1, row.cut2, row.cut3, row.observations ?? '']),
      }));
      setFeedback({
        type: 'success',
        text: `Notas guardadas: ${row.studentName} · ${row.courseCode}. Definitiva actual ${row.finalGrade.toFixed(2)}.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al actualizar calificación en el servicio académico.';
      setFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setSavingId(null);
    }
  };

  // Aislamiento de datos: el servidor ya limita al docente a sus grupos;
  // el ADMIN puede filtrar cualquiera de las 4 sedes o ver todas.
  const effectiveCampusFilter = isTeacherOnly ? 'ALL' : selectedCampusFilter;
  const visibleCampuses = campuses;

  // Resumen de los grupos del docente, calculado desde sus propias matrículas.
  const teacherSummary = useMemo(() => {
    const groups = new Set(enrollments.map((e) => `${e.courseCode}-${e.groupNumber}`));
    const students = new Set(enrollments.map((e) => e.studentCode || e.studentName));
    const closed = enrollments.filter((e) => e.cut3 !== null && e.cut3 !== undefined);
    const pendingCut3 = enrollments.length - closed.length;
    const avg = closed.length
      ? closed.reduce((acc, e) => acc + e.finalGrade, 0) / closed.length
      : null;
    return { groups: groups.size, students: students.size, pendingCut3, avg };
  }, [enrollments]);

  const filteredEnrollments = enrollments.filter((e) => {
    const matchesCampus =
      effectiveCampusFilter === 'ALL' ? true : e.campusCode === effectiveCampusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      e.studentName.toLowerCase().includes(q) ||
      (e.studentCode || '').toLowerCase().includes(q) ||
      e.courseCode.toLowerCase().includes(q) ||
      e.courseName.toLowerCase().includes(q);
    return matchesCampus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* 1. Docente: resumen de sus grupos · Admin: sedes regionales */}
      {isTeacherOnly ? (
        <section aria-label="Resumen de mis grupos" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: <BookOpen className="w-4 h-4" />, label: 'Grupos a cargo', value: String(teacherSummary.groups) },
            { icon: <Users className="w-4 h-4" />, label: 'Estudiantes', value: String(teacherSummary.students) },
            { icon: <Edit3 className="w-4 h-4" />, label: 'Corte 3 por registrar', value: String(teacherSummary.pendingCut3) },
            {
              icon: <CheckCircle2 className="w-4 h-4" />,
              label: 'Promedio de definitivas',
              value: teacherSummary.avg === null ? '—' : teacherSummary.avg.toFixed(2),
            },
          ].map((kpi) => (
            <div key={kpi.label} className="glass-card rounded-xl p-4 border border-slate-800">
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="text-usco-gold">{kpi.icon}</span>
                {kpi.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </section>
      ) : (
      <section id="sedes" aria-label="Métricas Regionales de Sedes USCO">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-usco-gold" />
              Sedes regionales
            </h2>
            <p className="text-xs text-slate-400">
              Selecciona una sede para filtrar la planilla de estudiantes y asignaturas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={() => setSelectedCampusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  selectedCampusFilter === 'ALL'
                    ? 'bg-usco-wine text-white border-usco-gold/40'
                    : 'bg-[#0D1322] text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Todas las sedes
              </button>
            <button
              type="button"
              onClick={loadAllAdminData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1322] hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-usco-gold' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        <div
          className={`grid grid-cols-1 ${
            isTeacherOnly ? 'md:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-4'
          } gap-4`}
        >
          {visibleCampuses.map((campus) => {
            const isSelected = effectiveCampusFilter === campus.code;
            return (
              <button
                key={campus.id || campus.code}
                type="button"
                data-testid={`campus-card-${campus.code}`}
                onClick={() => {
                  if (!isTeacherOnly) {
                    setSelectedCampusFilter(isSelected ? 'ALL' : campus.code);
                  }
                }}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-usco-wine/20 border-usco-gold/80'
                    : 'glass-card border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30">
                    {CAMPUS_FULL_NAMES[campus.code] || campus.code}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Activa
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">{campus.city}</h3>
                <p className="text-xs text-slate-400 truncate mt-0.5">{campus.name}</p>

                <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-slate-800/80 text-center">
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Estudiantes</p>
                    <p className="font-mono font-bold text-xs text-white mt-0.5">
                      {campus.studentsCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Grupos</p>
                    <p className="font-mono font-bold text-xs text-white mt-0.5">
                      {campus.activeSectionsCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Promedio</p>
                    <p className="font-mono font-bold text-xs text-usco-gold mt-0.5">
                      {campus.averageGrade.toFixed(2)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      )}

      {/* 2. Planilla de Calificaciones con Buscador y Selector de Vista (Tabla vs Tarjetas Compactas) */}
      <section
        id="planilla"
        aria-label="Editor de Calificaciones Ponderadas en Vivo"
        className="glass-card rounded-xl p-4 sm:p-6 border border-slate-800"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-usco-gold" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {isTeacherOnly ? 'Planilla de notas' : 'Planilla consolidada de calificaciones'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Escala 0.0 a 5.0 · Corte 1 (30 %), Corte 2 (30 %), Corte 3 (40 %). Guarda cada fila al terminar.
            </p>
            {dirtyCount > 0 && (
              <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <AlertCircle className="w-3.5 h-3.5" />
                {dirtyCount === 1 ? '1 fila con cambios sin guardar' : `${dirtyCount} filas con cambios sin guardar`}
              </p>
            )}
          </div>

          {/* Barra de Herramientas UX: Buscador + Filtro Sede (solo Admin) + Conmutador Vista */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:flex-initial min-w-[190px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar estudiante o código..."
                aria-label="Buscar estudiante o asignatura"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#070A12] border border-slate-700/90 text-xs text-white placeholder-slate-500 focus:border-usco-gold focus:outline-none"
              />
            </div>

            {!isTeacherOnly && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                <Filter className="w-3.5 h-3.5 text-usco-gold shrink-0" />
                <select
                  aria-label="Filtrar matrículas por sede"
                  data-testid="admin-campus-filter-select"
                  value={selectedCampusFilter}
                  onChange={(e) => setSelectedCampusFilter(e.target.value)}
                  className="w-full sm:w-auto min-w-0 max-w-full truncate px-3 py-1.5 rounded-lg bg-[#070A12] border border-slate-700/90 text-xs font-medium text-white focus:border-usco-gold focus:outline-none"
                >
                  <option value="ALL">Todas las Sedes (NEI, PIT, GAR, LPL)</option>
                  <option value="NEI">Sede Central Neiva (NEI)</option>
                  <option value="PIT">Sede Regional Pitalito (PIT)</option>
                  <option value="GAR">Sede Regional Garzón (GAR)</option>
                  <option value="LPL">Sede Regional La Plata (LPL)</option>
                </select>
              </div>
            )}

            {isTeacherOnly && (
              <button
                type="button"
                onClick={loadAllAdminData}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1322] hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-medium transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-usco-gold' : ''}`} />
                <span>Actualizar</span>
              </button>
            )}

            {/* Conmutador de Vista: Tabla Completa vs. Vista Rápida de Tarjetas */}
            <div
              role="group"
              aria-label="Modo de visualización de planilla"
              className="inline-flex rounded-lg bg-[#070A12] p-0.5 border border-slate-800"
            >
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-usco-wine text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Tabla</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-usco-wine text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Tarjetas</span>
              </button>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            data-testid="admin-grade-save-feedback"
            className={`mb-4 p-3.5 rounded-lg border text-xs flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
                : 'bg-red-950/80 border-red-800 text-red-200'
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

        {filteredEnrollments.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-lg">
            {searchQuery
              ? `Ningún estudiante o asignatura coincide con “${searchQuery}”.`
              : isTeacherOnly
                ? 'No tienes matrículas asignadas en este periodo.'
                : 'No hay matrículas para la sede seleccionada.'}
          </div>
        ) : /* MODO 1: TABLA COMPLETA RESPONSIVE */
        viewMode === 'table' ? (
          <div className="overflow-x-auto rounded-lg border border-slate-800/90">
            <table
              data-testid="admin-grades-editor-table"
              className="w-full text-left border-collapse text-sm min-w-[720px]"
            >
              <thead>
                <tr className="bg-[#070A12] text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Sede</th>
                  <th className="py-3 px-4 font-semibold">Estudiante</th>
                  <th className="py-3 px-4 font-semibold">Asignatura</th>
                  <th className="py-3 px-2 font-semibold text-center">Corte 1 (30%)</th>
                  <th className="py-3 px-2 font-semibold text-center">Corte 2 (30%)</th>
                  <th className="py-3 px-2 font-semibold text-center">Corte 3 (40%)</th>
                  <th className="py-3 px-3 font-semibold text-center">Acum. / Def.</th>
                  <th className="py-3 px-4 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-[#0B101D]/60">
                {filteredEnrollments.map((row) => {
                  const isSaving = savingId === row.enrollmentId;
                  const isPendingC3 = row.cut3 === null || row.cut3 === undefined;
                  const dirty = isDirty(row);
                  return (
                    <tr
                      key={row.enrollmentId}
                      className={`hover:bg-slate-900/70 ${dirty ? 'bg-amber-950/20 shadow-[inset_3px_0_0_0_rgb(251_191_36)]' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30">
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
                          className="w-16 px-2 py-1 rounded-md bg-[#070A12] border border-slate-700 text-center font-mono text-xs text-white focus:border-usco-gold focus:outline-none"
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
                          className="w-16 px-2 py-1 rounded-md bg-[#070A12] border border-slate-700 text-center font-mono text-xs text-white focus:border-usco-gold focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max="5"
                          step="0.1"
                          placeholder="—"
                          aria-label={`Corte 3 de ${row.studentName} en ${row.courseCode}`}
                          data-testid={`grade-input-c3-${row.enrollmentId}`}
                          value={row.cut3 ?? ''}
                          onChange={(e) =>
                            handleFieldChange(row.enrollmentId, 'cut3', e.target.value)
                          }
                          className="w-16 px-2 py-1 rounded-md bg-[#070A12] border border-slate-700 text-center font-mono text-xs text-white placeholder-slate-500 focus:border-usco-gold focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isPendingC3 ? (
                          <span className="inline-block font-mono font-semibold text-xs px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800/60">
                            {row.finalGrade.toFixed(2)} (60%)
                          </span>
                        ) : (
                          <span
                            className={`inline-block font-mono font-bold text-xs px-2.5 py-0.5 rounded ${
                              row.finalGrade >= 3.0
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/70'
                                : 'bg-red-950/80 text-red-300 border border-red-800/70'
                            }`}
                          >
                            {row.finalGrade.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          data-testid={`save-grade-btn-${row.enrollmentId}`}
                          disabled={isSaving || !dirty}
                          onClick={() => handleSaveGrade(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-usco-wine hover:bg-usco-wineLight text-white border border-usco-gold/30 text-xs font-semibold transition-colors disabled:bg-transparent disabled:text-slate-500 disabled:border-slate-800 disabled:cursor-default"
                        >
                          {dirty || isSaving ? (
                            <Save className="w-3.5 h-3.5 text-usco-gold" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>{isSaving ? 'Guardando…' : dirty ? 'Guardar' : 'Guardado'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* MODO 2: VISTA COMPACTA DE TARJETAS PARA GESTIÓN RÁPIDA Y MÓVIL */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEnrollments.map((row) => {
              const isSaving = savingId === row.enrollmentId;
              const isPendingC3 = row.cut3 === null || row.cut3 === undefined;
              const dirty = isDirty(row);
              return (
                <div
                  key={row.enrollmentId}
                  className={`p-4 rounded-xl bg-[#070A12] border space-y-3 ${dirty ? 'border-amber-500/60' : 'border-slate-800'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30">
                          {row.campusCode}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          {row.courseCode} · {row.groupNumber}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-1">{row.studentName}</h3>
                      <p className="text-xs text-slate-400">{row.courseName}</p>
                    </div>
                    <span
                      className={`font-mono font-bold text-xs px-2.5 py-1 rounded ${
                        isPendingC3
                          ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
                          : row.finalGrade >= 3.0
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/70'
                            : 'bg-red-950/80 text-red-300 border border-red-800/70'
                      }`}
                    >
                      {isPendingC3
                        ? `${row.finalGrade.toFixed(2)} (60%)`
                        : row.finalGrade.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
                    <div>
                      <label
                        htmlFor={`card-c1-${row.enrollmentId}`}
                        className="block text-[10px] text-slate-400 mb-1"
                      >
                        Corte 1 (30%)
                      </label>
                      <input
                        id={`card-c1-${row.enrollmentId}`}
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={row.cut1 ?? ''}
                        onChange={(e) =>
                          handleFieldChange(row.enrollmentId, 'cut1', e.target.value)
                        }
                        className="w-full px-2 py-1.5 rounded bg-[#0D1322] border border-slate-700 text-center font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`card-c2-${row.enrollmentId}`}
                        className="block text-[10px] text-slate-400 mb-1"
                      >
                        Corte 2 (30%)
                      </label>
                      <input
                        id={`card-c2-${row.enrollmentId}`}
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={row.cut2 ?? ''}
                        onChange={(e) =>
                          handleFieldChange(row.enrollmentId, 'cut2', e.target.value)
                        }
                        className="w-full px-2 py-1.5 rounded bg-[#0D1322] border border-slate-700 text-center font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`card-c3-${row.enrollmentId}`}
                        className="block text-[10px] text-slate-400 mb-1"
                      >
                        Corte 3 (40%)
                      </label>
                      <input
                        id={`card-c3-${row.enrollmentId}`}
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        placeholder="—"
                        value={row.cut3 ?? ''}
                        onChange={(e) =>
                          handleFieldChange(row.enrollmentId, 'cut3', e.target.value)
                        }
                        className="w-full px-2 py-1.5 rounded bg-[#0D1322] border border-slate-700 text-center font-mono text-xs text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSaving || !dirty}
                    onClick={() => handleSaveGrade(row)}
                    className="w-full py-2 px-3 rounded-lg bg-usco-wine hover:bg-usco-wineLight text-white border border-usco-gold/30 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:bg-transparent disabled:text-slate-500 disabled:border-slate-800"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Guardando…' : dirty ? 'Guardar calificación' : 'Sin cambios'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Solicitudes en proceso (solo Dirección de Registro y Control) */}
      {!isTeacherOnly && (
      <section
        id="colas"
        aria-label="Solicitudes en proceso"
        className="glass-card rounded-xl p-5 border border-slate-800"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-usco-gold" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Solicitudes de certificados y notificaciones
              </h2>
            </div>
          </div>
          {(() => {
            const down = !queueMetrics || queueMetrics.status === 'unreachable';
            const degraded = !down && queueMetrics.redisConnected === false;
            const tone = down
              ? 'text-red-300 bg-red-950/70 border-red-800/60'
              : degraded
                ? 'text-amber-300 bg-amber-950/70 border-amber-800/60'
                : 'text-emerald-300 bg-emerald-950/70 border-emerald-800/60';
            const dot = down ? 'bg-red-400' : degraded ? 'bg-amber-400' : 'bg-emerald-400';
            return (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] border self-start ${tone}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {down ? 'Servicio de certificados sin respuesta' : degraded ? 'Cola sin Redis (modo respaldo)' : 'Al día'}
              </span>
            );
          })()}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            data-testid="queue-card-certificates"
            className="p-3.5 rounded-lg bg-[#070A12] border border-slate-800/90"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-200">
                Certificados
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">En espera</p>
                <p className="font-mono font-semibold text-xs text-white mt-0.5">
                  {queueMetrics?.certificatePdfQueue.waiting ?? 0}
                </p>
              </div>
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">En curso</p>
                <p className="font-mono font-semibold text-xs text-amber-300 mt-0.5">
                  {queueMetrics?.certificatePdfQueue.active ?? 0}
                </p>
              </div>
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">Expedidos</p>
                <p className="font-mono font-semibold text-xs text-emerald-400 mt-0.5">
                  {queueMetrics?.certificatePdfQueue.completed ?? 0}
                </p>
              </div>
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">Fallidos</p>
                <p className="font-mono font-semibold text-xs text-slate-400 mt-0.5">
                  {queueMetrics?.certificatePdfQueue.failed ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div
            data-testid="queue-card-notifications"
            className="p-3.5 rounded-lg bg-[#070A12] border border-slate-800/90"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-200">
                Notificaciones a estudiantes
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">En espera</p>
                <p className="font-mono font-semibold text-xs text-white mt-0.5">
                  {queueMetrics?.notificationQueue.waiting ?? 0}
                </p>
              </div>
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">En curso</p>
                <p className="font-mono font-semibold text-xs text-amber-300 mt-0.5">
                  {queueMetrics?.notificationQueue.active ?? 0}
                </p>
              </div>
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">Enviadas</p>
                <p className="font-mono font-semibold text-xs text-emerald-400 mt-0.5">
                  {queueMetrics?.notificationQueue.completed ?? 0}
                </p>
              </div>
              <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                <p className="text-[10px] text-slate-400">Fallidas</p>
                <p className="font-mono font-semibold text-xs text-slate-400 mt-0.5">
                  {queueMetrics?.notificationQueue.failed ?? 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
