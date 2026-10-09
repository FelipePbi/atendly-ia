# Review formal — Goal 150

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-09, em review DEEP conforme o [Goal150](../goals/150-a-lista-de-clientes-na-medida-do-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

A lista de Clientes passa a ter a altura dos quadros na linha, na letra de cada grupo e na busca parada, nos quatro devices, onde quer que apareça (sozinha, ao lado do perfil e ao lado do novo cliente). A linha, a letra e a contagem do cabeçalho usam `line-height: normal`, como os quadros; a meta tem `gap: 2px`; a busca parada tem 48 px e o texto a 44 px da borda. A lista ao lado do perfil do CL8 mostra "agenda para Pedro Souza" sob a Maria e "Maria Souza agenda por esta pessoa" sob o Pedro. No celular, a linha do Pedro Souza fica inteira acima da barra de abas, como no quadro. Deixam de existir a divergência 7.2 de D-162 e as 8 (f) e (h) de D-163. Só o frontend e a captura: o BFF, a IA, o Scheduling, o contrato e o banco não mudaram; `CustomerList.tsx` não foi tocado. Decisão: [D-164](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `8d4f63ea9118a91a5534c2fc6f950f6a6e1253d1` (Goal149). Base imediata da implementação: `5c34711661e8d1a5f040f4a61a740b2f505af96e`, HEAD da worktree `.ai-worktrees/goal-150`, sem commit na worktree. Entre a baseline e `5c34711` só há `docs/`, sem código.
- Snapshot aceito, calculado pelo IA Loop: **9 arquivos** (7 rastreados e 2 novos não rastreados), hash do diff `a7767417d384d126103b58f321d95502078290ae6779f43750a1dbb55e3ba9be`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - frontend (1): `apps/frontend/src/shared/styles/avenly-customers.css` (`line-height: normal` em `.customer-panel-item`, `.customer-panel-letter` e `.customer-panel-count`; `gap: 2px` em `.customer-panel-meta`; `.customer-panel-search .input` com `min-height: 48px` e `padding-left: 42px`; a regra `.customer-search-results .customer-panel-item`, redundante, removida);
  - captura (1): `apps/frontend/e2e/visual/targets.json` (o CL8 com `dependents` e `guardian`; as `notes` de CL1, CL4, CL8 e CL9);
  - testes novos (2): `apps/frontend/tests/goal150-lista-medida.test.tsx` (12) e `apps/frontend/tests/goal150-alvo-captura.test.ts` (5);
  - testes ajustados (2): `scripts/tests/visual-responses.test.mjs` (79 para 80, o teste de conteúdo do CL8) e `apps/frontend/tests/goal147-alvo-captura.test.ts` (o número da divergência do CL8, de (8) para (7));
  - `docs/migration/` (3, por acréscimo): D-164 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal150 em `VALIDATION_GATE.md`.
- `CustomerList.tsx`, `avenly.css` e a casca, `CustomerProfile`, `CustomerForm`, `GuardianCard`, `PrimaryGuardianPanel`, o esqueleto do CL9, o BFF, a IA, o Scheduling, o contrato, `PUBLIC_API_V1.md`, o banco, a semente da captura e a do gate, `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts`, `tools/ia-loop/` e o documento do Goal150 não foram tocados.

## Histórico da rodada

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (as partidas, as três capturas da baseline e o CSS da lista), WU-02 (o CL8 e as `notes`), WU-03 (a fidelidade visual, as medidas e o `padding-left` da busca), WU-04 (os controles negativos), WU-05 a WU-07 e WU-09 a WU-11 (a verificação determinística), WU-12 (os registros) e WU-13 (`git diff --check`) terminaram `COMPLETED`. A 1ª tentativa de WU-08 terminou `BLOCKED`: a suíte do frontend reprovou 1 teste de `goal147-alvo-captura.test.ts`, que procurava a divergência do CL8 pelo número "(8)", renumerada para "(7)" quando a divergência 5 saiu das `notes`. DIAG-001 trocou o número, e a 2ª tentativa de WU-08 terminou `COMPLETED`. Duas árvores aparecem nos números: a **A**, `code-v1:18b47b88138d11a7722fa62f929e9a423b7c84f4ced561e61557e551706d0619`, antes de DIAG-001, e a **B**, `code-v1:fca9b8044185b3681497301e5779298d69243ef205e21205f49a58148edf662f`, a final; só `goal147-alvo-captura.test.ts` difere entre elas.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-164: o status passou a ACCEPTED, saiu a frase "Aguarda o review" e entrou a nota de fechamento.
2. `CURRENT_STATE.md`, delta do Goal150: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal150: a subseção "Aceite" ganhou o aceite, os gates do IA Loop com a árvore de cada um, a conferência do review e a reexecução do fechamento.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal150), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal150) e em D-164.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos):
  - na árvore A: typecheck do frontend com saída 0 (WU-05); lint do frontend com saída 0 (WU-06); `goal150` 17 em 2 arquivos (WU-07); a 1ª tentativa de WU-08, `BLOCKED`, com 3112 de 3113 testes;
  - na árvore B: frontend com 214 arquivos e 3113 testes passando (WU-08, 2ª tentativa). A partida, medida pela WU-01 no `HEAD` sem edição, é 212 e 3096: +2 arquivos e +17 testes;
  - `test:gate` 313 de 313 (WU-09), com `visual-responses.test.mjs` 80 (partida 79);
  - `validate:core` com saída 0, 123,5 s, 15 passos aprovados e 2 pulados (`test:bff` e `test:health-worker`) (WU-10);
  - `validate:ui` com saída 0, 169 passed e 0 retentativas (WU-11);
  - `git diff --check` com saída 0 (WU-13).
