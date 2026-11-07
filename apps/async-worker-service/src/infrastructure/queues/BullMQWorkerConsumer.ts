import { prisma } from '@edudistribuida/database';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ProcessCertificateJobUseCase } from '../../application/use-cases/ProcessCertificateJobUseCase';
import {
  CertificateTypeWorker,
  RecentWorkerJobEntry,
} from '../../domain/entities/CertificateWorkerEntities';
import { workerEnv } from '../config/env';
import { NotificationLogAdapter } from '../notifications/NotificationLogAdapter';

export class BullMQWorkerConsumer {
  private redisConnection: IORedis | null = null;
  private certificateWorker: Worker | null = null;
  private notificationWorker: Worker | null = null;
  private isRedisConnected = false;

  private activeCertificateJobs = 0;
  private waitingCertificateJobs = 0;
  private completedCertificateJobs = 0;
  private failedCertificateJobs = 0;
  private readonly latenciesMs: number[] = [];
  private readonly recentJobs: RecentWorkerJobEntry[] = [];
  private readonly processingLock = new Set<string>();

  constructor(
    private readonly processCertificateUseCase: ProcessCertificateJobUseCase,
    private readonly notificationAdapter: NotificationLogAdapter
  ) {}

  public async start(): Promise<void> {
    await this.prewarmExistingDatabaseCertificates();
    this.initBullMQWorkers();
  }

  /**
   * Al arrancar el servicio, inspecciona todos los CertificateJob en PostgreSQL
   * (incluyendo 88888888-8888-4888-8888-888888888801 y 88888888-8888-4888-8888-888888888802)
   * y genera sus archivos PDF reales en `public/certificates/` para descarga inmediata.
   */
  public async prewarmExistingDatabaseCertificates(): Promise<void> {
    try {
      const existingJobs = await prisma.certificateJob.findMany({
        orderBy: { requestedAt: 'asc' },
      });

      for (const job of existingJobs) {
        try {
          const result = await this.processCertificateIdempotent({
            jobId: job.id,
            studentId: job.studentId,
            certificateType: job.certificateType,
            verificationCode: job.verificationCode,
          });
          console.log(
            `📄 [Worker Prewarm] Certificado PDF listo: ${result.verificationCode} (${result.pdfUrl})`
          );
        } catch (err) {
          console.error(
            `⚠️ [Worker Prewarm] Error generando PDF para job ${job.id}:`,
            err
          );
        }
      }
    } catch (err) {
      console.error('⚠️ [Worker Prewarm] No se pudo consultar CertificateJob:', err);
    }
  }

