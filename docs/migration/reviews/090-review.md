# Review formal — Goal 090

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, em review DEEP, conforme o [Goal090](../goals/090-etapas-de-negocio-e-agenda-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–089 e 098) foi reaberto, reavaliado ou revertido.

O Goal porta o conteúdo das sete etapas de negócio e agenda dos quadros 1.2, 1.3, 2.2, 2.3, 2.4, 2.5 e 2.6, dentro da moldura do Goal089: o eyebrow é o nome do capítulo, a importação ganha a ilustração e a ordem do quadro, o primeiro serviço termina em "Salvar serviço", a lista de serviços mostra o rascunho e os já criados, e o horário-base tem a descrição por dias, os cartões Começa/Termina, a régua e o painel por dia sob demanda. A decisão é [D-105](../DECISIONS.md), aceita neste fechamento. Ela não substitui nenhuma decisão anterior; completa D-104.

## Escopo e identidade do diff

- Baseline aceita vigente: `f9bb86c26039d417097d8ff2122df8dd8415b07e` (Goal089). Base imediata da implementação: `1442fa3181742286bd314f1b33e91d90433ad600`, HEAD da worktree `.ai-worktrees/goal-090`, inalterado nas quatro rodadas, sem commit na worktree. Entre `f9bb86c` e `1442fa3` há só documentação: a virada de status do Goal089 (`6d25413`) e o fechamento do Goal089 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos**, hash do diff `33b040b607826a74886654013c46d61cfd6422ad2dbf9671d8fd1002c1cfdf79`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os arquivos, por `git diff --numstat 1442fa3` no snapshot aceito:
  - `apps/frontend/src/features/onboarding/blocks/schedule.tsx` (+325/−164): ilustração de 2.2, lista de 2.4, `ServiceFields` com o adorno "R$" e `data-error-anchor` na caixa do preço, cartões Começa/Termina, régua e "Personalizar dias diferentes" de 2.6.
  - `scenarios.ts` (+11/−11), `OnboardingScreen.tsx` (+20/−6), `blocks/business.tsx` (+1/−1) e `blocks/shared.tsx` (+7/−1): eyebrow e textos dos quadros, ordem das ações de 2.2, CTA "Salvar serviço", `hoursStepDescription`, rótulo de 1.2 em `sr-only` e `markFieldError` com `data-error-anchor`.
  - `src/shared/ui/CurrencyInput.tsx` (+15/−4): prop opcional `hideSymbol`, padrão `false`, ligada só no onboarding.
  - `src/shared/styles/avenly.css` (+614/−46): regras das sete etapas, remoção de `.onboarding-page`, `.hours-range` e `.hours-range-text`, e especificidade maior nos seletores de 1.1. Não há folha nova.
  - `e2e/routes.ts` (+2/−2): dois `contentMarker` com os títulos novos de `servico-nome` e `servicos-adicionais`. Fora da lista de pontos de implementação, mas exigido pela troca de texto e justificado em D-105 (b); aceito.
  - Testes: `tests/goal090-onboarding-steps.test.tsx` (novo, **22** testes) e asserções ajustadas em `goal018` (+2/−2), `goal065-onboarding-copy-whatsapp` (+1/−1), `goal065-onboarding-schedule` (+22/−13, com duas asserções novas do erro de preço fora da caixa), `goal066` (+2/−2), `goal072` (+41/−17) e `goal084` (+1/−1).
  - Documentos: `docs/migration/DECISIONS.md` (D-105, só inserções depois de D-104), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
  - **Fora do Goal:** `tools/ia-loop/lib/orphan-evidence.mjs` (+2/−2), `process-inspector.mjs` (+15/−0), `resource-lifecycle.mjs` (+2/−2) e `tools/ia-loop/tests/resource-lifecycle.test.mjs` (+29/−0). Ver "Mudança de harness no snapshot" abaixo.
