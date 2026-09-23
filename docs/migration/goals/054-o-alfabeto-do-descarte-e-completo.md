# Goal 054 — O alfabeto do descarte é completo: `break` e saída antecipada dentro de laço deixam de ser invisíveis

**Status: READY.** Preparado em 2026-09-22 pelo Tech Lead Agent após [Goal053 ACCEPTED](../reviews/053-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 054 nasce na [v75 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 053, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `d3e76645d3042e66eb9559f33fef9dda40904809`

Goal anterior: 053 — O critério da isenção é o domínio percorrido: laço que itera elementos deixa de ser isento pela forma sintática do cabeçalho

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal053 já integrado em `main` (origem `08c65254d4587a98725ede8027359bade538e9d7`), com `CONTINUE_CURSOR_DOMAINS` em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:7067`, `resolveIndexedBaseShape` em `:7772`, `resolveContinueCursorDomain` em `:7914`, `enumerateContinueOccurrences` em `:8037` e `requiresSilentDiscardRegistration` em `:8734`. **Três rodadas:** `CHANGES_REQUIRED` com 3 blockers, `CHANGES_REQUIRED` com 2 e o aceite na terceira, com zero. **D-069** foi aceita e [FINAL_AUDIT §30](../FINAL_AUDIT.md) escrita sem reescrever §4 a §29. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Os Goals 048 a 053 removeram, um nível de cada vez, a prova creditada por prosa. O 052 tirou o descarte do silêncio e o transformou em enumeração completa. O 053 tirou a isenção da forma sintática do cabeçalho e a transformou em domínio percorrido, computado do texto.

O que sobrou é de **alcance**, não de critério, e está medido nesta baseline: os dois Goals resolveram o descarte de candidato sobre **uma só** forma sintática de descartar. A máquina inteira — `enumerateContinueOccurrences`, `classifyContinueLoopForm`, `resolveContinueCursorDomain`, `requiresSilentDiscardRegistration`, `DOCUMENTED_SILENT_DISCARDS` — só conhece `continue;`. Um laço tem outras duas maneiras de largar candidato, e as duas são **piores** que `continue;`, porque não descartam um elemento: descartam **todo o resto**.

### Abertura 1 — `break;` abandona o resto do laço e não é enumerado

`break;` em laço portador de candidato encerra a varredura com o domínio pela metade. Hoje ele tem enumeração zero, classe zero, domínio zero, exigência zero e resíduo zero: não aparece em `findContinueEnumerationFindings`, não é chaveado em `DOCUMENTED_SILENT_DISCARDS` e nenhuma amarra morde se ele aparecer ou sumir.

Sondagem própria nesta baseline, sobre `apps/ai-orchestrator/tests/support/http-egress-sites.ts`, por varredura com máscara de literais, comentários e literais de expressão regular, com casamento de chaves — **6** ocorrências de `break;`, todas dentro de laço:

- `:591`, em `while ((match = pattern.exec(source)))` de `findAssignmentRhs` — classe `while-exec-match`, que o Goal052 já trata como **portadora de candidato**. O `break` abandona todos os casamentos restantes.
- `:2316`, em `while ((match = pattern.exec(source)))` de `findEnclosingClassSpan` — mesma classe, mesmo abandono.
- `:2037`, em `for (const parameterName of transitParams)` — `for-of` sobre coleção de elementos, a classe que exige motivo registrado desde o 052 e que o 053 confirmou por domínio. O `break` larga todos os `parameterName` restantes.
- `:1475`, `:1667` e `:1671`, em laços de varredura de caractere — domínio `character-sequence` pelo critério do 053, e portanto isentos por cômputo, não por silêncio.

Três das seis descartam candidato exatamente como um `continue;` descartaria, e nenhuma é exigida hoje.

### Abertura 2 — saída antecipada de função dentro de laço abandona a varredura inteira

`return` dentro de laço é a forma mais forte: não encerra o laço, encerra a **função de varredura**. Sondagem própria nesta baseline: **17** `return` dentro de laço, de **163** no arquivo. Pelo critério já aceito do Goal053, três deles estão em laço portador de candidato:

- `:576`, em `for (const property of splitTopLevelItems(objectBody))` — devolve a primeira propriedade que casa e abandona as demais.
- `:1144`, em `for (let index = 0; index < lines.length; index += 1)` de `readEnvSchemaDefault`.
- `:1161`, no laço equivalente de `readEnvFileValue`.

O caso de `:1144` é o mais direto que esta série já encontrou: `:1141` e `:1143` são duas ocorrências de `continue;` **do mesmo laço**, que o Goal053 acabou de obrigar a registrar com motivo escrito, e `:1144` abandona todas as linhas restantes sem registro, sem classe e sem resíduo. A amarra que o 053 apertou tem uma porta aberta ao lado, na linha seguinte.

Os outros **14** estão em laços cujo domínio é `character-sequence` ou `parallel-mask`, e continuam isentos pelo mesmo cômputo do 053 — não por serem `return`.

### Abertura 3 — a fronteira de função é o que distingue, e ela é computável

Nem todo `return` dentro do texto de um laço é saída da função que varre. Um `return` dentro de função aninhada — expressão de função, arrow com corpo em bloco, método de objeto literal — volta da **aninhada**, não da varredura, e o laço continua. Contar os dois juntos seria medir texto em vez de fluxo: a mesma família de defeito que o 053 removeu.

A distinção é computável do texto, por **função mais próxima que contém a ocorrência**: a saída só é antecipada quando essa função é a mesma que contém o cabeçalho do laço. A máquina para isso já existe em parte — `resolveEnclosingTopLevelFunctionName` (`:6851`) e o casamento de delimitadores sobre texto mascarado de `findContinueLoopSpans` (`:7454`). Pela sondagem, a árvore real **não** tem `return` de função aninhada dentro de laço; por isso essa regra é exercida por **fonte sintética**, e a vacuidade não a isenta de prova.

### Abertura 4 — as formas vazias também têm de ser reconhecidas

`break` de `switch` não é abandono de laço, e forma rotulada (`break outer;`, `continue outer;`) abandona um laço que não é o mais interno. Nenhuma das duas existe na árvore real — não há `switch` (`switch` só aparece como string dentro de `CONTROL_FLOW_KEYWORDS`, `http-egress-sites.ts:302`) e não há rótulo. Vazio na árvore não é licença para ramo mudo: as duas formas ou são classificadas com critério computado, ou reprovam como resíduo, e o comportamento sobre elas vem de fonte sintética.

### O que este Goal não é

Não é ampliação de alcance de produto, não corrige achado de auditoria e não prova conservação de candidatos **dentro** das funções de varredura. Ele completa o **alfabeto** do descarte: a mesma enumeração única, a mesma classe de laço, o mesmo domínio percorrido e o mesmo fail-closed do 052/053, aplicados às duas formas de descarte que ficaram de fora.

## Dependências e contexto mínimo

- Goals 001 a 053 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review053](../reviews/053-review.md): a seção "O que este aceite não cobre" é a origem direta deste Goal — "a enumeração **não** se estende a `return`, `break` ou saída antecipada de função: o alcance continua sendo `continue;`". A **observação 1** do mesmo review (a lista de evidências de `character-sequence` em `CURRENT_STATE` é ilustrativa e incompleta, omitindo `readFileSync(…, "utf8")` e retorno declarado `: string`) é absorvida pela documentação deste Goal, por ser do mesmo mecanismo. As **observações 3 e 4** continuam abertas e fora daqui.
- [DECISIONS](../DECISIONS.md): **D-069** (`DECISIONS.md:3187`), **D-068**, **D-067**, **D-066**, **D-065** e **D-056** são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §29 e §30](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal053 escreveu sobre isenção por domínio percorrido e sobre o alcance limitado a `continue;`. É esse limite de alcance que este Goal fecha. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida e de sondagem própria sobre esta baseline. **A enumeração por execução é a que vale:** divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050, nas rodadas 2 e 3 do Goal051, na rodada 1 do Goal052 e nas rodadas 1 e 2 do Goal053.

- Máquina vigente em `assistant.service.test.ts`, com as posições conferidas nesta passada: `buildSilentDiscardRegistry` em `:6503`, lançando em chave duplicada dentro do registro; `DOCUMENTED_SILENT_DISCARDS` em `:6517`, com **47** entradas; `resolveEnclosingTopLevelFunctionName` em `:6851`; `findSilentDiscardFindings` em `:6896`, com as saídas `ambiguousKeys`, `unregistered`, `obsolete` e `emptyReason`; `CONTINUE_LOOP_FORMS` em `:7029`; `CONTINUE_CURSOR_DOMAINS` em `:7067`, com **4** domínios; `CURSOR_BEARING_LOOP_FORMS` em `:7081`; `CONTINUE_LEXICAL_CONTEXTS` em `:7087`; `classifyContinueLoopForm` em `:7408`; `findContinueLoopSpans` em `:7454`; `findNearestValueBinding` em `:7672`; `resolveIndexedBaseShape` em `:7772`; `resolveContinueCursorDomain` em `:7914`; `enumerateContinueOccurrences` em `:8037`; `findContinueEnumerationFindings` em `:8124`; `CONTINUE_CANDIDATE_LOOP_FORMS` em `:8709`; `requiresSilentDiscardRegistration` em `:8734`; `enumerateSilentDiscardOccurrences` em `:8758`.
- **Árvore real, por execução do Goal053 e conferida no review053:** `http-egress-sites.ts` tem **3887** linhas e **120** ocorrências de `continue;`. `byCursorDomain` reconstrói o total: **60** `no-domain` + **54** `character-sequence` + **6** `element-collection` + **0** `parallel-mask` = **120**; os 60 `no-domain` batem com **41** `for-of` + **18** `while-exec-match` + **1** `while-queue-drain`. `unresolved` e `outsideVocabulary` são vazias. `parallel-mask` é asserido **ausente** na árvore real e exercido por fonte sintética.
- **Sondagem própria desta passada, a ser reconferida por execução:** `http-egress-sites.ts` tem **6** ocorrências de `break;`, todas dentro de laço — `:591` (`while-exec-match`), `:1475` (varredura de caractere), `:1667` e `:1671` (varredura de caractere, no `for` de `:1654`), `:2037` (`for-of` sobre `transitParams`) e `:2316` (`while-exec-match`) —, e **17** ocorrências de `return` dentro de laço, de **163** no arquivo: `:206`, `:361`, `:398`, `:406`, `:408`, `:411`, `:432`, `:466`, `:474`, `:477`, `:520`, `:576`, `:624`, `:1144`, `:1161`, `:1479` e `:2842`. Dessas, **3** estão em laço portador de candidato — `:576`, `:1144` e `:1161` — e as outras 14 estão em laço de domínio `character-sequence` ou `parallel-mask`. Não há `switch` na árvore e não há `break`/`continue` rotulado. Se a execução divergir de qualquer um desses números, o relatório diz o número computado e como a divergência foi resolvida, e o computado vence.
- **Chave por número de linha continua proibida.** O Goal050 removeu o chaveamento por linha, e o controle de deslocamento do Goal052/053 (200 linhas inseridas) existe para provar que deslocamento não reprova em massa. Ele continua tendo de passar.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **255** testes e **11631** linhas; `http-egress-sites.ts` com **3887** linhas; suíte completa de `apps/ai-orchestrator` com **979** passando e **88** pulados, em 1067; `npm run test:gate` com **226 pass, 0 fail**; `validate:core` exit 0 com 17 passos (15 passados, 2 pulados por design: `test:bff` e `test:health-worker`).
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- **A correção de harness continua fora de `main`.** `tools/ia-loop/lib/deterministic-executor.mjs:67` monta `argv` com `unit.pattern` cru, e `cwd` já é `worktree/unit.scope`. Consequência prática e única para este Goal: o `pattern` de um gate `targeted-tests` tem de ser escrito **relativo ao escopo** (`tests/assistant/assistant.service.test.ts`, nunca `apps/ai-orchestrator/tests/...`). Este Goal **não** edita `tools/ia-loop/`; nenhuma dispensa anterior se estende.
- Máquina já existente, para **reuso** e não para reescrita: `findContinueLoopSpans`, `classifyContinueLoopForm`, `resolveContinueCursorDomain`, `resolveIndexedBaseShape`, `findNearestValueBinding`, `resolveEnclosingTopLevelFunctionName`, `enumerateSilentDiscardOccurrences`, `findSilentDiscardFindings`, `buildSilentDiscardRegistry`, `expectRefusal` e a escrita de árvore temporária com `rmSync` em `finally`. **Uma conta só, chamada pelo teste permanente e pelos controles** — implementar a mesma conta duas vezes foi o blocker 2 da rodada 1 do Goal050.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o grosso do diff: a ampliação do alfabeto, a fronteira de função, o critério de exigência, o registro ampliado, o teste permanente e os controles negativos.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — **intocado**, salvo se a execução provar que uma ocorrência só pode ser classificada mudando o código de varredura. Se isso acontecer, é **descoberta**, entra no relatório com `arquivo:linha` e justificativa, e o diff daquele arquivo fica restrito a ela. Nenhuma regra de classificação, nenhuma categoria, nenhuma ordem de consulta e nenhuma isenção de egresso mudam ali.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**.
- `apps/evolution-go/` — **intocado**, sem exceção.
- `tools/ia-loop/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. A enumeração passa a ter um alfabeto fechado de formas de descarte

A varredura única de descartes deixa de procurar só `continue;` e passa a enumerar um **vocabulário fechado de formas**, mínimo de três e ampliável pela execução se a árvore exigir, com o relatório dizendo o quê e por quê:

- **`continue`** — o alcance atual, inalterado em significado;
- **`break`** — encerra o laço e abandona o resto do domínio percorrido;
- **saída antecipada de função** — `return` cuja função mais próxima é a mesma que contém o cabeçalho do laço, encerrando a varredura inteira.

Cada ocorrência enumerada carrega, como já carrega hoje para `continue;`: a forma, o contexto léxico, a classe do laço mais interno que a contém, o domínio percorrido por esse laço e a evidência que concedeu o domínio. Forma fora do vocabulário declarado **reprova**, nomeando `arquivo:linha`. Nenhum ramo `else` mudo.

### 2. A fronteira de função é computada, nunca presumida

`return` só é saída antecipada quando a função mais próxima que o contém é a mesma função que contém o cabeçalho do laço. `return` dentro de função aninhada no corpo do laço — expressão de função, arrow com corpo em bloco, método de objeto literal — é **outra classe**, declarada no vocabulário, e **não** exige registro por este Goal, porque não abandona o laço.

A resolução é computada do texto por casamento de delimitadores sobre texto mascarado, no mesmo estilo de `findContinueLoopSpans`. **Nunca** por indentação, por nome de função, por lista de nomes escrita à mão ou por profundidade de chaves contada sem máscara — a indentação foi exatamente a técnica em que a sondagem do Goal052 falhou. `return` cuja fronteira a resolução **não resolve** **reprova**, nomeando `arquivo:linha` e o motivo.

### 3. `switch` e formas rotuladas são reconhecidos ou reprovam

`break` cujo bloco mais interno é um `switch` não é abandono de laço e é classificado como tal, por cômputo. `break`/`continue` com rótulo abandona um laço que pode não ser o mais interno, e ou é resolvido ao laço correto, ou **reprova** como resíduo nomeado. As duas formas são **vazias** na árvore real pela sondagem, e o comportamento sobre elas é exercido por **fonte sintética** — vacuidade não isenta de prova.

### 4. A exigência de motivo é a do Goal053, estendida às formas novas

`requiresSilentDiscardRegistration` passa a combinar **forma de descarte**, **classe de laço** e **domínio percorrido**, sem afrouxar nada do que já vale:

- domínio **sequência de caracteres** e **máscara paralela** continuam isentos, em qualquer forma;
- domínio **coleção de elementos** exige motivo registrado, em qualquer forma;
- laço das classes já portadoras de candidato do Goal052 (`for-of`, `while-exec-match`, `while-queue-drain`) continua exigindo registro **independentemente** do domínio, em qualquer forma;
- domínio não resolvido, forma não resolvida ou fronteira de função não resolvida **reprovam**, cada um nomeando `arquivo:linha` e o motivo de não ter resolvido;
- `break` de `switch` e `return` de função aninhada **não** exigem registro, porque não abandonam o laço — e essa isenção é **computada**, com a evidência registrada por ocorrência.

Se a combinação isentar algo que hoje exige registro, isso é **blocker**, não simplificação. Este Goal só amplia o alfabeto; nunca afrouxa.

### 5. As ocorrências reais das formas novas ganham motivo

Na árvore real, as ocorrências de `break;` e de saída antecipada em laço portador de candidato — pela sondagem `:591`, `:2037` e `:2316` para `break;` e `:576`, `:1144` e `:1161` para saída antecipada, com o número e as linhas conferidos por execução, não copiados daqui — passam a exigir registro, e cada uma ganha motivo escrito substantivo, que diga **o que é abandonado e por que o abandono não perde candidato que importe**.

A chave do registro tem de distinguir forma: uma entrada de `break` e uma de `continue` no mesmo ponto âncora não podem colidir nem se fundir em silêncio. `buildSilentDiscardRegistry` continua lançando em chave duplicada, e a multiplicidade continua conferida como o Goal052 estabeleceu, sem voltar a chavear por linha. As **47** entradas existentes são **reaproveitadas e adaptadas**, nunca duplicadas nem removidas.

### 6. Uma conta só, e o que 052 e 053 provaram continua provado

As formas novas entram **dentro** do caminho já existente (enumeração → `enumerateSilentDiscardOccurrences` → `findSilentDiscardFindings`), nunca como segunda varredura paralela. Depois da mudança continuam valendo, por execução e sem afrouxamento: o total de **120** ocorrências de `continue;` computado em runtime e conferido contra contagem textual independente; a soma por classe de laço e por domínio reconstruindo esse total; `unresolved` e `outsideVocabulary` vazias sobre a árvore real; `byContext.code` igual ao total de código; a ausência de número escrito à mão no comentário de alcance; a multiplicidade declarada; e o controle de deslocamento de 200 linhas. Teste do Goal052 ou do Goal053 que asserir contagem ou exigência é **adaptado** ao alfabeto novo, nunca removido. Renomear símbolo para nome que deixe de falar só de `continue` é permitido e esperado; **deletar caso de teste não é**.

### 7. Vacuidade não é aceita como prova

Cada forma e cada classe do vocabulário declarado tem **uma** das duas coisas, e o relatório diz qual e por quê: ou tem ocorrência na árvore real e a não-vacuidade é asserida com contagem, ou é vazia na árvore real e o comportamento sobre ela é exercido por **fonte sintética** que a povoa. O conjunto das formas presentes mais o das ausentes é igualado ao vocabulário declarado, de modo que forma nova não passe muda. Declarar forma em prosa sem uma das duas é a mesma classe do blocker 1 da rodada 2 do Goal050 e do blocker 1 da rodada 1 do Goal052.

### 8. Nenhum mecanismo de classificação de egresso é alterado

Este Goal **não** muda regra de classificação de egresso, não renomeia categoria, não remapeia recusa, não altera ordem de consulta, não altera o critério de nenhuma das 9 categorias vistas na árvore e não afrouxa isenção alguma. Os três vocabulários de recusa, `TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`, `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` mantêm o conteúdo da baseline. `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` continua com as duas entradas e continua conferido nos dois sentidos. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando. `EGRESS_PARTITION_BUCKETS`, `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE`, `EGRESS_CANDIDATE_UNIVERSE` e `egressPartitionBucketsForCategory` mantêm conteúdo e comportamento.

### 9. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas sem recusa. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 10. Controle negativo: as amarras mordem

Cada item aparece no relatório com as **duas** saídas — antes e depois — e nenhuma quebra sobra na árvore ao fim. Cada controle chama **a mesma conta** que o teste permanente chama; segunda implementação da mesma conta foi blocker na rodada 1 do Goal050.

1. **`break;` em laço portador de candidato reprova quando não registrado.** Sobre a árvore real: remover a entrada de uma das ocorrências do escopo §5 produz `unregistered` nomeando a linha. Antes do diff, a mesma remoção não produzia nada, porque a ocorrência não era enumerada.
2. **Saída antecipada em laço `element-collection` reprova quando não registrada** — sobre `:1144` ou `:1161`, as duas saídas. É o caso que mostra a porta aberta ao lado da amarra do Goal053.
3. **`break;` em laço de domínio `character-sequence` continua isento**, e a mesma guarda movida para laço sobre coleção de elementos passa a exigir registro — as duas saídas, por fonte sintética.
4. **`return` de função aninhada dentro de laço não conta como saída antecipada**, e o mesmo `return` movido para o corpo do laço passa a contar — as duas saídas, por fonte sintética.
5. **`break` de `switch` não conta como abandono de laço**, e forma rotulada é resolvida ao laço correto ou reprova como resíduo — as duas saídas, por fonte sintética.
6. **Forma, domínio ou fronteira não resolvidos reprovam**, nomeando `arquivo:linha` e o motivo, em vez de isentar; forma fora do vocabulário declarado também reprova.
7. **Entrada registrada que perde a ocorrência reprova** como obsoleta, motivo vazio reprova, e chave de `break` não colide com chave de `continue` no mesmo ponto âncora — o registro continua lançando em chave duplicada dentro de si.
8. **Deslocamento de linha continua não reprovando em massa** — o controle do Goal052/053 na forma nova, com a mesma prova.
9. **Nada de 052 e 053 foi afrouxado:** uma ocorrência de `continue;` que já exigia registro continua exigindo, e o total por classe e por domínio continua reconstruindo **120** — as duas saídas.
10. **A partição do Goal050/051 e a cobertura do Goal049 continuam mordendo.** Entrada em balde não permitido pela categoria da origem, chave nova no universo de saída, e categoria órfã na cobertura: uma cada, com as duas saídas.

### 11. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go algum — nem de produção, nem de teste.
- Não reabre, não reverte e não reescreve o aceite do Goal053 nem o [review053](../reviews/053-review.md).
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não edita arquivo algum de `tools/ia-loop/`. O `pattern` dos gates é escrito relativo ao escopo, que é o que a árvore de `main` exige.
- Não resolve forma, domínio ou fronteira de função por **lista de nomes** escrita à mão, nem por heurística de indentação, nem por nome de função.
- **Não amplia o alfabeto para `throw`.** `throw` aborta a execução inteira e é ruidoso por construção; não é descarte silencioso de candidato. Fica declarado como fora do alcance, não como resíduo.
- **Não prova conservação de candidatos dentro das funções de varredura.** Registrar um abandono com motivo escrito diz que ele está nomeado e justificado; não diz que o candidato abandonado não importava. Esse limite continua declarado, herdado de D-065/D-066/D-067/D-068/D-069, e não é afrouxado por este Goal.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não remove nem reescreve teste existente para acomodar o mecanismo novo: acréscimo, renomeação, migração de assinatura e atualização de igualdade profunda, não deleção de caso.
- Não fecha as observações opcionais herdadas dos reviews 040 e 041 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`): elas erram na direção de resíduo nomeado e ficam para Goal futuro.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 12. Prova

A prova é execução, não leitura. Cada amarra é exercida por controle negativo com as duas saídas no relatório, e cada afirmação escrita em documento permanente é conferida contra a execução final. Afirmação de conservação, exaustividade, partição, classificação, domínio ou alcance que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046, nas rodadas 1 e 2 do Goal047, na rodada 1 do Goal048, nas rodadas 1 e 2 do Goal050, na rodada 1 do Goal051, na rodada 1 do Goal052 e nas rodadas 1 e 2 do Goal053.

**Os cinco blockers do Goal053 foram todos de prosa, nenhum de mecanismo.** É o padrão mais caro desta série. Regra desta passada, além de escrever a prosa **depois** da execução final: **cada afirmação de alcance, isenção ou evidência escrita em documento permanente nomeia a saída da execução ou o ramo do código que a sustenta**, e afirmação cujo ramo não existe no código é blocker mesmo que o mecanismo esteja correto.

### 13. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-070** no formato de D-054 a D-069, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§31**, sem reescrever §4 a §30; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento, o vocabulário de formas do escopo §1, a fronteira de função do escopo §2, o critério de exigência do escopo §4 e o alcance que continua fora do escopo §11. O parágrafo que o Goal053 escreveu em `VALIDATION_GATE` sobre alcance limitado a `continue;` é **substituído por acréscimo**: o texto anterior não é apagado, e o parágrafo novo diz o que passou a valer e desde quando, inclusive que o alcance por uma forma só era fail-open medido sobre as ocorrências do escopo §5.

Junto, e por acréscimo, a **observação 1 do [review053](../reviews/053-review.md)** é fechada: a lista de evidências de `character-sequence` em [CURRENT_STATE](../CURRENT_STATE.md) passa a nomear também `readFileSync(…, "utf8")` e retorno declarado `: string` de função do módulo, que `resolveIndexedBaseShape` prova — e cada item da lista nomeia o ramo do código que o sustenta. Item sem ramo correspondente não entra.

Toda contagem escrita em documento permanente — ocorrências por forma, por classe e por domínio, entradas do registro, testes, linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050, na rodada 2 do Goal051, na rodada 1 do Goal052 e nas rodadas 1 e 2 do Goal053.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A enumeração única cobre um vocabulário fechado de formas de descarte que inclui `continue`, `break` e saída antecipada de função, com forma fora do vocabulário reprovando por `arquivo:linha` — provado por diff e por execução.
2. A fronteira de função é computada por casamento de delimitadores sobre texto mascarado: `return` de função aninhada não conta como saída antecipada, e o mesmo `return` no corpo do laço conta — provado pelo controle 4, com as duas saídas.
3. `break` de `switch` e forma rotulada são classificados por cômputo ou reprovam como resíduo, com o comportamento exercido por fonte sintética — provado pelo controle 5.
4. A exigência de motivo combina forma, classe de laço e domínio percorrido: `element-collection` e as classes portadoras de candidato exigem registro em qualquer forma; `character-sequence` e `parallel-mask` seguem isentos; forma, domínio ou fronteira não resolvidos reprovam nomeando `arquivo:linha` — provado pelos controles 1, 2, 3 e 6.
5. As ocorrências de `break;` e de saída antecipada em laço portador de candidato na árvore real — **3** e **3** na sondagem, os números finais vindo da execução — exigem registro e têm motivo escrito substantivo, sem duplicar nem remover entrada existente, com chave que distingue forma — provado pelos controles 1, 2 e 7.
6. Nada que os Goals 052 e 053 exigiam deixou de ser exigido, e o total de **120** ocorrências de `continue;` continua reconstruído por classe e por domínio — provado pelo controle 9 e pelos testes permanentes adaptados.
7. Cada forma e cada classe declarada tem não-vacuidade asserida com contagem ou tem o comportamento exercido por fonte sintética, com o conjunto de presentes mais ausentes igualado ao vocabulário — provado por execução.
8. A conta é uma só: as formas novas entram no caminho existente e nenhuma segunda varredura foi criada — provado por diff.
9. `throw` está declarado fora do alcance, com o motivo escrito, e não foi enumerado — provado por diff.
10. A partição do Goal050/051 e a cobertura das **24** categorias do Goal049 continuam reprovando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos — provado pelo controle 10.
11. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação de egresso mudou e nenhuma isenção de egresso foi afrouxada — provado por diff.
12. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
13. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior ou igual a **255** e a de `apps/ai-orchestrator` maior ou igual a **979** passando, com os mesmos **88** pulados.
14. Cada afirmação de alcance, isenção ou evidência escrita em documento permanente nomeia a saída da execução ou o ramo do código que a sustenta, e a lista de evidências de `character-sequence` em `CURRENT_STATE` passou a ser completa quanto aos ramos que `resolveIndexedBaseShape` tem — provado por diff contra o código.
15. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
16. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` e `http-egress-sites.ts` estão intocados, salvo descoberta declarada no relatório conforme "Pontos de implementação".
