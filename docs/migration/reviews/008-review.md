# Review formal — Goal 008

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-09, em review **DEEP dirigido** — concorrência real, atomicidade efeito/resultado/evento, hold pelo relógio do banco e migração de estados — conforme o [Goal008](../goals/008-transacoes-holds-historico-agenda.md). Aceite restrito ao diff identificado abaixo; não representa commit, deploy, merge, execução hospedada de CI nem WhatsApp real.

A rodada 1 é histórica: CHANGES_REQUIRED com nove blockers, todos fechados. Nenhum aceite anterior (001–007) foi reavaliado.

## Escopo e identidade do diff

- Baseline aceita vigente: `d20a52745cf1aae7391faf5688fb8084271ec3d4` (fechamento007). Base imediata da implementação: `26593db458137ac6cb49821a552faeebb2be4ce2`, HEAD da worktree `.ai-worktrees/goal-008`, inalterado nas duas rodadas. O conteúdo entre a baseline aceita e `26593db` é tooling do IA Loop e documentação de planejamento, preservado.
- Snapshot aceito, calculado pelo IA Loop: **43 arquivos**, hash do diff `008f016f542cdca6dc5b028adb5ceb47cb8621b1758ede39a652e8f61cb26e30`. Na rodada 1 o diff tinha 26 arquivos. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Inspecionados: patch completo de cada rodada; as três migrations e o `schema.prisma` do Scheduling; `write-policy.ts`, `idempotency.ts`, `calendar-service.ts`, `calendar-provider.ts`, `time-blocks.ts`, o módulo de holds, os serviços de ciclo de vida e de eventos, o loop de conclusão automática, `atendly-availability.ts`, o provider Atendly, o provider Minha Agenda, `internal-api/routes.ts` e `calendar/routes.ts`; client, tipos e `assistant-tools.ts` na IA; client e rotas de agenda no BFF com o caminho de auth/CSRF; schemas, serviço de agenda e telas no frontend; ensaio de migration, gates e todas as suítes novas. Graphify não foi usado.
- Nenhum arquivo foi editado pelo reviewer nas rodadas. Bancos usados nas reproduções foram descartáveis, criados e parados pelo próprio reviewer.

## Rodada 1 — CHANGES_REQUIRED, 2026-09-09

A execução por Work Units parou na WU-05: as unidades 05 a 17 não rodaram, então não havia rotas novas, IA, BFF, frontend, suíte de integração nem gates. O núcleo entregue (WU-01 a WU-04) foi verificado como sólido já nesta rodada e permaneceu na seguinte:

- **Política única de escrita:** `write-policy.ts` com transação Serializable, `lockCalendarDay` para todos os dias afetados em ordem estável de datas e retry limitado de `40001`/`40P01`/`P2034`; cancelamento e bloqueio passaram a executar sob a mesma política, com a checagem de conflito dentro da transação.
- **Idempotência com o efeito:** o resultado é gravado no mesmo commit da mutação, com referência de efeito (`effectEntityType`/`effectEntityId`); `PENDING` vencido cuja referência já existe é recuperado como sucesso, não reexecutado.
- **Holds:** vigência avaliada pelo `now()` do banco, contando como ocupação para todos exceto para a confirmação que os consome.
- **Estados e histórico:** transições condicionais, um evento por mutação na mesma transação, override só para `USER` com motivo e atendimento manual sem serviço só para `USER`.
- **Migrations:** expansão e normalização de status em passos separados, com guarda que aborta diante de status desconhecido, bruto preservado em `statusRaw` e constraint trigger deferrable para o título do atendimento sem itens.
- **Conclusão automática:** `pg_try_advisory_xact_lock` e loop desligável por variável.

Evidência reproduzida pelo reviewer na rodada 1 (cluster descartável próprio `127.0.0.1:55446`, parado ao final): ensaio `goal008-migration-rehearsal` PASSED; `provision:scheduling-test-database` aplicou as dez migrations; Scheduling unit 97/97; `tsc` e `eslint` do Scheduling exit 0; `git diff --check` limpo.

### R1-01 a R1-09

