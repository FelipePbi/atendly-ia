# Goal 089 — Casca do onboarding igual ao protótipo

**Status: READY.** Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal098 ACCEPTED](../reviews/098-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Quadros do protótipo: 0, 1.1, 2.1, 3.2

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED), a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01). Na v115 ganhou o 098 como dependência só de ordem. READY na v116, com o mesmo ID, título e posição.

## Baseline aceita

Baseline aceita: `46191dcec3e2b32f1e20b8c117d5f564f33c3499`

Goal anterior: 098 — Os testes de integração do Scheduling não dependem da data do dia

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal098 já integrado em `main` (origem `eb13d76c33a13586f8eea5a7b86037d31c787da1`). A virada de status do documento do Goal098 para `ACCEPTED` **não** entrou no commit de fechamento: veio no commit documental seguinte, `0acc20e`, que não é baseline. **Duas rodadas**; a rodada 1 teve seis blockers, todos de prova e de documentação. Nenhuma decisão nova. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline. Do Goal098 ([review098](../reviews/098-review.md), [CURRENT_STATE](../CURRENT_STATE.md)): `validate:core` **17** passos, **15** `passed` e **2** `skipped`; `validate:integration` **36** passos `passed` e **0** `notRun`, com o gate autenticado em **235** testes e **0** retentativas. Do Goal088, porque o 098 não tocou o frontend: `test:frontend` **132** arquivos e **1415** testes; `test:gate` **233**; `validate:ui` **167** `passed`, **21** `skipped` e **2** retentativas, em rotas públicas e por ambiente.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Se divergir dos números acima, o relatório diz por quê. `test:gate` pode exigir `npx prisma generate` no ai-orchestrator antes: é pré-condição do harness, não efeito do diff.

**Ambiente.** O review098 registra que, neste Windows, `validate:integration` só fechou com `VITEST_MAX_WORKERS=1`, por falta de memória. Use essa variável de ambiente se precisar. Não edite configuração para isso.

## Objetivo e posição

Os Goals 086, 087, 085 e 088 deixaram iguais ao protótipo o login, a navegação da área logada, a Home e a composição de lista e detalhe. O pente-fino visual de 2026-10-01 nomeou a **casca 3**: a moldura do onboarding diverge em todas as etapas. Divergem o cabeçalho de progresso, o stepper (com os estados invertidos), o painel bege, o CTA ancorado no rodapé e a tipografia do título.

Este Goal porta essa moldura uma vez, para todas as etapas. Critério: **`/onboarding/boas-vindas`, `/onboarding/segmento-e-nome`, `/onboarding/sistema-atual` e `/onboarding/tom-da-ia` iguais aos quadros 0, 1.1, 2.1 e 3.2 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768).

**Por que agora.** O 098 devolveu `validate:integration` inteiro, com o gate autenticado, que mede as etapas do onboarding nas cinco larguras. O 089 é o primeiro da sequência 089–097 cuja dependência está fechada. O 090 (conteúdo das outras etapas) depende desta moldura: sem ela, cada etapa portaria uma moldura própria.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Onboarding-*.dc.html`) e no código:

1. **Mobile (402).** Não há barra superior, marca nem "Sair". O topo tem o chevron (40×40, `margin-left:-8px`, cinza `#948B80` quando inativo), a barra de 4 segmentos e uma reserva de 32 px à direita. Embaixo vem o eyebrow do capítulo (12 px, 600, `letter-spacing:.08em`, `#0F5F63`). Padding do topo 62 px 20 px.
2. **Progresso parcial.** O segmento concluído é cheio (`#0F5F63`). O pendente é `#E5DED4`. O atual tem trilho `#DCECEB` e preenchimento parcial: 30%, 62% e 90% em Segmento e nome, Modalidade e Endereço; 12% a 92% em Sua agenda; 40% e 80% em Sua IA; 10% a 86% em WhatsApp. Os quatro segmentos têm 4 px de altura e raio 2 px. A Boas-vindas não tem barra.
3. **Tablet em retrato (768).** Coluna única de 600 px, centrada, sem sidebar, com o mesmo topo do mobile (padding 40 px 20 px).
4. **Tablet em paisagem (1024) e desktop (1366).** Sem barra superior e sem barra de progresso. Sidebar de altura total, `#FFFDFA`, borda direita `#E5DED4`, padding 36/32/32 e `gap:40px`: marca (Literata 22 px, 600) e "Configuração inicial" (12 px, 600, maiúsculas, `#716859`) com o stepper. A sidebar tem **340 px** na paisagem e **420 px** no desktop. À direita, o painel bege (`#F7F4EF`) com a coluna centrada de **560 px** na paisagem e **600 px** no desktop. O topo da coluna tem só o chevron e o eyebrow.
5. **Stepper.** Item com padding 11/12, raio 12, `gap:14px`, marcador de 26 px e rótulo 15 px/600:
   - concluído: marcador cheio `#0F5F63` com ✓ claro e rótulo `#221E1A`;
   - atual: fundo `#EDF4F3`, rótulo `#0B4A4E` e marcador com borda 1,5 px `#0F5F63` e número;
   - pendente: rótulo `#716859` e marcador com borda 1 px `#D6CEC2` e número.

   Na Boas-vindas, os quatro estão pendentes.
