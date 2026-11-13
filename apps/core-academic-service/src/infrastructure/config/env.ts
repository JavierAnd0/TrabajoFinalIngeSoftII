import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * Lee un secreto obligatorio. En desarrollo se permite un valor por defecto
 * (con advertencia) para no bloquear el arranque local; en producción el
 * servicio se niega a arrancar con secretos ausentes o de ejemplo (OWASP A05/A02).
 */
function requireSecret(name: string, devDefault: string): string {
  const value = process.env[name]?.trim();
  const isPlaceholder =
    !value || value === devDefault || value.startsWith('super-secret') || value.length < 32;

  if (isPlaceholder) {
    if (IS_PRODUCTION) {
      throw new Error(
        `[Config] ${name} no está definido o usa un valor de ejemplo. Defina un secreto real de al menos 32 caracteres antes de arrancar en producción.`
      );
    }
    console.warn(`⚠️  [Config] ${name} usa un valor de desarrollo. No lo utilice en producción.`);
    return value && value.length > 0 ? value : devDefault;
  }
  return value;
}

export const env = {
  NODE_ENV,
  IS_PRODUCTION,
  PORT: Number(process.env.CORE_SERVICE_PORT || process.env.PORT || 4001),
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/edudistribuida?schema=public',
  SUPABASE_JWT_SECRET: requireSecret(
    'SUPABASE_JWT_SECRET',
    'super-secret-jwt-token-with-at-least-32-characters-long'
  ),
  /** Token compartido para llamadas servicio-a-servicio (chatbot → core, core → worker). */
  INTERNAL_SERVICE_TOKEN: requireSecret(
    'INTERNAL_SERVICE_TOKEN',
    'dev-internal-service-token-change-me-0000'
  ),
  /** Secreto HMAC con el que la pasarela de pagos firma el webhook. */
  PAYMENT_WEBHOOK_SECRET: requireSecret(
    'PAYMENT_WEBHOOK_SECRET',
    'dev-payment-webhook-secret-change-me-0000'
  ),
  /** Orígenes permitidos por CORS, separados por coma. */
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:4321,http://127.0.0.1:4321')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  WORKER_SERVICE_URL: process.env.WORKER_SERVICE_URL || 'http://localhost:4002',
};

export const JWT_ISSUER = 'edudistribuida-core-academic-service';
export const JWT_AUDIENCE = 'edudistribuida-usco-net';
