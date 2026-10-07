# Goal 144 — O perfil de quem é agendado por um responsável igual ao protótipo

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal143 ACCEPTED](../reviews/143-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL8, CL5, CL6, CL7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v168**, inserida depois do 143, sem renumerar nem remover ID. Origem: a v166 adiou o CL8 porque o quadro descrevia um comportamento da IA que não existia; o Goal142 o entregou ([D-156](../DECISIONS.md): "o CL8 pode ser portado"), e o Goal143 fechou a privacidade desse comportamento ([D-157](../DECISIONS.md)). A v167 já tinha marcado o CL8 para esta passada. O CL8 entra em `targets.json` como alvo novo (102 alvos; 11 dos 113 quadros continuam sem alvo). CL5, CL6 e CL7 continuam alvos e entram aqui só como regressão: a mesma tela, o mesmo componente.

## Baseline aceita

Baseline aceita: `23f447efd3ef1e66908260bb8b14cc80b28f5b2b`

Goal anterior: 143 — A IA só usa as pessoas do número que escreve

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal143 já integrado em `main` (origem `befa10a34328d098540453353100f63e5163ef4c`). Houve **uma rodada**, sem blocker. **D-157** foi aceita: todo `customerId` que o modelo escreve numa tool da IA é de uma pessoa do número (candidatos do telefone e dependentes `PRIMARY_GUARDIAN` `CONFIRMED`), a recusa vem antes de ler a pessoa ou de criar efeito, a série recorrente é confirmada para a pessoa preparada e o vínculo do contato só vale para pessoa do número. A última contagem aceita:

- frontend **204** arquivos e **2964** testes — Goal140 (os Goals 141 a 143 não tocaram o frontend);
- `scripts/tests/visual-responses.test.mjs` **64** — Goal140;
- `test:gate` **297** — Goal143;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal140;
- IA: unidade **101** arquivos e **1310** testes passando, 16 arquivos e 112 testes pulados sem banco — Goal143 (este Goal não toca a IA);
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal143;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal143.

O Developer roda a suíte do frontend na baseline **antes de editar** e registra os números de partida.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o perfil de um cliente sem telefone próprio com responsável confirmado (`/clientes/detalhes`, aba Resumo) igual ao quadro CL8 nos quatro devices**: o subtítulo "Sem telefone próprio · cliente desde …", o cartão "<responsável> agenda para <cliente>" com o telefone do responsável, quem confirmou e quando, o link "Ver <responsável>", e a nota sobre o que a IA faz quando o responsável escreve.

**Por que agora.** O comportamento que o quadro explica já existe e está protegido: o Goal142 pôs os dependentes confirmados entre as pessoas do número e faz a IA perguntar em vez de assumir; o Goal143 garante que a IA só usa essas pessoas. Hoje a tela não mostra nada disso no topo: o responsável só aparece no painel "Responsável principal", no fim da aba Resumo, e o cliente sem telefone diz "Telefone não informado". O contrato já traz tudo o que o quadro pede, salvo o tipo de relação. Nada de BFF, contrato ou banco.

**Lições dos Goals 133 a 140, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
3. Os `side-by-side.png` do CL8 são abertos nos quatro devices, e as medidas do §3.5 são feitas em todos os devices, no app e no quadro.
4. Cada controle de `targets.json` roda pelos **dois** testes: o `goal144` e `scripts/tests/visual-responses.test.mjs`.
5. As `notes` do alvo citam **todas** as divergências visíveis na captura, inclusive as da casca e as de cor de título (`avenly.css` dá `color: var(--fg)` a todo `h2`; review135, blocker 1).
6. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".

## O que a evidência desta passada mostra

Conferido no código da baseline `23f447e` e em `docs/design-reference/claude-design/prototype/project/Clientes.dc.html` (mobile, `data-screen-label="Cliente · responsável"`), `Clientes-Tablet.dc.html` ("Clientes / Cliente · responsável / Portrait" e "… / Landscape") e `Clientes-Desktop.dc.html` ("Clientes / Cliente · responsável / Desktop").

1. **CL8 no mobile**, de cima para baixo:
   - a barra com o voltar, igual à do CL5;
   - a identidade: avatar "PS", "Pedro Souza" e a linha "Sem telefone próprio · cliente desde ago 2026" (no CL5, a mesma linha traz o telefone);
   - **o cartão do responsável**, logo abaixo da identidade: avatar "MS", a linha "Maria Souza agenda para Pedro", a segunda linha "+55 11 98765-1100 · mãe · confirmado por você em 12/08" e, à direita, a ação de texto "Ver Maria";
   - **a nota**, com um ponto à esquerda: "As mensagens chegam pelo WhatsApp da Maria. Quando ela escrever, a IA pode perguntar *“Seria para o Pedro novamente?”* em vez de assumir.";
   - só "Agendar" nas ações (sem "Conversa": Pedro não tem conversa própria);
   - as abas Resumo, Atendimentos e Notas;
   - o corpo do Resumo: os quatro números ("2 atendimentos", "4 sem a cada", "0 faltas", "0 cancelamentos") e "Próximo" ("sáb 20/09", "10:00 · Corte masculino", "Confirmado", "30 min · R$ 50 · marcado pela IA com Maria"). Sem "Resumo da IA" e sem "Preferências".
   - A legenda do quadro: "O vínculo aparece onde importa: logo abaixo do nome, com quem agenda, o telefone compartilhado e quando você confirmou a relação. A nota explica o comportamento da IA sem virar configuração."
   - No tablet e no desktop, o Developer lê os valores de cada arquivo para o seu device, sem deduzi-los do mobile; de 1024 px em diante, a lista de clientes fica ao lado do perfil (D-103).
2. **O app hoje** (`apps/frontend/src/features/customers/`):
   - `CustomerProfile.tsx` monta a identidade em `directory-detail-hero`; no Resumo, a linha sob o nome é `[telefone formatado ou "Telefone não informado", sinceLabel(customer)]` unidos por " · ". `initials`, `sinceLabel` e `formatBrazilianPhone(…, "plus")` já existem.
   - O responsável só aparece em `PrimaryGuardianPanel.tsx`, no fim do painel Resumo, com propor, confirmar e remover (D-022 (5): só o profissional confirma; a relação só vale `CONFIRMED`).
   - `customer.primaryGuardian` (`customerPrimaryGuardianSchema` em `packages/public-api-contract/src/schemas.ts`) traz `status`, `guardian { id, name, phone }`, `confirmedBy` (`AI`, `PROFESSIONAL`, `CUSTOMER` ou `null`) e `confirmedAt`. **Não traz tipo de relação** ("mãe"; pergunta 141 do vault, sem caminho no contrato).
   - `CustomerNextAppointment` (`CustomerSummary.tsx`) mostra dia, data, hora e status; o resumo do agendamento no contrato (`customerAppointmentSummarySchema`) não traz serviço, duração, preço nem quem marcou. É a mesma limitação do CL5, já aceita no Goal094.
   - `CustomerSummary` mostra o bloco "Resumo da IA" com "Gerar resumo" quando ainda não há resumo; `CustomerMemory` mostra as preferências e o campo de adicionar.
   - A data `dd/mm` no fuso do negócio já tem função comum: `dayMonthLabel` em `features/settings/dayMonth.ts` (Goal140). O fuso vem de `calendar.timezone`, que o perfil já lê.
3. **A captura.** CL5, CL6 e CL7 abrem `/clientes/detalhes?id={customerId}` com a cliente semeada, que tem telefone e não tem responsável. Para o CL8 a conta visual não tem o estado do quadro: `responses` (Goal106) serve respostas fixas de `GET`, por caminho exato sem a query, só no navegador da captura (`scripts/lib/visual-responses.mjs`). O perfil lê `GET /v1/customers/:id`, o calendário, `GET /v1/conversations` (com `customerId`, para "Conversa"), `GET /v1/customers/:id/memory` e, de 1024 px em diante, `GET /v1/customers` da lista ao lado. CL2, CL3 e CL10 já fixam `GET /v1/status` conectado para tirar o aviso da casca. `visual-responses.test.mjs` afirma a lista fechada dos alvos que declaram `responses` e o arquivo de cada um.
4. **Os testes que citam o que muda.** `goal094-clientes.test.tsx` e os testes do perfil e de `PrimaryGuardianPanel` (o Developer procura por "Telefone não informado", "Responsável principal", `primaryGuardian` e `directory-detail-phone` em `apps/frontend/tests/`) e os testes `goal1xx-alvos-captura` que contam alvos.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do cartão, da nota e da linha sob o nome do CL8: os valores inline de px, cor, fonte, raio e espaçamento, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device.
2. **Quando o cartão aparece.** Só no Resumo e só com `primaryGuardian?.status === "CONFIRMED"`, entre a identidade e as ações, dentro de `directory-detail-hero` ou logo abaixo dele, como o quadro. Relação `PROPOSED` ou ausente: nenhum cartão, e a tela fica como hoje. Nas abas Atendimentos e Notas (cabeçalho compacto), nenhum cartão, como CL6 e CL7.
3. **O cartão.** Um componente novo em `features/customers/` (por exemplo `GuardianCard.tsx`), sem leitura própria: recebe o `primaryGuardian`, o cliente e o fuso.
   - **Avatar:** `initials(guardian.name)`; a função sai de `CustomerProfile.tsx` para um módulo comum da pasta, sem cópia.
   - **Primeira linha:** "<nome do responsável> agenda para <primeiro nome do cliente>". Nome do responsável ausente: o telefone formatado; sem os dois, "Responsável sem nome". Primeiro nome do cliente: a primeira palavra de `customer.name`; sem nome, "este cliente".
   - **Segunda linha**, partes unidas por " · ", omitindo a que faltar: o telefone do responsável por `formatBrazilianPhone(phone, "plus")` (ou o valor cru quando o formatador não reconhece); e quem confirmou, com a data `dayMonthLabel(confirmedAt, calendar.timezone)`: `PROFESSIONAL` dá "confirmado por você em <dd/mm>", `CUSTOMER` dá "confirmado pelo cliente em <dd/mm>", `AI` dá "confirmado pela IA em <dd/mm>", `null` dá "confirmado em <dd/mm>"; sem data, sem " em <dd/mm>". Sem "mãe" (escolha 8). Sem `calendar` carregado, o fuso é `America/Sao_Paulo`, como `CustomerAgenda` já faz.
   - **"Ver <primeiro nome do responsável>":** um `Link` para `/clientes/detalhes?id=<guardian.id>` (com `encodeURIComponent`), com nome acessível "Ver perfil de <nome do responsável>" e alvo de toque de pelo menos 24 px. Sem nome do responsável: "Ver responsável".
   - O cartão é uma `section` com `aria-label="Quem agenda por este cliente"`, sem cabeçalho de página novo; se o Developer usar `h2`, dá a ele a cor do quadro explicitamente (lição 5).
4. **A nota.** Só quando o cartão aparece, o cliente **não** tem telefone (`customer.phone` nulo ou vazio) e o responsável tem telefone. Texto, sem gênero porque o contrato não o tem: "As mensagens chegam pelo WhatsApp de <primeiro nome do responsável>. Quando <primeiro nome do responsável> escrever, a IA pode perguntar “Seria para <primeiro nome do cliente> novamente?” em vez de assumir." A pergunta fica em itálico, como no quadro. Texto, não `role="status"` nem `alert`. Cliente com telefone próprio e responsável confirmado: cartão sem nota.
5. **A linha sob o nome.** No Resumo, cliente sem telefone **e** com responsável `CONFIRMED`: "Sem telefone próprio" no lugar de "Telefone não informado"; o resto da linha (`sinceLabel`) não muda. Sem telefone e sem responsável confirmado: "Telefone não informado", como hoje. `compactSubtitle` das outras abas não muda.
6. **O que não muda.** `PrimaryGuardianPanel` continua no fim do Resumo, com o mesmo comportamento e os mesmos pedidos (propor, confirmar, remover): é por ele que o profissional gerencia a relação (D-022 (5)). Depois de confirmar ou remover por ele, o cartão e a nota aparecem ou somem na hora, porque leem o mesmo `customer.primaryGuardian` que `applyGuardian` já atualiza. `CustomerSummary`, `CustomerMemory`, `CustomerNextAppointment`, as ações "Conversa" e "Agendar", as abas, a edição de identidade, a lista e `data/services/` não mudam.
7. **CSS.** Em `shared/styles/avenly-customers.css`, em classes novas escopadas (`.customer-guardian*` ou equivalente), sem alterar regra que CL1 a CL7, CL10 ou a lista usam. Movimento só com `prefers-reduced-motion: no-preference`.
8. **Divergências declaradas.**
   - **Sem o tipo de relação ("mãe").** O contrato não tem o campo (pergunta 141, sem decisão nem caminho); a segunda linha fica sem essa parte. Não se inventa tipo.
   - **A nota sem gênero.** "pelo WhatsApp de Maria", "Quando Maria escrever" e "Seria para Pedro novamente?" no lugar de "da Maria", "Quando ela escrever" e "para o Pedro": o contrato não tem gênero da pessoa.
   - **"Próximo" sem serviço, duração, preço e "marcado pela IA com Maria"**: o resumo do agendamento no contrato não traz esses campos, como no CL5.
   - **O bloco "Resumo da IA" com "Gerar resumo" e o bloco de preferências** aparecem no Resumo, embora o quadro não os mostre: são funções do perfil que este Goal não esconde.
   - **O painel "Responsável principal"** no fim do Resumo, que o quadro não tem (escolha 6), se aparecer na captura.
   - O dia da semana e a data do "Próximo" na resposta fixa, se não puderem bater os dois com o quadro ("sáb 20/09" é de 2025).
   - O estado da casca da conta visual que o quadro não tem (D-118) e a barra de status e o indicador de início do iPhone.

   O Developer registra outras que encontrar nas `notes` do alvo e em D-158, com o motivo.
9. **O alvo.** Em `targets.json`, de `Clientes.dc.html`: **CL8 novo**, label "Cliente · responsável", rota `/clientes/detalhes?id=visual-compare-cl8-pedro`, **sem passo**, com respostas fixas de `GET`, cada uma válida contra o schema da rota no contrato:
   - `GET /v1/status` conectado, igual ao do CL2;
   - `GET /v1/customers/visual-compare-cl8-pedro`: Pedro Souza, `phone` `null`, `createdAt` em agosto de 2026, `appointmentStats` com 2 concluídos, intervalo médio de 28 dias, 0 faltas e 0 cancelamentos, `nextAppointment` confirmado às 10:00, sem notas nem tags, e `primaryGuardian` `CONFIRMED` com `guardian` `{ id: "visual-compare-cl8-maria", name: "Maria Souza", phone: "5511987651100" }`, `proposedBy` e `confirmedBy` `PROFESSIONAL` e `confirmedAt` que dá 12/08 no fuso de São Paulo;
   - `GET /v1/customers/visual-compare-cl8-pedro/memory`: lista vazia;
   - `GET /v1/conversations`: lista vazia (sem "Conversa", como o quadro);
   - `GET /v1/customers`: a lista que os arquivos de tablet em paisagem e de desktop mostram ao lado do perfil, com Pedro Souza e Maria Souza.

   O Developer confirma no código quais `GET` o perfil faz e fixa todos os que dependem do estado do quadro; o calendário pode vir da conta visual. As `notes` dizem por que as respostas são fixas, que nenhum passo grava e citam **todas** as divergências visíveis (lição 5). Os outros alvos não mudam.
10. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar o CL8 entre os donos de `responses` de `Clientes.dc.html` e prova que o CL8 só declara `GET` e não tem passo. Um teste `goal144` valida a resposta do perfil do CL8 contra o schema do detalhe do cliente (`customerDetailSchema` ou o nome que o contrato usa), confere que a relação é `CONFIRMED` com `confirmedAt`, que `phone` do cliente é `null` e que nenhuma resposta tem método diferente de `GET`.
11. **O gate.** Nenhuma rota nova: `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` não mudam. Se a contagem de `validate:ui` ou do gate autenticado mudar, o relatório diz quanto e por quê.
12. **Decisão.** O Developer propõe **D-158**, por acréscimo, depois das provas, cobrindo as escolhas 2 a 11: quando o cartão e a nota aparecem, os textos, a linha sob o nome, o que não muda, o alvo e as divergências. Diz que o CL8 deixou de estar sem alvo e que o tipo de relação continua sem caminho, sem editar D-022, D-156 nem D-157. Se o número já estiver tomado, usa o próximo livre e explica.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/customers/CustomerProfile.tsx`: o cartão e a nota no Resumo (escolhas 2 e 4) e a linha sob o nome (escolha 5).
2. Um componente novo em `features/customers/` para o cartão e a nota (escolha 3), e o módulo comum de `initials`.
3. `shared/styles/avenly-customers.css`: o CSS do cartão, da nota e da linha nos quatro devices (escolha 7).
4. `features/settings/dayMonth.ts` só se o Developer mover `dayMonthLabel` para `shared/` (e então os dois chamadores importam do novo lugar, sem cópia).

`PrimaryGuardianPanel.tsx`, `CustomerSummary.tsx`, `CustomerMemory.tsx`, `data/services/`, `shared/ui/`, o contrato, o BFF, a IA, o Scheduling e o banco não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o CL8 novo (escolha 9).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal144-*.test.tsx` / `.test.ts`:
   - **Cartão:** aparece com `CONFIRMED` e não aparece com `PROPOSED` nem sem relação; só no Resumo; a primeira linha com nome e primeiro nome, com os substitutos sem nome; a segunda linha com o telefone formatado e cada `confirmedBy` (`PROFESSIONAL`, `CUSTOMER`, `AI`, `null`), com e sem `confirmedAt`, e sem telefone do responsável; a data no fuso do negócio (um instante que muda de dia entre `America/Sao_Paulo` e `Pacific/Auckland`); o link para `/clientes/detalhes?id=<guardian.id>` com o nome acessível; nenhum "mãe".
   - **Nota:** aparece só com cliente sem telefone e responsável com telefone; o texto exato da escolha 4; não aparece com cliente com telefone nem com responsável sem telefone.
   - **Linha sob o nome:** "Sem telefone próprio" com responsável confirmado e sem telefone; "Telefone não informado" sem responsável confirmado; o telefone formatado com telefone.
   - **Atualização na hora:** confirmar pelo `PrimaryGuardianPanel` faz o cartão aparecer, e remover faz sumir, sem nova leitura do perfil.
   - **O que não muda:** os pedidos do `PrimaryGuardianPanel`; "Conversa" e "Agendar"; as abas.
   - **Alvo:** os testes `goal144` da escolha 10.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) o cartão aparecendo com `PROPOSED` faz um teste reprovar;
   - (b) a data em UTC em vez do fuso do negócio faz um teste reprovar;
   - (c) `PROFESSIONAL` e `CUSTOMER` com os textos trocados fazem um teste reprovar;
   - (d) a nota aparecendo para cliente com telefone faz um teste reprovar;
   - (e) "Sem telefone próprio" para cliente sem telefone e sem responsável faz um teste reprovar;
   - (f) o CL8 de `targets.json` com um passo que toca "Confirmar" ou "Remover" faz reprovar **o teste `goal144` e `visual-responses.test.mjs`**;
   - (g) a resposta do perfil do CL8 com a relação `PROPOSED` faz o teste `goal144` reprovar.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 2).
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 4 só troca o que este Goal muda (a linha sob o nome, o cartão novo e a contagem de alvos). Nenhum ajuste afrouxa asserção sobre os pedidos, o `PrimaryGuardianPanel` ou as outras telas. Cada ajuste é listado no relatório, com o que cada asserção removida provava e onde essa prova continua.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target CL8` e, para regressão, `--target CL5,CL6,CL7,CL1,CL3`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 140.
   - **A captura de antes é da baseline `23f447e`, feita três vezes** (lição 1), com os alvos de regressão. O Developer guarda os `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que os de regressão não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido, na tabela por imagem.
   - O Developer abre os **quatro** `side-by-side.png` do CL8 (protótipo × app, nos quatro devices) e lista no relatório as diferenças que restam e por quê (lição 3).
   - **Medidas**, em cada device, no app e no quadro, com a diferença em px: o topo do nome, da linha sob o nome, do cartão, da nota, das ações e das abas; a altura, o raio, a borda e o `padding` do cartão; o tamanho do avatar do cartão; a posição de "Ver Maria"; o tamanho e a cor do ponto da nota. Diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.
   - Critério visual: **o perfil igual ao quadro CL8 nos 4 devices**, salvo as divergências declaradas, e **CL5, CL6 e CL7 iguais aos quadros CL5, CL6 e CL7 nos 4 devices**, sem diferença fora do ruído em relação à baseline.

