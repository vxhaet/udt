FROM node:20-alpine
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --frozen-lockfile
COPY packages/db/ packages/db/
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/
RUN pnpm --filter @udt/db exec prisma generate
RUN pnpm --filter @udt/db add -D @types/node
RUN pnpm --filter @udt/db exec tsc
RUN pnpm --filter @udt/shared exec tsc
RUN pnpm --filter @udt/api exec tsc --skipLibCheck --noEmit false
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]
