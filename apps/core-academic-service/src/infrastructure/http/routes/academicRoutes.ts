import { Router } from 'express';
import { z } from 'zod';
import { AuthenticateUserUseCase } from '../../../application/use-cases/AuthenticateUserUseCase';
import { EnrollStudentInSectionUseCase } from '../../../application/use-cases/EnrollStudentInSectionUseCase';
import { GetCampusDistributedMetricsUseCase } from '../../../application/use-cases/GetCampusDistributedMetricsUseCase';
import { GetStudentAcademicSummaryUseCase } from '../../../application/use-cases/GetStudentAcademicSummaryUseCase';
import { RequestCertificateAsyncUseCase } from '../../../application/use-cases/RequestCertificateAsyncUseCase';
import { UpdateStudentGradesUseCase } from '../../../application/use-cases/UpdateStudentGradesUseCase';
import { ResourceNotFoundError } from '../../../domain/errors/DomainError';
import { JwtTokenAdapter } from '../../auth/JwtTokenAdapter';
import { env } from '../../config/env';
import { BullMQPublisherAdapter } from '../../messaging/BullMQPublisherAdapter';
import { PrismaAcademicRepository } from '../../persistence/PrismaAcademicRepository';
import { PrismaUserRepository } from '../../persistence/PrismaUserRepository';
import {
  jwtAuthMiddleware,
  loginRateLimiter,
  rbacMiddleware,
  studentIdorGuardMiddleware,
  zodValidationMiddleware,
} from '../middlewares/securityMiddlewares';

const loginSchema = z.object({
  email: z
    .string({ required_error: 'El correo electrónico institucional es obligatorio.' })
    .trim()
    .email('Formato de correo electrónico inválido.')
    .max(120),
  password: z
    .string({ required_error: 'La contraseña es obligatoria.' })
    .min(4, 'La contraseña debe tener al menos 4 caracteres.')
    .max(128),
});

const enrollSchema = z.object({
  studentId: z.string().trim().min(3, 'El identificador del estudiante es obligatorio.'),
  sectionId: z.string().trim().uuid('El identificador de la sección debe ser un UUID válido.'),
  paymentReference: z.string().trim().optional(),
});

const updateGradeSchema = z.object({
  enrollmentId: z
    .string()
    .trim()
    .uuid('El identificador de matrícula (enrollmentId) debe ser un UUID válido.'),
  cut1: z.number().min(0).max(5).nullable().optional(),
  cut2: z.number().min(0).max(5).nullable().optional(),
  cut3: z.number().min(0).max(5).nullable().optional(),
  observations: z.string().trim().max(500).nullable().optional(),
});

const requestCertificateSchema = z
  .object({
    studentId: z.string().trim().min(3).optional(),
    studentCode: z.string().trim().min(3).optional(),
    certificateType: z.enum(['STUDY', 'GRADES', 'GOOD_STANDING']).default('STUDY'),
  })
  .refine((data) => Boolean(data.studentId || data.studentCode), {
    message: 'Debe proporcionar studentId o studentCode para solicitar el certificado.',
    path: ['studentId'],
  });

const paymentWebhookSchema = z.object({
  paymentReference: z.string().trim().min(3, 'La referencia de pago es obligatoria.'),
  status: z.enum(['PAID', 'PENDING']).default('PAID'),
});

