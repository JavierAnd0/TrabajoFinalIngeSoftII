import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.CORE_SERVICE_PORT || process.env.PORT || 4001),
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/edudistribuida?schema=public',
  SUPABASE_JWT_SECRET:
    process.env.SUPABASE_JWT_SECRET ||
    'super-secret-jwt-token-with-at-least-32-characters-long',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  WORKER_SERVICE_URL: process.env.WORKER_SERVICE_URL || 'http://localhost:4002',
};
