# Goal 088 — Lista e detalhe lado a lado no tablet e no desktop, e telas empurradas sem barra de abas no mobile

**Status: ACCEPTED.** Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal085 ACCEPTED](../reviews/085-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL5, Servicos:S4, Mais-Negocio:N1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED), a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01). READY na v114, com o mesmo ID, título e posição.

## Baseline aceita

Baseline aceita: `f0d53ae296285c18337edfb7269e5b898eed9a43`

Goal anterior: 085 — A casca diz o estado real do WhatsApp e preenche a janela

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal085 já integrado em `main` (origem `d3d4aecc5757d317ea4f0e183d2ab9cf25e7c5a5`). A virada de status do documento do Goal085 para `ACCEPTED` **não** entrou no commit de fechamento: veio no commit documental seguinte, `742feec`, que não é baseline. **Duas rodadas**; a rodada 1 teve três blockers, todos de evidência e de documentação. **D-102** aceita. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, da execução final do Goal085 ([review085](../reviews/085-review.md), [CURRENT_STATE](../CURRENT_STATE.md)): `validate:core` **17** passos, **15** `passed` e **2** `skipped`; `test:frontend` **131** arquivos e **1390** testes; `test:gate` **233**; `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas; `validate:integration` **36** passos, declarados pelo Developer do 085, com o gate autenticado em **205** testes e **0** retentativas.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Se divergir dos números acima, o relatório diz por quê. `test:gate` pode exigir `npx prisma generate` no ai-orchestrator antes: é pré-condição do harness, não efeito do diff.

## Objetivo e posição

Os Goals 086, 087 e 085 deixaram iguais ao protótipo o login, a navegação da área logada e a Home. O pente-fino visual de 2026-10-01 nomeou mais uma **casca comum** que faz divergir todas as telas de Clientes, Serviços e Configurações (casca 2): no tablet em paisagem e no desktop, o protótipo mostra **a lista à esquerda e o detalhe à direita**; no celular e no tablet em retrato, o detalhe é uma **tela empurrada**, com barra própria e sem a barra de abas. O app abre todo detalhe como página solta de largura cheia, com "‹ Voltar", título grande e a barra de abas embaixo.

Este Goal cria esse padrão uma vez e o aplica aos três módulos. Critério: **`/clientes/detalhes`, `/servicos/editar` e `/configuracoes/negocio` iguais aos quadros CL5, S4 e N1 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768).

**Por que agora.** É o primeiro Goal da sequência 088–097 da v113 e o único cuja dependência (085 e 087) está fechada. Os Goals de tela que vêm depois (094 Clientes, 095 Serviços, 097 Configurações e 093 fluxos da Agenda) dependem desse padrão: sem ele, cada um portaria a sua própria versão de lista e detalhe.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/`) e no código da baseline:

