# Review formal — Goal 134

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal134](../goals/134-a-importacao-concluida-do-onboarding-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 1 não teve blocker.

A importação concluída do onboarding (2.I10) fica igual ao quadro nos quatro devices, só na moldura do onboarding (`/onboarding/importacao`), salvo as divergências declaradas em D-148. `ImportsFlow` monta o novo `ImportDoneScreen` só com `history` na moldura `onboarding`: o selo decorativo, "Importação concluída" como único `h1`, a descrição do quadro, uma pílula por categoria importada com o texto curto de `historyPillLabel()` e "Horários" sem número, e a nota de pendência e de falha só quando existem. No rodapé, "Continuar" tem a medida e a cor do quadro, o aviso de sucesso de `demonstracao-da-ia` sai, os dois avisos que mudam o destino ficam, e a nota "O histórico desta importação fica em Mais › Importação." (ou "Configurações › Importação." a partir de 1100 px) aparece abaixo do botão. Em `/importacao` continua o I1 (`ImportHistoryScreen` e `ImportHistoryCard`), sem mudança. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-148](../DECISIONS.md), aceita neste fechamento; ela revê em parte D-084 item 5 e D-119 só para a conclusão.

## Escopo e identidade do diff

- Baseline aceita vigente: `a3cb8f1ec7b4480bb3b5cdea8caaa648b52ab0db` (Goal133). Base imediata da implementação: `e732e8b45e90dcdd7646fccda0f75e8e28f9f84a`, HEAD da worktree `.ai-worktrees/goal-134`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **16 arquivos** (13 rastreados e 3 novos não rastreados), hash do diff `6d319a9c0230bcb0ce09cc22f672724e75ca6636a98e6270d782a5c760c288bf`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (5): o novo `features/imports/ImportDoneScreen.tsx`, `features/imports/ImportsScreen.tsx` (a escolha por moldura em `ImportsFlow`), `features/imports/labels.ts` (só o acréscimo de `historyPillLabel`), `features/onboarding/OnboardingImportStep.tsx` (só a condição do aviso de sucesso e `ImportDonePathNote`) e `shared/styles/avenly-imports.css` (classes novas `.imports-done*`, num bloco antes do bloco do andamento);
  - `apps/frontend/tests/` (6): os novos `goal134-conclusao.test.tsx` (41) e `goal134-alvo-captura.test.ts` (11), 52 testes, e os ajustados só no texto, na forma ou na lista (`goal066-onboarding-importacao`, o `h1` de nível 1 e o aviso de sucesso ausente; `goal105-importacao`, o cartão ausente no onboarding e mantido em `/importacao`; `goal132-alvos-captura` e `goal133-alvo-captura`, o 2.I10 entre os donos de `responses`);
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (97 alvos, o 2.I10 sem passos e com um só `GET` fixo, `/v1/calendar/imports`, da sessão `visual-compare-import-done`) e `scripts/tests/visual-responses.test.mjs` (61 testes);
  - `docs/migration/` (3, por acréscimo): D-148 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal134 em `VALIDATION_GATE.md`.
- `authenticated-matrix.spec.ts`, `avenly.css`, `ImportHistoryCard.tsx`, `ImportRunScreen.tsx`, `ImportsLayout.tsx`, `OnboardingRuntime.tsx`, `features/settings/`, `ONBOARDING_ROUTES`, as sementes da captura e do gate, o BFF, os serviços e `tools/ia-loop/` não foram tocados. O documento do Goal134 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (a tela, os testes dela e as duas capturas da baseline), WU-02 (o alvo 2.I10 e os testes da captura), WU-03 (o `visual:compare`, as medidas, a regressão e os nove controles negativos, sem edição de código) e WU-12 (os registros) terminaram `COMPLETED`, assim como os gates WU-04 a WU-11 e WU-13. Nenhuma WU foi pulada.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-148: o status passou a ACCEPTED, sem correção no texto da proposta (saiu só a frase "Aguarda o review do Tech Lead."); a nota de fechamento.
2. `CURRENT_STATE.md`, delta do Goal134: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal134: uma frase que registra a conferência, pelo Tech Lead, das mensagens dos controles (d), (f), (g), (h) e (i) contra a saída bruta. Os números da rodada 1 já estavam registrados pela WU-12 e conferem com os resultados do IA Loop.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal134), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal134) e em D-148.

