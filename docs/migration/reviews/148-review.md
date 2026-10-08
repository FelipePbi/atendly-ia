# Review formal — Goal 148

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, em review DEEP conforme o [Goal148](../goals/148-a-lista-de-clientes-carregando-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 1 é histórica: terminou em CHANGES_REQUIRED com 3 blockers, fechados na rodada 2.

A lista de clientes carregando passa a seguir o quadro CL9 ("Clientes · carregando"): título e busca já visíveis, com o mesmo campo, rótulo e `placeholder` da lista carregada, e o que se digita vale quando a lista chega; sem contagem e sem "Nenhum resultado"; o esqueleto com as quatro linhas do quadro (círculo de 40 px, barras de 12 e 10 px, larguras do quadro, brilho `#efeae2` / `#f7f4ef` de 1,6 s, parado com `prefers-reduced-motion: reduce`), escopado em `.customer-skeleton*`; o painel de detalhe vazio carregando no layout largo; e o painel carregando com a altura da coluna. A captura ganhou a resposta retida: uma entrada `{ "method": "GET", "path": "/v1/...", "hold": true }` deixa o pedido pendente até o fim da captura, sem chegar ao BFF, e o alvo que a usa espera a rede sem ela (`trackNetworkIdle`) e precisa de um passo `waitFor` obrigatório. O alvo CL9 é o único com `hold`; são 103 alvos, e restam 10 dos 113 quadros sem alvo. O BFF, a IA, o Scheduling, o contrato público, `PUBLIC_API_V1.md`, a semente da captura e do gate e o banco não mudaram. Decisão: [D-162](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `60b239df406a0f7558fe0c40a640519bacd31709` (Goal147). Base imediata da implementação: `45a544410243b046cfa03b38740faaae2431a8da`, HEAD da worktree `.ai-worktrees/goal-148`, sem commit na worktree. Entre a baseline e `45a5444` só há `docs/`, sem código.
- Snapshot aceito, calculado pelo IA Loop: **12 arquivos** (10 rastreados e 2 novos não rastreados), hash do diff `98848d172097a6fca6dbdd0dc75e5e6ace81027613d55d4f0ed3587e5c127c39`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - captura (3): `scripts/lib/visual-responses.mjs` (`hold`, `hasHeldResponse`, `isHeldRequest`, `trackNetworkIdle` e as recusas da validação), `scripts/visual-compare.mjs` (a espera da captura para alvo com entrada retida e o `settleNetwork` de `runSteps`) e `apps/frontend/e2e/visual/targets.json` (só o bloco do CL9);
  - frontend (2): `apps/frontend/src/features/customers/CustomerList.tsx` (a lista carregando, o esqueleto, o detalhe vazio, o "+" e `is-loading`) e `src/shared/styles/avenly-customers.css` (`.customer-skeleton*`, o respiro do tablet em retrato e a altura do painel carregando);
  - testes novos (2): `apps/frontend/tests/goal148-lista-carregando.test.tsx` (13) e `goal148-alvo-captura.test.ts` (7);
  - testes ajustados (2): `scripts/tests/visual-responses.test.mjs` (de 65 para 78, e três asserções existentes com o CL9) e `apps/frontend/tests/goal144-alvos-captura.test.ts` (o total e a lista dos donos);
  - `docs/migration/` (3, por acréscimo): D-162 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal148 em `VALIDATION_GATE.md`.
- `CustomerProfile`, `CustomerForm`, `data/services/`, `shared/ui/`, `avenly.css`, `useShellConfig`, `scripts/lib/visual-seed.mjs`, a semente do gate, `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts`, `apps/bff`, `apps/ai-orchestrator`, `apps/scheduling-service`, `packages/` (o contrato público), `PUBLIC_API_V1.md`, `tools/ia-loop/` e o documento do Goal148 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** WU-01 a WU-05 (a partida e as três capturas da baseline, a resposta retida, a lista carregando, o alvo CL9, a fidelidade visual e os controles negativos (a) a (f)) e WU-14 (registros) terminaram `COMPLETED`. Os gates rodaram em duas árvores: typecheck, lint, `goal148` e a primeira tentativa do `npm test` em `code-v1:5390741d…`; a primeira tentativa reprovou 2 testes de `goal144-alvos-captura`, corrigidos pelo DIAG-001 (só valores esperados); o resto, de novo o `npm test`, `test:gate`, `validate:core`, `validate:ui` e `validate:integration` (310 passed e 0 retentativas no gate autenticado), em `code-v1:514a1c4a…afc1f5d`. O Tech Lead refez `visual:compare --target CL9,CL1,CL10` e abriu os 12 `side-by-side.png`. A captura e o esqueleto estavam corretos, mas: (1) o CL9 no celular e no tablet em retrato tinha uma linha de 2 px `#0F5F63` em toda a largura abaixo do esqueleto, não declarada, com a cor e o recuo do `:focus-visible` global; (2) as `notes` do CL9 não declaravam a barra de abas do celular (cerca de 97 px no quadro, com o indicador de início do iPhone, contra cerca de 64 px no app); (3) o "+" empilhado de paisagem e desktop estava "para o Tech Lead decidir". O próprio review decidiu o (3): aceito como divergência declarada, porque o cabeçalho do CL9 sem a linha flex conflita com o do CL1 no mesmo arquivo aprovado e o do CL1 evita um salto de cerca de 30 px quando a lista chega.
2. **Rodada 2 — `ACCEPTED`, com 3 blockers só de documentação adiados para o fechamento.** Rodada de correção. A FIX-001 fez o painel carregando (`.customer-panel.is-loading`, carregando e sem erro) usar as regras de altura de `.has-state` e deu `flex: 1` ao esqueleto, pôs a barra de abas nas `notes` do CL9 e registrou a decisão do "+". Os gates WU-06 a WU-12 e WU-15 rodaram de novo na árvore final, todos com `attemptId` `a1` e o mesmo `codeFingerprint`, `code-v1:b11fb1b8f172677d87d7dd8d7755d43c827552b0d25d9ec929615b41edaa4603`; a WU-13 (`validate:integration`) ficou `SKIPPED`, porque o IA Loop não provisionou os bancos de teste. O review da rodada 2 confirmou a correção e pediu só correções de registro: (1) VALIDATION_GATE e CURRENT_STATE ainda chamavam de "árvore final" a `514a1c4a…`; (2) D-162 item 7.8 e VALIDATION_GATE afirmavam como fato a causa da linha, que não foi medida no DOM; (3) as pendências deixadas "para o Tech Lead" não tinham a decisão registrada. O harness aceitou a rodada com essas correções pendentes (`DOC_ONLY_BLOCKERS_DEFERRED_TO_CLOSURE`), sem nova rodada; elas foram feitas neste fechamento.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. **Correção adiada 1 (a árvore final).** `VALIDATION_GATE.md`, seção do Goal148: o parágrafo "Duas árvores" passa a dizer "árvore da rodada 1" para a `514a1c4a…` e a dar a `b11fb1b8…` como a árvore final; a tabela de gates passa a ter a coluna "Execução da rodada 1"; "Gate autenticado" separa a rodada 1 (310 passed) da rodada 2 (não rodou); a subseção "Rodada 2" ganha o parágrafo "Execução final (rodada 2…)", com os números da rodada 2 e o `validate:integration` não rodado. `CURRENT_STATE.md`, delta do Goal148: o bullet de contagens passa a ser o da rodada 1 (histórico), e o bullet "Rodada 2" ganha a execução final.
2. **Correção adiada 2 (a causa da linha).** `DECISIONS.md`, D-162 item 7.8, e `VALIDATION_GATE.md`, "Rodada 2" item 1: a causa passa a ser "provável, inferida pelo antes e depois e não medida no DOM", com a conferência do Tech Lead por pixel; no fim do item 7.8 saíram as duas frases repetidas do item 7.6. O bullet "Rodada 2" de `CURRENT_STATE.md` foi alinhado ao mesmo texto.
3. **Correção adiada 3 (as decisões pendentes).** `CURRENT_STATE.md`: "Pendências para o Tech Lead" virou "Decididas pelo Tech Lead (rodada 2)", com (a), (b) e (c), e o item dos tokens saiu do "Revisar se". `VALIDATION_GATE.md`, "Desvios do texto do Goal", itens 2, 3 e 4: cada um com a decisão. `DECISIONS.md`, D-162 item 5.4: a frase "fica para o review dizer se prefere os tokens" virou a decisão (a); o item dos tokens saiu do "Revisar se".
4. `DECISIONS.md`, D-162: o status passou a ACCEPTED e entrou a nota de fechamento.
5. `CURRENT_STATE.md`, delta do Goal148: o status no título e o parágrafo "Aceite".
6. `VALIDATION_GATE.md`, seção do Goal148: a subseção "Aceite".
7. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal148), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal148) e em D-162.

