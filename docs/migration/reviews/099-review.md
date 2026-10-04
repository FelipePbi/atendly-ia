# Review formal — Goal 099

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, em review DEEP, conforme o [Goal099](../goals/099-etapas-de-ia-e-whatsapp-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–090 e 098) foi reaberto, reavaliado ou revertido.

O Goal porta o conteúdo das etapas de IA e WhatsApp dos quadros 3.1, 4.1, 4.2 e 4.6, dentro da moldura do Goal089 e depois das etapas do Goal090. O eyebrow de `whatsapp`, `whatsapp-conectar` e `teste-real` passa a ser "WhatsApp". A demonstração segue a conversa do quadro, sem artigo fixo, com o rótulo "sua IA" e três eventos com ícone. A introdução do WhatsApp tem o título e as quatro promessas do quadro. No onboarding, o consentimento vira uma fase própria antes da conexão. A introdução do teste real tem a prévia "Avenly · Teste" e um único CTA primário. A decisão é [D-106](../DECISIONS.md), aceita neste fechamento. Ela não substitui nenhuma decisão anterior: completa D-104 e D-105 e acrescenta ao item 3 de D-081, só no onboarding, a separação do consentimento em fase própria.

## Escopo e identidade do diff

- Baseline aceita vigente: `8406986e3569b51b82cb6ce6f0336e492d26e5ab` (Goal090). Base imediata da implementação: `1eaecd0403f7595393836d913262e8284677f831`, HEAD da worktree `.ai-worktrees/goal-099`, inalterado nas quatro rodadas, sem commit na worktree. Entre `8406986` e `1eaecd0` há o fechamento do Goal090 com a preparação deste Goal (`02e1716`, só documentação) e a correção de harness V34 do IA Loop (`1eaecd0`, encerramento de árvores de processo no timeout e varredura de órfãos). Nenhum dos dois toca o produto.
- Snapshot aceito, calculado pelo IA Loop: **23 arquivos**, hash do diff `78d9a9405c357fb839dd61a076dc48e007b540e8a8738cf238621649236800a4`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os arquivos, por `git diff --numstat 1eaecd0` no snapshot aceito:
  - `apps/frontend/src/features/whatsapp/WhatsAppConnectionPanel.tsx` (+171/−4): prop opcional `consentPhase`. Sem ela, o painel é o da baseline, numa tela só. Com ela, expiração, falha e desconexão chamam `onConsentRequired` e desmarcam o checkbox.
  - `OnboardingScreen.tsx` (+52/−10): `whatsappPhase` e `consentReady`, título "Antes de conectar", "Continuar" da fase de consentimento sem chamada ao BFF, e rodapé `is-stacked` do 4.6.
  - `demo.ts` (+40/−12) e `blocks/ai.tsx` (+56/−15): conversa do 3.1, ícones dos eventos, `hourArticle` e `allInAfternoon`, `demo-ai-bubble` e o rótulo "sua IA".
  - `blocks/whatsapp.tsx` (+56/−12) e `scenarios.ts` (+7/−7): ícones e quarta promessa de 4.1, eyebrow "WhatsApp", título de 4.1 com ponto e sem descrição.
  - `src/features/activation-test/ActivationTestPanels.tsx` (+49/−1) e `blocks/activation-test.tsx` (+3/−1): `ActivationTestOnboardingIntro`, escolhida pela prop `onboarding`. `ActivationTestIntro`, usada por `AiSettings`, não muda.
  - `blocks/shared.tsx` (+3/−0) e `src/shared/styles/avenly.css` (+278/−7): regras escopadas por `[data-step=…]` e `.whatsapp-consent-phase`. Não há folha nova.
  - `e2e/routes.ts` (+1/−1): um `contentMarker`, o título de `whatsapp` com o ponto final, justificado em D-106 (b).
  - Testes: `tests/goal099-onboarding-ia-whatsapp.test.tsx` (novo, 519 linhas, **12** testes) e asserções ajustadas em `goal018-onboarding-reachability` (+50/−6), `goal019-a11y` (+1/−1), `goal019-activation-test-screens` (+14/−1), `goal071-onboarding-whatsapp` (+94/−6), `goal079-demo-slots` (+1/−1), `goal079-onboarding-demo` (+6/−6), `goal079-onboarding-welcome-whatsapp` (+15/−11) e `goal084-demo-article` (+1/−1).
  - Documentos: `docs/migration/DECISIONS.md` (D-106 inserida depois de D-105, e uma frase **acrescentada** ao fim do item 3 de D-081, que aponta para D-106 (d); o texto anterior do item ficou intacto), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- Nenhuma rota, contrato, BFF, serviço, orquestrador, migration, variável, `e2e/visual/targets.json`, `playwright.*.config.ts`, `vitest.config.*`, `KNOWN_*` ou passo de `validate:*` mudou. `WhatsAppSettings.tsx` e `AiSettings` não mudaram. Nenhum teste foi removido ou pulado. FINAL_AUDIT, vault, `apps/bff/PUBLIC_API_V1.md`, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 8 blockers.** O Tech Lead rodou `visual:compare` dos quatro quadros e abriu os `side-by-side.png`. 3.1, 4.1 e 4.2 já batiam com os quadros, salvo as divergências declaradas. O 4.6 estava incompleto, porque a WU-03 terminou `FAILED`. Os blockers:
   1. 4.6: rodapé com "Fazer isso depois" e "Iniciar teste" lado a lado, em vez de um único CTA primário em largura total.
   2. 4.6: entrelinha da descrição menor que a do quadro e quebra de linha diferente.
   3. 4.6 sem conferência por `visual:compare` nos quatro aparelhos, e IA1 sem medida de início e fim.
   4. `goal099-onboarding-ia-whatsapp.test.tsx` inexistente, sem o vermelho contra a baseline.
   5. Os cinco controles negativos do §6 não rodados.
   6. Nenhum documento: D-106, CURRENT_STATE e VALIDATION_GATE.
   7. `visual:compare` final dos vizinhos, de W1 e de IA1 não rodado.
   8. Gates rodados sobre árvore incompleta, sem valor de execução final.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker.** Os oito blockers da rodada 1 estavam resolvidos. O `visual:compare` do Tech Lead deu números iguais aos do relatório, e os dezesseis `side-by-side.png` mostravam só divergências declaradas. Restava uma regressão com dados reais no mobile: `.onboarding-demo-event > span` tinha `white-space: nowrap` com `min-width: auto`. Um nome de serviço longo (o cadastro aceita até 200 caracteres) abria rolagem horizontal dentro de `.onboarding-content`. A medida do Tech Lead numa página de rascunho com as mesmas regras foi `scrollWidth` 440 contra `clientWidth` 360 a 360 px. O gate de overflow do documento não pega esse caso, e a conta visual usa nome curto. O Tech Lead também apontou, sem bloquear, o "Saiba mais" sublinhado em 4.2.