- Nenhuma rota, contrato, BFF, serviço, migration, variável, `e2e/visual/targets.json`, `playwright.*.config.ts`, `vitest.config.*`, `KNOWN_*` ou passo de `validate:*` mudou. Nenhum teste foi removido ou pulado. FINAL_AUDIT, vault, `apps/bff/PUBLIC_API_V1.md`, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 5 blockers.** O Tech Lead rodou `visual:compare` dos sete quadros, com números iguais aos do relatório, e mediu pixels nos PNGs de 2.6. 1.2, 1.3, 2.4 e 2.5 já batiam, salvo divergências declaradas. Os blockers:
   1. 2.2: as barras da ilustração usavam `--surface-secondary` (#F3EFE8) e `--accent-soft` (#EDF4F3), não #EFEAE2 e #DCECEB do quadro.
   2. 2.3: "R$ 90,00" inteiro na cor do texto, em vez do prefixo "R$" como adorno em #716859 com 8 px de folga.
   3. 2.6: cartões Começa/Termina com 86–87 px (quadro 84) e "Personalizar dias diferentes" com 73 px (quadro 68).
   4. Documentação imprecisa: "Sem preço" contra "sem preço informado" da UI; rótulo `sr-only` atribuído a 1.3 em vez de 1.2; desvio de cor de `.hours-bar-scale` não declarado; divergência do CTA de 1.3 declarada só no mobile.
   5. Gate autenticado anterior à última edição de código (`startTime` 19:53:30Z contra edição de `avenly.css` às 20:09:24Z) e sem contagem nos documentos.
2. **Rodada 2 — `CHANGES_REQUIRED`, 3 blockers.** Os blockers visuais 1 a 3 estavam resolvidos (`visual:compare` do Tech Lead igual ao relatório). Restavam:
   1. Regressão do §3: com a caixa nova do preço, `markFieldError` punha "Informe o valor do serviço." **dentro** de `div.price-value-field`, em 2.3 e no formulário de adicional de 2.4, por falta de `data-error-anchor`.
   2. Documentação: divergência 4 ainda só no mobile; nome errado da caixa (`label.price-value-field`); `CurrencyInput.tsx` fora das Consequências de D-105; `sha256` de `blocks/schedule.tsx` contraditórios em VALIDATION_GATE.
   3. Controles 1, 2 e 4 do §6 e os gates não refeitos depois da última edição.
3. **Rodada 3 — `CHANGES_REQUIRED`, 3 blockers, todos documentais.** O código e o visual estavam aceitáveis: `data-error-anchor` em `div.price-value-field`, duas asserções novas em `goal065`, `goal090` e `goal065` 59/59 na revisão. Restavam:
   1. Regressão nova: o diff tinha reescrito o parágrafo **Prova:** de D-104 (Goal089, já ACCEPTED), trocando os controles do Goal089 pelos do Goal090.
   2. `CurrencyInput.tsx` ainda fora das Consequências de D-105.
   3. Controle 4 com contagem divergente entre D-105 (`2 failed`) e VALIDATION_GATE (`1 failed`).
4. **Rodada 4 — `ACCEPTED`, 0 blockers.** Entre os patches 090-r3 e 090-r4 só `DECISIONS.md` mudou. `git diff 1442fa3 -- docs/migration/DECISIONS.md` tem 44 inserções e 0 remoções; o **Prova:** de D-104 está idêntico ao de `1442fa3`. D-105 cita `CurrencyInput.tsx` e `hideSymbol`. Os quatro controles têm as mesmas contagens em D-105, CURRENT_STATE e VALIDATION_GATE. Os oito gates do IA Loop passaram (typecheck, lint, `goal090` 22/22, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `git diff --check`).

O pacote de review registra o perfil do Developer como `SONNET_HIGH` nas rodadas 1 e 2 e `SONNET_MEDIUM` nas rodadas 3 e 4; o Goal declara `SONNET_HIGH`.

## Evidência considerada

Os números estão em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal090), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal090) e na seção "Prova" de D-105.

- **Fidelidade visual, conferida pelo Tech Lead em todas as rodadas.** `visual:compare` dos sete quadros, exit 0, com diffs iguais aos do relatório nas rodadas 2, 3 e 4 (mobile / retrato / paisagem / desktop): 1.2 = 0,6 / 0,2 / 0,7 / 0,4; 1.3 = 14,8 / 4,4 / 4,6 / 3,7; 2.2 = 1,1 / 0,4 / 0,7 / 0,7; 2.3 = 2,1 / 0,6 / 1,0 / 0,5; 2.4 = 2,9 / 1,3 / 1,7 / 1,3; 2.5 = 1,2 / 0,5 / 1,0 / 0,8; 2.6 = 3,3 / 2,4 / 1,7 / 1,4. Na rodada 4 foram abertos os `side-by-side.png` de 1.2 (mobile, paisagem), 1.3 (mobile, paisagem), 2.2 (mobile, retrato, desktop), 2.3 (mobile, desktop), 2.4 (mobile, paisagem), 2.5 (mobile, desktop) e 2.6 (mobile, paisagem); a rodada 3 abriu outros pares, incluindo retrato e desktop de 1.3, 2.4 e 2.6. Estrutura, componentes, cores, tipografia e espaçamento batem, salvo as divergências declaradas em D-105.
- **Identidade do código aceito.** O `sha256` dos sete arquivos de produção (`scenarios.ts`, `OnboardingScreen.tsx`, `business.tsx`, `schedule.tsx`, `shared.tsx`, `CurrencyInput.tsx` e `avenly.css`) na rodada 4 é igual ao registrado em VALIDATION_GATE. O código aceito é o mesmo avaliado no mérito na rodada 3.
- **Gate autenticado, conferido em disco pelo Tech Lead na rodada 3.** `apps/frontend/e2e-results/authenticated/results.json`, `startTime` 21:25:17Z, depois da última edição de código: **245** `expected`, **0** `unexpected`, **0** `flaky`. A WU-11 do IA Loop foi `SKIPPED` por falta de banco naquela rodada; a prova de `validate:integration` é a execução do Developer, confirmada pelo `results.json`, e o gate `validate-integration` passou na rodada 4.
- **Execução final do Developer (rodada 3)**, depois da última edição: `validate:core` exit 0 (**17** passos, **15** `passed`, **2** `skipped`); `test:frontend` **134** arquivos e **1453** testes, contra **133** e **1430** do Goal089; `test:gate` **233**/**233**; `validate:ui` com `CI=1`, **169** `passed`, **21** `skipped`, **0** retentativas; `validate:integration` **36**/**36**.
- **Controles negativos.** Quatro, refeitos na rodada 3 depois da última edição, com saída real e `sha256` em VALIDATION_GATE; mais a prova própria do erro de preço fora da caixa (`2 failed | 35 passed (37)` em `goal065-onboarding-schedule` sem `data-error-anchor`).
- **Escopo.** `git status` sem resto de controle negativo nem artefato de `e2e-results/`.

