# Plano de Refatoração e Integração — Atendly V1

## Regra principal de execução

Os goals são sequenciais.

Não iniciar `GOAL N+1` enquanto `GOAL N` não estiver completamente concluído.

Cada goal deve terminar com:

```text
lint          PASS
typecheck     PASS
format:check  PASS
build         PASS
migrations    PASS, quando aplicável
smoke manual  PASS
```

Neste momento:

```text
NÃO criar testes novos.
NÃO criar unit tests.
NÃO criar integration tests.
NÃO criar E2E.
```

Testes existentes podem continuar no repositório se ainda forem válidos.

Se uma implementação for removida e o teste correspondente se tornar órfão, o teste pode ser removido junto.

---

# Princípios arquiteturais obrigatórios

A arquitetura final deve respeitar:

```text
Frontend
   │
   ▼
BFF
   │
   ├──────────────► AI Orchestrator
   │
   ├──────────────► Scheduling Service
   │
   └──────────────► Evolution Go
```

Fluxo crítico do WhatsApp:

```text
WhatsApp
   │
Evolution Go
   │
AI Orchestrator
   │
LangGraph
   │
Scheduling Service quando necessário
   │
AI Orchestrator
   │
Evolution Go
   │
WhatsApp
```

Regras:

1. Frontend conhece somente BFF.
2. Frontend nunca chama AI Orchestrator.
3. Frontend nunca chama Scheduling Service.
4. Frontend nunca chama Evolution Go.
5. Frontend nunca chama Minha Agenda.
6. BFF é o backend público da aplicação web.
7. AI Orchestrator é dono das conversas e execução da IA.
8. Scheduling Service é dono da agenda.
9. Evolution Go é transporte WhatsApp.
10. Cada domínio possui uma fonte de verdade.
11. Um serviço não acessa diretamente tabelas pertencentes a outro serviço.
12. Todo dado operacional deve ser tenant-aware.
13. `tenantId` nunca é confiado diretamente ao frontend.
14. LLM nunca executa SQL.
15. LLM nunca acessa Minha Agenda diretamente.
16. Ações reais sempre passam por tools e serviços determinísticos.
17. RAG não substitui dados estruturados.
18. LangGraph não substitui banco operacional.
19. Não criar rota pública sem consumidor real no frontend.
20. Código substituído deve ser removido quando a migração estiver concluída.

---

# Arquitetura física final pretendida

```text
apps/
├── frontend/
├── bff/
├── ai-orchestrator/
├── scheduling-service/
├── evolution-go/
└── health-worker/

packages/
├── contracts/
└── legal-contract/
```

Não criar um `packages/db` compartilhado entre serviços.

Compartilhar:

```text
DTOs
Zod schemas
tipos de transporte
constants
utilities puras
```

Não compartilhar:

```text
PrismaClient
repositories
models Prisma
queries
persistence
business services
```

---

# GOAL 01 — Baseline arquitetural e inventário definitivo

## Objetivo

Criar uma fotografia precisa do estado atual e registrar formalmente a arquitetura alvo antes de alterar banco, serviços ou contratos.

Este goal é apenas estrutural/documental.

Nenhuma feature deve mudar de comportamento.

---

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



---

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

---

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

---

## 002-service-ownership.md

Criar matriz:

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

---

## 003-data-ownership.md

Registrar:

```text
Nenhum serviço acessa diretamente tabelas de outro domínio.
```

Mesmo que inicialmente os bancos estejam no mesmo cluster PostgreSQL.

---

## 004-public-api-boundary.md

Registrar:

```text
Internet/browser
      ↓
somente BFF
```

AI Orchestrator e Scheduling expõem apenas APIs internas.

---

## 005-migration-order.md

Registrar exatamente os goals deste documento.

---

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

---

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

---

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

---

# GOAL 02 — Padronização de tooling + contratos compartilhados

## Objetivo

Criar a base técnica comum para que as futuras APIs não desenvolvam DTOs incompatíveis.

---

# 2.1 Padronizar qualidade de código

Garantir em:

```text
apps/frontend
apps/bff
apps/api
```

os comandos:

```text
lint
typecheck
format
format:check
build
```

O frontend já possui esse conjunto quase completo. 

BFF e API precisam ficar equivalentes.

---

## ESLint

Usar ESLint moderno.

Configurar regras para:

```text
unused imports
unused vars
consistent type imports
no floating promises
prefer const
no implicit any
imports organizados
```

Sem criar centenas de regras cosméticas que prejudiquem produtividade.

---

## TypeScript

Ativar ou manter:

```json
{
  "strict": true
}
```

Evitar:

```text
any
unknown sem narrowing
casts desnecessários
```

---

## Prettier

Configuração única ou equivalente em todos os Node apps.

---

# 2.2 Criar packages/contracts

Estrutura:

```text
packages/contracts/
├── package.json
├── tsconfig.json
└── src/
    ├── common/
    ├── auth/
    ├── tenant/
    ├── dashboard/
    ├── conversations/
    ├── calendar/
    ├── customers/
    ├── services/
    ├── settings/
    ├── onboarding/
    ├── whatsapp/
    ├── migrations/
    └── internal/
```

---

## Contratos devem ser schemas

Preferir:

```ts
export const appointmentSchema = z.object(...)
```

e:

```ts
export type Appointment =
  z.infer<typeof appointmentSchema>;
```

ao invés de duplicar:

```text
interface frontend
interface BFF
interface API
```

---

## Separar contratos públicos e internos

Exemplo:

```text
calendar/public.ts
calendar/internal.ts
```

Frontend deve importar apenas contratos públicos.

---

## Common schemas

Criar:

```text
id
ISO datetime
pagination
money
phone
timezone
error response
request id
```

---

## Contrato de erro

Padronizar:

```ts
{
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}
```

---

## Não definir ainda contratos especulativos

Não criar:

```text
KnowledgeManagement API
billing
teams
notifications
reminders
payments
```

sem necessidade de frontend.

---

# 2.3 Padronizar Prisma

Hoje BFF e API utilizam majors diferentes de Prisma.  

Antes de criar serviços novos:

1. escolher uma major suportada;
2. atualizar de forma controlada;
3. validar geração;
4. validar migrations existentes;
5. validar build.

Não atualizar bancos e arquitetura simultaneamente.

---

## Gate GOAL 02

Todos:

```text
frontend lint PASS
frontend typecheck PASS
frontend format:check PASS
frontend build PASS

bff lint PASS
bff typecheck PASS
bff format:check PASS
bff build PASS

api lint PASS
api typecheck PASS
api format:check PASS
api build PASS

contracts build PASS
```

Nenhuma feature deve ter mudado de comportamento.

Somente então iniciar GOAL 03.

---

# GOAL 03 — Fundação multi-tenant no BFF

## Objetivo

Eliminar o conceito implícito de:

```text
User == negócio
```

antes de espalhar esse erro para novos serviços.

---

# 3.1 Novo modelo

Criar no BFF:

```text
Tenant
TenantMember
BusinessProfile
```

Manter:

```text
User
LegalAcceptance
WhatsAppInstance
```

temporariamente.

---

## Tenant

Campos mínimos:

```text
id
name
createdAt
updatedAt
```

Não adicionar slug se nenhuma funcionalidade utilizar.

---

## TenantMember

```text
id
tenantId
userId
role
createdAt
```

Role inicialmente:

```text
OWNER
```

Mesmo que V1 não possua equipes.

Unique:

```text
tenantId + userId
```

---

## BusinessProfile

Mover gradualmente dados de negócio para uma entidade tenant-scoped.

Campos do produto atual:

```text
businessName
category
timezone
language
currency
```

Não colocar:

```text
birthDate
sex
```

porque não pertencem ao domínio necessário do produto atual.

---

# 3.2 Registro transacional

Hoje o registro cria principalmente usuário/settings/legal. 

Novo fluxo:

```text
BEGIN TRANSACTION

create User
create Tenant
create TenantMember OWNER
create BusinessProfile inicial
create LegalAcceptance

COMMIT
```

Falha em qualquer ponto:

```text
ROLLBACK
```

---

# 3.3 Migrar usuários existentes

Criar migration segura:

Para cada usuário legado sem tenant:

```text
create Tenant
create TenantMember OWNER
migrar businessName se existir
```

Migration deve ser idempotente ou protegida.

Nunca criar dois tenants para o mesmo usuário legado por execução repetida.

---

# 3.4 TenantContext

Criar:

```ts
export interface TenantContext {
  userId: string;
  tenantId: string;
  role: "OWNER";
}
```

Middleware/hook:

```text
requireAuth
    ↓
resolveTenantContext
    ↓
request.tenantContext
```

---

## Regra de segurança

Nunca:

```ts
const tenantId = request.body.tenantId;
```

para definir tenant ativo.

Sempre:

```text
session
 ↓
User
 ↓
TenantMember
 ↓
Tenant
```

---

# 3.5 Preparar sessão

A sessão pode continuar contendo `userId`.

Não é obrigatório colocar `tenantId` no JWT agora.

Resolver server-side reduz risco de sessão ficar inconsistente após futuras mudanças.

---

# 3.6 Remover dependências desnecessárias de perfil legado

Preparar remoção de:

```text
birthDate
sex
custom persona
assistant sex
separate assistant
```

Não remover ainda se alguma rota corrente quebrar.

Primeiro remover consumidores.

---

# 3.7 Todas as futuras queries BFF

Repositories devem exigir:

```text
tenantId
```

quando acessarem recurso de negócio.

---

## Gate GOAL 03

Verificar manualmente:

### Novo usuário

```text
register
→ User criado
→ Tenant criado
→ OWNER criado
→ BusinessProfile criado
→ login funciona
→ /auth/session resolve tenant
```

### Usuário legado

