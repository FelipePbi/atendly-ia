# Ordem de migração V1

Migração é estritamente sequencial. Cada goal depende do anterior, deixa repositório estável e não autoriza antecipar trabalho posterior.

## CURRENT

GOAL 01 documenta baseline. Frontend segue mockado; AI Orchestrator e Scheduling Service separados ainda não existem.

## TRANSITIONAL

| Ordem | Goal | Resultado autorizado | Dependência |
| --- | --- | --- | --- |
| 1 | GOAL 01 — Baseline arquitetural e inventário | Registrar CURRENT, TRANSITIONAL, TARGET, ownership, API boundary e inventário | — |
| 2 | GOAL 02 — Tooling + shared contracts | Padronizar tooling autorizado e criar contratos compartilhados | GOAL 01 |
| 3 | GOAL 03 — Multi-tenancy BFF | Tenant, TenantMember e TenantContext derivados da sessão | GOAL 02 |
| 4 | GOAL 04 — Scheduling Service foundation | Criar serviço e persistência próprios do domínio scheduling | GOAL 03 |
| 5 | GOAL 05 — Minha Agenda CalendarProvider | Mover client, credenciais, disponibilidade e operações Minha Agenda para Scheduling | GOAL 04 |
| 6 | GOAL 06 — Agenda Atendly CalendarProvider | Implementar fonte oficial interna no Scheduling Service | GOAL 05 |
| 7 | GOAL 07 — AI Orchestrator multi-tenant | Transformar `apps/api`, consolidar Conversation/Message/Handoff e mover inbound | GOAL 06 |
| 8 | GOAL 08 — LangChain | Introduzir LangChain na orchestration já separada | GOAL 07 |
| 9 | GOAL 09 — LangGraph | Introduzir fluxo/estado LangGraph sem torná-lo source of truth de appointments | GOAL 08 |
| 10 | GOAL 10 — RAG + pgvector | KnowledgeDocument/Chunk e retrieval tenant-scoped | GOAL 09 |
| 11 | GOAL 11 — BFF Public API V1 | Criar fronteira pública baseada em consumidores reais e clients internos explícitos | GOAL 10 |
| 12 | GOAL 12 — Frontend data layer | Compor adapters BFF preservando mocks do preview | GOAL 11 |
| 13 | GOAL 13 — Auth + Onboarding + Settings + WhatsApp | Integrar fluxos de conta e conexão pelo BFF | GOAL 12 |
| 14 | GOAL 14 — Services + Customers + Calendar | Integrar domínios scheduling no frontend via BFF | GOAL 13 |
| 15 | GOAL 15 — Conversations + Handoff | Integrar AI Orchestrator no frontend via BFF | GOAL 14 |
| 16 | GOAL 16 — Dashboard + Calendar Migration | Integrar agregações e migração assistida | GOAL 15 |
| 17 | GOAL 17 — Legacy cleanup | Remover implementações/rotas/tabelas sem consumidor após cutovers | GOAL 16 |
| 18 | GOAL 18 — Deploy + final architecture audit | Atualizar deploy e validar arquitetura final | GOAL 17 |

## Mapa de responsabilidades

| Responsabilidade CURRENT | Destino | Goal de cutover principal |
| --- | --- | --- |
| BFF user-scoped | BFF tenant-aware | GOAL 03 |
| Minha Agenda em `apps/api` | Scheduling Service | GOAL 05 |
| Disponibilidade Minha Agenda em `apps/api` | Scheduling Service | GOAL 05 |
| Agenda Atendly ausente | Scheduling Service | GOAL 06 |
| MessageOrchestrator/AssistantService em `apps/api` | AI Orchestrator | GOAL 07 |
| Conversation/Message/Handoff duplicados | AI Orchestrator como único owner | GOAL 07 |
| Webhook inbound via BFF | Evolution Go → AI Orchestrator | GOAL 07 |
| OpenAI HTTP direto | Orchestration com LangChain | GOAL 08 |
| Estado JSON ad hoc | LangGraph checkpoints, sem substituir dados operacionais | GOAL 09 |
| RAG ausente | AI Orchestrator | GOAL 10 |
| Rotas BFF legadas | Public API V1 orientada pelo frontend | GOAL 11 |
| Frontend mock-only | UI → adapter → BFF | GOAL 12 |
| Auth/onboarding/settings/WhatsApp mock | BFF real | GOAL 13 |
| Serviços/clientes/agenda mock | Scheduling via BFF | GOAL 14 |
| Conversas/handoff mock | AI Orchestrator via BFF | GOAL 15 |
| Dashboard/migração mock | Agregação BFF | GOAL 16 |
| Persona/rotas/schemas obsoletos | Remoção após ausência de consumidores | GOAL 17 |
| Cinco serviços Render atuais | Deploy final com serviços alvo | GOAL 18 |

## Regras de passagem

- Status segue `docs/ROADMAP_INTEGRACAO_V1.md`.
- Conclusão de um goal não inicia o próximo.
- Código legado permanece enquanto consumido.
- Remoção ocorre somente depois de substituição, migração de dados necessária e busca de consumidores.
- Shared contracts não significam shared persistence.
- GOAL 01 não altera runtime, Prisma, rotas, frontend, deploy ou dependências.

## TARGET

Após GOAL 18, Browser usa somente BFF; Evolution Go entrega inbound ao AI Orchestrator; AI Orchestrator usa Scheduling Service para operações de agenda; cada serviço possui apenas seus dados.
