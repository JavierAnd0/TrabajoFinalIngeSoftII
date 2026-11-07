"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAcademicChatUseCase = exports.app = void 0;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
dotenv_1.default.config();
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const ProcessAcademicChatUseCase_1 = require("./application/use-cases/ProcessAcademicChatUseCase");
const swagger_1 = require("./infrastructure/config/swagger");
const chatRoutes_1 = require("./infrastructure/http/chatRoutes");
const CoreAcademicContextAdapter_1 = require("./infrastructure/httpClient/CoreAcademicContextAdapter");
const GeminiAndGroqFreeAIAdapter_1 = require("./infrastructure/llm/GeminiAndGroqFreeAIAdapter");
const DeterministicRuleEngineAdapter_1 = require("./infrastructure/rules-engine/DeterministicRuleEngineAdapter");
const app = (0, express_1.default)();
exports.app = app;
const PORT = Number(process.env.CHATBOT_SERVICE_PORT || process.env.PORT || 4003);
// 1. Seguridad perimetral HTTP (Helmet + CORS)
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express_1.default.json({ limit: '64kb' }));
// 2. Inyección de Dependencias (Arquitectura Hexagonal)
const academicContextAdapter = new CoreAcademicContextAdapter_1.CoreAcademicContextAdapter();
const deterministicRuleEngineAdapter = new DeterministicRuleEngineAdapter_1.DeterministicRuleEngineAdapter(academicContextAdapter);
const geminiAndGroqAdapter = new GeminiAndGroqFreeAIAdapter_1.GeminiAndGroqFreeAIAdapter(academicContextAdapter, deterministicRuleEngineAdapter);
const processAcademicChatUseCase = new ProcessAcademicChatUseCase_1.ProcessAcademicChatUseCase(academicContextAdapter, geminiAndGroqAdapter, deterministicRuleEngineAdapter);
exports.processAcademicChatUseCase = processAcademicChatUseCase;
// 3. Endpoints de Salud y Observabilidad
const healthHandler = (_req, res) => {
    const cbStatus = processAcademicChatUseCase.getCircuitBreakerStatus();
    res.status(200).json({
        success: true,
        service: '@edudistribuida/chatbot-ai-service',
        status: 'UP',
        port: PORT,
        architecture: 'Hexagonal (Ports & Adapters) + Strategy & Circuit Breaker',
        engines: {
            geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10),
            groqConfigured: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 10),
            deterministicFallbackReady: true,
            circuitBreaker: cbStatus,
        },
        timestamp: new Date().toISOString(),
    });
};
app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);
// 4. Documentación OpenAPI 3.0
app.get('/api/docs.json', (_req, res) => {
    res.status(200).json(swagger_1.openApiSpec);
});
app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.openApiSpec));
// 5. Rutas Conversacionales API v1
app.use('/api/v1/chat', (0, chatRoutes_1.createChatRouter)(processAcademicChatUseCase));
// 6. Manejador de errores de JSON malformado y rutas no encontradas
app.use((err, _req, res, _next) => {
    res.status(400).json({
        success: false,
        error: 'BAD_REQUEST_PAYLOAD',
        message: err.message || 'El cuerpo de la petición no es un JSON válido.',
    });
});
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Ruta no encontrada en chatbot-ai-service (Puerto 4003).',
    });
});
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('================================================================================');
        console.log(`🤖 CHATBOT AI SERVICE (HEXAGONAL + CIRCUIT BREAKER) ACTIVO EN PUERTO ${PORT}`);
        console.log(`📚 OpenAPI Docs: http://localhost:${PORT}/api/docs`);
        console.log(`🩺 Healthcheck:  http://localhost:${PORT}/api/v1/health`);
        console.log('================================================================================');
    });
}
//# sourceMappingURL=index.js.map