```text
login funciona
tenant existente
nenhuma duplicação
```

### Segurança

Não deve existir rota capaz de operar tenant diferente enviando `tenantId` pelo body/query.

### Qualidade

```text
lint PASS
typecheck PASS
format:check PASS
build PASS
prisma migration PASS
```

Somente então GOAL 04.

---

# GOAL 04 — Criar Scheduling Service e domínio canônico de agenda

## Objetivo

Criar a fonte de verdade para todo o domínio de agenda antes de mover Minha Agenda ou conectar frontend.

---

# 4.1 Criar app

```text
apps/scheduling-service/
```

Stack:

```text
Node.js
TypeScript
Fastify
Zod
Prisma
PostgreSQL
```

---

# 4.2 Estrutura

```text
src/
├── app/
├── config/
├── modules/
│   ├── calendar/
│   ├── services/
│   ├── customers/
│   ├── appointments/
│   ├── availability/
│   ├── integrations/
│   ├── migrations/
│   └── time-blocks/
├── infrastructure/
└── shared/
```

---

# 4.3 Schema inicial

Criar:

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

ExternalEntityMap

MigrationJob
MigrationConflict
```

---

## Todos devem possuir tenantId onde aplicável

Exemplo:

```text
Service
├── id
├── tenantId
├── name
├── durationMinutes
├── price
├── active
└── timestamps
```

---

## Appointment

```text
id
tenantId
customerId
source
startAt
endAt
status
createdBy
createdAt
updatedAt
```

---

## AppointmentItem

```text
id
tenantId
appointmentId
serviceId
serviceNameSnapshot
durationMinutesSnapshot
priceSnapshot
```

Snapshot é obrigatório.

---

# 4.4 CalendarSettings

```text
tenantId
source
timezone
```

Source:

```text
ATENDLY
MINHA_AGENDA
```

Exatamente uma fonte oficial ativa por tenant.

---

# 4.5 IntegrationConnection

```text
id
tenantId
provider
status
credentialsEncrypted
config
lastSuccessfulSyncAt
lastErrorAt
lastErrorCode
createdAt
updatedAt
```

Credenciais nunca em plaintext.

---

# 4.6 ExternalEntityMap

Para mapear:

```text
tenant
provider
entityType
internalId
externalId
```

Exemplo:

```text
SERVICE
CUSTOMER
APPOINTMENT
```

Unique:

```text
tenantId + provider + entityType + externalId
```

---

# 4.7 API interna

Criar somente:

```text
GET /health
```

e infraestrutura para internal auth.

Não criar ainda toda API de calendário.

---

# 4.8 Internal authentication

Todas as rotas futuras:

```text
Authorization: Bearer INTERNAL_SERVICE_TOKEN
```

E contexto obrigatório:

```text
x-tenant-id
x-user-id
x-request-id
```

`x-tenant-id` só pode vir de serviços internos confiáveis.

---

## Gate GOAL 04

```text
service sobe
health funciona
DB conecta
migration executa
schema tenant-aware
nenhuma unique global inadequada
lint PASS
typecheck PASS
format PASS
build PASS
```

Ainda nenhuma feature do frontend muda.

Somente então GOAL 05.

---

# GOAL 05 — CalendarProvider + extração da Minha Agenda

## Objetivo

Reaproveitar a integração existente sem manter seu acoplamento atual.

A implementação atual já possui lógica valiosa para serviços, clientes, disponibilidade, criação, cancelamento e reagendamento. 

---

# 5.1 Criar port

```ts
interface CalendarProvider {
  listServices(...): Promise<Service[]>;

  listAppointments(...): Promise<Appointment[]>;

  getAppointment(...): Promise<Appointment>;

  getAvailability(...): Promise<AvailableSlot[]>;

  createAppointment(...): Promise<Appointment>;

  rescheduleAppointment(...): Promise<Appointment>;

  cancelAppointment(...): Promise<Appointment>;
}
```

---

# 5.2 Criar CalendarService

```text
CalendarService
    ↓
CalendarSettings
    ↓
providerFactory
    ↓
CalendarProvider
```

---

# 5.3 Mover código existente

Mover/refatorar:

```text
apps/api/src/modules/minha-agenda/client.ts
apps/api/src/modules/minha-agenda/service.ts
apps/api/src/modules/minha-agenda/availability.ts
apps/api/src/modules/minha-agenda/types.ts
```

para:

```text
scheduling-service/
modules/integrations/minha-agenda/
```

Não copiar e manter duas implementações.

---

# 5.4 MinhaAgendaProvider

Transformar facade em:

```text
MinhaAgendaCalendarProvider
```

Implementando `CalendarProvider`.

---

# 5.5 Remover envs globais por empresa

Hoje existem configurações globais de Minha Agenda. 

Eliminar dependência de:

```text
MINHA_AGENDA_DEFAULT_EMPLOYEE_ID
MINHA_AGENDA_DEFAULT_PAYMENT_METHOD
credencial única
```

como configuração de negócio global.

Resolver tudo via:

```text
tenantId
 ↓
