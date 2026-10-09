# Goal 150 — A lista de Clientes na medida do protótipo

**Status: READY.** Preparado em 2026-10-09 pelo Tech Lead Agent após [Goal149 ACCEPTED](../reviews/149-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL1, CL8, CL2, CL3, CL4, CL5, CL6, CL7, CL9, CL10

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v174**, inserida depois do 149, sem renumerar nem remover ID. Origem: a decisão 1 do [review149](../reviews/149-review.md) e a pendência 1 dele (o `line-height` da linha da lista, "um Goal próprio, que muda CL1, CL3 e CL8"), o item 8 (f) e (h) de D-163, o item 7.2 de D-162 (a busca de 46 contra 48 px) e a divergência 5 das `notes` do CL8, que o Goal149 tornou corrigível. Só o frontend e a captura; o BFF, a IA, o Scheduling, o contrato e o banco não mudam. Não há pergunta de produto: o quadro diz a medida.

## Baseline aceita

Baseline aceita: `8d4f63ea9118a91a5534c2fc6f950f6a6e1253d1`

Goal anterior: 149 — Quem agenda por quem na lista e na busca de Clientes igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal149 já integrado em `main` (origem `b9219356352da3de8c0537339f6f2db0ae987294`). Houve **duas rodadas**: a rodada 1 terminou em `PRE_REVIEW_INCOMPLETE` com 5 blockers (os controles (c) e (g) não reprovavam o teste nomeado, e por isso faltavam os registros); a rodada 2 os fechou sem mudar arquivo de produto. **D-163** foi aceita. A última contagem aceita (rodada 2, árvore `code-v1:aff7fb7b…60755`):

- frontend **212** arquivos e **3096** testes;
- `goal149` do frontend **30** em 2 arquivos;
- `scripts/tests/visual-responses.test.mjs` **79**;
- `test:gate` **312**;
- `validate:core` com saída 0;
- `validate:ui` **169** `passed`;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa.

O Developer roda, na baseline e **antes de editar**, a suíte do frontend e `scripts/tests/visual-responses.test.mjs`, e registra os números de partida, com o comando e a hora (lição 2).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **as linhas, a letra de cada grupo e o campo de busca da lista de Clientes têm a altura dos quadros nos quatro devices, onde quer que a lista apareça (sozinha, ao lado do perfil e ao lado do novo cliente), e a lista ao lado do perfil do CL8 mostra quem agenda por quem, como o quadro.**

**Por que agora.** O review149 aceitou como divergência declarada que as linhas da lista são 4 px mais altas que as do quadro. Somadas, elas e o respiro do celular levam o Pedro Souza para baixo da barra de abas no CL1 do celular: uma linha do quadro some da tela do app. A causa é conhecida e foi medida no próprio Goal149: a linha herda o `line-height` de 1,5 da casca, e o quadro usa o `normal`. O conserto foi desfeito no 149 só porque mexia no CL8, que lá era só regressão; o mesmo critério deixou a busca em 46 px no Goal148. Aqui a mudança em todos os quadros da lista é o objetivo. No mesmo passo, a lista ao lado do perfil do CL8 já pode mostrar "agenda para Pedro Souza" sob a Maria: o contrato da lista ganhou `guardian` e `dependents` no 149, e só a resposta fixa do CL8 ainda não os traz.

**Lições dos Goals 133 a 149, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte, e o ambiente pode não reproduzir mais os pixels da baseline aceita (review149, decisão 2). O Developer captura a baseline **três vezes** antes de editar, no mesmo ambiente em que vai capturar depois, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. A partida das suítes é medida **na baseline, antes da primeira edição**, e registrada com o comando e a hora.
3. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta. Antes de entregar, o Developer confere que cada controle reprova **o teste que este documento nomeia** (review149, rodada 1).
4. Os `side-by-side.png` de todos os alvos da linha "Quadros do protótipo" são abertos **nos quatro devices** e listados no relatório.
5. Cada controle de `targets.json` roda pelos **dois** testes: o `goal150` do alvo e `scripts/tests/visual-responses.test.mjs`.
6. As `notes` de cada alvo citam **todas** as divergências visíveis na captura; uma divergência que deixa de existir sai das `notes` no mesmo diff.
7. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente". A "execução final" é sempre a da última árvore.
8. Numa worktree limpa, rodar `npx prisma generate` em `apps/bff`, em `apps/ai-orchestrator` e em `apps/scheduling-service` antes de `test:gate`.
9. Uma causa que não foi medida é registrada como provável, com o que a sustenta (review148).

## O que a evidência desta passada mostra

Conferido no código da baseline `8d4f63e` e em `docs/design-reference/claude-design/prototype/project/Clientes.dc.html` (celular), `Clientes-Tablet.dc.html` (retrato e paisagem) e `Clientes-Desktop.dc.html`.

1. **Os quadros não declaram `line-height` no `body`** (o `<style>` dos três arquivos só tem `margin`, fundo e suavização), então a linha da lista usa o `normal`. A linha do quadro é `display:flex; align-items:center; gap:12px; padding:10px 20px` (celular), com o bloco do texto em `flex-direction:column; gap:2px`; o nome em 15 px e 600; a segunda linha em 13 px, `#716859`. A letra do grupo é `padding:12px 20px 4px; font-size:12px; font-weight:600; letter-spacing:.08em` (celular).
2. **O campo de busca do quadro** é `height:46px; border:1px solid #D6CEC2; padding:0 14px` sem `box-sizing`, nos três arquivos. Sem `box-sizing:border-box` (o quadro só o usa em 6 elementos, nenhum deles a busca), a caixa desenhada tem **48 px**, que é a medida registrada no item 7.2 de D-162 e no item 8 (h) de D-163.
3. **O app hoje** (`apps/frontend/src/shared/styles/avenly-customers.css`): `.customer-panel-item` e `.customer-panel-letter` não declaram `line-height` e herdam o de 1,5 da casca; só `.customer-search-results .customer-panel-item` usa `line-height: normal` (Goal121, por isso o CL3 já bate com o quadro). `.customer-panel-search .input` tem `min-height: 46px`; o campo da busca em andamento (`.customer-panel-searchbar.is-searching .input`) já tem 48 px.
4. **As medidas do Goal149** (D-163, item 8, e `notes` do CL1): linhas de 64 contra 60 px no celular e de 72 contra 68 px no tablet e no desktop; a segunda linha com 19,5 contra 17 px; a letra do grupo com 34 contra 32 px; o Pedro Souza cerca de 34 a 36 px abaixo do quadro fora do celular; a letra "A" do primeiro grupo 4 a 6 px abaixo do quadro, **com a causa não isolada**. O conserto ensaiado no 149 (`line-height: normal` em `.customer-panel-item` e `.customer-panel-letter`, `gap: 2px` em `.customer-panel-meta`) levou o CL1 em tablet em retrato a 0 px de diferença.
5. **Onde a mesma lista aparece:** `CustomerListPanelView` (`features/customers/CustomerList.tsx`) é a lista sozinha (CL1, CL2, CL3, CL9, CL10) e a coluna ao lado do perfil (CL5 a CL8, de 1024 px em diante) e do novo cliente (`CustomerForm.tsx`, CL4, de 1024 px em diante). As classes `.customer-panel-*` só são usadas em `features/customers/`.
6. **O CL8** (`apps/frontend/e2e/visual/targets.json`) responde `GET /v1/customers` com Pedro Souza (sem telefone) e Maria Souza (com telefone), **sem** `guardian` nem `dependents`. A divergência 5 das `notes` ainda diz que "a lista não traz de quem o cliente é responsável (Goal121)". Desde o Goal149, a linha mostra a relação quando a resposta a traz; os quadros de tablet e desktop do CL8 mostram "agenda para Pedro Souza" sob a Maria e "Maria Souza agenda por ele" sob o Pedro.
7. **O celular** tem duas diferenças fora da lista, já declaradas no CL1 (item 7 das `notes`): o app começa 20 px abaixo do quadro, porque o quadro reserva a barra de status do iPhone, e a barra de abas do app tem cerca de 64 px contra cerca de 97 px do quadro. Elas são da casca e da moldura do quadro, como o deslocamento de 14 px do CL8 (item 9 das `notes`), e não mudam aqui.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta as medidas da linha, da letra, do bloco da meta e da busca de cada arquivo de device do quadro (padding, gap, altura, `line-height` efetivo), sem inventar valor. Usa cada arquivo para o seu device.
2. **A linha e a letra.** `line-height: normal` em `.customer-panel-item` e em `.customer-panel-letter` (a regra de `.customer-search-results .customer-panel-item` fica redundante e sai), e o espaçamento interno do bloco da meta igual ao do quadro. Tudo escopado a `.customer-panel-*` em `avenly-customers.css`; nada muda na casca nem em `avenly.css`. A linha sem nome ("Cadastro sem nome · importado", "Nomear") e a linha de criação da busca seguem a mesma regra.
3. **A busca.** O campo de busca da lista parada passa a ter a altura desenhada do quadro, **48 px**, com borda e raio iguais; o ícone, o texto e o `placeholder` continuam centrados. O campo da busca em andamento (CL3) não muda.
4. **A letra "A" do primeiro grupo.** O Developer mede no DOM, no app e no quadro, nos quatro devices, o topo do título, o topo e a altura da busca, o topo da letra e o topo da primeira linha, e isola a causa dos 4 a 6 px. Se ela estiver em `.customer-panel-*`, porta o valor do quadro. Se estiver fora da lista (casca ou moldura do quadro), não a muda e a declara com a medida (lição 9).
5. **O CL8.** A resposta fixa de `GET /v1/customers` do CL8 dá à Maria Souza (`visual-compare-cl8-maria`) `dependents` com o Pedro Souza e ao Pedro (`visual-compare-cl8-pedro`) `guardian` com a Maria, com os tipos de `customerListItemSchema`. A divergência 5 sai das `notes`; as outras ficam como estão, salvo a medida que mudar.
6. **As `notes` do CL1.** Saem a divergência 6 (as linhas 4 px mais altas) e a 8 (a busca de 46 contra 48 px e a letra "A"), ou passam a dizer só o que restar, com a medida. As outras ficam.
7. **Os outros alvos.** CL2, CL3, CL4, CL5, CL6, CL7, CL9 e CL10 não mudam em `targets.json`; as `notes` deles só mudam se uma divergência citada deixar de existir ou passar a existir.
8. **O que não muda.** `CustomerList.tsx` só se uma classe faltar para o CSS (sem mudar texto, ordem, rótulo ou nome acessível); `CustomerProfile`, `CustomerForm`, `GuardianCard`, `PrimaryGuardianPanel`; o esqueleto do CL9 (`.customer-skeleton*`, D-162); a casca, a barra de abas e o respiro do celular; o BFF, a IA, o Scheduling, o contrato, `PUBLIC_API_V1.md`, o banco, a semente da captura e a do gate, `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts`.
9. **Divergências declaradas.** O Developer registra nas `notes` dos alvos e em D-164, com o motivo e a medida, toda diferença que restar.
10. **Decisão.** O Developer propõe **D-164**, por acréscimo, depois das provas, cobrindo as escolhas 2 a 9. A decisão diz quais itens de D-162 (7.2) e de D-163 (8 (f) e (h)) deixam de existir, e não edita D-162 nem D-163. Se o número já estiver tomado, o Developer usa o próximo livre e explica.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `shared/styles/avenly-customers.css`: as escolhas 2, 3 e 4, nos quatro devices, escopadas a `.customer-panel-*`.
2. `features/customers/CustomerList.tsx`: só se a escolha 8 permitir.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o CL8 (escolha 5) e as `notes` (escolhas 6 e 7).
2. `scripts/tests/visual-responses.test.mjs`: um teste do conteúdo do CL8 (a Maria com `dependents` Pedro Souza e o Pedro com `guardian` Maria Souza).

### 3. Provas

1. **Frontend**, em `apps/frontend/tests/goal150-*.test.ts` / `.test.tsx`:
   - as regras de `avenly-customers.css` (lidas do arquivo, como `goal148-lista-carregando.test.tsx`): `line-height: normal` em `.customer-panel-item` e em `.customer-panel-letter`; a altura da busca parada; o espaçamento da meta; nenhuma regra nova fora de `.customer-panel-*`;
   - `CustomerListPanel` com `guardian` e `dependents` mostra as duas linhas de relação, como a lista sozinha;
   - o alvo CL8 de `targets.json`: cada resposta válida contra o schema da rota no contrato, só `GET`, a Maria com `dependents` Pedro Souza e o Pedro com `guardian` Maria Souza; as `notes` do CL8 sem a divergência do Goal121.
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) sem `line-height: normal` em `.customer-panel-item` faz um teste `goal150` do frontend reprovar;
   - (b) a busca parada de volta a 46 px faz um teste `goal150` do frontend reprovar;
   - (c) a Maria do CL8 sem `dependents` faz reprovar o teste `goal150` do alvo **e** `visual-responses.test.mjs`;
   - (d) o Pedro do CL8 sem `guardian` faz reprovar o teste `goal150` do alvo **e** `visual-responses.test.mjs`.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `sha256sum -c` depois de reverter (lição 3).
