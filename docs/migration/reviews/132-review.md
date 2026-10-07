# Review formal — Goal 132

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, em review **DEEP**, conforme o [Goal132](../goals/132-a-previa-e-a-escolha-do-que-importar-no-onboarding-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 1 não teve blocker.

O resumo (2.I4) e a escolha do que importar (2.I5) da importação do onboarding ficam iguais aos quadros nos quatro devices e nas duas molduras (`/onboarding/importacao` e `/importacao`), salvo as divergências declaradas em D-146. O resumo tem só o título, o cartão com o número à esquerda do nome, a ordem do quadro (`SUMMARY_CATEGORY_ORDER`, local a estas duas telas), o selo decorativo dos horários com o texto oculto ", encontrados" e "Escolher o que importar" como ação de texto. A escolha tem a descrição do quadro, a caixa nativa de 24 px, os horários sem contagem, os tons da linha desmarcada e "Voltar" como ação de texto. Marcar, desmarcar, executar, a prévia obsoleta, os conflitos, a troca de conta e a soma não mudam. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-146](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `ada0875b651b9c180d31a3484e51df4df3b432af` (Goal131). Base imediata da implementação: `63bdee408cc262501a02fd307641650f43c21df6`, HEAD da worktree `.ai-worktrees/goal-132`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **12 arquivos** (9 rastreados e 3 novos não rastreados), hash do diff `7c011c62a71af056278ff779de01baf1aa53787359183236b6fe1a90e1129db7`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (2): `features/imports/ImportPreviewScreen.tsx` (só as fases `summary` e `select`) e `shared/styles/avenly-imports.css` (`.imports-summary*`, `.imports-choice-*` e `.imports-text-action`, escopadas por `:has(.imports-summary)`; saíram `.imports-select-rows` e `.imports-select-row*`);
  - `apps/frontend/tests/` (5): os novos `goal132-resumo.test.tsx` (26), `goal132-escolha.test.tsx` (40) e `goal132-alvos-captura.test.ts` (28), 94 testes, e os dois ajustados só na expressão do nome (`goal020-import-preview` e `goal061-import-async`, `/…/i`);
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (2.I4 sem passos e 2.I5 com um só `clickRole`, ambos com os dois `GET` fixos da sessão `visual-compare-import-ready`) e `scripts/tests/visual-responses.test.mjs` (59 testes);
  - `docs/migration/` (3, por acréscimo): D-146 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal132 em `VALIDATION_GATE.md`.
- `authenticated-matrix.spec.ts`, `labels.ts`, `ImportsLayout.tsx`, `ONBOARDING_ROUTES`, as sementes da captura e do gate, o BFF, os serviços e `tools/ia-loop/` não foram tocados. O documento do Goal132 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (o resumo), WU-02 (a escolha), WU-03 (os alvos 2.I4 e 2.I5 e os testes da captura), WU-04 (o `visual:compare`, as medidas, a regressão por `cmp` e os sete controles negativos, sem mudar arquivo versionado) e WU-14 (os registros) terminaram `COMPLETED`, assim como os gates WU-05 a WU-13 e WU-15, salvo a WU-09, pulada.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-146: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento.
2. `CURRENT_STATE.md`, delta do Goal132: o parágrafo "Aceite".
3. Este review.

`VALIDATION_GATE.md` não mudou no fechamento: os números da rodada 1 já estavam registrados pela WU-14 e conferem com os resultados do IA Loop.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal132), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal132) e em D-146.

