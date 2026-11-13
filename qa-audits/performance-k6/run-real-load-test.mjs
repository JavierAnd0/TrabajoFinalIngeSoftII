/**
 * ============================================================================
 * EDUDISTRIBUIDA / USCO-NET — PRUEBA DE CARGA CONTRA LOS SERVICIOS REALES
 * Archivo: qa-audits/performance-k6/run-real-load-test.mjs
 * Comando: npm run test:load   (servicios + PostgreSQL + Redis activos)
 * ============================================================================
 * Complementa load-test-distributed.js (k6). Este runner en Node no requiere k6:
 * abre N conexiones concurrentes en bucle cerrado durante una ventana fija y mide
 * latencia p50/p95/p99, throughput (RPS) y tasa de error de cada endpoint.
 * A diferencia de run-benchmark-and-charts.mjs, NO usa servidores simulados:
 * todas las peticiones atraviesan Express → Prisma → PostgreSQL (y Redis/BullMQ).
 * Genera: load-test-real-results.json y dos gráficos SVG en docs/fase4-informe-calidad/.
 * ============================================================================
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CORE = process.env.CORE_URL || 'http://localhost:4001';
const CHATBOT = process.env.CHATBOT_URL || 'http://localhost:4003';
const DURATION_MS = Number(process.env.LOAD_DURATION_MS || 8000);
const CONCURRENCY_LEVELS = (process.env.LOAD_CONCURRENCY || '10,50,100').split(',').map(Number);

async function login(email) {
  const res = await fetch(`${CORE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.DEMO_PASSWORD || 'Usco2026*' }),
  });
  const json = await res.json();
  if (!json.token) throw new Error(`Login fallido para ${email}`);
  return json;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function runScenario(scenario, concurrency) {
  const latencies = [];
  let errors = 0;
  const deadline = performance.now() + DURATION_MS;

  async function worker() {
    while (performance.now() < deadline) {
      const t0 = performance.now();
      try {
        const res = await fetch(scenario.url, scenario.init());
        await res.arrayBuffer();
        if (res.status !== scenario.expectStatus) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  }

  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedS = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const round = (n) => Number(n.toFixed(1));
  return {
    scenario: scenario.name,
    concurrency,
    requests: latencies.length,
    rps: round(latencies.length / elapsedS),
    p50: round(percentile(latencies, 50)),
    p95: round(percentile(latencies, 95)),
    p99: round(percentile(latencies, 99)),
    max: round(latencies[latencies.length - 1] || 0),
    errorRatePct: round((errors / Math.max(1, latencies.length)) * 100),
  };
}

// ---------------------------------------------------------------- Gráficos SVG
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const SVG_STYLE = `<style>
  .bg{fill:#fcfcfb} .t{font:600 15px system-ui,sans-serif;fill:#0b0b0b} .s{font:12px system-ui,sans-serif;fill:#52514e}
  .lbl{font:12px system-ui,sans-serif;fill:#0b0b0b} .ax{stroke:#d6d5d0;stroke-width:1} .grid{stroke:#ecebe7;stroke-width:1}
</style>`;

function barChartP95(rows, concurrency) {
  const data = rows.filter((r) => r.concurrency === concurrency);
  const W = 760, rowH = 46, top = 64, left = 300, right = 70;
  const H = top + data.length * rowH + 40;
  const max = Math.max(...data.map((d) => d.p95)) * 1.1;
  const x = (v) => left + (v / max) * (W - left - right);
  const bars = data
    .map((d, i) => {
      const y = top + i * rowH;
      return `<text class="lbl" x="${left - 12}" y="${y + 20}" text-anchor="end">${esc(d.scenario)}</text>
  <rect x="${left}" y="${y + 6}" width="${Math.max(2, x(d.p95) - left)}" height="22" rx="4" fill="#2a78d6"><title>${esc(d.scenario)}: p50 ${d.p50} ms · p95 ${d.p95} ms · p99 ${d.p99} ms</title></rect>
  <text class="lbl" x="${x(d.p95) + 8}" y="${y + 22}">${d.p95} ms</text>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Latencia p95 por endpoint con ${concurrency} usuarios concurrentes">
${SVG_STYLE}
  <rect class="bg" width="${W}" height="${H}"/>
  <text class="t" x="24" y="30">Latencia p95 por endpoint · ${concurrency} usuarios concurrentes</text>
  <text class="s" x="24" y="48">Servicios reales (Express + Prisma + PostgreSQL). Menor es mejor.</text>
  <line class="ax" x1="${left}" y1="${top}" x2="${left}" y2="${H - 34}"/>
  ${bars}
</svg>\n`;
}

function lineChartRps(rows) {
  const names = [...new Set(rows.map((r) => r.scenario))];
  const colors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
  const W = 760, H = 380, left = 64, right = 210, top = 64, bottom = 48;
  const maxRps = Math.max(...rows.map((r) => r.rps)) * 1.1;
  const levels = CONCURRENCY_LEVELS;
  const x = (c) => left + (levels.indexOf(c) / Math.max(1, levels.length - 1)) * (W - left - right);
  const y = (v) => H - bottom - (v / maxRps) * (H - top - bottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxRps * f));
  const grid = ticks
    .map((t) => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"/><text class="s" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)
    .join('');
  const xLabels = levels.map((c) => `<text class="s" x="${x(c)}" y="${H - bottom + 20}" text-anchor="middle">${c}</text>`).join('');
  const series = names
    .map((n, i) => {
      const pts = rows.filter((r) => r.scenario === n).sort((a, b) => a.concurrency - b.concurrency);
      const d = pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.concurrency)},${y(p.rps)}`).join(' ');
      const last = pts[pts.length - 1];
      const dots = pts
        .map((p) => `<circle cx="${x(p.concurrency)}" cy="${y(p.rps)}" r="4.5" fill="${colors[i]}" stroke="#fcfcfb" stroke-width="2"><title>${esc(n)} · ${p.concurrency} usuarios: ${p.rps} req/s</title></circle>`)
        .join('');
      return `<path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="2"/>${dots}<text class="lbl" x="${x(last.concurrency) + 10}" y="${y(last.rps) + 4}">${esc(n)}</text>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Throughput por endpoint según usuarios concurrentes">
${SVG_STYLE}
  <rect class="bg" width="${W}" height="${H}"/>
  <text class="t" x="24" y="30">Throughput (peticiones/segundo) según usuarios concurrentes</text>
  <text class="s" x="24" y="48">Una curva que se aplana indica saturación del servicio.</text>
  ${grid}${xLabels}
  <text class="s" x="${(left + W - right) / 2}" y="${H - 10}" text-anchor="middle">Usuarios concurrentes</text>
  ${series}
</svg>\n`;
}

async function main() {
  const student = await login('alvaro.andrade@usco.edu.co');
  const admin = await login('admin@usco.edu.co');
  const auth = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  const scenarios = [
    { name: 'GET /campuses (lectura pública)', url: `${CORE}/api/v1/campuses`, expectStatus: 200, init: () => ({}) },
    {
      name: 'GET /students/:id/summary',
      url: `${CORE}/api/v1/students/${student.user.studentCode}/summary`,
      expectStatus: 200,
      init: () => ({ headers: auth(student.token) }),
    },
    {
      name: 'GET /admin/enrollments (admin)',
      url: `${CORE}/api/v1/admin/enrollments`,
      expectStatus: 200,
      init: () => ({ headers: auth(admin.token) }),
    },
    {
      name: 'POST /chat/message (reglas)',
      url: `${CHATBOT}/api/v1/chat/message`,
      expectStatus: 200,
      init: () => ({
        method: 'POST',
        headers: auth(student.token),
        body: JSON.stringify({ message: '¿Cuánto necesito en el corte 3?', preferredMode: 'deterministic' }),
      }),
    },
  ];

  const rows = [];
  for (const sc of scenarios) {
    for (const c of CONCURRENCY_LEVELS) {
      const r = await runScenario(sc, c);
      rows.push(r);
      console.log(`${r.scenario.padEnd(34)} c=${String(c).padStart(3)}  ${String(r.rps).padStart(7)} req/s  p50 ${r.p50} ms  p95 ${r.p95} ms  p99 ${r.p99} ms  errores ${r.errorRatePct}%`);
    }
  }

  const report = {
    project: 'EduDistribuida / USCO-Net',
    type: 'Prueba de carga contra servicios reales (bucle cerrado)',
    executedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model,
      note: 'Servicios en modo desarrollo (tsx) en una sola máquina, PostgreSQL 16 y Redis 7 locales.',
    },
    durationPerStepMs: DURATION_MS,
    results: rows,
  };
  await fs.writeFile(path.join(__dirname, 'load-test-real-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  const docsDir = path.join(ROOT, 'docs/fase4-informe-calidad');
  await fs.writeFile(path.join(docsDir, 'real_latency_p95_by_endpoint.svg'), barChartP95(rows, 50));
  await fs.writeFile(path.join(docsDir, 'real_throughput_vs_concurrency.svg'), lineChartRps(rows));
  console.log('\nResultados: qa-audits/performance-k6/load-test-real-results.json · gráficos SVG en docs/fase4-informe-calidad/');
}

main().catch((err) => {
  console.error('❌ Prueba de carga fallida:', err.message);
  process.exit(1);
});
