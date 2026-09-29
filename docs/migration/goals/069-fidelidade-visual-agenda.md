# Goal 069 — Fidelidade visual: Agenda

**Status: ACCEPTED.** Preparado em 2026-09-29 pelo Tech Lead Agent após [Goal074 ACCEPTED](../reviews/074-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID. **A v95 divide a linha**: este Goal fica só com a Agenda e passa a se chamar "Fidelidade visual: Agenda" (até a v94, "Fidelidade visual: Agenda, Clientes, Serviços, Conversas e Notificações"). Clientes, Serviços, Conversas e Notificações formam o novo **075**, PLANNED, logo depois deste. Motivo da divisão: a Agenda sozinha tem doze achados (AG-01…AG-12) sobre 24 arquivos e cerca de 5 800 linhas em `features/agenda/`; os Goals de interface de uma tela só (015, 016, 017) levaram de três a quatro rodadas, o 068 levou cinco e o 074 quatro. Entram também as observações 2 e 4 do [review073](../reviews/073-review.md), dirigidas a este Goal na v93.

## Baseline aceita

Baseline aceita: `37c7371659a8fa328d896a282b9479842a188ce7`

Goal anterior: 074 — A Home conforme o protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal074 já integrado em `main` (origem `6b4ee334cb5f0ed3ad038b44bb3b063e45cb5075`). O commit documental `b250fa3`, posterior, só vira o status do documento do Goal074 para `ACCEPTED` e não muda código. **Quatro rodadas**, com 6, 3, 3 e 0 blockers. **D-088** foi aceita e [FINAL_AUDIT §49](../FINAL_AUDIT.md) escrita sem reescrever §4 a §48. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review074](../reviews/074-review.md), rodada 4: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **100** arquivos e **1048** testes; `test:ai-orchestrator` **1133**/**1226** (**93** pulados); `test:scheduling-service` **36** arquivos e **491** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos; gate autenticado com **155** testes e **0** retentativas. As duas últimas vêm da execução do Developer do 074 contra PostgreSQL descartável, não reproduzida no IA Loop.

## Objetivo e posição

Fazer a Agenda (`/agenda` e as telas de `features/agenda/`) bater com os protótipos `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html` (`docs/design-reference/claude-design/prototype/project/`), consultados só no estado necessário:

1. **Uma barra superior só**: mês e ano, o segmentado Dia · Semana · Mês, ‹ ›, e "+ Novo" (AG-01, AG-11).
2. **"+ Novo" oferece os três tipos**: Agendamento, Compromisso pessoal e Bloqueio (AG-02).
3. **A faixa da semana** no Dia, com ponto nos dias que têm atendimento, e, a partir de 1024 px, **lista do dia e painel de detalhe em duas colunas** (AG-01).
4. **Dia vazio com contexto** (AG-03), **bloco da Semana com nome e serviço** (AG-04), **Mês que não pula de mês** (AG-05) e **"Próximo agendamento" relativo a agora, em todas as visualizações** (AG-06).
5. **O detalhe sem ID interno** (AG-07), **com telefone mascarado** (AG-08) e **sem ações de fim em atendimento futuro** (AG-09).
6. **Nenhuma copy técnica** (AG-10) e **a marca no topo do trilho** em 768 e 1024 px (AG-12).

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **AG-01…AG-12**. Entram também as observações 2 e 4 do [review073](../reviews/073-review.md). Os achados CL-01…CL-03, SV-03…SV-05, CV-05, NT-01 e NT-02 são do Goal075.

O vault define a Agenda como fonte única da operação (`AGENTS.md`) e já fixou, pelo Goal073 e por D-086, como ela abre ("Como você vê a Agenda": Automática, Semana a partir de 1024 px e Dia abaixo, ou a visualização gravada, sem os dias ocultos). Este Goal não muda essas regras; muda a forma.

## O que a evidência desta passada mostra

Conferido no código da baseline `37c7371`:

1. **A tela tem cabeçalho, faixa e botões que o protótipo não tem.** `apps/frontend/src/features/agenda/AgendaBoard.tsx:236-259` renderiza o cabeçalho "Operação diária" com "Agendamentos reais da fonte oficial do negócio.", e três botões soltos: "Exceções do dia" e "Bloquear horário" (quando `capabilities.manageAvailability`) e "Novo agendamento" (quando `capabilities.createAppointments`). Logo abaixo vem `SourceStrip` (linhas 416-420: "Agenda Atendly é a fonte oficial" com o selo "Operacional"). No celular, `useShellConfig` (linha 183) ainda publica a ação "Novo agendamento", que a casca desenha como FAB (`AppShell.tsx:319-321`), repetindo o botão (AG-01, AG-02).
2. **Compromisso pessoal já existe, mas escondido.** `BlockForm.tsx` tem os dois tipos (`BLOCK` e `PERSONAL`, linhas 26-48) com o mesmo `POST /v1/time-blocks`, e abre sempre em `BLOCK`. Nada precisa mudar no contrato para "+ Novo" oferecer os três tipos (AG-02).
3. **O dia vazio não sabe se a pessoa atende.** `DayView.tsx:62` diz só "Nenhum evento neste dia." A Agenda lê preferência de visualização e calendário (`AgendaBoard.tsx:105-160`), mas não a disponibilidade; `settings` tem `GET /v1/settings/availability`, usado por Configurações (AG-03).
4. **"Próximo agendamento" é o primeiro da janela navegada.** `AgendaBoard.tsx:180-182` ordena os agendamentos ativos **carregados para a visualização** e pega o primeiro, mesmo que já tenha passado; a observação da revisão local (`QA_LOCAL_REVIEW.md:456`) confirma que no Dia 29/09 ele mostrava 29/09 12:00 enquanto o próximo real era 28/09 10:00 (AG-06). A mudança de visualização só troca `view` e mantém `cursor` (`AgendaBoard.tsx:218-224`), então o mês aberto a partir da Semana é o do `cursor`, que pode ser outro mês que o da semana vista (AG-05).
5. **O histórico mostra o identificador cru.** `AppointmentHistory.tsx:113` imprime `Por {event.actor}`. O Scheduling grava o `actor` que o chamador manda (`apps/scheduling-service/src/modules/internal-api/routes.ts:736`, `body.actor`), e o BFF manda o identificador do usuário autenticado (`context.userId`, como em `apps/bff/src/modules/customers/routes.ts:64-250`); o valor que a revisão local viu, `cmujca5al0000zoi4xr95yrxk`, é esse identificador. O tenant tem um usuário só, `role: "OWNER"` (`tenantSchema`, `packages/public-api-contract/src/schemas.ts:34-40`), e a sessão do frontend (`GET /v1/auth/session`, lida em `shared/runtime/ProductRuntime.tsx:48`) traz `user.id`, `user.name` e `user.email`. A tela pode resolver o autor sem mudar contrato (AG-07).
6. **As ações de fim só olham o status.** `LifecycleActions.tsx:159-160`: `canComplete = status === "CONFIRMED"` e `canMarkNoShow` para `CONFIRMED` ou `COMPLETED`, sem olhar o horário (AG-09).
7. **O telefone do detalhe já passa por `displayPhone`** (`AppointmentDetail.tsx:124`, `shared/phone.ts`), que devolve o valor cru quando o número não é reconhecido como brasileiro de 12 ou 13 dígitos. O caso da revisão local precisa ser reproduzido antes de mudar código (AG-08).
8. **A copy técnica está em quatro telas.** `AgendaBoard.tsx:240` e `:280` ("fonte oficial"), `AppointmentDetail.tsx:73` ("Dados persistidos na fonte oficial do negócio."), `AppointmentForm.tsx:306` ("… um horário disponível na fonte oficial.") (AG-10). Os testes `goal016-agenda-reachability` e `goal016-exceptions-source` citam essa copy.
9. **O trilho esconde a marca.** Abaixo de 1100 px, `atendly.css:2137-2155` põe o shell em trilho de 88 px e esconde `.sidebar .brand span`, entre outros; o protótipo mantém a marca no topo do trilho (AG-12).
10. **Configurações › Agenda deixa ocultar os sete dias.** `CalendarSettings.tsx:241-251` alterna qualquer dia sem limite; o BFF recusa mais de seis, e a tela só diz "Não foi possível salvar as preferências da Agenda." (observação 4 do review073).
11. **O gate autenticado navega a Agenda por nome de botão.** `apps/frontend/e2e/authenticated-matrix.spec.ts:560-591` (`ensureAgendaOnMeasuredDate`) clica "Próximo dia" ou "Dia anterior" e, se o botão não existe (Semana ou Mês), assume que o dia semeado está na janela corrente, o que falha na virada de domingo para segunda (observação 2 do review073). `apps/frontend/e2e/routes.ts:43` reconhece a Agenda por `contentMarker: "Agenda"`.

## Escolhas de desenho desta passada

- **Só frontend.** Nenhum contrato, rota, schema do BFF, migration ou serviço muda. Tudo o que a Agenda nova mostra já tem fonte: calendário, agendamentos, bloqueios, exceções, disponibilidade, preferência de visualização e sessão.
- **A barra superior** tem, nesta ordem: mês e ano do dia focado, o segmentado Dia · Semana · Mês numa linha em toda largura a partir de 360 px, ‹ › com nomes acessíveis que dizem a unidade ("Dia anterior", "Próximo dia", "Semana anterior", "Próxima semana", "Mês anterior", "Próximo mês"), e "+ Novo". Sai o cabeçalho "Operação diária", sai `SourceStrip`. O `<h1>` "Agenda" continua na página, visível ou acessível, porque o gate reconhece a tela por ele.
- **"+ Novo"** é um botão que abre um menu com Agendamento (`/agenda/novo`), Compromisso pessoal (`/agenda/bloquear` com o tipo `PERSONAL` já escolhido) e Bloqueio (`/agenda/bloquear`, tipo `BLOCK`). Cada item só aparece com a capacidade que já o governa hoje (`createAppointments` ou `manageAvailability`); sem nenhuma, o botão não aparece. O menu fecha com Escape e devolve o foco ao botão. A ação publicada para o FAB passa a ser o mesmo "+ Novo", ou sai, mas **não há dois pontos de entrada com o mesmo destino na mesma tela**. `BlockForm` aceita o tipo inicial pela URL, sem mudar o que grava.
- **"Exceções do dia" continua alcançável**: sai da barra e fica no Dia, junto do dia focado, ou no menu, à escolha do Developer, declarada no relatório. Nenhuma capacidade da Agenda some.
- **A faixa da semana** aparece no Dia, com os sete dias da semana do dia focado, menos os dias ocultos pela preferência (D-086), e um ponto nos dias que têm agendamento ativo. Tocar num dia foca esse dia. Para ter os pontos, o Dia lê a semana inteira, não só o dia.
- **Duas colunas a partir de 1024 px, no Dia**: a lista do dia à esquerda e o painel de detalhe do agendamento selecionado à direita, sem sair de `/agenda`. Abaixo de 1024 px, tocar no agendamento continua levando a `/agenda/agendamento?id=…`. A página de detalhe continua existindo para link direto e para o celular. O painel reusa os componentes do detalhe (`AppointmentDetail`, `LifecycleActions`, `AppointmentHistory`); não duplica regra.
- **Dia vazio**: "Nenhum atendimento neste dia." e, quando a disponibilidade diz que o negócio não atende nesse dia da semana ou uma exceção fecha o dia, o motivo "Você não atende neste dia."; com `createAppointments`, a ação "Criar agendamento". Se a leitura da disponibilidade falhar, o motivo não aparece e o resto continua.
- **Bloco da Semana**: nome do cliente e serviço dentro do bloco, com filete na cor do serviço quando houver; o estado continua legível. Bloco curto demais mostra ao menos o nome, truncado com reticências, e o nome acessível do bloco tem nome, serviço e horário.
- **Troca de visualização preserva o dia focado**: Semana → Mês abre o mês que contém o dia focado; se o dia focado não pertence à semana vista, usa a segunda-feira dela. Mês → Dia continua focando o dia tocado.
- **"Próximo agendamento" é relativo a agora**: o primeiro agendamento ativo com início a partir de agora, no fuso do calendário, lido por uma consulta própria de hoje em diante (a mesma leitura de agendamentos que a Agenda já faz, com janela que começa hoje), independente da data navegada. Aparece em Dia, Semana e Mês, e some quando não há nenhum.
- **Autor no histórico**: quando `actor` é o `user.id` da sessão, mostra o nome da pessoa, ou o e-mail se não houver nome; qualquer outro valor não é exibido. O rótulo da origem ("IA", "Equipe", "Automático", "Integração") continua. Nenhum identificador interno aparece.
- **Ações de fim** ("Concluir atendimento" e "Marcar falta") só aparecem quando o início do atendimento já chegou. Cancelar e remarcar não mudam. A regra do servidor não muda neste Goal; se o Scheduling aceitar concluir atendimento futuro por outro caminho, isso é registrado como divergência, não corrigido aqui.
- **Telefone**: o detalhe mostra o telefone formatado. Se o caso de AG-08 for um número que `displayPhone` não reconhece, o Developer o reproduz primeiro com o valor real da revisão local, corrige o formatador compartilhado sem mudar o que é gravado, e cita o valor no relatório. Se a baseline já formata o caso, o relatório diz isso com o teste que prova, e AG-08 fecha sem mudança de código.
- **Marca no trilho**: de 768 a 1099 px, o trilho começa pela marca (o símbolo, sem o nome), acima do avatar do negócio.
- **Configurações › Agenda**: com seis dias ocultos, o sétimo não pode ser ocultado; o controle fica desabilitado com o motivo visível ("Pelo menos um dia precisa aparecer na Agenda."). Uma recusa do servidor por esse motivo mostra a mesma frase, não a genérica.
- **Gate autenticado**: `ensureAgendaOnMeasuredDate` passa a navegar até a data semeada na unidade da visualização aberta (dias, semanas ou meses), com os nomes acessíveis novos, em vez de assumir que a data está na janela corrente.

## Fora do escopo

- Clientes, Serviços, Conversas e a central de notificações (CL-01…CL-03, SV-03…SV-05, CV-05, NT-01, NT-02): Goal075. O onboarding fiel ao protótipo: Goal072.
- As observações 1 a 7 do [review074](../reviews/074-review.md). A 1 (comentários com destino errado em `packages/public-api-contract` e nos clientes do BFF) vai para o Goal075, que toca o BFF; as outras são registro ou dependem de dado de pausa, conforme MIGRATION_STATUS.
- Regra de agenda, de ocupação, de política de cancelamento (D-086), de hold, de série e de recorrência. Os formulários de agendamento, bloqueio, série, cancelamento e remarcação só mudam na copy de AG-10 e no tipo inicial de `BlockForm`.
- "Como você vê a Agenda" (D-086): continua como está.
- `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/`, `apps/evolution-go/`, `scripts/` e `tools/ia-loop/`.

## Dependências e contexto mínimo

- Goal074 ACCEPTED (baseline acima). O Goal016 fez a Agenda operacional, o Goal073 fixou "Como você vê a Agenda" e a política, o Goal058 a casca e o gate que mede a composição, o Goal068 a marca e a assinatura na sidebar, e o Goal074 a Home, que leva a "/agenda/novo".
- Arquivos de partida: `features/agenda/AgendaBoard.tsx`, `DayView.tsx`, `WeekView.tsx`, `MonthView.tsx`, `AppointmentDetail.tsx`, `AppointmentHistory.tsx`, `LifecycleActions.tsx`, `AppointmentForm.tsx`, `BlockForm.tsx`, `occupancy.ts`; `features/settings/CalendarSettings.tsx`; `shared/layout/AppShell.tsx`; `shared/phone.ts`; `shared/styles/atendly.css`; `e2e/authenticated-matrix.spec.ts` (só `ensureAgendaOnMeasuredDate`).
- Testes de partida: os `goal016-*` e `goal073-*` que montam a Agenda ou Configurações › Agenda, `goal015-shell-invariant`, `goal058-*` e `goal068-*` que montam a casca.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Barra superior, "+ Novo", faixa da semana, copy, marca no trilho | `features/agenda/AgendaBoard.tsx`, `BlockForm.tsx`, `shared/layout/AppShell.tsx`, `shared/styles/atendly.css` |
| Visualizações, duas colunas, dia vazio, próximo agendamento | `features/agenda/AgendaBoard.tsx`, `DayView.tsx`, `WeekView.tsx`, `MonthView.tsx`, `occupancy.ts` |
| Detalhe, histórico, ações de fim, telefone, copy | `features/agenda/AppointmentDetail.tsx`, `AppointmentHistory.tsx`, `LifecycleActions.tsx`, `AppointmentForm.tsx`, `shared/phone.ts` |
| Configurações › Agenda | `features/settings/CalendarSettings.tsx` |
| Gate autenticado | `e2e/authenticated-matrix.spec.ts`, só `ensureAgendaOnMeasuredDate` |
| Testes | `apps/frontend/tests/goal069-*.test.tsx` |

## Escopo obrigatório

### 1. Estrutura da Agenda (AG-01, AG-02, AG-10, AG-11, AG-12)

- Barra superior única, conforme as escolhas de desenho. Saem o cabeçalho "Operação diária", `SourceStrip` e os três botões soltos.
- "+ Novo" com os três tipos, governado pelas capacidades de hoje, com teclado e foco conforme as escolhas de desenho. Sem ponto de entrada duplicado no celular.
- `BlockForm` abre no tipo pedido pela URL.
- "Exceções do dia" continua alcançável.
- Nenhuma destas copies aparece em `/agenda`, na página de detalhe nem no formulário de agendamento: "fonte oficial", "Operação diária", "persistidos", "Operacional". O estado de calendário sem fonte escolhida continua existindo, com copy sem esses termos.
- O segmentado não quebra linha em 360 e 390 px.
- A marca no topo do trilho, de 768 a 1099 px.

### 2. Visualizações (AG-01, AG-03, AG-04, AG-05, AG-06)

- Faixa da semana no Dia, com pontos, sem os dias ocultos.
- Duas colunas no Dia a partir de 1024 px; abaixo disso, a navegação para a página de detalhe continua.
- Dia vazio com o motivo e a ação, conforme as escolhas de desenho.
- Bloco da Semana com nome e serviço.
- Troca de visualização preservando o dia focado.
- "Próximo agendamento" relativo a agora, em Dia, Semana e Mês.
- A preferência de visualização (D-086) continua decidindo como a Agenda abre, e os dias ocultos continuam ocultos em Semana e na faixa.

### 3. Detalhe do agendamento (AG-07, AG-08, AG-09, AG-10)

- Histórico sem identificador interno, conforme as escolhas de desenho.
- Telefone formatado, conforme as escolhas de desenho.
- "Concluir atendimento" e "Marcar falta" só a partir do início do atendimento.
- Copy sem "fonte oficial" nem "persistidos".

### 4. Observação 4 do review073

- Configurações › Agenda não deixa ocultar os sete dias e mostra o motivo, conforme as escolhas de desenho.

### 5. Observação 2 do review073 e o gate renderizado

- `ensureAgendaOnMeasuredDate` navega até a data semeada em qualquer visualização, conforme as escolhas de desenho. A mudança fica nessa função e nos nomes de botão que ela usa; nenhuma outra parte de `authenticated-matrix.spec.ts` muda.
- `/agenda` e `/configuracoes/agenda` continuam medidas pelo gate autenticado dentro de `validate:integration`, nas cinco larguras. As rotas públicas continuam medidas por `validate:ui`. Nenhuma rota entra ou sai.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela, sem desligar medida. "+ Novo", os itens do menu, ‹ › e os dias da faixa são alvos de toque e precisam de pelo menos 24 px.

### 6. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `37c7371`. Todos em jsdom, em `apps/frontend/tests/goal069-*.test.tsx`, com relógio fixo:

1. `/agenda` não mostra "Operação diária" nem "fonte oficial" nem "Operacional", e tem um só "+ Novo"; o menu lista Agendamento, Compromisso pessoal e Bloqueio com os destinos das escolhas de desenho, e esconde cada item sem a capacidade.
2. "Compromisso pessoal" abre `BlockForm` com `PERSONAL` escolhido.
3. No Dia, a faixa da semana tem os dias visíveis e ponto só nos dias com agendamento ativo; tocar num dia foca esse dia.
4. Dia vazio num dia sem regra de disponibilidade mostra "Você não atende neste dia." e, com a capacidade, "Criar agendamento"; com a leitura de disponibilidade falhando, não mostra o motivo.
5. O bloco da Semana tem o nome do cliente e o serviço no texto e no nome acessível.
6. Na semana de 28/09 a 04/10/2026, com o dia focado em 28/09, trocar para Mês abre setembro.
7. Com um agendamento passado na janela navegada e o próximo real em outra data, "Próximo agendamento" mostra o próximo real, em Dia, Semana e Mês.
8. O histórico com `actor` igual ao `user.id` da sessão mostra o nome da pessoa; com `actor` desconhecido, não mostra o valor.
9. Atendimento `CONFIRMED` futuro não tem "Concluir atendimento" nem "Marcar falta"; o mesmo atendimento com início já passado tem as duas.
10. O detalhe mostra o telefone do caso AG-08 formatado.
11. Configurações › Agenda com seis dias ocultos desabilita o sétimo e mostra o motivo.

Os testes existentes continuam passando. Só muda asserção que dependa de texto, botão ou composição trocados aqui. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual. Asserção que prova regra de agenda, guarda por fonte, capacidade, preferência de visualização (D-086) ou invariante da casca (D-030, D-031) não pode ser apagada; pode mudar de seletor.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. `/agenda` volta a renderizar `SourceStrip`: o teste 1 reprova.
2. O menu "+ Novo" perde "Compromisso pessoal": o teste 1 reprova.
3. O ponto da faixa aparece em dia sem agendamento: o teste 3 reprova.
4. A troca Semana → Mês volta a usar o `cursor` sem ajuste: o teste 6 reprova.
5. "Próximo agendamento" volta a sair da janela navegada: o teste 7 reprova.
6. O histórico volta a imprimir `event.actor`: o teste 8 reprova.
7. `canComplete` volta a olhar só o status: o teste 9 reprova.
8. `toggleHiddenDay` volta a aceitar o sétimo dia: o teste 11 reprova.

### 8. Documentação

No mesmo diff, por **acréscimo**:

- [DECISIONS](../DECISIONS.md) ganha **D-089** em `PROPOSED`, no formato de D-080 a D-088. Ela diz:
  - a composição da Agenda: barra superior, "+ Novo" com os três tipos, faixa da semana e duas colunas a partir de 1024 px;
  - as regras de tela novas: dia vazio com motivo, troca de visualização preservando o dia focado, "Próximo agendamento" relativo a agora, autor resolvido pela sessão, ações de fim só a partir do início, limite de dias ocultos na tela;
  - onde ficou "Exceções do dia";
  - as divergências declaradas, se houver, e que nada mudou fora do frontend.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§50**, sem reescrever §4 a §49. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, as telas medidas, a conferência humana pendente e as contagens da execução final.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

**Ordem obrigatória, a mesma dos Goals065 a 074:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rode os oito controles do §7.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Entrega parcial sem essa lista reprova (observação 4 do review068). Documento não afirma blocker corrigido antes de a correção ser executada e conferida (observação 4 do review074).

### 9. O que só uma pessoa confere

- Que a Agenda, percorrida num aparelho real nas cinco larguras, em Dia, Semana e Mês, com e sem agendamento, bate com `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`.
- Que a marca no trilho, o segmentado numa linha e o bloco da Semana legível batem com o protótipo, porque jsdom não tem layout nem cascata.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 10. O que este Goal não pode fazer

- Só toca `apps/frontend/` e os documentos do §8. Não toca `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/`, `apps/evolution-go/`, `scripts/`, `tools/ia-loop/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhum contrato, rota ou migration muda.
- Não muda configuração de teste: `vitest.config.*`, `playwright.config.*` e `e2e/routes.ts` ficam como estão. Em `e2e/authenticated-matrix.spec.ts`, só `ensureAgendaOnMeasuredDate` muda, conforme o §5. Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. `/agenda` tem uma barra superior, "+ Novo" com os três tipos governados pelas capacidades, a faixa da semana com pontos, e nenhuma copy técnica. Provado por execução jsdom do §6.1 a §6.3.
2. Dia vazio, bloco da Semana, troca de visualização e "Próximo agendamento" seguem as escolhas de desenho. Provado por execução jsdom do §6.4 a §6.7.
3. O detalhe não mostra identificador interno, mostra o telefone formatado e só oferece ações de fim a partir do início. Provado por execução jsdom do §6.8 a §6.10.
4. Configurações › Agenda não deixa ocultar os sete dias. Provado por execução jsdom do §6.11.
5. `ensureAgendaOnMeasuredDate` navega em qualquer visualização, e só essa função muda em `authenticated-matrix.spec.ts`. Provado pelo diff e por `validate:integration`.
6. Largura, toque, contraste, foco e movimento de `/agenda` e `/configuracoes/agenda` são decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas; os das rotas públicas, por `validate:ui`. As duas colunas a partir de 1024 px, o segmentado numa linha, a marca no trilho e a fidelidade ao protótipo não são provados por teste; ficam na conferência humana do §9.
7. Os oito controles negativos do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
8. Typecheck e lint de `apps/frontend` passam. `test:frontend` não tem teste a menos que a baseline (**100**/**1048**), e `test:gate` segue em **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **155** testes e **0** retentativas. Provado por execução.
9. D-089 em `PROPOSED`, FINAL_AUDIT §50, CURRENT_STATE e VALIDATION_GATE foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
10. `git status --porcelain=v1 -uall` lista só arquivos de `apps/frontend/` e os documentos do §8, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a Agenda bate com os protótipos aprovados (conferência humana);
- a fidelidade visual de Clientes, Serviços, Conversas e da central de notificações (Goal075) e do onboarding (Goal072).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Barra superior, "+ Novo" com três tipos, tipo inicial em `BlockForm`, "Exceções do dia" alcançável, copy de `/agenda`, segmentado e marca no trilho, com testes §6.1 e §6.2 (§1) |
| WU-02 | STANDARD | WU-01 | Faixa da semana, duas colunas, dia vazio, bloco da Semana, troca de visualização, "Próximo agendamento" e `ensureAgendaOnMeasuredDate`, com testes §6.3 a §6.7 (§2, §5) |
| WU-03 | STANDARD | — | Detalhe: histórico, telefone, ações de fim e copy, com testes §6.8 a §6.10 (§3) |
| WU-04 | STANDARD | — | Configurações › Agenda sem os sete dias ocultos, com teste §6.11 (§4) |
| WU-05…WU-08 | DETERMINISTIC | WU-01…WU-04 | typecheck e lint de `apps/frontend`, testes dirigidos `goal069` e `agenda` |
| WU-09 | DETERMINISTIC | WU-05…WU-08 | validate-core |
| WU-10…WU-12 | DETERMINISTIC | WU-09 | gate-tests, validate-ui e validate-integration |
| WU-13 | STANDARD | WU-10, WU-11, WU-12 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
