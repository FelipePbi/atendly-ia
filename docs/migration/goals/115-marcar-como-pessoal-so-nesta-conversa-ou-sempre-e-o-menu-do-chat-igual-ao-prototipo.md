# Goal 115 — Marcar como pessoal só nesta conversa ou sempre, e o menu do chat igual ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-04 pelo Tech Lead Agent após [Goal114 ACCEPTED](../reviews/114-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Quadros do protótipo: K6

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v139**, inserida depois do 114, sem renumerar nem remover ID. Origem: a leitura própria do K5 e do K6 que a v138 deixou para o planejamento seguinte.

## Baseline aceita

Baseline aceita: `3409b8f12c2b509431e81a0f4b89a141fd6efdd0`

Goal anterior: 114 — O chat igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal114 já integrado em `main` (origem `ace3b2f80d4054d827d2b9d137fc59852e263f84`). Foram **três rodadas**, com 8, 3 e 0 blockers. **D-128** foi aceita: o chat segue K1 a K4, o estado mora no cabeçalho, a coluna de contexto saiu, e de 1024 px em diante a coluna ao lado do chat é a lista do Goal113. O item 3 de D-128 pôs assumir, criar agendamento, mudar a categoria, ignorar e resolver no menu "Mais ações", "no estilo atual do menu (o K6 vai redesenhá-lo)". A última contagem aceita: frontend **157** arquivos e **1954** testes, `test:gate` **255**, `validate:ui` **169** `passed`, `validate:integration` **36** de 36 passos e **275** testes no gate autenticado. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **ao marcar uma conversa como pessoal, a pessoa escolhe "Só esta conversa" ou "Sempre, para {nome}", e cada escolha faz o que a frase promete; e o menu "•••" do chat fica igual ao K6 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768).

- **Só esta conversa:** "A IA para de responder aqui. Uma nova conversa volta ao normal." A sessão aberta fica em Pessoal e a IA se cala nela. O contato não muda. A sessão seguinte começa pela regra do contato e pela classificação, como se a marca não existisse.
- **Sempre, para {nome}:** "A IA nunca mais responde este contato." É o comportamento de hoje: a categoria manual do contato (`Contact.categoryOverride`), que atravessa a troca de sessão.

**Por que agora.** A fila não tem Goal PLANNED. Do módulo de Conversas, só K5 e K6 continuam sem comparação, e a v138 os deixou sem ID até uma leitura própria. Esta passada a fez. O K6 não é só desenho: a pergunta "esta conversa ou sempre" é regra do vault, e o backend não sabe guardar a primeira resposta. O K5 depende dessa distinção para ler o seu controle "Automático · Sempre atende · Nunca responde", então vem depois.

## O que a evidência desta passada mostra

Conferido no código da baseline `3409b8f`, no quadro K6 (`Conversas-e-Chat.dc.html`, `Conversas-Tablet.dc.html` e `Conversas-Desktop.dc.html`), no contrato e no vault.

