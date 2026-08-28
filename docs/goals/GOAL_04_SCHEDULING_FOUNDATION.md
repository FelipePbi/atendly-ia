# GOAL 04 — Criar Scheduling Service e domínio canônico de agenda

## Objetivo

Criar a fonte de verdade para todo o domínio de agenda antes de mover Minha Agenda ou conectar frontend.

## Dependência

GOAL 03 concluído.

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

# 4.7 API interna

Criar somente:

```text
GET /health
```

e infraestrutura para internal auth.

Não criar ainda toda API de calendário.

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
