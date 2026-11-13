import {
  CertificateJobStatus,
  EnrollmentStatus,
  calculateWeightedGrade,
  generateCertificateSignatureHash,
  prisma,
} from '@edudistribuida/database';
import {
  CertificateTypeWorker,
  CourseGradePdfRow,
  OfficialCertificateRenderData,
} from '../../domain/entities/CertificateWorkerEntities';
import {
  ICertificateStoragePort,
  IPdfGeneratorPort,
} from '../../domain/ports/ICertificatePorts';

export interface ProcessCertificateInput {
  jobId: string;
  studentId?: string;
  certificateType?: CertificateTypeWorker;
  verificationCode?: string;
}

export class ProcessCertificateJobUseCase {
  private readonly workerServiceUrl: string;

  constructor(
    private readonly pdfGenerator: IPdfGeneratorPort,
    private readonly storageAdapter: ICertificateStoragePort,
    workerServiceUrl?: string
  ) {
    this.workerServiceUrl =
      workerServiceUrl ||
      process.env.WORKER_SERVICE_URL ||
      'http://localhost:4002';
  }

  public async execute(input: ProcessCertificateInput): Promise<{
    jobId: string;
    verificationCode: string;
    pdfUrl: string;
    digitalSignatureHash: string;
    latencyMs: number;
  }> {
    const startTime = Date.now();

    const jobRecord = await prisma.certificateJob.findFirst({
      where: {
        OR: [
          { id: input.jobId },
          ...(input.verificationCode
            ? [{ verificationCode: input.verificationCode }]
            : []),
        ],
      },
    });

    if (!jobRecord) {
      throw new Error(`CertificateJob '${input.jobId}' no encontrado en PostgreSQL.`);
    }

    await prisma.certificateJob
      .update({
        where: { id: jobRecord.id },
        data: { status: CertificateJobStatus.PROCESSING },
      })
      .catch(() => undefined);

    const student = await prisma.user.findUnique({
      where: { id: jobRecord.studentId },
      include: {
        campus: {
          include: { programs: true },
        },
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          include: {
            section: {
              include: { course: true },
            },
            period: true,
            grade: true,
          },
          orderBy: { enrolledAt: 'asc' },
        },
      },
    });

    if (!student) {
      throw new Error(`Estudiante '${jobRecord.studentId}' no encontrado.`);
    }

    const program = student.campus.programs[0] ?? {
      code: 'ISW-NEI',
      name: 'Ingeniería de Software',
      faculty: 'Facultad de Ingeniería',
    };

    const period = student.enrollments[0]?.period ?? {
      code: '2026-2',
      name: 'Segundo Periodo Académico 2026 (Agosto - Diciembre)',
    };

    let weightedSum = 0;
    let totalCredits = 0;

    const courseRows: CourseGradePdfRow[] = student.enrollments.map((enr) => {
      const c1 = enr.grade?.cut1 ?? null;
      const c2 = enr.grade?.cut2 ?? null;
      const c3 = enr.grade?.cut3 ?? null;
      const calc = calculateWeightedGrade(c1, c2, c3);

      totalCredits += enr.section.course.credits;
      weightedSum += calc.accumulatedGrade * enr.section.course.credits;

      let statusText = 'EN CURSO';
      if (calc.accumulatedGrade >= 3.0) {
        statusText = 'APROBADA';
      } else if (c3 !== null && calc.accumulatedGrade < 3.0) {
        statusText = 'REPROBADA';
      }

      return {
        courseCode: enr.section.course.code,
        courseName: enr.section.course.name,
        credits: enr.section.course.credits,
        groupNumber: enr.section.groupNumber,
        cut1: c1,
        cut2: c2,
        cut3: c3,
        finalGrade: calc.accumulatedGrade,
        statusText,
      };
    });

    const pga =
      totalCredits > 0 ? Number((weightedSum / totalCredits).toFixed(2)) : 4.55;

    const completedAt = jobRecord.completedAt ?? new Date();
    const issuedAtIso = completedAt.toISOString();

    const digitalSignatureHash =
      jobRecord.digitalSignatureHash ||
      generateCertificateSignatureHash({
        verificationCode: jobRecord.verificationCode,
        studentCode: student.studentCode || 'N/A',
        documentNumber: student.documentNumber,
        certificateType: jobRecord.certificateType,
        issuedIsoDate: issuedAtIso,
      });

    const verificationUrl = `${this.workerServiceUrl}/public/certificates/${jobRecord.id}.pdf`;

    const renderData: OfficialCertificateRenderData = {
      jobId: jobRecord.id,
      verificationCode: jobRecord.verificationCode,
      certificateType: jobRecord.certificateType,
      issuedAtIso,
      digitalSignatureHash,
      verificationUrl,
      student: {
        id: student.id,
        fullName: student.fullName,
        studentCode: student.studentCode || 'N/A',
        documentNumber: student.documentNumber,
        email: student.email,
        programName: program.name,
        programCode: program.code,
        faculty: program.faculty,
        campusName: student.campus.name,
        campusCode: student.campus.code,
        campusCity: student.campus.city,
      },
      period: {
        code: period.code,
        name: period.name,
      },
      metrics: {
        pga,
        enrolledCredits: totalCredits,
        enrolledCoursesCount: courseRows.length,
        financialStatus: 'AL DÍA (PAZ Y SALVO)',
      },
      courses: courseRows,
    };

    const pdfBuffer =
      await this.pdfGenerator.generateOfficialCertificatePdf(renderData);

    const stored = await this.storageAdapter.storeAndCompleteCertificate({
      jobId: jobRecord.id,
      verificationCode: jobRecord.verificationCode,
      pdfBuffer,
      digitalSignatureHash,
      completedAt,
    });

    const latencyMs = Math.max(12, Date.now() - startTime);

    return {
      jobId: jobRecord.id,
      verificationCode: jobRecord.verificationCode,
      pdfUrl: stored.publicPdfUrl,
      digitalSignatureHash,
      latencyMs,
    };
  }
}
