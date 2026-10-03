# Review formal — Goal 105

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal105](../goals/105-importacao-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

Configurações › Importação passa a seguir os quadros I1, I2 e 2.I1. A origem ("De onde vamos trazer seus dados?", com o cartão "Minha Agenda" como única opção) vem antes das credenciais em toda entrada: o botão do I2, a etapa `importacao` do onboarding e "Conectar outra conta". O formulário, os pedidos e as mensagens de erro são os de antes. Quem não importou vê o I2 em Configurações, com a ilustração da 2.2, agora no componente compartilhado `ImportIllustration`. O histórico concluído segue o I1: bloco verde com a data no fuso do negócio, categorias numa ordem fixa com milhar pt-BR, bloco âmbar só com pendência e texto final com DD/MM. `/importacao` ganhou a composição de D-103: tela empurrada abaixo de 1024 px e lista do hub de 1024 px em diante. O I1 é o segundo alvo do `visual:compare` com `responses`, só `GET /v1/calendar/imports`, nos limites de D-118 (a). O gate autenticado mudou só o `contentMarker` de `onboarding-importacao`. A casca, o hub, o contrato, o BFF e os scripts do instrumento não mudaram. Decisão: [D-119](../DECISIONS.md), aceita neste fechamento; ela revê em parte D-118 (a) e não toca em D-084.

## Escopo e identidade do diff

- Baseline aceita vigente: `c13469f3c68e1eee8ef002e9d78ca6f53b30c0d1` (Goal106). Base imediata da implementação: `2157a9a45e097e7d756787397939b1569f6fee21`, HEAD da worktree `.ai-worktrees/goal-105`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **36 arquivos**, hash do diff `3ed32cc4293146175a54083364d3bfaa3ca93ae123cefdc66a9bf380ac4c4755`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção, em `apps/frontend/src/`: `features/imports/ImportsScreen.tsx` (`sha256` `e422c055…`), `ConnectSourceScreen.tsx` (`a12c39b8…`), `ImportHistoryCard.tsx` (`fe9a6609…`), `ImportsLayout.tsx` (`737406b3…`), `labels.ts` (`6b222a73…`), `features/onboarding/OnboardingImportStep.tsx`, `features/onboarding/blocks/schedule.tsx` (só a ilustração trocada pelo componente), `shared/styles/atendly-imports.css`, `atendly-settings.css` e `atendly.css` (só `text-align: left` em `.import-card`, da rodada 3); os novos `features/imports/ImportEmptyScreen.tsx` (`acabd454…`), `ImportOriginScreen.tsx` (`f17460d5…`) e `ImportIllustration.tsx` (`2dff25e6…`).
  - Instrumento: `apps/frontend/e2e/visual/targets.json` (`84737471…`, o I1 com `responses` e as notas do I1 e do 2.I1) e `scripts/tests/visual-responses.test.mjs` (`7719edda…`, exige exatamente W1 e I1). `scripts/visual-compare.mjs`, `scripts/lib/visual-responses.mjs` e `scripts/lib/visual-seed.mjs` não mudaram.
  - Gate: `apps/frontend/e2e/routes.ts` (só o `contentMarker` de `onboarding-importacao` e o comentário do Goal066) e `apps/frontend/AGENTS.md` (só a linha de (f)).
  - Teste novo: `apps/frontend/tests/goal105-importacao.test.tsx` (**30** testes, cinco provas, `sha256` `06620e50…`).
  - Testes existentes ajustados só no caminho até o formulário, no texto ou na estrutura que os quadros trocam e no link "Configurações", nenhum removido nem pulado: `goal018-onboarding-reachability`, sete `goal020-*`, `goal060`, `goal061`, `goal062`, `goal066-onboarding-importacao`, `goal072`, `goal079` e `goal082`.
  - Documentos: `docs/migration/DECISIONS.md` (D-119 e a nota "Revista em parte por D-119" em D-118), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- `e2e/authenticated-matrix.spec.ts`, a casca (`src/shared/layout/`), `SettingsHub.tsx`, o contrato público, o BFF e as configurações de gate não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 2 blockers, só de documento.** Código e visual aceitos no mérito. Os blockers: CURRENT_STATE e VALIDATION_GATE atribuíam typecheck, lint, `goal105-importacao`, `validate:core`, `test:gate` e `validate:ui` à WU-11, quando são das WU-05 a WU-10; só a `validate:integration` é da WU-11.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker, de código.** A atribuição foi corrigida. Na vista dos `side-by-side.png`, o Tech Lead achou uma divergência que a rodada 1 não registrou: os rótulos "MINHA AGENDA" e "ATENDLY" da ilustração do I2 saíam centralizados, e o quadro e a 2.2 os alinham à esquerda. Causa: `.imports-empty { text-align: center }`, herdado pelos rótulos.
3. **Rodada 3 — `CHANGES_REQUIRED`, 3 blockers, só de documento.** A correção foi `text-align: left` em `.import-card` (`atendly.css`), base do componente compartilhado; a 2.2 não mudou (1,1 / 0,4 / 0,7 / 0,7). Os gates WU-05 a WU-11 rodaram de novo, na árvore `code-v1:a698f84c…`. Os blockers: os documentos citavam a impressão digital `a6695e1e…` da rodada 1; a `validate:integration` aparecia com 694 s, e a da rodada 3 levou 705 s; e faltava registrar a correção e dizer que o vermelho da baseline e os sete controles eram de antes dela.
4. **Rodada 4 — `ACCEPTED`, 0 blockers.** A FIX-001 mudou só as seções do Goal105 de CURRENT_STATE e VALIDATION_GATE. O código não mudou: os gates da rodada 4 são os da rodada 3, reaproveitados pelo IA Loop porque a impressão digital de código é a mesma.

As correções rodaram como unidade FIX-001, com o perfil `SONNET_MEDIUM`.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal105 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal105) e na "Prova" de D-119.