- **Gates do IA Loop, rodada 2** (`attemptId` `a1` em todos, árvore `code-v1:b11fb1b8…a4603`):
  - typecheck do frontend com saída 0, 2,7 s (WU-06), e lint do frontend com saída 0, 30,6 s (WU-07);
  - `goal148` 20 de 20 em 2 arquivos (WU-08);
  - frontend com 210 arquivos e 3066 testes passando, 76,9 s (WU-09). A partida, medida pela WU-01 no `HEAD` sem edição, antes da primeira edição, é 208 e 3046: +2 arquivos e +20 testes. A lição 2 do Goal foi cumprida;
  - `test:gate` 311 de 311, 0 falhas (WU-10), com `visual-responses.test.mjs` 78 (partida 65);
  - `validate:core` com saída 0, 153,8 s (WU-11);
  - `validate:ui` com saída 0, 59,7 s, 169 passed (WU-12);
  - `validate:integration` **`SKIPPED`** (WU-13): pré-condição ausente, `BFF_TEST_DATABASE_URL`, `AI_TEST_DATABASE_URL`, `EVOLUTION_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL`;
  - `git diff --check` com saída 0 (WU-15).

  O último `validate:integration` com saída 0 é o da rodada 1 (WU-13, árvore `514a1c4a…`): 36 de 36 passos, gate autenticado com 310 passed em 11,0 min e 0 retentativas. A IA e o Scheduling não mudaram; as contagens de unidade deles não foram refeitas fora do `validate:core`.
