import type { SessionUser } from '../env';
import type {
  AdminEnrollmentRecord,
  CampusStatItem,
  CertificateItem,
  CourseSectionItem,
  StudentEnrollmentItem,
  StudentSummaryData,
} from '../stores/academicStore';

export const CORE_API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_CORE_API_URL
    ? import.meta.env.PUBLIC_CORE_API_URL
    : 'http://localhost:4001/api/v1';

export const WORKER_API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_WORKER_API_URL
    ? import.meta.env.PUBLIC_WORKER_API_URL
    : 'http://localhost:4002';

export const CHATBOT_API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_CHATBOT_API_URL
    ? import.meta.env.PUBLIC_CHATBOT_API_URL
    : 'http://localhost:4003/api/v1/chat';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = window.localStorage.getItem('edudistribuida_token');
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|;\s*)edudistribuida_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('edudistribuida_user');
    if (raw) return JSON.parse(raw) as SessionUser;
    const match = document.cookie.match(/(?:^|;\s*)edudistribuida_user=([^;]*)/);
    if (match) return JSON.parse(decodeURIComponent(match[1])) as SessionUser;
  } catch {
    return null;
  }
  return null;
}

export function saveSessionToBrowser(token: string, user: SessionUser): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('edudistribuida_token', token);
  window.localStorage.setItem('edudistribuida_user', JSON.stringify(user));
  const maxAge = 60 * 60 * 12;
  document.cookie = `edudistribuida_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  document.cookie = `edudistribuida_user=${encodeURIComponent(JSON.stringify(user))}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearBrowserSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('edudistribuida_token');
  window.localStorage.removeItem('edudistribuida_user');
  document.cookie = 'edudistribuida_token=; Path=/; Max-Age=0; SameSite=Lax';
  document.cookie = 'edudistribuida_user=; Path=/; Max-Age=0; SameSite=Lax';
}

export function computeGradeFormula(
  cut1: number | null | undefined,
  cut2: number | null | undefined,
  cut3: number | null | undefined
) {
  const c1 = typeof cut1 === 'number' ? cut1 : 0;
  const c2 = typeof cut2 === 'number' ? cut2 : 0;
  const c3 = typeof cut3 === 'number' ? cut3 : 0;
  const accumulated = Number((c1 * 0.3 + c2 * 0.3).toFixed(2));
  const finalGrade = Number((c1 * 0.3 + c2 * 0.3 + c3 * 0.4).toFixed(2));
  const missingForThree = Math.max(0, Number(((3.0 - accumulated) / 0.4).toFixed(2)));
  const passed = finalGrade >= 3.0;
  const statusText =
    cut3 === null || cut3 === undefined
      ? accumulated >= 3.0
        ? 'APROBADA CON ACUMULADO'
        : 'EN CURSO (PENDIENTE CORTE 3)'
      : passed
        ? 'APROBADA'
        : 'REPROBADA';

  return {
    cut1: cut1 ?? null,
    cut2: cut2 ?? null,
    cut3: cut3 ?? null,
    accumulatedGrade: accumulated,
    finalGrade,
    passed,
    requiredCut3ForThree: missingForThree,
    statusText,
  };
}

export function resolveCertificatePdfUrl(cert: Partial<CertificateItem>): string {
  const idOrJob = cert.jobId || cert.id || cert.verificationCode || '';
  if (cert.pdfUrl) {
    if (cert.pdfUrl.startsWith('http://') || cert.pdfUrl.startsWith('https://')) {
      return cert.pdfUrl;
    }
    if (cert.pdfUrl.startsWith('/public/certificates/')) {
      return `${WORKER_API_BASE}${cert.pdfUrl}`;
    }
    if (cert.pdfUrl.startsWith('/api/v1/certificates/download/')) {
      return `http://localhost:4001${cert.pdfUrl}`;
    }
  }
  return `${WORKER_API_BASE}/public/certificates/${idOrJob}.pdf`;
}

