# Goal 100 — Agenda Semana e Mês iguais ao protótipo

**Status: READY.** Preparado em 2026-10-02 pelo Tech Lead Agent após [Goal092 ACCEPTED](../reviews/092-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: A10, A11

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v120 (PLANNED), dividida do 092, com os quadros A10 e A11. **READY na v121**, com o mesmo ID, título e quadros.

## Baseline aceita

Baseline aceita: `cba8d4918b8eb33a1e6ac82960ccd0a0e6e0e35a`

Goal anterior: 092 — Agenda Dia igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal092 já integrado em `main` (origem `83269a458253c193eaac73cc4310427cd7ec94b1`). **Duas rodadas**, com 5 e 0 blockers. **D-108** aceita. A virada de status do documento do Goal092 para `ACCEPTED` entrou no próprio commit de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/agenda` em Semana igual ao quadro A10 e em Mês igual ao quadro A11, nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`: os alvos A10 e A11 abrem `/agenda` com o relógio em 13:45 e clicam "Semana" e "Mês".

**Por que agora.** O 092 deixou prontos a barra comum, o botão de criar e a cor de serviço lida do catálogo (`serviceColorMap` e `appointmentServiceColors` em `occupancy.ts`). No fim do 092, o `side-by-side.png` do A10 e do A11 mostra que só o corpo de `WeekView.tsx` e `MonthView.tsx` ainda difere do quadro. O 093 (fluxos da Agenda) fica depois deste, na mesma área, para não haver dois Goals mexendo em `features/agenda/` ao mesmo tempo.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`, quadros "Agenda · semana" e "Agenda · mês"), no vault e no código da baseline. O `visual:compare` de A10 e A11 no fim do 092 (VALIDATION_GATE, seção do Goal092, execução E5) deu **12,9 / 5,1 / 5,5 / 4,6** e **12,9 / 6,9 / 7,8 / 6,3**. O Developer mede de novo na baseline.

1. **Semana (A10).** A nota do quadro diz: "Não é uma grade comprimida com texto ilegível: é um mapa. Cada barra é um atendimento na posição e duração reais, na cor do serviço; áreas rebaixadas são fora do horário; hachura é bloqueio; contorno é compromisso; tracejado é hold. Tocar num dia abre o Dia; o resumo embaixo dá os nomes." Abaixo da barra: a pílula de dias visíveis (ícone de olho e "Seg–Sáb"), a linha "15 – 20 de setembro" com "31 atendimentos" à direita, o eixo "8h…20h" a cada duas horas, a coluna de cada dia com "SEG" e o número, as barras sem texto no mobile (dois serviços dão barra dividida), a legenda de serviços com bolinha de cor e o cartão de resumo do dia. No desktop, cada barra tem o nome e "● Serviço", e a legenda ganha "Sem cor definida".
2. **Mês (A11).** A nota do quadro diz: "Sem etiquetas com texto cortado: cada atendimento é um traço empilhado — a pilha diz quão cheio está o dia e as cores dizem de quê. "+2" quando não cabe. Dia 28 é um bloqueio de dia inteiro. Tocar num dia seleciona e mostra o resumo; tocar de novo abre o Dia." No mobile, cada célula tem o número e traços de 3 px na cor do serviço (bloqueio hachurado de 4 px), com "+N". No desktop, cada célula tem até duas ou três linhas "Nome · ● Serviço" e "+N". A pílula "Seg–Sáb" e o cartão de resumo aparecem também.
3. **Resumo do dia (A10 e A11).** Cartão com "Hoje, quinta 18 · 5 atendimentos", "Abrir dia ›" em `#0F5F63`, e pílulas por serviço com a bolinha de cor e a contagem ("Escova ×2", "Corte feminino", …), "· em confirmação" para hold e "+ almoço · dentista" para bloqueio e compromisso pessoal.
4. **O app hoje.** `WeekView.tsx` é a grade de horas de `timeGrid.ts` (72 px por hora, eixo "07:00"), com cartões que mostram horário, tipo, nome, "serviço · duração" e estado em todas as larguras; não tem cor de serviço, legenda, contagem da semana nem resumo. O cabeçalho de cada dia é um botão que abre o Dia. `MonthView.tsx` mostra até três chips com ícone e título por dia e "+N", sem cor; o toque chama `selectDay` (`AgendaBoard.tsx`), que abre o Dia no primeiro toque. `MonthView` já aceita `selectedDate` e marca `aria-pressed`.
5. **Dias visíveis.** No quadro, a pílula "Seg–Sáb" abre o A12 (sheet de dias visíveis), que o app não tem. No app, os dias ocultos moram em Configurações › Agenda, "Como você vê a Agenda" (`/configuracoes/agenda`, D-086, item 5), e `WeekView` e `MonthView` já recebem `hiddenWeekdays`. O vault (`03-UX-UI/04-Especificacao-das-Telas.md`, "Personalização dos dias visíveis") pede a possibilidade de voltar a mostrar qualquer dia.
6. **Fora do horário.** A Agenda já lê `settings.availability.rules` (`AgendaBoard.tsx`), hoje só para saber em que dia da semana o negócio atende; cada regra tem `startTime` e `endTime`.
7. **Holds e notificações.** Como no 092, a Agenda não lê holds (D-108, divergência 4), e a conta de teste não cria nenhum.
8. **Dados da conta de teste.** O seed (`scripts/lib/visual-seed.mjs`) cria cinco atendimentos, um bloqueio e um compromisso pessoal só no dia de hoje, com VIOLET em Corte feminino, AMBER em Escova, EMERALD em Hidratação e SLATE em Corte masculino. A Semana e o Mês do app terão dados num só dia; os quadros têm a semana e o mês cheios.

## Escolhas de desenho desta passada

**(a) A barra não muda.** A barra, o segmentado, ‹ ›, o botão de criar e o menu são os de D-108 (a) a (c). Mudar a barra reabre D-108 (a); se o porte exigir, o relatório diz por quê e D-109 registra.

**(b) A Semana é o mapa do A10.** Porte o quadro: eixo de horas, colunas por dia visível, barras na posição e duração reais (a mecânica de `entryPlacement` pode continuar, com a escala do quadro), traço da cor do serviço por `appointmentServiceColors` (dois serviços dão barra dividida), bloqueio hachurado, compromisso pessoal só com contorno, e as horas fora do horário de atendimento daquele dia da semana rebaixadas, a partir de `availability.rules`. Sem regra para o dia, ou leitura falhada, nada fica rebaixado. Onde o quadro mostra a barra sem texto (mobile e tablet, conferir as duas orientações), a barra não tem texto visível, mas o nome acessível de D-089, item 2 (`${typeLabel}: ` mais nome, serviço, horário e estado), continua. Onde o quadro mostra nome e serviço (desktop), a barra os mostra.

**(c) Linha da semana e legenda.** "15 – 20 de setembro" é o intervalo dos dias visíveis da semana focada, e "N atendimentos" conta os atendimentos não cancelados desses dias. A legenda lista os serviços do catálogo que aparecem na semana, com a bolinha da cor; serviço sem cor entra como "Sem cor definida" onde o quadro mostra essa linha. A cor nunca é a única informação.

**(d) O Mês é o A11.** Porte o quadro: traços empilhados na cor do serviço onde o quadro os tem, linhas "Nome · ● Serviço" onde o quadro as tem, "+N" quando não cabe, bloqueio hachurado. Cancelado e intervalo (`buffer`) não entram, como hoje.

**(e) No Mês, o primeiro toque seleciona e o segundo abre o Dia.** O primeiro toque num dia marca a célula (`aria-pressed`, que já existe) e mostra o resumo desse dia; o segundo toque no mesmo dia, ou "Abrir dia", abre o Dia. Teclado: Enter e Espaço seguem a mesma regra. A seleção começa no dia focado. Muda só o Mês: na Semana, tocar num dia continua abrindo o Dia, como diz a nota do A10.

**(f) O resumo do dia, em Semana e Mês.** Cartão do quadro com "Hoje, quinta 18" (a data equivalente sem "Hoje" para outro dia) e "N atendimentos", pílulas por serviço com a cor e "×N" quando há mais de um, e uma linha com os títulos de bloqueio e compromisso pessoal ("+ almoço · dentista"), sem "em confirmação" enquanto a Agenda não ler holds. "Abrir dia" abre o Dia na data do resumo. Dia sem atendimento mostra o resumo vazio com o texto de D-089, item 2, e o motivo "Você não atende neste dia." quando for o caso. A Semana resume o dia focado; o Mês, o dia selecionado.

**(g) A pílula de dias visíveis é um link para Configurações › Agenda.** O texto vem de `hiddenWeekdays` ("Seg–Sáb" com domingo oculto, "Todos os dias" sem nenhum oculto, e os dias por extenso curto quando não formam intervalo). O destino é `/configuracoes/agenda`, onde a preferência mora. O A12 (sheet) não é portado. **Motivo:** a pílula sem ação prometeria o que não há (o mesmo motivo do chevron em D-108 (a)), e o vault pede voltar a mostrar qualquer dia; o link mantém a capacidade num toque.

**(h) A visualização padrão não muda.** "Automática", a preferência de Configurações › Agenda e `viewLockedRef` seguem D-108 (i).

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O aviso de WhatsApp desconectado, o cartão da IA da sidebar com "WhatsApp desconectado" e o item "Notificações" da sidebar (D-102), estado da conta de teste.
3. O chevron ⌄ ao lado do ano (D-108 (a)).
4. O hold tracejado e "· em confirmação" no resumo, por falta do dado.
5. Os dados: a conta de teste só tem entradas no dia de hoje, então a Semana e o Mês do app têm um só dia preenchido, com outros nomes, horários, contagens e mês.
6. Os valores de cor: a paleta é a de Serviços (D-108 (f)); renomear e reajustar cores é do 095.
7. A pílula de dias visíveis leva a Configurações › Agenda, e não ao A12, por (g).

## Escopo obrigatório

### 1. A Semana igual ao A10 e o Mês igual ao A11

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Agenda.dc.html` ("Agenda · semana" e "Agenda · mês", mobile), `Agenda-Tablet.dc.html` ("Agenda / Agenda · semana / Portrait" e "… / Landscape", idem para "mês") e `Agenda-Desktop.dc.html` ("Agenda / Agenda · semana / Desktop" e "Agenda / Agenda · mês / Desktop").

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, hachuras, tracejados, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target A10,A11` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual ao quadro A10 e ao quadro A11 nos 4 devices**. Para cada device, o relatório final traz o diff final e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script.

### 2. O Dia e o resto da área logada não quebram

Rode `npm run visual:compare -- --target A1,H3` no início e no fim e cole o diff de cada device das duas execuções. O Dia (A1, baseline 10,4 / 4,8 / 5,4 / 4,3) e a Home (H3) não pioram; toda piora tem causa medida. A casca, os fluxos da Agenda (`/agenda/novo`, `/agenda/agendamento`, `/agenda/cancelar`, `/agenda/reagendar`, `/agenda/bloquear`, `/agenda/excecoes`) e as demais telas **não** mudam.

### 3. Comportamento preservado

- A troca de visualização preserva o dia focado, e ‹ › navegam por unidade, com os nomes acessíveis de D-089.
- Os dias ocultos (D-086) continuam escondendo colunas na Semana e no Mês, e o espaço é redistribuído entre os dias visíveis.
- Na Semana, tocar num dia abre o Dia; o nome acessível de cada barra continua com o tipo como prefixo (D-089, item 2).
- Cancelado não aparece; falta aparece; o intervalo não aparece no Mês.
- O menu de criar, a visualização inicial e `viewLockedRef` seguem D-108.
- O gate autenticado continua achando a Agenda na data semeada (`ensureAgendaOnMeasuredDate`, `e2e/authenticated-matrix.spec.ts`), sem mudança nesse arquivo. Se ele depender de um toque no Mês que agora só seleciona, o relatório mede e declara, sem editar o arquivo.

### 4. Provas novas

`apps/frontend/tests/goal100-agenda-semana-mes.test.tsx`, no padrão de `goal092-agenda-dia.test.tsx`:

1. Semana: cada atendimento tem o token do serviço lido do catálogo, dois serviços dão barra dividida, serviço sem cor e catálogo falhado dão barra neutra; bloqueio e compromisso pessoal mantêm as classes de tipo e o nome acessível com o prefixo de tipo.
2. Semana: as horas fora do horário de atendimento do dia da semana ficam marcadas a partir de `availability.rules`; sem regra, ou leitura falhada, nada fica marcado.
3. Semana: a linha do intervalo dos dias visíveis com a contagem de atendimentos não cancelados, e a legenda só com os serviços que aparecem na semana.
4. Mês: cada dia mostra um traço por entrada com o token do serviço, "+N" quando passa do limite do quadro, e sem cancelado nem intervalo.
5. Mês: o primeiro toque num dia o seleciona (`aria-pressed`) e mostra o resumo dele sem trocar de visualização; o segundo toque no mesmo dia abre o Dia; "Abrir dia" abre o Dia na data do resumo.
6. Resumo: "Hoje, …" no dia de hoje, "N atendimentos", pílula por serviço com "×N" quando repete, e os títulos de bloqueio e compromisso pessoal na linha própria.
7. A pílula de dias visíveis tem o texto derivado de `hiddenWeekdays` ("Seg–Sáb" com domingo oculto, "Todos os dias" sem ocultos) e leva a `/configuracoes/agenda`.

As provas 1 a 7 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa do texto ou da estrutura antiga dos cartões da Semana, dos chips do Mês, ou do Mês abrir o Dia no primeiro toque — por exemplo, em `goal016-agenda-views`, `goal016-agenda-reachability`, `goal069-agenda-structure`, `goal069-agenda-views`, `goal069-hidden-days-limit`, `goal073-agenda-visualizacao` e `goal092-agenda-dia`. Asserção sobre o Mês abrir o Dia é reescrita para a regra de (e), não removida. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A Semana ignora a cor do catálogo (toda barra neutra): a prova 1 reprova.
2. O Mês volta a abrir o Dia no primeiro toque: a prova 5 reprova.
3. A contagem da semana passa a incluir cancelados: a prova 3 reprova.
4. A pílula ignora `hiddenWeekdays` (texto fixo): a prova 7 reprova.

## Pontos de implementação

- `apps/frontend/src/features/agenda/WeekView.tsx` e `MonthView.tsx`: o corpo de cada visualização.
- Um componente novo de resumo do dia em `features/agenda/` (por exemplo `DaySummaryCard.tsx`), usado por Semana e Mês.
- `apps/frontend/src/features/agenda/AgendaBoard.tsx`: repassar cores, regras de horário, dia selecionado do Mês e a pílula; sem mudar a barra.
- `apps/frontend/src/features/agenda/occupancy.ts` e `timeGrid.ts`, só no que o porte exigir, sem mudar o Dia.
- `apps/frontend/src/shared/styles/atendly-agenda.css`; `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- Ícones que faltarem (o olho da pílula), em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/routes.ts`, só se um `contentMarker` depender de texto trocado, com o motivo no relatório.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- O Dia (A1), salvo o que o componente de resumo compartilhar sem mudar a tela.
- A2, A3, A4, A7 e A12: dia vazio do quadro, calendário de navegação, menu como sheet, conflito e a sheet de dias visíveis.
- Os fluxos da Agenda (A5, A6, A8, A9), que são do 093; Serviços e nomes de cor, que são do 095.
- Filtros por status ou serviço na Semana; ler holds ou notificações; mudar a visualização padrão ou a preferência de Configurações › Agenda.
- Qualquer mudança em rota, contrato, BFF, `scripts/` (inclusive o seed visual), `docs/design-reference/`, vault e `e2e/visual/targets.json`. Mude o mapa só se um alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-109** em `PROPOSED`, no formato de D-107 e D-108. Ela diz (a) a (h), com o motivo de cada um, e as divergências declaradas. Ela registra que (e) muda o toque no Mês e que (g) liga a pílula a Configurações › Agenda. Não reescreve D-086, D-089 nem D-108. O "Revisar se" cobre três casos: um Goal portar o A12 (a pílula passa a abrir a sheet); a Agenda passar a ler holds (o tracejado e "em confirmação" entram); o produto pedir filtros por status ou serviço na Semana.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que Semana e Mês seguem A10 e A11 e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim (A10, A11, A1 e H3).
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita (D-086, D-089, D-099, D-102, D-108) não é reescrita.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target A10,A11,A1,H3` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target A10,A11`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target A10,A11,A1,H3`.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

No relatório, para cada device do A10 e do A11, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target A10,A11` e abriu os oito `side-by-side.png`. A Semana está **igual ao quadro A10 nos 4 devices** e o Mês está **igual ao quadro A11 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das declaradas.
2. O Dia e a Home não quebraram (A1 e H3 do início e do fim, com o que mudou descrito); toda piora tem causa medida.
3. As provas 1 a 7 passam e reprovaram na baseline, salvo asserção declarada. Os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado: `validate:ui` nas cinco larguras, com **0** retentativas. O gate autenticado, dentro de `validate:integration`, mantém os **245** testes da baseline e **0** retentativas; as células do Mês, a pílula, "Abrir dia" e as barras tocáveis da Semana passam no alvo de toque de 24 px. Retentativa em rota fora da Agenda é medida e reportada com a causa, não tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. D-109 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; a Semana e o Mês com semana e mês cheios, que a conta de teste não tem; o hold na Semana e no resumo; a sheet de dias visíveis (A12).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline (A10, A11, A1, H3); componente de resumo do dia e pílula de dias visíveis; a Semana como mapa do A10, com cor, fora do horário, linha da semana e legenda |
| WU-02 | STANDARD | WU-01 | O Mês como o A11, com traços ou linhas por largura, "+N", seleção no primeiro toque e resumo, iterando com `visual:compare -- --target A10,A11` |
| WU-03 | STANDARD | WU-02 | Provas 1 a 7 com o vermelho da baseline; asserções do §5 |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal100-agenda-semana-mes` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
