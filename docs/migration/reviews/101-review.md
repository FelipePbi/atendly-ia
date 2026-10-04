# Review formal — Goal 101

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-02, em review DEEP, conforme o [Goal101](../goals/101-novo-agendamento-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

O Goal leva `/agenda/novo` ao quadro A6 do protótipo: de 1024 px em diante, a coluna da Agenda em Dia (`AgendaDayColumn`, do Goal093) fica à esquerda, sem linha marcada, e o formulário no painel; abaixo disso a tela é empurrada, sem barra de abas nem botão flutuante, com "×" ("Fechar novo agendamento", destino `/agenda`) e o título "Novo agendamento"; a coluna `DayList` com a pré-visualização sai; o corpo segue o A6 nas quatro larguras, com duas colunas no retrato e o CTA no rodapé no mobile. As regras de D-098 (b) a (d) não mudaram, e o aviso à cliente na criação continua fora (D-098 (e)). Decisão: [D-111](../DECISIONS.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `29626e0de4d83a80a6d3a022452a8215e657e654` (Goal093). Base imediata da implementação: `68a834412c492873fda6e224d6d610c6e00024ff`, HEAD da worktree `.ai-worktrees/goal-101`, sem commit na worktree. Entre as duas há só documentação (`94b3c36`, status do Goal093; `68a8344`, fechamento do Goal093 e o arquivo deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **13 arquivos**, hash do diff `59df058bfb740b7863a92e10815d8b22049e4ecbb2eee298ad4c2b82c70aa394`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git diff --numstat 68a8344` no snapshot aceito:
  - Produção, em `apps/frontend/src/`: `features/agenda/AppointmentForm.tsx` (+259/−221), `NewAppointmentFields.tsx` (+27/−82, `DayList` apagada), `AppointmentFlowShell.tsx` (+22/−4, `closeLabel`, `panelFirst` e `AppointmentRoute.id` opcional), `AgendaDayColumn.tsx` (+9/−1, só `panelFirst`), `shared/layout/ListDetail.tsx` (+17/−5, só a opção `panelFirst`, com padrão `false`) e `shared/styles/avenly-agenda.css` (+366/−117).
  - Gate autenticado: `e2e/authenticated-matrix.spec.ts` (+188/−0), o teste G-8.
  - Testes: `tests/goal101-novo-agendamento.test.tsx` (novo, 708 linhas, **15** testes) e asserções ajustadas em `goal016-appointment-create` (+16/−3) e `goal083-new-appointment` (+8/−1), que passaram a achar a soma por `.agenda-new-total`. Nenhum teste removido ou pulado; as contagens por arquivo são as da baseline (17 e 11).
  - Documentos: `docs/migration/DECISIONS.md` (D-111), `CURRENT_STATE.md` e `VALIDATION_GATE.md`, só por acréscimo (`git diff 68a8344 -U0` sem linha removida).
- `PushedBar`, `useWideLayout`, `e2e/routes.ts`, `e2e/visual/targets.json`, `vitest.config.*`, `playwright.config.*`, `scripts/`, rota, contrato, BFF, migration, campo e variável não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** A composição já batia com o A6 nos quatro devices (`visual:compare -- --target A6`: 16,0 / 9,0 / 12,4 / 10,3, com os quatro `side-by-side.png` abertos). Blockers: (1) o chip "Outro horário" ficava com 38 px e `padding: 0 12px`, porque a regra `.agenda-new-time .agenda-new-chip-other` mirava uma classe que nenhum TSX tinha; (2) o dia fechado da tira de datas, esmaecido no quadro, não estava implementado nem declarado; (3) os documentos diziam que o início do `visual:compare` (WU-01) e o vermelho contra a baseline (WU-03) não tinham sido entregues, quando estavam nos resultados das unidades.
2. **Rodada 2 — `CHANGES_REQUIRED`, 5 blockers.** Os três da rodada 1 foram tratados no código (o `<fieldset>` do Horário ganhou `agenda-new-time`; `DateStrip` marca `data-closed` a partir de `settings.get`; os documentos passaram a citar o início e o vermelho). Blockers: (1) a DIAG-001 alterou `apps/frontend/playwright.config.ts` (`workers: process.env.CI ? 1 : 2`) e (2) a DIAG-002 alterou `apps/bff/vitest.config.ts` (`maxWorkers: 4`), o que o Goal proíbe até para diagnóstico; (3) o rótulo do dia fechado em `#948b80`, 3,06:1 sobre `#F7F4EF`, abaixo do AA; (4) os controles do §7 e `validate:integration` não tinham rodado sobre a árvore final; (5) os documentos diziam que nenhuma configuração estava alterada e traziam as contagens da rodada 1.
3. **Rodada 3 — `CHANGES_REQUIRED`, 1 blocker.** Os dois arquivos de configuração voltaram ao de `HEAD`; o rótulo do dia fechado passou a `#716859` (5,00:1), declarado como divergência 9 de D-111; E1 a E8 rodaram depois da última edição de código; os documentos foram reescritos. A DIAG-001 da rodada removeu um espaço no fim de linha em DECISIONS (`git diff --check`). Blocker: o diff renomeava o título `### Retentativas e falhas por recurso do host` da seção aceita do Goal093 em VALIDATION_GATE.
4. **Rodada 4 — `ACCEPTED`, 0 blockers.** Só documentação mudou: o título do Goal093 voltou ao texto de `68a8344`, e o diff dos três documentos contra `68a8344` passou a ser só acréscimo.

O perfil do Developer declarado no Goal é `SONNET_HIGH`; as rodadas 2 a 4 tiveram `SONNET_MEDIUM` como perfil recomendado pelo review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal101 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal101) e na "Prova" e na nota de fechamento de D-111.

- **Fidelidade visual, conferida pelo Tech Lead.** `visual:compare -- --target A6`, exit 0, nas quatro rodadas, sempre com **16,0 / 9,0 / 12,4 / 10,3**, e os quatro `side-by-side.png` abertos em cada uma. Mobile e retrato: tela empurrada sem barra de abas, "×" à esquerda e título centralizado, chip da cliente com avatar, "×" e "Trocar", chips de serviço com ponto de cor e duração, "Outro, sem cadastro" tracejado, a soma, a tira de datas com o calendário, "Horário · livres para 1 h 25", "Outro horário" tracejado, "+ Adicionar observação" e o CTA no rodapé; o retrato em duas colunas. Paisagem e desktop: a coluna da Agenda em Dia à esquerda (barra do mês, Dia · Semana · Mês, "Novo", tira, resumo e lista sem linha marcada) e o formulário no painel. O que sobra é divergência declarada em D-111 (aviso e cartão de WhatsApp, dados da conta, nenhum horário livre no dia medido e o CTA desabilitado com a razão de D-098, "Agendar série", o interruptor do aviso ausente, o dia da coluna seguindo o formulário, o chevron e a cor do rótulo do dia fechado).
- **Os outros quadros.** A1, A5, A8, A10, A11 e H3 iguais ao início nos quatro devices; o A9 com 0,1 ponto a menos no mobile e no retrato (E5 de VALIDATION_GATE). Só o A6 muda entre o início (14,5 / 9,5 / 10,8 / 9,1, medido no FIX-001 da rodada 2 sobre a baseline) e o final.
- **Código conferido.** `AppointmentFlowShell` muda só por acréscimo, e as rotas do Goal093 mantêm o caminho. Uma chamada de `useShellConfig` por árvore, que põe `pushed` por `appointmentRoute`; a coluna não chama a casca e não é montada abaixo de 1024 px. `panelFirst` tem padrão `false` em `ListDetail` e na coluna, e Clientes, Serviços e as rotas do 093 não mudam. `DayList` e o efeito que só a alimentava saíram; `readOccupancy` continua. Os payloads de criação estão preservados.
- **Reexecução pelo Tech Lead.** Rodada 1: `goal101`, `goal083`, três de `goal016`, `goal093`, `goal092` e `goal069`, **114**/**114**. Rodada 3: `goal101`, `goal083`, três de `goal016`, `goal093`, `goal075` e `goal072`, **111**/**111**.
- **Identidade do código aceito.** `sha256` na árvore aceita igual ao de "Árvore avaliada" em VALIDATION_GATE: `AppointmentFlowShell.tsx` `7065b4bf…`, `AgendaDayColumn.tsx` `b12ebea9…`, `AppointmentForm.tsx` `7ef9eaf0…`, `NewAppointmentFields.tsx` `6f39ec97…`, `ListDetail.tsx` `6d733556…`, `avenly-agenda.css` `3d848087…`, `authenticated-matrix.spec.ts` `0d9e301f…` e o teste novo `341e98a0…`.
- **Execução final do Developer (rodada 3, E1 a E8).** Typecheck e lint exit 0; `goal101` **15**/**15**; `validate:core` exit 0 com `VITEST_MAX_WORKERS=2` (`test:frontend` **140** arquivos, **1564** testes); `test:gate` **233**/**233**; `validate:ui` padrão (E3a) **167** `expected` e **2** `flaky`, e com `CI=1` (E3b) **169** `expected` e **0** `flaky`; `validate:integration` exit 0, gate autenticado **255** `expected`, **0** `flaky`.
- **Gates do IA Loop nas rodadas 3 e 4.** Os oito gates do Goal passaram na rodada 4 sobre a árvore aceita: typecheck, lint, testes dirigidos (`goal101` **15**/**15**), `validate:core`, `test:gate` (**233**/**233**), `validate:ui` (**169** `passed`, **21** `skipped`, **0** retentativas), `validate:integration` (gate autenticado **255** `passed`, **0** retentativas) e `git diff --check`. A WU-09 da rodada 3 também deu **0** retentativas no `validate:ui` padrão.
- **Vermelho contra a baseline (FIX-001 da rodada 2).** `Tests  9 failed | 6 passed (15)`, restauração conferida por `sha256`; os seis que passam são declarados em VALIDATION_GATE.
- **Controles negativos (rodada 3, depois da última edição de código).** Os quatro do §7 reprovam com o defeito (1, 1, 2 e 5 testes) e passam restaurados, com `sha256` antes e depois iguais.
- **Escopo.** `git status --porcelain=v1 -uall` só com os 13 arquivos autorizados, sem configuração, sem resto de controle negativo nem `e2e-results/`.

## Aceito sem prova completa

1. **Critério 5 na execução do Developer.** O `validate:ui` padrão de E3a teve **2** retentativas em rotas públicas fora da Agenda (`Target crashed`), com causa medida pela troca de workers (E3b, `CI=1`, **0**). Aceito pela cláusula de retentativa medida e reportada. As WU-09 do IA Loop nas rodadas 3 e 4, com a configuração padrão, deram **0**.
2. **A piora do A6** em mobile (14,5 para 16,0), paisagem (10,8 para 12,4) e desktop (9,1 para 10,3) tem causa provável (o aviso de WhatsApp desloca a tela, e a conta não tem horário livre para o dia medido, por isso o painel mostra "Nenhum horário disponível para esta seleção." e o CTA desabilitado), não isolada por medida. O retrato melhorou (9,5 para 9,0).
3. **A leitura nova de `settings.get` no formulário**, que alimenta o dia fechado e repete, de 1024 px em diante, a que a coluna já faz. Aceita porque o gate autenticado passou com G-8 sem falha de limite de taxa e com **0** retentativas; a contagem de requisições da coluna ao BFF não foi medida à parte.
4. **O vermelho contra a baseline e os controles negativos não foram reexecutados pelo Tech Lead**; conferidos por registro do IA Loop e `sha256`.
5. **O A6 com horários livres e o CTA habilitado** não foi visto em captura; o comportamento é coberto pelas provas 4 e 5.

## Observações registradas, sem mudar a decisão

1. **Unidades de diagnóstico do IA Loop editaram configuração de gate** na rodada 2 (DIAG-001 e DIAG-002), o que o Goal proíbe. Foi o mesmo padrão do review100. As duas edições foram desfeitas na rodada 3 e não estão no snapshot aceito.
2. **Falhas por recurso do host**, reexecutadas sem editar configuração: `validate:core` sem variável falhou duas vezes por memória (`Zone Allocation failed - process out of memory`), e `validate:integration` falhou uma vez por tempo esgotado em `goal023-retention-sweep` e outra, com `VITEST_MAX_WORKERS=3`, em dois testes de durabilidade do ai-orchestrator. As duas tentativas estão em VALIDATION_GATE, e E4 passou sem variável.
3. **Seção aceita do Goal093 em VALIDATION_GATE.** O título foi renomeado na rodada 3 e restaurado na rodada 4; o texto aceito está igual ao de `68a8344`.
4. **A soma** "1 h 25 · A partir de R$ 150,00" segue o `totalLabel` de D-098 (d) e difere do texto do quadro ("1 h 25 · R$ 150"); D-111 não a mudou.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- O aviso à cliente na criação, que depende de uma pessoa e de contrato novo (`notifyCustomer` em `CreateAppointmentInput`).
- O CTA do rodapé com teclado aberto ou área segura de um aparelho real.
- O A7, que fica fora deste Goal.
