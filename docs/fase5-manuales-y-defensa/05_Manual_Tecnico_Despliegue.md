# 05. Manual Técnico de Instalación, Configuración y Despliegue (DevOps & Cloud)

**Proyecto:** EduDistribuida (USCO-Net) — Plataforma Distribuida de Gestión Académica Descentralizada  
**Institución:** Universidad Surcolombiana (USCO) — Facultad de Ingeniería — Ingeniería de Software  
**Asignaturas Integradas:** Ingeniería de Software II · Sistemas Distribuidos · Mantenimiento y Pruebas de Software  
**Versión:** 1.0.0 (Release Producción — Periodo Académico 2026-2)

---

## 1. Arquitectura General del Monorepo y Mapa de Puertos

El sistema **EduDistribuida (USCO-Net)** está organizado bajo una arquitectura de **Monorepo con NPM Workspaces**, desacoplando la persistencia compartida (`packages/database`) de los **tres microservicios backend bajo Arquitectura Hexagonal (Ports & Adapters)** y el **Portal Web Institucional Astro 5 SSR + React 18 Islands**.

```mermaid
flowchart TB
    subgraph ClientLayer["Capa de Presentación (SSR + Hidratación Parcial)"]
        ASTRO["apps/web-astro<br/>Astro 5 SSR + React 18 Islands + Nanostores<br/>Puerto: 4321"]
    end

    subgraph HexagonalBackend["Capa de Microservicios (Arquitectura Hexagonal)"]
        CORE["apps/core-academic-service<br/>Node 20 + Express + Zod + JWT + RBAC<br/>Puerto: 4001"]
        WORKER["apps/async-worker-service<br/>Consumer BullMQ + PDFKit + QR + SHA-256<br/>Puerto: 4002"]
        CHATBOT["apps/chatbot-ai-service<br/>Strategy Pattern (Gemini/Groq + Reglas < 5ms)<br/>Puerto: 4003"]
    end

    subgraph DataAndMessaging["Capa de Datos y Mensajería Distribuida"]
        PG[("PostgreSQL 15 / Supabase<br/>Prisma ORM + Políticas RLS Multi-Sede<br/>Puerto: 5432")]
        REDIS[("Redis 7 Broker (AOF)<br/>Colas Asíncronas BullMQ<br/>Puerto: 6379")]
        VOL[("Volumen Persistente / Bucket<br/>academic-certificates (PDFs Firmados)")]
    end

    ASTRO -->|"REST JSON + JWT Bearer"| CORE
    ASTRO -->|"POST /api/v1/chat/message"| CHATBOT
    ASTRO -->|"GET /public/certificates/*.pdf"| WORKER

    CORE -->|"Transacciones ACID (Prisma)"| PG
    CORE -->|"Publica Eventos (HTTP 202)"| REDIS

    REDIS -->|"Consume Trabajos Asíncronos"| WORKER
    WORKER -->|"Actualiza Estado COMPLETED + Hash"| PG
    WORKER -->|"Almacena Binario PDF + QR"| VOL

    CHATBOT -->|"Consulta Contexto / Solicita Certificados"| CORE
    CHATBOT -->|"Registra Auditoría ChatInteractionLog"| PG
```

### 1.1. Estructura de Directorios del Monorepo

