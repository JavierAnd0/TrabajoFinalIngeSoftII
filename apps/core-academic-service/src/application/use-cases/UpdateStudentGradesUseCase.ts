import { RoleType } from '../../domain/entities/AcademicEntities';
import { ResourceNotFoundError, UnauthorizedRoleError } from '../../domain/errors/DomainError';
import { GradeDomainService } from '../../domain/services/GradeDomainService';
import { AdminEnrollmentRecord, IEnrollmentRepository } from '../ports/out/IEnrollmentRepository';
import { IQueuePublisherPort } from '../ports/out/IQueuePublisherPort';

export interface UpdateStudentGradesCommand {
  enrollmentId: string;
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  observations?: string | null;
  actorRole: RoleType;
  actorEmail: string;
  actorUserId: string;
}

export class UpdateStudentGradesUseCase {
  constructor(
    private readonly enrollmentRepository: IEnrollmentRepository,
    private readonly queuePublisher: IQueuePublisherPort
  ) {}

  public async execute(command: UpdateStudentGradesCommand): Promise<AdminEnrollmentRecord> {
    if (command.actorRole !== 'TEACHER' && command.actorRole !== 'ADMIN') {
      throw new UnauthorizedRoleError(
        'Solo los roles TEACHER y ADMIN están autorizados para registrar o modificar calificaciones académicas.'
      );
    }

    // Un docente solo puede calificar las matrículas de los grupos que dicta (OWASP A01).
    if (command.actorRole === 'TEACHER') {
      const sectionTeacherId = await this.enrollmentRepository.findSectionTeacherIdByEnrollment(
        command.enrollmentId
      );
      if (!sectionTeacherId) {
        throw new ResourceNotFoundError('Matrícula', command.enrollmentId);
      }
      if (sectionTeacherId !== command.actorUserId) {
        throw new UnauthorizedRoleError(
          'Solo el docente titular del grupo puede registrar o modificar sus calificaciones.'
        );
      }
    }

    const gradeCalc = GradeDomainService.calculateFinalAndRequiredCut3(
      command.cut1,
      command.cut2,
      command.cut3
    );

    const updatedRecord = await this.enrollmentRepository.updateEnrollmentGrade({
      enrollmentId: command.enrollmentId,
      cut1: gradeCalc.cut1,
      cut2: gradeCalc.cut2,
      cut3: gradeCalc.cut3,
      finalGrade: gradeCalc.finalGrade,
      passed: gradeCalc.passed,
      observations: command.observations,
      updatedBy: command.actorEmail,
    });

    await this.queuePublisher.publishNotificationEvent({
      eventType: 'GRADES_UPDATED',
      studentId: updatedRecord.student.id,
      title: `Actualización de Notas: ${updatedRecord.course.code} - ${updatedRecord.course.name}`,
      message: `Sus calificaciones han sido actualizadas (Definitiva acumulada: ${gradeCalc.finalGrade.toFixed(2)} - Estado: ${gradeCalc.statusText}).`,
      metadata: {
        enrollmentId: updatedRecord.enrollmentId,
        courseCode: updatedRecord.course.code,
        finalGrade: gradeCalc.finalGrade,
        statusText: gradeCalc.statusText,
      },
      timestamp: new Date().toISOString(),
    });

    return updatedRecord;
  }
}
