# Goal 097 — Configurações iguais ao protótipo: hub, Negócio e Agenda

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal096 ACCEPTED](../reviews/096-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: M1, N1, AG1, AG3

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED) como "097 — Configurações iguais ao protótipo", a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01), com os quadros M1, N1, AG1, AG3, IA1, W1, I1, I2, R1 e Mais-WhatsApp:C1, mais o 2.I1 desde a v117. **READY na v128**, com o mesmo ID e o título precisado. **O 097 foi dividido na v128:** fica com o hub, Negócio e Agenda (M1, N1, AG1, AG3). IA, WhatsApp, Conversas e Conta (IA1, W1, R1, Mais-WhatsApp:C1) vão para o **104**, e Importação (I1, I2, 2.I1) vai para o **105**, ambos PLANNED. O motivo está na evidência 1 abaixo.

## Baseline aceita

Baseline aceita: `4735b21f026454dd8bf1d3a1e589c9c738cf8f09`

Goal anterior: 096 — Conversas e Notificações iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal096 já integrado em `main` (origem `dc156ad7309d99d181b929cd7843e56326d84baa`). **Três rodadas**, com 1, 2 e 0 blockers. **D-115** aceita. A virada de status do documento do Goal096 para `ACCEPTED` entrou no próprio commit de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o hub de Configurações igual ao quadro M1, Negócio igual ao N1, Configurações › Agenda igual ao AG1, e as regras de horário numa tela própria igual ao AG3, nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768).

