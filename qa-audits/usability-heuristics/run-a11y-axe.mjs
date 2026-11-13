/**
 * ============================================================================
 * EDUDISTRIBUIDA / USCO-NET — ESCANEO AUTOMÁTICO DE ACCESIBILIDAD (axe-core)
 * Archivo: qa-audits/usability-heuristics/run-a11y-axe.mjs
 * Comando: npm run test:a11y   (portal :4321 y servicios activos)
 * ============================================================================
 * Abre las páginas REALES del portal con cada rol (escritorio y móvil), inyecta
 * axe-core y registra las violaciones WCAG 2.0/2.1 nivel A y AA.
 * Complementa la evaluación heurística experta documentada en la Fase 4.
 * Variable opcional: PW_CHROMIUM_PATH para usar un Chromium ya instalado.
 * ============================================================================
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const axeSource = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf-8');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB_URL || 'http://localhost:4321';
const CORE = process.env.CORE_URL || 'http://localhost:4001';

async function tokenFor(email) {
  const res = await fetch(`${CORE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.DEMO_PASSWORD || 'Usco2026*' }),
  });
  return (await res.json()).token;
}

const pages = [
  { name: 'Login', path: '/login', email: null },
  { name: 'Panel estudiante', path: '/dashboard/estudiante', email: 'alvaro.andrade@usco.edu.co' },
  { name: 'Planilla docente', path: '/dashboard/admin', email: 'docente.software@usco.edu.co' },
  { name: 'Consolidado admin', path: '/dashboard/admin', email: 'admin@usco.edu.co' },
];
const viewports = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
);
const results = [];

for (const vp of viewports) {
  for (const pg of pages) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    if (pg.email) {
      const token = await tokenFor(pg.email);
      await context.addCookies([{ name: 'edudistribuida_token', value: token, url: WEB }]);
    }
    const page = await context.newPage();
    await page.goto(`${WEB}${pg.path}`, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    );
    results.push({
      page: pg.name,
      viewport: vp.name,
      url: pg.path,
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        sample: v.nodes[0]?.target?.join(' '),
      })),
      passes: axe.passes.length,
    });
    await context.close();
  }
}
await browser.close();

const total = results.reduce((acc, r) => acc + r.violations.reduce((a, v) => a + v.nodes, 0), 0);
const report = {
  project: 'EduDistribuida / USCO-Net',
  type: 'Escaneo axe-core WCAG 2.1 A/AA sobre páginas reales',
  executedAt: new Date().toISOString(),
  summary: { pagesScanned: results.length, totalViolationNodes: total },
  results,
};
await fs.writeFile(path.join(__dirname, 'a11y-axe-report.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const r of results) {
  const n = r.violations.reduce((a, v) => a + v.nodes, 0);
  console.log(`${n === 0 ? '✅' : '⚠️ '} ${r.page} (${r.viewport}): ${n} nodos con violaciones${n ? ' → ' + r.violations.map((v) => `${v.id}[${v.impact}]×${v.nodes}`).join(', ') : ''}`);
}
console.log(`\nTotal: ${total} nodos con violaciones · informe: qa-audits/usability-heuristics/a11y-axe-report.json`);
