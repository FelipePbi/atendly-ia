# Review formal — Goal 041

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-21, conforme o [Goal041](../goals/041-o-canal-unico-e-provado.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–040) foi reaberto, reavaliado ou revertido. Cinco rodadas: quatro `CHANGES_REQUIRED` — 5, 2, 1 e 1 blocker — e o aceite na quinta, com zero blockers.

O Goal existia para fechar as duas frases que o aceite do Goal040 declarou como não cobertas: *"canal computado não é canal único provado"* e *"a cadeia de trânsito para em um elo"*. A primeira virou enumeração computada de **todo** sítio de egresso HTTP das duas árvores de produção, com o egresso genérico fail-closed pelos seus chamadores; a segunda virou percurso transitivo até raiz classificada, com ciclo reportado em vez de silenciado. Os dois resíduos declarados do [review040](040-review.md) também fecharam. O risco nomeado no enunciado — **descobrir demais** — não se materializou: sonda de saúde, transcrição, chamada a serviço interno e recuperação de senha saem em categoria própria, e o resíduo sobre a árvore real é zero.

Os blockers da série dividiram-se em duas famílias. O da rodada 1 é o mesmo dos Goals 036 a 040: **reconhecimento decidido por nome em vez de forma**. Os das rodadas 2 a 4 são de outra natureza, e novos nesta série: **documentação afirmando um conjunto de arquivos que não era o da árvore**, em laço com o harness.

## Escopo e identidade do diff

- Baseline aceita vigente: `9709b1ac2f2de7d338344845a0b4b78d6a3aea93` (implementação do Goal040). Base imediata da implementação: `3e277e7ff244eb8c0d73d35b745d7aacc41b6d46` (fechamento do Goal040), HEAD da worktree `.ai-worktrees/goal-041`, inalterado nas cinco rodadas.
- Snapshot aceito, calculado pelo IA Loop: **9 arquivos**, hash do diff `ebf660e3eb743cf61751acd5ea7b333ff56ad6417c88c8b47fecad183d0be551`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **ai-orchestrator (camada de teste)** 3 arquivos — `tests/support/http-egress-sites.ts` **novo e não rastreado** (976 linhas), `tests/support/send-text-sites.ts` (+1040/−77) e `tests/assistant/assistant.service.test.ts` (+366/−1); **documentação** 4 arquivos em `docs/migration/` (`CURRENT_STATE.md` +157, `DECISIONS.md` +22, `FINAL_AUDIT.md` +241, `VALIDATION_GATE.md` +40); **harness** 2 arquivos em `tools/ia-loop/` (+63/−1), como desvio declarado e dispensado — ver rodada 3.
- **Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou** — conferido por `git status --porcelain=v1` contra a base, que lista exatamente os 8 modificados e 1 não rastreado do snapshot. Nenhuma migration, nenhum `schema.prisma`, `packages/public-api-contract/` intocado, nenhuma rota, verbo ou campo novo ou removido, nenhuma tela, componente, texto de interface ou CSS, nenhum prompt e nenhuma versão de template. `scripts/final-production-audit.mjs`, `scripts/validate-integration.mjs`, os dois `playwright.*.config.ts`, `scripts/lib/playwright-report.mjs`, `scripts/validate-ui.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` não aparecem no diff. A única linha removida de `assistant.service.test.ts` é um import; nenhum teste foi removido, renomeado, pulado ou condicionado.
- Inspecionado o patch completo contra a worktree, não contra o relatório do Developer — `http-egress-sites.ts` lido direto da árvore, por ser arquivo novo fora do diffstat. Os pontos decisivos foram verificados **executando os artefatos nomeados** sobre árvores sintéticas montadas em scratchpad, via `tsx`, nas rodadas 1 a 3. Nenhum arquivo de código foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (5 blockers)

1. **Allowlist por nome de arquivo no descobridor de egresso.** `GENERIC_EGRESS_PRIMITIVE_FILE = join("lib", "http.ts")` com `endsWithPath` fazia `discoverHttpEgressSites` **pular inteiramente** qualquer arquivo cujo caminho terminasse em `lib/http.ts`, nas duas árvores. Provado por execução: o mesmo conteúdo com prosa ao número da cliente saía `SITES: []` em `lib/http.ts` e `product_prose_to_client_number` em `lib/outro.ts` — classificação decidida pelo nome, o que o §1 e o critério 4 declaram blocker. Consequência colateral: o `8` afirmado no teste só fechava porque um sítio era pulado; a árvore real tem **nove**.
2. **`tools/ia-loop/lib/deterministic-executor.mjs` alterado dentro do diff**, contra §5 e o critério 15.
3. **Documentação afirmando o que o código não fazia:** VALIDATION_GATE dizia "todo sítio ... nunca por nome de arquivo ou pasta" com o blocker 1 aberto, e D-057 copiou do Goal a contagem de quatro `fetch(` em `ai-orchestrator/src` em vez de declarar a divergência com a árvore — são cinco, porque a lista de fatos do Goal omitia `EvolutionProvider.ts:172`.
4. **Controles 1 a 3 sem as duas saídas:** o relatório usava a árvore final íntegra como "baseline" (64 testes), não a baseline aceita `9709b1ac` (55). Árvore final verde não prova que a cegueira era real.
5. **`validate:integration` nem executado nem declarado como pré-condição ausente** (§6, critério 25).

