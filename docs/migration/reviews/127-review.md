# Review formal — Goal 127

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal127](../goals/127-as-duas-conclusoes-do-onboarding-iguais-ao-prototipo-ia-ativa-e-configurada-sem-whatsapp.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 1 saiu `CHANGES_REQUIRED` com 1 blocker só de documentação; o IA Loop aceitou a rodada e adiou a correção para este fechamento, sem nova rodada do Developer. A correção foi aplicada aqui, só em `docs/migration/`.

As duas conclusões do onboarding ficam iguais aos quadros 4.9 ("IA ativa", `/onboarding/teste-real-sucesso`) e 4.10 (configurada sem WhatsApp, `/onboarding/whatsapp-concluido`) nos quatro devices, salvo as divergências declaradas em D-141. A 4.9 só mostra os anéis com a IA `ACTIVE` e só mostra a pílula "IA ativa · +55 …" com a IA `ACTIVE` e o WhatsApp `CONNECTED`, lidos da mesma resposta de `GET /v1/status`. A 4.10 tem a pílula fixa "IA inativa até conectar", "Ir para o início" antes de "Conectar agora" e o quarto segmento da barra vazio (revê D-104 só nisso e na ordem das ações). Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-141](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `c53a0111e8e31f689ae51d5cce7f41692f6bc14a` (Goal126). Base imediata da implementação: `49121d47a4ef0e58dfcfffad62474fb983dab2b5` (fechamento do Goal126 e preparação do Goal127), HEAD da worktree `.ai-worktrees/goal-127`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **16 arquivos** (13 rastreados e 3 novos não rastreados), hash do diff `584c5c74dcd9919316782120023b8f5b1d9be2bb8c79f2ac2ec3bfdb12c188a6`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (7): `features/onboarding/OnboardingShell.tsx` (propriedade `completion`), `OnboardingScreen.tsx` (`completion` nas duas etapas e a ordem das ações da 4.10), `blocks.ts` (`chapterFraction("whatsapp-concluido")` em 0 e os quatro capítulos `done` em `teste-real-sucesso`), `blocks/activation-test.tsx`, `blocks/whatsapp.tsx` (`WhatsappConclusion`), `features/activation-test/ActivationTestPanels.tsx` (`ActivationTestOnboardingSucceeded` e `useAiActiveStatus` com `whatsappStatus` e `phoneNumber`) e `shared/styles/avenly.css` (a moldura, `at-breathe-lg`, `at-pop` e `prefers-reduced-motion`);
  - `apps/frontend/tests/` (3, novos): `goal127-conclusao-ia-ativa.test.tsx`, `goal127-conclusao-sem-whatsapp.test.tsx` e `goal127-alvos-captura.test.ts` (45 testes);
  - a captura e o gate (3): `apps/frontend/e2e/visual/targets.json` (4.9 com `responses` só de `GET`, 4.10 sem), `scripts/tests/visual-responses.test.mjs` (de 54 para 55 testes) e `apps/frontend/e2e/routes.ts` (as duas rotas em `ONBOARDING_ROUTES`);
  - `docs/migration/` (3, por acréscimo): D-141 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal127 em `VALIDATION_GATE.md`.
- Todos dentro da lista permitida do Goal. `scripts/visual-compare.mjs` e `scripts/lib/visual-responses.mjs` não mudaram. O documento do Goal127 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — review `CHANGES_REQUIRED`, 1 blocker só de documentação; decisão efetiva `ACCEPTED`, com a correção adiada para o fechamento.** O review DEEP aprovou o código, os testes, a captura e os gates. O blocker: a seção do Goal127 no `VALIDATION_GATE.md` registrava `validate:ui` e `validate:integration` como "não executado" pelo Developer, "para a verificação do harness", na tabela de contagens e em "Não executado". Os dois rodaram e passaram na árvore final da rodada (WU-11 e WU-12, saída 0), e o Goal exige na seção as contagens da execução final de todos os gates, com o gate autenticado.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `VALIDATION_GATE.md`, seção do Goal127 (blocker 1 adiado):
   - a primeira frase passou a dizer que a captura, a fidelidade, os controles negativos e os registros são da WU-03 e que as contagens são as da execução final, na verificação determinística do IA Loop (WU-04 a WU-13);
   - a linha de `validate:ui` passou a "**169** `passed` e **21** pulados, retries 0";
   - a linha de `validate:integration` passou a "PASSED, **36** de 36 passos, 0 falhas, 0 pulados; gate autenticado (`rehearse:goal033-authenticated-ui`) com **290** `passed` e 0 retentativas (baseline 280: +10, as duas rotas nas cinco larguras 360, 390, 768, 1024 e 1440)";
   - "Não executado" ficou só com a conferência em aparelho real.
2. D-141 e o delta do Goal127 em `CURRENT_STATE.md` não diziam que esses gates não rodaram; não precisaram da correção.
3. `DECISIONS.md`: o status de D-141 passou a ACCEPTED, com a nota de fechamento.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal127), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal127) e em D-141.