6. **Título e CTA.** H1 em Literata 28 px, peso 500, `line-height:1.2`, `letter-spacing:-0.01em`. A descrição, quando existe (3.2), vem colada ao título (14 px, `#5F574E`, `gap:6px`). O CTA principal tem 52 px de altura e raio 14, ocupa a largura da coluna e fica no rodapé (padding 12/20/46 no mobile e 12/20/32 no tablet e no desktop). Em 2.1 os cartões são a ação, e o rodapé fica vazio.
7. **O app hoje** (`features/onboarding/OnboardingShell.tsx`, `atendly.css` a partir de `.onboarding-shell`):
   - `OnboardingTopbar` em todas as larguras, com marca, rótulo do capítulo, segmentos (o atual mais grosso, sem preenchimento parcial) e o botão "Sair";
   - `OnboardingRail` de 260 px a partir de 768 px, abaixo da barra superior;
   - eyebrow, H1 e descrição num `header`;
   - ações no fim do conteúdo, não no rodapé.

   `OnboardingFrame`, a moldura da etapa `importacao` (Goal066), usa a mesma barra e o mesmo trilho.
8. **"Sair" não existe no protótipo.** No app, ele faz logout (`OnboardingScreen.tsx`, `logout()`). É a única saída da conta que está no onboarding. O item 9 de [D-083](../DECISIONS.md) o fixa como `.btn .btn-secondary` em todas as larguras, com um único nome acessível.
9. `e2e/visual/targets.json` já mapeia 0, 1.1, 2.1 e 3.2 e as outras etapas, com a conta `onboarding`. Não há mudança de mapa a fazer.

## Escolhas de desenho desta passada

**(a) Uma moldura só.** `OnboardingShell` e `OnboardingFrame` usam a mesma moldura: o mesmo topo, a mesma sidebar e o mesmo painel. A etapa `importacao` continua sem chevron e com a navegação do módulo de importação (D-094, item 1).

**(b) Duas faixas, com o limite em 1024 px.** Abaixo de 1024 px: sem sidebar, com o topo de (c) e a coluna (largura cheia com 20 px de margem no celular; 600 px centrada de 768 px em diante). De 1024 px em diante: sidebar de altura total e painel bege com a coluna centrada, sem barra de progresso. A sidebar tem 340 px de 1024 a 1365 px e 420 px de 1366 px em diante. A coluna tem 560 px e 600 px nas mesmas faixas. A barra superior deixa de existir em todas as larguras. O valor 1024 coincide com o padrão de D-103 e com uma largura do gate renderizado.

**(c) Progresso parcial derivado do fluxo.** O preenchimento do segmento atual é a posição da etapa dentro do capítulo, calculada em `blocks.ts` a partir da lista de etapas de cada capítulo. Não é uma tabela de porcentagens copiada do protótipo. A etapa seguinte do mesmo capítulo nunca preenche menos que a anterior. `endereco`, `quando-importar` e `importacao` seguem os desvios que `blockForScenario` já trata. A semântica continua a de D-094, item 2: `role="group"` "Progresso da configuração inicial", quatro itens, `aria-current="step"` no atual e "<capítulo>, concluído" no concluído. O preenchimento é decorativo (`aria-hidden`) e substitui o "atual mais grosso": a largura preenchida é a pista que não depende só de cor. A Boas-vindas não tem barra.