## Fora do escopo

- Qualquer mudança no BFF, na IA, no Scheduling, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`).
- O tipo de relação (pergunta 141), a IA propor responsável (D-022 (5)), o lembrete para o responsável (pergunta 135), "agenda para <dependente>" na lista e na busca (divergência do Goal121 no CL3) e o responsável na criação do cliente (CL4, Goal094).
- `findCustomerAppointments` com vínculo mostrar as outras pessoas do número, a conferência de `customerId` nas rotas internas do Scheduling e as pendências não bloqueantes dos reviews 138 a 143.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL9, N2, N3, H6, NT3 e 4.3).

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-158** em `PROPOSED`, conforme a escolha 12. Inclui o contraste calculado de cada par de texto novo com as cores portadas (o nome no cartão, a segunda linha, "Ver <nome>", o texto da nota e "Sem telefone próprio") e da borda do cartão como contraste de não texto, e o alvo de toque de "Ver <nome>".
- `docs/migration/CURRENT_STATE.md`: o delta do Goal144.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal144, com as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número, os ajustes de testes existentes, a tabela por imagem, as medidas e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal144 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Rodar a suíte do frontend na baseline e capturar a baseline `23f447e` três vezes (§3.5) antes de editar.
2. Implementar o cartão, a nota, a linha sob o nome e o CSS (escolhas 2 a 7), com os testes do §3.1.
3. Acrescentar o alvo e o teste de captura (escolhas 9 e 10), rodar o `visual:compare` e as medidas e corrigir o que passar de 1 px.
4. Rodar os controles negativos do §3.3 e revertê-los.
5. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes `goal144` e a suíte do frontend;
   - `scripts/tests/visual-responses.test.mjs` e `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. Com responsável `CONFIRMED`, o Resumo mostra o cartão "<responsável> agenda para <cliente>" com o telefone do responsável, quem confirmou e a data no fuso do negócio, e "Ver <responsável>" leva ao perfil do responsável; com `PROPOSED` ou sem relação, nada muda.
