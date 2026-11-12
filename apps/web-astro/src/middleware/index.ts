import { defineMiddleware } from 'astro:middleware';
import type { SessionUser } from '../env';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, locals, redirect } = context;

  const tokenCookie = cookies.get('edudistribuida_token')?.value || null;
  const userCookieRaw = cookies.get('edudistribuida_user')?.value || null;

  let sessionUser: SessionUser | null = null;

  if (userCookieRaw) {
    try {
      sessionUser = JSON.parse(decodeURIComponent(userCookieRaw)) as SessionUser;
    } catch {
      try {
        sessionUser = JSON.parse(userCookieRaw) as SessionUser;
      } catch {
        sessionUser = null;
      }
    }
  }

  if (!sessionUser && tokenCookie) {
    const decoded = decodeJwtPayload(tokenCookie);
    if (decoded && (decoded.id || decoded.sub || decoded.userId)) {
      sessionUser = {
        id: String(decoded.id || decoded.sub || decoded.userId),
        email: String(decoded.email || 'alvaro.andrade@usco.edu.co'),
        fullName: String(decoded.fullName || decoded.name || 'Usuario Institucional USCO'),
        role: (decoded.role || 'STUDENT') as SessionUser['role'],
        campusId: String(decoded.campusId || '11111111-1111-4111-8111-111111111101'),
        campusName: String(decoded.campusName || 'Sede Central Neiva'),
        campusCode: String(decoded.campusCode || 'NEI'),
        studentCode: (decoded.studentCode as string | null) ?? '20221203806',
        documentNumber: String(decoded.documentNumber || '1075289412'),
      };
    }
  }

  locals.token = tokenCookie;
  locals.user = sessionUser;

  const pathname = url.pathname;

  if (pathname.startsWith('/dashboard')) {
    if (!tokenCookie && !sessionUser) {
      return redirect('/login');
    }

    // Aislamiento estricto por Rol (RBAC en Servidor SSR):
    // 1. Un ESTUDIANTE jamás puede acceder a /dashboard/admin (Docente / Sedes)
    if (sessionUser?.role === 'STUDENT' && pathname.startsWith('/dashboard/admin')) {
      return redirect('/dashboard/estudiante');
    }

    // 2. Un DOCENTE o ADMIN jamás accede al expediente privado /dashboard/estudiante
    if (
      (sessionUser?.role === 'TEACHER' || sessionUser?.role === 'ADMIN') &&
      pathname.startsWith('/dashboard/estudiante')
    ) {
      return redirect('/dashboard/admin');
    }
  }

  return next();
});