1. **O vault fixa a pergunta.** `docs/product-vault/04-Referencia/99-Perguntas-e-Respostas.md`, item 228: "Mover para Pessoal aplica à conversa ou contato? — C — Perguntar 'esta conversa' ou 'sempre'. Vigente." O item 209 diz que a configuração manual sempre vence o classificador. O quadro K6 desenha a pergunta com as duas frases citadas no objetivo.
2. **Hoje a categoria manual só existe por contato.** `apps/ai-orchestrator/prisma/schema.prisma`: `Contact.categoryOverride` ("Prevalece sobre qualquer classificação automática e atravessa a troca de sessão"). `ConversationSession` tem `category`, `categorySource`, `categoryUpdatedAt` e `categoryUpdatedBy`, mas nenhum campo de decisão própria. `SessionService.setCategoryOverride` grava sempre no contato.
3. **A sessão é reescrita a partir do contato.** `resolveEffectiveCategory` (`session-policy.ts`) só conhece `override` (do contato) e `suggestion`. `refreshCategory` roda a cada `resolveContext` e regrava `category` e `categorySource` da sessão aberta quando divergem; `recordCategorySuggestion` faz o mesmo ao gravar a sugestão do agente. Uma categoria escrita só na sessão seria apagada na mensagem seguinte.
4. **As guardas leem a categoria da sessão.** `message-graph.ts` (o turno da IA), `assistant.service.ts` (sugestão), `customer-memory-service.ts` (memória) e a transcrição de áudio calam a IA com `ConversationSession.category === "PERSONAL"` ou `Contact.categoryOverride === "PERSONAL"`. A purga de conteúdo (`content-purge-service.ts`) aplica o prazo de Pessoal pela categoria da sessão. Uma decisão por conversa que termine em `ConversationSession.category` alcança todas elas sem mudá-las.
5. **A rota é uma só.** `PUT /v1/conversations/:id/category` no BFF (`apps/bff/src/modules/conversations/routes.ts`, corpo `{ category: … | null }`) repassa para `PUT /internal/conversations/:id/category` da IA, que chama `resolveContext` antes de gravar. `category: null` limpa a decisão manual. O frontend chama por `BffConversationService` (`apps/frontend/src/data/services/BffConversationService.ts`).
6. **O menu de hoje não é o do quadro.** `ConversationThread.tsx` tem o `div.menu` "Mais ações" com Assumir conversa, Criar agendamento, Mudar categoria (abre o contexto), Ignorar contato na IA e Marcar como resolvida. O K6 é uma folha com quatro linhas de 22 px de ícone e texto de 16 px: "Ver contato", "Mover para Comercial", "Marcar como pessoal" (aberta, com fundo `#F7F4EF`, as duas opções em cartões com rádio e o botão "Marcar como pessoal" de 52 px) e "Ignorar IA para este contato". No tablet e no desktop o quadro mostra a mesma folha centrada sobre o chat escurecido (`rgba(34,30,26,.38)`).
7. **O contexto já tem as ações que o quadro tira do menu.** `ConversationContextPanel.tsx` já oferece "Criar agendamento" e "Marcar como resolvida", além da categoria e do ignorar. Só "Assumir conversa" não está lá.
8. **O K5 não cabe nesta passada.** "Nunca responde" é o `ignored` de hoje. "Sempre atende" traduz "sempre permitir IA" (vault, item 208, "vigente conceitualmente") e só pode ser lido sobre a distinção entre conversa e contato que este Goal cria. O resumo da IA do K5 é `POST /v1/customers/:id/summary`, sob demanda.

## Escolhas de desenho desta passada

1. **A decisão por conversa mora na sessão aberta.** `ConversationSession` ganha uma coluna nova, anulável e aditiva, com a categoria manual da sessão (nome sugerido: `categoryOverride`, `SessionCategory?`). Linhas existentes ficam nulas e se comportam como hoje. Nenhum backfill. A coluna nasce nula em toda sessão nova, por isso "uma nova conversa volta ao normal" sem código de limpeza.
2. **Precedência: sessão > contato > sugestão > Não classificada.** `resolveEffectiveCategory` passa a receber a decisão da sessão e a pôr acima da do contato: a decisão mais específica e mais recente vence. `categorySource` continua `MANUAL` para as duas decisões manuais. `ignored` continua sendo regra do contato, separada da categoria (vault, item 206), e não muda.
3. **Toda escrita que recalcula a categoria respeita a decisão da sessão**: `resolveContext` (sessão nova e `refreshCategory`), `recordCategorySuggestion` e `setCategoryOverride`. A atualização de `refreshCategory` e de `recordCategorySuggestion` não pode regravar uma categoria calculada com dados lidos antes de uma decisão manual mais nova: a escrita é condicional ao que foi lido, ou o cálculo e a escrita acontecem numa mesma operação. O Developer escolhe a técnica e a prova com teste que intercala as duas escritas.
4. **O contrato ganha escopo, sem quebrar quem já chama.**
   - `PUT /v1/conversations/:id/category` aceita `scope` opcional, `"CONVERSATION"` ou `"CONTACT"`. Sem `scope`, vale `"CONTACT"`: a chamada de hoje faz exatamente o que fazia.
   - `scope: "CONTACT"` grava no contato, como hoje, e **limpa** a decisão da sessão aberta. Assim "Mover para Comercial" depois de "Só esta conversa" tira a conversa de Pessoal.
   - `scope: "CONVERSATION"` grava só na sessão aberta e não toca o contato. `category: null` com esse escopo limpa só a decisão da sessão.
   - `category: null` sem escopo ou com `"CONTACT"` ("Usar classificação automática") limpa as duas decisões.
   - A conversa (`conversationSchema`) ganha `categoryScope` opcional: `"CONVERSATION"` quando a decisão da sessão vale, `"CONTACT"` quando vale a do contato e `null` sem decisão manual. Resposta antiga, sem o campo, continua válida.
   - O BFF valida `scope` com o mesmo enum, repassa para a IA e documenta a mudança em `apps/bff/PUBLIC_API_V1.md`.
