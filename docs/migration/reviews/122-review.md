# Review formal — Goal 122

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, conforme o [Goal122](../goals/122-servicos-igual-ao-prototipo-no-vazio-e-no-servico-que-precisa-de-revisao.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 1 parou na conferência de entrega antes do review (`PRE_REVIEW_INCOMPLETE`, 6 pendências); a rodada 2 terminou `CHANGES_REQUIRED` com 5 blockers de código e de evidência; a rodada 3 os resolveu e terminou `ACCEPTED`, sem blocker.

A lista de Serviços vazia fica igual ao quadro S2 e a edição de um serviço que precisa de revisão fica igual ao quadro S7, nos quatro devices, salvo as divergências declaradas em D-136. O vazio é um componente próprio de Serviços (`features/services/ServiceEmptyState.tsx`), sem tocar o `DirectoryState`, que continua no erro da lista. O modo de revisão de `ServiceForm.tsx` vale na edição de um serviço com `needsReview` ou sem duração: o aviso "Falta a duração" com texto por `reviewOrigin`, a duração em foco com os atalhos 20, 30 e 45, a nota da importação, "Cor na agenda" e "Salvar e liberar para a IA", desabilitado até a duração ser um inteiro positivo. Os campos que o quadro não mostra saem da tela, mas o `PATCH` leva os valores do serviço carregado e a instrução privada não é regravada. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco. Decisão: [D-136](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `dfa32d8dcf6a63d7bdce23f16200a5c126639018` (Goal121). Base imediata da implementação: `8b6e1e0911a8a193bf93bc3916f835ca13eb1345` (fechamento do Goal121 e preparação do Goal122), HEAD da worktree `.ai-worktrees/goal-122`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **11 arquivos** (8 rastreados e 3 novos não rastreados), hash do diff `ab72705a4f10a9760ba1666349a4b913afce91981be7735aba54337912781e70`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos:
  - `apps/frontend/src/` (4): `features/services/ServiceEmptyState.tsx` (novo), `ServiceList.tsx` e `ServiceForm.tsx`; `shared/styles/avenly-services.css`;
  - `apps/frontend/tests/` (2): `goal122-servicos-vazio.test.tsx` e `goal122-servicos-revisao.test.tsx` (novos, 17 testes);
  - a captura (2): `apps/frontend/e2e/visual/targets.json` (S2 e S7) e `scripts/tests/visual-responses.test.mjs`;
  - `docs/migration/` (3, por acréscimo): D-136 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal122 em `VALIDATION_GATE.md`.
- Todos dentro do critério 7 do Goal. `scripts/lib/visual-responses.mjs` e `scripts/visual-compare.mjs` não mudaram, e nenhum teste existente foi alterado fora da lista de alvos de `visual-responses.test.mjs`. O documento do Goal122 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `PRE_REVIEW_INCOMPLETE`, 6 pendências, sem review.** O Developer rodou com o modo `WORK_UNITS`. A WU-01 (S2) terminou `COMPLETED`; a WU-02 (S7) caiu com falha irrecuperável (`UNKNOWN_FATAL`) e a WU-03 (fidelidade, provas e registros) não entregou. O `test:gate` (WU-09) reprovou na árvore incompleta, e D-136, CURRENT_STATE e VALIDATION_GATE não estavam escritos. A conferência de entrega do IA Loop devolveu a rodada sem passar pelo Tech Lead.
2. **Rodada 2 — `CHANGES_REQUIRED`, 5 blockers.** A correção (FIX-001) entregou o S7, os gates verdes e os três registros. O Tech Lead subiu uma pilha descartável própria (PostgreSQL 18 com `initdb` no scratchpad, porta 56811, Scheduling, IA e BFF na 3072), refez o `visual:compare` de S2 e S7 com os mesmos percentuais do Developer e mediu os 8 side-by-side em pixels. Blockers:
   1. Com duração válida, o botão habilitava, mas "O botão ativa quando a duração for informada." e o `aria-describedby` continuavam; o Goal (escolha 6) pede que o texto suma.
   2. Nenhum teste afirmava o campo de duração em foco ao abrir, nem a ausência de "Intervalo antes e depois".
   3. O "‹" do cabeçalho do formulário aparecia no S7 do tablet em paisagem e do desktop, onde os quadros mostram só o título centrado.
   4. No desktop, a borda do rodapé do S7 ocupava a coluna de detalhe inteira (~755 px), contra 640 px centrados no quadro.
   5. Evidência e registros a refazer depois das correções, com a frase do S2 corrigida: o bloco fica ~20 px acima no mobile e ~50 px no tablet em retrato, acompanhando o título sem "‹ Mais".
3. **Rodada 3 — `ACCEPTED`, sem blocker.** A FIX-001 resolveu os cinco: o texto de apoio e o `aria-describedby` só existem com `!durationReady`, com teste do atalho 30, do campo limpo e da digitação de 50; o teste `o campo de duração abre em foco` (`toHaveFocus`) e a asserção de "Intervalo antes e depois" ausente; `hideBackWide={reviewMode}` no `PushedBar`, pela regra `.pushed-bar-back.is-hidden-wide` de `avenly.css` (a partir de 1024 px); o rodapé com `max-width: 640px`, `width: 100%`, `align-self: center` e `padding: 12px 28px 24px` a partir de 1100 px; controles negativos, capturas, execução final e registros refeitos sobre a árvore final. Os gates WU-04 a WU-13 passaram, com a WU-08 (`test:ia-loop`) pulada por não se aplicar.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal122), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal122) e em D-136.

