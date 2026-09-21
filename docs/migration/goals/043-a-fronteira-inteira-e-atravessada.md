# Goal 043 — A fronteira inteira é atravessada: rota de transporte que o produto alcança e prosa ligada ao uso real

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal042 ACCEPTED](../reviews/042-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 043 nasce na [v64 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 042, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `f48bf9b5ed38937a763cc1796220778fc60dae3c`

Goal anterior: 042 — O elo de transporte é provado: texto que sai do serviço Go e origem fora do relé

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal042 já integrado em `main` (origem `f5c2b49157bfe56b737c2127c3133b028a32d6cb`), com o pacote novo `apps/evolution-go/pkg/transportguard/` — 16 arquivos, biblioteca padrão apenas, `go.mod` e `go.sum` intocados — enumerando **82** sítios de escrita em campo portador e **19** chamadas de transporte com resíduo **zero**, **325** campos portadores derivados das declarações de proto, **94** rotas registradas com caminho completo computado por AST, **88** escritas fora do relé asseridas elemento a elemento, **27** literais Go não vazios que alcançam campo portador asseridos elemento a elemento, e o [review042](../reviews/042-review.md) aceito na rodada 2 com zero blockers. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

A série tem uma forma constante: cada passada fecha o nível anterior e declara em uma frase o nível que não tocou. O 038 fechou a **classe** dentro de cada extrator. O 039 fechou o **escopo** de leitura. O 040 fechou o **canal**. O 041 fechou o **egresso** dentro das duas árvores TypeScript. O 042 atravessou a **fronteira de serviço** e leu a árvore Go. O limite que o 042 deixou não é de outra natureza — é de **cardinalidade**: a fronteira foi atravessada por **um** valor, e o produto a atravessa por **nove**.

O 042 provou, por valor, que `EVOLUTION_SEND_TEXT_PATH` (`/send/text`) é rota registrada cujo encadeamento termina em saída com origem relé. É uma prova sobre um caminho. Conferido sobre esta baseline, o produto alcança o serviço Go por **nove** expressões de caminho, em dois arquivos de duas árvores diferentes:

- `apps/ai-orchestrator/src/modules/channel/adapters/evolution/EvolutionProvider.ts:53` — `joinUrl(env.EVOLUTION_BASE_URL, env.EVOLUTION_SEND_TEXT_PATH)`, o único que o 042 provou;
- `EvolutionProvider.ts:167-168` — `env.EVOLUTION_BASE_URL` com `env.EVOLUTION_DOWNLOAD_MEDIA_PATH`, default `/message/downloadmedia` (`config/env.ts:86`, `.env.example:23`), que **nenhum** guard atravessou;
- `apps/bff/src/clients/evolution/index.ts` — sete caminhos escritos direto no cliente: `POST /instance/create` (`:85-86`), `POST /instance/connect` (`:106-107`), `GET /instance/qr` (`:122-123`), `POST /instance/pair` (`:144-145`), `GET /instance/status` (`:166-167`), `DELETE /instance/logout` (`:193-194`) e `DELETE /instance/delete/${encodeURIComponent(instanceId)}` (`:204-205`), este último um caminho com **segmento computado em runtime**, forma que a travessia por valor do 042 não tem como tratar.

Esses sete não passam por `fetch(` próprio: passam por `InternalHttpClient` (`apps/bff/src/clients/internal-http-client.ts:76` e `:83`), que é o egresso genérico que o 041 classificou por chamadores. Há **três** instâncias de `new InternalHttpClient(` em `apps/bff/src` — `clients/ai-orchestrator/index.ts:336`, `clients/evolution/index.ts:68` e `clients/scheduling/index.ts:550` — e só uma aponta para o transporte, pelo argumento `env.EVOLUTION_GO_BASE_URL` (`:69`). O destino não é decidível por nome de arquivo nem de classe: no **mesmo arquivo**, `EvolutionClient.webhookUrl()` (`:74-78`) monta `${env.AI_ORCHESTRATOR_BASE_URL}/webhooks/evolution?token=...`, que é URL de **entrada** entregue ao serviço Go, não rota de transporte que o produto alcança. Classificá-la como rota alcançada é exatamente o erro que este Goal precisa não cometer.

**Por que isso importa agora, e não é polimento.** O achado **A-24** do Goal042 — `"Ver Menu"` composto em `pkg/sendMessage/service/send_service.go:1960` e entregue ao número da cliente — foi classificado `PENDENCIA-POS-MVP` em vez de `BLOQUEADOR-MVP` por **um único motivo escrito em [FINAL_AUDIT §19](../FINAL_AUDIT.md)**: a rota que alcança esse literal é `POST /send/list` (`pkg/routes/routes.go:149`), e "nenhum arquivo de `apps/ai-orchestrator/src` ou de `apps/bff/src` a chama — a única rota do transporte que o produto usa hoje é `/send/text`".

As duas metades dessa frase têm status diferentes. A segunda metade é **falsa como escrita**: o produto usa nove rotas, não uma. A primeira metade é provavelmente verdadeira, mas é **prosa verificada por execução nenhuma** — é a mesma classe de afirmação que "o serviço Go é um relé" era antes do 042. A classificação do único achado aberto do lado de lá da fronteira repousa hoje sobre um fato que nenhum gate computa. O dia em que alguém acrescentar uma chamada a `/send/list` é o dia em que A-24 vira defeito observável por uma cliente, e nada no repositório notaria.

Este Goal transforma essa frase em invariante computada, nos dois lados.

O risco próprio continua o das passadas anteriores, deslocado: **descobrir demais**. As duas árvores TypeScript falam com OpenAI, com o `scheduling-service`, com o BFF, com o `ai-orchestrator` e entre si; tratar todo egresso como rota de transporte transforma o conjunto em ruído. E há um risco novo: **provar a igualdade errada**. Um conjunto alcançado que fosse subconjunto próprio do real passaria verde e não provaria nada; um conjunto que incluísse a URL de webhook provaria uma travessia que não existe.

Sete decisões de planejamento já estão tomadas e **não** são do Developer:

- **O encontro dos dois lados é um arquivo de valores, lido fail-closed pelos dois, e verificado pelos dois.** O lado Go não parseia TypeScript e o lado TypeScript não parseia Go — regra de **D-058**, que continua inteira. O arquivo novo `apps/ai-orchestrator/tests/support/product-transport-routes.txt` é o análogo, para um **conjunto**, do que `.env.example` foi para **um valor** no 042. Formato: uma linha por rota alcançada, `MÉTODO<espaço>CAMINHO`, `#` como comentário, linha em branco ignorada, `{}` marcando segmento computado em runtime, ordenação estável. O arquivo **não pode apodrecer em silêncio** porque os dois lados o conferem: o TypeScript reprova se o conjunto que ele computa divergir do arquivo, em qualquer direção; o Go reprova se uma linha do arquivo não corresponder a rota registrada. Arquivo ausente ou vazio reprova nos dois lados, nunca pula o teste.
- **O destino de um egresso é resolvido por forma, seguindo o valor até a chave de ambiente.** Nem nome de arquivo, nem nome de classe, nem nome de cliente, nem literal de URL escrito no teste. Esta é a família de blocker dos Goals 036 a 042 e é blocker aqui também.
- **Caminho com segmento computado vira buraco nomeado, não literal.** `/instance/delete/${x}` é `/instance/delete/{}`, e o casamento com a rota registrada `/instance/delete/:instanceId` é feito segmento a segmento: literal casa literal, buraco casa parâmetro de rota. Comparar strings inteiras reprova o Goal.
- **A relação entre os dois conjuntos é assimétrica e declarada.** Toda rota alcançada pelo produto tem de ser rota registrada — o contrário não: o transporte registra 94 rotas e o produto usa poucas. Rota registrada e não alcançada é **enumerada no relatório**, não é falha.
- **A prosa alcançável é conjunto asserido, não hard-fail por natureza do literal.** O AST não distingue prosa de token de protocolo por forma, e a rodada 1 do 042 provou o custo de fingir que distingue. O conjunto de literais Go não vazios alcançáveis a partir de rota que o produto alcança é asserido **elemento a elemento**, com arquivo, linha, conteúdo, campo e rota — qualquer que seja o tamanho dele hoje. Membro novo derruba com `arquivo:linha` e volta a esta mesa.
- **A invariante não pode ser vácua.** Um teste que afirmasse conjunto vazio sem que o mecanismo alcançasse literal nenhum passaria por engano. É exigido afirmar que **existe** ao menos uma rota registrada a partir da qual o alcance encontra literal — e que `"Ver Menu"` é alcançável a partir de `POST /send/list` —, com esse fato **computado**, nunca digitado no teste.
- **Nada é editado fora da camada de teste.** `apps/*/src/`, o fork Go de produção, `go.mod`, `go.sum` e `tools/ia-loop/` ficam intocados. Violação real encontrada vira **achado a partir de A-25**, com classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) — não vira correção silenciosa.

## Dependências e contexto mínimo

- Goals 001 a 042 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review042](../reviews/042-review.md): a seção "O que este aceite não cobre" e as observações não bloqueantes, em especial a de que **A-24 é achado aberto, não corrigido**, e a de que a cadeia segue o valor que o handler liga do corpo, não alcançabilidade.
- [FINAL_AUDIT §19](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o motivo escrito do rebaixamento de A-24, que é o texto que este Goal converte em invariante.
- [DECISIONS](../DECISIONS.md): **D-050** (o guardrail vale sobre texto próprio do produto), **D-054** (reconhecimento por forma exige resíduo declarado), **D-055** (escopo computado), **D-056** (conjunto derivado da porta), **D-057** (egresso por sítio de rede, genérico fail-closed pelos chamadores) e **D-058** (cada lado lido na sua língua, travessia por valor). Todas continuam valendo inteiras.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e os checks dos Goals 035 a 042.
- [AGENTS.md](../../../AGENTS.md) e `apps/evolution-go/AGENTS.md`: o guardrail de produto e a regra de que o fork é transporte e não recebe lógica de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números abaixo vêm de **busca textual e leitura dirigida** sobre esta baseline. A enumeração por AST é a que vale: se ela divergir, a divergência é **declarada no relatório e na decisão nova**, e o número do AST vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041 e na rodada 1 do Goal042.

- Chaves de caminho de transporte em `apps/ai-orchestrator/src/config/env.ts`: `EVOLUTION_BASE_URL` (`:81`, default `http://evolution-go:8080`), `EVOLUTION_SEND_TEXT_PATH` (`:83`, default `/send/text`) e `EVOLUTION_DOWNLOAD_MEDIA_PATH` (`:86`, default `/message/downloadmedia`); os mesmos valores em `.env.example:19`, `:21` e `:23`.
- Base do transporte no BFF: `EVOLUTION_GO_BASE_URL` (`apps/bff/src/config/env.ts:50`, default `http://localhost:8080`), consumida em `apps/bff/src/clients/evolution/index.ts:68-69`.
- Os nove caminhos alcançados e os pontos onde estão escritos: os dois de `EvolutionProvider.ts` (`:53` e `:167-168`) e os sete de `clients/evolution/index.ts` (`:85-86`, `:106-107`, `:122-123`, `:144-145`, `:166-167`, `:193-194`, `:204-205`).
- Os nove correspondem a rotas registradas no Go, conferidas em `pkg/routes/routes.go`: `POST /send/text` (`:137` + `:141`), `POST /message/downloadmedia` (`:173` + `:180`), `POST /instance/create` (`:106` + `:110`), `DELETE /instance/delete/:instanceId` (`:106` + `:113`), `POST /instance/connect` (`:121` + `:125`), `GET /instance/status` (`:126`), `GET /instance/qr` (`:127`), `POST /instance/pair` (`:128`) e `DELETE /instance/logout` (`:131`). **O resultado esperado é casamento completo**; o que prova o Goal é o mecanismo funcionando com resíduo zero e os controles negativos mordendo, não o número.
- `pkg/routes/routes.go` abre **dois** grupos `eng.Group("/instance")` (`:106` e `:121`), com middlewares diferentes. Prefixo de grupo já é computado por AST pelo `transportguard`; nada aqui depende de qual grupo é qual.
- `POST /send/list` está registrado em `pkg/routes/routes.go:149` e alcança `"Ver Menu"` em `pkg/sendMessage/service/send_service.go:1960` — o achado **A-24**. Nenhum arquivo de `apps/bff/src` nem de `apps/ai-orchestrator/src` menciona `/send/list`.
- API já existente em `apps/evolution-go/pkg/transportguard/`, para reuso e não para reescrita: `Enumerate`, `Enumeration.Routes`, `RegisteredRoute` (com `Method`, `GroupPrefix`, `RegisteredPath`, `FullPath`), `Enumeration.RouteWithPath`, `Enumeration.ChainFrom`, `RouteChain.RelaySites`, `ReadEnvFileValue`, `EnvExampleRelPathFromModule`, `DeriveCarrierFields`, `GoProseLiteralsReachingTransport`, `OffRelaySources`, `Enumeration.Report`.
- API já existente em `apps/ai-orchestrator/tests/support/http-egress-sites.ts`, idem: `discoverHttpEgressSites`, `classifyHttpEgressSitesInSource`, `listTypeScriptSources`, `readEnvSchemaDefault`, `readEnvFileValue`, e as categorias de egresso genérico resolvido por chamadores.
- Contagens da baseline, para comparar depois: `go test ./...` em `apps/evolution-go` com **152** testes; `go test ./pkg/transportguard/` com **19**; `npm run test:gate` com **226 pass, 0 fail**; `assistant.service.test.ts` com **70** testes; `audit:static` com **34** checks; `validate:integration` com **35** passos; `apps/ai-orchestrator/tests/support/` com **quatro** arquivos.
- `validate:core` executa `build:evolution-go`, `vet:evolution-go` e `test:evolution-go`, então o guard entra no gate global sem script novo. Go 1.25.0 em `go.mod`.

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — o descobridor do lado TypeScript ganha resolução de destino de transporte e enumeração de expressão de caminho. Extensão do módulo existente, não módulo paralelo.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — arquivo novo, o encontro por valor dos dois lados.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — as afirmações permanentes do lado TypeScript, junto das que já existem.
- `apps/evolution-go/pkg/transportguard/` — arquivos novos do lado Go, no pacote de teste que já existe. Nenhum arquivo Go de produção é alterado.

## Escopo obrigatório

### 1. O conjunto de rotas de transporte que o produto alcança é computado

Do lado TypeScript, o descobridor lê `apps/ai-orchestrator/src` e `apps/bff/src` inteiros e enumera **toda** requisição cujo destino é o serviço Go, devolvendo para cada uma o **método** e a **expressão de caminho**. O destino é resolvido por forma, seguindo o valor da base até a chave de ambiente que o define — inclusive através do egresso genérico, cujo destino é decidido no construtor do chamador, e não no sítio de `fetch(`.

Cada requisição enumerada cai em exatamente uma categoria nomeada com o motivo escrito junto. No mínimo: destino é o transporte com caminho literal, destino é o transporte com caminho vindo de chave de ambiente, destino é o transporte com caminho contendo segmento computado, destino é outro serviço, e URL montada para ser **entregue** ao transporte em vez de chamada por ele — a categoria em que `webhookUrl()` cai. Forma não reconhecida vira erro com `arquivo:linha`, nunca passagem silenciosa. Resíduo zero sobre as árvores reais é exigência, e a enumeração completa vai no relatório.

Caminho que venha de chave de ambiente tem o valor computado da declaração do schema em `config/env.ts` **pela forma da declaração**, como o 042 já faz para `EVOLUTION_SEND_TEXT_PATH`; valor digitado dentro do teste é blocker. Caminho com interpolação vira `{}` no segmento interpolado.

### 2. O conjunto atravessa a fronteira por valor, e os dois lados o conferem

O arquivo `apps/ai-orchestrator/tests/support/product-transport-routes.txt` carrega o conjunto, no formato fixado acima.

- **No TypeScript:** o conjunto computado e o conteúdo do arquivo são comparados como conjuntos, nas **duas** direções. Rota computada e ausente do arquivo reprova; linha do arquivo que o descobridor não computa reprova. Arquivo ausente, vazio ou com linha malformada reprova com a linha impressa — fail-closed, nunca pula.
- **No Go:** o guard lê o mesmo arquivo por caminho relativo ao módulo, no padrão de `EnvExampleRelPathFromModule`, e afirma que **cada** entrada corresponde a exatamente uma rota registrada, casando método e caminho segmento a segmento, com buraco `{}` casando parâmetro de rota. Entrada sem rota correspondente, ou com mais de uma, reprova com a entrada impressa. Arquivo ausente ou vazio reprova.

Rota registrada que o produto não alcança **não** é falha: é enumerada no relatório, com a contagem das duas classes.

O que isso prova, e o que não prova, vai escrito: prova que todo caminho pelo qual o produto fala com o transporte é caminho que o transporte registra **nesta árvore de código**; não prova runtime, não prova qual binário roda em produção, e não prova que as variáveis de ambiente do ambiente real valem os defaults.

### 3. A prosa do fork é ligada ao que o produto realmente usa

Para cada rota do conjunto alcançado, o guard Go computa o conjunto de escritas em campo portador alcançáveis a partir dela, reusando o encadeamento que o 042 construiu, e cruza com os literais Go não vazios que o 042 já asseria elemento a elemento.

Saem daí três afirmações permanentes:

- **O conjunto de literais Go não vazios alcançáveis a partir de rota que o produto alcança é asserido elemento a elemento**, com arquivo, linha, conteúdo, campo e a rota pela qual é alcançado — qualquer que seja o tamanho dele hoje. Membro novo derruba o teste com `arquivo:linha`.
- **A invariante não é vácua:** existe ao menos uma rota registrada a partir da qual o alcance encontra literal, e isso é afirmado sobre o resultado computado. Um mecanismo que não alcançasse nada derruba o teste.
- **A premissa de A-24 passa a ser computada:** o literal `"Ver Menu"` de `pkg/sendMessage/service/send_service.go:1960` é alcançável a partir de rota registrada, e **nenhuma** das rotas pelas quais ele é alcançável está no conjunto que o produto alcança. O membro é localizado pelo conjunto que o próprio guard deriva, não digitado no teste. No dia em que o produto passar a alcançar `POST /send/list`, esta afirmação fica vermelha — que é exatamente o efeito pretendido, e o que devolve A-24 a esta mesa.

### 4. Controle negativo: cada invariante morde

Cinco controles obrigatórios. Cada um exercita **o artefato que o critério nomeia**, sobre árvore sintética montada em diretório temporário — nunca quebrando a árvore real e nunca deixando resíduo. Os controles 1 a 3 trazem **as duas saídas**: a mesma entrada contra a baseline aceita (onde o mecanismo não existe, o que é declarado assim) e contra a árvore final, vermelha.

1. Chamada nova ao transporte por caminho que o arquivo de valores não lista: reprova no TypeScript, com método e caminho impressos. E linha no arquivo que o descobridor não computa: reprova também, na direção oposta.
2. Entrada do arquivo de valores que não corresponde a rota registrada — inclusive por método diferente e por segmento a mais — reprova no Go, com a entrada impressa; arquivo ausente reprova em vez de pular.
3. Literal Go novo alcançável a partir de rota que o produto alcança: reprova por conjunto asserido, com arquivo, linha e rota.
4. O mesmo sítio, o mesmo cliente e a mesma rota movidos para arquivo, pasta e classe de outro nome: classificação **idêntica** dos dois lados. Nenhuma regra decide por nome.
5. Destino resolvido por forma morde: cliente genérico construído com a base de **outro** serviço não entra no conjunto alcançado, e URL montada para ser entregue ao transporte não entra; inverter qualquer um dos dois reprova.

### 5. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não alterar nenhum arquivo Go de produção de `apps/evolution-go/`**, nem `go.mod`, nem `go.sum`. O guard é o pacote de teste que já existe, com biblioteca padrão. Nenhuma dependência nova, em nenhuma das duas línguas.
- **Não mudar código de produção de `apps/frontend/src/`, `apps/bff/src/` nem `apps/ai-orchestrator/src/`.** As árvores de produção são **lidas**, nunca editadas. Violação real encontrada vira **achado a partir de A-25**, com impacto de produto em uma frase.
- **Não corrigir A-24** e não editar `pkg/sendMessage/service/send_service.go`. A-24 continua `PENDENCIA-POS-MVP`; o que muda é que o motivo do rebaixamento passa a ser computado.
- **Não mudar uma letra de copy** e não alterar `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` nem `VOCABULARIO_DE_ESPERA`.
- **Não mudar comportamento da IA:** nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`.
- **Não mudar o contrato público** nem o que as rotas devolvem, em nenhum dos dois serviços: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go, nenhuma migration e nenhum `schema.prisma`.
- **Não enfraquecer `audit:static`:** nenhum check removido, nenhuma regra afrouxada, nenhuma allowlist nova. `scripts/final-production-audit.mjs` fica intocado; o escopo deste Goal é camada de teste.
- **Não enfraquecer o que os Goals 040 a 042 provaram:** os 9 sítios de egresso HTTP, as 2 cadeias de trânsito, os 82 sítios, as 19 chamadas, os 88 fora do relé e os 27 literais continuam asseridos, com resíduo zero. Afrouxar qualquer um deles para fazer o conjunto novo fechar é blocker.
- **Não mudar o comportamento dos gates renderizados:** `retries: 1` inalterado nos dois `playwright.*.config.ts`, `flaky` continua não reprovando, `scripts/lib/playwright-report.mjs`, `scripts/validate-ui.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` intocados. Nenhuma tela, componente, texto de interface ou CSS.
- **Não tocar `apps/scheduling-service/` nem `apps/health-worker/`.**
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real, nenhuma conexão whatsmeow aberta, nenhuma requisição de rede acrescentada a suíte nenhuma. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não afirmar comportamento de runtime do serviço Go.** O que se prova é o que as árvores de código dizem. Documento que disser mais do que isso é blocker.
- **Não corrigir nem reclassificar achado aberto:** A-04 a A-08, A-11 a A-17, A-19 e A-24 não são tocados; A-01 a A-03, A-09, A-10, A-18 e A-20 a A-23 continuam fechados e não são reabertos.
- **Não remover, renomear nem pular teste existente**, em Go ou em TypeScript, e não encolher a lista de 35 passos de `validate:integration`.
- **Não mexer em `tools/ia-loop/`**, em nenhum arquivo e em nenhuma rodada. Harness que impeça a execução é **declarado no relatório**, com execução manual equivalente — foi assim que o 042 saiu do laço que consumiu três rodadas do 041.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha**, e nenhum `//nolint` em Go.
- **Não reabrir, reverter nem reexecutar aceite anterior.**

**Permitido, e opcional:** as três observações restantes do [review040](../reviews/040-review.md) — tipo de parâmetro importado de outro arquivo, `text: string | undefined` e `interface X extends Base`. Se alguma for endereçada, é mudança que **preserva** a direção do erro (resíduo nomeado, nunca classificação silenciosa), e o relatório diz o que mudou.

### 6. Prova

- `validate:core` exit 0 sobre a árvore final, com `build:evolution-go`, `vet:evolution-go` e `test:evolution-go` verdes e `audit:static` mantendo os 34 checks.
- `go test ./...` em `apps/evolution-go` com a contagem antes e depois (baseline: 152) — nenhuma suíte encolheu, nenhum teste pulado.
- `npm run test:gate` exit 0, com a contagem antes e depois (baseline: 226 pass, 0 fail), e a contagem de `assistant.service.test.ts` antes e depois (baseline: 70).
- Os cinco controles negativos executados, cada um com a saída real, e revertidos; os controles 1 a 3 com **as duas saídas**.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente, isso é **declarado como tal**, nunca apresentado como verde. Na baseline ele recusa com `exit 2` e `BFF_TEST_DATABASE_URL is not set`.
- A enumeração completa: cada requisição ao transporte com arquivo, linha, categoria, método e expressão de caminho; o conteúdo do arquivo de valores; o casamento de cada entrada com a rota registrada, com posição; as rotas registradas e não alcançadas, contadas; e o conjunto de literais alcançáveis a partir de rota alcançada, elemento a elemento.

### 7. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. É critério de aceite, não recomendação: a documentação descreve o conjunto **real** de arquivos alterados, conferido por `git status --porcelain=v1` **depois** da última edição de código, com os números que a árvore final mostra.

- [CURRENT_STATE](../CURRENT_STATE.md): delta043 — que o conjunto de rotas de transporte alcançadas pelo produto passou a ser computado, qual é o formato do arquivo de valores, como os dois lados o conferem, e qual é o conjunto de literais alcançáveis a partir de rota alcançada.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a regra nova decide **agora** e o que continua não decidindo — em especial que nada aqui prova runtime do serviço Go, que `whatsmeow-lib/` continua fora do alcance, que rota registrada e não alcançada não é falha, e que texto emitido pelo modelo continua fora do guardrail por **D-050**.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§20**), no padrão de §8 e §10 a §19 e **sem reescrever** §4 a §19, registrando o fechamento, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-25** quando houver. A entrada de **A-24** em §19 **não é reescrita**: a seção nova registra que o motivo do rebaixamento passou de prosa a invariante computada, e que a condição que o transformaria em defeito observável passa a ser vigiada.
- [DECISIONS](../DECISIONS.md): **D-059**, no formato das anteriores, cobrindo por que a travessia da fronteira passa de um valor a um conjunto, por que o encontro é arquivo de valores conferido pelos dois lados em vez de geração por um lado só, por que a relação entre alcançadas e registradas é assimétrica, por que a prosa alcançável é conjunto asserido em vez de hard-fail por natureza do literal, e o que continua fora — runtime, binário de produção, `whatsmeow-lib/` e o valor real das variáveis de ambiente.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal043 no status resultante e o SHA aceito. Dezenove fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Toda requisição das duas árvores TypeScript cujo destino é o serviço Go é enumerada a cada execução, sem lista escrita à mão, e cai em categoria nomeada com motivo escrito junto; a enumeração completa está no relatório.
2. O resíduo sobre as árvores reais é **zero**, e forma não reconhecida derruba o teste com `arquivo:linha`.
3. O destino de cada egresso é resolvido por forma, seguindo o valor da base até a chave de ambiente, inclusive através do egresso genérico cujo destino é decidido no construtor do chamador; nenhuma regra decide por nome de arquivo, pasta, classe, cliente ou URL literal — provado pelo controle 4, com classificação idêntica após mover o sítio.
4. URL montada para ser entregue ao transporte não é classificada como rota alcançada; cliente genérico apontado para outro serviço não entra no conjunto — provado pelo controle 5.
5. Caminho vindo de chave de ambiente tem o valor computado da declaração em `config/env.ts` pela forma da declaração, e nenhum caminho está digitado dentro do teste.
6. Caminho com interpolação é representado por buraco `{}` no segmento computado, e o casamento com a rota registrada é feito segmento a segmento, com buraco casando parâmetro de rota — nunca por comparação de string inteira.
7. O arquivo `apps/ai-orchestrator/tests/support/product-transport-routes.txt` existe, no formato fixado, e o conjunto computado pelo TypeScript é igual ao dele nas **duas** direções; divergência em qualquer direção reprova — provado pelo controle 1.
8. O guard Go lê o mesmo arquivo por caminho relativo ao módulo e afirma que cada entrada corresponde a exatamente uma rota registrada, em método e caminho; entrada sem correspondência reprova com a entrada impressa, e arquivo ausente ou vazio reprova em vez de pular — provado pelo controle 2.
9. Rota registrada e não alcançada pelo produto não é falha, e as duas classes estão contadas e enumeradas no relatório.
10. O conjunto de literais Go não vazios alcançáveis a partir de rota que o produto alcança é asserido elemento a elemento, com arquivo, linha, conteúdo, campo e rota; membro novo derruba o teste — provado pelo controle 3, com as duas saídas.
11. A invariante não é vácua: o teste afirma, sobre o resultado computado, que existe ao menos uma rota registrada a partir da qual o alcance encontra literal.
12. O literal `"Ver Menu"` de `send_service.go:1960` é localizado pelo conjunto derivado pelo próprio guard, não digitado no teste, e nenhuma das rotas pelas quais ele é alcançável está no conjunto alcançado pelo produto.
13. Nenhum arquivo Go de produção de `apps/evolution-go/` mudou, provado por diff; `go.mod` e `go.sum` não mudaram e nenhuma dependência nova entrou, em nenhuma das duas línguas.
14. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum de `apps/scheduling-service/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; **nenhum arquivo de `tools/ia-loop/`**.
15. `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` são idênticos aos da baseline, provado por diff, e nenhuma copy mudou.
16. O que os Goals 040 a 042 provaram continua provado, com os mesmos conjuntos e resíduo zero: 9 sítios de egresso HTTP, 2 cadeias de trânsito, 82 sítios de escrita em campo portador, 19 chamadas de transporte, 88 escritas fora do relé com exatamente uma de configuração de instância, 27 literais não vazios e 94 rotas registradas. Divergência é declarada, com o número do AST prevalecendo.
17. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go.
18. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
19. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
20. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso, nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz continua com as cinco larguras.
21. Os cinco controles negativos obrigatórios existem, cada um exercita o artefato que o critério nomeia, a saída real de cada um está no relatório, os controles 1 a 3 trazem as duas saídas, e nenhuma quebra sobrou na árvore.
22. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos, a suíte Go não encolheu abaixo dos 152 testes e `assistant.service.test.ts` não encolheu abaixo dos 70.
23. Nenhum achado de A-04 a A-08, A-11 a A-17, A-19 ou A-24 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-25**.
24. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, que a verificação de resposta roda em produção, que o comportamento de runtime do serviço Go foi provado, nem que A-24 foi corrigido.
25. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
26. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
27. Falha de gate por caminho do harness é declarada como defeito conhecido do IA Loop, com execução manual equivalente no relatório, e **nenhum** arquivo de `tools/ia-loop/` foi editado em rodada nenhuma.
28. A documentação de §7 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados, conferido por `git status --porcelain=v1`; [DECISIONS](../DECISIONS.md) tem **D-059** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§20** e nenhuma seção anterior foi reescrita.
29. Números copiados deste documento que divergirem da árvore são declarados como divergência, com o número do AST prevalecendo.
30. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum diretório temporário de controle negativo sobrou.

## Entrega

Relatório do Developer com: a enumeração de cada requisição ao transporte, com arquivo, linha, categoria, método e expressão de caminho, e a saída real sobre as duas árvores TypeScript; como o destino de cada egresso foi resolvido até a chave de ambiente, inclusive através do egresso genérico, com os casos excluídos nomeados; o conteúdo do arquivo de valores e a prova de que os dois lados o conferem; o casamento de cada entrada com a rota registrada, com posição, e a contagem de rotas registradas e não alcançadas; o conjunto de literais alcançáveis a partir de rota alcançada, elemento a elemento; a prova computada de que `"Ver Menu"` não é alcançável pelo conjunto do produto e de que a invariante não é vácua; as duas saídas dos controles 1 a 3 e a saída real dos controles 4 e 5; a prova por diff de que nenhum arquivo Go de produção, nenhum `src/` dos três apps, nenhum `go.mod`/`go.sum` e nenhum arquivo de `tools/ia-loop/` foi tocado; o resultado por passo de `validate:core`, `go test ./...`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, runtime do serviço Go, binário de produção, `whatsmeow-lib/`, valor real das variáveis de ambiente e A-04 a A-08, A-11 a A-17, A-19 e A-24 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
