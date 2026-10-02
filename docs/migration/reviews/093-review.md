# Review formal — Goal 093

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-02, em review DEEP, conforme o [Goal093](../goals/093-detalhe-cancelar-e-remarcar-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

O Goal leva `/agenda/agendamento` ao quadro A5, `/agenda/cancelar` ao A8 e `/agenda/reagendar` ao A9 do protótipo: de 1024 px em diante, a coluna da Agenda em Dia (`AgendaDayColumn.tsx`, novo) fica ao lado do fluxo no `ListDetailLayout` de D-103; abaixo disso o fluxo é a tela empurrada, sem barra de abas; o cancelamento passa a um passo só, na sheet; as ações do ciclo vão para o menu "•••"; e "Reagendar" passa a "Remarcar". O gate autenticado ganha a medida G-7. A decisão é [D-110](../DECISIONS.md), aceita neste fechamento. Ela estende D-103 à Agenda e não reescreve D-098, D-103, D-108 nem D-109.

## Escopo e identidade do diff

- Baseline aceita vigente: `a5a04bceedacb7fb88c0fa641f77b76bb0785c49` (Goal100). Base imediata da implementação: `07fd337b926b1ea5102f7bb3debbc8aad0cc8f48`, HEAD da worktree `.ai-worktrees/goal-093`, sem commit na worktree. Entre as duas há só documentação (`50db9c4`) e o conserto de leitura de estado do IA Loop (`07fd337`), fora de `apps/`.
- Snapshot aceito, calculado pelo IA Loop: **21 arquivos**, hash do diff `29f68fc4b92053e6b312005a146585539fdbeec522a7048244dc181385044aaf`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git diff --numstat 07fd337` no snapshot aceito:
  - Produção, em `apps/frontend/src/`: `features/agenda/AppointmentDetail.tsx` (+351/−111), `RescheduleFlow.tsx` (+396/−148), `LifecycleActions.tsx` (+335/−93), `CancelFlow.tsx` (+198/−115), `AppointmentHistory.tsx` (+94/−0), `AppointmentFlowShell.tsx` (+48/−13), `DayView.tsx` (+8/−0, só `currentAppointmentId` e `aria-current`), `AgendaBoard.tsx` (+1/−1, só o `export` de `monthAndYear`), `AgendaDayColumn.tsx` (novo, 279 linhas) e `shared/styles/atendly-agenda.css` (+1070/−0, escopado em `.agenda-appt*`, `.agenda-cancel*` e `.agenda-rs*`).
  - Gate autenticado: `e2e/authenticated-matrix.spec.ts` (+218/−0), o teste G-7.
  - Testes: `tests/goal093-detalhe-cancelar-remarcar.test.tsx` (novo, 903 linhas, **27** testes em sete provas) e asserções ajustadas em `goal016-a11y`, `goal016-appointment-create`, `goal016-lifecycle-history`, `goal016-shell-invariant`, `goal021-notify-and-reminder-state` e `goal069-appointment-detail`. Nenhum teste removido ou pulado; as contagens por arquivo são iguais às da baseline.
  - Documentos: `docs/migration/DECISIONS.md` (D-110), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- `ListDetail`, `PushedBar`, `useWideLayout`, `e2e/routes.ts`, `e2e/visual/targets.json`, `vitest.config.*`, `playwright.config.*`, `scripts/`, rota, contrato, BFF, migration, campo e variável não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** Treze unidades de trabalho do IA Loop (WU-01 a WU-12 e DIAG-001). A primeira execução de `validate:integration` (WU-10) terminou com exit 1: os **5** testes de G-7 falharam, um por largura, porque o nome da cliente no detalhe era `<strong>` e G-7 procura o `heading` dela; os outros **245** passaram. A DIAG-001 trocou o `<strong>` por `<h2>` com o mesmo estilo (`.agenda-appt-customer-text h2` neutraliza o `h2` global), sem tocar no spec nem em configuração, e a segunda execução (WU-10 g2) passou. Essa troca está no código aceito.

O perfil do Developer declarado no Goal é `SONNET_HIGH`.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal093 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal093) e na "Prova" e na nota de fechamento de D-110.

- **Fidelidade visual, conferida pelo Tech Lead.** `visual:compare -- --target A5,A8,A9`, exit 0, com os doze `side-by-side.png` abertos. A5: tela empurrada no mobile e no tablet em retrato (barra ‹ e •••, horário em Literata com o selo, cartão da cliente, Serviços e Total, Lembrete, Observações, Histórico em linha do tempo e rodapé com Remarcar e Cancelar; o retrato em duas colunas); em paisagem e desktop, a coluna Dia (barra de D-108, tira, título do dia, lista do A1) ao lado do painel. A8: sheet inferior com alça no mobile; diálogo central de 480 e 440 px nos outros devices, sobre o detalhe escurecido e inerte, com o scrim cobrindo sidebar e coluna; um único botão vermelho. A9: barra X "Remarcar", resumo com avatar e ponto de cor, "Horário atual" riscado e "Novo horário", faixa de datas com calendário, horários, "Outro horário" tracejado, interruptor com o texto do quadro e CTA; duas colunas e a coluna da Agenda em paisagem e desktop. O que sobra são as divergências 1 a 8 de D-110.
- **O A9 abre sem horário escolhido.** É estado, não layout: a faixa marca o dia original como `is-original` quando outro dia é escolhido, e escolher um horário ao carregar reservaria um hold sem ação da pessoa. Coberto pela divergência 3 de D-110.
- **Código conferido.** Uma única chamada de `useShellConfig`, em `AppointmentFlowShell`; `AgendaDayColumn` só é montada com `useWideLayout()` e não chama a casca. `DayView` e `AgendaBoard` mudam só por acréscimo. `useLifecycleOperations` mantém as mesmas chamadas e condições, e o menu "•••" só oferece o permitido; com fonte que não é `ATENDLY` ou com agendamento cancelado, não há itens. Cancelar envia `{ comments, notifyCustomer }` uma vez, sem diálogo. Remarcar mantém `getAvailability`, hold, `rescheduleAppointment` e `ConflictPanel` com motivo. "Conversa" e a contagem só aparecem com `customerId` e falham em silêncio. G-7 entra só por acréscimo, com clique real por `proveAuthenticatedScreen` e `ensureAgendaOnMeasuredDate`, mais overflow, axe e foco.
- **Reexecução pelo Tech Lead.** `goal093-detalhe-cancelar-remarcar`, `goal016` (quatro arquivos), `goal021`, `goal069`, `goal084`, `goal088` e `goal100`: **156**/**156**.
- **Identidade do código aceito.** `sha256` na árvore aceita igual ao de "Árvore avaliada" em VALIDATION_GATE: `AppointmentFlowShell.tsx` `faa9572c…`, `AgendaDayColumn.tsx` `716eb883…`, `AppointmentDetail.tsx` `e7991f72…`, `CancelFlow.tsx` `71aa6727…`, `RescheduleFlow.tsx` `33966d23…`, `LifecycleActions.tsx` `bfa98e18…`, `AppointmentHistory.tsx` `c2f6aa6f…`, `DayView.tsx` `2a68a762…`, `AgendaBoard.tsx` `3a78c3b8…`, `atendly-agenda.css` `7956a3bb…`, `authenticated-matrix.spec.ts` `e1e398ed…` e teste novo `787d7a17…`.
- **Execução final (E1 a E9).** Lint e typecheck exit 0; `goal093` **27**/**27**; `validate:core` exit 0 (`test:frontend` **139** arquivos, **1549** testes, +1 e +27 sobre o Goal100); `test:gate` **233**/**233**; `validate:integration` exit 0 (E4), com o gate autenticado em **249** `expected` e **1** `flaky` num total de **250** (245 + 5 de G-7); o gate autenticado rodado direto na mesma árvore (E5) **250** `expected`, **0** `flaky`; `validate:ui` padrão (E3a) **163** `expected`, **6** `flaky` em rotas públicas, e com 1 worker (E3b) **169** `expected`, **0** `flaky`.
- **Vermelho contra a baseline (WU-03).** Com os dez arquivos de produção da baseline e a restauração conferida por `sha256`: **24** reprovam e **3** passam, os três da prova 2 a 390 px (uma chamada de `useShellConfig` abaixo de 1024 px já valia na baseline). Os documentos do Developer não citam o número; ele está na nota de fechamento de VALIDATION_GATE.
- **Início do `visual:compare` (WU-01, antes de qualquer edição).** A5 8,1 / 4,2 / 6,3 / 5,1; A8 52,8 / 78,8 / 80,6 / 85,5; A9 13,4 / 9,0 / 10,2 / 8,7; A1, A6, A10, A11 e H3 iguais aos finais de E6. Os documentos do Developer dão a coluna "início" como não entregue; ela está na nota de fechamento de VALIDATION_GATE.
- **Controles negativos (E9, depois da última edição de código).** Os quatro do §7 reprovam com o defeito (4, 3, 2 e 3 testes) e passam restaurados, com `sha256` antes e depois iguais.
- **Escopo.** `git status --porcelain=v1 -uall` só com os 21 arquivos autorizados, sem resto de controle negativo nem `e2e-results/`. O `git diff --check` (WU-12) passou.

## Aceito sem prova completa

1. **Critério 5, o gate autenticado dentro de `validate:integration`.** O critério pede **0** retentativas. E4 teve **1**, na rota de onboarding `/onboarding/agenda-atendly-pronta` em `tablet-768`, fora da Agenda e fora do que este Goal toca; a causa não foi isolada. O gate rodado direto sobre a mesma árvore (E5) deu **250**/**0** retentativas, e nenhum teste de G-7 nem de rota da Agenda precisou de retentativa em nenhuma execução. Aceito pela cláusula "retentativa em rota fora da Agenda é medida e reportada".
2. **Critério 5, o `validate:ui` padrão.** E3a teve **6** retentativas, todas em rotas públicas, com erros de processo, tempo esgotado e falta de recurso; com 1 worker (E3b), 0. A causa foi medida pela troca de workers, não pela troca dos arquivos pelos da baseline — o mesmo padrão aceito no Goal092 e no Goal100.
3. **Critério 2, pioras sem causa isolada.** O A5 piorou em paisagem (6,3 para 7,9) e desktop (5,1 para 6,3), e o A9 em mobile (13,4 para 13,8), paisagem (10,2 para 11,7) e desktop (8,7 para 9,6). A causa provável é a que a leitura dos `side-by-side.png` mostra: o aviso de WhatsApp desloca o conteúdo, os dados da conta de teste diferem dos do quadro e, no A9, o estado inicial sem horário escolhido. Não foi isolada. O A8 caiu de 52,8–85,5 para 4,6–7,9 nos quatro devices; A1, A6, A10, A11 e H3 não mudaram.
4. **O vermelho contra a baseline e os controles negativos não foram reexecutados pelo Tech Lead**; conferidos por registro do IA Loop e `sha256`.
5. **Alvos de toque além de Remarcar e Cancelar** e `prefers-reduced-motion` nas três telas não têm medida própria de G-7; ficam com o que o gate autenticado já mede.

## Observações registradas, sem mudar a decisão

1. **Foco do `CancelFlow`.** O efeito de foco depende de `busy` e devolve o foco à sheet ao tocar em "Cancelar agendamento". A WU-03 estabilizou o `router` do mock em `goal016-shell-invariant`, porque um mock instável reexecutava o efeito a cada tecla; no Next o `router` é estável.
2. **Fim de linha.** Os arquivos novos e quatro dos alterados estão em LF numa árvore CRLF; o `git diff --check` passou, e o Git normaliza no commit.
3. **Presença como texto.** O detalhe não mostra mais "Aguardando confirmação" ou "Presença confirmada" como linha própria; a presença aparece no evento do histórico e na ausência ou presença de "Confirmar presença" no menu. Registrado pela WU-03; D-110 (c) cobre o desenho.
4. **Correção da DIAG-001** (ver "Histórico das rodadas"), no código aceito: o nome da cliente é `h2`, o que também dá à tela um título de segundo nível com o nome.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- O detalhe com contagem de atendimentos e "Conversa" para uma cliente com mais atendimentos e conversa, que a conta de teste não tem.
- "Editar" e a gravação de observação depois da criação, que o contrato não tem.
- O texto do aviso de cancelamento do quadro A8, que não está comprovado no sistema.
- O A6, que é do Goal101.
