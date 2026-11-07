import { CertificateTypeDomain } from '../../../domain/entities/AcademicEntities';

export interface CertificateJobQueuePayload {
  jobId: string;
  studentId: string;
  certificateType: CertificateTypeDomain;
  verificationCode: string;
  requestedAt: string;
}

export interface NotificationQueuePayload {
  eventType: 'ENROLLMENT_CREATED' | 'GRADES_UPDATED' | 'CERTIFICATE_REQUESTED';
  studentId: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface IQueuePublisherPort {
  publishCertificatePdfJob(payload: CertificateJobQueuePayload): Promise<{
    dispatchedVia: 'BULLMQ_REDIS' | 'HTTP_ASYNC_FALLBACK';
  }>;
  publishNotificationEvent(payload: NotificationQueuePayload): Promise<void>;
}
