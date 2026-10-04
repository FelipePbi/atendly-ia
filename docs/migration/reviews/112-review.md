# Review formal — Goal 112

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-04, conforme o [Goal112](../goals/112-as-telas-nao-perdem-o-que-a-pessoa-fez-quando-a-largura-cruza-1024-px.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

As telas de detalhe, criação e edição que ficam ao lado de uma lista a partir de 1024 px deixam de remontar o detalhe quando a largura cruza 1024 px, nos dois sentidos. A Importação deixa de perder a fase e as credenciais quando a leitura de `settings` chega depois. `ListDetailLayout` é montado sempre, com a propriedade `split`; só a coluna da lista aparece e some. Nenhuma tela mudou de desenho, e nenhum contrato nem backend mudou. Decisão: [D-126](../DECISIONS.md), aceita neste fechamento. O Goal previa o número D-125, que foi tomado fora do loop pelos nomes de ambiente (commit `f2ba7c5`); a troca de número está aceita.

## Escopo e identidade do diff

- Baseline aceita vigente: `baf0a65b0fe3baeef4f9c6ed532ec57befab78ca` (Goal111). Base imediata da implementação: `f2ba7c546830f422ed85007cf14031118bffad08` (D-125, nomes de ambiente), HEAD da worktree `.ai-worktrees/goal-112`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **17 arquivos**, hash do diff rastreado `e9280bd7c753d746679b3e0723714ffba2f5b50401758060b2114f8b5a28a3a5`, mais 4 arquivos não rastreados (os testes novos). Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (10): `shared/layout/ListDetail.tsx`, `features/customers/CustomerForm.tsx`, `features/customers/CustomerProfile.tsx`, `features/services/ServiceForm.tsx`, `features/settings/ProductSettingsScreen.tsx`, `features/imports/ImportsScreen.tsx`, `features/agenda/AppointmentFlowShell.tsx`, `features/agenda/AgendaDayColumn.tsx`, `shared/styles/avenly.css` e `shared/styles/avenly-agenda.css`;
  - `apps/frontend/tests/` (4, novos): `goal112-list-detail-stable`, `goal112-clientes-servicos`, `goal112-configuracoes-importacao` e `goal112-agenda` (`.test.tsx`);
  - `docs/migration/` (3, por acréscimo): D-126 em `DECISIONS.md`, o delta do Goal112 em `CURRENT_STATE.md` e a seção do Goal112 em `VALIDATION_GATE.md`.
- Nenhum teste existente, nenhum spec e2e e nenhum arquivo fora de `apps/frontend/` e `docs/migration/` mudou. O documento do Goal112 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers, 24 arquivos.** A técnica estava certa e seguia a escolha 1 do Goal. Os blockers: (1) `validate:integration` (WU-12) saiu com exit 1. Nove testes `G-4 pushed screen below 1024px` reprovaram (clientes, serviços e configurações, em mobile-360, mobile-390 e tablet-768) com `a list is mounted beside the detail below 1024px.`, porque o invólucro sem divisão ainda tinha a classe `list-detail`, que `e2e/authenticated-matrix.spec.ts` procura. (2) Sete arquivos de teste existentes (088, 093, 097, 101, 104, 105 e 106) tiveram a asserção de `.list-detail` nulo trocada, e o §2.1 do Goal exige o 088 sem mudança. (3) O `visual:compare` dos doze quadros não rodou: a semeadura da WU-05 falhou com `POST /v1/services 502`, porque o banco de desenvolvimento do scheduling-service estava sem a migration do enum `CalendarSource` (D-120), e no review o BFF local estava fora do ar. (4) Os registros diziam que os gates de validação não tinham rodado e não citavam a falha do gate autenticado.
2. **Rodada 2 — `ACCEPTED`, 0 blockers, 17 arquivos.** A FIX-001 tirou a classe `list-detail` do invólucro sem divisão (`div.list-detail-flat`) e moveu o `display: contents` para esse seletor. Os sete testes antigos voltaram a `HEAD`, sem diff. O `visual:compare` rodou antes e depois em bancos descartáveis. Os registros foram refeitos sobre a árvore final, com os controles negativos rodados de novo. Os oito gates do IA Loop passaram.

O Developer rodou nas duas rodadas com o modo `WORK_UNITS`: 13 unidades na rodada 1 (WU-01 a WU-05 de modelo e WU-06 a WU-13 determinísticas) e 9 na rodada 2 (FIX-001 e WU-06 a WU-13).

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal112 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal112) e em D-126.

