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
| Conversas | `GET /v1/conversations`; `GET /v1/conversations/:id`; `GET /v1/conversations/:id/messages`; `POST /v1/conversations/:id/messages`; `POST /v1/conversations/:id/takeover`; `POST /v1/conversations/:id/release`; `POST /v1/conversations/:id/resolve`; `PUT /v1/conversations/:id/category`; `PUT /v1/conversations/:id/ignore` |
| Agendamentos | `GET /v1/appointments`; `GET /v1/appointments/:id`; `POST /v1/appointments`; `POST /v1/appointments/:id/reschedule`; `POST /v1/appointments/:id/cancel` |
| Disponibilidade e bloqueios | `GET /v1/availability`; `POST /v1/time-blocks`; `DELETE /v1/time-blocks/:id` |
| Clientes | `GET /v1/customers`; `GET /v1/customers/:id`; `POST /v1/customers`; `PATCH /v1/customers/:id`; `PUT /v1/customers/:id/primary-guardian`; `POST /v1/customers/:id/primary-guardian/confirm`; `DELETE /v1/customers/:id/primary-guardian`; `POST /v1/customers/:id/notes`; `PATCH /v1/customers/:id/notes/:noteId`; `DELETE /v1/customers/:id/notes/:noteId`; `POST /v1/customers/:id/tags`; `PATCH /v1/customers/:id/tags/:tagId`; `DELETE /v1/customers/:id/tags/:tagId` |
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

## Clientes: identidade por ID

O cliente é uma **pessoa**, identificada pelo ID dentro do negócio. O telefone é contato, não identidade:

- `phone` é opcional na criação e na resposta. Um cliente pode existir só com nome — criança, pessoa agendada presencialmente. O que a criação recusa é um cadastro sem nome **e** sem telefone.
- o mesmo número pode pertencer a mais de uma pessoa do mesmo negócio. `GET /v1/customers?phone=...` devolve **candidatos** (zero, um ou vários) e marca a resposta com `filteredByPhone: true`; nenhuma rota resolve identidade a partir do número.
- nome e telefone só mudam por `PATCH /v1/customers/:id`. Nenhuma outra rota renomeia, funde ou deduplica pessoas.
- `GET /v1/customers/:id` devolve, além dos dados básicos, `primaryGuardian`, `notes` e `tags`. Consumidores que só conhecem o contrato anterior continuam válidos: os campos novos são adicionais.

`POST /v1/appointments` aceita `customerId` para uma pessoa já resolvida ou `customerName`/`customerPhone` para criar o cadastro **na confirmação** — a criação acontece dentro da transação do agendamento, depois de o horário ser validado. Consultar preço ou disponibilidade não cria ninguém, e uma confirmação que falha no horário também não. `GET /v1/appointments` aceita `customerId` (a pessoa) e `customerPhone` (todos os candidatos do número).

### Responsável principal

`PUT /v1/customers/:id/primary-guardian` grava a relação com proveniência (`proposedBy`) e estado (`status`). A relação nasce `PROPOSED` e só vira `CONFIRMED` com confirmação explícita — no corpo do `PUT` ou por `POST .../primary-guardian/confirm`. Uma relação apenas proposta não é afirmada para a IA. No MVP existe no máximo um responsável principal por cliente.

### Observações e tags: autorização de uso pela IA

`aiAuthorized` é atributo do **registro**, não do prompt, e nasce `false`. A IA lê o cliente por um recorte próprio no Scheduling que carrega apenas notas e tags autorizadas; retirar a autorização (`PATCH` com `aiAuthorized: false`) volta a escondê-las. A interface de cadastro completo é do Goal015.

`actor` nunca vem do corpo destas rotas: a proveniência (`createdBy`/`authorizedBy`/`proposedByActor`/`confirmedByActor`) é sempre derivada da sessão autenticada.

## Catálogo: quatro semânticas de preço e acordo comercial (Goal007)

`priceType` em `GET/POST /v1/services` e `PATCH /v1/services/:id` admite quatro valores: `FIXED` (preço fixo), `STARTING_AT` ("a partir de"), `ON_REQUEST` (sob consulta) e `NOT_INFORMED` (não informado). `FIXED` e `ON_REQUEST` preservam o significado anterior ao Goal007; nenhum serviço existente foi reclassificado. `price` é obrigatório apenas em `FIXED`/`STARTING_AT` e proibido nos outros dois — a aplicação e uma constraint SQL recusam a combinação inválida. Preço ausente nunca é serializado como zero.

