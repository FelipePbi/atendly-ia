# Goal 096 — Conversas e Notificações iguais ao protótipo

**Status: READY.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal095 ACCEPTED](../reviews/095-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: C5, NT1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED), a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01), com os quadros Conversas:C1, C5 e NT1. **READY na v127**, com o mesmo ID e título. **Os quadros mudam:** o C1 sai deste Goal, pelo motivo da evidência 1 abaixo.

## Baseline aceita

Baseline aceita: `7393eda88312a1f287031c4ee945729befd29323`

Goal anterior: 095 — Serviços iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal095 já integrado em `main` (origem `c521df0b0efbd8203be2f0f479a0aecaff5aa674`). **Quatro rodadas**, com 7, 2, 2 e 0 blockers. **D-114** aceita. A virada de status do documento do Goal095 para `ACCEPTED` entrou no próprio commit de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/conversas` sem WhatsApp igual ao quadro C5, e a central de notificações igual ao quadro NT1, nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768).

**Por que agora.** Serviços fechou no 095. Na ordem da v113, o próximo módulo é Conversas e Notificações. A casca (087), o estado real do WhatsApp (085, D-102) e a gaveta da central (077, D-093) já existem. Falta o estado sem WhatsApp de Conversas, a central com a forma do quadro e a gaveta na largura do quadro. Nada disso exige rota, contrato ou BFF novos.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Conversas-e-Chat.dc.html`, `Conversas-Tablet.dc.html`, `Conversas-Desktop.dc.html`, `Notificacoes.dc.html`, `Notificacoes-Tablet.dc.html` e `Notificacoes-Desktop.dc.html`), no código da baseline, no contrato (`packages/public-api-contract/src/schemas.ts`), em `scripts/lib/visual-seed.mjs` e no gate autenticado.

1. **A conta visual não alcança o C1.** `scripts/lib/visual-seed.mjs` não cria conversa: ele só lê `GET /v1/conversations`. A conta visual também não tem WhatsApp. Depois deste Goal, `/conversas` com essa conta mostra o C5, e a captura do C1 sairia do estado errado. A linha `Quadros do protótipo:` tornaria essa diferença um blocker. Por isso o C1 sai do Goal. A conta do gate autenticado tem conversas, semeadas direto no banco descartável da IA por `scripts/goal033-authenticated-ui-rehearsal.mjs`. Isso mostra que dá para semear conversas na conta visual, mas esse trabalho fica fora deste Goal.
2. **C5 (Conversas sem WhatsApp).** Cabeçalho "Conversas" em Literata 26 px. Abaixo, sem abas, um bloco com ícone, o título "Conecte seu WhatsApp para ver suas conversas aqui.", o texto "Elas ficam organizadas em Comercial, Não classificadas e Pessoal — e a IA passa a atender seus clientes. Você continua usando o WhatsApp normalmente." e o botão "Conectar WhatsApp". A legenda do quadro diz: "Sem abas enquanto não há número: explica o que a área faz e oferece a única ação que muda isso." No tablet e no desktop, o mesmo bloco fica dentro da casca. O app (`ConversationInbox.tsx`) mostra sempre o cabeçalho com subtítulo, a busca, as três abas, o chip "Ignorados", a nota da aba e o painel "Nenhuma conversa comercial por enquanto". Com o WhatsApp desconectado, a casca também mostra o banner de WhatsApp desconectado (D-102).
3. **Quando o C5 vale.** `GET /v1/status` devolve `whatsapp.status` com só três valores: `CONNECTED`, `DISCONNECTED` e `UNKNOWN`. O app lê isso como `whatsappView` (`shared/runtime/systemStatus.tsx`): `active`, `off`, `unknown` ou `loading`. Um negócio que já teve WhatsApp e desconectou tem conversas guardadas, e o quadro NT3 (fora do escopo) mostra a lista com um banner nesse caso, não o C5. `GET /v1/conversations` aceita a listagem sem `category` (`BffConversationService.list`). Assim o app pode distinguir "sem número e sem nada" de "desconectado com histórico", sem contrato novo.
4. **NT1 (central de notificações).** No mobile e no tablet em retrato, o NT1 é uma **tela própria**: voltar no topo, o título "Notificações", "Marcar lidas" e o histórico por dia ("Hoje", "Ontem"), **sem barra de abas**. No tablet em paisagem e no desktop, o NT1 é uma **gaveta sobre a Home**. As linhas não têm selo de texto. O nível aparece pela forma: atenção em âmbar com faixa, crítico com anel cortado e informativo com ponto petróleo. A não lida tem ponto à direita e título em negrito. A resolvida fica riscada, com hora e desfecho. O app (`NotificationsScreen.tsx`) tem o eyebrow "Notificações", o título "Central de notificações", um subtítulo, o cabeçalho "Histórico recente" com a contagem, os selos de texto ("Atenção", "Não lida", "Resolvido"), o botão "Marcar como lida" em cada linha e a seção de preferência abaixo. A página fica na casca, com barra de abas.
5. **A gaveta abre em outra largura.** O app abre a gaveta a partir de 768 px (`NOTIFICATIONS_DRAWER_QUERY` em `NotificationsDrawer.tsx`, D-093 item 4). O protótipo mostra a gaveta só no tablet em paisagem e no desktop. A largura de 1024 px já é a de D-103 (`WIDE_LAYOUT_QUERY` em `shared/layout/useWideLayout.ts`). D-093 previu esta revisão: "Revisar se a conferência humana do §9 achar que [...] a gaveta não bate com os protótipos".
6. **O mapa de `targets.json`.** NT1 abre `/notificacoes` nos quatro devices, mas no tablet em paisagem e no desktop o quadro é a gaveta sobre a Home. C5 abre `/conversas`, e a nota já diz que esse é o estado da conta de teste. C1 também abre `/conversas`, com a nota "compare cabeçalho, abas e estrutura", que fica falsa depois deste Goal.
7. **Gate.** `/conversas` e `/notificacoes` estão em `AUTHENTICATED_ROUTES` (`e2e/routes.ts`). O marcador de `/notificacoes` é o `h1` "Central de notificações". Dois testes do gate autenticado tocam este Goal:
   - "inicio: the bell opens the notifications" espera o link para `/notificacoes` abaixo de 768 px, com o `h1` "Central de notificações", e a gaveta a partir de 768 px.
   - "conversas: the appointment-created event's "Ver" opens the agenda detail", e o caso de `REACHED_BY_CLICK` de `conversas`, clicam a linha `a.conversation-row` de uma conversa semeada. A conta do gate tem conversas, então a regra de (a) mantém as abas para ela.

