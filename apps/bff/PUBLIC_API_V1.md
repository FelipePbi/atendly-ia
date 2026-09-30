# BFF Public API V1 — inventário do runtime

Este arquivo registra as rotas atualmente montadas por `apps/bff/src/app.ts` e consumidas pelo frontend. Ele descreve o contrato existente; não define direção de produto nem propõe uma API nova.

Para comportamento vigente, prevalece [`../../docs/product-vault/00-HOME.md`](../../docs/product-vault/00-HOME.md).

## Rotas registradas

| Área | Rotas |
| --- | --- |
| Saúde | `GET /health`; `GET /health/dependencies` |
| Autenticação | `POST /v1/auth/register`; `POST /v1/auth/login`; `POST /v1/auth/logout`; `POST /v1/auth/logout-all` (Goal024/WU-05); `GET /v1/auth/session`; `PATCH /v1/auth/password`; `POST /v1/auth/forgot-password`; `POST /v1/auth/reset-password` |
| Onboarding | `GET /v1/onboarding`; `PATCH /v1/onboarding`; `POST /v1/onboarding/complete` |
| Home | `GET /v1/dashboard`; `GET /v1/status` (Goal014) |
| Conversas | `GET /v1/conversations`; `GET /v1/conversations/:id`; `GET /v1/conversations/:id/messages`; `GET /v1/conversations/:id/events` (Goal070); `POST /v1/conversations/:id/messages`; `POST /v1/conversations/:id/takeover`; `POST /v1/conversations/:id/release`; `POST /v1/conversations/:id/resolve`; `PUT /v1/conversations/:id/category`; `PUT /v1/conversations/:id/ignore`; `POST /v1/conversations/:id/suggestions` (Goal012) |
| Agendamentos | `GET /v1/appointments`; `GET /v1/appointments/:id`; `POST /v1/appointments`; `POST /v1/appointments/:id/reschedule`; `POST /v1/appointments/:id/cancel` |
| Ciclo de vida do atendimento | `POST /v1/appointments/:id/complete`; `POST /v1/appointments/:id/no-show`; `POST /v1/appointments/:id/final-value`; `POST /v1/appointments/:id/presence`; `GET /v1/appointments/:id/events`; `GET /v1/appointments/:id/notifications` (Goal021) |
| Reserva temporária (hold) | `POST /v1/holds`; `GET /v1/holds`; `DELETE /v1/holds/:id` |
| Série de atendimento (Goal009) | `POST /v1/appointments/series/preview`; `POST /v1/appointments/series/confirm` |
| Disponibilidade e bloqueios | `GET /v1/availability`; `GET /v1/time-blocks`; `POST /v1/time-blocks`; `DELETE /v1/time-blocks/:id`; `DELETE /v1/time-blocks/:id/occurrence`; `PATCH /v1/time-blocks/:id/occurrence` |
| Exceções de disponibilidade (Goal009) | `GET /v1/availability-exceptions`; `POST /v1/availability-exceptions/extra`; `POST /v1/availability-exceptions/unavailable`; `DELETE /v1/availability-exceptions/:id` |
| Séries de bloqueio/compromisso (Goal009) | `POST /v1/block-series`; `PATCH /v1/block-series/:id/from-date`; `DELETE /v1/block-series/:id` |
| Importação única (Goal010, Goal020, Goal061) | `GET /v1/calendar/imports`; `POST /v1/calendar/imports`; `POST /v1/calendar/imports/:sessionId/analyze`; `GET /v1/calendar/imports/:sessionId/preview`; `GET /v1/calendar/imports/:sessionId/categories/:category/items`; `POST /v1/calendar/imports/:sessionId/categories/:category/selection`; `POST /v1/calendar/imports/:sessionId/items/:itemId/decision`; `POST /v1/calendar/imports/:sessionId/execute`; `GET /v1/calendar/imports/:sessionId/progress`; `POST /v1/calendar/imports/:sessionId/complete` |
| Clientes | `GET /v1/customers`; `GET /v1/customers/:id`; `POST /v1/customers`; `PATCH /v1/customers/:id`; `PUT /v1/customers/:id/primary-guardian`; `POST /v1/customers/:id/primary-guardian/confirm`; `DELETE /v1/customers/:id/primary-guardian`; `POST /v1/customers/:id/notes`; `PATCH /v1/customers/:id/notes/:noteId`; `DELETE /v1/customers/:id/notes/:noteId`; `POST /v1/customers/:id/tags`; `PATCH /v1/customers/:id/tags/:tagId`; `DELETE /v1/customers/:id/tags/:tagId`; `GET/POST /v1/customers/:id/memory`; `PATCH/DELETE /v1/customers/:id/memory/:memoryId`; `POST /v1/customers/:id/summary` (Goal012) |
| Conhecimento do negócio (Goal012) | `GET/POST /v1/knowledge/documents`; `GET/PUT/DELETE /v1/knowledge/documents/:id`; `GET/PUT /v1/knowledge/other-info` |
| Serviços | `GET /v1/services`; `POST /v1/services`; `PATCH /v1/services/:id`; `GET/PUT /v1/services/:id/ai-instruction` (Goal078) |
| Configurações | `GET /v1/settings`; `PATCH /v1/settings/business`; `PATCH /v1/settings/ai`; `PATCH /v1/settings/availability`; `GET /v1/settings/reminders`; `PATCH /v1/settings/reminders` (Goal021); `GET/PATCH /v1/settings/retention` (Goal023/WU-01); `GET/PATCH /v1/settings/agenda-view` (Goal073/WU-03) |
| WhatsApp | `GET /v1/whatsapp`; `GET /v1/whatsapp/qr` (Goal071/WU-01); `POST /v1/whatsapp/connect`; `POST /v1/whatsapp/reconnect`; `DELETE /v1/whatsapp` |
| Teste real de ativação (Goal019/WU-05) | `GET /v1/activation-test`; `POST /v1/activation-test`; `POST /v1/activation-test/restart` |
| Central de notificações (Goal022/WU-04) | `GET /v1/notifications`; `GET /v1/notifications/summary`; `POST /v1/notifications/read`; `GET/PATCH /v1/notifications/preferences` |
| Ciclo de vida da conta (Goal025/WU-03) | `POST /v1/account/deletion`; `DELETE /v1/account/deletion` |
| Perfil da conta (Goal067) | `PATCH /v1/account/profile` |

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

## Nome da conta e regra de senha (Goal064/WU-01)

`POST /v1/auth/register` exige `name`: texto aparado, de 1 a 120 caracteres. Ausente, vazio ou só espaço é `400 VALIDATION_ERROR` no campo `name`, antes de qualquer escrita — nenhuma linha de `User`, `Tenant` ou `LegalAcceptance` nasce. `confirmPassword` saiu do corpo de `register` e de `reset-password`; um corpo antigo que ainda o traga continua aceito, com o campo ignorado. `User.name` é nulável: conta cadastrada antes deste Goal tem `name: null`, que significa "não informado", nunca um nome inventado. `userDto` devolve `name` (texto ou `null`) em `register`, `login` e `GET /v1/auth/session`.

A regra de senha (U-10 em [DECISIONS](../../docs/migration/DECISIONS.md)) — mínimo de 8 caracteres, pelo menos uma letra e pelo menos um número, máximo de 200 — é escrita uma vez em `packages/public-api-contract/src/password-policy.ts` (`passwordPolicySchema`) e usada por `POST /v1/auth/register`, `POST /v1/auth/reset-password` e `PATCH /v1/auth/password`. Recusa fora da regra é `400 VALIDATION_ERROR` com o campo da senha, no mesmo formato de `details` das demais validações. **Não** vale para `POST /v1/auth/login`: uma conta com senha gravada antes desta regra continua entrando com ela.

`POST /v1/auth/reset-password` aceita só `token` e `newPassword`. Token ausente do banco, já usado ou vencido é `400` com o código próprio `PASSWORD_RESET_TOKEN_INVALID`, distinto de `VALIDATION_ERROR`. Nova senha igual à atual é `400 VALIDATION_ERROR` no campo `newPassword`, conferida contra o hash atual **antes** de consumir o token — o link continua válido para uma nova tentativa até vencer. O resto da rota não muda: consumo atômico do token, remoção dos demais tokens do usuário e revogação de todas as sessões. `POST /v1/auth/forgot-password` não muda: sem `PASSWORD_RESET_DELIVERY_URL` configurado responde `503 CONFIGURATION_ERROR` sem gravar nenhum `PasswordResetToken`.

## Contratos legados ainda ativos

As rotas abaixo também estão registradas e possuem consumidores no frontend atual:

| Conceito legado | Rotas atuais |
| --- | --- |
| Estado/fonte de calendário | `GET /v1/calendar` |
| Conexão da origem de importação (antes: conexão operacional de agenda externa) | `POST /v1/calendar/integration/connect`; `POST /v1/calendar/integration/reconnect`; `DELETE /v1/calendar/integration` |

Essas três rotas foram reescopadas pelo Goal010 e continuam com o mesmo contrato: elas guardam, testam e removem a **credencial da origem de importação** e nada mais. Conectar não muda a fonte da agenda operacional e não exige que ela seja externa — exigir isso deixaria a importação inalcançável depois do corte do writer remoto. Desde o Goal060, `POST /v1/calendar/integration/connect` aceita só `{ email, password }`; um corpo no formato anterior (`credentials`/`configuration`, incluindo qualquer declaração de escrita) é recusado com `400 VALIDATION_ERROR`, antes de qualquer chamada à origem — este contrato não usa mais `409 INTEGRATION_WRITES_NOT_SUPPORTED` (ver "Conexão da origem: só e-mail e senha" abaixo). Desconectar remove a credencial e **nunca** desativa a Agenda Atendly.

Pela regra de produto vigente:

- Agenda Atendly é a única agenda operacional;
- Minha Agenda só pode participar da importação única;
- não existe conexão operacional, troca de fonte ou migração reversa.

### Retirada do protocolo de migração pré-Goal010 (Goal026, 2026-09-19)

As três rotas do protocolo de migração bidirecional pré-Goal010 — `POST /v1/calendar/migrations/diagnose`, `POST /v1/calendar/migrations`, `GET /v1/calendar/migrations/:id` — saíram deste contrato. É a **primeira remoção subtrativa de rota pública** desta migração: até aqui, toda mudança de contrato tinha sido aditiva, reescopo de rota existente ou troca de vocabulário, nunca a retirada de uma rota do ar. Elas não tinham consumidor de frontend desde o fechamento do Goal010 (2026-09-12, quando esta seção passou a registrar essa ausência) e o writer remoto que as sustentava foi removido do código no mesmo Goal026 (D-042). O que a importação única precisa da origem continua servido pelas três rotas de "Conexão da origem de importação" acima; nenhuma capacidade de leitura da origem foi perdida.

### `calendar.source` perde `EXTERNAL` (Goal027, 2026-09-19)

**Segunda remoção subtrativa do contrato público**, no mesmo sentido da anterior — não a retirada de uma rota, mas a redução do domínio de um campo que continua existindo. `calendar.source`, em toda rota que o expõe (`GET/PATCH /v1/onboarding`, `GET /v1/calendar`, `GET/PATCH /v1/settings`, `GET /v1/dashboard`), é agora `"ATENDLY" | null`; `EXTERNAL` não é mais um valor possível de leitura. Em `PATCH /v1/onboarding`, `calendar.source` continua aceito na escrita, mas só `"ATENDLY"` é válido — qualquer outro valor é recusado com `400`. O campo não desapareceu: o domínio dele encolheu, porque a agenda externa deixou de ser fonte operacional (D-043).

### `calendar.timezone` e `availability.timezone` seguem `business.timezone` (Goal029, 2026-09-20)

**Terceira redução de domínio do contrato público**, mesmo padrão do `calendar.source` acima: os campos continuam existindo, mas deixam de aceitar um fuso independente do fuso do negócio. Em `PATCH /v1/onboarding` (seções `calendar` e `availability`) e em `PATCH /v1/settings/availability`, o campo `timezone` passa a ser opcional na escrita: ausente resolve para `business.timezone` já gravado; presente e diferente de `business.timezone` é recusado com `400 VALIDATION_ERROR` e mensagem própria (`"calendar.timezone must match the business timezone."` / `"availability.timezone must match the business timezone."`). Fuso IANA inválido continua recusado como sempre, antes da comparação com o negócio. `BusinessProfile.timezone` é o único dono do fuso (D-010); `CalendarSettings.timezone` no Scheduling é réplica derivada, reconciliada por `reconcileBusinessTimezone` a cada gravação de `business.timezone` (Goal029).

`GET /v1/settings` e `GET /v1/calendar` reconciliam as duas cópias na própria requisição, sem laço de fundo e sem consulta nova ao Scheduling: um tenant já gravado com divergência converge na próxima leitura, e o `timezone` devolvido é o de `business.timezone`. A reconciliação nunca transforma a leitura em erro: com a **escrita de convergência** recusada pelo Scheduling, a resposta sai `200` com o fuso que continua gravado lá, e a divergência fica legível em `calendar.timezone` ao lado de `business.timezone`. Nenhuma leitura afirma convergência que não aconteceu.

O que **não** mudou é o tratamento da leitura do próprio calendário: ela continua sendo dado da requisição, e o Scheduling indisponível continua respondendo `502 UPSTREAM_ERROR` nas rotas que o leem, exatamente como antes deste Goal. Um calendário vazio (`source: null`, `timezone: null`, `capabilities` todas `false`) é um estado de produto que existe — negócio sem agenda operacional — e por isso nunca é devolvido no lugar de uma leitura que falhou: seria a tela afirmar o que não sabe.

Quando o negócio ainda não tem `timezone` gravado — nem nesta requisição (sem a seção `business`) nem em nenhuma anterior —, `calendar.timezone` e `availability.timezone` não têm contra o que resolver nem comparar: a requisição é recusada com `400 VALIDATION_ERROR` (`"Business timezone must be set before calendar.timezone/availability.timezone can be resolved."`), campo presente ou ausente. Nenhum dos dois passa a ser o dono do fuso do negócio por um caminho que não seja `business.timezone`.

## Estilo de conversa da IA: três valores (Goal011)

`tone` em `PATCH /v1/settings/ai` e em `ai.tone` de `PATCH /v1/onboarding` aceita os três estilos do produto — `PROFESSIONAL`, `BALANCED` (equilibrado) e `CASUAL` — e, como alias de entrada declarado, os dois valores antigos: `PROFESSIONAL_OBJECTIVE` (alias de `PROFESSIONAL`) e `LIGHT_CLOSE` (alias de `BALANCED`). `CASUAL` é estilo novo, sem alias.

A entrada aceita qualquer um dos cinco valores; a saída — em `GET/PATCH /v1/settings` (`ai.tone`) e `GET/PATCH /v1/onboarding` (`ai.tone`) — devolve **sempre** o vocabulário novo, mesmo para um tenant cuja linha ainda guarda o valor antigo gravado antes desta versão. Um valor fora desses cinco é recusado com `400 AI_CONVERSATION_STYLE_UNKNOWN`, sem gravar nada; a resposta inclui `error.details.accepted` (os três valores novos) e `error.details.legacyAliases` (os dois antigos ainda aceitos).

`tone` ausente é distinto de `tone` escolhido: `ai.tone` vem `null` enquanto o negócio não passou por `PATCH /v1/settings/ai` nem por `PATCH /v1/onboarding` com `ai`, e `POST /v1/onboarding/complete` recusa com `AI_TONE_NOT_SELECTED` enquanto isso for verdade. A projeção enviada à IA (interna, não neste contrato) sempre carrega um valor concreto no vocabulário novo — o equilibrado quando o negócio ainda não escolheu —, mas isso nunca é gravado como se fosse a escolha do negócio.

Os dois valores antigos saem do vocabulário aceito no Goal024.

## Negócio: modalidades de atendimento, endereço e versão do contexto (Goal018/WU-01)

`GET/PATCH /v1/settings/business` e a seção `business` de `GET/PATCH /v1/onboarding` ganharam três campos aditivos, sempre presentes na leitura e opcionais na escrita:

| Campo | Valores | Significado |
| --- | --- | --- |
| `modalities` | array de `ON_SITE`, `AT_HOME`, `ONLINE` (seleção múltipla) | modalidades de atendimento do negócio; `[]` significa "ainda não escolheu" — `POST /v1/onboarding/complete` recusa com `BUSINESS_MODALITY_NOT_SELECTED` enquanto isso for verdade |
| `address` | texto ou `null` | endereço do local próprio; `null` enquanto o negócio não tem `ON_SITE` |
| `contextVersion` | inteiro, começa em `1` | contador incrementado a cada gravação de negócio (nome, categoria, timezone, modalidade, endereço); nunca timestamp, só leitura pelo contrato público |

`category` continua sendo o único campo de segmento — os três campos acima não criam uma segunda forma de classificar o negócio.

Regra de gravação, igual nas duas rotas: `modalities` ausente no corpo preserva o que já está gravado, e nunca grava conjunto vazio só por omissão — um array vazio só é gravado quando enviado explicitamente. `address` segue a mesma distinção: chave ausente preserva o valor gravado; `null` ou uma string apagam/substituem. `ON_SITE` presente em `modalities` (seja o valor enviado, seja o já gravado quando `modalities` está ausente) exige `address` não vazio; corpo que viole isso é recusado com `400 BUSINESS_ADDRESS_REQUIRED` e `error.details.field: "address"`, sem gravar nada. Retirar `ON_SITE` de um perfil que já tem endereço não apaga o endereço — só um corpo que envie `address` explicitamente muda o que está gravado.

A migration que introduziu essas colunas é aditiva: nenhuma linha existente teve modalidade, endereço, nome ou categoria fabricados a partir de dado já gravado. Toda linha — nova ou pré-existente — nasce com `modalities: []`, `address: null` e a versão do contexto ainda não projetada para a IA.

Nenhum dos três campos é enviado ao Scheduling: o negócio (`BusinessProfile`) e a agenda operacional continuam sem esse acoplamento.

### Estado de projeção do contexto para a IA (Goal018/WU-03)

O objeto `business` em `GET/PATCH /v1/settings` e na seção `business` de `GET/PATCH /v1/onboarding` traz mais dois campos, só leitura:

| Campo | Valores | Significado |
| --- | --- | --- |
| `contextProjectedVersion` | inteiro, começa em `0` | última `contextVersion` que a IA efetivamente confirmou ter recebido |
| `contextProjectionStatus` | `PROJECTED`, `PENDING` | `PROJECTED` quando `contextProjectedVersion === contextVersion`; `PENDING` quando a versão gravada é mais nova que a última projetada com sucesso |

A projeção acontece nos mesmos pontos que já enviam configuração para a IA (gravação de negócio ou de IA em `/v1/settings`; seção `ai` de `PATCH /v1/onboarding`). Uma tentativa de projeção que falhe **não** vira erro da requisição: o dado do negócio já foi gravado antes dessa chamada, a resposta continua `200`/`201` com `contextProjectionStatus: "PENDING"` como aviso explícito, e nada é retentado automaticamente — só uma gravação de negócio ou de IA subsequente tenta projetar de novo.

## Onboarding: conclusão não exige mais WhatsApp (Goal018/WU-04)

**Mudança subtrativa:** até esta versão, `POST /v1/onboarding/complete` consultava `WhatsAppInstance` e o status do Evolution nesta própria requisição, recusando com `WHATSAPP_NOT_CONFIGURED` (sem instância vinculada) ou `WHATSAPP_NOT_CONNECTED` (vinculada mas não conectada). Essa exigência foi **removida**: os dois códigos não existem mais e concluir o onboarding não olha para WhatsApp em nenhuma forma. Concluir também não conecta, não liga IA e não projeta nada — só registra `onboardingCompletedAt`. WhatsApp continua configurável por `GET/POST/DELETE /v1/whatsapp`, e se a IA está de fato ativa continua sendo o que `GET /v1/status` responde (ver "Status honesto do WhatsApp e da IA", Goal014), não o que `complete` decide.

`error.details.issues` (array de códigos, resposta `409 CONFLICT`) hoje pode trazer qualquer um destes, em qualquer combinação:

| Código | Significado | Como se resolve |
| --- | --- | --- |
| `BUSINESS_PROFILE_INCOMPLETE` | nome ou categoria do negócio ainda vazios | gravar `name`/`category` (`PATCH /v1/settings/business` ou seção `business` de `PATCH /v1/onboarding`) |
| `BUSINESS_MODALITY_NOT_SELECTED` | `modalities` do negócio ainda é `[]` (Goal018/WU-01) | gravar ao menos uma modalidade em `modalities` |
| `BUSINESS_ADDRESS_REQUIRED` | `modalities` inclui `ON_SITE` sem `address` preenchido (Goal018/WU-01) | gravar `address` |
| `CALENDAR_NOT_SELECTED` | negócio ainda não escolheu fonte de agenda | escolher `calendar.source` em `PATCH /v1/onboarding` |
| `AI_TONE_NOT_SELECTED` | `ai.tone` ainda é `null` | gravar `tone` (`PATCH /v1/settings/ai` ou seção `ai` de `PATCH /v1/onboarding`) |
| `ACTIVE_SERVICE_REQUIRED` | catálogo sem nenhum serviço `active`; só avaliado com fonte já escolhida | ativar ou cadastrar serviço em `POST/PATCH /v1/services` |
| `AVAILABILITY_REQUIRED` | fonte já escolhida sem nenhuma regra de disponibilidade ativa | gravar regra em `PATCH /v1/settings/availability` |

`ACTIVE_SERVICE_REQUIRED` e `AVAILABILITY_REQUIRED` só entram depois que uma fonte foi escolhida — sem fonte, a área de agenda aparece só como `CALENDAR_NOT_SELECTED`. `AVAILABILITY_REQUIRED` vale para toda fonte escolhida (Goal027) — `CALENDAR_INTEGRATION_NOT_CONNECTED` saiu do vocabulário porque não existe mais fonte cuja disponibilidade dependa de uma integração conectada. Nenhuma avaliação tem efeito colateral no banco — a rota só grava algo depois que a lista de `issues` está vazia.

## Clientes: identidade por ID

O cliente é uma **pessoa**, identificada pelo ID dentro do negócio. O telefone é contato, não identidade:

- `phone` é opcional na criação e na resposta. Um cliente pode existir só com nome — criança, pessoa agendada presencialmente. O que a criação recusa é um cadastro sem nome **e** sem telefone.
- o mesmo número pode pertencer a mais de uma pessoa do mesmo negócio. `GET /v1/customers?phone=...` devolve **candidatos** (zero, um ou vários) e marca a resposta com `filteredByPhone: true`; nenhuma rota resolve identidade a partir do número.
- nome e telefone só mudam por `PATCH /v1/customers/:id`. Nenhuma outra rota renomeia, funde ou deduplica pessoas.
- `GET /v1/customers/:id` devolve, além dos dados básicos, `primaryGuardian`, `notes` e `tags`. Consumidores que só conhecem o contrato anterior continuam válidos: os campos novos são adicionais.

### Próximo e último atendimento, e números do histórico (Goal075)

`GET /v1/customers` traz, por item, `nextAppointment` e `lastAppointment` — cada um `{ date, startTime, status }` ou `null`. `nextAppointment` é o atendimento `CONFIRMED`/`SCHEDULED` de início mais cedo a partir de agora; `lastAppointment` é o não cancelado de início mais recente até agora. Os dois são calculados no fuso do calendário do negócio, nunca do cliente. Campos opcionais: resposta anterior a este Goal continua válida sem eles.

`GET /v1/customers/:id` traz os mesmos `nextAppointment` e `lastAppointment`, pelas mesmas regras, e `appointmentStats`, também opcional: `{ completed, noShows, cancelled, averageIntervalDays, firstAppointmentDate }`, contados sobre o histórico inteiro da pessoa nesse negócio. `averageIntervalDays` é a média de dias entre atendimentos `COMPLETED` consecutivos, `null` com menos de dois; `firstAppointmentDate` é a data do primeiro atendimento de qualquer estado, `null` sem nenhum.

`POST /v1/appointments` aceita `customerId` para uma pessoa já resolvida ou `customerName`/`customerPhone` para criar o cadastro **na confirmação** — a criação acontece dentro da transação do agendamento, depois de o horário ser validado. Consultar preço ou disponibilidade não cria ninguém, e uma confirmação que falha no horário também não. `GET /v1/appointments` aceita `customerId` (a pessoa) e `customerPhone` (todos os candidatos do número).

### Responsável principal

`PUT /v1/customers/:id/primary-guardian` grava a relação com proveniência (`proposedBy`) e estado (`status`). A relação nasce `PROPOSED` e só vira `CONFIRMED` com confirmação explícita — no corpo do `PUT` ou por `POST .../primary-guardian/confirm`. Uma relação apenas proposta não é afirmada para a IA. No MVP existe no máximo um responsável principal por cliente.

### Observações e tags: autorização de uso pela IA

`aiAuthorized` é atributo do **registro**, não do prompt, e nasce `false`. A IA lê o cliente por um recorte próprio no Scheduling que carrega apenas notas e tags autorizadas; retirar a autorização (`PATCH` com `aiAuthorized: false`) volta a escondê-las. A interface de cadastro completo é do Goal015.

`actor` nunca vem do corpo destas rotas: a proveniência (`createdBy`/`authorizedBy`/`proposedByActor`/`confirmedByActor`) é sempre derivada da sessão autenticada.

## Catálogo: quatro semânticas de preço e acordo comercial (Goal007)

`priceType` em `GET/POST /v1/services` e `PATCH /v1/services/:id` admite quatro valores: `FIXED` (preço fixo), `STARTING_AT` ("a partir de"), `ON_REQUEST` (sob consulta) e `NOT_INFORMED` (não informado). `FIXED` e `ON_REQUEST` preservam o significado anterior ao Goal007; nenhum serviço existente foi reclassificado. `price` é obrigatório apenas em `FIXED`/`STARTING_AT` e proibido nos outros dois — a aplicação e uma constraint SQL recusam a combinação inválida. Preço ausente nunca é serializado como zero.

A seção `service` de `PATCH /v1/onboarding` admite os mesmos quatro valores desde o Goal065/WU-01 (antes, só `FIXED`/`ON_REQUEST`). A mesma regra de `price` obrigatório/proibido é aplicada no BFF, antes de chamar o Scheduling: `STARTING_AT`/`FIXED` sem `price` (ou com `price` negativo) é recusado com `400 VALIDATION_ERROR` no campo `service`, sem gravar nada; `ON_REQUEST`/`NOT_INFORMED` sempre gravam `price: null`, mesmo que o corpo traga um valor.

`durationMinutes` é opcional: ausente é a única forma de um serviço entrar em `needsReview: true` (`Precisa de revisão`), estado distinto de `active`. Serviço em revisão continua listável e editável no catálogo, mas não aparece em `/internal/services` (o que a IA pode oferecer), não entra em `POST /v1/appointments` e não conta para `calendar.capabilities.aiActivationReady` (usada por `PATCH /v1/settings/ai` para recusar `enabled: true` com `409 CONFLICT` sem nenhum serviço operacional). Corrigir a duração retira a pendência automaticamente.

Atributos adicionais do catálogo: `description` (texto livre opcional), `colorToken` (token estável de identidade visual — `ROSE | AMBER | EMERALD | SKY | VIOLET | SLATE`, nunca cor livre), `bufferBeforeMinutes`/`bufferAfterMinutes` (minutos, default `0` — com efeito operacional na ocupação desde o Goal009, ver abaixo) e `recurrenceIntervalDays` (intervalo em dias; uso pela IA para propor recorrência proativamente é do Goal011, mas a série já pode ser criada via `POST /v1/appointments/series/preview`/`confirm` desde já).

`GET/POST /v1/appointments` (e o `services[]` de cada agendamento) carregam as mesmas quatro semânticas nos itens do acordo, junto de `totalPrice`/`totalPriceType`. A regra do total é única e usada pelo Scheduling e pela IA: soma quando todos os itens são `FIXED`; `STARTING_AT` quando há algum "a partir de" e nenhum `ON_REQUEST`/`NOT_INFORMED`; `NONE` (sem total) nos demais casos. Editar o catálogo depois da confirmação não altera snapshots existentes.

### Instrução privada por serviço (Goal078)

`GET/PUT /v1/services/:id/ai-instruction` lê e grava um texto por serviço que o modelo usa como orientação interna de atendimento — nunca repetido nem revelado ao cliente. Resposta `{ "content": string }` nas duas rotas, vazio (`""`) quando o negócio nunca salvou nada para o serviço — não é erro. `PUT` com `content` vazio remove a instrução vigente. O corpo aceita só `content`, com no máximo 2000 caracteres; corpo maior ou com campo a mais é recusado com `400 VALIDATION_ERROR` antes de chamar a IA.

Antes de repassar à IA, o BFF confere a posse do serviço por `GET /v1/services` (o mesmo catálogo do Scheduling): serviço de outro negócio ou inexistente responde `404 SERVICE_NOT_FOUND` sem a IA chegar a ser chamada. Serviço inativo continua sendo do negócio e responde normalmente.

## Agenda: hold, estados do atendimento e histórico (Goal008)

### Estados do atendimento

`status` do agendamento passou a ser um dos quatro estados do produto: `CONFIRMED`, `COMPLETED`, `CANCELLED` e `NO_SHOW`. O valor legado `SCHEDULED` foi normalizado para `CONFIRMED` na migração, com o texto original preservado no lado do Scheduling para auditoria.

O campo continua tipado como texto livre no contrato, de propósito: um replay de idempotência gravado antes da normalização ainda devolve `SCHEDULED`, e recusar essa resposta mudaria o resultado de uma chave já respondida. **Consumidores devem tratar `SCHEDULED` como equivalente a `CONFIRMED`** e nunca assumir que a lista de estados é fechada.

O DTO de agendamento ganhou `title`: título do atendimento manual excepcional sem serviço cadastrado, `null` quando o atendimento tem itens de catálogo — que já descrevem o que será feito. O campo é adicional; consumidores do contrato anterior continuam válidos.

### Reserva temporária (hold)

Um hold segura um horário enquanto a confirmação acontece — cinco minutos por padrão, contados pelo relógio do banco. Enquanto vigente, ele **ocupa** a agenda para todo mundo, exceto para a confirmação que o consome.

| Rota | O que faz |
| --- | --- |
| `POST /v1/holds` | reserva o horário; exige `Idempotency-Key` (reservar ocupa tempo) |
| `GET /v1/holds` | lista apenas os holds vigentes (não consumidos, não liberados, dentro do TTL) |
| `DELETE /v1/holds/:id` | libera; liberar de novo devolve o mesmo hold, sem segundo efeito |

`POST /v1/appointments` e `POST /v1/appointments/:id/reschedule` aceitam `holdId` opcional. Se o hold não serve mais — vencido, já consumido, liberado ou de outro horário — a mutação **não acontece** e a resposta é `409 APPOINTMENT_HOLD_EXPIRED`, com `details.slotStillAvailable` dizendo se o horário continua livre depois da revalidação. Não existe caminho em que um hold vencido vire confirmação silenciosa.

Na remarcação, o hold é do horário **novo**; o original continua ocupado pelo próprio atendimento até a remarcação commitar.

Holds só existem na Agenda Atendly, a única agenda operacional (Goal027).

### Sobreposição e atendimento manual: só por decisão humana

`POST /v1/appointments` e `.../reschedule` aceitam `overlapOverride: true` com `overlapOverrideReason` obrigatório. Estas rotas sempre enviam `source: USER` — o override é uma decisão de quem está autenticado, registrada no histórico com o motivo. A IA não tem esse campo em nenhum contrato dela, e um override vindo de origem `AI` é recusado com `403 OVERLAP_OVERRIDE_NOT_ALLOWED`.

`serviceIds` pode vir vazio **apenas** para o atendimento manual excepcional sem serviço cadastrado, que exige `title` e `durationMinutes`. Ele nasce sem itens e, por consequência da regra única do acordo, sem total (`totalPriceType: NONE`) — nada de preço fabricado. Pela IA, é recusado com `403 MANUAL_APPOINTMENT_NOT_ALLOWED`.

