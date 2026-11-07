/**
 * ============================================================================
 * EDUDISTRIBUIDA / USCO-NET — SUITE OFICIAL DE RENDIMIENTO Y ESTRÉS (k6)
 * Archivo: qa-audits/performance-k6/load-test-distributed.js
 * ============================================================================
 * Evalúa la resiliencia, concurrencia y desacoplamiento asíncrono de los 3
 * microservicios de la arquitectura Hexagonal Multi-Sede (Neiva, Pitalito,
 * Garzón y La Plata):
 *
 *  1. Escenario 1 (`academic_summary_read`):
 *     Lectura intensiva de resumen académico (`GET /api/v1/students/:id/summary`)
 *     y métricas distribuidas de sedes (`GET /api/v1/campuses`).
 *
 *  2. Escenario 2 (`chatbot_concurrent_queries`):
 *     Consultas concurrentes al microservicio Chatbot IA Híbrido (:4003)
 *     (`POST /api/v1/chat/message`) con intenciones de notas, simulación de
 *     Corte 3 (40%), horario multi-sede y calendario académico 2026-2.
 *
 *  3. Escenario 3 (`async_certificate_burst`):
 *     Ráfaga de solicitudes de certificados en PDF (`POST /api/v1/certificates/request`)
 *     validando el patrón de encolado asíncrono (`HTTP 202 Accepted` < 15 ms)
 *     en BullMQ frente al procesamiento del Worker (`PDFKit` + `QR` + `SHA-256`).
 *
 * Ejecución con k6:
 *   k6 run qa-audits/performance-k6/load-test-distributed.js
 * ============================================================================
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Configuración de URLs de los microservicios distribuidos
const CORE_URL = __ENV.CORE_SERVICE_URL || 'http://localhost:4001';
const WORKER_URL = __ENV.WORKER_SERVICE_URL || 'http://localhost:4002';
const CHATBOT_URL = __ENV.CHATBOT_SERVICE_URL || 'http://localhost:4003';
const STUDENT_CODE = __ENV.TEST_STUDENT_CODE || '20221203806';
const STUDENT_UUID = __ENV.TEST_STUDENT_ID || '44444444-4444-4444-8444-444444444403';

// Métricas personalizadas por dominio y microservicio
const coreSummaryLatency = new Trend('core_academic_summary_latency_ms', true);
const coreCampusesLatency = new Trend('core_campuses_metrics_latency_ms', true);
const chatbotInferenceLatency = new Trend('chatbot_hybrid_inference_latency_ms', true);
const asyncCertificateEnqueueLatency = new Trend('async_certificate_enqueue_202_latency_ms', true);
const workerQueueHealthLatency = new Trend('worker_bullmq_metrics_latency_ms', true);

const globalSuccessRate = new Rate('distributed_checks_success_rate');
const totalCertificatesEnqueued = new Counter('total_certificates_enqueued_202');
const totalChatbotQueriesProcessed = new Counter('total_chatbot_queries_processed');

// Configuración de los 3 escenarios concurrentes escalando 10 -> 50 -> 100 VUs
export const options = {
  scenarios: {
    academic_summary_read: {
      executor: 'ramping-vus',
      exec: 'academicSummaryReadScenario',
      startVUs: 10,
      stages: [
        { duration: '20s', target: 10 },  // Carga base: 10 VUs concurrentes
        { duration: '30s', target: 50 },  // Carga media: 50 VUs concurrentes
        { duration: '30s', target: 100 }, // Pico de estrés: 100 VUs concurrentes
        { duration: '15s', target: 0 },   // Enfriamiento gradual (Ramp-down)
      ],
      gracefulRampDown: '10s',
      tags: { service: 'core-academic-service', scenario_type: 'read_heavy' },
    },

    chatbot_concurrent_queries: {
      executor: 'ramping-vus',
      exec: 'chatbotConcurrentQueriesScenario',
      startVUs: 10,
      stages: [
        { duration: '20s', target: 10 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
      tags: { service: 'chatbot-ai-service', scenario_type: 'conversational_ai' },
    },

    async_certificate_burst: {
      executor: 'ramping-vus',
      exec: 'asyncCertificateBurstScenario',
      startVUs: 10,
      stages: [
        { duration: '20s', target: 10 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
      tags: { service: 'async-worker-bullmq', scenario_type: 'async_queue_burst' },
    },
  },

  // Umbrales estrictos de nivel de servicio (SLA / SLO) de Fase 4
  thresholds: {
    http_req_duration: ['p(95)<250', 'p(99)<420'],
    http_req_failed: ['rate<0.01'],
    distributed_checks_success_rate: ['rate>0.99'],
    'http_req_duration{scenario:academic_summary_read}': ['p(95)<180'],
    'http_req_duration{scenario:chatbot_concurrent_queries}': ['p(95)<220'],
    'http_req_duration{scenario:async_certificate_burst}': ['p(95)<120'],
    async_certificate_enqueue_202_latency_ms: ['p(95)<25', 'p(99)<50'],
  },
};

const JSON_HEADERS = {
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

/**
 * ============================================================================
 * ESCENARIO 1: Lectura Intensiva de Resumen Académico y Sedes Multi-Región
 * ============================================================================
 */
