# Atendly AI Orchestrator

Serviço interno multi-tenant responsável por conversas, mensagens, handoff e execução da IA no WhatsApp.

## Fluxo

```text
Evolution Go
  → webhook autenticado
  → ChannelConnection resolve tenant e canal
  → InboundMessageProcessor + debounce
  → LangGraph persistente + AssistantService
  → LangChain ModelProvider + tools tipadas
  → SchedulingClient, quando necessário
  → EvolutionProvider
  → Evolution Go
```

O serviço não acessa Minha Agenda nem tabelas de outro serviço. Calendário, serviços, clientes, disponibilidade e appointments pertencem ao Scheduling Service.

## Rotas

- `GET /health` e `GET /healthy` — saúde;
- `POST /webhooks/evolution` — inbound autenticado do Evolution Go;
- `PUT /internal/channel-connections/evolution` — provisiona a relação confiável entre instância, tenant e usuário;
- `PUT /internal/ai-tenant-config` — sincroniza ativação, um dos dois tons aprovados e contexto mínimo do negócio;
- `GET /internal/conversations` e `GET /internal/conversations/:id` — inbox e detalhe tenant-scoped;
- `GET|POST /internal/conversations/:id/messages` — histórico e mensagem manual durante takeover;
- `POST /internal/conversations/:id/takeover|release|resolve` — lifecycle de handoff;
- `GET /internal/dashboard` — métricas diárias e conversas que exigem atenção.

Rotas `/internal/*` exigem `INTERNAL_SERVICE_TOKEN`. Provisionamento exige headers de tenant e usuário provenientes de serviço confiável. O body inbound nunca autoriza tenant.

## Persistência

PostgreSQL próprio via Prisma. Models operacionais: `ChannelConnection`, `Conversation`, `Message`, `ProcessedEvent`, `AiRun`, `AiToolCall`, `Handoff`, `AiTenantConfig`, `KnowledgeDocument` e `KnowledgeChunk`. Relações operacionais e de knowledge são tenant-scoped.

Checkpoints LangGraph usam o mesmo PostgreSQL no schema dedicado `langgraph`. Appointment nunca é source of truth do graph.

## Environment

Copie `.env.example` para `.env`. Os grupos principais são runtime/database, OpenAI, RAG, Evolution Go, Scheduling Service e `INTERNAL_SERVICE_TOKEN`. Credenciais de instância do WhatsApp vêm da conexão tenant-scoped; não há configuração global de instância.

## IA, tools e RAG

`AssistantService` usa `LangChainModelProvider`; somente esse provider conhece `ChatOpenAI`. A configuração aceita exclusivamente os tons `PROFESSIONAL_OBJECTIVE` e `LIGHT_CLOSE`.

Tools operacionais usam contexto confiável de tenant/request e chamam o Scheduling Service. O RAG é limitado a conhecimento textual tenant-scoped; preço atual, serviço ativo, disponibilidade, appointments e status de integrações usam serviços determinísticos.

## Comandos

```bash
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run dev
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npm run start
```

Porta padrão: `3000`.