## Rodada 2 — CHANGES_REQUIRED (2 blockers)

Quatro blockers da rodada 1 fecharam, com prova executada por mim: a allowlist sumiu (`discoverHttpEgressSites` sobre as duas árvores devolveu 9 sítios, `EXCLUDED []`, `CALLERS 0`, com `lib/http.ts:32` classificado como egresso genérico e o nome do primitivo computado da declaração); a documentação passou a 9 sítios e declarou a divergência com a lista de fatos do Goal; os controles 1 a 3 ganharam a saída da baseline real; e `validate:integration` foi executado, recusando com `exit 2` por `BFF_TEST_DATABASE_URL` ausente.

1. **`tools/ia-loop/` voltou ao diff — e agora com dois arquivos.** FIX-001 reverteu, FIX-002 alterou de novo.
2. **Três trechos de FINAL_AUDIT §18 e de CURRENT_STATE afirmavam que `tools/ia-loop/` não aparecia no diff**, o que era falso.

## Rodada 3 — CHANGES_REQUIRED (1 blocker), e a dispensa

O laço ficou visível: revertido o executor, o gate `targeted-tests` (WU-09) reprova com `No test files found, exiting with code 1`, o orchestrator dispara unidade de diagnóstico, e ela reintroduz a correção. Aconteceu na rodada 2 e de novo na 3. **Dispensei a proibição de §5 e do critério 15 para esses dois arquivos**, por D-018, com precedente em [D-048](../DECISIONS.md) (review033): a correção é de harness, corrige bug real (`unit.pattern` chega raiz-relativo e o prefixo do escopo é resolvido uma segunda vez sob `ACTION_CWD.SCOPE`), não tem efeito em produto nem em gate de produto, e é coberta por teste próprio. Exigir a reversão pela terceira vez reproduziria o laço sem convergir.

O blocker único da rodada passou a ser documental: registrar o conjunto real de arquivos e o desvio declarado, **sem reverter nada**.

## Rodada 4 — CHANGES_REQUIRED (1 blocker, repetido)

Nenhuma das cinco correções documentais da rodada 3 foi escrita — `git diff --stat -- docs/` era idêntico ao da rodada anterior. Em vez disso, a rodada reverteu pela terceira vez os dois arquivos de `tools/ia-loop/`, exatamente o que a rodada 3 proibira por escrito, e a unidade de diagnóstico os reintroduziu. O blocker foi repetido com o texto literal dos três trechos falsos, seus números de linha, e a instrução de que a rodada seguinte editasse **somente** documentação.

## Rodada 5 — ACCEPTED

### Verificações próprias do reviewer

- **O conjunto de arquivos nos documentos é o da árvore.** FINAL_AUDIT §18 (bullet do `git status`, 2184-2202, e "Veredito recontado", 2305-2308) e CURRENT_STATE delta041 (3650-3660 e 3757-3785) nomeiam os cinco arquivos de trabalho e os quatro documentos, sem afirmar que a reversão persistiu. Conferido no texto, não no relatório.
- **O desvio de harness está registrado como desvio.** Mecanismo (`scopeRelativePattern`, `deterministic-executor.mjs:56`, usada em `runDeterministicAction:84`), motivo, natureza e cobertura (`node --test tools/ia-loop/tests/deterministic-executor.test.mjs`, 12 pass / 0 fail, reexecutado por mim) estão em §18, no delta041 e em D-057, com o precedente D-048 citado. O Status de D-057 cobre as rodadas 2 a 4.
- **O descobridor de egresso decide por forma.** `http-egress-sites.ts` não tem allowlist por arquivo, pasta, cliente, URL ou função; o destino sai de `env.<NOME>`, de campo `this.<x>` vindo do construtor ou de parâmetro resolvido nos chamadores; o primitivo genérico é reconhecido pela forma e seu nome é computado da declaração que o contém. A única exclusão reconhecida é `method_call_not_global_fetch`, asserida como lista **vazia** contra a árvore real. Sobre as duas árvores: **9** sítios, resíduo **zero**, **1** em `product_prose_to_client_number` (`EvolutionProvider.ts:73`), **0** chamadores de `fetchJson`.
- **A cadeia de trânsito termina em raiz nomeada.** `followTransitChain` itera sobre todas as fontes da árvore a cada elo, sem profundidade máxima, com `visited` por `arquivo::função::parâmetro`, para em `SendTextChainRootKind` e reporta `cycle` como raiz **e** em `chain.cycles`, sem sumir com o ramo; forma não reconhecida vira erro com arquivo e linha. As 2 cadeias do Goal040 terminam com resíduo zero, com os 5 chamadores de segundo elo nomeados (`ActivationTestAiDriver.ts:203`; `ActivationTestService.ts:604`, `:608`, `:653`, `:679`).
- **Reversão dos controles negativos conferida:** `git status --porcelain=v1` lista exatamente os 8 modificados e 1 não rastreado do snapshot, sem quebra e sem artefato não declarado.
- **A documentação foi escrita depois da última mudança de árvore** — o diff da rodada 5 é só documentação — e descreve o conjunto real de arquivos: D-057 no formato das anteriores, FINAL_AUDIT §18 nova e datada sem reescrever §4 a §17, seção nova em VALIDATION_GATE e delta041 em CURRENT_STATE, sem afirmar M4 fechado, fidelidade visual provada ou verificação de resposta em produção.

