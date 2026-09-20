# Review formal — Goal 027

**Decisão vigente — rodada 6: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-20, conforme o [Goal027](../goals/027-retirada-da-fonte-externa-da-agenda.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–026) foi reaberto, reavaliado ou revertido.

As rodadas 1 a 5 são históricas: CHANGES_REQUIRED, todas fechadas e conferidas na árvore e na execução real, não no relatório do Developer. Dos nove blockers das cinco rodadas, **um único foi de código** (rodadas 1 e 2, o mesmo resíduo em duas metades); os outros oito foram documentação de migração afirmando estado que a árvore já tinha desmentido.

## Escopo e identidade do diff

- Baseline aceita vigente: `c3255982a00c365831de979b46779ccc6ad8656b` (fechamento026). Base imediata da implementação: `ce839ef6caae1a9339e52491d2a99d3713aca426`, HEAD da worktree `.ai-worktrees/goal-027`, **inalterado nas seis rodadas**.
- Snapshot aceito, calculado pelo IA Loop: **78 arquivos**, hash do diff `0e61f85bc25ba26b845718c7ad6e2d235e5a0bb2802d21f5f2c0f5b9c02bb4c3`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **74 arquivos no diff rastreado (+960/−822)** mais quatro arquivos novos não rastreados, todos declarados: `apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql`, `apps/scheduling-service/tests/unit/goal027-calendar-guard.test.ts` (256 linhas), `apps/bff/tests/goal027-onboarding-issues.test.ts` (116 linhas) e `scripts/goal027-calendar-source-migration-rehearsal.mjs` (595 linhas).
- Por área: **frontend** 41 arquivos (+134/−464, o maior saldo negativo), **Scheduling** 11 (+223/−213, com a migration nova), **BFF** 10 (+56/−77), **IA** 2 (+36/−55), **ferramental** 4 (`final-production-audit.mjs` +113/−8, `validate-integration.mjs` +18, dois arquivos de `scripts/tests/` +193) e **documentação** 6 (+187/−5).
- Uma migration nova, e só no Scheduling: `git diff --stat` sobre `apps/{bff,ai-orchestrator}/prisma/migrations/*` volta vazio.
- Inspecionados: o patch completo da rodada 1 e, nas seguintes, o delta exato entre as fotografias, sempre contra a worktree. Nenhum arquivo foi editado pelo reviewer em nenhuma rodada.

## Rodada 1 — CHANGES_REQUIRED, 2026-09-20

O corpo do Goal chegou correto: migration com reescrita declarada e `CHECK`, os 42 pontos de guard convertidos, os cinco códigos de erro mortos, contrato público reduzido, onboarding sem a escolha de fonte e importação única intocada. Três blockers:

1. **A documentação mentia sobre a árvore final** (critérios 29 e 30). A unidade de documentação rodou **antes** da correção da própria rodada e não foi reexecutada depois dela: cinco documentos (`GAP_ANALYSIS`, `DECISIONS`, `CURRENT_STATE`, `REUSE_ANALYSIS`, `VALIDATION_GATE`) ainda afirmavam que a regra estática nova rodava vermelha e que `validate:core` não fechava limpo. Rodei `node scripts/final-production-audit.mjs` na worktree: exit 0, 23 checagens, 22 passed, 0 failed, 1 skip declarado (`production_health`), com `no_external_calendar_source_comparison` verde.
2. **O `400` de `calendar.source` fora do domínio não era exercitado por teste algum** — o critério 13 fora declarado OK por raciocínio ("qualquer valor fora de `ATENDLY` falha o parse Zod"), não por execução.
3. **A constraint criou um modo de falha novo.** `internal-api/routes.ts:94` mantinha `sourceSchema = z.enum(["ATENDLY", "MINHA_AGENDA"])`: para tenant sem `CalendarSettings`, o `upsert` de `PATCH /internal/calendar` criaria a linha com `MINHA_AGENDA` e violaria `CalendarSettings_source_atendly_check` — `23514` como erro Prisma não tratado, isto é, `500` no lugar de recusa limpa. É justamente o resíduo que a regra estática não pega, por ser declaração de tipo e não comparação.

## Rodada 2 — CHANGES_REQUIRED, 2026-09-20

Blockers 1 e 2 fechados e verificados; a metade de runtime do blocker 3 também (`z.enum(["ATENDLY"])` no Scheduling, dois ramos mortos por fonte removidos). Restou a outra metade, no BFF: `apps/bff/src/clients/scheduling/index.ts` ainda declarava `MINHA_AGENDA` na linha 9 — **schema de parse da resposta** de `/internal/calendar`, não só uma assinatura — e na linha 561 (`configureCalendar`). Consequência concreta: quatro sites do BFF (`calendar/routes.ts`, `settings/routes.ts`, `dashboard/routes.ts`, `lib/onboarding-state.ts`) passaram a **normalizar em silêncio** para `null` um valor que o banco não pode mais produzir — exatamente o que §3/§5 recusam — e era a única coisa que mantinha G-10 aberto num Goal cujo objetivo declarado é fechá-lo.

