# Review formal — Goal 051

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-22, conforme o [Goal051](../goals/051-a-particao-morde-nos-dois-sentidos.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–050) foi reaberto, reavaliado ou revertido. Cinco rodadas: **CHANGES_REQUIRED** com 2 blockers, **CHANGES_REQUIRED** com 2, **CHANGES_REQUIRED** com 2, **CHANGES_REQUIRED** com 1, e o aceite na quinta, com zero.

O Goal050 tinha trocado conservação afirmada por partição computada por campo, mas a partição mordia de uma mão só: `findEgressPartitionFindings` percorria os **sítios** e, para cada um, conferia presença apenas nos baldes que a categoria roteia; do lado da **entrada**, o que a função cobrava era só que a origem declarada fosse um sítio de fato lido e que o motivo não fosse vazio. Sondagem sobre a baseline achou **10** das **19** entradas dos cinco baldes num balde que a categoria da própria origem não roteia, sem asserção nenhuma sobre elas. Junto disso, o universo de **saída** de `discoverGoServiceHttpRequests` não tinha o tratamento fail-closed que `EGRESS_CANDIDATE_UNIVERSE` já dava ao universo de entrada: o descobridor devolve **7** chaves em runtime, `EGRESS_PARTITION_BUCKETS` nomeava **5**, e as duas restantes ficavam fora sem declaração e sem nada que reprovasse chave nova. Este diff fecha as duas aberturas.

## Escopo e identidade do diff

- Baseline aceita vigente: `07bd259b1f441ca55e8f72e472a81ae7fd6ee1e3` (fechamento do Goal050). Base imediata da implementação: `d9fa56b43b6b8e8ef0992cac56e0471ed7059300`, HEAD da worktree `.ai-worktrees/goal-051`, inalterado nas cinco rodadas.
- Snapshot aceito, calculado pelo IA Loop: **6 arquivos**, hash do diff `764c9b2a3c111fd81ec48146788a252599dfad6af62ce14613cc74ce420f6ffb`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Seis arquivos rastreados**, +1447/−57, conferidos por `git diff --numstat` contra `d9fa56b`: `tests/assistant/assistant.service.test.ts` (+909/−55, 7864 → **8718** linhas), `tests/support/http-egress-sites.ts` (+3/−2, 3886 → **3887** linhas) e os quatro documentos de `docs/migration/` — `DECISIONS.md` +218, `FINAL_AUDIT.md` +143, `CURRENT_STATE.md` +102, `VALIDATION_GATE.md` +72 —, os quatro por **acréscimo puro**: zero deleção, conferido no `numstat`. `FINAL_AUDIT` ganha **§28** sem reescrever §4 a §27; `D-067` está em `DECISIONS.md:2746`.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` está **intocado**: o conjunto de **10** rotas e o de **27** literais continuam idênticos aos da baseline.
- Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/evolution-go/`, `packages/`, migration ou `tools/ia-loop/` foi tocado. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os seis arquivos acima (critérios 13 e 14).
- Inspecionado o patch contra a worktree, não contra o relatório do Developer. Nenhum arquivo foi editado pelo reviewer durante a revisão.

## Rodada 1 — CHANGES_REQUIRED (2 blockers)

1. **Asserção tautológica sem o controle negativo que o escopo §5 e o critério de aceite 6 exigem.** Escolhida a opção "computada do campo `originSite`", existia só a asserção de correspondência: filtrava `requests` cujo `reason` contém "o fetch está em" e conferia `toContain` contra `request.originSite`. Como o `reason` e o campo saíam da **mesma** const `originSite` (`http-egress-sites.ts:2073`–`2081`), a asserção não podia falhar por construção. Faltava o controle negativo que, sobre uma cópia da entrada real, deslocasse a posição e provasse a reprovação com as duas saídas no relatório.
2. **Dois documentos permanentes afirmavam prova que a suíte não exercia** — a mesma classe de defeito que o escopo §10 declara blocker. `DECISIONS.md` (D-067 item 5) e `FINAL_AUDIT.md` (§28) atribuíam a prova da divergência frase/campo ao controle 6 do escopo §8, cujas quatro saídas são sítio perdido, sítio em mais de um balde, origem inventada e motivo vazio — nenhuma delas confere divergência entre o texto do motivo e o campo. No mesmo blocker, três imprecisões a corrigir no mesmo passo: o teste confere `toContain`, não "termina exatamente com"; o controle 7 não escreve árvore de fonte; e a descrição do `git status` final estava errada.

