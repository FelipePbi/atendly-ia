# GOAL 08 — Introduzir LangChain sem alterar comportamento

## Objetivo

Substituir apenas a camada de acesso/model/tool plumbing.

Ainda não migrar orchestration para LangGraph neste goal.

## Dependência

GOAL 07 concluído.

# 8.1 Instalar dependências necessárias

Exemplo conceitual:

```text
@langchain/core
@langchain/openai
langchain
```

Adicionar apenas dependências efetivamente utilizadas.

# 8.2 Criar ModelProvider

```text
ModelProvider
     ↓
LangChain ChatModel
```

O restante do domínio não deve importar SDK OpenAI diretamente.

# 8.3 Migrar prompts

Preservar regras importantes já existentes.

Organizar:

```text
prompts/
├── system.ts
├── tenant-context.ts
├── scheduling.ts
├── handoff.ts
└── response.ts
```

# 8.4 Tools tipadas

Criar via LangChain:

```text
list_services
get_availability
create_appointment
list_customer_appointments
reschedule_appointment
cancel_appointment
request_human_handoff
```

Cada uma:

```text
Zod input
typed output
structured error
requestId
tenant context
```

# 8.5 Scheduling tools

Nunca importar Scheduling internals.

Sempre usar:

```text
SchedulingClient
```

# 8.6 Tool idempotency

Tool mutation deve receber ou gerar identificador estável:

```text
aiRunId
toolCallId
idempotencyKey
```

Scheduling Service deve respeitar a key.

## Gate GOAL 08

O mesmo fluxo que funcionava no GOAL 07 deve funcionar agora via LangChain.

Não avançar se houver mudança sem explicação em:

```text
confirmação
handoff
agendamento
cancelamento
reagendamento
```

Qualidade:

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 09.
