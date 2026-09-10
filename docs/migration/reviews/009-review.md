# Review formal — Goal 009

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-09, em review **DEEP dirigido** — regras de oferta aplicadas dentro do motor, ocupação estendida por buffer, séries finitas materializadas, atomicidade da série de atendimento e migração aditiva — conforme o [Goal009](../goals/009-disponibilidade-pessoal-recorrencia.md). Aceite restrito ao diff identificado abaixo; não representa commit, deploy, merge, execução hospedada de CI nem WhatsApp real.

A rodada 1 é histórica: CHANGES_REQUIRED com sete blockers, todos fechados. Nenhum aceite anterior (001–008) foi reavaliado.

## Escopo e identidade do diff

- Baseline aceita vigente: `1dc170eb8b04d6ee8a706dca089cfe4538175125` (fechamento008). Base imediata da implementação: `9013f14d28daec714d6ab86a64ba52ace60f0d1e`, HEAD da worktree `.ai-worktrees/goal-009`, inalterado nas duas rodadas. O conteúdo entre a baseline aceita e `9013f14` é tooling do IA Loop e documentação de planejamento, preservado.
- Snapshot aceito, calculado pelo IA Loop: **40 arquivos**, hash do diff `e0f446445fd1f3933d030b604e8fcbc626c5242562de7e4c76c8a953edaf1203`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Inspecionados: patch completo de cada rodada; a migration `20260909190000_goal009_offer_rules_and_series` e o `schema.prisma` do Scheduling; `atendly-availability.ts`, os módulos novos `calendar/availability-exceptions.ts`, `calendar/block-series.ts` e `appointments/appointment-series-service.ts`, `calendar/time-blocks.ts`, `calendar-provider.ts`, `calendar-service.ts`, `holds/appointment-hold-service.ts`, o provider Atendly, o provider Minha Agenda, `shared/auth/internal-auth.ts`, `internal-api/routes.ts` e `calendar/routes.ts`; client, tipos e `assistant-tools.ts` na IA; client, rotas de agenda/configurações e `PUBLIC_API_V1.md` no BFF; schemas e serviços de dados no frontend; ensaio de migration, gates e todas as suítes novas. Graphify não foi usado.
- Nenhum arquivo foi editado pelo reviewer nas rodadas. Os bancos usados nas reproduções foram descartáveis, criados e destruídos pelo próprio reviewer.

## Rodada 1 — CHANGES_REQUIRED, 2026-09-09

O domínio entregue já estava fiel ao Goal e permaneceu na rodada seguinte: regras de oferta sempre lidas de `CalendarSettings` dentro do motor (nunca decididas por quem chama), granularidade retirada da requisição na oferta, buffers como ocupação externa por snapshot com `maxServiceBuffer` que nunca soma buffers intermediários, exceções e séries sob `runCalendarWrite` + `lockCalendarDays`, séries finitas com ocorrências materializadas e teto configurável, série de atendimento com hold por ocorrência e confirmação em transação única, `source` derivado do chamador (`callerSource`) e `requireHumanCaller` barrando a IA em exceção, bloqueio, compromisso e série. Migration aditiva com constraints explícitas. Verificado nesta rodada: Scheduling `npm test` 117/117; nenhuma tool da IA cria exceção, bloqueio ou override; `PUBLIC_API_V1.md` cobrindo as rotas novas.

### R1-01 a R1-07

1. **R1-01 (P1):** `validate:integration` não havia sido executado — os critérios que dependem de locks reais e do ensaio da migration estavam sem prova, e `DATA_MIGRATION.md` §7 alegava falta de banco acessível, alegação que não se sustentava (a receita de `VALIDATION_GATE.md:100-117` provisiona sem credencial real, e o Goal008 rodou no mesmo ambiente).
2. **R1-02 (P1):** `tests/integration/goal009-occupancy.test.ts:164` esperava `APPOINTMENT_HOLD_EXPIRED` onde o caminho real produz `SLOT_UNAVAILABLE`: o `createAppointment` intruso não libera o hold da ocorrência (`releaseHoldWithin` só existe na remarcação), então quem recusa é `assertAvailable`.
3. **R1-03 (P1):** no caminho principal de falha da série a resposta não identificava a ocorrência nem trazia alternativas — `assertAvailable` lançava `SLOT_UNAVAILABLE` sem `details` e `suggestAlternatives` só agia quando `details.holdId` existia.
4. **R1-04 (P1):** a ocupação estendida por buffer não enxergava vizinho cujo intervalo **cru** caísse fora da janela consultada; como `assertAvailable` consulta `days: 1`, a fronteira da meia-noite ficava descoberta.
5. **R1-05 (P1):** faltavam os testes de integração do BFF exigidos pelo critério 8 para as rotas novas (CSRF por cookie, tenant da sessão, decisão humana de conflito).
6. **R1-06 (P1):** faltava a cobertura de isolamento por tenant do critério 1 para as entidades novas — as suítes semeavam um único tenant.
7. **R1-07 (P1):** o contrato da série divergia da documentação e do teto: `PUBLIC_API_V1.md` afirmava exigir `Idempotency-Key`, mas a rota interna não a lia e `confirm` não gravava resultado idempotente (retentativa devolveria 409 em vez de replay); e o teto de ocorrências só era validado na pré-visualização.

