import { OfficialCertificateRenderData } from '../entities/CertificateWorkerEntities';

export interface IPdfGeneratorPort {
  generateOfficialCertificatePdf(data: OfficialCertificateRenderData): Promise<Buffer>;
}

export interface ICertificateStoragePort {
  storeAndCompleteCertificate(params: {
    jobId: string;
    verificationCode: string;
    pdfBuffer: Buffer;
    digitalSignatureHash: string;
    completedAt: Date;
  }): Promise<{
    localFilePath: string;
    publicPdfUrl: string;
    cloudUploaded: boolean;
  }>;
}
