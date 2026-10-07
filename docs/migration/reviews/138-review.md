# Review formal — Goal 138

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal138](../goals/138-os-valores-malformados-da-origem-nao-derrubam-a-revisao-da-importacao.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review `DEEP`, sem blocker; nenhuma correção de registro ficou para o fechamento.

Um valor de duração ou de preço malformado da origem deixa de derrubar a revisão da importação. A duração de serviço que não é inteiro positivo de minutos passa a ser duração desconhecida, sem arredondar, e o preço negativo passa a ser preço não informado. A regra vale na análise, em `proposedService`, na divergência, na execução e no retrato do serviço no atendimento. A rota de itens aplica a regra de `importProposedServiceSchema` na leitura, inclusive aos itens gravados antes do Goal, sem migration nem backfill. No frontend, as duas pendências não bloqueantes do [review137](137-review.md): "Carregar mais" depois de `IMPORT_ITEM_ALREADY_DECIDED` e as `notes` do 2.I6 sem a `ReplaceAccountZone`. A tela de conflitos não mudou de aparência. Decisão: [D-152](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `a32c52bf7bc12566f68ed7b789e6c55c5ef84133` (Goal137). Base imediata da implementação: `39012fdb42d9b0f4591be4e6fc3757c8776d40c3`, HEAD da worktree `.ai-worktrees/goal-138`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **16 arquivos** (13 rastreados e 3 novos não rastreados), hash do diff `bab4b7a25d8f7e79ede6922825b58eb42e45f3f0682c3d114f325906de7329ed`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - Scheduling (4): `apps/scheduling-service/src/modules/migrations/import-source-values.ts`, `import-preview-service.ts`, `import-execution-service.ts` e `apps/scheduling-service/src/modules/internal-api/routes.ts` (só `proposedServiceDto`);
  - frontend (2): `apps/frontend/src/features/imports/ImportConflictsScreen.tsx` (só `settle`) e `apps/frontend/e2e/visual/targets.json` (só as `notes` do 2.I6);
  - testes novos (3): `apps/scheduling-service/tests/unit/goal138-import-source-values.test.ts` (16), `apps/scheduling-service/tests/integration/goal138-import-source-values.test.ts` (4) e `apps/frontend/tests/goal138-conflitos.test.tsx` (9);
  - testes ajustados (3): `goal136-import-match.test.ts` (só forma: o caso de duração `45.5` agora espera `null`), `goal137-alvo-captura.test.ts` (sem a exigência da palavra `ReplaceAccountZone`) e `scripts/tests/visual-responses.test.mjs` (uma asserção a mais no teste do 2.I6, para o controle (g));
  - `docs/migration/` (4, por acréscimo): D-152 em `DECISIONS.md`, o delta em `CURRENT_STATE.md`, a nota (e) da §26 em `DATA_MIGRATION.md` e a seção do Goal138 em `VALIDATION_GATE.md`.
- O contrato (`packages/public-api-contract/`, `PUBLIC_API_V1.md`), o BFF, o banco (nenhuma migration), o leitor do calendário (`import-source-reader.ts`), `tools/ia-loop/` e o documento do Goal138 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01, WU-02 e WU-14 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-03 a WU-13 e WU-15 rodaram uma vez cada, todos com saída 0 e o mesmo `codeFingerprint` (`code-v1:8a672d13aad3d1eb39d8bb030354291526fb01657e1a1ebb0d10cd479895cb50`). As seções §1 a §3 e os critérios 1 a 5, 9 e 10 têm trabalho correspondente no diff; os critérios 6 a 8 dependem de execução e foram conferidos pelos resultados das WU e pela reexecução abaixo.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-152: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, a observação não bloqueante e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal138: o status no título e o parágrafo "Aceite".
3. `DATA_MIGRATION.md`, §26, nota (e): o status passou a ACCEPTED, com o link para este review.
4. `VALIDATION_GATE.md`, seção do Goal138: o registro do aceite na abertura; a linha de `git diff --check` ganhou o resultado da WU-15 do IA Loop (saída 0), que a WU-14 dava como futuro; e a subseção "Aceite", com a conferência do Tech Lead.
5. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal138), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal138) e em D-152.