1. **Lista e detalhe lado a lado a partir do tablet em paisagem.** Nos quadros de paisagem e de desktop de CL5 ("Clientes / Cliente · resumo / Landscape" e "… / Desktop"), de S4 ("Serviços / Editar serviço · opções / …") e de N1 ("Configurações / Configurações · Negócio / …"), a lista ocupa uma coluna à esquerda e o detalhe o resto. Os arquivos `Clientes-Tablet`, `Clientes-Desktop`, `Servicos-Desktop`, `Configuracoes-Tablet` e `Configuracoes-Desktop` usam `width:380px` para essa coluna; o Developer confirma o valor em cada quadro. No paisagem, a barra inferior do tablet continua; no desktop, a sidebar de 232 px continua (D-101).
2. **A lista sem item aberto também é dividida.** Nos mesmos devices, CL1 e S1 mostram a lista e, à direita, só "Selecione um cliente para ver o perfil" e "Selecione um serviço". M1 ("Configurações / Mais / Desktop") mostra à esquerda o cartão do negócio e os grupos de configurações e, à direita, o Negócio aberto.
3. **No celular e no tablet em retrato, o detalhe é tela empurrada.** Os quadros de CL5, S4 e N1 nesses devices **não têm barra de abas**. O topo é uma barra própria: botão de 40 px com `‹` (CL5, N1) ou `×` (S4), título centralizado quando o quadro tem (S4: nome do serviço e "alterações não salvas" em 12 px `#7A4E0A`) e, à direita, o botão `⋯` de 40 px. S4 tem o CTA "Salvar alterações" fixo no rodapé. Nenhum dos três tem eyebrow, título grande de página nem subtítulo.
4. **O app abre cada detalhe como página solta.** `/clientes/detalhes` renderiza `ProductCustomersScreen` no cenário `detail`, com `<header className="directory-page-header">` e o link "Voltar para clientes" (`features/customers/CustomerProfile.tsx`). `/servicos/editar` renderiza `ServiceForm` com `DirectoryHeader` (título, descrição e `back="/servicos"`). `/configuracoes/negocio` renderiza `ProductSettingsScreen` no cenário `business`, dentro de `SettingsPage`, com o link `.settings-back` e a eyebrow "Configurações" (`features/settings/shared/SettingsPage.tsx`). Em todos, a barra de abas continua embaixo; só a conversa aberta a esconde (`showBottomNav` em `ConversationThread.tsx`).
5. **Uma chamada de `useShellConfig` por árvore** (D-030, D-031). Hoje `CustomerList` e `CustomerProfile` chamam `useShellConfig` cada um, e `ServiceList` e `ServiceForm` também. Renderizar lista e detalhe juntos com essas chamadas quebra a invariante que `goal015-shell-invariant.test.tsx` prova.
6. **O gate autenticado já percorre lista → detalhe.** Os testes "reached by real click" clicam na linha semeada de `/clientes` e `/servicos` e esperam o caminho do detalhe; "a 45-minute service saves through the form" espera voltar a `/servicos` depois de salvar. O gate trabalha a 95–98% do limite de requisições do BFF (`e2e/authenticated-matrix.spec.ts`, comentário sobre `@fastify/rate-limit`).

O Developer confirma 1 a 4 com a própria execução de `npm run visual:compare -- --target CL5,Servicos:S4,Mais-Negocio:N1` na baseline, antes da primeira edição.

## Escolhas de desenho desta passada

**(a) Um padrão só, na casca.** Um componente compartilhado em `shared/layout/` monta a coluna da lista e o painel do detalhe. Os três módulos o usam; nenhum módulo cria o seu. A regra de largura e de faixa fica em `shared/styles/`, uma vez.

**(b) A faixa do lado a lado começa em 1024 px.** De 1024 px em diante: lista e detalhe lado a lado, com a barra inferior do tablet até 1099 px e a sidebar a partir de 1100 px, como em D-101. Abaixo de 1024 px: só uma das duas, a lista ou a tela empurrada. O protótipo só fixa que 768 empurra e 1024 divide; o valor 1024 coincide com uma largura do gate renderizado.

**(c) As rotas não mudam.** `/clientes`, `/clientes/novo`, `/clientes/detalhes`, `/clientes/detalhes/externo`, `/servicos`, `/servicos/novo`, `/servicos/editar` e `/configuracoes/*` continuam as mesmas, com os mesmos parâmetros (`id`, `aba`). Abrir um item continua sendo navegar para a rota do detalhe; de 1024 px em diante, a lista continua à esquerda, com o item aberto marcado (barra petróleo, como no quadro) e `aria-current="page"`.

**(d) Lista sem item aberto.** De 1024 px em diante, `/clientes` e `/servicos` mostram à direita o painel vazio do quadro ("Selecione um cliente para ver o perfil", "Selecione um serviço"). `/configuracoes` mostra à esquerda o cartão do negócio e os grupos, e à direita o Negócio, como M1, sem mudar de URL; o item Negócio fica marcado.

**(e) Tela empurrada abaixo de 1024 px.** Toda rota de detalhe, criação ou edição dos três módulos é empurrada: sem barra de abas, com a barra própria do quadro no topo (voltar com nome acessível, título quando o quadro tem, `⋯` só quando a tela já tem ações secundárias hoje) e, quando o quadro tem, o CTA fixo no rodapé. O que a tela tinha como "Voltar para …" passa a ser o botão de voltar da barra, com o mesmo destino. A casca ganha o campo em `ShellConfig` que diz "tela empurrada", na mesma chamada única de `useShellConfig`.

