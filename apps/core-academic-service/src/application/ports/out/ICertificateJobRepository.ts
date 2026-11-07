import { CertificateTypeDomain } from '../../../domain/entities/AcademicEntities';
import { CertificateJobViewDto } from '../../dtos/AcademicDtos';

export interface ICertificateJobRepository {
  createCertificateJob(params: {
    studentId: string;
    certificateType: CertificateTypeDomain;
    verificationCode: string;
  }): Promise<CertificateJobViewDto>;
  findByIdOrVerificationCode(jobIdOrCode: string): Promise<CertificateJobViewDto | null>;
  findByStudentId(studentIdOrCode: string): Promise<CertificateJobViewDto[]>;
}
