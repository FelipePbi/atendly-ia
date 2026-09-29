# Review formal — Goal 074

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-29, conforme o [Goal074](../goals/074-a-home-conforme-o-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–068, 070, 071 e 073) foi reaberto, reavaliado ou revertido. **Quatro rodadas**: as rodadas 1, 2 e 3 terminaram `CHANGES_REQUIRED`, com 6, 3 e 3 blockers, e a rodada 4 terminou com zero.

O Goal corrige **QA H-01**, **H-06**, **H-07**, **H-08** e **H-10** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, a **observação 3 do [review068](068-review.md)** e a **observação 1 do [review073](073-review.md)**. O orquestrador passa a gravar cada tomada de controle humano na tabela nova `HumanTakeover`. Com ela, "Esta semana" ganha três números reais: agendamentos, marcados pela IA e conversas que você assumiu. A Home tem uma faixa de estado só, a ordem do protótipo e o sino ([D-088](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `7d62f4f9eb2415c6dc7ccdefb2f2aa4a8c024692` (Goal068). Base imediata da implementação: `b0fd5aa5f8d358c83b790f49f53715554b8ae93d`, HEAD da worktree `.ai-worktrees/goal-074`, inalterado nas quatro rodadas. Os commits `bb2c658` e `b0fd5aa` são só documentais (status e fechamento do Goal068, preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **36 arquivos**, hash do diff `762f9797722ca3004638e5d24601df28e6f8b2b36d64e9c25eec1c3cc021180e`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e nove arquivos rastreados**, por `git diff --numstat b0fd5aa`:
  - `apps/ai-orchestrator/`, produto: `prisma/schema.prisma` (+25/−0, modelo `HumanTakeover`), `src/modules/session/SessionService.ts` (+25/−3, gravação na transação de `assumeHumanControl`), `src/modules/internal/routes.ts` (+81/−48, `countConfirmedAppointments` e os dois números da semana), `src/lib/dates.ts` (+14/−0, `startOfWeekInTimeZone`) e `src/modules/internal/tenantPurge.ts` (+5/−2, `HumanTakeover` em `TENANT_PURGE_TABLES`).
  - `apps/ai-orchestrator/tests/` ajustados: `assistant/assistant.service.test.ts` (+4/−4, 207 para 208 arquivos varridos, pelo client Prisma gerado com o modelo novo), `internal/dashboard-ai-appointments.routes.test.ts` (+4/−0), `retention/tenant-purge.test.ts` (+16/−4) e `session/support/fake-prisma.ts` (+12/−0).
  - `apps/scheduling-service/src/modules/internal-api/routes.ts` (+19/−0, `appointmentsThisWeek` filtrado por `date` da semana).
  - `packages/public-api-contract/src/schemas.ts` (+7/−0). `apps/bff/`: `src/clients/ai-orchestrator/index.ts` (+4/−0), `src/clients/scheduling/index.ts` (+3/−0), `PUBLIC_API_V1.md` (+14/−0) e `tests/goal059-whatsapp-status.integration.test.ts` (+3/−0, campos de fixture).
  - `apps/frontend/`, produto: `features/dashboard/DashboardScreen.tsx` (+424/−416) e `shared/styles/atendly.css` (+57/−154).
  - `apps/frontend/tests/` ajustados: `goal018-dashboard-status` (+4/−0), `goal059-whatsapp-status-view` (+3/−0), `goal063-home-checklist` (+39/−4), `goal064-greeting-and-account` (+3/−0) e `goal068-assinatura` (+1/−1, só o título, observação 3 do review068).
  - `scripts/validate-integration.mjs` (+12/−0, passo `rehearse:goal074-human-takeover-migration`) e `scripts/tests/validate-integration.test.mjs` (+1/−0). É o **desvio declarado** do §11 (ver rodada 1).
  - Os cinco documentos de `docs/migration/`, só por acréscimo no snapshot aceito: `CURRENT_STATE.md` (+142), `DATA_MIGRATION.md` (+20, §22), `DECISIONS.md` (+42, D-088), `FINAL_AUDIT.md` (+113, §49) e `VALIDATION_GATE.md` (+186).
- **Sete arquivos novos**:
  - migration aditiva `apps/ai-orchestrator/prisma/migrations/20260929120000_goal074_human_takeover/migration.sql` (**24** linhas);
  - ensaio `scripts/goal074-human-takeover-migration-rehearsal.mjs` (**331** linhas), também parte do desvio declarado;
  - testes `apps/ai-orchestrator/tests/integration/goal074-human-takeover.test.ts` (**203** linhas), `apps/ai-orchestrator/tests/internal/goal074-dashboard-week.routes.test.ts` (**209**), `apps/scheduling-service/tests/unit/goal074-dashboard-week.test.ts` (**244**), `apps/bff/tests/goal074-dashboard-week.test.ts` (**158**) e `apps/frontend/tests/goal074-home.test.tsx` (**614**).
- Nenhum arquivo foi tocado em `apps/evolution-go/` ou `tools/ia-loop/`. Nenhuma configuração de teste mudou: `vitest.config.*`, `playwright.config.*`, `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` ficaram como estavam. Nenhuma migration no BFF nem no Scheduling. `KNOWN_*` sem exceção nova. `QA_LOCAL_REVIEW.md`, o Product Vault e `docs/design-reference/` não foram editados.

## Rodada 1 — CHANGES_REQUIRED (6 blockers)

Já estava correto: o backend. A migration de `HumanTakeover` é só aditiva, e a FK composta `(tenantId, sessionId)` tem cascade a partir de `ConversationSession`. `assumeHumanControl` lê o estado na mesma transação e só grava na passagem de IA para humano, com `WHATSAPP` ou `ATENDLY`. `countConfirmedAppointments` é uma função só para as duas janelas, e `aiAppointmentsToday` não muda de valor. `startOfWeekInTimeZone` usa a mesma convergência de `startOfTodayInTimeZone`. Contrato e BFF são só aditivos, e a tabela nova entrou na purga de tenant. Os seis blockers:

1. **A faixa de estado contradizia a própria tela.** Todo estado da IA diferente de `off` virava "IA ativa", inclusive `pending`, `unknown` e `loading`. Com `PENDING`, a faixa dizia "IA ativa" no título, "IA em ativação" no ponto de status e mostrava o checklist "Ative sua IA" logo abaixo. Faltava o estado "IA inativa" do H4.
2. **"Precisa da sua atenção" aparecia sem pendência**, com "Nenhuma", contra o protótipo H1.
3. **"Hoje" divergia das escolhas de desenho.** O vazio não dizia "Nenhum atendimento hoje." nem oferecia criar agendamento. O marcador "agora" nunca pegava o atendimento em curso.
4. **`appointmentsThisWeek` contava por sobreposição de instante**, não por `date`. Um agendamento do domingo anterior que cruza a meia-noite entrava na conta.
5. **Desvio do §11 não declarado.** O diff toca `scripts/` (o ensaio novo, `validate-integration.mjs` e o teste dele). O Tech Lead aceitou o desvio: é a primeira migration da IA desde o Goal023, e o banco de durabilidade `_goal004` só recebe migration por ensaio em `scripts/`. O desvio é aditivo e não afrouxa gate, mas precisava estar declarado nos documentos.
6. **A evidência citada tinha `flaky` 1** no gate autenticado (`onboarding-horarios`), e o critério 5 exige 0 retentativas.

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

Os blockers 2, 4, 5 e 6 da rodada 1 foram fechados: a seção de atenção só aparece com pendência, a semana do Scheduling filtra por `date` com regressão para o caso da meia-noite, o desvio está declarado em D-088, e o gate autenticado deu **155** com **0** retentativas. Ficaram três blockers:

1. **O blocker 1 foi entregue pela metade.** Não havia estado "IA inativa". A IA `OFF` mostrava "IA pausada" com o checklist "Ative sua IA" abaixo e "IA desligada" no ponto de status: três descrições do mesmo estado. O item 8 de D-088 continuava com a ordem antiga, e nenhum teste cobria `PENDING`, `OFF` ou `UNKNOWN`.
2. **O blocker 3 tinha código sem evidência.** Nenhum teste conferia o vazio de "Hoje" nem o marcador "agora".
3. **A execução final e os oito controles do §8 precisavam ser refeitos** sobre a árvore corrigida. A rodada 2 só reexecutou os controles 4, 6, 7 e 8, e o relatório marcou o blocker 1 como "OK" sem teste.

## Rodada 3 — CHANGES_REQUIRED (3 blockers)

O código passou a separar "IA inativa" (`OFF` com checklist incompleto) de "IA pausada" (`OFF` com os quatro passos concluídos), e chegaram os testes do vazio e do atendimento em curso. Os gates passaram. Ficaram três blockers:

1. **O blocker 1 da rodada 2 continuou sem evidência nem documento.** Nenhum teste afirmava "IA inativa", e o item 8 de D-088 seguia com a ordem antiga. Havia ainda uma contradição: com `PENDING` e o checklist completo, a faixa dizia "Conclua os passos abaixo…" sem checklist na tela.
2. **Faltava o caso do marcador "agora" sem atendimento em curso.**
3. **Nenhum documento foi tocado.** FINAL_AUDIT §49, VALIDATION_GATE e CURRENT_STATE continuavam com as contagens da rodada 2, e os controles 1, 2, 3 e 5 não tinham saída documentada desde a rodada 1.

## Rodada 4 — ACCEPTED (0 blockers)

Revisão DEEP do diff contra `b0fd5aa`. Os três blockers da rodada 3 foram fechados com código e evidência na mesma rodada:

- **Faixa com a IA não ativa.** No ramo `pending` de `resolveOperationalState`, a descrição depende de `checklistComplete`. Com o checklist completo, a faixa diz "Os passos estão concluídos; falta a IA confirmar a ativação.", e o checklist está oculto. `goal074-home.test.tsx` cobre `PENDING` com checklist incompleto, `PENDING` com checklist completo, `OFF` com checklist incompleto e `UNKNOWN`, todos com WhatsApp `CONNECTED`. Cada teste afirma que "IA ativa" não aparece, que existe um só `#operational-status` e qual é o título. O item 8 de D-088 tem a ordem real e declara que "pausada" é inferida pelo checklist completo.
- **Marcador "agora".** Teste com relógio fixo às 10:45 em `America/Sao_Paulo` afirma a ordem `[Ana Paula, agora, Bia Ramos]` e um só `.agenda-now-marker`.
- **Documentação.** Subseção "Correção — rodada 3" acrescentada em FINAL_AUDIT §49, VALIDATION_GATE e CURRENT_STATE, com os oito controles do §8 e o `sha256` de cada arquivo-alvo. O Tech Lead recalculou os cinco hashes (`DashboardScreen.tsx`, `internal/routes.ts`, `SessionService.ts`, a rota do Scheduling e o cliente do BFF), e todos batem com os documentados.

Verificação própria na rodada 4: os seis arquivos de teste da Home (`goal074`, `063`, `018`, `059`, `064` e `068`) com **58**/**58**; `git status` com 36 entradas, iguais à lista declarada; `e2e-results/` no `.gitignore`. O backend foi conferido por amostragem, sem regressão.

## Evidência final aceita

Execução final da rodada 4, declarada pelo Developer em [FINAL_AUDIT §49 — Correção, rodada 3](../FINAL_AUDIT.md), depois da última edição de código:

- `validate:core`: **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0. Dentro dele: `test:frontend` **100**/**1048**, `test:ai-orchestrator` **1133**/**1226** (**93** pulados) e `test:scheduling-service` **36**/**491**.
- `test:gate` **233**/**233**. `validate:ui` com **169** passando, **21** pulados e **0** retentativas.
- `validate:integration` com **36**/**36** passos (o passo novo é `rehearse:goal074-human-takeover-migration`), exit 0, e o gate autenticado com **155** passando e **0** retentativas.
- Os oito controles do §8 reprovam com o defeito e passam sem ele, com restauração conferida por hash. Não reexecutados na revisão.

**Aceito sem reprodução da integração.** Na rodada 4, o gate WU-15 (`validate:integration`) do IA Loop ficou `SKIPPED` por falta de `*_TEST_DATABASE_URL`, que o §11 trata como pré-condição do harness. Os **36**/**36** passos e o gate autenticado **155**/**0** retentativas vêm da execução do Developer contra um PostgreSQL descartável, não reproduzida pelo Tech Lead. A rodada 4 só mudou `apps/frontend/`, e `validate:ui`, o teste jsdom, o typecheck e o lint passaram no IA Loop.

## Observações registradas, sem mudar a decisão

1. **Comentários de código com o destino errado.** `packages/public-api-contract/src/schemas.ts:851` e `:870`, `apps/bff/src/clients/ai-orchestrator/index.ts:551` e `apps/bff/src/clients/scheduling/index.ts:1520` dizem que os números servem "para o checklist da Home". Servem para "Esta semana". Levantada na rodada 1 e não corrigida.
2. **D-088 "Consequências" não lista todos os arquivos tocados.** Faltam `apps/ai-orchestrator/src/modules/internal/tenantPurge.ts` e os testes ajustados `assistant.service.test.ts`, `dashboard-ai-appointments.routes.test.ts`, `tenant-purge.test.ts`, `fake-prisma.ts` e `apps/bff/tests/goal059-whatsapp-status.integration.test.ts`. A lista deste review é a completa.
3. **A purga de tenant apaga `HumanTakeover` por enumeração, não só por cascade.** D-088 e DATA_MIGRATION §22 falam só do cascade a partir da sessão. A tabela entrou em `TENANT_PURGE_TABLES`, antes de `ConversationSession`.
4. **Os documentos dizem mais do que as rodadas entregaram.** A nota "Correção, rodada 2" de CURRENT_STATE e a subseção "Rodada 2 (FIX-001): seis blockers corrigidos" de FINAL_AUDIT §49 afirmam os seis blockers corrigidos. A revisão da rodada 2 achou o blocker 1 pela metade e o blocker 3 sem evidência. Os dois só fecharam na rodada 4.
5. **Numeração das subseções.** "Correção — rodada 3 (entregue na rodada 4)" é a correção da rodada 4 do IA Loop e sustenta o aceite. A correção da rodada 3 do IA Loop não escreveu documento. As contagens da execução WU-16 (`flaky` **1**) e da rodada 2 (`test:frontend` **1040**) foram substituídas.
6. **"IA pausada" é inferida, não medida.** Com a IA `OFF` e os quatro passos concluídos, a faixa diz "IA pausada" e o checklist some. Por isso `goal063-home-checklist` mudou a fixture do teste "itens concluídos continuam marcados e alcançáveis" de 4/4 para 3/4 passos, e ganhou um teste para o checklist oculto com 4/4. A asserção do Goal063 continua, com um passo pendente. Uma IA desligada depois da ativação e uma IA que nunca ligou, mas com os quatro passos feitos, aparecem iguais. Isso vale até existir dado de pausa.
7. **O controle 8 reprova pela lista de títulos, não pela data.** Com o card "Próximo atendimento" de volta, os dois testes que reprovam conferem a ordem dos `<h2>`. O teste que procura `AAAA-MM-DD` não é o que reprova nesse controle.

As observações 1, 2 e 3 são candidatas a ajuste no Goal069 ou em revisão futura. A observação 6 depende de dado de pausa, fora do escopo de D-088.

## O que o aceite não prova

- Que a Home, percorrida num aparelho real nas cinco larguras e nos estados da faixa, bate com `Home.dc.html`, `Home-Tablet.dc.html` e `Home-Desktop.dc.html`. A conferência humana do §10 do Goal **não foi feita**.
- Que os três números da semana fazem sentido para quem usa, com as definições de D-088. Mesma conferência humana, **não feita**.
- Tomadas de controle humano anteriores à migration, que não existem em registro nenhum.
- A fidelidade visual das telas de módulo e da central de notificações (Goal069) e do onboarding (Goal072).

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §49](../FINAL_AUDIT.md)).
