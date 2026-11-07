import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Instancia Singleton de PrismaClient para evitar agotamiento del pool de conexiones
 * en entornos de desarrollo con Hot-Reload y microservicios concurrentes.
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Calcula la nota acumulada o definitiva bajo el reglamento estudiantil USCO:
 * - Corte 1: 30% (0.30)
 * - Corte 2: 30% (0.30)
 * - Corte 3: 40% (0.40)
 * Nota aprobatoria mínima: 3.0 sobre 5.0
 */
export function calculateWeightedGrade(
  cut1?: number | null,
  cut2?: number | null,
  cut3?: number | null
): {
  accumulatedGrade: number;
  finalGrade: number | null;
  passed: boolean | null;
  evaluatedPercentage: number;
} {
  const c1 = typeof cut1 === 'number' ? cut1 : 0;
  const c2 = typeof cut2 === 'number' ? cut2 : 0;
  const c3 = typeof cut3 === 'number' ? cut3 : 0;

  let evaluatedPercentage = 0;
  if (typeof cut1 === 'number') evaluatedPercentage += 30;
  if (typeof cut2 === 'number') evaluatedPercentage += 30;
  if (typeof cut3 === 'number') evaluatedPercentage += 40;

  const accumulated = Number((c1 * 0.3 + c2 * 0.3 + c3 * 0.4).toFixed(2));
  const isComplete =
    typeof cut1 === 'number' &&
    typeof cut2 === 'number' &&
    typeof cut3 === 'number';

  return {
    accumulatedGrade: accumulated,
    finalGrade: isComplete ? accumulated : accumulated,
    passed: isComplete ? accumulated >= 3.0 : accumulated >= 3.0 ? true : null,
    evaluatedPercentage,
  };
}

/**
 * Genera el hash de firma digital criptográfica SHA-256 para certificados académicos.
 */
export function generateCertificateSignatureHash(payload: {
  verificationCode: string;
  studentCode: string;
  documentNumber: string;
  certificateType: string;
  issuedIsoDate: string;
}): string {
  const secretSalt =
    process.env.SUPABASE_JWT_SECRET ||
    'usco-edudistribuida-cryptographic-salt-2026';
  const canonicalString = `${payload.verificationCode}|${payload.studentCode}|${payload.documentNumber}|${payload.certificateType}|${payload.issuedIsoDate}|${secretSalt}`;
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export * from '@prisma/client';
export default prisma;
