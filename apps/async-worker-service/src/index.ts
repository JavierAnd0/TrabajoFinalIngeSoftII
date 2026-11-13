import { prisma } from '@edudistribuida/database';
import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs/promises';
import helmet from 'helmet';
import path from 'path';
import { ProcessCertificateJobUseCase } from './application/use-cases/ProcessCertificateJobUseCase';
import { workerEnv } from './infrastructure/config/env';
import { NotificationLogAdapter } from './infrastructure/notifications/NotificationLogAdapter';
import { PdfCertificateGenerator } from './infrastructure/pdf/PdfCertificateGenerator';
import { BullMQWorkerConsumer } from './infrastructure/queues/BullMQWorkerConsumer';
import { SupabaseStorageAdapter } from './infrastructure/storage/SupabaseStorageAdapter';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

const pdfGenerator = new PdfCertificateGenerator();
const storageAdapter = new SupabaseStorageAdapter();
const notificationAdapter = new NotificationLogAdapter();
const processCertificateUseCase = new ProcessCertificateJobUseCase(
  pdfGenerator,
  storageAdapter
);
const workerConsumer = new BullMQWorkerConsumer(
  processCertificateUseCase,
  notificationAdapter
);

// Solo se aceptan UUIDs o códigos USCO-AAAA-XXXX: evita path traversal (../) al leer disco.
const CERTIFICATE_ID_REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|USCO-\d{4}-[A-Z0-9]{4,16})$/i;

// Los endpoints /api/v1/worker/* son internos: exigen el token compartido de servicio.
const requireInternalToken: express.RequestHandler = (req, res, next) => {
  const provided = req.headers['x-internal-service-token'];
  const expected = Buffer.from(workerEnv.INTERNAL_SERVICE_TOKEN);
  const ok =
    typeof provided === 'string' &&
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), expected);
  if (!ok) {
    res.status(401).json({ success: false, errorCode: 'INTERNAL_TOKEN_REQUIRED', message: 'Endpoint interno.' });
    return;
  }
  next();
};

// Helper para servir o regenerar un PDF bajo demanda
async function resolveAndSendPdf(
  identifierRaw: string,
  res: express.Response
): Promise<void> {
  const cleanId = identifierRaw.replace(/\.pdf$/i, '').trim();
  if (!CERTIFICATE_ID_REGEX.test(cleanId)) {
    res.status(400).json({
      success: false,
      errorCode: 'INVALID_CERTIFICATE_ID',
      message: 'Identificador de certificado inválido.',
    });
    return;
  }
  const directFilePath = path.join(
    workerEnv.PUBLIC_CERTIFICATES_DIR,
    `${cleanId}.pdf`
  );

  try {
    const fileBuffer = await fs.readFile(directFilePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Certificado-USCO-${cleanId}.pdf"`
    );
    res.status(200).send(fileBuffer);
    return;
  } catch {
    // Si no está aún en disco, buscar en PostgreSQL y generarlo en caliente
  }

  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isUuid = UUID_REGEX.test(cleanId);

  const jobRecord = await prisma.certificateJob.findFirst({
    where: isUuid
      ? { OR: [{ id: cleanId }, { verificationCode: cleanId }] }
      : { verificationCode: cleanId },
  });

  if (!jobRecord) {
    res.status(404).json({
      success: false,
      errorCode: 'CERTIFICATE_PDF_NOT_FOUND',
      message: `El certificado '${cleanId}' no existe en el registro académico.`,
    });
    return;
  }

  await workerConsumer.processCertificateIdempotent({
    jobId: jobRecord.id,
    studentId: jobRecord.studentId,
    certificateType: jobRecord.certificateType,
    verificationCode: jobRecord.verificationCode,
  });

  const generatedPath = path.join(
    workerEnv.PUBLIC_CERTIFICATES_DIR,
    `${jobRecord.id}.pdf`
  );
  const generatedBuffer = await fs.readFile(generatedPath);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="Certificado-${jobRecord.verificationCode}.pdf"`
  );
  res.status(200).send(generatedBuffer);
}

// 1. Health Checks
const healthHandler: express.RequestHandler = async (_req, res) => {
  const metrics = await workerConsumer.getQueueMetrics();
  res.status(200).json({
    success: true,
    service: '@edudistribuida/async-worker-service',
    status: 'healthy',
    port: workerEnv.PORT,
    redisConnected: metrics.redisConnected,
    mode: metrics.mode,
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// 2. Métricas de Colas en Tiempo Real (BullMQ / Worker)
const metricsHandler: express.RequestHandler = async (_req, res, next) => {
  try {
    const metrics = await workerConsumer.getQueueMetrics();
    res.status(200).json({
      ...metrics,
      data: metrics,
    });
  } catch (err) {
    next(err);
  }
};

app.get('/metrics/queues', metricsHandler);
app.get('/api/v1/metrics/queues', metricsHandler);

// 3. Endpoint Asíncrono Interno de Procesamiento de Certificado PDF
app.post('/api/v1/worker/process-certificate', requireInternalToken, async (req, res, next) => {
  try {
    const { jobId, studentId, certificateType, verificationCode } = req.body || {};
    if (!jobId) {
      res.status(400).json({
        success: false,
        message: 'El campo jobId es obligatorio para procesar el certificado.',
      });
      return;
    }

    const result = await workerConsumer.processCertificateIdempotent({
      jobId,
      studentId,
      certificateType,
      verificationCode,
    });

    res.status(200).json({
      success: true,
      message: 'Certificado PDF generado y firmado criptográficamente con SHA-256.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// 4. Endpoint Asíncrono Interno de Notificaciones Académicas
app.post('/api/v1/worker/process-notification', requireInternalToken, async (req, res, next) => {
  try {
    const result = await notificationAdapter.processNotification(req.body || {});
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// 5. Descarga Directa de Certificados PDF
app.get('/public/certificates/:fileName', async (req, res, next) => {
  try {
    await resolveAndSendPdf(req.params.fileName, res);
  } catch (err) {
    next(err);
  }
});

app.get('/api/v1/certificates/:jobId/download', async (req, res, next) => {
  try {
    await resolveAndSendPdf(req.params.jobId, res);
  } catch (err) {
    next(err);
  }
});

// 6. Manejador de Errores
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[AsyncWorkerService Error]:', err);
    res.status(500).json({
      success: false,
      errorCode: 'WORKER_PROCESSING_ERROR',
      message:
        err instanceof Error
          ? err.message
          : 'Error interno en el Worker de Certificados PDF.',
    });
  }
);

const server = app.listen(workerEnv.PORT, async () => {
  console.log('================================================================================');
  console.log(`⚙️  [Async Worker Service] Activo en http://localhost:${workerEnv.PORT}`);
  console.log(`📊 [Métricas de Colas]    http://localhost:${workerEnv.PORT}/metrics/queues`);
  console.log(`📂 [Almacén PDF Local]    ${workerEnv.PUBLIC_CERTIFICATES_DIR}`);
  console.log('================================================================================');
  await workerConsumer.start();
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

export { app };
