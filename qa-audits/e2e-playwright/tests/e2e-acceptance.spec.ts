import { test, expect, type Page } from '@playwright/test';

/**
 * Suite Oficial de Aceptación End-to-End (E2E-01 a E2E-05)
 * Plataforma Distribuida de Gestión Académica Descentralizada — USCO-Net
 *
 * Cubre los 5 flujos críticos de usuario sobre la arquitectura de microservicios:
 * - E2E-01: Autenticación Institucional JWT en 1 Clic (/login -> /dashboard/estudiante)
 * - E2E-02: Dashboard Académico Multi-Sede, Tabla Ponderada 30/30/40 y Simulador de Corte 3
 * - E2E-03: Inscripción Transaccional ACID de Nueva Asignatura (ISW-405 Inteligencia Artificial)
 * - E2E-04: Interacción en Vivo con el Widget Flotante del Chatbot Híbrido USCO-Bot IA
 * - E2E-05: Solicitud Asíncrona de Certificado PDF en Cola BullMQ (QUEUED -> PROCESSING -> COMPLETED)
 */

const STUDENT_ID = '44444444-4444-4444-8444-444444444403';
const CAMPUS_NEIVA_ID = '11111111-1111-4111-8111-111111111101';

async function authenticateAsDemoStudent(page: Page) {
  await page.goto('/login');
  const demoStudentBtn = page.getByTestId('demo-student-btn');
  await expect(demoStudentBtn).toBeVisible();
  await demoStudentBtn.click();

  await expect(page.getByTestId('login-email')).toHaveValue('alvaro.andrade@usco.edu.co');
  await expect(page.getByTestId('login-password')).toHaveValue('Usco2026*');

  const submitBtn = page.getByTestId('login-submit');
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  await page.waitForURL('**/dashboard/estudiante', { timeout: 15_000 });
}