## Rodada 2 — CHANGES_REQUIRED (2 blockers)

Blocker 1 fechado: `requestsWithReasonDivergentFromOriginSite` (`:3466`) virou a conta única, chamada pelo teste permanente (`:3525`) e pelo controle negativo dedicado (`:3547`), que desloca a posição de uma cópia da entrada real e prova a reprovação.

1. **Contagens defasadas nos quatro documentos permanentes.** O teste acrescentado na rodada moveu todos os números e nenhum documento foi atualizado, contra os escopos §10 e §11. Execução minha sobre a worktree final: **951** passando, **88** pulados, **1039** no total; `assistant.service.test.ts` com **227** testes, **8718** linhas, +909/−55. Os documentos ainda diziam **226** testes, **8669** linhas, **860** inserções e **1038**/**950**.
2. **As três imprecisões que o blocker 2 da rodada 1 mandou corrigir "no mesmo passo" continuavam na árvore**; só a atribuição errada de controle tinha sido corrigida.

## Rodada 3 — CHANGES_REQUIRED (2 blockers)

Blocker 1 da rodada 2 fechado: todas as contagens reconferidas por execução própria e corrigidas nos quatro documentos.

1. **Duas afirmações falsas sobre o controle negativo 7** — item (b) do blocker anterior, não corrigido. `DECISIONS.md` (D-067 item 4) se contradizia dentro do mesmo parágrafo, dizendo que a unidade "reaproveita esse controle existente em vez de criar uma segunda árvore sintética" e, duas linhas depois, que o controle 7 prova "sobre outra árvore sintética dedicada"; `FINAL_AUDIT.md` §28 repetia a segunda forma. O teste (`:8551`) não escreve árvore de fonte alguma — sem `makeTempSourceTree`, sem `rmSync`: povoa uma cópia de `bucketsByName` com duas entradas fabricadas e chama `findEgressPartitionFindings` sobre a mesma `egress.sites` da árvore real.
2. **`DECISIONS.md` continuava afirmando que `git status --porcelain=v1 -uall` lista "só os dois arquivos de teste"** — item (c), não corrigido. Lista seis, conferido na worktree. `FINAL_AUDIT` §28 e `VALIDATION_GATE` já descreviam isso corretamente.

## Rodada 4 — CHANGES_REQUIRED (1 blocker)

Os dois blockers da rodada 3 fechados: as duas passagens passaram a descrever baldes fabricados sobre a árvore real lida, sem diretório temporário, e `DECISIONS.md:2933` passou a dizer **6** arquivos.

1. **Citação `arquivo:linha` falsa nos dois documentos novos.** `DECISIONS.md` (D-067 item 4) e `FINAL_AUDIT.md` (§28) diziam "O controle negativo 2 do Goal044 (`:4199`, cenário 'antes')". A linha 4199 está dentro do literal `helperModule` do controle negativo **1** do Goal044 (describe em `:4191`); o controle 2 está no describe de `:4271`, e o cenário "antes" dele é o `it` de `:4314` — é ele que assere `expect(nonTransportMemberCalls).toHaveLength(1)`. O conteúdo da afirmação estava certo; só o ponteiro mandava quem lê para o controle vizinho.

## Rodada 5 — ACCEPTED

### Verificações próprias do reviewer

- **O ponteiro falso foi corrigido** (blocker da rodada 4 fechado). `DECISIONS.md:2826` e `FINAL_AUDIT.md:3535` dizem `:4314`, e nenhuma outra frase, contagem ou seção mudou nesta rodada. Conferido na árvore que `:4314` é de fato o `it` "antes" do controle negativo 2 do Goal044 e `:4191` o describe do controle 1.
- **O encaminhamento por categoria declara as duas mãos** (critério 1). `EgressPartitionCategoryRouting` (`:3049`) com `ownOutput` e `derivedOutput`; `egressPartitionBucketsForCategory` (`:3056`) devolve `[requests, notGoBound]` nos dois conjuntos para as categorias de `fetch` cru e, para `constructor_base_url_*`, `ownOutput: [notGoBound]` com `derivedOutput` nos quatro baldes que a varredura de instanciação povoa (`:3065`–`:3072`). Categoria não encaminhável continua devolvendo `null` e reprovando; nenhum ramo `else` mudo foi introduzido.
- **A partição confere agora o lado da entrada** (critério 2). `findEgressPartitionFindings` ganhou a saída `entriesInBucketNotAllowedByOriginCategory` (`:7758`, computada em `:7791`–`:7837`), que escolhe `ownOutput` quando a entrada ocupa a posição do sítio e `derivedOutput` quando não (`:7818`–`:7819`), e nomeia balde, entrada, origem e categoria. `inMoreThanOneBucket` passou a ser avaliado só sobre `ownOutput` (`:7773`), que é onde "exatamente um" sempre valeu (critério 3). Sobre a árvore real a saída é vazia (`:3340`, `:3396`) — desta vez porque confere as 19 entradas, não porque não olha.
- **O universo de saída está declarado e é fail-closed** (critério 4). `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE` (`:3139`) nomeia as **7** chaves de runtime; o teste de `:3249` confere a declaração contra `Object.keys(discovery)` da execução real e contra `EGRESS_PARTITION_BUCKETS`, com motivo escrito não vazio exigido (`:3220`) para `internalClientSurfaces` e `callerResolutions`, que ficam fora sem virar baldes de destino.
- **Vacuidade por balde declarada ou exercida** (critério 5). `:3483` assere não-vacuidade de `requests`, `notGoBound`, `assembledUrls` e `nonGoBoundInstantiations` e registra `nonTransportMemberCalls` como vazio hoje; o controle 7 (`:8551`) povoa esse balde com entrada de origem permitida (saída verde, `:8580`) e depois com origem não permitida (reprova, `:8598`), usando a mesma conta do controle 1.
- **A frase não pode mais divergir do campo** (critério 6, blocker 1 da rodada 1 fechado). `http-egress-sites.ts` introduziu a const `originSite` (`:2073`) de onde saem o campo e a citação no `reason`; `requestsWithReasonDivergentFromOriginSite` (`:3466`) é a conta única do teste permanente (`:3525`) e do controle negativo (`:3547`). Na árvore real há **1** entrada com motivo dessa forma, a requisição de `health.ts:22`.
- **Os oito controles negativos do escopo §8 estão presentes e mordem**, no describe de `:8239`: `:8279`, `:8320`, `:8387`, `:8410`, `:8432`, `:8476`, `:8551` e `:8604`, cada um com as duas saídas.
- **Contagens reconferidas por execução própria:** `wc -l` = **8718** e **3887**; `git diff --numstat` contra `d9fa56b` = +909/−55, +3/−2 e zero deleção nos quatro documentos; `npx vitest run tests/assistant/assistant.service.test.ts` na worktree = **227** testes, **227** passando, **0** falhando. Todos batem com o que os quatro documentos escrevem.
- **Nenhuma suíte encolheu** (critério 12): **227** testes no arquivo alvo (baseline **215**) e **951** passando em `apps/ai-orchestrator` (baseline **939**), com os mesmos **88** pulados.
- **Nenhum mecanismo de classificação mudou** (critérios 8 a 11), conferido por diff: o diff de `http-egress-sites.ts` é de 3 inserções e 2 deleções, restrito à montagem do motivo da requisição resolvida no chamador. `product-transport-routes.txt` tem diff zero.

### Gates conferidos, e o que aceitei sem prova própria

Reexecutada por mim sobre a árvore final: a suíte alvo, com **227** passando e 0 falhando. **Aceito sem prova própria:** `npx vitest run` completo de `apps/ai-orchestrator` (**1039** testes, **951** passando, **88** pulados), `npx tsc -p tsconfig.json --noEmit` e `npm run lint` (ambos exit 0 no relatório), `npm run test:gate` com **226** testes e 0 falhas — inalterado, ele não exercita este arquivo —, `npm run validate:core` **PASSED** com 15 passos passados e 2 pulados por design (`test:bff`, `test:health-worker`), e `go test ./...` em `apps/evolution-go`, que este diff não poderia afetar por não tocar arquivo Go algum. `validate:integration` continua recusando com `exit 2` e `BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, declarada como ausente, nunca como verde.

### Observações não bloqueantes

Nenhuma delas afrouxa invariante, e nenhuma é condição do aceite.

1. **O ponteiro `:4199` sobrevive no título de um teste.** O blocker da rodada 4 mandou corrigir a citação nos dois documentos permanentes, e foi o que se corrigiu. O nome do `it` de `assistant.service.test.ts:3483` ainda cita `:4199` ao se referir ao cenário "antes" do controle negativo 2 do Goal044, que é `:4314`. É texto de título, não asserção: nada do que o teste prova depende dele, e os documentos permanentes estão certos. Cabe numa limpeza futura, junto com os demais ponteiros de prosa.
2. **As duas chaves fora da partição ainda não têm mordida própria.** `internalClientSurfaces` e `callerResolutions` estão declaradas fora com motivo escrito e conferido, e chave nova reprova — mas nada assere o conteúdo delas. Isso é exatamente o que o escopo §9 do Goal autoriza (motivo declarado, não pertencimento novo); fica registrado como o próximo grau de aperto possível, não como lacuna aberta contra este Goal.
3. **As observações opcionais herdadas continuam abertas** — tipo de parâmetro importado, `text: string | undefined` e `interface X extends Base` dos reviews 040 e 041 —, todas errando na direção de resíduo nomeado.
4. **A observação de harness continua valendo fora desta série:** a correção em `tools/ia-loop/lib/deterministic-executor.mjs` segue sem aterrissar em `main`. Este Goal conviveu com isso escrevendo o `pattern` dos gates relativo ao escopo, mas o laço não foi fechado.
5. **Quatro das cinco rodadas foram gastas em texto de documento, não em mecanismo.** O mecanismo das rodadas 2 a 5 é o mesmo; o que mudou foram contagens, atribuição de controle, descrição do que um teste faz e um ponteiro de linha. É o mesmo padrão dos Goals 045 a 050, e o mesmo ponto de atenção: a prosa dos documentos permanentes é revisada com o mesmo rigor da asserção, e escrevê-la à frente da execução custa rodada.

### O que este aceite não cobre

**A-24 é achado aberto, não corrigido**: continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork foi editado. Este aceite **não** diz que **M4** fechou, que a fidelidade visual está provada, que o comportamento em runtime do serviço Go foi provado, nem qual binário roda em produção. `whatsmeow-lib/` continua fora do alcance. Texto emitido pelo modelo continua fora do guardrail por **D-050**. O conjunto de 10 rotas e o de 27 literais não foram ampliados nem reduzidos. **Não há conservação de candidatos provada dentro das funções de varredura**: a partição prova conservação **entre o descobridor e os baldes de saída**, e um `continue` sem guarda de valor ausente, ou dentro de bloco com outra instrução antes, continua fora de alcance — limite herdado de D-065/D-066, não afrouxado. `internalClientSurfaces` e `callerResolutions` ganharam motivo declarado para estarem fora da partição, não pertencimento novo. A enumeração de `findSilentDiscardLines` continua cobrindo só descarte guardado por valor ausente na forma idiomática reconhecida, com as mesmas **5** entradas.

### Correções de registro feitas no fechamento

- **D-067 passa de `PROPOSED` a `ACCEPTED`**, com a referência a este review e a contagem de rodadas.
- **O status do documento do Goal051 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
