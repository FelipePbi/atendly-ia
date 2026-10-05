# Goal 118 — A Agenda igual ao protótipo no dia vazio, no calendário, no botão de criar e nos dias visíveis

**Status: ACCEPTED.** Preparado em 2026-10-05 pelo Tech Lead Agent após [Goal117 ACCEPTED](../reviews/117-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: A2, A3, A4, A12

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v142**, inserida depois do 117, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID da v137. Com o Goal117, a Home tem alvo em todo quadro que o app consegue mostrar (o H6 continua sem sinal). A Agenda é a próxima superfície de uso diário, e quatro dos seus seis quadros sem alvo são estados e folhas da própria tela `/agenda`.

## Baseline aceita

Baseline aceita: `973dd17512e9862d72a3ac9ff163fa0bee6d68a5`

Goal anterior: 117 — A Home igual ao protótipo nas pendências, no checklist e na pausa da IA

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal117 já integrado em `main` (origem `8aee291768d831eb54e076993a72a0da02483fc1`). Foram **quatro rodadas**, com 9, 1, 2 e 3 blockers; os 3 da rodada 4 eram só de registro e foram aplicados no fechamento. **D-131** foi aceita: a Home segue H2, H4, H5 e H7, com as pendências ordenadas, "Hoje · {n} restantes", o checklist com a frase do que falta, a hora da pausa como `AiSettings.pausedAt` e "Pausar" e "Reativar" na própria Home. A última contagem aceita: frontend **160** arquivos e **2038** testes, `test:gate` **263**, `visual-responses.test.mjs` **30**, `validate:core` 15 passos e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, `validate:integration` **36** de 36 passos e **275** testes no gate autenticado. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a Agenda fica igual aos quadros A2, A3, A4 e A12 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768), **e o calendário, o menu de criar e os dias visíveis funcionam na própria Agenda**.

**Por que agora.** A fila não tem Goal PLANNED. Na baseline `973dd17`, `e2e/visual/targets.json` tem 66 alvos, e **47 dos 113 quadros continuam sem alvo**. A Agenda tem seis deles (A2, A3, A4, A7, A12 e S1b). A2, A3, A4 e A12 ficam na própria `/agenda` e usam só leituras e gravações que já existem. A7 (conflito no novo agendamento) e S1b (seletor de cor do serviço) são outras telas e ficam para as próximas passadas.

## O que a evidência desta passada mostra

Conferido no código da baseline `973dd17`, nos quadros (`Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`) e em D-108 e D-109.

