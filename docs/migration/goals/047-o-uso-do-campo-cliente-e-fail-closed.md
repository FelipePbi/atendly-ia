# Goal 047 — O uso do campo cliente é fail-closed: ocorrência do campo fora de `this.<campo>.<membro>(` recusa

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal046 ACCEPTED](../reviews/046-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 047 nasce na [v68 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 046, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `3074a6d96c190b3e221b4f5aa96c46158bc1dd1b`

Goal anterior: 046 — A isenção de `export` é allowlist: forma não reconhecida recusa em vez de isentar

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal046 já integrado em `main` (origem `3caf7e8d6e49a13e16b9614a672ddf1d1b5c408e`), com `exportConstructBindingRange` devolvendo `{ recognized, start, end }` sobre allowlist fechada, `findTopLevelAssignmentIndex` separando `{ found, resolved }`, `CLASS_BINDING_REFUSAL_CATEGORIES` como array `as const` de **seis** categorias com o tipo derivado dele, e a recusa por faixa `export` não reconhecida consultada **antes** da isenção de posição de tipo. Duas rodadas: `CHANGES_REQUIRED` com 2 blockers e o aceite na segunda, com zero. O conjunto de **10** rotas de transporte e o de **27** literais Go continuam idênticos aos que o Goal043 asseriu: `product-transport-routes.txt` está intocado desde então. **D-062** foi aceita e [FINAL_AUDIT §23](../FINAL_AUDIT.md) escrita sem reescrever §4 a §22. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Os Goals 044, 045 e 046 fecharam, um a um, os pontos em que a cadeia que vai da **instanciação provada** até a **rota** decidia por nome ou isentava por omissão: a superfície do cliente passou a ser derivada da declaração da classe pelo alcance a `fetch`, a identidade da classe passou a ser propriedade da declaração e da ligação resolvida, e a isenção de `export` virou allowlist com recusa nomeada.

Sobrou **um** trecho lido por formato de texto, e ele é o último da cadeia: depois de provar que aquele `new` é daquela classe e que a instância vai para um campo, a leitura reconhece a chamada de transporte por uma expressão regular sobre `this.<campo>.<membro>(`. Toda ocorrência do campo em qualquer outro formato não casa, não entra em `requests`, não entra em `nonTransportMemberCalls` e **não derruba nada**.

A consequência é exatamente a que sustenta a série inteira: uma rota sai do conjunto de 10 **sem acrescentar sítio de `fetch` algum**, portanto invisível também ao resíduo de egresso cru do Goal041; e é sobre a completude desse conjunto que a classificação de **A-24** como `PENDENCIA-POS-MVP` repousa hoje. A completude de hoje é de novo **acidente da árvore**, não propriedade do mecanismo — a mesma situação que originou os Goals 044, 045 e 046.

O Goal não amplia alcance, não muda critério de conjunto e não corrige achado algum. Ele fecha o último trecho fail-open da cadeia: **toda** ocorrência do campo em que a instância foi guardada passa a ser classificada — chamada de transporte, chamada de membro fora da superfície, ou recusa em voz alta com `arquivo:linha` e categoria nomeada.

## Dependências e contexto mínimo

- Goals 001 a 046 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review046](../reviews/046-review.md): a descoberta da rodada 2 — **o mecanismo estava certo e o que reprovou foi a ordem em que ele é consultado** —, e a seção "Observações não bloqueantes", em especial a observação **1** (o critério 3 do Goal046 é verdadeiro por leitura da estrutura, sem controle permanente que o exercite isoladamente), que entra no escopo **§4** deste Goal, e a observação **2** (a asserção de 205 depende do client do Prisma estar gerado). A seção "O que este aceite não cobre" continua valendo inteira: **A-24 é achado aberto, não corrigido**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal046 acrescentou, onde o limite vigente da leitura está escrito. O registro é por **acréscimo**; não se apaga texto anterior.
- [DECISIONS](../DECISIONS.md): **D-054** (reconhecimento por forma exige resíduo declarado) e **D-062** (a isenção é allowlist; forma não reconhecida recusa) são os precedentes diretos. **D-055** a **D-061** continuam valendo inteiras. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §22 e §23](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o motivo computado do rebaixamento de A-24.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida sobre esta baseline. A enumeração por AST é a que vale: divergência é **declarada no relatório e na decisão nova**, e o número do AST vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045 e na rodada 1 do Goal046.

- O reconhecimento da chamada de transporte é uma `RegExp` construída como `this\.${fieldName}\.([A-Za-z_$][\w$]*)\(` em `apps/ai-orchestrator/tests/support/http-egress-sites.ts:3179`, dentro de `discoverGoBoundInternalClientRequests`. O laço só percorre os corpos que `findTopLevelMethodBodies` (chamada em `:3168`, declarada em `:2808`) devolve para a classe **dona da instanciação**.
- O que o formato **não** casa, e portanto some hoje sem recusa: `this.<campo>?.<membro>(` com encadeamento opcional; `this.<campo>["<membro>"](` e demais acessos computados; alias em variável local (`const c = this.<campo>; c.<membro>(...)`); desestruturação (`const { <membro> } = this.<campo>;`); o campo repassado como valor (`entregar(this.<campo>)`); o membro repassado como referência sem invocação (`this.<campo>.<membro>` sem `(`); `(this.<campo> as T).<membro>(`; e qualquer ocorrência do campo **fora** de corpo de método de topo — inicializador de campo, bloco estático, função aninhada cujo corpo `findTopLevelMethodBodies` não devolva.
- `findAssignedFieldName` está em `:2292`. Ela olha uma janela de **200** caracteres para trás e casa `([A-Za-z_$][\w$]*)\s*=\s*new\s*$`: devolve o identificador imediatamente antes do `=`, **sem provar** que aquele identificador é campo da classe dona. Uma instanciação atribuída a variável local dentro de um método produz um "campo" que nunca aparece como `this.<nome>`, e o laço de chamadas então não encontra nada — zero requisição, sem recusa.
- Assimetria da mesma função: em `:3093`, no ramo dos sítios `constructor_base_url_*`, `const source = sourcesByPath.get(site.filePath); if (source === undefined) continue;` pula a superfície inteira em silêncio; em `:3130`, o mesmo `undefined` no ramo de instanciação **derruba** a leitura com `arquivo:linha`. As duas saídas precisam ser a mesma.
- `NonTransportMemberCall` está declarada em `:1313` com `filePath`, `line`, `className`, `fieldName`, `memberName` e `reason`. O ramo que a alimenta e o que derruba por membro inexistente na declaração estão em `:3187` a `:3201`.
- `CLASS_BINDING_REFUSAL_CATEGORIES` está em `:2362` como array `as const` de **seis** membros, com `ClassBindingRefusalCategory` (`:2378`) derivado dele. `classBindingRefusal` está em `:2381` e `categorizedBindingRefusal` em `:2391`. O array é o padrão a seguir para qualquer vocabulário de recusa novo: existe em runtime, o tipo é derivado dele, e a suíte afirma o conjunto **sobre o array**.
- Árvore real, conferida nesta passada: as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` estão **todas** na forma direta `this.http.<membro>(`, e as três instanciações são `private readonly http = new InternalHttpClient(` em `apps/bff/src/clients/ai-orchestrator/index.ts:336`, `apps/bff/src/clients/evolution/index.ts:68` e `apps/bff/src/clients/scheduling/index.ts:550`. Nenhuma forma exótica existe hoje nas duas árvores.
- Máquina já existente, para **reuso** e não para reescrita: `computeQuoteMask` (`:311`), `blankComments` (`:138`), `findMatchingDelimiterEnd` (`:181`), `splitTopLevelItems` (`:215`), `findObjectPropertyExpression` (`:560`), `findEnclosingClassSpan` (`:2277`), `findTopLevelMethodBodies` (`:2808`), `methodNameAtBrace` (`:2905`), `resolveClassInstantiationBindings` (`:2423`), `exportConstructBindingRange` (`:2585`), `refuseClassReferencesOutsideInstantiation` (`:2698`) e `findInstantiationsOfClassDeclaration` (`:2765`). `TYPE_POSITION_PRECEDING_CHARS` e `TYPE_POSITION_PRECEDING_WORDS` são a isenção de posição de tipo, que **não** é objeto deste Goal e não pode ser afrouxada, nem em conteúdo nem na ordem fail-closed que o Goal046 estabeleceu.
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos (118 em `apps/ai-orchestrator/src` mais 87 em `apps/bff/src`), **10** rotas, **2** instanciações fora do transporte (`AI_ORCHESTRATOR_BASE_URL` e `SCHEDULING_SERVICE_BASE_URL`), **0** chamadas de membro fora da superfície.
- O arquivo de valores `apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem **10** rotas: `DELETE /instance/delete/{}`, `DELETE /instance/logout`, `GET /health`, `GET /instance/qr`, `GET /instance/status`, `POST /instance/connect`, `POST /instance/create`, `POST /instance/pair`, `POST /message/downloadmedia` e `POST /send/text`.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **153** testes e **5563** linhas; `http-egress-sites.ts` com **3364** linhas; `apps/ai-orchestrator/tests/support/` com **cinco** arquivos; `npm run test:gate` com **226 pass, 0 fail, 0 skipped**; `go test ./...` em `apps/evolution-go` com **174** testes de topo e `go test ./pkg/transportguard/` com **33**; `audit:static` com **34** checks; `validate:integration` com **35** passos.
- `validate:core` executa `build:evolution-go`, `vet:evolution-go` e `test:evolution-go`, então o lado Go entra no gate global sem script novo. Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`.

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — as correções, por **extensão do módulo existente e reuso da máquina já aceita**, nunca por módulo paralelo nem por reimplementação do que já existe.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — as afirmações permanentes, junto das que já existem.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — alterado **somente** se o conjunto computado mudar; se mudar, a mudança é justificada pela árvore e conferida pelos dois lados.
- `apps/evolution-go/pkg/transportguard/` — intocado, salvo se o conjunto de rotas mudar; nesse caso, apenas recontagem em arquivo de teste. Nenhum arquivo Go de produção é alterado em hipótese alguma.

## Escopo obrigatório

### 1. Toda ocorrência do campo é classificada, e forma não reconhecida recusa

A leitura deixa de procurar **apenas** o formato `this.<campo>.<membro>(` e passa a **enumerar toda ocorrência** do campo dentro do corpo da classe dona da instanciação, com a máscara de aspas já existente e sobre o texto já sem comentários. Cada ocorrência cai em exatamente uma das saídas:

- **chamada de transporte** — membro da superfície derivada, invocado; entra em `requests` como hoje, com o mesmo motivo escrito;
- **chamada de membro fora da superfície** — membro que a declaração da classe tem e que não alcança `fetch` (ou alcança e é privado); entra em `nonTransportMemberCalls` como hoje, com o motivo já computado;
- **recusa** — qualquer forma que a leitura não converta numa das duas anteriores, com `arquivo:linha`, o trecho de contexto e uma **categoria nomeada nova**.

A allowlist é **fechada e nomeada**: não existe caminho de saída que ignore ocorrência por não reconhecê-la. As formas que hoje somem e que passam a recusar são, no mínimo, as nomeadas nos fatos acima — encadeamento opcional, acesso computado, alias local, desestruturação, campo ou membro repassados como valor, e ocorrência fora de corpo de método de topo. A lista final é a que a árvore exigir; o critério é a árvore, não este documento.

A recusa é **escopada à ocorrência**: ocorrência do mesmo identificador que não seja o campo daquela instância — outro objeto com propriedade de mesmo nome, ocorrência dentro de string ou comentário — não recusa e não conta. Quem decide é a leitura de `this.<campo>`, não a busca pelo nome solto.

### 2. O alvo da atribuição é provado campo da classe dona

`findAssignedFieldName` deixa de devolver o identificador que estiver antes do `=` dentro de uma janela de texto. Ela passa a devolver um resultado que distingue:

- **campo provado** — a atribuição é `this.<nome> = new ...` ou a declaração de propriedade de classe `[modificadores] <nome> = new ...` no corpo da classe dona, e não dentro de corpo de método aninhado. É o caso das três instanciações reais;
- **forma não resolvida** — qualquer outra: variável local, desestruturação, atribuição a propriedade de outro objeto, elemento de array, retorno direto de `new` sem guarda em campo. Aqui a leitura **recusa**, com `arquivo:linha` e categoria nomeada, em vez de produzir um nome de campo que nunca será encontrado.

Hoje esses casos produzem zero requisição e zero recusa, que é a mesma direção de erro que o Goal046 inverteu do lado da ligação.

### 3. As duas saídas de `undefined` em `sourcesByPath` são a mesma

O `continue` silencioso de `:3093` vira a mesma recusa explícita que `:3130` já faz: o sítio cujo texto não está entre os arquivos lidos é nomeado com `arquivo:linha`, nunca pulado. Se houver motivo estrutural para que um sítio legitimamente não tenha texto lido, esse motivo é **computado e declarado** no resíduo nomeado; não pode virar silêncio.

### 4. O critério 3 do Goal046 ganha controle próprio

A observação 1 do [review046](../reviews/046-review.md) registra que a recusa escopada à ocorrência — construção `export` de forma exótica que **não** menciona a classe não derruba nada — é verdadeira por leitura da estrutura, sem controle permanente que a exercite. Este Goal fecha essa lacuna de prova: árvore sintética com construção `export` de forma não reconhecida que não menciona a classe ligada, mais a instanciação normal alcançando o transporte, e a asserção de que a classificação é **idêntica** à da mesma árvore sem aquela construção. Nenhum mecanismo do Goal046 é alterado; o que muda é que a afirmação passa a ser exercida.

### 5. As categorias de recusa deste caminho existem em runtime

O vocabulário de recusa que este Goal acrescenta existe em runtime no mesmo padrão do Goal046: array `as const` exportado, tipo derivado dele, e a suíte afirmando o conjunto **sobre o array**, por igualdade, nunca reconstruído à mão em prosa ou em teste. Nenhum identificador de categoria existente muda de nome, e nenhuma recusa existente muda de categoria.

### 6. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas como chamada de transporte ou de membro fora da superfície, **nenhuma** recusando. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 7. Controle negativo: cada invariante morde

Cada controle é uma quebra temporária em árvore sintética, fora da árvore real, com as **duas** saídas no relatório — antes e depois —, e nenhuma quebra sobra na árvore ao fim.

1. **Encadeamento opcional.** Classe com `private readonly http = new <Cliente>(env GO)` e um método que chama `this.http?.request({ ... })` alcançando o transporte. Antes: a rota some sem recusa alguma. Depois: recusa na categoria nova, com `arquivo:linha`.
2. **Acesso computado.** `this.http["request"]({ ... })`. Antes: some. Depois: recusa.
3. **Alias em variável local.** `const client = this.http; client.request({ ... });`. Antes: some. Depois: recusa, porque a ocorrência `this.http` não está na forma de chamada.
4. **Instância guardada fora de campo de classe.** `const http = new <Cliente>(env GO); http.request({ ... });` dentro de um método. Antes: `findAssignedFieldName` devolve `http`, nada casa `this.http.`, zero requisição e zero recusa. Depois: recusa pela categoria do escopo **§2**.
5. **Ocorrência fora de corpo de método de topo.** Campo cujo inicializador ou bloco estático menciona o campo cliente. Antes: invisível. Depois: recusa.
6. **As formas reais continuam classificadas igual.** Árvore sintética com as três formas reais (`this.http.request({...})` de superfície, chamada de membro fora da superfície, método que só monta URL sem chamar o cliente) — as saídas são as **mesmas** de antes da mudança, e a classificação da árvore real é idêntica. Esta é a prova de que a allowlist não estreitou o que já funcionava.
7. **O escopo do Goal046 continua mordendo** — o controle do escopo **§4**, com as duas saídas.

### 8. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go de produção algum.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais por decisão de escrita; só por computação, e declarando.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo. Em particular, **não** reescreve `apps/bff/src/clients/**` para caber na leitura: quem se adapta é a leitura.
- Não afrouxa a isenção de **posição de tipo** nem a ordem fail-closed que o Goal046 estabeleceu em `refuseClassReferencesOutsideInstantiation`.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não edita arquivo algum de `tools/ia-loop/`.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 9. Prova

A prova é execução, não leitura. Cada invariante nova é exercida por teste permanente em `assistant.service.test.ts`, e cada controle negativo aparece no relatório com as duas saídas. Afirmação de varredura, classificação ou exaustividade que a leitura não exerceu é blocker, como foi na rodada 1 do Goal045 e na rodada 1 do Goal046.

### 10. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-063** no formato de D-054 a D-062, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§24**, sem reescrever §4 a §23; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento e do limite que sobrar. A descrição das categorias de recusa é conferida **contra o código que a implementa**, não contra o relatório — foi o que reprovou rodadas nos Goals 044, 045 e 046. Todo número escrito em documento permanente é conferido contra a árvore antes de ser escrito: foi o blocker 2 da rodada 1 do Goal046.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Não existe caminho em que uma ocorrência do campo cliente seja ignorada por não ser reconhecida: toda ocorrência é chamada de transporte, chamada de membro fora da superfície, ou recusa com `arquivo:linha`, contexto e categoria nomeada — provado por diff e pelos controles 1, 2, 3, 5 e 6.
2. Encadeamento opcional, acesso computado, alias local, desestruturação, campo ou membro repassados como valor e ocorrência fora de corpo de método de topo **recusam** — provado por controle, cada um com as duas saídas.
3. A recusa é escopada à ocorrência do campo daquela instância: ocorrência homônima em outro objeto, em string ou em comentário não recusa e não conta — provado por controle com as duas saídas.
4. `findAssignedFieldName` só devolve campo quando o alvo é provadamente campo da classe dona; qualquer outra forma de guarda recusa com `arquivo:linha` e categoria nomeada — provado pelo controle 4, com as duas saídas.
5. O `undefined` de `sourcesByPath` no ramo `constructor_base_url_*` deixou de ser `continue` silencioso e produz a mesma saída nomeada do ramo de instanciação — provado por diff e por controle.
6. O controle permanente do escopo **§4** existe e exercita a recusa escopada à ocorrência do Goal046, fechando a observação 1 do [review046](../reviews/046-review.md) — provado por execução, com as duas saídas.
7. As categorias de recusa deste caminho existem em runtime como array derivado, o tipo é derivado dele, a suíte afirma o conjunto sobre o array, e nenhum identificador de categoria existente foi renomeado nem teve recusa remapeada — provado por diff.
8. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` são classificadas sem nenhuma recusa — provado por execução sobre a árvore real.
9. Nenhum motivo escrito por este caminho afirma varredura, classificação ou exaustividade que a leitura não exerceu.
10. A máquina já aceita foi **reusada**, não reimplementada: nenhuma cópia paralela de `computeQuoteMask`, `blankComments`, `findMatchingDelimiterEnd`, `splitTopLevelItems`, `findObjectPropertyExpression`, `findEnclosingClassSpan`, `findTopLevelMethodBodies` ou `methodNameAtBrace` existe no diff.
11. A isenção de posição de tipo não foi afrouxada e a ordem fail-closed do Goal046 foi preservada: `TYPE_POSITION_PRECEDING_CHARS` e `TYPE_POSITION_PRECEDING_WORDS` mantêm o conteúdo da baseline, e a recusa por faixa `export` não reconhecida continua sendo consultada **antes** da isenção de posição de tipo — provado por diff e por execução do controle herdado.
12. Nenhuma regra decide por nome de arquivo, pasta, classe, campo, cliente, método ou URL literal — provado por controle que move e renomeia campo e arquivo e obtém classificação idêntica.
13. O conjunto computado de rotas do serviço Go é igual ao de `product-transport-routes.txt` nas **duas** direções; se o conjunto mudou, o arquivo foi atualizado no mesmo diff, a mudança está justificada pela árvore, e o lado Go continua casando cada entrada com exatamente uma rota registrada.
14. O resíduo de egresso sobre as árvores reais continua **zero**, e forma não reconhecida continua derrubando com `arquivo:linha`.
15. As invariantes não são vácuas: o teste afirma, sobre o resultado computado, que ao menos uma ocorrência foi classificada como chamada de transporte e que a enumeração de ocorrências do campo é não vazia, além das guardas de não-vacuidade já existentes.
16. O que os Goals 040 a 046 provaram continua provado, com os mesmos conjuntos: 9 sítios de egresso HTTP com resíduo zero, 2 cadeias de trânsito, 82 sítios de escrita em campo portador, 19 chamadas de transporte, 88 escritas fora do relé, 27 literais não vazios, 94 rotas registradas, 325 campos portadores derivados e 10 rotas alcançadas. Divergência é declarada, com o número do AST prevalecendo.
17. O conjunto de literais Go não vazios alcançáveis a partir de rota que o produto alcança continua asserido e vazio, com a guarda de não-vacuidade do Goal043 intacta; `"Ver Menu"` continua provado inalcançável pelo conjunto do produto, por computação e não por texto digitado.
18. Nenhum arquivo Go de produção de `apps/evolution-go/` mudou, provado por diff; `go.mod` e `go.sum` não mudaram e nenhuma dependência nova entrou, em nenhuma das duas línguas.
19. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum de `apps/scheduling-service/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; nenhum de `packages/`; **nenhum arquivo de `tools/ia-loop/`**.
20. `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` são idênticos aos da baseline, provado por diff, e nenhuma copy mudou.
21. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go.
22. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
23. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
24. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso, nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz continua com as cinco larguras.
25. Os controles negativos obrigatórios do escopo **§7** existem, cada um exercita o artefato que o critério nomeia, a saída real de cada um está no relatório com as duas saídas, e nenhuma quebra sobrou na árvore.
26. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos, a suíte Go não encolheu abaixo dos 174 testes, `assistant.service.test.ts` não encolheu abaixo dos **153** e a suíte completa de `apps/ai-orchestrator` não encolheu.
27. Nenhum achado de A-04 a A-08, A-11 a A-17, A-19 ou A-24 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-25**.
28. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, que a verificação de resposta roda em produção, que o comportamento de runtime do serviço Go foi provado, nem que A-24 foi corrigido.
29. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
30. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
31. Falha de gate por caminho do harness é declarada como defeito conhecido do IA Loop, com execução manual equivalente no relatório, e **nenhum** arquivo de `tools/ia-loop/` foi editado em rodada nenhuma.
32. A documentação de §10 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados, conferido por `git status --porcelain=v1`; [DECISIONS](../DECISIONS.md) tem **D-063** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§24** e nenhuma seção anterior foi reescrita; o registro anterior de [VALIDATION_GATE](../VALIDATION_GATE.md) não foi apagado; a lista de categorias em documento permanente bate, categoria a categoria, com o array em runtime; e nenhum número escrito em documento permanente diverge da árvore.
33. Números copiados deste documento que divergirem da árvore são declarados como divergência, com o número do AST prevalecendo.
34. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum diretório temporário de controle negativo sobrou.

## Entrega

Relatório do Developer com: a enumeração de cada forma de ocorrência do campo cliente reconhecida, com a saída que cada uma produz e a justificativa de por que aquela saída é a correta; a enumeração de cada forma que passa a recusar, com a categoria nomeada; a enumeração das formas de guarda da instância aceitas como campo provado e das que recusam; as duas saídas de cada controle negativo do escopo **§7**; a prova computada de que a árvore real produz os mesmos 1 superfície, 4 ligações, 205 arquivos varridos, 10 rotas, 2 instanciações fora do transporte, 0 chamadas de membro fora da superfície e 41 ocorrências classificadas sem recusa; a prova computada de que as invariantes não são vácuas; a prova por diff de que a máquina já aceita foi reusada e não duplicada, de que nenhum identificador de categoria mudou de nome e de que nem a isenção de posição de tipo nem a ordem fail-closed do Goal046 foram afrouxadas; a prova por diff de que nenhum arquivo Go de produção, nenhum `src/` dos três apps, nenhum `packages/`, nenhum `go.mod`/`go.sum` e nenhum arquivo de `tools/ia-loop/` foi tocado; o resultado por passo de `validate:core`, `go test ./...`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, runtime do serviço Go, binário de produção, `whatsmeow-lib/`, valor real das variáveis de ambiente e A-04 a A-08, A-11 a A-17, A-19 e A-24 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
