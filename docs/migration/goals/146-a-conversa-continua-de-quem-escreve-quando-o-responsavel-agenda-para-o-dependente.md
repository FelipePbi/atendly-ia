# Goal 146 — A conversa continua de quem escreve quando o responsável agenda para o dependente

**Status: ACCEPTED.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal145 ACCEPTED](../reviews/145-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v170**, inserida depois do 145, sem renumerar nem remover ID. Origem: a conferência, nesta passada, de quem mais lê o vínculo do contato (`Contact.customerId`). D-159 disse que o vínculo "só serve à pessoa provável". Isso vale dentro das tools da IA, mas não fora delas: a lista de conversas por cliente, o cliente da conversa, a memória do prompt, a memória inferida e o resumo do cliente também leem o vínculo. Este Goal muda **só a IA** (código, uma migration aditiva no banco da IA e o ensaio de migration). Nenhuma tela, nenhuma rota do BFF, nenhuma rota do Scheduling, nenhum contrato público e nenhum quadro do protótipo mudam. Por isso não há linha de quadros do protótipo neste documento.

## Baseline aceita

Baseline aceita: `48d39d02eed84e3e379f1f6ad1fdf761669d5859`

Goal anterior: 145 — A IA mostra ao número os horários de todas as pessoas dele

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal145 já integrado em `main` (origem `cfacf258f96a38efa55d373ac06fdd9d75a8a4dd`). Houve **uma rodada**, sem blocker. **D-159** foi aceita: `list_customer_appointments` mostra os horários de todas as pessoas do número, com ou sem vínculo. A última contagem aceita:

- IA: unidade **102** arquivos e **1319** testes passando, 16 arquivos e 112 testes pulados sem banco — Goal145;
- IA: `goal145` **9** de 9, `goal143` **18** de 18 e `goal142` **20** de 20 — Goals 145, 143 e 142;
- Scheduling: unidade **43** arquivos e **594** testes — Goal142 (este Goal não toca o Scheduling);
- frontend **206** arquivos e **3017** testes — Goal144 (este Goal não toca o frontend);
- `test:gate` **298** — Goal145;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal145;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal145.

O Developer roda a suíte de unidade da IA na baseline **antes de editar** e registra os números de partida (o review145 registrou que a lição 2 não foi cumprida no Goal145).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **quando o responsável agenda para o dependente, a conversa, o cliente da conversa e a memória do prompt continuam sendo de quem escreve (o responsável); a última pessoa agendada pelo número passa a ser guardada à parte, e só ela serve à pessoa provável, à memória inferida do atendimento e à âncora do resumo.**

**Por que agora, antes da passada de tela do perfil.** A v169 mandou a passada de tela do perfil ("Conversa com <responsável>", o "Agendar" de CL5 a CL7 e o nome acessível de "Ver <responsável>") para uma passada seguinte. Esta passada conferiu de onde "Conversa com <responsável>" leria a conversa. A ação "Conversa" do perfil procura a conversa pelo vínculo do contato. Hoje, depois que a Maria agenda o Pedro pela IA, o vínculo aponta para o Pedro. Então o perfil da Maria perde a ação "Conversa", e o perfil do Pedro mostra "Conversa", que abre o WhatsApp da Maria. Nenhuma tela consegue fazer "Conversa com Maria" certo enquanto o vínculo andar para o dependente. O mesmo vínculo muda o cliente que aparece no chat da Maria e a memória que a IA lê quando ela escreve. Por isso este Goal vem antes da passada de tela, e a passada de tela continua sem ID.

**Lições dos Goals 133 a 145, que valem aqui.**

1. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta, para **todos** os testes que reprovaram.
2. A partida da unidade da IA é medida na baseline, **antes da primeira edição**. Se isso não acontecer, o relatório diz por quê.
3. Um pino de contagem exata ou de texto desatualizado reprova `validate:core` (DIAG-001 do Goal139). O Developer acha o pino antes da execução final e corrige sem afrouxar a asserção.
4. Falso de teste que precisa mudar muda só na forma. O relatório diz qual arquivo, o que mudou e mostra que nenhuma asserção mudou.
5. **Asserção que fixa o comportamento antigo** só muda onde a escolha 8 manda. O relatório mostra, para cada uma, o teste, a asserção de antes e a de depois.
6. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".
7. Migration da IA lida pela `SessionService` precisa do alinhamento do banco `_goal004` no ensaio `goal074` ([DATA_MIGRATION](../DATA_MIGRATION.md) §24, nota de fechamento do review115).

## O que a evidência desta passada mostra

Conferido no código da baseline `48d39d0`.

1. **O vínculo anda para o dependente.** `linkContactToCustomer` (`apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`) grava `Contact.customerId` e `customerLinkedAt` com `appointment.customerId` depois de cada confirmação de `create_appointment`, inclusive quando a pessoa é um dependente sem telefone (D-156, escolha 5, manteve). O comentário de `Contact.customerId` em `prisma/schema.prisma` já descreve isso: o contato "pode apontar para pessoas diferentes ao longo do tempo (mae que agenda para o filho)". `confirm_recurring_appointments` não grava vínculo.
2. **Quem lê o vínculo fora das tools.**
   1. `GET /internal/conversations?customerId=` filtra por `contact.customerId` (`modules/internal/routes.ts`). É a rota que o BFF repassa em `GET /v1/conversations?customerId=`, e o perfil do cliente usa para a ação "Conversa" (`apps/frontend/src/features/customers/CustomerProfile.tsx`, Goal075).
   2. `conversationDto` devolve `customerId: conversation.contact?.customerId` (`modules/internal/routes.ts`). É o cliente que o chat mostra no detalhe do cliente da conversa (`ConversationCustomerSheet.tsx`, quadro K5), com o resumo da IA desse cliente.
   3. `CustomerMemoryService.loadForPrompt` lê a memória de `contact.customerId` para o prompt (`modules/memory/customer-memory-service.ts`). Depois que a Maria agenda o Pedro, a IA recebe a memória do Pedro quando a Maria escreve.
   4. `CustomerMemoryService.recordTurnInference` grava a memória inferida do atendimento em `contact.customerId`. Em `create_appointment` isso acerta por coincidência, porque o vínculo acabou de andar para a pessoa agendada. Em `confirm_recurring_appointments`, que não grava vínculo, a memória da série vai para quem estava vinculado antes, que pode ser outra pessoa do número.
   5. `CustomerSummaryService.startSummaryRun` ancora o `AiRun` do resumo na conversa do contato com `customerId` igual ao cliente (`orderBy: customerLinkedAt desc`; `modules/memory/customer-summary-service.ts`). Hoje o resumo do Pedro funciona porque o contato da Maria aponta para ele. Sem esse vínculo, ele daria `CUSTOMER_NOT_LINKED`.
3. **Quem quer "a última pessoa agendada".** `resolveScheduleCustomer` lê o vínculo (`linkedCustomerId`) só quando o número tem dependente. Se o vínculo é um dependente confirmado, propõe esse dependente com `LAST_BOOKED_FOR_DEPENDENT` (D-156). É o único consumidor que quer a última pessoa agendada. A memória inferida (2.4) e a âncora do resumo (2.5) também querem essa pessoa, embora leiam o vínculo. Os outros consumidores (2.1, 2.2 e 2.3) querem quem escreve.
4. **O produto já diz de quem é a conversa.** O quadro CL8 mostra, no perfil do Pedro, a ação "Conversa com Maria". A nota do cartão (Goal144) diz "As mensagens chegam pelo WhatsApp de Maria". A conversa é de quem escreve. O vault não trata o telefone como prova de identidade (`docs/product-vault/01-Regras/04-Clientes-e-Memoria.md`, "Telefone compartilhado"). Quem escreve continua sendo uma das pessoas do telefone, e o dependente sem telefone nunca é uma delas.
5. **Os escritores de `Contact`.** `SessionService` (`upsert`, `update`, `updateMany`) e `ActivationTestRunStore` (`upsert`) escrevem o contato sem `select` em pelo menos um caminho. Por isso uma coluna nova precisa existir em todo banco que essas classes usam nos testes (lição 7).
6. **O conjunto de pessoas do número** está em `customerCandidates(context)`: os candidatos do telefone (`findCustomerCandidatesByPhone`) e os dependentes `PRIMARY_GUARDIAN` `CONFIRMED` deles (`findCustomerDependentsByPhone`), cada dependente com `guardian.id`. Os dois são lidos a cada pedido (D-157).

## Escolhas de desenho desta passada

1. **Dois campos no contato.** `Contact.customerId` (o vínculo) passa a ser **a pessoa que escreve por este número**: sempre um candidato do telefone. Dois campos novos, anuláveis, guardam **a última pessoa agendada por este número**, que pode ser um dependente:
   - `Contact.lastScheduledCustomerId` (`String?`);
   - `Contact.lastScheduledAt` (`DateTime?`).

   O comentário de `customerId` em `schema.prisma` passa a dizer isso, e os campos novos ganham comentário.
2. **A migration.** Uma migration nova da IA, `<timestamp>_goal146_contact_last_scheduled_customer`, com timestamp depois da última migration da IA. Ela é aditiva e idempotente:
   - `ADD COLUMN IF NOT EXISTS` para as duas colunas, sem default;
   - o backfill `UPDATE "Contact" SET "lastScheduledCustomerId" = "customerId", "lastScheduledAt" = "customerLinkedAt" WHERE "customerId" IS NOT NULL AND "lastScheduledCustomerId" IS NULL`.

   Com o backfill, a pessoa provável de todo contato existente fica exatamente como hoje. O vínculo existente não muda na migration: decidir se ele aponta para um dependente exige ler o Scheduling por contato, e a escolha 3 conserta o vínculo na próxima confirmação daquele número. O cabeçalho da migration segue o padrão do Goal115 (o que faz, rollback e por que reaplicar não falha).
3. **A gravação na confirmação.** `linkContactToCustomer` passa a gravar os dois campos, num só `updateMany` com o mesmo `where` de hoje (`tenantId`, `channelId`, `externalContactId`). O nome do método pode mudar.
   - `lastScheduledCustomerId` = a pessoa agendada, e `lastScheduledAt` = agora. Isso vale sempre.
   - O vínculo vem de uma leitura nova de `customerCandidates(context)`, feita depois do efeito:
     - se a pessoa agendada é candidata do telefone, `customerId` = ela e `customerLinkedAt` = agora (a pessoa nova criada na confirmação com o telefone do número entra aqui);
     - senão, se é dependente do número, `customerId` = o responsável dela (`guardian.id`, um candidato do telefone) e `customerLinkedAt` = agora;
     - senão, o vínculo não muda.
   - Se a leitura dos candidatos falhar, a confirmação **não falha**: o efeito já existe. A tool devolve o mesmo sucesso de hoje, grava só `lastScheduledCustomerId` e `lastScheduledAt`, e não muda o vínculo.
   - O método é chamado onde `linkContactToCustomer` é chamado hoje, depois de `createAppointment`. Ele é chamado também depois de `confirm_recurring_appointments` confirmar a série, com a pessoa da série (a do rascunho, D-157). Se a série não tiver `customerId` conhecido, nada é gravado.
4. **A pessoa provável.** `resolveScheduleCustomer` lê `lastScheduledCustomerId` no lugar do vínculo. A regra é a mesma: lê só quando o número tem dependente, e propõe só um dependente confirmado do número, com `requiresConfirmation: true` e `LAST_BOOKED_FOR_DEPENDENT`. Uma série confirmada para o Pedro passa a contar como "a última pessoa agendada", como um atendimento avulso. A descrição de `create_appointment` não muda ("a pessoa proposta foi a ultima atendida por este numero" continua verdadeira).
5. **A memória.** `recordTurnInference` grava a memória inferida em `contact.lastScheduledCustomerId`, a pessoa que o turno acabou de confirmar (a escolha 3 grava o campo no mesmo turno, antes da inferência). As outras portas de entrada não mudam: contato ignorado, sessão pessoal, atendimento humano e atendimento não confirmado. Sem `lastScheduledCustomerId`, o motivo continua `customer_not_linked`. `loadForPrompt` continua lendo `contact.customerId`, que agora é quem escreve: depois que a Maria agenda o Pedro, o prompt traz a memória da Maria, não a do Pedro.
6. **O resumo.** `startSummaryRun` procura primeiro o contato com `customerId` igual ao cliente (`customerLinkedAt desc`, como hoje). Se não houver, procura o contato com `lastScheduledCustomerId` igual ao cliente (`lastScheduledAt desc`). `CUSTOMER_NOT_LINKED` só vale quando nenhum dos dois existe. Assim o resumo do Pedro continua ancorado na conversa da Maria.
7. **O que não muda no código.** `GET /internal/conversations` (o filtro `customerId`), `conversationDto`, o BFF, o contrato público, `PUBLIC_API_V1.md` e o frontend não mudam. Eles passam a mostrar quem escreve porque o vínculo passa a ser quem escreve. Consequência declarada: com dado novo, o perfil do Pedro (dependente sem telefone) deixa de mostrar a ação "Conversa", que abria o WhatsApp da Maria. A passada de tela do perfil, ainda sem ID, oferece "Conversa com <responsável>" lendo a conversa pelo `customerId` do responsável. Também não mudam:
   - `findCustomerAppointments` (D-159), `prepareCancel`, `prepareReschedule` e `confirmAppointmentPresence`;
   - as conferências de `customerId` de D-157 (`isCandidateOfNumber`);
   - o prompt, fora da descrição de tool já citada, que não muda;
   - `SessionService` e o teste de ativação, fora o que a coluna nova exigir na forma dos falsos.
8. **As asserções antigas.** Só mudam as asserções que fixam:
   - a gravação de `Contact.customerId` com a pessoa agendada quando ela é dependente;
   - a pessoa provável lida do vínculo, cujo falso passa a pôr o Pedro em `lastScheduledCustomerId`;
   - a memória inferida gravada em `contact.customerId`;
   - a âncora do resumo só pelo vínculo.

   Os falsos de Prisma que montam `Contact` ganham os campos novos só na forma (lição 4). O relatório lista cada asserção com antes e depois (lição 5). Todo o resto das suítes `goal142`, `goal143` e `goal145`, de `assistant-tools.test.ts` e de `tests/memory/` passa sem mudança de asserção.
9. **O ensaio de migration.** Se `validate:integration` precisar, o Developer acrescenta em `scripts/goal074-human-takeover-migration-rehearsal.mjs` o alinhamento do banco `_goal004` com as colunas novas (`alignAiDurabilityTargetWithGoal146`, no padrão de `alignAiDurabilityTargetWithGoal115`), com a linha de log equivalente. Ele confere também se outro ensaio aplica só parte do histórico da IA e escreve `Contact`. O relatório diz o que foi preciso e por quê.
10. **Decisão.** O Developer propõe **D-160** com as escolhas 1 a 7: o vínculo do contato é quem escreve; a última pessoa agendada fica à parte e serve à pessoa provável, à memória inferida e à âncora do resumo; o vínculo velho que aponta para um dependente é consertado na próxima confirmação; o perfil do dependente perde a ação "Conversa" até a passada de tela. Se o número já estiver tomado, use o próximo livre e explique. D-156 e D-159 não são editadas. D-160 diz que corrige o "o vínculo só serve à pessoa provável" de D-159 fora das tools e a escolha 5 de D-156 sobre `linkContactToCustomer`.

## Escopo obrigatório

### 1. IA (`apps/ai-orchestrator/`)

- `prisma/schema.prisma` e a migration nova em `prisma/migrations/` (escolhas 1 e 2).
- `src/modules/tools/assistant-tools.ts`: as escolhas 3 e 4.
- `src/modules/memory/customer-memory-service.ts`: a escolha 5.
- `src/modules/memory/customer-summary-service.ts`: a escolha 6.

### 2. Ensaio

- `scripts/goal074-human-takeover-migration-rehearsal.mjs`, só se a escolha 9 exigir.

### 3. Provas

1. **IA, unidade** (`apps/ai-orchestrator/tests/tools/goal146-*.test.ts` e `apps/ai-orchestrator/tests/memory/goal146-*.test.ts`). Usam o cliente do Scheduling falso e o falso de Prisma da casa, com quatro pessoas:
   - a Maria, candidata do telefone;
   - o João, outro candidato do mesmo telefone;
   - o Pedro, dependente `PRIMARY_GUARDIAN` `CONFIRMED` da Maria, sem telefone;
   - a Ana, do tenant e fora do número.

   Os casos:
   - confirmar `create_appointment` para o Pedro: `customerId` = Maria, `lastScheduledCustomerId` = Pedro, num só `updateMany`;
   - confirmar para a Maria: `customerId` e `lastScheduledCustomerId` = Maria;
   - confirmar para o João: `customerId` = João;
   - confirmar sem `customerId`, com a pessoa criada na confirmação e devolvida como candidata do telefone na leitura seguinte: `customerId` = a pessoa nova;
   - contato já vinculado ao Pedro (o dado velho) e nova confirmação para o Pedro: `customerId` volta a ser a Maria;
   - a leitura dos candidatos falha depois de `createAppointment`: a tool devolve o mesmo sucesso, com o agendamento; `lastScheduledCustomerId` = Pedro; o vínculo não muda;
   - confirmar a série para o Pedro: `lastScheduledCustomerId` = Pedro e `customerId` = Maria;
   - `prepare` de `create_appointment` sem `customerId`, com `customerId` = Maria e `lastScheduledCustomerId` = Pedro: propõe o Pedro com `LAST_BOOKED_FOR_DEPENDENT`;
   - com `lastScheduledCustomerId` = Maria e `customerId` = Pedro (o dado velho): não propõe o Pedro;
   - memória: `recordTurnInference` depois da confirmação para o Pedro grava no Pedro, e depois da série do Pedro também; `loadForPrompt` com `customerId` = Maria e `lastScheduledCustomerId` = Pedro lê a memória da Maria;
   - resumo: o Pedro, sem contato com `customerId` = Pedro e com `lastScheduledCustomerId` = Pedro, ancora o `AiRun` na conversa da Maria; a Maria ancora no contato vinculado a ela; a Ana, sem nenhum dos dois, dá `CUSTOMER_NOT_LINKED`.

   As suítes existentes de `tests/tools/`, `tests/activation-test/`, `tests/memory/`, `tests/assistant/`, `tests/evals/`, `tests/session/` e `tests/integration/` continuam passando. Só as asserções da escolha 8 mudam.
2. **IA, integração com banco** (`apps/ai-orchestrator/tests/integration/goal146-*.test.ts`, pulada sem banco como as outras):
   - as duas colunas existem e são anuláveis, sem default;
   - o `UPDATE` do backfill, reaplicado num contato com `customerId` e sem `lastScheduledCustomerId`, copia os dois valores; reaplicado de novo, não muda nada;
   - num contato com `customerId` = Maria, `GET /internal/conversations?customerId=<Maria>` devolve a conversa dela, ou a mesma consulta pelo serviço que a rota usa, se a rota não tiver teste com banco.
3. **Controles negativos**, depois da última edição de código. Cada um reprova o teste indicado, com a mensagem exata registrada, e é revertido com `cmp` igual ao backup:
   - (a) a gravação na confirmação volta a pôr `customerId` = a pessoa agendada → reprova o teste da confirmação para o Pedro;
   - (b) `resolveScheduleCustomer` volta a ler o vínculo → reprova o teste da pessoa provável com `customerId` = Maria e `lastScheduledCustomerId` = Pedro;
   - (c) `recordTurnInference` volta a usar `contact.customerId` → reprova o teste da memória do Pedro;
   - (d) `startSummaryRun` sem a procura por `lastScheduledCustomerId` → reprova o teste do resumo do Pedro.

## Fora do escopo

- Qualquer mudança no frontend, no BFF, no Scheduling, no contrato público ou em `PUBLIC_API_V1.md`; qualquer entrada de `targets.json` e qualquer `visual:compare`.
- O conserto retroativo do vínculo velho que aponta para um dependente, sem nova confirmação (exige ler o Scheduling por contato).
- A passada de tela do perfil: "Conversa com <responsável>", o "Agendar" de CL5 a CL7, o nome acessível de "Ver <responsável>" e a borda dos cartões (review144).
- A presença pelo responsável (pergunta 135); a IA propor responsável (D-022 (5)); o tipo de relação (pergunta 141); a conferência de `customerId` nas rotas internas do Scheduling; a série que não reconfere a pessoa na confirmação (review143); os erros de lint já existentes em `tests/` (review145); as pendências não bloqueantes dos reviews 138 a 145, inclusive o espaço em `apps/scheduling-service/src/modules/internal-api/routes.ts:303`.
- Os 11 quadros sem alvo.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-160** em `PROPOSED`, conforme a escolha 10.
- `docs/migration/DATA_MIGRATION.md`: a seção nova da migration do Goal146 (tabela, aditiva com backfill, o que cada coluna guarda, rollback, ensaio), no padrão da §24.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal146.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal146. Ela traz a contagem de partida da unidade da IA, as asserções trocadas (antes e depois) e os controles negativos com a mensagem exata de cada teste que reprovou. Traz também as contagens da execução final de **todos** os gates que rodaram, com a rodada de cada número, inclusive `validate:core` e `validate:integration` com o gate autenticado e as retentativas.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal146 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Rodar, na baseline `48d39d0`, a suíte de unidade da IA e registrar os números de partida.
2. Fazer a migration e o schema, rodar `prisma generate` da IA e escrever a integração do §3.2.
3. Implementar as escolhas 3 a 6 com os testes do §3.1, e trocar só as asserções da escolha 8.
4. Rodar os controles negativos do §3.3 e revertê-los.
5. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint da IA (com o RTK ligado, lint por `rtk proxy`);
   - testes alvo `goal146` e a suíte de unidade da IA;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` e de `apps/scheduling-service` já feito;
   - `validate:core`;
   - `validate:integration`, com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados; a migration nova aplica no ensaio `rehearse:goal028-release-migrations`;
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. Confirmar um atendimento ou uma série para um dependente deixa o vínculo do contato no responsável dele e grava o dependente como última pessoa agendada. Confirmar para um candidato do telefone vincula o candidato. O vínculo velho que aponta para um dependente volta ao responsável na próxima confirmação. Provado na unidade da IA.
2. Falha na leitura dos candidatos depois do efeito não transforma a confirmação em erro. Provado na unidade da IA.
3. A pessoa provável (`LAST_BOOKED_FOR_DEPENDENT`) sai da última pessoa agendada, com a mesma regra de D-156. Provado na unidade da IA.
4. A memória inferida vai para a pessoa confirmada no turno, inclusive na série. A memória do prompt é de quem escreve. Provado na unidade da IA.
5. O resumo do dependente continua ancorado na conversa do responsável, e `CUSTOMER_NOT_LINKED` só vale sem nenhum dos dois campos. Provado na unidade da IA.
6. A migration é aditiva e idempotente, o backfill preserva a pessoa provável dos contatos existentes, e a migration aplica com o histórico inteiro em `validate:integration`. Provado na integração da IA e em `validate:integration`.
7. As tools fora da escolha 3 e 4, a lista de horários de D-159, cancelar, remarcar, a presença, as conferências de D-157, o teste de ativação e a `SessionService` continuam como antes. Só as asserções da escolha 8 mudaram, e nenhuma outra asserção foi afrouxada.
8. Os quatro controles negativos reprovam, com a mensagem exata registrada, e foram revertidos.
9. Typecheck e lint da IA, a suíte de unidade da IA, `test:gate`, `validate:core` e `validate:integration` com o gate autenticado passam.
10. Nenhum arquivo mudou fora destes: os do §1; o do §2, se preciso; `apps/ai-orchestrator/tests/`; os quatro registros da seção "Documentação".
11. D-160 proposta, conforme a escolha 10.

## Plano de execução

1. **WU-01 — A migration e o schema.** As escolhas 1, 2 e 9, `prisma generate` e a integração do §3.2.
2. **WU-02 — A gravação na confirmação e a pessoa provável.** As escolhas 3 e 4 em `assistant-tools.ts`, os testes `goal146` de `tests/tools/` e as asserções da escolha 8 nessas suítes.
3. **WU-03 — A memória e o resumo.** As escolhas 5 e 6, os testes `goal146` de `tests/memory/` e as asserções da escolha 8 nessas suítes.
4. **WU-04 — Os controles negativos.** (a) a (d), cada um revertido.
5. **WU-05 a WU-11 — Verificação determinística:** typecheck e lint da IA; testes alvo `goal146`; a suíte de unidade da IA; `test:gate`; `validate:core`; `validate:integration`.
6. **WU-12 — Registros.** D-160, DATA_MIGRATION, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
7. **WU-13 — `git diff --check`.**
