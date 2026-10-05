# Goal 119 — O conflito de horário no novo agendamento igual ao protótipo

**Status: READY.** Preparado em 2026-10-05 pelo Tech Lead Agent após [Goal118 ACCEPTED](../reviews/118-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: A7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v143**, inserida depois do 118, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID da v137. Com o Goal118, a Agenda tem alvo em todo quadro da própria `/agenda`. Restam A7 e S1b. O A7 é o estado de conflito do novo agendamento, o fluxo de criar que a profissional usa todo dia.

## Baseline aceita

Baseline aceita: `6814e29a32dcc8a9333555031015a6fc20c777df`

Goal anterior: 118 — A Agenda igual ao protótipo no dia vazio, no calendário, no botão de criar e nos dias visíveis

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal118 já integrado em `main` (origem `e6ae6b817a142f63fdca4470e0cf6af848bcaab3`). Foram **duas rodadas**, com 8 e 1 blockers; o da rodada 2 era só de registro e foi aplicado no fechamento. A rodada 1 caiu em boa parte por ambiente: o banco de desenvolvimento não tinha a migration do Goal109, e a criação de banco isolado foi negada. **D-132** foi aceita: o dia vazio do A2, o mini-calendário do A3, a folha de criar do A4 e a folha de dias visíveis do A12. A última contagem aceita: frontend **161** arquivos e **2068** testes, `test:gate` **266**, `visual-responses.test.mjs` **33**, `validate:core` 15 passos e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, `validate:integration` **36** de 36 passos e **275** testes no gate autenticado. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o novo agendamento fica igual ao quadro A7 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768) **quando o horário escolhido está ocupado, e encaixar continua exigindo decisão humana com motivo**.

**Por que agora.** A fila não tem Goal PLANNED. Na baseline `6814e29`, `e2e/visual/targets.json` tem 70 alvos, e **43 dos 113 quadros continuam sem alvo**. Na Agenda restam A7 e S1b. O A7 só muda apresentação: a recusa, a leitura da ocupação e o encaixe com motivo já existem. O S1b fica fora, porque o seletor de cor livre pede cor fora de `colorToken`, o que é contrato e decisão de produto.

## O que a evidência desta passada mostra

Conferido no código da baseline `6814e29`, nos quadros (`Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`), em `PUBLIC_API_V1.md` e em D-032, D-098 e D-111.

1. **O quadro A7, "Encaixe manual · conflito de horário".** É o formulário do A6 com o conflito dentro dele:
   - na lista de horários, o horário recusado aparece como chip âmbar e selecionado, com o ícone de alerta (borda 1,5 px `#B7791B`, fundo `#F8ECD5`, texto `#7A4E0A`), depois dos horários livres;
   - logo abaixo do bloco Horário, um aviso âmbar com o mesmo ícone (raio 14 px, `padding` 14 px 16 px, fundo `#F8ECD5`): "Esse horário já está ocupado" em 15 px e peso 600, e "**Pedro Alves** tem Corte masculino às 16:30 (em confirmação). Você pode encaixar mesmo assim — os dois vão ficar no mesmo horário na sua agenda." em 14 px, `#6B4509`;
   - o rodapé troca o CTA de criar por dois botões de 52 px, empilhados com 10 px entre eles: "Encaixar mesmo assim" (primário, `#0F5F63`) e "Escolher outro horário" (secundário, borda `#D6CEC2`);
   - a nota do quadro: "Só você pode sobrepor — a IA nunca encaixa. O conflito é explicado com nome e horário, e o CTA muda de verbo para deixar a exceção consciente."
   No desktop, o quadro é a composição do A6, com a coluna do Dia à esquerda e o formulário à direita. Na coluna, o atendimento das 16:30 é de Pedro Alves, "Em confirmação · aguardando o cliente".
