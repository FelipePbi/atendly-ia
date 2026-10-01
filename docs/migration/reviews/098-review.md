# Review formal — Goal 098

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, conforme o [Goal098](../goals/098-os-testes-de-integracao-do-scheduling-nao-dependem-da-data-do-dia.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–088) foi reaberto, reavaliado ou revertido.

O Goal faz `test:scheduling-integration` passar em qualquer data, sem tocar código de produto, e devolve `validate:integration` inteiro e verde. A falha vinha de fixtures com data absoluta que o banco ou o código comparam com o relógio, registrada na observação 3 do [review088](088-review.md). Não há decisão nova: DECISIONS e FINAL_AUDIT não mudam, como o Goal manda.

## Escopo e identidade do diff

- Baseline aceita vigente: `d23f60278fb5c7e5d02a79e180fe916c4fd27929` (Goal088). Base imediata da implementação: `6cb63898017ad7f3386239411cdba294daf61131`, HEAD da worktree `.ai-worktrees/goal-098`, inalterado nas duas rodadas. Entre `d23f602` e `6cb6389` há só documentação: a virada de status do Goal088 (`0e429f5`) e o fechamento do Goal088 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **6 arquivos**, hash do diff `f2e8a5be18c9f9e2ad58599ad3809b2cef549a6aa34d6bfa0bbb8126cc05006e`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os 6 arquivos, por `git diff --numstat 6cb6389` no snapshot aceito:
  - `apps/scheduling-service/tests/integration/support/test-date.ts` (+37): helper único `localDateAhead(daysAhead)` e `upcomingLocalSlot(daysAhead, startTime)`, a partir de `Date.now()` em `America/Sao_Paulo`, offset fixo `-03:00`. Fica ao lado do `upcomingDate` que já existia.
  - `goal025-tenant-purge.test.ts` (+7/−3): `seedTenant` usa `upcomingLocalSlot(7)`.
  - `goal010-import.test.ts` (+15/−9): `contestedSlot = upcomingLocalSlot(7)` e as outras datas de agendamento em `localDateAhead(8)`, `localDateAhead(10)` e `localDateAhead(11)`.
  - `goal075-customer-appointments.integration.test.ts` (+5/−3): o agendamento de `2030-03-10` vira `upcomingLocalSlot(400, "15:30")`, com a expectativa em `farSlot.date`, ainda exata.
  - Documentos: `docs/migration/CURRENT_STATE.md` (+10) e `VALIDATION_GATE.md` (+46).
