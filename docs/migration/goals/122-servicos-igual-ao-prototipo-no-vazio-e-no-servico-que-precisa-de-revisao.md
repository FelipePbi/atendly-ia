# Goal 122 — Serviços igual ao protótipo no vazio e no serviço que precisa de revisão

**Status: READY.** Preparado em 2026-10-05 pelo Tech Lead Agent após [Goal121 ACCEPTED](../reviews/121-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: S2, S7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v146**, inserida depois do 121, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 121. Clientes ficou só com CL8 (outra tela) e CL9 (a captura não fotografa leitura parada). Serviços é a superfície seguinte com mais quadros sem alvo (S2, S5 a S9), e dois deles (S2 e S7) só pedem frontend e captura, sem decisão de produto pendente.

## Baseline aceita

Baseline aceita: `dfa32d8dcf6a63d7bdce23f16200a5c126639018`

Goal anterior: 121 — A lista de Clientes igual ao protótipo no vazio, na busca e no erro

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal121 já integrado em `main` (origem `69a379baf2df9667df4a9bfba1c802231652f567`). Foram **duas rodadas**: a rodada 1 terminou com 3 blockers (a barra de abas inferior na busca do CL3 no tablet em retrato e em paisagem, e a evidência a refazer); a rodada 2 os resolveu, sem blocker. **D-135** foi aceita: o vazio, a busca e o erro de Clientes como CL2, CL3 e CL10, e o campo `status` em `responses` do `visual:compare`. A última contagem aceita: frontend **166** arquivos e **2143** testes, `goal121` **21**, `visual-responses.test.mjs` **38**, `test:gate` **271**, `validate:core` 15 passos e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, `validate:integration` **36** de 36 passos, com o gate autenticado em **273** de primeira e 2 retentativas fora de Clientes (a baseline do Goal120 tinha 275 e 0). Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a lista de Serviços vazia fica igual ao quadro S2, e a edição de um serviço que precisa de revisão fica igual ao quadro S7, nos quatro devices**. S1, S3, S4 e Agenda:S1 continuam iguais à captura de antes.

**Por que agora.** A fila não tem Goal PLANNED. `targets.json` tem 74 alvos, e 38 dos 113 quadros continuam sem alvo. Dos quadros de Serviços sem alvo:

- S5 (tipo de preço) e S6 (recorrência) são sheets que D-114 (Goal095) resolveu no próprio formulário, com o preço segmentado e as opções em linhas fechadas; trazê-los de volta pede outra decisão de composição;
- S8 (desativar) foi trocado pela caixa "Serviço ativo" (D-114 (b) e a divergência 10 dela);
- S9 (descartar alterações) pede guarda de navegação, outro tipo de mudança;
- S2 e S7 são estados de telas que já existem, a captura os alcança com `responses`, e nenhum depende de contrato novo.

S7 também fecha uma lacuna de uso: o "Corrigir" da lista e da Home leva hoje a um formulário de edição comum, que não diz o que falta.

## O que a evidência desta passada mostra

Conferido no código da baseline `dfa32d8` e em `docs/design-reference/claude-design/prototype/project/Servicos.dc.html` (com `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html`, que também têm S2 e S7).

1. **S2 — Serviços · vazio.** O quadro mostra o título "Serviços", a lista em esboço (dois serviços de exemplo e uma linha tracejada esperando o primeiro, sem ilustração externa), o título "Nenhum serviço cadastrado", o texto "Nome, duração e preço bastam. É com isso que a IA responde perguntas e encontra horários para seus clientes." e o botão "Criar primeiro serviço". O app (`ServiceListContent` em `features/services/ServiceList.tsx`) usa `DirectoryState` com "Cadastre seu primeiro serviço", "A IA só oferece serviços ativos com duração e preço ou valor sob consulta." e "Cadastrar primeiro serviço".
2. **S7 — Precisa de revisão · importado sem duração.** O quadro mostra, na edição de "Design de sobrancelha":
   - um aviso em âmbar: "Falta a duração" e "Este serviço veio do Minha Agenda sem esse dado. Sem duração, a IA não consegue oferecer horários para ele.";
   - "Nome"; "Duração · quanto tempo leva, em média?", com o campo em foco mostrando "—", `−`/`+` e os atalhos 20, 30 e 45;
   - "Preço" ("Fixo · R$ 45,00") com "Veio preenchido da importação. Confira se continua certo.";
   - "Cor na agenda" com o nome da cor;
   - o botão "Salvar e liberar para a IA", desabilitado, com "O botão ativa quando a duração for informada." abaixo.

   O quadro não mostra "Descrição", "Recorrência", "Intervalo antes e depois", "Instruções para a IA" nem "Serviço ativo".
3. **O app hoje, para o mesmo serviço.** `ServiceForm.tsx` não lê `needsReview` nem `reviewOrigin`. Abre o formulário de edição comum, com o campo de duração vazio, sem aviso, sem atalhos (eles só aparecem na criação, com 30, 60 e 90) e com "Salvar alterações" habilitado. Salvar sem duração mantém o serviço pendente.
4. **A regra de liberação já existe e não muda.** No Scheduling, `needsReview` é derivado de `durationMinutes === null` (`avenly-service-service.ts`); o `PATCH /v1/services/:id` com duração tira o serviço da revisão. O frontend não decide nada além de habilitar o botão.
5. **O que `ServiceForm` envia.** O `PATCH` leva o corpo inteiro, montado do `FormData` (`description`, `recurrenceIntervalDays`, `bufferBeforeMinutes`, `bufferAfterMinutes`, `active`) e do estado (`colorToken`, `priceType`, `price`). Esconder uma opção do formulário sem manter o valor dela zera o dado no `PATCH`.
6. **O que o `visual:compare` alcança.** S2 e S7 entram com `responses`: `GET /v1/services` fixo (vazio para S2; com um serviço pendente de id fixo para S7) e `GET /v1/status` conectado para tirar o aviso de WhatsApp da conta de teste, como os alvos de Clientes. A rota do S7 pode ser literal (`/servicos/editar?id=<id fixo>`), sem marcador. A instrução privada (`GET /v1/services/<id>/ai-instruction`) também precisa de resposta fixa, porque o id não existe no banco.
7. **Testes existentes.** Nenhum teste em `apps/frontend/tests/` ou `apps/frontend/e2e/` afirma o texto do vazio de Serviços que este Goal troca. Nenhum abre o formulário de um serviço com `needsReview: true`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS de cada quadro (valores inline de px, cor, fonte, raio e espaçamento), em cada device: `Servicos.dc.html` no mobile, `Servicos-Tablet.dc.html` em Portrait e Landscape, `Servicos-Desktop.dc.html` no desktop. O CSS novo fica em classes próprias de Serviços, em `shared/styles/avenly-services.css`. `DirectoryState` não muda: ele continua no erro da lista e nos estados do formulário.
2. **S2.** O vazio da lista vira um componente próprio de `features/services/`, com a lista em esboço, o título, o texto e o botão do quadro. "Criar primeiro serviço" leva a `/servicos/novo` e só aparece com `editable`, como hoje. Os dois serviços de exemplo são decorativos (`aria-hidden`), não são links e não entram na contagem.
3. **S7, quando vale.** O modo de revisão vale na edição de um serviço com `needsReview` verdadeiro, ou com `durationMinutes` nulo. Ele não vale na criação nem na edição de um serviço operacional.
4. **S7, o que mostra.** No modo de revisão, a composição segue o quadro de cada device:
   - o aviso "Falta a duração";
   - "Nome"; "Duração · quanto tempo leva, em média?", com o campo em foco ao abrir e os atalhos 20, 30 e 45;
   - "Preço"; "Cor na agenda", que abre o mesmo seletor de hoje;
   - "Salvar e liberar para a IA".

   O texto do aviso depende de `reviewOrigin`:
   - `IMPORT`: o texto do quadro ("Este serviço veio do Minha Agenda sem esse dado. Sem duração, a IA não consegue oferecer horários para ele.");
   - `MANUAL` ou ausente: "Este serviço foi salvo sem esse dado. Sem duração, a IA não consegue oferecer horários para ele.".

   "Veio preenchido da importação. Confira se continua certo." aparece só com `reviewOrigin` `IMPORT` e preço com valor. A criação continua com os atalhos 30, 60 e 90.
5. **S7, o que não mostra e não perde.** "Descrição", "Recorrência", "Intervalo antes e depois", "Instruções para a IA" e "Serviço ativo" ficam fora da tela no modo de revisão, como no quadro. O `PATCH` continua levando os valores que o serviço já tinha (`description`, `recurrenceIntervalDays`, `bufferBeforeMinutes`, `bufferAfterMinutes`, `active`, `colorToken` se a pessoa não mexeu), e a instrução privada não é regravada. Depois de liberado, o serviço volta ao formulário de edição comum, com todas as opções.
6. **S7, o botão.** "Salvar e liberar para a IA" fica desabilitado enquanto a duração está vazia ou não é um inteiro positivo, com "O botão ativa quando a duração for informada." abaixo e ligado a ele por `aria-describedby`. Com duração válida, o botão habilita e o texto de apoio some. Nenhuma mensagem de erro aparece antes de a pessoa tentar. O envio segue o fluxo de hoje: o mesmo `PATCH`, a mesma validação de preço e `router.replace("/servicos")` no sucesso. O serviço sai da revisão pela regra do Scheduling (evidência 4), sem regra nova no frontend.
7. **Divergências declaradas.** O nome da cor segue a paleta de D-114 (g) ("Rosa-antigo" para `ROSE`, onde o quadro diz "Rosa"). A casca (barra de status e indicador de início do iPhone, "‹ Mais" acima de "Serviços", respiro de topo, nome e iniciais do negócio da conta visual) segue D-127 a D-132 e a divergência 1 de D-114. O Developer registra outras que encontrar nas `notes` do alvo e em D-136, com o motivo.
8. **Alvos.** `targets.json` ganha S2 e S7, os dois de `Servicos.dc.html`:
   - S2: rota `/servicos`; `responses` com `GET /v1/services` vazio, `source: "AVENLY"` e `editable: true`, e `GET /v1/status` conectado;
   - S7: rota `/servicos/editar?id=<id fixo>`; `responses` com `GET /v1/services` trazendo "Design de sobrancelha" (`durationMinutes: null`, `needsReview: true`, `reviewOrigin: "IMPORT"`, preço `FIXED` de 45, `colorToken: "ROSE"`) e os serviços do quadro S1 que a coluna da lista mostra a partir de 1024 px; `GET /v1/services/<id fixo>/ai-instruction` com `content` vazio; e `GET /v1/status` conectado.

   As `notes` de cada alvo citam as divergências declaradas. `scripts/tests/visual-responses.test.mjs` passa a aceitar S2 e S7 como donos de `responses` em `Servicos.dc.html`. `scripts/lib/visual-responses.mjs` e `scripts/visual-compare.mjs` não mudam.
9. **Decisão.** O Developer propõe **D-136**, por acréscimo, depois das provas: o vazio, o modo de revisão, o texto por `reviewOrigin`, os valores preservados no `PATCH` e as divergências declaradas.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/services/ServiceList.tsx` (e um componente novo em `features/services/`, se o Developer preferir separar): o vazio do S2, na lista sozinha e no painel do `ListDetailLayout` a partir de 1024 px.
2. `features/services/ServiceForm.tsx`: o modo de revisão do S7, com o aviso, os atalhos, o botão e os valores preservados.
3. `shared/styles/avenly-services.css`: o CSS em classes próprias.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: S2 e S7.
2. `scripts/tests/visual-responses.test.mjs`: S2 e S7 na lista de donos de `responses`.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal122-*.test.tsx`:
   - o vazio: o título, o texto e "Criar primeiro serviço" com `editable`; sem o botão com `editable: false`; os exemplos fora da árvore de acessibilidade;
   - o modo de revisão: o aviso com o texto de `IMPORT` e o de `MANUAL`; "Veio preenchido da importação…" só com `IMPORT` e preço; o campo de duração em foco ao abrir; os atalhos 20, 30 e 45; nada de "Descrição", "Recorrência", "Intervalo antes e depois", "Instruções para a IA" nem "Serviço ativo";
   - o botão: desabilitado com a duração vazia, com o texto de apoio ligado por `aria-describedby`; habilitado depois de um atalho ou de digitar a duração;
   - o envio: o `PATCH` com a duração escolhida e com `description`, `recurrenceIntervalDays`, `bufferBeforeMinutes`, `bufferAfterMinutes`, `active` e `colorToken` iguais aos do serviço carregado; a instrução privada não regravada; a navegação para `/servicos`;
   - a edição comum de um serviço operacional e a criação sem mudança (sem aviso, "Salvar alterações" ou "Salvar serviço", atalhos 30, 60 e 90 na criação).
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) o botão sem a guarda da duração faz um teste reprovar;
   - (b) o modo de revisão sem manter `description` (ou outro valor escondido) no `PATCH` faz um teste reprovar;
   - (c) o aviso sempre com o texto de `IMPORT` faz um teste reprovar;
   - (d) "Criar primeiro serviço" sem a guarda de `editable` faz um teste reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes existentes continuam passando. Se algum precisar mudar, só pode ser pelo texto trocado nesta tela, nunca para afrouxar uma asserção; cada ajuste é listado no relatório.