2. **O conflito de hoje está fora do formulário.** `AppointmentForm.tsx` chama `openConflict` quando o hold (`POST /v1/holds`) ou a criação (`POST /v1/appointments`) recusa com `409 SLOT_UNAVAILABLE` (`isSlotConflictError`). Isso mostra o `ConflictPanel`, uma seção abaixo do formulário inteiro, com:
   - "Conflito de horário" e "O intervalo {início}–{fim} não está livre nesta agenda";
   - a lista do que ocupa o intervalo, lida por `readOccupancy` (agendamentos e bloqueios do dia, por `buildAgendaEntries`) e filtrada por `occupyingEntries`;
   - o campo "Motivo da sobreposição", obrigatório antes de enviar, e o texto do histórico;
   - "Escolher outro horário" e "Sobrepor mesmo assim" (perigo).
   Enquanto o conflito está aberto, o CTA de criar fica desabilitado (`!conflict` em `canSubmit`).
3. **As regras de gravação já existem.** O encaixe é `create(reason)`, com `overlapOverride: true` e `overlapOverrideReason`. O contrato exige o motivo e recusa override de origem `AI` (`403 OVERLAP_OVERRIDE_NOT_ALLOWED`). D-032 (4) fixou que a tela mostra o que ocupa e recusa o envio sem motivo, junto ao campo. D-098 (c) manteve isso no A6.
4. **O caminho até um horário ocupado** é "Outro horário": o campo "Outro horário, fora dos oferecidos" e "Usar este horário" chamam `chooseTime`, que reserva e cai no conflito. "Outro, sem cadastro" não tem hold e cai no conflito na criação.
5. **A remarcação usa o mesmo `ConflictPanel`** (`RescheduleFlow.tsx`). Não há quadro de conflito na remarcação, e o A9 já foi aceito.
6. **A presença já é lida.** `Appointment.presenceConfirmedAt` vem na listagem (Goal103), e `DayView.tsx` já a usa para "presença confirmada pelo lembrete".
7. **A conta visual já tem o atendimento do quadro.** `scripts/lib/visual-seed.mjs` cria, no dia de hoje, Pedro Alves às 16:30 com Corte masculino, sem presença confirmada. O catálogo tem Hidratação, de 30 min. O `visual:compare` executa `steps` com `click`, `clickRole`, `fill` e `waitFor`. Então o alvo chega ao conflito por passos, com a recusa real do hold e sem resposta fixa. Um hold recusado não grava nada.

## Escolhas de desenho desta passada

1. **O conflito dentro do formulário (A7).** Na recusa `409` do hold ou da criação em `/agenda/novo`:
   - o horário recusado fica selecionado como chip âmbar com o ícone de alerta. Se ele é um dos horários oferecidos, o próprio chip muda. Se veio de "Outro horário", um chip com esse horário entra no fim da lista, e o campo manual fecha;
   - o aviso âmbar entra logo abaixo do bloco Horário, com `role="alert"`;
   - o rodapé mostra "Encaixar mesmo assim" e "Escolher outro horário" no lugar do CTA de criar. A linha do hold e a frase do que falta (`blockedReason`) não aparecem durante o conflito;
   - mudar o cliente, o serviço, a data ou o horário sai do conflito, como hoje (`resetSlotChoice`).