- `goal008-agenda.test.ts` não foi editado. Nenhum arquivo de `src/`, `prisma/`, `scripts/`, `vitest.config.*`, `playwright*.config.*` ou `KNOWN_*` mudou, nem passo de `validate:*`. Nenhum teste foi removido ou pulado, nenhum timeout subiu, nenhuma asserção foi afrouxada e não há `vi.setSystemTime` novo. A regra (d) do Goal não foi aplicada.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 6 blockers.** O código já estava correto e no escopo, e o WU-05 do harness rodou `validate:integration` nessa árvore com **36**/**36** e exit 0. Faltavam as provas que o Goal exige:
   1. A recontagem da baseline, com hora UTC. O Tech Lead indicou um checkout separado de `6cb6389`, sem reverter a worktree.
   2. A suíte duas vezes no mesmo banco e a investigação do goal008 (WU-02 não rodou).
   3. A hipótese do goal010 confirmada por corrida, não só por leitura.
   4. Os controles negativos do §5.
   5. A execução final do Developer, com `validate:core` e o gate autenticado.
   6. VALIDATION_GATE e CURRENT_STATE.

   O bloqueio do Developer era de ambiente: o cluster na porta `55432` respondia com erro 487. O cluster que o próprio `validate:integration` provisiona funcionava.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** O diff da rodada não mexeu em código; acrescentou só os dois documentos, escritos depois da execução final. Perfil do Developer `SONNET_HIGH` nas duas rodadas, o declarado no Goal.

## Evidência considerada

Os números estão em [VALIDATION_GATE](../VALIDATION_GATE.md) (subseção do Goal098) e em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal098).

- **Baseline recontada** num checkout separado de `6cb6389`, contra um cluster PostgreSQL 18 descartável próprio, em UTC. `validate:integration`: **26** `passed`, **1** `failed`, **9** `notRun`, exit 1. `test:scheduling-integration`: `5 failed | 138 passed (143)`, contra `4 failed | 139` da baseline do Goal. A diferença é o teste de concorrência do goal010 e, em algumas corridas, o goal008.
- **Hipótese do goal010: confirmada na causa.** `contestedStartAt` fixo em `2026-10-01T12:00Z` reprova em todas as corridas da baseline, todas depois de 12:00Z. Com o horário relativo, o teste passa no mesmo relógio. Nenhuma corrida antes de 12:00Z foi medida.
- **Hipótese do goal008: confirmada.** O `completed: 2` reaparece quando o goal025 falha no meio e deixa atendimento vencido para `runAutoCompleteSweep`, que varre todos os negócios. O Developer reproduziu com duas corridas no mesmo banco, voltando só o `seedTenant` do goal025. A correção fica na origem, e o goal008 não muda.
- **Datas absolutas que restam** em `tests/integration/`: tabela em VALIDATION_GATE, com o motivo de (c). O Tech Lead conferiu a tabela linha a linha contra o grep. Conferiu também que `ImportPreviewService` lê o relógio só para `generatedAt`, o que sustenta o `2026-10-10` do goal062.
- **Execução final**, depois da última edição de código:
  - `validate:core`: exit 0, **17** passos, **15** `passed`, **2** `skipped`, igual à baseline.
  - `validate:integration` num banco recém-criado: exit 0, **36** `passed`, **0** `notRun`. `test:scheduling-integration` **18** arquivos e **143** testes; gate autenticado `235 passed` e **0** retentativas.
  - `test:scheduling-integration` de novo no mesmo banco, sem reprovisionar: **143**/**143**. Mais quatro corridas no mesmo banco, também **143**/**143**.
- **Controles negativos.** Controle 1, `seedTenant` com o literal `2026-10-01T09:00:00.000Z`: `4 failed (4)` com `23514`. Controle 2, helper no passado: `7 failed | 11 passed (18)` nos três arquivos que usam o helper. Os dois voltam a **143**/**143**, com `sha256` idêntico. O controle 3 não se aplica, porque (d) não mudou limpeza nenhuma.
- **Gates do harness** sobre a árvore final: WU-03 `validate-core`, WU-05 `validate-integration` e WU-06 `git-diff-check` passaram.
- Os quatro arquivos de teste não têm erro de `tsc` em modo strict. Os 3 erros que a checagem só com esses arquivos reportou estão em `src/shared/auth/internal-auth.ts`: essa checagem não carrega a declaração `internalContext` do Fastify.

## Aceito sem prova completa

1. **O limite das 12:00Z do goal010 não foi medido.** Nenhuma corrida da baseline começou antes disso. A prova é que a falha some quando só o horário fixo sai.
2. **Os controles negativos não foram reexecutados pelo Tech Lead.** Foram conferidos pelo registro em VALIDATION_GATE e pelo `sha256` declarado.
3. **A execução final usou `VITEST_MAX_WORKERS=1`** por falta de memória do Windows, sem editar configuração. **13** execuções anteriores falharam por ambiente e foram reexecutadas. Com o valor `2`, o Vitest 4 sobrepõe `fileParallelism: false`, e os arquivos do Scheduling rodam em paralelo no mesmo banco.

## Observações registradas, sem mudar a decisão

1. **Janela do snapshot do goal010.** `snapshotInput.endDate` continua fixo em `2026-12-31`. Depois de cerca de 2026-12-20, `localDateAhead(8)` a `localDateAhead(11)` caem fora dessa janela declarada. Hoje não há efeito, porque `FixtureReader` ignora a janela. Se o importador passar a filtrar por ela, essa fixture vence.
2. **JSDoc de `upcomingLocalSlot`** cita o horizonte de 90 dias, e o goal075 usa 400. Não há efeito, porque o goal075 insere direto no banco, sem o motor de oferta.
3. **Offset `-03:00` fixo** no helper. Vale enquanto o Brasil não voltar ao horário de verão.
4. **O gate autenticado semeia o agendamento "na data de hoje"** do relógio da corrida. Este Goal não tocou nesse ensaio.
5. A observação 3 do [review088](088-review.md) fica resolvida por este Goal: `validate:integration` volta a rodar os **36** passos.

## O que o aceite não prova

- Que os testes unitários e os de outros serviços não tenham data que vá vencer.
- Que a suíte passe perto da meia-noite de `America/Sao_Paulo`, ou numa virada de horário de verão, se o Brasil voltar a ter.
