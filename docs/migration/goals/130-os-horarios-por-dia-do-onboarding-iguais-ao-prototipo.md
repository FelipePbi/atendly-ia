# Goal 130 — Os horários por dia do onboarding iguais ao protótipo

**Status: READY.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal129 ACCEPTED](../reviews/129-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.7, 2.6

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v154**, inserida depois do 129, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 129. Com 4.4 e 4.5 aceitos, `targets.json` tem 90 alvos, e 23 dos 113 quadros continuam sem alvo. O 2.6 entra na linha de quadros porque a sua captura muda neste Goal (escolha 5); o quadro novo é só o 2.7.

## Baseline aceita

Baseline aceita: `2130734f086f11fe1893bccd4d5a949f1940d241`

Goal anterior: 129 — O WhatsApp conectado e os contatos ignorados do onboarding iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal129 já integrado em `main` (origem `53a390720b50a9143345e2935b8f86b82a80a8d1`). Houve **quatro rodadas**: 4, 3 e 1 blockers nas rodadas 1 a 3, resolvidos pela FIX-001; o review da rodada 4 teve 1 blocker só de documentação, e o IA Loop aceitou a rodada com a correção feita no fechamento, só em `docs/migration/`. **D-143** foi aceita: o WhatsApp conectado e os contatos ignorados do onboarding como os quadros 4.4 e 4.5. A última contagem aceita:

- frontend **183** arquivos e **2431** testes, `goal129` **47** (3 arquivos);
- `visual-responses.test.mjs` **57**;
- `test:gate` **290**;
- `validate:core` com saída 0 e 2 passos pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` com saída 0, e o gate autenticado em **305** `passed`, sem retentativa.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **"Personalizar dias diferentes" leva à tela "Horários por dia", igual ao quadro 2.7 nos quatro devices**, salvo as divergências declaradas, e o horário-base fica igual ao quadro 2.6 na captura. A tela continua em `/onboarding/horarios`. Grava o que está na tela, como hoje, e só quando a pessoa toca "Salvar horários" (ou "Continuar" no horário-base). Nenhuma rota do BFF muda, e nenhum pedido novo.

**Por que agora.** A fila não tem Goal PLANNED. Dos 23 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 a v153: S1b (cor livre fora de `colorToken`); S5, S6, S8 e S9 (a composição de D-114 e a guarda de navegação); CL8 (outra tela); CL9 (carregamento, e `responses` não sabe atrasar uma resposta); H6 e NT3 (sinal de IA instável que o status não tem); N2, N3 e W3 (dado que o contrato não tem). A 4.3 continua fora (o código de vinculação só vem de `POST /v1/whatsapp/connect`). As passadas anteriores deixaram o 2.7 junto com a importação, como "pede horários por dia". Esta passada conferiu o 2.7 sozinho (evidências 1 a 4): o horário por dia já existe no app e no contrato, e a conta de onboarding do `visual:compare` **já tem** exatamente o horário do quadro. Falta só a tela. A importação (2.I2 a 2.I10) fica para as próximas passadas, com a evidência 6.

## O que a evidência desta passada mostra

Conferido no código da baseline `2130734` e em `docs/design-reference/claude-design/prototype/project/Onboarding-1-Negocio-e-Agenda.dc.html` (quadros 2.6 "Horário-base" e 2.7 "Personalizar por dia"), com `Onboarding-1-Negocio-e-Agenda-Tablet.dc.html` (retrato e paisagem) e `Onboarding-1-Negocio-e-Agenda-Desktop.dc.html`, que também têm o 2.7.

1. **2.7 no mobile.**
   - O topo: o chevron de voltar (40 px), a barra com o primeiro segmento `#0F5F63`, o segundo `#DCECEB` com 92 % preenchido e os outros dois `#E5DED4`, e o eyebrow "Sua agenda" (12 px 600, `letter-spacing: .08em`, maiúsculas, `#0F5F63`).
   - O corpo (`padding: 10px 20px 0`, 20 px de espaço entre os blocos). O cabeçalho (8 px de espaço): "Horários por dia" em Literata 28 px 500, `line-height: 1.2`, `letter-spacing: -0.01em`; e "Toque em um horário para ajustar só aquele dia." em 15 px, `line-height: 1.45`, `#5F574E`.
   - O cartão: raio 16 px, borda de 1 px `#E5DED4`, fundo `#FFFDFA`, `overflow: hidden`. Sete linhas, de segunda a domingo (`padding: 14px 16px`, 24 px de altura de conteúdo, divisória de 1 px `#E5DED4` a partir da segunda). Cada linha: o dia à esquerda (15 px 600) e o intervalo à direita ("09:00 – 18:00", 15 px, `tabular-nums`, `#5F574E`).
   - O dia alterado (Sábado, "09:00 – 14:00"): fundo `#EDF4F3`, intervalo em `#0B4A4E` 600 com o lápis de 16 px (8 px de espaço). O dia sem atendimento (Domingo): a linha em `#948B80`, com "Não atende" em 14 px.
   - Abaixo do cartão, centrado: "Copiar sábado para outros dias" (15 px 600 `#0F5F63`), com o ícone de copiar de 16 px (8 px de espaço).
   - O rodapé (`padding: 12px 20px 46px`): "Salvar horários" (primário, 52 px, raio 14 px, `#0F5F63`, texto `#F7F4EF` 16 px 600).
   - A legenda: "Opcional. O dia alterado ganha o tom da marca; “copiar para outros dias” evita repetir toques. Ao salvar, a agenda mínima está pronta e o bloco 3 começa."
2. **O app hoje.** `HoursStepBody` (`features/onboarding/blocks/schedule.tsx`) mostra o horário-base ("Começa" e "Termina", com a régua) e o cartão "Personalizar dias diferentes" (`aria-expanded`). Tocar o cartão abre, **na mesma tela**, abaixo dele, um par de campos de hora por dia marcado (`TimeRangeFields`, "Segunda · Início" e "Segunda · Fim"). Fechar o cartão volta todos os dias ao intervalo-base ("o que se grava é o que está na tela"). O painel abre sozinho quando a leitura traz algum dia diferente do intervalo-base (`useState(hasCustomHours)`). `draftFromState` (`OnboardingRuntime.tsx`) reconstrói o intervalo-base como o mais frequente e guarda em `dayHours` só os dias que diferem dele. "Continuar" (`persistScheduleStep("horarios")`) grava uma regra por dia marcado, com o intervalo daquele dia, e vai para `agenda-avenly-pronta`. Os dias não marcados não aparecem no painel. `TimeRangeFields` e `.hours-custom` só existem no onboarding.
3. **A conta de onboarding já tem o horário do quadro.** `scripts/lib/visual-seed.mjs` semeia a conta de onboarding com `AVAILABILITY`: segunda a sexta das 09:00 às 18:00 e sábado das 09:00 às 14:00, sem domingo. É exatamente o 2.7. Por isso, hoje, a captura do **2.6** mostra o painel aberto, com os campos de cada dia, enquanto o quadro o mostra recolhido: é a divergência 8 de D-105, aceita como "horários já marcados".
4. **A captura alcança as duas telas só com `GET`.**
   - O 2.7: a rota `/onboarding/horarios` na conta de onboarding, sem passos e sem `responses`. Com a tela por dia aberta quando a leitura traz um dia diferente do intervalo-base (como o painel abre hoje), a conta real mostra o quadro.
   - O 2.6: a mesma rota, com uma resposta fixa de `GET /v1/onboarding` (`BffOnboardingService`, `routeSchema("GET", "/v1/onboarding")`) igual ao estado da conta, mas com o mesmo intervalo de segunda a sábado. Hoje `Onboarding-1-Negocio-e-Agenda.dc.html` não tem dono de `responses`, e `scripts/tests/visual-responses.test.mjs` afirma a lista fechada dos alvos que declaram `responses`.
   - Os passos de captura aceitam `click`, `clickRole`, `fill`, `press` e `waitFor`, mas nenhum é preciso aqui.
5. **O gate autenticado.** `ONBOARDING_ROUTES` (`e2e/routes.ts`) mede `/onboarding/horarios` com o marcador "Qual é seu horário de atendimento?". A conta do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`) tem segunda a sexta das 09:00 às 18:00, sem dia diferente. Ela continua no horário-base, e o marcador não muda. O gate não alcança a tela por dia: a URL é a mesma, e a conta do gate não tem dia diferente.
6. **A importação, para as próximas passadas.** As leituras do fluxo de importação são todas `GET` (`GET /v1/calendar/imports`, `.../preview`, `.../categories/:category/items`, `.../progress`), e as telas de `features/imports/` decidem a fase pelo `status` da sessão. A captura pode alcançar a maior parte de 2.I2 a 2.I10 com `responses`, como o I1. São nove quadros sobre telas que `/importacao` também usa: pedem mais de um Goal, e D-119 diz que portar o 2.I2 ou as telas seguintes a revê. Fica registrado na v154; não entra aqui.
7. **Testes que citam o que muda.** `goal018-onboarding-reachability`, `goal065-onboarding-schedule`, `goal066-onboarding-sistema-atual`, `goal072-onboarding-schedule-fields`, `goal079-onboarding-gate-routes` e `goal090-onboarding-steps` citam "Personalizar dias diferentes", o painel por dia ou `/onboarding/horarios`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do 2.7: os valores inline de px, cor, fonte, raio e espaçamento. Usa cada arquivo para o seu device: `Onboarding-1-Negocio-e-Agenda.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop, lendo os valores de cada arquivo, sem deduzi-los do mobile. O horário-base (2.6) não muda de forma, e as outras etapas não mudam, nem no DOM, nem na captura.
2. **Uma tela por dia, na mesma etapa.**
   - Tocar "Personalizar dias diferentes" troca o corpo da etapa pela tela "Horários por dia", na mesma URL. Não nasce etapa nova em `scenarios.ts`, nem rota, nem passo na barra de progresso.
   - A tela por dia abre sozinha quando a leitura traz algum dia marcado diferente do intervalo-base, a mesma regra que hoje abre o painel.
   - O título passa a "Horários por dia" e o texto a "Toque em um horário para ajustar só aquele dia.", só nesta tela. O eyebrow continua "Sua agenda". O horário-base continua com o título e a descrição de hoje (`hoursStepDescription`).
   - O chevron do topo, na tela por dia, volta ao horário-base na mesma etapa, com a regra de hoje: todos os dias voltam ao intervalo-base (fechar o painel faz isso hoje). No horário-base, o chevron continua o de hoje. Se a moldura não deixar o chevron agir na etapa sem mudar outra etapa, o Developer adiciona a `OnboardingBack` uma forma com ação (por exemplo, `{ onClick }`), usada só aqui, e explica em D-144.
   - O foco vai para o título "Horários por dia" ao abrir a tela, e volta para "Personalizar dias diferentes" ao voltar.
3. **As linhas do cartão.**
   - Sete linhas, de segunda a domingo (`weekOrder`). Cada dia marcado mostra o seu intervalo ("09:00 – 18:00", com o travessão e espaços do quadro). Cada dia não marcado mostra "Não atende" e não é controle: os dias se escolhem em `dias-de-atendimento`.
   - O dia marcado com intervalo diferente do intervalo-base tem o tom do quadro: fundo `#EDF4F3`, intervalo em `#0B4A4E` 600 e o lápis. Os outros dias marcados ficam sem o tom.
   - **Ajustar um dia.** A linha de um dia marcado é um botão (nome acessível com o dia e o intervalo, `aria-expanded`). Tocar abre, dentro do cartão, logo abaixo da linha, os dois campos de hora de hoje daquele dia (`TimeRangeFields`, com os rótulos "<Dia> · Início" e "<Dia> · Fim"). Tocar a linha de novo, ou abrir outro dia, fecha. Um dia aberto por vez. A validação de "fim antes do início" continua no campo, como hoje.
   - A regra de `dayHours` não muda: igual ao intervalo-base não é personalização daquele campo (`setDayHour`).
4. **"Copiar <dia> para outros dias".**
   - Aparece só quando algum dia marcado difere do intervalo-base. O dia do texto é o último dia ajustado nesta tela; sem ajuste nesta tela (a tela aberta pela leitura), é o último dia diferente na ordem de `weekOrder`. O nome do dia vai em minúsculas ("Copiar sábado para outros dias").
   - Tocar dá a todos os dias marcados o intervalo daquele dia: o intervalo-base passa a ser esse, e `dayHours` fica vazio. Nada é gravado até "Salvar horários". Depois da cópia, nenhum dia difere, e o link some.
5. **O rodapé.** Na tela por dia, "Salvar horários" (primário) no lugar de "Continuar", com o mesmo efeito: `persistScheduleStep("horarios")`, que grava uma regra por dia marcado e vai para `agenda-avenly-pronta`. A validação inline de hoje roda antes. O rodapé usa a moldura de D-104, como o 2.6.
6. **CSS.** As regras ficam em `shared/styles/avenly.css`, junto das do onboarding, escopadas por `[data-step="horarios"]` ou por classes novas, sem alterar regra que outra etapa usa. O "Não atende" do Domingo usa `#716859` (5,41:1 sobre `#FFFDFA`) no lugar de `#948B80` (3,30:1, abaixo dos 4,5:1 de AA para texto de 14 px), o mesmo desvio do item 10 de D-105.
7. **Alvos.** `targets.json`, ambos de `Onboarding-1-Negocio-e-Agenda.dc.html`, com `account: "onboarding"` e nenhum passo:
   - **2.7, novo:** rota `/onboarding/horarios`, label "Horários por dia", sem `responses`. A conta de onboarding já tem o horário do quadro (evidência 3). As `notes` citam a semente (`AVAILABILITY` de `visual-seed.mjs`) e as divergências declaradas.
   - **2.6, alterado:** a mesma rota, com `responses` de `GET /v1/onboarding`: o estado da conta de onboarding com segunda a sábado das 09:00 às 18:00, válido para o schema da rota no contrato. Assim a captura mostra o horário-base recolhido, como o quadro, e a divergência 8 de D-105 cai. As `notes` dizem por quê.
   - Nenhum alvo toca "Personalizar dias diferentes", uma linha, "Copiar …", "Salvar horários" nem "Continuar".
8. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar o 2.6 como único dono de `responses` em `Onboarding-1-Negocio-e-Agenda.dc.html`, só com o `GET /v1/onboarding` e sem passos, e ganha o teste que prova que o 2.7 não declara `responses` nem passos. Um teste `goal130` valida a resposta do 2.6 contra o schema da rota no contrato público e confere que as regras dela têm o mesmo intervalo em todos os dias.
9. **Gate autenticado.** `ONBOARDING_ROUTES` não muda (evidência 5). `goal079-onboarding-gate-routes.test.ts` continua passando sem afrouxar asserção.
10. **Divergências declaradas.**
    - O preenchimento do segundo segmento da barra, derivado por `chapterFraction` (D-104): 92 % no quadro.
    - O "Não atende" do Domingo em `#716859`, pelo contraste (escolha 6).
    - O rodapé com o `padding` da moldura de D-104, se diferente dos 46 px de baixo do quadro mobile.
    - O "Sair" do topo abaixo de 1024 px e do rodapé da sidebar (D-104), que os quadros não mostram.
    - A barra de status e o indicador de início do iPhone nos quadros mobile.

    O Developer registra outras que encontrar nas `notes` dos alvos e em D-144, com o motivo.
11. **Decisão.** O Developer propõe **D-144**, por acréscimo, depois das provas, cobrindo a tela por dia na mesma etapa, a abertura pela leitura, o chevron que volta ao horário-base, o ajuste por linha, a cópia, "Salvar horários", os alvos 2.6 e 2.7, a queda da divergência 8 de D-105 e as divergências. D-105 não é editada.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/onboarding/blocks/schedule.tsx`: a tela por dia (escolhas 2 a 4), no lugar do painel por dia de hoje.
2. `features/onboarding/OnboardingScreen.tsx`: o título, o texto e o rodapé da tela por dia (escolhas 2 e 5).
3. `features/onboarding/blocks/shared.tsx`: só se o tipo `OnboardingStepBody` precisar levar o estado da tela por dia ao `OnboardingScreen`.
4. `features/onboarding/OnboardingShell.tsx`: só se for o caminho para o chevron agir na etapa (escolha 2), sem efeito em outra etapa.
5. `shared/styles/avenly.css`: o CSS da tela por dia nos quatro devices (escolha 6).

`OnboardingRuntime.tsx`, `scenarios.ts`, `blocks.ts`, as outras etapas, `features/settings/`, o contrato e o BFF não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o 2.7 novo e o 2.6 alterado (escolha 7).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 8.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal130-*.test.tsx` / `.test.ts`:
   - **Abrir e voltar:** "Personalizar dias diferentes" abre "Horários por dia" na mesma etapa, com o texto do quadro; a leitura com um dia diferente abre a tela por dia, e a leitura com o mesmo intervalo abre o horário-base; o chevron volta ao horário-base e devolve todos os dias ao intervalo-base; o foco nos dois sentidos.
   - **Linhas:** sete linhas na ordem de segunda a domingo; o intervalo de cada dia marcado; "Não atende" nos não marcados, sem controle; o tom só no dia diferente do intervalo-base.
   - **Ajustar:** tocar a linha abre os dois campos daquele dia, e só dele; mudar o fim muda a linha e o tom; voltar ao intervalo-base tira o tom; a validação de "fim antes do início".
   - **Copiar:** o link só com um dia diferente; o nome do último dia ajustado (e, sem ajuste, o do último dia diferente); depois da cópia, todos os dias com aquele intervalo, sem tom e sem link; nada gravado antes de salvar.
   - **Salvar:** "Salvar horários" chama `onboarding.update` com uma regra por dia marcado, com o intervalo de cada dia, e vai para `agenda-avenly-pronta`; no horário-base, "Continuar" faz o mesmo de hoje.
   - **Alvos:** a resposta do 2.6 válida para o schema de `GET /v1/onboarding` e com o mesmo intervalo em todos os dias; o 2.7 sem `responses` e sem passos.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 8.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a tela por dia que não abre sozinha com a leitura de um dia diferente faz um teste reprovar;
   - (b) o tom aplicado a todo dia marcado, e não só ao diferente do intervalo-base, faz um teste reprovar;
   - (c) a cópia que não esvazia `dayHours` (ou que não muda o intervalo-base) faz um teste reprovar;
   - (d) "Salvar horários" que grava só o intervalo-base, sem o dia diferente, faz um teste reprovar;
   - (e) o 2.7 de `targets.json` com um passo que toca "Personalizar dias diferentes" ou "Salvar horários" faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 7 só troca o texto, a ordem ou a ação que este Goal muda (por exemplo, tocar a linha do dia antes de achar "Segunda · Início"). Nenhum ajuste afrouxa asserção sobre os dias, o horário-base, a validação, a gravação ou a retomada do onboarding. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 2.7,2.6` e, para regressão, `--target 2.3,2.4,2.5`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 129.
   - Antes de editar, o Developer guarda o `app.png` de 2.3, 2.4, 2.5 e 2.6. Depois, mostra que 2.3, 2.4 e 2.5 não mudaram, ou explica cada diferença, e mostra o 2.6 de antes (painel aberto) e o de depois (recolhido, como o quadro).
   - O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`).
