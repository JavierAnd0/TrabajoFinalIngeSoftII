# 00. Auditoría integral del proyecto frente al enunciado del Trabajo Final

**Proyecto:** EduDistribuida / USCO-Net — Plataforma distribuida de gestión académica multi-sede
**Asignatura:** Ingeniería de Software II — Universidad Surcolombiana
**Fecha de la auditoría:** 13 de noviembre de 2026
**Línea base auditada:** commit `909ddaf` · **Versión corregida:** rama `claude/compassionate-tesla-aumwxr`

---

## 1. Alcance y método

La auditoría respondió cuatro preguntas:

1. ¿El repositorio cumple cada entregable que pide el enunciado (`TRABAJO FINAL INGENIERÍA DE SOFTWARE II.pdf`)?
2. ¿Ocurren en el sistema cosas que no deberían ocurrir (seguridad, integridad de datos, comportamiento engañoso)?
3. ¿El sistema es intuitivo para cada rol?
4. ¿Las métricas y conclusiones de los informes de fase se pueden reproducir?

**Método.** Se levantó el sistema completo en local (PostgreSQL 16, Redis 7 y los 4 servicios), se ejecutaron peticiones HTTP reales contra cada endpoint con y sin credenciales, se navegó el portal con Playwright con los cuatro usuarios del seed y se revisó el código fuente de los cinco paquetes. Todas las cifras de este documento salen de esas ejecuciones; los informes JSON están versionados en `qa-audits/`.

---

## 2. Cumplimiento del enunciado, fase por fase

| Fase | Lo que pide el enunciado | Evidencia en el repositorio | Estado tras la auditoría |
| :--- | :--- | :--- | :--- |
| **1. Análisis y diseño** | Escenario real, modelo C4, servicios, comunicación síncrona/asíncrona, persistencia | `docs/fase1-arquitectura/` con C4 niveles 1-3, secuencias y 5 ADR | ✅ Cumple. Se añadió la sección de seguridad entre servicios y la corrección de la cola. |
| **2. Construcción del núcleo** | Patrones limpios, ORM, sesiones JWT, integración de pagos/notificaciones, Swagger, scripts de BD | Hexagonal en 3 servicios, Prisma, JWT, BullMQ, Swagger en `/api/docs`, `schema.prisma`, seed y SQL RLS | ⚠️→✅ El código existía, pero el **control de acceso estaba roto** (ver §3) y no había documento de fase. Corregido y documentado en `docs/fase2-plataforma-integrada/`. |
| **3. Automatización conversacional** | Chatbot integrado en la UI con lógica conectada al backend | `chatbot-ai-service` (reglas + Gemini/Groq con circuit breaker) y `ChatbotWidget.tsx` | ⚠️→✅ Funcionaba sin sesión y respondía con datos de cualquier estudiante; la tarjeta de notas no se mostraba con el backend real. Corregido y documentado en `docs/fase3-chatbot/`. |
| **4. Calidad no funcional** | Carga/estrés (k6/JMeter), OWASP Top 10, usabilidad heurística; informe con métricas, gráficos y plan de mitigación | `qa-audits/` + `docs/fase4-informe-calidad/` | ❌→✅ Las tres auditorías originales **no medían el sistema real** (ver §4). Se reemplazaron por pruebas reproducibles contra los servicios y se reescribió el informe. |
| **5. Despliegue y validación** | Docker Compose, despliegue, suite E2E, manual técnico, manual de usuario, defensa | `docker-compose.yml`, Playwright, manuales y guion | ⚠️→✅ En Docker el portal mostraba datos falsos (URL interna errónea); la suite E2E estaba desactualizada. Corregido: 5/5 E2E contra el sistema real y CI que levanta la infraestructura. |

---

## 3. Hallazgos: cosas que no deberían pasar

Severidad según impacto real comprobado. Todos los hallazgos marcados como corregidos tienen una prueba automática que hoy los vigila.

### 3.1. Seguridad (comprobado con peticiones reales)

