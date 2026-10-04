# Goal 101 — Novo agendamento igual ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-02 pelo Tech Lead Agent após [Goal093 ACCEPTED](../reviews/093-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: A6

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v122 (PLANNED), dividida do 093, com o quadro A6. **READY na v123**, com o mesmo ID, título e quadro.

## Baseline aceita

Baseline aceita: `29626e0de4d83a80a6d3a022452a8215e657e654`

Goal anterior: 093 — Detalhe, cancelar e remarcar iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal093 já integrado em `main` (origem `979ec7e904d00705075a3aef313ae334f0427d37`). **Uma rodada**, sem blocker. **D-110** aceita. A virada de status do documento do Goal093 para `ACCEPTED` não entrou no commit de fechamento; ela veio no commit documental `94b3c36`, que só muda esse documento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/agenda/novo` igual ao quadro A6 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`: o alvo A6 abre `/agenda/novo` com o relógio em 13:45 e toca, quando existem, "Ana Paula", "Corte feminino" e "Escova".

**Por que agora.** O 093 construiu a coluna da Agenda em Dia (`AgendaDayColumn.tsx`) e a composição por largura em `AppointmentFlowShell` (D-110 (a) e (b)) para detalhe, cancelamento e remarcação. O A6 usa o mesmo arranjo. A coluna existe e só falta este consumidor. O "Revisar se" de D-110 prevê o caso: "o Goal101 levar a coluna ao novo agendamento".

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`), no código da baseline e nos documentos.

1. **Composição por largura no quadro.** Mobile ("Novo agendamento") e tablet em retrato ("Agenda / Novo agendamento / Portrait"): tela cheia, sem sidebar e sem barra de abas. No topo, um botão "×" de 40 px à esquerda e o título "Novo agendamento" centralizado (16 px, peso 600). No retrato, o corpo tem duas colunas com `gap: 40px`. Tablet em paisagem ("… / Landscape") e desktop ("… / Desktop"): a Agenda em Dia à esquerda (barra "Setembro 2026" com Dia/Semana/Mês e "Novo", tira "SEG 15 … DOM 21", "Hoje, quinta 18 · 5 atendimentos · 1 bloqueio" e a lista do dia) e o formulário num painel à direita. Nenhuma linha da lista aparece marcada.
2. **Corpo do A6.** Na ordem: "Cliente" (chip com avatar "AP", "Ana Paula" e "Trocar"); "Serviços" (chips com nome e duração, "Outro, sem cadastro" e a soma "2 serviços · 1 h 25 · R$ 150"); "Data" (tira "QUI 18 … TER 23" e "…"); "Horário · livres para 1 h 25" (chips de horário e "Outro horário"); "Adicionar observação"; "Avisar a cliente pelo WhatsApp" com "A IA envia a confirmação no seu estilo"; e o CTA "Criar agendamento · sex 19, 14:00". A nota diz: "O CTA repete a decisão."
3. **O app hoje.** `AppointmentForm.tsx` monta `AppointmentFlowShell` sem `appointmentRoute`. Por isso a tela não é empurrada: abaixo de 1024 px aparece a barra de abas, e o cabeçalho é o da casca dos fluxos ("Voltar" e `h1`, D-098 (f)). De 1024 px em diante, `.agenda-new-layout` põe o formulário à esquerda e `DayList` (`NewAppointmentFields.tsx`), uma coluna de 320 px, à direita. `DayList` mostra o dia escolhido, alimentada por `readOccupancy`, com o novo agendamento pré-visualizado (D-098 (a)). O corpo do formulário já segue a ordem do A6 desde o 083 (D-098 (b)).
4. **Última medida.** No fechamento do 093 (E6 em VALIDATION_GATE), o A6 deu **14,5 / 9,5 / 10,8 / 9,1**, igual ao início daquele Goal. É o maior diff entre os quadros da Agenda medidos ali. O Developer recontará na baseline.
5. **Peças prontas.** `AppointmentFlowShell` faz a composição por largura e chama `useShellConfig` uma vez (D-110 (a)). `AgendaDayColumn` recebe `date` e `appointmentId`. Quando `date` muda, a coluna volta para o novo dia sem remontar. Sem `appointmentId`, nenhuma linha é marcada. `PushedBar` aceita `backIcon="x"` e `title`. A barra da coluna já tem "Novo" para `/agenda/novo`. O botão de criar da Agenda (`AgendaBoard.tsx`) já leva a `/agenda/novo`.
6. **Gate.** `/agenda/novo` está em `AUTHENTICATED_ROUTES` (`name: "agenda-novo"`, `contentMarker: "Novo agendamento"`, D-098 (h)). As medidas gerais do gate autenticado já a abrem. Nenhuma medida confere se a tela é empurrada abaixo de 1024 px, se o CTA está inteiro na janela ou se a coluna fica ao lado de 1024 px em diante.
7. **Aviso à cliente na criação.** Continua aberta a pergunta para uma pessoa de D-098 (e). `CreateAppointmentInput` não tem `notifyCustomer`. Nenhuma decisão posterior a respondeu.

## Escolhas de desenho desta passada

**(a) `/agenda/novo` segue a composição de D-110 (a).** De 1024 px em diante, a coluna da Agenda fica à esquerda e o formulário no painel (`ListDetailLayout`, por meio de `AgendaDayColumn`). Abaixo de 1024 px, a tela é empurrada (`ShellConfig.pushed`): sem barra de abas e sem botão flutuante, com a barra própria `PushedBar` ("×" à esquerda, título "Novo agendamento" centralizado, como no quadro). Estenda `AppointmentFlowShell` **só por acréscimo**: o novo agendamento pede a mesma composição sem agendamento aberto. Detalhe, cancelamento e remarcação não mudam. Bloqueio, série, bloqueio em série e exceções continuam com o cabeçalho de hoje e sem coluna. A rota e o parâmetro `customerId` não mudam. Continua valendo **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031, D-103 (f), D-110 (a)): quem configura a casca é `AppointmentFlowShell`, e a coluna não a chama. O `h1` "Novo agendamento" continua sendo o marcador do gate (`contentMarker`); `e2e/routes.ts` não muda.

**(b) A coluna no novo agendamento.** É a `AgendaDayColumn` do 093, sem mudar o que ela faz nas três rotas dele. Ela mostra o dia da data escolhida no formulário. Quando a pessoa escolhe outra data no formulário, a coluna vai para esse dia. ‹ ›, a tira e "Hoje" da coluna trocam só o dia da coluna; a data do formulário e o CTA não mudam. Nenhuma linha leva `aria-current="page"`, porque nada está aberto. Tocar numa linha abre o detalhe dela, como no 093. Ao sair da rota, a reserva de horário é liberada pelo mecanismo que já existe (`holdSession.ts`, liberação no unmount). Abaixo de 1024 px a coluna não é montada e não faz requisição (D-103 (f)). A coluna faz só as leituras que já faz no 093. Se o gate autenticado estourar o orçamento de requisições, o relatório mede e diz o que foi cortado. A medida não é afrouxada.

**(c) `DayList` sai.** A coluna de 320 px à direita e a pré-visualização do novo agendamento nela saem, porque o A6 não as tem e a coluna da Agenda mostra o dia. Se `DayList` e o estado que só a alimenta ficarem sem uso, apague-os. `readOccupancy` fica enquanto o `ConflictPanel` usar a função. Isso substitui a parte (a) de D-098 que fala da coluna da direita. D-098 não é reescrita; a nova decisão diz o que substitui.

**(d) O corpo é o A6.** Porte o quadro nas quatro larguras: o chip da cliente com avatar e "Trocar", os chips de serviço com duração, "Outro, sem cadastro", a soma, a tira de datas, "Horário · livres para <duração>", os chips de horário, "Outro horário", "Adicionar observação" e o CTA "Criar agendamento · <dia abreviado> <dia>, <hora>". No retrato, use duas colunas, como no quadro. No mobile, use uma coluna com o CTA no rodapé, inteiro na janela. As regras de D-098 (b) a (d) não mudam: criar com um clique, a soma por `agreementTotal` e `totalLabel`, "Outro, sem cadastro" com `serviceIds: []`, `title` e `durationMinutes` e sem `holdId`, a razão do CTA desabilitado e o `ConflictPanel` com motivo. "Agendar série" continua como ação secundária (D-098 (b)), na posição que menos destoar do quadro.

**(e) O aviso à cliente continua fora.** "Avisar a cliente pelo WhatsApp" não é renderizado, por D-098 (e). A pergunta para uma pessoa continua aberta e não é resolvida aqui.

**(f) "×" volta para onde "Voltar" leva hoje** (`/agenda`). O nome acessível do botão é "Fechar" ou "Fechar novo agendamento", e o alvo tem ao menos 24 px.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O aviso de WhatsApp desconectado, o cartão da IA da sidebar com "WhatsApp desconectado" e o item "Notificações" da sidebar (D-102), estado da conta de teste.
3. Os dados: nomes, serviços, durações, preços, dias, horários livres, mês e o conteúdo da lista do dia são os da conta de teste.
4. "Avisar a cliente pelo WhatsApp" ausente, por (e).
5. "Agendar série" presente, por (d).
6. O dia da coluna é o da data do formulário, por (b). No quadro, a coluna mostra hoje e o formulário outro dia.
7. Os valores de cor: a paleta é a de Serviços (D-108 (f)); renomear e reajustar cores é do 095.
8. O chevron ⌄ ao lado do ano na coluna (D-108 (a)).

## Escopo obrigatório

### 1. A6 igual ao quadro

**Porte** o HTML/CSS do quadro. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Agenda.dc.html` ("Novo agendamento", mobile), `Agenda-Tablet.dc.html` ("Agenda / Novo agendamento / Portrait" e "… / Landscape") e `Agenda-Desktop.dc.html` ("Agenda / Novo agendamento / Desktop").

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições, inclusive a coluna da Agenda e o painel. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target A6` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual ao quadro A6 nos 4 devices**. Para cada device, o relatório final traz o diff do início e do fim e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script.

### 2. A Agenda e o resto da área logada não quebram

Rode `npm run visual:compare -- --target A1,A5,A8,A9,A10,A11,H3` no início e no fim e cole o diff de cada device das duas execuções. A coluna é compartilhada com A5, A8 e A9: eles não pioram. O Dia, a Semana, o Mês e a Home também não. Toda piora tem causa medida. `/agenda`, `/agenda/agendamento`, `/agenda/cancelar`, `/agenda/reagendar`, `/agenda/bloquear`, `/agenda/excecoes`, `/agenda/serie` e a casca das outras rotas não mudam.

### 3. Comportamento preservado

- Criar envia o mesmo pedido de hoje, com um clique: `customerId` ou `customerName` e `customerPhone`, `serviceIds`, `holdId` quando há serviço, e `title` e `durationMinutes` em "Outro, sem cadastro".
- `customerId` vindo de `/clientes` (`/agenda/novo?customerId=`) chega escolhido e trocável.
- O `ConflictPanel` continua exigindo decisão explícita com motivo.
- Calendário sem `createAppointments` continua mostrando `ReadOnlyState`.
- O erro de criação continua anunciado por `role="alert"`.
- Depois de criar, a tela vai para onde vai hoje.
- A reserva continua liberada ao trocar de horário e ao sair da rota.

### 4. O gate autenticado ganha G-8

Em `e2e/authenticated-matrix.spec.ts`, **só por acréscimo**, no padrão de G-7, crie **G-8 (novo agendamento)** nas cinco larguras. O teste parte de `/agenda` na data semeada (`ensureAgendaOnMeasuredDate`). Ele abre `/agenda/novo` pelo controle de criar da Agenda (botão flutuante abaixo de 1024 px, "Novo" a partir dele), por clique real, sem `force`.

- Abaixo de 1024 px, ele confere que a barra de abas e o botão flutuante não estão renderizados. Ele confere também que o CTA "Criar agendamento" e o "×" estão visíveis, inteiros na janela e com alvo de ao menos 24 px.
- De 1024 px em diante, ele confere que a coluna da Agenda está à esquerda do formulário, sem sobreposição, e que nenhuma linha dela tem `aria-current="page"`.
- A tela é medida pelas verificações que o gate já aplica às rotas autenticadas (overflow horizontal, axe e foco visível).

Nenhum teste existente muda, nenhuma rota sai e nenhuma largura é cortada. O orçamento de requisições do BFF é medido. Se G-8 não couber, o relatório mede e propõe, sem afrouxar o limite.

### 5. Provas novas

`apps/frontend/tests/goal101-novo-agendamento.test.tsx`, no padrão de `goal093-detalhe-cancelar-remarcar.test.tsx`:

1. **Composição.** De 1024 px em diante, `/agenda/novo` monta a coluna da Agenda e o formulário no painel. Nenhuma linha tem `aria-current="page"`, e `DayList` não é renderizada. Abaixo de 1024 px, a coluna não é montada e os hooks de dados dela não buscam. Nesse caso, `pushed` está ativo, a barra de abas não aparece e a barra tem "×" e o título.
2. **Casca.** Uma chamada de `useShellConfig` por árvore renderizada em `/agenda/novo`, nas duas faixas, no padrão de `goal016-shell-invariant` e `goal093`.
3. **A coluna segue a data do formulário.** Escolher outra data no formulário muda o dia da coluna. ‹ › na coluna mudam o dia dela e não mudam a data do formulário nem o texto do CTA.
4. **Criação preservada.** Com cliente cadastrado e dois serviços, um clique envia o pedido com `customerId`, `holdId` e os dois `serviceIds`. "Outro, sem cadastro" envia `serviceIds: []`, `title` e `durationMinutes`, sem `holdId`. `customerId` da URL chega escolhido.
5. **"×".** O botão leva a `/agenda` e tem o nome acessível de (f). Com horário escolhido, a reserva é liberada ao sair.
6. **Sem aviso.** Não há controle "Avisar a cliente pelo WhatsApp".

As provas 1, 2, 3 e 5 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. As provas 4 e 6 guardam comportamento e podem passar na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 6. Testes existentes

Continuam passando. Muda só asserção que dependa do cabeçalho antigo ("Voltar"), da barra de abas em `/agenda/novo`, de `DayList` ou da pré-visualização. Exemplos: `goal083-new-appointment`, `goal016-appointment-create`, `goal016-shell-invariant` e `goal016-a11y`. Asserção sobre a pré-visualização em `DayList` é reescrita para o que a coluna mostra, ou removida só se a coluna não tiver equivalente, com o motivo. As provas do 093 (`goal093-detalhe-cancelar-remarcar`) não mudam. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A coluna montada abaixo de 1024 px em `/agenda/novo`: a prova 1 reprova.
2. `DayList` de volta à direita do formulário: a prova 1 reprova.
3. A coluna deixa de seguir a data do formulário: a prova 3 reprova.
4. A coluna passa a chamar `useShellConfig`: a prova 2 reprova.

## Pontos de implementação

- `apps/frontend/src/features/agenda/AppointmentFlowShell.tsx`: a composição para o novo agendamento, só por acréscimo.
- `apps/frontend/src/features/agenda/AppointmentForm.tsx` e `NewAppointmentFields.tsx`: o corpo do A6, a barra com "×" e a saída de `DayList`.
- `apps/frontend/src/features/agenda/AgendaDayColumn.tsx`: só o que o novo consumidor exigir, sem mudar o que ela faz nas três rotas do 093.
- `apps/frontend/src/shared/styles/avenly-agenda.css`. `avenly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- `apps/frontend/src/shared/layout/PushedBar.tsx`, `ListDetail.tsx` e `useWideLayout.ts`, só por acréscimo compatível. Clientes, Serviços e Configurações não podem mudar.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/avenly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/authenticated-matrix.spec.ts`, só o acréscimo de G-8.
- `apps/frontend/tests/`: a prova nova e as asserções do §6.

## Fora do escopo

- O A7 (conflito) e o A4 (menu do botão de criar).
- A5, A8 e A9, salvo o que a coluna compartilhada exigir sem mudar a tela, declarado no relatório.
- A1, A2, A3, A10, A11 e A12, e a tela de `/agenda`.
- O aviso à cliente na criação (D-098 (e)): é mudança de contrato e de produto, e a pergunta é de uma pessoa.
- Qualquer mudança em rota, contrato, BFF, IA, `scripts/` (inclusive o seed visual), `docs/design-reference/`, vault, `e2e/routes.ts` e `e2e/visual/targets.json`. Mude o mapa só se um alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-111** em `PROPOSED`, no formato de D-110. Ela diz (a) a (f), com o motivo de cada um, e as divergências declaradas. Ela registra que (a) estende D-110 (a) ao novo agendamento e que (c) substitui a coluna `DayList` e a pré-visualização da parte (a) de D-098. Ela não reescreve D-098, D-103 nem D-110. O "Revisar se" cobre três casos: uma pessoa decidir o aviso à cliente na criação (a opção entra, com contrato novo); o protótipo passar a mostrar a pré-visualização na coluna; um aparelho real mostrar o CTA do rodapé coberto pelo teclado ou pela área segura.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que o novo agendamento segue o A6, com a coluna da Agenda a partir de 1024 px e a tela empurrada abaixo, e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim (A6, A1, A5, A8, A9, A10, A11 e H3) e a medida G-8, com a contagem nova do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita (D-098, D-102, D-103, D-108, D-109, D-110) não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target A6,A1,A5,A8,A9,A10,A11,H3` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target A6`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target A6,A1,A5,A8,A9,A10,A11,H3`.
6. Rodar os quatro controles do §7.
7. Escrever a prosa só depois disso.

