# Review formal — Goal 061

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal061](../goals/061-a-importacao-longa-nao-depende-de-uma-requisicao.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–060 e 070) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 5 blockers; a rodada 2 terminou com zero.

O Goal corrige **QA IM-03** (ALTA), **QA IM-07** (ALTA), **QA IM-04** (MÉDIA), **QA IM-08** (MÉDIA) e **QA IM-05** (BAIXA) da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. Análise e execução da importação passam a começar numa requisição curta (`202`) e a terminar no processo do Scheduling, coordenadas só pelo lease do banco. A análise ganha lease e exclui a execução pelo estado. A tela lê o preview gravado, acompanha o andamento e relê o estado antes de declarar falha ([D-078](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `355ff9282b8947c37f897dd9b987ccca444b5c07` (fechamento do Goal060). Base imediata da implementação: `7623009a447fe8cf662cab5c93d1a3fd71cc5189`, HEAD da worktree `.ai-worktrees/goal-061`, inalterado nas duas rodadas. O commit `7623009` é só documental (fechamento do 060 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **36 arquivos**, hash do diff `336e080e690aed3f132c25a3891693c39e5613961cc7b2776770171ecea6056e`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Trinta e um arquivos rastreados**, por `git diff --numstat 7623009`:
  - `apps/scheduling-service/src/`: `app/build-app.ts` (+16/−1), `modules/internal-api/routes.ts` (+138/−33), `modules/migrations/import-completion-service.ts` (+14/−1), `import-execution-service.ts` (+104/−8), `import-lease.ts` (+195/−2), `import-preview-service.ts` (+357/−26) e `index.ts` (+13/−0).
  - `packages/public-api-contract/src/`: `routes.ts` (+5/−4) e `schemas.ts` (+53/−1).
  - `apps/bff/`: `PUBLIC_API_V1.md` (+23/−8), `src/clients/scheduling/index.ts` (+89/−23), `src/modules/migrations/routes.ts` (+35/−14) e `tests/goal010-import-routes.integration.test.ts` (+27/−54, asserções da resposta síncrona trocadas pela de início).
  - `apps/frontend/src/`: `data/services/BffMigrationService.ts` (+26/−6), `features/imports/ImportPreviewScreen.tsx` (+293/−66), `ImportRunScreen.tsx` (+89/−14), `labels.ts` (+62/−0) e `types.ts` (+4/−2).
  - Testes existentes de `apps/frontend/tests/` ajustados à resposta de início e à leitura do preview: `goal010-import-schema.test.ts`, `goal020-a11y.test.tsx`, `goal020-import-conflicts.test.tsx`, `goal020-import-preview.test.tsx`, `goal020-import-run.test.tsx`, `goal020-imports-entry.test.tsx`, `goal020-reachability.test.tsx`, `goal020-schema.test.ts` e `goal020-shell-invariant.test.tsx`.
  - Os quatro documentos de `docs/migration/`, por acréscimo puro no diff aceito: `CURRENT_STATE.md` +133, `FINAL_AUDIT.md` +136, `DECISIONS.md` +32 e `VALIDATION_GATE.md` +25.
- **Cinco arquivos novos**: `apps/scheduling-service/tests/integration/goal061-import-async.test.ts` (**754** linhas, os **13** casos do §7.1 contra PostgreSQL real, com origem travada pelo teste), `apps/scheduling-service/tests/unit/goal061-import-async.test.ts` (**621** linhas) e `goal061-import-read.test.ts` (**456** linhas), do §7.2; `apps/bff/tests/goal061-import-async.integration.test.ts` (**242** linhas, §7.3); e `apps/frontend/tests/goal061-import-async.test.tsx` (**750** linhas, **32** testes na execução final, §7.4).
- Nenhum arquivo foi tocado em `apps/ai-orchestrator/`, `apps/evolution-go/`, `tools/ia-loop/`, migrations ou schema Prisma. Em `packages/`, só `public-api-contract`. `INTERNAL_HTTP_TIMEOUT_MS`, o `rewrites` do Next, `IMPORT_LEASE_TTL_SECONDS` e os timeouts do cliente da origem não mudaram. A conexão com a origem (D-077), a leitura da origem, a classificação de itens, os conflitos e a conclusão não mudaram. `QA_LOCAL_REVIEW.md` não foi editado.

## Rodada 1 — CHANGES_REQUIRED (5 blockers)

O backend estava correto e foi verificado contra PostgreSQL real em `validate:integration` já na rodada 1. Ele não mudou depois dela:

- início curto `202` sem tocar a origem, nem para o token;
- lease da análise, com exclusão mútua em relação à execução;
- estado de partida exato, capturado antes da reivindicação e exigido no `WHERE`;
- fencing por `leaseOwner` e `ANALYZING` no primeiro `UPDATE` da transação final da análise;
- renovação do lease durante a leitura da origem;
- falha do trabalho com código de conjunto fechado e mensagem fixa;
- espera dos trabalhos em curso no `onClose`;
- preview lido do banco, `interrupted` pelo relógio do banco e isolamento por tenant.

O contrato, o BFF, `PUBLIC_API_V1.md` (inclusive a linha 76, observação 1 do [review060](060-review.md)), D-078 e a nota em D-008 também estavam corretos. O controle negativo 3 foi adaptado com justificativa: o teste de `replace` não isola o `leaseOwner`, porque `replace` também muda o estado; um teste de tomada do lease depois do último heartbeat isola.

Os cinco blockers:

1. **Escopo §11 violado.** Uma unidade de diagnóstico editou `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` para subir de 42 para 43 a contagem congelada de `this.http.` em `apps/bff/src/clients/`. Pedido: reverter o arquivo e manter 42 ocorrências fazendo `mutate` delegar a `mutateWithStatus`.
2. **§6, "Incerteza não é falha", incompleto.** O início da análise (`startAnalysis`) e a retomada (`retryPending`) mostravam erro em qualquer falha, sem reler o estado.
3. **Reinício mascarado pela fase derivada.** Depois de "Tentar de novo" ou "Continuar" aceito com `202`, a fase derivada de `session.lastError`/`session.interrupted` vencia a fase local. A tela seguia em "Análise indisponível" ou "Análise interrompida" durante toda a análise, e um novo clique recebia `IMPORT_SESSION_LEASE_HELD`.
4. **§6/IM-08, códigos sem texto.** `FAILED_REASON_LABELS` só traduzia `IMPORT_SERVICE_MAPPING_MISSING`. Os outros cinco códigos de falha de item que a execução grava caíam no texto genérico.
5. **Documentação escrita antes da execução final.** CURRENT_STATE, VALIDATION_GATE e FINAL_AUDIT §39 deixavam `validate:core` e `validate:ui` "para WU-06 a WU-19", afirmavam uma releitura do estado que não existia no início da análise e omitiam a edição em `apps/ai-orchestrator/`. Pedido: rodar de novo os controles 5 e 6 depois da última edição e reescrever as seções com a execução final.

## Rodada 2 — ACCEPTED (0 blockers)

- **B1:** `git diff 7623009 -- apps/ai-orchestrator` vem vazio. A contagem de `this.http.` em `apps/bff/src/clients/` é **42**. `mutate` delega a `mutateWithStatus`, e existe uma única chamada a `requestWithStatus`. O comportamento é o de antes: `request` já delegava a `requestWithStatus`, sem retry para `POST`. `test:ai-orchestrator` passa sem alterar o teste.
- **B2:** o `catch` de `startAnalysis` relê `getImportState` e só mostra erro quando nada mudou. `retryPending` relê o estado e compara com o último progresso. Os testes jsdom cobrem `NETWORK_ERROR` e `UPSTREAM_ERROR` 5xx nos dois caminhos, cada um com um caso que avançou e um sem início.
- **B3:** o reinício pedido pelo dono anula a fase derivada até a tela receber a sessão relida em `ANALYZING`. Um `test.each` com `lastError` e com `interrupted` cobre o caso, com o `202` ainda pendente.
- **B4:** `FAILED_REASON_LABELS` tem texto leigo para os seis códigos da evidência §7 do Goal. Código desconhecido cai no texto genérico.
- **B5:** as seções do Goal061 foram reescritas por acréscimo, com zero remoções em `docs/`. Não resta referência a WU pendente. A reversão em `apps/ai-orchestrator/` está registrada, e a conferência humana está declarada como não feita. Os controles 5 e 6 e quatro controles das correções rodaram de novo depois da última edição de código, com a saída colada em FINAL_AUDIT §39.

Prova conferida na árvore final (os 14 gates nativos da rodada 2 passaram):

- `typecheck` e `lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`: exit 0 nos seis.
- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`. Dentro dele: `test:scheduling-service` **32** arquivos e **448** testes (baseline **30**/**410**); `test:frontend` **78** arquivos e **750** testes (baseline **77**/**718**); `test:gate-scripts` **233**/**233** (baseline **233**).
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos. `test:scheduling-integration` roda **13** arquivos e **103** testes, inclusive os **13** do §7.1. `test:bff-integration` roda **48** arquivos e **386** testes. `rehearse:goal033-authenticated-ui` roda **65** testes: **65** expected, **0** unexpected, **0** flaky.
- O revisor rodou de novo `goal061-import-async.test.tsx`, `goal020-import-preview` e `goal020-import-run`: **61**/**61**.
- Nenhuma suíte encolheu.

### Observações não bloqueantes

1. **O ramo `IMPORT_PREVIEW_STALE` de `runExecution` é inalcançável hoje.** O preview obsoleto é detectado no início da execução, antes do `202`, e recusado com `409` como antes. O ramo fica como defesa, sem teste que o alcance pelo caminho real.
2. **`IMPORT_SOURCE_INVALID_RESPONSE` usa o mesmo texto da falha interna** na tela. O conjunto fechado distingue os dois; a tela não.
3. **`goal061-import-async.test.tsx` tem isolamento fraco entre casos**, como o próprio relatório da WU-05 registrou.
4. **Se o início da execução foi aceito, mas as duas releituras do estado falham, `handleExecute` mostra erro.** É o caso de três falhas de transporte seguidas.
5. **Reanálise que falha numa sessão `READY` com preview esconde o preview antigo** atrás de "Análise indisponível".
6. **Nova tentativa que falha de novo com o mesmo código, antes da releitura, mostra o texto genérico** em vez do texto da classe.
7. **O vermelho da baseline dos testes `goal061` não foi colado.** A prova de que os testes pegam o defeito vem dos controles negativos do §8, não de uma execução contra `7623009`.
8. **As observações abertas herdadas continuam abertas**: as do [review070](070-review.md), a 4 do [review059](059-review.md) e as do [review060](060-review.md), exceto a 1. A observação 1 do review060 (`PUBLIC_API_V1.md:76`) foi resolvida neste diff: a linha diz `400 VALIDATION_ERROR` e que o contrato não usa mais `409 INTEGRATION_WRITES_NOT_SUPPORTED`.

### O que este aceite não cobre

- Não prova que a análise e a importação de uma conta real terminam e que a tela acompanha até o fim. A conferência humana do §9, com a conta de teste de U-05, **não foi feita**.
- Não prova largura, toque, contraste, foco nem movimento das telas de importação: `/importacao` segue fora do gate renderizado.
- Não prova fidelidade visual ao protótipo aprovado (conferência humana, Goal069).
- Não retoma sozinho trabalho de instância que cai; a retomada depende de alguém pedir "Continuar" (limite declarado da D-078).
- Não cobre a lista completa de clientes, a disponibilidade substituída, o telefone normalizado nem o preço zero (Goal062).
- Nenhum achado A-01…A-24 foi corrigido ou reclassificado. A auditoria segue com **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §39](../FINAL_AUDIT.md)).

### Correções de registro feitas no fechamento

- **D-078 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review, a contagem de rodadas e uma nota de fechamento. A decisão não mudou.
- **FINAL_AUDIT §39** passa a citar D-078 como `ACCEPTED`.
- **CURRENT_STATE**: o título do delta Goal061 passa a citar D-078 como `ACCEPTED`. O FATO do Goal010 sobre as sete rotas de importação ganha nota: o Goal061 acrescenta a leitura do preview e muda o início de `analyze` e `execute` para `202`.
- **VALIDATION_GATE** (seção Goal061): o link para o delta de CURRENT_STATE acompanha o título atualizado.
- **TARGET_ARCHITECTURE** (Importação única) ganha nota do Goal061: a análise também é coordenada por lease, e o início é curto.
- **O status do documento do Goal061 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
