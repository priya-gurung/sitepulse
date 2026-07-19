# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# ---- deps: stage ----
FROM base AS deps
# Copy the root configs
COPY package.json package-lock.json* ./

# CRITICAL: Copy ALL workspace descriptors together so npm can build the topology graph smoothly
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/ingestion-server/package.json ./apps/ingestion-server/
COPY apps/dashboard-server/package.json ./apps/dashboard-server/
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/

# Install the complete monorepo workspace dependencies tree
RUN npm install --workspaces --if-present

# ---- build: stage ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate prisma schema mappings
RUN npm run prisma:generate

# Build shared bindings BEFORE the application workspace
RUN npm run build -w packages/shared --if-present
RUN npm run build -w apps/dashboard-server

# ---- runner: stage ----
FROM base AS runner
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/dashboard-server/dist ./apps/dashboard-server/dist
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 4002
CMD ["npx", "tsx", "apps/dashboard-server/src/server.js"]