export function normalizeEnrollmentItem(raw: Record<string, any>): StudentEnrollmentItem {
  const section = raw.section || {};
  const course = raw.course || section.course || {};
  const teacher = raw.teacher || section.teacher || {};
  const campus = raw.campus || section.campus || {};
  const rawGrade = raw.grade || {};

  const c1 = rawGrade.cut1 ?? raw.cut1 ?? null;
  const c2 = rawGrade.cut2 ?? raw.cut2 ?? null;
  const c3 = rawGrade.cut3 ?? raw.cut3 ?? null;
  const computed = computeGradeFormula(c1, c2, c3);

  return {
    id: String(raw.id || raw.enrollmentId || ''),
    enrollmentId: String(raw.enrollmentId || raw.id || ''),
    status: String(raw.status || 'ACTIVE'),
    paymentReference: raw.paymentReference ?? null,
    paymentStatus: String(raw.paymentStatus || 'PAID'),
    courseCode: String(raw.courseCode || course.code || 'ISW-000'),
    courseName: String(raw.courseName || course.name || 'Asignatura Académica'),
    credits: Number(raw.credits ?? course.credits ?? 3),
    semesterLevel: Number(raw.semesterLevel ?? course.semesterLevel ?? 7),
    groupNumber: String(raw.groupNumber || section.groupNumber || 'G01-NEI'),
    scheduleText: String(raw.scheduleText || section.scheduleText || 'Por definir'),
    classroom: String(raw.classroom || section.classroom || 'Aula Ingeniería'),
    teacherName: String(raw.teacherName || teacher.fullName || 'Ing. Carlos Eduardo Ramírez, M.Sc.'),
    campusName: String(raw.campusName || campus.name || 'Sede Central Neiva'),
    campusCode: String(raw.campusCode || campus.code || 'NEI'),
    grade: {
      cut1: c1,
      cut2: c2,
      cut3: c3,
      accumulatedGrade: Number(rawGrade.accumulatedGrade ?? computed.accumulatedGrade),
      finalGrade: Number(rawGrade.finalGrade ?? computed.finalGrade),
      passed: Boolean(rawGrade.passed ?? computed.passed),
      requiredCut3ForThree: Number(rawGrade.requiredCut3ForThree ?? computed.requiredCut3ForThree),
      statusText: String(rawGrade.statusText || computed.statusText),
      observations: rawGrade.observations ?? raw.observations ?? null,
    },
  };
}

export function normalizeCertificateItem(raw: Record<string, any>): CertificateItem {
  const id = String(raw.id || raw.jobId || '');
  const jobId = String(raw.jobId || raw.id || '');
  const status = (raw.status || 'COMPLETED') as CertificateItem['status'];
  const certItem: CertificateItem = {
    id,
    jobId,
    studentId: String(raw.studentId || ''),
    certificateType: (raw.certificateType || 'STUDY') as CertificateItem['certificateType'],
    status,
    verificationCode: String(raw.verificationCode || 'USCO-2026-VERIF'),
    digitalSignatureHash: raw.digitalSignatureHash ?? null,
    pdfUrl: raw.pdfUrl ?? null,
    requestedAt: String(raw.requestedAt || new Date().toISOString()),
    completedAt: raw.completedAt ? String(raw.completedAt) : null,
  };
  certItem.pdfUrl = resolveCertificatePdfUrl(certItem);
  return certItem;
}

export function normalizeStudentSummary(rawPayload: Record<string, any>): StudentSummaryData {
  const root = rawPayload.data ? rawPayload.data : rawPayload;
  const studentRaw = root.student || {};
  const campusRaw = studentRaw.campus || {};
  const periodRaw = root.period || {};
  const enrollmentsRaw: Record<string, any>[] = Array.isArray(root.enrollments) ? root.enrollments : [];
  const certificatesRaw: Record<string, any>[] = Array.isArray(root.certificates) ? root.certificates : [];

  const enrollments = enrollmentsRaw.map(normalizeEnrollmentItem);
  const certificates = certificatesRaw.map(normalizeCertificateItem);

  const metricsRaw = root.metrics || {};
  const totalCredits =
    metricsRaw.enrolledCredits ??
    enrollments.reduce((acc, item) => acc + (Number(item.credits) || 0), 0);

  const weightedSum = enrollments.reduce(
    (acc, item) => acc + item.grade.finalGrade * (Number(item.credits) || 3),
    0
  );
  const fallbackPga =
    totalCredits > 0 ? Number((weightedSum / totalCredits).toFixed(2)) : 0;

  return {
    student: {
      id: String(studentRaw.id || '44444444-4444-4444-8444-444444444403'),
      email: String(studentRaw.email || 'alvaro.andrade@usco.edu.co'),
      fullName: String(studentRaw.fullName || 'Álvaro Javier Andrade'),
      studentCode: studentRaw.studentCode ?? '20221203806',
      documentNumber: String(studentRaw.documentNumber || '1075289412'),
      role: String(studentRaw.role || 'STUDENT'),
      campusId: String(studentRaw.campusId || campusRaw.id || '11111111-1111-4111-8111-111111111101'),
      campusName: String(studentRaw.campusName || campusRaw.name || 'Sede Central Neiva - Av. Pastrana Borrero'),
      campusCode: String(studentRaw.campusCode || campusRaw.code || 'NEI'),
    },
    period: {
      id: String(periodRaw.id || '33333333-3333-4333-8333-333333333301'),
      code: String(periodRaw.code || '2026-2'),
      name: String(periodRaw.name || 'Segundo Periodo Académico 2026 (Agosto - Diciembre)'),
      isActive: Boolean(periodRaw.isActive ?? true),
    },
    metrics: {
      pga: Number(metricsRaw.pga ?? fallbackPga),
      enrolledCredits: Number(totalCredits),
      enrolledCoursesCount: Number(metricsRaw.enrolledCoursesCount ?? enrollments.length),
      approvedCoursesCount: Number(
        metricsRaw.approvedCoursesCount ?? enrollments.filter((e) => e.grade.passed).length
      ),
      financialStatus: String(metricsRaw.financialStatus || 'MATRÍCULA PAGADA'),
    },
    enrollments,
    certificates,
  };
}

