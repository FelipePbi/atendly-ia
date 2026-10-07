# Goal 142 — A IA reconhece pelo número do responsável quem ele agenda

**Status: ACCEPTED.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal141 ACCEPTED](../reviews/141-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v166**, inserida depois do 141, sem renumerar nem remover ID. Origem: a reavaliação do CL8 ("Perfil com responsável · sem telefone próprio"), o último quadro de Clientes sem alvo junto com o CL9. O quadro diz que "as mensagens chegam pelo WhatsApp da Maria" e que, "quando ela escrever, a IA pode perguntar 'Seria para o Pedro novamente?' em vez de assumir". Esta passada conferiu que a IA não faz isso hoje. Este Goal muda **só a IA e o Scheduling**: nenhuma tela, nenhuma rota do BFF, nenhum contrato público e nenhum quadro do protótipo mudam. Por isso não há linha de quadros do protótipo neste documento; o CL8 fica para a passada seguinte.

## Baseline aceita

Baseline aceita: `c6a2f555d821cab465a8c969dcfba863f6df7e10`

Goal anterior: 141 — "Remover" um contato ignorado grava tudo ou nada

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal141 já integrado em `main` (origem `6f5ea95d761c68085c883e630c435bc4a90a748a`). Houve **uma rodada**, sem blocker. **D-155** foi aceita: "Remover" pela rota por telefone grava a limpeza do contato e a decisão `PERSONAL` só nesta conversa numa transação só. O Goal141 tocou só a IA. A última contagem aceita:

- IA: unidade **99** arquivos e **1272** testes passando, 16 arquivos e 112 testes pulados sem banco — Goal141;
- IA: integração `goal141` **4** de 4 contra PostgreSQL descartável — Goal141;
- Scheduling: a última contagem de unidade registrada em VALIDATION_GATE (o Goal141 não tocou o Scheduling);
- frontend **204** arquivos e **2964** testes — Goal140 (o Goal141 não tocou o frontend);
- `test:gate` **297** — Goal141;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal141;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal141.

O Developer roda as suítes de unidade da IA e do Scheduling na baseline **antes de editar** e registra os números de partida.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **quando o responsável confirmado escreve, a IA tem entre os candidatos do número as pessoas que ele agenda, pergunta "Seria para o <nome> novamente?" quando essa pessoa foi a última atendida pelo número, nunca assume, e consegue cancelar e remarcar o horário dela.**

**Por que agora.** Dos 12 quadros sem alvo, o CL8 é estado de uma tela que já existe (`/clientes/detalhes`, com CL5, CL6 e CL7 em `targets.json`), e a captura já serve respostas fixas por rota (`responses` do `visual:compare`, usado por CL2, CL3 e CL10), o que alcança um detalhe de cliente sem telefone e com responsável. O motivo antigo ("outra tela", v150) deixou de valer. Mas o quadro descreve um comportamento da IA que não existe, e portar a tela antes faria a nota prometer o que a IA não faz. Como nos pares 136 e 137 e 139 e 140, o comportamento vem antes da tela. O vault decide o comportamento, sem pergunta aberta:

- "Como representar pessoa que agenda para outra? — Relação estruturada entre clientes" (pergunta 137); "Cliente relacionado sem telefone? — Pode existir sem telefone, mantendo responsável relacionado" (139);
- "Próxima conversa de quem costuma agendar para outro? — Confirmar pessoa provável quando padrão forte" (144); "Perguntar 'para quem é?' — Assumir o próprio cliente salvo indicação em contrário" (66); "Duas pessoas na mesma conversa? — Deixar claro para quem é cada agendamento" (636);
- `01-Regras/04-Clientes-e-Memoria.md`: "Maria costuma agendar para Pedro. [...] Em interações futuras, pode perguntar: 'Seria para o Pedro novamente?'";
- "Lembrete para cliente sem telefone? — Não" (135).

**Lições dos Goals 133 a 141, que valem aqui.**

1. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
2. Os testes de integração rodam contra PostgreSQL descartável (`SCHEDULING_TEST_DATABASE_URL`); sem banco, eles são pulados, e o relatório diz quantos rodaram, quantas vezes e onde. `validate:integration` roda `tests/integration` do Scheduling inteiro, então o arquivo novo entra no gate sem mudar script.
3. Um pino de contagem exata desatualizado reprova `validate:core` (DIAG-001 do Goal139). Se o Goal mudar um número que um teste fixa (rotas internas, métodos do cliente do Scheduling na IA, texto de tool ou de prompt), o Developer acha o pino antes da execução final e corrige sem afrouxar a asserção.
4. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".

## O que a evidência desta passada mostra

Conferido no código da baseline `c6a2f55`.

1. **A relação existe e só vale confirmada.** `CustomerRelation` (`apps/scheduling-service/prisma/schema.prisma`) guarda um `PRIMARY_GUARDIAN` por cliente (`@@unique([tenantId, customerId, type])`), com `status` `PROPOSED` ou `CONFIRMED` e índice `[tenantId, relatedCustomerId]`. D-022 (5): a relação só vira permanente por confirmação de cliente ou profissional, e o `ai-context` só inclui responsável `CONFIRMED`. O perfil (`PrimaryGuardianPanel`) propõe, confirma e remove.
2. **A IA só enxerga o responsável do lado de quem é atendido.** `getAuthorizedCustomerContext` traz `primaryGuardian` do cliente pedido. Ninguém responde à pergunta inversa: de quem este número é responsável.
3. **Os candidatos são só os do telefone.** `listCustomerCandidates` e `resolveScheduleCustomer` (`apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`) chamam `findCustomerCandidatesByPhone`, que vai a `GET /internal/customers?phone=` (`AvenlyCustomerService.findCandidatesByPhone`, por `normalizedPhone`). Pedro sem telefone nunca aparece quando Maria escreve; a IA não tem o `customerId` dele para `prepare`.
4. **O vínculo do contato já guarda a última pessoa atendida.** Na confirmação, `linkContactToCustomer` grava `Contact.customerId` com o cliente do agendamento ("a mãe que agenda para o filho e depois para si mesma continua sendo **um** contato, apontando ora para uma pessoa, ora para outra"). É o sinal de "padrão forte" que a pergunta 144 pede, sem estado novo.
5. **Os horários "deste número" são só os do telefone.** `prepareCancel`, `prepareReschedule`, a releitura da remarcação na confirmação e `confirmAppointmentPresence` usam `findFutureAppointmentsForPhone` (`GET /internal/appointments?customerPhone=`), e `AvenlyCalendarProvider.listAppointments` troca o telefone pelos candidatos. O horário de Pedro (telefone nulo) nunca está na lista de Maria: ela não consegue cancelar nem remarcar pela IA o que agendou para ele. `findCustomerAppointments` usa o cliente vinculado quando há vínculo e o telefone quando não há.
6. **Outros consumidores dessas leituras.** `ActivationTestService` e `ActivationTestCleanupService` usam `findFutureAppointmentsForPhone` e `findCustomerCandidatesByPhone` com o número oficial do teste; `customer-summary-service.ts` usa `findFutureAppointmentsForCustomer`. A Agenda Avenly é a única fonte (`CalendarProviderFactory`).
7. **Fora do comportamento de hoje.** A IA não tem tool para propor responsável (D-022 (5) diz que ela só propõe, mas o caminho não existe); o contrato não tem tipo de relação ("mãe" no CL8; pergunta 141, "tipos básicos").

## Escolhas de desenho desta passada

1. **A leitura dos dependentes confirmados, no Scheduling.** Rota interna nova `GET /internal/customers/dependents?phone=<telefone>`: os clientes do tenant cujo `PRIMARY_GUARDIAN` `CONFIRMED` é um dos candidatos desse telefone, com a mesma normalização de `findCandidatesByPhone`. Cada item traz `id`, `name`, `phone` e `guardian: { id, name }`. Relação `PROPOSED` nunca entra; relação removida deixa de entrar na hora (leitura por pedido, sem cache). Uma consulta, pelo índice `[tenantId, relatedCustomerId]`. A rota fica registrada antes de `/internal/customers/:id` ou de forma que `dependents` nunca seja lido como `id`, e um teste prova que `GET /internal/customers/:id` continua igual.
2. **Os horários do número com os dependentes, só quando pedido.** `GET /internal/appointments` ganha `includeDependents` (padrão `false`): com `customerPhone` e `includeDependents=true`, a lista inclui os horários dos dependentes confirmados dos candidatos. Sem o parâmetro, a resposta é byte a byte a de hoje para todo chamador.
3. **Os candidatos da IA.** `listCustomerCandidates` e `resolveScheduleCustomer` passam a juntar os candidatos do telefone e os dependentes confirmados, sem repetir `customerId` (o dependente que também é candidato do telefone aparece uma vez, com o responsável). Cada candidato traz `scheduledBy: { customerId, name } | null`. A regra da pessoa provável, nesta ordem:
   1. `args.customerId` informado: como hoje.
   2. o contato vinculado (`Contact.customerId`) é um dependente confirmado do número: `proposedCustomerId` é esse dependente, com `requiresConfirmation` e o motivo `LAST_BOOKED_FOR_DEPENDENT`; a IA pergunta "Seria para o <nome> novamente?" e não assume (perguntas 144 e 636);
   3. senão, a regra de hoje sobre os candidatos do **telefone**: vários, `CUSTOMER_IDENTITY_AMBIGUOUS`; um, `proposedCustomerId` dele (pergunta 66); nenhum, criação na confirmação. Os dependentes vão em `candidates` nos três casos, para a IA trocar quando a pessoa disser que é para outro.

   `prepareRecurringAppointments` segue a mesma regra se resolver a pessoa pelos candidatos; se não resolver, fica como está, e o relatório diz qual dos dois. As descrições de `create_appointment` e `list_customer_candidates` dizem o que `scheduledBy` quer dizer e mandam perguntar, nunca assumir.
4. **Cancelar e remarcar o horário do dependente.** `prepareCancel`, `prepareReschedule` e a releitura da remarcação na confirmação usam os horários do número com `includeDependents=true`; cada horário apresentado traz o nome da pessoa atendida, para a IA dizer para quem é. `confirmAppointmentPresence` fica só com o telefone: o lembrete não vai para cliente sem telefone (pergunta 135), e a presença responde a um lembrete do próprio número. `findCustomerAppointments` com vínculo continua pelo cliente vinculado; sem vínculo, passa a usar o telefone com `includeDependents=true`.
5. **O resto não muda.** `linkContactToCustomer`, a criação de cliente na confirmação, o `ai-context`, a rota de lista `GET /internal/customers`, o teste de ativação e o resumo do cliente ficam iguais e continuam chamando as leituras sem dependentes. Sem migration, sem mudança no BFF, no contrato público (`packages/public-api-contract`), em `PUBLIC_API_V1.md` ou no frontend.
6. **Decisão.** O Developer propõe **D-156** com as escolhas 1 a 5: quem a IA reconhece pelo número do responsável, a regra da pessoa provável e o que o responsável pode fazer pelo dependente. Se o número já estiver tomado, use o próximo livre e explique. D-022 não é editada; D-156 diz que a pergunta 144 passou a ter comportamento e que o CL8 pode ser portado.

## Escopo obrigatório

### 1. Scheduling (`apps/scheduling-service/src`)

- `modules/customers/avenly-customer-service.ts`: a leitura dos dependentes confirmados (escolha 1).
- `modules/internal-api/routes.ts`: a rota da escolha 1.
- `modules/calendar/routes.ts`, `modules/calendar/calendar-provider.ts`, `modules/calendar/calendar-service.ts` e `modules/integrations/avenly/provider.ts`: `includeDependents` (escolha 2), só no que a leitura precisar.

### 2. IA (`apps/ai-orchestrator/src`)

- `modules/scheduling-service/client.ts` e `types.ts`: o método da leitura dos dependentes e a opção `includeDependents` em `findFutureAppointmentsForPhone`, com padrão `false`.
- `modules/tools/assistant-tools.ts`: as escolhas 3 e 4 e as descrições das tools.
- `modules/prompts/`: só se a prova mostrar que o texto do prompt precisa dizer o que `scheduledBy` quer dizer; o relatório diz o que mudou.

### 3. Provas

1. **Scheduling, unidade** (`apps/scheduling-service/tests/unit/goal142-*.test.ts`):
   - a rota dos dependentes devolve só a relação `CONFIRMED` de um candidato do telefone, com `guardian`; recusa a `PROPOSED`, a de outro tenant e a de outro telefone; telefone sem candidato devolve lista vazia; `GET /internal/customers/:id` continua igual;
   - `GET /internal/appointments` sem `includeDependents` igual a hoje; com `includeDependents=true` traz o horário do dependente confirmado e não traz o do dependente `PROPOSED`.
2. **Scheduling, integração** (`apps/scheduling-service/tests/integration/goal142-*.test.ts`, contra PostgreSQL descartável): a mesma leitura e a mesma lista de horários no banco, inclusive o dependente sem telefone, o dependente que também é candidato do telefone (uma vez só), a relação removida e dois tenants. Rodar ao menos duas vezes.
3. **IA, unidade** (`apps/ai-orchestrator/tests/tools/goal142-*.test.ts`, com o cliente do Scheduling falso da casa):
   - Maria com Pedro confirmado e contato vinculado a Pedro: `prepare` sem `customerId` devolve `proposedCustomerId` de Pedro, `requiresConfirmation` e `LAST_BOOKED_FOR_DEPENDENT`; nenhum agendamento é confirmado sem a resposta;
   - Maria com Pedro confirmado e contato vinculado a Maria, ou sem vínculo: `proposedCustomerId` de Maria, Pedro em `candidates` com `scheduledBy` de Maria; `prepare` com o `customerId` de Pedro agenda para Pedro e vincula o contato a Pedro;
   - dois candidatos do telefone mais um dependente: `CUSTOMER_IDENTITY_AMBIGUOUS` com os três;
   - número sem dependente: o mesmo resultado de hoje em `list_customer_candidates` e em `prepare`;
   - Maria cancela e remarca o horário de Pedro; o horário apresentado traz o nome de Pedro;
   - `confirm_appointment_presence` não acha o horário de Pedro pelo número de Maria;
   - o teste de ativação e o resumo do cliente chamam as leituras sem `includeDependents`.

   As suítes existentes de `tests/tools/` e `tests/activation-test/` continuam passando. Se um falso precisar ganhar o método novo, o relatório diz qual arquivo, o que mudou no falso e mostra que nenhuma asserção mudou.
4. **Controles negativos**, depois da última edição de código, cada um reprovando o teste indicado, com a mensagem exata registrada e revertido com `cmp` igual ao backup:
   - (a) a leitura dos dependentes sem o filtro `status: CONFIRMED` → reprova o teste da `PROPOSED` (unidade e integração do Scheduling);
   - (b) `includeDependents` com padrão `true` → reprova o teste "sem `includeDependents` igual a hoje" do Scheduling ou o teste das leituras do teste de ativação na IA; o relatório diz quais reprovaram;
   - (c) a regra da pessoa provável propondo o dependente sem olhar o vínculo do contato → reprova o teste do contato vinculado a Maria;
   - (d) `confirmAppointmentPresence` com `includeDependents=true` → reprova o teste da presença.

## Fora do escopo

- O CL8 e qualquer mudança no frontend, no BFF, no contrato público, em `PUBLIC_API_V1.md` ou no banco (migration ou backfill); qualquer entrada de `targets.json` e qualquer `visual:compare`.
- A IA propor responsável (D-022 (5)); o tipo de relação ("mãe", pergunta 141); lembrete para o responsável (pergunta 135 diz que não).
- `findCustomerAppointments` com vínculo mostrar também os horários de outras pessoas do número; a validação de `customerId` em `get_customer_context` e em `prepare` contra os candidatos.
- As observações não bloqueantes dos reviews 140 e 141; busca, filtro por origem e marcação em lote na lista do W3; o telefone da conversa marcada no contrato.
- Os pendentes do review138 e os demais quadros sem alvo (S1b, S5, S6, S8, S9, CL9, N2, N3, H6, NT3 e 4.3).

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-156** em `PROPOSED`, conforme a escolha 6.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal142.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal142, com as contagens de partida da unidade da IA e do Scheduling, as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número, quantos testes de integração rodaram contra banco, quantas vezes e onde, e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal142 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Rodar, na baseline `c6a2f55`, as suítes de unidade da IA e do Scheduling e registrar os números de partida.
2. Implementar as escolhas 1 e 2 no Scheduling com os testes do §3.1 e do §3.2.
3. Implementar as escolhas 3 e 4 na IA com os testes do §3.3.
4. Rodar os controles negativos do §3.4 e revertê-los.
5. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint da IA e do Scheduling (com o RTK ligado, lint por `rtk proxy`);
   - testes alvo `goal142` e as suítes de unidade da IA e do Scheduling;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` e de `apps/scheduling-service` já feito;
   - `validate:core` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `GET /internal/customers/dependents?phone=` devolve só os dependentes `CONFIRMED` dos candidatos do telefone, no tenant, com o responsável; `PROPOSED`, relação removida, outro tenant e outro telefone ficam de fora. Provado na unidade e na integração do Scheduling, contra banco.
2. `GET /internal/appointments` sem `includeDependents` responde como hoje; com `includeDependents=true` inclui os horários dos dependentes confirmados. Provado na unidade e na integração do Scheduling.
3. Quando o contato está vinculado a um dependente confirmado, `prepare` sem `customerId` propõe esse dependente com `requiresConfirmation` e `LAST_BOOKED_FOR_DEPENDENT`; senão, vale a regra de hoje sobre os candidatos do telefone, com os dependentes em `candidates` e `scheduledBy`. Nada é confirmado sem a resposta da pessoa. Provado na unidade da IA.
4. O responsável cancela e remarca pela IA o horário do dependente, e o horário apresentado diz para quem é; a presença continua só com o telefone. Provado na unidade da IA.
5. O teste de ativação, o resumo do cliente, a lista `GET /internal/customers`, `GET /internal/customers/:id` e o número sem dependente continuam como antes; nenhuma suíte existente teve asserção afrouxada.
6. Os quatro controles negativos reprovam, com a mensagem exata registrada, e foram revertidos.
7. Typecheck e lint da IA e do Scheduling, as suítes de unidade da IA e do Scheduling, `test:gate`, `validate:core` e `validate:integration` com o gate autenticado passam.
8. Nenhum arquivo mudou fora destes: os do §1 e do §2; `apps/scheduling-service/tests/`; `apps/ai-orchestrator/tests/`; os três registros da seção "Documentação".
9. D-156 proposta, conforme a escolha 6.

## Plano de execução

1. **WU-01 — Os dependentes confirmados no Scheduling.** As escolhas 1 e 2, com os testes `goal142` de unidade e de integração do Scheduling.
2. **WU-02 — Os candidatos e os horários do número na IA.** As escolhas 3 e 4, o cliente do Scheduling e as descrições das tools, com os testes `goal142` da IA.
3. **WU-03 — Os controles negativos.** (a) a (d), cada um revertido, e a integração do Scheduling rodada de novo depois deles.
4. **WU-04 a WU-14 — Verificação determinística:** typecheck e lint da IA e do Scheduling; testes alvo `goal142` dos dois; as suítes de unidade dos dois; `test:gate`; `validate:core`; `validate:integration`.
5. **WU-15 — Registros.** D-156, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
6. **WU-16 — `git diff --check`.**
