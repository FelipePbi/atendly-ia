# GOAL 11 — BFF Public API V1

## Objetivo

Criar a superfície definitiva consumida pelo frontend.

O BFF já possui autenticação, cookie HttpOnly, request IDs, rate limiting e tratamento central de erro que devem ser preservados/refatorados.

## Dependência

GOAL 10 concluído.

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

# 11.2 Prefixo

Todas as rotas públicas novas:

```text
/v1
```

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

# 11.4 Onboarding

```http
GET   /v1/onboarding
PATCH /v1/onboarding
POST  /v1/onboarding/complete
```

Não rota por step.

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

# 11.8 Customers

```http
GET  /v1/customers
GET  /v1/customers/:id
POST /v1/customers
```

Não adicionar edição até UI precisar.

# 11.9 Services

```http
GET   /v1/services
POST  /v1/services
PATCH /v1/services/:id
```

# 11.10 Settings

```http
GET   /v1/settings
PATCH /v1/settings/business
PATCH /v1/settings/ai
PATCH /v1/settings/availability
```

# 11.11 WhatsApp

```http
GET    /v1/whatsapp
POST   /v1/whatsapp/connect
POST   /v1/whatsapp/reconnect
DELETE /v1/whatsapp
```

# 11.12 Calendar integration

```http
GET    /v1/calendar
POST   /v1/calendar/integration/connect
POST   /v1/calendar/integration/reconnect
DELETE /v1/calendar/integration
```

Não colocar `minha-agenda` no contrato público.

# 11.13 Migration

```http
POST /v1/calendar/migrations/diagnose
POST /v1/calendar/migrations
GET  /v1/calendar/migrations/:id
```

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

# 11.15 TenantContext obrigatório

Todas as rotas autenticadas:

```text
requireAuth
resolveTenant
handler
```

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