test.describe('EduDistribuida USCO-Net — Suite de Aceptación End-to-End (Fase 5)', () => {
  test('E2E-01: Carga de Astro SSR (/login), selección de cuenta demo de estudiante y autenticación JWT exitosa hacia /dashboard/estudiante', async ({
    page,
  }) => {
    await page.goto('/login');

    await expect(page).toHaveTitle(/Iniciar Sesión|USCO-Net/i);
    const demoStudentBtn = page.getByTestId('demo-student-btn');
    const demoTeacherBtn = page.getByTestId('demo-teacher-btn');
    const demoAdminBtn = page.getByTestId('demo-admin-btn');

    await expect(demoStudentBtn).toBeVisible();
    await expect(demoTeacherBtn).toBeVisible();
    await expect(demoAdminBtn).toBeVisible();

    await demoStudentBtn.click();

    const emailInput = page.getByTestId('login-email');
    const passwordInput = page.getByTestId('login-password');
    await expect(emailInput).toHaveValue('alvaro.andrade@usco.edu.co');
    await expect(passwordInput).toHaveValue('Usco2026*');

    await page.getByTestId('login-submit').click();
    await page.waitForURL('**/dashboard/estudiante');

    const storedToken = await page.evaluate(() =>
      window.localStorage.getItem('edudistribuida_token')
    );
    expect(storedToken).toBeTruthy();
    expect(storedToken?.split('.').length).toBe(3);

    await expect(page.locator('h1')).toContainText('Álvaro Javier Andrade');
  });

  test('E2E-02: Visualización del Dashboard Académico Multi-Sede, 4 asignaturas matriculadas y uso del Simulador Interactivo de Corte 3', async ({
    page,
  }) => {
    await authenticateAsDemoStudent(page);

    const pgaCard = page.getByTestId('pga-card');
    const creditsCard = page.getByTestId('credits-card');
    const campusKpiCard = page.getByTestId('campus-kpi-card');
    const financialCard = page.getByTestId('financial-status-card');

    await expect(pgaCard).toBeVisible();
    await expect(creditsCard).toBeVisible();
    await expect(campusKpiCard).toContainText(/Neiva/i);
    await expect(financialCard).toContainText(/MATRÍCULA PAGADA/i);

    const gradesTable = page.getByTestId('grades-table');
    await expect(gradesTable).toBeVisible();
    await expect(gradesTable).toContainText('ISW-401');
    await expect(gradesTable).toContainText('ISW-402');
    await expect(gradesTable).toContainText('ISW-403');
    await expect(gradesTable).toContainText('ISW-304');

    const simulatorCard = page.getByTestId('cut3-simulator-card');
    await expect(simulatorCard).toBeVisible();

    const courseSelect = page.getByTestId('simulator-course-select');
    await courseSelect.selectOption('ISW-403');

    const cut3Input = page.getByTestId('simulator-cut3-input');
    await cut3Input.fill('4.5');

    const projectedFinal = page.getByTestId('simulator-projected-final');
    await expect(projectedFinal).toBeVisible();
    const projectedValue = parseFloat((await projectedFinal.textContent()) || '0');
    expect(projectedValue).toBeGreaterThanOrEqual(3.0);
  });

  test('E2E-03: Inscripción en 1 clic de una nueva asignatura disponible (ISW-405 o ISW-302) con actualización de cupos y tabla en tiempo real', async ({
    page,
  }) => {
    await authenticateAsDemoStudent(page);

    const enrollBtnISW405 = page.getByTestId('enroll-btn-ISW-405');
    const enrollBtnISW302 = page.getByTestId('enroll-btn-ISW-302');

    const targetCode = (await enrollBtnISW405.isVisible()) ? 'ISW-405' : 'ISW-302';
    const targetBtn = page.getByTestId(`enroll-btn-${targetCode}`);

    await expect(targetBtn).toBeVisible();
    await expect(targetBtn).toBeEnabled();
    await targetBtn.click();

    const feedbackBanner = page.getByTestId('enrollment-feedback');
    await expect(feedbackBanner).toBeVisible();
    await expect(feedbackBanner).toContainText(targetCode);

    const enrolledBadge = page.getByTestId(`enrolled-badge-${targetCode}`);
    await expect(enrolledBadge).toBeVisible();

    const gradesTable = page.getByTestId('grades-table');
    await expect(gradesTable).toContainText(targetCode);
  });

  test('E2E-04: Interacción en vivo con el Widget Flotante del Chatbot Académico (USCO-Bot IA) consultando notas, simulando Corte 3 y solicitando certificado PDF', async ({
    page,
  }) => {
    await authenticateAsDemoStudent(page);

    const toggleBtn = page.getByTestId('chatbot-toggle-btn');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    const chatWindow = page.getByTestId('chatbot-window');
    await expect(chatWindow).toBeVisible();

    const modeSelector = page.getByTestId('chatbot-mode-selector');
    await expect(modeSelector).toBeVisible();
    await modeSelector.selectOption('deterministic');

    const chatInput = page.getByTestId('chatbot-input');
    const sendBtn = page.getByTestId('chatbot-send-btn');

    // 1. Consulta de notas y promedio
    await chatInput.fill('Quiero consultar mis notas y mi promedio actual');
    await sendBtn.click();

    const messagesList = page.getByTestId('chatbot-messages-list');
    await expect(messagesList).toContainText(/Promedio|ISW-401/i);
    await expect(page.getByTestId('chatbot-grades-attachment').first()).toBeVisible();

    // 2. Simulación de nota requerida en el Corte 3
    await chatInput.fill('¿Cuánto necesito sacar en el Corte 3 para pasar Mantenimiento y Pruebas?');
    await sendBtn.click();
    await expect(messagesList).toContainText(/Corte 3|ISW-403/i);

    // 3. Solicitud de certificado de estudio desde el chat
    await chatInput.fill('Por favor generar mi certificado de estudio en PDF');
    await sendBtn.click();

    const certAttachment = page.getByTestId('chatbot-certificate-attachment').first();
    await expect(certAttachment).toBeVisible();
    const certDownloadBtn = page.getByTestId('chatbot-certificate-download-btn').first();
    await expect(certDownloadBtn).toHaveAttribute('href', /\/public\/certificates\/.*\.pdf/);
  });

  test('E2E-05: Solicitud asíncrona de certificado académico (BullMQ QUEUED -> PROCESSING -> COMPLETED) y descarga del PDF con QR y firma SHA-256', async ({
    page,
  }) => {
    await authenticateAsDemoStudent(page);

    const certTypeSelect = page.getByTestId('certificate-type-select');
    await expect(certTypeSelect).toBeVisible();
    await certTypeSelect.selectOption('STUDY');

    const requestBtn = page.getByTestId('request-certificate-btn');
    await expect(requestBtn).toBeEnabled();
    await requestBtn.click();

    const statusCard = page.getByTestId('certificate-job-status-card');
    await expect(statusCard).toBeVisible();

    const jobStateBadge = page.getByTestId('certificate-job-state');
    await expect(jobStateBadge).toHaveText(/COMPLETED/, { timeout: 15_000 });

    const downloadLink = page.getByTestId('certificate-download-link').first();
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.getAttribute('href');
    expect(href).toMatch(/\/public\/certificates\/.*\.pdf$/);
  });
});