2. **O texto do aviso.** O título é sempre "Esse horário já está ocupado", salvo nos dois últimos casos abaixo. O corpo vem do que `readOccupancy` e `occupyingEntries` leram, sem inferir nada:
   - para cada atendimento: "**{cliente}** tem {serviços} às {HH:MM}", com `customerLabel` e os nomes dos serviços unidos por " + " (ou o título do atendimento). Depois vem "(presença confirmada)" se há `presenceConfirmedAt`, ou "(em confirmação)" se não há. Atendimento concluído ou com falta não leva parêntese;
   - para cada bloqueio ou compromisso pessoal: "{Bloqueio | Compromisso pessoal} \"{título}\" das {HH:MM} às {HH:MM}", e sem título só o tipo;
   - para cada intervalo entre atendimentos (`buffer`): "Intervalo entre atendimentos das {HH:MM} às {HH:MM}";
   - os itens saem em ordem de início, cada um como uma frase terminada em ponto. Depois vem "Você pode encaixar mesmo assim — os dois vão ficar no mesmo horário na sua agenda." com um item, ou "… — todos vão ficar no mesmo horário na sua agenda." com mais de um;
   - com a leitura respondida e nada no intervalo, o título é "Esse horário está fora do seu horário de atendimento", e o corpo é "Nada na sua agenda ocupa {início}–{fim}, mas o horário fica fora da grade de atendimento. Você pode encaixar mesmo assim.";
   - com a leitura falhada, o título é "Não foi possível ver o que ocupa este horário", e o corpo é "A agenda recusou o horário. Você pode encaixar mesmo assim ou escolher outro horário.";
   - enquanto a leitura não responde, o corpo é "Consultando o que ocupa este horário…", e "Encaixar mesmo assim" fica desabilitado.
3. **O motivo continua obrigatório (D-032 (4)).** O campo "Motivo do encaixe" fica entre o aviso e o rodapé, no estilo dos campos do A6 (`.input`, rótulo 13 px, peso 600, `#5F574E`). "Encaixar mesmo assim" sem motivo não envia nada. Nesse caso aparece, junto ao campo, "Descreva o motivo do encaixe. Sem motivo, o agendamento não é enviado.", com `role="alert"` e `aria-invalid` no campo. Com motivo, envia `create(motivo)`, com `overlapOverride: true` e `overlapOverrideReason` sem espaços nas pontas. O campo é divergência declarada 4: o quadro não o desenha, e tirar o registro humano da sobreposição é decisão de produto que este Goal não toma.
4. **"Escolher outro horário".** Sai do conflito sem enviar nada: libera o hold, limpa o horário e o motivo, e devolve o chip âmbar ao estado normal (ou o tira, se veio de "Outro horário"). O foco vai para o primeiro horário livre, ou para a legenda "Horário" se não houver nenhum.
5. **O que não muda.** O hold, a idempotência, a perda do hold, o `ReadOnlyState`, as capacidades e a composição de 1024 px do A6 (D-111, D-126) continuam iguais. A remarcação continua com o `ConflictPanel`, sem mudança de texto. O Developer pode extrair um componente novo para o aviso. O `ConflictPanel` continua existindo para a remarcação. `occupyingEntries` continua exportado, porque `AvailabilityExceptions.tsx` o usa.
6. **Decisão.** O Developer propõe **D-133**, por acréscimo, depois das provas: o conflito dentro do formulário, os textos da escolha 2, o motivo mantido, a remarcação fora e as divergências. D-032 e D-098 não são reescritas.

## Escopo obrigatório

### 1. O novo agendamento (`apps/frontend`)

1. O Developer **porta** o HTML/CSS do quadro A7, de `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`: o chip âmbar, o aviso e o rodapé de dois botões, com os valores inline de px, cor, fonte e raio. As medidas do protótipo são `content-box` (D-127 (8)). Nada de reinterpretar o layout.
2. As regras das escolhas 1 a 5, em `features/agenda/AppointmentForm.tsx` e, se o Developer extrair, num componente novo em `features/agenda/`.
3. Acessibilidade: o chip âmbar diz em texto que o horário está ocupado (nome acessível com "ocupado"), não só pela cor; os dois botões têm no mínimo 44 px de alvo; o aviso é anunciado (`role="alert"`); o foco segue a escolha 4.
4. `apps/frontend/e2e/visual/targets.json`: entra **A7**, com `route` `/agenda/novo`, `clock` `13:45` e `steps` que levam ao conflito sobre o atendimento das 16:30 da conta visual: o cliente (por exemplo, "Ana Paula"), o serviço "Hidratação", "Outro horário", o `fill` de "Outro horário, fora dos oferecidos" com `16:30`, "Usar este horário" e um `waitFor` em "Esse horário já está ocupado". Nada de `responses` e nenhuma capacidade nova no `visual:compare`. O passo do `waitFor` não pode ser `optional`: se a conta não tiver o atendimento das 16:30 (por exemplo, num domingo ou sábado, quando o dia semeado fecha antes), a captura tem de falhar, não sair sem o conflito.
5. `scripts/tests/visual-responses.test.mjs` passa a exigir o alvo A7, com o `waitFor` obrigatório.

