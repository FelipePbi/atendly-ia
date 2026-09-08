# Review formal — Goal 006

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-08, em review **DEEP dirigido** — migração de identidade, isolamento de tenant e autorização de dados pessoais — conforme o [Goal006](../goals/006-clientes-como-pessoas.md). Aceite restrito ao diff identificado abaixo; não representa commit, deploy, merge, execução hospedada de CI nem WhatsApp real.

Única rodada: nenhum blocker. Nenhum aceite anterior (001–005) foi reavaliado.

## Escopo e identidade do diff

- Baseline aceita vigente: `30fc42f62616ba826d0f2fc737386b038fbf9fb7` (fechamento005). Base imediata da implementação: `8acd4c6035b3ee9a5013eedcabb27daff95cb63f`, HEAD da worktree `.ai-worktrees/goal-006`. O conteúdo entre a baseline aceita e `8acd4c6` é documentação de planejamento do IA Loop, preservado.
- Snapshot aceito, calculado pelo IA Loop: **40 arquivos**, hash do diff `0fdd883403680504a2a50a4733ee10ef0fece7d6913d03d11989232ea0025d50`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Inspecionados: patch completo, as quatro migrations novas (duas do Scheduling, duas da IA) e os dois `schema.prisma`; `AtendlyCustomerService`, o provider Atendly (`createAppointment`/`listAppointments`), o provider Minha Agenda, o serviço de migração de calendário e as rotas internas do Scheduling; `SchedulingClient`, `assistant-tools.ts` (`resolveScheduleCustomer`, `confirmSchedule`, `linkContactToCustomer`) e `SessionService` na IA; rotas de clientes e de calendário e o client do BFF; schemas e serviço de clientes do frontend; `final-production-audit.mjs`, `validate-core.mjs`, `validate-integration.mjs`, os dois ensaios de migration e todas as suítes novas. Graphify não foi usado.
- Nenhum arquivo foi editado pelo reviewer. Bancos usados nas reproduções foram descartáveis, criados e parados pelo próprio reviewer.

## Rodada 1 — ACCEPTED, 2026-09-08

Verificado como sólido:

- **Identidade por ID:** `Customer.phone`/`normalizedPhone` opcionais; a unicidade `(tenantId, normalizedPhone)` foi substituída por índice não exclusivo em migration própria de corte, separada da expansão; `(tenantId, id)` continua a identidade referenciada pelas FKs. `AtendlyCustomerService.create` exige nome ou telefone e **nunca consulta por telefone**; `update` é a única operação que muda nome e telefone; `findCandidatesByPhone` e `list({ phone })` devolvem candidatos (zero, um ou vários). Nenhum caminho renomeia, funde ou deduplica pessoas por número; `CUSTOMER_PHONE_DUPLICATED` deixou de ser conflito de importação.
- **Criação só na confirmação:** no provider Atendly, dentro de `$transaction`, a ordem é `lockCalendarDay` → validação do slot → `resolveCustomerForAppointment` (obter por ID ou criar) → `appointment.create`. Disponibilidade e preço não tocam o cadastro; confirmação que falha no slot não cria nem renomeia ninguém. O provider Minha Agenda recusa agendamento por `customerId` e continua exigindo nome e telefone.
- **Resolução na IA:** `resolveScheduleCustomer` devolve `CUSTOMER_IDENTITY_AMBIGUOUS` com vários candidatos, `proposedCustomerId` com um só, e criação na confirmação com nenhum; `confirmSchedule` usa `pending.customerId ?? pending.proposedCustomerId`; tools `list_customer_candidates` e `get_customer_context`. `linkContactToCustomer` grava `Contact.customerId` por tenant, canal e ID externo na confirmação, podendo apontar para pessoas diferentes ao longo do tempo sem fundir registros.
- **Responsável, notas e tags:** `CustomerRelation` (um responsável principal por cliente, `proposedBy`/`status`/`confirmedBy` com datas), `CustomerNote` e `CustomerTag` com `aiAuthorized` nascendo `false`, todas com FK composta por tenant. A IA só propõe (`PROPOSED`); a confirmação é de cliente ou profissional. `aiAuthorizedContext` filtra na consulta e só inclui responsável `CONFIRMED`; o teste com dublê prova que nota não autorizada não chega ao modelo.
- **Contratos:** treze rotas internas de cliente no Scheduling e rotas públicas equivalentes no BFF sob tenant da sessão e CSRF por cookie; `POST /v1/appointments` aceita `customerId` ou nome/telefone; DTO com telefone nulo, `primaryGuardian`, `notes` e `tags`; frontend aceitando campos e operações novas sem tela; `PUBLIC_API_V1.md` atualizado.
- **Migração:** expand (`20260908160000`) e cut (`20260908161000`) separados, aditivos e retomáveis, sem tocar em linha; `Contact.customerId` sem backfill na IA; `20260908171000_goal005_single_open_session` fecha (não apaga) sessões abertas excedentes e cria o índice único parcial. Regra `no_tenant_scoped_phone_unique_constraint` recusa `@@unique` composto sobre telefone.
- **Resíduos do 005:** `syncLegacyPauseMirror` resolve o handoff `OPEN` da conversa ao limpar o espelho; a criação da sessão absorve a violação do índice parcial (`isUniqueViolation`) e adota a sessão vencedora.
- **Gates:** o Scheduling ganhou suíte própria — `tests/unit` no `validate:core` (sem banco) e `tests/integration` no `validate:integration`, com banco derivado do alvo já validado; o gate de integração passou de 11 para 16 passos.

