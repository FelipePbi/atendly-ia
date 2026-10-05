# Goal 120 — As recusas do Scheduling chegam às telas como o BFF as entrega

**Status: READY.** Preparado em 2026-10-05 pelo Tech Lead Agent após [Goal119 ACCEPTED](../reviews/119-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v144**, inserida depois do 119, sem renumerar nem remover ID. Origem: a observação 2 do [review119](../reviews/119-review.md) e a conferência deste planejamento na baseline aceita. Este Goal não tem quadro do protótipo: nenhuma tela muda de layout. Ele corrige como o frontend reconhece uma recusa que já tem tela própria.

## Baseline aceita

Baseline aceita: `2dec10a6515b930232ddadfd3d0d422b3b679717`

Goal anterior: 119 — O conflito de horário no novo agendamento igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal119 já integrado em `main` (origem `366fae3ae4635e648ffb198f0ce0f46fb32b41b8`). Foram **três rodadas**, com 9, 1 e 1 blockers; o da rodada 3 era só de registro e foi aplicado no fechamento. **D-133** foi aceita: o conflito de horário do novo agendamento dentro do formulário, como no quadro A7. A última contagem aceita: frontend **162** arquivos e **2092** testes, `test:gate` **267**, `visual-responses.test.mjs` **34**, `validate:core` 15 passos e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, `validate:integration` **36** de 36 passos, com 274 testes do gate autenticado de primeira e 1 instável (G-7 em mobile-360, fora do que o Goal119 mudou). Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **toda tela que trata uma recusa nomeada do Scheduling reconhece essa recusa no formato que o BFF entrega**, e a decisão humana ou a recuperação que a tela já tem passa a aparecer contra o BFF real.

**Por que agora.** A fila não tem Goal PLANNED. As lacunas visuais sem ID continuam (42 dos 113 quadros sem alvo em `targets.json`), mas este defeito vem antes: ele atinge telas já aceitas, em fluxos de decisão humana com motivo e de recuperação, e a correção é pequena, só no frontend e sem contrato novo.

## O que a evidência desta passada mostra

Conferido no código da baseline `2dec10a`.

1. **O envelope do BFF.** `apps/bff/src/clients/internal-http-client.ts` embrulha toda resposta não-OK de serviço interno em `AppError("UPSTREAM_ERROR", …)`. O código original vai em `details.upstreamCode`, o detalhe original em `details.upstreamDetails`, e junto vão `details.upstream` e `details.upstreamRequestId`. O status segue o do serviço, salvo `>= 500`, que vira 502. É o contrato do Goal008, comum a todas as rotas. `apps/bff/tests/goal009-calendar-routes.integration.test.ts` afirma o envelope de `SLOT_UNAVAILABLE`, e `goal010-import-routes.integration.test.ts`, o de `IMPORT_ALREADY_COMPLETED`. O corpo que chega ao navegador é `{ "error": { "code": "UPSTREAM_ERROR", "message": …, "details": { "upstream": …, "upstreamCode": …, "upstreamRequestId": …, "upstreamDetails": … } }, "requestId": … }`, e `BffHttpClient` o transforma em `BffHttpError` com `code: "UPSTREAM_ERROR"`.
2. **Parte do frontend já lê assim:** `features/imports/labels.ts` (`upstreamErrorCode`), `features/conversations/format.ts` (`upstreamErrorCode`), o helper `upstreamCode` de `ConnectSourceScreen.tsx` (para `MINHA_AGENDA_*`), `KnowledgeDocumentForm.tsx`, `OtherInfoSection.tsx`, e `isSlotRefusal` de `AppointmentForm.tsx`, do Goal119. `SeriesConfirm.tsx` (`failureDetails`) já lê o detalhe nos dois níveis.
3. **Outra parte compara `error.code` com o código cru, que nunca chega do BFF real:**
   - `features/agenda/holdSession.ts`: `isSlotConflictError` (`SLOT_UNAVAILABLE`), `isHoldLostError` (`APPOINTMENT_HOLD_EXPIRED`) e `holdLostMessage`, que lê `details.slotStillAvailable` no nível de cima, e não em `upstreamDetails`;
   - `features/agenda/RescheduleFlow.tsx` usa `isSlotConflictError` no hold (`chooseTime`) e na remarcação (`reschedule`), e `isHoldLostError` na remarcação. Por isso a recusa real da remarcação não abre o `ConflictPanel` (a observação 2 do review119), e a perda do hold não volta à escolha do horário;
   - `features/agenda/AppointmentForm.tsx` usa `isHoldLostError` e `holdLostMessage` na criação. O conflito da criação já está certo (`isSlotRefusal`), mas a perda do hold não;
   - `features/agenda/AvailabilityExceptions.tsx`: `isExceptionConflictError` (`EXCEPTION_APPOINTMENT_CONFLICT`). Contra o BFF real, a indisponibilidade sobre atendimento confirmado não abre a decisão com motivo, e a pessoa fica sem como declarar a indisponibilidade;
   - `features/agenda/occupancy.ts`: `seriesConflicts` (`BLOCK_SERIES_APPOINTMENT_CONFLICT`, com `details.conflicts`), usado por `BlockSeriesForm.tsx` e `OccurrenceActions.tsx`. Contra o BFF real, a série de bloqueio sobre atendimento não abre o `SeriesConflictPanel` ("pular" ou "forçar com motivo");
   - `features/agenda/SeriesConfirm.tsx`: `seriesFailure` compara o código cru com `APPOINTMENT_HOLD_EXPIRED`, `SLOT_UNAVAILABLE` e `APPOINTMENT_SERIES_TOO_LONG`;
   - `features/imports/ConnectSourceScreen.tsx`: `IMPORT_ALREADY_COMPLETED`, comparado cru em `connectErrorMessage`, antes do `switch` de `UPSTREAM_ERROR`;
   - `features/imports/ImportConflictsScreen.tsx`: `IMPORT_ITEM_ALREADY_DECIDED`. Contra o BFF real, a decisão já tomada vira "Não foi possível registrar essa decisão agora", em vez de `onAlreadyDecided()`;
   - `features/imports/ImportRunScreen.tsx`: `IMPORT_PENDING_ACCEPTANCE_REQUIRED` (que deveria reabrir a confirmação) e, em `completeErrorMessage`, `IMPORT_ALREADY_COMPLETED` e `IMPORT_SESSION_NOT_COMPLETABLE`.
   Todos esses códigos só existem no Scheduling (`apps/scheduling-service/src`). Nenhum é emitido pelo BFF por conta própria.
4. **Os testes desses pontos montam `BffHttpError` com o código cru** (`goal016-a11y`, `goal016-appointment-create`, `goal016-blocks-series`, `goal016-exceptions-source`, `goal020-import-conflicts`, `goal060-connect-source`, `goal083-new-appointment` e `goal119-novo-agendamento-conflito`). Por isso passam, e o defeito não apareceu.
5. **No caminho genérico da Agenda**, `requestError` de `occupancy.ts` devolve `caught.message`. Com o embrulho, essa é a mensagem em inglês do Scheduling ("The unavailability covers a confirmed appointment; …"). Reconhecer a recusa tira esses casos do caminho genérico.

## Escolhas de desenho desta passada

1. **Um leitor único da recusa**, num módulo novo em `apps/frontend/src/data/http/` (o nome é do Developer, por exemplo `schedulingRefusal.ts`). Ele expõe:
   - o código da recusa: `details.upstreamCode` quando `code === "UPSTREAM_ERROR"` e `upstreamCode` é texto; senão, o próprio `code`; `undefined` para o que não é `BffHttpError`;
   - o detalhe da recusa: `details.upstreamDetails` quando o erro é o embrulho; senão, `details`; sempre um objeto (vazio quando não há detalhe), nunca `null`.
   Os dois formatos valem, como `isSlotRefusal` do Goal119. O formato cru continua aceito para não quebrar os testes existentes, nem um adaptador que responda direto.
2. **Os pontos do item 3 passam a usar o leitor**, sem mudar o que a tela faz depois de reconhecer a recusa:
   - `holdSession.ts`: `isSlotConflictError`, `isHoldLostError` e `holdLostMessage` (`slotStillAvailable` lido do detalhe da recusa). Com isso, a remarcação abre o `ConflictPanel` e a perda do hold volta à escolha do horário, na criação e na remarcação;
   - `AppointmentForm.tsx`: `isSlotRefusal` pode passar a delegar ao leitor ou a `isSlotConflictError`, sem mudar o resultado;
   - `AvailabilityExceptions.tsx`, `occupancy.ts` (`seriesConflicts`, com `conflicts` lido do detalhe da recusa) e `SeriesConfirm.tsx` (`seriesFailure` com o código do leitor; `failureDetails` pode passar ao leitor);
   - `ConnectSourceScreen.tsx`, `ImportConflictsScreen.tsx` e `ImportRunScreen.tsx` (a confirmação pendente e `completeErrorMessage`).
3. **O que não muda.** O envelope do BFF e o contrato (outras telas já leem `upstreamCode`, e mudar o envelope as quebraria). O texto, o layout e o fluxo de cada tela depois do reconhecimento: o `ConflictPanel` e "Sobrepor mesmo assim" da remarcação, o motivo obrigatório (D-032 (4)), o `SeriesConflictPanel`, a decisão da exceção, as mensagens da importação e da série. Os leitores de `upstreamCode` que já funcionam (item 2 da evidência) não são refatorados; se o Developer quiser trocá-los pelo leitor novo, fica para outro Goal. `requestError` não muda.
4. **Decisão.** O Developer propõe **D-134**, por acréscimo, depois das provas: o leitor único, os dois formatos aceitos, a lista dos pontos trocados e o que não muda. D-032, D-098 e D-133 não são reescritas.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. O leitor da escolha 1, em `apps/frontend/src/data/http/`.
2. Os pontos da escolha 2, em `features/agenda/` e `features/imports/`. Antes de editar, o Developer confere de novo, por busca, se há outra comparação de `error.code` com um código que só o Scheduling emite (`apps/scheduling-service/src`) e que o BFF não emite (`apps/bff/src`). Se achar, inclui no Goal e lista no relatório; se não achar, registra a busca e o resultado.

### 2. Provas

1. Testes novos em `apps/frontend/tests/goal120-*.test.ts(x)`, todos com o **envelope real do BFF** (`code: "UPSTREAM_ERROR"`, `details.upstream: "scheduling"`, `details.upstreamCode`, `details.upstreamRequestId` e `details.upstreamDetails` com o detalhe que o Scheduling manda):
   - o leitor: os dois formatos; `upstreamCode` ausente ou não texto; erro que não é `BffHttpError`; `upstreamDetails` ausente;
   - um teste que passa o corpo do item 1 da evidência, com status 409, pelo `BffHttpClient` (com `fetch` falso) e confere que o leitor devolve o código e o detalhe da recusa;
   - a remarcação: a recusa do hold e a da remarcação abrem o `ConflictPanel`; "Sobrepor mesmo assim" sem motivo não envia nada; com motivo, envia uma vez com `overlapOverride: true` e o motivo sem espaços nas pontas;
   - a perda do hold, na criação e na remarcação: o horário volta a ser escolhido, e a mensagem diz o que `upstreamDetails.slotStillAvailable` disse (`true`, `false` e ausente);
   - a criação em conflito do Goal119 continua igual com o envelope real;
   - a indisponibilidade sobre atendimento confirmado abre a decisão com motivo;
   - a série de bloqueio, na criação (`BlockSeriesForm`) e na edição (`OccurrenceActions`), abre o `SeriesConflictPanel` com as ocorrências de `upstreamDetails.conflicts`;
   - a confirmação da série dá a mensagem de hold vencido, de horário tomado e de limite (com o `cap` do detalhe) pelo código do embrulho;
   - a importação: `IMPORT_ALREADY_COMPLETED` na conexão e na conclusão, `IMPORT_ITEM_ALREADY_DECIDED` chamando `onAlreadyDecided()`, `IMPORT_PENDING_ACCEPTANCE_REQUIRED` reabrindo a confirmação sem reenviar `acceptPending`, e `IMPORT_SESSION_NOT_COMPLETABLE` com a mensagem própria;
   - nenhuma tela mostra a mensagem em inglês do Scheduling nesses casos.
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) o leitor sem o ramo do embrulho (só `code`) faz testes da remarcação, da exceção e da importação reprovarem;
   - (b) o detalhe lido só do nível de cima (sem `upstreamDetails`) faz reprovar o teste de `slotStillAvailable` e o da série de bloqueio;
   - (c) "Sobrepor mesmo assim" da remarcação enviando sem motivo faz um teste reprovar.
   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes existentes continuam passando sem mudança. Se algum precisar mudar, só pode mudar porque passou a usar o leitor, nunca para afrouxar uma asserção; cada ajuste é listado no relatório.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco.
