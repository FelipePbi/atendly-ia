# Review formal — Goal 078

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-29, conforme o [Goal078](../goals/078-instrucoes-privadas-por-servico.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–071, 073–076) foi reaberto, reavaliado ou revertido. **Quatro rodadas**: as rodadas 1, 2 e 3 terminaram `CHANGES_REQUIRED` com 3 blockers cada, e a rodada 4 terminou com zero. Só a rodada 1 teve blocker de código; os das rodadas 2 e 3 foram de documentação.

O Goal corrige **QA SV-04, só a parte "Instruções para a IA"**, da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e fecha o resíduo "regras privadas" de **G-17** do [GAP_ANALYSIS](../GAP_ANALYSIS.md). A instrução privada por serviço vira um `KnowledgeDocument` `GUIDANCE` com `source` reservada `service-instruction/<serviceId>`, sem migration. O orquestrador a entrega ao modelo em todo turno real do canal com o serviço em foco, com a regra de nunca revelar o texto. O BFF confere a posse do serviço antes de chamar a IA, e o formulário de Serviços ganha o campo. Decisão: [D-092](../DECISIONS.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `011de8f4944147ab365c58f270667fa040a9c7d2` (Goal076). Base imediata da implementação: `ac9b1a53e528d1d39b7a3d64060772915e34d24e`, HEAD da worktree `.ai-worktrees/goal-078`, inalterado nas quatro rodadas. O commit `ac9b1a5` é só documental (fechamento do Goal076 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **38 arquivos**, hash do diff `e53fe374061359524287503dd0c9af8258edb754a5f24e2869ae14e843eb1367`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **31 arquivos rastreados**, por `git diff --numstat ac9b1a5`:
  - `apps/ai-orchestrator/src/`: `knowledge/knowledge-document-service.ts` (+180/−2), `knowledge/pgvector-knowledge-store.ts` (+4), `graph/message-graph.ts` (+55/−1), `graph/graph-state.ts` (+7), `internal/routes.ts` (+51), `prompts/system.ts` (+33/−1), `channel/InboundMessageProcessor.ts` (+4), `channel/inbound-processor-factory.ts` (+7) e `assistant/assistant.service.ts` (+9).
  - `apps/bff/`: `modules/services/routes.ts` (+53), `clients/ai-orchestrator/index.ts` (+34), `lib/errors.ts` (+5) e `PUBLIC_API_V1.md` (+7/−1). `packages/public-api-contract/src/`: `schemas.ts` (+6) e `routes.ts` (+3).
  - `apps/frontend/src/`: `features/services/ServiceForm.tsx` (+65/−3), `data/services/BffServiceCatalogService.ts` (+29/−1), `features/services/ServiceList.tsx` (−17, `DirectorySourceStrip`) e `shared/styles/atendly.css` (−57, o CSS dela).
  - Testes existentes ajustados: `ai-orchestrator/tests/prompts/system.test.ts` (+86/−6), `tests/assistant/assistant.service.test.ts` (+11/−11), `tests/internal/knowledge.routes.test.ts` (+11), `tests/evals/harness.ts` (+8); no frontend, `goal015-shell-invariant` (+7), `goal058-service-form` (+5) e `goal076-service-form` (+5), só com stub do método novo do dublê.
  - Os cinco documentos de `docs/migration/`: `CURRENT_STATE.md` (+137), `DECISIONS.md` (+38, D-092), `FINAL_AUDIT.md` (+98, §53), `VALIDATION_GATE.md` (+36) e `GAP_ANALYSIS.md` (+1/−1, linha G-17).
- **Sete arquivos novos**: `apps/ai-orchestrator/src/modules/prompts/service-instructions.ts` (**44** linhas); os testes `goal078-service-instruction-store` (**488**), `goal078-service-instruction-delivery` (**312**), `goal078-service-instruction-routes` (**183**) e `evals/service-instructions.eval.test.ts` (**117**) no orquestrador; `apps/bff/tests/goal078-service-ai-instruction.integration.test.ts` (**264**); e `apps/frontend/tests/goal078-service-instruction-form.test.tsx` (**372**).
- Hashes na árvore aceita, iguais aos citados em FINAL_AUDIT §53: `ServiceForm.tsx` `88d3bb553b745c6459d83a3d81ca6077f9f386e7`, `message-graph.ts` `be5e9c7ca5e8aa3eab1ff1cc18f09f8a8e04f9e7`, `service-instructions.ts` `14cb55df9718eabf8fee310a027000e4b2247342`, `pgvector-knowledge-store.ts` `45a2a307…`, `knowledge-document-service.ts` `35a0e02f…` e BFF `services/routes.ts` `eec77a0f…`.
- Nenhuma migration nem mudança de `schema.prisma`. Nenhuma exceção nova em `KNOWN_*`. Nenhum passo a menos em `validate:core` ou `validate:integration`. `e2e/routes.ts` e os specs Playwright ficam na baseline. Nenhum arquivo foi tocado em `apps/scheduling-service/`, `apps/evolution-go/`, `scripts/` ou `tools/ia-loop/`. O Product Vault, `docs/design-reference/` e `QA_LOCAL_REVIEW.md` não foram editados.

## Asserções mudadas em testes existentes

- `tests/prompts/system.test.ts`: a versão fixa passa de `prompt-v8-…` a `prompt-v9-…`, com o texto estático da seção nova coberto pela amostra fixa de `buildStablePromptContent`.
- `tests/assistant/assistant.service.test.ts`, quatro asserções sobre a árvore real, todas por código de produção novo deste Goal: linha de origem `message-graph.ts:1207`→`1261`, linha de origem `internal/routes.ts:756`→`769`, arquivos `.ts` varridos `208`→`209` (em dois testes) e ocorrências de `this.http.` em `apps/bff/src/clients/` `43`→`45`. A mudança `43`→`45` entrou pelo DIAG-001 da rodada 1, depois da primeira falha de `validate:core`.
- Os demais testes existentes só ganharam stub do método novo do dublê; nenhuma guarda foi apagada.

## Rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** O núcleo do orquestrador, do BFF e do contrato já estava correto. (1) Código: em `ServiceForm.tsx`, modo criação, se o `POST` salvava e o `PUT` da instrução falhava, a nova tentativa chamava `create` de novo, recebia `SERVICE_NAME_ALREADY_EXISTS` e a instrução nunca era gravada. (2) Evidência: faltavam o vermelho da baseline `011de8f` dos testes novos e a recontagem das três suítes de backend. (3) Documentação: D-092 dizia que só a versão de prompt mudou entre as asserções, e os documentos diziam que não houve edição de código depois das WU-01 a WU-04; o DIAG-001 tinha editado `assistant.service.test.ts`.
2. **Rodada 2 — `CHANGES_REQUIRED`, 3 blockers, só de documentação.** O blocker de código foi corrigido com o estado `createdServiceId`: o reenvio usa `PATCH` com o id devolvido pelo primeiro `POST`, e um teste novo prova isso. Vermelho da baseline e recontagem entregues (`1136`/`502`/`448`). As quatro asserções de `assistant.service.test.ts` passaram a constar em D-092. Pendentes: as frases de "árvore final das WU-01 a WU-04 / sem edição de código desde então" continuavam em seis lugares, e a correção entrou como nota acrescentada; vermelho e recontagem ausentes de CURRENT_STATE e VALIDATION_GATE; e a seção dos controles não dava a proveniência de cada um. O Tech Lead reexecutou os controles 1, 2, 4, 5, 6 e 7, com o defeito só em memória: o controle 7 dá `expected 502 to be 404`, e não "recebe 200 e chama a IA", como dizia o documento.
3. **Rodada 3 — `CHANGES_REQUIRED`, 3 blockers, só de documentação.** Diff fora de `docs/migration/` byte-idêntico ao da rodada 2. O Developer tinha reaplicado os controles 1, 2, 4, 5, 6 e 7 como evidência nova, mas acrescentou cláusulas onde o blocker pedia reescrita no lugar. O grep exigido ainda devolvia seis linhas do Goal078, D-092 "Prova" não tinha sido tocado, o `1128` seguia atribuído à execução da rodada 1, a tabela de §53 trazia o hash antigo de `ServiceForm.tsx` (`04d9bd8e…`) e o item 7 ainda dizia "200". Faltava dizer que a recontagem é o piso. O perfil do Developer foi trocado para `OPUS_MEDIUM`.
4. **Rodada 4 — `ACCEPTED`, zero blockers.** Nenhuma edição de código; fora de `docs/migration/`, diff idêntico ao da rodada 3. O FIX-001 reescreveu no lugar D-092 "Prova", a abertura, a "Execução final", a tabela de hashes e a lista de controles de §53, e os resumos de CURRENT_STATE e VALIDATION_GATE.

## Conferência da rodada 4

- **Blocker 1:** o grep `árvore final (entregue pelas|das) WU-01 a WU-04|sem edição de código (desde então|depois dos gates|entre as duas)|posterior à última edição de código das WU-01` devolve só DECISIONS:4576, FINAL_AUDIT:6303 e VALIDATION_GATE:3139, as três do Goal076/§52. D-092 "Prova" aponta a execução vigente das WU-15 a WU-18 da rodada 2 e diz que a rodada 3 não editou código. §53 declara substituída a execução da rodada 1, sem o `1128` (a WU-04 contou `1127`). A tabela de hashes traz `88d3bb55…` como vigente e `04d9bd8e…` como hash da WU-19 da rodada 1. Os seis hashes batem com `git hash-object` na árvore.
- **Blocker 2:** o item 7 traz `AssertionError: expected 502 to be 404`, e o item 8 traz `2 failed | 7 passed (9)`. Cada controle diz a rodada de origem: 3 e 8 na rodada 2, por edição real; 4 na rodada 3, por edição real; 1, 2, 5, 6 e 7 na rodada 3, por transform em memória. CURRENT_STATE e VALIDATION_GATE repetem a mesma proveniência e o `502`.
- **Blocker 3:** CURRENT_STATE e VALIDATION_GATE dizem que a recontagem é o piso usado para comparar a execução final. O `1128` atribuído à rodada 2 é coerente: o frontend não mudou desde o FIX-001 da rodada 2.

## Evidência final aceita

Gates do IA Loop na rodada 4, todos exit 0, na árvore aceita: `typecheck` nos três apps (WU-05 a WU-07), `lint` (WU-08 a WU-10), testes dirigidos (WU-11 a WU-14: orquestrador `goal078` **34**/**34**, frontend **9**/**9**, `tests/knowledge` **26**/**26**; o `goal078` do BFF fica pulado fora de `validate:integration`), `validate:core` (WU-15: **17** passos, **15** `passed`, **2** `skipped`), `test:gate` (WU-16: **233**/**233**), `validate:ui` (WU-17), `validate:integration` (WU-18: **36**/**36** passos) e `git diff --check` (WU-20). Os `e2e-results` da rodada 4 têm `startTime` `2026-09-29T23:50:58Z` (público: **169** `passed`, **21** `skipped`, **0** `unexpected`, **0** retentativas) e `2026-09-29T23:54:10Z` (autenticado: **155** `passed`, **0** `unexpected`, **0** retentativas).

Contagens da execução final vigente (rodada 2), documentadas em [FINAL_AUDIT §53](../FINAL_AUDIT.md):

- `test:ai-orchestrator` **1177** passando e **93** pulados de **1270** (piso recontado na baseline: **1136**/**1229**, **+41**).
- `test:frontend` **109**/**1128** (baseline **108**/**1119**, **+1** arquivo e **+9** testes).
- `test:bff-integration` **59**/**455** (piso **58**/**448**, **+1** arquivo e **+7** testes). `test:scheduling-service` **37**/**502**, igual.
- Vermelho da baseline `011de8f`: orquestrador `Tests 32 failed | 5 passed (37)`, BFF `Tests 7 failed (7)`, frontend `Tests 9 failed (9)`.
- Os oito controles negativos do §7, com a proveniência acima. O Tech Lead reexecutou os controles 1, 2, 4, 5, 6 e 7 na rodada 2, com o defeito só em memória, e conferiu os mesmos resultados. Os controles 3 e 8 e o vermelho da baseline vêm do Developer.

## Observações registradas, sem mudar a decisão

1. **O textarea da instrução fica habilitado enquanto o `GET` está pendente.** Se a pessoa digitar antes da resposta, o `GET` que chega depois sobrescreve o texto digitado.
2. **Em `NETWORK_ERROR` no `PUT`**, `requestError` troca "Serviço salvo, mas…" pela mensagem genérica de rede, e a pessoa não fica sabendo que o serviço já foi salvo.
3. **Sem instrução, `buildSystemPrompt` ganha uma linha vazia a mais**, pelo `""` fixo depois da seção nova. Não muda o hash da versão.
4. **O controle 4 foi aplicado como lista vazia** no lugar de `focusServiceIds`, e não como leitura de todos os serviços do negócio, porque o grafo já filtra pelo foco. O controle ainda reprova o teste esperado.
5. **Resíduo "reconferido nesta unidade"** nos bullets de `test:gate`, `validate:ui` e `validate:integration` da "Execução final" da rodada 1 e em "O que esta seção não prova", em FINAL_AUDIT §53. É ambíguo, não falso, porque a seção declara essa execução substituída.
6. **Os `e2e-results` da rodada 2 foram sobrescritos** pelos reruns das rodadas 3 e 4, na mesma árvore de código e com as mesmas contagens.

As observações 1 e 2 são candidatas a ajuste quando outro Goal tocar o formulário de Serviços.

## O que o aceite não prova

- Que o modelo de produção, numa conversa real com uma instrução como a da henna e o serviço em foco, age conforme a instrução e não a repete à cliente. A regra é instrução ao modelo, não filtro de saída. A conferência humana do §9 do Goal **não foi feita**.
- Que o campo "Instruções para a IA", num aparelho real nas cinco larguras, bate com as opções abertas de `Servicos.dc.html`, `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html`. Mesma conferência humana, **não feita**.
- Que a instrução chega no primeiro turno sem serviço em foco, no modo sugestão ou no teste real da ativação. Os três ficam fora do Goal, como limites declarados em D-092.
- A fidelidade visual de Conversas e da central de notificações (Goal077) e do onboarding (Goal072).

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §53](../FINAL_AUDIT.md)).
