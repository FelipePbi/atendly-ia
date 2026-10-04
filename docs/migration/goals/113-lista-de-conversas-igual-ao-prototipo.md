# Goal 113 — Lista de conversas igual ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-04 pelo Tech Lead Agent após [Goal112 ACCEPTED](../reviews/112-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: Conversas:C1, Conversas:C2, C3, C4

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v137**, inserida depois do 112, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID que a v136 prometeu fazer antes de qualquer declaração de migração completa.

## Baseline aceita

Baseline aceita: `940f1985f6aa59c6c8490f7dae91619915f564bb`

Goal anterior: 112 — As telas não perdem o que a pessoa fez quando a largura cruza 1024 px

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal112 já integrado em `main` (origem `283614168b2cb5983ede1da40583f18626e18bdd`). Foram **duas rodadas**, com 4 e 0 blockers. **D-126** foi aceita: o invólucro de lista e detalhe é montado sempre, e só a coluna da lista aparece e some. A última contagem aceita: frontend **153** arquivos e **1893** testes, `validate:ui` **169** `passed`, `validate:integration` **36** de 36 passos. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/conversas` com conversas fica igual ao C1 (Comercial), ao C2 (Não classificadas) e ao C3 (Pessoal), e `/conversas` sem conversa com o WhatsApp conectado fica igual ao C4, nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O que a lista faz hoje continua: as mesmas leituras, a busca, a lente de ignorados, a atualização periódica e o destino de cada linha.

**Por que agora.** A fila não tem Goal PLANNED. Dos 113 quadros do protótipo, 53 têm alvo no `visual:compare`, e 60 não têm. A tela de Conversas é a superfície central do produto: é onde a pessoa vê o que a IA fez e quem espera por ela. Dos onze quadros do módulo, só o C5 (sem WhatsApp) foi comparado (Goal096). O C1 está em `targets.json`, mas com a nota de que a conta visual não o alcança. A lista vem antes do chat (K1 a K6), porque a lista é a entrada do módulo e, de 1024 px em diante, é a coluna que o chat vai usar ao lado.

## O que a evidência desta passada mostra

Conferido no código da baseline `940f198`, nos quadros e em D-115, D-118, D-119 e D-126.

1. **A lista de hoje não é a do quadro.** `ConversationInbox.tsx` (`InboxWithTabs`) mostra um parágrafo sob o título, um resumo "N aguardando você nesta aba", um campo de busca sempre aberto, as abas como `chip`, um botão "Ignorados" ao lado das abas, uma nota por lente, uma linha de contagem ("N conversas") e as linhas sem grupo. O quadro C1 mostra só o título em serif com um botão redondo de lupa, as três abas sublinhadas com contador âmbar em "Comercial", e as linhas agrupadas: "Aguardando você" (fundo âmbar, tempo de espera "há 12 min", pílula com o motivo), "Hoje" (horário "13:42") e as anteriores ("ontem"). O C2 e o C3 mostram uma frase de explicação no topo da aba, e o C3 mostra "A IA nunca responde este contato" em texto nas linhas de contato ignorado.
2. **De 1024 px em diante o quadro tem duas colunas.** No tablet em paisagem e no desktop, o C1, o C2 e o C3 mostram a lista numa coluna e, ao lado, um painel vazio "Selecione uma conversa". Hoje `/conversas` ocupa a largura toda. O C4 não tem coluna: o estado vazio ocupa a área de conteúdo.
3. **A conta visual não alcança os quadros.** A conta do `visual:compare` não tem conversa nem WhatsApp, e `/conversas` mostra o C5. D-118 (a) deu ao `visual:compare` respostas fixas de `GET` por alvo (`responses`), e o I1 já as usa (D-119). Uma resposta fixa de `GET /v1/conversations` leva a lista a C1, C2 e C3 sem gravar nada e sem mudar os outros alvos. A query não entra na escolha da resposta (`pickFixedResponse`): cada alvo serve a mesma lista para qualquer aba.
4. **O C4 depende do estado do WhatsApp.** `ConversationInbox` lê `whatsappView` de `useSystemStatus` (`GET /v1/status`) e decide entre o C5 e a lista. Com a conta visual, sem número e sem conversa, a tela é o C5. Para o C4, o alvo precisa de `GET /v1/status` (e, se a tela ler o número, `GET /v1/whatsapp`) conectado, por resposta fixa. D-118 deixou `GET /v1/status` real no W1 e pediu, no item 3 do "Revisar se", que um alvo novo com `responses` reveja os limites de (a).
5. **O contrato não traz tudo o que o quadro mostra.** `Conversation` não tem contador de não lidas (`unreadCount` é zero fixo, D-033), e o ponto de "não lida" do C2 não tem fonte. O motivo da pílula ("pediu desconto") vem só de `handoffReason`, quando houver texto legível (`handoffReasonCopy`).
6. **O gate autenticado já passa por `/conversas`.** `e2e/authenticated-matrix.spec.ts` acha a linha por `a.conversation-row` com o nome do contato semeado e prova o detalhe por `.message-timeline`. A conta do gate tem conversa real.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML/CSS dos quadros C1, C2, C3 e C4 (`Conversas-e-Chat.dc.html`, `Conversas-Tablet.dc.html` e `Conversas-Desktop.dc.html`): os valores inline de px, cor, fonte, raio, espaçamento e a ordem dos elementos. Sai o que o quadro não tem: o parágrafo sob o título, o resumo, a nota por lente na aba Comercial e a linha de contagem.
2. **A busca vira o botão de lupa do quadro.** O botão redondo do cabeçalho abre o campo de busca; fechar o campo limpa o termo. A busca continua igual por dentro: mesma query, mesmo `searchDebounceMs`, mesmas mensagens de "buscando" e de "nenhuma conversa corresponde".
3. **A lente "Ignorados" sai da linha das abas e fica no modo de busca.** Com a busca aberta, um filtro "Ignorados" aparece junto ao campo e faz o que o botão faz hoje (`lensQuery("ignored", …)`). O estado padrão da tela, que o quadro mostra, não tem o botão. A lente continua o único caminho para abrir uma conversa ignorada e voltar a usá-la na IA.
4. **De 1024 px em diante, a lista e o painel vazio ficam lado a lado, como em `/clientes` e `/servicos` (D-103 (c)).** A técnica é a de D-126: o invólucro é montado sempre, com `split` ligado só na faixa larga. A aba escolhida, o termo da busca e a busca aberta sobrevivem quando a largura cruza 1024 px. O C4 e o C5 não ganham painel. A rota do chat (`/conversas/[id]`) não muda neste Goal.
5. **As respostas fixas são a fonte de estado dos quatro alvos.** C1, C2 e C3 declaram `GET /v1/conversations` com as linhas do quadro, e C4 declara a lista vazia e o WhatsApp conectado. Cada alvo usa `clock` para que "há 12 min", "13:42" e "ontem" saiam da mesma hora do quadro. O Developer decide se os quatro alvos servem `GET /v1/status` conectado (o que tira o banner da casca e deixa o cartão "IA ativa" igual ao quadro) e registra a escolha com a execução de controle do item 3 do "Revisar se" de D-118.
6. **Decisão.** O Developer propõe **D-127**, por acréscimo, depois das provas: a lista igual ao C1, C2 e C3; o vazio igual ao C4; a busca no botão de lupa; a lente "Ignorados" no modo de busca; a composição de 1024 px em diante; os alvos novos com `responses` e a revisão dos limites de D-118 (a); e as divergências declaradas. D-115, D-118 e D-126 não são reescritas.

## Escopo obrigatório

### 1. A lista igual ao quadro

1. **Cabeçalho.** Título "Conversas" em serif e o botão redondo de lupa com nome acessível ("Buscar conversas"), alvo de toque de no mínimo 44 px.
2. **Abas.** "Comercial", "Não classificadas" e "Pessoal" sublinhadas, como no quadro. O contador âmbar de "Comercial" conta só as conversas da aba Comercial que exigem atenção (`needsAttention`) e some quando a conta é zero. Nas abas "Não classificadas" e "Pessoal", o contador vem de uma leitura de `GET /v1/conversations` com `category=COMMERCIAL`, feita com o mesmo teto e na mesma atualização periódica. As abas continuam `role="tablist"`, com `aria-selected` e o tabindex móvel de hoje.
3. **Grupos da aba Comercial.** "Aguardando você" no topo, com as conversas em `waiting-you`, em fundo âmbar, com o tempo de espera ("há 12 min") e a pílula "Aguardando você", seguida de " · " e do motivo quando `handoffReasonCopy` devolver texto. Depois, "Hoje" com as conversas do dia, com o horário ("13:42"), e as anteriores com o dia relativo ("ontem", dia da semana abreviado ou data), no fuso do negócio. Cada linha mostra a pílula do estado (IA atendendo, Você atendendo, em confirmação), como no quadro.
4. **"Não classificadas" (C2).** A frase do topo do quadro ("Ainda não dá para saber se são clientes ou pessoais. A IA só responde quando a intenção fica clara — ou você move a conversa."), as linhas sem pílula de estado, com o telefone formatado quando a conversa não tem nome.
5. **"Pessoal" (C3).** A frase do topo do quadro ("IA desativada. Ela não responde nem usa estas conversas. Elas ficam fora dos seus números."), e "A IA nunca responde este contato" em texto nas linhas com `ignored`.
6. **Cada linha** continua um link `a.conversation-row` para `/conversas/{id}`, com nome, última mensagem, horário e estado. Avatar com as iniciais, nas cores do quadro (âmbar para quem aguarda, verde-azulado para os demais).
7. **Estados da aba.** Carregando, erro com "Tentar novamente", aba vazia e busca sem resultado continuam com o mesmo comportamento e as mesmas mensagens de hoje, no estilo do quadro.

### 2. O vazio com o WhatsApp conectado (C4)

Sem conversa e com o WhatsApp conectado, a tela mostra as abas, o desenho do vazio feito com os elementos do chat, o texto do quadro ("Quando alguém falar com você pelo WhatsApp, a conversa aparecerá aqui. A IA responde clientes automaticamente e avisa quando precisar de você.") e a pílula "Conectado · {telefone}", com o telefone formatado (`formatBrazilianPhone`) quando ele for lido; sem telefone, só "Conectado". A regra de D-115 entre o C5 e a lista não muda.

### 3. A composição de 1024 px em diante

1. Nas abas com conversa, a lista fica numa coluna e o painel "Selecione uma conversa" ao lado, como no quadro de cada faixa. Abaixo de 1024 px não há painel.
2. Mudar a largura de 390 px para 1280 px e de volta, com a tela aberta, mantém a aba escolhida, o termo da busca e a busca aberta. A prova é por valor e por identidade de nó do campo de busca (`toBe`), com a simulação de `matchMedia` que dispara `change` dos testes do Goal112.
3. Uma chamada de `useShellConfig` por árvore (D-030, D-031), em todas as larguras e em todos os ramos de `ConversationInbox`.
4. A coluna da lista é um `aside` ou uma `section` com nome acessível, e o painel vazio não ganha papel de região sem conteúdo.

### 4. Os alvos do `visual:compare`

1. `apps/frontend/e2e/visual/targets.json`: a entrada `Conversas:C1` perde a nota de "não alcança" e ganha `responses` e `clock`; entram `Conversas:C2`, `C3` e `C4`, com `steps` para trocar de aba quando preciso.
2. Os limites de D-118 (a) continuam: só `GET`, só `/v1/`, caminho exato, só o alvo que declara, nada gravado. O teste `scripts/tests/visual-responses.test.mjs`, que hoje exige que só W1 e I1 declarem `responses`, passa a exigir W1, I1, C1, C2, C3 e C4.
3. **Execução de controle do item 3 do "Revisar se" de D-118:** depois de mudar `targets.json` e antes de tocar o frontend, rodar `visual:compare` dos alvos que já usam `responses` (W1, I1) e de C5, NT1 e H3, e conferir que os números são os mesmos da baseline.

### 5. O que já valia continua valendo

1. As leituras, a atualização periódica de `refreshIntervalMs`, o teto `inboxLimit` e o destino de cada linha não mudam.
2. D-115: o C5 continua só sem WhatsApp e sem histórico, e o estado de carregamento continua sem C5 e sem abas.
3. O gate autenticado acha a linha por `a.conversation-row` e o detalhe por `.message-timeline`. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` muda. Se o gate reprovar por causa da composição nova, o Developer para e registra; não ajusta o gate sem autorização no review.
4. Acessibilidade: o contador da aba tem texto acessível ("2 aguardando você"), o estado não depende só de cor, o foco é visível nas abas, nas linhas e no botão de lupa.

