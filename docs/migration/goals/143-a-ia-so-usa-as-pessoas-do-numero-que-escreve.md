# Goal 143 — A IA só usa as pessoas do número que escreve

**Status: ACCEPTED.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal142 ACCEPTED](../reviews/142-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v167**, inserida depois do 142, sem renumerar nem remover ID. Origem: a pendência "validação de `customerId` em `get_customer_context` e em `prepare` contra os candidatos", deixada fora do Goal142 pela v166, por D-156 e pelo review142. A v166 previa o CL8 para esta passada; ele passa para a seguinte (motivo na v167). Este Goal muda **só a IA**: nenhuma tela, nenhuma rota do BFF, nenhuma rota do Scheduling, nenhum contrato público e nenhum quadro do protótipo mudam. Por isso não há linha de quadros do protótipo neste documento.

## Baseline aceita

Baseline aceita: `354f1f7c4d250cf6ac7659a0d705059e2c18c18f`

Goal anterior: 142 — A IA reconhece pelo número do responsável quem ele agenda

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal142 já integrado em `main` (origem `d8bca08bf4811cb773821812fdfd19a6a1b281b6`). Houve **uma rodada**, sem blocker. **D-156** foi aceita: os dependentes `PRIMARY_GUARDIAN` `CONFIRMED` dos candidatos do telefone entram nos candidatos da IA com `scheduledBy`, o contato vinculado a um dependente faz o `prepare` propor esse dependente com `LAST_BOOKED_FOR_DEPENDENT`, e cancelar e remarcar alcançam o horário do dependente. A última contagem aceita:

- IA: unidade **100** arquivos e **1292** testes passando, 16 arquivos e 112 testes pulados sem banco — Goal142;
- IA: `goal142` **20** de 20 — Goal142;
- Scheduling: unidade **43** arquivos e **594** testes — Goal142 (este Goal não toca o Scheduling);
- frontend **204** arquivos e **2964** testes — Goal140 (este Goal não toca o frontend);
- `test:gate` **297** — Goal142;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal142;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal142.

O Developer roda a suíte de unidade da IA na baseline **antes de editar** e registra os números de partida.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **todo `customerId` que o modelo escreve numa tool é de uma das pessoas do número que está escrevendo (os candidatos do telefone e os dependentes confirmados deles); fora disso a tool recusa antes de ler a pessoa ou de criar qualquer efeito, e a série recorrente é confirmada para a pessoa que foi preparada.**

**Por que agora, e não o CL8.** O Goal142 fechou o conjunto das pessoas do número: `customerCandidates` junta o telefone e os dependentes confirmados. Antes dele, conferir contra os candidatos do telefone recusaria o dependente sem telefone; agora a conferência não tira nada de quem pode agendar. O 142 também aumentou o uso de `customerId` pelo modelo: as descrições das tools mandam reenviar `prepare` com o `customerId` de outra pessoa. O comportamento já está decidido, sem pergunta de produto aberta: D-005 ("o número não prova identidade"), a descrição de `get_customer_context` ("o que não foi autorizado não existe para esta ferramenta") e D-156 ("relação removida tira os poderes na próxima leitura"). O CL8 é fidelidade de tela e carrega a divergência do tipo de relação; fica para a passada seguinte.

**Lições dos Goals 133 a 142, que valem aqui.**

1. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta, para **todos** os testes que reprovaram (no review142 só um dos três tinha a mensagem completa).
2. A partida da unidade da IA é medida na baseline, antes da primeira edição (no Goal142 a do Scheduling veio do histórico).
3. Um pino de contagem exata desatualizado reprova `validate:core` (DIAG-001 do Goal139). Se o Goal mudar um número ou texto que um teste fixa (códigos de erro, texto de tool, linha do egresso de `client.ts`), o Developer acha o pino antes da execução final e corrige sem afrouxar a asserção.
4. Falso de teste que precisa mudar muda só na forma, e o relatório diz qual arquivo, o que mudou e mostra que nenhuma asserção mudou.
5. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".

## O que a evidência desta passada mostra

Conferido no código da baseline `354f1f7`, em `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`.

1. **`get_customer_context` lê qualquer pessoa do tenant.** As duas tools com esse nome (a de `createTools` e a do modo sugestão, `createReadOnlyTools`) chamam `getAuthorizedCustomerContext`, que repassa `args.customerId` a `scheduling.getAuthorizedCustomerContext` sem olhar o número. Uma conversa lê as observações, as tags e o responsável de outra pessoa do tenant.
2. **O `prepare` de `create_appointment` aceita qualquer pessoa.** `resolveScheduleCustomer` devolve `args.customerId` como a pessoa resolvida antes de qualquer conferência; `holdProposedSlot` cria o hold com ele; a confirmação agenda para ele (`pending.customerId ?? pending.proposedCustomerId`) e chama `linkContactToCustomer`, que vincula o contato a essa pessoa.
3. **A série recorrente aceita qualquer pessoa, duas vezes.** `prepareRecurringAppointments` repassa `args.customerId` a `previewAppointmentSeries`. O rascunho `recurring` guarda `holdIds`, `serviceIds` e `intervalDays`, mas não a pessoa, e `confirmRecurringAppointments` confirma com o `args.customerId` do turno da confirmação, que pode ser outro.
4. **O vínculo do contato abre a lista de horários.** Com o contato vinculado, `findCustomerAppointments` lê os horários da pessoa vinculada (`findFutureAppointmentsForCustomer`) sem conferir se ela ainda é do número. O vínculo criado pelo item 2, ou deixado por uma relação de responsável que foi removida, faz `list_customer_appointments` mostrar os horários de outra pessoa.
5. **O caminho legítimo para `customerId` já está dentro das pessoas do número.** O modelo só recebe `customerId` de `list_customer_candidates`, dos `candidates` e dos `details` de `prepare` (inclusive `CUSTOMER_IDENTITY_AMBIGUOUS`) e dos horários do número. Nenhuma tool busca pessoa por nome.
6. **O que já está fechado.** Cancelar, remarcar e a presença recebem `appointmentId` e conferem contra os horários do número; a confirmação de `create_appointment` usa a pessoa do rascunho. O teste de ativação passa pelas mesmas tools com o número oficial; as suítes de `tests/activation-test/` provam que ele continua igual depois da conferência. Os códigos de domínio da casa ficam em `DOMAIN_ERROR_CODES` (`apps/ai-orchestrator/src/lib/errors.ts`), e a tool pode ter código próprio exportado, como `LAST_BOOKED_FOR_DEPENDENT`.

## Escolhas de desenho desta passada

1. **As pessoas do número.** São os `candidates` de `customerCandidates(context)`: os candidatos do telefone e os dependentes confirmados deles, lidos a cada pedido, sem cache. Uma relação removida ou um telefone trocado tira a pessoa na próxima leitura. Nenhuma rota nova no Scheduling.
2. **A recusa.** Código de domínio novo, exportado de `assistant-tools.ts` (sugestão: `CUSTOMER_NOT_OF_THIS_NUMBER`; se o Developer preferir o registro de `lib/errors.ts`, o relatório diz por que e corrige o pino que contar os códigos). A resposta é `{ ok: false, code, error, details: { candidates } }`, com o texto mandando usar uma pessoa de `list_customer_candidates` ou seguir sem `customerId`. A recusa acontece **antes** de ler a pessoa no Scheduling, de criar hold, de gravar rascunho e de qualquer efeito. `customerId` ausente ou `null` continua como hoje.
3. **Onde a conferência entra.**
   1. `get_customer_context`, nas duas tools, por `getAuthorizedCustomerContext`: `customerId` fora das pessoas do número é recusado sem chamar `scheduling.getAuthorizedCustomerContext`.
   2. `create_appointment` com `action: "prepare"`: em `resolveScheduleCustomer`, `args.customerId` fora das pessoas do número é recusado antes de `holdProposedSlot` e de `setPendingAction`; o rascunho anterior, se houver, não muda. O resto da regra do 142 (a pessoa provável, `CUSTOMER_IDENTITY_AMBIGUOUS`, o candidato único) fica igual, e a leitura dos candidatos continua sendo uma só por chamada.
   3. `prepare_recurring_appointments`: `args.customerId` fora das pessoas do número é recusado antes de `previewAppointmentSeries`. O rascunho `recurring` passa a guardar `customerId` (`null` quando não informado).
   4. `confirm_recurring_appointments`: a pessoa da série é a do rascunho. Com o rascunho que tem o campo, um `args.customerId` informado e diferente do rascunho é recusado sem chamar `confirmAppointmentSeries`, e a chamada usa o `customerId` do rascunho. Com o rascunho gravado antes deste Goal (sem o campo), `args.customerId` informado passa pela conferência das pessoas do número.
   5. `findCustomerAppointments`: o vínculo do contato só vale quando a pessoa vinculada é uma das pessoas do número; senão, a lista é a do número sem vínculo (telefone com `includeDependents: true`, como no 142). Com o vínculo válido, o resultado é o de hoje.
4. **O que não muda.** O caminho sem `customerId`; a regra da pessoa provável e `LAST_BOOKED_FOR_DEPENDENT`; a confirmação de `create_appointment`; `linkContactToCustomer`; cancelar, remarcar e a presença; o teste de ativação e a sua limpeza; o resumo do cliente; o cliente do Scheduling da IA; o prompt. Sem mudança no Scheduling, no BFF, no contrato público (`packages/public-api-contract`), em `PUBLIC_API_V1.md`, no frontend ou no banco.
5. **As descrições das tools.** `get_customer_context`, `create_appointment`, `prepare_recurring_appointments` e `confirm_recurring_appointments` dizem que `customerId` vem só das pessoas do número (`list_customer_candidates`), e que a pessoa da série é a preparada. Se um teste fixar o texto, vale a lição 3.
6. **Decisão.** O Developer propõe **D-157** com as escolhas 1 a 5: quais são as pessoas do número, onde a IA confere `customerId`, a pessoa da série no rascunho e o vínculo que só vale para pessoa do número. Se o número já estiver tomado, use o próximo livre e explique. D-005, D-022 e D-156 não são editadas.

## Escopo obrigatório

### 1. IA (`apps/ai-orchestrator/src`)

- `modules/tools/assistant-tools.ts`: as escolhas 1 a 5.
- `lib/errors.ts`: só se o código novo for para `DOMAIN_ERROR_CODES` (escolha 2).

### 2. Provas

1. **IA, unidade** (`apps/ai-orchestrator/tests/tools/goal143-*.test.ts`, com o cliente do Scheduling falso da casa, que conhece uma pessoa do tenant de fora do número):
   - `get_customer_context`, nas duas tools (a de `execute` e a de `executeReadOnly`): candidato do telefone e dependente confirmado respondem como hoje; a pessoa de fora do número e o dependente cuja relação foi removida (o falso deixa de devolvê-lo) são recusados com o código novo, e `getAuthorizedCustomerContext` do falso não é chamado;
   - `create_appointment` `prepare` com o `customerId` de fora: recusa, nenhum `createHold`, o rascunho igual ao de antes, e o `confirm` seguinte não agenda para essa pessoa nem vincula o contato a ela; com o `customerId` do dependente confirmado, agenda para ele (regressão do 142); sem `customerId`, igual a hoje, inclusive `LAST_BOOKED_FOR_DEPENDENT`;
   - `prepare_recurring_appointments` com o `customerId` de fora: recusa e nenhum `previewAppointmentSeries`; com candidato, o rascunho guarda o `customerId`;
   - `confirm_recurring_appointments`: com `args.customerId` diferente do rascunho, recusa e nenhum `confirmAppointmentSeries`; sem `args.customerId`, confirma com o do rascunho; rascunho antigo, sem o campo, com o `customerId` de fora, recusa;
   - `list_customer_appointments`: contato vinculado a pessoa do número, a lista é a da pessoa vinculada (como hoje); contato vinculado a pessoa que deixou de ser do número, a lista é a do número e não traz o horário dessa pessoa;
   - a leitura dos candidatos acontece uma vez por chamada de `prepare` (sem leitura repetida pela conferência).

   As suítes existentes de `tests/tools/`, `tests/activation-test/`, `tests/assistant/`, `tests/evals/` e `tests/integration/` continuam passando. Falso que passava `customerId` fora dos candidatos (por exemplo `findCustomerCandidatesByPhone: async () => []` com `get_customer_context` de `customer-1`) passa a devolver essa pessoa como candidata, com a lição 4.
2. **Controles negativos**, depois da última edição de código, cada um reprovando o teste indicado, com a mensagem exata registrada e revertido com `cmp` igual ao backup:
   - (a) `getAuthorizedCustomerContext` sem a conferência → reprova o teste da pessoa de fora em `get_customer_context`;
   - (b) `resolveScheduleCustomer` aceitando `args.customerId` sem conferir → reprova o teste do `prepare` com a pessoa de fora;
   - (c) `confirmRecurringAppointments` usando `args.customerId` em vez do rascunho → reprova o teste da série com pessoa diferente;
   - (d) `findCustomerAppointments` usando o vínculo sem conferir → reprova o teste do vínculo com pessoa que deixou de ser do número.

## Fora do escopo

- O CL8 e qualquer mudança no frontend, no BFF, no Scheduling, no contrato público, em `PUBLIC_API_V1.md` ou no banco (migration ou backfill); qualquer entrada de `targets.json` e qualquer `visual:compare`.
- A IA propor responsável (D-022 (5)); o tipo de relação (pergunta 141); lembrete para o responsável (pergunta 135); `findCustomerAppointments` com vínculo mostrar também os horários das outras pessoas do número.
- Conferência no Scheduling (as rotas internas continuam confiando no tenant do token de serviço).
- As pendências não bloqueantes dos reviews 140, 141 e 142, inclusive o espaço em `apps/scheduling-service/src/modules/internal-api/routes.ts:303`, que fica para o próximo Goal que tocar o arquivo.
- Os pendentes do review138 e os demais quadros sem alvo.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-157** em `PROPOSED`, conforme a escolha 6.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal143.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal143, com a contagem de partida da unidade da IA, as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número e os controles negativos com a mensagem exata de cada teste que reprovou.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal143 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Rodar, na baseline `354f1f7`, a suíte de unidade da IA e registrar os números de partida.
2. Implementar as escolhas 1 a 5 com os testes do §2.1.
3. Rodar os controles negativos do §2.2 e revertê-los.
4. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint da IA (com o RTK ligado, lint por `rtk proxy`);
   - testes alvo `goal143` e a suíte de unidade da IA;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` e de `apps/scheduling-service` já feito;
   - `validate:core` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `get_customer_context`, nas duas tools, responde só para as pessoas do número; a pessoa de fora e o dependente com relação removida recebem a recusa, sem leitura no Scheduling. Provado na unidade da IA.
2. `create_appointment` `prepare` e `prepare_recurring_appointments` recusam `customerId` de fora do número sem hold, sem rascunho e sem chamada de efeito; o dependente confirmado e o caminho sem `customerId` funcionam como no 142. Provado na unidade da IA.
3. `confirm_recurring_appointments` confirma para a pessoa do rascunho e recusa `customerId` diferente, sem chamar `confirmAppointmentSeries`. Provado na unidade da IA.
4. `list_customer_appointments` só usa o vínculo do contato quando a pessoa vinculada é do número; senão, mostra os horários do número. Provado na unidade da IA.
5. A regra da pessoa provável, cancelar, remarcar, a presença, o teste de ativação e o resumo do cliente continuam como antes; nenhuma suíte existente teve asserção afrouxada.
6. Os quatro controles negativos reprovam, com a mensagem exata registrada, e foram revertidos.
7. Typecheck e lint da IA, a suíte de unidade da IA, `test:gate`, `validate:core` e `validate:integration` com o gate autenticado passam.
8. Nenhum arquivo mudou fora destes: os do §1; `apps/ai-orchestrator/tests/`; os três registros da seção "Documentação".
9. D-157 proposta, conforme a escolha 6.

## Plano de execução

1. **WU-01 — As pessoas do número nas tools da IA.** As escolhas 1 a 5 em `assistant-tools.ts`, os testes `goal143` da IA e os ajustes de forma nos falsos existentes.
2. **WU-02 — Os controles negativos.** (a) a (d), cada um revertido.
3. **WU-03 a WU-09 — Verificação determinística:** typecheck e lint da IA; testes alvo `goal143`; a suíte de unidade da IA; `test:gate`; `validate:core`; `validate:integration`.
4. **WU-10 — Registros.** D-157, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
5. **WU-11 — `git diff --check`.**
