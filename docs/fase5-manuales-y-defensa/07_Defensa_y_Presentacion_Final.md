# 07. Guion de Sustentación, Estructura de Diapositivas y Defensa Técnica ante el Jurado

**Proyecto:** EduDistribuida (USCO-Net) — Plataforma Distribuida de Gestión Académica Descentralizada  
**Autor Principal / Expositor:** Álvaro Javier Andrade (Código `20221203806`)  
**Programa:** Ingeniería de Software — Facultad de Ingeniería — Universidad Surcolombiana (Sede Neiva)  
**Ejes de Evaluación Integrados:** Ingeniería de Software II · Sistemas Distribuidos · Mantenimiento y Pruebas de Software

---

## 1. Estructura Oficial de la Presentación Final (12 Diapositivas)

### Diapositiva 1: Portada Institucional y Propuesta de Valor
- **Contenido Técnico en Pantalla:**
  - Título: **EduDistribuida (USCO-Net): Plataforma Académica Distribuida Multi-Sede con Arquitectura Hexagonal, Colas Asíncronas e IA Híbrida**.
  - Subtítulo: Solución integral a los cuellos de botella transaccionales y de generación documental en las 4 sedes de la Universidad Surcolombiana (Neiva, Pitalito, Garzón y La Plata).
  - Stack: `Astro 5 SSR + React 18 Islands` · `Node.js 20 TypeScript` · `PostgreSQL 15 + Supabase RLS` · `Redis 7 + BullMQ` · `Gemini / Groq + Motor Determinista`.
- **Visualización Recomendada:** Escudo y paleta oficial USCO (`#8F141B` y `#D4AF37`) junto con insignias de resultados (`0 sobrecupos ACID`, `< 20ms HTTP 202`, `100% OWASP Top 10`).
- **Notas del Orador:** *"Buenos días al honorable jurado calificador. Hoy presentamos EduDistribuida (USCO-Net), una plataforma académica descentralizada diseñada para erradicar la caída de los portales universitarios durante las jornadas críticas de matrícula y expedición de certificados en nuestras cuatro sedes regionales del Huila."*

---

### Diapositiva 2: Problemática en Sistemas Académicos Monolíticos Universitarios
- **Contenido Técnico en Pantalla:**
  1. **Colapso en Días de Matrícula (Condiciones de Carrera):** Múltiples estudiantes compitiendo por el último cupo generan sobrecupos o bloqueos globales de base de datos.
  2. **Bloqueo Síncrono del Event Loop por Generación de PDFs:** Renderizar certificados con gráficos y códigos QR de forma síncrona bloquea el hilo principal de Node.js entre `400 ms` y `1.800 ms` por petición.
  3. **Acoplamiento Fuerte y Falta de Aislamiento Regional:** Un fallo en un módulo externo tumba toda la aplicación y carece de políticas de aislamiento por sede (Neiva, Pitalito, Garzón, La Plata).
- **Visualización Recomendada:** Comparativa visual *"Monolito Síncrono Colapsado (HTTP 504)"* vs. *"Arquitectura Distribuida Desacoplada USCO-Net"*.
- **Notas del Orador:** *"Identificamos tres dolores reales de ingeniería: condiciones de carrera al inscribir asignaturas, bloqueo del hilo de ejecución al renderizar certificados PDF y fragilidad ante caídas de servicios externos."*

---

### Diapositiva 3: Arquitectura de Software — Modelo C4 (Contexto y Contenedores)
- **Contenido Técnico en Pantalla:**
  - **6 Contenedores Orquestados en Red Dedicada (`edudistribuida-net`):**
    1. `web-astro (:4321)`: Portal SSR con hidratación selectiva (Astro Islands + Nanostores).
    2. `core-academic-service (:4001)`: API transaccional de matrículas, notas, cupos y autenticación JWT.
    3. `async-worker-service (:4002)`: Consumidor `BullMQ` de generación de PDFs con firma `SHA-256` y QR.
    4. `chatbot-ai-service (:4003)`: Asistente conversacional híbrido (`Function Calling` + Motor Determinista).
    5. `supabase-db (:5432)`: PostgreSQL 15 con políticas Row-Level Security (RLS) por sede.
    6. `redis-broker (:6379)`: Broker en memoria con persistencia `Append-Only File (AOF)`.