- **Do Developer:** as partidas (WU-01); as três capturas da baseline fora do repositório e o ruído delas (teto de 312 px e delta 204, só no desktop); as três capturas finais (0 px no celular e no retrato, no máximo 48 px e delta 32 nos outros); a tabela por imagem e as medidas de DOM no app e no quadro (WU-03); os quatro controles negativos com a mensagem exata em VALIDATION_GATE (WU-04); a conferência de typecheck, lint, `goal150` e `visual-responses` na árvore B (WU-12).
- **Conferência do Tech Lead:**
  - **O CSS:** toda mudança está em `.customer-panel-*`; a busca em andamento (`.customer-panel-searchbar.is-searching .input`, 48 px) não mudou; `avenly.css` e a casca não mudaram.
  - **O CL8:** a Maria com `dependents` `[{ id: "visual-compare-cl8-pedro", name: "Pedro Souza" }]` e o Pedro com `guardian` `{ id: "visual-compare-cl8-maria", name: "Maria Souza" }`, nos tipos de `customerListItemSchema`; a divergência 5 (Goal121) saiu das `notes`, renumeradas.
  - **Os testes ajustados:** em `goal147-alvo-captura.test.ts` só o número da divergência mudou; a prova (a conversa é da responsável, sem a query, nenhum passo grava) é a mesma. Em `visual-responses.test.mjs`, só um teste novo.
  - **A fidelidade visual:** `npm run visual:compare -- --target CL1,CL8,CL2,CL3,CL4,CL5,CL6,CL7,CL9,CL10` refeito no review (saída 0) e abertos os 40 `side-by-side.png`. CL1: em tablet e desktop, título, busca, letras e linhas alinhados ao quadro; no celular, o deslocamento uniforme de 20 px da casca (declarado), com a linha do Pedro Souza inteira acima da barra de abas. CL8, de 1024 px em diante: a lista com as duas linhas de relação e as alturas do quadro; restam as reticências, a meta "20/09 10:00" e a lista de 2 linhas contra 8. CL8 no celular e no retrato: só as diferenças de perfil já declaradas. CL3 sem mudança fora do ruído; CL2 e CL10 sem mudança; CL4 a CL7 com a lista na medida do quadro, deslocada pelo aviso de WhatsApp (estado da conta, declarado); CL9 com a busca de 48 px e o "+" no cabeçalho (divergência do Goal148).
  - **Reexecução no review:** `goal150`, `goal147`, `goal148`, `goal149` e `goal144` do frontend, 8 arquivos e 82 testes; `visual-responses.test.mjs` 80 de 80.
  - **Reexecução no fechamento, na mesma árvore:** a partir de `apps/frontend`, `npx vitest run goal150 goal147-alvo-captura`: 3 arquivos e 22 testes passando; `npx vitest run goal150 goal147 goal148 goal149 goal144`: 10 arquivos e 149 testes passando; na raiz, `node --test scripts/tests/visual-responses.test.mjs`: 80 passando e 0 falhas.
  - **Escopo e registros:** os arquivos listados acima. D-164 com número livre, em PROPOSED na rodada, só por acréscimo, sem editar D-162 nem D-163. As contagens (17, 3113, 80, 313 e 169) batem entre VALIDATION_GATE, CURRENT_STATE e os resultados das WU da rodada 1.

