import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  CertificateJobQueuePayload,
  IQueuePublisherPort,
  NotificationQueuePayload,
} from '../../application/ports/out/IQueuePublisherPort';
import { env } from '../config/env';

/**
 * Adaptador de Publicación de Eventos y Trabajos Asíncronos con Tolerancia a Fallos:
 * - Intenta publicar en Redis vía BullMQ ('certificate-pdf-queue' y 'notification-queue').
 * - Si Redis no está disponible en el entorno local o falla, despacha de forma no bloqueante
 *   vía HTTP al Worker en `http://localhost:4002/api/v1/worker/process-certificate`.
 */
export class BullMQPublisherAdapter implements IQueuePublisherPort {
  private redisConnection: IORedis | null = null;
  private certificateQueue: Queue | null = null;
  private notificationQueue: Queue | null = null;
  private isRedisReady = false;

  constructor() {
    this.initializeRedisConnection();
  }

  private initializeRedisConnection(): void {
    try {
      this.redisConnection = new IORedis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        connectTimeout: 1500,
        retryStrategy: (times) => {
          if (times > 2) {
            return null;
          }
          return Math.min(times * 250, 1000);
        },
      });

      this.redisConnection.on('ready', () => {
        this.isRedisReady = true;
        console.log(
          `✅ [BullMQPublisherAdapter] Conectado a Redis en ${env.REDIS_HOST}:${env.REDIS_PORT}`
        );
      });

      this.redisConnection.on('error', () => {
        this.isRedisReady = false;
      });

      this.certificateQueue = new Queue('certificate-pdf-queue', {
        connection: this.redisConnection as unknown as import('bullmq').ConnectionOptions,
      });

      this.notificationQueue = new Queue('notification-queue', {
        connection: this.redisConnection as unknown as import('bullmq').ConnectionOptions,
      });

      this.certificateQueue.on('error', () => {
        this.isRedisReady = false;
      });
      this.notificationQueue.on('error', () => {
        this.isRedisReady = false;
      });
    } catch {
      this.isRedisReady = false;
    }
  }

  public async publishCertificatePdfJob(
    payload: CertificateJobQueuePayload
  ): Promise<{ dispatchedVia: 'BULLMQ_REDIS' | 'HTTP_ASYNC_FALLBACK' }> {
    let dispatchedToRedis = false;

    if (this.isRedisReady && this.certificateQueue) {
      try {
        await this.certificateQueue.add('generate-certificate-pdf', payload, {
          jobId: payload.jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        });
        dispatchedToRedis = true;
      } catch {
        dispatchedToRedis = false;
      }
    }

    // Si la cola aceptó el trabajo, el worker lo consumirá desde Redis. El respaldo HTTP
    // solo se usa cuando Redis no está disponible; antes se disparaba SIEMPRE y cada
    // certificado se generaba dos veces (cola + HTTP), anulando el desacople de la cola.
    if (dispatchedToRedis) {
      return { dispatchedVia: 'BULLMQ_REDIS' };
    }

    setImmediate(async () => {
      try {
        await fetch(`${env.WORKER_SERVICE_URL}/api/v1/worker/process-certificate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-service-token': env.INTERNAL_SERVICE_TOKEN,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn(
          '[BullMQPublisherAdapter] Aviso: Worker HTTP en proceso de arranque o procesando por cola:',
          err instanceof Error ? err.message : err
        );
      }
    });

    return { dispatchedVia: 'HTTP_ASYNC_FALLBACK' };
  }

  public async publishNotificationEvent(
    payload: NotificationQueuePayload
  ): Promise<void> {
    if (this.isRedisReady && this.notificationQueue) {
      try {
        await this.notificationQueue.add('send-academic-notification', payload, {
          removeOnComplete: 100,
          removeOnFail: 50,
        });
        return;
      } catch {
        // Fallback silencioso a Worker HTTP
      }
    }

    setImmediate(async () => {
      try {
        await fetch(`${env.WORKER_SERVICE_URL}/api/v1/worker/process-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-service-token': env.INTERNAL_SERVICE_TOKEN,
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // No bloquea la transacción principal si el worker está reiniciando
      }
    });
  }
}
