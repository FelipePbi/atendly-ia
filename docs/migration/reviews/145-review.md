# Review formal — Goal 145

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, em review conforme o [Goal145](../goals/145-a-ia-mostra-ao-numero-os-horarios-de-todas-as-pessoas-dele.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review do diff inteiro, sem blocker; nenhuma correção de registro ficou para o fechamento.

`list_customer_appointments` passa a mostrar ao número os horários futuros de todas as pessoas dele, com ou sem vínculo do contato. Isso inclui o dono do telefone e os dependentes confirmados, cada horário com `customerName`. `findCustomerAppointments` faz uma só leitura ao Scheduling (`findFutureAppointmentsForPhone` com `includeDependents: true`) e não lê mais o vínculo (`linkedCustomerId`) nem os candidatos. Antes, com vínculo, a lista era só da pessoa vinculada: a Maria que agendou para o Pedro não via pela IA o próprio horário. A lista agora é o mesmo conjunto em que cancelar e remarcar já procuravam o `appointmentId`. O vínculo do contato serve só à pessoa provável (`LAST_BOOKED_FOR_DEPENDENT`), e a presença continua só com o telefone. Só a IA mudou: o Scheduling, o BFF, o contrato público, `PUBLIC_API_V1.md`, o frontend, o prompt e o banco não mudaram. Decisão: [D-159](../DECISIONS.md), aceita neste fechamento. Ela responde ao "Revisar se" de D-156 e D-157, sem editá-las.

## Escopo e identidade do diff

- Baseline aceita vigente: `530f7c74a9f66e03579b59745affc0a8208820a1` (Goal144). Base imediata da implementação: `782c11f63542aeae8997369611ff334b2a018838`, HEAD da worktree `.ai-worktrees/goal-145`, sem commit na worktree. Entre a baseline e `782c11f` só há o fechamento documental do Goal144, sem código.
- Snapshot aceito, calculado pelo IA Loop: **9 arquivos** (8 rastreados e 1 novo não rastreado), hash do diff `2c111225c23a8d173bb4817d6173eadacc50b240576d8f1862223556c7d06618`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - IA, código (2): `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts` (o corpo e o comentário de `findCustomerAppointments` e a descrição de `list_customer_appointments` nas duas tools) e `apps/ai-orchestrator/src/modules/scheduling-service/client.ts` (só o comentário de `findFutureAppointmentsForPhone`, com o mesmo número de linhas);
  - testes trocados (3), só as asserções da escolha 4 e o nome do teste: `tests/tools/assistant-tools.test.ts`, `tests/tools/goal142-guardian-dependents.test.ts` e `tests/tools/goal143-customer-of-number.test.ts`;
  - teste novo (1): `apps/ai-orchestrator/tests/tools/goal145-number-appointments.test.ts` (9);
  - `docs/migration/` (3, por acréscimo): D-159 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal145 em `VALIDATION_GATE.md`.
- `prepareCancel`, `prepareReschedule`, a releitura com hold vencido, `confirmAppointmentPresence`, `resolveScheduleCustomer`, `linkContactToCustomer`, o teste de ativação e a sua limpeza, o resumo do cliente, o prompt, `apps/scheduling-service`, `apps/bff`, `apps/frontend`, `packages/` (o contrato público), `PUBLIC_API_V1.md`, o `prisma`, `tools/ia-loop/` e o documento do Goal145 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (as escolhas 1 a 4, o comentário de `client.ts`, os testes `goal145` e as três asserções trocadas), WU-02 (os controles negativos (a) e (b)) e WU-10 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-03 a WU-09 e WU-11 rodaram todos com `attemptId` `a1` sobre uma só árvore, `code-v1:f5e204b32a473ea971b862577e8ce9bdcb6e58956535e5d116c000f8845f810d`; nenhum precisou ser refeito. Uma primeira passada do Tech Lead, só sobre o diff, deu 8 critérios `COVERED` e 2 `UNCLEAR`. O teste `goal145` novo não estava no diff por não ser rastreado, e as saídas dos gates não se conferem pelo diff. A decisão resolveu os dois com a leitura do arquivo na worktree e com os resultados das WU.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-159: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, as observações não bloqueantes e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal145: o status no título e o parágrafo "Aceite" no lugar de "Aguarda o review".
3. `VALIDATION_GATE.md`, seção do Goal145: o registro do aceite na abertura e a subseção "Aceite", com a conferência do Tech Lead e o resultado da WU-11.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal145), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal145) e em D-159.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos, mesma árvore): typecheck da IA com saída 0 (WU-03); lint da IA com saída 0 (WU-04); `goal145` 1 arquivo e 9 passando (WU-05); unidade da IA 102 arquivos e 1319 testes passando, 16 arquivos e 112 testes pulados (WU-06; a partida é 101 e 1310: +1 arquivo e +9 testes); `test:gate` 298 (WU-07), igual ao Goal144; `validate:core` com saída 0, 15 de 17 passos e 2 pulados (WU-08); `validate:integration` com saída 0, 36 de 36 passos e o gate autenticado com 310 passed e 0 retentativas (WU-09), igual ao Goal144; `git diff --check` com saída 0 depois dos registros, 83 ms (WU-11). O Scheduling e o frontend não mudaram, então as contagens de unidade deles não foram refeitas, e o `validate:ui` não rodou.
- **Do Developer:** a partida da unidade da IA, medida na WU-10 numa cópia de `HEAD` fora do repositório, depois da primeira edição: 101 arquivos e 1310 testes passando, igual à última contagem aceita. O pino de texto do egresso HTTP (`tests/assistant/assistant.service.test.ts`, linha 881 de `client.ts`) reprovou com o primeiro comentário, uma linha mais longo; o comentário foi reescrito com o mesmo número de linhas, sem afrouxar a asserção.
- **Controles negativos do Developer (WU-02):** (a) o corpo de `findCustomerAppointments` da baseline, que volta a ler o vínculo; (b) a chamada sem `includeDependents: true`. Cada um teve 5 reprovados e 4 passando, com comando, testes e mensagem registrados em VALIDATION_GATE. Os dois foram revertidos com `cmp` igual ao backup.
- **Conferência do Tech Lead:**
  - **A lista:** `findCustomerAppointments` faz uma única chamada a `findFutureAppointmentsForPhone(phone, businessContext, schedulingContext, { includeDependents: true })` e devolve o resultado por `presentAppointment`. Não lê `linkedCustomerId` nem `customerCandidates`.
  - **As duas tools:** `createTools` e `createReadOnlyTools` usam o mesmo método e a mesma descrição nova (escolha 3).
  - **O que não mudou:** `linkedCustomerId` e `isCandidateOfNumber` continuam usados em `resolveScheduleCustomer` e nas conferências de `customerId`. `prepareCancel`, `prepareReschedule`, `confirmAppointmentPresence`, o teste de ativação e o resumo do cliente não mudaram. Em `client.ts` mudou só o comentário.
  - **Testes:** `goal145-number-appointments.test.ts`, lido na worktree, cobre todos os itens do §2.1. Os casos cobertos:
    - contato vinculado ao Pedro, vinculado à Maria e sem vínculo, com zero leitura de `Contact`, de candidatos e de dependentes;
    - contato vinculado à Ana;
    - relação do Pedro removida;
    - `executeReadOnly` comparado por `toEqual` com `execute`;
    - o `appointmentId` da Maria aceito pelo `prepare` de `cancel_appointment`;
    - as regressões de `LAST_BOOKED_FOR_DEPENDENT` e da presença, que chama o telefone sem `options`.
  - **Asserções trocadas:** só as três da escolha 4, com o antes e o depois conferidos no diff. Nenhuma outra asserção foi afrouxada, e nenhum falso mudou de forma.
  - **Controles negativos:** o Tech Lead conferiu a saída bruta da WU-02 (`/tmp/wu02/a.out` e `b.out`). Cada controle tem 5 reprovados e 4 passando, e as mensagens batem palavra por palavra com VALIDATION_GATE. O `sha256` do backup é igual ao de `assistant-tools.ts` aceito (`c1b16cf5…5e4a`).
  - **Gates:** os JSON de `results/work_unit` do IA Loop batem com VALIDATION_GATE, todos com o mesmo `codeFingerprint` e saída 0.
  - **Reexecução:** no review, `npx vitest run` em `apps/ai-orchestrator/tests/tools`, 12 arquivos e 139 testes passando. No fechamento, `npx vitest run goal145 goal142 goal143` em `apps/ai-orchestrator`, 3 arquivos e 47 de 47 (9, 20 e 18).
  - **Escopo e registros:** só os arquivos listados acima (§7 do Goal). D-159 com número livre, em PROPOSED na rodada, só por acréscimo, sem editar D-005, D-156 nem D-157. As contagens (1319, 298 e 310) batem entre VALIDATION_GATE, CURRENT_STATE e os resultados das WU.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-02). O Tech Lead conferiu a saída bruta, mas não os refez.
