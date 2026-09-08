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

## Sessão, CSRF e origem

O portador continua sendo o JWT, no cookie de sessão ou em `Authorization: Bearer`. O que mudou é que ele carrega uma identidade de sessão (`sid`) verificada no servidor a cada requisição:

- sessão inexistente, expirada ou revogada devolve `401 UNAUTHORIZED`, mesmo com o JWT ainda dentro da validade;
- um JWT emitido antes desta identidade não tem `sid` e devolve `401 SESSION_REAUTH_REQUIRED`: é preciso autenticar de novo, e nenhuma sessão é criada a partir dele;
- `POST /v1/auth/logout` revoga a sessão no servidor; `PATCH /v1/auth/password` e `POST /v1/auth/reset-password` revogam **todas** as sessões do usuário, cookie e Bearer.

Mutações autenticadas por cookie exigem duas provas, ambas verificadas antes de qualquer efeito:

| Prova | Como é enviada | Recusa |
| --- | --- | --- |
| Origem | `Origin` (ou origem de `Referer`) na allowlist de `FRONTEND_ORIGIN` | `403 CSRF_ORIGIN_REJECTED` |
| Token de CSRF | header `x-csrf-token` da requisição | `403 CSRF_TOKEN_REJECTED` |

O token de CSRF é emitido junto com a sessão e conferido contra o valor guardado **naquela** sessão: o token de outra sessão não passa. Requisições autenticadas por Bearer não usam credencial ambiente e não exigem CSRF; a distinção vem da credencial efetivamente verificada, não de um header declarado.

### Como o cliente obtém o token

O BFF devolve o token vigente em **duas** formas, com o mesmo valor:

| Canal | Quando | Para quem serve |
| --- | --- | --- |
| Cookie legível `atendly_csrf` | ao estabelecer sessão (register, login, troca de senha) | cliente na mesma origem do BFF |
| Header de resposta `x-csrf-token` | ao estabelecer sessão **e** em toda resposta autenticada por cookie, inclusive de erro | cliente em outra origem, que é o caso do ambiente publicado |

O header existe porque o cookie legível é gravado no host do BFF. Quando frontend e BFF estão em hosts distintos sob um sufixo público, `document.cookie` do frontend nunca enxerga esse cookie e ler dali devolveria sempre vazio — toda mutação por cookie cairia em `403 CSRF_TOKEN_REJECTED`, inclusive `POST /v1/auth/logout`. O header é exposto no CORS apenas para `FRONTEND_ORIGIN`; uma página de outra origem não consegue lê-lo, exatamente como não consegue ler o corpo da resposta.

O token é estável enquanto a sessão viver, então uma segunda aba ou um reload recuperam o mesmo valor na primeira leitura autenticada. Requisições anônimas e autenticadas por Bearer não recebem o header.

`POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/logout`, `POST /v1/auth/forgot-password` e `POST /v1/auth/reset-password` exigem origem permitida mesmo sem sessão estabelecida.

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

## Vínculo WhatsApp: estados ambíguos

`GET /v1/whatsapp` também reprojeta a credencial da instância na IA. É idempotente e não altera o estado do número; existe para que um vínculo criado antes da projeção cifrada se restabeleça sozinho, sem o negócio precisar reconectar o número na mão. Falha nessa projeção é registrada e não impede a leitura de status.

Quando o vínculo não é inequívoco, todas as rotas de WhatsApp recusam com `409 CONFLICT` antes de qualquer efeito. Há dois estados distintos:

| Estado | O que é | Resolução |
| --- | --- | --- |
| Pendente | linha do próprio usuário autenticado, sem negócio dono, deixada assim pelo backfill; nenhum outro negócio a reivindica | o dono descarta com `DELETE /v1/whatsapp` e conecta o número de novo |
| Divergente | duas linhas concorrentes, ou uma linha cujo dono de negócio e dono de usuário são contas diferentes | fora do autoatendimento: resolver envolveria decidir pelo outro negócio; depende de operação |

`DELETE /v1/whatsapp` é a única rota que trata o estado pendente como resolvível, e apenas para o dono autenticado da linha. No estado pendente a credencial não é abrível — a cifra está ligada ao negócio —, então o logout autenticado no transporte é pulado; a instância remota ainda é removida pela credencial administrativa. No estado divergente a rota recusa como as demais, sem apagar nada.

## Mensagem: estado de entrega

O DTO de mensagem de `GET /v1/conversations/:id/messages`, `POST /v1/conversations/:id/messages` e do `lastMessage` de conversa passou a expor o estado de entrega **por operação**, em dois campos opcionais:

| Campo | Valores | Significado |
| --- | --- | --- |
| `deliveryState` | `PENDING`, `SENT`, `FAILED`, `UNKNOWN`, `null` | estado da tentativa de saída |
| `deliveryDetail` | texto curto ou `null` | motivo, quando o estado não é `SENT` |

Os campos são opcionais e podem vir `null`: mensagem recebida (`INBOUND`) não tem entrega, e mensagens gravadas antes desta versão ficaram sem estado ou como `UNKNOWN` pelo backfill. Consumidores devem tratar ausência como "sem informação", nunca como sucesso.

`UNKNOWN` é o estado que a plataforma **não pode afirmar**: o envio saiu e o transporte não respondeu a tempo, ou respondeu erro de servidor. A tentativa não é apagada nem reenviada automaticamente — ela muda de estado apenas por reconciliação, quando o transporte devolve o ID externo ou quando chega o recibo `Delivered`/`Read`. Até lá, apresente a mensagem como incerta, não como enviada.

`FAILED` significa que a saída comprovadamente não foi entregue: recusa definitiva do transporte, credencial do canal ainda não projetada, ou resposta cancelada porque o cliente mandou mensagem nova antes do envio. A entrega é *at-least-once* com dedupe e reconciliação; a API não promete exactly-once.

`POST /v1/conversations/:id/messages` continua respondendo `201` com a mensagem criada. O sucesso do HTTP significa que a tentativa foi registrada de forma durável, não que o WhatsApp já entregou: quem diz isso é `deliveryState`.
