# Review formal — Goal 149

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-09, em review DEEP conforme o [Goal149](../goals/149-quem-agenda-por-quem-na-lista-e-na-busca-de-clientes-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 1 é histórica: terminou em `PRE_REVIEW_INCOMPLETE` na conferência do harness, com 5 blockers, fechados na rodada 2.

A lista e a busca de Clientes passam a mostrar quem agenda por quem, como os quadros CL1 e CL3. O responsável mostra "agenda para <nome>" (ou "agenda para <nome> e mais <n − 1>"); o cliente sem telefone próprio, com responsável confirmado, mostra "<responsável> agenda por esta pessoa" no lugar do telefone. A lista do Scheduling traz `guardian` e `dependents` (só `PRIMARY_GUARDIAN` e `CONFIRMED`, do tenant do serviço) numa única consulta para a lista inteira; o contrato público declara os dois campos como opcionais; o BFF os repassa em `GET /v1/customers`, também na busca por telefone. A captura aceita `{today+N}`, o CL3 dá à Maria o dependente Pedro e o CL1 passa a ter a lista fixa do quadro. A divergência 4 de D-112 e a do Goal121 no CL3 deixam de existir. Sem migration e sem backfill; a IA, o perfil, o detalhe do cliente, a criação, a edição e as sementes não mudaram. Decisão: [D-163](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `d3093fe91c126c1cc7dd350d01f992849d66ffa2` (Goal148). Base imediata da implementação: `429264e3f79ee8830ad3ad94b50146f28aaef798`, HEAD da worktree `.ai-worktrees/goal-149`, sem commit na worktree. Entre a baseline e `429264e` só há `docs/`, sem código.
- Snapshot aceito, calculado pelo IA Loop: **20 arquivos** (15 rastreados e 5 novos não rastreados), hash do diff `6db8b3d93539add67f493a0d0621fb1a30ec7a730ca7c8bdbf19405961bf1356`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - contrato (1): `packages/public-api-contract/src/schemas.ts` (`customerListPersonSchema`, `customerListItemSchema` e `customerListSchema.items`);
  - Scheduling (2): `apps/scheduling-service/src/modules/customers/avenly-customer-service.ts` (`confirmedGuardianRelations` e `guardian`/`dependents` em `list`) e `src/modules/internal-api/routes.ts` (`customerDto`);
  - BFF (2): `apps/bff/src/clients/scheduling/index.ts` (o schema da lista) e `apps/bff/PUBLIC_API_V1.md`;
  - frontend (2): `apps/frontend/src/features/customers/CustomerList.tsx` (`relationLine` e a segunda linha) e `src/shared/styles/avenly-customers.css` (`.customer-panel-relation*`);
  - captura (2): `scripts/lib/visual-responses.mjs` (`{today+N}`) e `apps/frontend/e2e/visual/targets.json` (CL1 e CL3);
  - testes novos (5): `goal149-lista-responsavel` do Scheduling (unidade 14 e integração 6), do BFF (5) e do frontend (14), e `apps/frontend/tests/goal149-alvos-captura.test.ts` (16);
  - testes ajustados (3): `scripts/tests/visual-responses.test.mjs` (78 para 79), `apps/frontend/tests/goal144-alvos-captura.test.ts` (a lista de donos) e `apps/scheduling-service/tests/unit/goal075-customer-appointments.test.ts` (os fakes ganharam `customerRelation.findMany`);
  - `docs/migration/` (3, por acréscimo): D-163 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal149 em `VALIDATION_GATE.md`.
- `CustomerProfile`, `CustomerForm`, `GuardianCard`, `PrimaryGuardianPanel`, `customerSchema` e `customerDetailSchema`, `apps/ai-orchestrator`, o banco, a semente da captura e a do gate, `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts`, `tools/ia-loop/` e o documento do Goal149 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `PRE_REVIEW_INCOMPLETE`, 5 blockers da conferência do harness.** WU-01 a WU-05 (as partidas e as três capturas da baseline, o contrato e a lista do Scheduling, o BFF, a linha da lista, `{today+N}` e os alvos, a fidelidade visual) e os gates WU-07 a WU-18 e WU-20 terminaram `COMPLETED`. A WU-06 terminou `BLOCKED`: o controle (c), sem `tenantId`, deixava verde o teste de dois tenants e só reprovava o teste de forma do `where`; o controle (g), a Maria do CL3 sem `dependents`, não reprovava `visual-responses.test.mjs`, que não tinha teste do conteúdo de CL1 e CL3. A WU-19 (registros) terminou `BLOCKED` pela dependência. Por isso: (1) WU-06 pendente; (2) WU-19 pendente; (3) nenhuma decisão nova em `DECISIONS.md`; (4) `CURRENT_STATE.md` sem o delta; (5) `VALIDATION_GATE.md` sem a seção.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** Rodada de correção (FIX-001), sem mudar arquivo de produto. O teste de dois tenants passou a usar os mesmos ids no negócio B, com uma relação `CONFIRMED` entre eles, que só o `tenantId` do `where` deixa fora da lista de A (13 para 14 testes); um teste novo de `visual-responses.test.mjs` prova o conteúdo de CL1 e CL3 (78 para 79). Os oito controles do §4.5 foram refeitos depois dessa última edição de código, cada um reprovando o teste nomeado e revertido com `sha256sum -c`. D-163, o delta e a seção foram escritos. Os gates WU-07 a WU-18 e WU-20 rodaram de novo na árvore final, todos `COMPLETED`, com `attemptId` `a1` e o mesmo `codeFingerprint`, `code-v1:aff7fb7b1b8e2b0309573636da8530e618060d80839c6b781ffb9b8e41860755`.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-163: o status passou a ACCEPTED, saiu a frase "Aguarda o review" e entrou a nota de fechamento.
2. `CURRENT_STATE.md`, delta do Goal149: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal149: a frase "O CL1 abre em `Pedro Souza`", apontada no review como errada (pendência (e)), passou a dizer que a lista abre em Aline Santos; a subseção "Aceite" ganhou o aceite, os gates do IA Loop e a reexecução do fechamento.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal149), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal149) e em D-163.

