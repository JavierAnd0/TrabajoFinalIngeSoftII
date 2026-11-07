# ==============================================================================
# Stage 1: Builder (Monorepo Workspace + Prisma Client + TypeScript Compilation)
# ==============================================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar manifiestos del monorepo
COPY package.json package-lock.json* ./
COPY packages/database/package.json ./packages/database/
COPY apps/core-academic-service/package.json ./apps/core-academic-service/

# Instalar dependencias del workspace
RUN npm install

# Copiar código fuente de la capa de base de datos y del microservicio Core
COPY packages/database ./packages/database
COPY apps/core-academic-service ./apps/core-academic-service

# Generar cliente Prisma y compilar @edudistribuida/database + @edudistribuida/core-academic-service
RUN npm run build --workspace=@edudistribuida/database && \
    npm run build --workspace=@edudistribuida/core-academic-service

# ==============================================================================
# Stage 2: Production Runner (Imagen ligera Alpine endurecida)
# ==============================================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl curl

WORKDIR /app

ENV NODE_ENV=production
ENV CORE_SERVICE_PORT=4001

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/core-academic-service/package.json ./apps/core-academic-service/package.json
COPY --from=builder /app/apps/core-academic-service/dist ./apps/core-academic-service/dist

EXPOSE 4001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://localhost:4001/health || exit 1

CMD ["sh", "-c", "npm run db:push --workspace=@edudistribuida/database && npm run db:seed --workspace=@edudistribuida/database && node apps/core-academic-service/dist/index.js"]
