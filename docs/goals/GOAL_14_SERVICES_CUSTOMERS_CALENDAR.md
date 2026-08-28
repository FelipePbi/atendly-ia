# GOAL 14 — Integrar Serviços + Clientes + Agenda

## Objetivo

Conectar todo o domínio Scheduling ao frontend novo.

## Dependência

GOAL 13 concluído.

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

# 14.2 Customers

Conectar:

```text
list
detail
create
```

Diferenciar visualmente dados externos quando necessário.

# 14.3 Agenda list

Substituir conteúdo demonstrativo por:

```text
GET /v1/appointments
```

# 14.4 Appointment detail

```text
GET /v1/appointments/:id
```

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

# 14.6 Availability

```text
GET /v1/availability
```

Source transparente para frontend.

# 14.7 Reschedule

```text
POST /:id/reschedule
```

Frontend só mostra sucesso após confirmação BFF.

# 14.8 Cancel

```text
POST /:id/cancel
```

# 14.9 Time blocks

Conectar tela existente:

```text
POST time-block
DELETE time-block
```

# 14.10 External source behavior

Frontend pode saber:

```text
source = MINHA_AGENDA
```

para UX.

Mas não deve conhecer endpoints nem detalhes técnicos do provider.

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
