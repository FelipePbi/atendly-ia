# atendly-ia

Monorepo privado da plataforma Atendly IA.

## Apps

| App | Path | Stack | Comandos principais |
| --- | --- | --- | --- |
| Frontend | `apps/frontend` | Next.js, React, TypeScript | `npm run dev`, `npm run build`, `npm run start` |
| BFF | `apps/bff` | Fastify, TypeScript, Prisma, JWT | `npm run dev`, `npm run build`, `npm run start` |
| API | `apps/api` | Fastify, TypeScript, Prisma | `npm run dev`, `npm run build`, `npm start` |
| Evolution Go | `apps/evolution-go` | Go, Gin, GORM | `make dev`, `make build`, `go test ./...` |
| Health worker | `apps/health-worker` | Node.js web worker | `npm start`, `npm run check` |

## Arquitetura alvo

```text
Browser / Frontend
  -> BFF
     -> API
     -> Evolution Go
```

O fluxo critico do WhatsApp permanece fora do BFF nesta fase:

```text
WhatsApp -> Evolution Go -> API -> Evolution Go -> WhatsApp
```

## Setup local

1. Copie `.env.example` para os `.env` de cada app conforme necessario.
2. Instale dependencias por app:

```bash
cd apps/api && npm ci
cd ../frontend && npm ci
cd ../bff && npm ci
```

3. Gere clients Prisma quando aplicavel:

```bash
cd apps/api && npm run prisma:generate
cd ../bff && npm run prisma:generate
```

4. Rode os servicos:

```bash
npm run dev:api
npm run dev:bff
npm run dev:frontend
```

## Validacoes ja executadas

- `apps/api`: `npm run build`.
- `apps/frontend`: `npm run build`.
- `apps/health-worker`: `npm run check`.
- `apps/evolution-go`: `go test ./...`.
- `apps/bff`: `npm run build`.

## Pendencias conhecidas

- Validacao real de WhatsApp em producao dispensada por decisao explicita do usuario em 2026-06-05; ver `docs/qa/render-smoke-2026-06-05.md`.
- Endurecer API/Evolution Go com token interno apos validar staging.
- Revisar `npm audit`: API tem 1 vulnerabilidade critica; frontend tem 2 moderadas; BFF tem 3 moderadas.

## URLs publicas no Render

- Frontend: `https://atendly-ia-frontend.onrender.com`
- BFF: `https://atendly-ia-bff.onrender.com`
- API: `https://atendimeto-ia.onrender.com`
- Evolution Go: `https://evolution-go-4pmo.onrender.com`
- Health worker: `https://atendly-ia-health-worker.onrender.com/health`.

## Origem dos projetos importados

A migracao inicial foi feita por copia simples, preservando os repositorios antigos no workspace local e documentando a origem:

- `apps/api`: `https://github.com/FelipePbi/atendimeto-ia.git`, commit `cc14edb010d46b73565539d4a1a1bf030a7315f0`.
- `apps/evolution-go`: `git@github.com:FelipePbi/evolution-go.git`, commit `465b1747e91b470844343ca931c648909fea74ad`.
- `apps/health-worker`: `git@github.com:FelipePbi/atendimeto-ia-health-worker.git`, commit `7ac068ec55424dfee6b9cde398a91d494fe398ff`.
- `apps/frontend`: `git@github.com:FelipePbi/whatsapp-ai-inbox-frontend.git`, commit `1c77945bc9fe6409fa1ee8bdc9b5773fd1eb5c8b`.
