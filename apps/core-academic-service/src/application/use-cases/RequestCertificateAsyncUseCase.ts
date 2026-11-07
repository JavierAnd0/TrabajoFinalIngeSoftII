import crypto from 'crypto';
import { CertificateTypeDomain } from '../../domain/entities/AcademicEntities';
import { ResourceNotFoundError } from '../../domain/errors/DomainError';
import { ICertificateJobRepository } from '../ports/out/ICertificateJobRepository';
import { IQueuePublisherPort } from '../ports/out/IQueuePublisherPort';
import { IUserRepository } from '../ports/out/IUserRepository';

export interface RequestCertificateCommand {
  studentId: string;
  certificateType: CertificateTypeDomain;
}

export class RequestCertificateAsyncUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly certificateJobRepository: ICertificateJobRepository,
    private readonly queuePublisher: IQueuePublisherPort
  ) {}

  public async execute(command: RequestCertificateCommand) {
    const student = await this.userRepository.findByIdOrStudentCode(command.studentId);
    if (!student) {
      throw new ResourceNotFoundError('Estudiante', command.studentId);
    }

    const randomDigits = crypto.randomInt(1000, 9999);
    const shortSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const verificationCode = `USCO-2026-${randomDigits}${shortSuffix}`;

    const jobRecord = await this.certificateJobRepository.createCertificateJob({
      studentId: student.id,
      certificateType: command.certificateType,
      verificationCode,
    });

    // Despacho no bloqueante para garantizar latencia < 20ms en el endpoint 202 Accepted
    setImmediate(() => {
      this.queuePublisher
        .publishCertificatePdfJob({
          jobId: jobRecord.id,
          studentId: student.id,
          certificateType: command.certificateType,
          verificationCode: jobRecord.verificationCode,
          requestedAt: jobRecord.requestedAt,
        })
        .catch((err) => {
          console.error('[RequestCertificateAsyncUseCase] Error despachando job:', err);
        });
    });

    return {
      jobId: jobRecord.id,
      id: jobRecord.id,
      studentId: student.id,
      status: 'QUEUED' as const,
      verificationCode: jobRecord.verificationCode,
      certificateType: jobRecord.certificateType,
      requestedAt: jobRecord.requestedAt,
    };
  }
}
