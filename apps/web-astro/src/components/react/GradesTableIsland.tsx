import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Calculator,
  CheckCircle2,
  Clock,
  GraduationCap,
  RefreshCw,
  Sliders,
  Sparkles,
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

  const loadSummary = async () => {
    setLoading(true);
    try {
      const fresh = await fetchStudentSummary(studentId, token);
      setSummary(fresh);
      $studentSummary.set(fresh);

      const pendingCourse =
        fresh.enrollments.find((e) => e.grade.cut3 === null) || fresh.enrollments[0];
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
      {/* Tabla de Calificaciones Ponderadas 30% / 30% / 40% */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-usco-gold" />
              <h2 className="text-lg font-bold text-white">
                Registro Oficial de Calificaciones Ponderadas (Periodo 2026-2)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Reglamento Estudiantil USCO: Corte 1 (30%) + Corte 2 (30%) + Corte 3 (40%). Nota mínima aprobatoria: 3.00
            </p>
          </div>
          <button
            type="button"
            onClick={loadSummary}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-all self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-usco-gold' : ''}`} />
            <span>Sincronizar Notas</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table
            data-testid="grades-table"
            className="w-full text-left border-collapse text-sm"
            aria-label="Tabla de asignaturas matriculadas y calificaciones"
          >
            <thead>
              <tr className="bg-slate-950/90 text-slate-300 border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="py-3.5 px-4 font-semibold">Código / Asignatura</th>
                <th className="py-3.5 px-3 font-semibold text-center">Créd.</th>
                <th className="py-3.5 px-3 font-semibold text-center">Corte 1 (30%)</th>
                <th className="py-3.5 px-3 font-semibold text-center">Corte 2 (30%)</th>
                <th className="py-3.5 px-3 font-semibold text-center">Corte 3 (40%)</th>
                <th className="py-3.5 px-3 font-semibold text-center">Definitiva</th>
                <th className="py-3.5 px-4 font-semibold text-right">Estado Académico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
              {enrollments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                    {loading
                      ? 'Consultando matrículas activas en PostgreSQL...'
                      : 'No se encontraron asignaturas inscritas en el periodo actual.'}
                  </td>
                </tr>
              ) : (
                enrollments.map((item) => {
                  const g = item.grade;
                  const isPendingCut3 = g.cut3 === null || g.cut3 === undefined;
                  const isSelectedSim = simulatedTarget?.courseCode === item.courseCode;

                  return (
                    <tr
                      key={item.id || item.courseCode}
                      onClick={() => setSelectedCourseCode(item.courseCode)}
                      className={`transition-colors cursor-pointer ${
                        isSelectedSim
                          ? 'bg-usco-wine/15 hover:bg-usco-wine/25'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-usco-wine/30 text-usco-gold border border-usco-gold/30">
                            {item.courseCode}
                          </span>
                          <div>
                            <p className="font-semibold text-white">{item.courseName}</p>
                            <p className="text-xs text-slate-400">
                              {item.groupNumber} · {item.scheduleText}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-slate-300">
                        {item.credits}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-100">
                        {g.cut1 !== null ? g.cut1.toFixed(1) : '—'}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-100">
                        {g.cut2 !== null ? g.cut2.toFixed(1) : '—'}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-semibold">
                        {!isPendingCut3 ? (
                          <span className="text-slate-100">{Number(g.cut3).toFixed(1)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 text-xs">
                            <Clock className="w-3 h-3" /> Pendiente
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg ${
                            g.finalGrade >= 3.0
                              ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60'
                              : 'bg-amber-950/90 text-amber-300 border border-amber-700/60'
                          }`}
                        >
                          {g.finalGrade.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {g.passed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {g.statusText}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-700/60">
                            <Clock className="w-3.5 h-3.5" />
                            Falta {g.requiredCut3ForThree.toFixed(2)} en C3
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
      </div>

      {/* Simulador Interactivo "¿Cuánto necesito sacar en el Corte 3?" */}
      {simulatedTarget && simResult && (
        <div
          data-testid="cut3-simulator-card"
          className="glass-card rounded-2xl p-6 border border-usco-gold/30 bg-gradient-to-br from-slate-900 via-slate-900 to-usco-wine/20"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-usco-wine text-usco-gold shrink-0">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-usco-gold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Simulador Académico Interactivo en Tiempo Real
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  ¿Cuánto necesito sacar en el Corte 3 (40%) para aprobar o subir mi promedio?
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="sim-course-select" className="text-xs text-slate-300 font-semibold">
                Materia:
              </label>
              <select
                id="sim-course-select"
                data-testid="simulator-course-select"
                value={simulatedTarget.courseCode}
                onChange={(e) => setSelectedCourseCode(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-semibold text-white focus:border-usco-gold"
              >
                {enrollments.map((item) => (
                  <option key={item.courseCode} value={item.courseCode}>
                    {item.courseCode} — {item.courseName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5 items-center">
            <div className="md:col-span-7 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Sliders className="w-3.5 h-3.5 text-usco-gold" />
                  Desliza o ingresa tu nota hipotética de Corte 3 (40%):
                </span>
                <span className="font-mono text-base font-bold text-usco-gold">
                  {simulatedCut3.toFixed(2)} / 5.00
                </span>
              </div>

              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  aria-label="Deslizador de nota hipotética para el Corte 3"
                  data-testid="simulator-cut3-slider"
                  value={simulatedCut3}
                  onChange={(e) => setSimulatedCut3(parseFloat(e.target.value) || 0)}
                  className="w-full accent-usco-gold cursor-pointer"
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
                  className="w-20 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-sm font-bold text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <p className="text-[11px] text-slate-400">Corte 1 (30%)</p>
                  <p className="font-mono font-bold text-white text-sm">
                    {(simulatedTarget.grade.cut1 ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <p className="text-[11px] text-slate-400">Corte 2 (30%)</p>
                  <p className="font-mono font-bold text-white text-sm">
                    {(simulatedTarget.grade.cut2 ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <p className="text-[11px] text-slate-400">Acumulado (60%)</p>
                  <p className="font-mono font-bold text-usco-gold text-sm">
                    {simResult.accumulatedGrade.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-5 p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Definitiva Proyectada:</span>
                <span
                  data-testid="simulator-projected-final"
                  className={`font-mono text-xl font-extrabold ${
                    simResult.passed ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {simResult.finalGrade.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-2.5">
                <span className="text-slate-400">Nota mínima requerida en C3 (para 3.00):</span>
                <span className="font-mono font-bold text-usco-gold">
                  {simResult.requiredCut3ForThree <= 0
                    ? '0.00 (Ya aprobada por acumulado)'
                    : simResult.requiredCut3ForThree.toFixed(2)}
                </span>
              </div>

              <div className="text-xs rounded-lg p-2.5 bg-slate-900 border border-slate-800 text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-usco-gold shrink-0" />
                <span>
                  {simResult.requiredCut3ForThree <= 0
                    ? `¡Felicidades! Con tu acumulado de ${simResult.accumulatedGrade.toFixed(2)} ya superaste 3.00.`
                    : `Necesitas al menos ${simResult.requiredCut3ForThree.toFixed(2)} en el Corte 3 para cerrar en 3.00.`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