## Rodadas 3, 4 e 5 — CHANGES_REQUIRED, 2026-09-20

O código parou de mudar na rodada 3: `apps/bff/src/clients/scheduling/index.ts` passou a `z.enum(["ATENDLY"])` e `{ source: "ATENDLY"; timezone: string }`, preservando `provider: z.enum(["MINHA_AGENDA"])` nas linhas 445/487, que é `IntegrationProvider` da importação única. As três rodadas seguintes foram gastas em documentação que não acompanhava a árvore:

- **Rodada 3:** cinco documentos ainda declaravam aberto o estreitamento de `configureCalendar` e G-10 não fechado — falso desde a própria rodada 3.
- **Rodada 4:** `REUSE_ANALYSIS.md:81` ainda afirmava resíduo de vocabulário em três arquivos corrigidos rodadas antes, e nomeava `CalendarProviderFactory.build`, método que não existe (o real é `create`); nove pontos atribuíam à rodada 4 um estreitamento de tipo que está no patch da rodada 3 — a rodada 4 não tocou em código.
- **Rodada 5:** executou a parte principal da rodada 4, mas deixou duas sub-exigências enunciadas nos mesmos blockers: o nome `build` em dois pontos, e o bloco LIMITE de `CURRENT_STATE.md` declarando escopo "WU-01 a WU-07 do Goal027, round 1", em contradição com o parágrafo imediatamente acima dele.

## Rodada 6 — ACCEPTED, 2026-09-20

Os dois blockers da rodada 5 fechados e verificados na árvore: `REUSE_ANALYSIS.md:81` e `CURRENT_STATE.md:2484` leem `CalendarProviderFactory.create`, batendo com `provider-factory.ts:21`; o bloco LIMITE passou a declarar as WU-01 a WU-07 mais as correções das rodadas 2 a 6. Nenhum arquivo sob `apps/` foi tocado nesta rodada.

Reverificação do Goal inteiro contra o diff `ce839ef` → worktree:

- **§1 dado.** A migration faz `UPDATE "CalendarSettings" SET "source" = 'ATENDLY', "updatedAt" = CURRENT_TIMESTAMP WHERE "source" <> 'ATENDLY'` e só depois `ADD CONSTRAINT "CalendarSettings_source_atendly_check" CHECK ("source" = 'ATENDLY')`, sob guarda `duplicate_object` — idempotente, sem apagar tabela, coluna, enum ou linha, com regra e motivo escritos no cabeçalho. O enum `CalendarSource` mantém os dois valores, justificado nos comentários do `schema.prisma` por `MigrationJob.source`/`target` (D-026). O ensaio é passo nomeado em `validate-integration.mjs`, roda verde contra PostgreSQL real, reporta `rewrote 2 of 3 rows` e obtém um `23514` de verdade ao tentar voltar a `MINHA_AGENDA`.
- **§2 Scheduling.** `requireAtendlySource` saiu de `calendar-service.ts` (hoje `requireSettings`) e `requireAtendlyCalendarForSeries` virou `requireCalendar`: o `404 CALENDAR_SETTINGS_NOT_FOUND` fica, só o `409` condicional por fonte cai. `goal027-calendar-guard.test.ts` prova o `404` e o caso positivo por grupo de rota nos dois módulos. A factory ficou com um ramo só e perdeu o parâmetro `source`, com o chamador atualizado. Nenhuma capability mudou de nome.
- **§3/§4 contrato e IA.** `publicSource` não existe mais; `calendar.source` é `"ATENDLY" | null` em toda rota pública; `CALENDAR_INTEGRATION_NOT_CONNECTED` saiu de `onboardingIssues`, com `AVAILABILITY_REQUIRED` valendo para toda fonte escolhida, coberto por `goal027-onboarding-issues.test.ts`. Na IA, `holdsUnsupported` e o `catch` que devolvia `null` saíram; `holdProposedSlot` devolve `SchedulingHold` não anulável e os campos de hold deixaram de ser opcionais nos dois pontos de chamada.
- **§5 frontend.** `calendarSourceSchema` é `z.enum(["ATENDLY"])`; `personAgendaGuard` ficou só com o ramo de fonte não escolhida; o onboarding perdeu `minha-agenda-conectar`, `ExternalUnavailable` e a opção `EXTERNAL`, mantendo `fonte-da-agenda` como confirmação explícita de opção única — uma das duas saídas que §5 autoriza.
- **§8 importação única.** `ConnectSourceScreen`, `features/imports/`, `IntegrationConnection`, `ExternalEntityMap` e `ImportSession` não aparecem no diff. As três suítes de integração de importação mudaram só o fixture de `CalendarSettings` para `ATENDLY`, com o motivo no comentário — mudança certa, já que a constraint recusaria o fixture antigo.
- **§7 regra estática.** Três `check(...)` novos; a regra de comparação exige o operador colado a `source`/`calendarSource`, e é isso que deixa `IntegrationProvider.MINHA_AGENDA` passar. `excludeLegitimateAbsenceAssertions` ganhou comentário e é exercitada dos dois lados. 32 casos verdes em `test:gate`. Toda menção sobrevivente do vocabulário retirado em `apps/` é prosa entre crases dentro de comentário, que as regras permitem por desenho.
- **Gates.** 12/12 PASSED nesta rodada, executados depois da edição da rodada, portanto sobre a árvore final: typecheck dos quatro apps, lint, três suítes dirigidas, `test:gate`, `validate:core`, `validate:integration` (com o ensaio novo) e `validate:ui` nas cinco larguras. `git status --porcelain` lista apenas os quatro arquivos novos declarados; nenhum comando `pnpm`/`corepack` foi invocado.