- **Visualización Recomendada:** Diagrama C4 Nivel 2 (Contenedores) mostrando protocolos (`REST JSON`, `BullMQ RESP`, `Prisma TCP`).
- **Notas del Orador:** *"Aplicamos el Modelo C4 de Simon Brown para dividir responsabilidades en seis contenedores independientes. Ningún servicio comparte estado en memoria; toda coordinación ocurre mediante PostgreSQL y colas Redis."*

---

### Diapositiva 4: Ingeniería de Software II — Arquitectura Hexagonal (Ports & Adapters) y Patrones GoF
- **Contenido Técnico en Pantalla:**
  - **Separación Estricta en 3 Capas concéntricas (`src/domain`, `src/application`, `src/infrastructure`):**
    - El núcleo de dominio (`GradeDomainService`, `EnrollmentDomainService`) es **100% TypeScript puro**, sin dependencias de Express, Prisma ni BullMQ.
  - **5 Patrones de Diseño Aplicados:**
    1. **Ports & Adapters (Hexagonal):** Inversión de dependencias mediante `IUserRepository`, `IEnrollmentRepository`, `IQueuePublisherPort`.
    2. **Strategy Pattern:** Conmutación dinámica en el Chatbot entre `GeminiAndGroqFreeAIAdapter` y `DeterministicRuleEngineAdapter`.
    3. **Circuit Breaker:** Detección de fallos o falta de cuota en la API de IA con conmutación en `< 5 ms`.
    4. **Singleton:** Instancia única de `PrismaClient` en `@edudistribuida/database`.
    5. **Publisher / Subscriber (Event-Driven):** Desacoplamiento productor-consumidor vía `BullMQ`.
- **Visualización Recomendada:** Diagrama de capas concéntricas de `core-academic-service` y diagrama de clases del patrón `Strategy` en `chatbot-ai-service`.
- **Notas del Orador:** *"En Ingeniería de Software II garantizamos mantenibilidad aplicando Arquitectura Hexagonal estricta: si mañana cambiamos Prisma por TypeORM o Gemini por otro LLM, las reglas de negocio del reglamento USCO no sufren una sola línea de modificación."*

---

### Diapositiva 5: Sistemas Distribuidos — Teorema CAP, Control de Concurrencia ACID y RLS Multi-Sede
- **Contenido Técnico en Pantalla:**
  - **Particionamiento del Teorema CAP por Caso de Uso:**
    - **Subsistema CP (Consistencia Fuerte + Tolerancia a Particiones):** Inscripción de cupos (`POST /api/v1/enrollments`) y registro de notas (`PUT /api/v1/grades`). Utiliza transacciones interactivas Prisma con bloqueo condicional atómico (`occupied_quota < max_quota`) y restricción SQL `CHECK`.
    - **Subsistema AP (Alta Disponibilidad + Consistencia Eventual):** Expedición de certificados PDF (`POST /api/v1/certificates/request`) y notificaciones académicas.
  - **Aislamiento multi-sede:** lo garantiza la capa de aplicación (JWT + RBAC + anti-IDOR; el docente solo ve sus grupos). Las políticas RLS de `init_supabase_rls.sql` están diseñadas pero no activas, porque Prisma usa un superusuario (ver plan de mitigación).
- **Visualización Recomendada:** Diagrama de secuencia de la transacción con `UPDATE … WHERE occupied_quota < max_quota` y el resultado medido: 4 estudiantes simultáneos por 1 cupo → `1 × 201` y `3 × 409`, cupo final `13/13`.
- **Notas del Orador:** *"Un sistema distribuido maduro no aplica la misma regla CAP a todo: en matrículas priorizamos Consistencia Fuerte (CP) para garantizar cero sobrecupos, mientras que en certificados priorizamos Disponibilidad (AP) con consistencia eventual."*

---

