# Review formal — Goal 003

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-07, em review **DEEP dirigido** conforme exigido pelo [Goal003](../goals/003-tenant-sessao-vinculo-whatsapp.md). Aceite restrito ao diff identificado abaixo; não representa commit, deploy, merge, execução hospedada de CI, WhatsApp real, rotação de produção nem prova em navegador.

A rodada 1 é histórica: CHANGES_REQUIRED com três blockers, todos fechados na rodada 2. Nenhum foi reaberto e nenhum aceite anterior (001/002) foi reavaliado.

## Escopo e identidade do diff

- Baseline aceita vigente: `1e874e2785d2bc78860db0eb571ea901a4395c17` (fechamento002). Base imediata da implementação: `99a7210101f481b994a008a57c4f663bc3d5c566`, HEAD da worktree `.ai-worktrees/goal-003` (branch `ai-loop/goal-003`), inalterado durante as duas rodadas. O diff funcional revisado é `99a7210` → worktree; o conteúdo entre a baseline aceita e `99a7210` é documentação de migração, harness `tools/ia-loop/` e scripts, preservado sem alteração.
- Snapshot aceito, calculado pelo IA Loop no aceite: **73 arquivos** (48 rastreados modificados, +2492/−306, e 25 novos), hash do diff `6e75dadcc2ce76b764187b61bd2fbc9d18fbb865ddee5707aeb1bf12820b81db`. A lista está no contexto de fechamento do IA Loop (`003-r2`); mudança posterior nesses arquivos exige avaliar o novo diff.
- O executor relatou na rodada 2 que as correções já estavam na worktree quando a sessão começou, vindas de uma execução anterior e interrompida do mesmo job, e que sua contribuição foi conferência e execução dos gates. O reviewer inspecionou o conteúdo real dos arquivos independentemente dessa procedência.
- Inspecionados: patch completo de cada rodada e todos os arquivos novos; callers diretos — `tenant-context.ts`, `tenant/context.ts`, `app.ts`, clientes internos do BFF (IA, Scheduling, Evolution), `registry.ts`/`ProductRuntime.tsx`/`next.config.ts`/`render.yaml` do frontend, `InboundMessageProcessor.ts`, `redact.ts`, `EvolutionInboundMapper.ts`, chamadas de `InsertMessage`/`GetLatestMessageID`/`DeleteAllMessages` no Go e os testes de cada suíte. Graphify não foi usado: os pontos materiais foram confirmados diretamente no código.
- Nenhum arquivo foi editado pelo reviewer durante as rodadas. Bancos usados nas reproduções foram descartáveis e criados pelo próprio reviewer; os bancos shadow criados na rodada 1 foram removidos e o cluster da rodada 2 foi parado.

## Rodada 1 — CHANGES_REQUIRED, 2026-09-07

Verificado como sólido já na primeira rodada e mantido na segunda:

- **G-35:** `Message.instance_id` carregado apenas do contexto autenticado (handler/service) ou da instância que produz o evento (`whatsmeow.go`); chave `(instance_id, message_id)`; `InsertMessage` recusa dono vazio; leituras, último ID por `source` e exclusão escopadas; `POST /message/status` responde 401 antes de ler o body e devolve `result` nulo byte a byte idêntico para ID alheio e desconhecido; linhas legadas sem dono preservadas e inalcançáveis; expand no boot e corte explícito por `EVOLUTION_MESSAGE_OWNERSHIP_CUTOVER=true`, recusado sem o índice composto. A limpeza em `instance_repository.Delete` filtrava por `source` (telefone) e nunca casava; passou a filtrar por `instance_id`.
- **Credenciais internas:** derivação `HMAC-SHA256(INTERNAL_SERVICE_TOKEN, "atendly:internal:v1:<chamador>:<audiência>:<uso>")` idêntica no BFF, na IA e no Scheduling; o segredo raiz bruto não é aceito por nenhum receptor; escopos da IA mapeados por método e caminho com `internal:unmapped` negado; `trustedTenantContext` perdeu o fallback de primeira `ChannelConnection` ativa; Scheduling identifica o chamador pela credencial e recusa audiência divergente.
- **Sessão:** `UserSession` consultada a cada requisição; `sid` no JWT; JWT antigo sem `sid` recebe `SESSION_REAUTH_REQUIRED` sem criar sessão; logout revoga a sessão corrente; troca e reset de senha revogam todas; Bearer inválido não cai no cookie presente; header declaratório não autentica.
- **Vínculo:** `findLinkedInstance` compara resolução por tenant e por usuário e recusa ausência de dono, dono divergente e linhas concorrentes; nenhum caminho adota a primeira associação nem infere dono por telefone.
- **Cifra:** envelope AES-256-GCM com AAD do vínculo nos dois lados (BFF e IA), key-id/versão, rotação na leitura, sem queda para chave global; segredos fora de `raw`, `details` e payload persistido.

