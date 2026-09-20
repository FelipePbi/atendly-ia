# Goal 027 — Retirada da fonte externa da agenda

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-19 pelo Tech Lead Agent após [Goal026 ACCEPTED](../reviews/026-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_HIGH

A linha 027 do roadmap somava, até a v48 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), **retirada da fonte externa** e **ensaio de release**. Esta passada de planejamento a dividiu: este Goal é a retirada da fonte externa do dado, do contrato e da interface; o ensaio de migrations, restore, deploy e capacidade passou a ser o **028**, e a auditoria final do MVP passou de 028 para **029**. Títulos, dependências e histórico de cada linha estão preservados; o motivo da divisão está registrado na v48.

## Baseline aceita

Baseline aceita: `c3255982a00c365831de979b46779ccc6ad8656b`

Goal anterior: 026 — Retirada do protocolo legado e do writer remoto

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal026 já integrado em `main` (origem `818a8383bcd4bdcaf146cbbb9b6677cfd9568348`), incluindo a implementação das três rodadas, o [review026](../reviews/026-review.md) e a documentação de fechamento. O commit `1c7b31efb7a1b1ca2b12ffcb60a16aea587c9984`, posterior a ela, corrige apenas o cabeçalho de status do próprio documento do Goal026, que o fechamento deixou em `READY`, e não toca código. Baseline anterior: `bd5990abf0869821a35d67c9f9a775831d53cb75` (fechamento025). O diff inicial desta execução contra `c3255982` deve conter, no máximo, artefatos preexistentes de `graphify-out/`, a reconciliação administrativa de `docs/migration/` feita neste planejamento e ajustes de ferramental fora de `apps/`, que ficam preservados fora do escopo.

## Objetivo e posição

O Goal026 matou o **código** que operava a agenda remota. O que sobrou é pior do que código morto: é **vocabulário vivo** que oferece ao dono do negócio uma escolha que o produto não honra mais. Hoje, na árvore de `c3255982`:

- o onboarding **oferece** "Minha Agenda — use a integração externa como fonte oficial" (`apps/frontend/src/features/onboarding/blocks/schedule.tsx:43-50`) e, quem escolher, é desviado para `minha-agenda-conectar`, cujo corpo é a tela `ExternalUnavailable`. O [fluxo de onboarding do vault](../../product-vault/02-Fluxos/01-Onboarding.md) nunca teve essa escolha: ele pergunta "já usa outro sistema?" e oferece **importar**, não federar a agenda;
- `CalendarSettings.source` ainda aceita `MINHA_AGENDA` no banco do Scheduling, e o [GAP_ANALYSIS](../GAP_ANALYSIS.md) registra literalmente que "tenant legado com `CalendarSettings.source = MINHA_AGENDA` ainda não tem caminho novo para voltar a `ATENDLY`" — um tenant nesse estado recebe `409` em toda escrita, toda oferta e toda leitura operacional desde o Goal010, e não tem saída;
- o contrato público ainda declara `ATENDLY | EXTERNAL` como dívida assumida (`apps/bff/PUBLIC_API_V1.md:78`) e ainda publica quatro códigos de erro que só existem para a fonte externa;
- o Scheduling ainda gasta **38 chamadas** de `requireAtendlyCalendar` guardando um caminho impossível, e a IA ainda engole silenciosamente a falha de hold de uma fonte que não existe mais.

Este Goal torna o dado, o contrato e a interface iguais ao produto: **a agenda operacional é a Agenda Atendly, ponto**; Minha Agenda existe apenas como **origem da importação única**, e isso não muda em nada. É o resíduo nominal de **G-10** em [GAP_ANALYSIS](../GAP_ANALYSIS.md) e o que falta do marco **M6** de [DATA_MIGRATION](../DATA_MIGRATION.md) no que depende de código e de dado do próprio produto.

