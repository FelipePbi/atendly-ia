# Goal 045 — A identidade do cliente é resolvida: classe homônima em outro arquivo, instanciação sob alias e destino indireto

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal044 ACCEPTED](../reviews/044-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 045 nasce na [v66 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 044, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `d9b2416193194e6fd8eef58e18988a5585c40628`

Goal anterior: 044 — A completude do conjunto é fail-closed: chamador em outro arquivo e superfície de cliente derivada

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal044 já integrado em `main` (origem `1377c2397464099991c43b79863a27ea6c2d9a32`), com o chamador de sítio `caller_resolved_base_url_via_*` seguido por **ligação importada** através das duas árvores TypeScript e a superfície do cliente HTTP interno **derivada da declaração da classe** pelo alcance a `fetch`. Quatro rodadas: `CHANGES_REQUIRED` com 5 blockers, com 3, com 1, e o aceite na quarta, com zero. O conjunto de **10** rotas de transporte e o de **27** literais Go continuam idênticos aos que o Goal043 asseriu: `product-transport-routes.txt` está intocado desde então. **D-060** foi aceita e [FINAL_AUDIT §21](../FINAL_AUDIT.md) escrita sem reescrever §4 a §20. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

A série tem uma forma constante: cada passada fecha o nível anterior e declara em uma frase o nível que não tocou. O 038 fechou a **classe** dentro de cada extrator. O 039 fechou o **escopo** de leitura. O 040 fechou o **canal**. O 041 fechou o **egresso** nas duas árvores TypeScript. O 042 atravessou a **fronteira de serviço**. O 043 levou a travessia de **um valor** para **um conjunto**. O 044 tornou a completude desse conjunto **propriedade do mecanismo** em duas bordas, em vez de acidente da árvore.

O limite que o 044 deixou está escrito no próprio aceite, na primeira observação não bloqueante do [review044](../reviews/044-review.md), com o nome de "candidato natural a Goal futuro": `discoverGoBoundInternalClientRequests` **ainda deduplica a classe de cliente por nome**. É a mesma família do blocker que a rodada 4 fechou, um nível acima — e a conferência desta passada mostra que ela não está sozinha no mesmo descobridor. São **três** caminhos de saída sem registro, todos em `apps/ai-orchestrator/tests/support/http-egress-sites.ts`, todos com a mesma consequência: uma rota sai do conjunto de 10 **sem acrescentar sítio de `fetch` algum**, portanto invisível também para o resíduo de egresso cru do Goal041.

**Primeira borda — a identidade da classe é o nome.** `if (classSurfaces.has(classSpan.name)) continue;` (`:2558`). Com duas classes de cliente homônimas declaradas em arquivos diferentes, a segunda declaração não tem superfície própria computada, não entra em `internalClientSurfaces`, e os membros chamados sobre instâncias dela são avaliados contra a superfície da **primeira** — um membro que existe lá e não aqui passa como requisição; um membro que existe aqui e não lá derruba a leitura com uma mensagem que nomeia a classe errada. O `continue` é mudo. É literalmente o defeito que a rodada 3 do Goal044 reprovou em `scannedPrimitiveNames`, e cuja correção já está nesta árvore, em `:1016`: `scannedPrimitiveDeclarations` indexado por `${filePath}:${line}`.

**Segunda borda — a instanciação é achada por texto.** `findClassInstantiations` (`:2241`) monta um `RegExp` a partir do nome da classe (`:2246`) e o aplica a **todo** arquivo das duas árvores, sem resolver o que aquele identificador está ligado naquele arquivo. Erra nas duas direções. Para mais: `new InternalHttpClient(` de uma classe homônima declarada em outro módulo — ou uma classe local de mesmo nome — é atribuído à superfície desta, e as chamadas sobre ela entram no conjunto como requisições ao transporte que não existem. Para menos, que é a direção grave: sob `import { InternalHttpClient as Client } from "…"`, o sítio real é `new Client(`, o padrão não casa, **nenhuma** instanciação é encontrada naquele arquivo, e toda rota alcançada por aquele cliente sai do conjunto em silêncio.

**Terceira borda — destino não resolvido é descartado.** `const goEnvVar = destination.envVars.find(…); if (goEnvVar === undefined) continue;` (`:2576-2577`). `resolveDestination` recebe `instantiation.argsText[0]` com `parameterNames` **vazio** (`:2570-2575`): quando o primeiro argumento não é uma expressão de que a leitura extraia chave de ambiente — base recebida por parâmetro do construtor da classe dona, lida de um objeto de configuração, ou guardada num campo —, a instanciação é **descartada sem registro nenhum**. Não vira requisição, não vira resíduo, não derruba. O cliente aponta para o serviço Go e o descobridor não diz uma palavra.

**Por que os três são inofensivos hoje, e por que isso é exatamente o problema.** A árvore tem uma única classe `InternalHttpClient` (`apps/bff/src/clients/internal-http-client.ts:19`); três instanciações, todas em `apps/bff/src` — `clients/ai-orchestrator/index.ts:336`, `clients/evolution/index.ts:68` e `clients/scheduling/index.ts:550` —, nenhuma sob alias de import, e as três passam `env.<CHAVE>` literal no primeiro argumento, das quais só a segunda resolve a `EVOLUTION_GO_BASE_URL`. A completude é, de novo, acidente da árvore. É o mesmo argumento que abriu o Goal044 e que o aceite dele confirmou ser o certo.

**Por que agora, e por que isso não é polimento.** A classificação de **A-24** continua repousando na completude do conjunto de 10: `"Ver Menu"` é `PENDENCIA-POS-MVP` porque `POST /send/list` não está entre as rotas que o produto alcança, e isso é resultado de teste. Essa invariante vale o que valer a completude. Com as três bordas abertas, há três formas de acrescentar uma chamada ao transporte sem que nada no repositório note, e **nenhuma delas exige um `fetch` novo**.

**Este Goal não constrói mecanismo novo.** A máquina de ligação já existe nesta árvore, foi construída pelo Goal044 e aceita no review044: `findImportDeclarations` (`:1481`), `resolveModuleSpecifierToFilePath` (`:1741`), `resolveModuleExportBindings` (`:1649`), `findCrossFileCallerBindings` (`:1780`), `describeExportBindings` (`:1730`), `findDynamicImportSpecifiers` (`:1520`) e `findReexportDeclarations` (`:1531`). A chave por declaração também: `:1016`. O trabalho é aplicá-las ao caminho da classe de cliente, que ficou de fora, e fechar o `continue` de destino não resolvido. Reescrever paralelamente o que já existe é blocker.

O risco próprio é o das passadas anteriores, deslocado: **descobrir demais** — tratar como instanciação da classe qualquer `new X(` cujo nome bata, ou aceitar uma ligação que não foi de fato resolvida — e o risco espelhado, **derivar de menos**, deixando de achar a instanciação sob uma forma de import que a resolução trata mas o caminho novo esqueceu de consultar.

Seis decisões de planejamento já estão tomadas e **não** são do Developer:

- **A identidade da classe de cliente é a declaração, nunca o nome.** A chave de `classSurfaces` e de todo relatório derivado passa a ser o sítio de declaração (`arquivo:linha` da classe), no formato que `:1016` já usa. Duas classes homônimas em arquivos diferentes têm **duas** superfícies computadas e **duas** entradas no relatório. O relatório continua carregando `className` e `filePath` para leitura humana; nada casa por `className` sozinho.
- **A instanciação só conta quando a ligação local resolve àquela declaração.** Em cada arquivo candidato, o identificador usado em `new <Id>(` é resolvido pela ligação daquele arquivo: import nomeado, import nomeado sob alias, import default, ou declaração local no próprio arquivo. Nome igual sem ligação resolvida à declaração daquela classe **não é instanciação dela** e não pode entrar. Alias resolvido **é** instanciação e tem de entrar.
- **Forma de ligação que a resolução não alcança derruba a leitura, com `arquivo:linha`, em categoria nomeada.** Reexportação em cadeia, import dinâmico, alias de caminho não relativo, `export =`, `module.exports`, referência à classe passada adiante como valor: cada uma recusa em voz alta. Nenhum `continue` mudo sobra neste caminho. Recusar não é resolver — e é o que o Goal pede, no precedente já aceito em **D-060**.
- **Destino de instanciação não resolvido recusa em vez de pular.** O `continue` de `:2577` deixa de existir na forma atual. A instanciação cujo primeiro argumento a leitura consegue resolver a uma chave que **não** é do serviço Go continua fora do conjunto, mas **enumerada com motivo computado** — é o caso real das instâncias de `ai-orchestrator` e `scheduling`. A instanciação cujo argumento a leitura **não** resolve a chave alguma derruba com `arquivo:linha`, nomeando a expressão que não soube converter. As duas saídas são distintas e nenhuma é silenciosa.
- **O motivo escrito só pode afirmar o que a leitura fez.** Todo texto que este caminho produz — enumeração de instanciação fora do transporte, membro fora da superfície, recusa — é computado: quantos arquivos foram varridos, qual ligação foi resolvida, qual declaração foi alcançada. Motivo que afirme exaustividade não exercida é blocker, como foi nas quatro rodadas do Goal044.
- **O resultado esperado é o conjunto inalterado, e isso é afirmação a conferir, não a supor.** As mesmas **10** rotas, **uma** classe de cliente, **três** instanciações, **uma** apontada ao transporte, superfície de **três** membros. Se a árvore discordar, o número do AST vence, a divergência é **declarada**, e o arquivo de valores é atualizado no mesmo diff, com os dois lados conferindo — conjunto que cresce não é falha do mecanismo, é descoberta, e rota nova que alcance literal Go faz o teste de prosa reprovar com `arquivo:linha` e volta a esta mesa.

## Dependências e contexto mínimo

- Goals 001 a 044 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review044](../reviews/044-review.md): a seção "Observações não bloqueantes" — que é a **origem deste Goal** —, as quatro rodadas e o que elas ensinam sobre `continue` mudo, e a seção "O que este aceite não cobre", em especial que **A-24 é achado aberto, não corrigido**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo das duas bordas do 043 e a frase de fechamento que o 044 acrescentou junto dele. O registro é por **acréscimo**; não se apaga texto anterior.
- [DECISIONS](../DECISIONS.md): **D-054** (reconhecimento por forma exige resíduo declarado), **D-055** (escopo computado), **D-056** (conjunto derivado da declaração), **D-057** (egresso por sítio de rede, genérico fail-closed pelos chamadores), **D-058**/**D-059** (cada lado lido na sua língua, travessia por valor e por conjunto) e **D-060** (chamador seguido por ligação importada, superfície derivada por alcançabilidade) — esta última é o precedente direto das três bordas. Todas continuam valendo inteiras. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §20 e §21](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o motivo computado do rebaixamento de A-24.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida sobre esta baseline. A enumeração por AST é a que vale: divergência é **declarada no relatório e na decisão nova**, e o número do AST vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043 e nas rodadas 1 e 2 do Goal044.

- `discoverGoBoundInternalClientRequests` está em `http-egress-sites.ts:2528`. O mapa `classSurfaces` é criado em `:2543` como `Map<string, InternalClientMemberSurface>`; a dedução por nome está em `:2558` e a escrita em `:2560`; a entrada do relatório é montada em `:2561-2566`.
- `findClassInstantiations` está em `:2241`; o padrão textual, em `:2246`; a chamada que o alimenta com `classSpan.name`, em `:2569`.
- `resolveDestination` (`:625`) é chamado em `:2570-2575` com `instantiation.argsText[0] ?? ""` e `parameterNames` **vazio**; o descarte silencioso é `:2576-2577`. A recusa que já existe logo abaixo — instância sem campo de classe reconhecível — está em `:2579-2585` e é o modelo de mensagem a seguir.
- `GO_SERVICE_BASE_URL_ENV_VARS` (`:1235`) tem duas chaves: `EVOLUTION_BASE_URL` e `EVOLUTION_GO_BASE_URL`.
- Máquina de ligação já existente, para **reuso** e não para reescrita: `findImportDeclarations` (`:1481`), `findDynamicImportSpecifiers` (`:1520`), `findReexportDeclarations` (`:1531`), `findLocalExportListBindings` (`:1553`), `findExportConstructs` (`:1613`), `resolveModuleExportBindings` (`:1649`), `describeExportBindings` (`:1730`), `resolveModuleSpecifierToFilePath` (`:1741`), `findCrossFileCallerBindings` (`:1780`) e o precedente de chave por declaração em `discoverHttpEgressSites`, `scannedPrimitiveDeclarations` (`:1011` e `:1016`).
- Demais API para reuso: `listTypeScriptSources` (`:118`), `findRealCallSites` (`:682`), `classifyHttpEgressSitesInSource` (`:898`), `discoverHttpEgressSites` (`:967`), `findEnclosingClassSpan` (`:2212`), `findAssignedFieldName` (`:2227`), `findTopLevelMethodBodies` (`:2272`), `computeInternalClientMemberSurface` (`:2435`), `discoverGoServiceHttpRequests` (`:2695`) e `readProductTransportRoutesFile` (`:2760`).
- `apps/bff/src/clients/internal-http-client.ts`: classe `InternalHttpClient` (`:19`), `private credential` (`:29`), `async request` (`:33`), `async requestWithStatus` (`:45`), `async requestBinary` (`:71`, `fetch` em `:83`), `private async perform` (`:138`, `fetch` em `:149`). Superfície derivada hoje: **3** membros alcançando `fetch`, **3** excluídos com motivo (`constructor`, `credential`, `perform` private).
- Três instanciações em `apps/bff/src`, todas com `env.<CHAVE>` literal como primeiro argumento: `clients/ai-orchestrator/index.ts:336` (`env.AI_ORCHESTRATOR_BASE_URL`), `clients/evolution/index.ts:68` (`env.EVOLUTION_GO_BASE_URL`, a única do transporte) e `clients/scheduling/index.ts:550` (`env.SCHEDULING_SERVICE_BASE_URL`). Nenhuma sob alias de import. `EvolutionClient.webhookUrl()` monta URL de **entrada** e continua tendo de ficar fora do conjunto alcançado.
- O arquivo de valores `apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem **10** rotas: `DELETE /instance/delete/{}`, `DELETE /instance/logout`, `GET /health`, `GET /instance/qr`, `GET /instance/status`, `POST /instance/connect`, `POST /instance/create`, `POST /instance/pair`, `POST /message/downloadmedia` e `POST /send/text`.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **113** testes e 4541 linhas; suíte completa de `apps/ai-orchestrator` com **837** passando e **88** pulados; `npm run test:gate` com **226 pass, 0 fail, 0 skipped**; `go test ./...` em `apps/evolution-go` com **174** testes de topo e `go test ./pkg/transportguard/` com **33**; `audit:static` com **34** checks; `validate:integration` com **35** passos; `http-egress-sites.ts` com **2782** linhas; `apps/ai-orchestrator/tests/support/` com **cinco** arquivos.
- `validate:core` executa `build:evolution-go`, `vet:evolution-go` e `test:evolution-go`, então o lado Go entra no gate global sem script novo. Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`.

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — as três correções, por **extensão do módulo existente e reuso da máquina de ligação já aceita**, nunca por módulo paralelo nem por reimplementação do que já existe.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — as afirmações permanentes, junto das que já existem.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — alterado **somente** se o conjunto computado mudar; se mudar, a mudança é justificada pela árvore e conferida pelos dois lados.
- `apps/evolution-go/pkg/transportguard/` — intocado, salvo se o conjunto de rotas mudar; nesse caso, apenas recontagem em arquivo de teste. Nenhum arquivo Go de produção é alterado em hipótese alguma.

## Escopo obrigatório

### 1. A identidade da classe de cliente é a declaração

- `classSurfaces` e todo estado derivado passam a ser indexados pelo sítio de **declaração** da classe (`arquivo:linha`), no formato já usado em `:1016`. O `continue` de `:2558` só pode ocorrer quando a **mesma declaração** já foi computada.
- Duas classes homônimas declaradas em arquivos diferentes produzem **duas** superfícies e **duas** entradas em `internalClientSurfaces`, cada uma com `className` e `filePath` próprios. Nenhum casamento posterior usa `className` isolado como chave.
- A mensagem de recusa por membro fora da superfície passa a nomear a **declaração** avaliada, não só o nome da classe.

### 2. A instanciação é reconhecida por ligação, não por texto

- Em cada arquivo candidato das duas árvores, o identificador de `new <Id>(` é resolvido contra a ligação daquele arquivo até a declaração da classe: import nomeado, import nomeado **sob alias**, import default, ou declaração local no próprio arquivo. Só conta como instanciação daquela classe quando a resolução chega àquela declaração.
- Nome igual sem ligação resolvida **não** entra. Alias resolvido **entra**.
- Forma de ligação não tratada — reexportação em cadeia, import dinâmico, alias de caminho não relativo, `export =`, `module.exports`, classe passada adiante como valor — é categoria **nomeada** que derruba a leitura com `arquivo:linha`. Nenhum `continue` mudo sobra neste caminho.
- O relatório diz quantos arquivos foram varridos atrás de instanciação e quais ligações foram resolvidas. Afirmação sobre instanciação só é escrita depois da varredura que a sustenta.

### 3. Destino de instanciação não resolvido recusa, e fora-do-transporte é enumerado

- O descarte silencioso de `:2577` deixa de existir. Passam a haver duas saídas distintas e nomeadas: instanciação cujo destino resolve a uma chave **fora** do serviço Go é **enumerada com motivo computado** (chave resolvida, arquivo, linha) e fica fora do conjunto; instanciação cujo destino a leitura **não** resolve a chave alguma **derruba** com `arquivo:linha`, nomeando a expressão não convertida.
- A enumeração sai do descobridor e é consumida por teste — `excludedMembers` preenchido e nunca lido foi blocker na rodada 1 do Goal044 e não se repete.
- Sobre a árvore real, o esperado é: **três** instanciações, **uma** no transporte e **duas** enumeradas fora com a chave que as põe fora. Afirmação a conferir, não a supor.

### 4. O conjunto continua provado, e a identidade passa a ser afirmada

- As afirmações permanentes dos Goals 043 e 044 continuam valendo sem afrouxamento: conjunto computado igual ao arquivo de valores nas duas direções, resíduo de egresso **zero**, casamento segmento a segmento com o lado Go, literais alcançáveis a partir do produto asseridos vazios, guarda de não-vacuidade, superfície derivada por alcançabilidade, chamador seguido por ligação.
- Entram afirmações novas, todas sobre resultado **computado**: cada superfície do relatório corresponde a uma declaração distinta; cada instanciação reconhecida teve a ligação resolvida até a declaração; nenhuma instanciação foi descartada sem registro.
- A não-vacuidade vale para os mecanismos novos: o teste afirma que a resolução por ligação **de fato** reconheceu ao menos uma instanciação, e que a enumeração de fora-do-transporte **de fato** produziu ao menos uma entrada. Mecanismo que não achasse nada derruba o teste em vez de passar verde.

### 5. Controle negativo: cada invariante morde

Quatro controles obrigatórios, cada um sobre árvore sintética montada e removida pelo próprio teste, nenhum tocando a árvore real. Os controles 1, 2 e 3 exigem **as duas saídas** — o comportamento antes e depois da correção —, porque é neles que está a prova de que a borda estava aberta.

1. **Classe homônima em outro arquivo.** Duas classes de cliente com o mesmo nome, declaradas em arquivos diferentes, cada uma com sua superfície e cada uma instanciada: antes, a segunda não tinha superfície própria e seus membros eram julgados contra a primeira; depois, há duas superfícies e cada membro é julgado contra a sua declaração.
2. **Instanciação sob alias.** Cliente importado como `import { C as Alias }` e instanciado como `new Alias(` com a chave de base do serviço Go: antes, nenhuma instanciação era encontrada e a rota sumia do conjunto; depois, a rota entra.
3. **Destino indireto.** Instanciação cujo primeiro argumento não resolve a chave alguma — base recebida por parâmetro do construtor da classe dona: antes, a instanciação era descartada em silêncio; depois, a leitura derruba com `arquivo:linha`.
4. **Nome não decide.** Uma classe **homônima e não relacionada**, declarada em outro módulo e instanciada em outro arquivo, não é atribuída à superfície da classe do transporte, e sua presença não acrescenta rota nenhuma ao conjunto. Mover e renomear a classe real não muda a classificação.

### 6. O que este Goal não pode fazer

- Não edita `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, nenhum arquivo Go de produção de `apps/evolution-go/`, `go.mod`, `go.sum`, `packages/`, nenhuma migration e nenhum `schema.prisma`.
- Não edita **nenhum arquivo de `tools/ia-loop/`**. Falha de gate por caminho do harness é **declarada** como defeito conhecido, com execução manual equivalente no relatório — precedente em D-048, e o laço que consumiu as rodadas 2 a 4 do Goal041 não se repete.
- Não reimplementa a máquina de ligação do Goal044 em paralelo, não cria módulo novo de descoberta e não duplica `findCrossFileCallerBindings` nem `resolveModuleExportBindings`.
- Não corrige **A-24**, não reclassifica achado nenhum e não reabre achado fechado. Violação real nova vira achado a partir de **A-25**.
- Não mexe em `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS`, `VOCABULARIO_DE_ESPERA`, prompt, `MAIN_RULES`, versão de template nem copy.
- Não estreita conjunto existente para caber, não relaxa asserção, não pula teste e não aumenta tolerância.
- Não declara **M4** fechado, nem fidelidade visual provada, nem runtime do serviço Go provado.
- Não escreve rota, caminho, método, nome de classe ou nome de membro digitado à mão dentro de teste ou de regra.

### 7. Prova

- `validate:core` exit 0 sobre a árvore final, com `build:evolution-go`, `vet:evolution-go` e `test:evolution-go` verdes e `audit:static` mantendo os 34 checks.
- `npm run test:gate` exit 0, com a contagem antes e depois (baseline: 226 pass, 0 fail), a contagem de `assistant.service.test.ts` antes e depois (baseline: 113) e a da suíte completa de `apps/ai-orchestrator` (baseline: 837 passando, 88 pulados).
- `go test ./...` em `apps/evolution-go` com a contagem antes e depois (baseline: 174) — nenhuma suíte encolheu, nenhum teste pulado.
- Os quatro controles negativos executados, cada um com a saída real, e revertidos; os controles 1, 2 e 3 com **as duas saídas**.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente, isso é **declarado como tal**, nunca apresentado como verde.
- A enumeração completa: cada declaração de classe de cliente reconhecida, com seu `arquivo:linha` e sua superfície; cada instanciação, com o arquivo, a linha, o identificador usado, a ligação resolvida e a classificação (transporte, fora do transporte com chave, ou recusa); cada requisição ao transporte com arquivo, linha, categoria, método e expressão de caminho; e o conjunto final de rotas comparado ao arquivo de valores nas duas direções.

### 8. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. É critério de aceite, não recomendação: a documentação descreve o conjunto **real** de arquivos alterados, conferido por `git status --porcelain=v1` **depois** da última edição de código, com os números que a árvore final mostra.

- [CURRENT_STATE](../CURRENT_STATE.md): delta045 — que a classe de cliente é identificada por declaração, que a instanciação é reconhecida por ligação resolvida, que destino não resolvido recusa e que fora-do-transporte é enumerado, e qual é o conjunto de rotas resultante.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a regra nova decide **agora** e o que continua não decidindo. Nada do registro anterior é apagado: acrescenta-se, junto dele, o fechamento das três bordas e por qual mecanismo, e o que resta aberto é dito com a mesma clareza — em especial que nada aqui prova runtime do serviço Go, que `whatsmeow-lib/` continua fora do alcance, que rota registrada e não alcançada não é falha, que as formas de ligação não tratadas **recusam** em vez de resolver, e que texto emitido pelo modelo continua fora do guardrail por **D-050**.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§22**), no padrão de §8 e §10 a §21 e **sem reescrever** §4 a §21, registrando o fechamento, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-25** quando houver.
- [DECISIONS](../DECISIONS.md): **D-061**, no formato das anteriores, cobrindo por que a identidade da classe é a declaração e não o nome, por que a instanciação é reconhecida por ligação, por que destino não resolvido recusa enquanto destino fora do transporte é enumerado, e o que continua fora — runtime, binário de produção, `whatsmeow-lib/` e o valor real das variáveis de ambiente.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal045 no status resultante e o SHA aceito. Vinte e um fechamentos seguidos omitiram isso; este não omite. O status do documento deste Goal também vira ACCEPTED no mesmo commit, como o fechamento do 044 fez.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A superfície do cliente é indexada pelo sítio de **declaração** da classe; duas classes homônimas em arquivos diferentes produzem duas superfícies e duas entradas no relatório — provado pelo controle 1, com as duas saídas.
2. A instanciação é reconhecida resolvendo a ligação local até a declaração da classe; `new <Alias>(` sob import com alias é encontrado, e nome igual sem ligação resolvida **não** entra — provado pelos controles 2 e 4, o 2 com as duas saídas.
3. Forma de ligação não tratada derruba a leitura com `arquivo:linha`, em categoria nomeada; nenhum caminho de saída sem registro sobra em `discoverGoBoundInternalClientRequests`.
4. Instanciação cujo destino a leitura não resolve a chave alguma derruba com `arquivo:linha`; instanciação cujo destino resolve a chave fora do serviço Go é enumerada com motivo computado, e a enumeração é consumida por teste — provado pelo controle 3, com as duas saídas.
5. Nenhum motivo escrito por este caminho afirma varredura, ligação ou exaustividade que a leitura não exerceu; os textos trazem contagem de arquivos varridos e a ligação resolvida.
6. A máquina de ligação do Goal044 foi **reusada**, não reimplementada: nenhuma cópia paralela de `findCrossFileCallerBindings`, `resolveModuleExportBindings`, `resolveModuleSpecifierToFilePath` ou `findImportDeclarations` existe no diff.
7. Nenhuma regra decide por nome de arquivo, pasta, classe, cliente, método ou URL literal — provado pelo controle 4, com classificação idêntica após mover e renomear.
8. O resíduo de egresso sobre as árvores reais continua **zero**, e forma não reconhecida continua derrubando com `arquivo:linha`.
9. O conjunto computado de rotas do serviço Go é igual ao de `product-transport-routes.txt` nas **duas** direções; se o conjunto mudou, o arquivo foi atualizado no mesmo diff, a mudança está justificada pela árvore, e o lado Go continua casando cada entrada com exatamente uma rota registrada.
10. Caminho com interpolação continua representado por buraco `{}`, com casamento segmento a segmento contra parâmetro de rota — nunca por comparação de string inteira.
11. URL montada para ser entregue ao transporte continua fora do conjunto alcançado, e cliente genérico apontado para outro serviço continua fora, agora **enumerado** em vez de descartado.
12. As invariantes não são vácuas: o teste afirma, sobre o resultado computado, que a resolução por ligação reconheceu ao menos uma instanciação e que a enumeração de fora-do-transporte produziu ao menos uma entrada, além das guardas de não-vacuidade já existentes.
13. O que o Goal044 provou continua provado: chamador seguido por ligação importada atravessando arquivo, superfície derivada por alcançabilidade com delegação transitiva e ciclo reportado, membro excluído enumerado com motivo, e nenhum dos três nomes de método em regex ou constante de regra.
14. O conjunto de literais Go não vazios alcançáveis a partir de rota que o produto alcança continua asserido e vazio, com a guarda de não-vacuidade do Goal043 intacta; `"Ver Menu"` continua provado inalcançável pelo conjunto do produto, por computação e não por texto digitado.
15. Nenhum arquivo Go de produção de `apps/evolution-go/` mudou, provado por diff; `go.mod` e `go.sum` não mudaram e nenhuma dependência nova entrou, em nenhuma das duas línguas.
16. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum de `apps/scheduling-service/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; nenhum de `packages/`; **nenhum arquivo de `tools/ia-loop/`**.
17. `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` são idênticos aos da baseline, provado por diff, e nenhuma copy mudou.
18. O que os Goals 040 a 044 provaram continua provado, com os mesmos conjuntos: 9 sítios de egresso HTTP com resíduo zero, 2 cadeias de trânsito, 82 sítios de escrita em campo portador, 19 chamadas de transporte, 88 escritas fora do relé, 27 literais não vazios, 94 rotas registradas, 325 campos portadores derivados e 10 rotas alcançadas. Divergência é declarada, com o número do AST prevalecendo.
19. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go.
20. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
21. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
22. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso, nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz continua com as cinco larguras.
23. Os quatro controles negativos obrigatórios existem, cada um exercita o artefato que o critério nomeia, a saída real de cada um está no relatório, os controles 1, 2 e 3 trazem as duas saídas, e nenhuma quebra sobrou na árvore.
24. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos, a suíte Go não encolheu abaixo dos 174 testes, `assistant.service.test.ts` não encolheu abaixo dos 113 e a suíte completa de `apps/ai-orchestrator` não encolheu abaixo dos 837 passando.
25. Nenhum achado de A-04 a A-08, A-11 a A-17, A-19 ou A-24 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-25**.
26. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, que a verificação de resposta roda em produção, que o comportamento de runtime do serviço Go foi provado, nem que A-24 foi corrigido.
27. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
28. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
29. Falha de gate por caminho do harness é declarada como defeito conhecido do IA Loop, com execução manual equivalente no relatório, e **nenhum** arquivo de `tools/ia-loop/` foi editado em rodada nenhuma.
30. A documentação de §8 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados, conferido por `git status --porcelain=v1`; [DECISIONS](../DECISIONS.md) tem **D-061** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§22** e nenhuma seção anterior foi reescrita; o registro anterior de [VALIDATION_GATE](../VALIDATION_GATE.md) não foi apagado, e o fechamento das três bordas foi escrito junto.
31. Números copiados deste documento que divergirem da árvore são declarados como divergência, com o número do AST prevalecendo.
32. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum diretório temporário de controle negativo sobrou.

## Entrega

Relatório do Developer com: a enumeração de cada declaração de classe de cliente reconhecida, com `arquivo:linha` e superfície própria; a enumeração de cada instanciação, com arquivo, linha, identificador usado, ligação resolvida e classificação — transporte, fora do transporte com a chave que a põe fora, ou recusa com o motivo computado; cada requisição ao transporte com arquivo, linha, categoria, método e expressão de caminho, e o conjunto final comparado ao arquivo de valores nas duas direções; a prova computada de que as invariantes não são vácuas; as duas saídas dos controles 1, 2 e 3 e a saída real do controle 4; a prova por diff de que a máquina de ligação do Goal044 foi reusada e não duplicada; a prova por diff de que nenhum arquivo Go de produção, nenhum `src/` dos três apps, nenhum `packages/`, nenhum `go.mod`/`go.sum` e nenhum arquivo de `tools/ia-loop/` foi tocado; o resultado por passo de `validate:core`, `go test ./...`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, runtime do serviço Go, binário de produção, `whatsmeow-lib/`, valor real das variáveis de ambiente e A-04 a A-08, A-11 a A-17, A-19 e A-24 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