IntegrationConnection
 ↓
credentials/config
 ↓
MinhaAgendaClient
```

---

# 5.6 Client por contexto

Nunca manter um singleton global com credencial do primeiro tenant.

Criar client factory:

```text
createMinhaAgendaClient(connection)
```

---

# 5.7 Preservar segurança atual

Preservar:

```text
assertSlotAvailable
appointmentExists
duration calculation
multi-service calculation
write guard quando aplicável
```

---

# 5.8 Idempotência

Mutations devem aceitar:

```text
Idempotency-Key
```

Principalmente:

```text
create
cancel
reschedule
```

---

# 5.9 Internal routes necessárias

Criar:

```http
GET  /internal/services
GET  /internal/appointments
GET  /internal/appointments/:id
GET  /internal/availability

POST /internal/appointments
POST /internal/appointments/:id/reschedule
POST /internal/appointments/:id/cancel
```

Ainda não expor ao frontend.

---

## Gate GOAL 05

Com um tenant de Minha Agenda:

```text
list services funciona
availability funciona
list appointments funciona
create funciona, se writes habilitados
reschedule funciona
cancel funciona
```

E:

```text
nenhuma credencial global de tenant
nenhum acesso Minha Agenda permanece no AI
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 06.

---

# GOAL 06 — Agenda Atendly interna

## Objetivo

Implementar a segunda fonte oficial usando o mesmo contrato do provider externo.

---

# 6.1 Criar

```text
AtendlyCalendarProvider
```

implementando exatamente `CalendarProvider`.

---

# 6.2 Services

Implementar:

```text
list
create
update
active/inactive
```

Serviço inativo:

```text
não pode ser usado em novos agendamentos
```

---

# 6.3 Customers

Implementar:

```text
list
get
create
```

Normalizar telefone.

Unique, quando aplicável:

```text
tenantId + normalizedPhone
```

---

# 6.4 Availability

Calcular usando:

```text
AvailabilityRule
AvailabilityException
TimeBlock
Appointments
service duration
timezone
```

---

# 6.5 Appointment create

Fluxo:

```text
validate service
validate customer
calculate duration
check availability
begin transaction
create Appointment
create snapshots
commit
```

---

# 6.6 Reschedule

Regra obrigatória:

```text
validar novo slot
persistir mudança
somente depois considerar slot antigo liberado
```

Não executar operação destrutiva antecipadamente.

---

# 6.7 Cancel

```text
status = CANCELLED
preservar histórico
liberar disponibilidade
```

Não apagar appointment.

---

# 6.8 Provider selection

```text
CalendarSettings.source
      ↓
ATENDLY
      ↓
AtendlyCalendarProvider
```

ou:

```text
MINHA_AGENDA
      ↓
MinhaAgendaCalendarProvider
```

---

## Gate GOAL 06

Executar manualmente os mesmos casos nos dois providers.

Contrato externo deve produzir o mesmo formato de domínio.

```text
ATENDLY       PASS
MINHA_AGENDA PASS

lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 07.

---

# GOAL 07 — Criar AI Orchestrator multi-tenant

## Objetivo

Transformar a API atual em serviço especializado em IA/conversas.

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

# 7.8 Conversas como fonte de verdade

AI Orchestrator passa definitivamente a ser owner de:

```text
Conversation
Message
Handoff
```

BFF ainda pode possuir cópia temporária durante migração, mas essa cópia passa a ser considerada legada.

---

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

---

# GOAL 08 — Introduzir LangChain sem alterar comportamento

## Objetivo

Substituir apenas a camada de acesso/model/tool plumbing.

Ainda não migrar orchestration para LangGraph neste goal.

---

# 8.1 Instalar dependências necessárias

Exemplo conceitual:

```text
@langchain/core
@langchain/openai
langchain
```

Adicionar apenas dependências efetivamente utilizadas.

---

# 8.2 Criar ModelProvider

```text
ModelProvider
     ↓