**(f) A lista em painel não se configura sozinha.** Quando a lista aparece ao lado de um detalhe, ela não chama `useShellConfig`: quem configura a casca é a tela da rota. Abaixo de 1024 px, o painel que não aparece não é montado e não busca dados, para não gastar o orçamento de requisições do gate (evidência 6) nem do produto.

**Divergências declaradas, que não contam como defeito na comparação:**

1. O `⋯` da barra empurrada quando a tela não tem ações secundárias hoje, por (e). Este Goal não cria ação nova.
2. Dados da conta de teste que não são layout, como já registrado em `e2e/visual/targets.json`, e o estado WhatsApp desconectado do cartão da IA (D-102).
3. As divergências de D-101 (Notificações na sidebar, indicador de início do iPhone).
4. O conteúdo próprio de CL1, S1 e M1 e das telas irmãs listadas no §2: é dos Goals 094, 095 e 097. Aqui só a composição em lista e detalhe e a tela empurrada precisam bater.

## Escopo obrigatório

### 1. CL5, S4 e N1 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`:

- CL5: `Clientes.dc.html` ("Cliente · resumo"), `Clientes-Tablet.dc.html` ("Clientes / Cliente · resumo / Portrait" e "… / Landscape"), `Clientes-Desktop.dc.html` ("… / Desktop");
- S4: `Servicos.dc.html` ("Editar serviço · opções"), `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html` ("Serviços / Editar serviço · opções / …");
- N1: `Mais-Negocio-Agenda-IA.dc.html` (quadro N1), `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html` ("Configurações / Configurações · Negócio / …").

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target CL5,Servicos:S4,Mais-Negocio:N1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. Para cada quadro e device, o relatório final traz o diff final e o que ainda difere, com o motivo.

### 2. As telas irmãs não pioram

O padrão aparece em todas as rotas dos três módulos. Rode `npm run visual:compare -- --target CL1,CL4,Servicos:S1,S3,Agenda:S1,M1,AG1,IA1,W1,R1,Mais-WhatsApp:C1` no início e no fim e cole o diff de cada device das duas execuções. Nenhuma tela pode quebrar. Toda piora de device tem causa medida no relatório, como no Goal087; a composição (lista e detalhe, tela empurrada) dessas telas deve seguir o quadro, e o conteúdo próprio delas fica fora deste Goal.

`/importacao`, Agenda, Conversas, Notificações e Home **não** mudam.

### 3. Comportamento preservado

- As rotas, os parâmetros `id` e `aba` e os destinos de "voltar" continuam (c).
- Salvar um serviço continua voltando a `/servicos`, e o gate "a 45-minute service saves through the form" continua passando sem mudança.
- Os testes "reached by real click" continuam passando sem mudança: o clique na linha semeada leva ao caminho do detalhe, em todas as larguras.
- **Uma chamada de `useShellConfig` por árvore renderizada** em toda rota dos três módulos, em todas as larguras (f).
- Os estados de carregando, erro, vazio e não encontrado de cada tela continuam, agora dentro do painel ou da tela empurrada.
- A barra inferior e a sidebar de D-101, o cartão da IA de D-102 e o banner da casca não mudam. G-1, G-2 e G-3 continuam passando sem mudança.
- A troca de rota continua anunciada pelo `RouteAnnouncer` (`aria-live`, `document.title`), também quando a lista fica na tela e só o painel do detalhe muda. Voltar pela barra empurrada leva ao mesmo destino de hoje.

### 4. Provas novas

`apps/frontend/tests/goal088-list-detail.test.tsx`, com dublês do `ProductRuntime` no padrão dos testes dos Goals 085 e 087:

