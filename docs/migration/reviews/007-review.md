# Review formal — Goal 007

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-09, em review **DEEP dirigido** — semântica de preço e duração em todos os consumers, estabilidade do acordo e migração das constraints — conforme o [Goal007](../goals/007-catalogo-e-acordo-comercial.md). Aceite restrito ao diff identificado abaixo; não representa commit, deploy, merge, execução hospedada de CI nem WhatsApp real.

As rodadas 1 e 2 são históricas: CHANGES_REQUIRED com cinco e um blockers, todos fechados. Nenhum aceite anterior (001–006) foi reavaliado.

## Escopo e identidade do diff

- Baseline aceita vigente: `8d77ed992f12e1405ae7bfaaeb2d852af5711b5d` (fechamento006). Base imediata da implementação: `9494eb643bd85199a876d6a91ba1461ada101099`, HEAD da worktree `.ai-worktrees/goal-007`, inalterado nas três rodadas. O conteúdo entre a baseline aceita e `9494eb6` é documentação de planejamento e tooling do IA Loop, preservado.
- Snapshot aceito, calculado pelo IA Loop: **37 arquivos**, hash do diff `635551fffd956cbf06d78f84ba657a32c8aed27a0c2c994198f8e90de1716a58`. Entre as rodadas 2 e 3 o patch dos 30 arquivos rastreados ficou byte a byte idêntico; só o script de ensaio (novo) mudou. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Inspecionados: patch completo de cada rodada, as duas migrations e o `schema.prisma` do Scheduling; `AtendlyServiceService`, `calendar-provider.ts` (`computeAgreementTotal`), `CalendarService` (`listServices`/`listOperationalServices` e o schema de replay), o provider Atendly, o mapper do Minha Agenda, o serviço de migração de calendário, as rotas internas (`service-catalog`, `calendarOverview`/`countOperationalServices`) e `/internal/services`; client, tipos e `assistant-tools.ts` na IA; client, rotas de serviços, configurações e clientes no BFF; schemas, serviço de catálogo, diretório e onboarding no frontend; gates, ensaio de migration e todas as suítes novas. Graphify não foi usado.
- Nenhum arquivo foi editado pelo reviewer nas rodadas. Bancos usados nas reproduções foram descartáveis, criados e parados pelo próprio reviewer.

## Rodada 1 — CHANGES_REQUIRED, 2026-09-08

Verificado como sólido já na primeira rodada e mantido nas seguintes:

- **Quatro semânticas de preço:** `PriceType` ganha `STARTING_AT` e `NOT_INFORMED` ao lado de `FIXED`/`ON_REQUEST`, sem reclassificar registro algum; preço obrigatório e não negativo apenas em fixo e a partir de, proibido nos outros dois, na aplicação e em `Service_price_check`/`AppointmentItem_priceSnapshot_check` novas; preço zero só quando explícito, e ausência nunca serializada como zero em Scheduling, IA, BFF, frontend ou importação.
- **Duração explícita e revisão separada de ativo:** `durationMinutes` opcional; `needsReview` em lockstep com duração ausente por `Service_review_check`, com `reviewOrigin` (`IMPORT`/`MANUAL`) só enquanto a pendência existe; predicado único `isOperationalService` (ativo, com duração e fora de revisão) usado por `listForScheduling`/`listOperational` e por `requireActive`, que recusa serviço em revisão com `SERVICE_NEEDS_REVIEW`; corrigir a duração retira a pendência; `PATCH` que não toca a duração preserva a origem da revisão.
- **Atributos do MVP:** `description`, `colorToken` (enum fechado de seis tokens, substituindo o `colorId: null` fixo), `bufferBeforeMinutes`/`bufferAfterMinutes` (default zero) e `recurrenceIntervalDays`, validados e sem efeito operacional (Goals 009 e 011).
- **Acordo comercial:** snapshots de `AppointmentItem` com as quatro semânticas e duração própria opcional; `computeAgreementTotal` como regra única (soma quando todos fixos; a partir de quando há algum a partir de e nenhum sem preço; sem total nos demais), reimplementada de forma equivalente na IA (D-011); `totalPriceType` no agendamento; remarcação passou a derivar a duração de `endAt − startAt` em vez da soma dos snapshots.
- **Importação não fabrica semântica:** o mapper do Minha Agenda deixou de forçar `FIXED`/zero — preço desconhecido vira `NOT_INFORMED`, duração desconhecida vira ausência explícita, item multi-serviço não herda a duração total; `importToAtendly` grava `reviewOrigin: IMPORT`; `diagnoseSnapshot` não bloqueia duração ausente.
- **Migrações:** `20260908170000_goal007_catalog_expand` (valores novos do enum, colunas, `DROP NOT NULL`, constraints de buffer/recorrência/revisão) e `20260908171000_goal007_catalog_constraints` (substituição das constraints de preço e duração) separadas por necessidade — um valor de enum recém-adicionado não pode ser referenciado na mesma transação que o criou.
- **Contratos:** rotas de catálogo do Scheduling e `/v1/services` do BFF com os campos novos; `PUBLIC_API_V1.md` com seção própria; frontend aceitando quatro tipos, duração nula e atributos novos, exibindo "A partir de", "Sob consulta", "Não informado" e "Precisa de revisão"; onboarding normalizando tipos novos para o par binário sem gravar zero; `list_services` da IA expondo `priceType` sempre e o valor só quando existe; comentário do agendamento com os quatro textos.
- **Resíduos do 006:** `addTag` idempotente (`update: {}`), proveniência derivada da sessão no BFF (`actor` fora do corpo), `list_customer_appointments` por `customerId` quando o contato está vinculado.

