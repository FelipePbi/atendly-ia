# BFF Public API V1 — inventário do runtime

Este arquivo registra as rotas atualmente montadas por `apps/bff/src/app.ts` e consumidas pelo frontend. Ele descreve o contrato existente; não define direção de produto nem propõe uma API nova.

Para comportamento vigente, prevalece [`../../docs/product-vault/00-HOME.md`](../../docs/product-vault/00-HOME.md).

## Rotas registradas

| Área | Rotas |
| --- | --- |
| Saúde | `GET /health`; `GET /health/dependencies` |
| Autenticação | `POST /v1/auth/register`; `POST /v1/auth/login`; `POST /v1/auth/logout`; `GET /v1/auth/session`; `PATCH /v1/auth/password`; `POST /v1/auth/forgot-password`; `POST /v1/auth/reset-password` |
| Onboarding | `GET /v1/onboarding`; `PATCH /v1/onboarding`; `POST /v1/onboarding/complete` |
| Home | `GET /v1/dashboard` |
| Conversas | `GET /v1/conversations`; `GET /v1/conversations/:id`; `GET /v1/conversations/:id/messages`; `POST /v1/conversations/:id/messages`; `POST /v1/conversations/:id/takeover`; `POST /v1/conversations/:id/release`; `POST /v1/conversations/:id/resolve` |
| Agendamentos | `GET /v1/appointments`; `GET /v1/appointments/:id`; `POST /v1/appointments`; `POST /v1/appointments/:id/reschedule`; `POST /v1/appointments/:id/cancel` |
| Disponibilidade e bloqueios | `GET /v1/availability`; `POST /v1/time-blocks`; `DELETE /v1/time-blocks/:id` |
| Clientes | `GET /v1/customers`; `GET /v1/customers/:id`; `POST /v1/customers` |
| Serviços | `GET /v1/services`; `POST /v1/services`; `PATCH /v1/services/:id` |
| Configurações | `GET /v1/settings`; `PATCH /v1/settings/business`; `PATCH /v1/settings/ai`; `PATCH /v1/settings/availability` |
| WhatsApp | `GET /v1/whatsapp`; `POST /v1/whatsapp/connect`; `POST /v1/whatsapp/reconnect`; `DELETE /v1/whatsapp` |

As rotas autenticadas resolvem o negócio a partir da sessão; `tenantId` enviado isoladamente pelo browser não concede autorização.

## Contratos legados ainda ativos

As rotas abaixo também estão registradas e possuem consumidores no frontend atual:

| Conceito legado | Rotas atuais |
| --- | --- |
| Estado/fonte de calendário | `GET /v1/calendar` |
| Conexão operacional de agenda externa | `POST /v1/calendar/integration/connect`; `POST /v1/calendar/integration/reconnect`; `DELETE /v1/calendar/integration` |
| Migração bidirecional | `POST /v1/calendar/migrations/diagnose`; `POST /v1/calendar/migrations`; `GET /v1/calendar/migrations/:id` |

O contrato público ainda expõe `ATENDLY | EXTERNAL`, e onboarding/configurações ainda expõem `PROFESSIONAL_OBJECTIVE | LIGHT_CLOSE`. Esses valores são fatos do runtime atual e dívida técnica, não opções válidas para novos fluxos.

Pela regra de produto vigente:

- Agenda Atendly é a única agenda operacional;
- Minha Agenda só pode participar da importação única;
- não existe conexão operacional, troca de fonte ou migração reversa;
- os estilos da IA são Profissional, Equilibrada e Descontraída.

A futura revisão técnica deve migrar consumidores antes de remover ou alterar essas rotas e enums. Este documento não determina o desenho do contrato substituto.
