# Review formal — Goal 135

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal135](../goals/135-as-pendencias-e-a-confirmacao-da-importacao-do-onboarding-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 1 voltou com dois blockers de código e evidência, corrigidos na rodada 2; o review da rodada 2 pediu duas correções só de registro, aplicadas neste fechamento (seção "Registro aplicado no fechamento").

A tela parada da importação (2.I8) e a confirmação (2.I9) ficam iguais aos quadros nos quatro devices, nas duas molduras (`/onboarding/importacao` e `/importacao`, a mesma tela), salvo as divergências declaradas em D-149. Com a sessão `READY` ou `PARTIAL`, nada em execução e sem interrupção (`pendingView`), `ImportRunScreen` mostra "Importação quase concluída" como único `h1`, o cartão do sucesso, o painel das pendências com os itens em revisão lidos da rota de itens (motivo curto e ação por `reasonCode`, no máximo 5 linhas), a nota do painel com o efeito real da conclusão e o rodapé com "Concluir importação" e "Revisar pendências". "Concluir importação" abre a folha do 2.I9 (`Dialog` `sheet`, sem alteração em `Dialog.tsx`), com o texto do vault e o número em negrito; a folha envia `{acceptPending: true}`, como antes. "Corrigir" e "Nomear" abrem `ImportConflictsScreen` já na categoria do item, pela prop nova `initialCategory`. A única leitura nova é `listImportItems` com `status: "NEEDS_REVIEW"` e `limit: 5`; nenhuma mudança no BFF, no Scheduling, no contrato ou no banco. Decisão: [D-149](../DECISIONS.md), aceita neste fechamento; ela revê em parte D-147 só no que ela diz da tela parada.

## Escopo e identidade do diff

- Baseline aceita vigente: `0939249d6e38e6db8c4cf201f0ce7bfac1bd9dce` (Goal134). Base imediata da implementação: `2beee7b86d52f6d64883ef491bd374bfca4e121c`, HEAD da worktree `.ai-worktrees/goal-135`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **23 arquivos** (21 rastreados e 2 novos não rastreados), hash do diff `a89acabd2a1e9d4e53b0521a632b61178f750eeb8f0cb839bc9786fa45b6fa41`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (4): `features/imports/ImportRunScreen.tsx` (a tela parada, a leitura dos itens e a folha), `features/imports/ImportConflictsScreen.tsx` (só a prop `initialCategory`), `features/imports/labels.ts` (por acréscimo) e `shared/styles/avenly-imports.css` (classes `.imports-pending*` e `.imports-confirm*`, escopadas por `:has()` onde tocam a moldura, o `.overlay` e o `.bottom-sheet`);
  - `apps/frontend/tests/` (14): os novos `goal135-pendencias.test.tsx` (54) e `goal135-alvos-captura.test.ts` (28), 82 testes; os ajustados só no texto ou na forma que o Goal muda (`goal020-a11y`, `goal020-import-preview`, `goal020-import-run`, `goal020-imports-entry`, `goal020-reachability`, `goal020-shell-invariant`, `goal105-importacao`, `goal120-importacao-recusas` e `goal133-andamento`); e os ajustados só na lista de donos de `responses` (`goal132-alvos-captura`, `goal133-alvo-captura` e `goal134-alvo-captura`);
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (o 2.I8 sem passos e o 2.I9 com um `clickRole` em "Concluir importação", os dois com os mesmos quatro `GET` fixos da sessão `visual-compare-import-pending`) e `scripts/tests/visual-responses.test.mjs` (62 testes);
  - `docs/migration/` (3, por acréscimo): D-149 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal135 em `VALIDATION_GATE.md`.
- `Dialog.tsx`, `ImportsScreen.tsx`, `ImportDoneScreen.tsx`, `ImportHistoryCard.tsx`, `features/onboarding/`, `features/settings/`, `authenticated-matrix.spec.ts`, `ONBOARDING_ROUTES`, o contrato, o BFF, os serviços e `tools/ia-loop/` não foram tocados. O documento do Goal135 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 2 blockers.** WU-01 a WU-03 e WU-12 terminaram `COMPLETED`, assim como os gates WU-04 a WU-11 e WU-13. O Tech Lead refez o `visual:compare` do 2.I8 e do 2.I9 (2.I8 15,5 / 8,5 / 5,9 / 6,6 %, 2.I9 7,8 / 5,4 / 5,0 / 4,0 %), abriu os oito `side-by-side.png` e mediu por pixel:
   1. o cabeçalho do painel, "3 registros precisam de revisão", saía `#221E1A` no app contra `#7A4E0A` no quadro, nos quatro devices (os pixels `#7A4E0A` da página caíam de 548 no quadro para 244 no app), porque `avenly.css` dá `color: var(--fg)` a todo `h2` e `.imports-pending-head h2` não declarava cor; os registros davam o par de 6,14:1 como aplicado;
   2. as `notes` do 2.I9 em `targets.json` diziam que o fundo sob o véu era a tela do 2.I8 "como no quadro", mas o quadro desenha só o título e o cartão do sucesso, com o círculo sem o visto; a divergência não estava declarada.
2. **Rodada 2 — `ACCEPTED`.** FIX-001: `color: inherit` em `.imports-pending-head h2`; o trecho das `notes` do 2.I9 virou divergência declarada, também em D-149 e em `VALIDATION_GATE.md`, com um teste novo em `goal135-alvos-captura.test.ts`; o `visual:compare`, a regressão dos 36 `app.png` e os dez controles negativos refeitos depois da última edição de código. Os gates WU-04 a WU-11 e WU-13 rodaram de novo sobre a árvore final, todos com saída 0. O review da rodada 2 confirmou os dois blockers resolvidos e encontrou só dois de registro (os números da rodada 2 ausentes de `VALIDATION_GATE.md` e de `CURRENT_STATE.md`, e a frase "Não houve DIAG, FIX nem segunda rodada"), adiados para este fechamento.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `VALIDATION_GATE.md`, seção do Goal135 (correção adiada 1): a tabela de "Contagens" ganhou a coluna "Resultado (rodada 2, IA Loop)", com o resultado de cada gate da rodada 2; a frase "Não houve DIAG, FIX nem segunda rodada…" deu lugar ao registro da segunda rodada e do `codeFingerprint` da árvore final; o parágrafo "Testes e checagens desta rodada" passou a remeter aos gates da rodada 2; e a introdução da seção passou a citar os gates entre o que a rodada 2 substitui.
2. `CURRENT_STATE.md`, delta do Goal135 (correção adiada 2): os números da rodada 2 no parágrafo "Rodada 2 (FIX-001)", e "Números da rodada 1" marcado como substituído por eles; além disso, o status no título, a introdução do delta e o parágrafo "Aceite".
3. `DECISIONS.md`, D-149: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com os números da árvore final (a "Prova" da proposta traz os da rodada 1).
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal135), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal135) e em D-149.

