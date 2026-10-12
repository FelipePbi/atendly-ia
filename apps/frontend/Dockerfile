# Contexto de build: raiz do repositório (precisa de packages/).
#   docker build -f apps/frontend/Dockerfile .
FROM node:24.13.0-bookworm-slim AS build

WORKDIR /repo
COPY packages ./packages
COPY apps/frontend/package.json apps/frontend/package-lock.json apps/frontend/.npmrc ./apps/frontend/

WORKDIR /repo/apps/frontend
RUN npm ci --no-audit --no-fund

COPY apps/frontend ./

# NEXT_PUBLIC_* e o rewrite de next.config.ts são resolvidos no `next build`.
# As páginas legais são estáticas: os AVENLY_* também entram no build.
ARG NEXT_PUBLIC_BFF_URL
ARG BFF_BASE_URL
ARG AVENLY_LEGAL_NAME=""
ARG AVENLY_TRADE_NAME=""
ARG AVENLY_CNPJ=""
ARG AVENLY_LEGAL_ADDRESS=""
ARG AVENLY_SUPPORT_EMAIL=""
ARG AVENLY_PRIVACY_EMAIL=""
ARG AVENLY_PRIVACY_OFFICER=""
ARG AVENLY_AI_PROVIDER=""
ARG AVENLY_HOSTING_PROVIDER=""
ARG AVENLY_ANALYTICS_PROVIDERS=""
ARG AVENLY_RETENTION_PERIOD=""
ARG AVENLY_APPLICABLE_FORUM=""
ARG AVENLY_LEGAL_REVIEW_APPROVED="false"
ARG AVENLY_LEGAL_INDEXABLE="false"
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_BFF_URL" || (echo "NEXT_PUBLIC_BFF_URL build arg is required" && exit 1)
RUN npm run build

FROM node:24.13.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001

COPY --from=build /repo/apps/frontend/package.json ./package.json
COPY --from=build /repo/apps/frontend/node_modules ./node_modules
COPY --from=build /repo/apps/frontend/.next ./.next
COPY --from=build /repo/apps/frontend/public ./public
COPY --from=build /repo/apps/frontend/next.config.ts ./next.config.ts

USER node
EXPOSE 3001

CMD ["npm", "start"]
