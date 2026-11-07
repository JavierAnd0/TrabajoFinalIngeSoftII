import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { ProcessAcademicChatUseCase } from './application/use-cases/ProcessAcademicChatUseCase';
import { openApiSpec } from './infrastructure/config/swagger';
import { createChatRouter } from './infrastructure/http/chatRoutes';
import { CoreAcademicContextAdapter } from './infrastructure/httpClient/CoreAcademicContextAdapter';
import { GeminiAndGroqFreeAIAdapter } from './infrastructure/llm/GeminiAndGroqFreeAIAdapter';
import { DeterministicRuleEngineAdapter } from './infrastructure/rules-engine/DeterministicRuleEngineAdapter';

const app = express();
const PORT = Number(process.env.CHATBOT_SERVICE_PORT || process.env.PORT || 4003);

// 1. Seguridad perimetral HTTP (Helmet + CORS)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
app.use(express.json({ limit: '64kb' }));

// 2. Inyección de Dependencias (Arquitectura Hexagonal)
const academicContextAdapter = new CoreAcademicContextAdapter();
const deterministicRuleEngineAdapter = new DeterministicRuleEngineAdapter(
  academicContextAdapter
);
const geminiAndGroqAdapter = new GeminiAndGroqFreeAIAdapter(
  academicContextAdapter,
  deterministicRuleEngineAdapter
);

const processAcademicChatUseCase = new ProcessAcademicChatUseCase(
  academicContextAdapter,
  geminiAndGroqAdapter,
  deterministicRuleEngineAdapter
);

// 3. Endpoints de Salud y Observabilidad
const healthHandler = (_req: Request, res: Response) => {
  const cbStatus = processAcademicChatUseCase.getCircuitBreakerStatus();
  res.status(200).json({
    success: true,
    service: '@edudistribuida/chatbot-ai-service',
    status: 'UP',
    port: PORT,
    architecture: 'Hexagonal (Ports & Adapters) + Strategy & Circuit Breaker',
    engines: {
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10
      ),
      groqConfigured: Boolean(
        process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 10
      ),
      deterministicFallbackReady: true,
      circuitBreaker: cbStatus,
    },
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// 4. Documentación OpenAPI 3.0
app.get('/api/docs.json', (_req: Request, res: Response) => {
  res.status(200).json(openApiSpec);
});
app.use('/api/docs', ...(swaggerUi.serve as unknown as express.RequestHandler[]), swaggerUi.setup(openApiSpec) as unknown as express.RequestHandler);

// 5. Rutas Conversacionales API v1
app.use('/api/v1/chat', createChatRouter(processAcademicChatUseCase));

// 6. Manejador de errores de JSON malformado y rutas no encontradas
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({
    success: false,
    error: 'BAD_REQUEST_PAYLOAD',
    message: err.message || 'El cuerpo de la petición no es un JSON válido.',
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'Ruta no encontrada en chatbot-ai-service (Puerto 4003).',
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('================================================================================');
    console.log(`🤖 CHATBOT AI SERVICE (HEXAGONAL + CIRCUIT BREAKER) ACTIVO EN PUERTO ${PORT}`);
    console.log(`📚 OpenAPI Docs: http://localhost:${PORT}/api/docs`);
    console.log(`🩺 Healthcheck:  http://localhost:${PORT}/api/v1/health`);
    console.log('================================================================================');
  });
}

export { app, processAcademicChatUseCase };