### 2. O que já valia continua valendo

1. A6 continua igual à captura de antes, sem conflito. A5, A8, A9, A1 e AG1 continuam iguais à captura de antes.
2. A remarcação (`RescheduleFlow.tsx`) e o `ConflictPanel` dela não mudam, nem no texto nem no comportamento.
3. O hold, a criação, a idempotência e o corpo de `POST /v1/appointments` não mudam, salvo o motivo, que vem do novo campo.
4. O gate autenticado (`e2e/authenticated-matrix.spec.ts`) não muda. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` muda. Se o gate reprovar pela mudança, o Developer para e registra; não ajusta o gate sem autorização no review.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal119-*.test.tsx`, com:
   - a recusa do hold de um horário oferecido e de um horário de "Outro horário", e a recusa da criação com "Outro, sem cadastro": chip âmbar, aviso e rodapé de dois botões, sem o CTA de criar;
   - os textos da escolha 2: um atendimento com e sem presença confirmada; dois itens (atendimento e bloqueio) em ordem; compromisso pessoal com e sem título; intervalo; nada no intervalo; leitura falhada; leitura pendente com "Encaixar mesmo assim" desabilitado;
   - "Encaixar mesmo assim" sem motivo não chama `createAppointment` e mostra a mensagem junto ao campo; com motivo, chama uma vez com `overlapOverride: true` e o motivo sem espaços nas pontas;
   - "Escolher outro horário" sem nenhuma gravação, com o hold liberado, o chip normal e o foco da escolha 4;
   - a troca de serviço, de data ou de cliente saindo do conflito;
   - a remarcação ainda mostrando o `ConflictPanel` com "Sobrepor mesmo assim".
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) "Encaixar mesmo assim" enviando sem motivo (a checagem do motivo vazio removida) faz um teste reprovar;
   - (b) o aviso afirmando um atendimento quando a leitura da ocupação falhou (o caso `null` tratado como lista vazia ou com o nome do horário) faz um teste reprovar;
   - (c) "Escolher outro horário" chamando `create` ou deixando o hold reservado faz um teste reprovar.
   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes existentes do novo agendamento e da remarcação (`goal016-appointment-create`, `goal016-a11y`, `goal083-new-appointment`, `goal101-novo-agendamento`, `goal112-agenda` e outros que leiam o formulário) continuam passando. Teste da **criação** que dependa do `ConflictPanel` ("Sobrepor mesmo assim", "Motivo da sobreposição", "Conflito de horário") pode ser ajustado só para o novo nome, o novo lugar ou o novo texto, sem afrouxar a asserção, e o teste de axe da criação continua cobrindo o estado de conflito. Testes da **remarcação** não mudam. Cada ajuste é listado no relatório.

## Divergências declaradas

Não contam como defeito na comparação do A7:

1. A barra de status e o indicador de início do iPhone nos quadros mobile, e o respiro de topo da casca (D-131).
2. O nome e as iniciais do negócio da conta visual e a casca, como em D-127 a D-132; o aviso de WhatsApp desconectado da conta de teste, como nos alvos A1 a A11.
3. A cliente escolhida (uma cliente cadastrada da conta visual, e não "Lívia Martins · nova"), a data de hoje e os horários livres, que seguem a conta de teste e o `clock`; no desktop, os atendimentos da coluna do Dia, que seguem a conta de teste e o A6 aceito.
4. O campo "Motivo do encaixe" entre o aviso e o rodapé (escolha 3).

Qualquer outra diferença visível é blocker.

## Fora do escopo

