import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración Oficial de Playwright E2E — EduDistribuida (USCO-Net)
 * Fase 5: Validación de Aceptación End-to-End de los 5 Flujos Críticos
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: './playwright-results.json' }],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PUBLIC_ASTRO_URL || 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
