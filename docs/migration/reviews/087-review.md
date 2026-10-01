# Review formal — Goal 087

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, conforme o [Goal087](../goals/087-navegacao-da-area-logada-e-home-identicas-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–086) foi reaberto, reavaliado ou revertido. **Três rodadas**: a rodada 1 teve três blockers, a rodada 2 teve outros três, e a rodada 3 fechou todos.

O Goal leva a casca da área logada e `/inicio` ao quadro **H1** do protótipo aprovado nos quatro devices do `visual:compare`: mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768. A casca passa a ter três faixas: barra inferior do celular abaixo de 768 px, barra inferior do tablet de 768 a 1099 px e sidebar de 232 px a partir de 1100 px. O trilho de 88 px e o cabeçalho de marca do celular saem. A sidebar ganha o cartão da IA e a conta da pessoa, e a faixa da Home ganha "Pausar". A decisão é **D-101**, aceita com este review; ela substitui o item 1 de D-074 nesses pontos e mantém o item 4 de D-093.

## Escopo e identidade do diff

- Baseline aceita vigente: `f65b88a74f3bae750a1ea82f46abd52d1932ae2e` (Goal086). Base imediata da implementação: `a72afaf8affcab6578c659b2f71023f4311b63d1`, HEAD da worktree `.ai-worktrees/goal-087`, inalterado nas três rodadas. Entre `f65b88a` e `a72afaf` há só documentação: o fechamento do Goal086 e a inserção deste Goal no plano.
- Snapshot aceito, calculado pelo IA Loop: **18 arquivos**, hash do diff `df90ea91d7ee01e83d6ccd857f95c5a896fdd04b2a0d624aba6a95772f475fdf`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os 18 arquivos, por `git diff --numstat a72afaf` no snapshot aceito:
  - Frontend de produção: `src/shared/styles/atendly.css` (+431/−197), `src/shared/layout/AppShell.tsx` (+86/−143), `src/features/dashboard/DashboardScreen.tsx` (+84/−102), `src/shared/layout/navigation.ts` (+27/−5), `src/shared/icons/Icon.tsx` (+9/−1), `public/icons/atendly-icons.svg` (+8, ícones de navegação) e `src/app/globals.css` (−1).
  - Gate autenticado, só por acréscimo: `e2e/authenticated-matrix.spec.ts` (+126, G-1 e G-2) e `e2e/measure.ts` (+115).
  - Testes: `tests/goal087-shell-navigation.test.tsx` (arquivo novo, **20** testes, provas 1 a 5) e asserções ajustadas em `goal018-dashboard-status` (+29/−16), `goal022-notifications-chrome` (+3/−3), `goal025-account-deletion-shell-banner` (+1/−1), `goal068-assinatura` (+3/−4) e `goal074-home` (+37). Nenhum teste foi removido ou pulado.
  - Documentos: `docs/migration/CURRENT_STATE.md`, `DECISIONS.md` (D-101) e `VALIDATION_GATE.md`.
- Nenhuma rota, contrato, migration, variável de ambiente, campo ou serviço mudou. `apps/bff/PUBLIC_API_V1.md`, o vault, `docs/design-reference/`, `e2e/visual/targets.json`, `KNOWN_*`, configurações de Playwright e Vitest, sementes e passos de `validate:*` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** O Tech Lead rodou `visual:compare -- --target H1` e abriu os quatro `side-by-side.png`, além de `prototype.png` e `app.png` em resolução cheia. A casca estava certa no essencial. Os blockers:
   1. "Esta semana" caía para o pé da coluna lateral no tablet e no desktop. Sem o cartão "Precisa da sua atenção", a grade `"hoje attention" "hoje semana"` dava a altura extra de "Hoje" à primeira linha. Medido em Chromium: `.week-card` com topo em 366 px, contra o topo de "Hoje" em 24 px.
   2. A sidebar do desktop derivava do quadro. O item ativo ficava em y=75–114 contra 70–108, o passo era de 41 px contra 40, e a conta subia cerca de 7 px por `min-height: 44px`.
   3. Sete devices das telas irmãs (A1, CL1, Servicos:S1, Conversas:C1) pioravam sem baseline e sem causa registradas.
