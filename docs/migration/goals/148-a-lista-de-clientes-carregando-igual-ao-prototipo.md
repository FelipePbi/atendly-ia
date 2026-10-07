# Goal 148 — A lista de clientes carregando igual ao protótipo

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal147 ACCEPTED](../reviews/147-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL9, CL1, CL10

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v172**, inserida depois do 147, sem renumerar nem remover ID. Origem: o CL9 ("Clientes · carregando") é um dos 11 quadros ainda sem alvo. Ele fica fora desde a v150 por um motivo só de ferramenta: a captura espera `networkidle` e não fotografa uma leitura parada, e a v152 conferiu que `responses` não sabe segurar uma resposta (`scripts/lib/visual-responses.mjs` só aceita `method`, `path`, `json` e `status`). Os outros dez quadros sem alvo pedem decisão de produto, contrato ou sinal que não existe (v150 a v171). O CL1 e o CL10 entram como regressão: são a mesma rota `/clientes`, e o CL10 usa as mesmas respostas fixas.

## Baseline aceita

Baseline aceita: `60b239df406a0f7558fe0c40a640519bacd31709`

Goal anterior: 147 — A conversa do responsável e as ações do perfil iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal147 já integrado em `main` (origem `52f0d2a368c60da62df462d6d4762284d296d128`). Houve **duas rodadas**: a rodada 1 terminou com 2 blockers de ícone (`chat` e `calendar` no lugar de `nav-chat` e `nav-calendar`), e a rodada 2 os fechou. **D-161** foi aceita. A última contagem aceita:

- frontend **208** arquivos e **3046** testes — Goal147;
- `goal147` **29** em 2 arquivos — Goal147;
- `scripts/tests/visual-responses.test.mjs` **65** — Goal144 (o Goal147 não mudou o arquivo);
- `test:gate` **298** — Goal147;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal147;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal147;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal147.

O Developer roda a suíte do frontend e `scripts/tests/visual-responses.test.mjs` na baseline **antes de editar** e registra os números de partida, com o comando e a hora (lição 2).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a lista de Clientes carregando fica igual ao quadro CL9 nos quatro devices, com título e busca já visíveis e o esqueleto na forma das linhas do quadro; e a captura passa a fotografar uma leitura parada, sem mudar a captura dos alvos que não pedem isso.**

**Por que agora.** É o único quadro sem alvo que não depende de decisão de produto. O app já tem estado de carregamento na lista (`CustomerListSkeleton`), mas ele nunca foi comparado com o quadro: a captura não chega nele. A ferramenta nova (a resposta retida) também serve, depois, a outros estados de carregamento do protótipo.

**Lições dos Goals 133 a 147, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. A partida das suítes é medida **na baseline, antes da primeira edição**, e registrada com o comando e a hora.
3. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
4. Os `side-by-side.png` de CL9, CL1 e CL10 são abertos **nos quatro devices**, todos, e listados no relatório (review147, "Aceito sem prova completa" 6). As medidas do §3.5 são feitas em todos os devices, no app e no quadro.
5. Cada controle de `targets.json` roda pelos **dois** testes: o `goal148` e `scripts/tests/visual-responses.test.mjs`.
6. As `notes` do alvo citam **todas** as divergências visíveis na captura, inclusive as da casca e as de cor de título (`avenly.css` dá `color: var(--fg)` a todo `h2`; review135, blocker 1).
7. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente". Se uma correção posterior muda os números, o registro é atualizado na mesma rodada (review147, blocker de documentação da rodada 2).
8. Numa worktree limpa, rodar `npx prisma generate` em `apps/bff` e em `apps/ai-orchestrator` antes de `test:gate` e da suíte que varre a árvore (review146, DIAG-001).
9. O ícone é o glifo do quadro: comparar o `path` do SVG do quadro com o símbolo do sprite antes de escolher (review147, blockers 1 e 2).

## O que a evidência desta passada mostra

Conferido no código da baseline `60b239d` e em `docs/design-reference/claude-design/prototype/project/Clientes.dc.html` (mobile), `Clientes-Tablet.dc.html` (retrato e paisagem) e `Clientes-Desktop.dc.html`.

1. **O quadro CL9** (`data-screen-label` "Clientes · carregando"; no tablet e no desktop, "Clientes / Clientes · carregando / <device>"). A legenda diz: "Esqueleto com o brilho do sistema, na forma exata das linhas que virão. Título e busca já aparecem — a tela nunca fica em branco."
   - **Mobile:** o título "Clientes" (`padding:66px 20px 0`, Literata 26 px, peso 500); a busca (`padding:14px 20px 0`; campo de 46 px, raio 14, borda `#D6CEC2`, fundo `#FFFDFA`, ícone de lupa de 18 px, "Buscar por nome ou telefone" em 15 px `#716859`); e quatro linhas de esqueleto (`padding:22px 20px 0`, `gap:22px`). Cada linha tem um círculo de 40 px, uma barra de 12 px com raio 6 e outra de 10 px com raio 5 (`gap:8px`). As larguras das barras são 45 % e 60 %, 55 % e 50 %, 40 % e 62 %, 50 % e 56 %. O brilho é `linear-gradient(90deg,#EFEAE2 25%,#F7F4EF 50%,#EFEAE2 75%)`, `background-size:200% 100%`, `animation:at-shimmer 1.6s linear infinite`. Não há contagem nem aviso.
   - **Desktop:** o painel de lista de 380 px tem o título, o botão "+" de 40 px (`#0F5F63`), a busca e as mesmas quatro linhas; o painel de detalhe fica vazio (o `span` do texto não tem conteúdo).
   - No tablet, o Developer lê os valores de cada arquivo para o seu device, sem deduzi-los do mobile ou do desktop.
2. **O app hoje** (`apps/frontend/src/features/customers/CustomerList.tsx`):
   - `CustomerListPanelView` mostra o cabeçalho com o título durante o carregamento, mas a busca (`customer-panel-searchbar`) só aparece depois que a lista chega: o ramo `loading` mostra só `CustomerListSkeleton`;
   - `CustomerListSkeleton` tem quatro linhas iguais (`Skeleton` "avatar", `skeleton-title` de 18 px e 48 % e `skeleton-line` de 12 px e 55 %), com o `.skeleton` global de `avenly.css` (gradiente de `--surface-interactive` e `--surface-secondary`, `shimmer 1.35s`) e o texto `sr-only` "Carregando clientes" com `role="status"`;
   - no layout largo, `CustomerList` usa `ListDetailLayout` com "Selecione um cliente para ver o perfil" no detalhe, também durante o carregamento;
   - `useShellConfig` recebe `loading` e mostra a ação "+" do mobile quando `canCreate && !wide && !emptyList && !searching`, o que já vale durante o carregamento;
   - `CustomerListPanel` (o painel de lista das rotas de detalhe e criação) usa o mesmo `CustomerListPanelView`.
3. **A captura** (`scripts/visual-compare.mjs`): `captureApp` abre a rota com `waitUntil: "networkidle"`, e `runSteps` espera `networkidle` depois de cada passo. Um pedido que nunca termina impede o `networkidle`, então a captura de hoje não chega a um estado de carregamento. As respostas fixas (`scripts/lib/visual-responses.mjs`) são `route.fulfill` imediato; `validateResponses` recusa campo desconhecido.
4. **Os testes que citam o que muda.** `scripts/tests/visual-responses.test.mjs`, na linha 205, fixa a lista exata dos alvos que declaram `responses` e exige `entry.json.requestId` em toda entrada. Nenhum teste do frontend cita "Carregando clientes" nem `customer-list-loading-copy`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do CL9: os valores inline de px, cor, fonte, raio, espaçamento e o brilho, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device.
2. **A resposta retida.** Uma entrada de `responses` pode ser `{ "method": "GET", "path": "/v1/...", "hold": true }`.
   - Só `GET`, só `hold: true`, e sem `json` nem `status`. `validateResponses` recusa, com erro que nomeia o alvo e o item: `hold` com outro valor, `hold` com `json` ou `status`, `hold` com outro método, e entrada sem `json` e sem `hold`. A validação das entradas sem `hold` não muda.
   - Na captura, o pedido que casa com uma entrada retida fica pendente até o fim da captura, sem resposta e sem seguir para o BFF. Nada é gravado.
   - Um alvo com entrada retida precisa ter um passo `waitFor` que espera um texto do estado do quadro. `validateResponses`, ou a validação dos alvos ao lado dela, recusa o alvo sem esse passo.
3. **A espera da captura.** Para um alvo **com** entrada retida, `captureApp` abre a rota com `waitUntil: "load"`. Em seguida, e depois de cada passo, espera a rede ociosa ignorando os pedidos retidos: nenhum pedido não retido em andamento por 500 ms, com limite de tempo e erro que nomeia o alvo. Para um alvo **sem** entrada retida, a captura é exatamente a de hoje (`networkidle` na abertura e depois de cada passo). O protótipo não muda.
4. **O alvo CL9.** Em `apps/frontend/e2e/visual/targets.json`, um alvo novo `CL9`, `Clientes.dc.html`, "Clientes · carregando", rota `/clientes`:
   - `GET /v1/status` fixo com WhatsApp conectado, igual ao do CL10 (tira o aviso da casca, que é estado da conta de teste);
   - `GET /v1/customers` retido;
   - um passo `waitFor` com o texto do estado de carregamento;
   - `notes` com todas as divergências visíveis (lição 6) e a explicação de que a leitura fica retida só no navegador da captura.
   Nenhum outro alvo muda. Se outra leitura da tela (por exemplo, o calendário de `businessTimezone`) também precisar ficar parada para o estado do quadro, o Developer a retém no mesmo alvo e explica nas `notes`.
5. **A lista carregando.**
   - O título e a busca aparecem durante o carregamento, nas posições do quadro, como o CL9 mostra. A busca é o mesmo campo da lista carregada, com o mesmo rótulo e o mesmo `placeholder`, e aceita texto: o que a pessoa digitar vale quando a lista chegar. Durante o carregamento não aparece "Nenhum resultado".
   - O esqueleto tem as quatro linhas do quadro, com o círculo, as duas barras, as alturas, os raios, as larguras e o `gap` de cada device. O brilho tem as cores, o tamanho e a duração do quadro, escopado à lista de clientes. O `.skeleton` global de `avenly.css` e os esqueletos das outras telas não mudam. Se houver token equivalente às cores do quadro, o Developer usa o token e registra o valor computado.
   - Com `prefers-reduced-motion: reduce`, o brilho fica parado.
   - O texto `sr-only` com `role="status"` ("Carregando clientes") continua, e o esqueleto continua `aria-hidden`.
   - Nos devices largos, o painel de detalhe durante o carregamento segue o quadro (vazio). O botão "+" e a ação "+" da casca seguem o quadro de cada device durante o carregamento; se seguir o quadro exigir mudar a regra de `useShellConfig`, a mudança vale só para o estado de carregamento.
   - O erro (CL10), o vazio (CL2), a busca (CL3) e a lista carregada (CL1) não mudam. O painel de lista das rotas de detalhe (`CustomerListPanel`) recebe o mesmo carregamento, porque usa o mesmo componente.
6. **O que não muda.** `CustomerProfile`, `CustomerForm`, `data/services/`, `shared/ui/` (fora de leitura), `avenly.css` (fora de leitura de token), o contrato, o BFF, a IA, o Scheduling, o banco, a semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`), `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts`.
7. **Divergências declaradas.** O Developer registra nas `notes` do CL9 e em D-162, com o motivo, toda diferença que restar. Se o FREEZE_CSS da captura deixar o brilho do app e o do quadro em pontos diferentes da animação, isso é uma divergência da captura, não do CSS: ele mede as cores do repouso no app e no quadro e a registra.
8. **Decisão.** O Developer propõe **D-162**, por acréscimo, depois das provas, cobrindo as escolhas 2 a 7: a resposta retida e a espera da captura, o alvo CL9, a lista carregando e as divergências. A decisão diz que o CL9 deixa de estar sem alvo e que restam 10 quadros sem alvo. Se o número já estiver tomado, o Developer usa o próximo livre e explica.

## Escopo obrigatório

### 1. A captura

1. `scripts/lib/visual-responses.mjs`: a entrada retida e as recusas (escolha 2), mais uma função que diz se um pedido casa com uma entrada retida.
2. `scripts/visual-compare.mjs`: o pedido retido e a espera da escolha 3, só para alvo com entrada retida.
3. `apps/frontend/e2e/visual/targets.json`: o alvo CL9 (escolha 4).
4. `scripts/tests/visual-responses.test.mjs`: o CL9 na lista da linha 205, a regra de `requestId` só para entradas com `json`, e os testes da entrada retida.

### 2. O frontend (`apps/frontend/src`)

1. `features/customers/CustomerList.tsx`: o título e a busca durante o carregamento e o esqueleto do quadro (escolha 5).
2. `shared/styles/avenly-customers.css`: o esqueleto e o brilho da lista nos quatro devices, escopados à lista de clientes.

### 3. Provas

1. **Testes da captura** em `scripts/tests/visual-responses.test.mjs`:
   - `validateResponses` aceita `{ method: "GET", path, hold: true }` e recusa cada caso da escolha 2, com a mensagem que nomeia o alvo e o item;
   - o alvo com entrada retida e sem passo `waitFor` é recusado;
   - a função de casamento acha a entrada retida pelo método e pelo caminho exato, sem a query, e não acha uma entrada com `json`;
   - o CL9 é o único alvo com entrada retida, retém só `GET /v1/customers` (e o que a escolha 4 justificar), tem o `GET /v1/status` conectado e o passo `waitFor`, e nenhuma entrada dele tem método diferente de `GET`.
2. **Testes novos do frontend** em `apps/frontend/tests/goal148-*.test.tsx` / `.test.ts`:
   - com a leitura de clientes pendente: o título "Clientes", o campo de busca com o rótulo e o `placeholder` de hoje, as quatro linhas do esqueleto `aria-hidden`, o `role="status"` "Carregando clientes", e nem contagem nem "Nenhum resultado";
   - o texto digitado durante o carregamento filtra a lista quando ela chega;
   - quando a lista chega, o esqueleto e o status somem, e a lista, a contagem e a busca ficam como hoje;
   - o erro (CL10) e o vazio (CL2) continuam iguais, sem a busca do carregamento;
   - o `CustomerListPanel` mostra o mesmo carregamento;
   - o alvo CL9 de `targets.json`: o `GET /v1/status` válido contra o schema do contrato, `GET /v1/customers` retido, só `GET` e o passo `waitFor` com um texto que o estado de carregamento mostra.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a busca escondida de novo durante o carregamento faz um teste `goal148` reprovar;
   - (b) o esqueleto com três linhas faz um teste `goal148` reprovar;
   - (c) uma entrada `{ "method": "GET", "path": "/v1/customers", "hold": true, "json": {} }` faz `visual-responses.test.mjs` reprovar;
   - (d) o CL9 sem o passo `waitFor` faz reprovar `visual-responses.test.mjs` **e** o teste `goal148` do alvo;
   - (e) uma entrada retida com `"method": "POST"` no CL9 faz reprovar os dois testes;
   - (f) o CL9 retendo `GET /v1/status` em vez de `GET /v1/customers` faz reprovar os dois testes.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 3).
4. Os testes existentes continuam passando. A única asserção existente que pode mudar é a da linha 205 de `visual-responses.test.mjs` (a lista de alvos com `responses` ganha o CL9, e `requestId` passa a ser exigido só de entrada com `json`). O relatório diz o que a asserção provava e onde a prova continua.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target CL9,CL1,CL10` e, para regressão da captura, `--target CL2,CL3,CL8`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 147.
   - **A captura de antes é da baseline `60b239d`, feita três vezes** (lição 1), com CL1, CL2, CL3, CL8 e CL10 (o CL9 não existe na baseline). O Developer guarda os `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que esses alvos não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido, na tabela por imagem. A mudança da captura não pode mudar a imagem de nenhum alvo sem entrada retida.
   - O CL9 é capturado **três vezes** depois das edições, para provar que o estado retido é estável entre capturas.
   - O Developer abre os `side-by-side.png` de CL9, CL1 e CL10 nos quatro devices (lição 4) e lista no relatório as diferenças que restam e por quê.
   - **Medidas**, em cada device, no app e no quadro, com a diferença em px: o topo do título; o topo, a altura, o raio e a borda da busca; o topo da primeira linha do esqueleto e o `gap` entre as linhas; o diâmetro do círculo; a altura, o raio e a largura de cada barra; e as cores computadas do esqueleto em repouso. Uma diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.
   - Critério visual: **a lista carregando igual ao quadro CL9 nos 4 devices**, salvo as divergências declaradas; **CL1 e CL10 iguais aos quadros CL1 e CL10 nos 4 devices**, sem diferença fora do ruído contra a baseline; CL2, CL3 e CL8 sem diferença fora do ruído.
   - Largura, contraste, foco, alvo de toque e movimento reduzido são decididos pelo `validate:ui` (360, 390, 768, 1024 e 1440 px).

## Fora do escopo

- Qualquer mudança no BFF, na IA, no Scheduling, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou nas sementes da captura e do gate.
- Os esqueletos das outras telas e o `.skeleton` global; os outros dez quadros sem alvo (S1b, S5, S6, S8, S9, N2, N3, H6, NT3 e 4.3), que continuam com os motivos da v150 a v171.
- A borda dos cartões e a das ações (`--border` e `--border-strong`, abaixo de 3:1; review144, observação 4, e review147, pendência 2).
- O conserto retroativo do vínculo velho que aponta para um dependente; o perfil do responsável mostrar de quem ele é responsável; "agenda para <dependente>" na lista e na busca; o tipo de relação (pergunta 141) e o gênero na nota; a IA propor responsável (D-022 (5)); o lembrete para o responsável (pergunta 135); serviço e duração no "Próximo".
- O flaky da rodada 1 do Goal147 em `mobile-390 › servicos > measured, logged in`: se reaparecer, registrar à parte, sem mexer em `/servicos`.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-162** em `PROPOSED`, conforme a escolha 8. Inclui o contraste calculado do texto da busca (`placeholder`) sobre o fundo do campo e as cores computadas do esqueleto.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal148.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal148. Ela traz as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas. Traz também a rodada de cada número, as partidas medidas antes de editar, o ajuste da asserção existente, a tabela por imagem, as três capturas do CL9, as medidas e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal148 na mesma rodada (lição 7). O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Antes de editar: rodar a suíte do frontend e `visual-responses.test.mjs` na baseline (lição 2) e capturar a baseline `60b239d` três vezes (§3.5).
2. Implementar a resposta retida e a espera da captura (escolhas 2 e 3), com os testes do §3.1.
3. Acrescentar o alvo CL9 (escolha 4) e rodar `visual:compare -- --target CL9` contra o app de hoje, para ver o estado de partida.
4. Portar a lista carregando (escolha 5), com os testes do §3.2.
5. Rodar o `visual:compare`, as medidas e as três capturas do CL9, e corrigir o que passar de 1 px.
6. Rodar os controles negativos do §3.3 e revertê-los.
7. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - os testes `goal148` e a suíte do frontend;
   - `scripts/tests/visual-responses.test.mjs` e `test:gate`, com o `prisma generate` do BFF e da IA já feito (lição 8);
   - `validate:core`, `validate:ui` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A lista de Clientes carregando mostra o título e a busca, e o esqueleto na forma das linhas do quadro. O texto digitado durante o carregamento vale quando a lista chega. O status acessível "Carregando clientes" continua. O erro, o vazio, a busca e a lista carregada não mudam.
2. A lista carregando igual ao quadro CL9 nos 4 devices, salvo as divergências declaradas. CL1 e CL10 iguais aos quadros CL1 e CL10 nos 4 devices. Os `side-by-side.png` de CL9, CL1 e CL10 foram abertos nos quatro devices, e as medidas do §3.5 foram feitas. CL1, CL2, CL3, CL8 e CL10 sem diferença fora do ruído da baseline. O CL9 estável nas três capturas.
3. A captura aceita a resposta retida só como `GET`, sem `json` nem `status`, e só em alvo com passo `waitFor`. Os alvos sem entrada retida são capturados como antes.
4. Largura (sem overflow horizontal em 360 a 1440 px), contraste, foco visível, alvo de toque e `prefers-reduced-motion` aprovados pelo `validate:ui`.
5. Os seis controles negativos reprovaram com a mensagem registrada e foram revertidos com `cmp` igual.
6. typecheck, lint, `goal148`, a suíte do frontend (com a partida medida antes de editar), `visual-responses.test.mjs`, `test:gate`, `validate:core`, `validate:ui` e `validate:integration` com saída 0. Nenhuma asserção existente afrouxada além do ajuste do §3.4. O BFF, a IA, o Scheduling, o contrato e o banco intocados.
7. D-162, CURRENT_STATE e VALIDATION_GATE escritos por acréscimo, com as contagens da execução final.

## Plano de execução

1. **WU-01 — A resposta retida na captura.** As partidas e as três capturas da baseline, antes de editar. As escolhas 2 e 3 em `visual-responses.mjs` e `visual-compare.mjs`, com os testes do §3.1 que não dependem do alvo.
2. **WU-02 — A lista carregando.** A escolha 5 em `CustomerList.tsx` e `avenly-customers.css`, com os testes `goal148` do componente.
3. **WU-03 — O alvo CL9.** A escolha 4 em `targets.json`, o ajuste da linha 205 e os testes do alvo nos dois arquivos.
4. **WU-04 — Fidelidade visual.** `visual:compare` de CL9, CL1 e CL10 e da regressão; as três capturas do CL9; os `side-by-side.png`, as medidas e as correções; as `notes` com todas as divergências.
5. **WU-05 — Os controles negativos.** (a) a (f), cada um revertido.
6. **WU-06 a WU-13 — Verificação determinística:** typecheck e lint do frontend; os testes alvo `goal148`; a suíte do frontend; `test:gate` (inclui `visual-responses.test.mjs`); `validate:core`; `validate:ui`; `validate:integration`.
7. **WU-14 — Registros.** D-162, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
8. **WU-15 — `git diff --check`.**
