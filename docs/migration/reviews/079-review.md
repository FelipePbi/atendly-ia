# Review formal — Goal 079

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-30, em review DEEP, conforme o [Goal079](../goals/079-onboarding-fiel-ao-prototipo-demonstracao-estilo-promessas-e-boas-vindas.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–078) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 1 blocker, e a rodada 2 terminou com zero. O único defeito achado no review foi um teste que o próprio Goal deixou intermitente; nenhum código de produção mudou entre as rodadas.

O Goal corrige **QA O-36, O-37, O-39, O-42 e a parte animada de O-01** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e a observação 3 do [review065](065-review.md) (ordem de Tab da introdução do WhatsApp). A Boas-vindas anima a composição em 3,2 s sem prender o "Começar". A demonstração da IA vira uma conversa de onze itens calculada do rascunho por `demo.ts`, com o "Continuar" só depois do último item e sem escrita. O estilo ganha amostra por opção, com Equilibrada como padrão. A introdução do WhatsApp ganha quatro promessas e perde o `row-reverse`. `prefers-reduced-motion` abre cada tela no estado final. Decisão: [D-095](../DECISIONS.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `68bc370031d71f4279626fc55613e388842ef58b` (Goal072). Base imediata da implementação: `e0287e9c5d4770d72382a362f51cb322fcc1e230`, HEAD da worktree `.ai-worktrees/goal-079`, inalterado nas duas rodadas. Entre `68bc370` e `e0287e9` só há `docs/`: o fechamento do Goal072 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **26 arquivos**, hash do diff `4176e230e9020cb564c57207e66fa000f9457ed879703310a48eb2c8a51c9ce8`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **20 arquivos rastreados**, por `git diff --numstat e0287e9`:
  - `apps/frontend/src/features/onboarding/`: `OnboardingScreen.tsx` (+22/−5), `scenarios.ts` (+6/−6), `blocks/ai.tsx` (+175/−124), `blocks/business.tsx` (+59/−14), `blocks/shared.tsx` (+14/−2) e `blocks/whatsapp.tsx` (+52/−13).
  - `apps/frontend/src/shared/styles/atendly.css` (+81/−8), `apps/frontend/e2e/routes.ts` (+13, só acréscimo) e `apps/frontend/AGENTS.md` (+8/−4).
  - Testes existentes ajustados, sem teste removido nem pulado: `goal018-a11y` (+1/−3), `goal018-onboarding-reachability` (+55/−36), `goal019-a11y` (+1/−1), `goal065-onboarding-business` (+16/−3), `goal065-onboarding-copy-whatsapp` (+3/−1) e `goal065-onboarding-schedule` (+28/−2). O motivo de cada asserção mudada está em [FINAL_AUDIT §56](../FINAL_AUDIT.md).
  - `scripts/goal033-authenticated-ui-rehearsal.mjs` (+40/−9): o terceiro `PATCH /v1/onboarding` de `seedOnboardingAccount`, edição autorizada pelo §5 e pelo §10 do Goal.
  - Os quatro documentos do §8: `CURRENT_STATE.md` (+63), `DECISIONS.md` (+35, D-095), `FINAL_AUDIT.md` (+63, §56) e `VALIDATION_GATE.md` (+64), todos só com inserções.
- **Seis arquivos novos**: `apps/frontend/src/features/onboarding/demo.ts` (**279** linhas, funções puras) e, em `apps/frontend/tests/`, `goal079-onboarding-welcome-whatsapp.test.tsx` (**249**, 9 testes), `goal079-onboarding-demo.test.tsx` (**381**, 14), `goal079-demo-slots.test.ts` (**210**, 17), `goal079-onboarding-style.test.tsx` (**244**, 8) e `goal079-onboarding-gate-routes.test.ts` (**81**, 6).
- Nenhuma migration, rota removida ou mudança de contrato. A única mudança de gravação é o padrão `BALANCED` quando `tone` é nulo. Nenhuma exceção nova em `KNOWN_*`. Nenhum passo a menos em `validate:core` ou `validate:integration`. `e2e/authenticated-matrix.spec.ts`, `vitest.config.*`, `playwright.config.*` e `next.config.ts` ficam na baseline. Nenhum arquivo foi tocado em `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/public-api-contract/` ou `tools/ia-loop/`. O Product Vault, `docs/design-reference/` e `QA_LOCAL_REVIEW.md` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 1 blocker.** O produto conferia com o Goal nos pontos inspecionados: os três estágios da Boas-vindas, as funções de `demo.ts`, a sequência de onze itens com `role="log"`, o estilo com `aria-pressed` e `BALANCED`, as quatro promessas sem `row-reverse` e as duas rotas do gate.
   - Blocker 1: `goal018-onboarding-reachability.test.tsx:463` ("demonstracao-da-ia com serviço e horário reais … avança para tom-da-ia sem escrever nem enviar") ficou intermitente. O Tech Lead reproduziu **1** falha em **5** execuções do conjunto `tests/goal079 tests/goal065-onboarding tests/goal018 tests/goal019 tests/goal072`, com `Unable to find an accessible element with the role "button" and name "Continuar"`. A causa é deste Goal: o "Continuar" da demonstração só aparece depois do efeito passivo `onDemoDone(true)` de `DemoConversationView` (`blocks/ai.tsx`), e o teste procurava o botão com `getByRole` antes desse efeito rodar. A WU-03 tinha visto a mesma falha e a descartado como carga alheia.
2. **Rodada 2 — `ACCEPTED`.** O teste espera o botão com `await screen.findByRole("button", { name: "Continuar" })` e continua afirmando o push para `/onboarding/tom-da-ia`, nenhum `updateOnboarding` e nenhum `completeOnboarding`. Os patches das rodadas 1 e 2 diferem só nessa linha e num comentário do mesmo teste. Nenhum código de produção mudou. Os outros testes que clicam o "Continuar" da demonstração foram conferidos: em `goal079-onboarding-demo`, cada consulta síncrona vem depois de `act` com `advanceTimersByTimeAsync`, que já executa os efeitos pendentes; `goal065-onboarding-schedule` e `goal019-a11y` não clicam esse botão.

## Evidência final aceita

A execução final descrita nos documentos é a da **WU-14 da rodada 1**, sobre o mesmo código de produção, na ordem do §8, todos exit 0 ([FINAL_AUDIT §56](../FINAL_AUDIT.md)):

- `validate:core` **17** passos (**15** `passed`, **2** `skipped`), com `test:frontend` **121**/**1243** (piso **116**/**1189**, recontado numa cópia da baseline: **+5** arquivos e **+54** testes, a soma dos cinco arquivos novos).
- `test:gate` **233**/**233**.
- `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas (`startTime` `2026-09-30T13:01:45Z`).
- `validate:integration` **36**/**36** passos, contra `127.0.0.1:55590/ia_bff_test`, com o gate autenticado em **170** testes (o piso **160** mais duas rotas vezes cinco larguras), **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime` `2026-09-30T13:15:11Z`).
- Oito controles negativos do §7, por edição real revertida e conferida por `sha256`, depois da última edição de código de produção. A correção da rodada 2 tocou só um teste de Goal anterior, fora dos arquivos-alvo dos controles.

Evidência da rodada 2, rodada pelo próprio Tech Lead sobre a árvore aceita:

- **10** execuções seguidas do conjunto de filtros do blocker, todas com **285**/**285**.
- `npx vitest run` completo em `apps/frontend`: **121** arquivos e **1243** testes, a mesma contagem dos documentos; nenhum documento precisou ser reescrito.
- Os **10** gates do IA Loop na rodada 2 passaram: typecheck, lint, três conjuntos de testes dirigidos, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `git diff --check`.

## Observações registradas, sem mudar a decisão

1. **O Developer rodou 8 repetições, não as 10 pedidas, e não colou a execução de `test:frontend` no relatório da rodada 2.** O Tech Lead cobriu as duas lacunas com as execuções acima.
2. **`goal065-onboarding-business.test.tsx` remove o dublê de `matchMedia` no fim do próprio teste, sem `finally` nem `afterEach`.** Se uma asserção falhar antes, o dublê vaza para os testes seguintes do arquivo. Não afeta o resultado verde; é fragilidade de teste.
3. **Os `e2e-results` foram sobrescritos pelos gates da rodada 2.** `apps/frontend/e2e-results/results.json` tem `startTime` `2026-09-30T13:40:18Z` (**169**/**21**/**0**), e `e2e-results/authenticated/results.json` tem `2026-09-30T13:43:29Z` (**170** `expected`, **0** `flaky`). Os `startTime` citados nos documentos são os da WU-14 da rodada 1; as contagens são as mesmas.
4. **Retentativas de ambiente antes da execução final.** Duas execuções de `validate:integration` da rodada 1, sobre o mesmo código, tiveram **1** retentativa cada, em `configuracoes` e `servicos` a 360 px, na tela "Verificando seu acesso" de `shared/runtime/ProductRuntime.tsx`, que o diff não toca. É o mesmo padrão do `flaky` registrado no [review072](072-review.md), agora em rotas fora do onboarding. A primeira não tem artefato para conferir.
5. **`test:gate` não foi recontado na baseline.** A cópia extraída deu resultado não confiável (**220** testes, **27** reprovados); o diff não acrescenta teste em `scripts/tests`, e **233** é o número declarado no Goal e reproduzido.

## O que o aceite não prova

- Que a Boas-vindas, a demonstração, o estilo e a introdução do WhatsApp, percorridos num aparelho real nas cinco larguras, batem com os protótipos do Goal. A conferência humana do §9 **não foi feita**.
- Que o ritmo da demonstração (cerca de 11 s) e o da Boas-vindas (cerca de 3 s) leem bem, que o "pop" da amostra não incomoda e que cada amostra soa como o tom. A amostra é prévia do frontend, não a saída do modelo.
- Que a demonstração passa no gate em todos os quadros: o gate a mede no quadro em que a encontra depois de `networkidle`, que pode ser do meio da sequência.
- A busca por CEP (O-15), pendente de decisão humana; a observação 5 do review065; as observações 1 e 2 do [review078](078-review.md).

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §56](../FINAL_AUDIT.md)).
