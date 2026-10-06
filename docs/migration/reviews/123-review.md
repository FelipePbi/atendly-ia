# Review formal — Goal 123

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal123](../goals/123-entrar-com-erro-nova-senha-e-senha-redefinida-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review terminou `CHANGES_REQUIRED` com 1 blocker só de documentação; o IA Loop aceitou a rodada e adiou a correção para este fechamento, onde ela foi aplicada nos registros de `docs/migration/`, sem nova rodada.

O erro de credenciais em `/login`, o formulário de `/nova-senha` e a confirmação "Senha redefinida" ficam iguais aos quadros L2, L6 e L7, nos quatro devices, salvo as divergências declaradas em D-137. O `401` do login põe o texto do quadro no campo "Senha", com rótulo, borda e mensagem nas cores do quadro, e sublinha "Esqueci minha senha"; `/nova-senha` mostra o subtítulo do quadro e a lista de três regras abaixo do campo, com "Diferente da senha anterior" sempre neutra (só o BFF a confere, D-064); a confirmação tem o círculo de 72 px e o botão "Entrar" para `/login`. `responses` do `visual:compare` aceita `POST` só em alvo público sob `/v1/auth/`. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco. Decisão: [D-137](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `f81db1c8ba35a266732c71f3b607b05be8a21eee` (Goal122). Base imediata da implementação: `4f8dd3406e02171caed67bd0cf6dc1b938b14e62` (fechamento do Goal122 e preparação do Goal123), HEAD da worktree `.ai-worktrees/goal-123`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **11 arquivos** (10 rastreados e 1 novo não rastreado), hash do diff `171d81f06d5a70d664e62b9793b8136f4e7d1ca5f48d567c5303dce30e88e56c`. Mudança posterior nesses arquivos exige avaliar o novo diff. As correções de registro deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (2): `features/auth/AuthScreen.tsx` e `shared/styles/avenly.css`;
  - `apps/frontend/tests/` (3): `goal123-telas-de-acesso.test.tsx` (novo, 13 testes), `goal014-auth.test.tsx` e `goal064-auth-screens.test.tsx` (só texto);
  - a captura (3): `apps/frontend/e2e/visual/targets.json` (L2, L6 e L7), `scripts/lib/visual-responses.mjs` e `scripts/tests/visual-responses.test.mjs`;
  - `docs/migration/` (3, por acréscimo): D-137 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal123 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal. `scripts/visual-compare.mjs` e `apps/frontend/e2e/routes.ts` não mudaram. O documento do Goal123 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED` no review, 1 blocker só de documentação; `ACCEPTED` pelo IA Loop com a correção adiada para o fechamento.** O Developer entregou o código, os testes, os alvos, os controles negativos e os três registros. A conferência de cobertura deu 11 de 12 itens cobertos e o critério 7 `UNCLEAR`, porque o VALIDATION_GATE dizia que `validate:core`, `validate:ui` e `validate:integration` não tinham rodado. O review DEEP aprovou código, testes e fidelidade visual. O blocker pedia, no VALIDATION_GATE: as contagens dos três gates, que rodaram na árvore final; a nota de que `validate:ui` não alcança `/nova-senha`, o 401 nem o L7; e, ali e em D-137, a divergência de 2 px de "Esqueci minha senha" no L2. Aplicado neste fechamento (ver "Correção de registro aplicada no fechamento").

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal123), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal123) e em D-137.

- **Gates do IA Loop, rodada 1, todos com saída 0 na árvore final:** `typecheck` (WU-04), `lint` (WU-05), testes alvo `goal123` com 1 arquivo e 13 testes (WU-06), suíte do frontend com 169 arquivos e 2173 testes (WU-07), `test:gate` com 279 pass e 0 fail (WU-08), `validate:core` com 17 passos, 15 passando, 0 falhas e 2 pulados (`test:bff` e `test:health-worker`) (WU-09), `validate:ui` com 169 passed, 21 skipped e 0 retentativas (WU-10), `validate:integration` com 36 de 36 passos e o gate autenticado em 275 passed e 0 retentativas (WU-11) e `git diff --check` (WU-12).
- **Controles negativos do Developer (depois da última edição de código):** (a) o texto antigo do 401 reprovou 3 testes de `goal123`; (b) a terceira regra marcada como as outras, 1; (c) `POST` aceito sem olhar `session`, 2 de 46 em `visual-responses.test.mjs`; (d) o prefixo exigido trocado para `/v1/`, 1 de 46. Cada mutação foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **`visual:compare` de L2, L6 e L7:** refeito, saída 0, 12 capturas, todos os side-by-side abertos. L2 6,3/1,2/1,7/1,7%, L6 14,8/7,0/6,1/5,3% e L7 1,2/0,9/0,9/0,7% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos valores do Developer.
  - **L2:** pixels do `app.png` do mobile conferidos: a borda do campo "Senha" em `#B8483D` por dentro do anel de foco, o rótulo e a mensagem de 12 px em `#8A2A21`, "Esqueci minha senha" sublinhado e o e-mail mantido.
  - **L6:** subtítulo do quadro; três regras abaixo do campo, com a marca de 18 px em `#DCECEB`/`#0B4A4E` e a neutra com borda `#D6CEC2` e texto `#716859`, iguais ao HTML do quadro.
  - **L7:** círculo de 72 px, traço de 34 px, título, texto e "Entrar" com a seta, iguais nos quatro devices dentro de 1 px.
  - **Critério 7, fora do alcance de `validate:ui`:** `#8A2A21` dá ~8,5:1 sobre `#FFFDFA` e ~7,8:1 sobre `#F7F4EF`; `#716859` dá ~5,4:1 e ~5,0:1; "Salvar nova senha" e o "Entrar" do L7 têm 52 px de altura.
  - **Código:** `credentialsError` é derivado da própria mensagem, então só o 401 ativa o destaque; a lista de regras sai do `<label>` e continua ligada por `aria-describedby`; a terceira regra fica com `met` sempre falso; o corpo de `login` e de `resetPassword` não muda. As classes novas de `avenly.css` são isoladas, e `.password-rules` só é usada em `/nova-senha`. `visual-responses.mjs` aceita `POST` só com `session === false` e `path` sob `/v1/auth/`, e a recusa nomeia o alvo nos outros casos.

## Correção de registro aplicada no fechamento

O blocker adiado foi aplicado pelo Tech Lead, só em `docs/migration/`, com os números copiados dos resultados WU-04 a WU-12 do IA Loop:

1. `VALIDATION_GATE.md`, seção do Goal123: o parágrafo "Não executado" sobre `validate:*` foi substituído pela seção "Gates do IA Loop", com a frase das contagens e a nota do critério 7; a tabela "Execução" ganhou as linhas de `validate:core`, `validate:ui` e `validate:integration`; "Divergências que restam" ganhou a de 2 px do L2. "Não executado" ficou só com a conferência em aparelho real.
2. `DECISIONS.md`, D-137: a mesma divergência de 2 px em "Divergências contra o protótipo, declaradas", o status ACCEPTED e a nota de fechamento.
3. `CURRENT_STATE.md`, delta do Goal123: a mesma divergência na linha "Divergências declaradas".

## Divergências aceitas

Declaradas pelo Goal ou por D-137, conferidas nas capturas:

1. L6: "Confirmar senha" não existe no app (U-10 e D-064). O cartão é mais curto, o foco do quadro no segundo campo não tem equivalente e, no mobile, o app mantém o parágrafo do painel de marca, que é do `AuthLayout` e o Goal manda não mudar.
2. L2: a saudação de D-087 ("Boas-vindas de volta"), que no mobile quebra em duas linhas e sobe o cartão 20 px, e o anel de foco no campo "Senha", porque o Goal exige o foco no campo com erro.
3. L2, igual ao L1 já aceito: "Esqueci minha senha" fica 2 px à esquerda do quadro, pelo `padding: 4px 2px` de `.auth-link--standalone` (alvo de toque AA, Goal031).
4. A casca de D-107 (divergências 1, 2 e 9), e o fade-in do cartão do protótipo no tablet.

## Aceito sem prova completa

1. **Os controles negativos** vêm da execução do Developer. O Tech Lead não os refez.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop da rodada 1, sem reexecução pelo Tech Lead além do `visual:compare`.
3. **Contraste e alvo de toque de `/nova-senha`, do 401 e do L7** foram conferidos por cálculo e medida do Tech Lead, não por `validate:ui`: `PUBLIC_ROUTES` não alcança esses estados e o critério 8 não autoriza mudar `routes.ts` neste Goal.
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Observações registradas, sem mudar a decisão

1. Em `avenly.css`, as regras novas ficaram entre o comentário "Link isolated in its own line…" e `.auth-link--standalone`; o comentário ficou separado da regra que ele descreve.
2. O título do teste de `goal064-auth-screens` "mostra 'Diferente da senha anterior' no subtítulo" ficou desatualizado: o teste passa porque acha o texto na lista, não no subtítulo.
3. O array `rules` de `AuthScreen.tsx` é montado também quando `showRules` é falso. Custo desprezível.
