import type { APIRoute } from 'astro';
import { WORKER_API_BASE } from '../../../services/apiClient';

// UUID del trabajo o código de verificación USCO-AAAA-XXXX. Cualquier otro valor se rechaza.
const CERTIFICATE_ID_REGEX =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|USCO-\d{4}-[A-Z0-9]{4,16})$/i;

/**
 * Proxy de descarga del PDF oficial hacia el Async Worker Service.
 * - Requiere sesión verificada (middleware).
 * - Nunca sustituye un certificado inexistente por otro: devuelve 404.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response('Inicia sesión para descargar certificados.', { status: 401 });
  }

  const rawId = (params.id || '').replace(/\.pdf$/i, '');
  if (!CERTIFICATE_ID_REGEX.test(rawId)) {
    return new Response('Identificador de certificado inválido.', { status: 400 });
  }

  try {
    const upstream = await fetch(`${WORKER_API_BASE}/public/certificates/${rawId}.pdf`);
    if (!upstream.ok) {
      return new Response('Certificado PDF no encontrado.', { status: upstream.status === 404 ? 404 : 502 });
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Certificado-USCO-${rawId}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('El servicio de certificados no está disponible.', { status: 503 });
  }
};
