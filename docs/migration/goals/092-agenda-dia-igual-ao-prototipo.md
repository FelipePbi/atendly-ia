# Goal 092 — Agenda Dia igual ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-02 pelo Tech Lead Agent após [Goal091 ACCEPTED](../reviews/091-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: A1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED) como "092 — Agenda dia, semana e mês iguais ao protótipo", com os quadros A1, A10 e A11, a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01). **READY na v120, com o mesmo ID, dividido:** este Goal fica com o A1 (Dia) e com a barra da Agenda, que é comum às três visualizações; A10 (Semana) e A11 (Mês) vão para o novo **100 — Agenda Semana e Mês iguais ao protótipo**, PLANNED, que depende deste. O motivo está em "Por que dividir".

## Baseline aceita

Baseline aceita: `640a02551aa1ef9e13cc12c9b082e769f084826d`

Goal anterior: 091 — Telas de acesso restantes iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal091 já integrado em `main` (origem `6df9bb4f2e53810a9b4341842a9512d0916b79db`). **Duas rodadas**, com 4 e 0 blockers, todos de documento. **D-107** aceita. A virada de status do documento do Goal091 para `ACCEPTED` veio no commit documental seguinte, `7cc1456`, que não é baseline e não muda código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/agenda` em Dia igual ao quadro A1 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`: o alvo A1 abre `/agenda` com o relógio em 13:45 e clica "Dia", então o desktop também é comparado em Dia.

**Por que agora.** Com o 091, as telas de acesso ficaram iguais ao protótipo. A Agenda é a tela principal do produto, e o 092 é o próximo da fila de fidelidade visual da v113. Depende só do 087 (aceito). O 093 (fluxos da Agenda) depende dele.

