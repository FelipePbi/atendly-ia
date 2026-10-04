# Review formal — Goal 068

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-29, conforme o [Goal068](../goals/068-fidelidade-visual-marca-e-autenticacao.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–067, 070, 071 e 073) foi reaberto, reavaliado ou revertido. **Cinco rodadas**: as rodadas 1 a 4 terminaram `CHANGES_REQUIRED`, com 4, 3, 3 e 3 blockers, e a rodada 5 terminou com zero.

O Goal corrige **G-01…G-07**, **C-05…C-10** e **L-06…L-08** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. A marca passa a ser o "A que confirma" do `Marca.dc.html`, em SVG de uma cor com `currentColor`, e o wordmark usa Literata. O favicon vira SVG, e os assets mortos saem de `public/`. A assinatura anima uma vez por sessão do navegador: os três traços na entrada, só o check na sidebar. As telas de entrada usam painel Petróleo e compõem por largura. A Home saiu deste Goal para o **Goal074** ([D-087](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `2995be57e34d74cf1ca4e62d70f541856bb118a7` (Goal073). Base imediata da implementação: `5216cfe01aa4a29fbc83cfd24b32e13aef176eb0`, HEAD da worktree `.ai-worktrees/goal-068`, inalterado nas cinco rodadas. O commit `5216cfe` é só documental (fechamento do Goal073 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos**, hash do diff `72202a7e7eb3c2c611bf0fbeb51e617532d36e115c81c32c3ac1199c432f1fbe`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Dezoito entradas rastreadas**, por `git diff --numstat 5216cfe`:
  - `apps/frontend/src/`: `shared/ui/Brand.tsx` (+109/−1), `shared/styles/avenly.css` (+300/−43), `features/auth/AuthScreen.tsx` (+43/−70), `app/layout.tsx` (+1/−1, ícone para o SVG novo) e `shared/layout/AppShell.tsx` (+1/−1, `signature="check"` só no `Brand` da sidebar, linha 155).
  - Nove removidos de `apps/frontend/public/`: os quatro PNGs antigos de `brand/` (`atendly-favicon-32x32.png`, `atendly-favicon-512x512.png`, `atendly-logo-horizontal.png`, `atendly-logo-icon.png`) e os cinco SVGs de exemplo do Next (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`).
  - Os quatro documentos de `docs/migration/`, só por acréscimo no snapshot aceito (nenhuma linha removida): `CURRENT_STATE.md` (+132), `DECISIONS.md` (+33, D-087), `FINAL_AUDIT.md` (+132, §48) e `VALIDATION_GATE.md` (+176).
- **Quatro arquivos novos**: `apps/frontend/public/brand/avenly-icon.svg` e os testes `apps/frontend/tests/goal068-marca.test.tsx` (**106** linhas), `goal068-assinatura.test.tsx` (**321** linhas) e `goal068-telas-de-entrada.test.tsx` (**192** linhas).
- Nenhum contrato, BFF, orquestrador, Scheduling, `packages/`, migration, `scripts/` ou `tools/ia-loop/` foi tocado. Nenhuma configuração de teste mudou. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados.

## Rótulos das notas de correção nos documentos

As notas por acréscimo em FINAL_AUDIT §48, VALIDATION_GATE e CURRENT_STATE usam uma numeração própria, que não coincide com as rodadas do IA Loop a partir da terceira:

- "Rodada 2" nos documentos é a correção da rodada 2 do IA Loop (blockers da revisão 1).
- A correção da rodada 3 do IA Loop (blockers da revisão 2) **não escreveu adendo**, e isso virou o blocker 3 da revisão 3.
- "Rodada 3" nos documentos é a correção da rodada 4 do IA Loop (blockers da revisão 3).
- "Rodada 4" nos documentos é a correção da rodada 5 do IA Loop (blockers da revisão 4), a árvore aceita.

As seções dos documentos não foram renumeradas no fechamento. Este review usa a numeração do IA Loop.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

Já estava correto: marca em SVG, wordmark, remoção dos assets, textos C-05/C-06/L-07, mock `aria-hidden`, painel Petróleo e gates. Os quatro blockers:

1. **A sidebar nunca recebia `signature="check"`.** `AppShell.tsx` não estava no diff, então o check nunca animava na área logada. D-087, CURRENT_STATE e FINAL_AUDIT §48 afirmavam o contrário. Os testes montavam `Brand` isolado, não a casca.
2. **O favicon não tinha o respiro do ícone de `Marca.dc.html`.** Os traços ficavam em escala 1:1 na grade 64, com as pontas nas bordas e fora do canto arredondado.
3. **A folha de raio 24px do celular era invisível.** `.entry-main` e `.entry-shell` usavam o mesmo `--surface`, sem sobreposição do Petróleo.
4. **Evidência a refazer depois das correções**, e os documentos não declaravam que `/nova-senha` fica fora de `PUBLIC_ROUTES` e provada só em jsdom (§4 do Goal).

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

O código dos três primeiros blockers estava correto: sidebar com `signature="check"`, favicon em grade 120 com o símbolo em 80/120, e `.entry-main` com `margin-top: -24px` e `z-index: 1` abaixo de 768px. Os três blockers eram entregas parciais:

1. **Faltava o teste jsdom que renderiza `AppShell` de verdade.** Sem ele, a regressão da rodada 1 continuaria passando a suíte.
2. **Faltava nos documentos a declaração do §4 sobre `/nova-senha`.**
3. **Os documentos citavam um gate autenticado com `flaky` 1 e 1 retentativa**, contra o critério de 0 retentativas.

## Rodada 3 — CHANGES_REQUIRED (3 blockers)

A declaração de `/nova-senha` entrou nos três documentos, e o teste de `AppShell` entrou só em parte. Os três blockers:

1. **O lint reprovava** no import do teste novo (`simple-import-sort/imports`).
2. **Faltavam duas asserções do teste da casca**: a segunda montagem não anima a sidebar de novo, e o `Brand` do cabeçalho do celular nunca recebe `brand-mark--check`. O diff também tinha posto `signature="check"` no cabeçalho do celular (`AppShell.tsx:273`), fora do §2 do Goal.
3. **Nenhum adendo documental da correção**, e os documentos ainda diziam "lint exit 0" e **1030** testes, os dois falsos na árvore.

## Rodada 4 — CHANGES_REQUIRED (3 blockers)

O lint foi corrigido e as duas asserções entraram (14/14). Os três blockers:

1. **`AppShell.tsx:273` continuava com `<Brand signature="check" />`.** O cabeçalho só ficava parado porque a sidebar, antes no JSX, consumia a mesma chave de sessão primeiro.
2. **O controle negativo da sidebar e os sete controles do §6 não tinham sido rodados** depois da última edição.
3. **O adendo documental dizia que o gate com `flaky` 1 "continua valendo"**, e não citava a execução limpa que existia na árvore.

## Rodada 5 — ACCEPTED (0 blockers)

- **B1:** `AppShell.tsx:273` voltou a `<Brand />`. Só a sidebar (`AppShell.tsx:155`) tem `signature="check"`. O §2 do Goal vale por construção, sem depender da ordem do JSX.
- **B2:** o controle negativo da sidebar e os sete controles do §6 estão em FINAL_AUDIT §48 (seção "Rodada 4"), com `sha256sum` antes, durante e depois, saída real e restauração idêntica.
- **B3:** o adendo documental cita a execução final real e corrige a frase "154/`flaky` 1 continua valendo".
- `Brand.tsx` segue o §1 e o §2: SVG de três traços, `currentColor`, `aria-hidden`, chave em `sessionStorage` por assinatura. `prefers-reduced-motion: reduce` e a falta de `sessionStorage` deixam o símbolo completo e parado.

Prova declarada pelo Developer, na execução final sobre a árvore aceita:

- `npx vitest run` (`apps/frontend`): **99**/**99** arquivos e **1033**/**1033** testes, baseline **96**/**1000**. Os **3** arquivos e **33** testes a mais são os três `goal068-*.test.tsx`.
- `npm run lint` e `npx tsc --noEmit` (`apps/frontend`): exit 0.
- `validate:core`: **17** passos, **15** `passed`, **0** `failed`, **2** `skipped`.
- `validate:ui`: `expected` **169**, `skipped` **21**, `unexpected` **0**, `flaky` **0**, sem mudança.
- `validate:integration`: **35**/**35** passos, contra PostgreSQL 18 descartável em loopback. Gate autenticado com `startTime` `2026-09-29T06:18:27.839Z`: `expected` **155**, `unexpected` **0**, `flaky` **0** e **0** retentativas, sem mudança de rota.
- Oito controles negativos (sidebar e os sete do §6), todos com exit 1 e restauração conferida por hash.

Conferido na revisão: `goal068-*.test.tsx` **33**/**33**; `npm run test:gate` **233**/**233**; `e2e-results/authenticated/results.json` com 155/0/0/0; `e2e-results/results.json` com 169/21/0/0; `git status` com 22 entradas, só as declaradas; nenhuma referência restante aos assets removidos; escopo limitado a `apps/frontend/` e aos documentos do §7.

## Observações registradas, sem mudar a decisão

1. **A composição entre 1024px e 1279px não é "card sobre Petróleo cheio".** Nessa faixa, `avenly.css` põe o painel Petróleo à esquerda (440px) e o card sobre papel à direita. Só entre 768px e 1023px o card fica sobre Petróleo cheio. O §3 do Goal pede "os dois sobre Petróleo", e o protótipo só diz "formulário à direita". D-087 item 4, CURRENT_STATE e FINAL_AUDIT §48 descreviam a faixa de forma errada. O fechamento acrescentou uma nota de correção nos três, e a escolha fica na conferência humana do §8.
2. **O adendo "Rodada 4" não repete `test:gate` 233.** A contagem está nas seções anteriores do §48, nenhum script mudou, e ela foi confirmada por WU-08 e por esta revisão.
3. **O título de um teste ficou defasado.** Em `goal068-assinatura.test.tsx:258`, o nome ainda diz "a sidebar consome a sessão primeiro". A asserção agora vale sem depender da ordem.
4. **O Goal custou cinco rodadas por entrega parcial.** Nas rodadas 2 a 4, blockers já nomeados foram entregues pela metade, e o relatório do Developer não citou o que faltava.

## O que o aceite não prova

- Que a marca, a assinatura animada e as telas de entrada, num aparelho real nas cinco larguras, batem com `Marca.dc.html`, `Movimento.dc.html` e os três protótipos de login. A conferência humana do §8 do Goal **não foi feita**.
- Que a saudação neutra "Boas-vindas de volta." é aceitável no lugar de "Bem-vinda de volta." do protótipo. É divergência declarada em D-087, para a mesma conferência humana.
- A fidelidade visual da Home (Goal074), de Agenda, Clientes, Serviços, Conversas e Notificações (Goal069) e do onboarding (Goal072), além da troca de marca.
- Mudança em campos, validação, regra de senha, aceite ou recuperação por link: nada disso mudou, e D-082 continua valendo.

Veredito do FINAL_AUDIT, sem mudança: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §48](../FINAL_AUDIT.md)).