```text
TrabajoFinalIngeSoftII/
├── .dockerignore                         # Exclusiones para compilación limpia en Docker
├── .env                                  # Variables de entorno activas para desarrollo/contenedores
├── .env.example                          # Plantilla documentada de variables de entorno
├── docker-compose.yml                    # Orquestador de los 6 contenedores en la red edudistribuida-net
├── package.json                          # Configuración raíz de NPM Workspaces y scripts globales
├── packages/
│   └── database/                         # @edudistribuida/database (Prisma ORM + Seeds + SQL RLS)
│       ├── prisma/
│       │   ├── schema.prisma             # Modelo relacional de las 9 entidades distribuidas
│       │   └── seed.ts                   # Población idempotente multi-sede (NEI, PIT, GAR, LPL)
│       ├── sql/
│       │   └── init_supabase_rls.sql     # Políticas Row-Level Security (RLS) e índices ACID
│       └── src/
│           └── index.ts                  # Cliente Singleton Prisma y utilidades criptográficas SHA-256
├── apps/
│   ├── core-academic-service/            # @edudistribuida/core-academic-service (Puerto 4001)
│   │   ├── Dockerfile                    # Imagen multi-stage node:20-alpine
│   │   └── src/                          # domain/ + application/ + infrastructure/
│   ├── async-worker-service/             # @edudistribuida/async-worker-service (Puerto 4002)
│   │   ├── Dockerfile                    # Imagen multi-stage node:20-alpine con soporte PDFKit/QR
│   │   ├── public/certificates/          # Almacenamiento de certificados PDF generados
│   │   └── src/                          # domain/ + application/ + infrastructure/
│   ├── chatbot-ai-service/               # @edudistribuida/chatbot-ai-service (Puerto 4003)
│   │   ├── Dockerfile                    # Imagen multi-stage node:20-alpine
│   │   └── src/                          # Strategy + Circuit Breaker (Gemini/Groq + Motor Determinista)
│   └── web-astro/                        # @edudistribuida/web-astro (Puerto 4321)
│       ├── Dockerfile                    # Imagen multi-stage Astro 5 SSR (@astrojs/node standalone)
│       └── src/                          # pages/ + components/react/ + stores/ + services/
├── qa-audits/                            # Suites automatizadas de Ingeniería de Calidad y Pruebas
│   ├── performance-k6/                   # Pruebas de carga, estrés y concurrencia ACID con k6
│   ├── security-owasp/                   # Auditoría automatizada OWASP Top 10:2021
│   ├── usability-heuristics/             # Auditoría de heurísticas de Nielsen y WCAG 2.1 AA
│   └── e2e-playwright/                   # Suite E2E Playwright (E2E-01 a E2E-05) y verificador integral
└── docs/                                 # Documentación arquitectónica, informes QA, manuales y defensa
```

### 1.2. Tabla Oficial de Servicios y Puertos

| Servicio / Contenedor | Nombre en Docker Compose | Puerto | Protocolo | Endpoint de Salud (`Healthcheck`) | Documentación / Interfaz |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **PostgreSQL 15 + RLS** | `supabase-db` | `5432` | TCP / SQL | `pg_isready -U postgres -d edudistribuida` | `packages/database/sql/init_supabase_rls.sql` |
| **Redis 7 Broker (AOF)** | `redis-broker` | `6379` | TCP / RESP | `redis-cli ping` (`PONG`) | Colas `certificatePdfQueue` y `notificationQueue` |
| **Core Academic Service** | `core-academic-service` | `4001` | HTTP / REST | `GET http://localhost:4001/health` | Swagger UI: `http://localhost:4001/api/docs` |
| **Async Worker Service** | `async-worker-service` | `4002` | HTTP / BullMQ | `GET http://localhost:4002/health` | Métricas: `http://localhost:4002/metrics/queues` |
| **Chatbot AI Service** | `chatbot-ai-service` | `4003` | HTTP / REST | `GET http://localhost:4003/health` | Swagger UI: `http://localhost:4003/api/docs` |
| **Portal Web Astro SSR** | `web-astro` | `4321` | HTTP / SSR | `GET http://localhost:4321/login` | Portal Web: `http://localhost:4321` |

---

## 2. Requisitos de Hardware y Software

### 2.1. Requisitos de Hardware

| Perfil de Entorno | Procesador (CPU) | Memoria RAM | Almacenamiento Libre | Red |
| :--- | :--- | :--- | :--- | :--- |
| **Desarrollo Local / QA** | 2 vCPU (x86_64 o Apple Silicon M1/M2/M3) | 4 GB RAM mínimo (8 GB recomendado) | 5 GB SSD | Loopback local (`localhost`) |
| **Servidor de Producción / Cloud** | 4 vCPU dedicados o compartidos | 8 GB RAM | 20 GB SSD NVMe (AOF Redis + PostgreSQL + PDFs) | HTTPS TLS 1.3 + VPC Privada |

### 2.2. Requisitos de Software Base

- **Sistema Operativo:** macOS 13+, Linux (Ubuntu 22.04+ / Debian 12+) o Windows 11 con WSL2.
- **Node.js:** Versión `v20.11.0 LTS` o superior (compatible con `v20.x` y `v22.x`).
- **Gestor de Paquetes:** `npm v10.x` (soporte nativo para `workspaces`).
- **Docker Engine & Docker Compose:** Docker Desktop `4.28+` o Docker Engine `25.0+` con `docker compose v2`.
- **Herramientas Opcionales de Auditoría:** `k6` (Grafana k6 para pruebas de carga) y navegadores de Playwright (`npx playwright install chromium`).