## Mudança de harness no snapshot

Os quatro arquivos de `tools/ia-loop/` estão no snapshot aceito desde a rodada 1 e não são trabalho do Developer neste Goal. São correção do harness feita pelo DIAG-001 do IA Loop durante a execução: `sameProcessStart`, com `PROCESS_START_TOLERANCE_MS` de 2 s, passa a comparar o start time do processo dono do Postgres temporário (gravado pelo próprio processo) com o reportado pelo sistema operacional, que diferem em frações de segundo para o mesmo processo; antes, a comparação exata tratava o dono vivo como pid reciclado. Os dois testes novos de `resource-lifecycle.test.mjs` cobrem o jitter subsegundo (dono vivo, recurso preservado) e a diferença de minutos (pid reciclado, órfão limpo).

Esses arquivos ficam fora dos pontos de implementação do Goal090, e o critério 7 pede `git status` só com arquivos autorizados. O Tech Lead registrou isso nas rodadas 1 a 4 como ponto para o fechamento, não como blocker do Developer, que não devia revertê-los. A recomendação é integrar a mudança de harness à parte do commit de produto do Goal090, ou excluí-la dele. Este documento não decide como o commit de fechamento é montado.

## Aceito sem prova completa

1. **O vermelho das provas 1 a 5 contra os arquivos de produção da baseline** não está registrado nos documentos. A prova de que elas reprovam é a dos controles negativos.
2. **Os controles negativos não foram reexecutados pelo Tech Lead.** Foram conferidos pelo registro em VALIDATION_GATE e pelos `sha256`.
3. **A coluna "Início" do `visual:compare`** é a coluna final do Goal089, copiada, não remedida; a recontagem de início do Goal090 (WU-01) não foi encontrada.
4. **4.2 em paisagem piora 0,1 ponto** (7,4 para 7,5), estável em três corridas, com causa não medida. O quadro 4.2 está fora deste Goal (vai para o 099).
5. **O parágrafo "Prova" de D-105 não diz "rodada 3"** para os controles; CURRENT_STATE e VALIDATION_GATE dizem. Não muda nenhuma contagem.

## Observações registradas, sem mudar a decisão

1. **AM/PM em 2.6** vem do harness: `visual:compare` cria o contexto com `locale: "pt-BR"` sem `--lang`, e o `<input type="time">` nativo sai em 12 horas. Com `--lang=pt-BR`, o mesmo campo mostra `18:00`. O script fica em `scripts/`, fora do escopo.
2. **Painel de 2.6 aberto na captura** vem da conta visual: `scripts/lib/visual-seed.mjs` grava sábado 09:00–14:00, e `HoursStepBody` abre o painel quando algum dia marcado tem horário próprio.
3. **Cor das marcas da régua** (#716859 contra #948B80 do quadro) é desvio deliberado por contraste AA, declarado em D-105 (divergência 10).
4. **1.3 continua o par mais distante** (14,8 % no mobile) por causa do campo único e do CTA ancorado contra o teclado aberto do quadro. A busca de CEP depende de decisão humana pendente.
5. **Corridas seguidas de `visual:compare`** batem no limite de login da conta visual (`429`, `RATE_LIMITED`). Não afetou a corrida final.

## O que o aceite não prova

- As etapas num aparelho real: a conferência do §7 (celular com o teclado aberto em Endereço e em Primeiro serviço, com o CTA ancorado; legibilidade da régua de horas e do resumo de dias) **não foi feita**.
- CEP, rua e número, e complemento em 1.3, que dependem da decisão humana sobre a busca de CEP.
- O conteúdo de 2.I1 (Goal097) e de 3.1, 4.1, 4.2 e 4.6 (Goal099).
