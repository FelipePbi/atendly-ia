# Review formal — Goal 126

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal126](../goals/126-a-central-de-notificacoes-vazia-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 1 saiu `CHANGES_REQUIRED` com 1 blocker só de documentação; o IA Loop aceitou a rodada e adiou a correção para este fechamento, sem nova rodada do Developer. A correção foi aplicada aqui, só em `docs/migration/`.

A central de notificações sem nenhuma notificação fica igual ao quadro NT2 nos quatro devices, salvo as divergências declaradas em D-140, na tela empurrada (`/notificacoes`) e na gaveta: o sino dentro do anel que respira, "Nada por aqui", o texto e a pílula "IA ativa · tudo em ordem". A pílula só aparece quando o status confirma a IA e o WhatsApp ativos. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-140](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `c53be398a35ed10a6a402035067f585b9e04c5e3` (Goal125). Base imediata da implementação: `1df4d527b5a9cecbae4ff0577db655a0290cce1b` (fechamento do Goal125 e preparação do Goal126), HEAD da worktree `.ai-worktrees/goal-126`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **9 arquivos** (8 rastreados e 1 novo não rastreado), hash do diff `3fb9f4b3e7ebdd54aad30e484aa651efdb19259489d77b3882028ec80bac846e`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (2): `features/notifications/NotificationsScreen.tsx` (`NotificationsEmpty` no lugar do `StatePanel` "Tudo em dia", com a pílula lida de `useSystemStatus()`) e `shared/styles/avenly-notifications.css`;
  - `apps/frontend/tests/` (2): `goal126-notificacoes-vazio.test.tsx` (novo, 15 testes) e o ajuste de `goal022-notifications-screen.test.tsx`;
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (o NT2) e `scripts/tests/visual-responses.test.mjs` (de 52 para 54 testes);
  - `docs/migration/` (3, por acréscimo): D-140 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal126 em `VALIDATION_GATE.md`.
- Todos dentro do critério 7 do Goal. `apps/frontend/e2e/routes.ts`, `scripts/visual-compare.mjs` e `scripts/lib/visual-responses.mjs` não mudaram. O documento do Goal126 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — review `CHANGES_REQUIRED`, 1 blocker só de documentação; decisão efetiva `ACCEPTED`, com a correção adiada para o fechamento.** O review DEEP aprovou o código, os testes, a captura e os gates. O blocker: a segunda divergência declarada de D-140 e o bullet correspondente do `VALIDATION_GATE.md` não quantificavam o deslocamento vertical do bloco vazio. Na gaveta, a frase só dizia que o link "Preferências de notificação" fica no rodapé, sem dizer que o bloco sobe 24 px por isso.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-140, segunda divergência declarada (blocker 1 adiado): o trecho final passou a dizer que, na gaveta, o bloco centra na altura que sobra acima do rodapé e por isso fica 24 px acima do quadro no tablet em paisagem e no desktop, e que em `/notificacoes` fica cerca de 118 px acima no mobile e 117 px no tablet em retrato.
2. `VALIDATION_GATE.md`, seção do Goal126, subseção `visual:compare` (blocker 1 adiado): "pelo mesmo motivo desloca o bloco para cima" passou a "pelo mesmo motivo desloca o bloco 24 px para cima (tablet em paisagem e desktop); em `/notificacoes` o deslocamento é de cerca de 118 px no mobile e 117 px no tablet em retrato".
3. `DECISIONS.md`: o status de D-140 passou a ACCEPTED, com a nota de fechamento.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal126), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal126) e em D-140.

