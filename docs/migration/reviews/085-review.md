# Review formal — Goal 085

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, conforme o [Goal085](../goals/085-acabamento-da-casca-da-agenda-e-dos-estados.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–084, 086 e 087) foi reaberto, reavaliado ou revertido.

O Goal corrige dois achados do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080) em que a casca diz algo diferente do que acontece. **R-06:** com o WhatsApp desconectado, o cartão da IA na sidebar dizia "IA ativa" e oferecia "Pausar", e o banner da casca dizia "Atendimento automático parado". **R-10:** a sidebar e o conteúdo terminavam antes do fim da janela. O Goal também leva `/inicio` com o WhatsApp desconectado ao quadro **H3** do protótipo. A decisão é [D-102](../DECISIONS.md), aceita neste review.

## Escopo e identidade do diff

- Baseline aceita vigente: `df620394401ea9391697288cd67aefa0a6d9fbc8` (Goal087). Base imediata da implementação: `05c92fc17a5311d024bf69033e5c6eaa696a1490`, HEAD da worktree `.ai-worktrees/goal-085`, inalterado nas duas rodadas. Entre `df62039` e `05c92fc` há só documentação: o fechamento do Goal087 e o registro do pente-fino visual.
- Snapshot aceito, calculado pelo IA Loop: **19 arquivos**, hash do diff `7e19b878196d7b6e2d087493a561018b9a5d50e74add3fbb6d714b0beb357fb0`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os 19 arquivos, por `git diff --numstat 05c92fc` no snapshot aceito:
  - Frontend de produção: `src/shared/styles/atendly.css` (+94/−5), `src/shared/runtime/systemStatus.tsx` (+47), `src/features/dashboard/DashboardScreen.tsx` (+43/−3), `src/shared/layout/AppShell.tsx` (+34/−34), `src/shared/layout/ShellConfig.tsx` (+3/−2), `src/app/(platform)/layout.tsx` (+1/−1), `src/features/conversations/ConversationThread.tsx` (−1), `src/shared/icons/Icon.tsx` (+1) e `public/icons/atendly-icons.svg` (+1).
  - Gate autenticado, só por acréscimo: `e2e/authenticated-matrix.spec.ts` (+62, G-3) e `e2e/measure.ts` (+30, `measureSidebarSpan`).
  - Testes: `tests/goal085-shell-states.test.tsx` (arquivo novo, +326, **27** testes, provas 1 a 3), `tests/goal085-shell-css.test.ts` (arquivo novo, +131, **4** testes, provas 4 e 5) e asserções ajustadas em `goal022-notifications-chrome` (+8/−2) e `goal087-shell-navigation` (+3/−1).
  - Documentos: `docs/migration/CURRENT_STATE.md`, `DECISIONS.md` (D-102), `FINAL_AUDIT.md` (§62) e `VALIDATION_GATE.md`.
- Nenhuma rota, contrato, migration, variável de ambiente, campo ou serviço mudou. `apps/bff/PUBLIC_API_V1.md`, o vault, `docs/design-reference/`, `e2e/visual/targets.json`, `KNOWN_*`, configurações de Playwright e Vitest, sementes e passos de `validate:*` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 3 blockers.** O Tech Lead rodou `visual:compare -- --target H3` e abriu os quatro `side-by-side.png`. O código estava correto e fiel ao H3: cartão da IA, faixa com "Reconectar WhatsApp" em largura total e ausência do banner repetido. Os blockers eram de evidência e de documentação:
   1. O diff não tocava nenhum documento de `docs/migration/`: faltavam D-102, FINAL_AUDIT §62, CURRENT_STATE e VALIDATION_GATE.
   2. Os quatro controles negativos do §6 não tinham rodado. A WU-11 ficou bloqueada atrás da WU-10, que falhou por ambiente: `validate:integration` sem os quatro `*_TEST_DATABASE_URL`.
   3. A comparação visual estava incompleta. O relatório tinha perdido os percentuais da baseline e, nas telas irmãs, citava só o desktop.