1. De 1024 px em diante (`matchMedia` simulado, ou o mecanismo que o Developer escolher para (b)), `/clientes/detalhes`, `/servicos/editar` e `/configuracoes/negocio` renderizam a lista e o detalhe juntos, com o item aberto marcado com `aria-current="page"`.
2. De 1024 px em diante, `/clientes` e `/servicos` renderizam o painel vazio com o texto do quadro, e `/configuracoes` renderiza os grupos e o Negócio, com o item Negócio marcado.
3. Abaixo de 1024 px, as mesmas rotas de detalhe renderizam só a tela empurrada: barra própria com o botão de voltar (nome acessível e destino de hoje), nenhuma lista montada, e a casca recebe "tela empurrada" — a barra de abas não é renderizada.
4. Uma única chamada de `useShellConfig` por árvore em cada uma das rotas de (1) a (3), nas duas faixas, no padrão de `goal015-shell-invariant.test.tsx`.
5. Abaixo de 1024 px, nenhuma requisição de lista sai quando a rota é de detalhe.

As provas 1 a 5 **reprovam na baseline** (a 4 pode passar na baseline, porque lá a lista não é montada junto: ela é regressão, e o relatório diz isso). O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

**Medidas novas no gate autenticado**, em `e2e/authenticated-matrix.spec.ts`, como testes novos, sem mudar teste existente, `e2e/routes.ts`, `playwright.*.config.ts`, semente nem `scripts/`. O detalhe é alcançado por clique real na linha semeada, como nos testes "reached by real click":

- **G-4 (tela empurrada):** em `/clientes/detalhes` e `/servicos/editar`, nas larguras abaixo de 1024 px, nenhuma barra de abas está renderizada, o botão de voltar da barra empurrada está e tem alvo de toque de pelo menos 24 px, e, depois de rolar até o fim, o último elemento focável de `main` tem a caixa inteira acima do CTA fixo, quando houver.
- **G-5 (lado a lado):** nas mesmas rotas, de 1024 px em diante, a coluna da lista e o painel do detalhe estão renderizados lado a lado, sem sobreposição, com a largura da coluna do quadro (tolerância de 1 px), e o item aberto tem `aria-current="page"`.

As duas reprovam na baseline. Se o orçamento de requisições do gate não comportar G-4 e G-5 nas cinco larguras, o relatório mostra a contagem e reduz as rotas, não as larguras; nenhuma folga de limite é mexida.

### 5. Testes existentes

Continuam passando. Só muda asserção que dependa de: link "Voltar para …" no topo do detalhe, `DirectoryHeader` ou eyebrow nas telas empurradas, barra de abas nas rotas de detalhe, ou detalhe em largura cheia. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A tela empurrada volta a mostrar a barra de abas: a prova 3 reprova.
2. A lista em painel volta a chamar `useShellConfig`: a prova 4 reprova.
3. O detalhe deixa de montar a lista de 1024 px em diante: a prova 1 reprova.
4. A lista é montada (oculta) também abaixo de 1024 px: a prova 5 reprova.

### 7. O que só uma pessoa confere

- O lado a lado num tablet real em paisagem e num desktop com a janela redimensionada perto de 1024 px.
- A tela empurrada num celular real, com o teclado aberto no formulário de serviço e o CTA fixo.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

## Pontos de implementação

- `apps/frontend/src/shared/layout/`: o componente de lista e detalhe (a), o campo de tela empurrada em `ShellConfig.tsx` (e `sameConfig`), e a barra empurrada e a supressão da barra de abas em `AppShell.tsx`.
- `apps/frontend/src/app/(platform)/layout.tsx`, se o campo novo precisar ser repassado à casca.
- `apps/frontend/src/features/customers/`, `features/services/` e `features/settings/`: os componentes de topo passam a compor lista e detalhe pelo padrão; a lista ganha um modo de painel sem `useShellConfig` (f); `CustomerProfile`, `ServiceForm` e `SettingsPage` trocam o cabeçalho de página pela barra empurrada.
- `apps/frontend/src/shared/styles/`: a regra do lado a lado e da tela empurrada uma vez, mais o porte de CL5, S4 e N1 nas folhas dos módulos.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.
- `apps/frontend/e2e/authenticated-matrix.spec.ts` e, se preciso, `e2e/measure.ts`: G-4 e G-5, **só por acréscimo**.