- **Gates do IA Loop, rodada 2, todos com exit 0:** `typecheck` (WU-06, 2,3 s), `lint` (WU-07, 21 s), testes alvo (WU-08, 7 s), suíte do frontend (WU-09, 57 s), `validate:core` (WU-10, 129 s), `validate:ui` (WU-11, 53 s), `validate:integration` (WU-12, 746 s) e `git diff --check` (WU-13). Na rodada 1, os mesmos passaram, exceto WU-12, com exit 1 (723 s).
- **Contagens do Developer na árvore final:** 52 testes novos em 4 arquivos; suíte do frontend com 153 arquivos e 1893 testes, que é a contagem do fechamento do Goal102 (149 e 1841) mais os 4 arquivos e os 52 testes novos; `validate:ui` com 169 testes passando; `validate:integration` com 36 de 36 passos e 274 testes no ensaio autenticado, com 1 instável de onboarding que passou na retentativa.
- **Conferência do Tech Lead na rodada 2, na worktree:**
  - **Gate autenticado.** Com `split` desligado, `ListDetailLayout` renderiza `div.list-detail-flat`, sem a classe `list-detail`, e o CSS é `.list-detail-flat, .list-detail-flat > .list-detail-panel { display: contents }`. Os seletores `.agenda-appt-split …` foram conferidos: `.agenda-command-bar` e `.agenda-view-tabs` existem só em `AgendaColumnBar`, que não é montada com `split` desligado, e `.list-detail-panel .resume-stats` fica dentro de `@media (min-width: 1024px)`. Nenhum seletor de estrutura muda na faixa estreita.
  - **Testes.** Os sete arquivos antigos estão sem diff. O Tech Lead rodou os testes `goal112`, `goal088` e `goal105`: 6 arquivos e 107 testes passando. A simulação de `matchMedia` dispara `change`, e a identidade de nó é provada com `toBe`.
  - **Comparação visual, refeita pelo Tech Lead.** Num PostgreSQL descartável no scratchpad (porta 55441), com `prisma migrate deploy`, scheduling-service, ai-orchestrator e BFF no ar, o Tech Lead rodou `visual:compare` dos 12 quadros nos 4 devices na árvore final e numa cópia da base `f2ba7c5` tirada com `git archive`. A porcentagem contra o protótipo deu igual nos 48 pares, e bate com a tabela de VALIDATION_GATE. A comparação das capturas do app antes e depois (`sharp`, limiar 30) deu 0 pixels em 46 pares, 4 pixels em M1 desktop e 1 pixel em S4 tablet paisagem. O Tech Lead abriu os `side-by-side.png` de 10 dos 48 pares: CL4 nos 4 devices, CL5 mobile, S4 mobile, I2 tablet retrato, A9 mobile, A6 tablet paisagem e N1 mobile. As divergências contra o protótipo já existiam na base e vêm do estado da conta de teste. O banco do operador não foi tocado, e os serviços e o cluster foram desligados no fim.
  - **Registros.** VALIDATION_GATE, CURRENT_STATE e D-126 refletem a árvore final. O inventário das dez chamadas de `useWideLayout()` está completo, e D-126 no lugar de D-125 está justificado pelo commit `f2ba7c5`.
  - **Escopo.** Só mudaram `apps/frontend/src`, `apps/frontend/tests` e os três registros. A worktree terminou o review com as mesmas 17 entradas no `git status`.

## Aceito sem prova completa

1. **Os três controles negativos** (a), (b) e (c) de D-126 vêm da execução do Developer, com as mensagens registradas e o `sha256` conferido depois de cada reversão. O Tech Lead não os refez.
2. **Os `side-by-side.png` de 38 dos 48 pares** foram conferidos só por pixel contra a base, não abertos.
3. **O teste instável de onboarding** (`[notebook-1024] onboarding-tom-da-ia › measured, logged in`) não foi investigado. A rota não usa `ListDetailLayout` e não foi tocada por este Goal.

## Observações registradas, sem mudar a decisão

1. **A comparação antes e depois difere entre Developer e Tech Lead só no método.** O Developer comparou sem limiar e achou 35 pares idênticos byte a byte e 13 com 2 a 61 pixels de suavização de borda. O Tech Lead, com limiar 30 e a base tirada por `git archive`, achou 46 pares com 0 pixels e 2 com 4 e 1 pixel. As duas execuções concordam no que o critério 5 pede: a porcentagem contra o protótipo é a mesma antes e depois nos 48 pares.
2. **O banco de desenvolvimento do scheduling-service do operador estava sem a migration do enum `CalendarSource` (D-120)** na rodada 1, e por isso a semeadura da conta visual falhou com 502. Ninguém aplicou a migration nesse banco: a rodada 2 e o review usaram bancos descartáveis. Quem precisar do `visual:compare` contra o ambiente de desenvolvimento tem de rodar antes o `prisma migrate deploy` do scheduling-service.
3. **A rodada 1 registrou os gates de validação como não rodados** e omitiu a falha do gate autenticado. A rodada 2 corrigiu o registro, e VALIDATION_GATE descreve o que aconteceu.
4. **O texto do Goal112 continua dizendo D-125.** Ele não foi editado; D-126 explica a troca.
5. **A observação 2 do [review105](105-review.md)** (a Importação troca a árvore quando `settings` chega depois) fica resolvida por este Goal, pelo item 4 de D-126.

## O que o aceite não prova

- O hub de Configurações (`/configuracoes`) na faixa estreita, onde o Negócio não existe (D-103 (d)): perder a edição dele ao estreitar continua acontecendo, por desenho.
- O foco do campo de busca de `/clientes` e `/servicos` ao cruzar 1024 px: o valor fica, mas o nó é refeito e o foco sai (itens 3 e 4 do inventário de D-126).
- Guardar estado entre navegações de rota, em armazenamento local ou na URL.
- Um aparelho real girando: a prova é por simulação de `matchMedia` em jsdom e pelas capturas do `visual:compare` nas quatro larguras, não por rotação física de tablet.
- As divergências contra o protótipo que vêm do estado da conta de teste, que já existiam e continuam.