1. **A2, dia sem atendimentos.** A faixa da semana com o dia escolhido e o dia de hoje com anel, quando hoje não é o dia escolhido. O resumo diz "Domingo, 21 · você não atende neste dia". O corpo diz "Nenhum atendimento neste dia. A IA não marca horários aos domingos, mas você pode criar um atendimento por conta própria." e tem "Criar agendamento". A nota do quadro: "O vazio explica a regra do dia sem bloquear a exceção manual."
2. **O dia vazio de hoje não é o A2.** `DayView.tsx` mostra "Nenhum atendimento neste dia.", depois "Você não atende neste dia." quando a disponibilidade não tem regra ativa para o dia da semana (`hasAvailability === false`), e "Criar agendamento" com `createAppointments`. A frase do motivo, o lugar dela no resumo e a frase da IA não existem.
3. **A3, calendário de navegação.** Uma folha com o mês, as sete colunas de SEG a DOM, um ponto nos dias com atendimento, o dia de bloqueio de dia inteiro em cinza, a legenda "Um ponto = dia com atendimentos" e "Ir para hoje". A nota: "Mini-calendário só para navegar — não é uma visão mensal." Ela abre pelo título de mês e ano. Hoje o título não abre nada: D-108 (a) tirou o chevron ⌄ porque "abriria o calendário do A3, que o app não tem", e o "Revisar se" de D-108 diz que portar o A3 reabre (a).
4. **Os dados do A3 já existem.** `AgendaBoard.tsx` lê agendamentos, bloqueios e exceções por janela (`listAppointments`, `listTimeBlocks` e `listAvailabilityExceptions`, os dois últimos só com a fonte `AVENLY`). A janela do Dia é uma semana, então o mês do A3 precisa da sua própria leitura. `MonthView.tsx` já decide o dia fechado (`isFullDayClosure`: bloqueio ou exceção indisponível que cobre o dia inteiro).
5. **A4, o que adicionar.** Uma folha "O que você quer adicionar?" com três linhas, cada uma com ícone, título e descrição: "Agendamento · Atendimento para um cliente", "Compromisso pessoal · Ocupa a agenda sem cliente — a IA não marca por cima" e "Bloqueio · Horário indisponível, uma vez ou toda semana". Hoje `AgendaNewMenu` é um menu suspenso (`role="menu"`) com quatro itens só de texto. O quarto, "Exceção do dia" (`/agenda/excecoes`), não tem outro caminho no app, e D-108 o pôs no menu.
6. **A12, dias visíveis.** A pílula "Seg–Sáb" ao lado do seletor abre uma folha "Dias visíveis" com "Escolha o que aparece em Semana e Mês. Isso não muda seus horários de atendimento.", sete interruptores de Segunda a Domingo, "Você não atende neste dia" sob o dia sem horário, a frase "Se algum atendimento cair em um dia oculto, ele continua na visualização Dia e você recebe um aviso na semana." e "Salvar". O quadro desktop abre a folha sobre a Semana. Hoje a pílula é um link para `/configuracoes/agenda` (D-109 (g)), e o "Revisar se" de D-109 diz que portar o A12 reabre (g).
7. **A gravação do A12 já existe.** `PATCH /v1/settings/agenda-view` aceita `hiddenWeekdays` sozinho (`initialView` ausente preserva o gravado). `CalendarSettings.tsx` já tem a folha de Configurações › Agenda, com o limite de seis dias ocultos e a mensagem da recusa (`hiddenWeekdaysLimitReason`).
8. **O `visual:compare` serve respostas fixas de `GET` pelo caminho exato** e executa `steps` (D-118 (a), D-127 (7)). `{today}` e `{today-N}` existem; `{today+N}` não. A1, A10 e A11 usam o estado da conta de teste.

## Escolhas de desenho desta passada

1. **O dia vazio do A2.** Quando o dia não tem atendimento nem bloqueio:
   - com `hasAvailability === false`, o resumo traz "{Dia da semana}, {d}" e "você não atende neste dia"; o corpo diz "Nenhum atendimento neste dia." e "A IA não marca horários {aos domingos | às segundas | …}, mas você pode criar um atendimento por conta própria.", com "Criar agendamento";
   - sem `createAppointments`, a frase termina em "A IA não marca horários aos domingos." e o botão some;
   - com disponibilidade no dia, ou com a disponibilidade ainda não lida ou falhada, o corpo fica como hoje, sem a frase da IA.
   O anel de hoje na faixa da semana segue o quadro.
2. **O calendário do A3.** O título de mês e ano vira um botão com o chevron ⌄ do quadro, nas três visualizações, porque a barra é comum (D-108 (a)). Nome acessível: "Abrir calendário, {mês} de {ano}". A folha:
   - abre no mês do dia focado, com ‹ › para trocar de mês e as sete colunas, sem aplicar os dias ocultos;
   - lê o mês da grade com as mesmas três leituras da Agenda e o mesmo `buildAgendaEntries`; põe ponto no dia com pelo menos um agendamento e cinza no dia com `isFullDayClosure`;
   - tocar um dia move a Agenda para aquela data, mantém a visualização, fecha a folha e devolve o foco ao título; "Ir para hoje" faz o mesmo com hoje;
   - a falha da leitura do mês deixa a folha navegável, sem pontos e sem mensagem que bloqueie; fechar a folha cancela a leitura em voo.
