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

## Dependência

GOAL 12 concluído.

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

# 13.4 Agenda source

Selecionar:

```text
Agenda Atendly
Minha Agenda
```

Não trocar diretamente uma pela outra depois do onboarding.

Migração posterior utiliza fluxo específico.

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

# 13.6 Remover persona legacy da UI real

Não expor:

```text
CUSTOM
assistantName
assistantSex
persona imports
```

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