Evidência reproduzida pelo reviewer na rodada 1: `validate:integration` 6/6 contra cluster descartável (22 testes de integração do BFF, ensaio M0 com 6→6 linhas, 2 vínculos resolvidos e 4 pendentes, `go test` de handler e repository); suítes de segurança e provider da IA 26/26; `git diff --check` exit0; `prisma migrate diff` entre o banco de teste migrado do BFF e `schema.prisma` sem diferença. O mesmo diff para a IA foi inconclusivo porque o cluster local não tem a extensão `vector`.

Blockers registrados, todos com correção específica exigida:

### R1-01 — P1: CSRF inoperante em produção por cookie cross-host

`BffHttpClient` lia o token do cookie `atendly_csrf` via `document.cookie`. Em produção (`render.yaml`) o browser chama o BFF diretamente em `https://atendly-ia-bff.onrender.com` a partir de `https://atendly-ia-frontend.onrender.com` (`registry.ts` usa `NEXT_PUBLIC_BFF_URL`, `credentials: "include"`, `COOKIE_SAME_SITE=none`). O cookie é gravado no host do BFF e é ilegível pelo script do frontend — hosts distintos, e `onrender.com` está na public suffix list —, então toda mutação por cookie, inclusive `POST /v1/auth/logout`, receberia 403 `CSRF_TOKEN_REJECTED`. Em desenvolvimento funcionava porque cookies de `localhost` ignoram porta, e o frontend não tinha suíte automatizada. Exigido: canal legível cross-origin (corpo ou header de resposta exposto no CORS, guardado em memória) ou rewrite same-origin; teste do adapter sem cookie jar; logout funcional; `PUBLIC_API_V1.md`.

### R1-02 — P1: perda de eventos inbound na transição do webhook

`evolutionWebhook.routes.ts` chamava `resolveChannelCredential(connection)` de forma eager, antes do 202 e antes de `handleInboundMessage`. A migration da IA deixa todo `ChannelConnection` existente em `credentialVersion` 0, então após o deploy todo webhook de tenant já conectado lançaria `CHANNEL_CREDENTIAL_NOT_PROVISIONED` sem persistir a mensagem do cliente, e o reprovisionamento só acontecia em connect/reconnect. Violava "não perder eventos silenciosamente durante a transição". Exigido: resolução preguiçosa no envio, caminho de reprovisionamento sem reconexão manual, teste do inbound em `credentialVersion` 0 e ordem de corte documentada.

### R1-03 — P2: vínculo pendente sem caminho de resolução

`instance-link.ts` recusava a linha legada pendente com "Reconnect the number to restore access", mas connect, reconnect e `DELETE /v1/whatsapp` chamavam `findLinkedInstance` primeiro e devolviam o mesmo 409: não havia autoatendimento nem procedimento documentado. Exigido: descarte pelo próprio dono via `DELETE /v1/whatsapp` ou procedimento operacional documentado, mensagem corrigida e teste de integração.

## Rodada 2 — ACCEPTED, 2026-09-07

### R1-01 — CLOSED

`apps/bff/src/lib/session.ts` deriva o token de CSRF por sessão (`HMAC(JWT_SECRET, "atendly:csrf:<sid>")`) e guarda o hash; `auth.ts` emite o token no cookie legível e no header de resposta `x-csrf-token`; `app.ts` expõe esse header no CORS somente para `FRONTEND_ORIGIN` e um hook `onSend` o anexa a toda resposta autenticada por cookie, inclusive 403, sem sobrescrever o header de um handler que estabeleceu sessão nova. `requireAuth` registra `request.session` antes das provas de CSRF apenas para esse hook; `request.user` continua sendo definido só depois das provas, e `currentSession` não tem callers. Requisições anônimas e Bearer não recebem o header. `BffHttpClient` guarda o token em memória, reenvia na mutação seguinte e mantém `document.cookie` só como segunda opção; `BffAuthService.logout` descarta o token. `apps/frontend/tests/bff-http-client.test.ts` (6 casos, ambiente `node`, sem `document`, `fetch` injetado) cobre emissão pela resposta anterior, recuperação após reload, refresh a partir de 403, logout com prova válida e ausência de token em método seguro; `validate:core` deixou de pular `test:frontend`. O BFF cobre entrega cross-host, ausência para anônimo/Bearer e 403 que devolve o token vigente. `PUBLIC_API_V1.md` documenta os dois canais.

### R1-02 — CLOSED

