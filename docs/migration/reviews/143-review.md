# Review formal — Goal 143

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal143](../goals/143-a-ia-so-usa-as-pessoas-do-numero-que-escreve.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review do diff inteiro, sem blocker; nenhuma correção de registro ficou para o fechamento.

Todo `customerId` que o modelo escreve numa tool da IA passa a ser conferido contra as pessoas do número que escreve: os candidatos do telefone e os dependentes `PRIMARY_GUARDIAN` `CONFIRMED` deles, lidos a cada pedido. Fora desse conjunto, `get_customer_context` (nas duas tools), o `prepare` de `create_appointment` e `prepare_recurring_appointments` recusam com `CUSTOMER_NOT_OF_THIS_NUMBER` antes de ler a pessoa no Scheduling, de criar hold ou de gravar rascunho. A série recorrente guarda a pessoa no rascunho e é confirmada para ela; um `customerId` diferente na confirmação recebe `RECURRING_CUSTOMER_MISMATCH`. O vínculo do contato só abre os horários da pessoa vinculada quando ela ainda é do número; senão, `list_customer_appointments` mostra os horários do número. Só a IA: o Scheduling, o BFF, o contrato público, `PUBLIC_API_V1.md`, o frontend e o banco não mudaram, e nenhuma tela mudou. Decisão: [D-157](../DECISIONS.md), aceita neste fechamento. A pendência "validação de `customerId` em `get_customer_context` e em `prepare` contra os candidatos", deixada pelo [review142](142-review.md), está fechada.

## Escopo e identidade do diff

- Baseline aceita vigente: `354f1f7c4d250cf6ac7659a0d705059e2c18c18f` (Goal142). Base imediata da implementação: `c1bc38aa9268883373d21c5c5e9c722ad0b31bfe`, HEAD da worktree `.ai-worktrees/goal-143`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **8 arquivos** (7 rastreados e 1 novo não rastreado), hash do diff `39d397472afa924c159b2fe4b4e4c30613b200e4aeac1f8bdfe73cce66ee9605` (hash dos não rastreados `e7a27f39becb576e08a4940e7bb29c82d106dc2ed2aa1732221522596a71f00d`). Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - IA, código (1): `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`;
  - teste novo (1): `apps/ai-orchestrator/tests/tools/goal143-customer-of-number.test.ts` (18);
  - testes ajustados (3), só na forma, sem asserção mudada: os falsos de `tests/tools/assistant-tools.test.ts` (a pessoa vinculada passou a ser candidata), `tests/tools/suggestion-out-of-reach.test.ts` e `tests/tools/exception-out-of-reach.test.ts` (a pessoa lida passou a ser candidata; o primeiro também ganhou `findCustomerDependentsByPhone`);
  - `docs/migration/` (3, por acréscimo): D-157 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal143 em `VALIDATION_GATE.md`.
- `lib/errors.ts`, o cliente do Scheduling da IA, o prompt, `customer-summary-service.ts`, `ActivationTestService`, o Scheduling, o BFF, o frontend, `packages/` (o contrato público), `PUBLIC_API_V1.md`, o `prisma`, `tools/ia-loop/` e o documento do Goal143 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (as escolhas 1 a 5 em `assistant-tools.ts`, os testes `goal143` e os ajustes de forma nos falsos), WU-02 (os controles negativos (a) a (d)) e WU-10 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-03 a WU-09 e WU-11 rodaram todos com `attemptId` `a1` sobre uma só árvore, `code-v1:59b25f264dbc196b3cc8f9575066a445616574abc25f2a4dc318d56a518350fe`; nenhum precisou ser refeito.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-157: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, as observações não bloqueantes e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal143: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal143: o registro do aceite na abertura e a subseção "Aceite", com a conferência do Tech Lead e o resultado da WU-11.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal143), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal143) e em D-157.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos, mesma árvore): typecheck da IA com saída 0 (WU-03); lint da IA com saída 0 (WU-04); `goal143` 18 passando (WU-05); unidade da IA 101 arquivos e 1310 testes passando, 16 arquivos e 112 testes pulados (WU-06; a partida, medida na baseline antes de editar, é 100 e 1292, 16 e 112: +1 arquivo e +18 testes); `test:gate` 297, igual à baseline (WU-07); `validate:core` com saída 0, 15 de 17 passos e 2 pulados, sem pino de contagem a corrigir (WU-08); `validate:integration` com saída 0, 36 de 36 passos e o gate autenticado com 310 passed e 0 retentativas (WU-09); `git diff --check` com saída 0 depois dos registros, 81 ms (WU-11). Sem `validate:ui`: nenhum arquivo do frontend mudou. O Scheduling e o frontend não mudaram, então as contagens deles não foram refeitas.
- **Do Developer:** a partida da unidade da IA medida na baseline antes de editar, depois de `npx prisma generate` em `apps/ai-orchestrator` e em `apps/bff` (ambiente, fora do diff); `tsc` com o `tsconfig` que inclui `tests/` e `eslint` por `rtk proxy`, os dois com saída 0, depois da última edição de código.
- **Controles negativos do Developer (WU-02):** (a) `getAuthorizedCustomerContext` sem a conferência, 4 reprovados (os dois testes nos dois modos); (b) `resolveScheduleCustomer` sem conferir `args.customerId`, 2 reprovados; (c) `confirmRecurringAppointments` com `args.customerId` em vez do rascunho, 3 reprovados; (d) `findCustomerAppointments` com o vínculo sem conferir, 2 reprovados. Cada um reprovou o teste que o Goal nomeia, com comando, linha e mensagem registrados em VALIDATION_GATE, e foi revertido com `cmp` igual ao backup; a árvore final voltou à da WU-01 (`goal143` 18 de 18).
- **Conferência do Tech Lead:**
  - **`get_customer_context`:** `getAuthorizedCustomerContext` lê `customerCandidates` e recusa com `CUSTOMER_NOT_OF_THIS_NUMBER` antes de `scheduling.getAuthorizedCustomerContext`; as duas tools (`createTools` e `createReadOnlyTools`) passam por ela. `customer-summary-service` chama o Scheduling direto e não mudou, como o Goal pede.
  - **O `prepare` de `create_appointment`:** `resolveScheduleCustomer` reaproveita a única leitura de candidatos que já fazia e recusa antes de `holdProposedSlot` e de `setPendingAction`; `prepareSchedule` já retornava cedo pela união com `ok`. O caminho sem `customerId`, `LAST_BOOKED_FOR_DEPENDENT` e `CUSTOMER_IDENTITY_AMBIGUOUS` ficaram intactos.
  - **A série recorrente:** `prepareRecurringAppointments` confere antes de `previewAppointmentSeries` e o rascunho guarda `customerId ?? null`. `confirmRecurringAppointments` usa a pessoa do rascunho; a divergente recebe `RECURRING_CUSTOMER_MISMATCH` depois da conferência do rascunho e das reservas desconhecidas e antes de `confirmAppointmentSeries`, inclusive com rascunho `null` e `customerId` no turno da confirmação. O rascunho antigo, sem o campo, passa pela conferência dos candidatos.
  - **Os horários do vínculo:** `findCustomerAppointments` só lê os candidatos com contato vinculado; com a pessoa vinculada fora do número, volta ao telefone com `includeDependents: true`.
  - **Schemas e descrições:** os demais schemas que carregam `customerId` (`create_appointment`, `prepare` e `confirm` da série, o de `get_customer_context`) estão cobertos, e as descrições das tools dizem que `customerId` vem só das pessoas do número.
  - **Testes:** os 18 testes `goal143` cobrem cada item do §2.1, inclusive a leitura única de candidatos por `prepare`, o rascunho igual (`toEqual`) e o contato não vinculado à pessoa de fora. Os três falsos existentes mudaram só de forma; nenhum `expect` foi tocado.
  - **Reexecução:** no review, `goal143`, `assistant-tools`, `suggestion-out-of-reach`, `exception-out-of-reach` e `goal142-guardian-dependents` da IA, 5 arquivos e 87 de 87; no fechamento, `goal143` e `goal142-guardian-dependents`, 38 de 38.
  - **Escopo e registros:** só `assistant-tools.ts`, `apps/ai-orchestrator/tests/tools/` e os três registros por acréscimo. D-157 com número livre e em PROPOSED; o segundo código, `RECURRING_CUSTOMER_MISMATCH`, é desvio declarado e justificado na escolha 2 de D-157. CURRENT_STATE e VALIDATION_GATE com contagens coerentes com os resultados das WU e os limites declarados.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-02); o Tech Lead não os refez.
