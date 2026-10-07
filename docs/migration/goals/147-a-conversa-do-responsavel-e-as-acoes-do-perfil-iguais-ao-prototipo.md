# Goal 147 — A conversa do responsável e as ações do perfil iguais ao protótipo

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal146 ACCEPTED](../reviews/146-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL8, CL5, CL6, CL7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v171**, inserida depois do 146, sem renumerar nem remover ID. É a "passada de tela do perfil" que a v169 e a v170 previam sem ID. Origem: as observações 1 a 3 do [review144](../reviews/144-review.md) e a consequência que o Goal146 declarou ([D-160](../DECISIONS.md)): o perfil do dependente fica sem "Conversa" até esta passada oferecer "Conversa com <responsável>". O CL8 continua alvo; CL5, CL6 e CL7 continuam alvos e entram aqui porque as ações do perfil são as mesmas nos quatro quadros.

## Baseline aceita

Baseline aceita: `e0142aa4a5ea67a7a414fa5b7e2d286fba578619`

Goal anterior: 146 — A conversa continua de quem escreve quando o responsável agenda para o dependente

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal146 já integrado em `main` (origem `d45c061d8c338c51612c3fc3a9804287fadc4f65`). Houve **duas rodadas**: a rodada 1 parou no pré-review do IA Loop com 1 blocker (o resultado do DIAG-003 não foi gravado), e a rodada 2 o fechou sem alterar arquivo. **D-160** foi aceita: `Contact.customerId` é quem escreve pelo número (o candidato do telefone; o dependente vincula o responsável dele), e a última pessoa agendada fica em `Contact.lastScheduledCustomerId` e `Contact.lastScheduledAt`. Por isso o filtro `customerId` de `GET /v1/conversations` com o id da Maria devolve a conversa da Maria, inclusive depois que ela agenda o Pedro. A última contagem aceita:

- frontend **206** arquivos e **3017** testes — Goal144 (o Goal146 só acrescentou um `waitFor` a um teste do Goal144, sem teste novo; a contagem do frontend não foi refeita fora do `validate:core`);
- `scripts/tests/visual-responses.test.mjs` **65** — Goal144;
- `test:gate` **298** — Goal146;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal144;
- IA: unidade **104** arquivos e **1338** testes passando, 17 arquivos e 115 testes pulados sem banco — Goal146 (este Goal não toca a IA);
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal146;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal146.

O Developer roda a suíte do frontend na baseline **antes de editar** e registra os números de partida. Os Goals 145 e 146 não cumpriram isso; aqui é critério de aceite (lição 2).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o perfil de um cliente sem telefone próprio com responsável confirmado oferece "Conversa com <responsável>", que abre a conversa do responsável, ao lado de "Agendar", igual ao quadro CL8 nos quatro devices; as ações de todos os perfis ficam iguais às dos quadros CL5 a CL8; e "Ver <responsável>" tem nome acessível que contém o texto visível.**

**Por que agora.** O Goal146 fez a conversa de quem escreve ficar vinculada a quem escreve. Antes dele, "Conversa com <responsável>" abriria a conversa errada sempre que a Maria agendasse o Pedro. Agora o contrato já entrega o que a tela precisa: `GET /v1/conversations` aceita `customerId`, e o id do responsável vem em `customer.primaryGuardian.guardian.id`. Nada de BFF, IA, Scheduling, contrato ou banco.

**Lições dos Goals 133 a 146, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. A partida da suíte do frontend é medida **na baseline, antes da primeira edição**, e registrada com o comando e a hora. Medida depois de editar não vale como partida.
3. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
4. Os `side-by-side.png` de CL8, CL5, CL6 e CL7 são abertos nos quatro devices, e as medidas do §3.5 são feitas em todos os devices, no app e no quadro.
5. Cada controle de `targets.json` roda pelos **dois** testes: o `goal147` e `scripts/tests/visual-responses.test.mjs`.
6. As `notes` do alvo citam **todas** as divergências visíveis na captura, inclusive as da casca e as de cor de título (`avenly.css` dá `color: var(--fg)` a todo `h2`; review135, blocker 1).
7. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".
8. Numa worktree limpa, rodar `npx prisma generate` em `apps/bff` e em `apps/ai-orchestrator` antes de `test:gate` e da suíte que varre a árvore (review146, DIAG-001).

## O que a evidência desta passada mostra

Conferido no código da baseline `e0142aa` e em `docs/design-reference/claude-design/prototype/project/Clientes.dc.html` (mobile), `Clientes-Tablet.dc.html` (retrato e paisagem) e `Clientes-Desktop.dc.html`.

1. **Os quadros.**
   - **CL8** ("Cliente · responsável"): depois da nota, a linha de ações tem dois botões lado a lado, "Conversa com Maria" (ícone de balão) e "Agendar" (ícone de calendário). No mobile, cada um tem `flex:1`, `height:44px`, `border-radius:12px`, `border:1px solid #D6CEC2`, `font-size:15px`, `font-weight:600`, `gap:8px`, ícone de 18 px, **nenhum fundo**, hover `background:#EFEAE2;border-color:#C9C0B3` e active `background:#E5DED4;transform:scale(.98)`. A linha tem `padding:14px 20px 0;display:flex;gap:10px`.
   - **CL5** ("Cliente · resumo"): a mesma linha, com "Conversa" e "Agendar" e os mesmos valores. A legenda diz "Cabeçalho com o essencial e duas ações (Conversa, Agendar)".
   - CL6 e CL7 têm o mesmo cabeçalho compacto do app; as ações só aparecem no Resumo.
   - No tablet e no desktop, o Developer lê os valores de cada arquivo para o seu device, sem deduzi-los do mobile.
2. **O app hoje** (`apps/frontend/src/features/customers/CustomerProfile.tsx`):
   - um `useEffect` com dependência só em `customerId` pede `conversations.list({ customerId, limit: 1 })` com o id do próprio cliente, em paralelo com o carregamento do perfil; sem resultado ou com erro, "Conversa" não aparece (Goal075);
   - `confirmedGuardian` e `dependent` (responsável `CONFIRMED` e cliente sem telefone próprio) já existem e já marcam `directory-detail-actions` com `.is-dependent`;
   - o rótulo é sempre "Conversa", e "Agendar" leva a `/agenda/novo?customerId=<id>` com `createAppointments`;
   - `applyGuardian` atualiza `customer.primaryGuardian` quando o `PrimaryGuardianPanel` confirma ou remove a relação, sem nova leitura do perfil.
3. **O CSS hoje** (`apps/frontend/src/shared/styles/avenly-customers.css`): `.customer-profile .directory-detail-actions .btn` dá `min-height: 44px`, `flex: 1`, raio 12 e fonte 15; o fundo vem de `.btn-secondary` em `avenly.css` (`var(--surface)`, borda `var(--border-strong)`, hover `var(--surface-interactive)`). Só com `.is-dependent`, o botão tem `min-height: 46px` e `background: transparent` (review144, observação 2).
4. **"Ver Maria"** (`GuardianCard.tsx`): o texto visível é "Ver <primeiro nome>", e o `aria-label` é "Ver perfil de <nome>". O nome acessível não contém o texto visível (WCAG 2.5.3; review144, observação 3).
5. **Um dependente sem telefone não tem conversa própria.** Uma conversa vinculada a ele só existe por vínculo velho, de antes do Goal146, que veio do WhatsApp de outra pessoa. O Goal146 corrige esse vínculo na próxima confirmação do número; o conserto retroativo continua fora (review146, pendência 7).
6. **A captura.** O CL8 de `targets.json` fixa `GET /v1/conversations` com a lista vazia, e a divergência (8) das `notes` diz que o app mostra só "Agendar" em largura total. `scripts/lib/visual-responses.mjs` casa a resposta fixa pelo caminho exato, **sem a query**, então a mesma resposta serve ao pedido com o id do responsável.
7. **Os testes que citam o que muda.** `tests/goal144-perfil-responsavel.test.tsx` (o nome "Ver perfil de Maria Souza", nas linhas 371 e 383, e "com conversa, 'Conversa' continua levando para ela", na linha 627, que hoje passa com o pedido pelo id do Pedro), `tests/goal144-alvos-captura.test.ts` (a lista vazia de `/v1/conversations`, na linha 117) e `tests/goal075-customer-profile.test.tsx` (§6.8, com o pedido `{ customerId: "c1", limit: 1 }`).

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS da linha de ações de CL5 e CL8: os valores inline de px, cor, fonte, raio, espaçamento e estado (hover e active), e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device.
2. **De quem é a conversa do perfil.** O dono da conversa é o responsável quando o cliente é `dependent` (responsável `CONFIRMED` e sem telefone próprio); nos outros casos, é o próprio cliente.
   - O pedido é `conversations.list({ customerId: <id do dono>, limit: 1 })`, um por dono, e só sai **depois** de o perfil carregar, porque o dono depende de `primaryGuardian`.
   - O perfil de um dependente **nunca** pede a conversa pelo id do próprio dependente, nem mostra uma conversa vinculada a ele.
   - Quando o dono muda (confirmar ou remover pelo `PrimaryGuardianPanel`, ou trocar de cliente), o pedido anterior é abortado, a ação some até o novo pedido responder, e um resultado atrasado do dono anterior nunca aparece.
   - Sem resultado ou com erro, a ação não aparece, como no Goal075.
   - Cliente com telefone próprio e responsável confirmado não é `dependent`: a conversa é a dele, como hoje.
3. **O rótulo.**
   - Dono = o responsável: "Conversa com <primeiro nome do responsável>" (a primeira palavra de `guardian.name`); sem nome, "Conversa com o responsável". O link leva a `/conversas/<id>` (com `encodeURIComponent`), com o mesmo ícone de hoje.
   - Dono = o cliente: "Conversa", como hoje.
   - O nome acessível é o texto visível, sem `aria-label`.
4. **As ações de todos os perfis.** Em `.customer-profile .directory-detail-actions`, as duas ações ficam com os valores do quadro de cada device (escolha 1): altura, raio, borda, fonte, `gap`, ícone, **sem fundo** em repouso, e o hover e o active do quadro. Os valores valem para todos os perfis, com ou sem responsável, e a regra especial de `.is-dependent .btn` deixa de existir. A classe `.is-dependent` pode continuar no elemento se outro estilo a usar.
   - Com uma ação só (sem conversa, ou sem `createAppointments`), ela ocupa a linha inteira, como hoje.
   - O `transform: scale(.98)` do active só existe com `prefers-reduced-motion: no-preference`.
   - Um rótulo longo ("Conversa com Maximiliana") não pode causar overflow horizontal em 360 px: o texto fica numa linha e é cortado com reticências dentro do botão, e o nome acessível continua inteiro.
   - O foco visível de `.btn` não muda.
   - Nenhuma regra fora de `.customer-profile` muda: `.directory-detail-actions` e `.btn-secondary` servem a outras telas.
   - Se a cor da borda do quadro (`#D6CEC2`) e o fundo da página tiverem token equivalente em `avenly.css`, o Developer usa o token e registra o valor computado. Se não houver, usa o valor do quadro, escopado ao perfil.
5. **"Ver <responsável>".** Com nome, o `aria-label` passa a ser "Ver <nome completo do responsável>", que começa com o texto visível "Ver <primeiro nome>". Sem nome, o link fica sem `aria-label`, e o nome acessível é o texto visível "Ver responsável". O destino, o texto visível e o alvo de toque de 24 px não mudam.
6. **O que não muda.** O cartão do responsável e a nota (fora o nome acessível da escolha 5), a linha sob o nome, o `PrimaryGuardianPanel` e os pedidos dele, "Agendar" e o destino dele, as abas, o cabeçalho compacto de CL6 e CL7, `CustomerSummary`, `CustomerMemory`, a lista, `data/services/` (`conversations.list` já aceita `customerId`), o contrato, o BFF, a IA, o Scheduling e o banco.
7. **Divergências declaradas.** As divergências (1) a (7), (9) e (10) das `notes` do CL8 continuam. A (8) deixa de existir: o app passa a mostrar "Conversa com Maria" e "Agendar" lado a lado, como o quadro. Se a captura de CL5 não mostrar "Conversa" porque o cliente semeado não tem conversa na conta visual, isso é estado da conta, não CSS. O Developer declara isso nas `notes` do CL5 e não muda a semente. Ele registra nas `notes` e em D-161, com o motivo, qualquer outra divergência que encontrar.
8. **O alvo.** Em `targets.json`, só o CL8 muda:
   - `GET /v1/conversations` passa a responder uma lista com **uma** conversa da Maria: `customerId` `visual-compare-cl8-maria`, nome "Maria Souza", telefone `5511987651100`. A conversa é válida contra o schema da rota no contrato.
   - As `notes` trocam a divergência (8) pela explicação de que a conversa é da responsável. Elas dizem que a resposta fixa casa pelo caminho sem a query e que nenhum passo grava.
   - O CL8 continua sem passo e só com `GET`. Os outros alvos não mudam, salvo as `notes` do CL5 pela escolha 7.
9. **Captura e teste.** Um teste `goal147` valida a resposta de `/v1/conversations` do CL8 contra o schema da lista de conversas do contrato. Ele confere que a única conversa tem `customerId` igual a `primaryGuardian.guardian.id` da resposta do perfil do CL8, e que nenhuma resposta tem método diferente de `GET`. `scripts/tests/visual-responses.test.mjs` continua aceitando o CL8 entre os donos de `responses` de `Clientes.dc.html`, sem passo.
10. **O gate.** Nenhuma rota nova: `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` não mudam. Se a contagem de `validate:ui` ou do gate autenticado mudar, o relatório diz quanto e por quê.
11. **Decisão.** O Developer propõe **D-161**, por acréscimo, depois das provas, cobrindo as escolhas 2 a 9: de quem é a conversa do perfil, o rótulo, as ações de todos os perfis, o nome acessível de "Ver <responsável>", o que não muda, o alvo e as divergências. A decisão diz que as observações 1 a 3 do review144 ficam resolvidas e que a 4 (a borda dos cartões) continua fora. Ela não edita D-158 nem D-160. Se o número já estiver tomado, o Developer usa o próximo livre e explica.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/customers/CustomerProfile.tsx`: o dono da conversa, o pedido e o rótulo (escolhas 2 e 3).
2. `features/customers/GuardianCard.tsx`: o nome acessível de "Ver <responsável>" (escolha 5).
3. `shared/styles/avenly-customers.css`: as ações do perfil nos quatro devices (escolha 4).

`PrimaryGuardianPanel.tsx`, `CustomerSummary.tsx`, `CustomerMemory.tsx`, `data/services/`, `shared/ui/`, `avenly.css` (fora de leitura de token), o contrato, o BFF, a IA, o Scheduling e o banco não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o CL8 (escolha 8) e, se preciso, as `notes` do CL5 (escolha 7).
2. `scripts/tests/visual-responses.test.mjs`: só se a escolha 9 pedir.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal147-*.test.tsx` / `.test.ts`:
   - **Dono da conversa:** o dependente pede só pelo id do responsável, e nenhum pedido sai com o id do próprio dependente. O cliente sem responsável e o cliente com telefone próprio e responsável `CONFIRMED` pedem pelo próprio id. Com responsável `PROPOSED` e sem telefone, o pedido é pelo próprio id.
   - **Rótulo e destino:** "Conversa com Maria" com o `href` da conversa do responsável; "Conversa com o responsável" sem nome; "Conversa" para o dono = cliente; o nome acessível igual ao texto visível; nenhuma ação sem resultado ou com erro.
   - **Troca de dono:** confirmar pelo `PrimaryGuardianPanel` troca o pedido para o responsável, e remover volta ao próprio cliente. O resultado atrasado do dono anterior não aparece (uma promessa que resolve depois da troca).
   - **"Ver <responsável>":** o nome "Ver Maria Souza", que contém "Ver Maria"; sem nome, "Ver responsável", sem `aria-label`; o destino igual.
   - **O que não muda:** "Agendar" e o destino dele, as abas, o cartão e a nota.
   - **Alvo:** os testes da escolha 9.
2. **Ajustes de testes existentes**, só no que este Goal muda: em `goal144-perfil-responsavel`, o nome de "Ver Maria" e o teste da linha 627, que passa a afirmar o pedido pelo id da Maria e o rótulo "Conversa com Maria"; em `goal144-alvos-captura`, a lista de `/v1/conversations` do CL8. O §6.8 de `goal075-customer-profile` não muda. Nenhum ajuste afrouxa asserção sobre os pedidos do `PrimaryGuardianPanel`, o cartão, a nota ou as outras telas. Cada ajuste é listado no relatório, com o que cada asserção trocada provava e onde essa prova continua.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) o dependente pedindo a conversa pelo próprio id faz um teste `goal147` reprovar;
   - (b) o rótulo "Conversa" sem "com <responsável>" para o dependente faz um teste reprovar;
   - (c) o cliente com telefone próprio e responsável `CONFIRMED` pedindo pelo id do responsável faz um teste reprovar;
   - (d) um resultado atrasado do dono anterior aparecendo depois de remover a relação faz um teste reprovar;
   - (e) o `aria-label` "Ver perfil de <nome>" de volta faz um teste reprovar;
   - (f) a conversa do CL8 em `targets.json` com `customerId` `visual-compare-cl8-pedro` faz o teste `goal147` reprovar;
   - (g) o CL8 com um passo que toca "Confirmar" ou "Remover" faz reprovar o teste `goal147` **e** `visual-responses.test.mjs`.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 3).