Entra agora, e nesta ordem, porque a condição que o segurava caiu no Goal026: enquanto existia writer remoto na árvore, retirar o valor do dado seria retirar a etiqueta de um caminho que ainda existia. Hoje não existe. E entra **antes** do ensaio de release (028) pela mesma razão de método que justificou a ordem anterior: ensaiar migrations, restore e deploy de uma árvore que ainda carrega vocabulário morto é ensaiar a coisa errada.

Este Goal **não** faz: ensaio de migrations, restore, deploy ou capacidade (**028**); auditoria final (**029**); qualquer mudança na importação única, na conexão/reconexão/desconexão da origem, em retenção (023), lembretes (021), central (022), conhecimento (024) ou no ciclo de vida da conta (025); qualquer remoção de `MigrationJob`, `MigrationJobItem` ou `LegacyMigrationJobClass`; fechamento de **G-32**. Não reabre nenhum aceite de 001–026.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md). **D-026** (job legado é classificado e nunca convertido; nada é apagado), **D-036** (estado da importação como leitura própria), **D-041** (purga por negócio derivada do schema) e **D-042** (retirada do protocolo legado, com o valor de fonte explicitamente adiado para este Goal) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 010, 018, 020, 025 e 026 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Product Vault, **apenas duas notas e só se precisar de copy**: [Onboarding](../../product-vault/02-Fluxos/01-Onboarding.md) (a escolha de fonte de agenda não existe no fluxo aprovado) e [Importação do Minha Agenda](../../product-vault/01-Regras/06-Importacao-Minha-Agenda.md) ("o Minha Agenda serve apenas como origem de dados para mover a operação para a Atendly"). Não abrir o vault inteiro.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-10** é o alvo e pode fechar por inteiro com este diff; **G-32** não é tocado.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, seções de calendário, onboarding, holds, ciclo de vida e lembretes. Usar Graphify apenas para confirmar consumidores de `requireAtendlyCalendar`, de `publicSource`/`internalSource` e de `calendarSourceSchema`; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `c3255982`. Não gastar rodada redescobrindo:

- **O enum `CalendarSource { ATENDLY, MINHA_AGENDA }` tem três usos no `schema.prisma` do Scheduling:** `CalendarSettings.source` (linha 233), `MigrationJob.source` e `MigrationJob.target` (linhas 862-863). O enum **não pode ser reduzido**: as linhas de `MigrationJob` são histórico preservado por D-026 e pelo Goal026.
- **`IntegrationProvider { MINHA_AGENDA }` é outra coisa e fica intocado:** identifica a origem da importação em `IntegrationConnection` (295), `ExternalEntityMap` (847) e `ImportSession.provider` (1018, com default). Confundir os dois enums mata a importação única.
- **O guard operacional está em dois lugares e só neles:** `requireAtendlyCalendar` em `apps/scheduling-service/src/modules/internal-api/routes.ts:1832` (**38 chamadas** no mesmo arquivo, todas logo acima de operação de escrita ou de leitura operacional) e `requireAtendlyCalendarForSeries` em `apps/scheduling-service/src/modules/calendar/routes.ts:504` (4 chamadas). `requireCalendar` (`internal-api/routes.ts:1818`) é o que sobra e continua devolvendo `404 CALENDAR_SETTINGS_NOT_FOUND` quando não há linha.
- **Os quatro códigos de erro que só existem por causa da fonte externa:** `OPERATION_MANAGED_EXTERNALLY` (`internal-api/routes.ts:1835`), `EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED` (`calendar/calendar-service.ts:316`), `EXTERNAL_CALENDAR_SERIES_UNSUPPORTED` (`calendar/routes.ts:520`) e `EXTERNAL_CALENDAR_HOLD_UNSUPPORTED` (emitido pelo Scheduling, consumido pela IA em `assistant-tools.ts:1104,1963` e pelo frontend em `features/agenda/holdSession.ts:174`).
- **`CalendarProviderFactory.create` já é um `if` com um ramo só de verdade** (`calendar/provider-factory.ts:17-38`): `ATENDLY` instancia `AtendlyCalendarProvider`, qualquer outra coisa é `409 MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED`.
- **As capabilities nascem em um único ponto:** `internal-api/routes.ts:1781-1795` — `manageAvailability`, `manageServices`, `manageCustomers` e `createAppointments` são `source === "ATENDLY"`; `migrate` é `source !== null`; `aiActivationReady` vem de `countOperationalServices` (1804), que devolve 0 para fonte nula.
- **A tradução para o vocabulário público está em pontos localizados do BFF:** `lib/onboarding-state.ts:119` (`publicSource`) e `:111` (o `issue` `CALENDAR_INTEGRATION_NOT_CONNECTED`), `modules/calendar/routes.ts:704-718` (`publicCalendar`), `modules/customers/routes.ts:105`, `modules/services/routes.ts:54`, `modules/dashboard/routes.ts:71`, `modules/settings/routes.ts:276` e `modules/onboarding/routes.ts:30,49,142,255` (`sourceSchema` e `internalSource`).
- **No frontend o valor entra por `calendarSourceSchema` (`data/mappers/publicApiSchemas.ts:3`)** e se ramifica em: `features/agenda/AgendaBoard.tsx:148,372`, `features/agenda/AppointmentDetail.tsx:118`, `features/agenda/AppointmentFlowShell.tsx:30,63`, `features/agenda/sourceGuard.ts` (`personAgendaGuard`), `features/agenda/holdSession.ts:174`, `features/customers/CustomerForm.tsx:99`, `features/customers/CustomerList.tsx:48`, `features/customers/CustomerProfile.tsx:100`, `features/dashboard/DashboardScreen.tsx:197,206,306`, `features/notifications/notificationViews.ts:52` e as entradas `OPERATION_MANAGED_EXTERNALLY` dos mapas de erro de várias telas de `features/customers/`.
- **No onboarding o desvio é nominal:** `scenarios.ts:62` (`minha-agenda-conectar`), `blocks.ts:26,41`, `OnboardingScreen.tsx:55`, `OnboardingRuntime.tsx:157` e `blocks/schedule.tsx:31,43-50,239-241`. A escolha `fonte-da-agenda` fica com **uma opção só** depois desta retirada.
- **A importação única não passa por nada disso:** `ConnectSourceScreen`, `features/imports/`, as rotas `/v1/calendar/imports*` e `/v1/calendar/integration*` usam `IntegrationProvider`, nunca `CalendarSource`.
- **O padrão de ensaio de migration já existe e é reproduzível:** dezessete scripts `scripts/goalNNN-*-rehearsal.mjs`, cada um com um passo nomeado em `scripts/validate-integration.mjs` (ver `rehearse:goal023-retention-migration`, linha 463).
- **`scripts/final-production-audit.mjs` é o lugar já existente para regra estática de árvore**, com `check(name, ok, details)`, funções puras testadas em caso positivo e negativo em `scripts/tests/`, executadas por `test:gate-scripts` dentro de `validate:core`.
- **Dois resíduos declarados no [review026](../reviews/026-review.md) ficaram endereçados a um Goal futuro:** o `{@link CalendarMigrationService}` órfão em `legacy-job-reconciliation.ts:26` e a exclusão fixa de `apps/ai-orchestrator/tests/tools/import-out-of-reach.test.ts` na regra `no_legacy_calendar_migration_routes`, legítima mas sem comentário que a justifique. São deste Goal (§6).

## Pontos de implementação