export function academicSummaryReadScenario() {
  group('Escenario 1: Core Academic Service - Resumen y Sedes (NEI/PIT/GAR/LPL)', () => {
    // 1.1 Consulta de expediente académico completo + cálculo ponderado (30/30/40)
    const summaryRes = http.get(
      `${CORE_URL}/api/v1/students/${STUDENT_CODE}/summary`,
      {
        ...JSON_HEADERS,
        tags: { endpoint: 'GET /api/v1/students/:id/summary' },
      }
    );

    coreSummaryLatency.add(summaryRes.timings.duration);

    const summaryOk = check(summaryRes, {
      '[Core] GET /students/:id/summary retorna HTTP 200': (r) => r.status === 200,
      '[Core] Resumen incluye estudiante y métricas PGA': (r) => {
        try {
          const body = r.json();
          return (
            body.success === true &&
            body.student &&
            body.student.studentCode === STUDENT_CODE &&
            typeof body.metrics.pga === 'number'
          );
        } catch {
          return false;
        }
      },
      '[Core] Tiempo de respuesta resumen < 180 ms': (r) => r.timings.duration < 180,
    });
    globalSuccessRate.add(summaryOk);

    // 1.2 Consulta de métricas distribuidas de las 4 sedes USCO
    const campusesRes = http.get(`${CORE_URL}/api/v1/campuses`, {
      ...JSON_HEADERS,
      tags: { endpoint: 'GET /api/v1/campuses' },
    });

    coreCampusesLatency.add(campusesRes.timings.duration);

    const campusesOk = check(campusesRes, {
      '[Core] GET /campuses retorna HTTP 200': (r) => r.status === 200,
      '[Core] Retorna las 4 sedes regionales (NEI, PIT, GAR, LPL)': (r) => {
        try {
          const body = r.json();
          return body.success === true && Array.isArray(body.campuses) && body.campuses.length >= 4;
        } catch {
          return false;
        }
      },
    });
    globalSuccessRate.add(campusesOk);
  });

  sleep(0.15);
}

/**
 * ============================================================================
 * ESCENARIO 2: Consultas Concurrentes al Microservicio Chatbot IA Híbrido
 * ============================================================================
 */
const CHATBOT_TEST_PROMPTS = [
  {
    intent: 'INTENT_GRADES',
    message: '¿Cuáles son mis notas actuales y mi promedio general en el semestre 2026-2?',
  },
  {
    intent: 'INTENT_NEEDED_SCORE',
    message: '¿Cuánto necesito sacar en el Corte 3 para aprobar mis materias en 3.00?',
  },
  {
    intent: 'INTENT_SCHEDULE',
    message: '¿Cuál es mi horario de clases, salones y materias matriculadas?',
  },
  {
    intent: 'INTENT_FAQ_CALENDAR',
    message: '¿Cuáles son las fechas del calendario académico 2026-2 y reglas de evaluación?',
  },
];