| # | Severidad | Hallazgo en la línea base | Corrección |
| :-: | :-: | :--- | :--- |
| S1 | Crítica | `GET /api/v1/admin/enrollments` respondía **sin token**: nombres, correos, códigos y notas de todos los estudiantes de las 4 sedes. | Requiere JWT y rol `TEACHER`/`ADMIN`; el docente solo recibe sus grupos. |
| S2 | Crítica | `GET /students/:id/summary` y `/certificates/student/:id` respondían sin token: el guard anti-IDOR solo actuaba **si** venía un token. | El guard exige siempre autenticación. |
| S3 | Crítica | Enviar el header `x-internal-service: chatbot-ai-service` saltaba toda verificación (cualquiera puede enviarlo). | Token secreto `INTERNAL_SERVICE_TOKEN` comparado en tiempo constante. |
| S4 | Crítica | El chatbot respondía **sin sesión** y aceptaba cualquier `studentId` en el cuerpo; si no lo encontraba, respondía con el expediente del estudiante demo. | JWT obligatorio; el estudiante sale del token; sin respaldo a otro usuario. |
| S5 | Alta | `POST /certificates/request` sin autenticación: cualquiera emitía certificados a nombre de cualquiera. | JWT o token interno; un estudiante solo pide los suyos. |
| S6 | Alta | `POST /payments/webhook` sin firma: cualquiera marcaba matrículas como pagadas. | Firma HMAC-SHA256 (`x-webhook-signature`). |
| S7 | Alta | Un docente podía calificar matrículas de grupos que no dicta. | El caso de uso verifica el docente titular de la sección. |
| S8 | Alta | El portal confiaba en la cookie `edudistribuida_user` (JSON editable) y nunca verificaba la firma del JWT: bastaba escribir `role: "ADMIN"` en la cookie. | El middleware de Astro verifica firma HS256, `iss`, `aud` y `exp`; la identidad sale solo del token. |
| S9 | Alta | La ruta `/api/certificates/[id]` devolvía **el certificado de otra persona** (uno fijo) cuando el pedido no existía. | Valida el identificador y responde 404. |
| S10 | Media | Endpoints internos del worker (`/api/v1/worker/*`) abiertos; lectura de PDF sin validar el nombre de archivo. | Token interno y lista blanca UUID/`USCO-AAAA-XXXX`. |
| S11 | Media | CORS `*` en el core; secreto JWT de ejemplo aceptado en producción; JWT verificado sin fijar algoritmo/emisor/audiencia. | Lista de orígenes, arranque bloqueado con secretos de ejemplo en producción, `HS256` + `iss` + `aud`. |

**Resultado medido** con la nueva auditoría de caja negra (`npm run test:security`, 29 controles):

| | Línea base `909ddaf` | Versión corregida |
| :-- | :-: | :-: |
| Controles superados | **11 / 29** | **29 / 29** |

Informes: `qa-audits/security-owasp/owasp-blackbox-report-before.json` y `owasp-blackbox-report.json`.

### 3.2. Integridad: la interfaz mostraba datos inventados

`apps/web-astro/src/services/apiClient.ts` envolvía cada llamada en `try/catch` y, ante **cualquier** error (incluidos 403, cupo agotado o credenciales inválidas), devolvía datos de demostración fijos o simulaba éxito:

- Guardar notas, inscribir materias o pedir certificados parecía funcionar aunque el backend lo rechazara.
- Sin backend, el login fabricaba un JWT falso con rol de administrador para correos que contuvieran "admin".
- El panel de colas reportaba "healthy" con contadores inventados cuando el worker estaba caído.
- La tarjeta financiera decía siempre "PAZ Y SALVO" y los KPI mostraban "4.52" o "13 créditos" si el resumen fallaba.

**Corrección.** Se eliminaron ~300 líneas de datos ficticios. Los errores de negocio del backend llegan al usuario con su mensaje; los fallos de red muestran un aviso con opción de reintentar; las métricas no disponibles se muestran como "—".

### 3.3. Defectos funcionales y de arquitectura

