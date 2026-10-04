# Review formal — Goal 073

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-29, conforme o [Goal073](../goals/073-politica-de-cancelamento-e-visualizacao-da-agenda.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–067, 070 e 071) foi reaberto, reavaliado ou revertido. **Quatro rodadas**: as rodadas 1, 2 e 3 terminaram `CHANGES_REQUIRED`, com 4, 3 e 1 blockers, e a rodada 4 terminou com zero.

O Goal corrige a parte de **QA S-06** que o Goal067 deixou (política de cancelamento e remarcação pelo WhatsApp) e **QA S-08** ("Como você vê a agenda") da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e as **observações 2 e 5 do [review067](067-review.md)**. A política mora no Scheduling, que a aplica na transação de cancelar e remarcar a todo chamador `AI`, com uma só isenção nomeada para a limpeza do teste real. A IA confere o prazo ao preparar, e a recusa nunca conta como efeito para a guarda do Goal057. "Como você vê a Agenda" mora no BFF, e a Agenda abre em Automática (Semana a partir de 1024px, Dia abaixo) ou na visualização gravada, sem os dias ocultos ([D-086](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `a1adf4b08f31c691b85c16afb342949cf9e9e98a` (Goal067). Base imediata da implementação: `16db223240a52032cd52d28aa6b3d270413efcec`, HEAD da worktree `.ai-worktrees/goal-073`, inalterado nas quatro rodadas. O commit `16db223` é só documental (fechamento do Goal067 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **60 arquivos**, hash do diff `78a8d84d446e6d89ece382fce9c60ef7b719b2a40c798555db789d4890434ee4`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Cinquenta e três arquivos rastreados**, por `git diff --numstat 16db223`:
  - `apps/scheduling-service/`: `prisma/schema.prisma` (+9/−0, `customerChangeMinNoticeMinutes`), `modules/integrations/avenly/provider.ts` (+52/−0, `assertCustomerChangePolicy` dentro da transação), `modules/internal-api/routes.ts` (+13/−0), `modules/calendar/routes.ts` (+3/−0, `policyExemption` só em `/cancel`) e `modules/calendar/calendar-provider.ts` (+7/−0, o tipo da isenção).
  - `apps/ai-orchestrator/`, produto: `modules/tools/assistant-tools.ts` (+127/−7), `modules/scheduling-service/client.ts` (+57/−2) e `types.ts` (+19/−0), `modules/activation-test/ActivationTestCleanupService.ts` (+4/−0), `modules/prompts/scheduling.ts` (+1/−0), `modules/prompts/system.ts` (+6/−1, `PROMPT_TEMPLATE_VERSION` de `v7` para `v8`) e `lib/dates.ts` (+49/−0, `instantFromZonedDateTime`).
  - `apps/ai-orchestrator/tests/` ajustados: `assistant/assistant.service.test.ts` (+8/−5), `evals/harness.ts` (+6/−0), `integration/hold-release.test.ts` (+3/−0), `prompts/system.test.ts` (+6/−6), `tools/assistant-tools.test.ts` (+4/−0), `tools/exception-out-of-reach.test.ts` (+3/−0) e `tools/explicit-confirmation.test.ts` (+3/−0).
  - `apps/bff/`: `prisma/schema.prisma` (+27/−0, `AgendaViewPreference`), `src/modules/settings/routes.ts` (+66/−0), `src/clients/scheduling/index.ts` (+3/−0) e `PUBLIC_API_V1.md` (+28/−1).
  - `packages/public-api-contract/`: `src/schemas.ts` (+16/−0) e `src/routes.ts` (+3/−0).
  - `apps/frontend/`, produto: `features/settings/CalendarSettings.tsx` (+239/−21), `AvailabilitySettings.tsx` (+6/−0), `features/knowledge/OtherInfoSection.tsx` (+6/−1), `features/agenda/AgendaBoard.tsx` (+42/−2), `WeekView.tsx` (+9/−2), `MonthView.tsx` (+19/−2), `data/services/BffSettingsService.ts` (+38/−0) e `shared/styles/avenly-agenda.css` (+5/−5).
  - `apps/frontend/`, medição: `e2e/authenticated-matrix.spec.ts` (+5/−0). É o **desvio declarado** de D-086: `ensureAgendaOnMeasuredDate` travava em timeout em `notebook-1024` e `desktop-1440`, onde a Agenda agora abre em Semana.
  - `apps/frontend/tests/` ajustados, quinze arquivos de `goal016-*` a `goal067-*` (+1 a +16 linhas cada), para o mock da leitura nova de `/v1/settings/agenda-view` e a política em Configurações › Agenda.
  - Os quatro documentos de `docs/migration/`, só por acréscimo no snapshot aceito: `CURRENT_STATE.md` (+126), `DECISIONS.md` (+33, D-086), `FINAL_AUDIT.md` (+71, §47) e `VALIDATION_GATE.md` (+146).
- **Sete arquivos novos**:
  - migrations aditivas `apps/scheduling-service/prisma/migrations/20260928120000_goal073_customer_change_policy/migration.sql` (**23** linhas, CHECK de 0 a 10080) e `apps/bff/prisma/migrations/20260928130000_goal073_agenda_view_preference/migration.sql` (**22** linhas);
  - testes `apps/scheduling-service/tests/integration/goal073-customer-change-policy.integration.test.ts` (**582** linhas), `apps/ai-orchestrator/tests/tools/goal073-customer-change-policy.test.ts` (**622** linhas), `apps/bff/tests/goal073-settings-policy-and-agenda-view.integration.test.ts` (**270** linhas), `apps/frontend/tests/goal073-configuracoes-agenda.test.tsx` (**397** linhas) e `goal073-agenda-visualizacao.test.tsx` (**254** linhas).
- Nenhum arquivo foi tocado em `apps/evolution-go/`, `scripts/` ou `tools/ia-loop/`. Nenhuma configuração de teste mudou. `KNOWN_*` sem exceção nova. `this.http.` em `apps/bff/src/clients/` segue em **43**. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

Já estava correto: o núcleo. O Scheduling aplica a política dentro de `runCalendarWrite`, só para `source` `AI` derivado da credencial, depois do atalho de atendimento já cancelado, com `databaseNow`, e devolve 409 com `details`. A isenção só existe em `/cancel`. A migration é aditiva, e o `PATCH` continua humano. Na IA, `prepare` confere antes de `setPendingAction` e do hold, `confirm` limpa a pendência e o hold, e `run()` grava `FAILED`, então `loadTurnConfirmedEffects` não conta a recusa. O BFF grava `AgendaViewPreference` com cascade, e o `GET` não grava linha. O `PATCH` valida repetido, 0–6 e no máximo 6 itens, sempre no tenant da sessão. As observações 2 e 5 do review067 estavam corrigidas, e os gates passaram. Os quatro blockers:

1. **A recusa da IA saía do contrato do Goal.** `outsidePolicyFailure` devolvia só `details: { minNoticeMinutes }`, sem `outsidePolicy: true` nem o prazo em horas, e o prompt mandava reagir a um campo que o modelo nunca via. Faltava também o caso de `reschedule_appointment` recusado no `confirm` gravando `FAILED`.
2. **A fronteira exata não tinha prova permanente.** Os testes "exatamente 24h e 25h" somavam 5 s de folga, e trocar `<` por `<=` passava a suíte. O controle 3 só reprovou num arquivo temporário já apagado.
3. **Faltava o vermelho da baseline** dos testes novos do orquestrador, do BFF e do frontend, e os documentos o atribuíam às unidades de implementação.
4. **Os dois painéis de Configurações › Agenda gravavam a edição não salva um do outro** e compartilhavam o estado de envio e a mensagem.

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

O código dos quatro blockers da rodada 1 foi conferido e estava correto: a recusa traz `details: { outsidePolicy: true, minNoticeHours, minNoticeMinutes }` no `prepare` e no `confirm`; os testes de fronteira congelam `databaseNow` sem folga; o vermelho de `a1adf4b` da IA, do BFF e do frontend foi rodado e colado; cada painel envia só o próprio campo, a partir de `settings.availability`. Os três blockers:

1. **O parágrafo "Prova" de D-085, decisão já ACCEPTED, foi apagado** ao inserir D-086. O Goal só permite acréscimo.
2. **FINAL_AUDIT §47, VALIDATION_GATE e CURRENT_STATE seguiam com contagens e frases da rodada 1**, falsas sobre a árvore final.
3. **A execução final não foi refeita sobre a árvore da rodada 2**, que mudou o teste de integração do Scheduling e `CalendarSettings.tsx`: `validate:integration` não rodou.

## Rodada 3 — CHANGES_REQUIRED (1 blocker)

Os três blockers da rodada 2 estavam resolvidos: o parágrafo de D-085 voltou idêntico, o diff dos quatro documentos contra `16db223` não tem nenhuma linha removida, e os documentos citam as contagens da execução final refeita e o controle 3 contra o teste permanente. O único blocker: **uma unidade de diagnóstico do harness (DIAG-001) acrescentou `fileParallelism` em `apps/bff/vitest.config.ts`** depois da execução final, fora do escopo do Goal. Isso tornava falsas as frases "a rodada 3 só mudou documentação" e "`git status` lista só os arquivos declarados". Correção pedida: restaurar o arquivo byte a byte da baseline, sem outra edição.

## Rodada 4 — ACCEPTED (0 blockers)

- **B1:** `apps/bff/vitest.config.ts` voltou à baseline. O blob em disco é `f624398e8deca6144a8c7a3ab3ca16543215a468`, o mesmo de `16db223`, e `git diff --exit-code` retorna 0. `git diff --numstat 16db223` lista 53 arquivos rastreados, mais 7 não rastreados: as 60 entradas declaradas.
- Fora o hunk revertido, o patch da rodada 4 é idêntico ao da rodada 3, já revisto em profundidade. Os documentos voltaram a ser verdadeiros e não citam DIAG-001 nem `fileParallelism`.
- Na revisão, todos os gates foram reexecutados nesta árvore, todos com exit 0: typecheck dos quatro apps, lint do frontend, testes `goal073-*` do orquestrador e do frontend, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` (396 s, com as integrações do BFF e do Scheduling contra PostgreSQL) e o `git diff --check`.

Prova declarada pelo Developer, na execução final da rodada 3 sobre a árvore final, e conferida na revisão:

- `validate:core`: **17** passos, **15** `passed`, **2** `skipped`, **0** `failed`. Dentro dele: `test:ai-orchestrator` **86**/**98** arquivos (**12** pulados) e **1127**/**1215** testes (**88** pulados), baseline **85**/**1117**; `test:scheduling-service` **35**/**35** e **484**/**484**, sem mudança; `test:frontend` **96**/**96** e **1000**/**1000**, baseline **94**/**979**; `audit:static` **33** de **34**, **1** pulada.
- `test:gate`: **233**/**233**.
- `validate:ui`: **169** passando, **21** pulados, **0** falhando, **0** retentativas.
- `validate:integration`: **35**/**35** passos, contra PostgreSQL 18 descartável. `test:bff-integration` **56**/**439** (baseline **55**/**434**); `test:scheduling-integration` **17**/**140** (baseline **16**/**124**); `rehearse:goal033-authenticated-ui` com `expected` **155**, `unexpected` **0**, `flaky` **0** e **0** retentativas, sem mudança de rota.
- Vermelho de `a1adf4b` dos testes novos: Scheduling **16** falhando (WU-01, rodada 1); orquestrador **8** de **10**, BFF **5** de **5** e frontend **18** de **21** (FIX-001, rodada 2).
- Oito controles negativos do §8 colados com hash antes, durante e depois, idênticos na restauração, em [FINAL_AUDIT §47](../FINAL_AUDIT.md). Não reexecutados na revisão.
- Nenhuma exceção nova em `KNOWN_*`. Nenhuma suíte encolheu.

## Observações registradas, sem mudar a decisão

1. **`PUBLIC_API_V1.md` não nomeia `CUSTOMER_CHANGE_OUTSIDE_POLICY`.** O §3 do Goal pede o erro visto pela IA. O acréscimo documenta o campo, as duas rotas novas e o 400, e declara a aplicação da regra "fora deste contrato". O erro está descrito em D-086 e no código.
2. **O atalho de `ensureAgendaOnMeasuredDate` assume que `MEASURED_DATE` cai na semana ou no mês corrente.** Na virada de domingo para segunda, os dias seguintes a "hoje" caem na semana seguinte, e a semeadura do gate pode não achar horário sem navegar.
3. **O teste-guarda da isenção só casa o literal `"ACTIVATION_TEST_CLEANUP"` em linha isolada.** Um uso novo escrito na mesma linha de outra expressão escaparia da guarda.
4. **Configurações › Agenda deixa marcar os sete dias como ocultos.** O BFF recusa (no máximo seis), e a tela só mostra o erro genérico do `PATCH`.
5. **D-086 "Consequências" não lista todos os arquivos tocados.** Faltam `apps/ai-orchestrator/src/lib/dates.ts`, `modules/prompts/system.ts` (prompt `v8`), `apps/scheduling-service/src/modules/calendar/calendar-provider.ts` e os testes ajustados; a lista deste review é a completa.
6. **`git status` ainda marca `apps/bff/vitest.config.ts` como ` M`.** É só stat sujo: o arquivo foi regravado com LF, e o checkout com `core.autocrlf=true` tinha CRLF. O conteúdo é idêntico à baseline, e `git add` não gera mudança. `git update-index --refresh` limpa a marca. O arquivo não entra no fechamento.
7. **Uma unidade de diagnóstico do harness (DIAG-001) editou configuração de teste fora do escopo do Goal** quando WU-16 ficou `SKIPPED` por falta de `*_TEST_DATABASE_URL`. Isso custou a rodada 3. `SKIPPED` por falta de banco é pré-condição do harness, não falha a corrigir no diff.

As observações 1, 2 e 4 são candidatas a ajuste no Goal068, no Goal069 ou em revisão futura.

## O que o aceite não prova

- Que Configurações › Agenda e a Agenda batem com o protótipo `Mais-Negocio-Agenda-IA` nas opções e nos textos, nem se a opção Automática deve existir. A conferência humana do §9 do Goal **não foi feita**.
- Que a IA, numa conversa real, explica o prazo e oferece falar com o profissional sem dizer que cancelou ou remarcou. Fica nos testes do orquestrador e na instrução do prompt `v8`.
- A estrutura e a fidelidade visual da Agenda além do que este Goal muda (qual visualização abre, quais colunas aparecem), que ficam para o Goal069.
- A fidelidade visual de Configurações ao protótipo além do que este Goal cria, que é do Goal068.

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §47](../FINAL_AUDIT.md)).
