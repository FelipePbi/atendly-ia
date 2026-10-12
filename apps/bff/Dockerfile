# Contexto de build: raiz do repositório (precisa de packages/).
#   docker build -f apps/bff/Dockerfile .
FROM node:24.13.0-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY packages ./packages
COPY apps/bff/package.json apps/bff/package-lock.json apps/bff/.npmrc ./apps/bff/

WORKDIR /repo/apps/bff
RUN npm ci --no-audit --no-fund

COPY apps/bff ./
RUN npm run build

FROM node:24.13.0-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002

COPY --from=build /repo/apps/bff/package.json ./package.json
COPY --from=build /repo/apps/bff/node_modules ./node_modules
COPY --from=build /repo/apps/bff/dist ./dist
COPY --from=build /repo/apps/bff/prisma ./prisma
COPY --from=build /repo/apps/bff/prisma.config.ts ./prisma.config.ts

USER node
EXPOSE 3002

# Migração antes de subir: prisma migrate deploy é idempotente.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
