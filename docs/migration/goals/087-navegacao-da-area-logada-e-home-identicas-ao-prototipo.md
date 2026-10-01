# Goal 087 — Navegação da área logada e Home idênticas ao protótipo

**Status: READY.** Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal086 ACCEPTED](../reviews/086-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: H1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v111. **Passa à frente do 085**, que continua PLANNED com o mesmo ID e título (motivo em "Objetivo e posição").

## Baseline aceita

Baseline aceita: `f65b88a74f3bae750a1ea82f46abd52d1932ae2e`

Goal anterior: 086 — Login idêntico ao protótipo (validação da comparação visual)

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal086 já integrado em `main` (origem `81a2658a5dc7a448d0dce77ddca49365c063572b`). A virada de status do documento do Goal086 para `ACCEPTED` **não** entrou no commit de fechamento: veio no commit documental seguinte, `c6bf926`, que não é baseline. **Duas rodadas**; a rodada 1 teve um blocker só de documentação. Nenhuma decisão nova. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review086](../reviews/086-review.md) (execução da WU-001 da rodada 1): `validate:core` **15** `passed` e **2** `skipped`; `test:gate` **233**; `validate:ui` **168** `passed`, **21** `skipped` e **1** `flaky` (`ERR_NO_BUFFER_SPACE`, ambiente). O 086 não acrescentou teste: `test:frontend` segue a referência do Goal082, **128** arquivos e **1337** testes. `validate:integration` não rodou no 086; a referência é a do Goal082: **36** passos, gate autenticado com **175** testes e **0** retentativas.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Se divergir dos números acima, o relatório diz por quê. `test:gate` pode exigir `npx prisma generate` no ai-orchestrator antes: é pré-condição do harness, não efeito do diff.

## Objetivo e posição

O Goal086 provou que a comparação visual do ia-loop V33 funciona: o diff do L1 caiu de 41,9% para 4,8% no mobile e para 1,0% nos outros devices, e o revisor julgou a fidelidade pelas imagens. O review086 registra o que o aceite não prova: **a casca da área logada diverge do protótipo em todas as outras telas**, como o pente-fino visual de 2026-10-01 já tinha mostrado.

Este Goal corrige a casca comum, a que aparece em toda tela logada, e a Home, que é o quadro que a carrega. Critério: **`/inicio` igual ao quadro H1 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768).

**Por que antes do 085.** O 085 muda a mesma casca (altura da sidebar, ponto de estado da IA na sidebar e na Home) e mexe em telas que têm quadro (Home, Clientes, Semana). Sob a V33, ele teria de declarar esses quadros, e cada divergência da casca viraria blocker dentro de um Goal de acabamento. Corrigir a casca primeiro deixa o 085 julgável. O 085 volta a READY depois, com o escopo precisado sobre a casca nova.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/`) e no código da baseline:

1. **Tablet não tem sidebar no protótipo.** Os arquivos `*-Tablet.dc.html` da área logada (Home, Agenda, Clientes, Conversas, Configurações, Notificações) usam, em retrato e em paisagem, uma **barra inferior** de 72 px (`background:#FFFDFA; border-top:1px solid #E5DED4`), com cinco itens centralizados (Início, Conversas, Agenda, Clientes, Mais), 72 px de largura cada, `gap:56px`, ícone de 20 px e rótulo de 11 px peso 600; ativo `#0F5F63`, inativo `#716859`. Nenhum quadro tablet tem sidebar. O vault diz o mesmo: tablet tem "base semelhante ao mobile" (`docs/product-vault/00-Produto/04-Navegacao-e-Modulos.md`). O app mostra, de 768 a 1099 px, um trilho de 88 px (`atendly.css`, `@media (max-width: 1099px)`), decidido no item 1 de D-074.
2. **A sidebar do desktop é outra.** Nos `*-Desktop.dc.html`, a sidebar tem **232 px** (`background:#FFFDFA; border-right:1px solid #E5DED4; padding:18px 14px 16px`):
   - no topo, o logo (26 px) e "Atendly" em Literata 20 px peso 600;
   - a navegação, com `margin-top:22px` e `gap:2px`: Início, Conversas, Agenda, Clientes, Serviços e **Configurações** na mesma lista; item com `padding:9px 10px`, raio 10 px, 14 px; ativo peso 600, cor `#0B4A4E` e fundo `#EDF4F3`; inativo peso 500 e cor `#5F574E`;
   - no fim (`margin-top:auto`, `gap:14px`), um **cartão da IA** (borda `#E5DED4`, raio 12 px, `padding:12px`), com o ponto que respira, "IA ativa" 13 px peso 600, "atendendo pelo WhatsApp" 12 px `#716859` e a ação "Pausar" 12 px peso 600 `#0F5F63`; e, abaixo, a **conta**: avatar de 32 px com as iniciais (`#DCECEB`/`#0B4A4E`), o nome da pessoa 13 px peso 600 e o nome do negócio 12 px `#716859`.

   O app tem 248 px e, nesta ordem: logo, bloco do negócio (avatar, nome do negócio e "Agenda Atendly oficial"), uma linha de estado do WhatsApp e outra da IA (`StatusLine`), os cinco destinos, e no fim Notificações, Configurações e o botão da conta com o e-mail e "Conta proprietária" (`shared/layout/AppShell.tsx`).
