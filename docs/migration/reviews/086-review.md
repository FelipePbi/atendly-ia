# Review formal — Goal 086

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, conforme o [Goal086](../goals/086-login-identico-ao-prototipo-validacao-da-comparacao-visual.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–084) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 teve um blocker, só de documentação, fechado na rodada 2.

O Goal valida o mecanismo de comparação visual do ia-loop V33 numa tela só. `/login` passa a seguir o quadro **L1** do protótipo aprovado nos quatro devices: mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768. A única divergência aceita é a saudação neutra de [D-087](../DECISIONS.md) (Goal068). Nenhuma decisão nova foi aberta: o quadro resolveu todas as escolhas.

## Escopo e identidade do diff

- Baseline aceita vigente: `10f2348bf120dcc43e49f762c7438abf49fdd4e9` (Goal082). Base imediata da implementação: `72800791ccff56c86feea285d87a3e039489707d`, HEAD da worktree `.ai-worktrees/goal-086`, inalterado nas duas rodadas. Entre `10f2348` e `7280079` há o fechamento do Goal082, a integração do ia-loop V33 (comparação visual, sem código de produto) e a inserção deste Goal no plano.
- Snapshot aceito, calculado pelo IA Loop: **6 arquivos**, hash do diff `78221212e10f73f284e8ea105e60c34b529799e857a7ff93631e5437a57e8aab`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os 6 arquivos são rastreados e modificados, por `git diff --numstat 7280079` no snapshot aceito:
  - Frontend: `src/features/auth/AuthScreen.tsx` (+51/−43), `src/shared/styles/atendly.css` (+224/−133), `src/shared/icons/Icon.tsx` (+1, o nome `mail`) e `public/icons/atendly-icons.svg` (+1, o símbolo `i-mail`).
  - Teste existente: `apps/frontend/tests/goal068-telas-de-entrada.test.tsx` (+2/−2). A única asserção mudada é o raio da folha do formulário no celular, de `24px 24px 0 0` para `28px 28px 0 0`, porque o L1 usa 28px. Nenhum teste foi removido ou pulado.
  - Documento: `docs/migration/CURRENT_STATE.md` (delta do Goal086).
- Nenhuma rota, contrato, migration, variável de ambiente ou campo mudou. `atendly-system.css`, `apps/frontend/e2e/visual/targets.json` (o L1 já estava mapeado para `/login`), `apps/bff/PUBLIC_API_V1.md`, o vault e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 1 blocker.** O Tech Lead rodou `npm run visual:compare -- --target L1,L3,L4,L5` na worktree e abriu os `side-by-side.png`. A parte visual e funcional foi aprovada nessa rodada. O blocker era que `CURRENT_STATE.md` não tinha sido atualizado, como o §Documentação do Goal exige.
2. **Rodada 2 — `ACCEPTED`, 0 blocker.** O Developer só acrescentou a seção "Delta implementado — Goal086" em `CURRENT_STATE.md` (+23 linhas), sem tocar código. O Tech Lead conferiu as afirmações da seção contra `AuthScreen.tsx`, rodou de novo `npm run visual:compare -- --target L1` e abriu os quatro `side-by-side.png`.

O que o Tech Lead conferiu nas imagens e no código:

- §1, L1: estrutura, componentes, cores, tipografia e espaçamentos iguais ao protótipo nos quatro devices.
  - Mobile: hero teal com círculos decorativos; folha bege com raio de 28px ancorada no rodapé, sem faixa vazia.
  - Tablet em retrato: selo, título do hero de 34px, sem parágrafo de apoio, conjunto ancorado no topo e cartão de 480px.
  - Tablet em paisagem e desktop: painel de 440px e 560px; fundo bege `#F7F4EF`; cartão `#FFFDFA` com sombra difusa; ícones de envelope e cadeado nos campos; rodapé sem divisória.
  - Desktop: bolhas do mockup de conversa legíveis e com as larguras do protótipo.
  - Os valores do título do hero e do selo (28/34/40px, peso 500, line-height 1,15/1,12) conferem com o HTML do protótipo.
- §2, telas irmãs: L3, L4 e L5 herdam a casca nova (hero e folha coerentes com o protótipo), sem quebra visível. As diferenças de conteúdo próprio de cada quadro ficam fora do Goal.
- §3, comportamento: `AuthScreen.tsx` só envolve os inputs em `.input-wrap` com o ícone. `id`, `name`, `type`, `autoComplete`, `aria-*`, a validação, as mensagens, os links e o redirecionamento não mudaram. As telas legais mantêm o `.auth-back` com escopo `.legal-document`.

