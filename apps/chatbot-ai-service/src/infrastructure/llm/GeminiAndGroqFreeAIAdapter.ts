import {
  ChatMessageResponse,
  DataAttachment,
  EngineUsedType,
  PreferredEngineMode,
  StudentAcademicContext,
} from '../../domain/entities/AcademicChatEntities';
import { IAcademicContextPort } from '../../domain/ports/IAcademicContextPort';
import {
  ConversationalEngineInput,
  IConversationalEnginePort,
} from '../../domain/ports/IConversationalEnginePort';
import { DeterministicRuleEngineAdapter } from '../rules-engine/DeterministicRuleEngineAdapter';

const DEFAULT_QUICK_REPLIES = [
  '📊 Ver mis notas y promedio',
  '🎯 ¿Cuánto necesito en el Corte 3?',
  '📄 Generar certificado de estudio en PDF',
  '📅 Mi horario y estado de matrícula',
];

interface ToolExecutionResult {
  toolName: string;
  intentDetected: string;
  toolResultData: Record<string, unknown>;
  dataAttachment: DataAttachment | null;
}

export class GeminiAndGroqFreeAIAdapter implements IConversationalEnginePort {
  private readonly geminiModel: string;
  private readonly groqModel: string;

  constructor(
    private readonly academicContextPort: IAcademicContextPort,
    private readonly deterministicHelper: DeterministicRuleEngineAdapter
  ) {
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  public getEngineName(): string {
    return 'HYBRID_LLM_ADAPTER';
  }

  private getGeminiKey(): string {
    return (process.env.GEMINI_API_KEY || '').trim();
  }

  private getGroqKey(): string {
    return (process.env.GROQ_API_KEY || '').trim();
  }

  public isAvailable(preferredMode: PreferredEngineMode = 'auto'): boolean {
    const hasGemini = this.getGeminiKey().length > 10;
    const hasGroq = this.getGroqKey().length > 10;

    if (preferredMode === 'gemini') return hasGemini;
    if (preferredMode === 'groq') return hasGroq;
    if (preferredMode === 'deterministic') return false;
    return hasGemini || hasGroq;
  }

  public async generateReply(
    input: ConversationalEngineInput
  ): Promise<Omit<ChatMessageResponse, 'latencyMs'>> {
    const mode = input.preferredMode ?? 'auto';
    const hasGemini = this.getGeminiKey().length > 10;
    const hasGroq = this.getGroqKey().length > 10;

    if (mode === 'gemini' && hasGemini) {
      return this.callGeminiWithFunctionCalling(input);
    }

    if (mode === 'groq' && hasGroq) {
      return this.callGroqWithFunctionCalling(input);
    }

    if (hasGemini) {
      try {
        return await this.callGeminiWithFunctionCalling(input);
      } catch (err) {
        if (hasGroq) {
          return await this.callGroqWithFunctionCalling(input);
        }
        throw err;
      }
    }

    if (hasGroq) {
      return this.callGroqWithFunctionCalling(input);
    }

    throw new Error('No hay credenciales activas de GEMINI_API_KEY ni GROQ_API_KEY.');
  }

  /**
   * Ejecuta cualquiera de las 4 herramientas oficiales (Function Calling) contra el contexto real de PostgreSQL.
   */
  public async executeAcademicTool(
    toolName: string,
    args: Record<string, unknown>,
    studentContext: StudentAcademicContext,
    rawUserMessage: string
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'consultar_notas_y_promedio': {
        const isNeededScoreQuestion =
          this.deterministicHelper.classifyIntent(rawUserMessage) === 'INTENT_NEEDED_SCORE';
        return {
          toolName: 'consultar_notas_y_promedio',
          intentDetected: isNeededScoreQuestion ? 'INTENT_NEEDED_SCORE' : 'INTENT_GRADES',
          toolResultData: {
            studentName: studentContext.fullName,
            studentCode: studentContext.studentCode,
            campusName: studentContext.campusName,
            periodCode: studentContext.periodCode,
            pga: studentContext.pga,
            courses: studentContext.courses.map((c) => ({
              code: c.courseCode,
              name: c.courseName,
              credits: c.credits,
              cut1: c.cut1,
              cut2: c.cut2,
              cut3: c.cut3,
              accumulatedGrade: c.accumulatedGrade,
              finalGrade: c.finalGrade,
              neededInCut3ToPassIn300: c.neededInCut3ToPass,
              statusDescription: c.statusDescription,
            })),
          },
          dataAttachment: {
            type: 'GRADES_TABLE',
            title: `Calificaciones Oficiales ${studentContext.periodCode} — ${studentContext.fullName}`,
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

      case 'consultar_horario_y_matricula': {
        const isPaymentIntent =
          this.deterministicHelper.classifyIntent(rawUserMessage) === 'INTENT_PAYMENT_STATUS';
        return {
          toolName: 'consultar_horario_y_matricula',
          intentDetected: isPaymentIntent ? 'INTENT_PAYMENT_STATUS' : 'INTENT_SCHEDULE',
          toolResultData: {
            studentName: studentContext.fullName,
            studentCode: studentContext.studentCode,
            campusCode: studentContext.campusCode,
            campusName: studentContext.campusName,
            programName: studentContext.programName,
            periodCode: studentContext.periodCode,
            financialStatus: studentContext.financialStatus,
            totalCredits: studentContext.totalEnrolledCredits,
            enrolledCourses: studentContext.courses.map((c) => ({
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
          dataAttachment: {
            type: 'SCHEDULE_LIST',
            title: `Horario Oficial ${studentContext.periodCode} — ${studentContext.campusName}`,
            payload: {
              studentCode: studentContext.studentCode,
              fullName: studentContext.fullName,
              campusCode: studentContext.campusCode,
              campusName: studentContext.campusName,
              periodCode: studentContext.periodCode,
              financialStatus: studentContext.financialStatus,
              totalCredits: studentContext.totalEnrolledCredits,
              schedule: studentContext.courses,
            },
          },
        };
      }

      case 'generar_certificado_academico': {
        const rawType = String(args.certificateType || '').toUpperCase();
        const certType: 'STUDY' | 'GRADES' | 'GOOD_STANDING' =
          rawType === 'GRADES' || rawType === 'GOOD_STANDING' || rawType === 'STUDY'
            ? rawType
            : this.deterministicHelper.detectRequestedCertificateType(rawUserMessage);

        const certJob = await this.academicContextPort.requestCertificateGeneration(
          studentContext,
          certType
        );

        return {
          toolName: 'generar_certificado_academico',
          intentDetected: 'INTENT_GENERATE_CERTIFICATE',
          toolResultData: {
            jobId: certJob.id,
            verificationCode: certJob.verificationCode,
            certificateType: certJob.certificateType,
            status: certJob.status,
            pdfUrl: certJob.pdfUrl,
            studentName: studentContext.fullName,
            studentCode: studentContext.studentCode,
          },
          dataAttachment: {
            type: 'CERTIFICATE_CARD',
            title: `Certificado Oficial (${certJob.certificateType})`,
            payload: {
              jobId: certJob.id,
              verificationCode: certJob.verificationCode,
              certificateType: certJob.certificateType,
              status: certJob.status,
              pdfUrl: certJob.pdfUrl,
              studentName: studentContext.fullName,
              studentCode: studentContext.studentCode,
              campusName: studentContext.campusName,
            },
          },
        };
      }

      case 'consultar_calendario_y_reglamento':
      default: {
        return {
          toolName: 'consultar_calendario_y_reglamento',
          intentDetected: 'INTENT_FAQ_CALENDAR',
          toolResultData: {
            periodCode: '2026-2',
            semesterDates: '15 de agosto de 2026 al 20 de diciembre de 2026',
            addCancelDeadline: 'Semana 4 del calendario académico',
            gradeWeights: { cut1: '30%', cut2: '30%', cut3: '40%' },
            minimumPassingScore: 3.0,
            habilitacionesDates: '14 al 18 de diciembre de 2026',
            supportedCampuses: [
              'Neiva (NEI)',
              'Pitalito (PIT)',
              'Garzón (GAR)',
              'La Plata (LPL)',
            ],
          },
          dataAttachment: {
            type: 'CALENDAR_INFO',
            title: 'Calendario Académico USCO 2026-2',
            payload: {
              periodCode: '2026-2',
              campuses: ['NEI', 'PIT', 'GAR', 'LPL'],
              weights: { cut1: 0.3, cut2: 0.3, cut3: 0.4 },
            },
          },
        };
      }
    }
  }

  private buildSystemInstruction(student: StudentAcademicContext): string {
    return [
      'Eres el Asistente Académico Oficial de la Universidad Surcolombiana (Plataforma Distribuida USCO-Net).',
      `Atiendes al estudiante en vivo: ${student.fullName} (Código: ${student.studentCode}, Sede: ${student.campusName}, Programa: ${student.programName}, Periodo: ${student.periodCode}).`,
      'Responde siempre en español de forma clara, precisa, amable y concisa utilizando formato Markdown.',
      'Utiliza las herramientas (Function Calling) cuando el usuario consulte notas, cuánto necesita en el Corte 3, horario, matrícula, certificados en PDF o calendario académico.',
    ].join(' ');
  }

  private async callGeminiWithFunctionCalling(
    input: ConversationalEngineInput
  ): Promise<Omit<ChatMessageResponse, 'latencyMs'>> {
    const apiKey = this.getGeminiKey();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${apiKey}`;

    const toolsDeclaration = [
      {
        functionDeclarations: [
          {
            name: 'consultar_notas_y_promedio',
            description:
              'Devuelve las notas reales de cada materia del estudiante, su PGA y cuánto necesita en el Corte 3 (40%) para aprobar en 3.00.',
            parameters: {
              type: 'OBJECT',
              properties: {
                includeProjection: {
                  type: 'BOOLEAN',
                  description: 'Indica si incluye el cálculo de nota necesaria en el Corte 3.',
                },
              },
            },
          },
          {
            name: 'consultar_horario_y_matricula',
            description:
              'Devuelve las asignaturas inscritas, horarios, aula, docente, sede y estado financiero (PAID).',
            parameters: {
              type: 'OBJECT',
              properties: {
                periodCode: {
                  type: 'STRING',
                  description: 'Periodo académico a consultar, ej. 2026-2.',
                },
              },
            },
          },
          {
            name: 'generar_certificado_academico',
            description:
              'Solicita la expedición asíncrona de un certificado (STUDY, GRADES o GOOD_STANDING), encola el trabajo y devuelve el código de verificación USCO-2026-XXXX, jobId y URL del PDF.',
            parameters: {
              type: 'OBJECT',
              properties: {
                certificateType: {
                  type: 'STRING',
                  description: 'Tipo de certificado: STUDY, GRADES o GOOD_STANDING.',
                },
              },
              required: ['certificateType'],
            },
          },
          {
            name: 'consultar_calendario_y_reglamento',
            description:
              'Responde fechas oficiales del periodo 2026-2 (adición/cancelación, cortes 30%/30%/40%, habilitaciones y soporte multi-sede).',
            parameters: {
              type: 'OBJECT',
              properties: {
                topic: {
                  type: 'STRING',
                  description: 'Tema del calendario o reglamento a consultar.',
                },
              },
            },
          },
        ],
      },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: this.buildSystemInstruction(input.studentContext) }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: input.message }],
            },
          ],
          tools: toolsDeclaration,
          generationConfig: {
            temperature: 0.2,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}`);
      }

      const json = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: {
                name: string;
                args?: Record<string, unknown>;
              };
            }>;
          };
        }>;
      };

      const parts = json.candidates?.[0]?.content?.parts || [];
      const fnCallPart = parts.find((p) => p.functionCall);

      if (fnCallPart?.functionCall) {
        const toolExecution = await this.executeAcademicTool(
          fnCallPart.functionCall.name,
          fnCallPart.functionCall.args || {},
          input.studentContext,
          input.message
        );

        // Segunda llamada con el resultado de la función para síntesis conversacional
        const secondResp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: this.buildSystemInstruction(input.studentContext) }],
            },
            contents: [
              { role: 'user', parts: [{ text: input.message }] },
              {
                role: 'model',
                parts: [{ functionCall: fnCallPart.functionCall }],
              },
              {
                role: 'function',
                parts: [
                  {
                    functionResponse: {
                      name: toolExecution.toolName,
                      response: toolExecution.toolResultData,
                    },
                  },
                ],
              },
            ],
          }),
          signal: controller.signal,
        });

        let finalReply = '';
        if (secondResp.ok) {
          const secondJson = (await secondResp.json()) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
            }>;
          };
          finalReply =
            secondJson.candidates?.[0]?.content?.parts
              ?.map((p) => p.text || '')
              .join('\n')
              .trim() || '';
        }

        if (!finalReply) {
          const fallback = await this.deterministicHelper.generateReply(input);
          finalReply = fallback.reply;
        }

        return {
          sessionId: input.sessionId,
          reply: finalReply,
          engineUsed: 'GEMINI_AI' as EngineUsedType,
          intentDetected: toolExecution.intentDetected,
          actionExecuted: toolExecution.toolName,
          toolCalled: toolExecution.toolName,
          suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
          dataAttachment: toolExecution.dataAttachment,
        };
      }

      const directText = parts
        .map((p) => p.text || '')
        .join('\n')
        .trim();

      if (!directText) {
        throw new Error('Respuesta vacía de Gemini API.');
      }

      const classifiedIntent = this.deterministicHelper.classifyIntent(input.message);
      return {
        sessionId: input.sessionId,
        reply: directText,
        engineUsed: 'GEMINI_AI',
        intentDetected: classifiedIntent,
        actionExecuted: null,
        toolCalled: null,
        suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
        dataAttachment: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGroqWithFunctionCalling(
    input: ConversationalEngineInput
  ): Promise<Omit<ChatMessageResponse, 'latencyMs'>> {
    const apiKey = this.getGroqKey();
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const tools = [
      {
        type: 'function',
        function: {
          name: 'consultar_notas_y_promedio',
          description:
            'Devuelve las notas reales de cada materia del estudiante, su PGA y cuánto necesita en el Corte 3 para aprobar en 3.00.',
          parameters: {
            type: 'object',
            properties: {
              includeProjection: { type: 'boolean' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'consultar_horario_y_matricula',
          description:
            'Devuelve las asignaturas inscritas, horarios, aula, docente, sede y estado financiero (PAID).',
          parameters: {
            type: 'object',
            properties: {
              periodCode: { type: 'string' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'generar_certificado_academico',
          description:
            'Solicita la expedición asíncrona de un certificado (STUDY, GRADES o GOOD_STANDING) y devuelve código de verificación, jobId y pdfUrl.',
          parameters: {
            type: 'object',
            properties: {
              certificateType: {
                type: 'string',
                enum: ['STUDY', 'GRADES', 'GOOD_STANDING'],
              },
            },
            required: ['certificateType'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'consultar_calendario_y_reglamento',
          description:
            'Responde fechas oficiales del periodo 2026-2 (adición/cancelación, cortes 30%/30%/40%, habilitaciones y soporte multi-sede).',
          parameters: {
            type: 'object',
            properties: {
              topic: { type: 'string' },
            },
          },
        },
      },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.groqModel,
          messages: [
            {
              role: 'system',
              content: this.buildSystemInstruction(input.studentContext),
            },
            {
              role: 'user',
              content: input.message,
            },
          ],
          tools,
          tool_choice: 'auto',
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Groq API HTTP ${response.status}`);
      }

      const json = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: {
                name: string;
                arguments: string;
              };
            }>;
          };
        }>;
      };

      const msg = json.choices?.[0]?.message;
      const toolCall = msg?.tool_calls?.[0];

      if (toolCall) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          parsedArgs = {};
        }

        const toolExecution = await this.executeAcademicTool(
          toolCall.function.name,
          parsedArgs,
          input.studentContext,
          input.message
        );

        const secondResp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.groqModel,
            messages: [
              {
                role: 'system',
                content: this.buildSystemInstruction(input.studentContext),
              },
              { role: 'user', content: input.message },
              msg,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolExecution.toolResultData),
              },
            ],
            temperature: 0.2,
          }),
          signal: controller.signal,
        });

        let finalReply = '';
        if (secondResp.ok) {
          const secondJson = (await secondResp.json()) as {
            choices?: Array<{ message?: { content?: string | null } }>;
          };
          finalReply = secondJson.choices?.[0]?.message?.content?.trim() || '';
        }

        if (!finalReply) {
          const fallback = await this.deterministicHelper.generateReply(input);
          finalReply = fallback.reply;
        }

        return {
          sessionId: input.sessionId,
          reply: finalReply,
          engineUsed: 'GROQ_AI',
          intentDetected: toolExecution.intentDetected,
          actionExecuted: toolExecution.toolName,
          toolCalled: toolExecution.toolName,
          suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
          dataAttachment: toolExecution.dataAttachment,
        };
      }

      const content = msg?.content?.trim();
      if (!content) {
        throw new Error('Respuesta vacía de Groq API.');
      }

      return {
        sessionId: input.sessionId,
        reply: content,
        engineUsed: 'GROQ_AI',
        intentDetected: this.deterministicHelper.classifyIntent(input.message),
        actionExecuted: null,
        toolCalled: null,
        suggestedQuickReplies: DEFAULT_QUICK_REPLIES,
        dataAttachment: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
