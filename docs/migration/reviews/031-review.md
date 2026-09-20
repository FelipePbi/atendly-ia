# Review formal — Goal 031

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-20, conforme o [Goal031](../goals/031-alvo-de-toque-real-nas-telas-publicas.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–030) foi reaberto, reavaliado ou revertido — em particular, o aceite do [Goal030](030-review.md) e o registro histórico de A-01 em [FINAL_AUDIT](../FINAL_AUDIT.md) §6 continuam como estavam. Quatro rodadas: três `CHANGES_REQUIRED` (2, 3 e 3 blockers) e o aceite na quarta, com zero blockers.

O Goal tinha duas pontas indissociáveis — corrigir a régua de medição de alvo de toque e corrigir o alvo que era defeito real — e um risco próprio nomeado no enunciado: **afrouxar a medição para fazer o único `BLOQUEADOR-MVP` desaparecer**. As três rodadas de `CHANGES_REQUIRED` foram, todas, sobre esse risco: cada vez que a régua nova podia aprovar um controle real abaixo de 24px, ou que um documento vigente enunciava uma régua mais ampla do que o código executa, o aceite foi negado.

## Escopo e identidade do diff

- Baseline aceita vigente: `d37e1fe5646131a1acbc3e95c585d402dfb80f33` (implementação do Goal030). Base imediata da implementação: `14eea85215df16b279be4394045f7ed3baebb099` (fechamento do Goal030), HEAD da worktree `.ai-worktrees/goal-031`, inalterado nas quatro rodadas.
- Snapshot aceito, calculado pelo IA Loop: **9 arquivos**, hash do diff `7476ea10767c2cddbbc4cb17c01baf5e1f662e2e4764864283a15e0de35a5d83`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **gate renderizado** 1 arquivo (`apps/frontend/e2e/viewport-matrix.spec.ts`); **produto** 2 arquivos (`apps/frontend/src/features/auth/AuthScreen.tsx`, `apps/frontend/src/shared/styles/atendly.css`); **teste jsdom existente** 1 arquivo (`apps/frontend/tests/goal024-settings-shell-invariant.test.tsx`); **documentação** 5 arquivos em `docs/migration/`.
- **Nenhum arquivo fora de `apps/frontend/` e `docs/migration/` mudou.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota, nenhum contrato público, nenhum arquivo de `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/` ou `scripts/`. `apps/frontend/e2e/routes.ts` e `accessibility.spec.ts` intocados: nenhuma rota autenticada entrou no gate e nenhuma regra de axe foi afrouxada.
- Inspecionado o patch completo de cada rodada contra a worktree, não contra o relatório do Developer. Nenhum arquivo foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (2 blockers)

O núcleo já estava certo — correção do alvo, não do input escondido; `KNOWN_SMALL_TARGETS` vazia com o mecanismo e a asserção de exceção obsoleta intactos; limiares 24/44 e tolerância de overflow inalterados; guard de contagem zero presente. Os dois blockers:

1. **Régua afrouxada além do que o Goal §1 autoriza.** `associatedLabel()` usava `el.closest("label")` para qualquer controle coletado e unia a caixa do label à do controle. Consequência verificável na árvore: o botão de revelar senha (`<button className="field-action">`) está aninhado em `<label className="field">`, e clique no label não o ativa — mesmo assim ele passaria a ser medido pela caixa do campo inteiro. Encolhê-lo para 10×10 deixaria o gate verde. É exatamente o afrouxamento que o Goal nomeia como risco único.
2. **Documento vigente com medida errada de elemento visível.** FINAL_AUDIT §8 e CURRENT_STATE atribuíam 13×13px ao `<span class="check-box">`, que é 22×22; os 13×13 eram o tamanho intrínseco do `<input>` nativo escondido, que era o que a régua antiga media.

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

O blocker 2 fechou. O blocker 1 fechou só na parte citada literalmente — `associatedLabel()` passou a exigir `INPUT` visualmente escondido, e o `<button>` do olho deixou de herdar a caixa do campo —, mas duas instruções do mesmo blocker foram descartadas sem uma palavra no relatório:

