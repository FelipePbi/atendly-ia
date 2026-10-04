# Review formal — Goal 069

**Decisão vigente — rodada 6: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-29, conforme o [Goal069](../goals/069-fidelidade-visual-agenda.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–068, 070, 071, 073 e 074) foi reaberto, reavaliado ou revertido. **Seis rodadas**: as rodadas 1 a 5 terminaram `CHANGES_REQUIRED`, com 4, 2, 2, 2 e 2 blockers, e a rodada 6 terminou com zero. Só a rodada 1 e a rodada 2 mudaram código; as rodadas 3 a 6 foram de evidência e documentação.

O Goal corrige **QA AG-01…AG-12** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e as **observações 2 e 4 do [review073](073-review.md)**. A Agenda ganha uma barra superior única com "+ Novo" nos três tipos, a faixa da semana com pontos no Dia e duas colunas a partir de 1024px, mais as regras de tela de dia vazio, próximo agendamento, histórico e ações de fim ([D-089](../DECISIONS.md)). Só frontend: nenhum contrato, rota, schema do BFF, migration ou serviço muda.

## Escopo e identidade do diff

- Baseline aceita vigente: `37c7371659a8fa328d896a282b9479842a188ce7` (Goal074). Base imediata da implementação: `ce3dfc6f184ff91357337dab4e213fc8164f35b1`, HEAD da worktree `.ai-worktrees/goal-069`, inalterado nas seis rodadas. Os commits `b250fa3` e `ce3dfc6` são só documentais (status e fechamento do Goal074, preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **27 arquivos**, hash do diff `c58b9cfa6c1921926ac1d7066582e91b1b69de82a034f8d97e8fa58c604bfe23`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e três arquivos rastreados**, por `git diff --numstat ce3dfc6`:
  - `apps/frontend/src/features/agenda/`, produto: `AgendaBoard.tsx` (+301/−66, barra superior, `AgendaNewMenu`, `goToAdjacent`, `changeView`, leitura própria de "Próximo agendamento"), `DayView.tsx` (+124/−4, `WeekStrip`, `DayDetailPanel`, dia vazio com motivo), `occupancy.ts` (+58/−0, `datesWithActiveAppointment`, `nextActiveAppointment`, `appointmentHasStarted`), `AppointmentHistory.tsx` (+30/−11, `actorLabel`), `WeekView.tsx` (+16/−6, nome e serviço no bloco, prefixo do tipo no nome acessível), `BlockForm.tsx` (+14/−1, tipo inicial por `?type=`), `LifecycleActions.tsx` (+7/−3), `AppointmentDetail.tsx` (+1/−1) e `AppointmentForm.tsx` (+1/−1), os dois só de copy.
  - `apps/frontend/src/features/settings/CalendarSettings.tsx` (+36/−6, limite de seis dias ocultos, observação 4 do review073).
  - `apps/frontend/src/shared/styles/avenly.css` (+83/−0) e `avenly-agenda.css` (+33/−1, `.agenda-page-title`, menu "+ Novo", link "Exceções do dia").
  - `apps/frontend/e2e/authenticated-matrix.spec.ts` (+52/−14, só `ensureAgendaOnMeasuredDate` e o auxiliar `mondayOfWeek`, observação 2 do review073).
  - `apps/frontend/tests/` ajustados à composição nova: `goal016-agenda-reachability` (+2/−2), `goal016-agenda-views` (+8/−2), `goal016-lifecycle-history` (+28/−5), `goal016-shell-invariant` (+1/−0), `goal021-notify-and-reminder-state` (+1/−0) e `goal073-agenda-visualizacao` (+4/−1). A revisão da rodada 1 conferiu que só mudaram copy, janela ou fixture, sem apagar guarda.
  - Os quatro documentos de `docs/migration/`: `CURRENT_STATE.md` (+110), `DECISIONS.md` (+35, D-089), `FINAL_AUDIT.md` (+59, §50) e `VALIDATION_GATE.md` (+33).
- **Quatro arquivos novos**, todos testes: `apps/frontend/tests/goal069-agenda-structure.test.tsx` (**241** linhas), `goal069-agenda-views.test.tsx` (**374**), `goal069-appointment-detail.test.tsx` (**210**) e `goal069-hidden-days-limit.test.tsx` (**181**).
- `e2e/routes.ts` está idêntico à baseline. Nenhum arquivo foi tocado em `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/`, `apps/evolution-go/`, `scripts/` ou `tools/ia-loop/`. Nenhuma configuração de teste mudou. `KNOWN_*` sem exceção nova. `QA_LOCAL_REVIEW.md`, o Product Vault e `docs/design-reference/` não foram editados.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

Já estava correto: "+ Novo" com os três tipos governados por capacidade, Escape devolvendo o foco e sem FAB duplicado; `BlockForm` lendo `?type=`; "Exceções do dia" como link próprio; a faixa da semana com pontos e sem dias ocultos; duas colunas por `wideLayout`; o motivo do dia vazio tirado da disponibilidade; "Próximo agendamento" por leitura própria de 60 dias; o autor do histórico resolvido pela sessão; ações de fim só depois do início; o limite de seis dias ocultos com a recusa específica do servidor; e `ensureAgendaOnMeasuredDate` navegando por unidade. Os quatro blockers:

1. **`e2e/routes.ts` alterado contra o §10.** O `contentMarker` de `/agenda` passou de "Agenda" para `.agenda-page`, que envolve também o skeleton, o erro e o estado sem fonte, então deixava de provar que o conteúdo chegou.
2. **AG-05 não corrigido.** Com hoje = domingo 27/09/2026 na Semana, "Próxima semana" levava o `cursor` a 04/10 e "Mês" abria outubro. O teste §6.6 fixava hoje em 29/09 e passava na baseline, e o controle 4 aplicava uma mutação sintética em vez de reverter uma correção.
3. **O nome acessível do bloco da Semana perdeu o tipo.** Um bloqueio e um compromisso pessoal com o mesmo título ficavam com nomes acessíveis idênticos, quebrando a distinção BLOCK/PERSONAL do Goal016 para leitor de tela.
4. **Faltavam as contagens da execução final** nos documentos, em especial as do gate autenticado.

## Rodada 2 — CHANGES_REQUIRED (2 blockers)

Os três blockers de código foram corrigidos e conferidos: `e2e/routes.ts` voltou à baseline; o `<h1>` "Agenda" passou à classe `.agenda-page-title`, que esconde sem `clip`/`clip-path` e continua atingível por `elementFromPoint`; `goToAdjacent` passou a somar sete dias a `startOfWeek(cursor)`; `WeekEntryBar` voltou a prefixar o tipo, com o teste de regressão "Almoço". Os gates passaram, com o gate autenticado em **155** e **0** retentativas. Ficaram dois blockers, só de evidência e documentação: os oito controles do §7 não foram refeitos depois da última edição de código, e os documentos ainda afirmavam a divergência de `routes.ts`, o `<h1>` `sr-only` e o `cursor` "por construção".

## Rodadas 3, 4 e 5 — CHANGES_REQUIRED (2 blockers cada)

Nenhuma dessas rodadas mudou código; o hash de `AgendaBoard.tsx` ficou em `43b4d65c6dc50b22fc1da66bd850733fbd0ddd62`. Os dois blockers foram os mesmos nas três rodadas, com escopo cada vez mais estreito:

1. **Frases falsas nos quatro documentos do Goal069.** As rodadas acrescentaram notas de correção sem reescrever as frases que continuavam afirmando fatos vencidos como vigentes (`sr-only` no `<h1>`, `cursor` "por construção", hash `152c3ec…`, `29 passed`, `abre setembro`, `range.endDate` como controle 4, `nenhum dos quais`/`nenhum deles mutado`). Os relatórios das rodadas 4 e 5 declararam o blocker resolvido sem que estivesse.
2. **Controle 4 e vermelho da baseline.** Na rodada 3 o controle 4 ainda mutava `changeView`. O Tech Lead aplicou a mutação pedida (`addDays(cursor, direction * 7)` em `goToAdjacent`) numa cópia fora da worktree, e o §6.6 reprovou (`1 failed | 7 passed`). A rodada 4 registrou esse controle, mas nenhum documento trazia o vermelho dos testes §6.6 e §6.5 "Almoço" contra `37c7371`, nem dizia por que não era reproduzível.

Na rodada 5 o perfil do Developer voltou de `SONNET_HIGH` para `OPUS_MEDIUM`, porque a reescrita documental no próprio lugar tinha sido declarada feita duas vezes sem ter sido.

## Rodada 6 — ACCEPTED (0 blockers)

Revisão DEEP do diff contra `ce3dfc6`, sem mudança de código: os `git hash-object` de `AgendaBoard.tsx` (`43b4d65…`), `WeekView.tsx` (`ea1c9cc…`) e `DayView.tsx` (`7e58496…`) são os já revisados.

- **Blocker 1 fechado.** D-089 itens 1 e 2, a Prova, FINAL_AUDIT §50, VALIDATION_GATE e CURRENT_STATE descrevem o estado vigente: `.agenda-page-title` sem `clip`; AG-05 em `goToAdjacent` com `addDays(startOfWeek(cursor), direction * 7)`, conferido em `AgendaBoard.tsx:309`; controle 4 sobre `goToAdjacent` com `-t "Próxima semana"`; total **30**/**30**. O grep dos padrões do blocker nas quatro seções do Goal069 não devolve nenhum como fato vigente; `sr-only` só aparece como histórico da rodada 2 ou como contraste.
- **Blocker 2 fechado e reproduzido pelo Tech Lead.** Com uma config temporária do Vitest que serve `AgendaBoard.tsx`, `WeekView.tsx` e `DayView.tsx` do blob de `37c7371`, depois removida: o §6.6 dá exit 1 (`Unable to find ... /Setembro de 2026/i`); o §6.5 de nome e serviço dá exit 1; o §6.5 "Almoço" dá exit 0, porque o `WeekEntryBar` de `37c7371` (linhas 111–112) já prefixava `${typeLabel}: ` — o defeito só existiu no `WeekView.tsx` da rodada 1, e o motivo está declarado. Na árvore atual os três passam.
- `git status` final só com os 27 arquivos do snapshot, sem resto.

## Evidência final aceita

Gates do IA Loop na rodada 6, todos exit 0: `typecheck` (WU-05), `lint` (WU-06), testes dirigidos (WU-07/WU-08: **30**/**30** nas suítes `goal069-*` e **71**/**71** nas suítes de agenda), `git diff --check` (WU-14), `validate:core` (WU-09), `test:gate` (WU-10), `validate:ui` (WU-11) e `validate:integration` (WU-12, 393 s). Diferente do Goal074, a integração **rodou no IA Loop** e passou.

Contagens da execução final documentada (rodada 2, sobre o código vigente, que não mudou depois), em [FINAL_AUDIT §50](../FINAL_AUDIT.md):

- `test:gate` **233**/**233**; `test:frontend` **104**/**104** arquivos e **1079**/**1079** testes (baseline **100**/**1048**); `typecheck` e `lint` exit 0.
- `validate:core` **17** passos, **15** `passed`, **2** `skipped`, exit 0; `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas.
- `validate:integration` **36**/**36** passos, exit 0, com o gate autenticado em **155** `passed` e **0** retentativas, mesma contagem da baseline.
- Os oito controles negativos do §7, rodados na rodada 3 contra a árvore vigente, com restauração conferida por `git hash-object`. O controle 4 foi reproduzido pelo Tech Lead na rodada 3; os demais não foram reexecutados na revisão.

## Observações registradas, sem mudar a decisão

1. **O título da barra não é "mês e ano do dia focado" em Dia e Semana.** D-089 item 1, CURRENT_STATE e VALIDATION_GATE descrevem a barra como começando por mês/ano do dia focado. O código mostra `periodLabel` (`AgendaBoard.tsx`): a data completa no Dia, o intervalo "dd mmm – dd mmm" na Semana e mês/ano só no Mês. Levantada na rodada 2 e deixada para a conferência humana do §9. O texto de D-089 está impreciso nesse ponto; a nota de fechamento de D-089 registra o comportamento real.
2. **`DayDetailPanel` não embute `AppointmentDetail`.** Reaproveita `LifecycleActions` e `AppointmentHistory`, mas o resumo próprio não mostra telefone nem observações. Declarado em D-089.
3. **O motivo "Você não atende neste dia." ignora exceção que fecha o dia.** Ele vem só da disponibilidade semanal; uma exceção que fecha o dia não produz motivo, embora a barra da exceção já apareça na grade.
4. **AG-08 e AG-12 fecharam sem mudança de código.** AG-08 tem teste que prova o telefone formatado na baseline. AG-12 (marca no trilho entre 768 e 1099px) não tem mudança em `AppShell.tsx` nem na regra `@media (max-width: 1099px)` de `avenly.css`, que continua escondendo `.sidebar .brand span`; só o símbolo da marca fica. Se isso basta, é a conferência humana que decide.
5. **O vermelho da baseline dos demais escopos do §6** foi produzido pelas unidades que os implementaram (WU-01 a WU-04) e não está colado nos documentos. Só o §6.6 e o §6.5 foram reproduzidos contra `37c7371` na revisão.
6. **Custo de documentação.** Quatro das seis rodadas foram só para reescrever frases vencidas nos próprios documentos do Goal. A regra "por acréscimo" do Goal054 §12 protege §4–§49 e decisões anteriores, não o texto ainda não aceito do Goal corrente.

As observações 1, 3 e 4 são candidatas a ajuste depois da conferência humana do §9.

## O que o aceite não prova

- Que a Agenda, percorrida num aparelho real nas cinco larguras, em Dia, Semana e Mês, com e sem agendamento, bate com `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`. A conferência humana do §9 do Goal **não foi feita**.
- Que a marca no trilho, o segmentado numa linha em 360/390px e o bloco da Semana legível batem com o protótipo. Mesma conferência humana, **não feita**; nenhum teste jsdom prova fidelidade visual.
- A fidelidade visual de Clientes, Serviços, Conversas e da central de notificações (Goal075) e do onboarding (Goal072).
- Mudança na regra de "Como você vê a Agenda" (D-086): continua como estava.

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §50](../FINAL_AUDIT.md)).
