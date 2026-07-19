# syntax=docker/dockerfile:1

# ---- deps: install dependencies only ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./

COPY apps/frontend/package.json ./apps/frontend/
COPY apps/ingestion-server/package.json ./apps/ingestion-server/
COPY apps/dashboard-server/package.json ./apps/dashboard-server/
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspaces --if-present

# ---- builder: compile the Next.js app ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w packages/shared --if-present
RUN npm run build -w apps/frontend

# ---- runner: minimal production image ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DASHBOARD_API_URL=http://localhost:4002

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# FIX: Copy the entire standalone folder to the root so Next.js preserves 
# the monorepo root node_modules and workspaces structure relative to server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./

# Copy public asset folders into their expected relative production locations
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public

USER nextjs
EXPOSE 3000

# FIX: Node needs to execute the server file inside its workspace context 
# where Next.js isolated the project packages.
CMD ["node", "apps/frontend/server.js"]