2. **A partida da unidade da IA** foi medida pelo Developer depois da primeira edição, numa cópia de `HEAD` (`782c11f`, sem código novo sobre `530f7c7`). O Tech Lead não a refez.
3. **Uma conversa real no WhatsApp** com o contato vinculado a um dependente: a IA é provada com o cliente do Scheduling falso.
4. **A contagem de testes por passo** de `validate:core` e de `validate:integration` não foi retida pelo IA Loop; vale a saída 0 e os passos.

## Pendências não bloqueantes

1. **A lição 2 do Goal** (medir a partida antes de editar) não foi cumprida. O desvio está declarado em VALIDATION_GATE, e o número bate com a última contagem aceita.
2. **Erros de lint já existentes em `tests/`:** `tests/tools/goal142-guardian-dependents.test.ts` e `tests/tools/assistant-tools.test.ts` (linha 216) têm erros de lint desde antes deste Goal. O `npm run lint` da IA cobre só `src` e passou. Corrigir num Goal próprio se o lint passar a cobrir `tests/`.
3. **Fora deste Goal, com Goal e decisão próprios:** a presença pelo responsável (pergunta 135); a IA propor responsável (D-022 (5)); o tipo de relação (pergunta 141); a conferência de `customerId` nas rotas internas do Scheduling; a série que não reconfere a pessoa na confirmação ([review143](143-review.md)); as pendências não bloqueantes dos reviews [138](138-review.md) a [144](144-review.md); e os 11 quadros ainda sem alvo.
