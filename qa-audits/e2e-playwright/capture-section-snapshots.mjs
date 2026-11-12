import { chromium } from 'playwright';
import path from 'node:path';

const DIR = '/Users/javier/.gemini/antigravity/brain/ea35f305-e3b7-4d04-9e8b-fea9f46ff805';
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const sections = process.argv.slice(2).length ? process.argv.slice(2) : ['#calificaciones', '#matricula', '#certificados'];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('usco_theme', 'light'));
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.click('[data-testid="demo-student-btn"]');
await page.locator('[data-testid="login-submit-btn"], [data-testid="login-submit"]').first().click();
await page.waitForURL('**/dashboard/**');
await page.waitForTimeout(800);
for (const sel of sections) {
  const el = page.locator(sel).first();
  const file = path.join(DIR, `seccion_claro_${sel.replace(/[^a-z]/gi, '')}.png`);
  await el.screenshot({ path: file });
  console.log(file);
}
await browser.close();