3. **O menu de criar do A4.** "Novo" (e o botão flutuante abaixo de 1024 px) abre a folha "O que você quer adicionar?" no lugar do menu suspenso. As linhas e os destinos:
   - "Agendamento", com `createAppointments`, para `/agenda/novo`;
   - "Compromisso pessoal" e "Bloqueio", com `manageAvailability`, para `/agenda/bloquear?type=PERSONAL` e `?type=BLOCK`;
   - "Exceção do dia · Atender ou fechar um dia fora do horário de sempre", com `manageAvailability`, para `/agenda/excecoes`, como quarta linha no mesmo estilo (divergência declarada 4).
   Sem nenhuma das duas capacidades, o botão não existe, como hoje.
4. **Os dias visíveis do A12.** A pílula vira botão e abre a folha "Dias visíveis" na própria Agenda. A folha:
   - começa com os `hiddenWeekdays` lidos; nada é gravado antes de "Salvar";
   - "Salvar" grava `PATCH /v1/settings/agenda-view` só com `hiddenWeekdays`, em ordem, sem `initialView`; enquanto grava, fica desabilitado; depois, a Agenda aplica os dias novos sem recarregar a página;
   - mantém o limite de seis dias ocultos e a mensagem de recusa de `CalendarSettings.tsx`; outra falha mostra "Não foi possível salvar os dias visíveis." com `role="alert"`, e a folha fica aberta;
   - "Você não atende neste dia" aparece sob o dia sem regra ativa de disponibilidade, e some quando a disponibilidade não foi lida.
   O Developer pode extrair a folha de `CalendarSettings.tsx` para um componente comum, desde que AG1 continue igual à captura de antes.
5. **As folhas.** As três seguem a casca de cada quadro (folha de baixo no mobile, e o que o quadro desenha no tablet e no desktop). Têm nome acessível, foco preso, `Escape` e o escurecido fecham sem gravar, e o foco volta ao botão que abriu. O movimento para com `prefers-reduced-motion`. O Developer pode reusar `ChatSheetShell` ou a casca de diálogo que já existe, desde que K5, K6 e H7 continuem iguais à captura de antes.
6. **Decisão.** O Developer propõe **D-132**, por acréscimo, depois das provas: o dia vazio, o calendário, o menu de criar como folha, os dias visíveis na Agenda e as divergências. D-132 revê D-108 (a) (o chevron volta) e D-109 (g) (a pílula abre a folha). D-108 e D-109 não são reescritas.

## Escopo obrigatório

### 1. A Agenda (`apps/frontend`)

1. O Developer **porta** o HTML/CSS dos quadros A2, A3, A4 e A12, de `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`: o vazio, o título com chevron, as três folhas e suas linhas, com os valores inline de px, cor, fonte e raio. As medidas do protótipo são `content-box` (D-127 (8)). Nada de reinterpretar o layout.
2. As regras das escolhas 1 a 5, em `features/agenda/` e, se a folha do A12 for extraída, em `features/settings/CalendarSettings.tsx`.
3. Acessibilidade: alvos de toque de no mínimo 44 px; o dia do A3 tem nome com a data e diz se tem atendimento ou se está fechado, em texto, não só em cor; os interruptores do A12 têm o nome do dia e o estado.
4. `apps/frontend/e2e/visual/targets.json`: entram **A2**, **A3**, **A4** e **A12**, com `route` `/agenda`, `clock` e os `steps` que abrem cada estado. Os alvos não podem depender do dia da semana do dia semeado:
   - A2: `responses` de `GET` que deixam o dia escolhido sem atendimento e sem regra de disponibilidade, e um passo que escolhe outro dia que não hoje (por exemplo, "Próximo dia"), para hoje ficar com anel;
   - A3: o passo que toca o título;
   - A4: o passo que toca "Novo";
   - A12: os passos "Semana" e a pílula, com `GET /v1/settings/agenda-view` fixo com o domingo oculto e, se preciso, a disponibilidade fixa sem o domingo.
   Tudo nos limites de D-127 (7): só `GET`, caminho exato, nenhuma capacidade nova no `visual:compare`.
