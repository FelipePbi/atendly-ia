# Review formal — Goal 121

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-05, conforme o [Goal121](../goals/121-a-lista-de-clientes-igual-ao-prototipo-no-vazio-na-busca-e-no-erro.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 1 terminou `CHANGES_REQUIRED` com 3 blockers de código e de evidência; a rodada 2 os resolveu e terminou `ACCEPTED`, sem blocker.

A lista de Clientes fica igual aos quadros CL2 (vazio), CL3 (busca) e CL10 (erro) nos quatro devices, salvo as divergências declaradas em D-135. O vazio e o erro são componentes próprios de Clientes (`features/customers/CustomerStates.tsx`), sem tocar o `StatePanel` compartilhado. A busca marca o trecho digitado no nome, tem "Cancelar", esconde a barra de abas inferior enquanto está preenchida e, com `canCreate`, oferece "Adicionar novo cliente “{busca}…”", que abre a criação com o nome ou o telefone já preenchido, sem gravar nada. O `visual:compare` ganhou o campo `status` em `responses` (400 a 599, só GET), que permite o alvo do CL10. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco. Decisão: [D-135](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `482f4f776abe7967a0e95b9dcbd688c98509e986` (Goal120). Base imediata da implementação: `5de12f7acf61f7aab0cd4679df8f974845cb4092` (fechamento do Goal120 e preparação do Goal121), HEAD da worktree `.ai-worktrees/goal-121`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **15 arquivos** (12 rastreados e 3 novos não rastreados), hash do diff `2005567c9038437922017fec360ee0d50d2dfb109566b2daeed8377992f9a11c`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (4): `features/customers/CustomerStates.tsx` (novo), `CustomerList.tsx` e `CustomerForm.tsx`; `shared/styles/avenly-customers.css`;
  - `apps/frontend/tests/` (4): `goal121-clientes-estados.test.tsx` e `goal121-clientes-busca.test.tsx` (novos, 21 testes), `goal015-shell-invariant.test.tsx` e `goal075-customer-list.test.tsx` (ajustados);
  - a captura (4): `apps/frontend/e2e/visual/targets.json` (CL2, CL3, CL10 e o `$comment`), `scripts/lib/visual-responses.mjs`, `scripts/visual-compare.mjs` e `scripts/tests/visual-responses.test.mjs`;
  - `docs/migration/` (3, por acréscimo): D-135 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal121 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal. O documento do Goal121 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** O Developer rodou com o modo `WORK_UNITS`: WU-01 (o campo `status` da captura), WU-02 (CL2 e CL10), WU-03 (CL3 e o preenchimento do `CustomerForm`) e WU-04 (`visual:compare`, controles negativos e registros) terminaram `COMPLETED`; os gates WU-05 a WU-14 passaram, com a WU-08 (`test:ia-loop`) pulada por não se aplicar ao repositório. O Tech Lead subiu uma pilha descartável própria (PostgreSQL 18 com `initdb` no scratchpad, porta 56531) e abriu os 16 side-by-side de CL2, CL3, CL10 e CL1. Blockers:
   1. CL3 no tablet em retrato: o quadro de busca não tem a barra de abas inferior, e o app a mantinha. Elemento sobrando, não declarado pelo Goal.
   2. CL3 no tablet em paisagem: o mesmo, com a regra do detalhe vazio de 1024 a 1099 px a recalibrar para "Selecione um cliente para ver o perfil" ficar em y 379–391, como o quadro, sem mudar o CL1 além do já declarado.
   3. Evidência a refazer depois da mudança de código: controles negativos, `visual:compare` e as contagens da execução final em VALIDATION_GATE, que a rodada 1 deixou em "Não executado".
2. **Rodada 2 — `ACCEPTED`, sem blocker.** Uma unidade de correção (FIX-001) resolveu os três blockers: `showBottomNav: !searching` no `useShellConfig` de `CustomerList`, com teste jsdom da barra sumindo e voltando depois de "Cancelar"; em `avenly-customers.css`, o `padding-bottom` de 81 px da casca e a altura da coluna da lista zerados quando a barra não existe (768 a 1099 px), e a regra do detalhe vazio de 1024 a 1099 px restrita a `.directory-shell:has(> nav)`; a divergência da barra saiu de D-135 e do CURRENT_STATE; controles (a), (b), (c) e o novo (e) refeitos depois da última edição de código; contagens da execução final registradas. Os gates WU-05 a WU-14 passaram de novo na árvore final, com a WU-08 pulada pelo mesmo motivo. O resultado do Developer saiu `BLOCKED` só porque o IA Loop marca as WU-09 a WU-14 como observadas em árvore incompleta quando a WU-08 é pulada; todas tiveram saída 0.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal121), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal121) e em D-135.