**(d) Stepper com os estados do protótipo** (evidência 5). O concluído troca o número por ✓ no marcador cheio. Os nomes acessíveis e o `aria-current` de D-094 não mudam.

**(e) "Sair" continua.** É divergência declarada: sem ele, quem entrou na conta errada fica preso no onboarding. De 1024 px em diante, ele fica no rodapé da sidebar, como botão secundário com ícone e texto. Abaixo de 1024 px, ele fica no espaço que o protótipo reserva à direita da barra de progresso, só com o ícone. Ele espelha o chevron: 40×40 com margem negativa de 8 px. O nome acessível continua um só, "Sair", com o texto oculto só visualmente, como no item 9 de D-083.

**(f) CTA ancorado.** A coluna ocupa a altura da janela. O conteúdo rola dentro dela, e as ações ficam no rodapé da coluna, sempre visíveis. Depois de rolar até o fim, o último elemento focável do conteúdo fica inteiro acima das ações. A ordem das ações e o empilhamento da introdução do WhatsApp (D-083, item 8) não mudam.

**(g) Título em serif regular.** O H1 da moldura segue a evidência 6 em todas as etapas. A descrição fica colada ao título. O eyebrow sai do `header` do título e vai para o topo, sob o chevron, como no quadro.

**Divergências declaradas, que não contam como defeito na comparação:**

1. "Sair", por (e).
2. A barra de status e o indicador de início do iPhone nos quadros mobile (como em D-101).
3. Dados da conta de teste que não são layout, como `e2e/visual/targets.json` já registra.
4. Momento da animação capturado no 0 e no 3.2 (D-095): conta a composição, não o quadro da animação.
5. O conteúdo próprio das outras etapas (§2), que é do Goal090.

## Escopo obrigatório

### 1. 0, 1.1, 2.1 e 3.2 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`:

- 0, 1.1 e 2.1: `Onboarding-1-Negocio-e-Agenda.dc.html` ("Boas-vindas", "Segmento e nome", "Sistema atual"), `Onboarding-1-Negocio-e-Agenda-Tablet.dc.html` ("Onboarding / <rótulo> / Portrait" e "… / Landscape") e `Onboarding-1-Negocio-e-Agenda-Desktop.dc.html` ("… / Desktop");
- 3.2: `Onboarding-3-IA-e-WhatsApp.dc.html` ("Estilo da IA"), `-Tablet` e `-Desktop`, com os mesmos rótulos.

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença. Nas quatro etapas, o conteúdo da etapa também precisa bater, não só a moldura.

Repita `npm run visual:compare -- --target 0,1.1,2.1,3.2` até não haver divergência visível em nenhum dos quatro devices além das declaradas. Para cada quadro e device, o relatório final traz o diff final e o que ainda difere, com o motivo.

### 2. As outras etapas ganham a moldura e não pioram

A moldura aparece em todas as rotas `/onboarding/*`. Rode `npm run visual:compare -- --target 1.2,1.3,2.2,2.3,2.4,2.5,2.6,2.I1,3.1,4.1,4.2,4.6` no início e no fim, e cole o diff de cada device das duas execuções. Nenhuma etapa pode quebrar. Toda piora de device tem causa medida no relatório. A moldura dessas etapas (topo, sidebar, painel, coluna, título e CTA) deve seguir o quadro. O conteúdo próprio delas fica para o Goal090.

A área logada, as telas de acesso e `/importacao` fora do onboarding **não** mudam.

### 3. Comportamento preservado

