import {
  CertificateJobStatus,
  CertificateType,
  EnrollmentStatus,
  PaymentStatus,
  prisma,
} from '@edudistribuida/database';
import {
  CertificateJobViewDto,
  StudentAcademicSummaryDto,
  StudentEnrollmentViewDto,
} from '../../application/dtos/AcademicDtos';
import {
  CampusMetricsItem,
  ICampusRepository,
} from '../../application/ports/out/ICampusRepository';
import { ICertificateJobRepository } from '../../application/ports/out/ICertificateJobRepository';
import {
  ICourseSectionRepository,
  SectionOfferItem,
} from '../../application/ports/out/ICourseSectionRepository';
import {
  AdminEnrollmentRecord,
  IEnrollmentRepository,
} from '../../application/ports/out/IEnrollmentRepository';
import {
  CertificateTypeDomain,
  ExistingEnrollmentRecord,
  SectionValidationTarget,
} from '../../domain/entities/AcademicEntities';
import {
  DuplicateEnrollmentError,
  QuotaExceededError,
  ResourceNotFoundError,
} from '../../domain/errors/DomainError';
import { GradeDomainService } from '../../domain/services/GradeDomainService';
import { env } from '../config/env';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PrismaAcademicRepository
  implements
    ICampusRepository,
    ICourseSectionRepository,
    IEnrollmentRepository,
    ICertificateJobRepository
{
  private normalizePdfUrl(jobId: string, currentPdfUrl: string | null): string | null {
    if (!currentPdfUrl) return null;
    if (currentPdfUrl.startsWith('http://') || currentPdfUrl.startsWith('https://')) {
      return currentPdfUrl;
    }
    return `${env.WORKER_SERVICE_URL}/public/certificates/${jobId}.pdf`;
  }

  public async getAllCampusesWithMetrics(): Promise<CampusMetricsItem[]> {
    const campuses = await prisma.campus.findMany({
      orderBy: { code: 'asc' },
      include: {
        users: {
          where: { role: 'STUDENT' },
          select: { id: true },
        },
        sections: {
          include: {
            enrollments: {
              where: { status: EnrollmentStatus.ACTIVE },
              include: { grade: true },
            },
          },
        },
      },
    });

    return campuses.map((campus) => {
      const openSections = campus.sections.length;
      let maxQuotaTotal = 0;
      let occupiedQuotaTotal = 0;
      let activeEnrollments = 0;
      const gradesList: number[] = [];

      for (const sec of campus.sections) {
        maxQuotaTotal += sec.maxQuota;
        occupiedQuotaTotal += sec.occupiedQuota;
        activeEnrollments += sec.enrollments.length;

        for (const enr of sec.enrollments) {
          if (enr.grade) {
            const calc = GradeDomainService.calculateFinalAndRequiredCut3(
              enr.grade.cut1,
              enr.grade.cut2,
              enr.grade.cut3
            );
            gradesList.push(calc.accumulatedGrade);
          }
        }
      }

      const occupancyPercentage =
        maxQuotaTotal > 0
          ? Number(((occupiedQuotaTotal / maxQuotaTotal) * 100).toFixed(1))
          : 0;

      const averageCampusGrade =
        gradesList.length > 0
          ? Number(
              (gradesList.reduce((acc, g) => acc + g, 0) / gradesList.length).toFixed(2)
            )
          : 0;

      return {
        id: campus.id,
        code: campus.code,
        name: campus.name,
        city: campus.city,
        address: campus.address,
        isActive: campus.isActive,
        totalStudents: campus.users.length,
        openSections,
        activeEnrollments,
        maxQuotaTotal,
        occupiedQuotaTotal,
        occupancyPercentage,
        averageCampusGrade,
      };
    });
  }

  public async listAvailableSections(filters: {
    campusId?: string;
    studentId?: string;
  }): Promise<SectionOfferItem[]> {
    let resolvedCampusFilter: string | undefined;
    if (filters.campusId && filters.campusId.trim() !== '') {
      const trimmedCampus = filters.campusId.trim();
      if (UUID_REGEX.test(trimmedCampus)) {
        resolvedCampusFilter = trimmedCampus;
      } else {
        const campusRecord = await prisma.campus.findUnique({
          where: { code: trimmedCampus.toUpperCase() },
        });
        if (campusRecord) {
          resolvedCampusFilter = campusRecord.id;
        }
      }
    }

    let resolvedStudentUuid: string | undefined;
    if (filters.studentId && filters.studentId.trim() !== '') {
      const trimmedStudent = filters.studentId.trim();
      if (UUID_REGEX.test(trimmedStudent)) {
        resolvedStudentUuid = trimmedStudent;
      } else {
        const studentRecord = await prisma.user.findFirst({
          where: { studentCode: trimmedStudent },
          select: { id: true },
        });
        resolvedStudentUuid = studentRecord?.id;
      }
    }

    const sections = await prisma.courseSection.findMany({
      where: resolvedCampusFilter ? { campusId: resolvedCampusFilter } : undefined,
      include: {
        course: true,
        teacher: true,
        campus: true,
        period: true,
        enrollments: resolvedStudentUuid
          ? {
              where: {
                studentId: resolvedStudentUuid,
                status: EnrollmentStatus.ACTIVE,
              },
              select: { id: true },
            }
          : false,
      },
      orderBy: [{ campus: { code: 'asc' } }, { course: { code: 'asc' } }],
    });

    return sections.map((sec) => {
      const enrolledArray = Array.isArray(sec.enrollments) ? sec.enrollments : [];
      return {
        id: sec.id,
        groupNumber: sec.groupNumber,
        scheduleText: sec.scheduleText,
        classroom: sec.classroom,
        maxQuota: sec.maxQuota,
        occupiedQuota: sec.occupiedQuota,
        availableQuota: Math.max(0, sec.maxQuota - sec.occupiedQuota),
        isEnrolledByStudent: enrolledArray.length > 0,
        course: {
          id: sec.course.id,
          code: sec.course.code,
          name: sec.course.name,
          credits: sec.course.credits,
          semesterLevel: sec.course.semesterLevel,
        },
        teacher: {
          id: sec.teacher.id,
          fullName: sec.teacher.fullName,
          email: sec.teacher.email,
        },
        campus: {
          id: sec.campus.id,
          code: sec.campus.code,
          name: sec.campus.name,
          city: sec.campus.city,
        },
        period: {
          id: sec.period.id,
          code: sec.period.code,
          name: sec.period.name,
        },
      };
    });
  }

  public async findSectionValidationTarget(
    sectionId: string
  ): Promise<SectionValidationTarget | null> {
    if (!UUID_REGEX.test(sectionId.trim())) {
      return null;
    }

    const section = await prisma.courseSection.findUnique({
      where: { id: sectionId.trim() },
      include: {
        course: true,
        period: true,
        campus: true,
      },
    });

    if (!section) return null;

    return {
      id: section.id,
      groupNumber: section.groupNumber,
      maxQuota: section.maxQuota,
      occupiedQuota: section.occupiedQuota,
      courseId: section.courseId,
      courseCode: section.course.code,
      courseName: section.course.name,
      periodId: section.periodId,
      periodCode: section.period.code,
      campusId: section.campusId,
      campusIsActive: section.campus.isActive,
    };
  }

  public async getStudentAcademicSummary(
    studentIdOrCode: string
  ): Promise<StudentAcademicSummaryDto | null> {
    const trimmed = studentIdOrCode.trim();
    const isUuid = UUID_REGEX.test(trimmed);

    const user = await prisma.user.findFirst({
      where: isUuid
        ? { OR: [{ id: trimmed }, { studentCode: trimmed }] }
        : {
            OR: [
              { studentCode: trimmed },
              { documentNumber: trimmed },
              { email: trimmed.toLowerCase() },
            ],
          },
      include: {
        campus: {
          include: {
            programs: true,
          },
        },
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          include: {
            section: {
              include: {
                course: true,
                teacher: true,
                campus: true,
              },
            },
            period: true,
            grade: true,
          },
          orderBy: { enrolledAt: 'asc' },
        },
        certificateJobs: {
          orderBy: { requestedAt: 'desc' },
        },
      },
    });

    if (!user) return null;

    const activePeriod =
      (await prisma.academicPeriod.findFirst({ where: { isActive: true } })) ?? {
        id: '33333333-3333-4333-8333-333333333301',
        code: '2026-2',
        name: 'Segundo Periodo Académico 2026 (Agosto - Diciembre)',
        isActive: true,
      };

    const program = user.campus.programs[0] ?? {
      id: '22222222-2222-4222-8222-222222222201',
      code: 'ISW-NEI',
      name: 'Ingeniería de Software',
      faculty: 'Facultad de Ingeniería',
      totalCredits: 165,
    };

    const enrollmentsView: StudentEnrollmentViewDto[] = user.enrollments.map((enr) => {
      const calc = GradeDomainService.calculateFinalAndRequiredCut3(
        enr.grade?.cut1 ?? null,
        enr.grade?.cut2 ?? null,
        enr.grade?.cut3 ?? null
      );

      return {
        enrollmentId: enr.id,
        status: enr.status,
        paymentReference: enr.paymentReference,
        paymentStatus: enr.paymentStatus,
        enrolledAt: enr.enrolledAt.toISOString(),
        course: {
          id: enr.section.course.id,
          code: enr.section.course.code,
          name: enr.section.course.name,
          credits: enr.section.course.credits,
          semesterLevel: enr.section.course.semesterLevel,
        },
        section: {
          id: enr.section.id,
          groupNumber: enr.section.groupNumber,
          scheduleText: enr.section.scheduleText,
          classroom: enr.section.classroom,
          teacherName: enr.section.teacher.fullName,
          campusName: enr.section.campus.name,
          campusCode: enr.section.campus.code,
          maxQuota: enr.section.maxQuota,
          occupiedQuota: enr.section.occupiedQuota,
        },
        grade: {
          id: enr.grade?.id ?? null,
          cut1: calc.cut1,
          cut2: calc.cut2,
          cut3: calc.cut3,
          accumulatedGrade: calc.accumulatedGrade,
          finalGrade: calc.finalGrade,
          requiredCut3ForThree: calc.requiredCut3ForThree,
          evaluatedPercentage: calc.evaluatedPercentage,
          passed: calc.passed,
          statusText: calc.statusText,
          observations: enr.grade?.observations ?? null,
          updatedAt: enr.grade?.updatedAt ? enr.grade.updatedAt.toISOString() : null,
          updatedBy: enr.grade?.updatedBy ?? null,
        },
      };
    });

    const enrolledCredits = enrollmentsView.reduce(
      (sum, item) => sum + item.course.credits,
      0
    );
    const enrolledCoursesCount = enrollmentsView.length;
    const approvedCoursesCount = enrollmentsView.filter((e) => e.grade.passed).length;
    const inProgressCoursesCount = enrollmentsView.filter(
      (e) => e.grade.statusText === 'EN CURSO'
    ).length;

    let weightedSum = 0;
    let totalWeightedCredits = 0;
    for (const item of enrollmentsView) {
      if (item.grade.evaluatedPercentage > 0) {
        weightedSum += item.grade.accumulatedGrade * item.course.credits;
        totalWeightedCredits += item.course.credits;
      }
    }

    const pga =
      totalWeightedCredits > 0
        ? Number((weightedSum / totalWeightedCredits).toFixed(2))
        : 0.0;

    const hasPendingPayments = enrollmentsView.some(
      (e) => e.paymentStatus === PaymentStatus.PENDING
    );

    const certificatesView: CertificateJobViewDto[] = user.certificateJobs.map((job) => ({
      id: job.id,
      jobId: job.id,
      studentId: job.studentId,
      certificateType: job.certificateType,
      status: job.status,
      verificationCode: job.verificationCode,
      digitalSignatureHash: job.digitalSignatureHash,
      pdfUrl: this.normalizePdfUrl(job.id, job.pdfUrl),
      requestedAt: job.requestedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    }));

    return {
      student: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        documentNumber: user.documentNumber,
        studentCode: user.studentCode,
        role: user.role,
      },
      campus: {
        id: user.campus.id,
        code: user.campus.code,
        name: user.campus.name,
        city: user.campus.city,
        address: user.campus.address,
      },
      program: {
        id: program.id,
        code: program.code,
        name: program.name,
        faculty: program.faculty,
        totalCredits: program.totalCredits,
      },
      activePeriod: {
        id: activePeriod.id,
        code: activePeriod.code,
        name: activePeriod.name,
        isActive: activePeriod.isActive,
      },
      metrics: {
        pga,
        enrolledCredits,
        maxAllowedCredits: 21,
        enrolledCoursesCount,
        approvedCoursesCount,
        inProgressCoursesCount,
        financialStatus: hasPendingPayments
          ? 'PENDIENTE DE PAGO'
          : 'AL DÍA (PAZ Y SALVO)',
      },
      enrollments: enrollmentsView,
      certificates: certificatesView,
    };
  }

  public async findExistingEnrollmentsByStudent(
    studentId: string
  ): Promise<ExistingEnrollmentRecord[]> {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId },
      include: {
        section: {
          include: { course: true },
        },
      },
    });

    return enrollments.map((enr) => ({
      id: enr.id,
      sectionId: enr.sectionId,
      courseId: enr.section.courseId,
      courseCode: enr.section.course.code,
      periodId: enr.periodId,
      status: enr.status,
    }));
  }

  public async executeAtomicEnrollment(params: {
    studentId: string;
    sectionId: string;
    periodId: string;
    paymentReference: string;
  }) {
    return await prisma.$transaction(async (tx) => {
      const section = await tx.courseSection.findUnique({
        where: { id: params.sectionId },
        include: { course: true, period: true },
      });

      if (!section) {
        throw new ResourceNotFoundError('Sección Académica', params.sectionId);
      }

      if (section.occupiedQuota >= section.maxQuota) {
        throw new QuotaExceededError(
          section.groupNumber,
          section.course.code,
          section.maxQuota
        );
      }

      const duplicate = await tx.enrollment.findFirst({
        where: {
          studentId: params.studentId,
          periodId: params.periodId,
          status: EnrollmentStatus.ACTIVE,
          OR: [
            { sectionId: params.sectionId },
            { section: { courseId: section.courseId } },
          ],
        },
      });

      if (duplicate) {
        throw new DuplicateEnrollmentError(section.course.code, section.period.code);
      }

      // Incremento atómico condicional garantizando control de concurrencia pesimista/optimista
      const quotaUpdate = await tx.courseSection.updateMany({
        where: {
          id: params.sectionId,
          occupiedQuota: { lt: section.maxQuota },
        },
        data: {
          occupiedQuota: { increment: 1 },
        },
      });

      if (quotaUpdate.count === 0) {
        throw new QuotaExceededError(
          section.groupNumber,
          section.course.code,
          section.maxQuota
        );
      }

      const updatedSection = await tx.courseSection.findUniqueOrThrow({
        where: { id: params.sectionId },
      });

      const createdEnrollment = await tx.enrollment.create({
        data: {
          studentId: params.studentId,
          sectionId: params.sectionId,
          periodId: params.periodId,
          status: EnrollmentStatus.ACTIVE,
          paymentReference: params.paymentReference,
          paymentStatus: PaymentStatus.PAID,
        },
      });

      await tx.grade.create({
        data: {
          enrollmentId: createdEnrollment.id,
          cut1: null,
          cut2: null,
          cut3: null,
          finalGrade: 0.0,
          passed: false,
          observations: 'Asignatura matriculada en curso (Periodo 2026-2).',
          updatedBy: 'system-enrollment-engine',
        },
      });

      return {
        enrollmentId: createdEnrollment.id,
        studentId: createdEnrollment.studentId,
        sectionId: createdEnrollment.sectionId,
        courseCode: section.course.code,
        courseName: section.course.name,
        groupNumber: section.groupNumber,
        occupiedQuota: updatedSection.occupiedQuota,
        maxQuota: updatedSection.maxQuota,
        paymentReference: createdEnrollment.paymentReference,
        enrolledAt: createdEnrollment.enrolledAt.toISOString(),
      };
    });
  }

  public async updateEnrollmentGrade(params: {
    enrollmentId: string;
    cut1: number | null;
    cut2: number | null;
    cut3: number | null;
    finalGrade: number;
    passed: boolean;
    observations?: string | null;
    updatedBy: string;
  }): Promise<AdminEnrollmentRecord> {
    if (!UUID_REGEX.test(params.enrollmentId.trim())) {
      throw new ResourceNotFoundError('Matrícula', params.enrollmentId);
    }

    const existing = await prisma.enrollment.findUnique({
      where: { id: params.enrollmentId.trim() },
    });

    if (!existing) {
      throw new ResourceNotFoundError('Matrícula', params.enrollmentId);
    }

    await prisma.grade.upsert({
      where: { enrollmentId: existing.id },
      create: {
        enrollmentId: existing.id,
        cut1: params.cut1,
        cut2: params.cut2,
        cut3: params.cut3,
        finalGrade: params.finalGrade,
        passed: params.passed,
        observations:
          params.observations ?? 'Calificaciones actualizadas en sistema académico.',
        updatedBy: params.updatedBy,
      },
      update: {
        cut1: params.cut1,
        cut2: params.cut2,
        cut3: params.cut3,
        finalGrade: params.finalGrade,
        passed: params.passed,
        ...(params.observations !== undefined
          ? { observations: params.observations }
          : {}),
        updatedBy: params.updatedBy,
      },
    });

    const fullEnrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        student: true,
        section: {
          include: {
            course: true,
            campus: true,
          },
        },
        grade: true,
      },
    });

    const calc = GradeDomainService.calculateFinalAndRequiredCut3(
      fullEnrollment.grade?.cut1 ?? null,
      fullEnrollment.grade?.cut2 ?? null,
      fullEnrollment.grade?.cut3 ?? null
    );

    return {
      enrollmentId: fullEnrollment.id,
      enrolledAt: fullEnrollment.enrolledAt.toISOString(),
      status: fullEnrollment.status,
      paymentReference: fullEnrollment.paymentReference,
      paymentStatus: fullEnrollment.paymentStatus,
      student: {
        id: fullEnrollment.student.id,
        fullName: fullEnrollment.student.fullName,
        email: fullEnrollment.student.email,
        studentCode: fullEnrollment.student.studentCode,
        documentNumber: fullEnrollment.student.documentNumber,
      },
      campus: {
        id: fullEnrollment.section.campus.id,
        code: fullEnrollment.section.campus.code,
        name: fullEnrollment.section.campus.name,
        city: fullEnrollment.section.campus.city,
      },
      course: {
        id: fullEnrollment.section.course.id,
        code: fullEnrollment.section.course.code,
        name: fullEnrollment.section.course.name,
        credits: fullEnrollment.section.course.credits,
      },
      section: {
        id: fullEnrollment.section.id,
        groupNumber: fullEnrollment.section.groupNumber,
        scheduleText: fullEnrollment.section.scheduleText,
        classroom: fullEnrollment.section.classroom,
        maxQuota: fullEnrollment.section.maxQuota,
        occupiedQuota: fullEnrollment.section.occupiedQuota,
      },
      grade: {
        id: fullEnrollment.grade?.id ?? null,
        cut1: calc.cut1,
        cut2: calc.cut2,
        cut3: calc.cut3,
        accumulatedGrade: calc.accumulatedGrade,
        finalGrade: calc.finalGrade,
        requiredCut3ForThree: calc.requiredCut3ForThree,
        passed: calc.passed,
        statusText: calc.statusText,
        observations: fullEnrollment.grade?.observations ?? null,
        updatedAt: fullEnrollment.grade?.updatedAt
          ? fullEnrollment.grade.updatedAt.toISOString()
          : null,
        updatedBy: fullEnrollment.grade?.updatedBy ?? null,
      },
    };
  }

  public async listAllEnrollmentsForAdmin(
    campusCode?: string
  ): Promise<AdminEnrollmentRecord[]> {
    const normalizedCampusCode = campusCode?.trim().toUpperCase();

    const records = await prisma.enrollment.findMany({
      where: normalizedCampusCode
        ? {
            section: {
              campus: { code: normalizedCampusCode },
            },
          }
        : undefined,
      include: {
        student: true,
        section: {
          include: {
            course: true,
            campus: true,
          },
        },
        grade: true,
      },
      orderBy: [
        { section: { campus: { code: 'asc' } } },
        { student: { fullName: 'asc' } },
        { section: { course: { code: 'asc' } } },
      ],
    });

    return records.map((enr) => {
      const calc = GradeDomainService.calculateFinalAndRequiredCut3(
        enr.grade?.cut1 ?? null,
        enr.grade?.cut2 ?? null,
        enr.grade?.cut3 ?? null
      );

      return {
        enrollmentId: enr.id,
        enrolledAt: enr.enrolledAt.toISOString(),
        status: enr.status,
        paymentReference: enr.paymentReference,
        paymentStatus: enr.paymentStatus,
        student: {
          id: enr.student.id,
          fullName: enr.student.fullName,
          email: enr.student.email,
          studentCode: enr.student.studentCode,
          documentNumber: enr.student.documentNumber,
        },
        campus: {
          id: enr.section.campus.id,
          code: enr.section.campus.code,
          name: enr.section.campus.name,
          city: enr.section.campus.city,
        },
        course: {
          id: enr.section.course.id,
          code: enr.section.course.code,
          name: enr.section.course.name,
          credits: enr.section.course.credits,
        },
        section: {
          id: enr.section.id,
          groupNumber: enr.section.groupNumber,
          scheduleText: enr.section.scheduleText,
          classroom: enr.section.classroom,
          maxQuota: enr.section.maxQuota,
          occupiedQuota: enr.section.occupiedQuota,
        },
        grade: {
          id: enr.grade?.id ?? null,
          cut1: calc.cut1,
          cut2: calc.cut2,
          cut3: calc.cut3,
          accumulatedGrade: calc.accumulatedGrade,
          finalGrade: calc.finalGrade,
          requiredCut3ForThree: calc.requiredCut3ForThree,
          passed: calc.passed,
          statusText: calc.statusText,
          observations: enr.grade?.observations ?? null,
          updatedAt: enr.grade?.updatedAt ? enr.grade.updatedAt.toISOString() : null,
          updatedBy: enr.grade?.updatedBy ?? null,
        },
      };
    });
  }

  public async confirmPaymentByWebhook(params: {
    paymentReference: string;
    status: 'PAID' | 'PENDING';
  }): Promise<{ updatedCount: number; paymentReference: string; status: string }> {
    const result = await prisma.enrollment.updateMany({
      where: { paymentReference: params.paymentReference.trim() },
      data: {
        paymentStatus:
          params.status === 'PAID' ? PaymentStatus.PAID : PaymentStatus.PENDING,
      },
    });

    return {
      updatedCount: result.count,
      paymentReference: params.paymentReference.trim(),
      status: params.status,
    };
  }

  public async createCertificateJob(params: {
    studentId: string;
    certificateType: CertificateTypeDomain;
    verificationCode: string;
  }): Promise<CertificateJobViewDto> {
    const created = await prisma.certificateJob.create({
      data: {
        studentId: params.studentId,
        certificateType: params.certificateType as CertificateType,
        status: CertificateJobStatus.QUEUED,
        verificationCode: params.verificationCode,
      },
    });

    return {
      id: created.id,
      jobId: created.id,
      studentId: created.studentId,
      certificateType: created.certificateType,
      status: created.status,
      verificationCode: created.verificationCode,
      digitalSignatureHash: created.digitalSignatureHash,
      pdfUrl: this.normalizePdfUrl(created.id, created.pdfUrl),
      requestedAt: created.requestedAt.toISOString(),
      completedAt: created.completedAt ? created.completedAt.toISOString() : null,
    };
  }

  public async findByIdOrVerificationCode(
    jobIdOrCode: string
  ): Promise<CertificateJobViewDto | null> {
    const trimmed = jobIdOrCode.trim();
    const isUuid = UUID_REGEX.test(trimmed);

    const job = await prisma.certificateJob.findFirst({
      where: isUuid
        ? { OR: [{ id: trimmed }, { verificationCode: trimmed }] }
        : { verificationCode: trimmed },
    });

    if (!job) return null;

    return {
      id: job.id,
      jobId: job.id,
      studentId: job.studentId,
      certificateType: job.certificateType,
      status: job.status,
      verificationCode: job.verificationCode,
      digitalSignatureHash: job.digitalSignatureHash,
      pdfUrl: this.normalizePdfUrl(job.id, job.pdfUrl),
      requestedAt: job.requestedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    };
  }

  public async findByStudentId(
    studentIdOrCode: string
  ): Promise<CertificateJobViewDto[]> {
    const trimmed = studentIdOrCode.trim();
    const isUuid = UUID_REGEX.test(trimmed);

    let resolvedStudentId = trimmed;
    if (!isUuid) {
      const student = await prisma.user.findFirst({
        where: { studentCode: trimmed },
        select: { id: true },
      });
      if (!student) return [];
      resolvedStudentId = student.id;
    }

    const jobs = await prisma.certificateJob.findMany({
      where: { studentId: resolvedStudentId },
      orderBy: { requestedAt: 'desc' },
    });

    return jobs.map((job) => ({
      id: job.id,
      jobId: job.id,
      studentId: job.studentId,
      certificateType: job.certificateType,
      status: job.status,
      verificationCode: job.verificationCode,
      digitalSignatureHash: job.digitalSignatureHash,
      pdfUrl: this.normalizePdfUrl(job.id, job.pdfUrl),
      requestedAt: job.requestedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    }));
  }
}
