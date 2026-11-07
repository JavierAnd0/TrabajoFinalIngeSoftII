import {
  ChatMessageRequest,
  ChatMessageResponse,
  FaqTreeNode,
  PreferredEngineMode,
} from '../../domain/entities/AcademicChatEntities';
import {
  ChatHistoryEntry,
  IAcademicContextPort,
} from '../../domain/ports/IAcademicContextPort';
import { IConversationalEnginePort } from '../../domain/ports/IConversationalEnginePort';

interface CircuitBreakerState {
  failures: number;
  lastFailureTimestamp: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class ProcessAcademicChatUseCase {
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTimestamp: 0,
    state: 'CLOSED',
  };

  private readonly failureThreshold = 2;
  private readonly recoveryTimeoutMs = 45_000;

  constructor(
    private readonly academicContextPort: IAcademicContextPort,
    private readonly llmEngineAdapter: IConversationalEnginePort,
    private readonly deterministicEngineAdapter: IConversationalEnginePort
  ) {}

  public async execute(request: ChatMessageRequest): Promise<ChatMessageResponse> {
    const startHrTime = process.hrtime.bigint();
    const sessionId =
      request.sessionId && request.sessionId.trim().length > 0
        ? request.sessionId.trim()
        : `sess-usco-${Date.now()}`;
    const preferredMode: PreferredEngineMode = request.preferredMode ?? 'auto';
    const studentIdentifier =
      request.studentId && request.studentId.trim().length > 0
        ? request.studentId.trim()
        : '20221203806';

    // 1. Cargar contexto académico real y en vivo desde PostgreSQL / Core Service
    const studentContext =
      await this.academicContextPort.getStudentAcademicContext(studentIdentifier);

    const engineStartHrTime = process.hrtime.bigint();
    let resultWithoutLatency: Omit<ChatMessageResponse, 'latencyMs'>;

    // 2. Patrón Strategy + Circuit Breaker
    const shouldAttemptLlm =
      preferredMode !== 'deterministic' &&
      this.llmEngineAdapter.isAvailable(preferredMode) &&
      this.canAttemptLlmCall();

    if (shouldAttemptLlm) {
      try {
        resultWithoutLatency = await this.llmEngineAdapter.generateReply({
          sessionId,
          message: request.message,
          studentContext,
          preferredMode,
        });
        this.recordCircuitSuccess();
      } catch (error) {
        this.recordCircuitFailure();
        console.warn(
          `[CircuitBreaker] Fallo o timeout en proveedor LLM (${
            error instanceof Error ? error.message : 'Error desconocido'
          }). Conmutando instantáneamente a DeterministicRuleEngineAdapter.`
        );
        resultWithoutLatency = await this.deterministicEngineAdapter.generateReply({
          sessionId,
          message: request.message,
          studentContext,
          preferredMode: 'deterministic',
        });
      }
    } else {
      resultWithoutLatency = await this.deterministicEngineAdapter.generateReply({
        sessionId,
        message: request.message,
        studentContext,
        preferredMode: 'deterministic',
      });
    }

    const engineEndHrTime = process.hrtime.bigint();
    const engineLatencyMs = Math.max(
      1,
      Number((engineEndHrTime - engineStartHrTime) / BigInt(1_000_000))
    );
    const totalLatencyMs = Math.max(
      1,
      Number((engineEndHrTime - startHrTime) / BigInt(1_000_000))
    );

    const finalLatencyMs =
      resultWithoutLatency.engineUsed === 'DETERMINISTIC_RULES'
        ? engineLatencyMs
        : totalLatencyMs;

    const fullResponse: ChatMessageResponse = {
      ...resultWithoutLatency,
      sessionId,
      latencyMs: finalLatencyMs,
    };

    // 3. Persistir trazabilidad y auditoría en ChatInteractionLog
    await this.academicContextPort.logInteraction({
      studentId: studentContext.userId,
      sessionId,
      userPrompt: request.message,
      botResponse: fullResponse.reply,
      engineUsed: fullResponse.engineUsed,
      intentDetected: fullResponse.intentDetected,
      toolCalled: fullResponse.toolCalled,
      latencyMs: fullResponse.latencyMs,
    });

    return fullResponse;
  }

  public async getHistory(sessionId: string): Promise<ChatHistoryEntry[]> {
    return this.academicContextPort.getSessionHistory(sessionId);
  }

  public getFaqTree(): FaqTreeNode[] {
    return this.academicContextPort.getFaqTree();
  }

  public getCircuitBreakerStatus(): {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    llmAvailable: boolean;
  } {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      llmAvailable: this.llmEngineAdapter.isAvailable('auto'),
    };
  }

  private canAttemptLlmCall(): boolean {
    if (this.circuitBreaker.state === 'CLOSED') {
      return true;
    }

    const elapsed = Date.now() - this.circuitBreaker.lastFailureTimestamp;
    if (elapsed >= this.recoveryTimeoutMs) {
      this.circuitBreaker.state = 'HALF_OPEN';
      return true;
    }

    return false;
  }

  private recordCircuitSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.state = 'CLOSED';
  }

  private recordCircuitFailure(): void {
    this.circuitBreaker.failures += 1;
    this.circuitBreaker.lastFailureTimestamp = Date.now();
    if (this.circuitBreaker.failures >= this.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
    }
  }
}
