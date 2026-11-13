import {
  ExistingEnrollmentRecord,
  SectionValidationTarget,
} from '../entities/AcademicEntities';
import {
  DuplicateEnrollmentError,
  QuotaExceededError,
  ValidationError,
} from '../errors/DomainError';

/**
 * Servicio de Dominio Puro para Reglas de Negocio de Matrícula Estudiantil:
 * 1. Verifica que la sede del estudiante y la sección estén habilitadas.
 * 2. Verifica disponibilidad de cupos (occupiedQuota < maxQuota).
 * 3. Previene doble matrícula en la misma sección o en la misma asignatura dentro del periodo activo.
 * 4. Respeta el tope reglamentario de créditos por periodo (MAX_CREDITS_PER_PERIOD).
 */
export const MAX_CREDITS_PER_PERIOD = 21;

export class EnrollmentDomainService {
  public static validateEnrollmentEligibility(params: {
    studentCampusIsActive: boolean;
    section: SectionValidationTarget;
    existingEnrollments: ExistingEnrollmentRecord[];
  }): void {
    const { studentCampusIsActive, section, existingEnrollments } = params;

    if (!studentCampusIsActive || !section.campusIsActive) {
      throw new ValidationError(
        'La sede universitaria asociada al estudiante o a la sección no se encuentra habilitada para matrícula activa.'
      );
    }

    const activeDuplicate = existingEnrollments.find(
      (enrollment) =>
        enrollment.status === 'ACTIVE' &&
        enrollment.periodId === section.periodId &&
        (enrollment.sectionId === section.id || enrollment.courseId === section.courseId)
    );

    if (activeDuplicate) {
      throw new DuplicateEnrollmentError(section.courseCode, section.periodCode);
    }

    const enrolledCredits = existingEnrollments
      .filter((e) => e.status === 'ACTIVE' && e.periodId === section.periodId)
      .reduce((acc, e) => acc + e.credits, 0);
    if (enrolledCredits + section.credits > MAX_CREDITS_PER_PERIOD) {
      throw new ValidationError(
        `La inscripción de ${section.courseCode} (${section.credits} créditos) supera el tope reglamentario de ${MAX_CREDITS_PER_PERIOD} créditos por periodo. Créditos actuales: ${enrolledCredits}.`
      );
    }

    if (section.occupiedQuota >= section.maxQuota) {
      throw new QuotaExceededError(
        section.groupNumber,
        section.courseCode,
        section.maxQuota
      );
    }
  }
}