### Ciclo de vida: conclusão, falta, presença e valor final

| Rota | Corpo | Efeito |
| --- | --- | --- |
| `POST /v1/appointments/:id/complete` | — | marca `COMPLETED` com origem `MANUAL`; repetir não é um segundo efeito |
| `POST /v1/appointments/:id/no-show` | `{ "note"?: string }` | marca `NO_SHOW`; aceito a partir de `CONFIRMED` (falta direta) ou `COMPLETED` (correção) |
| `POST /v1/appointments/:id/final-value` | `{ "amount": number }` | registra o valor final com data e ator |
| `POST /v1/appointments/:id/presence` | — | confirma presença; campo separado da conclusão |

Estas rotas **não** usam `Idempotency-Key`: elas não ocupam nem liberam horário, e a idempotência é a própria transição. Como toda mutação por cookie, exigem CSRF e resolvem o negócio pela sessão.

Transições inválidas devolvem `409` com código próprio: `APPOINTMENT_COMPLETION_INVALID` (concluir cancelado), `APPOINTMENT_NO_SHOW_INVALID` (falta em cancelado), `APPOINTMENT_RESCHEDULE_INVALID` (remarcar concluído ou falta).

Valor final é dado **separado** do acordo comercial: nunca é inferido do preço previsto, não altera `totalPrice`/`totalPriceType` e não toca os itens do agendamento.

Conclusão automática: o Scheduling marca `COMPLETED` com origem `AUTO` os atendimentos confirmados cujo término venceu há trinta minutos (configurável), avaliado pelo relógio do banco. Nunca toca cancelados nem faltas, e a correção posterior para falta continua permitida.

### Histórico operacional

`GET /v1/appointments/:id/events` devolve, em ordem cronológica, um evento por mutação — cada um gravado na **mesma transação** do efeito que descreve:

| Campo | Valores |
| --- | --- |
| `type` | `CREATED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`, `FINAL_VALUE_SET`, `PRESENCE_CONFIRMED`, `HOLD_CONSUMED`, `OVERLAP_OVERRIDE` |
| `source` | `AI`, `USER`, `SYSTEM`, `INTEGRATION` |
| `actor`, `reason` | quem fez e por quê (`null` para a conclusão automática) |
| `before`, `after` | horário, status e valores antes/depois |
| `occurredAt`, `sequence` | instante e desempate determinístico |

`sequence` existe porque `occurredAt` é o instante de início da transação: eventos gravados juntos pela mesma mutação compartilham o instante, e a ordem entre eles vem da sequência. Ordene por `occurredAt` **e depois** por `sequence`.

O histórico nunca é apagado nem reescrito. Eventos de criação **não** foram fabricados retroativamente para atendimentos anteriores a este Goal: a ausência de `CREATED` no início da lista é esperada para essas linhas.

`POST /v1/appointments/:id/cancel` aceita `reason` (o nome anterior, `comments`, continua aceito): o motivo vai para o evento de cancelamento.

Ciclo de vida e histórico só existem na Agenda Atendly, a única agenda operacional (Goal027).

### Agenda disputada

Toda escrita da agenda roda em transação `Serializable` com lock por dia. Abortos de serialização são repetidos um número limitado de vezes; excedido o limite, a resposta é `409 CALENDAR_WRITE_RETRY_EXCEEDED` — "a agenda estava disputada demais agora", não "o pedido era inválido". Repetir a mesma requisição com a mesma `Idempotency-Key` é seguro.

## Agenda: regras de oferta, buffers, exceções e séries (Goal009)

### Regras de oferta e granularidade

`PATCH /v1/settings/availability` ganhou, de forma aditiva ao corpo existente (`timezone` + `rules`), `minLeadMinutes` (antecedência mínima, minutos), `maxLeadDays` (antecedência máxima, dias) e `granularityMinutes` (passo da grade, múltiplo de 5 entre 5 e 120). Ausentes preservam o valor já gravado. `GET /v1/settings` devolve os três dentro de `availability`.

`customerChangeMinNoticeMinutes` (Goal073/WU-03) é o quarto campo aditivo do mesmo corpo: antecedência mínima, em minutos (0 a 10080, sete dias), para o **cliente** — via IA — cancelar ou remarcar o próprio atendimento. Ausente preserva o valor já gravado; o default do produto é `0` (sem restrição, o comportamento anterior a este Goal). Fora do intervalo é `400 VALIDATION_ERROR`, sem gravar nada. A aplicação da regra na IA — quem ela restringe, o que exime — é do Scheduling e da IA, fora deste contrato; aqui só o campo é gravado e devolvido.

A recusa que a IA vê quando a cliente tenta mudar o próprio atendimento fora desse prazo é `CUSTOMER_CHANGE_OUTSIDE_POLICY` (D-086), devolvida pelo Scheduling e tratada pela ferramenta de agenda da IA — **nunca** uma resposta de rota pública deste contrato: nenhuma das rotas acima devolve esse código para o cliente do BFF.

O motor de disponibilidade aplica as três a **toda** oferta — nenhum slot antes da antecedência mínima nem depois da máxima, passo sempre igual à granularidade do negócio. `GET /v1/availability` não aceita mais `stepMinutes`: quem decide o passo é sempre o negócio, nunca quem chama. A confirmação (`POST /v1/appointments`, `.../reschedule`, `POST /v1/holds`) continua aceitando `stepMinutes` no corpo por compatibilidade, mas o valor é ignorado pela Agenda Atendly — o horário pedido é sempre validado contra a grade do negócio. Override humano de sobreposição (`overlapOverride`) continua ignorando a grade; a IA nunca tem esse campo.

### Buffers como ocupação externa

O atendimento ocupa `[startAt − bufferBeforeMinutes, endAt + bufferAfterMinutes]` na disponibilidade de terceiros, onde os buffers são o maior `bufferBeforeMinutes`/`bufferAfterMinutes` entre os serviços do atendimento — buffers intermediários de multi-serviço nunca são somados. O DTO de agendamento ganhou `bufferBeforeMinutes`/`bufferAfterMinutes` (default `0`): o horário exibido (`startTime`/`endTime`) não muda, a ocupação estendida é dado separado. Gravados como snapshot na confirmação — editar o catálogo depois não move a ocupação de um atendimento já confirmado.

### Exceções de disponibilidade

| Rota | O que faz |
| --- | --- |
| `GET /v1/availability-exceptions?startDate&endDate` | lista exceções do período |
| `POST /v1/availability-exceptions/extra` | abre disponibilidade extra em data normalmente fechada (`date`, `startTime`, `endTime`) |
| `POST /v1/availability-exceptions/unavailable` | cria indisponibilidade pontual (`date`, `startTime`/`endTime` opcionais para dia inteiro, `reason`) |
| `DELETE /v1/availability-exceptions/:id` | remove |

Indisponibilidade que cobre um atendimento confirmado é recusada com `409 EXCEPTION_APPOINTMENT_CONFLICT`, salvo decisão humana explícita: `decidedReason` no corpo, gravada na própria exceção junto com quem decidiu. `decidedBy` não é mais um campo do corpo (Goal016): o ator é sempre derivado da sessão autenticada; um corpo antigo que ainda envie `decidedBy` é aceito e o valor é ignorado. A exceção nunca altera atendimento existente.

### Séries de bloqueio e compromisso pessoal

`POST /v1/time-blocks` ganhou `kind` (`BLOCK` — bloqueio operacional, default — ou `PERSONAL` — compromisso pessoal) e `title` opcional. Resposta de bloco ganhou `kind`, `title` e `seriesId` (nulo fora de série).

| Rota | O que faz |
| --- | --- |
| `GET /v1/time-blocks?startDate&endDate` | lista blocos do período, escopado por tenant; a janela é obrigatória. Mesma forma de `POST /v1/time-blocks` |
| `POST /v1/block-series` | cria série (`rule`: `kind`, `title`, `daysOfWeek`, `startTime`, `endTime`, `seriesStartDate`, e **um** entre `seriesEndDate`/`occurrenceCount`); materializa as ocorrências na criação |
| `PATCH /v1/block-series/:id/from-date` | edita a série a partir de `fromDate`: encerra a série atual (ocorrências passadas intocadas) e cria outra com o novo `rule` |
| `DELETE /v1/block-series/:id` | remove as ocorrências futuras da série (a partir de hoje); passadas preservadas |
| `DELETE /v1/time-blocks/:id/occurrence` | remove uma única ocorrência, sem tocar a série |
| `PATCH /v1/time-blocks/:id/occurrence` | move uma única ocorrência (`startAt`/`endAt`), sem tocar a série |

Série sem `seriesEndDate` nem `occurrenceCount` (ou com os dois) é recusada com `400 INVALID_BLOCK_SERIES_TERMINATION` — não existe série infinita. Conflito de qualquer ocorrência com atendimento confirmado é recusado com `409 BLOCK_SERIES_APPOINTMENT_CONFLICT` (lista de ocorrências em conflito), salvo decisão humana: `skipConflicts: true` (pula as ocorrências em conflito) ou `forceOverlapReason` (força a sobreposição, com motivo).

Estas rotas exigem sessão de pessoa: a IA nunca cria exceção, bloqueio, compromisso pessoal ou série — não há contrato equivalente do lado dela.

### Série de atendimento

| Rota | O que faz |
| --- | --- |
| `POST /v1/appointments/series/preview` | pré-visualiza `occurrenceCount` ocorrências a partir de `firstDate`/`firstStartTime`, no intervalo (`intervalDays`, ou o padrão do serviço), ajustando cada uma ao horário disponível mais próximo; cria um hold por ocorrência encontrada |
| `POST /v1/appointments/series/confirm` | confirma todas as ocorrências de uma vez, a partir dos `holdId` da pré-visualização (`occurrences: [{ holdId }]`); exige `Idempotency-Key` |

A confirmação roda em uma única transação: se qualquer ocorrência não puder ser confirmada, **nada é criado**. O código depende do motivo: hold vencido, consumido ou liberado responde `409 APPOINTMENT_HOLD_EXPIRED`; horário tomado entre a pré-visualização e a confirmação responde `409 SLOT_UNAVAILABLE` — o hold ainda era válido, quem recusou foi a disponibilidade. Nos dois casos a resposta identifica **qual** ocorrência falhou e oferece alternativas, em `error.details.upstreamDetails`: `occurrenceIndex`, `holdId`, `occurrenceDate` e `alternatives`. Confirmada, cada ocorrência vira um atendimento independente com `seriesId` comum — cancelar, remarcar ou concluir uma não toca as demais.

O número de ocorrências é limitado por um teto configurável (`APPOINTMENT_SERIES_MAX_OCCURRENCES`), validado tanto na pré-visualização quanto na confirmação: acima dele a resposta é `400 APPOINTMENT_SERIES_TOO_LONG`, com o teto vigente em `details.cap`. Repetir a confirmação com a mesma `Idempotency-Key` devolve a série já criada, sem criar nada novo.

## Importação única do Minha Agenda (Goal010)

Substitui a migração bidirecional: um negócio importa do Minha Agenda **uma vez**, sem escrita de volta e sem opção de trocar de fonte pela API pública. Nenhuma rota abaixo aceita `source`/`target`; a origem é sempre a integração Minha Agenda já conectada do negócio (`POST /v1/calendar/integration/connect`), e o negócio/ator vêm sempre da sessão — nenhum corpo aceita `tenantId` ou `userId`.

| Rota | O que faz |
| --- | --- |
| `GET /v1/calendar/imports` (Goal020) | lê o estado da importação do negócio: direito (`right`), sessão viva (`session`, `null` se não houver) e histórico (`history`, `null` até a conclusão); sem efeito, não exige `Idempotency-Key` |
| `POST /v1/calendar/imports` | abre a sessão de importação (`sourceAccountId`, `sourceAccountLabel?`, `replace?`); exige `Idempotency-Key` |
| `POST /v1/calendar/imports/:sessionId/analyze` (Goal061) | inicia a análise: confere sessão, estado e conexão, reivindica o lease gravando `ANALYZING` e responde `202` com `{ sessionId, status, previewVersion }`, sem tocar a origem nesta requisição; exige `Idempotency-Key` |
| `GET /v1/calendar/imports/:sessionId/preview` (Goal061) | lê o preview gravado pela última análise, por categoria, sem reler a origem; sem efeito, não exige `Idempotency-Key` |
| `GET /v1/calendar/imports/:sessionId/categories/:category/items` | lista os itens de uma categoria, paginado (`status?`, `limit`, `offset`) |
| `POST /v1/calendar/imports/:sessionId/categories/:category/selection` (Goal020) | marca/desmarca uma categoria inteira para importar (`selected`); não altera `previewVersion` nem os itens; exige `Idempotency-Key` |
| `POST /v1/calendar/imports/:sessionId/items/:itemId/decision` | decide um item em conflito (`decision`: `INCLUDE`, `EXCLUDE`, `MERGE_WITH_EXISTING`, `CREATE_NEW`, `KEEP_EXISTING`; `targetInternalId` obrigatório nos dois últimos); exige `Idempotency-Key` |
| `POST /v1/calendar/imports/:sessionId/execute` (Goal061) | inicia a execução, no mesmo formato da análise: confere sessão, estado, conexão e `previewVersion`, reivindica o lease gravando `EXECUTING` e responde `202` com `{ sessionId, status, previewVersion }` (`maxItems?` no corpo), sem tocar a origem nesta requisição; exige `Idempotency-Key` |
| `GET /v1/calendar/imports/:sessionId/progress` | progresso lido do banco a cada chamada, por categoria e total, com `interrupted` e `lastError` (Goal061, ver abaixo) |
| `POST /v1/calendar/imports/:sessionId/complete` | conclui a sessão, consumindo o direito único de importação do negócio (`acceptPending?` aceita concluir com itens ainda pendentes); exige `Idempotency-Key` |

Estas rotas são **só humano**: não existe contrato de importação do lado da IA, no mesmo padrão de bloqueio/exceção do Goal009.

### Início assíncrono da análise e da execução (Goal061)

`POST .../analyze` e `POST .../execute` deixaram de esperar a origem: a requisição só confere estado e reivindica o lease, gravando `ANALYZING`/`EXECUTING` na mesma escrita, e responde **`202`** com `{ sessionId, status, previewVersion }` — nunca o preview nem o andamento, que se leem por `GET .../preview` e `GET .../progress`. O trabalho continua no servidor depois da resposta; fechar a tela não cancela nada. Análise e execução se excluem pela linha: com a sessão em `ANALYZING`, iniciar a execução é recusado, e vice-versa; uma segunda tentativa enquanto o lease adverso está vivo responde `409 IMPORT_SESSION_LEASE_HELD`, no mesmo mecanismo de `error.details.upstreamCode` dos demais códigos nomeados desta seção. A mesma `Idempotency-Key` devolve a mesma resposta de início e não dispara um segundo trabalho.

`GET .../preview` lê o preview da versão vigente sem reanalisar; uma sessão que nunca foi analisada (`previewVersion` zero) é recusada com `409 IMPORT_SESSION_PREVIEW_NOT_AVAILABLE`. A resposta não traz `changesSincePreviousVersion` — esse cálculo só existe no instante da análise e não é reconstruível de uma leitura posterior.

`GET .../progress` e o campo `session` de `GET /v1/calendar/imports` ganham, por acréscimo:

- `interrupted`: verdadeiro quando a sessão está em `ANALYZING` ou `EXECUTING` com o lease vencido pelo relógio do **banco**, ou sem lease — nunca decidido por relógio do cliente;
- `lastError`: `{ code }` ou `null`, com `code` em `IMPORT_SOURCE_AUTH_REJECTED | IMPORT_SOURCE_UNAVAILABLE | IMPORT_SOURCE_INVALID_RESPONSE | IMPORT_PREVIEW_STALE | IMPORT_INTERNAL_ERROR`; a mensagem nunca é exposta;
- `failedReasons` por categoria (só em `GET .../progress`): `[{ reasonCode, count }]` dos itens `FAILED` daquela categoria.

Recusas nomeadas das rotas de importação:

| Rota | Código | HTTP | Quando |
| --- | --- | --- | --- |
| `GET /v1/calendar/imports` | — | — | não recusa por estado: negócio sem conexão, sem sessão e sem histórico é resposta válida com `right` indisponível e `session`/`history` em `null`. Fora isso, só as recusas de sessão/CSRF comuns a todo o `/v1` |
| `POST .../analyze`, `POST .../execute` | `IMPORT_SESSION_LEASE_HELD` | 409 | a sessão já está reivindicada por outra passada em curso (`ANALYZING` para iniciar a execução, `EXECUTING` para iniciar a análise, ou a mesma operação já em andamento) |
| `GET .../preview` | `IMPORT_SESSION_PREVIEW_NOT_AVAILABLE` | 409 | a sessão ainda não foi analisada (`previewVersion` zero); não há preview gravado para ler |
| `POST .../categories/:category/selection` | `IMPORT_SESSION_NOT_FOUND` | 404 | não existe sessão com esse id **para o negócio da sessão autenticada** — a mesma resposta de uma sessão de outro negócio, que nunca é distinguida |
| `POST .../categories/:category/selection` | `IMPORT_SESSION_NOT_SELECTABLE` | 409 | a sessão está em estado terminal (`COMPLETED`, `FAILED` ou `SUPERSEDED`) e não admite mais escolha; o estado que recusou vem em `upstreamDetails.status` |
| `POST .../categories/:category/selection` | `IMPORT_SESSION_CATEGORY_NOT_FOUND` | 404 | a categoria é válida no contrato, mas esta sessão ainda não a descobriu — marcar o que a análise não viu escolheria sobre nada |

Como toda recusa de domínio que o BFF repassa do Scheduling, esses códigos chegam ao cliente em `error.details.upstreamCode`, com `error.code: "UPSTREAM_ERROR"` e o status HTTP original preservado — o mesmo mecanismo dos demais códigos nomeados desta seção.

Nenhuma das duas rotas de seleção altera `previewVersion`, item ou `status`: a leitura é pura e a marcação escreve apenas `ImportSessionCategory.selected`, que a execução lê no início de cada passada.

`previewVersion` é obrigatória em `execute` de propósito: executar é executar o preview que o negócio aprovou. Se a origem mudou desde a análise, a versão vigente é outra e o trabalho grava `409 IMPORT_PREVIEW_STALE` como `lastError` — sem o campo, omitir a versão executaria a análise vigente qualquer que fosse ela, e a recusa de preview obsoleto viraria opt-in de quem chama. Agendamento futuro cujo horário já está ocupado por um atendimento da Agenda Atendly não é sobreposto: o item fica em `NEEDS_REVIEW` com `APPOINTMENT_SLOT_TAKEN` e a decisão volta para o negócio.

Uma vez concluída (`POST .../complete`), a sessão é o único registro definitivo do negócio: `POST /v1/calendar/imports` para o mesmo negócio devolve `409 IMPORT_ALREADY_COMPLETED` — não existe uma segunda importação. Decisão já tomada em um item, ou item já resolvido pela execução, recusa uma segunda decisão com `409 IMPORT_ITEM_ALREADY_DECIDED`.

### A base inteira e a agenda existente (Goal062)

**Diretório completo de clientes.** `CUSTOMER` deixou de cobrir só quem aparece vinculado a um agendamento ou bloqueio já lido: quando a origem expõe listagem, a categoria lê o diretório inteiro (`sourceSupported: true`, `limitationCode: null`), com cliente marcado como excluído na origem removido — salvo quando ele ainda está referenciado por um agendamento ou bloqueio, caso em que a referência prevalece. Sem o endpoint, ou com a origem recusando a listagem (404 ou resposta fora do contrato), a categoria recua para a cobertura antiga — só quem está vinculado — com `sourceSupported: false` e `limitationCode: "CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED"`, distinto de `"CUSTOMER_DIRECTORY_UNAVAILABLE"` (a origem nunca teve o endpoint). Credencial recusada ou origem indisponível continuam derrubando o trabalho inteiro, como qualquer outra categoria.

**Preço zero é preço não informado.** Na categoria `SERVICE` e nos itens de agendamento importados, preço `0` da origem nunca vira `priceType: "FIXED"` com `price: 0`: é a mesma pendência de negócio que preço ausente, e os dois resolvem para `priceType: "NOT_INFORMED"`, `price: null`. Na análise, um serviço com preço `0` (e sem outro motivo de revisão já atribuído) recebe `reasonCode: "SERVICE_PRICE_NOT_INFORMED"` — informativo, não bloqueia a importação nem sobrepõe uma correspondência já encontrada.

**Busca por telefone com equivalência de formas.** `GET /v1/customers?phone=` (e a mesma busca usada pela análise da importação para casar cliente já cadastrado) deixou de comparar dígitos por igualdade exata. Um telefone é normalizado para a forma canônica brasileira (`55` + DDD + assinante, celular sempre com o 9º dígito) quando reconhecível, e a busca compara contra o **conjunto de formas equivalentes** desse número — canônica, nacional (sem `55`), com e sem o 9º dígito — para achar cliente cadastrado antes deste Goal em formato diferente. Números não reconhecíveis como brasileiros continuam comparados pela forma normalizada de sempre, sem equivalência.

**A disponibilidade da origem troca a vigente, nunca soma.** A categoria `AVAILABILITY` é uma grade só, formada por `company` e (se houver) `employee:<id>`; os itens dela são decididos juntos: decidir um item (`INCLUDE` ou `EXCLUDE`) decide automaticamente os demais itens da categoria ainda sem decisão nesta sessão, cada um com sua própria linha de decisão. Sem horário ativo no negócio, o item de disponibilidade segue `PENDING` como qualquer outra categoria. Com horário ativo, a análise marca o item `NEEDS_REVIEW` com `reasonCode: "AVAILABILITY_REPLACES_CURRENT"`, e a execução só grava a grade da origem — apagando a vigente inteira na mesma transação — quando algum item do grupo recebeu decisão de **item** `INCLUDE`; `IMPORT_ALL` e decisão de categoria nunca contam. `EXCLUDE` mantém a grade atual intacta. Se a grade da origem se sobrepõe a si mesma (mesma regra de validação de `PATCH /internal/availability-settings`), o item recebe `reasonCode: "AVAILABILITY_SOURCE_OVERLAP"` e ela nunca é gravada, com ou sem decisão. Se um horário ativo surgir no negócio depois da análise sem a troca ter sido confirmada, a execução falha o grupo com `AVAILABILITY_CHANGED_SINCE_ANALYSIS` e pede nova análise.

Para essa decisão, `GET .../categories/:category/items` acrescenta, **só** nos itens de `category: "AVAILABILITY"`, dois campos com a mesma forma de `availabilitySettingsSchema.rules` (sem `id`/`active`):

| Campo | Valores | Significado |
| --- | --- | --- |
| `currentAvailability` | array de `{ dayOfWeek, startTime, endTime }` | grade vigente do negócio no momento da leitura |
| `proposedAvailability` | mesmo formato ou `null` | grade que a análise leu e validou da origem; `null` quando ela não pôde ser gravada (sobreposição, registro fora do contrato) |

Os dois campos estão ausentes em toda outra categoria.

**Telefone gravado.** `phone` de cliente criado ou editado por `POST /v1/customers`, `PATCH /v1/customers/:id`, pela confirmação de agendamento ou pela importação passa a ser `+` seguido da forma canônica quando o número é brasileiro reconhecido (por exemplo, `+5555999990001`); número não reconhecido continua como digitado, sem espaços nas pontas. Linhas gravadas antes deste Goal não são reescritas: a busca por equivalência é que as encontra. A busca devolve candidatos e nada vincula, funde nem renomeia ([D-005](../../docs/migration/DECISIONS.md)).

**Prova e limite.** Na execução final da rodada 2 do Goal062, `test:bff-integration` (dentro de `validate:integration`) passou com **49** arquivos e **389** testes, inclusive os **3** de `tests/goal062-import.integration.test.ts`, que passam a resposta do Scheduling com `currentAvailability`/`proposedAvailability` pelo schema deste contrato. A contagem de chamadas `this.http.` em `apps/bff/src/clients/` segue **42**. **A conferência humana do §9 do Goal062 não foi feita:** ninguém conferiu contra a conta de teste real da Minha Agenda que `GET /customers` devolve a lista na forma validada, que a contagem de clientes da revisão bate com a da origem, que a troca da grade funciona com a grade real nem que uma mensagem de um número importado encontra a cliente como candidata. Decisão: [D-079](../../docs/migration/DECISIONS.md), `PROPOSED`.

### Conexão da origem: só e-mail e senha (Goal060)

`POST /v1/calendar/integration/connect` aceita só `{ email, password }`, e nada além disso — um corpo no formato anterior a este Goal (`credentials: { basicAuth, username, password }`, `configuration: { baseUrl, employeeId, paymentMethod, ... }`) é recusado com `400 VALIDATION_ERROR`, sem nenhuma chamada ao Scheduling. Endereço da origem e cliente OAuth deixam de vir do corpo — são os do sistema, configuração de ambiente do Scheduling — e o profissional da conta não é mais informado: ele é descoberto por login, e a conta precisa ter exatamente um profissional.

Recusa da conexão, por classe:

| Classe | Código(s) | HTTP |
| --- | --- | --- |
| Credencial recusada | `MINHA_AGENDA_AUTH_FAILED` | 422 |
| Conta sem um profissional único | `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND`, `MINHA_AGENDA_MULTIPLE_PROFESSIONALS` | 422 |
| Origem indisponível | `MINHA_AGENDA_TIMEOUT`, `MINHA_AGENDA_UNREACHABLE`, `MINHA_AGENDA_HTTP_ERROR`, `MINHA_AGENDA_INVALID_RESPONSE` | 502 ou 504 |
| Falha nossa | `MINHA_AGENDA_NOT_CONFIGURED`, `INTEGRATION_CONFIGURATION_INVALID` | 503 ou 500 |

Como toda recusa de domínio que o BFF repassa, o código chega em `error.details.upstreamCode` com `error.code: "UPSTREAM_ERROR"`. Diferente do mecanismo padrão de proxy desta API — que reduz todo `5xx` de origem a `502` (ver "Status honesto do WhatsApp e da IA" e a seção da IA) —, `MINHA_AGENDA_AUTH_FAILED` e `MINHA_AGENDA_NOT_CONFIGURED` chegam com o **status que o Scheduling escolheu** (422 e 503, respectivamente): é a própria decisão dele sobre a causa, não uma falha de infraestrutura genérica que o BFF precise generalizar. Nenhum código `MINHA_AGENDA_*` sai com `401` ou `403` em nenhuma resposta desta rota — o status HTTP da origem, quando relevante, só aparece dentro de `error.details`, nunca como o status da resposta. Nenhuma mensagem, `details` ou log desta rota carrega e-mail, senha, token ou o corpo cru da resposta da origem.

### A credencial não sobrevive à conclusão da importação (Goal060)

Concluir a importação (`POST /v1/calendar/imports/:sessionId/complete`) apaga, na mesma transação que grava a conclusão, a credencial `MINHA_AGENDA` gravada para o negócio. Depois disso, `GET /v1/calendar` devolve `integration: null`. Uma nova chamada a `POST /v1/calendar/integration/connect` não é recusada por isso: ela guarda a credencial de novo, sem restrição. Quem recusa é `POST /v1/calendar/imports`, com `409 IMPORT_ALREADY_COMPLETED` (ver acima), porque o direito único de importação do negócio já foi consumido, e não porque a credencial não existe mais. `DELETE /v1/calendar/integration` continua existindo e não muda.

## Status honesto do WhatsApp e da IA (Goal014)

`GET /v1/status` é um read model dedicado — não substitui `GET /v1/dashboard`, que continua com seu próprio contrato. Ele existe para o shell mostrar, em qualquer tela, se o número está de fato conectado e se a IA está de fato respondendo, sem inferir a partir de configuração local: `whatsapp.status` só é `CONNECTED` depois de consultar o Evolution nesta própria requisição, e `ai.state` só é `ACTIVE` depois de consultar a IA. Nenhum dos dois é deduzido do que foi salvo — dado salvo é *desejado*, não *efetivo*.

```json
{
  "data": {
    "whatsapp": { "status": "CONNECTED", "phoneNumber": "5511999999999", "checkedAt": "2026-09-14T12:00:00.000Z" },
    "ai": { "desiredEnabled": true, "effectiveEnabled": true, "state": "ACTIVE" },
    "accountDeletion": { "status": "NONE", "dueAt": null },
    "degraded": false
  }
}
```

| Campo | Valores | Significado |
| --- | --- | --- |
| `whatsapp.status` | `CONNECTED`, `DISCONNECTED`, `UNKNOWN` | `CONNECTED`/`DISCONNECTED` vêm da verificação real no Evolution, feita nesta requisição, do mesmo jeito que `GET /v1/dashboard` verifica; `UNKNOWN` é quando o Evolution não respondeu **ou quando o vínculo existe mas não pode ser lido** (pendente, divergente ou credencial que não abre) — nunca quando não existe vínculo, que é `DISCONNECTED` (Goal059) |
| `whatsapp.phoneNumber` | telefone em dígitos ou `null` | número em dígitos, sem servidor nem sufixo de aparelho (Goal059), reportado pelo Evolution, ou o último guardado quando ele não informou um novo |
| `whatsapp.checkedAt` | timestamp ISO | instante desta verificação, sempre "agora" — a rota nunca reaproveita uma leitura antiga |
| `ai.desiredEnabled` | booleano | o que o negócio configurou em `PATCH /v1/settings/ai` (`AiSettings.enabled`), local ao BFF |
| `ai.effectiveEnabled` | booleano ou `null` | o que a IA relata como configuração ativa; `null` quando o tenant ainda não foi projetado lá ou quando a IA não respondeu |
| `ai.state` | `ACTIVE`, `OFF`, `PENDING`, `UNKNOWN` | `ACTIVE`: desejado ligado e a IA confirma ligado. `OFF`: desejado desligado — não importa o que a IA relate. `PENDING`: desejado ligado mas a IA relata desligado, `null` ou ainda não foi projetado. `UNKNOWN`: a IA não respondeu a esta requisição |
| `accountDeletion.status` (Goal025/WU-03) | `NONE`, `SCHEDULED`, `CANCELLED`, `PURGED` | a mesma linha que `POST`/`DELETE /v1/account/deletion` gravam; `NONE` é o negócio que nunca pediu exclusão |
| `accountDeletion.dueAt` (Goal025/WU-03) | timestamp ISO ou `null` | vencimento do prazo de sete dias, usado pela tela para contar os dias até a purga; `null` exatamente quando `status: "NONE"` |
| `degraded` | booleano | `true` quando o Evolution ou a IA não responderam nesta requisição |

Indisponibilidade de qualquer dependência vira `UNKNOWN` (nunca um valor otimista) e nunca `500`: o erro é registrado e a resposta segue `200` com `degraded: true`. O tenant é sempre o da sessão autenticada, como em `GET /v1/dashboard`; não é possível ler ou influenciar o status de outro negócio.

## Teste real de ativação da IA (Goal019/WU-05)

Três rotas, todas resolvendo o negócio pela sessão autenticada, iguais às demais mutações desta API (`requireTenantContext` + CSRF):

- `GET /v1/activation-test` lê a execução corrente do negócio (viva ou a última terminada). `data: null` significa "nunca testou" — nunca é fabricado progresso, estado ou sucesso para preencher a tela; se a IA não responder, o erro sobe como `UPSTREAM_ERROR` (ver abaixo), nunca vira `null` silencioso.
- `POST /v1/activation-test` inicia o teste. Corpo `{ "tenantPhone": string }` (o número do WhatsApp do negócio, 8 a 20 caracteres). Responde `202` com a execução já persistida — a partir daqui ela roda no servidor, sem depender de tela nenhuma; fechar o navegador não cancela nada.
- `POST /v1/activation-test/restart` reinicia depois de interferência humana: a execução pausada é **descartada**, não marcada como falha. Mesmo corpo e mesma resposta `202` de `POST /v1/activation-test`.

Corpo de `data` nas três rotas (ou `null`, só na leitura sem execução):