export function normalizeSectionItem(raw: Record<string, any>): CourseSectionItem {
  const course = raw.course || {};
  const teacher = raw.teacher || {};
  const campus = raw.campus || {};
  const maxQuota = Number(raw.maxQuota ?? 30);
  const occupiedQuota = Number(raw.occupiedQuota ?? 0);
  const availableQuota = Number(raw.availableQuota ?? Math.max(0, maxQuota - occupiedQuota));

  return {
    id: String(raw.id || ''),
    groupNumber: String(raw.groupNumber || 'G01-NEI'),
    scheduleText: String(raw.scheduleText || 'Horario por definir'),
    classroom: String(raw.classroom || 'Aula de Ingeniería'),
    maxQuota,
    occupiedQuota,
    availableQuota,
    isEnrolled: Boolean(raw.isEnrolled ?? false),
    courseId: String(raw.courseId || course.id || ''),
    courseCode: String(raw.courseCode || course.code || 'ISW-000'),
    courseName: String(raw.courseName || course.name || 'Asignatura'),
    credits: Number(raw.credits ?? course.credits ?? 3),
    semesterLevel: Number(raw.semesterLevel ?? course.semesterLevel ?? 7),
    teacherName: String(raw.teacherName || teacher.fullName || 'Ing. Carlos Eduardo Ramírez, M.Sc.'),
    campusId: String(raw.campusId || campus.id || ''),
    campusCode: String(raw.campusCode || campus.code || 'NEI'),
    campusName: String(raw.campusName || campus.name || 'Sede Central Neiva'),
  };
}

export async function loginWithCredentials(
  email: string,
  password: string
): Promise<{ token: string; user: SessionUser }> {
  const response = await fetch(`${CORE_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'Credenciales institucionales inválidas.');
  }

  const root = payload.data ? payload.data : payload;
  const token = String(root.token || payload.token || '');
  const u = root.user || payload.user || {};
  const campus = u.campus || {};

  const user: SessionUser = {
    id: String(u.id),
    email: String(u.email),
    fullName: String(u.fullName || u.name || u.email),
    role: (u.role || 'STUDENT') as SessionUser['role'],
    campusId: String(u.campusId || campus.id || '11111111-1111-4111-8111-111111111101'),
    campusName: String(u.campusName || campus.name || 'Sede Central Neiva'),
    campusCode: String(u.campusCode || campus.code || 'NEI'),
    studentCode: u.studentCode ?? null,
    documentNumber: String(u.documentNumber || '1075289412'),
  };

  return { token, user };
}

export async function fetchStudentSummary(
  studentId: string,
  token?: string | null
): Promise<StudentSummaryData> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${CORE_API_BASE}/students/${studentId}/summary`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.message || `Error HTTP ${response.status} consultando resumen académico`);
  }

  const payload = await response.json();
  return normalizeStudentSummary(payload);
}

export async function fetchOpenSections(params: {
  campusId?: string;
  studentId?: string;
  token?: string | null;
}): Promise<CourseSectionItem[]> {
  const query = new URLSearchParams();
  if (params.campusId) query.set('campusId', params.campusId);
  if (params.studentId) query.set('studentId', params.studentId);

  const authToken = params.token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const url = `${CORE_API_BASE}/sections${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al cargar secciones disponibles`);
  }

  const payload = await response.json();
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.sections)
        ? payload.sections
        : [];

  return list.map(normalizeSectionItem);
}