`durationMinutes` é opcional: ausente é a única forma de um serviço entrar em `needsReview: true` (`Precisa de revisão`), estado distinto de `active`. Serviço em revisão continua listável e editável no catálogo, mas não aparece em `/internal/services` (o que a IA pode oferecer), não entra em `POST /v1/appointments` e não conta para `calendar.capabilities.aiActivationReady` (usada por `PATCH /v1/settings/ai` para recusar `enabled: true` com `409 CONFLICT` sem nenhum serviço operacional). Corrigir a duração retira a pendência automaticamente.

Atributos adicionais do MVP, sem efeito operacional neste Goal (aplicação dos buffers na ocupação é do Goal009; uso da recorrência pela IA é do Goal011): `description` (texto livre opcional), `colorToken` (token estável de identidade visual — `ROSE | AMBER | EMERALD | SKY | VIOLET | SLATE`, nunca cor livre), `bufferBeforeMinutes`/`bufferAfterMinutes` (minutos, default `0`) e `recurrenceIntervalDays` (intervalo em dias, opcional).

`GET/POST /v1/appointments` (e o `services[]` de cada agendamento) carregam as mesmas quatro semânticas nos itens do acordo, junto de `totalPrice`/`totalPriceType`. A regra do total é única e usada pelo Scheduling e pela IA: soma quando todos os itens são `FIXED`; `STARTING_AT` quando há algum "a partir de" e nenhum `ON_REQUEST`/`NOT_INFORMED`; `NONE` (sem total) nos demais casos. Editar o catálogo depois da confirmação não altera snapshots existentes.

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

## Conversa: categoria, sessão e atendimento humano

`GET /v1/conversations` aceita, além de `status`, `search` e `limit`:

| Filtro | Valores | Significado |
| --- | --- | --- |
| `category` | `COMMERCIAL`, `UNCLASSIFIED`, `PERSONAL` | organização da inbox, atributo da sessão vigente |
| `handling` | `AI`, `HUMAN` | estado de atendimento: `HUMAN` é "Você atendendo" |
| `ignored` | `true`, `false` | contato em `Ignorar IA` |

O DTO de conversa ganhou campos **opcionais**; respostas anteriores a esta versão continuam válidas e o consumidor trata ausência como o padrão seguro (`UNCLASSIFIED`, `AUTOMATIC`, `AI`, não ignorado):

| Campo | Valores | Significado |
| --- | --- | --- |
| `category` | `COMMERCIAL`, `UNCLASSIFIED`, `PERSONAL` | categoria vigente da sessão |
| `categorySource` | `AUTOMATIC`, `MANUAL` | origem da categoria vigente |
| `suggestedCategory` | mesma lista ou `null` | sugestão do agente, gravada com proveniência |
| `handling` | `AI`, `HUMAN` | quem está atendendo agora |
| `ignored`, `ignoredAt` | booleano, data ou `null` | contato ignorado, regra do contato |
| `aiPaused` | booleano | pausa explícita da IA para o contato (`/bot off`, `/ia_pause`) |
| `session` | objeto ou `null` | `id`, `startedAt`, `expiresAt`, `lastContactMessageAt`, `humanHandlingSince` |

Precedência: `ignored` do contato prevalece sobre a sessão; o override manual (`categorySource: MANUAL`) prevalece sobre `suggestedCategory` e atravessa a troca de sessão. A classificação automática nunca escreve override.

`PUT /v1/conversations/:id/category` recebe `{ "category": "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL" | null }`; `null` limpa o override e devolve a conversa à classificação automática. `PUT /v1/conversations/:id/ignore` recebe `{ "ignored": true | false }`. As duas respondem com o DTO de conversa completo.

Como as demais mutações, ambas resolvem o negócio pela sessão autenticada e exigem CSRF quando a credencial é o cookie. Nenhuma delas aceita `tenantId` por header, body ou query.

## Envio manual assume a conversa

`POST /v1/conversations/:id/messages` **deixou de exigir takeover prévio**: enviar assume. Antes desta versão a rota respondia `409 HUMAN_HANDOFF_REQUIRED` quando a conversa não estava em handoff, e a profissional precisava clicar em assumir antes de escrever — enquanto isso, a resposta automática em curso continuava valendo.

Agora o controle humano é gravado antes do transporte e a saída automática ainda não enviada é cancelada. O mesmo vale para a mensagem manual enviada pelo próprio WhatsApp conectado. Abrir ou ler a conversa (`GET`) não muda estado nenhum.

`POST /v1/conversations/:id/release` é o `Retomar IA`: devolve a conversa à IA e faz o próximo turno reavaliar o contexto atual em vez de continuar do ponto anterior. Dentro de uma sessão viva não existe retomada automática por relógio — a IA só volta por essa rota ou em uma sessão nova, aberta após a expiração por inatividade do contato (~24 h), e nunca para contato ignorado. Nenhuma mensagem automática anuncia a troca entre IA e humano.
