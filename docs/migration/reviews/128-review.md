# Review formal — Goal 128

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal128](../goals/128-o-teste-real-em-andamento-e-o-teste-que-falhou-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 2 saiu `CHANGES_REQUIRED` com 1 blocker só de documentação; o IA Loop aceitou a rodada e adiou a correção para este fechamento, sem nova rodada do Developer. A correção foi aplicada aqui, só em `docs/migration/`.

O teste real em andamento (`/onboarding/teste-real-progresso`) e o teste que falhou (`/onboarding/teste-real-falha`) ficam iguais aos quadros 4.7 e 4.8 nos quatro devices, salvo as divergências declaradas em D-142. A linha do tempo é lida só de `run.milestones` e `run.state`, a 4.7 vai sozinha, com `replace`, para a tela do estado quando a execução termina ou pausa, e a segunda linha e o cartão da 4.8 vêm de mapas fechados por `failureCode`. Configurações › IA não muda. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-142](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `02ba0bff99f14069ef98e2b8768b1d4269f3a07f` (Goal127). Base imediata da implementação: `2c294a347ad4424df53292355c91efd8eb145279`, HEAD da worktree `.ai-worktrees/goal-128`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **16 arquivos** (13 rastreados e 3 novos não rastreados), hash do diff `2d705d3daa47f5223bca8a00432974b50ee6524407a3c62a4760bd98cdd7999f`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (5): `features/activation-test/ActivationTestPanels.tsx` (`ActivationTestTimeline`, `activationTestTimelineStates`, `ActivationTestOnboardingProgress`, `ActivationTestOnboardingFailed` e os mapas por `failureCode`), `features/onboarding/OnboardingScreen.tsx` (os rodapés da 4.7 e da 4.8), `features/onboarding/blocks/activation-test.tsx` (`router.replace` ao terminar), `features/onboarding/scenarios.ts` (eyebrow, título e texto das duas etapas) e `shared/styles/avenly.css` (as duas telas, a linha do tempo, o cartão, `prefers-reduced-motion` e o `safe center` da moldura de conclusão);
  - `apps/frontend/tests/` (5): os novos `goal128-teste-em-andamento.test.tsx`, `goal128-teste-falhou.test.tsx` e `goal128-alvos-captura.test.ts` (66 testes) e os ajustados `goal019-a11y.test.tsx` e `goal019-activation-test-screens.test.tsx`;
  - a captura e o gate (3): `apps/frontend/e2e/visual/targets.json` (4.7 `RUNNING` e 4.8 `FAILED`, só com `GET /v1/activation-test`), `apps/frontend/e2e/routes.ts` (as duas rotas em `ONBOARDING_ROUTES`) e `scripts/tests/visual-responses.test.mjs` (de 55 para 56 testes);
  - `docs/migration/` (3, por acréscimo): D-142 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal128 em `VALIDATION_GATE.md`.
- Todos dentro da lista permitida do Goal. `scripts/visual-compare.mjs` e `scripts/lib/visual-responses.mjs` não mudaram. O documento do Goal128 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers (2 de código, 1 de documentação).** O review DEEP aprovou a lógica: a linha do tempo, a navegação sozinha, os mapas de `failureCode`, a ordem dos botões da 4.8, o `safe center`, as rotas do gate e Configurações › IA intacta. Os blockers: (1) o "Abrir WhatsApp" da 4.7 com 52 px de altura externa no lugar dos 54 px do quadro, nos quatro devices, com o topo 2 px abaixo; (2) o título do cartão "O que você pode fazer" da 4.8 com o `line-height` 1.5 herdado, deixando o cartão 2 px mais alto (116 contra 114 px no mobile, 96 contra 94 px nos outros) e o texto 3 px abaixo; (3) `VALIDATION_GATE.md` registrava o gate autenticado com 300 `passed` e 0 retentativas, quando a execução final da rodada (WU-11) teve 299 `passed` e 1 `flaky` (`mobile-360 › onboarding-teste-real-sucesso`, contraste 2,15:1 em "Ir para o início"), e dizia que as capturas batiam com os quadros.
2. **Rodada 2 — review `CHANGES_REQUIRED`, 1 blocker só de documentação; decisão efetiva `ACCEPTED`, com a correção adiada para o fechamento.** A correção FIX-001 pôs `height: 54px` no secundário de `[data-step="teste-real-progresso"]` e `line-height: normal` em `.activation-failed-card-title`. O review conferiu as duas por pixel e aprovou o resto. O blocker: a seção do Goal128 no `VALIDATION_GATE.md` dizia que as contagens eram as da rodada 1 e que as da rodada 2 não estavam copiadas, e citava a retentativa da rodada 1 como a da execução final.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `VALIDATION_GATE.md`, seção do Goal128 (blocker da rodada 2, adiado):
   - a abertura passou a dizer que as contagens são as da execução final de gates da rodada 2 (IA Loop, WU-04 a WU-12, sobre a árvore completa depois da correção FIX-001), todas com saída 0, e deixou de dizer que elas não estão copiadas;
   - a linha de `validate:integration` passou a "PASSED, **36** de 36 passos, 0 falhas, 0 pulados; gate autenticado com **299** `passed` e **1** `flaky`, com 1 retentativa: `mobile-390 › configuracoes-conta › measured, logged in`" (a primeira tentativa reprovou em `page.goto: net::ERR_NO_BUFFER_SPACE` ao abrir `/configuracoes/conta`, rota fora deste Goal), com a nota da baseline 290 e +10 mantida;
   - o parágrafo "Duas execuções…" passou a registrar a retentativa `mobile-360 › onboarding-teste-real-sucesso` (contraste 2,15:1 em "Ir para o início") como de execuções anteriores, a do Developer e a da rodada 1, e não da final;
   - a frase do cartão da 4.8 passou a dizer 94 px no tablet em paisagem, no desktop e no tablet em retrato, e 114 px no mobile, iguais ao quadro, como medido no review da rodada 2.
2. D-142 e o delta do Goal128 em `CURRENT_STATE.md` não citam as contagens dos gates; não precisaram da correção.
3. `DECISIONS.md`: o status de D-142 passou a ACCEPTED, com a nota de fechamento.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal128), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal128) e em D-142.