3. **Fidelidade visual.**
   - `npm run visual:compare -- --target CL1,CL8,CL2,CL3,CL4,CL5,CL6,CL7,CL9,CL10`, numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 149.
   - **A captura de antes é da baseline `8d4f63e`, feita três vezes** no mesmo ambiente (lição 1), com os dez alvos. O Developer guarda os `app.png` fora do repositório e mede o ruído entre as três.
   - Depois das edições, os dez alvos são capturados **três vezes**. O CL3 deve ficar sem diferença fora do ruído (só a lista de busca e o campo em andamento aparecem nele). Para cada um dos outros nove, a tabela por imagem mostra o que mudou, e o Developer prova por medida que a mudança é só a da altura das linhas, da letra, da meta e da busca (e, no CL8, a segunda linha da relação), e que ela aproxima o app do quadro.
   - O Developer abre os `side-by-side.png` dos dez alvos nos quatro devices (lição 4) e lista no relatório as diferenças que restam e por quê.
   - **Medidas**, em cada device, no app e no quadro, com a diferença em px: no CL1, o topo do título, o topo e a altura da busca, o topo e a altura da letra de cada grupo e o topo e a altura de cada linha, até o Pedro Souza; no CL8, de 1024 px em diante, o topo e a altura das linhas da Maria e do Pedro e o texto da segunda linha de cada um; no celular, se a linha do Pedro Souza fica inteira acima da barra de abas, como no quadro. Uma diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.
   - Critério visual: **a lista igual ao quadro CL1 nos 4 devices** e **o perfil com a lista ao lado igual ao quadro CL8 nos 4 devices**, salvo as divergências declaradas; a lista de CL2, CL4, CL5, CL6, CL7, CL9 e CL10 com a altura das linhas, da letra e da busca do quadro, sem outra mudança; o CL3 sem diferença fora do ruído.
   - Largura, contraste, foco, alvo de toque e movimento reduzido são decididos pelo `validate:ui` (360, 390, 768, 1024 e 1440 px). A linha mais baixa não pode deixar a área de toque da linha abaixo de 24 px.