2. **Rodada 2 — `CHANGES_REQUIRED`, 3 blockers.** Fechados: a grade da Home (`grid-template-rows: auto auto 1fr`, "Hoje" em `span 3`); o ritmo da sidebar (item ativo em y=70–107 nos dois, passo de 40 px); a barra do tablet de 72 para 81 px, com ícones de 24 px, que coincide em pixel com o quadro nas duas orientações; e as pioras das telas irmãs, com baseline, final e causa medida. Restaram:
   1. A conta do desktop ficava 6 px acima do quadro (avatar em y=715–744 contra 721–750), porque `.account-button` mantinha `min-height: 44px`.
   2. A barra do celular tinha 56 px. O quadro renderiza 99 px sem `box-sizing: border-box`; menos os 34 px do indicador de início, sobram 65 px. Faltavam 9 px além da divergência declarada.
   3. CURRENT_STATE, VALIDATION_GATE e D-101 citavam como execução final as corridas da rodada 1, anteriores à última edição de CSS. Também diziam que os controles do §6 eram posteriores a ela.
3. **Rodada 3 — `ACCEPTED`, 0 blocker.** O delta da rodada 2 para a 3 é só `atendly.css` e os três documentos; o Tech Lead conferiu o patch da rodada 2 contra o da 3. `.account-button` passou a `min-height: 32px` com `line-height: normal`. A barra do celular e o `padding-bottom` do `app-frame` passaram de 56 para 65 px mais `env(safe-area-inset-bottom)`. Os documentos foram reescritos sobre a execução da rodada 3.

## O que o Tech Lead conferiu na rodada 3

- `visual:compare -- --target H1` e os quatro `side-by-side.png`:
  - Desktop: avatar "CR", "Camila Reis" e "Studio Camila Reis" coincidem com o protótipo e não aparecem mais duplicados no painel de diferenças. A sidebar de 232 px, o logo, os itens e o item ativo são iguais ao quadro.
  - Celular: ícones e rótulos da barra com a mesma geometria do quadro. A única diferença na barra é o indicador de início (divergência 2).
  - Tablet em retrato e em paisagem: barra inferior de cinco itens centralizados, igual ao quadro, sem sidebar e sem cabeçalho.
  - O `a.fab` fica 7 px acima da barra no celular. É o que o protótipo mostra: em `Clientes.dc.html` e `Agenda.dc.html`, `bottom:106px` com barra de 99 px.
- `visual:compare` de A1, CL1, Servicos:S1, Conversas:C1 e M1. Os 20 números coincidem com os do Developer em CURRENT_STATE. A navegação segue o protótipo em cada faixa.
- Proveniência, em disco:
  - `mtime` de `atendly.css`: `2026-10-01T06:52:09Z`.
  - `e2e-results/authenticated/results.json`: `startTime` `2026-10-01T07:39:33.917Z`, **195** `expected`, **0** `unexpected`, **0** `flaky`.
  - `e2e-results/results.json`: uma corrida de `validate:ui` posterior à citada (`07:51:19Z`), com **169** `passed`, **21** `skipped`, **0** `unexpected` e **0** `flaky`. É consistente com a citada (`06:52:50.102Z`).
  - `sha256` de `AppShell.tsx`: `8fad2a06…33449`, igual ao declarado antes e depois de cada controle.
- `git status` só com os arquivos do snapshot, sem `e2e-results/`.

## Evidência final aceita

Os números estão em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal087) e em [VALIDATION_GATE](../VALIDATION_GATE.md).

- `visual:compare` do H1, final (mobile / tablet em retrato / tablet em paisagem / desktop): **11,8 / 5,5 / 4,8 / 4,2**, contra 12,3 / 5,4 / 5,5 / 4,8 na baseline. A porcentagem é tendência; a decisão veio da leitura dos `side-by-side.png`.
- Telas irmãs: de 24 medidas, 18 não pioraram e 6 pioraram, todas com causa medida e aceita:
  - Servicos:S1 nos dois tablets (4,7→5,3 e 4,7→4,8). O quadro S1 não tem barra inferior, e `/servicos` agora tem a barra do tablet, como todo o app. Tirar a barra deixaria a rota sem navegação e contradiz G-2.
  - A1, CL1 e C1 no celular (12,7→12,9; 10,9→11,0; 10,2→11,0). O conteúdo sobe 60 px sem o cabeçalho de marca, e o conteúdo próprio dessas telas ainda não segue os quadros. Com 60 px provisórios de `padding-top`, os três voltam à baseline ou abaixo dela.
  - H1 no tablet em retrato (5,4→5,5). Vem do conteúdo do estado da conta de teste, não da casca.