3. **O celular não tem cabeçalho de marca no protótipo.** Nenhum quadro mobile da área logada tem o logo no topo; a Home começa no título "Bom dia, …". O app põe em toda rota logada, abaixo de 768 px, um cabeçalho fixo com a marca e um selo (nome do negócio ou "Atenção"). A barra inferior do protótipo tem `padding:8px 6px 0`, itens de 64 px com `justify-content:space-around`, e 90 px de altura, que incluem os 34 px do indicador de início do iPhone.
4. **A Home do H1** tem a faixa de estado com "IA ativa", a descrição e a ação "Pausar" à direita, sem a linha de pontos de estado (WhatsApp, IA, Agenda) que o app mostra dentro da faixa (`OperationalBand` em `features/dashboard/DashboardScreen.tsx`). O resto da Home foi portado pelo Goal074 (D-088); a comparação diz o que ainda difere.
5. **A sessão tem o nome da pessoa.** `user.name` existe no contrato desde o Goal064 (`packages/public-api-contract/src/schemas.ts`), nulo para conta anterior.

O Developer confirma 1 a 4 com a própria execução de `npm run visual:compare -- --target H1` na baseline, antes da primeira edição.

## Escolhas de desenho desta passada

**(a) Três faixas de navegação, iguais ao protótipo.** Abaixo de 768 px: barra inferior do mobile, sem cabeçalho de marca. De 768 a 1099 px: barra inferior do tablet, sem sidebar e sem cabeçalho de marca. A partir de 1100 px: sidebar de 232 px, sem barra inferior. O trilho de 88 px deixa de existir. O limite de 1100 px é o que a casca já usa; o protótipo só fixa que 1024 tem barra e 1366 tem sidebar.

**(b) "Mais" é o mesmo nas duas barras.** O quinto item abre o mesmo diálogo "Mais" de hoje, com os mesmos destinos, inclusive Notificações. No tablet, a central também abre pelo sino da Home, como hoje (D-093).

**(c) A sidebar segue o quadro, com uma divergência declarada.** Ordem: logo; navegação com os cinco destinos e Configurações; no fim, o cartão da IA e a conta. **Notificações continua na sidebar**, com a contagem de não lidas e o comportamento de D-093 (abre a gaveta), como último item da navegação, no mesmo estilo dos outros. Motivo: sem o item, a central fica inalcançável no desktop fora da Home (D-093, item 4). A linha de estado do WhatsApp sai da sidebar; a desconexão continua anunciada pelo banner da casca, que não muda.