Os controles do §7 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Retentativas.** Nos Goals 092, 100 e 093, o `validate:ui` com a configuração padrão (6 workers) teve retentativas em rotas públicas fora da Agenda. A causa medida foi o esgotamento de recurso do host (`Target crashed`, `ERR_INSUFFICIENT_RESOURCES`, tempo esgotado). Com `CI=1`, que a configuração já lê para usar 1 worker, a mesma árvore deu 0 retentativas. No 093, o gate autenticado dentro de `validate:integration` teve também 1 retentativa numa rota de onboarding, com 0 na execução direta. Se acontecer de novo, rode a configuração padrão e `CI=1 npm run validate:ui` na mesma árvore e registre as duas. Para o gate autenticado, rode-o direto na mesma árvore e registre. A configuração não muda.

No relatório, para cada device do A6, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem para diagnóstico. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target A6` e abriu os quatro `side-by-side.png`. O novo agendamento está **igual ao quadro A6 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas, inclusive na coluna da Agenda em paisagem e desktop e nas duas colunas do retrato.
2. A Agenda, os fluxos do 093 e a Home não quebraram: A1, A5, A8, A9, A10, A11 e H3 do início e do fim, com o que mudou descrito. Toda piora tem causa medida.
3. As provas 1, 2, 3 e 5 passam e reprovaram na baseline, salvo asserção declarada. As provas 4 e 6 passam. Os quatro controles do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem os **250** testes da baseline mais os de G-8, com **0** retentativas. O G-8 prova a tela empurrada sem barra de abas nem botão flutuante abaixo de 1024 px, o CTA e o "×" inteiros e com alvo de ao menos 24 px, e a coluna à esquerda sem linha marcada de 1024 px em diante. `validate:ui` passa nas cinco larguras. Retentativa em rota fora da Agenda é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. D-111 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o aviso à cliente na criação, que depende de uma pessoa e de contrato novo; o A7, que fica fora.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; composição de `/agenda/novo` em `AppointmentFlowShell` (coluna à esquerda de 1024 px em diante, tela empurrada com "×" abaixo); a coluna segue a data do formulário; `DayList` sai |
| WU-02 | STANDARD | WU-01 | Corpo igual ao A6 nos quatro devices, com o retrato em duas colunas e o CTA no rodapé do mobile; iteração com `visual:compare -- --target A6` |
| WU-03 | STANDARD | WU-02 | Provas 1 a 6 com o vermelho da baseline; asserções do §6; G-8 no gate autenticado, só por acréscimo |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal101-novo-agendamento` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | `visual:compare` final, controles negativos (§7) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