## Decisões do Tech Lead registradas neste fechamento

1. **A captura na pilha que o harness deixou pronta** (`VISUAL_BFF_URL`), no lugar de uma pilha própria com o banco num cluster criado com `initdb`: aceito como desvio declarado. A baseline e a final foram capturadas três vezes cada no mesmo ambiente, que é o que a lição 1 do Goal exige.
2. **As capturas finais por uma cópia de `scripts/visual-compare.mjs` fora do repositório**, que só acrescenta as medidas do DOM em `app.measure.json` e `prototype.measure.json`: aceito como desvio declarado. A comparação é a mesma, e o script do repositório não mudou.

## Aceito sem prova completa

1. **O typecheck, o lint e os `goal150` do IA Loop** rodaram na árvore A. A árvore B só difere num teste do Goal147; o Developer repetiu os três na B (WU-12), e a suíte do frontend da B (WU-08, 2ª tentativa) inclui os `goal150`.
2. **Os controles negativos** rodaram na árvore A e não foram refeitos pelo Tech Lead. DIAG-001 mexeu num arquivo que nenhum controle toca.
3. **A causa dos 4 a 6 px da letra "A"** declarados no Goal149 (D-164, item 4): registrada como provável. Na baseline a medida já não os reproduzia isolados; a letra fica a 0 px do quadro nos quatro devices depois das três mudanças juntas, mas a parcela de cada uma não foi medida em separado.
4. **A largura da linha em 360 px** não foi medida por captura (o `visual:compare` só tem os quatro devices fixos); o `validate:ui` cobre o overflow de 360 a 1440 px.
5. **A contagem de testes por passo de `validate:core`** não foi retida; vale a saída 0 e os passos.
6. **`validate:integration`** e os typechecks do BFF e do Scheduling não fazem parte do plano deste Goal e não rodaram: nada muda nesses serviços, no contrato nem no banco.

## Pendências não bloqueantes

1. **O celular 20 px mais abaixo e a barra de abas** de cerca de 64 contra cerca de 97 px (D-164, item 9 (c)): são da casca e da moldura do quadro, fora da lista. Um Goal próprio, se a casca passar a reservar a barra de status.
2. **`prettier --check`** não rodou nos arquivos editados; o checkout em CRLF já os reprovava no `HEAD`.
3. **O `customerListPersonSchema` local do BFF** sem o `.min(1)` do contrato (review149, pendência 2) continua como estava.
4. **Fora deste Goal, com Goal e decisão próprios:** o "+" do painel carregando sem `canCreate` e abaixo do título no CL9; a borda dos cartões e a das ações; buscar pelo nome do dependente ou do responsável; a contagem da lista; o gênero e o tipo de relação no texto (pergunta 141); o perfil do responsável mostrar de quem ele é responsável; a IA propor responsável (D-022 (5)); o lembrete para o responsável (pergunta 135); serviço e duração no "Próximo"; o conserto retroativo do vínculo velho que aponta para um dependente; e os 10 quadros sem alvo.