2. **As mensagens dos controles** foram registradas pela WU-10 a partir do relatório da WU-02, não da saída bruta do `vitest`; onde o relatório disse "mesma mensagem", o diff completo não foi guardado à parte.
3. **A IA contra o Scheduling real numa conversa de WhatsApp:** a prova usa o cliente do Scheduling falso; não há teste ponta a ponta.
4. **A contagem de testes por passo** de `validate:core` e de `validate:integration` não foi retida pelo IA Loop; vale a saída 0 e os passos.

## Pendências não bloqueantes

1. **A série não reconfere a pessoa na confirmação:** o rascunho que guardou `customerId` não confere de novo se a pessoa ainda é do número quando a série é confirmada. É igual à confirmação de `create_appointment`, e o Goal não pede essa reconferência.
2. **O caminho sem `customerId` com `LAST_BOOKED_FOR_DEPENDENT`** é provado pela suíte `goal142`, que não mudou, e não por um teste `goal143`.
3. **Fora deste Goal, com Goal e decisão próprios:** o CL8; a IA propor responsável (D-022 (5)); o tipo de relação (pergunta 141); lembrete para o responsável (pergunta 135); `findCustomerAppointments` com vínculo mostrar os horários das outras pessoas do número; conferência de `customerId` nas rotas internas do Scheduling; as observações não bloqueantes dos reviews [140](140-review.md), [141](141-review.md) e [142](142-review.md), inclusive o espaço em `apps/scheduling-service/src/modules/internal-api/routes.ts:303`; os pendentes do [review138](138-review.md); os demais quadros ainda sem alvo.