- **Gates do IA Loop, rodada 1, na árvore aceita:** typecheck (WU-05), lint (WU-06), testes alvo (WU-07, 94 testes `goal132`), suíte do frontend (WU-08, 192 arquivos e 2603 testes), scripts do gate (WU-10, `test:gate` 292), `validate:core` (WU-11, 15 de 17 passos e 2 pulados), `validate:ui` (WU-12, 169 passed, 21 pulados, 0 retentativas), `validate:integration` (WU-13, 36 de 36 passos, gate autenticado com 305 passed e 0 retentativas) e `git diff --check` (WU-15), todos com saída 0. A WU-09 (`test:ia-loop`) foi pulada: o repositório não tem o script.
- **Controles negativos do Developer:** (a) a (g) na rodada 1 (WU-04), com duas formas em (f); cada mutação reprovou o teste indicado, foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código:** só as fases `summary` e `select` de `ImportPreviewScreen` mudaram. `SUMMARY_CATEGORY_ORDER` é local, e `CATEGORY_ORDER` fica intacto. `selectedCount`, `toggleCategory`, `handleExecute`, a prévia obsoleta, `ConflictsZone` e `ReplaceAccountZone` não mudaram de comportamento. O selo dos horários é `aria-hidden`, com o `sr-only` ", encontrados". A caixa é nativa, com `appearance: none`, 24 px, raio 7 px, borda de 1,5 px em `border-box` e foco visível. "Escolher o que importar" e "Voltar" são `button.imports-text-action` com `min-height: 24px`. Nada mais usa `.imports-select-*`, e `.is-split` continua para os conflitos. Os ajustes dos testes existentes só trocam a expressão do nome e não afrouxam asserção.
  - **`visual:compare` de 2.I4 e 2.I5:** refeito pelo Tech Lead (8 pares, saída 0), com os oito `side-by-side.png` abertos: 2.I4 em 13,7/8,4/8,6/6,9 % e 2.I5 em 12,5/7,9/7,5/6,0 % (mobile, tablet em retrato, tablet em paisagem, desktop). O cartão, as linhas, os números em Literata, a tipografia, as cores, as caixas, o primário e as ações de texto batem com o quadro nos quatro devices. O restante do diff são as divergências declaradas; a maior, a `ReplaceAccountZone` abaixo do rodapé, foi provada pelo experimento do Developer com a zona oculta (2.I4 em 1,8/0,8/1,5/1,1 %).
  - **`visual-responses.test.mjs`:** refeito pelo Tech Lead, 59 de 59.
  - **O rótulo do 2.I4:** "Preview da importação", e não "Resumo da importação" como o Goal escreveu. O desvio é justificado: é o `data-screen-label` do quadro, e com o texto do Goal o `visual:compare` não acha o quadro.

## Divergências aceitas

Declaradas pelo Goal ou por D-146, conferidas nas capturas:

1. As legendas "incluindo cancelamentos e faltas" e "segunda a sábado", que o contrato não traz; as linhas dos atendimentos anteriores e dos horários ficam mais baixas que no quadro.
2. A nota do resumo por IA no 2.I5, que não é verdade no app, trocada por "Voltar" como ação de texto.
3. "Importar 446 registros" no lugar de "Importar 440 registros": a soma inclui as regras de `AVAILABILITY`, como hoje.
4. `ConflictsZone` e `ReplaceAccountZone` abaixo do rodapé, que tiram o rodapé do pé da tela.
5. O chevron do topo, o preenchimento do segundo segmento da barra (`chapterFraction`), o "Sair" (D-104), a barra de status e o indicador de início do iPhone.

## Aceito sem prova completa

1. **A regressão de 2.I1, 2.I2, 2.I3, I1 e I2** não deu 20 de 20 byte a byte: de 8 a 10 `app.png` diferem a cada execução, e o conjunto muda entre execuções da mesma árvore. Cada diferença foi medida (7 a 77 px, nos arcos e nas bordas) e explicada como antialiasing não determinístico; o 2.I3 ficou idêntico. É a segunda via do critério 4.
2. **`authenticated-matrix.spec.ts`** foi lido por busca dirigida, não por inteiro (D-146, item 12).
3. **A altura renderizada das ações de texto** não foi medida em px; é garantida pelo CSS (`min-height: 24px` e `padding: 6px 0`), provado em jsdom.
4. **A borda da caixa desmarcada** (`#D6CEC2` sobre `#FFFDFA`, 1,54:1) fica abaixo de 3:1; é a do quadro e a de todos os campos do app, declarada em D-146.
5. **Os controles negativos** são os do Developer; o Tech Lead não os refez. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` e do `visual-responses.test.mjs`.
6. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Pendências não bloqueantes

Fora de `docs/migration/`, sem correção neste fechamento:

1. O comentário de `apps/frontend/src/shared/styles/avenly.css` (linha 5280) ainda cita `.imports-select-row`, que saiu.
2. As `notes` do 2.I4 em `apps/frontend/e2e/visual/targets.json` não citam a `ReplaceAccountZone` nem o chevron; D-146 e `CURRENT_STATE.md` citam.
