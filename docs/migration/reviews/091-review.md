# Review formal — Goal 091

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-02, em review DEEP, conforme o [Goal091](../goals/091-telas-de-acesso-restantes-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–090, 098 e 099) foi reaberto, reavaliado ou revertido.

O Goal porta as telas de acesso que o Goal086 deixou fora: `/cadastro`, `/recuperar-senha` e `/solicitacao-enviada` seguem os quadros L3, L4 e L5 sobre a casca de autenticação do L1, e `/termos-de-uso` e `/politica-de-privacidade` seguem L8 e L9, com página bege sem painel de marca, barra própria e coluna "Sumário" a partir de 768 px. Os textos são os do quadro; a recuperação continua por link; o conteúdo, a versão e as datas legais continuam os do app. A decisão é [D-107](../DECISIONS.md), aceita neste fechamento. Ela não substitui nenhuma decisão anterior: apoia-se em D-082 (item 4, regra única de senha, aceite por checkbox) e em D-087, e separa o layout das telas legais do conteúdo legal.

## Escopo e identidade do diff

- Baseline aceita vigente: `1e64c49b07a6e44f0778f2ad4dd52f4ede35fc49` (Goal099). Base imediata da implementação: `d0099f9b564b532f552fca4cb950224b48afd026`, HEAD da worktree `.ai-worktrees/goal-091`, inalterado nas duas rodadas, sem commit na worktree. Entre `1e64c49` e `d0099f9` há só documentação: a virada do Goal099 para `ACCEPTED` (`825d854`) e o fechamento do Goal099 com a preparação deste Goal (`d0099f9`). Nenhum dos dois toca o produto.
- Snapshot aceito, calculado pelo IA Loop: **10 arquivos**, hash do diff `93b7edcbdfb5dbeaedc9a2278ed82997a907d3fbecbcaf799654aba132575972`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os arquivos, por `git diff --numstat d0099f9` no snapshot aceito (antes dos documentos de fechamento):
  - `apps/frontend/src/features/auth/AuthScreen.tsx` (+101/−37): textos e composição de L3, L4 e L5; prop opcional `hint` (dica fixa da senha em `/cadastro`); `showRules` só em `/nova-senha`; `/solicitacao-enviada` com "Confira seu e-mail", "Voltar para entrar" e "Usar outro e-mail".
  - `apps/frontend/src/components/legal/LegalDocumentLayout.tsx` (+133/−72): estrutura de L8 e L9 (`legal-appbar`, `legal-topbar`, eyebrow, metadados, aviso) e o sumário gerado das seções do documento.
  - `apps/frontend/src/shared/styles/avenly.css` (+338/−41): blocos `.auth-*`, `.entry-*` e `.legal-*`, com quebras em 768 e 1024 px. Não há folha nova.
  - Testes: `tests/goal091-telas-de-acesso.test.tsx` (novo, 370 linhas, **16** testes) e asserções ajustadas em `goal064-auth-screens.test.tsx` (+16/−5: título por papel `heading`; dica fixa em `/cadastro` e regras ao vivo em `/nova-senha`).
  - Fora dos pontos de implementação, das unidades de diagnóstico da rodada 1: `apps/frontend/tests/goal076-service-list.test.tsx` (+4/−1, DIAG-001: espera o fim do carregamento da lista) e `apps/bff/tests/goal023-retention-sweep.test.ts` (+7/−1, DIAG-002: 60 s para um teste de passada em lote, cujo custo cresce com o banco compartilhado pelas suítes em paralelo). Nenhum muda produto nem afrouxa asserção; foram mantidos no aceite.
  - Documentos: `docs/migration/DECISIONS.md` (D-107), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- Nenhuma rota, contrato, BFF de produção, migration, campo, variável, parâmetro de URL, `e2e/visual/targets.json`, `e2e/routes.ts`, `playwright.*.config.ts`, `vitest.config.*`, `KNOWN_*` ou passo de `validate:*` mudou. `src/content/legal/` e `config/legal-*` não mudaram. Nenhum teste foi removido ou pulado. FINAL_AUDIT, vault, `apps/bff/PUBLIC_API_V1.md`, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers.** O código de produção foi aceito no mérito. O Tech Lead rodou `visual:compare -- --target L1,L3,L4,L5,L8,L9`, com números iguais aos declarados, e abriu os vinte `side-by-side.png`: L3, L4, L5, L8 e L9 batiam com os quadros, salvo as divergências declaradas, e o L1 não piorou. Os quatro blockers eram de documento, todos afirmando como não feito algo que o IA Loop tinha executado:
   1. `validate:integration` e o gate autenticado de 245 testes dados como não rodados, quando a WU-10 passou, exit 0 (`startTime` 01:46:47Z, posterior à última edição de código).
   2. A coluna "Início" do `visual:compare` copiada do Goal086, com L1, L8 e L9 sem medida, quando a WU-01 mediu a baseline `1e64c49` nos seis quadros.
   3. O vermelho contra a baseline das provas 1 a 5 dado como não executado, quando a WU-03 o executou (`10 failed | 6 passed`).
   4. Nenhuma frase dizendo, com evidência nomeada, que `/nova-senha` e `/link-expirado` não quebraram (§2 do Goal).
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** Só os três documentos mudaram. A coluna "Início" traz a medida da baseline, repetida pelo FIX-001 com os mesmos números nas 24 células; o vermelho da baseline está registrado com os 10 testes que reprovam e os 6 que passam, com o motivo de cada um; o gate autenticado e a frase sobre `/nova-senha` e `/link-expirado` estão nos documentos. Os oito gates do IA Loop passaram.

