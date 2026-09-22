# Goal 052 — O descarte é enumerado por inteiro: `continue` fora da forma reconhecida deixa de ser isento em silêncio

**Status: READY.** Preparado em 2026-09-22 pelo Tech Lead Agent após [Goal051 ACCEPTED](../reviews/051-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 052 nasce na [v73 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 051, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `506e99c5f96cb34b60c3433ef701bb78b2078b48`

Goal anterior: 051 — A partição morde nos dois sentidos: entrada em balde que a categoria não roteia reprova, e balde fora da declaração não existe em silêncio

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal051 já integrado em `main` (origem `b28db4aa30672e5e323099d4a07f28e8fb8abf28`), com `EgressPartitionCategoryRouting` em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:3049`, `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE` em `:3139`, `requestsWithReasonDivergentFromOriginSite` em `:3466` e `entriesInBucketNotAllowedByOriginCategory` dentro de `findEgressPartitionFindings` em `:7758`. **Cinco rodadas:** quatro `CHANGES_REQUIRED` (2, 2, 2 e 1 blockers) e o aceite na quinta, com zero. **D-067** foi aceita e [FINAL_AUDIT §28](../FINAL_AUDIT.md) escrita sem reescrever §4 a §27. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Os Goals 049, 050 e 051 fecharam, um nível de cada vez, a mesma família de defeito: prova creditada por prosa em vez de por estrutura. O 049 ligou a cobertura de recusa à categoria declarada; o 050 trocou conservação afirmada por partição computada por campo; o 051 fez a partição morder nas duas mãos e deu dono declarado a cada chave que o descobridor de requisições devolve.

O que sobra, e é o último fail-open conhecido desta série, está um nível **abaixo** de todos eles: **a isenção do descarte de candidato continua sendo silêncio, não critério computado.**

### Abertura 1 — 115 de 120 descartes são isentos por não serem vistos

`findSilentDiscardLines` (`assistant.service.test.ts:6513`) reconhece uma única forma: `if (<condição sobre valor ausente>) continue;`, com a condição em `=== undefined`, `=== null` ou `!<identificador>`, combinável por `||`. `DOCUMENTED_SILENT_DISCARDS` (`:6479`) tem **5** entradas, e o teste permanente de `:6620` exige igualdade entre as duas contagens, fail-closed nos três sentidos.

O alcance restante não é conferido por nada. O comentário de `:6442` o declara em prosa: *"o módulo tem 120 ocorrências de `continue;` no total, a maioria de varredura lexical de caractere (não descarte de candidato) ou dentro de bloco com outra instrução antes do `continue` — nenhuma das duas formas é capturada por este mecanismo"*. Sondagem própria nesta baseline confirma o número **hoje**: são **120** ocorrências de `continue;`, uma por linha, das quais **52** em forma de guarda `if (…) continue;` e **68** nuas. **Nenhuma asserção confere esse 120.** É número escrito à mão num comentário, exatamente a classe de afirmação que os Goals 048 a 051 existiram para remover — só que aqui ela está no próprio mecanismo de descarte.

Consequência concreta: um `continue;` novo que descarte candidato real numa forma fora da regex — e a sondagem achou várias já na árvore, entre elas `if (importDecl.typeOnly) continue;` (`http-egress-sites.ts:1900`), `if (envVarsInMethod.length === 0) continue;` (`:3766`), `if (already) continue;` (`:2684`), `if (callerBinding.localName === functionName) continue;` (`:1052`) e `if (classSurfaces.has(classDeclarationKey)) continue;` (`:3601`) — entra no módulo, passa verde, e nenhum documento fica falso, porque nenhum documento afirma nada sobre ele.

### Abertura 2 — a isenção não tem critério, tem adjetivo

A prosa isenta "varredura lexical de caractere" e "dentro de bloco com outra instrução antes". Nenhuma das duas é computada. A distinção real entre um `continue` que descarta candidato e um que apenas avança a leitura de um caractere está na **forma do laço que o contém**: laço indexado sobre `source`/`text` avança posição de leitura; `for (const x of …)` e `while ((match = pattern.exec(…)))` iteram sobre **candidatos**.

Sondagem própria nesta baseline, por resolução do laço mais próximo que contém cada ocorrência: **35** em `for…of`, **25** em `while`, **55** em `for` indexado nas suas várias formas (`i = 0`, `i = start`, `j = i`, `i = index - 1`, `;` sem inicializador, entre outras) e **5** que a própria sondagem **não resolveu** por recuo de indentação — `http-egress-sites.ts:1761`, `:1765`, `:1769`, `:1773` e `:1796`. Esse resíduo de 5 é evidência dentro da própria sondagem: resolver o laço que contém uma ocorrência por indentação não basta, e o mecanismo entregue tem de reprovar quando não resolve, nunca isentar.

### Abertura 3 — o ponteiro de prosa do review051

O `it` de `assistant.service.test.ts:3483` cita `:4199` ao se referir ao cenário "antes" do controle negativo 2 do Goal044, que é `:4314`. É a **observação 1** do [review051](../reviews/051-review.md): texto de título, nenhuma asserção depende dele, e os documentos permanentes já estão certos. Entra aqui porque este Goal edita o arquivo e a correção é de uma linha.

### O que este Goal não é

Não é ampliação de alcance de produto, não corrige achado de auditoria e não prova conservação de candidatos **dentro** das funções de varredura. Ele troca **isenção por silêncio** por **isenção por critério computado, com resíduo zero**: toda ocorrência de `continue;` do módulo cai numa classe nomeada, a classe portadora de candidato exige motivo registrado, e ocorrência que nenhuma classe reconhece **reprova**. É o precedente exato do Goal046 (a isenção de `export` é allowlist: forma não reconhecida recusa em vez de isentar) aplicado ao descarte.

## Dependências e contexto mínimo

- Goals 001 a 051 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review051](../reviews/051-review.md): a **observação 1** (ponteiro `:4199`) é a origem direta do escopo §6. A seção "O que este aceite não cobre" continua valendo inteira: **A-24 é achado aberto, não corrigido**, e **não** há conservação de candidatos provada dentro das funções de varredura — este Goal **não** a entrega.
- [DECISIONS](../DECISIONS.md): **D-067** (`DECISIONS.md:2745`), **D-066**, **D-065**, **D-064** e **D-056** são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §27 e §28](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal050 escreveu sobre o alcance parcial do registro de descarte. É esse limite que este Goal estreita. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida e de sondagem própria sobre esta baseline. **A enumeração por execução é a que vale:** divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050 e nas rodadas 2 e 3 do Goal051.

- `DOCUMENTED_SILENT_DISCARDS` está em `assistant.service.test.ts:6479`, com **5** entradas; `SilentDiscardEntry` em `:6449`; `normalizeSilentDiscardSnippet` em `:6455`; `silentDiscardKey` em `:6460`; `buildSilentDiscardRegistry` em `:6465`, com duplicata no próprio registro lançando erro; `findSilentDiscardLines` em `:6513`; `resolveEnclosingTopLevelFunctionName` em `:6527`; `SilentDiscardOccurrence` em `:6538`; `findSilentDiscardFindings` em `:6557`, com as quatro saídas `ambiguousKeys`, `unregistered`, `obsolete` e `emptyReason`; o teste permanente em `:6620`.
- O comentário que declara o alcance parcial começa em `:6442` e contém o número **120** escrito à mão.
- Controles negativos vigentes do registro de descarte: `:8056` (deslocamento de linha não reprova em massa), `:8095` (descarte mudo novo reprova), `:8117` (motivo vazio reprova) e `:8604` (a enumeração e a cobertura do Goal049/050 continuam mordendo).
- **Árvore real, por sondagem:** `http-egress-sites.ts` tem **3887** linhas e **120** ocorrências de `continue;`, uma por linha — **52** em forma de guarda `if (…) continue;`, **68** nuas. Por laço mais próximo: **35** `for…of`, **25** `while`, **55** `for` indexado, **5** não resolvidas pela sondagem (`:1761`, `:1765`, `:1769`, `:1773`, `:1796`).
- As **5** entradas registradas hoje estão ancoradas em `resolveViaCallers`, `readEnvSchemaDefault` (duas), `findCrossFileCallerBindings` e `discoverCallerResolvedGoBoundRequests`.
- **Colisão de chave é certa na forma nua.** A chave atual é `<função de topo>::<trecho normalizado>`, e `continue;` nu normaliza sempre para a mesma string: uma função com dois `continue;` nus produz duas ocorrências com a **mesma** chave. `buildSilentDiscardRegistry` já lança em duplicata **dentro do registro**, e `findSilentDiscardFindings` já tem a saída `ambiguousKeys` para ocorrência ambígua. Qualquer desenho que ignore isso não compila contra a árvore real.
- **Chave por número de linha está proibida.** O Goal050 removeu o chaveamento por linha de propósito, e o controle de `:8056` existe para provar que deslocamento de linha não reprova em massa. Ele continua tendo de passar.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **227** testes e **8718** linhas; `http-egress-sites.ts` com **3887** linhas; suíte completa de `apps/ai-orchestrator` com **951** passando e **88** pulados, em 1039; `npm run test:gate` com **226 pass, 0 fail**; `validate:core` exit 0 com 17 passos (15 passados, 2 pulados por design: `test:bff` e `test:health-worker`).
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- **A correção de harness continua fora de `main`.** `tools/ia-loop/lib/deterministic-executor.mjs:67` monta `argv` com `unit.pattern` cru, e `cwd` já é `worktree/unit.scope`. Consequência prática e única para este Goal: o `pattern` de um gate `targeted-tests` tem de ser escrito **relativo ao escopo** (`tests/assistant/assistant.service.test.ts`, nunca `apps/ai-orchestrator/tests/...`). Este Goal **não** edita `tools/ia-loop/`; nenhuma dispensa anterior se estende.
- Máquina já existente, para **reuso** e não para reescrita: `findSilentDiscardFindings`, `buildSilentDiscardRegistry`, `normalizeSilentDiscardSnippet`, `resolveEnclosingTopLevelFunctionName`, `findEgressPartitionFindings`, `expectRefusal` e a escrita de árvore temporária com `rmSync` em `finally`. **Uma conta só, chamada pelo teste permanente e pelos controles** — implementar a mesma conta duas vezes foi o blocker 2 da rodada 1 do Goal050.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o grosso do diff: o enumerador completo, a classificação computada, o registro ampliado, o teste permanente e os controles negativos.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — **intocado**, salvo se a execução provar que uma ocorrência só pode ser classificada mudando o código de varredura. Se isso acontecer, é **descoberta**, entra no relatório com `arquivo:linha` e justificativa, e o diff daquele arquivo fica restrito a ela. Nenhuma regra de classificação, nenhuma categoria, nenhuma ordem de consulta e nenhuma isenção de egresso mudam ali.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**.
- `apps/evolution-go/` — **intocado**, sem exceção.
- `tools/ia-loop/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. A enumeração passa a ver todas as ocorrências

O enumerador deixa de reconhecer uma forma só e passa a achar **toda** ocorrência de `continue;` no texto do módulo, independentemente de guarda, de forma da condição e de estar nua dentro de bloco. A contagem total é **computada em runtime**, nunca escrita à mão: o **120** do comentário de `:6442` sai de prosa e vira resultado de execução. Ocorrência dentro de literal de string ou de comentário, se a leitura textual a produzir, é tratada explicitamente — reconhecida como tal e nomeada, nunca descartada em silêncio.

### 2. Cada ocorrência cai numa classe computada, e resíduo reprova

Cada ocorrência é classificada pela **forma do laço mais próximo que a contém**, computada do texto, num vocabulário fechado. As classes mínimas, que a execução pode ampliar se a árvore exigir:

- **leitura posicional** — laço `for` indexado que avança posição sobre uma string (`source`, `text`, `body`), em qualquer das formas presentes na árvore; o `continue` avança leitura, não descarta candidato;
- **iteração sobre candidatos** — `for (const … of …)` e `while ((match = pattern.exec(…)))`, onde cada volta é um candidato e o `continue` o descarta;
- **outras formas de laço** que a árvore contiver, cada uma nomeada.

Ocorrência cujo laço contenedor a classificação **não resolver** — o resíduo de 5 que a sondagem encontrou é o caso concreto — **reprova**, nomeando `arquivo:linha` e o motivo de não ter resolvido. Nenhum ramo `else` mudo, nenhuma classe "desconhecida" que passe. Classe fora do vocabulário declarado também reprova.

### 3. A classe portadora de candidato exige motivo registrado

Para a classe **iteração sobre candidatos**, toda ocorrência tem de estar no registro com motivo escrito não vazio, e o registro é fail-closed nos três sentidos que o Goal050 já estabeleceu: ocorrência não registrada reprova, entrada registrada sem ocorrência correspondente reprova como obsoleta, motivo vazio reprova. As **5** entradas de hoje são **absorvidas** nesse registro, não duplicadas — uma coleção só, uma conta só.

Para a classe **leitura posicional**, a isenção é **computada**: ela vale porque o critério do item 2 a produziu, e o critério está no código. Não há registro por ocorrência, e não há prosa isentando.

### 4. A chave sobrevive à forma nua

`continue;` nu normaliza para a mesma string, então `<função>::<trecho>` colide. O Goal entrega **uma** das duas formas, e o relatório diz qual e por quê:

- a chave ganha discriminador **estrutural** que não seja número de linha — por exemplo o texto normalizado da guarda que precede o `continue`, ou o cabeçalho normalizado do laço contenedor, ou ambos; **ou**
- a chave permanece como está e cada entrada declara a **multiplicidade esperada**, conferida contra a contagem real de ocorrências daquela chave, com divergência reprovando nos dois sentidos.

Em qualquer das duas, `buildSilentDiscardRegistry` continua lançando em chave duplicada **dentro** do registro, `ambiguousKeys` continua reprovando, e o controle de `:8056` continua passando: deslocar linhas não pode reprovar em massa.

### 5. Vacuidade não é aceita como prova

Cada classe do vocabulário declarado tem **uma** das duas coisas, e o relatório diz qual e por quê: ou tem ocorrência na árvore real e a não-vacuidade é asserida, ou é vazia na árvore real e o comportamento sobre ela é exercido por **fonte sintética** que a povoa. Declarar classe em prosa sem uma das duas é a mesma classe do blocker 1 da rodada 2 do Goal050.

### 6. O ponteiro de prosa é corrigido

O nome do `it` de `:3483` passa a citar `:4314` em vez de `:4199`, que é o cenário "antes" do controle negativo 2 do Goal044. Correção de uma linha, sem tocar o que o teste assere. Nenhum outro ponteiro de prosa é varrido: este Goal corrige o que o [review051](../reviews/051-review.md) nomeou, não faz limpeza geral.

### 7. Nenhum mecanismo de classificação de egresso é alterado

Este Goal **não** muda regra de classificação de egresso, não renomeia categoria, não remapeia recusa, não altera ordem de consulta, não altera o critério de nenhuma das 9 categorias vistas na árvore e não afrouxa isenção alguma. Os três vocabulários de recusa, `TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`, `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` mantêm o conteúdo da baseline. `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` continua com as duas entradas e continua conferido nos dois sentidos. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando. `EGRESS_PARTITION_BUCKETS`, `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE`, `EGRESS_CANDIDATE_UNIVERSE` e `egressPartitionBucketsForCategory` mantêm conteúdo e comportamento.

### 8. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas sem recusa. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 9. Controle negativo: as amarras mordem

Cada item aparece no relatório com as **duas** saídas — antes e depois — e nenhuma quebra sobra na árvore ao fim. Cada controle chama **a mesma conta** que o teste permanente chama; segunda implementação da mesma conta foi blocker na rodada 1 do Goal050.

1. **Descarte novo em laço de candidatos reprova.** Inserir um `continue;` guardado por condição que a regex antiga **não** reconheceria (por exemplo `if (algo.length === 0) continue;`) dentro de um `for…of`: antes, passa verde; depois, reprova nomeando `arquivo:linha` e a classe.
2. **`continue;` nu em laço de candidatos reprova** quando não registrado — a forma que o mecanismo da baseline nunca viu.
3. **Laço de forma não reconhecida reprova**, nomeando `arquivo:linha` e dizendo que a classe não resolveu, em vez de isentar.
4. **Entrada registrada que perde a ocorrência reprova** como obsoleta.
5. **Motivo vazio reprova**, e o registro continua lançando em chave duplicada dentro de si.
6. **Deslocamento de linha continua não reprovando em massa** — o controle de `:8056` na forma nova, com a mesma prova.
7. **`continue;` movido de laço de leitura posicional para laço de candidatos reprova**, e o inverso deixa de exigir registro — a prova de que a classificação é o critério, não a forma da guarda.
8. **A partição do Goal050/051 e a cobertura do Goal049 continuam mordendo.** Entrada em balde não permitido pela categoria da origem, chave nova no universo de saída, e categoria órfã na cobertura: uma cada, com as duas saídas.

### 10. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go algum — nem de produção, nem de teste.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não edita arquivo algum de `tools/ia-loop/`. O `pattern` dos gates é escrito relativo ao escopo, que é o que a árvore de `main` exige.
- **Não prova conservação de candidatos dentro das funções de varredura.** Registrar um descarte com motivo escrito diz que ele está nomeado e justificado; não diz que o candidato descartado não importava. Esse limite continua declarado, herdado de D-065/D-066/D-067, e não é afrouxado por este Goal.
- Não amplia a enumeração para `return`, `break` ou saída antecipada de função: o alcance é `continue;`, e o que fica fora continua **declarado** como fora, agora com o número computado em vez de estimado.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não remove nem reescreve teste existente para acomodar o mecanismo novo: acréscimo, migração de assinatura e atualização de igualdade profunda, não deleção de caso. Os controles de `:8056`, `:8095`, `:8117` e `:8604` são **adaptados**, nunca removidos.
- Não fecha as observações opcionais herdadas dos reviews 040 e 041 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`): elas erram na direção de resíduo nomeado e ficam para Goal futuro.
- Não faz varredura geral de ponteiros de prosa: só o `:4199` do escopo §6.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 11. Prova

A prova é execução, não leitura. Cada amarra é exercida por controle negativo com as duas saídas no relatório, e cada afirmação escrita em documento permanente é conferida contra a execução final. Afirmação de conservação, exaustividade, partição ou classificação que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046, nas rodadas 1 e 2 do Goal047, na rodada 1 do Goal048, nas rodadas 1 e 2 do Goal050 e na rodada 1 do Goal051.

### 12. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-068** no formato de D-054 a D-067, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§29**, sem reescrever §4 a §28; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento, o vocabulário de classes do escopo §2 e o alcance que continua fora do escopo §10. O parágrafo que o Goal050 escreveu em `VALIDATION_GATE` sobre alcance parcial do registro de descarte é **substituído por acréscimo**: o texto anterior não é apagado, e o parágrafo novo diz o que passou a valer e desde quando. Toda contagem escrita em documento permanente — ocorrências por classe, entradas do registro, testes, linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050 e na rodada 2 do Goal051. **Quatro das cinco rodadas do Goal051 foram gastas em texto de documento, não em mecanismo** ([review051](../reviews/051-review.md), observação 5): escrever a prosa **depois** da execução final, nunca à frente dela.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A enumeração acha **toda** ocorrência de `continue;` do módulo, com a contagem total computada em runtime, e o número escrito à mão no comentário de `:6442` deixou de existir — provado por diff e por execução.
2. Toda ocorrência cai numa classe do vocabulário declarado, e ocorrência cujo laço contenedor a classificação não resolve **reprova** nomeando `arquivo:linha` — provado pelo controle 3 do escopo §9, com as duas saídas, e o resíduo sobre a árvore real é **zero**.
3. Toda ocorrência da classe portadora de candidato está registrada com motivo escrito não vazio, fail-closed nos três sentidos, com as **5** entradas de hoje absorvidas numa coleção só — provado pelos controles 1, 2, 4 e 5.
4. A chave sobrevive à forma nua, pela forma que o relatório declarar, e chave duplicada dentro do registro continua lançando — provado por diff e pelos controles 2 e 5.
5. Deslocamento de linha continua não reprovando em massa — provado pelo controle 6.
6. A classificação é o critério, não a forma da guarda: mover um `continue;` entre classes muda a exigência de registro — provado pelo controle 7.
7. Cada classe declarada tem não-vacuidade asserida ou tem o comportamento exercido por fonte sintética, com o relatório dizendo qual e por quê — provado por execução.
8. O `it` de `:3483` cita `:4314`, e nenhum outro ponteiro de prosa foi alterado — provado por diff.
9. A partição do Goal050/051 e a cobertura das **24** categorias do Goal049 continuam reprovando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos — provado pelo controle 8.
10. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação de egresso mudou e nenhuma isenção foi afrouxada — provado por diff.
11. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
12. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior ou igual a **227** e a de `apps/ai-orchestrator` maior ou igual a **951** passando, com os mesmos **88** pulados.
13. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
14. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` está intocado.