export async function enrollStudentInSection(params: {
  studentId: string;
  sectionId: string;
  token?: string | null;
}): Promise<{ message: string; enrollmentId?: string }> {
  const authToken = params.token || getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${CORE_API_BASE}/enrollments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId: params.studentId,
      sectionId: params.sectionId,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'No fue posible inscribir la asignatura.');
  }

  const data = payload.data || payload;
  return {
    message: String(payload.message || data.message || 'Inscripción académica registrada exitosamente.'),
    enrollmentId: data.id || data.enrollmentId,
  };
}

export async function requestCertificateAsync(params: {
  studentId: string;
  certificateType: 'STUDY' | 'GRADES' | 'GOOD_STANDING';
  token?: string | null;
}): Promise<{ jobId: string; status: string; verificationCode: string }> {
  const authToken = params.token || getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${CORE_API_BASE}/certificates/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId: params.studentId,
      certificateType: params.certificateType,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'Error al encolar generación del certificado PDF.');
  }

  const data = payload.data || payload;
  return {
    jobId: String(data.jobId || data.id || ''),
    status: String(data.status || 'QUEUED'),
    verificationCode: String(data.verificationCode || 'USCO-2026-CERT'),
  };
}

export async function fetchCertificateJobStatus(
  jobId: string,
  token?: string | null
): Promise<CertificateItem> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${CORE_API_BASE}/certificates/${jobId}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar el estado del trabajo ${jobId}`);
  }

  const payload = await response.json();
  const data = payload.data || payload;
  return normalizeCertificateItem(data);
}

export async function fetchStudentCertificates(
  studentId: string,
  token?: string | null
): Promise<CertificateItem[]> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${CORE_API_BASE}/certificates/student/${studentId}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.certificates)
        ? payload.certificates
        : [];
  return list.map(normalizeCertificateItem);
}

export async function fetchCampusesStats(token?: string | null): Promise<CampusStatItem[]> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${CORE_API_BASE}/campuses`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al cargar estadísticas multi-sede`);
  }

  const payload = await response.json();
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.campuses)
        ? payload.campuses
        : [];

  return list.map((c: Record<string, any>) => ({
    id: String(c.id || ''),
    code: String(c.code || 'NEI'),
    name: String(c.name || 'Sede USCO'),
    city: String(c.city || 'Huila'),
    address: String(c.address || 'Huila, Colombia'),
    isActive: Boolean(c.isActive ?? true),
    studentsCount: Number(c.studentsCount ?? c.stats?.studentsCount ?? c._count?.users ?? 1),
    activeSectionsCount: Number(c.activeSectionsCount ?? c.stats?.activeSectionsCount ?? c._count?.sections ?? 1),
    enrollmentsCount: Number(c.enrollmentsCount ?? c.stats?.enrollmentsCount ?? 4),
    averageGrade: Number(c.averageGrade ?? c.stats?.averageGrade ?? 4.35),
  }));
}

export async function fetchAdminEnrollments(token?: string | null): Promise<AdminEnrollmentRecord[]> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${CORE_API_BASE}/admin/enrollments`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} consultando matrículas multi-sede`);
  }

  const payload = await response.json();
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.enrollments)
        ? payload.enrollments
        : [];

  return list.map((row: Record<string, any>) => {
    const student = row.student || {};
    const section = row.section || {};
    const course = row.course || section.course || {};
    const campus = row.campus || section.campus || student.campus || {};
    const grade = row.grade || {};

    const cut1 = grade.cut1 ?? row.cut1 ?? null;
    const cut2 = grade.cut2 ?? row.cut2 ?? null;
    const cut3 = grade.cut3 ?? row.cut3 ?? null;
    const calc = computeGradeFormula(cut1, cut2, cut3);

    return {
      enrollmentId: String(row.enrollmentId || row.id || ''),
      studentId: String(row.studentId || student.id || ''),
      studentName: String(row.studentName || student.fullName || 'Estudiante USCO'),
      studentCode: row.studentCode ?? student.studentCode ?? '20221203806',
      studentEmail: String(row.studentEmail || student.email || ''),
      campusCode: String(row.campusCode || campus.code || 'NEI'),
      campusName: String(row.campusName || campus.name || 'Sede Central Neiva'),
      courseCode: String(row.courseCode || course.code || 'ISW-401'),
      courseName: String(row.courseName || course.name || 'Ingeniería de Software II'),
      credits: Number(row.credits ?? course.credits ?? 3),
      groupNumber: String(row.groupNumber || section.groupNumber || 'G01-NEI'),
      cut1,
      cut2,
      cut3,
      finalGrade: Number(grade.finalGrade ?? row.finalGrade ?? calc.finalGrade),
      passed: Boolean(grade.passed ?? row.passed ?? calc.passed),
      statusText: String(grade.statusText || row.statusText || calc.statusText),
      observations: String(grade.observations ?? row.observations ?? ''),
    };
  });
}

export async function updateStudentGrade(params: {
  enrollmentId: string;
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  observations: string;
  token?: string | null;
}): Promise<Record<string, any>> {
  const authToken = params.token || getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${CORE_API_BASE}/grades`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      enrollmentId: params.enrollmentId,
      cut1: params.cut1,
      cut2: params.cut2,
      cut3: params.cut3,
      observations: params.observations,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'Error actualizando calificaciones.');
  }
  return payload.data || payload;
}

