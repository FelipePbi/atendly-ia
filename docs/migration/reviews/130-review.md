# Review formal — Goal 130

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal130](../goals/130-os-horarios-por-dia-do-onboarding-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 1 saiu `CHANGES_REQUIRED` com 3 blockers, todos só de documentação; o IA Loop aceitou a rodada e adiou as correções para este fechamento, sem nova rodada do Developer. As correções foram aplicadas aqui, só em `docs/migration/`.

Os horários por dia do onboarding ficam iguais ao quadro 2.7 nos quatro devices, e o horário-base fica igual ao quadro 2.6 na captura, recolhido, salvo as divergências declaradas em D-144. "Personalizar dias diferentes" abre "Horários por dia" na mesma etapa e na mesma URL `/onboarding/horarios`; a leitura com um dia diferente abre a tela sozinha; o chevron volta ao horário-base e zera `dayHours`; cada linha marcada abre os campos só daquele dia; "Copiar <dia> para outros dias" iguala os dias marcados sem gravar; "Salvar horários" grava com `persistScheduleStep("horarios")`. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-144](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `2130734f086f11fe1893bccd4d5a949f1940d241` (Goal129). Base imediata da implementação: `1b0473c89651008fbb63050dd7344ea2b54ee2be`, HEAD da worktree `.ai-worktrees/goal-130`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **17 arquivos** (15 rastreados e 2 novos não rastreados), hash do diff `8ea4443aba03b69a49e5a8a1c36f681eba5795b3e90e95b876aac383010e8869`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (5): `features/onboarding/OnboardingScreen.tsx` (`hoursDayViewOpen`, título, texto e "Salvar horários" da tela por dia, chevron com ação), `features/onboarding/OnboardingShell.tsx` (`OnboardingBack` com a forma `{ onClick }`), `features/onboarding/blocks/schedule.tsx` (`DayHoursView`, a cópia), `features/onboarding/blocks/shared.tsx` (o tipo da tela por dia) e `shared/styles/avenly.css` (`.hours-day-card`, `.hours-day*`, `.hours-copy*`, `button.onboarding-back-link`);
  - `apps/frontend/tests/` (6): os novos `goal130-horarios-por-dia.test.tsx` (24) e `goal130-alvos-captura.test.ts` (9) e os ajustados `goal065-onboarding-schedule`, `goal066-onboarding-sistema-atual`, `goal072-onboarding-schedule-fields` e `goal090-onboarding-steps`;
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (2.7 novo, sem `responses` e sem passos; 2.6 com `GET /v1/onboarding` fixo) e `scripts/tests/visual-responses.test.mjs` (de 57 para 58 testes);
  - o gate autenticado (1): `apps/frontend/e2e/authenticated-matrix.spec.ts`, bloco `onboarding-horarios`, alterado pela DIAG-001;
  - `docs/migration/` (3, por acréscimo): D-144 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal130 em `VALIDATION_GATE.md`.
- `authenticated-matrix.spec.ts` está fora da lista do critério 8. O Tech Lead aceitou o desvio: a evidência 5 do Goal dizia que o gate não alcança a tela por dia, mas o spec já clicava "Personalizar dias diferentes" e esperava `aria-expanded`, que a tela nova tira da página. O ajuste mantém o clique real e a asserção de abertura. `OnboardingRuntime.tsx`, `scenarios.ts`, `e2e/routes.ts`, as sementes da captura e do gate, `apps/ai-orchestrator/`, o BFF, os serviços e `tools/ia-loop/` não foram tocados. O documento do Goal130 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — review `CHANGES_REQUIRED`, 3 blockers só de documentação; decisão efetiva `ACCEPTED`, com as correções adiadas para o fechamento.** A WU-01 fez a tela; a WU-02 fez a captura, os testes da captura, o `visual:compare`, os controles negativos e os registros. A primeira execução do `validate:integration` (WU-10, tentativa 1) saiu com 1: 300 passando e 5 falhando, todas `onboarding-horarios`, porque o spec esperava `aria-expanded` num botão que sai da tela. A DIAG-001 ajustou o spec, e a reexecução da WU-10 saiu com 0 (36 de 36 passos, 305 passando, 0 retentativas). O review DEEP aprovou o código, os testes e a captura, e aceitou o desvio do critério 8. Os blockers: `VALIDATION_GATE.md`, `CURRENT_STATE.md` e D-144 ainda descreviam a árvore de antes da DIAG-001 (spec sem mudança, `validate:integration` com saída 1, ajuste "pendente" ou "para a decisão do Tech Lead").

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `VALIDATION_GATE.md`, seção do Goal130 (blocker 1, adiado):
   - a abertura passou a citar a DIAG-001 e a dizer que os números são confirmados pelos gates do IA Loop da rodada 1, com o `validate:integration` da reexecução da WU-10;
   - a linha `validate:integration` de "Contagens" passou à execução final (saída 0, 36 de 36 passos, 305 passando, 0 retentativas, `onboarding-horarios` medindo "Horários por dia" nas cinco larguras), com a primeira execução (saída 1, 300 passando e 5 falhando, todas `onboarding-horarios`, `aria-expanded` ausente) registrada junto;
   - abaixo da tabela, a confirmação de typecheck, lint, `goal130` (33), frontend (185/2464), `test:gate` (291), `validate:core` (15 passando, 2 pulados) e `validate:ui` (169 passando, 21 pulados, 0 retentativas) pelas WU-03 a WU-09;
   - "Gate autenticado" passou a descrever o ajuste da DIAG-001 e o aceite do desvio do critério 8, mantendo o ensaio da WU-02 (304 passando e 1 `flaky`) como histórico;
   - "Escopo" passou a listar `authenticated-matrix.spec.ts` como alterado pela DIAG-001.
2. `CURRENT_STATE.md`, delta do Goal130, item "Captura e gate" (blocker 2, adiado): o ajuste "pendente" passou ao ajuste da rodada 1 (DIAG-001), com o clique, o h1 "Horários por dia", "Salvar horários", a medida da tela por dia nas cinco larguras e o `validate:integration` com saída 0 e 305 passando, 0 retentativas; o spec entrou nos arquivos do Goal.
3. `DECISIONS.md`, D-144 (blocker 3, adiado): o item 9 foi reescrito com o ajuste da DIAG-001, o aceite do Tech Lead, o que o gate mede depois do clique (inclusive as linhas do sábado e do domingo em `#716859`), o horário-base provado só pelo marcador da rota, o resultado final e o desvio declarado dos critérios 8 e 7 ("no horário-base"), causado pela evidência 5; a última cláusula de "Revisar se" deixou de dizer que o gate ainda não mede a tela por dia. O status passou a ACCEPTED, com a nota de fechamento.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal130), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal130) e em D-144.

