# 📋 Pull Request — EduDistribuida / USCO-Net

## 1. Resumen del Cambio (Resumen Ejecutivo)
<!-- Describe brevemente qué problema resuelve este PR, qué historia de usuario o requerimiento funcional/no funcional cubre (ej. RF-01..RF-12, RNF-01..RNF-08). -->

- **Módulo / Paquete Afectado:**
  - [ ] `@edudistribuida/database` (`packages/database`)
  - [ ] `@edudistribuida/core-academic-service` (`apps/core-academic-service` — Puerto `:4001`)
  - [ ] `@edudistribuida/async-worker-service` (`apps/async-worker-service` — Puerto `:4002`)
  - [ ] `@edudistribuida/chatbot-ai-service` (`apps/chatbot-ai-service` — Puerto `:4003`)
  - [ ] `@edudistribuida/web-astro` (`apps/web-astro` — Puerto `:4321`)
  - [ ] `qa-audits/` o Documentación (`docs/`)

---

## 2. Checklist de Arquitectura Hexagonal (Ports & Adapters)
- [ ] **Pureza de Dominio (`src/domain/`)**: Las entidades, Value Objects, errores de dominio y puertos (`ports/`) **NO importan** `express`, `@prisma/client`, `bullmq`, `@supabase/*` ni librerías de infraestructura.
- [ ] **Capa de Aplicación (`src/application/use-cases/`)**: Los Casos de Uso dependen exclusivamente de interfaces de puertos (`IAcademicRepositoryPort`, `ICertificateQueuePort`, `IConversationalEnginePort`, etc.) mediante Inyección de Dependencias.
- [ ] **Adaptadores de Infraestructura (`src/infrastructure/`)**: Toda comunicación HTTP, persistencia Prisma, colas Redis/BullMQ o proveedores LLM está encapsulada en adaptadores concretos.

---

## 3. Checklist de Seguridad (OWASP Top 10) e Higiene Git
- [ ] **Cero Secretos Expuestos**: No se incluyen archivos `.env`, credenciales de base de datos ni API Keys reales en el commit (`git status` y `.gitignore` verificados).
- [ ] **Control de Acceso (A01)**: Los endpoints protegidos verifican JWT (`jwtAuthMiddleware`), rol (`rbacMiddleware`) y propiedad del recurso (`studentIdorGuardMiddleware`).
- [ ] **Validación de Entradas (A03 / A08)**: Todos los payloads de entrada se validan con esquemas estrictos de `zod` y el middleware anti-Prototype Pollution (`payloadSanitizationMiddleware`).

---

## 4. Verificación Automatizada de Calidad (CI Quality Gate)
Confirmo que antes de abrir este Pull Request he ejecutado exitosamente:

```bash
npm run db:generate
npm run build:all
npm run test:security
node qa-audits/usability-heuristics/run-usability-audit.mjs
node qa-audits/e2e-playwright/verify-e2e-flows.mjs
```

- [ ] Compilación TypeScript estricta (`npm run build:all`) sin errores (`0 errors`) y sin `TODO`/`FIXME` pendientes.
- [ ] Suite OWASP Top 10 (`npm run test:security`) en estado **PASS (10/10)**.
- [ ] Suite de Usabilidad y WCAG 2.1 AA en estado **PASS (98.4% / AAA)**.
- [ ] Suite End-to-End (`E2E-01` a `E2E-05`) en estado **PASS (20/20 aserciones)**.
