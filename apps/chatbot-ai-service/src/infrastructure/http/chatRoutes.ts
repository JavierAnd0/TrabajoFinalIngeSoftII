import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { ProcessAcademicChatUseCase } from '../../application/use-cases/ProcessAcademicChatUseCase';

const MALICIOUS_INJECTION_REGEX =
  /(<\s*\/?\s*script\b|javascript\s*:|onerror\s*=|onload\s*=|onloadstart\s*=|<\s*iframe\b|<\s*img[^>]+onerror|\bUNION\s+SELECT\b|\bDROP\s+TABLE\b|--\s*$|;\s*DROP\s+)/i;

const chatMessageSchema = z.object({
  studentId: z.string().trim().max(120).optional(),
  sessionId: z.string().trim().max(120).optional(),
  message: z
    .string({
      required_error: 'El campo message es obligatorio.',
      invalid_type_error: 'El campo message debe ser una cadena de texto.',
    })
    .trim()
    .min(1, 'El mensaje no puede estar vacío.')
    .max(1500, 'El mensaje excede el límite máximo de 1500 caracteres.')
    .refine((val: string) => !MALICIOUS_INJECTION_REGEX.test(val), {
      message:
        'Seguridad OWASP A03: Se detectaron patrones potencialmente maliciosos (XSS / SQLi) en el mensaje.',
    }),
  preferredMode: z
    .enum(['gemini', 'groq', 'deterministic', 'auto'])
    .optional()
    .default('auto'),
});

export function createChatRouter(
  processAcademicChatUseCase: ProcessAcademicChatUseCase
): Router {
  const router = Router();

  /**
   * POST /api/v1/chat/message
   */
  router.post('/message', async (req: Request, res: Response) => {
    const parsed = chatMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR_OWASP_A03',
        message:
          parsed.error.issues[0]?.message ||
          'El payload enviado no cumple las reglas de validación.',
        details: parsed.error.issues,
      });
      return;
    }

    const { studentId, sessionId, message, preferredMode } = parsed.data;

    if (
      (studentId && MALICIOUS_INJECTION_REGEX.test(studentId)) ||
      (sessionId && MALICIOUS_INJECTION_REGEX.test(sessionId))
    ) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR_OWASP_A03',
        message:
          'Seguridad OWASP A03: Identificador de sesión o estudiante con caracteres no permitidos.',
      });
      return;
    }

    try {
      const responseData = await processAcademicChatUseCase.execute({
        studentId,
        sessionId,
        message,
        preferredMode,
      });

      res.status(200).json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error('[ChatbotAIService] Error procesando mensaje:', error);
      res.status(500).json({
        success: false,
        error: 'CHATBOT_INTERNAL_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Error interno al procesar la consulta académica.',
      });
    }
  });

  /**
   * GET /api/v1/chat/history/:sessionId
   */
  router.get('/history/:sessionId', async (req: Request, res: Response) => {
    const sessionId = (req.params.sessionId || '').trim();
    if (!sessionId || MALICIOUS_INJECTION_REGEX.test(sessionId)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_SESSION_ID',
        message: 'El identificador de sesión proporcionado no es válido.',
      });
      return;
    }

    try {
      const history = await processAcademicChatUseCase.getHistory(sessionId);
      res.status(200).json({
        success: true,
        data: {
          sessionId,
          totalInteractions: history.length,
          interactions: history,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'HISTORY_FETCH_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible consultar el historial de la sesión.',
      });
    }
  });

  /**
   * GET /api/v1/chat/faq-tree
   */
  router.get('/faq-tree', (_req: Request, res: Response) => {
    const faqTree = processAcademicChatUseCase.getFaqTree();
    res.status(200).json({
      success: true,
      data: {
        institution: 'Universidad Surcolombiana (USCO-Net)',
        activePeriod: '2026-2',
        campuses: ['NEI - Neiva', 'PIT - Pitalito', 'GAR - Garzón', 'LPL - La Plata'],
        nodes: faqTree,
      },
    });
  });

  return router;
}
