# Goal 126 — A central de notificações vazia igual ao protótipo

**Status: READY.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal125 ACCEPTED](../reviews/125-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_MEDIUM

Quadros do protótipo: NT2

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v150**, inserida depois do 125, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 125. Com o AG2 aceito, `targets.json` tem 83 alvos, e 30 dos 113 quadros continuam sem alvo. O NT2 é o único deles que é estado de uma tela que já existe, que a captura alcança só com respostas fixas de `GET` e que não pede contrato, BFF nem decisão de produto nova.

## Baseline aceita

Baseline aceita: `c53be398a35ed10a6a402035067f585b9e04c5e3`

Goal anterior: 125 — Lembretes igual ao protótipo, com a prévia da mensagem que a cliente recebe e a data em português

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal125 já integrado em `main` (origem `713ea1b8f019f89161b40e14930241112e6f0e38`). Foram **duas rodadas**: a rodada 1 teve 3 blockers (o rodapé fixo do "Salvar" no tablet e no desktop, as `notes` do AG2 e o VALIDATION_GATE), resolvidos pela FIX-001; a rodada 2 terminou `ACCEPTED` sem blocker. **D-139** foi aceita: a tela de Lembretes como o AG2, a prévia com o texto real e a data em português na mensagem. A última contagem aceita: frontend **173** arquivos e **2258** testes, `goal125` **48** (2 arquivos), `visual-responses.test.mjs` **52**, `test:gate` **285**, `validate:core` 17 passos com 15 passando e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, sem retentativa, `validate:integration` **36** de 36 passos, com o gate autenticado em **280** e 0 retentativas. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a central de notificações sem nenhuma notificação fica igual ao quadro NT2 nos quatro devices**, salvo as divergências declaradas: a tela empurrada no mobile e no tablet em retrato e a gaveta sobre a Home no tablet em paisagem e no desktop. A pílula "IA ativa · tudo em ordem" só aparece quando o status confirma a IA e o WhatsApp ativos. Nenhum pedido ao BFF muda.

**Por que agora.** A fila não tem Goal PLANNED. Dos 30 quadros sem alvo, os outros pedem outra decisão ou trabalho fora do frontend:

- S1b pede cor livre fora de `colorToken`; S5, S6, S8 e S9, a composição de D-114 e a guarda de navegação;
- CL8 é outra tela (o perfil com responsável); CL9 é o carregamento, que a captura não fotografa porque espera `networkidle`;
- H6 e NT3 pedem o sinal de IA instável, que o status não tem;
- N2 pede formas de pagamento que `settingsStateSchema` não tem; N3, o vínculo da pergunta a um serviço; W3, a leitura dos contatos ignorados;
- 2.7, 2.I2 a 2.I10, 4.3 a 4.5 e 4.7 a 4.10 são etapas e estados do onboarding que a conta de onboarding do `visual:compare` não alcança ou que o fluxo do app não tem.

O NT2 é o estado vazio da central que o NT1 já portou (D-115). A tela de hoje mostra um painel genérico "Tudo em dia", que não é o do quadro.

## O que a evidência desta passada mostra

Conferido no código da baseline `c53be39` e em `docs/design-reference/claude-design/prototype/project/Notificacoes.dc.html` (quadro NT2, "Notificações · vazio"), com `Notificacoes-Tablet.dc.html` (retrato e paisagem) e `Notificacoes-Desktop.dc.html`.

1. **NT2 no mobile.** Tela empurrada: o cabeçalho com "‹" de 40 px, "Notificações" em 16 px 600 centrado e um espaçador de 40 px. O corpo ocupa a altura restante (`flex: 1`), centrado nos dois eixos, com `gap: 18px` e `padding: 0 44px 60px`, texto centrado:
   - o anel de 88 px: um círculo absoluto com borda de 1,5 px `#0F5F63`, `opacity: .6` e `animation: at-breathe 2.4s ease-out infinite`, e dentro dele o círculo de 64 px com fundo `#FFFDFA`, borda de 1 px `#E5DED4` e o sino de 28 px em `#0F5F63` (traço 1,75);
   - "Nada por aqui" em 17 px 600, `line-height: 1.3`, e abaixo, com 8 px entre os dois, "Avisamos quando algo precisar de você: uma cliente aguardando, o WhatsApp desconectado ou um serviço que impede a IA de marcar." em 14 px, `line-height: 1.45`, `#5F574E`, `text-wrap: pretty`;
   - a pílula de 30 px, raio 999 px, `padding: 0 12px`, fundo `#DCECEB`, texto `#0B4A4E` em 12 px 600, com o ponto de 6 px `#0F5F63` e 8 px de espaço: "IA ativa · tudo em ordem".

   A legenda do quadro: "Vazio é boa notícia: o sino descansa dentro do anel que respira e a pílula confirma que a IA está trabalhando."
2. **NT2 no tablet e no desktop.** O tablet em retrato repete a tela empurrada. O tablet em paisagem e o desktop mostram a gaveta sobre a Home, como o NT1, com o mesmo bloco vazio dentro dela.
3. **O app hoje.** `features/notifications/NotificationsScreen.tsx`: `NotificationHistory`, compartilhado pela página e pela gaveta (`NotificationsDrawerContent`), mostra, com a lista vazia, `StatePanel` com o ícone `check`, "Tudo em dia" e "Nada exige sua atenção agora.". "Marcar lidas" já some sem não lida. Na página, `NotificationPreferenceSection` vem abaixo da lista; na gaveta, o rodapé "Preferências de notificação" (D-093, D-115 divergência 5). A leitura é `GET /v1/notifications` (`limit: 20`, `offset: 0`), sem filtro.
4. **O status já está na árvore.** `AppShell` monta o único `SystemStatusProvider`, e `useSystemStatus()` dá `aiView` e `whatsappView` (`active`, `loading`, `off`, `pending` ou `unknown`) e `notificationsSummary`. O sino da Home lê `notificationsSummary.unreadCount`.
5. **O texto do quadro promete um aviso que não existe.** As espécies de notificação são as de `KIND_TITLES` em `notificationViews.ts`: cliente aguardando, lembrete não enviado, importação concluída, agendamento criado pela IA, WhatsApp desconectado, IA indisponível, configuração incompleta e IA ativa. Não há aviso de "um serviço que impede a IA de marcar": o serviço sem duração aparece nas pendências da Home, lidas de `GET /v1/services`, não na central. `SETUP_INCOMPLETE` só cobre "nenhum serviço ativo" durante a configuração.
6. **A animação já existe.** `@keyframes at-breathe` está em `shared/styles/avenly.css`, com regra de `prefers-reduced-motion` no mesmo arquivo; `avenly-conversations.css` e `avenly-settings.css` já a usam.
7. **Captura.** O NT1 em `targets.json` abre `/inicio` com `clock` `"10:30"` e dois passos `clickRole` opcionais sobre o sino ("Notificações", `button` e `link`). Nenhum alvo de `Notificacoes.dc.html` declara `responses`. A conta visual tem duas notificações (D-115, divergência 3), o WhatsApp desconectado e a IA desligada, por isso hoje a captura não alcança o vazio. `scripts/lib/visual-responses.mjs` casa a resposta fixa pelo método e pelo caminho exato, sem a query, e `scripts/tests/visual-responses.test.mjs` fixa a lista de alvos que declaram `responses` e o arquivo dono de cada um.
8. **Testes existentes que afirmam o que muda:** `tests/goal022-notifications-screen.test.tsx` afirma "Nada exige sua atenção agora.". `goal077-notifications-center`, `goal077-notifications-drawer` e `goal096-conversas-e-notificacoes` montam a central e a gaveta.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do bloco vazio do quadro (valores inline de px, cor, fonte, raio, espaçamento e a animação), em cada device: `Notificacoes.dc.html` no mobile, `Notificacoes-Tablet.dc.html` em retrato e paisagem e `Notificacoes-Desktop.dc.html` no desktop. A tela empurrada, a `PushedBar`, a gaveta (`Dialog` `variant="drawer"`), as linhas do NT1 e "Marcar lidas" não mudam. O CSS novo fica em `shared/styles/avenly-notifications.css` e reusa `@keyframes at-breathe`, sem declarar outra.
2. **O vazio é o mesmo na página e na gaveta.** `NotificationHistory` troca o `StatePanel` "Tudo em dia" por um componente próprio do NT2, usado pelos dois. O anel, o círculo e o sino são `aria-hidden`. "Nada por aqui" fica com o mesmo nível de cabeçalho que o título do `StatePanel` tinha. Na página, o bloco ocupa a altura que sobra acima de `NotificationPreferenceSection`, centrado, sem empurrar a preferência para fora do fluxo.
3. **O texto do quadro, com o terceiro exemplo honesto.** "Nada por aqui" e "Avisamos quando algo precisar de você: uma cliente aguardando, o WhatsApp desconectado ou um lembrete que não foi enviado." O quadro diz "um serviço que impede a IA de marcar", e a central não manda esse aviso (evidência 5); o terceiro exemplo passa a ser uma espécie que existe (`REMINDER_FAILED`). É divergência declarada.
4. **A pílula diz a verdade.** "IA ativa · tudo em ordem" aparece **só** com `aiView === "active"` **e** `whatsappView === "active"`, lidos de `useSystemStatus()`. Em qualquer outro estado (`loading`, `off`, `pending`, `unknown`, ou o status com erro), a pílula não aparece e o resto do bloco continua. Nenhuma leitura nova: o status vem do `SystemStatusProvider` que já existe, sem segundo poller. A pílula é texto, sem papel interativo; o ponto é `aria-hidden`.
5. **Movimento.** O anel respira como o quadro. Com `prefers-reduced-motion: reduce`, o anel fica parado e visível, sem animação.
6. **Alvo.** `targets.json` ganha o NT2, de `Notificacoes.dc.html`, com sessão:
   - rota `/inicio`, `clock` `"10:30"` e os mesmos dois passos opcionais do NT1 sobre o sino;
   - `responses` só de `GET`: `/v1/notifications` com `items: []`, `total: 0`, `limit: 20` e `offset: 0`; `/v1/notifications/summary` com tudo zero; `/v1/status` com o WhatsApp `CONNECTED` e a IA `ACTIVE` (o mesmo formato do H1, com `phoneNumber` e `checkedAt` válidos), para a pílula aparecer e a casca não mostrar o aviso de atendimento parado;
   - nenhum passo toca botão que grava;
   - as `notes` citam as divergências declaradas.

   O NT1 não muda: continua sem `responses`, com a lista da conta visual.
7. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar o NT2 na lista de alvos que declaram `responses`, com `Notificacoes.dc.html` como arquivo dono, e ganha um teste: o NT2 é o único dono de `responses` em `Notificacoes.dc.html`, só com os três `GET` acima, a lista vazia, o status com a IA e o WhatsApp ativos, e só os passos sobre o sino.
8. **Gate autenticado.** `/notificacoes` já está em `AUTHENTICATED_ROUTES`. `apps/frontend/e2e/` não muda, salvo `targets.json`.
9. **Divergências declaradas.**
   - O terceiro exemplo do texto (escolha 3).
   - A seção de preferência abaixo do bloco em `/notificacoes` e o link "Preferências de notificação" no rodapé da gaveta (D-093, D-115).
   - No tablet em paisagem e no desktop, a Home atrás da gaveta é a da conta visual, com o WhatsApp e a IA ativos pela resposta fixa (como D-115, divergência 6).
   - A barra de status e o indicador de início do iPhone nos quadros mobile.

   O Developer registra outras que encontrar nas `notes` do alvo e em D-140, com o motivo.
10. **Decisão.** O Developer propõe **D-140**, por acréscimo, depois das provas. D-140 cobre o vazio do NT2 na página e na gaveta, o terceiro exemplo do texto, a regra da pílula, o movimento, o alvo e as divergências. Revê D-115 só no estado vazio da central, e nada mais.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/notifications/NotificationsScreen.tsx`: o bloco vazio do NT2 em `NotificationHistory` (escolhas 2 a 4).
2. `shared/styles/avenly-notifications.css`: o CSS do bloco, nos quatro devices, com a regra de movimento reduzido (escolha 5).

`notificationViews.ts`, `NotificationsDrawer.tsx`, `NotificationPreferenceSection.tsx`, `systemStatus.tsx`, `AppShell.tsx`, a Home e o contrato não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o NT2 (escolha 6).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 7.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal126-*.test.tsx`:
   - a página e a gaveta com a lista vazia: "Nada por aqui", o texto da escolha 3, nenhum "Tudo em dia", nenhum "Marcar lidas", e a preferência ainda na página e o link no rodapé da gaveta;
   - a pílula: presente com a IA e o WhatsApp `active`; ausente com cada um dos outros estados de cada lado (`loading`, `off`, `pending`, `unknown`) e com o status em erro;
   - com uma notificação, nada do NT2 aparece e a lista é a de hoje;
   - o anel, o círculo e o sino com `aria-hidden`, e nenhuma leitura nova de status (o mesmo número de chamadas a `status.get` antes e depois).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 7.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a pílula aparecendo com o WhatsApp `off` faz um teste reprovar;
   - (b) a pílula aparecendo com a IA `pending` faz um teste reprovar;
   - (c) o vazio voltando ao `StatePanel` "Tudo em dia" faz um teste reprovar;
   - (d) o NT2 de `targets.json` com uma notificação em `items` faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. O ajuste em `goal022-notifications-screen.test.tsx` (e em outro arquivo da evidência 8, se preciso) só troca o texto do vazio; nenhum ajuste afrouxa asserção de comportamento das linhas, de "Marcar lidas", da gaveta ou da preferência. Cada ajuste é listado no relatório.
5. **Fidelidade visual.** `npm run visual:compare -- --target NT2` e, para regressão, `--target NT1,H1`, numa pilha descartável própria (banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 125). O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco; nenhuma espécie de notificação nova, nenhum texto de `notificationCopy` alterado.
- As linhas do NT1, os níveis, a gaveta, a preferência, o sino e a casca; o NT3 e o H6 (sinal de IA instável).
- O resto das lacunas visuais sem ID (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e as etapas do onboarding) e as observações abertas dos reviews 116 a 125, inclusive a ordem do serviço da prévia de Lembretes (observação 1 do review125).

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-140** em `PROPOSED`, conforme a escolha 10. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal126.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal126, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado;
  - os controles negativos e a rodada em que rodaram;
  - o `visual:compare` (alvos, percentuais e diferenças que restam);
  - a lista dos testes ajustados.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. A pilha descartável própria, antes de editar.
2. O bloco vazio, a pílula e o CSS, com os testes `goal126`.
3. O alvo NT2 e os testes da captura.
4. `visual:compare` do NT2, e de NT1 e H1 para regressão.
5. Controles negativos do §3.3, revertidos.
6. Execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A central vazia igual ao quadro NT2 nos 4 devices, salvo as divergências declaradas: o anel que respira com o sino, "Nada por aqui", o texto e a pílula, centrados como no quadro, na tela empurrada e na gaveta. Provado em jsdom e pelo `visual:compare`.
2. A pílula "IA ativa · tudo em ordem" aparece só com a IA e o WhatsApp `active`, e em nenhum outro estado. Nenhuma leitura de status nova.
3. Com notificação na lista, a central é a de hoje. "Marcar lidas", as linhas, a gaveta, a preferência e o sino não mudam. NT1 e H1 iguais à captura de antes.
4. Nenhum pedido ao BFF muda, e nenhum passo de captura toca botão que grava; o teste da captura prova que o NT2 só declara os três `GET`.
5. Os quatro controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
6. No gate autenticado de `validate:integration`, `/notificacoes` passa nas cinco larguras (360, 390, 768, 1024 e 1440): sem overflow horizontal, alvo de toque de 24 px no mínimo, contraste (inclusive `#5F574E` sobre `#F7F4EF` e `#0B4A4E` sobre `#DCECEB`), foco visível e `prefers-reduced-motion`. `validate:ui`, `validate:core` e `test:gate` passam.
7. Nenhum arquivo mudou fora de `apps/frontend/src/features/notifications/NotificationsScreen.tsx`, `apps/frontend/src/shared/styles/avenly-notifications.css`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação".
8. D-140 proposta, conforme a escolha 10.

## Plano de execução

1. **WU-01 — O vazio do NT2.** O bloco na página e na gaveta, a pílula, o CSS, os testes `goal126` e o ajuste de `goal022`.
2. **WU-02 — Captura, fidelidade, provas e registros.** O alvo NT2 e os testes da captura, o `visual:compare`, os controles negativos, D-140, CURRENT_STATE e VALIDATION_GATE.
3. Verificação determinística: typecheck, lint, testes alvo `goal126`, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
