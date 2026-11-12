import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

export const GET: APIRoute = async ({ params }) => {
  const rawId = (params.id || '88888888-8888-4888-8888-888888888801').replace(/\.pdf$/i, '');
  const candidates = [
    path.resolve(process.cwd(), `../async-worker-service/public/certificates/${rawId}.pdf`),
    path.resolve(process.cwd(), `apps/async-worker-service/public/certificates/${rawId}.pdf`),
    path.resolve(
      process.cwd(),
      '../async-worker-service/public/certificates/88888888-8888-4888-8888-888888888801.pdf'
    ),
    path.resolve(
      process.cwd(),
      'apps/async-worker-service/public/certificates/88888888-8888-4888-8888-888888888801.pdf'
    ),
  ];

  for (const filePath of candidates) {
    try {
      const pdfBuffer = await fs.readFile(filePath);
      return new Response(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="Certificado-USCO-${rawId}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      // Intenta con la siguiente ruta candidata
    }
  }

  return new Response('Certificado PDF no encontrado', { status: 404 });
};