- **Gates do IA Loop, rodada 2, na árvore aceita:** typecheck (WU-04), lint (WU-05), testes alvo (WU-06, 3 arquivos e 66 testes), suíte do frontend (WU-07, 180 arquivos e 2384 testes), `test:gate` (WU-08, 289), `validate:core` (WU-09, 17 passos com 15 passando e 2 pulados, `test:bff` e `test:health-worker`), `validate:ui` (WU-10, 169 passando e 21 pulados, retries 0), `validate:integration` (WU-11, 36 de 36 passos, gate autenticado com 299 `passed` e 1 `flaky` em `mobile-390 › configuracoes-conta`, `ERR_NO_BUFFER_SPACE`) e `git diff --check` (WU-12), todos com saída 0.
- **Controles negativos do Developer:** (a) a linha atual da 4.7 como o primeiro marco alcançado reprovou 3 de 24; (b) a 4.7 navegando com `RUNNING`, 2 de 24; (c) o cartão de `REPLY_NOT_DELIVERED` para `ABANDONED`, 1 de 31; (d) "Fazer isso depois" antes de "Tentar novamente", 1 de 31; (e) o 4.7 de `targets.json` com `SUCCEEDED`, 1 de 11 em `goal128-alvos-captura.test.ts` e 1 de 56 em `visual-responses.test.mjs`. Cada mutação foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código (rodada 1):** o estado de cada linha vem só de `run.milestones` e `run.state` (concluída só com `reached`, atual só com `RUNNING`, vermelha só com `FAILED`), sem tempo decorrido. A 4.7 navega com `replace` só quando `activationTestPanelFor(run)` não é `progress`; com erro ou sem execução, fica no `ErrorNote`. Os mapas de `failureCode` usam `Object.hasOwn` e caem no texto genérico com código desconhecido ou `null`. `ActivationTestProgress`, `ActivationTestFailed` e `ActivationTestMilestoneList` ficam intactos, e os ajustes em `goal019-*` não afrouxam asserção.
  - **Correção (rodada 2):** as duas regras novas de CSS valem só para os corpos do onboarding (`[data-step]` e `.activation-failed-card-*`, usado só em `ActivationTestOnboardingFailed`).
  - **`visual:compare` de 4.7 e 4.8:** na rodada 1, 4.7 em 1,9/0,6/1,0/1,0% e 4.8 em 3,9/1,7/2,0/1,5%, com os dois desvios de 2 px. Na rodada 2, refeito (8 pares, saída 0): 4.7 em 1,5/0,5/1,0/0,8% e 4.8 em 3,9/1,7/1,9/1,5% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos percentuais do relatório. Os oito `side-by-side.png` foram abertos e `prototype.png` foi medido contra `app.png`. "Abrir WhatsApp" da 4.7 tem as bordas e o rótulo na posição do quadro nos quatro devices, com no máximo 1 px de diferença. O cartão da 4.8 tem 114 px no mobile e 94 px nos outros três devices, igual ao quadro, com título e texto no mesmo deslocamento da borda (19, 43 e 64 px). Estrutura, cores, tipografia, linha do tempo, cartão e rodapé batem com o quadro, salvo as divergências declaradas.

## Divergências aceitas

Declaradas pelo Goal ou por D-142, conferidas nas capturas:

1. As linhas concluídas da 4.7 sem a segunda linha (hora, serviço e preço) e a atual sem o texto de horário livre: o contrato não traz esses dados por marco.
2. O rótulo do vault em todas as linhas ("Agenda consultada" onde o quadro diz "Consultando agenda").
3. Na 4.8, cada marco pendente numa linha; a segunda linha e o cartão pelo `failureCode`, no lugar do texto de horário livre; "Fazer isso depois" no lugar de "Revisar horários"; a nota de limpeza abaixo do cartão.
4. Na 4.7, "Continuar depois" discreto abaixo da nota.
5. O "Sair" do topo (mobile e tablet em retrato) e do rodapé da sidebar (a partir de 1024 px), que vêm de D-104.
6. A barra de status e o indicador de início do iPhone nos quadros mobile, e ruído de antialiasing nos títulos.

## Observações sem bloqueio

1. O gate autenticado tem retentativas intermitentes fora das duas rotas deste Goal. Na rodada 1, `mobile-360 › onboarding-teste-real-sucesso` reprovou uma vez por contraste (2,15:1) em "Ir para o início", o que parece ser o instante da animação de entrada da 4.9 (Goal127), anterior a este Goal. Na rodada 2, `mobile-390 › configuracoes-conta` reprovou uma vez em `page.goto: net::ERR_NO_BUFFER_SPACE`, falha de rede do ambiente. As duas passaram na nova tentativa.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer; o Tech Lead não os refez.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` de 4.7 e 4.8.
3. **A regressão de 4.6, 4.9, 4.10 e IA1** é a do Developer (13 dos 16 pares iguais byte a byte; nos três outros, no máximo 47 pixels com delta de cor de no máximo 5 em 255, na fase da animação); o Tech Lead não a refez.
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.