**(d) O cartão da IA usa o estado que a sidebar já lê.** Texto principal e ponto vêm de `status.aiView`, com as mesmas palavras de hoje ("IA ativa", "IA desligada", "IA em ativação", "Verificando IA", "IA não confirmado"). A linha de apoio é "atendendo pelo WhatsApp" só quando a IA está ativa; nos outros estados, sem linha de apoio. A ação "Pausar" aparece só com a IA ativa e é um **link para `/configuracoes/ia`**, onde a pausa com confirmação já existe. Este Goal não cria pausa em outro lugar. O ponto que respira não anima com `prefers-reduced-motion: reduce`. A coerência com o WhatsApp desconectado ("IA sem conexão") é do 085 (R-06) e fica fora daqui.

**(e) A conta mostra a pessoa e o negócio.** Avatar com as iniciais de `user.name` (ou do e-mail, se o nome for nulo), o nome (ou o e-mail) e o nome do negócio embaixo. O clique continua abrindo o menu com "Minha conta" e "Sair". O botão não mostra ícone de "mais", porque o quadro não tem.

**(f) "Pausar" na faixa da Home.** Com a IA ativa, a faixa mostra "Pausar" à direita, também como link para `/configuracoes/ia`. A linha de pontos de estado sai da faixa: o H1 não a tem, e a faixa já resolve um estado só, pela gravidade (D-088, item 8), inclusive agenda indisponível e WhatsApp desconectado.

**Divergências declaradas, que não contam como defeito na comparação:**

1. O item Notificações na sidebar do desktop, por (c).
2. No mobile, os até 34 px de altura da barra inferior que, no quadro, são o indicador de início do iPhone. A barra do app tem a altura do conteúdo do quadro mais `env(safe-area-inset-bottom)`.
3. "Pausar" leva a Configurações › IA, em vez de abrir a folha de confirmação na própria tela (H7), por (d) e (f).
4. Dados da conta de teste que não são layout, como já registrado em `e2e/visual/targets.json`.

## Escopo obrigatório

### 1. Casca e Home iguais ao H1

**Porte** o HTML/CSS do quadro H1. A referência fica em `docs/design-reference/claude-design/prototype/project/`:

- mobile: `Home.dc.html`, quadro "Home · IA ativa";
- tablet: `Home-Tablet.dc.html`, quadros "Home / Home · IA ativa / Portrait" e "… / Landscape";
- desktop: `Home-Desktop.dc.html`, quadro "Home / Home · IA ativa / Desktop".

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target H1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. Para cada device, o relatório final traz o diff final e o que ainda difere, com o motivo.

A casca é comum: a regra base continua em `app-frame` (D-074, item 1), uma vez, para todo módulo. Nenhum módulo ganha casca própria.

### 2. As outras telas logadas não pioram

A casca nova aparece em todas as rotas logadas. Rode `npm run visual:compare -- --target A1,CL1,Servicos:S1,Conversas:C1,M1` no início e no fim, e cole o diff de cada device das duas execuções. Nenhum device pode ficar pior, e nenhuma tela pode quebrar. A navegação dessas telas deve ficar igual à do protótipo; o conteúdo próprio de cada quadro fica **fora** deste Goal.

No tablet, a barra inferior é `fixed`, como no mobile. Nenhum conteúdo de rota logada pode ficar escondido atrás dela: o fim do conteúdo, o botão flutuante (`a.fab`) e os controles do fim da página ficam acima da barra, de 360 a 1099 px. A conversa aberta, que já esconde a barra (`ConversationThread.tsx`), continua sem barra.

### 3. Comportamento preservado