LangChain ChatModel
```

O restante do domínio não deve importar SDK OpenAI diretamente.

---

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

---

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

---

# 8.5 Scheduling tools

Nunca importar Scheduling internals.

Sempre usar:

```text
SchedulingClient
```

---

# 8.6 Tool idempotency

Tool mutation deve receber ou gerar identificador estável:

```text
aiRunId
toolCallId
idempotencyKey
```

Scheduling Service deve respeitar a key.

---

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

---

# GOAL 09 — Migrar orchestration para LangGraph

## Objetivo

Substituir gradualmente `MessageOrchestrator` por workflow explícito, persistente e retomável.

---

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

---

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

---

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

---

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

---

# 9.5 Persistência

Adicionar:

```text
@langchain/langgraph-checkpoint-postgres
```

Configurar schema específico:

```text
langgraph
```

---

# 9.6 Thread

```text
thread_id = Conversation.id
```

Conversation ID já é tenant-scoped.

---

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

---

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

---

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

---

# GOAL 10 — RAG multi-tenant com PostgreSQL + pgvector

## Objetivo

Adicionar conhecimento não estruturado ao atendimento sem transformar RAG em banco de regras operacionais.

---

# 10.1 Ativar pgvector

Na base AI:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

# 10.2 KnowledgeDocument

```text
id
tenantId
type
title
source
version
checksum
status
createdAt
updatedAt
```

---

# 10.3 KnowledgeChunk

```text
id
tenantId
documentId
content
metadata
embedding
createdAt
updatedAt
```

---

# 10.4 Embeddings

Criar abstração:

```text
EmbeddingProvider
```

Não espalhar chamada de embedding pelo domínio.

---

# 10.5 VectorStore

Criar:

```text
KnowledgeVectorStore
```

implementação inicial:

```text
PGVectorKnowledgeStore
```

---

# 10.6 Filtro obrigatório

Toda retrieval deve exigir:

```text
tenantId
```

A API do repository não deve permitir chamar search sem tenant.

Exemplo desejado:

```ts
search({
  tenantId,
  query,
  limit,
});
```

Não expor:

```ts
search(query);
```

---

# 10.7 O que indexar

Permitido:

```text
FAQ
orientações
cuidados
procedimentos
descrições longas
informações do negócio
políticas textuais explicitamente configuradas
```

---

# 10.8 O que NÃO indexar como fonte operacional

Não usar RAG para:

```text
preço atual
serviço ativo
agenda
slot
appointment status
customer appointment
WhatsApp status
integração status
```

---

# 10.9 Tool

Criar:

```text
search_business_knowledge
```

Output deve conter contexto suficiente para resposta, mas sem expor embedding ou internals.

---

# 10.10 Integração Graph

Fluxo:

```text
pergunta relevante
      ↓
retrieveKnowledge
      ↓
context
      ↓
