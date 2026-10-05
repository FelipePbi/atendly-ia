# Review formal — Goal 118

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-05, conforme o [Goal118](../goals/118-a-agenda-igual-ao-prototipo-no-dia-vazio-no-calendario-no-botao-de-criar-e-nos-dias-visiveis.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 2 terminou `CHANGES_REQUIRED` com 1 blocker só de registro; o IA Loop aceitou a rodada com ele adiado para a documentação de fechamento, onde foi aplicado (ver "Correção de registro aplicada no fechamento").

A Agenda segue os quadros A2, A3, A4 e A12 do protótipo nos quatro devices. No dia sem atendimento nem bloqueio e sem regra ativa de disponibilidade, o resumo diz "{Dia}, {d} · você não atende neste dia" e o corpo explica que a IA não marca horários naquele dia da semana, com "+ Criar agendamento" só com `createAppointments`. O título de mês e ano virou o botão "Abrir calendário, {mês} de {ano}", com o chevron, que abre o mini-calendário com leitura própria do mês. "Novo" e o botão flutuante abrem a folha "O que você quer adicionar?" no lugar do menu suspenso. A pílula de dias visíveis abre a folha "Dias visíveis" na própria Agenda, com rascunho e gravação só em "Salvar". Só o frontend mudou: nenhuma mudança no BFF, no Scheduling ou no contrato. Decisão: [D-132](../DECISIONS.md), aceita neste fechamento, que revê D-108 (a) e D-109 (g).

## Escopo e identidade do diff

- Baseline aceita vigente: `973dd17512e9862d72a3ac9ff163fa0bee6d68a5` (Goal117). Base imediata da implementação: `40a256eb98e097f5f9887052ef2c803f58a492a8` (preparação do Goal118), HEAD da worktree `.ai-worktrees/goal-118`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos** (19 rastreados e 3 novos não rastreados), hash do diff `95770e56f1ec4f9044e5a2d06860596b7e7c1b3d70d241512cabab8a843c669b`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (10): `features/agenda/AgendaBoard.tsx`, `DayView.tsx`, `MonthView.tsx` e `occupancy.ts` (`isFullDayClosure` saiu de `MonthView.tsx` sem mudar); `features/agenda/AgendaCalendarSheet.tsx` e `AgendaVisibleDaysSheet.tsx` (novos); `features/conversations/ConversationActionsSheet.tsx` (`ChatSheetShell` com `preventDefault()` no `mousedown` do escurecido); `features/settings/CalendarSettings.tsx` (exporta a frase e o detector da recusa do limite); `shared/styles/avenly-agenda.css` e `avenly.css`;
  - `apps/frontend/tests/` (6): `goal118-agenda.test.tsx` (novo, 30 testes) e os ajustes de `goal016-agenda-reachability`, `goal069-agenda-structure`, `goal069-agenda-views`, `goal092-agenda-dia` e `goal100-agenda-semana-mes`;
  - `apps/frontend/e2e/visual/targets.json` (alvos A2, A3, A4 e A12) e `apps/frontend/e2e/authenticated-matrix.spec.ts` (só o G-8, autorizado no review da rodada 1);
  - `scripts/tests/visual-responses.test.mjs` (exige os quatro alvos);
  - `docs/migration/` (3, por acréscimo): D-132 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal118 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal, mais o ajuste autorizado do G-8. Nenhum arquivo de `e2e/` além de `targets.json` e do G-8 mudou, nem `scripts/` além do teste de `visual-responses`. O documento do Goal118 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 8 blockers.** O Developer rodou com o plano de 14 Work Units do Tech Lead. A WU-01 adicionou os alvos e o teste de `visual-responses` (33 de 33) e guardou as capturas de antes fora do repositório. A WU-02 terminou `BLOCKED` com o vazio do A2 e a folha do A4 prontos, sem `visual:compare`: o banco de desenvolvimento não tinha a migration do Goal109, e a criação de banco isolado foi negada. As WU-03 a WU-05 ficaram bloqueadas por dependência. Os gates WU-06 a WU-12 e WU-14 passaram sobre árvore incompleta, e a WU-13 (`validate:integration`) reprovou. O BFF local não respondia, e o review não pôde rodar `visual:compare`. Decisão deste review: a autorização restrita do G-8 (D-132 (7)). Os blockers: (1) o A3 não implementado; (2) o A12 não implementado, com a pílula ainda link para `/configuracoes/agenda`; (3) os três controles negativos do §3.2 não rodados; (4) `validate:integration` reprovando no G-8 nas cinco larguras, porque o spec procurava o `menuitem` "Agendamento"; (5) a descrição de "Exceção do dia" diferente da fixada no Goal; (6) a frase da IA provada só para quarta e sábado e sem o caso de disponibilidade falhada; (7) a fidelidade visual sem evidência, com os ajustes pendentes da WU-02; (8) D-132, o delta de CURRENT_STATE e a seção de VALIDATION_GATE ausentes.
2. **Rodada 2 — `ACCEPTED` pelo IA Loop, com 1 blocker só de registro adiado para o fechamento.** A FIX-001 resolveu os oito: o A3 com leitura própria do mês e `AbortController`; o A12 com rascunho, `PATCH` só com `hiddenWeekdays` em ordem e o limite de `CalendarSettings`; os três controles negativos, a última vez depois da última edição de código; o G-8 com só o localizador e o `what` trocados; a descrição de "Exceção do dia"; a frase da IA nos sete dias e os casos de disponibilidade pendente e falhada; o `visual:compare` numa pilha descartável própria; e D-132 e os registros. As duas primeiras execuções do `validate:integration` do Developer reprovaram 1 de 275 testes do gate autenticado, porque o título-botão posicionado pintava por cima do marcador de `/agenda`; a correção tirou o `position` do título. Os nove gates do IA Loop passaram. O review terminou `CHANGES_REQUIRED` com `correctionScope: DOCUMENTATION_ONLY`.

O Developer rodou com o modo `WORK_UNITS`. Na rodada 1, só a WU-01 terminou `COMPLETED` entre as unidades de modelo. Na rodada 2, rodaram a FIX-001 e os nove gates determinísticos.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal118 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal118) e em D-132.

