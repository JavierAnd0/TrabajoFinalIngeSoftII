import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Calculator,
  CheckCircle2,
  Clock,
  GraduationCap,
  LayoutGrid,
  RefreshCw,
  Sliders,
  Table as TableIcon,
  TrendingUp,
} from 'lucide-react';
import {
  $studentSummary,
  $syncVersion,
  type StudentEnrollmentItem,
  type StudentSummaryData,
} from '../../stores/academicStore';
import { computeGradeFormula, fetchStudentSummary } from '../../services/apiClient';

interface GradesTableIslandProps {
  studentId: string;
  token?: string | null;
  initialSummary?: StudentSummaryData | null;
}

export default function GradesTableIsland({
  studentId,
  token,
  initialSummary,
}: GradesTableIslandProps) {
  const storeSummary = useStore($studentSummary);
  const syncVersion = useStore($syncVersion);

  const [summary, setSummary] = useState<StudentSummaryData | null>(initialSummary || null);
  const [loading, setLoading] = useState<boolean>(!initialSummary);
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('ISW-403');
  const [simulatedCut3, setSimulatedCut3] = useState<number>(3.5);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('cards');
    }
  }, []);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const fresh = await fetchStudentSummary(studentId, token);
      setSummary(fresh);
      $studentSummary.set(fresh);

      const pendingCourse =
        fresh.enrollments.find((e) => e.grade.cut1 !== null && e.grade.cut3 === null) ||
        fresh.enrollments[0];
      if (pendingCourse && !selectedCourseCode) {
        setSelectedCourseCode(pendingCourse.courseCode);
      }
      const pgaEl = document.getElementById('kpi-pga-value');
      if (pgaEl) pgaEl.textContent = fresh.metrics.pga.toFixed(2);
      const creditsEl = document.getElementById('kpi-credits-value');
      if (creditsEl)
        creditsEl.textContent = `${fresh.metrics.enrolledCredits} Créditos (${fresh.metrics.enrolledCoursesCount} Cursos)`;
    } catch {
      if (initialSummary) {
        setSummary(initialSummary);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialSummary && !storeSummary) {
      $studentSummary.set(initialSummary);
    }
  }, [initialSummary]);

  useEffect(() => {
    loadSummary();
  }, [studentId, syncVersion]);

  const enrollments: StudentEnrollmentItem[] =
    (storeSummary?.enrollments?.length ? storeSummary.enrollments : summary?.enrollments) || [];

  const simulatedTarget =
    enrollments.find((e) => e.courseCode === selectedCourseCode) || enrollments[0] || null;

  const simResult = simulatedTarget
    ? computeGradeFormula(
        simulatedTarget.grade.cut1,
        simulatedTarget.grade.cut2,
        simulatedCut3
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Tabla / Tarjetas de Calificaciones Ponderadas 30% / 30% / 40% */}
      <div className="glass-card rounded-xl p-4 sm:p-6 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-usco-gold" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Registro de Calificaciones · Periodo 2026-2
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Ponderación oficial USCO: Corte 1 (30%) · Corte 2 (30%) · Corte 3 (40%). Nota mínima aprobatoria: 3.00
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <div
              role="group"
              aria-label="Modo de visualización de calificaciones"
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

            <button
              type="button"
              onClick={loadSummary}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#070A12] hover:bg-slate-900 text-slate-200 border border-slate-800 text-xs font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-usco-gold' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto rounded-lg border border-slate-800/90">
            <table
              data-testid="grades-table"
              className="w-full text-left border-collapse text-sm min-w-[680px]"
              aria-label="Tabla de asignaturas matriculadas y calificaciones"
            >
              <thead>
                <tr className="bg-[#070A12] text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Asignatura</th>
                  <th className="py-3 px-3 font-semibold text-center">Créd.</th>
                  <th className="py-3 px-3 font-semibold text-center">Corte 1 (30%)</th>
                  <th className="py-3 px-3 font-semibold text-center">Corte 2 (30%)</th>
                  <th className="py-3 px-3 font-semibold text-center">Corte 3 (40%)</th>
                  <th className="py-3 px-3 font-semibold text-center">Acumulado / Def.</th>
                  <th className="py-3 px-4 font-semibold text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-[#0B101D]/60">
                {enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                      {loading
                        ? 'Cargando registro académico del estudiante...'
                        : 'No se encontraron asignaturas inscritas en el periodo actual.'}
                    </td>
                  </tr>
                ) : (
                  enrollments.map((item) => {
                    const g = item.grade;
                    const hasNoGradesYet =
                      g.cut1 === null && g.cut2 === null && g.cut3 === null;
                    const isPendingCut3 = !hasNoGradesYet && (g.cut3 === null || g.cut3 === undefined);
                    const isSelectedSim = simulatedTarget?.courseCode === item.courseCode;
                    const partialAverage =
                      g.cut1 !== null && g.cut2 !== null
                        ? ((g.cut1 + g.cut2) / 2).toFixed(2)
                        : null;

                    return (
                      <tr
                        key={item.id || item.courseCode}
                        onClick={() => setSelectedCourseCode(item.courseCode)}
                        className={`transition-colors cursor-pointer ${
                          isSelectedSim
                            ? 'bg-usco-wine/15 hover:bg-usco-wine/20'
                            : 'hover:bg-slate-900/70'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30 shrink-0">
                              {item.courseCode}
                            </span>
                            <div>
                              <p className="font-semibold text-white leading-snug">{item.courseName}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {item.groupNumber} · {item.scheduleText}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono text-xs text-slate-300">
                          {item.credits}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono text-sm font-medium text-slate-100">
                          {g.cut1 !== null ? g.cut1.toFixed(1) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono text-sm font-medium text-slate-100">
                          {g.cut2 !== null ? g.cut2.toFixed(1) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono text-sm font-medium">
                          {hasNoGradesYet ? (
                            <span className="text-slate-500">—</span>
                          ) : !isPendingCut3 ? (
                            <span className="text-slate-100">{Number(g.cut3).toFixed(1)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60 text-[11px]">
                              <Clock className="w-3 h-3" /> En curso
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {hasNoGradesYet ? (
                            <span className="text-xs font-mono text-slate-500">Sin evaluar</span>
                          ) : isPendingCut3 ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-900 text-usco-gold border border-slate-700">
                                {g.accumulatedGrade.toFixed(2)} / 3.00
                              </span>
                              {partialAverage && (
                                <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  Prom. parcial: {partialAverage}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span
                              className={`inline-block font-mono font-bold text-sm px-2.5 py-0.5 rounded ${
                                g.finalGrade >= 3.0
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/70'
                                  : 'bg-red-950/80 text-red-300 border border-red-800/70'
                              }`}
                            >
                              {g.finalGrade.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {hasNoGradesYet ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800">
                              Inscrita 2026-2
                            </span>
                          ) : g.passed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/70">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aprobada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-medium bg-amber-950/70 text-amber-300 border border-amber-800/60">
                              <Clock className="w-3.5 h-3.5" />
                              Req. {g.requiredCut3ForThree.toFixed(2)} en C3
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* VISTA COMPACTA DE TARJETAS ACADÉMICAS */
          <div data-testid="grades-table" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrollments.map((item) => {
              const g = item.grade;
              const hasNoGradesYet = g.cut1 === null && g.cut2 === null && g.cut3 === null;
              const isPendingCut3 = !hasNoGradesYet && (g.cut3 === null || g.cut3 === undefined);
              const isSelectedSim = simulatedTarget?.courseCode === item.courseCode;

              return (
                <div
                  key={item.id || item.courseCode}
                  onClick={() => setSelectedCourseCode(item.courseCode)}
                  className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                    isSelectedSim
                      ? 'bg-usco-wine/15 border-usco-gold/70'
                      : 'bg-[#070A12] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30">
                          {item.courseCode}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          {item.credits} Créd. · {item.groupNumber}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-1.5">{item.courseName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{item.scheduleText}</p>
                    </div>
                    {hasNoGradesYet ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 text-slate-300 border border-slate-800">
                        Inscrita
                      </span>
                    ) : g.passed ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/70">
                        {g.finalGrade.toFixed(2)}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/70 text-amber-300 border border-amber-800/60">
                        {g.accumulatedGrade.toFixed(2)} / 3.00
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-center">
                    <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                      <p className="text-[10px] text-slate-400">Corte 1 (30%)</p>
                      <p className="font-mono font-semibold text-xs text-white mt-0.5">
                        {g.cut1 !== null ? g.cut1.toFixed(1) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                      <p className="text-[10px] text-slate-400">Corte 2 (30%)</p>
                      <p className="font-mono font-semibold text-xs text-white mt-0.5">
                        {g.cut2 !== null ? g.cut2.toFixed(1) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded bg-[#0D1322] border border-slate-800/80">
                      <p className="text-[10px] text-slate-400">Corte 3 (40%)</p>
                      <p className="font-mono font-semibold text-xs text-usco-gold mt-0.5">
                        {hasNoGradesYet
                          ? '—'
                          : !isPendingCut3
                            ? Number(g.cut3).toFixed(1)
                            : `Req. ${g.requiredCut3ForThree.toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Proyector de Calificación para el Corte 3 (40%) */}
      {simulatedTarget && simResult && (
        <div
          id="simulador"
          data-testid="cut3-simulator-card"
          className="glass-card rounded-xl p-4 sm:p-6 border border-slate-800 min-w-0 max-w-full overflow-hidden"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-slate-800/90 min-w-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-usco-wine/30 text-usco-gold border border-usco-gold/30 shrink-0 mt-0.5">
                <Calculator className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                  Simulador de Nota para el Corte 3 (40%)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selecciona una asignatura o haz clic en cualquier fila para proyectar tu nota definitiva.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full md:w-auto min-w-0">
              <label htmlFor="sim-course-select" className="text-xs text-slate-400 font-medium shrink-0">
                Asignatura:
              </label>
              <select
                id="sim-course-select"
                data-testid="simulator-course-select"
                value={simulatedTarget.courseCode}
                onChange={(e) => setSelectedCourseCode(e.target.value)}
                className="w-full sm:w-auto sm:max-w-[300px] min-w-0 max-w-full truncate px-3 py-2 rounded-lg bg-[#070A12] border border-slate-700/90 text-xs font-medium text-white focus:border-usco-gold focus:outline-none"
              >
                {enrollments.map((item) => (
                  <option key={item.courseCode} value={item.courseCode}>
                    {item.courseCode} — {item.courseName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 pt-5 items-center min-w-0">
            <div className="md:col-span-7 space-y-4 min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span className="flex items-center gap-1.5 font-medium min-w-0">
                  <Sliders className="w-3.5 h-3.5 text-usco-gold shrink-0" />
                  <span className="truncate sm:whitespace-normal">
                    Nota proyectada en Corte 3 (40%):
                  </span>
                </span>
                <span className="font-mono text-sm font-bold text-usco-gold whitespace-nowrap shrink-0">
                  {simulatedCut3.toFixed(2)} / 5.00
                </span>
              </div>

              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  aria-label="Deslizador de nota hipotética para el Corte 3"
                  data-testid="simulator-cut3-slider"
                  value={simulatedCut3}
                  onChange={(e) => setSimulatedCut3(parseFloat(e.target.value) || 0)}
                  className="w-full min-w-0 flex-1 accent-usco-gold cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  aria-label="Nota numérica hipotética para el Corte 3"
                  data-testid="simulator-cut3-input"
                  value={simulatedCut3}
                  onChange={(e) => {
                    const val = Math.min(5, Math.max(0, parseFloat(e.target.value) || 0));
                    setSimulatedCut3(val);
                  }}
                  className="w-16 sm:w-20 shrink-0 px-2 py-1.5 rounded-lg bg-[#070A12] border border-slate-700 text-center font-mono text-sm font-bold text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5 text-center pt-1">
                <div className="p-2 sm:p-2.5 rounded-lg bg-[#070A12] border border-slate-800/90 flex flex-col justify-between">
                  <p className="text-[10px] sm:text-[11px] text-slate-400">Corte 1 (30%)</p>
                  <p className="font-mono font-semibold text-white text-xs sm:text-sm mt-1">
                    {(simulatedTarget.grade.cut1 ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-2 sm:p-2.5 rounded-lg bg-[#070A12] border border-slate-800/90 flex flex-col justify-between">
                  <p className="text-[10px] sm:text-[11px] text-slate-400">Corte 2 (30%)</p>
                  <p className="font-mono font-semibold text-white text-xs sm:text-sm mt-1">
                    {(simulatedTarget.grade.cut2 ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-2 sm:p-2.5 rounded-lg bg-[#070A12] border border-slate-800/90 flex flex-col justify-between">
                  <p className="text-[10px] sm:text-[11px] text-slate-400">Acum. (60%)</p>
                  <p className="font-mono font-semibold text-usco-gold text-xs sm:text-sm mt-1">
                    {simResult.accumulatedGrade.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-5 p-4 rounded-lg bg-[#070A12] border border-slate-800/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Definitiva Proyectada:</span>
                <span
                  data-testid="simulator-projected-final"
                  className={`font-mono text-xl font-bold ${
                    simResult.passed ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {simResult.finalGrade.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-t border-slate-800/90 pt-2.5">
                <span className="text-slate-400">Mínimo requerido en C3 (para 3.00):</span>
                <span className="font-mono font-semibold text-usco-gold">
                  {simResult.requiredCut3ForThree <= 0
                    ? '0.00 (Aprobada)'
                    : simResult.requiredCut3ForThree > 5
                      ? 'Sin notas previas'
                      : simResult.requiredCut3ForThree.toFixed(2)}
                </span>
              </div>

              <div className="text-xs rounded-lg p-2.5 bg-slate-900/80 border border-slate-800 text-slate-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-usco-gold shrink-0" />
                <span>
                  {simResult.requiredCut3ForThree <= 0
                    ? `Con tu acumulado de ${simResult.accumulatedGrade.toFixed(2)} ya superaste el mínimo de 3.00.`
                    : simResult.requiredCut3ForThree > 5
                      ? 'Asignatura recién inscrita pendiente de calificaciones en Cortes 1 y 2.'
                      : `Necesitas obtener mínimo ${simResult.requiredCut3ForThree.toFixed(2)} en el Corte 3 para aprobar con 3.00.`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
