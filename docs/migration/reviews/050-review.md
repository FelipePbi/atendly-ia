# Review formal — Goal 050

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-22, conforme o [Goal050](../goals/050-a-conservacao-e-provada-por-construcao.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–049) foi reaberto, reavaliado ou revertido. Três rodadas: **CHANGES_REQUIRED** com 3 blockers, **CHANGES_REQUIRED** com 2 blockers, **ACCEPTED** com 0.

O Goal não fechava fail-open de mecanismo de produto: o Goal049 já havia ligado a categoria de recusa ao controle que a declara. O que sobrava era um nível acima — a asserção que prova que nenhum sítio de egresso é descartado em silêncio (`assistant.service.test.ts:2953`–`2975` na baseline, escrita no Goal043) decidia que um sítio "virou requisição" por uma disjunção cujo segundo ramo era `request.reason.includes(position)`, substring de prosa livre. O ramo era portante: a requisição resolvida no chamador só se ligava ao sítio de origem pela frase do motivo, e a requisição do cliente HTTP interno não carregava origem alguma. Este diff troca a conservação afirmada por uma **partição computada por campo**.

## Escopo e identidade do diff

- Baseline aceita vigente: `1027e2aabbbb4aaf116c48243da3a7407ecd42ad` (fechamento do Goal049). Base imediata da implementação: `1d38dc721e91a7347fc164bb18b3dc148227b838`, HEAD da worktree `.ai-worktrees/goal-050`, inalterado nas três rodadas.
- Snapshot aceito, calculado pelo IA Loop: **6 arquivos**, hash do diff `2e464e1c7d2335f704826080a5dff2815ba2669c9445fea3a3f622e00c69b669`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Seis arquivos rastreados**, +1389/−55, conferidos por `git diff --numstat` contra `1d38dc7`: `tests/assistant/assistant.service.test.ts` (+818/−54, 7100 → **7864** linhas), `tests/support/http-egress-sites.ts` (+26/−1, → **3886** linhas — a primeira vez desde o Goal047 que este arquivo tem diff não-zero) e os quatro documentos de `docs/migration/` — `DECISIONS.md` +228, `FINAL_AUDIT.md` +156, `CURRENT_STATE.md` +108, `VALIDATION_GATE.md` +53 —, os quatro por **acréscimo puro**: zero deleção, conferido no `numstat`. `FINAL_AUDIT` ganha **§27** sem reescrever §4 a §26; `D-066` está em `DECISIONS.md:2498`.
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` está **intocado**: o conjunto de **10** rotas e o de **27** literais continuam idênticos aos da baseline.
- Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/evolution-go/`, `packages/`, migration ou `tools/ia-loop/` foi tocado. Nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os seis arquivos acima (critérios 15 e 16).
- Inspecionado o patch contra a worktree, não contra o relatório do Developer. Nenhum arquivo foi editado pelo reviewer durante a revisão.

## Rodada 1 — CHANGES_REQUIRED (3 blockers)

1. **Documento permanente afirmava conservação mais forte do que a suíte exerce.** Os quatro documentos escreviam a partição como propriedade geral — "cada sítio termina em exatamente um dos cinco baldes" —, mas `egressPartitionBucketsForCategory` roteia `constructor_base_url_*` só para `notGoBound`, tornando `landed.length > 1` inalcançável para essa categoria. Sondagem própria com `tsx` sobre `discoverHttpEgressSites`/`discoverGoServiceHttpRequests` mostrou `internal-http-client.ts:83 [constructor_base_url_requestBinary]` originando entradas em **quatro** baldes ao mesmo tempo. A exceção existia no código e não existia em documento nenhum.
2. **Os controles negativos 1 a 4 e 7 exercitavam uma segunda implementação da mesma conta**, `findEgressPartitionFindings`, enquanto a asserção publicada tinha lógica inline independente. Neutralizar o `return` do auxiliar fazia falhar só os controles, com a asserção real verde — crédito por cópia, a mesma família de defeito que o Goal existe para remover.
3. **O controle 7 era vácuo** (`expect(entry.reason.trim().length > 0).toBe(false)` sobre entrada construída com motivo vazio: tautologia), e o controle 6 afirmava só `has(key) === false`, sem exercitar a mensagem com `arquivo:linha` que o escopo §8.6 exige.