### Diapositiva 6: Procesamiento Asíncrono con Redis + BullMQ y Certificados Criptográficos PDF
- **Contenido Técnico en Pantalla:**
  - **Flujo No Bloqueante (`HTTP 202 Accepted`, p50 medido de 32 ms):**
    1. `core-academic-service` registra el `CertificateJob` en estado `QUEUED` y publica el evento en `certificatePdfQueue`.
    2. `async-worker-service` consume el trabajo en segundo plano (`PROCESSING`), calcula el hash `SHA-256` canónico y genera el código QR de verificación institucional.
    3. `PDFKit` construye el documento oficial con la tabla ponderada 30/30/40 y actualiza el estado a `COMPLETED`.
- **Visualización Recomendada:** Máquina de estados `QUEUED` → `PROCESSING` → `COMPLETED` y vista previa del certificado PDF real con código QR y firma `SHA-256`.
- **Notas del Orador:** *"Al desacoplar la generación del PDF hacia el Worker en el puerto 4002, reducimos el tiempo de respuesta de la API principal de más de 800 milisegundos a solo 4.5 milisegundos."*

---

### Diapositiva 7: Asistente Académico Conversacional Híbrido (`USCO-Bot IA`)
- **Contenido Técnico en Pantalla:**
  - **Arquitectura de Doble Motor con Tolerancia a Fallos:**
    - **Motor Primario (`Gemini 2.5 Flash` / `Groq Llama 3.3 70B`):** Ejecuta *Function Calling* sobre 4 herramientas reales (`consultar_notas_y_promedio`, `simular_nota_corte3`, `consultar_horario_y_pagos`, `generar_certificado_academico`).
    - **Motor Secundario (`DeterministicRuleEngineAdapter`):** Clasificador léxico ponderado con normalización Unicode y cálculo matemático exacto en `< 5 ms`.
  - **Cero Alucinaciones en Datos Numéricos:** Los cálculos de notas y promedios provienen siempre de la base de datos transaccional.
- **Visualización Recomendada:** Flujo de decisión del `Circuit Breaker` y captura del widget flotante renderizando la tabla de notas y el botón de descarga del PDF dentro del chat.
- **Notas del Orador:** *"Nuestro asistente virtual nunca deja al estudiante sin respuesta: incluso si se desconecta internet o se agota la cuota gratuita del LLM, el Circuit Breaker conmuta en menos de 2 milisegundos al motor determinista."*

---

### Diapositiva 8: Frontend Moderno — Astro 5 SSR + React 18 Islands + Nanostores
- **Contenido Técnico en Pantalla:**
  - **Hidratación Parcial (Islands Architecture):** El servidor entrega HTML estático ultrarrápido y únicamente hidrata las islas interactivas necesarias (`GradesTableIsland`, `CourseEnrollmentIsland`, `AsyncCertificateIsland`, `ChatbotWidget`, `AdminMultiCampusIsland`, `UserProfileMenuIsland`).
  - **UX Institucional, Aislamiento RBAC y Responsive:** Modo Oscuro / Modo Claro de alto contraste, vista automática en tarjetas para móviles (`< 768 px`), tablas compactas y aislamiento estricto por rol/sede tanto en middleware SSR (`middleware/index.ts`) como en la interfaz.
  - **Comunicación Reactiva Entre Islas (`$syncVersion` en Nanostores):** Cuando el estudiante inscribe `ISW-405` o solicita un certificado desde el Chatbot, todas las islas del Dashboard se sincronizan instantáneamente sin recargar el navegador.
- **Visualización Recomendada:** Diagrama de las Islas React en `/dashboard/estudiante` conectadas al átomo reactivo `academicStore.ts`.
- **Notas del Orador:** *"Con Astro 5 SSR e Islas de React 18 logramos lo mejor de ambos mundos: carga inicial instantánea desde el servidor y reactividad rica en el cliente."*

---