| Campo | Valores | Significado |
| --- | --- | --- |
| `id` | string | identificador da execução |
| `state` | `RUNNING`, `PAUSED_BY_HUMAN`, `SUCCEEDED`, `FAILED`, `DISCARDED` | estado corrente da execução |
| `terminal` | booleano | `true` para `SUCCEEDED`, `FAILED` e `DISCARDED`; `false` para `RUNNING` e `PAUSED_BY_HUMAN` — terminal e não terminal nunca são o mesmo valor com interpretações diferentes |
| `startedAt` / `finishedAt` / `pausedAt` | timestamp ISO ou `null` | `finishedAt` só em estado terminal; `pausedAt` só em `PAUSED_BY_HUMAN` |
| `currentStep` / `completedStep` | um dos oito passos do vault (`TEST_NOTICE`, `CLIENT_ASKS_PRICE`, `AI_IDENTIFIES_SERVICE`, `AI_ANSWERS_PRICE`, `CLIENT_ASKS_SLOT`, `AI_CHECKS_AVAILABILITY`, `CLIENT_ACCEPTS_SLOT`, `AI_CONFIRMS_APPOINTMENT`) ou `null` | passo em andamento e último passo concluído |
| `attempts` / `maxAttempts` | inteiro | tentativas já usadas e limite declarado no código (3: a primeira tentativa mais duas repetições) |
| `failedStep` / `failedStepLabel` | um dos oito passos ou `null` / texto em linguagem do negócio ou `null` | passo que falhou; só presentes quando `state: "FAILED"` |
| `failureCode` | string ou `null` | código da falha, só em `FAILED`; conjunto fechado, descrito em "Códigos de falha da execução" abaixo. Nenhuma execução falha **não** ativa a IA, seja qual for o código, e `failedStep` continua nomeando onde ela parou |
| `appointmentId` | string ou `null` | agendamento real criado pelo teste, presente assim que o passo de confirmação é alcançado |
| `cleanupState` | `PENDING`, `CLEAN`, `RESIDUAL` | estado da remoção dos dados de teste — ver abaixo |
| `cleanupAt` | timestamp ISO ou `null` | quando a limpeza rodou; `null` enquanto `cleanupState: "PENDING"` |
| `cleanupResidue` | array, vazio em `PENDING` e em `CLEAN` | o que sobrou da limpeza — ver abaixo |
| `milestones` | array de 6 itens, sempre nesta ordem, sempre os 6 presentes | os seis marcos do vault — ver abaixo |

`milestones` é fechado: progresso que não está nesta lista não existe, e cada item só é `reached: true` quando há fato gravado que o sustenta — nunca por tempo decorrido, animação ou passo corrente.

| Campo do item | Valores | Significado |
| --- | --- | --- |
| `milestone` | `MESSAGE_SENT`, `SERVICE_IDENTIFIED`, `PRICE_INFORMED`, `AVAILABILITY_CHECKED`, `SLOT_SELECTED`, `APPOINTMENT_CONFIRMED` | nome do marco, nesta ordem fixa |
| `reached` | booleano | `true` só quando existe o fato gravado que sustenta o marco |
| `reachedAt` | timestamp ISO ou `null` | `null` exatamente quando `reached: false` |
| `sourceKind` | `MESSAGE`, `SERVICE`, `AVAILABILITY`, `APPOINTMENT` ou `null` | tipo do fato que sustenta o marco; `null` só junto de `reached: false` |
| `sourceId` | string ou `null` | id do fato (mensagem, serviço lido, consulta de disponibilidade ou agendamento criado); mesmo par que `sourceKind` |

### Estado da limpeza e resíduo

A execução remove **exatamente o que ela criou**, pelos IDs que gravou no momento da criação — nunca por busca por telefone, nome, data ou padrão. O que sobrar é relatado, e é por isso que estes campos existem: limpeza parcial apresentada como completa é mentira de tela, e o contrato não permite representá-la.

| `cleanupState` | Significado |
| --- | --- |
| `PENDING` | a limpeza ainda não rodou. **Não** é "limpou e deu certo": em `PENDING` a tela não pode afirmar que nada ficou |
| `CLEAN` | a limpeza rodou e `cleanupResidue` está vazio. Este é o único estado em que a tela pode dizer que os dados de teste saíram |
| `RESIDUAL` | a limpeza rodou e alguma coisa ficou. `cleanupResidue` nomeia o quê, item a item |

Cada item de `cleanupResidue`:

| Campo | Valores | Significado |
| --- | --- | --- |
| `target` | `MESSAGE`, `CONVERSATION`, `CONTACT`, `APPOINTMENT`, `CUSTOMER` | o que ficou. Conjunto fechado: resíduo de alvo fora desta lista não é representável |
| `id` | string | o ID que a execução gravou. É por ele que a tela nomeia o que ficou — não por telefone nem por nome |
| `reason` | `OPERATION_UNAVAILABLE`, `WOULD_TOUCH_OTHER_ROWS`, `REMOVAL_FAILED`, `STILL_VISIBLE` | por que sobrou — ver abaixo |
| `label` | texto | o alvo em linguagem do negócio ("agendamento de teste", "pessoa de teste"), para a tela não traduzir enum por conta própria |
| `explanation` | texto | a razão em linguagem do negócio, já pronta para exibição |

| `reason` | Significado | Como se resolve |
| --- | --- | --- |
| `OPERATION_UNAVAILABLE` | o produto não tem operação de remoção para aquele dado | remoção manual; a tela diz o que ficou em vez de afirmar limpeza completa |
| `WOULD_TOUCH_OTHER_ROWS` | apagar arrastaria junto, por cascade, linha que a execução não criou — a limpeza **recusa** | nada a fazer: manter o dado de teste é menos grave do que remover dado de terceiro |
| `REMOVAL_FAILED` | a remoção foi tentada e não foi concluída, ou a conferência do read model não pôde ser feita | tentar o teste de novo; a limpeza é idempotente e repetir não apaga nada além do já apagado |
| `STILL_VISIBLE` | a remoção foi aceita mas o dado continua visível na leitura | remoção manual |

### Códigos de falha da execução (`failureCode`)

Só aparecem com `state: "FAILED"`, e **nenhum** deles ativa a IA. O código diz o que falhou; `failedStep` e `failedStepLabel` dizem onde. Cada causa tem código próprio de propósito: reaproveitar o código de outra causa manda corrigir o que não está errado.

| Código | Significado | Como se resolve |
| --- | --- | --- |
| `ACTIVATION_TEST_AI_DID_NOT_ACT` | a IA não registrou a ação que o passo exige — consultar o catálogo, consultar a agenda ou criar o agendamento. `failedStep` diz qual | tentar o teste de novo; se repetir, é o atendimento da IA que não está acontecendo. **Não** é problema de catálogo nem de agenda: os dois são verificados antes de a execução começar |
| `ACTIVATION_TEST_AI_DID_NOT_REPLY` | a IA não escreveu resposta nenhuma na conversa de teste | tentar de novo; é o mesmo caso acima visto pela resposta em vez da ferramenta |
| `ACTIVATION_TEST_AI_REPLY_NOT_DELIVERED` | a IA respondeu, mas a resposta não saiu pelo WhatsApp do negócio: a mensagem ficou registrada sem entrega confirmada | conferir a conexão do WhatsApp (`GET /v1/status`) e testar de novo — a IA atendeu, o transporte do negócio é que não confirmou |
| `ACTIVATION_TEST_AI_DID_NOT_CONFIRM_APPOINTMENT` | a IA chamou a ferramenta de agendamento sem confirmar agendamento nenhum: preparar não é confirmar | tentar de novo; a agenda já tinha horário válido quando o teste começou |
| `ACTIVATION_TEST_ABANDONED` | a execução parou de dar sinal de vida (o processo do servidor caiu no meio) e o produto a encerrou como falha na leitura seguinte, em vez de deixar o negócio preso a um `RUNNING` eterno | iniciar o teste de novo; o negócio não fica travado |
| `ACTIVATION_TEST_STEP_FAILED` | o passo falhou sem código próprio — tipicamente transporte ou dependência indisponível depois de esgotadas as tentativas (`attempts` = `maxAttempts`) | tentar de novo |

### Recusas nomeadas de `POST /v1/activation-test` e `POST /v1/activation-test/restart`

Toda recusa tem código próprio e nenhuma vira `500` para o consumidor. `ACTIVATION_TEST_AI_ALREADY_ACTIVE` é recusa própria do BFF, verificada antes de qualquer chamada à IA; as demais são decisão da IA e chegam pelo mecanismo padrão desta API — `error.code: "UPSTREAM_ERROR"` e o código original em `error.details.upstreamCode` (ver "Erros próprios da IA nesta seção" mais abaixo).

| Código | Onde aparece | `error.statusCode` | Significado | Como se resolve |
| --- | --- | --- | --- | --- |
| `ACTIVATION_TEST_AI_ALREADY_ACTIVE` | `error.code` | `409` | a IA já está ativa para o negócio (`AiSettings.enabled`, o desejado gravado pelo BFF); testar não é ferramenta recorrente depois que a IA está no ar | desligar a IA em `PATCH /v1/settings/ai` antes de testar de novo, ou reconectar/trocar o WhatsApp, que volta a exigir teste. Por esta mesma recusa, Configurações › IA só oferece o teste enquanto a IA não está ativa (Goal063) |
| `PLATFORM_NUMBER_NOT_CONFIGURED` | `error.details.upstreamCode` | `502` (a IA falhou com `503`) | a instância oficial da Atendly não está configurada neste ambiente | configuração de ambiente, fora do autoatendimento; a tela diz que o teste não está disponível, sem simular progresso |
| `ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED` | `error.details.upstreamCode` | `409` | não há vínculo de WhatsApp ativo para o negócio | conectar o WhatsApp (`POST /v1/whatsapp/connect`) antes de testar |
| `ACTIVATION_TEST_TENANT_PHONE_UNKNOWN` | `error.details.upstreamCode` | `409` | `tenantPhone` enviado está vazio (depois de normalizado) ou é igual ao número da própria plataforma | enviar o número real do WhatsApp do negócio |
| `ACTIVATION_TEST_NO_ELIGIBLE_SERVICE` | `error.details.upstreamCode` | `409` | o catálogo não tem nenhum serviço apto a agendamento normal | cadastrar ou ativar um serviço (`POST`/`PATCH /v1/services`) |
| `ACTIVATION_TEST_NO_AVAILABILITY` | `error.details.upstreamCode` | `409` | a agenda não oferece nenhum horário para o serviço escolhido pelo sistema | corrigir a disponibilidade em `PATCH /v1/settings/availability` antes de testar |
| `ACTIVATION_TEST_ALREADY_RUNNING` | `error.details.upstreamCode` | `409` | já existe execução viva (em andamento ou pausada) para o negócio | ler `GET /v1/activation-test`; se estiver pausada, `POST /v1/activation-test/restart` |

`202` é a única resposta de sucesso das duas rotas de escrita: a execução foi persistida e passa a rodar no servidor, sem confirmação de resultado nesta mesma resposta.

## `PATCH /v1/settings/ai` exige prova do teste real (Goal063/WU-01)

Ligar a IA à mão (`enabled: true` na passagem desligada → ligada) passa a exigir a mesma prova válida da autoativação da Home (D-010): uma execução do teste real em `SUCCEEDED` que ainda vale para o WhatsApp de hoje — não superada por troca ou revínculo de canal. Sem essa prova a rota recusa com `409 AI_ACTIVATION_TEST_REQUIRED`, **sem gravar nada** em `AiSettings`, nos quatro casos: nenhuma execução (`data: null` em `GET /v1/activation-test`), execução `FAILED` ou `PAUSED_BY_HUMAN`, execução `SUCCEEDED` já superada por troca de canal, ou a leitura da execução falhando. A checagem roda **depois** da recusa de exclusão agendada e **antes** da recusa de serviço operacional (`409 CONFLICT` sem `details`, inalterada) — nesta ordem: exclusão, prova, serviço.

Ligar com prova válida grava `activatedByRunId` com o id da execução usada, no mesmo campo que a autoativação da Home já preenche — a mesma execução não liga a IA duas vezes, pelo mesmo motivo em qualquer um dos dois caminhos. `enabled: true` com a IA **já** ligada (troca só de `tone`) não exige prova nova e não muda `activatedByRunId`.

Desligar (`enabled: false`, "Pausar") só grava `activatedByRunId` — da execução válida corrente, se houver uma — quando o `enabled` já gravado era `true` (Goal067, review063 observação 2): é a passagem ligada → desligada que é pausa de verdade. Salvar só o estilo com a IA já desligada não grava `activatedByRunId`, mesmo com prova válida disponível — nada aqui era uma pausa, e gravar o id religaria a IA pela reconciliação de ativação (`reconcileAiActivation`) com uma prova que nunca autorizou pausa nenhuma. Uma IA religada à mão volta a desligar sozinha se a execução que a autorizou for superada por troca de canal (`DEACTIVATED_BY_CHANNEL_CHANGE`, inalterado).

**O teste real fora do onboarding (Goal063, U-11).** As rotas `GET/POST /v1/activation-test` e `POST /v1/activation-test/restart` não mudam e nunca olharam o onboarding. O que muda é quem as oferece: além do onboarding, Configurações › IA oferece o mesmo teste **enquanto a IA não está ativa** — sem prova válida e com WhatsApp conectado. Com a IA ativa a tela não mostra entrada para o teste, e o BFF continua recusando com `ACTIVATION_TEST_AI_ALREADY_ACTIVE`. Um teste novo bem-sucedido depois de uma pausa continua ligando a IA pela reconciliação, como antes. O cliente trata `409 AI_ACTIVATION_TEST_REQUIRED` relendo o estado (`GET /v1/settings` e `GET /v1/activation-test`), nunca como erro genérico. O onboarding só é concluído (`POST /v1/onboarding/complete`) pela ação que sai dele, depois da etapa do teste; a regra é do cliente e não muda a rota.

**Limites.** IA ligada antes do Goal063 sem teste continua ligada: não há regra retroativa nem migration. Salvar só o estilo com a IA já ligada nunca é recusado por falta de teste. Que o teste envia e recebe mensagem de verdade não é provado por teste automatizado, porque o número oficial da Atendly não existe no ambiente de migração (D-035); essa conferência humana **não foi feita** pelo Goal063.

## Checklist pós-onboarding da Home (Goal018/WU-10)

`GET /v1/dashboard` acrescenta três booleanos a `scheduling.data.calendar.capabilities`, todos leitura real, nunca configuração local:

| Campo | Significado |
| --- | --- |
| `capabilities.aiActivationReady` | ao menos um serviço operacional (já existia no Scheduling — usado por `PATCH /v1/settings/ai`, ver "Catálogo" acima — e passa a ser devolvido também aqui) |
| `capabilities.hoursConfigured` | fonte escolhida com ao menos uma regra de disponibilidade ativa; sem fonte escolhida é `false` (Goal027). Mesmo predicado de `AVAILABILITY_REQUIRED` em `POST /v1/onboarding/complete` |
| `capabilities.activationTestCompleted` (Goal019) | execução do teste real em `SUCCEEDED` **que ainda vale** para o WhatsApp de hoje. Negócio que nunca testou é `false` — "nunca testou", não "falhou" —, e teste feito contra um número que foi trocado ou revinculado deixa de contar, porque o vault exige teste novo nesse caso. Dependência indisponível também é `false`: "não sei" nunca vira "concluído" |

Os três campos, somados a `whatsapp.status` de `GET /v1/status`, alimentam o checklist de `/inicio` ("Cadastrar um serviço", "Definir horários de atendimento", "Conectar o WhatsApp", "Concluir o teste da IA"): enquanto a IA não estiver efetivamente ativa (`GET /v1/status`.`ai.state` diferente de `ACTIVE`), a Home mostra o que falta, com item concluído marcado.

### Contadores da semana corrente (Goal074/WU-03)

`GET /v1/dashboard` ganha três inteiros não negativos, aditivos, um em cada dependência:

| Campo | Significado |
| --- | --- |
| `ai.data.aiAppointmentsThisWeek` | atendimentos que a IA confirmou desde a segunda-feira 00:00 da semana local do negócio, incluindo os dias já passados dela — mesmo cálculo de `aiAppointmentsToday`, só com a janela maior |
| `ai.data.conversationsTakenOverThisWeek` | conversas **distintas** que passaram de IA para humano desde a mesma segunda-feira 00:00; mais de uma tomada na mesma conversa na semana conta uma vez só |
| `scheduling.data.appointmentsThisWeek` | atendimentos não cancelados da Agenda Atendly na mesma semana local, segunda a domingo, incluindo os dias já passados |

A semana é sempre a semana local corrente do negócio (fuso de `platform.timezone`), segunda a domingo — nunca só "hoje até domingo". Os três contam de novo a cada leitura, sem persistir separado do que já gera `aiAppointmentsToday`/`appointmentsToday`; nenhum dos dois campos diários muda de forma ou de cálculo por causa deste acréscimo.

### Reconciliação desired/effective em `GET /v1/status` (Goal019)

`GET /v1/status` e `GET /v1/dashboard` deixaram de apenas relatar divergência entre o que o negócio pediu (`ai.desiredEnabled`, do BFF) e o que a IA aplicou (`ai.effectiveEnabled`): antes de ler, os dois **tentam convergir**, uma vez por requisição. A reconciliação nunca lança — a leitura continua respondendo `200` mesmo quando ela falha — e nunca entra em laço.

`ai.reconciled` diz o que aconteceu nesta requisição:

| Valor | Significado |
| --- | --- |
| `NOOP` | nada divergia; não havia o que convergir |
| `ACTIVATED` | execução do teste real em `SUCCEEDED` ligou a IA agora. Só sucesso ativa, e sempre pela regra vigente (ao menos um serviço operacional) — sem ela o valor é `NOOP`, não `ACTIVATED` |
| `DEACTIVATED_BY_CHANNEL_CHANGE` | o WhatsApp foi trocado ou revinculado, a execução que autorizou a ativação deixou de valer e a IA foi desligada. "Testado" não sobrevive à troca |
| `CONVERGED` | o desejado já estava gravado e foi reaplicado na IA |
| `FAILED` | havia divergência e a tentativa de convergir não deu certo. O estado lido continua sendo o real, não o pretendido |
| `UNKNOWN` | faltou leitura para decidir; nada foi mudado |

Ativar a partir da **mesma** execução bem-sucedida duas vezes não gera duas ativações nem duas projeções: a execução consumida fica gravada no BFF.

`ai.state: "PENDING"` ganhou apresentação própria na Home e no shell — antes caía sob "IA desligada" (resíduo do [review014](../../docs/migration/reviews/014-review.md)), agora é visualmente distinto tanto de `OFF` quanto de `UNKNOWN`.

## Vínculo WhatsApp: estados ambíguos

`GET /v1/whatsapp` também reprojeta a credencial da instância na IA. É idempotente e não altera o estado do número; existe para que um vínculo criado antes da projeção cifrada se restabeleça sozinho, sem o negócio precisar reconectar o número na mão. Falha nessa projeção é registrada e não impede a leitura de status.

O `phoneNumber` desta rota segue a mesma regra de `GET /v1/status`: sempre em dígitos, sem servidor nem sufixo de aparelho (Goal059).

Quando o vínculo não é inequívoco, todas as rotas de WhatsApp recusam com `409 CONFLICT` antes de qualquer efeito. Há dois estados distintos:

| Estado | O que é | Resolução |
| --- | --- | --- |
| Pendente | linha do próprio usuário autenticado, sem negócio dono, deixada assim pelo backfill; nenhum outro negócio a reivindica | o dono descarta com `DELETE /v1/whatsapp` e conecta o número de novo |
| Divergente | duas linhas concorrentes, ou uma linha cujo dono de negócio e dono de usuário são contas diferentes | fora do autoatendimento: resolver envolveria decidir pelo outro negócio; depende de operação |

`DELETE /v1/whatsapp` é a única rota que trata o estado pendente como resolvível, e apenas para o dono autenticado da linha. No estado pendente a credencial não é abrível — a cifra está ligada ao negócio —, então o logout autenticado no transporte é pulado; a instância remota ainda é removida pela credencial administrativa. No estado divergente a rota recusa como as demais, sem apagar nada.

## Consentimento na conexão e leitura do QR corrente (Goal071/WU-01)

`POST /v1/whatsapp/connect` e `POST /v1/whatsapp/reconnect` exigem `consentAccepted: true` no corpo, no mesmo padrão de `termsAccepted` do cadastro (`z.literal(true)`). Ausente ou diferente de `true`: `400 VALIDATION_ERROR`, antes de qualquer chamada à Evolution e antes de qualquer escrita — nenhuma instância remota ou linha local nasce sem consentimento. O aceite em si não é gravado. O corpo também não leva a resposta da pessoa à pergunta sobre uso pessoal do número: essa resposta fica só na tela e nenhuma rota a recebe.

`GET /v1/whatsapp/qr` relê o QR pelo que está valendo agora, sobre o vínculo do próprio negócio (`requireTenantContext` + as mesmas recusas `409 CONFLICT` de vínculo pendente ou divergente das demais rotas de WhatsApp). Resposta: `{ "connection": { ... }, "qrcode": string | null }`, nunca com credencial, JID ou nome de instância.

**Marcador de vinculação por QR em curso**, sem migration: a coluna `qrcode` de `WhatsAppInstance` passa a ser o marcador. `connect`/`reconnect` no modo QR a gravam, como já faziam; o modo código a limpa; qualquer leitura que observe o número conectado ou logado (`GET /v1/whatsapp` e `GET /v1/whatsapp/qr`) a limpa.

Sem vinculação por QR em curso (marcador vazio), `GET /v1/whatsapp/qr` recusa com `409 WHATSAPP_QR_NOT_IN_PROGRESS` **antes de qualquer chamada à Evolution** — nem `/instance/status` nem `/instance/qr`. Reler o QR nunca abre uma vinculação que um `connect` com consentimento não abriu.

Com vinculação em curso, a rota lê o status (`getStatus`) **antes** de ler o QR. Com o número conectado ou logado, ela responde a conexão já com o estado conectado (`qrcode: null`), limpa o marcador e não chama `/instance/qr`: no fork, pedir o QR com o cliente já logado pode derrubar a sessão boa. Só com o número nem conectado nem logado a rota chama `getQr`; se a Evolution não tiver QR disponível agora, a resposta é `200` com `qrcode: null`, não erro — cada leitura devolve o QR corrente, sem persistir nada de volta no marcador.

**Limite declarado:** o fork gira o QR a cada 20 s depois do primeiro e, depois do quinto QR, a próxima leitura abre uma sessão nova nele. O BFF não guarda o início da vinculação, porque isso pediria migration. A janela de renovação é da tela: o painel relê a rota enquanto está aberto e visível, dentro de uma janela de no máximo 5 minutos desde o início da vinculação ali, e o BFF não impõe esse limite.

## Mensagem: estado de entrega

O DTO de mensagem de `GET /v1/conversations/:id/messages`, `POST /v1/conversations/:id/messages` e do `lastMessage` de conversa passou a expor o estado de entrega **por operação**, em dois campos opcionais:

| Campo | Valores | Significado |
| --- | --- | --- |
| `deliveryState` | `PENDING`, `SENT`, `FAILED`, `UNKNOWN`, `null` | estado da tentativa de saída |
| `deliveryDetail` | texto curto ou `null` | motivo, quando o estado não é `SENT` |

Os campos são opcionais e podem vir `null`: mensagem recebida (`INBOUND`) não tem entrega, e mensagens gravadas antes desta versão ficaram sem estado ou como `UNKNOWN` pelo backfill. Consumidores devem tratar ausência como "sem informação", nunca como sucesso.

`UNKNOWN` é o estado que a plataforma **não pode afirmar**: o envio saiu e o transporte não respondeu a tempo, ou respondeu erro de servidor. A tentativa não é apagada nem reenviada automaticamente — ela muda de estado apenas por reconciliação, quando o transporte devolve o ID externo ou quando chega o recibo `Delivered`/`Read`. Até lá, apresente a mensagem como incerta, não como enviada.

`FAILED` significa que a saída comprovadamente não foi entregue: recusa definitiva do transporte, credencial do canal ainda não projetada, ou resposta cancelada porque o cliente mandou mensagem nova antes do envio. A entrega é *at-least-once* com dedupe e reconciliação; a API não promete exactly-once.

`POST /v1/conversations/:id/messages` tem **dois** sucessos, com sentidos distintos, e o BFF repassa o status que a IA respondeu — não colapsa os dois em `201`:

| Status | O que aconteceu | O que ainda não aconteceu |
| --- | --- | --- |
| `201` | a saída foi gravada e o transporte aceitou o despacho | a entrega no WhatsApp — quem diz isso é `deliveryState` |
| `202` | a saída foi gravada e a tentativa está registrada | o despacho não foi confirmado; a mensagem volta com `deliveryState` `FAILED` ou `UNKNOWN` |

Nos dois casos o corpo é o mesmo envelope com a mensagem criada, e nenhum dos dois significa que o WhatsApp entregou. Um cliente que trate `202` como `201` apresenta como enviada uma tentativa que a plataforma não conseguiu despachar; quem só precisa saber se houve escrita durável pode tratar qualquer `2xx` como sucesso e ler `deliveryState`.

## Mensagem: kind e attachment de mídia, rota de mídia sob demanda (Goal013)

O DTO de mensagem ganhou dois campos **opcionais**, presentes em `GET /v1/conversations/:id/messages`, `POST /v1/conversations/:id/messages` e no `lastMessage` de conversa; mensagem de texto e o estoque anterior a esta versão continuam sem os dois campos, e o consumidor trata a ausência como `TEXT` sem attachment:

| Campo | Valores | Significado |
| --- | --- | --- |
| `kind` | `TEXT`, `AUDIO`, `IMAGE`, `DOCUMENT`, `VIDEO`, `STICKER`, `UNKNOWN` | tipo de conteúdo da mensagem |
| `attachment` | objeto ou ausente | metadados da mídia, só quando `kind` é mídia |

`attachment`, quando presente, traz `kind` (mesma lista, sem `TEXT`/`UNKNOWN`), `mimetype`, `fileName`, `sizeBytes`, `durationSeconds` (só áudio), `tooLarge` (mídia acima do teto de transporte, sem bytes disponíveis), `transcript`/`transcriptStatus`/`transcriptError` (só áudio; ver garantias abaixo) e `mediaAvailable` (booleano: se `GET .../media` tem chance de devolver bytes agora). A URL real da mídia (`mediaUrl` do WhatsApp ou do MinIO) nunca sai no DTO — só a rota de mídia abaixo dá acesso a ela.

O que a transcrição garante: quando `transcriptStatus` é `DONE`, `transcript` é o texto que a IA efetivamente usou como turno do cliente, nunca inventado — falha de reconhecimento grava `FAILED` com `transcriptError`, e ausência de transcrição por política (contato ignorado, sessão pessoal, mídia sem áudio) grava `SKIPPED`. O que ela **não** garante: exatidão do texto (a IA trata como podendo conter erro), disponibilidade contra o WhatsApp além do que a origem permite, nem persistência de bytes — nenhum byte de mídia fica retido pela IA além do processamento do evento.

`GET /v1/conversations/:id/messages/:messageId/media` devolve o **corpo bruto** da mídia (não JSON), com `content-type` e, quando a origem informou, `content-disposition` com o nome do arquivo — proxy fino para a rota interna equivalente da IA, resolvendo o tenant pela sessão autenticada como as demais rotas, sem CSRF por ser leitura. Recusas próprias da IA (mensagem sem attachment, attachment `tooLarge`, mídia indisponível na origem) chegam pelo mesmo envelope de `UPSTREAM_ERROR` com `upstreamCode` das demais rotas desta API, nunca um `500` genérico; o consumidor deve tratar essas recusas como estado de exibição (ex.: "mídia indisponível"), não como falha do próprio BFF.

## Conversa: eventos de agenda que a IA fez (Goal070)

`GET /v1/conversations/:id/events` devolve, em ordem cronológica, o que a IA fez na agenda dentro desta conversa — proxy fino para a rota interna equivalente, igual a `GET .../messages`. Cada item é um de três tipos, discriminados por `type`:

| `type` | Campos próprios | Significado |
| --- | --- | --- |
| `HOLD_PLACED` | `date`, `startTime`, `holdExpiresAt` | a IA reservou um horário temporariamente |
| `HOLD_EXPIRED` | `date`, `startTime` | a reserva venceu sem confirmação |
| `APPOINTMENT_CREATED` | `appointmentId`, `date`, `startTime` | a IA confirmou o agendamento |

Todos os itens trazem `id` e `occurredAt` (data/hora ISO do fato). Os eventos são **derivados só do ledger** de chamadas de `create_appointment` que a IA já registra — nunca do texto que o modelo escreveu — e nunca dependem de mensagem, então uma resposta que o modelo tenha formulado de forma imprecisa não muda o que esta rota mostra. Uma reserva **substituída antes de vencer** por uma reserva seguinte nunca vira `HOLD_EXPIRED` — a reserva anterior já foi liberada. Se ela já tiver vencido antes da reserva seguinte, o `HOLD_EXPIRED` aparece do mesmo jeito.

Resolve o negócio pela sessão autenticada, sem CSRF por ser leitura. Recusas próprias da rota interna (conversa de outro negócio ou inexistente) chegam pelo mesmo envelope de `UPSTREAM_ERROR` das demais rotas de conversa.

## Conversa: categoria, sessão e atendimento humano

`GET /v1/conversations` aceita, além de `status`, `search` e `limit`:

| Filtro | Valores | Significado |
| --- | --- | --- |
| `category` | `COMMERCIAL`, `UNCLASSIFIED`, `PERSONAL` | organização da inbox, atributo da sessão vigente |
| `handling` | `AI`, `HUMAN` | estado de atendimento: `HUMAN` é "Você atendendo" |
| `ignored` | `true`, `false` | contato em `Ignorar IA` |
| `customerId` | id de um cliente do Scheduling | só conversas dessa pessoa, dentro do negócio da sessão autenticada (Goal075) |

O DTO de conversa ganhou campos **opcionais**; respostas anteriores a esta versão continuam válidas e o consumidor trata ausência como o padrão seguro (`UNCLASSIFIED`, `AUTOMATIC`, `AI`, não ignorado):

| Campo | Valores | Significado |
| --- | --- | --- |
| `category` | `COMMERCIAL`, `UNCLASSIFIED`, `PERSONAL` | categoria vigente da sessão |
| `categorySource` | `AUTOMATIC`, `MANUAL` | origem da categoria vigente |
| `suggestedCategory` | mesma lista ou `null` | sugestão do agente, gravada com proveniência |
| `handling` | `AI`, `HUMAN` | quem está atendendo agora |
| `ignored`, `ignoredAt` | booleano, data ou `null` | contato ignorado, regra do contato |
| `aiPaused` | booleano | pausa explícita da IA para o contato (`/bot off`, `/ia_pause`) |
| `customerId` | string ou `null` | vínculo do contato com a pessoa do Scheduling (Goal017); `null` quando o contato ainda não está vinculado, ausente no estoque anterior a este campo |
| `session` | objeto ou `null` | `id`, `startedAt`, `expiresAt`, `lastContactMessageAt`, `humanHandlingSince` |
| `contentExpiredThrough` | data ISO ou `null` | até quando o conteúdo desta conversa já foi purgado (Goal023); `null` enquanto nada expirou. Só avança, nunca retrocede. É o campo que a interface lê para dizer que mensagens antigas expiraram — não se infere expiração pela ausência de mensagem. A exclusão é assíncrona e irreversível: o conteúdo apagado não volta, nem aumentando o prazo depois |

Precedência: `ignored` do contato prevalece sobre a sessão; o override manual (`categorySource: MANUAL`) prevalece sobre `suggestedCategory` e atravessa a troca de sessão. A classificação automática nunca escreve override.