agent
```

Não recuperar conhecimento para toda mensagem.

Exemplo:

```text
"Tem horário amanhã?"
→ não precisa RAG
→ Scheduling tool
```

```text
"Posso lavar o cabelo depois da progressiva?"
→ RAG
```

---

# 10.11 Sem CRUD público ainda

Como frontend atual não possui módulo de Knowledge Base:

```text
NÃO criar /v1/knowledge
NÃO criar tela
NÃO criar upload
```

Pode existir apenas infraestrutura interna/seed controlado.

---

## Gate GOAL 10

Validar manualmente:

Tenant A:

```text
documento A
```

Tenant B:

```text
documento B
```

Busca do A nunca retorna chunk B.

Mesmo com consultas semanticamente semelhantes.

Além disso:

```text
pergunta de knowledge → RAG
pergunta disponibilidade → Scheduling
preço → Scheduling
appointment → Scheduling
```

Qualidade:

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 11.

---

# GOAL 11 — BFF Public API V1

## Objetivo

Criar a superfície definitiva consumida pelo frontend.

O BFF já possui autenticação, cookie HttpOnly, request IDs, rate limiting e tratamento central de erro que devem ser preservados/refatorados. 

---

# 11.1 Estrutura modular

Migrar de:

```text
routes/*.ts
```

para:

```text
modules/
├── auth/
├── tenant/
├── onboarding/
├── dashboard/
├── conversations/
├── calendar/
├── customers/
├── services/
├── settings/
├── whatsapp/
└── migrations/
```

Clients:

```text
clients/
├── ai-orchestrator/
├── scheduling/
└── evolution/
```

---

# 11.2 Prefixo

Todas as rotas públicas novas:

```text
/v1
```

---

# 11.3 Auth

Criar/adaptar:

```http
POST  /v1/auth/register
POST  /v1/auth/login
POST  /v1/auth/logout
GET   /v1/auth/session

POST  /v1/auth/forgot-password
POST  /v1/auth/reset-password
PATCH /v1/auth/password
```

Somente implementar forgot/reset se a tela atual realmente apresenta esse fluxo; caso contrário, deixar para o goal correspondente quando o consumidor for ativado.

---

# 11.4 Onboarding

```http
GET   /v1/onboarding
PATCH /v1/onboarding
POST  /v1/onboarding/complete
```

Não rota por step.

---

# 11.5 Dashboard

```http
GET /v1/dashboard
```

BFF agrega em paralelo:

```text
platform
AI
Scheduling
WhatsApp
```

---

# 11.6 Conversations

```http
GET  /v1/conversations
GET  /v1/conversations/:id
GET  /v1/conversations/:id/messages

POST /v1/conversations/:id/messages
POST /v1/conversations/:id/takeover
POST /v1/conversations/:id/release
POST /v1/conversations/:id/resolve
```

---

# 11.7 Calendar

```http
GET  /v1/appointments
GET  /v1/appointments/:id
POST /v1/appointments

POST /v1/appointments/:id/reschedule
POST /v1/appointments/:id/cancel

GET /v1/availability

POST   /v1/time-blocks
DELETE /v1/time-blocks/:id
```

---

# 11.8 Customers

```http
GET  /v1/customers
GET  /v1/customers/:id
POST /v1/customers
```

Não adicionar edição até UI precisar.

---

# 11.9 Services

```http
GET   /v1/services
POST  /v1/services
PATCH /v1/services/:id
```

---

# 11.10 Settings

```http
GET   /v1/settings
PATCH /v1/settings/business
PATCH /v1/settings/ai
PATCH /v1/settings/availability
```

---

# 11.11 WhatsApp

```http
GET    /v1/whatsapp
POST   /v1/whatsapp/connect
POST   /v1/whatsapp/reconnect
DELETE /v1/whatsapp
```

---

# 11.12 Calendar integration

```http
GET    /v1/calendar
POST   /v1/calendar/integration/connect
POST   /v1/calendar/integration/reconnect
DELETE /v1/calendar/integration
```

Não colocar `minha-agenda` no contrato público.

---

# 11.13 Migration

```http
POST /v1/calendar/migrations/diagnose
POST /v1/calendar/migrations
GET  /v1/calendar/migrations/:id
```

---

# 11.14 Remover rotas públicas que não fazem mais parte do produto

Candidatas:

```text
persona
custom persona
ignored contacts
automation legacy
generic virtual attendant routes
consolidate
legacy internal endpoints expostos indevidamente
```

Mas remover somente após confirmar ausência total de consumidor.

---

# 11.15 TenantContext obrigatório

Todas as rotas autenticadas:

```text
requireAuth
resolveTenant
handler
```

---

# 11.16 Internal clients

Criar base:

```text
InternalHttpClient
```

Com:

```text
timeout
AbortSignal
requestId propagation
auth
JSON validation
error normalization
```

---

# 11.17 Retry

GET idempotente:

```text
retry limitado permitido
```

Mutation:

```text
sem retry automático
```

a menos que use Idempotency-Key segura.

---

## Gate GOAL 11

Cada rota criada deve possuir um consumidor previsto no frontend.

Auditar:

```text
rota BFF
→ feature frontend
```

Nenhuma rota órfã.

Todos os handlers devem:

```text
resolver tenant
validar Zod
usar clients
não acessar banco alheio
normalizar erros
```

E:

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 12.

---

# GOAL 12 — Infraestrutura real de dados no frontend

## Objetivo

Preparar o frontend para trocar mocks por BFF sem modificar cada tela de maneira improvisada.

---

# 12.1 Criar data layer

```text
src/data/
├── http/
│   └── BffHttpClient.ts
├── services/
└── mappers/
```

---

# 12.2 BffHttpClient

Responsável por:

```text
base URL
credentials include
content-type
CSRF se necessário
AbortSignal
requestId
response parsing
error mapping
```

---

# 12.3 Services

Criar:

```text
BffAuthService
BffOnboardingService
BffSettingsService
BffWhatsAppService
BffCalendarService
BffCustomerService
BffServiceCatalogService
BffConversationService
BffDashboardService
BffMigrationService
```

---

# 12.4 Não espalhar fetch

Proibido:

```ts
fetch(...)
```

diretamente em Screen/component.

---

# 12.5 Mock separation

Manter mocks para:

```text
/_preview/*
```

Produto real:

```text
BffServices
```

Preview:

```text
MockServices
```

---

# 12.6 Remover dados hardcoded do fluxo real

Hoje telas ainda possuem textos/dados demonstrativos embutidos.

Esses valores podem continuar apenas em preview.

Fluxo real deve receber dados do service.

---

## Gate GOAL 12

Nenhuma feature precisa estar completamente integrada ainda.

Mas:

```text
BffHttpClient existe
service registry existe
mocks isolados
nenhum novo fetch em component
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 13.

---

# GOAL 13 — Integrar Auth + Onboarding + Settings + WhatsApp

## Objetivo

Criar o primeiro fluxo completo:

```text
cadastro
→ onboarding
→ configuração
→ WhatsApp
→ área logada
```

---

# 13.1 Auth

Conectar:

```text
register
login
logout
session
password
```

Remover `MockAuthService` do produto real.

---

# 13.2 Session bootstrap

Ao carregar app:

```text
GET /v1/auth/session
```

Determinar:

```text
unauthenticated
onboarding incomplete
authenticated
```

---

# 13.3 Onboarding

O contrato frontend atual já contém:

```text
businessName
category
calendarSource
service
workingDays
tone
```



Refinar para DTO real.

Salvar draft progressivamente.

---

# 13.4 Agenda source

Selecionar:

```text
Agenda Atendly
Minha Agenda
```

Não trocar diretamente uma pela outra depois do onboarding.

Migração posterior utiliza fluxo específico.

---

# 13.5 AI tone

Somente:

```text
professional
friendly
```

Mapear para:

```text
Profissional e objetiva
Leve e próxima
```

---

# 13.6 Remover persona legacy da UI real

Não expor:

```text
CUSTOM
assistantName
assistantSex
persona imports
```

---

# 13.7 Settings

Conectar:

```text
Business
AI
Account
Availability
Calendar
WhatsApp
```

conforme telas existentes.

---

# 13.8 WhatsApp

Conectar lifecycle.

Estados:

```text
connected
connecting
disconnected
reconnecting
expired
error
```

QR/pairing apenas conforme suporte real do Evolution utilizado.

Não inventar pairing endpoint.

---

## Gate GOAL 13

Fluxo manual completo:

```text
register
login
onboarding
business save
AI tone save
WhatsApp connect
logout
login novamente
dados persistidos
```

Mocks não participam do produto real.

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 14.

---

# GOAL 14 — Integrar Serviços + Clientes + Agenda

## Objetivo

Conectar todo o domínio Scheduling ao frontend novo.

---

# 14.1 Services

Conectar:

```text
list
create
edit
activate/deactivate quando UI permitir
```

Para Minha Agenda:

```text
read/write deve respeitar capability real da integração
```

Não oferecer ação não suportada.

---

# 14.2 Customers

Conectar:

```text
list
detail
create
```

Diferenciar visualmente dados externos quando necessário.

---

# 14.3 Agenda list

Substituir conteúdo demonstrativo por:

```text
GET /v1/appointments
```

---

# 14.4 Appointment detail

```text
GET /v1/appointments/:id
```

---

# 14.5 New appointment

Fluxo:

```text
service
customer
date
availability
confirmation
create
```

Nunca usar slots hardcoded.

---

# 14.6 Availability

```text
GET /v1/availability
```

Source transparente para frontend.

---

# 14.7 Reschedule

```text
POST /:id/reschedule
```

Frontend só mostra sucesso após confirmação BFF.

---

# 14.8 Cancel

```text
POST /:id/cancel
```

---

# 14.9 Time blocks

Conectar tela existente:

```text
POST time-block
DELETE time-block
```

---

# 14.10 External source behavior

Frontend pode saber:

```text
source = MINHA_AGENDA
```

para UX.

Mas não deve conhecer endpoints nem detalhes técnicos do provider.

---

## Gate GOAL 14

Validar manualmente:

### Agenda Atendly

```text
service create
customer create
availability
appointment create
reschedule
cancel
time block
```

### Minha Agenda

```text
service list
customer flow
availability
appointment create
reschedule
cancel
```

conforme capacidades reais.

Frontend nunca chama Scheduling diretamente.

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 15.

---

# GOAL 15 — Integrar Conversas + takeover + WhatsApp humano

## Objetivo

Eliminar de vez o domínio duplicado de conversas no BFF.

---

# 15.1 AI Orchestrator é source of truth

BFF deixa de persistir:

```text
Conversation
Message
Handoff
```

quando integração estiver concluída.

---

# 15.2 Conversations list

```text
Frontend
 ↓
BFF
 ↓
AI Orchestrator
```

---

# 15.3 Conversation detail/messages

Conectar:

```text
GET conversation
GET messages
```

---

# 15.4 Manual message

Novo fluxo:

```text
Frontend
 ↓
BFF
 ↓
AI Orchestrator
 ↓
persist Message
 ↓
Evolution
```

BFF não envia mais diretamente ao Evolution.

Hoje essa responsabilidade ainda aparece na rota de conversations existente. 

---

# 15.5 Takeover

```text
POST takeover
```

AI deve parar de responder naquela conversation.

---

# 15.6 Release

```text
POST release
```

Devolver conversa para AI.

---

# 15.7 Resolve

Marcar atendimento resolvido sem apagar histórico.

---

# 15.8 Eliminar modelos duplicados

Quando frontend estiver usando exclusivamente AI Orchestrator via BFF:

remover do schema BFF:

```text
Conversation
Message
AiSuppressionLog
```

e modelos diretamente associados que não tenham mais uso.

---

# 15.9 Remover rotas antigas

Remover:

```text
/conversations/consolidate
legacy pause routes
legacy duplicated handoff operations
```

se não houver consumidor.

---

## Gate GOAL 15

Fluxo:

```text
cliente envia WhatsApp
mensagem aparece no painel
AI responde
mensagem aparece
humano assume
AI para
humano envia
cliente recebe
humano devolve
AI volta
```

Sem:

```text
duplicação de Conversation
duplicação de Message
BFF persistindo message
BFF enviando diretamente
```

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 16.

---

# GOAL 16 — Dashboard + Migração entre agendas

## Objetivo

Integrar os fluxos que dependem de múltiplos domínios.

---

# 16.1 Dashboard

Agora todas as dependências existem.

BFF:

```text
GET /v1/dashboard
```

faz paralelamente:

```text
AI metrics
conversations needing attention
today appointments
next appointment
calendar status
WhatsApp status
```

---

## Dashboard real

Remover:

```text
scenario baseado em query
dados estáticos
nome hardcoded
```

do fluxo de produção.

Manter cenários apenas no preview.

---

# 16.2 Estados

Derivar:

```text
operational
whatsapp disconnected
calendar integration unavailable
empty
```

de dados reais.

Não de `scenario=`.

---

# 16.3 Migration diagnose

```text
POST /calendar/migrations/diagnose
```

Deve informar:

```text
supported
conflicts
entities
warnings
limitations
```

---

# 16.4 Migration job

```text
POST /calendar/migrations
```

Retorna:

```text
migrationId
```

---

# 16.5 Status

```text
GET /calendar/migrations/:id
```

Estados:

```text
PENDING
ANALYZING
RUNNING
PARTIAL
COMPLETED
FAILED
```

---

# 16.6 Não permitir toggle

Nunca:

```text
source = MINHA_AGENDA
↓ toggle
source = ATENDLY
```

Sem processo de migração.

---

# 16.7 Conclusão

Somente alterar fonte oficial após sucesso das condições definidas pelo processo.

---

## Gate GOAL 16

Dashboard:

```text
Agenda Atendly real
Minha Agenda real
WhatsApp connected
WhatsApp disconnected
integration unavailable
empty
```

Migration:

```text
diagnose
conflict
start
progress
partial/failure
success
```

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 17.

---

# GOAL 17 — Remoção definitiva do legado

## Objetivo

Evitar que a nova arquitetura conviva indefinidamente com a antiga.

---

# 17.1 Frontend

Remover mocks do produto real.

Manter somente os realmente usados no preview.

Remover:

```text
unused scenarios
unused services
unused props
unused hardcoded fixtures
```

---

# 17.2 BFF

Remover:

```text
PersonaConversationImport
CustomPersonaStatus
CUSTOM persona
SEPARATE_ASSISTANT
assistantName
assistantSex
birthDate
sex
legacy webhook ingestion
legacy Evolution parser
duplicated Conversation
duplicated Message
duplicated handoff
ignored contacts se não houver feature
```

---

# 17.3 AI Orchestrator

Remover:

```text
legacy OpenAI client
old MessageOrchestrator
Minha Agenda module
legal module
legacy business settings
legacy virtual attendant
internal endpoints sem consumidor
```

---

# 17.4 Scheduling

Remover quaisquer adapters temporários usados somente durante migração.

---

# 17.5 Dependencies

Executar auditoria de packages.

Remover dependências não importadas.

---

# 17.6 Env

Remover:

```text
envs Minha Agenda globais
envs de persona antiga
envs de rotas removidas
```

Atualizar `.env.example`.

---

# 17.7 Código morto

Não criar:

```text
legacy/
old/
deprecated/
_backup/
```

Git é o histórico.

---

## Gate GOAL 17

Search no repositório por termos antigos.

Exemplos:

```text
CUSTOM
PersonaConversationImport
SEPARATE_ASSISTANT
MinhaAgendaServiceFacade no AI
whatsappPhone @unique global
Mock* em fluxo de produção
```

Resultado deve ser zero ou possuir justificativa documentada.

Depois:

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 18.

---

# GOAL 18 — Deploy, observabilidade e auditoria arquitetural final

## Objetivo

Garantir que a arquitetura também funcione corretamente fora do ambiente local.

---

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

---

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

---

# 18.3 Health

Cada serviço:

```http
GET /health
```

Health não deve executar operações caras.

---

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

---

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

---

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

---

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

---

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

---

# Ordem definitiva

```text
GOAL 01 — Baseline e arquitetura
   ↓
GOAL 02 — Tooling + contracts
   ↓
GOAL 03 — Multi-tenancy BFF
   ↓
GOAL 04 — Scheduling foundation
   ↓
GOAL 05 — Minha Agenda Provider
   ↓
GOAL 06 — Atendly Calendar Provider
   ↓
GOAL 07 — AI Orchestrator multi-tenant
   ↓
GOAL 08 — LangChain
   ↓
GOAL 09 — LangGraph
   ↓
GOAL 10 — RAG + pgvector
   ↓
GOAL 11 — BFF API V1
   ↓
GOAL 12 — Frontend data layer
   ↓
GOAL 13 — Auth/Onboarding/Settings/WhatsApp
   ↓
GOAL 14 — Services/Customers/Calendar
   ↓
GOAL 15 — Conversations/Handoff
   ↓
GOAL 16 — Dashboard/Migration
   ↓
GOAL 17 — Legacy cleanup
   ↓
GOAL 18 — Deploy/audit final
```

## Regra para o Codex

Cada execução deve receber:

```text
1. contexto global da arquitetura;
2. número do goal atual;
3. somente o escopo daquele goal;
4. lista explícita do que não fazer;
5. critérios de aceite;
6. comandos obrigatórios de validação;
7. ordem para não iniciar o próximo goal.
```

Nunca pedir:

```text
"implemente toda a nova arquitetura"
```

em uma única execução.

Cada goal deve produzir um repositório consistente, compilável e executável antes que o próximo comece.