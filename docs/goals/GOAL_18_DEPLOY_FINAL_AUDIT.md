# GOAL 18 — Deploy, observabilidade e auditoria arquitetural final

## Objetivo

Garantir que a arquitetura também funcione corretamente fora do ambiente local.

## Dependência

GOAL 17 concluído.

# 18.1 Render

Estado final:

```text
atendly-ia-frontend
atendly-ia-bff
atendly-ia-ai-orchestrator
atendly-ia-scheduling-service
atendly-ia-evolution-go
atendly-ia-health-worker
```

Hoje o Render ainda possui o serviço genérico `atendly-ia-api`.

Substituir após rename seguro.

# 18.2 Env ownership

### Frontend

```text
BFF URL
```

### BFF

```text
platform DB
JWT/session
AI URL
Scheduling URL
Evolution URL
internal tokens
```

### AI Orchestrator

```text
AI DB
OpenAI/model credentials
Scheduling URL
Evolution URL
pgvector
internal token
```

### Scheduling

```text
Scheduling DB
encryption key
internal token
```

Credenciais Minha Agenda vêm do banco por tenant.

# 18.3 Health

Cada serviço:

```http
GET /health
```

Health não deve executar operações caras.

# 18.4 Logs

Todos propagam:

```text
x-request-id
```

AI adicionalmente:

```text
tenantId
conversationId
aiRunId
toolCallId
```

sem logar secrets.

# 18.5 Sensitive redaction

Garantir redaction de:

```text
Authorization
cookies
password
Minha Agenda credentials
OpenAI key
Evolution tokens
customer sensitive payloads quando desnecessários
```

# 18.6 Smoke produção

Executar manualmente:

## Conta

```text
register
login
logout
session
```

## Onboarding

```text
Atendly
Minha Agenda
```

## WhatsApp

```text
connect
disconnect
reconnect
```

## Agenda

```text
service
customer
availability
create
reschedule
cancel
```

## AI

```text
simple question
RAG question
availability
booking
handoff
```

## Conversations

```text
inbound
AI response
manual takeover
manual response
release
```

## Dashboard

```text
real data
failure states
```

# Auditoria final obrigatória

Pergunta:

```text
Frontend chama algo além do BFF?
```

Resposta:

```text
NÃO
```

Pergunta:

```text
BFF persiste Conversation/Message?
```

Resposta:

```text
NÃO
```

Pergunta:

```text
AI acessa Minha Agenda?
```

Resposta:

```text
NÃO
```

Pergunta:

```text
Scheduling chama OpenAI?
```

Resposta:

```text
NÃO
```

Pergunta:

```text
RAG pode retornar dados de outro tenant?
```

Resposta:

```text
NÃO
```

Pergunta:

```text
Appointment depende de LangGraph state?
```

Resposta:

```text
NÃO
```

Pergunta:

```text
LLM pode criar Appointment diretamente?
```

Resposta:

```text
NÃO
```

Pergunta:

```text
Minha Agenda ainda possui credentials globais?
```

Resposta:

```text
NÃO
```

# Estado final esperado

```text
                    ┌───────────────────────┐
                    │       Frontend        │
                    │       Next.js         │
                    └──────────┬────────────┘
                               │
                               ▼
                    ┌───────────────────────┐
                    │          BFF          │
                    │ Auth / Tenant / UI API│
                    └─────┬────────┬────────┘
                          │        │
              ┌───────────┘        └───────────┐
              ▼                                ▼
    ┌────────────────────┐          ┌────────────────────┐
    │  AI Orchestrator   │          │ Scheduling Service │
    │                    │          │                    │
    │ LangChain          │          │ CalendarService    │
    │ LangGraph          │◄────────►│ CalendarProvider   │
    │ RAG                │  tools   │                    │
    │ pgvector           │          │ AtendlyProvider    │
    │ Handoff            │          │ MinhaAgendaProvider│
    │ Conversation       │          │ Appointments       │
    └─────────┬──────────┘          └────────────────────┘
              │
              ▼
        ┌───────────────┐
        │ Evolution Go  │
        └───────┬───────┘
                │
                ▼
            WhatsApp
```

# Definition of Done global

```text
✓ frontend não chama API diretamente
✓ frontend não chama Evolution
✓ frontend não chama Minha Agenda
✓ frontend não conhece provider de agenda

✓ BFF resolve tenant
✓ BFF é único backend público da aplicação
✓ BFF não persiste conversas/mensagens
✓ BFF não implementa disponibilidade

✓ AI é completamente tenant-aware
✓ Scheduling é completamente tenant-aware
✓ RAG exige tenant filter
✓ nenhuma unique global por telefone ameaça isolamento

✓ LangGraph controla workflow
✓ LangChain fornece models/tools
✓ LLM nunca acessa banco diretamente
✓ LLM nunca acessa Minha Agenda diretamente
✓ operações reais passam por tools tipadas
✓ confirmação só ocorre após sucesso real

✓ Minha Agenda não usa credencial global
✓ CalendarProvider esconde a origem da agenda

✓ rotas legadas sem consumidor removidas
✓ código de custom persona removido
✓ duplicação Conversation/Message removida
✓ mocks permanecem somente onde ainda têm função de preview

✓ lint passa
✓ typecheck passa
✓ format passa
✓ build passa
```

Somente após todos esses itens a refatoração V1 está concluída.