### Evidência reproduzida pelo reviewer

Ambiente: Windows 11, PostgreSQL 18 descartável criado pelo reviewer (`127.0.0.1:55441`, parado ao final).

| Execução | Resultado |
| --- | --- |
| `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55441/atendly_bff_test npm run validate:integration` | **PASSED — 16/16**: BFF (com os 6 cenários de identidade de cliente); ensaios 003, 004 e 005; ensaio 006 do Scheduling (4 clientes → expansão preserva unicidade → corte → 6 clientes com número compartilhado e um sem telefone, repetido sem mudança de estado); ensaio 006 da IA (sessões abertas 3 → 2, índice parcial vigente); Scheduling integração **10/10**; ownership e outbox do Go; **39 testes** de integração da IA |
| `npm run validate:core` | **PASSED — 14 passed, 0 failed, 3 skipped** (`test:bff`, `test:contracts`, `test:health-worker`; `test:scheduling-service` deixou de ser skip). Scheduling unit 13/13; IA 177 testes (39 pulados por exigirem banco); frontend 10 |
| `eslint --max-warnings=0` e `tsc --noEmit` em scheduling-service, ai-orchestrator, bff e frontend | exit0 |
| `git diff --check` | exit0 |
| `prisma migrate diff --from-config-datasource --to-schema` do Scheduling contra o banco migrado | drift apenas de forma: `updatedAt` com `DEFAULT CURRENT_TIMESTAMP` nas três tabelas novas e nomes de FK `*_customer_fkey` fora do padrão do Prisma; nenhuma diferença de coluna, tipo ou índice |
| Sondagem dirigida com Prisma real contra o banco migrado da IA: segunda `ConversationSession` aberta na mesma conversa | `PrismaClientKnownRequestError` `P2002`, causa `23505` em `ConversationSession_one_open_per_conversation` — exatamente o que `isUniqueViolation` absorve |

### Observações não bloqueantes

1. `prisma migrate diff` do Scheduling reporta o default de `updatedAt` e os nomes de FK das tabelas novas (drift só de forma, como nos Goals anteriores); um futuro `migrate dev` tenderá a gerar migration corretiva.
2. O BFF encaminha o identificador livre `actor` informado pelo cliente como proveniência de responsável, nota e tag; o tipo de ator (`confirmedBy`) é fixo, mas o identificador não é derivado da sessão.
3. `findCustomerAppointments` na IA ainda lista compromissos futuros por telefone sobre todos os candidatos do número; a IA deve tratar a lista como candidatos, não como histórico de uma pessoa.
4. `addTag` faz upsert por rótulo: repetir uma tag existente reescreve `aiAuthorized`.
5. A absorção da segunda sessão aberta é coberta em `tests/session` com dublê que lança `P2002`; não há teste de integração dedicado — a prova contra PostgreSQL foi a sondagem do reviewer acima.
6. O Developer editou `DATA_MIGRATION.md` com redação "IMPLEMENTED"; alinhada no fechamento documental.

### Limites

Sem WhatsApp real, deploy, CI hospedada ou credencial real em fixture; modelo e transporte são dublês em todas as suítes; `migrate deploy`/`diff` da IA continuam sem execução local por falta de pgvector, e o índice parcial da IA só existe em SQL.

## Aceite e encaminhamento

- **G-14 fechado** (pessoa por ID, telefone opcional e não exclusivo, candidatos com seleção explícita, sem merge por número); **G-15 fechado na parte de cadastro** (responsável principal confirmado, notas e tags com autorização explícita no Scheduling) — preferências com origem, resumo e métricas seguem para o Goal012, telas para o Goal015; **G-11 avança** na parte de identidade (cliente só existe depois do slot validado, dentro da transação), restando o resultado idempotente recuperável e a política única de writers para o Goal008.
- D-005 passa a ACCEPTED para este diff; os contratos adotados estão em D-022. CURRENT_STATE, GAP_ANALYSIS, DATA_MIGRATION, MASTER_PLAN, REUSE_ANALYSIS e TARGET_ARCHITECTURE foram alinhados no fechamento; o SHA do commit de fechamento será registrado em MIGRATION_STATUS pelo IA Loop na etapa posterior, conforme D-017/D-018.
- Nenhum Goal seguinte foi criado nem marcado READY nesta etapa.
