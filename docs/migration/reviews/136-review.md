# Review formal — Goal 136

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal136](../goals/136-os-conflitos-da-importacao-com-a-correspondencia-sugerida-e-os-valores-da-origem-no-contrato.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review `DEEP`, sem blocker; nenhuma correção de registro ficou para o fechamento.

Cada item `SERVICE` e `CUSTOMER` da importação passa a trazer, na rota de itens do Scheduling e do BFF, os cadastros que a análise sugeriu como correspondência (`candidates`, lidos no momento e só do negócio; no cliente, só `internalId` e `name`), e o item `SERVICE` traz a duração e o preço da origem (`proposedService`). O serviço com um só cadastro de mesmo nome e duração ou preço da origem conhecidos e diferentes passa a `SERVICE_MATCH_DIVERGENT` `NEEDS_REVIEW`. A análise grava as duas colunas novas de `ImportItem` (migration aditiva `20261007120000_goal136_import_item_match`). O contrato público só ganha campos opcionais. Nada muda no frontend, na rota de decisão, na execução, na conclusão nem no andamento: a tela de conflitos continua pedindo o identificador digitado até a porta do 2.I6. Decisão: [D-150](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `1669efa187da776ab908a1f0c1b3d955a2e2b5ae` (Goal135). Base imediata da implementação: `e2a5c665771f351006db543424d136ca54b29883`, HEAD da worktree `.ai-worktrees/goal-136`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **18 arquivos** (12 rastreados e 6 novos não rastreados), hash do diff `983bb59616d1a75071a87463cc42d7c0a8ea62fe18706c1320501ff8ed45f93c`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - Scheduling (6): `prisma/schema.prisma`, a migration nova `prisma/migrations/20261007120000_goal136_import_item_match/migration.sql`, `src/modules/migrations/import-source-values.ts` (novo, as funções movidas), `import-preview-service.ts` (a gravação e `SERVICE_MATCH_DIVERGENT`), `import-execution-service.ts` (só o import das funções movidas) e `src/modules/internal-api/routes.ts` (só a rota de itens e seus auxiliares);
  - contrato e BFF (3): `packages/public-api-contract/src/schemas.ts`, `apps/bff/src/clients/scheduling/index.ts` e `apps/bff/PUBLIC_API_V1.md`;
  - testes (5): os novos `apps/scheduling-service/tests/unit/goal136-import-match.test.ts` (28), `apps/scheduling-service/tests/integration/goal136-import-match.test.ts` (9), `apps/bff/tests/goal136-import-match.test.ts` (7) e `apps/bff/tests/goal136-import-match.integration.test.ts` (4); e o ajuste de `apps/scheduling-service/tests/integration/goal010-import.test.ts`;
  - `docs/migration/` (4, por acréscimo): D-150 em `DECISIONS.md`, §26 em `DATA_MIGRATION.md`, o delta em `CURRENT_STATE.md` e a seção do Goal136 em `VALIDATION_GATE.md`.
- `apps/frontend/` (inclusive `ImportConflictsScreen.tsx`, `labels.ts` e `targets.json`), `scripts/`, a rota de decisão (`applyImportDecision`), a execução além do import, a conclusão, o andamento e `tools/ia-loop/` não foram tocados. O documento do Goal136 não foi tocado pelo Developer.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 a WU-03 (Sonnet) e WU-12 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-04 a WU-11 e WU-13 rodaram uma vez cada, todos com saída 0 e o mesmo `codeFingerprint` (`code-v1:f8ddddad71ca0e9113f31bac188223806e298dba5c57a8a3aa4655097bdc3527`). Os 13 itens numerados do Goal (§1 a §3 e os critérios 1 a 10) têm trabalho correspondente no diff.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-150: o status passou a ACCEPTED, sem correção no texto da proposta (saiu só a frase "Aguarda o review do Tech Lead Agent"); a nota de fechamento, com a conferência, o aceito sem prova completa, a observação não bloqueante e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal136: o status no título e o parágrafo "Aceite".
3. `DATA_MIGRATION.md`, §26: a referência a D-150 passou de PROPOSED a ACCEPTED.
4. `VALIDATION_GATE.md`, seção do Goal136: "Não houve segunda rodada até aqui" virou o registro do aceite na rodada 1, e a linha de `git diff --check` ganhou o resultado da WU-13 do IA Loop (saída 0), que a WU-12 dava como futura.
5. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal136), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal136), em [DATA_MIGRATION](../DATA_MIGRATION.md) §26 e em D-150.

