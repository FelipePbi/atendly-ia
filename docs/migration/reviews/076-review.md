# Review formal — Goal 076

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-29, conforme o [Goal076](../goals/076-fidelidade-visual-servicos.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–071 e 073–075) foi reaberto, reavaliado ou revertido. **Três rodadas**: as rodadas 1 e 2 terminaram `CHANGES_REQUIRED` com 2 blockers cada, e a rodada 3 terminou com zero.

O Goal corrige **QA SV-03 e SV-05, e a parte de SV-04 sem "Instruções para a IA"**, da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. A lista de Serviços deixa a grade de tabela e passa a três grupos (Precisa de revisão, Ativos, Inativos), com a linha "duração · preço", o filete na cor do serviço, "Corrigir" nas pendências e ativar/desativar na própria linha. O formulário ganha − e + de 5 minutos, atalhos 30/60/90 e a frase "A IA responde", rotulada como prévia do frontend. "Instruções para a IA" fica para o Goal078 ([D-091](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `faa094367cdcf6f04d4ccf12e9fd625a1e881128` (Goal075). Base imediata da implementação: `49688716c48c07c16dc2a122633e20a7c8b23754`, HEAD da worktree `.ai-worktrees/goal-076`, inalterado nas três rodadas. O commit `4968871` é só documental (fechamento do Goal075 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **13 arquivos**, hash do diff `affb6c91def3a03dd65f0f15da44c30d9691d9fdd00abd4331b0c41a84001762`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Dez arquivos rastreados**, por `git diff --numstat 4968871`:
  - `apps/frontend/`, produto: `features/services/ServiceList.tsx` (+164/−174), `ServiceForm.tsx` (+88/−15) e `shared/styles/atendly-services.css` (+136/−141).
  - `apps/frontend/e2e/authenticated-matrix.spec.ts` (+18/−1): só o helper `expectedDurationText` e a linha `toContainText(expectedDurationText(minutes))` em `saveDurationByForm`. É o desvio do §8 autorizado na rodada 1 (ver abaixo).
  - `apps/frontend/tests/` ajustados à composição nova: `goal015-services` (+7/−10) e `goal015-shell-invariant` (+4/−4). A revisão conferiu que só mudaram texto, seletor ou o caminho até o filtro, sem apagar guarda.
  - Os quatro documentos de `docs/migration/`: `CURRENT_STATE.md` (+110), `DECISIONS.md` (+38, D-091), `FINAL_AUDIT.md` (+49, §52) e `VALIDATION_GATE.md` (+34), todos só por acréscimo.
- **Três arquivos novos**: `apps/frontend/src/features/services/serviceFormatting.ts` (**87** linhas, formatação de duração, preço, recorrência, linha e prévia), `tests/goal076-service-list.test.tsx` (**263**) e `tests/goal076-service-form.test.tsx` (**313**).
- Hashes dos arquivos-alvo na árvore aceita, iguais aos citados nos quatro documentos: `ServiceList.tsx` `2a4a4f4a562dcacc1c36fd3b847594813f0abc92`, `ServiceForm.tsx` `867d8a86fcf8db647af35d941f1c9608d305c2a1`, `serviceFormatting.ts` `aa4003ba1d464f855ddddaacada60bae298b385b`.
- Nenhuma migration, rota, contrato ou schema do BFF mudou. `e2e/routes.ts` está idêntico à baseline. Nenhum arquivo foi tocado em `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/`, `apps/evolution-go/`, `scripts/` ou `tools/ia-loop/`. Nenhuma configuração de vitest ou Playwright mudou. `tests/goal058-service-form.test.tsx` não foi tocado. `QA_LOCAL_REVIEW.md`, o Product Vault e `docs/design-reference/` não foram editados.

## Desvio do §8 do Goal, autorizado nesta revisão

O §8 manda deixar `e2e/authenticated-matrix.spec.ts` como está. O design exigido pelo próprio Goal mostra o serviço semeado de 60 min como "1 h", então a asserção literal `${minutes} min` reprovaria a tela certa. A rodada 1 autorizou **só** a troca do texto esperado da duração: `toContainText(\`${minutes} min\`)` → `toContainText(expectedDurationText(minutes))`, mais o helper, que espelha `formatServiceDuration` sem importar de `src/`. A troca do seletor `.directory-row` → `.service-row`, que o Developer tinha feito junto, não foi autorizada e voltou à baseline byte a byte. A asserção não foi afrouxada: o locator continua `.directory-row` filtrado pelo nome do serviço semeado, e a linha ainda tem de mostrar a duração salva. Para isso, o `<li>` da linha leva `className="directory-row service-row"`; `directory-row` é só classe-marcador, sem nenhuma regra CSS em `apps/frontend/src`. Precedente do mesmo tratamento: [review069](069-review.md), rodada 1.

## Rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 2 blockers.** (1) O spec do gate autenticado mudou contra o §8, com uma troca de seletor desnecessária; só a troca do texto da duração era inevitável. (2) A "execução final" citada nos documentos era anterior à última edição de código: `e2e-results/results.json` tinha `startTime` 18:32Z, antes do DIAG-001 (18:44Z–19:05Z), e `atendly-services.css` foi tocado de novo às 19:32Z. O código de produto já batia com o Goal.
2. **Rodada 2 — `CHANGES_REQUIRED`, 2 blockers.** A parte de código do blocker 1 estava certa e a execução final passou a valer (`validate:ui` `startTime` 19:50:45Z e gate autenticado 19:53:55Z, depois da última edição de código, o FIX-001 em `ServiceList.tsx` às 19:45:37Z). Mas os quatro documentos tinham sido escritos antes dessa edição: diziam que o spec lia `.service-row`, não declaravam o desvio do §8, citavam o hash antigo de `ServiceList.tsx` (`f522f754…`) e afirmavam que nenhuma rodada de correção mudou código. Os seis controles do §5 não tinham sido refeitos depois da última edição.
3. **Rodada 3 — `ACCEPTED`, zero blockers.** Nenhuma edição de código. Os seis controles do §5 e o vermelho da baseline rodaram de novo contra a árvore vigente, entre 20:03:45Z e 20:04:20Z, com hashes conferidos. A prosa dos quatro documentos foi reescrita no lugar entre 20:07Z e 20:09Z, na ordem do §6.

## Conferência da rodada 3

- **Blocker 1:** D-091 (item 2 e "Consequências"), FINAL_AUDIT §52, VALIDATION_GATE e CURRENT_STATE dizem `<li className="directory-row service-row">`, tratam `directory-row` como marcador e trazem o parágrafo "Desvio declarado do §8 do Goal, autorizado pelo review076, rodada 1", com motivo, a linha única e a declaração de que a asserção não foi afrouxada. `git diff 4968871 -- apps/frontend/e2e/authenticated-matrix.spec.ts` mostra só o helper e essa linha. `directory-row` só aparece em `ServiceList.tsx:391`; `.service-grid`, `.directory-grid-head` e `.directory-filter` não existem mais em `apps/frontend/src`.
- **Blocker 2:** `git hash-object` dos três arquivos-alvo bate com os documentos. Os alvos citados de cada controle existem literalmente no código (`Number(current) + 5`, `a partir de ${amount}`, `{formatServiceLine(service)}`, `<h2>Essencial</h2>`). O grep nos quatro documentos por `f522f754`, "passa a ler `.service-row`", "nenhuma rodada de correção mudou código", `className="service-row"` e `.service-grid`/`.directory-row` deu rc=1, sem ocorrência.
- **Reexecução do Tech Lead:** `goal076-*`, `goal015-services`, `goal015-shell-invariant` e `goal058-service-form` deram **44**/**44**; `tsc --noEmit` em `apps/frontend` limpo. `git diff --check` limpo; `git status --porcelain=v1 -uall` só com `apps/frontend/` e os quatro documentos do §6.

## Evidência final aceita

Gates do IA Loop na rodada 3, todos exit 0, depois da reescrita da prosa: `typecheck` (WU-03), `lint` (WU-04), testes dirigidos (WU-05 a WU-07), `validate:core` (WU-08), `test:gate` (WU-09), `validate:ui` (WU-10), `validate:integration` (WU-11) e `git diff --check` (WU-13). Os `e2e-results` da rodada 3 têm `startTime` 20:12:12Z (público: **169** `passed`, **21** `skipped`, **0** `unexpected`, **0** retentativas) e 20:15:23Z (autenticado: **155** `passed`, **0** `unexpected`, **0** retentativas), as mesmas contagens que os documentos atribuem à rodada 2, na mesma árvore.

Contagens documentadas em [FINAL_AUDIT §52](../FINAL_AUDIT.md):

- `validate:core` **17** passos, **15** `passed`, **2** `skipped`, exit 0; `test:frontend` **108**/**1119** (baseline **106**/**1100**, **+2** arquivos e **+19** testes, nenhum a menos).
- `test:gate` **233**/**233**, igual à baseline; `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas.
- `validate:integration` **36**/**36** passos, com o gate autenticado em **155** `passed` e **0** retentativas, medindo `/servicos` nas cinco larguras.
- Vermelho da baseline `faa0943` dos dois testes novos: `Tests 14 failed | 5 passed (19)`; contra a árvore do Goal, **19**/**19**.
- Os seis controles negativos do §5, cada um reprovando o teste esperado e voltando a verde sem o defeito, com restauração conferida por `git hash-object`. O Tech Lead conferiu hashes, alvos e a coerência da saída colada, mas não reexecutou os controles nem o vermelho da baseline.

## Observações registradas, sem mudar a decisão

1. **Os `e2e-results` da rodada 2 citados nos documentos foram sobrescritos** pelo rerun da rodada 3, com contagens idênticas e na mesma árvore (mesmos hashes). Os `startTime` 19:50:45Z e 19:53:55Z dos documentos não existem mais em disco; os de 20:12:12Z e 20:15:23Z os substituem com o mesmo resultado.
2. **`DirectorySourceStrip` continua exportada de `ServiceList.tsx`, sem chamador.** O Goal permite, e D-091 item 8 declara. Candidata a remoção quando outro Goal tocar a lista.
3. **`formatServicePreview` mostra texto estranho enquanto a duração está inválida** (0, negativa ou fracionária), porque a prévia não espera a validação do campo. Com `NOT_INFORMED` e sem duração, a frase fica "<Nome>; o valor você confirma com a cliente.", com o ponto e vírgula sobrando. Nenhum dos dois casos é salvo; é só a prévia.
4. **A frase "A IA responde" não usa artigo** diante do nome do serviço, divergindo do protótipo (`Servicos-Desktop.dc.html`, S5). Declarado em D-091; a conferência humana do §7 decide.

As observações 3 e 4 são candidatas a ajuste depois da conferência humana do §7.

## O que o aceite não prova

- Que a lista e o formulário, num aparelho real nas cinco larguras, com serviço pendente, ativo e inativo, batem com `Servicos.dc.html`, `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html`. A conferência humana do §7 do Goal **não foi feita**.
- Que o filete e o âmbar leem bem, que "duração · preço" cabe na linha em 360 e 390px sem esconder o nome, e que a frase sem artigo é aceitável. Mesma conferência humana, **não feita**; nenhum teste jsdom prova fidelidade visual.
- Que a IA usa "Instruções para a IA" (Goal078), nem a fidelidade visual de Conversas e da central de notificações (Goal077) e do onboarding (Goal072).

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §52](../FINAL_AUDIT.md)).