### Diapositiva 9: Pruebas de rendimiento sobre el sistema real
- **Contenido en pantalla:**
  - Prueba de carga de 10 → 50 → 100 usuarios concurrentes contra los servicios reales (Express + Prisma + PostgreSQL): **0 % de errores** en todas las etapas.
  - Con 50 usuarios: p95 de 47 ms (`/campuses`), 85 ms (`/summary`), 98 ms (`/admin/enrollments`) y 88 ms (chatbot).
  - **Cuello de botella identificado:** el throughput se aplana desde ~50 usuarios porque cada servicio es un solo proceso Node (CPU al 100 %). Mitigación: réplicas tras balanceador.
  - Solicitud de certificado: `202 Accepted` en p50 32 ms mientras el worker genera el PDF en segundo plano.
- **Visualización:** gráficos `real_throughput_vs_concurrency.png` y `real_latency_p95_by_endpoint.png`.
- **Notas del orador:** *"No reportamos cifras de laboratorio: todas las peticiones atravesaron la base de datos real. Lo más valioso fue encontrar dónde se satura el sistema y por qué."*

---

### Diapositiva 10: Seguridad OWASP y usabilidad
- **Contenido en pantalla:**
  - Auditoría de caja negra con 29 ataques reales (sin token, token falsificado, `alg: none`, IDOR, header interno falso, webhook sin firma, cookie adulterada, SQLi, XSS, path traversal, CORS, fuerza bruta).
  - **Antes de la auditoría: 11/29. Después: 29/29.** La versión anterior del script atacaba una réplica en memoria y no veía que el listado de notas era público.
  - Accesibilidad axe-core WCAG 2.1 A/AA: **42 → 0** nodos con violaciones.
  - Evaluación heurística de Nielsen con 12 hallazgos y su severidad (10 corregidos).
- **Notas del orador:** *"La lección de calidad más importante del proyecto: una prueba que no golpea el sistema real da una falsa sensación de seguridad. Por eso nuestras pruebas ahora corren en la CI contra PostgreSQL, Redis y los cuatro servicios."*

---

### Diapositiva 11: Validación End-to-End y contenerización
- **Contenido en pantalla:**
  - 5 flujos de aceptación en Playwright contra el sistema real (5/5): login, panel con simulador, inscripción con confirmación, chatbot con tabla de notas y certificado, ciclo asíncrono del PDF.
  - Docker Compose con 6 contenedores y `healthcheck`; el compose exige secretos reales y el portal usa las URLs internas de la red Docker.
  - CI en GitHub Actions: build + pureza hexagonal → sistema real (E2E + OWASP) → accesibilidad.
- **Notas del orador:** *"Cada push levanta la plataforma completa y la ataca; si un control de seguridad falla, el build no pasa."*

---

### Diapositiva 12: Conclusiones Técnicas y Demostración en Vivo
- **Contenido Técnico en Pantalla:**
  - Las 5 fases del enunciado entregadas y verificadas contra el sistema en ejecución.
  - Desacoplamiento real, tolerancia a fallos demostrable y calidad verificada mediante pruebas automatizadas reproducibles.
  - Paso a la **Demostración en Vivo (5 Minutos)**.
- **Notas del Orador:** *"Con esto concluimos la exposición teórica y arquitectónica, e invitamos al jurado a observar la demostración en vivo de los cinco flujos sobre la plataforma."*

---

## 2. Guion de Demostración en Vivo Paso a Paso (5 Minutos — Ejecución Sin Fallos)

