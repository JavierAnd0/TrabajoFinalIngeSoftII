import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  BookPlus,
  Calendar,
  CheckCircle2,
  MapPin,
  PlusCircle,
  UserCheck,
  Users,
  AlertCircle,
} from 'lucide-react';
import {
  $availableSections,
  $syncVersion,
  triggerAcademicSync,
  type CourseSectionItem,
} from '../../stores/academicStore';
import { enrollStudentInSection, fetchOpenSections } from '../../services/apiClient';

interface CourseEnrollmentIslandProps {
  studentId: string;
  campusId: string;
  token?: string | null;
  initialSections?: CourseSectionItem[];
}

export default function CourseEnrollmentIsland({
  studentId,
  campusId,
  token,
  initialSections = [],
}: CourseEnrollmentIslandProps) {
  const syncVersion = useStore($syncVersion);
  const [sections, setSections] = useState<CourseSectionItem[]>(initialSections);
  const [loading, setLoading] = useState<boolean>(initialSections.length === 0);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadSections = async () => {
    setLoading(true);
    try {
      const list = await fetchOpenSections({ campusId, studentId, token });
      setSections(list);
      $availableSections.set(list);
    } catch {
      if (initialSections.length > 0) {
        setSections(initialSections);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSections();
  }, [studentId, campusId, syncVersion]);

  const handleEnroll = async (section: CourseSectionItem) => {
    setFeedback(null);
    setEnrollingId(section.id);
    try {
      const res = await enrollStudentInSection({
        studentId,
        sectionId: section.id,
        token,
      });

      setSections((prev) =>
        prev.map((item) =>
          item.id === section.id
            ? {
                ...item,
                isEnrolled: true,
                occupiedQuota: item.occupiedQuota + 1,
                availableQuota: Math.max(0, item.availableQuota - 1),
              }
            : item
        )
      );

      setFeedback({
        type: 'success',
        text: `${res.message} (${section.courseCode} — ${section.courseName})`,
      });
      triggerAcademicSync();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al procesar la inscripción en la sección seleccionada.';
      setFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setEnrollingId(null);
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 sm:p-6 border border-slate-800 min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <BookPlus className="w-4 h-4 text-usco-gold" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              Adición e Inscripción de Asignaturas
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Oferta habilitada para el programa de Ingeniería de Software · Sede {campusId.slice(-2) === '01' ? 'Central Neiva (NEI)' : 'USCO'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium bg-[#070A12] text-slate-300 border border-slate-800 self-start">
          <Users className="w-3.5 h-3.5 text-usco-gold" />
          {sections.length} Grupos Abiertos
        </span>
      </div>

      {feedback && (
        <div
          role="status"
          data-testid="enrollment-feedback"
          className={`mb-5 p-3.5 rounded-lg border text-xs flex items-center gap-2.5 ${
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((sec) => {
          const occupancyPct =
            sec.maxQuota > 0 ? Math.min(100, Math.round((sec.occupiedQuota / sec.maxQuota) * 100)) : 0;
          const isFull = sec.availableQuota <= 0;
          const isBusy = enrollingId === sec.id;

          return (
            <div
              key={sec.id}
              data-testid={`section-card-${sec.courseCode}`}
              className={`p-4 rounded-lg border transition-colors flex flex-col justify-between ${
                sec.isEnrolled
                  ? 'bg-[#090F1B] border-emerald-800/60'
                  : 'bg-[#070A12] border-slate-800/90 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30">
                        {sec.courseCode}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {sec.groupNumber} · {sec.credits} Créd.
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white mt-1.5 leading-snug">{sec.courseName}</h3>
                  </div>

                  {sec.isEnrolled ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 shrink-0">
                      Matriculada
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-900 text-usco-gold border border-slate-800 shrink-0">
                      {sec.availableQuota} cupos
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-xs text-slate-300 mt-3">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-usco-gold shrink-0" />
                    <span>{sec.scheduleText}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{sec.classroom}</span>
                  </p>
                  <p className="text-slate-400 text-[11px] pt-0.5">Docente: {sec.teacherName}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Cupos ocupados:</span>
                  <span className="font-mono font-medium text-slate-200">
                    {sec.occupiedQuota} / {sec.maxQuota} ({occupancyPct}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full transition-all ${
                      occupancyPct >= 90
                        ? 'bg-red-500'
                        : occupancyPct >= 75
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    }`}
                    style={{ width: `${occupancyPct}%` }}
                  />
                </div>

                {sec.isEnrolled ? (
                  <button
                    type="button"
                    disabled
                    data-testid={`enrolled-badge-${sec.courseCode}`}
                    className="w-full py-2 px-3 rounded-lg text-xs font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-800/60 flex items-center justify-center gap-1.5 cursor-default"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Asignatura Inscrita</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`enroll-btn-${sec.courseCode}`}
                    disabled={isFull || isBusy || loading}
                    onClick={() => handleEnroll(sec)}
                    className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-usco-wine hover:bg-usco-wineLight text-white border border-usco-gold/30 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <PlusCircle className="w-4 h-4 text-usco-gold" />
                    <span>
                      {isBusy
                        ? 'Registrando matrícula...'
                        : isFull
                          ? 'Cupo Agotado'
                          : `Inscribir ${sec.courseCode}`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
