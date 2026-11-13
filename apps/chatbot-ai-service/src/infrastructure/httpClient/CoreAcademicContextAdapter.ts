import { randomBytes } from 'crypto';
import {
  CertificateJobStatus,
  CertificateType,
  ChatEngine,
  calculateWeightedGrade,
  generateCertificateSignatureHash,
  prisma,
} from '@edudistribuida/database';
import {
  EngineUsedType,
  FaqTreeNode,
  StudentAcademicContext,
  StudentCertificateSummary,
  StudentCourseGradeContext,
} from '../../domain/entities/AcademicChatEntities';
import {
  ChatHistoryEntry,
  IAcademicContextPort,
  LogInteractionParams,
} from '../../domain/ports/IAcademicContextPort';

export class StudentNotFoundError extends Error {
  constructor(identifier: string) {
    super(`No se encontró el estudiante '${identifier}' en el registro académico.`);
    this.name = 'StudentNotFoundError';
  }
}

function newVerificationCode(): string {
  return `USCO-2026-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export class CoreAcademicContextAdapter implements IAcademicContextPort {
  private readonly coreServiceUrl: string;
  private readonly workerServiceUrl: string;
  private readonly internalServiceToken: string;

  constructor() {
    this.coreServiceUrl = process.env.CORE_SERVICE_URL || 'http://localhost:4001';
    this.workerServiceUrl = process.env.WORKER_SERVICE_URL || 'http://localhost:4002';
    this.internalServiceToken =
      process.env.INTERNAL_SERVICE_TOKEN || 'dev-internal-service-token-change-me-0000';
  }

  public async getStudentAcademicContext(
    studentIdentifier?: string
  ): Promise<StudentAcademicContext> {
    const cleanId = studentIdentifier?.trim() || '';
    if (!cleanId) throw new StudentNotFoundError('(vacío)');

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: cleanId },
          { studentCode: cleanId },
          { email: cleanId.toLowerCase() },
          { documentNumber: cleanId },
        ],
      },
      include: {
        campus: true,
        enrollments: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            period: true,
            grade: true,
            section: {
              include: {
                course: {
                  include: {
                    program: true,
                  },
                },
                teacher: true,
                campus: true,
              },
            },
          },
          orderBy: {
            enrolledAt: 'asc',
          },
        },
        certificateJobs: {
          orderBy: {
            requestedAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!user) {
      throw new StudentNotFoundError(cleanId);
    }

    const courses: StudentCourseGradeContext[] = user.enrollments.map((enrollment) => {
      const cut1 = enrollment.grade?.cut1 ?? null;
      const cut2 = enrollment.grade?.cut2 ?? null;
      const cut3 = enrollment.grade?.cut3 ?? null;

      const calc = calculateWeightedGrade(cut1, cut2, cut3);
      const isComplete =
        typeof cut1 === 'number' &&
        typeof cut2 === 'number' &&
        typeof cut3 === 'number';

      let neededInCut3ToPass: number | null = null;
      let statusDescription = 'En curso';

      if (isComplete) {
        neededInCut3ToPass = 0;
        statusDescription =
          calc.accumulatedGrade >= 3.0
            ? `Aprobada con definitiva ${calc.accumulatedGrade.toFixed(2)}`
            : `Reprobada con definitiva ${calc.accumulatedGrade.toFixed(2)}`;
      } else {
        const currentAccumulated = Number(
          ((cut1 ?? 0) * 0.3 + (cut2 ?? 0) * 0.3).toFixed(2)
        );
        const rawNeeded = (3.0 - currentAccumulated) / 0.4;
        neededInCut3ToPass = Math.max(0, Number(rawNeeded.toFixed(2)));
        statusDescription =
          neededInCut3ToPass <= 0
            ? `Ya aprobada con acumulado ${currentAccumulated.toFixed(2)} (Corte 3 pendiente)`
            : `Pendiente Corte 3 (40%): lleva ${currentAccumulated.toFixed(
                2
              )} acumulado y necesita ${neededInCut3ToPass.toFixed(2)} en el Corte 3 para aprobar en 3.00`;
      }

      return {
        enrollmentId: enrollment.id,
        courseCode: enrollment.section.course.code,
        courseName: enrollment.section.course.name,
        credits: enrollment.section.course.credits,
        semesterLevel: enrollment.section.course.semesterLevel,
        groupNumber: enrollment.section.groupNumber,
        scheduleText: enrollment.section.scheduleText,
        classroom: enrollment.section.classroom,
        teacherName: enrollment.section.teacher.fullName,
        paymentReference: enrollment.paymentReference,
        paymentStatus: enrollment.paymentStatus,
        cut1,
        cut2,
        cut3,
        accumulatedGrade: calc.accumulatedGrade,
        finalGrade: isComplete ? calc.accumulatedGrade : null,
        passed: isComplete ? calc.accumulatedGrade >= 3.0 : null,
        evaluatedPercentage: calc.evaluatedPercentage,
        neededInCut3ToPass,
        statusDescription,
        observations: enrollment.grade?.observations ?? null,
      };
    });

    // Ordenar cursos por código (ISW-401, ISW-402, ISW-403, ISW-304)
    courses.sort((a, b) => a.courseCode.localeCompare(b.courseCode));

    const totalEnrolledCredits = courses.reduce((sum, c) => sum + c.credits, 0);

    // Calcular PGA ponderado sobre las materias con nota definitiva o proyectada
    const completedCourses = courses.filter((c) => c.finalGrade !== null);
    const pga =
      completedCourses.length > 0
        ? Number(
            (
              completedCourses.reduce(
                (acc, c) => acc + (c.finalGrade ?? c.accumulatedGrade) * c.credits,
                0
              ) / completedCourses.reduce((acc, c) => acc + c.credits, 0)
            ).toFixed(2)
          )
        : 0;

    const firstProgram = user.enrollments[0]?.section.course.program;
    const firstPeriod = user.enrollments[0]?.period;
    const hasPendingPayment = courses.some((c) => c.paymentStatus === 'PENDING');

    const certificates: StudentCertificateSummary[] = user.certificateJobs.map((job) => ({
      id: job.id,
      certificateType: job.certificateType,
      status: job.status,
      verificationCode: job.verificationCode,
      pdfUrl:
        job.pdfUrl && job.pdfUrl.startsWith('http')
          ? job.pdfUrl
          : `${this.workerServiceUrl}/public/certificates/${job.id}.pdf`,
      requestedAt: job.requestedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    }));

    return {
      userId: user.id,
      studentCode: user.studentCode || '',
      fullName: user.fullName,
      email: user.email,
      documentNumber: user.documentNumber,
      campusCode: user.campus.code,
      campusName: user.campus.name,
      campusCity: user.campus.city,
      programCode: firstProgram?.code || `ISW-${user.campus.code}`,
      programName: firstProgram?.name || 'Ingeniería de Software',
      faculty: firstProgram?.faculty || 'Facultad de Ingeniería',
      periodCode: firstPeriod?.code || '2026-2',
      periodName:
        firstPeriod?.name || 'Segundo Periodo Académico 2026 (Agosto - Diciembre)',
      totalEnrolledCredits,
      pga,
      financialStatus: hasPendingPayment ? 'PENDING' : 'PAID',
      courses,
      certificates,
    };
  }

  public async requestCertificateGeneration(
    studentContext: StudentAcademicContext,
    certificateType: 'STUDY' | 'GRADES' | 'GOOD_STANDING'
  ): Promise<StudentCertificateSummary> {
    // 1. Intentar invocar Core Academic Service si está activo en el puerto 4001
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);

      const response = await fetch(`${this.coreServiceUrl}/api/v1/certificates/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Credencial servicio-a-servicio: el chatbot ya restringió el contexto al usuario del JWT.
          'x-internal-service-token': this.internalServiceToken,
        },
        body: JSON.stringify({
          studentId: studentContext.userId,
          studentCode: studentContext.studentCode,
          certificateType,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const payload = (await response.json()) as {
          data?: {
            id?: string;
            jobId?: string;
            certificateType?: 'STUDY' | 'GRADES' | 'GOOD_STANDING';
            status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
            verificationCode?: string;
            pdfUrl?: string;
            requestedAt?: string;
            completedAt?: string | null;
          };
        };

        if (payload?.data && (payload.data.id || payload.data.jobId)) {
          const jobId = payload.data.id || payload.data.jobId!;
          return {
            id: jobId,
            certificateType: payload.data.certificateType || certificateType,
            status: payload.data.status || 'QUEUED',
            verificationCode:
              payload.data.verificationCode ||
              newVerificationCode(),
            pdfUrl: `${this.workerServiceUrl}/public/certificates/${jobId}.pdf`,
            requestedAt: payload.data.requestedAt || new Date().toISOString(),
            completedAt: payload.data.completedAt ?? null,
          };
        }
      }
    } catch {
      // Fallback transparente a persistencia directa en PostgreSQL + disparo al Worker 4002
    }

    // 2. Fallback autónomo en PostgreSQL con Prisma + notificación opcional al Worker (4002)
    const verificationCode = newVerificationCode();
    const issuedIsoDate = new Date().toISOString();

    const digitalSignatureHash = generateCertificateSignatureHash({
      verificationCode,
      studentCode: studentContext.studentCode,
      documentNumber: studentContext.documentNumber,
      certificateType: certificateType as CertificateType,
      issuedIsoDate,
    });

    const createdJob = await prisma.certificateJob.create({
      data: {
        studentId: studentContext.userId,
        certificateType: certificateType as CertificateType,
        status: CertificateJobStatus.COMPLETED,
        verificationCode,
        digitalSignatureHash,
        pdfUrl: `${this.workerServiceUrl}/public/certificates/${verificationCode}.pdf`,
        completedAt: new Date(issuedIsoDate),
      },
    });

    const normalizedPdfUrl = `${this.workerServiceUrl}/public/certificates/${createdJob.id}.pdf`;

    await prisma.certificateJob.update({
      where: { id: createdJob.id },
      data: { pdfUrl: normalizedPdfUrl },
    });

    // Notificar asíncronamente al Worker en http://localhost:4002 si está arriba para que renderice el PDF físico
    try {
      const workerController = new AbortController();
      const workerTimeout = setTimeout(() => workerController.abort(), 1200);
      await fetch(`${this.workerServiceUrl}/api/v1/worker/process-certificate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service-token': this.internalServiceToken,
        },
        body: JSON.stringify({
          jobId: createdJob.id,
          studentId: studentContext.userId,
          certificateType,
          verificationCode,
        }),
        signal: workerController.signal,
      });
      clearTimeout(workerTimeout);
    } catch {
      // El registro ya quedó asegurado en PostgreSQL con su firma SHA-256 y URL
    }

    return {
      id: createdJob.id,
      certificateType: createdJob.certificateType,
      status: createdJob.status,
      verificationCode: createdJob.verificationCode,
      pdfUrl: normalizedPdfUrl,
      requestedAt: createdJob.requestedAt.toISOString(),
      completedAt: createdJob.completedAt ? createdJob.completedAt.toISOString() : null,
    };
  }

  public async logInteraction(params: LogInteractionParams): Promise<void> {
    const engineEnumMap: Record<EngineUsedType, ChatEngine> = {
      GEMINI_AI: ChatEngine.GEMINI_AI,
      GROQ_AI: ChatEngine.GROQ_AI,
      DETERMINISTIC_RULES: ChatEngine.DETERMINISTIC_RULES,
    };

    await prisma.chatInteractionLog.create({
      data: {
        studentId: params.studentId,
        sessionId: params.sessionId,
        userPrompt: params.userPrompt,
        botResponse: params.botResponse,
        engineUsed: engineEnumMap[params.engineUsed] ?? ChatEngine.DETERMINISTIC_RULES,
        intentDetected: params.intentDetected,
        toolCalled: params.toolCalled,
        latencyMs: params.latencyMs,
      },
    });
  }

  public async getSessionHistory(sessionId: string, studentId?: string): Promise<ChatHistoryEntry[]> {
    const logs = await prisma.chatInteractionLog.findMany({
      where: studentId ? { sessionId, studentId } : { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return logs.map((log) => ({
      id: log.id,
      studentId: log.studentId,
      sessionId: log.sessionId,
      userPrompt: log.userPrompt,
      botResponse: log.botResponse,
      engineUsed: log.engineUsed as EngineUsedType,
      intentDetected: log.intentDetected,
      toolCalled: log.toolCalled,
      latencyMs: log.latencyMs,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  public getFaqTree(): FaqTreeNode[] {
    return [
      {
        id: 'faq-grades-pga',
        category: 'Calificaciones y Rendimiento',
        title: '📊 Consultar mis notas y PGA actual',
        questionPrompt: '¿Cuáles son mis notas actuales y mi promedio en el semestre 2026-2?',
        description:
          'Muestra las calificaciones por corte (30% / 30% / 40%), nota definitiva y Promedio General Acumulado (PGA).',
        intent: 'INTENT_GRADES',
        children: [
          {
            id: 'faq-needed-cut3',
            category: 'Simulación Académica',
            title: '🎯 ¿Cuánto necesito en el Corte 3 para aprobar?',
            questionPrompt: '¿Cuánto necesito sacar en el Corte 3 para pasar mis materias en 3.00?',
            description:
              'Calcula matemáticamente el puntaje mínimo requerido en el tercer corte (40%) para cerrar cada asignatura en 3.00.',
            intent: 'INTENT_NEEDED_SCORE',
          },
        ],
      },
      {
        id: 'faq-certificates',
        category: 'Certificados Digitales y Trámites PDF',
        title: '📄 Generar Certificado Académico Oficial en PDF',
        questionPrompt: 'Necesito generar un certificado de estudio en PDF con código QR y firma digital',
        description:
          'Expide de forma asíncrona certificados de Estudio (STUDY), Boletín de Notas (GRADES) o Paz y Salvo (GOOD_STANDING) con hash SHA-256.',
        intent: 'INTENT_GENERATE_CERTIFICATE',
        children: [
          {
            id: 'faq-certificate-grades',
            category: 'Certificados Digitales',
            title: '📑 Expedir Certificado de Calificaciones (GRADES)',
            questionPrompt: 'Generar boletín y certificado de notas en PDF',
            description:
              'Genera el certificado oficial de calificaciones del periodo 2026-2 con código de verificación USCO.',
            intent: 'INTENT_GENERATE_CERTIFICATE',
          },
        ],
      },
      {
        id: 'faq-schedule-enrollment',
        category: 'Matrícula y Horarios Multi-Sede',
        title: '📅 Ver mi horario, aulas y docentes asignados',
        questionPrompt: '¿Cuál es mi horario de clases, salones y materias matriculadas?',
        description:
          'Consulta las asignaturas activas en el periodo 2026-2, número de créditos, aulas en la sede correspondiente y docentes.',
        intent: 'INTENT_SCHEDULE',
        children: [
          {
            id: 'faq-payment-status',
            category: 'Estado Financiero',
            title: '💳 Verificar estado de pago de matrícula',
            questionPrompt: '¿Cuál es mi estado financiero y referencias de pago de matrícula?',
            description:
              'Verifica los recibos liquidados y el estado PAID/PENDING de los derechos de matrícula.',
            intent: 'INTENT_PAYMENT_STATUS',
          },
        ],
      },
      {
        id: 'faq-calendar-regulations',
        category: 'Calendario y Reglamento USCO',
        title: '🏛️ Calendario Académico 2026-2 y Reglamento Estudiantil',
        questionPrompt: '¿Cuáles son las fechas del calendario académico 2026-2 y reglas de evaluación?',
        description:
          'Fechas oficiales de adición/cancelación, reporte de cortes (30%/30%/40%), habilitaciones y operación en las 4 sedes (Neiva, Pitalito, Garzón y La Plata).',
        intent: 'INTENT_FAQ_CALENDAR',
      },
    ];
  }
}
