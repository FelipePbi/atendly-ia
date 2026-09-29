# Goal 074 — A Home conforme o protótipo

**Status: READY.** Preparado em 2026-09-29 pelo Tech Lead Agent após [Goal068 ACCEPTED](../reviews/068-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v93, dividida do 068, com o mesmo ID e o mesmo título. A v94 precisa o escopo com evidência conferida no código da baseline: o número "conversas que você assumiu" não tem registro durável em camada nenhuma, e este Goal cria esse registro (ver "O que a evidência desta passada mostra", item 4). Entra também a observação 3 do [review068](../reviews/068-review.md).

## Baseline aceita

Baseline aceita: `7d62f4f9eb2415c6dc7ccdefb2f2aa4a8c024692`

Goal anterior: 068 — Fidelidade visual: marca e autenticação

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal068 já integrado em `main` (origem `6bc0d2e1261c58dff2af3097ad9efbc1c4d8ba63`). O commit documental `bb2c658`, posterior, só vira o status do documento do Goal068 para `ACCEPTED` e não muda código. **Cinco rodadas**, com 4, 3, 3, 3 e 0 blockers. **D-087** foi aceita e [FINAL_AUDIT §48](../FINAL_AUDIT.md) escrita sem reescrever §4 a §47. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review068](../reviews/068-review.md), rodada 5, e do [review073](../reviews/073-review.md), rodada 4, para os serviços que o 068 não tocou: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **99** arquivos e **1033** testes; `test:ai-orchestrator` **86**/**98** arquivos (**12** pulados) e **1127**/**1215** testes (**88** pulados); `test:scheduling-service` **35** arquivos e **484** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos; integração do BFF **56** arquivos e **439** testes; integração do Scheduling **17** arquivos e **140** testes; gate autenticado com **155** `expected`, **0** `unexpected`, **0** `flaky` e **0** retentativas.

## Objetivo e posição

Fazer a Home (`/inicio`) bater com os protótipos `Home.dc.html`, `Home-Tablet.dc.html` e `Home-Desktop.dc.html` (`docs/design-reference/claude-design/prototype/project/`), consultados só no estado necessário:

1. **Uma faixa de estado só**, no topo, que muda de tom conforme o estado da IA e do WhatsApp (H-01).
2. **A ordem do protótipo**: faixa de estado → "Precisa da sua atenção" (só quando há pendência) → "Hoje" → "Esta semana", sem cards dentro de cards (H-06). O checklist de ativação do Goal063 fica, no lugar do estado H4 do protótipo.
3. **"Esta semana" com três números reais**: agendamentos, marcados pela IA e conversas que você assumiu. Hoje nenhum deles existe em camada nenhuma.
4. **O sino no topo** da Home, com ponto quando há notificação não lida, levando à central (H-07). A gaveta é NT-01, do Goal069.
5. **Nenhuma copy técnica** (H-08) **e nenhuma data crua** (H-10).

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **H-01**, **H-06**, **H-07**, **H-08** e **H-10**. H-02 (Goal059), H-03 e H-04 (Goal063), H-05 (Goal064) e H-09 (Goal057) já estão fechados e não podem regredir. Entram também a observação 1 do [review073](../reviews/073-review.md) (`PUBLIC_API_V1.md` não nomeia `CUSTOMER_CHANGE_OUTSIDE_POLICY`) e a observação 3 do [review068](../reviews/068-review.md) (título defasado de um teste).

O vault só diz que a Home do celular tem "status IA/WhatsApp; pendências; próximos atendimentos; poucas métricas secundárias" e que o desktop "pode adicionar mais contexto e métricas simples" (`docs/product-vault/03-UX-UI/04-Especificacao-das-Telas.md`, §"Início"). O protótipo não contradiz isso. O vault não define os três números da semana; as definições estão nas escolhas de desenho abaixo e viram **D-088**.

## O que a evidência desta passada mostra

Conferido no código da baseline `7d62f4f`:

