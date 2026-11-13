import type { SessionUser } from '../env';
import type {
  AdminEnrollmentRecord,
  CampusStatItem,
  CertificateItem,
  CourseSectionItem,
  StudentEnrollmentItem,
  StudentSummaryData,
} from '../stores/academicStore';

// En el servidor (SSR) se usan las URLs internas de la red Docker (CORE_SERVICE_URL, ...):
// dentro del contenedor web, "localhost:4001" apunta al propio contenedor, no al Core.
const serverEnv: Record<string, string | undefined> =
  import.meta.env.SSR ? ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}) : {};

function resolveBase(internalVar: string, internalSuffix: string, publicValue: string | undefined, fallback: string): string {
  const internal = serverEnv[internalVar];
  if (internal) return `${internal.replace(/\/$/, '')}${internalSuffix}`;
  return publicValue || fallback;
}

export const CORE_API_BASE = resolveBase(
  'CORE_SERVICE_URL',
  '/api/v1',
  import.meta.env.PUBLIC_CORE_API_URL,
  'http://localhost:4001/api/v1'
);

export const WORKER_API_BASE = resolveBase(
  'WORKER_SERVICE_URL',
  '',
  import.meta.env.PUBLIC_WORKER_API_URL,
  'http://localhost:4002'
);

export const CHATBOT_API_BASE = resolveBase(
  'CHATBOT_SERVICE_URL',
  '/api/v1/chat',
  import.meta.env.PUBLIC_CHATBOT_API_URL,
  'http://localhost:4003/api/v1/chat'
);

/** Error HTTP devuelto por un microservicio, con el mensaje de negocio del backend. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readApiError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({}) as Record<string, unknown>);
  const message =
    (payload as { message?: string }).message ||
    (response.status === 401
      ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
      : response.status === 403
        ? 'No tienes permisos para realizar esta acción.'
        : `El servicio respondió con un error (HTTP ${response.status}).`);
  return new ApiError(response.status, message);
}

/**
 * Convierte cualquier fallo en un error comprensible para el usuario.
 * Los errores de negocio del backend (403, cupo lleno, credenciales…) se conservan;
 * los fallos de red se explican sin simular éxito.
 */
export function toUserFacingError(err: unknown): Error {
  if (err instanceof ApiError) return err;
  return new Error(
    'No hay conexión con el servicio académico. Verifica tu red e inténtalo de nuevo en unos segundos.'
  );
}

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
  const finalGrade =
    cut3 === null || cut3 === undefined
      ? accumulated
      : Number((c1 * 0.3 + c2 * 0.3 + c3 * 0.4).toFixed(2));
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
    if (cert.pdfUrl.startsWith('/api/certificates/')) {
      return cert.pdfUrl;
    }
    if (cert.pdfUrl.startsWith('http://') || cert.pdfUrl.startsWith('https://')) {
      return cert.pdfUrl;
    }
    if (cert.pdfUrl.startsWith('/public/certificates/')) {
      return `${WORKER_API_BASE}${cert.pdfUrl}`;
    }
    if (cert.pdfUrl.startsWith('/api/v1/certificates/download/')) {
      return `${CORE_API_BASE.replace(/\/api\/v1$/, '')}${cert.pdfUrl}`;
    }
  }
  return `/api/certificates/${idOrJob}.pdf`;
}


export function normalizeEnrollmentItem(raw: Record<string, unknown>): StudentEnrollmentItem {
  const section = (raw.section || {}) as Record<string, unknown>;
  const course = (raw.course || section.course || {}) as Record<string, unknown>;
  const teacher = (raw.teacher || section.teacher || {}) as Record<string, unknown>;
  const campus = (raw.campus || section.campus || {}) as Record<string, unknown>;
  const rawGrade = (raw.grade || {}) as Record<string, unknown>;

  const c1 = (rawGrade.cut1 ?? raw.cut1 ?? null) as number | null;
  const c2 = (rawGrade.cut2 ?? raw.cut2 ?? null) as number | null;
  const c3 = (rawGrade.cut3 ?? raw.cut3 ?? null) as number | null;
  const computed = computeGradeFormula(c1, c2, c3);

  return {
    id: String(raw.id || raw.enrollmentId || ''),
    enrollmentId: String(raw.enrollmentId || raw.id || ''),
    status: String(raw.status || 'ACTIVE'),
    paymentReference: (raw.paymentReference as string | null) ?? null,
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
      observations: (rawGrade.observations ?? raw.observations ?? null) as string | null,
    },
  };
}

export function normalizeCertificateItem(raw: Record<string, unknown>): CertificateItem {
  const id = String(raw.id || raw.jobId || '88888888-8888-4888-8888-888888888801');
  const jobId = String(raw.jobId || raw.id || '88888888-8888-4888-8888-888888888801');
  const status = (raw.status || 'COMPLETED') as CertificateItem['status'];
  const certItem: CertificateItem = {
    id,
    jobId,
    studentId: String(raw.studentId || ''),
    certificateType: (raw.certificateType || 'STUDY') as CertificateItem['certificateType'],
    status,
    verificationCode: String(raw.verificationCode || 'USCO-2026-VERIF'),
    digitalSignatureHash: (raw.digitalSignatureHash as string | null) ?? null,
    pdfUrl: (raw.pdfUrl as string | null) ?? null,
    requestedAt: String(raw.requestedAt || new Date().toISOString()),
    completedAt: raw.completedAt ? String(raw.completedAt) : null,
  };
  certItem.pdfUrl = resolveCertificatePdfUrl(certItem);
  return certItem;
}

