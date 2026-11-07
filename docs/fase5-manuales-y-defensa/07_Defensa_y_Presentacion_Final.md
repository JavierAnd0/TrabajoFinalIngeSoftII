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
  - **Gobierno Descentralizado Multi-Sede con Supabase RLS:**
    - Políticas en motor PostgreSQL (`init_supabase_rls.sql`) que filtran filas automáticamente según el claim `campusId` (`NEI`, `PIT`, `GAR`, `LPL`) y el rol (`STUDENT`, `TEACHER`, `ADMIN`).
- **Visualización Recomendada:** Diagrama de secuencia de la transacción atómica ante 50 hilos concurrentes intentando tomar el último cupo (`1 HTTP 201` vs. `49 HTTP 409 Conflict`).
- **Notas del Orador:** *"Un sistema distribuido maduro no aplica la misma regla CAP a todo: en matrículas priorizamos Consistencia Fuerte (CP) para garantizar cero sobrecupos, mientras que en certificados priorizamos Disponibilidad (AP) con consistencia eventual."*

---

### Diapositiva 6: Procesamiento Asíncrono con Redis + BullMQ y Certificados Criptográficos PDF
- **Contenido Técnico en Pantalla:**
  - **Flujo No Bloqueante (`HTTP 202 Accepted` en `< 20 ms`):**
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
  - **Hidratación Parcial (Islands Architecture):** El servidor entrega HTML estático ultrarrápido y únicamente hidrata las islas interactivas necesarias (`GradesTableIsland`, `CourseEnrollmentIsland`, `AsyncCertificateIsland`, `ChatbotWidget`, `AdminMultiCampusIsland`).
  - **Comunicación Reactiva Entre Islas (`$syncVersion` en Nanostores):** Cuando el estudiante inscribe `ISW-405` o solicita un certificado desde el Chatbot, todas las islas del Dashboard se sincronizan instantáneamente sin recargar el navegador.
- **Visualización Recomendada:** Diagrama de las Islas React en `/dashboard/estudiante` conectadas al átomo reactivo `academicStore.ts`.
- **Notas del Orador:** *"Con Astro 5 SSR e Islas de React 18 logramos lo mejor de ambos mundos: carga inicial instantánea desde el servidor y reactividad rica en el cliente."*

---

### Diapositiva 9: Mantenimiento y Pruebas de Software — Rendimiento y Concurrencia (`k6`)
- **Contenido Técnico en Pantalla:**
  - **Resultados Cuantitativos de los 3 Escenarios de Carga:**
    - **Escenario A (Lectura Concurrente Dashboard + Notas):** `p95 = 2.58 ms` (Umbral SLA `< 250 ms` → **CUMPLE**).
    - **Escenario B (Desacoplamiento Asíncrono Certificados HTTP 202):** `p95 = 4.49 ms` (Umbral SLA `< 50 ms` → **CUMPLE**).
    - **Escenario C (50 Hilos Concurrentes por 1 Último Cupo):** `1 Inscripción Exitosa (HTTP 201)` y `49 Rechazos Controlados (HTTP 409)` → **0 Sobrecupos (`occupied_quota = 30/30`)**.
- **Visualización Recomendada:** Tabla comparativa Síncrono vs. Asíncrono y gráfica de latencias `p50 / p95 / p99`.
- **Notas del Orador:** *"En Mantenimiento y Pruebas sometimos la plataforma a un ataque de carrera de 50 hilos simultáneos disputando un único cupo disponible. El resultado fue matemáticamente exacto: 1 matrícula aprobada, 49 rechazos controlados y cero corrupción de datos."*

---

### Diapositiva 10: Auditoría de Seguridad OWASP Top 10:2021 y Heurísticas de Usabilidad
- **Contenido Técnico en Pantalla:**
  - **100% de Cumplimiento en Auditoría Automatizada OWASP Top 10 (9/9 Vectores Mitigados):**
    - `A01 Broken Access Control`: Bloqueo anti-IDOR (`403 Forbidden`) cuando un estudiante intenta leer notas o certificados de otro UUID, y RBAC estricto en `PUT /api/v1/grades`.
    - `A02 Cryptographic Failures`: Contraseñas con `bcryptjs` (factor 10), JWT firmado `HS256` y certificados PDF con hash `SHA-256`.
    - `A03 Injection`: Sanitización recursiva y validación estricta `Zod` contra SQLi (`' OR 1=1 --`) y XSS (`<script>`).
    - `A05 & A07`: Cabeceras `Helmet` (`CSP`, `HSTS`, `X-Frame-Options: DENY`) y `Rate Limiting` contra fuerza bruta.
  - **Usabilidad y Accesibilidad:** `98.5 / 100` en las 10 Heurísticas de Jakob Nielsen y contraste **WCAG 2.1 AA**.
