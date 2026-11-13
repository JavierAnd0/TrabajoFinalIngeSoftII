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

## 2. Mapa de entregables por fase

> Auditoría integral del 13 de noviembre de 2026: [`docs/00_Auditoria_Integral_Proyecto.md`](./docs/00_Auditoria_Integral_Proyecto.md) (cumplimiento del enunciado, hallazgos, correcciones y riesgos pendientes).

| Fase | Entregable | Ruta |
| :--- | :--- | :--- |
| **Fase 1** | Especificación C4 (niveles 1-3), secuencias, 5 ADR y actualización post-auditoría | [`docs/fase1-arquitectura/`](./docs/fase1-arquitectura/01_Especificacion_Arquitectura_C4_Hexagonal.md) |
| **Fase 2** | Núcleo: Core (`:4001`), Worker (`:4002`), portal Astro (`:4321`), Prisma, JWT, pagos y notificaciones, matriz de control de acceso | [`docs/fase2-plataforma-integrada/`](./docs/fase2-plataforma-integrada/02_Construccion_Nucleo_Plataforma.md), [`apps/`](./apps/), [`packages/database/`](./packages/database/) |
| **Fase 3** | Asistente académico híbrido (`:4003`) integrado en el panel del estudiante | [`docs/fase3-chatbot/`](./docs/fase3-chatbot/03_Automatizacion_Conversacional.md), [`apps/chatbot-ai-service/`](./apps/chatbot-ai-service/) |
| **Fase 4** | Informe de calidad v2.0 con mediciones reales: carga, OWASP de caja negra, heurísticas y axe-core | [`docs/fase4-informe-calidad/`](./docs/fase4-informe-calidad/04_Informe_Auditoria_Calidad_QA.md), [`qa-audits/`](./qa-audits/) |
| **Fase 5** | Docker Compose, E2E Playwright, manual técnico, manual de usuario, guion de defensa | [`docker-compose.yml`](./docker-compose.yml), [`docs/fase5-manuales-y-defensa/`](./docs/fase5-manuales-y-defensa/) |

### Resultados verificados contra el sistema en ejecución

| Prueba | Comando | Resultado |
| :--- | :--- | :--- |
| Aceptación E2E (5 flujos) | `npm run test:e2e` | 5/5 |
| OWASP Top 10 de caja negra (29 controles) | `npm run test:security` | 29/29 (línea base: 11/29) |
| Carga 10 → 50 → 100 usuarios | `npm run test:load` | 0 % errores · p95 15–177 ms |
| Accesibilidad WCAG 2.1 A/AA | `npm run test:a11y` | 0 violaciones (línea base: 42) |

---

## 3. Credenciales demo (contraseña común: `Usco2026*`)

| Rol | Correo | Alcance |
| :--- | :--- | :--- |
| **Estudiante** | `alvaro.andrade@usco.edu.co` | Su propio expediente (Cód. `20221203806`, sede Neiva) |
| **Docente** | `docente.software@usco.edu.co` | Sus grupos en Neiva |
| **Docente regional** | `docente.regional@usco.edu.co` | Sus grupos en Pitalito, Garzón y La Plata |
| **Administrador** | `admin@usco.edu.co` | Las 4 sedes |

---

## 4. Ejecución

Requisitos: Node 20.12+ (recomendado 22), PostgreSQL 16 y Redis 7 (o Docker).

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run db:generate && npm run db:push && npm run db:seed
```

En cuatro terminales:

```bash
npm run dev:core      # http://localhost:4001  (Swagger en /api/docs)
```

```bash
npm run dev:worker    # http://localhost:4002  (métricas en /metrics/queues)
```

```bash
npm run dev:chatbot   # http://localhost:4003  (Swagger en /api/docs)
```

```bash
npm run dev:web       # http://localhost:4321
```

Pruebas (con todo lo anterior en ejecución; la de seguridad al final, porque bloquea el login 60 s):

```bash
npm run test:e2e && npm run test:load && npm run test:a11y && npm run test:security
```

Con Docker (requiere definir `SUPABASE_JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` y `PAYMENT_WEBHOOK_SECRET` en `.env`, p. ej. con `openssl rand -hex 32`):

```bash
npm run docker:up
```
