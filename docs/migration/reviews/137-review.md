# Review formal — Goal 137

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal137](../goals/137-os-conflitos-da-importacao-do-onboarding-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review `DEEP`, sem blocker; nenhuma correção de registro ficou para o fechamento.

A tela de conflitos da importação fica como o quadro 2.I6, em `/onboarding/importacao` e em `/importacao`, pelas duas entradas (a prévia e a tela parada). A lista de categorias e a tela por categoria dão lugar a uma lista única de cartões, um aberto por vez. A decisão sai no próprio cartão, sobre o cadastro que a análise sugeriu (`candidates` e `proposedService`, de D-150), sem identificador digitado. O alvo 2.I6 entra em `targets.json` (100 alvos). Só frontend: nenhuma rota, contrato, BFF, Scheduling ou banco mudou. Decisão: [D-151](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `b119baf455e26ef683e19cfd5124c16e6595366b` (Goal136). Base imediata da implementação: `1cb2f325baf06b807d50f3f65bbbedb1e27272d9`, HEAD da worktree `.ai-worktrees/goal-137`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **25 arquivos** (23 rastreados e 2 novos não rastreados), hash do diff `5a54175ca508ce8ebdabb3f58dd4f7d44b5035515d6d9c15b54a400e61cd8318`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - tela (6): `apps/frontend/src/features/imports/ImportConflictsScreen.tsx` (reescrita), `ImportPreviewScreen.tsx` e `ImportRunScreen.tsx` (só `readyCount`), `labels.ts`, `apps/frontend/src/shared/styles/avenly-imports.css` e `apps/frontend/e2e/visual/targets.json` (o alvo 2.I6);
  - testes novos (2): `apps/frontend/tests/goal137-conflitos.test.tsx` (63) e `goal137-alvo-captura.test.ts` (15);
  - testes ajustados (14): `goal020-a11y`, `goal020-import-conflicts`, `goal020-import-run`, `goal020-reachability`, `goal020-shell-invariant`, `goal062-import`, `goal120-importacao-recusas`, `goal133-andamento` e `goal135-pendencias` (a tela), `goal132-alvos-captura`, `goal133-alvo-captura`, `goal134-alvo-captura` e `goal135-alvos-captura` (a lista de donos de `responses`) e `scripts/tests/visual-responses.test.mjs`;
  - `docs/migration/` (3, por acréscimo): D-151 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal137 em `VALIDATION_GATE.md`.
- O Scheduling, o BFF, `packages/public-api-contract/`, `apps/frontend/e2e/authenticated-matrix.spec.ts`, `tools/ia-loop/` e o documento do Goal137 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 a WU-03 e WU-12 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-04 a WU-11 e WU-13 rodaram uma vez cada, todos com saída 0 e o mesmo `codeFingerprint` (`code-v1:1145e3bf01d52121d824bdf991bf6ed97d23a5b63784eb877f47949821c62045`). Os 13 itens numerados do Goal têm trabalho correspondente no diff.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-151: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, as duas observações não bloqueantes e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal137: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal137: o registro do aceite na rodada 1, e a linha de `git diff --check` ganhou o resultado da WU-13 do IA Loop (saída 0), que a WU-12 dava como futura.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal137), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal137) e em D-151.