---

## 3. Explicación Línea por Línea del Archivo `.env`

En la raíz del proyecto (`/Users/javier/TrabajoFinalIngeSoftII/.env`) se centraliza la configuración de todos los paquetes y microservicios. A continuación se detalla el propósito técnico de cada variable definida en `.env.example`:

| Variable de Entorno | Valor por Defecto (Local) | Descripción Técnica y Propósito |
| :--- | :--- | :--- |
| `SUPABASE_URL` | `https://tu-proyecto.supabase.co` | Endpoint principal de la instancia Supabase Cloud o contenedor local para almacenamiento e integración. |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Llave pública anónima de Supabase utilizada cuando se invoca la API REST de Supabase sujeta a políticas RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Llave administrativa de servicio para operaciones privilegiadas de backend (subida de PDFs al bucket). |
| `SUPABASE_JWT_SECRET` | `super-secret-jwt-token-with-at-least-32-characters-long` | Secreto criptográfico simétrico (`HS256`) compartido para firmar y verificar tokens JWT y generar el salt de firmas `SHA-256` de certificados. |
| `SUPABASE_STORAGE_BUCKET` | `academic-certificates` | Nombre del bucket donde el Worker almacena los certificados PDF generados. |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/edudistribuida?schema=public` | Cadena de conexión principal de Prisma ORM hacia PostgreSQL (o Supavisor Connection Pooler en producción). |
| `DIRECT_URL` | `postgresql://postgres:postgres@localhost:5432/edudistribuida?schema=public` | Cadena de conexión directa a PostgreSQL utilizada por `prisma db push` y migraciones DDL. |
| `REDIS_HOST` | `localhost` (`redis-broker` en Docker) | Host o IP del servidor Redis 7 encargado de gestionar las colas distribuidas de `BullMQ`. |
| `REDIS_PORT` | `6379` | Puerto TCP del broker Redis. |
| `REDIS_PASSWORD` | `""` | Contraseña de autenticación ACL de Redis (requerida en Upstash Redis o Redis Cloud). |
| `CORE_SERVICE_PORT` | `4001` | Puerto de escucha HTTP del microservicio `core-academic-service`. |
| `CORE_SERVICE_URL` | `http://localhost:4001` | URL interna utilizada por el Chatbot y Astro SSR para invocar la API transaccional Core. |
| `WORKER_SERVICE_PORT` | `4002` | Puerto de escucha HTTP del microservicio `async-worker-service`. |
| `WORKER_SERVICE_URL` | `http://localhost:4002` | URL del Worker para consulta de métricas de colas y descarga directa de certificados PDF. |
| `CHATBOT_SERVICE_PORT` | `4003` | Puerto de escucha HTTP del microservicio `chatbot-ai-service`. |
| `CHATBOT_SERVICE_URL` | `http://localhost:4003` | URL base del microservicio conversacional híbrido. |
| `PUBLIC_ASTRO_PORT` | `4321` | Puerto de escucha del servidor Astro 5 SSR (`@astrojs/node`). |
| `PUBLIC_CORE_API_URL` | `http://localhost:4001/api/v1` | URL pública inyectada en las Islas React del cliente para consumir endpoints académicos. |
| `PUBLIC_CHATBOT_API_URL` | `http://localhost:4003/api/v1/chat` | URL pública consumida por el widget flotante `ChatbotWidget.tsx`. |
| `AI_PROVIDER` | `"gemini"` | Estrategia activa por defecto en el Chatbot (`gemini`, `groq` o `deterministic`). |
| `GEMINI_API_KEY` | `""` | API Key gratuita de Google AI Studio. Si está vacía, el `Circuit Breaker` conmuta sin error al motor determinista (`< 5 ms`). |
| `GEMINI_MODEL` | `"gemini-2.5-flash"` | Modelo de lenguaje de Google Gemini utilizado para `Function Calling`. |
| `GROQ_API_KEY` | `""` | API Key gratuita de Groq Cloud para inferencia ultrarrápida. |
| `GROQ_MODEL` | `"llama-3.3-70b-versatile"` | Modelo LLaMA 3.3 70B alojado en Groq con soporte de herramientas estructuradas. |

---

## 4. Guía de Despliegue Local Paso a Paso (Modo Desarrollo y Modo Docker Compose)