1. **A Home tem seções que o protótipo não tem.** `apps/frontend/src/features/dashboard/DashboardScreen.tsx` renderiza "Agenda de hoje" (linha 498), "Próximo atendimento" (567), "O que a Atendly fez hoje" com receita estimada (594 e 627), "Precisam de atenção" (639) e "Ações rápidas" (702), cada uma num `card`. O estado vem em duas peças: `StatusStrip` ("Status honesto", linhas 246-279, com duas pílulas) e os alertas empilhados acima dela (H-01, H-06).
2. **A copy técnica continua na tela.** "Agenda Atendly · fonte oficial" (linha 376), "Confirmados somente após persistência na fonte oficial" (608), "A fonte oficial permanece ativa, mas a consulta está indisponível." (455) e "O que a Atendly fez hoje" (594), que deveria falar da IA (H-08).
3. **A data do próximo atendimento é crua.** `DashboardScreen.tsx:587` mostra `nextAppointment.date` no formato ISO (H-10).
4. **"Conversas que você assumiu" não tem registro durável.** Toda tomada de controle humano passa por `SessionService.assumeHumanControl` (`apps/ai-orchestrator/src/modules/session/SessionService.ts:261`), chamado por mensagem manual no WhatsApp (`message-graph.ts:603`, fonte `WHATSAPP`), por envio pelo painel (`internal/routes.ts:711`) e pelo botão de assumir (`internal/routes.ts:831`, fonte `ATENDLY`). Ele só grava `humanHandling`, `humanHandlingSince` e `humanHandlingSource` na sessão, e `releaseToAi` (`SessionService.ts:482-500`) zera os três. Uma nova tomada sobrescreve `humanHandlingSince`. O `Handoff` com `reason: "OWNER_TAKEOVER"` só nasce no botão de assumir, não na mensagem pelo WhatsApp. Não há, portanto, como contar tomadas da semana a partir do que existe.
5. **Os outros dois números têm fonte, mas não janela de semana.** O orquestrador conta confirmações da IA de hoje em `/internal/dashboard` (`internal/routes.ts:1158-1224`): `create_appointment` com `action: "confirm"` e `confirm_recurring_appointments` pelo número de ocorrências confirmadas, com `completedAt` desde o início do dia no fuso do negócio (`startOfTodayInTimeZone`, `src/lib/dates.ts:31`). O Scheduling conta agendamentos de hoje em `/internal/dashboard` (`apps/scheduling-service/src/modules/internal-api/routes.ts:1821-1850`): não cancelados, com `date` igual a hoje no fuso do calendário, sobre uma leitura de hoje a hoje + 30 dias, que não alcança os dias da semana anteriores a hoje.
6. **O contrato só tem hoje.** `dashboardSchema` (`packages/public-api-contract/src/schemas.ts:856-878`) tem `aiAppointmentsToday`, `automatedConversationsToday` e `appointmentsToday`. Os clientes do BFF validam a resposta interna com schemas próprios (`apps/bff/src/clients/ai-orchestrator/index.ts:549-550` e `apps/bff/src/clients/scheduling/index.ts:1517`), então um campo novo que não entre neles é descartado antes de chegar à rota.
7. **A Agenda começa a semana na segunda.** `startOfWeek` em `apps/frontend/src/features/agenda/occupancy.ts:78-84`.
8. **O sino não existe.** A casca mostra a contagem de não lidas só no item "Notificações" da sidebar e do "Mais" (`AppShell.tsx:209` e `375`), a partir de `status.notificationsSummary.unreadCount`. No cabeçalho do celular aparece o selo "Atenção" ou o nome do negócio (`AppShell.tsx:273-288`).
9. **O gate autenticado reconhece a Home pela classe do invólucro.** `apps/frontend/e2e/routes.ts:42` usa `contentMarker: ".dashboard-page"`.
10. **A hora da pausa não existe no status.** O protótipo H5 diz "IA pausada · desde 09:12". `systemStatusSchema` (`schemas.ts:962-978`) não tem instante de pausa.

## Escolhas de desenho desta passada

