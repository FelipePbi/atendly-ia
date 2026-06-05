# Arquitetura Atual

Data da ultima atualizacao: 2026-06-05

## Visao geral

O workspace `/home/felip/atendimeto-ia` agora e um monorepo Git com os servicos em `apps/*`:

| App | Path | Stack | Papel |
| --- | --- | --- | --- |
| Frontend | `apps/frontend` | Next.js, React, TypeScript | UI e proxies `/api/*` para o BFF |
| BFF | `apps/bff` | Fastify, TypeScript, Prisma, JWT | Auth, sessao, onboarding, WhatsApp, inbox, configuracoes e webhook Evolution |
| API | `apps/api` | Fastify, TypeScript, Prisma | Motor de IA, handoff, agenda e rotas internas |
| Evolution Go | `apps/evolution-go` | Go, Gin, GORM | Gateway WhatsApp |
| Health worker | `apps/health-worker` | Node.js | Web service leve que monitora health checks |

## Fluxo alvo

```text
Browser
  -> Frontend Next.js
  -> BFF
     -> API
     -> Evolution Go
     -> PostgreSQL da plataforma
```

O frontend nao acessa mais Prisma, PostgreSQL, API Node, Evolution Go nem segredos server-side diretamente. As rotas `/api/*` do Next.js foram mantidas como superficie de compatibilidade e fazem proxy para o BFF.

O fluxo principal do WhatsApp permanece:

```text
WhatsApp
  -> Evolution Go
  -> API Node /webhooks/evolution
  -> API processa IA/agendamento
  -> Evolution Go /send/text
  -> WhatsApp
```

O fluxo legado do webhook de inbox agora fica encapsulado no BFF:

```text
Evolution Go
  -> BFF /api/webhooks/evolution-go
  -> Banco da plataforma
  -> API Node, quando houver dispatch/handoff/status de bot
```

## Variaveis por servico

### Frontend

- `NEXT_PUBLIC_BFF_URL`
- `BFF_BASE_URL`

### BFF

- `BFF_PORT`
- `BFF_PUBLIC_URL`
- `FRONTEND_ORIGIN`
- `JWT_SECRET`
- `DATABASE_URL`
- `API_BASE_URL`
- `API_EVOLUTION_WEBHOOK_TOKEN`
- `EVOLUTION_GO_BASE_URL`
- `EVOLUTION_GO_API_KEY`
- `EVOLUTION_WEBHOOK_SECRET`
- `INTERNAL_SERVICE_TOKEN`

### API

- `API_PORT`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `MINHA_AGENDA_*`
- `ADMIN_API_TOKEN`
- `INTERNAL_SERVICE_TOKEN`

### Evolution Go

- `SERVER_PORT`
- `POSTGRES_AUTH_DB`
- `POSTGRES_USERS_DB`
- `GLOBAL_API_KEY`

### Health worker

- `HEALTH_TARGETS`

## Bancos de dados

O BFF usa Prisma/PostgreSQL para autenticacao da plataforma, onboarding, configuracoes de IA/negocio, instancia WhatsApp e inbox.

A API usa Prisma/PostgreSQL para estado operacional do atendimento, mensagens processadas, chamadas de ferramentas, agendamentos externos e handoff humano.

O Evolution Go usa seus bancos de autenticacao e usuarios via `POSTGRES_AUTH_DB` e `POSTGRES_USERS_DB`.

## Deploy no Render

O `render.yaml` da raiz define:

- `atendly-ia-frontend`: web Node em `apps/frontend`.
- `atendly-ia-bff`: web Node em `apps/bff`.
- `atendly-ia-api`: web Node em `apps/api`.
- `atendly-ia-evolution-go`: web Docker em `apps/evolution-go`.
- `atendly-ia-health-worker`: web Node em `apps/health-worker`, com `/health` e polling interno.

O frontend builda apenas com `npm ci && npm run build`; nao ha migrate ou generate de Prisma nesse servico. Migrations Prisma ficam no BFF e na API.

URLs publicas atuais:

- Frontend: `https://atendly-ia-frontend.onrender.com`
- BFF: `https://atendly-ia-bff.onrender.com`
- API: `https://atendimeto-ia.onrender.com`
- Evolution Go: `https://evolution-go-4pmo.onrender.com`
- Health worker: `https://atendly-ia-health-worker.onrender.com/health`

## Validacoes

Comandos ja validados durante a migracao:

- `apps/api`: `npm run build`.
- `apps/frontend`: `npm run build`.
- `apps/health-worker`: `npm run check`.
- `apps/evolution-go`: `go test ./...`.
- `apps/bff`: `npm run build`.
- Raiz: `npm run build:all`.

## Pendencias conhecidas

- Validacao real de WhatsApp em producao dispensada por decisao explicita do usuario em 2026-06-05; ver `docs/qa/render-smoke-2026-06-05.md`.
- Endurecer CORS e tokens internos depois que os fluxos forem validados.
- Revisar `npm audit`: API tem 1 vulnerabilidade critica; frontend tem 2 moderadas; BFF tem 3 moderadas.

## Origem dos projetos importados

- `apps/api`: `https://github.com/FelipePbi/atendimeto-ia.git`, commit `cc14edb010d46b73565539d4a1a1bf030a7315f0`.
- `apps/evolution-go`: `git@github.com:FelipePbi/evolution-go.git`, commit `465b1747e91b470844343ca931c648909fea74ad`.
- `apps/health-worker`: `git@github.com:FelipePbi/atendimeto-ia-health-worker.git`, commit `7ac068ec55424dfee6b9cde398a91d494fe398ff`.
- `apps/frontend`: `git@github.com:FelipePbi/whatsapp-ai-inbox-frontend.git`, commit `1c77945bc9fe6409fa1ee8bdc9b5773fd1eb5c8b`.
