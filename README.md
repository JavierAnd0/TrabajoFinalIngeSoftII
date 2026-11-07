# EduDistribuida / USCO-Net — Plataforma Distribuida de Gestión Académica Descentralizada Multi-Sede

**Proyecto Final — Ingeniería de Software II**  
**Universidad Surcolombiana (Sedes Neiva, Pitalito, Garzón y La Plata)**

---

## 1. Arquitectura General del Sistema

- **Paradigma Distribuido y Limpio:** Microservicios desacoplados bajo **Arquitectura Hexagonal (Puertos y Adaptadores)** con comunicación **Síncrona (REST / OpenAPI 3.0)** y **Asíncrona (Colas Redis / BullMQ)**.
- **Stack Tecnológico:**
  - **Frontend BFF / SSR (`:4321`):** Astro 5 SSR (`@astrojs/node`) + Islas React 18 + Nano Stores + Tailwind CSS (Accesibilidad WCAG 2.1 AA/AAA).
  - **Core Academic Service (`:4001`):** Node.js + TypeScript + Express + Prisma ORM + JWT / RBAC / Anti-IDOR + Swagger/OpenAPI 3.0.
  - **Async Worker Service (`:4002`):** Consumidor `BullMQ` sobre `Redis` + Generador de Certificados Oficiales en PDF (`PDFKit`) con Código QR y Firma Criptográfica `SHA-256` + `Supabase Storage`.
  - **Chatbot AI Service (`:4003`):** Arquitectura Hexagonal con Patrón **Strategy + Circuit Breaker** (`Gemini 2.5 Flash` / `Groq Llama 3.3 70B` con *Function Calling* + `DeterministicRuleEngineAdapter` de respaldo `< 5 ms`).
  - **Persistencia (`:5432` & `:6379`):** PostgreSQL / Supabase (10 modelos relacionales + Políticas RLS + Triggers) y Redis 7 AOF.

---

## 2. Mapa de Entregables por Fase (100% Completados)

| Fase | Entregable Oficial | Ruta en el Monorepo |
| :--- | :--- | :--- |
| **Fase 1** | Especificación de Arquitectura C4 (Niveles 1, 2, 3), Diagramas de Secuencia y 5 ADRs | [`docs/fase1-arquitectura/01_Especificacion_Arquitectura_C4_Hexagonal.md`](./docs/fase1-arquitectura/01_Especificacion_Arquitectura_C4_Hexagonal.md) |
| **Fase 2** | Esquema Prisma, DDL/RLS Supabase, Seed Multi-Sede, Core Service (`:4001`), Worker (`:4002`) y Web Astro SSR (`:4321`) | [`packages/database/`](./packages/database/), [`apps/core-academic-service/`](./apps/core-academic-service/), [`apps/async-worker-service/`](./apps/async-worker-service/), [`apps/web-astro/`](./apps/web-astro/) |
| **Fase 3** | Microservicio Conversacional Híbrido (`:4003`) y Widget Persistente Integrado | [`apps/chatbot-ai-service/`](./apps/chatbot-ai-service/), [`apps/web-astro/src/components/react/ChatbotWidget.tsx`](./apps/web-astro/src/components/react/ChatbotWidget.tsx) |
| **Fase 4** | Auditoría de Rendimiento (`k6` + 3 Gráficos PNG), Seguridad (`OWASP Top 10`) y Usabilidad (`Nielsen / WCAG`) | [`docs/fase4-informe-calidad/04_Informe_Auditoria_Calidad_QA.md`](./docs/fase4-informe-calidad/04_Informe_Auditoria_Calidad_QA.md), [`qa-audits/`](./qa-audits/) |
| **Fase 5** | Contenerización Docker Compose, Suite E2E Playwright, Manual Técnico, Manual de Usuario y Defensa Final | [`docker-compose.yml`](./docker-compose.yml), [`qa-audits/e2e-playwright/`](./qa-audits/e2e-playwright/), [`docs/fase5-manuales-y-defensa/`](./docs/fase5-manuales-y-defensa/) |

---

## 3. Credenciales Institucionales Demo (Contraseña común: `Usco2026*`)

| Rol | Correo Institucional | Código / Documento | Sede |
| :--- | :--- | :--- | :--- |
| **Estudiante** | `alvaro.andrade@usco.edu.co` | Cód: `20221203806` / Doc: `1075289412` | Sede Central Neiva (`NEI`) |
| **Docente** | `docente.software@usco.edu.co` | Doc: `1075210200` | Sede Central Neiva (`NEI`) |
| **Administrador Multi-Sede** | `admin@usco.edu.co` | Doc: `1075200100` | Multi-Sede (`NEI`, `PIT`, `GAR`, `LPL`) |

---

## 4. Comandos Rápidos de Ejecución y Verificación

```bash
# 1. Generar cliente Prisma, sincronizar esquema y poblar las 4 sedes en PostgreSQL
npm run db:generate
npm run db:push
npm run db:seed

# 2. Compilar todos los paquetes y microservicios del monorepo
npm run build:all

# 3. Levantar los servicios en desarrollo
npm run dev:core     # http://localhost:4001 (Swagger en /api/docs)
npm run dev:worker   # http://localhost:4002 (Métricas en /metrics/queues)
npm run dev:chatbot  # http://localhost:4003 (Swagger en /api/docs)
npm run dev:web      # http://localhost:4321 (Frontend Astro SSR)

# 4. Ejecutar las suites de auditoría QA, OWASP Top 10, Rendimiento y E2E
npm run test:security
node qa-audits/performance-k6/run-benchmark-and-charts.mjs
node qa-audits/usability-heuristics/run-usability-audit.mjs
node qa-audits/e2e-playwright/verify-e2e-flows.mjs

# 5. Despliegue contenerizado completo con Docker Compose (6 contenedores)
npm run docker:up
```