- **A semana vai de segunda 00:00 a domingo 23:59, no fuso do negócio**, como a Agenda. Cada serviço usa para a semana o mesmo fuso que já usa para hoje: o Scheduling, o do calendário; o orquestrador, o do contexto do negócio. Este Goal não unifica essas duas fontes.
- **"Agendamentos" é a contagem de agendamentos da semana**: não cancelados e com `date` de segunda a domingo da semana corrente, incluindo os dias que já passaram. É o mesmo filtro de `appointmentsToday`, aplicado à semana.
- **"Marcados pela IA" é a contagem de confirmações da IA desde segunda 00:00**, pela **mesma regra** de `aiAppointmentsToday`. A regra fica numa função só, usada pelas duas janelas, para que as duas não possam divergir. `prepare`, hold vencido, remarcação e cancelamento continuam sem contar (H-09).
- **"Conversas que você assumiu" é a contagem de conversas distintas com tomada de controle humano desde segunda 00:00.** O orquestrador passa a gravar essa tomada numa tabela nova, só por acréscimo:
  - uma linha por passagem de "IA atende" para "humano atende", gravada **na mesma transação** de `assumeHumanControl`, só quando a sessão ainda não estava em atendimento humano;
  - fontes `WHATSAPP` e `ATENDLY`; `BACKFILL` não grava;
  - a linha guarda `tenantId`, a sessão, a conversa, a fonte, o autor quando houver e o instante, e nunca conteúdo de mensagem;
  - a linha some junto com a sessão ou a conversa (chave estrangeira com `onDelete: Cascade`, como `ConversationSession`), então exclusão de conta, limpeza do teste real e expiração não deixam resíduo;
  - duas tomadas concorrentes na mesma sessão podem gravar duas linhas, e a contagem por conversa distinta absorve isso.
- **Não há reconstrução do passado.** Tomadas anteriores à migration não existem em registro nenhum, então o número começa a contar a partir dela. É limite declarado em D-088.
- **Os três números são aditivos no contrato.** `ai.data` ganha `aiAppointmentsThisWeek` e `conversationsTakenOverThisWeek`; `scheduling.data` ganha `appointmentsThisWeek`. Nenhum campo existente muda ou sai. `nextAppointment` e `estimatedRevenueToday` continuam no contrato, mesmo sem uso na Home.
- **Dependência indisponível mostra "—", nunca 0.** Se `ai` ou `scheduling` vier com `status: "error"`, os números daquela fonte aparecem como "—".
- **A faixa de estado usa só dado que existe.** Estados: IA ativa ("Atendendo pelo WhatsApp · N conversas hoje", com `automatedConversationsToday`); WhatsApp desconectado, que vira ela mesma o alerta crítico com a ação de reconectar; IA inativa com o checklist do Goal063; IA pausada, **sem a hora da pausa**, porque o dado não existe (divergência declarada); e IA ou agenda indisponível, em tom de atenção. Nenhum estado aparece em duas peças ao mesmo tempo.
- **"Hoje" é uma lista**, com o marcador "agora" no atendimento em curso ou no próximo do dia. Compromissos pessoais (bloqueios) não entram, porque o dashboard não os traz; é divergência declarada. Sem atendimento, "Nenhum atendimento hoje." com a ação de criar agendamento.
- **O sino fica no cabeçalho da Home**, em todas as larguras. É um link para `/notificacoes` com nome acessível "Notificações", ou "Notificações, N não lidas" quando houver, e o ponto só aparece com `unreadCount` maior que zero. O item "Notificações" da sidebar e do "Mais" continua, até o Goal069 trocar a central por gaveta.

## Fora do escopo

- A gaveta de notificações (NT-01) e as telas de Agenda, Clientes, Serviços, Conversas e Notificações: Goal069. O onboarding fiel ao protótipo: Goal072.
- Novas fontes de pendência em "Precisa da sua atenção": a seção usa o que o dashboard já traz.
- Hora da pausa da IA e bloqueios pessoais em "Hoje", que pedem dado novo.
- Mudança na regra de confirmação da IA (Goal057), na ativação por teste real (Goal063) e no status real do WhatsApp (Goal059).
- `apps/evolution-go/`, `scripts/`, `tools/ia-loop/` e qualquer configuração de teste.

## Dependências e contexto mínimo

- Goal068 ACCEPTED (baseline acima). O Goal057 fixou a regra de confirmação que os números reusam, o Goal059 o status real do WhatsApp, o Goal063 o checklist e a ativação, e o Goal064 a saudação pelo nome da pessoa.
- Arquivos de partida:
  - orquestrador: `prisma/schema.prisma`, `prisma/migrations/`, `src/modules/session/SessionService.ts`, `src/modules/internal/routes.ts` (`/internal/dashboard`) e `src/lib/dates.ts`;
  - Scheduling: `src/modules/internal-api/routes.ts` (`/internal/dashboard`);
  - contrato e BFF: `packages/public-api-contract/src/schemas.ts`, `apps/bff/src/clients/ai-orchestrator/index.ts`, `apps/bff/src/clients/scheduling/index.ts`, `apps/bff/src/modules/dashboard/routes.ts` e `apps/bff/PUBLIC_API_V1.md`;
  - frontend: `features/dashboard/DashboardScreen.tsx`, `shared/styles/atendly.css` e os testes existentes da Home (`goal018-dashboard-status`, `goal059-whatsapp-status-view`, `goal063-home-checklist`, `goal064-greeting-and-account` e outros que montem `/inicio`).
