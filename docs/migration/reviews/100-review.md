# Review formal — Goal 100

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-02, em review DEEP, conforme o [Goal100](../goals/100-agenda-semana-e-mes-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

O Goal leva `/agenda` em Semana ao quadro A10 e em Mês ao quadro A11 do protótipo: a Semana como mapa (eixo "8h…20h", barras na posição e duração reais com a cor do serviço lida do catálogo, horas fora do horário rebaixadas a partir de `availability.rules`, linha do intervalo com a contagem e legenda), o Mês como pilha de traços ou linhas por largura com "+N", o resumo do dia compartilhado (`DaySummaryCard.tsx`), a pílula de dias visíveis como link para `/configuracoes/agenda` e, no Mês, o primeiro toque que seleciona e o segundo que abre o Dia. A barra comum de D-108 não mudou. A decisão é [D-109](../DECISIONS.md), aceita neste fechamento. Ela não reescreve D-086, D-089 nem D-108.

## Escopo e identidade do diff

- Baseline aceita vigente: `cba8d4918b8eb33a1e6ac82960ccd0a0e6e0e35a` (Goal092). Base imediata da implementação: `b6668ceb05bcb0bd526e0dab5e6d069a77fa4318`, HEAD da worktree `.ai-worktrees/goal-100`, sem commit na worktree. Entre as duas há só documentação (`b6668ce`).
- Snapshot aceito, calculado pelo IA Loop: **13 arquivos**, hash do diff `1bd9713491f8fab0d0587c25f79b242f70d931c9d102251c82b09e1aa7f80b2f`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git diff --numstat b6668ce` no snapshot aceito:
  - Produção, em `apps/frontend/`: `src/features/agenda/WeekView.tsx` (+218/−64), `MonthView.tsx` (+245/−62), `AgendaBoard.tsx` (+52/−6), `occupancy.ts` (+103/−0), `DayView.tsx` (+2/−17, só os imports de `daySummaryHeading` e `formatDuration`, movidas para `occupancy.ts`), `DaySummaryCard.tsx` (novo, 122 linhas) e `src/shared/styles/atendly-agenda.css` (+577/−260).
  - Testes: `tests/goal100-agenda-semana-mes.test.tsx` (novo, 811 linhas, **21** testes em sete provas) e asserções ajustadas em `goal016-agenda-views` (+18/−1) e `goal016-a11y` (+4/−0), reescritas para a regra "o primeiro toque seleciona, o segundo abre o Dia". Nenhum teste removido ou pulado.
  - Documentos: `docs/migration/DECISIONS.md` (D-109), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- `timeGrid.ts`, ícones, `e2e/routes.ts`, `e2e/visual/targets.json`, `vitest.config.*`, `playwright.config.*`, `scripts/`, rota, contrato, BFF, migration, campo e variável não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** Semana e Mês já seguiam A10 e A11 na estrutura nos quatro devices (`visual:compare -- --target A10,A11`: 17,0 / 5,0 / 5,7 / 4,8 e 10,9 / 5,3 / 5,7 / 4,6, com os oito `side-by-side.png` abertos). Blockers: (1) unidades de diagnóstico tinham alterado `apps/frontend/vitest.config.mts` (`maxWorkers: 4`) e `apps/frontend/playwright.config.ts` (`workers` 2 fora de CI), o que o Goal proíbe — o mesmo padrão do review077; (2) os três documentos descreviam a árvore com esses tetos; (3) o rótulo do dia da semana de hoje no cabeçalho da Semana ficava em `#716859`, e o quadro o pinta de `#0F5F63`.
2. **Rodada 2 — `CHANGES_REQUIRED`, 2 blockers.** Os dois arquivos de configuração voltaram ao conteúdo de `b6668ce` (conferido por `git hash-object`) e a regra `.week-map-head.is-today .week-map-weekday` entrou no CSS. Blockers: (1) o `validate:ui` sem os tetos teve **4** `flaky` em rotas públicas, sem registro nos documentos; (2) as contagens e os `sha256` ainda eram os da rodada 1.
3. **Rodada 3 — `CHANGES_REQUIRED`, 2 blockers.** Código, CSS e testes iguais byte a byte aos da rodada 2. Blockers: (1) a rodada reescreveu texto da seção aceita do Goal092 em VALIDATION_GATE (o controle 4 e o vermelho contra a baseline); (2) os documentos diziam que `validate:integration` não tinha passado, quando a WU-10 da rodada 3 passou na mesma árvore. O critério 5 foi aceito nesta rodada pela cláusula de causa medida (ver "Aceito sem prova completa").
4. **Rodada 4 — `ACCEPTED`, 0 blockers.** Só documentação mudou. A seção do Goal092 voltou ao texto de `b6668ce` (o diff de VALIDATION_GATE contra `b6668ce` é um único hunk de acréscimo), e `validate:integration` passou a constar como passado. Três pontos de registro ficaram para este fechamento (ver "Observações").

O perfil do Developer declarado no Goal é `SONNET_HIGH`; as rodadas 2 a 4 tiveram `SONNET_MEDIUM` como perfil recomendado pelo review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal100 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal100) e na "Prova" e na nota de fechamento de D-109.

