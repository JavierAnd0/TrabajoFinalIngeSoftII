import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const workerEnv = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.WORKER_SERVICE_PORT || process.env.PORT || 4002),
  WORKER_SERVICE_URL: process.env.WORKER_SERVICE_URL || 'http://localhost:4002',
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/edudistribuida?schema=public',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_STORAGE_BUCKET:
    process.env.SUPABASE_STORAGE_BUCKET || 'academic-certificates',
  INTERNAL_SERVICE_TOKEN:
    process.env.INTERNAL_SERVICE_TOKEN || 'dev-internal-service-token-change-me-0000',
  PUBLIC_CERTIFICATES_DIR: path.resolve(
    __dirname,
    '../../../public/certificates'
  ),
};
