# Review formal — Goal 133

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal133](../goals/133-o-progresso-da-importacao-do-onboarding-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 1 não teve blocker.

O andamento da importação do onboarding (2.I7) fica igual ao quadro nos quatro devices e nas duas molduras (`/onboarding/importacao` e `/importacao`), salvo as divergências declaradas em D-147. `ImportRunScreen` usa `ImportRunningBody` só com `EXECUTING` sem `interrupted` (ou com `retrying`): título "Importando…", "Leva alguns minutos.", o número grande dos processados com "de N registros", a barra de 8 px que continua sendo o `role="progressbar"`, a lista por categoria na ordem da execução com o estado lido só das contagens, os horários sem número e "Revisar itens" como ação de texto. A tela parada, a releitura de 3 s, a retomada, a conclusão, os conflitos e a troca de conta não mudam. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-147](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `94e949dbef1abe8f0bc89351be7a9ed8b30ebfaf` (Goal132). Base imediata da implementação: `f73e52132076cdc0fa6fee6136a5100c4d12baee`, HEAD da worktree `.ai-worktrees/goal-133`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **12 arquivos** (10 rastreados e 2 novos não rastreados), hash do diff `6efe20244d4ef106c985a4b9f24d09fd3a204e486299f78cc7a115e431a2ec67`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (3): `features/imports/ImportRunScreen.tsx` (só a tela em andamento), `shared/styles/avenly-imports.css` (classes novas `.imports-running*`, no fim do arquivo, escopadas por `:has(.imports-running)` onde tocam a moldura) e `shared/styles/avenly.css` (só o texto de um comentário, que deixou de citar `.imports-select-row`);
  - `apps/frontend/tests/` (4): os novos `goal133-andamento.test.tsx` (66) e `goal133-alvo-captura.test.ts` (16), 82 testes, e os dois ajustados só no texto ou na lista (`goal061-import-async`, o título "Importando…"; `goal132-alvos-captura`, o 2.I7 entre os donos de `responses`);
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (o 2.I7 sem passos, com os dois `GET` fixos da sessão `visual-compare-import-executing`, e as `notes` do 2.I4) e `scripts/tests/visual-responses.test.mjs` (60 testes);
  - `docs/migration/` (3, por acréscimo): D-147 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal133 em `VALIDATION_GATE.md`.
- `authenticated-matrix.spec.ts`, `labels.ts`, `ImportsLayout.tsx`, `ONBOARDING_ROUTES`, as sementes da captura e do gate, o BFF, os serviços e `tools/ia-loop/` não foram tocados. O documento do Goal133 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (a tela em andamento e os testes dela), WU-02 (o alvo 2.I7, os testes da captura e as duas pendências do review132), WU-03 (o `visual:compare`, as medidas, a correção de `line-height`, a regressão e os nove controles negativos) e WU-12 (os registros) terminaram `COMPLETED`, assim como os gates WU-04 a WU-11 e WU-13. Nenhuma WU foi pulada.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-147: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento.
2. `CURRENT_STATE.md`, delta do Goal133: o status no título e o parágrafo "Aceite".
3. Este review.

`VALIDATION_GATE.md` não mudou no fechamento: os números da rodada 1 já estavam registrados pela WU-12 e conferem com os resultados do IA Loop.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal133), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal133) e em D-147.

