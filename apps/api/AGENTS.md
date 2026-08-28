# TRANSITIONAL APPLICATION — `apps/api`

Leia `/AGENTS.md` e goal atual antes de alterar. Este app não representa arquitetura final.

## Current

- Contém orchestration de IA.
- Contém integração Minha Agenda legacy.
- Participa do fluxo Evolution Go e mantém handoff/idempotência legados.

Refatore incrementalmente. Não faça big-bang rewrite.

## Sequenciamento obrigatório

- Não renomeie `apps/api` antes do GOAL 07.
- Minha Agenda só sai deste app no GOAL 05.
- LangChain só entra no GOAL 08.
- LangGraph só entra no GOAL 09.
- RAG e pgvector só entram no GOAL 10.

Não combine goals por conveniência.

## Código valioso a preservar/reutilizar

- `MessageOrchestrator`
- `AssistantService`
- `EvolutionInboundMapper`
- `EvolutionProvider`
- `WhatsAppProvider`
- `HandoffService`
- `IdempotencyStore`
- prompt rules
- client/facade Minha Agenda até extração no goal correto

## Target

Após fase autorizada:

```text
apps/api → apps/ai-orchestrator
```

Responsabilidades de IA migram no goal correspondente. Não declare LangChain, LangGraph ou RAG como existentes antes disso.