## Evidência final aceita

A execução final é a da **WU-001 da rodada 1**, sobre o código aceito. A rodada 2 não mudou código.

- Diff do L1, da baseline para o final: mobile **41,9% → 4,8%**, tablet em retrato **18,3% → 1,0%**, tablet em paisagem **5,1% → 1,0%**, desktop **12,8% → 1,0%**. O Tech Lead obteve os mesmos valores finais nas duas rodadas.
- Telas irmãs, do início para o fim (mobile / tablet em retrato / tablet em paisagem / desktop), sem nenhum device pior:
  - L3 `/cadastro`: 24,9 / 16,4 / 9,7 / 15,9 → **17,6 / 11,2 / 7,0 / 5,6**.
  - L4 `/recuperar-senha`: 48,4 / 22,2 / 8,5 / 14,9 → **11,6 / 5,3 / 5,1 / 4,6**.
  - L5 `/solicitacao-enviada`: 51,3 / 21,7 / 8,6 / 15,0 → **15,9 / 8,1 / 6,4 / 5,2**.
- `validate:core`: **15** passos `passed`, **2** `skipped` (`test:bff` e `test:health-worker`).
- `test:gate`: **233**/**233**.
- `validate:ui`: **168** `passed`, **21** `skipped`, **1** `flaky`. O único retry foi `mobile-360 › entrar › meets WCAG 2.1 AA`, com `page.goto: net::ERR_NO_BUFFER_SPACE` (erro de rede do sistema operacional ao navegar). A repetição passou, inclusive contraste.

Evidência conferida pelo Tech Lead:

- `visual:compare` do L1 nas duas rodadas e de L3, L4 e L5 na rodada 1, com os `side-by-side.png` abertos.
- Testes de frontend `goal014`, `goal064`, `goal068` e `goal072`: **7** arquivos, **85** testes passando.
- `git status` só com os arquivos do snapshot.
- O Tech Lead não reexecutou `validate:core`, `test:gate` nem `validate:ui`. As contagens vêm do relatório da WU-001.

## Divergências restantes no L1, aceitas

1. **Saudação declarada (D-087).** "Boas-vindas de volta. Sua agenda continua de onde parou." é mais longa que o texto do protótipo e não cabe numa linha em 362px a 14px. No mobile, o subtítulo quebra em 2 linhas e a folha fica cerca de 20px mais alta. Tamanho e peso seguem o quadro.
2. **Dados de exemplo.** O protótipo mostra e-mail e senha preenchidos. O app mostra o placeholder, porque é a tela real.
3. **Contornos de glifos.** O protótipo usa a Literata variável do Google Fonts; o app usa woff2 estático local. Trocar a fonte do app fica fora do Goal.
4. **Ícones de olho e cadeado.** Os paths diferem minimamente do protótipo. São ícones compartilhados do sprite e não foram alterados.
5. **Animações de entrada.** `at-reveal` e `at-sheet` do protótipo não foram portadas. A comparação congela animações, então elas não aparecem no diff.
6. **Botão "Entrar" esmaecido no tablet em retrato do protótipo.** Vem da renderização do protótipo, não do app.

## Observações registradas, sem mudar a decisão

1. **O registro em CURRENT_STATE não citava a quebra do subtítulo no mobile**, que o blocker da rodada 1 também pedia. O critério do Goal não exige isso e a divergência já estava declarada no Goal e em D-087, então não houve mais uma rodada. O fechamento acrescentou a menção em [CURRENT_STATE](../CURRENT_STATE.md).
2. **Perfil de execução.** O Goal declarava `SONNET_HIGH`, e as duas rodadas usaram Sonnet high.
3. **Validação do mecanismo V33.** A comparação mostrou a diferença de forma objetiva: o diff do L1 caiu de 41,9% para 4,8% no mobile e para 1,0% nos outros devices. O Tech Lead conseguiu julgar a fidelidade pelas imagens, sem conferência humana. A porcentagem serviu como tendência; a decisão veio da leitura do `side-by-side.png`.

## O que o aceite não prova

- Fidelidade de qualquer tela além de `/login`. L3, L4 e L5 só não pioraram; ajustá-las por inteiro aos quadros fica para outro Goal.
- A casca da área logada, que diverge do protótipo em todas as outras telas, conforme o pente-fino visual de 2026-10-01.
- Renderização em navegador ou aparelho real fora das quatro dimensões do `visual:compare` e das cinco larguras do `validate:ui`.
