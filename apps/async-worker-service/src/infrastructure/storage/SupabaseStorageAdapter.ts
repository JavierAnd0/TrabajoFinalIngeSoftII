import { CertificateJobStatus, prisma } from '@edudistribuida/database';
import fs from 'fs/promises';
import path from 'path';
import { ICertificateStoragePort } from '../../domain/ports/ICertificatePorts';
import { workerEnv } from '../config/env';

/**
 * Adaptador de Almacenamiento de Certificados PDF:
 * 1. Guarda físicamente el archivo PDF en `apps/async-worker-service/public/certificates/:jobId.pdf`
 *    (y copia con nombre `:verificationCode.pdf` para compatibilidad total).
 * 2. Si existen credenciales reales de Supabase Cloud Storage configuradas, sube el objeto al bucket.
 * 3. Actualiza el registro `CertificateJob` en PostgreSQL a estado `COMPLETED` con su `pdfUrl`,
 *    `digitalSignatureHash` y `completedAt`.
 */
export class SupabaseStorageAdapter implements ICertificateStoragePort {
  public async storeAndCompleteCertificate(params: {
    jobId: string;
    verificationCode: string;
    pdfBuffer: Buffer;
    digitalSignatureHash: string;
    completedAt: Date;
  }): Promise<{
    localFilePath: string;
    publicPdfUrl: string;
    cloudUploaded: boolean;
  }> {
    await fs.mkdir(workerEnv.PUBLIC_CERTIFICATES_DIR, { recursive: true });

    const localFilePath = path.join(
      workerEnv.PUBLIC_CERTIFICATES_DIR,
      `${params.jobId}.pdf`
    );
    const verificationCodeFilePath = path.join(
      workerEnv.PUBLIC_CERTIFICATES_DIR,
      `${params.verificationCode}.pdf`
    );

    await fs.writeFile(localFilePath, params.pdfBuffer);
    await fs.writeFile(verificationCodeFilePath, params.pdfBuffer);

    let cloudUploaded = false;
    const isRealSupabaseUrl =
      workerEnv.SUPABASE_URL.startsWith('https://') &&
      !workerEnv.SUPABASE_URL.includes('tu-proyecto.supabase.co') &&
      workerEnv.SUPABASE_SERVICE_ROLE_KEY.length > 30 &&
      !workerEnv.SUPABASE_SERVICE_ROLE_KEY.endsWith('...');

    if (isRealSupabaseUrl) {
      try {
        const uploadEndpoint = `${workerEnv.SUPABASE_URL}/storage/v1/object/${workerEnv.SUPABASE_STORAGE_BUCKET}/${params.jobId}.pdf`;
        const resp = await fetch(uploadEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${workerEnv.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/pdf',
            'x-upsert': 'true',
          },
          body: params.pdfBuffer,
        });
        cloudUploaded = resp.ok;
      } catch {
        cloudUploaded = false;
      }
    }

    const publicPdfUrl = `${workerEnv.WORKER_SERVICE_URL}/public/certificates/${params.jobId}.pdf`;

    await prisma.certificateJob.update({
      where: { id: params.jobId },
      data: {
        status: CertificateJobStatus.COMPLETED,
        pdfUrl: publicPdfUrl,
        digitalSignatureHash: params.digitalSignatureHash,
        completedAt: params.completedAt,
      },
    });

    return {
      localFilePath,
      publicPdfUrl,
      cloudUploaded,
    };
  }
}