### R1-01 a R1-05

Registrados pelo IA Loop e fechados na rodada 2: (1) `aiActivationReady` calculado só sobre a tabela do Scheduling e travado em `source === "ATENDLY"`; (2) `/internal/services` sem filtro operacional para a fonte externa, capaz de devolver serviço sem duração ao client da IA; (3) `totalPrice` propagado nas tools da IA sem `totalPriceType`; (4) ausência de testes para as quatro semânticas na IA, serviço em revisão, `list_customer_appointments` por vínculo, `addTag` idempotente e parsers do frontend; (5) DATA_MIGRATION e GAP_ANALYSIS sem registro do modelo novo e do limite de reversão.

## Rodada 2 — CHANGES_REQUIRED, 2026-09-09

### R1-01 a R1-05 — CLOSED

`CalendarService.listOperationalServices` aplica `isOperationalService` a qualquer fonte e alimenta `/internal/services` e `countOperationalServices` (contexto propagado aos seis call-sites de `calendarOverview`; falha da fonte externa conta como zero sem derrubar a leitura); `/internal/service-catalog` mantém o catálogo completo com serviço em revisão listável. `calculateAgreementTotal` substitui `calculateTotalPrice` e `totalPriceType` viaja em `AvailabilityLookup`, no rascunho pendente e nos resultados de disponibilidade e preparo. Testes novos: IA (quatro tipos em `list_services`, quatro textos de comentário, serviço em revisão nunca oferecido nem agendado, compromissos por `customerId` e por telefone), Scheduling (`addTag` repetida preserva autorização), frontend (`service-schema.test.ts`, preço ausente nunca zero). Documentos anotados com evidência do diff.

### R2-01 — P1: `validate:integration` falhava no ensaio de migration

`scripts/goal007-migration-rehearsal.mjs` inseria a sonda `probe-review-ok` para provar a constraint de revisão e, sem apagá-la, comparava a contagem de serviços pós-constraints com a inicial (6 contra 5); a asserção de fingerprint já filtrava `probe-%`, a de contagem não. Falha determinística nas duas rodadas, em clusters distintos, que interrompia o gate antes de `provision:scheduling-test-database`, `test:scheduling-integration`, `test:ai-orchestrator-transport-durability` e `test:evolution-go-webhook-outbox`. As migrations em si estavam corretas: executados manualmente pelo reviewer no mesmo cluster, `migrate deploy` aplicou as duas, a suíte de integração do Scheduling passou 19/19, a da IA 39/39 e o outbox do Go OK.

## Rodada 3 — ACCEPTED, 2026-09-09

### R2-01 — CLOSED

`inventory` passou a contar `Service` com `WHERE "id" NOT LIKE 'probe-%'`, preservando a sonda até a limpeza final e todas as demais asserções.