- Os destinos, `href`, `aria-current="page"` no destino atual e os nomes acessíveis "Navegação principal" e "Navegação da aplicação" continuam.
- O item Notificações da sidebar continua link para `/notificacoes`, abrindo a gaveta no clique simples (D-093).
- O menu da conta continua com "Minha conta" e "Sair", fecha com `Escape` e devolve o foco ao botão.
- O banner da casca (exclusão agendada, WhatsApp desconectado, IA indisponível) não muda.
- **O gate autenticado não pode mudar e tem de continuar passando.** Ele exige, em toda largura, um elemento `.sidebar .business-context .business-name strong` com o nome do negócio semeado (`e2e/authenticated-matrix.spec.ts`, `proveAuthenticatedScreen`). Abaixo de 1100 px a sidebar continua no DOM, oculta, como já acontece abaixo de 768 px. A marcação da conta (e) tem de manter esse seletor resolvendo para o nome do negócio.

### 4. Provas novas

`apps/frontend/tests/goal087-shell-navigation.test.tsx`, com dublês do `ProductRuntime` no padrão dos testes dos Goals 074 e 085:

1. A sidebar tem, nesta ordem, Início, Conversas, Agenda, Clientes, Serviços, Configurações e Notificações, todos links, e não tem linha de estado do WhatsApp.
2. O cartão da IA: com a IA ativa, "IA ativa", "atendendo pelo WhatsApp" e um link "Pausar" com `href="/configuracoes/ia"`; com a IA desligada, em ativação ou não confirmada, o texto de hoje e nenhum "Pausar".
3. A conta: com `user.name`, o nome e as iniciais dele; com `user.name` nulo, o e-mail. O nome do negócio aparece em `.sidebar .business-context .business-name strong`. O menu abre com "Minha conta" e "Sair".
4. A casca não renderiza o cabeçalho de marca em nenhuma rota logada.
5. A faixa da Home com a IA ativa tem "Pausar" com `href="/configuracoes/ia"` e não tem a linha de pontos de estado; com o WhatsApp desconectado, a faixa diz o estado de hoje e não tem "Pausar".

As provas 1 a 5 **reprovam na baseline**. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

**Medidas novas no gate autenticado**, em `e2e/authenticated-matrix.spec.ts`, como testes novos, sem mudar teste existente, `e2e/routes.ts`, `playwright.*.config.ts`, semente nem `scripts/`:

- **G-1 (faixas):** em `/inicio` e `/clientes`, em cada largura do gate:
  - abaixo de 1100 px, `aside.sidebar` não está renderizada, a barra inferior está, com cinco itens, e nenhum `header[class$="-mobile-header"]` está renderizado;
  - a partir de 1100 px, `aside.sidebar` está renderizada com largura de 232 px (tolerância de 1 px), e a barra inferior não está.

  Reprova na baseline em 768 e 1024.
- **G-2 (nada atrás da barra):** em `/clientes` e `/servicos`, nas larguras abaixo de 1100 px, depois de rolar até o fim, o último elemento focável dentro de `main` e o `a.fab`, se houver, têm a caixa inteira acima do topo da barra inferior. É regressão: na baseline, 768 e 1024 não têm barra.

O relatório cola a saída do gate autenticado com G-1 vermelho contra os arquivos de produção da baseline, ou declara, com o motivo, que essa execução não foi possível e que o vermelho está nas provas 1 a 5.

### 5. Testes existentes

Continuam passando. Só muda asserção que dependa de: linha de estado do WhatsApp ou da IA na sidebar, bloco do negócio no topo da sidebar, "Conta proprietária", cabeçalho de marca no mobile, linha de pontos de estado na faixa da Home, ou trilho de 88 px. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A linha de estado do WhatsApp volta à sidebar: a prova 1 reprova.
2. "Pausar" do cartão da IA aparece também com a IA desligada: a prova 2 reprova.
3. A conta volta a mostrar só o e-mail com o nome preenchido: a prova 3 reprova.
4. O cabeçalho de marca volta a ser renderizado: a prova 4 reprova.

### 7. O que só uma pessoa confere

- A casca num celular e num tablet reais, com o indicador de início e o teclado aberto num formulário.
- As outras telas logadas, cujo conteúdo próprio ainda diverge dos quadros, fora deste Goal.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

