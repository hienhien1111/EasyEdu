# ─────────────────────────────────────────────
# Stage 1: deps — install dependencies
# Build context: monorepo root (.)
# ─────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only the web app's manifests
# package-lock.json lives inside apps/web (not monorepo root)
COPY apps/web/package.json       ./package.json
COPY apps/web/package-lock.json  ./package-lock.json

RUN npm ci

# ─────────────────────────────────────────────
# Stage 2: builder — build Next.js app
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy the full web app source
COPY apps/web .

# NEXT_PUBLIC_* vars are baked in at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─────────────────────────────────────────────
# Stage 3: runner — minimal production image
# Uses Next.js standalone output (output: "standalone" in next.config.ts)
# ─────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone output bundles everything needed; only copy what's required
COPY --from=builder /app/public                         ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