| # | Hallazgo | Corrección |
| :-: | :--- | :--- |
| F1 | Cada certificado se generaba **dos veces**: el core lo encolaba en BullMQ y además lo enviaba por HTTP al worker (200 solicitudes → ~340 procesamientos). | El respaldo HTTP solo se usa si Redis no aceptó el trabajo (200 → 197 procesados en la medición, el resto aún en cola). |
| F2 | El PGA del panel (4.04) y el del chatbot (4.46) diferían: el core promediaba el acumulado parcial de materias en curso. | Ambos promedian solo materias con nota definitiva. |
| F3 | El tope de 21 créditos se mostraba en la UI pero el backend no lo validaba. | Regla en `EnrollmentDomainService`. |
| F4 | En Docker, el SSR del portal llamaba a `localhost:4001` dentro de su propio contenedor, fallaba y mostraba datos falsos. | En servidor se usan `CORE_SERVICE_URL`, `WORKER_SERVICE_URL` y `CHATBOT_SERVICE_URL`. |
| F5 | El chatbot envía el adjunto como `{type, title, payload}` y el widget lo leía en el nivel superior: la tabla de notas y la tarjeta de certificado nunca aparecían con el backend real. | El cliente aplana `payload`. |
| F6 | `npm run db:push` fallaba con "DIRECT_URL not found" siguiendo el README. | `scripts/with-root-env.mjs` carga el `.env` raíz. |
| F7 | Un certificado de alguien sin código estudiantil salía con el código del estudiante demo. | Se imprime "N/A". |
| F8 | El seed tenía un único docente para las 4 sedes, lo que impedía demostrar el aislamiento entre docentes. | Se añadió `docente.regional@usco.edu.co` (Pitalito, Garzón, La Plata). |

### 3.4. Higiene del repositorio

- El historial contiene un `.env` subido en el commit `f3afdc0`. Se verificó que solo tenía valores de ejemplo y `localhost`: **no hay claves reales expuestas**. Hoy `.env` está en `.gitignore` y la CI lo vigila.
- `pnpm-lock.yaml` estaba obsoleto (solo 2 paquetes) junto a `package-lock.json`: eliminado.
- La barra de desarrollo de Astro se superponía al contenido en demos y capturas: desactivada.

---

## 4. Las auditorías originales no medían el sistema real

| Script original | Qué hacía en realidad | Consecuencia |
| :--- | :--- | :--- |
| `security-owasp/run-owasp-audit.mjs` | Montaba servidores Express en memoria con rutas **reescritas** y un usuario fijo. | Reportó "22/22 · 100 %" mientras el core real exponía todos los expedientes sin token. |
| `performance-k6/run-benchmark-and-charts.mjs` | Medía servidores simulados sin PostgreSQL ni Redis; la curva del "monolito síncrono" (3 420 ms) es un valor modelado. | Las cifras de RPS y el "speedup 211.9x" no describen el sistema. |
| `usability-heuristics/run-usability-audit.mjs` | Las puntuaciones de Nielsen (5.0, 4.9…) están escritas en el código. | El "4.98 / 5.00" no es una medición. |
| `e2e-playwright/verify-e2e-flows.mjs` (usado en CI) | Verificaba artefactos compilados, no navegaba el portal. | La suite Playwright real estaba desactualizada y dependía de textos que solo existían en los datos falsos. |

Los scripts se conservan con un aviso en su cabecera. Las mediciones oficiales ahora son:

| Dimensión | Script nuevo | Resultado |
| :--- | :--- | :--- |
| Seguridad OWASP (caja negra) | `npm run test:security` | 29/29 (línea base 11/29) |
| Carga y estrés | `npm run test:load` | p95 de 15 a 177 ms entre 10 y 100 usuarios, 0 % de errores; saturación a partir de ~50 usuarios |
| Accesibilidad WCAG 2.1 A/AA | `npm run test:a11y` | 42 → 0 nodos con violaciones |
| Aceptación E2E | `npm run test:e2e` | 5/5 contra el sistema real |