| Minuto | Acción en Pantalla | Qué Destacar ante el Jurado |
| :---: | :--- | :--- |
| **00:00 – 01:00** | **1. Portal `/login` y Salud del Clúster:** Mostrar el panel de estado en vivo de los 3 microservicios (`:4001`, `:4002`, `:4003`) y los 4 nodos regionales (`NEI`, `PIT`, `GAR`, `LPL`). Hacer clic en **"Estudiante Ingeniería de Software (Álvaro Javier Andrade)"** y pulsar **Ingresar**. | Destacar la facilidad de uso (Heurística de Nielsen: 1 clic sin recordar contraseñas en la demo) y la emisión de un JWT real con claims de sede y rol. |
| **01:00 – 02:00** | **2. Dashboard Estudiantil y Simulador de Corte 3:** Mostrar el PGA (`4.46`), las 4 materias inscritas y señalar `ISW-403 (Mantenimiento y Pruebas)` con Corte 3 pendiente. Mover el deslizador del **Simulador de Corte 3** a `4.5`. | Explicar cómo el dominio calcula en tiempo real la ponderación oficial USCO (`30% + 30% + 40%`), indicando que necesita `0.90` para aprobar en `3.00` y que con `4.5` cerraría en `4.44`. |
| **02:00 – 03:00** | **3. Inscripción Transaccional ACID (`ISW-405`):** Bajar a la sección de Oferta Académica, mostrar que `ISW-405 Inteligencia Artificial` tiene `15 / 25` cupos ocupados, pulsar **"Inscribir ISW-405"** y luego **"Confirmar · 3 créditos"**. | Hacer notar la confirmación en dos pasos, los cupos en `16 / 25`, la materia en la tabla y "Te quedan 5 créditos". |
| **03:00 – 04:00** | **4. Cola Asíncrona `BullMQ` y Certificado PDF con QR:** En la tarjeta de certificados, hacer clic en **"Generar Certificado Oficial en PDF"**. Mostrar la transición `QUEUED` → `PROCESSING` → `COMPLETED` y abrir el PDF descargado. | Mostrar el PDF oficial generado con los colores de la USCO, la tabla actualizada con las 5 materias, el código QR escaneable y el hash criptográfico `SHA-256`. |
| **04:00 – 05:00** | **5. Chatbot Híbrido `USCO-Bot IA` y Consola Admin Multi-Sede:** Abrir el widget flotante, probar una consulta rápida en modo determinista (`< 5 ms`), luego cambiar a `/login`, entrar como **docente** y editar una nota (la fila queda en ámbar hasta guardar), y luego como **admin** filtrar por sedes. | Resaltar la telemetría en vivo de las colas `BullMQ` en el panel de administración y cómo el patrón `Strategy + Circuit Breaker` garantiza disponibilidad del 100% en el Chatbot. |

---

## 3. Banco de 10 Preguntas Frecuentes del Jurado Calificador (Con Respuestas Técnicas Rigurosas)

### Pregunta 1 (Ingeniería de Software II): *¿Por qué eligieron Arquitectura Hexagonal (Ports & Adapters) en lugar de una arquitectura tradicional MVC en capas para los microservicios?*
> **Respuesta Técnica:** En una arquitectura MVC tradicional, los controladores suelen acoplarse directamente al ORM (Prisma) o al proveedor de colas (BullMQ), dificultando las pruebas unitarias y la evolución tecnológica. Con la **Arquitectura Hexagonal de Alistair Cockburn**, aislamos las reglas académicas de la Universidad Surcolombiana (`GradeDomainService` y `EnrollmentDomainService`) en el núcleo `domain/` sin una sola importación de infraestructura. Los casos de uso en `application/use-cases/` se comunican exclusivamente a través de contratos (`IUserRepository`, `IEnrollmentRepository`, `IQueuePublisherPort`). Esto nos permitió validar toda la lógica de negocio tanto contra PostgreSQL como con adaptadores en memoria en milisegundos.

### Pregunta 2 (Sistemas Distribuidos): *Según el Teorema CAP de Brewer, ¿cómo clasifican a EduDistribuida y cómo justifican esa decisión?*
> **Respuesta Técnica:** En un sistema distribuido de microservicios moderno no se aplica una única etiqueta CAP monolítica, sino que se particiona por contexto delimitado (*Bounded Context*) ante particiones de red ($P$):
> 1. **El subsistema de Matrículas y Calificaciones es estrictamente CP (Consistencia Fuerte + Tolerancia a Particiones):** Preferimos rechazar o encolar una transacción antes que permitir que dos estudiantes tomen el asiento 30 de 30 en una sección.
> 2. **El subsistema de Expedición de Certificados PDF y Notificaciones es AP (Alta Disponibilidad + Consistencia Eventual):** El usuario recibe confirmación inmediata (`HTTP 202 Accepted` en `< 20 ms`) y el estado converge eventualmente a `COMPLETED` a través de `BullMQ`.