- **Gates do IA Loop, rodada 1, na árvore aceita** (`attemptId` `a1` em todos, sem retentativa do harness): typecheck (WU-03) e lint (WU-04) do Scheduling com saída 0; `goal138` do Scheduling 16 passando e 4 de integração pulados, sem banco no gate dirigido (WU-05); typecheck (WU-06) e lint (WU-07) do frontend com saída 0; `goal138` do frontend 9 (WU-08); frontend 201 arquivos e 2906 testes (WU-09; a baseline é 200 e 2897, +1 arquivo e +9 testes); `test:gate` 296 (WU-10); `validate:core` com saída 0, 15 de 17 passos e 2 pulados (WU-11); `validate:ui` 169 passed, 21 pulados, 0 retentativas (WU-12); `validate:integration` com saída 0, 36 de 36 passos, `test:scheduling-integration` com saída 0 e o gate autenticado com 305 passed e 0 retentativas (WU-13); `git diff --check` com saída 0 (WU-15).
- **Do Developer:** unidade do Scheduling 42 arquivos e 587 testes (a baseline é 41 e 571); integração do Scheduling 22 arquivos e 165 testes contra PostgreSQL descartável (a baseline é 21 e 161; 4 de 4 do `goal138` contra o banco); `visual-responses.test.mjs` 63; o `visual:compare` do 2.I6 com a tabela por imagem contra três capturas da baseline (os quatro `app.png` iguais por `cmp` a pelo menos uma; o desktop difere da captura 1 em 21 px e Δ1, o ruído medido entre as três).
- **Controles negativos do Developer:** (a) a (e) na WU-01 e (f) e (g) na WU-02, depois da última edição de código, cada um reprovando o teste indicado com a mensagem registrada e revertido com `cmp` igual ao backup. O (g) reprova por `goal138-conflitos.test.tsx` e por `visual-responses.test.mjs`, porque `goal137-alvo-captura.test.ts` deixou de exigir a palavra; o desvio está declarado.
- **Conferência do Tech Lead:**
  - **Scheduling:** `knownServiceDuration` aceita só número finito, inteiro e maior que zero, sem arredondar, e é a única leitura de duração de serviço em `proposedServiceFrom`, `classifyService` (`asPositiveNumber` removida), `serviceValuesDiverge`, `importService` e nas três leituras de `appointmentServices`. `resolveInterval` continua com `knownPositiveDuration`; no grep de `src`, a única outra cópia está em `import-source-reader.ts`, fora do escopo. `resolvePrice` usa `known <= 0`. `proposedServiceDto` segue `importProposedServiceSchema` campo a campo.
  - **Frontend:** `settle` incrementa `decidedSince` também em `already`; as `notes` do 2.I6 perderam só o trecho da `ReplaceAccountZone`.
  - **Escopo:** dentro do critério 9; a asserção a mais em `visual-responses.test.mjs` se justifica pelo controle (g); o ajuste em `goal136-import-match.test.ts` é só de forma e está declarado.
  - **Reexecução:** unidade do Scheduling 42 arquivos e 587 testes passando; `goal138` e `goal137` do frontend, 3 arquivos e 87 testes passando; `visual-responses.test.mjs` 63 de 63; `git diff --check` limpo.
  - **Integração:** os testes `goal138` de integração foram lidos (o item gravado à força como `{ 47.5, FIXED, -10 }`, a leitura campo a campo, a execução `IMPORTED` e o retrato nulo e `NOT_INFORMED`), mas não reexecutados (ver abaixo).
  - **Fidelidade visual:** `visual:compare --target 2.I6` rodado de novo (saída 0; 4,5 / 1,5 / 1,8 / 1,9 %, mobile, tablet retrato, tablet paisagem e desktop) e os quatro `side-by-side.png` abertos. Restam só as divergências de D-151: cartão do serviço aberto e sem decisão; ordem dos cartões e cliente fechado; "1.843" no lugar de "1.837"; chevron, "Sair" e barra do topo. Nenhuma `ReplaceAccountZone` e nenhuma divergência nova.

## Aceito sem prova completa

1. **A integração do Scheduling** não foi reexecutada pelo Tech Lead: o `SCHEDULING_TEST_DATABASE_URL` do ambiente dele (`ia_scheduling_test`) não tem a tabela `AppointmentEvent`, e o `goal136`, já aceito, falha igual. O problema é do banco, não do Goal. Valem o `test:scheduling-integration` com saída 0 dentro do `validate:integration` (WU-13), que provisiona o próprio banco, e a contagem do Developer.
2. **Os controles negativos** são os do Developer (WU-01 e WU-02); o Tech Lead não os refez.
3. **O valor malformado vindo de uma instalação real do Minha Agenda:** a prova é com a origem simulada e, na integração, com um `proposedService` gravado à força.
4. **O cadastro criado sem duração na tela de Serviços** ("Precisa de revisão"): a regra de `reviewOrigin: "IMPORT"` já existia e não foi reaberta.
5. **As contagens por passo** dentro de `validate:core` e `validate:integration` não foram guardadas pelo IA Loop; vale a saída 0.

## Pendências não bloqueantes

1. **`SERVICE_PRICE_NOT_INFORMED` para preço negativo.** Em `classifyService`, o serviço de preço negativo sem correspondência não recebe o `reasonCode` informativo `SERVICE_PRICE_NOT_INFORMED`, que só olha `price === 0`. O Goal não pede isso, e `proposedService` e a execução já gravam `NOT_INFORMED`.
2. **Fora deste Goal, com Goal e decisão próprios:** o leitor do calendário (`import-source-reader.ts`, com cópia própria das funções e `FIXED` para preço negativo em `toCalendarService`); `CUSTOMER_PHONE_SHARED` em revisão com candidato (D-151, item 14); a deduplicação da duplicata idêntica e "usar os valores da Minha Agenda" num serviço existente (D-150, item 8); os 13 quadros ainda sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3).