## Rodada 2 — CHANGES_REQUIRED (2 blockers)

Blockers 2 e 3 fechados e reconferidos na árvore: o teste permanente passou a chamar `findEgressPartitionFindings` (implementação única, a mesma dos controles), e `findSilentDiscardFindings` virou a conta única do teste permanente e dos controles 6 e 7.

1. **Blocker 1 cumprido só pela metade.** A metade documental estava feita e correta — os quatro documentos passaram a declarar que "exatamente um balde" é dentro do subconjunto de `egressPartitionBucketsForCategory`. Faltava a metade computada: nenhuma asserção exercia a afirmação. Ela era verdadeira na árvore, mas prosa não exercida, que o escopo §10 do Goal classifica como blocker.
2. **Contagem defasada em documento permanente.** `DECISIONS.md` e `FINAL_AUDIT.md` diziam **7800** linhas em `assistant.service.test.ts`; `wc -l` devolvia **7811**. As demais contagens conferiam e foram deixadas intactas.

## Rodada 3 — ACCEPTED

### Verificações próprias do reviewer

- **A exceção declarada agora reprova se o dado mudar** (blocker 1 fechado). Teste permanente novo em `assistant.service.test.ts:3137`, dentro do describe de conservação: filtra os sítios `constructor_base_url_*` e exige `length > 0`; computa `dualMembership` (`originSite` em `notGoBound` **e** em `requests|assembledUrls|nonGoBoundInstantiations|nonTransportMemberCalls`) e exige `> 0`; e reconfere que a mesma `findEgressPartitionFindings` de `:3099` devolve `inMoreThanOneBucket === []`. Sondagem independente minha com `tsx` na worktree confirma o dado: **10** entradas ficam fora do subconjunto roteado, todas de `internal-http-client.ts:83 [constructor_base_url_requestBinary]` (requests ×7, nonGoBoundInstantiations ×2, assembledUrls ×1), mais `notGoBound` ×1 do mesmo sítio e ×1 de `:149`. A exceção está apontada com `:3137` nos quatro documentos.
- **A origem do sítio é campo, não frase** (critério 1). `HttpEgressSiteOrigin` (`Pick<ClassifiedHttpEgressSite, "filePath" | "line">`) e o campo `originSite` foram acrescentados a cinco interfaces de saída de `http-egress-sites.ts`, preenchidos nos **8** sítios de `push` — inclusive a requisição resolvida no chamador e o cliente HTTP interno, que na baseline não tinha origem alguma. O ramo `reason.includes(position)` foi removido. Nenhuma regra de classificação, categoria, ordem de consulta ou isenção mudou (critério 12, conferido por diff).
- **A partição reprova nos quatro sentidos** (critérios 2 a 5), e o universo de candidatos é declarado e fail-closed (critério 6): `EGRESS_CANDIDATE_UNIVERSE` nomeia as cinco coleções de `HttpEgressDiscovery` e é conferido contra `Object.keys(egress)`; `sites` e `genericEgressPrimitives` entram na partição, `excluded`, `genericEgressCallers` e `genericEgressCallersByPrimitive` ficam de fora com motivo escrito. Coleção nova que o descobridor produza e a declaração não nomeie reprova.
- **Motivo vazio reprova nos cinco baldes e no registro** (critério 7), no precedente de `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` de D-064.
- **O registro de descarte deixou de ser chaveado por linha** (critérios 8 e 9). A chave é trecho normalizado mais a função de nível superior que o envolve, fail-closed nos dois sentidos de antes mais uma terceira saída: chave ambígua reprova. As **5** entradas continuam as mesmas da baseline. O alcance declarado do Goal049 não foi ampliado.
- **`NO_REFUSAL_CATEGORY` ganhou sítio de uso real** (`:179`–`:197`, critério 10), em vez de ser removido.
- **Os oito controles negativos do escopo §8 estão presentes e mordem** (`:7504`, `:7558`, `:7594`, `:7636`, `:7673`, `:7712`, `:7734`, `:7780`), cada um com as duas saídas no relatório.
- **Contagens reconferidas por execução própria** (blocker 2 fechado): `wc -l` = **7864** e **3886**; `git diff --numstat` = +26/−1 no arquivo de suporte e zero deleção nos quatro documentos; `npx vitest run` na worktree = **1027** testes, **939** passando, **88** pulados, **0** falhando. Todos batem com o que os quatro documentos escrevem. Nenhuma ocorrência de `7800`, `7811` ou **214** sobrou.
- **Árvore real inalterada** (critério 13), asserida pela suíte permanente que passou: **1** superfície, **4** ligações resolvidas, **205** arquivos varridos, **10** rotas, **2** instanciações fora do transporte, **0** chamadas de membro fora da superfície, e as **41** ocorrências de `this.http.` em `apps/bff/src/clients/` classificadas sem nenhuma recusa.
- **Nenhuma suíte encolheu** (critério 14): **215** testes no arquivo alvo (baseline 204) e **939** passando em `apps/ai-orchestrator` (baseline 928), com os mesmos **88** pulados.