- **Visualización Recomendada:** Matriz de vectores de ataque OWASP probados vs. códigos HTTP de rechazo seguro (`400`, `401`, `403`, `429`).
- **Notas del Orador:** *"No nos limitamos a declarar que el sistema es seguro: programamos un script de auditoría ofensiva que lanza inyecciones SQL, payloads XSS, tokens adulterados y ataques IDOR contra los endpoints, logrando un 100% de bloqueo efectivo."*

---

### Diapositiva 11: Validación End-to-End con Playwright y Contenerización DevOps
- **Contenido Técnico en Pantalla:**
  - **5 Flujos Críticos de Aceptación Verificados (`E2E-01` a `E2E-05`):**
    - `E2E-01`: Login en 1 clic y emisión de sesión JWT (`PASSED`).
    - `E2E-02`: Dashboard Multi-Sede, tabla 30/30/40 y simulador de Corte 3 (`PASSED`).
    - `E2E-03`: Inscripción transaccional de `ISW-405` con actualización reactiva de cupos (`PASSED`).
    - `E2E-04`: Consulta de notas, simulación y certificado desde `USCO-Bot IA` (`PASSED`).
    - `E2E-05`: Ciclo asíncrono `QUEUED` → `PROCESSING` → `COMPLETED` y descarga de PDF válido (`PASSED`).
  - **Contenerización Multi-Stage (`node:20-alpine`):** Orquestación completa con `docker compose up --build -d` y `healthcheck`s reales en los 6 contenedores.
- **Visualización Recomendada:** Captura del reporte de ejecución E2E al 100% y topología de contenedores en `docker-compose.yml`.
- **Notas del Orador:** *"Cada componente cuenta con su Dockerfile multi-stage optimizado sobre Alpine Linux y está validado de extremo a extremo mediante nuestra suite automatizada en Playwright."*

---

### Diapositiva 12: Conclusiones Técnicas y Demostración en Vivo
- **Contenido Técnico en Pantalla:**
  - Cumplimiento del **100% de los objetivos** de las tres asignaturas integradas.
  - Desacoplamiento real, tolerancia a fallos demostrable y calidad verificada mediante pruebas automatizadas reproducibles.
  - Paso a la **Demostración en Vivo (5 Minutos)**.
- **Notas del Orador:** *"Con esto concluimos la exposición teórica y arquitectónica, e invitamos al jurado a observar la demostración en vivo de los cinco flujos sobre la plataforma."*

---

## 2. Guion de Demostración en Vivo Paso a Paso (5 Minutos — Ejecución Sin Fallos)

