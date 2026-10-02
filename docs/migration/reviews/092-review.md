# Review formal — Goal 092

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-02, em review DEEP, conforme o [Goal092](../goals/092-agenda-dia-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

O Goal leva `/agenda` em Dia ao quadro A1 do protótipo: barra comum de mês e ano nas três visualizações, um só botão de criar (flutuante abaixo de 1024 px, "Novo" na barra a partir dele), "Exceção do dia" dentro do menu de criar, saída do cartão "Próximo agendamento", Dia como lista cronológica com a cor do serviço lida do catálogo, e visualização padrão sem mudança. A decisão é [D-108](../DECISIONS.md), aceita neste fechamento. Ela revisa o item 3 inteiro e a última frase do item 2 de D-089, sem reescrevê-la.

## Escopo e identidade do diff

- Baseline aceita vigente: `640a02551aa1ef9e13cc12c9b082e769f084826d` (Goal091). Base imediata da implementação: `a560b67b27708ae7aefc03194cfe6777421d969c`, HEAD da worktree `.ai-worktrees/goal-092`, sem commit na worktree. Entre as duas há só documentação (`7cc1456` e `a560b67`).
- Snapshot aceito, calculado pelo IA Loop: **12 arquivos**, hash do diff `a27b5989978cdc59058e9877f96e636a01621ab1c13142e524b30706cc710586`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git diff --numstat a560b67` no snapshot aceito (antes dos documentos de fechamento):
  - Produção, em `apps/frontend/`: `src/features/agenda/AgendaBoard.tsx` (+73/−98), `src/features/agenda/DayView.tsx` (+378/−102), `src/features/agenda/occupancy.ts` (+21/−22), `src/shared/styles/atendly-agenda.css` (+464/−174).
  - Testes: `tests/goal092-agenda-dia.test.tsx` (novo, 608 linhas, **18** testes) e asserções ajustadas em `goal016-agenda-reachability` (+8/−1), `goal016-agenda-views` (+40/−29), `goal069-agenda-structure` (+14/−4) e `goal069-agenda-views` (+36/−19). Nenhum teste removido ou pulado.
  - Documentos: `docs/migration/DECISIONS.md` (D-108), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- `timeGrid.ts`, `WeekView.tsx`, `MonthView.tsx`, ícones, `e2e/routes.ts`, `e2e/visual/targets.json`, rota, contrato, BFF, migration, campo e variável não mudaram.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 5 blockers.** A estrutura do Dia seguia o A1 nos quatro devices (`visual:compare -- --target A1`, 10,4 / 4,8 / 5,4 / 4,3, com os quatro `side-by-side.png` abertos). Blockers: (1) `priceLabel` trocava o U+00A0 depois de "R$" por espaço comum, e "R$ 50" quebrava em duas linhas em paisagem e desktop; (2) a observação dizia só "presença confirmada", e não "presença confirmada pelo lembrete"; (3) abaixo de 1024 px o botão flutuante (106 a 162 px da base) cobria a ponta direita da última linha com a página rolada até o fim; (4) a linha de exceção tinha perdido o motivo, e a asserção `getByText("Feriado local")` de `goal016-agenda-views.test.tsx` tinha sido apagada sem depender da grade; (5) documentos sem a coluna "Início" do `visual:compare` (medida pela WU-01), sem o resultado de `validate:integration` (WU-10, exit 0, 554 s) e com "Intervalo · N min" divergente do código.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** Uma unidade de correção (FIX-001) mudou `DayView.tsx`, o CSS, `goal016-agenda-views.test.tsx`, `goal092-agenda-dia.test.tsx` e os três documentos. Os cinco blockers estão resolvidos; os oito gates do IA Loop passaram.

O perfil do Developer foi `SONNET_HIGH` na rodada 1 e `SONNET_MEDIUM` na rodada 2. O Goal declara `SONNET_HIGH`.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal092), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal092) e na "Prova" de D-108.

- **Fidelidade visual, conferida pelo Tech Lead.** `visual:compare -- --target A1`, exit 0, 10,4 / 4,8 / 5,4 / 4,3 na rodada 2. Nos quatro devices: barra mês/ano em Literata, ‹ › redondos, segmentado, faixa da semana, "Hoje, sexta 2" e "5 atendimentos · 1 bloqueio", lista com traço da cor do serviço (dividido em Juliana), Concluído com ✓, Não compareceu em vermelho, bloqueio hachurado, compromisso sem traço e marca 13:45; botão flutuante abaixo de 1024 px e "Novo" com o painel "Selecione um atendimento para ver os detalhes" a partir dele. "R$ 50" não quebra mais entre "R$" e o valor. Restam só as divergências declaradas de D-108.
- **Blockers conferidos no código.** `priceLabel` mantém o U+00A0, e o teste o afirma (conferido por bytes). Observação com o texto do quadro, testada com `presenceConfirmedAt` e ausente em Concluído e Não compareceu. `.agenda-page` com `padding-bottom` de 120 px mais a área segura abaixo de 1024 px, regra posterior à de 767 px; `.agenda-page` só é usada em `AgendaBoard`. Linha de exceção com `detail`, asserção "Feriado local" de volta.
- **Reexecução pelo Tech Lead.** `goal092-agenda-dia` e `goal016-agenda-views`: **30**/**30**. Rodada 1: as seis suítes de Agenda, **66**/**66**.
- **Identidade do código aceito.** `sha256` na árvore aceita igual ao de VALIDATION_GATE: `AgendaBoard.tsx` `f88af80e…fb544571`, `DayView.tsx` `4ea17411…471f2d00`, `occupancy.ts` `b5772f36…81dc6547`, `atendly-agenda.css` `0ce459e0…b179be8d`, teste novo `69ab7d2f…19370e73`.
- **Execução final do Developer (rodada 2).** Lint e typecheck exit 0; seis suítes de Agenda **68**/**68**; `validate:core` exit 0 (`test:frontend` **137** arquivos, **1501** testes); `validate:ui` exit 0, **166** `expected`, **21** `skipped`, **3** `flaky`; `validate:integration` exit 0, **36**/**36** passos, 579 s, com o gate autenticado em **245** `expected`, **0** `flaky`.
- **Vermelho contra a baseline (WU-03, rodada 1).** Com os quatro arquivos de produção da baseline: **12** dos **16** testes reprovam e **4** passam, declarados um a um.
- **Escopo.** `git status` só com os 12 arquivos autorizados.

## Aceito sem prova completa

1. **Controles negativos da rodada 1.** O §6 pede controles depois da última edição de código; os quatro são da rodada 1 (WU-11), e a rodada 2 editou `DayView.tsx` e o CSS. Nenhum dos quatro pontos controlados mudou na rodada 2.
2. **`validate:ui` com 3 `flaky`.** O critério 5 pede **0** retentativas. Os três são rotas públicas fora da Agenda (`recuperar-senha` em mobile-360 e mobile-390, `criar-conta` em tablet-768), que passaram na repetição; na rodada 1 a mesma execução deu **0** `flaky`.
3. **`test:gate` não aparece como execução separada na rodada 2.** Na rodada 1 deu **233**/**233**.
4. **O vermelho contra a baseline e os controles negativos não foram reexecutados pelo Tech Lead**; conferidos por registro e `sha256`. Os dois testes acrescentados na rodada 2 não foram rodados contra a baseline.
5. **Folga sob o botão flutuante** (última linha 23 px acima dele) é conta sobre os valores do CSS, não medida numa captura rolada.

## Observações registradas, sem mudar a decisão

1. **"Não feito" de VALIDATION_GATE.** O texto proposto ainda listava a coluna "Início" e a saída global de `validate:integration` como não feitas, contradizendo a mesma seção. Corrigido no fechamento, junto com o registro do vermelho da WU-03.
2. **Intervalo antes do atendimento.** O intervalo anterior ao atendimento deixou de ser listado; a escolha está declarada em D-108 (e).
3. **D-089.** Ganhou no fechamento uma linha apontando os trechos revistos por D-108.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- O corpo da Semana e do Mês (A10, A11), do Goal100; a barra comum, se o Goal100 a mudar, reabre D-108 (a).
- O hold "Em confirmação" e o lembrete sem resposta na lista, e o menu de criar como sheet (A4).
