# Goal 149 — Quem agenda por quem na lista e na busca de Clientes igual ao protótipo

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal148 ACCEPTED](../reviews/148-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Quadros do protótipo: CL1, CL3

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v173**, inserida depois do 148, sem renumerar nem remover ID. Origem: a divergência 4 de D-112 ("Maria Souza agenda por ele" ausente do CL1, porque a resposta da lista não traz o responsável) e a divergência do Goal121 no CL3 ("agenda para Pedro Souza" sob Maria Souza), que D-135 manda rever quando "o contrato da lista passar a trazer o responsável". Desde os Goals 139 a 147 o responsável confirmado existe de ponta a ponta (Scheduling, IA, perfil e CL8); só a lista e a busca ainda não sabem quem agenda por quem. O quadro diz o que mostrar, então não há pergunta de produto. CL2, CL8, CL9 e CL10 entram só como regressão.

## Baseline aceita

Baseline aceita: `d3093fe91c126c1cc7dd350d01f992849d66ffa2`

Goal anterior: 148 — A lista de clientes carregando igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal148 já integrado em `main` (origem `5e3708b7c59e645921089cf94482dc7954149605`). Houve **duas rodadas**: a rodada 1 terminou com 3 blockers (uma linha de 2 px abaixo do esqueleto no celular e no tablet em retrato, a barra de abas fora das `notes` do CL9 e o "+" empilhado sem decisão); a rodada 2 os fechou. **D-162** foi aceita. A última contagem aceita:

- frontend **210** arquivos e **3066** testes — Goal148, rodada 2;
- `goal148` **20** em 2 arquivos — Goal148;
- `scripts/tests/visual-responses.test.mjs` **78** — Goal148;
- `test:gate` **311** — Goal148;
- `validate:ui` **169** `passed` — Goal148, rodada 2;
- `validate:core` com saída 0 — Goal148, rodada 2;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal148, **rodada 1** (na rodada 2 o IA Loop não provisionou os bancos de teste, e o review148 aceitou sem essa prova na árvore final). Este Goal muda o Scheduling e o BFF, então o `validate:integration` é obrigatório na árvore final.

O Developer roda, na baseline e **antes de editar**, a suíte do frontend, `scripts/tests/visual-responses.test.mjs` e as suítes de unidade do Scheduling e do BFF, e registra os números de partida, com o comando e a hora (lição 2).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **na lista e na busca de Clientes, o cliente sem telefone próprio mostra quem agenda por ele, e o responsável mostra para quem agenda, como os quadros CL1 e CL3 nos quatro devices; a lista do Scheduling traz essas relações confirmadas numa só consulta para a lista inteira, e o contrato público as declara.**

**Por que agora.** É o último item sem ID da linha do responsável que tem quadro e não pede decisão de produto. Hoje, na lista, o Pedro (sem telefone, com a Maria como responsável confirmada) aparece como "Telefone não informado", e a Maria aparece só com o telefone. O profissional só descobre a relação abrindo o perfil. Os outros itens da linha do responsável (o tipo de relação, o gênero, a IA propor responsável, o perfil do responsável listar os dependentes) pedem campo, decisão ou quadro que não existem.

**Lições dos Goals 133 a 148, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. A partida das suítes é medida **na baseline, antes da primeira edição**, e registrada com o comando e a hora.
3. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
4. Os `side-by-side.png` de CL1 e CL3 são abertos **nos quatro devices**, todos, e listados no relatório. As medidas do §3.6 são feitas em todos os devices, no app e no quadro.
5. Cada controle de `targets.json` roda pelos **dois** testes: o `goal149` do alvo e `scripts/tests/visual-responses.test.mjs`.
6. As `notes` de cada alvo citam **todas** as divergências visíveis na captura, inclusive as da casca e as de cor de título.
7. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente". Se uma correção posterior muda os números, o registro é atualizado na mesma rodada; a "execução final" é sempre a da última árvore (review147 e review148, blockers de documentação).
8. Numa worktree limpa, rodar `npx prisma generate` em `apps/bff`, em `apps/ai-orchestrator` e em `apps/scheduling-service` antes de `test:gate` e da suíte que varre a árvore (review146, DIAG-001).
9. Uma causa que não foi medida é registrada como provável, com o que a sustenta (review148, correção adiada 2).
10. Um objeto `z.object` sem `.strict()` **descarta** campo que não declara. Um campo novo que atravessa o BFF precisa estar no schema do cliente do Scheduling no BFF, ou some antes de chegar à tela.

## O que a evidência desta passada mostra

Conferido no código da baseline `d3093fe` e em `docs/design-reference/claude-design/prototype/project/Clientes.dc.html` (mobile), `Clientes-Tablet.dc.html` (retrato e paisagem) e `Clientes-Desktop.dc.html`.

1. **O quadro CL1** ("Clientes · lista") mostra, entre as linhas, "Pedro Souza" com a segunda linha "Maria Souza agenda por ele" (no lugar do telefone) e "próximo sáb 10:00" à direita, e logo depois o cadastro sem nome "+55 11 97654-3210", "Cadastro sem nome · importado" e "Nomear". A legenda diz: "Cliente sem telefone mostra quem agenda por ele; cadastro importado sem nome pede um nome." O texto "agenda por ele" está nos três arquivos (mobile, tablet e desktop).
2. **O quadro CL3** ("Clientes · busca") mostra, buscando "mar", "Maria Souza" com a segunda linha "agenda para Pedro Souza" (no lugar do telefone) e "há 5 dias" à direita.
3. **O app hoje** (`apps/frontend/src/features/customers/CustomerList.tsx`, `CustomerPanelItem`): a linha com nome mostra o telefone formatado ou "Telefone não informado"; a linha sem nome mostra o telefone e "Cadastro sem nome · importado" e "Nomear". Nada da relação aparece na lista. O perfil (`CustomerProfile.tsx`) já trata o cliente `dependent` (responsável `CONFIRMED` e sem telefone próprio) desde o Goal144.
4. **O contrato** (`packages/public-api-contract/src/schemas.ts`): `customerListSchema.items` é `z.array(customerSchema)`, com `id`, `name`, `phone`, `createdAt`, `updatedAt`, `nextAppointment` e `lastAppointment`. Só `customerDetailSchema` traz `primaryGuardian` (o objeto da relação, com status, quem propôs e quem confirmou).
5. **O Scheduling** (`apps/scheduling-service/src/modules/customers/avenly-customer-service.ts`, `list`): com `timezone`, calcula o próximo e o último atendimento **numa consulta para a lista inteira** (`nextAppointmentsByCustomer` e `lastAppointmentsByCustomer`), nunca uma por cliente. A rota `GET /internal/customers` (`internal-api/routes.ts`) serve a lista do BFF e, com `phone`, os candidatos do número para a IA (`findCustomerCandidatesByPhone`), pelo mesmo `list`, e monta cada item com `customerDto`. `CustomerRelation` tem `customerId` (quem é atendido), `relatedCustomerId` (o responsável), `type` `PRIMARY_GUARDIAN`, `status` `PROPOSED` ou `CONFIRMED`, e é única por `(tenantId, customerId, type)`.
6. **O BFF** (`apps/bff/src/clients/scheduling/index.ts`, `listCustomers`) valida a resposta com um `customerSchema` **local**, sem `.strict()`, que descarta campo não declarado (lição 10). `GET /v1/customers` (`modules/customers/routes.ts`) devolve o resultado com `source`. O guard de contrato do Goal036 reprova campo que o contrato público não declara.
7. **A captura:** o CL1 de `targets.json` usa a conta semeada (`scripts/lib/visual-seed.mjs`), que não tem cliente sem telefone, responsável nem cadastro sem nome; por isso D-112 declarou a divergência 4. O CL3 já usa `responses` fixas, com Marina Costa, Marcos Vieira, Maria Souza e Beatriz Lima, e as `notes` declaram a divergência do Goal121. `resolveRelativeDays` (`scripts/lib/visual-responses.mjs`) só aceita `{today}` e `{today-N}`; não há data futura relativa.
8. **A IA** lê `GET /internal/customers?phone=` com o seu próprio `customerListSchema`, também sem `.strict()`: campos novos são descartados e nada muda nela.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS das linhas do CL1 e do CL3: a fonte, o tamanho, a cor e o espaçamento da segunda linha de cada arquivo de device. Usa cada arquivo para o seu device.
2. **O contrato da lista.** Em `packages/public-api-contract/src/schemas.ts`:
   - um `customerListPersonSchema` = `{ id: string (min 1), name: string | null }`;
   - um `customerListItemSchema` = `customerSchema.extend({ guardian: customerListPersonSchema.nullable().optional(), dependents: z.array(customerListPersonSchema).optional() })`;
   - `customerListSchema.items` passa a ser `z.array(customerListItemSchema)`.
   `guardian` é o responsável principal `CONFIRMED` do cliente; `dependents` são os clientes de quem ele é responsável principal `CONFIRMED`, em ordem de nome (sem nome por último) e depois de `id`. Os campos são opcionais no schema: a resposta antiga continua válida. `customerSchema`, `customerDetailSchema` e as respostas de criação e edição **não mudam**. `apps/bff/PUBLIC_API_V1.md` documenta os dois campos em `GET /v1/customers`.
3. **O Scheduling.** Em `AvenlyCustomerService.list`, no mesmo ramo que já calcula o próximo e o último atendimento (com `timezone`):
   - **uma** consulta a `customerRelation` para a lista inteira, com `tenantId` do serviço, `type: PRIMARY_GUARDIAN`, `status: CONFIRMED` e `customerId` **ou** `relatedCustomerId` entre os ids da lista, trazendo `id` e `name` dos dois lados; nunca uma consulta por cliente;
   - cada item ganha `guardian` (`{ id, name }` do responsável, ou `null`) e `dependents` (a lista, possivelmente vazia);
   - relação `PROPOSED` nunca aparece; relação removida some na próxima leitura;
   - vale para a lista com e sem `phone` (os candidatos da IA ganham os campos, que a IA descarta);
   - sem `timezone`, `list` continua como hoje, sem a consulta;
   - `customerDto` repassa `guardian` e `dependents` quando definidos, como já faz com `nextAppointment`.
4. **O BFF.** O `customerSchema` local de `listCustomers` em `apps/bff/src/clients/scheduling/index.ts` aceita `guardian` e `dependents` com os mesmos tipos do contrato, só no schema da lista (o detalhe, a criação e a edição não mudam). `GET /v1/customers` repassa os dois campos; a resposta passa no guard de contrato do Goal036.
5. **A linha da lista** (`CustomerPanelItem`, linha com nome; a linha sem nome não muda):
   - **quem é responsável** (`dependents` com 1 ou mais): a segunda linha é "agenda para <nome do dependente>" com 1; com 2 ou mais, "agenda para <nome do primeiro> e mais <n − 1>". Dependente sem nome: "cliente sem nome". Substitui o telefone, como o CL3;
   - **quem é agendado por um responsável** (sem telefone próprio, `phone` nulo ou só com espaços, e com `guardian`): a segunda linha é "<nome do responsável> agenda por esta pessoa". Responsável sem nome: "Responsável sem nome agenda por esta pessoa". Substitui "Telefone não informado". O quadro diz "agenda por ele"; o contrato não tem gênero, então o texto segue a regra sem gênero de D-158 e a frase que o app já usa no novo cliente ("Alguém agenda por esta pessoa?"). É divergência declarada;
   - quem tem as duas coisas mostra a de responsável; quem tem telefone próprio e responsável mostra o telefone, como o quadro ("Cliente sem telefone mostra quem agenda por ele");
   - sem `guardian` nem `dependents` (ou com a resposta antiga, sem os campos), a linha fica como hoje;
   - vale na lista e na busca, porque é a mesma linha; o destaque da busca continua só no nome; a busca continua filtrando por nome e telefone, sem procurar no texto da relação;
   - a segunda linha fica numa linha só, com reticências quando não cabe, sem overflow horizontal em 360 px;
   - a meta à direita (próximo, último, falta, "sem atendimentos") não muda.
6. **Os alvos.** Em `apps/frontend/e2e/visual/targets.json`:
   - **CL3:** a resposta fixa de `GET /v1/customers` dá a Maria Souza `dependents` com Pedro Souza (`visual-compare-cl3-pedro`), e a lista ganha o Pedro, sem telefone e com `guardian` Maria, que não casa com "mar". As `notes` perdem a divergência do Goal121 e citam as que restarem;
   - **CL1:** passa a usar `responses` fixas só de `GET`: `GET /v1/status` conectado (igual ao do CL3) e `GET /v1/customers` com as oito linhas do quadro, na ordem e com a meta do quadro (Ana Paula, Aline Santos, Bia Castro, Carla Nunes, Fernanda Lima, Juliana Mendes, Pedro Souza sem telefone com `guardian` Maria Souza, e o cadastro sem nome `5511976543210`). As `notes` dizem que a lista é fixa só no navegador da captura e citam todas as divergências (inclusive a contagem "386" do quadro e o dia da semana dos horários futuros, que depende do dia da captura);
   - `resolveRelativeDays` passa a aceitar também `{today+N}`, para os horários futuros do CL1; `{today}` e `{today-N}` não mudam, e um token malformado continua recusado;
   - nenhum outro alvo muda.
7. **O que não muda.** `CustomerProfile`, `CustomerForm`, `GuardianCard`, `PrimaryGuardianPanel`, o detalhe do cliente no contrato, no BFF e no Scheduling, a IA, o banco (sem migration), a semente da captura (`scripts/lib/visual-seed.mjs`) e a do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`), `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts`, o carregamento (CL9), o vazio (CL2) e o erro (CL10).
8. **Divergências declaradas.** O Developer registra nas `notes` de CL1 e CL3 e em D-163, com o motivo, toda diferença que restar.
9. **Decisão.** O Developer propõe **D-163**, por acréscimo, depois das provas, cobrindo as escolhas 2 a 8. A decisão diz que a divergência 4 de D-112 e a divergência do Goal121 no CL3 deixam de existir, e não edita D-112, D-135 nem D-158. Se o número já estiver tomado, o Developer usa o próximo livre e explica.

## Escopo obrigatório

### 1. Contrato, Scheduling e BFF

1. `packages/public-api-contract/src/schemas.ts`: a escolha 2.
2. `apps/scheduling-service/src/modules/customers/avenly-customer-service.ts` e `internal-api/routes.ts` (`customerDto`): a escolha 3.
3. `apps/bff/src/clients/scheduling/index.ts`: a escolha 4.
4. `apps/bff/PUBLIC_API_V1.md`: os dois campos de `GET /v1/customers`.

### 2. O frontend (`apps/frontend/src`)

1. `features/customers/CustomerList.tsx`: a escolha 5.
2. `shared/styles/avenly-customers.css`: a segunda linha nos quatro devices, escopada à linha da lista, se o quadro pedir valor diferente do telefone de hoje.

### 3. A captura

1. `scripts/lib/visual-responses.mjs`: `{today+N}` (escolha 6).
2. `apps/frontend/e2e/visual/targets.json`: CL1 e CL3 (escolha 6).
3. `scripts/tests/visual-responses.test.mjs`: o CL1 na lista dos alvos com `responses`, os testes de `{today+N}`, e os de CL1 e CL3.

### 4. Provas

1. **Scheduling**, em `apps/scheduling-service/tests/unit/goal149-*.test.ts` e `tests/integration/goal149-*.integration.test.ts`:
   - a lista traz `guardian` no dependente e `dependents` no responsável, com a relação `CONFIRMED`; com `PROPOSED`, nenhum dos dois; depois de remover a relação, nenhum dos dois;
   - responsável com dois dependentes: os dois, em ordem de nome, o sem nome por último;
   - **uma** chamada à consulta de relações para a lista inteira, qualquer que seja o tamanho da lista, e nenhuma sem `timezone`;
   - a relação de outro negócio nunca aparece (dois tenants, na integração);
   - `GET /internal/customers?phone=` traz os campos nos candidatos.
2. **BFF**, em `apps/bff/tests/goal149-*.test.ts`: `GET /v1/customers` repassa `guardian` e `dependents`; a resposta do Scheduling sem os campos continua válida e sai sem eles; a resposta passa no guard de contrato.
3. **Contrato**: o schema da lista aceita a resposta nova e a antiga, e recusa `guardian` sem `id` e `dependents` que não é lista.
4. **Frontend**, em `apps/frontend/tests/goal149-*.test.tsx` / `.test.ts`:
   - o dependente sem telefone mostra "<responsável> agenda por esta pessoa", e o responsável sem nome dá "Responsável sem nome agenda por esta pessoa";
   - o responsável mostra "agenda para <nome>" com 1 e "agenda para <nome> e mais <n − 1>" com 2 e com 3; dependente sem nome dá "cliente sem nome";
   - quem tem telefone próprio e `guardian` mostra o telefone; quem é responsável e dependente ao mesmo tempo mostra a de responsável;
   - sem os campos, as linhas ficam como hoje (telefone, "Telefone não informado", a linha sem nome);
   - na busca, o destaque continua no nome, e buscar o nome do dependente não acha o responsável;
   - o nome acessível do link da linha contém o texto da segunda linha;
   - `CustomerListPanel` mostra a mesma linha;
   - os alvos CL1 e CL3 de `targets.json`: cada resposta válida contra o schema da rota no contrato, só `GET`, a Maria do CL3 com `dependents` Pedro Souza, e o Pedro do CL1 sem telefone e com `guardian` Maria Souza.
5. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) o Scheduling trazendo relação `PROPOSED` faz um teste `goal149` do Scheduling reprovar;
   - (b) a consulta de relações feita por cliente, dentro do laço, faz um teste `goal149` do Scheduling reprovar;
   - (c) a consulta de relações sem `tenantId` faz o teste de dois tenants reprovar;
   - (d) o `customerSchema` local do BFF sem `dependents` faz um teste `goal149` do BFF reprovar;
   - (e) a linha do responsável mostrando o telefone faz um teste `goal149` do frontend reprovar;
   - (f) "e mais <n − 1>" trocado por "e mais <n>" faz um teste `goal149` do frontend reprovar;
   - (g) a Maria do CL3 sem `dependents` faz reprovar o teste `goal149` do alvo **e** `visual-responses.test.mjs`;
   - (h) `{today+N}` resolvido como `{today-N}` faz `visual-responses.test.mjs` reprovar.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 3).
6. **Fidelidade visual.**
   - `npm run visual:compare -- --target CL1,CL3` e, para regressão, `--target CL2,CL8,CL9,CL10`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 148.
   - **A captura de antes é da baseline `d3093fe`, feita três vezes** (lição 1), com CL1, CL2, CL3, CL8, CL9 e CL10. O Developer guarda os `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que CL2, CL8, CL9 e CL10 não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido, na tabela por imagem. CL1 e CL3 mudam de propósito e são julgados contra os quadros.
   - CL1 e CL3 são capturados **três vezes** depois das edições, para provar que as respostas fixas dão imagens estáveis.
   - O Developer abre os `side-by-side.png` de CL1 e CL3 nos quatro devices (lição 4) e lista no relatório as diferenças que restam e por quê.
   - **Medidas**, em cada device, no app e no quadro, com a diferença em px: o topo, a altura e o espaçamento das linhas do Pedro (CL1) e da Maria (CL3); a fonte, o tamanho e a cor computada da segunda linha; e a largura disponível da segunda linha em 360 px. Uma diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.
   - Critério visual: **a lista igual ao quadro CL1 nos 4 devices** e **a busca igual ao quadro CL3 nos 4 devices**, salvo as divergências declaradas; CL2, CL8, CL9 e CL10 sem diferença fora do ruído.
   - Largura, contraste, foco, alvo de toque e movimento reduzido são decididos pelo `validate:ui` (360, 390, 768, 1024 e 1440 px).

## Fora do escopo

- O perfil do responsável mostrar de quem ele é responsável (não há quadro); o tipo de relação (pergunta 141) e o gênero no texto; a IA propor responsável (D-022 (5)); o lembrete para o responsável (pergunta 135); serviço e duração no "Próximo"; o conserto retroativo do vínculo velho que aponta para um dependente.
- Buscar pelo nome do dependente ou do responsável; a contagem da lista; qualquer mudança no detalhe do cliente, na criação ou na edição.
- Os dez quadros sem alvo (S1b, S5, S6, S8, S9, N2, N3, H6, NT3 e 4.3), que continuam com os motivos da v150 a v172; os esqueletos das outras telas e o `.skeleton` global.
- A borda dos cartões e a das ações (`--border` e `--border-strong`, abaixo de 3:1; review144, observação 4, e review147, pendência 2); a busca de 46 contra 48 px e o "+" do painel carregando sem `canCreate` (review148, pendências 1 e 2).
- A conferência de `customerId` nas rotas internas do Scheduling e a série que não reconfere a pessoa na confirmação.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-163** em `PROPOSED`, conforme a escolha 9. Inclui o contraste calculado da segunda linha sobre o fundo da linha.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal149.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal149. Ela traz as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas. Traz também a rodada e a árvore de cada número, as partidas medidas antes de editar, o ajuste das asserções existentes, a tabela por imagem, as três capturas de CL1 e CL3, as medidas e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal149 na mesma rodada (lição 7). O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Antes de editar: as partidas (lição 2) e a captura da baseline `d3093fe` três vezes (§4.6).
2. O contrato e o Scheduling (escolhas 2 e 3), com os testes do §4.1 e do §4.3.
3. O BFF e `PUBLIC_API_V1.md` (escolha 4), com os testes do §4.2.
4. A linha da lista (escolha 5), com os testes do §4.4.
5. `{today+N}` e os alvos CL1 e CL3 (escolha 6), com os testes de alvo.
6. O `visual:compare`, as medidas e as três capturas de CL1 e CL3; corrigir o que passar de 1 px.
7. Os controles negativos do §4.5, revertidos.
8. A execução final, sobre a árvore completa:
   - typecheck do frontend, do BFF e do Scheduling; lint do frontend e do Scheduling (com o RTK ligado, lint por `rtk proxy`);
   - os testes `goal149` do frontend e do Scheduling, e a suíte do frontend;
   - `test:gate`, com o `prisma generate` dos três serviços já feito (lição 8);
   - `validate:core`, `validate:ui` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL`, `EVOLUTION_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. Na lista e na busca, o cliente sem telefone próprio com responsável `CONFIRMED` mostra "<responsável> agenda por esta pessoa", e o responsável mostra "agenda para <dependente>" (ou "e mais <n − 1>"), no lugar do telefone. Relação `PROPOSED` ou removida não aparece. Sem os campos, a linha fica como hoje.
2. `GET /v1/customers` traz `guardian` e `dependents`, declarados no contrato público e em `PUBLIC_API_V1.md`; a resposta antiga continua válida. O Scheduling os calcula numa só consulta para a lista inteira, só no negócio do pedido. O detalhe, a criação, a edição, a IA e o banco não mudam.
3. A lista igual ao quadro CL1 nos 4 devices e a busca igual ao quadro CL3 nos 4 devices, salvo as divergências declaradas. Os `side-by-side.png` de CL1 e CL3 foram abertos nos quatro devices e as medidas do §4.6 foram feitas. CL2, CL8, CL9 e CL10 sem diferença fora do ruído da baseline. CL1 e CL3 estáveis nas três capturas.
4. Largura (sem overflow horizontal em 360 a 1440 px), contraste, foco visível, alvo de toque e `prefers-reduced-motion` aprovados pelo `validate:ui`.
5. Os oito controles negativos reprovaram com a mensagem registrada e foram revertidos com `cmp` igual.
6. typecheck, lint, `goal149`, a suíte do frontend (com a partida medida antes de editar), `visual-responses.test.mjs`, `test:gate`, `validate:core`, `validate:ui` e `validate:integration` com saída 0 na árvore final. Nenhuma asserção existente afrouxada; os ajustes de valores esperados (a lista dos alvos com `responses` e o total de donos em `goal144-alvos-captura.test.ts`) são explicados no relatório, com o que a asserção provava e onde a prova continua.
7. D-163, CURRENT_STATE e VALIDATION_GATE escritos por acréscimo, com as contagens da execução final.

## Plano de execução

1. **WU-01 — O contrato e a lista do Scheduling.** As partidas e as três capturas da baseline, antes de editar. As escolhas 2 e 3, com os testes do §4.1 e do §4.3.
2. **WU-02 — O BFF e a documentação pública.** A escolha 4 e `PUBLIC_API_V1.md`, com os testes do §4.2.
3. **WU-03 — A linha da lista.** A escolha 5 em `CustomerList.tsx` e no CSS, com os testes `goal149` do componente.
4. **WU-04 — Os alvos CL1 e CL3.** `{today+N}`, os alvos, o ajuste das listas de alvos nos testes existentes e os testes dos alvos nos dois arquivos.
5. **WU-05 — Fidelidade visual.** `visual:compare` de CL1 e CL3 e da regressão; as três capturas; os `side-by-side.png`, as medidas e as correções; as `notes` com todas as divergências.
6. **WU-06 — Os controles negativos.** (a) a (h), cada um revertido.
7. **WU-07 a WU-18 — Verificação determinística:** typecheck do frontend, do BFF e do Scheduling; lint do frontend e do Scheduling; os testes `goal149` do frontend e do Scheduling; a suíte do frontend; `test:gate`; `validate:core`; `validate:ui`; `validate:integration`.
8. **WU-19 — Registros.** D-163, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
9. **WU-20 — `git diff --check`.**