4. **Fidelidade visual.** `npm run visual:compare -- --target S2,S7` e, para regressão, `--target S1,S3,S4,Agenda:S1`, numa pilha descartável própria (banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 121). O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco.
- S5, S6 e S8 (resolvidos no formulário por D-114, com divergência declarada); S9 (guarda de navegação); S1b (cor livre fora de `colorToken`).
- O erro da lista de Serviços e o padrão de vazio e de erro de Clientes em outras telas (D-135, "Revisar se").
- `DirectoryState`, `StatePanel` e os estados de outras telas.
- As outras lacunas visuais sem ID (CL8, CL9, L2, L6, L7, N2, N3, AG2, W2, W3, R2, a exclusão de conta, NT2, NT3, H6 e as etapas do onboarding) e as observações abertas dos reviews 116 a 121.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-136** em `PROPOSED`, conforme a escolha 9. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal122.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal122, com as contagens da execução final, os controles negativos, o `visual:compare` (alvos, percentuais e diferenças que restam) e a lista dos testes ajustados, se houver.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. A pilha descartável própria, antes de editar.
2. S2, com os testes e o alvo.
3. S7, com os testes e o alvo.
4. `visual:compare` de S2 e S7, e de S1, S3, S4 e Agenda:S1 para regressão.
5. Controles negativos do §3.2, revertidos.
6. Execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. S2 igual ao quadro S2 nos 4 devices; sem `editable`, sem o botão. Provado em jsdom e pelo `visual:compare`.
2. S7 igual ao quadro S7 nos 4 devices, salvo as divergências declaradas: o aviso, a duração em foco com 20, 30 e 45, a nota da importação e "Salvar e liberar para a IA" desabilitado até a duração. Provado em jsdom e pelo `visual:compare`.
3. No modo de revisão, o `PATCH` leva a duração e mantém os valores escondidos do serviço; a instrução privada não é regravada. Provado em jsdom.
4. A edição comum e a criação continuam como antes; S1, S3, S4 e Agenda:S1 iguais à captura de antes.
5. Os quatro controles negativos reprovam e foram revertidos; os testes existentes continuam passando.
6. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque de 24 px no mínimo ("Criar primeiro serviço", os atalhos 20, 30 e 45 e "Salvar e liberar para a IA" inclusive), contraste, foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam.
7. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
8. D-136 proposta, com o vazio, o modo de revisão, os valores preservados e as divergências declaradas.

## Plano de execução

1. **WU-01 — Vazio.** S2 em `ServiceList.tsx`, com o CSS, os testes e o alvo.
2. **WU-02 — Revisão.** S7 em `ServiceForm.tsx`, com o CSS, os testes, o alvo e o teste de donos de `responses`.
3. **WU-03 — Fidelidade, provas e registros.** `visual:compare`, controles negativos, D-136, CURRENT_STATE e VALIDATION_GATE.
4. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, testes da captura, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
