# Review formal — Goal 117

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-05, conforme o [Goal117](../goals/117-a-home-igual-ao-prototipo-nas-pendencias-no-checklist-e-na-pausa-da-ia.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 4 terminou `CHANGES_REQUIRED` com 3 blockers só de registro; o IA Loop aceitou a rodada com os três adiados para a documentação de fechamento, onde foram aplicados (ver "Correções de registro aplicadas no fechamento").

A Home segue os quadros H2, H4, H5 e H7 do protótipo nos quatro devices. O cartão "Precisa da sua atenção" lista as conversas `ai-unstable`, as `waiting-you` e os serviços sem duração, com "Corrigir". Com pendências, "Hoje" mostra "· {n} restantes" e "Esta semana" sai. O checklist tem os rótulos do quadro, ação só no primeiro pendente e a faixa "IA inativa" diz o que falta. A faixa "IA pausada" diz "Desde {hora}." e tem "Reativar". "Pausar" abre a confirmação "Pausar sua IA?" na própria Home. Os traços de "Hoje" têm a cor do serviço. A hora da pausa é a coluna nova `AiSettings.pausedAt` no BFF, aditiva, anulável e sem backfill, exposta como `ai.pausedAt` opcional no contrato. Decisão: [D-131](../DECISIONS.md), aceita neste fechamento, com a exceção de prioridade do H4 (item 6) autorizada na rodada 1.

## Escopo e identidade do diff

- Baseline aceita vigente: `cf6704c28bdc7b015d9d16b5862c08f8a8faae5a` (Goal116). Base imediata da implementação: `95a6047c8e9c2dec766015f9d7080d9f8fc204c6` (preparação do Goal117), HEAD da worktree `.ai-worktrees/goal-117`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **24 arquivos** (20 rastreados e 4 novos não rastreados), hash do diff `c8f3462a5525c73c5ee689e06106ada88d9e5fc294902a19dc9614d5ca252e52`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/bff/` (7): `prisma/schema.prisma` e a migration `20261005000000_goal117_ai_settings_paused_at` (nova); `src/modules/settings/routes.ts`, `src/lib/ai-activation.ts` e `src/modules/account/service.ts` (a regra das escritas de `pausedAt`); `PUBLIC_API_V1.md`; `tests/goal117-ai-paused-at.integration.test.ts` e `tests/goal117-settings-contract.test.ts` (novos);
  - `packages/public-api-contract/src/schemas.ts` (`ai.pausedAt`);
  - `apps/frontend/` (10): `DashboardScreen.tsx`, `ConversationActionsSheet.tsx` (`ChatSheetShell` aceita `titleId`), `avenly.css`, `avenly-conversations.css`, `e2e/visual/targets.json` (alvos H2, H4, H5 e H7; H1 e H3 com `GET /v1/status` fixo), `tests/goal117-home.test.tsx` (novo) e os ajustes de `goal018-dashboard-status`, `goal063-home-checklist`, `goal074-home` e `goal087-shell-navigation`;
  - `scripts/tests/visual-responses.test.mjs` (exige os seis alvos da Home);
  - `docs/migration/` (4, por acréscimo): D-131 em `DECISIONS.md`, o delta em `CURRENT_STATE.md`, a seção 25 em `DATA_MIGRATION.md` e a seção do Goal117 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal. Nenhum arquivo de `e2e/` além de `targets.json` mudou, nem `scripts/` além do teste de `visual-responses`. O documento do Goal117 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 9 blockers.** O Developer rodou 14 Work Units. A WU-03 terminou `ESCALATION_REQUIRED`: no H4, `GET /v1/status` traz o WhatsApp `DISCONNECTED` para quem nunca conectou, e a faixa vermelha "WhatsApp desconectado" vencia "IA inativa". A WU-04 (controles e registros) não rodou, e os gates só foram observados sobre árvore incompleta. O Tech Lead leu o BFF e o contrato como corretos. O PostgreSQL 55717 da pilha travou com o erro 487 do Windows; o Tech Lead o encerrou com `taskkill` e o religou com `pg_ctl`, e depois rodou `visual:compare` de H2, H4, H5 e H7 com saída 0 e abriu as 16 capturas. Decisão deste review: a exceção de prioridade do H4 (D-131 (6)). Os blockers: (1) a faixa do H4; (2) "Esta semana" sobrando em H2 e H4; (3) os traços de "Hoje" sem a cor do serviço, com a mudança autorizada também em H1; (4) o atendimento falso "Cliente · Dentista" na fixture do H5 e o passo "Pausar" opcional no H7; (5) o teste de "· {n} restantes" e de "Hoje" sem pendências; (6) os três controles negativos; (7) D-131 e os registros; (8) a execução final e o `visual:compare` sobre a árvore final; (9) a explicação dos ajustes de `goal063`.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker.** A FIX-001 resolveu os nove: a exceção do H4 (`checklistWaitsWhatsapp`) com o caso contrário provado; "Esta semana" oculto com pendências ou checklist; o traço colorido por `serviceColorMap`/`appointmentServiceColors`, neutro com o catálogo falhado; a fixture do H5 sem "Dentista" e "Pausar" obrigatório no H7; os testes de "Hoje"; os três controles negativos; D-131 e os registros; e a execução final com 11 gates passando. H1 e H3 passaram a fixar `GET /v1/status` com a IA ligada e o WhatsApp desconectado, aceito como consequência da exceção. O Tech Lead rodou `visual:compare` de H2, H4, H5, H7, H1 e H3 contra o BFF da worktree em 3052, com saída 0. O blocker: "Ver agenda" saía com 13px em vez de 14px em todos os quadros e devices, porque `.dashboard-card-head a` vencia `.dashboard-link` (medido: 68–69 px de largura no quadro, 63–64 px no app). O review autorizou a correção também em H1 e H3.
3. **Rodada 3 — `CHANGES_REQUIRED`, 2 blockers.** A FIX-001 tirou `.dashboard-card-head a` de `avenly.css`. O Tech Lead subiu uma pilha descartável própria (BFF e Scheduling da worktree em 3002/3003, cluster 127.0.0.1:55718), rodou `visual:compare` de H2, H4, H5, H7, H1 e H3 com saída 0 e mediu em pixel: "Ver agenda" ficou com a largura do quadro. Os blockers: (1) no H4 em tablet retrato, a linha "Fazer o teste real", que quebra em duas linhas, tinha 49 px em vez de 65 px, por `min-height: 44px; margin: -10px 0` em `.checklist-link`; (2) o registro das rodadas 3 e 4 em D-131 e em VALIDATION_GATE, e a frase sobre o deslocamento do mobile.
4. **Rodada 4 — `ACCEPTED` pelo IA Loop, com 3 blockers só de registro adiados para o fechamento.** A FIX-001 trocou `.checklist-link` para `padding: 13px 0; margin: -13px 0` e atualizou a tabela visual em VALIDATION_GATE, mas não mudou `DECISIONS.md` nem corrigiu as duas frases que o blocker 2 da rodada 3 pedia. Os 11 gates passaram. O review terminou `CHANGES_REQUIRED` com `correctionScope: DOCUMENTATION_ONLY`.

O Developer rodou com o modo `WORK_UNITS`. Na rodada 1, 14 unidades deixaram resultado e a WU-04 não rodou. Nas rodadas 2 a 4, rodaram a FIX-001 e os 11 gates.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal117 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal117), em [DATA_MIGRATION](../DATA_MIGRATION.md) (seção 25) e em D-131.

- **Gates do IA Loop, rodada 4, todos com saída 0 na árvore final:** `typecheck` do BFF e do frontend (WU-05 e WU-06), `lint` do frontend (WU-07), testes alvo `goal117` do BFF (4 passaram, 9 pulados) e do frontend (25) (WU-08 e WU-09), suíte do frontend com 160 arquivos e 2038 testes (WU-10), `test:gate` (WU-11), `validate:core` (WU-12), `validate:ui` com 169 passando e 21 pulados (WU-13), `validate:integration` com 275 testes no gate autenticado (WU-14, 716 s) e `git diff --check` (WU-15).
- **Contagens do Developer (rodada 2, árvore completa):** frontend 160 arquivos e 2038 testes, com `goal117-home` em 25; BFF 170 passando e 370 pulados; testes alvo da Home 73; `visual-responses.test.mjs` 30 de 30; `test:gate` 263; `validate:core` com 15 passos passando e 2 pulados; `validate:ui` 169 passando e 21 pulados, sem retentativa; `validate:integration` 36 de 36 passos no cluster 55718, com BFF integração 540 testes e 275 no gate autenticado.
- **Controles negativos do Developer (rodada 2, depois da última edição de código daquela rodada):** (a) a pausa sem gravar `pausedAt` reprovou 3 de 9 em `goal117-ai-paused-at`; (b) a autoativação sem limpar `pausedAt` reprovou 1 de 9; (c) "Pausar" gravando no toque reprovou 5 de 25 em `goal117-home`. Cada mutação foi revertida e conferida com `sha256sum -c`. As rodadas 3 e 4 só mudaram CSS, que nenhum dos três controles cobre.
- **Conferência do Tech Lead, rodada 4:**
  - **Comparação visual.** `npm run visual:compare -- --target H2,H4,H5,H7`: 16 pares, saída 0, percentuais iguais aos do Developer. Os 16 `side-by-side.png` foram abertos.
  - **Checklist do H4, em pixel.** Em tablet retrato, as bordas das linhas ficam iguais no quadro e no app (y 279/328/377/436/501, cartão até 501). Em tablet paisagem e desktop, todas deslocadas 1 px, dentro da tolerância. No mobile, mesma altura e deslocamento uniforme de 17 px (borda da faixa em y 145 no quadro e 162 no app), que vem do respiro de topo da casca.
  - **Resto.** H2, H5 e H7 continuam iguais aos quadros, salvo as divergências declaradas.

## Correções de registro aplicadas no fechamento

Os três blockers da rodada 4 eram só de registro e foram aplicados em `docs/migration/` neste fechamento, sem nova rodada:

1. **DECISIONS, D-131.** Entrou o parágrafo "Correções depois da proposta", antes das divergências: a saída de `.dashboard-card-head a` na rodada 3, com "Ver agenda" em 14px/600 de H1 a H7, e a troca de `.checklist-link` para `padding: 13px 0; margin: -13px 0` na rodada 4, com a linha crescendo com o texto e o alvo de toque de 45 px.
2. **VALIDATION_GATE, seção do Goal117, primeiro parágrafo.** A frase "Nenhuma das duas refez a execução final nem os controles" foi trocada pelo relato certo: a rodada 3 não refez a execução final, a rodada 4 refez toda ela pelos gates do harness com saída 0, e os controles negativos continuam os da rodada 2. A tabela "Execução final" ganhou uma linha que a atribui à rodada 2.
3. **VALIDATION_GATE, "Conferência visual", e a primeira divergência de D-131.** O deslocamento de cerca de 16 px do mobile deixou de ser atribuído à barra de status, que o `visual:compare` já recorta, e passou ao respiro de topo da casca (o quadro usa `padding:66px`, 62 de barra mais 4).

## Divergências aceitas

As de D-131: a barra de status, o indicador de início do iPhone e o respiro de topo da casca no mobile; o nome e as iniciais do negócio e a casca (o cartão da IA da sidebar, "Notificações" e o selo de Conversas); a data por extenso, os dias de `{today}`, a saudação de `homeGreeting` e o `clock`; no H2, o motivo da conversa mais longo (declarada 4 do Goal) e a terceira linha de "Hoje"; no H5, o marcador "agora" e a ausência do compromisso pessoal "Dentista"; no H7, o fundo no estado do H1 e o anel no lugar do ponto. Também aceitos: a exceção de prioridade do H4 (D-131 (6)) e H1 e H3 com `GET /v1/status` fixo, sem o checklist antigo (D-131 (10)), mais o traço colorido e "Ver agenda" em 14px nos dois.

## Aceito sem prova completa

1. **Os três controles negativos** vêm da execução do Developer na rodada 2. O Tech Lead não os refez.
2. **As contagens da tabela "Execução final"** vêm do Developer, na rodada 2. Na rodada 4, os gates do IA Loop refizeram a execução, com saída 0.
3. **`validate:integration`** foi aceito pelo `PASSED` da WU-14 da rodada 4, sem reexecução pelo Tech Lead.
4. **K5, K6 e IA1** vêm só do `visual:compare` do Developer; o Tech Lead não os rodou em nenhuma rodada. H1 e H3 foram conferidos pelo Tech Lead nas rodadas 2 e 3.

## Observações registradas, sem mudar a decisão

1. **`GET /v1/status` não distingue "nunca conectou" de "desconectou".** A exceção de D-131 (6) depende do checklist estar na tela. É o primeiro gatilho do "Revisar se" de D-131.
2. **As pilhas descartáveis no Windows caem com o erro 487**, como no Goal116. Na rodada 1, o PostgreSQL 55717 só voltou com `taskkill` no postmaster e `pg_ctl start`, porque `pg_ctl stop` não o parou.
3. **O registro da rodada 4 ficou incompleto.** O blocker 2 da rodada 3 pediu três correções de documentação; a FIX-001 da rodada 4 não fez nenhuma das três. Elas foram aplicadas neste fechamento.

## O que o aceite não prova

- O H6 (IA com instabilidade): o protótipo não tem sinal para ele e ficou fora do escopo.
- Compromissos pessoais na Home: `GET /v1/dashboard` não os traz.
- Um aparelho real: a prova é por jsdom, pelo teste de integração do BFF contra PostgreSQL descartável e pelas capturas do `visual:compare` nos quatro devices.
