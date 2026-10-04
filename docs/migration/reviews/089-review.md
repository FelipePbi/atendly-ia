# Review formal — Goal 089

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, em review DEEP, conforme o [Goal089](../goals/089-casca-do-onboarding-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–088 e 098) foi reaberto, reavaliado ou revertido.

O Goal porta uma vez a moldura do onboarding do protótipo para todas as etapas: topo de progresso abaixo de 1024 px, sidebar com painel de 1024 px em diante, progresso parcial derivado do fluxo, stepper com ✓ no concluído, CTA ancorado e título em serif. Critério visual: `/onboarding/boas-vindas`, `/onboarding/segmento-e-nome`, `/onboarding/sistema-atual` e `/onboarding/tom-da-ia` iguais aos quadros 0, 1.1, 2.1 e 3.2 nos quatro devices. A decisão é [D-104](../DECISIONS.md), aceita neste fechamento. Ela substitui duas partes do item 2 de D-094 e o lugar do "Sair" do item 9 de D-083; as duas ganharam nota de substituição parcial.

## Escopo e identidade do diff

- Baseline aceita vigente: `46191dcec3e2b32f1e20b8c117d5f564f33c3499` (Goal098). Base imediata da implementação: `27e1a59abb53904c4bfa8acc094bbe1ec6e4f887`, HEAD da worktree `.ai-worktrees/goal-089`, inalterado nas duas rodadas. Entre `46191dc` e `27e1a59` há só documentação: a virada de status do Goal098 (`0acc20e`) e o fechamento do Goal098 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **19 arquivos**, hash do diff `239c33b6d05b5f2c01c9d9a2578b7c35196844328b25ad2cef5eb2b76cb1200e`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os arquivos de código, por `git diff --numstat 27e1a59` no snapshot aceito:
  - `apps/frontend/src/features/onboarding/OnboardingShell.tsx` (+133/−96): moldura única para `OnboardingShell` e `OnboardingFrame`, com topo, sidebar, stepper e "Sair".
  - `blocks.ts` (+54/−11): `chapterFraction(scenario)` e `fill` por capítulo em `chapterProgress`.
  - `OnboardingScreen.tsx` (+14/−5), `blocks/business.tsx` (+29/−30) e `blocks/shared.tsx` (+21/−3): nota da Boas-vindas, cena e cartões de ação com ícone do 2.1.
  - `src/shared/styles/avenly.css` (+747/−292): regras `.onboarding-*` e `.step-*`. Não há folha nova.
  - `src/shared/ui/Brand.tsx` (+1/−1, `BrandMark` exportado), `src/shared/icons/Icon.tsx` (+1) e `public/icons/avenly-icons.svg` (+1): ícone `import`.
  - Testes: `tests/goal089-onboarding-shell.test.tsx` (novo, **15** testes) e asserções ajustadas em `goal018` (+10/−7), `goal065` (+6/−1), `goal066` (+5/−4), `goal072` (+2/−2) e `goal079` (+1/−1).
  - Gate autenticado: G-6 em `e2e/authenticated-matrix.spec.ts`, só por acréscimo (+236/−0).
  - Documentos: `docs/migration/DECISIONS.md` (D-104), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- Nenhuma rota, contrato, BFF, serviço, migration, variável, `e2e/routes.ts`, `e2e/visual/targets.json`, `playwright.*.config.ts`, `vitest.config.*`, `KNOWN_*` ou passo de `validate:*` mudou. Nenhum teste foi removido ou pulado. FINAL_AUDIT, vault, `apps/bff/PUBLIC_API_V1.md`, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não foram editados, como o Goal manda.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 6 blockers.** O Tech Lead rodou `visual:compare` dos quatro quadros (0,5 % a 5,5 %) e abriu os dezesseis `side-by-side.png`. A moldura já batia com o protótipo, e G-6 já existia e passava. Os blockers:
   1. Regressão no gate autenticado: `onboarding-whatsapp › measured, logged in` reprovava em mobile 360 e 390 (`"Conectar meu WhatsApp" is 350px wide in a 390px action bar`), pelo padding horizontal novo de `.onboarding-actions`.
   2. O símbolo da marca na sidebar saía escuro, porque `.brand` herda `color: var(--fg)`; no quadro ele é petróleo, em paisagem e desktop nos quatro quadros.
   3. Os quatro controles negativos do §6 não tinham rodado.
   4. Nenhum documento no diff: D-104, CURRENT_STATE e VALIDATION_GATE ausentes.
   5. `ImportIcon` inline em `OnboardingScreen.tsx` e uma segunda cópia do SVG da marca em `OnboardingTop`, contra "Ícones que faltarem, em `Icon.tsx` e no sprite".
   6. Faltava no relatório a execução final em ordem e o `visual:compare` do §2, no início e no fim.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** Os seis foram fechados: o respiro do rodapé virou margem de `.onboarding-actions`; `.onboarding-sidebar .brand-mark` usa a cor de acento; `import` entrou no sprite e em `Icon`, e `BrandMark` é exportado e reaproveitado; controles, documentos e execução final foram entregues. Os oito gates do IA Loop passaram.

O pacote de review registra o perfil do Developer como `SONNET_HIGH` nas duas rodadas; o Goal declara `OPUS_MEDIUM`.

## Evidência considerada