**Por que dividir.** A evidência desta passada mostra que o Dia do app não é a mesma tela do quadro com outro estilo: é uma grade de horas, e o A1 (e o vault) pedem uma lista cronológica com a cor do serviço. Isso, mais a barra comum, o botão de criar e as cores de serviço, já é um Goal médio. Semana e Mês são outros componentes (`WeekView.tsx`, `MonthView.tsx`), com outras regras de toque (o Mês seleciona antes de abrir o Dia) e um resumo do dia que o app não tem. O Goal069 (Agenda, sem comparação visual) levou seis rodadas. Juntar as três visualizações tornaria a revisão grande demais.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`, quadro "Agenda · dia"), no vault e no código da baseline. O A1 nunca foi medido em documento: o pente-fino só o lista como divergente ("no desktop, o app abre em Semana"). O Developer mede na baseline.

1. **Barra.** O A1 tem "Setembro" em Literata 26 px/500, "2026" em 16 px `#716859`, um chevron ⌄ (que abre o calendário do A3), e dois botões redondos de 40 px com ‹ e ›. Abaixo, o segmentado Dia · Semana · Mês em toda a largura (fundo `#EFEAE2`, raio 12, itens de 34 px). No desktop, "Novo" fica na barra. O app (`AgendaBoard.tsx`) mostra em `periodLabel` a data completa no Dia (a nota de fechamento de D-089, item 1, já registrou isso), e o "+ Novo" (`AgendaNewMenu`) fica na barra em todas as larguras.
2. **Botão de criar no mobile e no tablet.** O A1 mobile tem um botão flutuante de 56 px, `#0F5F63`, com "+", a 20 px da direita e 106 px do fundo, acima da barra de abas. O app não tem botão flutuante.
3. **O que o app mostra a mais.** Acima da barra, o cartão "Próximo agendamento" (D-089, item 2). Abaixo dela, o botão "Exceções do dia" (D-089, item 3). Nenhum dos dois existe no A1, no A10 nem no A11. O vault (`03-UX-UI/04-Especificacao-das-Telas.md`, "Agenda") não pede o cartão; os próximos atendimentos são da Home ("Início"). O protótipo não tem tela de exceções.
4. **O corpo do Dia.** O A1 é uma **lista cronológica**, como pede o vault ("Agenda — visualização Dia": "lista cronológica"). Cada linha tem o horário, um traço de 3 px na cor do serviço (dividido quando há dois serviços), o nome, "serviço · duração · preço", uma linha de observação ("presença confirmada pelo lembrete") e o estado ("Concluído" em cinza com ✓, "Não compareceu" em texto vermelho, "Confirmado"). O bloqueio é hachurado ("Almoço · bloqueio · 1 h"); o compromisso pessoal não tem traço ("Dentista · compromisso pessoal · 1 h"); o hold é tracejado ("Em confirmação · aguardando o cliente"); a hora atual (13:45) aparece entre as linhas. A nota do quadro diz que cancelados não entram na lista. O app (`DayView.tsx`) usa a grade de horas da Semana (`timeGrid.ts`), com eixo de horas e cada entrada posicionada pelo tempo, uma escolha do Goal016 registrada só no comentário do componente.
5. **Cor do serviço.** O serviço tem `colorToken` (`ROSE | AMBER | EMERALD | SKY | VIOLET | SLATE`, `apps/bff/PUBLIC_API_V1.md`; `BffServiceCatalogService`), usado hoje só em Serviços (`ServiceList.tsx`, `data-color`). O agendamento traz `services[].serviceId`. A Agenda nunca lê o catálogo, então nenhuma entrada tem cor. A conta do `visual:compare` (`scripts/lib/visual-seed.mjs`) grava VIOLET em Corte feminino, AMBER em Escova, EMERALD em Hidratação e SLATE em Corte masculino.
6. **Resumo do dia.** O A1 diz "Hoje, quinta 18" e "5 atendimentos · 1 bloqueio" (o compromisso pessoal não entra na contagem de bloqueios). O app usa `formatDate` e `daySummaryLabel` (`DayView.tsx`), que soma bloqueio e compromisso pessoal.
7. **Desktop.** O A1 desktop tem a lista e o painel de detalhe com "Selecione um atendimento para ver os detalhes". O app tem o mesmo painel (`DayDetailPanel`), com "Selecione um agendamento para ver os detalhes."
8. **O que o app não tem como dado.** A Agenda não lê holds: `occupancy.ts` não tem tipo de entrada para eles, e a conta de teste não cria nenhum. "lembrete enviado · sem resposta" depende das notificações de cada agendamento, que a lista não traz. O agendamento traz `presenceConfirmedAt`.
9. **Visualização padrão.** Com a preferência "Automática" (`resolveView`, `AgendaBoard.tsx`), o app abre em Dia abaixo de 1024 px e em Semana a partir dele. O vault (`01-Regras/02-Agenda-e-Agendamentos.md` e `03-UX-UI/02-Responsividade-Mobile-First.md`) e o `AGENTS.md` do frontend permitem Semana como padrão nas telas maiores. A nota do A1 diz "Visualização padrão no celular". A pessoa também escolhe a visualização inicial em Configurações › Agenda (Goal073).
10. **Dados da conta de teste.** O seed cria cinco atendimentos, um bloqueio e um compromisso pessoal só no dia de hoje, sem dias ocultos.

## Escolhas de desenho desta passada

**(a) A barra é a do A1, nas três visualizações.** Mês e ano do dia focado ("Setembro" e "2026", na tipografia do quadro) no lugar de `periodLabel`, os botões ‹ › redondos com os nomes acessíveis por unidade de D-089 ("Dia anterior", "Próxima semana" e afins) e o segmentado do quadro. O chevron ⌄ não entra, porque o calendário do A3 não existe no app: um ícone que não abre nada promete o que não há. O título acessível da página (`.agenda-page-title`) não muda. Semana e Mês ganham a barra nova sem outra mudança; o corpo delas é do 100.

**(b) Um só botão de criar, na posição do quadro.** Onde o quadro tem o botão flutuante (mobile e tablet, conferir as duas orientações nos quadros), o "+ Novo" vira o botão flutuante do A1, com nome acessível "Novo". Onde o quadro tem "Novo" na barra (desktop), fica na barra. É o mesmo `AgendaNewMenu`: mesmas capacidades, mesmo menu, Escape fecha e devolve o foco ao botão. O botão flutuante não cobre a última linha da lista nem a barra de abas.