- **Gates do IA Loop, rodada 1, na árvore aceita:** typecheck (WU-03), lint (WU-04), testes alvo (WU-05, `goal130`, 33 testes), suíte do frontend (WU-06, 185 arquivos e 2464 testes), `test:gate` (WU-07, 291), `validate:core` (WU-08, 15 passando e 2 pulados), `validate:ui` (WU-09, 169 passando e 21 pulados, 0 retentativas), `validate:integration` (WU-10, reexecução depois da DIAG-001: 36 de 36 passos, gate autenticado com 305 passando e 0 retentativas) e `git diff --check` (WU-11), todos com saída 0. A tentativa 1 da WU-10, antes da DIAG-001, saiu com 1 (300 passando, 5 falhando em `onboarding-horarios`).
- **DIAG-001:** rodou o ensaio do goal033 limitado a `onboarding-horarios` (5 passando, 0 retentativas, nas cinco larguras) e `tsc --noEmit`; o `validate:integration` completo ficou para a reexecução do IA Loop, que passou.
- **Controles negativos do Developer (WU-02):** (a) a tela por dia sem abrir pela leitura, 15 de 24; (b) o tom em todo dia marcado, 3 de 24; (c) a cópia que não muda o intervalo-base, 2 de 24 (a variante que só não esvazia `dayHours` não reprova, e o registro explica por quê); (d) "Salvar horários" com só o intervalo-base, 1 de 24; (e) o 2.7 com um passo, 1 de 9 em `goal130-alvos-captura.test.ts` e 1 de 58 em `visual-responses.test.mjs`. Cada mutação foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código:** a tela por dia fica na mesma etapa e URL; abre pelo cartão e pela leitura com um dia diferente; o chevron `{ onClick }` zera `dayHours`; o foco vai ao título e volta ao cartão; a cópia faz do intervalo do dia copiado o intervalo-base e esvazia `dayHours`; "Salvar horários" usa `persistScheduleStep`; o CSS fica em classes novas. Os ajustes dos testes existentes não afrouxam asserção.
  - **Spec do gate:** o clique real segue, e a asserção de abertura passou a provar a tela nova (h1 "Horários por dia" e "Salvar horários").
  - **`visual:compare` de 2.7 e 2.6:** refeito pelo Tech Lead (8 pares, saída 0), com os oito `side-by-side.png` abertos. 2.7 em 0,5/0,2/0,6/0,4% e 2.6 em 2,1/0,8/1,0/0,9% (mobile, tablet em retrato, tablet em paisagem, desktop). No 2.7, linhas, tom e lápis do sábado, "Copiar sábado para outros dias", "Salvar horários" e título coincidem com o quadro; o 2.6 aparece recolhido, como o quadro.

## Divergências aceitas

Declaradas pelo Goal ou por D-144, conferidas nas capturas:

1. O "Domingo" e o "Não atende" da linha do domingo em `#716859` (5,41:1) no lugar de `#948B80` (3,30:1, abaixo de AA).
2. O preenchimento do segundo segmento da barra de progresso, derivado por `chapterFraction` (D-104).
3. O "Sair" do topo abaixo de 1024 px e do rodapé da sidebar (D-104).
4. A barra de status e o indicador de início do iPhone nos quadros mobile.
5. No 2.6, o "AM/PM" do harness nos campos de hora e a cor das marcas da régua (D-105, divergências 7 e 10).
6. O gate autenticado mede a tela por dia depois do clique, e não o horário-base; o horário-base fica provado só pelo marcador da rota. Desvio dos critérios 8 e 7, registrado em D-144, item 9.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer, da WU-02; o Tech Lead não os refez. A DIAG-001 só mudou o spec do gate, que os controles não cobrem.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` de 2.7 e 2.6.
3. **A regressão de 2.3, 2.4 e 2.5** é a do Developer (12 de 12 `app.png` iguais byte a byte); o Tech Lead não a refez.
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.