export function createAcademicRouter(): Router {
  const router = Router();

  // Instanciación de Adaptadores y Casos de Uso (Inyección de Dependencias Hexagonal)
  const userRepository = new PrismaUserRepository();
  const academicRepository = new PrismaAcademicRepository();
  const tokenAdapter = new JwtTokenAdapter();
  const queuePublisher = new BullMQPublisherAdapter();

  const authenticateUserUseCase = new AuthenticateUserUseCase(
    userRepository,
    tokenAdapter
  );
  const getStudentSummaryUseCase = new GetStudentAcademicSummaryUseCase(
    academicRepository
  );
  const enrollStudentUseCase = new EnrollStudentInSectionUseCase(
    userRepository,
    academicRepository,
    academicRepository,
    queuePublisher
  );
  const updateGradesUseCase = new UpdateStudentGradesUseCase(
    academicRepository,
    queuePublisher
  );
  const requestCertificateUseCase = new RequestCertificateAsyncUseCase(
    userRepository,
    academicRepository,
    queuePublisher
  );
  const getCampusMetricsUseCase = new GetCampusDistributedMetricsUseCase(
    academicRepository,
    academicRepository
  );

  // 1. Health Check
  router.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      service: '@edudistribuida/core-academic-service',
      architecture: 'Hexagonal (Ports & Adapters)',
      status: 'healthy',
      port: env.PORT,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. POST /api/v1/auth/login
  router.post(
    '/auth/login',
    loginRateLimiter,
    zodValidationMiddleware(loginSchema),
    async (req, res, next) => {
      try {
        const result = await authenticateUserUseCase.execute(req.body);
        res.status(200).json({
          success: true,
          message: 'Autenticación institucional exitosa.',
          token: result.token,
          accessToken: result.accessToken,
          tokenType: result.tokenType,
          expiresIn: result.expiresIn,
          user: result.user,
          data: result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 3. GET /api/v1/auth/me
  router.get('/auth/me', jwtAuthMiddleware, async (req, res, next) => {
    try {
      const currentUser = req.user!;
      res.status(200).json({
        success: true,
        user: {
          id: currentUser.userId,
          ...currentUser,
        },
        data: {
          id: currentUser.userId,
          ...currentUser,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. GET /api/v1/campuses
  router.get('/campuses', async (_req, res, next) => {
    try {
      const campuses = await academicRepository.getAllCampusesWithMetrics();
      const enrichedCampuses = campuses.map((c) => ({
        ...c,
        studentsCount: c.totalStudents,
        activeSectionsCount: c.openSections,
        enrollmentsCount: c.activeEnrollments,
        averageGrade: c.averageCampusGrade,
        stats: {
          studentsCount: c.totalStudents,
          activeSectionsCount: c.openSections,
          enrollmentsCount: c.activeEnrollments,
          averageGrade: c.averageCampusGrade,
          occupancyPercentage: c.occupancyPercentage,
        },
      }));

      res.status(200).json({
        success: true,
        count: enrichedCampuses.length,
        campuses: enrichedCampuses,
        data: enrichedCampuses,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. GET /api/v1/sections
  router.get('/sections', async (req, res, next) => {
    try {
      const campusId =
        typeof req.query.campusId === 'string' ? req.query.campusId : undefined;
      const studentId =
        typeof req.query.studentId === 'string' ? req.query.studentId : undefined;

      const sections = await academicRepository.listAvailableSections({
        campusId,
        studentId,
      });

      const enrichedSections = sections.map((sec) => ({
        ...sec,
        isEnrolled: sec.isEnrolledByStudent,
        courseId: sec.course.id,
        courseCode: sec.course.code,
        courseName: sec.course.name,
        credits: sec.course.credits,
        semesterLevel: sec.course.semesterLevel,
        teacherName: sec.teacher.fullName,
        campusId: sec.campus.id,
        campusCode: sec.campus.code,
        campusName: sec.campus.name,
      }));

      res.status(200).json({
        success: true,
        count: enrichedSections.length,
        sections: enrichedSections,
        data: enrichedSections,
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. GET /api/v1/students/:id/summary (Con protección anti-IDOR OWASP A01)
  router.get(
    '/students/:id/summary',
    studentIdorGuardMiddleware('id'),
    async (req, res, next) => {
      try {
        const summary = await getStudentSummaryUseCase.execute(req.params.id);

        const enrichedEnrollments = summary.enrollments.map((enr) => ({
          id: enr.enrollmentId,
          ...enr,
          courseCode: enr.course.code,
          courseName: enr.course.name,
          credits: enr.course.credits,
          semesterLevel: enr.course.semesterLevel,
          groupNumber: enr.section.groupNumber,
          scheduleText: enr.section.scheduleText,
          classroom: enr.section.classroom,
          teacherName: enr.section.teacherName,
          campusName: enr.section.campusName,
          campusCode: enr.section.campusCode,
        }));

        const responsePayload = {
          student: {
            ...summary.student,
            campusId: summary.campus.id,
            campusCode: summary.campus.code,
            campusName: summary.campus.name,
            campus: summary.campus,
          },
          campus: summary.campus,
          program: summary.program,
          period: summary.activePeriod,
          activePeriod: summary.activePeriod,
          metrics: summary.metrics,
          enrollments: enrichedEnrollments,
          certificates: summary.certificates,
        };

        res.status(200).json({
          success: true,
          ...responsePayload,
          data: responsePayload,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 7. POST /api/v1/enrollments (Protegido por jwtAuthMiddleware + Transacción Atómica)
  router.post(
    '/enrollments',
    jwtAuthMiddleware,
    zodValidationMiddleware(enrollSchema),
    async (req, res, next) => {
      try {
        // Si es un estudiante autenticado, impedir que inscriba materias a nombre de otro estudiante (IDOR)
        if (req.user && req.user.role === 'STUDENT') {
          const target = req.body.studentId.trim();
          const isSelf =
            target === req.user.userId ||
            (req.user.studentCode && target === req.user.studentCode);
          if (!isSelf) {
            res.status(403).json({
              success: false,
              errorCode: 'IDOR_ENROLLMENT_FORBIDDEN',
              message:
                'Acceso denegado (OWASP A01): No puede inscribir asignaturas para otro estudiante.',
            });
            return;
          }
        }

        const result = await enrollStudentUseCase.execute({
          studentId: req.body.studentId,
          sectionId: req.body.sectionId,
          paymentReference: req.body.paymentReference,
        });

        res.status(201).json({
          success: true,
          message: `Matrícula registrada exitosamente en ${result.courseCode} - ${result.courseName} (${result.groupNumber}).`,
          data: {
            id: result.enrollmentId,
            ...result,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 8. PUT /api/v1/grades (Protegido por jwtAuthMiddleware + rbacMiddleware(['TEACHER', 'ADMIN']))
  router.put(
    '/grades',
    jwtAuthMiddleware,
    rbacMiddleware(['TEACHER', 'ADMIN']),
    zodValidationMiddleware(updateGradeSchema),
    async (req, res, next) => {
      try {
        const updated = await updateGradesUseCase.execute({
          enrollmentId: req.body.enrollmentId,
          cut1: req.body.cut1 ?? null,
          cut2: req.body.cut2 ?? null,
          cut3: req.body.cut3 ?? null,
          observations: req.body.observations,
          actorRole: req.user!.role,
          actorEmail: req.user!.email,
        });

        res.status(200).json({
          success: true,
          message: 'Calificaciones ponderadas actualizadas correctamente.',
          data: updated,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 9. GET /api/v1/admin/enrollments
  router.get('/admin/enrollments', async (req, res, next) => {
    try {
      const campusCode =
        typeof req.query.campusCode === 'string' ? req.query.campusCode : undefined;
      const metricsAndEnrollments = await getCampusMetricsUseCase.execute(campusCode);

      const enrichedEnrollments = metricsAndEnrollments.enrollments.map((row) => ({
        id: row.enrollmentId,
        ...row,
        studentId: row.student.id,
        studentName: row.student.fullName,
        studentCode: row.student.studentCode,
        studentEmail: row.student.email,
        campusCode: row.campus.code,
        campusName: row.campus.name,
        courseCode: row.course.code,
        courseName: row.course.name,
        credits: row.course.credits,
        groupNumber: row.section.groupNumber,
        cut1: row.grade.cut1,
        cut2: row.grade.cut2,
        cut3: row.grade.cut3,
        finalGrade: row.grade.finalGrade,
        passed: row.grade.passed,
        statusText: row.grade.statusText,
        observations: row.grade.observations,
      }));

      res.status(200).json({
        success: true,
        count: enrichedEnrollments.length,
        globalSummary: metricsAndEnrollments.globalSummary,
        campuses: metricsAndEnrollments.campuses,
        enrollments: enrichedEnrollments,
        data: enrichedEnrollments,
      });
    } catch (err) {
      next(err);
    }
  });

  // 10. POST /api/v1/certificates/request (HTTP 202 Accepted Asíncrono en < 20ms)
  router.post(
    '/certificates/request',
    zodValidationMiddleware(requestCertificateSchema),
    async (req, res, next) => {
      try {
        const studentIdentifier = (req.body.studentId || req.body.studentCode) as string;
        const jobResult = await requestCertificateUseCase.execute({
          studentId: studentIdentifier,
          certificateType: req.body.certificateType,
        });

        res.status(202).json({
          success: true,
          message:
            'Solicitud de certificado recibida y encolada asíncronamente en BullMQ Worker.',
          jobId: jobResult.jobId,
          status: jobResult.status,
          verificationCode: jobResult.verificationCode,
          certificateType: jobResult.certificateType,
          requestedAt: jobResult.requestedAt,
          data: jobResult,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 11. GET /api/v1/certificates/student/:studentId
  router.get(
    '/certificates/student/:studentId',
    studentIdorGuardMiddleware('studentId'),
    async (req, res, next) => {
      try {
        const certificates = await academicRepository.findByStudentId(
          req.params.studentId
        );
        res.status(200).json({
          success: true,
          count: certificates.length,
          certificates,
          data: certificates,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 12. GET /api/v1/certificates/download/:codeOrId (Proxy/Redirección hacia el PDF real en Worker)
  router.get('/certificates/download/:codeOrId', async (req, res, next) => {
    try {
      const cert = await academicRepository.findByIdOrVerificationCode(
        req.params.codeOrId
      );
      if (!cert) {
        throw new ResourceNotFoundError('Certificado Académico', req.params.codeOrId);
      }
      res.redirect(302, `${env.WORKER_SERVICE_URL}/public/certificates/${cert.id}.pdf`);
    } catch (err) {
      next(err);
    }
  });

  // 13. GET /api/v1/certificates/:jobId
  router.get('/certificates/:jobId', async (req, res, next) => {
    try {
      const cert = await academicRepository.findByIdOrVerificationCode(req.params.jobId);
      if (!cert) {
        throw new ResourceNotFoundError('Trabajo de Certificado', req.params.jobId);
      }
      res.status(200).json({
        success: true,
        ...cert,
        data: cert,
      });
    } catch (err) {
      next(err);
    }
  });

  // 14. POST /api/v1/payments/webhook
  router.post(
    '/payments/webhook',
    zodValidationMiddleware(paymentWebhookSchema),
    async (req, res, next) => {
      try {
        const updated = await academicRepository.confirmPaymentByWebhook({
          paymentReference: req.body.paymentReference,
          status: req.body.status,
        });
        res.status(200).json({
          success: true,
          message: 'Webhook financiero procesado exitosamente.',
          data: updated,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
