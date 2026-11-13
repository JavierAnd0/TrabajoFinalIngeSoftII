/**
 * ============================================================================
 * EDUDISTRIBUIDA / USCO-NET — AUDITORÍA OWASP TOP 10 DE CAJA NEGRA
 * Archivo: qa-audits/security-owasp/run-owasp-blackbox.mjs
 * Comando: npm run test:security   (con los 4 servicios y la BD sembrada activos)
 * ============================================================================
 * A diferencia de run-owasp-audit.mjs (que monta réplicas Express en memoria con
 * rutas reescritas), este script ataca por HTTP los servicios REALES:
 *   Core :4001 · Worker :4002 · Chatbot :4003 · Portal Astro :4321
 * Cada caso declara la respuesta esperada de un sistema seguro. Si un caso falla,
 * el script termina con código 1 (apto para CI).
 * ============================================================================
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = process.env.CORE_URL || 'http://localhost:4001';
const WORKER = process.env.WORKER_URL || 'http://localhost:4002';
const CHATBOT = process.env.CHATBOT_URL || 'http://localhost:4003';
const WEB = process.env.WEB_URL || 'http://localhost:4321';
const PASSWORD = process.env.DEMO_PASSWORD || 'Usco2026*';
const WEBHOOK_SECRET =
  process.env.PAYMENT_WEBHOOK_SECRET || 'dev-payment-webhook-secret-change-me-0000';
const REPORT_PATH =
  process.env.OWASP_REPORT_PATH || path.join(__dirname, 'owasp-blackbox-report.json');

const results = [];

async function http(method, url, { token, headers = {}, body, redirect = 'manual' } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* respuesta no JSON */
  }
  return { status: res.status, headers: res.headers, json, text };
}

async function check(category, name, fn) {
  try {
    const { passed, detail } = await fn();
    results.push({ category, name, passed, detail });
  } catch (err) {
    results.push({ category, name, passed: false, detail: `Excepción: ${err.message}` });
  }
}

const expectStatus = (res, expected) => ({
  passed: Array.isArray(expected) ? expected.includes(res.status) : res.status === expected,
  detail: `HTTP ${res.status} (esperado ${Array.isArray(expected) ? expected.join('/') : expected})${
    res.json?.errorCode || res.json?.error ? ` · ${res.json.errorCode || res.json.error}` : ''
  }`,
});

async function login(email) {
  const res = await http('POST', `${CORE}/api/v1/auth/login`, { body: { email, password: PASSWORD } });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`No se pudo iniciar sesión como ${email}: HTTP ${res.status}`);
  }
  return { token: res.json.token, user: res.json.user };
}

