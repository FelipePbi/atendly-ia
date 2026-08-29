# Public API V1 — consumer map

Este contrato foi derivado das telas e fluxos já aprovados em `apps/frontend`. O frontend permanece em mocks até o GOAL 12 e conhece somente o BFF.

| Consumidor planejado                      | Contrato BFF                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro, login, recuperação e nova senha | `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/session`, `PATCH /v1/auth/password`, `POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password` |
| Onboarding                                | `GET /v1/onboarding`, `PATCH /v1/onboarding`, `POST /v1/onboarding/complete`                                                                                                                |
| Dashboard                                 | `GET /v1/dashboard`                                                                                                                                                                         |
| Conversas e handoff                       | `GET /v1/conversations`, `GET /v1/conversations/:id`, `GET                                                                                                                                  | POST /v1/conversations/:id/messages`, `POST /v1/conversations/:id/takeover`, `POST /v1/conversations/:id/release`, `POST /v1/conversations/:id/resolve` |
| Agenda                                    | `GET /v1/calendar`, `GET                                                                                                                                                                    | POST /v1/appointments`, `POST /v1/appointments/:id/reschedule`, `POST /v1/appointments/:id/cancel`, `GET /v1/availability`, `POST                       | DELETE /v1/time-blocks` |
| Clientes                                  | `GET                                                                                                                                                                                        | POST /v1/customers`, `GET /v1/customers/:id`                                                                                                            |
| Serviços                                  | `GET                                                                                                                                                                                        | POST /v1/services`, `PATCH /v1/services/:id`                                                                                                            |
| Configurações                             | `GET /v1/settings`, `PATCH /v1/settings/business`, `PATCH /v1/settings/ai`, `PATCH /v1/settings/availability`                                                                               |
| WhatsApp                                  | `GET                                                                                                                                                                                        | DELETE /v1/whatsapp`, `POST /v1/whatsapp/connect`, `POST /v1/whatsapp/reconnect`                                                                        |
| Integração de agenda                      | `GET /v1/calendar`, `POST /v1/calendar/integration/connect`, `POST /v1/calendar/integration/reconnect`, `DELETE /v1/calendar/integration`                                                   |
| Migração assistida                        | `POST /v1/calendar/migrations/diagnose`, `POST /v1/calendar/migrations`, `GET /v1/calendar/migrations/:id`                                                                                  |

## Limites deliberados

- `tenantId` nunca é aceito do browser para autorização; vem da sessão e membership.
- A origem pública da agenda usa `ATENDLY` ou `EXTERNAL`; detalhes de provider não vazam.
- Clientes da agenda externa são marcados como gerenciados externamente quando o provider não oferece listagem confirmada.
- Migração reversa para provider externo é rejeitada enquanto a capacidade não estiver confirmada.
- Criar uma migração registra o diagnóstico/revisão; não troca silenciosamente a fonte oficial.
- Rotas legadas não são mantidas como contrato paralelo. O webhook legado continua apenas como boundary de provider até o GOAL 17.