4. Os testes existentes continuam passando.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target CL8,CL5,CL6,CL7` e, para regressão, `--target CL1,CL3`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 144.
   - **A captura de antes é da baseline `e0142aa`, feita três vezes** (lição 1), com CL8, CL5, CL6, CL7, CL1 e CL3. O Developer guarda os `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que CL1 e CL3 não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido, na tabela por imagem. CL5 a CL8 devem mudar só na linha de ações (e, no CL8, no botão novo).
   - O Developer abre os **quatro** `side-by-side.png` de CL8, CL5, CL6 e CL7 (protótipo × app, nos quatro devices) e lista no relatório as diferenças que restam e por quê (lição 4).
   - **Medidas**, em cada device, no app e no quadro, com a diferença em px: o topo, a altura e a largura de cada ação; o `gap` entre elas; o raio; a cor da borda; o fundo em repouso (computado, não declarado); o tamanho do ícone; e o topo das abas. No CL8, também o topo da nota e a posição de "Ver Maria". Uma diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.
   - Critério visual: **o perfil igual ao quadro CL8 nos 4 devices**, com "Conversa com Maria" e "Agendar" lado a lado, salvo as divergências declaradas; **CL5, CL6 e CL7 iguais aos quadros CL5, CL6 e CL7 nos 4 devices**, com as ações do quadro; CL1 e CL3 sem diferença fora do ruído.
   - Largura, contraste, foco, alvo de toque e movimento reduzido são decididos pelo `validate:ui` (360, 390, 768, 1024 e 1440 px). Isso inclui a ausência de overflow horizontal com o rótulo longo e o contraste do texto das ações sobre o fundo transparente.

