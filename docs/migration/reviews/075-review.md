# Review formal — Goal 075

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-29, conforme o [Goal075](../goals/075-fidelidade-visual-clientes.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–071, 073 e 074) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 4 blockers e a rodada 2 terminou com zero.

O Goal corrige **QA CL-01…CL-03** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e a **observação 1 do [review074](074-review.md)**. O Scheduling passa a calcular, no fuso do calendário e sobre o histórico inteiro, o próximo e o último atendimento de cada cliente e os números do perfil. O contrato público ganha esses campos como opcionais, e `GET /v1/conversations` ganha o filtro `customerId`. A lista de Clientes mostra "próximo", "último" ou "sem atendimentos", agrupada por letra. O perfil tem cabeçalho com "Conversa", "Agendar" e "Editar dados" e as abas Resumo, Atendimentos e Notas ([D-090](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `67877555caf7addbbb4bbd68aaa4676c9f0aefde` (Goal069). Base imediata da implementação: `0de786949bf38707af66991111f4527825334e4b`, HEAD da worktree `.ai-worktrees/goal-075`, inalterado nas duas rodadas. O commit `0de7869` é só documental (fechamento do Goal069 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **34 arquivos**, hash do diff `9ff8794b8a413af6abdf9108dc05cc193e3b59454347677ce1c05f46bb0a8d25`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e oito arquivos rastreados**, por `git diff --numstat 0de7869`:
  - `apps/scheduling-service/`: `modules/customers/atendly-customer-service.ts` (+180/−5, `nextAppointmentsByCustomer`, `lastAppointmentsByCustomer`, `appointmentHighlights`, `appointmentStats`) e `modules/internal-api/routes.ts` (+25/−10, fuso do calendário na lista e no detalhe).
  - `packages/public-api-contract/src/schemas.ts` (+30/−2) e, no BFF, `clients/scheduling/index.ts` (+20/−1): campos novos opcionais. `clients/ai-orchestrator/index.ts` (+2/−1) e `modules/conversations/routes.ts` (+2/−0): filtro `customerId`. `PUBLIC_API_V1.md` (+7/−0).
  - `apps/ai-orchestrator/src/modules/internal/routes.ts` (+9/−2, filtro por `contact.customerId`) e `tests/assistant/assistant.service.test.ts` (+1/−1, só o número de linha citado por uma varredura estática, de 749 para 756).
  - `apps/frontend/`, produto: `CustomerList.tsx` (+184/−16), `CustomerProfile.tsx` (+183/−40), `CustomerSummary.tsx` (+71/−7), `CustomerMemory.tsx` (+9/−9), `CustomerForm.tsx` (+1/−1), `AppointmentForm.tsx` (+9/−2), `ProductAgendaScreen.tsx` (+4/−1), `app/(platform)/agenda/novo/page.tsx` (+7/−2), `BffConversationService.ts` (+3/−0), `atendly-customers.css` (+38/−0) e `atendly.css` (+13/−0).
  - `apps/frontend/tests/` ajustados à composição nova: `goal015-customers` (+18/−1), `goal015-shell-invariant` (+1/−0), `goal016-agenda-reachability` (+3/−1) e `goal062-availability-phone` (+1/−0). A revisão conferiu que só mudaram composição, copy ou dublê, sem apagar guarda.
  - Os quatro documentos de `docs/migration/`: `CURRENT_STATE.md` (+78), `DECISIONS.md` (+44, D-090), `FINAL_AUDIT.md` (+57, §51) e `VALIDATION_GATE.md` (+30), todos só por acréscimo.
- **Seis arquivos novos**, todos testes: `apps/scheduling-service/tests/unit/goal075-customer-appointments.test.ts` (**351** linhas), `tests/integration/goal075-customer-appointments.integration.test.ts` (**365**), `apps/bff/tests/goal075-customers-contract.integration.test.ts` (**323**), `apps/ai-orchestrator/tests/goal075-conversation-customer-filter.test.ts` (**167**), `apps/frontend/tests/goal075-customer-list.test.tsx` (**303**) e `goal075-customer-profile.test.tsx` (**547**).
- Nenhuma migration, nenhuma rota nova, nenhum campo existente mudou de forma. `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` estão idênticos à baseline. Nenhum arquivo foi tocado em `apps/evolution-go/`, `scripts/` ou `tools/ia-loop/`. Nenhuma configuração de teste mudou. `KNOWN_*` sem exceção nova. `QA_LOCAL_REVIEW.md`, o Product Vault e `docs/design-reference/` não foram editados.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

Já estava correto: próximo e último em duas consultas `DISTINCT ON` escopadas por `tenantId`, sem consulta por cliente; `appointmentStats` sobre o histórico inteiro no fuso do calendário; campos opcionais no contrato; o filtro `customerId` do BFF ao orquestrador, escopado pelo negócio da sessão; os quatro comentários "Esta semana"; as abas com `tablist`, setas e `?aba=`; "Conversa" e "Agendar"; a copy técnica fora; `AppointmentForm` lendo `customerId`. Os quatro blockers:

1. **O detalhe do cliente nunca trazia `nextAppointment`.** `GET /internal/customers/:id` montava a resposta com `customerDto(customers.get(id))`, sem próximo nem último, então o "Próximo atendimento" da aba Resumo não aparecia com dados reais. O teste de frontend passava só porque a fixture injetava o campo.
2. **A lista calculava "hoje" em UTC.** `todayWallDate()` usava `getUTC*`; em America/Sao_Paulo, entre 21:00 e 24:00, "hoje" e "amanhã" saíam trocados. A copy dizia "há 1 meses" entre 30 e 44 dias.
3. **Faltava o vermelho da baseline** de §6.4, §6.5 e §6.8 a §6.11, e o do §6.1 a §6.3 só existia na suíte unitária. Como as correções mudavam código, a execução final e os sete controles do §7 tinham de ser refeitos.
4. **Faltava a documentação do §8**: D-090, FINAL_AUDIT §51, CURRENT_STATE e VALIDATION_GATE.

Observação sem blocker: `firstAppointmentDate` conta agendamento cancelado ou futuro como "cliente desde"; se ficasse assim, tinha de ser declarado em D-090.

## Rodada 2 — ACCEPTED (0 blockers)

Revisão DEEP do diff contra `0de7869`, depois do FIX-001:

- **Blocker 1 fechado.** O detalhe monta `customerDto({ ...customer, ...highlights })`, e `appointmentHighlights` reaproveita as duas consultas da lista com `[id]`, no fuso `settings.timezone`. Provado no §6.2 de integração contra PostgreSQL, no teste de contrato do BFF do lado do detalhe, em dois testes unitários e em dois testes de frontend com fixture decodificada por `customerDetailSchema` no formato que o Scheduling devolve.
- **Blocker 2 fechado.** `CustomerList.tsx` lê `calendar.getCalendar().timezone`, com `America/Sao_Paulo` quando falta ou falha, e `todayWallDate(timeZone)` usa `Intl`. A copy diz "há 1 mês". Três testes novos: 22:30 em Brasília (`01:30Z`), fuso de Lisboa lido do calendário e 30 a 44 dias. `occupancy.ts` fora do diff é inofensivo: o blocker citava o arquivo só como exemplo do padrão.
- **Blocker 3 fechado.** FINAL_AUDIT §51 traz o vermelho da baseline `6787755` de todos os testes novos, inclusive a integração contra PostgreSQL, com os 18 arquivos de código e o `dist` do contrato servidos da baseline e restaurados por hash. Traz também a execução final e os sete controles. O Tech Lead conferiu que os hashes citados batem com a árvore: `CustomerProfile.tsx` `29a63ff…`, `atendly-customer-service.ts` `f291688…`, `internal-api/routes.ts` do Scheduling `de2d088…`, `internal/routes.ts` do orquestrador `27c50be…` e `AppointmentForm.tsx` `ea27183…`.
- **Blocker 4 fechado.** Os quatro documentos foram escritos só por acréscimo (209 linhas incluídas, 0 removidas), com as contagens, o veredito 0/7/6, onde ficou cada capacidade do perfil, as três divergências declaradas e a conferência humana do §9 como não feita.
- **Reexecução do Tech Lead:** `goal075-*` do frontend **21**/**21**; unidade do Scheduling **11**/**11**; integração do Scheduling contra PostgreSQL **3**/**3**. `git status` só com arquivos do escopo do §10 e dos documentos do §8, sem resto de controle negativo.

## Evidência final aceita

Gates do IA Loop na rodada 2, todos exit 0: `typecheck` (WU-05 e WU-06), `lint` (WU-07), testes dirigidos (WU-08 e WU-09), `validate:core` (WU-10), `test:gate` (WU-11), `validate:ui` (WU-12), `validate:integration` (WU-13) e `git diff --check` (WU-15). A integração **rodou no IA Loop** e passou, como no Goal069.

Contagens da execução final documentada (rodada 2, FIX-001, sobre o código aceito), em [FINAL_AUDIT §51](../FINAL_AUDIT.md):

- `validate:core` **17** passos, **15** `passed`, **2** `skipped`, exit 0; `test:frontend` **106**/**1100** (baseline **104**/**1079**); `test:scheduling-service` **37**/**502** (baseline **36**/**491**); `test:ai-orchestrator` **1136** `passed` e **93** pulados de **1229** (baseline **1133**/**1226**).
- `test:gate` **233**/**233**; `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas.
- `validate:integration` **36**/**36** passos, com `test:bff-integration` **58**/**448** (baseline **57**/**440**), `test:scheduling-integration` **18**/**143** e o gate autenticado em **155** `passed` e **0** retentativas, medindo `/clientes` nas cinco larguras e o perfil aberto pela linha semeada.
- Os sete controles negativos do §7, rodados depois da execução final, com restauração conferida por `git hash-object`. O Tech Lead conferiu os hashes, mas não reexecutou os controles nem o vermelho da baseline.

## Observações registradas, sem mudar a decisão

1. **`firstAppointmentDate` conta agendamento de qualquer estado**, inclusive cancelado e futuro, então "cliente desde" pode vir de um agendamento que não aconteceu. Declarado em D-090 e em `PUBLIC_API_V1.md`; o "Revisar se" de D-090 cobre a mudança.
2. **Os testes de integração §6.1 e §6.2 do Scheduling usam o relógio real.** O §6 do Goal pede relógio fixo; só o §6.3 fixa relógio e fuso. Declarado em D-090. Os instantes são relativos a agora e as datas absolutas ficam longe (2026-01 e 2030-03), então o risco é baixo, mas o teste não é determinístico por construção.
3. **A janela do dia da semana é de 20 dias, não de calendário.** O Goal pede o dia da semana abreviado "nesta semana e nas duas seguintes"; `nextAppointmentText` (`CustomerList.tsx`) usa `diff > 1 && diff <= 20`. Dentro dessa janela, "próximo qua 15:00" não diz se é esta quarta ou a de daqui a duas semanas. A conferência humana do §9 decide se isso basta frente ao protótipo.
4. **O alvo de toque das abas não mudou no diff**, mas não precisava: `.tab` já tem `min-height: 44px` em `shared/styles/atendly.css` desde a baseline, acima dos 24 px do §5. Largura, toque, contraste, foco e movimento de `/clientes` e do perfil foram medidos pelo gate autenticado, **155** `passed` e **0** retentativas.
5. **O controle negativo 3 muta o orquestrador, não o BFF.** O BFF só repassa o parâmetro validado; a guarda de negócio e o filtro ficam no orquestrador. Declarado em D-090.

A observação 3 é candidata a ajuste depois da conferência humana do §9.

## O que o aceite não prova

- Que a lista e o perfil de Clientes, num aparelho real nas cinco larguras, com cliente com e sem atendimento, batem com `Clientes.dc.html`, `Clientes-Tablet.dc.html` e `Clientes-Desktop.dc.html`. A conferência humana do §9 do Goal **não foi feita**.
- Que o texto de próximo e último cabe na linha em 360 e 390px sem esconder o nome, e que "Conversa" e "Agendar" levam ao lugar certo com dados reais. Mesma conferência humana, **não feita**; nenhum teste jsdom prova fidelidade visual.
- A fidelidade visual de Serviços (Goal076), de Conversas e da central de notificações (Goal077) e do onboarding (Goal072).

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §51](../FINAL_AUDIT.md)).
