# Review formal — Goal 055

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-26, conforme o [Goal055](../goals/055-a-isencao-e-provada-pelo-que-o-descarte-abandona.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–054) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 9 blockers; a rodada 2, com zero.

Os Goals 052 a 054 fizeram do **antecedente** da isenção um cômputo — qual forma descarta, sobre qual domínio o cursor anda. O **consequente** que justificava a isenção ("cada volta avança leitura, nunca descarta candidato") ficou em comentário, e nenhuma asserção o conferia. A observação 1 do [review054](054-review.md) apontou o custo: `function-early-exit` era a forma com mais ocorrências isentas e menos prova por ocorrência. Este diff fecha isso computando, por ocorrência, a região que o descarte abandona e retirando a isenção quando essa região produz saída.

## Escopo e identidade do diff

- Baseline aceita vigente: `0851b3362ced899954a5f19600e2a06944e6a913` (fechamento do Goal054). Base imediata da implementação: `a20db36f2accaaa4344e4ed181261dff20d37687`, HEAD da worktree `.ai-worktrees/goal-055`, inalterado nas duas rodadas.
- Snapshot aceito, calculado pelo IA Loop: **5 arquivos**, hash do diff `a378a635d927928d7eaf60abe5146f7729e8b38e6204574926bc06e5ff1952c7`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Cinco arquivos rastreados**, por `git diff --numstat` contra `a20db36`: `tests/assistant/assistant.service.test.ts` (+3012/−1214, 14236 → **16034** linhas; as deleções grandes são blocos movidos, não testes removidos) e os quatro documentos de `docs/migration/` — `DECISIONS.md` +140, `FINAL_AUDIT.md` +96, `CURRENT_STATE.md` +79, `VALIDATION_GATE.md` +45 —, os quatro por **acréscimo puro**. `FINAL_AUDIT` ganha **§32** sem reescrever §4 a §31; `D-071` entra em `DECISIONS.md`.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` está **intocado** (diff zero; **3887** linhas), e `apps/ai-orchestrator/tests/support/product-transport-routes.txt` também: o conjunto de **10** rotas e o de **27** literais não mudaram.
- Nenhum arquivo de `apps/*/src`, `apps/evolution-go/`, `packages/`, migration ou `tools/ia-loop/` foi tocado. `git status --porcelain=v1 -uall` lista exatamente os cinco arquivos. O artefato não rastreado `wu02-machinery.snippet.ts`, apontado na rodada 1, foi removido.

## Rodada 1 — CHANGES_REQUIRED (9 blockers)

A primeira tentativa de review falhou por harness (`Claude Code 2.1.263 does not support this model`), não por conteúdo; o retry foi autorizado depois de `claude update` para 2.1.283 e da reclassificação da falha como `HARNESS_ERROR`. Nenhum veredito foi emitido na tentativa falha.

O review efetivo da rodada 1 encontrou o Goal quase todo não implementado. Só o WU-01 (região abandonada, escopo §1) tinha entrado no diff, e estava correto. O WU-02 (vocabulário de produção e fecho) terminou `FAILED`/`UNKNOWN_FATAL` sem alterar arquivo rastreado, e os WU-03 a WU-07 ficaram `BLOCKED`. Os gates tinham sido apenas observados sobre árvore incompleta; typecheck, lint, unit e gate falhavam por falta de `prisma generate` na worktree, o que também explicava **158** em vez de **205** arquivos varridos nos testes Goal046/047 — ambiente, não regressão.

Os 9 blockers: escopo §2 (vocabulário de produção), §3 (fecho transitivo), §4 (quinto eixo e resíduo de região não resolvida), §5 (registro das ocorrências desisentadas), §6–§7 (conta única e não-vacuidade), §10 (dez controles negativos), §13 (documentação), remoção de `wu02-machinery.snippet.ts` e prova dos critérios 14–15 sobre árvore completa. Perfil do Developer para a correção: `OPUS_HIGH`.

## Rodada 2 — ACCEPTED

### Verificações próprias do reviewer

- **Os 9 blockers da rodada 1 estão resolvidos.** Conferido no patch contra a worktree, não no relatório do Developer.
- **A região abandonada é computada por forma** (escopo §1). `resolveDiscardAbandonedRegion` (`assistant.service.test.ts:8251`) usa o mesmo texto mascarado que resolve laço, domínio e fronteira de função. A região de `return` começa no fim da instrução, e o controle 5 prova que a expressão do próprio `return` executa. A região sai da forma final, depois da troca por fronteira de função. Região não resolvida entra no resíduo de `findDiscardEnumerationFindings` (`:9815`–`:9834`), ao lado de domínio e fronteira não resolvidos.
- **O vocabulário de produção é fechado e erra para o lado seguro** (escopo §2). `DISCARD_PRODUCING_OPERATIONS` (`:8323`) tem tipo derivado. A varredura reconhece um alfabeto maior (inclui `unshift`, `splice`, `append`): operação fora do vocabulário reprova nomeada e conta como produção na região. Recontado por mim com `node`: `push` **51**, `add` **14**, `set` **5**, e **89** declarações de função em coluna zero.
- **O fecho é computado uma vez** (escopo §3). Vive em `enumerateDiscardAnalysis`, e `enumerateDiscardOccurrences` virou projeção dela — não há segunda varredura. A estabilidade é asserida reaplicando `expandDiscardProducersOnce`, e o caminho até a produtora é nomeado por `discardProducerPath`. Contagens asseridas: **89** funções de módulo, **23** produtoras diretas, **28** pelo fecho. O limite fica no ramo `:8675` e no filtro `:8785`.
- **O quinto eixo só retira isenção** (escopo §4). `resolveSilentDiscardRequirementByFourAxes` mudou só de nome; o corpo é idêntico ao da baseline. O eixo novo só atua quando os quatro eixos isentam uma forma que abandona laço. A asserção ocorrência a ocorrência dá **72** exigidas que continuam exigidas e **0** que passaram de exigida a isenta.
- **O registro cresce com motivo, e a sondagem do Goal estava errada** (escopo §5). A execução desisenta **8** ocorrências, contra **6** da sondagem: as duas a mais (`:1458` e `:1479`, `splitTemplateLiteralParts`) estão declaradas em D-071. `DOCUMENTED_SILENT_DISCARDS` vai de **53** para **57** entradas (4 novas, com `form` na chave). Conferi no código as linhas citadas — `:485`, `:574`, `:1480`, `:1482`, `:1984`, `:2994`, `:3150`, `:3674` —; elas corrigem as linhas erradas da sondagem.
- **Uma conta só, e o que 052–054 provaram continua provado** (escopo §6). O teste §4/§6 reafirma **143** ocorrências — `continue` **120**, `break` **6**, `function-early-exit` **17** —, `byCursorDomain` e `unresolved`/`outsideVocabulary` vazias. O controle 9 do Goal054 (`textualTotal` **120**) continua no arquivo.
- **Vacuidade não é prova** (escopo §7). **8** ramos novos presentes na árvore real e **4** ausentes, estes exercidos por fonte sintética (`producer-call`, região não resolvida, `switch-break`, `nested-function-return`).
- **Os dez controles negativos mostram as duas saídas** (escopo §10). Todos usam fonte em memória, sem árvore temporária — declarado em `CURRENT_STATE`.
- **Nenhum teste removido e nenhuma suíte encolhida**, por execução própria na worktree: `npx vitest run tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator` = **299** testes, **299** passando, **0** falhando (baseline **283**). Três testes do Goal054 foram adaptados para `resolveSilentDiscardRequirementByFourAxes`, não deletados.
- **Nenhum mecanismo de egresso mudou** (escopos §8 e §9). O diff de código só toca a maquinaria de descarte; categorias de recusa, `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` (**2**) e a partição 050/051 seguem idênticas, conferidas pelo controle 10.
- **Documentos por acréscimo, com citação conferível.** As linhas citadas em D-071, `CURRENT_STATE`, `FINAL_AUDIT §32` e `VALIDATION_GATE` (`:8251`, `:8323`, `:8343`, `:8647`, `:8675`, `:8785`, `:8813`, `:9433`, `:10945`, `:11077`, `:11084`) e a contagem de **16034** linhas batem com o arquivo. O parágrafo substituto do `VALIDATION_GATE` registra o fail-open medido nas 8 ocorrências.

### Gates conferidos, e o que aceitei sem prova própria

Reexecutada por mim: a suíte alvo, **299** passando e **0** falhando. **Aceito pelos gates nativos da rodada, sem reexecução minha:** `npx tsc -p tsconfig.json --noEmit` e `npm run lint` (exit 0), `npx vitest run` completo de `apps/ai-orchestrator` (**1111** testes, **1023** passando, **88** pulados, **0** falhando), `npm run test:gate` com **226** testes e 0 falhas, e `validate:core`. `validate:integration` segue com o comportamento herdado (`exit 2`, `BFF_TEST_DATABASE_URL is not set`); nada no diff toca banco ou infraestrutura. Os números da árvore real de egresso — **1** superfície, **4** ligações, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície e **41** ocorrências de `this.http.` — vêm dos testes existentes que a suíte alvo executa, não de asserção nova deste diff.

### Observações não bloqueantes

Nenhuma afrouxa invariante, e nenhuma é condição do aceite.

1. **A decisão 4 de D-071 está sub-declarada.** O ramo `calleeIsModuleFunction === false` também cobre chamada a closure local que grava em coleção capturada (`addBinding` `:1733`, `countOut` `:2145`, `enqueuePrimitive` `:1005`, `reachesFetch` `:3174` em `http-egress-sites.ts`). Para essas, "a única via é o valor devolvido" é falso. Na árvore real elas só aparecem em laço `element-collection`, que os quatro eixos já exigem, ou em região que já tem `push` direto (o laço de `:3404`). Não há fail-open vigente; o limite foi registrado como nota de fechamento em D-071. Candidato a Goal futuro: tratar closure local que captura coleção como produtora.
2. **`function-early-exit` dentro de laço também abandona as voltas seguintes.** D-071 declarava isso só para `break`. A região provada, para as duas formas, é a da volta corrente. Registrado na mesma nota de fechamento.
3. **O teste do escopo §5 mede o motivo substantivo por heurística fraca**: comprimento e presença de `:linha`. Os 4 motivos novos foram julgados substantivos na leitura da rodada 2; o teste não garante isso para o próximo registro.
4. **As observações abertas herdadas continuam abertas**: 2 e 3 do [review054](054-review.md), 3 e 4 do [review053](053-review.md), e as dos reviews 040 e 041. A correção em `tools/ia-loop/lib/deterministic-executor.mjs` segue sem aterrissar em `main`.
5. **A regra do Goal054 §12 segue funcionando**, agora em duas rodadas: toda afirmação de documento que amostrei nomeia saída de execução ou ramo de código. A rodada extra deste Goal veio de implementação incompleta (WU-02 falho), não de prosa.

### O que este aceite não cobre

**A-24 é achado aberto, não corrigido**: continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção foi editado. Este aceite **não** diz que **M4** fechou, que a fidelidade visual está provada, que o comportamento em runtime do serviço Go foi provado, nem qual binário roda em produção. Texto emitido pelo modelo continua fora do guardrail por **D-050**. O conjunto de 10 rotas e o de 27 literais não mudaram. **Não há conservação de candidatos provada dentro das funções de varredura na forma geral**: o eixo 5 prova que a região abandonada de uma ocorrência isenta não contém produção; registrar as 8 ocorrências com motivo diz que o abandono está nomeado e justificado, não que a produção pulada não importava — limite herdado de D-065 a D-070. **`throw` continua fora do alfabeto.** A auditoria segue com **0** `BLOQUEADOR-MVP`, **8** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO`, a mesma contagem de §29 a §31.

### Correções de registro feitas no fechamento

- **D-071 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review e a contagem de rodadas.
- **D-071 ganha nota de fechamento** com as observações 1 e 2: o limite da decisão 4 vale para closure local que grava em coleção capturada, e `function-early-exit` em laço também abandona as voltas seguintes. Nenhum outro texto de D-071 foi reescrito.
- **`FINAL_AUDIT §32`** passa a citar D-071 como `ACCEPTED` neste review, em vez de `PROPOSED`.
- **O status do documento do Goal055 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