- **Fidelidade visual, conferida pelo Tech Lead.** `visual:compare -- --target A10,A11`, exit 0, nas quatro rodadas, com os mesmos números (A10 17,0 / 5,0 / 5,7 / 4,8; A11 10,9 / 5,3 / 5,7 / 4,6), e os oito `side-by-side.png` abertos em cada uma. Semana: eixo 8h–20h na escala do quadro, barras coloridas sem texto no mobile e "Nome · Serviço" no tablet e no desktop, barra dividida com dois serviços, almoço hachurado, compromisso com contorno, horas fora do horário rebaixadas, linha do intervalo com a contagem, pílula, legenda, resumo e, da rodada 2 em diante, o dia de hoje em teal. Mês: traços de 3 px com "+N" no mobile, linhas "Nome · Serviço" com "+N" no tablet e no desktop, dia selecionado azulado. O que sobra são as divergências 1 a 8 de D-109.
- **O Dia e a Home.** A1 10,4 / 4,8 / 5,4 / 4,3 e H3 8,1 / 4,1 / 3,8 / 3,0, iguais ao início nos quatro devices (E5 de VALIDATION_GATE). O A11 melhorou nos quatro devices; o A10 piorou em mobile, paisagem e desktop, com causa provável declarada.
- **Reexecução pelo Tech Lead (rodada 4).** `goal100-agenda-semana-mes`, `goal016-agenda-views`, `goal016-a11y`, `goal092-agenda-dia`, `goal069-agenda-views` e `goal073-agenda-visualizacao`: **75**/**75**.
- **Identidade do código aceito.** `sha256` na árvore aceita igual ao de "Árvore avaliada" em VALIDATION_GATE: `WeekView.tsx` `35387037…`, `MonthView.tsx` `d6c6f8f2…`, `AgendaBoard.tsx` `62a347ee…`, `occupancy.ts` `d40c45c3…`, `DayView.tsx` `e5db674b…`, `DaySummaryCard.tsx` `562decdc…`, `atendly-agenda.css` `538ba8ac…`, teste novo `552288a9…`, `goal016-agenda-views` `c3192556…` e `goal016-a11y` `e72abc9a…`.
- **Execução final do Developer (rodada 3, E1 a E7).** Lint e typecheck exit 0; `goal100` **21**/**21**; `validate:core` exit 0 (`test:frontend` **138** arquivos, **1522** testes); `test:gate` **233**/**233**; gate autenticado **245** `expected`, **0** `flaky`; `validate:integration` exit 0, **36**/**36** passos (E4b); `validate:ui` com 1 worker (E3c) **169** `expected`, **0** `flaky`.
- **Gates do IA Loop na rodada 4.** `validate:integration` exit 0, **36**/**36**, com o gate autenticado em **245** `expected`, **0** `unexpected`, **0** `flaky`; `validate:ui` exit 0, **168** `passed`, **21** `skipped`, **1** `flaky` em rota pública.
- **Vermelho contra a baseline (WU-03, rodada 1).** `Tests  17 failed | 4 passed (21)`, restauração conferida por hash; as quatro que passam são declaradas em D-109.
- **Controles negativos (rodada 3, depois da última edição de código).** Os quatro do §6 reprovam com o defeito (2, 3, 2 e 1 testes) e passam restaurados, com `sha256` antes e depois iguais.
- **Escopo.** `git status --porcelain=v1 -uall` só com os 13 arquivos autorizados, sem resto de controle negativo nem `e2e-results/`.

## Aceito sem prova completa

1. **Critério 5 com o `validate:ui` padrão.** O critério pede **0** retentativas. Com a configuração da baseline, nenhuma execução deu 0: E3a (4 `flaky`), E3b (exit 1, 2 `unexpected`, 7 `flaky`), WU-09 da rodada 3 (6 `flaky`) e WU-09 da rodada 4 (1 `flaky`). Todas em rotas públicas fora da Agenda, com erros de processo, conexão, tempo esgotado ou falta de recurso. Com 1 worker (E3c), 0 retentativas; o gate autenticado, que tem a Agenda, deu 0 em todas as rodadas. Aceito pela cláusula "retentativa em rota fora da Agenda é medida e reportada com a causa". A causa foi medida pela troca de workers, não pela troca dos arquivos pelos da baseline.
2. **O vermelho contra a baseline e os controles negativos não foram reexecutados pelo Tech Lead**; conferidos por registro do IA Loop e `sha256`.
3. **A piora do A10** em mobile (12,9 para 17,0), paisagem e desktop tem causa provável (barras coloridas do quadro sem par nos dias vazios da conta de teste, e o aviso de WhatsApp deslocando a tela no mobile), não isolada.
4. **O resumo do dia em tablet e desktop** fica abaixo da primeira tela nas capturas (o aviso de WhatsApp empurra o conteúdo) e foi conferido pela prova 6, não por captura.
5. **Alvo de toque das barras da Semana** (`min-height` de 6 px no CSS) decidido pelo gate autenticado (245 `expected`), sem medida própria neste review.

## Observações registradas, sem mudar a decisão

1. **Três pontos de registro da rodada 4**, levados às notas de fechamento de D-109 e de VALIDATION_GATE sem reescrever o texto proposto: o resultado do vermelho da WU-03, que o texto dizia não citar; as retentativas das WU-09 das rodadas 3 e 4; e a janela "entre 08:47Z e 09:08Z", que não cobre o fim de E4b.
2. **Seção aceita do Goal092 em VALIDATION_GATE.** Sobrescrita na rodada 3 e restaurada na rodada 4; o texto aceito está igual ao de `b6668ce`.
3. **`DayView.tsx`** mudou só nos imports das duas funções movidas para `occupancy.ts`; o A1 ficou igual ao início.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- A Semana e o Mês com semana e mês cheios, que a conta de teste não tem.
- O hold tracejado na Semana e "· em confirmação" no resumo, porque a Agenda não lê holds.
- A sheet de dias visíveis (A12); a pílula leva a Configurações › Agenda.
