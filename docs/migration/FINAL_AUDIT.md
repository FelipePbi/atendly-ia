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
