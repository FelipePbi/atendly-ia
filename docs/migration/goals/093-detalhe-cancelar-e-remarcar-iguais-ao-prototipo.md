# Goal 093 — Detalhe, cancelar e remarcar iguais ao protótipo

**Status: READY.** Preparado em 2026-10-02 pelo Tech Lead Agent após [Goal100 ACCEPTED](../reviews/100-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: A5, A8, A9

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED) como "Fluxos da Agenda iguais ao protótipo: detalhe, novo, cancelar e remarcar", com os quadros A5, A6, A8 e A9. **READY na v122**, com o mesmo ID e **dividido**: fica com o detalhe (A5), o cancelamento (A8) e a remarcação (A9), e com a coluna da Agenda ao lado deles a partir de 1024 px. O A6 (novo agendamento) vai para o novo **101**, que reaproveita a coluna construída aqui.

## Baseline aceita

Baseline aceita: `a5a04bceedacb7fb88c0fa641f77b76bb0785c49`

Goal anterior: 100 — Agenda Semana e Mês iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal100 já integrado em `main` (origem `1b27dab9f58d730ae26c4d883e9c487bc292538d`). **Quatro rodadas**, com 3, 2, 2 e 0 blockers. **D-109** aceita. A virada de status do documento do Goal100 para `ACCEPTED` entrou no próprio commit de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/agenda/agendamento` igual ao quadro A5, `/agenda/cancelar` igual ao quadro A8 e `/agenda/reagendar` igual ao quadro A9, nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`: os três alvos abrem a rota com `?id={appointmentId}`, que o seed visual resolve para o atendimento de Ana Paula, com o relógio em 13:45.

