import { chromium } from 'playwright';
import path from 'node:path';

const DIR = '/Users/javier/.gemini/antigravity/brain/ea35f305-e3b7-4d04-9e8b-fea9f46ff805';
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const out = [];

async function login(page, role) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.click(`[data-testid="demo-${role}-btn"]`);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL('**/dashboard/**');
  await page.waitForTimeout(700);
}
const snap = async (page, name, opts = {}) => {
  const p = path.join(DIR, name);
  await page.screenshot({ path: p, ...opts });
  out.push(p);
};

const browser = await chromium.launch({ headless: true });

// Escritorio claro: estudiante popover + modal perfil + chatbot
let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('usco_theme', 'light'));
let page = await ctx.newPage();
await login(page, 'student');
await page.click('[data-testid="user-profile-menu-trigger"]');
await page.waitForTimeout(250);
await snap(page, 'ux_popover_estudiante.png', { clip: { x: 880, y: 0, width: 400, height: 520 } });
await page.click('[data-testid="menu-item-profile"]');
await page.waitForTimeout(350);
const closeCount = await page.locator('[role="dialog"] button:has-text("Cerrar")').count();
await snap(page, 'ux_modal_perfil.png');
await page.click('[data-testid="modal-close-btn"]');
await page.click('[data-testid="chatbot-toggle-btn"]');
await page.waitForTimeout(350);
await snap(page, 'ux_chatbot_abierto.png', { clip: { x: 820, y: 100, width: 460, height: 700 } });
await ctx.close();

// Docente escritorio oscuro + popover
ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
page = await ctx.newPage();
await login(page, 'teacher');
await snap(page, 'ux_docente_full.png', { fullPage: true });
await page.click('[data-testid="user-profile-menu-trigger"]');
await page.waitForTimeout(250);
await snap(page, 'ux_popover_docente.png', { clip: { x: 880, y: 0, width: 400, height: 480 } });
await ctx.close();

// Admin móvil popover
ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page = await ctx.newPage();
await login(page, 'admin');
await page.click('[data-testid="user-profile-menu-trigger"]');
await page.waitForTimeout(250);
const overflow = await page.evaluate(() => {
  const r = document.querySelector('[data-testid="user-profile-popover"]').getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth };
});
await snap(page, 'ux_popover_admin_movil.png');
await ctx.close();

await browser.close();
console.log(JSON.stringify({ closeTextButtonsInProfileModal: closeCount, adminPopoverMobile: overflow, out }, null, 2));