export interface WorkerQueueMetrics {
  status: string;
  redisConnected: boolean;
  certificatePdfQueue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    avgProcessingTimeMs: number;
  };
  notificationQueue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    avgProcessingTimeMs: number;
  };
}

export async function fetchWorkerQueueMetrics(): Promise<WorkerQueueMetrics> {
  const response = await fetch(`${WORKER_API_BASE}/metrics/queues`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Worker HTTP ${response.status}`);
  }

  const payload = await response.json();
  const root = payload.data || payload.queues || payload;
  const certQ = root.certificatePdfQueue || root.certificates || {};
  const notifQ = root.notificationQueue || root.notifications || {};

  return {
    status: String(payload.status || root.status || 'healthy'),
    redisConnected: Boolean(payload.redisConnected ?? root.redisConnected ?? true),
    certificatePdfQueue: {
      waiting: Number(certQ.waiting ?? certQ.queued ?? 0),
      active: Number(certQ.active ?? certQ.processing ?? 0),
      completed: Number(certQ.completed ?? 2),
      failed: Number(certQ.failed ?? 0),
      avgProcessingTimeMs: Number(certQ.avgProcessingTimeMs ?? certQ.averageProcessingMs ?? 145),
    },
    notificationQueue: {
      waiting: Number(notifQ.waiting ?? 0),
      active: Number(notifQ.active ?? 0),
      completed: Number(notifQ.completed ?? 4),
      failed: Number(notifQ.failed ?? 0),
      avgProcessingTimeMs: Number(notifQ.avgProcessingTimeMs ?? notifQ.averageProcessingMs ?? 38),
    },
  };
}

export interface ChatbotResponsePayload {
  sessionId: string;
  reply: string;
  engineUsed: string;
  intentDetected: string;
  toolCalled: string | null;
  latencyMs: number;
  suggestedQuickReplies: string[];
  dataAttachment: {
    type?: 'GRADES_TABLE' | 'CERTIFICATE_CARD' | 'SCHEDULE_INFO' | string;
    [key: string]: any;
  } | null;
}

export async function sendChatbotMessage(params: {
  studentId: string;
  sessionId: string;
  message: string;
  preferredMode: 'auto' | 'gemini' | 'groq' | 'deterministic';
}): Promise<ChatbotResponsePayload> {
  const response = await fetch(`${CHATBOT_API_BASE}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'Error comunicándose con el servicio Chatbot IA.');
  }

  const data = payload.data || payload;
  return {
    sessionId: String(data.sessionId || params.sessionId),
    reply: String(data.reply || data.botResponse || data.message || ''),
    engineUsed: String(data.engineUsed || 'DETERMINISTIC_RULES'),
    intentDetected: String(data.intentDetected || 'GENERAL_INQUIRY'),
    toolCalled: data.toolCalled ?? null,
    latencyMs: Number(data.latencyMs ?? 5),
    suggestedQuickReplies: Array.isArray(data.suggestedQuickReplies)
      ? data.suggestedQuickReplies
      : [
          '📊 Ver mis notas y promedio',
          '🎯 ¿Cuánto necesito en el Corte 3?',
          '📄 Generar certificado en PDF',
          '📅 Horario y fechas de matrícula',
        ],
    dataAttachment: data.dataAttachment ?? null,
  };
}
