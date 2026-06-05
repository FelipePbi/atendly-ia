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
- `GET /automation/ai`
- `PATCH /automation/ai`

O frontend ja encaminha `/api/automation/business-settings`, `/api/automation/ai`, `/api/virtual-attendant/settings` e `/api/virtual-attendant/prompt-preview` para estes endpoints do BFF.

## Lista de ignorados

- `GET /ignored-contacts`
- `POST /ignored-contacts`
- `DELETE /ignored-contacts/:id`

## Conversas

- `GET /conversations`
- `GET /conversations/:id/messages`
- `PATCH /conversations/:id`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/ai/pause`
- `POST /conversations/:id/ai/resume`

## Health

- `GET /health`
- `GET /health/dependencies`

## Webhooks

- `POST /webhooks/evolution-go?token=...`

Esta rota valida `EVOLUTION_WEBHOOK_SECRET` e encaminha para a API quando `API_EVOLUTION_WEBHOOK_TOKEN` estiver configurado.
