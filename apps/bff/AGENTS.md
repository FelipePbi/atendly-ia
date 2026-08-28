# AGENTS.md — BFF

## Estado

BFF está em transição. Leia `/AGENTS.md` e goal atual antes de alterar.

## Target responsibilities

- Auth e session.
- Tenant resolution.
- Legal acceptance.
- Business/account profile.
- Frontend API e response aggregation.
- Backend clients.
- WhatsApp lifecycle/configuration.

## Non-ownership alvo

BFF não será owner de Conversation, Message, Handoff, Appointment, Availability, service scheduling, RAG ou LLM orchestration.
Algumas dessas responsabilidades ainda existem no código atual.

Do not delete transitional legacy responsibilities until the explicit migration goal that replaces them.

## Segurança e tenant

Resolução futura obrigatória:

```text
session → TenantMember → TenantContext
```

Nunca confie em `tenantId` arbitrário do browser. Autorização deriva de sessão e membership validada.

## Database

BFF acessa somente seu domínio. Não acesse DB futuro de Scheduling Service ou AI Orchestrator diretamente. Não compartilhe Prisma entre serviços.

## Internal clients

Integrações futuras usam clients explícitos, introduzidos somente no goal correto:

- `AiOrchestratorClient`
- `SchedulingClient`
- `EvolutionClient`

Crie rota pública somente para consumidor real no frontend. Preserve contratos legados ainda consumidos até sua migração explícita.
