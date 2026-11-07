"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessAcademicChatUseCase = void 0;
class ProcessAcademicChatUseCase {
    academicContextPort;
    llmEngineAdapter;
    deterministicEngineAdapter;
    circuitBreaker = {
        failures: 0,
        lastFailureTimestamp: 0,
        state: 'CLOSED',
    };
    failureThreshold = 2;
    recoveryTimeoutMs = 45_000;
    constructor(academicContextPort, llmEngineAdapter, deterministicEngineAdapter) {
        this.academicContextPort = academicContextPort;
        this.llmEngineAdapter = llmEngineAdapter;
        this.deterministicEngineAdapter = deterministicEngineAdapter;
    }
    async execute(request) {
        const startHrTime = process.hrtime.bigint();
        const sessionId = request.sessionId && request.sessionId.trim().length > 0
            ? request.sessionId.trim()
            : `sess-usco-${Date.now()}`;
        const preferredMode = request.preferredMode ?? 'auto';
        const studentIdentifier = request.studentId && request.studentId.trim().length > 0
            ? request.studentId.trim()
            : '20221203806';
        // 1. Cargar contexto académico real y en vivo desde PostgreSQL / Core Service
        const studentContext = await this.academicContextPort.getStudentAcademicContext(studentIdentifier);
        const engineStartHrTime = process.hrtime.bigint();
        let resultWithoutLatency;
        // 2. Patrón Strategy + Circuit Breaker
        const shouldAttemptLlm = preferredMode !== 'deterministic' &&
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
            }
            catch (error) {
                this.recordCircuitFailure();
                console.warn(`[CircuitBreaker] Fallo o timeout en proveedor LLM (${error instanceof Error ? error.message : 'Error desconocido'}). Conmutando instantáneamente a DeterministicRuleEngineAdapter.`);
                resultWithoutLatency = await this.deterministicEngineAdapter.generateReply({
                    sessionId,
                    message: request.message,
                    studentContext,
                    preferredMode: 'deterministic',
                });
            }
        }
        else {
            resultWithoutLatency = await this.deterministicEngineAdapter.generateReply({
                sessionId,
                message: request.message,
                studentContext,
                preferredMode: 'deterministic',
            });
        }
        const engineEndHrTime = process.hrtime.bigint();
        const engineLatencyMs = Math.max(1, Number((engineEndHrTime - engineStartHrTime) / BigInt(1_000_000)));
        const totalLatencyMs = Math.max(1, Number((engineEndHrTime - startHrTime) / BigInt(1_000_000)));
        const finalLatencyMs = resultWithoutLatency.engineUsed === 'DETERMINISTIC_RULES'
            ? engineLatencyMs
            : totalLatencyMs;
        const fullResponse = {
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
    async getHistory(sessionId) {
        return this.academicContextPort.getSessionHistory(sessionId);
    }
    getFaqTree() {
        return this.academicContextPort.getFaqTree();
    }
    getCircuitBreakerStatus() {
        return {
            state: this.circuitBreaker.state,
            failures: this.circuitBreaker.failures,
            llmAvailable: this.llmEngineAdapter.isAvailable('auto'),
        };
    }
    canAttemptLlmCall() {
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
    recordCircuitSuccess() {
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.state = 'CLOSED';
    }
    recordCircuitFailure() {
        this.circuitBreaker.failures += 1;
        this.circuitBreaker.lastFailureTimestamp = Date.now();
        if (this.circuitBreaker.failures >= this.failureThreshold) {
            this.circuitBreaker.state = 'OPEN';
        }
    }
}
exports.ProcessAcademicChatUseCase = ProcessAcademicChatUseCase;
//# sourceMappingURL=ProcessAcademicChatUseCase.js.map