## Escolhas de desenho desta passada

**(a) O C5 só aparece sem número e sem histórico.** `/conversas` mostra o C5 **só quando** `whatsappView` é `off` **e** `GET /v1/conversations` sem `category`, sem `ignored`, sem busca e com `limit: 1` devolve lista vazia. Nos outros casos, a tela é a de hoje, com abas: WhatsApp `active`; `unknown` (o app não afirma "sem WhatsApp" por suposição, como em D-102); `off` com pelo menos uma conversa; ou falha da consulta. Enquanto o status ou a consulta carregam, a tela mostra o carregamento de hoje (`ConversationLoading`), sem piscar nem o C5 nem as abas. A consulta só roda com o WhatsApp `off`. Ela roda de novo quando `whatsappView` muda. Quando o WhatsApp conecta, o tick de status muda a tela para as abas sem recarregar a página.

**(b) O C5 do quadro.** Porte o cabeçalho e o bloco do C5. O botão "Conectar WhatsApp" é um link para `/configuracoes/whatsapp`, a tela que já conecta o número (W1). Com o C5 na tela, a tela declara `whatsappInBand: true` na `ShellConfig`, porque ela mesma diz que falta o WhatsApp, e a casca não repete o banner. No C5 não há abas, busca, chip "Ignorados" nem nota de aba. `attention` é `false`. Continua **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031): o C5 e as abas são ramos do mesmo `ConversationInbox`, ou ramos exclusivos com uma chamada cada.

**(c) O estado com abas não muda.** Cabeçalho, busca, abas, "Ignorados", notas, linhas, contagens e estados vazios de cada aba ficam como na baseline. Portar o C1 (cabeçalho com busca em botão, abas sublinhadas com contador, grupo "Aguardando você", linha do quadro e "Selecione uma conversa" no desktop) fica para quando a conta visual tiver conversas. O chat (`/conversas/[id]`, K1 a K6) não muda.