export function chatbotConcurrentQueriesScenario() {
  group('Escenario 2: Chatbot IA Service - Inferencia Híbrida y Motor Determinista', () => {
    const selectedPrompt =
      CHATBOT_TEST_PROMPTS[Math.floor(Math.random() * CHATBOT_TEST_PROMPTS.length)];

    const payload = JSON.stringify({
      studentId: STUDENT_CODE,
      sessionId: `k6-session-vu-${__VU}-iter-${__ITER}`,
      message: selectedPrompt.message,
      preferredMode: 'deterministic',
    });

    const chatRes = http.post(`${CHATBOT_URL}/api/v1/chat/message`, payload, {
      ...JSON_HEADERS,
      tags: {
        endpoint: 'POST /api/v1/chat/message',
        expected_intent: selectedPrompt.intent,
      },
    });

    chatbotInferenceLatency.add(chatRes.timings.duration);

    const chatOk = check(chatRes, {
      '[Chatbot] POST /chat/message retorna HTTP 200': (r) => r.status === 200,
      '[Chatbot] Respuesta estructurada con intentDetected y reply': (r) => {
        try {
          const body = r.json();
          return (
            body.success === true &&
            body.data &&
            typeof body.data.reply === 'string' &&
            body.data.intentDetected === selectedPrompt.intent
          );
        } catch {
          return false;
        }
      },
      '[Chatbot] Inferencia determinista + contexto < 200 ms': (r) =>
        r.timings.duration < 200,
    });

    if (chatOk) {
      totalChatbotQueriesProcessed.add(1);
    }
    globalSuccessRate.add(chatOk);
  });

  sleep(0.15);
}

/**
 * ============================================================================
 * ESCENARIO 3: Ráfaga Asíncrona de Certificados PDF (HTTP 202 Accepted + BullMQ)
 * ============================================================================
 */
const CERTIFICATE_TYPES = ['STUDY', 'GRADES', 'GOOD_STANDING'];

export function asyncCertificateBurstScenario() {
  group('Escenario 3: Desacoplamiento Asíncrono BullMQ - Solicitud de Certificados PDF', () => {
    const certType =
      CERTIFICATE_TYPES[Math.floor(Math.random() * CERTIFICATE_TYPES.length)];

    const requestPayload = JSON.stringify({
      studentId: STUDENT_UUID,
      studentCode: STUDENT_CODE,
      certificateType: certType,
    });

    // 3.1 Encolado no bloqueante en Core Academic Service -> BullMQ (HTTP 202 Accepted)
    const enqueueRes = http.post(
      `${CORE_URL}/api/v1/certificates/request`,
      requestPayload,
      {
        ...JSON_HEADERS,
        tags: { endpoint: 'POST /api/v1/certificates/request' },
      }
    );

    asyncCertificateEnqueueLatency.add(enqueueRes.timings.duration);

    const enqueueOk = check(enqueueRes, {
      '[Async Queue] POST /certificates/request retorna HTTP 202 Accepted': (r) =>
        r.status === 202,
      '[Async Queue] Retorna jobId y verificationCode USCO-2026-XXXX': (r) => {
        try {
          const body = r.json();
          return (
            body.success === true &&
            typeof body.jobId === 'string' &&
            typeof body.verificationCode === 'string' &&
            body.verificationCode.startsWith('USCO-2026-')
          );
        } catch {
          return false;
        }
      },
    });

    if (enqueueOk) {
      totalCertificatesEnqueued.add(1);
    }
    globalSuccessRate.add(enqueueOk);

    // 3.2 Verificación de telemetría de colas en el Worker (:4002/metrics/queues)
    const workerMetricsRes = http.get(`${WORKER_URL}/metrics/queues`, {
      ...JSON_HEADERS,
      tags: { endpoint: 'GET /metrics/queues' },
    });

    workerQueueHealthLatency.add(workerMetricsRes.timings.duration);

    const workerOk = check(workerMetricsRes, {
      '[Worker BullMQ] GET /metrics/queues retorna HTTP 200': (r) => r.status === 200,
    });
    globalSuccessRate.add(workerOk);
  });

  sleep(0.2);
}