function forgeJwt(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function main() {
  const student = await login('alvaro.andrade@usco.edu.co');
  const teacher = await login('docente.software@usco.edu.co');
  const admin = await login('admin@usco.edu.co');
  const OTHER_STUDENT_CODE = '20231104512'; // Valentina Rojas (Sede Pitalito)

  // ---------------------------------------------------------------- A01
  const A01 = 'A01 Broken Access Control';
  await check(A01, 'Listado global de matrículas sin token', async () =>
    expectStatus(await http('GET', `${CORE}/api/v1/admin/enrollments`), 401)
  );
  await check(A01, 'Listado global de matrículas con rol STUDENT', async () =>
    expectStatus(await http('GET', `${CORE}/api/v1/admin/enrollments`, { token: student.token }), 403)
  );
  await check(A01, 'Docente solo recibe matrículas de sus propios grupos', async () => {
    const t = await http('GET', `${CORE}/api/v1/admin/enrollments`, { token: teacher.token });
    const a = await http('GET', `${CORE}/api/v1/admin/enrollments`, { token: admin.token });
    const foreign = (t.json?.data || []).filter((r) => r.campusCode !== 'NEI');
    return {
      passed: t.status === 200 && a.status === 200 && foreign.length === 0 && t.json.count < a.json.count,
      detail: `docente=${t.json?.count} filas (fuera de sus grupos: ${foreign.length}) · admin=${a.json?.count} filas`,
    };
  });
  await check(A01, 'Expediente estudiantil sin token', async () =>
    expectStatus(await http('GET', `${CORE}/api/v1/students/${OTHER_STUDENT_CODE}/summary`), 401)
  );
  await check(A01, 'Header interno falsificado (x-internal-service: chatbot-ai-service)', async () =>
    expectStatus(
      await http('GET', `${CORE}/api/v1/students/${OTHER_STUDENT_CODE}/summary`, {
        headers: { 'x-internal-service': 'chatbot-ai-service' },
      }),
      401
    )
  );
  await check(A01, 'IDOR horizontal: estudiante consulta expediente ajeno', async () =>
    expectStatus(
      await http('GET', `${CORE}/api/v1/students/${OTHER_STUDENT_CODE}/summary`, { token: student.token }),
      403
    )
  );
  await check(A01, 'Estudiante consulta su propio expediente', async () =>
    expectStatus(
      await http('GET', `${CORE}/api/v1/students/${student.user.studentCode}/summary`, { token: student.token }),
      200
    )
  );
  await check(A01, 'Escalada vertical: STUDENT modifica notas', async () =>
    expectStatus(
      await http('PUT', `${CORE}/api/v1/grades`, {
        token: student.token,
        body: { enrollmentId: crypto.randomUUID(), cut1: 5, cut2: 5, cut3: 5 },
      }),
      403
    )
  );
  await check(A01, 'Docente califica una matrícula de un grupo que no dicta', async () => {
    const a = await http('GET', `${CORE}/api/v1/admin/enrollments`, { token: admin.token });
    const foreignRow = (a.json?.data || []).find((r) => r.campusCode !== 'NEI');
    if (!foreignRow) return { passed: false, detail: 'No hay matrículas de otro docente en el seed' };
    return expectStatus(
      await http('PUT', `${CORE}/api/v1/grades`, {
        token: teacher.token,
        body: { enrollmentId: foreignRow.enrollmentId, cut1: 5, cut2: 5, cut3: 5 },
      }),
      403
    );
  });
  await check(A01, 'Solicitud de certificado sin token', async () =>
    expectStatus(
      await http('POST', `${CORE}/api/v1/certificates/request`, {
        body: { studentCode: OTHER_STUDENT_CODE, certificateType: 'GRADES' },
      }),
      401
    )
  );
  await check(A01, 'Estudiante solicita certificado a nombre de otro', async () =>
    expectStatus(
      await http('POST', `${CORE}/api/v1/certificates/request`, {
        token: student.token,
        body: { studentCode: OTHER_STUDENT_CODE, certificateType: 'GRADES' },
      }),
      403
    )
  );
  await check(A01, 'Listado de certificados de otro estudiante sin token', async () =>
    expectStatus(await http('GET', `${CORE}/api/v1/certificates/student/${OTHER_STUDENT_CODE}`), 401)
  );
  await check(A01, 'Webhook de pagos sin firma HMAC', async () =>
    expectStatus(
      await http('POST', `${CORE}/api/v1/payments/webhook`, {
        body: { paymentReference: 'PAG-USCO-2026-001', status: 'PAID' },
      }),
      401
    )
  );
  await check(A01, 'Webhook de pagos con firma HMAC válida es aceptado', async () => {
    const body = { paymentReference: 'PAG-USCO-2026-001', status: 'PAID' };
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex');
    return expectStatus(
      await http('POST', `${CORE}/api/v1/payments/webhook`, { body, headers: { 'x-webhook-signature': signature } }),
      [200, 404]
    );
  });
  await check(A01, 'Chatbot sin sesión', async () =>
    expectStatus(
      await http('POST', `${CHATBOT}/api/v1/chat/message`, {
        body: { message: 'mis notas', preferredMode: 'deterministic' },
      }),
      401
    )
  );
  await check(A01, 'Chatbot ignora studentId ajeno enviado por el navegador', async () => {
    const res = await http('POST', `${CHATBOT}/api/v1/chat/message`, {
      token: student.token,
      body: { studentId: OTHER_STUDENT_CODE, message: 'mis notas', preferredMode: 'deterministic' },
    });
    const reply = String(res.json?.data?.reply || '');
    return {
      passed: res.status === 200 && !reply.includes('Valentina') && reply.includes('Álvaro'),
      detail: `HTTP ${res.status} · responde sobre: ${reply.includes('Valentina') ? 'Valentina (ajeno)' : reply.includes('Álvaro') ? 'Álvaro (propio)' : 'desconocido'}`,
    };
  });
  await check(A01, 'Endpoint interno del worker sin token de servicio', async () =>
    expectStatus(
      await http('POST', `${WORKER}/api/v1/worker/process-certificate`, { body: { jobId: crypto.randomUUID() } }),
      401
    )
  );
  await check(A01, 'Portal: cookie de usuario falsificada con rol ADMIN', async () => {
    const fakeUser = encodeURIComponent(JSON.stringify({ id: 'x', role: 'ADMIN', email: 'x@x' }));
    const res = await fetch(`${WEB}/dashboard/admin`, {
      headers: { Cookie: `edudistribuida_user=${fakeUser}` },
      redirect: 'manual',
    });
    const location = res.headers.get('location') || '';
    return { passed: res.status === 302 && location.includes('/login'), detail: `HTTP ${res.status} → ${location || '(sin redirección)'}` };
  });

  // ---------------------------------------------------------------- A02
  const A02 = 'A02 Cryptographic Failures';
  await check(A02, 'JWT firmado con un secreto distinto', async () => {
    const forged = forgeJwt(
      { userId: admin.user.id, role: 'ADMIN', email: 'admin@usco.edu.co', iss: 'edudistribuida-core-academic-service', aud: 'edudistribuida-usco-net', exp: Math.floor(Date.now() / 1000) + 3600 },
      'otro-secreto-cualquiera-de-32-caracteres!!'
    );
    return expectStatus(await http('GET', `${CORE}/api/v1/admin/enrollments`, { token: forged }), 401);
  });
  await check(A02, 'JWT con alg "none"', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId: admin.user.id, role: 'ADMIN', email: 'a@a' })}.`;
    return expectStatus(await http('GET', `${CORE}/api/v1/auth/me`, { token }), 401);
  });
  await check(A02, 'Portal: JWT con firma inválida no abre el panel', async () => {
    const forged = forgeJwt({ userId: 'x', role: 'ADMIN', iss: 'edudistribuida-core-academic-service', aud: 'edudistribuida-usco-net', exp: Math.floor(Date.now() / 1000) + 3600 }, 'secreto-incorrecto-secreto-incorrecto');
    const res = await fetch(`${WEB}/dashboard/admin`, { headers: { Cookie: `edudistribuida_token=${forged}` }, redirect: 'manual' });
    return { passed: res.status === 302 && (res.headers.get('location') || '').includes('/login'), detail: `HTTP ${res.status} → ${res.headers.get('location')}` };
  });

  // ---------------------------------------------------------------- A03
  const A03 = 'A03 Injection';
  await check(A03, "SQLi en login (' OR 1=1 --)", async () =>
    expectStatus(
      await http('POST', `${CORE}/api/v1/auth/login`, { body: { email: "x@usco.edu.co' OR 1=1 --", password: 'x' } }),
      400
    )
  );
  await check(A03, 'XSS en el chatbot (<script>)', async () =>
    expectStatus(
      await http('POST', `${CHATBOT}/api/v1/chat/message`, {
        token: student.token,
        body: { message: '<script>alert(1)</script>', preferredMode: 'deterministic' },
      }),
      400
    )
  );
  await check(A03, 'Path traversal en descarga de PDF del worker', async () =>
    expectStatus(await http('GET', `${WORKER}/public/certificates/..%2F..%2F..%2Fpackage.json`), [400, 404])
  );
  await check(A03, 'Portal no sustituye un certificado inexistente por otro', async () => {
    const res = await fetch(`${WEB}/api/certificates/${crypto.randomUUID()}.pdf`, {
      headers: { Cookie: `edudistribuida_token=${student.token}` },
    });
    return { passed: res.status === 404, detail: `HTTP ${res.status} (esperado 404)` };
  });

  // ---------------------------------------------------------------- A05
  const A05 = 'A05 Security Misconfiguration';
  await check(A05, 'CORS no refleja orígenes no autorizados', async () => {
    const res = await http('GET', `${CORE}/api/v1/campuses`, { headers: { Origin: 'https://sitio-malicioso.example' } });
    const acao = res.headers.get('access-control-allow-origin');
    return { passed: acao !== '*' && acao !== 'https://sitio-malicioso.example', detail: `Access-Control-Allow-Origin: ${acao ?? '(ausente)'}` };
  });
  await check(A05, 'Cabeceras de seguridad Helmet presentes', async () => {
    const res = await http('GET', `${CORE}/health`);
    const needed = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options'];
    const missing = needed.filter((h) => !res.headers.get(h));
    return { passed: missing.length === 0, detail: missing.length ? `Faltan: ${missing.join(', ')}` : 'CSP, HSTS, nosniff, frame-options' };
  });
  await check(A05, 'Errores internos no exponen detalles', async () => {
    const res = await http('GET', `${CORE}/api/v1/ruta-inexistente`);
    return { passed: res.status === 404 && !/at .*\.ts:\d+/.test(res.text), detail: `HTTP ${res.status}, sin stack trace` };
  });

  // ---------------------------------------------------------------- A07 (al final: bloquea la IP 60 s)
  const A07 = 'A07 Identification & Authentication Failures';
  await check(A07, 'Rate limit tras intentos fallidos de login', async () => {
    let last = null;
    for (let i = 0; i < 10; i += 1) {
      last = await http('POST', `${CORE}/api/v1/auth/login`, { body: { email: 'alvaro.andrade@usco.edu.co', password: 'incorrecta' } });
      if (last.status === 429) break;
    }
    return expectStatus(last, 429);
  });

  const passed = results.filter((r) => r.passed).length;
  const report = {
    project: 'EduDistribuida / USCO-Net',
    type: 'OWASP Top 10 — caja negra contra servicios reales',
    executedAt: new Date().toISOString(),
    targets: { CORE, WORKER, CHATBOT, WEB },
    summary: { total: results.length, passed, failed: results.length - passed },
    results,
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  for (const r of results) {
    console.log(`${r.passed ? '✅' : '❌'} [${r.category.split(' ')[0]}] ${r.name} — ${r.detail}`);
  }
  console.log(`\nResultado: ${passed}/${results.length} controles superados · informe: ${path.relative(process.cwd(), REPORT_PATH)}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ La auditoría no pudo ejecutarse:', err.message);
  process.exit(2);
});
