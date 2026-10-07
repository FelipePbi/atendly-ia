# Review formal — Goal 142

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal142](../goals/142-a-ia-reconhece-pelo-numero-do-responsavel-quem-ele-agenda.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review do diff inteiro, sem blocker; nenhuma correção de registro ficou para o fechamento.

Quem escreve pelo número de um responsável confirmado (`PRIMARY_GUARDIAN` `CONFIRMED`) passa a ter os dependentes dele entre os candidatos da IA, cada um com `scheduledBy`. Quando o contato está vinculado a um desses dependentes, a IA propõe o dependente com `requiresConfirmation` e o motivo `LAST_BOOKED_FOR_DEPENDENT` ("Seria para o <nome> novamente?"), sem assumir. O responsável cancela e remarca pela IA o horário do dependente; a confirmação de presença continua só para os horários do próprio número. No Scheduling, a leitura nova `GET /internal/customers/dependents?phone=` e `includeDependents` em `GET /internal/appointments`, com padrão `false`. Só a IA e o Scheduling: o contrato público, o BFF, `PUBLIC_API_V1.md`, o frontend e o banco não mudaram, e nenhuma tela mudou. Decisão: [D-156](../DECISIONS.md), aceita neste fechamento. A pergunta 144 passou a ter comportamento na IA, e o CL8 deixa de depender de comportamento inexistente; o CL8 não foi portado aqui.

## Escopo e identidade do diff

- Baseline aceita vigente: `c6a2f555d821cab465a8c969dcfba863f6df7e10` (Goal141). Base imediata da implementação: `860499a0b02b1ecf4a544347d58e0a9c5fec6be0`, HEAD da worktree `.ai-worktrees/goal-142`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **21 arquivos** (18 rastreados e 3 novos não rastreados), hash do diff `3d28525fe05269a4dfe84c0d6ff6c6a36e00604a28306c93258ac10dc9fef605` (hash dos não rastreados `fff5751d0ca1ae9458173c89b1810d3956d06911ea34fd2919be1a2f158b76ec`). Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - Scheduling, código (5): `apps/scheduling-service/src/modules/customers/avenly-customer-service.ts` (47 inserções), `internal-api/routes.ts` (20 inserções e 1 remoção), `calendar/routes.ts` (6 inserções), `calendar/calendar-provider.ts` (5 inserções) e `integrations/avenly/provider.ts` (15 inserções e 4 remoções);
  - IA, código (3): `apps/ai-orchestrator/src/modules/scheduling-service/client.ts` (44 inserções), `scheduling-service/types.ts` (22 inserções) e `tools/assistant-tools.ts` (119 inserções e 33 remoções);
  - testes novos (3): `goal142-guardian-dependents.test.ts` em `apps/scheduling-service/tests/unit/` (7), em `apps/scheduling-service/tests/integration/` (6, contra PostgreSQL) e em `apps/ai-orchestrator/tests/tools/` (20);
  - testes ajustados (7), só na forma, sem asserção mudada: os falsos de `SchedulingGateway` em `tests/tools/assistant-tools.test.ts`, `tests/tools/exception-out-of-reach.test.ts`, `tests/tools/explicit-confirmation.test.ts`, `tests/integration/hold-release.test.ts` e `tests/evals/harness.ts` da IA; o pino de AST do egresso de `client.ts` em `tests/assistant/assistant.service.test.ts` (`line: 837` para `line: 881`); e o falso de Prisma `tests/unit/support/database-double.ts` do Scheduling;
  - `docs/migration/` (3, por acréscimo): D-156 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal142 em `VALIDATION_GATE.md`.
- O BFF, o frontend, `packages/` (o contrato público), `PUBLIC_API_V1.md`, `schema.prisma` e as migrations, `calendar-service.ts`, o prompt, `ActivationTestService`, `ActivationTestCleanupService`, `customer-summary-service.ts`, `tools/ia-loop/` e o documento do Goal142 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (a leitura dos dependentes e `includeDependents` no Scheduling, com os testes de unidade e de integração), WU-02 (os candidatos, a regra da pessoa provável e os horários do número na IA, com os testes da IA), WU-03 (os controles negativos (a) a (d)) e WU-15 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-04 a WU-14 e WU-16 rodaram todos com `attemptId` `a1` sobre uma só árvore, `code-v1:f081e88b635b7a5e8adae96ad04b5ec67eeb61704938610ee7ee82bb7bdd9d84`; nenhum precisou ser refeito.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-156: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, as observações não bloqueantes e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal142: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal142: o registro do aceite na abertura e a subseção "Aceite", com a conferência do Tech Lead e o resultado da WU-16.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal142), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal142) e em D-156.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos, mesma árvore): typecheck da IA (WU-04) e do Scheduling (WU-05) com saída 0; lint da IA (WU-06) e do Scheduling (WU-07) com saída 0; `goal142` da IA 20 passando (WU-08); `goal142` do Scheduling 7 passando e 6 pulados, sem banco (WU-09); unidade da IA 100 arquivos e 1292 testes passando, 16 arquivos e 112 testes pulados (WU-10; a partida é 99 e 1272, 16 e 112: +1 arquivo e +20 testes); unidade do Scheduling 43 arquivos e 594 testes passando (WU-11; a partida, 42 e 587, não foi medida antes de editar); `test:gate` 297, igual à baseline (WU-12); `validate:core` com saída 0, 15 de 17 passos e 2 pulados, sem pino de contagem a corrigir (WU-13); `validate:integration` com saída 0, 36 de 36 passos e o gate autenticado com 310 passed e 0 retentativas, que inclui `test:scheduling-integration` com o arquivo `goal142` (WU-14); `git diff --check` com saída 0 depois dos registros, 94 ms (WU-16). Sem `validate:ui`: nenhum arquivo do frontend mudou.
- **Do Developer:** a integração `goal142` do Scheduling contra um PostgreSQL descartável (`g142_sched_test`, `127.0.0.1:5555`) em 4 execuções verdes, 6 de 6 em todas (WU-01 duas vezes, WU-03 antes e depois dos controles), e a suíte de integração inteira do Scheduling uma vez (23 arquivos e 171 testes passando).
- **Controles negativos do Developer (WU-03):** (a) a leitura sem o filtro `CONFIRMED`; (b) `includeDependents` com padrão `true` na rota, no provider e no cliente da IA, um de cada vez; (c) a pessoa provável sem olhar o vínculo do contato; (d) a presença com `includeDependents: true`. Cada um reprovou os testes que o Goal nomeia ou os equivalentes, com a mensagem registrada em VALIDATION_GATE, e foi revertido com `cmp` igual ao backup.
- **Conferência do Tech Lead:**
  - **A leitura dos dependentes:** `findDependentsByPhone` reaproveita `findCandidatesByPhone`, então a normalização é a mesma, e devolve lista vazia sem candidato. Faz uma consulta em `customerRelation` com `tenantId`, `PRIMARY_GUARDIAN`, `CONFIRMED` e `relatedCustomerId in` candidatos, sem repetir o dependente e na ordem de nome e `id`. A rota estática `/internal/customers/dependents` está registrada antes de `/:id`, e o handler de `:id` não foi tocado.
  - **`includeDependents`:** enum opcional transformado em boolean, então omitido vale `false`. O provider só junta os dependentes com `customerPhone` e a flag `true`; sem a flag, o caminho é o de antes, e `calendar-service` repassa o input. No cliente da IA, o parâmetro só vai na URL quando pedido.
  - **Cancelar e remarcar no Scheduling:** as rotas não validam o telefone, então o fluxo real do responsável funciona.
  - **Os candidatos e a pessoa provável:** `customerCandidates` lê telefone e dependentes em paralelo, lista primeiro os candidatos do telefone e não repete pessoa; `scheduledBy` vem do responsável. `resolveScheduleCustomer` segue a ordem do Goal: `customerId`; o vínculo do contato com um dependente confirmado (`requiresConfirmation` e `LAST_BOOKED_FOR_DEPENDENT`); a regra de hoje sobre os candidatos do telefone. A confirmação continua resolvendo a pessoa por `customerId ?? proposedCustomerId` e mantém a guarda de confirmação no mesmo turno.
  - **Os horários do número:** `prepareCancel`, `prepareReschedule`, a releitura com hold vencido e `findCustomerAppointments` sem vínculo usam `includeDependents: true`; `presentAppointment` já trazia `customerName`. `confirmAppointmentPresence`, o teste de ativação e o resumo do cliente não mudaram. `prepareRecurringAppointments` não resolve a pessoa pelos candidatos, como D-156 declara.
  - **Reexecução:** unidade `goal142` do Scheduling 7 de 7; integração `goal142` do Scheduling 6 de 6 contra PostgreSQL descartável (`127.0.0.1:5555/g142_sched_test`); `goal142` da IA 20 de 20.
  - **A partida do Scheduling:** 42 arquivos e 587 testes, conferida pelo histórico: o último commit que tocou `apps/scheduling-service` antes deste Goal é o do Goal138 (`2eec1fc`), que registrou 42 e 587.
  - **Escopo e registros:** nada no BFF, no frontend, em `packages/` ou no `prisma`. D-156 com número livre e em PROPOSED; CURRENT_STATE e VALIDATION_GATE só por acréscimo, com contagens coerentes com os resultados das WU e os limites declarados.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-03); o Tech Lead não os refez.