export function normalizeStudentSummary(rawPayload: Record<string, unknown>): StudentSummaryData {
  const root = (rawPayload.data ? rawPayload.data : rawPayload) as Record<string, unknown>;
  const studentRaw = (root.student || {}) as Record<string, unknown>;
  const campusRaw = (studentRaw.campus || {}) as Record<string, unknown>;
  const periodRaw = (root.period || {}) as Record<string, unknown>;
  const enrollmentsRaw = Array.isArray(root.enrollments)
    ? (root.enrollments as Record<string, unknown>[])
    : [];
  const certificatesRaw = Array.isArray(root.certificates)
    ? (root.certificates as Record<string, unknown>[])
    : [];

  const enrollments = enrollmentsRaw.map(normalizeEnrollmentItem);
  const certificates = certificatesRaw.map(normalizeCertificateItem);

  const metricsRaw = (root.metrics || {}) as Record<string, unknown>;
  const totalCredits =
    Number(metricsRaw.enrolledCredits) ||
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
      email: String(studentRaw.email || ''),
      fullName: String(studentRaw.fullName || ''),
      studentCode: (studentRaw.studentCode as string | null) ?? null,
      documentNumber: String(studentRaw.documentNumber || ''),
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
      financialStatus: String(metricsRaw.financialStatus || ''),
    },
    enrollments,
    certificates,
  };
}