- **Gates do IA Loop, rodada 1, na árvore aceita:** typecheck (WU-04), lint (WU-05), testes alvo (WU-06, 82 testes `goal133` em 2 arquivos), suíte do frontend (WU-07, 194 arquivos e 2685 testes), scripts do gate (WU-08, `test:gate` 293), `validate:core` (WU-09, 15 de 17 passos e 2 pulados), `validate:ui` (WU-10, 169 passed, 21 pulados, 0 retentativas), `validate:integration` (WU-11, 36 de 36 passos, gate autenticado com 305 passed e 0 retentativas) e `git diff --check` (WU-13), todos com saída 0 e na primeira tentativa.
- **Controles negativos do Developer:** (a) a (i) na rodada 1 (WU-03), depois da última edição de código, com (g) reprovando pelos dois testes e (h) em duas formas; cada mutação reprovou o teste indicado, foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código:** `ImportRunningBody` só entra com execução em andamento e não `interrupted`; a tela parada, a releitura de 3 s, `retryPending`, `runComplete` e a idempotência ficam intactos. O total vem de `totalOf` (inclui `AVAILABILITY`). O `progressbar` mantém os mesmos `aria-*`, e o resumo `aria-live` fica em `sr-only`. O estado de cada linha sai só das contagens. O CSS é todo `.imports-running*` ou escopado por `:has(.imports-running)`, e o movimento só existe com `prefers-reduced-motion: no-preference`.
  - **`targets.json`:** o 2.I7 só declara os dois `GET`, sem passo, com o andamento coerente com `CATEGORY_ORDER`.
  - **`visual:compare` do 2.I7:** refeito pelo Tech Lead (saída 0), com os quatro `side-by-side.png` abertos: 3,7 / 1,6 / 2,0 / 1,5 % (mobile, tablet em retrato, tablet em paisagem, desktop). Estrutura, componentes, cores, tipografia e espaçamentos batem com o quadro; o restante são as divergências declaradas.
  - **Varredura de pixel própria:** a barra de 8 px com o topo em 215 px no mobile e 255 px no tablet e no desktop, com 8 px de altura no app e no quadro; os círculos de 24 px e as divisórias no mesmo passo de 49 px; a barra de 4 px a 38 px do topo da linha em andamento nos dois; diferença de 0 px.
  - **Regressão:** as capturas atuais contra a primeira captura da baseline (`cap1`) diferem em 9 de 28 `app.png`, com no máximo 77 pixels e delta de até 5 por canal (35 no 2.I1, que a baseline já mostra); as duas capturas da baseline diferem entre si em 8 de 28, no mesmo ruído. O Developer registrou 14 de 28 nas suas duas capturas depois das edições, também dentro desse ruído.

## Divergências aceitas

Declaradas pelo Goal ou por D-147, conferidas nas capturas:

1. Os horários em terceiro e concluídos, sem número, no lugar de por último e na fila; a linha na fila não aparece na captura, e a linha em andamento fica 49 px mais baixa que no quadro.
2. "1.210" e "de 1.846 registros" no lugar de "1.204" e "de 1.840": o total inclui as regras de `AVAILABILITY`, como hoje.
3. "Leva alguns minutos." sem "Fique nesta tela até terminar.", que não é verdade no app.
4. A barra de 4 px a 764/1.400, sem a animação `at-grow2`.
5. A legenda de decisão e de falha entre o nome e a barra, posição escolhida pelo Developer.
6. `ReplaceAccountZone` abaixo da lista.
7. O chevron do topo, o preenchimento do segundo segmento da barra (`chapterFraction`), o "Sair" (D-104), a barra de status e o indicador de início do iPhone.

## Aceito sem prova completa

1. **A regressão de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, I1 e I2** não deu 28 de 28 byte a byte; o critério 4 fica atendido pela segunda via (cada diferença dentro do ruído das duas capturas da baseline). O relatório da WU-03 resume as diferenças pelo máximo e não tem tabela por imagem.
2. **A altura renderizada de "Revisar itens"** não foi medida em px: a resposta fixa tem `needsReview` 0, e o gate autenticado não alcança a tela em andamento. É garantida pelo CSS (`min-height: 24px`), provado em jsdom.
3. **A linha na fila** só é provada em jsdom: a ordem da execução e a resposta fixa não a produzem na captura.
4. **A borda do círculo na fila** (`#D6CEC2` sobre `#F7F4EF`, 1,42:1) fica abaixo de 3:1; é a do quadro, e o estado não depende dela (nome em `#716859` e texto oculto ", na fila"), declarada em D-147.
5. **`authenticated-matrix.spec.ts`** foi lido por busca dirigida, não por inteiro.
6. **Os controles negativos** são os do Developer; o Tech Lead não os refez. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare`, da varredura de pixel e da regressão.
7. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Pendências não bloqueantes

1. As mensagens exatas dos controles (c) e (f) não estão transcritas em `VALIDATION_GATE.md` (em (c), o relatório da WU-03 nomeia os testes, e não a asserção). Os testes comparam "1.210", "1.846" e `aria-valuenow` 1210, então a reprovação é determinística.

As duas pendências do review132 (o comentário de `avenly.css` e as `notes` do 2.I4) foram resolvidas neste Goal.