- **Do Developer:** a partida do frontend e de `visual-responses` (WU-01); as três capturas da baseline (`cap1` a `cap3`, fora do repositório) e a tabela por imagem contra elas; as medidas de DOM e de pixel no app e no quadro nos quatro devices (WU-04); os seis controles negativos (a) a (f) da WU-05, cada um reprovando o teste que o Goal nomeia e revertido com `cmp` igual ao backup.
- **Conferência do Tech Lead:**
  - **A captura:** `hold` só com `GET`, sem `json` nem `status`, e só em alvo com passo `waitFor` obrigatório; `isHeldRequest` casa método e caminho exato, sem a query; `pickFixedResponse` ignora a entrada retida; `trackNetworkIdle` só para alvo com entrada retida, e o alvo sem ela mantém `networkidle`.
  - **A lista carregando:** busca controlada por `data.query` também carregando; esqueleto com as quatro linhas, os tamanhos, as larguras e o gradiente do quadro, e movimento reduzido; `is-loading` só existe carregando e sem erro, e os estados carregados (CL1, CL2, CL3 e CL10) não mudam. O "+" aparece carregando como no quadro; em conta sem `canCreate`, some quando a lista chega.
  - **A fidelidade visual (rodada 2):** `visual:compare --target CL9,CL1,CL10` e `--target CL2,CL3,CL8` refeitos; abertos os 12 `side-by-side.png` de CL9, CL1 e CL10. A linha de 2 px sumiu: nos `app.png` do CL9 nos quatro devices nenhuma linha de `rgb(15,95,99)` ocupa mais de 50 % da largura; no celular e no tablet em retrato o app tem 55 e 54 pixels dessa cor, todos no ícone da aba Clientes, como o quadro (55). O CL9 bate com o quadro nos quatro devices, salvo as divergências declaradas nas `notes` (celular 20 px abaixo, busca de 46 contra 48 px, o "+" na linha do título, a barra de abas e "Notificações"). Os 60 `app.png` de CL1, CL2, CL3, CL8, CL9 e CL10 comparados por pixel com `cap1..cap3`: 53 pares com 0 px; CL2 desktop agora com 0 px nas três; o resto (CL8 desktop 43 a 69 px, CL1 desktop 8 a 34 px, CL1 tablet em paisagem 26 px, delta máximo 8) na barra lateral (x 20 a 40) ou no "+" já medido como ruído.
  - **Gates:** os JSON de `results/work_unit` da rodada 2 batem com os números acima, todos com o mesmo `codeFingerprint`.
  - **Reexecução no fechamento:** a partir de `apps/frontend`, `npx vitest run` nos dois arquivos `goal148` e em `goal144-alvos-captura`: 3 arquivos e 30 testes passando; na raiz, `node --test scripts/tests/visual-responses.test.mjs`: 78 passando e 0 falhas.
  - **Escopo e registros:** os arquivos listados acima. D-162 com número livre, em PROPOSED na rodada, só por acréscimo, sem editar D-161. As contagens (3066, 20, 78, 311 e 169) batem entre VALIDATION_GATE, CURRENT_STATE e os resultados das WU depois da correção deste fechamento.

