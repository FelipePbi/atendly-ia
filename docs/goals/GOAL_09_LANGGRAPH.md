# GOAL 09 — Migrar orchestration para LangGraph

## Objetivo

Substituir gradualmente `MessageOrchestrator` por workflow explícito, persistente e retomável.

## Dependência

GOAL 08 concluído.

# 9.1 Definir GraphState

Exemplo:

```ts
{
  tenantId;
  conversationId;
  channelId;
  inboundMessage;
  tenantConfig;
  customerContext;
  intent;
  retrievedKnowledge;
  toolResults;
  response;
  handoff;
}
```

Não guardar Appointment como source of truth no graph.

# 9.2 Nodes

Criar inicialmente:

```text
loadRuntimeContext
loadConversation
operationalGuard
understandMessage
retrieveKnowledge
agent
executeTool
validateToolResult
composeResponse
persistResponse
sendResponse
handoff
```

# 9.3 Guards determinísticos

Antes do LLM:

```text
AI enabled?
conversation paused?
human takeover?
channel connected?
duplicate event?
```

Esses checks não dependem do modelo.

# 9.4 Conditional edges

Exemplo:

```text
operationalGuard

paused -> END
human -> END
enabled -> understandMessage
```

Depois:

```text
understandMessage

simple response -> agent
knowledge -> retrieval
operational -> agent/tools
handoff -> handoff
```

# 9.5 Persistência

Adicionar:

```text
@langchain/langgraph-checkpoint-postgres
```

Configurar schema específico:

```text
langgraph
```

# 9.6 Thread

```text
thread_id = Conversation.id
```

Conversation ID já é tenant-scoped.

# 9.7 MessageOrchestrator legado

Durante migração:

```text
old orchestrator
    ↓
adapter/compatibility
    ↓
graph
```

Quando todos os caminhos estiverem migrados:

```text
remover MessageOrchestrator antigo
```

Não manter os dois indefinidamente.

# 9.8 LangGraph não executa scheduling diretamente

Ainda:

```text
Graph
 ↓
LangChain Tool
 ↓
SchedulingClient
 ↓
Scheduling Service
```

## Gate GOAL 09

Manualmente validar:

```text
mensagem simples
consulta de serviço
consulta disponibilidade
criação agendamento
reagendamento
cancelamento
handoff
takeover
resumo/retomada
duplicação webhook
```

Nenhuma duplicação de appointment pode ocorrer em retry.

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 10.