- Uma etapa nova no onboarding, uma rota nova ou mudança na barra de progresso.
- Escolher dias na tela por dia: o Domingo "Não atende" não vira controle.
- A importação no onboarding (2.I2 a 2.I10) e os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3), e as outras observações abertas dos reviews 116 a 129.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-144** em `PROPOSED`, conforme a escolha 11. Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal130.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal130, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um; um gate que o IA Loop roda depois do relatório é registrado com o resultado dele, nunca como "não executado";
  - a rodada de cada número, sem atribuir a uma rodada o que outra fez;
  - os controles negativos e a rodada em que rodaram;
  - o `visual:compare` (alvos, percentuais, regressão e diferenças que restam);
  - a lista dos testes ajustados.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos três registros acima.

## Validação e ordem

1. Montar a pilha descartável própria e capturar a regressão de antes, sem editar nada.
2. Implementar a tela por dia, com os testes `goal130`.
3. Adicionar o alvo 2.7, a resposta do 2.6 e os testes da captura.
4. Rodar o `visual:compare` de 2.7 e 2.6, e o de 2.3, 2.4 e 2.5 para regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `/onboarding/horarios` com um dia diferente do intervalo-base igual ao quadro 2.7 nos 4 devices, e com o mesmo intervalo igual ao quadro 2.6 nos 4 devices, salvo as divergências declaradas. Provado em jsdom e pelo `visual:compare`.
2. A tela por dia abre por "Personalizar dias diferentes" e pela leitura com um dia diferente; o chevron volta ao horário-base com todos os dias no intervalo-base; só o dia diferente tem o tom; cada linha abre os campos só do seu dia.
3. "Copiar <dia> para outros dias" só aparece com um dia diferente e dá a todos os dias marcados o intervalo daquele dia; nada é gravado antes de "Salvar horários", que grava uma regra por dia marcado com o intervalo de cada um e segue para `agenda-avenly-pronta`, como "Continuar" fazia.
4. As outras etapas do onboarding não mudam. 2.3, 2.4 e 2.5 iguais à captura de antes, ou com cada diferença explicada.
5. Nenhum pedido ao BFF muda de rota, e nenhum passo de captura toca controle. O teste da captura prova que o 2.6 só declara o `GET /v1/onboarding` e que o 2.7 não declara `responses` nem passos.
6. Os cinco controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/horarios` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440), no horário-base; o gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo, contraste, foco visível e `prefers-reduced-motion`. A tela por dia não é alcançada pelo gate (evidência 5): as cores dela são as do quadro, com o contraste de cada par de texto calculado e registrado em D-144 (inclusive `#0B4A4E` sobre `#EDF4F3`, `#5F574E` e `#716859` sobre `#FFFDFA` e `#0F5F63` sobre `#F7F4EF`), e o alvo de toque das linhas, do link e do chevron (24 px no mínimo) é provado em jsdom pelo CSS aplicado ou medido no `visual:compare`. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json` e `scripts/tests/visual-responses.test.mjs`; os três registros da seção "Documentação".
9. D-144 proposta, conforme a escolha 11.

## Plano de execução

1. **WU-01 — A tela por dia.** A tela "Horários por dia" na mesma etapa, a abertura pela leitura, o chevron, o ajuste por linha, a cópia, "Salvar horários", o CSS nos quatro devices, os testes `goal130` de comportamento e os ajustes dos testes existentes.
2. **WU-02 — Captura, fidelidade, provas e registros.** O alvo 2.7, a resposta do 2.6, os testes da captura, o `visual:compare` com a regressão, os controles negativos, D-144, CURRENT_STATE e VALIDATION_GATE.
3. **Verificação determinística:**
   - typecheck, lint, testes alvo `goal130`;
   - suíte do frontend e `test:gate`;
   - `validate:core`, `validate:ui` e `validate:integration`;
   - `git diff --check`.