## Fora do escopo

- O respiro de 20 px do celular e a altura da barra de abas (casca e moldura do quadro); o "+" do painel carregando sem `canCreate`; o esqueleto do CL9.
- A borda dos cartões e a das ações (`--border` e `--border-strong`, abaixo de 3:1; review144, observação 4, e review147, pendência 2).
- Buscar pelo nome do dependente ou do responsável; a contagem da lista; o gênero e o tipo de relação no texto (pergunta 141); o perfil do responsável mostrar de quem ele é responsável; a IA propor responsável (D-022 (5)); o lembrete para o responsável (pergunta 135); serviço e duração no "Próximo"; o conserto retroativo do vínculo velho que aponta para um dependente.
- O `.min(1)` do `customerListPersonSchema` local do BFF (review149, pendência 2) e qualquer mudança no BFF, na IA, no Scheduling, no contrato ou no banco.
- Os dez quadros sem alvo (S1b, S5, S6, S8, S9, N2, N3, H6, NT3 e 4.3), que continuam com os motivos da v150 a v173; os esqueletos das outras telas e o `.skeleton` global.
- A conferência de `customerId` nas rotas internas do Scheduling e a série que não reconfere a pessoa na confirmação.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-164** em `PROPOSED`, conforme a escolha 10, com as medidas de antes e de depois.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal150.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal150. Ela traz as contagens da execução final de **todos** os gates que rodaram, a rodada e a árvore de cada número, as partidas medidas antes de editar, o ajuste das asserções existentes, o ruído das três capturas da baseline, a tabela por imagem, as medidas e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal150 na mesma rodada (lição 7). O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Antes de editar: as partidas (lição 2) e a captura da baseline `8d4f63e` três vezes (§3.3).
2. O CSS da linha, da letra, da meta e da busca (escolhas 2 a 4), com os testes do §3.1.
3. O CL8 e as `notes` (escolhas 5 a 7), com os testes de alvo.
4. O `visual:compare` dos dez alvos, as medidas e as três capturas; corrigir o que passar de 1 px.
5. Os controles negativos do §3.2, revertidos.
6. A execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - os testes `goal150` do frontend e a suíte do frontend;
   - `test:gate`, com o `prisma generate` dos três serviços já feito (lição 8);
   - `validate:core` e `validate:ui`;
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. As linhas, a letra de cada grupo e a busca parada da lista de Clientes têm a altura dos quadros nos quatro devices (`line-height: normal`, a busca com 48 px), na lista sozinha, ao lado do perfil e ao lado do novo cliente; a busca em andamento não muda; nada muda fora de `.customer-panel-*`.
2. No CL8, a lista ao lado do perfil mostra "agenda para Pedro Souza" sob a Maria e "Maria Souza agenda por esta pessoa" sob o Pedro; a divergência 5 sai das `notes`.
3. A lista igual ao quadro CL1 nos 4 devices e o perfil com a lista ao lado igual ao quadro CL8 nos 4 devices, salvo as divergências declaradas; no celular, a linha do Pedro Souza aparece inteira acima da barra de abas, como no quadro. Os `side-by-side.png` dos dez alvos foram abertos nos quatro devices e as medidas do §3.3 foram feitas. O CL3 sem diferença fora do ruído; CL2, CL4, CL5, CL6, CL7, CL9 e CL10 só com a mudança da altura, medida. Os dez alvos estáveis nas três capturas.
4. Largura (sem overflow horizontal em 360 a 1440 px), contraste, foco visível, alvo de toque e `prefers-reduced-motion` aprovados pelo `validate:ui`.
5. Os quatro controles negativos reprovaram o teste nomeado com a mensagem registrada e foram revertidos com `sha256sum -c` igual.
6. typecheck, lint, `goal150`, a suíte do frontend (com a partida medida antes de editar), `visual-responses.test.mjs`, `test:gate`, `validate:core` e `validate:ui` com saída 0 na árvore final. Nenhuma asserção existente afrouxada; um valor esperado ajustado (por exemplo, uma regra de CSS que um teste do Goal121, do 148 ou do 149 lia) é explicado no relatório, com o que a asserção provava e onde a prova continua.
7. D-164, CURRENT_STATE e VALIDATION_GATE escritos por acréscimo, com as contagens da execução final.

## Plano de execução

1. **WU-01 — A lista na medida do quadro.** As partidas e as três capturas da baseline, antes de editar. As escolhas 2 a 4 no CSS, com a medida da letra "A", e os testes `goal150` das regras e de `CustomerListPanel`.
2. **WU-02 — O CL8 e as `notes`.** As escolhas 5 a 7, com os testes do alvo nos dois arquivos.
3. **WU-03 — Fidelidade visual.** `visual:compare` dos dez alvos, as três capturas, os `side-by-side.png`, as medidas e as correções; as `notes` com o que restar.
4. **WU-04 — Os controles negativos.** (a) a (d), cada um revertido.
5. **WU-05 a WU-11 — Verificação determinística:** typecheck e lint do frontend; os testes `goal150`; a suíte do frontend; `test:gate`; `validate:core`; `validate:ui`.
6. **WU-12 — Registros.** D-164, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
7. **WU-13 — `git diff --check`.**