| Minuto | Acción en Pantalla | Qué Destacar ante el Jurado |
| :---: | :--- | :--- |
| **00:00 – 01:00** | **1. Portal `/login` y Salud del Clúster:** Mostrar el panel de estado en vivo de los 3 microservicios (`:4001`, `:4002`, `:4003`) y los 4 nodos regionales (`NEI`, `PIT`, `GAR`, `LPL`). Hacer clic en **"Estudiante Ingeniería de Software (Álvaro Javier Andrade)"** y pulsar **Ingresar**. | Destacar la facilidad de uso (Heurística de Nielsen: 1 clic sin recordar contraseñas en la demo) y la emisión de un JWT real con claims de sede y rol. |
| **01:00 – 02:00** | **2. Dashboard Estudiantil y Simulador de Corte 3:** Mostrar el PGA (`4.52`), las 4 materias inscritas y señalar `ISW-403 (Mantenimiento y Pruebas)` con Corte 3 pendiente. Mover el deslizador del **Simulador de Corte 3** a `4.5`. | Explicar cómo el dominio calcula en tiempo real la ponderación oficial USCO (`30% + 30% + 40%`), indicando que necesita `1.35` para aprobar en `3.00` y que con `4.5` cerraría en `4.26`. |
| **02:00 – 03:00** | **3. Inscripción Transaccional ACID (`ISW-405`):** Bajar a la sección de Oferta Académica, mostrar que `ISW-405 Inteligencia Artificial` tiene `15 / 25` cupos ocupados y hacer clic en **"Inscribir Asignatura (ISW-405)"**. | Hacer notar cómo los cupos suben instantáneamente a `16 / 25`, la materia aparece en la tabla superior y los créditos suben de `13` a `16` sin recargar la página. |
| **03:00 – 04:00** | **4. Cola Asíncrona `BullMQ` y Certificado PDF con QR:** En la tarjeta de certificados, hacer clic en **"Generar Certificado Oficial en PDF"**. Mostrar la transición `QUEUED` → `PROCESSING` → `COMPLETED` y abrir el PDF descargado. | Mostrar el PDF oficial generado con los colores de la USCO, la tabla actualizada con las 5 materias, el código QR escaneable y el hash criptográfico `SHA-256`. |
| **04:00 – 05:00** | **5. Chatbot Híbrido `USCO-Bot IA` y Consola Admin Multi-Sede:** Abrir el widget flotante, probar una consulta rápida en modo determinista (`< 5 ms`), luego cambiar a `/login`, entrar como **Admin Multi-Sede (`admin@usco.edu.co`)**, filtrar por sedes (`NEI`, `PIT`, `GAR`, `LPL`) y editar una nota en vivo. | Resaltar la telemetría en vivo de las colas `BullMQ` en el panel de administración y cómo el patrón `Strategy + Circuit Breaker` garantiza disponibilidad del 100% en el Chatbot. |

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
> 2. Además, en `init_supabase_rls.sql` definimos la restricción física `CHECK ("occupied_quota" >= 0 AND "occupied_quota" <= "max_quota")`. Si el cupo ya llegó al límite, la transacción hace *rollback* inmediato y devuelve `409 Conflict (QUOTA_EXCEEDED)` sin bloquear las demás secciones.

### Pregunta 4 (Sistemas Distribuidos): *¿Qué ocurre si el microservicio `async-worker-service` (Puerto 4002) se reinicia a mitad de la generación de un certificado PDF?*
> **Respuesta Técnica:** Primero, Redis está configurado en `docker-compose.yml` con persistencia `Append-Only File (--appendonly yes)` y política `noeviction`, por lo que ningún trabajo encolado se pierde en RAM. Segundo, `BullMQ` maneja confirmaciones explícitas (*acknowledgements*) y reintentos con *exponential backoff*: si el contenedor Worker cae antes de marcar el trabajo como completado, el trabajo vuelve a ser tomado automáticamente al reiniciar. Tercero, implementamos un mecanismo de **regeneración idempotente bajo demanda** (`resolveAndSendPdf` en `async-worker-service`): si un usuario solicita descargar un certificado cuyo archivo PDF aún no está en disco, el Worker consulta el registro en PostgreSQL, lo renderiza en caliente de forma idempotente y lo sirve con su firma `SHA-256` intacta.

### Pregunta 5 (Ingeniería de Software II / IA): *¿Cómo garantizan que el Chatbot con Inteligencia Artificial no "alucine" notas falsas ni deje de funcionar si se agota la cuota gratuita de la API de Gemini o Groq?*
> **Respuesta Técnica:** Aplicamos dos mecanismos arquitectónicos en `chatbot-ai-service`:
> 1. **Para evitar alucinaciones:** El LLM nunca inventa datos; utiliza *Function Calling* para invocar al adaptador `CoreAcademicContextAdapter`, el cual extrae las notas y promedios reales directamente desde PostgreSQL.
> 2. **Para garantizar disponibilidad del 100%:** Implementamos el patrón **Strategy combinado con un Circuit Breaker** en `ProcessAcademicChatUseCase`. Si la API de Gemini o Groq no tiene llave configurada, supera el umbral de fallos o presenta latencia alta, el `Circuit Breaker` abre el circuito y delega instantáneamente la petición al `DeterministicRuleEngineAdapter`, que resuelve la consulta en **menos de 5 milisegundos** usando expresiones regulares ponderadas y álgebra exacta.

### Pregunta 6 (Seguridad / Mantenimiento): *¿Cómo previenen que un estudiante autenticado modifique el UUID en la URL para descargar el boletín de notas o el certificado de otro compañero (Vulnerabilidad IDOR — OWASP A01)?*
> **Respuesta Técnica:** Implementamos el middleware `studentIdorGuardMiddleware` en `core-academic-service` y políticas **Row-Level Security (RLS)** en PostgreSQL (`init_supabase_rls.sql`). Cuando un usuario con rol `STUDENT` invoca `GET /api/v1/students/:id/summary` o `GET /api/v1/certificates/student/:studentId`, el middleware extrae el `userId` y `studentCode` firmados dentro del token JWT (`req.user`) y los compara contra el parámetro solicitado. Si no coinciden, la petición es bloqueada inmediatamente con código `403 Forbidden (IDOR_ACCESS_DENIED)` antes de tocar la base de datos.