3. **Rodada 3 — `CHANGES_REQUIRED`, 1 blocker.** A correção de CSS estava certa e foi aceita: o texto do evento encolhe, quebra e fica centralizado. O `visual:compare` do Tech Lead deu os mesmos números da rodada 2. Mas a execução final não foi refeita sobre a árvore nova. VALIDATION_GATE mantinha o `sha256` antigo de `avenly.css` e dizia que nenhuma edição de código veio depois. O gate autenticado em disco (`startTime` 23:30Z de 2026-10-01) era anterior à edição de `avenly.css` (00:01:38Z de 2026-10-02). A WU-11 foi `SKIPPED` por falta de `*_TEST_DATABASE_URL`. D-106 não registrava a retirada do `nowrap`. Os controles negativos não foram refeitos.
4. **Rodada 4 — `ACCEPTED`, 0 blockers.** Só os três documentos mudaram. D-106 ganhou (h) e as divergências 8 e 9. CURRENT_STATE e VALIDATION_GATE trazem a execução da rodada 4, com o `sha256` novo de `avenly.css`, e não apresentam mais a rodada 2 como final. Os oito gates do IA Loop passaram.

O pacote de review registra o perfil do Developer como `SONNET_HIGH` nas rodadas 1 e 2 e `SONNET_MEDIUM` nas rodadas 3 e 4. O Goal declara `SONNET_HIGH`.

## Evidência considerada

Os números estão em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal099), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal099) e na seção "Prova" de D-106.

