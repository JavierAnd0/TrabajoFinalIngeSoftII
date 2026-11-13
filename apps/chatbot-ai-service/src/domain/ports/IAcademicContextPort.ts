import {
  EngineUsedType,
  FaqTreeNode,
  StudentAcademicContext,
  StudentCertificateSummary,
} from '../entities/AcademicChatEntities';

export interface LogInteractionParams {
  studentId: string | null;
  sessionId: string;
  userPrompt: string;
  botResponse: string;
  engineUsed: EngineUsedType;
  intentDetected: string;
  toolCalled: string | null;
  latencyMs: number;
}

export interface ChatHistoryEntry {
  id: string;
  studentId: string | null;
  sessionId: string;
  userPrompt: string;
  botResponse: string;
  engineUsed: EngineUsedType;
  intentDetected: string;
  toolCalled: string | null;
  latencyMs: number;
  createdAt: string;
}

export interface IAcademicContextPort {
  /**
   * Obtiene el contexto académico real y en vivo de un estudiante por su UUID, código estudiantil o correo.
   * Si no se proporciona identificador o no existe coincidencia exacta, carga el estudiante principal de demostración (Álvaro Javier Andrade - 20221203806).
   */
  getStudentAcademicContext(studentIdentifier?: string): Promise<StudentAcademicContext>;

  /**
   * Solicita y encola la expedición de un certificado académico oficial (STUDY, GRADES o GOOD_STANDING),
   * invocando el servicio Core/Worker con fallback directo en PostgreSQL para disponibilidad del 100%.
   */
  requestCertificateGeneration(
    studentContext: StudentAcademicContext,
    certificateType: 'STUDY' | 'GRADES' | 'GOOD_STANDING'
  ): Promise<StudentCertificateSummary>;

  /**
   * Registra la auditoría de cada interacción conversacional en la tabla ChatInteractionLog.
   */
  logInteraction(params: LogInteractionParams): Promise<void>;

  /**
   * Obtiene el historial de mensajes de una sesión conversacional desde PostgreSQL.
   */
  getSessionHistory(sessionId: string, studentId?: string): Promise<ChatHistoryEntry[]>;

  /**
   * Devuelve el árbol interactivo de preguntas frecuentes (FAQ Tree) multi-sede USCO.
   */
  getFaqTree(): FaqTreeNode[];
}