2. A nota aparece só para cliente sem telefone com responsável que tem telefone, com o texto da escolha 4; "Sem telefone próprio" só para cliente sem telefone com responsável confirmado.
3. `PrimaryGuardianPanel` faz os mesmos pedidos de antes, e confirmar ou remover por ele atualiza o cartão na hora.
4. O perfil igual ao quadro CL8 nos 4 devices, salvo as divergências declaradas, com os `side-by-side.png` abertos e as medidas do §3.5; CL5, CL6 e CL7 iguais aos quadros nos 4 devices, sem diferença fora do ruído da baseline.
5. O CL8 em `targets.json`, só com `GET` e sem passo, provado pelo teste `goal144` e por `visual-responses.test.mjs`.
6. Os sete controles negativos reprovaram com a mensagem registrada e foram revertidos com `cmp` igual.
7. typecheck, lint, `goal144`, a suíte do frontend, `test:gate`, `validate:core`, `validate:ui` e `validate:integration` com saída 0; nenhuma asserção existente afrouxada; o BFF, a IA, o Scheduling, o contrato e o banco intocados.
8. D-158, CURRENT_STATE e VALIDATION_GATE escritos por acréscimo, com as contagens da execução final.

## Plano de execução

1. **WU-01 — O cartão, a nota e a linha sob o nome.** A partida da suíte e as três capturas da baseline; as escolhas 2 a 7 no frontend, com os testes `goal144` do §3.1 e os ajustes dos testes existentes.
2. **WU-02 — O alvo CL8.** As escolhas 9 e 10 em `targets.json`, `visual-responses.test.mjs` e o teste `goal144` do alvo.
3. **WU-03 — Fidelidade visual.** `visual:compare` do CL8 e da regressão, os `side-by-side.png`, as medidas e as correções; as `notes` com todas as divergências.
4. **WU-04 — Os controles negativos.** (a) a (g), cada um revertido.
5. **WU-05 a WU-12 — Verificação determinística:** typecheck e lint do frontend; testes alvo `goal144`; a suíte do frontend; `test:gate`; `validate:core`; `validate:ui`; `validate:integration`.
6. **WU-13 — Registros.** D-158, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
7. **WU-14 — `git diff --check`.**
