# Goal 037 — O gate vê o que o produto emite: chamador em laço, texto fora do fechamento e retentativa silenciosa

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal036 ACCEPTED](../reviews/036-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 037 nasce na [v58 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 036, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `5829cc4db0bcac995678bc6b1092f1e9dbf14c5a`

Goal anterior: 036 — Contrato público completo: campo a mais reprova e rota em laço é vista

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal036 já integrado em `main` (origem `08757527fde9e87e56cb1f5667e98d445ec85199`), com **A-20 a A-23** fechados, `collectUndeclaredKeys` recursivo em `apps/bff/src/lib/response-contract.ts`, as três rotas de `conversations` registradas com path literal, o check `bff_v1_routes_use_literal_paths` em `audit:static` e o [review036](../reviews/036-review.md). Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Depois do 036, **todo achado de auditoria que este repositório fecha sozinho está fechado**: A-01, A-02, A-03, A-09, A-10, A-18 e A-20 a A-23 saíram, e os treze que restam — A-04 a A-08, A-11 a A-17 e A-19 — dependem de ambiente hospedado, de credencial externa, de estoque de produção ou de decisão de pessoa. O que sobra de trabalho endereçável aqui não é achado: são **três lugares onde um gate declara ver mais do que vê**, cada um registrado por escrito pelo Goal que o encontrou e nenhum deles atribuído a Goal nenhum. Este Goal fecha os três.

**A primeira cegueira é simétrica à que o 036 fechou, e do lado oposto.** O 036 obrigou o BFF a registrar rota `/v1` com path literal, porque o extrator exige aspas. O extrator do **chamador** exige a mesma coisa — `FRONTEND_ROUTE_SCHEMA_CALL_PATTERN` (`scripts/final-production-audit.mjs:965`) só casa path entre aspas — e `apps/frontend/src/data/services/BffConversationService.ts:174` chama as três rotas de conversa com um template literal em crase. Conferido nesta passada sobre esta baseline, executando `node scripts/final-production-audit.mjs`: `public_api_route_coverage` sai `ok: true` imprimindo **quatro** rotas "with no frontend caller" — `GET /v1/conversations/:id/messages/:messageId/media`, que de fato não tem chamador, e `POST .../takeover`, `.../release` e `.../resolve`, que **têm**. A consequência não é o texto errado: em `findUncoveredPublicApiRoutes`, rota sem chamador reconhecido faz `continue` **antes** da conferência de entrada na tabela. Uma rota `/v1` chamada por path construído escapa inteira da exigência de contrato, em silêncio, com o check verde. Hoje não há lacuna real — as três têm entrada —, e é exatamente por isso que a hora de fechar é agora.

**A segunda cegueira é de um guardrail de produto, não de contrato.** O Goal034 fechou A-09 fazendo `PRODUCT_OWN_TEXTS` conter os dez textos que o produto emite por conta própria e provando que nenhum deles contém vocabulário de espera. O fechamento varre literais de `messages: [...]` **de um arquivo só**, `assistant.service.ts`, e o [MASTER_PLAN v56](../MASTER_PLAN.md#histórico-de-planejamento) registrou o limite como resíduo dirigido a um Goal futuro. Conferido nesta passada: `apps/ai-orchestrator/src/modules/graph/message-graph.ts` emite **seis** textos que a cliente recebe — `unsupportedMessageReply` (`:51`), `processingErrorReply` (`:53`), `audioNotUnderstoodReply` (`:62`), `imageReceivedReply` (`:70`), `documentReceivedReply` (`:72`) e `videoReceivedReply` (`:74`), despachados em `:882`, `:971`, `:1356`, `:1359`, `:1361` e `:1362` —, nenhum deles pertence a `PRODUCT_OWN_TEXTS`, e nenhum passa pela asserção de vocabulário de espera. O guardrail que `AGENTS.md` declara absoluto é verificado sobre pouco mais da metade dos textos que o produto realmente envia. `imageHandoffSummary` (`:77`) **não** é um deles: vai para `handoffSummary`, não para a cliente.

**A terceira é de honestidade de execução.** O [review036](../reviews/036-review.md) registrou um bloco de falha dentro de uma execução de `validate:integration` que terminou `exit 0`: `[notebook-1024] › servicos`, passando na retentativa por `retries: 1` (`apps/frontend/playwright.authenticated.config.ts:41`). Um gate que engole a primeira tentativa e reporta verde é um gate que, no dia em que a instabilidade virar defeito, vai continuar reportando verde até alguém ler o log inteiro. Os dois `playwright.*.config.ts` já escrevem relatório JSON (`e2e-results/authenticated/results.json` e `e2e-results/results.json`), onde teste reexecutado aparece com status `flaky`: a informação existe e ninguém a lê.

O risco próprio deste Goal, e é o que o review vai procurar primeiro: **trocar cegueira por ruído**. Uma regra que reprove qualquer path construído quebraria chamadas legítimas que não são rota; um fechamento de texto que varra literal demais transformaria log e chave de erro em "texto do produto"; e um gate que reprove qualquer retentativa transformaria instabilidade conhecida em bloqueio diário sem nada ter melhorado. As três invariantes precisam morder onde o problema está, e não além.

Duas decisões de planejamento já estão tomadas e **não** são do Developer:

- **Retentativa vira declaração, não reprovação.** `retries: 1` continua como está nos dois arquivos de configuração; o que muda é que a execução que usou retentativa passa a **dizer isso**, nomeando teste e projeto, na saída do passo e no resultado que ele devolve. Reprovar por `flaky` trocaria um gate que mente por um gate que trava.
- **Nenhuma copy muda.** Os seis textos de `message-graph.ts` entram no conjunto declarado **caractere por caractere**, do jeito que estão. Este Goal torna verificável o que o produto já diz; ele não reescreve nada que a cliente lê.

## Dependências e contexto mínimo

- Goals 001 a 036 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review036](../reviews/036-review.md): as duas observações não bloqueantes — o check novo cobrir só o lado do BFF e o bloco de falha com exit 0 em `[notebook-1024] › servicos`.
- [FINAL_AUDIT §13](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e a subseção "Achados novos a partir de A-24", que registra o limite do extrator do frontend como limite de ferramenta e não como achado.
- [MASTER_PLAN v56](../MASTER_PLAN.md#histórico-de-planejamento): o resíduo dirigido do fechamento de `PRODUCT_OWN_TEXTS`, declarado e nunca atribuído.
- [AGENTS.md](../../../AGENTS.md): o guardrail que proíbe mensagem técnica de espera. É produto, vence código e documentação defasados.
- [DECISIONS](../DECISIONS.md): **D-050** (guardrail sustentado por código e por gate, não por configuração) e **D-052** (a rigidez mora no produtor). As duas continuam valendo inteiras.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide, os checks novos dos Goals 035 e 036 e a pré-condição de bancos descartáveis de `validate:integration`.
- **Product Vault:** só se o Developer precisar conferir que um dos seis textos de `message-graph.ts` corresponde ao que o produto promete dizer. Nenhuma regra de negócio é decidida aqui.

### Fatos já confirmados na baseline, sem precisar redescobrir

- `node scripts/final-production-audit.mjs` sai **exit 0 com 33 checks e 0 falhas**. `public_api_route_coverage` imprime `(116 routes registered)` e quatro rotas "with no frontend caller"; `bff_v1_routes_use_literal_paths` imprime `read 65 files`.
- `findUncoveredPublicApiRoutes` (`scripts/final-production-audit.mjs`) faz `continue` na rota sem chamador reconhecido **antes** de conferir `tableKeys` — é aí que está o escape.
- Existe **exatamente uma** chamada `routeSchema` com path não literal em `apps/frontend/src/data/services/`: `BffConversationService.ts:174`, no helper privado `mutateState(id, action)`, com `action: "release" | "resolve" | "takeover"`.
- `PRODUCT_OWN_TEXTS` (`apps/ai-orchestrator/src/modules/assistant/assistant.service.ts:296`) é `PRODUCT_OWN_FIXED_TEXTS` (sete textos) mais três saudações de estilo; o fechamento vive em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` e varre só `messages: [...]` daquele arquivo.
- `VOCABULARIO_DE_ESPERA` está **duplicado**, com a mesma intenção, em `tests/assistant/assistant.service.test.ts:504` e `tests/evals/waiting-message-vocabulary.eval.test.ts:34`.
- Os dois `playwright.*.config.ts` do frontend declaram `retries: 1` e um reporter `json` com `outputFile` próprio.
- `scripts/goal033-authenticated-ui-rehearsal.mjs` roda o gate autenticado com `stdio: "inherit"` e decide por exit code; ele não lê o relatório JSON.
- `validate:integration` tem **35** passos. `scripts/tests/` tem **45** testes. `validate:core` inclui `audit:static`.

## Pontos de implementação

- `apps/frontend/src/data/services/BffConversationService.ts` — as três chamadas com padrão de rota literal.
- `scripts/final-production-audit.mjs` e `scripts/tests/` — a regra nova do lado do frontend e as regressões.
- `apps/ai-orchestrator/src/modules/graph/message-graph.ts` — os seis textos passam a pertencer ao conjunto declarado.
- `apps/ai-orchestrator/src/modules/assistant/assistant.service.ts` — só se o conjunto único exigir.
- `apps/ai-orchestrator/tests/` — o fechamento sobre os dois arquivos e a invariante de vocabulário única.
- `scripts/goal033-authenticated-ui-rehearsal.mjs` — a leitura do relatório JSON e a declaração de retentativa.
- `apps/frontend/e2e/authenticated-matrix.spec.ts` — só se o diagnóstico de §4 apontar condição de espera como causa.

## Escopo obrigatório

### 1. Chamador `/v1` do frontend é literal, e rota sem chamador reconhecido para de escapar da tabela

- As três chamadas de `mutateState` em `BffConversationService.ts` passam a declarar **padrão de rota literal** ao `routeSchema`, um por ação. O `path` da requisição continua sendo construído com `encodeURIComponent(id)`; o que precisa ser literal é o **padrão** declarado ao `routeSchema`. Comportamento idêntico ao da baseline: mesmo método, mesma URL emitida, mesmo schema, mesmo `signal`.
- Entra em `audit:static` uma **regra nomeada** que reprova chamada `routeSchema` de rota `/v1` cujo padrão não seja literal de string, em `apps/frontend/src/data/services/`, no padrão que o Goal034 impôs e os Goals 035 e 036 cumpriram: o `details` declara o conjunto de arquivos que a regra efetivamente leu.
- `public_api_route_coverage` passa a imprimir **uma** rota sem chamador — a de mídia —, e o conjunto continua **computado**, nunca escrito à mão. Nenhuma allowlist, nenhuma exceção por rota.
- A regressão em `scripts/tests/` exercita a regra nova **nos dois sentidos**, com árvore sintética: um arquivo de serviço com `routeSchema` em crase reprova; um só com literais passa.
- **O escape é provado, não afirmado.** O controle negativo 2 de §5 é o que demonstra que a cobertura deixava passar rota sem entrada na tabela quando o chamador não era literal.

### 2. Texto que o produto emite por conta própria é um conjunto só, e o vocabulário de espera morde todos

- Os seis textos de cliente de `message-graph.ts` passam a pertencer ao **mesmo conjunto declarado** de textos próprios do produto, sem alterar um caractere de copy e sem mudar quando cada um é emitido. A forma exata — exportar um conjunto próprio do módulo e compor, ou mover para um módulo compartilhado — é do Developer, desde que exista **um** conjunto conferível e que nenhum dos dois arquivos possa emitir texto de cliente fora dele.
- `imageHandoffSummary` **não** entra: não vai para a cliente. O relatório diz como a implementação distingue os dois casos.
- A invariante de vocabulário de espera passa a valer sobre **todos** os textos do conjunto, com **uma** definição de `VOCABULARIO_DE_ESPERA` compartilhada pelos dois arquivos de teste que hoje a duplicam. Duas cópias que podem divergir são a mesma classe de problema que este Goal está fechando.
- O fechamento passa a cobrir **as duas formas de emissão que os dois arquivos usam**: literal em `messages: [...]` e texto de resposta declarado como constante de módulo e despachado em `response: { text: ... }` ou em `return`. Um texto de cliente novo, em qualquer das duas formas, fica vermelho se não entrar no conjunto.
- **Falso positivo é blocker.** Mensagem de erro técnico, chave de log, nome de nó do grafo, sumário interno de handoff e literal de teste não são texto de cliente e não podem virar achado. O relatório diz qual é o critério e por que ele não alcança esses casos.
- Nenhuma mudança de comportamento da IA: nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`, nenhuma troca de quando o produto responde por conta própria.

### 3. Retentativa deixa de sair verde em silêncio

- `scripts/goal033-authenticated-ui-rehearsal.mjs` passa a **ler o relatório JSON** que o gate autenticado já escreve e a declarar, na saída do passo, quantos testes precisaram de retentativa e **quais** — projeto e título —, mesmo quando a execução termina com sucesso.
- A declaração entra também no resultado que o ensaio devolve, para que `validate:integration` a mostre no lugar onde hoje só existe um `passed`.
- `retries: 1` **não muda** nos dois arquivos de configuração, e execução com `flaky` **continua** terminando com sucesso. O que muda é que ela deixa de ser indistinguível de uma execução limpa.
- Se o relatório JSON não existir ou não for legível, o passo **diz isso** e falha — um leitor ausente que se cala reintroduz exatamente o problema que este item fecha.
- O mesmo tratamento vale para o gate público de `validate:ui` **apenas se** ele já produzir o relatório e a leitura couber sem mudar a forma de execução; se não couber, fica declarado no relatório como não feito e por quê, nunca apresentado como feito.

### 4. O flake conhecido: causa ou achado

- O Developer reproduz `[notebook-1024] › servicos` do gate autenticado e **diagnostica a causa**.
- Se a causa for condição de espera do próprio spec — asserção que corre contra carga, animação ou navegação —, ela é corrigida **esperando o que já é observável**, sem afrouxar nenhuma asserção de largura, contraste, foco, alvo de toque ou conteúdo, e sem aumentar teto de tolerância.
- Se a causa não for alcançável nesta árvore, ela vira **achado novo**, com identificador em sequência a partir de **A-24**, classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) e impacto de produto em uma frase. Não diagnosticar não é opção; não conseguir corrigir é.
- **Desabilitar, pular, marcar `fixme` ou aumentar `retries` é blocker.**

### 5. Controle negativo: cada invariante morde

No padrão dos Goals 031 a 036, com saída real no relatório e reversão obrigatória. **No mínimo cinco controles**, e estes cinco são obrigatórios. Cada um é provado **executando o artefato que ele diz derrubar** — derrubar um guard vizinho é o proxy que foi recusado na rodada 2 do Goal034:

1. **Chamador não literal.** Escrever um `routeSchema` de rota `/v1` com padrão em crase em `apps/frontend/src/data/services/` derruba `audit:static` com a regra nova nomeada.
2. **Rota sem entrada na tabela escapando pelo chamador não literal.** Acrescentar uma rota `/v1` registrada literalmente no BFF, chamada do frontend com padrão em crase e **sem** entrada na tabela: sobre a baseline, `public_api_route_coverage` sai **verde**; sobre a árvore final, o conjunto reprova. O relatório traz **as duas saídas**, e é este controle que prova que a cegueira era real.
3. **Texto de cliente novo fora do conjunto.** Acrescentar um texto de resposta em `message-graph.ts`, na forma que aquele arquivo usa, derruba o teste de fechamento nomeando o texto.
4. **Vocabulário de espera em texto do grafo.** Trocar um dos seis textos por um que diga para a cliente aguardar derruba a invariante nomeada — o controle que hoje nem existe para esse arquivo.
5. **Retentativa declarada.** Uma execução do gate autenticado em que um teste falha na primeira tentativa e passa na segunda produz, na saída do passo, a declaração de retentativa com projeto e título — e continua terminando com sucesso.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai (ou, no controle 5, é declarado) com identificação nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 6. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não mudar uma letra de copy.** Os seis textos entram no conjunto como estão. Nenhum texto novo para a cliente, nenhum texto removido.
- **Não mudar comportamento da IA:** nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`, nenhuma mudança de quando o produto responde por conta própria em vez de chamar o modelo.
- **Não mudar o que as rotas devolvem** nem o contrato público: nenhuma rota nova, verbo novo, campo novo, campo removido, nenhuma mudança em `packages/public-api-contract/src/schemas.ts` e nenhuma entrada nova ou removida em `routes.ts`. A URL que `mutateState` emite é byte a byte a mesma.
- **Não reprovar por retentativa** nem mudar `retries` em nenhum `playwright.*.config.ts`.
- **Não afrouxar asserção de gate renderizado:** nenhuma tolerância nova, nenhum teto aumentado, nenhum teste pulado, `fixme` ou `skip`, nenhuma largura removida da matriz.
- **Não mudar comportamento de tela.** Nenhum componente, texto de interface ou CSS. O gate renderizado do Goal033 continua medindo o que mede.
- **Não tocar `apps/bff/`** salvo se o diagnóstico de §4 provar que a causa do flake mora lá — e, nesse caso, a mudança é a mínima que corrige, declarada como tal. Nenhuma migration, nenhum `schema.prisma`, em nenhuma hipótese.
- **Não tocar `apps/scheduling-service/`, `apps/evolution-go/` nem `apps/health-worker/`.**
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir nem reclassificar achado aberto:** A-04 a A-08, A-11 a A-17 e A-19 não são tocados. A-01 a A-03, A-09, A-10, A-18 e A-20 a A-23 continuam fechados e não são reabertos.
- **Não enfraquecer gate nenhum**, não encolher a lista de 35 passos de `validate:integration`, não remover check de `audit:static` e não marcar teste como skip em silêncio.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

### 7. Prova

- `validate:core` exit 0 sobre a árvore final, com `audit:static` mostrando a regra nova nomeada, o `details` de escopo de cada regra tocada e `public_api_route_coverage` imprimindo uma única rota sem chamador.
- `npm run test:gate` exit 0, com as regressões novas nos dois sentidos.
- `test:bff`, `test:frontend` e a suíte do `ai-orchestrator` verdes, com a contagem de testes antes e depois — nenhuma suíte encolheu.
- Os cinco controles negativos executados, cada um com a saída real, e revertidos. O controle 2 traz as duas saídas, baseline e árvore final.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.
- `validate:ui` executado sobre a árvore final, provando que o gate renderizado continua verde e que nenhuma asserção foi afrouxada.

### 8. Documentação

Escrita **depois** da última mudança de árvore. O Goal036 levou uma rodada de `CHANGES_REQUIRED` exatamente por escrever a documentação antes das últimas unidades: aqui isso é critério de aceite, não recomendação.

- [CURRENT_STATE](../CURRENT_STATE.md): delta037 — o que a cobertura passou a exigir do lado do frontend, qual é o conjunto único de textos do produto e o que a execução do gate passou a declarar.
- [VALIDATION_GATE](../VALIDATION_GATE.md): a regra estática nova, a invariante de texto ampliada e a declaração de retentativa — o que cada uma decide **agora** e o que continua não decidindo, inclusive que `flaky` não reprova.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§14**), no padrão de §8 e §10 a §13 e **sem reescrever** §4 a §13, registrando que as três cegueiras declaradas foram fechadas, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-24** quando houver.
- [DECISIONS](../DECISIONS.md): **D-053**, no formato das anteriores, cobrindo por que a exigência de path literal vale nas duas pontas do contrato, por que o conjunto de textos próprios do produto é único e por que retentativa é declarada e não reprovada.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal037 no status resultante e o SHA aceito. Treze fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. As três chamadas de `mutateState` declaram padrão de rota **literal** ao `routeSchema`, e a URL emitida por cada uma é idêntica à da baseline, provada no diff.
2. `audit:static` tem regra nomeada que reprova `routeSchema` de rota `/v1` com padrão não literal em `apps/frontend/src/data/services/`, cujo `details` declara os arquivos lidos e cuja regressão em `scripts/tests/` exercita os dois sentidos.
3. `public_api_route_coverage` passa a imprimir **uma** rota sem chamador — a de mídia —, computada e não escrita à mão, com o número de rotas registradas no `details`.
4. O controle negativo 2 está no relatório com **as duas saídas**: verde sobre a baseline e reprovação sobre a árvore final, provando que rota sem entrada na tabela escapava pelo chamador não literal.
5. Os seis textos de cliente de `message-graph.ts` pertencem ao conjunto declarado de textos próprios do produto, **sem uma letra de copy alterada**, provado por diff.
6. `imageHandoffSummary` continua fora do conjunto, e o relatório diz qual critério o distingue de texto de cliente.
7. Existe **uma** definição de `VOCABULARIO_DE_ESPERA`, compartilhada, e a invariante vale sobre todos os textos do conjunto.
8. Um texto de cliente novo em `message-graph.ts`, na forma que o arquivo usa, fica vermelho se não entrar no conjunto — provado pelo controle 3.
9. Nenhum erro técnico, chave de log, nome de nó do grafo ou literal de teste virou achado do fechamento; o critério que os exclui está escrito no relatório.
10. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou, e nenhuma condição de emissão de texto próprio do produto mudou.
11. O ensaio do gate autenticado lê o relatório JSON e declara, na saída do passo e no resultado devolvido, quantos e quais testes usaram retentativa, mesmo em execução bem-sucedida.
12. Relatório JSON ausente ou ilegível faz o passo dizer isso e falhar; `retries: 1` continua inalterado nos dois `playwright.*.config.ts` e execução `flaky` continua terminando com sucesso.
13. O flake `[notebook-1024] › servicos` foi diagnosticado, com a causa escrita no relatório; se corrigido, foi por espera do que já é observável, sem afrouxar asserção; se não, virou achado a partir de **A-24** com classificação e impacto.
14. Nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz de larguras continua com as cinco.
15. Nenhuma tela, componente, texto de interface ou CSS mudou; nenhum arquivo de `apps/scheduling-service/`, `apps/evolution-go/` ou `apps/health-worker/` mudou; nenhuma migration e nenhum `schema.prisma`.
16. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido.
17. Os cinco controles negativos obrigatórios existem, cada um exercita **o artefato que o critério nomeia**, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
18. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos e `audit:static` não perdeu check.
19. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto.
20. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, nem que a verificação de resposta roda em produção.
21. `validate:core` exit 0, `npm run test:gate` exit 0 e `validate:ui` exit 0 sobre a árvore final.
22. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
23. A documentação de §8 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados; [DECISIONS](../DECISIONS.md) tem **D-053** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§14** e nenhuma seção anterior foi reescrita.
24. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
25. `git status --porcelain` não lista artefato não rastreado não declarado.

## Entrega

Relatório do Developer com: o diff das três chamadas literais e a prova de que a URL emitida não mudou; a regra estática nova, com o `details` de escopo e a saída real de `audit:static` mostrando uma única rota sem chamador; as duas saídas do controle 2, baseline e árvore final; a forma escolhida para o conjunto único de textos do produto, com o critério que distingue texto de cliente de erro técnico, log e sumário interno, e a prova de que nenhuma copy mudou; a unificação de `VOCABULARIO_DE_ESPERA`; o que o ensaio passou a declarar sobre retentativa, com uma saída real; o diagnóstico do flake `[notebook-1024] › servicos`, com causa e desfecho — corrigido ou achado a partir de A-24; a saída real dos cinco controles negativos, com a confirmação de que foram revertidos; o resultado por passo de `validate:core`, `test:gate`, `validate:ui` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual e A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