- **Gates do IA Loop, rodada 2** (`attemptId` `a1` em todos, árvore `code-v1:aff7fb7b…60755`):
  - typecheck do frontend, do BFF e do Scheduling com saída 0 (WU-07 a WU-09);
  - lint do frontend e do Scheduling com saída 0 (WU-10 e WU-11);
  - `goal149` do frontend 30 em 2 arquivos (WU-12) e do Scheduling 14 (WU-13);
  - frontend com 212 arquivos e 3096 testes passando (WU-14). A partida, medida pela WU-01 no `HEAD` sem edição, é 210 e 3066: +2 arquivos e +30 testes;
  - `test:gate` 312 de 312 (WU-15), com `visual-responses.test.mjs` 79 (partida 78);
  - `validate:core` com saída 0, 112,6 s (WU-16);
  - `validate:ui` com saída 0, 169 passed (WU-17);
  - `validate:integration` com saída 0, 786 s (WU-18): 36 de 36 passos, BFF 572 testes, Scheduling 177 (com o `goal149` de integração, 6), gate autenticado 310 passed e 0 retentativas;
  - `git diff --check` com saída 0 (WU-20).
- **Do Developer:** as partidas (WU-01); as três capturas da baseline fora do repositório e o ruído delas; as medidas de DOM e de pixel da segunda linha no app e no quadro (WU-05); a prova de regressão de CL2, CL8, CL9 e CL10 contra uma rodada de controle no mesmo ambiente (0 px nas 16 imagens); os oito controles negativos da rodada 2, com a mensagem exata em VALIDATION_GATE.
- **Conferência do Tech Lead:**
  - **O contrato:** `customerListPersonSchema` e `customerListItemSchema` com campos opcionais; o detalhe, a criação e a edição não mudam.
  - **O Scheduling:** `confirmedGuardianRelations` faz uma única `findMany` com `tenantId`, `PRIMARY_GUARDIAN`, `CONFIRMED` e `customerId` ou `relatedCustomerId` entre os ids da lista; só roda com `timezone` e lista não vazia. A rota de candidatos por `phone` também recebe os campos, e `customerDto` os repassa quando definidos.
  - **O BFF:** o schema da lista aceita os campos; o resto dos schemas fica como antes.
  - **A linha:** `relationLine` mostra a de responsável primeiro; "agenda por esta pessoa" só aparece com `phone` nulo ou vazio; o ícone só na linha do responsável, como o quadro; uma linha com `nowrap` e reticências.
  - **Os testes ajustados:** em `goal144-alvos-captura` só o valor esperado mudou (o CL1 entra como dono de `responses`); os fakes de `goal075` só ganharam `customerRelation.findMany`.
  - **Os controles (c) e (g):** o teste de dois tenants (`goal149-lista-responsavel.test.ts`) e o de conteúdo de CL1 e CL3 (`visual-responses.test.mjs`) fazem os dois controles reprovar o teste que o Goal nomeia.
  - **A fidelidade visual:** `npm run visual:compare -- --target CL1,CL3` refeito no review (saída 0; CL1 8,6 / 3,0 / 1,9 / 1,7 % e CL3 2,0 / 0,3 / 0,2 / 0,3 %, iguais aos registrados) e abertos os oito `side-by-side.png`. O CL3 bate com o quadro nos quatro devices, com "agenda para Pedro Souza" na Maria; restam o teclado do iPhone, o cursor e 1 px. O CL1 tem a estrutura, o ícone de 12 px e "Maria Souza agenda por esta pessoa" (sem gênero, D-158); a ordem por nome, a contagem 8 e o dia da semana relativo estão declarados.
  - **Reexecução no review (rodada 2):** `goal149` do Scheduling 14 de 14; do BFF 5 de 5; `goal149` e `goal144-alvos-captura` do frontend 40 de 40; `visual-responses.test.mjs` 79 de 79.
  - **Reexecução no fechamento, na mesma árvore:** a partir de `apps/frontend`, `npx vitest run goal149 goal144-alvos-captura`: 3 arquivos e 40 testes passando; em `apps/scheduling-service`, `npx vitest run --dir tests/unit goal149`: 14; em `apps/bff`, `npx vitest run goal149`: 5; na raiz, `node --test scripts/tests/visual-responses.test.mjs`: 79 passando e 0 falhas.
  - **Escopo e registros:** os arquivos listados acima. D-163 com número livre, em PROPOSED na rodada, só por acréscimo, sem editar D-112, D-135 nem D-158. As contagens (3096, 30, 14, 312, 169 e 310) batem entre VALIDATION_GATE, CURRENT_STATE e os resultados das WU da rodada 2.

