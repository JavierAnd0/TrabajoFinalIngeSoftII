"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.calculateWeightedGrade = calculateWeightedGrade;
exports.generateCertificateSignatureHash = generateCertificateSignatureHash;
exports.disconnectDatabase = disconnectDatabase;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const globalForPrisma = globalThis;
/**
 * Instancia Singleton de PrismaClient para evitar agotamiento del pool de conexiones
 * en entornos de desarrollo con Hot-Reload y microservicios concurrentes.
 */
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
/**
 * Calcula la nota acumulada o definitiva bajo el reglamento estudiantil USCO:
 * - Corte 1: 30% (0.30)
 * - Corte 2: 30% (0.30)
 * - Corte 3: 40% (0.40)
 * Nota aprobatoria mínima: 3.0 sobre 5.0
 */
function calculateWeightedGrade(cut1, cut2, cut3) {
    const c1 = typeof cut1 === 'number' ? cut1 : 0;
    const c2 = typeof cut2 === 'number' ? cut2 : 0;
    const c3 = typeof cut3 === 'number' ? cut3 : 0;
    let evaluatedPercentage = 0;
    if (typeof cut1 === 'number')
        evaluatedPercentage += 30;
    if (typeof cut2 === 'number')
        evaluatedPercentage += 30;
    if (typeof cut3 === 'number')
        evaluatedPercentage += 40;
    const accumulated = Number((c1 * 0.3 + c2 * 0.3 + c3 * 0.4).toFixed(2));
    const isComplete = typeof cut1 === 'number' &&
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
function generateCertificateSignatureHash(payload) {
    const secretSalt = process.env.SUPABASE_JWT_SECRET ||
        'usco-edudistribuida-cryptographic-salt-2026';
    const canonicalString = `${payload.verificationCode}|${payload.studentCode}|${payload.documentNumber}|${payload.certificateType}|${payload.issuedIsoDate}|${secretSalt}`;
    return crypto_1.default.createHash('sha256').update(canonicalString).digest('hex');
}
async function disconnectDatabase() {
    await exports.prisma.$disconnect();
}
__exportStar(require("@prisma/client"), exports);
exports.default = exports.prisma;
//# sourceMappingURL=index.js.map