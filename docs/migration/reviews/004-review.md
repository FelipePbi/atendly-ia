# Review formal — Goal 004

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-07, em review **DEEP dirigido** — persistência, concorrência e efeitos externos — conforme o [Goal004](../goals/004-transporte-mensagens-duraveis.md). Aceite restrito ao diff identificado abaixo; não representa commit, deploy, merge, execução hospedada de CI, WhatsApp real nem capacidade de execução contínua contratada.

A rodada 1 é histórica: CHANGES_REQUIRED com quatro blockers, todos fechados na rodada 2. Nenhum aceite anterior (001–003) foi reavaliado.

## Escopo e identidade do diff

- Baseline aceita vigente: `588b70f575670eeda015750b400a09752ceb5490` (fechamento003). Base imediata da implementação: `b3a019c94b8e89f48db5ab017866ff9e325d7d82`, HEAD da worktree `.ai-worktrees/goal-004`, inalterado nas duas rodadas. O conteúdo entre a baseline aceita e `b3a019c` é harness do IA Loop e documentação de planejamento, preservado.
- Snapshot aceito, calculado pelo IA Loop: **53 arquivos** (32 rastreados modificados, +1504/−215, e 21 novos), hash do diff `03fc744adc4d9cdb59b592d226cda0023af47b6fea0b765fb0b0284eef27caf3`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- O executor relatou na rodada 2 que a worktree já continha correções de comportamento para os blockers ao iniciar a sessão, ainda sem prova executável; o reviewer inspecionou o código real independentemente dessa procedência.
- Inspecionados: patch completo de cada rodada e todos os arquivos novos; callers diretos — guard de idempotência em `message-graph.ts`, `IdempotencyStore.buildEventKey`, `EvolutionInboundMapper` (classificação, recibo, origem de `instanceId`/`messageId`), `InboundMessageProcessor.handleInboundBatch`, `InboundEventDispatcher`, `InboxWorker`, `internal/routes.ts`, clientes/DTOs do BFF e frontend, `whatsmeow.go` (montagem de `postMap`, bloco de `Receipt`), `send_service.go` (uso do `id` do envio como ID do WhatsApp), `webhook_producer.go`, `main.go` e todas as suítes. Graphify não foi usado.
- Nenhum arquivo foi editado pelo reviewer nas rodadas. Bancos usados nas reproduções foram descartáveis, criados e parados pelo próprio reviewer (portas 55435 e 55436).

## Rodada 1 — CHANGES_REQUIRED, 2026-09-07

Verificado como sólido já na primeira rodada e mantido na segunda:

- **Recepção:** o webhook saneia, classifica e persiste antes do 202; falha ao persistir devolve 5xx; duplicata devolve 202 sem novo efeito; eventos técnicos recebem 2xx (registrados ou descartados por tipo) em vez do 400 que fazia o produtor repetir cinco vezes; `Receipt` vira trabalho de reconciliação; vínculo não resolvido devolve 503, porque 4xx passou a ser recusa definitiva no produtor.
- **Inbox:** `ProcessedEvent` expandido com estado, tentativas, `nextAttemptAt`, lease (dono, token, expiração), supersede, resultado e erro; claim com `FOR UPDATE SKIP LOCKED`, lock consultivo por conversa e fencing por `leaseToken`; só lease expirado é recuperado; dead-letter visível no painel (`inboxDeadLetters`) sem reenvio em massa; chave de conversa `tenant:canal:contato`.
- **Outbox:** saída persistida em `Message` antes do transporte com `correlationId` estável e `deliveryState` PENDING/SENT/FAILED/UNKNOWN; timeout de envio (`EVOLUTION_SEND_TIMEOUT_MS`) classificado como UNKNOWN sem apagar a tentativa; 4xx do transporte é FAILED; retry só quando a falha ocorreu antes do envio; envio do dono deixou de fazer `delete` e devolve 202 com o estado real; reconciliação por recibo casa `correlationId` ou `externalMessageId`, escopada a tenant e canal.
- **Contrato do recibo:** `myEventHandler` inicializa `postMap["data"]` com o próprio evento, então `MessageIDs`, `Type` e `Timestamp` chegam à IA e `state` traz Delivered/Read/ReadSelf; o `id` do envio vira o ID do WhatsApp em `SendRequestExtra`.
- **Go:** `instanceToken` removido dos sete pontos do `whatsmeow.go` e dos dois do `send_service.go`; `webhook_deliveries` criada por `AutoMigrate` aditivo; tentativa persistida antes da goroutine; 2xx conclui, 4xx definitivo, 5xx/timeout pendente; retomada no boot resolvendo o destino real pela instância; destino redigido nos logs.
- **Migration:** aditiva e idempotente; `ProcessedEvent` legado → LEGACY, OUTBOUND legado → UNKNOWN com motivo, INBOUND sem estado; resíduos do Goal003 corrigidos com teste.