**Por que agora.** Conversas e Notificações fecharam no 096. Na ordem da v113, o próximo módulo é Configurações, o último da área logada antes da troca de nome (102). A casca (087), a composição lista e detalhe (088, D-103) e as regras de oferta, a política de cancelamento e "Como você vê a Agenda" (067 e 073, D-085 e D-086) já existem de ponta a ponta. Falta a forma do quadro. Nada deste Goal exige contrato, BFF, Scheduling ou IA novos.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Mais-Negocio-Agenda-IA.dc.html`, `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html`), no código da baseline, em `apps/frontend/e2e/routes.ts`, em `apps/frontend/e2e/visual/targets.json` e nos reviews 095 e 096.

1. **O 097 da v113 era grande demais para um Goal.** Ele tinha onze quadros em dois arquivos do protótipo, cada um em quatro devices. O 095 levou quatro rodadas com quatro quadros, e o 096 levou três rodadas com dois. Os onze quadros também mudam coisas diferentes: o hub muda de estrutura, as regras de horário ganham tela, a IA do IA1 leva o conhecimento para Negócio, e o 2.I1 precisa de uma conta que escolheu importar, que a conta de onboarding do `visual:compare` não tem. Este Goal fica com os quatro quadros de `Mais-Negocio-Agenda-IA.dc.html` que formam um conjunto: o hub, que no desktop já mostra o Negócio ao lado, e a Agenda com a sua tela de regras.
2. **M1 (hub).** No topo, um bloco de identidade: avatar com as iniciais do negócio, o nome, "segmento · local" e o estado da IA. Abaixo, três grupos com título: **Atendimento** (Serviços, IA, WhatsApp), **Seu negócio** (Negócio, Agenda) e **Dados e conta** (Importação, Conversas, Conta). Cada linha mostra o estado atual na segunda linha: "6 ativos · 1 precisa de revisão" (a revisão em âmbar), "Ativa · estilo Equilibrada", "+55 11 98765-4321 · conectado", "Endereço, pagamento, informações para a IA", "Horários, lembretes, regras de agendamento", "Concluída em 18/09 · Minha Agenda", "Guardar por 90 dias · pessoais por 30" e o e-mail da conta. A linha Serviços aparece no mobile, no tablet em retrato e no tablet em paisagem, e **não** no desktop, onde a sidebar já tem Serviços. O título é "Mais" no mobile e no tablet em retrato e "Configurações" no tablet em paisagem e no desktop. O app (`SettingsHub.tsx`) mostra uma grade de cartões sem grupos, sem bloco de identidade e sem Serviços, com "Disponibilidade" como cartão próprio, "Atendente virtual" no lugar de "IA" e textos fixos ("Conexão e recuperação da sessão", "Traga dados do Minha Agenda", "Prazo de retenção das mensagens", "Senha e acesso").
3. **O quinto item da barra inferior continua sendo o diálogo "Mais".** D-101 (b) decidiu que o quinto item abre o diálogo "Mais" de hoje, com os mesmos destinos e "Sair". O M1 do protótipo é a tela que esse item abre. Mudar isso muda a casca e o gate autenticado, e não há evidência nova para reabrir D-101. Por isso o M1 é comparado em `/configuracoes`, como `targets.json` já faz, e o título "Mais" do quadro fica como divergência declarada.
4. **N1 (Negócio).** O 088 já portou as linhas do N1 (`BusinessSummary` em `BusinessSettings.tsx`): Identidade, Endereço e chegada, Pagamento, Presença e "O que a IA sabe responder", com "Não informado" e o editor que abre pela linha. Falta o acabamento visual. O quadro tem "Adicionar" ao lado de "Não informado" em Estacionamento e Acessibilidade, mas esses campos não existem no modelo do negócio. Um botão sem efeito é item morto (D-085 item 6). As linhas "Perguntas frequentes" e "Outras informações" mostram "Não informado" mesmo quando o conhecimento existe, porque ele é editado hoje em Configurações › IA. Onde o conhecimento mora é escolha do IA1, que fica no 104.
5. **AG1 (Agenda).** Linhas em três blocos e uma nota:
   - **Quando você atende:** "Dias e horários" ("Seg–Sex 09:00–18:00 · Sáb 09:00–14:00") e "Bloqueios que se repetem".
   - **Como a IA oferece horários:** "Antecedência e intervalos" ("Mín. 2 h · máx. 60 dias · a cada 30 min"), "Cancelamento e remarcação" ("Sem restrição de antecedência") e "Lembretes" ("1 lembrete · 24 h antes · pede confirmação").
   - **Como você vê a Agenda:** "Dias visíveis" ("Seg–Sáb · domingo oculto") e "Visualização inicial" ("Dia").
   - A nota: "Ocultar um dia só muda o que você vê. Para não atender em um dia, ajuste em Dias e horários."

   O app (`CalendarSettings.tsx`) mostra os formulários inteiros na própria tela: as três regras de oferta com o seu botão, a política com o seu botão, "Como você vê a Agenda" com o seu botão e `ReminderSettingsSection` no fim. "Dias e horários" é a rota `/configuracoes/disponibilidade` (D-085 item 2), que hoje só se alcança pelo hub e pelo diálogo "Mais". "Bloqueios que se repetem" não tem tela em Configurações: bloqueios e compromissos recorrentes são criados na Agenda (`BlockSeriesForm.tsx`).
6. **AG3 (regras de horário).** Tela empurrada com o título "Antecedência e intervalos" e o voltar. Três perguntas com opções segmentadas: "Com quanta antecedência a IA pode marcar" (1 h, 2 h, 4 h, 1 dia), "Até quando no futuro" (30, 60, 90 dias) e "Intervalo entre horários oferecidos" (15 min, 30 min, 1 h). Abaixo, um bloco "Na prática · agora são 13:45" com os horários de exemplo: 14:00 e 15:30 riscados, 16:00, 16:30 e 17:00 em pílula, e "…". A legenda diz: "Só a partir de 15:45, em passos de 30 min. A IA mostra até três opções por vez." Depois vem "Cancelar ou remarcar pelo WhatsApp", com Sem restrição, Até 12 h antes, Até 24 h antes e Até 48 h antes, e o texto "Com restrição, fora do prazo a IA explica a regra e oferece falar com você. Pela Agenda, você sempre pode cancelar ou remarcar." Há **um** botão "Salvar". O "até três opções" é verdadeiro: `DEFAULT_MAX_SLOTS = 3` em `apps/ai-orchestrator/src/modules/scheduling-service/client.ts`. No desktop, o AG3 fica à direita da lista do hub, como as outras seções (D-103). O app não tem essa tela: `targets.json` aponta o AG3 para `/configuracoes/agenda`, com a nota "O app não tem tela própria para estas regras". D-086 item 4 deu um botão a cada painel ("Regras de oferta salvas." e "Política salva.").
7. **Gate.** `/configuracoes`, `/configuracoes/agenda` e `/configuracoes/disponibilidade` estão em `AUTHENTICATED_ROUTES`, com os `contentMarker` "Configurações", "Agenda" e "Disponibilidade". O gate cria um teste por rota e por largura (`for (const route of AUTHENTICATED_ROUTES)` em `authenticated-matrix.spec.ts`). Uma rota nova acrescenta **cinco** testes. O teste de lista e detalhe de Configurações clica `a[href="/configuracoes/negocio"]` e volta para `/configuracoes`.

## Escolhas de desenho desta passada

**(a) O hub do M1.** Porte o bloco de identidade e os três grupos, em `/configuracoes` (abaixo de 1024 px) e na lista da esquerda de 1024 px em diante (`SettingsHubPanel`, D-103). As linhas, na ordem do quadro:
- **Atendimento:** Serviços (`/servicos`), IA (`/configuracoes/ia`) e WhatsApp (`/configuracoes/whatsapp`).
- **Seu negócio:** Negócio (`/configuracoes/negocio`) e Agenda (`/configuracoes/agenda`).
- **Dados e conta:** Importação (`/importacao`), Conversas (`/configuracoes/conversas`) e Conta (`/configuracoes/conta`).

O cartão "Disponibilidade" sai do hub, porque a disponibilidade passa a ser a linha "Dias e horários" do AG1. Ela continua no diálogo "Mais" (D-085 item 6), que não muda. A linha IA se chama "IA", como no quadro. O título da tela e da tela de Configurações › IA não muda.

A linha Serviços existe abaixo de 1100 px e some a partir dele, a mesma largura em que a sidebar aparece (D-101 (a)). Esconda a linha pela mesma regra de largura da casca. Não crie uma segunda constante de largura.

**(b) O estado em cada linha, só com dado verdadeiro.** A segunda linha de cada item vem de uma leitura que o app já faz, sem rota nova:
- Serviços: "N ativos", mais " · M precisa(m) de revisão" em âmbar quando M > 0, pela lista de `serviceCatalog.list` e a mesma regra de `needsReview` dos grupos da lista de Serviços (D-091).
- IA: o estado de `aiStatusView` mais "estilo" e `toneLabel`.
- WhatsApp: "conectado" com o número, quando o status é `active` e o número é conhecido. "Desconectado" quando é `off`. Nada quando é `unknown` ou `loading`.
- Negócio e Agenda: os textos fixos do quadro.
- Importação: "Concluída em dd/mm · Minha Agenda" quando `migration.getImportState` diz que há importação concluída. Caso contrário, o texto da tela de importação para o estado lido.
- Conversas: os prazos de `retention.get`, no formato do quadro.
- Conta: o e-mail da sessão, o mesmo dado que a conta da sidebar usa (D-101 (e)).

O bloco de identidade usa as iniciais do nome do negócio, o nome, e o segmento e o endereço gravados, numa linha com reticências. O estado da IA usa as mesmas palavras do cartão da IA da sidebar (`aiCardView`, D-102). O ponto que respira não anima com `prefers-reduced-motion: reduce`.

**Leitura que falha ou ainda carrega deixa a linha sem a segunda linha.** Nunca há valor inventado ("0 ativos"), e nunca há erro que bloqueie o hub. O hub abre com o que `settings.get` já traz, como hoje.

**(c) N1: só o acabamento.** A composição e o comportamento de `BusinessSettings` não mudam. Porte o que ainda difere do quadro: tipografia, espaçamentos, divisores, chevrons e o tom de "Não informado". "Adicionar" não entra, porque não há campo para gravar (evidência 4). As linhas do conhecimento continuam como estão até o 104.

**(d) AG1: linhas em vez de formulários.** `/configuracoes/agenda` passa a ser a lista do quadro:
- **"Dias e horários"** é link para `/configuracoes/disponibilidade`. Ela aparece nas mesmas condições em que o hub mostrava o cartão "Disponibilidade". A segunda linha é o resumo da grade lida em `settings.availability`, por uma função pura nova. A função agrupa dias seguidos com os mesmos intervalos ("Seg–Sex 09:00–18:00 · Sáb 09:00–14:00"), junta mais de um intervalo no mesmo dia e diz "Nenhum dia de atendimento" quando não há regra ativa.
- **"Bloqueios que se repetem"** não entra (divergência declarada 4).
- **"Antecedência e intervalos"** e **"Cancelamento e remarcação"** são links para `/configuracoes/agenda/regras`. Os resumos seguem o quadro, e o valor gravado fora das opções usa a mesma frase da opção extra de hoje.
- **"Lembretes"** é link para `/configuracoes/agenda/lembretes`. A segunda linha resume a leitura de `settings.getReminders`.
- **"Dias visíveis"** e **"Visualização inicial"** abrem, cada uma, um `Dialog` `variant="sheet"` com o controle de hoje e "Salvar". O pedido continua `PATCH /v1/settings/agenda-view`, com a mesma validação (pelo menos um dia visível) e a mesma regra de leitura falhada, que impede salvar (D-086 item 6). Os resumos são, por exemplo, "Seg–Sáb · domingo oculto", "Todos os dias", "Dia", "Semana", "Mês" e "Automática".
- **A nota do quadro** fica no fim, com "Dias e horários" como link para `/configuracoes/disponibilidade` quando essa rota se aplica.

As regras das telas não mudam. Mudam só a tela em que cada controle mora e, no AG3, o botão que grava.

**(e) AG3: tela própria em `/configuracoes/agenda/regras`.** Rota nova, tela empurrada com o título "Antecedência e intervalos" e o voltar para `/configuracoes/agenda`.
- As três perguntas são grupos segmentados, com semântica de grupo de rádio e nome acessível em cada grupo. As opções são as de D-085 item 1. O valor gravado fora delas aparece selecionado como opção extra, como hoje.
- **"Na prática · agora são HH:MM"** vem de uma função pura nova, que recebe o instante atual, o fuso do negócio, a antecedência e o intervalo **escolhidos na tela, ainda não salvos**. Ela devolve:
  - riscados: o primeiro horário do passo depois de agora e o último antes do limite, quando são diferentes e anteriores ao limite;
  - em pílula: os três primeiros horários do passo a partir do limite;
  - a legenda "Só a partir de HH:MM, em passos de N min. A IA mostra até três opções por vez.";
  - quando o limite cai em outro dia, a legenda diz o dia ("amanhã" ou a data), e os horários são os desse dia.

  O bloco é ilustrativo. Ele não lê a agenda nem a disponibilidade, e o texto não diz que esses horários estão livres. Com 13:45, 2 h e 30 min, o resultado é o do quadro: 14:00 e 15:30 riscados, 16:00, 16:30 e 17:00 em pílula, e "Só a partir de 15:45, em passos de 30 min.".
- **"Cancelar ou remarcar pelo WhatsApp"** é uma lista de rádio com as quatro opções de D-086 item 4 e a opção extra para valor fora da lista, seguida do texto do quadro.
- **Um botão "Salvar"** grava os quatro campos num único `PATCH /v1/settings/availability`. O corpo reenvia o `timezone` e as `rules` exatamente como foram lidas (D-085 item 1). A mensagem de sucesso é uma só. A falha mostra erro de tela sem perder a edição. Enquanto grava, o botão fica desabilitado. Isso revê só a parte de D-086 item 4 que dava um botão e uma mensagem a cada painel. Os campos, o pedido e a regra de reenviar o que foi lido não mudam.

**(f) Lembretes em `/configuracoes/agenda/lembretes`.** Rota nova, tela empurrada com o título "Lembretes" e o voltar para `/configuracoes/agenda`. Ela mostra `ReminderSettingsSection` com o comportamento de hoje. O `h2` "Lembretes" de dentro da seção pode sair, se repetir o título da tela. O quadro AG2 não é portado (divergência declarada 5).

**(g) Composição.** As duas rotas novas seguem D-103, como as outras seções. Abaixo de 1024 px, são tela empurrada (`pushed`), sem barra de abas. De 1024 px em diante, a lista do hub fica à esquerda, com "Agenda" marcada (`aria-current="page"`), e a tela fica à direita. Continua **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031), em todas as rotas de Configurações.

**(h) `targets.json`.** Só a entrada do AG3 muda: `route` passa a `/configuracoes/agenda/regras`, ganha `clock` `"13:45"`, e a nota deixa de dizer que o app não tem tela própria. M1, N1, AG1 e todas as outras entradas não mudam.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O título "Mais" do M1 no mobile e no tablet em retrato: o app mostra "Configurações", porque o quinto item da barra continua sendo o diálogo de D-101 (b).
3. O estado da conta visual: WhatsApp desconectado (o cartão da IA da sidebar, a linha WhatsApp e o estado da IA no bloco de identidade), nenhuma importação, os dados do negócio, os serviços e os prazos gravados nela. Os textos de estado vêm desses dados, não do quadro.
4. "Bloqueios que se repetem" no AG1: não há leitura nem tela de série recorrente em Configurações. Bloqueios recorrentes são criados na Agenda.
5. "Lembretes" abre a tela com `ReminderSettingsSection`, e não o AG2, que fica fora deste Goal.
6. "Adicionar" ao lado de "Não informado" no N1, e o valor das linhas do conhecimento no N1 (evidência 4).
7. O item "Notificações" da sidebar no desktop (D-093, D-101 (c)).

## Escopo obrigatório

### 1. M1, N1, AG1 e AG3 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`:
- `Mais-Negocio-Agenda-IA.dc.html` (mobile), com os rótulos "Mais", "Configurações · Negócio", "Configurações · Agenda" e "Agenda · regras de horário";
- `Configuracoes-Tablet.dc.html`, com "Configurações / Mais / Portrait", "… / Landscape" e os equivalentes de Negócio, Agenda e regras de horário;
- `Configuracoes-Desktop.dc.html`, com "Configurações / Mais / Desktop" e os equivalentes.

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target M1,N1,AG1,AG3` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros M1, N1, AG1 e AG3 nos 4 devices**. Para cada quadro e cada device, o relatório final traz o diff do início e do fim e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script. Depois de cada `visual:compare`, confira `git status`: no 095 e no 096, o `next dev` reescreveu `apps/frontend/AGENTS.md` durante a comparação. Arquivo fora do escopo que mudar volta ao original antes da entrega.

### 2. O resto da área logada não quebra

Rode `npm run visual:compare -- --target H3,CL1,Servicos:S1,C5` no início e no fim e cole o diff de cada device das duas execuções. A casca, a Home, Clientes, Serviços e Conversas não mudam. Toda piora tem causa medida. Se aparecer a linha verde-azulada de 2 px na largura toda no tablet em retrato (observação 2 do review095, que vem da casca), declare-a e não mude a casca.

### 3. Comportamento preservado

- Todas as rotas de Configurações de hoje continuam abrindo a mesma seção, inclusive `/configuracoes/disponibilidade`, que continua no diálogo "Mais".
- O hub de 1024 px em diante continua abrindo o Negócio à direita (D-103). A seção aberta continua marcada na lista.
- O editor de Negócio abre pela linha e "Cancelar" volta às linhas sem salvar. A troca de fuso continua pedindo confirmação.
- As regras de oferta e a política gravam pelo mesmo `PATCH /v1/settings/availability`, com a grade e o fuso como foram lidos. Opção fora da lista aparece selecionada.
- "Como você vê a Agenda" grava pelo mesmo `PATCH /v1/settings/agenda-view`, recusa ocultar todos os dias e bloqueia salvar quando a leitura falha.
- Os lembretes leem e gravam como hoje.
- Configurações › IA, WhatsApp, Conversas e Conta, e a Importação, não mudam.

### 4. Provas novas

`apps/frontend/tests/goal097-configuracoes.test.tsx`, no padrão de `goal088-list-detail.test.tsx`, `goal095-servicos.test.tsx` e `goal096-conversas-e-notificacoes.test.tsx`:

1. **Hub do M1.** Os três grupos, com título e na ordem de (a). Cada linha tem o `href` de (a). Não há "Disponibilidade". A linha Serviços tem a classe que a esconde a partir de 1100 px. Com as leituras de (b) simuladas, cada linha mostra o estado no formato de (b), inclusive a revisão em âmbar. Com cada leitura falhando, a linha aparece sem a segunda linha e nunca com valor inventado. O hub abre mesmo com todas as leituras secundárias falhando.
2. **AG1.** As linhas de (d), com os `href` de cada uma, e os resumos. Os casos da função de resumo da grade: dias seguidos agrupados, dois intervalos no mesmo dia, dia isolado e nenhuma regra ativa. "Dias visíveis" e "Visualização inicial" abrem a folha e gravam pelo mesmo pedido de hoje, e a folha recusa ocultar todos os dias. Não há formulário de regras nem de política em `/configuracoes/agenda`.
3. **AG3.** Os três grupos segmentados, com o valor lido selecionado, e a opção extra para valor fora da lista, inclusive antecedência 0. Um único "Salvar" envia **um** `PATCH /v1/settings/availability` com os quatro campos, o `timezone` e as `rules` lidas. Falha mostra erro sem perder a edição. Os casos da função de "Na prática", com relógio fixo: 13:45, 2 h e 30 min dão o resultado do quadro; mudar a antecedência ou o intervalo na tela muda o bloco antes de salvar; e uma antecedência de 1 dia leva o bloco para o dia seguinte.
4. **Lembretes.** `/configuracoes/agenda/lembretes` mostra `ReminderSettingsSection`, como tela empurrada, com o voltar para `/configuracoes/agenda`.
5. **Casca.** Uma chamada de `useShellConfig` por árvore renderizada em `/configuracoes`, `/configuracoes/agenda`, `/configuracoes/agenda/regras` e `/configuracoes/agenda/lembretes`, nas duas faixas. De 1024 px em diante, as duas rotas novas mostram a lista do hub com "Agenda" marcada.

As provas 1 a 4 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. A prova 5 guarda comportamento e pode passar em parte na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa de texto, rótulo ou estrutura que o quadro troca. Exemplos: o cartão "Disponibilidade" do hub, "Atendente virtual" como rótulo do hub, os textos fixos dos cartões, os formulários de regras, política e visualização dentro de `/configuracoes/agenda`, os dois botões e as duas mensagens de D-086 item 4, e o `h2` "Lembretes". Teste que exercita as regras ou a política em `/configuracoes/agenda` passa a exercitá-las em `/configuracoes/agenda/regras`. A asserção sobre o pedido enviado não muda. Prováveis afetados: `goal020-reachability`, `goal024-settings-hub`, `goal024-settings-shell-invariant`, `goal067-configuracoes-agenda`, `goal069-hidden-days-limit`, `goal073-configuracoes-agenda` e `goal088-list-detail`. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. As únicas mudanças autorizadas no gate autenticado

Em `apps/frontend/e2e/routes.ts`, só duas entradas novas em `AUTHENTICATED_ROUTES`, logo depois de `/configuracoes/agenda`, com `sessionMarker` `"configuracoes"`:
- `/configuracoes/agenda/regras`, nome `configuracoes-agenda-regras`, `contentMarker` "Antecedência e intervalos";
- `/configuracoes/agenda/lembretes`, nome `configuracoes-agenda-lembretes`, `contentMarker` "Lembretes".

Confira que cada marcador acha **um** `h1` em cada largura, e que "Agenda" continua achando um em `/configuracoes/agenda`. O gate passa de **255** para **265** testes: cinco por rota nova. `e2e/authenticated-matrix.spec.ts` e o resto de `e2e/` não mudam, fora de `e2e/visual/targets.json`, que muda só pelo que (h) autoriza.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O cartão "Disponibilidade" volta ao hub: a prova 1 reprova.
2. A linha Serviços mostra "0 ativos" quando a leitura falha: a prova 1 reprova.
3. O "Salvar" do AG3 envia `rules: []` no lugar das regras lidas: a prova 3 reprova.
4. A função de "Na prática" ignora a antecedência: a prova 3 reprova.
5. A função de resumo da grade deixa de agrupar dias seguidos: a prova 2 reprova.
6. `/configuracoes/agenda/regras` chama `useShellConfig` duas vezes na mesma árvore: a prova 5 reprova.

## Pontos de implementação

- `apps/frontend/src/features/settings/`: `SettingsHub.tsx`, `ProductSettingsScreen.tsx`, `CalendarSettings.tsx`, `BusinessSettings.tsx` (só o que (c) pede), `types.ts` (cenários novos) e `shared/labels.ts`. Componentes novos para o AG3, a folha de visualização e as funções puras de resumo e de "Na prática", na mesma pasta.
- `apps/frontend/src/app/(platform)/configuracoes/agenda/regras/page.tsx` e `.../agenda/lembretes/page.tsx`, no padrão de `configuracoes/agenda/page.tsx`.
- `apps/frontend/src/features/reminders/ReminderSettingsSection.tsx` só para o `h2` de (f), sem mudar comportamento.
- `apps/frontend/src/shared/styles/atendly-settings.css`. `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/visual/targets.json`: só o que (h) autoriza.
- `apps/frontend/e2e/routes.ts`: só o que o §6 autoriza.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- IA1, W1, R1 e Mais-WhatsApp:C1 (104), e I1, I2 e 2.I1 (105). Configurações › IA, WhatsApp, Conversas e Conta, e a Importação, não mudam, salvo o que a lista do hub compartilha com elas, declarado no relatório.
- N2, N3, AG2, W2, W3, R2 e C2, e onde o conhecimento mora.
- O diálogo "Mais" e qualquer mudança na casca: `AppShell.tsx`, `navigation.ts` (inclusive `MORE_DESTINATIONS`), `PushedBar.tsx`, `ListDetail.tsx`, `useWideLayout.ts` e `ShellConfig.tsx`.
- `AvailabilitySettings.tsx` além do voltar, se a tela passar a voltar para `/configuracoes/agenda`.
- Qualquer mudança em contrato, BFF, Scheduling, IA, `scripts/`, `docs/design-reference/`, vault e nas demais entradas de `e2e/visual/targets.json`.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-116** em `PROPOSED`, no formato de D-115. Ela diz (a) a (h), com o motivo de cada um, e as divergências declaradas. Ao fim de D-085 e de D-086 entra, só por acréscimo, uma linha "**Revista em parte por D-116**" que diz qual item: em D-085, onde as regras de oferta moram (item 1); em D-086, o botão e a mensagem de cada painel (item 4). Ela não reescreve D-085, D-086, D-101 nem D-103. O "Revisar se" cobre três casos: o quinto item da barra passar a abrir o M1, o que reabre D-101 (b) e a divergência 2; Configurações ganhar leitura de série recorrente, o que traz "Bloqueios que se repetem"; e o 104 levar o conhecimento para Negócio, o que muda as linhas do N1.
- [CURRENT_STATE](../CURRENT_STATE.md) registra o hub do M1, o AG1 em linhas, as duas rotas novas e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim dos quadros do §1 e do §2, as mudanças do §6 e a contagem do gate autenticado.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md) só se uma linha vigente de Configurações ficar falsa.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target M1,N1,AG1,AG3,H3,CL1,Servicos:S1,C5` na baseline e colar o diff de cada par. Na baseline, AG3 roda com a entrada de `targets.json` da baseline.
2. Implementar, iterando com `npm run visual:compare -- --target M1,N1,AG1,AG3`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target M1,N1,AG1,AG3,H3,CL1,Servicos:S1,C5`.
6. Rodar os seis controles do §7.
7. Escrever a prosa só depois disso.

Os controles do §7 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Contraste intermitente em `onboarding-demonstracao-da-ia`.** No 103, uma execução de `validate:integration` falhou por contraste nessa tela, e as duas seguintes, na mesma árvore, passaram sem retentativa; a causa não foi medida (observação 1 do [review103](../reviews/103-review.md)). Os reviews 095 e 096 não registram recorrência. Se acontecer de novo, rode `validate:integration` outra vez na mesma árvore e registre as duas execuções. Não mude `e2e/` por causa disso: o §6 é a única mudança autorizada no gate.

**Retentativas e recurso do host.** Nos Goals 092, 100, 093 e 101, o `validate:ui` com a configuração padrão teve retentativas em rotas públicas (`Target crashed`), e com `CI=1`, que a configuração já lê para usar 1 worker, a mesma árvore deu 0. No 101, `validate:core` sem variável falhou por memória (`Zone Allocation failed - process out of memory`) e passou com `VITEST_MAX_WORKERS=2`. Se acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração. Fora do §6 e de (h), `e2e/` não muda.

**Controles do §7 e números depois da última edição.** No 095, a rodada 3 caiu porque os controles tinham rodado antes das últimas edições de CSS. No 096, a rodada 2 caiu porque, depois de corrigir um teste, o controle afetado e o vermelho da baseline não foram rodados de novo, e os documentos ficaram com os números antigos. Qualquer edição de código ou de teste depois dos controles obriga a rodá-los de novo, a rodar de novo o vermelho da baseline das provas tocadas e a atualizar os números e os hashes citados.

No relatório, para cada quadro e cada device, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target M1,N1,AG1,AG3` e abriu os dezesseis `side-by-side.png`. `/configuracoes` está **igual ao quadro M1 nos 4 devices**, Negócio está **igual ao quadro N1 nos 4 devices**, `/configuracoes/agenda` está **igual ao quadro AG1 nos 4 devices**, e `/configuracoes/agenda/regras` está **igual ao quadro AG3 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas.
2. A Home, Clientes, Serviços e Conversas não quebraram: H3, CL1, Servicos:S1 e C5 do início e do fim, com o que mudou descrito. Toda piora tem causa medida.
3. As provas 1 a 4 passam e reprovaram na baseline, salvo asserção declarada. A prova 5 passa. Os seis controles do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua. Nenhuma linha mostra estado que o app não leu. O AG3 grava os quatro campos num pedido só, com a grade e o fuso lidos.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem **265** testes (os 255 da baseline mais os 10 das duas rotas novas), com **0** retentativas. `validate:ui` passa nas cinco larguras. Retentativa é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. `e2e/routes.ts` difere da baseline só pelo que o §6 autoriza, `e2e/visual/targets.json` só pelo que (h) autoriza, e `e2e/authenticated-matrix.spec.ts` não muda.
8. D-116 está em `PROPOSED`, com as notas "Revista em parte por D-116" em D-085 e D-086 só por acréscimo. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
9. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada, sem resto de controle negativo, sem `apps/frontend/AGENTS.md` alterado e sem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o M1 com a IA ativa e o WhatsApp conectado, que a conta visual não tem; a linha Importação depois de uma importação concluída, provada só em jsdom; e que a IA, numa conversa real, ofereça horários como o bloco "Na prática" ilustra.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; hub do M1 com os estados de (b), na tela e na lista de 1024 px em diante; acabamento do N1 |
| WU-02 | STANDARD | WU-01 | AG1 em linhas, resumo da grade, folhas de "Como você vê a Agenda" e a rota de Lembretes |
| WU-03 | STANDARD | WU-02 | AG3 em `/configuracoes/agenda/regras` com um "Salvar" e "Na prática"; `targets.json` de (h) e as entradas do §6 |
| WU-04 | STANDARD | WU-03 | Provas 1 a 5 com o vermelho da baseline; asserções do §5 |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-04 | lint de `apps/frontend` |
| WU-07 | DETERMINISTIC | WU-04 | testes dirigidos: `goal097-configuracoes` |
| WU-08 | DETERMINISTIC | WU-05, WU-06, WU-07 | validate-core |
| WU-09 | DETERMINISTIC | WU-08 | gate-tests |
| WU-10 | DETERMINISTIC | WU-08 | validate-ui |
| WU-11 | DETERMINISTIC | WU-08 | validate-integration |
| WU-12 | STANDARD | WU-09, WU-10, WU-11 | `visual:compare` final, controles negativos (§7) e documentação, depois da execução final |
| WU-13 | DETERMINISTIC | WU-12 | git-diff-check final |
