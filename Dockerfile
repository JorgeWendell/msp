# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- Dependências ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build do Next.js ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Schema (drizzle-kit push) ---
FROM base AS migrator
RUN apk add --no-cache postgresql-client
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json drizzle.config.ts ./
COPY src/db ./src/db
COPY scripts/docker-migrate.sh scripts/docker-migrate.mjs ./scripts/
RUN sed -i 's/\r$//' ./scripts/docker-migrate.sh \
  && chmod +x ./scripts/docker-migrate.sh
CMD ["./scripts/docker-migrate.sh"]

# --- Produção ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/private/mesh \
  && chown -R nextjs:nodejs /app/private

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