1. **A união de retângulos continuava**, agora com furo novo e concreto: um `<input>` com `display: none` passa em `isVisuallyHidden()` e devolve caixa `(0,0,0,0)`, ancorando a união na origem do viewport; e um `label[for]` distante mede o vão entre os dois retângulos. Nenhuma das duas reproduzia nas sete rotas, mas é a mesma classe de risco.
2. **A mutação de controle negativo contra a regra criada nessa rodada não foi executada nem recusada.** Verde no gate não prova que a régua morde: nenhuma das três mutações existentes exercitava o gate novo `el.tagName === "INPUT" && isVisuallyHidden(el)`.
3. **Cinco passagens de documento — D-047 incluso — ainda enunciavam a regra ampla recusada na rodada 1**, que o código já não tinha. D-047 é o registro de decisão da régua: quem implementasse a partir dele restauraria o comportamento recusado.

## Rodada 3 — CHANGES_REQUIRED (3 blockers)

A união saiu (`targetBox = labelBox ?? ownBox`), fechando os dois furos latentes. Restaram:

1. **A mutação contra `.field-action` continuava sem rodar e foi substituída sem declarar a troca** por uma em `.auth-link--standalone`, que é um `<a>` sem label: `associatedLabel()` devolve `null` e o caminho é o mesmo da régua antiga. A mutação `.check` também não foi reexecutada depois de o caminho de medição mudar.
2. **A história das mutações contradizia o registro da rodada 1.** Código e três documentos diziam "três contra `.check`"; a rodada 1 tinha uma contra `.check`, uma desfazendo a correção do link e uma com botão temporário sem label. FINAL_AUDIT ainda chamava a mutação do link de "reexecutada", sendo que ela nunca tinha rodado naquela forma.
3. **Três passagens ainda enunciavam a regra ampla de união**: a linha G-31 de `GAP_ANALYSIS`, o título de D-047 e um trecho de FINAL_AUDIT §8.

## Rodada 4 — ACCEPTED, 2026-09-20

Os três blockers da rodada 3 fecharam, conferidos na árvore:

- **A mutação exigida rodou contra o alvo certo.** `.field-action` é `<button type="button">` visível, 44×44 (`atendly.css:434`–`:446`), aninhado em `<label className="field">` de `PasswordField` (`AuthScreen.tsx:119`–`:143`). Como `associatedLabel()` exige `INPUT` escondido, ele cai em `targetBox = ownBox`: encolhido a 16×16px, o gate ficou vermelho nomeando o `<button>` com a medida real e `exempt: null`, e foi revertido. A mutação `.check` foi reexecutada contra a árvore final — `<label>` a `height: 16px; overflow: hidden`, vermelho nomeando o `<input>` a 350×16px pela caixa do rótulo, nas duas rotas. É a prova que faltava de que o único ponto da régua capaz de afrouxar a medição morde.
- **A história das mutações passou a descrever a evidência que existe**: três mutações reais, uma por seletor (`.check`, `.auth-link--standalone`, `.field-action`), cada uma com comando e medida. A afirmação "três contra `.check`" sumiu. A mutação em `.auth-link--standalone` (115×16px) rodou na rodada 3, contra a mesma régua `targetBox = labelBox ?? ownBox` da árvore final.
- **A regra enunciada nos documentos é a regra que o código executa.** A linha G-31 de `GAP_ANALYSIS` diz "nunca a união das duas caixas", o título de D-047 passou a "caixa do rótulo associado, quando o controle é um `<input>` visualmente escondido", e FINAL_AUDIT e VALIDATION_GATE enunciam a regra estreita. §6 e §7 de FINAL_AUDIT estão intocados — o diff do arquivo é apêndice puro.

Verificação própria do reviewer sobre a árvore final: `git status --porcelain` lista só os 9 arquivos declarados, sem resíduo de mutação; o diff de `atendly.css` é apenas a regra `.auth-link--standalone` (+10 linhas); `npx playwright test -g "touch targets" --project=mobile-390` deu 7 passed nas sete rotas públicas. Gates do Goal: 6/6 exit 0, incluindo `validate:core` e `validate:ui` nos cinco projetos.

## O que o diff aceito entrega