2. **Rodada 2 — `ACCEPTED`, 0 blocker.** O delta da rodada 1 para a 2 é só os quatro documentos. Os patches das duas rodadas trazem os mesmos blobs em cada arquivo rastreado de código e de teste, e o hash dos dois arquivos de teste novos não mudou. A última edição de código continua a de `atendly.css` às `2026-10-01T08:38:14Z`. Nesta rodada, o Developer rodou depois dela:
   - a execução final;
   - o `visual:compare` contra a baseline `05c92fc`, numa cópia temporária fora da worktree, e sobre a árvore final;
   - os quatro controles negativos.

## O que o Tech Lead conferiu na rodada 2

- `visual:compare -- --target H3` na worktree: 8,1 / 4,1 / 3,7 / 3,0 % (mobile / tablet em retrato / tablet em paisagem / desktop). Leitura dos quatro `side-by-side.png`, com recortes em resolução cheia do cartão e da faixa no desktop:
  - Cartão da sidebar e faixa iguais ao H3: fundo de perigo, ícone `ban`, título, apoio, "Reconectar", botão de 44 px em largura total, largura e altura da faixa.
  - Sem banner repetido em `/inicio`.
  - Saudação 16 px mais baixa no celular e faixa 3 a 4 px mais baixa no tablet e no desktop. São os mesmos deslocamentos do H1 aceito no Goal087, por espaçamento que este Goal não toca.
- `visual:compare` de H1 e A1: os números coincidem com os documentos e nada quebrou. No A1 desktop o cartão cabe na sidebar, sem sobrepor `main`.
- Código:
  - `aiCardView` é pura e dá prioridade ao WhatsApp `off`. `IaCard` consome só esse derivado.
  - `whatsappInBand` é ligado só no ramo com dados da chamada única de `useShellConfig` da Home, e fica desligado com a agenda em erro.
  - A sidebar é `position: fixed` com `inset-block: 0`, e `main` fica na coluna 2 a partir de 1100 px.
  - `html` mantém o fundo `var(--bg)`. O `z-index` 40 da sidebar fica abaixo de dialog, toast e overlays.
  - `showMobileHeader` não aparece mais em `src/`.
- Proveniência, em disco:
  - `sha256` de `systemStatus.tsx`, `AppShell.tsx` e `atendly.css`: iguais aos de VALIDATION_GATE.
  - `mtime` de `atendly.css`: `2026-10-01T08:38:14Z`.
  - `e2e-results/authenticated/results.json`: `startTime` `2026-10-01T08:57:34.803Z`, **205** `expected`, **0** `unexpected`, **0** `flaky`, **10** testes G-3 e **0** retentativas.
  - Uma corrida de `validate:ui` posterior: **169** `passed`, **21** `skipped`, **0** `unexpected`.