5. `scripts/tests/visual-responses.test.mjs` passa a exigir os quatro alvos.

### 2. O que já valia continua valendo

1. A1, A10 e A11 continuam iguais à captura de antes, salvo o chevron ⌄ no título, que fica igual ao dos quadros. A5, A6, A8, A9 e AG1 continuam iguais à captura de antes; `AgendaDayColumn.tsx` não muda.
2. K5, K6 e H7 continuam iguais à captura de antes, se a casca de folha que eles usam mudar.
3. As leituras da Agenda, a navegação ‹ ›, o seletor Dia · Semana · Mês, a preferência de visualização inicial e as rotas de criação não mudam.
4. O gate autenticado (`e2e/authenticated-matrix.spec.ts`) não muda. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` muda. Se o gate reprovar pela mudança, o Developer para e registra; não ajusta o gate sem autorização no review.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal118-*.test.tsx`, com:
   - o vazio com e sem disponibilidade no dia, com e sem `createAppointments`, e com a disponibilidade falhada; a frase da IA para cada dia da semana;
   - o título abrindo o calendário; os pontos e o dia fechado a partir das três leituras; a troca de mês com nova leitura; o toque num dia e "Ir para hoje" movendo a Agenda e mantendo a visualização; a falha da leitura sem bloquear; `Escape` e o foco de volta;
   - a folha de criar com as linhas por capacidade, os destinos e nenhum botão sem capacidade;
   - a folha de dias visíveis: o estado lido, nada gravado antes de "Salvar", o corpo do `PATCH` só com `hiddenWeekdays`, o limite de seis, a recusa e a falha genérica com a folha aberta, a Agenda com os dias novos depois de salvar, e "Você não atende neste dia".
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a folha do A12 gravando no toque do interruptor, sem "Salvar", faz um teste reprovar;
   - (b) os pontos do A3 calculados da janela já carregada, sem a leitura do mês, fazem um teste reprovar;
   - (c) a folha do A4 mostrando "Agendamento" sem `createAppointments` faz um teste reprovar.
   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes da Agenda existentes (`goal016-*`, `goal069-agenda-views`, `goal073-agenda-visualizacao`, `goal092-agenda-dia`, `goal100-agenda-semana-mes`, `goal097-configuracoes` e outros que leiam a Agenda) continuam passando. Teste que dependa do menu suspenso, do link da pílula ou do texto do vazio pode ser ajustado só para o novo papel, o novo lugar ou o novo texto, sem afrouxar a asserção. Cada ajuste é listado no relatório.

## Divergências declaradas

Não contam como defeito na comparação de A2, A3, A4 e A12:

1. A barra de status e o indicador de início do iPhone nos quadros mobile, e o respiro de topo da casca (D-131).
2. O nome e as iniciais do negócio da conta visual, e a casca, como em D-127 a D-131; o aviso de WhatsApp desconectado da conta de teste, como nos alvos A1 a A11.
3. As datas, o mês e os dias calculados de `{today}` e do `clock`; no A2, o dia da semana da frase; no A3, os atendimentos de fundo e quais dias têm ponto ou ficam cinza, que seguem os dados da conta de teste.
4. A quarta linha "Exceção do dia" na folha do A4, no estilo das outras três.

Qualquer outra diferença visível é blocker.

## Fora do escopo