**(d) NT1 no mobile e no tablet em retrato: tela empurrada.** Abaixo de 1024 px, `/notificacoes` é uma tela empurrada do padrão de D-103: `pushed` na `ShellConfig`, `PushedBar` com o voltar para `/inicio` e sem barra de abas. O título passa a "Notificações", como `h1`, e saem o eyebrow, o subtítulo e o cabeçalho "Histórico recente" com a contagem. "Marcar lidas" fica no lugar do quadro. De 1024 px em diante, quem abre `/notificacoes` pela URL continua vendo a página dentro da casca, com o mesmo título e a mesma lista. Nenhum quadro cobre esse caso.

**(e) A gaveta a partir de 1024 px.** `NOTIFICATIONS_DRAWER_QUERY` passa a valer o mesmo que `WIDE_LAYOUT_QUERY`, `(min-width: 1024px)`. Reuse a constante; não declare uma segunda. Abaixo disso, o sino da Home é o link para `/notificacoes`. A partir dela, o sino e o item "Notificações" da sidebar abrem a gaveta. A gaveta segue o NT1 de paisagem e desktop: largura, cabeçalho "Notificações" com "Marcar lidas", grupos por dia e linhas. Ela continua sendo `Dialog` `variant="drawer"`, com foco preso, `Escape` e retorno de foco (D-093 item 4). Isso revê só a largura do item 4 de D-093.

**(f) A linha do NT1.** Porte a linha do quadro, na página e na gaveta, que usam o mesmo `NotificationHistory`:
- O nível aparece pela forma do quadro: faixa âmbar na atenção, anel cortado no crítico e ponto petróleo no informativo. Saem os selos de texto "Atenção", "Crítico", "Informativo", "Não lida" e "Resolvido".
- A não lida tem título em negrito e o ponto à direita.
- A resolvida fica riscada, com a hora e o desfecho que `notificationCopy` já dá.
- O nome acessível do `<li>` não muda: nível, título e "(resolvido)". A cor e a forma nunca são a única informação.
- Marcar uma notificação como lida continua possível em cada linha não lida, por um controle com o nome acessível "Marcar como lida" e alvo de toque de pelo menos 24 px. Se o quadro só mostra o ponto, o ponto é esse controle.
- O link de cada notificação (`copy.href`) continua igual.

**(g) `targets.json`.** Só três mudanças:
- NT1 passa a abrir `/inicio`, com `clock` `"10:30"` como H1 e H3, e com `steps` que abrem a central pelo sino da Home. No mobile e no tablet em retrato, o sino é link e leva a `/notificacoes`. No tablet em paisagem e no desktop, ele abre a gaveta. Use passos `clickRole` com `optional` para o papel `button` e para o papel `link`, com o nome acessível do sino, e confira em cada device que a captura mostra o estado do quadro. Nenhum passo pode clicar outro elemento.
- A nota de C1 passa a dizer que a conta visual não alcança o quadro: sem WhatsApp e sem conversas, `/conversas` mostra o C5.
- Nenhuma outra entrada muda, inclusive C5.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O cartão da IA da sidebar com "WhatsApp desconectado" e "Reconectar" (D-102), contra "IA inativa · falta conectar o WhatsApp" no C5 desktop. Também o item "Notificações" da sidebar (D-093), estado e decisão vigentes.
3. Os dados: notificações, horários, contagens e nomes são os da conta visual. Se a conta visual não tiver notificação nenhuma, a captura do NT1 mostra o estado vazio, e o relatório compara a estrutura e declara isso. Não semeie notificação.
4. O botão de busca do cabeçalho do C5: no C5 não há conversa para buscar, e o app não mostra um botão sem efeito.
5. A seção de preferência abaixo da lista em `/notificacoes` e o link "Preferências de notificação" no rodapé da gaveta. Eles continuam por D-093, e é ali que a preferência mora.
6. No NT1 de paisagem e desktop, a Home atrás da gaveta é a da conta visual, com o estado do H3.
7. Conteúdo de linha que vem de `notificationCopy`, quando o texto do app difere do texto do quadro para a mesma espécie.

## Escopo obrigatório

