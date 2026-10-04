# Review formal — Goal 070

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal070](../goals/070-o-chat-mostra-o-que-a-agenda-fez.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–059) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 3 blockers; a rodada 2 terminou com zero.

O Goal corrige **QA CV-03** (MÉDIA) da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. A conversa passa a mostrar, como linha central entre as bolhas, a reserva de um horário, a reserva que venceu sem virar agendamento e o agendamento criado, com link para a Agenda. O fato vem do ledger `AiToolCall`, nunca do texto do modelo ([D-076](../DECISIONS.md), mesma regra de D-073).

## Escopo e identidade do diff

- Baseline aceita vigente: `c8beaeb3ccc4ce841f3cbd5efa0448abd3c48df5` (fechamento do Goal059). Base imediata da implementação: `66cf5fbd377756dffb1e4acd8bbe36026bc94b3c`, HEAD da worktree `.ai-worktrees/goal-070`, inalterado nas duas rodadas. O commit `66cf5fb` é só documental (fechamento do 059 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **24 arquivos**, hash do diff `1be8115e880236343e216fad292f80325d8b0fdb0a08652cc66ceca133e39597`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Dezenove arquivos rastreados**, por `git diff --numstat 66cf5fb`:
  - `apps/ai-orchestrator/`: `src/modules/internal/routes.ts` (+38/−0) e `tests/assistant/assistant.service.test.ts` (+10/−10, três literais computados pela árvore).
  - `apps/bff/`: `PUBLIC_API_V1.md` (+15/−1), `src/clients/ai-orchestrator/index.ts` (+44/−0) e `src/modules/conversations/routes.ts` (+17/−0).
  - `apps/frontend/`: `e2e/authenticated-matrix.spec.ts` (+54/−1), `src/data/services/BffConversationService.ts` (+17/−0), `src/features/conversations/ConversationThread.tsx` (+26/−1), `MessageTimeline.tsx` (+122/−13), `format.ts` (+33/−0) e `src/shared/styles/avenly-conversations.css` (+20/−0).
  - `packages/public-api-contract/src/`: `routes.ts` (+2/−0) e `schemas.ts` (+34/−0).
  - `scripts/`: `goal033-authenticated-ui-rehearsal.mjs` (+194/−0) e `tests/goal033-authenticated-ui-rehearsal.test.mjs` (+73/−0, **6** testes).
  - Os quatro documentos de `docs/migration/`, por acréscimo puro no diff aceito: `CURRENT_STATE.md` +129, `FINAL_AUDIT.md` +88, `DECISIONS.md` +31 e `VALIDATION_GATE.md` +24.
- **Cinco arquivos novos**: `apps/ai-orchestrator/src/modules/conversations/conversation-events.ts` (**297** linhas), `apps/ai-orchestrator/tests/conversations/goal070-conversation-events.test.ts` (**303** linhas, 9 testes), `apps/ai-orchestrator/tests/internal/goal070-conversation-events.routes.test.ts` (**211** linhas, 4 testes), `apps/bff/tests/goal070-conversation-events.test.ts` (**167** linhas, 6 testes) e `apps/frontend/tests/goal070-conversation-events.test.tsx` (**265** linhas, 5 testes).
- Nenhum arquivo foi tocado em `apps/scheduling-service/`, `apps/evolution-go/`, `tools/ia-loop/`, migrations ou schema Prisma. `assistant-tools.ts`, `assistant.service.ts`, prompts, tools, `messageSchema` e a resposta de `GET /v1/conversations/:id/messages` não mudaram. `QA_LOCAL_REVIEW.md` não foi editado.

## Rodada 1 — CHANGES_REQUIRED (3 blockers)

O restante do Goal estava correto:

- A rota interna tem `requireConversation`, filtro `tenantId` e `aiRun.conversationId`, `select` mínimo e escopo `conversations:read` pela regra de prefixo existente do mapa de escopos.
- O contrato ganha a união discriminada `conversationEventSchema`; `messageSchema` não muda; o proxy do BFF é igual a `listMessages`.
- O frontend intercala evento e bolha com desempate a favor do evento, mostra o vencimento no fuso do negócio e isola a falha dos eventos das mensagens. O "Ver" leva a `/agenda/agendamento?id=`.
- A semeadura do gate é só por `pg` em `scripts/`. O gate autenticado tem **65** testes com **0** retentativas. Os 14 gates determinísticos passaram.

Os três blockers:

1. **§1, reserva já vencida tratada como substituída.** `deriveConversationEvents` marcava `superseded` um `prepare` já vencido quando chegava o `prepare` seguinte, e o laço final pulava `superseded` antes de olhar o vencimento. O `HOLD_EXPIRED` sumia em dois casos, reproduzidos com o módulo real via `tsx`: (A) `prepare` → `confirm` `FAILED` com `APPOINTMENT_HOLD_EXPIRED` → novo `prepare`, que é o caminho real de `holdExpiredAlternatives` e o cenário QA A-01 que o CV-03 quer mostrar; (B) `prepare` vencido pelo relógio → novo `prepare`. O §1 só descarta reserva substituída **antes de vencer**.
2. **Testes da correção.** Faltavam três casos com relógio injetado: o caminho (A), o caminho (B) e o `prepare` → `prepare` antes do vencimento, que continua sem `HOLD_EXPIRED`. O controle negativo 2 do §7 precisava rodar de novo depois da edição.
3. **Documentos.** D-076 item 2, VALIDATION_GATE, CURRENT_STATE, FINAL_AUDIT §37 e `PUBLIC_API_V1.md` diziam que reserva substituída nunca vence. Precisavam dizer "substituída antes de vencer", com as contagens da nova execução.

## Rodada 2 — ACCEPTED (0 blockers)

- **B1:** `conversation-events.ts:116-123` marca `superseded` só quando o hold anterior não venceu. Vencido quer dizer `provenExpiredByFailedConfirm`, ou `holdExpiresAt` menor ou igual ao `occurredAt` do novo `prepare`. Conferido com o módulo real via `tsx` em cinco cenários: (A) sai `HOLD_EXPIRED` do primeiro hold; (B) idem; (C) só a prova por `confirm` `FAILED`, com o hold ainda no prazo, sai `HOLD_EXPIRED`; (D) caminho A-01 completo, com `confirm` depois do novo `prepare`, sai `HOLD_EXPIRED` do primeiro hold e `APPOINTMENT_CREATED`; (E) `prepare` substituído antes de vencer não sai `HOLD_EXPIRED`.
- **B2:** três casos novos com relógio injetado em `goal070-conversation-events.test.ts`. O fixture antigo foi ajustado de forma coerente: o vencimento do hold1 passa a ficar depois do prepare2. Os dois arquivos `goal070-` do ai-orchestrator passam **13**/**13**.
- **B3:** D-076 item 2, VALIDATION_GATE, CURRENT_STATE, FINAL_AUDIT §37 e `PUBLIC_API_V1.md` dizem "substituída antes de vencer", com o corolário do hold já vencido. Contagens registradas: **9**, **13** e **1112**.
- A comparação dos patches r1 e r2 mostra que, entre os arquivos rastreados, só `PUBLIC_API_V1.md` e `docs/migration/` mudaram; a correção de código está no arquivo novo `conversation-events.ts`, que fica fora do `implementation.patch` por não ser rastreado.

Prova conferida na árvore final (unidades determinísticas da rodada 2, WU-06 a WU-19):

- `typecheck` e `lint` de `apps/ai-orchestrator`, `apps/bff` e `apps/frontend`: exit 0 nos seis.
- Testes dirigidos `goal070`: `apps/ai-orchestrator` **2** arquivos, **13**/**13**; `apps/bff` **1** arquivo, **6**/**6**; `apps/frontend` **1** arquivo, **5**/**5**.
- `test:gate`: **233**/**233** (baseline **227**, mais os **6** testes novos da semeadura).
- `git diff --check`: exit 0.
- `validate:core`: **17** passos, **15** `passed`, **2** `skipped`, **0** `failed`.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos. Nele, `rehearse:goal033-authenticated-ui` roda **65** testes, todos passando, com **0** retentativas.
- A suíte completa de `apps/frontend` (`test:frontend`, **76** arquivos e **704** testes; baseline 75/699) e a de `apps/ai-orchestrator` (**1112** testes passando) têm as contagens da Work Unit de documentação (WU-05) registradas em CURRENT_STATE, VALIDATION_GATE e FINAL_AUDIT §37. Nenhuma suíte encolheu.
- Os cinco controles negativos do §7 têm saída colada em FINAL_AUDIT §37.

### Observações não bloqueantes

1. **Ramo `provenExpiredByFailedConfirm` do supersede sem teste isolado.** O caso de teste (1) do B2 usa um hold que também venceu pelo relógio. O cenário C, reproduzido nesta revisão, confirma o comportamento, mas nenhum teste da suíte o isola.
2. **Instante de `HOLD_EXPIRED` provado só por `confirm` `FAILED`.** O evento usa `occurredAt = holdExpiresAt`, que pode estar no futuro e ordenar a linha depois do `prepare` seguinte. Era a semântica da rodada 1 e segue o §1 do Goal ("o instante do evento é o `holdExpiresAt`").
3. **`PUBLIC_API_V1.md` incompleto frente ao §3.** A seção nova não diz que o evento some com a purga de conteúdo nem que remarcação, cancelamento e série recorrente não aparecem. D-076 e FINAL_AUDIT §37 dizem as duas coisas. O arquivo fica fora do escopo de escrita deste fechamento; a lacuna fica para o próximo Goal que tocar a seção de Conversas.
4. **Contrato com `z.string()` nos instantes.** `occurredAt` e `holdExpiresAt` usam `z.string()` em `conversationEventSchema`, e não o `isoDateTimeSchema` que o contrato já tem.
5. **Um evento recusado pelo schema derruba a lista inteira de eventos,** não só ele. As mensagens continuam visíveis, como o §4 exige; o que se perde são as outras linhas de evento da mesma leitura.
6. **Ajustes mecânicos em `assistant.service.test.ts`.** Os três literais (205→206 arquivos, 41→42 ocorrências de `this.http.`, linha 705→743 de `person_typed_text`) são os números que a própria árvore produz. Nenhuma categoria, isenção ou identificador mudou.
7. **As observações abertas herdadas continuam abertas**: as do [review059](059-review.md), inclusive a intermitência de `goal008-agenda` (observação 4), e as que ele herdou.

### O que este aceite não cobre

- Não prova que o modelo real chama `prepare`/`confirm` no momento certo (D-050).
- Não prova fidelidade visual das linhas de evento ao protótipo aprovado. Essa conferência é humana (Goal069). O texto de `HOLD_EXPIRED` não tem referência no protótipo.
- Remarcação, cancelamento e série recorrente não aparecem na conversa, por limite declarado em D-076.
- Nenhum achado A-01…A-24 foi corrigido ou reclassificado. A auditoria segue com **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §37](../FINAL_AUDIT.md)).

### Correções de registro feitas no fechamento

- **D-076 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review, a contagem de rodadas e uma nota de fechamento. A decisão não mudou.
- **FINAL_AUDIT §37** passa a citar D-076 como `ACCEPTED`. Ganha uma nota com as contagens de `validate:core`, `validate:ui` e `validate:integration` da rodada 2, que a seção deixava para WU-06 a WU-19.
- **CURRENT_STATE** (delta Goal070) tinha dois erros de registro: dizia **11** testes novos de `buildConversationEventToolCalls`, quando são **6** (`test:gate` 227→233); e afirmava que `PUBLIC_API_V1.md` cita a purga e os limites, o que não cita (observação 3). Os dois foram corrigidos, e o delta ganha as contagens dos passos agregadores.
- **VALIDATION_GATE** (seção Goal070) ganha as contagens dos passos agregadores da rodada 2 e o link para o delta de CURRENT_STATE acompanha o título atualizado.
- **O status do documento do Goal070 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