- A7 (conflito no novo agendamento) e S1b (cor personalizada do serviço).
- O aviso na semana para atendimento em dia oculto, que a frase do A12 cita; se ele não existir hoje, a frase fica e o Developer registra o fato em D-132.
- `AgendaDayColumn.tsx`, os fluxos de criar, detalhe, cancelar e remarcar, e Configurações › Agenda além da extração opcional da folha.
- Qualquer mudança no BFF, no Scheduling, no contrato ou no `visual:compare` além de `targets.json` e do teste de `scripts/tests/visual-responses.test.mjs`.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-132** em `PROPOSED`, conforme a escolha 6. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal118.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal118, com as contagens da execução final, os controles negativos e a lista das capturas do `visual:compare` conferidas.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Antes de editar: subir uma pilha própria em bancos descartáveis, num cluster PostgreSQL próprio, com `prisma migrate deploy` dos três serviços, e chamar o `visual:compare` com `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN` (o BFF de desenvolvimento em `localhost:3002` pode não responder); rodar `npx prisma generate` em `apps/ai-orchestrator` antes de `test:gate`. Rodar `npm run visual:compare -- --target A1,A10,A11,A5,A6,AG1,K5,K6,H7` na baseline. As capturas de antes ficam fora do repositório. Se o PostgreSQL da pilha cair com o erro 487 do Windows, encerrar o postmaster e religar com `pg_ctl` antes de comparar (observação 2 do review117).
2. `targets.json` com A2, A3, A4 e A12 e o teste de `visual-responses`; `npm run visual:compare -- --target A2,A3,A4,A12` na baseline, para ter o antes.
3. O vazio e a folha de criar, com os testes.
4. O calendário, com os testes.
5. Os dias visíveis, com os testes e os ajustes listados.
6. Controles negativos do §3.2, revertidos.
7. `npm run visual:compare -- --target A2,A3,A4,A12,A1,A10,A11,A5,A6,AG1,K5,K6,H7` e **olhar** as capturas lado a lado (protótipo × app, 4 devices). A2, A3, A4 e A12 têm de ficar iguais aos quadros, salvo as divergências declaradas; os outros, iguais à captura de antes, com o chevron de A1, A10 e A11 igual ao dos quadros.
8. Execução final, sobre a árvore completa: typecheck e lint do frontend; testes do frontend; `test:gate`; `validate:core`; `validate:ui`; `validate:integration` (com `BFF_TEST_DATABASE_URL` num banco descartável e o PostgreSQL de um cluster próprio); `git diff --check`. Com o RTK ligado, lint por `rtk proxy`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A Agenda fica **igual aos quadros A2, A3, A4 e A12 nos 4 devices**, conferido olhando as capturas do `visual:compare`, salvo as divergências declaradas. A1, A10 e A11 continuam iguais à captura de antes, com o chevron igual ao dos quadros; A5, A6, AG1, K5, K6 e H7, iguais à captura de antes.
2. O vazio segue a escolha 1. Provado em jsdom.
3. O calendário lê o mês, marca ponto e dia fechado, move a Agenda sem trocar a visualização e não bloqueia na falha, conforme a escolha 2. Provado em jsdom.
4. A folha de criar mostra só o que cada capacidade permite e leva aos destinos de hoje, conforme a escolha 3. Provado em jsdom.
5. Os dias visíveis gravam só `hiddenWeekdays`, nada antes de "Salvar", com o limite e as falhas da escolha 4. Provado em jsdom.
6. Os três controles negativos reprovam e foram revertidos.
7. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança em `e2e/` fora de `targets.json`.
8. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
9. D-132 proposta, com o vazio, o calendário, a folha de criar, os dias visíveis, a revisão de D-108 (a) e D-109 (g) e as divergências.

## Plano de execução

1. **WU-01 — Alvos e medida de antes.** A pilha descartável, as capturas de antes, `targets.json` com A2, A3, A4 e A12 e o teste de `visual-responses`.
2. **WU-02 — O vazio e a folha de criar.** A2 e A4, com os testes.
3. **WU-03 — O calendário.** O título com chevron e a folha do A3, com a leitura do mês e os testes.
4. **WU-04 — Os dias visíveis.** A pílula e a folha do A12, com os testes e os ajustes dos testes existentes.
5. **WU-05 — Provas e registros.** Controles negativos, `visual:compare` depois, D-132, CURRENT_STATE e VALIDATION_GATE.
6. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