`PUT /v1/conversations/:id/category` recebe `{ "category": "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL" | null }`; `null` limpa o override e devolve a conversa à classificação automática. `PUT /v1/conversations/:id/ignore` recebe `{ "ignored": true | false }`. As duas respondem com o DTO de conversa completo.

Como as demais mutações, ambas resolvem o negócio pela sessão autenticada e exigem CSRF quando a credencial é o cookie. Nenhuma delas aceita `tenantId` por header, body ou query.

### Contato ignorado por telefone, sem conversa ainda (Goal019/WU-07)

`PUT /v1/conversations/ignored-contacts` marca (ou desmarca) um contato como ignorado a partir de um número informado manualmente, sem exigir uma conversa já existente — a etapa opcional do onboarding entre conectar o WhatsApp e testar (vault `02-Ativacao-e-Teste-do-WhatsApp.md` §"Contatos ignorados"). Corpo `{ "phone": string, "ignored": boolean }` (8 a 20 caracteres antes de normalizar). O telefone chega à IA como dígitos (mesma normalização de `tenantPhone` no teste real); o contato é **criado** quando ainda não existe, pela mesma chave `(tenantId, channelId, externalContactId)` usada pelo canal conectado.

Resposta: `{ "contactId": string, "externalContactId": string, "ignored": boolean, "ignoredAt": string | null }`. A origem gravada no contato (`ignoredSource: "onboarding"`) é distinta da marcação feita a partir de uma conversa existente (`"panel"`, via `PUT /v1/conversations/:id/ignore`) — mesma regra do contato, mesmo caminho de recusa da IA (contato ignorado nunca recebe resposta automática), origem apenas para auditoria.

Resolve o negócio pela sessão autenticada e exige CSRF, como as demais mutações. Sem vínculo de WhatsApp ativo para o negócio, a recusa chega como `UPSTREAM_ERROR` com `error.details.upstreamCode: "CHANNEL_CONNECTION_NOT_FOUND"` (`404`) — não há canal para a chave do contato.

## Envio manual assume a conversa

`POST /v1/conversations/:id/messages` **deixou de exigir takeover prévio**: enviar assume. Antes desta versão a rota respondia `409 HUMAN_HANDOFF_REQUIRED` quando a conversa não estava em handoff, e a profissional precisava clicar em assumir antes de escrever — enquanto isso, a resposta automática em curso continuava valendo.

Agora o controle humano é gravado antes do transporte e a saída automática ainda não enviada é cancelada. O mesmo vale para a mensagem manual enviada pelo próprio WhatsApp conectado. Abrir ou ler a conversa (`GET`) não muda estado nenhum.

`POST /v1/conversations/:id/release` é o `Retomar IA`: devolve a conversa à IA e faz o próximo turno reavaliar o contexto atual em vez de continuar do ponto anterior. Dentro de uma sessão viva não existe retomada automática por relógio — a IA só volta por essa rota ou em uma sessão nova, aberta após a expiração por inatividade do contato (~24 h), e nunca para contato ignorado. Nenhuma mensagem automática anuncia a troca entre IA e humano.

## Conhecimento, memória do cliente, resumo e sugestões (Goal012)

Todas as rotas desta seção resolvem o negócio pela sessão autenticada e exigem CSRF na mutação, como as demais. Nenhuma aceita `tenantId` por header, body ou query. São proxies finos para as rotas internas equivalentes da IA (`/internal/knowledge/...`, `/internal/customers/:id/memory...`, `/internal/customers/:id/summary`, `/internal/conversations/:id/suggestions`); o BFF valida entrada e repassa o DTO exatamente como a IA devolve.

### Conhecimento do negócio, versionado

`type` de `KnowledgeDocument` é um de `FAQ`, `GUIDANCE` (orientação), `CARE` (cuidado), `PROCEDURE`, `BUSINESS_INFO` ou `TEXT_POLICY`. `GET /v1/knowledge/documents` lista os documentos `ACTIVE` do negócio (filtráveis por `type`, `serviceId` e `status`); `POST` cria a primeira versão; `PUT /v1/knowledge/documents/:id` edita a versão vigente — cada edição gera uma **versão nova** e inativa a anterior na mesma transação do lado da IA, nunca apaga; `DELETE` desativa (`INACTIVE`), nunca remove a linha. `serviceId` liga o documento a um serviço do catálogo por ID, sem FK entre bancos; ausente, o documento é geral.

Existe exatamente um documento `BUSINESS_INFO` por negócio para o campo livre "Outras informações importantes", com `source` fixa — só `PUT /v1/knowledge/other-info` grava nele. `POST`/`PUT /v1/knowledge/documents` recusam `type: "BUSINESS_INFO"` com `409` (repassado da IA, `upstreamCode: "KNOWLEDGE_BUSINESS_INFO_RESERVED"`). `GET /v1/knowledge/other-info` lê o texto vigente; resposta `{ "content": string }`, vazio (`""`) quando o negócio nunca salvou nada — não é erro.

Cada documento carrega um ou mais `chunks` (`content` + `metadata` livre), reindexados a cada versão nova. Se o provider de embedding falhar, nada muda no banco da IA e a resposta chega como erro de infraestrutura próprio (`502`, `error.details.upstreamCode: "KNOWLEDGE_INDEX_UNAVAILABLE"`) — nunca um documento ativo sem chunks, nunca um `500` genérico.

Precedência na recuperação usada pela IA (não é uma rota, é contrato de produto): regra de serviço em foco > FAQ geral > dados estruturados > campo livre; documento de outro serviço nunca entra no contexto de um serviço diferente.

### Memória do cliente: origem, permissão e idade

`CustomerMemory` é por `(tenantId, customerId)` da pessoa do Scheduling. Cada item tem `kind` (`PREFERRED_PERIOD`, `PREFERRED_DAY`, `RECURRING_SERVICE`, `OBSERVATION`), `value`, `origin` (`CUSTOMER_STATED`, `AI_INFERRED`, `PROFESSIONAL`), `aiAllowed` (permissão explícita de uso pela IA), `confidence` (só quando inferida), `sourceConversationId`/`sourceMessageIds`, `observedAt`, `lastReinforcedAt`, `supersededById` e `removedAt`/`removedBy`.

`GET /v1/customers/:id/memory` lista o que está vigente (nem removido, nem substituído). `POST` cria com origem sempre `PROFESSIONAL` — a rota não aceita origem no corpo, para o painel não conseguir se passar por "informado pela cliente" — e permissão **nasce negada** por padrão, como as notas do cadastro (`aiAllowed: false` a menos que declarado). `PATCH /v1/customers/:id/memory/:memoryId` só altera `aiAllowed`. `DELETE` remove qualquer item, inclusive memória inferida pela IA — é o ponto do controle existir.

Memória inferida pela IA (`AI_INFERRED`) nasce fora desta rota, a partir de turnos que a própria IA processou; uma inferência nova que contradiz a anterior do mesmo tipo **substitui** (`supersededById`), sem apagar. Só memória com `aiAllowed: true` entra no prompt da IA; item mais antigo que o limite de validade do produto entra marcado como antigo, de menor peso.

### Resumo do cliente

`POST /v1/customers/:id/summary` gera, sob demanda e pelo modelo, um resumo textual **exclusivamente** a partir de material autorizado: memória permitida (`aiAllowed: true`), notas e tags autorizadas do Scheduling (`aiAuthorized: true`) e próximos atendimentos. A resposta traz `summary`, `promptVersion`, `aiRunId` (auditoria, `kind = SUMMARY`, sempre presente) e `sources` (contagem do que foi efetivamente usado: `memory`, `notes`, `tags`, `upcomingAppointments`). O resumo **não é persistido** como memória, nota nem cadastro — a única escrita do lado da IA é o `AiRun` de auditoria.

Resumo sem auditoria não é gerado: sem pessoa vinculada a um contato a IA recusa com `CUSTOMER_NOT_LINKED` (404) e, quando não há conversa onde ancorar o `AiRun`, com `SUMMARY_NOT_AUDITABLE` (409) — em nenhum dos dois casos o modelo chega a ser chamado.

### Sugestões de resposta no atendimento humano

`POST /v1/conversations/:id/suggestions` devolve até três sugestões de resposta para a profissional editar e, se quiser, enviar pelo caminho humano já existente (`POST /v1/conversations/:id/messages`, inalterado) — a rota de sugestão nunca envia nada sozinha. A resposta traz `conversationId`, `suggestions` (array de texto, até três itens), `aiRunId` (auditoria, `kind = SUGGESTION`) e `promptVersion` (versão efetiva do prompt de sugestão); os quatro campos são obrigatórios e vêm da IA sem reescrita.

A geração usa um binding **somente leitura** de tools: nenhuma tool com efeito é oferecida ao modelo, nenhum hold é criado, nenhum rascunho é gravado, nenhuma `Message` nem linha de outbox nasce. Recusas próprias e verificáveis da IA chegam como qualquer outro erro próprio dela (ver abaixo), nunca como sugestão vazia silenciosa, com `upstreamCode` sendo um de:

| `upstreamCode` | Significado |
| --- | --- |
| `CONTACT_IGNORED` | contato em `Ignorar IA` |
| `SESSION_PERSONAL` | sessão vigente é `PERSONAL` |
| `HUMAN_HANDLING_REQUIRED` | conversa sem atendimento humano vigente |
| `AI_DISABLED` | IA desligada para o negócio |
| `NO_TEXTUAL_MESSAGE` | última mensagem do cliente não é textual |

A ordem de avaliação é a da tabela: regra do contato antes de regra de sessão, privacidade antes de precondição de atendimento, atendimento antes de configuração do negócio, configuração do negócio antes do conteúdo textual da mensagem.

### Erros próprios da IA nesta seção

O BFF não reescreve o código de erro da IA como algo genérico: a resposta chega com `error.code: "UPSTREAM_ERROR"`, `error.statusCode` igual ao devolvido pela IA (ou `502` quando ela falhou com `5xx`) e o código original da IA em `error.details.upstreamCode` — o mesmo mecanismo já usado por todo proxy do BFF para a IA e o Scheduling. Nenhuma rota desta seção degrada uma recusa de negócio da IA para `500` genérico.

## Lembretes, confirmação de presença e notificação de alteração (Goal021, WU-009, G-27)

### Configuração de lembrete

Duas rotas novas, proxy fino para `GET`/`PATCH /internal/reminder-settings` do Scheduling, no mesmo padrão de `PATCH /v1/settings/availability`: resolvem o negócio pela sessão autenticada (`requireTenantContext`), a leitura não exige CSRF e a escrita exige — sem sessão, `401 UNAUTHORIZED`; mutação sem CSRF, `403 CSRF_TOKEN_REJECTED`/`403 CSRF_ORIGIN_REJECTED`, antes de qualquer chamada ao Scheduling.

| Rota | O que faz |
| --- | --- |
| `GET /v1/settings/reminders` | lê a configuração de lembrete e confirmação de presença do negócio |
| `PATCH /v1/settings/reminders` | grava a configuração inteira |

Corpo/resposta:

```json
{
  "configured": true,
  "confirmationEnabled": false,
  "pricePolicy": "NEVER",
  "rules": [{ "slot": "FIRST", "leadMinutes": 1440 }]
}
```

| Campo | Valores | Significado |
| --- | --- | --- |
| `configured` | booleano, só leitura | `false` quando o negócio nunca gravou a configuração — a resposta traz o default do produto (um lembrete a 24h, `FIRST`); `true` sempre que já gravou, mesmo com `rules: []` |
| `confirmationEnabled` | booleano | confirmação de presença separada da conclusão (G-27); ausente na escrita grava `false` |
| `pricePolicy` | `NEVER`, `WHEN_FIXED` | quando o lembrete menciona o preço do atendimento; ausente na escrita grava `NEVER` |
| `rules` | array de até dois itens, `{ slot: "FIRST" \| "SECOND", leadMinutes: inteiro positivo até 43200 }` | posição e antecedência (minutos) de cada lembrete; **obrigatório** em `PATCH`, mesmo vazio — `rules: []` é a escolha explícita de desligar os lembretes, distinta de nunca ter configurado |

`PATCH` recusa mais de dois itens, posição repetida ou antecedência fora do intervalo com `400 VALIDATION_ERROR`, sem gravar nada e sem chamar o Scheduling — a mesma validação que a constraint SQL `ReminderRule_leadMinutes_check` espelha do lado de lá. Esta é a única leitura/escrita de configuração de lembrete no contrato público; não existe equivalente do lado da IA — quem configura é sempre humano, no mesmo padrão de disponibilidade e oferta (Goal009).

## Prazo de retenção configurável (Goal023, WU-01, G-29)

Duas rotas sob `requireTenantContext`; `tenantId` vem sempre da sessão, nunca do corpo. A **existência da linha** não é a escolha: sem linha gravada, o negócio vale Comercial 90 dias / Pessoal 30 dias, o default do produto.

| Rota | O que faz |
| --- | --- |
| `GET /v1/settings/retention` | lê o prazo de retenção corrente do negócio |
| `PATCH /v1/settings/retention` | grava uma ou as duas categorias |

Corpo do `PATCH` (ambos os campos opcionais, mas ao menos um é obrigatório):

```json
{
  "commercialRetentionDays": 180,
  "personalRetentionDays": 30,
  "confirmReduction": false
}
```

Resposta de ambas as rotas:

```json
{
  "commercialRetentionDays": 90,
  "personalRetentionDays": 30,
  "retentionDaysOptions": [30, 90, 180, 365],
  "unclassifiedPurged": false,
  "lastSweepCompletedAt": "2026-09-14T03:10:22.481Z",
  "appliesFrom": "NEXT_SWEEP"
}
```

| Campo | Valores | Significado |
| --- | --- | --- |
| `commercialRetentionDays` | `30`, `90`, `180` ou `365` | prazo do conteúdo comercial; fora da allowlist é `400 VALIDATION_ERROR`, sem gravar nada |
| `personalRetentionDays` | `30`, `90`, `180` ou `365` | prazo do conteúdo pessoal; mesma allowlist |
| `retentionDaysOptions` | `[30, 90, 180, 365]`, só leitura | a allowlist **do servidor**; o cliente lê as opções daqui em vez de declarar a própria lista |
| `unclassifiedPurged` | `false`, só leitura | invariante, não estado: conteúdo de sessão não classificada não tem prazo, não tem opção e **não é purgado** |
| `lastSweepCompletedAt` | ISO-8601 ou `null`, só leitura | instante da última varredura **concluída** deste negócio (todas as fontes de pé); `null` enquanto nenhuma concluiu. Uma passada que degradou terminou, mas não concluiu, e não avança este campo |
| `confirmReduction` | booleano, só na escrita | exigido quando o `PATCH` **reduz** qualquer uma das duas categorias; aumentar nunca exige |
| `appliesFrom` | `"NEXT_SWEEP"`, só leitura | uma redução aceita só passa a valer na próxima varredura de purga — esta rota nunca apaga dado |

Reduzir uma categoria (ou as duas) sem `confirmReduction: true` é recusado com `409 RETENTION_REDUCTION_REQUIRES_CONFIRMATION`, sem gravar nada; `error.details.reductions` lista cada categoria reduzida com `from`/`to`. Não existe categoria, coluna, parâmetro ou default para conteúdo "não classificado" — só Comercial e Pessoal.

O `PATCH` devolve a mesma forma do `GET`, inclusive `lastSweepCompletedAt`: gravar prazo não varre, e a resposta não pode sugerir que varreu.

**O que estas rotas não configuram.** Três prazos são **técnicos** e não aparecem aqui nem na interface, porque não são conteúdo de conversa e sim rastro de transporte e execução: o inbox durável da IA (`INBOX_RETENTION_DAYS`, default 180 dias), o conteúdo das intenções de lembrete (`RETENTION_INTENT_CONTENT_DAYS`, default 90 dias) e o outbox do transporte em Go (`WEBHOOK_OUTBOX_RETENTION_HOURS`, default 30 dias). Todos vêm de variável de ambiente, e nenhum deles muda quando o negócio muda o prazo das categorias.

## Preferência de visualização da agenda (Goal073/WU-03)