- **Gates do IA Loop, rodada 1, na árvore aceita** (`attemptId` `a1` em todos, sem retentativa do harness): typecheck (WU-04) e lint (WU-05) do frontend com saída 0; `goal137` 2 arquivos e 78 testes (WU-06); frontend 200 arquivos e 2897 testes (WU-07; a baseline é 198 e 2819, +2 arquivos e +78 testes); `test:gate` 296 (WU-08); `validate:core` com saída 0, 15 de 17 passos e 2 pulados (WU-09); `validate:ui` 169 passed, 21 pulados, 0 retentativas (WU-10); `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado com 305 passed e 0 retentativas (WU-11); `git diff --check` com saída 0 (WU-13).
- **Do Developer:** `visual-responses.test.mjs` 63; o `visual:compare` do 2.I6 com as medidas por DOM iguais ao quadro em x, largura e altura nos quatro devices (topo até 0,4 px); a regressão dos 44 `app.png` de 11 alvos contra três capturas da baseline.
- **Controles negativos do Developer:** (a) a (j), na WU-03, depois da última edição de código, cada um reprovando o teste indicado com a mensagem registrada e revertido com `cmp` igual ao backup.
- **Conferência do Tech Lead:**
  - **Fidelidade visual:** `visual:compare --target 2.I6` rodado de novo (saída 0; 4,5 / 1,5 / 1,8 / 1,9 %, mobile, tablet retrato, tablet paisagem e desktop) e os quatro `side-by-side.png` abertos. Estrutura, peças, botões, cartão fechado, "Continuar" e nota alinham com o quadro. As diferenças restantes estão todas declaradas: cartão do serviço aberto e sem decisão, com botões, "Não importar este item" e peças neutras; ordem dos cartões e cliente fechado; "1.843" no lugar de "1.837"; chevron, "Sair" e barra do topo (D-104, D-145).
  - **Regressão:** 2.I1 e 2.I7 rodados de novo e comparados com as três capturas da baseline. I1 desktop, I1 mobile e I7 mobile iguais por `cmp` a uma captura; I7 nos outros devices só Δ1. I1 tablet retrato (19 px, Δ14) e tablet paisagem (15 px, Δ35), com o recorte ampliado: antialiasing do canto e do visto, visualmente idêntico. A própria baseline varia 135 px, Δ87, no mesmo `app.png`. Aceito como ruído, como o registro declara.
  - **Tela:** uma leitura por categoria com `AbortController`; falha parcial com `role="alert"` e falha total com o `StatePanel`; título fixo enquanto a tela está aberta; um cartão aberto por vez, e o decidido fica na lista com `role="status"`; `KEEP_EXISTING` e `MERGE_WITH_EXISTING` com o `targetInternalId` do candidato, `CREATE_NEW`, `INCLUDE` e `EXCLUDE` sem alvo; guarda de envio, chave nova por pedido e `IMPORT_ITEM_ALREADY_DECIDED` preservados.
  - **Textos e CSS:** `labels.ts` só por acréscimo, mais a remoção prevista de `DECISION_LABELS`, `decisionsForCategory` e `decisionRequiresTarget`; `readyCount` nas duas entradas. CSS escopado por `.imports-conflicts` e `:has()`; as classes antigas removidas não têm uso.
  - **Testes ajustados:** só forma e texto. As asserções de pedido, erro, `IMPORT_ITEM_ALREADY_DECIDED` e grade dos horários ficaram.
  - **Gates:** as saídas brutas das WU conferidas contra o `VALIDATION_GATE` (frontend 200 e 2897, `test:gate` 296, `validate:ui` 169 passed, 21 pulados e 0 retentativas, gate autenticado 305 e 0 retentativas). Os controles negativos estão registrados com a mensagem exata, e a ressalva do (d) está declarada.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-03); o Tech Lead não os refez.
2. **A decisão enviada a um Scheduling real** a partir da tela nova: a captura não grava, e a prova do envio é em jsdom contra a rota simulada. A rota não mudou e tem a suíte de integração do Goal136.
3. **A altura em px da ação de texto** "Não importar este item": vem da regra de CSS, sem medida à parte; o jsdom não faz layout, e o gate autenticado não alcança a tela.
4. **A tela com `CUSTOMER_PHONE_SHARED` em revisão:** o Scheduling não põe esse motivo em revisão hoje.
5. **As contagens por passo** dentro de `validate:core` e `validate:integration` não foram guardadas pelo IA Loop; vale a saída 0. As contagens do Scheduling são as do Goal136.

## Pendências não bloqueantes

1. **`ReplaceAccountZone` nas `notes` do 2.I6.** As `notes` do alvo em `targets.json`, afirmadas por `goal137-alvo-captura.test.ts`, declaram a zona abaixo do rodapé. No modo de conflitos, `ImportPreviewScreen` devolve só `ImportConflictsScreen`, e a zona não aparece. É uma divergência inexistente; remover das `notes` e do teste numa passada futura.
2. **"Carregar mais" depois de `IMPORT_ITEM_ALREADY_DECIDED`.** Nesse caso `settle` não incrementa `decidedSince`, então "Carregar mais" pode aparecer sem item restante. Um clique lê uma página vazia e o botão some. Efeito inócuo.
3. **Fora deste Goal, com Goal e decisão próprios:** `CUSTOMER_PHONE_SHARED` em revisão com candidato (D-151, item 14; pergunta 793 do vault); a deduplicação da duplicata idêntica e "usar os valores da Minha Agenda" num serviço existente (D-150, item 8); os valores malformados da origem (review136, pendência 1); os 13 quadros ainda sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3).