- **Gates do IA Loop, rodada 1, na árvore aceita:** typecheck (WU-04), lint (WU-05), testes alvo (WU-06, 52 testes `goal134` em 2 arquivos), suíte do frontend (WU-07, 196 arquivos e 2737 testes), scripts do gate (WU-08, `test:gate` 294), `validate:core` (WU-09, saída 0, 15 de 17 passos e 2 pulados), `validate:ui` (WU-10, 169 passed, 21 pulados, 0 retentativas), `validate:integration` (WU-11, 36 de 36 passos, gate autenticado com 305 passed e 0 retentativas) e `git diff --check` (WU-13), todos com saída 0 e na primeira tentativa.
- **Controles negativos do Developer:** (a) a (i) na rodada 1 (WU-03), depois da última edição de código, com (g) e (i) reprovando pelos dois testes; cada mutação reprovou o teste indicado, foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código:** `ImportsFlow` só escolhe `ImportDoneScreen` com `history` na moldura `onboarding`; `ImportHistoryScreen`, `ImportHistoryCard` e `features/settings/` ficaram intocados. `labels.ts` só ganhou `historyPillLabel`. `OnboardingImportStep` só esconde o aviso de `demonstracao-da-ia` e acrescenta `ImportDonePathNote`; a releitura do onboarding, `stepAfterImport`, o destino, "Abrindo..." e o `role="alert"` não mudaram. O CSS novo é todo `.imports-done*` ou escopado por `:has(.imports-done)`, e as animações só rodam com `prefers-reduced-motion: no-preference`.
  - **`targets.json`:** o 2.I10 só declara `GET /v1/calendar/imports`, sem passo, com `counts` igual à soma das categorias (1.846).
  - **`visual:compare` do 2.I10:** refeito pelo Tech Lead (saída 0), com os quatro `side-by-side.png` abertos: 2,2 / 0,2 / 0,6 / 0,7 % (mobile, tablet em retrato, tablet em paisagem, desktop), iguais aos do Developer. Estrutura, ordem, selo (anel de 96 px e círculo de 72 px com o visto), título em Literata, descrição, pílulas, "Continuar" e a nota do rodapé batem com o quadro; a nota diz "Mais › Importação" no mobile e nos dois tablets e "Configurações › Importação" no desktop. O restante são as divergências declaradas e antialiasing de 1 px; as medidas por device ficam todas em até 1 px.
  - **Testes reexecutados:** `goal134`, `goal066`, `goal105`, `goal132` e `goal133` (7 arquivos, 205 passaram) e `visual-responses.test.mjs` (61 passaram).
  - **Controles:** as mensagens de (d), (f), (g), (h) e (i), que a WU-12 não tinha conferido, batem com a saída bruta (`.raw`).
  - **Registros:** só acréscimos nos três documentos da rodada, nenhuma linha removida; nenhum arquivo fora do escopo do critério 8.

## Divergências aceitas

Declaradas pelo Goal ou por D-148, conferidas nas capturas:

1. O 2.I10 só em `/onboarding/importacao`; em `/importacao` segue o I1.
2. "Horários" sem número, de seis regras na resposta fixa; o total "1.846" não aparece na tela.
3. A nota do rodapé pelo caminho real da largura (corte de 1100 px do `app-frame`); nos quatro devices o texto coincide com o do quadro.
4. O aviso de sucesso de `stepAfterImport` fora, como no quadro; os dois avisos que mudam o destino ficam acima de "Continuar" e não aparecem na captura.
5. O preenchimento dos segmentos da barra do topo (`chapterFraction`), o "Sair" (D-104), o estado do item "Sua agenda" na sidebar (atual no app, concluído no quadro), a barra de status e o indicador de início do iPhone.
6. Sem as animações de entrada na captura (`reducedMotion: "reduce"`).
7. Até 1 px nas medidas do selo, do título e da primeira linha de pílulas, conforme D-148.

## Aceito sem prova completa

1. **A regressão de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, I1 e I2** não deu 32 de 32 byte a byte: 9 de 32 `app.png` diferem das duas capturas da baseline, quase todos com delta máximo de 1 por canal, e em 8 deles a contagem de pixels passa do ruído medido entre `cap1` e `cap2`. Aceita como ruído de rasterização pela segunda via do critério 4: o código novo só existe com `history` na moldura `onboarding` e o CSS depende de `.imports-done`, que nenhuma dessas telas mostra, e `final` × `final2` (a mesma árvore final) mostra o mesmo perfil em 9 imagens. O 2.I5 em tablet retrato (40 pixels, delta 1) não é coberto por essa comparação de mesma árvore; a terceira captura da baseline, que fecharia a dúvida, não foi feita.
2. **A conclusão com `pendingAcceptance` ou `failed` e os dois avisos de destino** só são provados em jsdom: a resposta fixa e a conta da captura não os produzem.
3. **A altura renderizada de "Continuar"** foi medida no `visual:compare` (52 px nos quatro devices), não no gate autenticado, que não alcança a tela.
4. **`authenticated-matrix.spec.ts`** foi lido por busca dirigida, não por inteiro.
5. **Os controles negativos** são os do Developer; o Tech Lead não os refez, só conferiu as mensagens. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` e dos testes listados acima.
6. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Pendências não bloqueantes

1. As `notes` do 2.I10 em `targets.json` não citam o estado do item "Sua agenda" na sidebar. A divergência está registrada em D-148 e em `VALIDATION_GATE.md`.
