# Review formal — Goal 103

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal103](../goals/103-a-listagem-de-agendamentos-traz-o-valor-registrado-e-a-presenca-confirmada.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

O Goal resolve a observação 1 do [review094](094-review.md): `GET /v1/appointments` e `GET /v1/appointments/:id` passam a devolver os seis campos de ciclo de vida que o contrato público já declarava (`completedAt`, `completionOrigin`, `noShowAt`, `noShowNote`, `presenceConfirmedAt` e `finalValue`), com o mesmo valor da rota de ciclo de vida. Nenhuma tela mudou de código. A IA continua sem esses campos. Decisão: [D-113](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `da5fc19a7b75593e721364648316b140411cc108` (Goal094). Base imediata da implementação: `79ddc3f0f74218040f24805353220480feff09b5`, HEAD da worktree `.ai-worktrees/goal-103`, sem commit na worktree. Entre as duas há só documentação (fechamento do Goal094 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **15 arquivos**, hash do diff `5ffd2243adb7760ce2fdcd45051c9b2d7e7280fc2d0cca74e3baca02202ddffb`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git diff --numstat 79ddc3f` e `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção: `apps/scheduling-service/src/modules/calendar/calendar-provider.ts` (+11, os seis campos em `CalendarAppointment`), `calendar/calendar-service.ts` (+8, `calendarAppointmentSchema` com `nullable().default(null)`), `integrations/atendly/provider.ts` (+8, `toAtendlyAppointment` copia os seis por `toSnapshot`), `appointments/appointment-lifecycle-service.ts` (+1/−1, só `export` em `toSnapshot`) e `apps/bff/src/clients/scheduling/index.ts` (+8, `appointmentSchema` do BFF).
  - Contrato e documentação de API: `packages/public-api-contract/src/schemas.ts` (+3/−3, só comentário; o tipo não mudou) e `apps/bff/PUBLIC_API_V1.md` (+15).
  - Testes novos: `apps/scheduling-service/tests/integration/goal103-appointment-listing-lifecycle.integration.test.ts` (**2** testes, prova 1), `apps/scheduling-service/tests/unit/goal103-appointment-listing-lifecycle.test.ts` (**6**, prova 2), `apps/bff/tests/goal103-appointment-listing-lifecycle.integration.test.ts` (**3**, prova 3) e `apps/ai-orchestrator/tests/goal103-appointment-lifecycle-not-exposed.test.ts` (**2**, prova 4). Nenhum teste existente ajustado, removido ou pulado.
  - Documentos: `docs/migration/DECISIONS.md` (D-113 e notas ao fim de D-108 e D-112), `CURRENT_STATE.md`, `GAP_ANALYSIS.md` e `VALIDATION_GATE.md`.
- `apps/frontend/` (inclusive `e2e/`), `apps/ai-orchestrator/src/`, `prisma/`, `scripts/`, as configurações de vitest e playwright e as rotas de escrita não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers, nenhum de produção.** O código estava correto e dentro do desenho do Goal. Blockers: (1) a unidade de diagnóstico DIAG-001 tinha alterado `apps/frontend/e2e/authenticated-matrix.spec.ts` (`DEMO_PLAYBACK_TIMEOUT_MS` e espera pelo fim das animações) depois de a primeira execução de `validate:integration` falhar por contraste em `onboarding-demonstracao-da-ia`; o §6 proíbe mudar `e2e/`, e o critério 8 aceita só arquivos autorizados, então o arquivo devia voltar ao estado de `79ddc3f`; (2) `validate:integration` precisava rodar de novo na árvore revertida; (3) faltava a contagem de `test:bff-integration` com banco e o resumo por suíte, com a baseline de cada uma; (4) os documentos descreviam a árvore com o spec alterado.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** O spec foi revertido, `validate:integration` passou na árvore final, VALIDATION_GATE ganhou a recontagem por suíte e os documentos passaram a descrever a árvore revertida. O código de produção é o mesmo da rodada 1.

O perfil do Developer declarado no Goal é `OPUS_MEDIUM`. A rodada 1 recomendou `SONNET_MEDIUM` para a correção, que era só reversão, gate e documentos.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal103 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal103) e na "Prova" de D-113.

- **Reversão do spec e2e, conferida pelo Tech Lead na rodada 2.** `git hash-object` de `apps/frontend/e2e/authenticated-matrix.spec.ts` dá `2f75aa9d…`, igual ao blob de `79ddc3f`. O `sha256` do arquivo difere só por CRLF (`core.autocrlf=true`); com o blob convertido para CRLF, o hash é o mesmo. `git status --porcelain=v1 -uall` não lista o arquivo. `git diff 79ddc3f --stat` ficou vazio em `apps/frontend`, `apps/ai-orchestrator/src`, `prisma`, `scripts` e nas configurações de vitest e playwright.
- **Código conferido.** `toSnapshot` exportada e reusada em `toAtendlyAppointment`, sem segunda serialização (D-113 (b)). Os seis campos com `nullable().default(null)` no Scheduling e no BFF (c). `finalValueSetAt`, `finalValueSetBy` e `completedBy` não saem (a). No contrato, só o comentário mudou (f). `client.ts` da IA com `sha256` `1d52cdac…`, sem mudança (e).
- **Provas.** O Tech Lead reexecutou a prova 2 (**6**/**6**) e a prova 4 (**2**/**2**) nas duas rodadas. Leu as provas 1 e 3. A prova 1 roda pela rota HTTP contra PostgreSQL real, por `customerId`, por intervalo e por id, compara campo a campo com a rota de ciclo de vida e testa `149.9` e o agendamento com os seis campos `null`. A prova 3 cobre a forma nova e a antiga nas duas rotas do BFF.
- **Identidade do código aceito.** Os dez `sha256` de "Árvore avaliada" em VALIDATION_GATE batem com a worktree.
- **Execução final da rodada 2 (FIX-001).** `validate:integration` exit 0, **36**/**36** passos, contra um PostgreSQL 18 recém-provisionado, com o gate autenticado em **255** `passed` e **0** retentativas. `onboarding-demonstracao-da-ia` passou sem retentativa. `test:bff-integration` **477**, `test:scheduling-integration` **145**, `test:ai-orchestrator` **1188** `passed` e **98** `skipped`. A WU-07 nativa da rodada 2 também deu exit 0, `255 passed (7.9m)` e `authenticated gate retries: 0`. Typecheck, `validate:core` e `git diff --check` passaram na rodada 2.
- **Recontagem por suíte.** Baseline do `test:ai-orchestrator` medida (**1186**). Baselines do BFF (**474**) e do Scheduling (**143**) derivadas por subtração dos testes novos, forma que o blocker 3 autorizava, declarada como tal. Nenhuma suíte ficou com teste a menos.
- **Conferência com a pilha real (§4).** Aceita pelo registro colado em VALIDATION_GATE, não reexecutada pelo Tech Lead: `GET /v1/appointments` devolveu `finalValue: 149.9` com `completionOrigin: "MANUAL"` num concluído, `presenceConfirmedAt` preenchido noutro e os seis `null` no terceiro.

## Aceito sem prova completa

1. **Controle negativo 4 do §5.** O controle literal (declarar `finalValue` só no schema da IA) não reprova, porque `toAppointment` copia campo a campo e o campo declarado não chega ao resultado. O desenho do controle no Goal não alcança a exposição. A variante que também copia o campo em `toAppointment` reprova **2**/**2**. O Tech Lead aceita a execução literal (verde) mais a variante (vermelha) como cobertura do critério 2.
2. **O vermelho da baseline das provas 1 a 3** vem dos relatórios da WU-01 e da WU-02 (`Tests 7 failed | 1 passed (8)` nas provas 1 e 2). Não foi reexecutado na WU-08 nem pelo Tech Lead. O vermelho da prova 3 fica coberto pelo controle 2, que reproduz o schema da baseline.
3. **O resumo da Home** (`todayAppointments` e `nextAppointment`) recebe os seis campos pela mesma função, sem prova própria.
4. **A falta (`no-show`) pela pilha real** não foi exercitada. `noShowAt` e `noShowNote` estão provados só pelas provas 1 e 3.

## Observações registradas, sem mudar a decisão

1. **Falha intermitente de contraste em `onboarding-demonstracao-da-ia`.** A primeira execução de `validate:integration` da rodada 1 saiu com exit 1 por contraste nessa tela. A causa não foi medida. Na árvore final, com o spec igual a `79ddc3f`, a tela passou sem retentativa em duas execuções. A hipótese da DIAG-001 é que o axe mede o fade-in `rise` da demonstração. Fica como proposta de Goal futuro, sem código neste Goal.
2. **O critério 4 não cita o typecheck explícito** de `scheduling-service` e `bff` nos documentos; ele passou nos gates do IA Loop das duas rodadas.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**, e o `visual:compare` não rodou: o CL6 e o A1 não mudam de código, e a conta de teste não tem concluído com valor. O valor registrado no CL6 e "presença confirmada pelo lembrete" no A1 ficam provados no nível da resposta da API pela pilha real e, na tela, só pelas provas jsdom de D-108 e D-112.
- A parte da divergência 5 de D-108 sobre o preço de Juliana Mendes (`totalPrice`), que este Goal não tocou.
