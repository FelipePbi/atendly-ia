# Goal 055 — A isenção é provada pelo que o descarte abandona: ocorrência isenta cuja região abandonada produz saída deixa de ser isenta em silêncio

**Status: ACCEPTED** no [review055](../reviews/055-review.md) (rodada 2 de 2, 2026-09-26; rodada 1 `CHANGES_REQUIRED` com 9 blockers, rodada 2 com zero). Preparado em 2026-09-23 pelo Tech Lead Agent após [Goal054 ACCEPTED](../reviews/054-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 055 nasce na [v76 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 054, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `0851b3362ced899954a5f19600e2a06944e6a913`

Goal anterior: 054 — O alfabeto do descarte é completo: `break` e saída antecipada dentro de laço deixam de ser invisíveis

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal054 já integrado em `main` (origem `321bae67c97f910289b1b22904e09b09eeb5536b`), com `DISCARD_FORMS` em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:8056`, `findMaskedBraceTopology` em `:7900`, `enumerateDiscardOccurrences` em `:8709`, `resolveSilentDiscardRequirement` em `:10121` e `requiresSilentDiscardRegistration` em `:10232`. **Uma rodada, zero blockers.** **D-070** foi aceita e [FINAL_AUDIT §31](../FINAL_AUDIT.md) escrita sem reescrever §4 a §30. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Os Goals 048 a 054 removeram, um nível de cada vez, a prova creditada por prosa. O 052 tirou o descarte do silêncio e o transformou em enumeração completa. O 053 tirou a isenção da forma sintática do cabeçalho e a transformou em **domínio percorrido**, computado do texto. O 054 tirou a enumeração da forma única e a transformou em **alfabeto fechado**, com `break`, saída antecipada, `switch-break` e `nested-function-return`.

Sobrou um eixo. A isenção continua decidida **só** pelo domínio do cursor — e o consequente que a justifica não é computado por asserção alguma.

### Abertura 1 — o critério de isenção afirma um consequente que a máquina nunca confere

O comentário de `assistant.service.test.ts:10058`–`:10062` escreve o critério vigente: "`character-sequence` e `parallel-mask`: isentas — cada volta avança leitura, nunca descarta candidato". A mesma frase aparece em `:6961` e em `:9997`. O antecedente — qual domínio o cursor percorre — é computado, com vocabulário fechado e evidência por ocorrência, desde o Goal053. **O consequente não é computado por nada.** `resolveSilentDiscardRequirement` isenta em `:10204` (`character-sequence` ou `parallel-mask`, com a evidência do domínio) e em `:10212` (`no-domain` em classe não portadora de candidato) **sem olhar uma única vez o que a ocorrência abandona**.

Isso é exatamente a família de defeito que os Goals 046, 052, 053 e 054 removeram um nível acima de cada vez: um critério cuja parte decisiva é adjetivo, não cômputo.

### Abertura 2 — a árvore real já contém ocorrências isentas que abandonam produção

Sondagem própria nesta baseline, a reconferir por execução. Em `http-egress-sites.ts`, das **111** ocorrências de `continue;`/`break;` que a sondagem resolve a laço contenedor, **6** estão hoje isentas e abandonam região que contém operação produtora:

- `:225`, `:228`, `:232`, `:236` e `:240`, em `splitTopLevelItems` (`:215`), laço `for (let i = 0; i < content.length; i += 1)` (`:220`), domínio `character-sequence`. A região abandonada por cada um contém `items.push(content.slice(start, i).trim())` (`:243`) — a única produção da função. O resultado de `splitTopLevelItems` alimenta os laços portadores de candidato de `:496` (`for (const parameter of splitTopLevelItems(paramsText))`) e de `:576` (`for (const property of splitTopLevelItems(objectBody))`), este último já registrado pelo Goal054.
- `:2989`, em `findTopLevelMethodBodies` (`:2987`), laço `while (i < bodyEnd)`, leitura posicional sobre máscara. A região abandonada contém `methods.push({ braceIndex: i, ... })` (`:2997`).

Nenhuma das seis está em `DOCUMENTED_SILENT_DISCARDS` (`:6547`, **53** entradas). `splitTopLevelItems` **não aparece uma vez sequer** em `assistant.service.test.ts`.

**Este Goal não afirma que essas seis ocorrências estão erradas.** Elas estão corretas hoje: o `push` de `:243` só deve acontecer na vírgula de topo, e pular para o próximo caractere é o comportamento desejado. A afirmação é sobre o **mecanismo de prova**: ele não sabe distinguir um descarte que só avança leitura de um que pula produção, e por isso a isenção que ele concede não prova o que o comentário diz que ela prova. Uma regressão que fizesse um laço de varredura de caractere pular uma produção seria invisível à máquina inteira dos Goals 048 a 054.

### Abertura 3 — o critério que falta é computável, e a população que muda de lado é pequena

A sondagem desta passada computou o fecho transitivo de produção sobre as funções do módulo: `http-egress-sites.ts` tem **70** funções de módulo, **16** com operação produtora direta (`.push(`, `.add(`, `.set(`) e **20** produtoras quando se fecha sobre as chamadas. Aplicando o fecho às regiões abandonadas hoje isentas, **nenhuma** ocorrência a mais entra por chamada a função produtora: as **6** entram por produção **direta** na região.

Isso é o que torna este Goal viável como critério em vez de amostragem: o segundo eixo **retira** isenção de um conjunto pequeno e enumerável, sem inflar `DOCUMENTED_SILENT_DISCARDS` a ponto de diluir o sinal. A observação 1 do [review054](../reviews/054-review.md) nomeou o remédio como "amostragem dirigida, não mecanismo novo"; a sondagem mostra que o mecanismo computado é mais barato **e** mais forte que amostrar, e por isso o roadmap escolheu ele — a escolha e o motivo estão registrados na [v76 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento).

### O que este Goal não é

Não é a conservação geral de candidatos **dentro** das funções de varredura, limite declarado desde D-065 e reafirmado em D-066 a D-070. Aquilo exigiria provar que o candidato abandonado não importava. Este Goal fecha **apenas o pedaço que decide isenção**: uma ocorrência só pode ser isentada de escrever motivo quando a região que ela abandona é, por cômputo, livre de produção. Onde não for, a ocorrência passa a exigir motivo escrito — que é o mesmo remédio dos Goals 052, 053 e 054, não uma prova de conservação.

Não é mudança em `http-egress-sites.ts`, em regra de classificação de egresso, em categoria de recusa, na partição do Goal050/051 nem no conjunto de 10 rotas e 27 literais.

## Dependências e contexto mínimo

- Goals 001 a 054 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review054](../reviews/054-review.md): a **observação 1** é a origem direta deste Goal — `function-early-exit` é a forma com mais ocorrências isentas e menos prova por ocorrência, e "o custo de um erro no cômputo de domínio agora é maior do que era com `continue;` sozinho". A seção "O que este aceite não cobre" delimita o que continua fora, e continua fora. As **observações 2, 3, 4 e 5** seguem abertas e **fora** daqui.
- [DECISIONS](../DECISIONS.md): **D-070** (`DECISIONS.md:3366`), **D-069**, **D-068**, **D-067**, **D-066**, **D-065** e **D-056** são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §30 e §31](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal054 escreveu sobre o alfabeto fechado e sobre a isenção por domínio. É o critério de isenção descrito ali que este Goal estreita. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida e de sondagem própria sobre esta baseline. **A enumeração por execução é a que vale:** divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050, nas rodadas 2 e 3 do Goal051, na rodada 1 do Goal052 e nas rodadas 1 e 2 do Goal053.

- Máquina vigente em `assistant.service.test.ts`, com as posições conferidas nesta passada: `EGRESS_CANDIDATE_UNIVERSE` em `:3090`; `buildSilentDiscardRegistry` em `:6533`; `DOCUMENTED_SILENT_DISCARDS` em `:6547`, com **53** entradas; `resolveEnclosingTopLevelFunctionName` em `:6934`; `findSilentDiscardFindings` em `:7007`; `DISCARD_LOOP_FORMS` em `:7154`; `DISCARD_CURSOR_DOMAINS` em `:7192`; `maskNonCodeText` em `:7428`; `findDiscardLoopSpans` em `:7579`; `findMaskedBraceTopology` em `:7900`; `DISCARD_FORMS` em `:8056`; `DISCARD_FORMS_ABANDONING_LOOP` em `:8080`; `findNearestValueBinding` em `:8338`; `moduleFunctionReturnType` em `:8402`; `resolveIndexedBaseShape` em `:8438`; `resolveDiscardCursorDomain` em `:8580`; `enumerateDiscardOccurrences` em `:8709`; `findDiscardEnumerationFindings` em `:8921`; `DISCARD_CANDIDATE_LOOP_FORMS` em `:10051`; `resolveSilentDiscardRequirement` em `:10121`, com os dois ramos de isenção em `:10204` e `:10212`; `requiresSilentDiscardRegistration` em `:10232`; `enumerateSilentDiscardOccurrences` em `:10263`.
- **Árvore real, por execução do Goal054 e conferida no review054:** `http-egress-sites.ts` tem **3887** linhas e **143** ocorrências de descarte em contexto de código — **120** `continue`, **6** `break`, **17** `function-early-exit`, **0** `switch-break`, **0** `nested-function-return`. `byCursorDomain` reconstrói o total: **64** `no-domain` + **71** `character-sequence` + **8** `element-collection` + **0** `parallel-mask` = **143**. `unresolved` e `outsideVocabulary` são vazias. `DOCUMENTED_SILENT_DISCARDS` tem **53** entradas, **6** delas declarando `form`.
- **Sondagem própria desta passada, a ser reconferida por execução:** `http-egress-sites.ts` tem **51** ocorrências textuais de `.push(`, **14** de `.add(` e **5** de `.set(`; **70** funções de módulo declaradas em coluna zero; **16** delas com operação produtora direta no corpo e **20** produtoras pelo fecho transitivo sobre chamadas. Das **111** ocorrências de `continue;`/`break;` que a sondagem resolve a laço contenedor, **6** estão hoje isentas e abandonam região com operação produtora: `:225`, `:228`, `:232`, `:236`, `:240` (`splitTopLevelItems`, produção em `:243`) e `:2989` (`findTopLevelMethodBodies`, produção em `:2997`). **Nenhuma** ocorrência hoje isenta entra por chamada a função produtora — todas as seis entram por produção direta. A sondagem usou casamento de delimitadores cru sobre texto mascarado à parte, **não** a máquina do teste; se a execução divergir de qualquer um desses números, o relatório diz o número computado e como a divergência foi resolvida, e o computado vence.
- **Chave por número de linha continua proibida.** O Goal050 removeu o chaveamento por linha, e o controle de deslocamento do Goal052/053/054 existe para provar que deslocamento não reprova em massa. Ele continua tendo de passar.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **283** testes e **14236** linhas; `http-egress-sites.ts` com **3887** linhas; suíte completa de `apps/ai-orchestrator` com **1007** passando e **88** pulados, em 1095; `npm run test:gate` com **226 pass, 0 fail**; `validate:core` exit 0.
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- **A correção de harness continua fora de `main`.** `tools/ia-loop/lib/deterministic-executor.mjs:67` monta `argv` com `unit.pattern` cru, e `cwd` já é `worktree/unit.scope`. Consequência prática e única para este Goal: o `pattern` de um gate `targeted-tests` tem de ser escrito **relativo ao escopo** (`tests/assistant/assistant.service.test.ts`, nunca `apps/ai-orchestrator/tests/...`). Este Goal **não** edita `tools/ia-loop/`; nenhuma dispensa anterior se estende.
- Máquina já existente, para **reuso** e não para reescrita: `maskNonCodeText`, `buildDiscardLexicalContexts`, `findDiscardLoopSpans`, `findMaskedBraceTopology`, `resolveDiscardCursorDomain`, `resolveIndexedBaseShape`, `findNearestValueBinding`, `moduleFunctionReturnType`, `resolveEnclosingTopLevelFunctionName`, `enumerateDiscardOccurrences`, `enumerateSilentDiscardOccurrences`, `findSilentDiscardFindings`, `buildSilentDiscardRegistry`, `expectRefusal` e a escrita de árvore temporária com `rmSync` em `finally`. **Uma conta só, chamada pelo teste permanente e pelos controles** — implementar a mesma conta duas vezes foi o blocker 2 da rodada 1 do Goal050.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o grosso do diff: a região abandonada, o fecho de produção, o eixo novo de exigência, o registro ampliado, o teste permanente e os controles negativos.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — **intocado**, salvo se a execução provar que uma ocorrência só pode ser classificada mudando o código de varredura. Se isso acontecer, é **descoberta**, entra no relatório com `arquivo:linha` e justificativa, e o diff daquele arquivo fica restrito a ela. Nenhuma regra de classificação, nenhuma categoria, nenhuma ordem de consulta e nenhuma isenção de egresso mudam ali.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**.
- `apps/evolution-go/` — **intocado**, sem exceção.
- `tools/ia-loop/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. A região abandonada é computada por ocorrência, do mesmo texto mascarado

Cada ocorrência de descarte passa a ter uma **região abandonada** resolvida por cômputo, no mesmo estilo do Goal052/053/054 — casamento de delimitadores sobre `maskNonCodeText`, nunca indentação, nunca nome de função, nunca lista escrita à mão. A região depende da forma, e a regra de cada forma é escrita:

- `continue`: do ponto da ocorrência ao fim do corpo do laço contenedor — o que a volta corrente deixa de executar.
- `break`: do ponto da ocorrência ao fim do corpo do laço que ela abandona (o laço rotulado, quando houver rótulo). Que `break` também abandone as voltas seguintes é **declarado** no comentário do código e no documento; a região computada é a da volta corrente, e o Goal não afirma cobrir mais que isso.
- `function-early-exit`: do ponto da ocorrência ao fim do corpo da função que a fronteira do Goal054 já resolve.
- `switch-break` e `nested-function-return`: **sem região**, porque não abandonam laço algum — é a isenção por forma que o Goal054 §4 eixo 1 já computa, com a evidência dela. Este Goal não a toca.

Região não resolvida **reprova** com motivo escrito nomeando `arquivo:linha`, no mesmo resíduo em que a classe de laço, o domínio e a fronteira de função já reprovam. Não existe ramo `else` mudo.

### 2. A produção do módulo é vocabulário fechado, com resíduo

Um vocabulário declarado de **operações produtoras** — na baseline, `push`, `add` e `set` — passa a existir como array, com o tipo derivado dele, no padrão de `DISCARD_FORMS`. O teste permanente confere o vocabulário **nos dois sentidos**: as operações produtoras que a árvore real contém são igualadas ao vocabulário, e cada membro do vocabulário é nomeado.

A não-vacuidade é asserida por contagem: a árvore real tem operação produtora de cada membro declarado, ou o membro é asserido **ausente** e exercido por fonte sintética. Membro sem uma coisa nem outra é blocker — vacuidade não é prova, como o Goal054 §7 estabeleceu.

### 3. A função produtora é resolvida por fecho transitivo sobre as chamadas do módulo

Uma função de módulo é **produtora** quando o corpo dela contém operação produtora do vocabulário §2, ou quando chama uma função de módulo produtora. O fecho é computado uma vez, sobre o mesmo texto mascarado, e reaproveitado por toda ocorrência — nunca resolvido ocorrência a ocorrência, e nunca numa segunda varredura da fonte.

O fecho tem de terminar e tem de ser conferido: o teste permanente asseria a contagem de funções de módulo, a de produtoras diretas e a de produtoras pelo fecho, todas vindas da execução, e asseria que o fecho é estável (aplicar mais uma volta não muda o conjunto). Chamada cujo destino **não** é função de módulo — método de `string`, de `Array`, de `RegExp`, construtor, importado — **não** é produção por si só; isso é **limite declarado**, com o motivo escrito: a única via de uma chamada dessas alcançar a saída do módulo é o valor que ela devolve, e atribuir valor não é produzir. O limite vai para o comentário do código, para a decisão nova e para os documentos permanentes, nomeando o ramo que o implementa.

### 4. A isenção ganha um segundo eixo, e ele só retira isenção

`resolveSilentDiscardRequirement` passa a ter um eixo a mais, **depois** dos quatro do Goal054 §4 e **sem alterar nenhum deles**: quando os eixos 1 a 4 concluíram pela isenção (`:10204` e `:10212` na baseline), a isenção só é concedida se a região abandonada §1 for **livre de produção** — sem operação produtora do vocabulário §2 e sem chamada a função produtora §3.

- Região livre de produção: isenta, e a evidência da isenção passa a nomear **as duas coisas** — o domínio (ou a classe) que já a concedia e a ausência de produção na região, com a extensão da região em `arquivo:linha`.
- Região com produção: **exige registro**, com o motivo do resolvedor nomeando `arquivo:linha` da ocorrência e da operação produtora encontrada.
- Região não resolvida: **exige registro**, fail-closed, e o resíduo reprova à parte — nunca isenta por falta de prova.

Nada que os Goals 052, 053 e 054 exigiam deixa de ser exigido. O eixo novo **não** concede isenção a nada que hoje exige registro: ele só a retira. Isso é asserido por teste, ocorrência a ocorrência, contra o veredito da baseline.

### 5. As ocorrências reais que mudam de lado ganham motivo

As ocorrências que o eixo §4 desisenta entram em `DOCUMENTED_SILENT_DISCARDS` com motivo escrito **substantivo** — o que a região abandona, por que abandoná-la é correto naquele ponto, e o que aconteceria com a produção se o descarte estivesse errado. Motivo genérico ("varredura lexical", "não descarta candidato") é blocker: é exatamente o adjetivo que o Goal052 removeu.

A sondagem aponta **6** ocorrências (`:225`, `:228`, `:232`, `:236`, `:240` e `:2989`); **o número final é o da execução**. Nenhuma entrada existente é duplicada, removida ou reescrita para acomodar as novas, e a chave continua distinguindo forma, como o Goal054 estabeleceu.

### 6. Uma conta só, e o que 052, 053 e 054 provaram continua provado

A região, o fecho de produção e o eixo novo entram **dentro** do caminho já existente — `enumerateDiscardOccurrences` → `enumerateSilentDiscardOccurrences` → `findSilentDiscardFindings` —, nunca como segunda varredura paralela. Os controles chamam as mesmas funções que o teste permanente chama.

As contagens do Goal054 continuam reconstruídas e asseridas: **143** ocorrências de código por forma e por domínio, `unresolved` e `outsideVocabulary` vazias, o vocabulário de cinco formas conferido nos dois sentidos, e as **120** de `continue;` do Goal052/053 idênticas.

### 7. Vacuidade não é aceita como prova

Cada ramo novo — região por forma, região não resolvida, produção direta, produção por fecho, fecho estável, isenção concedida com as duas evidências, isenção retirada por produção — tem contagem maior que zero asserida na árvore real, ou é asserido **ausente** na árvore real e exercido por fonte sintética. Ramo sem uma coisa nem outra é blocker.

### 8. Nenhum mecanismo de classificação de egresso é alterado

Categorias, vocabulários de recusa, `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`, `EGRESS_PARTITION_BUCKETS`, `EGRESS_CANDIDATE_UNIVERSE`, `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE` e as regras de classificação de sítio continuam com conteúdo idêntico. Este Goal mexe no mecanismo de **descarte**, não no de egresso.

### 9. O conjunto continua provado, e o real continua intocado

A árvore real continua produzindo **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície e **41** ocorrências de `this.http.` classificadas sem recusa. `http-egress-sites.ts` e `product-transport-routes.txt` seguem intocados, salvo a descoberta declarada em "Pontos de implementação".

### 10. Controle negativo: as amarras mordem

Cada amarra é exercida por fonte sintética, com as duas saídas no relatório, e cada árvore temporária é removida com `rmSync` em `finally`:

1. Laço de varredura de caractere cujo `continue` abandona região com `.push(` → **exige** registro, nomeando a operação; o mesmo laço sem o `push` → isenta, com as duas evidências.
2. Laço de varredura de caractere cujo `continue` abandona região que chama função de módulo produtora → **exige** registro; a mesma região chamando função de módulo **não** produtora → isenta.
3. Função produtora só pelo fecho (chama quem chama quem produz) → reconhecida como produtora, com o caminho do fecho nomeado.
4. `break` rotulado cuja região vai até o fim do laço que o rótulo declara, e não até o laço mais interno → região correta, provada pela produção que só existe entre os dois.
5. Saída antecipada de função cuja região abandona produção → exige registro; `return` de função aninhada → continua isento por forma, **sem** região computada.
6. Região não resolvível → **reprova** como resíduo nomeado, em vez de isentar.
7. Ocorrência que hoje exige registro continua exigindo depois do eixo novo — o eixo não concede isenção a ninguém.
8. Entrada de registro obsoleta, ausente ou com motivo vazio → reprova, como o Goal052/054 já exigia.
9. As amarras dos Goals 052, 053 e 054 continuam mordendo: forma fora do vocabulário, domínio não resolvido, classe não resolvida e fronteira de função ausente reprovam nomeados.
10. A partição do Goal050/051 e a cobertura das **24** categorias do Goal049 continuam reprovando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos.

### 11. O que este Goal não pode fazer

- Não afrouxa isenção alguma: o eixo novo só retira.
- Não prova conservação de candidatos dentro das funções de varredura na forma geral — continua limite declarado, herdado de D-065 a D-070.
- Não trata chamada a função fora do módulo como produção; é limite declarado, com o motivo escrito.
- Não amplia o alfabeto de formas, não toca `throw`, não altera `http-egress-sites.ts`, não corrige **A-24** e não muda o conjunto de 10 rotas nem o de 27 literais.
- Não toca `apps/*/src/`, `apps/evolution-go/`, `packages/`, migrations nem `tools/ia-loop/`.
- Não remove teste nem encolhe suíte.

### 12. Prova

A prova é execução, não leitura. Cada amarra é exercida por controle negativo com as duas saídas no relatório, e cada afirmação escrita em documento permanente é conferida contra a execução final. Afirmação de conservação, exaustividade, partição, classificação, domínio, região ou alcance que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046, nas rodadas 1 e 2 do Goal047, na rodada 1 do Goal048, nas rodadas 1 e 2 do Goal050, na rodada 1 do Goal051, na rodada 1 do Goal052 e nas rodadas 1 e 2 do Goal053.

**A regra do Goal054 §12 continua valendo e é repetida aqui de propósito**, porque o [review054](../reviews/054-review.md) pediu que fosse repetida antes de ser tratada como resolvida: **cada afirmação de alcance, isenção ou evidência escrita em documento permanente nomeia a saída da execução ou o ramo do código que a sustenta**, e afirmação cujo ramo não existe no código é blocker mesmo que o mecanismo esteja correto.

### 13. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-071** no formato de D-054 a D-070, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§32**, sem reescrever §4 a §31; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento, a região abandonada do escopo §1, o vocabulário de produção do escopo §2, o fecho do escopo §3, o eixo novo do escopo §4 e o alcance que continua fora do escopo §11. O parágrafo que o Goal054 escreveu em `VALIDATION_GATE` sobre isenção por domínio é **substituído por acréscimo**: o texto anterior não é apagado, e o parágrafo novo diz o que passou a valer e desde quando, inclusive que a isenção por um eixo só era fail-open medido sobre as ocorrências do escopo §5.

Toda contagem escrita em documento permanente — ocorrências por forma, por domínio e por veredito, funções de módulo, produtoras diretas e por fecho, entradas do registro, testes, linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050, na rodada 2 do Goal051, na rodada 1 do Goal052 e nas rodadas 1 e 2 do Goal053.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Toda ocorrência de descarte que abandona laço ou função tem **região abandonada computada** por casamento de delimitadores sobre texto mascarado, com a regra por forma escrita, e região não resolvida reprova nomeando `arquivo:linha` — provado por diff e pelo controle 6.
2. `switch-break` e `nested-function-return` continuam isentos por forma, **sem** região computada, com a evidência por ocorrência que o Goal054 já produz — provado pelo controle 5.
3. O vocabulário de operações produtoras é array declarado com o tipo derivado dele, conferido nos dois sentidos contra a árvore real, e operação produtora fora do vocabulário reprova nomeada — provado por execução.
4. A função produtora é resolvida por fecho transitivo sobre as chamadas do módulo, computado uma vez, com a contagem de funções de módulo, de produtoras diretas e de produtoras por fecho vinda da execução, e com a estabilidade do fecho asserida — provado pelo controle 3 e por execução.
5. Chamada cujo destino não é função de módulo está declarada fora da produção, com o motivo escrito e o ramo nomeado, em código e em documento permanente — provado por diff.
6. A isenção passa a exigir região livre de produção: isenta com as **duas** evidências (domínio ou classe, mais ausência de produção com a extensão da região), exige registro quando há produção e exige registro quando a região não resolve — provado pelos controles 1, 2 e 6.
7. O eixo novo **só retira** isenção: nenhuma ocorrência que exigia registro na baseline passou a ser isenta — provado pelo controle 7 e por asserção ocorrência a ocorrência.
8. As ocorrências que mudaram de lado — **6** na sondagem, o número final vindo da execução — estão registradas com motivo substantivo, sem duplicar, remover ou reescrever entrada existente, com chave que distingue forma — provado pelos controles 1 e 8.
9. A conta é uma só: região, fecho e eixo entram no caminho existente e nenhuma segunda varredura foi criada — provado por diff.
10. Nada dos Goals 052, 053 e 054 foi afrouxado: as **143** ocorrências continuam reconstruídas por forma e por domínio, com `unresolved` e `outsideVocabulary` vazias, e as **120** de `continue;` idênticas — provado pelo controle 9 e pelos testes permanentes.
11. Cada ramo novo tem não-vacuidade asserida com contagem na árvore real ou é asserido ausente e exercido por fonte sintética — provado por execução.
12. A partição do Goal050/051 e a cobertura das **24** categorias do Goal049 continuam reprovando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos — provado pelo controle 10.
13. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação de egresso mudou e nenhuma isenção de egresso foi afrouxada — provado por diff.
14. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
15. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior ou igual a **283** e a de `apps/ai-orchestrator` maior ou igual a **1007** passando, com os mesmos **88** pulados.
16. Cada afirmação de alcance, isenção, região ou evidência escrita em documento permanente nomeia a saída da execução ou o ramo do código que a sustenta — provado por diff contra o código.
17. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
18. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` e `http-egress-sites.ts` estão intocados, salvo descoberta declarada no relatório conforme "Pontos de implementação".
