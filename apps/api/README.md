# Atendly API — Transitional Application

## Current transitional role

`apps/api` é aplicação transitória do backend legado. Hoje concentra:

- recepção/dispatch de eventos Evolution Go;
- orchestration de mensagens e chamadas ao modelo OpenAI;
- tools determinísticas de agendamento;
- client interno do Scheduling Service;
- conversas, mensagens, idempotência, tool calls e handoffs no próprio PostgreSQL;
- envio de mensagens pelo provider WhatsApp;
- endpoints legais legados.

Esta composição é `CURRENT`, não arquitetura final. Não faça big-bang rewrite e não renomeie app antecipadamente.

## Target role

Responsabilidades de IA serão transformadas e migradas incrementalmente para AI Orchestrator no GOAL 07. Integração Minha Agenda foi extraída para CalendarProvider/Scheduling Service no GOAL 05.

Tecnologias planejadas, ainda ausentes:

- LangChain: GOAL 08;
- LangGraph: GOAL 09;
- RAG + pgvector: GOAL 10.

Não introduza essas etapas em conjunto.

## Valuable code to preserve

- `MessageOrchestrator`;
- `AssistantService`;
- `EvolutionInboundMapper`;
- `EvolutionProvider`;
- `WhatsAppProvider`;
- `HandoffService`;
- `IdempotencyStore`;
- prompt rules;
- client tipado do Scheduling Service.

Preservar significa reutilizar comportamento validado durante migração, não manter duplicação depois de todos os consumidores migrarem.

## Stack

- Node.js 20+;
- Fastify 5;
- TypeScript strict;
- Zod;
- Prisma 6 + PostgreSQL;
- Vitest existente;
- integração OpenAI via HTTP;
- Evolution Go;
- Scheduling Service via HTTP interno.

LangChain, LangGraph e pgvector não estão instalados.

## Current architecture

```text
BFF ou webhook legado
          ↓
      apps/api
       ├─ MessageOrchestrator / AssistantService
       ├─ OpenAI tools
       ├─ Scheduling Service
       ├─ PostgreSQL próprio
       └─ EvolutionProvider → Evolution Go
```

Schema atual é legado e não tenant-aware. Não altere schema fora do goal explícito.

## Current routes

Públicas/legadas:

- `GET /health`
- `GET /healthy`
- `GET /privacy`
- `GET /terms`
- `GET /data-deletion`
- `POST /api/webhooks/evolution-go` — bridge legado
- `POST /webhooks/evolution`

Internas:

- `GET /internal/handoffs`
- `POST /internal/handoffs`
- `PATCH /internal/handoffs/:id/resolve`
- `POST /internal/bot/resume`
- `POST /internal/bot/status`
- `POST /internal/evolution/dispatch`

Rotas internas exigem token configurado. Não crie ou remova rota nesta tarefa nem gere CRUD sem consumidor real.

## Environment

Copie `.env.example` para `.env`. Principais grupos:

- runtime/persistence: `NODE_ENV`, `API_PORT`, `DATABASE_URL`;
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`, limites e versão de prompt;
- Evolution Go: `EVOLUTION_*`, provider e políticas de webhook/handoff;
- agenda: `SCHEDULING_SERVICE_BASE_URL` e `INTERNAL_SERVICE_TOKEN`;
- chamadas internas/admin: `INTERNAL_SERVICE_TOKEN`, `ADMIN_API_TOKEN`.

Escritas reais são controladas por tenant na conexão mantida pelo Scheduling Service. Nunca use dados reais em validação local sem autorização explícita.

## Commands

```bash
npm ci
npm run dev
npm run build
npm test
npm run test:watch
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run start
```

Teste manual de webhook disponível:

```bash
npm run test:webhook
```

Porta padrão: `3000`.

## Docker

`docker-compose.yml` deste app sobe API, PostgreSQL da API e dependências locais do Evolution Go. Use `.env.example` como catálogo; não versione secrets.

## Migration guardrails

- Minha Agenda pertence ao Scheduling Service desde GOAL 05.
- Nome/diretório permanece `apps/api` até GOAL 07.
- Não compartilhe Prisma com BFF ou serviços futuros.
- LLM não acessa SQL nem Minha Agenda diretamente; ações usam tools tipadas.
- Ao concluir migração responsável e remover consumidores, remova legado; não crie diretórios de backup.
