# Review formal — Goal 120

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-05, conforme o [Goal120](../goals/120-as-recusas-do-scheduling-chegam-as-telas-como-o-bff-as-entrega.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 1 terminou `CHANGES_REQUIRED` com 1 blocker só de registro; o IA Loop aceitou a rodada com ele adiado para a documentação de fechamento, onde foi aplicado (ver "Correção de registro aplicada no fechamento").

Toda tela que trata uma recusa nomeada do Scheduling passa a reconhecê-la no formato que o BFF entrega: `UPSTREAM_ERROR`, com o código em `details.upstreamCode` e o detalhe em `details.upstreamDetails`. Um leitor único, `apps/frontend/src/data/http/schedulingRefusal.ts`, aceita o embrulho e o formato cru. Contra o BFF real, a remarcação passa a abrir o `ConflictPanel` (a observação 2 do [review119](119-review.md)), a perda do hold volta à escolha do horário na criação e na remarcação, a indisponibilidade sobre atendimento confirmado e a série de bloqueio abrem a decisão com motivo, a confirmação da série dá a mensagem certa, e as telas da importação reconhecem as quatro recusas nomeadas. Só o frontend mudou: nenhuma mudança no BFF, no Scheduling, no contrato, no layout, no texto ou no fluxo de tela. Decisão: [D-134](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `2dec10a6515b930232ddadfd3d0d422b3b679717` (Goal119). Base imediata da implementação: `40e45d735d5218dc0b9d2677498f4acb211a68a5` (fechamento do Goal119 e preparação do Goal120), HEAD da worktree `.ai-worktrees/goal-120`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **14 arquivos** (11 rastreados e 3 novos não rastreados), hash do diff `fb55e8364a3dbe07bdb572283fa8592a959d1e07e41928cd9181f39d1cb14d23`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (9): `data/http/schedulingRefusal.ts` (novo); `features/agenda/holdSession.ts`, `AppointmentForm.tsx`, `AvailabilityExceptions.tsx`, `occupancy.ts` e `SeriesConfirm.tsx`; `features/imports/ConnectSourceScreen.tsx`, `ImportConflictsScreen.tsx` e `ImportRunScreen.tsx`;
  - `apps/frontend/tests/` (2, novos): `goal120-recusas-do-scheduling.test.tsx` (23 testes) e `goal120-importacao-recusas.test.tsx` (7);
  - `docs/migration/` (3, por acréscimo): D-134 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal120 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal. `RescheduleFlow.tsx` não mudou: herda a correção por `holdSession.ts`. Nenhum teste existente mudou. O documento do Goal120 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED` pelo IA Loop, com 1 blocker só de registro adiado para o fechamento.** O Developer rodou com o modo `WORK_UNITS`. A WU-01 criou o leitor e o aplicou nos pontos da Agenda (23 testes `goal120`). A WU-02 aplicou o leitor nas três telas da importação (7 testes). A WU-03 rodou os três controles negativos, a busca da seção 1.2 sobre a árvore final e escreveu D-134 e os registros. Os gates WU-04 a WU-12 passaram na árvore final. A primeira execução do `test:gate` (WU-08) falhou porque a worktree nasceu sem o Prisma client de `apps/ai-orchestrator`, que é gitignored; a DIAG-001 rodou `npx prisma generate` em `apps/ai-orchestrator`, sem mudar arquivo versionado, e a reexecução passou. O review terminou `CHANGES_REQUIRED` com 1 blocker só de registro: a seção do Goal120 no VALIDATION_GATE dizia que os gates globais não foram executados pela unidade e não trazia as contagens que o Goal exige (Validação e ordem, item 6).

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal120), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal120) e em D-134.

- **Gates do IA Loop, rodada 1, todos com saída 0 na árvore final:** `typecheck` (WU-04), `lint` (WU-05), testes alvo `goal120` com 2 arquivos e 30 testes (WU-06), suíte do frontend com 164 arquivos e 2122 testes (WU-07), `test:gate` com 267 pass e 0 fail (WU-08, na reexecução depois da DIAG-001), `validate:core` com 15 passos passando e 2 pulados, `test:bff` e `test:health-worker` (WU-09), `validate:ui` com 169 passed e 21 skipped, sem retentativa (WU-10), `validate:integration` com 36 de 36 passos e o gate autenticado com 275 passed e 0 retries, contra um banco descartável em `127.0.0.1:55500` (WU-11), e `git diff --check` (WU-12).
- **Controles negativos do Developer (WU-03, depois da última edição de código):** (a) o leitor sem o ramo do embrulho reprovou 25 de 30; (b) o detalhe só do nível de cima reprovou 9 de 30; (c) "Sobrepor mesmo assim" sem motivo, em `RescheduleFlow.tsx`, reprovou 2 de 30. Cada fonte voltou da cópia e foi conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Leitor.** `schedulingRefusalCode` devolve `details.upstreamCode` no embrulho, senão o próprio `code`, e `undefined` fora de `BffHttpError`; `schedulingRefusalDetails` devolve sempre um objeto.
  - **Pontos trocados.** Todos os do item 3 da evidência do Goal usam o leitor. O texto e o fluxo das telas não mudaram; `requestError` e os leitores antigos de `upstreamCode` ficaram intactos.
  - **Busca cruzada.** Os literais de código emitidos por `apps/scheduling-service/src` foram cruzados com `apps/frontend/src`: nenhuma comparação crua de código só do Scheduling ficou de fora.
  - **Testes.** Os testes `goal120` usam o envelope real, inclusive pelo `BffHttpClient` com `fetch` falso e status 409. Cobrem o `ConflictPanel` e o motivo aparado, `slotStillAvailable` `true`, `false` e ausente, a exceção, `BlockSeriesForm`, `OccurrenceActions`, `seriesFailure`, as quatro recusas da importação e a ausência do texto em inglês do serviço. O Tech Lead reexecutou `goal120` (2 arquivos), `goal119` e `goal016-appointment-series`: 67 de 67 passaram.

## Correção de registro aplicada no fechamento

O blocker da rodada 1 era só de registro e foi aplicado em `docs/migration/` neste fechamento, sem nova rodada:

1. **VALIDATION_GATE, seção do Goal120, subseção "Execução".** O parágrafo que dizia que `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check` não foram executados pela unidade saiu. A tabela passou a marcar as três linhas existentes como WU-03 e ganhou uma linha por gate do IA Loop da rodada 1 (WU-04 a WU-12), com as contagens acima e a falha da primeira execução do `test:gate` com a DIAG-001.

## Divergências aceitas

Nenhuma de tela: o Goal não tem quadro do protótipo e não muda layout, então não há `visual:compare`.

## Aceito sem prova completa

1. **Os controles negativos** vêm da execução do Developer na WU-03. O Tech Lead não os refez.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop da rodada 1, sem reexecução pelo Tech Lead, que reexecutou só os 67 testes citados.
3. **Conferência contra o BFF e o Scheduling rodando, na tela:** não feita. A prova do envelope real é o teste que passa o corpo real do BFF pelo `BffHttpClient`, mais os testes de integração do BFF que já afirmam o envelope (`goal009-calendar-routes`, `goal010-import-routes`).

## Observações registradas, sem mudar a decisão

1. **`requestError` de `occupancy.ts`** ainda mostra a mensagem do serviço nas recusas que nenhuma tela trata pelo nome. Fica fora do escopo do Goal, registrado em D-134 e no delta do CURRENT_STATE, sem Goal.
2. **Os leitores antigos de `upstreamCode`** (`features/imports/labels.ts`, `features/conversations/format.ts`, o helper de `ConnectSourceScreen.tsx` para `MINHA_AGENDA_*`, `KnowledgeDocumentForm.tsx`, `OtherInfoSection.tsx`) não foram trocados pelo leitor novo, como o Goal pediu. Unificá-los fica para quando outro Goal tocar esses pontos.
3. **A worktree nasce sem o Prisma client gitignored de `apps/ai-orchestrator`.** O `test:gate` precisou da DIAG-001 nesta rodada. É do ambiente do IA Loop, não do diff.