- Testes de frontend: **129** arquivos e **1359** testes passando, contra **128**/**1337** na baseline. `tsc --noEmit` e `lint` com exit 0.
- `test:gate`: **233**/**233**.
- `validate:ui` da rodada 3: **169** `passed`, **21** `skipped`, **0** `flaky`.
- Gate autenticado da rodada 3: **195** testes (**175** da baseline mais **20** de G-1 e G-2), **0** `unexpected`, **0** retentativas.
- Quatro controles negativos do §6, por edição real em `AppShell.tsx`, cada um reprovando `goal087-shell-navigation.test.tsx` e passando restaurado: 2, 1, 2 e 9 falhas em 20.

## Aceito sem prova completa

Os três documentos já declaram estes pontos.

1. **`validate:integration` não rodou inteiro na rodada 3.** O harness não provisiona os quatro bancos de teste. Só o passo do gate autenticado rodou, contra um PostgreSQL 18 descartável, e o Tech Lead conferiu o resultado em disco. Os outros 35 passos e o `validate:core` completo vêm da rodada 1. A edição de CSS das rodadas 2 e 3 não toca arquivo que essas suítes leem.
2. **Os controles negativos são da rodada 1**, anteriores às edições de CSS das rodadas 2 e 3. Eles exercitam `AppShell.tsx` em jsdom, que não lê CSS, e o hash do arquivo não mudou.
3. **O vermelho da baseline das provas 1 a 5 e de G-1** é da WU-01 à WU-03 da rodada 1 e não foi reexecutado.
4. **O estado "IA ativa" com "Pausar"** está provado em jsdom, não na imagem. A conta visual estava com o WhatsApp desconectado e a IA desligada.

## Divergências declaradas, aceitas

1. Notificações na sidebar do desktop, por (c) de D-101 e pelo item 4 de D-093.
2. No celular, os até 34 px do indicador de início do iPhone: a barra do app tem 65 px mais `env(safe-area-inset-bottom)`.
3. "Pausar" leva a Configurações › IA, em vez de abrir a folha H7.
4. Dados da conta de teste que não são layout: banner e cartão de WhatsApp desconectado, checklist "Ative sua IA", IA desligada no cartão da sidebar e a data.

## Observações registradas, sem mudar a decisão

1. **Valor do CL1 no celular.** A justificativa das pioras em CURRENT_STATE dizia "10,9→11,1", e o valor final listado e medido pelo Tech Lead é 11,0. O fechamento corrigiu o número.
2. **Código morto.** `showMobileHeader` em `ShellConfig`, e `attention` e `loading` em `ConversationThread`, ficaram sem uso (rodada 1). Sem efeito no comportamento.
3. **Contorno teal em S1 no tablet.** A linha sob o conteúdo curto é o outline de foco do `main`, anterior a este Goal.
4. **Cor do bloco por serviço na Home.** O compromisso do contrato não tem `colorToken`, então a barra lateral da agenda não segue a cor do quadro. É dado, não layout.
5. **Rodada 2.** A unidade FIX-001 terminou com `UNKNOWN_FATAL` depois de editar `atendly.css` e os documentos. O Tech Lead revisou a árvore resultante, e as rodadas seguintes partiram dela.
6. **Perfil de execução.** O Goal declarava `SONNET_HIGH`.

## O que o aceite não prova

- A conferência do §7 do Goal: a casca num celular e num tablet reais, com o indicador de início e o teclado aberto num formulário. **Não foi feita.**
- A fidelidade do conteúdo próprio das outras telas logadas (A1, CL1, S1, C1, M1). Elas só seguem o quadro na navegação.
- "IA sem conexão" no cartão da IA (R-06) e a casca sem unidade de viewport (R-10), que são do Goal085.
- Renderização fora das quatro dimensões do `visual:compare` e das cinco larguras do `validate:ui` e do gate autenticado.
