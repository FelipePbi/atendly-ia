# Review formal — Goal 080

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-30, conforme o [Goal080](../goals/080-nao-classificadas-seguem-o-prazo-comercial.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–079) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 1 blocker, e a rodada 2 terminou com zero. O único defeito achado no review foi de documentação; nenhum código de produção nem teste mudou entre as rodadas.

O Goal aplica a decisão **U-01** do usuário (Felipe Borges, 2026-09-27): o conteúdo de conversa governado por sessão `UNCLASSIFIED` passa a expirar pelo prazo **Comercial do negócio**, e não por 90 dias fixos. A regra é escrita uma vez, em `retentionCutoffs` do BFF. A IA recebe `unclassifiedCutoff` como campo opcional, e a ausência preserva. O predicado da purga ganha um único ramo. O contrato público troca `unclassifiedPurged: false` por `unclassifiedRetentionFollows: "COMMERCIAL"`, e a tela passa a dizer a regra. Fecha **A-12** do FINAL_AUDIT e a linha U-01 da tabela de incertezas. Decisão: [D-096](../DECISIONS.md), que substitui o item (9) de D-039.

## Escopo e identidade do diff

- Baseline aceita vigente: `b207829c7e8996f7f90ffe0bd1c691a77a9b9268` (Goal079). Base imediata da implementação: `997d01331d751f24d91ccf1103548a954de0dc95`, HEAD da worktree `.ai-worktrees/goal-080`, inalterado nas duas rodadas. Entre `b207829` e `997d013` só há `docs/`: o fechamento do Goal079 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos**, hash do diff `6463908ed7041ab5a76cf0851440fc39fa2a1e9a6c19c3dfcd53dfeeac65d311`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **20 arquivos rastreados**, por `git diff --numstat 997d013` no snapshot aceito:
  - IA: `modules/retention/content-purge-service.ts` (+29/−12) e `modules/internal/routes.ts` (+9).
  - BFF: `modules/retention/sweep.ts` (+11/−1), `modules/retention/settings.ts` (+8/−7), `clients/ai-orchestrator/index.ts` (+7/−1) e `PUBLIC_API_V1.md` (+3/−3).
  - Contrato: `packages/public-api-contract/src/schemas.ts` (+2/−2).
  - Frontend: `features/settings/RetentionSection.tsx` (+10/−11).
  - Testes existentes ajustados, sem teste removido nem pulado: `content-purge.test.ts` (+353/−4, de 9 para 14 testes), `assistant.service.test.ts` (+1/−1, âncora de linha 769 para 775), `goal023-retention-sweep.test.ts` (+31/−2), `goal023-retention-settings.test.ts` do BFF (+10/−5), `goal023-retention-settings.test.tsx` (+38/−10), `goal023-conversations-settings.test.tsx` (+1/−1) e `goal024-settings-shell-invariant.test.tsx` (+1/−1). O motivo de cada asserção mudada está em [FINAL_AUDIT §57](../FINAL_AUDIT.md).
  - Documentos do §8: `CURRENT_STATE.md` (+57), `DECISIONS.md` (+40/−1: D-096 e a linha U-01), `FINAL_AUDIT.md` (+64, §57), `VALIDATION_GATE.md` (+48) e a linha do vault em `01-Regras/08-Privacidade-e-Retencao.md` (+2).