### Evidência reproduzida pelo reviewer na rodada 3

Ambiente: Windows 11, PostgreSQL 18 descartável criado pelo reviewer (`127.0.0.1:55445`, parado ao final).

| Execução | Resultado |
| --- | --- |
| `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55445/atendly_bff_test npm run validate:integration` | **PASSED — 17/17**: BFF; ensaios 003, 004, 005, 006 e **007** (expansão preserva serviços e snapshots, constraint antiga de preço vale até o passo de constraints, lockstep de revisão desde a expansão, quatro tipos validando após o corte, preço zero explícito preservado); `provision:scheduling-test-database` com oito migrations; Scheduling integração **19/19** (10 de identidade, 9 de catálogo e acordo, incluindo constraints SQL contornando a aplicação, isolamento por tenant e edição do catálogo sem reescrever snapshot); IA integração **39/39**; ownership e outbox do Go |
| `npm run validate:core` | **PASSED — 14 passed, 0 failed, 3 skipped** (`test:bff`, `test:contracts`, `test:health-worker`). IA 185 testes (39 pulados por exigirem banco); Scheduling unit 40; frontend 15 |
| `eslint --max-warnings=0` e `tsc --noEmit` em scheduling-service, ai-orchestrator, bff e frontend (rodada 2, código inalterado desde então) | exit0 |
| `git diff --check` | exit0 |
| Constraints conferidas no banco migrado (`pg_constraint`) | `Service_price_check` e `AppointmentItem_priceSnapshot_check` com quatro ramos; `*_durationMinutes*_check` "positivo quando presente"; `Service_review_check`, `Service_reviewOrigin_check`, buffers e recorrência |
| `prisma migrate diff --from-config-datasource --to-schema` do Scheduling | nenhum drift do Goal007; permanece o drift de forma do Goal006 (`updatedAt` e nomes de FK das três tabelas de cliente) |

### Observações não bloqueantes

1. `countOperationalServices` consulta o provider da fonte vigente (HTTP externo quando é Minha Agenda) em toda leitura de `/internal/calendar`, engolindo falha como zero.
2. O schema de replay da idempotência aplica `totalPriceType: NONE` por default a replays anteriores ao Goal007 mesmo quando `totalPrice` é numérico.
3. O mapper do Minha Agenda não valida a resposta por schema; um preço numérico enviado como string viraria `NOT_INFORMED`. A tratar no Goal010.
4. O onboarding normaliza tipos novos para o par binário ao reenviar e o formulário legado do diretório só exibe os quatro tipos; ambos documentados e de responsabilidade do Goal015.
5. `migrate diff` mantém o drift de forma pré-existente do Goal006.
6. O Developer editou DATA_MIGRATION e GAP_ANALYSIS com redação "pendente de review"; alinhada no fechamento documental.

### Limites

Sem WhatsApp real, deploy, CI hospedada, Minha Agenda real ou credencial real em fixture; modelo e transporte são dublês em todas as suítes; `migrate deploy`/`diff` da IA continuam sem execução local por falta de pgvector.

## Aceite e encaminhamento

- **G-16 fechado na parte de catálogo e snapshot** (quatro semânticas em todos os leitores e constraints, zero só quando explícito, snapshots estáveis com total por regra única); proposta versionada, hold e valor final seguem para o Goal008. **G-17 fechado na parte de catálogo** (duração opcional com revisão separada de ativo, cor, descrição, buffers e recorrência persistidos, IA só oferece serviço operacional); modalidades e regras privadas são do negócio (G-26, Goal018) e a tela com progressive disclosure é do Goal015. Observações 2, 3 e 4 do [review006](006-review.md) fechadas.
- Contratos adotados registrados em D-023. CURRENT_STATE, GAP_ANALYSIS, DATA_MIGRATION, MASTER_PLAN, REUSE_ANALYSIS e TARGET_ARCHITECTURE foram alinhados no fechamento; o SHA do commit de fechamento será registrado em MIGRATION_STATUS pelo IA Loop na etapa posterior, conforme D-017/D-018.
- Nenhum Goal seguinte foi criado nem marcado READY nesta etapa.