- **Gates do IA Loop, rodada 2, na árvore aceita** (`codeFingerprint` `code-v1:b1fec155ce0cf76a8107f39d0c57839fec9c8b00cd7273c115436c7acda01e9a` em todos, `attemptId` `a1`, sem retentativa do harness): typecheck (WU-04, saída 0), lint (WU-05, saída 0), testes alvo (WU-06, 82 testes `goal135` em 2 arquivos), suíte do frontend (WU-07, 198 arquivos e 2819 testes), scripts do gate (WU-08, `test:gate` 295), `validate:core` (WU-09, saída 0, 15 de 17 passos e 2 pulados), `validate:ui` (WU-10, 169 passed, 21 pulados, 0 retentativas), `validate:integration` (WU-11, 36 de 36 passos, gate autenticado com 305 passed e 0 retentativas) e `git diff --check` (WU-13, saída 0).
- **Controles negativos do Developer:** (a) a (j), na rodada 1 (WU-03) e de novo na rodada 2, depois da última edição de código, com (h) e (i) reprovando pelos dois testes; cada mutação reprovou o teste indicado, foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código:** a única leitura nova é `listImportItems` com `NEEDS_REVIEW`, limite 5 e `AbortController`; `runComplete`, `settleCompleted`, `retryPending`, a chave por corpo, o guarda e a reação a `IMPORT_PENDING_ACCEPTANCE_REQUIRED` não mudaram; `ImportConflictsScreen` só ganhou `initialCategory`; os testes ajustados não afrouxam asserção de pedido, corpo ou chave. Na rodada 2, o código mudou só em uma propriedade de CSS, um trecho de `notes` e um teste.
  - **`visual:compare` do 2.I8 e do 2.I9:** refeito pelo Tech Lead nas duas rodadas (saída 0), com os oito `side-by-side.png` abertos. Na árvore final: 2.I8 15,4 / 8,5 / 5,8 / 6,6 % e 2.I9 7,8 / 5,4 / 5,0 / 4,0 % (mobile, tablet em retrato, tablet em paisagem, desktop). Os pixels `#7A4E0A` do 2.I8 contam 548 no quadro e 549 no app, nos quatro devices. Estrutura, cartão do sucesso, painel, linhas, ações, nota, botões (52 e 54 px, `#0F5F63` e `#F7F4EF`, borda `#D6CEC2`), a folha do mobile e o diálogo do tablet e do desktop batem com o quadro; o restante são as divergências declaradas.
  - **Testes reexecutados:** `goal135` (82 de 82) e `visual-responses.test.mjs` (62 de 62), na rodada 2.