1. **R1-01 (P1):** `AppointmentHold_expiresAt_check` comparava `expiresAt` com `startAt` e recusava qualquer hold real — um hold vive um TTL curto contado da criação, enquanto o horário reservado está quase sempre no futuro. Reproduzido por sondagem SQL no banco migrado pelo gate (servidor em `America/Sao_Paulo`, `expiresAt` TIMESTAMPTZ e `startAt` TIMESTAMP). O dublê em memória não executa constraints e a suíte de integração que pegaria isso não existia.
2. **R1-02 (P1):** `validate:integration` falhava em `test:scheduling-integration` (11 de 19) porque a limpeza de `customer-identity.test.ts` e `service-catalog.test.ts` apagava `Appointment` antes de `AppointmentEvent`, e a FK nova com `ON DELETE RESTRICT` recusava (`P2003`).
3. **R1-03 (P1):** nenhuma rota nova existia — sem holds, ciclo de vida, histórico, `holdId`, `overlapOverride`, `title`/`durationMinutes` ou `source` nas mutações; toda escrita vinda do BFF gravaria evento com `source: AI` e o override humano era inatingível.
4. **R1-04 (P1):** a IA não havia sido tocada (sem hold ao propor, sem `holdId` no rascunho, sem tratamento de hold vencido).
5. **R1-05 (P1):** BFF, `PUBLIC_API_V1.md` e frontend não haviam sido tocados.
6. **R1-06 (P1):** não existia suíte de integração do Goal008; concorrência, hold vencido, recuperação por referência de efeito, conclusão automática e lease só estavam provados sobre o dublê em memória.
7. **R1-07 (P2):** `statusRaw` era reescrito a cada transição, perdendo o bruto legado que a migration acabara de preservar.
8. **R1-08 (P2):** eventos gravados na mesma transação compartilhavam `occurredAt` (`CURRENT_TIMESTAMP` é o instante de início da transação) sem ordenação secundária.
9. **R1-09 (P2):** `validate:core` não havia sido executado e falhava na worktree por dependências não instaladas.

## Rodada 2 — ACCEPTED, 2026-09-09

### R1-01 a R1-09 — CLOSED

- **R1-01:** migration nova `20260909182000_goal008_agenda_fixups` — passo próprio, e não edição do arquivo já aplicado em bancos de ensaio, para não invalidar o checksum — substitui a CHECK por uma comparação com `createdAt` convertido para UTC e acrescenta a checagem de `endAt` posterior a `startAt`. Sondagem SQL do reviewer no banco migrado, com servidor em `America/Sao_Paulo`, aceita hold criado agora para slot de amanhã; ensaio e suíte de integração cobrem a vigência pelo relógio do banco.
- **R1-02:** `tests/integration/support/reset-tenant.ts` apaga eventos e holds antes de atendimentos e é usado pelas suítes existentes.
- **R1-03:** `calendar/routes.ts` expõe holds (`POST`, `GET`, `GET /:id` e `DELETE /:id` em `/internal/holds`), confirmar e remarcar com `holdId`, `overlapOverride` mais motivo, `title`/`durationMinutes` e `source`, cancelar com motivo, e `complete`, `no-show`, `final-value`, `presence` e `events` por atendimento; `internal-api/routes.ts` expõe `POST /internal/appointments/auto-complete` e mantém os bloqueios sob a política.
- **R1-04:** a IA cria hold ao propor (`holdProposedSlot`), guarda `holdId` no rascunho, envia na confirmação e na remarcação, trata `APPOINTMENT_HOLD_EXPIRED` consultando de novo e devolvendo recusa com alternativas, e segue sem reserva quando a fonte não oferece hold. O contrato do client não tem override nem atendimento sem serviço (seis testes novos, com dublê que falha se chamado).
- **R1-05:** BFF com `/v1/holds` e ciclo de vida/histórico sob `requireTenantContext`, sempre com `source: USER` (CSRF e origem verificados em `lib/auth.ts` para cookie em método não seguro); `PUBLIC_API_V1.md` com seção do Goal008; frontend com `title`, estados novos, `appointmentStatusLabel`/`isActiveAppointmentStatus` e `SCHEDULED` ainda decodificável.
- **R1-06:** `tests/integration/goal008-agenda.test.ts` com 15 cenários contra PostgreSQL usando dois `PrismaClient` em paralelo — duas confirmações do mesmo slot, bloqueio versus confirmação, cancelar versus remarcar, hold concorrente, hold vencido por fixture, recuperação por referência de efeito, falha antes do commit sem efeito, conclusão automática pelo relógio do banco e lease entre instâncias, ordem por `sequence`, override só humano, transições inválidas com `statusRaw` intacto e isolamento por tenant.
- **R1-07:** `statusRaw` é gravado uma vez (migration para linhas legadas, criação para linhas novas) e nunca por transição.
- **R1-08:** coluna `sequence` com sequência própria, backfill e ordenação secundária, com teste que força empate de `occurredAt`.
- **R1-09:** gates verdes, declarados e reproduzidos.

