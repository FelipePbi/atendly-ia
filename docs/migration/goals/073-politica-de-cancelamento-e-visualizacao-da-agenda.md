# Goal 073 — Política de cancelamento e visualização da agenda

**Status: READY.** Preparado em 2026-09-28 pelo Tech Lead Agent após [Goal067 ACCEPTED](../reviews/067-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v91, com o mesmo ID e o mesmo título, dividida do Goal067. A v92 precisa o escopo com evidência conferida no código da baseline e acrescenta as observações 2 e 5 do [review067](../reviews/067-review.md), que tocam as mesmas telas de Configurações.

## Baseline aceita

Baseline aceita: `a1adf4b08f31c691b85c16afb342949cf9e9e98a`

Goal anterior: 067 — Configurações completas

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal067 já integrado em `main` (origem `ada27c630bb2bb0c22d9fff727764fe25656feae`). **Duas rodadas**, com 4 e 0 blockers. **D-085** foi aceita e [FINAL_AUDIT §46](../FINAL_AUDIT.md) escrita sem reescrever §4 a §45. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review067](../reviews/067-review.md), rodada 2: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:ai-orchestrator` **85**/**97** arquivos (**12** pulados) e **1117**/**1205** testes (**88** pulados); `test:scheduling-service` **35** arquivos e **484** testes; `test:frontend` **94** arquivos e **979** testes; `audit:static` **33** de **34**, **1** pulada; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos; integração do BFF **55** arquivos e **434** testes; integração do Scheduling **16** arquivos e **124** testes; gate autenticado com **155** `expected`, **0** `unexpected`, **0** `flaky` e **0** retentativas.

## Objetivo e posição

Dar ao negócio as duas escolhas de Configurações › Agenda que ainda não existem em camada nenhuma:

1. **"Cancelar ou remarcar pelo WhatsApp"**: sem restrição, ou até 12, 24 ou 48 h antes. É regra global do negócio, com padrão livre, gravada no Scheduling e aplicada a todo cancelamento e remarcação que a IA faz em nome da cliente. Fora do prazo, a IA explica a regra e oferece falar com o profissional. Pela Agenda, a pessoa sempre cancela e remarca.
2. **"Como você vê a Agenda"**: dias visíveis e visualização inicial, gravados e aplicados na Agenda. Ocultar um dia só muda o que a pessoa vê.

Fontes do produto, conferidas nesta passada:

- `docs/product-vault/01-Regras/02-Agenda-e-Agendamentos.md` §"Cancelamento" e §"Remarcação";
- `docs/product-vault/04-Referencia/99-Perguntas-e-Respostas.md`, perguntas **56**, **57**, **58**, **99**, **100**, **321**, **322**, **378**, **379** e **380**;
- `docs/product-vault/03-UX-UI/04-Especificacao-das-Telas.md` §"Personalização dos dias visíveis" e `03-UX-UI/02-Responsividade-Mobile-First.md` §"Dias visíveis na Agenda";
- protótipo `docs/design-reference/claude-design/prototype/project/Mais-Negocio-Agenda-IA.dc.html`, blocos "Antecedência, intervalos e política de cancelamento" e "Como você vê a Agenda", só como referência de texto e de opções.

Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA S-06**, a parte que o Goal067 deixou: a política de cancelamento e remarcação;
- **QA S-08**: "Como você vê a agenda" ausente.

Fecha também as **observações 2 e 5 do [review067](../reviews/067-review.md)**:

- 2: a caixa de "Outras informações importantes" fica editável enquanto a leitura está pendente ou falhou, e o texto digitado antes da leitura é sobrescrito por ela;
- 5: `toggleDay` de `AvailabilitySettings` ignora o limite de **28** regras; só "Adicionar intervalo" o respeita.

A posição é a da v91, logo depois do 067 e antes do 068. O 067 não trouxe evidência para reordenar.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **A política não existe em camada nenhuma.** `CalendarSettings` do Scheduling (`apps/scheduling-service/prisma/schema.prisma`) tem só `timezone`, `minLeadMinutes`, `maxLeadDays` e `granularityMinutes`. Nenhuma rota, nenhum campo de contrato e nenhuma regra da IA falam de prazo para cancelar ou remarcar. O comportamento de hoje é o padrão do vault ("a qualquer momento", pergunta 100).
2. **O Scheduling já sabe quem pede.** `POST /internal/appointments/:id/cancel` e `/reschedule` (`apps/scheduling-service/src/modules/calendar/routes.ts`) gravam `source: callerSource(context.caller)`, que é `AI` quando o chamador é o `ai-orchestrator` e `USER` quando é o BFF (`shared/auth/internal-auth.ts`). A credencial do chamador é a prova da origem, e não o corpo.
3. **A escrita já roda numa transação com o estado relido.** `cancelAppointment` e `rescheduleAppointment` de `integrations/atendly/provider.ts` travam o dia com `lockCalendarDays` e relêem o atendimento dentro de `runCalendarWrite`. Cancelar um atendimento já cancelado devolve o estado atual, sem erro.
4. **Há dois chamadores `AI` de cancelamento, e só um é pedido da cliente.** As ferramentas `cancel_appointment` e `reschedule_appointment` de `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts` agem pela cliente. A limpeza do teste real, em `activation-test/ActivationTestCleanupService.ts` (`removeAppointment`), cancela o atendimento de teste com a mesma credencial e não pode ser barrada por prazo.
5. **O orquestrador ainda não lê as regras do negócio.** `GET /internal/availability-settings` do Scheduling é `internalOnly` e não exige chamador humano; só o `PATCH` exige. O cliente do Scheduling no orquestrador não tem chamada para essa leitura.
6. **A remarcação prepara um hold antes de perguntar.** `prepareReschedule` cria o hold do horário novo antes de devolver `requiresConfirmation`. Uma recusa por prazo que viesse depois do hold deixaria hold criado sem uso.
7. **A prova de efeito conta toda chamada `SUCCEEDED` com `action: "confirm"`.** `loadTurnConfirmedEffects` (`assistant/assistant.service.ts`, do Goal057 e D-073) lê `AiToolCall` com `status: "SUCCEEDED"` e marca `cancel` ou `reschedule` pelo nome da ferramenta. Uma recusa devolvida como resultado comum, e gravada como `SUCCEEDED`, contaria como cancelamento feito e deixaria a IA afirmar o que não gravou.
8. **As regras de oferta já passam por `PATCH /v1/settings/availability`.** O BFF valida `minLeadMinutes`, `maxLeadDays` e `granularityMinutes` como opcionais, e ausentes preservam o valor gravado. O corpo exige `rules`, e a tela do Goal067 reenvia a grade lida. `packages/public-api-contract/src/schemas.ts` e o cliente do Scheduling no BFF (`clients/scheduling/index.ts`) tipam os três campos na resposta, e a verificação de resposta do Goal036 reprova campo a mais.
9. **A Agenda sempre abre em "Dia".** `AgendaBoard.tsx` começa com `useState<AgendaView>("day")` em qualquer largura. O vault diz Semana no desktop e Dia no celular (perguntas 321 e 322). Não há dado de dias visíveis nem de visualização inicial em camada nenhuma.
10. **Preferência de negócio que não é regra de agenda mora no BFF.** `NotificationPreference` é linha por `tenantId`, com `onDelete: Cascade` a partir de `Tenant`. O MVP tem um único profissional por negócio (`00-Produto/01-Visao-do-Produto.md`), então preferência por negócio é preferência da pessoa.
11. **As observações 6 e 7 do review067 não pedem trabalho.** Nenhum caminho do produto grava regra inativa nova. E o BFF recusa `availability.timezone` diferente do fuso do negócio (`resolveAvailabilityTimezone` em `modules/settings/routes.ts`), então `business.timezone` e `availability.timezone` são o mesmo valor por construção.

## Escolhas de desenho desta passada

- **A política mora no Scheduling, que a aplica.** `CalendarSettings` ganha `customerChangeMinNoticeMinutes Int @default(0)`, por migration aditiva, com constraint SQL de **0** a **10080**. **0** é "sem restrição", o padrão do vault e o comportamento de hoje. Negócio existente fica com **0**, sem backfill. O mesmo prazo vale para cancelar e para remarcar (pergunta 99: uma regra global).
- **Leitura e gravação pelo caminho das regras de oferta.** `GET` e `PATCH /internal/availability-settings` e `GET /v1/settings` / `PATCH /v1/settings/availability` passam a devolver e a aceitar `customerChangeMinNoticeMinutes`, opcional no corpo, com o mesmo padrão dos outros três: ausente preserva o gravado. Nenhuma rota nova para a política.
- **A regra.** Um pedido está **fora do prazo** quando `startAt − agora < customerChangeMinNoticeMinutes`. Com prazo de 24 h, cancelar exatamente 24 h antes é permitido. Na remarcação, o prazo é medido contra o início **atual** do atendimento, e não contra o horário novo, que segue as regras de oferta de sempre.
- **O Scheduling aplica a regra a todo chamador `AI`, por padrão.** Dentro da transação de `cancelAppointment` e `rescheduleAppointment`, depois da releitura e depois do atalho de atendimento já cancelado, um chamador `AI` fora do prazo recebe erro de domínio `CUSTOMER_CHANGE_OUTSIDE_POLICY` (HTTP **409**), com o prazo em minutos nos detalhes, e nada é gravado. Chamador `USER` (o BFF, a Agenda) nunca é barrado. A replay por chave de idempotência continua devolvendo o efeito já gravado, mesmo que o prazo tenha passado desde então.
- **A única isenção é nomeada e fechada.** O corpo de `/cancel` aceita `policyExemption: "ACTIVATION_TEST_CLEANUP"`, e só esse valor. Só `ActivationTestCleanupService` o envia. Chamador `AI` que esquece a isenção é barrado, e não liberado: o erro é para o lado seguro. `/reschedule` não aceita isenção.
- **A IA confere o prazo ao preparar, e o Scheduling decide na escrita.** O cliente do Scheduling no orquestrador ganha a leitura de `GET /internal/availability-settings`. Em `prepare` de `cancel_appointment` e `reschedule_appointment`, fora do prazo, a ferramenta devolve recusa estruturada (`outsidePolicy: true` e o prazo em horas), **sem** gravar ação pendente e **sem** criar hold. Em `confirm`, o `CUSTOMER_CHANGE_OUTSIDE_POLICY` do Scheduling vira a mesma recusa, e a ação pendente é limpa.
- **Recusa nunca conta como efeito.** Uma chamada `confirm` recusada por prazo não entra em `loadTurnConfirmedEffects`. A IA não pode dizer que cancelou ou remarcou, e a guarda do Goal057 continua valendo sem exceção nova.
- **A IA explica e oferece o profissional.** `prompts/scheduling.ts` ganha a instrução do vault (perguntas 58 e 380): diante de `outsidePolicy`, explicar o prazo em uma frase curta e oferecer falar com o profissional; abrir o atendimento humano só se a cliente aceitar.
- **Configurações › Agenda mostra a política.** "Cancelar ou remarcar pelo WhatsApp", com as opções do protótipo: Sem restrição, Até 12 h antes, Até 24 h antes, Até 48 h antes, e o texto "Com restrição, fora do prazo a IA explica a regra e oferece falar com você. Pela Agenda, você sempre pode cancelar ou remarcar." Gravar usa o mesmo `PATCH /v1/settings/availability` do Goal067, reenviando a grade e as regras de oferta lidas. Valor gravado fora das opções aparece selecionado como opção extra, como o B1 do review067.
- **"Como você vê a Agenda" mora no BFF.** Modelo novo `AgendaViewPreference` (uma linha por `tenantId`, `onDelete: Cascade`), por migration aditiva, com `hiddenWeekdays Int[]` (0 = domingo … 6 = sábado, a convenção de `dayOfWeek` da disponibilidade) e `initialView` opcional (`DAY`, `WEEK`, `MONTH`). Rotas novas `GET` e `PATCH /v1/settings/agenda-view`, com o pré-handler de escrita autenticada das rotas vizinhas de settings. Sem linha, a leitura devolve `hiddenWeekdays: []` e `initialView: null`, sem gravar linha. O `PATCH` recusa dia repetido, dia fora de 0–6 e ocultar os sete dias.
- **Visualização inicial.** As opções são Automática, Dia, Semana e Mês. **Automática** é `initialView: null` e segue o vault: Semana a partir de **1024 px** de largura e Dia abaixo disso. Escolher Dia, Semana ou Mês vale em qualquer largura. O protótipo mostra só o valor "Dia"; a opção Automática existe para preservar o padrão por dispositivo do vault e é conferência humana do §8.
- **Dias visíveis.** Dias ocultos somem das colunas de Semana e Mês, e o espaço é redistribuído entre os visíveis. "Dia" não muda: a navegação por dia continua passando por todos os dias. A seção diz "Ocultar um dia só muda o que você vê. Para não atender em um dia, ajuste em Dias e horários.", com link para `/configuracoes/disponibilidade`.
- **A Agenda nunca depende da preferência para abrir.** Se a leitura de `/v1/settings/agenda-view` falhar, a Agenda abre em Automática com todos os dias, sem mensagem de erro. Em Configurações, a seção com leitura falhada mostra erro e não deixa salvar, como o B2 do review067.
- **Observação 2 do review067.** A caixa de "Outras informações importantes" fica somente leitura enquanto a leitura está pendente ou falhou. Nada que a pessoa digite é sobrescrito pela leitura.
- **Observação 5 do review067.** Ligar um dia em `AvailabilitySettings` respeita o limite de **28** regras, como "Adicionar intervalo": no limite, a tela recusa com texto de produto e não envia.

## Fora do escopo

- Prazo diferente por serviço, por cliente ou para cancelar e remarcar separadamente. O vault fixa uma regra global.
- Mudar a disponibilidade, as regras de oferta, o motor de disponibilidade, lembretes, o fluxo de confirmação de presença ou a limpeza do teste real além da isenção.
- Mudar o que a Agenda manual faz ao cancelar ou remarcar (`CancelFlow.tsx`, `RescheduleFlow.tsx`).
- Estrutura e fidelidade visual da Agenda (faixa da semana, "+ Novo" com três tipos, bloco da Semana, QA AG-01…AG-12): Goal069. Este Goal só muda qual visualização abre e quais colunas aparecem.
- Contar à cliente o prazo antes de ela pedir, ou pôr a política no contexto de negócio da IA.
- As observações 1, 3, 4, 6 e 7 do review067: as três primeiras são registro, e as duas últimas não pedem trabalho (evidência 11).
- As observações 1 e 2 do review066 e a 3 do review065: Goal072. Fidelidade visual: Goals 068, 069 e 072.
- Editar o Product Vault ou o `QA_LOCAL_REVIEW.md`.
- As observações abertas dos reviews 059 a 066, 070 e 071 listadas em [MIGRATION_STATUS](../MIGRATION_STATUS.md). Se `goal025-account-purge`, `goal008-agenda` ou o `net::ERR_NO_BUFFER_SPACE` do gate autenticado aparecerem em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa.

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas de QA S-06 e S-08 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e as observações do [review067](../reviews/067-review.md);
- no vault, só os trechos listados em "Objetivo e posição";
- no protótipo, só os dois blocos de `Mais-Negocio-Agenda-IA.dc.html` citados;
- `apps/scheduling-service/prisma/schema.prisma` (`CalendarSettings`), `src/modules/internal-api/routes.ts` (`/internal/availability-settings`, `offerRulesDto`, `assertOfferRules`), `src/modules/calendar/routes.ts` (`cancelBodySchema`, `rescheduleBodySchema`), `src/modules/integrations/atendly/provider.ts` (`cancelAppointment`, `rescheduleAppointment`), `src/modules/calendar/calendar-service.ts` e `src/shared/auth/internal-auth.ts`;
- `apps/ai-orchestrator/src/modules/scheduling-service/client.ts`, `modules/tools/assistant-tools.ts` (prepare e confirm de cancelar e remarcar), `modules/activation-test/ActivationTestCleanupService.ts`, `modules/assistant/assistant.service.ts` (`loadTurnConfirmedEffects`) e `modules/prompts/scheduling.ts`;
- `apps/bff/prisma/schema.prisma` (`NotificationPreference`, como modelo), `src/modules/settings/routes.ts`, `src/clients/scheduling/index.ts` e `PUBLIC_API_V1.md`, nas seções de settings;
- `packages/public-api-contract/src/schemas.ts` e `src/routes.ts`;
- `apps/frontend/src/features/settings/CalendarSettings.tsx`, `AvailabilitySettings.tsx`, `features/knowledge/OtherInfoSection.tsx`, `features/agenda/AgendaBoard.tsx`, `WeekView.tsx`, `MonthView.tsx` e `src/data/services/BffSettingsService.ts`;
- os testes que montam essas telas e rotas, e os `goal067-*` como modelo.

## Pontos de implementação

- `apps/scheduling-service/`: `prisma/schema.prisma`, uma migration nova `*_goal073_customer_change_policy`, `modules/internal-api/routes.ts`, `modules/calendar/routes.ts`, `modules/integrations/atendly/provider.ts` e o que a escrita precisar em `modules/calendar/`.
- `apps/ai-orchestrator/`: `modules/scheduling-service/client.ts`, `modules/tools/assistant-tools.ts`, `modules/activation-test/ActivationTestCleanupService.ts`, `modules/assistant/assistant.service.ts` (só se a recusa exigir) e `modules/prompts/scheduling.ts`.
- `apps/bff/`: `prisma/schema.prisma`, uma migration nova `*_goal073_agenda_view_preference`, `modules/settings/routes.ts`, `clients/scheduling/index.ts` e `PUBLIC_API_V1.md`.
- `packages/public-api-contract/src/schemas.ts` e `src/routes.ts`: o campo novo de `availability` e as duas rotas novas. Aqui o pacote é escopo declarado, e não desvio.
- `apps/frontend/`: `features/settings/`, `features/knowledge/OtherInfoSection.tsx`, `features/agenda/` (`AgendaBoard.tsx`, `WeekView.tsx`, `MonthView.tsx`), `src/data/` e a seção de Configurações e de Agenda em `shared/styles/`.
- Testes novos com prefixo `goal073-` em cada app tocado.

## Escopo obrigatório

### 1. Política no Scheduling

- Campo, migration e constraint conforme "Escolhas de desenho". A migration é aditiva e não reescreve linha existente.
- `GET` e `PATCH /internal/availability-settings` devolvem e aceitam o campo; o `PATCH` continua só humano (`requireHumanCaller`).
- Regra aplicada dentro da transação de cancelar e remarcar, só para chamador `AI`, com `CUSTOMER_CHANGE_OUTSIDE_POLICY` (409) e nada gravado.
- `policyExemption: "ACTIVATION_TEST_CLEANUP"` aceito só em `/cancel`; qualquer outro valor é recusado pela validação do corpo.

### 2. Política na IA

- Leitura de `GET /internal/availability-settings` no cliente do Scheduling do orquestrador, no padrão das chamadas vizinhas.
- `prepare` de cancelar e remarcar confere o prazo antes de gravar ação pendente e, na remarcação, antes do hold.
- `confirm` traduz `CUSTOMER_CHANGE_OUTSIDE_POLICY` na mesma recusa e limpa a ação pendente.
- A recusa não entra em `loadTurnConfirmedEffects`.
- `ActivationTestCleanupService` envia a isenção; nenhum outro arquivo de `apps/ai-orchestrator/src` a envia.
- Instrução nova em `prompts/scheduling.ts`, conforme "Escolhas de desenho".

### 3. BFF e contrato

- `GET /v1/settings` e `PATCH /v1/settings/availability` passam o campo novo, com validação 0..10080, opcional no corpo.
- `AgendaViewPreference`, a migration e `GET`/`PATCH /v1/settings/agenda-view`, conforme "Escolhas de desenho". Sem sessão, `401`. Escrita só no tenant da sessão.
- `packages/public-api-contract` com o campo e as duas rotas, para `public_api_route_coverage` e a verificação de resposta.
- `PUBLIC_API_V1.md` documenta, por acréscimo, o campo, a regra, o erro visto pela IA e as duas rotas.
- A contagem de `this.http.` em `apps/bff/src/clients/` fica em **43**: o BFF não ganha chamada nova a outro serviço.

### 4. Configurações (frontend)

- "Cancelar ou remarcar pelo WhatsApp" em Configurações › Agenda, conforme "Escolhas de desenho", gravado sem mexer na grade nem nas regras de oferta.
- Seção "Como você vê a Agenda" com dias visíveis, visualização inicial, o aviso e o link para Disponibilidade; leitura falhada bloqueia salvar.
- Observações 2 e 5 do review067, conforme "Escolhas de desenho".

### 5. Agenda (frontend)

- A Agenda abre na visualização gravada, ou em Automática (Semana a partir de 1024 px, Dia abaixo).
- Semana e Mês não mostram os dias ocultos e redistribuem o espaço. Dia não muda.
- Leitura falhada da preferência abre a Agenda em Automática, com todos os dias e sem erro.

### 6. O gate renderizado mede as telas tocadas

- `/agenda` e `/configuracoes/agenda` já estão em `AUTHENTICATED_ROUTES` e continuam medidas nas cinco larguras. Nenhuma rota entra ou sai.
- A partir de 1024 px, `/agenda` passa a abrir em Semana. Se uma medida do gate reprovar nessa largura, o Developer corrige a tela dentro do escopo do §5, sem desligar medida e sem mudar a conta do ensaio.
- Os estados de erro e as combinações de dias ocultos ficam no jsdom. O relatório diz isso.

### 7. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `a1adf4b`.

1. **Scheduling (integração, PostgreSQL):** linha existente fica com **0** depois da migration; com prazo de 24 h, chamador `AI` recebe `CUSTOMER_CHANGE_OUTSIDE_POLICY` a 23 h do início, ao cancelar e ao remarcar, e o atendimento fica intacto; a exatamente 24 h e a 25 h, passa; chamador `USER` passa a 1 h do início; `/cancel` com a isenção passa a 1 h; replay por chave de idempotência de um cancelamento já gravado devolve o efeito; `GET`/`PATCH /internal/availability-settings` devolvem e gravam o campo, e o `PATCH` sem o campo preserva o gravado.
2. **Orquestrador:**
   - `prepare` de cancelar fora do prazo devolve `outsidePolicy` e não grava ação pendente;
   - `prepare` de remarcar fora do prazo não cria hold;
   - `confirm` com `CUSTOMER_CHANGE_OUTSIDE_POLICY` do Scheduling devolve a recusa e limpa a pendência;
   - uma chamada `confirm` recusada não põe `cancel` nem `reschedule` em `loadTurnConfirmedEffects`;
   - a limpeza do teste real envia a isenção, e nenhum outro arquivo de `src/` a envia;
   - o texto de `buildSchedulingPrompt` contém a instrução nova.
3. **BFF (integração):** `PATCH /v1/settings/availability` grava e `GET /v1/settings` devolve o prazo; `GET /v1/settings/agenda-view` sem linha devolve o padrão sem gravar; `PATCH` grava, recusa os sete dias ocultos, dia repetido e dia fora de 0–6, e não toca outro tenant; sem sessão, `401`.
4. **Frontend (jsdom):**
   - Configurações › Agenda mostra a política com o valor lido selecionado, inclusive **0** e um valor fora das opções; gravar envia o prazo com as `rules` e as regras de oferta lidas sem mudança;
   - "Como você vê a Agenda" mostra e grava dias visíveis e visualização inicial; com leitura falhada, salvar fica desabilitado;
   - a Agenda abre em Semana com largura de 1024 px e em Dia com 390 px quando a preferência é Automática; abre na visualização gravada quando há uma; Semana e Mês não mostram o dia oculto; leitura falhada abre em Automática sem erro;
   - a caixa de "Outras informações importantes" não aceita digitação durante a leitura pendente nem depois de leitura falhada;
   - ligar um dia com 28 regras recusa e não envia.
5. **Gate renderizado:** `/agenda` e `/configuracoes/agenda` passam nas cinco larguras dentro de `validate:integration`, com **0** retentativas.

Os testes existentes continuam passando. Só muda asserção que dependa da visualização inicial da Agenda ou das telas tocadas. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual.

### 8. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. O Scheduling deixa de conferir o prazo: o teste de cancelar a 23 h reprova.
2. O Scheduling passa a barrar também chamador `USER`: o teste da Agenda a 1 h reprova.
3. A comparação vira `<=` no lugar de `<`: o teste de exatamente 24 h reprova.
4. A isenção passa a ser aceita em `/reschedule`, ou deixa de ser enviada pela limpeza: o teste correspondente reprova.
5. `prepareReschedule` cria o hold antes de conferir o prazo: o teste sem hold reprova.
6. A recusa passa a contar em `loadTurnConfirmedEffects`: o teste de efeito reprova.
7. A Agenda volta a abrir sempre em Dia: o teste de 1024 px reprova.
8. Semana volta a mostrar o dia oculto: o teste de dias visíveis reprova.

### 9. O que só uma pessoa confere

- Que Configurações › Agenda e a Agenda, percorridas num aparelho real, batem com o protótipo `Mais-Negocio-Agenda-IA` nas opções e nos textos, e se a opção Automática deve existir.
- Que a IA, numa conversa real, explica o prazo e oferece falar com o profissional, sem dizer que cancelou.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 10. Documentação

No mesmo diff, por **acréscimo**:

- [DECISIONS](../DECISIONS.md) ganha **D-086** em `PROPOSED`, no formato de D-080 a D-085. Ela diz:
  - onde a política mora, a regra e o limite exato;
  - que o Scheduling a aplica a todo chamador `AI`, com a única isenção nomeada;
  - que a IA confere ao preparar e que a recusa nunca conta como efeito;
  - onde mora "Como você vê a Agenda", o padrão Automática e o limite de 1024 px;
  - as observações 2 e 5 do review067.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§47**, sem reescrever §4 a §46. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, as duas migrations, as telas medidas pelo gate, a conferência humana pendente e as contagens da execução final de cada suíte tocada (arquivos e testes), de `test:gate`, de `validate:ui` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- [DATA_MIGRATION](../DATA_MIGRATION.md), só se listar migrations por serviço.
- `apps/bff/PUBLIC_API_V1.md`, conforme §3.
- `apps/frontend/AGENTS.md`, só se descrever a Agenda ou Configurações › Agenda.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e o Product Vault não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

**Ordem obrigatória, a mesma dos Goals065 a 067:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`. `test:gate` precisa do client Prisma que `validate:core` gera.
4. Rode os oito controles do §8.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.