Evidência reproduzida na rodada 1: `validate:integration` 10/10 em cluster próprio (ensaio 004 com LEGACY=3, OUTBOUND/UNKNOWN=2, INBOUND/null=1; 12 testes de durabilidade contra PostgreSQL; outbox do Go); `validate:core` com todos os passos observados passando até a auditoria estática; suíte unitária da IA 105/105; lint do BFF e `tsc` do frontend limpos; testes dos scripts de gate 23/23; `git diff --check` exit0.

Blockers registrados:

### R1-01 — P0: mensagem única do worker descartada como duplicata

O webhook gravava `ProcessedEvent` com `eventKey` `evolution-go:<instanceId>:<messageId>`; no worker, `handleInboundBatch` com uma mensagem chamava `handleInboundMessage` sem `eventAlreadyGuarded`, o guard do grafo chamava `idempotency.remember` com a mesma chave, a unique disparava P2002 e o grafo encerrava com `duplicate`. Nenhuma mensagem isolada seria respondida; só lotes de duas ou mais funcionavam. Sem teste cobrindo o caminho.

### R1-02 — P1: bloqueio de fila pelo evento mais antigo

`claimNext` selecionava só a cabeça global (`LIMIT 1`); com a conversa dela ocupada, devolvia null e o worker encerrava o ciclo, parando todas as outras conversas.

### R1-03 — P2: janela de fragmentos regredida e espera ambígua ausente

A janela persistida era fixa em `AI_DEBOUNCE_MIN_SECONDS`, sem a política adaptativa do baseline, e a espera de mensagem ambígua do §2 do Goal não existia.

### R1-04 — P2: lint da IA com três erros

## Rodada 2 — ACCEPTED, 2026-09-07

### R1-01 — CLOSED

`handleInboundBatch` passa `eventAlreadyGuarded: true` em todos os caminhos do lote, inclusive o de uma mensagem; `handleInboundMessage` aceita `InboundExecutionOptions` e encaminha a flag ao `workflow.invoke`; o caminho legado sem a flag continua usando `remember`. O dedupe permanece na chave única gravada antes do 202. `tests/integration/inbox-dispatch.test.ts` roda `InboundEventDispatcher` com `InboxStore`, `IdempotencyStore`, `PrismaGraphRuntime` e `HandoffService` reais contra PostgreSQL, com modelo e transporte simulados: evento único reivindicado termina `replied` com um envio; reentrega é duplicata sem trabalho novo; lote agrupado responde uma vez, em ordem; evento inmapeável vira IGNORED.

### R1-02 — CLOSED

`claimNext` consulta candidatos (`candidateScanLimit`, 20) excluindo por `NOT EXISTS` conversas com PROCESSING de lease vivo, itera até uma conversa livre, fixa a linha com `FOR UPDATE SKIP LOCKED`, usa `pg_try_advisory_xact_lock` e refaz a checagem de ocupação. Teste: A em PROCESSING com o evento mais antigo pendente e evento de B → B reivindicada no mesmo ciclo, A continua serializada e é atendida após concluir.

### R1-03 — CLOSED

`inbox-policy.ts` reproduz a política adaptativa (mínimo, degraus para texto longo ou vários fragmentos, seguimento urgente encurtando, teto e max-wait desde o primeiro evento) e implementa a espera ambígua como heurística de transporte — primeiro contato sem histórico, um só fragmento e saudação curta — com `AI_AMBIGUOUS_WAIT_SECONDS` (120) e teto `AI_AMBIGUOUS_MAX_WAIT_SECONDS` (300). `InboxStore.applyConversationWindow` recalcula a janela sobre os pendentes da conversa e grava o mesmo `nextAttemptAt` no grupo, sem tocar linhas em backoff; o webhook a chama após o `record`. Cobertura: 7 casos de política pura, 5 de integração sobre a inbox persistida, 1 de fiação na rota. VALIDATION_GATE documenta os dez passos do gate e a seção "Transporte durável do Goal004".