## Fora do escopo

- O conteúdo próprio de CL1, CL4, CL6, CL7, S1, S3, M1 e das outras telas de Configurações (Goals 094, 095 e 097); os fluxos da Agenda (093) e Conversas (096), mesmo que venham a usar o padrão.
- R-08 (sublinhado na linha de lista) e R-09 (bloco curto da Semana), dirigidos aos Goals que portarem CL1 e A10.
- Ação nova no `⋯`, folha de pausa, ou qualquer comportamento que a tela não tenha hoje.
- Qualquer mudança em rota, contrato, BFF, serviços, `GET /v1/status`, `docs/design-reference/`, vault e `e2e/visual/targets.json` (CL5, S4 e N1 já estão mapeados; mude só se o alvo estiver errado, e explique no relatório).

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-103** em `PROPOSED`, no formato de D-101 e D-102. Ela diz (a) a (f), com o motivo de cada um, a largura e o limite escolhidos, as divergências declaradas e o "Revisar se" (o produto ganhar lista e detalhe em Conversas ou na Agenda; o protótipo mudar a faixa do lado a lado).
- [CURRENT_STATE](../CURRENT_STATE.md) registra o padrão, as rotas que o usam, que CL5, S4 e N1 seguem os quadros e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra G-4 e G-5 e a contagem do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso.

## Validação e ordem

1. Recontar a baseline; rodar `npm run visual:compare` dos três quadros e das telas irmãs do §2 na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target CL5,Servicos:S4,Mais-Negocio:N1`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`, e o `visual:compare` dos três quadros e das telas irmãs.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`: se ele falhar só por ambiente (bancos de teste não provisionados), os controles e os documentos seguem, e o relatório declara a falha e o motivo (observação 2 do [review085](../reviews/085-review.md)).

No relatório, para cada device de CL5, S4 e N1, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target CL5,Servicos:S4,Mais-Negocio:N1` e abriu os doze `side-by-side.png`. As três telas estão **iguais aos quadros CL5, S4 e N1 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das declaradas.
2. As telas irmãs do §2 não quebraram, e toda piora tem causa medida; a composição delas (lado a lado de 1024 px em diante, tela empurrada abaixo) segue o quadro.
3. As provas 1 a 5 passam e reprovaram na baseline (a 4 como regressão declarada), e os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. Largura, toque, contraste, foco e `prefers-reduced-motion` das telas tocadas são decididos pelo gate renderizado: `validate:ui` nas cinco larguras e o gate autenticado dentro de `validate:integration`, com os **205** testes da baseline mais G-4 e G-5, e **0** retentativas. O comportamento do §3 continua.
5. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
6. D-103 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §7 não foi feita.
7. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** o conteúdo próprio das telas irmãs; o padrão num aparelho real; Agenda e Conversas no padrão.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e comparação da baseline; padrão de lista e detalhe e tela empurrada na casca ((a), (b), (e), (f)); Clientes no padrão e CL5 portado |
| WU-02 | STANDARD | WU-01 | Serviços no padrão e S4 portado, com o CTA fixo |
| WU-03 | STANDARD | WU-02 | Configurações no padrão ((d) de M1) e N1 portado |
| WU-04 | STANDARD | WU-03 | Provas 1 a 5 com o vermelho da baseline; asserções do §5; G-4 e G-5 no gate autenticado, só por acréscimo |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-04 | lint de `apps/frontend` |
| WU-07 | DETERMINISTIC | WU-04 | testes dirigidos: `goal088-list-detail` |
| WU-08 | DETERMINISTIC | WU-05, WU-06, WU-07 | validate-core |
| WU-09 | DETERMINISTIC | WU-08 | gate-tests |
| WU-10 | DETERMINISTIC | WU-08 | validate-ui |
| WU-11 | DETERMINISTIC | WU-08 | validate-integration |
| WU-12 | STANDARD | WU-09, WU-10 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-13 | DETERMINISTIC | WU-12 | git-diff-check final |