- **Gates do IA Loop, rodada 2, todos com saída 0 na árvore final:** `typecheck` (WU-06), `lint` (WU-07), testes alvo (WU-08), suíte do frontend (WU-09), `test:gate` (WU-10), `validate:core` (WU-11), `validate:ui` (WU-12), `validate:integration` (WU-13, 706 s) e `git diff --check` (WU-14).
- **Contagens do Developer (rodada 2, árvore completa):** frontend 161 arquivos e 2068 testes, com `goal118-agenda` em 30; `visual-responses.test.mjs` 33 de 33; `test:gate` 266; `validate:core` com 15 passos passando e 2 pulados; `validate:ui` 169 passando e 21 pulados, sem retentativa; `validate:integration` 36 de 36 passos, com BFF integração 540 testes e 275 no gate autenticado (um teste instável fora da Agenda, que passou na nova tentativa).
- **Controles negativos do Developer (rodada 2, a última vez depois da última edição de código):** (a) a folha do A12 gravando no toque reprovou 2 de 30; (b) os pontos do A3 vindos da janela já carregada, sem leitura do mês, reprovaram 4 de 30; (c) "Agendamento" sem `createAppointments` reprovou 1 de 30. Cada fonte voltou da cópia e foi conferida com `cmp`.
- **Conferência do Tech Lead, rodada 2:**
  - **Pilha.** O cluster PostgreSQL 18 descartável do Developer (56318), com BFF em 3012, IA em 3010 e Scheduling em 3013, todos com `/health` `200`. A pilha foi derrubada depois, e a worktree não mudou.
  - **Comparação visual.** `visual:compare` de A2, A3, A4 e A12, com os 16 `side-by-side.png` abertos. A3, A4 e A12 batem com os quadros nos quatro devices, salvo as divergências de D-132. A2 bate em mobile, tablet paisagem e desktop: anel em hoje, o resumo do dia fechado, o vazio centrado e o painel de detalhe vazio.
  - **Regressão.** A1, A10, A11, A5, A6, AG1, K5, K6 e H7 comparados pixel a pixel com as capturas de antes, da WU-01. K5, K6, H7, AG1 e A6: 0 pixel diferente nos quatro devices, então a mudança de `ChatSheetShell` não afetou nada. A1, A10 e A11: só os 28 pixels do chevron. A5: 72 a 156 pixels, na hora do histórico, que é dado da conta.
  - **Código.** A folha do A3 cancela a leitura em voo ao fechar ou trocar de mês; a do A12 mexe só num rascunho e o `PATCH` leva só `{hiddenWeekdays}`; o aviso "Você não atende neste dia" depende da disponibilidade lida; o G-8 mudou só no localizador e no `what`; os testes ajustados trocam o papel do elemento sem afrouxar asserção.

