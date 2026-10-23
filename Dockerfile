# syntax=docker/dockerfile:1

FROM oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts: better-sqlite3 ships prebuilds for every platform in the
# tarball and has no install script; without this, bun attempts a node-gyp
# build it does not need (and cannot do without a toolchain).
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build

FROM oven/bun:1.4.2 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.2-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/frist.db \
    MIGRATIONS_PATH=/app/drizzle

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/serve.ts ./serve.ts
COPY package.json ./

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT ?? '3000') + '/api/health'); if (!r.ok) process.exit(1)"

CMD ["bun", "serve.ts"]
