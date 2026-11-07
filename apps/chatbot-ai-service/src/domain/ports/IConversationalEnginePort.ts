import {
  ChatMessageResponse,
  PreferredEngineMode,
  StudentAcademicContext,
} from '../entities/AcademicChatEntities';

export interface ConversationalEngineInput {
  sessionId: string;
  message: string;
  studentContext: StudentAcademicContext;
  preferredMode?: PreferredEngineMode;
}

export interface IConversationalEnginePort {
  /**
   * Nombre identificador del adaptador conversacional.
   */
  getEngineName(): string;

  /**
   * Indica si el adaptador se encuentra operativo y con credenciales/configuración válidas.
   */
  isAvailable(preferredMode?: PreferredEngineMode): boolean;

  /**
   * Procesa el mensaje del estudiante con su contexto académico en vivo y retorna la respuesta estructurada.
   */
  generateReply(input: ConversationalEngineInput): Promise<Omit<ChatMessageResponse, 'latencyMs'>>;
}