- **Uma régua que mede o alvo, não o elemento.** Para um `<input>` visualmente escondido (`opacity: 0`, `visibility: hidden`, `display: none`) com `<label>` associado por aninhamento ou por `for`/`id`, a medição é a caixa do próprio rótulo; para qualquer outro controle, a caixa própria do elemento. Nunca a união das duas — união contra uma caixa degenerada `(0,0,0,0)` esticaria a região medida da origem do viewport. Geometria derivada do DOM, sem seletor, classe ou rota como caso especial.
- **Nada descartado em silêncio.** Todo controle coletado termina medido ou com `exempt` nomeado no código (`not-rendered`, `inline-link`); a contagem classificada por rota é anexada (8/14/4/2/3/2/2) e `expect(measured.length).toBeGreaterThan(0)` deixa vermelha a rota que parou de coletar.
- **A única correção de produto que a régua nova sustenta como defeito real.** O link `Voltar para entrar` de `/link-expirado` era 115×18px; com `auth-link--standalone` (`min-height: 24px`, `display: inline-flex`, `padding: 4px 2px`) passou a 119×29px em `mobile-360` e `mobile-390`. Alvo alargado por padding — nenhum input escondido foi acolchoado e nenhum se tornou visível.
- **Dois dos três achados de A-01 eram defeito de medição, não de produto.** `remember` e `terms` já eram `<input>` aninhado em `<label className="check">` com o texto inteiro clicável; nenhuma linha de produto mudou para eles.
- **`KNOWN_SMALL_TARGETS` vazia com o mecanismo vivo**, a asserção de exceção obsoleta estrita, os limiares 24/44 e a tolerância de overflow inalterados, o "confortável" de 44px ainda só reportado, e a isenção de link embutido em frase preservada verbatim.
- **Veredito recontado em [FINAL_AUDIT §8](../FINAL_AUDIT.md#8-fechamento-de-a-01--goal031-2026-09-20):** 0 achados `BLOQUEADOR-MVP` (era 1), 11 `PENDENCIA-POS-MVP` e 7 `LIMITE-DECLARADO` sem alteração.

## O que este aceite não cobre

- **Fidelidade visual.** Nenhum documento do diff afirma fidelidade provada por teste; o alargamento do link é mudança visível e continua sendo conferência humana.
- **A-02.** Nenhuma tela autenticada é medida pelo gate renderizado; o achado continua aberto, sem Goal atribuído, e estender o gate a rota autenticada segue sendo decisão de escopo própria, não tomada.
- **Os demais achados A-03 a A-19.** Nenhum foi corrigido nem reclassificado por este diff.
- **Conformidade do produto como um todo.** O aceite é deste diff: régua corrigida, um alvo corrigido e a recontagem de A-01. Ele não declara o MVP pronto para produção de forma absoluta.
- **Nada foi commitado nem subido** durante as quatro rodadas, e nenhum banco implantado foi tocado.

## Resíduos declarados, sem bloqueio

- **Vocabulário de rodada nos documentos.** CURRENT_STATE diz "As três rodaram nesta unidade" e FINAL_AUDIT §8/D-047 dizem "nesta rodada": a mutação em `.auth-link--standalone` rodou na rodada 3, contra a mesma régua da árvore final. Os cinco documentos usam "esta rodada" como sinônimo do diff031 inteiro (falam de "WU-01 a WU-08 desta rodada"), então a leitura é coerente com o próprio vocabulário e nenhuma medida citada é inexistente.
- **`apps/frontend/tests/goal024-settings-shell-invariant.test.tsx`** trocou `getByRole` por `await findByRole` para fechar uma corrida com o skeleton `aria-busy` de `RetentionSection`. A asserção não foi enfraquecida, mas a mudança não decorre de markup alterado pela correção de produto — é o limite do que o Goal §Pontos de implementação autoriza em `apps/frontend/tests/`, registrado aqui como resíduo declarado.
- **`validate:core`** rodou exit 0 sobre a árvore final e foi conferido pelo reviewer, mas nenhum documento do diff registra esse resultado; só `validate:ui` aparece em FINAL_AUDIT §8 e VALIDATION_GATE.
