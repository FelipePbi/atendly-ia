# Atendly AI Orchestrator

Serviço interno multi-tenant responsável por conversas, mensagens, handoff e execução da IA no WhatsApp.

## Fluxo

```text
Evolution Go
  → webhook autenticado
  → ChannelConnection resolve tenant e canal
  → MessageOrchestrator (adapter de compatibilidade/debounce)
  → LangGraph persistente + AssistantService
  → LangChain ModelProvider + tools tipadas
  → SchedulingClient, quando necessário
  → EvolutionProvider
  → Evolution Go
```

O serviço não acessa Minha Agenda nem tabelas de outro serviço. Calendário, serviços, clientes, disponibilidade e appointments pertencem ao Scheduling Service.

## Rotas

- `GET /health` e `GET /healthy` — saúde.
- `POST /webhooks/evolution` — inbound autenticado do Evolution Go.
- `PUT /internal/channel-connections/evolution` — provisiona a relação confiável entre instância, tenant e usuário.
- `PUT /internal/ai-tenant-config` — sincroniza ativação, tom aprovado e snapshot de negócio usado no inbound direto.
- `POST /internal/evolution/dispatch` — dispatch interno compatível com o BFF durante a transição.
- `/internal/handoffs` e `/internal/bot/*` — controle de handoff e automação.
- rotas legais legadas permanecem até o goal de cleanup.

Rotas `/internal/*` exigem `INTERNAL_SERVICE_TOKEN`. Provisionamento exige `x-tenant-id` e `x-user-id` provenientes de serviço confiável. O body inbound nunca autoriza tenant.

`EVOLUTION_WEBHOOK_TOKEN` deve ter o mesmo valor usado pelo BFF ao configurar o webhook da instância.

## Persistência

PostgreSQL próprio via Prisma. Models operacionais: `ChannelConnection`, `Conversation`, `Message`, `ProcessedEvent`, `AiRun`, `AiToolCall`, `Handoff`, `AiTenantConfig`, `KnowledgeDocument` e `KnowledgeChunk`. Chaves operacionais e relações de knowledge são tenant-scoped.

Extensão `vector` armazena embeddings `vector(1536)`. Prisma mantém o tipo como `Unsupported`; escrita e busca vetorial usam SQL parametrizado dentro de `PGVectorKnowledgeStore`.

## Environment

Copie `.env.example` para `.env`. Principais grupos:

- runtime: `NODE_ENV`, `AI_ORCHESTRATOR_PORT`, `DATABASE_URL`;
- autenticação interna: `INTERNAL_SERVICE_TOKEN`, `ADMIN_API_TOKEN`;
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL` e limites;
- RAG: `KNOWLEDGE_SEARCH_LIMIT` e `KNOWLEDGE_SEARCH_MIN_SCORE`;
- Evolution Go: `EVOLUTION_*`;
- agenda: `SCHEDULING_SERVICE_BASE_URL`.

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

## IA e tools

`AssistantService` usa `LangChainModelProvider`; somente esse provider conhece `ChatOpenAI`. Prompts ficam separados por contexto do tenant, agenda, handoff e resposta.

Tools LangChain disponíveis:

- `list_services`;
- `get_availability`;
- `create_appointment`;
- `list_customer_appointments`;
- `reschedule_appointment`;
- `cancel_appointment`;
- `request_human_handoff`;
- `search_business_knowledge`.

Tools operacionais recebem contexto confiável de tenant/request. Mutações usam chave estável derivada de `aiRunId` e `toolCallId`; agenda continua acessível somente via `SchedulingClient`.

## LangGraph

Workflow inbound usa nodes explícitos para contexto, conversa, guards operacionais, entendimento, retrieval tenant-scoped, agent, execução/validação de tools, composição, persistência, envio e handoff.

- `thread_id` é sempre `Conversation.id`;
- checkpoints usam o mesmo PostgreSQL do serviço no schema dedicado `langgraph`;
- startup executa `PostgresSaver.setup()` e shutdown encerra o pool;
- retry retoma node pendente; tool call checkpointada mantém `aiRunId`, `toolCallId` e chave idempotente;
- Appointment nunca é armazenado como source of truth do graph;
- scheduling continua `Graph → LangChain Tool → SchedulingClient → Scheduling Service`.

`MessageOrchestrator` permanece somente como adapter para webhook e debounce durante migração.

## RAG

`EmbeddingProvider` isola geração de embeddings. `KnowledgeVectorStore` exige `tenantId` tanto para indexação quanto para busca; implementação ativa é `PGVectorKnowledgeStore`.

Graph só chama `retrieveKnowledge` para perguntas classificadas como conhecimento. Preço, serviço ativo, agenda, disponibilidade, appointments, status WhatsApp e status de integração continuam fora do RAG e usam serviços determinísticos.

Não existe rota ou CRUD público de knowledge. Carga controlada usa arquivo JSON local e contexto explícito de tenant:

```bash
KNOWLEDGE_SEED_TENANT_ID=tenant-id \
KNOWLEDGE_SEED_FILE=./knowledge.json \
npm run knowledge:seed
```

Tipos permitidos: `FAQ`, `GUIDANCE`, `CARE`, `PROCEDURE`, `BUSINESS_INFO` e `TEXT_POLICY`. Cada arquivo contém `type`, `title`, `source`, `version`, `status` opcional e `chunks` com `content` e `metadata` opcional.
