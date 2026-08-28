# Roadmap de Integração V1 — Atendly

## Estado

```text
NEXT: GOAL 06
```

Este roadmap governa refatoração incremental. Todos os goals começam em `NOT_STARTED`. Esta tarefa de documentação ocorre antes do GOAL 01.

Somente o goal explicitamente solicitado pelo usuário pode ser alterado para `IN_PROGRESS` ou `COMPLETED`. Não marque goals seguintes automaticamente.

## Arquitetura alvo

```text
Frontend
   │
   ▼
BFF
   ├──────────────► AI Orchestrator
   ├──────────────► Scheduling Service
   └──────────────► Evolution Go
```

Fluxo inbound alvo:

```text
WhatsApp
   ↓
Evolution Go
   ↓
AI Orchestrator
   ↓
Scheduling Service quando necessário
   ↓
AI Orchestrator
   ↓
Evolution Go
   ↓
WhatsApp
```

AI Orchestrator e Scheduling Service são `TARGET`; ainda não existem como apps separados.

## Princípios globais

1. Frontend conhece somente BFF.
2. BFF é backend público web.
3. Fluxo inbound crítico pode contornar BFF.
4. AI Orchestrator será owner de Conversation, Message, Handoff e execução da IA.
5. Scheduling Service será owner de serviços, clientes, calendários, disponibilidade e appointments.
6. Evolution Go é transporte WhatsApp.
7. Cada serviço acessa apenas seu domínio e banco.
8. Dados operacionais serão tenant-aware; autorização não confia em `tenantId` do browser.
9. LLM usa tools tipadas; nunca SQL ou Minha Agenda diretamente.
10. RAG não substitui dados operacionais estruturados.
11. LangGraph não é source of truth operacional.
12. Rotas existem somente para consumidores reais.
13. Não antecipar goal futuro.
14. Legado permanece enquanto consumido e sai após migração concluída.
15. Cada goal deixa repositório estável antes do próximo.

## Goals e dependências

| Goal | Descrição | Depende de | Status |
| --- | --- | --- | --- |
| GOAL 01 | Baseline arquitetural e inventário | — | COMPLETED |
| GOAL 02 | Tooling + shared contracts | GOAL 01 | COMPLETED |
| GOAL 03 | Multi-tenancy BFF | GOAL 02 | COMPLETED |
| GOAL 04 | Scheduling Service foundation | GOAL 03 | COMPLETED |
| GOAL 05 | Minha Agenda CalendarProvider | GOAL 04 | COMPLETED |
| GOAL 06 | Agenda Atendly CalendarProvider | GOAL 05 | NOT_STARTED |
| GOAL 07 | AI Orchestrator multi-tenant | GOAL 06 | NOT_STARTED |
| GOAL 08 | LangChain | GOAL 07 | NOT_STARTED |
| GOAL 09 | LangGraph | GOAL 08 | NOT_STARTED |
| GOAL 10 | RAG + pgvector | GOAL 09 | NOT_STARTED |
| GOAL 11 | BFF Public API V1 | GOAL 10 | NOT_STARTED |
| GOAL 12 | Frontend data layer | GOAL 11 | NOT_STARTED |
| GOAL 13 | Auth + Onboarding + Settings + WhatsApp | GOAL 12 | NOT_STARTED |
| GOAL 14 | Services + Customers + Calendar | GOAL 13 | NOT_STARTED |
| GOAL 15 | Conversations + Handoff | GOAL 14 | NOT_STARTED |
| GOAL 16 | Dashboard + Calendar Migration | GOAL 15 | NOT_STARTED |
| GOAL 17 | Legacy cleanup | GOAL 16 | NOT_STARTED |
| GOAL 18 | Deploy + final architecture audit | GOAL 17 | NOT_STARTED |

## Goal documents

| Goal | Documento |
| --- | --- |
| GOAL 01 | [goals/GOAL_01_BASELINE_ARQUITETURAL.md](goals/GOAL_01_BASELINE_ARQUITETURAL.md) |
| GOAL 02 | [goals/GOAL_02_TOOLING_CONTRACTS.md](goals/GOAL_02_TOOLING_CONTRACTS.md) |
| GOAL 03 | [goals/GOAL_03_MULTI_TENANCY_BFF.md](goals/GOAL_03_MULTI_TENANCY_BFF.md) |
| GOAL 04 | [goals/GOAL_04_SCHEDULING_FOUNDATION.md](goals/GOAL_04_SCHEDULING_FOUNDATION.md) |
| GOAL 05 | [goals/GOAL_05_MINHA_AGENDA_PROVIDER.md](goals/GOAL_05_MINHA_AGENDA_PROVIDER.md) |
| GOAL 06 | [goals/GOAL_06_ATENDLY_CALENDAR_PROVIDER.md](goals/GOAL_06_ATENDLY_CALENDAR_PROVIDER.md) |
| GOAL 07 | [goals/GOAL_07_AI_ORCHESTRATOR_MULTI_TENANT.md](goals/GOAL_07_AI_ORCHESTRATOR_MULTI_TENANT.md) |
| GOAL 08 | [goals/GOAL_08_LANGCHAIN.md](goals/GOAL_08_LANGCHAIN.md) |
| GOAL 09 | [goals/GOAL_09_LANGGRAPH.md](goals/GOAL_09_LANGGRAPH.md) |
| GOAL 10 | [goals/GOAL_10_RAG_PGVECTOR.md](goals/GOAL_10_RAG_PGVECTOR.md) |
| GOAL 11 | [goals/GOAL_11_BFF_PUBLIC_API_V1.md](goals/GOAL_11_BFF_PUBLIC_API_V1.md) |
| GOAL 12 | [goals/GOAL_12_FRONTEND_DATA_LAYER.md](goals/GOAL_12_FRONTEND_DATA_LAYER.md) |
| GOAL 13 | [goals/GOAL_13_AUTH_ONBOARDING_SETTINGS_WHATSAPP.md](goals/GOAL_13_AUTH_ONBOARDING_SETTINGS_WHATSAPP.md) |
| GOAL 14 | [goals/GOAL_14_SERVICES_CUSTOMERS_CALENDAR.md](goals/GOAL_14_SERVICES_CUSTOMERS_CALENDAR.md) |
| GOAL 15 | [goals/GOAL_15_CONVERSATIONS_HANDOFF.md](goals/GOAL_15_CONVERSATIONS_HANDOFF.md) |
| GOAL 16 | [goals/GOAL_16_DASHBOARD_MIGRATION.md](goals/GOAL_16_DASHBOARD_MIGRATION.md) |
| GOAL 17 | [goals/GOAL_17_LEGACY_CLEANUP.md](goals/GOAL_17_LEGACY_CLEANUP.md) |
| GOAL 18 | [goals/GOAL_18_DEPLOY_FINAL_AUDIT.md](goals/GOAL_18_DEPLOY_FINAL_AUDIT.md) |

## Status protocol

- `NOT_STARTED`: nenhum trabalho do goal autorizado.
- `IN_PROGRESS`: usuário solicitou explicitamente este goal e execução começou.
- `COMPLETED`: critérios do arquivo detalhado e validações aplicáveis passaram.

Não use `BLOCKED` para goals futuros apenas porque dependem de anteriores; mantenha `NOT_STARTED`.

Ao executar um goal:

1. leia `/AGENTS.md`, scoped `AGENTS.md` e arquivo detalhado;
2. confirme dependência concluída;
3. altere apenas status do goal solicitado;
4. respeite proibições e limites;
5. execute checks existentes/aplicáveis;
6. não inicie próximo goal.
