"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openApiSpec = void 0;
exports.openApiSpec = {
    openapi: '3.0.3',
    info: {
        title: 'EduDistribuida (USCO-Net) — Chatbot AI & Conversational Service API',
        version: '1.0.0',
        description: 'Microservicio Híbrido de Asistencia Académica Conversacional (Google Gemini 2.5 Flash + Groq Llama 3.3 70B + Motor Determinista de Reglas con Circuit Breaker) bajo Arquitectura Hexagonal.',
        contact: {
            name: 'Ingeniería de Software II - Universidad Surcolombiana',
            email: 'alvaro.andrade@usco.edu.co',
        },
    },
    servers: [
        {
            url: 'http://localhost:4003',
            description: 'Servidor Local Chatbot AI Service (Puerto 4003)',
        },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['Health & Resilience'],
                summary: 'Estado de salud del microservicio y estado del Circuit Breaker',
                responses: {
                    '200': {
                        description: 'Servicio saludable',
                    },
                },
            },
        },
        '/api/v1/health': {
            get: {
                tags: ['Health & Resilience'],
                summary: 'Estado de salud API v1 del microservicio conversacional',
                responses: {
                    '200': {
                        description: 'Servicio saludable',
                    },
                },
            },
        },
        '/api/v1/chat/message': {
            post: {
                tags: ['Conversational Engine'],
                summary: 'Procesa un mensaje del estudiante utilizando Function Calling o Fallback Determinista (< 5 ms)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['message'],
                                properties: {
                                    studentId: {
                                        type: 'string',
                                        example: '20221203806',
                                        description: 'UUID, código estudiantil o correo institucional (por defecto Álvaro Javier Andrade 20221203806).',
                                    },
                                    sessionId: {
                                        type: 'string',
                                        example: 'sess-alvaro-demo-01',
                                    },
                                    message: {
                                        type: 'string',
                                        example: '¿Cuánto necesito en el Corte 3 para pasar mis materias?',
                                    },
                                    preferredMode: {
                                        type: 'string',
                                        enum: ['auto', 'gemini', 'groq', 'deterministic'],
                                        default: 'auto',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Respuesta conversacional generada y registrada en PostgreSQL',
                    },
                    '400': {
                        description: 'Payload inválido o bloqueado por validación de seguridad OWASP A03',
                    },
                },
            },
        },
        '/api/v1/chat/history/{sessionId}': {
            get: {
                tags: ['Conversational Engine'],
                summary: 'Obtiene el historial auditado de una sesión conversacional desde PostgreSQL',
                parameters: [
                    {
                        name: 'sessionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Historial de interacciones de la sesión',
                    },
                },
            },
        },
        '/api/v1/chat/faq-tree': {
            get: {
                tags: ['Conversational Engine'],
                summary: 'Devuelve el árbol de preguntas frecuentes y flujos guiados multi-sede USCO',
                responses: {
                    '200': {
                        description: 'Árbol interactivo de preguntas frecuentes',
                    },
                },
            },
        },
    },
};
//# sourceMappingURL=swagger.js.map