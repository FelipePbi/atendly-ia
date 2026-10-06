# Review formal — Goal 125

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal125](../goals/125-lembretes-igual-ao-prototipo-com-a-previa-da-mensagem-e-a-data-em-portugues.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 2 terminou sem blocker, e este fechamento não corrige nada do diff aceito: só registra o aceite em `docs/migration/`.

A tela de Lembretes (`/configuracoes/agenda/lembretes`) fica igual ao quadro AG2 nos quatro devices, salvo as divergências declaradas em D-139, com o cartão "Assim chega para a cliente" mostrando o texto que a IA de fato envia. O lembrete, o aviso de alteração e o de cancelamento passam a dizer o dia da semana, a data e a hora em português ("na quarta-feira, 16/09, às 14h30") em vez de "no dia 2026-09-16 às 14:30", e, sem serviço e sem título, não dizem mais "do seu atendimento de seu atendimento". O corpo do `PATCH /v1/settings/reminders` não muda. Nenhuma mudança no BFF, no Scheduling, no contrato ou no banco. Decisão: [D-139](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `562f43b42f38c62d3417c23fc88411c7d910d83b` (Goal124). Base imediata da implementação: `6cc84b0b9a3118ad0a0b3649cda98c3127b1f9c2` (fechamento do Goal124 e preparação do Goal125), HEAD da worktree `.ai-worktrees/goal-125`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **19 arquivos** (16 rastreados e 3 novos não rastreados), hash do diff `d0e8a494adff0d975d66bf6e722359cdd2096fa948244c9746b5831a93c4064a`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/ai-orchestrator/` (3): `src/modules/reminders/notification-message.ts`, `tests/reminders/notification-message.test.ts` e `tests/reminders/notification-delivery.test.ts`;
  - `apps/frontend/src/` (5): `features/reminders/reminderPreview.ts` (novo), `features/reminders/ReminderSettingsSection.tsx`, `features/settings/ProductSettingsScreen.tsx` (sem a descrição, passando `settings`), `features/settings/shared/SettingsPage.tsx` (só `description` opcional) e `shared/styles/avenly-settings.css`;
  - `apps/frontend/tests/` (6): `goal125-lembretes.test.tsx` e `goal125-previa-do-lembrete.test.ts` (novos, 30 e 18 testes) e os ajustes de `goal021-a11y`, `goal021-reminder-settings-section`, `goal021-shell-invariant` e `goal067-configuracoes-ia-conta`;
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (o AG2) e `scripts/tests/visual-responses.test.mjs` (de 49 para 52 testes);
  - `docs/migration/` (3, por acréscimo): D-139 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal125 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal. `apps/frontend/e2e/routes.ts` não mudou: o `contentMarker` "Lembretes" continua achando a tela. `SettingsPage.tsx` está sob `apps/frontend/src/`, e a escolha 4 do Goal previa o ajuste; as outras telas de Configurações continuam passando `description`. O documento do Goal125 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers (2 de código ou evidência, 1 só de documentação), de volta ao Developer.** O review DEEP aprovou a mensagem do orquestrador, a prévia, o salvar e a captura, e pediu:
   1. o rodapé fixo do "Salvar" no tablet e no desktop reaproveitava `.rules-save` do AG3 (`padding: 12px 20px 20px`), e o quadro declara 28 px embaixo no tablet em retrato e 24 px no tablet em paisagem e no desktop; medido no `visual:compare`, o botão ficava 8 px (retrato) e 4 px (paisagem e desktop) fora do lugar, sem divergência declarada;
   2. as `notes` do AG2 em `targets.json` não citavam todas as divergências de D-139: faltavam a barra de status e o indicador de início do iPhone, o estado da casca (linhas do hub, "Notificações" e o cartão da prévia atrás do "Salvar" fixo no celular), "Ativar lembretes", "Remover segundo lembrete" e o campo "Minutos antes";
   3. a seção do Goal125 em `VALIDATION_GATE.md` dizia que `validate:core`, `validate:ui` e `validate:integration` não tinham rodado, e os três tinham passado no IA Loop.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** A FIX-001 resolveu os três: `.reminders-screen .rules-save` ganhou 28 px embaixo de 768 a 1023 px e 24 px a partir de 1024 px, só na tela de Lembretes; as `notes` do AG2 passaram a citar todas as divergências, mantendo 'Nenhum passo toca "Salvar"'; e a seção do VALIDATION_GATE ganhou a tabela dos gates do harness.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal125, com a execução final da rodada 2 acrescentada neste fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal125) e em D-139.

- **Gates do IA Loop, rodada 2, todos com saída 0 na árvore final:** typecheck do frontend (WU-05) e do orquestrador (WU-06), lint do frontend (WU-07), testes alvo `goal125` com 2 arquivos e 48 testes (WU-08), testes alvo `reminders/notification-` do orquestrador com 3 arquivos e 38 testes (WU-09), suíte do frontend com 173 arquivos e 2258 testes (WU-11), `test:gate` com 285 pass e 0 fail (WU-12), `validate:core` com 17 passos, 15 passando e 2 pulados (`test:bff` e `test:health-worker`) (WU-13), `validate:ui` com 169 passed, 21 skipped e 0 retentativas (WU-14), `validate:integration` com 36 de 36 passos e o gate autenticado em 280 passed e 0 retentativas (WU-15) e `git diff --check` (WU-16). WU-10 (`test:ia-loop`) foi pulada porque o repositório não declara esse script; os testes da captura rodam dentro do `test:gate`.
- **Controles negativos do Developer (rodada 1):** (a) a data crua de volta reprovou 6 de 18 testes de `notification-message.test.ts`; (b) "na sábado", 1; (c) o fecho do `CASUAL` trocado só na prévia, 1 de 48 (o par literal); (d) a prévia ignorando a confirmação, 3; (e) o `PATCH` sem `confirmationEnabled`, 4; (f) um passo que toca "Salvar" no AG2, 2 de 52 em `visual-responses.test.mjs`. Cada mutação foi revertida e conferida com `cmp`.
- **Os mesmos textos dos dois lados:** seis pares literais, afirmados em `goal125-previa-do-lembrete.test.ts` (`PAIRS`) e em `notification-message.test.ts`, cobrindo os três estilos, com e sem confirmação, com e sem preço e com e sem serviço.
- **Conferência do Tech Lead:**
  - **Código:** `whenOf` valida `AAAA-MM-DD` e `HH:MM`, tira o dia da semana pelo algoritmo de Sakamoto com inteiros, sem `Date`, `Intl` nem fuso, e volta ao texto literal de antes quando o fato é inválido; a mesma aritmética e a mesma frase sem serviço estão em `reminderPreview.ts`. As vozes, a regra do preço e a regra da confirmação não mudaram. O frontend não importa do orquestrador. O `PATCH` sai com o mesmo corpo, uma vez, só em "Salvar"; validação, mensagens, `Skeleton` e leitura falhada continuam como antes; `useShellConfig` continua com uma chamada por árvore, em `ProductSettingsScreen`.
  - **`visual:compare` do AG2:** refeito nas duas rodadas, saída 0. Rodada 1: 14,0/5,8/6,9/6,1% (mobile, tablet em retrato, tablet em paisagem, desktop), iguais aos do Developer, com o corpo dentro de 1 px nos quatro devices e o rodapé fora (blocker 1). Rodada 2: 14,0/4,3/6,3/5,5%, os quatro `side-by-side.png` abertos; o "Salvar" fica em y 944–995 com 28 px embaixo no retrato, y 611–662 com 105 px na paisagem e y 692–743 com 24 px no desktop, no protótipo e no app, com 1 px de diferença na borda esquerda. No celular, 20 px no app contra 46 px no quadro: o indicador de início do iPhone, declarado.
  - **Regressão:** o AG3 repetiu 15,2/6,4/7,5/6,7%; a classe `.reminders-screen` só existe em `ReminderSettingsSection.tsx`. A regressão de AG1, M1, N1 e IA1 é a do Developer (VALIDATION_GATE).
  - **Notes e captura:** `node --test scripts/tests/visual-responses.test.mjs` com 52 pass e 0 fail na rodada 2.
  - **Contagens dos gates globais no VALIDATION_GATE:** o Developer copiou os números do blocker 3, atribuídos à rodada 1; o Tech Lead os conferiu contra os resultados da rodada 2 do IA Loop, e são iguais.
  - Na rodada 2, a reescrita de `apps/frontend/AGENTS.md` pelo `next dev` durante a captura foi devolvida; o arquivo não faz parte do diff.

## Registro aplicado no fechamento

Sem blocker adiado. Só em `docs/migration/`:

1. `DECISIONS.md`: o status de D-139 passou a ACCEPTED, com a nota de fechamento.
2. `VALIDATION_GATE.md`, seção do Goal125: a subseção "Execução final (rodada 2, IA Loop)", com as contagens da rodada 2, que são as da árvore aceita, e a razão de os controles negativos da rodada 1 continuarem valendo.
3. Este review.

## Divergências aceitas

Declaradas pelo Goal ou por D-139, conferidas nas capturas:

1. O balão mostra a mensagem que a IA envia no estilo da conta (saudação, "Passando para lembrar…", a data sem "amanhã" e o fecho do estilo), não o texto do quadro; a nota do cartão segue a política de preço ("Sem preço, como configurado." ou "Com o valor quando o serviço tem preço fixo.").
2. "Desativar lembretes", "Ativar lembretes" e "Remover segundo lembrete", que o quadro não mostra; o contrato permite `rules: []` e o app já oferecia isso.
3. O campo "Minutos antes" de "Outro", que o quadro não abre.
4. O estado da casca da conta visual: o aviso "Atendimento automático parado", que empurra o conteúdo para baixo e, no celular e no tablet, deixa o cartão da prévia atrás do "Salvar" fixo até a rolagem; as linhas do hub e o item "Notificações".
5. A barra de status e o indicador de início do iPhone do protótipo, incluindo a folga de 46 px embaixo do "Salvar" no celular.

## Aceito sem prova completa

1. **Os controles negativos** vêm da execução do Developer na rodada 1. A rodada 2 só mexeu no CSS escopado do rodapé, nas `notes` do AG2 e no VALIDATION_GATE, que não tocam nas linhas mutadas nem nos testes que eles reprovaram; por isso não foram refeitos.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` do AG2 e do AG3 e de `visual-responses.test.mjs`.
3. **A regressão de AG1, M1, N1 e IA1** é a do Developer, na rodada 1; o Tech Lead não a refez, porque o CSS novo usa classes novas e o único efeito compartilhado é `description` opcional em `SettingsPage`.
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Observações registradas, sem mudar a decisão

1. A prévia usa o primeiro serviço com `active` na ordem que `serviceCatalog.list()` devolve (ativos primeiro, depois por nome), incluindo serviço que precisa de revisão. A tela de Serviços ordena por `localeCompare` pt-BR e põe os que precisam de revisão num grupo próprio, então o serviço do exemplo pode não ser o primeiro que a pessoa vê na lista, ao contrário do que a escolha 3 do Goal e D-139 dizem. O texto da prévia continua o que a IA enviaria para aquele serviço.
2. `weekdayIndex` daria índice negativo para o ano `0000`, entrada que o Scheduling não manda.
3. Em `scripts/tests/visual-responses.test.mjs`, `const CONFIRMING_NAMES =[` perdeu o espaço antes do `[`. Só formatação.