### Evidência reproduzida pelo reviewer na rodada 2

Ambiente: Windows 11, PostgreSQL descartável criado pelo reviewer (`127.0.0.1:55447`, parado ao final).

| Execução | Resultado |
| --- | --- |
| `npm run validate:integration` | **PASSED — 18/18**: ensaio `goal008-migration-rehearsal` (fixture legada preservada linha a linha, `SCHEDULED` normalizado para `CONFIRMED` com bruto preservado, guarda contra valor desconhecido, constraints novas aceitando o conteúdo existente, repetição sem mudança de estado); Scheduling integração **34/34**; IA **39/39**; ownership e outbox do Go |
| `npm run validate:core` | **PASSED — 14 passed, 0 failed, 3 skipped**. IA 191 testes; Scheduling unit 97; frontend 15 |
| `eslint --max-warnings=0` e `tsc --noEmit` em scheduling-service, ai-orchestrator, bff e frontend | exit 0 |
| `git diff --check` | exit 0 |
| Constraints conferidas no banco migrado (`pg_constraint`) | `Appointment_status_check` com os quatro estados do produto; valor final não negativo; `AppointmentHold_expiresAt_check` sobre `createdAt` e a checagem do fim posterior ao início; constraint trigger deferrable do título obrigatório sem itens |
| `prisma migrate diff --from-config-datasource --to-schema` do Scheduling | nenhum drift funcional do Goal008; permanece o drift de forma do Goal006 (`updatedAt` e nomes de FK), agora também em `AppointmentHold` e `AppointmentEvent` |

### Observações não bloqueantes

1. As rotas internas aceitam `source` do corpo em vez de derivá-lo do token do chamador. O provider é o único ponto de recusa e o BFF força `USER`, mas um chamador interno futuro poderia se declarar `USER` e obter override.
2. A IA não libera o hold de um rascunho substituído por nova proposta; o slot antigo fica ocupado até o TTL vencer.
3. Não há testes dedicados do BFF nem de schema do frontend para as rotas e campos novos. CSRF e tenant da sessão estão provados pelo caminho global de auth e pela suíte existente do BFF, não por caso específico do Goal008.
4. `createdAt`/`occurredAt` continuam `TIMESTAMP` com default do banco; inserts SQL crus fora do Prisma gravam hora local da sessão. Só `expiresAt` é `TIMESTAMPTZ`, por ser comparado a `now()` em toda avaliação de vigência.
5. A migration de fixups foi editada antes de qualquer aplicação aceita, sem checksum a preservar.
6. Drift de forma pré-existente do Goal006 mantido.

### Limites

Sem WhatsApp real, deploy, CI hospedada, Minha Agenda real ou credencial real em fixture; modelo e transporte são dublês em todas as suítes; `migrate deploy`/`diff` da IA continuam sem execução local por falta de pgvector. Nenhum tenant real foi migrado: a normalização de status foi exercitada apenas sobre fixture legada em banco descartável.

## Aceite e encaminhamento

- **G-11 fechado** (resultado idempotente gravado no mesmo commit do efeito, recuperação por referência de efeito, retry limitado de aborto serializável e mesma política para todos os writers). **G-12 fechado** (política comum por dia afetado com ordem estável de locks, hold de cinco minutos vigente pelo relógio do banco contando como ocupação, remarcação que mantém o original reservado até o commit, sobreposição só por override humano registrado). **G-18 fechado** (quatro estados do produto com constraint SQL, presença e valor final como dados separados, histórico por evento com ator, origem e antes/depois na mesma transação, conclusão automática sem backfill retroativo).
- D-006 passa a ACCEPTED e D-008 tem sua primeira aplicação comprovada (loop de conclusão automática com lease no próprio Scheduling). Contratos adotados registrados em D-024.
- Resíduo do Goal007 fechado no mesmo diff: o schema de replay da idempotência deriva `totalPriceType` de `totalPrice` quando o replay antigo não traz o campo.
- CURRENT_STATE, GAP_ANALYSIS, DATA_MIGRATION, DECISIONS, TARGET_ARCHITECTURE, MASTER_PLAN e REUSE_ANALYSIS foram alinhados no fechamento; o SHA do commit de fechamento será registrado em MIGRATION_STATUS pelo IA Loop na etapa posterior, conforme D-017/D-018.
- Nenhum Goal seguinte foi criado nem marcado READY nesta etapa.
