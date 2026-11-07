import { ResourceNotFoundError } from '../../domain/errors/DomainError';
import { StudentAcademicSummaryDto } from '../dtos/AcademicDtos';
import { IEnrollmentRepository } from '../ports/out/IEnrollmentRepository';

export class GetStudentAcademicSummaryUseCase {
  constructor(private readonly enrollmentRepository: IEnrollmentRepository) {}

  public async execute(studentIdOrCode: string): Promise<StudentAcademicSummaryDto> {
    const summary = await this.enrollmentRepository.getStudentAcademicSummary(
      studentIdOrCode.trim()
    );

    if (!summary) {
      throw new ResourceNotFoundError('Estudiante', studentIdOrCode);
    }

    return summary;
  }
}
