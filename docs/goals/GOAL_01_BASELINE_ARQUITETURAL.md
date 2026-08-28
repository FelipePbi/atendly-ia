# GOAL 01 — Baseline arquitetural e inventário definitivo

## Objetivo

Criar uma fotografia precisa do estado atual e registrar formalmente a arquitetura alvo antes de alterar banco, serviços ou contratos.

Este goal é apenas estrutural/documental.

Nenhuma feature deve mudar de comportamento.

## Estado atual relevante

O frontend já possui módulos como:

```text
auth
calendar
conversations
customers
dashboard
migration
onboarding
services
settings
```

e mocks correspondentes.

O BFF atual ainda contém diretamente:

```text
auth
conversations
ignored contacts
onboarding
settings
webhooks
whatsapp
```

A API atual concentra:

```text
assistant
MessageOrchestrator
Minha Agenda
OpenAI
handoff
idempotency
channel
internal routes
```

## Implementar

Criar:

```text
docs/architecture/
├── 001-target-architecture.md
├── 002-service-ownership.md
├── 003-data-ownership.md
├── 004-public-api-boundary.md
└── 005-migration-order.md
```

## 001-target-architecture.md

Documentar:

```text
Frontend -> BFF

BFF -> AI Orchestrator
BFF -> Scheduling Service
BFF -> Evolution Go

Evolution Go -> AI Orchestrator
AI Orchestrator -> Scheduling Service
AI Orchestrator -> Evolution Go
```

Registrar explicitamente que BFF não precisa estar no caminho crítico das mensagens inbound do WhatsApp.

## 002-service-ownership.md

Criar matriz.

### BFF

Owner de:

```text
User
Tenant
TenantMember
LegalAcceptance
BusinessProfile
sessão
autenticação
onboarding de conta
configuração de conta
lifecycle WhatsApp
```

### AI Orchestrator

Owner de:

```text
Conversation
Message
Handoff
AiRun
AiToolCall
AI settings operacionais
LangGraph checkpoints
RAG
KnowledgeDocument
KnowledgeChunk
```

### Scheduling Service

Owner de:

```text
CalendarSettings
IntegrationConnection
Customer
Service
AvailabilityRule
AvailabilityException
TimeBlock
Appointment
AppointmentItem
MigrationJob
MigrationConflict
ExternalEntityMap
```

### Evolution Go

Owner somente do transporte e estado necessário para WhatsApp.

## 003-data-ownership.md

Registrar:

```text
Nenhum serviço acessa diretamente tabelas de outro domínio.
```

Mesmo que inicialmente os bancos estejam no mesmo cluster PostgreSQL.

## 004-public-api-boundary.md

Registrar:

```text
Internet/browser
      ↓
somente BFF
```

AI Orchestrator e Scheduling expõem apenas APIs internas.

## 005-migration-order.md

Registrar exatamente os goals deste documento.

## Inventário de código

Produzir tabela:

```text
arquivo atual
responsabilidade
destino
ação
```

Ações possíveis:

```text
KEEP
MOVE
REFACTOR
REPLACE
REMOVE
```

Principalmente:

```text
apps/api/src/modules/*
apps/bff/src/routes/*
apps/bff/src/services/*
apps/frontend/src/mocks/*
```

## Não fazer

Não:

```text
alterar Prisma
mover apps/api
instalar LangChain
instalar LangGraph
adicionar pgvector
alterar frontend
criar novas rotas
```

## Gate GOAL 01

Deve existir documentação suficiente para responder sem ambiguidade:

```text
Quem é dono de Conversation?
Quem é dono de Appointment?
Quem resolve tenant?
Quem recebe WhatsApp inbound?
Quem possui credenciais Minha Agenda?
Quem executa RAG?
Quem é o único backend público?
```

Respostas obrigatórias:

```text
Conversation        -> AI Orchestrator
Appointment         -> Scheduling
tenant              -> BFF
WhatsApp inbound    -> AI Orchestrator
Minha Agenda creds  -> Scheduling
RAG                 -> AI Orchestrator
public backend      -> BFF
```

Somente então iniciar GOAL 02.