### 4.1. Opción A: Despliegue Orquestado en 1 Comando con Docker Compose (Recomendado)

La totalidad de la infraestructura (**PostgreSQL 15 con RLS**, **Redis 7 AOF**, los **3 microservicios Node.js** y el **Portal Astro 5 SSR**) se levanta automáticamente mediante `docker-compose.yml`:

```bash
# 1. Ubicarse en la raíz del monorepo
cd /Users/javier/TrabajoFinalIngeSoftII

# 2. Verificar que el archivo .env exista (si no existe, copiar desde .env.example)
cp -n .env.example .env

# 3. Construir las imágenes multi-stage e iniciar los 6 contenedores en segundo plano
npm run docker:up
# Equivalente a: docker compose up --build -d

# 4. Verificar que los 6 contenedores estén en estado "healthy"
docker compose ps
```

Al iniciar `core-academic-service`, su comando de arranque ejecuta automáticamente:
1. `npm run db:push --workspace=@edudistribuida/database` (sincronización del esquema Prisma).
2. `npm run db:seed --workspace=@edudistribuida/database` (población idempotente de las 4 sedes USCO, programas, 6 cursos, 9 secciones, matrículas, notas y certificados).
3. Inicio del servidor en el puerto `4001`.

Para detener el clúster y limpiar volúmenes:
```bash
npm run docker:down
```

### 4.2. Opción B: Ejecución Nativa en Modo Desarrollo (Workspaces Locales)

Si se desea ejecutar cada microservicio con recarga en caliente (`tsx` y `astro dev`):

```bash
# 1. Instalar todas las dependencias del monorepo
npm install

# 2. Generar el cliente tipado de Prisma y compilar todos los paquetes y servicios
npm run db:generate
npm run build:all

# 3. Sincronizar el esquema en PostgreSQL y poblar la semilla multi-sede
npm run db:push
npm run db:seed

# 4. Iniciar los 4 servicios en terminales separadas:
npm run dev:core     # Terminal 1 -> Core Academic Service (http://localhost:4001)
npm run dev:worker   # Terminal 2 -> Async Worker Service  (http://localhost:4002)
npm run dev:chatbot  # Terminal 3 -> Chatbot AI Service    (http://localhost:4003)
npm run dev:web      # Terminal 4 -> Portal Web Astro SSR  (http://localhost:4321)
```

---

## 5. Base de Datos, Políticas RLS en Supabase y Población de Datos (`Seed`)

### 5.1. Aplicación de Políticas Row-Level Security (RLS) Multi-Sede