### 1. C5 e NT1 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`:
- `Conversas-e-Chat.dc.html` (mobile, rótulo "Conversas · sem WhatsApp"), `Conversas-Tablet.dc.html` ("Conversas / Conversas · sem WhatsApp / Portrait" e "… / Landscape") e `Conversas-Desktop.dc.html` ("… / Desktop").
- `Notificacoes.dc.html` (mobile, rótulo "Notificações"), `Notificacoes-Tablet.dc.html` ("Notificações / Notificações / Portrait" e "… / Landscape") e `Notificacoes-Desktop.dc.html` ("… / Desktop").

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target C5,NT1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros C5 e NT1 nos 4 devices**. Para cada quadro e cada device, o relatório final traz o diff do início e do fim e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script. Depois de cada `visual:compare`, confira `git status`: no 095, o `next dev` reescreveu `apps/frontend/AGENTS.md` durante a comparação (observação 5 do review095). Arquivo fora do escopo que mudar volta ao original antes da entrega.

### 2. O resto da área logada não quebra

Rode `npm run visual:compare -- --target H3,CL1,Servicos:S1,N1` no início e no fim e cole o diff de cada device das duas execuções. A casca, a Home, Clientes, Serviços e Configurações não mudam. Toda piora tem causa medida. Se aparecer a linha verde-azulada de 2 px na largura toda no tablet em retrato (observação 2 do review095, que vem da casca), declare-a e não mude a casca.

### 3. Comportamento preservado

- Com o WhatsApp conectado, ou com conversas, `/conversas` é a de hoje: abas, busca, "Ignorados", prioridade de quem aguarda, recarga a cada 8 s, estados vazios e erro com "Tentar novamente".
- A linha da conversa continua abrindo `/conversas/[id]`. O chat não muda.
- O sino da Home continua mostrando o ponto de não lidas e o nome acessível com a contagem. A contagem continua vindo do tick de `GET /v1/status`.
- "Marcar lidas" marca todas, e "Marcar como lida" marca uma, pelos mesmos pedidos (`notifications.markRead`). Toda mutação recarrega a lista do zero (D-093).
- A condição resolvida continua na lista, com o desfecho (D-093). O histórico continua agrupado por dia.
- A gaveta fecha quando a rota muda, prende o foco, fecha com `Escape` e devolve o foco ao sino.
- A preferência de agendamento criado pela IA continua só em `/notificacoes`, nunca na gaveta.
- O erro de cada leitura continua com a ação de tentar de novo.

### 4. Provas novas

`apps/frontend/tests/goal096-conversas-e-notificacoes.test.tsx`, no padrão de `goal077-notifications-center.test.tsx`, `goal088-list-detail.test.tsx` e `goal095-servicos.test.tsx`:

1. **C5 e a regra de (a).** Com `whatsappView` `off` e a consulta sem categoria vazia: o título e o texto do C5, o link "Conectar WhatsApp" com `href` `/configuracoes/whatsapp`, nenhum `tablist`, nenhuma busca, `whatsappInBand: true` e o banner da casca ausente. A consulta foi feita sem `category`, sem `ignored`, sem `search` e com `limit: 1`. Com `off` e uma conversa: as abas, sem o C5. Com `active`: as abas, sem a consulta. Com `unknown`: as abas, sem o C5. Com a consulta falhando: o caminho de hoje, sem o C5. Com status ou consulta carregando: nem o C5 nem as abas.
2. **NT1 em tela empurrada.** Abaixo de 1024 px, `/notificacoes` tem o `h1` "Notificações", a tela empurrada (`pushed` e sem barra de abas) e o voltar para `/inicio`. Não tem o eyebrow, o subtítulo nem "Histórico recente". Tem "Marcar lidas" quando há não lida.
3. **A linha do NT1.** Para cada nível, a linha tem o marcador de forma de (f) e nenhum selo de texto. A não lida tem o controle "Marcar como lida" e a classe de não lida. A resolvida tem a classe de resolvida e o desfecho. O nome acessível do `<li>` é o de hoje. A gaveta mostra as mesmas linhas.
4. **A gaveta a partir de 1024 px.** `NOTIFICATIONS_DRAWER_QUERY` é `(min-width: 1024px)`. Com a consulta de largura falsa, o sino é link para `/notificacoes`. Com ela verdadeira, o sino é botão e abre o `dialog` "Notificações" sem navegar.
5. **Casca.** Uma chamada de `useShellConfig` por árvore renderizada em `/conversas` (C5 e abas) e em `/notificacoes`, nas duas faixas, no padrão de `goal088-list-detail`.

