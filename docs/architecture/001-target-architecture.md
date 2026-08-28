# Arquitetura alvo

**Goal:** GOAL 01 — Baseline arquitetural e inventário definitivo

**Escopo:** fotografia do repositório em 2026-08-28 e direção obrigatória da migração V1

## CURRENT

O frontend novo é uma aplicação Next.js funcional, mas ainda não participa dos fluxos reais de backend:

```text
Browser
  ↓
apps/frontend
  ↓
Mock*Service e dados em memória
```

Não há `fetch`, proxy `/api/*`, `Bff*Service` ou outro client de backend em `apps/frontend/src`. As variáveis `NEXT_PUBLIC_BFF_URL` e `BFF_BASE_URL` existem apenas como reserva em configuração.

O fluxo operacional legado configurado pelo BFF é:

```text
WhatsApp
  ↓
Evolution Go
  ↓ webhook por instância
apps/bff /webhooks/evolution-go
  ├─ persiste WhatsAppInstance, Conversation, Message e supressões no DB do BFF
  ├─ aplica elegibilidade/pausa legada
  └─ chama apps/api /internal/evolution/dispatch
                  ├─ MessageOrchestrator / AssistantService
                  ├─ OpenAI Responses API + tools tipadas
                  ├─ Minha Agenda
                  ├─ DB próprio de Conversation, Message, ToolCall e Handoff
                  └─ EvolutionProvider → Evolution Go → WhatsApp
```

Também existem rotas de webhook diretamente em `apps/api`, mas elas são legadas. A criação/conexão de instância feita pelo BFF configura o webhook do Evolution Go para o BFF.

Deploy atual em `render.yaml` possui cinco serviços: frontend, BFF, API transitória, Evolution Go e health worker. `apps/ai-orchestrator` e `apps/scheduling-service` não existem.

## TRANSITIONAL

- `apps/bff` é backend público web atual, mas ainda contém Conversation, Message, ignored contacts, supressão de IA e processamento inicial do inbound.
- `apps/api` concentra orchestration de IA e scheduling via Minha Agenda. Seu nome e limites ainda não representam arquitetura final.
- BFF e API possuem bancos PostgreSQL e representações próprias de Conversation/Message/Handoff.
- Schemas são user-scoped ou globais; `Tenant` e `TenantMember` ainda não existem.
- Frontend permanece mockado até os goals de data layer e integração.
- Evolution Go permanece transporte; seu estado técnico de instância/sessão não é dado de negócio.

## TARGET

Direção obrigatória:

```text
Frontend
   │
   ▼
BFF
   ├──────────────► AI Orchestrator
   ├──────────────► Scheduling Service
   └──────────────► Evolution Go
```

Fluxo inbound obrigatório:

```text
WhatsApp
   ↓
Evolution Go
   ↓
AI Orchestrator
   ↓ quando precisar de operação de agenda
Scheduling Service
   ↓ resultado determinístico
AI Orchestrator
   ↓
Evolution Go
   ↓
WhatsApp
```

BFF não precisa e não deve ser dependência do caminho crítico inbound. Continua responsável pela API do browser e por lifecycle/configuração de WhatsApp, mas não pela execução da conversa recebida.

## Limites obrigatórios

1. Browser conhece somente BFF.
2. BFF é único backend público da aplicação web.
3. AI Orchestrator e Scheduling Service expõem somente APIs internas aos consumidores autorizados.
4. Evolution Go é transporte WhatsApp, não owner de Conversation, Message, scheduling ou IA.
5. Minha Agenda é acessada somente pelo Scheduling Service.
6. AI Orchestrator usa tools tipadas; não acessa SQL ou Minha Agenda diretamente.
7. Nenhum serviço consulta diretamente tabelas pertencentes a outro serviço.
8. Contratos podem ser compartilhados; Prisma, repositories e persistência não.
9. Tenant vem de sessão e membership validada no BFF, nunca de `tenantId` arbitrário do browser.
10. RAG futuro pertence ao AI Orchestrator e não substitui dados operacionais estruturados.
11. LangGraph futuro não é source of truth de appointments.

## Respostas canônicas do gate

| Pergunta | Owner TARGET |
| --- | --- |
| Quem é dono de Conversation? | AI Orchestrator |
| Quem é dono de Appointment? | Scheduling Service |
| Quem resolve tenant para requests do browser? | BFF |
| Quem recebe WhatsApp inbound após o transporte? | AI Orchestrator |
| Quem possui credenciais Minha Agenda? | Scheduling Service |
| Quem executa RAG? | AI Orchestrator |
| Qual é o único backend público do frontend? | BFF |