## O que o diff aceito entrega

- **A fonte externa deixou de ser um estado alcançável do dado.** Toda linha de `CalendarSettings` com `source <> 'ATENDLY'` foi reescrita, e `CalendarSettings_source_atendly_check` impede o valor de voltar mesmo por escrita fora do serviço. É a primeira migration deste repositório que **reescreve** dado existente em vez de só acrescentar estrutura, e por isso a reescrita é contada e reportada, não silenciosa.
- **O negócio preso em `MINHA_AGENDA` deixou de existir como classe.** Desde o corte do Goal010 ele recebia `409` em toda escrita, oferta e leitura operacional, sem caminho de volta; o rótulo saiu e ele passa a ser cobrado por `AVAILABILITY_REQUIRED` como qualquer negócio Atendly. Nada mais dele muda.
- **O histórico ficou, por decisão.** O enum `CalendarSource` mantém `MINHA_AGENDA` porque `MigrationJob.source`/`target` o gravam; nenhuma linha de `MigrationJob`, `MigrationJobItem`, `MigrationConflict`, `IntegrationConnection`, `ExternalEntityMap` ou `ImportSession` foi tocada.
- **O contrato público encolheu pela segunda vez, agora por domínio de campo.** `calendar.source` é `"ATENDLY" | null`; `PATCH /v1/onboarding` mantém o campo e recusa qualquer outro valor com `400`. Redução de domínio, não remoção de campo — o consumidor existente continua válido.
- **Cinco códigos de erro morreram com a condição que recusavam** (`OPERATION_MANAGED_EXTERNALLY`, `EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED`, `EXTERNAL_CALENDAR_SERIES_UNSUPPORTED`, `EXTERNAL_CALENDAR_HOLD_UNSUPPORTED`, `MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED`), e as 42 chamadas de guard por fonte deram lugar à leitura que sobrou.
- **A IA parou de esconder falha de hold atrás de um `null`.** Enquanto existia fonte legitimamente sem hold, devolver `null` era correto; hoje toda agenda tem hold, então falha ao reservar é informação real sobre a agenda e propaga pelo caminho normal de erro da tool, com teste próprio.
- **A interface parou de oferecer e de explicar o que não existe**, sem tocar na importação: o onboarding perdeu a escolha "Minha Agenda como fonte oficial" e o desvio para `ExternalUnavailable`, e **importar do Minha Agenda continua oferecido, no mesmo lugar, com a mesma copy**.
- **A subtração tem prova automática contra o retorno**, e uma das três regras nasceu achando resíduo genuíno na árvore real, não no diff isolado.

## Limites do aceite e resíduos

- **G-10 fecha por inteiro.** É a primeira vez que a linha fecha sem ressalva: dado, guards, contrato, telas e vocabulário interno. **G-32 continua aberto e não foi tocado.**
- **M6 avança, mas não completa.** O enum mantém os dois valores de propósito, e o gate **M4** sobre a origem real do Minha Agenda segue aberto — nada aqui prova coisa alguma contra a API real, sem credencial autorizada.
- **`apps/frontend/src/features/system/SystemScreen.tsx` ainda serve o cenário `external-unavailable`** em `/sistema/agenda-indisponivel`, com `source: "external"` minúsculo no `ShellConfig` e a frase "Minha Agenda está indisponível". É superfície preexistente, não enumerada em §5, não referenciada por link vivo, e fora do alcance da regra estática de §7, que casa só os valores do contrato em maiúsculas. Não bloqueia; fica declarado para um Goal futuro.
- **Cinco rodadas para um único defeito de código.** O núcleo chegou pronto na rodada 1; oito dos nove blockers foram documentação de migração afirmando um estado que a árvore já tinha desmentido, quase sempre porque a unidade de documentação rodou antes da correção da mesma rodada e não foi reexecutada depois. Vale como regra de execução para os Goals seguintes, não como defeito do produto: documentação de fechamento se escreve **depois** da última mudança de árvore, ou se reexecuta.
