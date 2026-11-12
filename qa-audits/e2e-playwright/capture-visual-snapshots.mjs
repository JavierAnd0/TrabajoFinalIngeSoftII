import { chromium } from 'playwright';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/javier/.gemini/antigravity/brain/ea35f305-e3b7-4d04-9e8b-fea9f46ff805';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4321';

async function runVisualAudit() {
  const browser = await chromium.launch({ headless: true });
  const report = {
    timestamp: new Date().toISOString(),
    checks: [],
    screenshots: [],
  };

  try {
    // 1. Mobile Student View (375x812) - Dark Mode
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const studentBtn = mobilePage.locator('[data-testid="quick-profile-student"], [data-testid="demo-student-btn"]').first();
    await studentBtn.click();
    const submitBtn = mobilePage.locator('[data-testid="login-submit-btn"], [data-testid="login-submit"]').first();
    await submitBtn.click();
    await mobilePage.waitForURL('**/dashboard/estudiante', { timeout: 10000 });
    await mobilePage.waitForTimeout(800);

    const mobileTopOverflow = await mobilePage.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      hasHorizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    report.checks.push({ name: 'Mobile 375px Student Top Overflow', ...mobileTopOverflow });

    const shot1 = path.join(ARTIFACT_DIR, 'vista_movil_estudiante_top.png');
    await mobilePage.screenshot({ path: shot1, fullPage: false });
    report.screenshots.push(shot1);

    // 2. Scroll to Simulator (#simulador) on Mobile (375x812)
    const simCard = mobilePage.locator('#simulador');
    await simCard.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(400);

    const simGeometry = await mobilePage.evaluate(() => {
      const card = document.getElementById('simulador')?.getBoundingClientRect();
      const sel = document.getElementById('sim-course-select')?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        cardRight: card ? Math.round(card.right) : null,
        selectRight: sel ? Math.round(sel.right) : null,
        selectFitsInsideCard: card && sel ? sel.right <= card.right + 1 : false,
        selectFitsViewport: sel ? sel.right <= window.innerWidth : false,
      };
    });
    report.checks.push({ name: 'Mobile 375px Simulator Select Geometry', ...simGeometry });

    const shot2 = path.join(ARTIFACT_DIR, 'vista_movil_simulador_corte3.png');
    await mobilePage.screenshot({ path: shot2, fullPage: false });
    report.screenshots.push(shot2);

    // 3. Mobile Popover Menu Open (375x812)
    await mobilePage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await mobilePage.waitForTimeout(300);
    await mobilePage.click('[data-testid="user-profile-menu-trigger"]');
    await mobilePage.waitForTimeout(300);

    const shot3 = path.join(ARTIFACT_DIR, 'vista_movil_popover_perfil.png');
    await mobilePage.screenshot({ path: shot3, fullPage: false });
    report.screenshots.push(shot3);

    await mobileContext.close();

    // 4. Desktop Modal in Light Mode (1280x800) - Verify Portal centering & button contrast
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const desktopPage = await desktopContext.newPage();

    await desktopPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const deskStudentBtn = desktopPage.locator('[data-testid="quick-profile-student"], [data-testid="demo-student-btn"]').first();
    await deskStudentBtn.click();
    const deskSubmitBtn = desktopPage.locator('[data-testid="login-submit-btn"], [data-testid="login-submit"]').first();
    await deskSubmitBtn.click();
    await desktopPage.waitForURL('**/dashboard/estudiante', { timeout: 10000 });
    await desktopPage.waitForTimeout(600);

    // Switch to Light Mode
    await desktopPage.click('[data-testid="theme-toggle-btn"]');
    await desktopPage.waitForTimeout(300);

    // Open User Profile Popover -> Apariencia y Vista modal
    await desktopPage.click('[data-testid="user-profile-menu-trigger"]');
    await desktopPage.waitForTimeout(200);
    await desktopPage.click('[data-testid="menu-item-settings"]');
    await desktopPage.waitForTimeout(400);

    const modalGeometry = await desktopPage.evaluate(() => {
      const dialogCard = document.querySelector('[role="dialog"] .glass-card')?.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        modalTop: dialogCard ? Math.round(dialogCard.top) : null,
        modalBottom: dialogCard ? Math.round(dialogCard.bottom) : null,
        isNotClippedAtTop: dialogCard ? dialogCard.top >= 16 : false,
      };
    });
    report.checks.push({ name: 'Desktop 1280x800 Light Mode Modal Geometry', ...modalGeometry });

    const shot4 = path.join(ARTIFACT_DIR, 'vista_desktop_modal_modo_claro.png');
    await desktopPage.screenshot({ path: shot4, fullPage: false });
    report.screenshots.push(shot4);

    await desktopContext.close();

    // 5. Mobile Teacher/Admin View (375x812) - Responsive Cards
    const teacherContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const teacherPage = await teacherContext.newPage();

    await teacherPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const teacherBtn = teacherPage.locator('[data-testid="quick-profile-teacher"], [data-testid="demo-teacher-btn"]').first();
    await teacherBtn.click();
    const teacherSubmitBtn = teacherPage.locator('[data-testid="login-submit-btn"], [data-testid="login-submit"]').first();
    await teacherSubmitBtn.click();
    await teacherPage.waitForURL('**/dashboard/admin', { timeout: 10000 });
    await teacherPage.waitForTimeout(800);

    const teacherOverflow = await teacherPage.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      hasHorizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    report.checks.push({ name: 'Mobile 375px Teacher Console Overflow', ...teacherOverflow });

    const shot5 = path.join(ARTIFACT_DIR, 'vista_movil_docente_cards.png');
    await teacherPage.screenshot({ path: shot5, fullPage: false });
    report.screenshots.push(shot5);

    await teacherContext.close();

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

runVisualAudit().catch((err) => {
  console.error('Error in visual audit:', err);
  process.exit(1);
});