### 11. O que este Goal não pode fazer

- Não toca `apps/evolution-go/`, `tools/ia-loop/`, `scripts/`, `docs/product-vault/` nem `QA_LOCAL_REVIEW.md`. Em `packages/`, só `public-api-contract/src/schemas.ts` e `src/routes.ts`.
- Duas migrations, as duas aditivas: uma no Scheduling e uma no BFF. Nenhuma outra.
- Não muda a forma de `PATCH /v1/settings/availability` além do campo opcional novo, nem `POST /internal/appointments/:id/reschedule` além da regra, nem as rotas de cancelar e remarcar da Agenda manual.
- Não muda o motor de disponibilidade, as regras de oferta, os lembretes, a ativação da IA nem a guarda de afirmação do Goal057, a não ser para garantir que a recusa não conta como efeito.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. O prazo é gravado no Scheduling com padrão **0** para negócio existente e é aplicado a chamador `AI` dentro da transação de cancelar e remarcar, com fronteira exata, sem barrar a Agenda e sem barrar a limpeza do teste real. Provado por execução de integração do §7.1.
2. A IA recusa fora do prazo já no `prepare`, sem pendência e sem hold, traduz a recusa do Scheduling no `confirm` e nunca conta a recusa como efeito. Provado por execução do §7.2.
3. `GET /v1/settings`, `PATCH /v1/settings/availability` e `GET`/`PATCH /v1/settings/agenda-view` se comportam conforme §3, com isolamento por tenant e contrato atualizado. Provado por execução de integração do §7.3 e por `public_api_route_coverage`.
4. Configurações › Agenda mostra e grava a política e "Como você vê a Agenda" sem perder a grade nem as regras de oferta; leitura falhada bloqueia salvar. Provado por execução jsdom do §7.4.
5. A Agenda abre na visualização gravada ou em Automática, esconde os dias ocultos em Semana e Mês e abre mesmo com a leitura falhada. Provado por execução jsdom do §7.4.
6. As observações 2 e 5 do review067 estão corrigidas. Provado por execução jsdom do §7.4.
7. Largura, toque, contraste, foco e movimento de `/agenda` e `/configuracoes/agenda` são decididos pelo gate autenticado dentro de `validate:integration`, nas cinco larguras, com **0** retentativas. Estados de erro e combinações de dias ocultos não são medidos pelo gate renderizado.
8. Os oito controles negativos do §8 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
9. Typecheck de `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:scheduling-service` **35**/**484**; `test:ai-orchestrator` **1117** passando; `test:frontend` **94**/**979**; integração do BFF **55**/**434**; integração do Scheduling **16**/**124**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **155** testes e **0** retentativas. Provado por execução.
10. D-086 em `PROPOSED`, FINAL_AUDIT §47, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a IA explica o prazo com as palavras certas numa conversa real (conferência humana; o teste prova a recusa e a instrução, não a frase gerada);
- que as telas batem com o protótipo aprovado, nem se a opção Automática deve ficar;
- a estrutura e a fidelidade visual da Agenda (Goal069).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Política no Scheduling: campo, migration, leitura e gravação, regra na transação, isenção e testes de integração (§1, §7.1) |
| WU-02 | STANDARD | WU-01 | Política na IA: leitura, recusa no `prepare` e no `confirm`, efeito, isenção da limpeza, instrução e testes (§2, §7.2) |
| WU-03 | STANDARD | WU-01 | BFF e contrato: campo passado, `AgendaViewPreference`, migration, rotas, `PUBLIC_API_V1.md` e testes de integração (§3, §7.3) |
| WU-04 | STANDARD | WU-03 | Configurações: política, "Como você vê a Agenda", observações 2 e 5 do review067 e testes jsdom (§4, §7.4) |
| WU-05 | STANDARD | WU-04 | Agenda: visualização inicial, dias ocultos em Semana e Mês e testes jsdom (§5, §7.4) |
| WU-06…WU-12 | DETERMINISTIC | WU-02, WU-05 | typecheck dos quatro apps, lint de `apps/frontend`, testes dirigidos `goal073` do orquestrador e do frontend |
| WU-13 | DETERMINISTIC | WU-06…WU-12 | validate-core |
| WU-14…WU-16 | DETERMINISTIC | WU-13 | gate-tests, validate-ui e validate-integration |
| WU-17 | STANDARD | WU-14, WU-15, WU-16 | Controles negativos (§8) e documentação (§10), depois da execução final |
| WU-18 | DETERMINISTIC | WU-17 | git-diff-check final |

O gate autenticado e as integrações do BFF e do Scheduling rodam dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
