# Goal 121 — A lista de Clientes igual ao protótipo no vazio, na busca e no erro

**Status: ACCEPTED.** Preparado em 2026-10-05 pelo Tech Lead Agent após [Goal120 ACCEPTED](../reviews/120-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL2, CL3, CL10

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v145**, inserida depois do 120, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID, que a v144 deixou para depois do 120. Com a Agenda sem quadro alcançável (só S1b, que pede cor livre fora do contrato), Clientes é a próxima superfície de uso diário com quadros sem alvo, e três deles são estados da própria `/clientes`.

## Baseline aceita

Baseline aceita: `482f4f776abe7967a0e95b9dcbd688c98509e986`

Goal anterior: 120 — As recusas do Scheduling chegam às telas como o BFF as entrega

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal120 já integrado em `main` (origem `225f3b40bdc1724c67e13420c09d8b262cd0a806`). Foi **uma rodada**, com 1 blocker só de registro, aplicado no fechamento. **D-134** foi aceita: as recusas do Scheduling lidas por um leitor único (`apps/frontend/src/data/http/schedulingRefusal.ts`), que aceita o embrulho `UPSTREAM_ERROR` do BFF e o formato cru. A última contagem aceita: frontend **164** arquivos e **2122** testes, `test:gate` **267**, `visual-responses.test.mjs` **34** (do Goal119), `validate:core` 15 passos e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, `validate:integration` **36** de 36 passos, com o gate autenticado em **275** de primeira e 0 retentativas. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a lista de Clientes fica igual a CL2 (vazio), CL3 (busca) e CL10 (erro) nos quatro devices**, e CL1, CL4, CL5, CL6 e CL7 continuam iguais à captura de antes.

**Por que agora.** A fila não tem Goal PLANNED. `targets.json` tem 71 alvos, e 42 dos 113 quadros continuam sem alvo. A Agenda só tem o S1b sem alvo, e ele pede cor livre, que o contrato não tem (`colorToken`). Clientes é a próxima superfície de uso diário: CL2, CL3, CL9 e CL10 são estados da própria `/clientes`, e CL8 é o perfil com responsável. Este Goal pega os três que a captura de hoje alcança e que só pedem frontend.

## O que a evidência desta passada mostra

Conferido no código da baseline `482f4f7` e em `docs/design-reference/claude-design/prototype/project/Clientes.dc.html` (com as versões `-Tablet` e `-Desktop`, rótulos `Clientes / <label> / Portrait|Landscape|Desktop`).

1. **CL2 — Clientes · vazio.** O quadro mostra o título "Clientes", uma ilustração de três círculos de contato (dois vazios e um tracejado com "+"), o título "Nenhum cliente ainda", o texto "Seus clientes aparecerão aqui quando você criar um agendamento ou cadastrá-los manualmente. Quem marcar pelo WhatsApp é cadastrado pela IA na hora da confirmação." e o botão "Adicionar cliente". O app (`CustomerListPanelView` em `features/customers/CustomerList.tsx`) usa o `StatePanel` compartilhado com "Seus clientes aparecerão aqui", outro texto e "Cadastrar cliente".
2. **CL3 — Clientes · busca.** O quadro mostra o campo de busca focado (borda `#0F5F63` de 1,5 px, anel `0 0 0 3px #DCECEB`, altura 46 px, raio 14 px) com "Cancelar" ao lado e sem o título; nos resultados, o trecho digitado marcado no nome (`background:#DCECEB; border-radius:3px; padding:0 1px`); e, na última linha, um círculo tracejado com "Adicionar novo cliente “Mar…”", que cria o cliente já com o nome digitado. O app filtra por nome e telefone, mas não marca o trecho, não tem "Cancelar" e não tem a linha de criação; sem resultado, mostra só "Nenhum cliente corresponde à busca.".
3. **CL3, linha "Maria Souza · agenda para Pedro Souza".** A lista (`GET /v1/customers`, `customerSchema`) não traz de quem o cliente é responsável; só o detalhe traz `primaryGuardian`, e no sentido contrário. Mostrar "agenda para …" na lista pede contrato novo.
4. **CL10 — Clientes · erro.** O quadro mostra o título "Clientes", o ícone, "Não foi possível carregar seus clientes", "Verifique sua conexão e tente novamente. Seus dados continuam guardados." e "Tentar novamente" (52 px, raio 14 px, `#0F5F63`). O app mostra "Não foi possível carregar clientes" e, na descrição, "Não foi possível carregar os clientes. Referência: {requestId}" (ou a mensagem de rede).
5. **O que o `visual:compare` alcança hoje.** CL2 e CL3 entram com `responses` (Goal106): `GET /v1/customers` fixo, vazio ou com os clientes do quadro, e `steps` com `fill` em "Buscar cliente". CL10 pede a lista respondendo erro, e `scripts/lib/visual-responses.mjs` só aceita `method`, `path` e `json`, sempre servidos com status 200 (`scripts/visual-compare.mjs`, `route.fulfill({ status: 200, … })`). CL9 (carregando) pede a leitura parada no meio, e a captura espera `networkidle` antes de fotografar; fica fora.
6. **Nenhum teste existente** em `apps/frontend/tests/` ou `apps/frontend/e2e/` afirma os textos de vazio, de erro ou de busca sem resultado que este Goal troca.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS de cada quadro (valores inline de px, cor, fonte, raio e espaçamento), em cada device: `Clientes.dc.html` no mobile, `Clientes-Tablet.dc.html` em Portrait e Landscape, `Clientes-Desktop.dc.html` no desktop. O CSS novo fica em classes próprias de Clientes; o `StatePanel` compartilhado e as outras telas não mudam.
2. **CL2.** O vazio de Clientes vira um componente próprio de `features/customers/`, com a ilustração, o título, o texto e o botão do quadro. "Adicionar cliente" leva a `/clientes/novo` e só aparece com `canCreate` (lista que não é `managedExternally`), como hoje.
3. **CL3.** Com a busca preenchida:
   - o trecho digitado aparece marcado no nome, na primeira ocorrência, sem diferenciar maiúscula de minúscula; o filtro continua o de hoje (nome e telefone), e a busca que só casa pelo telefone não marca nada;
   - "Cancelar" aparece ao lado do campo, limpa a busca e devolve a lista; no mobile, o modo de busca segue o quadro (sem o título e sem a contagem); nas larguras de tablet e desktop, segue o quadro de cada uma;
   - com `canCreate`, a última linha é "Adicionar novo cliente “{busca}…”", com a busca aparada e a primeira letra maiúscula, e leva a `/clientes/novo?nome={busca aparada}`; se a busca não tem letra (só número e sinais de telefone), leva a `/clientes/novo?telefone={dígitos}`. Sem `canCreate`, a linha não aparece;
   - sem resultado, a linha de criação continua; o aviso `role="status"` de nenhum resultado continua para leitor de tela (o texto visível segue o quadro).
   `CustomerForm.tsx` lê `nome` e `telefone` da URL (por `window.location.search`, como `CustomerProfile.tsx` faz com `aba`) só na criação e preenche os campos uma vez, sem gravar nada. Nenhuma gravação nova.
4. **CL3, "agenda para …".** Fica fora, como **divergência declarada**: a linha de Maria Souza mostra o telefone, como as outras. Não há mudança de contrato.
5. **CL10.** O erro da lista mostra o ícone, o título, o texto e "Tentar novamente" do quadro, que relê a lista como hoje. A referência do pedido (`Referência: {requestId}`) continua, numa linha própria abaixo do texto, em letra menor, como **divergência declarada**: o resto do app a mostra, e ela é o que liga o erro ao log.
6. **O alvo do CL10 pede uma capacidade nova no `visual:compare`.** `responses` ganha o campo opcional `status`: inteiro de 400 a 599; ausente, continua 200. Só vale com `method: "GET"`; outro valor, número fora da faixa ou não inteiro recusa `targets.json`, com erro que nomeia o alvo e o item, como os outros campos. O `json` continua obrigatório (o corpo de erro do BFF, `{ "error": { "code", "message" }, "requestId" }`). `route.fulfill` usa o `status` do item. O `$comment` de `targets.json` passa a citar o campo.
7. **Alvos.** `targets.json` ganha CL2, CL3 e CL10, todos em `/clientes`:
   - CL2: `responses` com `GET /v1/customers` vazio e `managedExternally: false`;
   - CL3: `responses` com `GET /v1/customers` trazendo os clientes do quadro (Marina Costa, Marcos Vieira e Maria Souza, com o último atendimento em `{today}`, `{today-14}` e `{today-5}`) e pelo menos um que não casa, e `steps` com `fill` de "mar" em "Buscar cliente";
   - CL10: `responses` com `GET /v1/customers` em `status` 503 e o corpo de erro do BFF.
   As `notes` de cada alvo citam as divergências declaradas.
8. **Decisão.** O Developer propõe **D-135**, por acréscimo, depois das provas: os três estados, a busca com marca e criação, as duas divergências declaradas e o campo `status` de `responses`.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/customers/CustomerList.tsx` (e componentes novos em `features/customers/`, se o Developer preferir separar): o vazio do CL2, a busca do CL3 e o erro do CL10, nas duas composições (a lista sozinha no mobile e o painel do `ListDetailLayout` a partir de 1024 px, inclusive `CustomerListPanel` nas rotas de detalhe e de criação).
2. `features/customers/CustomerForm.tsx`: o preenchimento por `nome` e `telefone` da URL, só na criação.
3. O CSS em `shared/styles/` (arquivo de Clientes que já existe), em classes próprias.

### 2. A captura

1. `scripts/lib/visual-responses.mjs` e `scripts/visual-compare.mjs`: o campo `status` da escolha 6.
2. `scripts/tests/visual-responses.test.mjs`: `status` aceito (400, 503, 599), ausente vira 200, e recusado com 200, 399, 600, `"503"`, 503,5 e com outro método.
3. `apps/frontend/e2e/visual/targets.json`: CL2, CL3 e CL10, e o `$comment`.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal121-*.test.tsx`:
   - o vazio: o texto e o botão do quadro com `canCreate`; sem o botão com `managedExternally`;
   - o erro: o texto do quadro, a referência na linha própria, e "Tentar novamente" relendo a lista uma vez;
   - a busca: a marca no nome (inclusive com maiúscula na busca), nenhuma marca quando só o telefone casa, "Cancelar" limpando a busca e devolvendo a lista, a linha de criação com `nome` e com `telefone`, a linha ausente sem `canCreate`, e a linha presente sem resultado;
   - `CustomerForm` com `?nome=` e com `?telefone=` preenchendo o campo, sem gravar nada antes de "Salvar cliente".
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a linha de criação sem a guarda de `canCreate` faz um teste reprovar;
   - (b) o nome sem a marca do trecho faz um teste reprovar;
   - (c) `CustomerForm` sem ler `nome` da URL faz um teste reprovar;
   - (d) `validateResponses` aceitando `status` 200 faz um teste de `visual-responses.test.mjs` reprovar.
   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes existentes continuam passando. Se algum precisar mudar, só pode ser pelo texto trocado nesta tela, nunca para afrouxar uma asserção; cada ajuste é listado no relatório.
4. **Fidelidade visual.** `npm run visual:compare -- --target CL2,CL3,CL10` e, para regressão, `--target CL1,CL4,CL5,CL6,CL7`, numa pilha descartável própria (banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 120). O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco.
- "agenda para …" na lista (escolha 4); CL8 (perfil com responsável); CL9 (carregando), que pede a captura com a leitura parada.
- O `StatePanel` compartilhado e os estados de vazio e de erro de Serviços, Notificações e Configurações (o quadro diz que o padrão vale para eles; fica para outro Goal).
- As outras lacunas visuais sem ID (S1b, Serviços, L2, L6, L7, N2, N3, AG2, W2, W3, R2, a exclusão de conta, NT2, NT3, H6 e as etapas do onboarding) e as observações abertas dos reviews 116 a 120.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-135** em `PROPOSED`, conforme a escolha 8. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal121.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal121, com as contagens da execução final, os controles negativos, o `visual:compare` (alvos, percentuais e diferenças que restam) e a lista dos testes ajustados, se houver.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. A pilha descartável própria, antes de editar.
2. O campo `status` de `responses` e os testes dele.
3. CL2 e CL10, com os testes e os alvos.
4. CL3 e o preenchimento do `CustomerForm`, com os testes e o alvo.
5. `visual:compare` de CL2, CL3 e CL10, e de CL1, CL4, CL5, CL6 e CL7 para regressão.
6. Controles negativos do §3.2, revertidos.
7. Execução final, sobre a árvore completa: typecheck e lint do frontend; testes do frontend; `node --test scripts/tests/visual-responses.test.mjs`; `test:gate` (com o `prisma generate` de `apps/ai-orchestrator` já feito); `validate:core`; `validate:ui`; `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável); `git diff --check`. Com o RTK ligado, lint por `rtk proxy`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. CL2 igual ao quadro CL2 nos 4 devices; sem `canCreate`, sem o botão. Provado em jsdom e pelo `visual:compare`.
2. CL3 igual ao quadro CL3 nos 4 devices, salvo "agenda para …" (divergência declarada): o trecho marcado no nome, "Cancelar" e a linha "Adicionar novo cliente “…”", que abre a criação com o nome ou o telefone já preenchido e não grava nada sozinha. Provado em jsdom e pelo `visual:compare`.
3. CL10 igual ao quadro CL10 nos 4 devices, salvo a linha da referência (divergência declarada); "Tentar novamente" relê a lista. Provado em jsdom e pelo `visual:compare`.
4. CL1, CL4, CL5, CL6 e CL7 iguais à captura de antes.
5. `responses` aceita `status` de 400 a 599 e recusa o resto; sem `status`, nada muda para os alvos que já existem.
6. Os quatro controles negativos reprovam e foram revertidos; os testes existentes continuam passando.
7. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque de 24 px no mínimo ("Cancelar", a linha de criação e "Tentar novamente" inclusive), contraste, foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança.
8. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/lib/visual-responses.mjs`, `scripts/visual-compare.mjs`, `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
9. D-135 proposta, com os três estados, a busca, as divergências declaradas e o campo `status`.

## Plano de execução

1. **WU-01 — A captura.** O campo `status` em `visual-responses.mjs` e `visual-compare.mjs`, com os testes.
2. **WU-02 — Vazio e erro.** CL2 e CL10 em `CustomerList.tsx`, com o CSS, os testes e os alvos.
3. **WU-03 — Busca.** CL3 e o preenchimento do `CustomerForm.tsx`, com o CSS, os testes e o alvo.
4. **WU-04 — Fidelidade, provas e registros.** `visual:compare`, controles negativos, D-135, CURRENT_STATE e VALIDATION_GATE.
5. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, testes da captura, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