- Testes de partida: `apps/ai-orchestrator/tests/internal/dashboard-ai-appointments.routes.test.ts` (padrão de teste da contagem) e `apps/ai-orchestrator/tests/integration/human-control-graph.test.ts` e `session-durability.test.ts` (padrão de teste com banco).

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Registro de tomada e números da IA | `apps/ai-orchestrator/prisma/`, `src/modules/session/SessionService.ts`, `src/modules/internal/routes.ts`, `src/lib/dates.ts` |
| Agendamentos da semana | `apps/scheduling-service/src/modules/internal-api/routes.ts` |
| Contrato e BFF | `packages/public-api-contract/src/schemas.ts`, `apps/bff/src/clients/`, `apps/bff/src/modules/dashboard/`, `apps/bff/PUBLIC_API_V1.md` |
| Home e sino | `apps/frontend/src/features/dashboard/`, `shared/styles/atendly.css` |
| Testes | arquivos com `goal074` no nome, em cada serviço tocado |

## Escopo obrigatório

### 1. Registro de tomada de controle humano (orquestrador)

- Uma migration aditiva cria a tabela do registro, com índice por `tenantId` e instante. Nenhuma coluna existente muda.
- `assumeHumanControl` grava a linha dentro da transação que já existe, só na passagem de "IA atende" para "humano atende" e só para `WHATSAPP` e `ATENDLY`, conforme as escolhas de desenho.
- `releaseToAi` não apaga linha. Assumir, devolver e assumir de novo grava duas linhas.

### 2. Números da semana (orquestrador e Scheduling)

- Orquestrador, `/internal/dashboard`: acrescenta `aiAppointmentsThisWeek` e `conversationsTakenOverThisWeek`. O início da semana no fuso do negócio sai de uma função nova em `src/lib/dates.ts`, com a mesma convergência de `startOfTodayInTimeZone`. A contagem de confirmações é uma função só, aplicada às duas janelas. `aiAppointmentsToday` não muda de valor.
- Scheduling, `/internal/dashboard`: acrescenta `appointmentsThisWeek`, com leitura que cubra a semana inteira, inclusive os dias anteriores a hoje. `appointmentsToday`, `todayAppointments` e `nextAppointment` não mudam de valor.

### 3. Contrato e BFF

- `dashboardSchema` ganha os três campos, como inteiros não negativos, nos objetos da sua fonte.
- Os schemas dos clientes do BFF aceitam os campos novos, e `GET /v1/dashboard` os devolve sem transformação.
- `PUBLIC_API_V1.md`, por acréscimo: os três campos, com a definição de cada um e da semana; e o erro `CUSTOMER_CHANGE_OUTSIDE_POLICY` do Goal073, dizendo que ele é visto pela IA nas ferramentas de cancelar e remarcar e não é resposta de rota pública (observação 1 do review073).

### 4. A Home

- Ordem e composição conforme o protótipo: faixa de estado única → "Precisa da sua atenção" → "Hoje" → "Esta semana". No desktop, "Hoje" na coluna principal e pendências e semana na lateral, como `Home-Desktop.dc.html`. Nenhum card dentro de card (H-06).
- Uma faixa de estado só, com os estados das escolhas de desenho. `StatusStrip` ("Status honesto") e os alertas empilhados saem (H-01). Nenhum estado se contradiz na mesma tela (H-02 continua fechado).
- Saem "Próximo atendimento", "O que a Atendly fez hoje", a receita estimada e "Ações rápidas". O checklist de ativação do Goal063 fica, sem itens em card, e continua levando a cada módulo (H-03 e H-04 continuam fechados).
- Nenhuma destas copies aparece em `/inicio`: "fonte oficial", "persistência", "O que a Atendly fez hoje", "Status honesto" (H-08).
- Nenhuma data ISO aparece em `/inicio`. Toda data mostrada é formatada em português no fuso do negócio (H-10).
- "Esta semana" mostra os três números, com os rótulos do protótipo: "agendamentos", "marcados pela IA" e "conversas que você assumiu". Dependência indisponível mostra "—".
- O sino, conforme as escolhas de desenho (H-07).
- A saudação pelo nome da pessoa (Goal064) e o invólucro `.dashboard-page` ficam.

