# Goal 114 — O chat igual ao protótipo

**Status: READY.** Preparado em 2026-10-04 pelo Tech Lead Agent após [Goal113 ACCEPTED](../reviews/113-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Quadros do protótipo: K1, K2, K3, K4

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v138**, inserida depois do 113, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID começada na v137. Com a lista de Conversas aceita, o chat é a parte do módulo central que nunca foi comparada.

## Baseline aceita

Baseline aceita: `65cb0022d37289169e9efdd00a50392978c44d8c`

Goal anterior: 113 — Lista de conversas igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal113 já integrado em `main` (origem `c88b5c4a80196370a48b1e77f80970582c09429c`). Foram **seis rodadas**, com 5, 3, 2, 1, 1 e 0 blockers. **D-127** foi aceita: a lista segue C1 a C4, a busca fica atrás da lupa, a coluna da lista mede 381 px de 1024 px em diante, e as respostas fixas do `visual:compare` aceitam `{today}` e `{today-N}`. A última contagem aceita: frontend **155** arquivos e **1917** testes, `test:gate` **249**, `validate:ui` **169** `passed`, `validate:integration` **36** de 36 passos e **275** testes no gate autenticado. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/conversas/{id}` fica igual ao K1 (IA atendendo), ao K2 (aguardando você), ao K3 (você atendendo) e ao K4 (conversa pessoal), nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). Tudo o que o chat faz hoje continua: ler, enviar, reenviar, assumir, devolver para a IA, resolver, sugerir resposta, abrir mídia, ver eventos de agenda, mudar a categoria e ignorar o contato.

**Por que agora.** A fila não tem Goal PLANNED. A v137 abriu a reavaliação das 60 telas sem alvo no `visual:compare`, começando por Conversas. O Goal113 fechou a lista (C1 a C4). Dos onze quadros do módulo, só K1 a K6 ficaram sem comparação. O chat é onde a pessoa lê o que a IA respondeu e assume a conversa. K5 (cliente no contexto) e K6 (menu •••) ficam para depois: são folhas sobre o chat, e o K5 traz um controle de três posições ("Automático · Sempre atende · Nunca responde") que o contrato não tem inteiro.

## O que a evidência desta passada mostra

Conferido no código da baseline `65cb002`, nos quadros (`Conversas-e-Chat.dc.html`, `Conversas-Tablet.dc.html` e `Conversas-Desktop.dc.html`), no contrato (`packages/public-api-contract/src/schemas.ts`) e em D-115, D-118, D-126 e D-127.

1. **O chat de hoje não é o do quadro.** `ConversationThread.tsx` mostra um cabeçalho com avatar, nome, o botão "Contexto" e o menu; abaixo dele, a barra `conversation-state-bar` com ícone, rótulo, texto, motivo e um botão ("Assumir" ou "Devolver"); a timeline; e o composer. Os quadros não têm barra de estado. O cabeçalho mostra o avatar, o nome com um chevron, o estado numa linha só ("IA atendendo" com ponto pulsante; "Aguardando você · há 12 min"; "Você atendendo"; "Pessoal · IA desativada") e o botão "•••". No K3, "Retomar IA" fica no cabeçalho.
2. **De 1024 px em diante o quadro tem duas colunas, não três.** No tablet em paisagem e no desktop, K1 a K4 mostram a mesma coluna da lista do C1 (cabeçalho, abas e grupos), com a conversa aberta marcada (fundo `#EDF4F3` e faixa `inset 3px 0 0 #0F5F63`) e a aba da categoria da conversa (Pessoal no K4). Ao lado fica o chat. Hoje o chat tem a sua própria coluna `conversation-rail`, que lê `list({ limit: 50 })`, e uma terceira coluna `conversation-context` com o contexto do cliente. No tablet em retrato, o quadro mostra só o chat, como pede D-126.
3. **A timeline do quadro usa dados que o contrato já traz.** Rótulo de autoria "IA · 13:38" e "Você · 12:05" (`source`); linhas de evento "Horário reservado até 13:46 · sex 15:30" e "Agendamento criado · sex 19/09, 15:30 · Ver" (`HOLD_PLACED`, `APPOINTMENT_CREATED`, Goal070); áudio com transcrição dentro da bolha (`attachment.transcript`); "Você assumiu a conversa · 12:02" (`session.humanHandlingSince`); "A IA nunca responde este contato · alterar" (`ignored`); o aviso do composer.
4. **Três coisas do quadro não têm fonte ou não são alcançáveis pela captura.** "Você editou o agendamento de hoje, 15:00 · + Hidratação" (K3) não existe no contrato. A sugestão da IA aberta (K2 e K3) vem de `POST /v1/conversations/:id/suggestions`, pedida sob demanda pelo botão "Sugerir resposta". A imagem do K2 vem de `GET …/media`, binária e sob demanda. O `visual:compare` só serve respostas fixas de `GET` em JSON (D-118 (a), D-127 (7)).
5. **A conta visual alcança o chat com respostas fixas, sem mudar o instrumento.** O chat lê `GET /v1/conversations/{id}`, `GET /v1/conversations/{id}/messages`, `GET /v1/conversations/{id}/events` e a lista. Todos são `GET` com caminho exato, e o id fixo do alvo entra no caminho. Os alvos C1 a C4 já servem `GET /v1/status` conectado.
6. **O gate autenticado passa pelo chat.** `e2e/authenticated-matrix.spec.ts` clica em `a.conversation-row` em `/conversas`, espera `/conversas/{id}`, acha a mensagem recebida e as três linhas de evento em `.message-timeline` e clica no link "Ver" dentro de `.message-timeline`.
7. **Oito arquivos de teste montam o chat**: `goal017-a11y`, `goal017-chat-media`, `goal017-contact-profile`, `goal017-delivery-state`, `goal017-human-handling`, `goal017-suggestions`, `goal023-conversation-expired`, `goal070-conversation-events` e `goal077-message-authorship`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML/CSS dos quadros K1, K2, K3 e K4 nos três arquivos: os valores inline de px, cor, fonte, raio, espaçamento, a ordem dos elementos e o movimento (`at-breathe`). As medidas do protótipo são `content-box` (D-127 (8)): elemento portado com largura ou altura e `padding` ou borda declara `box-sizing: content-box`. Títulos portados conferem a regra global de `h1`, `h2` e `h3` (`letter-spacing`).
2. **O estado vai para o cabeçalho, e a barra de estado sai.** Cada estado de `conversationState` tem a sua linha no cabeçalho, no estilo do quadro. Os quatro estados com quadro (`ai-handling`, `waiting-you`, `you-handling` e a conversa pessoal) seguem o texto do quadro. Os sem quadro (`ai-active`, `ai-paused`, `ai-unstable`, resolvida) usam o mesmo estilo e o texto de hoje.
3. **Toda ação continua alcançável.** "Retomar IA" fica no cabeçalho com `you-handling` e abre o diálogo de devolver de hoje. As ações que o quadro não mostra (assumir sem enviar, marcar como resolvida, criar agendamento, mudar a categoria, ignorar ou voltar a usar na IA) ficam no menu "•••" ou no contexto de hoje. O K6 vai redesenhar esse menu; aqui ele só ganha os itens, no estilo atual. Tocar no nome (com o chevron) abre o contexto de hoje (`Dialog` em folha) em todas as larguras. O botão "Contexto" e a coluna `conversation-context` saem.
4. **De 1024 px em diante, a coluna é a lista do Goal113.** A coluna da lista de `ConversationInbox` vira um componente usado pelas duas rotas, sem cópia. No chat ela abre na aba da categoria da conversa e marca a linha aberta com `aria-current="page"` e o estilo do quadro. A técnica é a de D-126: o invólucro é montado sempre, com `split` só na faixa larga, e o chat não muda de posição na árvore. A coluna de 381 px e as regras de D-127 (5) e (8) valem igual. `conversation-rail` sai. O chat não faz duas leituras da lista para a mesma coisa.
5. **Sugestão e mídia continuam sob demanda.** O botão "Sugerir resposta" e o cartão aberto seguem o estilo do quadro (tracejado, rótulo "Sugestão da IA", "Usar" e "Editar"). Nenhuma chamada nova acontece ao abrir a conversa. A bolha de imagem segue o quadro no estado antes do carregamento.
6. **As respostas fixas são a fonte de estado dos quatro alvos**, nos limites de D-127 (7): só `GET`, caminho exato sob `/v1/`, a query não conta, `{today}` e `{today-N}` para as datas, `clock` para "há 12 min" e os horários. Nenhuma capacidade nova no `visual:compare`.
7. **Decisão.** O Developer propõe **D-128**, por acréscimo, depois das provas: o chat igual a K1 a K4; o estado no cabeçalho; o destino de cada ação; a coluna da lista reaproveitada de 1024 px em diante; a saída do contexto em coluna; os alvos K1 a K4; e as divergências declaradas. D-115, D-126 e D-127 não são reescritas.

## Escopo obrigatório

### 1. O chat igual ao quadro

1. **Cabeçalho.** Voltar (só abaixo de 1024 px, com nome acessível "Voltar para conversas"), avatar com as iniciais nas cores do quadro, nome com chevron num botão que abre o contexto ("Abrir contexto de {nome}"), a linha do estado e o botão "•••" ("Mais ações"). No K3, "Retomar IA" no cabeçalho. Alvos de toque de no mínimo 44 px.
2. **Bolhas.** Recebida à esquerda (`#FFFDFA`, borda `#E5DED4`, raio `16px 16px 16px 6px`); enviada à direita (`#DCECEB`, texto `#0B2F32`, raio `16px 16px 6px 16px`); horário embaixo, com o rótulo "IA · hh:mm" ou "Você · hh:mm" e o ponto da autoria. O estado de entrega e o "Reenviar" de hoje (Goal017, D-033) continuam, no estilo do quadro.
3. **Linhas de evento.** Reserva, reserva vencida, agendamento criado (com o link "Ver") e "Você assumiu a conversa · hh:mm" (de `session.humanHandlingSince`) como a linha discreta do quadro, com traço e ícone. O motivo da espera (`handoffReasonCopy`) aparece como a linha de evento do K2 quando houver texto. Os textos que o gate procura não mudam: "Horário reservado até", "Agendamento criado", "venceu sem confirmação" e o link "Ver".
4. **Áudio (K3).** Player e transcrição dentro da mesma bolha, como no quadro. Os estados de transcrição de hoje (`PENDING`, `FAILED`, `SKIPPED`) continuam, no mesmo estilo.
5. **Imagem (K2).** A bolha da imagem segue o quadro no estado antes de carregar; o carregamento sob demanda e o visualizador de hoje continuam.
6. **Conversa pessoal (K4).** Cabeçalho "Pessoal · IA desativada" e, com `ignored`, a nota "A IA nunca responde este contato · alterar", em que "alterar" abre o diálogo de ignorar de hoje.
7. **Composer.** Campo "Mensagem", botão de envio e o aviso do quadro conforme o estado: "Ao enviar uma mensagem, você assume a conversa e a IA pausa aqui." (K1) e "Sua primeira mensagem assume a conversa" (K2). O rótulo acessível, a confirmação de envio, o erro e o bloqueio da conversa resolvida continuam.
8. **Sugestão.** O botão "Sugerir resposta" e o cartão aberto no estilo do quadro; "Usar" preenche o rascunho e nunca envia (Goal012, Goal017).
9. **Estados da tela.** Carregando, erro com "Tentar novamente" e conteúdo expirado (Goal023) continuam com as mesmas mensagens, no estilo do quadro.

### 2. A composição de 1024 px em diante

1. A coluna da lista é o mesmo componente de `/conversas` (D-127 (1) a (5)), com a aba da categoria da conversa aberta e a linha aberta marcada com `aria-current="page"`. Abaixo de 1024 px, o chat é tela empurrada, sem barra de abas, como hoje.
2. Mudar a largura de 390 px para 1280 px e de volta, com o rascunho digitado, mantém o rascunho e o mesmo nó do campo (`toBe`), com a simulação de `matchMedia` que dispara `change` dos testes do Goal112.
3. Uma chamada de `useShellConfig` por árvore (D-030, D-031), em todas as larguras e em todos os ramos.
4. `/conversas` (C1 a C5) não muda de aparência.

### 3. Os alvos do `visual:compare`

1. `apps/frontend/e2e/visual/targets.json`: entram K1, K2, K3 e K4, com `route` `/conversas/{id fixo}`, `clock` e `responses` para a conversa, as mensagens, os eventos, a lista e `GET /v1/status` conectado. Data fixa do quadro (como "sex 19/09") pode ir fixa no `json` quando a tela não a esconder por ser passada; o Developer registra a escolha.
2. O teste `scripts/tests/visual-responses.test.mjs`, que hoje exige W1, I1, C1, C2, C3 e C4, passa a exigir também K1, K2, K3 e K4.
3. **Execução de controle**: depois de mudar `targets.json` e antes de tocar o frontend, rodar `visual:compare` de W1, I1 e `Conversas:C1` e conferir que os números são os mesmos da baseline.

### 4. O que já valia continua valendo

1. As leituras do chat, a atualização periódica de `refreshIntervalMs`, a regra de eventos em promessa própria (Goal070 §4) e o envio que grava o controle humano antes do transporte não mudam.
2. Nenhuma chamada nova ao abrir a conversa: sugestão e mídia só sob demanda.
3. O gate autenticado acha `.message-timeline`, a mensagem recebida, as três linhas de evento e o link "Ver". Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` muda. Se o gate reprovar pela composição nova, o Developer para e registra; não ajusta o gate sem autorização no review.
4. Acessibilidade: o estado tem texto e não depende só de cor; o foco é visível no cabeçalho, nas linhas de evento, no composer e no menu; o ponto pulsante para com `prefers-reduced-motion`.

### 5. Provas

1. Testes novos em `apps/frontend/tests/goal114-*.test.tsx`, com: o cabeçalho de cada estado (inclusive os sem quadro); a ausência da barra de estado; "Retomar IA" abrindo o diálogo de devolver; cada ação de hoje alcançável (assumir, resolver, criar agendamento, categoria, ignorar); o nome abrindo o contexto; os rótulos de autoria; as linhas de evento, com "Você assumiu a conversa"; o áudio com transcrição; a nota do K4 e o "alterar"; os avisos do composer; nenhuma chamada a `generateSuggestions` nem a `getMedia` ao abrir; a composição nas duas faixas, com a linha aberta marcada e a aba da categoria; o rascunho e o nó do campo ao cruzar 1024 px; um só `useShellConfig`.
2. **Controles negativos, rodados depois da última edição de código e revertidos:** (a) devolver a barra de estado faz o teste da ausência reprovar; (b) tirar "Assumir" do menu faz o teste das ações reprovar; (c) devolver o chat ao ramo sem invólucro de 1024 px em diante faz o teste do rascunho reprovar. O relatório traz o comando, o teste que reprovou e a mensagem.
3. Os testes do item 7 da evidência e os demais de Conversas continuam passando. Teste que dependa de texto ou estrutura que o quadro tira (a barra de estado, o botão "Contexto", a coluna de contexto, `conversation-rail`) pode ser ajustado só para o novo, sem afrouxar a asserção; cada ajuste é listado no relatório.

## Divergências declaradas

Não contam como defeito na comparação:

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O nome e as iniciais do negócio da conta visual, e a casca (item "Notificações", badge de Conversas, ícone da barra inferior), como em D-127.
3. A linha "Você editou o agendamento de hoje, 15:00 · + Hidratação" (K3): o contrato não traz o dado.
4. A sugestão aberta (K2 e K3): a captura mostra o botão "Sugerir resposta", porque a sugestão é `POST` sob demanda. O cartão aberto é provado em jsdom.
5. O conteúdo da imagem (K2): a captura mostra a bolha antes de carregar, porque a mídia é binária e sob demanda.
6. Na coluna da lista de 1024 px em diante, as mesmas divergências de D-127 (a pílula "em confirmação", o dia da semana calculado de `updatedAt`).
7. Dias da semana e datas calculados de `{today}` que mudam com o dia da captura, quando o quadro traz texto fixo.

Qualquer outra diferença visível é blocker.

## Fora do escopo

- K5 (cliente no contexto) e K6 (menu •••): o contexto e o menu continuam com o desenho de hoje, só com os itens novos do menu.
- A lista de `/conversas` (C1 a C5, D-115, D-127), as Notificações, a casca, a sidebar e a barra de abas.
- Backend, contratos, `packages/`, semear conversa na conta visual, gerar sugestão ao abrir e qualquer arquivo de `e2e/` além de `e2e/visual/targets.json`.
- Qualquer mudança no `visual:compare` além de `targets.json` e do teste de `scripts/tests/visual-responses.test.mjs`.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-128** em `PROPOSED`, conforme a escolha 7. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal114.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal114, com as contagens da execução final, a execução de controle do §3.3, os controles negativos e a lista das capturas do `visual:compare` conferidas.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Antes de editar: subir um PostgreSQL descartável (ou a pilha local com `prisma migrate deploy` do scheduling-service, observação 2 do review112) e rodar `npm run visual:compare -- --target Conversas:C1,C4` na baseline. As capturas de antes ficam fora do repositório.
2. Mudar `targets.json` e o teste de `visual-responses`, rodar a execução de controle do §3.3 e rodar `npm run visual:compare -- --target K1,K2,K3,K4` na baseline, para ter o antes do chat.
3. Implementar, com os testes novos e os ajustes listados.
4. Rodar os controles negativos do §5.2 e reverter.
5. Rodar `npm run visual:compare -- --target K1,K2,K3,K4,Conversas:C1,C4` e **olhar** as capturas lado a lado (protótipo × app, 4 devices), inclusive tablet em paisagem e desktop. K1 a K4 têm de ficar iguais ao quadro, salvo as divergências declaradas; `Conversas:C1` e C4 têm de ficar iguais à captura de antes.
6. Execução final, sobre a árvore completa: typecheck e lint do frontend, os testes do Goal114, a suíte do frontend, os testes de `scripts/`, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` (com `BFF_TEST_DATABASE_URL` num banco descartável, observação 3 do review113) e `git diff --check`. Contagens no relatório e em VALIDATION_GATE. Com o RTK ligado, rodar o lint por `rtk proxy` (observação 2 do review113).

## Critério de aceite

1. `/conversas/{id}` fica **igual ao quadro K1, K2, K3 e K4 nos 4 devices**, conferido olhando as capturas do `visual:compare`, salvo as divergências declaradas; `Conversas:C1` e C4 continuam iguais à captura de antes.
2. Ler, enviar, reenviar, assumir, devolver, resolver, criar agendamento, sugerir, abrir mídia, ver eventos, mudar a categoria e ignorar funcionam como antes, provados em jsdom; nenhuma chamada nova ao abrir a conversa.
3. De 1024 px em diante, a coluna é a lista do Goal113 com a linha aberta marcada; o rascunho e o nó do campo sobrevivem ao cruzar 1024 px nos dois sentidos; um só `useShellConfig` por árvore.
4. A execução de controle do §3.3 mostra os mesmos números da baseline.
5. Os três controles negativos reprovam e foram revertidos.
6. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`; `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança em `e2e/` fora de `targets.json`.
7. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, de `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
8. D-128 proposta, com as escolhas, o destino de cada ação e as divergências.

## Plano de execução

1. **WU-01 — Alvos e medida de antes.** `targets.json` com K1 a K4, o teste de `visual-responses`, as capturas de antes e a execução de controle do §3.3.
2. **WU-02 — O chat igual ao quadro.** Cabeçalho, estado, ações, timeline, eventos, áudio, imagem, K4, composer e sugestão, com os testes novos e os ajustes dos testes existentes.
3. **WU-03 — A composição de 1024 px em diante.** A coluna da lista reaproveitada, a linha aberta marcada, a saída de `conversation-rail` e da coluna de contexto, o rascunho ao cruzar 1024 px; testes.
4. **WU-04 — Provas e registros.** Controles negativos, `visual:compare` depois, D-128, CURRENT_STATE e VALIDATION_GATE.
5. Verificação determinística: typecheck, lint, testes do Goal114, suíte do frontend, testes de `scripts/`, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