5. **O menu é o K6, portado.** O Developer porta o HTML/CSS do K6: folha com puxador, linhas, ícones SVG do quadro, cartões de opção, rádio, botão primário e movimento (`at-fade`, `at-sheet`, `at-reveal`, parados com `prefers-reduced-motion`). As medidas do protótipo são `content-box` (D-127 (8)). As linhas dependem do estado:
   - **"Ver contato"** abre o contexto, como o nome com o chevron.
   - **"Mover para Comercial"** aparece quando a categoria vigente não é Comercial e grava com `scope: "CONTACT"`, como a mudança de categoria de hoje.
   - **"Marcar como pessoal"** aparece quando a categoria vigente não é Pessoal. Tocar abre as duas opções no lugar, com "Só esta conversa" marcada. "Sempre, para {nome}" usa o nome que o cabeçalho mostra. O botão "Marcar como pessoal" grava com `scope: "CONVERSATION"` ou `"CONTACT"`. Nada é gravado antes do botão.
   - **"Ignorar IA para este contato"** abre o diálogo de ignorar de hoje. Com o contato ignorado, a linha diz "Voltar a usar na IA" e abre o mesmo diálogo.
6. **Assumir, criar agendamento e resolver saem do menu e ficam no contexto.** O quadro chama o menu de "ações raras" e não os mostra. "Criar agendamento" e "Marcar como resolvida" já estão no contexto. "Assumir conversa" entra no contexto, com o mesmo comportamento de hoje, e só aparece quando a conversa não está resolvida e ninguém atende. Enviar uma mensagem continua assumindo (D-033). Com você atendendo, o cabeçalho continua sem "•••" e com "Retomar IA" (D-128 (3)).
7. **O contexto diz de quem é a decisão.** O selo de categoria do contexto diz "Só nesta conversa" quando `categoryScope` é `"CONVERSATION"`, "Definida manualmente" quando é `"CONTACT"` e "Classificação automática" sem decisão. Os botões de categoria do contexto continuam gravando com `scope: "CONTACT"`. O redesenho do contexto é do K5, fora daqui.
8. **Decisão.** O Developer propõe **D-129**, por acréscimo, depois das provas: a decisão por conversa na sessão, a precedência, o escopo do contrato, as escritas que respeitam a decisão da sessão, o menu do K6, o novo destino de assumir, criar agendamento e resolver (revê o item 3 de D-128, que pede essa revisão) e as divergências declaradas. D-128 não é reescrita.

## Escopo obrigatório

### 1. Backend da IA (`apps/ai-orchestrator`)