- Mudança de layout, de texto ou de fluxo em qualquer tela; `e2e/`, `scripts/` e `targets.json`.
- A troca dos leitores de `upstreamCode` que já funcionam pelo leitor novo.
- `requestError` mostrar a mensagem do serviço nas recusas que nenhuma tela trata pelo nome. Fica registrado, sem Goal.
- As lacunas visuais sem ID (S1b, Clientes, Serviços e as outras listadas na v144 do MASTER_PLAN) e as observações abertas dos reviews 116 a 119.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-134** em `PROPOSED`, conforme a escolha 4. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal120.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal120, com a busca da seção 1.2 e o resultado, as contagens da execução final, os controles negativos e a lista dos testes ajustados, se houver.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. A busca da seção 1.2, antes de editar.
2. O leitor e os testes dele, incluindo o do `BffHttpClient`.
3. Os pontos da Agenda e os testes deles.
4. Os pontos da importação e os testes deles.
5. Controles negativos do §2.2, revertidos.
6. Execução final, sobre a árvore completa: typecheck e lint do frontend; testes do frontend; `test:gate` (com o `prisma generate` de `apps/ai-orchestrator` já feito); `validate:core`; `validate:ui`; `validate:integration` (com `BFF_TEST_DATABASE_URL` num banco descartável de um cluster PostgreSQL próprio, criado com `initdb` fora do repositório, como nos Goals 118 e 119); `git diff --check`. Com o RTK ligado, lint por `rtk proxy`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. O leitor aceita o embrulho `UPSTREAM_ERROR` e o código cru, e o detalhe vem de `upstreamDetails` no embrulho. Provado em jsdom, inclusive pelo `BffHttpClient`.
2. Com o envelope real do BFF, a remarcação abre o `ConflictPanel`, e "Sobrepor mesmo assim" só envia com motivo, uma vez, com `overlapOverride: true`. Provado em jsdom.
3. Com o envelope real, a perda do hold volta à escolha do horário, na criação e na remarcação, e a mensagem segue `slotStillAvailable`. Provado em jsdom.
4. Com o envelope real, a exceção do dia, a série de bloqueio (criação e edição), a confirmação da série e as quatro recusas da importação chegam à tela que já existia para elas. Provado em jsdom.
5. A criação em conflito do Goal119 e todos os testes existentes continuam passando.
6. Os três controles negativos reprovam e foram revertidos.
7. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança.
8. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/` e dos três registros da seção "Documentação" mudou.
9. D-134 proposta, com o leitor, os dois formatos, os pontos trocados e o que não muda.

## Plano de execução

1. **WU-01 — O leitor e a Agenda.** A busca, o leitor em `data/http/` com os testes dele, e os pontos de `holdSession.ts`, `RescheduleFlow.tsx`, `AppointmentForm.tsx`, `AvailabilityExceptions.tsx`, `occupancy.ts` e `SeriesConfirm.tsx`, com os testes do envelope real.
2. **WU-02 — A importação.** `ConnectSourceScreen.tsx`, `ImportConflictsScreen.tsx` e `ImportRunScreen.tsx`, com os testes do envelope real.
3. **WU-03 — Provas e registros.** Controles negativos, D-134, CURRENT_STATE e VALIDATION_GATE.
4. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