**(c) "Exceções do dia" entra no menu de criar.** O botão solto sai. O menu ganha um quarto item, "Exceção do dia", depois de Bloqueio, para `/agenda/excecoes`, só com `manageAvailability`, como o botão de hoje. Revisa o item 3 de D-089: a tela de exceções continua alcançável a partir da Agenda, num toque a mais.

**(d) O cartão "Próximo agendamento" sai da Agenda.** Em Dia, Semana e Mês. A Home continua mostrando os próximos atendimentos. Revisa a última frase do item 2 de D-089. A leitura própria de 60 dias (`UPCOMING_WINDOW_DAYS`) sai de `AgendaBoard.tsx`; `nextActiveAppointment` sai de `occupancy.ts` se não sobrar consumidor.

**(e) O Dia vira a lista cronológica do A1.** Só o Dia: a Semana continua com `timeGrid.ts`. A lista mostra, em ordem de início, os atendimentos, bloqueios, compromissos pessoais e as entradas de exceção que o Dia já mostra hoje, com o desenho de cada tipo do quadro. O intervalo de serviço (`buffer`) não tem linha no quadro; ele continua visível como linha discreta, sem traço, logo depois do atendimento ("Intervalo · N min"), para a lista não esconder tempo ocupado. Cancelado continua fora. No dia de hoje, a marca da hora atual fica entre a última linha que já começou e a seguinte. O estado vazio, o motivo "Você não atende neste dia." e "Criar agendamento" (D-089, item 2) não mudam de regra, só de estilo.

**(f) A cor do serviço vem do catálogo.** A Agenda lê o catálogo (`getProductServices().serviceCatalog`) uma vez por carga e cruza `serviceId` com `colorToken`. O traço de 3 px tem a cor do serviço; com dois serviços, o traço é dividido; serviço sem cor, ou leitura do catálogo falhada, deixa o traço neutro, sem mensagem de erro e sem travar a lista. A paleta é a mesma de Serviços (mesmos tokens e mesmos valores de CSS); este Goal não renomeia cores (isso é do 095). A cor nunca é a única informação: o nome do serviço continua no texto. O helper de cor fica pronto para o 100 reaproveitar.

**(g) Texto de cada linha.** "Serviço · duração", com o preço formatado por D-099 quando o agendamento tem `totalPrice` e ainda não passou. A linha de observação aparece só com dado que já existe: "presença confirmada pelo lembrete" com `presenceConfirmedAt`. O estado segue o quadro: passado em cinza com ✓ e "Concluído", falta com "Não compareceu" em vermelho, ativo com "Confirmado". Os rótulos de estado vêm de `APPOINTMENT_STATUS_LABELS`/`statusLabel`; se um texto do quadro não estiver lá, o relatório diz qual e por quê.

**(h) Resumo e painel com os textos do quadro.** "Hoje, quinta 18" para hoje (e a data equivalente sem "Hoje" para outro dia), e a contagem com o compromisso pessoal fora dos bloqueios, como no quadro. O painel do desktop diz "Selecione um atendimento para ver os detalhes". Abaixo de 1024 px, tocar num atendimento abre `/agenda/agendamento?id=…`; a partir dele, seleciona para o painel; tocar num bloqueio ou compromisso, com `manageAvailability`, abre `OccurrenceActions`, como hoje.

**(i) A visualização padrão não muda.** "Automática" continua abrindo em Dia abaixo de 1024 px e em Semana a partir dele, e a preferência de Configurações › Agenda continua valendo. O vault e o `AGENTS.md` do frontend permitem Semana nas telas maiores, e a nota do A1 diz que Dia é o padrão no celular. A comparação do A1 no desktop clica "Dia", então não depende do padrão.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O aviso de WhatsApp desconectado e o cartão da IA da sidebar com "WhatsApp desconectado" (D-102), estado da conta de teste, como diz o `notes` do alvo.
3. O chevron ⌄ ao lado do ano, por (a).
4. A linha do hold "Em confirmação" e a observação "lembrete enviado · sem resposta", por falta do dado (evidência 8).
5. Os dados: a faixa da semana tem ponto só no dia semeado, o domingo aparece, e os nomes e horários são os da conta de teste.
6. O item "Exceção do dia" no menu de criar, por (c); o menu (A4) não é comparado neste Goal.

