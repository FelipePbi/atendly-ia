# GOAL 16 — Dashboard + Migração entre agendas

## Objetivo

Integrar os fluxos que dependem de múltiplos domínios.

## Dependência

GOAL 15 concluído.

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

## Dashboard real

Remover:

```text
scenario baseado em query
dados estáticos
nome hardcoded
```

do fluxo de produção.

Manter cenários apenas no preview.

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

# 16.4 Migration job

```text
POST /calendar/migrations
```

Retorna:

```text
migrationId
```

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

# 16.6 Não permitir toggle

Nunca:

```text
source = MINHA_AGENDA
↓ toggle
source = ATENDLY
```

Sem processo de migração.

# 16.7 Conclusão

Somente alterar fonte oficial após sucesso das condições definidas pelo processo.

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