- As rotas, a ordem das etapas, `nextRequiredStep`, a retomada, a gravação ao continuar e os destinos do chevron não mudam.
- "Sair" continua fazendo logout, com um único nome acessível, nas duas molduras.
- O chevron continua com D-094, item 1: `Link` "Voltar"; cinza e fora da ordem de Tab na Boas-vindas; ausente nas etapas de estado do teste real, em `whatsapp-concluido` e em `importacao`.
- A validação inline, o foco no primeiro inválido e os erros de servidor no campo (D-083, item 4) continuam. O aviso geral continua com `role="alert"`.
- O guard da `importacao` (D-094, item 8) continua.
- O `RouteAnnouncer` continua anunciando a troca de etapa.
- As medidas do onboarding no gate autenticado (D-083, item 10) continuam passando sem mudança, incluindo os oito chips inteiros e os dois botões empilhados da introdução do WhatsApp no celular.

### 4. Provas novas

`apps/frontend/tests/goal089-onboarding-shell.test.tsx`, com dublês do runtime no padrão dos testes do Goal072 e do Goal079:

1. Nenhuma etapa renderiza barra superior: a marca aparece só dentro da sidebar `nav` "Configuração inicial", e "Sair" não está num `header` de barra superior. Vale para `OnboardingShell` e para `OnboardingFrame`.
2. Em `segmento-e-nome`, `modalidade` e `endereco`, o grupo "Progresso da configuração inicial" tem quatro itens. O atual tem `aria-current="step"` e preenchimento entre 0 e 100% exclusivos, que cresce de uma etapa para a seguinte. Em `tom-da-ia`, os dois primeiros são concluídos e o terceiro é o atual. Na `boas-vindas`, o grupo não existe.
3. O stepper da sidebar mostra ✓ no concluído, número no atual e no pendente. O concluído tem o nome "<capítulo>, concluído", e o atual tem `aria-current="step"`. Na `boas-vindas`, nenhum item é atual.
4. O eyebrow do capítulo fica fora do `header` do título, e a descrição, quando existe, fica logo depois do H1.
5. "Sair" tem um único nome acessível e chama o logout nas duas molduras.

As provas 1 a 4 **reprovam na baseline**; a 5 pode passar e é regressão declarada. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

**Medida nova no gate autenticado**, em `e2e/authenticated-matrix.spec.ts`, como teste novo, sem mudar teste existente, `e2e/routes.ts`, `playwright.*.config.ts`, semente nem `scripts/`. Use a conta parada no meio do onboarding (`onboardingTest`), em `/onboarding/segmento-e-nome` e `/onboarding/tom-da-ia`:

- **G-6 (moldura do onboarding):**
  - Abaixo de 1024 px: a sidebar não está renderizada, a barra de progresso está, e "Sair" tem alvo de toque de pelo menos 24 px.
  - Abaixo de 1024 px, logo ao abrir: o botão principal está inteiro dentro da janela. Depois de rolar até o fim, o último elemento focável do conteúdo está inteiro acima das ações.
  - De 1024 px em diante: não há barra superior, e a sidebar tem a altura da janela (tolerância de 1 px). A sidebar tem 340 px em 1024 e 420 px em 1440. A coluna tem 560 px e 600 px nas mesmas larguras (tolerância de 1 px).

G-6 reprova na baseline. Se o orçamento de requisições do gate não comportar G-6 nas cinco larguras, o relatório mostra a contagem e reduz as rotas, não as larguras. Nenhuma folga de limite é mexida.

### 5. Testes existentes

Continuam passando. Só muda asserção que dependa de: barra superior, marca fora da sidebar, trilho a partir de 768 px, segmento atual "mais grosso", capítulo atual na Boas-vindas, eyebrow dentro do `header` do título, ou ações no fim do conteúdo. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A barra superior volta a ser renderizada: a prova 1 reprova.
2. O preenchimento do segmento atual volta a ser fixo (0 ou 100%): a prova 2 reprova.
3. O concluído volta a mostrar número no lugar de ✓: a prova 3 reprova.
4. O eyebrow volta para dentro do `header` do título: a prova 4 reprova.

### 7. O que só uma pessoa confere

- O onboarding num celular real, com o teclado aberto em Segmento e nome e o CTA ancorado.
- Num tablet real, a rotação entre retrato e paisagem no meio de uma etapa.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

## Pontos de implementação

