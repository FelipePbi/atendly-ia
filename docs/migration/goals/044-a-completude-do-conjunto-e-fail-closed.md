# Goal 044 — A completude do conjunto é fail-closed: chamador em outro arquivo e superfície de cliente derivada

**Status: ACCEPTED** na rodada 4, conforme o [review044](../reviews/044-review.md) — três rodadas `CHANGES_REQUIRED`, com 5, 3 e 1 blockers, antes do aceite com zero blockers. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal043 ACCEPTED](../reviews/043-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 044 nasce na [v65 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 043, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `3ea06738a8833a3b28801258f4626632c5888983`

Goal anterior: 043 — A fronteira inteira é atravessada: rota de transporte que o produto alcança e prosa ligada ao uso real

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal043 já integrado em `main` (origem `4a4b95ce157fe32ad830664eb23d7d5ded42b047`), com o conjunto de **10** rotas de transporte que o produto alcança computado por AST nas duas árvores TypeScript, atravessando a fronteira pelo arquivo de valores `apps/ai-orchestrator/tests/support/product-transport-routes.txt`, casado segmento a segmento contra as **94** rotas registradas do lado Go, e o conjunto de literais de prosa alcançáveis a partir do produto asserido **vazio** com guarda de não-vacuidade. Três rodadas: `CHANGES_REQUIRED` com 4 blockers, `CHANGES_REQUIRED` com 2, e o aceite na terceira com zero. O [review043](../reviews/043-review.md) foi aceito com **D-059** registrada e [FINAL_AUDIT §20](../FINAL_AUDIT.md) escrita sem reescrever §4 a §19. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

A série tem uma forma constante: cada passada fecha o nível anterior e declara em uma frase o nível que não tocou. O 038 fechou a **classe** dentro de cada extrator. O 039 fechou o **escopo** de leitura. O 040 fechou o **canal**. O 041 fechou o **egresso** nas duas árvores TypeScript. O 042 atravessou a **fronteira de serviço**. O 043 levou a travessia de **um valor** para **um conjunto**.

O limite que o 043 deixou não é de outra natureza, e não é hipótese de reviewer: está escrito em [VALIDATION_GATE](../VALIDATION_GATE.md) e no [review043](../reviews/043-review.md) como **duas bordas em que a completude do conjunto de 10 rotas não é fail-closed**. As duas são a forma branda exata da falha que reprovou a rodada 1 daquele Goal — o conjunto alcançado ser **subconjunto próprio** do real, e passar verde.

**Primeira borda — o chamador não atravessa arquivo.** `discoverCallerResolvedGoBoundRequests` (`apps/ai-orchestrator/tests/support/http-egress-sites.ts:1334`) resolve o destino de um `fetch` cuja URL vem de parâmetro em trânsito varrendo os chamadores com `findRealCallSites(source, enclosing.name)` em `:1365` — e `source` é **um arquivo só**, o do próprio sítio. Hoje isso é completo por acidente da árvore: a única função nessa categoria é `checkHealth`, declarada em `apps/bff/src/routes/health.ts:32` e **não exportada**, com os três chamadores no mesmo módulo. Um helper equivalente **exportado**, com o chamador que passa `env.EVOLUTION_GO_BASE_URL` em outro arquivo, cai em `notGoBound` pelo `countOut` de `:1555-1558` com o motivo escrito *"os chamadores de X decidem o destino, e nenhum deles passa uma chave de base do serviço Go"* — afirmação **factualmente errada**, porque nenhum chamador de outro arquivo foi lido. A rota nova sai do conjunto com um motivo que parece registro e é engano.

**Segunda borda — a superfície do cliente é digitada.** `discoverGoBoundInternalClientRequests` reconhece as chamadas ao cliente HTTP interno por três nomes num regex (`http-egress-sites.ts:1759`): `this.<campo>.(request|requestWithStatus|requestBinary)(`. Hoje esses três são exatamente a superfície pública de `apps/bff/src/clients/internal-http-client.ts` — `request` (`:33`), `requestWithStatus` (`:45`) e `requestBinary` (`:71`), com `credential` (`:29`) e `perform` (`:138`) privados. Um método público novo que delegasse ao `perform` privado não acrescentaria sítio de `fetch` algum na árvore, então o **resíduo de egresso cru herdado do Goal041 também não o pegaria**: a rota que ele alcança sairia do conjunto sem registro nenhum. É a mesma família de blocker dos Goals 036 a 043 — reconhecimento decidido por **nome** em vez de **forma** — e a resposta já tem precedente na própria série: o 040 substituiu `SEND_TEXT_TOKEN_PATTERN` escrito à mão por `parseWhatsAppProviderMethods`, que deriva os métodos portadores da declaração da porta. Aqui é a mesma operação, sobre a declaração da classe.

**Por que agora, e por que isso não é polimento.** O que o 043 entregou foi uma invariante que hoje sustenta a classificação de **A-24**: `"Ver Menu"` continua `PENDENCIA-POS-MVP` porque `POST /send/list` não está entre as 10 rotas que o produto alcança, e isso é resultado de teste. Essa invariante vale exatamente o que valer a **completude** do conjunto de 10. Com as duas bordas abertas, existem duas formas de acrescentar uma chamada ao transporte sem que nada no repositório note — e a segunda delas nem sequer precisa de um `fetch` novo. A afirmação forte que a coluna de VALIDATION_GATE faz hoje só se sustenta depois deste Goal.

O risco próprio continua o das passadas anteriores, deslocado: **descobrir demais**. Seguir chamador por **nome** de função através das duas árvores acharia homônimos e provaria travessias inexistentes; contar toda chamada `this.algo.metodo(` como requisição ao transporte transformaria em rota qualquer colaborador do cliente. E há o risco espelhado: **derivar de menos** — um membro público que alcança `fetch` por delegação de dois saltos, ou por um membro que a varredura não classificou, sairia do conjunto de novo.

Sete decisões de planejamento já estão tomadas e **não** são do Developer:

- **Chamador é seguido por ligação, nunca por nome solto.** Para a função que contém o sítio: as chamadas reais no mesmo arquivo continuam valendo; e, quando a declaração é **exportada**, os chamadores em outros arquivos são achados resolvendo o **import** daquele módulo — o especificador relativo resolvido a caminho de arquivo, o alias local lido da cláusula de import, importação default e nomeada tratadas. Casar `enclosing.name` contra o texto de outro arquivo sem resolver a ligação reprova o Goal.
- **Forma de ligação que a resolução não alcança derruba a leitura, com `arquivo:linha`.** Reexportação (`export * from`), import dinâmico, alias de caminho não resolvido, chamada indireta por referência passada adiante: cada uma é uma categoria **nomeada** que recusa, nunca um `continue`. As duas árvores são varridas — `apps/ai-orchestrator/src` e `apps/bff/src` — e isso é dito no motivo.
- **Motivo que afirma algo sobre os chamadores só pode ser escrito depois de ler todos eles.** O texto de `notGoBound` passa a ser computado: quantos chamadores foram lidos, em quantos arquivos, e por que nenhum resolve a chave de base do serviço Go. Não havendo como ler todos, é recusa, não contagem.
- **A superfície do cliente interno é derivada da declaração da classe.** Da classe que contém o sítio `constructor_base_url_*` — computada como já é hoje, sem nome digitado —, cada membro de topo é classificado por **alcançar ou não** uma chamada de `fetch`: direto no corpo, ou por delegação a outro membro da mesma classe, seguida transitivamente, com ciclo **reportado** e não silenciado (o mesmo tratamento que `followTransitChain` já dá desde o Goal041). Os membros que alcançam são a superfície de transporte; os que não alcançam são **contados fora com motivo escrito**. Nenhum nome de método em regex, em constante ou em teste.
- **A delegação é sobre-aproximada de propósito, na direção fail-closed.** `this.<membro>(` no corpo conta como alcançar tudo o que aquele membro alcança, sem análise de caminho. Errar para mais aqui é resíduo nomeado; errar para menos é a falha que este Goal existe para fechar.
- **O resultado esperado é o conjunto inalterado, e isso é afirmação a conferir, não a supor.** As mesmas **10** rotas, a mesma superfície de **três** membros, o mesmo sítio único resolvido no chamador (`health.ts`). Se a árvore discordar, o número do AST vence, a divergência é **declarada**, e o arquivo de valores é atualizado no mesmo diff, com os dois lados conferindo — conjunto que cresce não é falha do mecanismo, é descoberta, e rota nova que alcance literal Go faz o teste de prosa reprovar com `arquivo:linha` e volta a esta mesa.
- **Nada é editado fora da camada de teste.** `apps/*/src/`, o fork Go de produção, `go.mod`, `go.sum`, `packages/` e `tools/ia-loop/` ficam intocados. Violação real encontrada em código de produção vira **achado a partir de A-25**, no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) — nunca correção silenciosa.

## Dependências e contexto mínimo

- Goals 001 a 043 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review043](../reviews/043-review.md): a seção "Observações não bloqueantes" — que é a **origem deste Goal** — e a seção "O que este aceite não cobre", em especial que **A-24 é achado aberto, não corrigido**, e que a reach é sobre-aproximada de propósito.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo final "Duas bordas em que a completude do conjunto de 10 rotas não é fail-closed", que este Goal fecha e que precisa ser reescrito **por acréscimo**, não apagado.
- [DECISIONS](../DECISIONS.md): **D-050** (o guardrail vale sobre texto próprio do produto), **D-054** (reconhecimento por forma exige resíduo declarado), **D-055** (escopo computado), **D-056** (conjunto derivado da declaração da porta — o precedente direto da segunda borda), **D-057** (egresso por sítio de rede, genérico fail-closed pelos chamadores — o precedente direto da primeira) e **D-058**/**D-059** (cada lado lido na sua língua, travessia por valor e por conjunto). Todas continuam valendo inteiras.
- [FINAL_AUDIT §19 e §20](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o motivo, agora computado, do rebaixamento de A-24.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida sobre esta baseline. A enumeração por AST é a que vale: divergência é **declarada no relatório e na decisão nova**, e o número do AST vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042 e na rodada 1 do Goal043.

- `discoverCallerResolvedGoBoundRequests` está em `http-egress-sites.ts:1334`; a varredura de chamadores é `findRealCallSites(source, enclosing.name)` em `:1365`, e `findRealCallSites` (`:666`) recebe **um** `source`. O caminho de saída sem requisição é o `countOut` de `:1555-1558`.
- O único sítio da categoria `caller_resolved_base_url_via_*` hoje é `checkHealth` (`apps/bff/src/routes/health.ts:32`, `fetch` em `:46`), chamada três vezes, em `:20`, `:21` e `:22`; só a de `:22` passa `env.EVOLUTION_GO_BASE_URL`, e é ela que põe `GET /health` no conjunto. `checkHealth` **não** é exportada.
- `discoverGoBoundInternalClientRequests` está em `:1707`; o regex de três nomes está em `:1759`; o motivo de `assembledUrls` que repete os três nomes em prosa está em `:1826`.
- `apps/bff/src/clients/internal-http-client.ts`: classe `InternalHttpClient` (`:19`), construtor `:20`, `private credential` (`:29`), `async request` (`:33`, delega a `requestWithStatus`), `async requestWithStatus` (`:45`, delega a `perform`), `async requestBinary` (`:71`, `fetch` próprio em `:83`), `private async perform` (`:138`, `fetch` em `:149`). Dois sítios de `fetch`, três membros públicos, dois privados.
- Três instâncias de `new InternalHttpClient(` em `apps/bff/src` — `clients/ai-orchestrator/index.ts:336`, `clients/evolution/index.ts:68` e `clients/scheduling/index.ts:550` — e só a segunda aponta ao transporte, por `env.EVOLUTION_GO_BASE_URL`. `EvolutionClient.webhookUrl()` (`:74-78`) monta URL de **entrada** e continua tendo de ficar fora do conjunto alcançado.
- O arquivo de valores `apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem 18 linhas e **10** rotas: `DELETE /instance/delete/{}`, `DELETE /instance/logout`, `GET /health`, `GET /instance/qr`, `GET /instance/status`, `POST /instance/connect`, `POST /instance/create`, `POST /instance/pair`, `POST /message/downloadmedia` e `POST /send/text`.
- API já existente para reuso, e não para reescrita: em `http-egress-sites.ts`, `discoverHttpEgressSites`, `classifyHttpEgressSitesInSource`, `listTypeScriptSources`, `resolveEnclosingFunction`, `resolveDestination`, `findRealCallSites`, `findClassInstantiations`, `findEnclosingClassSpan`, `findTopLevelMethodBodies`, `methodNameAtBrace`, `blankComments`, `readEnvSchemaDefault`, `readEnvFileValue`, `readProductTransportRoutesFile` e `discoverGoServiceHttpRequests`; em `apps/evolution-go/pkg/transportguard/`, `Enumerate`, `Enumeration.Routes`, `Enumeration.RouteWithPath`, `ProductRoutes`, `ProseReachOfRoutes`, `ProseReachOfEveryRegisteredRoute` e `GoProseLiteralsReachingTransport`.
- Contagens da baseline, para comparar depois: `go test ./...` em `apps/evolution-go` com **174** testes de topo; `go test ./pkg/transportguard/` com **33**; `npm run test:gate` com **226 pass, 0 fail**; `assistant.service.test.ts` com **85** testes; `audit:static` com **34** checks; `validate:integration` com **35** passos; `apps/ai-orchestrator/tests/support/` com **cinco** arquivos; `http-egress-sites.ts` com **1921** linhas.
- `validate:core` executa `build:evolution-go`, `vet:evolution-go` e `test:evolution-go`, então o lado Go entra no gate global sem script novo. Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`.

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — as duas correções de completude. Extensão do módulo existente, não módulo paralelo.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — as afirmações permanentes, junto das que já existem.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — alterado **somente** se o conjunto computado mudar; se mudar, a mudança é justificada pela árvore e conferida pelos dois lados.
- `apps/evolution-go/pkg/transportguard/` — intocado, salvo se o conjunto de rotas mudar; nesse caso, apenas recontagem em arquivo de teste. Nenhum arquivo Go de produção é alterado em hipótese alguma.

## Escopo obrigatório

### 1. O chamador é seguido por ligação, e atravessa arquivo

- Para um sítio cuja URL depende de parâmetro em trânsito, os chamadores considerados passam a ser: as chamadas reais no mesmo arquivo **mais**, quando a declaração envolvente é exportada, as chamadas reais em todo arquivo das duas árvores que importe aquela ligação daquele módulo.
- A ligação é resolvida por forma: especificador relativo resolvido a caminho de arquivo (com a extensão que o projeto usa nos imports), alias local lido da cláusula de import, importação nomeada e default tratadas. **Nome igual sem import resolvido não é chamador** e não pode entrar no conjunto.
- Forma de ligação não resolvida — reexportação, import dinâmico, alias de caminho, referência passada adiante — é categoria **nomeada** que derruba a leitura com `arquivo:linha`. Nenhum `continue` mudo sobra neste caminho.
- O motivo escrito quando o sítio **não** entra no conjunto passa a ser computado e verdadeiro: diz quantos chamadores foram lidos e em quantos arquivos, e afirma apenas o que foi lido.
- O resultado esperado sobre a árvore real é o de hoje: um sítio nessa categoria, `GET /health`, e nenhuma rota nova. A afirmação é conferida, não suposta.

### 2. A superfície do cliente HTTP interno é derivada da declaração

- A classe continua sendo computada a partir do sítio `constructor_base_url_*`, sem nome digitado. Dela, cada membro de topo é classificado como **alcança `fetch`** ou **não alcança**, com o alcance seguindo delegação a outro membro da mesma classe, transitivamente, com ciclo reportado.
- O conjunto de membros que alcançam é a superfície de transporte usada para reconhecer as chamadas `this.<campo>.<membro>(`. O regex de três nomes literais desaparece; nenhum nome de método fica escrito em regra, constante ou teste.
- Membro que não alcança `fetch` é **enumerado com motivo** — não desaparece. Membro cuja forma a varredura não reconhece derruba a leitura com `arquivo:linha`.
- Chamada a membro da superfície sem objeto de opções, sem `path` ou sem `method` reconhecível continua derrubando a leitura, como já faz hoje.
- O motivo de `assembledUrls` deixa de citar três nomes literais e passa a citar a superfície derivada.
- O resultado esperado sobre a árvore real é o de hoje: superfície de **três** membros, dois sítios de `fetch` na classe, os privados fora com motivo escrito.

### 3. O conjunto continua provado, e a completude passa a ser afirmada

- As afirmações permanentes que o Goal043 deixou continuam valendo sem afrouxamento: conjunto computado igual ao arquivo de valores nas duas direções, resíduo de egresso **zero**, casamento segmento a segmento com o lado Go, literais alcançáveis a partir do produto asseridos vazios, guarda de não-vacuidade.
- Entram afirmações novas, todas sobre resultado **computado**: a superfície derivada do cliente é exatamente o conjunto de membros que alcançam `fetch`, enumerada no relatório; a resolução de chamadores varreu as duas árvores, e a lista de arquivos varridos é reportada; nenhum motivo de `notGoBound` afirma algo sobre chamadores que não foram lidos.
- A não-vacuidade vale para os dois mecanismos novos: o teste afirma que a derivação da superfície encontrou **ao menos um** membro que alcança `fetch`, e que a resolução de chamadores **de fato** produziu ao menos uma requisição. Mecanismo que não achasse nada derruba o teste em vez de passar verde.

### 4. Controle negativo: cada invariante morde

Quatro controles obrigatórios, cada um sobre árvore sintética montada e removida pelo próprio teste, nenhum tocando a árvore real. Os controles 1 e 2 exigem **as duas saídas** — o comportamento antes e depois da correção —, porque é neles que está a prova de que a borda estava aberta.

1. **Helper exportado com chamador em outro arquivo.** Função exportada que recebe a base por parâmetro e faz `fetch`, com o chamador que passa a chave de base do serviço Go em arquivo diferente: antes, o sítio saía em `notGoBound`; depois, a rota entra no conjunto.
2. **Método público novo delegando ao privado.** Membro público acrescentado à classe do cliente, sem `fetch` próprio, delegando ao membro privado que tem o `fetch`: antes, a chamada não era reconhecida e nenhuma rota aparecia; depois, a rota entra no conjunto.
3. **Ligação não resolvível recusa.** Chamador alcançável apenas por forma que a resolução não trata (reexportação ou import dinâmico) faz a leitura derrubar com `arquivo:linha`, e **não** produz motivo afirmando que os chamadores não passam chave de base.
4. **Nome não decide.** Mover o helper e a classe do cliente para arquivos e nomes diferentes não muda a classificação de nenhum dos dois mecanismos.

### 5. O que este Goal não pode fazer

- Não edita `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, nenhum arquivo Go de produção de `apps/evolution-go/`, `go.mod`, `go.sum`, `packages/`, nenhuma migration e nenhum `schema.prisma`.
- Não edita **nenhum arquivo de `tools/ia-loop/`**. Falha de gate por caminho do harness é **declarada** como defeito conhecido, com execução manual equivalente no relatório — precedente em D-048, e o laço que consumiu as rodadas 2 a 4 do Goal041 não se repete.
- Não corrige **A-24**, não reclassifica achado nenhum e não reabre achado fechado. Violação real nova vira achado a partir de **A-25**.
- Não mexe em `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS`, `VOCABULARIO_DE_ESPERA`, prompt, `MAIN_RULES`, versão de template nem copy.
- Não estreita conjunto existente para caber, não relaxa asserção, não pula teste e não aumenta tolerância.
- Não declara **M4** fechado, nem fidelidade visual provada, nem runtime do serviço Go provado.
- Não escreve rota, caminho, método ou nome de membro digitado à mão dentro de teste ou de regra.

### 6. Prova

- `validate:core` exit 0 sobre a árvore final, com `build:evolution-go`, `vet:evolution-go` e `test:evolution-go` verdes e `audit:static` mantendo os 34 checks.
- `npm run test:gate` exit 0, com a contagem antes e depois (baseline: 226 pass, 0 fail), e a contagem de `assistant.service.test.ts` antes e depois (baseline: 85).
- `go test ./...` em `apps/evolution-go` com a contagem antes e depois (baseline: 174) — nenhuma suíte encolheu, nenhum teste pulado.
- Os quatro controles negativos executados, cada um com a saída real, e revertidos; os controles 1 e 2 com **as duas saídas**.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente, isso é **declarado como tal**, nunca apresentado como verde.
- A enumeração completa: os membros da classe do cliente, cada um com alcança/não alcança e o motivo; os sítios resolvidos no chamador, com os chamadores lidos por arquivo; cada requisição ao transporte com arquivo, linha, categoria, método e expressão de caminho; e o conjunto final de rotas comparado ao arquivo de valores.

### 7. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. É critério de aceite, não recomendação: a documentação descreve o conjunto **real** de arquivos alterados, conferido por `git status --porcelain=v1` **depois** da última edição de código, com os números que a árvore final mostra.

- [CURRENT_STATE](../CURRENT_STATE.md): delta044 — que a resolução de chamador atravessa arquivo por ligação resolvida, que a superfície do cliente interno é derivada da declaração, e qual é o conjunto de rotas resultante.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a regra nova decide **agora** e o que continua não decidindo. O parágrafo "Duas bordas…" não é apagado: é acrescentada, junto dele, a declaração de que as duas foram fechadas e por qual mecanismo, e o que resta aberto é dito com a mesma clareza — em especial que nada aqui prova runtime do serviço Go, que `whatsmeow-lib/` continua fora do alcance, que rota registrada e não alcançada não é falha, e que texto emitido pelo modelo continua fora do guardrail por **D-050**.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§21**), no padrão de §8 e §10 a §20 e **sem reescrever** §4 a §20, registrando o fechamento, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-25** quando houver.
- [DECISIONS](../DECISIONS.md): **D-060**, no formato das anteriores, cobrindo por que chamador é seguido por ligação e não por nome, por que forma não resolvida recusa em vez de contar, por que motivo escrito só pode afirmar o que foi lido, por que a superfície do cliente é derivada da declaração e a delegação sobre-aproximada, e o que continua fora — runtime, binário de produção, `whatsmeow-lib/` e o valor real das variáveis de ambiente.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal044 no status resultante e o SHA aceito. Vinte fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Os chamadores de uma função que recebe a base por parâmetro são resolvidos por ligação importada, atravessando arquivo, nas duas árvores; nenhuma correspondência entra no conjunto por nome igual sem import resolvido.
2. Forma de ligação não resolvida derruba a leitura com `arquivo:linha`, em categoria nomeada; nenhum caminho de saída sem registro sobra em `discoverCallerResolvedGoBoundRequests` nem no `countOut` que o segue — provado pelo controle 3.
3. Motivo de `notGoBound` sobre chamadores é computado e afirma somente o que foi lido, com a contagem de chamadores e de arquivos varridos no texto.
4. A superfície do cliente HTTP interno é derivada da declaração da classe pelo alcance a `fetch`, com delegação seguida transitivamente e ciclo reportado; nenhum nome de método aparece em regex, constante ou teste — provado pelo controle 2.
5. Membro da classe que não alcança `fetch` é enumerado com motivo escrito, e forma não reconhecida derruba a leitura com `arquivo:linha`.
6. Nenhuma regra decide por nome de arquivo, pasta, classe, cliente, método ou URL literal — provado pelo controle 4, com classificação idêntica após mover e renomear.
7. O resíduo de egresso sobre as árvores reais continua **zero**, e forma não reconhecida continua derrubando com `arquivo:linha`.
8. O conjunto computado de rotas do serviço Go é igual ao de `product-transport-routes.txt` nas **duas** direções; se o conjunto mudou, o arquivo foi atualizado no mesmo diff, a mudança está justificada pela árvore, e o lado Go continua casando cada entrada com exatamente uma rota registrada.
9. Caminho com interpolação continua representado por buraco `{}`, com casamento segmento a segmento contra parâmetro de rota — nunca por comparação de string inteira.
10. URL montada para ser entregue ao transporte continua fora do conjunto alcançado, e cliente genérico apontado para outro serviço continua fora.
11. As invariantes não são vácuas: o teste afirma, sobre o resultado computado, que a derivação encontrou ao menos um membro que alcança `fetch` e que a resolução de chamadores produziu ao menos uma requisição.
12. O conjunto de literais Go não vazios alcançáveis a partir de rota que o produto alcança continua asserido e vazio, com a guarda de não-vacuidade do Goal043 intacta; `"Ver Menu"` continua provado inalcançável pelo conjunto do produto, por computação e não por texto digitado.
13. Nenhum arquivo Go de produção de `apps/evolution-go/` mudou, provado por diff; `go.mod` e `go.sum` não mudaram e nenhuma dependência nova entrou, em nenhuma das duas línguas.
14. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum de `apps/scheduling-service/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; nenhum de `packages/`; **nenhum arquivo de `tools/ia-loop/`**.
15. `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` são idênticos aos da baseline, provado por diff, e nenhuma copy mudou.
16. O que os Goals 040 a 043 provaram continua provado, com os mesmos conjuntos: 9 sítios de egresso HTTP com resíduo zero, 2 cadeias de trânsito, 82 sítios de escrita em campo portador, 19 chamadas de transporte, 88 escritas fora do relé, 27 literais não vazios, 94 rotas registradas, 325 campos portadores derivados e 10 rotas alcançadas. Divergência é declarada, com o número do AST prevalecendo.
17. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go.
18. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
19. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
20. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso, nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz continua com as cinco larguras.
21. Os quatro controles negativos obrigatórios existem, cada um exercita o artefato que o critério nomeia, a saída real de cada um está no relatório, os controles 1 e 2 trazem as duas saídas, e nenhuma quebra sobrou na árvore.
22. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos, a suíte Go não encolheu abaixo dos 174 testes e `assistant.service.test.ts` não encolheu abaixo dos 85.
23. Nenhum achado de A-04 a A-08, A-11 a A-17, A-19 ou A-24 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-25**.
24. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, que a verificação de resposta roda em produção, que o comportamento de runtime do serviço Go foi provado, nem que A-24 foi corrigido.
25. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
26. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
27. Falha de gate por caminho do harness é declarada como defeito conhecido do IA Loop, com execução manual equivalente no relatório, e **nenhum** arquivo de `tools/ia-loop/` foi editado em rodada nenhuma.
28. A documentação de §7 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados, conferido por `git status --porcelain=v1`; [DECISIONS](../DECISIONS.md) tem **D-060** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§21** e nenhuma seção anterior foi reescrita; o parágrafo das duas bordas em [VALIDATION_GATE](../VALIDATION_GATE.md) não foi apagado, e o fechamento delas foi escrito junto.
29. Números copiados deste documento que divergirem da árvore são declarados como divergência, com o número do AST prevalecendo.
30. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum diretório temporário de controle negativo sobrou.

## Entrega

Relatório do Developer com: a enumeração dos membros da classe do cliente HTTP interno, cada um com alcança/não alcança `fetch`, o caminho de delegação seguido e o motivo escrito de quem fica fora; a enumeração dos sítios resolvidos no chamador, com os chamadores lidos por arquivo e as ligações resolvidas; cada requisição ao transporte com arquivo, linha, categoria, método e expressão de caminho, e o conjunto final comparado ao arquivo de valores nas duas direções; a prova computada de que as invariantes não são vácuas; as duas saídas dos controles 1 e 2 e a saída real dos controles 3 e 4; a prova por diff de que nenhum arquivo Go de produção, nenhum `src/` dos três apps, nenhum `packages/`, nenhum `go.mod`/`go.sum` e nenhum arquivo de `tools/ia-loop/` foi tocado; o resultado por passo de `validate:core`, `go test ./...`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, runtime do serviço Go, binário de produção, `whatsmeow-lib/`, valor real das variáveis de ambiente e A-04 a A-08, A-11 a A-17, A-19 e A-24 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