### 6. Provas

1. Um arquivo de teste novo, `apps/frontend/tests/goal113-*.test.tsx`, com: os grupos da aba Comercial e a ordem; o contador nas três abas, inclusive zero; as frases de C2 e C3; a marca de contato ignorado; o C4 com e sem telefone; a busca pelo botão de lupa e a lente "Ignorados" no modo de busca; a composição nas duas faixas; e a sobrevivência da aba e da busca ao cruzar 1024 px.
2. **Controles negativos, rodados depois da última edição de código e revertidos:** (a) agrupar sem a seção "Aguardando você" faz o teste dos grupos reprovar; (b) contar no contador toda conversa da aba, e não só as que exigem atenção, faz o teste do contador reprovar; (c) devolver `/conversas` ao ramo sem invólucro de 1024 px em diante faz o teste da sobrevivência reprovar. O relatório traz o comando, o teste que reprovou e a mensagem.
3. Testes existentes de Conversas (`goal017`, `goal070`, `goal077`, `goal096` e os demais que montam `ConversationInbox`) continuam passando. Teste que dependa de texto ou estrutura que o quadro tira pode ser ajustado só para o novo, sem afrouxar a asserção; cada ajuste é listado no relatório.

## Divergências declaradas

Não contam como defeito na comparação:

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O nome e as iniciais do negócio da conta visual ("Studio Camila Reis", "SC") no lugar de "Camila Reis" e "CR".
3. O ponto de "não lida" do C2: o contrato não traz contador (D-033).
4. O contador de "Comercial" nas capturas de C2 e C3: a resposta fixa ignora a query, então a leitura de `category=COMMERCIAL` recebe as linhas do próprio alvo.
5. Se o Developer mantiver `GET /v1/status` real: o banner da casca e o estado da IA na sidebar, decididos pela conta visual. Se servir a resposta fixa, esta divergência cai.