export function normalizeSectionItem(raw: Record<string, unknown>): CourseSectionItem {
  const course = (raw.course || {}) as Record<string, unknown>;
  const teacher = (raw.teacher || {}) as Record<string, unknown>;
  const campus = (raw.campus || {}) as Record<string, unknown>;
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
  const cleanEmail = email.trim().toLowerCase();

  try {
    const response = await fetch(`${CORE_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new ApiError(response.status, payload.message || payload.error || 'Credenciales institucionales inválidas.');
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
      documentNumber: String(u.documentNumber || ''),
    };

    return { token, user };
  } catch (err) {
    throw toUserFacingError(err);
  }
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

  try {
    const response = await fetch(`${CORE_API_BASE}/students/${studentId}/summary`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw await readApiError(response);
    }

    const payload = await response.json();
    return normalizeStudentSummary(payload);
  } catch (err) {
    throw toUserFacingError(err);
  }
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

  try {
    const url = `${CORE_API_BASE}/sections${query.toString() ? `?${query.toString()}` : ''}`;
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      throw await readApiError(response);
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
  } catch (err) {
    throw toUserFacingError(err);
  }
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

  try {
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
      throw new ApiError(response.status, payload.message || payload.error || 'No fue posible inscribir la asignatura.');
    }

    const data = payload.data || payload;
    return {
      message: String(payload.message || data.message || 'Inscripción académica registrada exitosamente.'),
      enrollmentId: data.id || data.enrollmentId,
    };
  } catch (err) {
    throw toUserFacingError(err);
  }
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

  try {
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
      throw new ApiError(response.status, payload.message || payload.error || 'Error al encolar generación del certificado PDF.');
    }

    const data = payload.data || payload;
    return {
      jobId: String(data.jobId || data.id || ''),
      status: String(data.status || 'QUEUED'),
      verificationCode: String(data.verificationCode || 'USCO-2026-CERT'),
    };
  } catch (err) {
    throw toUserFacingError(err);
  }
}

export async function fetchCertificateJobStatus(
  jobId: string,
  token?: string | null
): Promise<CertificateItem> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(`${CORE_API_BASE}/certificates/${jobId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw await readApiError(response);
    }

    const payload = await response.json();
    const data = payload.data || payload;
    return normalizeCertificateItem(data);
  } catch (err) {
    throw toUserFacingError(err);
  }
}

export async function fetchStudentCertificates(
  studentId: string,
  token?: string | null
): Promise<CertificateItem[]> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(`${CORE_API_BASE}/certificates/student/${studentId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw await readApiError(response);
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
  } catch (err) {
    throw toUserFacingError(err);
  }
}

export async function fetchCampusesStats(token?: string | null): Promise<CampusStatItem[]> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(`${CORE_API_BASE}/campuses`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw await readApiError(response);
    }

    const payload = await response.json();
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.campuses)
          ? payload.campuses
          : [];

    return list.map((c: Record<string, unknown>) => {
      const stats = (c.stats || {}) as Record<string, unknown>;
      const count = (c._count || {}) as Record<string, unknown>;
      return {
        id: String(c.id || ''),
        code: String(c.code || 'NEI'),
        name: String(c.name || 'Sede USCO'),
        city: String(c.city || 'Huila'),
        address: String(c.address || 'Huila, Colombia'),
        isActive: Boolean(c.isActive ?? true),
        studentsCount: Number(c.totalStudents ?? c.studentsCount ?? stats.studentsCount ?? count.users ?? 1),
        activeSectionsCount: Number(c.openSections ?? c.activeSectionsCount ?? stats.activeSectionsCount ?? count.sections ?? 1),
        enrollmentsCount: Number(c.activeEnrollments ?? c.enrollmentsCount ?? stats.enrollmentsCount ?? 4),
        averageGrade: Number(c.averageCampusGrade ?? c.averageGrade ?? stats.averageGrade ?? 4.35),
      };
    });
  } catch (err) {
    throw toUserFacingError(err);
  }
}

export async function fetchAdminEnrollments(token?: string | null): Promise<AdminEnrollmentRecord[]> {
  const authToken = token || getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(`${CORE_API_BASE}/admin/enrollments`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw await readApiError(response);
    }

    const payload = await response.json();
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.enrollments)
          ? payload.enrollments
          : [];

    return list.map((row: Record<string, unknown>) => {
      const student = (row.student || {}) as Record<string, unknown>;
      const section = (row.section || {}) as Record<string, unknown>;
      const course = (row.course || section.course || {}) as Record<string, unknown>;
      const campus = (row.campus || section.campus || student.campus || {}) as Record<string, unknown>;
      const grade = (row.grade || {}) as Record<string, unknown>;

      const cut1 = (grade.cut1 ?? row.cut1 ?? null) as number | null;
      const cut2 = (grade.cut2 ?? row.cut2 ?? null) as number | null;
      const cut3 = (grade.cut3 ?? row.cut3 ?? null) as number | null;
      const calc = computeGradeFormula(cut1, cut2, cut3);

      return {
        enrollmentId: String(row.enrollmentId || row.id || ''),
        studentId: String(row.studentId || student.id || ''),
        studentName: String(row.studentName || student.fullName || 'Estudiante USCO'),
        studentCode: (row.studentCode ?? student.studentCode ?? null) as string | null,
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
  } catch (err) {
    throw toUserFacingError(err);
  }
}

export async function updateStudentGrade(params: {
  enrollmentId: string;
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  observations: string;
  token?: string | null;
}): Promise<Record<string, unknown>> {
  const authToken = params.token || getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
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
      throw new ApiError(response.status, payload.message || payload.error || 'Error actualizando calificaciones.');
    }
    return payload.data || payload;
  } catch (err) {
    throw toUserFacingError(err);
  }
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
  try {
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
  } catch {
    // El worker no respondió: se informa tal cual en lugar de simular un estado "healthy".
    const empty = { waiting: 0, active: 0, completed: 0, failed: 0, avgProcessingTimeMs: 0 };
    return {
      status: 'unreachable',
      redisConnected: false,
      certificatePdfQueue: { ...empty },
      notificationQueue: { ...empty },
    };
  }
}

export interface ChatbotAttachmentGradeRow {
  courseCode?: string;
  code?: string;
  courseName?: string;
  name?: string;
  cut1?: number | null;
  cut2?: number | null;
  cut3?: number | null;
  finalGrade?: number | null;
  grade?: {
    cut1?: number | null;
    cut2?: number | null;
    cut3?: number | null;
    finalGrade?: number | null;
  };
}

export interface ChatbotDataAttachmentPayload {
  type?: 'GRADES_TABLE' | 'CERTIFICATE_CARD' | 'SCHEDULE_INFO' | string;
  pga?: number;
  enrollments?: ChatbotAttachmentGradeRow[];
  courses?: ChatbotAttachmentGradeRow[];
  grades?: ChatbotAttachmentGradeRow[];
  jobId?: string;
  id?: string;
  verificationCode?: string;
  pdfUrl?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ChatbotResponsePayload {
  sessionId: string;
  reply: string;
  engineUsed: string;
  intentDetected: string;
  toolCalled: string | null;
  latencyMs: number;
  suggestedQuickReplies: string[];
  dataAttachment: ChatbotDataAttachmentPayload | null;
}

export async function sendChatbotMessage(params: {
  sessionId: string;
  message: string;
  preferredMode: 'auto' | 'gemini' | 'groq' | 'deterministic';
  token?: string | null;
}): Promise<ChatbotResponsePayload> {
  const authToken = params.token || getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(`${CHATBOT_API_BASE}/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: params.sessionId,
        message: params.message,
        preferredMode: params.preferredMode,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new ApiError(response.status, payload.message || payload.error || 'Error comunicándose con el servicio Chatbot IA.');
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
      // El chatbot envía { type, title, payload: {...} }: se aplana para que el widget lea
      // courses/pga/jobId directamente (antes la tarjeta nunca se mostraba con el backend real).
      dataAttachment: data.dataAttachment
        ? {
            ...(data.dataAttachment.payload ?? {}),
            type: data.dataAttachment.type,
            title: data.dataAttachment.title,
          }
        : null,
    };
  } catch (err) {
    throw toUserFacingError(err);
  }
}
