# Goal 050 — A conservação é provada por construção: sítio creditado por prosa não conta, e balde sem origem reprova

**Status: READY.** Preparado em 2026-09-22 pelo Tech Lead Agent após [Goal049 ACCEPTED](../reviews/049-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 050 nasce na [v71 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 049, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `1027e2aabbbb4aaf116c48243da3a7407ecd42ad`

Goal anterior: 049 — A cobertura é ligada por construção: controle que não declara a categoria não conta

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal049 já integrado em `main` (origem `9354d28b6399f553e5f5e6b3a04802369f025987`), com `expectRefusal` de três parâmetros em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:67`–`101`, `ALL_REFUSAL_CATEGORIES` em `:58`–`62`, `NO_REFUSAL_CATEGORY` em `:65`, `DOCUMENTED_SILENT_DISCARDS` em `:5885`–`5906` e `findSilentDiscardLines` em `:5909`–`5920`. **Uma rodada, zero blockers** — a primeira da série 041–049 a fechar sem `CHANGES_REQUIRED`. **D-065** foi aceita e [FINAL_AUDIT §26](../FINAL_AUDIT.md) escrita sem reescrever §4 a §25. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O Goal049 ligou a **categoria de recusa** ao controle que a declara: crédito por convenção virou crédito por construção, e o descarte mudo virou enumeração fail-closed nos dois sentidos. O mecanismo funciona — foi conferido por execução no [review049](../reviews/049-review.md), sítio a sítio, com **32** chamadas de `expectRefusal` e **5** descartes registrados.

O que sobra é que **a conservação do conjunto de egresso, um nível acima, ainda é creditada por prosa**. A asserção que afirma que nenhum sítio de egresso é descartado em silêncio está em `assistant.service.test.ts:2953`–`2975`, escrita no Goal043 e nunca revisitada desde. Ela decide que um sítio "virou requisição" por esta disjunção, conferida nesta baseline em `:2967`–`2970`:

```
`${request.filePath}:${request.line}` === position || request.reason.includes(position)
```

O segundo ramo é **substring de prosa livre**. É exatamente a família de defeito que o Goal049 removeu um nível abaixo — afirmação creditada por texto que ninguém confronta com o dado. E o ramo é **portante**, não decorativo: a requisição resolvida no chamador é empurrada em `http-egress-sites.ts:2062`–`2069` com `filePath: callerFilePath`, e o único laço de volta ao sítio de egresso que a originou está dentro do `reason`, na frase `o fetch está em ${site.filePath}:${site.line}`. Reescrever esse motivo — encurtar, traduzir, trocar dois-pontos por vírgula — apaga a conservação sem quebrar teste nenhum.

Disso saem quatro aberturas, todas conferidas nesta baseline:

- **Crédito por prosa.** O sítio de origem da requisição resolvida no chamador só existe como texto dentro do motivo. Nenhum campo estrutural liga os dois.
- **Sem origem alguma.** A requisição do cliente HTTP interno é empurrada em `:3728`–`3735` sem referência ao sítio de egresso que a origina — nem campo, nem prosa. Os `fetch` de `apps/bff/src/clients/internal-http-client.ts:83` e `:149` não aparecem em requisição alguma; hoje eles se conservam por outro caminho, e qual é ele a execução é que diz.
- **Conservação de mão única.** A asserção prova que nenhum sítio se perde. Ela **não** prova que nenhum balde inventa entrada sem sítio de origem, e **não** prova que um sítio não cai em dois baldes ao mesmo tempo. Partição, aqui, é afirmada e não computada.
- **Universo de candidatos parcial.** O laço corre sobre `discovery.sites` e ignora `discovery.excluded`, `discovery.genericEgressCallers` e `discovery.genericEgressPrimitives`, que o mesmo descobridor produz.

Junto vão as três observações não bloqueantes do [review049](../reviews/049-review.md), que erram todas na mesma direção e ficam baratas quando feitas aqui:

- **Observação 1** — `DOCUMENTED_SILENT_DISCARDS` não exige motivo não vazio, enquanto `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`, de D-064, exige. Do mesmo tipo: dos cinco baldes de saída do descobridor, só `notGoBound` tem motivo não vazio asserido (`:2974`).
- **Observação 2** — o registro de descarte é chaveado por **número de linha**. Este Goal edita `http-egress-sites.ts`, então deslocamento de linha é certo: as **5** entradas virariam obsoletas e as **5** ocorrências virariam não registradas de uma vez. Rechavear deixa de ser preferência e passa a ser pré-condição do resto.
- **Observação 3** — `NO_REFUSAL_CATEGORY` (`:65`) existe sem sítio de uso e sem controle: o ramo de `:81` não é exercido por execução alguma.

O Goal não amplia alcance, não muda critério de conjunto e não corrige achado algum. Ele troca a conservação afirmada por uma **partição computada**: todo sítio lido termina em **exatamente um** balde nomeado, ligado por **campo**, e balde sem sítio de origem reprova.

## Dependências e contexto mínimo

- Goals 001 a 049 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review049](../reviews/049-review.md): as observações **1**, **2** e **3** e a seção "O que este aceite não cobre" são a origem direta deste Goal. Essa seção continua valendo inteira: **A-24 é achado aberto, não corrigido**.
- [DECISIONS](../DECISIONS.md): **D-065** (a cobertura é ligada por construção), **D-064** (a cobertura é computada), **D-062** (a isenção é allowlist) e **D-056** (o conjunto é derivado da declaração) são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §25 e §26](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal049 acrescentou, com o limite declarado da enumeração de descarte. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida sobre esta baseline. A enumeração por execução é a que vale: divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046, na rodada 2 do Goal047 e na rodada 1 do Goal048.

- A asserção de conservação de hoje é `assistant.service.test.ts:2953`–`2975`, dentro do `describe` "nenhum sítio de egresso é descartado em silêncio… (Goal043 / WU-02)". O ramo de prosa está em `:2969`.
- `GoBoundHttpRequest` é declarada em `http-egress-sites.ts:1249`–`1257`: `filePath`, `line`, `method`, `pathExpression`, `category`, `reason`. **Nenhum campo de origem.**
- Os sítios que empurram requisição são **três**: `:2062` (resolvida no chamador, com a origem só na prosa do motivo), `:2181` (fetch cru, em que `filePath`/`line` já são o próprio sítio) e `:3728` (cliente HTTP interno, sem origem alguma).
- Os demais baldes de saída e onde são empurrados: `notGoBound` em `:2131`, `nonGoBoundInstantiations` em `:3624`, `nonTransportMemberCalls` em `:3691`, `assembledUrls` em `:3750`. `GoServiceHttpRequestDiscovery` está em `:1348`–`1361`. Toda entrada já carrega `filePath` e `line`.
- `HttpEgressDiscovery` (`:74`–`109`) produz `sites`, `excluded`, `genericEgressCallers`, `genericEgressCallersByPrimitive` e `genericEgressPrimitives`. A conservação de hoje olha só `sites`.
- `DOCUMENTED_SILENT_DISCARDS` (`assistant.service.test.ts:5885`–`5906`) tem **5** entradas, chaveadas por número de linha: `726`, `1141`, `1143`, `1916` e `2029`. `findSilentDiscardLines` está em `:5909`–`5920` e o teste que as confronta nos dois sentidos, em `:5943`–`5957`.
- `NO_REFUSAL_CATEGORY` está em `assistant.service.test.ts:65` e o ramo que o consome, em `:81`–`83`. Nenhum sítio de chamada o usa nesta baseline.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **204** testes e **7100** linhas; `http-egress-sites.ts` com **3861** linhas; suíte completa de `apps/ai-orchestrator` com **928** passando e **88** pulados, em 1016; `npm run test:gate` com **226 pass, 0 fail**; `validate:core` exit 0 com 17 passos (15 passados, 2 pulados por design: `test:bff` e `test:health-worker`).
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- **A correção de harness continua fora de `main`.** `tools/ia-loop/lib/deterministic-executor.mjs:67` monta `argv` com `unit.pattern` cru, e `cwd` já é `worktree/unit.scope`. Consequência prática e única para este Goal: o `pattern` de um gate `targeted-tests` tem de ser escrito **relativo ao escopo** (`tests/assistant/assistant.service.test.ts`, nunca `apps/ai-orchestrator/tests/...`). Este Goal **não** edita `tools/ia-loop/`; nenhuma dispensa anterior se estende.
- Máquina já existente, para **reuso** e não para reescrita: os auxiliares que os Goals 045 a 049 deixaram em `assistant.service.test.ts` — escrita de árvore temporária com `rmSync` em `finally`, `expectRefusal`, `findSilentDiscardLines` e as variantes de candidato. Nenhum auxiliar paralelo novo quando um já existente serve.

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — pela primeira vez desde o Goal047 o diff **não** é zero: os tipos de saída ganham a origem estrutural e os sítios de `push` passam a preenchê-la. É acréscimo de campo e de seam de leitura. Nenhuma regra de classificação, nenhuma categoria, nenhuma ordem de consulta e nenhuma isenção mudam aqui.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o resto do diff: a partição, os motivos não vazios, o rechaveamento do registro de descarte e os controles negativos. Asserção de igualdade profunda sobre objeto de saída que ganhar campo novo é atualizada; teste algum é removido.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**.
- `apps/evolution-go/` — **intocado**, sem exceção.
- `tools/ia-loop/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. A origem do sítio de egresso é campo, não frase

Toda entrada de saída de `discoverGoServiceHttpRequests` que nasce de um sítio classificado por `discoverHttpEgressSites` passa a carregar a **identidade estrutural** desse sítio — arquivo e linha do sítio de origem, em campo próprio, separado do `filePath`/`line` da própria entrada, que continuam sendo a posição em que a entrada acontece.

Vale para os três sítios de `push` de requisição (`:2062`, `:2181`, `:3728`) e para os baldes de saída que também derivam de sítio classificado. Onde a entrada **é** o próprio sítio, a origem é ela mesma e isso fica escrito, não subentendido. Onde a origem for legitimamente outra coisa — entrada que não nasce de sítio de egresso —, a forma escolhida diz isso explicitamente, e o relatório nomeia o caso.

A frase do motivo continua existindo e continua sendo prosa para gente ler. O que ela deixa de ser é **dado de prova**.

### 2. A conservação vira partição computada, nos dois sentidos

A asserção de `assistant.service.test.ts:2953`–`2975` é substituída por uma partição sobre o universo de candidatos, com o ramo `request.reason.includes(position)` **removido**. Quatro saídas, todas reprovando em vez de passar em silêncio:

- sítio que não aparece em balde algum **reprova**, nomeando `arquivo:linha` e a categoria;
- sítio que aparece em **mais de um** balde reprova, nomeando os baldes — conservação é partição, não cobertura;
- entrada de balde cuja origem declarada **não** corresponde a nenhum sítio lido reprova, nomeando a entrada — balde não inventa;
- categoria de sítio que a partição não sabe encaminhar reprova, em vez de cair num ramo `else` mudo.

O universo de candidatos é **declarado**: `discovery.sites` entra inteiro; `excluded`, `genericEgressCallers` e `genericEgressPrimitives` entram, ou ficam **de fora com motivo escrito** no documento permanente, dizendo por que aquela coleção não é candidato a virar requisição. Ficar de fora em silêncio é o defeito que este Goal existe para remover.

### 3. Motivo vazio não passa em balde nenhum

Todo balde de saída — `requests`, `notGoBound`, `nonGoBoundInstantiations`, `nonTransportMemberCalls`, `assembledUrls` — e o registro `DOCUMENTED_SILENT_DISCARDS` passam a exigir motivo não vazio, no precedente de `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` de D-064. Hoje só `notGoBound` é asserido (`:2974`).

### 4. O registro de descarte deixa de ser chaveado por linha

`DOCUMENTED_SILENT_DISCARDS` passa a ser chaveado por **trecho normalizado** mais âncora estável suficiente para distinguir duas ocorrências idênticas em pontos diferentes do módulo — não por número de linha. O mecanismo continua fail-closed nos **dois** sentidos, como hoje: ocorrência encontrada e não registrada reprova, com `arquivo:linha` e trecho na mensagem; entrada registrada que a varredura não encontra mais reprova como obsoleta. O `arquivo:linha` continua **aparecendo na mensagem de falha** — o que deixa de existir é a linha como **chave**.

Se duas ocorrências normalizarem para a mesma chave e a âncora escolhida não as distinguir, isso **reprova** como ambiguidade de registro, em vez de uma engolir a outra.

O alcance declarado do Goal049 **não** é ampliado: a enumeração continua cobrindo descarte guardado por valor ausente na forma idiomática reconhecida, e continua **não** sendo prova de conservação de candidatos dentro do módulo. Ampliar a **forma** reconhecida — descarte guardado por predicado que não é sobre valor ausente, ou `continue` em bloco com instrução antes — **não** está autorizado aqui.

### 5. `NO_REFUSAL_CATEGORY` ganha controle ou sai

O ramo de `:81` passa a ser exercido por execução: ou um controle negativo o exerce sobre uma recusa que legitimamente não traz `[categoria: ...]`, ou o símbolo e o ramo são removidos e o relatório diz qual das duas foi feita e por quê. Símbolo sem sítio e sem controle não continua.

### 6. Nenhum mecanismo de classificação é alterado

Este Goal **não** muda regra de classificação, não renomeia categoria, não remapeia recusa, não altera ordem de consulta e não afrouxa isenção alguma. Os três vocabulários de recusa, `TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`, `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` mantêm o conteúdo da baseline. `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` continua com as duas entradas e continua conferido nos dois sentidos. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando.

### 7. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas sem recusa. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 8. Controle negativo: as amarras mordem

Cada item aparece no relatório com as **duas** saídas — antes e depois — e nenhuma quebra sobra na árvore ao fim.

1. **Crédito por prosa deixa de contar.** Reescrever o motivo da requisição resolvida no chamador de modo a não conter mais `arquivo:linha` do sítio de origem: antes, a conservação continua verde por acidente da frase; depois, a partição continua verde pelo campo — e, com o campo de origem **esvaziado**, reprova nomeando o sítio. As duas metades vão ao relatório.
2. **Sítio perdido reprova.** Uma árvore sintética com sítio de egresso que nenhum balde recolhe: antes, passa; depois, reprova com `arquivo:linha`.
3. **Sítio em dois baldes reprova.** Entrada duplicada entre baldes, sobre a mesma origem.
4. **Balde sem origem reprova.** Entrada cuja origem declarada não corresponde a sítio lido algum.
5. **Deslocamento de linha não reprova em massa.** Inserir linhas em `http-egress-sites.ts` acima dos descartes registrados: antes, as **5** entradas viram obsoletas e as **5** ocorrências viram não registradas de uma vez; depois, o registro continua verde.
6. **Descarte mudo novo continua reprovando.** Inserir temporariamente um descarte guardado por valor ausente em ponto não registrado: reprova, com `arquivo:linha` na mensagem. A amarra do Goal049 não afrouxou.
7. **Motivo vazio reprova**, em balde e no registro.
8. **A cobertura e a amarra de categoria do Goal049 continuam mordendo.** Remover temporariamente um controle de categoria: a cobertura acusa a categoria órfã.

### 9. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go algum — nem de produção, nem de teste.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não edita arquivo algum de `tools/ia-loop/`. O `pattern` dos gates é escrito relativo ao escopo, que é o que a árvore de `main` exige.
- Não amplia a **forma** de descarte reconhecida pela enumeração do Goal049, não varre todo `continue;` do módulo e **não** prova conservação de candidatos dentro do módulo: a partição deste Goal é entre o descobridor e os baldes de saída, não dentro das funções de varredura.
- Não fecha as observações opcionais herdadas dos reviews 040 e 041 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`): elas erram na direção de resíduo nomeado e ficam para Goal futuro.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não remove nem reescreve teste existente para acomodar o mecanismo novo: acréscimo, migração de assinatura e atualização de igualdade profunda, não deleção de caso.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 10. Prova

A prova é execução, não leitura. Cada amarra é exercida por controle negativo com as duas saídas no relatório, e cada afirmação escrita em documento permanente é conferida contra a execução final. Afirmação de conservação, exaustividade ou classificação que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046, nas rodadas 1 e 2 do Goal047 e na rodada 1 do Goal048.

### 11. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-066** no formato de D-054 a D-065, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§27**, sem reescrever §4 a §26; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento, o universo de candidatos declarado do escopo §2 e o limite que continua valendo do escopo §4. Toda contagem escrita em documento permanente — sítios, baldes, descartes registrados, testes, linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046, na rodada 2 do Goal047 e na rodada 1 do Goal048.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A origem do sítio de egresso é campo estrutural nas entradas de saída que nascem de sítio classificado, e a conservação não lê mais `reason` — provado por diff e pelo controle 1 do escopo §8, com as duas saídas.
2. Sítio que não termina em balde algum reprova, nomeando `arquivo:linha` e a categoria — provado pelo controle 2, com as duas saídas.
3. Sítio que aparece em mais de um balde reprova — provado pelo controle 3.
4. Entrada de balde cuja origem não corresponde a sítio lido reprova — provado pelo controle 4.
5. Categoria de sítio que a partição não sabe encaminhar reprova, em vez de cair em ramo mudo — provado por execução.
6. O universo de candidatos está declarado: `excluded`, `genericEgressCallers` e `genericEgressPrimitives` entram na partição ou estão de fora com motivo escrito no documento permanente — provado por diff e por documento.
7. Motivo vazio reprova nos cinco baldes e no registro de descarte — provado pelo controle 7.
8. O registro de descarte é chaveado por trecho normalizado: deslocamento de linha em `http-egress-sites.ts` não reprova em massa, e chave ambígua reprova — provado pelo controle 5, com as duas saídas.
9. A enumeração de descarte do Goal049 continua mordendo, e o alcance declarado dela não foi ampliado — provado pelo controle 6 e por documento.
10. `NO_REFUSAL_CATEGORY` está exercido por controle ou removido, com o relatório dizendo qual e por quê — provado por execução ou por diff.
11. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos — provado pelo controle 8.
12. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação mudou e nenhuma isenção foi afrouxada — provado por diff.
13. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
14. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior ou igual a **204** e a de `apps/ai-orchestrator` maior ou igual a **928** passando, com os mesmos **88** pulados.
15. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
16. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` está intocado.