### 5. Observação 3 do review068

- O título do teste em `apps/frontend/tests/goal068-assinatura.test.tsx:258` deixa de dizer "a sidebar consome a sessão primeiro" e passa a descrever o que a asserção prova: só a sidebar tem `signature="check"`, qualquer que seja a ordem do JSX. A asserção não muda.

### 6. O gate renderizado mede a Home

- `/inicio` continua medida pelo gate autenticado dentro de `validate:integration`, nas cinco larguras. As rotas públicas continuam medidas por `validate:ui`. Nenhuma rota entra ou sai.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela dentro do §4, sem desligar medida. O sino é alvo de toque e precisa de pelo menos 24 px.

### 7. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `7d62f4f`:

1. Orquestrador, sem banco, no padrão de `dashboard-ai-appointments.routes.test.ts`, com relógio fixo e fuso `America/Sao_Paulo`: `aiAppointmentsThisWeek` conta `confirm` de segunda 00:00 em diante, conta a série recorrente pelo número de ocorrências, não conta `prepare` nem confirmação do domingo anterior; `aiAppointmentsToday` continua igual.
2. Orquestrador, com banco: `assumeHumanControl` sobre sessão fora de atendimento humano grava uma linha; uma segunda chamada com a sessão já em atendimento humano não grava; devolver e assumir de novo grava outra; `BACKFILL` não grava; `conversationsTakenOverThisWeek` conta conversas distintas desde segunda e não conta a semana anterior; apagar a conversa apaga as linhas.
3. Scheduling: `appointmentsThisWeek` conta agendamentos não cancelados de segunda a domingo, inclusive dia anterior a hoje, e não conta o domingo anterior nem a segunda seguinte.
4. BFF: `GET /v1/dashboard` devolve os três campos, e a resposta passa em `dashboardSchema`.
5. Frontend, jsdom, em `apps/frontend/tests/goal074-*.test.tsx`:
   - as seções aparecem na ordem do §4, e só existe uma faixa de estado;
   - nenhuma copy proibida do §4 e nenhuma data no formato `AAAA-MM-DD` aparecem;
   - "Esta semana" mostra os três números do dashboard, e "—" quando a fonte vem com erro;
   - o sino é um link para `/notificacoes`, com o nome acessível do §"Escolhas de desenho", e o ponto só aparece com não lidas;
   - o invólucro `.dashboard-page` existe.

Os testes existentes continuam passando. Só muda asserção que dependa de seção, texto ou composição trocados aqui. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual. Asserção que prova H-02, H-03, H-04, H-05 ou H-09 não pode ser apagada; pode mudar de seletor, se a seção mudou de forma.

### 8. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. A janela da semana do orquestrador começa em hoje, não em segunda: o teste 1 reprova.
2. A contagem da semana passa a contar `prepare`: o teste 1 reprova.
3. `assumeHumanControl` grava a linha sem conferir a passagem: o teste 2 reprova.
4. A leitura do Scheduling volta a começar em hoje: o teste 3 reprova.
5. O schema do cliente do BFF perde `aiAppointmentsThisWeek`: o teste 4 reprova.
6. A Home volta a renderizar `StatusStrip`: o teste 5 reprova.
7. O ponto do sino aparece com zero não lidas: o teste 5 reprova.
8. A Home volta a mostrar `nextAppointment.date` cru: o teste 5 reprova.

### 9. Documentação

No mesmo diff, por **acréscimo**:

- [DECISIONS](../DECISIONS.md) ganha **D-088** em `PROPOSED`, no formato de D-080 a D-087. Ela diz:
  - as definições da semana e dos três números, e que a regra de confirmação é uma função só para as duas janelas;
  - o registro de tomada de controle humano: quando grava, o que guarda, como some, e que o passado não é reconstruído;
  - a composição da Home e os estados da faixa;
  - as divergências declaradas: sem hora da pausa, sem bloqueios pessoais em "Hoje", sino levando à página até o Goal069.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§49**, sem reescrever §4 a §48. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md), [VALIDATION_GATE](../VALIDATION_GATE.md) e [DATA_MIGRATION](../DATA_MIGRATION.md) registram o que mudou, a migration nova, as telas medidas, a conferência humana pendente e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md`, conforme o §3. `apps/ai-orchestrator/AGENTS.md` ou o README do app, só se descreverem a tomada de controle humano ou o dashboard interno.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

**Ordem obrigatória, a mesma dos Goals065 a 073 e 068:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`. `test:gate` precisa do client Prisma que `validate:core` gera.
4. Rode os oito controles do §8.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Entrega parcial sem essa lista reprova (observação 4 do review068).