## Decisões do Tech Lead registradas neste fechamento

1. **O "+" empilhado de paisagem e desktop** (D-162, item 7.3), decidido no review da rodada 1: aceito como divergência declarada. Medidas mantidas: título +5,5 px, busca -29,5 px, esqueleto -31,5 px.
2. **As cores do esqueleto em valores literais** `#efeae2`/`#f7f4ef` (D-162, item 5.4): aceito como divergência declarada do texto da escolha 5. O computado é igual ao dos tokens `--at-color-surface-active` e `--at-color-canvas`, e os valores são os do brilho do quadro.
3. **CL2 e CL8 em desktop fora do ruído das três capturas da baseline:** aceito como variação entre rodadas da captura, fora do componente alterado, pela prova da fidelidade visual da rodada 2 acima. O CL1 desktop, que o Goal não toca, também varia.
4. **O ajuste de `goal144-alvos-captura.test.ts`** (102→103 alvos e o CL9 na lista de donos), fora da lista do Goal: aceito, consequência direta do alvo novo, só valores esperados.

## Aceito sem prova completa

1. **`validate:integration` e o gate autenticado na árvore final.** A WU-13 da rodada 2 ficou `SKIPPED`. O último verde é o da rodada 1, numa árvore anterior à correção, que só mexe em CSS e numa classe do frontend. O `validate:ui` rodou na árvore final.
2. **A causa da linha de 2 px** é inferida pelo antes e depois, não medida no DOM. A prova de que a linha sumiu é por pixel.
3. **Os controles negativos** são os da WU-05. O Tech Lead não os refez; as mensagens foram conferidas pela WU-14 contra a saída bruta.
4. **Uma leitura de clientes lenta de verdade, de ponta a ponta.** O estado retido só existe no navegador da captura; os testes do componente usam a leitura pendente.
5. **O brilho em movimento** não foi capturado (o `FREEZE_CSS` o para); o movimento reduzido é provado pela regra de CSS no teste e pelo `validate:ui`.
6. **A contagem de testes por passo** de `validate:core` e de `validate:integration` não foi retida pelo IA Loop; vale a saída 0 e os passos.

## Pendências não bloqueantes

1. **O "+" do painel carregando em conta sem `canCreate`** aparece carregando e some quando a lista chega (D-162, item 5.3): `canCreate` só se sabe depois de a lista chegar. Revisar se o produto quiser o "+" só para quem pode criar também carregando.
2. **A busca de 46 contra 48 px** (D-162, item 7.2) segue declarada; mudar o `box-sizing` do campo muda CL1, CL2, CL3 e CL10 e fica para um Goal próprio, se o produto quiser.
3. **`prettier --check`:** `CustomerList.tsx` e o CSS já reprovavam no `HEAD` (CRLF do checkout), segundo a WU-02; não foram reformatados.
4. **Fora deste Goal, com Goal e decisão próprios:** os outros 10 quadros sem alvo (S1b, S5, S6, S8, S9, N2, N3, H6, NT3 e 4.3); os esqueletos das outras telas e o `.skeleton` global; a borda dos cartões e a das ações (observação 4 do review144 e pendência 2 do review147); o conserto retroativo do vínculo velho que aponta para um dependente; o perfil do responsável mostrar de quem ele é responsável; "agenda para <dependente>" na lista e na busca; o tipo de relação (pergunta 141) e o gênero na nota; a IA propor responsável (D-022 (5)); o lembrete para o responsável (pergunta 135); serviço e duração no "Próximo".
