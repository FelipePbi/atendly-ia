# Atendly AI Orchestrator

Serviço interno multi-tenant responsável por conversas, mensagens, handoff e execução da IA no WhatsApp.

## Fluxo

```text
Evolution Go
  → webhook autenticado
  → ChannelConnection resolve tenant e canal
  → MessageOrchestrator / AssistantService
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

PostgreSQL próprio via Prisma. Models operacionais: `ChannelConnection`, `Conversation`, `Message`, `ProcessedEvent`, `AiRun`, `AiToolCall`, `Handoff` e `AiTenantConfig`. Chaves de conversa, mensagem e evento são compostas por tenant/canal/provider conforme o domínio.

## Environment

Copie `.env.example` para `.env`. Principais grupos:

- runtime: `NODE_ENV`, `AI_ORCHESTRATOR_PORT`, `DATABASE_URL`;
- autenticação interna: `INTERNAL_SERVICE_TOKEN`, `ADMIN_API_TOKEN`;
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL` e limites;
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
- `request_human_handoff`.

Tools operacionais recebem contexto confiável de tenant/request. Mutações usam chave estável derivada de `aiRunId` e `toolCallId`; agenda continua acessível somente via `SchedulingClient`.

LangGraph e RAG ainda não fazem parte do serviço.
