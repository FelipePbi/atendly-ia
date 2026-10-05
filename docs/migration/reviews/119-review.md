# Review formal — Goal 119

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-05, conforme o [Goal119](../goals/119-o-conflito-de-horario-no-novo-agendamento-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 3 terminou `CHANGES_REQUIRED` com 1 blocker só de registro; o IA Loop aceitou a rodada com ele adiado para a documentação de fechamento, onde foi aplicado (ver "Correção de registro aplicada no fechamento").

O conflito de horário do novo agendamento segue o quadro A7 nos quatro devices. Na recusa `409` do hold ou da criação em `/agenda/novo`, o horário recusado vira chip âmbar, o aviso âmbar `role="alert"` diz o que ocupa o intervalo a partir da leitura da ocupação, e o rodapé troca o CTA por "Encaixar mesmo assim" e "Escolher outro horário". O encaixe continua exigindo motivo (D-032 (4)). A remarcação continua com o `ConflictPanel`, sem mudança. Só o frontend mudou: nenhuma mudança no BFF, no Scheduling ou no contrato. Decisão: [D-133](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `6814e29a32dcc8a9333555031015a6fc20c777df` (Goal118). Base imediata da implementação: `5a3dc42382939f94f90d1c92152cad7e7372d3fc` (fechamento do Goal118 e preparação do Goal119), HEAD da worktree `.ai-worktrees/goal-119`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **12 arquivos** (10 rastreados e 2 novos não rastreados), hash do diff `e329d35b112a880c2744a2d7043b5fb77a2d0b2171d47863ec884e2b14a88311`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (3): `features/agenda/AppointmentForm.tsx`, `features/agenda/SlotConflictNotice.tsx` (novo) e `shared/styles/avenly-agenda.css`;
  - `apps/frontend/tests/` (4): `goal119-novo-agendamento-conflito.test.tsx` (novo, 24 testes) e os ajustes de `goal016-a11y`, `goal016-appointment-create` e `goal083-new-appointment`;
  - `apps/frontend/e2e/visual/targets.json` (alvo A7) e `scripts/tests/visual-responses.test.mjs` (exige o alvo e o `waitFor`);
  - `docs/migration/` (3, por acréscimo): D-133 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal119 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal. Nenhum arquivo de `e2e/` além de `targets.json` mudou, nem `scripts/` além do teste de `visual-responses`. O documento do Goal119 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 9 blockers.** O Developer rodou com o plano de 13 Work Units do Tech Lead. A WU-01 adicionou o alvo A7 e o teste de `visual-responses` (34 de 34) e guardou as capturas de antes fora do repositório. A WU-02 implementou o conflito no formulário com testes, mas terminou `BLOCKED` sem `visual:compare`: o BFF local não respondia, e subi-lo exigia ler o `.env` do checkout principal, o que foi negado. A WU-03 (controles negativos, conferência visual e registros) ficou bloqueada. Os gates WU-04 a WU-13 passaram, sobre árvore incompleta. O review rodou `visual:compare` numa pilha descartável própria e mediu o A7. Os blockers: (1) a (4) o rodapé do A7 nos quatro devices — fundo de "Escolher outro horário" (`#FFFDFA` em vez de transparente), altura de 52 px em vez de 54 px, `letter-spacing: 0.02em` herdado nos dois botões e texto de "Encaixar mesmo assim" em `#FFFDFA` em vez de `#F7F4EF`; (5) `entrySentence` sem o motivo como nome do bloqueio, com a asserção de "Almoço" removida de `goal016-appointment-create`; (6) faltavam os testes de troca de data e de cliente, do compromisso pessoal sem título e do chip de volta ao normal; (7) os três controles negativos não rodados; (8) a conferência visual do Developer ausente; (9) D-133 e os dois registros ausentes.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker.** A FIX-001 resolveu os nove: o CSS do rodapé só em `.agenda-new-footer.is-conflict`; `entrySentence` com título, senão motivo, senão o tipo, e a asserção de "Almoço" de volta; os testes novos (24 em `goal119`); os quatro controles negativos; o `visual:compare` de A7, A6, A5, A8, A9, A1 e AG1 numa pilha descartável própria; e D-133 e os registros. Os gates WU-04 a WU-13 passaram. O review mediu o rodapé e o chip iguais ao quadro nos quatro devices, e achou o blocker: `.agenda-new-conflict-title` com `line-height: 1.25`, que o quadro não declara, deixava o corpo do aviso 2 px acima no mobile.
3. **Rodada 3 — `ACCEPTED` pelo IA Loop, com 1 blocker só de registro adiado para o fechamento.** A FIX-001 trocou só essa linha para `line-height: normal`; os patches das rodadas 2 e 3 diferem só nela. Os gates WU-04 a WU-13 passaram. O review terminou `CHANGES_REQUIRED` com 1 blocker só de registro: a seção do Goal119 no VALIDATION_GATE ainda descrevia a execução da rodada 2.

O Developer rodou com o modo `WORK_UNITS`. Na rodada 1, só a WU-01 terminou `COMPLETED` entre as unidades de modelo. Nas rodadas 2 e 3, rodaram a FIX-001 e os gates determinísticos. Em todas as rodadas, a WU-07 (`test:ia-loop`) foi pulada porque o repositório não tem esse script.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal119 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal119) e em D-133.

- **Gates do IA Loop, rodada 3, todos com saída 0 na árvore final e a mesma impressão da fonte (`codeFingerprint`):** `typecheck` (WU-04), `lint` (WU-05), testes alvo `goal119` com 24 de 24 (WU-06), suíte do frontend com 162 arquivos e 2092 testes (WU-08), `test:gate` com 267 (WU-09), `validate:core` com 15 passos passando e 2 pulados (WU-10), `validate:ui` com 169 passed e 21 skipped, sem retentativa (WU-11), `validate:integration` com 36 de 36 passos (WU-12, 710 s) e `git diff --check` (WU-13). No gate autenticado do WU-12, 274 testes passaram de primeira e 1 foi instável: G-7 (detalhe do agendamento a partir de `/agenda`) em mobile-360, com "Cancelar" a 21 px de altura na primeira tentativa, que passou na nova tentativa. O G-7 não usa nada que este Goal mudou.
- **Controles negativos do Developer (rodada 2, depois da última edição de `AppointmentForm.tsx`):** (a) encaixar sem motivo reprovou 2 de 24; (b) leitura falhada tratada como lista vazia reprovou 1 de 24; (c1) "Escolher outro horário" chamando `create` reprovou 2 de 24; (c2) "Escolher outro horário" sem sair do conflito reprovou 4 de 24. Cada fonte voltou da cópia e foi conferida com `cmp`. A rodada 3 não tocou `AppointmentForm.tsx`.
- **Conferência do Tech Lead:**
  - **Rodada 1.** Pilha descartável própria (cluster 55436). O chip âmbar e o aviso bateram com o quadro; o rodapé deu os blockers 1 a 4. A6, A8, A9, A1 e AG1 deram 0 pixel diferente contra as capturas de antes da WU-01; A5 só no horário do histórico, que é dado da conta.
  - **Rodada 2.** Pilha descartável própria (cluster 56419). `visual:compare` de A7 e A6, com os quatro `side-by-side.png` do A7 abertos e medidos: rodapé, chip e espaço entre o bloco Horário e o aviso iguais ao quadro nos quatro devices. Seis arquivos de teste da criação rodados: 97 de 97.
  - **Rodada 3.** A pilha descartável do Developer (cluster 55437). `visual:compare` de A7 e A6, 8 pares sem erro. Aviso medido por pixel: no mobile, caixa de 130 px nos dois e linhas com no máximo 1 px de diferença; no tablet em retrato, caixa de 91 px nos dois, também dentro de 1 px. O A6 deu os mesmos percentuais da rodada 2.
  - **Código.** `isSlotRefusal` aceita o `409` embrulhado pelo BFF como `UPSTREAM_ERROR`; o motivo é aparado e enviado uma vez com `overlapOverride`; "Escolher outro horário" não grava e leva o foco ao primeiro horário livre ou à legenda; `RescheduleFlow` e `ConflictPanel` não mudaram.

## Correção de registro aplicada no fechamento

O blocker da rodada 3 era só de registro e foi aplicado em `docs/migration/` neste fechamento, sem nova rodada:

1. **VALIDATION_GATE, seção do Goal119.** O parágrafo de abertura passou a dizer que o texto foi escrito na rodada 2 e atualizado na rodada 3, com a execução final da rodada 3. Entrou a subseção "Correção da rodada 3", com a troca de `line-height` e as medidas do aviso no mobile e no tablet em retrato. A tabela "Execução final" passou aos valores dos gates WU-04 a WU-13 da rodada 3, com o G-7 instável no `validate:integration`; a linha de `visual-responses.test.mjs` ficou marcada como rodada 2, e o parágrafo da primeira execução do `validate:integration`, como rodada 2. Na conferência visual, a linha do A7 passou a 15,9% / 4,9% / 8,3% / 6,6% (rodada 3), e o item do A7 diz que o aviso foi medido no mobile e no tablet em retrato e não foi medido no tablet em paisagem e no desktop, onde fica abaixo da dobra. "Ambiente" e "Controles negativos" ficaram marcados como rodada 2.

## Divergências aceitas

As de D-133: a barra de status, o indicador de início do iPhone e o respiro de topo da casca no mobile; o nome e as iniciais do negócio da conta visual, a casca e o aviso de WhatsApp desconectado; a cliente, a data e os horários livres da conta de teste e do `clock`, e no desktop os atendimentos da coluna do Dia; o campo "Motivo do encaixe" entre o aviso e o rodapé; e a composição do formulário do A6 aceito (faixa de datas, "Outro horário", lista de serviços da conta), que deixa o aviso abaixo da dobra no tablet em paisagem e no desktop.

## Aceito sem prova completa

1. **Os controles negativos** vêm da execução do Developer na rodada 2. O Tech Lead não os refez; a rodada 3 não tocou o arquivo das mutações.
2. **As contagens da execução final** vêm dos resultados dos gates do IA Loop da rodada 3, sem reexecução pelo Tech Lead. `visual-responses.test.mjs` (34 de 34) vem da rodada 2; o arquivo não mudou depois.
3. **O aviso no tablet em paisagem e no desktop** não foi medido por pixel: fica abaixo da dobra da captura.
4. **A5, A8, A9, A1 e AG1** foram comparados pixel a pixel com as capturas de antes só na rodada 1. Depois disso, o CSS novo só vale com `.is-conflict` ou `.agenda-new-conflict`, e o Developer os recapturou na rodada 2 sem divergência nova visível.

## Observações registradas, sem mudar a decisão

1. **"Outro horário" continua visível durante o conflito**, e o quadro A7 não o desenha. Tratado como parte da composição do A6 aceito, como a faixa de datas.
2. **A remarcação contra o BFF real.** `RescheduleFlow` continua usando `isSlotConflictError`, que não reconhece o `409` embrulhado pelo BFF como `UPSTREAM_ERROR`; então a recusa real não abre o `ConflictPanel` da remarcação. É defeito da baseline, fora do escopo deste Goal, e cabe num Goal futuro.
3. **O ambiente do Developer na rodada 1** não tinha BFF local: subi-lo exigia ler o `.env` do checkout principal, o que foi negado. Na rodada 2, o Developer subiu um cluster descartável próprio.
