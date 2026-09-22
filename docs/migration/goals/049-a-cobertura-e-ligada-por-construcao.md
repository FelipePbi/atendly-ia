# Goal 049 — A cobertura é ligada por construção: controle que não declara a categoria não conta

**Status: ACCEPTED** no [review049](../reviews/049-review.md) (rodada 1 de 1, 2026-09-22, zero blockers). Preparado em 2026-09-22 pelo Tech Lead Agent após [Goal048 ACCEPTED](../reviews/048-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 049 nasce na [v70 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 048, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `f294e0e252c6ef69f85c46eeb6dcd7cc9e85de20`

Goal anterior: 048 — A cobertura de recusa é computada: categoria sem controle reprova

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal048 já integrado em `main` (origem `81cbb6577109f57fb09c0d0a42619609d2646fca`), com `expectRefusal` e `observedRefusalCategories` em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:48`–`64`, o registro `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` em `:6860`–`6869` e o teste de cobertura em `:6871`–`6896`, iterando os três arrays em runtime. Duas rodadas: uma `CHANGES_REQUIRED` com 2 blockers, ambos de fechamento documental, e o aceite na segunda, com zero. **D-064** foi aceita e [FINAL_AUDIT §25](../FINAL_AUDIT.md) escrita sem reescrever §4 a §24. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O Goal048 inverteu o default da prova: a cobertura das **24** categorias de recusa passou a ser computada a partir dos três arrays em runtime, e categoria sem controle passou a reprovar. O mecanismo funciona — foi conferido por execução no [review048](../reviews/048-review.md), categoria a categoria, com **22** controles observados e **2** categorias descontadas por registro nomeado que o próprio teste confere nos dois sentidos.

O que sobrou é que **o mecanismo novo credita cobertura por convenção, não por construção**. `expectRefusal(action, matcher)` recebe uma `RegExp` e, depois de a asserção passar, extrai a categoria de `[categoria: X]` da mensagem realmente lançada e a marca como observada. Os dois lados nunca são confrontados. Disso saem duas aberturas, ambas conferidas nesta baseline:

- Um controle cuja `RegExp` case a categoria **A** e cuja recusa traga a categoria **B** credita **B**. A execução fica verde, e a categoria A continua descoberta enquanto a suíte afirma que não está. É a observação 2 do [review048](../reviews/048-review.md), e é exatamente a classe de defeito — afirmação que a execução não exerce — que o Goal048 existiu para remover, um nível abaixo.
- Uma recusa **sem** marcador `[categoria: ...]` não credita nada e **não reprova**: o `if (category)` de `:61` engole o caso em silêncio. Recusa nova escrita fora das quatro fábricas que emitem o marcador sai da contabilidade sem ninguém notar.

A segunda sobra é da mesma família e está no par da observação 1 do [review048](../reviews/048-review.md): a asserção de ausência de saída silenciosa (`assistant.service.test.ts:5770`) deixou de depender de nome de variável, mas ficou presa ao **acessor** — `/\.get\([^)]*\);\s*\n\s*if \(\w+ === undefined\) continue/u`. Um descarte mudo escrito `if (!x) continue`, ou sobre valor vindo de outra origem, passa. Conferido na baseline: `apps/ai-orchestrator/tests/support/http-egress-sites.ts:726` tem exatamente isso — `if (!argExpression) continue;` —, e a asserção não o vê.

O Goal não amplia alcance, não muda critério de conjunto e não corrige achado algum. Ele liga a prova ao que ela afirma: a categoria creditada passa a ser a **declarada pelo controle**, e o descarte mudo passa a ser **enumerado**, não casado por uma forma escrita à mão.

## Dependências e contexto mínimo

- Goals 001 a 048 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review048](../reviews/048-review.md): as observações **1** e **2** são a origem direta deste Goal. A seção "O que este aceite não cobre" continua valendo inteira: **A-24 é achado aberto, não corrigido**.
- [DECISIONS](../DECISIONS.md): **D-064** (a cobertura é computada), **D-062** (a isenção é allowlist) e **D-054** (reconhecimento por forma exige resíduo declarado) são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §24 e §25](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal048 acrescentou. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida sobre esta baseline. A enumeração por execução é a que vale: divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046, na rodada 2 do Goal047 e na rodada 1 do Goal048.

- `expectRefusal` está em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:50`–`64`, com `observedRefusalCategories` em `:48`. A assinatura de hoje é `(action: () => unknown, matcher: RegExp)`. A categoria é extraída por `/\[categoria: ([\w]+)\]/u` sobre a mensagem lançada e só é registrada sob `if (category)`.
- Há **29** chamadas de `expectRefusal` no arquivo de teste, fora a declaração. Recontar antes de escrever qualquer número.
- As recusas que trazem o marcador `[categoria: ...]` nascem em exatamente **quatro** fábricas de `http-egress-sites.ts`: `:2344`, `:2539`, `:2544` e `:3271`. Recusa lançada fora delas não tem marcador.
- Os três vocabulários continuam sendo `INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` (`http-egress-sites.ts:2318`, **6**), `CLASS_BINDING_REFUSAL_CATEGORIES` (`:2514`, **6**) e `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` (`:3234`, **12**). Total **24**, das quais **22** com controle observado e **2** no registro de inalcançáveis.
- A asserção de saída silenciosa está em `assistant.service.test.ts:5770`, dentro do bloco `:5757`–`:5771`, que também afirma as duas frases literais de `sourcesByPath` ausente (`:5764` e `:5767`). Essas duas asserções de frase **permanecem**.
- Descarte guardado por valor ausente, hoje, no módulo de suporte: `http-egress-sites.ts:1143` (`if (captured === undefined) continue;`, legítimo — foi ele que obrigou a ancorar a asserção em `.get(`) e `:726` (`if (!argExpression) continue;`, que a asserção de hoje **não** alcança). O módulo tem **120** ocorrências de `continue;` no total, a grande maioria de varredura lexical de caractere, que **não** são descarte de candidato. A conta que vale é a da execução.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **200** testes e **6896** linhas; `http-egress-sites.ts` com **3861** linhas; suíte completa de `apps/ai-orchestrator` com **924** passando e **88** pulados, em 1012; `npm run test:gate` com **226 pass, 0 fail**; `validate:core` exit 0 com 17 passos (15 passados, 2 pulados por design: `test:bff` e `test:health-worker`).
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- **A correção de harness do Goal048 não está em `main`.** `tools/ia-loop/lib/deterministic-executor.mjs:67` monta `argv` com `unit.pattern` cru, e `cwd` já é `worktree/unit.scope`: o prefixo do escopo **não** é descartado. Consequência prática e única para este Goal: o `pattern` de um gate `targeted-tests` tem de ser escrito **relativo ao escopo** (`tests/assistant/assistant.service.test.ts`, nunca `apps/ai-orchestrator/tests/...`). Este Goal **não** edita `tools/ia-loop/`: a dispensa do [review048](../reviews/048-review.md) foi escrita, restrita ao Goal048, e não se estende.
- Máquina já existente, para **reuso** e não para reescrita, ao montar árvore sintética: os auxiliares que os Goals 045 a 048 deixaram em `assistant.service.test.ts` — escrita de árvore temporária com `rmSync` em `finally`, `discoverGoServiceHttpRequests` e as variantes de candidato. Nenhum auxiliar paralelo novo quando um já existente serve.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o grosso do diff: `expectRefusal`, os 29 sítios de chamada, a enumeração de descarte mudo e os controles negativos.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — alterado **somente** se a enumeração exigir expor algo já computado (seam de leitura, sem mudar comportamento). Nenhuma regra de classificação, nenhuma categoria, nenhuma ordem de consulta e nenhuma isenção mudam aqui. O esperado é diff zero, como no Goal048; diff diferente de zero é declarado no relatório com o motivo.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**.
- `apps/evolution-go/` — **intocado**, sem exceção.
- `tools/ia-loop/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. A categoria creditada é a declarada pelo controle

`expectRefusal` passa a exigir do chamador a categoria esperada, e a cobertura só é creditada quando a categoria **declarada** e a categoria **observada na mensagem** são a mesma. Três saídas, todas reprovando em vez de passar em silêncio:

- mensagem sem marcador `[categoria: ...]` **reprova**, nomeando o controle e o que foi lançado — o `if (category)` de hoje deixa de engolir o caso;
- marcador presente com categoria diferente da declarada **reprova**, nomeando as duas;
- categoria declarada que não pertence a nenhum dos três arrays em runtime **reprova** — declaração de categoria inexistente ou já renomeada não vira crédito.

A forma é livre — parâmetro adicional, objeto de opções, tipo derivado dos arrays — desde que a categoria declarada seja **valor**, conferido contra o array em runtime, e não apenas texto dentro da `RegExp`. A `RegExp` continua sendo afirmada: este escopo acrescenta uma amarra, não substitui a asserção de mensagem.

### 2. Os 29 sítios de chamada migram, e a contagem vence

Toda chamada de `expectRefusal` passa a declarar a categoria que aquele controle prova. A lista final é a que a **contagem** exigir no momento da execução, não a que este documento escreveu.

Se em algum sítio a categoria declarada e a observada divergirem, isso é **descoberta de primeira ordem**, não ajuste: o relatório diz qual sítio, qual categoria a `RegExp` nomeia, qual a mensagem traz e qual das duas está certa; a correção mínima é permitida e declarada. Alinhar a declaração à mensagem só para ficar verde, sem dizer que houve divergência, é o mesmo defeito que este Goal existe para remover.

Se um controle exercer uma recusa que legitimamente não tem categoria — recusa nascida fora das quatro fábricas —, ele declara isso explicitamente, com a forma que a implementação escolher para dizer "esta recusa não credita categoria", e o relatório nomeia o sítio e o motivo. O que não pode continuar existindo é o caso **mudo**.

### 3. O descarte silencioso é enumerado, não casado por forma escrita à mão

A asserção de `assistant.service.test.ts:5770` deixa de ser uma `RegExp` ancorada em `.get(`. No lugar, o texto do módulo de suporte é varrido por **descartes guardados por valor ausente** — condição sobre valor ausente seguida de `continue`, em qualquer das formas idiomáticas (`=== undefined`, `=== null`, `!<expr>`), com qualquer identificador e qualquer origem —, e cada ocorrência encontrada tem de estar num **registro declarado**, com `arquivo:linha` e o motivo de ser inócua.

O mecanismo é fail-closed nos dois sentidos, como o registro de inalcançáveis do Goal048:

- ocorrência encontrada e **não** registrada **reprova**, nomeando `arquivo:linha` e o trecho;
- entrada registrada que a varredura **não** encontra mais **reprova** como obsoleta, em vez de ficar valendo para sempre.

As duas asserções de frase literal de `:5764` e `:5767` **permanecem** inalteradas. O registro inicial é o que a varredura devolver — na baseline são dois sítios conhecidos, `:1143` e `:726`, e a contagem real vence este documento.

O alcance deste escopo é **declarado e limitado**: ele cobre descarte guardado por valor ausente, não todo `continue;` do módulo, e não é prova de conservação de candidatos. O limite vai escrito no documento permanente, sem ser vendido como mais do que é. Provar conservação por execução — todo candidato lido termina em requisição, recusa ou balde declarado — é trabalho de Goal futuro e **não** está autorizado aqui.

### 4. Nenhum mecanismo de classificação é alterado

Este Goal **não** muda regra de classificação, não renomeia categoria, não remapeia recusa, não altera ordem de consulta e não afrouxa isenção alguma. Os três arrays, `TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`, `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` mantêm o conteúdo da baseline. O registro `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` continua com as duas entradas e continua conferido nos dois sentidos; se a amarra do escopo §1 revelar que uma delas é observável, isso é achado, entra no relatório com `arquivo:linha`, e a entrada sai do registro.

### 5. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas sem recusa. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento. A cobertura das **24** categorias continua computada e continua passando.

### 6. Controle negativo: as duas amarras mordem

Cada item aparece no relatório com as **duas** saídas — antes e depois — e nenhuma quebra sobra na árvore ao fim.

1. **Categoria declarada diferente da observada reprova.** Um controle temporário cuja `RegExp` case uma categoria e cuja recusa traga outra: antes, credita a observada e passa; depois, reprova nomeando as duas.
2. **Recusa sem marcador reprova.** Um controle temporário sobre recusa sem `[categoria: ...]`: antes, passa creditando nada; depois, reprova.
3. **Categoria declarada inexistente reprova.** Declarar uma categoria que não está em nenhum dos três arrays.
4. **Descarte mudo novo reprova, em forma que hoje passa.** Inserir temporariamente `if (!<novoIdentificador>) continue;` no módulo de suporte, sobre valor que não vem de `.get(`: a asserção de hoje passa, a nova reprova com `arquivo:linha`.
5. **Entrada obsoleta no registro reprova.** Registrar um sítio que a varredura não encontra.
6. **A cobertura do Goal048 continua mordendo.** Remover temporariamente um controle de categoria: a cobertura acusa a categoria órfã. Não é regressão nova — é a garantia de que a amarra deste Goal não afrouxou a do anterior.

### 7. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go algum — nem de produção, nem de teste.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não edita arquivo algum de `tools/ia-loop/`. A dispensa do [review048](../reviews/048-review.md) foi restrita ao Goal048 e não se estende; o `pattern` dos gates deste Goal é escrito relativo ao escopo, que é o que a árvore de `main` exige.
- Não prova conservação de candidatos nem varre todo `continue;` do módulo: o escopo §3 é declaradamente parcial.
- Não fecha as observações opcionais herdadas dos reviews 040 e 041 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`): elas erram na direção de resíduo nomeado e ficam para Goal futuro.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não remove nem reescreve teste existente para acomodar o mecanismo novo: acréscimo e migração de assinatura, não deleção de caso.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 8. Prova

A prova é execução, não leitura. Cada amarra é exercida por controle negativo com as duas saídas no relatório, e cada afirmação escrita em documento permanente é conferida contra a execução final. Afirmação de cobertura, exaustividade ou classificação que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046, nas rodadas 1 e 2 do Goal047 e na rodada 1 do Goal048.

### 9. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-065** no formato de D-054 a D-064, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§26**, sem reescrever §4 a §25; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento e do limite declarado do escopo §3. Toda contagem escrita em documento permanente — sítios de `expectRefusal`, categorias, descartes registrados, testes, linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046, na rodada 2 do Goal047 e na rodada 1 do Goal048.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A cobertura só é creditada quando a categoria declarada pelo controle e a observada na mensagem coincidem — provado pelo controle 1 do escopo §6, com as duas saídas.
2. Recusa sem marcador `[categoria: ...]` reprova em vez de passar creditando nada — provado pelo controle 2, com as duas saídas.
3. Categoria declarada fora dos três arrays em runtime reprova — provado pelo controle 3.
4. Os **29** sítios de `expectRefusal` declaram categoria; qualquer divergência entre declarada e observada está no relatório, com qual das duas estava certa, e a contagem real vence este documento — provado por execução.
5. A ausência de descarte silencioso é enumerada: ocorrência não registrada reprova com `arquivo:linha`, e entrada obsoleta reprova — provado pelos controles 4 e 5, com as duas saídas.
6. A asserção nova alcança forma que a de hoje não alcança: `if (!x) continue` sobre valor de outra origem reprova — provado pelo controle 4, com as duas saídas.
7. As duas asserções de frase literal de `:5764` e `:5767` continuam presentes e passando — provado por diff e execução.
8. O limite do escopo §3 está declarado no documento permanente: a enumeração cobre descarte guardado por valor ausente, não todo `continue;` nem conservação de candidatos.
9. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos — provado pelo controle 6.
10. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação mudou e nenhuma isenção foi afrouxada — provado por diff.
11. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
12. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior ou igual a **200** e a de `apps/ai-orchestrator` maior ou igual a **924** passando, com os mesmos **88** pulados.
13. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
14. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` está intocado.