### 10. O que só uma pessoa confere

- Que a Home, percorrida num aparelho real nas cinco larguras e nos estados da faixa, bate com `Home.dc.html`, `Home-Tablet.dc.html` e `Home-Desktop.dc.html`.
- Que os três números da semana fazem sentido para quem usa, com as definições de D-088.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 11. O que este Goal não pode fazer

- Só toca `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/bff/`, `packages/public-api-contract/`, `apps/frontend/` e os documentos do §9. Não toca `apps/evolution-go/`, `scripts/`, `tools/ia-loop/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Uma migration só, aditiva, no orquestrador. Nenhuma migration no BFF nem no Scheduling.
- Nenhum campo do contrato público muda ou sai; só os três entram.
- Não muda configuração de teste: `vitest.config.*`, `playwright.config.*`, `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` ficam como estão. Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A tomada de controle humano grava uma linha por passagem, na transação de `assumeHumanControl`, só para `WHATSAPP` e `ATENDLY`, e a linha some com a conversa. Provado por execução com banco do §7.2 e pelo diff da migration.
2. Os três números da semana seguem as definições de D-088, e a regra de confirmação é uma função só para hoje e semana. Provado por execução do §7.1, §7.2 e §7.3 e pelo diff de `internal/routes.ts`.
3. `GET /v1/dashboard` devolve os três campos, aditivos, validados por `dashboardSchema`; `PUBLIC_API_V1.md` os descreve e nomeia `CUSTOMER_CHANGE_OUTSIDE_POLICY`. Provado por execução do §7.4 e pelo diff.
4. A Home tem uma faixa de estado, a ordem do protótipo, os três números, o sino e nenhuma copy técnica nem data crua. Provado por execução jsdom do §7.5.
5. Largura, toque, contraste, foco e movimento de `/inicio` são decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas; os das rotas públicas, por `validate:ui`. A composição por largura e a fidelidade ao protótipo não são provadas por teste; ficam na conferência humana do §10.
6. Os oito controles negativos do §8 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
7. Typecheck dos quatro apps tocados (que consomem `packages/public-api-contract`) e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **99**/**1033**, `test:ai-orchestrator` **1127** passando, `test:scheduling-service` **484**, integração do BFF **439**, integração do Scheduling **140**), e `test:gate` segue em **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **155** testes e **0** retentativas. Provado por execução.
8. D-088 em `PROPOSED`, FINAL_AUDIT §49, CURRENT_STATE, VALIDATION_GATE e DATA_MIGRATION foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §10 não foi feita. Provado por diff contra a execução.
9. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a Home bate com os protótipos aprovados (conferência humana);
- tomadas de controle humano anteriores à migration, que não existem em registro nenhum;
- a fidelidade visual das telas de módulo e da central de notificações (Goal069) e do onboarding (Goal072).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Orquestrador: migration e registro de tomada em `assumeHumanControl`, início da semana, contagem única de confirmações, os dois números novos em `/internal/dashboard` e testes (§1, §2, §7.1, §7.2) |
| WU-02 | STANDARD | — | Scheduling: `appointmentsThisWeek` em `/internal/dashboard` e teste (§2, §7.3) |
| WU-03 | STANDARD | WU-01, WU-02 | Contrato, clientes e rota do BFF, `PUBLIC_API_V1.md` e teste (§3, §7.4) |
| WU-04 | STANDARD | WU-03 | Home: faixa de estado, ordem, "Esta semana", sino, copy e datas, testes jsdom, asserções existentes e título do teste do 068 (§4, §5, §7.5) |
| WU-05…WU-11 | DETERMINISTIC | WU-04 | typecheck dos pacotes tocados, lint de `apps/frontend` e testes dirigidos `goal074` |
| WU-12 | DETERMINISTIC | WU-05…WU-11 | validate-core |
| WU-13…WU-15 | DETERMINISTIC | WU-12 | gate-tests, validate-ui e validate-integration |
| WU-16 | STANDARD | WU-13, WU-14, WU-15 | Controles negativos (§8) e documentação (§9), depois da execução final |
| WU-17 | DETERMINISTIC | WU-16 | git-diff-check final |

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