## Escopo obrigatório

### 1. O Dia igual ao A1

**Porte** o HTML/CSS do quadro. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Agenda.dc.html` ("Agenda · dia", mobile), `Agenda-Tablet.dc.html` ("Agenda / Agenda · dia / Portrait" e "… / Landscape") e `Agenda-Desktop.dc.html` ("Agenda / Agenda · dia / Desktop").

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, hachuras, tracejados, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target A1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual ao quadro A1 nos 4 devices**. Para cada device, o relatório final traz o diff final e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script.

### 2. Semana, Mês e o resto da área logada não quebram

Rode `npm run visual:compare -- --target A10,A11,H3` no início e no fim e cole o diff de cada device das duas execuções. A Semana e o Mês mudam só na barra e na saída do cartão; o relatório descreve, pelo `side-by-side.png`, que o corpo delas não quebrou. A Home (H3) não muda. A casca da área logada, os fluxos da Agenda (`/agenda/novo`, `/agenda/agendamento`, `/agenda/cancelar`, `/agenda/reagendar`, `/agenda/bloquear`, `/agenda/excecoes`) e as demais telas **não** mudam.

### 3. Comportamento preservado

- A troca de visualização preserva o dia focado, e ‹ › navegam por unidade, com os nomes acessíveis de D-089 (AG-05).
- A preferência de dias ocultos (D-086) continua valendo na faixa da semana; a preferência de visualização inicial continua valendo, e uma escolha manual continua vencendo a preferência que chega depois (`viewLockedRef`).
- O menu de criar mantém Agendamento (`/agenda/novo`), Compromisso pessoal (`/agenda/bloquear?type=PERSONAL`) e Bloqueio (`/agenda/bloquear?type=BLOCK`), cada um com a capacidade que já o regia; sem nenhuma capacidade, o botão não existe.
- O estado vazio, o motivo do dia sem atendimento e "Criar agendamento" seguem D-089, item 2.
- Cancelado não aparece; falta aparece; as ações de ciclo de vida e o histórico do painel do desktop não mudam.
- O gate autenticado continua achando a Agenda na data semeada (`ensureAgendaOnMeasuredDate`, `e2e/authenticated-matrix.spec.ts`), sem mudança nesse arquivo.

### 4. Provas novas

`apps/frontend/tests/goal092-agenda-dia.test.tsx`, no padrão de `goal069-agenda-structure.test.tsx` e `goal069-agenda-views.test.tsx`:

1. A barra mostra mês e ano do dia focado em Dia, Semana e Mês, sem a data completa, e mantém os nomes acessíveis de ‹ › por unidade.
2. O Dia é uma lista em ordem de início, com horário, nome, "serviço · duração" e estado em cada atendimento, e sem o eixo de horas da grade. Bloqueio e compromisso pessoal têm o texto do quadro; o intervalo aparece depois do atendimento.
3. A cor: o traço de um atendimento tem o token do serviço lido do catálogo; dois serviços dão traço dividido; serviço sem cor e catálogo falhado dão traço neutro, com a lista inteira na tela.
4. O resumo: "Hoje, …" no dia de hoje, e a contagem com o compromisso pessoal fora dos bloqueios.
5. "Próximo agendamento" não aparece em Dia, Semana nem Mês.
6. O menu de criar tem "Exceção do dia" para `/agenda/excecoes` só com `manageAvailability`, junto dos outros três itens com as capacidades de sempre; o botão solto "Exceções do dia" não existe; Escape fecha o menu e devolve o foco ao botão.
7. A partir de 1024 px, tocar num atendimento seleciona para o painel, que abre com "Selecione um atendimento para ver os detalhes"; abaixo dele, o atendimento é um link para `/agenda/agendamento?id=…`.

As provas 1 a 7 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa da grade do Dia, do texto da barra, do cartão "Próximo agendamento" ou do botão solto "Exceções do dia" — por exemplo, em `goal016-agenda-reachability`, `goal016-agenda-views`, `goal069-agenda-structure`, `goal069-agenda-views` e `goal073-agenda-visualizacao`. O teste do §6.7 de `goal069-agenda-views` ("Próximo agendamento" relativo a agora) é reescrito para a regra nova, não removido. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O cruzamento com o catálogo é ignorado (todo traço neutro): a prova 3 reprova.
2. A lista do Dia é ordenada pelo nome, não pelo início: a prova 2 reprova.
3. "Exceção do dia" sai do menu: a prova 6 reprova.
4. O cartão "Próximo agendamento" volta em Semana: a prova 5 reprova.

## Pontos de implementação

- `apps/frontend/src/features/agenda/AgendaBoard.tsx`: barra, botão de criar, menu, saída do cartão e da leitura de 60 dias, leitura do catálogo, painel.
- `apps/frontend/src/features/agenda/DayView.tsx`: a lista, o resumo e a faixa da semana.
- `apps/frontend/src/features/agenda/occupancy.ts` e um arquivo novo de cor de serviço em `features/agenda/`, se preciso. `timeGrid.ts`, `WeekView.tsx` e `MonthView.tsx` não mudam, salvo o que a barra comum exigir.
- `apps/frontend/src/shared/styles/atendly-agenda.css`; `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/routes.ts`, só se um `contentMarker` depender de texto trocado, com o motivo no relatório.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- O corpo da Semana e do Mês (A10, A11), que é do Goal100.
- A2, A3, A4, A7 e A12: calendário de navegação, menu como sheet, conflito e dias visíveis. O menu de criar continua com o desenho atual.
- Os fluxos da Agenda (A5, A6, A8, A9), que são do 093, e Serviços (S1), que é do 095.
- Ler holds ou notificações na lista; mudar a visualização padrão; mudar a preferência de Configurações › Agenda.
- Qualquer mudança em rota, contrato, BFF, `scripts/` (inclusive o seed visual), `docs/design-reference/`, vault e `e2e/visual/targets.json`. Mude o mapa só se um alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-108** em `PROPOSED`, no formato de D-106 e D-107. Ela diz (a) a (i), com o motivo de cada um, e as divergências declaradas. Ela registra que (c) revisa o item 3 de D-089, que (d) revisa a última frase do item 2 de D-089, e que (e) troca a grade do Dia pela lista que o vault pede. Não reescreve D-089. O "Revisar se" cobre quatro casos: o Goal100 mudar a barra comum; um Goal portar o A3 (o chevron volta); a Agenda passar a ler holds ou notificações na lista; o produto pedir de volta o cartão "Próximo agendamento" na Agenda.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que o Dia segue o A1 e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim (A1, A10, A11 e H3).
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita (D-086, D-089, D-098, D-099, D-101, D-102, D-103) não é reescrita.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target A1,A10,A11,H3` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target A1`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target A1,A10,A11,H3`.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