As provas 1 a 4 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. A prova 5 guarda comportamento e pode passar na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa de texto, rótulo ou estrutura que o quadro troca. Exemplos: "Central de notificações", "Histórico recente", "nos últimos 90 dias", os selos de nível, "Não lida" e "Resolvido", e a largura de 768 px da gaveta. Teste que monta a inbox com o WhatsApp desconectado e sem conversa para provar as abas passa a montar o WhatsApp conectado ou uma conversa. A asserção sobre as abas não muda. Prováveis afetados: `goal017-inbox-tabs`, `goal017-reachability`, `goal017-shell-invariant`, `goal022-notifications-screen`, `goal022-notifications-chrome`, `goal059-whatsapp-status-view`, `goal074-home`, `goal077-notifications-center` e `goal077-notifications-drawer`. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. As únicas mudanças autorizadas no gate autenticado

- Em `apps/frontend/e2e/routes.ts`, só o `contentMarker` de `/notificacoes`, de "Central de notificações" para "Notificações". Confira que o marcador acha **um** `h1` em cada largura.
- Em `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no teste "inicio: the bell opens the notifications":
  - o limite do ramo do link passa de 768 para 1024 px, com o comentário do teste e as mensagens citando 1024;
  - o nome do `h1` esperado passa a "Notificações".

O título do teste **não muda**, para que ele mantenha a identidade nas contagens. A gaveta, a medida de overflow e de toque, o `Escape` e o retorno de foco ficam iguais. Nenhum outro teste, helper, seletor ou constante desses arquivos muda. O gate continua com **255** testes.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O C5 aparece sempre que `whatsappView` é `off`, sem olhar a consulta: a prova 1 reprova.
2. O C5 aparece também com `whatsappView` `unknown`: a prova 1 reprova.
3. "Conectar WhatsApp" aponta para `/onboarding/whatsapp`: a prova 1 reprova.
4. `NOTIFICATIONS_DRAWER_QUERY` volta a `(min-width: 768px)`: a prova 4 reprova.
5. A linha da notificação volta a mostrar o selo de texto do nível: a prova 3 reprova.
6. O ramo do C5 chama `useShellConfig` duas vezes na mesma árvore: a prova 5 reprova.

## Pontos de implementação

- `apps/frontend/src/features/conversations/`: `ConversationInbox.tsx` e, se ajudar, um componente novo para o C5 na mesma pasta. A consulta da regra de (a) pode morar em `inboxLenses.ts`, por acréscimo. `ProductConversationsScreen.tsx` só se a composição exigir.
- `apps/frontend/src/features/notifications/`: `NotificationsScreen.tsx`, `NotificationsDrawer.tsx` e `notificationViews.ts` (só por acréscimo, se a linha exigir uma função nova; as funções existentes não mudam de saída).
- `apps/frontend/src/shared/styles/atendly-conversations.css` e `atendly-notifications.css`. `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- `apps/frontend/src/features/dashboard/DashboardScreen.tsx` e `src/shared/layout/AppShell.tsx` só se a troca da largura da gaveta exigir. Eles já leem o mesmo hook e a mesma constante.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/visual/targets.json`: só o que (g) autoriza.
- `apps/frontend/e2e/routes.ts` e `apps/frontend/e2e/authenticated-matrix.spec.ts`: só o que o §6 autoriza.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- C1 a C4, K1 a K6, NT2, NT3 e R1/R2. O que eles compartilham com C5 e NT1 pode mudar junto, declarado no relatório. O estado com abas de `/conversas` e o chat não mudam.
- Semear conversas ou notificações na conta visual, e qualquer mudança em `scripts/`.
- Mudar a casca: `AppShell.tsx` além do que (e) exigir, `PushedBar.tsx`, `ListDetail.tsx`, `useWideLayout.ts`, `ShellConfig.tsx` e `navigation.ts`. A linha verde-azulada da observação 2 do review095 também fica fora.
- Configurações (097), inclusive Configurações › WhatsApp, para onde o C5 leva.
- Qualquer mudança em rota, contrato, BFF, Scheduling, IA, `docs/design-reference/`, vault e nas demais entradas de `e2e/visual/targets.json`.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-115** em `PROPOSED`, no formato de D-114. Ela diz (a) a (g), com o motivo de cada um, e as divergências declaradas. Ela registra que (e) revê só a largura do item 4 de D-093, e que o C1 ficou fora por falta de conversa na conta visual. Ao fim de D-093 entra, só por acréscimo, uma linha "**Revista em parte por D-115**" que diz qual item, no formato da nota que D-114 deixou em D-091. Ela não reescreve D-093, D-102 nem D-103. O "Revisar se" cobre três casos: a conta visual passar a ter conversas, o que traz o C1; o contrato de status passar a distinguir "nunca conectou" de "desconectou"; e uma pessoa preferir a gaveta também no tablet em retrato.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que Conversas segue C5 e a central segue NT1, com a regra de (a), a gaveta a partir de 1024 px e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim dos quadros do §1 e do §2, as mudanças do §6 e a contagem do gate autenticado.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md) só se uma linha vigente de Conversas ou de Notificações ficar falsa.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target C5,NT1,H3,CL1,Servicos:S1,N1` na baseline e colar o diff de cada par. Na baseline, NT1 roda com a entrada de `targets.json` da baseline.
2. Implementar, iterando com `npm run visual:compare -- --target C5,NT1`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target C5,NT1,H3,CL1,Servicos:S1,N1`.
6. Rodar os seis controles do §7.
7. Escrever a prosa só depois disso.

Os controles do §7 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Contraste intermitente em `onboarding-demonstracao-da-ia`.** No 103, uma execução de `validate:integration` falhou por contraste nessa tela, e as duas seguintes, na mesma árvore, passaram sem retentativa; a causa não foi medida (observação 1 do [review103](../reviews/103-review.md)). O review095 não registra recorrência. Se acontecer de novo, rode `validate:integration` outra vez na mesma árvore e registre as duas execuções. Não mude `e2e/` por causa disso: o §6 é a única mudança autorizada no gate.

**Retentativas e recurso do host.** Nos Goals 092, 100, 093 e 101, o `validate:ui` com a configuração padrão teve retentativas em rotas públicas (`Target crashed`), e com `CI=1`, que a configuração já lê para usar 1 worker, a mesma árvore deu 0. No 101, `validate:core` sem variável falhou por memória (`Zone Allocation failed - process out of memory`) e passou com `VITEST_MAX_WORKERS=2`. Se acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração. Fora do §6, `e2e/` não muda.

**Controles do §7 depois da última edição.** No 095, a rodada 3 caiu porque os controles tinham rodado antes das últimas edições de CSS, com hashes que não batiam com a árvore. Qualquer edição de código depois dos controles obriga a rodá-los de novo e a atualizar os hashes citados.

No relatório, para cada quadro e cada device, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target C5,NT1` e abriu os oito `side-by-side.png`. `/conversas` com a conta visual está **igual ao quadro C5 nos 4 devices**, e a central está **igual ao quadro NT1 nos 4 devices**: tela empurrada no mobile e no tablet em retrato, gaveta sobre a Home no tablet em paisagem e no desktop. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas.
2. A Home, Clientes, Serviços e Configurações não quebraram: H3, CL1, Servicos:S1 e N1 do início e do fim, com o que mudou descrito. Toda piora tem causa medida.
3. As provas 1 a 4 passam e reprovaram na baseline, salvo asserção declarada. A prova 5 passa. Os seis controles do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua. Com conversas, ou com o WhatsApp conectado ou de estado desconhecido, `/conversas` não mostra o C5.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem os **255** testes da baseline, com **0** retentativas, inclusive o teste do sino nas cinco larguras e os dois testes de Conversas citados na evidência 7. `validate:ui` passa nas cinco larguras. Retentativa é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` diferem da baseline só pelo que o §6 autoriza, e `e2e/visual/targets.json`, só pelo que (g) autoriza.
8. D-115 está em `PROPOSED`, com a nota "Revista em parte por D-115" em D-093 só por acréscimo. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
9. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada, sem resto de controle negativo, sem `apps/frontend/AGENTS.md` alterado e sem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o C1 e os demais quadros de Conversas, que a conta visual não alcança; o NT1 com as espécies que a conta visual não tem; a regra de (a) para um negócio que desconectou com histórico, provada só em jsdom.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; C5 em `/conversas` com a regra de (a), o link "Conectar WhatsApp" e `whatsappInBand` |
| WU-02 | STANDARD | WU-01 | NT1: página empurrada abaixo de 1024 px, linha do quadro na página e na gaveta, gaveta a partir de 1024 px, `targets.json` de (g) e as mudanças do §6 |
| WU-03 | STANDARD | WU-01, WU-02 | Provas 1 a 5 com o vermelho da baseline; asserções do §5 |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal096-conversas-e-notificacoes` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | `visual:compare` final, controles negativos (§7) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
