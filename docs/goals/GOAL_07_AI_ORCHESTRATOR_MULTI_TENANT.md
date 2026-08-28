# GOAL 07 — Criar AI Orchestrator multi-tenant

## Objetivo

Transformar a API atual em serviço especializado em IA/conversas.

## Dependência

GOAL 06 concluído.

# 7.1 Renomear somente após agenda sair

```text
apps/api
  ↓
apps/ai-orchestrator
```

Atualizar:

```text
render.yaml
package names
paths
Dockerfiles
health worker targets
docs
env examples
```

# 7.2 Reaproveitar

Manter/refatorar:

```text
MessageOrchestrator
AssistantService
EvolutionInboundMapper
EvolutionProvider
WhatsAppProvider
HandoffService
IdempotencyStore
prompt rules
phone utilities
logging
redaction
```

# 7.3 Remover responsabilidade de agenda

Nenhum import de:

```text
MinhaAgendaClient
MinhaAgendaServiceFacade
```

deve permanecer.

Criar:

```text
SchedulingClient
```

# 7.4 Novo schema AI

Criar/migrar:

```text
Conversation
Message
ProcessedEvent
AiRun
AiToolCall
Handoff
AiTenantConfig
ChannelConnection
```

# 7.5 Corrigir uniques globais

O schema atual possui várias uniques incompatíveis com SaaS multi-tenant.

Alterar:

```text
whatsappPhone @unique
```

para algo semelhante a:

```text
tenantId + channelId + externalContactId
```

Mensagem:

```text
tenantId + channelId + externalMessageId
```

Evento:

```text
tenantId + provider + eventKey
```

# 7.6 Contexto inbound

Webhook/dispatch deve resolver:

```text
Evolution instance
       ↓
ChannelConnection
       ↓
tenantId
```

Nunca inferir tenant apenas pelo telefone do cliente.

# 7.7 SchedulingClient

Tools antigas deixam de chamar Minha Agenda.

Passam a chamar:

```text
AI Orchestrator
       ↓
SchedulingClient
       ↓
Scheduling Service
```

# 7.8 Conversas como fonte de verdade

AI Orchestrator passa definitivamente a ser owner de:

```text
Conversation
Message
Handoff
```

BFF ainda pode possuir cópia temporária durante migração, mas essa cópia passa a ser considerada legada.

## Gate GOAL 07

Fluxo manual:

```text
Evolution inbound
→ tenant resolvido
→ conversation criada
→ message persistida
→ AI atual executada
→ scheduling chamado quando necessário
→ resposta enviada
```

E:

```text
nenhum unique global inseguro
nenhuma dependência Minha Agenda
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 08.
