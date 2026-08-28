# GOAL 05 — CalendarProvider + extração da Minha Agenda

## Objetivo

Reaproveitar a integração existente sem manter seu acoplamento atual.

A implementação atual já possui lógica valiosa para serviços, clientes, disponibilidade, criação, cancelamento e reagendamento.

## Dependência

GOAL 04 concluído.

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

# 5.4 MinhaAgendaProvider

Transformar facade em:

```text
MinhaAgendaCalendarProvider
```

Implementando `CalendarProvider`.

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

# 5.6 Client por contexto

Nunca manter um singleton global com credencial do primeiro tenant.

Criar client factory:

```text
createMinhaAgendaClient(connection)
```

# 5.7 Preservar segurança atual

Preservar:

```text
assertSlotAvailable
appointmentExists
duration calculation
multi-service calculation
write guard quando aplicável
```

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
