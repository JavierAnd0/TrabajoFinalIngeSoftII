import { ResourceNotFoundError } from '../../domain/errors/DomainError';
import { EnrollmentDomainService } from '../../domain/services/EnrollmentDomainService';
import { ICourseSectionRepository } from '../ports/out/ICourseSectionRepository';
import { IEnrollmentRepository } from '../ports/out/IEnrollmentRepository';
import { IQueuePublisherPort } from '../ports/out/IQueuePublisherPort';
import { IUserRepository } from '../ports/out/IUserRepository';

export interface EnrollStudentCommand {
  studentId: string;
  sectionId: string;
  paymentReference?: string;
}

export class EnrollStudentInSectionUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly sectionRepository: ICourseSectionRepository,
    private readonly enrollmentRepository: IEnrollmentRepository,
    private readonly queuePublisher: IQueuePublisherPort
  ) {}

  public async execute(command: EnrollStudentCommand) {
    const student = await this.userRepository.findByIdOrStudentCode(command.studentId);
    if (!student) {
      throw new ResourceNotFoundError('Estudiante', command.studentId);
    }

    const section = await this.sectionRepository.findSectionValidationTarget(command.sectionId);
    if (!section) {
      throw new ResourceNotFoundError('Sección de Asignatura', command.sectionId);
    }

    const existingEnrollments = await this.enrollmentRepository.findExistingEnrollmentsByStudent(
      student.id
    );

    EnrollmentDomainService.validateEnrollmentEligibility({
      studentCampusIsActive: student.campus.isActive,
      section,
      existingEnrollments,
    });

    const generatedPaymentRef =
      command.paymentReference?.trim() ||
      `REC-USCO-20262-${Math.floor(10000 + Math.random() * 90000)}`;

    const enrollmentResult = await this.enrollmentRepository.executeAtomicEnrollment({
      studentId: student.id,
      sectionId: section.id,
      periodId: section.periodId,
      paymentReference: generatedPaymentRef,
    });

    await this.queuePublisher.publishNotificationEvent({
      eventType: 'ENROLLMENT_CREATED',
      studentId: student.id,
      title: `Matrícula Exitosa: ${enrollmentResult.courseCode} - ${enrollmentResult.courseName}`,
      message: `Se ha registrado exitosamente la matrícula en el grupo ${enrollmentResult.groupNumber} (Recibo ${enrollmentResult.paymentReference}).`,
      metadata: {
        enrollmentId: enrollmentResult.enrollmentId,
        sectionId: enrollmentResult.sectionId,
        courseCode: enrollmentResult.courseCode,
      },
      timestamp: new Date().toISOString(),
    });

    return enrollmentResult;
  }
}
