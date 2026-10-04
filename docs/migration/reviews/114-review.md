# Review formal — Goal 114

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-04, conforme o [Goal114](../goals/114-o-chat-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

`/conversas/{id}` segue os quadros K1 (IA atendendo), K2 (aguardando você), K3 (você atendendo) e K4 (conversa pessoal) nos quatro devices. O estado mora numa linha do cabeçalho, uma por estado de `conversationState`, e a barra `conversation-state-bar` saiu. "Retomar IA" fica no cabeçalho com você atendendo. Assumir, criar agendamento, mudar a categoria, ignorar e resolver ficam no menu "Mais ações" ou no contexto. O nome com o chevron abre o contexto em folha, e o botão "Abrir contexto" e a coluna `conversation-context` saíram. De 1024 px em diante, a coluna ao lado do chat é a lista do Goal113 (`useConversationList` e `ConversationListColumn`, compartilhados com `/conversas`), na aba da categoria da conversa e com a linha aberta marcada. `conversation-rail` e a leitura `list({ limit: 50 })` do chat saíram. O `visual:compare` ganhou os alvos K1 a K4. Nenhum contrato, backend ou `packages/` mudou. Decisão: [D-128](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `65cb0022d37289169e9efdd00a50392978c44d8c` (Goal113). Base imediata da implementação: `cac9fda8c28486ed9eb31412e644c4662a99dfa3` (preparação do Goal114), HEAD da worktree `.ai-worktrees/goal-114`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **25 arquivos** (22 rastreados e 3 novos não rastreados), hash do diff `a2719b6597bedb81d7107ae0ce5d127f6354052d4d54db5114c056b91446664e`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (10): `features/conversations/ConversationInbox.tsx`, `ConversationListColumn.tsx` (novo), `ConversationRow.tsx`, `ConversationSuggestions.tsx`, `ConversationThread.tsx`, `MessageAttachment.tsx`, `MessageTimeline.tsx`, `conversationState.ts`, `format.ts` e `shared/styles/avenly-conversations.css`;
  - `apps/frontend/tests/` (10): `goal114-chat` e `goal114-chat-composicao` (novos), e `goal017-a11y`, `goal017-contact-profile`, `goal017-human-handling`, `goal017-inbox-tabs`, `goal017-reachability`, `goal017-shell-invariant`, `goal017-suggestions` e `goal023-conversation-expired` (ajustados à estrutura nova, conforme o §5.3 do Goal; a lista de cada ajuste está em VALIDATION_GATE);
  - `apps/frontend/e2e/visual/targets.json` (alvos K1 a K4);
  - `scripts/tests/visual-responses.test.mjs`;
  - `docs/migration/` (3, por acréscimo): D-128 em `DECISIONS.md`, o delta do Goal114 em `CURRENT_STATE.md` e a seção do Goal114 em `VALIDATION_GATE.md`.
- Todos os arquivos estão dentro da lista do critério 7. Nenhuma exceção foi pedida nem autorizada. Nenhum arquivo de `e2e/` além de `targets.json` mudou, nem `scripts/` além do teste, nem backend, contratos ou `packages/`. O documento do Goal114 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 8 blockers.** Só o trabalho de arquivo da WU-01 chegou: K1 a K4 em `targets.json` (rota `/conversas/{id fixo}`, `clock` 13:45 e cinco respostas `GET`) e o teste de `visual-responses`. O Tech Lead validou as respostas fixas de K1 a K4 contra `conversationSchema`, `messageSchema` e `conversationEventSchema`, e todas passaram; essa parte ficou para as rodadas seguintes. A WU-01 falhou com `ACCEPTANCE_NOT_MET`, porque o login da conta visual respondia 500 (`ensureVisualAccount`, pilha local fora do ar), e as WU-02 a WU-04 ficaram bloqueadas. Os blockers: (1) o chat não foi portado; (2) a composição de 1024 px não mudou; (3) não havia testes `goal114`; (4) os controles negativos não rodaram; (5) a execução de controle do §3.3 e as capturas de antes não tinham evidência; (6) a fidelidade visual não podia ser conferida; (7) faltavam D-128, CURRENT_STATE e VALIDATION_GATE; (8) nenhum gate rodou sobre árvore completa, e `test:gate` reprovava pela falta do cliente Prisma gerado em `apps/ai-orchestrator`, precondição de ambiente.
2. **Rodada 2 — `CHANGES_REQUIRED`, 3 blockers.** A FIX-001 fez o porte, a coluna compartilhada, os testes, os controles e os registros. O Tech Lead conferiu o código diretamente, refez o `visual:compare` de K1 a K4 e de `Conversas:C1,C4` contra a pilha descartável do Developer (BFF em 3012) e abriu os 16 `side-by-side.png` de K1 a K4. Os números bateram com os do Developer, e C1 e C4 ficaram iguais aos do Goal113. Ficaram três blockers: (1) na nota do K4, o espaço entre "·" e "alterar" tinha uns 4 px, contra os 8 px de `gap` do quadro, porque o texto e o botão estavam dentro de um só `<span>`; (2) essa correção é edição de código, então os controles negativos tinham de ser refeitos depois dela; (3) a linha de `validate:integration` em VALIDATION_GATE dizia "não concluído", e na mesma árvore a WU-13 tinha passado com 36 de 36 passos e 275 testes no gate autenticado. A FIX-001 terminou `BLOCKED` só porque o Developer não viu o fim da integração.
3. **Rodada 3 — `ACCEPTED`, 0 blockers.** A FIX-001 pôs o texto (`<span>`) e o botão "alterar" como filhos diretos de `p.chat-ignored-note` (`inline-flex`, `gap: 8px`), como no quadro (`Conversas-Desktop.dc.html:193`), refez os três controles negativos e trocou a linha de `validate:integration` pelas contagens finais. O diff entre os patches das rodadas 2 e 3 mexe só no markup da nota do K4, na asserção correspondente de `goal114-chat.test.tsx` e nos três registros.

O Developer rodou com o modo `WORK_UNITS`: 14 unidades na rodada 1 (WU-01 a WU-04 de modelo e WU-05 a WU-14 determinísticas) e, nas rodadas 2 e 3, a FIX-001 mais os dez gates WU-05 a WU-14.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal114 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal114) e em D-128.

- **Gates do IA Loop, rodada 3, sobre a árvore final, todos com exit 0:** `typecheck` (WU-05, 1,7 s), `lint` (WU-06, 14,5 s), testes alvo `goal114` (WU-07, 3,5 s) e suíte do frontend (WU-08, 40 s), com estado `PASSED`; `test:gate` (WU-10, 1,4 s), `validate:core` (WU-11, 93 s), `validate:ui` (WU-12, 46 s), `validate:integration` (WU-13, 699 s) e `git diff --check` (WU-14), com estado `OBSERVED`. A WU-09 (`test:ia-loop`) não se aplica, porque o repositório não tem esse script, e o IA Loop marcou as unidades seguintes como observadas por isso. Na rodada 2, as mesmas cinco unidades também saíram com exit 0.
- **Contagens do Developer na árvore final (rodada 3):** suíte do frontend com 157 arquivos e 1954 testes, que é a contagem do fechamento do Goal113 (155 e 1917) mais os 2 arquivos novos com 37 testes (31 e 6); `test:gate` com 255 (249 mais os 6 testes novos de `visual-responses.test.mjs`, que foi de 16 para 22); `validate:core` com 15 passos passando e 2 pulados; `validate:ui` com 169 passando, sem retentativa; `validate:integration` com 36 de 36 passos e 275 testes no gate autenticado, 0 retentativas.
- **Conferência do Tech Lead, rodada 3, na worktree:**
  - **Código.** Em `ConversationThread.tsx` (linhas 547 a 566), o texto e o botão "alterar" são filhos diretos da nota. `goal114-chat.test.tsx` (linhas 588 a 590) exige `parentElement === note`. `npx vitest run tests/goal114` deu 37 de 37.
  - **Comparação visual.** `npm run visual:compare -- --target K1,K2,K3,K4,Conversas:C1,C4` contra a pilha descartável em 3012: 24 capturas, exit 0, números idênticos aos do Developer. K4 0,0 / 0,0 / 0,5 / 0,5; K1 a K3 iguais aos da rodada 2 (K1 0,5 / 2,8 / 0,4 / 0,5; K2 2,1 / 0,9 / 2,0 / 1,0; K3 6,2 / 2,7 / 2,9 / 2,4); C1 1,5 / 0,4 / 0,2 / 0,3 e C4 1,0 / 0,1 / 0,7 / 0,3, iguais à baseline do Goal113 (mobile, tablet retrato, tablet paisagem, desktop). Antes do Goal, K1 a K4 davam de 3,6% a 10,2%.
  - **Capturas.** Os 16 `side-by-side.png` de K1 a K4 foram abertos nas rodadas 2 e 3. A nota do K4 bate com o quadro nos quatro devices. O vermelho que resta na paisagem e no desktop está na coluna da lista (divergências de D-127) e na casca.
  - **Escopo.** Os 25 arquivos estão dentro do critério 7.
  - **Registros.** VALIDATION_GATE traz os controles (a), (b) e (c) refeitos depois da última edição, com comando, teste que reprovou, mensagem e `cmp`. A linha de `validate:integration` diz `PASSED`, 36 de 36, 275 testes e 0 retentativas, e a frase "não concluído" saiu de CURRENT_STATE e de D-128.

## Divergências aceitas

As sete do Goal: barra de status e indicador do iPhone; nome do negócio e a casca; a linha "Você editou o agendamento de hoje, 15:00 · + Hidratação" (K3), sem dado no contrato; a sugestão aberta (K2 e K3), que na captura é o botão "Sugerir resposta"; o conteúdo da imagem (K2), que na captura é o quadro listrado antes de carregar; as divergências de D-127 na coluna da lista; e os dias da semana calculados. Também estas, declaradas em D-128 e aceitas pelo Tech Lead na rodada 2:

1. **Inconsistências do próprio protótipo**, em que o app segue uma regra só: (a) só o K1 ancora as mensagens embaixo, e o app começa em cima e rola até o fim, o que muda só o K1 no tablet em retrato; (b) K2 e K4 mostram a pílula "Hoje" e o K3 não, e o app a mostra nos três. Por isso o histórico do K3 fica 32 px mais baixo, e o K3 mobile tem o maior número (6,2%).
2. **O dia da semana dos eventos do K1:** `sáb`, calculado da data fixa `2026-09-19`, contra `sex` no quadro.
3. **Ajustes de medida:** o cabeçalho do celular sobe 2 px (`margin-top: -2px`); o placeholder de duas linhas do K2 ganha 2 px de `padding`; a nota do K4 fica sem margem.
4. **Na coluna da lista:** o contador da Comercial fora da aba Comercial no K4, o dia da semana de Renata, a prévia da última mensagem da Mãe (vem do alvo) e o foco programático de `main` (D-127).

## Mudanças de comportamento aceitas

O porte trouxe três mudanças além do desenho. O Tech Lead as aceitou na rodada 2, porque o quadro ou o vault as pede:

1. **Imagem recebida é espera, não instabilidade** (D-128 (6)). `conversationState` deixou de tratar `image_received` como marcador de instabilidade, e a pílula da lista para esse motivo diz só "Aguardando você". O vault diz que imagem recebida gera handoff no MVP, e o K2 mostra a conversa aguardando você.
2. **"Sugerir resposta" aparece também aguardando você** (K2; D-128 (9)). A IA já aceita sugestão com `humanHandoff`. Em `goal017-suggestions`, o teste "some quando aguardando você" virou "aparece quando aguardando você (K2)". É a única asserção invertida, e ela continua provando que nada é pedido ao abrir.
3. **O erro ao abrir a conversa ganhou "Tentar novamente"**, como o §1.9 do Goal pede.

## Aceito sem prova completa

1. **Os três controles negativos** (a), (b) e (c) do §5.2 vêm da execução do Developer na rodada 3, com as mensagens registradas e `cmp` depois de cada reversão. O Tech Lead não os refez.
2. **A execução de controle do §3.3** (W1, I1 e `Conversas:C1` iguais à baseline do Goal113 nos 12 pares) e as capturas de antes vêm do Developer, que trocou temporariamente os arquivos de `apps/frontend/src/` pelas versões de `HEAD`. O Tech Lead não as refez.
3. **A comparação de C1 e C4 por pixel** contra a captura de antes (0 pixel diferente nos 8 pares) vem do Developer. O Tech Lead conferiu só que os percentuais são os da baseline do Goal113.
4. **`test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`** foram aceitos pelo exit 0 na árvore final. O estado formal do IA Loop para eles é `OBSERVED`, e não `PASSED`, porque a WU-09 não se aplica a este repositório.
5. **`validate:integration`** rodou num cluster PostgreSQL 18 criado com `initdb` no scratchpad do Developer, em `127.0.0.1:55814`.

## Observações registradas, sem mudar a decisão

1. **O BFF de desenvolvimento em `localhost:3002` respondia 500 no login da conta visual.** Na rodada 1 isso derrubou a WU-01. A partir da rodada 2, o Developer subiu uma pilha própria (BFF em 3012, Scheduling em 3013 e IA em 3010, código da worktree, bancos descartáveis `g114_bff`, `g114_sched` e `g114_ai`, com `prisma migrate deploy`) e chamou o script com `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN`. O banco de desenvolvimento do operador não foi migrado nem semeado.
2. **`test:gate` exige o cliente Prisma gerado em `apps/ai-orchestrator`.** Sem `npx prisma generate` ali, `goal029-goal030-rehearsal-guards.test.mjs` reprova com "The generated Prisma client of apps/ai-orchestrator is missing".
3. **A guarda dos testes de integração recusa o PostgreSQL do Docker** ("Connected server port 5432 is not the declared test port."), porque a porta interna não é a declarada. Por isso a execução que vale usou o cluster `initdb`.
4. **O perfil do Developer na rodada 1.** O pacote de review da rodada 1 registra o perfil `SONNET_HIGH`, e o Goal declarava `OPUS_MEDIUM`. A rodada 2 rodou com `OPUS_MEDIUM` e a rodada 3 com `SONNET_MEDIUM`, conforme o review da rodada 2.
5. **O item 7 da evidência do Goal** diz "oito arquivos de teste" e lista nove. Os ajustes tocaram oito arquivos, e não exatamente os listados: `goal017-chat-media`, `goal017-delivery-state`, `goal070-conversation-events` e `goal077-message-authorship` não mudaram; `goal017-inbox-tabs`, `goal017-reachability` e `goal017-shell-invariant`, fora da lista, mudaram.
6. **O motivo da espera, fora do caso da imagem, entra no fim da timeline**, porque o contrato não traz o instante do handoff (D-128 (5)).

## O que o aceite não prova

- O K5 (cliente no contexto, com o controle de três posições) e o K6 (menu "•••"). O contexto e o menu continuam com o desenho de antes; o menu só ganhou os itens.
- A linha "Você editou o agendamento" do K3, a sugestão aberta e o conteúdo da imagem na captura: são provados só por jsdom, ou não têm fonte.
- Um aparelho real: a prova é por jsdom e pelas capturas do `visual:compare` nos quatro devices.
- O chat com dados reais da conta de teste: os quadros K1 a K4 são alcançados por respostas fixas, e o gate autenticado prova o chat real só por `.message-timeline`, a mensagem recebida, as três linhas de evento e o link "Ver".