## Decisões do Tech Lead registradas neste fechamento

1. **As linhas da lista 4 px mais altas** (D-163, item 8 (f)), que somadas aos 20 px do celular (item 8 (g)) levam o Pedro Souza para baixo da barra de abas no celular: aceito como divergência declarada. A causa é a herança do `line-height: 1.5` da casca, anterior a este Goal e fora do diff; o conserto mexeria no CL8, que o Goal fixa como só regressão. É o mesmo critério de D-162, item 7.2, aceito no [review148](148-review.md).
2. **A regressão de CL2, CL8, CL9 e CL10 provada contra uma rodada de controle** no mesmo ambiente (0 px nas 16 imagens) e não contra a baseline `d3093fe`: aceito como desvio declarado, porque o ambiente não reproduz mais os pixels da baseline e o diff de produto não toca esses estados.

## Aceito sem prova completa

1. **A regressão contra a baseline `d3093fe`** (decisão 2 acima).
2. **A largura da segunda linha em 360 px** não foi medida por captura (o `visual:compare` só tem os quatro devices fixos); o `validate:ui` cobre o overflow de 360 a 1440 px, e os testes do componente cobrem o `nowrap` com reticências.
3. **Os controles negativos** são os da FIX-001. O Tech Lead não os refez; conferiu que os dois testes novos fecham (c) e (g).
4. **A contagem de testes por passo** de `validate:core` e de `validate:integration` não foi retida pelo IA Loop; vale a saída 0 e os passos. As contagens do BFF e do Scheduling vêm do log do `validate:integration`.
5. **Uma lista de verdade com dependente, de ponta a ponta, em produção.** O `goal149` de integração prova a consulta contra PostgreSQL; a captura usa respostas fixas.

## Pendências não bloqueantes

1. **O `line-height` da linha da lista** (CL1 e CL8): um Goal próprio, se o produto quiser, com `line-height: normal` em `.customer-panel-item` e `.customer-panel-letter`; muda CL1, CL3 e CL8.
2. **O `customerListPersonSchema` local do BFF** declara `id: z.string()` sem o `.min(1)` do contrato. Não bloqueia: os ids do Scheduling nunca são vazios e a resposta do BFF passa pelo guard do contrato.
3. **`prettier --check`:** `CustomerList.tsx` e o CSS já reprovavam no `HEAD` (CRLF do checkout); o `prettier --write` da WU-03 reformatou duas regras CSS alheias, só espaço em branco, que seguem no diff.
4. **Fora deste Goal, com Goal e decisão próprios:** buscar pelo nome do dependente ou do responsável; o gênero e o tipo de relação no texto (pergunta 141); o perfil do responsável mostrar de quem ele é responsável; a IA propor responsável (D-022 (5)); o lembrete para o responsável (pergunta 135); serviço e duração no "Próximo"; o conserto retroativo do vínculo velho que aponta para um dependente; a contagem da lista; os 10 quadros sem alvo; a borda dos cartões e a das ações; a busca de 46 contra 48 px; e o "+" do painel carregando sem `canCreate`.
