# Goal 070 — O chat mostra o que a agenda fez

**Status: READY.** Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal059 ACCEPTED](../reviews/059-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Planejado como **058B**. A linha nasce na [v80 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), dividida do 058, e fica READY na v82 com o ID **070**. O ID muda porque o IA Loop só aceita ID de três dígitos (`findGoalFile` em `tools/ia-loop/lib/goal-discovery.mjs` e `nextGoalId` em `planning-decision.mjs`) e 060–069 já estão ocupados. Nenhum ID existente muda. A posição na ordem é a mesma do 058B: logo depois do 059 e antes do 060.

## Baseline aceita

Baseline aceita: `c8beaeb3ccc4ce841f3cbd5efa0448abd3c48df5`

Goal anterior: 059 — O status do WhatsApp é o real

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal059 já integrado em `main` (origem `82c3ec44a9e14add33e58623c8e3fbc1603a5cb2`). **Três rodadas**, com 5, 3 e 0 blockers. **D-075** foi aceita e [FINAL_AUDIT §36](../FINAL_AUDIT.md) escrita sem reescrever §4 a §35. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O 059 não tocou `apps/ai-orchestrator/`, `packages/` nem a thread de Conversas. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Fazer a conversa mostrar, como linha central entre as bolhas, o que a IA fez de fato na agenda: a reserva de um horário, a reserva que venceu sem virar agendamento e o agendamento criado, com link para ele. Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA CV-03** (MÉDIA): o protótipo K1 mostra as linhas "Horário reservado até 13:46 · sex 15:30" e "Agendamento criado · sex 19/09, 15:30 · Ver", com link para a Agenda. O produto mostra só bolhas. Com esses eventos, o dono teria visto na hora que a confirmação do caso QA A-01 não criou nada.

A regra que sustenta o Goal é a mesma de D-073: **o fato vem do ledger, nunca do texto do modelo.** Um evento só existe se existe a `AiToolCall` que o comprova.

Posição: logo depois do 059, pelo motivo da v80. QA X-01 era ALTA e QA CV-03 é MÉDIA.

## O que a evidência desta passada mostra

- **O ledger já separa os três fatos.** Em `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`:
  - `prepareSchedule` devolve `pendingAction` (com `date`, `startTime`, `serviceIds`, `holdExpiresAt`) e `hold: { id, expiresAt }`.
  - `confirmSchedule` devolve `{ appointment: presentAppointment(...) }`, com `id`, `date`, `startTime`, `endTime` e `serviceName`.
  - Quando a reserva já venceu, `confirmSchedule` devolve a falha de domínio `APPOINTMENT_HOLD_EXPIRED` de `holdExpiredAlternatives`.
  - `run` embrulha o sucesso em `{ ok: true, data }`. `assistant.service.ts` grava `status: result.ok ? "SUCCEEDED" : "FAILED"` e o `result` inteiro em `AiToolCall`.
  - `arguments.action` diz se a chamada foi `prepare` ou `confirm`. D-073 já usa essa distinção para a métrica da Home.
- **Reserva substituída é liberada, não vence.** `setPendingAction` chama `releasePendingHolds` sobre o rascunho anterior antes de gravar o novo. Um `prepare` seguido de outro `prepare` antes de qualquer `confirm` não deixa reserva viva para vencer. Mostrá-la como "vencida" seria afirmar um fato falso.
- **Existe um único rascunho por conversa.** `Conversation.state.pendingAction` é um slot só. Um `confirm` consome o rascunho vigente, que é o do `prepare` mais recente da mesma conversa. É por essa ordem que o `confirm` se liga ao `prepare`: o `result` do `confirm` não traz o `holdId`.
- **A purga já leva o evento junto.** `apps/ai-orchestrator/src/modules/retention/content-purge-service.ts` apaga `AiRun`, e `AiToolCall` cai por cascata (`onDelete: Cascade` no schema). Evento de período purgado some com o conteúdo, sem regra nova de retenção. A tela já lê `contentExpiredThrough` para dizer que o conteúdo expirou.
- **O evento não cabe na resposta de mensagens.** `GET /v1/conversations/:id/messages` é `z.array(messageSchema)` em `packages/public-api-contract/src/routes.ts:133`. Pôr outro tipo de item nesse array quebra o consumidor e o schema.
- **A rota interna nasce fechada.** O `preHandler` de `apps/ai-orchestrator/src/modules/internal/routes.ts` nega por omissão todo caminho `/internal/` sem escopo no mapa de escopos. Um `GET` de conversa usa `conversations:read` (`routes.ts:1794`–`:1797`).
- **O gate autenticado pode medir a tela com eventos.** `scripts/goal033-authenticated-ui-rehearsal.mjs` já abre o banco descartável por `pg`. Ele também já semeia a conversa que `apps/frontend/e2e/authenticated-matrix.spec.ts` mede em `conversas` e no detalhe `/conversas/:id`.
- **O "Ver" tem destino.** `apps/frontend/src/app/(platform)/agenda/agendamento/page.tsx` lê `?id=` e mostra o agendamento.

## Fora do escopo

- Eventos de remarcação (`reschedule_appointment`), de cancelamento (`cancel_appointment`) e de série recorrente (`prepare_recurring_appointments`, `confirm_recurring_appointments`). O protótipo K1 só mostra reserva e criação. Este Goal não os implementa e declara o limite em D-076.
- Agendamento criado pelo dono na Agenda, fora da conversa. O evento é do que a IA fez nesta conversa.
- **QA CV-04** (uma pergunta de confirmação só) e **QA CV-05** (rótulo de autoria), respectivamente conduta do modelo e fidelidade visual (Goal069).
- A regra de D-073 e a métrica `aiAppointmentsToday` da Home. Nada muda nelas.
- Fidelidade visual das linhas de evento ao protótipo. Essa conferência é humana (Goal069).

## Dependências e contexto mínimo

Leia só o necessário:

- a linha CV-03 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md);
- D-073 e D-045 (fuso único do negócio) em [DECISIONS](../DECISIONS.md);
- em `assistant-tools.ts`: `prepareSchedule`, `confirmSchedule`, `holdExpiredAlternatives`, `setPendingAction`, `releasePendingHolds`, `presentAppointment` e `run`;
- em `apps/ai-orchestrator/src/modules/internal/routes.ts`: `GET /internal/conversations/:id/messages`, `requireConversation`, `messageDto` e o mapa de escopos;
- `apps/bff/src/modules/conversations/routes.ts` e `apps/bff/src/clients/ai-orchestrator/index.ts` (`listMessages`);
- `packages/public-api-contract/src/routes.ts` e `schemas.ts` (`messageSchema`);
- a seção de Conversas de `apps/bff/PUBLIC_API_V1.md`;
- em `apps/frontend/src/features/conversations/`: `ConversationThread.tsx`, `MessageTimeline.tsx` e `format.ts`;
- `apps/frontend/src/data/services/BffConversationService.ts`.

