# Review formal — Goal 131

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, em review **DEEP**, conforme o [Goal131](../goals/131-as-credenciais-e-a-analise-da-importacao-do-onboarding-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 5 saiu `CHANGES_REQUIRED` com 1 blocker só de documentação; o IA Loop aceitou a rodada e adiou a correção para este fechamento, sem nova rodada do Developer. A correção foi aplicada aqui, só em `docs/migration/`.

As credenciais (2.I2) e a análise (2.I3) da importação do onboarding ficam iguais aos quadros nos quatro devices e nas duas molduras (`/onboarding/importacao` e `/importacao`), salvo as divergências declaradas em D-145. As credenciais têm "Entre no Minha Agenda", os rótulos do quadro, o campo de 54 px por fora (o content-box de 52 px do quadro), a senha mascarada com `letter-spacing: 0.2em`, "Mostrar senha" com `aria-pressed` e 32 px de alvo, e "Analisar meus dados". A análise tem a barra indeterminada, sem `aria-valuenow`, e as cinco linhas com uma cor só e sem número. O envio, a validação e as mensagens não mudam. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-145](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `77b1f1e49597a2db7c6cd19bd43c82e7f1e88a87` (Goal130). Base imediata da implementação: `f54beec5d747e1bcb7939f0e061764389598d022`, HEAD da worktree `.ai-worktrees/goal-131`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **21 arquivos** (17 rastreados e 4 novos não rastreados), hash do diff `8d09a31cb270ebac6fef3063010096ed247eaff6d11be925b592c1b0651de108`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (4): `features/imports/ConnectSourceScreen.tsx` (título, descrição, rótulos, "Mostrar senha", "Analisar meus dados"), `features/imports/ImportPreviewScreen.tsx` (a fase `working`: barra, cartão e linhas), `features/imports/ImportsLayout.tsx` (a opção `eyebrow` de `ImportsPage`) e `shared/styles/avenly-imports.css`;
  - `apps/frontend/tests/` (12): os novos `goal131-credenciais.test.tsx`, `goal131-analise.test.tsx`, `goal131-alvos-captura.test.ts` e `goal131-toque-senha.test.ts` (45 testes) e os oito ajustados só no texto, na ordem ou na ação (`goal020-imports-entry`, `goal020-shell-invariant`, `goal060-connect-source`, `goal066-onboarding-importacao`, `goal082-connect-source-client-rejected`, `goal105-importacao`, `goal112-configuracoes-importacao` e `goal120-importacao-recusas`);
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (2.I2 sem `responses` e com três passos; 2.I3 sem passos e com um só `GET /v1/calendar/imports` em `ANALYZING`) e `scripts/tests/visual-responses.test.mjs` (de 58 para 59 testes);
  - `docs/migration/` (3, por acréscimo): D-145 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal131 em `VALIDATION_GATE.md`.
- `authenticated-matrix.spec.ts`, `labels.ts`, `ONBOARDING_ROUTES`, as sementes da captura e do gate, o BFF, os serviços e `tools/ia-loop/` não foram tocados. O documento do Goal131 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `PRE_REVIEW_INCOMPLETE`, barrada pelo harness.** A WU-03 (alvos 2.I2 e 2.I3, testes da captura, `visual:compare`, controles e registros) terminou `FAILED` (`UNKNOWN_FATAL`), e os gates só observaram a árvore incompleta.
2. **Rodada 2 — `CHANGES_REQUIRED`, 6 blockers.** A FIX-001 só refez as capturas; os alvos já estavam em `targets.json`. O Tech Lead refez o `visual:compare` de 2.I2 e 2.I3 e a regressão de 2.I1, I1 e I2 (12 percentuais iguais aos registrados). Blockers: no 2.I3, a pílula com `margin-block: 6px` que o quadro não tem (linhas 4 px mais altas), a barra que crescia até 78 % e parava (o Goal pede barra indeterminada) e a última linha com estado "pendente" (o Goal pede uma cor só); o comentário de `ImportsPage` que nomeava só as credenciais; em `VALIDATION_GATE.md`, os `validate:*` sem número e a frase "as cores coincidem" para "Analisar meus dados", que sai em `:hover` nas capturas.
3. **Rodada 3 — `PRE_REVIEW_INCOMPLETE`, barrada pelo harness.** A FIX-001 terminou `FAILED` (`UNKNOWN_FATAL`) com a correção feita na árvore, e os gates só observaram.
4. **Rodada 4 — `CHANGES_REQUIRED`, 3 blockers.** O IA Loop reaproveitou os gates de código da rodada 3 e rodou de novo o `validate:integration` (305 passed, 0 retentativas). O 2.I3 ficou fiel nos quatro devices (linhas de 55 a 56 px, contra 55 px da última linha do quadro). Blockers: no 2.I2, os dois campos 2 px mais baixos que o quadro (content-box, 54 px por fora) e a máscara da senha sem o `letter-spacing:.2em` do quadro; em `VALIDATION_GATE.md`, `validate:core` e `validate:integration` remetidos a `results/work_unit`.
5. **Rodada 5 — review `CHANGES_REQUIRED`, 1 blocker só de documentação; decisão efetiva `ACCEPTED`, com a correção adiada para o fechamento.** A FIX-001 pôs `height: 54px; min-height: 0` em `.imports-credentials .input` e `letter-spacing: 0.2em` em `.imports-credentials .input[type="password"]`, com dois testes novos em `goal131-toque-senha.test.ts` e os controles (j) e (k). O blocker: `VALIDATION_GATE.md` e `CURRENT_STATE.md` diziam que não havia número da rodada 5 para o `validate:integration`, que o IA Loop rodou (WU-12).

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `VALIDATION_GATE.md`, seção do Goal131, tabela "Contagens" (blocker da rodada 5, adiado):
   - linha `validate:integration`: a frase "Rodada 5: a FIX-001 não o executou … não há número da rodada 5" passou ao resultado da WU-12 (saída 0, 36 de 36 passos, 0 pulados; gate autenticado com 304 passed e 1 flaky, `[mobile-390] onboarding-demonstracao-da-ia › measured, logged in`, que passou na retentativa; `/onboarding/importacao` passou nas cinco larguras; a baseline e a rodada 4 com 305 sem retentativa);
   - linha `validate:core`: acrescentado o resultado da WU-10 da rodada 5 (saída 0, 17 passos, 15 passaram, 0 falharam, 2 pulados);
   - linha `validate:ui`: acrescentado o resultado da WU-11 da rodada 5 (saída 0, 169 passed, 21 skipped, retentativas 0).
2. `CURRENT_STATE.md`, delta do Goal131: no primeiro parágrafo, "e sem número da rodada 5" passou ao resultado da WU-12 da rodada 5 (blocker adiado); no fim do delta, o parágrafo "Aceite".
3. `DECISIONS.md`, D-145: o status passou a ACCEPTED; a "Prova" passou a `goal131-toque-senha.test.ts` com 4 testes, 45 testes `goal131` e onze controles negativos (dizia 2, 43 e seis, números de antes das rodadas 3 e 5); a nota de fechamento.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal131), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal131) e em D-145.