El archivo [`init_supabase_rls.sql`](file:///Users/javier/TrabajoFinalIngeSoftII/packages/database/sql/init_supabase_rls.sql) implementa el aislamiento criptográfico y relacional por sede (`NEI`, `PIT`, `GAR`, `LPL`) directamente en el motor PostgreSQL:

- **Funciones de extracción de Claims JWT:** `public.jwt_user_role()`, `public.jwt_user_campus_id()` y `public.jwt_supabase_uid()`.
- **Políticas RLS por Tabla:**
  - Un usuario con rol `STUDENT` únicamente puede leer sus propios registros en `enrollments`, `grades`, `certificate_jobs` y `chat_interaction_logs`.
  - Un usuario con rol `TEACHER` puede consultar y actualizar calificaciones únicamente de las secciones adscritas a su `campus_id`.
  - Un usuario con rol `ADMIN` posee visibilidad global sobre las 4 sedes regionales.
- **Restricciones de Integridad en Motor SQL:**
  - `chk_course_sections_quota_valid`: Garantiza a nivel de fila (`CHECK ("occupied_quota" >= 0 AND "occupied_quota" <= "max_quota")`) que jamás ocurra sobrecupo, incluso bajo ráfagas extremas de concurrencia.
  - `chk_grades_range_valid`: Garantiza que `cut1`, `cut2`, `cut3` y `final_grade` permanezcan estrictamente en el rango `[0.00, 5.00]`.

En Docker Compose, este script se monta automáticamente en `/docker-entrypoint-initdb.d/01-init-supabase-rls.sql`. En una instancia externa de Supabase Cloud, se ejecuta pegando su contenido en el **SQL Editor** o vía `psql`:

```bash
psql "$DIRECT_URL" -f packages/database/sql/init_supabase_rls.sql
```

### 5.2. Ejecución del Seed Institucional

El comando `npm run db:seed` ejecuta [`seed.ts`](file:///Users/javier/TrabajoFinalIngeSoftII/packages/database/prisma/seed.ts), el cual es **100% idempotente** y crea:
- **4 Sedes Regionales USCO:** Neiva (`NEI`), Pitalito (`PIT`), Garzón (`GAR`) y La Plata (`LPL`).
- **6 Usuarios Institucionales con contraseña `Usco2026*`:**
  - `alvaro.andrade@usco.edu.co` (`STUDENT`, Código `20221203806`, Sede Neiva).
  - `docente.software@usco.edu.co` (`TEACHER`, Ing. Carlos Eduardo Ramírez, Sede Neiva).
  - `admin@usco.edu.co` (`ADMIN`, Dra. María Fernanda Perdomo, Registro y Control Multi-Sede).
  - Estudiantes regionales en Pitalito, Garzón y La Plata.
- **6 Cursos de Ingeniería de Software y 9 Secciones Abiertas** para el periodo `2026-2`.
- **Certificados PDF pre-generados y verificados con firma `SHA-256`** en `apps/async-worker-service/public/certificates/`.

---

## 6. Ejecución de Suites de Pruebas y Auditoría de Calidad

El proyecto cuenta con **4 suites de validación automatizadas** ubicadas en `qa-audits/`:

```bash
# 1. Auditoría Automatizada de Seguridad OWASP Top 10:2021 (A01, A02, A03, A05, A07)
npm run test:security
# Reporte generado: qa-audits/security-owasp/owasp-audit-report.json

# 2. Auditoría Automatizada de Usabilidad (10 Heurísticas de Nielsen + WCAG 2.1 AA)
node qa-audits/usability-heuristics/run-usability-audit.mjs
# Reporte generado: qa-audits/usability-heuristics/usability-audit-report.json

# 3. Verificación Integral de los 5 Flujos de Aceptación End-to-End (E2E-01 a E2E-05)
node qa-audits/e2e-playwright/verify-e2e-flows.mjs
# Reporte generado: qa-audits/e2e-playwright/e2e-verification-report.json

# 4. Ejecución de Playwright E2E con Navegador Chromium Real (con el clúster activo)
npm run test:e2e

# 5. Pruebas de Carga, Estrés y Concurrencia ACID con Grafana k6
npm run test:k6
# Alternativa determinista en Node.js:
node qa-audits/performance-k6/run-benchmark-verification.mjs
```

---

## 7. Guía de Despliegue en Producción Cloud (Supabase + Upstash + Render / Railway)

Para llevar **EduDistribuida (USCO-Net)** a un entorno Cloud de alta disponibilidad con costo cero (Free Tier académico):

1. **Base de Datos Gestionada (Supabase Cloud):**
   - Crear un proyecto en [Supabase](https://supabase.com), copiar las cadenas `DATABASE_URL` (puerto `6543` con Supavisor Transaction Pooler) y `DIRECT_URL` (puerto `5432`).
   - Ejecutar `npm run db:push`, luego aplicar `packages/database/sql/init_supabase_rls.sql` en el SQL Editor de Supabase y finalmente ejecutar `npm run db:seed`.
   - Crear un bucket público llamado `academic-certificates` en **Supabase Storage**.
2. **Broker Redis Serverless (Upstash Redis):**
   - Crear una base de datos Redis gratuita en [Upstash](https://upstash.com) en la misma región que los contenedores (ej. `us-east-1`).
   - Configurar `REDIS_HOST`, `REDIS_PORT` y `REDIS_PASSWORD` en las variables de entorno de `core-academic-service` y `async-worker-service`.
3. **Microservicios y Portal Web (Railway o Render):**
   - Conectar el repositorio Git a **Railway** o **Render**.
   - Desplegar los 4 servicios apuntando a sus respectivos `Dockerfile`:
     - `apps/core-academic-service/Dockerfile`
     - `apps/async-worker-service/Dockerfile`
     - `apps/chatbot-ai-service/Dockerfile`
     - `apps/web-astro/Dockerfile`
   - Configurar las variables de entorno públicas de `web-astro` (`PUBLIC_CORE_API_URL`, `PUBLIC_WORKER_API_URL`, `PUBLIC_CHATBOT_API_URL`) con los dominios HTTPS asignados a cada microservicio.
