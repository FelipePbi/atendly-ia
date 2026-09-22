# Goal 046 — A isenção de `export` é allowlist: forma não reconhecida recusa em vez de isentar

**Status: ACCEPTED** na rodada 2, conforme o [review046](../reviews/046-review.md) — uma rodada `CHANGES_REQUIRED`, com 2 blockers, antes do aceite com zero blockers. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal045 ACCEPTED](../reviews/045-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 046 nasce na [v67 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 045, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `42ba1e975591ce03cf36f553f8f7faba085f1fd0`

Goal anterior: 045 — A identidade do cliente é resolvida: classe homônima em outro arquivo, instanciação sob alias e destino indireto

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal045 já integrado em `main` (origem `bd7582488a5684cccbd4405963fc20719097dc19`), com a superfície do cliente indexada por `classDeclarationKey`, a instanciação reconhecida por **ligação resolvida** em cada arquivo candidato e as duas saídas de destino separadas e nomeadas. Três rodadas: `CHANGES_REQUIRED` com 3 blockers, com 1, e o aceite na terceira, com zero. O conjunto de **10** rotas de transporte e o de **27** literais Go continuam idênticos aos que o Goal043 asseriu: `product-transport-routes.txt` está intocado desde então. **D-061** foi aceita e [FINAL_AUDIT §22](../FINAL_AUDIT.md) escrita sem reescrever §4 a §21. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O Goal045 fechou as três bordas pelas quais a **identidade** da classe de cliente era decidida por nome. O que reprovou duas das três rodadas dele não foi o mecanismo novo — foi a **isenção** do mecanismo: `refuseClassReferencesOutsideInstantiation` pulava toda ocorrência do nome ligado que caísse dentro do texto de uma construção `export`, e por isso `class_binding_reference_forwarded_as_value` nunca disparava na forma idiomática de repassar a classe adiante. A rodada 2 consertou aquele caso recortando o **lado de ligação** de três famílias de construção.

Este Goal fecha o que sobrou do mesmo defeito, e sobrou por **omissão, não por recorte**: `exportConstructBindingRange` termina em `return whole`. Toda forma de construção `export` que ela não classifica isenta a construção **inteira**. Isso é fail-open por default, na função cujo propósito é decidir o que pode ser isentado, e é exatamente a classe de falha que o [review045](../reviews/045-review.md) registrou como observação não bloqueante 3.

A consequência é a mesma que sustenta a série inteira: uma rota sai do conjunto de 10 **sem acrescentar sítio de `fetch` algum**, portanto invisível também ao resíduo de egresso cru do Goal041; e é sobre a completude desse conjunto que a classificação de **A-24** como `PENDENCIA-POS-MVP` repousa hoje.

O Goal não amplia alcance, não muda critério de conjunto e não corrige achado algum. Ele **inverte um default**: a isenção passa a ser allowlist de formas reconhecidas, e forma não reconhecida recusa em voz alta, com `arquivo:linha` e categoria nomeada.

## Dependências e contexto mínimo

- Goals 001 a 045 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review045](../reviews/045-review.md): a seção "Observações não bloqueantes", itens **1**, **2** e **3** — que são a **origem deste Goal** —, as três rodadas e o que elas ensinam sobre isenção que apaga recusa, e a seção "O que este aceite não cobre", em especial que **A-24 é achado aberto, não corrigido**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal045 acrescentou, onde o limite da isenção recortada por forma textual está escrito. O registro é por **acréscimo**; não se apaga texto anterior.
- [DECISIONS](../DECISIONS.md): **D-054** (reconhecimento por forma exige resíduo declarado) é o precedente direto desta inversão; **D-055**, **D-056**, **D-057**, **D-058**, **D-059**, **D-060** e **D-061** continuam valendo inteiras. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §21 e §22](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o motivo computado do rebaixamento de A-24.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida sobre esta baseline. A enumeração por AST é a que vale: divergência é **declarada no relatório e na decisão nova**, e o número do AST vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044 e nas rodadas 1 a 3 do Goal045.

- `exportConstructBindingRange` está em `apps/ai-orchestrator/tests/support/http-egress-sites.ts:2565`. Ela reconhece hoje **três** famílias: `type`/`interface` (isenta inteira), `class`/`default class` (isenta até o `extends`), `const`/`let`/`var` (isenta até o `=`). O `return whole` final é `:2584` — o catch-all.
- `findTopLevelAssignmentIndex` está em `:2593`. Ela conta `(`, `[`, `{` e **`<`** como abertura e `)`, `]`, `}` e **`>`** como fechamento, com guard de profundidade não negativa. Devolve `undefined` quando não acha `=` de atribuição; hoje `undefined` cai em `whole`.
- `exportConstructText` está em `:1628`. Ela só para no `{` quando o cabeçalho já contém `function`, `class` ou `=>`; nas demais formas ela **engole o bloco inteiro** com `findMatchingDelimiterEnd` e segue até `;` ou quebra de linha. É por isso que `export default { ... }` e `export namespace N { ... }` chegam ao catch-all com o corpo dentro do texto da construção.
- `findExportConstructs` está em `:1654`; `refuseClassReferencesOutsideInstantiation` está em `:2635`, e a linha que aplica a isenção é `const exportRanges = findExportConstructs(source).map(exportConstructBindingRange);` em `:2644`, consumida em `if (importRanges.some(inRange) || exportRanges.some(inRange)) continue;`.
- `ClassBindingRefusalCategory` está declarada em `:2362` como união de **cinco** membros de string literal, sem array em runtime: `class_binding_homonymous_declarations`, `class_binding_export_form_not_resolved`, `class_binding_commonjs_export`, `class_binding_cross_file_form_not_resolved`, `class_binding_reference_forwarded_as_value`. `classBindingRefusal` está em `:2375` e `categorizedBindingRefusal` em `:2385`.
- Formas `export` que as duas árvores realmente têm, conferidas por busca nesta passada em `apps/**/*.ts`: `export function`, `export async function`, `export class`, `export interface`, `export type`, `export const` e `export { ... }`. **Nenhuma** ocorrência de `export namespace`, `export module`, `export =` ou `export default` seguido de `{`, `[` ou `(`. A completude de hoje é acidente da árvore, não propriedade do mecanismo — a mesma situação que originou os Goals 044 e 045.
- Máquina já existente, para **reuso** e não para reescrita: `computeQuoteMask` (`:311`), `findMatchingDelimiterEnd` (`:181`), `findImportDeclarations` (`:1521`), `resolveModuleExportBindings` (`:1691`), `resolveModuleSpecifierToFilePath` (`:1795`), `findCrossFileCallerBindings` (`:1839`), `resolveClassInstantiationBindings` (`:2417`), `findInstantiationsOfClassDeclaration` (`:2678`) e `discoverGoBoundInternalClientRequests` (`:2977`). `TYPE_POSITION_PRECEDING_CHARS` (`:2528`) e `TYPE_POSITION_PRECEDING_WORDS` (`:2531`) são a isenção de posição de tipo, que **não** é objeto deste Goal e não pode ser afrouxada.
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte (`AI_ORCHESTRATOR_BASE_URL` e `SCHEDULING_SERVICE_BASE_URL`), **0** chamadas de membro fora da superfície.
- O arquivo de valores `apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem **10** rotas: `DELETE /instance/delete/{}`, `DELETE /instance/logout`, `GET /health`, `GET /instance/qr`, `GET /instance/status`, `POST /instance/connect`, `POST /instance/create`, `POST /instance/pair`, `POST /message/downloadmedia` e `POST /send/text`.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **130** testes e **5287** linhas; suíte completa de `apps/ai-orchestrator` com **854** passando e **88** pulados; `npm run test:gate` com **226 pass, 0 fail, 0 skipped**; `go test ./...` em `apps/evolution-go` com **174** testes de topo e `go test ./pkg/transportguard/` com **33**; `audit:static` com **34** checks; `validate:integration` com **35** passos; `http-egress-sites.ts` com **3277** linhas; `apps/ai-orchestrator/tests/support/` com **cinco** arquivos.
- `validate:core` executa `build:evolution-go`, `vet:evolution-go` e `test:evolution-go`, então o lado Go entra no gate global sem script novo. Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`.

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — as correções, por **extensão do módulo existente e reuso da máquina já aceita**, nunca por módulo paralelo nem por reimplementação do que já existe.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — as afirmações permanentes, junto das que já existem.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — alterado **somente** se o conjunto computado mudar; se mudar, a mudança é justificada pela árvore e conferida pelos dois lados.
- `apps/evolution-go/pkg/transportguard/` — intocado, salvo se o conjunto de rotas mudar; nesse caso, apenas recontagem em arquivo de teste. Nenhum arquivo Go de produção é alterado em hipótese alguma.

## Escopo obrigatório

### 1. A isenção de `export` vira allowlist, e o catch-all morre

`exportConstructBindingRange` deixa de ter um caminho de saída que isenta por não reconhecer. Ela passa a classificar a construção num conjunto **fechado e nomeado** de formas reconhecidas e a devolver, para cada uma, o range que é **lado de ligação** — o que já faz hoje para `type`/`interface`, `class` e `const`/`let`/`var`. Para a construção cuja forma ela **não** reconhece, ela devolve um resultado distinto e explícito de "forma não reconhecida", nunca um range.

`refuseClassReferencesOutsideInstantiation` passa a tratar esse resultado: ocorrência do nome ligado que caia dentro de uma construção `export` de forma **não reconhecida** **recusa**, com `arquivo:linha`, o trecho de contexto que a recusa já imprime hoje e uma categoria nomeada nova. Ocorrência que caia em construção de forma reconhecida continua isenta exatamente como hoje.

A recusa é **escopada à ocorrência**, não à construção: um arquivo candidato pode ter uma construção `export` de forma exótica que não mencione a classe, e isso não derruba nada. Só derruba quando a classe ligada aparece **dentro** de uma forma que a leitura não sabe recortar — que é precisamente o caso em que não dá para afirmar que ali ela não é repassada como valor.

As formas que **precisam** entrar na allowlist, porque existem nas duas árvores e não podem passar a recusar: `export function`, `export async function`, `export default function`, `export class`, `export default class`, `export abstract class`, `export interface`, `export type`, `export const`, `export let`, `export var`, `export default <identificador>`, `export { ... }` e `export * from ...`, com e sem `declare`. A lista final é a que a árvore exigir; o critério é a árvore, não este documento.

### 2. Atribuição não localizada é forma não resolvida, não isenção

No ramo `const`/`let`/`var`, `findTopLevelAssignmentIndex` devolver `undefined` significa hoje "isenta tudo". Passa a significar duas coisas distintas, e a leitura tem de separá-las:

- a construção **não atribui valor algum** (`export const enum X { ... }`, declaração sem inicializador) — isenta, como hoje;
- a construção **atribui** — há `=` fora de aspas que não é `==`, `===`, `!=`, `<=`, `>=` nem `=>` — e a busca de profundidade não achou o `=` de topo. Aqui a forma **não está resolvida**, e isentar a construção inteira é a mesma falha do item 1. Recusa, com `arquivo:linha` e categoria nomeada.

Isso fecha a observação 1 do [review045](../reviews/045-review.md) pelo lado que importa: a heurística textual de `<`/`>` continua sendo heurística, mas quando ela erra o erro passa a ser **recusa em voz alta**, nunca isenção silenciosa. A heurística em si não precisa ser substituída por parser; o que não pode sobreviver é a direção do erro.

### 3. As categorias de recusa passam a ter existência em runtime

`ClassBindingRefusalCategory` é hoje só um tipo. Três Goals seguidos — 038, 044 e 045 — tiveram blocker por documento permanente afirmando contagem ou descrição de categoria que a árvore desmente, e em todos a lista era escrita à mão nos dois lados. A união passa a ser derivada de um array `as const` exportado pelo módulo, e a suíte passa a afirmar, sobre esse array, o conjunto de categorias — inclusive as novas deste Goal.

Isto não é reescrita de mecanismo: é tirar da prosa um fato que o código já tem. Nenhum identificador de categoria existente muda de nome, e nenhuma recusa existente muda de categoria.

### 4. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 5. Controle negativo: cada invariante morde

Cada controle é uma quebra temporária em árvore sintética, fora da árvore real, com as **duas** saídas no relatório — antes e depois —, e nenhuma quebra sobra na árvore ao fim.

1. **Repasse em construção `export` de forma não reconhecida.** Arquivo candidato com `export default { Client: <Classe> };` mais `new` alcançando o transporte por esse caminho. Antes da mudança: a rota é perdida sem recusa alguma. Depois: recusa na categoria nova, com `arquivo:linha`.
2. **Bloco `export namespace`.** Arquivo candidato com `export namespace N { export const C = <Classe>; }`. Antes: a construção inteira é isenta e o repasse passa mudo. Depois: recusa.
3. **`export = <Classe>` em arquivo candidato.** Antes: isenta inteira. Depois: recusa. Distinto do `export =` **no arquivo da declaração**, que já recusa por `resolveModuleExportBindings` sob `class_binding_export_form_not_resolved` e **continua** recusando por lá.
4. **Atribuição não localizada.** Construção `export const` que atribui e cuja profundidade textual não fecha. Antes: isenta inteira. Depois: recusa pela categoria do item 2 do escopo.
5. **As formas reais continuam isentas.** Árvore sintética com `export function`, `export async function`, `export class ... extends <Classe>`, `export interface X extends Base`, `export type`, `export const <nome> = <Classe>` e `export { <Classe> };` — as recusas e isenções de cada uma são as **mesmas** de antes da mudança, e a classificação da árvore real é idêntica. Esta é a prova de que a allowlist não estreitou o que já funcionava.

### 6. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go de produção algum.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais por decisão de escrita; só por computação, e declarando.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não afrouxa a isenção de **posição de tipo** (`TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`): anotação, genérico, união, interseção, `as`/`satisfies`/`typeof`/`keyof`/`implements` continuam fora da recusa, porque não capturam o construtor como valor.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não edita arquivo algum de `tools/ia-loop/`.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 7. Prova

A prova é execução, não leitura. Cada invariante nova é exercida por teste permanente em `assistant.service.test.ts`, e cada controle negativo aparece no relatório com as duas saídas. Afirmação de varredura, ligação ou exaustividade que a leitura não exerceu é blocker, como foi na rodada 1 do Goal045.

### 8. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-062** no formato de D-054 a D-061, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§23**, sem reescrever §4 a §22; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento e do limite que sobrar. A descrição das categorias de recusa é conferida **contra o código que a implementa**, não contra o relatório — foi o que reprovou as rodadas 1, 2 e 3 do Goal045. A observação 2 do [review045](../reviews/045-review.md) é fechada aqui: `class_binding_export_form_not_resolved` também dispara quando a declaração está em arquivo fora das duas árvores, e `class_binding_cross_file_form_not_resolved` também quando o arquivo ligado tem texto fora do conjunto lido; as duas descrições passam a nomear esses casos.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. `exportConstructBindingRange` não tem caminho de saída que isente por não reconhecer: toda forma reconhecida é nomeada e devolve range de lado de ligação; forma não reconhecida devolve resultado explícito de não reconhecimento — provado por diff e pelos controles 1, 2 e 3.
2. Ocorrência do nome ligado dentro de construção `export` de forma não reconhecida **recusa**, com `arquivo:linha`, contexto e categoria nomeada; ocorrência dentro de forma reconhecida continua isenta — provado pelos controles 1, 2, 3 e 5, cada um com as duas saídas.
3. A recusa é escopada à **ocorrência**, não à construção: construção de forma exótica que não menciona a classe não derruba nada — provado por controle com as duas saídas.
4. `const`/`let`/`var` que atribui e cujo `=` de topo não é localizado **recusa**; construção que não atribui valor algum continua isenta — provado pelo controle 4, com as duas saídas.
5. As formas `export` reais das duas árvores continuam com classificação **idêntica** à da baseline, e a árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície — provado pelo controle 5 e por execução sobre a árvore real.
6. As categorias de recusa existem em runtime como array derivado, a união de tipo é derivada dele, a suíte afirma o conjunto sobre esse array, e nenhum identificador de categoria existente foi renomeado nem teve recusa remapeada — provado por diff.
7. Nenhum motivo escrito por este caminho afirma varredura, ligação ou exaustividade que a leitura não exerceu.
8. A máquina já aceita foi **reusada**, não reimplementada: nenhuma cópia paralela de `computeQuoteMask`, `findExportConstructs`, `exportConstructText`, `findImportDeclarations`, `findCrossFileCallerBindings`, `resolveModuleExportBindings` ou `resolveModuleSpecifierToFilePath` existe no diff.
9. A isenção de posição de tipo não foi afrouxada: `TYPE_POSITION_PRECEDING_CHARS` e `TYPE_POSITION_PRECEDING_WORDS` mantêm o conteúdo da baseline, e `export type` / `export interface X extends Base` continuam sem produzir recusa e sem perder rota.
10. Nenhuma regra decide por nome de arquivo, pasta, classe, cliente, método ou URL literal — provado por controle que move e renomeia e obtém classificação idêntica.
11. O conjunto computado de rotas do serviço Go é igual ao de `product-transport-routes.txt` nas **duas** direções; se o conjunto mudou, o arquivo foi atualizado no mesmo diff, a mudança está justificada pela árvore, e o lado Go continua casando cada entrada com exatamente uma rota registrada.
12. O resíduo de egresso sobre as árvores reais continua **zero**, e forma não reconhecida continua derrubando com `arquivo:linha`.
13. As invariantes não são vácuas: o teste afirma, sobre o resultado computado, que ao menos uma construção `export` de forma reconhecida foi isentada e que a resolução por ligação reconheceu ao menos uma instanciação, além das guardas de não-vacuidade já existentes.
14. O que os Goals 040 a 045 provaram continua provado, com os mesmos conjuntos: 9 sítios de egresso HTTP com resíduo zero, 2 cadeias de trânsito, 82 sítios de escrita em campo portador, 19 chamadas de transporte, 88 escritas fora do relé, 27 literais não vazios, 94 rotas registradas, 325 campos portadores derivados e 10 rotas alcançadas. Divergência é declarada, com o número do AST prevalecendo.
15. O conjunto de literais Go não vazios alcançáveis a partir de rota que o produto alcança continua asserido e vazio, com a guarda de não-vacuidade do Goal043 intacta; `"Ver Menu"` continua provado inalcançável pelo conjunto do produto, por computação e não por texto digitado.
16. Nenhum arquivo Go de produção de `apps/evolution-go/` mudou, provado por diff; `go.mod` e `go.sum` não mudaram e nenhuma dependência nova entrou, em nenhuma das duas línguas.
17. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum de `apps/scheduling-service/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; nenhum de `packages/`; **nenhum arquivo de `tools/ia-loop/`**.
18. `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` são idênticos aos da baseline, provado por diff, e nenhuma copy mudou.
19. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go.
20. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
21. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
22. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso, nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz continua com as cinco larguras.
23. Os cinco controles negativos obrigatórios existem, cada um exercita o artefato que o critério nomeia, a saída real de cada um está no relatório com as duas saídas, e nenhuma quebra sobrou na árvore.
24. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos, a suíte Go não encolheu abaixo dos 174 testes, `assistant.service.test.ts` não encolheu abaixo dos 130 e a suíte completa de `apps/ai-orchestrator` não encolheu abaixo dos 854 passando.
25. Nenhum achado de A-04 a A-08, A-11 a A-17, A-19 ou A-24 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-25**.
26. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, que a verificação de resposta roda em produção, que o comportamento de runtime do serviço Go foi provado, nem que A-24 foi corrigido.
27. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
28. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
29. Falha de gate por caminho do harness é declarada como defeito conhecido do IA Loop, com execução manual equivalente no relatório, e **nenhum** arquivo de `tools/ia-loop/` foi editado em rodada nenhuma.
30. A documentação de §8 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados, conferido por `git status --porcelain=v1`; [DECISIONS](../DECISIONS.md) tem **D-062** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§23** e nenhuma seção anterior foi reescrita; o registro anterior de [VALIDATION_GATE](../VALIDATION_GATE.md) não foi apagado; a lista de categorias em documento permanente bate, categoria a categoria, com o array em runtime, e a observação 2 do review045 está fechada nas duas descrições que ela nomeia.
31. Números copiados deste documento que divergirem da árvore são declarados como divergência, com o número do AST prevalecendo.
32. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum diretório temporário de controle negativo sobrou.

## Entrega

Relatório do Developer com: a enumeração de cada forma de construção `export` reconhecida pela allowlist, com o range de lado de ligação que cada uma devolve e a justificativa de por que aquele lado é ligação e não valor; a enumeração de cada forma que passa a recusar, com a categoria nomeada; as duas saídas de cada um dos cinco controles negativos; a prova computada de que a árvore real produz os mesmos 1 superfície, 4 ligações, 205 arquivos varridos, 10 rotas, 2 instanciações fora do transporte e 0 chamadas de membro fora da superfície; a prova computada de que as invariantes não são vácuas; a prova por diff de que a máquina já aceita foi reusada e não duplicada, de que nenhum identificador de categoria mudou de nome e de que a isenção de posição de tipo não foi afrouxada; a prova por diff de que nenhum arquivo Go de produção, nenhum `src/` dos três apps, nenhum `packages/`, nenhum `go.mod`/`go.sum` e nenhum arquivo de `tools/ia-loop/` foi tocado; o resultado por passo de `validate:core`, `go test ./...`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, runtime do serviço Go, binário de produção, `whatsmeow-lib/`, valor real das variáveis de ambiente e A-04 a A-08, A-11 a A-17, A-19 e A-24 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