## Correção de registro aplicada no fechamento

O blocker da rodada 2 era só de registro e foi aplicado em `docs/migration/` neste fechamento, sem nova rodada:

1. **VALIDATION_GATE, seção do Goal118, "Testes existentes ajustados".** A linha de `goal100-agenda-semana-mes` passou a citar também o segundo ajuste nesse arquivo, que o §3.3 do Goal manda listar: o resumo do dia fechado esperado passou de "Quinta 1" para "Quinta, 1", o texto do A2 (escolha 1), como o "Quarta 30" para "Quarta, 30" já listado para `goal092`.

## Divergências aceitas

As de D-132: a barra de status, o indicador de início do iPhone e o respiro de topo da casca no mobile; o nome e as iniciais do negócio da conta visual, a casca e o aviso de WhatsApp desconectado, que empurra o vazio do A2 para baixo; as datas e os dias calculados de `{today}` e do `clock`, o dia da semana da frase do A2 e os atendimentos de fundo e os dias marcados do A3; a quarta linha "Exceção do dia" no A4; e, no tablet, o recuo lateral da faixa da semana e do resumo do Dia, que vem do A1 aceito.

## Aceito sem prova completa

1. **Os três controles negativos** vêm da execução do Developer na rodada 2. O Tech Lead não os refez.
2. **As contagens da tabela "Execução final"** vêm do Developer, na rodada 2. Os gates do IA Loop da rodada 2 refizeram a execução, com saída 0.
3. **`validate:integration`** foi aceito pelo `PASSED` da WU-13 da rodada 2, sem reexecução pelo Tech Lead.

## Observações registradas, sem mudar a decisão

1. **O A2 em tablet retrato** tem a faixa da semana e o resumo com recuo lateral de 24 px e cerca de 10 px a mais abaixo das abas, e o botão flutuante 8 px à direita. É idêntico ao A1 já aceito; corrigir mudaria o A1, que o §2.1 do Goal manda manter igual à captura de antes. Fica para uma pessoa avaliar num Goal futuro da casca da Agenda.
2. **O aviso na Semana para atendimento em dia oculto**, que a frase da folha do A12 cita, não existe hoje. A frase fica, conforme o Goal, e o aviso é o primeiro gatilho do "Revisar se" de D-132.
3. **O ambiente do Developer na rodada 1** não tinha banco próprio: o banco de desenvolvimento estava sem a migration do Goal109, e a criação de banco isolado foi negada. Na rodada 2, o Developer subiu um cluster descartável próprio.

## O que o aceite não prova

- A7, S1b, o aviso de dia oculto, `AgendaDayColumn.tsx`, os fluxos de criar, detalhe, cancelar e remarcar, e a folha de Configurações › Agenda: fora do escopo.
- Um aparelho real: a prova é por jsdom, pelas capturas do `visual:compare` nos quatro devices e pelo gate autenticado do `validate:integration`.