- **Gates do IA Loop, rodada 1, na árvore aceita:** typecheck (WU-04), lint (WU-05), testes alvo (WU-06, 3 arquivos e 45 testes), suíte do frontend (WU-07, 177 arquivos e 2318 testes), `test:gate` (WU-09, 288), `validate:core` (WU-10, 17 passos com 15 passando e 2 pulados, `test:bff` e `test:health-worker`), `validate:ui` (WU-11, 169 passando e 21 pulados, retries 0), `validate:integration` (WU-12, 36 de 36 passos, gate autenticado 290 com 0 retentativas) e `git diff --check` (WU-13), todos com saída 0. WU-08 (`test:ia-loop`) foi pulada como não aplicável: o repositório não tem o script.
- **Controles negativos do Developer (rodada 1):** (a) a pílula sem a condição da IA reprovou 3 de 45; (b) a pílula sem a condição do WhatsApp, 2 de 45; (c) o texto fixo de "ativa" no lugar de `aiActiveCopy(view)`, 6 de 45; (d) "Conectar agora" antes de "Ir para o início", 1 de 45; (e) o 4.9 de `targets.json` com a execução `FAILED`, 1 de 55 em `visual-responses.test.mjs` e 1 em `goal127-alvos-captura.test.ts`. Cada mutação foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **Código:** a moldura `completion` só é ligada nas duas etapas de conclusão. `ActivationTestOnboardingSucceeded` reaproveita a leitura única de `GET /v1/status`, que passa a expor `whatsappStatus` e `phoneNumber`; `GET /v1/activation-test` continua com uma leitura. O texto vem de `aiActiveCopy(view)`, os anéis só aparecem com `view === "active"` e a pílula só com IA `ACTIVE` e WhatsApp `CONNECTED`, mostrando só "IA ativa" quando o número falta ou não é reconhecido. `ActivationTestSucceeded` e Configurações › IA ficam intactos. Na 4.10, a pílula é fixa, "Ir para o início" vem antes de "Conectar agora" no DOM e `chapterFraction("whatsapp-concluido")` dá 0; `progressPercent` não muda. As `@keyframes` novas são declaradas uma vez, com o bloco de `prefers-reduced-motion`.
  - **Captura:** a 4.9 tem só os dois `GET` fixos (execução `SUCCEEDED` e status ativo) e nenhum passo; a 4.10 não tem `responses` nem passos. As duas rotas entram em `ONBOARDING_ROUTES` e são medidas pelo gate autenticado nas cinco larguras (+10 no gate autenticado).
  - **`visual:compare` de 4.9 e 4.10:** refeito pelo Tech Lead, com 4.9 em 0,7/0,6/0,7/0,5% e 4.10 em 1,3/0,6/0,7/0,7% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos percentuais do Developer. Os oito `side-by-side.png` foram abertos e as faixas de pixels de `prototype.png` foram medidas contra `app.png`. A arte, o título, o texto, a pílula e os botões ficam a no máximo 1 px do quadro nos quatro devices. O título da 4.10 fica 2 a 3 px mais largo no total, por renderização de glifo (mesma família, tamanho e peso), coberto pela divergência de cerca de 1 px nos títulos declarada em D-141.

## Divergências aceitas

Declaradas pelo Goal ou por D-141, conferidas nas capturas:

1. A nota de limpeza "O agendamento e o cliente de teste foram removidos do seu negócio." abaixo da pílula na 4.9 (Goal019 §6), que o quadro não tem.
2. O "Sair" do topo (mobile e tablet em retrato) e do rodapé da sidebar (a partir de 1024 px), nas duas telas, que vêm de D-104.
3. A barra de status e o indicador de início do iPhone nos quadros mobile.
4. O ruído pequeno dos anéis animados da 4.9 e diferenças de cerca de 1 px em alguns títulos (na 4.10, 2 a 3 px de largura total no título).

## Observações sem bloqueio

1. Os itens da sidebar ficam 2 px abaixo do quadro (por exemplo, 110 para 111 e 148 para 150). Isso vem da casca de D-104 e já existe igual nos alvos aceitos 4.1 e 4.6; corrigir aqui mudaria as outras etapas.
2. `.onboarding-content.is-completion` usa `justify-content: center` dentro de `overflow-y: auto`. Em alturas muito baixas (por exemplo, celular em paisagem), o topo da arte pode ficar fora do alcance da rolagem; `safe center` resolveria. A nota de limpeza, posicionada em absoluto, pode exigir rolagem em 360×640.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer, na rodada 1; o Tech Lead não os refez.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` de 4.9 e 4.10.
3. **A regressão de 0, 2.6, 4.1 e 4.6** é a do Developer (o `app.png` dos 16 pares igual byte a byte ao de antes); o Tech Lead não a refez.
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.