2. **A IA contra o Scheduling real numa conversa de WhatsApp:** a prova da IA usa o cliente do Scheduling falso, e a do Scheduling usa o banco; o encontro dos dois não tem teste ponta a ponta.
3. **A contagem de testes de `test:scheduling-integration`** dentro do `validate:integration` não foi retida pelo IA Loop; vale a saída 0.
4. **A partida limpa da unidade do Scheduling:** não foi medida antes de editar; 42 e 587 vêm do histórico e de uma execução na árvore final que exclui o arquivo novo.
5. **A mensagem completa de dois dos três testes** que reprovaram no controle (c); o teste que o Goal nomeia tem a mensagem exata.

## Pendências não bloqueantes

1. **Espaço faltando:** `apps/scheduling-service/src/modules/internal-api/routes.ts:303` ficou `const relationActorSchema =z.enum(...)`, sem o espaço depois do `=`. Só formatação; corrigir na próxima passada que tocar o arquivo.
2. **O teste da IA de que o teste de ativação e o resumo do cliente não usam `includeDependents`** só varre o texto-fonte e não pega um padrão `true` no cliente; quem prova o padrão `false` é o teste do cliente da IA, com o do provider e o da rota no Scheduling.
3. **A prova de que `GET /internal/customers/:id` não mudou** está só na integração, não na unidade.
4. **O teste de ativação, quando passa pelo `prepare`,** agora também faz a leitura dos dependentes. Não tem efeito enquanto o número oficial não tiver dependente.
5. **Fora deste Goal, com Goal e decisão próprios:** o CL8, agora portável; a IA propor responsável (D-022 (5)); o tipo de relação (pergunta 141); lembrete para o responsável (pergunta 135); `findCustomerAppointments` com vínculo mostrar os horários das outras pessoas do número; a validação de `customerId` em `get_customer_context` e em `prepare` contra os candidatos; as observações não bloqueantes dos reviews [140](140-review.md) e [141](141-review.md); os pendentes do [review138](138-review.md); os demais quadros ainda sem alvo.
