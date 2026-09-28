# Auditoria final do MVP — inventário de conformidade por critério

Documento do Goal030. Cada linha abaixo é **um critério de MVP** conferido
contra a árvore de código desta worktree, não contra a documentação que o
descreve. Uma auditoria que só relê documento repete o erro que ela deveria
encontrar: o diff028 e o diff029 mostraram gate verde sobre fato falso.

Origem dos identificadores (é de onde vêm os IDs, **não** é evidência de
conformidade): os gaps `G-01`–`G-35` e as cinco incertezas sem ID estão em
`docs/migration/GAP_ANALYSIS.md`; os gates `M0`–`M6` estão na §10 de
`docs/migration/DATA_MIGRATION.md`; as incertezas `U-01`–`U-03` estão em
`docs/migration/DECISIONS.md`; os guardrails estão em `AGENTS.md`.

## Como ler as quatro colunas

**Estado** — vocabulário fechado: `fechado`, `fechado em parte`, `aberto`,
`não aplicável ao MVP`.

**Evidência apontável** — `arquivo:linha`, nome exato de teste ou nome exato de
passo de gate. Nunca link para documento de migração: nenhum documento deste
diretório é evidência de si mesmo.

**Força** — vocabulário fechado:

| Força | Significa |
| --- | --- |
| `EXECUTADO` | existe passo de gate ou teste automatizado **nomeado na própria linha** que fica vermelho se o fato deixar de valer, e esse gate rodou verde nesta rodada |
| `INSPECIONADO` | o fato foi conferido na árvore (arquivo e linha citados), mas o auditor **não sabe nomear** o que ficaria vermelho se ele deixasse de valer |
| `DECLARADO` | só existe afirmação; não há artefato de código nem execução que a sustente |

A regra é assimétrica de propósito: quando não dá para nomear o que quebraria,
a força correta é `INSPECIONADO`, nunca `EXECUTADO`.

**Achado** — o que a conferência encontrou além do estado, quando encontrou.

## Procedência das execuções citadas

| Gate | Quem executou | Resultado |
| --- | --- | --- |
| `npm run validate:core` | esta unidade (Goal030/WU-10), 2026-09-20 | exit 0 — 15 passos: 13 `passed`, 0 `failed`, 2 `skipped` (`test:bff`, `test:health-worker`) |
| `npm run validate:integration` | Goal030/WU-09 desta rodada | exit 0, 88652 ms (resultado recebido da unidade; esta unidade não o reexecutou) |
| `npm run validate:ui` (gate de UI renderizada, Playwright) | Goal030/WU-08 desta rodada | exit 0, 48878 ms (resultado recebido da unidade; esta unidade não o reexecutou) |

Passo de gate citado sem qualificação pertence a um desses três comandos: os
passos de `validate:core` estão em `scripts/validate-core.mjs:22`; os de
`validate:integration` em `scripts/validate-integration.mjs`; os checks
nomeados do passo `audit:static` estão em `scripts/final-production-audit.mjs`.

## 1. Gaps de produto e implementação — G-01 a G-35

| Critério | Estado | Evidência apontável | Força | Achado |
| --- | --- | --- | --- | --- |
| G-01 — isolamento entre negócios no alvo WhatsApp | fechado | `apps/evolution-go/pkg/instance/handler/instance_authorization.go:34` (`authorizeInstanceTarget`), consumido em `instance_handler.go:591`; vermelho em `TestAdvancedSettingsAuthorizationOverGinChain` e `TestAdvancedSettingsRejectInvalidAuthenticatedContext` (passo `test:evolution-go`) | EXECUTADO | — |
| G-02 — um usuário/profissional/número por negócio | fechado | `apps/bff/prisma/schema.prisma:179` (`tenantId String? @unique`); vermelho em `apps/bff/tests/tenant-instance-link.integration.test.ts` (passo `test:bff-integration`) | EXECUTADO | A coluna é nulável por decisão declarada em `schema.prisma:177`: no PostgreSQL `@unique` não restringe múltiplos `NULL`, então o estoque legado ambíguo convive com a unicidade — é o guard de rota, não a constraint, que impede essas linhas de autorizarem uso |
| G-03 — sessão revogável e CSRF | fechado | `apps/bff/prisma/schema.prisma:72` (`model UserSession`), `apps/bff/src/lib/session.ts:10`, `apps/bff/src/lib/csrf.ts`; vermelho em `apps/bff/tests/session-csrf.integration.test.ts` e `apps/bff/tests/goal024-session-revocation.integration.test.ts` (passo `test:bff-integration`) | EXECUTADO | — |
| G-04 — segredos fora de log e payload | fechado | `apps/bff/src/lib/instance-credentials.ts:50` e `apps/ai-orchestrator/src/lib/channel-credentials.ts:38` (`createCipheriv("aes-256-gcm", …)`); vermelho em `apps/ai-orchestrator/tests/security/channel-credentials.test.ts` (passo `test:ai-orchestrator`) e no check `sensitive_log_redaction_is_configured` (passo `audit:static`) | EXECUTADO | — |
| G-05 — mensagem recebida não desaparece após aceite | fechado | `apps/ai-orchestrator/src/modules/channel/routes/evolutionWebhook.routes.ts:206` (202 só depois de persistir), `apps/ai-orchestrator/prisma/schema.prisma:458` (`model ProcessedEvent`); vermelho no passo `test:ai-orchestrator-transport-durability` | EXECUTADO | — |
| G-06 — janela de fragmentos e reavaliação | fechado | `apps/ai-orchestrator/prisma/schema.prisma:476` (`nextAttemptAt`), `apps/ai-orchestrator/src/modules/channel/InboundMessageProcessor.ts:295`; vermelho em `apps/ai-orchestrator/tests/inbox/inbox-worker.test.ts` (passo `test:ai-orchestrator`) e no passo `test:ai-orchestrator-transport-durability` | EXECUTADO | — |
| G-07 — controle humano pausa a IA na conversa | fechado | `apps/ai-orchestrator/src/modules/graph/message-graph.ts:601` (`assumeHumanControl`); vermelho em `apps/ai-orchestrator/tests/integration/human-control-graph.test.ts` (passo `test:ai-orchestrator-transport-durability`) e em `apps/ai-orchestrator/tests/session/human-control-across-sessions.test.ts` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| G-08 — inbox independe da decisão de IA | fechado | `apps/ai-orchestrator/src/modules/graph/message-graph.ts:221` e `:226` (`operationalGuard` só anota; `sessionGate` encerra depois da persistência); vermelho em `apps/ai-orchestrator/tests/inbox/inbox-policy.test.ts` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| G-09 — resultado real de envio | fechado | `apps/ai-orchestrator/prisma/schema.prisma:399` (`deliveryState`); vermelho em `apps/ai-orchestrator/tests/outbox/outbound-delivery.test.ts` (passo `test:ai-orchestrator`) e em `apps/frontend/tests/goal017-delivery-state.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-10 — Agenda Atendly como única agenda oficial | fechado | `apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql:51` (`CalendarSettings_source_atendly_check`), `apps/scheduling-service/prisma/schema.prisma:250`; vermelho no passo `rehearse:goal027-calendar-source-migration` e nos checks `no_legacy_calendar_migration_routes` e `no_calendar_migration_service_reference` (passo `audit:static`) | EXECUTADO | — |
| G-11 — atomicidade e replay idempotente | fechado | `apps/scheduling-service/prisma/schema.prisma:1278` (`effectEntityType`); vermelho em `apps/scheduling-service/tests/integration/goal008-agenda.test.ts` (passo `test:scheduling-integration`) | EXECUTADO | — |
| G-12 — sobreposição, remarcação e holds de 5 min | fechado | `apps/scheduling-service/prisma/schema.prisma:706` (`model AppointmentHold`) e `:734` (`expiresAt … @db.Timestamptz(3)`); vermelho em `apps/scheduling-service/tests/unit/appointment-hold.test.ts` (passo `test:scheduling-service`) e em `apps/scheduling-service/tests/integration/goal009-occupancy.test.ts` (passo `test:scheduling-integration`) | EXECUTADO | — |
| G-13 — agenda completa (Dia/Semana/Mês, exceções, bloqueios) | fechado | domínio em `apps/scheduling-service/tests/unit/goal009-occupancy.test.ts` e `apps/scheduling-service/tests/unit/goal016-time-blocks.test.ts` (passo `test:scheduling-service`); interface em `apps/frontend/src/features/agenda/AgendaBoard.tsx:54` (`type AgendaView = "day" \| "week" \| "month"`), vermelho em `apps/frontend/tests/goal016-agenda-views.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-14 — identidade do cliente por pessoa | fechado | `apps/scheduling-service/prisma/schema.prisma:342` (`model Customer`, telefone opcional e não exclusivo); vermelho em `apps/scheduling-service/tests/integration/customer-identity.test.ts` (passo `test:scheduling-integration`) e nos checks `no_global_phone_unique_constraint` e `no_tenant_scoped_phone_unique_constraint` (passo `audit:static`) | EXECUTADO | — |
| G-15 — clientes e memória autorizada | fechado | `apps/scheduling-service/prisma/schema.prisma:420` e `:440` (`aiAuthorized Boolean @default(false)` em `CustomerNote` e `CustomerTag`); vermelho em `apps/scheduling-service/tests/unit/customer-identity.test.ts` (passo `test:scheduling-service`) e em `apps/frontend/tests/goal015-customers.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-16 — acordo comercial com quatro preços e snapshot | fechado | `apps/scheduling-service/prisma/schema.prisma:57` (`enum PriceType`), `:460` (`Service.priceType`), `:690` (`priceTypeSnapshot`); vermelho em `apps/scheduling-service/tests/unit/agreement-total.test.ts` (passo `test:scheduling-service`) | EXECUTADO | — |
| G-17 — catálogo completo | fechado | `apps/scheduling-service/prisma/schema.prisma:466` (`needsReview`) e `:467` (`reviewOrigin`); vermelho em `apps/scheduling-service/tests/unit/service-catalog.test.ts` (passo `test:scheduling-service`) e em `apps/frontend/tests/goal015-services.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-18 — histórico com quatro estados e presença separada | fechado | `apps/scheduling-service/prisma/migrations/20260909181000_goal008_appointment_status/migration.sql:66` (`Appointment_status_check`); vermelho em `apps/scheduling-service/tests/unit/appointment-lifecycle.test.ts` (passo `test:scheduling-service`) e no passo `rehearse:goal008-agenda-migration` | EXECUTADO | — |
| G-19 — importação única com preview e conclusão explícita | fechado | `apps/scheduling-service/prisma/schema.prisma:1032` (`model ImportSession`), `:1176` (`model ImportItem`), `:1231` (`model ImportDecision`); vermelho em `apps/scheduling-service/tests/integration/goal010-import-completion.test.ts` (passo `test:scheduling-integration`) e no passo `rehearse:goal010-import-session-migration` | EXECUTADO | — |
| G-20 — fidelidade do dado importado | fechado em parte | `apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts` (validação por schema antes de qualquer mapeamento) e `types.ts`; vermelho em `apps/scheduling-service/tests/unit/minha-agenda-client.test.ts` e `apps/scheduling-service/tests/unit/minha-agenda-import-snapshot.test.ts` (passo `test:scheduling-service`) | EXECUTADO | O que está provado é o mapeamento contra payload sintético. **Nenhuma execução contra a origem real existe na árvore**: a capacidade efetiva da API Minha Agenda continua sendo incerteza aberta, e nenhum gate a cobre |
| G-21 — três estilos de IA, sem persona | fechado | `apps/ai-orchestrator/prisma/schema.prisma:106`–`:108` (`PROFESSIONAL`, `BALANCED`, `CASUAL`), `apps/ai-orchestrator/src/modules/prompts/style.ts:12`; vermelho em `apps/ai-orchestrator/tests/prompts/system.test.ts:27` ("prompt montado: sem persona, identidade transparente e versao por estilo") e em `apps/ai-orchestrator/tests/tenant-config/ai-conversation-style.test.ts` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| G-22 — privacidade da conversa e Ignorar IA | fechado | `apps/ai-orchestrator/prisma/schema.prisma:79`–`:81` (`COMMERCIAL`/`UNCLASSIFIED`/`PERSONAL`), `:269` (`Contact.ignored`), `:333` (`ConversationSession.category`); vermelho em `apps/ai-orchestrator/tests/internal/ignored-contacts.routes.test.ts` (passo `test:ai-orchestrator`) e em `apps/frontend/tests/goal017-inbox-tabs.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-23 — mídia entendida por tipo | fechado | `apps/ai-orchestrator/prisma/schema.prisma:420` (`model MessageAttachment`, só metadados); vermelho em `apps/ai-orchestrator/tests/media/media-metadata.test.ts` (passo `test:ai-orchestrator`), no passo `test:evolution-go-webhook-outbox` e no passo `rehearse:goal013-media-migration` | EXECUTADO | — |
| G-24 — conhecimento e sugestões | fechado | `apps/ai-orchestrator/src/modules/internal/routes.ts:966` (`/internal/knowledge/documents`), `apps/ai-orchestrator/src/modules/knowledge/knowledge-document-service.ts`; vermelho em `apps/ai-orchestrator/tests/internal/knowledge.routes.test.ts` (passo `test:ai-orchestrator`) e no check `rag_is_tenant_scoped` (passo `audit:static`) | EXECUTADO | — |
| G-25 — onboarding conclui sem WhatsApp; teste real ativa | fechado em parte | `apps/bff/src/modules/onboarding/routes.ts:206` (`POST /v1/onboarding/complete`); vermelho em `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` (passo `test:bff-integration`) e na etapa 2 do passo `rehearse:goal030-mvp-journey` (elo `onboarding-ai-block`) | EXECUTADO | A ativação por **envio real** de WhatsApp continua sendo gate operacional: `apps/ai-orchestrator/tests/activation-test/activation-test-service.test.ts` exercita o driver com dublê, e nenhum passo de gate chega à fronteira Evolution real |
| G-26 — dados do negócio consistentes, timezone único | fechado | `apps/bff/prisma/schema.prisma:138` (`timezone String @default("America/Sao_Paulo")`), `apps/bff/src/lib/timezone-reconciliation.ts`; vermelho no passo `rehearse:goal029-timezone-reconciliation` e na etapa 9 do passo `rehearse:goal030-mvp-journey` (elo `business-timezone`) | EXECUTADO | — |
| G-27 — até dois lembretes, defaults e notificação de mudança | fechado | `apps/scheduling-service/prisma/schema.prisma:273` (`model ReminderSettings`) e `:293` (`model ReminderRule`), com `ReminderRule_slot_check` em `apps/scheduling-service/prisma/migrations/20260915120000_goal021_reminder_schedule/migration.sql:178`; vermelho no passo `rehearse:goal021-reminder-migration`, em `apps/scheduling-service/tests/unit/reminder-service.test.ts` (passo `test:scheduling-service`) e na etapa 7 do passo `rehearse:goal030-mvp-journey` (elo `reminder-rule`) | EXECUTADO | — |
| G-28 — central de notificações e alerta externo | fechado em parte | central: `apps/bff/prisma/schema.prisma:396` (`model TenantNotification`) e `:428` (`model NotificationPreference`); vermelho em `apps/bff/tests/goal022-notification-center.integration.test.ts` (passo `test:bff-integration`) e na etapa 8 do passo `rehearse:goal030-mvp-journey` (elo `notification-read`) | EXECUTADO | **Alerta externo continua aberto e sem código**: busca por `nodemailer`, `sendgrid`, `resend` e `smtp` em `apps/*/src/**/*.ts` não retorna nenhuma ocorrência. Não existe provider de e-mail crítico na árvore; depende de U-03 |
| G-29 — retenção de conteúdo e ciclo de vida da conta | fechado em parte | `apps/bff/prisma/schema.prisma:238` (`model RetentionSettings`), `:270` (`model RetentionSweepState`), `:331` (`model AccountDeletion`); vermelho no passo `test:ai-orchestrator-content-purge`, em `apps/bff/tests/goal025-account-lifecycle.integration.test.ts` (passo `test:bff-integration`) e nas etapas 10 e 11 do passo `rehearse:goal030-mvp-journey` | EXECUTADO | Não há prazo para o grupo `Não classificadas` em camada nenhuma — `RetentionSettings` tem só `commercialRetentionDays` (`schema.prisma:242`) e `personalRetentionDays` (`:244`). É U-01, e `apps/ai-orchestrator/tests/retention/content-purge.test.ts:276` existe justamente para provar que nada desse grupo é apagado |
| G-30 — status honesto de IA e WhatsApp | fechado | `apps/bff/src/modules/status/routes.ts:51` (`GET /v1/status`); vermelho em `apps/bff/tests/goal014-status.integration.test.ts` (passo `test:bff-integration`) e em `apps/frontend/tests/goal018-dashboard-status.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-31 — navegação e visual mobile-first | fechado | `apps/frontend/src/shared/layout/AppShell.tsx` e `ShellConfig.tsx`; vermelho em `apps/frontend/e2e/viewport-matrix.spec.ts` e `apps/frontend/e2e/accessibility.spec.ts` (gate `npm run validate:ui`) e nos testes `goal015-shell-invariant.test.tsx`, `goal016-shell-invariant.test.tsx`, `goal017-shell-invariant.test.tsx`, `goal020-shell-invariant.test.tsx`, `goal021-shell-invariant.test.tsx` e `goal024-settings-shell-invariant.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-32 — contratos compartilhados entre frontend e backend | aberto | `packages/` contém apenas `legal-contract/`; não existe pacote de contratos na árvore. O alinhamento é sustentado por schemas Zod duplicados por app, conferidos só do lado do frontend (`apps/frontend/tests/goal016-schema.test.ts`, `goal020-schema.test.ts`, `goal021-reminders-schema.test.ts`, `goal022-notifications-schema.test.ts`) | INSPECIONADO | Não sei nomear passo de gate ou teste que fique vermelho quando o **BFF** divergir do schema que o frontend declara: os testes de schema afirmam o lado do consumidor contra fixture, não contra a rota real |
| G-33 — repositório validável a cada Goal | fechado em parte | `scripts/validate-core.mjs:22` (lista `coreSteps`), `scripts/validate-integration.mjs`, `.github/workflows/validate.yml:48` e `:132`; vermelho no passo `test:gate-scripts`, que exercita os próprios scripts de gate | EXECUTADO | A parte de **deploy** continua sem prova: `render.yaml` declara `plan: free` para os quatro serviços web e nenhum passo de gate executa ou observa um deploy. O check `production_health` do passo `audit:static` é registrado como `skipped` quando `PRODUCTION_HEALTH_TARGETS` não é fornecido — e não foi, em nenhuma execução desta rodada |
| G-34 — recuperação de senha somente visual no MVP | fechado | `apps/frontend/src/features/auth/recoveryMachine.ts:27` (`recoveryReducer`, redutor puro de quatro passos, sem `fetch`); vermelho em `apps/frontend/tests/goal014-auth.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| G-35 — ownership de status de mensagem entre instâncias | fechado | `apps/evolution-go/pkg/message/repository/message_repository.go:42` (conflito resolvido por `(instance_id, message_id)`) e `:53`; vermelho em `TestMessageStatusOwnershipOverGinChain` e em `pkg/message/repository/message_ownership_test.go` (passo `test:evolution-go`) | EXECUTADO | — |

## 2. Gates de migração — M0 a M6

| Critério | Estado | Evidência apontável | Força | Achado |
| --- | --- | --- | --- | --- |
| M0 — inventário (versões, contagens, backup com restore ensaiado) | fechado em parte | `scripts/goal028-restore-rehearsal.mjs`, exercido pelo passo `rehearse:goal028-restore` | EXECUTADO | O restore ensaiado existe e roda. O **inventário de operação** (contagens por tenant, ownership e ambiguidades em banco implantado) não existe em lugar nenhum da árvore, porque não há ambiente implantado a inventariar |
| M1 — expand (banco vazio e cópia sintética sobem) | fechado | passos `rehearse:goal003-link-migration`, `rehearse:goal004-transport-migration`, `rehearse:goal005-contact-session-migration`, `rehearse:goal006-customer-identity-migration`, `rehearse:goal006-ai-migration`, `rehearse:goal007-catalog-migration`, `rehearse:goal008-agenda-migration`, `rehearse:goal009-occupancy-migration`, `rehearse:goal010-import-session-migration`, `rehearse:goal011-ai-style-migration`, `rehearse:goal012-knowledge-memory-migration`, `rehearse:goal013-media-migration`, `rehearse:goal019-activation-test-migration`, `rehearse:goal021-reminder-migration`, `rehearse:goal022-notification-center-migration`, `rehearse:goal023-retention-migration`, `rehearse:goal027-calendar-source-migration` e `rehearse:goal028-release-migrations` | EXECUTADO | — |
| M2 — readers entendem o novo antes de o producer emitir | fechado em parte | passos `test:bff-integration`, `test:scheduling-integration`, `test:ai-orchestrator-transport-durability` e `test:frontend` | EXECUTADO | "Binário anterior compatível" é conferido pelos ensaios de migration lendo e escrevendo no formato antigo; **nenhum gate executa o binário anterior de verdade**. Essa parte específica é `INSPECIONADO` |
| M3 — backfill retomável, com contagens e órfãos isolados | fechado em parte | passos `rehearse:goal004-transport-migration`, `rehearse:goal013-media-migration` e `rehearse:goal023-retention-migration` (retomada e contagem linha a linha) | EXECUTADO | As contagens de entrada e saída existem contra estoque **sintético** semeado pelo próprio ensaio. Não há contagem por tenant sobre dado de operação |
| M4 — corte do writer legado e transferência de controle | fechado em parte | `apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql:51`; vermelho em `apps/scheduling-service/tests/unit/calendar-provider-factory.test.ts` e `apps/scheduling-service/tests/unit/goal027-calendar-guard.test.ts` (passo `test:scheduling-service`) | EXECUTADO | O corte está no código e é travado por constraint. O **freeze da fonte remota** nunca foi executado: não existe origem real conectada a nenhum gate |
| M5 — observar (sem chamada ao writer legado, sem drift) | fechado em parte | passos `rehearse:goal028-release-migrations` (histórico aplicado do zero e ausência de drift contra `schema.prisma`) e `rehearse:goal028-restore` | EXECUTADO | A observação existe apenas em máquina descartável. Backlog, taxa de erro e divergência de projeção em operação continuam sem medição |
| M6 — retirar código, rotas e campos obsoletos | fechado em parte | checks `no_legacy_calendar_migration_routes`, `no_calendar_migration_service_reference`, `minha_agenda_origin_has_no_writer`, `no_external_calendar_source_comparison`, `no_removed_calendar_error_codes`, `no_require_atendly_calendar_reference` e `ai_does_not_access_minha_agenda`, todos do passo `audit:static`; busca por `MinhaAgendaCalendarProvider` em `apps/**/*.ts` não retorna nenhuma ocorrência | EXECUTADO | O que foi retirado é o protocolo pré-Goal010, o writer remoto e o dado de `calendar.source`. A leitura de importação (`apps/scheduling-service/src/modules/integrations/minha-agenda/`) **permanece de propósito** — é a fonte da importação única, não legado a retirar. "Janela compatível encerrada e plano de restore seguro" não tem artefato próprio além do ensaio de restore |

## 3. Incertezas isoladas

### 3.1 Incertezas com ID

| Critério | Estado | Evidência apontável | Força | Achado |
| --- | --- | --- | --- | --- |
| U-01 — prazo de conteúdo do grupo `Não classificadas` | aberto | `apps/bff/prisma/schema.prisma:242` e `:244`: `RetentionSettings` só tem `commercialRetentionDays` e `personalRetentionDays`; `apps/ai-orchestrator/tests/retention/content-purge.test.ts:276` ("nunca apaga mensagem governada por sessao nao classificada (U-01)") fica vermelho se alguém passar a apagar esse grupo (passo `test:ai-orchestrator-content-purge`) | EXECUTADO | A incerteza segue aberta como decisão de produto, e a árvore a mantém segura por teste: nada do grupo é apagado enquanto a decisão não existir. Nenhuma copy da interface promete removê-lo |
| U-02 — tratamento de `MigrationJob.COMPLETED` legado | fechado | `apps/scheduling-service/prisma/schema.prisma:901` (`legacyClass … @default(UNCLASSIFIED)`) e `:905` (`legacyReviewReason`, motivo sanitizado de `NEEDS_REVIEW`); vermelho em `apps/scheduling-service/tests/unit/legacy-job-reconciliation.test.ts` (passo `test:scheduling-service`) | EXECUTADO | Resolvida por classificação, nunca por conversão: nenhuma linha é apagada ou reescrita |
| U-03 — custo e provider para execução contínua e e-mail crítico | aberto | busca por `nodemailer`, `sendgrid`, `resend` e `smtp` em `apps/*/src/**/*.ts` não retorna ocorrência; `render.yaml:5`, `:26`, `:101` e `:163` declaram `plan: free` nos quatro serviços web | INSPECIONADO | Não sei nomear gate ou teste que fique vermelho se a capacidade contínua deixar de existir — por construção, nenhum gate observa processo em operação. O check `production_health` do passo `audit:static` só sai de `skipped` com `PRODUCTION_HEALTH_TARGETS`, que nenhuma execução desta rodada forneceu |

### 3.2 Incertezas sem ID

Cinco questões isoladas em `GAP_ANALYSIS`, sem identificador próprio. Estão no
inventário porque o critério da auditoria é a incerteza, não o rótulo dela.

| Critério | Estado | Evidência apontável | Força | Achado |
| --- | --- | --- | --- | --- |
| Há tenants e dados legados em operação? | aberto | nenhum artefato da árvore responde; o único inventário existente é o sintético semeado por `scripts/goal028-restore-rehearsal.mjs` | DECLARADO | Não há banco implantado acessível a este repositório: a pergunta não é respondível pela árvore |
| Capacidade completa da API Minha Agenda | aberto | `apps/scheduling-service/src/modules/integrations/minha-agenda/types.ts` declara o que o mapper aceita; `apps/scheduling-service/tests/unit/minha-agenda-client.test.ts` exercita só payload sintético | INSPECIONADO | Limitação do mapper não prova limitação da origem. Nenhum gate chama a origem real |
| Conclusão de importação legada conta como única? | fechado | `apps/scheduling-service/prisma/schema.prisma:901`; vermelho em `apps/scheduling-service/tests/unit/legacy-job-reconciliation.test.ts` (passo `test:scheduling-service`) | EXECUTADO | Resolvida junto com U-02 |
| Capacidade contínua do deploy e e-mail crítico | aberto | ausência de provider em `apps/*/src` e `plan: free` em `render.yaml:5`, `:26`, `:101`, `:163` | INSPECIONADO | Mesma limitação de U-03 |
| SLA, RPO/RTO e volume | aberto | `scripts/goal028-restore-rehearsal.mjs` mede restore em máquina descartável; nenhum artefato da árvore mede volume ou janela de indisponibilidade | INSPECIONADO | Medição real depende de operação que não existe. Nenhum número de SLA, RPO ou RTO é afirmado por código |

## 4. Guardrails de `AGENTS.md` verificáveis em código

| Critério | Estado | Evidência apontável | Força | Achado |
| --- | --- | --- | --- | --- |
| Agenda Atendly é a única fonte oficial da operação | fechado | `apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql:51`; checks `no_external_calendar_source_comparison` e `no_require_atendly_calendar_reference` (passo `audit:static`) | EXECUTADO | — |
| Minha Agenda existe só como fonte de uma importação única | fechado | checks `minha_agenda_origin_has_no_writer` e `ai_does_not_access_minha_agenda` (passo `audit:static`) | EXECUTADO | — |
| Não há sincronização contínua, troca de fonte ativa, reimportação ou modo híbrido | fechado | checks `no_legacy_calendar_migration_routes` e `no_calendar_migration_service_reference` (passo `audit:static`); vermelho em `apps/scheduling-service/tests/unit/calendar-provider-factory.test.ts` (passo `test:scheduling-service`) | EXECUTADO | — |
| Depois de `Concluir importação` não existe nova importação | fechado | `apps/scheduling-service/src/modules/migrations/import-completion-service.ts`; vermelho em `apps/scheduling-service/tests/integration/goal010-import-completion.test.ts` (passo `test:scheduling-integration`) | EXECUTADO | — |
| Nunca inventar disponibilidade, preço, serviço ou confirmação | fechado | check `llm_cannot_create_appointments_directly` (passo `audit:static`); vermelho em `apps/ai-orchestrator/tests/tools/effect-guard.test.ts` e `apps/ai-orchestrator/tests/evals/out-of-reach-and-handoff.eval.test.ts:29` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| Nunca mostrar sucesso antes de a operação concluir | fechado | vermelho em `apps/ai-orchestrator/tests/tools/explicit-confirmation.test.ts` e em `apps/ai-orchestrator/tests/evals/conversation-policies.eval.test.ts:287` ("confirmação explícita e rascunho que sobrevive à conversa"), passo `test:ai-orchestrator` | EXECUTADO | — |
| Remarcação preserva o horário anterior até confirmar o novo | fechado | `apps/scheduling-service/prisma/schema.prisma:706`; vermelho em `apps/scheduling-service/tests/unit/appointment-hold.test.ts` (passo `test:scheduling-service`) | EXECUTADO | — |
| Cancelamento preserva histórico | fechado | `apps/scheduling-service/prisma/migrations/20260909181000_goal008_appointment_status/migration.sql:66`; vermelho em `apps/scheduling-service/tests/unit/appointment-lifecycle.test.ts` (passo `test:scheduling-service`) | EXECUTADO | — |
| Alterações no catálogo não reescrevem agendamentos combinados | fechado | `apps/scheduling-service/prisma/schema.prisma:690` (`priceTypeSnapshot` em `AppointmentItem`); vermelho em `apps/scheduling-service/tests/unit/agreement-total.test.ts` (passo `test:scheduling-service`) | EXECUTADO | — |
| Um negócio usa um único número de WhatsApp | fechado | `apps/bff/prisma/schema.prisma:179`; vermelho em `apps/bff/tests/tenant-instance-link.integration.test.ts` (passo `test:bff-integration`) | EXECUTADO | Mesmo achado de G-02 sobre `NULL` no índice único |
| O número pode ser pessoal e profissional ao mesmo tempo | fechado | checks `no_global_phone_unique_constraint` e `no_tenant_scoped_phone_unique_constraint` (passo `audit:static`); `apps/scheduling-service/prisma/schema.prisma:342` | EXECUTADO | — |
| Quando o profissional responde manualmente, a IA sai de cena | fechado | `apps/ai-orchestrator/src/modules/graph/message-graph.ts:579` e `:601`; vermelho em `apps/ai-orchestrator/tests/integration/human-control-graph.test.ts` (passo `test:ai-orchestrator-transport-durability`) | EXECUTADO | — |
| Conversas organizadas em `Comercial`, `Não classificadas` e `Pessoal` | fechado | `apps/ai-orchestrator/prisma/schema.prisma:79`–`:81`; vermelho em `apps/frontend/tests/goal017-inbox-tabs.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| Contatos em `Ignorar IA` nunca são atendidos pela IA | fechado | `apps/ai-orchestrator/prisma/schema.prisma:269` (`Contact.ignored`), aplicado em `apps/ai-orchestrator/src/modules/graph/graph-state.ts:169`; vermelho em `apps/ai-orchestrator/tests/internal/ignored-contacts.routes.test.ts` e `apps/ai-orchestrator/tests/inbox/inbox-policy.test.ts` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| Grupos não são atendidos pela IA no MVP | fechado | `apps/ai-orchestrator/src/modules/channel/InboundMessageProcessor.ts:239` (`if (message.isGroup && env.EVOLUTION_IGNORE_GROUPS)`), com default `true` em `apps/ai-orchestrator/src/config/env.ts:90`; vermelho em `apps/ai-orchestrator/tests/channel/inbound-message-processor.test.ts` (passo `test:ai-orchestrator`) | EXECUTADO | O guardrail é **condicionado a variável de ambiente**, não a invariante de código: `EVOLUTION_IGNORE_GROUPS=false` em operação reabre o atendimento de grupos sem nenhum gate ficar vermelho. O default seguro é o que sustenta a regra hoje |
| Três estilos de IA (`Profissional`, `Equilibrada`, `Descontraída`), sem persona nem opção personalizada | fechado | `apps/ai-orchestrator/src/modules/prompts/style.ts:12` e `:30`; `apps/ai-orchestrator/src/modules/prompts/system.ts:80`; vermelho em `apps/ai-orchestrator/tests/prompts/system.test.ts:27` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| A IA fala em nome do negócio e não alega ser humana | fechado | `apps/ai-orchestrator/src/modules/prompts/system.ts:59` e `:80`; vermelho em `apps/ai-orchestrator/tests/evals/style-and-persona.eval.test.ts` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| A IA não negocia desconto nem cria encaixe sozinha | fechado | `apps/ai-orchestrator/tests/evals/out-of-reach-and-handoff.eval.test.ts:29` (predicado aplicado ao que o runtime ofereceu ao modelo); vermelho no passo `test:ai-orchestrator` | EXECUTADO | — |
| A IA faz handoff quando não consegue resolver com segurança | fechado | `apps/ai-orchestrator/tests/evals/out-of-reach-and-handoff.eval.test.ts:31` ("pedido fora do alcance da IA termina em handoff"); vermelho no passo `test:ai-orchestrator` | EXECUTADO | — |
| A IA usa histórico para reduzir perguntas, mas confirma o que altera um agendamento | fechado | vermelho em `apps/ai-orchestrator/tests/evals/customer-memory.eval.test.ts` e `apps/ai-orchestrator/tests/tools/explicit-confirmation.test.ts` (passo `test:ai-orchestrator`) | EXECUTADO | — |
| A IA não envia mensagem técnica de "aguarde enquanto consulto" | aberto | `apps/ai-orchestrator/src/modules/prompts/system.ts` não contém nenhuma regra sobre mensagem de espera: busca por `espera`, `aguarde`, `vou consultar` e `um momento` no arquivo não retorna ocorrência | INSPECIONADO | **Achado da auditoria.** Este guardrail não está no prompt nem em teste algum. Não sei nomear nada que fique vermelho se o modelo passar a anunciar consulta. `apps/ai-orchestrator/tests/evals/tool-failure-vocabulary.eval.test.ts` cobre vocabulário de **falha** de tool, que é outro caso |
| Mobile → Tablet → Notebook → Desktop, com mobile como experiência primária | fechado | `apps/frontend/playwright.config.ts:26` (`VIEWPORTS`, começando em `mobile-360`); vermelho em `apps/frontend/e2e/viewport-matrix.spec.ts` (gate `npm run validate:ui`) | EXECUTADO | — |
| Acessibilidade, contraste e touch targets preservados | fechado | vermelho em `apps/frontend/e2e/accessibility.spec.ts` (gate `npm run validate:ui`) e nos testes `goal016-a11y.test.tsx`, `goal017-a11y.test.tsx`, `goal018-a11y.test.tsx`, `goal019-a11y.test.tsx`, `goal020-a11y.test.tsx` e `goal021-a11y.test.tsx` (passo `test:frontend`) | EXECUTADO | — |
| MVP em tema claro | fechado | `apps/frontend/src/app/globals.css` não contém `dark` nem `prefers-color-scheme` (zero ocorrências) | INSPECIONADO | Nenhum gate fica vermelho se alguém introduzir tema escuro: a ausência é fato da árvore, não invariante verificada |
| Onboarding em quatro blocos; pular WhatsApp encerra o onboarding e deixa checklist na Home | fechado | `apps/bff/src/lib/onboarding-state.ts:89` (`onboardingIssues`) e `apps/bff/src/modules/dashboard/routes.ts:73` (mesmo predicado); vermelho em `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` e `apps/bff/tests/goal027-onboarding-issues.test.ts`, e na etapa 2 do passo `rehearse:goal030-mvp-journey` | EXECUTADO | — |
| Frontend fala só com o BFF e não carrega mocks | fechado | checks `frontend_calls_only_bff` e `frontend_mocks_directory_is_absent` (passo `audit:static`) | EXECUTADO | — |
| Estados de IA e WhatsApp não induzem o usuário a acreditar que algo funciona quando não funciona | fechado | `apps/bff/src/modules/status/routes.ts:51` (estado `UNKNOWN` explícito); vermelho em `apps/bff/tests/goal014-status.integration.test.ts` (passo `test:bff-integration`) e em `apps/frontend/tests/goal018-dashboard-status.test.tsx` (passo `test:frontend`) | EXECUTADO | — |

### Guardrails de `AGENTS.md` fora do inventário, e por quê

Não são verificáveis em código porque regulam o **trabalho**, não o produto em
execução: a ordem de autoridade entre vault, `AGENTS.md` e implementação; a
leitura seletiva do vault; a regra para documentação antiga; o limite entre
produto e engenharia; o checklist de qualidade de produto; e o uso de Graphify
e RTK. A regra "existe um único MVP" também fica fora: ela proíbe uma decisão
de planejamento, não um estado de código.

## 5. Interface — o que o gate renderizado decide e o que ele não decide

O gate renderizado é `npm run validate:ui`: Playwright sobre Chromium, com
`apps/frontend/playwright.config.ts:26` (`VIEWPORTS`) definindo as cinco
larguras e `apps/frontend/e2e/viewport-matrix.spec.ts` e
`apps/frontend/e2e/accessibility.spec.ts` definindo o que é medido. Quem
executou foi a WU-08 desta rodada (exit 0, 48878 ms). Esta seção não reexecutou
o gate: ela lê o relatório que aquela execução deixou em
`apps/frontend/e2e-results/results.json` — 47896 ms de suíte, 169 `expected`,
21 `skipped`, 0 `unexpected`, 0 `flaky`.

### 5.1 Resultado real por largura

| Projeto | Viewport | Passou | Falhou | Pulado |
| --- | --- | --- | --- | --- |
| `mobile-360` | 360×740, com toque | 38 | 0 | 0 |
| `mobile-390` | 390×844, com toque | 38 | 0 | 0 |
| `tablet-768` | 768×1024 | 31 | 0 | 7 |
| `notebook-1024` | 1024×768 | 31 | 0 | 7 |
| `desktop-1440` | 1440×900 | 31 | 0 | 7 |

Os 21 pulos são um único teste — `touch targets are reachable on a touch
screen` — nas sete rotas das três larguras sem toque, por `test.skip` declarado
em `apps/frontend/e2e/viewport-matrix.spec.ts:102` ("touch targets are a
touch-screen rule"). Nenhum outro teste foi pulado em nenhuma largura.

### 5.2 O que o gate decide

| O gate decide | Como decide | Onde |
| --- | --- | --- |
| Overflow horizontal | `document.scrollWidth` não passa de `clientWidth` mais 1px de tolerância, e o primeiro elemento que estoura é nomeado no erro | `viewport-matrix.spec.ts:65` ("nothing overflows sideways"), 7 rotas × 5 larguras |
| Alvo de toque mínimo AA de 24px | mede cada `a[href]`, `button`, `input`, `select` e `textarea` renderizado e falha abaixo de 24px em qualquer eixo (WCAG 2.5.8 AA), isentando link dentro de frase | `viewport-matrix.spec.ts:101`, só em `mobile-360` e `mobile-390` |
| Contraste real computado | axe-core sobre a página renderizada, com as tags `wcag2a`, `wcag2aa`, `wcag21a` e `wcag21aa`; é o único lugar onde `color-contrast` roda, porque jsdom não resolve cor computada | `accessibility.spec.ts:18`, 7 rotas × 5 larguras |
| Que o próprio contraste está sendo avaliado | injeta texto `#bbbbbb` sobre `#cccccc` e exige que o axe aponte `color-contrast`; sem isso, contraste poderia estar desligado em toda parte com suíte verde | `accessibility.spec.ts:45` ("contrast really is being evaluated here") |
| Foco visível | o primeiro `Tab` precisa sair do `body`, cair em elemento com caixa e ter `outline` ou `box-shadow` | `accessibility.spec.ts:71`, apenas em `/login` |
| `prefers-reduced-motion` | com `reducedMotion: "reduce"`, nenhum elemento pode ter animação ou transição acima de 0,2s | `accessibility.spec.ts:100`, apenas em `/login` |
| Um único `h1` por rota | `expect(page.locator("h1")).toHaveCount(1)` | `viewport-matrix.spec.ts:95`, 7 rotas × 5 larguras |

### 5.3 O que o gate não decide

| O gate não decide | Por quê |
| --- | --- |
| **Fidelidade visual à referência aprovada** (`docs/design-reference/claude-design/`) | o screenshot de página inteira é anexado como artefato para uma pessoa olhar, nunca como aprovação ou reprovação — está escrito no próprio teste (`viewport-matrix.spec.ts:174`). **Continua sendo conferência humana, e este relatório não afirma em nenhum ponto que a fidelidade visual está provada por teste** |
| Qualquer tela autenticada | `apps/frontend/e2e/routes.ts:9` lista sete rotas públicas (`/login`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada`, `/link-expirado`, `/termos-de-uso`, `/politica-de-privacidade`). Home, Agenda, Inbox, Clientes, Serviços e Configurações não são medidas em largura nenhuma — é o achado A-02 |
| Alvo de toque em tablet, notebook e desktop | pulado por decisão declarada: são os 21 `skipped` da §5.1 |
| O alvo "confortável" de 44px (WCAG 2.5.5 AAA) | medido e anexado como relatório, nunca como falha (`viewport-matrix.spec.ts:161`), para que o gate não nasça vermelho |
| Comportamento em Firefox e WebKit | os cinco projetos usam `devices["Desktop Chrome"]` (`playwright.config.ts:58` e `:61`); só o motor Chromium é exercitado |
| Layout sobre dado real de um negócio | o gate não fabrica sessão, de propósito: uma sessão falsa provaria layout sobre dado que nenhum usuário vê (`routes.ts:4`) |

### 5.4 O que a medição de toque devolveu

Os três alvos abaixo de 24px que o gate carrega como exceção nomeada em
`KNOWN_SMALL_TARGETS` (`viewport-matrix.spec.ts:41`) **continuam
reproduzindo**: o próprio teste falha se uma exceção deixar de reproduzir, e
ele passou. Medidas reais lidas dos anexos da execução da WU-08:

| Rota | Controle | `mobile-360` | `mobile-390` | Régua |
| --- | --- | --- | --- | --- |
| `/login` | `<input type="checkbox" name="remember">` | 13×13 | 13×13 | abaixo dos 24px de AA |
| `/cadastro` | `<input type="checkbox" required name="terms">` | 13×13 | 13×13 | abaixo dos 24px de AA |
| `/link-expirado` | `<a class="auth-link">Voltar para entrar</a>` | 115×18 | 115×18 | abaixo dos 24px de AA |
| todas as sete | `<a>Atendly — Início</a>` (marca no topo) | 320×28 | 350×28 | abaixo dos 44px confortáveis, acima de AA |
| `/login` | `<a>Esqueci minha senha</a>` | 109×42 | 120×42 | abaixo dos 44px confortáveis, acima de AA |

## 6. Achados — A-01 a A-19

Cada achado tem identificador estável `A-NN`, classificação em vocabulário
fechado, reprodução e impacto de produto em uma frase. O identificador é
estável: um achado corrigido não é renumerado nem reaproveitado.

**Classificação** — vocabulário fechado:

| Classificação | Significa |
| --- | --- |
| `BLOQUEADOR-MVP` | o produto não deveria chegar ao primeiro usuário real assim, e existe **reprodução executável** do defeito |
| `PENDENCIA-POS-MVP` | precisa ser resolvido, mas não impede o primeiro usuário real — ou impediria, e foi rebaixado por não ter reprodução executável, com o motivo escrito no próprio achado |
| `LIMITE-DECLARADO` | limite conhecido e assumido do MVP ou desta auditoria; não há o que corrigir, há o que não prometer |

Duas regras que esta lista obedece. A primeira: **`BLOQUEADOR-MVP` sem
reprodução executável é rebaixado a `PENDENCIA-POS-MVP` com o motivo escrito** —
sem isso, "bloqueador" viraria opinião. A segunda: **auditoria não corrige
defeito de produto**; nenhum arquivo de `apps/*/src` foi tocado por esta
unidade, e toda correção listada abaixo pertence a um Goal próprio.

| ID | Achado | Classificação | Origem no inventário |
| --- | --- | --- | --- |
| A-01 | Alvos de toque abaixo do mínimo AA de 24px nas telas públicas em mobile | BLOQUEADOR-MVP | §5.4 e o guardrail "Acessibilidade, contraste e touch targets preservados" |
| A-02 | O gate renderizado não mede nenhuma tela autenticada | PENDENCIA-POS-MVP | §5.3, G-31 |
| A-03 | Não existe contrato compartilhado entre BFF e frontend, e o BFF não valida a própria resposta | PENDENCIA-POS-MVP | G-32 |
| A-04 | Nenhum deploy real foi executado ou observado | PENDENCIA-POS-MVP (rebaixado) | G-33 |
| A-05 | Capacidade contínua e provider de e-mail crítico seguem sem decisão e sem código | PENDENCIA-POS-MVP | U-03 e a incerteza sem ID equivalente |
| A-06 | O alerta externo da central de notificações não existe em código | PENDENCIA-POS-MVP | G-28 |
| A-07 | O freeze da fonte remota nunca foi executado | PENDENCIA-POS-MVP (rebaixado) | M4 |
| A-08 | A ativação por envio real de WhatsApp nunca foi exercida | PENDENCIA-POS-MVP (rebaixado) | G-25 |
| A-09 | O guardrail "não envia mensagem técnica de espera" não existe no prompt nem em teste | PENDENCIA-POS-MVP | guardrail de `AGENTS.md` |
| A-10 | "Grupos não são atendidos pela IA" depende de variável de ambiente, não de invariante | PENDENCIA-POS-MVP | guardrail de `AGENTS.md` |
| A-11 | A unicidade de `tenantId` não restringe múltiplos `NULL` | LIMITE-DECLARADO | G-02 |
| A-12 | O grupo `Não classificadas` segue sem prazo de retenção | LIMITE-DECLARADO | U-01 e G-29 |
| A-13 | A origem real da Minha Agenda nunca foi chamada por gate nenhum | PENDENCIA-POS-MVP | G-20 e a incerteza sem ID equivalente |
| A-14 | Não se sabe se existem tenants e dados legados em operação | PENDENCIA-POS-MVP | única linha `DECLARADO` do inventário (§3.2) |
| A-15 | M0, M3 e M5 são verdes sobre estoque sintético | LIMITE-DECLARADO | M0, M3, M5 |
| A-16 | O binário anterior nunca foi executado de verdade contra o schema novo | LIMITE-DECLARADO | M2 |
| A-17 | "Janela compatível encerrada e plano de restore seguro" não tem artefato próprio | LIMITE-DECLARADO | M6 |
| A-18 | O tema claro é fato da árvore, não invariante verificada | LIMITE-DECLARADO | guardrail "MVP em tema claro" |
| A-19 | SLA, RPO/RTO e volume não têm medição | LIMITE-DECLARADO | incerteza sem ID equivalente |

### A-01 — Alvos de toque abaixo do mínimo AA de 24px nas telas públicas em mobile

**Classificação:** `BLOQUEADOR-MVP`.

**Reprodução (executável):**

```
cd apps/frontend
npx playwright test --project=mobile-360 e2e/viewport-matrix.spec.ts -g "touch targets"
```

O teste passa **porque os três alvos continuam pequenos**: eles estão em
`KNOWN_SMALL_TARGETS` (`apps/frontend/e2e/viewport-matrix.spec.ts:41`) e a
asserção de exceção obsoleta (`:143`–`:147`) fica vermelha se algum deles deixar de
reproduzir. Apagar as três entradas dessa lista e repetir o comando deixa o
gate vermelho com as medidas exatas. Na execução da WU-08 desta rodada, as
medidas são as da §5.4, lidas de `apps/frontend/e2e-results/results.json`
(anexos `below-44px-entrar`, `below-44px-criar-conta` e
`below-44px-link-expirado`, projetos `mobile-360` e `mobile-390`): checkbox de
13×13 em `/login` e em `/cadastro`, link de 115×18 em `/link-expirado`.

**Impacto de produto:** na experiência primária do produto, o controle que
aceita os termos legais do cadastro tem 13×13 pixels e é difícil de acertar com
o dedo, o que é falha de WCAG 2.5.8 AA em um passo obrigatório de entrada.

**Por que não é `LIMITE-DECLARADO`:** a exceção foi registrada com prazo
explícito — "Goal014 refaz o login no visual aprovado (critério 6)" e "Goal014
refaz o cadastro e o aceite legal (critério 6)". O Goal014 foi concluído e a
dívida sobreviveu a ele. Registrar isso não reabre Goal aceito e não é correção
de produto: a correção é Goal próprio, e o que a auditoria deve a esse Goal é o
identificador `A-01`, a medida real e o comando que a reproduz.

### A-02 — O gate renderizado não mede nenhuma tela autenticada

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** `apps/frontend/e2e/routes.ts:9` lista as sete rotas públicas
que o gate alcança; nenhuma rota de Home, Agenda, Inbox, Clientes, Serviços ou
Configurações aparece ali, e o comentário do arquivo diz por quê — estender o
gate exige dar a ele uma sessão real, que é decisão própria.

**Impacto de produto:** overflow horizontal, contraste e alvo de toque estão
medidos apenas nas telas que o usuário vê antes de entrar, e a Agenda em 360px
— que é onde o produto realmente vive — não tem medição nenhuma.

### A-03 — Não existe contrato compartilhado entre BFF e frontend

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução (executável, declarada como reprodução de achado):**

```
node apps/bff/tests/goal030-a03-contract-drift.repro.mjs
```

O arquivo é reprodução de achado, não teste do gate: o nome termina em
`.repro.mjs`, o Vitest só coleta arquivo cujo nome contém `.test.` ou `.spec.`,
e `npx vitest list --filesOnly` em `apps/bff` devolve 40 arquivos, nenhum deles
este. Ele fica **fora do caminho verde** de `test:bff-integration` de propósito
e não é pulado em silêncio: está declarado aqui, com o resultado que produziu
nesta rodada — **exit 1** ("A-03 REPRODUZ"), com 106 formatos de resposta
declarados pelo frontend em
`apps/frontend/src/data/mappers/publicApiSchemas.ts`, 0 consumidores dessas
declarações fora de `apps/frontend`, `packages/` contendo apenas
`legal-contract` e **0 das 115 rotas públicas do BFF validando a própria
resposta**. Exit 0 passaria a significar que alguém fechou G-32.

**Impacto de produto:** o BFF pode mudar o corpo que devolve sem nada ficar
vermelho, e a divergência aparece pela primeira vez como tela quebrada para o
usuário.

**Nota:** a fronteira oposta é guardada — o BFF valida com Zod o que recebe do
ai-orchestrator (`apps/bff/src/clients/ai-orchestrator/index.ts:141`,
`envelope`). É a fronteira pública, a que o usuário vê, que está sem guarda.

### A-04 — Nenhum deploy real foi executado ou observado

**Classificação:** `PENDENCIA-POS-MVP`, **rebaixado de `BLOQUEADOR-MVP`**.

**Motivo do rebaixamento (escrito, conforme a regra):** não existe reprodução
executável dentro desta árvore. O único passo que olharia um ambiente é
`production_health`, do passo `audit:static`, e ele se declara `skipped` sem
`PRODUCTION_HEALTH_TARGETS` — variável que nenhuma execução desta rodada
forneceu, porque não há URL implantada para apontar. Um achado cuja reprodução
depende de um ambiente que não existe não pode ser `BLOQUEADOR-MVP` por esta
regra, e afirmar o contrário seria a mesma inversão que esta auditoria existe
para evitar.

**Reprodução:** `node scripts/final-production-audit.mjs` e ler o check
`production_health` como `skipped`; `render.yaml` declara `plan: free` em sete
pontos, entre eles os quatro serviços web (`:5`, `:26`, `:101`, `:163`).

**Impacto de produto:** nada nesta árvore prova que o produto sobe, responde e
continua de pé fora da máquina do desenvolvedor, então "MVP pronto" significa
hoje "pronto até a fronteira do deploy".

### A-05 — Capacidade contínua e e-mail crítico sem decisão e sem código

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** busca por `nodemailer`, `sendgrid`, `resend` e `smtp` em
`apps/*/src/**/*.ts` não retorna nenhuma ocorrência; `render.yaml:5`, `:26`,
`:101` e `:163` declaram `plan: free` nos quatro serviços web.

**Impacto de produto:** um plano que hiberna e a ausência de qualquer provider
de e-mail significam que um lembrete no horário e um alerta crítico fora do
aplicativo são promessas que nenhuma parte do sistema pode cumprir hoje.

### A-06 — O alerta externo da central de notificações não existe em código

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** a central existe e é exercitada
(`apps/bff/tests/goal022-notification-center.integration.test.ts`, passo
`test:bff-integration`); a busca da A-05 mostra que o canal externo não tem
nenhuma implementação.

**Impacto de produto:** o profissional só descobre um evento crítico se abrir o
aplicativo, que é exatamente o caso que o alerta externo deveria cobrir.

### A-07 — O freeze da fonte remota nunca foi executado

**Classificação:** `PENDENCIA-POS-MVP`, **rebaixado de `BLOQUEADOR-MVP`**.

**Motivo do rebaixamento (escrito):** o freeze é ato operacional sobre uma
origem externa; não existe origem real conectada a gate nenhum, então não há
reprodução executável possível dentro da árvore.

**Reprodução:** o corte do writer legado está no código e é travado por
constraint
(`apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql:51`,
vermelho em `apps/scheduling-service/tests/unit/goal027-calendar-guard.test.ts`);
nenhum passo de `validate:integration` toca a origem remota.

**Impacto de produto:** se a origem continuar aceitando escrita durante a
importação de um negócio real, o dado importado nasce desatualizado e ninguém é
avisado.

### A-08 — A ativação por envio real de WhatsApp nunca foi exercida

**Classificação:** `PENDENCIA-POS-MVP`, **rebaixado de `BLOQUEADOR-MVP`**.

**Motivo do rebaixamento (escrito):** a reprodução exigiria um número real
conectado à Evolution;
`apps/ai-orchestrator/tests/activation-test/activation-test-service.test.ts`
exercita o driver com dublê e nenhum passo de gate chega à fronteira real.

**Reprodução:** seguir a etapa 2 do passo `rehearse:goal030-mvp-journey` e
observar que ela termina no bloqueio de onboarding (elo `onboarding-ai-block`),
sem nenhum envio real.

**Impacto de produto:** o negócio conclui o onboarding sem WhatsApp, como o
produto promete, mas ninguém provou que a primeira mensagem real chega ao
cliente.

### A-09 — O guardrail "não envia mensagem técnica de espera" não existe

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** buscar `aguarde`, `espera`, `vou consultar` e `um momento` em
`apps/ai-orchestrator/src/modules/prompts/system.ts` não retorna nenhuma
ocorrência, e nenhum eval cobre o caso —
`apps/ai-orchestrator/tests/evals/tool-failure-vocabulary.eval.test.ts` trata
de vocabulário de **falha** de tool, que é outro caso.

**Impacto de produto:** a IA pode anunciar "vou consultar a agenda" e deixar o
cliente esperando uma resposta que ela já ia dar, sem que nada fique vermelho.

### A-10 — "Grupos não são atendidos pela IA" depende de variável de ambiente

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:**
`apps/ai-orchestrator/src/modules/channel/InboundMessageProcessor.ts:239`
condiciona o descarte a `env.EVOLUTION_IGNORE_GROUPS`, cujo default é `true` em
`apps/ai-orchestrator/src/config/env.ts:90`; subir o serviço com
`EVOLUTION_IGNORE_GROUPS=false` reabre o atendimento de grupos sem nenhum gate
ficar vermelho.

**Impacto de produto:** um guardrail absoluto do produto é, na prática, uma
configuração de operação, e uma variável trocada por engano coloca a IA
respondendo em grupo.

### A-11 — A unicidade de `tenantId` não restringe múltiplos `NULL`

**Classificação:** `LIMITE-DECLARADO`.

**Reprodução:** `apps/bff/prisma/schema.prisma:179`
(`tenantId String? @unique`), com a decisão escrita em `:177`; no PostgreSQL,
`@unique` não impede várias linhas com `NULL`.

**Impacto de produto:** estoque legado ambíguo pode coexistir no banco, e quem
impede essas linhas de autorizarem uso é o guard de rota, não a constraint.

### A-12 — O grupo `Não classificadas` segue sem prazo de retenção

**Classificação:** `LIMITE-DECLARADO`.

**Reprodução:** `RetentionSettings` tem apenas `commercialRetentionDays`
(`apps/bff/prisma/schema.prisma:242`) e `personalRetentionDays` (`:244`);
`apps/ai-orchestrator/tests/retention/content-purge.test.ts:276` fica vermelho
se alguém passar a apagar esse grupo.

**Impacto de produto:** conteúdo não classificado é guardado por tempo
indefinido, que é o comportamento seguro enquanto a decisão de produto não
existir, e nenhuma copy da interface promete outra coisa.

### A-13 — A origem real da Minha Agenda nunca foi chamada

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** `apps/scheduling-service/tests/unit/minha-agenda-client.test.ts`
e `apps/scheduling-service/tests/unit/minha-agenda-import-snapshot.test.ts`
exercitam só payload sintético; nenhum passo de `validate:integration` chama a
origem.

**Impacto de produto:** a importação única pode falhar ou perder campo no
primeiro negócio real, porque a capacidade efetiva da API de origem nunca foi
observada.

### A-14 — Não se sabe se existem tenants e dados legados em operação

**Classificação:** `PENDENCIA-POS-MVP`. É a única linha `DECLARADO` do
inventário (§3.2), e vira achado por isso.

**Reprodução:** nenhum artefato da árvore responde à pergunta; o único
inventário existente é o sintético semeado por
`scripts/goal028-restore-rehearsal.mjs`.

**Impacto de produto:** o plano de migração não sabe quantos negócios reais
precisa migrar, e essa contagem é o que decide se a janela de corte é de
minutos ou de horas.

### A-15 — M0, M3 e M5 são verdes sobre estoque sintético

**Classificação:** `LIMITE-DECLARADO`.

**Reprodução:** os ensaios semeiam o próprio estoque e o descartam
(`rehearse:goal004-transport-migration`, `rehearse:goal013-media-migration`,
`rehearse:goal023-retention-migration`, `rehearse:goal028-restore`); nenhum
deles se conecta a banco de operação.

**Impacto de produto:** a migração está provada como procedimento e não como
resultado sobre o dado de ninguém, que é o máximo possível sem ambiente.

### A-16 — O binário anterior nunca foi executado de verdade

**Classificação:** `LIMITE-DECLARADO`.

**Reprodução:** os ensaios de migration leem e escrevem no formato antigo, mas
nenhum passo de gate sobe o binário anterior contra o schema novo.

**Impacto de produto:** "o binário anterior continua compatível" é conclusão
por leitura de formato, não observação, e vale como tal.

### A-17 — "Janela compatível encerrada e restore seguro" sem artefato próprio

**Classificação:** `LIMITE-DECLARADO`.

**Reprodução:** o passo `rehearse:goal028-restore` é o único artefato que
sustenta a frase; não existe outro.

**Impacto de produto:** o encerramento da janela de compatibilidade é decisão
operacional que ninguém pode conferir na árvore.

### A-18 — O tema claro é fato da árvore, não invariante verificada

**Classificação:** `LIMITE-DECLARADO`.

**Reprodução:** `apps/frontend/src/app/globals.css` não contém `dark` nem
`prefers-color-scheme`; nenhum teste fica vermelho se alguém introduzir tema
escuro.

**Impacto de produto:** o MVP é claro hoje por ausência, não por regra, e uma
introdução acidental de tema escuro passaria por todos os gates.

### A-19 — SLA, RPO/RTO e volume não têm medição

**Classificação:** `LIMITE-DECLARADO`.

**Reprodução:** `scripts/goal028-restore-rehearsal.mjs` mede restore em máquina
descartável; nenhum artefato da árvore mede volume ou janela de
indisponibilidade.

**Impacto de produto:** nenhum número de disponibilidade pode ser prometido a
um negócio, porque nenhum foi medido.

### Como estes achados se relacionam com o histórico

Nenhum achado desta lista reabre Goal aceito, e nenhum deles foi corrigido
aqui. A-04, A-05, A-06, A-07, A-08, A-13, A-14, A-15, A-16, A-17 e A-19 já
estavam declarados como limite em algum ponto do histórico, e esta auditoria os
confirma **na árvore**, que é a diferença que ela existe para fazer. A-01,
A-02, A-03, A-09, A-10, A-11, A-12 e A-18 são o que a conferência encontrou
além do que já estava declarado.

## 7. Veredito

**O MVP tem 1 achado `BLOQUEADOR-MVP` — A-01, alvo de toque de 13×13 pixels no
aceite legal do cadastro e no `/login` em mobile —, além de 11
`PENDENCIA-POS-MVP` e 7 `LIMITE-DECLARADO`, e por isso não está pronto para o
primeiro usuário real enquanto A-01 não for corrigido em Goal próprio.**

Duas coisas que este veredito não diz. Não diz que as pendências de MVP são
zero: são onze, e três delas (A-04, A-07 e A-08) só não são bloqueadores porque
a regra desta auditoria rebaixa o que não tem reprodução executável — o deploy
real continua sendo a fronteira que nada nesta árvore atravessa. E não diz que
a interface está fiel à referência aprovada: o gate renderizado decide overflow
horizontal, alvo de toque mínimo AA, contraste computado, foco visível e
`prefers-reduced-motion` (§5.2), enquanto a fidelidade visual segue sendo
conferência humana (§5.3).

## 8. Fechamento de A-01 — Goal031, 2026-09-20

Seção nova, escrita depois da última mudança de árvore desta rodada (WU-01 a
WU-08 do Goal031). Ela **não reescreve** o registro original de A-01 em §6:
aquele texto continua descrevendo exatamente o que a auditoria do Goal030
encontrou, com as medidas de então. Esta seção é o que mudou depois dele.

### O que mudou na régua

A régua de alvo de toque em `apps/frontend/e2e/viewport-matrix.spec.ts` tinha
ela própria um defeito de medição: lia só a caixa do elemento nativo
(`getBoundingClientRect()` do `<input>`), sem considerar que dois dos três
controles de A-01 (`remember` em `/login`, `terms` em `/cadastro`) são
checkboxes envolvidos por `<label className="check">`, com o rótulo inteiro —
não só o quadrado de 13×13px — clicável. A WU-01 corrigiu a régua para medir,
quando um `<input>` visualmente escondido (`opacity: 0`, `visibility: hidden`
ou `display: none`) tem um rótulo associado (`el.closest("label")` ou
`label[for="id"]`), a caixa do próprio rótulo — o alvo real que um dedo toca —
em vez da caixa do `<input>`; nos demais controles a régua continua medindo a
caixa própria do elemento. Não é união das duas caixas: um controle escondido
por `display: none` reporta caixa degenerada `(0,0,0,0)`, e uma união por
`Math.min`/`Math.max` esticaria a região medida da origem do viewport até o
canto do rótulo em vez de medir o rótulo. Geometria pura, sem exceção por
seletor, classe ou rota. A régua também ganhou um guard novo — uma rota cujo
seletor não coleta nenhum controle agora falha
(`expect(measured.length).toBeGreaterThan(0)`), porque página quebrada não deve
passar como "nada para medir". `KNOWN_SMALL_TARGETS` está vazio agora; o
mecanismo e a asserção "exceção que deixou de reproduzir falha" continuam no
arquivo, para a próxima regressão real ter onde ser nomeada. O comentário em
`viewport-matrix.spec.ts:31`–`:54` registra três mutações de controle
negativo revertidas nesta rodada, cada uma contra um seletor diferente:
`.check` (`remember` em `/login`, `terms` em `/cadastro`, o `<label>`
encolhido a `height: 16px; overflow: hidden`, vermelha nomeando o `<input>`
a 350×16px pela caixa do rótulo associado nas duas rotas); `.auth-link
--standalone` (o link `Voltar para entrar` em `/link-expirado`, encolhido a
16px de altura, vermelha nomeando o controle a 115×16px); e `.field-action`
(o botão de olho visível de `PasswordField` em `/login`, encolhido a
16×16px, medido pela própria caixa — nunca pela união com um rótulo, porque
é `<button>`, não `<input>` escondido — vermelha nomeando o botão a
16×16px). Todas rodaram com `npm run build && npx playwright test -g
"<rota>.*touch targets" --project=mobile-390` e foram revertidas depois de
confirmado o vermelho — provando que a régua nova ainda reprova um controle
real abaixo de 24px.

### O que mudou no produto

A WU-02 corrigiu o único dos três controles de A-01 que a régua nova confirma
como defeito real de produto: o link `Voltar para entrar` em
`/link-expirado`, cujo alvo dependia só da altura de linha do texto
(115×18px). `AuthScreen.tsx` passou a dar a ele a classe
`auth-link--standalone`, e `atendly.css` define
`min-height: 24px` com `display: inline-flex` e `padding: 4px 2px` — larga o
alvo de toque sem alterar tamanho de fonte nem cor. Os dois checkboxes não
precisaram de mudança de produto: o `<input type="checkbox">` nativo, visualmente
escondido (`opacity: 0`) e medido pela régua antiga, tem o tamanho padrão do
navegador (13×13px); o marcador visual (`<span class="check-box">`) sempre teve
22×22px (`atendly.css:492`–`:506`), mas nenhum dos dois é o alvo real — o alvo
que um dedo toca é o `<label>` inteiro, que já continha o texto ("Manter acesso
neste dispositivo", "Li e aceito os Termos de Uso…") — a régua antiga estava
medindo o elemento errado, não o produto tinha o defeito errado.

### Medidas novas por largura

Lidas de `apps/frontend/e2e-results/results.json`, produzido pela execução da
WU-08 desta rodada (`npm run validate:ui`, exit 0, 47546 ms) — esta seção não
reexecutou o gate.

| Projeto | Viewport | Passou | Falhou | Pulado |
| --- | --- | --- | --- | --- |
| `mobile-360` | 360×740, com toque | 38 | 0 | 0 |
| `mobile-390` | 390×844, com toque | 38 | 0 | 0 |
| `tablet-768` | 768×1024 | 31 | 0 | 7 |
| `notebook-1024` | 1024×768 | 31 | 0 | 7 |
| `desktop-1440` | 1440×900 | 31 | 0 | 7 |

Contagem de passou/falhou/pulado idêntica à §5.1 — mesmo número de testes,
régua diferente por trás. Nas duas larguras com toque (`mobile-360`,
`mobile-390`), o teste `touch targets are reachable on a touch screen` não
gerou nenhum anexo `below-24px-*` em nenhuma das sete rotas públicas: zero
controles abaixo do mínimo AA. Os anexos `below-44px-*` (informativo, nunca
falha) desta execução mostram:

| Rota | Controle | `mobile-360` | `mobile-390` | Régua |
| --- | --- | --- | --- | --- |
| todas as sete | `<a>Atendly — Início</a>` (marca no topo) | 320×28 | 350×28 | abaixo dos 44px confortáveis, acima de AA — sem mudança |
| `/login` | `<a>Esqueci minha senha</a>` | 109×42 | 120×42 | abaixo dos 44px confortáveis, acima de AA — sem mudança |
| `/link-expirado` | `<a class="auth-link auth-link--standalone">Voltar para entrar</a>` | 119×29 | 119×29 | era 115×18 e abaixo de AA; agora acima de AA, ainda abaixo dos 44px confortáveis |

Os dois checkboxes (`remember`, `terms`) não aparecem em nenhum anexo —
`below-24px-*` nem `below-44px-*` — porque a caixa do próprio `<label>`
associado (o alvo real, nunca uma união com a caixa do `<input>`) passa dos
44px confortáveis nas duas larguras.

### Veredito recontado

A contagem desta auditoria muda em uma linha: A-01 deixa de reproduzir e sai
da categoria `BLOQUEADOR-MVP`. O identificador `A-01` permanece — não é
renumerado nem reaproveitado — e o registro original em §6 continua descrevendo
o que a auditoria do Goal030 encontrou, sem reescrita. **Esta auditoria passa a
ter 0 achados `BLOQUEADOR-MVP`** (era 1), 11 `PENDENCIA-POS-MVP` e 7
`LIMITE-DECLARADO` — exatamente os mesmos de A-02 a A-19, nenhum deles tocado,
corrigido ou reclassificado por esta unidade.

O diff031 foi aceito pelo Tech Lead Agent na rodada 4 de 4 do
[review031](reviews/031-review.md) — o aceite é deste diff (régua corrigida,
um alvo corrigido e esta recontagem), e **não** uma nova declaração de que o
MVP está pronto para o primeiro
usuário real de forma absoluta: é o recontar desta auditoria especificamente
sobre A-01. Duas coisas que este recontar não diz, pela mesma razão que §7 já
não dizia. Não diz que a interface está fiel à referência aprovada: o gate
renderizado continua decidindo overflow horizontal, alvo de toque mínimo AA,
contraste computado, foco visível e `prefers-reduced-motion` (§5.2), e a
fidelidade visual **segue sendo conferência humana**, nunca provada por teste.
E não diz que A-02 mudou de estado: nenhuma tela autenticada é medida pelo
gate, e isso continua aberto, sem Goal atribuído.

## 9. Resposta automática provada ponta a ponta — Goal032, 2026-09-20

Seção nova, escrita depois da última mudança de árvore do diff032 (WU-01 a
WU-06). Ela **não reescreve** §6, §7 nem §8: os registros de A-01 a A-19 e o
veredito de §7 continuam exatamente como estavam. Esta seção acrescenta o que
a composição do Goal032 passou a provar sobre a resposta automática da IA —
um fato que §1 e §2 já inventariavam pelo lado do código e do teste unitário
de domínio, mas que nenhuma execução tinha atravessado pelo caminho de
produção inteiro.

**O que mudou.** `scripts/goal032-auto-reply-rehearsal.mjs`
(`rehearse:goal032-auto-reply`, 34º e último passo de `validate:integration`)
sobe o orquestrador de IA real, com `INBOX_WORKER_ENABLED` **ligado**, contra
um banco PostgreSQL descartável próprio. `POST /webhooks/evolution` real
entrega a mensagem; `InboundEventDispatcher` cai em
`buildInboundMessageProcessor` **sem** `buildProcessor` injetado — grafo,
assistente, sessão, memória e ferramentas reais; `EvolutionProvider` real
chama o dublê de transporte. As duas únicas fronteiras dublê são as duas
**externas** (OpenAI e Evolution Go), redirecionadas por `OPENAI_BASE_URL` e
`EVOLUTION_BASE_URL` — a primeira passou a valer para
`LangChainModelProvider` e `OpenAIEmbeddingProvider`
(`apps/ai-orchestrator/src/modules/model/model-provider.ts`,
`apps/ai-orchestrator/src/modules/knowledge/embedding-provider.ts`), do mesmo
jeito que já valia para a transcrição — para dois servidores HTTP em
`127.0.0.1`, com o endereço efetivo conferido depois do `listen`.

**O que a execução prova, por leitura direta do banco e pelo que o dublê de
transporte recebeu:** o evento termina `DONE`; existe exatamente uma
`Message` `OUTBOUND` na conversa, com o texto que o dublê de modelo produziu
naquela execução; o dublê de transporte recebeu exatamente um envio, para o
telefone do contato, com esse mesmo texto; e a linha `OUTBOUND` já existia
quando o transporte foi chamado — a ordem que G-09 declara, conferida na
execução, não só no código. Um controle negativo (`GOAL032_BREAK_LINK`) prova
que o ensaio cai com `exit 1` quando um dos quatro elos obrigatórios deixa de
acontecer — controle humano, `Ignorar IA`, idempotência, supersede —, e os
dois primeiros também provam que o dublê de modelo não é chamado. Os guards do
ensaio (recusa de destino não descartável, registro dos quatro elos) têm
teste permanente em `scripts/tests/goal032-auto-reply-rehearsal.test.mjs`,
rodado por `npm run test:gate`.

**O que esta seção não diz.** Não diz que M4 (envio real a número real) foi
fechado: nenhuma chamada saiu, neste diff, para um provedor de LLM real nem
para o WhatsApp real, e M4 continua aberto como gate operacional, fora do
inventário M0–M6 de §2 (que audita o corte de dado da migração, não este
gate). Não diz que o laço de ferramentas contra o Scheduling real, áudio,
mídia ou grupo foi exercitado — seguem declaradamente fora
(`SCHEDULING_SERVICE_BASE_URL` aponta para loopback onde nada escuta). E não
altera a contagem de achados do veredito de §7: nenhum achado de A-02 a A-19
foi corrigido, reclassificado ou tocado por este diff.

## 10. Fechamento de A-02 — Goal033, 2026-09-20

Seção nova, escrita depois da última mudança de árvore do diff033 (WU-01 a
WU-06). Ela **não reescreve** §6, §7, §8 nem §9: os registros de A-01 a A-19,
o veredito de §7 e as duas seções de fechamento anteriores continuam
exatamente como estavam. Esta seção acrescenta o que o diff033 passou a medir
sobre as telas **autenticadas** — o achado que §5.3 já nomeava (`A-02`) e que
nenhum Goal tinha assumido até agora.

### O que mudou

A régua de medição de `apps/frontend/e2e/viewport-matrix.spec.ts` saiu para um
módulo próprio, `apps/frontend/e2e/measure.ts`, sem mudar geometria nem
limiar: `TOUCH_TARGET_AA` (24px), `TOUCH_TARGET_COMFORTABLE` (44px),
`OVERFLOW_TOLERANCE` (1px), a regra de rótulo associado
(`targetBox = labelBox ?? ownBox`, sem união de caixas) e a asserção de
exceção obsoleta são os mesmos que o Goal031 tinha corrigido — a extração é
extração, não uma segunda implementação. `apps/frontend/e2e/routes.ts` ganhou
`AUTHENTICATED_ROUTES`, as sete rotas `/inicio`, `/agenda`, `/clientes`,
`/conversas`, `/configuracoes`, `/servicos` e `/notificacoes`, cada uma com o
marcador de destino ativo (`aria-current="page"`) e o marcador do próprio
conteúdo carregado. `/importacao`, `/sistema` e `/onboarding` ficam fora, com
o motivo escrito no comentário do arquivo (URL única sem layout único).

`scripts/goal033-authenticated-ui-rehearsal.mjs` sobe os três serviços
próprios reais em três bancos PostgreSQL descartáveis **próprios**, semeia um
negócio inteiramente pelas rotas do produto (`POST /v1/auth/register`,
onboarding, catálogo, cliente, atendimento no dia medido, canal do WhatsApp
contra o dublê da Evolution Go, mensagem entrante real pelo webhook), constrói
o frontend com `NEXT_PUBLIC_BFF_URL` embutida e o serve em porta fixa
declarada, e entrega ao gate um e-mail e uma senha. `apps/frontend/e2e/
authenticated-matrix.spec.ts` digita as duas em `/login` — nenhum
`addCookies`, nenhum `storageState` escrito à mão, nenhuma chamada à rota de
sessão para montar contexto — e só mede depois de provar, para cada rota, que
a URL final é a pedida, que o destino ativo do shell autenticado está montado,
que o negócio semeado aparece na tela e que o conteúdo real (não o esqueleto)
carregou. O ensaio virou o 35º passo de `validate:integration`
(`rehearse:goal033-authenticated-ui`), depois de `rehearse:goal032-auto-reply`
— ver [DATA_MIGRATION §19](DATA_MIGRATION.md#19-gate-renderizado-nas-telas-autenticadas-goal033).

### O que a régua encontrou, e o que foi corrigido

Duas telas reprovaram na primeira medição, e as duas foram corrigidas em
`apps/frontend/src/**` porque a correção coube no controle, sem decidir
composição visual nova:

| Rota | Defeito medido | Correção | Medida depois |
| --- | --- | --- | --- |
| `/agenda`, `mobile-360` | `<h1>Agenda</h1>` com caixa 0×33px e o cabeçalho vazando uma palavra por linha: `grid-template-columns: minmax(0, 1fr) auto` dava à coluna de ações a largura inteira | `apps/frontend/src/shared/styles/atendly-agenda.css`: `.agenda-page-header` para uma coluna (`minmax(0, 1fr)`) abaixo de 767px, `.agenda-page-actions` para `flex-wrap: wrap` | coluna do título com 328px de largura, `<h1>` com caixa 328×33px |
| `/notificacoes`, `mobile-360`/`mobile-390` | `<input type="checkbox">` nativo do `.switch-row` sem tamanho declarado, 13×13px — abaixo do mínimo AA de 24px | `apps/frontend/src/shared/styles/atendly.css`: `.switch-row input[type="checkbox"]` ganhou `width: 24px; height: 24px`, mesmo tamanho e `accent-color` que `.imports-select-row` já usava | 24×24px |

Nenhuma outra rota, largura ou controle reprovou. `KNOWN_SMALL_TARGETS` e
`KNOWN_CONTRAST_FAILURES`, os dois arrays de linha de base do spec
autenticado, estão **vazios**: as duas telas reprovadas caíram na regra
"corrigido quando a correção cabe no controle" (§4 do Goal), nenhuma exigiu
decidir composição visual nova, e por isso nenhuma linha de base foi nomeada —
e, por consequência, não há achado a numerar a partir de A-20. A lista
permanece no arquivo, estrita nos dois sentidos, para a próxima dívida real
ter onde ser nomeada.

### Resultado real da execução

Lido de `apps/frontend/e2e-results/authenticated/results.json`, produzido
pela execução do ensaio nesta rodada: 85419 ms, 35 testes (7 rotas × 5
larguras), 34 `expected`, 0 `unexpected`, 1 `flaky` — `/agenda` em
`desktop-1440` estourou uma vez o teto de 20s esperando o nome do cliente
semeado sob carga e passou na segunda tentativa; não é achado da régua, é
timing de execução, e o teste passou nas duas rotas restantes das outras
quatro larguras sem retry. Nenhum controle de toque abaixo de 24px apareceu em
nenhuma das sete rotas nas duas larguras com toque (`mobile-360`,
`mobile-390`); os anexos informativos `below-44px-*` (nunca falha) mostram só
os mesmos elementos de chrome já conhecidos do gate público na faixa
24–44px — a marca "Atendly" no topo e o link "Ir para o conteúdo" — mais o
botão "Mais" da navegação inferior em `/clientes`, `/conversas` e `/servicos`
(38×56px, acima de AA) e o checkbox recém-corrigido de `/notificacoes`, agora
exatamente nos 24×24px da correção, acima do mínimo AA e ainda abaixo do
confortável.

Quatro controles negativos foram executados e revertidos nesta rodada, um por
medida obrigatória: overflow horizontal forçado numa rota autenticada, alvo de
toque real encolhido abaixo de 24px, par de cores reprovado por contraste
aplicado a uma tela medida, e login quebrado (credencial errada) — os quatro
derrubaram o gate ou o ensaio com falha nomeada, e nenhuma das quatro quebras
sobrou na árvore final: `git status --porcelain` desta rodada não lista
nenhum arquivo de `apps/frontend/src/**`, `apps/frontend/e2e/**` ou
`scripts/goal033-authenticated-ui-rehearsal.mjs` fora dos listados acima.

Gates determinísticos sobre a árvore final desta rodada: `npm run validate:ui`
exit 0, 42,4 s, 169 `passed`, 21 `skipped` (o mesmo `test.skip` declarado de
sempre), 0 `unexpected` — **idêntico** ao resultado de §5.1/§8, confirmando
que o gate público não mudou; `npm run test:gate` exit 0, 175 `pass`, 0
`fail`, 444 ms, incluindo os guards novos de `resolveRehearsalPlan` e
`assertPortsFree` do ensaio autenticado; `npm run validate:core` exit 0 (13
`passed`, 0 `failed`, 2 `skipped` declarados — `test:bff`, `test:health-worker`
— e a auditoria estática em 27 de 28, com o mesmo skip declarado
`production_health`).

### Veredito recontado

A contagem desta auditoria muda em uma linha: A-02 deixa de reproduzir — o
gate renderizado agora mede as sete telas autenticadas nas cinco larguras — e
sai da categoria `PENDENCIA-POS-MVP`. O identificador `A-02` permanece — não é
renumerado nem reaproveitado —, e o registro original em §6 continua
descrevendo o que a auditoria do Goal030 encontrou, sem reescrita. **Esta
auditoria passa a ter 0 achados `BLOQUEADOR-MVP`, 10 `PENDENCIA-POS-MVP`**
(era 11) **e 7 `LIMITE-DECLARADO`** — exatamente os mesmos de A-03 a A-19,
nenhum deles tocado, corrigido ou reclassificado por esta unidade. Nenhum
achado novo entra a partir de A-20: as duas telas que a régua reprovou foram
corrigidas, não baselineadas.

Duas coisas que este recontar não diz, pela mesma razão que §7, §8 e §9 já não
diziam. **Não diz que a interface está fiel à referência aprovada**
(`docs/design-reference/claude-design/`): o gate autenticado decide exatamente
as mesmas cinco medidas que o público — overflow horizontal, alvo de toque
mínimo AA, contraste computado, foco visível e `prefers-reduced-motion` —,
nunca fidelidade visual; o screenshot de página inteira anexado por
`authenticated-matrix.spec.ts` continua sendo evidência para pessoa, nunca
pass/fail. **E não diz que M4 foi fechado**: nenhuma chamada saiu, neste diff,
para um provedor de LLM real nem para o WhatsApp real — o vínculo do canal é
sintético e a mensagem entrante da semeadura passa pelo dublê da Evolution Go,
não por um número real.

## 11. Fechamento de A-09, A-10 e A-18 — Goal034, 2026-09-20

Seção nova, escrita depois da última mudança de árvore do diff034 (WU-01 a
WU-08). Ela **não reescreve** §4, §6, §7, §8, §9 nem §10: os registros de
A-01 a A-19, o veredito de §7 e as três seções de fechamento anteriores
continuam exatamente como estavam. Esta seção acrescenta o que o diff034
passou a garantir sobre três guardrails de `AGENTS.md` que §4 e §6 já
inventariavam como dependentes de configuração, de ausência na árvore ou de
nada.

### O que mudou

**A-10 — grupos, as três camadas.** `EVOLUTION_IGNORE_GROUPS` saiu de
`apps/ai-orchestrator/src/config/env.ts`, `.env.example` e
`docker-compose.yml`; o descarte em `InboundMessageProcessor.ts:243`–`:244`
é incondicional, no mesmo ponto do fluxo de antes. `message-graph.ts` ganhou
uma segunda camada — `GroupDispatchRefusedError`, recusando despachar a
resposta da IA quando o destino é grupo, pelo mesmo predicado `isGroupJid`
que o mapper usa. `audit:static` ganhou `group_discard_is_not_configuration`,
provado nos dois sentidos, e `scripts/goal032-auto-reply-rehearsal.mjs` ganhou
o quinto elo de controle (`group`), provando na pilha real — leitura de banco
e o que o dublê de transporte recebeu — que um evento de grupo não produz
`Message` `OUTBOUND` nem envio. Ver
[DATA_MIGRATION §20](DATA_MIGRATION.md#20-elo-de-controle-de-grupo-no-ensaio-da-resposta-automática-goal034)
e [VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-novos-do-goal034).

**A-09 — mensagem técnica de espera, as duas metades separadas.** O que o
**código garante**: os textos que `assistant.service.ts` emite por conta
própria — sem passar pelo modelo — estão reunidos, sem mudar uma vírgula, em
`PRODUCT_OWN_TEXTS`; teste permanente reprova vocabulário de espera em
qualquer um deles e prova que o conjunto é fechado (um literal novo em
`messages: [...]` fora da lista fica vermelho). O que o **prompt orienta**:
`MAIN_RULES` ganhou a regra de não anunciar consulta em andamento nem pedir
espera, e `PROMPT_TEMPLATE_VERSION` subiu de `v5` para `v6`. A eval nova
(`tests/evals/waiting-message-vocabulary.eval.test.ts`) prova que o turno de
tool não emite mensagem própria — só a decisão final do roteiro vira
mensagem de saída — e o próprio cabeçalho da eval declara, por escrito, que
aderência do modelo real ao prompt não é demonstrável com um dublê
roteirizado.

**A-18 — tema claro.** `audit:static` ganhou `frontend_has_no_dark_theme_css`,
que falha se algum CSS de `apps/frontend/src` declarar
`prefers-color-scheme: dark` ou um seletor comum de alternância manual de
tema escuro, provado nos dois sentidos pela mesma suíte de regressão. O tema
claro deixa de ser só ausência na árvore e passa a ser regra que um gate
aplica.

### Resultado real da execução

`npm run validate:core` exit 0 nesta rodada: `audit:static` com 30 checks (29
`ok`, 1 `skipped` declarado — `production_health`, sem
`PRODUCTION_HEALTH_TARGETS`), incluindo `group_discard_is_not_configuration`
e `frontend_has_no_dark_theme_css`, ambos `ok: true`; `test:ai-orchestrator`
dentro do mesmo `validate:core` também verde. `npm run test:gate` exit 0, 181
`pass`, 0 `fail`, incluindo as seis regressões nos dois sentidos dos dois
checks novos (`group_discard_is_not_configuration`: passa com descarte
incondicional, falha com `EVOLUTION_IGNORE_GROUPS` de volta, falha com a
condição `isGroup`+`env` de volta; `frontend_has_no_dark_theme_css`: passa em
CSS só de tema claro, falha com `prefers-color-scheme` de volta, falha com
seletor manual de tema escuro de volta) e a prova de que os cinco elos de
`BREAKABLE_LINKS` do ensaio do Goal032 — incluindo o `group` novo — estão
registrados, cada um com mensagem própria. Execução direcionada de
`tests/evals/waiting-message-vocabulary.eval.test.ts` e
`tests/assistant/assistant.service.test.ts`: 2 arquivos, 16 testes, 0 falhas.
Quatro dos cinco controles negativos obrigatórios do Goal (entrada de grupo,
saída de grupo, vocabulário de espera, tema escuro) foram executados e
revertidos pela WU-08 desta rodada, cada um derrubando o gate ou o ensaio
correspondente com falha nomeada; esta seção não os reexecutou. O quinto —
pilha real de grupo — não tinha sido executado até a rodada 3: a FIX-001
rodou `validate:integration` inteiro (35/35 passos, incluindo
`rehearse:goal032-auto-reply` com os cinco elos de `BREAKABLE_LINKS`, o
`group` entre eles, íntegros contra o cluster descartável em
`127.0.0.1:55432`) e, em seguida, `node scripts/goal032-auto-reply-rehearsal.mjs`
isolado com `GOAL032_BREAK_LINK=group`, que derrubou o ensaio com a falha
nomeada `group: an inbound event from a group chat must never become an
outbound message, call the model double or reach the transport double` —
prova nos dois sentidos, na pilha real, sem alterar código de produção.

Esta seção **não** afirma ter executado `validate:integration` nem
`validate:ui` nesta unidade — WU-09 é documentação, escrita depois da última
mudança de árvore, e lê o que as unidades de implementação e de controle
negativo já deixaram provado.

### Veredito recontado

A contagem desta auditoria muda em três linhas: **A-09** e **A-10** deixam de
reproduzir e saem da categoria `PENDENCIA-POS-MVP`; **A-18** deixa de
reproduzir e sai da categoria `LIMITE-DECLARADO`. Os três identificadores
permanecem — não são renumerados nem reaproveitados —, e os registros
originais em §6 continuam descrevendo o que a auditoria do Goal030 encontrou,
sem reescrita. **Esta auditoria passa a ter 0 achados `BLOQUEADOR-MVP`, 8
`PENDENCIA-POS-MVP`** (era 10) **e 6 `LIMITE-DECLARADO`** (era 7) — os
demais de A-03 a A-19, nenhum deles tocado, corrigido ou reclassificado por
esta unidade. Nenhum achado novo entra a partir de A-20: nenhum defeito de
produto fora do escopo dos três guardrails foi encontrado por este diff.

Três coisas que este recontar não diz. **Não diz que A-09 está provado por
eval**: a eval nova prova o que o runtime controla — o turno de tool não
emite mensagem própria —, nunca que o modelo real, em produção, obedece à
regra 16 de `MAIN_RULES`; isso só é verificável por avaliação com o modelo de
verdade, fora do escopo determinístico deste Goal. **Não diz que M4 foi
fechado**: nenhuma chamada saiu, neste diff, para um provedor de LLM real
nem para o WhatsApp real. **E não diz que a interface está fiel à referência
aprovada**: este diff não toca `apps/frontend/e2e/`, nem o gate renderizado,
nem a fidelidade visual — que segue sendo conferência humana, como §5.3, §7,
§8, §9 e §10 já declaravam.

## 12. Fechamento de A-03 — Goal035, 2026-09-20

Seção nova, escrita depois da última mudança de árvore do diff035 (WU-01 a
WU-19). Ela **não reescreve** §4 a §11: os registros de A-01 a A-19, o
veredito de §7 e as quatro seções de fechamento anteriores continuam
exatamente como estavam. Esta seção acrescenta o que o diff035 passou a
garantir sobre o achado que §6 registrava como "não existe contrato
compartilhado entre BFF e frontend, e o BFF não valida a própria resposta"
(G-32).

### O que mudou

**O contrato virou artefato único.** Os 106 schemas de
`apps/frontend/src/data/mappers/publicApiSchemas.ts` foram movidos, sem
alteração de conteúdo, para `packages/public-api-contract/src/schemas.ts`; o
arquivo antigo do frontend virou reexport de uma linha. O pacote exporta uma
tabela de **116** entradas (`src/routes.ts`), uma por rota `/v1` com chamador
no frontend, derivada do pareamento `path`+`schema` que já existia nos
dezessete `Bff*Service.ts`. A contagem é a do artefato construído, não a do
texto-fonte:
`node -e "import('./packages/public-api-contract/dist/index.js').then((m) => console.log(m.publicApiRoutes.length))"`
imprime `116`. (O texto `pathPattern:` aparece 119 vezes no arquivo porque a
interface `PublicApiRoute` e os comentários também o escrevem; contar
ocorrências de texto contava três linhas que não são entrada.) `audit:static` ganhou `public_api_route_coverage` — que
computa e imprime, a cada execução, o conjunto de rotas sem chamador (hoje
uma só, `GET /v1/conversations/:id/messages/:messageId/media`, que por não
ter chamador não exige entrada) — e `public_api_response_schema_single_source`
— que falha se algum arquivo de `apps/frontend/src` redeclarar, fora do
pacote, um schema já exportado por ele.

**O BFF passou a validar a própria resposta.** `apps/bff/src/lib/response-contract.ts`
registra um hook único de `onSend` que compara o `data` serializado contra a
entrada da rota e derruba o processo com `ResponseContractViolationError`,
nomeando método, padrão da rota e os campos divergentes, quando os dois lados
discordam. `RESPONSE_CONTRACT_CHECK_ENABLED` é `env.NODE_ENV !== "production"`
— a verificação **não roda em produção**: o motivo, escrito no próprio
arquivo, é que um corpo divergente já saiu do handler quando o hook o vê, e
recusá-lo ali trocaria um bug de contrato por uma indisponibilidade real. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-novos-do-goal035).

**A reprodução de A-03 deixou de reproduzir.** `apps/bff/tests/goal030-a03-contract-drift.repro.mjs`,
executado nesta unidade contra a árvore final, imprime pacote de contrato
compartilhado, zero schemas declarados localmente no frontend, os dois lados
importando o pacote e a verificação registrada no bootstrap do BFF, e sai
`exit 0`. O planejamento deste Goal já tinha confirmado, na baseline aceita
`f1fb6203d11270053c8e702d155b98ff7915e7bc` (fechamento do Goal034), que o
mesmo arquivo saía `exit 1` ali — esta unidade não reexecutou a baseline, e
não afirma tê-lo feito. O arquivo passou a rodar em gate, como o passo
`repro:a03-contract-drift` de `validate:core`, depois de `audit:static`.
`validate:core` também ganhou `build:public-api-contract`, antes de
`build:bff` e `build:frontend`, afirmado por `scripts/tests/gate.test.mjs`.

### Resultado real da execução

Executado por esta unidade (WU-20), sobre a árvore final: `node
scripts/final-production-audit.mjs` — exit 0, 32 checks, 31 `passed`, 1
`skipped` declarado (`production_health`, sem `PRODUCTION_HEALTH_TARGETS`),
incluindo `public_api_route_coverage` e `public_api_response_schema_single_source`
ambos `ok: true`, com `details` de cada um declarando os arquivos lidos.
`npm run test:gate` — exit 0, 188 `pass`, 0 `fail`, incluindo as duas
regressões nos dois sentidos dos dois checks novos e a asserção de
precedência de `build:public-api-contract`. `node
apps/bff/tests/goal030-a03-contract-drift.repro.mjs` — exit 0 (saída
reproduzida acima). `npm test` em `apps/bff` — 10 arquivos, 96 testes,
0 falhas (30 arquivos de integração ficam `skipped` de propósito, fora do
core). `npm test` em `apps/frontend` — 72 arquivos, 666 testes, 0 falhas.
Cópia única de Zod por app confirmada por `require.resolve`:
`apps/bff/node_modules/zod` e `apps/frontend/node_modules/zod` resolvem
`4.4.3`; `packages/public-api-contract` tem Zod só como `devDependency` do
próprio build (`peerDependency` em produção), sem ser dependência
transitiva de nenhum dos dois apps.

### Correção da rodada 2

A rodada 1 foi recusada com quatro blockers, e três deles são desta seção: a
contagem errada da tabela (corrigida acima), a afirmação de que não havia
achado novo (corrigida abaixo) e a versão de Zod citada. O quarto é de
árvore: a instalação limpa não funcionava, porque `dist/` não é versionado e
nada o construía no caminho de deploy. Passou a construir: o pacote ganhou um
script `prepare` (`npm ci --ignore-scripts && npm run build`) que o npm
executa ao copiar o diretório do pacote por `install-links`, e
`build:public-api-contract` virou `node scripts/build-public-api-contract.mjs`,
que constrói e **atualiza a cópia** em `apps/*/node_modules` — a cópia de
`install-links` é congelada na instalação. Provado por execução, a partir de
uma árvore sem `dist/` e sem `node_modules` no pacote e no app:
`npm ci --prefix apps/bff` seguido de `npm run build --prefix apps/bff` —
Prisma Client gerado e `tsc` sem erro, com
`apps/bff/node_modules/@atendly-ia/public-api-contract/dist/` presente depois
da instalação; o mesmo para `apps/frontend` (`next build` completo). É
exatamente a sequência do `buildCommand` de `render.yaml`. Os dois
`package-lock.json` foram refeitos a partir dos da baseline: o diff de cada um
é a entrada nova mais a mudança de forma que o modo de instalação exige,
sem alterar versão de dependência existente.

Esta seção **não** reexecutou `validate:integration` nem `validate:ui`
nesta unidade — WU-20 é documentação, escrita depois da última mudança de
árvore, e cita o que unidades anteriores desta rodada já deixaram provado:
`validate:integration` exit 0 (192740ms, WU-18) e `validate:ui` exit 0
(43711ms, WU-19). Também não reexecutou os cinco controles negativos
obrigatórios do Goal — essas provas pertencem às unidades de controle
negativo, não a esta unidade de fechamento documental. A instalação limpa dos
dois apps, essa sim, foi executada na correção da rodada 2, acima.

### Achados novos — A-20 a A-23

A verificação de resposta, ligada na suíte de integração do BFF, encontrou
quatro divergências entre o que o BFF devolve e o que a tela declarava.
Nenhuma foi corrigida neste diff: nos quatro casos o produtor concorda com o
comportamento de produto e com `apps/bff/PUBLIC_API_V1.md`, e a correção
passaria por alterar o contrato público ou afrouxar um schema movido — as
duas coisas proibidas pelo Goal035. Os identificadores seguem a numeração de
§6 e a classificação usa o mesmo vocabulário fechado; §6 não foi reescrita.

| ID | Achado | Classificação | Lado errado |
| --- | --- | --- | --- |
| A-20 | `DELETE /v1/customers/:id/primary-guardian` devolve `{ deleted: false }`, corpo que o contrato não admite | PENDENCIA-POS-MVP | o contrato: o produtor cumpre a remoção idempotente documentada |
| A-21 | `GET /v1/status` devolve `ai.reconciled`, documentado em `PUBLIC_API_V1.md`, que o contrato não declara | PENDENCIA-POS-MVP | o contrato: o campo existe, é documentado e é descartado |
| A-22 | `GET /v1/auth/session` devolve `businessProfile.modalities` e `businessProfile.address`, não declarados | PENDENCIA-POS-MVP | o contrato: as mesmas chaves são declaradas em `/v1/onboarding` e `/v1/settings` |
| A-23 | `PATCH /v1/onboarding` e `POST /v1/onboarding/complete` devolvem sete campos de serviço não declarados | PENDENCIA-POS-MVP | o contrato: os sete campos já existem no `serviceSchema` cheio do pacote |

#### A-20 — `DELETE /v1/customers/:id/primary-guardian` devolve `{ deleted: false }`

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** estática, em três arquivos. `clearPrimaryGuardian` devolve
`{ deleted: deleted.count > 0 }`
(`apps/scheduling-service/src/modules/customers/atendly-customer-service.ts:263`);
o BFF repassa sem tocar, tipando a resposta do produtor como
`z.object({ deleted: z.boolean() })`
(`apps/bff/src/clients/scheduling/index.ts:1068`,
`apps/bff/src/modules/customers/routes.ts:178`); a entrada da tabela é
`deletedSchema.or(customerPrimaryGuardianSchema)`
(`packages/public-api-contract/src/routes.ts`), com `deletedSchema` =
`z.object({ deleted: z.literal(true) })` (`src/schemas.ts`). Executada na
rodada 1 com o Scheduling dublado devolvendo `{data:{deleted:false}}`: a rota
respondeu `500` com
`Response of DELETE /v1/customers/:id/primary-guardian does not match the public API contract: data: Invalid input`.
O dublê era temporário e foi apagado — **não** há reprodução executável
permanente na árvore, e é por isso que o achado não é classificado como
`BLOQUEADOR-MVP`, na mesma regra que §6 aplica a A-04, A-07 e A-08.

**Impacto de produto:** remover o responsável principal de um cliente que não
tem nenhum devolve um corpo que a própria tela não decodifica — o caso
idempotente que `apps/frontend/src/data/services/BffCustomerService.ts`
documenta em comentário desde a baseline.

**Por que não foi corrigido aqui:** alargar `deletedSchema` para aceitar
`false` é afrouxar schema movido (proibido pelo Goal035 §7), e fazer a rota
devolver outra coisa é mudar contrato público (também proibido). A decisão de
qual lado muda é de Goal próprio.

#### A-21 — `GET /v1/status` devolve `ai.reconciled`, que o contrato não declara

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** `apps/bff/PUBLIC_API_V1.md`, seção "Reconciliação
desired/effective em `GET /v1/status` (Goal019)", descreve `ai.reconciled` com
seis valores possíveis; `systemStatusSchema` não declara o campo, e `z.object`
o remove silenciosamente. Observado 37 vezes na suíte de integração da rodada
1, com o hook instrumentado para comparar o `data` enviado com o `data`
devolvido pelo `safeParse`: `NOOP` (24), `FAILED` (5), `CONVERGED` (4),
`ACTIVATED` (3), `DEACTIVATED_BY_CHANNEL_CHANGE` (1). A instrumentação era
temporária e foi revertida.

**Impacto de produto:** a tela não distingue "convergiu agora" de "nada
divergia", embora o BFF envie a informação.

#### A-22 — `GET /v1/auth/session` devolve dois campos de perfil não declarados

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** mesma instrumentação de A-21, 10 observações
(`modalities: []`, `address: null`). `businessProfileSchema` declara só `id`,
`businessName`, `category`, `timezone`, `language`, `currency`, `createdAt` e
`updatedAt`; em `/v1/onboarding` e `/v1/settings` os dois campos são
declarados — a assimetria é só na sessão.

**Impacto de produto:** quem lê a sessão precisa de uma segunda chamada para
modalidade e endereço, dados que já vieram na primeira.

#### A-23 — `PATCH /v1/onboarding` e `POST /v1/onboarding/complete` devolvem sete campos de serviço não declarados

**Classificação:** `PENDENCIA-POS-MVP`.

**Reprodução:** mesma instrumentação de A-21, 3 respostas de cada rota. O
objeto `service` inline de `onboardingStateSchema` declara `id`, `name`,
`durationMinutes`, `priceType`, `price` e `active`; as respostas trazem também
`needsReview`, `reviewOrigin`, `description`, `colorToken`,
`bufferBeforeMinutes`, `bufferAfterMinutes` e `recurrenceIntervalDays` — todos
já declarados no `serviceSchema` cheio do pacote.

**Impacto de produto:** `needsReview` (pendência de revisão de serviço,
Goal007) não chega à tela por essas duas rotas.

#### Limite da verificação: campo a mais não reprova

A-21, A-22 e A-23 só apareceram porque o hook foi instrumentado para comparar
o `data` enviado com o `data` que o `safeParse` devolve. `z.object` **remove**
chave não declarada em vez de recusá-la, então drift por campo a mais nunca
deixa a verificação vermelha: o controle negativo da rodada 1 com um campo
extra (`conversationDays` em `/v1/settings/retention`) passou verde, enquanto
o controle com valor fora do vocabulário (`appliesFrom: "NOW"`) derrubou cinco
testes com o erro nomeado. O que este gate cobre hoje é campo faltando, tipo
errado, nulo indevido e valor fora do vocabulário; campo a mais, não. O limite
é desta verificação, não do produto, e está declarado aqui para não ser
descoberto como surpresa.

### Veredito recontado

A contagem desta auditoria muda em duas direções: **A-03** deixa de
reproduzir e sai da categoria `PENDENCIA-POS-MVP`, e entram os quatro achados
novos acima, todos `PENDENCIA-POS-MVP`. O identificador permanece — não é
renumerado nem reaproveitado —, e o registro original em §6 continua
descrevendo o que a auditoria do Goal030 encontrou, sem reescrita. **Esta
auditoria passa a ter 0 achados `BLOQUEADOR-MVP`, 11 `PENDENCIA-POS-MVP`**
(era 8: menos A-03, mais A-20, A-21, A-22 e A-23) **e 6 `LIMITE-DECLARADO`**
(inalterado) — os demais de A-04 a A-19, nenhum deles tocado, corrigido ou
reclassificado por esta unidade. A afirmação contrária da rodada 1 ("nenhum
achado novo entra a partir de A-20") estava errada e foi substituída pelos
registros acima.

Três coisas que este recontar não diz. **Não diz que M4 foi fechado**:
nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o
WhatsApp real. **Não diz que a interface está fiel à referência aprovada**:
este diff não toca `apps/frontend/e2e/`, nenhuma tela, componente, texto ou
CSS — a fidelidade visual segue sendo conferência humana, como §5.3, §7,
§8, §9, §10 e §11 já declaravam. **E não diz que a verificação de resposta
roda em produção**: ela é gate de drift, ligada em `development` e `test`,
e desligada onde o produto realmente responde — o limite está escrito em
`apps/bff/src/lib/response-contract.ts` e em
[VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-novos-do-goal035).

## 13. Fechamento de A-20 a A-23 — Goal036, 2026-09-20

Seção nova, escrita depois da última mudança de árvore do diff036 (WU-01 a
WU-06). Ela **não reescreve** §4 a §12: os registros de A-01 a A-19 em §6, o
veredito de §7 e as cinco seções de fechamento anteriores continuam
exatamente como estavam. Esta seção acrescenta o que o diff036 passou a
garantir sobre os quatro achados que §12 tinha registrado como divergência
real entre o que o BFF devolve e o que o contrato declarava (A-20 a A-23), e
sobre o limite que §12 também registrava — "campo a mais não reprova"
(§12, "Limite da verificação: campo a mais não reprova").

### O que mudou

**Campo a mais passou a reprovar.** `apps/bff/src/lib/response-contract.ts`
ganhou uma segunda direção de comparação: além do que o `safeParse` acusa
como faltando ou de tipo errado (o que já existia desde o Goal035), o hook
agora compara o `data` emitido com o `data` que o `safeParse` devolveu e
reporta toda chave que o parse removeu em silêncio — na raiz, dentro de
objeto aninhado, dentro de elemento de array e do lado da união que
efetivamente parseou. `z.record`, `z.unknown`, `z.any`, `.passthrough()` e
`.catchall()` continuam sem gerar achado, porque para esses tipos o Zod
legitimamente mantém a chave — nada some, então não há o que comparar. O
achado usa o mesmo erro nomeado (`ResponseContractViolationError`), o mesmo
teto de issues reportadas e a mesma mensagem que o campo faltando já usava:
não há canal de saída novo. Isso fecha exatamente o limite que §12 tinha
registrado: **a lacuna era desta verificação, não do produto**, e a lacuna
não existe mais.

**O contrato declara o que o produtor já devolve — fecha A-21, A-22 e
A-23.** Os três achados eram o contrato atrasado em relação a um produtor
que já concordava com o produto: `systemStatusSchema` ganhou `ai.reconciled`
(`aiReconciledValueSchema`, os seis valores que `PUBLIC_API_V1.md` já
documentava para `GET /v1/status`); `businessProfileSchema` ganhou
`modalities` e `address`, opcionais, os mesmos campos e o mesmo tipo já
declarados em `onboardingStateSchema` e `settingsSchema`; o objeto `service`
inline de `onboardingStateSchema` ganhou os sete campos que `serviceSchema`
cheio do pacote já tinha (`needsReview`, `reviewOrigin`, `description`,
`colorToken`, `bufferBeforeMinutes`, `bufferAfterMinutes`,
`recurrenceIntervalDays`). Nenhum handler do BFF mudou: a correção foi
inteira do lado do contrato, porque em nenhum dos três casos o produtor
estava errado.

**A remoção idempotente do responsável principal passou a ser aceita — fecha
A-20.** `deletedIdempotentSchema` (`z.object({ deleted: z.boolean() })`)
substitui `deletedSchema` só na entrada
`DELETE /v1/customers/:id/primary-guardian`; `deletedSchema` continua
`z.literal(true)` em toda outra rota de exclusão, porque nas outras a
exclusão não é idempotente e `{ deleted: false }` continua sendo bug, não
caso válido. `clearCustomerPrimaryGuardian` (`{ deleted: deleted.count > 0
}`) não mudou — era o contrato que recusava um corpo que o produto sempre
quis devolver.

**A rota registrada em laço passou a ser vista pelo lado do BFF.**
`apps/bff/src/modules/conversations/routes.ts` desenrolou o `for` sobre
`["takeover", "release", "resolve"]` em três chamadas `app.post` com path
literal entre aspas, uma por ação — sem mudar path, verbo, `preHandler` nem
corpo de resposta de nenhuma das três rotas. `audit:static` ganhou
`bff_v1_routes_use_literal_paths`
(`findNonLiteralV1RouteRegistrations`), que falha se `app.<verbo>` for
chamado com um path `/v1/...` entre crases em vez de aspas — a forma exata
que deixava as três rotas invisíveis para `public_api_route_coverage`,
registrada como observação não bloqueante em [D-051](DECISIONS.md#d-051). A
tabela do pacote não mudou de tamanho: continua com **116** entradas
(`node -e "import('./packages/public-api-contract/dist/index.js').then((m) => console.log(m.publicApiRoutes.length))"`
imprime `116`), porque as três rotas já tinham entrada — o que era invisível
era a extração automática do lado do BFF, nunca a tabela escrita à mão. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-novos-do-goal036).

**O que este diff não decide.** Fechar os quatro achados não decidiu se
`GET /v1/status`, `GET /v1/auth/session` ou o onboarding *deveriam* devolver
esses campos — decidiu que, já devolvendo, o contrato deveria declará-los.
Nenhuma tela, componente, texto ou CSS do frontend mudou; nenhum arquivo de
`apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` ou
`apps/health-worker/` foi tocado.

### Resultado real da execução

Executado por esta unidade (WU-07), sobre a árvore final, idêntica ao diff
do WU-06 em diante (os cinco controles negativos foram todos revertidos).
`node scripts/final-production-audit.mjs` — exit 0, 33 checks, 32 `passed`,
1 `skipped` declarado (`production_health`, sem
`PRODUCTION_HEALTH_TARGETS`), incluindo `bff_v1_routes_use_literal_paths`
(`ok: true`, "every /v1 route is registered with a literal string path") e
`public_api_route_coverage` (`ok: true`, "read 65 files under apps/bff/src
for /v1 route registrations (116 routes registered) ... every BFF /v1 route
with a frontend caller has a table entry"). `node --test
scripts/tests/final-production-audit-legacy-regression.test.mjs` — 45
`pass`, 0 `fail`, incluindo as três asserções novas de
`bff_v1_routes_use_literal_paths` e a asserção nova de
`public_api_route_coverage` ("a registered route with no frontend caller is
reported, not failed"). `npx vitest run` em `apps/bff` sobre os três
arquivos desta unidade
(`tests/goal036-response-contract-undeclared-key.test.ts`,
`tests/goal036-wu02-declared-fields.test.ts`,
`tests/goal036-wu03-idempotent-delete.test.ts`) — 3 arquivos, 18 testes, 0
falhas. Esta unidade não reexecutou `npm run test:gate`, `npm test` completo
de `apps/bff`/`apps/frontend`, `validate:integration` nem `validate:ui`:
essas execuções pertencem às unidades de implementação e de controle
negativo desta rodada, não à unidade de fechamento documental.

### Achados novos a partir de A-24

Nenhum. A varredura desta unidade sobre a saída de `public_api_route_coverage`
encontrou um detalhe que merece registro, mas não achado novo: as mesmas três
rotas (`takeover`, `release`, `resolve`) aparecem agora, pela primeira vez, na
lista computada de "rotas sem chamador no frontend" — não porque o chamador
não exista (`apps/frontend/src/data/services/BffConversationService.ts:171`
chama as três), mas porque `FRONTEND_ROUTE_SCHEMA_CALL_PATTERN` também exige
path literal entre aspas, e o chamador das três é
`` routeSchema<Conversation>("POST", `/v1/conversations/:id/${action}`) `` —
crase, do lado do frontend. Antes deste diff esse fato nunca aparecia em
lugar nenhum, porque as três rotas eram inteiramente invisíveis à extração do
lado do BFF; o diff036 corrigiu só esse lado. Hoje não há lacuna real — a
tabela tem as três entradas e ambos os chamadores existem de fato —, então
isto é o mesmo tipo de limite de ferramenta que §12/[VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-novos-do-goal035)
já registrava para a rota de mídia sem chamador, não um defeito de produto
nem uma divergência de contrato. Registrado em
[VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-novos-do-goal036) para
não ser descoberto como surpresa se uma rota futura for registrada dessa
forma nos dois lados ao mesmo tempo.

### Veredito recontado

A contagem desta auditoria muda em duas direções: **A-20**, **A-21**,
**A-22** e **A-23** deixam de reproduzir e saem da categoria
`PENDENCIA-POS-MVP`, e nenhum achado novo entra. Os quatro identificadores
permanecem — não são renumerados nem reaproveitados —, e os registros
originais em §12 continuam descrevendo o que a verificação de resposta do
Goal035 encontrou, sem reescrita. **Esta auditoria passa a ter 0 achados
`BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`** (era 11: menos A-20, A-21, A-22 e
A-23) **e 6 `LIMITE-DECLARADO`** (inalterado) — os demais de A-04 a A-19,
nenhum deles tocado, corrigido ou reclassificado por esta unidade.

Três coisas que este recontar não diz. **Não diz que M4 foi fechado**:
nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o
WhatsApp real — o diff036 toca `apps/bff/`, `packages/public-api-contract/`,
`apps/frontend/src/data/services/BffCustomerService.ts`,
`scripts/final-production-audit.mjs`,
`scripts/goal033-authenticated-ui-rehearsal.mjs`,
`scripts/tests/final-production-audit-legacy-regression.test.mjs`,
`apps/frontend/e2e/authenticated-matrix.spec.ts` (arquivo do Goal033,
aqui só acrescido) e ajustes nos testes
`apps/frontend/tests/goal018-dashboard-status.test.tsx`,
`apps/frontend/tests/goal018-onboarding-reachability.test.tsx`,
`apps/frontend/tests/goal022-notifications-chrome.test.tsx` e
`apps/frontend/tests/goal025-account-deletion-shell-banner.test.tsx`, além da
documentação de migração — nada além disso. **Não diz que a fidelidade
visual está provada**: `apps/frontend/e2e/authenticated-matrix.spec.ts`
só ajusta dados de asserção do rehearsal (`GOAL033_MEASURED_DATE` e a data
medida), e os quatro testes de `apps/frontend/tests/` só ajustam fixtures
para os campos novos declarados pelos schemas (`reconciled`,
`bufferAfterMinutes`, `bufferBeforeMinutes`, `needsReview`) — nenhum toca
tela, componente, texto ou CSS. A fidelidade visual segue sendo conferência
humana, como §5.3, §7 e as cinco seções de fechamento anteriores já
declaravam. **E não diz que a verificação de resposta roda em
produção**: `RESPONSE_CONTRACT_CHECK_ENABLED` continua
`env.NODE_ENV !== "production"`, inalterado por este diff — ela segue ligada
só em `development` e `test`, e desligada onde o produto realmente responde,
pelo mesmo motivo que §12 já registrava.

## 14. Fechamento do chamador `/v1` em laço do lado do frontend — Goal037, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff037 (WU-01 a
WU-06). Ela **não reescreve** §4 a §13: os registros de A-01 a A-19 em §6, o
veredito de §7 e as seis seções de fechamento anteriores continuam
exatamente como estavam. Esta seção acrescenta o que o diff037 passou a
garantir sobre o detalhe que §13 tinha registrado como limite de ferramenta,
nunca achado — o chamador `/v1` em laço do lado do **frontend**, invisível à
mesma extração estática que o Goal036 já tinha corrigido do lado do BFF —,
e sobre dois assuntos que não eram achado nem limite registrado antes deste
Goal: o conjunto fechado dos textos que o produto emite por conta própria, e
a retentativa do gate autenticado.

### O que mudou

**O chamador `/v1` em laço também exige path literal do lado do
frontend.** `BffConversationService.ts` trocava `takeover`, `release` e
`resolve` por um `mutateState` único que montava o path por template literal
(`` `/v1/conversations/:id/${action}` ``) e recebia o `schema` já resolvido
por chamador — a mesma forma, do outro lado do contrato, que
`apps/bff/src/modules/conversations/routes.ts` tinha antes do Goal036. Os
três métodos passam a chamar `routeSchema<Conversation>("POST", ...)` cada
um com o próprio path entre aspas, e `mutateState` recebe o `schema` já
resolvido como parâmetro em vez de montá-lo. `audit:static` ganhou
`frontend_v1_route_schema_calls_use_literal_patterns`
(`findNonLiteralFrontendV1RouteSchemaCalls`), que falha se um `routeSchema`
de `apps/frontend/src/data/services` declarar um padrão `/v1/...` entre
crases — o par exato de `bff_v1_routes_use_literal_paths` (Goal036), agora
do outro lado. Isso fecha exatamente o limite que §13 tinha registrado: as
três rotas deixam de aparecer no `details` de `public_api_route_coverage`
como "sem chamador no frontend", porque o chamador agora é literal. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-novos-do-goal037).

**O conjunto fechado dos textos do produto passa a cobrir
`message-graph.ts`.** `PRODUCT_OWN_TEXTS` (D-050, Goal034) reunia só os
textos de `assistant.service.ts`; uma observação não bloqueante do
[review034](reviews/034-review.md) já tinha avisado que um texto de cliente
emitido por outro módulo, de outra forma, escaparia do fechamento em
silêncio. `message-graph.ts` passa a exportar os seis textos de cliente que
já emitia por conta própria (`unsupportedMessageReply`,
`processingErrorReply`, `audioNotUnderstoodReply`, `imageReceivedReply`,
`documentReceivedReply`, `videoReceivedReply` — `imageHandoffSummary` fica
de fora, de propósito, porque vai para o `Handoff`, não para a cliente), e
`assistant.service.ts` os soma a `PRODUCT_OWN_TEXTS`. O teste de fechamento
ganhou um segundo extrator, para o padrão de despacho de `message-graph.ts`
(`text: identificador` ou `text: funçãoQueSóRetornaIdentificador()`), ao
lado do extrator existente sobre `messages: [...]` — os dois convivem, nenhum
substitui o outro. `VOCABULARIO_DE_ESPERA` deixa de ser duas cópias
idênticas (`tests/assistant/assistant.service.test.ts` e
`tests/evals/waiting-message-vocabulary.eval.test.ts`) e vira uma definição
única em `tests/support/vocabulario-de-espera.ts`. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#invariante-de-texto-ampliada-do-goal037).

**A retentativa do gate autenticado deixa de ser silenciosa — e agora
identifica a rota de verdade.** `scripts/goal033-authenticated-ui-rehearsal.mjs`
lê o relatório JSON que `playwright.authenticated.config.ts` já escreve,
extrai todo teste `status: "flaky"` (`extractRetriedTests`) e imprime projeto
e título de cada um — sempre, inclusive "0" quando nenhum precisou. O
processo continua saindo `0` quando toda retentativa passa na segunda
tentativa: **flaky não reprova o gate**, só deixa de estar invisível dentro de
um `exit 0`. A primeira versão de `extractRetriedTests` nesta mesma rodada
usava só `spec.title` — e as 35 medidas de `authenticated-matrix.spec.ts`
compartilham o mesmo título (`"measured, logged in"`), um por
`test.describe(route.name, ...)`; sem a cadeia de `suites` ancestrais, o log
não conseguia dizer qual das 7 rotas tinha retentado, só que uma delas o fez.
`extractRetriedTests` agora inclui essa cadeia (o nome da rota) no título
retornado, então a distinção passa a ser verificável a partir deste diff em
diante. O que ela **não** torna verificável retroativamente: o único `flaky`
já registrado por §10 (Goal033) como "timing de execução" foi lido do relatório
daquela execução por inspeção manual da estrutura de `suites`, não por este
extrator — a atribuição a `/agenda`, `desktop-1440` especificamente vem de
lá, não de uma nova leitura desta rodada. E a causa medida agora (rate limit)
não é uma propriedade da rota: o log de requisições do BFF mostra as 35
medidas do gate autenticado perto do teto de `@fastify/rate-limit`
(`max: 300, timeWindow: "1 minute"`, por IP) — 285 a 294 requisições numa
janela de 60s, 95% a 98% do orçamento —, e cruzá-lo faz
`GET /v1/auth/session` ou a leitura de lista da própria tela devolver `429`,
que a interface trata como erro de sessão ou de tela; qual das 35 medidas
cruza o teto depende da posição dela na janela de execução, não da rota que
mede. Chamar isso de "a causa do flake de `/agenda`" atribui à rota um
comportamento que é, na verdade, do momento em que a medida corre.
`authenticated-matrix.spec.ts` passa a ler `x-ratelimit-remaining`/`x-ratelimit-reset`
das respostas que a página já recebe e espera a janela virar antes de
qualquer teste — de qualquer rota — que começaria com menos de 30
requisições de orçamento restante — sem afrouxar asserção, sem pular medida e
sem tocar o limite do produto, que continua `max: 300` por minuto, por IP,
decisão fora do escopo deste diff. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#declaração-de-retentativa-do-goal037).

**O que este diff não decide.** Fechar o limite do chamador em laço não
decidiu se path dinâmico de rota `/v1` deveria um dia ser reconhecido pela
extração estática — decidiu proibir a forma que hoje escapa dela, nos dois
lados. Ampliar o conjunto fechado de textos não decidiu nada sobre o que o
**modelo** produz — a fronteira entre garantia de código e orientação de
prompt que D-050 já tinha declarado não muda. Declarar a retentativa não
decidiu que flaky deveria reprovar o gate, nem mudou o teto de `retries` do
Playwright. Nenhuma migration, nenhuma rota, nenhum contrato público e
nenhuma tela, componente, texto ou CSS do frontend mudou neste diff.

### Resultado real da execução

Executado por esta unidade (WU-07), sobre a árvore final, idêntica ao diff
do WU-06 em diante (os cinco controles negativos foram todos revertidos).
`node scripts/final-production-audit.mjs` — exit 0, 34 checks, 33 `passed`,
1 `skipped` declarado (`production_health`, sem
`PRODUCTION_HEALTH_TARGETS`), incluindo `frontend_v1_route_schema_calls_use_literal_patterns`
(`ok: true`, "read 17 files under apps/frontend/src/data/services for
routeSchema() calls ... every routeSchema() call for a /v1 route declares a
literal pattern") e `public_api_route_coverage` (`ok: true`, 116 rotas
registradas, "every BFF /v1 route with a frontend caller has a table
entry", só `GET /v1/conversations/:id/messages/:messageId/media` sem
chamador — a rota de mídia já conhecida desde o Goal035, nunca mais as três
de `conversations`). `node --test
scripts/tests/final-production-audit-legacy-regression.test.mjs` — 48
`pass`, 0 `fail`, incluindo as três asserções novas de
`frontend_v1_route_schema_calls_use_literal_patterns`. `node --test
scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` — 11 `pass`, 0
`fail`, incluindo as quatro asserções novas de `extractRetriedTests` e
`readGateReport`. `npx vitest run tests/assistant/assistant.service.test.ts
tests/evals/waiting-message-vocabulary.eval.test.ts` em
`apps/ai-orchestrator` — 2 arquivos, 19 testes, 0 falhas. Esta unidade não
reexecutou `npm run test:gate`, `npm test` completo de
`apps/ai-orchestrator`/`apps/frontend`, `validate:integration`,
`validate:ui` nem o ensaio autenticado real
(`rehearse:goal033-authenticated-ui`): essas execuções pertencem às
unidades de implementação e de controle negativo desta rodada, não à
unidade de fechamento documental.

### Achados novos a partir de A-24

Nenhum. O detalhe que este diff fecha — o chamador em laço do lado do
frontend — nunca foi achado: §13 já o tinha registrado como o mesmo tipo de
limite de ferramenta que a rota de mídia sem chamador (§12), não como
divergência de contrato nem defeito de produto, porque a tabela já tinha as
três entradas e ambos os chamadores já existiam de fato. Fechá-lo remove o
limite declarado, não corrige um achado. A causa do `flaky` já registrado por
§10 (rate limit do BFF) também não é achado novo: é diagnóstico sobre o
**gate** que mede o produto, não sobre o produto — o limite de
`@fastify/rate-limit` já era comportamento intencional do BFF, só não estava
correlacionado ao `flaky` que §10 já tinha registrado e classificado como
não-achado. A causa em si (orçamento de rate limit perto do teto numa janela
de 60s) é do momento em que a medida corre, não da rota `/agenda` que §10
nomeou — qualquer uma das 35 medidas do ensaio poderia ter cruzado o teto,
dependendo só de quando ela caiu na janela.

### Veredito recontado

A contagem desta auditoria **não muda**: nenhum achado de A-04 a A-08, A-11
a A-17 ou A-19 foi tocado, corrigido ou reclassificado, e nenhum achado
fechado (A-01, A-02, A-03, A-09, A-10, A-18, A-20 a A-23) foi reaberto. Esta
auditoria continua com **0 achados `BLOQUEADOR-MVP`, 7
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — os mesmos números que §13
já deixava, porque o que este diff fecha nunca tinha entrado nessa contagem
como achado.

Três coisas que este recontar não diz. **Não diz que M4 foi fechado**:
nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o
WhatsApp real — o diff037 toca
`apps/ai-orchestrator/src/modules/assistant/assistant.service.ts`,
`apps/ai-orchestrator/src/modules/graph/message-graph.ts`,
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/evals/waiting-message-vocabulary.eval.test.ts`,
`apps/ai-orchestrator/tests/support/vocabulario-de-espera.ts` (novo),
`apps/frontend/e2e/authenticated-matrix.spec.ts`,
`apps/frontend/src/data/services/BffConversationService.ts`,
`scripts/final-production-audit.mjs`,
`scripts/goal033-authenticated-ui-rehearsal.mjs`,
`scripts/tests/final-production-audit-legacy-regression.test.mjs`,
`scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` e a
documentação de migração — nada além disso. **Não diz que a fidelidade
visual está provada**: `authenticated-matrix.spec.ts` só ganha leitura de
cabeçalho de rate limit e uma espera condicional antes de cada teste, sem
tocar tela, componente, texto ou CSS; a fidelidade visual segue sendo
conferência humana, como §5.3, §7 e as seis seções de fechamento anteriores
já declaravam. **E não diz que a verificação de resposta roda em
produção**: `RESPONSE_CONTRACT_CHECK_ENABLED` continua
`env.NODE_ENV !== "production"`, inalterado por este diff — nenhum arquivo
de `apps/bff/` foi tocado.

## 15. Fechamento da classe de reconhecimento por forma sem resíduo declarado — Goal038, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff038 (WU-01 a
WU-06, com os seis controles negativos revertidos, mais FIX-001 das rodadas
2 e 3 — a última mudança de árvore é o suporte ao handler de rota passado
por referência, descrito abaixo). Ela **não reescreve**
§4 a §14: os registros de A-01 a A-19 em §6, o veredito de §7 e as sete
seções de fechamento anteriores continuam exatamente como estavam. Esta
seção acrescenta o que o diff038 passou a garantir sobre a classe que o
diff037 tinha fechado por instância — todo extrator deste repositório que
reconhece candidato por forma textual passa a enumerar as categorias que
aceita, e o que não cai em nenhuma vira resíduo que derruba o artefato que
o vigia — e sobre o frescor do relatório que o gate público passa a exigir,
pelo mesmo leitor do gate autenticado.

### O que mudou

**O fechamento de `assistant.service.ts` deixa de passar por não ver
nada.** `extractMessagesArrayLiterals` devolvia **zero** literais sobre o
arquivo real: os seis sítios `messages: [...]` usam
`PRODUCT_OWN_FIXED_TEXTS.<chave>` e `buildStyleGreeting(...)`, nunca literal
entre aspas, e o teste de fechamento — sem o piso `toBeGreaterThan(0)` que
o teste irmão sobre `message-graph.ts` já tinha — ficava verde por iterar
sobre lista vazia. O extrator passa a classificar cada expressão em uma das
quatro categorias nomeadas de `classifyMessageExpressionSites` —
`quoted_literal`, `fixed_text_reference`,
`dynamic_turn_value_with_fixed_text_fallback`, `style_greeting_builder` —,
e forma fora delas vira resíduo que derruba o fechamento nomeando arquivo e
linha, em vez de devolver `[]` em silêncio. Sobre o arquivo real: 6 sítios,
8 textos resolvidos, resíduo zero. O fechamento ganha piso
(`countMessagesArraySites`): reprova se devolver menos textos do que sítios
`messages: [...]` o arquivo tem. Nenhuma copy muda e `PRODUCT_OWN_TEXTS` não ganha nem perde entrada —
provado por diff. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#invariante-de-texto-classificada-do-goal038).

**Os 16 sítios `text:` de `message-graph.ts` passam a ser classificados em
categorias nomeadas, com resíduo zero.** `extractDispatchedModuleConstantTexts`
descartava 13 dos 16 sítios sem contar, nomear nem distinguir entre eles —
10 expressão dinâmica do turno (descarte correto) e 3 anotação de tipo, mas
um `text:` com literal inline ou template literal seria descartado do
mesmo jeito. `classifyDispatchedTextSites` nomeia as três categorias —
`module_constant` (entra no fechamento), `dynamic_turn_expression` e
`type_annotation` (declaradas, descartadas) — e lança erro nomeando arquivo
e linha para qualquer sítio fora delas. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#invariante-de-texto-classificada-do-goal038).

**O reconhecimento de rota `/v1` deixa de exigir genérico do TypeScript ou
receptor chamado `app`.** Nenhum dos dois definia se a chamada/registro
existia; uma chamada `routeSchema("GET", ...)` sem genérico escapava dos
dois lados ao mesmo tempo — o mesmo escape duplo que o diff037 já tinha
fechado para a crase, por outra forma. Os quatro padrões existentes dão
lugar a enumeração: `classifyBffRouteRegistrationSites` e
`classifyFrontendRouteSchemaCallSites` classificam cada ocorrência candidata
em categoria nomeada — 142 sítios no BFF, 116 no frontend, resíduo zero
sobre a árvore real —, e a terceira forma, path vindo de constante, passa a
reprovar com arquivo e linha em vez de escapar dos dois lados. No BFF isso
vale com o handler escrito no lugar **e** com o handler passado por
referência (`server.post(TAKEOVER_PATH, handleTakeover)`): a forma do handler
nunca definiu se a chamada registra rota. O que separa registro de rota de
`mapa.get(chave)` e de cliente HTTP é computado — aridade (path e handler) e
posição (registro de rota é statement, ninguém lê o valor da chamada). Sem
allowlist nova. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#checks-estáticos-ampliados-do-goal038).

**O relatório lido pelos dois gates renderizados prova que pertence à
execução que acabou.** `scripts/lib/playwright-report.mjs` (novo)
concentra o leitor único; os dois gates apagam o `results.json` anterior
antes de subir o Playwright e recusam, com erro nomeado, um relatório cujo
`mtime` é anterior ao instante em que a execução começou. O gate público
(`npm run validate:ui`) ganha leitor pela primeira vez — antes não tinha
nenhum, e a retentativa do Playwright ficava invisível dentro do `exit 0`
do comando `cd apps/frontend && npm run test:ui`. `retries: 1` não mudou em
nenhum `playwright.*.config.ts` e `flaky` continua terminando com sucesso
nos dois gates. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#frescor-do-relatório-compartilhado-do-goal038).

**O que este diff não decide.** Enumerar categoria de reconhecimento não
decidiu que um quinto módulo emissor de texto de cliente, ou uma forma de
despacho diferente das reconhecidas, não precisará de extensão própria —
decidiu proibir a forma que hoje escapa em silêncio, não prever toda forma
futura. Ampliar o reconhecimento de rota `/v1` não decidiu que path
dinâmico deveria um dia ser aceito — continua proibido, nos dois lados.
Declarar frescor de relatório não decidiu que retentativa deveria reprovar
o gate, nem mudou `retries`. Nenhuma migration, nenhuma rota, nenhum
contrato público e nenhuma tela, componente, texto ou CSS do frontend mudou
neste diff.

### Resultado real da execução

Executado por esta unidade (FIX-001 da rodada 3), sobre a árvore final desta
rodada — depois da correção dos dois blockers do review da rodada 2 e com os
seis controles negativos revertidos. Cada número abaixo foi lido da execução
citada, nesta worktree, depois da última mudança de árvore; nenhum foi
transcrito de rodada anterior.

- `node scripts/final-production-audit.mjs` — exit 0, 34 checks, 33 `passed`,
  1 `skipped` declarado (`production_health`, sem `PRODUCTION_HEALTH_TARGETS`).
  `bff_v1_routes_use_literal_paths`: `ok: true`, 65 arquivos lidos, **142**
  sítios classificados (`literal_other_path=4, literal_v1_path=116,
  not_a_route_registration=22`), resíduo zero.
  `frontend_v1_route_schema_calls_use_literal_patterns`: `ok: true`, 17
  arquivos lidos, **116** sítios (`literal_pattern=116`), resíduo zero.
  `public_api_route_coverage`: `ok: true`, 116 rotas registradas, só
  `GET /v1/conversations/:id/messages/:messageId/media` sem chamador.
- `node --test scripts/tests/final-production-audit-legacy-regression.test.mjs`
  — **61** `pass`, 0 `fail`, incluindo o caso novo do registro com path
  constante e handler passado por referência.
- `node --test scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` —
  **14** `pass`, 0 `fail`, incluindo as duas asserções de frescor sobre
  `readGateReport`.
- `node --test scripts/tests/validate-ui.test.mjs` (novo) — **10** `pass`, 0
  `fail`, cobrindo os quatro cenários nomeados no critério de aceite (verde
  limpo, verde com flaky, relatório velho, Playwright vermelho).
- `node --test tools/ia-loop/tests/deterministic-executor.test.mjs` — **13**
  `pass`, 0 `fail`, cobrindo o filtro de teste reescrito para o diretório em
  que a ação roda.
- `npx vitest run tests/assistant/assistant.service.test.ts` em
  `apps/ai-orchestrator` — **23** testes, 0 falhas, incluindo as classificações
  novas de `assistant.service.ts` e `message-graph.ts` e os dois controles
  negativos embutidos como teste permanente (piso do fechamento, resíduo em
  `text:`).
- `npx vitest run tests/evals/waiting-message-vocabulary.eval.test.ts` em
  `apps/ai-orchestrator` — **2** testes, 0 falhas: o controle de vocabulário de
  espera do Goal037 não regrediu.

Não reexecutados por esta unidade, e por isso sem número reproduzido aqui:
`npm run test:gate`, `npm test` completo de `apps/ai-orchestrator` e de
`apps/frontend`, `validate:core`, `validate:integration`, `validate:ui` e o
ensaio autenticado real (`rehearse:goal033-authenticated-ui`). Essas execuções
pertencem às unidades de implementação e de controle negativo desta rodada.

### Achados novos a partir de A-24

Nenhum. `apps/frontend/src/`, `apps/bff/src/` e `apps/ai-orchestrator/src/`
não foram tocados neste diff — confirmado por diff —, então nenhum resíduo
apareceu em código de produção para virar achado. O que este diff fecha é
lacuna de **extração estática de teste e de gate**, não de produto: os
quatro extratores passavam a reconhecer menos do que a árvore real usa, e
nenhuma das formas que passam a ser reconhecidas — referência a
`PRODUCT_OWN_FIXED_TEXTS`, saudação de estilo, chamador sem genérico,
registro em receptor diferente de `app` — é comportamento novo do produto;
são formas que a árvore já tinha, invisíveis à leitura estática anterior.

### Veredito recontado

A contagem desta auditoria **não muda**: nenhum achado de A-04 a A-08, A-11
a A-17 ou A-19 foi tocado, corrigido ou reclassificado, e nenhum achado
fechado (A-01, A-02, A-03, A-09, A-10, A-18, A-20 a A-23) foi reaberto. Esta
auditoria continua com **0 achados `BLOQUEADOR-MVP`, 7
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — os mesmos números que
§14 já deixava, porque o que este diff fecha nunca tinha entrado nessa
contagem como achado nem como limite declarado à parte.

Três coisas que este recontar não diz. **Não diz que M4 foi fechado**:
nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o
WhatsApp real — o diff038 toca
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`scripts/final-production-audit.mjs`,
`scripts/tests/final-production-audit-legacy-regression.test.mjs`,
`scripts/goal033-authenticated-ui-rehearsal.mjs`,
`scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs`,
`scripts/lib/playwright-report.mjs` (novo), `scripts/validate-ui.mjs`
(novo), `scripts/tests/validate-ui.test.mjs` (novo), `package.json`,
`tools/ia-loop/lib/deterministic-executor.mjs`,
`tools/ia-loop/tests/deterministic-executor.test.mjs` e a documentação de
migração — nada além disso. Os dois arquivos de `tools/ia-loop/` são
harness, não produto: corrigem o filtro de teste que uma ação de escopo
passava ao Vitest, e nenhum código de `apps/` depende deles. **Não diz que a fidelidade
visual está provada**: nenhum arquivo de `apps/frontend/src/` mudou, nenhum
teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve
tolerância aumentada, e a matriz de larguras continua com as cinco; a
fidelidade visual segue sendo conferência humana, como §5.3, §7 e as sete
seções de fechamento anteriores já declaravam. **E não diz que a
verificação de resposta roda em produção**: nenhum arquivo de `apps/bff/`
foi tocado e `RESPONSE_CONTRACT_CHECK_ENABLED` continua
`env.NODE_ENV !== "production"`, inalterado por este diff.

## 16. Fechamento do escopo de guard escrito à mão — Goal039, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff039 (WU-01 a
WU-04, com os cinco controles negativos obrigatórios executados e
revertidos pela WU-04). Ela **não reescreve** §4 a §15: os registros de
A-01 a A-19 em §6, o veredito de §7 e as oito seções de fechamento
anteriores continuam exatamente como estavam. O [review038](reviews/038-review.md)
tinha registrado, como observação não bloqueante, que "resíduo zero não é
cobertura universal" — o Goal038 fechou a forma dentro de cada extrator,
mas o **escopo** de arquivos que cada um lia continuava sendo lista escrita
à mão, a mesma allowlist que o Goal038 tinha proibido dentro das regras, um
nível acima delas. Esta seção acrescenta o que o diff039 passou a
garantir: o descobridor de emissores de texto pelo canal do produto lê
`apps/ai-orchestrator/src` inteiro, o guardrail de vocabulário de espera
alcança o texto que `notification-message.ts` entrega à cliente, e o
chamador do contrato público é procurado em `apps/frontend/src` inteiro.

### O que mudou

**O conjunto de sítios de envio de texto passa a ser descoberto, não uma
lista de dois arquivos.** `discoverSendTextSites`
(`apps/ai-orchestrator/tests/support/send-text-sites.ts`, novo) lê
`apps/ai-orchestrator/src` recursivamente e classifica toda ocorrência de
`sendText(` em `port_declaration`, `adapter_implementation`,
`product_own_text_to_customer`, `text_in_transit_named_origin` (origem
nomeada) ou `person_typed_text`; fora dessas cinco é resíduo que derruba o
teste, nomeando arquivo e linha. Sobre a árvore real: **7** sítios,
`{port_declaration: 1, adapter_implementation: 1,
product_own_text_to_customer: 2, text_in_transit_named_origin: 2,
person_typed_text: 1}`, resíduo zero — os cinco envios reais que a baseline
já tinha (`message-graph.ts`, `NotificationDeliveryService.ts`,
`ActivationTestReplySender.ts`, `PlatformWhatsAppSender.ts`,
`internal/routes.ts`), mais a porta e o adapter. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#conjunto-de-emissores-de-texto-do-goal039).

**O guardrail de vocabulário de espera passa a alcançar o texto que o
lembrete e o aviso de alteração entregam à cliente.**
`classifyNotificationTextSites`
(`apps/ai-orchestrator/tests/support/notification-message-sites.ts`, novo)
classifica cada sítio que produz texto em `notification-message.ts` em
`style_voice_greeting_ternary`, `style_voice_static_literal`,
`factual_change_notice_ternary` ou `factual_single_template`; forma fora
dessas quatro é resíduo com arquivo e linha. Sobre o arquivo real: **12**
sítios, `{style_voice_greeting_ternary: 3, style_voice_static_literal: 6,
factual_change_notice_ternary: 1, factual_single_template: 2}`, resíduo
zero. `NOTIFICATION_MESSAGE_TEXTS`, montado executando
`composeNotificationText`/`notificationFactualLines` sobre fatos declarados
no teste, entra em `VERIFIED_CLIENT_TEXTS` ao lado de `PRODUCT_OWN_TEXTS` e
é conferido contra `VOCABULARIO_DE_ESPERA`. `ACTIVATION_TEST_NOTICE` e as
três falas de cliente simulado ficam em categoria declarada
(`activation_test_channel`), fora deste guardrail, com o motivo escrito
junto — decisão registrada, não omissão. `PRODUCT_OWN_TEXTS` não muda e
nenhuma copy muda, provado por teste e por diff. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#guardrail-de-espera-sobre-o-texto-do-lembrete-e-do-aviso-de-alteração).

**O chamador do contrato público deixa de ser procurado só em
`data/services`.** `classifyFrontendRouteSchemaCallSites`
(`scripts/final-production-audit.mjs`) passa a receber
`sourceFiles("apps/frontend/src")` inteiro; a definição
`function routeSchema<T>(` em `data/http/BffHttpClient.ts` cai na categoria
própria `definition`, nunca conta como chamada nem como resíduo. Uma
chamada fora de `data/services` passa a ser reconhecida como chamador ou
vira resíduo nomeado, em vez de escapar dos dois lados ao mesmo tempo — o
terceiro escape duplo desta série (037 fechou o da crase, 038 o do
genérico/receptor). Sobre a árvore real:
`frontend_v1_route_schema_calls_use_literal_patterns` `ok: true` — **194**
arquivos, **117** sítios (`definition=1, literal_pattern=116`), resíduo
zero —, e `public_api_route_coverage` `ok: true` — **194** arquivos do
frontend, **116** rotas do BFF, continua só
`GET /v1/conversations/:id/messages/:messageId/media` sem chamador, o
mesmo número da baseline. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#escopo-computado-do-chamador-de-contrato-público-do-goal039).

**O que este diff não decide.** Ampliar o escopo de leitura não decidiu que
os três descobridores agora cobrem todo canal de saída possível — um canal
de texto que não seja `sendText` sobre `WhatsAppProvider`, ou uma pasta do
frontend fora de `apps/frontend/src`, continuariam exigindo extensão
própria. Declarar `ACTIVATION_TEST_NOTICE` e as três falas de cliente
simulado como categoria fora do guardrail não decidiu que texto operacional
nunca precisa de revisão — decidiu apenas que ele não é texto do produto
para a cliente do negócio, e por isso não passa pelo mesmo vocabulário
fechado. Nenhuma migration, nenhuma rota, nenhum contrato público e nenhuma
tela, componente, texto ou CSS do frontend mudou neste diff.

### Resultado real da execução

Executado por esta unidade, sobre a árvore final desta rodada — depois dos
cinco controles negativos obrigatórios (WU-04) e da reversão de cada um;
`git status --porcelain` confirma os cinco arquivos do diff039, sem
resíduo dos controles. Cada número abaixo foi lido da execução citada,
nesta worktree, depois da última mudança de árvore.

- `node scripts/final-production-audit.mjs` — exit 0, **34** checks, **33**
  `passed`, 1 `skipped` declarado (`production_health`, sem
  `PRODUCTION_HEALTH_TARGETS`).
  `frontend_v1_route_schema_calls_use_literal_patterns`: `ok: true`, **194**
  arquivos lidos, **117** sítios (`definition=1, literal_pattern=116`),
  resíduo zero.
  `public_api_route_coverage`: `ok: true`, **116** rotas registradas, **194**
  arquivos do frontend lidos, só
  `GET /v1/conversations/:id/messages/:messageId/media` sem chamador.
- `node --test scripts/tests/final-production-audit-legacy-regression.test.mjs`
  — **64** `pass`, 0 `fail`, incluindo os três casos novos da definição de
  `routeSchema`, do chamador fora de `data/services` e da forma não
  literal fora de `data/services`.
- `npx vitest run tests/assistant/assistant.service.test.ts` em
  `apps/ai-orchestrator` — **37** testes, 0 falhas: os 23 já existentes do
  Goal038 mais os 14 novos deste diff (descoberta de sítios de envio,
  fechamento de `notification-message.ts`, categoria declarada do canal de
  teste de ativação e reafirmação de `PRODUCT_OWN_TEXTS`).

Não reexecutados por esta unidade, e por isso sem número reproduzido aqui:
`validate:core` completo, `npm run test:gate`, `validate:integration`,
`test:bff` e `test:frontend`, e o restante da suíte de `apps/ai-orchestrator`
além do arquivo citado. Essas execuções, e os cinco controles negativos com
as duas saídas cada, pertencem às unidades de implementação e de controle
negativo desta rodada.

### Achados novos a partir de A-24

Nenhum. `apps/frontend/src/`, `apps/bff/src/` e `apps/ai-orchestrator/src/`
não foram tocados neste diff — confirmado por diff —, então nenhum resíduo
apareceu em código de produção para virar achado. Os quatro fatos que o
Goal039 tinha ido conferir sobre a baseline — sítios de `sendText` fora da
dupla vigiada, texto de `notification-message.ts` fora do guardrail, texto
do canal de teste de ativação sem categoria declarada, e chamador de
`routeSchema` fora de `data/services` — não continham violação real: nenhum
casava com `VOCABULARIO_DE_ESPERA` e nenhuma chamada de `routeSchema` fora
de `data/services` existia na árvore. O que este diff fecha é lacuna de
**escopo de leitura de teste e de gate**, não de produto.

### Veredito recontado

A contagem desta auditoria **não muda**: nenhum achado de A-04 a A-08, A-11
a A-17 ou A-19 foi tocado, corrigido ou reclassificado, e nenhum achado
fechado (A-01, A-02, A-03, A-09, A-10, A-18, A-20 a A-23) foi reaberto. Esta
auditoria continua com **0 achados `BLOQUEADOR-MVP`, 7
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — os mesmos números que
§15 já deixava, porque o que este diff amplia é escopo de leitura de guard
de teste, e isso nunca tinha entrado nessa contagem como achado nem como
limite declarado à parte.

Três coisas que este recontar não diz. **Não diz que M4 foi fechado**:
nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o
WhatsApp real — o diff039 toca
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/support/send-text-sites.ts` (novo),
`apps/ai-orchestrator/tests/support/notification-message-sites.ts` (novo),
`scripts/final-production-audit.mjs`,
`scripts/tests/final-production-audit-legacy-regression.test.mjs` e a
documentação de migração — nada além disso. **Não diz que a fidelidade
visual está provada**: nenhum arquivo de `apps/frontend/src/` mudou, nenhum
teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve
tolerância aumentada, e a matriz de larguras continua com as cinco. **E não
diz que a verificação de resposta roda em produção**: nenhum arquivo de
`apps/bff/` foi tocado e `RESPONSE_CONTRACT_CHECK_ENABLED` continua
`env.NODE_ENV !== "production"`, inalterado por este diff.

## 17. Fechamento do token literal e da categoria não ligada — Goal040, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff040 (WU-01 a
WU-05, com os cinco controles negativos obrigatórios executados e
revertidos pela WU-05). Ela **não reescreve** §4 a §16: os registros de
A-01 a A-19 em §6, o veredito de §7 e as nove seções de fechamento
anteriores continuam exatamente como estavam. O Goal039 tinha computado o
**escopo de leitura** de cada descobridor; este Goal fecha dois pontos
adjacentes que ficaram de fora: o **token** que define quais métodos da
porta `WhatsAppProvider` carregam texto ainda era escrito à mão, e a
categoria de texto próprio do produto não distinguia o que o código compõe
de forma testável do que o modelo decide, nem ligava o primeiro ao
conjunto verificado. Um terceiro ponto, seguir a cadeia de trânsito até o
chamador, entra junto.

### O que mudou

**O conjunto de métodos portadores de texto passa a ser derivado da
declaração da porta, não um token literal.** `parseWhatsAppProviderMethods`
(`apps/ai-orchestrator/tests/support/send-text-sites.ts`) lê a interface
`WhatsAppProvider` e classifica cada método como portador se o tipo do
primeiro parâmetro declarar, no nível superior, `text: string`. Sobre a
declaração real: **2** métodos — `sendText` (`isCarrier: true`) e
`downloadMedia` (`isCarrier: false`). `resolveSendTextCarrierMethodNames()`
devolve `["sendText"]`, e `buildSendTextTokenPattern()` monta o padrão de
busca a partir desse nome, substituindo o token fixo `/\bsendText\s*\(/g`
da baseline. Método cujo parâmetro não resolve a uma interface no mesmo
arquivo é resíduo nomeado. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#conjunto-de-métodos-portadores-de-texto-derivado-da-porta-categoria-de-texto-próprio-dividida-e-cadeia-de-trânsito-seguida-do-goal040).

**A categoria de texto próprio do produto liga o composto ao conjunto
verificado, e separa o que o modelo decide.**
`SendTextSiteCategory` troca `product_own_text_to_customer` por
`` `composed_by_${compositor}` `` e `assistant_decision_text`. Sobre a
árvore real, mesmos 7 sítios da baseline, resíduo zero, contagem
`{port_declaration: 1, adapter_implementation: 1,
composed_by_composeNotificationText: 1, assistant_decision_text: 1,
text_in_transit_named_origin: 2, person_typed_text: 1}`. Um teste liga o
único sítio `composed_by_*` da árvore ao conjunto verificado: todo texto
de `NOTIFICATION_MESSAGE_TEXTS` está em `VERIFIED_CLIENT_TEXTS`.
`assistant_decision_text` continua fora desse conjunto, por D-050.

**A cadeia de trânsito é seguida do sítio até o chamador, dentro de
`apps/ai-orchestrator/src`.** `discoverSendTextTransitChains` resolve a
função que contém cada sítio `text_in_transit_named_origin` e procura toda
chamada real dela na árvore lida. Sobre a árvore real: **2** cadeias, cada
uma com exatamente **1** chamador — `ActivationTestReplySender.ts:120` →
`sendAiReply` → `ActivationTestAiDriver.ts:228` (`deliverReply`, origem
`reply`); `PlatformWhatsAppSender.ts:98` → `sendToTenantUnderTest` →
`ActivationTestService.ts:852` (`sendAsClient`, origem `text`). Toda
ocorrência que não é chamada real sai nomeada em `excludedOccurrences`
(assinatura da porta, implementação, anotação de tipo), nunca resíduo. A
suíte de isolamento de credencial chama `sendAiReply` de verdade, mas fica
fora por estar fora da raiz de leitura — provado por teste que a mesma
fonte, classificada como se estivesse dentro da raiz, viraria resíduo.

**O que separa declaração de chamada é a forma, não a presença de um
ponto.** O reconhecimento de `sendText` e das funções de trânsito passou a
exigir duas condições juntas: antes do nome, nada além de modificadores
conhecidos (`async`, `public`, `readonly`, …) até o limite de statement mais
próximo; depois do `)` correspondente, `:` (anotação de tipo de retorno) ou
`{` (corpo). Uma **chamada de identificador solto** — `sendText({ ... });`
ou `sendAiReply({ ... });` sem receptor, no início do statement — satisfaz a
primeira condição e falha a segunda, e por isso é classificada como sítio e
como chamador. Com o critério anterior (`.` antes do nome, ou só
modificadores antes dele) ela saía como `port_declaration` ou como
`port_declaration_or_implementation`: um emissor real registrado como
assinatura inofensiva, sem resíduo e sem alarme. Nenhum sítio, chamador ou
exclusão da árvore real mudou de categoria com isso.

**Método de porta em forma genérica é resíduo, não descoberta silenciosa.**
`parseWhatsAppProviderMethods` não reconhece `sendTemplate<T>(input:
SendTemplateInput<T>): Promise<void>` — a forma `nome<T>(` cai fora de
`nome(` e de `nome: (` — e derruba a leitura nomeando arquivo e linha. É o
comportamento fechado: o método genérico carregaria `text: string` e
emitiria texto pelo canal, e o que a leitura não sabe classificar nunca sai
como não-portador. O mesmo método sem parâmetros de tipo é classificado
normalmente como portador — o que derruba é a forma genérica, não a
existência de um terceiro método.

**O que este diff não decide.** A cadeia de trânsito para em um elo: o
chamador direto é classificado, mas se ele próprio repassa texto de um
parâmetro seu, quem o chama não é seguido — não há recursão até a origem
definitiva do texto. Derivar o conjunto de métodos da porta não decidiu
que todo canal de saída de texto passa por essa porta — um canal
diferente continuaria exigindo descobridor próprio. Nenhuma migration,
nenhuma rota, nenhum contrato público e nenhuma tela, componente, texto ou
CSS do frontend mudou neste diff; nenhum arquivo de `apps/frontend/src/`,
`apps/bff/src/` ou `apps/ai-orchestrator/src/` foi tocado.

### Resultado real da execução

Executado por esta unidade, sobre a árvore final desta rodada — depois dos
cinco controles negativos obrigatórios (WU-05) e da reversão de cada um.
Cada número abaixo foi lido da execução citada, nesta worktree, depois da
última mudança de árvore.

- `git status --porcelain`, na raiz do repositório — seis arquivos: os dois
  de teste (`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
  e `apps/ai-orchestrator/tests/support/send-text-sites.ts`) e os quatro
  documentos de migração desta rodada (`CURRENT_STATE.md`, `DECISIONS.md`,
  `FINAL_AUDIT.md`, `VALIDATION_GATE.md`), nenhum outro. Nenhum arquivo de
  `apps/**/src/`.
- `npx vitest run tests/assistant/assistant.service.test.ts`, em
  `apps/ai-orchestrator` — **55** testes, 0 falhas: os 37 já existentes do
  Goal039, os 12 deste diff (derivação de método pela porta, categoria de
  compositor ligada ao conjunto verificado, e cadeia de trânsito seguida elo
  a elo) e os **6** controles negativos acrescentados na correção da
  rodada 3 — 5 de forma de reconhecimento e 1 de método de porta em forma
  genérica.
- `npx vitest run`, completo, em `apps/ai-orchestrator` — **80** arquivos
  de teste `passed`, **12** `skipped` (92 no total); **779** testes
  `passed`, **88** `skipped` (867 no total), 0 falhas.
- `npm run validate:core` — `validate:core PASSED`, 17 passos: **15**
  `passed`, **0** `failed`, **2** `skipped` (`test:bff`,
  `test:health-worker`, ambos declarados no próprio resumo do gate).
- `npm run test:gate` — **226** testes, `pass 226`, `fail 0`, `skipped 0`.

**Os cinco controles negativos de forma de reconhecimento, com as duas
saídas.** Cada um foi executado contra a árvore final (verde) e contra o
reconhecimento anterior, reposto em cópia temporária e revertido em
seguida (a cópia foi conferida byte a byte no retorno):

- Sítio de identificador solto (`sendText({ to, text: reply.text });` sem
  receptor). Árvore final: `text_in_transit_named_origin`, origem `reply`,
  linha 3. Reconhecimento anterior: `AssertionError: expected [ { …(3) } ]
  to deeply equal [ { …(4) } ]` — o sítio saía como `port_declaration`.
- Sítio de identificador solto com forma de `text:` não reconhecida. Árvore
  final: resíduo `<fixture-solto>:3: chamada sendText(...) com forma de
  "text:" não reconhecida`. Reconhecimento anterior: `AssertionError:
  expected [Function] to throw an error` — nenhum resíduo, silêncio.
- Declaração da porta e implementação do adapter, no mesmo formato real.
  Árvore final: `port_declaration` (linha 2) e `adapter_implementation`
  (linha 5), como antes — o critério novo não move o que já estava certo.
- Chamador de identificador solto da função de trânsito. Árvore final: 1
  chamador (`<fixture-solto>:8`, `entregarSemReceptor`,
  `text_in_transit_named_origin`, origem `reply`) e 1 exclusão
  (`<fixture-solto>:2`, `port_declaration_or_implementation`).
  Reconhecimento anterior: `AssertionError: expected [] to deeply equal [ {
  …(5) } ]` — o elo desaparecia da cadeia sem virar resíduo.
- Chamador de identificador solto compondo na hora com compositor não
  verificado. Árvore final: resíduo `<fixture-solto>:3: chamador de
  sendAiReply(...) sem categoria — compõe o texto na hora com
  "compoeTextoNovo"`. Reconhecimento anterior: `AssertionError: expected
  [Function] to throw an error`.

**O controle de método de porta em forma genérica, com as duas saídas.**
Árvore final: `<fixture-generico>:3: membro "sendTemplate<T>(input:
SendTemplateInput<T>): Promise<void>" declarado com forma não reconhecida
na porta WhatsAppProvider`, e o mesmo método sem parâmetros de tipo sai
classificado como portador ao lado de `sendText`. Contra uma leitura que
pulasse o membro não reconhecido em vez de derrubá-la (`continue` no lugar
do `throw`, reposto e revertido): `AssertionError: expected [Function] to
throw an error` — o método genérico sumiria da vigilância em silêncio.

Não reexecutados por esta unidade, e por isso sem número reproduzido
aqui: `node scripts/final-production-audit.mjs`, `validate:integration`,
`test:bff` e `test:frontend` fora do que `validate:core` já roda. Nenhum
arquivo de produção é tocado por este diff — confirmado por
`git status --porcelain`.

### Achados novos a partir de A-24

Nenhum. `apps/frontend/src/`, `apps/bff/src/` e `apps/ai-orchestrator/src/`
não foram tocados neste diff — confirmado por `git status --porcelain` —,
então nenhum resíduo apareceu em código de produção para virar achado. O
que este diff fecha é lacuna de **precisão de guard de teste** (token
literal em vez de derivado, categoria não ligada ao conjunto verificado,
cadeia não seguida até o chamador), não de produto.

### Veredito recontado

A contagem desta auditoria **não muda**: nenhum achado de A-04 a A-08, A-11
a A-17 ou A-19 foi tocado, corrigido ou reclassificado, e nenhum achado
fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) foi reaberto. Esta
auditoria continua com **0 achados `BLOQUEADOR-MVP`, 7
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — os mesmos números que
§16 já deixava, porque o que este diff amplia é precisão de guard de
teste, e isso nunca tinha entrado nessa contagem como achado nem como
limite declarado à parte.

Três coisas que este recontar não diz. **Não diz que M4 foi fechado**:
nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o
WhatsApp real — o diff040 toca só
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` e
`apps/ai-orchestrator/tests/support/send-text-sites.ts`, mais a
documentação de migração — nada além disso. **Não diz que a fidelidade
visual está provada**: nenhum arquivo de `apps/frontend/src/` mudou,
nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou
teve tolerância aumentada, e a matriz de larguras continua com as cinco.
**E não diz que a verificação de resposta roda em produção**: nenhum
arquivo de `apps/bff/` foi tocado e `RESPONSE_CONTRACT_CHECK_ENABLED`
continua `env.NODE_ENV !== "production"`, inalterado por este diff.

## 18. Egresso HTTP computado, egresso genérico fail-closed e cadeia de trânsito até raiz classificada — Goal041, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff041 (WU-01
a WU-06 da rodada 1, mais a correção dos blockers da rodada 2, com os
cinco controles negativos obrigatórios executados e revertidos). Ela
**não reescreve** §4 a §17: os registros de A-01 a A-19 em §6, o veredito
de §7 e as onze seções de fechamento anteriores continuam exatamente como
estavam. O review040 tinha declarado dois pontos fora: a porta
`WhatsAppProvider` continuava sendo premissa de canal único, e a cadeia
de trânsito parava em um elo. Este Goal fecha os dois, mais os dois
resíduos declarados do mesmo review.

### O que mudou

**O egresso HTTP das duas árvores é computado, não presumido pela
porta.** `discoverHttpEgressSites`
(`apps/ai-orchestrator/tests/support/http-egress-sites.ts`, módulo novo)
lê `apps/ai-orchestrator/src` e `apps/bff/src` inteiros e classifica todo
`fetch(` pelo que o código usa para resolver a URL — nunca por nome de
arquivo, de pasta ou de função, e sem pular arquivo nenhum. Sobre a
árvore real: **9** sítios, resíduo **zero**, **1** só na categoria
`product_prose_to_client_number` (`EvolutionProvider.ts:73`); os outros
oito em `generic_egress_destination_decided_by_caller_fetchJson`
(`lib/http.ts:32`),
`env_vars_EVOLUTION_BASE_URL_and_EVOLUTION_DOWNLOAD_MEDIA_PATH`
(`EvolutionProvider.ts:172`), `env_var_OPENAI_BASE_URL`
(`openai-transcription-provider.ts:58`),
`env_var_SCHEDULING_SERVICE_BASE_URL`
(`scheduling-service/client.ts:793`), `constructor_base_url_requestBinary`
(`bff/src/clients/internal-http-client.ts:83`),
`constructor_base_url_perform` (`:149`),
`env_var_PASSWORD_RESET_DELIVERY_URL`
(`bff/src/clients/password-reset-delivery.ts:20`) e
`caller_resolved_base_url_via_checkHealth`
(`bff/src/routes/health.ts:46`). Ver
[VALIDATION_GATE](VALIDATION_GATE.md#egresso-http-computado-egresso-genérico-fail-closed-e-cadeia-de-trânsito-até-raiz-classificada-do-goal041).

**O egresso genérico é fail-closed pelos chamadores.** O primitivo
genérico é reconhecido pela forma — a URL do `fetch` é parâmetro da
função que o contém e nenhum chamador do próprio arquivo a resolve — e o
nome (`fetchJson`) é computado da declaração, não escrito à mão nem
inferido do caminho do arquivo. `genericEgressCallers` é computado a cada
execução, nunca afirmado em comentário: sobre a árvore real, **zero**
chamadores. Um chamador cujo destino não resolve deriva a leitura
inteira, nomeando arquivo e linha — provado por teste com árvore
sintética cujo primitivo se chama `requestJson` e mora em `net/send.ts`,
o que prova que nem o nome do arquivo nem o nome da função participam da
classificação. Chamador que apenas repassa a URL recebida vira primitivo
genérico ele próprio, e a varredura segue até ponto fixo com conjunto de
nomes visitados — repasse em cadeia não escapa da regra, e ciclo de nomes
não trava a varredura.

**A contagem de sítios é a da árvore, não a da lista do Goal.** O Goal041
enumerou oito sítios de `fetch(` nas duas raízes; a árvore tem nove. A
lista do Goal omitiu `EvolutionProvider.ts:172` (download de mídia) e
contava `lib/http.ts:32` como sítio a não classificar. Divergência
declarada, resolvida a favor do número computado: pular um arquivo pelo
nome era exatamente a allowlist que este delta remove.

**A cadeia de trânsito é seguida transitivamente até raiz classificada.**
`discoverSendTextTransitChains` deixa de parar no primeiro chamador: o
percurso segue enquanto o texto estiver em trânsito
(`text_in_transit_named_origin`) e termina em raiz de
`SendTextChainRootKind` (`http_route`, `worker_or_job`,
`activation_test_entry`, `text_composed_at_link`,
`assistant_decision_text`, `person_typed_text`, `literal_text_at_link`,
ou `cycle` quando o percurso revisitaria um elo já visitado — o ciclo é
reportado em `chain.cycles`, nunca percorrido duas vezes). Sobre a árvore
real: as **2** cadeias do Goal040 terminam com resíduo zero, cada uma com
exatamente um segundo elo — os **5** chamadores de segundo elo do
review040, todos com raiz nomeada:
`ActivationTestAiDriver.ts:203` (`deliverReply`, categoria
`assistant_decision_text`, raiz `assistant_decision_text`);
`ActivationTestService.ts:604`, `:608`, `:653` e `:679` (`performStep` para
`sendAsClient`, categoria `literal_text_at_link`, raiz
`literal_text_at_link`, com o literal de `ACTIVATION_TEST_NOTICE` ou de
uma das falas de cliente simulado nomeado em cada caso).

**Os dois resíduos declarados do review040 fecham.** A forma
propriedade-arrow de membro de porta
(`sendText: (input: SendTextInput) => Promise<SendTextResult>`) ganhou
teste permanente. A mensagem de resíduo de `classifySendTextSites` nomeia
o portador descoberto — `carrierName`, lido do próprio casamento do
padrão de busca — em vez de escrever `sendText` fixo, provado por teste
com porta sintética que declara um portador de outro nome.

**O que este diff não decide.** `apps/evolution-go/` fica declaradamente
fora do descobridor: o serviço Go recebe o corpo que `EvolutionProvider`
monta, mas nada aqui prova que ele não compõe texto próprio antes de
repassar ao WhatsApp real — limite declarado, não achado, porque nenhuma
violação real foi observada. A cadeia de trânsito continua lida só dentro
de `apps/ai-orchestrator/src`. Texto emitido pelo modelo
(`assistant_decision_text`) continua fora do conjunto verificado por
execução, por D-050. Nenhuma migration, nenhuma rota, nenhum contrato
público e nenhuma tela, componente, texto ou CSS do frontend mudou neste
diff; nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou
`apps/ai-orchestrator/src/` foi tocado.

### Resultado real da execução

Executado na rodada 2, sobre a árvore final — depois dos controles
negativos e da reversão de cada um. Cada número abaixo foi lido da
execução citada, nesta worktree, depois da última mudança de árvore.

- `git status --porcelain`, na raiz do repositório — dois arquivos de
  teste modificados
  (`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
  `apps/ai-orchestrator/tests/support/send-text-sites.ts`) e um arquivo
  novo não rastreado (`apps/ai-orchestrator/tests/support/http-egress-sites.ts`),
  mais os quatro documentos de migração desta rodada. Nenhum arquivo de
  `apps/**/src/`, nesta árvore final. Dois arquivos de `tools/ia-loop/`
  seguem modificados — `tools/ia-loop/lib/deterministic-executor.mjs` e
  `tools/ia-loop/tests/deterministic-executor.test.mjs` —, como **desvio
  declarado ao §5 do Goal041, dispensado no review041** pelo Tech Lead
  (D-018, precedente [D-048](DECISIONS.md#d-048--fronteira-do-openai-configurável-por-ambiente-e-prova-de-composição-da-resposta-automática-sem-substituto-interno-propostas-no-goal032) do review033): o gate
  `targeted-tests` (WU-09) reprovava com `No test files found, exiting
  with code 1` porque `unit.pattern` chegava raiz-relativo e, sob
  `ACTION_CWD.SCOPE`, o vitest resolvia o prefixo do escopo uma segunda
  vez. `scopeRelativePattern` (`deterministic-executor.mjs:56`, usada em
  `runDeterministicAction:84`) tira esse prefixo antes do argv. A
  reversão foi tentada nas rodadas 2, 3 e 4 e nas três vezes o próprio
  harness a desfez para o gate voltar a passar — é mudança de harness,
  sem efeito em produto nem em gate de produto, coberta por
  `node --test tools/ia-loop/tests/deterministic-executor.test.mjs`
  (12 casos, 12 pass, casos 11 e 12 novos).
- `npx vitest run tests/assistant/assistant.service.test.ts`, em
  `apps/ai-orchestrator` — **66** testes, 0 falhas: os 55 já existentes
  do Goal040 e **11** novos deste diff (2 dos resíduos do review040, 9 da
  enumeração de egresso HTTP, do fail-closed do egresso genérico e da
  cadeia de trânsito estendida).
- `npx vitest run`, completo, em `apps/ai-orchestrator` — **80** arquivos
  de teste `passed`, **12** `skipped` (92 no total); **790** testes
  `passed`, **88** `skipped` (878 no total), 0 falhas. A baseline
  `9709b1ac`, medida na mesma worktree com a árvore de teste restaurada,
  dá **779** `passed` e 88 `skipped`.
- `npm run validate:core` — `validate:core PASSED`, 17 passos: **15**
  `passed`, **0** `failed`, **2** `skipped` (`test:bff`,
  `test:health-worker`, ambos declarados no próprio resumo do gate).
  `audit:static` dentro dele: **34** checks, 33 `passed`, 1 `skipped`
  (`production_health`, declarado).
- `npm run test:gate` — **226** testes, `pass 226`, `fail 0`, `skipped 0`
  — inalterado em relação ao Goal040, porque nenhum script de gate foi
  tocado por este diff.
- `npm run validate:integration` — **`exit 2`**, com
  `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`.
  **Nenhum dos 35 passos rodou.** A pré-condição de banco descartável não
  existe neste ambiente de execução: não há `.env` na worktree, o daemon
  do Docker não responde (`failed to connect to the docker API at
  npipe:////./pipe/dockerDesktopLinuxEngine`) e o Postgres que escuta em
  `127.0.0.1:5432` não é um cluster descartável declarado. Isto fica
  registrado como **pré-condição ausente**, nunca como verde: a
  persistência continua sem validação nesta rodada, e nenhum número de
  `validate:integration` é herdado de rodada anterior.

**Os controles negativos, com as duas saídas onde o Goal as exige.** Os
controles 1 a 3 foram executados na rodada 2 contra as **duas** árvores:
a baseline aceita `9709b1ac` (restaurada na própria worktree, com `git
checkout` dos dois arquivos de teste rastreados e remoção temporária do
módulo novo — **55** testes em `assistant.service.test.ts` e **779**
`passed` na suíte completa, conferindo com a baseline declarada pelo
Goal041) e a árvore final desta rodada.

- **Controle 1 — egresso novo de prosa ao número da cliente fora do
  adapter** (`apps/ai-orchestrator/src/modules/channel/rogue-egress.ts`,
  um `fetch` para a base e o path de envio de texto do Evolution, com
  `JSON.stringify` de um corpo que pareia `number: input.to` com
  `text: input.text`). Baseline: **779 passed, 0 failed** — a cegueira
  era real. Árvore final: **2 failed**, com o sítio nomeado —
  `ai-orchestrator/src/modules/channel/rogue-egress.ts` linha `10`,
  categoria `product_prose_to_client_number` — e a afirmação de egresso
  único quebrada (`expected 9 ... but got 10`, com o diff da enumeração
  nomeando arquivo, linha e categoria).
- **Controle 2 — chamador novo do egresso genérico sem categoria**
  (`rogue-generic-caller.ts`, `fetchJson(destinoDecididoNaHora, {})` com
  a URL vinda de uma função local). Baseline: **779 passed, 0 failed**.
  Árvore final: **4 failed**, todas com o mesmo erro nomeando arquivo e
  linha — `.../rogue-generic-caller.ts:10: sítio de egresso HTTP sem
  categoria — a URL "destinoDecididoNaHora" não resolve a env.<NOME>, a
  this.<campo> nem a parâmetro resolvível nos chamadores.`
- **Controle 3 — elo de segundo nível compondo prosa própria**
  (`ActivationTestService.sendRogueStep`, texto vindo de
  `composeRogueWait`, compositor ausente de `VERIFIED_CLIENT_TEXTS`,
  inserido no fim da classe para não deslocar nenhum sítio já
  enumerado). Baseline: **779 passed, 0 failed** — a cadeia parava em um
  elo e não via o sexto chamador. Árvore final: **5 failed**, com o
  resíduo nomeado — `.../ActivationTestService.ts:937: chamador de
  sendAsClient(...) sem categoria — compõe o texto na hora com
  "composeRogueWait", que não está entre os compositores cujo texto
  produzido está em VERIFIED_CLIENT_TEXTS`.
- **Controles 4 (ciclo na cadeia) e 5 (o que já mordia continua
  mordendo)** foram executados na rodada 1, pela WU-05, com a saída real
  no relatório daquela unidade; o Goal exige as duas saídas apenas para
  os controles 1 a 3. A rodada 2 não os reexecutou, e por isso não
  reproduz número próprio deles aqui.

Toda mutação dos controles foi revertida: a árvore final acima é a árvore
depois da reversão, e `git status --porcelain` não lista nenhum arquivo
de `apps/**/src/`.

Não reexecutados nesta rodada, e por isso sem número reproduzido aqui:
`node scripts/final-production-audit.mjs` fora do que `validate:core` já
roda, `validate:ui` e o gate renderizado, e a saída literal dos controles
4 e 5.

### Achados novos a partir de A-24

Nenhum. `apps/frontend/src/`, `apps/bff/src/` e `apps/ai-orchestrator/src/`
não foram tocados neste diff — confirmado por `git status --porcelain` —,
então nenhum resíduo apareceu em código de produção para virar achado. O
que este diff fecha é lacuna de **precisão de guard de teste** (egresso
HTTP presumido pela porta, cadeia parando em um elo, mensagem de resíduo
com token fixo), não de produto.

### Veredito recontado

A contagem desta auditoria **não muda**: nenhum achado de A-04 a A-08,
A-11 a A-17 ou A-19 foi tocado, corrigido ou reclassificado, e nenhum
achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) foi reaberto.
Esta auditoria continua com **0 achados `BLOQUEADOR-MVP`, 7
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — os mesmos números que
§17 já deixava, porque o que este diff amplia é precisão de guard de
teste, e isso nunca tinha entrado nessa contagem como achado nem como
limite declarado à parte. `apps/evolution-go/` fica declaradamente fora
do descobridor de egresso — limite declarado, não achado novo, porque
nenhuma violação real foi observada.

Quatro coisas que este recontar não diz. **Não diz que M4 foi fechado**:
nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o
WhatsApp real — o diff041 toca só os três arquivos de teste nomeados
acima, os dois arquivos de `tools/ia-loop/` do desvio declarado acima
(harness, não produto) e a documentação de migração — nada além disso. **Não diz que
a fidelidade visual está provada**: nenhum arquivo de `apps/frontend/src/`
mudou, nenhum teste do gate renderizado foi pulado, marcado `fixme`,
removido ou teve tolerância aumentada, e a matriz de larguras continua
com as cinco. **Não diz que o serviço Go foi provado sem texto
próprio**: `apps/evolution-go/` está declaradamente fora do alcance do
descobridor de egresso, e nenhuma chamada nem teste deste diff toca esse
serviço. **E não diz que a persistência foi validada nesta rodada**:
`validate:integration` recusou por pré-condição de banco ausente, como
registrado acima.


## 19. O elo de transporte é provado, e o primeiro achado do lado de lá da fronteira — Goal042, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff042 (a
correção dos nove blockers da rodada 2, com os cinco controles negativos
obrigatórios executados e revertidos). Ela **não reescreve** §4 a §18: os
registros de A-01 a A-23 em §6, o veredito de §7 e as doze seções de
fechamento anteriores continuam exatamente como estavam. O aceite do
Goal041 tinha declarado, em D-057 item 5, que `apps/evolution-go/`
continuava fora do alcance de qualquer descobridor. Este Goal fecha esse
limite — e, ao fechá-lo, encontra o primeiro achado do lado de lá.

### O que mudou

**O serviço de transporte passou a ser lido por guard.** O pacote novo
`apps/evolution-go/pkg/transportguard/` (16 arquivos: 10 fontes e 6 de
teste, biblioteca padrão apenas, nenhuma dependência nova, `go.mod` e
`go.sum` intocados, não importado por `cmd/evolution-go`) lê
`apps/evolution-go/pkg` e `cmd` inteiros por AST — **53** arquivos `.go`
de produção — e enumera **82** sítios de escrita em campo portador e
**19** chamadas de transporte, com resíduo **zero**. Nenhum arquivo Go de
produção mudou, e nenhum `src/` dos três apps mudou.

**O campo portador é derivado das declarações de proto.**
`DeriveCarrierFields` devolve **325** campos `*string` de struct de
mensagem, lidos de
`whatsmeow-lib/proto/waE2E/WAWebProtobufsE2E.pb.go`. Nenhum nome de campo
está digitado no guard, e nenhuma regra decide por nome de arquivo,
pasta, função, rota ou receptor — o próprio guard tem teste que lê as
suas fontes e reprova se um desses nomes aparecer.

**O conjunto de origens fora do relé é asserido elemento a elemento:**
**88** escritas, das quais exatamente **uma** é configuração de instância
(`pkg/whatsmeow/service/whatsmeow.go:1806`, `ExtendedTextMessage.Text`, o
texto de auto-rejeite de chamada), o membro que o Goal nomeia.

**A fronteira é atravessada por valor, nos dois lados.** No Go, as **94**
rotas registradas têm o caminho completo computado por AST, e o valor de
`EVOLUTION_SEND_TEXT_PATH` lido de `apps/ai-orchestrator/.env.example`
(`/send/text`) é rota registrada (`pkg/routes/routes.go:141`, prefixo em
`:136`) cujo encadeamento — registro, handler
(`pkg/sendMessage/handler/send_handler.go:45`), serviço — termina em
`pkg/sendMessage/service/send_service.go:611` com origem relé. No
TypeScript, o default de `src/config/env.ts:83` é computado pela forma da
declaração e comparado ao `.env.example:21`; divergência reprova, chave
ausente reprova em vez de pular. Ver
[VALIDATION_GATE](VALIDATION_GATE.md#o-elo-de-transporte-é-provado-texto-que-sai-do-serviço-go-e-origem-fora-do-relé-do-goal042).

### Achados novos a partir de A-24

O Goal042 afirmava, na sua lista de fatos de baseline, que não havia
violação real: que os únicos literais em campo portador eram **21**
`proto.String("")` de `QuotedMessage`, e que o resultado esperado era
achado zero. A enumeração por AST discorda, e pela regra do próprio Goal
o número do AST é o que vale. A divergência é **declarada, não
corrigida** — nenhum arquivo Go de produção deste fork pode ser editado
aqui.

| ID | Achado | Classificação | Origem |
| --- | --- | --- | --- |
| A-24 | `pkg/sendMessage/service/send_service.go:1960` substitui o texto de botão por `"Ver Menu"` quando o chamador manda `ButtonText` vazio, e esse rótulo em português é entregue ao número da cliente. É prosa de produto composta dentro do fork de transporte, que o `AGENTS.md` de `apps/evolution-go/` proíbe — e que, até este Goal, nada verificava | `PENDENCIA-POS-MVP` | enumeração de `transportguard` sobre a árvore de produção Go, Goal042 |

**Por que não é `BLOQUEADOR-MVP`.** Pela regra escrita em §6, um
`BLOQUEADOR-MVP` exige reprodução executável do defeito, e não há: a rota
que alcança esse literal é `POST /send/list`, e **nenhum** arquivo de
`apps/ai-orchestrator/src` ou de `apps/bff/src` a chama — a única rota do
transporte que o produto usa hoje é `/send/text`, pelo valor de
`EVOLUTION_SEND_TEXT_PATH`. Nenhuma cliente recebe `"Ver Menu"` hoje.
Rebaixado a `PENDENCIA-POS-MVP` com o motivo escrito, como manda a
primeira regra de §6.

**Impacto de produto, em uma frase:** se o produto passar a usar
`/send/list`, uma cliente pode receber um rótulo escrito no fork de
transporte, fora de `PRODUCT_OWN_TEXTS` e fora de qualquer revisão de
copy.

Os outros **26** literais não vazios que o AST enumera não são achado:
são discriminadores de protocolo (`quick_reply`, `cta_copy`, `cta_url`,
`cta_call`, `payment_info`), MIME types (`image/jpeg`, `video/mp4`,
`audio/ogg; codecs=opus`), os envelopes JSON dos payloads de botão, e
marcas de formatação (`*`, quebra de linha, o espaço que substitui título
vazio). Nenhum deles diz nada a uma pessoa. Estão todos asseridos
elemento a elemento em `go_prose_test.go`, com arquivo e linha, de modo
que um literal novo — de qualquer natureza — reprova a suíte e volta a
esta mesa.

### Veredito recontado

Esta auditoria passa a ter **0 achados `BLOQUEADOR-MVP`, 8
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`**. A mudança em relação a
§18 é **uma**: A-24, novo, `PENDENCIA-POS-MVP`. Nenhum achado de A-04 a
A-08, A-11 a A-17 ou A-19 foi tocado, corrigido ou reclassificado, e
nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) foi
reaberto.

O limite que §18 registrava — "`apps/evolution-go/` fica declaradamente
fora do descobridor de egresso" — deixa de valer nesses termos: a árvore
de produção Go passa a ser lida. O que continua fora está escrito abaixo,
e não é a mesma coisa.

Cinco coisas que este recontar não diz. **Não diz que o comportamento em
runtime do serviço Go foi provado**: nada aqui executa esse serviço, abre
conexão whatsmeow ou observa o que chega a um telefone; o que se prova é
o que a árvore de código diz, lida por AST. **Não diz que o binário em
produção é o desta árvore**: nada liga este código ao artefato
implantado. **Não diz que `whatsmeow-lib/` foi verificada**: é biblioteca
vendorizada, fora do alcance do guard por construção, lida apenas como
fonte das declarações de proto. **Não diz que M4 foi fechado**: nenhuma
chamada saiu para provedor de LLM real nem para o WhatsApp real, nenhuma
conexão whatsmeow foi aberta, e nenhuma requisição de rede foi
acrescentada a suíte nenhuma — o diff042 toca dois arquivos de teste de
`apps/ai-orchestrator/tests/`, acrescenta o pacote
`apps/evolution-go/pkg/transportguard/` e atualiza a documentação de
migração, nada além disso. **Não diz que a fidelidade visual está
provada**: nenhum arquivo de `apps/frontend/src/` mudou, nenhum teste do
gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância
aumentada, `retries: 1` continua inalterado nos dois
`playwright.*.config.ts`, e a matriz continua com as cinco larguras.

**E não diz que a persistência foi validada nesta rodada:**
`validate:integration` recusou com `exit 2` e
`validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`; nenhum
dos **35** passos chegou a rodar, e a lista de 35 continua intacta.

## 20. O motivo do rebaixamento de A-24 passa de prosa a invariante computada — Goal043, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff043 (o
arquivo de valores de rotas, os dois lados do casamento de rota, o
alcance de literal por rota, e os cinco controles negativos deste
critério). Ela **não reescreve** §4 a §19: os registros de A-01 a A-24
em §6/§19, o veredito de §7 e as treze seções de fechamento anteriores
continuam exatamente como estavam, e a entrada de **A-24** na tabela de
§19 **não foi tocada**. Este Goal não corrige A-24 — computa a condição
que o `Revisar se` de [D-058](DECISIONS.md) tinha deixado em prosa.

### O que mudou

**A razão do rebaixamento de A-24 era uma leitura manual do código.** O
§19 registra: "a rota que alcança esse literal é `POST /send/list`, e
**nenhum** arquivo de `apps/ai-orchestrator/src` ou de `apps/bff/src` a
chama". Essa frase era verdadeira sobre a árvore do Goal042, mas nada a
recomputava — era prosa em documento, do mesmo tipo que [D-058 item
6](DECISIONS.md) já tinha usado para rebaixar o achado. Nenhum guard
verificava se ela continuava valendo depois de uma mudança de árvore.

**A mesma afirmação é agora o resultado de um teste.** O diff043
enumera, por forma (nunca por nome de arquivo, pasta ou classe), as
**10** rotas do serviço Go que os dois lados do produto — `ai-
orchestrator/src` e `bff/src` — de fato alcançam, casa essas 10 contra as
**94** rotas que este serviço registra, e computa, por AST, o literal
que cada uma das 94 rotas alcança. O cruzamento dos dois lados
(`TestNoRouteThatReachesTheProductProseLiteralIsReachedByTheProduct`)
prova, sobre a árvore real, que a única rota que alcança o literal de
A-24 — `POST /send/list` — não está no conjunto de 10 que o produto
chama. É o mesmo fato que o §19 já registrava, mas lido do código a cada
execução, não escrito uma vez e deixado no documento.

**A condição que transformaria A-24 em defeito observável passa a ser
vigiada, não apenas nomeada.** O conjunto de literais alcançáveis a
partir das 10 rotas do produto é asserido como vazio
(`expectedProseLiteralsReachedFromProductRoutes = []` em
`route_reach_test.go`). Se o produto passasse a chamar `POST
/send/list` — ou qualquer rota nova que alcance um literal —, esse
conjunto deixaria de ser vazio e o teste reprovaria, nomeando o arquivo,
a linha, o conteúdo do literal e a rota que o entrega. A mesma vigilância
cobre uma rota do produto movida, renomeada ou reescrita por outro
cliente HTTP: os controles negativos 2 a 4 deste critério provam que
casamento e alcance continuam corretos depois da forma mudar, e o
controle 3 prova especificamente que um literal novo alcançável a partir
de uma rota do produto reprova.

**O conjunto de 27 literais que o Goal042 tinha asserido não mudou.** A
reach por AST encontra os mesmos 27 literais, nas mesmas 5 rotas
(`POST /send/media`, `POST /send/button`, `POST /send/list`, `POST
/send/carousel`, `POST /send/status/media`), com resíduo zero nos dois
sentidos entre o conjunto que a reach encontra e o conjunto que o
Goal042 já tinha asserido. Nenhum literal novo apareceu, nenhum
desapareceu.

### Veredito recontado

Esta auditoria continua com **0 achados `BLOQUEADOR-MVP`, 8
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — a mesma contagem de
§19. **Nenhuma mudança em relação a §19**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal, e a proibição do §5 do Goal042
sobre editar o fork continua valendo.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`, entregue a quem chamar
`POST /send/list` com `ButtonText` vazio. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real, nenhuma conexão whatsmeow foi aberta, e o diff043 toca
dois arquivos TypeScript de teste e de apoio a teste, um arquivo de
valores, e cinco arquivos do pacote Go de teste `transportguard` (três de
teste e dois de biblioteca do próprio pacote), mais a documentação de
migração — nada além disso.
**Não diz que o comportamento em runtime do serviço Go foi provado**:
o que se prova é o que a árvore de código diz, lida por AST; nada aqui
executa esse serviço, abre conexão whatsmeow ou observa o que chega a um
telefone, e nada liga este código ao binário implantado em produção.
**Não diz que a fidelidade visual está provada**: nenhum arquivo de
`apps/frontend/src/` mudou, e a matriz de larguras e as retentativas do
gate renderizado continuam como estavam.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; e o valor real de qualquer variável de ambiente — só o default do
schema TypeScript e o `.env.example` são lidos, nunca um ambiente
implantado. `validate:integration` continua recusando por pré-condição
de banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), e a
lista de 35 passos de persistência continua intacta.
Pré-condição de banco ausente, declarada como ausente.

## 21. As duas bordas do review043 são fechadas, computando a ligação entre arquivos e a superfície do cliente — Goal044, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff044 (o
chamador seguido por ligação importada atravessando arquivo, a superfície
do cliente HTTP interno derivada por alcançabilidade, as sete afirmações
permanentes que consomem os dois mecanismos, e os quatro controles
negativos deste critério). Ela **não reescreve** §4 a §20: os registros de
A-01 a A-24 em §19, o veredito de §19/§20 e as vinte seções de fechamento
anteriores continuam exatamente como estavam, e a entrada de **A-24**
**não foi tocada**. Este Goal não corrige A-24 e não abre achado novo —
fecha as duas bordas não bloqueantes que o [review043](reviews/043-review.md)
tinha registrado sobre a completude do conjunto de 10 rotas.

### O que mudou

**A primeira borda — chamador só no mesmo arquivo — é fechada por
`findCrossFileCallerBindings`.** O Goal043 seguia, de um sítio
`caller_resolved_base_url_via_*`, só os chamadores reais do próprio
arquivo; um helper exportado com chamador em outro arquivo caía em
`notGoBound` com um motivo que não mencionava a existência desse segundo
arquivo. O diff044 resolve especificador de import relativo a caminho de
arquivo e o alias local ao nome exportado, e varre os chamadores reais do
arquivo do sítio mais os de todo arquivo ligado dessa forma nas duas
árvores. Forma que a resolução não converte em arquivo conhecido —
reexportação, import dinâmico, especificador não relativo, referência
reexportada adiante — derruba a leitura nomeando arquivo e linha, em vez
de ser tratada como ausência de chamador.

**A segunda borda — superfície do cliente por três nomes fixos — é
fechada por `computeInternalClientMemberSurface`.** O Goal043 reconhecia
`this.<campo>.request(...)`, `.requestWithStatus(...)` e
`.requestBinary(...)` como toda a superfície chamável do cliente HTTP
interno; um método público novo que delegasse a um membro `private` com
`fetch` não teria sítio algum reconhecido. O diff044 computa, da própria
declaração da classe, todo membro de topo que alcança `fetch` — direto ou
por delegação transitiva via `this.<membro>(...)` a outro membro — e
exclui da superfície o que é `private`/`protected`, com o motivo escrito.
Um ciclo de delegação derruba a leitura em vez de entrar em laço.

**As duas bordas foram provadas abertas antes de fechar.** Os quatro
controles negativos deste critério rodam, cada um sobre árvore sintética
em diretório temporário: controle 1 prova, com par antes/depois, que a
chamada por outro arquivo — ligada por `import { reachUpstream as
probeHealth }`, sem que o nome da declaração apareça no chamador — não era
reconhecida antes de `findCrossFileCallerBindings` e passa a ser depois,
com o motivo da rota nomeando o alias local e a declaração de origem;
controle 2 prova, com o mesmo par, que um método público **sem `fetch`
próprio** só vira rota quando passa a delegar ao membro `private` que tem
o `fetch` — antes da delegação, a chamada a ele é contada fora com o
motivo derivado da declaração; depois, a mesma chamada entra no conjunto —,
e prova ainda o caso-limite em que o membro público não existe na classe,
em que a leitura derruba com `arquivo:linha`; controle 3
prova que reexportação e import dinâmico derrubam a leitura em vez de
afirmar, sobre um chamador não lido, que ele não passa chave de base;
controle 4 prova que mover e renomear helper, classe, arquivos e pastas
das duas mecânicas não muda a classificação computada. Nenhum dos quatro
toca a árvore real.

**Nenhum mecanismo se desliga em silêncio por não reconhecer a forma.** As
ligações de exportação de um helper são computadas das construções
`export` do arquivo — declaração exportada, `export const/let/var`, lista
`export { nome }`, lista com alias (com o import resolvido pelo nome
exportado) e `export default nome;` —, e menção em forma que a resolução
não converte em ligação importável derruba a leitura com `arquivo:linha`.
Quando o mesmo nome sai do módulo por **duas** construções, as duas viram
ligação e as duas são varridas: reconhecer a primeira não silencia as
seguintes, e a segunda em forma não convertível derruba do mesmo jeito. A
varredura de chamadores do egresso genérico segue a mesma resolução de
ligação: cada arquivo é lido pelo nome da declaração e pelo nome local de
cada import com alias que liga a função, e o motivo escrito do sítio
genérico conta os chamadores **daquele** primitivo — antes, o nome solto
deixava invisível o chamador que importava sob outro nome, e o motivo
afirmava zero chamador onde existia um.
O nome de um membro de classe é derivado da declaração, inclusive na forma
de propriedade-arrow (`nome = async (…) => {}`), e validado: forma sem nome
derivável derruba. Toda chamada `this.<campo>.<membro>(` sobre um cliente
apontado ao serviço Go é classificada em rota, contagem fora com motivo, ou
recusa quando o membro não está na declaração da classe. E a enumeração
exigida sai do descobridor — a superfície por classe com os membros de
fora e o motivo de cada um, as chamadas a membro fora da superfície, e o
que a resolução de chamadores leu por sítio —, conferida por afirmação
permanente sobre a árvore real.

**Sete afirmações permanentes (WU-03) consomem os dois mecanismos sobre
a árvore real**, ao lado das que o Goal043 já deixava — nenhuma delas foi
relaxada, pulada ou removida. Entre elas, a prova de que todo motivo
devolvido em `notGoBound` para um sítio `caller_resolved_base_url_via_*`
relata quantos chamadores foram lidos e em quantos arquivos, nunca
afirmando algo sobre um chamador que a leitura não alcançou.

### Veredito recontado

Esta auditoria continua com **0 achados `BLOQUEADOR-MVP`, 8
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — a mesma contagem de
§20. **Nenhuma mudança em relação a §20**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`, e a condição do
`Revisar se` de D-058/D-059 não é revisitada aqui. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real, nenhuma conexão whatsmeow foi aberta, e o diff044 toca dois
arquivos TypeScript de teste e de apoio a teste — nenhum arquivo Go, nenhum
arquivo de `apps/frontend/src/`, `apps/bff/src/` (fora do arquivo de apoio
a teste) ou `apps/ai-orchestrator/src/` —, mais a documentação de migração.
**Não diz que o comportamento em runtime do serviço Go foi provado**: o
que se prova é o que a árvore de código diz, lida por AST e por forma de
declaração; nada aqui executa esse serviço, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não diz que a fidelidade visual está
provada**: nenhum arquivo de `apps/frontend/src/` mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; e o valor real de qualquer variável de ambiente — só o default do
schema TypeScript e o `.env.example` são lidos, nunca um ambiente
implantado. `validate:integration` continua recusando por pré-condição
de banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente.

## 22. A identidade da classe de cliente é a declaração, a instanciação é reconhecida por ligação, e as duas saídas de destino são fechadas — Goal045, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff045 (a
chave por declaração, o reconhecimento de instanciação por ligação, a
dupla saída de destino, as afirmações permanentes de não-vacuidade, e os
quatro controles negativos, montados e revertidos por árvore sintética em
diretório temporário fora da worktree). Ela **não reescreve** §4 a §21:
os registros de A-01 a A-24 em §19, o veredito de §19/§20/§21 e as vinte
e uma seções de fechamento anteriores continuam exatamente como estavam,
e a entrada de **A-24** **não foi tocada**. Este Goal não corrige A-24 e
não abre achado novo — fecha as três bordas não bloqueantes que a
observação do [review044](reviews/044-review.md) e a conferência deste
Goal registraram sobre `discoverGoBoundInternalClientRequests`.

### O que mudou

**A primeira borda — identidade da classe pelo nome — é fechada indexando
por declaração.** O Goal044 deduplicava `classSurfaces` por
`classSpan.name`; duas classes de cliente homônimas declaradas em
arquivos diferentes fariam a segunda ser avaliada contra a superfície da
primeira. O diff045 indexa `classSurfaces` por `classDeclarationKey`
(`${filePath}:${classSpan.line}`), no mesmo formato que
`scannedPrimitiveDeclarations` já usava desde o Goal044. Duas declarações
homônimas produzem duas entradas distintas em `internalClientSurfaces`,
cada uma com sua própria superfície e sua própria varredura de
instanciação.

**A segunda borda — instanciação achada por texto — é fechada resolvendo
a ligação local até a declaração.** `findClassInstantiations` montava um
`RegExp` a partir do nome da classe e o aplicava a todo arquivo das duas
árvores, sem resolver o que aquele identificador estava ligado naquele
arquivo — errando para mais (classe homônima não relacionada) e para
menos (instanciação sob alias de import, que o padrão textual não
casava). O diff045 acrescenta `findInstantiationsOfClassDeclaration` e
`resolveClassInstantiationBindings`, que reusam a máquina de ligação do
Goal044 (`findImportDeclarations`, `resolveModuleSpecifierToFilePath`,
`resolveModuleExportBindings`) para achar, em cada arquivo candidato, a
forma pela qual o identificador de `new <Id>(` chega até a declaração:
declaração local, import nomeado, import nomeado sob alias, ou import
default. Só então o arquivo é varrido, e só pelo nome local resolvido.
Forma de ligação que a resolução não converte — duas declarações
homônimas sem ligação que as distinga, exportação não convertível
(inclui `export =`), `module.exports`/`exports.<nome>`, ligação que
atravessa arquivo por forma não seguida (reexportação em cadeia, import
dinâmico, alias de caminho não relativo, import de namespace, ou
referência reexportada adiante), ou referência à classe repassada
adiante como valor — derruba a leitura com `arquivo:linha`, em categoria
nomeada (`ClassBindingRefusalCategory`), nunca em silêncio.

**A terceira borda — destino não resolvido descartado por um `continue`
mudo — é fechada com duas saídas distintas.** `resolveDestination`
recebia o primeiro argumento do construtor com `parameterNames` vazio; se
esse argumento não fosse uma expressão da qual a leitura extraísse chave
de ambiente, a instanciação era descartada sem virar requisição, sem
virar resíduo e sem derrubar a leitura. O diff045 remove esse `continue`:
quando o destino não resolve a chave alguma, a leitura derruba com
`arquivo:linha`, nomeando a expressão não convertida; quando resolve a
uma chave que não é do serviço Go, a instanciação entra em
`nonGoBoundInstantiations` — fora do conjunto alcançado, mas enumerada
com motivo computado (arquivo, linha, nome local, forma de ligação, chave
de ambiente resolvida).

**As três bordas foram provadas abertas antes de fechar.** Os quatro
controles negativos deste critério rodam, cada um sobre árvore sintética
em diretório temporário próprio, removida ao fim: controle 1 prova, com
par antes/depois, que uma segunda classe homônima declarada em outro
arquivo, sem relação com a primeira, não tinha superfície própria antes
da chave por declaração e passa a ter depois, cada uma com sua própria
requisição; controle 2 prova, com par antes/depois, que uma instanciação
sob `import { C as Alias }` / `new Alias(...)` não era encontrada antes
da resolução por ligação e passa a ser depois, com a rota entrando no
conjunto; controle 3 prova, com par antes/depois, que uma instanciação
cujo destino é recebido por parâmetro do próprio construtor da classe
dona era descartada em silêncio antes, e depois derruba a leitura
nomeando arquivo, linha e o texto do destino; controle 4 prova que uma
classe homônima e não relacionada, declarada em outro módulo e
instanciada em outro arquivo, não é atribuída à superfície da classe do
transporte, e que mover e renomear a classe real e a classe dona não
muda a classificação computada. Nenhum dos quatro toca a árvore real.

**Nenhum mecanismo se desliga em silêncio por não reconhecer a forma.**
`refuseClassReferencesOutsideInstantiation` derruba quando o identificador
ligado aparece em posição de valor fora de `new <Id>(` — referência
repassada adiante que a leitura não percorre. Toda mensagem de recusa e
toda entrada de `nonGoBoundInstantiations` cita a forma de ligação
resolvida e a declaração alcançada; nenhuma afirma varredura ou ligação
que a leitura não exerceu. As duas bordas em que isso não valia foram
fechadas na rodada 2, cada uma provada aberta antes: a isenção por
construção `export` cobria o texto inteiro dela, e por isso
`export const X = <Classe>;` e `export class Sub extends <Classe> {`
passavam em silêncio — `exportConstructBindingRange` isenta agora só o
lado de ligação, e os dois recusam sob
`class_binding_reference_forwarded_as_value`; e
`scannedFilePathsForInstantiation` era preenchido com `allSources` antes
de qualquer varredura, reportando a árvore inteira mesmo quando o laço
que abre arquivo não chegava a executar — quem registra o arquivo agora
é `findCrossFileCallerBindings`, no momento em que o abre.

**Duas afirmações permanentes (WU-04) consomem os dois mecanismos sobre a
árvore real**, ao lado das que os Goals 043 e 044 já deixavam — nenhuma
delas foi relaxada, pulada ou removida. Provam, sem vacuidade, que
`internalClientSurfaces` tem uma entrada por declaração distinta e que
toda superfície tem ao menos uma ligação de instanciação resolvida e
registrada, e que `nonGoBoundInstantiations` não é vazio e toda entrada
tem motivo escrito e aponta a uma superfície computada.

### Veredito recontado

Esta auditoria continua com **0 achados `BLOQUEADOR-MVP`, 8
`PENDENCIA-POS-MVP`** e **6 `LIMITE-DECLARADO`** — a mesma contagem de
§21. **Nenhuma mudança em relação a §21**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real, nenhuma conexão whatsmeow foi aberta, e o diff045 toca dois
arquivos TypeScript de teste e de apoio a teste — nenhum arquivo Go,
nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou
`apps/ai-orchestrator/src/` —, mais a documentação de migração. **Não diz
que o comportamento em runtime do serviço Go foi provado**: o que se
prova é o que a árvore de código diz, lida por AST e por forma de
declaração e de ligação; nada aqui executa esse serviço, abre conexão
whatsmeow ou observa o que chega a um telefone. **Não diz que a fidelidade
visual está provada**: nenhum arquivo de `apps/frontend/src/` mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; e o valor real de qualquer variável de ambiente — só o default do
schema TypeScript e o `.env.example` são lidos, nunca um ambiente
implantado. `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente.

## 23. A isenção de `export` vira allowlist fechada, atribuição não localizada recusa, e as categorias de recusa existem em runtime — Goal046, 2026-09-21

Seção nova, escrita depois da última mudança de árvore do diff046 (WU-01
a WU-04: a allowlist fechada de `exportConstructBindingRange`, a divisão
`{found, resolved}` de `findTopLevelAssignmentIndex`, o array em runtime
`CLASS_BINDING_REFUSAL_CATEGORIES` e os cinco controles negativos
obrigatórios, montados e revertidos por árvore sintética em diretório
temporário fora da worktree). Ela **não reescreve** §4 a §22: os
registros de A-01 a A-24 em §19, o veredito de §19/§20/§21/§22 e as
vinte e duas seções de fechamento anteriores continuam exatamente como
estavam, e a entrada de **A-24** **não foi tocada**. Este Goal não
corrige A-24 e não abre achado novo — fecha o resíduo por **omissão** que
a observação não bloqueante 3 do [review045](reviews/045-review.md)
registrou em `discoverGoBoundInternalClientRequests`.

### O que mudou

**A isenção de `export` deixa de ter caminho de saída que isenta por não
reconhecer.** `exportConstructBindingRange` (`http-egress-sites.ts`)
terminava em `return whole`: toda construção `export` de forma não
classificada pelas três famílias então reconhecidas (`type`/`interface`,
`class`, `const`/`let`/`var`) isentava por inteiro. O diff046 fecha essa
saída: a função classifica contra um conjunto fechado de formas — as três
anteriores mais `function`/`async function`/`default function` (com
`declare`), `default <identificador>`, `{ ... }`/`* from ...` (com
`declare`) — e devolve, para cada forma reconhecida,
`{ recognized: true, start, end }` com o range de lado de ligação; para
toda construção que não casa com nenhuma delas, devolve
`{ recognized: false, start, end }`, nunca mais um range silencioso.
`refuseClassReferencesOutsideInstantiation` recusa a ocorrência do nome
ligado que caia dentro de uma faixa não reconhecida, sob a categoria nova
`class_binding_export_construct_form_unrecognized` — escopada à
**ocorrência**, não à construção: uma forma exótica que não mencione a
classe não derruba nada.

**No ramo `const`/`let`/`var`, atribuição não localizada passa a recusar
em vez de isentar.** `findTopLevelAssignmentIndex` devolvia `undefined`
tanto para "não atribui valor algum" quanto para "atribui, mas a busca de
profundidade não achou o `=` de topo", e os dois casos isentavam por
inteiro. O diff046 separa os dois: `{ found: false, resolved: true }` é o
primeiro caso (a profundidade de bracket fechou, sem `=` de topo — segue
isentando); `{ found: false, resolved: false }` é o segundo (a
profundidade nunca fechou, sinal de `<`/`>` contado como bracket sem ser
um) — e este passa a recusar, pela mesma categoria nova.

**As categorias de recusa existem em runtime.** `CLASS_BINDING_REFUSAL_CATEGORIES`
é um array `as const` exportado, com seis categorias na ordem em que o
código as usa; `ClassBindingRefusalCategory` passa a ser o tipo derivado
desse array, e a suíte confere o conjunto contra ele, não contra união
escrita à mão nos dois lados — a mesma família de falha que reprovou
documento permanente nos Goals 038, 044 e 045. Nenhum identificador de
categoria existente mudou de nome, e nenhuma recusa existente mudou de
categoria.

**Os cinco controles negativos obrigatórios foram provados, cada um
sobre árvore sintética em diretório temporário, removida ao fim:**
`export default { Client: <Classe> };` no candidato recusa pela
categoria nova, com `arquivo:linha` — a forma não é `export default
<identificador>` e cai fora da allowlist, e a conferência de forma não
reconhecida acontece **antes** da heurística de posição de tipo, porque
dentro de uma forma que a leitura não sabe recortar o dois-pontos de
`Client: <valor>` separa chave de valor num literal de objeto;
`export namespace N { export const C = <Classe>; }` recusa, por não
estar na allowlist; `export = <Classe>` no arquivo candidato recusa pela
categoria nova, enquanto a mesma forma no arquivo da **declaração**
continua recusando por `resolveModuleExportBindings`, sob a categoria
antiga `class_binding_export_form_not_resolved` — as duas nunca se
confundem; `export const Weird: Array<Foo = [<Classe>];` recusa, porque
o `<` de `Array<Foo` nunca fecha; e as formas reais das duas árvores
(`export function`, `export async function`, `export interface ...
extends`, `export type`, `export class ... extends`, `export const =`,
`export { ... }`) continuam classificando exatamente como antes da
allowlist fechada.

**A observação não bloqueante 2 do review045 é fechada.** A descrição de
duas categorias, tanto em D-061 quanto no comentário do código, nomeava
só o caso dominante. `class_binding_export_form_not_resolved` também
dispara quando a declaração está em arquivo fora das duas árvores
varridas; `class_binding_cross_file_form_not_resolved` também quando o
arquivo ligado tem texto fora do conjunto lido. [D-062](DECISIONS.md)
nomeia os dois casos, por acréscimo — D-061 não foi reescrita.

**Duas afirmações de não-vacuidade (WU-04) consomem os dois mecanismos
sobre a árvore real**, ao lado das que os Goals 043 a 045 já deixavam:
provam que ao menos uma construção `export` de forma reconhecida foi
isenta (a declaração de `InternalHttpClient` sai por `export class`) e
que a resolução por ligação reconheceu ao menos uma instanciação.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de
§22. **Nenhuma mudança em relação a §22**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real, nenhuma conexão whatsmeow foi aberta, e o diff046 toca
dois arquivos TypeScript de teste e de apoio a teste — nenhum arquivo
Go, nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou
`apps/ai-orchestrator/src/` —, mais a documentação de migração. **Não
diz que o comportamento em runtime do serviço Go foi provado**: o que se
prova é o que a árvore de código diz, lida por AST e por forma de
construção `export`; nada aqui executa esse serviço, abre conexão
whatsmeow ou observa o que chega a um telefone. **Não diz que a
fidelidade visual está provada**: nenhum arquivo de `apps/frontend/src/`
mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; e o valor real de qualquer variável de ambiente — só o default do
schema TypeScript e o `.env.example` são lidos, nunca um ambiente
implantado. `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente — não reexecutado por esta unidade de documentação (WU-05).

## 24. O uso do campo cliente é fail-closed: toda ocorrência é enumerada, e forma não reconhecida recusa em vez de somar rota alguma — Goal047, 2026-09-22

Seção nova, escrita depois da última mudança de árvore do diff047 (WU-01
a WU-05: a enumeração fail-closed do uso do campo, a prova do alvo da
atribuição, a simetria das duas saídas de `sourcesByPath`, o controle
próprio do critério 3 do Goal046, os dois arrays de categorias em
runtime e os sete controles negativos obrigatórios, montados e
revertidos por árvore sintética em diretório temporário fora da
worktree). Ela **não reescreve** §4 a §23: os registros de A-01 a A-24
em §19, o veredito de §19 a §23 e as vinte e três seções de fechamento
anteriores continuam exatamente como estavam, e a entrada de **A-24**
**não foi tocada**. Este Goal não corrige A-24 e não abre achado novo —
fecha o último trecho fail-open da cadeia que os Goals 044 a 046 já
fecharam mais acima: a leitura do uso do campo em que a instância
provada foi guardada.

### O que mudou

**Toda ocorrência de `this.<campo>` passa a ser enumerada, e forma não
reconhecida recusa.** `discoverGoBoundInternalClientRequests` (via
`enumerateClientFieldMemberCalls`, `http-egress-sites.ts`) reconhecia a
chamada de transporte só pela forma literal `this.<campo>.<membro>(`,
por `RegExp`: toda outra forma — encadeamento opcional, acesso
computado, alias em variável local, desestruturação, campo ou membro
repassados como valor, ocorrência fora de corpo de método de topo —
desaparecia sem produzir requisição nem recusa. O diff047 fecha essa
saída: a enumeração passa a ser do **receptor** — o token `this` dentro
do corpo da classe dona, sobre o texto sem comentários e com as faixas
`${...}` de template literal lidas como código —, e cada ocorrência cai
em exatamente uma saída: chamada de transporte, chamada de membro fora
da superfície, ou recusa com `arquivo:linha`, contexto e uma categoria
nomeada nova de `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` (doze categorias:
sete da forma do uso e cinco da forma do receptor). Enumerar o texto
`this.<campo>` teria deixado o fail-open de pé, porque o campo é
alcançado sem esse texto aparecer — `this?.<campo>`, `this["<campo>"]`,
`const { <campo> } = this`, `const alias = this`. A recusa é **escopada
à ocorrência**: propriedade homônima de outro objeto, ocorrência que
prova alcançar outro campo, texto de template, string ou comentário não
conta e não recusa.

**O alvo da atribuição da instanciação passa a ser provado, não
casado numa janela de texto.** `findAssignedFieldName` casava o
identificador imediatamente antes de um `=` dentro de uma janela de 200
caracteres, sem provar que esse identificador fosse campo da classe
dona — uma instanciação guardada em variável local produzia um "campo"
que nunca aparecia como `this.<nome>`, e a leitura terminava em zero
requisição e zero recusa. O diff047 distingue **campo provado**
(`this.<campo> = new ...` em qualquer profundidade do corpo da classe,
ou declaração de propriedade de classe com inicializador) de **forma
não resolvida** (variável local, desestruturação, propriedade de outro
objeto, elemento de array, `return new ...` direto, ou qualquer outra),
que passa a recusar sob categoria nova de
`INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` (seis categorias), em vez
de devolver um nome de campo que nunca será encontrado.

**As duas saídas de `sourcesByPath` ausente unificadas.** O `continue`
silencioso do ramo `constructor_base_url_*` foi substituído pela mesma
recusa nomeada com `arquivo:linha` que o ramo da instanciação já fazia
— nenhum dos dois ramos pula sítio ou instanciação em silêncio.

**A observação 1 do review046 é fechada.** A recusa escopada à
ocorrência do Goal046 — construção `export` de forma exótica que **não**
menciona a classe ligada não derruba nada — era verdadeira por leitura
da estrutura, sem controle permanente. O diff047 acrescenta esse
controle: árvore sintética com construção `export` não reconhecida que
não menciona a classe, ao lado da instanciação normal alcançando o
transporte, prova classificação idêntica à da mesma árvore sem aquela
construção.

**As categorias de recusa dos dois caminhos existem em runtime, em dois
arrays separados.** `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` (doze
categorias: sete da forma do uso, cinco da forma do receptor) e
`INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` (seis categorias) são
arrays `as const` exportados, com os tipos
`ClientFieldUseRefusalCategory` e `InstanceFieldAssignmentRefusalCategory`
derivados deles; a suíte confere os dois por igualdade, não contra união
escrita à mão nos dois lados — a mesma família de falha que reprovou
documento permanente nos Goals 038, 044 e 045. Nenhum identificador de
categoria já existente (do Goal045/046) mudou de nome, e nenhuma recusa
existente mudou de categoria.

**Só a crase abre interpolação.** A desmarcação das faixas `${...}`
exige que a região tenha sido aberta por crase: dentro de string comum
(`"..."`, `'...'`) o mesmo texto continua sendo texto, e não vira
código. Dois controles permanentes exercitam isso — `${this.http.send(`
escrito dentro de string comum não conta nem recusa, e string comum
escrita **dentro** de uma interpolação continua sendo texto enquanto a
chamada real da mesma interpolação sai como requisição.

**Os sete controles negativos obrigatórios do escopo §7 foram provados,
cada um sobre árvore sintética em diretório temporário, removida ao
fim:** encadeamento opcional (`this.http?.request(...)`); acesso
computado (`this.http["request"](...)`); alias em variável local
(`const client = this.http; client.request(...)`); instância guardada
em variável local do construtor, nunca em `this.<campo>`; ocorrência
fora de corpo de método de topo (inicializador de campo que menciona
`this.http`); as três formas reais continuando classificadas
exatamente como antes (chamada de transporte, chamada de membro fora da
superfície, montagem de URL sem chamar o cliente); e o controle herdado
do critério 3 do Goal046 acima.

**Duas afirmações de não-vacuidade (WU-04) consomem os dois mecanismos
sobre a árvore real**, ao lado das que os Goals 043 a 046 já deixavam:
provam que ao menos uma ocorrência do campo cliente foi classificada
como chamada de transporte e que a enumeração de `this.http.<membro>(`
na árvore real não é vazia.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de
§23. **Nenhuma mudança em relação a §23**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real, nenhuma conexão whatsmeow foi aberta, e o diff047 toca
dois arquivos TypeScript de teste e de apoio a teste — nenhum arquivo
Go, nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou
`apps/ai-orchestrator/src/` —, mais a documentação de migração. **Não
diz que o comportamento em runtime do serviço Go foi provado**: o que se
prova é o que a árvore de código diz, lida por enumeração de ocorrência
sobre o texto-fonte; nada aqui executa esse serviço, abre conexão
whatsmeow ou observa o que chega a um telefone. **Não diz que a
fidelidade visual está provada**: nenhum arquivo de `apps/frontend/src/`
mudou.

Cada uma das doze categorias de `CLIENT_FIELD_USE_REFUSAL_CATEGORIES`
tem, além da igualdade do array, controle permanente que a exercita, com
as duas saídas registradas; os sete controles obrigatórios que o
critério de aceite do Goal nomeia (escopo §7) existem e mordem todos.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; e o valor real de qualquer variável de ambiente — só o default do
schema TypeScript e o `.env.example` são lidos, nunca um ambiente
implantado. `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente. Sobre a árvore final: `validate:core` exit 0, `npm run
test:gate` com 226 testes e 0 falhas, e `go test ./...` em
`apps/evolution-go` ok.

## 25. A cobertura de recusa passa a ser computada, e categoria sem controle reprova a suíte — Goal048, 2026-09-22

Seção nova, escrita depois da última mudança de árvore do diff048
(WU-01 a WU-05: o mecanismo de cobertura computada a partir dos três
arrays em runtime, a conversão de todo controle negativo pré-existente
para alimentá-lo, controle novo para seis das oito categorias que só
existiam sob igualdade de array, a prova de que as duas restantes são
inalcançáveis por construção, o controle do sub-caso "comentário" da
observação 1 do review047, a generalização da asserção do escopo §3 do
Goal047, os cinco controles negativos do próprio mecanismo de cobertura
— montados e revertidos —, e a reconfirmação da árvore real). Ela **não
reescreve** §4 a §24: os registros de A-01 a A-24 em §19, o veredito de
§19 a §24 e as vinte e quatro seções de fechamento anteriores continuam
exatamente como estavam, e a entrada de **A-24** **não foi tocada**.
Este Goal não corrige A-24 e não abre achado novo — fecha a classe de
defeito, comum aos Goals 044 a 047, em que o vocabulário de recusa
crescia mais rápido que os controles que o exercitam.

### O que mudou

**A cobertura deixa de ser afirmada em prosa e passa a ser computada.**
Um `Set` de módulo (`observedRefusalCategories`,
`assistant.service.test.ts:48`) acumula toda categoria observada em
runtime, alimentado pelo helper `expectRefusal` (`:50`–`64`), que
substituiu `expect(() => ...).toThrow(regex)` em todo controle negativo
do arquivo — dos Goals 045 a 047 e dos novos deste Goal. Um teste final
(`:6871`–`6896`) concatena os três arrays em runtime —
`CLIENT_FIELD_USE_REFUSAL_CATEGORIES` (12), `CLASS_BINDING_REFUSAL_CATEGORIES`
(6) e `INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` (6), 24 categorias
ao todo — e afirma que nenhuma ficou de fora do conjunto observado, com
uma única dedução: as categorias declaradas em
`PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` (`:6860`–`6869`), o registro das
duas inalcançáveis descritas abaixo, cada uma com o motivo computado.
Categoria acrescentada a qualquer um dos três arrays sem controle
correspondente reprova este teste nomeando exatamente qual ficou
descoberta. O registro de inalcançáveis não é isenção escrita à mão que
vale para sempre: o mesmo teste reprova se uma entrada dele deixar de
existir nos arrays, e reprova se uma categoria declarada inalcançável
voltar a ser observada em runtime.

**Seis das oito categorias que na baseline só existiam sob igualdade de
array ganharam controle permanente**, cada uma sobre árvore sintética
em diretório temporário, removida ao fim: `instance_field_assignment_destructured`,
`instance_field_assignment_foreign_object_property` e
`instance_field_assignment_form_not_recognized`, do vocabulário de
atribuição; `class_binding_homonymous_declarations`,
`class_binding_commonjs_export` e `class_binding_cross_file_form_not_resolved`,
do vocabulário de ligação de classe.

**As duas categorias restantes são inalcançáveis por árvore sintética
alguma, por construção do código de `resolveProvenClassFieldAssignment`
(`http-egress-sites.ts`), não por lacuna de teste:**
`instance_field_assignment_array_element` — seu regex é subconjunto
estrito do de `instance_field_assignment_destructured`, testado antes
na mesma cadeia de `if`, que sempre casa primeiro; e
`instance_field_assignment_returned_directly` — sua janela de leitura
nunca termina em "return", porque `findClassInstantiations` só
reconhece sítio de instanciação quando a palavra anterior ao nome da
classe é "new". Dois controles permanentes provam a inalcançabilidade:
constroem exatamente a forma nomeada por cada categoria e afirmam que a
recusa observada sai sob a categoria vizinha, nunca sob a nomeada. As
duas ficam **nomeadas como resíduo aqui e em [D-064](DECISIONS.md)** —
não declaradas cobertas pela igualdade do array, que é a afirmação que
este Goal existe para remover.

**O sub-caso "comentário" da observação 1 do review047 ganhou controle
permanente**, e a asserção do escopo §3 do Goal047 deixou de depender
de nome de variável, passando a afirmar a ausência genérica de
`.get(...); if (<identificador> === undefined) continue`.

**O título do teste de igualdade de `CLASS_BINDING_REFUSAL_CATEGORIES`
deixou de afirmar cobertura que não existia** — passa a dizer que o
array traz a categoria na ordem declarada, e que a cobertura é
conferida à parte.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de
§24. **Nenhuma mudança em relação a §24**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

**Limite próprio deste Goal, declarado e não mascarado.** Das 24
categorias, **22** têm controle permanente observado em runtime por
`expectRefusal`; as **2** nomeadas acima são estruturalmente
inalcançáveis. O mecanismo de cobertura não finge que elas foram
observadas: desconta as duas só por `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`
(`assistant.service.test.ts:6860`–`6869`), um registro nomeado que o
próprio teste confere — entrada que deixe de existir nos arrays, ou
categoria nele declarada que volte a ser observada, reprova. Consequência
mensurável: de **200** testes em `assistant.service.test.ts`, **200**
passam, **0** falham. A suíte completa de `apps/ai-orchestrator` fecha
em **1012** testes: **924** passando, **88** pulados (mesma contagem da
baseline), **0** falhando. `npm run validate:core` **PASSED** nesta
árvore: dos 17 passos, **15** passaram (inclusive `test:ai-orchestrator`)
e **2** pulados por design (`test:bff`, `test:health-worker`, cobertos
só em `validate:integration`); nenhum falhou. `npm run test:gate`
(raiz, suíte independente sobre `scripts/`) permanece em **226** testes
e 0 falhas, inalterado, porque não exercita este arquivo. Se o registro
nomeado é a forma de resíduo que a revisão aceita para as duas
categorias, é decisão da revisão — registrada em "Revisar se" de D-064.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real, nenhuma conexão whatsmeow foi aberta; o diff048 toca
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` e,
fora do escopo de produto, dois arquivos de `tools/ia-loop/`
(`lib/deterministic-executor.mjs`, `tests/deterministic-executor.test.mjs`)
para corrigir um bug do próprio harness na resolução de `pattern` —
nenhum arquivo Go, nenhum arquivo de `apps/frontend/src/`,
`apps/bff/src/` ou `apps/ai-orchestrator/src/` —, mais a documentação
de migração. **Não diz que o comportamento em runtime do serviço Go foi
provado**: o que se prova é o que a árvore de código diz, lida por
enumeração de ocorrência sobre o texto-fonte; nada aqui executa esse
serviço, abre conexão whatsmeow ou observa o que chega a um telefone.
**Não diz que a fidelidade visual está provada**: nenhum arquivo de
`apps/frontend/src/` mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; e o valor real de qualquer variável de ambiente — só o default do
schema TypeScript e o `.env.example` são lidos, nunca um ambiente
implantado. `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente — não reexecutado por esta unidade de documentação (WU-06).

## 26. A categoria creditada passa a ser a declarada pelo controle, e o descarte silencioso é enumerado por forma idiomática — Goal049, 2026-09-22

Seção nova, escrita depois da última mudança de árvore do diff049
(WU-01 a WU-06: a amarra que confronta categoria declarada e observada
dentro de `expectRefusal`, a migração dos sítios de chamada
pré-existentes, os três controles permanentes do guard novo, a troca da
asserção de saída silenciosa por enumeração de descarte guardado por
valor ausente, os controles negativos do mecanismo de descarte —
revertidos —, e a reconfirmação da árvore real; WU-07 a WU-11 são os
gates — typecheck, lint, targeted-tests, suíte completa e validation
gate). Ela **não reescreve** §4 a §25: os registros de A-01 a A-24 em
§19, o veredito de §19 a §25 e as vinte e cinco seções de fechamento
anteriores continuam exatamente como estavam, e a entrada de **A-24**
**não foi tocada**. Este Goal não corrige A-24 e não abre achado novo —
fecha as duas aberturas que o [review048](reviews/048-review.md)
registrou como observações não bloqueantes: o mecanismo de cobertura de
D-064 media conformidade de mensagem e crédito de categoria em dois
passos nunca confrontados, e a asserção de saída silenciosa era uma
`RegExp` ancorada num único acessor.

### O que mudou

**A categoria só é creditada quando a declarada pelo controle e a
observada na mensagem coincidem.** `expectRefusal`
(`assistant.service.test.ts:67`–`101`) ganhou um terceiro parâmetro
obrigatório, a categoria declarada, entre a ação e o `matcher`. Três
saídas passam a reprovar em vez de creditar em silêncio: mensagem sem
marcador `[categoria: ...]` reprova nomeando controle e mensagem;
marcador com categoria diferente da declarada reprova nomeando as duas;
categoria declarada fora dos três arrays em runtime
(`ALL_REFUSAL_CATEGORIES`, `:58`–`62`) reprova antes de olhar a
mensagem. O símbolo `NO_REFUSAL_CATEGORY` (`:65`) cobre o único caso
legítimo de recusa sem categoria — nascida fora das quatro fábricas —,
declarado pelo controle, não engolido.

**Os sítios de chamada pré-existentes migraram, e a contagem real é
maior que a estimada.** A árvore final tem **32** chamadas de
`expectRefusal` (fora a declaração), não as 29 do documento do Goal:
**29** são os controles de categoria real, migrados 1:1 sem divergência
entre declarada e observada; **3** são os controles novos do guard,
descritos abaixo. `describe("Goal049 / WU-03...")`
(`:114`–`151`+) prova, permanentemente, as três saídas do guard sobre o
próprio mecanismo — não sobre uma categoria de produto —, confirmado
por controle temporário e revertido: com o guard voltado à forma
anterior, as três reprovam por falta de `toThrow`.

**O descarte silencioso deixou de ser casado por `RegExp` ancorada em
`.get(` e passou a ser enumerado por forma idiomática.**
`findSilentDiscardLines` (`:5909`–`5920`) varre
`http-egress-sites.ts` por toda linha `if (<condição sobre valor
ausente>) continue;`, em `=== undefined`, `=== null` ou
`!<identificador>`, combinável por `||`. Toda ocorrência tem de estar em
`DOCUMENTED_SILENT_DISCARDS` (`:5885`–`5906`), fail-closed nos dois
sentidos como `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` de D-064:
ocorrência não registrada reprova nomeando `arquivo:linha`, e entrada
obsoleta reprova. As duas asserções de frase literal (`:5931`,
`:5934`) não mudaram.

**A varredura real encontrou 5 sítios, não os 2 nomeados na baseline —
descoberta, não ajuste.** `http-egress-sites.ts` tem diff **zero**
contra a baseline: os 3 sítios adicionais (`:1141`, `:1916`, `:2029`)
já existiam no texto e não eram vistos pela `RegExp` antiga, ancorada
em `.get(`. Nenhum dos 5 é candidato descartado — cada um está
registrado com o motivo computado de ser inócuo, na decisão nova
([D-065](DECISIONS.md)).

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de
§25. **Nenhuma mudança em relação a §25**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

**Limite próprio deste Goal, declarado e não mascarado.** A enumeração
de `findSilentDiscardLines` cobre **descarte guardado por valor
ausente**, não todo `continue;` do módulo (majoritariamente varredura
lexical de caractere, sem relação com descarte de candidato) e **não é
prova de conservação de candidatos**: um `continue` sem guarda de valor
ausente não é capturado. Provar que todo candidato termina em
requisição, recusa ou balde declarado é trabalho de Goal futuro, não
autorizado aqui. Consequência mensurável: de **204** testes em
`assistant.service.test.ts` (baseline: 200), **204** passam, **0**
falham. A suíte completa de `apps/ai-orchestrator` fecha em **1016**
testes: **928** passando (baseline: 924), **88** pulados (mesma
contagem da baseline), **0** falhando. `npx tsc -p tsconfig.json
--noEmit`: "TypeScript: No errors found", exit 0. `npm run lint`
(`eslint src --max-warnings=0`): exit 0, sem saída. `npm run
validate:core` **PASSED**: dos 17 passos, **15** passaram (inclusive
`test:ai-orchestrator`) e **2** pulados por design (`test:bff`,
`test:health-worker`); nenhum falhou. `npm run test:gate` (raiz):
**226** testes, **226** passando, **0** falhando, inalterado, porque
não exercita este arquivo.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real; o diff049 toca só
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` e a
documentação de migração — `git status --porcelain=v1 -uall` não lista
nenhum arquivo de `tools/ia-loop/` nesta rodada, e a dispensa do
review048 não se estendeu. **Não diz que o comportamento em runtime do
serviço Go foi provado**: o que se prova é o que a árvore de código diz,
lida por enumeração de ocorrência sobre o texto-fonte. **Não diz que a
fidelidade visual está provada**: nenhum arquivo de
`apps/frontend/src/` mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; o valor real de qualquer variável de ambiente; e conservação de
candidatos no módulo de descarte, declarada e limitada ao escopo §3 (ver
"Limite próprio" acima). `validate:integration` continua recusando por
pré-condição de banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not
set`), declarado como ausente — não reexecutado por esta unidade de
documentação (WU-12).

## 27. A conservação do conjunto de egresso vira partição computada por campo, e balde sem origem reprova — Goal050, 2026-09-22

Seção nova, escrita depois da última mudança de árvore do diff050
(WU-01: campo estrutural de origem em `http-egress-sites.ts`; WU-02: a
partição computada, nos dois sentidos, com o universo de candidatos
declarado; WU-03: motivo não vazio nos cinco baldes e no registro de
descarte, e `NO_REFUSAL_CATEGORY` exercitado por controle; WU-04: o
registro de descarte rechaveado por trecho normalizado mais âncora de
função; WU-05: os oito controles negativos permanentes do escopo §8,
cada um exercitado por reversão temporária; WU-06, esta unidade,
documenta). Ela **não reescreve** §4 a §26: os registros de A-01 a
A-24, o veredito das seções anteriores e as vinte e seis seções de
fechamento continuam exatamente como estavam, e a entrada de **A-24**
**não foi tocada**. Este Goal não corrige A-24 e não abre achado
novo — fecha a abertura registrada no [Goal050](goals/050-a-conservacao-e-provada-por-construcao.md):
a asserção de conservação de `assistant.service.test.ts:2953`–`2975`
(baseline) decidia que um sítio de egresso "virou requisição" por uma
disjunção cujo segundo ramo era `request.reason.includes(position)` —
substring de prosa livre, portante e não decorativa, porque o único
laço de volta ao sítio de origem da requisição resolvida no chamador
estava dentro do texto do motivo.

### O que mudou

**A origem do sítio de egresso é campo estrutural, não frase.**
`http-egress-sites.ts` ganhou `HttpEgressSiteOrigin` e o campo
`originSite` em toda interface de saída que nasce de sítio
classificado — `GoBoundHttpRequest`, `NonGoBoundEgressSite`,
`AssembledUrlForDelivery`, `NonTransportMemberCall` e
`NonGoBoundClassInstantiation`. Os oito sítios de `push` do arquivo
passam a preenchê-lo, inclusive a requisição resolvida no chamador
(`:2062` na baseline) e o cliente HTTP interno, que na baseline não
carregava origem alguma, nem campo nem prosa.

**A conservação virou partição computada, nos dois sentidos, sem ramo
de prosa.** A asserção antiga foi substituída por uma que lê
`discovery.sites` inteiro e encaminha cada sítio, por categoria, a um
dos cinco baldes nomeados (`requests`, `notGoBound`, `assembledUrls`,
`nonTransportMemberCalls`, `nonGoBoundInstantiations`). Quatro saídas
reprovam em vez de passar em silêncio: sítio sem balde algum; sítio em
mais de um balde; entrada de balde cuja origem declarada não
corresponde a sítio lido algum; e categoria que a partição não sabe
encaminhar. A ligação é sempre por campo (`originSite`), nunca por
`reason.includes(...)` — o ramo de prosa não existe mais. **Exceção
declarada** (ver "Limite próprio" abaixo): "um dos cinco baldes" é por
categoria, não pelos cinco em conjunto — `egressPartitionBucketsForCategory`
restringe a checagem de duplicidade ao subconjunto roteável da
categoria do sítio.

**O universo de candidatos é declarado, fail-closed.**
`EGRESS_CANDIDATE_UNIVERSE` nomeia as cinco coleções de
`HttpEgressDiscovery`: `sites` e `genericEgressPrimitives` entram na
partição; `excluded`, `genericEgressCallers` e
`genericEgressCallersByPrimitive` ficam de fora, cada uma com motivo
escrito e conferida — `excluded` não encobre sítio, `genericEgressCallers`
está vazio na árvore atual e o controle é fail-closed sobre essa
vacuidade. Coleção nova que o descobridor produza e que esta
declaração não nomeie reprova.

**Motivo vazio não passa em balde nenhum, nem no registro de
descarte**, no precedente de D-064. **O registro de descarte deixou de
ser chaveado por número de linha**: a chave passou a ser o trecho
normalizado mais a função de nível superior que o envolve, fail-closed
nos dois sentidos de antes mais uma terceira saída — chave ambígua
reprova. As **5** entradas continuam as mesmas da baseline, porque
nenhuma edição deste Goal tocou o texto-fonte que a varredura lê.
**`NO_REFUSAL_CATEGORY` ganhou controle**, em vez de ser removido —
exercitado sobre uma recusa cujo destino não resolve por env, campo de
instância nem parâmetro de chamador.

**Oito controles negativos permanentes provam as oito amarras do
escopo §8**, cada um com as duas saídas conferidas na árvore, incluindo
deslocamento de linha em `http-egress-sites.ts` não reprovando em
massa e descarte mudo novo continuando a reprovar.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de
§26. **Nenhuma mudança em relação a §26**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

**Limite próprio deste Goal, declarado e não mascarado, herdado de
D-065 sem afrouxamento.** A enumeração de `findSilentDiscardLines`
continua cobrindo **descarte guardado por valor ausente**, não todo
`continue;` do módulo, e a partição deste Goal prova conservação
**entre o descobridor e os baldes de saída**, não dentro das funções
de varredura — um `continue` sem guarda de valor ausente, ou dentro de
bloco com outra instrução antes, não é capturado por mecanismo algum
desta rodada. Provar conservação de candidatos dentro das funções de
varredura é trabalho de Goal futuro, não autorizado aqui.

**Segundo limite próprio, declarado: "exatamente um balde" é por
categoria, não pelos cinco baldes em conjunto.**
`egressPartitionBucketsForCategory` devolve, por categoria, o
subconjunto de baldes em que a checagem de duplicidade roda — não
sempre os cinco. Sítios `constructor_base_url_*` têm subconjunto
`[notGoBound]` só: a saída direta do sítio é o registro de adiamento
ali, e as entradas que a varredura de instanciação produz para cada
instanciação do cliente (em `requests`, `assembledUrls`,
`nonGoBoundInstantiations` ou `nonTransportMemberCalls`, presas ao
sítio pelo mesmo `originSite`) são saídas de cada instanciação, não
segundas saídas do sítio, e ficam fora do subconjunto verificado para
essa categoria. Um sítio `constructor_base_url_*` com uma ou mais
instanciações legitimamente tem `originSite` em `notGoBound` **e** num
dos quatro baldes de instanciação ao mesmo tempo, sem que "sítio em
mais de um balde" reprove. A partição prova "exatamente um balde
dentre os roteáveis pela categoria do sítio", não "exatamente um balde
dentre os cinco", para todo sítio. **A exceção não é vácua:** teste
permanente novo (`assistant.service.test.ts:3137`) prova, sobre a
árvore real, que ao menos um sítio `constructor_base_url_*` de fato
tem `originSite` em `notGoBound` e num balde de instanciação ao mesmo
tempo, e que a mesma conta de `:3099` não o reprova. Consequência
mensurável: de **215** testes em `assistant.service.test.ts`
(baseline: 204), **215** passam, **0** falham; o arquivo tem **7864**
linhas (baseline: 7100). `http-egress-sites.ts` tem **26** inserções e
**1** deleção contra a baseline (**3886** linhas; baseline: 3861) — a
primeira vez desde o Goal047 que este arquivo tem diff não-zero. A
suíte completa de `apps/ai-orchestrator` fecha em **1027** testes:
**939** passando (baseline: 928), **88** pulados (mesma contagem da
baseline), **0** falhando. `npx tsc -p tsconfig.json --noEmit`:
"TypeScript: No errors found", exit 0. `npm run lint` (`eslint src
--max-warnings=0`): exit 0, sem saída. `npm run validate:core`
**PASSED**: dos 17 passos, **15** passaram (inclusive
`test:ai-orchestrator`) e **2** pulados por design (`test:bff`,
`test:health-worker`); nenhum falhou. `npm run test:gate` (raiz):
**226** testes, **226** passando, **0** falhando, inalterado, porque
não exercita este arquivo.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi corrigido**:
o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real; o diff050 toca só
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` e a
documentação de migração — `git status --porcelain=v1 -uall` não lista
nenhum arquivo de `tools/ia-loop/` nesta rodada. **Não diz que o
comportamento em runtime do serviço Go foi provado**: o que se prova é
o que a árvore de código diz, lida por enumeração de ocorrência sobre
o texto-fonte. **Não diz que a fidelidade visual está provada**:
nenhum arquivo de `apps/frontend/src/` mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; o valor real de qualquer variável de ambiente; e conservação de
candidatos dentro das funções de varredura de `http-egress-sites.ts`,
declarada e limitada ao escopo §4 do Goal050 (ver "Limite próprio"
acima). `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente — não reexecutado por esta unidade de documentação
(WU-06).

## 28. A partição de egresso passa a conferir as duas mãos, e o universo de saída de `discoverGoServiceHttpRequests` é declarado fail-closed — Goal051, 2026-09-22

Seção nova, escrita depois da última mudança de árvore do diff051
(WU-01: encaminhamento por categoria em duas mãos declaradas, saída
própria e saída derivada; WU-02: universo de saída declarado
fail-closed; WU-03: vacuidade por balde e o motivo de
`env_var_*`/resolvido-no-chamador ligado ao campo `originSite`; WU-04:
os oito controles negativos permanentes do escopo §8; WU-05 a WU-07:
verificação dirigida; WU-08, esta unidade, documenta). Ela **não
reescreve** §4 a §27: os registros de A-01 a A-24, o veredito das
seções anteriores e as vinte e sete seções de fechamento continuam
exatamente como estavam, e a entrada de **A-24** **não foi tocada**.
Este Goal não corrige A-24 e não abre achado novo — fecha as duas
aberturas registradas no [Goal051](goals/051-a-particao-morde-nos-dois-sentidos.md),
originadas nas observações 1 e 2 do [review050](reviews/050-review.md)
e num achado próprio desta passada de planejamento: a partição do
Goal050 conferia a mordida só do lado do sítio — do lado da entrada,
cobrava apenas que a origem fosse um sítio de fato lido e que o motivo
não fosse vazio, deixando **10** das **19** entradas dos cinco baldes
sem asserção nenhuma sobre se o balde em que estavam era permitido
pela categoria da própria origem; e o universo de **saída** de
`discoverGoServiceHttpRequests` não tinha o mesmo tratamento
fail-closed que `EGRESS_CANDIDATE_UNIVERSE` já dava ao universo de
entrada desde D-066.

### O que mudou

**O encaminhamento por categoria declara saída própria e saída
derivada, separadamente.** `egressPartitionBucketsForCategory` passou
a devolver `{ ownOutput, derivedOutput }` em vez de um array só. Para
as categorias de `fetch` cru os dois conjuntos coincidem
(`[requests, notGoBound]`); para `constructor_base_url_*` a saída
própria é só `[notGoBound]` e a derivada é
`[requests, assembledUrls, nonGoBoundInstantiations, nonTransportMemberCalls]`
— os baldes que a varredura de instanciação povoa a partir daquele
sítio. Categoria não encaminhável continua devolvendo `null` e
reprovando.

**A partição confere agora as duas mãos.** Toda entrada dos cinco
baldes é conferida contra o conjunto que a categoria da sua origem
declarada permite — saída própria quando a entrada ocupa a posição do
sítio, saída derivada quando não —, com a saída nova
`entriesInBucketNotAllowedByOriginCategory`. `inMoreThanOneBucket`
passou a ser avaliado só sobre a saída própria. O controle negativo 1
do escopo §8 prova a mordida movendo uma entrada real para um balde
não permitido pela categoria da sua origem; o controle 2 prova que as
duas mãos são distintas, não a união das duas.

**O universo de saída de `discoverGoServiceHttpRequests` é declarado,
fail-closed, no precedente exato de `EGRESS_CANDIDATE_UNIVERSE`.**
`GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE` nomeia as **7** chaves que
o descobridor devolve em runtime: as **5** de `EGRESS_PARTITION_BUCKETS`
entram na partição; `internalClientSurfaces` e `callerResolutions`
ficam fora, cada uma com motivo escrito — são relatórios do que a
resolução leu, não coleções de entradas com `originSite` próprio. Um
teste confere a declaração contra `Object.keys(discovery)` da execução
real e contra `EGRESS_PARTITION_BUCKETS`; os controles negativos 3 e 4
do escopo §8 provam as duas direções fail-closed sobre um conjunto de
chaves corrompido.

**Vacuidade por balde é declarada ou exercida.** Sobre a árvore real:
`requests` (**10**), `notGoBound` (**6**), `assembledUrls` (**1**) e
`nonGoBoundInstantiations` (**2**) têm não-vacuidade asserida
diretamente; `nonTransportMemberCalls` é **0**. O controle negativo 2
do Goal044 (`:4314`, cenário "antes") já prova, sobre árvore sintética
de arquivos, que o balde recebe entrada — mas não exercita a checagem
de categoria de origem, porque a árvore real nunca o popula. O
controle negativo 7 do escopo §8 (`assistant.service.test.ts:8551`)
fecha essa lacuna com estado de partição sintético dedicado: povoa o
balde com entrada de origem permitida (saída verde) e depois com
origem não permitida, provando que a mesma conta do controle negativo
1 reprova, nomeando balde, entrada, origem e categoria.

**O trecho do `reason` que cita a posição da origem passa a ser
computado do campo `originSite`.** A montagem do motivo da requisição
resolvida no chamador interpola `${site.filePath}:${site.line}` a
partir do próprio `originSite`, e os dois não podem mais divergir por
construção. Um teste permanente confere a correspondência sobre a
árvore real — **1** entrada nessa condição, a requisição de
`health.ts:22` — e um controle negativo dedicado (WU-03, logo após o
teste permanente em `assistant.service.test.ts`) prova que motivo
divergente do campo reprova: a mesma conta aplicada a uma entrada real
com `originSite` deslocado uma linha acusa a entrada, nomeando
`arquivo:linha` da requisição e da origem divergente.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de
§27. **Nenhuma mudança em relação a §27**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

**Limite próprio deste Goal, declarado e não mascarado, herdado de
D-066 sem afrouxamento.** A partição continua provando conservação
**entre o descobridor e os baldes de saída**, não dentro das funções
de varredura — um `continue` sem guarda de valor ausente, ou em bloco
com outra instrução antes, continua fora de alcance de qualquer
mecanismo desta rodada. `internalClientSurfaces` e `callerResolutions`
ganharam motivo declarado para estarem fora da partição, não
pertencimento novo — este Goal não os transforma em baldes de
destino de sítio. Consequência mensurável: de **227** testes em
`assistant.service.test.ts` (baseline: 215), **227** passam, **0**
falham; o arquivo tem **8718** linhas (baseline: 7864), **909**
inserções e **55** deleções. `http-egress-sites.ts` tem **3**
inserções e **2** deleções contra a baseline (**3887** linhas;
baseline: 3886). A suíte completa de `apps/ai-orchestrator` fecha em
**1039** testes: **951** passando (baseline: 939), **88** pulados
(mesma contagem da baseline), **0** falhando. `npx tsc -p
tsconfig.json --noEmit`: "TypeScript: No errors found", exit 0. `npm
run lint` (`eslint src --max-warnings=0`): exit 0, sem saída. `npm run
validate:core` **PASSED**: dos 17 passos, **15** passaram (inclusive
`test:ai-orchestrator`) e **2** pulados por design (`test:bff`,
`test:health-worker`); nenhum falhou. `npm run test:gate` (raiz):
**226** testes, **226** passando, **0** falhando, inalterado, porque
não exercita este arquivo.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi
corrigido**: o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real; o diff051 toca só
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` e a
documentação de migração — `git status --porcelain=v1 -uall` não lista
nenhum arquivo de `tools/ia-loop/` nesta rodada. **Não diz que o
comportamento em runtime do serviço Go foi provado**: o que se prova é
o que a árvore de código diz, lida por enumeração de ocorrência sobre
o texto-fonte. **Não diz que a fidelidade visual está provada**:
nenhum arquivo de `apps/frontend/src/` mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-
lib/`, biblioteca vendorizada lida apenas como fonte das declarações de
proto; o valor real de qualquer variável de ambiente; e conservação de
candidatos dentro das funções de varredura de `http-egress-sites.ts`,
declarada e limitada desde o escopo §4 do Goal050 (ver "Limite próprio"
acima). `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente — não reexecutado além da conferência de exit code por
esta unidade de documentação (WU-08).

## 29. O descarte é enumerado por inteiro: toda ocorrência de `continue;` é classificada pela forma do laço, e a classe portadora de candidato tem chave por multiplicidade declarada — Goal052, 2026-09-22

Seção nova, escrita depois da última mudança de árvore do diff052
(WU-01: enumeração completa de `continue;` e classificação computada
pela forma do laço; WU-02: registro unificado com chave por
multiplicidade declarada; WU-04: os oito controles negativos
permanentes do escopo §9; WU-05 a WU-07: verificação dirigida; WU-08,
esta unidade, documenta). Ela **não reescreve** §4 a §28: os registros
de A-01 a A-24, o veredito das seções anteriores e as vinte e oito
seções de fechamento continuam exatamente como estavam, e a entrada de
**A-24** **não foi tocada**. Este Goal não corrige A-24 e não abre
achado novo — fecha o último fail-open conhecido da família
Goal049–051: a isenção do descarte de candidato era silêncio, não
critério computado. `findSilentDiscardLines` (baseline) reconhecia uma
única forma de descarte, e o total de **120** ocorrências de
`continue;` do módulo vivia escrito à mão num comentário, sem
asserção alguma conferindo esse número.

### O que mudou

**A enumeração acha toda ocorrência de `continue;`, com a contagem
total computada em runtime.** `enumerateContinueOccurrences`
(`assistant.service.test.ts:7488`) varre o texto do módulo, classifica
cada posição num contexto léxico fechado (`CONTINUE_LEXICAL_CONTEXTS`)
e resolve o laço mais interno que contém cada `continue;` por
casamento de parênteses e chaves sobre o texto com o não-código
mascarado — nunca por recuo de indentação, técnica em que a sondagem
do próprio Goal falhou em **5** pontos da árvore real (`:1761`,
`:1765`, `:1769`, `:1773`, `:1796`), hoje todos classificados. O
comentário que antes carregava o número à mão não o carrega mais.
Sobre a árvore real: **120** ocorrências, todas em contexto `code`.

**Cada ocorrência cai numa classe computada do vocabulário fechado
`CONTINUE_LOOP_FORMS`** (`for-of`, `for-in`, `for-indexed`,
`while-exec-match`, `while-queue-drain`, `while-positional-read`,
`do-while`), e ocorrência cujo laço contenedor não resolve, ou cuja
classe cai fora do vocabulário, reprova nomeando `arquivo:linha`.
**`while` é partido em três classes, cada uma com critério textual
próprio, e nenhuma delas é o ramo de sobra das outras:** atribuição
de `.exec(` é `while-exec-match`; não-vaziez da própria coleção é
`while-queue-drain`; cursor escalar contra limite é
`while-positional-read`; cabeçalho fora dos três **reprova**. Sobre a
árvore real o resíduo é **zero**: **41** `for-of`, **55**
`for-indexed`, **18** `while-exec-match`, **5**
`while-positional-read` (`:1458`, `:1484`, `:2989`, `:2996`, `:2999`)
e **1** `while-queue-drain` (`:1028`); `for-in` e `do-while` são
vazios na árvore real e exercidos por fonte sintética.

**A classe iteração sobre candidatos exige registro nomeado; a classe
leitura posicional é isenta pelo critério computado.**
`CONTINUE_CANDIDATE_LOOP_FORMS` (`for-of`, `while-exec-match`,
`while-queue-drain`) exige motivo não vazio no registro;
`for-indexed` e `while-positional-read` (leitura posicional) são
isentas sem registro por ocorrência. `DOCUMENTED_SILENT_DISCARDS`
cresceu de **5** para **43** entradas, cobrindo as **60** ocorrências
reais da classe candidata — a 60ª é `http-egress-sites.ts:1028`,
descarte de candidato dentro de um `while` que drena fila, isento em
bloco até a rodada 1 deste Goal. A mesma conta
(`findSilentDiscardFindings`) roda sobre a árvore real com as quatro
saídas vazias: `ambiguousKeys`, `unregistered`, `obsolete` e
`emptyReason`.

**A chave sobrevive à forma nua por multiplicidade declarada.**
`continue;` nu normaliza sempre para a mesma string, e a sondagem
achou a colisão de fato — até **7** ocorrências nuas na mesma função.
`SilentDiscardEntry.multiplicity` declara quantas ocorrências
legítimas compartilham a chave; `findSilentDiscardFindings` reprova
por ambiguidade quando a contagem real diverge da declarada, nos dois
sentidos, sem ler número de linha.

**Vacuidade não é aceita como prova.** As duas classes vazias na
árvore real (`for-in`, `do-while`) e o contexto léxico não-`code` são
exercidos por fonte sintética dedicada; as **cinco** classes
presentes têm contagem maior que zero asserida diretamente.

**O ponteiro de prosa de `:3483` foi corrigido**, passando a citar
`:4314` em vez de `:4199` — correção de uma linha, nenhuma asserção
mudou.

**Os oito controles negativos do escopo §9 mordem**
(`assistant.service.test.ts:10202` a `:10552`), cada um chamando a
mesma conta que o teste permanente chama: descarte novo em laço de
candidatos reprova; `continue;` nu não registrado reprova; laço de
forma não reconhecida reprova; entrada obsoleta reprova; motivo vazio
reprova e chave duplicada continua lançando; deslocamento de linha
continua não reprovando em massa; mover um `continue;` entre classes
muda a exigência de registro nos dois sentidos; e a partição do
Goal050/051 e a cobertura do Goal049 continuam mordendo.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de
§28. **Nenhuma mudança em relação a §28**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção
deste fork foi editado por este Goal.

**Limite próprio deste Goal, declarado e não mascarado, herdado de
D-065/D-066/D-067 sem afrouxamento.** Registrar um descarte com motivo
escrito diz que ele está nomeado e justificado, não que o candidato
descartado não importava — a conservação de candidatos **dentro** das
funções de varredura de `http-egress-sites.ts` continua fora de
alcance de qualquer mecanismo desta rodada. A enumeração não se
estende a `return`, `break` ou saída antecipada de função: o alcance é
`continue;`, e o que fica fora continua declarado como fora, agora com
o número computado em vez de estimado. Consequência mensurável: de
**249** testes em `assistant.service.test.ts` (baseline: 227), **249**
passam, **0** falham; o arquivo tem **10553** linhas
(baseline: 8718), **1948** inserções e **113** deleções.
`http-egress-sites.ts` está intocado (diff zero; **3887** linhas,
mesma contagem da baseline). A suíte completa de `apps/ai-orchestrator`
fecha em **1061** testes: **973** passando (baseline: 951), **88**
pulados (mesma contagem da baseline), **0** falhando. `npx tsc -p
tsconfig.json --noEmit`: "TypeScript: No errors found", exit 0. `npm
run lint` (`eslint src --max-warnings=0`): exit 0, sem saída. `npm run
validate:core` **PASSED**: dos 17 passos, **15** passaram (inclusive
`test:ai-orchestrator`) e **2** pulados por design (`test:bff`,
`test:health-worker`); nenhum falhou. `npm run test:gate` (raiz):
**226** testes, **226** passando, **0** falhando, inalterado, porque
não exercita este arquivo.

Quatro coisas que esta seção não diz. **Não diz que A-24 foi
corrigido**: o rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real; o diff052 toca só
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` e a
documentação de migração — `git status --porcelain=v1 -uall` não lista
nenhum arquivo de `tools/ia-loop/` nesta rodada. **Não diz que o
comportamento em runtime do serviço Go foi provado**: o que se prova é
o que a árvore de código diz, lida por enumeração de ocorrência sobre
o texto-fonte. **Não diz que a fidelidade visual está provada**:
nenhum arquivo de `apps/frontend/src/` mudou.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção;
`whatsmeow-lib/`, biblioteca vendorizada lida apenas como fonte das
declarações de proto; o valor real de qualquer variável de ambiente;
`return`, `break` e saída antecipada de função, nunca alcançados pela
enumeração desta rodada; e conservação de candidatos dentro das
funções de varredura de `http-egress-sites.ts`, declarada e limitada
desde o escopo §4 do Goal050 e reafirmada aqui (ver "Limite próprio"
acima). `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente — não reexecutado além da conferência de exit code por
esta unidade de documentação (WU-08).

## 30. O critério da isenção passa a ser o domínio percorrido, não a forma do cabeçalho: leitura posicional sobre coleção de elementos deixa de ser isenta — Goal053, 2026-09-22

Seção nova, escrita depois da execução final do diff053 (WU-01: resolução
de domínio computada do texto do módulo; WU-02: ligação do critério de
isenção ao registro unificado; WU-03: os oito controles negativos
permanentes do escopo §9; WU-07, esta unidade, documenta por acréscimo).
Ela **não reescreve** §4 a §29: os registros de A-01 a A-24, o veredito
das seções anteriores e as vinte e nove seções de fechamento continuam
exatamente como estavam, e a entrada de **A-24** **não foi tocada**. Este
Goal não corrige A-24 e não abre achado novo — fecha o degrau que sobrou
dentro do próprio §29: a classe de laço que o Goal052 computava media a
**forma sintática do cabeçalho**, não o **domínio que o cursor percorre**,
e a observação 1 do [review052](reviews/052-review.md) apontou um
fail-open real, não hipotético, medido sobre **6** ocorrências.

### O que mudou

**Cada ocorrência em contexto `code` ganha um domínio percorrido,
computado do texto do módulo.** `resolveContinueCursorDomain` entra no
caminho já existente (`enumerateContinueOccurrences` →
`enumerateSilentDiscardOccurrences` → `findSilentDiscardFindings`), nunca
como segunda varredura. O vocabulário fechado `CONTINUE_CURSOR_DOMAINS`
tem quatro classes: **sequência de caracteres**, **máscara paralela**,
**coleção de elementos** e **sem domínio** (as três classes já portadoras
de candidato do Goal052, que não indexam cursor algum). Para as três
primeiras classes, a evidência que concedeu o domínio é registrada por
ocorrência, citando `arquivo:linha` da ligação que a provou; as **60**
ocorrências `no-domain` não citam ligação alguma, porque o laço já
consome candidato diretamente — sua evidência nomeia a forma do laço e
o cabeçalho (`laço \`<forma>\` não avança por cursor escalar indexado:
consome o que percorre diretamente`). `parallel-mask` tem duas provas:
(a) o comprimento do arranjo vem do comprimento de uma sequência de
caracteres; (b) o mesmo cursor indexa o arranjo **e** uma sequência de
caracteres no mesmo corpo, mesmo sem a forma do arranjo provar relação
alguma com `.length` — a prova (b) amplia a isenção, porque sem ela
esse arranjo reprovaria como resíduo. Sobre a árvore real: **60** `no-domain`, **54**
`character-sequence`, **6** `element-collection`, **0** `parallel-mask` —
soma **120**, igual ao total de ocorrências de código; `parallel-mask`
computa **0** porque a única máscara paralela da árvore (prova (b))
compartilha cursor com uma sequência de caracteres, e a precedência de
aperto dá o domínio final à sequência; prova (b) é exercida pela
árvore real (mascarada pela precedência), só prova (a) precisa de
fonte sintética.

**A isenção de registro passa a depender do domínio, não mais só da
classe do cabeçalho.** Domínio `character-sequence` ou `parallel-mask`
continua isentando leitura posicional; domínio `element-collection` passa
a exigir registro mesmo em `for-indexed`; domínio não resolvido, ou fora
do vocabulário, **reprova** nomeando `arquivo:linha` e o motivo — nenhum
ramo `else` mudo.

**As 6 ocorrências sobre `lines` (`:1141`, `:1143`, `:1157`, `:1159`,
`:1160`, `:3872`), produzido por `.split(…)`, passam a exigir registro.**
`DOCUMENTED_SILENT_DISCARDS` cresceu de **43** para **47** entradas: as 2
entradas herdadas de `readEnvSchemaDefault` — que já existiam com motivo
escrito, mas com `requiresRegistration` computado `false`, de modo que
removê-las não reprovava nada — são reaproveitadas e agora conferidas de
verdade; as 4 entradas novas cobrem `readEnvFileValue` (3 ocorrências) e
`readProductTransportRoutesFile` (1 ocorrência).

**`while` posicional continua isento pelo mesmo critério, não mais pela
forma.** As **5** ocorrências reais (`:1458`, `:1484`, `:2989`, `:2996`,
`:2999`) continuam isentas porque o domínio que indexam é
`character-sequence`; a prova de que a mesma forma sobre
`element-collection` passaria a exigir registro é por fonte sintética.

**Nada do Goal052 foi afrouxado.** `for-of` (**41**), `while-exec-match`
(**18**) e `while-queue-drain` (**1**) continuam exigindo registro
independentemente do domínio — nenhuma delas indexa cursor algum, então
todas caem em `no-domain`, e `no-domain` não isenta.

**Os oito controles negativos do escopo §9 mordem**, cada um chamando a
mesma conta que o teste permanente chama: `continue;` sobre coleção de
elementos não registrado reprova; `for-indexed` sobre sequência de
caracteres continua isento e a mesma guarda sobre coleção exige registro
(as duas saídas); `while` posicional sobre coleção reprova e sobre string
continua isento (as duas saídas); domínio não resolvido ou fora do
vocabulário reprova; entrada que perde a ocorrência reprova como obsoleta
e motivo vazio reprova; deslocamento de linha continua não reprovando em
massa; nenhuma ocorrência que já exigia registro por classe deixou de
exigir; e a partição do Goal050/051 e a cobertura do Goal049 continuam
mordendo.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de §29.
**Nenhuma mudança em relação a §29**: nenhum achado de A-01 a A-24 foi
tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção deste
fork foi editado por este Goal.

**Limite próprio deste Goal, declarado e não mascarado, herdado de
D-065/D-066/D-067/D-068 sem afrouxamento.** O domínio resolve **o que o
cursor indexa**, não **se o descarte perde candidato que importe**; a
conservação de candidatos **dentro** das funções de varredura de
`http-egress-sites.ts` continua fora de alcance de qualquer mecanismo
desta rodada. Consequência mensurável: `assistant.service.test.ts` cresce
de **249** para **255** testes, todos passando, **0** falhando, com
**11631** linhas (baseline: **10553**), **1115** inserções e **37**
deleções contra a baseline `2adb7cabf2cc09707287e1d440d6041b51d6cfe9`.
`http-egress-sites.ts` está intocado (diff zero; **3887** linhas, mesma
contagem da baseline). A suíte completa de `apps/ai-orchestrator` fecha em
**1067** testes: **979** passando (baseline: **973**), **88** pulados
(mesma contagem da baseline), **0** falhando. `npx tsc -p tsconfig.json
--noEmit`: sem saída, exit 0. `npm run lint` (`eslint src
--max-warnings=0`): exit 0, sem saída. `npm run test:gate` (raiz): **226**
testes, **226** passando, **0** falhando, inalterado, porque não exercita
este arquivo. `validate:integration` não foi reexecutado nesta unidade:
nada no diff toca banco, infraestrutura ou pré-condição, então o
comportamento herdado da baseline não muda.

Três coisas que esta seção não diz. **Não diz que A-24 foi corrigido**: o
rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/`,
`apps/ai-orchestrator/src/`, `apps/evolution-go/`, `packages/` ou
`tools/ia-loop/` mudou nesta Work Unit. **Não diz que a conservação de
candidatos dentro das funções de varredura foi provada**: registrar um
descarte com motivo escrito diz que ele está nomeado e justificado, não
que o candidato descartado não importava.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-lib/`,
lida apenas como fonte das declarações de proto; o valor real de qualquer
variável de ambiente; `return`, `break` e saída antecipada de função,
nunca alcançados pela enumeração; e conservação de candidatos dentro das
funções de varredura de `http-egress-sites.ts`, declarada e limitada desde
o escopo §4 do Goal050 e reafirmada aqui.

## 31. O alfabeto do descarte é completo: `break` e saída antecipada de função deixam de ser invisíveis, e as formas vazias (`switch-break`, rótulo) são reconhecidas por cômputo — Goal054, 2026-09-22

Seção nova, escrita depois da execução final do diff054 (WU-001 a WU-006
implementam o alfabeto, a fronteira de função, as formas vazias, a
exigência estendida, o motivo das ocorrências reais e os controles
negativos; WU-007, esta unidade, documenta por acréscimo). Ela **não
reescreve** §4 a §30: os registros de A-01 a A-24, o veredito das seções
anteriores e as trinta seções de fechamento continuam exatamente como
estavam, e a entrada de **A-24** **não foi tocada**. Este Goal não corrige
A-24 e não abre achado novo — fecha o degrau que o §29 e o §30 declararam,
em prosa, como fora do alcance: "`return`, `break` e saída antecipada de
função, nunca alcançados pela enumeração" (parágrafo final do §30, acima).

### O que mudou

**A enumeração passa a percorrer um vocabulário fechado de cinco formas**
(`DISCARD_FORMS`, `assistant.service.test.ts:8056`): `continue`, `break`,
`function-early-exit` (saída antecipada da função que contém o cabeçalho
do laço), `nested-function-return` (`return` de função aninhada no corpo
do laço, que não abandona candidato algum) e `switch-break` (`break` cujo
bloco de controle mais próximo é um `switch`, não um laço). Forma fora do
vocabulário **reprova**, nomeando `arquivo:linha`.

**A fronteira de função é computada, nunca presumida.** `return` só conta
como saída antecipada quando a função mais próxima que o contém é a mesma
que contém o cabeçalho do laço; `return` de função aninhada — expressão de
função, arrow com corpo em bloco, método de objeto literal — volta da
aninhada, e o laço segue percorrendo o domínio. A resolução é por
casamento de delimitadores sobre texto mascarado, nunca por indentação ou
nome de função. Fronteira não resolvida **reprova**, nomeando
`arquivo:linha` e o motivo.

**`switch-break` e forma rotulada são reconhecidos por cômputo.** `break`
cujo bloco mais próximo é um `switch` não abandona laço algum, mesmo
quando o `switch` está dentro de um, e a isenção é computada com evidência
própria (`formExemptionEvidence`) — nunca silêncio. `break`/`continue`
rotulado é resolvido ao laço que declara o rótulo ou reprova como resíduo
nomeado.

**A exigência de motivo combina forma, classe de laço e domínio, sem
afrouxar o que o Goal053 provou:** `character-sequence` e `parallel-mask`
continuam isentos em qualquer forma; `element-collection` exige registro
em qualquer forma; as classes já portadoras de candidato do Goal052
(`for-of`, `while-exec-match`, `while-queue-drain`) continuam exigindo
registro independentemente do domínio, em qualquer forma; `switch-break` e
`nested-function-return` nunca exigem registro, porque não abandonam laço
algum.

**As ocorrências reais que passam a exigir registro ganham motivo
escrito.** Sobre a árvore real, conferido por execução: **6** ocorrências
novas exigem registro — **3** de `break` (`:591` `while-exec-match`,
`:2037` `for-of`, `:2316` `while-exec-match`, por classe portadora de
candidato) e **3** de `function-early-exit` (`:576` `for-of`, por classe
portadora; `:1144` e `:1161` `for-indexed` sobre domínio
`element-collection`). `DOCUMENTED_SILENT_DISCARDS` cresceu de **47** para
**53** entradas, sem duplicar as existentes, com chave que distingue
forma.

**Vacuidade não é aceita como prova.** Sobre a árvore real: **143**
ocorrências em contexto `code` — `continue` **120**, `break` **6**,
`function-early-exit` **17**. `nested-function-return` e `switch-break`
computam **0** (ausentes na árvore real) e são exercidas por fonte
sintética. `unresolved` e `outsideVocabulary` seguem vazias.
`byCursorDomain` reconstrói o total: `no-domain` **64**,
`character-sequence` **71**, `element-collection` **8**, `parallel-mask`
**0** — soma **143**, igual ao total de ocorrências de código.

**`throw` fica fora do alcance, declarado, não como resíduo**: aborta a
execução inteira e é ruidoso por construção, não é descarte silencioso de
candidato, e não foi enumerado.

**A observação 1 do [review053](reviews/053-review.md) é fechada.** A
lista de evidências de `character-sequence` em
[CURRENT_STATE](CURRENT_STATE.md) passa a nomear os cinco ramos que
`resolveIndexedBaseShape` de fato tem, cada um citando o `arquivo:linha`
do ramo em `assistant.service.test.ts` que o sustenta — ver a seção nova
de [CURRENT_STATE](CURRENT_STATE.md).

**A conta continua sendo uma só.** As formas novas entram dentro do
caminho já existente (`enumerateDiscardOccurrences` →
`enumerateSilentDiscardOccurrences` → `findSilentDiscardFindings`), nunca
como segunda varredura. Nada do Goal052 e do Goal053 foi afrouxado: o
total de **120** ocorrências de `continue;`, a soma por classe de laço e
por domínio, e os oito controles negativos do Goal053 continuam passando,
adaptados ao alfabeto novo — nenhum caso de teste foi removido.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de §29 e
§30. **Nenhuma mudança em relação a §30**: nenhum achado de A-01 a A-24
foi tocado, corrigido, reclassificado ou reaberto. **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido** — nenhum arquivo Go de produção deste
fork foi editado por este Goal.

**Limite próprio deste Goal, declarado e não mascarado, herdado de
D-065/D-066/D-067/D-068/D-069 sem afrouxamento.** Registrar um `break` ou
uma saída antecipada com motivo escrito diz que o abandono está nomeado e
justificado, não que o candidato abandonado não importava — a conservação
de candidatos **dentro** das funções de varredura de
`http-egress-sites.ts` continua fora de alcance de qualquer mecanismo
desta rodada. Consequência mensurável: `assistant.service.test.ts` cresce
de **255** para **283** testes, todos passando, **0** falhando, com
**14236** linhas (baseline: **11631**), **2820** inserções e **215**
deleções contra a baseline `d3e76645d3042e66eb9559f33fef9dda40904809`.
`http-egress-sites.ts` está intocado (diff zero; **3887** linhas, mesma
contagem da baseline). A suíte completa de `apps/ai-orchestrator` fecha em
**1095** testes: **1007** passando (baseline: **979**), **88** pulados
(mesma contagem da baseline), **0** falhando. `npx tsc -p tsconfig.json
--noEmit`: sem saída, exit 0. `npm run lint` (`eslint src
--max-warnings=0`): exit 0, sem saída. `npm run test:gate` (raiz): **226**
testes, **226** passando, **0** falhando, inalterado, porque não exercita
este arquivo. `validate:integration` não foi reexecutado nesta unidade:
nada no diff toca banco, infraestrutura ou pré-condição, então o
comportamento herdado da baseline não muda.

Três coisas que esta seção não diz. **Não diz que A-24 foi corrigido**: o
rótulo `"Ver Menu"` continua escrito em
`pkg/sendMessage/service/send_service.go:1960`. **Não diz que M4 foi
fechado**: nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/`,
`apps/ai-orchestrator/src/`, `apps/evolution-go/`, `packages/` ou
`tools/ia-loop/` mudou nesta Work Unit. **Não diz que a conservação de
candidatos dentro das funções de varredura foi provada**: registrar um
descarte com motivo escrito diz que ele está nomeado e justificado, não
que o candidato descartado não importava.

O que continua fora do alcance deste Goal, por construção: comportamento
em runtime do serviço Go; qual binário roda em produção; `whatsmeow-lib/`,
lida apenas como fonte das declarações de proto; o valor real de qualquer
variável de ambiente; `throw`, por não ser descarte silencioso; e
conservação de candidatos dentro das funções de varredura de
`http-egress-sites.ts`, declarada e limitada desde o escopo §4 do Goal050
e reafirmada aqui.

## 32. A isenção é provada pelo que o descarte abandona: ocorrência isenta cuja região abandonada produz saída deixa de ser isenta em silêncio — Goal055, 2026-09-26

Seção nova, escrita depois da execução final do diff055 (rodada 2,
FIX-001). Ela **não reescreve** §4 a §31: os registros de A-01 a A-24, o
veredito das seções anteriores e as trinta e uma seções de fechamento
continuam exatamente como estavam, e a entrada de **A-24** **não foi
tocada**. Este Goal não corrige A-24 e não abre achado novo — fecha o
consequente que o §30 e o §31 deixaram em prosa: a isenção por domínio
dizia "cada volta avança leitura, nunca descarta candidato", e nada o
conferia. Decisão: [D-071](DECISIONS.md), `ACCEPTED` no
[review055](reviews/055-review.md) (rodada 2 de 2).

### O que mudou

**A região abandonada é computada por ocorrência**
(`resolveDiscardAbandonedRegion`, `assistant.service.test.ts:8251`), por
casamento de delimitadores sobre o mesmo texto mascarado: `continue` e
`break` até o fim do corpo do laço contenedor (o laço do rótulo, quando
há rótulo — só a volta corrente é provada; que `break` abandone também as
voltas seguintes é declarado em comentário, não computado);
`function-early-exit` do fim da instrução `return` até o fim do corpo da
função; `switch-break` e `nested-function-return` sem região. Região não
resolvida reprova nomeada no mesmo resíduo de classe, domínio e fronteira
(`findDiscardEnumerationFindings`, `:9815`–`:9834`).

**A produção é vocabulário fechado** (`DISCARD_PRODUCING_OPERATIONS`,
`:8323`: `push`, `add`, `set`), conferido nos dois sentidos contra a
árvore real — **51** `push`, **14** `add`, **5** `set`, **70** sítios, **0**
fora do vocabulário. Operação reconhecida fora dele (`unshift`, `splice`,
`append`, `DISCARD_RECOGNIZED_INSERTION_METHODS`, `:8343`) reprova
nomeada.

**A função produtora é resolvida por fecho transitivo, uma vez por
arquivo** (`buildDiscardModuleProduction`, `:8647`, chamado só por
`enumerateDiscardAnalysis`, `:9433`): **89** funções de módulo, **23**
produtoras diretas, **28** pelo fecho (**5** só pelo fecho), **1** volta
até o ponto fixo, fecho estável (reaplicar `expandDiscardProducersOnce`
não muda o conjunto). Chamada cujo destino não é função de módulo não é
produção — limite declarado, ramo `if (!site.calleeIsModuleFunction)`
(`:8675`) e filtro de `findDiscardRegionProduction` (`:8785`).

**A exigência ganha um quinto eixo que só retira isenção**
(`resolveSilentDiscardRequirement`, `:11077`; eixo 5 em `:11084`), depois
dos quatro do Goal054, intocados em
`resolveSilentDiscardRequirementByFourAxes` (`:10945`). Sobre as **143**
ocorrências de código da árvore real, conferido por execução no teste
permanente do Goal055: **63** isentas com região livre e as duas
evidências; **8** desisentadas por produção direta na região (**0** por
chamada a função produtora); **72** que os quatro eixos já mandavam
registrar e continuam exigindo; **0** resíduo; **0** ocorrência que
passou de exigida a isenta.

**As 8 ocorrências que mudaram de lado ganham motivo substantivo:**
`splitTopLevelItems` `:225`, `:228`, `:232`, `:236`, `:240`;
`splitTemplateLiteralParts` `:1458` e `:1479`; `findTopLevelMethodBodies`
`:2989`. A sondagem do Goal previa **6**; as duas a mais estão em
[D-071](DECISIONS.md). `DOCUMENTED_SILENT_DISCARDS` passa de **53** para
**57** entradas, sem duplicar, remover ou reescrever entrada anterior.

**O que o Goal054 provou continua provado:** **143** ocorrências —
`continue` **120**, `break` **6**, `function-early-exit` **17** —,
`byCursorDomain` `no-domain` **64**, `character-sequence` **71**,
`element-collection` **8**, `unresolved` e `outsideVocabulary` vazias.

### Veredito recontado

Esta auditoria continua com **0** achados `BLOQUEADOR-MVP`, **8**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` — a mesma contagem de §29,
§30 e §31. Nenhum achado de A-01 a A-24 foi tocado, corrigido,
reclassificado ou reaberto. **A-24 continua `PENDENCIA-POS-MVP`, não
corrigido.**

**Limite próprio deste Goal, declarado:** o eixo 5 prova que a região
abandonada de uma ocorrência isenta não contém produção; não prova
conservação de candidatos dentro das funções de varredura na forma geral
(herdado de D-065 a D-070), e não trata chamada a função fora do módulo
como produção. Consequência mensurável: `assistant.service.test.ts` passa
de **283** para **299** testes, **299** passando, **0** falhando, com
**16034** linhas (baseline **14236**), **1810** inserções e **12**
deleções contra a baseline `0851b3362ced899954a5f19600e2a06944e6a913`
(`git diff --histogram --numstat`). `http-egress-sites.ts` e
`product-transport-routes.txt` estão intocados (diff zero). A suíte
completa de `apps/ai-orchestrator` fecha em **1111** testes: **1023**
passando (baseline **1007**), **88** pulados (mesma contagem), **0**
falhando. `npm run typecheck` (`prisma generate && tsc -p tsconfig.json
--noEmit`): exit 0. `npm run lint`: exit 0, sem saída. `npm run
test:gate` (raiz): **226** testes, **226** passando, **0** falhando.
`npm run validate:core`: exit 0. `npm run validate:integration`: `exit
2`, `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set` —
pré-condição ausente, inalterada.

Três coisas que esta seção não diz. **Não diz que A-24 foi corrigido.**
**Não diz que M4 foi fechado**: nenhum arquivo de `apps/*/src/`,
`apps/evolution-go/`, `packages/` ou `tools/ia-loop/` mudou. **Não diz
que a produção pulada pelas 8 ocorrências não importava**: o motivo
escrito diz que o abandono está nomeado e justificado.

## 33. A-24 é corrigido: o serviço Go recusa `ButtonText` vazio em vez de compor `"Ver Menu"` — Goal056, 2026-09-26

Seção nova, escrita depois da execução final do diff056. Ela **não
reescreve** §4 a §32: os registros de A-01 a A-23 continuam exatamente
como estavam. Este Goal corrige **um único achado, A-24**: o único
`PENDENCIA-POS-MVP` das sete outras (A-04 a A-08, A-13, A-14) mais A-24
que a árvore de código consegue fechar sem deploy, credencial da origem
Minha Agenda, número WhatsApp real ou provider de e-mail. Decisão:
[D-072](DECISIONS.md), `ACCEPTED` no [review056](reviews/056-review.md)
(rodada 5 de 5).

### O que mudou

**O fork de transporte deixa de compor prosa de produto.** O literal que
o §19 registrava em `pkg/sendMessage/service/send_service.go:1960`
("Ver Menu") não existe mais na árvore: `grep -rn '"Ver Menu"'
apps/evolution-go --include=*.go`, excluindo `whatsmeow-lib/` e
`_test.go`, não acha nenhuma ocorrência em código de produção. `SendList`
(`:1953`–`:1955`) devolve `fmt.Errorf("button text is required")`
quando `ButtonText` chega vazio, antes de qualquer uso de cliente,
instância ou rede; a mesma mensagem que o handler já devolvia
(`send_handler.go:616`–`:618`). `sectionsToString` (`:1878`) não ganha
recusa: o Goal só manda retirar a fallback que ela compunha, e o valor
recebido segue sem transformação para `Title: data.ButtonText`; a função
continua sem chamador — `grep -rn sectionsToString apps/evolution-go --include=*.go`
só acha a declaração — e não foi apagada, por não ser escopo deste Goal.

**O guard recomputa um conjunto menor, sem edição de expectativa.**
`go test ./pkg/transportguard/...`: `PASS` no pacote inteiro.
`expectedGoProseLiterals` e
`expectedProseLiteralsReachedFromRegisteredRoutes` perdem a entrada
`"Ver Menu"` e passam de **27** para **26** entradas cada, nas mesmas
**5** rotas (`POST /send/media`, `POST /send/button`, `POST /send/list`,
`POST /send/carousel`, `POST /send/status/media`); as demais entradas
mudam só de linha, nunca de conteúdo, campo ou rota.
`TestEveryReachedLiteralIsAMemberOfTheGoal042Set` confirma **26**
literais alcançando o transporte, todos de rota registrada.
`expectedProseLiteralsReachedFromProductRoutes` continua vazio, e o
arquivo de **10** rotas do produto
(`apps/ai-orchestrator/tests/support/product-transport-routes.txt`) está
com diff zero — a fronteira que o Goal043 provou (§20) não muda.
`TestNoRouteThatReachesTheProductProseLiteralIsReachedByTheProduct` é
substituído por `TestGoal056RemovesTheProductProseLiteralFromTheTree`,
que prova, sobre os dois conjuntos que `GoProseLiteralsReachingTransport()`
e `ProseReachOfEveryRegisteredRoute()` computam — não sobre "a árvore"
inteira, que inclui `whatsmeow-lib/` e `_test.go`, fora do alcance do
guard —, que nenhum literal Go não vazio escreve no campo `ButtonText`,
por campo e não só por conteúdo: o controle negativo abaixo reproduz o
rótulo original `"Ver Menu"` e, num segundo passo, um rótulo diferente
(`"Abrir"`), e os dois reprovam pelo mesmo teste. A checagem por
conteúdo de `"Ver Menu"` continua, como a instância que o Goal042
nomeou, e `expectedGoProseLiterals` não assere esse conteúdo em nenhuma
entrada.

**A escrita de `ListMessage.ButtonText` sai do conjunto fora do relé.**
`expectedOffRelaySources` (`off_relay_test.go`) — o conjunto de escritas
em campo portador cuja origem não é o corpo relayed da requisição —
perde a entrada `pkg/sendMessage/service/send_service.go:1996`,
`ListMessage.ButtonText`, `SourceBranchDependent`: a escrita final está
em `:1990`, com categoria computada `SourceRouteBody`
(`value_from_route_body_parameter`) — a mesma categoria que o relé de
outras rotas já tem, e por isso deixa de ser candidata ao conjunto —
não foi recategorizada para outra categoria fora do relé, foi removida.
As demais entradas do arquivo mudam só de linha.

**O contrato escrito passa a dizer o que o handler faz.** O comentário
do campo (`send_service.go:256`), o `@Description` do handler
(`send_handler.go:568`), `docs/docs.go`, `docs/swagger.json`,
`docs/swagger.yaml` (nas duas posições de cada um) e as linhas de
`buttonText`, `title` e `footerText` da tabela de
`docs/wiki/guias-api/api-interactive.md` (`:200`–`:202`)
passam a dizer que `buttonText`, `title` e `footerText` são
obrigatórios e que vazio devolve `400` — a mesma linha que o handler já
exigia (`:601`, `:611`, `:616`–`:618`) e que a tabela da wiki marcava
como opcional para as três colunas.

**O comportamento é provado por teste Go.**
`apps/evolution-go/pkg/sendMessage/service/send_service_list_test.go`
(novo, `_test.go`, fora da enumeração de produção do guard):
`TestSendList_EmptyButtonText_ReturnsErrorBeforeUsingClient` — `PASS`.
Um segundo caso, provando `ButtonText` não vazio intacto até o ponto de
montagem, não é viável sem fabricar dependência: `listMessage` é
variável local (`send_service.go:1987`–`:1994`) passada direto para
`s.SendMessage(instance, msg, ...)` (`:2001`), que depende de `instance`
e do cliente WhatsApp real — não há ponto de observação antes do envio.

**Controle negativo executado e revertido.** Executado de forma
independente na rodada de correção que fechou §32's blockers (FIX-001,
rodada 4), sobre a árvore já corrigida (`8d37112`): o `if
data.ButtonText == "" { return ... }` (`:1953`–`:1955`) foi substituído
por `buttonText := data.ButtonText; if buttonText == "" { buttonText =
"Ver Menu" }`, e o campo `ButtonText` (`:1990`) voltou a ler
`proto.String(buttonText)` — as duas trocas juntas, senão o pacote não
compila. `go test ./pkg/transportguard/...` reprova em quatro testes:
`TestGoProseLiteralsReachingTransportAreAssertedElementByElement`
(`go_prose_test.go:93`, `send_service.go:1955` escrevendo `"Ver Menu"`
em `[ButtonText]`), `TestOffRelaySourceSetIsAssertedElementByElement`
(`off_relay_test.go:180`, `send_service.go:1991`,
`ListMessage.ButtonText` com origem `value_bound_differently_per_branch`),
`TestProseLiteralsReachedFromEveryRegisteredRouteAreAssertedElementByElement`
(`route_reach_test.go:251`, `POST /send/list` alcançando
`send_service.go:1955`) e `TestGoal056RemovesTheProductProseLiteralFromTheTree`
(`route_reach_test.go:292`, mesmo `send_service.go:1955`). As entradas
seguintes reprovam só por deslocamento de uma linha (`:1962`/`:1968` →
`:1963`/`:1969`; `:1975`/`:1977`/`:1981` → `:1976`/`:1978`/`:1982`), sem
mudar de conteúdo, campo ou rota. Com um segundo
rótulo, `"Abrir"`, no mesmo ponto, reprova pelos mesmos quatro testes,
pelo campo em vez do conteúdo. Revertido cada um,
`go test ./pkg/transportguard/... ./pkg/sendMessage/...` confirma `PASS`
depois da restauração, sem resto na árvore (`git diff --stat
apps/evolution-go/pkg/sendMessage/service/send_service.go` confere com
o diff real desta Work Unit, **+5/-11**).

**A contagem de arquivos de produção não mudou com o teste novo.**
`send_service_list_test.go` é `_test.go` e fica fora da enumeração de
`DiscoverProductionGoFiles` (`pkg/transportguard/sources.go:60`,
`hasTestSuffix`). Rodando essa função sobre a árvore (teste temporário
que a chama e loga `len(files)`, removido depois de conferir), a
contagem é **65** tanto na baseline `4041db2` quanto na árvore final
desta Work Unit. O total de arquivos `.go` de `pkg/` e `cmd/` (produção
mais teste, fora `whatsmeow-lib/`) sobe de **90** para **91** no mesmo
intervalo — o **+1** exato do arquivo de teste novo.

### Veredito recontado

Esta auditoria passa a ter **0** achados `BLOQUEADOR-MVP`, **7**
`PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO`. A mudança em relação a
§32 é **uma**: **A-24 corrigido**, de `PENDENCIA-POS-MVP` para fechado.
Nenhum achado de A-01 a A-23 foi tocado, corrigido, reclassificado ou
reaberto, e nenhum dos sete `PENDENCIA-POS-MVP` restantes (A-04 a A-08,
A-13, A-14) foi tocado — continuam dependendo de deploy real, credencial
da origem Minha Agenda, número WhatsApp real, provider de e-mail ou
conhecimento de operação, como §6 já registrava.

Três coisas que este recontar não diz. **Não diz que o comportamento
em runtime do serviço Go foi provado**: o que se prova é o que a árvore
de código diz, lida por `go test` e por AST; nada aqui abre conexão
whatsmeow ou observa o que chega a um telefone. **Não diz que M4 foi
fechado**: nenhuma chamada saiu para provedor de LLM real nem para o
WhatsApp real, e o diff056 toca `send_service.go`, `send_handler.go` (só
comentário), três testes de `pkg/transportguard/`, um teste novo de
`pkg/sendMessage/service/`, `docs.go`, `swagger.json`, `swagger.yaml`,
`api-interactive.md` e a documentação de migração — nada além disso.
**Não diz que a persistência foi validada nesta rodada**: `npm run
validate:integration` continua fora do escopo deste Goal e não foi
reexecutado por esta seção.

Execução conferida por esta Work Unit: `go test ./pkg/transportguard/...`
`PASS`; `go test ./...` em `apps/evolution-go` — **62** testes de topo
(**175** com subtestes), **0** falhando; `npm run validate:core` — **15**
passos `passed`, **2** `skipped` (`test:bff`, `test:health-worker`, o
mesmo par já reportado pulado desde §32), **0** `failed`, exit 0; `npm
run test:gate` — **226** testes, **226** passando, **0** falhando, mesma
contagem da baseline.

## 34. QA A-01 e QA H-09 são corrigidos: a resposta não afirma efeito não gravado, e a Home conta agendamento, não reserva — Goal057, 2026-09-27

Seção nova, escrita depois da execução desta Work Unit sobre o diff057. Ela **não reescreve** §4 a §33: os registros de A-01 a A-24 em §19, o veredito das seções anteriores e as trinta e duas seções de fechamento anteriores continuam exatamente como estavam. **QA A-01** e **QA H-09** vêm do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entram nessa contagem**. Decisão: [D-073](DECISIONS.md), `ACCEPTED` no [review057](reviews/057-review.md) (rodada 5 de 5).

### O que mudou

**QA A-01 — a IA não afirma mais agendamento, remarcação ou cancelamento que o turno não gravou.** `guardCommitmentClaim` (`apps/ai-orchestrator/src/modules/assistant/assistant.service.ts:952`), chamado por `completeGraphTurn` (`:881`) antes de `prisma.message.create`, bloqueia a saída quando o texto do modelo afirma um efeito (`findCommitmentClaims`, `:428`, vocabulário fechado em `COMMITMENT_CLAIM_VOCABULARY`, `:343`), há `pendingAction` do tipo correspondente ainda não consumido, e nenhuma `AiToolCall` `SUCCEEDED` deste `AiRun` confirmou o efeito (`loadTurnConfirmedEffects`, `:1584`, lendo o ledger — nunca o JSON da decisão). Na violação, a mensagem persistida é o texto fixo `PRODUCT_OWN_FIXED_TEXTS.commitmentNotRecorded` (`:305`): `"Ainda nao ficou registrado na agenda. Posso confirmar agora pra voce?"`. O caso real de QA A-01 — `prepare` sem `confirm`, cliente escreve "Confirmo", modelo responde sem chamar tool — é reproduzido por `tests/evals/commitment-claim.eval.test.ts` (**8** testes, **8** passando), que prova pelo runtime do `AssistantService` real: a `Message` persistida é o texto fixo, nenhum `Appointment` chega ao gateway do dublê, e o log `warn` existe sem o texto da cliente nem o do modelo. Os casos de remarcação e cancelamento cobrem tanto o vocabulário dedicado ("remarcado", "Cancelei") quanto o vocabulário genérico de confirmação sem chamar a tool de confirmação, no formato real de QA A-01 depois de "Posso confirmar?" ("Pronto, sua remarcação foi confirmada", "Cancelamento confirmado!"). `tests/assistant/commitment-claim-guard.test.ts` (**50** testes, **50** passando) prova o vocabulário, a normalização, cada não-afirmação do §1 do Goal ("reservado", "posso confirmar?", negação), e as três condições da violação isoladas.

**Travessão normalizado (U-06).** `normalizeModelDashes` (`assistant.service.ts:405`), aplicado antes do guard, troca U+2014 sempre e U+2013 cercado de espaço por vírgula, sem tocar faixa numérica sem espaço (`10–11`). Nenhum texto de `PRODUCT_OWN_TEXTS` contém U+2014; os literais que chegam ao modelo (`prompts/system.ts`, regra 17 de `MAIN_RULES`; `prompts/summary.ts`) também deixaram de usar travessão. `PROMPT_TEMPLATE_VERSION` subiu de `v6` para `v7`.

**QA H-09 — a Home conta agendamento, não reserva.** `aiAppointmentsToday` em `/internal/dashboard` (`apps/ai-orchestrator/src/modules/internal/routes.ts:1150`) soma 1 por `create_appointment` `SUCCEEDED` com `arguments.action === "confirm"`, e o número de ocorrências de `confirm_recurring_appointments` `SUCCEEDED`; `prepare`, falha, hold vencido, remarcação e cancelamento não contam. `tests/internal/dashboard-ai-appointments.routes.test.ts` (**9** testes, **9** passando) prova, inclusive o caso da revisão: um `prepare` sem `confirm` dá **0**.

**Quatro controles negativos, executados e revertidos nesta Work Unit, saída real desta execução:**

1. Guard desligado (`guardCommitmentClaim` retornando o texto sem checagem):
```
❯ tests/assistant/commitment-claim-guard.test.ts (50 tests | 10 failed) 19ms
❯ tests/evals/commitment-claim.eval.test.ts (8 tests | 6 failed) 23ms
Test Files  2 failed (2)
     Tests  16 failed | 42 passed (58)
```
2. Evidência lida do JSON da decisão (`appointmentDraftPatch.status === "confirmed"` aceito como `confirm`, ao lado do ledger):
```
Test Files  1 failed | 1 passed (2)
     Tests  1 failed | 57 passed (58)
 FAIL  tests/assistant/commitment-claim-guard.test.ts > guard de afirmação de efeito não gravado em completeGraphTurn (QA A-01) > a evidência nunca sai do JSON da decisão: status confirmed no rascunho do modelo não conta
```
3. Métrica antiga restaurada (`aiAppointmentsToday = confirmedAppointmentCalls.length`):
```
Test Files  1 failed (1)
     Tests  3 failed | 6 passed (9)
 FAIL  tests/internal/dashboard-ai-appointments.routes.test.ts > aiAppointmentsToday conta so agendamento criado > prepare sem confirm da 0
 FAIL  tests/internal/dashboard-ai-appointments.routes.test.ts > aiAppointmentsToday conta so agendamento criado > serie recorrente confirmada de N conta N
 FAIL  tests/internal/dashboard-ai-appointments.routes.test.ts > aiAppointmentsToday conta so agendamento criado > mistura confirm avulso e serie recorrente soma os dois
```
4. Normalização de travessão removida (guard chamado sem `normalizeModelDashes`):
```
❯ tests/assistant/commitment-claim-guard.test.ts (50 tests | 1 failed) 17ms
❯ tests/evals/commitment-claim.eval.test.ts (8 tests | 1 failed) 22ms
Test Files  2 failed (2)
     Tests  2 failed | 56 passed (58)
```

Cada controle foi aplicado e revertido no mesmo passo, a partir de cópia de `assistant.service.ts` e `routes.ts` guardada antes da primeira mutação. Depois de revertidos, os três arquivos de teste voltam a **67** testes passando (`npx vitest run tests/assistant/commitment-claim-guard.test.ts tests/evals/commitment-claim.eval.test.ts tests/internal/dashboard-ai-appointments.routes.test.ts` → **67** testes, **67** passando, **0** falhando), e `git status --porcelain=v1 -uall` não mostra resto de controle.

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §33. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: QA A-01 e QA H-09 são achados do `QA_LOCAL_REVIEW`, fora dessa enumeração, e sua correção não move a contagem.

Quatro coisas que este recontar não diz. **Não prova aderência do modelo real ao prompt** (D-050): o eval usa um dublê roteirizado, prova o que o runtime deixa acontecer quando o modelo escreve o texto do roteiro, não o comportamento do modelo real em produção. **Não fecha o `QA_LOCAL_REVIEW`**: o documento da revisão não é editado — ele registra a revisão como ela foi. **Não cobre afirmação sem rascunho pendente**: uma frase como "seu horário de quinta está confirmado", sobre um agendamento antigo sem `pendingAction`, passa sem checagem — o guard não distingue de fato verdadeiro sem ler a agenda; o caso real de QA A-01 (hold recém-criado, ainda em `pendingAction`) cai dentro do guard. **Termo genérico de confirmação cruza tipo e é fail-closed**: `COMMITMENT_CLAIM_GENERIC_CONFIRM_TERMS` entra no vocabulário dos três tipos porque o guard decide o tipo pelo `pendingAction`, não pelo texto; com `cancel` ou `reschedule` pendente, uma frase que usa só o termo genérico sobre o agendamento original, sem afirmar o efeito do rascunho — por exemplo, "Seu horário continua confirmado, mesmo assim quer cancelar?" — dispara o guard mesmo sem afirmar cancelamento ou remarcação; o custo desse falso positivo cai sobre uma mensagem substituída, nunca sobre uma confirmação inventada (ambos os limites, [D-073](DECISIONS.md)).

Execução conferida por esta Work Unit: `npx vitest run tests/assistant/commitment-claim-guard.test.ts tests/evals/commitment-claim.eval.test.ts tests/internal/dashboard-ai-appointments.routes.test.ts` — **67** testes, **67** passando, **0** falhando, depois de cada controle negativo revertido. `git status --porcelain=v1 -uall` sobre `apps/ai-orchestrator/src/modules/assistant/assistant.service.ts` e `apps/ai-orchestrator/src/modules/internal/routes.ts` mostra só o diff desta execução, sem resto de controle. Rodados nesta rodada de correção (FIX-001, rodada 4): `npm run typecheck` (`apps/ai-orchestrator`) exit 0; `npm run lint` (`apps/ai-orchestrator`) exit 0; `npm test` (`apps/ai-orchestrator`, suíte completa) — **1099** testes passando, **88** pulados, **0** falhando; `npm run validate:core` — **15** passos `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`, exit 0, incluindo o passo `test:gate-scripts` com **226**/**226**.

## 35. QA CV-01, QA CV-02, QA SV-01, QA SV-02 e QA NT-04 são corrigidos: a área logada volta a ter casca, e o gate autenticado passa a medir a composição — Goal058, 2026-09-27

Seção nova, escrita depois da execução final da rodada 2 do diff058. Ela **não reescreve** §4 a §34: os registros de A-01 a A-24, o veredito das seções anteriores e as trinta e quatro seções de fechamento anteriores continuam exatamente como estavam. **QA CV-01, QA CV-02, QA SV-01, QA SV-02 e QA NT-04** vêm do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entram nessa contagem**. Decisão: [D-074](DECISIONS.md), `ACCEPTED` no [review058](reviews/058-review.md).

### O que mudou

**QA CV-01 e QA CV-02 — a casca é uma regra base comum a todo módulo.** `AppShell` aplica `app-frame` ao lado de `${styleModule}-shell` em toda casca, e a grade de 248px, o trilho de 88px abaixo de 1100px, o cabeçalho móvel e a barra inferior abaixo de 768px moram uma vez em `apps/frontend/src/shared/styles/atendly.css`. As regras repetidas de `dashboard`, `agenda` e `settings` saíram; `conversations` e `directory`, que não tinham regra nenhuma desde os Goals 016 e 017, passam a ter a da base. Cabeçalho móvel e barra inferior da base ficam em `:where()`, com especificidade zero: na rodada 1 deste Goal a base usava `.app-frame > nav` (0,1,1), que vencia `.settings-bottom-nav` (0,1,0) e empurrava a barra inferior de Configurações para x=-195..195 em 390px; com `:where()`, o estilo computado do cabeçalho e da barra de `settings` em 360, 390 e 768 é idêntico ao da baseline (medido com Chromium sobre os CSS concatenados na ordem de `globals.css`).

**QA NT-04 — Notificações com o respiro de `.settings-page`.** `atendly-settings.css` agrupa `.notifications-page, .settings-page` na regra de respiro existente e nos três breakpoints dela, sem número novo.

**QA SV-01 — duração aceita qualquer minuto inteiro.** `ServiceForm.tsx` troca `step={5}` por `step={1}` na duração, com `min={1}`; os intervalos antes e depois do atendimento continuam `min={0}` e `step={5}`.

**QA SV-02 — preço nasce vazio e a digitação não depende do cursor.** Serviço novo e serviço sem preço nascem com o campo vazio. `CurrencyInput` deriva a edição do texto que o navegador montou, no `onChange`: sem seleção, o dígito entra à direita do valor qualquer que seja o cursor; apagar um caractere tira o último dígito; substituir ou apagar uma seleção deixa o campo com os dígitos que passou a mostrar; o que não é dígito é ignorado. A rodada 1 tratava a entrada no `keydown`, com `onChange` vazio; a rodada 2 tira essa dependência, porque teclado virtual e IME mandam `key: "Unidentified"` e ditado, preenchimento automático e texto arrastado nem mandam `keydown`.

**O gate autenticado mede composição e alcance por clique real.** `measureComposition` (`apps/frontend/e2e/measure.ts`) roda nas sete rotas e nas cinco larguras: marcador na primeira tela, `elementFromPoint` no centro dele sem navegação por cima, sidebar sem sobrepor o `main`, e cabeçalho móvel e barra inferior inteiros dentro da viewport. `authenticated-matrix.spec.ts` abre a linha semeada de Conversas, Clientes e Serviços e "Criar serviço" por `locator.click()` sem `force`, nas cinco larguras, e salva um serviço de 45 minutos pelo formulário. A semente ganha um serviço próprio para o caso de 45 minutos.

### Por que o gate do Goal033 não reprovou, medido na baseline

Execução do gate autenticado inteiro (`node scripts/goal033-authenticated-ui-rehearsal.mjs`, PostgreSQL descartável em loopback) numa `git worktree` temporária na baseline, com o CSS e o `src/` da baseline e só `e2e/` e a semente deste Goal:

```
  35 failed
  25 passed (12.9m)
goal033:authenticated-ui-rehearsal FAILED — AuthenticatedUiRehearsalError: the authenticated gate failed with exit 1. Its output is above, in full.
```

A medida de composição reprova em `/conversas`, `/clientes` e `/servicos` nas cinco larguras (15 testes de medida), e o clique real reprova 20 testes, com o interceptador nomeado, por exemplo:

```
/conversas at mobile-390: the content marker (Conversas) starts at y=901, below the first screen (844px). Found at the top instead: sidebar {"left":0,"right":390}, main {"left":0,"right":390}.
/clientes at desktop-1440: aside.sidebar {"left":0,"right":1440} overlaps main {"left":0,"right":1440} by 1440px horizontally; the element at the content marker's centre is nothing.
/conversas: the conversation with Nina das Telas at mobile-390 could not be reached by a real click within 15000ms: <aside class="sidebar" aria-label="Navegação da aplicação">…</aside> intercepts pointer events.
```

A causa de o overflow não ter reprovado em 390, lida nos anexos `overflow-*` e `composition-*` dessa execução: a medida de overflow compara `scrollWidth` com `clientWidth` do documento, e nas três telas os dois ficam em 390. Sem regra de casca, a sidebar é um bloco de largura cheia (x=0..390) empilhado sobre o `main` (x=0..390), então nada estoura na horizontal. O único elemento que passa da borda é a prévia de mensagem de `/conversas`, um `span` que vai até x=409 (x=401 em 360); como o documento não rola, um ancestral o recorta. Ele aparece na lista de `offenders` e a asserção não reprova. O mesmo `span`, igualmente recortado, continua na lista da execução final com a casca corrigida (`scrollWidth` 390): o "vaza para a direita" que a revisão descreveu não se reproduz, com esta semente, como rolagem do documento. A barra inferior aparece em fluxo, sem `position: fixed`, com 280px de altura (y=1429..1709 em `/conversas`), igual ao que a revisão descreveu. A semente não é curta demais: os marcadores ficam em y=797 a 1089, sempre abaixo da primeira tela.

A linha semeada de `/servicos` abre o detalhe por clique real na baseline e no controle 1 abaixo: em bloco, a sidebar fica acima da lista, não sobre ela, e o clique chega à linha depois da rolagem. As outras quatro medidas de clique reprovam.

### Controles negativos, depois da última edição de código, saída real

1. Regra base removida (numa cópia: `.app-frame` volta a ter só `min-height` e `background`, como na baseline), gate autenticado inteiro por `node scripts/goal033-authenticated-ui-rehearsal.mjs`:
```
  55 failed
  5 passed (13.9m)
goal033:authenticated-ui-rehearsal FAILED — AuthenticatedUiRehearsalError: the authenticated gate failed with exit 1. Its output is above, in full.
/conversas at mobile-390: the content marker (Conversas) starts at y=901, below the first screen (844px). Found at the top instead: sidebar {"left":0,"right":390}, main {"left":0,"right":390}.
/clientes at mobile-390: the content marker (Clientes) starts at y=909, below the first screen (844px). Found at the top instead: sidebar {"left":0,"right":390}, main {"left":0,"right":390}.
/servicos at desktop-1440: aside.sidebar {"left":0,"right":1440} overlaps main {"left":0,"right":1440} by 1440px horizontally; the element at the content marker's centre is nothing.
/clientes: the customer Marta Nogueira at desktop-1440 could not be reached by a real click within 15000ms: <aside class="sidebar" aria-label="Navegação da aplicação">…</aside> intercepts pointer events.
/servicos: Novo serviço at desktop-1440 could not be reached by a real click within 15000ms: <a href="/servicos" aria-current="page" class="nav-item is-active">…</a> from <aside class="sidebar" aria-label="Navegação da aplicação">…</aside> subtree intercepts pointer events.
```
Os 35 testes de medida reprovam (as sete rotas, porque a base é a única casca de todo módulo), mais 20 de clique; passam só os 5 da linha semeada de `/servicos`.

2. `step={5}` com `min={1}` de volta na duração, `npx vitest run tests/goal058-service-form.test.tsx`:
```
     × 40, 45, 60 e 41 são válidos; 0 é recusado; vazio continua válido 41ms
 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

3. `CurrencyInput` da baseline restaurado, mesmo teste:
```
     × digitar 6000 dá R$ 60,00 com o cursor no começo, no meio e no fim 334ms
     × dígitos que chegam só pelo evento input, sem keydown, acumulam ao fim 2ms
     × apagar um caractere pelo evento input tira o último dígito, onde quer que esteja o cursor 1ms
 Test Files  1 failed (1)
      Tests  3 failed | 10 passed (13)
```
Com o `CurrencyInput` da rodada 1 (só `keydown`, `onChange` vazio), reprovam os três testes de entrada sem `keydown` (`3 failed | 10 passed (13)`).

4. `ServiceForm` passando `0` para serviço novo, mesmo teste:
```
 FAIL  tests/goal058-service-form.test.tsx > preço do serviço > serviço novo nasce com o campo de preço vazio
AssertionError: expected 'R$ 0,00' to be '' // Object.is equality
      Tests  1 failed | 12 passed (13)
```

Um quinto controle, da regressão da rodada 1: com a base de volta a `.app-frame > nav` e `.app-frame > main > header:first-child`, sem `:where()`, o gate autenticado reprova só os 4 testes de medida de `/configuracoes` e `/notificacoes` em 360 e 390 (`stats` lido do `results.json` dessa execução, exit 1):
```
stats {"startTime":"2026-09-27T11:41:12.421Z","duration":125091.624,"expected":56,"skipped":0,"unexpected":4,"flaky":0}
/configuracoes at mobile-390: the shell's mobile header or bottom bar runs off the viewport (390x844): [{"element":"nav.settings-bottom-nav","left":-195,"right":195,"top":776,"bottom":844,"inside":false}]
/notificacoes at mobile-360: the shell's mobile header or bottom bar runs off the viewport (360x740): [{"element":"nav.settings-bottom-nav","left":-180,"right":180,"top":672,"bottom":740,"inside":false}]
```

Os controles 1 e 5 rodaram numa `git worktree` temporária, fora da worktree do Goal, removida no fim. Os controles 2 a 4 foram aplicados e revertidos no mesmo passo, a partir de cópia guardada antes da mutação, com o hash do arquivo conferido depois; em seguida, `tests/goal058-service-form.test.tsx` e `tests/goal058-shell-base.test.tsx` voltam a **20** testes passando.

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §34. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: `git diff` deste documento só acrescenta esta seção, e os cinco achados corrigidos são do `QA_LOCAL_REVIEW`, fora dessa enumeração.

O que este recontar não diz. **Não prova fidelidade visual** da casca, de Conversas, Clientes, Serviços e Notificações ao protótipo aprovado: essa conferência é humana (Goal069). **Não fecha o `QA_LOCAL_REVIEW`**, que não é editado. **A composição mede o `contentMarker` de cada rota**, não o resto da tela. **Overflow recortado por ancestral continua sem reprovar**, como a baseline mostrou em `/conversas`.

Execução final desta rodada, sobre a árvore entregue, depois da última edição de código e dos controles negativos: `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55481/atendly_bff_test" npm run validate:integration`, contra um PostgreSQL 18 descartável em loopback — **35** passos, **35** `passed`, **0** `failed`, exit 0; nele, `rehearse:goal033-authenticated-ui` com **60** testes passando e **0** retentativas (`stats` do `results.json`: `expected` 60, `unexpected` 0, `flaky` 0). `npm run validate:core` — **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`, exit 0, com `test:frontend` em **74** arquivos e **686** testes passando e `test:gate-scripts` em **227**/**227** (baseline: **226**). `npm run validate:ui` — **169** testes passando, **21** pulados, **0** retentativas, exit 0. `npm run typecheck` e `npm run lint` (`apps/frontend`) exit 0.

## 36. QA X-01, QA H-02, QA S-09, QA O-46, QA O-47 e QA A-06 são corrigidos: a leitura de status usa o vínculo e a credencial abertos, o número público é dígitos, e a criação remota é desfeita quando a linha local não nasce — Goal059, 2026-09-27

Seção nova, escrita pela Work Unit de controles e documentação (WU-04) depois de integradas as Work Units de implementação (WU-01 leitura de status no BFF, WU-02 remoção compensatória de instância órfã, WU-03 banner da Home e número formatado no frontend). Ela **não reescreve** §4 a §35: os registros de A-01 a A-24, o veredito das seções anteriores e as trinta e cinco seções de fechamento anteriores continuam exatamente como estavam. **QA X-01, QA H-02, QA S-09, QA O-46, QA O-47 e QA A-06** vêm do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entram nessa contagem**. Decisão: [D-075](DECISIONS.md), `ACCEPTED` no [review059](reviews/059-review.md).

### O que mudou

**QA X-01 — a leitura de status usa o vínculo e a credencial abertos.** `whatsappSummary` (`apps/bff/src/modules/dashboard/routes.ts`), reaproveitada por `GET /v1/status` (`modules/status/routes.ts`) e `GET /v1/dashboard`, resolve o vínculo por `findLinkedInstance` e abre a credencial por `resolveInstanceCredential` antes de chamar `evolution.getStatus`, exatamente como `GET /v1/whatsapp` já fazia; nenhum caminho de leitura de status passa `instance.evolutionInstanceToken` (o envelope cifrado) cru à Evolution. Vínculo `pending`/`divergent`, credencial que não abre e Evolution fora do ar viram `UNKNOWN` em `/v1/status` e `status: "error"` em `/v1/dashboard`, nunca `DISCONNECTED`. `settled` registra a falha com `código`/`statusCode` do erro, nunca com credencial, envelope, número ou corpo da resposta. **Escrita disparada pela leitura de status (§1 do Goal, rodada 2/FIX-001):** `resolveInstanceCredential` grava de novo em só dois casos — decifração de credencial legada em texto puro (uma vez, a linha nasce selada e nunca mais é legada) e rotação de `WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID` (uma vez por rotação). Fora desses dois casos, a leitura de status não escreve. A sidebar chama `GET /v1/status` a cada tick do shell; para um vínculo legado ainda não selado, o primeiro tick grava e os seguintes não gravam mais por este caminho.

**QA H-02 — a Home diz o mesmo que a sidebar.** O banner de WhatsApp de `ProductDashboardScreen` (`apps/frontend/src/features/dashboard/DashboardScreen.tsx`) deriva de `status.whatsappView` — a mesma fonte que a sidebar e o checklist já usavam — em vez de um segundo predicado sobre `dashboard.whatsapp`. Estado desconhecido mostra "Não foi possível confirmar o WhatsApp"/"WhatsApp não confirmado", sem "desconectado", "pausado" nem "Reconectar", com link para `/configuracoes/whatsapp`; estado desconectado de fato mantém o banner de sempre; conectado e carregando não mostram banner de WhatsApp.

**QA S-09/QA O-46 — o número é número.** `phoneNumber` sai em dígitos, sem servidor nem sufixo de aparelho, nas quatro saídas que o expõem: `GET /v1/whatsapp` e `GET /v1/dashboard`/`GET /v1/status` (via `whatsappSummary`, usando `phoneFromWhatsappJid` de `lib/phone.ts`) e o estado de onboarding (`lib/onboarding-state.ts`). `GET /v1/whatsapp` converte **antes** de gravar (`phoneFromWhatsappJid(rawPhone)` no `data` do `update`, rodada 2/FIX-001): linha antiga que só guardava o JID cru sai em dígitos já na primeira releitura, sem migration; quando a Evolution não informa `myJid`/`jid`, a conversão cai sobre `instance.phoneNumber` em vez de regravar o JID cru sem tocar nele. O teste do JID legado sem `myJid` (rodada 3/FIX-001) lê `WhatsAppInstance` direto por `getPrisma().whatsAppInstance.findUnique({ where: { userId } })` depois da chamada, e confere `phoneNumber` em dígitos na própria linha — não só na resposta HTTP, que `whatsappDto` já reconverteria de qualquer forma.

**QA O-47 — tentativa de conexão que falha não deixa instância órfã.** `ensureInstance` (`apps/bff/src/modules/whatsapp/routes.ts`) confere `credentialKeysConfigured()` **antes** de `evolution.createInstance`, recusando com `CREDENTIAL_UNAVAILABLE` (`503`) sem tocar a Evolution. Falha entre a criação remota e a gravação local (`whatsAppInstance.create`) chama `evolution.deleteInstance` e relança o erro original; falha da remoção compensatória só é registrada em log (sem credencial) e não troca o erro que o dono vê. Falha depois da gravação local não remove nada; a próxima tentativa reutiliza a linha por `findLinkedInstance`.

**QA A-06/QA S-09 — o número aparece formatado.** `apps/frontend/src/shared/phone.ts` (novo) normaliza JID ou dígitos crus para DDD + assinante, restaurando o 9º dígito quando o assinante legado de 12 dígitos começa em 6–9 (celular) e preservando como fixo quando começa em 2–5; `formatBrazilianPhone` formata só para exibição, sem tocar valor gravado nem chave de busca. `WhatsAppConnectionPanel.tsx` usa `formatBrazilianPhone(…, "plus")` em vez do `phoneNumber` cru; `formatPhone` de Conversas (`features/conversations/format.ts`) passa a usar o mesmo normalizador, mantendo o formato `(DDD) NNNNN-NNNN` de hoje.

### Controles negativos, depois da última edição de código, saída real

**Rodada 2 (FIX-001), re-executados sobre a árvore corrigida (10+4 testes de BFF, 13 de frontend, contra o mesmo PostgreSQL descartável já usado pela rodada 1).** Cada controle foi aplicado com o arquivo original salvo antes da mutação e restaurado logo em seguida (diff conferido idêntico ao original depois de cada reversão). Ambiente do BFF: PostgreSQL 18 descartável em loopback (`postgresql://pgtest@127.0.0.1:55432/atendly_bff_test`), migrations já aplicadas, `BFF_RUN_INTEGRATION_TESTS=true` e as demais variáveis sintéticas de `scripts/validate-integration.mjs`, passadas diretamente ao `vitest`.

1. `whatsappSummary` volta a passar `instance.evolutionInstanceToken` cru a `evolution.getStatus` (`apps/bff/src/modules/dashboard/routes.ts`), `npx vitest run tests/goal059-whatsapp-status.integration.test.ts`:
```
 FAIL  tests/goal059-whatsapp-status.integration.test.ts > Goal059/WU-01: leitura de status honesta > resolve o vínculo e a credencial abertos: /v1/status e /v1/dashboard concordam com /v1/whatsapp (X-01)
AssertionError: expected 'UNKNOWN' to be 'CONNECTED' // Object.is equality
 FAIL  tests/goal059-whatsapp-status.integration.test.ts > Goal059/WU-01: leitura de status honesta > phoneNumber sai em dígitos, mesmo quando a Evolution devolve JID com sufixo de aparelho (formato real: número:sufixo@servidor)
AssertionError: expected null to be '5511987654321' // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
```
2. `whatsappSummary` volta a buscar por `getPrisma().whatsAppInstance.findUnique({ where: { userId: tenant.userId } })` em vez de `findLinkedInstance`, mesmo comando:
```
 FAIL  tests/goal059-whatsapp-status.integration.test.ts > Goal059/WU-01: leitura de status honesta > vínculo divergente dá UNKNOWN em /v1/status, sem chamar a Evolution
AssertionError: expected 'DISCONNECTED' to be 'UNKNOWN' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```
O caso de vínculo `pending` continua acusando `UNKNOWN` mesmo sob este defeito — não pela regra de posse, que o defeito remove, mas porque o envelope selado com `tenantId` no AAD deixa de decifrar quando `tenantId` é zerado no registro; o caso de vínculo `divergent` (linha de outro usuário) já reprova, como colado acima.
3. `phoneNumber` sem conversão: revertido no ponto real da conversão, `EvolutionClient.getStatus` (`apps/bff/src/clients/evolution/index.ts`), devolvendo o JID cru (`phoneNumber: rawJid`) em vez de `phoneFromWhatsappJid(rawJid)`, mesmo comando:
```
 FAIL  tests/goal059-whatsapp-status.integration.test.ts > Goal059/WU-01: leitura de status honesta > phoneNumber sai em dígitos, mesmo quando a Evolution devolve JID com sufixo de aparelho (formato real: número:sufixo@servidor)
AssertionError: expected '5511987654321:8@s.whatsapp.net' to be '5511987654321' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```
`GET /v1/whatsapp` continua com dígitos mesmo sob este defeito, porque `whatsappDto` reconverte `instance.phoneNumber` de forma independente (e, desde a rodada 2, o `update` da própria rota também converte antes de gravar); o defeito reprova em `/v1/status`, que usa `status.phoneNumber` sem essa segunda conversão. Os testes novos de dígitos puros e de JID sem sufixo não são afetados por este defeito, porque exercitam só `GET /v1/whatsapp`.
4. `ensureInstance` sem a conferência prévia de `credentialKeysConfigured()` e sem o `try`/`catch` de remoção compensatória (`apps/bff/src/modules/whatsapp/routes.ts`), `npx vitest run tests/goal059-whatsapp-orphan.integration.test.ts`:
```
 FAIL  tests/goal059-whatsapp-orphan.integration.test.ts > Goal059/WU-02: tentativa de conexão que falha não deixa instância órfã (O-47) > sem WHATSAPP_CREDENTIAL_KEYS, connect recusa com CREDENTIAL_UNAVAILABLE sem chamar a Evolution
AssertionError: expected 502 to be 503 // Object.is equality
 FAIL  tests/goal059-whatsapp-orphan.integration.test.ts > Goal059/WU-02: tentativa de conexão que falha não deixa instância órfã (O-47) > falha entre criação remota e gravação local remove a instância remota e relança o erro original
AssertionError: expected [] to have a length of 1 but got +0
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```
5. O banner da Home volta a derivar de `dashboard.whatsapp?.status !== "CONNECTED"` em vez de `status.whatsappView` (`apps/frontend/src/features/dashboard/DashboardScreen.tsx`), `npx vitest run tests/goal059-whatsapp-status-view.test.tsx`:
```
 FAIL  tests/goal059-whatsapp-status-view.test.tsx > banner de WhatsApp da Home segue status.whatsappView > unknown nunca afirma desconexão nem pausa, e aponta para /configuracoes/whatsapp
AssertionError: expected 'WhatsApp desconectadoO atendimento au…' not to match /desconectado/i
 FAIL  tests/goal059-whatsapp-status-view.test.tsx > banner de WhatsApp da Home segue status.whatsappView > active não tem banner de WhatsApp
AssertionError: expected <div …(2)>…(3)</div> to be null
 FAIL  tests/goal059-whatsapp-status-view.test.tsx > banner de WhatsApp da Home segue status.whatsappView > loading não tem banner de WhatsApp
AssertionError: expected <div …(2)>…(3)</div> to be null
 Tests  3 failed | 10 passed (13)
```

Depois de cada reversão, o arquivo voltou byte a byte ao estado entregue por WU-01/02/03 mais o conserto da rodada 2 (`diff` contra a cópia salva antes da mutação: sem diferença) e a suíte alvo voltou a passar por inteiro: `tests/goal059-whatsapp-status.integration.test.ts` + `tests/goal059-whatsapp-orphan.integration.test.ts` — **14**/**14**; `tests/goal059-whatsapp-status-view.test.tsx` — **13**/**13**.

### Execução final desta rodada (FIX-001, rodada 3)

Sobre a árvore final, depois dos cinco controles negativos revertidos: `npm run typecheck` e `npm run lint` de `apps/bff` e `apps/frontend`, exit 0 nos quatro; `npm run validate:core` — **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`, exit 0; `npm run test:gate` — **227**/**227**, sem teste a menos que a baseline; `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test npm run validate:integration` — **35** passos, **35** `passed`, **0** `failed`, exit 0, com `rehearse:goal033-authenticated-ui` em **60** testes passando e **0** retentativas; `npm run validate:ui` — **169** testes passando, **21** pulados, **0** retentativas, exit 0. Uma primeira execução de `validate:integration` reprovou em `test:scheduling-integration` (`goal008-agenda.test.ts`, "completes what expired past the grace period and never touches cancelled or no-show", `expected completed:1, got completed:4`), teste dependente do relógio real em `apps/scheduling-service`, que este Goal não toca (§9); isolado, o mesmo arquivo passou **15**/**15** na tentativa seguinte, e a reexecução completa do gate saiu limpa nos **35** passos — o defeito é intermitente e sem relação com o diff deste Goal.

### O que esta seção não prova

**Não prova conexão real** com um aparelho WhatsApp, nem fidelidade visual da Home e da tela de WhatsApp ao protótipo aprovado (conferência humana, Goals 068/069). **Não prova busca de cliente** com e sem o 9º dígito, fora do escopo deste Goal. **A remoção compensatória de instância órfã não alcança órfãs anteriores a este Goal.**

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §35. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: esta seção só acrescenta o registro do diff059, e os seis achados corrigidos são do `QA_LOCAL_REVIEW`, fora dessa enumeração. `validate:core`, `validate:ui` e `validate:integration` saem verdes sobre a árvore final, incluindo `test:gate` em **227**/**227** e o gate autenticado em **60** testes, como a execução final desta rodada, acima, comprova.

## 37. QA CV-03 é corrigido: o chat mostra o que a agenda fez, pelo ledger, nunca pelo texto do modelo — Goal070, 2026-09-27

Seção nova, escrita pela Work Unit de controles e documentação (WU-05) depois de integradas as Work Units de implementação (WU-01 derivação pura e rota interna no ai-orchestrator, WU-02 schema e rota no contrato público e proxy no BFF, WU-03 timeline no frontend, WU-04 semeadura do ledger e medida no gate autenticado). Ela **não reescreve** §4 a §36: os registros de A-01 a A-24, o veredito das seções anteriores e as trinta e seis seções de fechamento anteriores continuam exatamente como estavam. **QA CV-03** vem do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entra nessa contagem**. Decisão: [D-076](DECISIONS.md), **ACCEPTED** no [review070](reviews/070-review.md) (rodada 2 de 2).

### O que mudou

**QA CV-03 — a conversa mostra o que a IA fez de fato na agenda, pelo ledger.** `deriveConversationEvents` (`apps/ai-orchestrator/src/modules/conversations/conversation-events.ts`) lê só as `AiToolCall` de `create_appointment` do `AiRun` da conversa e produz, no máximo, `HOLD_PLACED`, `APPOINTMENT_CREATED` e `HOLD_EXPIRED` — nunca a partir de `AiRun.outputText`, `Message.body` ou `Conversation.state`. `GET /internal/conversations/:id/events` (escopo `conversations:read`, `requireConversation` antes do ledger) e `GET /v1/conversations/:id/events` (proxy fino, `conversationEventSchema` em `packages/public-api-contract`) entregam a lista por rota própria; `GET .../messages` e `messageSchema` não mudam. `MessageTimeline` (`apps/frontend/src/features/conversations/`) intercala as três linhas entre as bolhas, evento antes da bolha em caso de empate de instante, com a hora de vencimento no fuso do negócio (D-045) e "Ver" apontando para `/agenda/agendamento?id=`; falha na consulta de eventos não esconde as mensagens. O gate autenticado (`scripts/goal033-authenticated-ui-rehearsal.mjs`, WU-04) semeia um `prepare` `SUCCEEDED` no prazo, um `confirm` `SUCCEEDED` e um `prepare` `SUCCEEDED` já vencido, e `authenticated-matrix.spec.ts` exige as três linhas nas cinco larguras e o clique real no "Ver". Decisão completa: [D-076](DECISIONS.md).

### Controles negativos, depois da última edição de código, saída real

Os cinco controles do §7 do Goal, cada um aplicado num arquivo já entregue por WU-01/WU-03 e revertido no mesmo passo (diff conferido idêntico ao original depois da reversão):

1. **A derivação passa a aceitar `confirm` sem exigir `status === "SUCCEEDED"`** (`conversation-events.ts`: o guard `if (call.status !== "SUCCEEDED") { ...set provenExpiredByFailedConfirm...; continue; }` trocado por `if (call.status !== "SUCCEEDED" && action !== "confirm") { continue; }`, removendo o tratamento do `confirm` `FAILED`), `npx vitest run tests/conversations/goal070-conversation-events.test.ts`:
```
 FAIL  tests/conversations/goal070-conversation-events.test.ts > deriveConversationEvents > confirm FAILED com APPOINTMENT_HOLD_EXPIRED da HOLD_EXPIRED e nenhum APPOINTMENT_CREATED
AssertionError: expected [ 'HOLD_PLACED' ] to deeply equal [ 'HOLD_PLACED', 'HOLD_EXPIRED' ]
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```
2. **A derivação deixa de tratar `prepare` substituído antes de vencer** (removido o bloco `if (currentHold && !currentHold.consumed) { const previousHoldExpired = ...; if (!previousHoldExpired) { currentHold.superseded = true; } }`), mesmo comando:
```
 FAIL  tests/conversations/goal070-conversation-events.test.ts > deriveConversationEvents > prepare, prepare e confirm da dois HOLD_PLACED, um APPOINTMENT_CREATED e nenhum HOLD_EXPIRED
AssertionError: expected [ { type: 'HOLD_EXPIRED', …(4) } ] to have a length of +0 but got 1
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```
3. **A rota interna perde `requireConversation`** (`apps/ai-orchestrator/src/modules/internal/routes.ts`, a chamada removida antes da consulta do ledger), `npx vitest run tests/internal/goal070-conversation-events.routes.test.ts`:
```
 FAIL  tests/internal/goal070-conversation-events.routes.test.ts > GET /internal/conversations/:id/events > recusa conversa de outro tenant como /messages recusa
AssertionError: expected 200 to be 404
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```
   Sem `requireConversation`, a conversa de outro tenant deixa de ser recusada e devolve **200** com lista vazia — exatamente o que o §2 do Goal proíbe ("nunca devolve lista vazia no lugar de 'não encontrada'").
4. **A hora de vencimento passa a ser formatada no fuso do navegador** (`MessageTimeline.tsx`, `formatBusinessTime(event.holdExpiresAt, businessTimezone)` trocado por `formatBusinessTime(event.holdExpiresAt, Intl.DateTimeFormat().resolvedOptions().timeZone)`), `npx vitest run tests/goal070-conversation-events.test.tsx` (`apps/frontend`):
```
 ❯ tests/goal070-conversation-events.test.tsx (5 tests | 2 failed)
     × aparecem na ordem do protótipo, com instante igual antes da bolha
     × mesmo com o fuso do processo de teste diferente
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```
   Com o fuso do processo de teste em `Asia/Tokyo`, a linha some (o teste procura "13:46", o texto sai com outra hora), provando que a formatação deixou de usar o fuso do negócio.
5. **A timeline deixa de renderizar eventos** (`buildTimelineRows`, o espalhamento `...events.map(...)` removido da lista de linhas). No jsdom, mesmo comando do item 4:
```
 ❯ tests/goal070-conversation-events.test.tsx (5 tests | 3 failed)
     × aparecem na ordem do protótipo, com instante igual antes da bolha
     × reserva vencida sem confirmação aparece como linha central
     × mesmo com o fuso do processo de teste diferente
 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```
   No gate autenticado, `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" node scripts/goal033-authenticated-ui-rehearsal.mjs`:
```
Error: /conversas: the conversation with Nina das Telas at mobile-360: no HOLD_PLACED line ("Horário reservado até…") within 20000ms.
  10 failed
  55 passed (7.8m)
goal033:authenticated-ui-rehearsal FAILED — AuthenticatedUiRehearsalError: the authenticated gate failed with exit 1.
```
   As dez reprovações são as três linhas de evento ausentes em `/conversas` e o clique no "Ver" (sem a linha, o link não existe), sobre as cinco larguras.

Depois de cada reversão (arquivo conferido idêntico ao original), a suíte alvo voltou a passar por inteiro: `tests/conversations/goal070-conversation-events.test.ts` e `tests/internal/goal070-conversation-events.routes.test.ts` — **13**/**13** (`apps/ai-orchestrator`); `tests/goal070-conversation-events.test.tsx` — **5**/**5** (`apps/frontend`); o gate autenticado voltou a **65** testes passando, **0** retentativas (ver "Execução final" abaixo).

### Execução final desta rodada (WU-05), sobre a árvore final

Esta Work Unit é de controles negativos e documentação: os passos agregadores `validate:core`, `validate:ui` e `validate:integration` ficam para as unidades determinísticas seguintes do plano (WU-06 a WU-19). O que esta Work Unit executou e confere, sobre a árvore final, depois dos cinco controles revertidos:

- `npm run typecheck` e `npm run lint` de `apps/ai-orchestrator`, `apps/bff` e `apps/frontend`, exit 0 nos seis.
- `apps/ai-orchestrator`: `npx vitest run` (suíte completa) — **97** arquivos (**85** `passed`, **12** `skipped`), **1112** testes passando, **88** pulados, **0** falhando — inclusive os **13** testes `goal070-` do §1/§2.
- `apps/bff`: os arquivos de teste locais (sem integração) — **13** arquivos passando, **2** pulados (**118** testes passando, **39** pulados) — inclusive os **6** testes de `tests/goal070-conversation-events.test.ts` do §3.
- `apps/frontend`: `npx vitest run` (suíte completa) — **76** arquivos, **704** testes passando, **0** falhando — inclusive os **5** testes de `tests/goal070-conversation-events.test.tsx` do §4.
- `npm run test:gate` — **233**/**233**, sem teste a menos que a baseline (**227**, D-075).
- `node scripts/final-production-audit.mjs` — **34** checks, **33** `passed`, **1** `skipped` (`production_health`, não solicitado), **0** `failed`; `bff_v1_routes_use_literal_paths`, `public_api_route_coverage` e `public_api_response_schema_single_source` passam **sem exceção nova** — a rota `GET /v1/conversations/:id/events` entra pela tabela de rotas e pelo consumo do frontend, como o §3 do Goal exige.
- `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" node scripts/goal033-authenticated-ui-rehearsal.mjs` — **65** testes, **0** retentativas, exit 0 (`e2e-results/authenticated/results.json`: `expected` 65, `unexpected` 0, `flaky` 0). A contagem sobe de **60** (D-074) para **65**: as cinco larguras do novo clique real no "Ver" do evento `APPOINTMENT_CREATED` (§5).

**Duas correções incidentais, fora do escopo do ledger de eventos, necessárias para que este diff não deixe a árvore vermelha para as unidades determinísticas seguintes:**

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` (histórico dos Goals 039/046/047, não tocado por nenhuma Work Unit deste Goal antes desta): a nova `conversation-events.ts` (WU-01) e o novo `this.http.get` de `listEvents` (WU-02, `apps/bff/src/clients/ai-orchestrator/index.ts`) mudam dois totais que esses testes computam pela árvore real e comparam com literais fixos — `scannedFilePathsForInstantiation` de **205** para **206** arquivos `.ts` (119 em `apps/ai-orchestrator/src`, antes 118; 87 em `apps/bff/src`, inalterado) e as ocorrências de `this.http.` em `apps/bff/src/clients/` de **41** para **42**; e o `person_typed_text` de `modules/internal/routes.ts` (Goal039/WU-01) move da linha 705 para a 743 pela nova rota de eventos (§2) inserida antes dele. Os três literais foram atualizados para o número que a própria árvore real produz — nenhuma categoria, nenhuma isenção e nenhum identificador mudou; a filosofia do próprio teste ("o número computado pelo AST prevalece sobre qualquer contagem anterior") é a mesma que justificou o ajuste feito no Goal046 quando o client do Prisma do BFF passou a existir na árvore.
- `apps/frontend/e2e/authenticated-matrix.spec.ts` (WU-04): o teste do clique no "Ver" comparava `new URL(page.url()).pathname` — que nunca contém `?id=` — contra um padrão que exige `?id=` no início da string, e por isso reprovava sempre, com ou sem o defeito do §7.5. A asserção passou a comparar `page.url()` (a URL inteira, com a busca), sem tocar o `expectPath` compartilhado nem as outras reproves por clique real do mesmo arquivo, que continuam comparando só o caminho.

### Nota de fechamento ([review070](reviews/070-review.md))

Os passos agregadores que a WU-05 deixava para depois rodaram nas unidades determinísticas da rodada 2 (WU-06 a WU-19), sobre a árvore aceita:

- `validate:core`: **17** passos, **15** `passed`, **2** `skipped`, **0** `failed`.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos. Nele, `rehearse:goal033-authenticated-ui` roda **65** testes, todos passando, com **0** retentativas.
- `test:gate`: **233**/**233**. Testes dirigidos `goal070`: **13**/**13** (`apps/ai-orchestrator`), **6**/**6** (`apps/bff`) e **5**/**5** (`apps/frontend`). `typecheck` e `lint` dos três apps e `git diff --check`: exit 0.

Os **6** testes novos de `scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` explicam a subida de **227** para **233** em `test:gate`. A seção de Conversas de `apps/bff/PUBLIC_API_V1.md` não diz que o evento some com a purga nem que remarcação, cancelamento e série recorrente não aparecem; D-076 diz as duas coisas (observação 3 do review070).

### O que esta seção não prova

**Não prova** que o modelo real chama `prepare`/`confirm` no momento certo (fora de prova por D-050); que as linhas de evento batem com o protótipo aprovado (conferência humana, Goal069); que remarcação, cancelamento ou série recorrente aparecem na conversa — não aparecem, por decisão declarada em [D-076](DECISIONS.md).

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §36. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: esta seção só acrescenta o registro do diff070, e **QA CV-03 corrigido** é do `QA_LOCAL_REVIEW`, fora dessa enumeração.

## 38. QA IM-01 e QA IM-02 são corrigidos: a conexão pede só e-mail e senha e o erro diz a causa — Goal060, 2026-09-27

Seção nova, escrita pela Work Unit de controles e documentação (WU-05) depois de integradas as Work Units de implementação (WU-01 configuração do sistema, corpo novo, descoberta do profissional e classes de erro no scheduling-service; WU-02 remoção da credencial na conclusão; WU-03 corpo público novo e códigos de erro no BFF; WU-04 tela de dois campos e mensagens por classe no frontend). Ela **não reescreve** §4 a §37: os registros de A-01 a A-24, o veredito das seções anteriores e as trinta e sete seções de fechamento anteriores continuam exatamente como estavam. **QA IM-01** e **QA IM-02** vêm do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entram nessa contagem**. Decisão: [D-077](DECISIONS.md), **ACCEPTED** no [review060](reviews/060-review.md) (rodada 4 de 4).

### O que mudou

**QA IM-01 e QA IM-02 — a conexão pede só e-mail e senha, e o erro diz a causa.** `MINHA_AGENDA_API_BASE_URL` e `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` (`apps/scheduling-service/src/config/env.ts`) tornam o endereço e o cliente OAuth da origem configuração do sistema; `parseMinhaAgendaConnection` (`config.ts`) sempre usa os dois, e a linha antiga gravada com `baseUrl`/`basicAuth` de negócio continua legível, com os dois valores ignorados. `integrationConnectBodySchema` e `integrationSchema` (`apps/scheduling-service/src/modules/internal-api/routes.ts`, `apps/bff/src/modules/calendar/routes.ts`) aceitam só `{ email, password }`, `.strict()`. Depois do login, `MinhaAgendaClient.listProfessionals` chama `/employees/professionals?includeDeleted=false`, e `resolveDiscoveredEmployeeId` (`config.ts`) grava o `id` de um profissional único, recusando com `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND` (zero) ou `MINHA_AGENDA_MULTIPLE_PROFESSIONALS` (mais de um), os dois com 422. O status da origem nunca vira o status da resposta: `MINHA_AGENDA_AUTH_FAILED` sai sempre 422, `MINHA_AGENDA_HTTP_ERROR`/`MINHA_AGENDA_UNREACHABLE`/`MINHA_AGENDA_TIMEOUT`/`MINHA_AGENDA_INVALID_RESPONSE` saem 502 ou 504, e nenhum código `MINHA_AGENDA_*` sai 401 ou 403 (`client.ts`). O BFF repassa o código em `details.upstreamCode` sob `UPSTREAM_ERROR`, sem tradução. `ConnectSourceScreen.tsx` tem só os campos de e-mail e senha, e `connectErrorMessage` lê `details.upstreamCode` para dar um texto de produto distinto por classe. Na mesma transação de `completeOnce` (`import-completion-service.ts`) que grava `completedAt`, a linha `IntegrationConnection` `MINHA_AGENDA` do negócio é apagada (vault Q894), com `ImportSession.connectionId` desfeito antes por causa do FK `Restrict`. **Limite declarado (D-077):** `POST /internal/calendar/integration/connect` e `POST /v1/calendar/integration/connect` aceitam conectar depois da conclusão e gravam a credencial de novo, sem restrição — quem recusa é `POST /v1/calendar/imports`, com `409 IMPORT_ALREADY_COMPLETED`, porque o direito único de importação já foi consumido, não a conexão; impedir a reconexão pós-conclusão é decisão de produto fora deste Goal. Decisão completa: [D-077](DECISIONS.md).

### Controles negativos, depois da última edição de código, saída real

Os seis controles do §9 do Goal, cada um aplicado num arquivo já entregue por WU-01/WU-02/WU-03/WU-04 e revertido no mesmo passo (diff conferido idêntico ao original depois da reversão):

1. **O cliente volta a usar o status da origem em `MINHA_AGENDA_AUTH_FAILED`** (`client.ts`, o terceiro argumento de `AppError` trocado de `422` para `response.status` no ramo 400/401), `npx vitest run --dir tests/unit tests/unit/goal060-minha-agenda-connection.test.ts` (`apps/scheduling-service`):
```
 FAIL  tests/unit/goal060-minha-agenda-connection.test.ts > Goal060: conexão Minha Agenda com e-mail e senha > §7.2: classes de erro, nunca 401/403, nenhuma falha grava > token 400 vira MINHA_AGENDA_AUTH_FAILED 422
AssertionError: expected 400 to be 422
 FAIL  tests/unit/goal060-minha-agenda-connection.test.ts > ... > token 401 vira MINHA_AGENDA_AUTH_FAILED 422
AssertionError: expected 401 to be 422
 FAIL  tests/unit/goal060-minha-agenda-connection.test.ts > ... > nenhuma classe de erro sai com status 401 ou 403
AssertionError: expected 401 not to be 401
 Test Files  1 failed (1)
      Tests  3 failed | 16 passed (19)
```
2. **`connectErrorMessage` volta a comparar `error.code`** (`ConnectSourceScreen.tsx`, `switch (upstreamCode(error))` trocado por `switch (error.code)`), `npx vitest run tests/goal060-connect-source.test.tsx` (`apps/frontend`):
```
 FAIL  tests/goal060-connect-source.test.tsx > ... > 'MINHA_AGENDA_AUTH_FAILED' (upstream 422) vira texto de produto próprio
Expected: "Não foi possível entrar no Minha Agenda com esses dados. Confira o e-mail e a senha."
Received: "Não foi possível conectar ao Minha Agenda agora. Tente novamente."
 FAIL  tests/goal060-connect-source.test.tsx > ... > 'MINHA_AGENDA_PROFESSIONAL_NOT_FOUND' (upstream 422) vira texto de produto próprio
Expected: "Não encontramos nenhum profissional cadastrado nessa conta do Minha Agenda."
Received: "Não foi possível conectar ao Minha Agenda agora. Tente novamente."
 Test Files  1 failed (1)
      Tests  9 failed | 5 passed (14)
```
3. **O leitor volta a usar o `baseUrl` gravado** (`config.ts`, `connectionConfigSchema` ganha `baseUrl: z.string().min(1).optional()` e o retorno de `parseMinhaAgendaConnection` usa `config.data.baseUrl ?? settings.baseUrl`), mesmo comando do controle 1:
```
 FAIL  tests/unit/goal060-minha-agenda-connection.test.ts > ... > §7.4: linha antiga continua legível com a configuração do sistema > IntegrationConnection gravada com baseUrl do portal e basicAuth na credencial é lida com o endereço e o Basic do sistema
AssertionError: expected false to be true
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```
4. **A descoberta passa a aceitar o primeiro de vários profissionais** (`config.ts`, `resolveDiscoveredEmployeeId` perde o ramo `professionals.length > 1`), mesmo comando:
```
 FAIL  tests/unit/goal060-minha-agenda-connection.test.ts > ... > §7.3: descoberta do profissional > dois profissionais vira MINHA_AGENDA_MULTIPLE_PROFESSIONALS 422, sem gravar
AssertionError: expected 200 to be 422
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```
5. **O schema do corpo deixa de ser estrito** (`apps/scheduling-service/src/modules/internal-api/routes.ts`, `.strict()` removido de `integrationConnectBodySchema`), mesmo comando:
```
 FAIL  tests/unit/goal060-minha-agenda-connection.test.ts > ... > §7.1: corpo novo, endereço e cliente OAuth do sistema > corpo com campo antigo (basicAuth a mais) é recusado com VALIDATION_ERROR, sem fetch e sem escrita
AssertionError: expected 500 to be 400
 FAIL  ... corpo com campo antigo (enableWrites a mais) ...
 FAIL  ... corpo com campo antigo (baseUrl a mais) ...
 Test Files  1 failed (1)
      Tests  3 failed | 16 passed (19)
```
6. **A conclusão deixa de apagar a linha** (`import-completion-service.ts`, o filtro de `integrationConnection.deleteMany` trocado de `tenantId: context.tenantId` para um tenant que não existe em nenhum teste, de modo que a chamada não apague nada), `SCHEDULING_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_scheduling_test" npx vitest run --dir tests/integration tests/integration/goal060-import-completion-credential.test.ts` (`apps/scheduling-service`, contra PostgreSQL real):
```
 FAIL  ... > deletes the MINHA_AGENDA connection of the tenant in the same transaction that completes the session
AssertionError: expected { ... } to be null
 FAIL  ... > does not fail when the completion is repeated after the connection is already gone
 FAIL  ... > feeds the calendar overview's integration: null after completion
AssertionError: expected { ... } to be null
 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

Depois de cada reversão (arquivo conferido idêntico ao original), a suíte alvo voltou a passar por inteiro: `tests/unit/goal060-minha-agenda-connection.test.ts` — **19**/**19** (`apps/scheduling-service`, controles 1, 3, 4 e 5); `tests/goal060-connect-source.test.tsx` — **14**/**14** (`apps/frontend`, controle 2); `tests/integration/goal060-import-completion-credential.test.ts` — **5**/**5** contra PostgreSQL real (`apps/scheduling-service`, controle 6).

### Execução final desta rodada (WU-05), sobre a árvore final

Esta Work Unit é de controles negativos e documentação: os passos agregadores `validate:core`, `validate:ui` e `validate:integration` (com os passos das outras apps e serviços) ficam para as unidades determinísticas seguintes do plano (WU-06 a WU-19). O que esta Work Unit executou e confere, sobre a árvore final, depois dos seis controles revertidos:

- `npm run typecheck` e `npm run lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`, exit 0 nos seis.
- `apps/scheduling-service`: `npx vitest run --dir tests/unit` (suíte completa) — **30** arquivos, **410** testes passando, **0** falhando — inclusive os **19** testes de `tests/unit/goal060-minha-agenda-connection.test.ts` do §7.1 a §7.4.
- `apps/scheduling-service` (integração): `SCHEDULING_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_scheduling_test" npx vitest run --dir tests/integration tests/integration/goal060-import-completion-credential.test.ts`, contra um PostgreSQL descartável provisionado por `scripts/provision-scheduling-test-database.mjs` — **5**/**5** testes do §7.5.
- `apps/bff`: `npx vitest run` (arquivos locais, sem integração) — **15** arquivos passando, **32** pulados (**122** testes passando, **258** pulados) — os testes de integração de `tests/goal060-integration-connect.test.ts` (§7.6, **6** testes) ficam pulados sem `BFF_RUN_INTEGRATION_TESTS`/`BFF_TEST_DATABASE_URL`, como os demais arquivos de integração do app; a suíte de integração roda dentro de `validate:integration` (WU-06 a WU-19).
- `apps/frontend`: `npx vitest run` (suíte completa) — **77** arquivos, **718** testes passando, **0** falhando (baseline do review070: **76** arquivos, **704** testes; a diferença é o arquivo novo `tests/goal060-connect-source.test.tsx`, **14** testes do §7.7).
- `npm run test:gate` — **233**/**233**, sem teste a menos que a baseline (**233**, review070) — este Goal não adiciona nem altera arquivo de `scripts/tests/`.
- `node scripts/final-production-audit.mjs` — **34** checks, **33** `passed`, **1** `skipped` (`production_health`, não solicitado), **0** `failed`; `production_config_env_example_parity` e `production_config_render_env_coverage` passam com as duas chaves novas do §1 declaradas em `env.ts`, `.env.example` e `render.yaml`, sem valor real do cliente OAuth no diff.
- `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" node scripts/goal033-authenticated-ui-rehearsal.mjs` — **65** testes, **0** retentativas, exit 0. A contagem não muda em relação à baseline (**65**, D-074/D-076): este Goal não altera nenhuma tela ou rota medida pelo gate autenticado — a tela de conexão (`ConnectSourceScreen`) fica fora das sete rotas logadas que `authenticated-matrix.spec.ts` mede.

**Nota de fechamento ([review060](reviews/060-review.md)):** as unidades determinísticas da rodada 4 (WU-06 a WU-19) rodaram sobre a árvore aceita, todas com exit 0: `validate:core` com **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`) e **0** `failed`; `validate:ui` com **169** testes passando, **21** pulados e **0** retentativas; `validate:integration` com **35**/**35** passos, inclusive `test:bff-integration` (onde rodam os **6** testes de `goal060-integration-connect`, §7.6) e `test:scheduling-integration` (§7.5), e `rehearse:goal033-authenticated-ui` com **65** testes e **0** retentativas. Testes dirigidos da mesma rodada: `goal060-connect-source` **14**/**14**; `goal060-minha-agenda-connection` **19**/**19**; `test:gate` **233**/**233**.

### O que esta seção não prova

**Não prova** que o login e a descoberta do profissional funcionam contra a Minha Agenda real — isso é a conferência humana do §8 do Goal, e **não foi feita** por este Goal; que a análise e a execução da importação terminam para uma conta real (Goal061); que o caminho e a forma de `/employees/professionals` batem com a API real, além do que o mapa histórico documenta; que a tela bate com o protótipo aprovado (conferência humana, Goal069); que a credencial fica apagada depois da conclusão — uma reconexão depois disso grava a credencial de novo, sem restrição (limite declarado da D-077).

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §37. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: esta seção só acrescenta o registro do diff060, e **QA IM-01/QA IM-02 corrigidos** são do `QA_LOCAL_REVIEW`, fora dessa enumeração.

## 39. QA IM-03, QA IM-04, QA IM-05, QA IM-07 e QA IM-08 são corrigidos: a importação longa não depende de uma requisição — Goal061, 2026-09-27

Seção nova, reescrita na rodada 2 do Goal061 depois da execução final. Ela **não reescreve** §4 a §38: os registros de A-01 a A-24, o veredito das seções anteriores e as trinta e oito seções de fechamento anteriores continuam exatamente como estavam. **QA IM-03**, **QA IM-04**, **QA IM-05**, **QA IM-07** e **QA IM-08** vêm do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entram nessa contagem**. Decisão: [D-078](DECISIONS.md), **ACCEPTED** no [review061](reviews/061-review.md) (rodada 2 de 2).

### O que mudou

**QA IM-03 e QA IM-07 — iniciar é uma requisição curta.** `POST /internal/calendar/imports/:sessionId/analyze` e `POST .../execute` (`apps/scheduling-service/src/modules/internal-api/routes.ts`) conferem sessão, estado e conexão, reivindicam a sessão com `acquireImportLease` gravando `ANALYZING` ou `EXECUTING` no mesmo `UPDATE`, disparam o trabalho em `ImportBackgroundWork` (`import-lease.ts`) e respondem `202` com `{ sessionId, status, previewVersion }`, sem chamar a origem. A análise passa a ter lease: ela e a execução se excluem pelo estado, e novo início com lease vivo é recusado com `IMPORT_SESSION_LEASE_HELD` (409). A transação final da análise só grava se a sessão ainda tem o mesmo `leaseOwner` e está em `ANALYZING`. Falha que não é de item grava `errorCode` de `IMPORT_WORK_ERROR_CODES` e libera o lease. O BFF e o contrato público (`importWorkStartSchema`) repassam o `202`. A tela sai para o acompanhamento quando o início é aceito. Falha de transporte (rede, timeout ou 5xx) no início da análise, em "Importar tudo" e na retomada ("Importar os N que faltam"/"Continuar") relê `GET /v1/calendar/imports` e só mostra erro quando o estado relido mostra que nada começou. Depois de "Tentar de novo" ou "Continuar" aceito, a tela mostra a análise em andamento, não a falha nem a interrupção da tentativa anterior que a sessão ainda carrega. **QA IM-04 — montar não reanalisa.** `GET /internal/calendar/imports/:sessionId/preview` e `GET /v1/calendar/imports/:sessionId/preview` leem o preview gravado da versão vigente, sem a origem; `ImportPreviewScreen.tsx` só inicia a análise sozinha em `DRAFT` sem preview. **QA IM-08 — motivo do item falho.** `failedReasons` por categoria em `progress`, e "O que ainda não entrou" mostra cada motivo em linguagem leiga, com a contagem. Cada código que a execução grava tem texto próprio em `labels.ts` (`IMPORT_SERVICE_MAPPING_MISSING`, `IMPORT_CUSTOMER_MAPPING_MISSING`, `IMPORT_APPOINTMENT_INTERVAL_INVALID`, `IMPORT_SOURCE_RECORD_INVALID`, `IMPORT_AVAILABILITY_COMPANY_MISSING`, `IMPORT_ITEM_FAILED`); código desconhecido cai num texto genérico. **QA IM-05 — contagem de clientes.** A revisão e a escolha mostram `discoveredCount` também em categoria com limitação. `interrupted` (lease vencido pelo relógio do banco, ou ausente, em `ANALYZING`/`EXECUTING`) e `lastError` entram em `progress` e em `session` de `GET /internal/calendar/imports`; a tela oferece "Continuar". Decisão completa e limites: [D-078](DECISIONS.md).

### Controles negativos, saída real

Os seis controles do §8 do Goal, cada um aplicado num arquivo de produção, com cópia do original salva antes e restaurada no mesmo passo (arquivo restaurado comparado byte a byte com a cópia, sem diferença). Os controles 1 a 4 atuam em `apps/scheduling-service/src`, que a rodada 2 não mudou; a saída abaixo é a da rodada 1. Os controles 5 e 6 rodaram de novo na rodada 2, depois da última edição de código, porque o frontend mudou; a saída abaixo é a dessa execução. Os controles 1 a 4 rodaram com `SCHEDULING_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_scheduling_test" npx vitest run --dir tests/integration tests/integration/goal061-import-async.test.ts` (`apps/scheduling-service`, contra PostgreSQL real, banco provisionado por `scripts/provision-scheduling-test-database.mjs`); os controles 5 e 6, com `npx vitest run tests/goal061-import-async.test.tsx` (`apps/frontend`, jsdom).

1. **A rota de análise volta a aguardar o trabalho antes de responder** (`routes.ts`, `importWork.dispatch(() => preview.runAnalysis(...))` trocado por `await preview.runAnalysis(...)`):
```
     × POST analyze answers 202 ANALYZING while the origin is locked, then reaches READY in-process 5146ms
     × a locked analysis refuses execution and a second analysis; the same key replays without a second work 5040ms
     × replace while the analysis is locked: the old work writes nothing to the replaced session nor to the new one 5033ms
     × starting in one business never claims or reads another business's session 5026ms
     × an ANALYZING session with an expired lease is interrupted in progress and in GET imports, by the database clock, and a new start resumes it 5040ms
 FAIL  ... > POST analyze answers 202 ANALYZING while the origin is locked, then reaches READY in-process
Error: Test timed out in 5000ms.
 Test Files  1 failed (1)
      Tests  5 failed | 7 passed (12)
```
2. **A análise deixa de reivindicar o lease** (`import-preview-service.ts`, a chamada `acquireImportLease` de `startAnalysis` trocada por um `claim` fixo `{ acquired: true, lease: { owner, ... } }` que não toca o banco):
```
 FAIL  ... > a locked analysis refuses execution and a second analysis; the same key replays without a second work
AssertionError: expected 'IMPORT_SESSION_NOT_EXECUTABLE' to be 'IMPORT_SESSION_LEASE_HELD' // Object.is equality
 FAIL  ... > POST analyze answers 202 ANALYZING while the origin is locked, then reaches READY in-process
AssertionError: expected 'DRAFT' to be 'ANALYZING' // Object.is equality
 FAIL  ... > a locked execution refuses analysis and a second execution; the same key replays without a second work
AssertionError: expected 409 to be 202 // Object.is equality
 Test Files  1 failed (1)
      Tests  9 failed | 3 passed (12)
```
3. **A transação final da análise deixa de conferir o `leaseOwner`** (`import-preview-service.ts`, `leaseOwner: start.lease.owner` removido do `where` do `updateMany` de `recordAnalysis`). **Contra o teste de `replace` do §7.1, o controle não reprovou:** `Tests  12 passed (12)`. Motivo, conferido no código: `replace` move a sessão para `SUPERSEDED` e apaga o `leaseOwner`, então o `heartbeat({ force: true })` feito antes da gravação já perde o lease, e o `status: "ANALYZING"` do mesmo `where` também recusa — a conferência do dono não é a única barreira nesse caso. A rodada 1 acrescentou ao arquivo o teste em que a conferência do dono é a única barreira: outra instância toma o lease vencido **depois** do último heartbeat e antes da transação final, com a sessão ainda em `ANALYZING`. Com o controle aplicado, sobre o arquivo com **13** testes:
```
     × a lease taken by another instance after the last heartbeat: the old analysis's final transaction writes nothing 28ms
 FAIL  ... > a lease taken by another instance after the last heartbeat: the old analysis's final transaction writes nothing
AssertionError: expected { …(6) } to be null
 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```
4. **`interrupted` deixa de considerar lease vencido** (`import-lease.ts`, a última linha de `isImportSessionInterrupted` trocada de `return session.leaseExpiresAt.getTime() <= now.getTime();` para `return false;`). A outra forma do controle, trocar o relógio do banco pelo do processo, não foi aplicada: banco e processo rodam na mesma máquina, e nenhum teste consegue separar os dois relógios sem manipular o relógio de um deles.
```
     × an EXECUTING session with an expired lease is interrupted in progress and in GET imports, by the database clock, and a new start resumes it 35ms
     × an ANALYZING session with an expired lease is interrupted in progress and in GET imports, by the database clock, and a new start resumes it 20ms
AssertionError: expected false to be true // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 11 passed (13)
```
5. **A tela volta a chamar `analyzeImport` ao montar com sessão `READY`** (`ImportPreviewScreen.tsx`, o ramo `previewVersion > 0` do efeito passa a chamar `startAnalysis()` em vez de `readPreview()`), arquivo inteiro com **32** testes, rodada 2:
```
     × sessão READY com preview gravado nunca chama analyzeImport, nem montando três vezes 1029ms
     × sessão DRAFT sem preview inicia a análise uma única vez 1004ms
     × sessão ANALYZING nunca inicia de novo, só lê o estado até sair de ANALYZING 1012ms
     × falha de transporte com estado relido EXECUTING mostra o andamento, nunca o erro 1014ms
     × falha de transporte com estado relido sem início mostra o erro 1009ms
     × NETWORK_ERROR com estado relido já analisado mostra o preview, nunca o erro 1010ms
     × 5xx UPSTREAM_ERROR com estado relido já analisado mostra o preview, nunca o erro 1013ms
     × categoria com limitação mostra discoveredCount, junto do texto da limitação 1006ms
     × recusa de seleção de categoria (UPSTREAM_ERROR + upstreamCode) não derruba a tela 1013ms
 Test Files  1 failed (1)
      Tests  9 failed | 23 passed (32)
 FAIL  tests/goal061-import-async.test.tsx > montar não reanalisa > sessão READY com preview gravado nunca chama analyzeImport, nem montando três vezes
TestingLibraryElementError: Unable to find role="heading" and name "Encontramos isto no Minha Agenda"
```
6. **`handleExecute` volta a mostrar o erro sem reler o estado** (`ImportPreviewScreen.tsx`, o bloco "Incerteza não é falha" do `catch` de `handleExecute` removido, de modo que a falha cai direto em `setExecuteError`), arquivo inteiro com **32** testes, rodada 2:
```
     × falha de transporte com estado relido EXECUTING mostra o andamento, nunca o erro 1070ms
 Test Files  1 failed (1)
      Tests  1 failed | 31 passed (32)
 FAIL  tests/goal061-import-async.test.tsx > incerteza não é falha > falha de transporte com estado relido EXECUTING mostra o andamento, nunca o erro
TestingLibraryElementError: Unable to find role="heading" and name "Importando seus dados"
```
O caso "falha de transporte com estado relido sem início mostra o erro" passa com o controle aplicado, como deve: sem releitura, o erro aparece do mesmo jeito. Na rodada 1, este controle derrubava também casos seguintes por contaminação entre testes (um `mockResolvedValueOnce` não consumido vazava para o teste seguinte); a rodada 2 troca `vi.clearAllMocks()` por `vi.resetAllMocks()` no `beforeEach` do arquivo, e o controle passa a reprovar só o caso que ele ataca.

**Controles das correções da rodada 2**, na mesma execução e pelo mesmo procedimento, arquivo inteiro com **32** testes:

- Início da análise sem reler o estado (`ImportPreviewScreen.tsx`, o desvio `analysisStarted(...)` do `catch` de `startAnalysis` removido):
```
     × NETWORK_ERROR com estado relido ANALYZING mostra a análise em andamento, nunca o erro 28ms
     × 5xx UPSTREAM_ERROR com estado relido ANALYZING mostra a análise em andamento, nunca o erro 26ms
     × NETWORK_ERROR com estado relido já analisado mostra o preview, nunca o erro 1016ms
     × 5xx UPSTREAM_ERROR com estado relido já analisado mostra o preview, nunca o erro 1014ms
      Tests  4 failed | 28 passed (32)
TestingLibraryElementError: Unable to find an accessible element with the role "heading" and name "Analisando seus dados…"
```
- Retomada sem reler o estado (`ImportRunScreen.tsx`, o `catch` de `retryPending` volta a chamar `setRetryError` direto):
```
     × NETWORK_ERROR com estado relido EXECUTING mostra o andamento, nunca o erro 80ms
     × 5xx UPSTREAM_ERROR com estado relido EXECUTING mostra o andamento, nunca o erro 76ms
      Tests  2 failed | 30 passed (32)
```
- Fase derivada da sessão vencendo o reinício do dono (`ImportPreviewScreen.tsx`, `derivedPhase` volta a ignorar `ownerRestarted` e `settle` deixa de entregar ao pai o estado relido em `ANALYZING`):
```
     × sessão com lastError, clique aceito com 202 e estado ANALYZING mostra a análise em andamento 92ms
     × sessão com interrupted, clique aceito com 202 e estado ANALYZING mostra a análise em andamento 89ms
      Tests  2 failed | 30 passed (32)
TestingLibraryElementError: Unable to find an accessible element with the role "heading" and name "Analisando seus dados…"
```
- Código de motivo sem texto próprio (`labels.ts`, a chave `IMPORT_CUSTOMER_MAPPING_MISSING` renomeada):
```
     × código conhecido IMPORT_CUSTOMER_MAPPING_MISSING tem texto leigo próprio 1012ms
      Tests  1 failed | 31 passed (32)
```

Depois de cada restauração, a suíte alvo voltou a passar por inteiro: `tests/integration/goal061-import-async.test.ts` — **13**/**13** contra PostgreSQL real (`apps/scheduling-service`, controles 1 a 4, rodada 1); `tests/goal061-import-async.test.tsx` — **32**/**32** (`apps/frontend`, controles 5 e 6 e os da rodada 2).

**Mudança da rodada 1 no teste de integração, antes dos controles.** Na primeira execução, `tests/integration/goal061-import-async.test.ts` reprovou **1** de **11**: o caso de interrupção em `EXECUTING` vencia o lease com `leaseExpiresAt = Date.now() - 1000`, e o PostgreSQL recusou com `23514` (`ImportSession_lease_check` exige `leaseExpiresAt > leaseAcquiredAt`). O helper `expireLeaseByDatabaseClock` passa a vencer o lease por SQL com `now()` do banco, recuando `leaseAcquiredAt` junto. Foram acrescentados dois casos: a interrupção em `ANALYZING`, que o §7.1 pede e o arquivo não tinha, e a tomada do lease entre o último heartbeat e a transação final (controle 3). O arquivo passou de **11** para **13** testes, sem mudança de código de produção.

**Escopo.** `apps/ai-orchestrator/`, `apps/evolution-go/` e `tools/ia-loop/` não são tocados pelo diff. A rodada 1 tinha editado `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` para subir de 42 para 43 a contagem congelada de `this.http.` em `apps/bff/src/clients/`, porque o cliente do BFF ganhou `mutateWithStatus`. A rodada 2 reverteu o arquivo ao estado de `7623009` e manteve as **42** ocorrências fazendo `mutate` delegar a `mutateWithStatus` (`apps/bff/src/clients/scheduling/index.ts`), de modo que a escrita tem uma única chamada `this.http.requestWithStatus`; `test:ai-orchestrator` passou sem alterar o teste.

### Execução final da rodada 2, sobre a árvore final

Depois dos controles restaurados, sobre a árvore final:

- `npm run typecheck` e `npm run lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`, exit 0 nos seis.
- `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, que só tem suíte de integração e roda em `validate:integration`, e `test:health-worker`, sem suíte automatizada), exit 0. Dentro dele:
  - `test:scheduling-service` — **32** arquivos, **448** testes passando, **0** falhando (baseline review060: **30**/**410**; a diferença são `tests/unit/goal061-import-async.test.ts` e `tests/unit/goal061-import-read.test.ts`, **38** testes do §7.2);
  - `test:frontend` — **78** arquivos, **750** testes passando, **0** falhando (baseline review060: **77**/**718**; a diferença é `tests/goal061-import-async.test.tsx`, **32** testes do §7.4 e das correções da rodada 2);
  - `test:ai-orchestrator` — **85** arquivos passando e **12** pulados, **1112** testes passando e **88** pulados, com `assistant.service.test.ts` no estado de `7623009`;
  - `test:gate-scripts` (`node --test scripts/tests/**/*.test.mjs`, o mesmo comando de `npm run test:gate`) — **233**/**233**, sem teste a menos que a baseline (**233**);
  - `audit:static` — **34** verificações, **33** passando, **0** falhando, **1** pulada (`production_health`, não pedida).
- `npm run validate:ui` — **169** passando, **21** pulados, **0** retentativas, exit 0.
- `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" node scripts/validate-integration.mjs` — **35**/**35** passos `passed`, **0** `failed`, exit 0. Dentro dele: `test:bff-integration` — **48** arquivos, **386** testes passando, inclusive `tests/goal061-import-async.integration.test.ts` (§7.3); `test:scheduling-integration` — **13** arquivos, **103** testes passando, inclusive os **13** de `tests/integration/goal061-import-async.test.ts` (§7.1); `rehearse:goal033-authenticated-ui` com **65** testes passando e **0** retentativas (resumo do Playwright `65 passed`, sem `failed` nem `flaky`: **65** expected, **0** unexpected, **0** flaky).
- `git status --porcelain=v1 -uall` lista só arquivos de `apps/scheduling-service/`, `apps/bff/`, `apps/frontend/`, `packages/public-api-contract/` e `docs/migration/`, sem resto de controle negativo nem artefato de `e2e-results/`.

### O que esta seção não prova

**Não prova** que a análise e a importação de uma conta real terminam e que a tela acompanha até o fim — isso é a conferência humana do §9 do Goal, e **não foi feita** por este Goal; que as telas de importação cumprem largura, toque, contraste, foco e movimento, porque `/importacao` não está no gate renderizado; que a tela bate com o protótipo aprovado (conferência humana, Goal069); que um trabalho em curso numa instância que cai é retomado sozinho — ele só é retomado quando alguém pede (limite declarado da D-078); a lista completa de clientes, a disponibilidade substituída e o telefone normalizado (Goal062).

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §38. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: esta seção só acrescenta o registro do diff061, e **QA IM-03, QA IM-04, QA IM-05, QA IM-07 e QA IM-08 corrigidos** são do `QA_LOCAL_REVIEW`, fora dessa enumeração.

## 40. QA IM-06, QA IM-09, QA IM-10, QA IM-11 e QA CL-04 são corrigidos, e QA CL-05 só na busca: a importação traz a base inteira e respeita a agenda existente — Goal062, 2026-09-27

Seção nova, escrita na rodada 2 do Goal062 depois da execução final. Ela **não reescreve** §4 a §39: os registros de A-01 a A-24, o veredito das seções anteriores e as trinta e nove seções de fechamento anteriores continuam exatamente como estavam. **QA IM-06**, **QA IM-09**, **QA IM-10**, **QA IM-11**, **QA CL-04** e **QA CL-05** vêm do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entram nessa contagem**. Decisão: [D-079](DECISIONS.md), **ACCEPTED** no [review062](reviews/062-review.md) (rodada 2 de 2), que aplica U-08 e D-005.

### O que mudou

**QA IM-06 — a base inteira de clientes.** `MinhaAgendaClient.listCustomers()` lê `GET /customers`; `readCustomerCategory` (`import-source-reader.ts`) une a listagem aos clientes embutidos em agendamentos e bloqueios, deduplica pelo `id` da origem e deixa de fora quem está `deleted: true` sem referência. Com `404` ou resposta fora da forma, recua para a cobertura anterior com `CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED`, que a tela mostra com texto próprio. **QA IM-09 — a disponibilidade é trocada, nunca somada.** Com horário ativo no negócio, a análise marca os itens de `AVAILABILITY` como `NEEDS_REVIEW` com `AVAILABILITY_REPLACES_CURRENT` e grava a grade proposta em `ImportItem.proposedAvailability` (migration aditiva `20260927120000_goal062_import_item_proposed_availability`); a regra de sobreposição saiu de `routes.ts` para `modules/availability/availability-grid.ts`; `INCLUDE`/`EXCLUDE` de item decide o grupo; só `INCLUDE` de item confirma a troca, numa transação com fencing que apaga a grade vigente e grava a da origem; grade mudada depois da análise termina `FAILED` com `AVAILABILITY_CHANGED_SINCE_ANALYSIS`, sem gravar. A tela de conflito mostra as duas grades por dia; a de Disponibilidade mostra todas as regras ativas e exige confirmação para substituir uma grade que não cabe no formulário. **QA IM-10 e QA CL-04 — telefone numa forma única.** `normalizePhone` do Scheduling devolve `55` + DDD + assinante, com o 9º dígito para celular, e `phone` é gravado como `+` seguido da forma canônica em todo caminho de `AtendlyCustomerService`; a exibição de cliente usa `formatBrazilianPhone`. **QA CL-05, só a busca.** `list({ phone })`, `findCandidatesByPhone` e a classificação da análise comparam com o conjunto de formas equivalentes; o vínculo da conversa não muda (D-005). **QA IM-11 — preço zero.** `resolvePrice` trata `0` como preço não informado no catálogo e nos serviços embutidos em agendamentos; a análise marca `SERVICE_PRICE_NOT_INFORMED` sem bloquear. `IMPORT_SOURCE_INVALID_RESPONSE`, `AVAILABILITY_CHANGED_SINCE_ANALYSIS`, `AVAILABILITY_SOURCE_OVERLAP` e `SERVICE_PRICE_NOT_INFORMED` têm texto leigo próprio em `labels.ts`; o de `AVAILABILITY_CHANGED_SINCE_ANALYSIS` manda analisar de novo. Decisão completa e limites: [D-079](DECISIONS.md).

### Controles negativos, saída real

Os seis controles do §8 do Goal, rodados na rodada 2 **depois da última edição de código**, numa cópia da árvore final (`git ls-files -co --exclude-standard` de `apps/scheduling-service` e `apps/frontend`, com os mesmos `node_modules`), conferida arquivo a arquivo contra a worktree antes da execução, sem diferença. Cada controle aplica um defeito, roda o teste alvo, restaura o arquivo, confere a restauração byte a byte e roda o mesmo teste de novo. Os controles 1 a 4 rodam `npx vitest run` em `apps/scheduling-service` contra PostgreSQL real (`SCHEDULING_TEST_DATABASE_URL` num banco descartável provisionado por `scripts/provision-scheduling-test-database.mjs` em `127.0.0.1`); o 5, a suíte unitária; o 6, jsdom em `apps/frontend`.

1. **A categoria de clientes volta a ignorar a listagem** (`import-source-reader.ts`, `if (!this.client.listCustomers)` trocado por `if (true || !this.client.listCustomers)`), `tests/integration/goal062-import-customers.test.ts -t "sem nenhum agendamento"`:
```
--- com o defeito: exit 1
 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
 FAIL  tests/integration/goal062-import-customers.test.ts > goal062 CUSTOMER directory against PostgreSQL > analisa e importa clientes sem nenhum agendamento vinculado, com sourceSupported true
AssertionError: expected { category: 'CUSTOMER', …(11) } to match object { sourceSupported: true, …(2) }
--- sem o defeito (arquivo restaurado byte a byte): exit 0
 Test Files  1 passed (1)
      Tests  1 passed | 2 skipped (3)
```
2. **A execução volta a criar regras sem ler a grade vigente** (`import-execution-service.ts`, `if (current > 0 && !replaceConfirmed)` trocado por `if (false && current > 0 && !replaceConfirmed)`), arquivo inteiro `tests/integration/goal062-import-availability.test.ts`:
```
--- com o defeito: exit 1
 Test Files  1 failed (1)
      Tests  2 failed | 9 passed (11)
 FAIL  tests/integration/goal062-import-availability.test.ts > goal062 AVAILABILITY replaced, never summed, against PostgreSQL > IMPORT_ALL e decisão de categoria não confirmam a troca nem quando os itens chegam à execução
AssertionError: expected [ 'cmukh1rcf002uioi43ffqk1d1', …(14) ] to deeply equal [ 'cmukh1rcf002uioi43ffqk1d1', …(4) ]
 FAIL  tests/integration/goal062-import-availability.test.ts > goal062 AVAILABILITY replaced, never summed, against PostgreSQL > regra criada depois da análise faz o item terminar FAILED com AVAILABILITY_CHANGED_SINCE_ANALYSIS, sem gravar
AssertionError: expected [ 'cmukh1rfl003mioi4e927kxas', …(10) ] to deeply equal [ 'cmukh1rfl003mioi4e927kxas' ]
--- sem o defeito (arquivo restaurado byte a byte): exit 0
 Test Files  1 passed (1)
      Tests  11 passed (11)
```
3. **`IMPORT_ALL` passa a confirmar a troca** (`import-execution-service.ts`, o `where` de `availabilityReplaceConfirmed` passa a aceitar também `{ scope: "SESSION", decision: "IMPORT_ALL" }`), `tests/integration/goal062-import-availability.test.ts -t "IMPORT_ALL"`:
```
--- com o defeito: exit 1
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 9 skipped (11)
 FAIL  tests/integration/goal062-import-availability.test.ts > goal062 AVAILABILITY replaced, never summed, against PostgreSQL > IMPORT_ALL e decisão de categoria não confirmam a troca nem quando os itens chegam à execução
AssertionError: expected [ 'cmukh1vgb00107wi4twpuoji9', …(9) ] to deeply equal [ 'cmukh1vft000v7wi4zynspncz', …(4) ]
--- sem o defeito (arquivo restaurado byte a byte): exit 0
 Test Files  1 passed (1)
      Tests  2 passed | 9 skipped (11)
```
4. **A busca volta à igualdade exata** (`atendly-customer-service.ts`, `normalizedPhone: { in: phoneCandidates }` trocado por `normalizedPhone: normalizePhone(filter.phone!)`), arquivo inteiro `tests/integration/goal062-customer-phone.test.ts`:
```
--- com o defeito: exit 1
 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
 FAIL  tests/integration/goal062-customer-phone.test.ts > candidatos por telefone por equivalência (Goal062, WU-02) > acha uma linha gravada antes do Goal, em dígitos nacionais sem 55
AssertionError: expected [] to deeply equal [ 'cmukh1yep0001z0i46b2wvzn5' ]
 FAIL  tests/integration/goal062-customer-phone.test.ts > GET /internal/customers?phone= acha cliente importado com DDD 55 (Goal062 §7.1) > cliente gravado antes deste Goal, com dígitos nacionais, também é achado pela rota
AssertionError: expected [] to deeply equal [ 'cmukh1yqd000mz0i42ccoiyky' ]
--- sem o defeito (arquivo restaurado byte a byte): exit 0
 Test Files  1 passed (1)
      Tests  7 passed (7)
```
5. **Preço zero volta a `FIXED`** (`import-execution-service.ts`, `if (known === null || known === 0)` trocado por `if (known === null)` em `resolvePrice`), `tests/unit/goal062-import-customers.test.ts -t "Preço 0"`:
```
--- com o defeito: exit 1
 Test Files  1 failed (1)
      Tests  2 failed | 1 passed | 6 skipped (9)
 FAIL  tests/unit/goal062-import-customers.test.ts > Preço 0 da origem vira NOT_INFORMED/null, sem bloquear a análise > cria o serviço do catálogo com priceType NOT_INFORMED e price null quando a origem manda preço 0
AssertionError: expected { id: 'service-22', …(15) } to match object { priceType: 'NOT_INFORMED', …(1) }
 FAIL  tests/unit/goal062-import-customers.test.ts > Preço 0 da origem vira NOT_INFORMED/null, sem bloquear a análise > preserva preço 0 do serviço embutido do agendamento como NOT_INFORMED/null, sem mudar o preço total do agendamento
AssertionError: expected { id: 'appointmentItem-42', …(9) } to match object { …(2) }
--- sem o defeito (arquivo restaurado byte a byte): exit 0
 Test Files  1 passed (1)
      Tests  3 passed | 6 skipped (9)
```
6. **A tela de Disponibilidade volta a enviar sem confirmação** (`AvailabilitySettings.tsx`, `if (!fitsSingleInterval && !replaceConfirmed)` trocado por `if (false && !fitsSingleInterval && !replaceConfirmed)`), `tests/goal062-availability-phone.test.tsx -t "Disponibilidade"`:
```
--- com o defeito: exit 1
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 3 skipped (6)
 FAIL  tests/goal062-availability-phone.test.tsx > Disponibilidade não apaga em silêncio > dois intervalos no mesmo dia aparecem os dois, e salvar sem confirmar não envia nada
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
--- sem o defeito (arquivo restaurado byte a byte): exit 0
 Test Files  1 passed (1)
      Tests  3 passed | 3 skipped (6)
```

**Por que os controles 2 e 3 reprovam o teste que reprovam.** Com horário ativo na análise, os itens de disponibilidade nascem `NEEDS_REVIEW`, e a execução nunca os processa sem decisão; por isso o teste "Importar tudo sem decisão" com horário já existente na análise passa com os dois defeitos: quem o protege é a classificação da análise. A rodada 2 acrescentou o caso em que "Importar tudo" (`IMPORT_ALL` de sessão e `INCLUDE` de categoria) chega à execução: horário criado depois da análise, itens `PENDING`. É esse caso que os controles 2 e 3 reprovam — com a grade somada no 2 (15 regras em vez de 5) e com a grade trocada no 3. **O controle 4 reprova as linhas antigas, não o caso canônico sem 9º dígito:** como `normalizePhone` devolve a forma canônica com o 9º dígito, uma busca por `5555<8 dígitos>` casa por igualdade com a linha gravada pela forma canônica; a equivalência é o que acha as linhas gravadas antes deste Goal (nacionais, ou com `55` e sem 9º dígito), e o teste de rota cobre as duas.

### Vermelho da baseline

Cada teste novo e cada teste acrescentado foi rodado contra a baseline `a070c54` (exportada por `git archive`, com o contrato público da baseline compilado, o cliente Prisma gerado pelo schema da baseline e bancos migrados pelas migrations da baseline), com os arquivos de teste da árvore final copiados para ela. Saída resumida: `apps/scheduling-service` unitário — `goal062-import-customers.test.ts` reprova **8** de **9**; `goal062-availability.test.ts` não carrega (`Cannot find module '../../src/modules/availability/availability-grid.js'`); `goal062-phone.test.ts` não carrega (`TypeError: BRAZILIAN_DDDS is not iterable`). Integração contra PostgreSQL real — `goal062-import-customers.test.ts` reprova **3** de **3**; `goal062-customer-phone.test.ts` reprova **7** de **7**, inclusive os três casos pela rota `GET /internal/customers?phone=`; `goal062-import-availability.test.ts` reprova **8** de **10** e, com o caso novo da rodada 2, esse caso também (`expected [ …(14) ] to deeply equal [ …(4) ]`). Passam na baseline, como devem, "negócio sem horário ativo continua importando a grade da origem" e "PATCH /internal/availability-settings se comporta como antes". `apps/bff/tests/goal062-import.integration.test.ts` reprova **2** de **3** (o terceiro prova que item de outra categoria segue sem os campos novos). `apps/frontend` — `goal062-availability-phone.test.tsx` reprova **4** de **6**; `goal062-import.test.tsx` reprova **7** de **10**.

### Execução final da rodada 2, sobre a árvore final

Depois dos controles restaurados e antes desta prosa:

- `npm run typecheck` e `npm run lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`, exit 0 nos seis.
- `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, que só tem suíte de integração, e `test:health-worker`, sem suíte automatizada), exit 0. Dentro dele:
  - `test:scheduling-service` — **35** arquivos, **484** testes passando, **0** falhando (baseline review061: **32**/**448**; a diferença são `tests/unit/goal062-import-customers.test.ts`, `goal062-phone.test.ts` e `goal062-availability.test.ts`);
  - `test:frontend` — **80** arquivos, **766** testes passando, **0** falhando (baseline review061: **78**/**750**; a diferença são `tests/goal062-import.test.tsx` e `tests/goal062-availability-phone.test.tsx`);
  - `test:ai-orchestrator` — **85** arquivos passando e **12** pulados, **1112** testes passando e **88** pulados;
  - `test:gate-scripts` (`node --test scripts/tests/**/*.test.mjs`, o mesmo comando de `npm run test:gate`) — **233**/**233**, sem teste a menos que a baseline (**233**);
  - `audit:static` — **34** verificações, **33** passando, **0** falhando, **1** pulada (`production_health`, não pedida).
- `npm run validate:ui` — **169** passando, **21** pulados, **0** retentativas, exit 0.
- `BFF_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55632/atendly_g062r2final_test" npm run validate:integration`, contra um cluster PostgreSQL 18 descartável em loopback — **35**/**35** passos `passed`, **0** `failed`, exit 0. Dentro dele: `test:bff-integration` — **49** arquivos, **389** testes passando (baseline **48**/**386**; a diferença é `tests/goal062-import.integration.test.ts`, **3** testes do §7.3); `test:scheduling-integration` — **16** arquivos, **124** testes passando (baseline **13**/**103**; a diferença são os **21** testes do §7.1: **3** de `goal062-import-customers`, **7** de `goal062-customer-phone` e **11** de `goal062-import-availability`); `rehearse:goal028-release-migrations` aplica o histórico inteiro, inclusive `20260927120000_goal062_import_item_proposed_availability`, e `prisma migrate diff` não acusa drift; `rehearse:goal033-authenticated-ui` com **65** testes passando e **0** retentativas (resumo do Playwright `65 passed`, sem `failed` nem `flaky`: **65** expected, **0** unexpected, **0** flaky). Nenhum passo reprovou; `goal008-agenda.test.ts` passou.
- `grep -rn "this\.http\." apps/bff/src/clients/ | wc -l` — **42**.
- `git status --porcelain=v1 -uall` lista só arquivos de `apps/scheduling-service/`, `apps/bff/`, `apps/frontend/`, `packages/public-api-contract/` e `docs/migration/`, sem resto de controle negativo nem artefato de `e2e-results/`.

**Mudanças de teste da rodada 2.** `tests/integration/goal062-import-customers.test.ts` passa a usar o leitor de produção (`MinhaAgendaImportSourceReader`) sobre um dublê local do client, em vez de um snapshot pronto, e ganha os casos `404` e fora da forma; `tests/integration/goal062-customer-phone.test.ts` ganha três casos pela rota `GET /internal/customers?phone=` com clientes de DDD 55 criados pela execução da importação; `tests/integration/goal062-import-availability.test.ts` ganha o caso de `IMPORT_ALL` que chega à execução; `tests/unit/goal062-phone.test.ts` passa a comparar `BRAZILIAN_DDDS` com a lista lida de `apps/bff/src/lib/phone.ts` — com a lista do BFF alterada (`98, 99,` trocado por `98,`), o teste reprova com `expected [ 11, 12, 13, …(60) ] to deeply equal [ 11, 12, 13, …(59) ]`, e passa com o arquivo restaurado; `tests/goal062-import.test.tsx` cobre os textos novos na tela de execução. Nenhuma asserção de teste anterior ao Goal062 mudou.

### O que esta seção não prova

**Não prova** que `GET /customers` da conta real tem a forma validada, que a contagem de clientes da revisão bate com a da Minha Agenda, que a troca da grade funciona com a grade real nem que uma mensagem de um número importado encontra a cliente como candidata — isso é a conferência humana do §9 do Goal, e **não foi feita** por este Goal; que as telas de importação e de Disponibilidade cumprem largura, toque, contraste, foco e movimento, porque `/importacao` e `/configuracoes/disponibilidade` não estão no gate renderizado; que a tela bate com o protótipo aprovado (conferência humana, Goal069); que a conversa fica ligada à cliente sem confirmação, o que D-005 proíbe.

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §39, com `audit:static` da execução final em **33** de **34** verificações passando e **1** pulada. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: esta seção só acrescenta o registro do diff062, e **QA IM-06, QA IM-09, QA IM-10, QA IM-11 e QA CL-04 corrigidos**, e **QA CL-05 corrigido só na busca**, são do `QA_LOCAL_REVIEW`, fora dessa enumeração.

## 41. QA O-49, QA S-02, QA H-03 e QA H-04 são corrigidos: a IA só liga depois do teste real — Goal063, 2026-09-27

Seção nova, escrita na rodada 2 do Goal063 depois da execução final. Ela **não reescreve** §4 a §40: os registros de A-01 a A-24, o veredito das seções anteriores e as quarenta seções de fechamento anteriores continuam exatamente como estavam. **QA O-49**, **QA S-02**, **QA H-03** e **QA H-04** vêm do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), não da enumeração A-01…A-24 — o prefixo `QA` existe porque este documento já usa `A-` com outro significado — e **não entram nessa contagem**. Decisão: [D-080](DECISIONS.md), **PROPOSED** no Goal063, que aplica U-11 e revê D-035 na parte "teste real só no onboarding".

### O que mudou

**QA S-02 — a IA só liga com prova.** `PATCH /v1/settings/ai` (`apps/bff/src/modules/settings/routes.ts`) com `enabled: true`, na passagem desligada → ligada, lê a prova por `getValidActivationRun` (`apps/bff/src/lib/ai-activation.ts`, a mesma função de `activationTestCompleted`) e recusa com `409 AI_ACTIVATION_TEST_REQUIRED` (`apps/bff/src/lib/errors.ts`) sem gravar nada quando não há execução, quando ela é `FAILED` ou `PAUSED_BY_HUMAN`, quando a `SUCCEEDED` foi superada por troca de canal e quando a leitura falha. A ordem é exclusão, prova, serviço; as duas recusas antigas não mudam. Ligar grava `activatedByRunId`; já ligada, só o estilo muda. Pausar grava a execução válida corrente como usada, e a reconciliação não religa. **QA O-49 — o teste é alcançável.** `contatos-ignorados` vai a `teste-real` pelos dois botões sem concluir; o onboarding só conclui na saída (CTA de sucesso, "Fazer isso depois" do teste, CTA de `whatsapp-concluido`); a retomada lê a execução corrente; a tela de sucesso só afirma a ativação depois de `GET /v1/status`. Configurações › IA (`AiSettings.tsx`) não tem interruptor: mostra o estado lido e a ação dele, e oferece o mesmo teste do onboarding sem prova válida, pelo módulo compartilhado `apps/frontend/src/features/activation-test/ActivationTestPanels.tsx`. **QA H-03 — o checklist leva a cada módulo.** Cada item de `PostOnboardingChecklist` (`DashboardScreen.tsx`) é link para `/servicos`, `/configuracoes/disponibilidade`, `/configuracoes/whatsapp` (com "Conectar" enquanto pendente) e `/configuracoes/ia#teste-real`, este com "depois do WhatsApp" enquanto o WhatsApp está pendente. **QA H-04 — o checklist não some sem teste.** Deixa de ser possível porque o S-02 fecha: sem prova a IA não liga, e o checklist aparece enquanto a IA não está ativa. `/configuracoes/ia` entrou em `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`). Decisão completa e limites: [D-080](DECISIONS.md).

### Controles negativos, saída real

Os seis controles do §8 do Goal, rodados na rodada 2 **depois da última edição de código**, na própria worktree, um de cada vez. Cada controle copia o arquivo, aplica o defeito (o `diff` abaixo é contra a cópia), roda o teste alvo, restaura a cópia, confere que o `sha256` do arquivo restaurado é igual ao de antes do defeito e roda o mesmo teste de novo. Os controles 1 a 3 rodam `npx vitest run` em `apps/bff` contra PostgreSQL real (`BFF_TEST_DATABASE_URL` num banco descartável de um cluster PostgreSQL 18 em `127.0.0.1`, com `BFF_RUN_INTEGRATION_TESTS=true`); os 4 a 6, jsdom em `apps/frontend`.

1. **`PATCH /v1/settings/ai` volta a ignorar a prova** (`apps/bff/src/modules/settings/routes.ts`):
```
187c187
<         if (!current?.enabled) {
---
>         if (false && !current?.enabled) {
--- com o defeito: npx vitest run tests/goal063-ai-activation.integration.test.ts -t "recusa ligar com sem execução nenhuma"
exit 1
 FAIL  tests/goal063-ai-activation.integration.test.ts > Goal063/WU-01: PATCH /v1/settings/ai exige prova válida para ligar > recusa ligar com sem execução nenhuma, sem gravar nada
AssertionError: expected 200 to be 409 // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
--- restaurado byte a byte (sha256 igual ao de antes)
--- sem o defeito:
exit 0
 Test Files  1 passed (1)
      Tests  1 passed | 12 skipped (13)
```
2. **A prova volta a aceitar execução superada** (`apps/bff/src/lib/ai-activation.ts`, `getValidActivationRun`):
```
59,61c59
<   return run?.state === "SUCCEEDED" && !run.supersededByChannelChange
<     ? run
<     : null;
---
>   return run?.state === "SUCCEEDED" ? run : null;
--- com o defeito: npx vitest run tests/goal063-ai-activation.integration.test.ts -t "recusa ligar com execução SUCCEEDED superada por troca de canal"
exit 1
 FAIL  tests/goal063-ai-activation.integration.test.ts > Goal063/WU-01: PATCH /v1/settings/ai exige prova válida para ligar > recusa ligar com execução SUCCEEDED superada por troca de canal, sem gravar nada
AssertionError: expected 200 to be 409 // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
--- restaurado byte a byte (sha256 igual ao de antes)
--- sem o defeito:
exit 0
 Test Files  1 passed (1)
      Tests  1 passed | 12 skipped (13)
```
3. **Pausar deixa de marcar a execução como usada** (`apps/bff/src/modules/settings/routes.ts`):
```
209c209
<           if (run) activatedByRunId = run.id;
---
>           if (false && run) activatedByRunId = run.id;
--- com o defeito: npx vitest run tests/goal063-ai-activation.integration.test.ts -t "pausar"
exit 1
 FAIL  tests/goal063-ai-activation.integration.test.ts > Goal063/WU-01: PATCH /v1/settings/ai exige prova válida para ligar > pausar a IA ligada antes deste Goal (sem activatedByRunId), com execução bem-sucedida existente: GET /v1/status não religa
AssertionError: expected 'ACTIVATED' not to be 'ACTIVATED' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 11 skipped (13)
--- restaurado byte a byte (sha256 igual ao de antes)
--- sem o defeito:
exit 0
 Test Files  1 passed (1)
      Tests  2 passed | 11 skipped (13)
```
4. **`contatos-ignorados` volta a concluir o onboarding** (`apps/frontend/src/features/onboarding/blocks/whatsapp.tsx`, ramo "Ir para o teste"):
```
248a249,250
>     await getProductServices().onboarding.complete();
>     await ctx.refreshSession();
--- com o defeito: npx vitest run tests/goal063-onboarding-activation.test.tsx -t "sem chamar onboarding.complete"
exit 1
 FAIL  tests/goal063-onboarding-activation.test.tsx > contatos-ignorados não conclui: quem conclui é o teste real > Ir para o teste avança sem chamar onboarding.complete()
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 14 skipped (16)
--- restaurado byte a byte (sha256 igual ao de antes)
--- sem o defeito:
exit 0
 Test Files  1 passed (1)
      Tests  2 passed | 14 skipped (16)
```
5. **A tela de sucesso volta a afirmar a ativação sem ler** (`apps/frontend/src/features/activation-test/ActivationTestPanels.tsx`, `ActivationTestSucceeded`):
```
482c482
<   const { icon, text } = aiActiveCopy(view);
---
>   const { icon, text } = aiActiveCopy("active");
--- com o defeito: npx vitest run tests/goal063-onboarding-activation.test.tsx -t "Sua IA está ativa"
exit 1
 FAIL  tests/goal063-onboarding-activation.test.tsx > sucesso: "Sua IA está ativa" só depois de GET /v1/status confirmar > status PENDING: não afirma ativa, diz o estado real
 FAIL  tests/goal063-onboarding-activation.test.tsx > sucesso: "Sua IA está ativa" só depois de GET /v1/status confirmar > status OFF: não afirma ativa, diz o estado real
 FAIL  tests/goal063-onboarding-activation.test.tsx > sucesso: "Sua IA está ativa" só depois de GET /v1/status confirmar > falha ao ler o status: não afirma ativa nem inventa outro estado
TestingLibraryElementError: Unable to find an element with the text: /Sua IA está sendo ativada/.
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed | 12 skipped (16)
--- restaurado byte a byte (sha256 igual ao de antes)
--- sem o defeito:
exit 0
 Test Files  1 passed (1)
      Tests  4 passed | 12 skipped (16)
```
6. **Um item do checklist volta a ser texto sem ação** (`apps/frontend/src/features/dashboard/DashboardScreen.tsx`, `PostOnboardingChecklist`):
```
785,787c785
<             <Link className="checklist-link" href={item.href}>
<               {item.label}
<             </Link>
---
>             <span>{item.label}</span>
--- com o defeito: npx vitest run tests/goal063-home-checklist.test.tsx -t "checklist"
exit 1
 FAIL  tests/goal063-home-checklist.test.tsx > checklist da Home: cada item é uma ação alcançável > tudo pendente: cada item leva ao seu módulo, e o teste espera o WhatsApp
 FAIL  tests/goal063-home-checklist.test.tsx > checklist da Home: cada item é uma ação alcançável > WhatsApp conectado: a linha dele não oferece 'Conectar' e o teste passa a ser oferecido
 FAIL  tests/goal063-home-checklist.test.tsx > checklist da Home: cada item é uma ação alcançável > itens concluídos continuam marcados e alcançáveis
TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Cadastrar um serviço"
 Test Files  1 failed (1)
      Tests  3 failed (3)
--- restaurado byte a byte (sha256 igual ao de antes)
--- sem o defeito:
exit 0
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Por que o controle 3 reprova o teste que reprova.** `-t "pausar"` roda os dois testes de pausa. O primeiro liga a IA por `PATCH` com a execução `run-9` e depois pausa: como ligar já gravou `run-9` em `activatedByRunId`, a pausa sem marcação não muda nada e o teste passa com o defeito. Por isso a rodada 2 acrescentou o caso da IA ligada antes deste Goal (`enabled: true`, `activatedByRunId` nulo) com execução bem-sucedida existente: é nele que a autoativação religaria a IA pausada, e é esse o teste que o controle reprova, pela leitura de `GET /v1/status` (`reconciled: "ACTIVATED"`).

### Vermelho da baseline

O arquivo `apps/bff/tests/goal063-ai-activation.integration.test.ts` final foi rodado contra o código da baseline `1c42689`: `settings/routes.ts`, `ai-activation.ts`, `errors.ts` e `dashboard/routes.ts` (que importa `activationTestCompleted` do mesmo módulo) substituídos por `git show 1c42689:<arquivo>` na worktree, restaurados no mesmo passo e conferidos por `sha256sum -c`, contra PostgreSQL real. Saída: `exit 1`, **11** de **13** reprovam — as cinco recusas (`expected 200 to be 409`), "liga com prova válida" (`expected null to be 'run-42'`), "já ligada" (`expected null to be 'run-7'`), as duas pausas (`expected null to be 'run-9'` e `expected null to be 'run-legacy'`), "a IA religada à mão desliga" (`expected 'CONVERGED' to be 'DEACTIVATED_BY_CHANNEL_CHANGE'`) e "a prova de um negócio nunca liga a IA de outro" (`expected 200 to be 409`). Passam na baseline, como devem, "com prova válida mas sem serviço operacional, recusa 409 CONFLICT" e "a exclusão agendada recusa antes de checar a prova", que provam comportamento que não muda. `apps/frontend` — com os oito arquivos de `src/` que o Goal muda substituídos pelos da baseline `1c42689` e `src/features/activation-test/` retirado, restaurados no mesmo passo e conferidos por `sha256sum -c`: `tests/goal063-ai-settings.test.tsx` reprova **7** de **8** (passa "salvar o estilo com a IA ativa", que a baseline já fazia com o interruptor ligado); `tests/goal063-home-checklist.test.tsx` reprova **3** de **3**; `tests/goal063-onboarding-activation.test.tsx` não carrega na baseline, porque importa o módulo compartilhado que ela não tem.

### Execução final da rodada 2, sobre a árvore final

Na ordem em que rodou:

- `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, que só tem suíte de integração, e `test:health-worker`, sem suíte automatizada), exit 0. Dentro dele:
  - `test:frontend` — **83** arquivos, **793** testes passando, **0** falhando (baseline review062: **80**/**766**; a diferença são `tests/goal063-onboarding-activation.test.tsx` (**16**), `tests/goal063-ai-settings.test.tsx` (**8**) e `tests/goal063-home-checklist.test.tsx` (**3**));
  - `test:scheduling-service` — **35** arquivos, **484** testes passando (baseline **35**/**484**);
  - `test:ai-orchestrator` — **85** arquivos passando e **12** pulados, **1112** testes passando e **88** pulados;
  - `test:gate-scripts` — **233**/**233** (baseline **233**);
  - `audit:static` — **34** verificações, **33** passando, **0** falhando, **1** pulada (`production_health`, não pedida).
- `npm run validate:ui` — **169** passando, **21** pulados, **0** retentativas, exit 0.
- Depois de `validate:core` e `validate:ui`, a única edição foi no arquivo de teste `apps/bff/tests/goal063-ai-activation.integration.test.ts` (o caso da IA ligada antes do Goal, e a leitura de `GET /v1/status` antes da checagem da linha); `apps/bff` não tem suíte fora da integração, e nenhum arquivo de `src/` mudou depois dessas duas execuções. Em seguida rodaram os seis controles acima.
- Depois dos controles: `npm run typecheck` e `npm run lint` de `apps/bff` e `apps/frontend`, exit 0 nos quatro; `npm run test:gate` — **233**/**233**; `grep -rn "this\.http\." apps/bff/src/clients/ | wc -l` — **42**.
- `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55700/atendly_g063r2final2_test" npm run validate:integration`, contra um cluster PostgreSQL 18 descartável em loopback — **35**/**35** passos `passed`, **0** `failed`, exit 0. Dentro dele: `test:bff-integration` — **50** arquivos, **402** testes passando (baseline review062: **49**/**389**; a diferença é `tests/goal063-ai-activation.integration.test.ts`, **13** testes do §7.1); `test:scheduling-integration` — **16** arquivos, **124** testes passando (baseline **16**/**124**); `rehearse:goal033-authenticated-ui` com **70** testes passando e **0** retentativas (`e2e-results/authenticated/results.json`: `expected` **70**, `unexpected` **0**, `flaky` **0**; baseline **65** — a diferença são as cinco larguras de `/configuracoes/ia`). `goal008-agenda.test.ts` passou.

**Mudanças de teste existente.** `apps/frontend/tests/goal018-onboarding-reachability.test.tsx` (rodada 1): quatro asserções que esperavam `onboarding.complete()` em "Fazer isso depois" do WhatsApp e nos dois botões de `contatos-ignorados` passam a esperar que ele **não** seja chamado, e o CTA "Ir para o início" de `whatsapp-concluido` passa a ser botão que conclui — é a regra do §2. `apps/frontend/tests/goal024-settings-shell-invariant.test.tsx` (rodada 2): o laço que abria a confirmação de pausa pelo checkbox passa a abri-la pelo botão "Pausar atendimento" — o checkbox deixou de existir (§3). Nenhum teste de integração do BFF anterior ao Goal063 foi alterado: a suíte inteira, inclusive `goal011-ai-conversation-style`, `goal018-ai-projection` e `goal025-account-deletion-routes`, passou sem mudança de dublê, porque nenhum deles liga a IA desligada por `PATCH` esperando sucesso sem execução, e a leitura do teste ao pausar não lança (falha dela não impede a pausa).

**Blocker 10 do review063 rodada 1.** `goal029-goal030-rehearsal-guards` reprovava em `test:gate` com "The generated Prisma client of apps/ai-orchestrator is missing": o client gerado não é versionado e não existia na worktree naquela execução. É causa de ambiente: com o client gerado (`validate:core` o gera em `build:ai-orchestrator`), `npm run test:gate` passou **233**/**233** antes e depois dos controles.

### O que esta seção não prova

**Não prova** que o teste real envia e recebe mensagem de verdade: o número oficial da Atendly não existe no ambiente de migração (D-035) e a IA é dublê em todo teste. A conferência humana do §9 do Goal — na pilha local com número da plataforma configurado, o onboarding chegando ao teste pelos dois botões, o teste de Configurações › IA rodando, a IA ligando ao terminar bem e a pausa não sendo desfeita por nova leitura — **não foi feita** por este Goal. Também não prova que `/onboarding/*` cumpre largura, toque, contraste, foco e movimento, porque não é medida; nem que as telas batem com o protótipo aprovado (conferência humana, Goal068).

### Veredito recontado

O veredito desta auditoria continua **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO`** — os mesmos números de §40, com `audit:static` da execução final em **33** de **34** verificações passando e **1** pulada. Nenhum achado de A-01 a A-24 foi tocado, corrigido, reclassificado ou reaberto: esta seção só acrescenta o registro do diff063, e **QA O-49, QA S-02, QA H-03 e QA H-04 corrigidos** são do `QA_LOCAL_REVIEW`, fora dessa enumeração.
