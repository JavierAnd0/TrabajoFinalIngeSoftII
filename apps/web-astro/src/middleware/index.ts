import { defineMiddleware } from 'astro:middleware';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import type { SessionUser } from '../env';

// En desarrollo (npm run dev:web) se carga el .env raíz del monorepo para compartir
// SUPABASE_JWT_SECRET con Core Academic Service. En Docker las variables ya vienen del entorno.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // Sin .env raíz: se usan las variables del entorno del proceso.
}

const JWT_ISSUER = 'edudistribuida-core-academic-service';
const JWT_AUDIENCE = 'edudistribuida-usco-net';
const DEV_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

function base64UrlDecode(segment: string): Buffer {
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verifica un JWT HS256 emitido por Core Academic Service: firma, algoritmo,
 * emisor, audiencia y expiración. Devuelve null si cualquier comprobación falla.
 * Antes el portal solo decodificaba el token (sin verificar la firma) y además
 * confiaba en una cookie `edudistribuida_user` editable desde el navegador.
 */
function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf-8'));
    if (header.alg !== 'HS256') return null;

    const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
    const received = base64UrlDecode(signatureB64);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8')) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    if (payload.iss !== JWT_ISSUER) return null;
    const aud = payload.aud;
    if (!(aud === JWT_AUDIENCE || (Array.isArray(aud) && aud.includes(JWT_AUDIENCE)))) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionUserFromClaims(claims: Record<string, unknown>): SessionUser | null {
  const role = claims.role;
  if (!claims.userId || (role !== 'STUDENT' && role !== 'TEACHER' && role !== 'ADMIN')) return null;
  return {
    id: String(claims.userId),
    email: String(claims.email ?? ''),
    fullName: String(claims.fullName ?? claims.email ?? ''),
    role,
    campusId: String(claims.campusId ?? ''),
    campusName: String(claims.campusName ?? ''),
    campusCode: String(claims.campusCode ?? ''),
    studentCode: (claims.studentCode as string | null) ?? null,
    documentNumber: String(claims.documentNumber ?? ''),
  };
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, locals, redirect } = context;
  const secret = process.env.SUPABASE_JWT_SECRET?.trim() || DEV_SECRET;

  const rawToken = cookies.get('edudistribuida_token')?.value || null;
  const token = rawToken ? decodeURIComponent(rawToken) : null;
  const claims = token ? verifyJwt(token, secret) : null;
  const sessionUser = claims ? sessionUserFromClaims(claims) : null;

  // Token presente pero inválido/expirado/adulterado: se descarta la sesión.
  if (token && !sessionUser) {
    cookies.delete('edudistribuida_token', { path: '/' });
    cookies.delete('edudistribuida_user', { path: '/' });
  }

  locals.token = sessionUser ? token : null;
  locals.user = sessionUser;

  const pathname = url.pathname;

  if (pathname.startsWith('/dashboard')) {
    if (!sessionUser) {
      return redirect('/login');
    }

    // Aislamiento por rol en el servidor (el backend vuelve a validar cada petición):
    // 1. Un ESTUDIANTE no accede a /dashboard/admin (docentes / sedes)
    if (sessionUser.role === 'STUDENT' && pathname.startsWith('/dashboard/admin')) {
      return redirect('/dashboard/estudiante');
    }

    // 2. Un DOCENTE o ADMIN no accede al expediente privado /dashboard/estudiante
    if (sessionUser.role !== 'STUDENT' && pathname.startsWith('/dashboard/estudiante')) {
      return redirect('/dashboard/admin');
    }
  }

  // Con sesión válida, /login lleva directamente al panel correspondiente.
  if (pathname === '/login' && sessionUser) {
    return redirect(sessionUser.role === 'STUDENT' ? '/dashboard/estudiante' : '/dashboard/admin');
  }

  return next();
});