**Por que agora.** O 092 e o 100 deixaram a Agenda (Dia, Semana e Mês) igual a A1, A10 e A11. Os quadros dos fluxos mostram, de 1024 px em diante, essa mesma Agenda em Dia à esquerda e o fluxo à direita. Ela agora existe e pode ser reaproveitada. D-103 prevê esse caso no "Revisar se": "o produto ganhar lista e detalhe em Conversas ou na Agenda (o padrão passa a valer para elas, ou ganha exceção escrita)".

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`), no código da baseline e nos documentos. Nenhum `visual:compare` de A5, A8 ou A9 foi registrado depois do pente-fino de 2026-10-01 (QA_LOCAL_REVIEW), que os lista como divergentes. O Developer mede na baseline.

1. **Composição por largura.** Em tablet em paisagem (1024×768) e desktop (1366×768), os três quadros têm a Agenda em Dia à esquerda: barra "Setembro 2026", segmentado Dia/Semana/Mês, "Novo", a tira "SEG 15 … DOM 21", "Hoje, quinta 18 · 5 atendimentos · 1 bloqueio" e a lista do dia. O fluxo fica num painel à direita. Em tablet em retrato e no mobile, o fluxo ocupa a tela, sem barra de abas. O A8 é uma sheet (`overlay` e `sheet` no `inventory.json`) sobre o detalhe.
2. **A5, detalhe.** O horário em destaque é "Sexta, 19 de setembro" com "15:30 – 16:15" em Literata e o status "Confirmado" ao lado. A cliente aparece com avatar "AP", "+55 11 99123-4567 · 9 atendimentos" e o botão "Conversa". A seção "Serviços" mostra cada serviço com "45 min · R$ 90" e o "Total". A seção "Lembrete" diz "Será enviado quinta, 18/09 às 15:30, pedindo confirmação.". "Observações" tem "Adicionar" e "Nenhuma observação.". "Histórico" diz "Criado pela IA na conversa com Ana Paula" com data e hora. "Remarcar" e "Cancelar" ficam à mão. A nota do quadro diz: "Editar, Concluir e Não compareceu vivem no •••".
3. **A8, cancelar.** "Cancelar este agendamento?", com o resumo "Ana Paula · Corte feminino" e "sexta, 19/09 às 15:30". A opção "Avisar a cliente pelo WhatsApp" vem marcada, com "A IA envia o aviso e pergunta se ela quer outro horário.". O campo é "Motivo (opcional, só para você)". As ações são "Cancelar agendamento" (vermelho) e "Voltar". A nota diz: "O único botão vermelho do produto". A confirmação é a própria sheet.
4. **A9, remarcar.** Título "Remarcar", com o resumo "AP Ana Paula · Corte feminino · 45 min · R$ 90". No topo, sempre visível, "Horário atual" e "Novo horário". Abaixo, a faixa de datas ("SEX 19 SÁB 20 … ⋯"), "Horário · sábado, livres para 45 min" com os horários e "Outro horário", e "Avisar a cliente pelo WhatsApp" com "Recomendado: a data e o horário mudaram.". O CTA é "Confirmar novo horário". A nota diz que o horário antigo só é liberado quando o novo é confirmado e que o mesmo agendamento é atualizado.
5. **O app hoje.** `AppointmentDetail.tsx` monta `AppointmentFlowShell` (cabeçalho "Voltar", `h1` "Detalhes do agendamento" e descrição), um hero com eyebrow de status, nome, data e serviço, os botões "Reagendar" e "Cancelar agendamento", e as seções "Cliente", "Agendamento" (Data, Horário, Duração, Origem, Valor), "Observações" (só quando há), "Ciclo do atendimento" (`LifecycleActions`, com Concluir, Não compareceu, valor final, confirmação de presença e lembrete) e "Histórico" (`AppointmentHistory`). `CancelFlow.tsx` é uma página com formulário, "Notificar cliente", resumo "O que o cancelamento faz", "Revisar cancelamento" e um diálogo de confirmação, ou seja, dois passos. `RescheduleFlow.tsx` já envia `notifyCustomer`. Nenhuma das três usa `ListDetail`, `PushedBar` ou `useWideLayout` (D-103), e todas mostram a barra de abas abaixo de 1024 px.
6. **Contrato.** `BffCalendarService` não tem operação para editar um agendamento nem para gravar observação depois da criação. "Editar" e "Observações · Adicionar" não têm ação no app. O número de atendimentos da cliente e a conversa dela não vêm no agendamento. `CustomerProfile.tsx` obtém a conversa com `conversations.list({ customerId, limit: 1 })`.
7. **Gate.** O gate autenticado só chega ao detalhe pelo teste "conversas: the appointment-created event's "Ver" opens the agenda detail", que confere a URL e não mede a tela. `e2e/routes.ts` não tem `/agenda/agendamento`, `/agenda/cancelar` nem `/agenda/reagendar`. Hoje nenhuma medida de largura, toque, contraste ou foco cobre essas três telas.

## Escolhas de desenho desta passada

**(a) O padrão de D-103 vale para a Agenda.** De 1024 px em diante, `/agenda/agendamento`, `/agenda/cancelar` e `/agenda/reagendar` mostram a coluna da Agenda à esquerda e o fluxo no painel. Abaixo de 1024 px, o fluxo é a tela empurrada (`ShellConfig.pushed`), sem barra de abas, sem botão flutuante e com `PushedBar`. Use `ListDetail`, `PushedBar` e `useWideLayout`; não crie padrão próprio da Agenda. As rotas e os parâmetros (`id`) não mudam. Continua valendo uma chamada de `useShellConfig` por árvore renderizada (D-030, D-031, D-103 (f)): quem configura a casca é a tela da rota, e a coluna não se configura sozinha.

**(b) A coluna da Agenda.** Ela mostra o Dia da data do agendamento aberto, como nos quadros: a barra de D-108 com "Dia" marcado, a tira da semana, o título do dia e a lista do A1, com a cor do serviço. O atendimento aberto fica marcado, com `aria-current="page"` em exatamente uma linha. Tocar noutra linha abre o detalhe dela. ‹ ›, a tira e "Hoje" trocam o dia da coluna. "Novo" abre `/agenda/novo`. "Semana" e "Mês" levam a `/agenda`. Reaproveite os componentes do Dia (`DayView.tsx` e `occupancy.ts`) sem mudar o Dia de `/agenda`. Abaixo de 1024 px a coluna não é montada e não faz requisição (D-103 (f)). Ela faz no máximo as leituras de que o Dia precisa para uma data. Se a coluna estourar o orçamento de requisições do gate autenticado, o relatório mede e diz o que foi cortado. A medida não é afrouxada.

**(c) O detalhe é o A5.** Porte o quadro: o horário em destaque, o status ao lado, a cliente com avatar, telefone formatado (D-099) e "Conversa", "Serviços" com duração, preço e total, "Lembrete", "Observações" e "Histórico" com autoria. "Remarcar" e "Cancelar" ficam à mão, na posição do quadro (no rodapé fixo da tela empurrada). Concluir, Não compareceu, valor final e confirmação de presença, que `LifecycleActions` já oferece, passam para o menu "•••" da barra. Continuam disponíveis só onde estão hoje (fonte `ATENDLY` e estado que os permite). Nenhuma ação some.

**(d) Dado que o app não tem não é inventado.** "Editar" não entra no menu, e "Adicionar" em Observações não aparece, porque o contrato não tem essas operações. As observações gravadas na criação aparecem; sem elas, "Nenhuma observação.". "N atendimentos" e "Conversa" só aparecem quando há `customerId` e a leitura existente responde: `customers.get` para a contagem, se o DTO a tiver, e `conversations.list({ customerId, limit: 1 })` para a conversa, como em `CustomerProfile.tsx`. Se falharem, a linha mostra só o telefone e o botão não aparece, sem erro na tela. O texto do lembrete vem do estado do lembrete que `LifecycleActions` e `goal021` já leem, nunca de uma data calculada na tela. O histórico vem de `AppointmentHistory`.

**(e) Cancelar é o A8, em um passo.** A sheet é a confirmação explícita. "Cancelar agendamento" cancela no toque, e o diálogo "Revisar cancelamento" sai, como D-098 (c) fez com a criação. Abaixo de 1024 px, a sheet abre sobre o detalhe do mesmo agendamento, que fica inerte atrás. O foco fica na sheet. "Voltar" e Esc voltam a `/agenda/agendamento?id=…`. De 1024 px em diante, o painel segue o quadro de paisagem e desktop. "Avisar a cliente pelo WhatsApp" vem marcado, como hoje (`notifyCustomer`). Os textos do quadro só entram se forem verdade no sistema. O Developer confere no código e no vault se a notificação de cancelamento pergunta por outro horário e se o motivo (`comments`) fica fora da mensagem à cliente. O que não for verdade mantém o texto atual, e a divergência é declarada. "Cancelar agendamento" é o único botão vermelho da tela.

**(f) Remarcar é o A9.** Porte o quadro: o resumo com avatar, "Horário atual" e "Novo horário" fixos no topo enquanto se escolhe, a faixa de datas, "Horário · <dia>, livres para <duração>", "Outro horário", "Avisar a cliente pelo WhatsApp" marcado com o texto do quadro, e o CTA "Confirmar novo horário". A regra não muda: os mesmos horários livres, a mesma reserva e o mesmo `notifyCustomer` que `RescheduleFlow.tsx` já usa. O mesmo agendamento é atualizado.

**(g) Texto e nomes acessíveis.** "Reagendar" passa a "Remarcar", como no quadro e no vault. Antes de trocar, o Developer confere o vocabulário em `docs/product-vault/` (busca dirigida, uma a três notas). Os nomes acessíveis dos botões seguem o texto visível.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O aviso de WhatsApp desconectado, o cartão da IA da sidebar com "WhatsApp desconectado" e o item "Notificações" da sidebar (D-102), estado da conta de teste.
3. Os dados: nomes, horários, contagens, mês e o conteúdo da lista do dia são os da conta de teste.
4. "Editar" no menu e "Adicionar" em Observações, por (d).
5. "N atendimentos" e "Conversa", quando a conta de teste não tem o dado.
6. Texto do A8 que não for verdade no sistema, por (e).
7. Os valores de cor: a paleta é a de Serviços (D-108 (f)); renomear e reajustar cores é do 095.
8. O chevron ⌄ ao lado do ano na coluna (D-108 (a)).

## Escopo obrigatório

### 1. A5, A8 e A9 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Agenda.dc.html` ("Agendamento · detalhe", "Agendamento · cancelar" e "Agendamento · remarcar", mobile), `Agenda-Tablet.dc.html` ("Agenda / Agendamento · detalhe / Portrait" e "… / Landscape", idem para "cancelar" e "remarcar") e `Agenda-Desktop.dc.html` ("Agenda / Agendamento · detalhe / Desktop", idem para os outros dois).

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições, inclusive a coluna da Agenda e o painel. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target A5,A8,A9` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual ao quadro A5, ao quadro A8 e ao quadro A9 nos 4 devices**. Para cada device, o relatório final traz o diff do início e do fim e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script.

### 2. A Agenda e o resto da área logada não quebram

Rode `npm run visual:compare -- --target A1,A6,A10,A11,H3` no início e no fim e cole o diff de cada device das duas execuções. O Dia (A1), a Semana (A10), o Mês (A11), o novo agendamento (A6) e a Home (H3) não pioram, e toda piora tem causa medida. `/agenda` não muda: a coluna reaproveita componentes do Dia, mas não muda a tela do Dia. `/agenda/novo`, `/agenda/bloquear`, `/agenda/excecoes`, `/agenda/serie` e a casca das outras rotas não mudam. `/agenda/novo` só pode mudar no que um componente compartilhado exigir sem alterar a tela, e o relatório declara o que mudou.

### 3. Comportamento preservado

- Cancelar envia o mesmo pedido de hoje (`cancelAppointment` com `comments` e `notifyCustomer`). Remarcar envia o mesmo pedido de hoje, com a mesma reserva de horário e o mesmo `notifyCustomer`. Concluir, Não compareceu, valor final e confirmação de presença fazem as mesmas chamadas e atualizam o detalhe e o histórico como hoje.
- Fonte que não é `ATENDLY` e agendamento que não está ativo continuam sem as ações que hoje não têm (`ReadOnlyState`, `writable`, `lifecycleAvailable`).
- Agendamento inexistente ou leitura falhada mostram o estado de erro atual, com caminho de volta à Agenda.
- O "Ver" da conversa continua abrindo `/agenda/agendamento?id=`. O teste do gate que o prova não muda.
- A sobreposição de horário na remarcação continua exigindo decisão explícita com motivo (`ConflictPanel`).

### 4. O gate autenticado ganha G-7

Em `e2e/authenticated-matrix.spec.ts`, **só por acréscimo**, no padrão de G-4 e G-5 (D-103), crie **G-7 (detalhe do agendamento)** nas cinco larguras. O teste parte de `/agenda` na data semeada (`ensureAgendaOnMeasuredDate`) e abre o atendimento semeado por clique real, sem `force`. Abaixo de 1024 px, ele confere que a barra de abas não está renderizada, que "Remarcar" e "Cancelar" estão visíveis e inteiros e que os dois têm alvo de ao menos 24 px. De 1024 px em diante, ele confere que a coluna da Agenda está ao lado, com exatamente uma linha `aria-current="page"`, a do atendimento aberto. A tela é medida pelas verificações que o gate já aplica às rotas autenticadas (overflow horizontal, axe e foco visível). Nenhum teste existente muda, nenhuma rota sai e nenhuma largura é cortada. O orçamento de requisições do BFF é medido. Se G-7 não couber, o relatório mede e propõe, sem afrouxar o limite.

### 5. Provas novas

`apps/frontend/tests/goal093-detalhe-cancelar-remarcar.test.tsx`, no padrão de `goal088-list-detail.test.tsx` e `goal100-agenda-semana-mes.test.tsx`:

1. Composição: de 1024 px em diante, o detalhe, o cancelamento e a remarcação montam a coluna da Agenda com exatamente uma linha `aria-current="page"`, a do agendamento aberto. Abaixo de 1024 px, a coluna não é montada, os hooks de dados dela não buscam, `pushed` está ativo e a barra de abas não aparece.
2. Uma chamada de `useShellConfig` por árvore renderizada nas três rotas, nas duas faixas, no padrão de `goal016-shell-invariant` e `goal088-list-detail`.
3. Detalhe: horário em destaque e status, cliente com telefone formatado, serviços com duração, preço e total, lembrete a partir do estado lido, histórico com autoria. "Remarcar" e "Cancelar" levam às rotas certas. Concluir e Não compareceu estão no menu "•••", com as mesmas chamadas. Não há "Editar" nem "Adicionar".
4. Detalhe: com `customerId`, "Conversa" leva a `/conversas/<id>` da primeira conversa da cliente. Sem `customerId`, ou com a leitura falhada, o botão não aparece e a tela não mostra erro.
5. Cancelar: um toque em "Cancelar agendamento" envia `cancelAppointment` uma vez, com `comments` e `notifyCustomer` (marcado por padrão; desmarcado envia `false`), sem diálogo intermediário. "Voltar" leva ao detalhe do mesmo id.
6. Remarcar: "Horário atual" e "Novo horário" mudam conforme a escolha. "Confirmar novo horário" envia o mesmo pedido de hoje, com `notifyCustomer` marcado por padrão.
7. Fonte que não é `ATENDLY`, ou agendamento cancelado, não oferece Remarcar, Cancelar nem as ações do menu.

As provas 1 a 7 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 6. Testes existentes

Continuam passando. Muda só asserção que dependa do texto ou da estrutura antiga do detalhe, do cancelamento em dois passos ou de "Reagendar". Exemplos: `goal016-lifecycle-history`, `goal016-a11y`, `goal016-shell-invariant`, `goal021-notify-and-reminder-state`, `goal069-appointment-detail` e `goal084-phone-display`. Asserção sobre o diálogo de cancelamento é reescrita para o passo único de (e), não removida. Ação que foi para o menu "•••" é reescrita para abrir o menu antes, não removida. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A coluna da Agenda montada abaixo de 1024 px: a prova 1 reprova.
2. A coluna passa a chamar `useShellConfig`: a prova 2 reprova.
3. O cancelamento volta a pedir o diálogo antes de enviar: a prova 5 reprova.
4. "Conversa" aparece sem `customerId`: a prova 4 reprova.

## Pontos de implementação

- `apps/frontend/src/features/agenda/AppointmentDetail.tsx`, `CancelFlow.tsx`, `RescheduleFlow.tsx`, `LifecycleActions.tsx`, `AppointmentHistory.tsx` e `AppointmentFlowShell.tsx`: o corpo dos três fluxos, o menu "•••" e a composição com `ListDetail` e `PushedBar`.
- Um componente novo da coluna da Agenda em `features/agenda/` (por exemplo, `AgendaDayColumn.tsx`). Ele reaproveita `DayView.tsx` e `occupancy.ts` sem mudar a tela de `/agenda`. Mexa em `AgendaBoard.tsx` só no que a coluna precisar exportar.
- `apps/frontend/src/shared/layout/ListDetail.tsx`, `PushedBar.tsx` e `useWideLayout.ts`, só por acréscimo compatível. Clientes, Serviços e Configurações não podem mudar.
- `apps/frontend/src/shared/styles/atendly-agenda.css`. `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/authenticated-matrix.spec.ts`, só o acréscimo de G-7.
- `apps/frontend/tests/`: a prova nova e as asserções do §6.

## Fora do escopo

- O A6 (novo agendamento), que é do 101, e o A7 (conflito). `/agenda/novo` mantém a coluna `DayList` de D-098 (a) até o 101.
- A2, A3, A4, A10, A11 e A12, e a tela de `/agenda`.
- Editar agendamento, gravar observação depois da criação, ler holds, mudar o texto ou a regra do lembrete e da notificação de cancelamento: são mudanças de contrato ou de produto.
- Qualquer mudança em rota, contrato, BFF, IA, `scripts/` (inclusive o seed visual), `docs/design-reference/`, vault e `e2e/visual/targets.json`. Mude o mapa só se um alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-110** em `PROPOSED`, no formato de D-108 e D-109. Ela diz (a) a (g), com o motivo de cada um, e as divergências declaradas. Ela registra que (a) estende D-103 à Agenda e que (e) faz o cancelamento em um passo. Ela não reescreve D-098, D-103, D-108 nem D-109. O "Revisar se" cobre três casos: o contrato ganhar edição de agendamento ou observação posterior ("Editar" e "Adicionar" entram); o 101 levar a coluna ao novo agendamento (a coluna passa a ter mais um consumidor); um aparelho real mostrar a sheet do A8 ou o rodapé fixo do A5 errados.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que detalhe, cancelamento e remarcação seguem A5, A8 e A9, com a coluna da Agenda a partir de 1024 px, e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim (A5, A8, A9, A1, A6, A10, A11 e H3) e a medida G-7, com a contagem nova do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita (D-098, D-099, D-102, D-103, D-108, D-109) não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target A5,A8,A9,A1,A6,A10,A11,H3` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target A5,A8,A9`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target A5,A8,A9,A1,A6,A10,A11,H3`.
6. Rodar os quatro controles do §7.
7. Escrever a prosa só depois disso.