- **Gates do IA Loop, rodada 1, na árvore aceita** (`attemptId` `a1` em todos, sem retentativa do harness): typecheck do Scheduling (WU-04) e do BFF (WU-05) com saída 0; lint do Scheduling (WU-06) e do BFF (WU-07) com saída 0; testes `goal136` do Scheduling (WU-08, 28 passando, os 9 de integração pulados sem banco) e do BFF (WU-09, 7 passando, os 4 de integração pulados); `validate:core` (WU-10, saída 0, 15 de 17 passos e 2 pulados); `validate:integration` (WU-11, saída 0, 36 de 36 passos, com `test:scheduling-integration`, `test:bff-integration`, `provision:scheduling-test-database` e `rehearse:goal028-release-migrations`, e o gate autenticado com 305 passed e 0 retentativas); `git diff --check` (WU-13, saída 0).
- **Do Developer:** unidade do Scheduling 41 arquivos e 571 testes; integração do Scheduling contra PostgreSQL 18 descartável 21 arquivos e 161 testes, com os 9 do `goal136`; frontend 198 arquivos e 2819 testes e `goal135` 82, iguais à baseline, sem edição em `apps/frontend/`.
- **Controles negativos do Developer:** (a) a (f), na WU-03, depois da última edição de código, cada um reprovando o teste indicado com a mensagem registrada e revertido com `cmp` igual ao backup. O controle (b) só reprovou depois de o teste "duração ausente na origem continua SERVICE_DURATION_MISSING" ganhar a asserção de `matchClass`, um reforço em arquivo novo do Goal.
- **Conferência do Tech Lead:**
  - **Migration:** só `ALTER TABLE "ImportItem" ADD COLUMN` de `matchCandidateInternalIds` e `proposedService`, `JSONB` anuláveis, sem default, índice, constraint nem `UPDATE`, no padrão da `proposedAvailability` (Goal062).
  - **Funções da origem:** `knownNumber`, `knownPositiveDuration` e `resolvePrice` movidas com o corpo idêntico para `import-source-values.ts`; a execução só passou a importá-las de lá, e `proposedServiceFrom` só compõe as duas. O módulo comum evita o ciclo que exportar da execução criaria.
  - **Análise:** grava as duas colunas no `itemCreates` e no `itemUpdates` de item não resolvido, com `DbNull` fora de `SERVICE` e `CUSTOMER` (candidatos) e fora de `SERVICE` (origem); o item resolvido segue só com `lastSeenPreviewVersion` e `disappearedAt`.
  - **`SERVICE_MATCH_DIVERGENT`:** `serviceValuesDiverge` segue a escolha 3 do Goal. Valor desconhecido da origem nunca diverge; cadastro sem duração ou sem preço `FIXED` conta como diferente; o preço é comparado com `Number(Decimal)`, como `serviceDto` converte. `SERVICE_DURATION_MISSING` continua prevalecendo, e `AMBIGUOUS`, `SIMILAR` e os motivos de cliente não mudaram.
  - **Rota de itens:** um `findMany` por página e categoria com `tenantId` do contexto e `id: { in }`; a ordem gravada preservada; o cadastro apagado omitido; o cliente lido com `select` `{ id, name }`; o candidato de serviço montado por `serviceDto`; `proposedService` só em `SERVICE`; `AVAILABILITY` e as outras categorias sem os campos novos. `applyImportDecision` não mudou.
  - **Contrato e BFF:** `candidates` e `proposedService` opcionais em `importItemSchema` e no espelho do BFF; os dois candidatos `.strict()`, então o telefone no candidato de cliente é recusado.
  - **Testes ajustados:** o `goal010` só troca a entrada (o serviço "900" com preço 90, igual ao cadastro) e mantém as asserções de `SERVICE_MATCH_EXACT`, decisão e execução.
  - **Gate de integração:** `validate:integration` roda `test:bff-integration` com `BFF_RUN_INTEGRATION_TESTS=true` e `test:scheduling-integration` com `--dir tests/integration`, então os arquivos de integração `goal136` dos dois serviços entram na WU-11.
  - **Testes reexecutados:** os de unidade `goal136` e `import-preview-service` do Scheduling, 45 de 45.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-03); o Tech Lead não os refez nem conferiu as mensagens contra a saída bruta.
2. **A contagem por arquivo** dentro de `test:bff-integration` e `test:scheduling-integration` não foi guardada pelo IA Loop; vale a saída 0 da WU-11 e a execução do Developer (161 testes de integração do Scheduling). Os 4 testes de integração do BFF não têm contagem própria registrada.
3. **As respostas fixas dos alvos 2.I8 e 2.I9** passam pela suíte do frontend dentro do `validate:core` (e pelos 82 `goal135` do Developer); este Goal não acrescentou teste que as valide contra o schema novo.
4. **O gate autenticado** não alcança a rota de itens com candidatos; a prova dos campos novos é a dos testes de integração `goal136`.
5. **O deploy real da migration** e a leitura de um banco com dados reais: não medidos; a migration só foi ensaiada em bancos descartáveis.
6. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além dos testes listados acima.

## Pendências não bloqueantes

1. **Valores malformados da origem.** `resolvePrice` e `proposedServiceDto` deixam passar duração fracionária ou preço negativo da origem. O schema do contrato (inteiro positivo e não negativo) os recusaria, e o BFF derrubaria a página inteira de itens com 502. É o mesmo risco que `serviceSchema` já tem, e a execução também não normaliza esses valores. Fica para o 2.I6 ou para um endurecimento futuro.
2. **Para o 2.I6:** a troca do identificador digitado pela escolha do candidato, a comparação lado a lado e um texto próprio de `SERVICE_MATCH_DIVERGENT` em `labels.ts` (hoje cai no texto genérico), conforme D-150, item 9.
3. **Fora deste Goal, com Goal e decisão próprios:** a deduplicação da duplicata idêntica na execução (perguntas 778 e 792 do vault) e "usar os valores da Minha Agenda" num serviço existente, conforme D-150, item 8.
