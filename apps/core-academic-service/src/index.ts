import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './infrastructure/config/env';
import { openApiSpec } from './infrastructure/config/swagger';
import {
  globalErrorHandler,
  payloadSanitizationMiddleware,
} from './infrastructure/http/middlewares/securityMiddlewares';
import { createAcademicRouter } from './infrastructure/http/routes/academicRoutes';

const app = express();

// 1. Cabeceras de Seguridad Estrictas (OWASP A05 Security Misconfiguration)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    xssFilter: true,
  })
);

app.use(
  cors({
    // Solo el frontend declarado en CORS_ORIGINS (no '*'): OWASP A05.
    origin: env.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-internal-service-token',
      'x-webhook-signature',
      'Accept',
    ],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(payloadSanitizationMiddleware);

// 2. Healthcheck en raíz y en /api/v1/health
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    service: '@edudistribuida/core-academic-service',
    architecture: 'Hexagonal (Ports & Adapters)',
    status: 'healthy',
    port: env.PORT,
    timestamp: new Date().toISOString(),
  });
});

// 3. Documentación OpenAPI 3.0 / Swagger UI
app.get('/api/docs.json', (_req, res) => {
  res.status(200).json(openApiSpec);
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// 4. Rutas del Dominio Académico (/api/v1/...)
app.use('/api/v1', createAcademicRouter());

// 5. Manejador de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    errorCode: 'ENDPOINT_NOT_FOUND',
    message: `La ruta solicitada '${req.method} ${req.originalUrl}' no existe en Core Academic Service.`,
  });
});

// 6. Manejador Global de Errores de Dominio y Validación
app.use(globalErrorHandler);

const server = app.listen(env.PORT, () => {
  console.log('================================================================================');
  console.log(`🏛️  [Core Academic Service] Activo en http://localhost:${env.PORT}`);
  console.log(`📘 [Swagger OpenAPI 3.0]   http://localhost:${env.PORT}/api/docs`);
  console.log(`🔒 [Seguridad OWASP]       Helmet CSP/HSTS + JWT + RBAC + IDOR Guard + Zod`);
  console.log('================================================================================');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

export { app };