### Gates conferidos, e o que aceitei sem prova própria

Reexecutados por mim sobre a árvore final: a suíte alvo, com **215** passando e 0 falhando; a suíte completa de `apps/ai-orchestrator`, com **1027** testes, **939** passando e **88** pulados; e `npm run test:gate` com **226** testes e 0 falhas, inalterado — ele não exercita este arquivo. **Aceito sem prova própria:** `npx tsc -p tsconfig.json --noEmit` e `npm run lint` (ambos exit 0 no relatório), `npm run validate:core` **PASSED** com 15 passos passados e 2 pulados por design (`test:bff`, `test:health-worker`), e `go test ./...` em `apps/evolution-go` — que este diff não poderia afetar, por não tocar arquivo Go algum. `validate:integration` continua recusando com `exit 2` e `BFF_TEST_DATABASE_URL is not set`: pré-condição ausente, declarada como ausente, nunca como verde.

### Observações não bloqueantes

Nenhuma delas afrouxa invariante, e nenhuma é condição do aceite.

1. **A partição não reprova entrada fora do subconjunto roteável da sua categoria.** `findEgressPartitionFindings` (`:7447`) só itera os baldes roteáveis da categoria, então uma entrada de sítio `env_var_*` que aparecesse em `assembledUrls` passaria verde hoje. A sondagem mostra que nenhum sítio de outra categoria está nessa condição na árvore real, e o limite está declarado com honestidade em `VALIDATION_GATE.md` e em D-066 item 2 — não há afirmação falsa em documento permanente. É aperto de mordida, não correção de mentira, e cabe num Goal seguinte com controle negativo próprio.
2. **A frase do motivo continua duplicando o que o campo agora prova.** O `reason` da requisição resolvida no chamador ainda carrega `o fetch está em ${site.filePath}:${site.line}`; é texto para gente ler, não mais dado de prova, mas nada impede que os dois divirjam.
3. **As observações opcionais herdadas continuam abertas** — tipo de parâmetro importado, `text: string | undefined` e `interface X extends Base` dos reviews 040 e 041 —, todas errando na direção de resíduo nomeado.
4. **A observação de harness continua valendo fora desta série:** a correção em `tools/ia-loop/lib/deterministic-executor.mjs` segue sem aterrissar em `main`. Este Goal conviveu com isso escrevendo o `pattern` dos gates relativo ao escopo, mas o laço não foi fechado.

### O que este aceite não cobre

**A-24 é achado aberto, não corrigido**: continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork foi editado. Este aceite **não** diz que **M4** fechou, que a fidelidade visual está provada, que o comportamento em runtime do serviço Go foi provado, nem qual binário roda em produção. `whatsmeow-lib/` continua fora do alcance. Texto emitido pelo modelo continua fora do guardrail por **D-050**. O conjunto de 10 rotas e o de 27 literais não foram ampliados nem reduzidos. Sobretudo: **este aceite não diz que há conservação de candidatos provada dentro das funções de varredura**. A partição prova conservação **entre o descobridor e os baldes de saída**; um `continue` sem guarda de valor ausente, ou dentro de bloco com outra instrução antes, continua fora de alcance. E a partição é verificada **dentro do subconjunto de baldes que a categoria roteia**, não sobre os cinco em conjunto — ver observação 1.

### Correções de registro feitas no fechamento

- **D-066 passa de `PROPOSED` a `ACCEPTED`**, com a referência a este review e a contagem de rodadas.
- **O status do documento do Goal050 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
