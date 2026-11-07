# ==============================================================================
# Stage 1: Builder (Monorepo Workspace + Prisma Client + Chatbot Compilation)
# ==============================================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar manifiestos del monorepo
COPY package.json package-lock.json* ./
COPY packages/database/package.json ./packages/database/
COPY apps/chatbot-ai-service/package.json ./apps/chatbot-ai-service/

# Instalar dependencias del workspace
RUN npm install

# Copiar código fuente de la capa de base de datos y del microservicio Chatbot IA
COPY packages/database ./packages/database
COPY apps/chatbot-ai-service ./apps/chatbot-ai-service

# Generar cliente Prisma y compilar @edudistribuida/database + @edudistribuida/chatbot-ai-service
RUN npm run build --workspace=@edudistribuida/database && \
    npm run build --workspace=@edudistribuida/chatbot-ai-service

# ==============================================================================
# Stage 2: Production Runner (Strategy Pattern: Gemini/Groq + Motor Determinista)
# ==============================================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl curl

WORKDIR /app

ENV NODE_ENV=production
ENV CHATBOT_SERVICE_PORT=4003

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/chatbot-ai-service/package.json ./apps/chatbot-ai-service/package.json
COPY --from=builder /app/apps/chatbot-ai-service/dist ./apps/chatbot-ai-service/dist

EXPOSE 4003

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://localhost:4003/health || exit 1

CMD ["node", "apps/chatbot-ai-service/dist/index.js"]
