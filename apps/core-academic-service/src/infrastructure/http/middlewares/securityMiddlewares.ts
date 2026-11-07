import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError, ZodSchema } from 'zod';
import { AuthTokenPayload, RoleType } from '../../../domain/entities/AcademicEntities';
import {
  DomainError,
  InvalidCredentialsError,
  UnauthorizedRoleError,
  ValidationError,
} from '../../../domain/errors/DomainError';
import { JwtTokenAdapter } from '../../auth/JwtTokenAdapter';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

const tokenAdapter = new JwtTokenAdapter();

const MALICIOUS_PATTERNS: RegExp[] = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|EXEC|TRUNCATE)\b\s+\b(FROM|INTO|TABLE|ALL|SELECT|SET)\b)/i,
  /('|\bOR\b|\bAND\b)\s*['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /(--|\/\*|\*\/|;\s*DROP\s+TABLE)/i,
  /<\s*script\b[^>]*>(.*?)<\s*\/\s*script\s*>/i,
  /<\s*script\b/i,
  /javascript\s*:/i,
  /on(error|load|click|mouseover|focus)\s*=/i,
];

export function containsMaliciousPayload(input: unknown): boolean {
  if (typeof input === 'string') {
    return MALICIOUS_PATTERNS.some((pattern) => pattern.test(input));
  }
  if (Array.isArray(input)) {
    return input.some((item) => containsMaliciousPayload(item));
  }
  if (input && typeof input === 'object') {
    return Object.values(input).some((val) => containsMaliciousPayload(val));
  }
  return false;
}

/**
 * Middleware global de inspección profunda contra inyección SQL (SQLi) y Cross-Site Scripting (XSS) - OWASP A03.
 */
export function payloadSanitizationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    containsMaliciousPayload(req.body) ||
    containsMaliciousPayload(req.query) ||
    containsMaliciousPayload(req.params)
  ) {
    res.status(400).json({
      success: false,
      errorCode: 'MALICIOUS_PAYLOAD_DETECTED',
      message:
        'Solicitud bloqueada por política de seguridad OWASP A03: Se detectaron patrones potencialmente maliciosos (SQLi/XSS) en los parámetros de entrada.',
    });
    return;
  }
  next();
}

/**
 * Rate Limiter específico para mitigar ataques de fuerza bruta en /api/v1/auth/login (OWASP A07).
 * Solo contabiliza intentos fallidos (skipSuccessfulRequests: true) para no afectar logins legítimos E2E.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    errorCode: 'TOO_MANY_LOGIN_ATTEMPTS',
    message:
      'Demasiados intentos de autenticación desde esta dirección IP. Por seguridad (OWASP A07), intente nuevamente en 60 segundos.',
  },
});

export function jwtAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        errorCode: 'MISSING_AUTH_TOKEN',
        message: 'Autenticación requerida: Debe incluir un header Authorization Bearer JWT válido.',
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new InvalidCredentialsError('Token Bearer vacío.');
    }

    req.user = tokenAdapter.verifyToken(token);
    next();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Token JWT inválido o expirado.';
    res.status(401).json({
      success: false,
      errorCode: 'INVALID_JWT_TOKEN',
      message,
    });
  }
}

/**
 * Middleware de control de acceso basado en roles (RBAC) - Crítico para OWASP A01.
 */
export function rbacMiddleware(allowedRoles: RoleType[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Usuario no autenticado.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const error = new UnauthorizedRoleError(
        `Operación restringida (OWASP A01 RBAC): El rol '${req.user.role}' no tiene permisos. Roles requeridos: [${allowedRoles.join(', ')}].`
      );
      res.status(error.statusCode).json({
        success: false,
        errorCode: error.errorCode,
        message: error.message,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware anti-IDOR (OWASP A01) para endpoints de datos estudiantiles (/students/:id/summary).
 * - Si proviene del servicio interno `x-internal-service: chatbot-ai-service`, permite consulta de contexto.
 * - Si incluye un Bearer Token con rol `STUDENT`, verifica que el estudiante solo pueda consultar su propio `userId` o `studentCode`.
 * - Si un `STUDENT` intenta acceder al expediente de otro estudiante, retorna `403 Forbidden`.
 */
export function studentIdorGuardMiddleware(paramName = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const internalHeader = req.headers['x-internal-service'];
    if (internalHeader === 'chatbot-ai-service') {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7).trim();
        const decodedUser = tokenAdapter.verifyToken(token);
        req.user = decodedUser;

        const requestedTarget = (req.params[paramName] || '').trim();
        if (decodedUser.role === 'STUDENT') {
          const isOwnRecord =
            requestedTarget === decodedUser.userId ||
            (decodedUser.studentCode && requestedTarget === decodedUser.studentCode) ||
            requestedTarget === decodedUser.documentNumber ||
            requestedTarget.toLowerCase() === decodedUser.email.toLowerCase();

          if (!isOwnRecord) {
            res.status(403).json({
              success: false,
              errorCode: 'IDOR_ACCESS_DENIED',
              message:
                'Acceso denegado (OWASP A01 - Prevención IDOR): Un estudiante no está autorizado para consultar el expediente académico de otro estudiante.',
            });
            return;
          }
        }
      } catch {
        res.status(401).json({
          success: false,
          errorCode: 'INVALID_JWT_TOKEN',
          message: 'Token JWT inválido o expirado.',
        });
        return;
      }
    }

    next();
  };
}

export function zodValidationMiddleware<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (containsMaliciousPayload(req.body)) {
      res.status(400).json({
        success: false,
        errorCode: 'MALICIOUS_PAYLOAD_DETECTED',
        message:
          'Entrada rechazada (OWASP A03): Se detectaron caracteres o instrucciones de inyección SQL/XSS.',
      });
      return;
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const formattedIssues = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        message:
          formattedIssues[0]?.message ||
          'Los datos enviados no cumplen con el esquema de validación requerido.',
        details: formattedIssues,
      });
      return;
    }

    req.body = parsed.data;
    next();
  };
}

export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof DomainError) {
    res.status(err.statusCode).json({
      success: false,
      errorCode: err.errorCode,
      message: err.message,
      ...(err instanceof ValidationError && err.details
        ? { details: err.details }
        : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message: err.issues[0]?.message || 'Error de validación de datos.',
      details: err.issues,
    });
    return;
  }

  console.error('[CoreAcademicService Error]:', err);
  res.status(500).json({
    success: false,
    errorCode: 'INTERNAL_SERVER_ERROR',
    message: 'Error interno procesando la transacción académica.',
  });
}
