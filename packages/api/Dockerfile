# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Workspace config + lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./

# Package.json de chaque workspace member nécessaire
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json

# Install all deps (workspace links need all package.json present)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/db/ packages/db/
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

# Generate Prisma client
RUN pnpm --filter @udt/db exec prisma generate

# Build db + shared + api
RUN pnpm --filter @udt/db add -D @types/node
RUN pnpm --filter @udt/db exec tsc
RUN pnpm --filter @udt/shared exec tsc
RUN pnpm --filter @udt/api exec tsc --skipLibCheck --noEmit false

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json

RUN pnpm install --frozen-lockfile --prod

# Prisma client + schema (needed at runtime)
COPY --from=build /app/packages/db/prisma packages/db/prisma
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/node_modules/.pnpm node_modules/.pnpm

# Compiled output
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/api/dist packages/api/dist

# Workspace symlinks (pnpm links @udt/* → packages/*)
COPY --from=build /app/node_modules/@udt node_modules/@udt

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "packages/api/dist/index.js"]
