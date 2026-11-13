import bcrypt from 'bcryptjs';
import {
  prisma,
  Role,
  EnrollmentStatus,
  PaymentStatus,
  CertificateType,
  CertificateJobStatus,
  ChatEngine,
  calculateWeightedGrade,
  generateCertificateSignatureHash,
} from '../src/index';

/**
 * Contraseña estándar institucional para todos los usuarios de demostración y auditoría E2E:
 * "Usco2026*"
 */
const DEFAULT_DEMO_PASSWORD = 'Usco2026*';

async function main() {
  console.log('================================================================================');
  console.log('🌱 INICIANDO SEED MULTI-SEDE DE EDUDISTRIBUIDA / USCO-NET (PERIODO 2026-2)');
  console.log('================================================================================');

  const passwordHash = await bcrypt.hash(DEFAULT_DEMO_PASSWORD, 10);

  // 1. Limpieza ordenada para garantizar idempotencia total en re-ejecuciones
  await prisma.chatInteractionLog.deleteMany({});
  await prisma.certificateJob.deleteMany({});
  await prisma.grade.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.courseSection.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.academicPeriod.deleteMany({});
  await prisma.academicProgram.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.campus.deleteMany({});

  // 2. Creación de las 4 Sedes de la Universidad Surcolombiana (Huila)
  const campusNeiva = await prisma.campus.create({
    data: {
      id: '11111111-1111-4111-8111-111111111101',
      code: 'NEI',
      name: 'Sede Central Neiva - Av. Pastrana Borrero',
      city: 'Neiva',
      address: 'Avenida Pastrana Borrero - Carrera 1, Neiva, Huila',
      isActive: true,
    },
  });

  const campusPitalito = await prisma.campus.create({
    data: {
      id: '11111111-1111-4111-8111-111111111102',
      code: 'PIT',
      name: 'Sede Regional Pitalito - Macizo Colombiano',
      city: 'Pitalito',
      address: 'Kilómetro 1 Vía Pitalito - Palestina, Pitalito, Huila',
      isActive: true,
    },
  });

  const campusGarzon = await prisma.campus.create({
    data: {
      id: '11111111-1111-4111-8111-111111111103',
      code: 'GAR',
      name: 'Sede Regional Garzón - Centro del Huila',
      city: 'Garzón',
      address: 'Carrera 3 No. 1-31 Vía las Termitas, Garzón, Huila',
      isActive: true,
    },
  });

  const campusLaPlata = await prisma.campus.create({
    data: {
      id: '11111111-1111-4111-8111-111111111104',
      code: 'LPL',
      name: 'Sede Regional La Plata - Occidente del Huila',
      city: 'La Plata',
      address: 'Kilómetro 1 Vía Fátima, La Plata, Huila',
      isActive: true,
    },
  });

  console.log('✅ 1/8 Sedes USCO creadas: NEI (Neiva), PIT (Pitalito), GAR (Garzón), LPL (La Plata)');

  // 3. Programas Académicos por Sede
  const programNeiva = await prisma.academicProgram.create({
    data: {
      id: '22222222-2222-4222-8222-222222222201',
      code: 'ISW-NEI',
      name: 'Ingeniería de Software',
      faculty: 'Facultad de Ingeniería',
      totalCredits: 165,
      campusId: campusNeiva.id,
    },
  });

  await prisma.academicProgram.createMany({
    data: [
      {
        id: '22222222-2222-4222-8222-222222222202',
        code: 'ISW-PIT',
        name: 'Ingeniería de Software (Regional Sur)',
        faculty: 'Facultad de Ingeniería',
        totalCredits: 165,
        campusId: campusPitalito.id,
      },
      {
        id: '22222222-2222-4222-8222-222222222203',
        code: 'ISW-GAR',
        name: 'Ingeniería de Software (Regional Centro)',
        faculty: 'Facultad de Ingeniería',
        totalCredits: 165,
        campusId: campusGarzon.id,
      },
      {
        id: '22222222-2222-4222-8222-222222222204',
        code: 'ISW-LPL',
        name: 'Ingeniería de Software (Regional Occidente)',
        faculty: 'Facultad de Ingeniería',
        totalCredits: 165,
        campusId: campusLaPlata.id,
      },
    ],
  });

  // 4. Periodo Académico Activo 2026-2
  const period20262 = await prisma.academicPeriod.create({
    data: {
      id: '33333333-3333-4333-8333-333333333301',
      code: '2026-2',
      name: 'Segundo Periodo Académico 2026 (Agosto - Diciembre)',
      isActive: true,
      enrollmentStart: new Date('2026-07-15T00:00:00.000Z'),
      enrollmentEnd: new Date('2026-12-20T23:59:59.000Z'),
    },
  });

  console.log('✅ 2/8 Programas Académicos y Periodo Activo 2026-2 configurados');

  // 5. Usuarios Institucionales (Admin, Docentes y Estudiantes de las 4 sedes)
  const adminUser = await prisma.user.create({
    data: {
      id: '44444444-4444-4444-8444-444444444401',
      supabaseUid: 'supa-admin-usco-001',
      email: 'admin@usco.edu.co',
      passwordHash,
      fullName: 'Dra. María Fernanda Perdomo (Registro y Control USCO)',
      documentNumber: '1075200100',
      studentCode: null,
      role: Role.ADMIN,
      campusId: campusNeiva.id,
    },
  });

  const teacherUser = await prisma.user.create({
    data: {
      id: '44444444-4444-4444-8444-444444444402',
      supabaseUid: 'supa-teacher-usco-001',
      email: 'docente.software@usco.edu.co',
      passwordHash,
      fullName: 'Ing. Carlos Eduardo Ramírez, M.Sc.',
      documentNumber: '1075210200',
      studentCode: null,
      role: Role.TEACHER,
      campusId: campusNeiva.id,
    },
  });

  // Docente regional: dicta los grupos de Pitalito, Garzón y La Plata. Permite demostrar
  // que cada docente solo ve y califica sus propios grupos (aislamiento OWASP A01).
  const regionalTeacherUser = await prisma.user.create({
    data: {
      id: '44444444-4444-4444-8444-444444444407',
      supabaseUid: 'supa-teacher-usco-002',
      email: 'docente.regional@usco.edu.co',
      passwordHash,
      fullName: 'Mg. Laura Patricia Cuéllar',
      documentNumber: '1075230300',
      studentCode: null,
      role: Role.TEACHER,
      campusId: campusPitalito.id,
    },
  });

  const alvaroStudent = await prisma.user.create({
    data: {
      id: '44444444-4444-4444-8444-444444444403',
      supabaseUid: 'supa-student-alvaro-001',
      email: 'alvaro.andrade@usco.edu.co',
      passwordHash,
      fullName: 'Álvaro Javier Andrade',
      documentNumber: '1075289412',
      studentCode: '20221203806',
      role: Role.STUDENT,
      campusId: campusNeiva.id,
    },
  });

  const studentPitalito = await prisma.user.create({
    data: {
      id: '44444444-4444-4444-8444-444444444404',
      supabaseUid: 'supa-student-pitalito-001',
      email: 'valentina.rojas@usco.edu.co',
      passwordHash,
      fullName: 'Valentina Rojas Ordóñez',
      documentNumber: '1083912345',
      studentCode: '20231104512',
      role: Role.STUDENT,
      campusId: campusPitalito.id,
    },
  });

  const studentGarzon = await prisma.user.create({
    data: {
      id: '44444444-4444-4444-8444-444444444405',
      supabaseUid: 'supa-student-garzon-001',
      email: 'santiago.trujillo@usco.edu.co',
      passwordHash,
      fullName: 'Santiago Trujillo Calderón',
      documentNumber: '1079411223',
      studentCode: '20222108934',
      role: Role.STUDENT,
      campusId: campusGarzon.id,
    },
  });

  const studentLaPlata = await prisma.user.create({
    data: {
      id: '44444444-4444-4444-8444-444444444406',
      supabaseUid: 'supa-student-laplata-001',
      email: 'camila.pastrana@usco.edu.co',
      passwordHash,
      fullName: 'Camila Andrea Pastrana Polanía',
      documentNumber: '1081722334',
      studentCode: '20232109811',
      role: Role.STUDENT,
      campusId: campusLaPlata.id,
    },
  });

  console.log('✅ 3/8 Usuarios creados con hash bcryptjs (Password estándar: Usco2026*)');

  // 6. Creación de los 6 Cursos Reales del Plan de Estudios de Ingeniería de Software
  const courseISW401 = await prisma.course.create({
    data: {
      id: '55555555-5555-4555-8555-555555555501',
      code: 'ISW-401',
      name: 'Ingeniería de Software II',
      credits: 3,
      semesterLevel: 7,
      programId: programNeiva.id,
    },
  });

  const courseISW402 = await prisma.course.create({
    data: {
      id: '55555555-5555-4555-8555-555555555502',
      code: 'ISW-402',
      name: 'Sistemas Distribuidos',
      credits: 3,
      semesterLevel: 7,
      programId: programNeiva.id,
    },
  });

  const courseISW403 = await prisma.course.create({
    data: {
      id: '55555555-5555-4555-8555-555555555503',
      code: 'ISW-403',
      name: 'Mantenimiento y Pruebas de Software',
      credits: 3,
      semesterLevel: 7,
      programId: programNeiva.id,
    },
  });

  const courseISW304 = await prisma.course.create({
    data: {
      id: '55555555-5555-4555-8555-555555555504',
      code: 'ISW-304',
      name: 'Bases de Datos II',
      credits: 4,
      semesterLevel: 6,
      programId: programNeiva.id,
    },
  });

  const courseISW302 = await prisma.course.create({
    data: {
      id: '55555555-5555-4555-8555-555555555505',
      code: 'ISW-302',
      name: 'Arquitectura de Computadores',
      credits: 3,
      semesterLevel: 5,
      programId: programNeiva.id,
    },
  });

  const courseISW405 = await prisma.course.create({
    data: {
      id: '55555555-5555-4555-8555-555555555506',
      code: 'ISW-405',
      name: 'Inteligencia Artificial',
      credits: 3,
      semesterLevel: 8,
      programId: programNeiva.id,
    },
  });

  console.log('✅ 4/8 Cursos del plan de estudios creados (ISW-401, ISW-402, ISW-403, ISW-304, ISW-302, ISW-405)');

  // 7. Secciones Abiertas (CourseSection) en Neiva y en las 3 Sedes Regionales
  const sectionISW401Neiva = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666601',
      groupNumber: 'G01-NEI',
      scheduleText: 'Lunes y Miércoles 08:00 - 10:00',
      classroom: 'Bloque Ingeniería Aula 302 - Lab Software',
      maxQuota: 30,
      occupiedQuota: 24,
      courseId: courseISW401.id,
      teacherId: teacherUser.id,
      periodId: period20262.id,
      campusId: campusNeiva.id,
    },
  });

  const sectionISW402Neiva = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666602',
      groupNumber: 'G01-NEI',
      scheduleText: 'Martes y Jueves 10:00 - 12:00',
      classroom: 'Bloque Ingeniería Aula 401 - Redes y Cloud',
      maxQuota: 30,
      occupiedQuota: 22,
      courseId: courseISW402.id,
      teacherId: teacherUser.id,
      periodId: period20262.id,
      campusId: campusNeiva.id,
    },
  });

  const sectionISW403Neiva = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666603',
      groupNumber: 'G01-NEI',
      scheduleText: 'Miércoles 14:00 - 17:00',
      classroom: 'Bloque Ingeniería Lab QA 204',
      maxQuota: 25,
      occupiedQuota: 19,
      courseId: courseISW403.id,
      teacherId: teacherUser.id,
      periodId: period20262.id,
      campusId: campusNeiva.id,
    },
  });

  const sectionISW304Neiva = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666604',
      groupNumber: 'G01-NEI',
      scheduleText: 'Martes y Viernes 06:00 - 08:00',
      classroom: 'Sala de Cómputo Central 105',
      maxQuota: 35,
      occupiedQuota: 28,
      courseId: courseISW304.id,
      teacherId: teacherUser.id,
      periodId: period20262.id,
      campusId: campusNeiva.id,
    },
  });

  // Secciones disponibles con cupos libres para inscribir en vivo (E2E Playwright y Demo)
  const sectionISW405Neiva = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666605',
      groupNumber: 'G01-NEI',
      scheduleText: 'Jueves 14:00 - 17:00',
      classroom: 'Laboratorio de Inteligencia Artificial 305',
      maxQuota: 25,
      occupiedQuota: 15,
      courseId: courseISW405.id,
      teacherId: teacherUser.id,
      periodId: period20262.id,
      campusId: campusNeiva.id,
    },
  });

  const sectionISW302Neiva = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666606',
      groupNumber: 'G01-NEI',
      scheduleText: 'Viernes 10:00 - 13:00',
      classroom: 'Laboratorio de Hardware y Microprocesadores 102',
      maxQuota: 30,
      occupiedQuota: 12,
      courseId: courseISW302.id,
      teacherId: teacherUser.id,
      periodId: period20262.id,
      campusId: campusNeiva.id,
    },
  });

  // Secciones regionales en Pitalito, Garzón y La Plata para métricas multi-sede
  const sectionPitalito = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666607',
      groupNumber: 'G01-PIT',
      scheduleText: 'Lunes y Miércoles 18:00 - 20:00',
      classroom: 'Sede Pitalito - Bloque B Sala 201',
      maxQuota: 30,
      occupiedQuota: 21,
      courseId: courseISW401.id,
      teacherId: regionalTeacherUser.id,
      periodId: period20262.id,
      campusId: campusPitalito.id,
    },
  });

  const sectionGarzon = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666608',
      groupNumber: 'G01-GAR',
      scheduleText: 'Martes y Jueves 18:00 - 20:00',
      classroom: 'Sede Garzón - Edificio Central Sala 104',
      maxQuota: 25,
      occupiedQuota: 18,
      courseId: courseISW402.id,
      teacherId: regionalTeacherUser.id,
      periodId: period20262.id,
      campusId: campusGarzon.id,
    },
  });

  const sectionLaPlata = await prisma.courseSection.create({
    data: {
      id: '66666666-6666-4666-8666-666666666609',
      groupNumber: 'G01-LPL',
      scheduleText: 'Viernes 14:00 - 18:00',
      classroom: 'Sede La Plata - Sala de Sistemas 101',
      maxQuota: 25,
      occupiedQuota: 16,
      courseId: courseISW304.id,
      teacherId: regionalTeacherUser.id,
      periodId: period20262.id,
      campusId: campusLaPlata.id,
    },
  });

  console.log('✅ 5/8 Secciones creadas en las 4 sedes (6 en Neiva + 3 en Sedes Regionales)');

  // 8. Matrículas Activas (Enrollments) y Calificaciones Ponderadas (Grades)
  const alvaroEnrollmentsData = [
    {
      enrollmentId: '77777777-7777-4777-8777-777777777701',
      sectionId: sectionISW401Neiva.id,
      paymentRef: 'REC-USCO-20262-00101',
      cut1: 4.6,
      cut2: 4.8,
      cut3: 4.7,
      obs: 'Excelente dominio de Arquitectura Hexagonal, Modelo C4 y Pruebas Automatizadas.',
    },
    {
      enrollmentId: '77777777-7777-4777-8777-777777777702',
      sectionId: sectionISW402Neiva.id,
      paymentRef: 'REC-USCO-20262-00102',
      cut1: 4.5,
      cut2: 4.4,
      cut3: 4.6,
      obs: 'Implementación destacada de colas asíncronas Redis/BullMQ y tolerancia a fallos.',
    },
    {
      enrollmentId: '77777777-7777-4777-8777-777777777703',
      sectionId: sectionISW403Neiva.id,
      paymentRef: 'REC-USCO-20262-00103',
      cut1: 4.3,
      cut2: 4.5,
      cut3: null,
      obs: 'Cortes 1 y 2 aprobados con excelencia. Pendiente sustentación final Corte 3 (40%).',
    },
    {
      enrollmentId: '77777777-7777-4777-8777-777777777704',
      sectionId: sectionISW304Neiva.id,
      paymentRef: 'REC-USCO-20262-00104',
      cut1: 4.2,
      cut2: 4.1,
      cut3: 4.4,
      obs: 'Modelado relacional multi-sede en PostgreSQL y políticas RLS verificadas.',
    },
  ];

  for (const item of alvaroEnrollmentsData) {
    const calc = calculateWeightedGrade(item.cut1, item.cut2, item.cut3);
    const enrollment = await prisma.enrollment.create({
      data: {
        id: item.enrollmentId,
        studentId: alvaroStudent.id,
        sectionId: item.sectionId,
        periodId: period20262.id,
        status: EnrollmentStatus.ACTIVE,
        paymentReference: item.paymentRef,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    await prisma.grade.create({
      data: {
        enrollmentId: enrollment.id,
        cut1: item.cut1,
        cut2: item.cut2,
        cut3: item.cut3,
        finalGrade: calc.finalGrade,
        passed: calc.passed,
        observations: item.obs,
        updatedBy: teacherUser.email,
      },
    });
  }

  // Matrículas y notas de las sedes regionales (Pitalito, Garzón y La Plata)
  const regionalEnrollments = [
    {
      id: '77777777-7777-4777-8777-777777777705',
      studentId: studentPitalito.id,
      sectionId: sectionPitalito.id,
      paymentRef: 'REC-USCO-PIT-20262-01',
      cut1: 4.1,
      cut2: 4.3,
      cut3: 4.2,
      obs: 'Rendimiento sobresaliente en Sede Pitalito.',
    },
    {
      id: '77777777-7777-4777-8777-777777777706',
      studentId: studentGarzon.id,
      sectionId: sectionGarzon.id,
      paymentRef: 'REC-USCO-GAR-20262-01',
      cut1: 3.9,
      cut2: 4.0,
      cut3: 4.1,
      obs: 'Proyecto distribuido completado satisfactoriamente en Sede Garzón.',
    },
    {
      id: '77777777-7777-4777-8777-777777777707',
      studentId: studentLaPlata.id,
      sectionId: sectionLaPlata.id,
      paymentRef: 'REC-USCO-LPL-20262-01',
      cut1: 4.4,
      cut2: 4.2,
      cut3: 4.5,
      obs: 'Excelente desempeño en Bases de Datos II - Sede La Plata.',
    },
  ];

  for (const reg of regionalEnrollments) {
    const calc = calculateWeightedGrade(reg.cut1, reg.cut2, reg.cut3);
    const enrollment = await prisma.enrollment.create({
      data: {
        id: reg.id,
        studentId: reg.studentId,
        sectionId: reg.sectionId,
        periodId: period20262.id,
        status: EnrollmentStatus.ACTIVE,
        paymentReference: reg.paymentRef,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    await prisma.grade.create({
      data: {
        enrollmentId: enrollment.id,
        cut1: reg.cut1,
        cut2: reg.cut2,
        cut3: reg.cut3,
        finalGrade: calc.finalGrade,
        passed: calc.passed,
        observations: reg.obs,
        updatedBy: teacherUser.email,
      },
    });
  }

  console.log('✅ 6/8 Matrículas y Calificaciones (30%/30%/40%) registradas para Álvaro y Sedes Regionales');

  // 9. Trabajos Iniciales de Certificados Académicos (CertificateJob)
  const issuedIso1 = '2026-11-06T15:00:00.000Z';
  const hash1 = generateCertificateSignatureHash({
    verificationCode: 'USCO-2026-8841',
    studentCode: alvaroStudent.studentCode || '20221203806',
    documentNumber: alvaroStudent.documentNumber,
    certificateType: CertificateType.STUDY,
    issuedIsoDate: issuedIso1,
  });

  const issuedIso2 = '2026-11-06T16:30:00.000Z';
  const hash2 = generateCertificateSignatureHash({
    verificationCode: 'USCO-2026-9912',
    studentCode: alvaroStudent.studentCode || '20221203806',
    documentNumber: alvaroStudent.documentNumber,
    certificateType: CertificateType.GRADES,
    issuedIsoDate: issuedIso2,
  });

  await prisma.certificateJob.createMany({
    data: [
      {
        id: '88888888-8888-4888-8888-888888888801',
        studentId: alvaroStudent.id,
        certificateType: CertificateType.STUDY,
        status: CertificateJobStatus.COMPLETED,
        verificationCode: 'USCO-2026-8841',
        digitalSignatureHash: hash1,
        pdfUrl: '/api/v1/certificates/download/USCO-2026-8841',
        requestedAt: new Date('2026-11-06T14:59:55.000Z'),
        completedAt: new Date(issuedIso1),
      },
      {
        id: '88888888-8888-4888-8888-888888888802',
        studentId: alvaroStudent.id,
        certificateType: CertificateType.GRADES,
        status: CertificateJobStatus.COMPLETED,
        verificationCode: 'USCO-2026-9912',
        digitalSignatureHash: hash2,
        pdfUrl: '/api/v1/certificates/download/USCO-2026-9912',
        requestedAt: new Date('2026-11-06T16:29:56.000Z'),
        completedAt: new Date(issuedIso2),
      },
    ],
  });

  console.log('✅ 7/8 Trabajos iniciales en CertificateJob creados (USCO-2026-8841 y USCO-2026-9912)');

  // 10. Registro Inicial de Auditoría del Chatbot IA (ChatInteractionLog)
  await prisma.chatInteractionLog.create({
    data: {
      id: '99999999-9999-4999-8999-999999999901',
      studentId: alvaroStudent.id,
      sessionId: 'sess-seed-alvaro-2026-2',
      userPrompt: 'Hola, ¿cuál es mi estado de matrícula y mis notas actuales en Ingeniería de Software II?',
      botResponse:
        'Hola Álvaro Javier Andrade (Código 20221203806, Sede Central Neiva). Actualmente tienes 4 asignaturas matriculadas activas en el periodo 2026-2 (13 créditos). En Ingeniería de Software II (ISW-401) registras Corte 1: 4.6, Corte 2: 4.8 y Corte 3: 4.7, con definitiva de 4.70 (APROBADA).',
      engineUsed: ChatEngine.DETERMINISTIC_RULES,
      intentDetected: 'CONSULTAR_NOTAS_Y_MATRICULA',
      toolCalled: 'getStudentAcademicSummary',
      latencyMs: 9,
    },
  });

  console.log('✅ 8/8 Auditoría inicial de ChatInteractionLog registrada');
  console.log('================================================================================');
  console.log('🎉 SEED COMPLETADO EXITOSAMENTE. RESUMEN DE ACCESO DEMO:');
  console.log(`   🔑 Contraseña común: ${DEFAULT_DEMO_PASSWORD}`);
  console.log(`   👨‍🎓 Estudiante: ${alvaroStudent.email} | Código: ${alvaroStudent.studentCode} | ID: ${alvaroStudent.id}`);
  console.log(`   👩‍🏫 Docente:    ${teacherUser.email} | ID: ${teacherUser.id}`);
  console.log(`   👩‍🏫 Docente regional: ${regionalTeacherUser.email} | ID: ${regionalTeacherUser.id}`);
  console.log(`   🏛️ Admin:      ${adminUser.email} | ID: ${adminUser.id}`);
  console.log('================================================================================');
}

main()
  .catch((error) => {
    console.error('❌ Error ejecutando el seed de EduDistribuida:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