- **Gates do IA Loop, rodada 5, na árvore aceita:** typecheck (WU-04), lint (WU-05), testes alvo (WU-06, 45 testes `goal131`), suíte do frontend (WU-07, 189 arquivos e 2509 testes), `test:gate` (WU-09), `validate:core` (WU-10, 15 de 17 passos e 2 pulados), `validate:ui` (WU-11, 169 passed, 21 skipped, 0 retentativas), `validate:integration` (WU-12, 36 de 36 passos, gate autenticado com 304 passed e 1 flaky fora do Goal) e `git diff --check` (WU-13), todos com saída 0. A WU-08 (`test:ia-loop`) foi pulada: o repositório não tem o script.
- **Controles negativos do Developer:** (a) a (f) na rodada 1, com duas formas em (e) e em (f); (g) a (i) na rodada 3 (a margem da pílula, a largura no keyframe da barra, `is-pending` numa linha); (j) e (k) na rodada 5 (`letter-spacing: 0` na senha mascarada, `height: 52px` no campo). Cada mutação reprovou o teste indicado e foi revertida.
- **Conferência do Tech Lead:**
  - **Código:** o envio segue `connectIntegration`, `startImport` e `getImportState`, nessa ordem; "Mostrar senha" troca o `type` sem perder o valor nem o foco; `eyebrow={false}` vale só nas credenciais e na análise; a análise não mostra número e não tem `aria-valuenow`. Os ajustes dos testes existentes só trocam texto e não afrouxam asserção. O contraste de D-145 confere.
  - **`visual:compare` de 2.I2 e 2.I3:** refeito pelo Tech Lead nas rodadas 2, 4 e 5 (8 pares, saída 0), com os oito `side-by-side.png` abertos. Na rodada 5: 2.I2 em 16,1/1,5/0,9/1,5 % e 2.I3 em 3,9/1,7/2,1/1,5 % (mobile, tablet em retrato, tablet em paisagem, desktop). Medido por pixel: o miolo dos campos tem 52 px e a borda externa 54 px, como no quadro; os pontos da máscara ficam nas mesmas colunas do quadro (mobile em 56, 65, 74, 82, 91 e 100); o olho continua centrado; as linhas da análise medem 55 a 56 px, contra 55 px da última linha do quadro.
  - **Regressão de 2.I1, I1 e I2:** refeita pelo Tech Lead na rodada 2, com os 12 percentuais iguais aos registrados.

## Divergências aceitas

Declaradas pelo Goal ou por D-145, conferidas nas capturas:

1. O teclado do iOS no 2.I2 mobile e o foco no campo de senha.
2. A segunda frase da descrição do 2.I2 ("Ele não fica guardado." não é usada, porque o acesso fica guardado, cifrado, até a conclusão), que desce os campos em 16 a 19 px.
3. As contagens do 2.I3, que a leitura não traz; as linhas ficam com a altura da última linha do quadro.
4. A barra do 2.I3 indeterminada, sem fração, no lugar da que cresce até 78 % no quadro.
5. As cinco linhas do 2.I3 com a cor da última linha do quadro.
6. O chevron de voltar do 2.I2, o preenchimento do segundo segmento da barra (`chapterFraction`), o "Sair" (D-104), a barra de status e o indicador de início do iPhone.
7. "Analisar meus dados" em `:hover` nas capturas de tablet e desktop: efeito da captura (o ponteiro fica onde o passo tocou "Continuar"), com a cor em repouso igual à do quadro.

## Aceito sem prova completa

1. **O gate autenticado da rodada 5** deu 304 passed e 1 flaky em `onboarding-demonstracao-da-ia` (mobile-390), tela fora do Goal. A rodada 4 deu 305 sem retentativa sobre código que difere só no CSS das credenciais, que o gate não alcança.
2. **A regressão de 2.I1, I1 e I2** foi provada por percentual, não por `cmp` do `app.png`: o `app.png` de antes não foi capturado antes das edições.
3. **Os controles negativos** são os do Developer; o Tech Lead não os refez.
4. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` e da regressão.
5. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.