- `apps/frontend/src/features/onboarding/OnboardingShell.tsx`: a moldura única ((a), (b), (d), (e), (f), (g)) para `OnboardingShell` e `OnboardingFrame`.
- `apps/frontend/src/features/onboarding/blocks.ts`: a fração do capítulo atual (c), ao lado de `chapterProgress`.
- `apps/frontend/src/features/onboarding/OnboardingScreen.tsx`, `OnboardingImportStep.tsx` e `blocks/*.tsx`, só onde a etapa passa o eyebrow, a descrição ou as ações para a moldura, e no conteúdo de 0, 1.1, 2.1 e 3.2.
- `apps/frontend/src/shared/styles/atendly.css`, nas regras `.onboarding-*`. Se o Developer preferir, as regras da moldura podem ir para uma folha nova `shared/styles/atendly-onboarding.css`, importada como as outras folhas de módulo. O relatório diz qual foi a escolha.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.
- `apps/frontend/e2e/authenticated-matrix.spec.ts` e, se preciso, `e2e/measure.ts`: G-6, **só por acréscimo**.

## Fora do escopo

- O conteúdo próprio de 1.2, 1.3, 2.2–2.6, 2.I1, 3.1, 4.1, 4.2 e 4.6, incluindo a separação entre consentimento e conexão do WhatsApp (Goal090).
- As telas do módulo de importação dentro da moldura. Só a moldura em volta delas muda.
- A busca por CEP (pendente de decisão humana, D-094, item 9).
- Qualquer mudança em rota, fluxo, contrato, BFF, serviços, `docs/design-reference/`, vault e `e2e/visual/targets.json`. Os quadros já estão mapeados; mude o mapa só se o alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-104** em `PROPOSED`, no formato de D-102 e D-103. Ela diz (a) a (g), com o motivo de cada um, as larguras escolhidas e as divergências declaradas. Diz também o que substitui: o trilho a partir de 768 px e o "atual mais grosso" do item 2 de D-094, e o lugar do "Sair" do item 9 de D-083. O "Revisar se" cobre dois casos: o protótipo ganhar "Sair", ou mudar a faixa da sidebar.
- [CURRENT_STATE](../CURRENT_STATE.md) registra a moldura, que 0, 1.1, 2.1 e 3.2 seguem os quadros e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra G-6 e a contagem do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare` dos quatro quadros e das etapas do §2 na baseline, e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target 0,1.1,2.1,3.2`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e o `visual:compare` dos quatro quadros e das etapas do §2.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e o motivo (observação 2 do [review085](../reviews/085-review.md)). Depois do 098, uma falha de `validate:integration` não tem causa conhecida fora do diff: o relatório mede a causa antes de declará-la de ambiente.

No relatório, para cada device de 0, 1.1, 2.1 e 3.2, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target 0,1.1,2.1,3.2` e abriu os dezesseis `side-by-side.png`. As quatro telas estão **iguais aos quadros 0, 1.1, 2.1 e 3.2 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das declaradas.
2. As etapas do §2 não quebraram, e toda piora tem causa medida. A moldura delas segue o quadro: topo abaixo de 1024 px, sidebar e painel de 1024 px em diante, título e CTA.
3. As provas 1 a 5 passam, e as provas 1 a 4 reprovaram na baseline (a 5 é regressão declarada). Os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. Largura, toque, contraste, foco e `prefers-reduced-motion` das etapas são decididos pelo gate renderizado: `validate:ui` nas cinco larguras e o gate autenticado dentro de `validate:integration`. O gate tem os **235** testes da baseline mais G-6, e **0** retentativas. O comportamento do §3 continua.
5. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
6. D-104 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §7 não foi feita.
7. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** o conteúdo próprio das etapas do §2; a moldura num aparelho real; as telas do módulo de importação.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e comparação da baseline; moldura única nas duas faixas ((a) a (g)), com a fração do capítulo em `blocks.ts` e o "Sair" de (e) |
| WU-02 | STANDARD | WU-01 | 0, 1.1, 2.1 e 3.2 portados, conteúdo incluído; etapas do §2 conferidas na moldura nova |
| WU-03 | STANDARD | WU-02 | Provas 1 a 5 com o vermelho da baseline; asserções do §5; G-6 no gate autenticado, só por acréscimo |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal089-onboarding-shell` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
