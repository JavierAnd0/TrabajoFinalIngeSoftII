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
 */
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

    if (section.occupiedQuota >= section.maxQuota) {
      throw new QuotaExceededError(
        section.groupNumber,
        section.courseCode,
        section.maxQuota
      );
    }
  }
}