### R1-04 — CLOSED

`eslint --max-warnings=0` exit0 na IA e no BFF; `tsc --noEmit` da IA exit0.

### Evidência reproduzida pelo reviewer na rodada 2

Ambiente: Windows 11, PostgreSQL 18 descartável criado pelo reviewer em `127.0.0.1:55436`, parado ao final.

| Execução | Resultado |
| --- | --- |
| `npm run validate:core` | **PASSED — 13 passed, 0 failed, 4 skipped** (`test:bff`, `test:scheduling-service`, `test:contracts`, `test:health-worker`). IA 16 arquivos/114 testes (22 pulados por exigirem banco); frontend 6; Go build/vet/test; gate-scripts; auditoria estática 14/0/1 |
| `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55436/atendly_bff_test npm run validate:integration` | **PASSED — 10/10**: BFF 28 testes; ensaio 003; ownership do Go; ensaio 004 (LEGACY=3, OUTBOUND/UNKNOWN=2, INBOUND/null=1, tabelas de apoio sem linhas); client Prisma da IA; **22 testes** de durabilidade e dispatch contra PostgreSQL; outbox do webhook Go |
| `eslint --max-warnings=0` na IA e no BFF; `tsc --noEmit` na IA | exit0 |
| `git diff --check` | exit0 |

### Observações não bloqueantes

1. O lease da inbox (120 s) não é renovado durante a execução; LLM, tools e envio de até 15 s podem excedê-lo e permitir que outro ciclo reivindique o lote, com risco de resposta duplicada. Recomendação: heartbeat de lease ou lease maior que o orçamento de processamento, e documentar.
2. A espera ambígua termina em qualquer segundo fragmento; o vault admite estender até cerca de 5 min quando os fragmentos seguintes continuam ambíguos. Refinar no Goal005, junto da classificação.
3. `SUPPORT_SCHEMA` do ensaio duplica à mão tabelas do Prisma (`AiTenantConfig`, `AiRun`, `Handoff`) porque o cluster descartável não tem pgvector; risco de drift apenas em teste. O `migrate diff --from-migrations` da IA continua inconclusivo pelo mesmo motivo; `SHADOW_DATABASE_URL` está preparado.
4. No produtor Go, 429 e 408 são tratados como recusa definitiva (4xx).
5. `webhook_deliveries` guarda o payload integral, incluindo conteúdo de mensagem, sem retenção — entra no ciclo do Goal022.
6. A reconciliação por recibo depende de o WhatsApp honrar IDs customizados como `ai-<uuid>` (comportamento pré-existente, sem prova com transporte real); o fallback por `externalMessageId` cobre o caso com resposta do transporte. Saída já `FAILED` não é reaberta por recibo.
7. Vínculo não resolvido recebe 503, retentado pelo Go por cinco tentativas em cerca de 2,5 min antes de FAILED — janela de provisionamento a documentar na operação.
8. Capacidade de execução contínua do worker (instâncias e disponibilidade) permanece decisão de operação, não contratada.

### Limites

Sem WhatsApp real, deploy, CI hospedada, corte em banco implantado ou credencial real em fixture; o transporte foi exercitado com dobles, servidores locais e segredos sintéticos.

## Aceite e encaminhamento

- **G-05 fechado**; **G-09 fechado** no contrato e na persistência (composição visual do estado de entrega é do Goal017); **G-06 fechado na parte de transporte** (serialização por conversa, janela e espera sobre trabalho persistido; categoria, override e sessão ficam no Goal005); **G-04 fechado** — produtor Go sem `instanceToken` e sem token na URL dos logs.
- D-007 passa a ACCEPTED para este diff; os contratos adotados estão em D-020. CURRENT_STATE, GAP_ANALYSIS, DATA_MIGRATION, MASTER_PLAN, REUSE_ANALYSIS e TARGET_ARCHITECTURE foram alinhados no fechamento; o SHA do commit de fechamento será registrado em MIGRATION_STATUS pelo IA Loop na etapa posterior, conforme D-017/D-018.
- Nenhum Goal seguinte foi criado nem marcado READY nesta etapa.
