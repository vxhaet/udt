FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN pnpm --filter @udt/shared exec tsc
RUN pnpm --filter @udt/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@udt/web", "start"]
