# AGENTS.md — AI Orchestrator

Leia `/AGENTS.md` e o goal atual antes de alterar.

## Responsabilidade

Este serviço é owner de:

- `Conversation`, `Message` e `Handoff`;
- resolução do tenant inbound por `ChannelConnection`;
- idempotência e execução da IA;
- `AiRun`, `AiToolCall` e configuração operacional da IA;
- envio de respostas pelo provider WhatsApp.

Não é owner de calendário, serviços, clientes, disponibilidade ou appointments. Toda operação de agenda passa pelo `SchedulingClient` e pelo Scheduling Service. Não importe clients, DTOs externos ou persistência da Minha Agenda.

## Limites

- Webhook Evolution resolve `instanceId → ChannelConnection → tenantId` antes de processar.
- Toda query operacional usa contexto de tenant e canal.
- Não confie em tenant recebido do browser.
- LLM não acessa SQL, Evolution Go, Minha Agenda ou outro provider de calendário diretamente.
- Ações reais passam por tools tipadas e serviços determinísticos.
- Não compartilhe Prisma ou repositories com outro app.
- Preserve logs estruturados, request IDs e redaction de secrets.

## Sequenciamento

- LangChain entra somente no GOAL 08.
- LangGraph entra somente no GOAL 09.
- RAG e pgvector entram somente no GOAL 10.
- Legado legal e outros consumidores remanescentes saem no goal responsável.

Preserve/refatore incrementalmente `MessageOrchestrator`, `AssistantService`, mappers/providers Evolution, `WhatsAppProvider`, `HandoffService`, `IdempotencyStore`, prompts e utilitários.
