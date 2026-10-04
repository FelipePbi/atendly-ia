# Review formal — Goal 072

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-30, em review DEEP, conforme o [Goal072](../goals/072-onboarding-fiel-ao-prototipo-moldura-negocio-e-agenda.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–071, 073–078) foi reaberto, reavaliado ou revertido. **Quatro rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 3 blockers, as rodadas 2 e 3 `CHANGES_REQUIRED` com 1 blocker cada, e a rodada 4 terminou com zero. O único defeito de código achado no review ficou fora do onboarding: o sprite de ícones com XML inválido, que nenhum gate detectou.

O Goal corrige **QA O-07, O-10/O-23, O-11, O-12, O-13, O-25, O-27, O-29 e O-32** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e as observações 1 e 2 do [review066](066-review.md) e 4 do [review065](065-review.md). O "Voltar" sai do rodapé e vira um chevron no topo. O progresso vira barra segmentada abaixo de 768 px e trilho "Configuração inicial" a partir de 768 px. O botão principal ocupa a largura da coluna. A seleção fica tonal com ✓, sem título dentro de controle. A duração anda de 5 em 5 minutos, o preço ganha máscara sem mudar o valor gravado, os dias viram sete pílulas com resumo, e as horas ganham o intervalo em texto e uma barra decorativa. A etapa `importacao` sem `calendarSource` volta a `sistema-atual`. Decisão: [D-094](../DECISIONS.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `79d2133bc1be5eae0f81f6c9114cbdc5a3abdd1b` (Goal077). Base imediata da implementação: `a0dc3bf173feccfcf4ec3a425fc20c6f1ccc16a5`, HEAD da worktree `.ai-worktrees/goal-072`, inalterado nas quatro rodadas. Entre `79d2133` e `a0dc3bf` só há `docs/`: o commit `5651274` vira o status do Goal077 para `ACCEPTED`, e `a0dc3bf` é o fechamento do Goal077 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **24 arquivos**, hash do diff `8b671c9f731f44a6c3d9ed47b0f2364cd501e5b083424d635ed360677297bf16`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **20 arquivos rastreados**, por `git diff --numstat a0dc3bf`:
  - `apps/frontend/src/features/onboarding/`: `OnboardingShell.tsx` (+140/−53), `OnboardingScreen.tsx` (+34/−50), `OnboardingImportStep.tsx` (+1/−6), `blocks.ts` (+28), `blocks/schedule.tsx` (+189/−51), `blocks/business.tsx` (+18/−3) e `blocks/shared.tsx` (+2/−2).
  - `apps/frontend/src/shared/`: `styles/avenly.css` (+284/−4) e `icons/Icon.tsx` (+2, `pin` e `monitor`). `apps/frontend/public/icons/avenly-icons.svg` (+2, os dois símbolos novos; **31** símbolos). `apps/frontend/AGENTS.md` (+1/−1, a frase da segunda conta do gate autenticado).
  - Testes existentes ajustados, sem asserção apagada: `goal018-onboarding-reachability` (+25/−8), `goal065-onboarding-business` (+4/−2), `goal065-onboarding-schedule` (+17/−5) e `goal066-onboarding-importacao` (+12/−4). A lista de cada asserção mudada está em D-094, "Consequências".
  - `scripts/goal033-authenticated-ui-rehearsal.mjs` (+16/−5): o desvio do §10 descrito abaixo.
  - Os quatro documentos do §8: `CURRENT_STATE.md` (+95), `DECISIONS.md` (+34, D-094), `FINAL_AUDIT.md` (+64, §55) e `VALIDATION_GATE.md` (+71), todos só com inserções.
- **Quatro arquivos novos** em `apps/frontend/tests/`: `goal072-onboarding-frame.test.tsx` (**415** linhas, 19 testes), `goal072-onboarding-selection.test.tsx` (**237**, 8), `goal072-onboarding-schedule-fields.test.tsx` (**340**, 13) e `goal072-icon-sprite.test.ts` (**45**, 3).
- `sha256` na árvore aceita, iguais aos citados em FINAL_AUDIT §55: `OnboardingShell.tsx` `300b8e6f…`, `blocks/shared.tsx` `4fbc638d…`, `blocks/business.tsx` `9744d746…`, `blocks/schedule.tsx` `59e1b1a1…`, `OnboardingScreen.tsx` `95ab7a03…` e o sprite `3c46b3e8…`.
- Nenhuma migration, rota ou mudança de contrato. Nenhuma exceção nova em `KNOWN_*`. Nenhum passo a menos em `validate:core` ou `validate:integration`. `e2e/routes.ts`, `e2e/measure.ts`, `e2e/authenticated-matrix.spec.ts`, `vitest.config.*`, `playwright.config.*` e `next.config.ts` ficam na baseline. Nenhum arquivo foi tocado em `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/public-api-contract/` ou `tools/ia-loop/`. O Product Vault, `docs/design-reference/` e `QA_LOCAL_REVIEW.md` não foram editados.

## Desvio autorizado do §10: o seed da segunda conta

O §10 do Goal proíbe tocar `scripts/`. O guard da `importacao`, exigido pelo §4 e pelo teste §6.10, redirecionou a segunda conta do ensaio autenticado, semeada sem fonte de agenda. A primeira execução de `validate:integration` da rodada 1 reprovou `onboarding-importacao` nas cinco larguras (**155** passando, **5** inesperados). O DIAG-001 do harness fez a menor correção possível: `seedOnboardingAccount` grava `PATCH /v1/onboarding` com `{ calendar: { source: "ATENDLY" } }` e exige 200. A conta continua sem serviço, disponibilidade, IA nem `POST /v1/onboarding/complete`.

O Tech Lead aceitou essa edição na rodada 1 como desvio autorizado. É a única saída coerente entre o guard exigido e o §5, que diz que nenhuma rota sai e que `authenticated-matrix.spec.ts` não muda. O seed grava um estado real do produto e não desliga nenhuma medida. O docblock de `seedOnboardingAccount` foi reescrito na rodada 2 para dizer o que a função faz: dois `PATCH /v1/onboarding` e nenhum `POST /complete`.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** As partes funcionais batiam com o Goal.
   - Blocker 1: `public/icons/avenly-icons.svg` ficou com `<symbol id="i-clock"viewBox="0 0 24 24">`, sem espaço entre atributos. O `DOMParser` do jsdom (`image/svg+xml`) devolvia `no whitespace between attributes`. No Chromium e no WebKit do Playwright, o `<use>` de `#i-clock` caía de 18 × 18 para 0 × 0. O ícone `clock` sumia no app inteiro: sidebar, Agenda, ocupação, painéis do teste real, "Enviando…" em Conversas e Configurações. Nenhum gate o detectou.
   - Blocker 2: aceite do desvio de `scripts/` e pedido do docblock literal, com a prosa dos quatro documentos reescrita no lugar.
   - Blocker 3: as correções acima eram posteriores aos controles; refazer a execução final, os nove controles e a prosa na ordem do §8.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker.** Sprite, docblock e ordem do §8 corrigidos, com execução final **115**/**1186** e os nove controles refeitos. O teste de regressão do sprite pedido como evidência não foi escrito: o relatório disse que o Developer não quis mudar a contagem. O blocker 1 voltou só pela parte de evidência, porque o §8 exige código e evidência na mesma rodada.
3. **Rodada 3 — `CHANGES_REQUIRED`, 1 blocker, só documental.** Entrou `goal072-icon-sprite.test.ts`, com vermelho e verde conferidos por `sha256`. Os gates do IA Loop rodaram com exit 0. Os documentos ainda citavam **40** testes, **115**/**1186** e gates "não reexecutados na rodada 3", e a D-094 não tinha sido editada.
4. **Rodada 4 — `ACCEPTED`.** Os patches de r3 e r4 diferem só nos quatro documentos do §8. O fingerprint de r4-before bate com o de r3-reviewed. O código de `apps/` e de `scripts/` e os testes são byte a byte os das rodadas 2 e 3.

## Evidência final aceita

A execução final vigente é a da **rodada 3 do IA Loop**, sobre a árvore aceita, na ordem do §8, todos exit 0 ([FINAL_AUDIT §55](../FINAL_AUDIT.md)):

- `validate:core` **17** passos (**15** `passed`, **2** `skipped`), com `test:frontend` **116**/**1189** (piso **112**/**1146**: **+4** arquivos e **+43** testes, a soma dos quatro arquivos novos).
- `test:gate` **233**/**233**.
- `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas (`startTime` `2026-09-30T11:43:11Z`).
- `validate:integration` **36**/**36** passos, contra `127.0.0.1:55500/ia_bff_test`, com o gate autenticado em **160** testes, **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime` `2026-09-30T11:46:27Z`).
- `tsc --noEmit` e `eslint` de `apps/frontend`, exit 0. Dirigidos na rodada 3: `goal072` **43**, `goal065-onboarding` **76** e `goal066-onboarding` **36** testes.
- Vermelho da baseline, rodado pelas WU-01 a WU-03 na rodada 1: **31** dos **40** testes dos três arquivos de composição reprovam; os outros **9** guardam comportamento que já existia. O sprite tem controle próprio: `Tests 2 failed | 1 passed (3)` com o atributo colado e `Tests 3 passed (3)` restaurado.
- Os nove controles negativos do §7 são os da rodada 2, por edição real revertida e conferida por `sha256`. Depois deles só entrou `goal072-icon-sprite.test.ts`, que não toca código de produto nem os testes do §6. O Tech Lead não reexecutou os controles nem o vermelho.

## Observações registradas, sem mudar a decisão

1. **Rerun da rodada 4 com um `flaky`.** Os gates reexecutados na rodada 4, sobre o mesmo código, deram exit 0. O gate autenticado teve **159** `expected` e **1** `flaky`: `onboarding-whatsapp` em `tablet-768` ficou na tela "Verificando seu acesso" de `shared/runtime/ProductRuntime.tsx`, que o diff não toca, e passou na retentativa. Classificado como ambiente, conforme o §10 do Goal. A execução da rodada 3, sobre o mesmo código, teve **0** retentativas e é a que sustenta o critério 8.
2. **Os `e2e-results` foram sobrescritos por esse rerun.** `apps/frontend/e2e-results/results.json` tem `startTime` `2026-09-30T12:03:21Z` (**169**/**21**/**0**), e `e2e-results/authenticated/results.json` tem `2026-09-30T12:06:34Z` (**159** mais **1** `flaky`). Os `startTime` citados nos documentos são os da rodada 3.
3. **O piso não foi recontado.** O Goal pedia a recontagem da baseline `79d2133` antes da primeira edição; nenhum relatório a traz. O piso usado é o declarado no Goal, **112**/**1146**, e a conta fecha exatamente com os quatro arquivos novos.
4. **Os gates não detectaram o sprite quebrado.** O defeito apagava um ícone em várias telas e passou pelo gate autenticado nas cinco larguras. O guarda agora é `goal072-icon-sprite.test.ts`, dentro de `test:frontend`.
5. **`progressPercent` segue exportada em `blocks.ts` sem uso em `src/`.** Limite declarado em D-094.
6. **`FINAL_AUDIT.md` está com LF na working copy.** O blob também é LF e `core.autocrlf=true`, então o diff é só de inserções e não há churn.

## O que o aceite não prova

- Que as etapas dos capítulos "Seu negócio" e "Sua agenda", percorridas num aparelho real nas cinco larguras, batem com os três protótipos do Goal. A conferência humana do §9 **não foi feita**.
- Que o trilho, o chevron e o botão na largura da coluna batem com os protótipos nas etapas dos capítulos "Sua IA" e "WhatsApp", e que o chevron cinza da Boas-vindas, a barra de horas e o resumo dos dias leem bem. Mesma conferência humana, **não feita**.
- A demonstração animada, a amostra por estilo, as promessas, a Boas-vindas animada e a ordem de Tab da introdução do WhatsApp (Goal079). A busca por CEP de O-15, pendente de decisão humana.

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §55](../FINAL_AUDIT.md)).
