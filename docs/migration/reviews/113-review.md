# Review formal — Goal 113

**Decisão vigente — rodada 6: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-04, conforme o [Goal113](../goals/113-lista-de-conversas-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

A lista de `/conversas` segue os quadros C1 (Comercial), C2 (Não classificadas) e C3 (Pessoal), e o vazio com o WhatsApp conectado segue o C4, nos quatro devices. O cabeçalho tem o título serifado e o botão de lupa; a busca e a lente "Ignorados" ficam atrás da lupa; as abas são sublinhadas, com o contador âmbar só de quem exige atenção; a aba Comercial agrupa "Aguardando você", "Hoje" e as anteriores. De 1024 px em diante a lista fica numa coluna de 381 px ao lado do painel "Selecione uma conversa", pela técnica de D-126. O `visual:compare` ganha os alvos `Conversas:C1` a `C4`, com respostas fixas e datas relativas. Nenhum contrato e nenhum backend mudaram. Decisão: [D-127](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `940f1985f6aa59c6c8490f7dae91619915f564bb` (Goal112). Base imediata da implementação: `5b41f442c1a2f2bd327efae3d331d22bfd855447` (preparação do Goal113), HEAD da worktree `.ai-worktrees/goal-113`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **17 arquivos** (15 rastreados e 2 testes novos não rastreados), hash do diff `ef98e8c592e5434b6c35b685793867b491262aa67b9bf09d5bfebe76ee6edcb8`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (5): `features/conversations/ConversationInbox.tsx`, `ConversationRow.tsx`, `format.ts`, `inboxLenses.ts` e `shared/styles/avenly-conversations.css`;
  - `apps/frontend/tests/` (5): `goal113-conversas-lista` e `goal113-conversas-composicao` (novos), e `goal017-inbox-tabs`, `goal017-shell-invariant` e `goal096-conversas-e-notificacoes` (ajustados ao novo desenho, conforme o §6.3 do Goal);
  - `apps/frontend/e2e/visual/targets.json` (alvos C1 a C4);
  - `scripts/` (3): `tests/visual-responses.test.mjs`, `lib/visual-responses.mjs` e `visual-compare.mjs`;
  - `docs/migration/` (3, por acréscimo): D-127 em `DECISIONS.md`, o delta do Goal113 em `CURRENT_STATE.md` e a seção do Goal113 em `VALIDATION_GATE.md`.
- **Exceção ao critério 7, autorizada neste review na rodada 1.** `scripts/lib/visual-responses.mjs` e `scripts/visual-compare.mjs` estão fora da lista do critério 7. A troca de `{today}` e `{today-N}` nas respostas fixas (`resolveRelativeDays` e a linha do `route.fulfill`) foi autorizada porque é a única forma de cumprir a escolha 5 do Goal: o `clock` fixa a hora no dia real da semeadura, e datas ISO fixas deixariam de bater. O campo `query` por entrada, que a rodada 1 também tinha posto no harness, não foi autorizado e saiu na rodada 2. O registro está no item 7 de D-127.
- Nenhum arquivo de `e2e/` além de `targets.json` mudou, nem backend, contratos ou `packages/`. O documento do Goal113 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 5 blockers.** O código de lista, contador, busca, lente "Ignorados" e composição estava coerente com o Goal. Os blockers: (1) o contador da Comercial saía círculo de 20 px, e não pílula de 32×20, porque o app usa `border-box` e o protótipo mede em `content-box`; (2) a mesma conversão faltava no disco da lupa (40 contra 42 px) e nos balões do C4 (96×44 contra 99×47); (3) os `scripts/` mudaram fora do critério 7: o suporte a `query` tinha de sair, e a troca `{today}` ficou autorizada; (4) o controle do §4.3 não estava em VALIDATION_GATE; (5) faltavam as contagens finais dos gates, e os controles negativos tinham de ser refeitos depois da última edição.
2. **Rodada 2 — `CHANGES_REQUIRED`, 3 blockers.** Os cinco blockers da rodada 1 foram fechados. Ficaram dois defeitos de porte, que o Developer não viu porque só abriu capturas mobile: (1) de 1024 px em diante o cabeçalho usava `padding-top` de 29 px, e a coluna descia 3 a 5 px; (2) o `h2` do C4 herdava `letter-spacing: -0.015em` da regra global. (3) A evidência visual final estava incompleta.
3. **Rodada 3 — `CHANGES_REQUIRED`, 2 blockers.** Cabeçalho e título do C4 corrigidos. (1) O horário de cada linha de C1 a C3 ficava 2 px acima do quadro, nos 4 devices, porque `align-self: start` da regra base vencia o alinhamento por linha de base. (2) D-127, CURRENT_STATE e VALIDATION_GATE traziam números e afirmações de rodadas anteriores.
4. **Rodada 4 — `CHANGES_REQUIRED`, 1 blocker.** O horário passou a `align-self: baseline` e os registros foram refeitos. Ficou a coluna da lista de 1024 px em diante com 380 px, e não os 381 px do quadro (`width:380px` mais 1 px de borda em `content-box`). A diferença trocava o corte do texto (`Posso confi…` virava `Posso con…`). O Developer a tinha declarado como divergência, mas o Goal não a autoriza.
5. **Rodada 5 — `CHANGES_REQUIRED`, 1 blocker, só de documento.** A classe `conversation-list-detail` no invólucro e `grid-template-columns: 381px minmax(0, 1fr)` só nela fecharam o blocker; a regra compartilhada `.list-detail` não mudou. Ficou uma frase da rodada 4 no parágrafo de capturas de VALIDATION_GATE, que dizia que a coluna ainda era 1 px mais estreita.
6. **Rodada 6 — `ACCEPTED`, 0 blockers.** A FIX-001 reescreveu só esse parágrafo: a frase ficou como histórico da rodada 4, e os fatos da rodada 5 ficaram explícitos. Os fingerprints mostram que o código é o da rodada 5.

O Developer rodou com o modo `WORK_UNITS`: 13 unidades na rodada 1 (WU-01 a WU-04 de modelo e WU-05 a WU-13 determinísticas) e, da rodada 2 à 6, a FIX-001 mais os nove gates WU-05 a WU-13.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal113 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal113) e em D-127.

- **Gates do IA Loop, rodada 5, todos com exit 0:** `typecheck` (WU-05, 1,7 s), `lint` (WU-06, 14 s), testes alvo `goal113` (WU-07, 2,8 s), suíte do frontend (WU-08, 40 s), `test:gate` (WU-09, 1,4 s), `validate:core` (WU-10, 92 s), `validate:ui` (WU-11, 45 s), `validate:integration` (WU-12, 699 s) e `git diff --check` (WU-13). Na rodada 6, os oito primeiros foram reaproveitados da rodada 5, porque só `docs/**/*.md` mudou desde aquela execução, e `git diff --check` rodou de novo com exit 0. Os nove gates passaram em todas as rodadas, de 1 a 6.
- **Contagens do Developer na árvore final (rodada 5):** suíte do frontend com 155 arquivos e 1917 testes, que é a contagem do fechamento do Goal112 (153 e 1893) mais os 2 arquivos novos com 23 testes e 1 teste a mais em `goal017-inbox-tabs` (13 para 14 casos); testes `goal113` com 23 passando; `test:gate` com 249; `visual-responses.test.mjs` com 16; `validate:core` com 15 passos passando e 2 pulados; `validate:ui` com 169 passando e 21 pulados; `validate:integration` com 36 de 36 passos e 275 testes no gate autenticado, 0 flaky e 0 retentativas.
- **Conferência do Tech Lead, rodadas 3 a 6, na worktree:**
  - **Comparação visual.** Em cada rodada, o Tech Lead subiu o PostgreSQL descartável do Developer em `127.0.0.1:55733` (sem ele o login da conta visual dava 500), rodou `npm run visual:compare -- --target Conversas:C1,Conversas:C2,C3,C4` e parou o banco no fim. Na rodada 6: 16 capturas, exit 0, com os mesmos percentuais da rodada 5 (C1 1,5 / 0,4 / 0,2 / 0,3; C2 1,8 / 0,5 / 0,9 / 0,8; C3 1,7 / 0,4 / 1,1 / 0,4; C4 1,0 / 0,1 / 0,7 / 0,3, em mobile, tablet retrato, tablet paisagem e desktop). Os 16 `side-by-side.png` foram abertos nas rodadas 5 e 6.
  - **Medida por pixel.** O divisor da lista cai em x=612 no desktop e x=380 na paisagem, no quadro e no app. As faixas de tinta do horário de C1 em desktop e paisagem são idênticas às do quadro, e `Posso confi…` trunca igual. Título, faixa de abas e primeira linha coincidem com o quadro de 1024 px em diante desde a rodada 3.
  - **Escopo.** Em `scripts/` só ficou a troca `{today}` autorizada na rodada 1. Nenhum arquivo de `e2e/` além de `targets.json` mudou. A regra compartilhada `.list-detail` (`avenly.css`) não mudou.
  - **Registros.** D-127 item 8 descreve as medidas em `content-box`, o cabeçalho de 1024 px, o `letter-spacing` do C4, o horário e a coluna de 381 px. VALIDATION_GATE traz o controle do §4.3, os controles negativos da rodada 5 e as contagens da execução final.

## Divergências aceitas

As quatro primeiras do Goal (barra do iPhone, nome do negócio da conta visual, ponto de "não lida" por D-033 e contador da Comercial em C2 e C3). A quinta, do banner da casca, caiu: os quatro alvos servem `GET /v1/status` conectado (item 6 de D-127). Também estas, declaradas em D-127 e aceitas por não mudarem estrutura, componente, cor nem tipografia:

1. A casca: item "Notificações", badge de Conversas, estilo do ícone e altura da barra inferior. A casca está fora do Goal.
2. "IA atendendo · em confirmação" (C1, Pedro): o contrato não traz o dado.
3. O dia da semana de Renata (C3): o app calcula de `updatedAt`, com `{today-3}`; o protótipo traz `ter` fixo.
4. O anel de foco de `main` na captura do C1, que o `AppShell` aplica ao mudar o `pathname`.
5. Deslocamentos de 1 px por arredondamento: o título mobile de C1 a C4, o bloco do C4 em paisagem e desktop e o texto do aviso de C2 e C3 de 1024 px em diante.
6. O título do C5 mobile 16 px abaixo do quadro, que já existia e não foi tocado.

## Aceito sem prova completa

1. **Os três controles negativos** (a), (b) e (c) do §6.2 vêm da execução do Developer na rodada 5, com as mensagens registradas e `cmp` depois de cada reversão. O Tech Lead não os refez.
2. **O controle do §4.3** (W1, I1, C5, NT1 e H3 contra a base `5b41f44`) vem da execução do Developer. A variação de NT1 mobile (9,8 contra 14,1) foi aceita como oscilação do próprio alvo, que deu 8,4 a 14,1 nas duas árvores.
3. **O C5** não foi refeito depois da rodada 3; os números dele são os do controle e da rodada 3 (2,6 / 0,6 / 0,5 / 0,8).
4. **Os gates da rodada 6** são os da rodada 5, reaproveitados pelo IA Loop porque o código não mudou.
5. **A causa do 1 px vertical do aviso de C2 e C3** de 1024 px em diante não foi isolada.

## Observações registradas, sem mudar a decisão

1. **Redação do parágrafo "Capturas abertas e lidas" em VALIDATION_GATE.** O parêntese "(última divergência da lista abaixo)" aponta para o sétimo item da lista, não para o último. A frase "o que resta de 1 px vertical está só em…" não conta o 1 px do título mobile nem o do C4, que a própria lista registra. A redação veio do texto do blocker da rodada 5; a lista de divergências está completa.
2. **O RTK reescreve a saída do eslint.** Com o RTK ligado, `npx eslint` e `npm run lint` saíram 1 sem mensagem na máquina do Developer, que usou `rtk proxy` para a execução que vale. O gate de lint do IA Loop passou com exit 0.
3. **`validate:integration` exige `BFF_TEST_DATABASE_URL`** e não cai no `.env` do BFF. As execuções usaram um PostgreSQL descartável em porta própria, parado depois.
4. **O Goal autoriza a leitura `category=COMMERCIAL` para o contador**, e a resposta fixa ignora a query. Por isso C2 e C3 no `visual:compare` nunca mostram o contador; a prova dele é por jsdom e pela captura do C1.

## O que o aceite não prova

- O chat (`/conversas/[id]`, K1 a K6), que continua com o desenho anterior.
- Um contador de não lidas ou o estado "em confirmação": o contrato não traz esses dados.
- O badge de Conversas na casca, que não lê o contador da lista.
- Um aparelho real: a prova é por jsdom e pelas capturas do `visual:compare` nos quatro devices.
- A lista com dados reais da conta de teste: os quadros C1 a C4 são alcançados por respostas fixas, e o gate autenticado prova `/conversas` com conversa real só por `a.conversation-row` e `.message-timeline`.