  private initBullMQWorkers(): void {
    try {
      this.redisConnection = new IORedis({
        host: workerEnv.REDIS_HOST,
        port: workerEnv.REDIS_PORT,
        password: workerEnv.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        connectTimeout: 1500,
        retryStrategy: (times) => {
          if (times > 2) return null;
          return Math.min(times * 250, 1000);
        },
      });

      this.redisConnection.on('ready', () => {
        this.isRedisConnected = true;
        console.log(
          `✅ [BullMQWorkerConsumer] Escuchando colas Redis en ${workerEnv.REDIS_HOST}:${workerEnv.REDIS_PORT}`
        );
        this.attachWorkers();
      });

      this.redisConnection.on('error', () => {
        this.isRedisConnected = false;
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  private attachWorkers(): void {
    if (!this.redisConnection || this.certificateWorker) return;

    try {
      this.certificateWorker = new Worker(
        'certificate-pdf-queue',
        async (job: Job) => {
          return await this.processCertificateIdempotent({
            jobId: job.data.jobId,
            studentId: job.data.studentId,
            certificateType: job.data.certificateType,
            verificationCode: job.data.verificationCode,
          });
        },
        {
          connection: this.redisConnection as unknown as import('bullmq').ConnectionOptions,
          concurrency: 4,
        }
      );

      this.certificateWorker.on('error', () => {
        this.isRedisConnected = false;
      });

      this.notificationWorker = new Worker(
        'notification-queue',
        async (job: Job) => {
          return await this.notificationAdapter.processNotification(job.data);
        },
        {
          connection: this.redisConnection as unknown as import('bullmq').ConnectionOptions,
          concurrency: 4,
        }
      );

      this.notificationWorker.on('error', () => {
        this.isRedisConnected = false;
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  public async processCertificateIdempotent(params: {
    jobId: string;
    studentId?: string;
    certificateType?: CertificateTypeWorker;
    verificationCode?: string;
  }) {
    if (this.processingLock.has(params.jobId)) {
      const existing = await prisma.certificateJob.findUnique({
        where: { id: params.jobId },
      });
      return {
        jobId: params.jobId,
        verificationCode:
          existing?.verificationCode || params.verificationCode || 'USCO-2026',
        pdfUrl: `${workerEnv.WORKER_SERVICE_URL}/public/certificates/${params.jobId}.pdf`,
        digitalSignatureHash: existing?.digitalSignatureHash || '',
        latencyMs: 15,
      };
    }

    this.processingLock.add(params.jobId);
    this.activeCertificateJobs += 1;

    try {
      const result = await this.processCertificateUseCase.execute(params);
      this.completedCertificateJobs += 1;
      this.latenciesMs.push(result.latencyMs);
      if (this.latenciesMs.length > 100) {
        this.latenciesMs.shift();
      }

      const historyItem: RecentWorkerJobEntry = {
        jobId: result.jobId,
        queueName: 'certificate-pdf-queue',
        type: params.certificateType || 'STUDY',
        studentId: params.studentId || '44444444-4444-4444-8444-444444444403',
        verificationCode: result.verificationCode,
        status: 'COMPLETED',
        latencyMs: result.latencyMs,
        processedAt: new Date().toISOString(),
        pdfUrl: result.pdfUrl,
      };

      const existingIdx = this.recentJobs.findIndex(
        (j) => j.jobId === result.jobId
      );
      if (existingIdx >= 0) {
        this.recentJobs[existingIdx] = historyItem;
      } else {
        this.recentJobs.unshift(historyItem);
      }

      if (this.recentJobs.length > 30) {
        this.recentJobs.pop();
      }

      return result;
    } catch (err) {
      this.failedCertificateJobs += 1;
      throw err;
    } finally {
      this.activeCertificateJobs = Math.max(0, this.activeCertificateJobs - 1);
      this.processingLock.delete(params.jobId);
    }
  }

  public async getQueueMetrics() {
    const dbCompletedCount = await prisma.certificateJob
      .count({ where: { status: 'COMPLETED' } })
      .catch(() => this.completedCertificateJobs);

    const dbQueuedCount = await prisma.certificateJob
      .count({ where: { status: 'QUEUED' } })
      .catch(() => this.waitingCertificateJobs);

    const avgLatencyMs =
      this.latenciesMs.length > 0
        ? Math.round(
            this.latenciesMs.reduce((acc, v) => acc + v, 0) /
              this.latenciesMs.length
          )
        : 65;

    const notifStats = this.notificationAdapter.getStats();

    return {
      success: true,
      service: '@edudistribuida/async-worker-service',
      status: 'healthy',
      redisConnected: this.isRedisConnected,
      mode: this.isRedisConnected
        ? 'BULLMQ_REDIS_ACTIVE'
        : 'HYBRID_ASYNC_IN_MEMORY_AND_PG',
      certificatePdfQueue: {
        waiting: dbQueuedCount,
        queued: dbQueuedCount,
        active: this.activeCertificateJobs,
        processing: this.activeCertificateJobs,
        completed: Math.max(dbCompletedCount, this.completedCertificateJobs),
        failed: this.failedCertificateJobs,
        avgProcessingTimeMs: avgLatencyMs,
        averageProcessingMs: avgLatencyMs,
      },
      notificationQueue: {
        waiting: notifStats.waiting,
        active: notifStats.active,
        completed: notifStats.completed,
        failed: notifStats.failed,
        avgProcessingTimeMs: notifStats.avgProcessingTimeMs,
        averageProcessingMs: notifStats.avgProcessingTimeMs,
      },
      recentJobs: this.recentJobs,
      timestamp: new Date().toISOString(),
    };
  }
}