`EvolutionProvider` aceita `string | (() => string)` e resolve só em `sendText`, sem queda para `EVOLUTION_API_KEY`; o webhook passa `() => resolveChannelCredential(connection)`. `tests/security/webhook-credential-transition.test.ts` prova que um vínculo em `credentialVersion` 0 tem o inbound processado (`handleIncomingText` chamado) e nenhuma chamada ao transporte, e que após a reprojeção o envio usa a credencial da instância, não a chave global. `GET /v1/whatsapp` reprojeta a credencial na IA de forma idempotente e tolerante a falha (`warn`, sem derrubar a leitura); nenhum código da IA altera `ChannelConnection.status` para outro valor além de `ACTIVE`, então a reprojeção não reativa nada. Ordem de corte registrada em [VALIDATION_GATE](../VALIDATION_GATE.md#ordem-de-corte-do-goal003).

### R1-03 — CLOSED

`resolveLinkState` separa `pending` (linha do próprio usuário autenticado, sem linha do tenant) de `divergent` (duas linhas, ou dono de negócio diferente do usuário). `findLinkedInstance` continua recusando ambos com 409; `DELETE /v1/whatsapp` descarta a linha pendente do dono, remove a instância remota pela credencial administrativa e recusa a divergência sem apagar nada. A mensagem cita a rota existente. Testes: descarte pelo dono seguido de novo vínculo; recusa do descarte na divergência com contagem inalterada.

### Evidência reproduzida pelo reviewer na rodada 2

Ambiente: Windows 11, PostgreSQL 18 descartável criado pelo reviewer em `127.0.0.1:55434` (os clusters deixados pelo executor em 55432/55433 estavam inoperantes por erro 487 de memória compartilhada e não foram tocados).

| Execução | Resultado |
| --- | --- |
| `npm run validate:core` | **PASSED — 13 passed, 0 failed, 4 skipped** (`test:bff`, `test:scheduling-service`, `test:contracts`, `test:health-worker`), 0 not_run. IA 10 arquivos/65 testes; frontend 1 arquivo/6 testes; Go build/vet/test 9 pacotes `ok`; gate-scripts e auditoria estática 14/0/1 |
| `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55434/atendly_bff_test npm run validate:integration` | **PASSED — 6/6**: client Prisma, `migrate deploy`, BFF 3 arquivos/**27 testes**, ensaio da migration de vínculo (6→6, 2 resolvidos, 4 pendentes, retomada sem mudança, unicidade por negócio, tabela de sessão vazia), provisionamento do banco do Evolution e `go test ./pkg/message/...` |
| `eslint --max-warnings=0` em frontend, BFF e IA; `tsc --noEmit` no frontend | exit0 nos quatro |
| `git diff --check` | exit0 |

### Observações não bloqueantes

Registradas para o próximo Goal ou fechamento; nenhuma altera o aceite:

1. `resolveLinkState` classifica como pendente qualquer linha do usuário quando não há linha do tenant, sem exigir `tenantId` nulo; inalcançável com a associação única por usuário vigente, mas deve ser endurecido para `divergent` quando `tenantId` apontar outro negócio.
2. `GET /v1/whatsapp` grava uma projeção nova na IA a cada leitura (o painel de conexão consulta a cada 3s durante a janela de pareamento), e o `warn` de falha registra só `error.name`, perdendo o código.
3. Resposta gerada durante a janela de transição fica sem reenvio; limitação documentada, pertencente ao outbox do Goal004.
4. `apps/ai-orchestrator/prisma/schema.prisma` não declara `@@index([credentialVersion])` em `ChannelConnection`, embora a migration crie `ChannelConnection_credentialVersion_idx`; um `migrate dev` futuro derrubaria o índice.
5. `apps/ai-orchestrator/.env.example` repete `INTERNAL_SERVICE_TOKEN`.
6. `ensureInstance` cria a instância no Evolution antes de selar a credencial; sem `WHATSAPP_CREDENTIAL_KEYS` a selagem falha e deixa instância órfã no transporte.
7. Na fase expand, o mesmo `message_id` em duas instâncias ainda falha pela unicidade global legada — reconhecido no relatório do executor.
8. O produtor Go continua enviando `instanceToken` no payload e `webhook_producer.go` continua logando a URL com o token de query; o consumer descarta e sanea. Fora do diff003; retirada no Goal004.

### Limites

Sem prova em navegador real do CSRF cross-host (coberta por suíte do adapter e do BFF), sem execução hospedada da CI, sem corte do Go em banco implantado, sem `migrate diff` conclusivo para a IA (pgvector ausente no cluster local), sem deploy, WhatsApp real ou credencial real em fixture.

## Aceite e encaminhamento

- **G-35 fechado** com evidência RED/GREEN e testes A/B contra PostgreSQL real; gate 003→004 satisfeito. **G-02 fechado** no escopo do MVP. **G-03 fechado** para sessão, CSRF e revogação; gates de conta ativa/exclusão permanecem no Goal022. **G-04 parcialmente fechado**: cifra, projeção e saneamento entregues; retirada do segredo no produtor Go fica para o Goal004.
- D-004 passa a ACCEPTED para este diff; os contratos adotados estão em D-019. TARGET_ARCHITECTURE, CURRENT_STATE, GAP_ANALYSIS, DATA_MIGRATION, MASTER_PLAN e REUSE_ANALYSIS foram alinhados no fechamento; o SHA do commit de fechamento será registrado em MIGRATION_STATUS pelo IA Loop na etapa posterior, conforme D-017/D-018.
- Nenhum Goal seguinte foi criado nem marcado READY nesta etapa. A reavaliação incremental do roadmap acontece depois do commit de fechamento.