- **Gates do IA Loop, rodada 2, todos com saída 0 na árvore final:** `typecheck` (WU-05), `lint` (WU-06), testes alvo `goal121` com 2 arquivos e 21 testes (WU-07), suíte do frontend com 166 arquivos e 2143 testes (WU-09), `test:gate` com 271 pass e 0 fail (WU-10), `validate:core` com 15 passos passando e 2 pulados (WU-11), `validate:ui` com 169 passed, 21 skipped e 0 retentativas (WU-12), `validate:integration` com 36 de 36 passos (WU-13) e `git diff --check` (WU-14). Na WU-13, o gate autenticado passou com 273 de primeira e 2 retentativas (ver observação 1).
- **Controles negativos do Developer (rodada 2, depois da última edição de código):** (a) a linha de criação sem a guarda de `canCreate` reprovou 1 de 21; (b) o nome sem a marca, 2 de 21; (c) o `CustomerForm` sem ler `nome`, 2 de 21; (e) a barra de abas sempre visível, 1 de 21. O (d), `validateResponses` aceitando `status` 200, reprovou 1 de 38 na rodada 1 e vale porque `scripts/lib/visual-responses.mjs` não mudou na rodada 2. Cada fonte voltou da cópia e foi conferida com `cmp`.
- **Conferência do Tech Lead, rodada 2** (pilha descartável própria: PostgreSQL 18 com `initdb` no scratchpad, porta 56521, Scheduling, IA e BFF na 3072, encerrada ao fim; a worktree ficou intacta):
  - **`visual:compare` de CL2, CL3 e CL10:** 12 pares, todos os side-by-side abertos e os `png` medidos. CL2 1,3/0,3/0,2/0,4%, CL3 2,2/0,4/0,3/0,3%, CL10 6,5/3,5/2,6/2,0% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos valores registrados.
  - **CL3:** sem a barra de abas nos quatro devices; campo, "Cancelar", a marca no nome e a linha "Adicionar novo cliente “Mar…”" a 0–1 px do quadro; no tablet em paisagem, "Selecione um cliente…" em y 379–391 no protótipo e no app.
  - **CL2:** ilustração, título, texto e botão a 1 px do quadro nos quatro devices.
  - **CL10:** espaçamento relativo idêntico; o bloco desce cerca de 12 px pela linha "Referência", que é divergência declarada.
  - **Regressão CL1, CL4 a CL7:** 20 pares, com os percentuais registrados (CL1 8,8/3,6/3,0/2,7%).
  - **Código e testes:** `fulfill` com `status ?? 200`; o vazio e o erro não tocam o `StatePanel`; o retry relê uma vez; o preenchimento do `CustomerForm` segue o padrão de `aba` de `CustomerProfile.tsx`. Os ajustes em `goal015-shell-invariant` e `goal075-customer-list` são estruturais, sem afrouxar asserção. O Tech Lead reexecutou `visual-responses.test.mjs` (38 de 38) e o vitest de `goal121`, `goal075` e `goal015` (4 arquivos, 33 de 33).

## Divergências aceitas

Declaradas pelo Goal ou por D-135, conferidas nas capturas:

1. "agenda para Pedro Souza" sob Maria Souza no CL3: a lista não traz o responsável; pede contrato novo.
2. A linha "Referência: {requestId}" no CL10: liga o erro ao log, como no resto do app.
3. O teclado do iOS aberto no mobile do CL3: o navegador da captura não o abre.
4. A casca (barra de status e indicador de início do iPhone, respiro de topo, nome e iniciais do negócio da conta visual), conforme D-127 a D-132.
5. O texto "Selecione um cliente para ver o perfil" do CL1 no tablet em paisagem e no desktop, agora centralizado na coluna com 14 px (antes 15 px a 60vh), pela regra que o CL3 pede (D-135, item 7). Aceito na rodada 1: os quadros `Clientes-Tablet` e `Clientes-Desktop` especificam esse texto assim, então a mudança aproxima o CL1 do próprio quadro.

## Aceito sem prova completa

1. **Os controles negativos** vêm da execução do Developer. O Tech Lead não os refez.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop da rodada 2 e do relatório do Developer, sem reexecução pelo Tech Lead além dos testes citados.
3. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Observações registradas, sem mudar a decisão

1. **Gate autenticado com 2 retentativas na WU-13 do IA Loop.** Passou com 273 de primeira e 2 retentativas: `onboarding-demonstracao-da-ia` em `tablet-768` e `configuracoes` em `desktop-1440`, nenhuma rota de Clientes. A baseline do Goal120 tinha 275 de primeira e 0 retentativas. A seção do Goal121 no VALIDATION_GATE não as citava; a nota foi acrescentada neste fechamento.
2. **O `h1` "Clientes" sai do DOM durante a busca.** Segue o quadro; poderia ficar `sr-only`. Sem Goal.
3. **CL8 (perfil com responsável), CL9 (carregando) e "agenda para …"** continuam sem alvo, como o Goal previu. O padrão de vazio e de erro de Clientes não foi levado a Serviços, Notificações e Configurações.
4. **A WU-08 (`test:ia-loop`) é pulada em todo Goal deste repositório**, e o IA Loop passa a marcar as unidades seguintes como observadas em árvore incompleta, o que deixou o resultado do Developer como `BLOCKED` nas duas rodadas com todos os gates em saída 0. É do IA Loop, não do diff.