### Pregunta 3 (Sistemas Distribuidos / Base de Datos): *¿Cómo evitan exactamente la condición de carrera (Race Condition) cuando 50 estudiantes intentan inscribir el último cupo al mismo milisegundo?*
> **Respuesta Técnica:** Implementamos una defensa en doble capa dentro de `PrismaAcademicRepository.executeAtomicEnrollment`:
> 1. Ejecutamos una transacción interactiva ACID (`prisma.$transaction`) que realiza una actualización atómica condicional (`UPDATE course_sections SET occupied_quota = occupied_quota + 1 WHERE id = $1 AND occupied_quota < max_quota`). En PostgreSQL, esta sentencia adquiere un bloqueo exclusivo a nivel de fila (*Row-Level Lock*) durante el microsegundo de actualización.
> 2. Si la actualización no afecta ninguna fila (el cupo ya se llenó), la transacción hace *rollback* y responde `409 Conflict (QUOTA_EXCEEDED)`. Lo comprobamos: 4 estudiantes simultáneos por 1 cupo dieron `1 × 201`, `3 × 409` y el cupo quedó en `13/13`. (El `CHECK` de `init_supabase_rls.sql` sería una tercera barrera al aplicarse ese script en Supabase.)

### Pregunta 4 (Sistemas Distribuidos): *¿Qué ocurre si el microservicio `async-worker-service` (Puerto 4002) se reinicia a mitad de la generación de un certificado PDF?*
> **Respuesta Técnica:** Primero, Redis está configurado en `docker-compose.yml` con persistencia `Append-Only File (--appendonly yes)` y política `noeviction`, por lo que ningún trabajo encolado se pierde en RAM. Segundo, `BullMQ` maneja confirmaciones explícitas (*acknowledgements*) y reintentos con *exponential backoff*: si el contenedor Worker cae antes de marcar el trabajo como completado, el trabajo vuelve a ser tomado automáticamente al reiniciar. Tercero, implementamos un mecanismo de **regeneración idempotente bajo demanda** (`resolveAndSendPdf` en `async-worker-service`): si un usuario solicita descargar un certificado cuyo archivo PDF aún no está en disco, el Worker consulta el registro en PostgreSQL, lo renderiza en caliente de forma idempotente y lo sirve con su firma `SHA-256` intacta.

### Pregunta 5 (Ingeniería de Software II / IA): *¿Cómo garantizan que el Chatbot con Inteligencia Artificial no "alucine" notas falsas ni deje de funcionar si se agota la cuota gratuita de la API de Gemini o Groq?*
> **Respuesta Técnica:** Aplicamos dos mecanismos arquitectónicos en `chatbot-ai-service`:
> 1. **Para evitar alucinaciones:** El LLM nunca inventa datos; utiliza *Function Calling* para invocar al adaptador `CoreAcademicContextAdapter`, el cual extrae las notas y promedios reales directamente desde PostgreSQL.
> 2. **Para garantizar disponibilidad del 100%:** Implementamos el patrón **Strategy combinado con un Circuit Breaker** en `ProcessAcademicChatUseCase`. Si la API de Gemini o Groq no tiene llave configurada, supera el umbral de fallos o presenta latencia alta, el `Circuit Breaker` abre el circuito y delega instantáneamente la petición al `DeterministicRuleEngineAdapter`, que resuelve la consulta en **menos de 5 milisegundos** usando expresiones regulares ponderadas y álgebra exacta.

### Pregunta 6 (Seguridad / Mantenimiento): *¿Cómo previenen que un estudiante autenticado modifique el UUID en la URL para descargar el boletín de notas o el certificado de otro compañero (Vulnerabilidad IDOR — OWASP A01)?*
> **Respuesta Técnica:** El middleware `studentIdorGuardMiddleware` exige siempre un JWT válido (o el token interno de servicio, que el navegador nunca conoce). Cuando un usuario con rol `STUDENT` invoca `GET /api/v1/students/:id/summary` o `GET /api/v1/certificates/student/:studentId`, el middleware extrae el `userId` y `studentCode` firmados dentro del token JWT (`req.user`) y los compara contra el parámetro solicitado. Si no coinciden, la petición es bloqueada inmediatamente con código `403 Forbidden (IDOR_ACCESS_DENIED)` antes de tocar la base de datos. Lo mismo aplica a la solicitud de certificados, al chatbot (que toma el estudiante del token e ignora el `studentId` del cuerpo) y a la ruta de descarga del portal. Nuestra auditoría de caja negra prueba estos casos en cada push.