### Gates conferidos nesta rodada, e o que aceitei sem prova própria

Reexecutados por mim na worktree: `npx vitest run tests/assistant/assistant.service.test.ts` com cwd `apps/ai-orchestrator` → **66 passed (66)**, acima do piso de 55 da baseline; `node --test tools/ia-loop/tests/deterministic-executor.test.mjs` → 12 pass / 0 fail; `npm run test:gate` → **226 pass, 0 fail**; `npm run validate:core` → `PASSED`, 15 passos com 2 skips declarados (`test:bff`, `test:health-worker`).

**Aceito sem prova própria:** o gate `targeted-tests` (WU-09) segue `FAILED` no harness — falha de caminho no executor do IA Loop, não do código sob review —, com a execução manual acima como prova equivalente; WU-10 a WU-12 ficaram `OBSERVED` sobre árvore que não mudou depois, e reexecutei `test:gate` e `validate:core` eu mesmo. `validate:integration` recusa com `exit 2` por `BFF_TEST_DATABASE_URL` ausente, declarado como pré-condição ausente e nunca como verde. As duas saídas de cada controle negativo pertencem ao relatório das rodadas; o que confirmei na árvore é o estado revertido e o comportamento nomeado de cada invariante nos testes que o exercitam.

## Observações não bloqueantes

- **A correção do executor só existe na worktree.** `tools/ia-loop/lib/deterministic-executor.mjs` do repositório principal não tem `scopeRelativePattern`; até ela ser integrada, `targeted-tests` reprova em toda rodada futura com `No test files found`. É infraestrutura do IA Loop, fora do escopo do Goal041.
- **`git-diff-check` (WU-12) não decide o que seu objetivo promete.** Saiu `exit 0` com os dois arquivos de `tools/ia-loop/` modificados: a ação é `git diff --check`, que só verifica whitespace, e nunca poderia decidir conjunto de arquivos.
- **O descobridor reconhece apenas `fetch(`.** Não há `axios`, `undici` nem `node-fetch` em `apps/ai-orchestrator/src` nem em `apps/bff/src` hoje, então não é buraco atual; o limite ficou registrado em [VALIDATION_GATE](../VALIDATION_GATE.md) no fechamento.
- **As três observações opcionais do [review040](040-review.md) continuam abertas:** tipo de parâmetro importado de outro arquivo, `text: string | undefined` e `interface X extends Base`. Todas erram na direção correta — resíduo nomeado, nunca classificação silenciosa.

## O que este aceite não cobre

- **`apps/evolution-go/` continua fora do alcance do descobridor.** Nada aqui prova que o serviço Go não compõe texto próprio antes de repassar ao WhatsApp real. Limite declarado em [D-057](../DECISIONS.md) e em [VALIDATION_GATE](../VALIDATION_GATE.md), não achado: nenhuma violação real foi observada.
- **Egresso único é fato lido da árvore a cada execução, não trava estática.** A regra impede que um canal novo passe despercebido quando a suíte roda; ela não impede que ele exista entre uma execução e outra.
- **O guardrail continua valendo sobre texto próprio do produto**, não sobre texto emitido pelo modelo: `assistant_decision_text` fica fora de `VERIFIED_CLIENT_TEXTS` por [D-050](../DECISIONS.md), fronteira que este Goal não reabre.
- **A cadeia de trânsito é lida dentro de `apps/ai-orchestrator/src` e não além.** A chamada real em `tests/security/platform-credential-isolation.test.ts` fica fora por estar fora da raiz de leitura, não por marca de "é teste" no código.
- **A verificação de resposta continua sem rodar em produção**, por [D-051](../DECISIONS.md), que este Goal não reabre.
- **M4 — envio real a número real — continua aberto** como gate operacional. Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para WhatsApp real.
- **Fidelidade visual à referência aprovada** continua sendo conferência humana, como nos reviews [033](033-review.md) a [040](040-review.md). `flaky` continua não reprovando nos dois gates renderizados e `retries: 1` continua inalterado.
- **Os demais achados abertos.** A-04 a A-08, A-11 a A-17 e A-19 não foram corrigidos, reclassificados nem tocados; nenhum achado fechado foi reaberto; nenhum achado novo a partir de A-24 entrou, porque nenhum arquivo de produção foi tocado. O veredito de [FINAL_AUDIT §18](../FINAL_AUDIT.md) segue **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