### Pregunta 7 (Seguridad / Criptografía): *¿Cómo puede una entidad externa verificar que un certificado PDF descargado desde EduDistribuida es auténtico y no fue adulterado con un editor de PDFs?*
> **Respuesta Técnica:** Cada certificado incluye dos mecanismos de autenticidad verificables generados en `packages/database` y `async-worker-service`:
> 1. **Firma Digital Criptográfica `SHA-256`:** Se construye una cadena canónica concatenando `verificationCode | studentCode | documentNumber | certificateType | issuedIsoDate | secretSalt` y se le aplica `SHA-256`. Cualquier alteración de una décima en el promedio o del nombre del estudiante produce un hash completamente distinto al almacenado en la tabla `certificate_jobs`.
> 2. **Código QR Institucional de Alta Densidad:** Incrustado en la esquina inferior derecha del PDF con el JSON firmado y la URL de verificación directa hacia el servidor.

### Pregunta 8 (Frontend / Rendimiento): *¿Por qué eligieron Astro 5 SSR con Islas de React 18 en lugar de una SPA tradicional hecha únicamente con Create React App o Vite?*
> **Respuesta Técnica:** En regiones del Huila con conectividad móvil variable (como zonas rurales cercanas a Pitalito, Garzón o La Plata), enviar un bundle monolítico de JavaScript de varios megabytes penaliza el *First Contentful Paint (FCP)*. Con **Astro 5 SSR e Hidratación Parcial (Islands Architecture)**, el servidor entrega la estructura HTML e indicadores KPI ya renderizados desde el primer paquete TCP, e hidrata en el navegador únicamente los componentes interactivos (`GradesTableIsland`, `CourseEnrollmentIsland`, `AsyncCertificateIsland`, `ChatbotWidget`), logrando tiempos de carga inferiores a `15 ms`.

### Pregunta 9 (Mantenimiento y Pruebas de Software): *¿Cómo está estructurada la pirámide de pruebas del proyecto y cómo se asegura que no existan regresiones?*
> **Respuesta Técnica:** Nuestra estrategia de aseguramiento de calidad cubre todos los niveles de la pirámide en el directorio `qa-audits/`:
> 1. **Pruebas de Dominio y Contratos Hexagonales:** Verificación matemática de la regla `30% + 30% + 40%`, topes de créditos y control de cupos.
> 2. **Pruebas No Funcionales Automatizadas:** Suite de carga y concurrencia con **k6** (`qa-audits/performance-k6/`), auditoría ofensiva de los 10 riesgos **OWASP Top 10:2021** (`qa-audits/security-owasp/`) y auditoría de **10 Heurísticas de Nielsen + WCAG 2.1 AA** (`qa-audits/usability-heuristics/`).
> 3. **Pruebas de Aceptación End-to-End (E2E):** Suite completa en **Playwright** (`qa-audits/e2e-playwright/`) que valida los 5 flujos críticos (`E2E-01` a `E2E-05`).

### Pregunta 10 (DevOps / Escalabilidad): *Si la Universidad Surcolombiana decide escalar el sistema de 4 sedes a 20 sedes nacionales durante la semana de matrículas, ¿qué componente se debe escalar horizontalmente y cómo lo soporta su arquitectura?*
> **Respuesta Técnica:** Dado que nuestros tres microservicios (`core-academic-service`, `async-worker-service` y `chatbot-ai-service`) son **100% *stateless*** (toda la sesión viaja en tokens JWT firmados y el estado reside en PostgreSQL y Redis), podemos escalar horizontalmente de forma independiente:
> - Si aumenta la demanda de matrículas, escalamos réplicas de `core-academic-service` detrás de un balanceador de carga conectadas al *Transaction Pooler* de Supabase (puerto `6543`).
> - Si hay una avalancha de solicitudes de certificados PDF, simplemente levantamos `N` réplicas adicionales de `async-worker-service` (`docker compose up --scale async-worker-service=5`); `BullMQ` repartirá automáticamente los trabajos de la cola `certificatePdfQueue` entre todos los workers en paralelo sin duplicar ni un solo certificado.