### Pregunta 7 (Seguridad / Criptografía): *¿Cómo puede una entidad externa verificar que un certificado PDF descargado desde EduDistribuida es auténtico y no fue adulterado con un editor de PDFs?*
> **Respuesta Técnica:** Cada certificado incluye dos mecanismos de autenticidad verificables generados en `packages/database` y `async-worker-service`:
> 1. **Firma Digital Criptográfica `SHA-256`:** Se construye una cadena canónica concatenando `verificationCode | studentCode | documentNumber | certificateType | issuedIsoDate | secretSalt` y se le aplica `SHA-256`. Cualquier alteración de una décima en el promedio o del nombre del estudiante produce un hash completamente distinto al almacenado en la tabla `certificate_jobs`.
> 2. **Código QR Institucional de Alta Densidad:** Incrustado en la esquina inferior derecha del PDF con el JSON firmado y la URL de verificación directa hacia el servidor.

### Pregunta 8 (Frontend / Rendimiento): *¿Por qué eligieron Astro 5 SSR con Islas de React 18 en lugar de una SPA tradicional hecha únicamente con Create React App o Vite?*
> **Respuesta Técnica:** En regiones del Huila con conectividad móvil variable (como zonas rurales cercanas a Pitalito, Garzón o La Plata), enviar un bundle monolítico de JavaScript de varios megabytes penaliza el *First Contentful Paint (FCP)*. Con **Astro 5 SSR e Hidratación Parcial (Islands Architecture)**, el servidor entrega la estructura HTML e indicadores KPI ya renderizados desde el primer paquete TCP, e hidrata en el navegador únicamente los componentes interactivos (`GradesTableIsland`, `CourseEnrollmentIsland`, `AsyncCertificateIsland`, `ChatbotWidget`), logrando tiempos de carga inferiores a `15 ms`.

### Pregunta 9 (Mantenimiento y Pruebas de Software): *¿Cómo está estructurada la pirámide de pruebas del proyecto y cómo se asegura que no existan regresiones?*
> **Respuesta Técnica:**
> 1. **Dominio:** reglas 30/30/40, cupo, doble matrícula y tope de 21 créditos en servicios de dominio puros (sin infraestructura).
> 2. **No funcionales contra el sistema real:** OWASP de caja negra (`npm run test:security`, 29 controles), carga (`npm run test:load`) y accesibilidad con axe-core (`npm run test:a11y`).
> 3. **Aceptación E2E:** Playwright con 5 flujos críticos (`npm run test:e2e`).
> 4. **Regresión:** la CI levanta PostgreSQL, Redis y los 4 servicios en cada push y ejecuta E2E + OWASP. Aprendimos que una suite que no golpea el sistema real no previene regresiones: la versión anterior aprobaba al 100 % con el control de acceso roto.

### Pregunta 10 (DevOps / Escalabilidad): *Si la Universidad Surcolombiana decide escalar el sistema de 4 sedes a 20 sedes nacionales durante la semana de matrículas, ¿qué componente se debe escalar horizontalmente y cómo lo soporta su arquitectura?*
> **Respuesta Técnica:** Dado que nuestros tres microservicios (`core-academic-service`, `async-worker-service` y `chatbot-ai-service`) son **100% *stateless*** (toda la sesión viaja en tokens JWT firmados y el estado reside en PostgreSQL y Redis), podemos escalar horizontalmente de forma independiente:
> - Si aumenta la demanda de matrículas, escalamos réplicas de `core-academic-service` detrás de un balanceador de carga conectadas al *Transaction Pooler* de Supabase (puerto `6543`).
> - Si hay una avalancha de solicitudes de certificados PDF, simplemente levantamos `N` réplicas adicionales de `async-worker-service` (`docker compose up --scale async-worker-service=5`); `BullMQ` repartirá automáticamente los trabajos de la cola `certificatePdfQueue` entre todos los workers en paralelo sin duplicar ni un solo certificado.