- **Identidade do código aceito.** Na rodada 4, o Tech Lead recalculou os 11 sha256 citados no VALIDATION_GATE e todos batem com a árvore final. O único diff de `atendly.css` é a linha `text-align: left` em `.import-card`. Depois da comparação visual, `git status` continua com os mesmos 36 arquivos, e `apps/frontend/AGENTS.md` difere da base só na linha de (f).
- **`visual:compare`.** O Tech Lead rodou o `visual:compare` de I1, I2 e 2.I1 nas quatro rodadas (exit 0), com a 2.2 incluída na rodada 3. Os números finais são iguais aos da execução 3: I1 **10,0 / 4,4 / 6,7 / 5,6**, I2 **16,1 / 11,3 / 12,2 / 10,8**, 2.I1 **2,7 / 1,8 / 2,1 / 1,6** (mobile / tablet em retrato / tablet em paisagem / desktop). Em cada rodada, o Tech Lead abriu os doze `side-by-side.png`. Na rodada 4: o I1 está igual ao quadro nos quatro devices, salvo o banner da casca, os dados do hub da conta real e o bloco âmbar sem a lista por registro; o I2 está igual, com os rótulos à esquerda, deslocado só pelo banner real da casca; o 2.I1 está igual, e o voltar ausente e o "Sair" vêm da moldura do onboarding, fora do escopo.
- **Piora do I2 pelo diff.** De 13,9 / 9,8 / 10,0 / 8,7 (execução 1) para 16,1 / 11,3 / 12,2 / 10,8. A causa está medida: a execução 1 ainda mostrava a tela antiga de conectar, e a execução 3 mostra o I2 deslocado pelo banner real da casca, cerca de 168 px no mobile e 80 px no desktop. Pela vista, não é blocker.
- **Instrumento.** O I1 declara só `GET /v1/calendar/imports`. Os scripts não mudaram. Na execução 2, só o I1 muda contra a execução 1. Na execução 3, 2.2, M1, W1 e H3 têm os números da execução 1.
- **Código.** Há uma só chamada de `useShellConfig`, em `ImportsScreen`, com `pushed`. Abaixo de 1024 px a tela é empurrada; de 1024 px em diante usa `ListDetailLayout` com `SettingsHubPanel`; sem `settings`, o fluxo aparece sozinho. A origem vem antes das credenciais em toda entrada. O formulário, os pedidos e as mensagens não mudaram. `ImportHistoryCard` só é usado em `ImportsScreen`, e o fuso tem fallback `America/Sao_Paulo`. O CSS novo é escopado.
- **Provas.** O Tech Lead reexecutou `goal105-importacao` (30/30) e `visual-responses.test.mjs` (9/9) na rodada 1. Contra os arquivos de produção da baseline, medido pelo Developer, **24** reprovam e **6** passam; as 6 estão nomeadas no VALIDATION_GATE.
- **Controles negativos do §6**, rodados pelo Developer na WU-12, antes da edição de CSS da rodada 3, com a restauração conferida por sha256: `9`, `5`, `1`, `1`, `1`, `16` (6a), `5` (6b) reprovações de 30 e `1` de 9 no teste do instrumento. Sem o defeito, 30/30 e 9/9. O Tech Lead aceitou os controles pelo registro e não os reexecutou. Ele aceitou também que não rodassem de novo depois do CSS: a edição é só de CSS e não toca nenhum dos 11 arquivos com hash.
- **Gates do IA Loop na rodada 3,** reaproveitados na rodada 4, todos com exit 0, na árvore `code-v1:a698f84c…`: typecheck (WU-05), lint (WU-06), `goal105-importacao` 30/30 (WU-07), `validate:core` com 15 passos e 2 pulados (WU-08), `test:gate` 242 (WU-09), `validate:ui` 169 passed, 21 pulados e 0 retentativas (WU-10) e `validate:integration` com 36 passos e o gate autenticado com **275 passed**, 0 flaky e 0 retentativas, em 705 s (WU-11).