- S1b (cor personalizada do serviço), que pede cor fora de `colorToken`.
- O conflito da remarcação, o conflito de série de bloqueio (`SeriesConflictPanel`) e o conflito de exceção.
- O aviso na Semana para atendimento em dia oculto (observação 2 do review118).
- Qualquer mudança no BFF, no Scheduling, no contrato, em `scripts/lib/visual-seed.mjs` ou no `visual:compare`, além de `targets.json` e do teste de `scripts/tests/visual-responses.test.mjs`.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-133** em `PROPOSED`, conforme a escolha 6. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal119.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal119, com as contagens da execução final, os controles negativos, a lista dos testes ajustados e a lista das capturas do `visual:compare` conferidas.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. **Antes de editar, o ambiente.** O Developer sobe uma pilha própria em bancos descartáveis, num cluster PostgreSQL próprio criado com `initdb` fora do repositório, como na rodada 2 do Goal118. Roda `prisma migrate deploy` e `prisma generate` nos três serviços e chama o `visual:compare` com `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN`. O BFF de desenvolvimento em `localhost:3002` e o seu banco podem não responder ou estar sem migration, e isso não justifica parar. Se o PostgreSQL da pilha cair com o erro 487 do Windows, o Developer encerra o postmaster e religa com `pg_ctl` antes de comparar. Depois, roda `npm run visual:compare -- --target A6,A5,A8,A9,A1,AG1` na baseline. As capturas de antes ficam fora do repositório.
2. `targets.json` com A7 e o teste de `visual-responses`; `npm run visual:compare -- --target A7` na baseline, para ter o antes (o `ConflictPanel` de hoje).
3. O conflito dentro do formulário, os textos e o motivo, com os testes novos e os ajustes listados.
4. Controles negativos do §3.2, revertidos.
5. `npm run visual:compare -- --target A7,A6,A5,A8,A9,A1,AG1` e **olhar** as capturas lado a lado (protótipo × app, 4 devices). O A7 tem de ficar igual ao quadro, salvo as divergências declaradas; os outros, iguais à captura de antes.
6. Execução final, sobre a árvore completa: typecheck e lint do frontend; testes do frontend; `test:gate` (com o `prisma generate` de `apps/ai-orchestrator` já feito); `validate:core`; `validate:ui`; `validate:integration` (com `BFF_TEST_DATABASE_URL` num banco descartável do cluster próprio); `git diff --check`. Com o RTK ligado, lint por `rtk proxy`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. O novo agendamento em conflito fica **igual ao quadro A7 nos 4 devices**, conferido olhando as capturas do `visual:compare`, salvo as divergências declaradas. A6, A5, A8, A9, A1 e AG1 continuam iguais à captura de antes.
2. A recusa do hold e da criação leva ao estado da escolha 1, com o CTA de criar fora. Provado em jsdom.
3. O aviso diz o que a leitura da ocupação trouxe, nos casos da escolha 2, e nunca afirma ocupação que não leu. Provado em jsdom.
4. Encaixar só envia com motivo, uma vez, com `overlapOverride: true` (escolha 3); "Escolher outro horário" não grava nada e libera o hold (escolha 4). Provado em jsdom.
5. A remarcação não muda. Provado em jsdom.
6. Os três controles negativos reprovam e foram revertidos.
7. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança.
8. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
9. D-133 proposta, com o conflito no formulário, os textos, o motivo mantido, a remarcação fora e as divergências.

## Plano de execução

1. **WU-01 — Ambiente, alvo e medida de antes.** A pilha descartável, as capturas de antes, `targets.json` com A7 e o teste de `visual-responses`.
2. **WU-02 — O conflito do A7 no formulário.** O chip, o aviso, os textos, o motivo, o rodapé e "Escolher outro horário", com os testes novos e os ajustes dos testes da criação.
3. **WU-03 — Provas e registros.** Controles negativos, `visual:compare` depois, D-133, CURRENT_STATE e VALIDATION_GATE.
4. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