- **Gates do IA Loop, rodada 1, todos com saída 0 na árvore aceita:** typecheck (WU-03), lint (WU-04), testes alvo (WU-05), suíte do frontend (WU-06), `test:gate` (WU-07), `validate:core` (WU-08), `validate:ui` (WU-09), `validate:integration` (WU-10) e `git diff --check` (WU-11). As contagens conferem com o VALIDATION_GATE: frontend 174 arquivos e 2273 testes, `test:gate` 287 sem falha, `validate:core` 17 passos com 15 passando e 2 pulados (`test:bff` e `test:health-worker`), `validate:ui` 169 passando e 21 pulados com retries 0, `validate:integration` 36 de 36 passos com o gate autenticado em 280 e retries 0.
- **Controles negativos do Developer (rodada 1):** (a) a pílula sem a condição do WhatsApp reprovou 2 de 22; (b) a pílula também com a IA `pending`, 1 de 22; (c) o `StatePanel` "Tudo em dia" de volta, 14 de 22; (d) o NT2 com uma notificação em `items`, 1 de 54 em `visual-responses.test.mjs`. Cada mutação foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código:** `NotificationsEmpty` substitui o `StatePanel` na página e na gaveta. O anel, o círculo e o sino ficam num wrapper `aria-hidden`, e "Nada por aqui" é `h3`. O texto usa o terceiro exemplo honesto ("um lembrete que não foi enviado"). A pílula só aparece com `aiView` e `whatsappView` em `"active"`, lidos de `useSystemStatus()`, sem leitura nova de status. O CSS reusa `at-breathe` e tem a regra de `prefers-reduced-motion`.
  - **Captura:** o NT2 tem só os três `GET` fixos (`/v1/notifications` vazio, `/v1/notifications/summary` zerado e `/v1/status` ativo) e só os passos do sino; o NT1 continua sem `responses`. O ajuste de `goal022` só troca o texto esperado e simula `useSystemStatus`, sem afrouxar asserção.
  - **`visual:compare` do NT2:** refeito pelo Tech Lead, saída 0, com 4,3/1,8/53,9/64,8% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos percentuais do Developer. Os quatro `side-by-side.png` foram abertos, e `prototype.png` e `app.png` foram medidos em resolução cheia. A posição horizontal, os tamanhos (pílula 171×30, anel 88 px), as cores, a tipografia e o espaço interno do bloco batem pixel a pixel com o quadro nos quatro devices. Na gaveta (1024×768 e 1366×768), o bloco inteiro fica 24 px acima do quadro: o topo da pílula está em y=454 no app e em y=478 no protótipo. Em `/notificacoes`, cerca de 118 px acima no mobile e 117 px no tablet em retrato. Os dois deslocamentos vêm da preferência e do rodapé, divergências declaradas; o número faltava no registro (blocker 1). No tablet em paisagem e no desktop, o percentual alto é quase todo a Home da conta visual atrás da gaveta, como no NT1.

## Divergências aceitas

Declaradas pelo Goal ou por D-140, conferidas nas capturas:

1. O terceiro exemplo do texto: "um lembrete que não foi enviado" no lugar de "um serviço que impede a IA de marcar", aviso que a central não manda.
2. Em `/notificacoes`, a seção de preferência abaixo do bloco vazio; na gaveta, o link "Preferências de notificação" no rodapé. O bloco centra na altura que sobra acima delas: 24 px acima do quadro no tablet em paisagem e no desktop, cerca de 118 px no mobile e 117 px no tablet em retrato.
3. No tablet em paisagem e no desktop, a Home da conta visual atrás da gaveta, com o WhatsApp e a IA ativos pela resposta fixa; o título "Notificações" da gaveta alguns pixels à esquerda do centro, como no NT1.
4. A barra de status e o indicador de início do iPhone nos quadros mobile; no app, o cabeçalho da tela empurrada fica cerca de 14 px abaixo do quadro por isso, como no NT1.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer, na rodada 1; o Tech Lead não os refez.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` do NT2.
3. **A regressão de NT1 e H1** é a do Developer (o `app.png` dos oito pares igual byte a byte ao de antes); o Tech Lead não a refez, porque o NT1 não tem `responses` e a lista com notificação não muda.
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.