- **Fidelidade visual, conferida pelo Tech Lead em todas as rodadas.** `visual:compare -- --target 3.1,4.1,4.2,4.6`, exit 0. Nas rodadas 2, 3 e 4, os diffs são iguais aos do relatório (mobile / retrato / paisagem / desktop): 3.1 = 4,6 / 2,6 / 2,4 / 2,0; 4.1 = 1,3 / 1,4 / 1,3 / 1,4; 4.2 = 8,9 / 5,1 / 5,3 / 3,9; 4.6 = 5,4 / 2,3 / 2,7 / 1,9. Na rodada 1, o 4.6 dava 12,1 / 6,2 / 6,4 / 5,0. Na rodada 4 foram abertos os dezesseis `side-by-side.png`. Estrutura, componentes, cores, tipografia e espaçamento batem com os quadros nos quatro aparelhos, salvo as divergências 1 a 9 de D-106.
- **Identidade do código aceito.** O `sha256` de cada arquivo de produção na rodada 4 é igual ao registrado em VALIDATION_GATE (`avenly.css` `27eeaa08…5dd5b42f`, teste novo `c6bb0107…208e6e68`). O código aceito é o mesmo avaliado no mérito na rodada 3.
- **Gate autenticado, conferido em disco pelo Tech Lead na rodada 4.** `apps/frontend/e2e-results/authenticated/results.json` da WU-11 refeita pelo IA Loop, `startTime` 2026-10-02T00:39:30Z, depois da última edição de código: **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`, **0** retentativas. A execução do Developer, de `startTime` 00:18:41Z, deu as mesmas contagens.
- **Execução final do Developer (rodada 4)**, depois da última edição: `typecheck` e `lint` exit 0; `goal099` **12**/**12**; `validate:core` exit 0 (**17** passos, **15** `passed`, **2** `skipped`); `test:frontend` **135** arquivos e **1466** testes, contra **134** e **1453** do Goal090; `test:gate` **233**/**233**; `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas, sem `CI=1`; `validate:integration` **36**/**36**, com Postgres 18.4 nativo e descartável em loopback.
- **Vizinhos e telas de Configurações.** 0, 1.1 a 2.6 e 3.2 iguais ao final do Goal090, célula por célula. W1 (9,1 / 4,3 / 6,6 / 5,5) e IA1 (13,6 / 6,3 / 7,3 / 6,0) idênticos entre o início, medido com os arquivos de `HEAD`, e o fim.
- **Controles negativos.** Cinco, refeitos na rodada 4 depois da última edição, com saída real e `sha256` em VALIDATION_GATE: 1, 3, 3, 1 e 1 teste reprovam, e `12`/`12` volta depois da restauração. Vermelho contra a baseline: 9 dos 12 testes reprovam com os arquivos de produção de `1eaecd0`, medido na rodada 2.
- **Escopo.** `git status --porcelain=v1 -uall` com 23 entradas, todas autorizadas, sem resto de controle negativo nem artefato de `e2e-results/`, inalterado depois do `visual:compare`. `git diff --check` limpo.

## Aceito sem prova completa

1. **O vermelho contra a baseline e os cinco controles negativos não foram reexecutados pelo Tech Lead.** Foram conferidos pelo registro em VALIDATION_GATE e pelos `sha256`. O vermelho é da rodada 2 e não foi repetido na rodada 4; o teste novo tem o mesmo `sha256` e a baseline não mudou.
2. **A coluna "Início" do `visual:compare`** é a coluna final do Goal090, copiada, não remedida. As exceções são 4.1 no mobile, W1 e IA1, remedidos com os arquivos de `HEAD`.
3. **Um teste a mais em `test:frontend`**, além dos 12 do arquivo novo, vem de ajustes em testes existentes e não foi decomposto.
4. **`validate:ui` rodou sem `CI=1`** (6 workers). Os Goals 089 e 090 o rodaram com `CI=1`. O resultado foi **0** retentativas.

## Observações registradas, sem mudar a decisão

1. **Aviso da prévia do 4.6.** O orquestrador envia o texto sem acentos (`ActivationTestService.ts`: "Esta e uma conversa de teste…"), e a tela mostra o mesmo conteúdo com acentos. Está declarado na divergência 6 de D-106. O orquestrador não foi tocado.
2. **"Saiba mais" sublinhado em 4.2.** Vem do padrão do navegador, mantido pela regra `link-in-text-block` do axe. Está declarado na divergência 9. A regra `.whatsapp-consent-link` é compartilhada com Configurações › WhatsApp e não mudou.
3. **4.2 continua o par mais distante do Goal** (8,9 % no mobile). A diferença vem do estado inicial exigido por D-081 (checkbox desmarcado, sem resposta, "Continuar" desabilitado), não do layout.
4. **Banco de `validate:integration`.** Um Postgres em contêiner Docker foi reprovado pela própria suíte na rodada 2, porque a checagem exige porta e endereço de servidor em loopback. O Developer usou um Postgres nativo descartável em `127.0.0.1:55098`. Nenhuma configuração foi mudada.

## O que o aceite não prova

- As etapas num aparelho real. A conferência do §7 (celular real, e que a prévia do 4.6 lê como prévia, e não como mensagem já enviada) **não foi feita**.
- Os quadros 4.3, 4.4, 4.5 e 4.7 a 4.10, fora deste Goal.
- A fase de consentimento em Configurações › WhatsApp, que é tema do Goal097 e reabre D-106 (d) se for feita.
- A gravação do consentimento e da resposta sobre número pessoal, que depende de decisão de produto e jurídica (D-081, "Revisar se").