Para o protótipo, leia só as linhas de evento de `docs/design-reference/claude-design/prototype/project/Conversas-Desktop.dc.html` (linhas 112–119). Leia-as só para o texto e a posição: linha central com traço dos dois lados, ícone, e o "Ver" como link. O protótipo é referência, não runtime.

## Pontos de implementação

- `apps/ai-orchestrator/src/modules/internal/routes.ts`: rota interna nova de eventos da conversa, com escopo `conversations:read` no mapa. A derivação fica em função pura, num módulo próprio em `apps/ai-orchestrator/src/modules/` (por exemplo `conversations/conversation-events.ts`), testável sem banco.
- `packages/public-api-contract/src/schemas.ts` e `routes.ts`: schema do evento e entrada da rota pública.
- `apps/bff/src/clients/ai-orchestrator/index.ts` e `apps/bff/src/modules/conversations/routes.ts`: proxy fino, igual a `listMessages`.
- `apps/bff/PUBLIC_API_V1.md`: rota nova na tabela de Conversas e seção própria.
- `apps/frontend/src/data/services/BffConversationService.ts` (e a interface de serviço que ele implementa), `features/conversations/ConversationThread.tsx`, `MessageTimeline.tsx` e `format.ts`.
- `scripts/goal033-authenticated-ui-rehearsal.mjs`, o teste dele em `scripts/tests/` e `apps/frontend/e2e/authenticated-matrix.spec.ts`, para o gate autenticado.
- Testes novos com prefixo `goal070-` em `apps/ai-orchestrator/tests/`, `apps/bff/tests/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. A derivação dos eventos é do ledger (ai-orchestrator)

A função lê as `AiToolCall` de `create_appointment` dos `AiRun` da conversa, do mesmo tenant, em ordem de `createdAt` e depois `id`. Ela produz no máximo três tipos de evento:

- **`HOLD_PLACED`**: um por `create_appointment` com `arguments.action === "prepare"` e `status === "SUCCEEDED"`. O evento carrega:
  - o instante do evento (`occurredAt`, o `completedAt` da chamada, ou `createdAt` quando `completedAt` falta);
  - a data e a hora propostas (`date`, `startTime`), como o `result` guarda;
  - o vencimento da reserva (`holdExpiresAt`, ISO).
- **`APPOINTMENT_CREATED`**: um por `create_appointment` com `arguments.action === "confirm"`, `status === "SUCCEEDED"` e `result.data.appointment.id` presente. O evento carrega o instante, o `appointmentId`, a data e a hora do agendamento.
- **`HOLD_EXPIRED`**: um por `HOLD_PLACED` que cumpre as três condições abaixo. O instante do evento é o `holdExpiresAt`:
  - não foi consumido por um `confirm` `SUCCEEDED`;
  - não foi substituído por outro `prepare` `SUCCEEDED` antes de vencer;
  - tem `holdExpiresAt` menor ou igual ao instante da leitura.

  Um `confirm` `FAILED` com `APPOINTMENT_HOLD_EXPIRED` conta como prova de vencimento do `prepare` vigente, mesmo que o relógio ainda não tenha passado do `holdExpiresAt` gravado.

Regras:

- **A ligação é pela ordem, como o slot único de `pendingAction`:**
  - um `confirm` `SUCCEEDED` consome o `prepare` `SUCCEEDED` mais recente da conversa, anterior a ele e ainda não consumido;
  - um `prepare` `SUCCEEDED` substitui o anterior ainda não consumido;
  - um `prepare` substituído não produz `HOLD_EXPIRED`, porque a reserva dele foi liberada.
- **Nenhum evento sai de texto.** A função não lê `AiRun.outputText`, `Message.body`, `Conversation.state` nem `arguments` além de `action`. Um turno cujo modelo escreveu "Agendamento criado" sem `confirm` `SUCCEEDED` não produz evento.
- **Chamada `FAILED` ou `STARTED` não produz `HOLD_PLACED` nem `APPOINTMENT_CREATED`.**
- **`result` fora da forma esperada não produz evento, e isso é registrado.** Exemplos: `prepare` sem `hold.expiresAt`, `confirm` sem `appointment.id`. A função devolve o evento só quando cada campo exigido existe. O descarte vai para `logger.warn`, com `tenantId`, `conversationId`, `toolCallId` e o nome do campo ausente. O log nunca leva `result`, `arguments`, telefone nem nome.
- **Instantes e horários:** `date` e `startTime` são os do negócio, como o scheduling os devolve, e não são convertidos. `holdExpiresAt` e `occurredAt` são instantes ISO.
- **O relógio é injetável.** A função recebe `now`, e o teste do vencimento não depende do relógio real. Isso evita repetir a intermitência de `goal008-agenda`, que depende do relógio real (observação 4 do [review059](../reviews/059-review.md)).

### 2. A rota interna é da conversa do tenant

- A rota é `GET /internal/conversations/:id/events`, com escopo `conversations:read` no mapa de escopos. Nenhum caminho `/internal/` fica sem escopo.
- A rota resolve a conversa por `requireConversation(prisma, tenantId, id)` antes de ler o ledger. Conversa de outro tenant ou inexistente responde como `GET /internal/conversations/:id/messages` responde hoje, e nunca devolve lista vazia no lugar de "não encontrada".
- A consulta filtra `tenantId` e `aiRun: { conversationId }`, com `select` só das colunas que a derivação usa.
- A resposta segue o envelope de `internalData`: um array em ordem de `occurredAt` crescente, com desempate estável por `id`.

### 3. O contrato público ganha a rota, não um campo em mensagem

- Rota nova: `GET /v1/conversations/:id/events`, com `requireTenantContext`. É um proxy fino para a rota interna, igual a `GET /v1/conversations/:id/messages`, com as mesmas recusas.
- `packages/public-api-contract/src/schemas.ts` ganha `conversationEventSchema`, uma união discriminada por `type` (`HOLD_PLACED`, `HOLD_EXPIRED`, `APPOINTMENT_CREATED`), com `id`, `occurredAt` e só os campos de cada tipo. `routes.ts` ganha a entrada com `z.array(conversationEventSchema)`.
- `messageSchema` e a resposta de `GET /v1/conversations/:id/messages` não mudam.
- `PUBLIC_API_V1.md` ganha a rota na tabela de Conversas e uma seção que diz:
  - de onde o evento vem (o ledger da IA, nunca o texto);
  - quais tipos existem;
  - que reserva substituída não aparece como vencida;
  - que o evento some com a purga de conteúdo;
  - que remarcação, cancelamento e série recorrente não aparecem.
- Os gates de contrato já existentes (`scripts/final-production-audit.mjs` sobre a tabela de rotas e o consumo do frontend; os testes de contrato do BFF) passam **sem exceção nova**. Se um deles exigir registro da rota nova, o registro entra pelo caminho que o próprio gate declara. Não entra por `KNOWN_*`.

### 4. A conversa mostra os eventos (frontend)

- `BffConversationService` ganha `listEvents(id, signal)` e a interface de serviço ganha o método correspondente, validado pelo schema do contrato.
- A thread busca os eventos junto com as mensagens e os atualiza no mesmo ritmo, na mesma invalidação e no mesmo polling que as mensagens usam hoje. A timeline intercala evento e bolha por instante. Com instante igual, o evento vem antes da bolha, como no protótipo: a reserva antes de "Posso confirmar?" e a criação antes de "Confirmado!".
- O evento aparece como linha central, não como bolha e não como mensagem de autoria nenhuma:
  - `HOLD_PLACED`: "Horário reservado até HH:MM · <dia da semana abreviado> HH:MM", como no protótipo. A hora de vencimento sai no fuso do negócio (D-045), nunca no fuso do navegador. O dia e a hora propostos saem de `date`/`startTime`, sem conversão.
  - `APPOINTMENT_CREATED`: "Agendamento criado · <dia abreviado> DD/MM, HH:MM · Ver". "Ver" é um link para `/agenda/agendamento?id=<appointmentId>`.
  - `HOLD_EXPIRED`: "Reserva de <dia abreviado> HH:MM venceu sem confirmação", ou texto equivalente que diga que nada foi agendado. O protótipo não tem essa linha. O texto é proposta deste Goal e a conferência é humana (Goal069).
- Evento que o schema recusa não quebra a thread. A tela mostra as mensagens e omite o evento. Falha de consulta dos eventos não esconde as mensagens e não mostra erro que afirme que a conversa falhou.
- Conversa sem eventos fica igual a hoje.
- Estado vazio, carregando e erro das mensagens não mudam.

### 5. O gate autenticado mede a tela com eventos

- O ensaio `scripts/goal033-authenticated-ui-rehearsal.mjs` semeia, no banco descartável da IA e para a conversa que ele já cria, um `AiRun` com três `AiToolCall`:
  - um `prepare` `SUCCEEDED` com `hold.expiresAt` no futuro;
  - um `confirm` `SUCCEEDED` com `appointment.id`;
  - um `prepare` `SUCCEEDED` já vencido, sem `confirm`.

  A semeadura é só de teste. Ela entra pelo `pg` que o ensaio já usa e não cria rota de produto nem caminho de escrita novo em `apps/`.
- `authenticated-matrix.spec.ts` passa a exigir, no detalhe `/conversas/:id`, as três linhas de evento visíveis nas cinco larguras e o link "Ver" alcançável por clique real, sem `force`. As medidas que o gate já faz continuam valendo sobre a tela com eventos: overflow horizontal, alvo de toque de 24px ou mais, contraste computado, foco visível, `prefers-reduced-motion` e composição do 058.
- O teste do ensaio em `scripts/tests/` cobre a semeadura nova.
- A contagem do gate autenticado não encolhe: **60** testes ou mais, **0** retentativas.

### 6. Provas que reprovam na baseline

Cada teste novo do §1 ao §5 é rodado primeiro contra o código da baseline, e a saída do vermelho vai colada no relatório. Em particular:

1. **Derivação (unitário, sem banco, relógio fixo):**
   - `prepare`→`confirm` dá `HOLD_PLACED` e `APPOINTMENT_CREATED`, sem `HOLD_EXPIRED`;
   - `prepare` sem `confirm` e vencido dá `HOLD_EXPIRED`;
   - `prepare`→`prepare`→`confirm` dá dois `HOLD_PLACED`, um `APPOINTMENT_CREATED` e nenhum `HOLD_EXPIRED`;
   - `confirm` `FAILED` com `APPOINTMENT_HOLD_EXPIRED` dá `HOLD_EXPIRED` e nenhum `APPOINTMENT_CREATED`;
   - `prepare` ainda no prazo não dá `HOLD_EXPIRED`;
   - chamada `FAILED`/`STARTED` e `result` fora de forma não dão evento, e o descarte é registrado;
   - `AiRun.outputText` "Agendamento criado" sem ledger dá zero evento.
2. **Rota interna (no arnês de `apps/ai-orchestrator/tests/internal/*.routes.test.ts`, como `dashboard-ai-appointments.routes.test.ts`):**
   - conversa do tenant devolve os eventos em ordem;
   - conversa de outro tenant é recusada como em `/messages`;
   - `AiToolCall` de outra conversa do mesmo tenant não entra;
   - caminho sem escopo é recusado.
3. **BFF:** `GET /v1/conversations/:id/events` repassa a lista e as recusas, e a resposta passa no schema do contrato.
4. **Frontend (jsdom):**
   - as três linhas aparecem entre as bolhas, na ordem do §4;
   - o "Ver" aponta para `/agenda/agendamento?id=`;
   - a hora de vencimento sai no fuso do negócio, com o fuso do processo de teste diferente do fuso do negócio;
   - falha dos eventos não esconde mensagens;
   - conversa sem eventos fica igual.
5. **Gate autenticado:** na baseline, a exigência nova do §5 reprova no detalhe de conversa nas cinco larguras, porque a linha de evento não existe.

Os testes existentes de Conversas no ai-orchestrator, no BFF e no frontend continuam passando sem mudar de asserção.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo. Cole a **saída real** no relatório, como no Goal059:

1. A derivação passa a aceitar `confirm` sem exigir `status === "SUCCEEDED"`: o teste do `confirm` `FAILED` do §6.1 reprova.
2. A derivação deixa de tratar `prepare` substituído: o teste `prepare`→`prepare`→`confirm` reprova.
3. A consulta da rota interna perde o filtro `tenantId` (ou o `requireConversation`): o teste de outro tenant do §6.2 reprova.
4. A hora de vencimento passa a ser formatada no fuso do navegador: o teste de fuso do §6.4 reprova.
5. A timeline deixa de renderizar eventos: o teste jsdom do §6.4 e o gate autenticado do §6.5 reprovam.

### 8. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: o que o §3 exige.
- [DECISIONS](../DECISIONS.md) ganha **D-076** em `PROPOSED`, no formato de D-073 a D-075. Ela diz que:
  - o evento de agenda na conversa é derivado só do ledger `AiToolCall`, pela ordem do rascunho único;
  - reserva substituída não é vencida;
  - o evento segue a purga do conteúdo;
  - o evento entra por rota própria e não como mensagem.

  Limites da D-076: remarcação, cancelamento e série recorrente não aparecem; o texto de `HOLD_EXPIRED` não tem referência no protótipo. A D-076 diz o que acrescenta a D-073, sem reescrevê-la.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§37**, sem reescrever §4 a §36: **QA CV-03** corrigido, com a ressalva de que é achado da revisão local e não entra na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram a rota nova, a derivação, a semeadura do gate autenticado e as contagens da execução final. As contagens incluem `test:frontend` (arquivos e testes) e o `expected`/`unexpected`/`flaky` do gate autenticado, que o review059 (observação 2) conferiu fora dos documentos.
- `apps/frontend/AGENTS.md`, só se ele descrever a thread de Conversas ou o gate autenticado de forma que o diff torne falsa.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) não é editado.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

### 9. O que este Goal não pode fazer

- Não toca `apps/scheduling-service/`, `apps/evolution-go/`, migrations, schema Prisma, `tools/ia-loop/` nem `QA_LOCAL_REVIEW.md`.
- Não muda `assistant-tools.ts`, `assistant.service.ts`, prompts, tools nem o fluxo `prepare`/`confirm`. A forma do `result` que o ledger já grava é a entrada, não algo a mudar.
- Não muda `messageSchema`, a resposta de `/messages` nem campo público existente.
- Não cria rota interna sem escopo, não lê conversa sem tenant e não põe no log `result`, `arguments`, telefone, nome ou texto de mensagem.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core` e nenhuma medida do gate autenticado desligada.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A derivação produz os eventos do §1 e só eles, com relógio injetado. Os sete casos do §6.1 passam, e na baseline reprovam por ausência do módulo, com a saída colada. Provado por execução dos testes `goal070-` de `apps/ai-orchestrator`.
2. A rota interna devolve só eventos da conversa do tenant, recusa conversa alheia como `/messages` recusa e tem escopo declarado. Provado por execução.
3. `GET /v1/conversations/:id/events` existe no contrato, no BFF e em `PUBLIC_API_V1.md`, e `messageSchema` não muda. Os gates de contrato passam sem exceção nova. Provado por diff e por execução de `validate:core` e dos testes `goal070-` do BFF.
4. A conversa mostra reserva, reserva vencida e agendamento criado entre as bolhas, com "Ver" para `/agenda/agendamento?id=` e a hora no fuso do negócio. Falha dos eventos não esconde mensagens. Provado por execução jsdom.
5. O gate autenticado mede o detalhe de conversa com as três linhas nas cinco larguras, com clique real no "Ver", em **60** testes ou mais e **0** retentativas. Provado por execução de `validate:integration`. Largura, toque, contraste, foco e movimento são decididos por esse gate e por `validate:ui`.
6. Os cinco controles negativos do §7 reprovam com o defeito e passam sem ele. A saída está colada, e os controles rodaram depois da última edição de código. Provado por execução.
7. Typecheck e lint de `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` passam. As suítes dos três não têm teste a menos que a baseline (`test:frontend` **75** arquivos e **699** testes na baseline). `test:gate` não tem teste a menos que a baseline (**227**). `validate:core`, `validate:ui` e `validate:integration` passam. Provado por execução.
8. D-076 em `PROPOSED`, FINAL_AUDIT §37, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo e trazem as contagens da execução. Provado por diff contra a execução.
9. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que o modelo real chama `prepare`/`confirm` no momento certo, o que continua fora de prova por D-050;
- que as linhas de evento batem com o protótipo aprovado, o que é conferência humana (Goal069);
- que remarcação, cancelamento e série recorrente aparecem na conversa, porque não aparecem.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Derivação pura dos eventos e rota interna com escopo (§1, §2), com os testes `goal070-` do ai-orchestrator e o vermelho na baseline |
| WU-02 | STANDARD | WU-01 | Schema e rota no contrato público, proxy no BFF e `PUBLIC_API_V1.md` (§3), com os testes `goal070-` do BFF |
| WU-03 | STANDARD | WU-02 | Serviço, timeline e formatação no fuso do negócio no frontend (§4), com os testes jsdom |
| WU-04 | STANDARD | WU-03 | Semeadura do ledger no ensaio autenticado e medida do detalhe de conversa (§5), com o teste do ensaio |
| WU-05 | STANDARD | WU-01, WU-02, WU-03, WU-04 | Controles negativos (§7) e documentação (§8) |
| WU-06…WU-19 | DETERMINISTIC | WU-05 | typecheck e lint dos três apps, testes dirigidos (`goal070`) nos três, gate-tests, git-diff-check, validate-core, validate-ui e validate-integration |

A unidade `validate-integration` executa os testes de integração do BFF e o gate autenticado (`rehearse:goal033-authenticated-ui`) contra bancos descartáveis. Se ela falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, como o Goal059 fez com `goal008-agenda`. Os critérios 3 e 5 continuam exigindo a saída desses passos.
