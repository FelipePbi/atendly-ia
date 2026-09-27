# Review formal — Goal 057

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal057](../goals/057-a-confirmacao-e-da-agenda.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–056) foi reaberto, reavaliado ou revertido. **Cinco rodadas**: as rodadas 1 a 4 terminaram `CHANGES_REQUIRED` com 4, 4, 2 e 2 blockers; a rodada 5, com zero.

O Goal corrige dois achados da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. **QA A-01**: com WhatsApp e modelo reais, a IA respondeu "Pronto, ficou confirmado…" num turno sem tool, depois de um `prepare`; nenhum `Appointment` existia. **QA H-09**: a Home contava `create_appointment` `prepare` como agendamento feito pela IA. O Goal também aplica a decisão **U-06** do usuário (uma pergunta de confirmação, nunca travessão, mensagem de encerramento).

## Escopo e identidade do diff

- Baseline aceita vigente: `1792e1234fff305d91487e8f249d9d1dce0ed807` (fechamento do Goal056). Base imediata da implementação: `0ab33c60f66dda0e2bb14ca430fdb7230890e967`, HEAD da worktree `.ai-worktrees/goal-057`, inalterado nas cinco rodadas. O commit `fdfa1fa`, entre as duas, é só documental.
- Snapshot aceito, calculado pelo IA Loop: **16 arquivos**, hash do diff `50fc8dbb877e27ba5d24b3cb7e30b42fbb1c1554c0674ee9baf4cd0dc3f5b644`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Treze arquivos rastreados**, por `git diff --numstat 0ab33c6`: `assistant.service.ts` (+263/−1), `internal/routes.ts` (+35/−4), `prompts/scheduling.ts` (+6/−0), `prompts/summary.ts` (+1/−1), `prompts/system.ts` (+8/−2), `tests/assistant/assistant.service.test.ts` (+4/−0), `tests/prompts/system.test.ts` (+51/−6), as duas notas do vault por acréscimo puro (`01-Regras/03-IA-e-Conversas.md` +10, `02-Fluxos/03-Fluxos-de-Agendamento.md` +6) e os quatro documentos de `docs/migration/` por acréscimo puro (`CURRENT_STATE.md` +96, `FINAL_AUDIT.md` +53, `DECISIONS.md` +30, `VALIDATION_GATE.md` +28). **Três arquivos novos**, todos em `apps/ai-orchestrator/tests/`: `assistant/commitment-claim-guard.test.ts` (**681** linhas), `evals/commitment-claim.eval.test.ts` (**503**) e `internal/dashboard-ai-appointments.routes.test.ts` (**229**).
- Nenhum arquivo novo em `apps/ai-orchestrator/src/` nem em `apps/bff/src/`. Nenhum arquivo de `apps/bff/`, `apps/frontend/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, migration ou `tools/ia-loop/` foi tocado. `QA_LOCAL_REVIEW.md` não foi editado.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

A estrutura estava certa: guard em `completeGraphTurn` antes de `message.create`, evidência pelo ledger, texto fixo em `PRODUCT_OWN_TEXTS`, log `warn` sem texto da cliente nem do modelo, métrica correta com teste de rota. Os quatro blockers:

1. **§4 incompleto.** O prompt não tinha a regra "não perguntar para quem é quando a pessoa já está clara", que o vault novo já afirmava.
2. **Falso negativo no formato de QA A-01 para remarcação e cancelamento.** "confirmado", "marcado" e flexões estavam só no vocabulário `schedule`. Por execução, "Pronto, sua remarcação foi confirmada" e "Cancelamento confirmado!" passavam com rascunho `reschedule` ou `cancel` pendente.
3. **`normalizeModelDashes` destruía quebra de linha e mexia em texto sem travessão.** O `\s*` consumia `\n` ("Horarios:\n— 10h" virava "Horarios:, 10h"), e a limpeza global alterava texto sem travessão.
4. **Controles e contagens a refazer** depois das três correções.

## Rodada 2 — CHANGES_REQUIRED (4 blockers)

As correções de código dos blockers 1 a 3 estavam no lugar e foram conferidas por execução. Abertos: os controles 1 e 2 do §7 não rodaram depois da última edição; os quatro documentos citavam contagens (46, 61, 12/52) e linhas que não valiam mais e ainda diziam que os gates ficavam para depois; D-073 não citava a regra nova nem o falso positivo dos termos genéricos, e o teste do prompt montado não conferia a frase nova; o eval não tinha os casos de remarcação e cancelamento com vocabulário genérico.

## Rodada 3 — CHANGES_REQUIRED (2 blockers)

Os quatro controles foram colados, o eval ganhou os dois casos pelo runtime real e o teste do prompt ganhou o `toContain`. Abertos: os três documentos ainda diziam que typecheck, lint, `test:gate` e `validate:core` ficavam para as Work Units seguintes, e dois comentários de código (`assistant.service.ts:400`, `prompts/system.ts:111`) citavam D-072, decisão do Goal056; o falso positivo concreto dos termos genéricos com `cancel`/`reschedule` pendente não estava nos limites de D-073.

## Rodada 4 — CHANGES_REQUIRED (2 blockers)

As frases que adiavam a validação saíram, e D-073 passou a nomear o falso positivo. Abertos: os dois comentários ainda citavam D-072, porque a correção tinha editado só documentos; FINAL_AUDIT §34 não trazia os dois limites de D-073.

## Rodada 5 — ACCEPTED

### Verificações próprias do reviewer

- **O guard fica antes da mensagem existir.** `completeGraphTurn` (`assistant.service.ts:881`) chama `guardCommitmentClaim` (`:901`, declarado em `:952`) antes de `prisma.message.create`. `loadTurnConfirmedEffects` (`:1584`) lê o ledger `aiToolCall` com escopo de `tenantId` e `aiRunId`, e só `action=confirm` (ou `confirm_recurring_appointments`) conta. O JSON da decisão não entra.
- **O delta da rodada 5 é só comentário e parágrafo.** Comparados os patches das rodadas 4 e 5: em `src/`, só as duas linhas `D-072` → `D-073` (`assistant.service.ts:400`, `prompts/system.ts:111`); em documento, só o parágrafo dos limites em §34. O comportamento é o da rodada 4.
- **`PROMPT_TEMPLATE_VERSION` é `v7`** (`system.ts:116`). Os U+2014 que restam em `prompts/system.ts` (3) e `prompts/summary.ts` (1) estão só em comentário, não em literal enviado ao modelo.
- **Os quatro arquivos de teste do Goal passam: 113/113**, por execução minha (`commitment-claim-guard` 50, `commitment-claim.eval` 8, `dashboard-ai-appointments.routes` 9, `system.test` 46).
- **D-073 estava em `PROPOSED`** e §4 a §33 do FINAL_AUDIT não foram tocados. `git status --porcelain=v1 -uall` lista só os 16 arquivos declarados.

### Gates conferidos, e o que aceitei sem prova própria

Reexecutados por mim: os quatro arquivos de teste do Goal. **Aceito pelos gates nativos da rodada, sem reexecução minha:** typecheck, lint, testes dirigidos, suíte completa de `apps/ai-orchestrator` (**1099** passando, **88** pulados), `test:gate`, `validate:core` e `git-diff-check`, todos verdes. `validate:core` com **15** passos `passed` e **2** `skipped` (`test:bff`, `test:health-worker`) e `test:gate` com **226**/**226** vêm da execução do Developer. `validate:integration` não foi reexecutado; o diff não toca banco nem infraestrutura.

**A saída dos quatro controles negativos colada em §34 é da rodada 4**, e não foi rodada de novo depois da troca de comentário da rodada 5. Aceitei o critério 10 em substância, porque o delta de código entre as rodadas não muda comportamento. Os números colados são: guard desligado, **16** falhas de **58**; evidência pelo JSON da decisão, **1** de **58**; métrica antiga, **3** de **9**; normalização de travessão removida, **2** de **58**.

### Observações não bloqueantes

Nenhuma afrouxa invariante, e nenhuma é condição do aceite.

1. **O rótulo "FIX-001, rodada 4"** em FINAL_AUDIT §34, CURRENT_STATE e VALIDATION_GATE ficou defasado: o diff aceito é o da rodada 5. As contagens registradas batem com a execução da rodada 5, então o rótulo não muda nenhum número.
2. **Os casos de remarcação e cancelamento do eval afirmam `reply.text`, não a `Message` persistida.** Em `completeGraphTurn` é o mesmo valor; o primeiro caso do eval confere a persistência de forma explícita.
3. **`normalizeModelDashes` ainda limpa o texto inteiro quando há travessão.** A limpeza de vírgula duplicada e o `trim` agem fora do trecho trocado. Texto sem travessão sai byte a byte igual. O efeito é cosmético.
4. **U+2013 cercado de espaço em faixa numérica vira vírgula** ("das 10 – 11h" vira "das 10, 11h"). É o que a letra do Goal pede; só faixa sem espaço fica intacta.
5. **A série de rodadas veio de novo de evidência documental.** Dos 12 blockers, 3 foram de código (termo genérico só em `schedule`, normalização que juntava linhas, regra de prompt ausente), 1 foi de teste (casos do eval) e 8 foram de documento, de comentário de código ou de controle rodado antes da última edição. A regra do Goal054 §12 e a observação 4 do [review056](056-review.md) pegaram todos. A rodada 4 existiu só porque a correção da rodada 3 editou documentos e não os dois comentários de código.
6. **As observações abertas herdadas continuam abertas**: as do [review056](056-review.md) e as que ele herdou (reviews 040, 041, 053, 054 e 055).

### O que este aceite não cobre

Não prova aderência do modelo real ao prompt da U-06 (**D-050**): o eval usa dublê roteirizado e prova o que o runtime deixa acontecer. Afirmação sem nenhum rascunho pendente passa sem checagem, e termo genérico de confirmação com rascunho `cancel`/`reschedule` pendente é falso positivo fail-closed, ambos limites de D-073. **CV-03** não faz parte deste Goal (passou ao 058). Nenhum achado A-01…A-24 foi corrigido ou reclassificado; a auditoria segue **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §34](../FINAL_AUDIT.md)). BFF, Home e o schema de `aiAppointmentsToday` não mudaram.

### Correções de registro feitas no fechamento

- **D-073 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review e a contagem de rodadas, e ganha nota de fechamento com a origem da saída dos controles e as observações 3 e 4. Nenhum outro texto de D-073 foi reescrito.
- **`FINAL_AUDIT §34`** passa a citar D-073 como `ACCEPTED` neste review, em vez de `PROPOSED`.
- **O link para `QA_LOCAL_REVIEW`** em D-073 e em §34 apontava para `../QA_LOCAL_REVIEW.md`, caminho que não existe; passa a apontar para `QA_LOCAL_REVIEW.md`, na mesma pasta.
- **O status do documento do Goal057 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
