"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeterministicRuleEngineAdapter = void 0;
const DEFAULT_QUICK_REPLIES = [
    '📊 Ver mis notas y promedio',
    '🎯 ¿Cuánto necesito en el Corte 3?',
    '📄 Generar certificado de estudio en PDF',
    '📅 Mi horario y estado de matrícula',
];
class DeterministicRuleEngineAdapter {
    academicContextPort;
    rules = [
        {
            intent: 'INTENT_NEEDED_SCORE',
            patterns: [
                { regex: /\b(cuanto|que nota)\s+(necesito|me falta|debo sacar|requiero)\b/i, weight: 10 },
                { regex: /\b(corte\s*3|tercer\s*corte|40%|cuarenta\s*por\s*ciento)\b/i, weight: 8 },
                { regex: /\b(simular|proyectar|calcular)\s+(nota|corte|promedio)\b/i, weight: 8 },
                { regex: /\b(para\s+pasar|para\s+aprobar|pasar\s+en\s+3)\b/i, weight: 7 },
                { regex: /\bmantenimiento\s+y\s+pruebas\b/i, weight: 5 },
            ],
        },
        {
            intent: 'INTENT_GENERATE_CERTIFICATE',
            patterns: [
                {
                    regex: /\b(generar|expedir|solicitar|descargar|crear|emitir)\s+(un\s+|el\s+|mi\s+)?(certificado|constancia|boletin|paz y salvo)\b/i,
                    weight: 12,
                },
                { regex: /\b(certificado\s+de\s+estudio|constancia\s+de\s+estudio)\b/i, weight: 10 },
                { regex: /\b(certificado\s+de\s+notas|boletin\s+de\s+notas|certificado\s+en\s+pdf)\b/i, weight: 10 },
                { regex: /\b(certificado|constancia|pdf)\b/i, weight: 6 },
            ],
        },
        {
            intent: 'INTENT_GRADES',
            patterns: [
                { regex: /\b(mis\s+notas|ver\s+notas|consultar\s+notas|calificaciones)\b/i, weight: 10 },
                { regex: /\b(promedio|pga|definitiva|rendimiento\s+academico)\b/i, weight: 8 },
                { regex: /\b(notas|cortes|nota)\b/i, weight: 6 },
            ],
        },
        {
            intent: 'INTENT_PAYMENT_STATUS',
            patterns: [
                { regex: /\b(estado\s+de\s+pago|estado\s+financiero|recibo\s+de\s+pago)\b/i, weight: 11 },
                { regex: /\b(pago|pagos|recibo|liquidacion|financiero|deuda|paz\s+y\s+salvo\s+financiero)\b/i, weight: 8 },
            ],
        },
        {
            intent: 'INTENT_SCHEDULE',
            patterns: [
                { regex: /\b(mi\s+horario|ver\s+horario|horario\s+de\s+clases)\b/i, weight: 10 },
                { regex: /\b(materias\s+inscritas|asignaturas\s+matriculadas|estado\s+de\s+matricula)\b/i, weight: 9 },
                { regex: /\b(horario|aulas|salones|docentes|profesores|creditos|matricula)\b/i, weight: 6 },
            ],
        },
        {
            intent: 'INTENT_FAQ_CALENDAR',
            patterns: [
                { regex: /\b(calendario\s+academico|fechas\s+oficiales|reglamento\s+estudiantil)\b/i, weight: 11 },
                { regex: /\b(calendario|fechas|cancelacion|adicion|habilitaciones|grados|reglamento)\b/i, weight: 8 },
            ],
        },
    ];
    constructor(academicContextPort) {
        this.academicContextPort = academicContextPort;
    }
    getEngineName() {
        return 'DETERMINISTIC_RULES';
    }
    isAvailable(_preferredMode) {
        return true;
    }
    normalizeText(input) {
        return input
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }
    classifyIntent(rawMessage) {
        const normalized = this.normalizeText(rawMessage);
        let bestIntent = 'INTENT_HELP';
        let highestScore = 0;
        for (const rule of this.rules) {
            let score = 0;
            for (const pattern of rule.patterns) {
                if (pattern.regex.test(normalized)) {
                    score += pattern.weight;
                }
            }
            if (score > highestScore) {
                highestScore = score;
                bestIntent = rule.intent;
            }
        }
        return bestIntent;
    }
    detectRequestedCertificateType(rawMessage) {
        const normalized = this.normalizeText(rawMessage);
        if (/\b(notas|calificaciones|boletin|grades)\b/i.test(normalized)) {
            return 'GRADES';
        }
        if (/\b(paz\s+y\s+salvo|buena\s+conducta|good_standing)\b/i.test(normalized)) {
            return 'GOOD_STANDING';
        }
        return 'STUDY';
    }
    async generateReply(input) {
        const { message, studentContext } = input;
        const intent = this.classifyIntent(message);
        switch (intent) {
            case 'INTENT_NEEDED_SCORE': {
                const pendingCourses = studentContext.courses.filter((c) => c.cut3 === null);
                const completedCourses = studentContext.courses.filter((c) => c.cut3 !== null);
                const completedLines = completedCourses
                    .map((c) => `• **${c.courseCode} ${c.courseName}**: Corte 1 (${c.cut1?.toFixed(1)}) | Corte 2 (${c.cut2?.toFixed(1)}) | Corte 3 (${c.cut3?.toFixed(1)}) → **Definitiva: ${c.finalGrade?.toFixed(2)} (APROBADA ✅)**`)
                    .join('\n');
                const pendingLines = pendingCourses.length > 0
                    ? pendingCourses
                        .map((c) => {
                        const needed = c.neededInCut3ToPass ?? 0;
                        return `• **${c.courseCode} ${c.courseName}**: Llevas Corte 1 (**${c.cut1?.toFixed(1)}**) y Corte 2 (**${c.cut2?.toFixed(1)}**), lo que equivale a un acumulado ponderado de **${c.accumulatedGrade.toFixed(2)}** sobre 5.00 (60% evaluado). Para aprobar la asignatura en **3.00**, necesitas únicamente **${needed.toFixed(2)}** en el **Corte 3 (40%)**.`;
                    })
                        .join('\n')
                    : '• Ya tienes el 100% de los cortes calificados y aprobados en todas tus asignaturas.';
                const reply = [
                    `🎯 **Simulación Matemática de Corte 3 (40%) — ${studentContext.fullName}** (${studentContext.campusName}):`,
                    '',
                    '**Asignaturas con Corte 3 pendiente:**',
                    pendingLines,
                    '',
                    '**Asignaturas ya cerradas y aprobadas (100% evaluado):**',
                    completedLines,
                ].join('\n');
                return {
                    sessionId: input.sessionId,
                    reply,
                    engineUsed: 'DETERMINISTIC_RULES',
                    intentDetected: 'INTENT_NEEDED_SCORE',
                    actionExecuted: 'consultar_notas_y_promedio',
                    toolCalled: 'consultar_notas_y_promedio',
                    suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
                    dataAttachment: {
                        type: 'GRADES_TABLE',
                        title: `Proyección Corte 3 y Calificaciones — ${studentContext.periodCode}`,
                        payload: {
                            studentCode: studentContext.studentCode,
                            fullName: studentContext.fullName,
                            campusCode: studentContext.campusCode,
                            periodCode: studentContext.periodCode,
                            pga: studentContext.pga,
                            courses: studentContext.courses,
                        },
                    },
                };
            }
            case 'INTENT_GRADES': {
                const courseSummaryLines = studentContext.courses
                    .map((c) => {
                    if (c.cut3 !== null && c.finalGrade !== null) {
                        return `• **${c.courseCode} - ${c.courseName}** (${c.credits} créd.): C1: **${c.cut1?.toFixed(1)}** | C2: **${c.cut2?.toFixed(1)}** | C3: **${c.cut3.toFixed(1)}** → Definitiva: **${c.finalGrade.toFixed(2)}** (Aprobada ✅)`;
                    }
                    return `• **${c.courseCode} - ${c.courseName}** (${c.credits} créd.): C1: **${c.cut1?.toFixed(1)}** | C2: **${c.cut2?.toFixed(1)}** | C3: *Pendiente* → Acumulado: **${c.accumulatedGrade.toFixed(2)}** (Necesitas **${(c.neededInCut3ToPass ?? 0).toFixed(2)}** en el Corte 3 para aprobar en 3.00)`;
                })
                    .join('\n');
                const reply = [
                    `📊 **Resumen Académico en Vivo — ${studentContext.fullName}** (Código \`${studentContext.studentCode}\` | Sede **${studentContext.campusCity} - ${studentContext.campusCode}**):`,
                    '',
                    `• **Programa:** ${studentContext.programName} (${studentContext.periodCode})`,
                    `• **Promedio General Acumulado (PGA):** **${studentContext.pga.toFixed(2)} / 5.00**`,
                    `• **Créditos Matriculados:** ${studentContext.totalEnrolledCredits} créditos (${studentContext.courses.length} asignaturas)`,
                    '',
                    '**Detalle de Calificaciones (Ponderación USCO 30% / 30% / 40%):**',
                    courseSummaryLines,
                ].join('\n');
                return {
                    sessionId: input.sessionId,
                    reply,
                    engineUsed: 'DETERMINISTIC_RULES',
                    intentDetected: 'INTENT_GRADES',
                    actionExecuted: 'consultar_notas_y_promedio',
                    toolCalled: 'consultar_notas_y_promedio',
                    suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
                    dataAttachment: {
                        type: 'GRADES_TABLE',
                        title: `Calificaciones Oficiales ${studentContext.periodCode} — ${studentContext.fullName}`,
                        payload: {
                            studentCode: studentContext.studentCode,
                            fullName: studentContext.fullName,
                            campusCode: studentContext.campusCode,
                            periodCode: studentContext.periodCode,
                            pga: studentContext.pga,
                            totalCredits: studentContext.totalEnrolledCredits,
                            courses: studentContext.courses,
                        },
                    },
                };
            }
            case 'INTENT_GENERATE_CERTIFICATE': {
                const certificateType = this.detectRequestedCertificateType(message);
                const generatedCert = await this.academicContextPort.requestCertificateGeneration(studentContext, certificateType);
                const certLabel = certificateType === 'GRADES'
                    ? 'Certificado Oficial de Calificaciones (GRADES)'
                    : certificateType === 'GOOD_STANDING'
                        ? 'Certificado de Paz y Salvo Académico (GOOD_STANDING)'
                        : 'Certificado de Estudio Activo (STUDY)';
                const reply = [
                    `📄 **¡Solicitud de Certificado Procesada Exitosamente!**`,
                    '',
                    `He generado y registrado tu **${certLabel}** para **${studentContext.fullName}** (Código \`${studentContext.studentCode}\` — ${studentContext.campusName}):`,
                    `• **ID de Trabajo (Job ID):** \`${generatedCert.id}\``,
                    `• **Código de Verificación QR/Hash:** \`${generatedCert.verificationCode}\``,
                    `• **Estado:** \`${generatedCert.status}\``,
                    `• **Descarga Directa PDF:** ${generatedCert.pdfUrl}`,
                ].join('\n');
                return {
                    sessionId: input.sessionId,
                    reply,
                    engineUsed: 'DETERMINISTIC_RULES',
                    intentDetected: 'INTENT_GENERATE_CERTIFICATE',
                    actionExecuted: 'generar_certificado_academico',
                    toolCalled: 'generar_certificado_academico',
                    suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
                    dataAttachment: {
                        type: 'CERTIFICATE_CARD',
                        title: certLabel,
                        payload: {
                            jobId: generatedCert.id,
                            verificationCode: generatedCert.verificationCode,
                            certificateType: generatedCert.certificateType,
                            status: generatedCert.status,
                            pdfUrl: generatedCert.pdfUrl,
                            studentName: studentContext.fullName,
                            studentCode: studentContext.studentCode,
                            campusName: studentContext.campusName,
                        },
                    },
                };
            }
            case 'INTENT_SCHEDULE': {
                const scheduleLines = studentContext.courses
                    .map((c) => `• **${c.courseCode} ${c.courseName}** (Grupo \`${c.groupNumber}\` — ${c.credits} créd.)\n  🕒 ${c.scheduleText} | 📍 ${c.classroom} | 👨‍🏫 ${c.teacherName}`)
                    .join('\n');
                const reply = [
                    `📅 **Horario y Matrícula Activa ${studentContext.periodCode} — ${studentContext.fullName}**`,
                    `📍 **Sede:** ${studentContext.campusName} (\`${studentContext.campusCode}\`) | **Estado Financiero:** \`${studentContext.financialStatus}\``,
                    '',
                    scheduleLines,
                ].join('\n');
                return {
                    sessionId: input.sessionId,
                    reply,
                    engineUsed: 'DETERMINISTIC_RULES',
                    intentDetected: 'INTENT_SCHEDULE',
                    actionExecuted: 'consultar_horario_y_matricula',
                    toolCalled: 'consultar_horario_y_matricula',
                    suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
                    dataAttachment: {
                        type: 'SCHEDULE_LIST',
                        title: `Horario Oficial ${studentContext.periodCode} — Sede ${studentContext.campusCity}`,
                        payload: {
                            studentCode: studentContext.studentCode,
                            fullName: studentContext.fullName,
                            campusCode: studentContext.campusCode,
                            campusName: studentContext.campusName,
                            periodCode: studentContext.periodCode,
                            financialStatus: studentContext.financialStatus,
                            totalCredits: studentContext.totalEnrolledCredits,
                            schedule: studentContext.courses.map((c) => ({
                                courseCode: c.courseCode,
                                courseName: c.courseName,
                                groupNumber: c.groupNumber,
                                credits: c.credits,
                                scheduleText: c.scheduleText,
                                classroom: c.classroom,
                                teacherName: c.teacherName,
                                paymentReference: c.paymentReference,
                                paymentStatus: c.paymentStatus,
                            })),
                        },
                    },
                };
            }
            case 'INTENT_PAYMENT_STATUS': {
                const paymentLines = studentContext.courses
                    .map((c) => `• **${c.courseCode} ${c.courseName}**: Recibo \`${c.paymentReference}\` → Estado: **${c.paymentStatus}** ✅`)
                    .join('\n');
                const reply = [
                    `💳 **Estado Financiero y Derechos de Matrícula (${studentContext.periodCode})**`,
                    `Estudiante: **${studentContext.fullName}** (Código \`${studentContext.studentCode}\` — Sede ${studentContext.campusCity})`,
                    `Estado General: **${studentContext.financialStatus} (Paz y Salvo Financiero Activo)**`,
                    '',
                    '**Referencias de Pago Registradas:**',
                    paymentLines,
                ].join('\n');
                return {
                    sessionId: input.sessionId,
                    reply,
                    engineUsed: 'DETERMINISTIC_RULES',
                    intentDetected: 'INTENT_PAYMENT_STATUS',
                    actionExecuted: 'consultar_horario_y_matricula',
                    toolCalled: 'consultar_horario_y_matricula',
                    suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
                    dataAttachment: {
                        type: 'PAYMENT_SUMMARY',
                        title: `Estado Financiero ${studentContext.periodCode}`,
                        payload: {
                            studentCode: studentContext.studentCode,
                            financialStatus: studentContext.financialStatus,
                            payments: studentContext.courses.map((c) => ({
                                courseCode: c.courseCode,
                                courseName: c.courseName,
                                paymentReference: c.paymentReference,
                                paymentStatus: c.paymentStatus,
                            })),
                        },
                    },
                };
            }
            case 'INTENT_FAQ_CALENDAR': {
                const reply = [
                    `🏛️ **Calendario Académico Oficial ${studentContext.periodCode} y Reglamento Estudiantil USCO**`,
                    '',
                    '• **Inicio y Fin de Semestre:** 15 de agosto de 2026 al 20 de diciembre de 2026.',
                    '• **Adición y Cancelación de Asignaturas:** Hasta la semana 4 del calendario académico sin afectación en hoja de vida.',
                    '• **Ponderación Oficial de Calificaciones:**',
                    '  - **Corte 1:** 30% (Semanas 1 a 5)',
                    '  - **Corte 2:** 30% (Semanas 6 a 11)',
                    '  - **Corte 3:** 40% (Semanas 12 a 16 — Sustentación Final)',
                    '• **Nota Mínima Aprobatoria:** **3.00 / 5.00**.',
                    '• **Habilitaciones:** Del 14 al 18 de diciembre de 2026 para asignaturas teóricas con definitiva entre 2.00 y 2.99.',
                    '• **Cobertura Descentralizada Multi-Sede:** Sincronización en tiempo real entre **Neiva (`NEI`)**, **Pitalito (`PIT`)**, **Garzón (`GAR`)** y **La Plata (`LPL`)**.',
                ].join('\n');
                return {
                    sessionId: input.sessionId,
                    reply,
                    engineUsed: 'DETERMINISTIC_RULES',
                    intentDetected: 'INTENT_FAQ_CALENDAR',
                    actionExecuted: 'consultar_calendario_y_reglamento',
                    toolCalled: 'consultar_calendario_y_reglamento',
                    suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
                    dataAttachment: {
                        type: 'CALENDAR_INFO',
                        title: 'Calendario Académico USCO 2026-2',
                        payload: {
                            periodCode: '2026-2',
                            campuses: ['NEI - Neiva', 'PIT - Pitalito', 'GAR - Garzón', 'LPL - La Plata'],
                            weights: { cut1: 0.3, cut2: 0.3, cut3: 0.4 },
                            minimumPassingGrade: 3.0,
                        },
                    },
                };
            }
            case 'INTENT_HELP':
            default: {
                const reply = [
                    `👋 ¡Hola, **${studentContext.fullName}**! Soy el **Asistente Académico Inteligente USCO-Net** con soporte multi-sede en **Neiva (\`NEI\`), Pitalito (\`PIT\`), Garzón (\`GAR\`) y La Plata (\`LPL\`)**.`,
                    '',
                    `Estás conectado en la **${studentContext.campusName}** — Programa de **${studentContext.programName}** (Periodo \`${studentContext.periodCode}\`, PGA actual: **${studentContext.pga.toFixed(2)}**).`,
                    '',
                    'Puedo ayudarte en tiempo real con:',
                    '1. 📊 **Consultar tus notas de los Cortes 1, 2 y 3** y tu promedio general.',
                    '2. 🎯 **Calcular cuánto necesitas en el Corte 3 (40%)** para aprobar cada materia en `3.00`.',
                    '3. 📄 **Generar y descargar certificados oficiales en PDF** con firma SHA-256 y QR (`STUDY`, `GRADES`, `GOOD_STANDING`).',
                    '4. 📅 **Ver tu horario de clases, aulas, docentes y estado de pago (`PAID`)**.',
                    '5. 🏛️ **Consultar fechas del Calendario Académico 2026-2 y reglamento USCO**.',
                ].join('\n');
                return {
                    sessionId: input.sessionId,
                    reply,
                    engineUsed: 'DETERMINISTIC_RULES',
                    intentDetected: 'INTENT_HELP',
                    actionExecuted: null,
                    toolCalled: null,
                    suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
                    dataAttachment: null,
                };
            }
        }
    }
}
exports.DeterministicRuleEngineAdapter = DeterministicRuleEngineAdapter;
//# sourceMappingURL=DeterministicRuleEngineAdapter.js.map