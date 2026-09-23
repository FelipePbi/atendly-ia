# Goal 053 — O critério da isenção é o domínio percorrido: laço que itera elementos deixa de ser isento pela forma sintática do cabeçalho

**Status: ACCEPTED** no [review053](../reviews/053-review.md), rodada 3 de 3 (2026-09-22; as rodadas 1 e 2 fecharam `CHANGES_REQUIRED`, com 3 e 2 blockers). Preparado em 2026-09-22 pelo Tech Lead Agent após [Goal052 ACCEPTED](../reviews/052-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 053 nasce na [v74 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 052, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `2adb7cabf2cc09707287e1d440d6041b51d6cfe9`

Goal anterior: 052 — O descarte é enumerado por inteiro: `continue` fora da forma reconhecida deixa de ser isento em silêncio

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal052 já integrado em `main` (origem `0eb5867fa38735d33f59b2f70fbf86dc12989226`), com `enumerateContinueOccurrences` em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:7488`, `classifyContinueLoopForm` em `:7325`, `CONTINUE_LOOP_FORMS` em `:6991`, `CONTINUE_CANDIDATE_LOOP_FORMS` em `:7880` e `enumerateSilentDiscardOccurrences` em `:7896`. **Duas rodadas:** uma `CHANGES_REQUIRED` com 2 blockers e o aceite na segunda, com zero. **D-068** foi aceita e [FINAL_AUDIT §29](../FINAL_AUDIT.md) escrita sem reescrever §4 a §28. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Os Goals 048 a 052 removeram, um nível de cada vez, a prova creditada por prosa. O 052 foi o mais fundo: a isenção do descarte de candidato deixou de ser silêncio e virou **classe computada** do laço contenedor, com resíduo zero sobre a árvore real.

O que sobrou é o degrau seguinte, e está medido nesta baseline, não previsto: **classe computada não é o mesmo que critério computado.** A classe que isenta mede a **forma sintática do cabeçalho**, não o que o laço **percorre**. Medir forma e chamar isso de leitura posicional é a mesma família de defeito de antes, só que dentro de um mecanismo que já passa verde.

### Abertura 1 — `for-indexed` é qualquer `for` com `;`, e isso já isenta descarte real

`classifyContinueLoopForm` (`:7325`) termina o ramo de `for` com `if (normalized.includes(";")) return { form: "for-indexed" … }`. Qualquer cabeçalho de três cláusulas cai na classe isenta, sem olhar o que o cursor percorre. `CONTINUE_CANDIDATE_LOOP_FORMS` (`:7880`) não contém `for-indexed`, então nenhuma dessas ocorrências exige motivo registrado.

A observação 1 do [review052](../reviews/052-review.md) apontou o alargamento e o classificou como risco futuro, dizendo que não havia fail-open hoje. **Há**, e a causa da divergência é uma só: o review contou `lines` como cursor de leitura. Sondagem própria nesta baseline, sobre `apps/ai-orchestrator/tests/support/http-egress-sites.ts`:

- `:1139` — `for (let index = 0; index < lines.length; index += 1)` em `readEnvSchemaDefault`, com `lines` vindo de `source.split(…)`. Cada volta é **uma linha candidata**. Os `continue;` de `:1141` e `:1143` descartam a linha.
- `:1155` — o mesmo laço em `readEnvFileValue`, com os `continue;` de `:1157`, `:1159` e `:1160`.
- `:3869` — o mesmo laço em `readProductTransportRoutesFile`, com o `continue;` de `:3872`.

São **6** ocorrências que descartam candidato exatamente como um `for…of` descartaria, hoje isentas por classificação. Duas delas (`:1141` e `:1143`) até têm entrada em `DOCUMENTED_SILENT_DISCARDS`, herdada da baseline — mas com `requiresRegistration` computado em `false`, de modo que remover a entrada **não reprova**. A amarra está solta nas duas pontas: a ocorrência não é exigida, e a entrada não é conferida.

### Abertura 2 — `while-positional-read` é qualquer `identificador < qualquer coisa`

`WHILE_POSITIONAL_READ_CONDITION` (`:7321`) aceita cursor escalar à esquerda e **qualquer coisa** à direita. É a observação 2 do review052: `while (i < pending.length)` com `pending.splice(i, 1)` é isento pelo critério declarado, embora cada volta consuma um candidato. Na árvore real as **5** ocorrências dessa classe (`:1458`, `:1484`, `:2989`, `:2996`, `:2999`) são genuinamente posicionais, então aqui a prova tem de vir de **fonte sintética** — a vacuidade não isenta.

### Abertura 3 — o que falta é o domínio, e ele é computável

A distinção certa não está no cabeçalho: está no **domínio que o cursor percorre**. Um cursor sobre uma sequência de caracteres avança leitura; um cursor sobre uma coleção de elementos itera candidatos. E o domínio é computável do texto do módulo, com evidência nomeada — `lines` vem de `source.split(…)` e é coleção de elementos; `source`, `text` e `content` são `string`; `computeQuoteMask(source, uptoIndex)` devolve `boolean[]` construído com `new Array<…>(uptoIndex)` (`http-egress-sites.ts:318`), uma posição por caractere, paralela à string.

### O que este Goal não é

Não é ampliação de alcance de produto, não corrige achado de auditoria e não prova conservação de candidatos **dentro** das funções de varredura. Ele troca **isenção pela forma do cabeçalho** por **isenção pelo domínio percorrido, resolvido por evidência nomeada, com resíduo reprovando**. É o precedente do Goal046 e do Goal052 aplicado ao critério que sobrou dentro do próprio Goal052.

## Dependências e contexto mínimo

- Goals 001 a 052 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review052](../reviews/052-review.md): as **observações 1 e 2** são a origem direta deste Goal. A correção de registro sobre a observação 1 — há fail-open na árvore, e as duas entradas de `readEnvSchemaDefault` não são leitura posicional — está em [MIGRATION_STATUS](../MIGRATION_STATUS.md) e **não** reabre o aceite do 052. A seção "O que este aceite não cobre" continua valendo inteira: **A-24 é achado aberto, não corrigido**, e **não** há conservação de candidatos provada dentro das funções de varredura.
- [DECISIONS](../DECISIONS.md): **D-068** (`DECISIONS.md:2975`), **D-067**, **D-066**, **D-065** e **D-056** são os precedentes diretos. **D-050** continua valendo: texto emitido pelo modelo está fora do guardrail.
- [FINAL_AUDIT §28 e §29](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o parágrafo que o Goal052 escreveu sobre o critério de isenção por classe de laço. É esse limite que este Goal estreita. O registro é por **acréscimo**; não se apaga texto anterior.
- [AGENTS.md](../../../AGENTS.md): o guardrail de produto.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.
- **Graphify:** dispensável. Os pontos de implementação estão nomeados abaixo com arquivo e linha.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números e posições abaixo vêm de leitura dirigida e de sondagem própria sobre esta baseline. **A enumeração por execução é a que vale:** divergência é **declarada no relatório e na decisão nova**, e o número computado vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041, na rodada 1 do Goal042, na rodada 1 do Goal043, nas rodadas 1 e 2 do Goal044, nas rodadas 1 a 3 do Goal045, na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050, nas rodadas 2 e 3 do Goal051 e na rodada 1 do Goal052.

- Máquina vigente em `assistant.service.test.ts`: `silentDiscardKey` em `:6499`; `buildSilentDiscardRegistry` em `:6503`, lançando em chave duplicada dentro do registro; `DOCUMENTED_SILENT_DISCARDS` em `:6517`, com **43** entradas; `resolveEnclosingTopLevelFunctionName` em `:6816`; `findSilentDiscardFindings` em `:6858`, com as quatro saídas `ambiguousKeys`, `unregistered`, `obsolete` e `emptyReason`; `SilentDiscardEntry.multiplicity` em `:6490`; `CONTINUE_LOOP_FORMS` em `:6991`, com **7** formas; `CONTINUE_LEXICAL_CONTEXTS` em `:7004`; `WHILE_QUEUE_DRAIN_CONDITION` em `:7317`; `WHILE_POSITIONAL_READ_CONDITION` em `:7321`; `classifyContinueLoopForm` em `:7325`; `findContinueLoopSpans` em `:7371`; `enumerateContinueOccurrences` em `:7488`; `findContinueEnumerationFindings` em `:7553`, com `total`, `byContext`, `byLoopForm`, `unresolved`, `outsideVocabulary` e `nonCode`; `CONTINUE_CANDIDATE_LOOP_FORMS` em `:7880`; `enumerateSilentDiscardOccurrences` em `:7896`; os oito controles negativos do Goal052 no `describe` de `:10195`, em `:10202`, `:10237`, `:10263`, `:10311`, `:10328`, `:10354`, `:10380` e `:10476`.
- **Árvore real, por execução do Goal052 e conferida no review:** `http-egress-sites.ts` tem **3887** linhas e **120** ocorrências de `continue;`, que se reconstroem por classe — **41** `for-of` + **55** `for-indexed` + **18** `while-exec-match` + **5** `while-positional-read` + **1** `while-queue-drain` = **120**. `unresolved` e `outsideVocabulary` são vazias; `for-in` e `do-while` são vazias na árvore e exercidas por sintético. A classe portadora de candidato tem **60** ocorrências, cobertas por **43** entradas com multiplicidades reais de 7, 6, 5 e 2.
- **Sondagem própria desta passada, a ser reconferida por execução:** `http-egress-sites.ts` tem **19** cabeçalhos de `for` de três cláusulas (`:141`, `:189`, `:220`, `:320`, `:355`, `:390`, `:420`, `:458`, `:514`, `:602`, `:1139`, `:1155`, `:1654`, `:2373`, `:2826`, `:3058`, `:3339`, `:3348`, `:3869`). Três deles percorrem `lines`, coleção de elementos: `:1139`, `:1155` e `:3869`, com as **6** ocorrências de `continue;` em `:1141`, `:1143`, `:1157`, `:1159`, `:1160` e `:3872`. Os demais percorrem `source`, `text`, `content` ou máscara paralela indexada por posição de caractere (`quoteMask: boolean[]`, construída em `computeQuoteMask` com `new Array<string | undefined>(uptoIndex)` em `:318`). O cabeçalho de `:3058` não percorre domínio algum e **não contém** `continue;`; se a execução mostrar o contrário, o relatório diz como foi resolvido.
- As duas entradas de `readEnvSchemaDefault` em `DOCUMENTED_SILENT_DISCARDS` (`:6525` e `:6531`) existem, têm motivo escrito e hoje não são exigidas por nada, porque a ocorrência correspondente tem `requiresRegistration` `false`.
- **Chave por número de linha continua proibida.** O Goal050 removeu o chaveamento por linha, e o controle de deslocamento do Goal052 (`:10354`, 200 linhas inseridas) existe para provar que deslocamento não reprova em massa. Ele continua tendo de passar.
- Contagens da baseline, para comparar depois: `assistant.service.test.ts` com **249** testes e **10553** linhas; `http-egress-sites.ts` com **3887** linhas; suíte completa de `apps/ai-orchestrator` com **973** passando e **88** pulados, em 1061; `npm run test:gate` com **226 pass, 0 fail**; `validate:core` exit 0 com 17 passos (15 passados, 2 pulados por design: `test:bff` e `test:health-worker`).
- Resultado da árvore real na baseline, a ser reproduzido inalterado: **1** superfície (`InternalHttpClient`, `apps/bff/src/clients/internal-http-client.ts:19`, forma `named`), **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- Na baseline, `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, nunca verde.
- **A correção de harness continua fora de `main`.** `tools/ia-loop/lib/deterministic-executor.mjs:67` monta `argv` com `unit.pattern` cru, e `cwd` já é `worktree/unit.scope`. Consequência prática e única para este Goal: o `pattern` de um gate `targeted-tests` tem de ser escrito **relativo ao escopo** (`tests/assistant/assistant.service.test.ts`, nunca `apps/ai-orchestrator/tests/...`). Este Goal **não** edita `tools/ia-loop/`; nenhuma dispensa anterior se estende.
- Máquina já existente, para **reuso** e não para reescrita: `enumerateContinueOccurrences`, `findContinueLoopSpans`, `enumerateSilentDiscardOccurrences`, `findSilentDiscardFindings`, `buildSilentDiscardRegistry`, `findContinueEnumerationFindings`, `expectRefusal` e a escrita de árvore temporária com `rmSync` em `finally`. **Uma conta só, chamada pelo teste permanente e pelos controles** — implementar a mesma conta duas vezes foi o blocker 2 da rodada 1 do Goal050.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — o grosso do diff: a resolução de domínio, o critério de isenção, o registro ampliado, o teste permanente e os controles negativos.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — **intocado**, salvo se a execução provar que uma ocorrência só pode ser classificada mudando o código de varredura. Se isso acontecer, é **descoberta**, entra no relatório com `arquivo:linha` e justificativa, e o diff daquele arquivo fica restrito a ela. Nenhuma regra de classificação, nenhuma categoria, nenhuma ordem de consulta e nenhuma isenção de egresso mudam ali.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` — **intocado**.
- `apps/evolution-go/` — **intocado**, sem exceção.
- `tools/ia-loop/` — **intocado**, sem exceção.

## Escopo obrigatório

### 1. Cada ocorrência ganha um domínio percorrido, computado

Além da classe de laço que o Goal052 já computa, cada ocorrência em contexto de código recebe um **domínio percorrido**, resolvido do texto do módulo, em vocabulário fechado. As classes mínimas, que a execução pode ampliar ou renomear se a árvore exigir — com o relatório dizendo o quê e por quê:

- **sequência de caracteres** — o cursor indexa um valor que a resolução prova ser `string` no próprio texto (parâmetro anotado `: string`, leitura `readFileSync(…, "utf8")`, resultado de `.slice(` ou `.join(`, literal de string, ou outra evidência nomeada);
- **máscara paralela** — o cursor indexa um arranjo cujo comprimento é declarado a partir do comprimento de uma sequência de caracteres, de modo que cada posição é uma posição de caractere (`computeQuoteMask` / `new Array<…>(uptoIndex)` é o caso concreto da árvore);
- **coleção de elementos** — o cursor indexa uma coleção cujos elementos são candidatos (`lines` vindo de `source.split(…)` é o caso concreto da árvore);
- **sem domínio** — o laço não indexa nada, se a árvore contiver essa forma.

A resolução é **computada, nunca declarada por lista de nomes de variável escrita à mão**: uma allowlist de identificadores (`source`, `text`, `content`) seria a mesma prosa com outro tipo. A evidência que concedeu o domínio é **registrada por ocorrência** e verificável.

### 2. A isenção passa a depender do domínio, e resíduo reprova

`requiresRegistration` deixa de ser lido só de `CONTINUE_CANDIDATE_LOOP_FORMS` e passa a combinar classe de laço **e** domínio percorrido:

- **sequência de caracteres** e **máscara paralela** são isentas, porque o critério do item 1 as produziu;
- **coleção de elementos** exige motivo registrado, na mesma coleção única e com o mesmo fail-closed nos três sentidos do Goal050/052: não registrada reprova, entrada sem ocorrência reprova como obsoleta, motivo vazio reprova;
- ocorrência cujo domínio a resolução **não resolve** **reprova**, nomeando `arquivo:linha` e o motivo de não ter resolvido. Nenhum ramo `else` mudo, nenhum domínio "desconhecido" que passe. Domínio fora do vocabulário declarado também reprova.

As classes já portadoras de candidato no Goal052 (`for-of`, `while-exec-match`, `while-queue-drain`) continuam exigindo registro **independentemente** do domínio: este Goal só aperta, nunca afrouxa. Se a combinação de classe e domínio isentar algo que hoje exige registro, isso é **blocker**, não simplificação.

### 3. As seis ocorrências sobre `lines` passam a exigir motivo

Na árvore real, as ocorrências de `:1141`, `:1143`, `:1157`, `:1159`, `:1160` e `:3872` — o número e as linhas conferidos por execução, não copiados daqui — passam a exigir registro, e cada uma ganha motivo escrito substantivo, que diga **o que é descartado e por que o descarte não perde candidato que importe**. As duas entradas já existentes de `readEnvSchemaDefault` são **reaproveitadas**, não duplicadas, e passam a ser conferidas de verdade: removê-las tem de produzir `unregistered`. Multiplicidade é conferida como o Goal052 estabeleceu, sem voltar a chavear por linha.

### 4. `while` posicional é conferido pelo mesmo critério

O cursor de um `while` só é isento se o domínio que ele percorre for **sequência de caracteres** ou **máscara paralela** pelo mesmo cômputo do item 1. A forma `while (i < pending.length)` com consumo de elementos deixa de ser isenta pela forma do cabeçalho. Na árvore real as **5** ocorrências continuam isentas porque o domínio as isenta; a prova do inverso é por **fonte sintética**.

### 5. Vacuidade não é aceita como prova

Cada domínio do vocabulário declarado tem **uma** das duas coisas, e o relatório diz qual e por quê: ou tem ocorrência na árvore real e a não-vacuidade é asserida com contagem, ou é vazio na árvore real e o comportamento sobre ele é exercido por **fonte sintética** que o povoa. Declarar domínio em prosa sem uma das duas é a mesma classe do blocker 1 da rodada 2 do Goal050 e do blocker 1 da rodada 1 do Goal052.

### 6. Uma conta só, e o que o Goal052 provou continua provado

A resolução de domínio entra **dentro** do caminho já existente (`enumerateContinueOccurrences` → `enumerateSilentDiscardOccurrences` → `findSilentDiscardFindings`), nunca como segunda varredura paralela. Depois da mudança continuam valendo, por execução e sem afrouxamento: o total de **120** ocorrências computado em runtime e conferido contra contagem textual independente; a soma por classe reconstruindo o total; `unresolved` e `outsideVocabulary` vazias sobre a árvore real; `byContext.code` igual ao total de código; a ausência de número escrito à mão no comentário de alcance; a multiplicidade declarada; e o controle de deslocamento de 200 linhas. Teste do Goal052 que asserir `requiresRegistration` por classe é **adaptado** ao critério novo, nunca removido.

### 7. Nenhum mecanismo de classificação de egresso é alterado

Este Goal **não** muda regra de classificação de egresso, não renomeia categoria, não remapeia recusa, não altera ordem de consulta, não altera o critério de nenhuma das 9 categorias vistas na árvore e não afrouxa isenção alguma. Os três vocabulários de recusa, `TYPE_POSITION_PRECEDING_CHARS`, `TYPE_POSITION_PRECEDING_WORDS`, `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` mantêm o conteúdo da baseline. `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` continua com as duas entradas e continua conferido nos dois sentidos. A cobertura das **24** categorias continua computada a partir dos arrays em runtime e continua passando. `EGRESS_PARTITION_BUCKETS`, `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE`, `EGRESS_CANDIDATE_UNIVERSE` e `egressPartitionBucketsForCategory` mantêm conteúdo e comportamento.

### 8. O conjunto continua provado, e o real continua intocado

Depois das mudanças, sobre as árvores reais: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` classificadas sem recusa. `product-transport-routes.txt` não muda. Se algum desses números mudar, a mudança é **descoberta**, não conserto: entra no relatório com `arquivo:linha`, é justificada pela árvore e prevalece sobre este documento.

### 9. Controle negativo: as amarras mordem

Cada item aparece no relatório com as **duas** saídas — antes e depois — e nenhuma quebra sobra na árvore ao fim. Cada controle chama **a mesma conta** que o teste permanente chama; segunda implementação da mesma conta foi blocker na rodada 1 do Goal050.

1. **`continue;` em `for` de três cláusulas sobre coleção de elementos reprova quando não registrado.** Sobre a árvore real: remover a entrada de uma das seis ocorrências do escopo §3 produz `unregistered` nomeando a linha. Antes do diff, a mesma remoção não produzia nada.
2. **`continue;` em `for` de três cláusulas sobre sequência de caracteres continua isento**, e a mesma guarda movida para um `for` sobre coleção de elementos passa a exigir registro — as duas saídas, por fonte sintética.
3. **`while (i < pending.length)` com consumo de elementos reprova**, e `while (i < body.length)` sobre string continua isento — as duas saídas, por fonte sintética, fechando a observação 2 do [review052](../reviews/052-review.md).
4. **Domínio não resolvido reprova**, nomeando `arquivo:linha` e o motivo, em vez de isentar; domínio fora do vocabulário declarado também reprova.
5. **Entrada registrada que perde a ocorrência reprova** como obsoleta, e motivo vazio reprova; o registro continua lançando em chave duplicada dentro de si.
6. **Deslocamento de linha continua não reprovando em massa** — o controle do Goal052 na forma nova, com a mesma prova.
7. **Nada do Goal052 foi afrouxado:** uma ocorrência que já exigia registro por classe de laço continua exigindo, mesmo que o domínio a isentasse — as duas saídas.
8. **A partição do Goal050/051 e a cobertura do Goal049 continuam mordendo.** Entrada em balde não permitido pela categoria da origem, chave nova no universo de saída, e categoria órfã na cobertura: uma cada, com as duas saídas.

### 10. O que este Goal não pode fazer

- Não corrige **A-24**, não o reclassifica e não edita arquivo Go algum — nem de produção, nem de teste.
- Não reabre, não reverte e não reescreve o aceite do Goal052 nem o [review052](../reviews/052-review.md). A correção de registro já está em [MIGRATION_STATUS](../MIGRATION_STATUS.md); aqui ela é **usada como evidência**, não reaplicada.
- Não amplia nem reduz o conjunto de 10 rotas ou o de 27 literais.
- Não toca `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/scheduling-service/`, `apps/health-worker/`, `packages/`, migration, `schema.prisma`, prompt, copy, rota, verbo ou campo.
- Não edita arquivo algum de `tools/ia-loop/`. O `pattern` dos gates é escrito relativo ao escopo, que é o que a árvore de `main` exige.
- Não resolve domínio por **lista de nomes de variável** escrita à mão, nem por heurística de indentação, nem por nome de função.
- **Não prova conservação de candidatos dentro das funções de varredura.** Registrar um descarte com motivo escrito diz que ele está nomeado e justificado; não diz que o candidato descartado não importava. Esse limite continua declarado, herdado de D-065/D-066/D-067/D-068, e não é afrouxado por este Goal.
- Não amplia a enumeração para `return`, `break` ou saída antecipada de função: o alcance continua sendo `continue;`.
- Não substitui a leitura textual por parser de TypeScript, não acrescenta dependência em nenhuma das duas línguas e não cria módulo paralelo ao `http-egress-sites.ts`.
- Não remove nem reescreve teste existente para acomodar o mecanismo novo: acréscimo, migração de assinatura e atualização de igualdade profunda, não deleção de caso. Os oito controles do Goal052 (`:10202`, `:10237`, `:10263`, `:10311`, `:10328`, `:10354`, `:10380`, `:10476`) são **adaptados**, nunca removidos.
- Não fecha as observações opcionais herdadas dos reviews 040 e 041 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`): elas erram na direção de resíduo nomeado e ficam para Goal futuro.
- Não declara **M4** fechado, fidelidade visual provada nem runtime do serviço Go provado.

### 11. Prova

A prova é execução, não leitura. Cada amarra é exercida por controle negativo com as duas saídas no relatório, e cada afirmação escrita em documento permanente é conferida contra a execução final. Afirmação de conservação, exaustividade, partição, classificação ou domínio que a suíte não exerceu é blocker, como foi na rodada 1 do Goal045, na rodada 1 do Goal046, nas rodadas 1 e 2 do Goal047, na rodada 1 do Goal048, nas rodadas 1 e 2 do Goal050, na rodada 1 do Goal051 e na rodada 1 do Goal052.

### 12. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-069** no formato de D-054 a D-068, em `PROPOSED`; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§30**, sem reescrever §4 a §29; [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) ganham o registro do fechamento, o vocabulário de domínios do escopo §1, o critério de isenção do escopo §2 e o alcance que continua fora do escopo §10. O parágrafo que o Goal052 escreveu em `VALIDATION_GATE` sobre isenção por classe de laço é **substituído por acréscimo**: o texto anterior não é apagado, e o parágrafo novo diz o que passou a valer e desde quando, inclusive que a isenção por classe sozinha era fail-open medido sobre **6** ocorrências. Toda contagem escrita em documento permanente — ocorrências por classe e por domínio, entradas do registro, testes, linhas — é conferida contra a execução final antes de ser escrita: foi blocker na rodada 1 do Goal046, na rodada 2 do Goal047, na rodada 1 do Goal048, na rodada 2 do Goal050, na rodada 2 do Goal051 e na rodada 1 do Goal052. Escrever a prosa **depois** da execução final, nunca à frente dela.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Cada ocorrência de `continue;` em contexto de código tem um **domínio percorrido** computado do texto, em vocabulário fechado, com a evidência que o concedeu registrada por ocorrência — provado por diff e por execução.
2. A isenção de registro passou a depender do domínio: **coleção de elementos** exige motivo registrado, **sequência de caracteres** e **máscara paralela** são isentas por critério computado, e domínio não resolvido ou fora do vocabulário **reprova** nomeando `arquivo:linha` — provado pelos controles 2, 3 e 4, com as duas saídas.
3. As ocorrências de `for` de três cláusulas sobre coleção de elementos na árvore real — **6** na sondagem, o número final vindo da execução — exigem registro e têm motivo escrito substantivo, com as duas entradas de `readEnvSchemaDefault` reaproveitadas e agora conferidas de verdade — provado pelo controle 1.
4. Nada que o Goal052 exigia deixou de ser exigido: toda ocorrência de `for-of`, `while-exec-match` e `while-queue-drain` continua exigindo registro — provado pelo controle 7.
5. A resolução de domínio não usa lista de nomes de variável escrita à mão, nem indentação, nem nome de função — provado por diff.
6. Cada domínio declarado tem não-vacuidade asserida com contagem ou tem o comportamento exercido por fonte sintética, com o relatório dizendo qual e por quê — provado por execução.
7. O total de **120** ocorrências continua computado em runtime, a soma por classe continua reconstruindo o total, `unresolved` e `outsideVocabulary` continuam vazias sobre a árvore real, e deslocamento de linha continua não reprovando em massa — provado pelo controle 6 e pelos testes permanentes do Goal052 adaptados.
8. A conta é uma só: a resolução de domínio entra no caminho existente e nenhuma segunda varredura de `continue;` foi criada — provado por diff.
9. A partição do Goal050/051 e a cobertura das **24** categorias do Goal049 continuam reprovando, com as **2** inalcançáveis descontadas pelo registro conferido nos dois sentidos — provado pelo controle 8.
10. Nenhuma categoria existente foi renomeada, nenhuma recusa foi remapeada, nenhuma regra de classificação de egresso mudou e nenhuma isenção de egresso foi afrouxada — provado por diff.
11. A árvore real produz os mesmos **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte e **0** chamadas de membro fora da superfície, com as **41** ocorrências de `this.http.` classificadas sem recusa — provado por execução sobre a árvore real.
12. Nenhum teste foi removido e nenhuma suíte encolheu: a contagem final de `assistant.service.test.ts` é maior ou igual a **249** e a de `apps/ai-orchestrator` maior ou igual a **973** passando, com os mesmos **88** pulados.
13. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados.
14. Nenhum arquivo Go, nenhum de `apps/*/src/`, nenhum de `packages/`, nenhum de `tools/ia-loop/` e nenhuma migration foram tocados; `product-transport-routes.txt` e `http-egress-sites.ts` estão intocados, salvo descoberta declarada no relatório conforme "Pontos de implementação".