- `apps/scheduling-service/prisma/schema.prisma` e `apps/scheduling-service/prisma/migrations/` — uma migration nova.
- `scripts/goal027-calendar-source-migration-rehearsal.mjs` e `scripts/validate-integration.mjs`.
- `apps/scheduling-service/src/modules/internal-api/routes.ts`, `modules/calendar/routes.ts`, `modules/calendar/calendar-service.ts`, `modules/calendar/provider-factory.ts`, `modules/migrations/legacy-job-reconciliation.ts`.
- `apps/bff/src/lib/onboarding-state.ts` e `apps/bff/src/modules/{calendar,customers,services,dashboard,settings,onboarding}/routes.ts`.
- `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`.
- `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `features/agenda/`, `features/customers/`, `features/dashboard/`, `features/notifications/notificationViews.ts`, `features/onboarding/`.
- `scripts/final-production-audit.mjs` e `scripts/tests/`.
- `apps/bff/PUBLIC_API_V1.md` e `docs/migration/`.
- Suítes correspondentes em `apps/*/tests/`.

## Escopo obrigatório

### 1. O dado: `CalendarSettings.source` passa a valer sempre `ATENDLY`

Uma migration nova no Scheduling, e só nele, com duas partes:

1. **Reescrita declarada das linhas existentes.** Todo `CalendarSettings` com `source = 'MINHA_AGENDA'` passa a `ATENDLY`. Esta é a regra deste Goal e precisa estar escrita no cabeçalho da migration, com o motivo: desde o corte operacional do Goal010 esse tenant recebe `409` em toda escrita, toda oferta e toda leitura operacional — ele não tem agenda funcionando, tem um rótulo. `ATENDLY` é a única fonte que o produto honra, e passar a linha para ela descreve o que já é verdade, não concede capacidade nova. Nada mais do tenant muda: serviços, disponibilidade, agendamentos, integração e sessão de importação ficam exatamente como estão, e o checklist de onboarding passa a cobrar `AVAILABILITY_REQUIRED` como cobra de qualquer tenant Atendly.
2. **Trava no banco.** Uma constraint `CHECK` (nomeada no padrão das existentes, como `CalendarSettings_offer_rules_check`) que recusa qualquer valor de `source` diferente de `ATENDLY` em `CalendarSettings`. A partir dela o estado inválido deixa de ser alcançável mesmo por escrita fora do serviço.

**O enum `CalendarSource` não é alterado e o valor `MINHA_AGENDA` continua existindo no tipo**, porque `MigrationJob.source` e `MigrationJob.target` continuam gravados com ele e são histórico preservado por D-026 e pelo Goal026. Reduzir o tipo exigiria reescrever linhas de `MigrationJob`, o que este Goal proíbe. O comentário do enum no `schema.prisma` precisa passar a dizer exatamente isso.

A migration é **idempotente e re-executável**: rodar duas vezes sobre a mesma base não muda nada na segunda. A reescrita é reportada por contagem em vez de acontecer em silêncio.

Ensaio obrigatório, no padrão dos dezessete já existentes: `scripts/goal027-calendar-source-migration-rehearsal.mjs`, com passo nomeado em `scripts/validate-integration.mjs`, semeando em PostgreSQL descartável pelo menos (a) tenant `ATENDLY` intocado, (b) tenant `MINHA_AGENDA` reescrito, (c) tenant sem linha de `CalendarSettings`, (d) `MigrationJob` gravado com `source`/`target` legados, que precisa sobreviver **sem alteração**, e (e) segunda execução sem efeito. O ensaio precisa provar também que a constraint recusa um `UPDATE` de volta para `MINHA_AGENDA`.

Nenhuma migration nova no BFF nem na IA. Nenhuma tabela, coluna, enum ou linha apagada em nenhum banco.

### 2. Scheduling: existe uma fonte, então não existe guarda de fonte

`requireAtendlyCalendar` e `requireAtendlyCalendarForSeries` deixam de existir; suas 42 chamadas passam a usar a leitura que sobra (`requireCalendar`), preservando **exatamente** o `404` de tenant sem `CalendarSettings`. Nenhuma rota pode perder a exigência de calendário configurado por causa desta simplificação — trocar um `409` por um `200` onde havia `404` é regressão.

Somem, com os ramos que os produziam, `OPERATION_MANAGED_EXTERNALLY`, `EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED`, `EXTERNAL_CALENDAR_SERIES_UNSUPPORTED` e `EXTERNAL_CALENDAR_HOLD_UNSUPPORTED`. `CalendarProviderFactory` perde o ramo de recusa e o código `MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED`: a invariante que ele defendia passa a morar na constraint do banco, provada em integração, e não em um `if` que nunca pode ser verdadeiro. Se a factory perder a razão de receber `source`, o parâmetro sai junto; se algum chamador ainda precisar dele, fica com o tipo reduzido.

As capabilities passam a depender apenas de **haver** calendário configurado: `manageAvailability`, `manageServices`, `manageCustomers` e `createAppointments` valem para todo tenant com `CalendarSettings`, e `migrate` e `aiActivationReady` mantêm o significado que já têm. Nenhuma capability muda de nome, entra ou sai do payload.

Intocados: `IntegrationProvider`, `IntegrationConnection`, `ExternalEntityMap`, `ImportSession`, `MinhaAgendaImportSourceReader`, `migrationAvailabilityRules` e todo o módulo de importação.

### 3. BFF: o contrato público perde `EXTERNAL`

`calendar.source` passa a ser `"ATENDLY" | null` em toda a API pública — `null` continua significando "ainda não escolheu" e `CALENDAR_NOT_SELECTED` continua existindo. `publicSource` e `internalSource` desaparecem com a tradução que faziam.

`POST /v1/onboarding` **mantém o campo** `calendar.source` e passa a aceitar somente `"ATENDLY"`; qualquer outro valor é `400` pelo schema, como qualquer entrada fora do contrato. Não é remoção de campo: é redução de domínio, e é o que preserva o consumidor existente.

O `issue` `CALENDAR_INTEGRATION_NOT_CONNECTED` sai do vocabulário de `POST /v1/onboarding/complete`, porque só era emitido para a fonte externa; `AVAILABILITY_REQUIRED` passa a valer para todo tenant com fonte escolhida, e o predicado de `capabilities.hoursConfigured` acompanha. `ACTIVE_SERVICE_REQUIRED` e `CALENDAR_NOT_SELECTED` não mudam.

Nenhuma outra rota pública muda de forma, de status ou de código de erro.

### 4. IA: a falha de hold volta a ser falha

`holdsUnsupported` e o `catch` que devolvia `null` em `assistant-tools.ts:1104` saem. **Isto é mudança de comportamento e precisa ser provada como tal:** não existe mais fonte de agenda sem hold, então falha ao criar hold passa a ser erro tratado pelo caminho normal de erro da tool, e não uma proposta silenciosamente sem reserva. Um teste precisa cobrir o caminho novo; nenhum outro guard da IA é enfraquecido, e o contexto do modelo continua sem detalhe de infraestrutura.

### 5. Frontend: a interface para de oferecer e de explicar o que não existe

- `calendarSourceSchema` passa a aceitar somente `"ATENDLY"`; o mapper continua rejeitando payload fora do contrato em vez de normalizar em silêncio.
- Saem os ramos `external` de `AgendaBoard`, `AppointmentDetail`, `AppointmentFlowShell`, `CustomerForm`, `CustomerList`, `CustomerProfile` e `DashboardScreen`, junto com as entradas `OPERATION_MANAGED_EXTERNALLY` dos mapas de erro e a entrada `CALENDAR_INTEGRATION_NOT_CONNECTED` de `notificationViews.ts`. `personAgendaGuard` perde o ramo de fonte externa e **mantém** o de fonte não escolhida. `holdSession.ts` perde o tratamento de `EXTERNAL_CALENDAR_HOLD_UNSUPPORTED`.
- **Onboarding:** a escolha "Minha Agenda como fonte oficial" e o desvio `minha-agenda-*` saem por inteiro — opção, cenário, roteamento por `state.calendar.source`, `ExternalUnavailable` e o ramo de `persistScheduleStep`. Com uma opção só, o passo `fonte-da-agenda` deixa de ser uma escolha: ou ele some e a fonte é gravada como `ATENDLY` no ponto onde o bloco já persiste, ou ele vira confirmação explícita. Qualquer das duas serve, desde que o bloco "Sua agenda" continue com progresso coerente, o retorno a um onboarding em andamento continue caindo no passo certo e a jornada continue correspondendo ao [fluxo aprovado](../../product-vault/02-Fluxos/01-Onboarding.md) — que oferece **importar**, não federar.
- **Intocado:** `ConnectSourceScreen`, toda a feature `imports/`, a entrada de importação em Configurações e o histórico. Importar do Minha Agenda continua oferecido, com a mesma copy, no mesmo lugar. Remover a importação junto com a fonte externa é o erro mais caro possível neste Goal e será recusado no review.

### 6. Resíduos declarados do Goal026

- `legacy-job-reconciliation.ts:26` deixa de apontar `{@link CalendarMigrationService}`, que não existe mais; o comentário passa a descrever a árvore real.
- A exclusão de `apps/ai-orchestrator/tests/tools/import-out-of-reach.test.ts` na regra `no_legacy_calendar_migration_routes` ganha comentário que justifique por que uma asserção de ausência é exceção legítima, e a exceção passa a ser exercitada pelos testes da função pura.

### 7. Prova de que a fonte externa não volta

Acrescentar a `scripts/final-production-audit.mjs` regras estáticas no formato `check(...)` já usado, que falhem se o vocabulário voltar: nenhuma fonte de `apps/` comparando `source` com `"EXTERNAL"` ou `"MINHA_AGENDA"` como fonte de agenda (a menção a `IntegrationProvider.MINHA_AGENDA` da importação precisa continuar passando — a regra tem que distinguir os dois, e é isso que o caso negativo prova); nenhum dos códigos de erro retirados presente em `apps/`; nenhuma referência a `requireAtendlyCalendar`. Cada regra nova ganha caso em `scripts/tests/`, **inclusive o caso negativo** — a suíte precisa provar que a regra reprova uma árvore com o padrão de volta, e que **não** reprova a importação única. Regra que passaria com a fonte externa de volta, ou que reprovaria a importação, não conta.

### 8. O que não pode mudar de comportamento

- A **importação única** continua idêntica de ponta a ponta: direito, abertura de sessão, preview por categoria, seleção, decisões, execução, retomada por lease, conclusão forte e histórico.
- `POST /v1/calendar/integration/connect`, `POST /v1/calendar/integration/reconnect` e `DELETE /v1/calendar/integration` continuam com o mesmo contrato, incluindo `409 INTEGRATION_WRITES_NOT_SUPPORTED`.
- `MigrationJob`, `MigrationJobItem` e `LegacyMigrationJobClass` continuam no schema, com as linhas gravadas intactas, e `legacy-job-reconciliation.ts` continua classificando.
- O ciclo de vida da conta e a purga por negócio do Goal025 continuam com a mesma cobertura de tabelas.
- Lembretes, central de notificações, retenção e conhecimento não mudam, exceto pela entrada de vocabulário retirada em §5.
- Nenhuma rota pública além do que §3 descreve muda de forma, de código de erro ou de status.

### 9. Prova

- **Suítes dirigidas** dos quatro apps passando depois da retirada, com o `404` de tenant sem calendário e o `400` de `source` fora do domínio realmente exercitados.
- **Integração contra PostgreSQL descartável:** o ensaio da migration com os cinco casos de §1, a constraint recusando o retorno do valor e as rotas `/v1/calendar/imports*` continuando verdes.
- **A cobertura de purga derivada do schema** (Goal025) continua verde nos dois serviços.
- `validate:core`, `validate:integration`, `validate:ui` e `build:all` executados sobre a **árvore final**, não sobre a árvore de uma rodada anterior — foi assim que os Goals 025 e 026 gastaram rodadas. `validate:ui` nas cinco larguras cobre o onboarding alterado.
- Teste que falha por motivo diferente do que anuncia não conta. Nada de asserção trivialmente verdadeira. Fixture não pode mascarar o defeito que o teste diz cobrir.
- **Regra de execução, do [review026](../reviews/026-review.md):** o repositório é npm. Não invocar `pnpm` nem `corepack` em nenhuma unidade de trabalho — duas rodadas do Goal026 foram gastas com lockfile de outro gerenciador recriado por um passo de diagnóstico. Antes de declarar pronto, `git status --porcelain` não pode listar artefato não rastreado que não seja arquivo novo declarado no relatório.

### 10. Documentação

Atualizar apenas o que a mudança fizer mentir: `apps/bff/PUBLIC_API_V1.md` — o parágrafo `ATENDLY | EXTERNAL` sai, os códigos de erro retirados saem das tabelas, o predicado de `hoursConfigured` e as notas de "com agenda externa, recusa com…" são reescritos, e a **segunda remoção subtrativa do contrato público** fica registrada com data e motivo, no mesmo formato que D-042 estabeleceu para a primeira. Em `docs/migration/`: a linha de **G-10** em [GAP_ANALYSIS](../GAP_ANALYSIS.md), que pode fechar por inteiro se o diff sustentar — e só nesse caso; [CURRENT_STATE](../CURRENT_STATE.md) nas partes de Scheduling, BFF, IA e frontend; [DATA_MIGRATION](../DATA_MIGRATION.md) na parte de M6 e na tabela de migrations, com a regra de reescrita declarada e quantificada; [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) nos módulos que perderem consumidor; [VALIDATION_GATE](../VALIDATION_GATE.md) no passo novo de ensaio e nas regras estáticas novas. Registrar a decisão em [DECISIONS](../DECISIONS.md) como **D-043**, no formato das anteriores, cobrindo: a reescrita declarada das linhas legadas com a constraint como trava, a preservação do valor no enum por causa do histórico de `MigrationJob`, a redução do domínio do contrato público sem remoção de campo, a morte dos códigos de erro de fonte externa, a mudança de comportamento do hold na IA e a regra estática que distingue fonte de agenda de origem de importação. Não criar documento novo.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Existe exatamente uma migration nova, no Scheduling, e nenhuma no BFF ou na IA.
2. Toda linha de `CalendarSettings` com `source = 'MINHA_AGENDA'` foi reescrita para `ATENDLY`, com a regra e o motivo escritos no cabeçalho da migration e a contagem reportada pelo ensaio.
3. Uma constraint no banco recusa `source` diferente de `ATENDLY` em `CalendarSettings`, provada por tentativa real de `UPDATE` em PostgreSQL descartável.
4. A migration é idempotente: segunda execução não altera nenhuma linha e não falha.
5. O enum `CalendarSource` continua com os dois valores, e nenhuma linha de `MigrationJob` foi alterada — provado no ensaio.
6. `MigrationJob`, `MigrationJobItem` e `LegacyMigrationJobClass` continuam no `schema.prisma`, e `legacy-job-reconciliation.ts` continua inventariando e classificando jobs legados.
7. `scripts/goal027-calendar-source-migration-rehearsal.mjs` existe, tem passo nomeado em `scripts/validate-integration.mjs` e cobre os cinco casos de §1.
8. `requireAtendlyCalendar` e `requireAtendlyCalendarForSeries` não existem mais, e nenhuma rota que antes exigia calendário configurado passou a aceitar tenant sem `CalendarSettings`: o `404` continua provado por teste em pelo menos uma rota de cada grupo (agendamento, disponibilidade, série, cliente, serviço).
9. `OPERATION_MANAGED_EXTERNALLY`, `EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED`, `EXTERNAL_CALENDAR_SERIES_UNSUPPORTED`, `EXTERNAL_CALENDAR_HOLD_UNSUPPORTED` e `MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED` não são emitidos por nenhum app e não constam mais de `PUBLIC_API_V1.md`.
10. `CalendarProviderFactory` instancia a Agenda Atendly sem ramo de recusa por fonte, e o comportamento das rotas que a usam não mudou para tenant `ATENDLY`.
11. As capabilities continuam com os mesmos nomes no payload e passam a depender de haver calendário configurado, provado por teste com tenant com e sem `CalendarSettings`.
12. `calendar.source` na API pública é `"ATENDLY" | null`; nenhum endpoint devolve `"EXTERNAL"`.
13. `POST /v1/onboarding` continua aceitando `calendar.source`, recusa qualquer valor diferente de `"ATENDLY"` com `400`, e o fluxo de conclusão continua funcionando.
14. `CALENDAR_INTEGRATION_NOT_CONNECTED` saiu do vocabulário de `issues`; `CALENDAR_NOT_SELECTED`, `ACTIVE_SERVICE_REQUIRED` e `AVAILABILITY_REQUIRED` continuam com o significado de hoje, com `AVAILABILITY_REQUIRED` valendo para todo tenant com fonte escolhida.
15. A IA não tem mais `holdsUnsupported`; falha ao criar hold segue o caminho normal de erro da tool, provado por teste, sem vazar detalhe de infraestrutura para o contexto do modelo.
16. `calendarSourceSchema` aceita somente `"ATENDLY"` e o mapper continua recusando payload fora do contrato.
17. Nenhuma tela do frontend tem mais ramo de fonte externa, e nenhum mapa de erro tem mais `OPERATION_MANAGED_EXTERNALLY`; `personAgendaGuard` mantém o ramo de fonte não escolhida.
18. O onboarding não oferece mais Minha Agenda como fonte de agenda, não tem mais cenário `minha-agenda-*`, e o bloco "Sua agenda" mantém progresso, retomada e navegação coerentes, provado por teste.
19. A importação única continua oferecida e íntegra: entrada no onboarding, `ConnectSourceScreen`, preview, seleção, decisões, execução, retomada, conclusão forte e histórico, com as suítes correspondentes verdes e a integração de `/v1/calendar/imports*` verde contra PostgreSQL real.
20. `IntegrationProvider`, `IntegrationConnection`, `ExternalEntityMap` e `ImportSession` não foram alterados.
21. `legacy-job-reconciliation.ts` não referencia mais `CalendarMigrationService`, e a exclusão de `import-out-of-reach.test.ts` na regra estática tem comentário justificando e caso de teste.
22. `final-production-audit.mjs` ganhou as regras estáticas de §7, elas aparecem no resultado do `audit:static`, e cada uma tem caso negativo em `scripts/tests/` — incluindo o caso que prova que a regra **não** reprova a origem de importação.
23. A cobertura de purga por negócio derivada do schema continua verde na IA e no Scheduling.
24. Nenhuma rota pública além do que §3 descreve mudou de forma, de código de erro ou de status.
25. `PUBLIC_API_V1.md` registra a segunda remoção subtrativa com data e motivo, e não sobrou nenhuma menção a agenda externa como fonte operacional.
26. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha.
27. Os gates declarados foram executados **sobre a árvore final** e o relatório traz o resultado real de cada um, incluindo `validate:integration` com o passo novo e `validate:ui` nas cinco larguras.
28. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.
29. `GAP_ANALYSIS` reflete o estado real de **G-10** depois do diff, e **G-32** continua aberto.
30. `DECISIONS` tem **D-043** registrada no formato das anteriores, sem quebrar o bloco de nenhuma decisão anterior.

## Entrega

Relatório do Developer com: diff por área e por serviço, o SQL da migration e a contagem de linhas reescritas no ensaio, resultado real dos gates (não "deveria passar"), a lista de símbolos e códigos de erro removidos com o consumidor que cada um perdeu, a decisão tomada no passo `fonte-da-agenda` do onboarding e por quê, a prova de que a importação única continua oferecida e íntegra, a lista de arquivos tocados fora dos pontos de implementação com justificativa, e o que ficou declaradamente fora. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
