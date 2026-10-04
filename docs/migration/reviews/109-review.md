# Review formal — Goal 109

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal109](../goals/109-valores-gravados-e-contratos-passam-a-avenly-sem-quebrar-dado-nem-sessao.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

Os valores gravados e os contratos que ainda diziam Atendly passam a Avenly, sem quebrar dado nem sessão. O rótulo `ATENDLY` dos enums `CalendarSource` (Scheduling) e `HumanControlSource` (IA) passa a `AVENLY` por `ALTER TYPE … RENAME VALUE`, em migration nova e idempotente, sem reescrever linha. A constraint do Goal027 passa a `CalendarSettings_source_avenly_check`. Os três decodificadores da fonte da agenda (contrato, BFF e Scheduling) aceitam `"ATENDLY"` e `"AVENLY"` e devolvem só `"AVENLY"`. Os cookies passam a `avenly_session` e `avenly_csrf`, com leitura dos nomes antigos e sem `Set-Cookie` novo em leitura comum. As variáveis do texto legal passam a `AVENLY_*`, com `ATENDLY_*` como reserva. A chave do `localStorage` passa a `avenly:brand-signature-*`, e a chave antiga ainda vale. Nenhum texto de tela, identificador, arquivo, CSS ou migration existente mudou: isso continua do 102. Decisão: [D-120](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `308f85f03410990afc8d465a39d575a6193e0a69` (Goal105). Base imediata da implementação: `27ede84e4bf9696ada72122a66e21db5cc1da6da`, HEAD da worktree `.ai-worktrees/goal-109`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **175 arquivos**, hash do diff `6a17e06671caad671335e68054767b5873478f352e241f5661bcfcdfecb8e3c8`. Mudança posterior nesses arquivos exige avaliar o novo diff. Impressão digital de código dos gates finais: `code-v1:2d3cbafe…`.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito (166 modificados e 9 novos):
  - Bancos: as migrations novas `apps/scheduling-service/prisma/migrations/20261003120000_goal109_avenly_calendar_source/migration.sql` e `apps/ai-orchestrator/prisma/migrations/20261003120000_goal109_avenly_human_control_source/migration.sql`, e os dois `schema.prisma`.
  - Produção do Scheduling: `src/modules/internal-api/routes.ts` (`sourceSchema`). Produção da IA: `internal/routes.ts`, `session/session-policy.ts` e `graph/message-graph.ts`.
  - Contrato: `packages/public-api-contract/src/schemas.ts` (`calendarSourceSchema` com `transform`).
  - BFF: `lib/calendar-source.ts` (novo), `clients/scheduling/index.ts`, `config/env.ts`, `lib/auth.ts`, `lib/onboarding-state.ts`, `lib/timezone-reconciliation.ts` e as rotas de `calendar`, `customers`, `dashboard`, `onboarding`, `services` e `settings`; `PUBLIC_API_V1.md` e `.env.example`.
  - Frontend: `BffHttpClient.ts`, `config/legal-details.ts`, `scripts/check-legal-config.mjs`, `shared/ui/Brand.tsx`, `onboarding/blocks/schedule.tsx`, `AgendaBoard.tsx`, `AgendaDayColumn.tsx`, `AppointmentDetail.tsx`, `CalendarSettings.tsx`, `settings/shared/labels.ts` e `.env.example`.
  - Ensaios do gate, só onde conferem o valor: `scripts/goal028-restore-rehearsal.mjs`, `scripts/tests/goal028-restore-rehearsal.test.mjs`, `scripts/goal029-timezone-reconciliation-rehearsal.mjs`, `scripts/goal030-mvp-journey-rehearsal.mjs`, `scripts/goal074-human-takeover-migration-rehearsal.mjs` (`alignAiDurabilityTargetWithGoal109`) e `scripts/validate-integration.mjs` (só um comentário).
  - Provas novas, seis arquivos `goal109-*` com **61** testes: Scheduling 7 (provas 1 e 3), IA 3 (prova 2), BFF 23 (provas 4 e 5) e 7 (prova 6), frontend 4 (prova 7) e 17 (prova 8).
  - Testes existentes ajustados só onde afirmavam `"ATENDLY"` como saída ou o nome antigo do cookie como padrão; os que enviam `"ATENDLY"` como entrada não mudaram. A única mudança de asserção fora disso é a contagem 209 para 210 em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` (`DIAG-001`), pelo arquivo novo `lib/calendar-source.ts`.
  - Documentos: `docs/migration/DECISIONS.md` (D-120), `CURRENT_STATE.md` e `VALIDATION_GATE.md`, só por acréscimo.
- Nenhuma migration existente, nenhum CSS, nenhum arquivo de `e2e/`, nenhum texto visível, `render.yaml` e nenhuma configuração de gate mudaram no snapshot aceito. `scripts/goal027-calendar-source-migration-rehearsal.mjs` não mudou.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers.** O código de produção foi aceito no mérito. Os blockers: (1) a prova 4 testava só `calendarSourceSchema` isolado, sem os quatro schemas do contrato que o usam (`calendarStateSchema`, `onboardingStateSchema`, `customerListSchema` e `serviceListSchema`); (2) a prova 5 não cobria `GET /v1/dashboard`; (3) refazer os controles 1, 11 e 12, `validate:core` e `validate:integration` depois disso e atualizar as contagens; (4) D-120 (h) não declarava as recusas de escrita da janela de deploy.
2. **Rodada 2 — `CHANGES_REQUIRED`, 3 blockers, só de documento.** A FIX-001 resolveu os blockers 1 e 2 no teste `apps/bff/tests/goal109-avenly-calendar-source.test.ts` (de 14 para 23 testes) e refez os controles 1, 11 e 12, o inventário e os gates. Os blockers: D-120 sem as contagens da rodada 2; a janela de escrita do BFF para o Scheduling (`PATCH /internal/calendar`) ainda não declarada; CURRENT_STATE ainda tratando a rodada 1 como execução final.
3. **Rodada 3 — `ACCEPTED`, 0 blockers.** A FIX-001 mudou só D-120 e a seção do Goal109 de CURRENT_STATE. Nenhum arquivo fora de `docs/` mudou desde a rodada 2, e o IA Loop reaproveitou os gates da rodada 2 com a mesma impressão digital.

As correções rodaram como unidade FIX-001; a da rodada 3 com o perfil `SONNET_MEDIUM`.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal109 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal109) e na "Prova" de D-120.

- **Código, conferido pelo Tech Lead.** As duas migrations só renomeiam o rótulo e conferem `pg_enum` ou `pg_constraint` antes de agir, então reaplicar não faz nada. `presentedCredential` lê a sessão pelo nome configurado e, na falta, por `atendly_session`. `legacyCookieNames()` impede que o cookie recém-gravado seja apagado quando o ambiente configura o nome antigo como atual. Nenhum `GET` comum emite `Set-Cookie`. O literal antigo da fonte é `LEGACY_CALENDAR_SOURCE`, um ponto em cada um dos três decodificadores.
- **Janela de deploy, conferida contra a baseline.** O caminho de escrita do BFF para o Scheduling é `PATCH /internal/calendar`, por `configureCalendar` em `onboarding/routes.ts:181` e em `timezone-reconciliation.ts:192`. Na baseline (`git show HEAD`), `internal-api/routes.ts:112` tem `sourceSchema = z.enum(["ATENDLY"])` e recusa `AVENLY` com `400`. D-120 (h) e CURRENT_STATE declaram as duas janelas de escrita e dizem que a ordem recomendada reduz só a janela de leitura.
- **Provas.** Na rodada 2, o Tech Lead reexecutou o arquivo do BFF sem banco: 18 passam e 5 de integração ficam pulados. O arquivo tem 23 testes, contando os `it.each`. Contra a baseline, medido pelo Developer, **38** dos 61 testes novos reprovam e **23** passam (30 e 22 dos 52 da rodada 1; 8 e 1 dos 9 da FIX-001, com `schemas.ts` de `HEAD`); os 23 estão nomeados no VALIDATION_GATE.
- **Controles negativos do §8**, rodados pelo Developer com a restauração conferida por sha256. Os sete controles do Goal reprovam com o defeito e passam sem ele (WU-14, rodada 1). Os controles 1, 11 e 12 foram refeitos na FIX-001 da rodada 2: **5**, **2** e **7** falhas de 23, e 23 passam sem o defeito. O Tech Lead aceitou os controles pelo registro e não os reexecutou.
- **Inventário do §7.** **144** linhas, todas classificadas: 30 em (i), 19 em (ii), 86 em (iii), 6 em (iv) e 3 em (v). Na rodada 3, o Tech Lead refez o `git grep`: 90 linhas em arquivos rastreados e 54 em arquivos novos, total 144.
- **Gates do IA Loop na rodada 2,** reaproveitados na rodada 3, todos com exit 0, na árvore `code-v1:2d3cbafe…`: typecheck de `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` (WU-05 a WU-08), testes dirigidos do frontend (WU-09), `test:gate` (WU-10), `validate:core` (WU-11, 102 s), `validate:ui` (WU-12, 49 s) e `validate:integration` (WU-13, 716 s). Na rodada 3, só `git diff --check` (WU-15) rodou de novo, com exit 0. A execução da FIX-001 da rodada 2, com as contagens, está no VALIDATION_GATE: `validate:core` com 17 passos (15 passaram e 2 pulados por desenho) e a suíte do frontend com **149** arquivos e **1840** testes; `validate:integration` com 36 de 36 passos em 711 s, a integração do BFF com **507** testes e o gate autenticado com **275** passaram, sem retentativa. `test:gate` segue em **242**, e `validate:ui` em **169** passaram com 0 retentativas (WU-12, rodada 1).

## Aceito sem prova completa

1. **O deploy real no Render e a duração da janela de D-120 (h).** Nada nesta árvore atravessa o Render. A janela fica declarada, sem deploy em fases, porque ainda não há usuário real ([FINAL_AUDIT](../FINAL_AUDIT.md) §7).
2. **Uma sessão aberta antes do deploy, num navegador real.** A prova 6 usa requisição HTTP contra o BFF com `atendly_session`, não um navegador.
3. **O texto legal com os valores reais do ambiente de deploy.** A reserva `ATENDLY_*` é provada por teste, com valores de teste.
4. **Os controles 2 a 7 e o vermelho da baseline das provas 1 a 3 e 5 a 8** são da rodada 1. A FIX-001 editou só o teste do BFF e os documentos, e nenhum desses controles toca o que ela mudou.
5. **A prova 2 dentro de `validate:integration`.** O passo `test:ai-orchestrator-transport-durability` roda `tests/integration` da IA, mas o relatório traz só "passed", sem contagem por arquivo. A prova 2 foi executada à parte na WU-14 (3 de 3, contra um PostgreSQL com `pgvector`). Em `validate:core` ela fica pulada por falta de banco.

## Observações registradas, sem mudar a decisão

1. **O controle 1 basta como está escrito no Goal.** Tirar `"ATENDLY"` só do contrato reprova a prova 4 (5 falhas de 23) e não alcança a prova 5, porque o BFF tem o seu `calendarSourceSchema` por desenho (D-120 (b)). Os controles 11 (o schema do BFF) e 12 (os dois juntos) cobrem a prova 5. A pergunta deixada ao Tech Lead no "Limite declarado" de D-120 fica respondida assim, sem reescrever o controle 1.
2. **Os seis pontos de julgamento do inventário ficam como propostos em D-120 (i).** As migrations novas e os cinco ensaios que montam o estado legado ficam em (i); `goal030-mvp-journey-rehearsal.mjs` e a fixture do audit estático ficam em (iv); as linhas de `PUBLIC_API_V1.md` e dos dois `.env.example` ficam em (ii); os três comentários históricos sobre o Goal027 ficam em (v). Para o 102, a proposta continua: trocar as linhas de (iv), manter as de (i), (iii) e (v), e tirar as de (ii) só quando a compatibilidade for contraída.
3. **Dois scripts seguem enviando `"ATENDLY"` de propósito**, `scripts/lib/visual-seed.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs`, além de `goal030-mvp-journey-rehearsal.mjs` no `PATCH /v1/onboarding`. Eles provam D-120 (b) a cada `visual:compare` e a cada gate, até o 102 trocá-los.
4. **Duas durações de `validate:integration` na rodada 2.** O IA Loop mediu 716 s na WU-13. A execução da FIX-001, registrada no VALIDATION_GATE, levou 711 s. As duas têm exit 0 e são da mesma árvore de código.
5. **Ambiente da rodada 2.** `validate:integration` usou um PostgreSQL nativo em loopback, com a extensão `vector`, num cluster temporário. Um contêiner Docker com porta mapeada não serve, e o banco de desenvolvimento na porta 5555 não foi tocado.
6. **Este review não estava em disco durante as rodadas.** Os blockers foram escritos autocontidos.

## O que o aceite não prova

- O deploy no Render, a ordem frontend, BFF, Scheduling e IA na prática e a duração das janelas de leitura e de escrita.
- Uma sessão real emitida antes do deploy, num navegador.
- O texto legal com os valores reais do ambiente.
- A troca de nome em texto, identificador, arquivo, pacote e documentação, que continua do 102.
- A remoção do valor antigo, que só vem com motivo medido (D-120, "Revisar se" (2)).