- **Gates do IA Loop, rodada 3, todos com saída 0 na árvore final:** `typecheck` (WU-04), `lint` (WU-05), testes alvo `goal122` com 2 arquivos e 17 testes (WU-06), suíte do frontend com 168 arquivos e 2160 testes (WU-07), `test:gate` com 271 pass e 0 fail (WU-09), `validate:core` sem passo falho e 2 pulados (WU-10), `validate:ui` com 169 passed, 21 skipped e 0 retentativas (WU-11), `validate:integration` com o gate autenticado em 275 passed e 0 retentativas (WU-12) e `git diff --check` (WU-13). As 2 retentativas fora de Clientes registradas no Goal121 não se repetiram.
- **Controles negativos do Developer (rodada 3, depois da última edição de código):** (a) o botão sem a guarda da duração reprovou 2 de 11; (b) o `PATCH` sem manter `description`, 1 de 11; (c) o aviso sempre com o texto de `IMPORT`, 2 de 11; (d) "Criar primeiro serviço" sem a guarda de `editable`, 1 de 6; e os extras (e) o texto de apoio sempre na tela, 1 de 11, e (f) a duração sem `autoFocus`, 1 de 11. Cada fonte voltou da cópia e foi conferida com `cmp` e `sha256`.
- **Conferência do Tech Lead, rodada 3** (BFF e Scheduling locais sobre o banco de desenvolvimento, encerrados ao fim; a worktree ficou intacta):
  - **`visual:compare` de S2 e S7:** 8 pares, todos os side-by-side abertos. S2 7,4/9,5/0,3/0,4% e S7 7,2/1,1/11,7/3,1% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos valores registrados.
  - **S2:** esboço, título, texto e botão iguais ao quadro; o deslocamento vertical no mobile e no tablet em retrato acompanha o título sem "‹ Mais" (casca declarada).
  - **S7:** aviso âmbar, duração com "—", 20, 30 e 45, nota da importação, "Cor na agenda" e o botão desabilitado com o texto de apoio iguais ao quadro; em paisagem e no desktop, sem "‹" e com o título centrado; no desktop, a borda do rodapé com ~640 px centrada.
  - **Regressão Servicos:S1, S3, S4 e Agenda:S1:** 7,5/3,6/3,7/2,6, 6,4/2,8/12,8/4,2, 9,7/6,0/13,7/5,2 e 11,7/5,9/15,1/6,0%, dentro de ±0,2 ponto do registro do Developer; o side-by-side de S4 no mobile não mostra mudança na edição comum.
  - **Código e testes:** o envio lê `description`, a recorrência e os intervalos do estado, e esses campos são controlados na edição comum; `active` e `colorToken` ficam preservados no modo de revisão; a instrução privada não é regravada (teste). O Tech Lead reexecutou o vitest de `goal122` (17 de 17).

## Divergências aceitas

Declaradas pelo Goal ou por D-136, conferidas nas capturas:

1. "Rosa-antigo" para `ROSE` (paleta de D-114 (g)), onde o quadro S7 diz "Rosa".
2. A casca (barra de status e indicador de início do iPhone, "‹ Mais" acima de "Serviços", respiro de topo, nome e iniciais do negócio da conta visual), conforme D-127 a D-132 e a divergência 1 de D-114. No S2, o bloco centrado fica ~20 px acima do quadro no mobile e ~50 px no tablet em retrato, acompanhando o título.
3. No S7 a partir de 1024 px, a coluna da lista é a do S1 de hoje: o campo "Buscar serviço", outra ordem (Coloração primeiro) e "5 ativos" onde o quadro diz "6 ativos" (o app não conta o serviço em revisão como ativo).
4. A barra de abas inferior em 1024 px, já aceita em S1 e S4.

## Aceito sem prova completa

1. **Os controles negativos** vêm da execução do Developer. O Tech Lead não os refez.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop da rodada 3 e do relatório do Developer, sem reexecução pelo Tech Lead além do vitest de `goal122` e do `visual:compare`.
3. **A WU-08 (`test:ia-loop`)** foi pulada: o script não existe no repositório e não se aplica a este Goal; `visual-responses.test.mjs` está dentro do `test:gate` (`scripts/tests/**`).
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Observações registradas, sem mudar a decisão

1. **A captura da rodada 3 do Tech Lead usou o banco de desenvolvimento**, não uma pilha descartável como na rodada 2. Os alvos S2 e S7 dependem só de `responses` fixas; a diferença de até 0,2 ponto na regressão é atribuída à conta desse banco.
2. **A falha da WU-02 na rodada 1** (`UNKNOWN_FATAL`, escalada `HUMAN_REQUIRED`) é do IA Loop, não do diff: a rodada 2 entregou o S7 pela unidade de correção.
3. **S5, S6, S8, S9 e S1b** continuam sem alvo, como o Goal previu; o erro da lista de Serviços continua no `DirectoryState`.
