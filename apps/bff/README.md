# Atendly BFF

## Purpose

Backend público da aplicação web Atendly. Estado atual é transitório: atende contratos legados enquanto arquitetura multi-tenant e serviços de domínio ainda não foram extraídos.

## Current responsibilities

`CURRENT`:

- cadastro, login, logout, sessão por cookie e troca de senha;
- aceite versionado de Termos de Uso e Política de Privacidade;
- onboarding e perfil;
- business settings, configurações da atendente e automação;
- lifecycle da instância WhatsApp, QR/pairing e contatos;
- webhook Evolution Go legado, preservado durante a transição;
- inbox, mensagens, pausa/retomada da IA e contatos ignorados;
- persistência dessas responsabilidades no PostgreSQL próprio;
- chamadas internas para o AI Orchestrator e chamadas ao Evolution Go.

Frontend novo ainda não consome estes endpoints.

## Transitional responsibilities

Conversation, Message, handoff, persona e partes de execução da IA ainda aparecem no BFF atual. Elas não representam ownership alvo.

Não remova responsabilidades transitórias até goal explícito substituir contratos e consumidores. Schemas atuais também contêm conceitos legados que não devem ser propagados para V1.

## Target responsibilities

`TARGET`:

- auth e session;
- tenant resolution;
- legal acceptance;
- business/account profile;
- API exclusiva do frontend;
- response aggregation;
- clients de serviços internos;
- lifecycle/configuração WhatsApp.

Ao criar ou reconectar uma instância, o BFF provisiona `ChannelConnection`, sincroniza a configuração tenant-aware da IA e aponta o webhook de mensagens para o AI Orchestrator.

BFF não será owner de Conversation, Message, Handoff, Appointment, Availability, scheduling, RAG ou LLM orchestration.

## Stack

- Node.js 20+;
- Fastify 5;
- TypeScript strict;
- Zod;
- Prisma 7 + PostgreSQL;
- cookie de sessão com JWT via `jose`;
- bcrypt;
- CORS e rate limiting;
- Vitest existente.

## Architecture

`CURRENT`:

```text
web client (legado) → BFF → PostgreSQL do BFF
                       ├─→ AI Orchestrator
                       └─→ Evolution Go

Evolution Go → AI Orchestrator
```

`TARGET`:

```text
Frontend → BFF → explicit service clients
                   ├─ AI Orchestrator
                   ├─ Scheduling Service
                   └─ Evolution Go
```

Clients internos são introduzidos conforme consumidores reais; o client do AI Orchestrator já participa da transição inbound.

## Database

Prisma schema: `prisma/schema.prisma`. Fundação multi-tenant contém `Tenant`, `TenantMember` e `BusinessProfile`. Cadastro cria `User`, tenant, membership `OWNER`, perfil inicial e aceite legal na mesma transação. Migration do GOAL 03 cria um tenant determinístico para cada usuário legado ainda sem membership.

Conversation, Message, WhatsApp e demais responsabilidades transitórias continuam user-scoped enquanto seus consumidores legados existem. Não representam ownership final nem devem orientar novos recursos de negócio.

No alvo, BFF acessa somente tabelas do próprio domínio. Nunca compartilhe Prisma nem consulte DB de Scheduling Service ou AI Orchestrator.

## Auth/session

- Cookie padrão: `atendly_session`;
- JWT configurado por `JWT_SECRET` e `JWT_EXPIRES_IN`;
- produção rejeita secret default/fraco;
- rotas de domínio usam usuário autenticado atual.

Fluxo tenant atual no BFF:

```text
session → TenantMember → TenantContext
```

JWT continua contendo `userId`. Rotas autenticadas resolvem `TenantContext` server-side; `GET /auth/me` retorna tenant e `BusinessProfile`. Nunca autorize por `tenantId` arbitrário recebido do browser.

## Current routes

Saúde:

- `GET /health`
- `GET /health/dependencies`

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/change-password`

Onboarding/settings:

- `GET /onboarding`
- `PATCH /onboarding/profile`
- `POST /onboarding/complete`
- `GET|PATCH /business-settings`
- `GET|PATCH /virtual-attendant/settings`
- `GET /virtual-attendant/prompt-preview`
- `POST /virtual-attendant/persona/import`
- `GET /virtual-attendant/persona/imports`
- `POST /virtual-attendant/persona/generate`
- `GET|PATCH /automation/ai`

WhatsApp/inbox:

- `POST /webhooks/evolution-go`
- `GET /whatsapp/status`
- `POST|DELETE /whatsapp/instance`
- `POST /whatsapp/connect`
- `GET /whatsapp/qr`
- `POST /whatsapp/pair`
- `POST /whatsapp/logout`
- `GET /whatsapp/contacts`
- `GET|POST /ignored-contacts`
- `POST /ignored-contacts/bulk`
- `DELETE /ignored-contacts/:id`
- `GET /conversations`
- `POST /conversations/consolidate`
- `GET /conversations/:id/messages`
- `PATCH /conversations/:id`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/ai/pause`
- `POST /conversations/:id/ai/resume`

Lista descreve implementação atual, não contrato Public API V1. Não crie CRUD especulativo; Public API V1 pertence ao GOAL 11.

## Environment

Copie `.env.example` para `.env`.

Grupos:

- runtime/session: `NODE_ENV`, `PORT`, `JWT_*`, `SESSION_COOKIE_NAME`, `COOKIE_*`;
- persistence: `DATABASE_URL`;
- browser boundary: `FRONTEND_ORIGIN`, `BFF_PUBLIC_URL`;
- API interna: `AI_ORCHESTRATOR_BASE_URL`, `INTERNAL_SERVICE_TOKEN`;
- Evolution Go: `EVOLUTION_GO_*`, `EVOLUTION_WEBHOOK_SECRET`.

Não registre valores dessas variáveis em logs.

## Commands

```bash
npm ci
npm run dev
npm run check
npm run build
npm test
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run start
```

Porta padrão: `3002`.

## Migration notes

- GOAL 03: multi-tenancy BFF.
- GOAL 11: Public API V1 orientada por consumidores reais.
- GOAL 13+: integração progressiva do frontend.
- Responsabilidades de Conversation/Message/Handoff migram para AI Orchestrator no goal correto.
- Scheduling permanece fora do domínio do BFF.