La CI (`.github/workflows/ci-quality-gate.yml`) ahora levanta PostgreSQL y Redis como servicios, siembra la base, arranca los 4 servicios y ejecuta E2E y OWASP; un control fallido rompe el build.

---

## 5. Intuitividad: evaluación heurística por rol

| Rol | Problema observado | Heurística (Nielsen) | Cambio aplicado |
| :--- | :--- | :--- | :--- |
| Todos | La barra de herramientas de Astro tapaba contenido. | H8 Diseño minimalista | Desactivada. |
| Todos | El chatbot aparecía en el login y para docentes, mostrando notas de otra persona. | H2 Relación con el mundo real | Solo visible para estudiantes autenticados. |
| Docente | "Sede Central Neiva" repetido 6 veces en la cabecera y tarjetas. | H8 | Cabecera "Mis grupos y calificaciones" y 4 indicadores de sus grupos. |
| Docente | Botón "Guardar" activo en todas las filas sin saber qué cambió; se podía perder lo escrito. | H1 Visibilidad del estado, H5 Prevención de errores | Estado por fila (Guardar / Guardado), contador de filas sin guardar y aviso al salir con cambios. |
| Docente | La docente regional (sede Pitalito) no habría visto sus grupos de Garzón y La Plata por un filtro de sede en el cliente. | H1 | El servidor define el alcance; el cliente no filtra por sede al docente. |
| Estudiante | "Inscribir" registraba la matrícula con un solo clic. | H5 | Confirmación en dos pasos con los créditos de la materia. |
| Estudiante | Materias inscritas y disponibles mezcladas; tope de créditos sin contexto. | H6 Reconocer antes que recordar | Disponibles primero y "Te quedan N créditos"; se deshabilita lo que supera el tope. |
| Estudiante | Estado financiero siempre en verde. | H1 | Verde o ámbar según el estado real. |
| Admin | Indicador de colas siempre "Al día". | H1 | Verde / ámbar (sin Redis) / rojo (worker sin respuesta). |
| Móvil | 26 campos de notas sin etiqueta accesible. | H4 Consistencia, WCAG 1.3.1 | `label` asociado a cada campo. |

---

## 6. Riesgos pendientes y recomendaciones

Estos puntos no se corrigieron en esta iteración porque requieren decisiones de diseño o infraestructura:

1. **Token accesible desde JavaScript.** El JWT vive en `localStorage`, en una cookie sin `HttpOnly` y se pasa como prop a las islas. Un XSS permitiría robarlo. Recomendación: cookie `HttpOnly; Secure; SameSite=Strict` y que el portal actúe como BFF (proxy de las llamadas al core).
2. **RLS no efectivo.** Prisma se conecta como `postgres` (superusuario), que ignora las políticas de `init_supabase_rls.sql`; además el script no se aplica en `db:push`. Hoy el aislamiento lo garantiza la capa de aplicación. Recomendación: rol de base de datos sin `BYPASSRLS` y `SET app.current_user` por transacción, o retirar RLS del discurso de la defensa.
3. **PDFs públicos por identificador.** Cualquiera con el UUID o el código de verificación descarga el certificado completo (es la base de la verificación por QR). Recomendación: una página pública de verificación con datos mínimos y la descarga completa solo para el titular.
4. **Escalado.** Cada servicio es un proceso Node: el throughput se aplana a ~1 300 req/s (lecturas simples) y ~600-740 req/s (lecturas con agregación) desde 50 usuarios. Recomendación: réplicas detrás de un balanceador; el rate limiter debe pasar a un almacén en Redis para funcionar entre réplicas.
5. **Filtro por expresiones regulares.** `payloadSanitizationMiddleware` puede rechazar textos legítimos (p. ej. observaciones con `--` o `'`). La defensa real contra SQLi es Prisma parametrizado y Zod; conviene acotar el filtro a campos de texto libre.
6. **Periodo fijo.** "2026-2" está escrito en varias vistas; debería venir del periodo activo en la base de datos.