Os números estão em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal089), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal089) e na seção "Prova" de D-104.

- **Fidelidade visual, conferida pelo Tech Lead.** `visual:compare -- --target 0,1.1,2.1,3.2`, com diffs iguais aos do relatório (mobile / retrato / paisagem / desktop): 0 = 1,2 / 0,5 / 0,9 / 0,6; 1.1 = 0,6 / 0,6 / 1,0 / 1,2; 2.1 = 2,4 / 0,8 / 0,9 / 0,8; 3.2 = 5,5 / 1,4 / 1,9 / 1,4. Nos dezesseis `side-by-side.png`, estrutura, componentes, cores, tipografia e espaçamento batem: topo com chevron, segmentos com preenchimento parcial e eyebrow; sidebar de 340/420 px com o stepper; coluna de 560/600 px; CTA de 52 px no rodapé. O stepper, o chevron e a seta dos cartões foram recortados em resolução cheia: o vermelho do diff ali é anti-aliasing.
- **Etapas do §2.** Dos 64 pares quadro e largura do Developer, 62 não pioram. As duas pioras são mobile, com causa medida: 1.3 (CTA ancorado longe da posição do quadro com o teclado aberto) e 4.6 (conteúdo do Goal090).
- **Gate autenticado, conferido em disco pelo Tech Lead.** Execução da WU-10 do IA Loop, `startTime` `17:35:04Z`, depois da última edição de código: **245** `expected` (**235** da base mais **10** de G-6), **0** `unexpected`, **0** `flaky`, **0** retentativas. A execução do Developer (`17:17:20Z`) deu a mesma contagem.
- **Execução final do Developer**, depois da última edição: `validate:core` exit 0 (**17** passos, **15** `passed`, **2** `skipped`); `test:frontend` **133** arquivos e **1430** testes, contra **132** e **1415** da baseline; `test:gate` **233**/**233**; `validate:ui` com `CI=1`, **169** `passed`, **21** `skipped`, **0** retentativas; `validate:integration` **36**/**36**.
- **Controles negativos.** Cinco (1, 2a, 2b, 3 e 4), feitos depois da última edição, com saída real e `sha256` em VALIDATION_GATE. Os `sha256` atuais de `OnboardingShell.tsx`, `blocks.ts` e `avenly.css` batem com os registrados.
- **Escopo.** `git status` lista só os arquivos autorizados. `apps/frontend/AGENTS.md` aparecia modificado durante o `next dev` do `visual:compare` e voltou ao normal depois. `e2e-results/` é ignorado pelo git. Asserções de testes existentes mudaram só nos casos que o §5 autoriza; a de `goal066` (de "sem `svg`" para "sem `use` de `#i-check`") preserva a intenção do teste, nenhum ✓ no cartão, e foi aceita.

## Aceito sem prova completa

1. **O vermelho das provas 1 a 4 contra os arquivos de produção da baseline** não foi repetido na rodada 2, embora o §4 peça. A prova de que elas reprovam é a dos controles negativos.
2. **Os controles negativos não foram reexecutados pelo Tech Lead.** Foram conferidos pelo registro em VALIDATION_GATE e pelos `sha256`.
3. **`validate:ui` da WU-09, sem `CI=1`,** teve **5** `flaky` (164 `expected`, 21 `skipped`, 0 `unexpected`), todos em rotas públicas: `Target crashed`, worker encerrado e timeout de `beforeEach`, por memória do ambiente. Nenhum ligado ao onboarding. O `validate:ui` sem retentativa é o do Developer, com `CI=1`.
4. **Uma corrida de `validate:integration` do Developer** parou em `goal008-agenda.test.ts` (`completed: 2`) sobre um banco do Scheduling deixado por corridas interrompidas, a assinatura descrita no Goal098. A causa não foi investigada além dessa semelhança; a corrida seguinte, sem edição, passou **36**/**36**.

## Observações registradas, sem mudar a decisão

1. **Frases de exemplo do 3.2.** A diferença para o quadro não é só dado da conta, como a proposta dizia: vem do template de `demo.ts` (D-095, item 3), anterior a este Goal e fora do escopo dele. A divergência 3 de D-104 foi reescrita no fechamento.
2. **Estado do "Continuar" em 1.1 e 3.2.** Na corrida do Developer saiu desabilitado; na do Tech Lead, habilitado nos dois. Depende do que a conta do `visual:compare` já escolheu. Texto corrigido em D-104, CURRENT_STATE e VALIDATION_GATE.
3. **Regras mortas.** Sobram regras `.onboarding-main` no media query `max-width: 767px` de `avenly.css`. A classe ainda é usada por estados de carregamento; conferir antes de remover.
4. **1.3 no mobile piora** (8,5 para 16,7 %) porque o CTA ancorado fica no rodapé, e o quadro mostra o teclado aberto com o CTA logo acima dele. Só a conferência do §7 decide se o comportamento num aparelho real está certo.

## O que o aceite não prova

- A moldura num aparelho real: a conferência do §7 (celular com o teclado aberto em Segmento e nome e o CTA ancorado; rotação do tablet no meio de uma etapa) **não foi feita**.
- O conteúdo próprio de 1.2, 1.3, 2.2 a 2.6, 2.I1, 3.1, 4.1, 4.2 e 4.6, que é do Goal090.
- As telas do módulo de importação dentro da moldura.
