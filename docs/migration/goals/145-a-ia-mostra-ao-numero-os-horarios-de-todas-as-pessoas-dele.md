# Goal 145 — A IA mostra ao número os horários de todas as pessoas dele

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal144 ACCEPTED](../reviews/144-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v169**, inserida depois do 144, sem renumerar nem remover ID. Origem: a pendência "`findCustomerAppointments` com vínculo mostrar os horários das outras pessoas do número", deixada fora do Goal142 e do Goal143 porque cada um tinha outro escopo ([D-156](../DECISIONS.md) e [D-157](../DECISIONS.md), "Revisar se"; reviews [142](../reviews/142-review.md), [143](../reviews/143-review.md) e [144](../reviews/144-review.md)). Este Goal muda **só a IA**: nenhuma tela, nenhuma rota do BFF, nenhuma rota do Scheduling, nenhum contrato público e nenhum quadro do protótipo mudam. Por isso não há linha de quadros do protótipo neste documento.

## Baseline aceita

Baseline aceita: `530f7c74a9f66e03579b59745affc0a8208820a1`

Goal anterior: 144 — O perfil de quem é agendado por um responsável igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal144 já integrado em `main` (origem `892eda6af3fa229f6e06d98c0e7f71cba012dea0`). Houve **uma rodada**, sem blocker. **D-158** foi aceita: o perfil de quem é agendado por um responsável mostra quem agenda, como o quadro CL8. O Goal144 mudou só o frontend e a captura; a IA está como o Goal143 a deixou. A última contagem aceita:

- IA: unidade **101** arquivos e **1310** testes passando, 16 arquivos e 112 testes pulados sem banco — Goal143;
- IA: `goal143` **18** de 18 e `goal142` **20** de 20 — Goals 143 e 142;
- Scheduling: unidade **43** arquivos e **594** testes — Goal142 (este Goal não toca o Scheduling);
- frontend **206** arquivos e **3017** testes — Goal144 (este Goal não toca o frontend);
- `test:gate` **298** — Goal144;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal144;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal144.

O Developer roda a suíte de unidade da IA na baseline **antes de editar** e registra os números de partida.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`list_customer_appointments` mostra ao número os horários futuros de todas as pessoas dele (os candidatos do telefone e os dependentes confirmados deles), cada um dizendo para quem é, com o contato vinculado ou não; é a mesma lista em que cancelar e remarcar já procuram o horário.**

**Por que agora.** O Goal144 não revelou lacuna nova de comportamento. As quatro pendências próprias do review144 são de tela ("Conversa com <responsável>", o "Agendar" de CL5 a CL7, o nome acessível de "Ver <responsável>" e o contraste da borda dos cartões); nenhuma impede o usuário de fazer algo. Entre os itens sem ID, este é o único que corrige comportamento já entregue sem pedir pergunta de produto. Ele foi adiado no 142 e no 143 só porque cada um tinha outro escopo.

**Lições dos Goals 133 a 144, que valem aqui.**

1. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta, para **todos** os testes que reprovaram.
2. A partida da unidade da IA é medida na baseline, antes da primeira edição.
3. Um pino de contagem exata ou de texto desatualizado reprova `validate:core` (DIAG-001 do Goal139). Se o Goal mudar um texto que um teste fixa (a descrição da tool, o comentário do cliente do Scheduling), o Developer acha o pino antes da execução final e corrige sem afrouxar a asserção.
4. Falso de teste que precisa mudar muda só na forma, e o relatório diz qual arquivo, o que mudou e mostra que nenhuma asserção mudou.
5. **Asserção que fixa o comportamento antigo** só muda onde a escolha 4 manda. O relatório mostra, para cada uma, o teste, a asserção de antes e a de depois.
6. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".

## O que a evidência desta passada mostra

Conferido no código da baseline `530f7c7`, em `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`.

1. **O vínculo muda a cada atendimento.** `linkContactToCustomer` grava em `Contact.customerId` a pessoa atendida a cada confirmação de `create_appointment`, inclusive o dependente. O comentário do método já descreve o caso: "a mãe que agenda para o filho e depois para si mesma continua sendo **um** contato, apontando ora para uma pessoa, ora para outra".
2. **Com vínculo, a lista é de uma pessoa só.** `findCustomerAppointments` lê o vínculo; se a pessoa vinculada ainda é do número (Goal143), chama só `findFutureAppointmentsForCustomer(linkedCustomerId)`. A Maria que agendou para o Pedro não vê pela IA o próprio horário; a que agendou para si não vê o do Pedro.
3. **Sem vínculo, a lista já é a do número.** A mesma tool chama `findFutureAppointmentsForPhone` com `includeDependents: true` (Goal142), e cada horário sai com `customerName` (`presentAppointment`).
4. **Cancelar e remarcar já aceitam o número inteiro.** `prepareCancel`, `prepareReschedule` e a releitura com hold vencido procuram o `appointmentId` em `findFutureAppointmentsForPhone` com `includeDependents: true`. O vínculo não protege pessoa nenhuma: ele só esconde do modelo o `appointmentId` de que ele precisa, porque `list_customer_appointments` é a única tool que entrega horário com `appointmentId`.
5. **A regra já está decidida.** D-005 (o número não prova identidade), D-156 (o responsável cancela e remarca o horário de quem agenda; "cada horário diz para quem é") e D-157 (só as pessoas do número). O vault não pede ocultar horário entre as pessoas do mesmo número (`docs/product-vault/01-Regras/04-Clientes-e-Memoria.md`, "Telefone compartilhado").
6. **O que o vínculo continua fazendo.** `resolveScheduleCustomer` usa `linkedCustomerId` para a pessoa provável (`LAST_BOOKED_FOR_DEPENDENT`). Isso não muda.
7. **O que fica só com o telefone.** `confirmAppointmentPresence` lê `findFutureAppointmentsForPhone` sem dependentes (o lembrete não vai para cliente sem telefone, pergunta 135). Isso não muda.
8. **Quem mais usa `findFutureAppointmentsForCustomer`.** O teste de ativação (`ActivationTestService.ts`, `ActivationTestCleanupService.ts`) e o resumo do cliente (`customer-summary-service.ts`). O método do cliente do Scheduling continua existindo.
9. **As asserções do comportamento antigo.** `tests/tools/assistant-tools.test.ts` ("queries by customerId when the contact is already linked to a person"), `tests/tools/goal142-guardian-dependents.test.ts` (a segunda metade de "list_customer_appointments sem vínculo usa o número com os dependentes; com vínculo, só a pessoa vinculada") e `tests/tools/goal143-customer-of-number.test.ts` ("contato vinculado a pessoa do número: a lista é a da pessoa vinculada, como hoje").

## Escolhas de desenho desta passada

1. **A lista.** `findCustomerAppointments` chama sempre `scheduling.findFutureAppointmentsForPhone(context.phone, context.businessContext, schedulingContext(context), { includeDependents: true })` e devolve `{ appointments }` com `presentAppointment`, como hoje sem vínculo. A tool não lê o vínculo (`linkedCustomerId`) nem os candidatos (`customerCandidates`): uma chamada ao Scheduling por execução, e nenhuma leitura de `Contact`.
2. **As duas tools.** A de `createTools` e a do modo sugestão (`createReadOnlyTools`) passam pelo mesmo método e mudam juntas.
3. **A descrição.** A descrição de `list_customer_appointments`, nas duas tools, diz que a lista é dos horários futuros das pessoas deste número (o dono do telefone e quem o responsável deste número agenda), que cada horário diz para quem é (`customerName`) e que o modelo pergunta de qual se trata quando houver mais de um. O comentário de `findCustomerAppointments` e o de `findFutureAppointmentsForPhone` em `scheduling-service/client.ts` ("So cancelar, remarcar e a lista sem vinculo pedem") passam a dizer o que vale. Se um teste fixar esses textos, vale a lição 3.
4. **As asserções antigas.** Só as três do item 9 da evidência mudam, para o comportamento novo: com o contato vinculado, `findFutureAppointmentsForPhone` com `includeDependents: true` é chamado uma vez, `findFutureAppointmentsForCustomer` não é chamado, e a lista traz os horários de todas as pessoas do número que o falso devolve. O nome do teste pode mudar para dizer isso. Nenhuma outra asserção dessas suítes muda. Os testes do Goal143 com vínculo a pessoa de fora e com relação removida continuam passando sem mudança.
5. **O que não muda.** `linkContactToCustomer`, `linkedCustomerId` e a regra da pessoa provável; `prepareCancel`, `prepareReschedule` e a releitura com hold vencido; `confirmAppointmentPresence`; o teste de ativação e a sua limpeza; o resumo do cliente; o cliente do Scheduling da IA, fora o comentário da escolha 3; o prompt. Sem mudança no Scheduling, no BFF, no contrato público (`packages/public-api-contract`), em `PUBLIC_API_V1.md`, no frontend ou no banco.
6. **Decisão.** O Developer propõe **D-159** com as escolhas 1 a 4: a lista de horários da IA é a do número com os dependentes confirmados, com ou sem vínculo; o vínculo do contato só serve à pessoa provável; a presença continua só com o telefone. Se o número já estiver tomado, use o próximo livre e explique. D-005, D-156 e D-157 não são editadas; D-159 diz que responde ao "Revisar se" das duas últimas.

## Escopo obrigatório

### 1. IA (`apps/ai-orchestrator/src`)

- `modules/tools/assistant-tools.ts`: as escolhas 1 a 3.
- `modules/scheduling-service/client.ts`: só o comentário de `findFutureAppointmentsForPhone` (escolha 3).

### 2. Provas

1. **IA, unidade** (`apps/ai-orchestrator/tests/tools/goal145-*.test.ts`, com o cliente do Scheduling falso da casa: a Maria, candidata do telefone; o Pedro, dependente `PRIMARY_GUARDIAN` `CONFIRMED` sem telefone; e a Ana, do tenant e fora do número; cada um com um horário futuro):
   - contato vinculado ao Pedro: a lista traz o horário da Maria e o do Pedro, cada um com `customerName`; `findFutureAppointmentsForPhone` é chamado uma vez com `includeDependents: true`; `findFutureAppointmentsForCustomer` não é chamado;
   - contato vinculado à Maria: a lista traz também o horário do Pedro;
   - contato sem vínculo: a mesma lista de hoje;
   - nos três casos, a tool não lê `Contact` nem os candidatos (o falso de Prisma e o do Scheduling registram as chamadas);
   - contato vinculado à Ana: a lista não traz o horário dela; relação do Pedro removida (o falso deixa de devolvê-lo como dependente): a lista não traz o horário dele;
   - a tool do modo sugestão (`executeReadOnly`) devolve a mesma lista que a de `execute`, com o contato vinculado ao Pedro;
   - de ponta a ponta no falso, com o contato vinculado ao Pedro: o `appointmentId` da Maria vindo da lista é aceito pelo `prepare` de `cancel_appointment`, sem nenhuma mudança em `prepareCancel`;
   - regressão: com o contato vinculado ao Pedro, o `prepare` de `create_appointment` sem `customerId` continua propondo o Pedro com `LAST_BOOKED_FOR_DEPENDENT`; `confirm_appointment_presence` com o horário do Pedro continua recusando pelo número da Maria.

   As suítes existentes de `tests/tools/`, `tests/activation-test/`, `tests/memory/`, `tests/assistant/`, `tests/evals/` e `tests/integration/` continuam passando; só as três asserções da escolha 4 mudam.
2. **Controles negativos**, depois da última edição de código, cada um reprovando o teste indicado, com a mensagem exata registrada e revertido com `cmp` igual ao backup:
   - (a) `findCustomerAppointments` voltando a usar o vínculo (o código da baseline) → reprova o teste do contato vinculado ao Pedro;
   - (b) `findCustomerAppointments` sem `includeDependents: true` → reprova o teste em que o horário do Pedro aparece.

## Fora do escopo

- Qualquer mudança no frontend, no BFF, no Scheduling, no contrato público, em `PUBLIC_API_V1.md` ou no banco (migration ou backfill); qualquer entrada de `targets.json` e qualquer `visual:compare`.
- O resumo do cliente e o teste de ativação, que continuam com `findFutureAppointmentsForCustomer`.
- A presença pelo responsável (pergunta 135); a IA propor responsável (D-022 (5)); o tipo de relação (pergunta 141); a conferência de `customerId` nas rotas internas do Scheduling; a série que não reconfere a pessoa na confirmação (review143).
- As pendências não bloqueantes do review144 ("Conversa com <responsável>", o "Agendar" de CL5 a CL7, o nome acessível de "Ver <responsável>", a borda dos cartões) e as dos reviews 138 a 143, inclusive o espaço em `apps/scheduling-service/src/modules/internal-api/routes.ts:303`.
- Os 11 quadros sem alvo.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-159** em `PROPOSED`, conforme a escolha 6.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal145.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal145, com a contagem de partida da unidade da IA, as três asserções trocadas (antes e depois), as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número e os controles negativos com a mensagem exata de cada teste que reprovou.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal145 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Rodar, na baseline `530f7c7`, a suíte de unidade da IA e registrar os números de partida.
2. Implementar as escolhas 1 a 4 com os testes do §2.1.
3. Rodar os controles negativos do §2.2 e revertê-los.
4. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint da IA (com o RTK ligado, lint por `rtk proxy`);
   - testes alvo `goal145` e a suíte de unidade da IA;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` e de `apps/scheduling-service` já feito;
   - `validate:core` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. Com o contato vinculado a qualquer pessoa do número, ou sem vínculo, `list_customer_appointments` devolve os horários futuros de todas as pessoas do número, com os dependentes confirmados, cada um com `customerName`, numa só leitura ao Scheduling e sem ler `Contact` nem os candidatos. Provado na unidade da IA, nas duas tools.
2. Pessoa de fora do número e dependente com relação removida não aparecem na lista. Provado na unidade da IA.
3. O `appointmentId` de uma pessoa do número vindo da lista é aceito pelo cancelamento com o contato vinculado a outra pessoa do número. Provado na unidade da IA.
4. A regra da pessoa provável, cancelar, remarcar, a presença, o teste de ativação e o resumo do cliente continuam como antes; só as três asserções da escolha 4 mudaram, e nenhuma outra asserção foi afrouxada.
5. Os dois controles negativos reprovam, com a mensagem exata registrada, e foram revertidos.
6. Typecheck e lint da IA, a suíte de unidade da IA, `test:gate`, `validate:core` e `validate:integration` com o gate autenticado passam.
7. Nenhum arquivo mudou fora destes: os do §1; `apps/ai-orchestrator/tests/`; os três registros da seção "Documentação".
8. D-159 proposta, conforme a escolha 6.

## Plano de execução

1. **WU-01 — A lista do número na IA.** As escolhas 1 a 4 em `assistant-tools.ts` e no comentário de `client.ts`, os testes `goal145` da IA e as três asserções trocadas.
2. **WU-02 — Os controles negativos.** (a) e (b), cada um revertido.
3. **WU-03 a WU-09 — Verificação determinística:** typecheck e lint da IA; testes alvo `goal145`; a suíte de unidade da IA; `test:gate`; `validate:core`; `validate:integration`.
4. **WU-10 — Registros.** D-159, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
5. **WU-11 — `git diff --check`.**
