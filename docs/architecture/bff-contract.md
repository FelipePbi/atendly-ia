# Contrato do BFF

Base local: `http://localhost:3002`

## Respostas

Sucesso:

```json
{
  "data": {},
  "requestId": "..."
}
```

Erro:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required."
  },
  "requestId": "..."
}
```

## Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/change-password`

Sessao:

- Cookie: `atendly_session`
- `HttpOnly`
- `Secure` em producao
- `SameSite=Lax` por padrao

## Onboarding

- `GET /onboarding`
- `PATCH /onboarding/profile`
- `POST /onboarding/complete`

O frontend ja encaminha `/api/onboarding`, `/api/onboarding/profile` e `/api/onboarding/complete` para estes endpoints do BFF.

## WhatsApp

- `GET /whatsapp/status`
- `POST /whatsapp/instance`
- `DELETE /whatsapp/instance`
- `POST /whatsapp/connect`
- `GET /whatsapp/qr`
- `GET /whatsapp/contacts`
- `POST /whatsapp/logout`

O frontend ja encaminha as rotas `/api/whatsapp/*` e `/api/automation/evolution-contacts` para estes endpoints do BFF.

## Configuracoes

- `GET /business-settings`
- `PATCH /business-settings`
- `GET /virtual-attendant/settings`
- `PATCH /virtual-attendant/settings`
- `GET /virtual-attendant/prompt-preview`
- `POST /virtual-attendant/persona/import`
- `GET /virtual-attendant/persona/imports`
- `POST /virtual-attendant/persona/generate`
- `GET /automation/ai`
- `PATCH /automation/ai`

O frontend ja encaminha `/api/automation/business-settings`, `/api/automation/ai`, `/api/virtual-attendant/settings`, `/api/virtual-attendant/prompt-preview` e `/api/virtual-attendant/persona/*` para estes endpoints do BFF.

## Lista de ignorados

- `GET /ignored-contacts`
- `POST /ignored-contacts`
- `POST /ignored-contacts/bulk`
- `DELETE /ignored-contacts/:id`

O frontend ja encaminha `/api/automation/ignored-contacts`, `/api/automation/ignored-contacts/bulk` e `/api/automation/ignored-contacts/:id` para estes endpoints do BFF.

## Conversas

- `GET /conversations`
- `GET /conversations/:id/messages`
- `PATCH /conversations/:id`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/ai/pause`
- `POST /conversations/:id/ai/resume`

O frontend ja encaminha `/api/conversations`, `/api/conversations/:id`, `/api/conversations/:id/messages`, `/api/conversations/:id/ai/pause` e `/api/conversations/:id/ai/resume` para estes endpoints do BFF.

## Health

- `GET /health`
- `GET /health/dependencies`

## Webhooks

- `POST /webhooks/evolution-go?token=...`

Esta rota valida `EVOLUTION_WEBHOOK_SECRET` e encaminha para a API quando `API_EVOLUTION_WEBHOOK_TOKEN` estiver configurado.