## Aceito sem prova completa

1. **O histórico real de uma conta que importou** está provado só em jsdom. A captura do I1 usa a resposta fixa de `GET /v1/calendar/imports`.
2. **I1 e 2.I1 não chegaram a diff zero**, e o I2 ficou pior pelo diff que na execução 1. O aceite vem da vista dos `side-by-side.png` e da causa medida. Uma medida do I2 sem o banner da casca não foi feita.
3. **O vermelho da baseline e os sete controles** são de antes da última edição de código, que foi só de CSS.

## Observações registradas, sem mudar a decisão

1. **O controle 6 vale na variante 6a.** Na 6a, `ImportHistoryCard` chamando `useShellConfig` reprova as duas asserções "uma chamada de useShellConfig por árvore". Na 6b, `ConnectSourceScreen` chamando o hook reprova só por efeito colateral, não pela asserção. A 6a cumpre o "ou" do Goal. A pergunta deixada ao Tech Lead no "Limite declarado" de D-119 fica respondida assim, sem pedir uma asserção própria para `ConnectSourceScreen`.
2. **O fluxo remonta e perde a fase.** Quando `settings` chega, ou quando a largura cruza 1024 px, `ImportsFlow` remonta e perde a fase origem/credenciais, porque o estado de leitura fica no componente pai. Fica registrado para um Goal futuro.
3. **Ambiente local na rodada 1.** O BFF local em 3002 respondia 500 no login: o MuMuPlayer ocupa `127.0.0.1:5555` e intercepta o Postgres do Docker. O Tech Lead subiu um BFF temporário em 3012, com `DATABASE_URL` pelo IP da LAN e `VISUAL_BFF_URL` apontando para ele, sem editar arquivo, e o encerrou depois da comparação.
4. **Imprecisões no texto proposto de D-119**, que não mudam a decisão: "Consequências" não lista `atendly.css` entre a produção alterada, e diz que o `test:gate` de 242 é da WU-11, quando é da WU-09. A nota de fechamento de D-119 registra as duas.
5. **Este review não estava em disco durante as rodadas.** Os blockers foram escritos autocontidos.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- O I1 com uma importação real, fora do jsdom.
- I1, I2 e 2.I1 com diff zero: o critério "igual ao quadro" foi julgado pela vista.
- O 2.I2 a 2.I10, a lista por registro do I1 e as telas de análise, revisão, conflitos e execução como quadros. Essas telas só mudaram de moldura.