Duas rotas sob `requireTenantContext`, só do BFF: a Agenda Atendly não tem noção de "vista", então não existe rota interna correspondente no Scheduling — a preferência é gravada e lida só aqui. A **ausência da linha** é o default do produto: nada oculto, sem vista inicial escolhida, nunca gravada só pela leitura.

| Rota | O que faz |
| --- | --- |
| `GET /v1/settings/agenda-view` | lê a preferência de visualização do negócio |
| `PATCH /v1/settings/agenda-view` | grava um ou os dois campos |

Corpo/resposta:

```json
{
  "hiddenWeekdays": [0, 6],
  "initialView": "WEEK"
}
```

| Campo | Valores | Significado |
| --- | --- | --- |
| `hiddenWeekdays` | array de até seis inteiros `0`-`6` (domingo a sábado), sem repetido | dias da semana ocultos na grade da agenda; ausente na escrita preserva o valor já gravado (ou `[]`, sem linha) |
| `initialView` | `DAY`, `WEEK`, `MONTH` ou `null` | vista com que a Agenda abre; ausente na escrita preserva o valor já gravado, `null` explícito limpa a escolha |

`PATCH` recusa com `400 VALIDATION_ERROR`, sem gravar nada: sete dias ocultos (ocultaria a semana inteira), dia repetido ou dia fora de `0`-`6`. Sem sessão, `401 UNAUTHORIZED`. `tenantId` vem sempre da sessão; esta rota nunca lê nem grava a preferência de outro negócio.

### Estado de envio de um agendamento

`GET /v1/appointments/:id/notifications` devolve as intenções de envio ao cliente **daquele** compromisso — os lembretes desta ocorrência e o aviso de alteração —, em ordem de vencimento (`dueAt`, desempatado por `id`). É uma pergunta diferente da que `GET /v1/settings/reminders` responde: a configuração diz com quanta antecedência o lembrete sairia; só esta rota diz o que aconteceu com o lembrete **deste** agendamento.

| Campo | Valores |
| --- | --- |
| `kind` | `REMINDER`, `CHANGE_NOTICE` |
| `slot` | `FIRST`, `SECOND` (lembrete) ou `CHANGE_NOTICE` (aviso) |
| `appointmentVersion` | versão notificável do compromisso para a qual a intenção nasceu |
| `state` | `PENDING`, `CLAIMED` (não saiu), `SENT`, `FAILED` (pode ter saído), `DISMISSED`, `CANCELLED` (não devia sair) |
| `reason` | vocabulário fechado, obrigatório em `FAILED`/`DISMISSED`/`CANCELLED` e `null` nos demais |
| `dueAt`, `sentAt`, `settledAt` | quando vence, quando saiu e quando foi liquidada |

`reason` assume `LEAD_ALREADY_PASSED`, `APPOINTMENT_VERSION_SUPERSEDED`, `APPOINTMENT_NOT_CONFIRMED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_ALREADY_STARTED`, `REMINDER_CONFIGURATION_CHANGED`, `CUSTOMER_WITHOUT_PHONE`, `CONTACT_IGNORED`, `AI_NOT_ENABLED`, `CHANNEL_NOT_CONNECTED`, `TRANSPORT_FAILED`, `TRANSPORT_UNKNOWN` ou `ATTEMPTS_EXHAUSTED`. `TRANSPORT_UNKNOWN` é terminal e significa "não dá para afirmar se saiu" — quem lê não deve traduzi-lo como "não enviado".

A resposta **não** traz os fatos compostos para a entrega (nome e telefone do cliente já formatados) nem qualquer dado de lease: eles são do envio, não da leitura. Lista vazia é resposta normal — negócio sem lembrete configurado, atendimento passado ou importado antes deste Goal simplesmente não têm intenção nenhuma, e a interface não afirma estado de lembrete nesse caso. Como o histórico, só existe na Agenda Atendly, a única agenda operacional (Goal027).

### `notifyCustomer` em cancelar e remarcar

`POST /v1/appointments/:id/reschedule` e `POST /v1/appointments/:id/cancel` ganham um campo aditivo e opcional no corpo: `notifyCustomer: boolean`. **Nenhuma rota pública existente muda de forma**: o campo é opcional, sua ausência preserva exatamente o comportamento anterior a esta versão, e a resposta das duas rotas não muda.

| Valor | Efeito |
| --- | --- |
| ausente, ou `false` | não notifica — o default do contrato é silêncio |
| `true` | pedido explícito de aviso: se a mutação de fato mudou algo que o cliente precisaria saber (horário, serviços ou estado), nasce um aviso de alteração para ele |

Cancelar sempre cancela os lembretes pendentes do horário anterior, com `notifyCustomer` ou sem — as duas decisões são independentes. `notifyCustomer` só decide o aviso de alteração, nunca os lembretes em si, e só existe nestas duas rotas: a IA cancela e remarca a pedido do próprio cliente dentro da conversa, e avisá-lo do que ele acabou de pedir seria ruído — por isso ela nunca tem este campo em nenhum contrato dela, e a interface manda-o sempre, explicitamente, marcado por padrão. A recomputação de lembretes e o aviso em si são regra do Scheduling, provada nas suítes de lá; o que este contrato garante é só o transporte do pedido.

## Central de notificações e alertas persistentes (Goal022/WU-04)

Quatro rotas, todas sob `requireTenantContext` e escopadas pelo tenant da sessão; nenhuma aceita `tenantId` no corpo ou na query — um valor estranho ali é simplesmente ignorado, o escopo vem sempre da sessão. A reconciliação das espécies que dependem dos donos (`CUSTOMER_WAITING_HUMAN`, `REMINDER_FAILED`, `IMPORT_COMPLETED`, `AI_APPOINTMENT_CREATED`, `SETUP_INCOMPLETE`) roda dentro de `GET /v1/notifications` e `GET /v1/notifications/summary`, sob o throttle persistido do motor (`NOTIFICATIONS_RECONCILE_MIN_INTERVAL_SECONDS`); as condições de canal (`WHATSAPP_DISCONNECTED`, `AI_UNAVAILABLE`) reconciliam dentro de `GET /v1/status` (Goal022/WU-03). Fonte indisponível nunca vira `500`: a leitura responde `200` com o que está gravado.

`AI_ACTIVATED` (nível `INFO`, forma `EVENT`, Goal077, [D-093](../../docs/migration/DECISIONS.md)) é a oitava espécie do enum `kind`, acrescentada por migration aditiva (`ALTER TYPE "NotificationKind" ADD VALUE 'AI_ACTIVATED'`). Não é reconciliada: nasce gravada na mesma transação que liga a IA (`enabled: false -> true` com uma execução do teste real), tanto na autoativação quanto em `PATCH /v1/settings/ai` — ou as duas escritas acontecem, ou nenhuma. `occurredAt` é o instante da ativação; `payload` é sempre `{}` e `subjectId` é sempre `null` — o fato é "a IA deste negócio ligou", sem telefone, credencial nem identificador do vínculo. Deduplicada pela execução do teste que autorizou a ativação (`AI_ACTIVATED:run:<runId>`): religar com a mesma execução (pausar e ligar de novo, por exemplo) nunca gera uma segunda notificação, e um teste novo gera. Pausar, desligar por troca de canal, conta em exclusão e ativação recusada não criam notificação nenhuma.

| Rota | O que faz |
| --- | --- |
| `GET /v1/notifications` | lista paginada, com filtro por `level`, `unread` e `resolved` |
| `GET /v1/notifications/summary` | contadores baratos para o chrome: não lidas por nível e condições abertas |
| `POST /v1/notifications/read` | marca uma notificação (`{ id }`) ou todas as não lidas (`{ all: true }`) como lidas |
| `GET /v1/notifications/preferences` | lê a preferência da central |
| `PATCH /v1/notifications/preferences` | grava a preferência da central |

### `GET /v1/notifications`

Query opcional: `level` (`INFO`, `ATTENTION`, `CRITICAL`), `unread` (booleano), `resolved` (booleano — só notificações cuja `resolvedAt` está ou não preenchida; toda `EVENT` tem `resolvedAt` sempre nulo, então `resolved=false` inclui histórico e condição aberta), `limit` (1–100, default 20) e `offset` (default 0). A lista só enxerga os últimos 90 dias (`occurredAt`); não é retenção — é janela de leitura, a purga é do Goal023.

```json
{
  "total": 3,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": "…",
      "kind": "CUSTOMER_WAITING_HUMAN",
      "level": "ATTENTION",
      "shape": "CONDITION",
      "subjectId": "conversa-1",
      "occurredAt": "2026-09-15T12:30:00.000Z",
      "readAt": null,
      "resolvedAt": null,
      "payload": { "contactName": "Marina", "reason": "EXPLICIT_REQUEST" }
    }
  ]
}
```

`kind` e `subjectId` são o alvo de navegação — quem lê decide para onde levar o negócio (a conversa, o agendamento, a sessão de importação); o BFF não embute URL de frontend no contrato. `payload` traz só o que a copy precisa, nunca telefone, credencial ou payload cru do dono (Goal022/WU-03) — em `CUSTOMER_WAITING_HUMAN`, `contactName` é o nome do contato e **não aparece** quando a conversa ainda não tem um; não há queda para telefone formatado, e quem exibe usa a frase genérica da espécie.

`shape: CONDITION` é estado corrente, e uma condição pode acontecer de novo: quando a fonte volta a reportar uma condição que já tinha sido resolvida, a **mesma** notificação reabre — `resolvedAt` volta a `null`, `occurredAt` passa a ser o instante do episódio novo e ela conta como **não lida** outra vez. O identificador é estável ao longo dos episódios; o WhatsApp que cai, volta e cai de novo é uma linha só, aberta de novo, nunca uma segunda linha e nunca silêncio. Condição ainda aberta não é tocada: `readAt` de quem já viu sobrevive à reconciliação seguinte.

### `GET /v1/notifications/summary`

```json
{
  "byLevel": { "INFO": 0, "ATTENTION": 1, "CRITICAL": 1 },
  "unreadCount": 2,
  "openConditionsCount": 1
}
```

`byLevel` e `unreadCount` contam só não lidas; `openConditionsCount` conta condições abertas (`shape: CONDITION`, `resolvedAt: null`) independente do estado de leitura — é o alerta operacional, não o contador de caixa de entrada.

### `POST /v1/notifications/read`

Idempotente nos dois formatos. Marcar como lida um `id` que não existe, que já está lido, ou que pertence a outro tenant produz exatamente a mesma resposta — `{ "updated": 0 }` — porque a notificação de outro tenant nunca aparece no filtro para começar; não há distinção informativa entre "não existe" e "não é seu". `{ "all": true }` marca todas as não lidas do tenant como lidas nesta chamada; repetir devolve `updated: 0`.

### Preferências

```json
{ "aiAppointmentCreated": false }
```

Único campo do contrato hoje, com **default desligado** (Goal022/WU-03 — "default silencioso"): negócio que nunca configurou não recebe `AI_APPOINTMENT_CREATED`. Não existe campo de canal de e-mail em nenhuma rota da central; um campo que nenhuma camada honra não entra no contrato.

## Sair de todos os dispositivos (Goal024/WU-05)

`POST /v1/auth/logout-all` revoga **todas** as sessões vivas do usuário autenticado — cookie e Bearer, em qualquer dispositivo —, reusando `revokeAllUserSessions` com o motivo próprio `LOGOUT_ALL_DEVICES`. Sob sessão e CSRF, como as demais mutações; não aceita `userId` nem `tenantId` no corpo — a identidade vem sempre da sessão.

A sessão que fez a chamada **também** é revogada: "todos os dispositivos" inclui este. Diferente de `PATCH /v1/auth/password`, a rota não estabelece uma sessão nova no mesmo response — o cookie de sessão é limpo, e o cliente segue para `/login`.

## Ciclo de vida da conta (Goal025/WU-03)

Duas rotas, ambas sob sessão e CSRF; nenhuma aceita `userId` nem `tenantId` no corpo — a identidade é sempre a do negócio da sessão autenticada, como em toda mutação desta API.

### `POST /v1/account/deletion`

```json
{ "password": "a senha atual do usuário" }
```

Pede a exclusão da conta do negócio. Exige a senha atual, com o mesmo grau de reautenticação de `PATCH /v1/auth/password`: a rota lê o usuário da sessão, confere a senha apresentada contra o hash gravado e só então prossegue. Senha errada é `401 UNAUTHORIZED` e **nenhum efeito é iniciado** — nem a linha de exclusão é gravada, nem a IA é desligada, nem o WhatsApp é desconectado.

Com a senha correta, o pedido é aceito e a exclusão nasce `SCHEDULED`, com vencimento sete dias à frente. Na mesma transação a IA desejada do negócio é desligada; a derrubada do canal na IA e a desconexão do WhatsApp são tentadas em seguida, mas uma falha remota **não** derruba o pedido — o dono continua podendo excluir a própria conta mesmo com uma dependência fora do ar.

```json
{ "data": { "status": "SCHEDULED", "dueAt": "2026-09-23T12:00:00.000Z" } }
```

Pedir de novo com uma exclusão já `SCHEDULED` recusa com `409 ACCOUNT_DELETION_ALREADY_SCHEDULED`, sem empurrar o vencimento — o `dueAt` que vale continua sendo o do primeiro pedido, legível em `GET /v1/status`. Pedir sobre uma conta já `PURGED` recusa com `409 ACCOUNT_DELETION_ALREADY_PURGED`.

### `DELETE /v1/account/deletion`

Cancela a exclusão agendada, sem corpo e sem pedir a senha de novo — a sessão vigente já basta, como as demais mutações. Só é aceito dentro do prazo de sete dias e só sobre uma exclusão `SCHEDULED`; devolve `{ "data": { "status": "CANCELLED", "dueAt": "..." } }`.

Cancelar **não restaura nada**: o WhatsApp continua desconectado e a IA continua desligada. Voltar a operar exige reconectar o número e refazer o teste real de ativação, pelos fluxos que já existem — não há efeito de "religar" nesta rota.

| Código | Quando |
| --- | --- |
| `409 ACCOUNT_DELETION_NOT_SCHEDULED` | não há exclusão agendada para cancelar |
| `409 ACCOUNT_DELETION_GRACE_PERIOD_EXPIRED` | o prazo de sete dias já venceu; a purga pode já estar em curso |
| `409 ACCOUNT_DELETION_ALREADY_CANCELLED` | já foi cancelada antes |
| `409 ACCOUNT_DELETION_ALREADY_PURGED` | a conta já foi purgada; não há mais o que cancelar |

`GET /v1/status` devolve o mesmo estado sob `accountDeletion`, para a tela contar os dias sem precisar de uma leitura própria — ver a seção "Status honesto do WhatsApp e da IA" acima.

Enquanto o estado é `SCHEDULED`, **nenhum caminho religa a IA do negócio**. `PATCH /v1/settings/ai` com `enabled: true` recusa com `409 CONFLICT` — o mesmo código e a mesma forma com que já recusava sem serviço operacional, sem `details` novo —, e a reconciliação de ativação mantém o desejado em `false`. Cancelar dentro do prazo devolve a conta ao estado normal: a partir daí `PATCH /v1/settings/ai` volta a valer exatamente como antes, e religar a IA continua exigindo reconectar o WhatsApp e refazer o teste real de ativação. Desde o Goal063, "como antes" inclui a prova do teste real: ligar a IA por `PATCH /v1/settings/ai` exige execução `SUCCEEDED` não superada por troca de canal (seção "`PATCH /v1/settings/ai` exige prova do teste real" acima), e a exclusão agendada continua sendo checada antes dela.

## `PATCH /v1/account/profile` (Goal067)

```json
{ "name": "Novo nome" }
```

Grava o nome do dono da conta. Sob sessão e CSRF, como as demais mutações; não aceita `userId` nem `tenantId` no corpo — a identidade vem sempre da sessão, e a rota escreve só no `User` da sessão, nunca em outro.

`name` usa a mesma validação de `POST /v1/auth/register`: aparado, de 1 a 120 caracteres. Ausente, vazio ou só espaço é `400 VALIDATION_ERROR`. Sem sessão é `401 UNAUTHORIZED`.

```json
{ "data": { "user": { "id": "...", "email": "...", "name": "Novo nome", "createdAt": "..." } } }
```