Os controles do §7 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Retentativas do `validate:ui`.** Nos Goals 092 e 100, o `validate:ui` com a configuração padrão (6 workers) teve retentativas e, uma vez, falhas, todas em rotas públicas fora da Agenda. A causa medida foi o esgotamento de recurso do host: `Target crashed`, `ERR_INSUFFICIENT_RESOURCES`, pouca memória livre. Com `CI=1`, que a configuração já lê para usar 1 worker, a mesma árvore deu 0 retentativas. Se acontecer de novo, rode a configuração padrão e `CI=1 npm run validate:ui` na mesma árvore e registre as duas. A configuração não muda.

No relatório, para cada device do A5, do A8 e do A9, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem para diagnóstico. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target A5,A8,A9` e abriu os doze `side-by-side.png`. O detalhe está **igual ao quadro A5 nos 4 devices**, o cancelamento está **igual ao quadro A8 nos 4 devices** e a remarcação está **igual ao quadro A9 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas, inclusive na coluna da Agenda em paisagem e desktop.
2. A Agenda, o novo agendamento e a Home não quebraram: A1, A6, A10, A11 e H3 do início e do fim, com o que mudou descrito. Toda piora tem causa medida.
3. As provas 1 a 7 passam e reprovaram na baseline, salvo asserção declarada. Os quatro controles do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem os **245** testes da baseline mais os de G-7, com **0** retentativas. O G-7 prova a tela empurrada sem barra de abas abaixo de 1024 px, "Remarcar" e "Cancelar" com alvo de ao menos 24 px, e a coluna com uma linha marcada de 1024 px em diante. `validate:ui` passa nas cinco larguras. Retentativa em rota fora da Agenda é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. D-110 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o detalhe com contagem de atendimentos e conversa, se a conta de teste não os tiver; editar agendamento e gravar observação depois da criação, que o contrato não tem; o A6, que é do 101.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; coluna da Agenda e composição com `ListDetail`/`PushedBar` nas três rotas; detalhe igual ao A5, com o menu "•••" |
| WU-02 | STANDARD | WU-01 | Cancelamento igual ao A8 em um passo, com a sheet sobre o detalhe abaixo de 1024 px; remarcação igual ao A9; iteração com `visual:compare -- --target A5,A8,A9` |
| WU-03 | STANDARD | WU-02 | Provas 1 a 7 com o vermelho da baseline; asserções do §6; G-7 no gate autenticado, só por acréscimo |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal093-detalhe-cancelar-remarcar` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | `visual:compare` final, controles negativos (§7) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
