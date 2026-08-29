# Atendly

## O produto

Atendly é um SaaS multi-tenant de atendimento via WhatsApp e agendamento assistido por IA para profissionais autônomos e pequenos negócios.

Objetivo: transformar conversas do WhatsApp em agendamentos reais e válidos, reduzindo trabalho manual. O produto não é apenas um chatbot.

Este repositório é público. Não publique secrets, credenciais, dados pessoais ou payloads reais.

## Estado atual do repositório

O monorepo está em transição arquitetural.

- Frontend novo já foi reconstruído a partir do Open Design e é base visual aprovada.
- Frontend ainda usa services e dados mockados; não está integrado ao BFF.
- BFF e API mantêm responsabilidades legadas que serão separadas por goals sequenciais.
- Fundação multi-tenant do BFF e Scheduling Service estão implementados. Agenda Atendly e Minha Agenda operam atrás do mesmo `CalendarProvider`; dados operacionais restantes ainda migram por goals. AI Orchestrator separado, LangChain, LangGraph e RAG ainda não existem.

## Apps

| App                | Path                        | Estado atual                                                                                        |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Frontend           | `apps/frontend`             | Next.js 16, React 19, TypeScript e CSS próprio; UI nova com mocks                                   |
| Open Design        | `apps/frontend-open-design` | Contrato visual estático; referência, não serviço de produção                                       |
| BFF                | `apps/bff`                  | Fastify, TypeScript, Prisma/PostgreSQL, cookie/JWT; backend web transitório                         |
| API                | `apps/api`                  | Fastify, TypeScript, Prisma/PostgreSQL; AI orchestration transitória e client do Scheduling Service |
| Scheduling Service | `apps/scheduling-service`   | Fastify, TypeScript, Prisma/PostgreSQL; domínio canônico e providers Atendly/Minha Agenda           |
| Evolution Go       | `apps/evolution-go`         | Provedor/transporte WhatsApp em Go                                                                  |
| Health worker      | `apps/health-worker`        | Serviço Node de monitoramento de saúde                                                              |

`packages/legal-contract` é o único package compartilhado atual.

## Arquitetura atual

Frontend atual é uma superfície funcional baseada em mocks:

```text
Browser → apps/frontend → Mock*Service
```

Backend legado continua operacional em paralelo:

```text
Evolution Go → BFF → apps/api → Evolution Go
                    ↘ Scheduling Service → Minha Agenda
```

BFF também expõe auth/session, onboarding, settings, WhatsApp e inbox atuais. Esta descrição é `CURRENT`, não ownership final.

## Arquitetura alvo

`TARGET` após migração incremental:

```text
Frontend
   │
   ▼
BFF
   ├──────────────► AI Orchestrator
   ├──────────────► Scheduling Service
   └──────────────► Evolution Go
```

Fluxo inbound alvo:

```text
WhatsApp → Evolution Go → AI Orchestrator
                              │
                              └─→ Scheduling Service, quando necessário
                              │
WhatsApp ← Evolution Go ←─────┘
```

Frontend falará exclusivamente com BFF. `scheduling-service` já existe; `ai-orchestrator` separado entra em goal posterior.

## Plano de migração

Migração possui 18 goals estritamente sequenciais. Estado inicial: todos `NOT_STARTED`; próximo trabalho é GOAL 01.

Consulte [docs/ROADMAP_INTEGRACAO_V1.md](docs/ROADMAP_INTEGRACAO_V1.md). Não avance goal futuro sem solicitação explícita.

## Fontes de verdade

Produto:

1. [docs/CONTEXTO_PRODUTO_ATENDLY.md](docs/CONTEXTO_PRODUTO_ATENDLY.md)
2. [docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md](docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md)

Frontend/design:

1. [apps/frontend-open-design/DESIGN-HANDOFF.md](apps/frontend-open-design/DESIGN-HANDOFF.md)
2. [apps/frontend-open-design/DESIGN-MANIFEST.json](apps/frontend-open-design/DESIGN-MANIFEST.json)
3. HTML/CSS/JS da tela em `apps/frontend-open-design`
4. [docs/DESIGN.md](docs/DESIGN.md)
5. Implementação em `apps/frontend`

Regras de trabalho: [AGENTS.md](AGENTS.md).

## Setup local

Requisito comum: Node.js 20 ou superior. Evolution Go possui toolchain próprio descrito no README do app.

Instale dependências dos apps Node usando lockfiles existentes, a partir da raiz:

```bash
npm --prefix apps/frontend ci
npm --prefix apps/bff ci
npm --prefix apps/api ci
npm --prefix apps/health-worker ci
```

Copie o `.env.example` de cada app necessário para `.env` e preencha somente valores locais. Para apps com Prisma:

```bash
npm --prefix apps/bff run prisma:generate
npm --prefix apps/api run prisma:generate
```

Da raiz, após instalar dependências, rode em terminais separados:

```bash
npm run dev:frontend
npm run dev:bff
npm run dev:api
```

Portas padrão: frontend `3001`, BFF `3002`, API `3000`, Evolution Go `8080`.

## Validações

Scripts disponíveis na raiz:

```bash
npm run build:frontend
npm run build:bff
npm run build:api
npm run build:all
npm run check:health-worker
npm run test:evolution-go
```

Checks adicionais por app estão nos respectivos `package.json` e READMEs. Nem todos os apps possuem hoje `lint`, `typecheck` e `format:check`; padronização pertence ao GOAL 02.

## Deploy

`render.yaml` define deploy `CURRENT` de cinco web services:

- `atendly-ia-frontend` — Node, `apps/frontend`;
- `atendly-ia-bff` — Node, `apps/bff`;
- `atendly-ia-api` — Node, `apps/api`;
- `atendly-ia-evolution-go` — Docker, `apps/evolution-go`;
- `atendly-ia-health-worker` — Node, `apps/health-worker`.

Não há serviços Render separados para AI Orchestrator ou Scheduling Service. Mudanças de deploy pertencem aos goals posteriores.

## Documentação

- [docs/README.md](docs/README.md) — índice documental.
- [apps/frontend/README.md](apps/frontend/README.md) — frontend atual.
- [apps/bff/README.md](apps/bff/README.md) — BFF atual e alvo.
- [apps/api/README.md](apps/api/README.md) — aplicação transitória.
- [apps/evolution-go/README.md](apps/evolution-go/README.md) — provedor WhatsApp.
- [apps/health-worker/README.md](apps/health-worker/README.md) — monitor de saúde.