- **Dois arquivos novos**: `apps/ai-orchestrator/tests/internal/goal080-content-purge.routes.test.ts` (**154** linhas, 9 testes) e `apps/bff/tests/goal080-retention-ai-port.test.ts` (**64** linhas, 1 teste).
- Nenhuma migration, coluna, backfill, `UPDATE`, rota nova ou opção nova na allowlist. `RETENTION_SWEEP_ENABLED` não foi ligado em ambiente nenhum. Nenhuma exceção nova em `KNOWN_*` e nenhum passo a menos em `validate:core` ou `validate:integration`. `vitest.config.*`, `playwright.config.*`, `next.config.ts` e os specs de `e2e/` ficam na baseline. Nenhum arquivo foi tocado em `apps/scheduling-service/`, `apps/evolution-go/`, `tools/ia-loop/` ou `scripts/`; a etapa `retention-declaration` do ensaio do Goal030 não precisou mudar. `apps/bff/AGENTS.md` e `apps/ai-orchestrator/AGENTS.md` não têm frase que tenha ficado falsa. `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 1 blocker.** O código conferia com o Goal:
   - IA: `unclassifiedCutoff?` em `ContentPurgeInput` e um único ramo `OR (UNCLASSIFIED AND occurredAt < cutoff)` dentro do `NOT (...)`, com `Prisma.empty` quando o cutoff falta. O `EXISTS` (linha órfã), o `NOT EXISTS` (janela ambígua), o filtro por `tenantId`, o teto e `hasMore` ficaram intactos. A rota valida o campo com `z.iso.datetime({ offset: true }).optional()` e só o repassa quando vem no corpo, sem derivar do comercial.
   - BFF: a regra existe só em `retentionCutoffs`, como cópia do `commercialCutoff`; a porta e o cliente mandam os três cutoffs.
   - Contrato e tela: o campo foi trocado em `settings.ts`, `schemas.ts` e `PUBLIC_API_V1.md`, e o `PATCH` não mudou de forma. A nota e o diálogo da Comercial mudaram; o diálogo da Pessoal não.
   - Testes: `UNCLASSIFIED_CUTOFF` (dia 60) é distinto do comercial, a janela ambígua tem linha de controle, e há testes de linha órfã e de negócio vizinho.
   - Blocker 1: o item 3 de D-096 e o delta Goal080 de CURRENT_STATE ("Cutoff opcional na IA; a ausência preserva") nomeavam a rota como `POST /internal/retention/content-purge`. Essa rota não existe; a real é `POST /internal/retention/conversation-content`, a mesma citada no §Evidência 2 do Goal. Parte de código: nenhuma. Parte de evidência: reescrever as duas frases no lugar, pela regra do Goal054 §12.
2. **Rodada 2 — `ACCEPTED`.** O FIX-001 trocou a rota nas duas frases e mudou só `DECISIONS.md` e `CURRENT_STATE.md`. Na árvore da rodada 2, antes das notas deste fechamento, que citam o nome falso só como o defeito corrigido, `git diff 997d013 | grep 'retention/content-purge'` só encontrava os nomes de arquivo `content-purge-service.ts` e `content-purge.test.ts`, nunca a rota falsa; o mesmo grep nos documentos, fora de `goals/` e `reviews/`, dava o mesmo resultado. O diff inteiro foi revisto de novo. `git status` mostrava só arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

## Evidência final aceita

A execução final descrita nos documentos é a da **rodada 1** (WU-13 a WU-17), sobre o mesmo código de produção, na ordem do §8, todos exit 0 ([FINAL_AUDIT §57](../FINAL_AUDIT.md)):

- `validate:core` **17** passos (**15** `passed`, **2** `skipped`).
- `test:gate` **233**/**233**.
- `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas (`startTime` `2026-09-30T14:37:30.913Z`).
- `validate:integration` **36**/**36** passos, contra `127.0.0.1:55500/ia_bff_test`, com `test:ai-orchestrator-content-purge` contra PostgreSQL real e o gate autenticado em **170** testes, **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime` `2026-09-30T14:40:43.946Z`).
- Reexecutados pela WU-17 sobre a árvore entregue: `test:frontend` **121**/**1244** (baseline **1243**); `test:ai-orchestrator` sem banco **1186** passando e **98** `skipped` de **1284** (baseline **1270**); `test:bff-integration` **61**/**470** (baseline **60**/**465**); `test:scheduling-service` **37**/**502**, sem mudança. **+20** testes no total.
- Vermelho da baseline, com os sete arquivos de produção trocados pelo conteúdo de `HEAD` e restaurados com conferência por hash: IA **10** reprovados de **23**, BFF **20** de **35**, frontend **2** de **10**.
- Seis controles negativos do §7, por edição real revertida e conferida por `sha256`, depois da última edição de código. O controle 5 (contrato) reprova por `500` da verificação de resposta do BFF contra o schema, e não pela asserção explícita `not.toHaveProperty("unclassifiedPurged")`; §57 registra isso.

Evidência conferida pelo Tech Lead:

- Rodada 1, reexecução dirigida: rotas da IA com `assistant.service`, **308**/**308**; porta e varredura do BFF sem banco, **10** passando e **14** pulados; testes de retenção do frontend com os fixtures, **27**/**27**.
- Rodada 2: os gates do IA Loop passaram (typecheck, lint, testes dirigidos, `validate:core`, `test:gate`, `validate:ui` e `validate:integration`, todos exit 0). O Tech Lead não reexecutou os seis controles nem o vermelho da baseline, que vêm da WU-17.

## Observações registradas, sem mudar a decisão

1. **Flaky de ambiente no `validate:integration` da rodada 2.** O gate autenticado teve **1** `flaky`: `configuracoes-conta` em `notebook-1024`, com "the session marker is missing" na primeira tentativa e aprovado na retentativa. É falha de ambiente conforme o §10 do Goal, do mesmo padrão já registrado no [review072](072-review.md) e no [review079](079-review.md). Os `e2e-results` em disco são desses gates: público `startTime` `2026-09-30T15:11:59Z` (**169**/**21**/**0**) e autenticado `2026-09-30T15:15:11Z` (**169** `expected`, **1** `flaky`). Os `startTime` citados nos documentos são os da rodada 1, com **0** retentativas sobre o mesmo código de produção.
2. **Comentário velho fora do escopo.** O comentário do passo `test:ai-orchestrator-content-purge` em `scripts/validate-integration.mjs` (perto das linhas 590–592) ainda diz que a purga não alcança conteúdo "não classificado". O passo roda o teste certo; só o comentário ficou falso. O arquivo estava fora do escopo autorizado e fica para um Goal futuro.
3. **Nenhum gate acusou o nome de rota falso.** O blocker da rodada 1 só apareceu na leitura do review. Nome de rota, arquivo ou função citado em documento do §8 continua conferido pelo review, não por gate automático.

## O que o aceite não prova

- Que a leitura "segue o prazo Comercial", e não "90 dias fixos", é a que Felipe Borges quis. Se não for, D-096 é reaberta antes de qualquer varredura ligada em dado real.
- Que a nova nota e o diálogo da Comercial são claros para a profissional. A conferência humana do §9 **não foi feita**.
- Que a varredura se comporta bem sobre o volume real acumulado. Nenhuma purga, varredura ou `content-purge` foi executada contra dado real; toda evidência vem de PostgreSQL descartável. Quando `RETENTION_SWEEP_ENABLED` for ligado, a primeira passada alcança todo o conteúdo Não classificado acumulado além do prazo Comercial.
- A busca por CEP (O-15), pendente de decisão humana.

Veredito do FINAL_AUDIT: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, com A-12 fechado, sem contar os achados da revisão local ([FINAL_AUDIT §57](../FINAL_AUDIT.md)).