- Os quatro arquivos de teste tocados passam: **60**/**60**.
- `git status` só com os 19 caminhos do snapshot, sem `e2e-results/`.

## Evidência final aceita

Os números estão em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal085), em [VALIDATION_GATE](../VALIDATION_GATE.md) e em [FINAL_AUDIT §62](../FINAL_AUDIT.md).

- `visual:compare` do H3 (mobile / tablet em retrato / tablet em paisagem / desktop): **8,1 / 4,1 / 3,7 / 3,0**, contra 14,9 / 9,0 / 9,6 / 8,4 na baseline `05c92fc`. A porcentagem é tendência; a decisão veio da leitura dos `side-by-side.png`.
- Telas irmãs, com causa medida e aceita para cada piora:
  - **H1** sobe nos quatro devices (11,8 / 5,5 / 4,8 / 4,2 para 12,6 / 7,4 / 8,4 / 7,1). A conta visual está no estado do H3, e a faixa do app agora tem cerca de 130 px, a altura da faixa do H3, contra cerca de 67 px no quadro H1. Todo o conteúdo abaixo dela desce cerca de 64 px.
  - A1, CL1, S1, C1 e M1 ficam iguais à baseline nos três primeiros devices e sobem +0,1 ponto no desktop. O único aumento fica na coluna da sidebar (x < 232 px): o cartão da IA com a desconexão difere do cartão "IA ativa" desses quadros, cerca de 1300 pixels a mais. Fora da sidebar, a contagem de pixels diferentes não mudou.
- Testes de frontend: **131** arquivos e **1390** testes, contra **129**/**1359** na baseline. Os 2 arquivos e os 31 testes novos são os de `goal085-*`. `tsc --noEmit` e `lint` com exit 0.
- `validate:core`: exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff` e `test:health-worker`).
- `test:gate`: **233**/**233**.
- `validate:ui`: **169** `passed`, **21** `skipped`, **0** `flaky`, **0** retentativas.
- Gate autenticado: **205** testes (**195** da baseline mais **10** de G-3), **0** `unexpected`, **0** retentativas.
- Quatro controles negativos do §6, por edição real em arquivo de produção, cada um restaurado com o `sha256` idêntico ao de antes:
  1. `aiCardView` ignora o WhatsApp: 7 falhas em 27.
  2. `IaCard` monta o texto direto de `aiView`: 1 falha em 27.
  3. O banner volta em `/inicio` com o painel carregado: 1 falha em 27.
  4. `.sidebar` volta a ter `height: 100dvh`: 1 falha em 4.

## Aceito sem prova completa

Os quatro documentos já declaram estes pontos, exceto o 1, que este review acrescenta.

1. **`validate:integration` completo vem só da declaração do Developer.** No harness, a WU-10 ficou `SKIPPED`. O Developer declara **36**/**36** passos contra um PostgreSQL 18 descartável local. O Tech Lead conferiu em disco só o passo do gate autenticado.
2. **Os controles negativos do §6 não foram reexecutados pelo Tech Lead.** Foram conferidos pelo `sha256` dos arquivos e pelo registro em VALIDATION_GATE.
3. **R-10 não reproduz no Chromium do Playwright.** A prova vermelha é a guarda sobre a folha de estilo (`goal085-shell-css.test.ts`). G-3 é medida de regressão, não reprodução do defeito. Este é o limite (e) de D-102.
4. **"IA ativa" com "Pausar" nas outras combinações** está provado em jsdom, não na imagem. A conta visual está com o WhatsApp desconectado e a IA desligada.

## Divergências declaradas, aceitas

1. A frase "Tentamos reconectar por 5 minutos sem sucesso." do H3 não entra: o app não tem dado que a sustente (D-102, divergência 1).
2. Dados da conta de teste que não são layout: checklist "Ative sua IA", datas, números e o sino sem o ponto vermelho (D-102, divergência 2).
3. A conta que nunca conectou o WhatsApp aparece como "desconectado". `GET /v1/status` não distingue os dois casos, e o quadro H4 é de outro Goal (D-102, divergência 3).
4. Notificações na sidebar do desktop e a barra do iPhone, por D-101.

## Observações registradas, sem mudar a decisão

1. **D-101 (d).** Com o WhatsApp desconectado, o cartão da IA deixa de usar só `status.aiView`. Em todas as outras combinações, D-101 (d) vale sem mudança. A nota de fechamento de D-101 registra isso.
2. **Ordem das unidades no harness.** Na rodada 1, a WU-11 (controles e documentos) dependia da WU-10 (`validate:integration`). Quando a WU-10 falha só por ambiente, essa dependência bloqueia trabalho que não precisa dela. É ajuste do harness, fora do escopo deste Goal.
3. **R-08 e R-09** continuam abertos. Nenhum arquivo de Clientes ou de Agenda foi editado. Eles pertencem aos Goals que levarem Clientes ao quadro CL1 e a Agenda ao quadro A10.
4. **Perfil de execução.** O Goal declarava `SONNET_HIGH`.

## O que o aceite não prova

- A conferência do §7 do Goal **não foi feita**: abrir o navegador em que Felipe viu R-10, com zoom e com a janela redimensionada, e ver a sidebar e o conteúdo chegarem ao fim da janela. Também não foi feito ver a sidebar e a Home com o WhatsApp desconectado de verdade e a IA ativada.
- Os estados H4 a H7 do cartão da IA e da faixa: IA inativa, pausada, com instabilidade e a folha de pausa.
- A fidelidade do conteúdo próprio das outras telas logadas (A1, CL1, S1, C1, M1).
- Renderização fora das quatro dimensões do `visual:compare` e das cinco larguras do `validate:ui` e do gate autenticado.
