# Review formal — Goal 081

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-30, conforme o [Goal081](../goals/081-o-onboarding-nao-trava-em-local-proprio-e-o-teste-real-diz-quando-esta-indisponivel.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–080) foi reaberto, reavaliado ou revertido. **Uma rodada**, sem blocker.

O Goal fecha dois achados do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080). **R-01**: quem marcava "Local próprio" em `/onboarding/modalidade` recebia `400 BUSINESS_ADDRESS_REQUIRED` e não passava da etapa. **R-05**: sem o número da plataforma, o teste real mostrava a frase genérica de erro de etapa. O conserto fica todo no frontend. A etapa `modalidade` não grava quando `ON_SITE` está marcado, e `endereco` grava endereço e modalidades juntos. As sete recusas nomeadas de `POST /v1/activation-test` são traduzidas num único módulo. `onboardingError` passa a ter três classes. O contrato do BFF não muda. Fecha também a observação 2 do [review080](080-review.md), o comentário velho de `scripts/validate-integration.mjs`. Decisão: [D-097](../DECISIONS.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `cc6c4e655283c0b2684756a4bb1980096062c2b6` (Goal080). Base imediata da implementação: `9bb1f5809b59193c31b7065278d35a6f066a6f4f`, HEAD da worktree `.ai-worktrees/goal-081`, inalterado na rodada. Entre `cc6c4e6` e `9bb1f58` só há `docs/`: o commit `853732c` (re-teste local, U-12, Goals 081–085 PLANNED) e o fechamento do Goal080 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **15 arquivos**, hash do diff `4a9e9b80035a10b7369e70ab22e2154c02c394ff814a4bbcc647f8c1d9a9bad1`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **12 arquivos rastreados**, por `git diff --numstat 9bb1f58` no snapshot aceito:
  - Frontend: `features/activation-test/ActivationTestPanels.tsx` (+55/−6), `features/onboarding/blocks/business.tsx` (+14/−6) e `features/onboarding/blocks/shared.tsx` (+11/−3).
  - Script: `scripts/validate-integration.mjs` (+3/−2), só linhas de comentário.
  - Testes existentes ajustados, sem teste removido nem pulado: `goal019-activation-test-screens.test.tsx` (+3), `goal065-onboarding-business.test.tsx` (+7/−12), `goal065-onboarding-schedule.test.tsx` (+1/−1) e `goal066-onboarding-sistema-atual.test.tsx` (+3/−3). O motivo de cada asserção mudada está em [FINAL_AUDIT §58](../FINAL_AUDIT.md).
  - Documentos do §8: `CURRENT_STATE.md` (+57), `DECISIONS.md` (+37, D-097), `FINAL_AUDIT.md` (+61, §58) e `VALIDATION_GATE.md` (+53).
- **Três arquivos novos**: `apps/frontend/tests/goal081-onboarding-local-proprio.test.tsx` (**212** linhas, 4 testes), `apps/frontend/tests/goal081-activation-test-refusals.test.tsx` (**360** linhas, 20 testes) e `apps/bff/tests/goal081-onboarding-local-proprio.integration.test.ts` (**131** linhas, 1 teste).
- Nenhuma rota, migration, campo de contrato ou opção nova em allowlist. `apps/bff/src/`, `apps/bff/PUBLIC_API_V1.md`, `features/settings/AiSettings.tsx` e `features/onboarding/blocks/activation-test.tsx` ficam na baseline. Nenhuma exceção nova em `KNOWN_*` e nenhum passo a menos em `validate:core` ou `validate:integration`. `vitest.config.*`, `playwright.config.*`, `next.config.ts`, os specs de `e2e/` e `e2e/routes.ts` não mudaram. Nada foi tocado em `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/` ou `tools/ia-loop/`. `QA_LOCAL_REVIEW.md`, o vault e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** O código confere com o Goal:
   - R-01: em `modalidade`, com `ON_SITE` no rascunho, `persistBusinessStep` só chama `ctx.go("endereco")`. Não chama `update` nem `refresh`, então o rascunho sobrevive à navegação. Sem `ON_SITE`, a etapa grava como antes. Em `endereco`, sem `ON_SITE` no rascunho, volta para `modalidade` sem gravar; com `ON_SITE`, grava `address` e `modalities` numa chamada só. `nextRequiredStep` ficou intacto.
   - O teste §6.1 usa um dublê que aplica a regra do BFF: `400 BUSINESS_ADDRESS_REQUIRED` com `details.field` igual a `address`. O teste de `goal065-onboarding-business.test.tsx` que guardava o defeito foi reescrito, não removido.
   - R-05: `ACTIVATION_TEST_REFUSALS` e `activationTestRefusal` ficam em `ActivationTestPanels.tsx`. A leitura usa `details.upstreamCode` e cai em `error.code` quando ele falta, o que cobre `ACTIVATION_TEST_AI_ALREADY_ACTIVE`. `startActivationTest` devolve as sete recusas como texto e deixa subir qualquer outro erro. `AiSettings.startTest` e `persistActivationTestStep` já usavam o valor devolvido; o Tech Lead conferiu os dois consumidores.
   - O texto de indisponibilidade não diz "Tente novamente", não nomeia variável de ambiente e mantém "Fazer isso depois" visível.
   - `onboardingError`: o `409` de conclusão mantém o texto; `400` pede revisão; `0`, `502`, `503` e `504` dizem que não foi possível falar com o servidor; o resto diz que a falha foi nossa. O `400` absorvido por campo já é tratado antes, por `applyServerFieldErrors` em `OnboardingScreen`.
   - `scripts/validate-integration.mjs`: o diff só tem linhas de comentário, e o comentário cita a regra do Goal080.
   - Documentos: D-097 em `PROPOSED` cobre de (a) a (g) e o "Revisar se". FINAL_AUDIT §58 foi só anexada, com 61 linhas a mais e 0 removidas. Os quatro documentos dizem que a conferência humana do §9 não foi feita.
   - `git status --porcelain=v1 -uall` listava só os 15 arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

## Evidência final aceita

A execução final descrita nos documentos é a da **WU-13 da rodada 1**, sobre a árvore entregue, com um PostgreSQL descartável em `127.0.0.1:55711/atendly_bff_test`, na ordem do §8, todos exit 0 ([FINAL_AUDIT §58](../FINAL_AUDIT.md)):

- `validate:core` **17** passos (**15** `passed`, **2** `skipped`: `test:bff` e `test:health-worker`).
- `test:gate` **233**/**233**. A execução em sequência deu exit 0, mas o log ficou ilegível. A contagem foi lida numa reexecução isolada depois dos controles, sobre a mesma árvore.
- `validate:ui` **169** `passed`, **21** `skipped`, **0** `flaky` (`startTime` `2026-09-30T22:06:12.019Z`).
- `validate:integration` **36**/**36** passos, com `goal081-onboarding-local-proprio.integration.test.ts` rodando contra PostgreSQL real, sem `skipped`. O gate autenticado teve **170** testes, **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime` `2026-09-30T22:09:15.913Z`).
- Suítes reexecutadas pela WU-13: `test:frontend` **123**/**1268** (baseline **121**/**1244**); `test:bff-integration` **62**/**471** (baseline **61**/**470**); `test:ai-orchestrator` sem banco **1186** passando e **98** `skipped` de **1284**; `test:scheduling-service` **37**/**502**. **+25** testes no total.
- Recontagem da baseline, feita pela WU-01 em `cc6c4e6` antes da primeira edição: `test:frontend` **121**/**1244**; `test:gate` **233**; `test:bff-integration` **61**/**470**, contra `127.0.0.1:55432/atendly_bff_test`. Os números batem com os declarados pelo Goal. Na primeira execução de `test:gate`, **3** testes falharam porque o client Prisma do ai-orchestrator não estava gerado. Depois de `npx prisma generate`, o resultado foi **233**/**0** falhas. É pré-condição do harness, não efeito do diff.
- Vermelho da baseline: a WU-01, antes de editar `src/`, viu `goal081-onboarding-local-proprio.test.tsx` com **3** reprovados de **4**. A WU-13 trocou os três arquivos de produção pelo conteúdo da baseline e rodou os seis arquivos de frontend do Goal: **25** reprovados de **124**. A restauração foi conferida com `sha256sum -c`.
- Cinco controles negativos do §7, por edição real revertida e conferida por `sha256`, depois da execução final. Cada um reprova o teste esperado e passa restaurado. O controle 4 edita `AiSettings.tsx`, arquivo que o diff não toca.

Evidência conferida pelo Tech Lead:

- Os seis arquivos de teste de frontend afetados: **124**/**124**. `git diff --check` passa.
- Os 11 gates declarados do IA Loop deram exit 0 na rodada 1: typecheck e lint de `apps/frontend` e `apps/bff`, os dois testes dirigidos, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `git-diff-check`.
- Os `e2e-results` em disco têm os mesmos `startTime` e contagens citados nos documentos.
- O Tech Lead não reexecutou os cinco controles nem o vermelho da baseline, que vêm da WU-13 e da WU-01.

## Observações registradas, sem mudar a decisão

1. **Copy do Developer.** Os três textos de erro de etapa e os sete textos de recusa do teste real seguem as regras do Goal. A clareza deles depende da conferência humana do §9.
2. **Duas frases para "WhatsApp não conectado".** A frase de `ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED` difere da recusa local `CONNECT_WHATSAPP_FIRST`. É aceitável: uma vem do servidor, a outra é verificada antes da chamada.
3. **`ACTIVATION_TEST_ALREADY_RUNNING` não lê o estado.** A frase diz que já há um teste em andamento. Ler o estado exigiria código novo, e o item (e) do Goal permite a frase nesse caso.
4. **Sem controle negativo para as seis recusas `409` nem para o teste do BFF.** As seis recusas são afirmadas por `goal081-activation-test-refusals.test.tsx`. O teste do BFF é guarda do contrato e passa também na baseline. §58 declara os dois limites.
5. **Observação 2 do review080 fechada.** O comentário do passo `test:ai-orchestrator-content-purge` agora diz que a purga alcança o não classificado depois do prazo Comercial.

## O que o aceite não prova

- Que a pessoa percorre o onboarding com Local próprio num navegador real, contra o BFF real, até `sistema-atual`. Nenhum gate percorre a etapa `modalidade` clicando. A conferência humana do §9 **não foi feita**.
- Que o texto de indisponibilidade e os três textos de erro de etapa são claros para a profissional.
- Que o custo (c) é aceitável: quem fecha a janela no endereço volta para `modalidade` na retomada.
- Que o teste real funciona com o número da plataforma configurado. A-08 segue pendente. A indisponibilidade só aparece depois do clique.
- A busca por CEP (O-15), pendente de decisão humana.

Veredito do FINAL_AUDIT: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem mudança em relação a §57. R-01 e R-05 ficam corrigidos. Eles são achados do re-teste local, fora da enumeração A-01…A-24 ([FINAL_AUDIT §58](../FINAL_AUDIT.md)).
