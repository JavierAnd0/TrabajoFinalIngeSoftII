export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EduDistribuida / USCO-Net — Core Academic Service API',
    version: '1.0.0',
    description:
      'Microservicio Transaccional Académico Core bajo Arquitectura Hexagonal Estricta (Puertos y Adaptadores). Gestiona autenticación institucional JWT, matrículas atómicas con control de cupos por sede (Neiva, Pitalito, Garzón, La Plata), calificaciones ponderadas (30%/30%/40%) y encolamiento asíncrono de certificados PDF en BullMQ.',
    contact: {
      name: 'Ingeniería de Software II - Universidad Surcolombiana',
      email: 'registro@usco.edu.co',
    },
  },
  servers: [
    {
      url: 'http://localhost:4001',
      description: 'Servidor Core Académico Local (Puerto 4001)',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      WebhookSignature: {
        type: 'apiKey',
        in: 'header',
        name: 'x-webhook-signature',
        description: 'HMAC-SHA256 en hexadecimal del cuerpo JSON, firmado con PAYMENT_WEBHOOK_SECRET.',
      },
    },
  },
  paths: {
    '/api/v1/health': {
      get: {
        tags: ['Health & Observability'],
        summary: 'Verifica estado de salud del microservicio Core y conexión a PostgreSQL',
        responses: {
          '200': {
            description: 'Servicio operativo',
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Autenticación & Seguridad JWT'],
        summary: 'Autentica un usuario institucional (@usco.edu.co) y emite JWT firmado',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'alvaro.andrade@usco.edu.co' },
                  password: { type: 'string', example: 'Usco2026*' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Autenticación exitosa con token JWT' },
          '400': { description: 'Payload inválido o intento de inyección SQL/XSS bloqueado (OWASP A03)' },
          '401': { description: 'Credenciales inválidas' },
          '429': { description: 'Demasiados intentos fallidos (OWASP A07 Brute Force Protection)' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Autenticación & Seguridad JWT'],
        summary: 'Retorna el perfil del usuario autenticado a partir del Bearer JWT',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Perfil verificado' },
          '401': { description: 'No autenticado' },
        },
      },
    },
    '/api/v1/campuses': {
      get: {
        tags: ['Multi-Sede USCO'],
        summary: 'Obtiene las 4 sedes USCO (Neiva, Pitalito, Garzón, La Plata) con métricas en tiempo real',
        responses: {
          '200': { description: 'Listado de sedes y métricas de ocupación' },
        },
      },
    },
    '/api/v1/sections': {
      get: {
        tags: ['Oferta Académica & Cupos'],
        summary: 'Lista secciones abiertas con cupos disponibles filtrables por sede y estudiante',
        parameters: [
          { name: 'campusId', in: 'query', schema: { type: 'string' } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Oferta de secciones académicas' },
        },
      },
    },
    '/api/v1/students/{id}/summary': {
      get: {
        tags: ['Expediente Estudiantil'],
        summary: 'Obtiene el resumen académico integral del estudiante (acepta UUID o código estudiantil)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', example: '20221203806' },
          },
        ],
        responses: {
          '200': { description: 'Expediente académico completo con PGA y proyección Corte 3' },
          '403': { description: 'Bloqueo IDOR (OWASP A01): intento de consultar otro estudiante' },
          '404': { description: 'Estudiante no encontrado' },
        },
      },
    },
    '/api/v1/enrollments': {
      post: {
        tags: ['Matrícula Transaccional'],
        summary: 'Inscribe atómicamente a un estudiante en una sección verificando cupos y duplicados',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'sectionId'],
                properties: {
                  studentId: { type: 'string', example: '44444444-4444-4444-8444-444444444403' },
                  sectionId: { type: 'string', example: '66666666-6666-4666-8666-666666666605' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Matrícula creada exitosamente' },
          '409': { description: 'Cupo agotado o asignatura ya matriculada en el periodo' },
        },
      },
    },
    '/api/v1/grades': {
      put: {
        tags: ['Gestión Docente de Calificaciones'],
        summary: 'Actualiza las notas (Corte 1: 30%, Corte 2: 30%, Corte 3: 40%) - Exclusivo TEACHER / ADMIN',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['enrollmentId'],
                properties: {
                  enrollmentId: { type: 'string', example: '77777777-7777-4777-8777-777777777703' },
                  cut1: { type: 'number', nullable: true, example: 4.3 },
                  cut2: { type: 'number', nullable: true, example: 4.5 },
                  cut3: { type: 'number', nullable: true, example: 4.6 },
                  observations: { type: 'string', example: 'Sustentación final aprobada con mérito.' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Calificación recalculada y persistida' },
          '403': { description: 'Acceso denegado por RBAC (OWASP A01)' },
        },
      },
    },
    '/api/v1/admin/enrollments': {
      get: {
        tags: ['Panel Docente & Administrativo Multi-Sede'],
        summary: 'Matrículas y calificaciones: ADMIN ve las 4 sedes; TEACHER solo sus grupos',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'campusCode', in: 'query', required: false, schema: { type: 'string', enum: ['NEI', 'PIT', 'GAR', 'LPL'] } },
        ],
        responses: {
          '200': { description: 'Listado de matrículas y notas dentro del alcance del rol' },
          '401': { description: 'Sin token o token inválido' },
          '403': { description: 'Rol STUDENT' },
        },
      },
    },
    '/api/v1/certificates/request': {
      post: {
        tags: ['Certificados PDF Asíncronos (BullMQ)'],
        summary: 'Encola la generación asíncrona de un certificado PDF (HTTP 202). Un STUDENT solo puede pedir los suyos',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'certificateType'],
                properties: {
                  studentId: { type: 'string', example: '44444444-4444-4444-8444-444444444403' },
                  certificateType: {
                    type: 'string',
                    enum: ['STUDY', 'GRADES', 'GOOD_STANDING'],
                    example: 'STUDY',
                  },
                },
              },
            },
          },
        },
        responses: {
          '202': { description: 'Trabajo de certificado encolado exitosamente (QUEUED)' },
          '401': { description: 'Sin token o token inválido' },
          '403': { description: 'Un estudiante intentó pedir el certificado de otro' },
        },
      },
    },
    '/api/v1/certificates/{jobId}': {
      get: {
        tags: ['Certificados PDF Asíncronos (BullMQ)'],
        summary: 'Consulta el estado y URL de descarga de un certificado por jobId o código USCO-2026-XXXX',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'jobId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Detalle del trabajo de certificado' },
          '404': { description: 'Certificado no encontrado' },
        },
      },
    },
    '/api/v1/certificates/student/{studentId}': {
      get: {
        tags: ['Certificados PDF Asíncronos (BullMQ)'],
        summary: 'Lista los certificados de un estudiante (un STUDENT solo los propios)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'studentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Historial de certificados del estudiante' },
        },
      },
    },
    '/api/v1/payments/webhook': {
      post: {
        tags: ['Pagos & Liquidación Financiera'],
        summary: 'Webhook de la pasarela de pagos: confirma el pago de derechos de matrícula',
        security: [{ WebhookSignature: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['paymentReference'],
                properties: {
                  paymentReference: { type: 'string', example: 'PAG-USCO-2026-001' },
                  status: { type: 'string', enum: ['PAID', 'PENDING'], example: 'PAID' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Estado financiero actualizado' },
          '401': { description: 'Firma HMAC ausente o inválida' },
        },
      },
    },
  },
};
