# Atendly BFF

## Purpose

Backend público da aplicação web Atendly. A Public API V1 é o único contrato web registrado; o BFF resolve tenant pela sessão e orquestra serviços internos sem expor suas APIs ao browser.

## Current responsibilities

`CURRENT`:

- cadastro, login, logout, sessão por cookie, troca e recuperação de senha;
- aceite versionado de Termos de Uso e Política de Privacidade;
- onboarding e perfil;
- business settings, configurações da atendente e automação;
- lifecycle da instância WhatsApp, QR/pairing e contatos;
- agregação de dashboard e adaptação dos contratos web de conversas, agenda, clientes, serviços e migração;
- persistência somente de auth, perfil, settings e conexão WhatsApp no PostgreSQL próprio;
- clients explícitos para AI Orchestrator, Scheduling Service e Evolution Go.

Frontend de produto consome estes endpoints. Preview visual continua isolado em mocks.

## Transitional responsibilities

Arquivos legados de persona e configurações anteriores à V1 ainda existem no repositório, mas suas rotas públicas não são registradas. Conversation, Message e Handoff pertencem exclusivamente ao AI Orchestrator.

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
Frontend → BFF → PostgreSQL do BFF
             ├─→ AI Orchestrator
             ├─→ Scheduling Service
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

Clients validam respostas com Zod, propagam request ID e contexto tenant confiável, têm timeout e fazem retry limitado somente em leituras. Mutações não são repetidas automaticamente.

## Database

Prisma schema: `prisma/schema.prisma`. Fundação multi-tenant contém `Tenant`, `TenantMember` e `BusinessProfile`. Cadastro cria `User`, tenant, membership `OWNER`, perfil inicial e aceite legal na mesma transação. Migration do GOAL 03 cria um tenant determinístico para cada usuário legado ainda sem membership.

Models legados de configuração ainda presentes aguardam o GOAL 17. Conversation, Message e AiSuppressionLog foram removidos no GOAL 15.

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

JWT continua contendo `userId`. Rotas autenticadas resolvem `TenantContext` server-side; `GET /v1/auth/session` retorna tenant e `BusinessProfile`. Nunca autorize por `tenantId` arbitrário recebido do browser.

## Public API V1

Saúde:

- `GET /health`
- `GET /health/dependencies`

- `/v1/auth/*`: registro, login, logout, sessão, senha e recuperação;
- `/v1/onboarding*` e `/v1/settings*`: configuração guiada e settings;
- `/v1/dashboard`: visão agregada em paralelo de IA, agenda, calendário e WhatsApp;
- `/v1/conversations*`: inbox, mensagens e handoff;
- `/v1/calendar*`, `/v1/appointments*`, `/v1/time-blocks*`: agenda;
- `/v1/customers*` e `/v1/services*`: diretório e catálogo;
- `/v1/calendar/integration*` e `/v1/calendar/migrations*`: integração e migração assistida;
- `/v1/whatsapp*`: lifecycle da conexão.

O mapa completo entre endpoints e consumidores planejados está em `PUBLIC_API_V1.md`. Fora de `/v1`, apenas health checks permanecem registrados.

## Environment

Copie `.env.example` para `.env`.

Grupos:

- runtime/session: `NODE_ENV`, `PORT`, `JWT_*`, `SESSION_COOKIE_NAME`, `COOKIE_*`;
- persistence: `DATABASE_URL`;
- browser boundary: `FRONTEND_ORIGIN`, `BFF_PUBLIC_URL`;
- APIs internas: `AI_ORCHESTRATOR_BASE_URL`, `SCHEDULING_SERVICE_BASE_URL`, `INTERNAL_SERVICE_TOKEN`, `INTERNAL_HTTP_TIMEOUT_MS`, `INTERNAL_HTTP_GET_RETRIES`;
- Evolution Go: `EVOLUTION_GO_*`, `EVOLUTION_WEBHOOK_SECRET`.
- recuperação de senha: `PASSWORD_RESET_*`.

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
- GOAL 12+: integração progressiva do frontend.
- Conversation, Message e Handoff pertencem ao AI Orchestrator.
- Agenda, clientes, serviços e appointments pertencem ao Scheduling Service.
- GOAL 16: dashboard real e migração assistida com diagnóstico, criação por `migrationId` e consulta de progresso persistido.
