# Goal 048 — A cobertura de recusa é computada: categoria sem controle reprova

**Status: ACCEPTED** no [review048](../reviews/048-review.md) (rodada 2 de 2, 2026-09-22, zero blockers; a rodada 1 teve 2 blockers, ambos de fechamento documental). Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-22 pelo Tech Lead Agent após [Goal047 ACCEPTED](../reviews/047-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 048 nasce na [v69 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 047, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `11f576acc2f4eb667821a50ad16dc13aec6cabbc`

Goal anterior: 047 — O uso do campo cliente é fail-closed: ocorrência do campo fora de `this.<campo>.<membro>(` recusa

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal047 já integrado em `main` (origem `1da1c0a3c1e88c363e9d2bb72a13a6ffb83288f8`), com a enumeração do uso do campo feita pelo **token `this`**, doze categorias em `CLIENT_FIELD_USE_REFUSAL_CATEGORIES`, seis em `INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES`, `computeQuoteOpenerMask` guardando o delimitador de abertura e `unmaskTemplateInterpolations` exigindo crase. Três rodadas: duas `CHANGES_REQUIRED` com 2 blockers cada e o aceite na terceira, com zero. O conjunto de **10** rotas de transporte e o de **27** literais Go continuam idênticos aos que o Goal043 asseriu: `product-transport-routes.txt` está intocado desde então. **D-063** foi aceita e [FINAL_AUDIT §24](../FINAL_AUDIT.md) escrita sem reescrever §4 a §23. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Os Goals 044 a 047 fecharam, um a um, os elos fail-open da cadeia que vai do `fetch` até a rota: superfície derivada da declaração, identidade da classe resolvida por ligação, isenção de `export` virada allowlist, e — no 047 — o uso do campo cliente enumerado pelo receptor, com **vinte e quatro** categorias de recusa nomeadas em três vocabulários em runtime.

O que sobrou não é fail-open de mecanismo: é **fail-open de prova**. O vocabulário de recusa cresceu mais rápido que os controles que o exercitam, e a suíte hoje afirma cobertura que não tem. Conferido por contagem nesta baseline: das **24** categorias declaradas nos três arrays, **8** aparecem em `assistant.service.test.ts` apenas dentro da lista literal de igualdade — nenhum controle as faz acontecer. Pior, o título do próprio teste de igualdade em `assistant.service.test.ts:5500` afirma que `CLASS_BINDING_REFUSAL_CATEGORIES` "é exatamente o conjunto que os controles negativos desta rodada e das anteriores exercitam", e **três** das seis categorias desse array não têm controle algum. É exatamente a classe de defeito que reprovou rodadas nos Goals 044 a 047: afirmação escrita que a execução não exerce.

A consequência é a mesma que sustenta a série: uma categoria pode deixar de acontecer — por mudança na ordem de consulta, por regressão na máscara, por forma nova que passa a cair noutra saída — e **nada reprova**, porque a única prova daquela categoria é o array continuar contendo a string. A cobertura de hoje é **acidente do que cada rodada escreveu**, não propriedade do mecanismo.

O Goal não amplia alcance, não muda critério de conjunto e não corrige achado algum. Ele inverte o default da **prova**: a cobertura passa a ser computada a partir dos arrays em runtime, e categoria sem controle que a exercite **reprova a suíte**.

## Dependências e contexto mínimo

- Goals 001 a 047 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review047](../reviews/047-review.md): a seção "Observações não bloqueantes" é a origem direta deste Goal — observação **1** (o sub-caso "comentário" do critério 3 não tem controle permanente dedicado), observação **2** (cinco das seis categorias `instance_field_assignment_*` existem apenas sob a igualdade do array, "é o par, um nível abaixo, da observação 1 do review046, e cabe em Goal futuro") e observação **3** (a prova do escopo §3 é asserção sobre o texto-fonte do módulo, não controle comportamental). A seção "O que este aceite não cobre" continua valendo inteira: **A-24 é achado aberto, não corrigido**.
- [review046](../reviews/046-review.md): a observação 1 foi fechada pelo escopo §4 do Goal047. Este Goal fecha a **classe** de que ela e a observação 2 do review047 são instâncias.
- [DECISIONS](../DECISIONS.md): **D-054** (reconhecimento por forma exige resíduo declarado), **D-062** (a isenção é allowlist) e **D-063** (o uso do campo é fail-closed) são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §23 e §24](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal047 acrescentou. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida sobre esta baseline. A enumeração por execução é a que vale: divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046 e na rodada 2 do Goal047.

- Existem **três** vocabulários de recusa exportados, e só três: `INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` (`apps/ai-orchestrator/tests/support/http-egress-sites.ts:2318`, **6** membros), `CLASS_BINDING_REFUSAL_CATEGORIES` (`:2514`, **6** membros) e `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` (`:3234`, **12** membros). A busca por declaração exportada de array em `apps/ai-orchestrator/tests/support/*.ts` devolve exatamente essas três. Total: **24** categorias.
- Das 24, as que hoje **só** aparecem na lista literal do teste de igualdade, sem controle que as faça acontecer, são **8**: `instance_field_assignment_destructured`, `instance_field_assignment_foreign_object_property`, `instance_field_assignment_array_element`, `instance_field_assignment_returned_directly`, `instance_field_assignment_form_not_recognized`, `class_binding_homonymous_declarations`, `class_binding_commonjs_export` e `class_binding_cross_file_form_not_resolved`. As demais **16** têm controle próprio. A contagem é reproduzível por ocorrência no arquivo de teste; recontar antes de escrever qualquer número.
- Os três testes de igualdade estão em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:5500` (ligação de classe), `:5764` (uso do campo) e `:5781` (alvo da atribuição). Os três comparam o array em runtime contra uma **lista literal escrita à mão** no teste — o que prova ordem e conteúdo, e **não** prova cobertura. O título de `:5500` afirma cobertura que não existe.
- O controle único do vocabulário de atribuição está em `assistant.service.test.ts:5702` (`instance_field_assignment_local_variable`, com `arquivo:linha` e categoria casada por expressão regular).
- A prova do escopo §3 do Goal047 está em `assistant.service.test.ts:5731`: ela lê o texto-fonte de `http-egress-sites.ts` e afirma duas frases literais presentes mais a ausência de duas formas de `continue` silencioso escritas com o **nome da variável** (`source` e `candidateSource`). Um terceiro `continue` mudo com outro nome passa.
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos (118 em `apps/ai-orchestrator/src` mais 87 em `apps/bff/src`), **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **190** testes e **6451** linhas; `http-egress-sites.ts` com **3861** linhas; `apps/ai-orchestrator/tests/support/` com **cinco** arquivos; suíte completa de `apps/ai-orchestrator` com **914** passando e **88** pulados; `npm run test:gate` com **226 pass, 0 fail, 0 skipped**; `validate:core` exit 0 com 17 passos (15 passados, 2 pulados: `test:bff` e `test:health-worker`).
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- Máquina já existente, para **reuso** e não para reescrita, ao montar árvore sintética: os auxiliares de controle que os Goals 045 a 047 já deixaram em `assistant.service.test.ts` — escrita de árvore temporária, `discoverGoServiceHttpRequests` e as variantes de candidato (`discoverWithCandidateTrailing`, `:5749`). Nenhum auxiliar paralelo novo quando um já existente serve.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o grosso do diff: controles novos e o mecanismo de cobertura.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — alterado **somente** se a cobertura exigir expor algo já computado (seam de leitura, sem mudar comportamento). Nenhuma regra de classificação, nenhuma categoria e nenhuma ordem de consulta mudam aqui.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**. Este Goal não mexe no critério que decide o conjunto.
- `apps/evolution-go/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. A cobertura é computada a partir dos arrays em runtime

A suíte deixa de afirmar cobertura em prosa e passa a **computá-la**. Para cada uma das categorias dos **três** arrays em runtime — iterando sobre o array, nunca sobre lista reescrita à mão —, existe um controle que a faz acontecer, e a suíte falha quando falta.

O mecanismo é fail-closed por construção: a fonte da iteração é o array em runtime, de modo que **categoria acrescentada sem controle reprova imediatamente**, sem ninguém precisar lembrar de atualizar uma lista. Forma sugerida, e não imposta: um registro `categoria → controle` conferido contra o array por igualdade de conjunto, com a ausência de entrada sendo falha nomeada que diz **qual** categoria ficou sem controle. Qualquer forma equivalente serve, desde que a iteração venha do array e a falta reprove.

Cada controle, ao ser exercido, afirma que a recusa observada traz **aquela** categoria, mais `arquivo:linha`. Controle que apenas roda sem afirmar a categoria não conta como cobertura e é o mesmo defeito, com outra roupa.

### 2. As oito categorias sem controle ganham controle

As oito nomeadas nos fatos acima passam a ter controle permanente que as faz acontecer sobre árvore sintética, fora da árvore real, cada uma com `arquivo:linha` e a categoria casada. São cinco do vocabulário de atribuição — desestruturação, propriedade de outro objeto, elemento de array, `return new` direto e forma não reconhecida — e três do de ligação de classe: duas declarações homônimas no arquivo da classe, exportação CommonJS, e ligação que atravessa arquivo por forma não seguida.

A lista final é a que a **contagem** exigir no momento da execução, não a que este documento escreveu: se alguma das oito já tiver controle, ou se alguma das dezesseis não tiver, vale o que a contagem mostrar, e a divergência é declarada no relatório.

Se alguma categoria for **inalcançável** por árvore sintética, isso é descoberta de primeira ordem e não desculpa: o relatório diz qual é, por que a leitura nunca a produz, e o item vira resíduo nomeado no documento permanente — nunca "coberto pela igualdade do array", que é exatamente a afirmação que este Goal existe para remover.

### 3. O sub-caso "comentário" ganha controle, e o §3 do Goal047 deixa de ser asserção por nome de variável

Dois itens, da mesma família:

- **Comentário.** A observação 1 do [review047](../reviews/047-review.md): ocorrência exótica do campo escrita dentro de **comentário** não recusa e não conta. Hoje isso é estrutural por `blankComments` e foi verificado ad hoc pelo reviewer. Passa a ter controle permanente, com as duas saídas.
- **Nenhuma saída muda.** A asserção de `assistant.service.test.ts:5731` deixa de depender de **nomes de variável** escritos à mão: a ausência de saída silenciosa passa a ser afirmada de forma **genérica** sobre o texto do módulo — nenhuma ocorrência da forma `=== undefined` seguida de `continue`, qualquer que seja o identificador —, de modo que um `continue` mudo novo com outro nome reprove. As duas frases nomeadas continuam sendo afirmadas.

### 4. Nenhum mecanismo de classificação é alterado

Este Goal **não** muda regra de classificação, não renomeia categoria, não remapeia recusa, não altera ordem de consulta e não afrouxa isenção alguma. `TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`, `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` mantêm o conteúdo da baseline. Se um controle novo revelar que uma categoria **não acontece** onde deveria, isso é achado: entra no relatório com `arquivo:linha`, e a correção mínima que o faça acontecer é permitida e declarada — nunca uma reescrita de mecanismo aproveitando a carona.

### 5. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas sem recusa. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 6. Controle negativo: o próprio mecanismo de cobertura morde

Além dos controles por categoria, o mecanismo de cobertura é ele mesmo exercido, com as **duas** saídas no relatório — antes e depois —, e nenhuma quebra sobra na árvore ao fim.

1. **Categoria sem controle reprova.** Acrescentar temporariamente uma categoria sintética a um dos arrays, sem controle correspondente. Antes deste Goal, o único efeito é a quebra do teste de igualdade por **ordem e conteúdo** da lista literal, que é outra afirmação. Depois: a falha nomeia a categoria descoberta e diz que ela não tem controle.
2. **Controle removido reprova.** Remover temporariamente um controle de categoria existente: a cobertura acusa a categoria órfã, e não passa em silêncio.
3. **Controle vácuo não conta.** Controle que não afirma a categoria observada não satisfaz a cobertura — demonstrado por quebra temporária.
4. **`continue` mudo novo reprova.** Inserir temporariamente uma saída silenciosa da forma `=== undefined` seguida de `continue` com identificador novo: a asserção genérica do escopo §3 quebra, onde a asserção por nome de variável passaria.
5. **O comentário continua não recusando.** As duas saídas, conforme o escopo §3.

### 7. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go algum — nem de produção, nem de teste.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não fecha as observações opcionais herdadas dos reviews 040 e 041 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`): elas erram na direção de resíduo nomeado e ficam para Goal futuro.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não remove nem reescreve teste existente para acomodar o mecanismo novo: acréscimo, salvo o título de `:5500`, que deve deixar de afirmar o que não era verdade.
- Não edita arquivo algum de `tools/ia-loop/`.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 8. Prova

A prova é execução, não leitura. Cada categoria coberta é exercida por teste permanente, e cada controle negativo do escopo §6 aparece no relatório com as duas saídas. Afirmação de cobertura, exaustividade ou classificação que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046 e nas rodadas 1 e 2 do Goal047.

### 9. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-064** no formato de D-054 a D-063, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§25**, sem reescrever §4 a §24; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento e do limite que sobrar. Toda contagem escrita em documento permanente — número de categorias, de controles, de testes, de linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046 e na rodada 2 do Goal047.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A cobertura é computada iterando sobre os **três** arrays em runtime; nenhuma lista de categorias escrita à mão decide o que é coberto — provado por diff e pelo controle 1 do escopo §6.
2. Toda categoria dos três arrays tem controle permanente que a faz acontecer, e o controle afirma a categoria observada mais `arquivo:linha` — provado por execução, categoria a categoria.
3. Categoria acrescentada sem controle **reprova**, nomeando qual ficou descoberta — provado pelo controle 1, com as duas saídas.
4. Controle removido ou vácuo **reprova** — provado pelos controles 2 e 3, com as duas saídas.
5. As oito categorias hoje sem controle passaram a ter um; qualquer divergência entre essa lista e a contagem real está declarada no relatório, e a contagem vence este documento — provado por execução.
6. Categoria porventura inalcançável por árvore sintética está nomeada no relatório e no documento permanente, com o motivo computado, e **não** é declarada coberta pela igualdade do array.
7. O sub-caso "comentário" do critério 3 do Goal047 tem controle permanente, com as duas saídas.
8. A ausência de saída silenciosa é afirmada de forma genérica, sem depender de nome de variável, e um `continue` mudo novo reprova — provado pelo controle 4, com as duas saídas.
9. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação mudou e nenhuma isenção foi afrouxada — provado por diff.
10. O título do teste de `assistant.service.test.ts:5500` deixou de afirmar cobertura que não existia, e a afirmação que sobrar é verdadeira por execução.
11. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
12. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior que **190** e a de `apps/ai-orchestrator` maior que **914** passando, com os mesmos **88** pulados.
13. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
14. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` está intocado.
