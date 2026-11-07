# ==============================================================================
# Stage 1: Builder (Astro 5 SSR + React 18 Islands + Tailwind CSS)
# ==============================================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copiar manifiestos del monorepo
COPY package.json package-lock.json* ./
COPY apps/web-astro/package.json ./apps/web-astro/

# Instalar dependencias del workspace
RUN npm install

# Copiar código fuente del portal web Astro SSR
COPY apps/web-astro ./apps/web-astro

# Argumentos de compilación para endpoints públicos
ARG PUBLIC_CORE_API_URL=http://localhost:4001/api/v1
ARG PUBLIC_WORKER_API_URL=http://localhost:4002
ARG PUBLIC_CHATBOT_API_URL=http://localhost:4003/api/v1/chat
ENV PUBLIC_CORE_API_URL=${PUBLIC_CORE_API_URL}
ENV PUBLIC_WORKER_API_URL=${PUBLIC_WORKER_API_URL}
ENV PUBLIC_CHATBOT_API_URL=${PUBLIC_CHATBOT_API_URL}
ENV ASTRO_TELEMETRY_DISABLED=1

# Compilar bundle SSR con adaptador @astrojs/node standalone
RUN npm run build --workspace=@edudistribuida/web-astro

# ==============================================================================
# Stage 2: Production Runner (Astro Node Standalone Server :4321)
# ==============================================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV ASTRO_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web-astro/package.json ./apps/web-astro/package.json
COPY --from=builder /app/apps/web-astro/dist ./apps/web-astro/dist

EXPOSE 4321

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://localhost:4321/login || exit 1

CMD ["node", "apps/web-astro/dist/server/entry.mjs"]