No relatório, para cada device do A1, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target A1` e abriu os quatro `side-by-side.png`. O Dia está **igual ao quadro A1 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das declaradas.
2. Semana, Mês e Home não quebraram (A10, A11 e H3 do início e do fim, com o que mudou descrito); toda piora tem causa medida.
3. As provas 1 a 7 passam e reprovaram na baseline, salvo asserção declarada. Os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado: `validate:ui` nas cinco larguras, com **0** retentativas. O gate autenticado, dentro de `validate:integration`, mantém os **245** testes da baseline e **0** retentativas; o botão flutuante e as linhas da lista passam no alvo de toque de 24 px.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. D-108 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o corpo da Semana e do Mês (Goal100); o hold e o lembrete sem resposta na lista; o menu de criar como sheet (A4).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e comparação da baseline (A1, A10, A11, H3); barra comum, botão de criar na posição do quadro, "Exceção do dia" no menu, saída do cartão e cor de serviço lida do catálogo |
| WU-02 | STANDARD | WU-01 | Dia como lista cronológica do A1, com resumo, hora atual e painel do desktop, iterando com `visual:compare -- --target A1` |
| WU-03 | STANDARD | WU-02 | Provas 1 a 7 com o vermelho da baseline; asserções do §5 |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal092-agenda-dia` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