## Rodada 2 — ACCEPTED, 2026-09-09

### R1-01 a R1-07 — CLOSED

- **R1-01:** gate executado e verde, verificado pelo reviewer (abaixo). `DATA_MIGRATION.md` §2 e §7 deixaram de alegar falta de banco e passaram a descrever o passo do gate e a cobertura acrescentada. Os dois defeitos corrigidos no `goal009-migration-rehearsal.mjs` — inventário M0 consultando `minLeadMinutes` antes da migration e o enum `CalendarEffectEntityType` ausente no schema legado reconstruído — conferem com o código.
- **R1-02:** expectativa corrigida para `SLOT_UNAVAILABLE` e ampliada (`occurrenceIndex`, `holdId`, `occurrenceDate`, `alternatives`, e alternativa diferente do horário tomado).
- **R1-03:** `occurrenceFailure()` envolve o laço de confirmação preservando código, mensagem e status e acrescentando a identificação da ocorrência sem sobrescrever detalhes anteriores; `suggestAlternatives` passou a agir também na falha do motor. Coberto em unidade, integração e BFF. O contrato ficou explícito: hold vencido, consumido ou liberado responde `APPOINTMENT_HOLD_EXPIRED`; horário tomado entre a pré-visualização e a confirmação responde `SLOT_UNAVAILABLE` — o hold ainda era válido, quem recusou foi a disponibilidade.
- **R1-04:** as três consultas de ocupação passaram a usar `searchStart`/`searchEnd`. Álgebra conferida: `searchStart = rangeStart − (bufferBefore do candidato + maior bufferAfter gravado no tenant)` e `searchEnd = rangeEnd + (bufferAfter do candidato + maior bufferBefore gravado no tenant)` cobrem exatamente os dois lados; é superconjunto, e o descarte fica no teste de sobreposição. Dois testes de fronteira exercitam o alargamento (meia-noite com `bufferAfter` 30; vizinho iniciando depois do fim do range com `bufferBefore` 60).
- **R1-05:** `apps/bff/tests/goal009-calendar-routes.integration.test.ts`, com 7 casos no padrão de `tests/helpers/integration.ts`: tenant da sessão contra header, query e body; CSRF nas dez mutações novas, recusando antes de qualquer chamada ao upstream; decisão humana de conflito atravessando intacta; `source` nunca vindo do corpo; `Idempotency-Key` repassada; detalhes da ocorrência que falhou propagados sem reescrita.
- **R1-06:** quatro casos de isolamento em unidade com um segundo tenant e um caso equivalente em integração contra PostgreSQL, com recontagem do tenant B após as tentativas de A. "Tenant não selecionável por header, body ou query" é provado no BFF, que é onde a sessão existe.
- **R1-07:** idempotência real via `CalendarMutationIdempotency` com o resultado gravado dentro da transação, efeito novo `APPOINTMENT_SERIES` (schema mais `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, aditivo e retomável, aplicado limpo em PostgreSQL 18 dentro de transação), `recoverSeries()` relendo por `seriesId`, teto validado antes de reivindicar a chave e rota interna lendo a chave da requisição; `PUBLIC_API_V1.md` deixou de dizer que a falha é sempre `APPOINTMENT_HOLD_EXPIRED`. Replay provado em unidade e contra banco real. `FAILED` continua reclaimável no `claim()`, então uma confirmação recusada não trava a chave.

### Evidência reproduzida pelo reviewer na rodada 2

Ambiente: Windows 11, cluster PostgreSQL descartável provisionado pelo reviewer pela receita de `VALIDATION_GATE.md:100-117` (PostgreSQL 18.4, loopback 55432, `trust`, sem credencial real), destruído ao final.

| Execução | Resultado |
| --- | --- |
| `npm run validate:integration` | **PASSED — 19/19**, 0 failed, 0 skipped, 0 not_run, incluindo `rehearse:goal009-occupancy-migration` e `test:scheduling-integration` |
| `npm run validate:core` | **PASSED — 14 passed, 0 failed, 3 skipped** (`test:bff`, `test:contracts`, `test:health-worker` — skips preexistentes e declarados no próprio output) |
| `tests/unit/goal009-occupancy.test.ts` | 29 passed |
| `tests/integration/goal009-occupancy.test.ts` (PostgreSQL real) | 4 passed, nenhum skip |
| `apps/bff/tests/goal009-calendar-routes.integration.test.ts` | 7 passed |
| `git diff --check` e `git status` | limpo; exatamente os 40 arquivos do escopo, sem commit, push ou PR, e sem documento de controle da migração tocado |

### Observações não bloqueantes

1. `decidedBy` da decisão humana na indisponibilidade vem do corpo da requisição e atravessa BFF → Scheduling sem ser derivado do chamador autenticado, enquanto `createdBy` da série de bloqueio usa o usuário do contexto. A atribuição do override fica declarável pelo cliente — mesma classe do resíduo de `source` que este Goal fechou. Derivar do contexto, mantendo só o motivo no corpo, quando as telas de agenda (Goal016) tocarem essas rotas.
2. `maxNeighborBuffer()` faz dois agregados por tenant, sem recorte de intervalo, a cada busca de slots; e a pré-visualização da série chama a busca de disponibilidade até `2·janela+2` vezes por ocorrência. Correto e conservador, mas o custo cresce com o histórico do tenant. A alternativa — teto de buffer no catálogo — é decisão de produto e ficou corretamente fora desta rodada.
3. `upstreamDetails` no `internal-http-client` é aditivo e não colide com chaves existentes, mas vale para todas as rotas que falam com serviço interno. Os `details` que os serviços internos produzem hoje são de negócio, sem segredo nem dado pessoal. `PUBLIC_API_V1.md` documenta o campo só na seção da série; generalizar quando outra rota precisar dele.
4. `editBlockSeriesFromDate` herda `occurrenceCount` e reinicia a contagem — uma série de dez editada na quinta ocorrência fica com quatro passadas mais dez futuras. Defensável, mas convém documentar no módulo.
5. `stepMinutes` continua no tipo de consulta do `BffCalendarService` e no corpo de confirmação e de hold do BFF, aceito e ignorado por compatibilidade; a disponibilidade já não o aceita.
6. Cosmético: o cabeçalho de `goal009-migration-rehearsal.mjs` herdou do ensaio do Goal008 a frase sobre deixar o banco pronto para a suíte de integração, que usa outro banco.

### Limites

Sem WhatsApp real, deploy, CI hospedada, Minha Agenda real ou credencial real em fixture; modelo e transporte são dublês em todas as suítes. Nenhum tenant real foi migrado: a migration foi exercitada apenas sobre fixture legada em banco descartável. Não há tela: visualizações Dia/Semana/Mês, dias ocultos e formulários ficam no Goal016 e no Goal018, e a oferta proativa de recorrência pela IA no Goal011.

## Aceite e encaminhamento

- **G-13 fechado na parte de domínio e contratos** (regras de oferta aplicadas pelo motor, buffer como ocupação externa com snapshot, exceções geridas por rota, compromisso pessoal distinto de bloqueio, séries de bloqueio e de atendimento finitas com ocorrências materializadas, edição por ocorrência e "desta data em diante"). **DATA-11 fechado** na mesma medida. Visualizações e telas seguem no Goal016; modalidades e dados do negócio no Goal018.
- Resíduo do Goal008 fechado no mesmo diff: as rotas internas de agenda derivam `source` do chamador autenticado (BFF → `USER`, IA → `AI`) e ignoram `source` do corpo; a observação 1 do review008 deixa de valer. A observação 2 (hold de rascunho substituído) permanece para o Goal011; a observação 3 (testes dedicados do BFF e de schema do frontend) foi fechada para as rotas e campos deste Goal.
- D-006 permanece ACCEPTED e passa a cobrir também exceções, regras e séries sob a mesma política. Contratos adotados registrados em D-025.
- CURRENT_STATE, GAP_ANALYSIS, DATA_MIGRATION, DECISIONS, TARGET_ARCHITECTURE, MASTER_PLAN e REUSE_ANALYSIS foram alinhados no fechamento; o SHA do commit de fechamento será registrado em MIGRATION_STATUS pelo IA Loop na etapa posterior, conforme D-017/D-018.
- Nenhum Goal seguinte foi criado nem marcado READY nesta etapa.