O pacote de review registra o perfil do Developer como `SONNET_HIGH` na rodada 1 e `SONNET_MEDIUM` na rodada 2. O Goal declara `SONNET_HIGH`.

## Evidência considerada

Os números estão em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal091), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal091) e na seção "Prova" de D-107.

- **Fidelidade visual, conferida pelo Tech Lead nas duas rodadas.** `visual:compare -- --target L1,L3,L4,L5,L8,L9`, exit 0, com diffs iguais aos do relatório (mobile / retrato / paisagem / desktop): L3 = 1,7 / 1,1 / 1,6 / 0,9; L4 = 2,2 / 1,5 / 1,4 / 1,6; L5 = 12,8 / 10,5 / 5,3 / 4,3; L8 = 9,3 / 8,7 / 6,8 / 5,3; L9 = 9,1 / 8,0 / 7,6 / 5,6; L1 = 4,8 / 1,0 / 1,0 / 1,0, igual à baseline. Os vinte `side-by-side.png` mostram estrutura, componentes, cores, tipografia e espaçamento iguais aos quadros nos quatro devices, salvo as divergências 1 a 9 de D-107.
- **Identidade do código aceito.** O `sha256` de cada arquivo de produção e do teste novo na rodada 2 é igual ao registrado em VALIDATION_GATE (`AuthScreen.tsx` `bd1b1b5c…2b68c031`, `LegalDocumentLayout.tsx` `4e38b6f4…7668b314`, `avenly.css` `54a0a3cf…b516424d`, teste novo `8685b842…70af7545`). O código aceito é o avaliado no mérito na rodada 1.
- **Gate autenticado, conferido em disco pelo Tech Lead na rodada 2.** `apps/frontend/e2e-results/authenticated/results.json` da WU-10 refeita pelo IA Loop, `startTime` 2026-10-02T02:28:46Z, posterior à restauração dos arquivos finais pelo FIX-001 (mtime 02:19:48Z, mesmo `sha256`): **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`, os 245 resultados com `retry` 0. A WU-10 da rodada 1 (`startTime` 01:46:47Z) deu as mesmas contagens.
- **Execução final do Developer**, depois da última edição de código: `typecheck` e `lint` exit 0; `goal091` **16**/**16**; `validate:core` exit 0 (**17** passos, **15** `passed`, **2** `skipped`); `test:frontend` **136** arquivos e **1483** testes, contra **135** e **1466** do Goal099; `test:gate` **233**/**233**; `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas; `validate:integration` exit 0.
- **Comportamento preservado.** O diff mantém os campos, a validação, o foco, o corpo enviado ao BFF (com `CURRENT_LEGAL_VERSIONS`), `forgotPassword` e a navegação para `/solicitacao-enviada`, sem parâmetro de URL novo. `/link-expirado` passa no `validate:ui` nas cinco larguras; `/nova-senha` mantém o DOM e os testes de `goal064-auth-screens.test.tsx`.
- **Controles negativos.** Quatro, rodados depois da última edição de código, com saída real e `sha256` em VALIDATION_GATE: 2, 2, 2 e 1 teste reprovam, e `16`/`16` volta depois da restauração. O controle 4 não reprovava no primeiro desenho da prova 5; a correção fixou os 18 títulos de cada documento no teste (`APP_SECTION_TITLES`). Vermelho contra a baseline: `10 failed | 6 passed`, com os 6 que passam fixando o que não muda.
- **Escopo.** `git status` só com os arquivos esperados, sem resto de controle negativo nem artefato de `e2e-results/`. `git diff --check` limpo, só aviso de CRLF.

## Aceito sem prova completa

1. **O vermelho contra a baseline e os quatro controles negativos não foram reexecutados pelo Tech Lead.** Foram conferidos pelo registro em VALIDATION_GATE e pelos `sha256`.
2. **A piora do L5 no tablet em retrato** (8,1 para 10,5, medida contra a baseline remedida) tem causa provável, o cartão do app mais curto sem caixas de dígito nem reenvio (divergência 3), mas não isolada por outra medida (divergência 8).
3. **`/nova-senha` não tem alvo visual nem `side-by-side`.** A evidência de que não quebrou é o DOM inalterado e os testes de `goal064-auth-screens.test.tsx`; nenhuma pessoa a olhou.

## Observações registradas, sem mudar a decisão

1. **Rótulo da WU-10.** O texto proposto dizia que o gate de `startTime` 01:46:47Z era da WU-10 da rodada 2; ele é da rodada 1. A rodada 2 refez a WU-10 às 02:28:46Z, com as mesmas contagens. O rótulo foi corrigido no fechamento em D-107, CURRENT_STATE e VALIDATION_GATE.
2. **`test:bff-integration` depois do DIAG-002.** Os documentos propostos não diziam explicitamente que ele passou depois do ajuste de tempo limite; isso decorre do `validate:integration` exit 0 da WU-10 e foi registrado no fechamento.
3. **Testes fora dos pontos de implementação.** Os ajustes de `goal076-service-list.test.tsx` e `goal023-retention-sweep.test.ts` não constavam em "Consequências" de D-107, só em "Estado da árvore" de VALIDATION_GATE. A nota de fechamento de D-107 e o delta de CURRENT_STATE passam a citá-los.

## O que o aceite não prova

- As telas num aparelho real. A conferência humana **não foi feita**.
- L2, L6 e L7, fora deste Goal; o L6 traz "Confirmar senha" e regras ao vivo, que reabrem D-107 (b) e a regra única de D-082.
- A recuperação por código, que reabre D-107 (c) e o item 4 de D-082 se o produto a decidir.
- O conteúdo legal, que segue sujeito a revisão jurídica; uma revisão que mude seções, títulos ou versão reabre D-107 (d) e a prova 5.
