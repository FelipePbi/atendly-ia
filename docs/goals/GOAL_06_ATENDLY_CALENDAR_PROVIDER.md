# GOAL 06 — Agenda Atendly interna

## Objetivo

Implementar a segunda fonte oficial usando o mesmo contrato do provider externo.

## Dependência

GOAL 05 concluído.

# 6.1 Criar

```text
AtendlyCalendarProvider
```

implementando exatamente `CalendarProvider`.

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

# 6.6 Reschedule

Regra obrigatória:

```text
validar novo slot
persistir mudança
somente depois considerar slot antigo liberado
```

Não executar operação destrutiva antecipadamente.

# 6.7 Cancel

```text
status = CANCELLED
preservar histórico
liberar disponibilidade
```

Não apagar appointment.

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
