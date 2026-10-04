# Review formal — Goal 077

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-30, conforme o [Goal077](../goals/077-fidelidade-visual-conversas-e-notificacoes.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–071, 073–076, 078) foi reaberto, reavaliado ou revertido. **Três rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 7 blockers, a rodada 2 `CHANGES_REQUIRED` com 1 blocker, e a rodada 3 terminou com zero. O blocker da rodada 2 não foi de código de produto: foram seis arquivos de configuração de teste e build editados pelas unidades de diagnóstico do harness.

O Goal corrige **QA CV-05, NT-01 e NT-02** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. A bolha do chat passa a ter a autoria discreta abaixo ("IA · 13:38", "Você · 12:05" ou só a hora). A partir de 768 px, a central de notificações abre em gaveta de 440 px pelo sino da Home e pelo item da sidebar. A espécie `AI_ACTIVATED` entra na central por uma migration aditiva, escrita na mesma transação que liga a IA. A condição resolvida diz como foi resolvida. Decisão: [D-093](../DECISIONS.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `b0e42ad37c8669cd5df72682b9c10e40f576342c` (Goal078). Base imediata da implementação: `1068a685af2ced259123bab9a708a11e65c1af23`, HEAD da worktree `.ai-worktrees/goal-077`, inalterado nas três rodadas. O commit `1068a68` é só documental (fechamento do Goal078 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **30 arquivos**, hash do diff `a818ac419ca0d9102e4b2aa1ba9f4b380576aa68196cd3ed86a2f7524e3dc3ff`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **24 arquivos rastreados**, por `git diff --numstat 1068a68`:
  - `apps/bff/`: `prisma/schema.prisma` (+1), `src/modules/notifications/species.ts` (+10), `src/lib/ai-activation.ts` (+25/−8), `src/modules/settings/routes.ts` (+27/−2) e `PUBLIC_API_V1.md` (+2). `packages/public-api-contract/src/schemas.ts` (+1).
  - `apps/frontend/src/`: `features/notifications/NotificationsScreen.tsx` (+172/−77), `notificationViews.ts` (+90/−4), `features/dashboard/DashboardScreen.tsx` (+34/−10), `shared/layout/AppShell.tsx` (+35/−1), `features/conversations/MessageTimeline.tsx` (+6/−20), `ConversationThread.tsx` (−1), `shared/styles/avenly-notifications.css` (+54), `avenly-conversations.css` (−5) e `avenly.css` (+2/−2, a gaveta de 400 para 440 px).
  - `apps/frontend/e2e/authenticated-matrix.spec.ts` (+95/−0): só o teste novo "inicio: the bell opens the notifications".
  - Testes existentes ajustados: `goal017-chat-media` (+15/−8), `goal017-delivery-state` (+8/−7), `goal022-notifications-screen` (+3/−3) e, no BFF, `goal025-ai-activation-deletion-guard` (+55/−48, só a dublê do Prisma ganha `$transaction` e `tenantNotification.createMany`).
  - Os quatro documentos de `docs/migration/`: `CURRENT_STATE.md` (+73), `DECISIONS.md` (+29, D-093), `FINAL_AUDIT.md` (+52, §54) e `VALIDATION_GATE.md` (+50).
- **Seis arquivos novos**: a migration `apps/bff/prisma/migrations/20260929000000_goal077_notification_ai_activated/migration.sql` (**5** linhas, só `ALTER TYPE "NotificationKind" ADD VALUE 'AI_ACTIVATED'`); `apps/frontend/src/features/notifications/NotificationsDrawer.tsx` (**86**); `apps/bff/tests/goal077-ai-activated-notification.integration.test.ts` (**390**); e `apps/frontend/tests/goal077-message-authorship.test.tsx` (**217**), `goal077-notifications-center.test.tsx` (**246**) e `goal077-notifications-drawer.test.tsx` (**286**).
- Hashes na árvore aceita, iguais aos citados em FINAL_AUDIT §54: `species.ts` `eadea386…`, `settings/routes.ts` `4a2d6605…`, `ai-activation.ts` `ade7ade1…`, `notificationViews.ts` `46b97108…`, `DashboardScreen.tsx` `e1c4d9ef…` e `MessageTimeline.tsx` `ac5927e6…`.
- Uma migration só, aditiva. Nenhuma rota nova. Nenhuma exceção nova em `KNOWN_*`. Nenhum passo a menos em `validate:core` ou `validate:integration`. `e2e/routes.ts`, `vitest.config.*`, `playwright.config.*` e `next.config.ts` ficam na baseline. Nenhum arquivo foi tocado em `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `scripts/` ou `tools/ia-loop/`. O Product Vault, `docs/design-reference/` e `QA_LOCAL_REVIEW.md` não foram editados.

## Asserções mudadas em testes existentes

Todas por texto ou composição trocados neste Goal, listadas em D-093 "Consequências":

- `goal017-chat-media.test.tsx`: a cliente mostra só a hora, sem o nome; a IA mostra "IA · HH:MM", sem "Studio Marina · IA" nem "resposta automática"; o dono mostra "Você · HH:MM", sem "atendimento humano".
- `goal017-delivery-state.test.tsx`: "SENT é entrega confirmada" vira "SENT não mostra selo próprio"; os rótulos distintos passam de 4 para 3 (`PENDING`, `FAILED`, `UNKNOWN`).
- `goal022-notifications-screen.test.tsx`: "Marcar todas como lidas" vira "Marcar lidas", três ocorrências no mesmo teste.
- `goal022-notifications-chrome.test.tsx` e `goal074-home.test.tsx` não mudaram: o item da sidebar continua link com `href="/notificacoes"`, e o sino, sem `matchMedia` no jsdom, continua link.
- Nenhuma asserção de estado de envio, reenvio, axe, guarda por fonte ou invariante da casca foi apagada.

## Rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 7 blockers.** A parte do BFF (WU-01) tinha o desenho certo: migration aditiva, `AI_ACTIVATED` `INFO`/`EVENT`, dedupe `AI_ACTIVATED:run:<runId>` e `materialize` no mesmo `$transaction` do `upsert`, nos dois caminhos. A bolha (WU-04) já atendia ao §4. Mas a WU-01 terminou `FAILED`, e WU-02, WU-03 e WU-17 não rodaram. Blockers: (1) o frontend não compilava (`notificationViews.ts` sem `AI_ACTIVATED`, TS2741 e TS2366), derrubando `validate:core` e `validate:integration`; (2) faltava a central (§2); (3) faltava a gaveta (§3); (4) faltava o teste novo do gate autenticado (§5); (5) os testes §6.1–§6.5 do BFF e o `migrate diff` nunca tinham rodado verdes, com dúvida se o `vi.spyOn` do §6.5 interceptava o import nomeado; (6) faltavam o vermelho da baseline e os oito controles (§6, §7); (7) faltava a documentação (§8).
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker.** O FIX-001 resolveu os sete blockers da rodada 1 em código e em evidência, com a execução final e os oito controles descritos em FINAL_AUDIT §54. O código de produto estava correto e não foi reaberto. Depois do FIX-001, `validate:core`, `validate:ui` e `validate:integration` falharam no harness, e as unidades de diagnóstico DIAG-001, DIAG-003 e DIAG-004 "consertaram" os gates com teto de workers em seis arquivos que o §10 proíbe: `apps/ai-orchestrator/vitest.config.ts`, `apps/scheduling-service/vitest.config.ts`, `apps/bff/vitest.config.ts`, `apps/frontend/vitest.config.mts` (`maxWorkers: 4`), `apps/frontend/playwright.config.ts` (`workers: 1`) e `apps/frontend/next.config.ts` (`experimental.cpus: 4`). Blocker único: restaurar os seis ao conteúdo de `1068a68`, sem outra edição. O Tech Lead reexecutou `goal077`, `goal074-home`, `goal022-notifications-chrome` e `goal017-shell-invariant`: 6 arquivos e 45 testes verdes. Perfil seguinte: `SONNET_MEDIUM`.
3. **Rodada 3 — `ACCEPTED`, zero blockers.** O FIX-001 restaurou os seis arquivos com `git restore`. Nenhuma edição de código de produto, de teste ou de documento.

## Conferência da rodada 3

- `git diff --stat 1068a68` dos seis paths de configuração sai vazio. `git hash-object` de cada um bate com `git rev-parse 1068a68:<path>`: `ai-orchestrator/vitest.config.ts` `b0b6673`, `scheduling-service/vitest.config.ts` `8e469c1`, `bff/vitest.config.ts` `f624398`, `frontend/vitest.config.mts` `b85cf0b`, `frontend/playwright.config.ts` `d2f7e80` e `frontend/next.config.ts` `84602a9`.
- `git status --porcelain=v1 -uall` lista só `apps/bff/`, `apps/frontend/`, `packages/public-api-contract/` e os quatro documentos do §8. `e2e-results/` fica fora, ignorado pelo `.gitignore`. Cumpre o §10 e o critério de aceite 10.
- Os patches das rodadas 2 e 3 diferem só pela remoção dos seis hunks de configuração. O resto do diff é byte a byte o que a rodada 2 revisou.
- Os documentos de `docs/migration/` no diff não afirmam nada sobre teto de workers ou memória, então nenhum ficou falso com a restauração. Os seis hashes de código de §54 batem com `git hash-object` na árvore aceita.

## Evidência final aceita

Gates do IA Loop na rodada 3, todos exit 0, na árvore aceita e sem os tetos de workers: `typecheck` de BFF e frontend (WU-05, WU-06), `lint` (WU-07, WU-08), testes dirigidos (WU-09 `goal077` do frontend **18**/**18**; WU-10 `goal022-notifications` **34**/**34**; WU-11 `goal017` **106**/**106**; WU-12 `goal022-notification` do BFF **32** passando e **16** pulados fora de `validate:integration`), `validate:core` (WU-13), `test:gate` (WU-14), `validate:ui` (WU-15), `validate:integration` (WU-16, 404 s, inclui a migration e o teste novo da gaveta) e `git diff --check` (WU-18). Os `e2e-results` da rodada 3 têm `startTime` `2026-09-30T09:24:20Z` (público: **169** `passed`, **21** `skipped`, **0** `unexpected`, **0** retentativas) e `2026-09-30T09:27:31Z` (autenticado: **160** `passed`, **0** `unexpected`, **0** `flaky`, **0** retentativas).

Contagens da execução final vigente (FIX-001 da rodada 2), documentadas em [FINAL_AUDIT §54](../FINAL_AUDIT.md):

- `test:frontend` **112**/**1146** (baseline recontada **109**/**1128**: **+3** arquivos, **+18** testes).
- `test:bff-integration` **60**/**465** (baseline recontada **59**/**455**: **+1** arquivo, **+10** testes), sem drift no `migrate diff` do BFF.
- `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:gate` **233**; `validate:ui` **169**/**21**; `validate:integration` **36**/**36** passos; gate autenticado **160** testes (os **155** da baseline mais o teste novo nas cinco larguras), **0** retentativas. `test:ai-orchestrator` **1177**/**93**/**1270** e `test:scheduling-service` **37**/**502**, iguais à baseline.
- Vermelho da baseline `b0e42ad`: frontend `Tests 13 failed | 5 passed (18)` (os cinco que passam guardam comportamento que já existia); BFF `Tests 10 failed (10)`.
- Os oito controles negativos do §7, todos rodados pelo Developer no FIX-001 da rodada 2, por edição real revertida e conferida por hash. O Tech Lead não os reexecutou.

## Observações registradas, sem mudar a decisão

1. **Antes de o React montar, o sino é link em qualquer largura.** A partir de 768 px, um clique nesse intervalo leva a `/notificacoes` em vez de abrir a gaveta. Limite declarado em D-093.
2. **O contador de não lidas da sidebar e o ponto do sino** vêm do tick de `GET /v1/status`. Marcar lidas na gaveta recarrega a lista, não o contador, que só acompanha no tick seguinte. Limite declarado em D-093.
3. **O item "Notificações" da sidebar continua link**, e o clique simples abre a gaveta. Isso mantém o marcador de sessão `a[href="/notificacoes"][aria-current="page"]` do gate autenticado, que o Goal não podia mudar. É divergência declarada frente à sidebar do protótipo, para a conferência humana.
4. **Harness, fora do diff.** As unidades de diagnóstico da rodada 2 trataram falha de gate por contenção de memória da estação como defeito de configuração, e editaram configuração de teste e build proibida pelo §10. É o mesmo padrão da rodada 3 do Goal073. Na rodada 3, os gates passaram sem os tetos. Se um gate voltar a falhar por ambiente, a unidade de diagnóstico deve reexecutar ou reportar, não editar configuração.
5. **O texto do blocker da rodada 2 chegou truncado ao FIX-001 da rodada 3.** O Developer identificou os seis arquivos pelo `git diff` e pelo §10, e a conferência bateu.
6. **Os `e2e-results` da execução final da rodada 2** (`startTime` `2026-09-30T01:14:50Z` e `01:17:54Z`) foram sobrescritos pelos reruns da rodada 3, na mesma árvore de código e com as mesmas contagens.

## O que o aceite não prova

- Que Conversas e a central, percorridas num aparelho real nas cinco larguras, batem com os seis protótipos do Goal. A conferência humana do §9 **não foi feita**.
- Que "IA · 13:38" é discreta e ainda legível, que a gaveta de 440 px sobre a Home lê bem no tablet, e que manter o item "Notificações" na sidebar é aceitável frente ao protótipo. Mesma conferência humana, **não feita**.
- Que "Sua IA está ativa" aparece no histórico depois de um teste real num WhatsApp real. Os testes do BFF usam a IA e o Scheduling como dublês HTTP.
- O banner crítico sobre Conversas, o vazio animado do protótipo e a fidelidade visual do onboarding (Goal072).

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §54](../FINAL_AUDIT.md)).
