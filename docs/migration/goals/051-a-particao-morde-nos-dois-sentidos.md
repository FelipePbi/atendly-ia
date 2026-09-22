# Goal 051 — A partição morde nos dois sentidos: entrada em balde que a categoria não roteia reprova, e balde fora da declaração não existe em silêncio

**Status: ACCEPTED** no [review051](../reviews/051-review.md) (rodada 5 de 5, 2026-09-22; rodadas 1 a 4 fecharam `CHANGES_REQUIRED`, com 2, 2, 2 e 1 blockers). Preparado em 2026-09-22 pelo Tech Lead Agent após [Goal050 ACCEPTED](../reviews/050-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 051 nasce na [v72 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 050, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `07bd259b1f441ca55e8f72e472a81ae7fd6ee1e3`

Goal anterior: 050 — A conservação é provada por construção: sítio creditado por prosa não conta, e balde sem origem reprova

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal050 já integrado em `main` (origem `6c4938478120ad94f3249384499f8583fcad74f7`), com `HttpEgressSiteOrigin` em `apps/ai-orchestrator/tests/support/http-egress-sites.ts:1250`, o campo `originSite` em cinco interfaces de saída e nos oito sítios de `push`, `EGRESS_PARTITION_BUCKETS` em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:2999`, `egressPartitionBucketsForCategory` em `:3036`, `EGRESS_CANDIDATE_UNIVERSE` em `:3061`, o teste permanente da partição em `:3099`, o teste da exceção em `:3137` e `findEgressPartitionFindings` em `:7447`. **Três rodadas:** `CHANGES_REQUIRED` com 3 blockers, `CHANGES_REQUIRED` com 2, e o aceite na terceira, com zero. **D-066** foi aceita e [FINAL_AUDIT §27](../FINAL_AUDIT.md) escrita sem reescrever §4 a §26. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O Goal050 trocou conservação afirmada por **partição computada por campo**: o ramo `request.reason.includes(position)` morreu, `originSite` entrou em cinco interfaces de saída, e o universo de **entrada** ganhou declaração fail-closed contra `Object.keys(egress)`.

O mecanismo funciona — foi conferido por execução e por sondagem independente no [review050](../reviews/050-review.md). O que sobra é que **a partição morde de uma mão só, e o universo de saída não tem dono**.

### Abertura 1 — a partição não confronta a entrada com a categoria da própria origem

`findEgressPartitionFindings` (`:7447`) percorre os **sítios**: para cada um, pergunta a `egressPartitionBucketsForCategory` quais baldes aquela categoria roteia, e confere presença **só nesses**. Do lado da entrada, o que a função cobra é apenas que a origem declarada seja um sítio de fato lido (`entriesWithoutReadOrigin`, `:7478`–`:7493`) e que o motivo não seja vazio.

Consequência, conferida nesta baseline por sondagem própria com `tsx` sobre `discoverHttpEgressSites`/`discoverGoServiceHttpRequests`: os cinco baldes têm **19** entradas, e **10** delas estão num balde que a categoria da sua origem **não** roteia. Nenhuma asserção as olha. Uma entrada de origem `env_var_OPENAI_BASE_URL` que aparecesse em `assembledUrls` passaria verde hoje — origem é sítio lido, motivo não é vazio, e o laço do lado do sítio nunca visita `assembledUrls` para essa categoria.

É a **observação 1** do [review050](../reviews/050-review.md), que o aceite declarou como aperto de mordida a fazer em Goal seguinte com controle negativo próprio, agora com número.

### Abertura 2 — o universo de saída não é fail-closed

O Goal050 declarou o universo de **entrada**: `EGRESS_CANDIDATE_UNIVERSE` (`:3061`) nomeia as cinco coleções de `HttpEgressDiscovery` e é conferido contra `Object.keys(egress)` (`:3195`). Coleção nova no descobridor reprova até ser declarada.

O lado de **saída** não tem nada disso. `GoServiceHttpRequestDiscovery` (`http-egress-sites.ts:1359`) devolve **7** chaves em runtime — `requests`, `assembledUrls`, `notGoBound`, `internalClientSurfaces`, `nonTransportMemberCalls`, `nonGoBoundInstantiations`, `callerResolutions` — e `EGRESS_PARTITION_BUCKETS` nomeia **5**. `internalClientSurfaces` e `callerResolutions` ficam fora da partição **sem declaração, sem motivo escrito e sem nada que reprove** se uma chave nova aparecer. `Object.keys` aparece **uma única vez** no arquivo inteiro, e é do lado da entrada.

Este é achado **desta passada de planejamento**, não do review050. Acrescentar um balde a `GoServiceHttpRequestDiscovery` hoje é acrescentar uma saída que a partição não vê, em silêncio — exatamente a forma que o universo de entrada deixou de ter.

### Abertura 3 — o sentido inverso é vácuo em um dos baldes

`nonTransportMemberCalls` tem **0** entradas na árvore real. As checagens do sentido inverso (`entriesWithoutReadOrigin`, `entriesWithEmptyReason`, e a checagem nova da abertura 1) nunca rodam sobre ele. Os demais volumes reais são: `requests` **10**, `notGoBound` **6**, `assembledUrls` **1**, `nonGoBoundInstantiations` **2**.

### Abertura 4 — a frase ainda repete o que o campo prova

A **observação 2** do [review050](../reviews/050-review.md): o `reason` da requisição resolvida no chamador ainda carrega `o fetch está em ${site.filePath}:${site.line}` (`http-egress-sites.ts:2069`). É prosa, não é mais dado de prova — mas nada impede que ela e o campo divirjam. Sondagem nesta baseline: **1** das 19 entradas está nessa condição.

O Goal não amplia alcance, não muda critério de conjunto e não corrige achado algum. Ele faz a partição **conferir as duas mãos** e dá **dono declarado** a cada chave que o descobridor de requisições devolve.

## Dependências e contexto mínimo

- Goals 001 a 050 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review050](../reviews/050-review.md): as observações **1** e **2** e a seção "O que este aceite não cobre" são a origem direta deste Goal. Essa seção continua valendo inteira: **A-24 é achado aberto, não corrigido**, e **não** há conservação de candidatos provada dentro das funções de varredura.
- [DECISIONS](../DECISIONS.md): **D-066** (a conservação é partição computada por campo, `DECISIONS.md:2498`), **D-065**, **D-064**, **D-062** e **D-056** são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §26 e §27](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal050 acrescentou, com o limite declarado da partição — verificada **dentro do subconjunto de baldes que a categoria roteia**. É esse limite que este Goal fecha. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida e de sondagem própria com `tsx` sobre esta baseline. **A enumeração por execução é a que vale:** divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048 e na rodada 2 do Goal050.

- `EGRESS_PARTITION_BUCKETS` está em `assistant.service.test.ts:2999` e nomeia **5** baldes. `EgressPartitionEntry` em `:3010`. `egressPositionKey` em `:3017`. `egressPartitionBucketsForCategory` em `:3036`. `EGRESS_CANDIDATE_UNIVERSE` em `:3061`. O teste permanente da partição em `:3099`, o da exceção em `:3137`, o do universo de entrada em `:3190`. `findEgressPartitionFindings` em `:7447`, e o bloco de controles negativos do Goal050 começa em `:7496`.
- `egressPartitionBucketsForCategory` devolve `["requests", "notGoBound"]` para `env_var_*`, `env_vars_*`, `product_prose_to_client_number`, `caller_resolved_base_url_via_*` e `generic_egress_destination_decided_by_caller_*`; devolve `["notGoBound"]` para `constructor_base_url_*`; devolve `null` no resto, e `null` reprova.
- **Árvore real, por sondagem:** **9** sítios, em **9** categorias distintas — `generic_egress_destination_decided_by_caller_fetchJson`, `product_prose_to_client_number`, `env_vars_EVOLUTION_BASE_URL_and_EVOLUTION_DOWNLOAD_MEDIA_PATH`, `env_var_OPENAI_BASE_URL`, `env_var_SCHEDULING_SERVICE_BASE_URL`, `constructor_base_url_requestBinary`, `constructor_base_url_perform`, `env_var_PASSWORD_RESET_DELIVERY_URL`, `caller_resolved_base_url_via_checkHealth`, uma ocorrência cada.
- **Baldes na árvore real:** `requests` **10**, `notGoBound` **6**, `assembledUrls` **1**, `nonGoBoundInstantiations` **2**, `nonTransportMemberCalls` **0**. Total **19** entradas.
- **Das 19, dez estão em balde não roteado pela categoria da própria origem**, e todas as dez têm a mesma origem, `apps/bff/src/clients/internal-http-client.ts:83 [constructor_base_url_requestBinary]`: **7** em `requests` (`apps/bff/src/clients/evolution/index.ts` nas linhas 84, 105, 121, 143, 165, 192, 203), **1** em `assembledUrls` (`evolution/index.ts:74`) e **2** em `nonGoBoundInstantiations` (`apps/bff/src/clients/ai-orchestrator/index.ts:336` e `apps/bff/src/clients/scheduling/index.ts:550`). O outro sítio `constructor_base_url_*`, `internal-http-client.ts:149 [constructor_base_url_perform]`, tem **zero** entradas derivadas: só a própria, em `notGoBound`.
- **`GoServiceHttpRequestDiscovery` devolve 7 chaves em runtime**, conferidas por `Object.keys`: `requests`, `assembledUrls`, `notGoBound`, `internalClientSurfaces` (**1** entrada), `nonTransportMemberCalls` (**0**), `nonGoBoundInstantiations`, `callerResolutions` (**1** entrada). `HttpEgressDiscovery` devolve **5**: `sites`, `excluded` (**0**), `genericEgressCallers` (**0**), `genericEgressCallersByPrimitive`, `genericEgressPrimitives` (**1**).
- **A entrada carrega categoria própria, e ela não é a da origem.** A requisição de `health.ts:22` tem `category` `env_var_EVOLUTION_GO_BASE_URL` enquanto a origem, `health.ts:46`, é `caller_resolved_base_url_via_checkHealth`; as 7 requisições derivadas de `internal-http-client.ts:83` têm `category` `env_var_EVOLUTION_GO_BASE_URL` sobre origem `constructor_base_url_requestBinary`. `assembledUrls` usa um vocabulário próprio (`assembled_url_for_delivery_*`) e **`nonGoBoundInstantiations` não tem campo `category` nenhum** (`NonGoBoundClassInstantiation`, `http-egress-sites.ts:1350`). Qualquer conferência categoria-a-categoria tem de tratar esses três casos explicitamente, em vez de assumir uniformidade.
- **`reason` que repete a origem:** exatamente **1** das 19 entradas, a requisição de `health.ts:22`, cujo motivo é montado em `http-egress-sites.ts:2069`.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **215** testes e **7864** linhas; `http-egress-sites.ts` com **3886** linhas; suíte completa de `apps/ai-orchestrator` com **939** passando e **88** pulados, em 1027; `npm run test:gate` com **226 pass, 0 fail**; `validate:core` exit 0 com 17 passos (15 passados, 2 pulados por design: `test:bff` e `test:health-worker`).
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- **A correção de harness continua fora de `main`.** `tools/ia-loop/lib/deterministic-executor.mjs:67` monta `argv` com `unit.pattern` cru, e `cwd` já é `worktree/unit.scope`. Consequência prática e única para este Goal: o `pattern` de um gate `targeted-tests` tem de ser escrito **relativo ao escopo** (`tests/assistant/assistant.service.test.ts`, nunca `apps/ai-orchestrator/tests/...`). Este Goal **não** edita `tools/ia-loop/`; nenhuma dispensa anterior se estende.
- Máquina já existente, para **reuso** e não para reescrita: `findEgressPartitionFindings`, `findSilentDiscardFindings`, `expectRefusal`, `egressPositionKey`, e a escrita de árvore temporária com `rmSync` em `finally`. **Uma conta só, chamada pelo teste permanente e pelos controles** — implementar a mesma conta duas vezes foi o blocker 2 da rodada 1 do Goal050.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o grosso do diff: a tabela de encaminhamento de duas mãos, a conferência do lado da entrada, o universo de saída declarado, a vacuidade por balde e os controles negativos.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — diff pequeno e localizado: a forma que resolver a abertura 4, e nada além. Nenhuma regra de classificação, nenhuma categoria, nenhuma ordem de consulta e nenhuma isenção mudam aqui.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**.
- `apps/evolution-go/` — **intocado**, sem exceção.
- `tools/ia-loop/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. O encaminhamento por categoria passa a ter duas mãos, declaradas

`egressPartitionBucketsForCategory` hoje devolve um conjunto só e, por isso, a exceção de `constructor_base_url_*` teve de ser explicada em prosa nos quatro documentos permanentes. A declaração passa a separar, por categoria, **duas** coisas que hoje se confundem:

- **saída própria do sítio** — os baldes em que o próprio sítio de egresso pode aparecer; é sobre esse conjunto que continua valendo "exatamente um balde";
- **saída derivada** — os baldes em que entradas geradas **a partir** daquele sítio (por instanciação, por resolução de chamador, por montagem de URL) podem aparecer.

Para `constructor_base_url_*`, hoje: saída própria `notGoBound`; saída derivada `requests`, `assembledUrls`, `nonGoBoundInstantiations`, `nonTransportMemberCalls`. Para as demais categorias, os dois conjuntos são o que `egressPartitionBucketsForCategory` já devolve hoje. **Categoria que a declaração não souber encaminhar continua reprovando**, nunca caindo em ramo `else` mudo.

A exceção deixa de ser prosa que o documento explica e passa a ser **estrutura que o código declara**. O teste de `:3137`, que hoje prova que a exceção não é vácua, continua existindo e continua reprovando se o dado que a justifica sumir — adaptado à forma nova, nunca removido.

### 2. A partição confere também do lado da entrada

Para **toda** entrada de **todos** os cinco baldes: o balde em que ela está tem de pertencer ao conjunto que a categoria da sua **origem declarada** permite — saída própria quando a entrada é o próprio sítio, saída derivada quando não é. Entrada em balde fora desses conjuntos **reprova**, nomeando o balde, `arquivo:linha` da entrada, `arquivo:linha` da origem e a categoria da origem.

Na árvore real isso tem de passar com zero achados depois do item 1. A mordida é provada por **controle negativo**, não por vacuidade: uma entrada movida para um balde que a categoria da sua origem não permite reprova.

As quatro saídas que o Goal050 já computa — `unroutable`, `withoutBucket`, `inMoreThanOneBucket`, `entriesWithoutReadOrigin` — continuam existindo e continuam reprovando. `inMoreThanOneBucket` passa a ser avaliado sobre a **saída própria**, que é onde "exatamente um" sempre valeu.

### 3. O universo de saída é declarado, fail-closed

No precedente exato de `EGRESS_CANDIDATE_UNIVERSE`: cada chave de `GoServiceHttpRequestDiscovery` é nomeada, entra na partição ou fica **de fora com motivo escrito**, e a declaração é conferida contra `Object.keys(discovery)` sobre a execução real. Chave nova que o descobridor devolva e a declaração não nomeie **reprova**.

As duas que ficam de fora hoje — `internalClientSurfaces` e `callerResolutions` — ganham motivo escrito dizendo por que **não** são baldes de destino de sítio: elas são relatórios do que a resolução leu, não coleções de entradas com origem. O motivo vai no código e no documento permanente; ficar de fora em silêncio é o defeito que este item existe para remover.

### 4. Vacuidade por balde é declarada ou exercida

`nonTransportMemberCalls` é **0** na árvore real. Um balde vazio faz as checagens do sentido inverso passarem sem nada exercer. Para cada um dos cinco baldes, o Goal entrega **uma** das duas coisas, e o relatório diz qual e por quê:

- o balde tem entradas na árvore real, e a não-vacuidade é asserida; **ou**
- o balde é vazio na árvore real, e as checagens do sentido inverso sobre ele são exercidas por **árvore sintética** que o povoa.

Não vale declarar vacuidade em prosa sem uma das duas. Mesma classe do blocker 1 da rodada 2 do Goal050: prosa verdadeira que asserção nenhuma exerce.

### 5. A frase deixa de poder divergir do campo

A entrada de `http-egress-sites.ts:2069` repete `arquivo:linha` da origem dentro do `reason`. O Goal entrega **uma** das duas, e o relatório diz qual e por quê: ou a parte do motivo que cita a posição passa a ser **computada do campo `originSite`**, de modo que os dois não possam divergir; ou ela sai do motivo, que continua prosa útil sem repetir o dado. Se for a primeira, uma asserção confere a correspondência sobre a árvore real e um controle negativo mostra a reprovação quando os dois divergem.

### 6. Nenhum mecanismo de classificação é alterado

Este Goal **não** muda regra de classificação, não renomeia categoria, não remapeia recusa, não altera ordem de consulta, não altera o critério de nenhuma das 9 categorias vistas na árvore e não afrouxa isenção alguma. Os três vocabulários de recusa, `TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`, `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` mantêm o conteúdo da baseline. `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` continua com as duas entradas e continua conferido nos dois sentidos. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando. `DOCUMENTED_SILENT_DISCARDS` continua com as **5** entradas, chaveada por trecho normalizado mais função envolvente, fail-closed nos três sentidos.

### 7. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas sem recusa. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 8. Controle negativo: as amarras mordem

Cada item aparece no relatório com as **duas** saídas — antes e depois — e nenhuma quebra sobra na árvore ao fim. Cada controle chama **a mesma conta** que o teste permanente chama; segunda implementação da mesma conta foi blocker na rodada 1 do Goal050.

1. **Entrada em balde não permitido reprova.** Mover uma entrada real de `requests` para `assembledUrls` sobre uma origem cuja categoria não permite `assembledUrls`: antes, passa verde; depois, reprova nomeando balde, entrada, origem e categoria.
2. **Entrada derivada em balde de saída própria reprova**, e o inverso também — as duas mãos são distintas, não a união das duas.
3. **Chave nova de saída reprova.** Acrescentar uma chave ao objeto devolvido pela leitura, não declarada no universo de saída: reprova, nomeando a chave.
4. **Chave declarada que some reprova** como declaração obsoleta.
5. **A exceção de `constructor_base_url_*` continua não sendo vácua**, na forma nova: sumir o dado que a justifica reprova.
6. **As quatro saídas do Goal050 continuam mordendo**: sítio perdido, sítio em mais de um balde de saída própria, entrada com origem inventada e motivo vazio. Uma cada, com as duas saídas.
7. **Balde vazio exercido por árvore sintética reprova de fato** quando povoado com entrada inválida — a prova de que o item 4 do escopo não é vacuidade nova.
8. **A enumeração de descarte e a cobertura de categoria do Goal049/050 continuam mordendo.** Remover temporariamente um controle de categoria: a cobertura acusa a categoria órfã. Inserir um descarte guardado por valor ausente em ponto não registrado: reprova, com `arquivo:linha` na mensagem.

### 9. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go algum — nem de produção, nem de teste.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não edita arquivo algum de `tools/ia-loop/`. O `pattern` dos gates é escrito relativo ao escopo, que é o que a árvore de `main` exige.
- Não amplia a **forma** de descarte reconhecida pela enumeração do Goal049, não varre todo `continue;` do módulo e **não** prova conservação de candidatos dentro das funções de varredura: a partição deste Goal continua sendo entre o descobridor e os baldes de saída.
- Não transforma `internalClientSurfaces` nem `callerResolutions` em baldes de partição: eles ganham **motivo declarado** para estarem fora, não pertencimento novo.
- Não fecha as observações opcionais herdadas dos reviews 040 e 041 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`): elas erram na direção de resíduo nomeado e ficam para Goal futuro.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não remove nem reescreve teste existente para acomodar o mecanismo novo: acréscimo, migração de assinatura e atualização de igualdade profunda, não deleção de caso. O teste de `:3137` é **adaptado**, nunca removido.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 10. Prova

A prova é execução, não leitura. Cada amarra é exercida por controle negativo com as duas saídas no relatório, e cada afirmação escrita em documento permanente é conferida contra a execução final. Afirmação de conservação, exaustividade, partição ou classificação que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046, nas rodadas 1 e 2 do Goal047, na rodada 1 do Goal048 e nas rodadas 1 e 2 do Goal050.

### 11. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-067** no formato de D-054 a D-066, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§28**, sem reescrever §4 a §27; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento, o universo de saída declarado do escopo §3 e a vacuidade por balde do escopo §4. O limite que o Goal050 escreveu em `VALIDATION_GATE` — partição verificada só dentro do subconjunto roteado — é **substituído por acréscimo**: o texto anterior não é apagado, e o parágrafo novo diz o que passou a valer e desde quando. Toda contagem escrita em documento permanente — sítios, baldes, entradas, chaves de saída, descartes registrados, testes, linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048 e na rodada 2 do Goal050.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. O encaminhamento por categoria declara **saída própria** e **saída derivada** separadamente, e categoria não encaminhável continua reprovando — provado por diff e por execução.
2. Toda entrada dos cinco baldes é conferida contra o conjunto que a categoria da sua origem permite, e entrada em balde não permitido reprova nomeando balde, entrada, origem e categoria — provado pelos controles 1 e 2 do escopo §8, com as duas saídas.
3. "Exatamente um balde" é avaliado sobre a saída própria, e o teste da exceção de `constructor_base_url_*` continua reprovando se o dado que a justifica sumir — provado pelo controle 5.
4. O universo de saída está declarado contra `Object.keys(discovery)`, com `internalClientSurfaces` e `callerResolutions` fora com motivo escrito; chave nova reprova e chave declarada que some reprova — provado pelos controles 3 e 4.
5. Cada um dos cinco baldes tem não-vacuidade asserida ou tem o sentido inverso exercido por árvore sintética, com o relatório dizendo qual e por quê — provado por execução e pelo controle 7.
6. A parte do motivo que cita a posição da origem é computada do campo ou saiu do motivo, com o relatório dizendo qual e por quê — provado por diff e, no primeiro caso, por asserção mais controle negativo.
7. As quatro saídas da partição do Goal050 continuam reprovando — provado pelo controle 6.
8. A enumeração de descarte do Goal049/050 continua mordendo, com as mesmas **5** entradas, e o alcance declarado dela não foi ampliado — provado pelo controle 8 e por documento.
9. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos — provado pelo controle 8.
10. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação mudou e nenhuma isenção foi afrouxada — provado por diff.
11. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
12. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior ou igual a **215** e a de `apps/ai-orchestrator` maior ou igual a **939** passando, com os mesmos **88** pulados.
13. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
14. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` está intocado.