## Divergências aceitas

Declaradas pelo Goal ou por D-149, conferidas nas capturas:

1. A nota do 2.I8 e o fim do texto do 2.I9 com o texto do vault e o efeito real da conclusão (o que está em revisão não entra), no lugar de "você pode corrigir depois, em Serviços e Clientes"; por isso a folha do mobile tem uma linha a menos (23 px).
2. "1.843 registros" no lugar de "1.840", e o `label` do cliente sem nome com a forma do Scheduling.
3. As linhas de falha e de pendentes, o cabeçalho "ainda não entraram", "Mais N em Revisar pendências." e a nota de falha da leitura, que o quadro não desenha.
4. `ReplaceAccountZone` abaixo do rodapé, que sobe "Concluir importação" e "Revisar pendências" do 2.I8 (69, 138, 32 e 51 px); com a zona escondida só para a prova, os botões caem exatamente no quadro.
5. O fundo sob o véu do 2.I9 é a tela inteira do 2.I8; o quadro desenha só o título e o cartão do sucesso, com o círculo sem o visto.
6. O chevron (D-145), o preenchimento dos segmentos da barra do topo e o "Sair" (D-104), o estado do item "Sua agenda" na sidebar, a barra de status e o indicador de início do iPhone; sem as animações de entrada na captura (`reducedMotion: "reduce"`); a sidebar do tablet paisagem e do desktop 1 px mais baixa.

## Aceito sem prova completa

1. **O alvo de toque das ações de texto "Corrigir" e "Nomear"** vem só da regra de CSS (`padding: 13px 0; margin: -13px 0`): não foi medido em px à parte, e nenhum teste do jsdom lê o CSS dele. Os botões do rodapé e da folha estão medidos (52 e 54 px).
2. **A regressão dos 36 `app.png`** não deu 36 de 36 byte a byte, pela captura não determinística: na rodada 2, 18 iguais por `cmp` e 18 dentro do ruído medido entre as três capturas da baseline, 0 fora (segunda via do critério 4, com tabela por imagem na rodada 1).
3. **A tela parada com `failed` ou `pending`, a falha da leitura dos itens e a confirmação** só são provadas em jsdom: a captura mostra o estado do quadro, e o gate autenticado não alcança a tela.
4. **A borda de "Revisar pendências" e de "Voltar e revisar"** (`#D6CEC2`) mede 1,42:1 e 1,54:1, abaixo de 3:1; é a cor do quadro, declarada em D-149, e o rótulo do botão tem contraste próprio.
5. **`authenticated-matrix.spec.ts`** foi lido por busca dirigida (zero ocorrências nos sete termos), não por inteiro. A WU-01 não enumerou os `GET` do navegador da captura.
6. **Os controles negativos** são os do Developer; o Tech Lead não os refez. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` e dos testes listados acima.
7. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Pendências não bloqueantes

Nenhuma além do que fica sem prova completa acima.