## Pontos de implementação

- `apps/frontend/src/shared/layout/AppShell.tsx` e, se preciso, `navigation.ts`.
- `apps/frontend/src/features/dashboard/DashboardScreen.tsx`: a faixa (f).
- `apps/frontend/src/shared/styles/atendly.css`: a regra base da casca, a sidebar, as barras e a faixa da Home. Outras folhas de `shared/styles/` só onde uma regra de módulo sobrescreve a casca e impede o resultado.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`, no padrão do Goal086.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.
- `apps/frontend/e2e/authenticated-matrix.spec.ts` e, se preciso, `e2e/measure.ts`: G-1 e G-2, **só por acréscimo**.

## Fora do escopo

- O conteúdo próprio de qualquer tela além da Home; o master-detail de Clientes, Serviços e Conversas no tablet e no desktop; o onboarding; as telas de acesso L3, L4 e L5.
- Tudo o que é do 085: "IA sem conexão" (R-06), o sublinhado da linha de lista (R-08), o bloco curto da Semana (R-09) e a altura da casca sem unidade de viewport (R-10). A sidebar mantém o meio de altura de hoje.
- Uma folha de confirmação de pausa fora de Configurações › IA.
- Qualquer mudança em `GET /v1/status`, no BFF, nos serviços, no contrato, em `docs/design-reference/`, no vault e em `e2e/visual/targets.json` (H1 já está mapeado para `/inicio`; mude só se o alvo estiver errado, e explique no relatório).

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-101** em `PROPOSED`, no formato de D-090 a D-100. Ela diz (a) a (f), com o motivo de cada um, as divergências declaradas e o que muda: o item 1 de D-074 perde o trilho de 88 px e o cabeçalho de marca do mobile; o item 4 de D-093 continua, com o item Notificações só na sidebar do desktop. O "Revisar se" inclui: a pausa ganhar folha própria fora de Configurações; e o produto ganhar topbar no desktop, como o vault cita.
- [CURRENT_STATE](../CURRENT_STATE.md) registra a casca nova, que a Home segue o H1 e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra G-1 e G-2 e a contagem do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso.

## Validação e ordem

1. Recontar a baseline; rodar `npm run visual:compare -- --target H1` e `-- --target A1,CL1,Servicos:S1,Conversas:C1,M1` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target H1`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`, e `npm run visual:compare -- --target H1,A1,CL1,Servicos:S1,Conversas:C1,M1`.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

No relatório, para cada device do H1, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target H1` e abriu os quatro `side-by-side.png`. `/inicio` está **igual ao quadro H1 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das quatro declaradas.
2. A1, CL1, Servicos:S1, Conversas:C1 e M1 não ficaram piores em nenhum device, com a navegação igual à do protótipo em cada faixa.
3. As provas 1 a 5 passam, reprovaram na baseline, e os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. Largura, toque, contraste, foco e `prefers-reduced-motion` das telas tocadas são decididos pelo gate renderizado: `validate:ui` nas cinco larguras e o gate autenticado dentro de `validate:integration`, com os **175** testes da baseline mais G-1 e G-2, e **0** retentativas. O comportamento do §3 continua.
5. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
6. D-101 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §7 não foi feita.
7. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** a fidelidade do conteúdo das outras telas logadas; a casca num aparelho real; o estado "IA sem conexão" (085).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e comparação da baseline; casca nova em três faixas, sidebar, cartão da IA, conta e barras (§1 a §3, (a) a (e)); asserções existentes ajustadas (§5) |
| WU-02 | STANDARD | WU-01 | Faixa da Home igual ao H1 (f); iteração final de `visual:compare` do H1 e das telas irmãs |
| WU-03 | STANDARD | WU-02 | Provas 1 a 5 com o vermelho da baseline; G-1 e G-2 no gate autenticado, só por acréscimo |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal087-shell-navigation` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | Controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