1. Migration Prisma aditiva com a coluna da escolha 1. Nada é apagado, renomeado nem preenchido. `schema.prisma` e o histórico de migrations dizem a mesma coisa.
2. `resolveEffectiveCategory` com a precedência da escolha 2, e os testes de `tests/session/session-policy.test.ts` cobrindo cada combinação (sessão, contato, sugestão, nenhuma).
3. `SessionService`: `setCategoryOverride` com o escopo da escolha 4; `resolveContext`, `refreshCategory` e `recordCategorySuggestion` respeitando a decisão da sessão (escolha 3); a sessão nova nasce sem decisão própria.
4. `PUT /internal/conversations/:id/category` aceita `scope` e devolve a conversa com `categoryScope`. O DTO da conversa monta `categoryScope` a partir da sessão aberta e do contato.
5. Provas de comportamento, com teste que reprova sem a mudança:
   - "Só esta conversa": a sessão fica `PERSONAL`, o contato não muda, e o turno da IA não responde (`message-graph`); a sugestão recusa com `SESSION_PERSONAL`.
   - Uma mensagem nova do contato na mesma sessão, e uma sugestão de categoria do agente, não tiram a sessão de Pessoal.
   - Depois que a sessão expira, a sessão seguinte volta à categoria do contato ou da classificação, e a IA responde de novo.
   - `scope: "CONTACT"` depois de "Só esta conversa" limpa a decisão da sessão; `category: null` limpa as duas.
   - Sem `scope`, a rota faz o que fazia na baseline (os testes existentes de `conversation-controls.routes.test.ts` e `human-control-across-sessions.test.ts` passam sem mudança).
   - A escrita de `refreshCategory` ou de `recordCategorySuggestion` intercalada com uma decisão manual não apaga a decisão.
   - Isolamento de tenant: a rota recusa conversa de outro negócio como hoje.

### 2. Contrato e BFF

1. `packages/public-api-contract/src/schemas.ts`: `categoryScope` opcional em `conversationSchema` (escolha 4).
2. `apps/bff/src/modules/conversations/routes.ts` e o cliente da IA (`apps/bff/src/clients/ai-orchestrator/index.ts`): `scope` opcional validado, repassado, e `categoryScope` aceito na resposta.
3. `apps/bff/PUBLIC_API_V1.md`: o corpo novo e o campo novo.
4. `apps/bff/tests/conversation-controls.integration.test.ts` (ou arquivo novo `goal115-*`): `scope` repassado, `scope` inválido recusado com 400, chamada sem `scope` igual à de hoje.

### 3. O menu igual ao quadro (`apps/frontend`)

1. O menu "Mais ações" vira a folha do K6 (escolha 5), aberta pelo mesmo botão "•••" do cabeçalho, com nome acessível, foco preso enquanto aberta, `Escape` fecha e o foco volta ao botão. Abaixo de 1024 px é folha de baixo; de 1024 px em diante, a folha centrada do quadro. Alvos de toque de no mínimo 44 px.
2. "Marcar como pessoal" abre as opções no lugar, como `radiogroup` com nome acessível, e o botão grava com o escopo escolhido. Erro da gravação aparece na folha com `role="alert"`; a folha só fecha depois do sucesso.
3. `BffConversationService` e a interface de dados aceitam o `scope`.
4. O contexto ganha "Assumir conversa" e o selo da escolha 7.
5. `apps/frontend/e2e/visual/targets.json`: entra **K6**, com `route` `/conversas/{id fixo}`, `clock`, `responses` para a conversa (Renata, `UNCLASSIFIED`, sem atendimento humano), as mensagens, os eventos, a lista e `GET /v1/status` conectado, e `steps` que abrem "Mais ações" e tocam "Marcar como pessoal". Tudo nos limites de D-127 (7): só `GET`, caminho exato, nenhuma capacidade nova no `visual:compare`.
6. `scripts/tests/visual-responses.test.mjs` passa a exigir também o K6.

### 4. O que já valia continua valendo