## Fora do escopo

- Qualquer mudança no BFF, na IA, no Scheduling, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`).
- A borda dos cartões (`--border`, 1,31:1; review144, observação 4): é o token de todos os cartões e do quadro.
- O conserto retroativo do vínculo velho que aponta para um dependente; o perfil do responsável mostrar de quem ele é responsável; "agenda para <dependente>" na lista e na busca (divergência do Goal121 no CL3).
- O tipo de relação (pergunta 141), o gênero na nota, a IA propor responsável (D-022 (5)), o lembrete para o responsável (pergunta 135), serviço e duração no "Próximo".
- A conferência de `customerId` nas rotas internas do Scheduling, a série que não reconfere a pessoa na confirmação e as pendências não bloqueantes dos reviews 138 a 146.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL9, N2, N3, H6, NT3 e 4.3).

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-161** em `PROPOSED`, conforme a escolha 11. Inclui o contraste calculado do texto das ações sobre o fundo portado e da borda das ações como contraste de não texto, nos estados repouso e hover, e a altura das ações como alvo de toque.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal147.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal147. Ela traz as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas. Traz também a rodada de cada número, a partida medida antes de editar, os ajustes de testes existentes, a tabela por imagem, as medidas e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal147 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Antes de editar: rodar a suíte do frontend na baseline (lição 2) e capturar a baseline `e0142aa` três vezes (§3.5).
2. Implementar o dono da conversa, o rótulo e o nome acessível (escolhas 2, 3 e 5), com os testes do §3.1 e os ajustes do §3.2.
3. Portar as ações (escolha 4).
4. Mudar o alvo e o teste de captura (escolhas 8 e 9), rodar o `visual:compare` e as medidas, e corrigir o que passar de 1 px.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - os testes `goal147` e a suíte do frontend;
   - `scripts/tests/visual-responses.test.mjs` e `test:gate`, com o `prisma generate` do BFF e da IA já feito (lição 8);
   - `validate:core`, `validate:ui` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. No perfil de um cliente sem telefone próprio com responsável `CONFIRMED`, a ação "Conversa com <primeiro nome do responsável>" abre a conversa mais recente do responsável. O perfil nunca pede nem mostra a conversa vinculada ao próprio dependente. Sem conversa do responsável, a ação não aparece.
2. Nos outros perfis, "Conversa" continua sendo a conversa do próprio cliente, com o mesmo pedido de antes. Confirmar ou remover a relação pelo `PrimaryGuardianPanel` troca o dono sem mostrar resultado atrasado do dono anterior.
3. "Ver <responsável>" tem nome acessível que contém o texto visível, com o mesmo destino.
4. O perfil igual ao quadro CL8 nos 4 devices, com "Conversa com Maria" e "Agendar" lado a lado, salvo as divergências declaradas. CL5, CL6 e CL7 iguais aos quadros CL5, CL6 e CL7 nos 4 devices, com as ações do quadro. Os `side-by-side.png` foram abertos e as medidas do §3.5 foram feitas. CL1 e CL3 sem diferença fora do ruído da baseline.
5. Largura (sem overflow horizontal em 360 a 1440 px), contraste, foco visível, alvo de toque e `prefers-reduced-motion` aprovados pelo `validate:ui`.
6. O CL8 em `targets.json` responde uma conversa da responsável, só com `GET` e sem passo, provado pelo teste `goal147` e por `visual-responses.test.mjs`.
7. Os sete controles negativos reprovaram com a mensagem registrada e foram revertidos com `cmp` igual.
8. typecheck, lint, `goal147`, a suíte do frontend (com a partida medida antes de editar), `test:gate`, `validate:core`, `validate:ui` e `validate:integration` com saída 0. Nenhuma asserção existente afrouxada. O BFF, a IA, o Scheduling, o contrato e o banco intocados.
9. D-161, CURRENT_STATE e VALIDATION_GATE escritos por acréscimo, com as contagens da execução final.

## Plano de execução

1. **WU-01 — A conversa do responsável e o nome acessível.** A partida da suíte e as três capturas da baseline, antes de editar. As escolhas 2, 3 e 5, com os testes `goal147` do §3.1 e os ajustes do §3.2.
2. **WU-02 — As ações do perfil.** A escolha 4 em `avenly-customers.css`, para os quatro devices.
3. **WU-03 — O alvo CL8.** As escolhas 8 e 9 em `targets.json`, o teste `goal147` do alvo e o ajuste de `goal144-alvos-captura`.
4. **WU-04 — Fidelidade visual.** `visual:compare` de CL8, CL5, CL6 e CL7 e da regressão; os `side-by-side.png`, as medidas e as correções; as `notes` com todas as divergências.
5. **WU-05 — Os controles negativos.** (a) a (g), cada um revertido.
6. **WU-06 a WU-14 — Verificação determinística:** typecheck e lint do frontend; os testes alvo `goal147`; a suíte do frontend; `visual-responses.test.mjs`; `test:gate`; `validate:core`; `validate:ui`; `validate:integration`.
7. **WU-15 — Registros.** D-161, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
8. **WU-16 — `git diff --check`.**