Qualquer outra diferença visível é blocker.

## Fora do escopo

- O chat (`/conversas/[id]`, K1 a K6), a casca, a sidebar e a barra de abas.
- O C5 (Goal096, D-115), as Notificações e os demais quadros sem alvo.
- Backend, contratos, `packages/`, semear conversa na conta visual e qualquer arquivo de `e2e/` além de `e2e/visual/targets.json`.
- Contador de não lidas e qualquer dado que o contrato não traz.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-127** em `PROPOSED`, conforme a escolha 6. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal113.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal113, com as contagens da execução final, a execução de controle do §4.3, os controles negativos e a lista das capturas do `visual:compare` conferidas.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Antes de editar: subir a pilha local com o banco migrado (`prisma migrate deploy` do scheduling-service, observação 2 do review112) ou usar um banco descartável, e rodar `npm run visual:compare -- --target Conversas:C1,Conversas:C2,C3,C4,C5` na baseline. As capturas de "antes" ficam fora do repositório.
2. Mudar `targets.json` e rodar a execução de controle do §4.3.
3. Implementar, com os testes novos.
4. Rodar os controles negativos do §6.2 e reverter.
5. Rodar `npm run visual:compare -- --target Conversas:C1,Conversas:C2,C3,C4,C5` e **olhar** as capturas lado a lado (protótipo × app, 4 devices). C1, C2, C3 e C4 têm de ficar iguais ao quadro, salvo as divergências declaradas; C5 tem de ficar igual à captura de antes.
6. Execução final, sobre a árvore completa: typecheck e lint do frontend, os testes do Goal113, a suíte do frontend, `test:gate`, `validate:core`, `validate:ui` e `validate:integration`, e `git diff --check`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `/conversas` fica **igual ao quadro Conversas:C1, Conversas:C2, C3 e C4 nos 4 devices**, conferido olhando as capturas do `visual:compare`, salvo as divergências declaradas; C5 continua igual à captura de antes.
2. A busca, a lente "Ignorados", a atualização periódica, o teto, os estados da aba e o destino das linhas funcionam como antes, provados em jsdom.
3. A aba, o termo e a busca aberta sobrevivem ao cruzar 1024 px nos dois sentidos, provados por valor e identidade de nó.
4. A execução de controle do §4.3 mostra os mesmos números da baseline nos alvos que não mudaram.
5. Os três controles negativos reprovam e foram revertidos.
6. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`; `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança em `e2e/` fora de `targets.json`.
7. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, de `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
8. D-127 proposta, com as escolhas, a revisão dos limites de D-118 (a) e as divergências.

## Plano de execução

1. **WU-01 — Alvos e medida de antes.** `targets.json` com C1 a C4, `scripts/tests/visual-responses.test.mjs`, as capturas de antes e a execução de controle do §4.3.
2. **WU-02 — A lista igual ao quadro.** `ConversationInbox`, `ConversationRow` e o CSS de Conversas para C1, C2 e C3; a busca no botão de lupa; a lente "Ignorados" no modo de busca; o contador; testes.
3. **WU-03 — Vazio e composição.** O C4, a lista e o painel de 1024 px em diante pela técnica de D-126, a sobrevivência ao cruzar 1024 px; testes.
4. **WU-04 — Provas e registros.** Controles negativos, `visual:compare` depois, D-127, CURRENT_STATE e VALIDATION_GATE.
5. Verificação determinística: typecheck, lint, testes do Goal113, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
