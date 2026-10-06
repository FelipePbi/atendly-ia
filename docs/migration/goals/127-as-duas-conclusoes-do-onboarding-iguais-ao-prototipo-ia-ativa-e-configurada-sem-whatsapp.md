# Goal 127 — As duas conclusões do onboarding iguais ao protótipo: IA ativa e configurada sem WhatsApp

**Status: ACCEPTED.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal126 ACCEPTED](../reviews/126-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 4.9, 4.10

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v151**, inserida depois do 126, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 126. Com o NT2 aceito, `targets.json` tem 84 alvos, e 29 dos 113 quadros continuam sem alvo. Esta passada conferiu no código as etapas do onboarding que as passadas anteriores tinham deixado num bloco só ("a conta de onboarding não alcança ou o fluxo do app não tem"). Os quadros 4.9 e 4.10 são telas que o app já tem, que a captura alcança e que não pedem contrato, BFF nem decisão de produto nova.

## Baseline aceita

Baseline aceita: `c53a0111e8e31f689ae51d5cce7f41692f6bc14a`

Goal anterior: 126 — A central de notificações vazia igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal126 já integrado em `main` (origem `f40d37689d8aad6bb7e883ec97e546cbfe66de0e`). Houve **uma rodada**: o review DEEP saiu `CHANGES_REQUIRED` com 1 blocker só de registro, e o IA Loop aceitou a rodada com a correção feita no fechamento, só em `docs/migration/`. **D-140** foi aceita: a central vazia como o NT2, na página e na gaveta, com a pílula "IA ativa · tudo em ordem" só quando o status confirma. A última contagem aceita:

- frontend **174** arquivos e **2273** testes, `goal126` **15**;
- `visual-responses.test.mjs` **54**;
- `test:gate` **287**;
- `validate:core` 17 passos, com 15 passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` **36** de 36 passos, com o gate autenticado em **280** e 0 retentativas.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **as duas telas que fecham o onboarding ficam iguais aos quadros 4.9 e 4.10 nos quatro devices**, salvo as divergências declaradas. A 4.9 é `/onboarding/teste-real-sucesso`, depois do teste real que termina bem. A 4.10 é `/onboarding/whatsapp-concluido`, para quem conclui sem WhatsApp. A tela de sucesso só afirma "IA ativa" quando o status confirma. Nenhum pedido ao BFF muda.

**Por que agora.** A fila não tem Goal PLANNED. Dos 29 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150:

- S1b pede cor livre fora de `colorToken`; S5, S6, S8 e S9, a composição de D-114 e a guarda de navegação;
- CL8 é outra tela; CL9 é o carregamento, que a captura não fotografa;
- H6 e NT3 pedem o sinal de IA instável, que o status não tem;
- N2, N3 e W3 pedem dado que o contrato não tem.

No onboarding, esta passada separou o bloco:

- **4.9 e 4.10** são rotas que já existem (`scenarios.ts`). A URL direta de uma etapa renderiza a etapa para a conta parada no meio do onboarding (comentário de `ONBOARDING_ROUTES` em `e2e/routes.ts`). A 4.10 é estática. A 4.9 lê `GET /v1/activation-test` e `GET /v1/status`, e `responses` vale também para alvo com `account: "onboarding"` (`scripts/visual-compare.mjs`, `captureApp`).
- **4.7 e 4.8** também são rotas que existem (`teste-real-progresso` e `teste-real-falha`), mas o quadro mostra o que o contrato não traz por marco: o nome e o preço do serviço, um sétimo passo "Limpando dados de teste" e a orientação por motivo da falha. Ficam para outra passada.
- **4.3, 4.4 e 4.5** dependem da conexão do WhatsApp e da lista de contatos ignorados, que não tem leitura (W3).
- **2.7 e 2.I2 a 2.I10** pedem horários por dia ou uma sessão de importação, que a conta de onboarding não tem.

As duas conclusões são as telas que fecham o fluxo. Hoje usam a moldura de etapa comum: o título no alto, a lista de pontos e a nota de limpeza na 4.9, o corpo vazio na 4.10. O quadro mostra uma comemoração centrada.

## O que a evidência desta passada mostra

Conferido no código da baseline `c53a011` e em `docs/design-reference/claude-design/prototype/project/Onboarding-3-IA-e-WhatsApp.dc.html` (quadros 4.9 "Tudo pronto · IA ativa" e 4.10 "Conclusão sem WhatsApp"), com `Onboarding-3-IA-e-WhatsApp-Tablet.dc.html` (retrato e paisagem) e `Onboarding-3-IA-e-WhatsApp-Desktop.dc.html`.

1. **4.9 no mobile.**
   - O topo tem o espaço de 40 px do chevron (vazio) e a barra de progresso com os quatro segmentos `#0F5F63`. Não há eyebrow nem "voltar".
   - O corpo ocupa a altura restante, centrado nos dois eixos, com `gap: 32px` e `padding: 0 20px`.
   - A arte é um quadrado de 160 px com dois anéis absolutos (borda de 2 px `#0F5F63`, `animation: at-breathe-lg 3s ease-out infinite`, o segundo com atraso de 1,5 s). Dentro fica o círculo de 96 px `#0F5F63` com `at-pop .6s`, e no centro dele o anel de 34 px com borda de 5 px `#F7F4EF`.
   - O texto fica centrado, com `gap: 12px` e `at-reveal .4s` com atraso de .4 s:
     - "Tudo pronto!" em Literata 32 px 500, `line-height: 1.15`, `letter-spacing: -0.015em`;
     - "Sua IA está ativa e pronta para atender seus clientes." em 16 px, `line-height: 1.45`, `#5F574E`, `max-width: 300px`;
     - a pílula de 32 px, raio 999 px, `padding: 0 14px`, fundo `#DCECEB`, texto `#0B4A4E` em 13 px 600 `tabular-nums`, `margin-top: 6px`, com o ponto de 7 px `#0F5F63` e 8 px de espaço: "IA ativa · +55 11 98765-4321".
   - O rodapé tem `padding: 12px 20px 46px` e `at-reveal` com atraso de .8 s. Nele fica "Ir para o início": 52 px, raio 14 px, fundo `#0F5F63`, 16 px 600.
   - A legenda: "O anel da marca, agora grande e respirando: a IA existe e está trabalhando. Sem confete, sem robô."
2. **4.10 no mobile.** A mesma composição, com estas diferenças:
   - a barra tem três segmentos `#0F5F63` e o quarto `#E5DED4`;
   - a arte é o círculo de 96 px `#FFFDFA` com borda de 1,5 px `#D6CEC2` e o anel de 34 px com borda de 5 px `#B9B1A6`, sem anéis que respiram, com o selo de 40 px `#2E7D4F` (borda de 3 px `#F7F4EF`, ✓ de 18 px `#FFFDFA`) em `right: 22px; bottom: 22px`;
   - o título é "Sua Avenly está configurada." e o texto, "Conecte seu WhatsApp quando quiser colocar a IA para atender seus clientes." (`max-width: 320px`);
   - a pílula tem fundo `#EFEAE2` e texto `#5F574E`, com o ponto vazado de 8 px (borda de 1,5 px `#716859`): "IA inativa até conectar";
   - o rodapé empilha "Ir para o início" (primário) **em cima** e "Conectar agora" (52 px, borda de 1 px `#D6CEC2`) embaixo, com 10 px entre os dois.
3. **Tablet e desktop.**
   - O tablet repete a coluna nas duas orientações.
   - O desktop tem a sidebar de 420 px com os quatro capítulos e a coluna centrada à direita, com o topo sem barra (`padding: 40px 20px 0`) e o rodapé com `padding: 12px 20px 32px`.
   - O Developer lê os valores de cada arquivo; não os deduz do mobile.
4. **As animações.** `@keyframes at-breathe-lg` e `@keyframes at-pop` estão no `<style>` dos arquivos do protótipo e não existem no app. `at-reveal` existe em `shared/styles/avenly-conversations.css`, e `at-breathe` em `shared/styles/avenly.css`, com regra de `prefers-reduced-motion` no mesmo arquivo.
5. **O app hoje.**
   - `features/onboarding/OnboardingShell.tsx` monta toda etapa com o topo (chevron, progresso, "Sair" abaixo de 1024 px, eyebrow), o cabeçalho `h1`/`p`, o corpo e o rodapé de ações (D-104).
   - Em `teste-real-sucesso`, o corpo é `ActivationTestSucceeded` (`features/activation-test/ActivationTestPanels.tsx`). Ele mostra dois pontos ("Sua IA conversou com o cliente de teste e marcou o horário." e o texto de `aiActiveCopy(view)`) e `ActivationTestCleanupNote`. O texto de baixo do título vem de `scenarios.ts`: "Sua IA conversou com o cliente de teste. Veja abaixo o estado real da ativação."
   - Em `whatsapp-concluido`, o corpo é `null`. As ações aparecem como "Conectar agora" (link para `/onboarding/whatsapp`) e depois "Ir para o início" (`finishWithoutWhatsapp`).
   - `chapterFraction` dá 1 para as duas telas (D-104).
6. **A regra de honestidade já existe.**
   - `useAiActiveStatus()` lê `GET /v1/status` uma vez e só guarda `ai.state`.
   - `aiActiveCopy(view)` só diz "Sua IA está ativa e pronta para atender seus clientes." com `view === "active"`; nos outros estados diz "sendo ativada", "Confirmando...", "ainda não foi ativada" ou "Não foi possível confirmar".
   - O sucesso do teste, sozinho, não prova a ativação (D-080).
   - `formatBrazilianPhone(value, "plus")` (`shared/phone.ts`) dá "+55 11 98765-4321".
7. **Dois consumidores.** `ActivationTestPanelBody` serve o onboarding e Configurações › IA (Goal063). O onboarding já tem corpo próprio na introdução (`ActivationTestOnboardingIntro`, quadro 4.6). Configurações não tem quadro de conclusão e não muda.
8. **Captura e gate.**
   - O alvo 4.6 de `targets.json` abre `/onboarding/teste-real` com `account: "onboarding"`, sem `responses`.
   - Hoje nenhum alvo de `Onboarding-3-IA-e-WhatsApp.dc.html` declara `responses`. `scripts/tests/visual-responses.test.mjs` fixa a lista de alvos que declaram `responses` e o arquivo dono de cada um.
   - `ONBOARDING_ROUTES` não tem `teste-real-sucesso` nem `whatsapp-concluido`. `tests/goal079-onboarding-gate-routes.test.ts` exige que todo `contentMarker` seja o título de uma etapa.
9. **Testes que afirmam o que muda.** `goal018-onboarding-reachability` e `goal018-a11y` montam `whatsapp-concluido`. `goal019-activation-test-screens` e `goal063-onboarding-activation` montam o sucesso. `goal089-onboarding-shell` e `goal090-onboarding-steps` afirmam a moldura e o progresso.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS das duas telas: os valores inline de px, cor, fonte, raio e espaçamento, e as animações. Usa cada arquivo para o seu device: `Onboarding-3-IA-e-WhatsApp.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop. As outras etapas do onboarding não mudam, nem no DOM, nem na captura.
2. **Uma moldura de conclusão.** `OnboardingShell` ganha uma variante de conclusão, usada **só** por `teste-real-sucesso` e `whatsapp-concluido`. Nela:
   - o topo é a mesma barra de progresso e o mesmo "Sair" das outras etapas, sem eyebrow e sem chevron;
   - o corpo centrado traz a arte (`aria-hidden`), o `h1`, o texto e a pílula;
   - o rodapé tem as ações, empilhadas em largura total no mobile;
   - a sidebar de 1024 px em diante continua a de D-104;
   - o `h1` continua o título da etapa em `scenarios.ts`, porque o gate e os testes o usam como marcador.
3. **4.9: a tela só afirma o que o status confirma.**
   - **Leitura.** O onboarding ganha um corpo de sucesso próprio, como `ActivationTestOnboardingIntro`, em `ActivationTestPanels.tsx`. `ActivationTestSucceeded` e Configurações › IA ficam como estão. A mesma leitura única de `GET /v1/status` que `useAiActiveStatus` faz passa a expor também o estado e o número do WhatsApp, sem segundo pedido. `GET /v1/activation-test` continua sendo lido uma vez, como hoje.
   - **Texto de baixo do título.** É `aiActiveCopy(view).text`: com a IA `ACTIVE`, é o texto do quadro; fora disso, o texto honesto do estado. A frase estática de `scenarios.ts` não aparece mais nesta tela.
   - **Pílula.** "IA ativa · <número>" aparece **só** com `view === "active"` **e** o WhatsApp `CONNECTED`, com o número formatado por `formatBrazilianPhone(phone, "plus")`. Com o número ausente ou não reconhecido, a pílula diz só "IA ativa". Em qualquer outro estado (carregando, status em erro, IA fora de `ACTIVE`, WhatsApp fora de `CONNECTED`), não há pílula.
   - **Arte.** Os dois anéis que respiram aparecem **só** com `view === "active"`. Fora disso, fica o círculo de 96 px parado, sem anéis.
   - **O que sai e o que fica.** O ponto "Sua IA conversou com o cliente de teste e marcou o horário." sai da conclusão do onboarding. `ActivationTestCleanupNote` continua abaixo da pílula, com as mesmas três regras (Goal019 §6: a tela diz o que ficou). Com a leitura do teste em erro, aparece o `ErrorNote` de hoje.
   - **Ação.** "Ir para o início" continua concluindo o onboarding como hoje.
4. **4.10: a conclusão sem WhatsApp como o quadro.**
   - A arte vazada com o selo ✓, o título e o texto de `scenarios.ts`, e a pílula "IA inativa até conectar", sempre: a tela só é alcançada sem WhatsApp, e o texto da etapa já diz o mesmo.
   - As ações ficam na ordem do quadro, no DOM e na tela: "Ir para o início" (primário, `finishWithoutWhatsapp`, como hoje) e depois "Conectar agora" (secundário, o mesmo link para `/onboarding/whatsapp`).
   - O capítulo WhatsApp não aparece como concluído: na barra, o quarto segmento fica vazio (`chapterFraction("whatsapp-concluido")` passa a 0); na sidebar, o WhatsApp não ganha ✓, conforme o quadro do desktop. `progressPercent` não muda. Isso revê D-104 só neste ponto.
5. **Movimento.** As animações do quadro (`at-breathe-lg`, `at-pop`, `at-reveal`) entram no CSS, com as `@keyframes` novas declaradas uma vez. Com `prefers-reduced-motion: reduce`, nada se move: os anéis ficam parados e visíveis, e o círculo, o texto e o rodapé aparecem já no lugar final.
6. **CSS.** As regras ficam em `shared/styles/avenly.css`, junto das do onboarding, escopadas pela variante de conclusão, sem alterar regra que outra etapa usa.
7. **Alvos.** `targets.json` ganha:
   - **4.9**, de `Onboarding-3-IA-e-WhatsApp.dc.html`, rota `/onboarding/teste-real-sucesso`, `account: "onboarding"`, com `responses` só de `GET`:
     - `/v1/activation-test` com uma execução `SUCCEEDED`, `terminal: true`, os seis marcos `reached`, `cleanupState: "CLEAN"` e todos os campos válidos para `activationTestRunSchema`;
     - `/v1/status` com o WhatsApp `CONNECTED`, `phoneNumber` `"5511987654321"`, e a IA `ACTIVE`, no mesmo formato do NT2;
     - nenhum passo, e nenhum toque em "Ir para o início";
     - as `notes` citam as divergências declaradas.
   - **4.10**, do mesmo arquivo, rota `/onboarding/whatsapp-concluido`, `account: "onboarding"`, sem `responses` e sem passo.

   Os outros alvos de onboarding não mudam.
8. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar o 4.9 na lista de alvos que declaram `responses`, com `Onboarding-3-IA-e-WhatsApp.dc.html` como arquivo dono. Ganha um teste que prova:
   - o 4.9 é o único dono de `responses` nesse arquivo;
   - ele só tem os dois `GET` acima, com a execução `SUCCEEDED` e o status com a IA `ACTIVE` e o WhatsApp `CONNECTED`;
   - ele não declara passo;
   - o 4.10 não declara `responses`.
9. **Gate autenticado.** `ONBOARDING_ROUTES` ganha `/onboarding/teste-real-sucesso` (marcador "Tudo pronto!") e `/onboarding/whatsapp-concluido` (marcador "Sua Avenly está configurada."), com o comentário de por que a conta parada as renderiza. Na conta real, a 4.9 aparece com o estado honesto da IA desligada, e é isso que o gate mede. `goal079-onboarding-gate-routes.test.ts` continua passando sem afrouxar asserção.
10. **Divergências declaradas.**
    - Na 4.9, a nota de limpeza abaixo da pílula ("O agendamento e o cliente de teste foram removidos do seu negócio." com `CLEAN`), que o quadro não tem (Goal019 §6).
    - O "Sair" do topo abaixo de 1024 px e do rodapé da sidebar (D-104), se o quadro não o mostrar.
    - A barra de status e o indicador de início do iPhone nos quadros mobile.

    O Developer registra outras que encontrar nas `notes` dos alvos e em D-141, com o motivo.
11. **Decisão.** O Developer propõe **D-141**, por acréscimo, depois das provas. D-141 cobre:
    - a moldura de conclusão e as duas telas;
    - a regra da pílula, do texto e dos anéis da 4.9;
    - a pílula fixa e a ordem das ações da 4.10;
    - o quarto segmento vazio na 4.10, que revê D-104 só nesse ponto;
    - o movimento, os alvos, as rotas do gate e as divergências.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/onboarding/OnboardingShell.tsx`: a variante de conclusão (escolha 2).
2. `features/onboarding/OnboardingScreen.tsx`: as duas etapas usando a variante, e a ordem das ações da 4.10 (escolhas 3 e 4).
3. `features/onboarding/blocks.ts`: `chapterFraction("whatsapp-concluido")` e o estado do capítulo WhatsApp na sidebar dessa etapa (escolha 4).
4. `features/onboarding/blocks/activation-test.tsx` e `blocks/whatsapp.tsx`, só no que for preciso para montar os corpos de conclusão.
5. `features/activation-test/ActivationTestPanels.tsx`: o corpo de sucesso do onboarding e a leitura única do status com o WhatsApp (escolha 3). `ActivationTestSucceeded`, `aiActiveCopy` e o que Configurações › IA mostra não mudam.
6. `shared/styles/avenly.css`: o CSS das duas telas nos quatro devices, com as `@keyframes` novas e a regra de movimento reduzido (escolhas 5 e 6).

`scenarios.ts`, `OnboardingRuntime.tsx`, as outras etapas, Configurações › IA, `systemStatus.tsx`, `shared/phone.ts` e o contrato não mudam.

### 2. A captura e o gate

1. `apps/frontend/e2e/visual/targets.json`: o 4.9 e o 4.10 (escolha 7).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 8.
3. `apps/frontend/e2e/routes.ts`: as duas rotas em `ONBOARDING_ROUTES` (escolha 9).

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal127-*.test.tsx`:
   - **4.9, com a IA `ACTIVE`, o WhatsApp `CONNECTED` e o número válido:** "Tudo pronto!", o texto do quadro, a pílula "IA ativa · +55 11 98765-4321", a arte `aria-hidden` com os anéis, "Ir para o início", nenhum eyebrow, nenhum chevron e nenhum "Sua IA conversou com o cliente de teste".
   - **4.9, pílula:** ausente com a IA `OFF`, `PENDING` e `UNKNOWN`, com o status ainda carregando, com o WhatsApp fora de `CONNECTED` e com o status em erro. Só "IA ativa" com o número ausente ou não reconhecido.
   - **4.9, texto e anéis:** o texto de `aiActiveCopy` em cada estado, e nenhum anel fora de `active`.
   - **4.9, leituras:** um só pedido a `status.get` e um só a `activationTest.get` na montagem.
   - **4.9, limpeza e erro:** a nota de limpeza com `CLEAN` e com `RESIDUAL`, e o `ErrorNote` com a leitura do teste em erro.
   - **Configurações › IA:** o painel de sucesso igual ao de hoje.
   - **4.10:** a arte, o título, o texto, a pílula "IA inativa até conectar", "Ir para o início" antes de "Conectar agora" no DOM, o link para `/onboarding/whatsapp`, e "Ir para o início" concluindo como hoje.
   - **Progresso:** o quarto segmento com preenchimento 0 em `whatsapp-concluido` e 1 em `teste-real-sucesso`.
   - **Moldura:** uma etapa comum (ex.: `whatsapp` e `teste-real`) sem a variante de conclusão, com o eyebrow e o cabeçalho de antes.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 8.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a pílula da 4.9 aparecendo com a IA `PENDING` faz um teste reprovar;
   - (b) a pílula da 4.9 aparecendo com o WhatsApp desconectado faz um teste reprovar;
   - (c) o texto de baixo do título fixo no texto de "ativa" faz um teste reprovar;
   - (d) a 4.10 com "Conectar agora" antes de "Ir para o início" faz um teste reprovar;
   - (e) o 4.9 de `targets.json` com a execução `FAILED` faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 9 só troca o texto, a ordem ou o preenchimento que este Goal muda. Nenhum ajuste afrouxa asserção sobre conclusão do onboarding, ativação da IA, teste real ou Configurações › IA. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 4.9,4.10` e, para regressão da moldura, `--target 0,2.6,4.1,4.6`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 126.
   - Antes de editar, o Developer guarda o `app.png` dos alvos de regressão. Depois, mostra que eles não mudaram, ou explica cada diferença.
   - O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco. Nenhuma regra de ativação nova: quem liga a IA continua sendo o teste que termina bem (D-080).
- As outras telas do teste real (4.6, 4.7 e 4.8), a pausa por interferência, a conexão do WhatsApp (4.2 a 4.5) e Configurações › IA.
- O resto das lacunas visuais sem ID (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3, 2.7, 2.I2 a 2.I10, 4.3 a 4.5, 4.7 e 4.8) e as observações abertas dos reviews 116 a 126.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-141** em `PROPOSED`, conforme a escolha 11. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal127.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal127, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado;
  - os controles negativos e a rodada em que rodaram;
  - o `visual:compare` (alvos, percentuais, regressão e diferenças que restam);
  - a lista dos testes ajustados.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Montar a pilha descartável própria e capturar a regressão de antes, sem editar nada.
2. Implementar a moldura de conclusão, a 4.9 e a 4.10, com os testes `goal127`.
3. Adicionar os alvos, os testes da captura e as rotas do gate.
4. Rodar o `visual:compare` de 4.9 e 4.10, e o de 0, 2.6, 4.1 e 4.6 para regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `/onboarding/teste-real-sucesso` igual ao quadro 4.9 nos 4 devices e `/onboarding/whatsapp-concluido` igual ao quadro 4.10 nos 4 devices, salvo as divergências declaradas: a arte, o título, o texto, a pílula e as ações, centrados como no quadro. Provado em jsdom e pelo `visual:compare`.
2. A 4.9 só diz "Sua IA está ativa e pronta para atender seus clientes.", só mostra a pílula "IA ativa" e só anima os anéis quando `GET /v1/status` confirma a IA `ACTIVE`. A pílula com o número só aparece com o WhatsApp `CONNECTED`. Uma leitura de status, nenhuma nova.
3. A 4.10 mostra "Ir para o início" antes de "Conectar agora", e as duas ações fazem o que faziam. O quarto segmento fica vazio.
4. As outras etapas do onboarding e Configurações › IA não mudam. 0, 2.6, 4.1 e 4.6 iguais à captura de antes, ou com cada diferença explicada.
5. Nenhum pedido ao BFF muda, e nenhum passo de captura toca botão que grava. O teste da captura prova que o 4.9 só declara os dois `GET`, e que o 4.10 não declara `responses`.
6. Os cinco controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/teste-real-sucesso` e `/onboarding/whatsapp-concluido` passam nas cinco larguras (360, 390, 768, 1024 e 1440). O gate mede:
   - overflow horizontal ausente;
   - alvo de toque de 24 px no mínimo;
   - contraste, inclusive `#5F574E` sobre `#F7F4EF`, `#0B4A4E` sobre `#DCECEB` e `#5F574E` sobre `#EFEAE2`;
   - foco visível;
   - `prefers-reduced-motion`.

   `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes:
   - os arquivos do §1;
   - `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `apps/frontend/e2e/routes.ts` e `scripts/tests/visual-responses.test.mjs`;
   - os três registros da seção "Documentação".
9. D-141 proposta, conforme a escolha 11.

## Plano de execução

1. **WU-01 — A moldura de conclusão e a 4.9.** A variante em `OnboardingShell`, o corpo de sucesso do onboarding com a leitura única do status, o CSS com as animações e o movimento reduzido, e os testes `goal127` da 4.9 e da moldura.
2. **WU-02 — A 4.10, o progresso e o gate.** A 4.10 na variante, a ordem das ações, o quarto segmento e a sidebar, as duas rotas em `ONBOARDING_ROUTES`, os testes `goal127` da 4.10 e do progresso, e os ajustes dos testes existentes.
3. **WU-03 — Captura, fidelidade, provas e registros.** Os alvos 4.9 e 4.10, os testes da captura, o `visual:compare` com a regressão, os controles negativos, D-141, CURRENT_STATE e VALIDATION_GATE.
4. **Verificação determinística:**
   - typecheck, lint, testes alvo `goal127`;
   - suíte do frontend, testes de ferramenta e `test:gate`;
   - `validate:core`, `validate:ui` e `validate:integration`;
   - `git diff --check`.
