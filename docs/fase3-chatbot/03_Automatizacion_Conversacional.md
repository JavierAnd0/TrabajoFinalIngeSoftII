# 03. Automatización conversacional: asistente académico

**Fase 3 del enunciado:** integrar un asistente virtual en la plataforma, con un motor de reglas deterministas o conectado a una API de IA básica, para resolver consultas frecuentes.
**Entregable:** módulo de chat integrado en la interfaz con su lógica de negocio conectada al backend.
**Estado:** entregado. La auditoría del 13 de noviembre de 2026 corrigió su control de acceso y la visualización de adjuntos.

---

## 1. Qué hace

El estudiante abre el botón **Asistente académico** en su panel y pregunta en lenguaje natural. El asistente responde con datos reales de su expediente en PostgreSQL:

| Intención | Ejemplo de pregunta | Respuesta |
| :--- | :--- | :--- |
| `INTENT_GRADES` | "¿Cuáles son mis notas y mi promedio?" | Resumen + tabla de notas por corte y PGA |
| `INTENT_NEEDED_SCORE` | "¿Cuánto necesito en el corte 3?" | Nota mínima por materia para cerrar en 3.0 |
| `INTENT_GENERATE_CERTIFICATE` | "Genera mi certificado de estudio en PDF" | Encola el certificado y muestra una tarjeta con el enlace |
| `INTENT_SCHEDULE` | "¿Cuál es mi horario?" | Materias, aulas, docentes |
| `INTENT_PAYMENT_STATUS` | "¿Ya pagué la matrícula?" | Referencias de pago y estado |
| `INTENT_FAQ_CALENDAR` | "¿Cuándo se cancelan materias?" | Calendario 2026-2 y reglamento |
| `INTENT_HELP` | "¿Qué puedes hacer?" | Menú de opciones |

Además ofrece **respuestas rápidas** (botones) y un árbol de preguntas frecuentes en `GET /api/v1/chat/faq-tree`.

## 2. Arquitectura del servicio (`apps/chatbot-ai-service`, puerto 4003)

```
ChatbotWidget (React) ──JWT──▶ POST /api/v1/chat/message
                                   │  chatJwtAuthMiddleware: estudiante = claim userId del token
                                   ▼
                       ProcessAcademicChatUseCase
                    ┌──────────────┴──────────────┐
         Strategy: motor LLM              Motor de reglas deterministas
   (Gemini 2.5 Flash / Groq Llama 3.3,     (árbol de decisión por palabras clave,
    function calling con 4 herramientas)    < 5 ms, siempre disponible)
                    └──────────────┬──────────────┘
                        CoreAcademicContextAdapter
              (Prisma → PostgreSQL · certificados vía Core con token interno)
```

- **Strategy.** El usuario puede elegir `auto`, `gemini`, `groq` o `deterministic`.
- **Circuit breaker.** Tras **2 fallos** del proveedor de IA el circuito se abre durante **45 s** y todas las consultas van al motor de reglas; luego se prueba de nuevo.
- **Function calling.** El LLM no inventa notas: llama a `consultar_notas_y_promedio`, `consultar_horario_y_matricula`, `generar_certificado_academico` o `consultar_calendario_y_reglamento`, que leen la base de datos.
- **Trazabilidad.** Cada interacción se guarda en `ChatInteractionLog` (motor usado, intención, herramienta, latencia).

## 3. Seguridad

| Control | Detalle |
| :--- | :--- |
| Autenticación | `Authorization: Bearer <JWT>` obligatorio en `/message` y `/history`. Sin token: 401. |
| Anti-IDOR | Para un estudiante, el expediente consultado es **siempre** el del token; un `studentId` enviado en el cuerpo se ignora. |
| Historial | `GET /history/:sessionId` solo devuelve interacciones del propio estudiante. |
| Entradas | Zod + expresión regular contra XSS/SQLi; mensajes de hasta 1 500 caracteres. |
| Certificados | El chatbot llama al Core con `x-internal-service-token`; nunca expone ese secreto al navegador. |
| Visibilidad | El widget solo se muestra a estudiantes autenticados (antes aparecía en el login y a docentes). |

## 4. Integración con la interfaz

- `apps/web-astro/src/components/react/ChatbotWidget.tsx`: ventana flotante persistente entre navegaciones (`transition:persist`), selector de motor, respuestas rápidas, adjuntos (tabla de notas, tarjeta de certificado) y mensajes de error comprensibles.
- `apps/web-astro/src/services/apiClient.ts → sendChatbotMessage`: envía el JWT y normaliza el adjunto `{ type, title, payload }` que devuelve el servicio.
- Al generar un certificado desde el chat, el panel de certificados se refresca (`triggerAcademicSync`).

## 5. Verificación

| Prueba | Resultado |
| :--- | :--- |
| E2E-04 (Playwright): notas con tabla adjunta, nota requerida en corte 3 y certificado desde el chat | ✅ |
| OWASP: chat sin sesión → 401; `studentId` ajeno ignorado; `<script>` → 400 | ✅ |
| Carga: `POST /chat/message` (reglas) con 50 usuarios concurrentes | 703 req/s · p95 88 ms · 0 % errores |

## 6. Configuración

```bash
AI_PROVIDER="gemini"          # gemini | groq | deterministic
GEMINI_API_KEY=""             # opcional; sin clave el motor de reglas responde todo
GROQ_API_KEY=""
```

Sin claves de IA el asistente funciona completo con el motor de reglas, que es el que se usa en la CI y en las pruebas de carga.