1. K1, K2, K3 e K4 continuam iguais à captura de antes: o cabeçalho, o botão "•••" e "Retomar IA" não mudam; só o que o "•••" abre muda.
2. `/conversas` (`Conversas:C1` e C4) não muda de aparência. A conversa marcada "Só esta conversa" aparece na aba Pessoal, porque a lista lê a categoria da sessão.
3. Toda ação do chat continua alcançável: ler, enviar, reenviar, assumir, devolver, resolver, criar agendamento, sugerir, abrir mídia, ver eventos, mudar a categoria e ignorar.
4. O gate autenticado (`e2e/authenticated-matrix.spec.ts`) não muda. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` muda. Se o gate reprovar pela mudança, o Developer para e registra; não ajusta o gate sem autorização no review.
5. Acessibilidade: o estado das opções tem texto e não depende só de cor; o foco é visível nas linhas, nos cartões e no botão; o movimento para com `prefers-reduced-motion`.

### 5. Provas do frontend

1. Testes novos em `apps/frontend/tests/goal115-*.test.tsx`, com: as quatro linhas do K6 por estado (Não classificada, Comercial, Pessoal, ignorado); "Ver contato" abrindo o contexto; "Mover para Comercial" chamando com `scope: "CONTACT"`; "Marcar como pessoal" abrindo as opções sem gravar, com "Só esta conversa" marcada, e o botão chamando com `scope: "CONVERSATION"` ou `"CONTACT"` conforme a escolha; o nome do contato em "Sempre, para {nome}"; o erro na folha; `Escape` e o foco de volta ao "•••"; "Assumir conversa" no contexto; o selo do contexto para os três valores de `categoryScope`; o menu ausente com você atendendo.
2. **Controles negativos, rodados depois da última edição de código e revertidos:** (a) no backend, tirar a decisão da sessão de `resolveEffectiveCategory` faz o teste da mensagem na mesma sessão reprovar; (b) no backend, gravar `scope: "CONVERSATION"` no contato faz o teste da sessão seguinte reprovar; (c) no frontend, fazer o botão gravar sempre com `scope: "CONTACT"` faz o teste de "Só esta conversa" reprovar. O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes de Conversas existentes continuam passando. Teste que dependa de item que sai do menu (Assumir conversa, Criar agendamento, Marcar como resolvida, Mudar categoria) pode ser ajustado só para o novo lugar, sem afrouxar a asserção; cada ajuste é listado no relatório.

## Divergências declaradas

Não contam como defeito na comparação do K6:

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O nome e as iniciais do negócio da conta visual, e a casca, como em D-127 e D-128.
3. O cabeçalho escurecido atrás da folha mostra a linha de estado de D-128 (2) para a conversa da resposta fixa, e não "Não classificada", que o quadro usa como subtítulo.
4. Na faixa de 1024 px em diante, a coluna da lista atrás do escurecido, com as divergências de D-127 e D-128.
5. Dias da semana e datas calculados de `{today}`.

Qualquer outra diferença visível é blocker.

## Fora do escopo

- O K5 (cliente no contexto, controle "Automático · Sempre atende · Nunca responde", resumo da IA, próximo e último atendimento). O contexto continua com o desenho de hoje, mais "Assumir conversa" e o selo novo.
- "Sempre atende" como regra nova, qualquer mudança em `ignored`, em `aiPaused`, no classificador, nas guardas da IA ou na purga.
- Decisão por conversa para Comercial ou Não classificada na interface: o contrato aceita qualquer categoria com `scope: "CONVERSATION"`, e a interface só a usa para Pessoal.
- A lista de `/conversas`, as Notificações, a casca, semear conversa na conta visual e qualquer arquivo de `e2e/` além de `e2e/visual/targets.json`.
- Qualquer mudança no `visual:compare` além de `targets.json` e do teste de `scripts/tests/visual-responses.test.mjs`.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-129** em `PROPOSED`, conforme a escolha 8. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal115.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal115, com as contagens da execução final, a migration aplicada em banco descartável, os controles negativos e a lista das capturas do `visual:compare` conferidas.
- `docs/migration/DATA_MIGRATION.md`: a coluna nova, por que é aditiva e sem backfill, e o rollback (a coluna pode ser removida sem perda, porque só guarda decisões por sessão).

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Antes de editar: subir uma pilha própria em bancos descartáveis com `prisma migrate deploy` dos três serviços e chamar o `visual:compare` com `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN` (observação 1 do review114); rodar `npx prisma generate` em `apps/ai-orchestrator` antes de `test:gate` (observação 2). Rodar `npm run visual:compare -- --target K1,K2,K3,K4,Conversas:C1,C4` na baseline. As capturas de antes ficam fora do repositório.
2. Backend da IA, com a migration e os testes do §1.
3. Contrato e BFF, com os testes do §2.
4. `targets.json` com o K6 e o teste de `visual-responses`; `npm run visual:compare -- --target K6` na baseline, para ter o antes.
5. Frontend, com os testes novos e os ajustes listados.
6. Controles negativos do §5.2, revertidos.
7. `npm run visual:compare -- --target K6,K1,K2,K3,K4,Conversas:C1,C4` e **olhar** as capturas lado a lado (protótipo × app, 4 devices). K6 tem de ficar igual ao quadro, salvo as divergências declaradas; K1 a K4, `Conversas:C1` e C4 iguais à captura de antes.
8. Execução final, sobre a árvore completa: typecheck da IA, do BFF e do frontend; lint; testes da IA, do BFF e do frontend; `test:gate`; `validate:core`; `validate:ui`; `validate:integration` (com `BFF_TEST_DATABASE_URL` num banco descartável e o PostgreSQL na porta declarada, observação 3 do review114); `git diff --check`. Com o RTK ligado, lint por `rtk proxy`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. "Só esta conversa" deixa a sessão aberta em Pessoal e a IA calada nela, sem tocar o contato; mensagem nova e sugestão do agente não desfazem a marca; a sessão seguinte volta à regra do contato e à classificação. Provado por teste da IA que reprova sem a mudança.
2. "Sempre, para {nome}" e toda chamada sem `scope` fazem o que a baseline fazia; `scope: "CONTACT"` limpa a decisão da sessão; `category: null` limpa as duas.
3. Uma decisão manual não é apagada por `refreshCategory` nem por `recordCategorySuggestion` intercalados, provado por teste.
4. A migration é aditiva, aplica em banco descartável e não muda nenhuma linha existente.
5. O menu "•••" fica **igual ao quadro K6 nos 4 devices**, conferido olhando as capturas do `visual:compare`, salvo as divergências declaradas; K1 a K4, `Conversas:C1` e C4 continuam iguais à captura de antes.
6. Toda ação do chat continua alcançável, provado em jsdom; "Assumir conversa" no contexto; nada gravado antes do botão "Marcar como pessoal".
7. Os três controles negativos reprovam e foram revertidos.
8. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`; `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança em `e2e/` fora de `targets.json`.
9. Nenhum arquivo fora de `apps/ai-orchestrator/` (prisma, `src/modules/session/`, `src/modules/internal/routes.ts`, testes), `packages/public-api-contract/src/schemas.ts`, `apps/bff/src/modules/conversations/`, `apps/bff/src/clients/ai-orchestrator/`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e dos quatro registros da seção "Documentação" mudou. Arquivo da IA fora dessas pastas só com o motivo no relatório.
10. D-129 proposta, com a precedência, o escopo, o menu, o novo destino das ações e as divergências.

## Plano de execução

1. **WU-01 — Decisão por conversa na IA.** Migration, precedência, `SessionService`, rota interna e DTO, com os testes do §1.
2. **WU-02 — Contrato e BFF.** `categoryScope`, `scope`, documentação da API e testes do §2.
3. **WU-03 — Alvo K6 e medida de antes.** `targets.json`, o teste de `visual-responses` e as capturas de antes.
4. **WU-04 — O menu igual ao K6.** Folha, opções, gravação com escopo, contexto com "Assumir conversa" e o selo, testes novos e ajustes.
5. **WU-05 — Provas e registros.** Controles negativos, `visual:compare` depois, D-129, CURRENT_STATE, VALIDATION_GATE e DATA_MIGRATION.
6. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
