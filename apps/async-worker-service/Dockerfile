# ==============================================================================
# Stage 1: Builder (Monorepo Workspace + Prisma Client + Worker Compilation)
# ==============================================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar manifiestos del monorepo
COPY package.json package-lock.json* ./
COPY packages/database/package.json ./packages/database/
COPY apps/async-worker-service/package.json ./apps/async-worker-service/

# Instalar dependencias del workspace
RUN npm install

# Copiar código fuente de la capa de base de datos y del microservicio Worker
COPY packages/database ./packages/database
COPY apps/async-worker-service ./apps/async-worker-service

# Generar cliente Prisma y compilar @edudistribuida/database + @edudistribuida/async-worker-service
RUN npm run build --workspace=@edudistribuida/database && \
    npm run build --workspace=@edudistribuida/async-worker-service

# ==============================================================================
# Stage 2: Production Runner (BullMQ Consumer + PDFKit + QR Criptográfico)
# ==============================================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl curl

WORKDIR /app

ENV NODE_ENV=production
ENV WORKER_SERVICE_PORT=4002

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/async-worker-service/package.json ./apps/async-worker-service/package.json
COPY --from=builder /app/apps/async-worker-service/dist ./apps/async-worker-service/dist
COPY --from=builder /app/apps/async-worker-service/public ./apps/async-worker-service/public

RUN mkdir -p /app/apps/async-worker-service/public/certificates

EXPOSE 4002

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://localhost:4002/health || exit 1

CMD ["node", "apps/async-worker-service/dist/index.js"]
