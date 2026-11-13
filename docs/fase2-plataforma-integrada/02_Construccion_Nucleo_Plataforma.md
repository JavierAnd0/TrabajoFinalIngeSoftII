# 02. Construcción del núcleo: plataforma integrada

**Fase 2 del enunciado:** desarrollo del backend e integración de los módulos principales: patrones de diseño limpios, persistencia con ORM, manejo seguro de sesiones (JWT) e integración de servicios externos (pagos y notificaciones).
**Entregables:** repositorio con el MVP funcional, documentación de API (Swagger/OpenAPI) y scripts de base de datos.
**Estado:** entregado y verificado contra el sistema en ejecución (auditoría del 13 de noviembre de 2026).

---

## 1. Qué se construyó

| Paquete | Puerto | Responsabilidad |
| :--- | :-: | :--- |
| `apps/core-academic-service` | 4001 | Autenticación, expediente, matrícula, notas, certificados (productor de la cola), pagos |
| `apps/async-worker-service` | 4002 | Consumidor BullMQ: genera el PDF del certificado (PDFKit + QR + firma SHA-256) y notificaciones |
| `apps/web-astro` | 4321 | Portal SSR (Astro 5) con islas React por rol |
| `packages/database` | — | Esquema Prisma, cliente singleton, seed multi-sede, utilidades de nota y firma |

### 1.1. Patrones aplicados

- **Arquitectura hexagonal (puertos y adaptadores).** El dominio (`src/domain`) no importa Express, Prisma ni BullMQ; la CI lo verifica con un `grep` sobre las importaciones.
- **Casos de uso** como servicios de aplicación (`AuthenticateUser`, `EnrollStudentInSection`, `UpdateStudentGrades`, `RequestCertificateAsync`, `GetStudentAcademicSummary`, `GetCampusDistributedMetrics`).
- **Servicios de dominio puros** con las reglas del negocio: `GradeDomainService` (30 % / 30 % / 40 %, nota mínima 3.0, nota requerida en el corte 3) y `EnrollmentDomainService` (sede activa, doble matrícula, cupo y tope de 21 créditos).
- **Repositorio** (`PrismaAcademicRepository`, `PrismaUserRepository`) detrás de interfaces de salida.
- **Productor-consumidor** con BullMQ sobre Redis para el trabajo pesado (PDF).
- **Singleton** del `PrismaClient` compartido para no agotar conexiones.

## 2. Persistencia con ORM

- **Prisma 5 + PostgreSQL 16** (compatible con Supabase). 10 modelos: `Campus`, `User`, `AcademicProgram`, `AcademicPeriod`, `Course`, `CourseSection`, `Enrollment`, `Grade`, `CertificateJob`, `ChatInteractionLog`.
- La matrícula se registra en una **transacción** (`prisma.$transaction`) que crea la matrícula y aumenta el cupo ocupado de forma atómica.
- **Scripts de base de datos:** `packages/database/prisma/schema.prisma`, `prisma/seed.ts` (4 sedes, 6 asignaturas, 2 docentes, 4 estudiantes, 1 administrador) y `sql/init_supabase_rls.sql` (políticas RLS para Supabase).

```bash
npm run db:generate   # cliente tipado de Prisma
npm run db:push       # sincroniza el esquema (lee el .env de la raíz)
npm run db:seed       # datos de las 4 sedes
```

> **Nota de la auditoría.** Las políticas RLS no se aplican en `db:push` y Prisma se conecta con un superusuario que las ignora. El aislamiento entre usuarios está garantizado por la capa de aplicación (tabla de la §4). Ver la recomendación 2 del informe `docs/00_Auditoria_Integral_Proyecto.md`.

## 3. Sesiones seguras con JWT

1. `POST /api/v1/auth/login` valida el correo y la contraseña (bcrypt) y emite un JWT **HS256** con `iss`, `aud` y expiración de 8 horas. Los intentos fallidos están limitados a 8 por minuto por IP.
2. Cada servicio verifica la firma **fijando el algoritmo, el emisor y la audiencia** (rechaza `alg: none` y tokens firmados con otro secreto).
3. El portal Astro verifica la firma del token en su middleware antes de renderizar cualquier panel; la identidad del usuario sale solo de los *claims* firmados.
4. En producción ningún servicio arranca si `SUPABASE_JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` o `PAYMENT_WEBHOOK_SECRET` faltan o conservan el valor de ejemplo.

## 4. Matriz de control de acceso del Core (:4001)

| Endpoint | Sin token | STUDENT | TEACHER | ADMIN |
| :--- | :-: | :-: | :-: | :-: |
| `POST /auth/login` | ✅ | — | — | — |
| `GET /auth/me` | 401 | ✅ | ✅ | ✅ |
| `GET /campuses`, `GET /sections` | ✅ (oferta pública) | ✅ | ✅ | ✅ |
| `GET /students/:id/summary` | 401 | solo el propio (403) | ✅ | ✅ |
| `POST /enrollments` | 401 | solo para sí mismo (403) | ✅ | ✅ |
| `PUT /grades` | 401 | 403 | solo sus grupos (403) | ✅ |
| `GET /admin/enrollments` | 401 | 403 | solo sus grupos | 4 sedes |
| `POST /certificates/request` | 401 | solo los propios (403) | ✅ | ✅ |
| `GET /certificates/student/:id` | 401 | solo los propios (403) | ✅ | ✅ |
| `GET /certificates/:jobId` | 401 | solo los propios (404) | ✅ | ✅ |
| `GET /certificates/download/:code` | ✅ (verificación por QR) | ✅ | ✅ | ✅ |
| `POST /payments/webhook` | firma HMAC obligatoria | | | |

**Llamadas entre servicios** (chatbot → core, core → worker): header `x-internal-service-token` con el secreto compartido, comparado en tiempo constante.

## 5. Integración con servicios externos

| Integración | Mecanismo | Seguridad |
| :--- | :--- | :--- |
| **Pasarela de pagos** | `POST /api/v1/payments/webhook` con `{ paymentReference, status }` actualiza el estado financiero de la matrícula | Firma HMAC-SHA256 del cuerpo en `x-webhook-signature` |
| **Notificaciones** | El core publica `GRADES_UPDATED` y eventos de matrícula en la cola `notification-queue`; el worker los registra (adaptador sustituible por correo/SMS) | Cola interna en Redis; respaldo HTTP con token interno |
| **Almacenamiento de PDF** | `SupabaseStorageAdapter` (o disco local en desarrollo) | Nombres de archivo validados (UUID o `USCO-AAAA-XXXX`) |

Ejemplo de firma del webhook:

```bash
BODY='{"paymentReference":"PAG-USCO-2026-001","status":"PAID"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PAYMENT_WEBHOOK_SECRET" -hex | cut -d' ' -f2)
curl -X POST localhost:4001/api/v1/payments/webhook -H "content-type: application/json" -H "x-webhook-signature: $SIG" -d "$BODY"
```

## 6. Documentación de la API

- Core: `http://localhost:4001/api/docs` (JSON en `/api/docs.json`).
- Chatbot: `http://localhost:4003/api/docs`.
- El OpenAPI declara `BearerAuth` en los endpoints protegidos y `WebhookSignature` en el webhook.

## 7. Verificación

| Prueba | Comando | Resultado |
| :--- | :--- | :--- |
| Control de acceso y entradas maliciosas (29 controles) | `npm run test:security` | 29/29 |
| Flujos de matrícula, notas y certificados en el navegador | `npm run test:e2e` | 5/5 |
| Compilación estricta de los 5 paquetes | `npm run build:all` | sin errores |
