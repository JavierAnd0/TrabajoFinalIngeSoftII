import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Usuario autenticado que llega en el JWT emitido por Core Academic Service.
 * El chatbot no confía en el `studentId` que envía el navegador: lo toma del token.
 */
export interface ChatAuthUser {
  userId: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      chatUser?: ChatAuthUser;
    }
  }
}

const JWT_ISSUER = 'edudistribuida-core-academic-service';
const JWT_AUDIENCE = 'edudistribuida-usco-net';
const DEV_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

function resolveSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret || secret === DEV_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Chatbot Config] SUPABASE_JWT_SECRET no está definido o usa el valor de ejemplo.');
    }
    return secret || DEV_SECRET;
  }
  return secret;
}

export function chatJwtAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'MISSING_AUTH_TOKEN',
      message: 'Inicia sesión para usar el asistente académico.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(header.slice(7).trim(), resolveSecret(), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as jwt.JwtPayload;

    if (!decoded.userId || !decoded.role) throw new Error('claims incompletos');
    req.chatUser = {
      userId: String(decoded.userId),
      email: String(decoded.email || ''),
      role: decoded.role as ChatAuthUser['role'],
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'INVALID_JWT_TOKEN',
      message: 'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.',
    });
  }
}
