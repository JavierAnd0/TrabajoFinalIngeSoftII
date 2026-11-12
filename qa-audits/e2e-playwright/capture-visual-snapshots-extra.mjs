import { chromium } from 'playwright';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/javier/.gemini/antigravity/brain/ea35f305-e3b7-4d04-9e8b-fea9f46ff805';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4321';

const MOBILE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') {
        const scroller = el.closest('.overflow-x-auto');
        if (!scroller || scroller === el) {
          offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} -> ${Math.round(r.right)}`);
        }
      }
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      offenders: offenders.slice(0, 8),
    };
  });
}

async function login(page, profile) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator(`[data-testid="quick-profile-${profile}"], [data-testid="demo-${profile}-btn"]`).first().click();
  await page.locator('[data-testid="login-submit-btn"], [data-testid="login-submit"]').first().click();
  await page.waitForURL('**/dashboard/**', { timeout: 10000 });
  await page.waitForTimeout(800);
}

async function shot(page, name, report, fullPage = false) {
  const p = path.join(ARTIFACT_DIR, name);
  await page.screenshot({ path: p, fullPage });
  report.screenshots.push(p);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const report = { timestamp: new Date().toISOString(), checks: [], screenshots: [] };
  try {
    // A. Login en móvil
    let ctx = await browser.newContext(MOBILE);
    let page = await ctx.newPage();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    report.checks.push({ name: 'login-mobile', ...(await overflow(page)) });
    await shot(page, 'extra_movil_login.png', report);

    // B. Estudiante móvil en Modo Claro (página completa) + chatbot abierto
    await login(page, 'student');
    await page.click('[data-testid="theme-toggle-btn"]');
    await page.waitForTimeout(400);
    report.checks.push({ name: 'student-mobile-light', ...(await overflow(page)) });
    await shot(page, 'extra_movil_estudiante_claro_full.png', report, true);
    await page.click('[data-testid="chatbot-toggle-btn"]');
    await page.waitForTimeout(400);
    report.checks.push({ name: 'student-mobile-chatbot', ...(await overflow(page)) });
    await shot(page, 'extra_movil_chatbot_claro.png', report);
    await ctx.close();

    // C. Admin multi-sede en móvil (página completa, oscuro)
    ctx = await browser.newContext(MOBILE);
    page = await ctx.newPage();
    await login(page, 'admin');
    report.checks.push({ name: 'admin-mobile', url: page.url(), ...(await overflow(page)) });
    await shot(page, 'extra_movil_admin_full.png', report, true);
    await ctx.close();

    // D. Docente en escritorio, Modo Claro (página completa)
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    await login(page, 'teacher');
    await page.click('[data-testid="theme-toggle-btn"]');
    await page.waitForTimeout(400);
    report.checks.push({ name: 'teacher-desktop-light', url: page.url(), ...(await overflow(page)) });
    await shot(page, 'extra_desktop_docente_claro_full.png', report, true);
    await ctx.close();

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
