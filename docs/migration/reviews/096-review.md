# Review formal — Goal 096

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal096](../goals/096-conversas-e-notificacoes-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

`/conversas` passa a mostrar o quadro C5 ("Conecte seu WhatsApp para ver suas conversas aqui.", com o link "Conectar WhatsApp" para `/configuracoes/whatsapp`) só quando o WhatsApp está `off` e a consulta `GET /v1/conversations` com `limit: 1` volta vazia; nos outros casos a tela com abas não muda. A central de notificações passa a seguir o NT1. Abaixo de 1024 px, `/notificacoes` é tela empurrada com "Notificações" como `h1`. A gaveta de D-093 abre a partir de 1024 px (`WIDE_LAYOUT_QUERY`), e não mais de 768 px. A linha mostra o nível pela forma, sem selos de texto, e o ponto da não lida é o controle "Marcar como lida". O C1, o contrato, o BFF, o Scheduling, a IA e a casca não mudaram. Decisão: [D-115](../DECISIONS.md), aceita neste fechamento; ela revê só a largura do item 4 de D-093.

## Escopo e identidade do diff

- Baseline aceita vigente: `7393eda88312a1f287031c4ee945729befd29323` (Goal095). Base imediata da implementação: `b96e8423cb8723ce0623f089616b0a0f0aa4e7dc`, HEAD da worktree `.ai-worktrees/goal-096`, sem commit na worktree. Entre as duas há só documentação (fechamento do Goal095 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **21 arquivos**, hash do diff `10c8a6ae7548cbcad7243a4ff65423ae2f4ee21806829eb558bc70afc1868e85`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção, todos em `apps/frontend/src/`: `features/conversations/ConversationInbox.tsx` (`sha256` `78f4b20f…`), `features/conversations/inboxLenses.ts` (`6b0a9eaf…`), `features/notifications/NotificationsDrawer.tsx` (`21a07628…`), `features/notifications/NotificationsScreen.tsx` (`bc6b9e1f…`), `features/dashboard/DashboardScreen.tsx` (`2a34d7d9…`, só o comentário do sino) e os estilos `shared/styles/atendly-conversations.css` e `shared/styles/atendly-notifications.css`. Os hashes são os conferidos pelo Tech Lead nas rodadas 1 a 3 e os que VALIDATION_GATE cita para os controles do §7.
  - E2E e visual: `apps/frontend/e2e/routes.ts`, só o `contentMarker` de `/notificacoes`; `apps/frontend/e2e/authenticated-matrix.spec.ts`, só o teste "inicio: the bell opens the notifications" (limite de 768 para 1024 px e o `h1` "Notificações"; o título do teste não mudou); `apps/frontend/e2e/visual/targets.json`, só a entrada do NT1 e a nota do C1.
  - Teste novo: `apps/frontend/tests/goal096-conversas-e-notificacoes.test.tsx` (**21** testes, cinco provas, `sha256` `4a08548b…`).
  - Testes ajustados, só onde dependiam do texto ou da estrutura que o quadro troca, nenhum removido nem pulado: `goal017-a11y`, `goal017-inbox-tabs`, `goal017-reachability`, `goal017-shell-invariant`, `goal022-notifications-screen`, `goal077-notifications-center` e `goal077-notifications-drawer`.
  - Documentos: `docs/migration/DECISIONS.md` (D-115 e a nota "Revista em parte" em D-093), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- Rota, contrato público, BFF, Scheduling, IA, `AppShell.tsx`, `PushedBar.tsx`, `ListDetail.tsx`, `useWideLayout.ts`, `ShellConfig.tsx`, `notificationViews.ts`, `apps/frontend/AGENTS.md` e as configurações de gate não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 1 blocker, de prova.** Código de produção e visual aceitos no mérito. O blocker: a prova 5 (uma chamada de `useShellConfig` por árvore) montava `/conversas` só com o status pendente e com as abas, e não com o ramo `NoWhatsappState`. Por isso o controle 6 do §7 reprovava na prova 1, e não na prova 5, como o §7 exige. O próprio Developer tinha declarado o desvio.
2. **Rodada 2 — `CHANGES_REQUIRED`, 2 blockers, de evidência e documento.** A prova 5 passou a montar o C5 nas faixas ≥1024 e <1024 (21/21, conferido). Faltaram os outros passos do blocker anterior: (1) o controle 6 e o vermelho da baseline não foram rodados de novo sobre o teste novo; (2) D-115, CURRENT_STATE e VALIDATION_GATE continuavam com `12 failed | 9 passed`, o controle 6 em `1 failed, 20 passed`, o hash antigo do teste (`653b4725…`) e as frases que diziam que a prova 5 não cobria o C5.
3. **Rodada 3 — `ACCEPTED`, 0 blockers.** Só documentos e controles; o código de produção é o da rodada 1, e o teste é o da rodada 2.

O perfil do Developer declarado no Goal é `SONNET_HIGH`. As rodadas 1 e 2 recomendaram `SONNET_MEDIUM` para a correção, que era só um caso de teste, controles e documentos.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal096 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal096) e na "Prova" de D-115.

- **Identidade do código aceito.** Na rodada 3, o patch da rodada 2 para a 3 difere só em CURRENT_STATE, DECISIONS e VALIDATION_GATE. Os hashes dos sete arquivos de produção, dos dois de `e2e/` e de `targets.json` batem com os documentados. `git status` tem 21 linhas, só de arquivos autorizados.
- **`visual:compare`.** O Tech Lead rodou `npm run visual:compare -- --target C5,NT1` nas rodadas 1 e 3 (exit 0), com os números do "Fim": C5 **2,6 / 0,6 / 0,5 / 0,8** e NT1 **10,4 / 4,4 / 49,2 / 60,2** (mobile / tablet em retrato / tablet em paisagem / desktop). O início do Developer foi C5 12,4 / 8,4 / 6,1 / 5,4 e NT1 11,3 / 5,8 / 59,2 / 68,8; H3, CL1, Servicos:S1 e N1 ficaram com diff idêntico ao do início. Na rodada 2 o compare não foi rodado de novo, porque produção, CSS e markup não mudaram. O Tech Lead abriu os oito `side-by-side.png` de C5 e NT1 nas rodadas 1 e 3:
  - C5: cabeçalho em Literata, arte tracejada com o telefone, título, texto e botão petróleo batem nos quatro devices. Sobram a barra e o indicador de início do iOS no mobile (divergência 1) e o cartão "WhatsApp desconectado" e o item "Notificações" na sidebar do desktop (divergência 2). O `h1` do mobile 16 px abaixo vem do `padding` de 66 px dos quadros mobile para a barra de status, que o `visual:compare` corta; o app usa 20 px, como os módulos já aceitos.
  - NT1 mobile e tablet em retrato: tela empurrada com voltar, "Notificações" e "Marcar lidas", sem barra de abas. Marcadores, riscado, verde do desfecho e pesos 600/500 conferem com o inline do quadro.
  - NT1 tablet em paisagem e desktop: a gaveta tem a largura e a posição do quadro, com grupos por dia e as mesmas linhas, sobre a Home da conta (divergência 6). O rodapé "Preferências de notificação" é a divergência 5.
  - O triângulo crítico `M12 4 21 20H3z` em `#B7791B` confere com o protótipo.
- **Código.** `useNoWhatsappProbe` consulta só com `off`, com `{ limit: 1 }`, e a falha da consulta mantém as abas. `InboxPending`, `NoWhatsappState` e `InboxWithTabs` são ramos exclusivos, cada um com uma chamada de `useShellConfig`. `whatsappInBand` e `attention` estão corretos. `NOTIFICATIONS_DRAWER_QUERY` é `WIDE_LAYOUT_QUERY`. O nome acessível do `<li>` não mudou, e "Marcar como lida" é um botão de 24 px.
- **Provas.** `goal096-conversas-e-notificacoes.test.tsx` passa **21**/**21**, conferido pelo Tech Lead nas rodadas 1, 2 e 3. Contra os sete arquivos de produção da baseline, medido na rodada 3, **14** reprovam e **7** passam (`14 failed | 7 passed (21)`); os 7 estão declarados em D-115, e os dois casos de `/conversas` da prova 5 reprovam, porque a baseline não tem o C5.
- **Controles negativos do §7**, rodados pelo Developer na rodada 3 sobre a árvore final, com a restauração conferida por `sha256`. Com o defeito: `2 failed, 19 passed`, `1 failed, 20 passed`, `1 failed, 20 passed`, `2 failed, 19 passed`, `2 failed, 19 passed` e `3 failed, 18 passed`. Sem o defeito, `21 passed (21)` nos seis. O controle 6 reprova na prova 1 e nos dois casos de `/conversas` da prova 5, com `expected 2 to be 1`. O Tech Lead conferiu que isso bate com o que a prova 5 afirma (`shell.live.size === 1` e `shell.maxLive === 1`), mas não reexecutou os controles.
- **Gates.** Na rodada 3, sobre a árvore aceita, todos os gates do IA Loop deram exit 0: typecheck, lint, `goal096` 21/21, `validate:core`, `test:gate` **233**, `validate:ui` **169** com 0 retentativas, `validate:integration` com o gate autenticado em **255** `passed` e 0 retentativas, e `git diff --check`. A rodada 1 teve os mesmos resultados sobre o mesmo código de produção. A suíte do frontend deu **143** arquivos e **1649** testes.
- **Gate autenticado.** `routes.ts` e `authenticated-matrix.spec.ts` mudaram só no que o §6 do Goal autoriza; o gate segue com 255 testes.

## Aceito sem prova completa

1. **O NT1 com notificação de atenção ou crítica** (a faixa âmbar, o grupo "Hoje", o negrito âmbar da não lida e o triângulo) está provado só em jsdom. A conta visual tem só uma notificação resolvida e uma não lida, e nenhuma captura mostra esses estados.
2. **A regra do C5 para um negócio que desconectou com histórico** (`off` com uma conversa mostra as abas) está provada só em jsdom.
3. **O NT1 de tablet em paisagem e desktop** foi aceito pela vista do `side-by-side.png`, não pelo número: o diff (49,2 e 60,2) mede sobretudo a Home atrás da gaveta.

## Observações registradas, sem mudar a decisão

1. **A frase "anel cortado" do Goal para o marcador crítico está errada.** O quadro NT1 desenha o triângulo, e o app também.
2. **"Marcar lidas" aparece sublinhado na captura da gaveta.** É o hover do ponteiro, que fica onde estava o sino depois do passo de `targets.json`.
3. **Na seção de preferência, fora do escopo, "Agendamento criado pela IA" cola em "Desligada por padrão".**
4. **Se o WhatsApp cair com as abas abertas, a inbox remonta** e perde a aba e a busca escolhidas.
5. **O aviso "Atendimento automático parado"** aparece no NT1 de mobile e retrato por causa do estado do ambiente do `visual:compare` (sem orquestrador da IA nem WhatsApp), e o relatório do compare o lista em "Diferenças esperadas".
6. **Na rodada 3, `apps/frontend/AGENTS.md`** foi reescrito pelo `next dev` durante o `visual:compare` do Tech Lead e voltou ao original no fim. A árvore final está limpa.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- O quadro C1 e os demais quadros de Conversas (C2 a C4, K1 a K6), NT2 e NT3, que ficam fora do escopo. A conta do `visual:compare` não tem conversa, e semear uma é trabalho de outro Goal.
- Que o ponto de "Marcar como lida" seja fácil de acertar com o dedo (D-115, "Revisar se" item 5).
