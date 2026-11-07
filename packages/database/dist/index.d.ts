import { PrismaClient } from '@prisma/client';
/**
 * Instancia Singleton de PrismaClient para evitar agotamiento del pool de conexiones
 * en entornos de desarrollo con Hot-Reload y microservicios concurrentes.
 */
export declare const prisma: PrismaClient;
/**
 * Calcula la nota acumulada o definitiva bajo el reglamento estudiantil USCO:
 * - Corte 1: 30% (0.30)
 * - Corte 2: 30% (0.30)
 * - Corte 3: 40% (0.40)
 * Nota aprobatoria mínima: 3.0 sobre 5.0
 */
export declare function calculateWeightedGrade(cut1?: number | null, cut2?: number | null, cut3?: number | null): {
    accumulatedGrade: number;
    finalGrade: number | null;
    passed: boolean | null;
    evaluatedPercentage: number;
};
/**
 * Genera el hash de firma digital criptográfica SHA-256 para certificados académicos.
 */
export declare function generateCertificateSignatureHash(payload: {
    verificationCode: string;
    studentCode: string;
    documentNumber: string;
    certificateType: string;
    issuedIsoDate: string;
}): string;
export declare function disconnectDatabase(): Promise<void>;
export * from '@prisma/client';
export default prisma;
//# sourceMappingURL=index.d.ts.map