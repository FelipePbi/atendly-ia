# Review formal — Goal 129

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal129](../goals/129-o-whatsapp-conectado-e-os-contatos-ignorados-do-onboarding-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 4 saiu `CHANGES_REQUIRED` com 1 blocker só de documentação; o IA Loop aceitou a rodada e adiou a correção para este fechamento, sem nova rodada do Developer. A correção foi aplicada aqui, só em `docs/migration/`.

O WhatsApp conectado (`/onboarding/whatsapp-conectar` com a leitura `CONNECTED`) e os contatos ignorados (`/onboarding/contatos-ignorados`) ficam iguais aos quadros 4.4 e 4.5 nos quatro devices, salvo as divergências declaradas em D-143. A 4.4 desenha o corpo conectado pelo ponto de extensão `renderConnected` de D-118, e "Conectei o número errado" abre a folha de desconexão de hoje. A 4.5 lê a lista sem o filtro `ignored`, a caixa só muda depois da resposta do `PUT`, e o rodapé soma os contatos marcados sem contar duas vezes nem contar conversa desmarcada. A folha de Configurações (W3), o W1 e o W2 não mudam. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco, e nenhum pedido novo. Decisão: [D-143](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `f25c6e08163a988b3562f1f189b7e7f042db0d0e` (Goal128). Base imediata da implementação: `65ef56bd5ac64d5e75ede324fc34b6137b2eee42`, HEAD da worktree `.ai-worktrees/goal-129`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos** (19 rastreados e 3 novos não rastreados), hash do diff `c4cf79dffdee58d68429336ff75fc473b43431367fb8300d8c86091acf951de4`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (8): `features/whatsapp/WhatsAppConnectionPanel.tsx` (`renderConnected` também com `consentPhase`, `openDisconnectDialog` estável), `features/whatsapp/IgnoredContactsPanel.tsx` (`OnboardingIgnoredContacts` novo, `IgnoredContactsPanel` intacto), `features/onboarding/OnboardingScreen.tsx` (título e rodapé da 4.4, rodapé da 4.5), `features/onboarding/OnboardingShell.tsx` (`connected`, que tira o chevron da 4.4), `features/onboarding/blocks/whatsapp.tsx` (`WhatsappConnectedBody`), `features/onboarding/blocks/shared.tsx` (o parâmetro `onIgnoredCountChange` no tipo `OnboardingStepBody`), `features/onboarding/scenarios.ts` (eyebrow e texto da 4.5) e `shared/styles/avenly.css` (`.whatsapp-connected*`, `.ignored-*`, o topo e a busca da 4.5, `prefers-reduced-motion`);
  - `apps/frontend/tests/` (8): os novos `goal129-whatsapp-conectado.test.tsx`, `goal129-contatos-ignorados.test.tsx` e `goal129-alvos-captura.test.ts` (47 testes) e os ajustados `goal018-onboarding-reachability`, `goal063-onboarding-activation`, `goal065-onboarding-copy-whatsapp`, `goal071-onboarding-whatsapp` e `goal106-whatsapp`;
  - a captura e o gate (3): `apps/frontend/e2e/visual/targets.json` (4.4 e 4.5, só com `GET`, sem passos), `apps/frontend/e2e/routes.ts` (`/onboarding/contatos-ignorados` em `ONBOARDING_ROUTES`) e `scripts/tests/visual-responses.test.mjs` (de 56 para 57 testes);
  - `docs/migration/` (3, por acréscimo): D-143 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal129 em `VALIDATION_GATE.md`.
- `blocks/shared.tsx` não está nomeado no §1 do Goal; a mudança é só o tipo que leva a contagem do corpo da 4.5 ao rodapé, e foi aceita como parte do mesmo caminho. `OnboardingShell.tsx` mudou só para tirar o chevron da 4.4, a condição em que o Goal o permite. `apps/ai-orchestrator/`, o BFF, os serviços e `tools/ia-loop/` não foram tocados. O documento do Goal129 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers (3 de código, 1 de documentação).** O review DEEP aprovou a 4.4 e a lógica da 4.5 (leitura sem o filtro `ignored`, `PUT` antes da caixa, busca com `search`, `targets.json` só com `GET`) e achou: (1) a busca da 4.5 rígida em 46 px, com o cartão 5 px abaixo do quadro em tablet em paisagem e desktop, onde o quadro a comprime a 43 px; (2) o topo da 4.5 com `gap` de 14 px contra 12 px do quadro, com eyebrow, título, descrição e busca 2 px abaixo nos quatro devices; (3) o número adicionado por telefone de uma conversa visível, que não marcava a linha e ficava contado no rodapé depois de a conversa ser desmarcada; (4) `VALIDATION_GATE.md` dava os `validate:*` como adiados, e faltava declarar o preenchimento do 4º segmento da barra.
2. **Rodada 2 — `CHANGES_REQUIRED`, 3 blockers (1 de código, 2 de documentação).** A correção FIX-001 resolveu os quatro: a busca encolhe como no quadro de 1024 px em diante, `[data-step="contatos-ignorados"] .onboarding-top` tem 12 px, `ignoreByPhone` marca as conversas conhecidas do mesmo contato e desmarcar a conversa tira o número de `markedPhones`, com dois testes novos e variantes do controle (c). Os blockers: (1) no celular, a busca com 46 px contra 47 px do quadro (a coluna com `overflow: hidden` comprime os 48 px), com o texto de "Adicionar por telefone" 2 px acima; (2) a linha **Status** de D-137, já aceita, editada com texto do Goal129; (3) o parágrafo de controles negativos da seção do Goal128 no `VALIDATION_GATE.md`, já aceita, editado com texto do Goal129.
3. **Rodada 3 — `CHANGES_REQUIRED`, 1 blocker de código.** A correção FIX-001 deu 47 px à busca abaixo de 768 px e devolveu D-137 e a seção do Goal128 ao texto da baseline (`git diff 65ef56b -U0` com um hunk só no fim de cada arquivo). O blocker: o círculo tracejado de "Adicionar por telefone" com 38 px no app contra 41 px no quadro (38 px em content-box mais 2×1,5 px de borda), com a borda de baixo do cartão em y=676 contra 678 no tablet em retrato; e o pedido de declarar o corte do cartão no celular.
4. **Rodada 4 — review `CHANGES_REQUIRED`, 1 blocker só de documentação; decisão efetiva `ACCEPTED`, com a correção adiada para o fechamento.** A correção FIX-001 pôs `.ignored-add-mark` com 41 px (a classe só existe no corpo do onboarding, `IgnoredContactsPanel.tsx:513`) e declarou o corte do cartão no celular em D-143 e no `VALIDATION_GATE.md`. O review conferiu por pixel e aprovou. O blocker: a seção do Goal129 no `VALIDATION_GATE.md` atribuía a execução final, o `visual:compare` e os controles à rodada 2, quando as rodadas 3 e 4 também editaram `avenly.css` e a execução final é a da rodada 4.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `VALIDATION_GATE.md`, seção do Goal129 (blocker da rodada 4, adiado), só a atribuição; as contagens não mudaram:
   - a abertura passou a "Rodadas 1 a 4, 2026-10-06", com o que cada rodada fez (a rodada 3 a busca de 47 px no celular; a rodada 4 o círculo de 41 px e o corte do cartão no celular nos registros), e a dizer que os números são os da execução final, na rodada 4, sobre a árvore completa;
   - a linha de `validate:*` da tabela "Contagens" passou a "na execução final da rodada 4";
   - `### visual:compare` passou a "refeito na rodada 4 depois da última edição de código (refeito também pelo review da rodada 4, com os mesmos percentuais)";
   - `### Controles negativos` passou a dizer que os controles foram refeitos na rodada 2, depois da última edição de TypeScript de produto, e que as rodadas 3 e 4 só mudaram regras de `avenly.css` (a altura da busca no celular e o tamanho de `.ignored-add-mark`), que não alcançam a lógica que os controles (a) a (e) testam.
2. `DECISIONS.md`: o status de D-143 passou a ACCEPTED, com a nota de fechamento.
3. `CURRENT_STATE.md`, delta do Goal129: o item da 4.5 dizia só a busca de 48 px e 43 px de 1024 px em diante; passou a citar também os 47 px no celular e o círculo de 41 px, que as rodadas 3 e 4 trouxeram.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal129), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal129) e em D-143.

- **Gates do IA Loop, rodada 4, na árvore aceita:** typecheck (WU-04), lint (WU-05), testes alvo (WU-06, 3 arquivos e 47 testes), suíte do frontend (WU-07, 183 arquivos e 2431 testes), `test:gate` (WU-09, 290), `validate:core` (WU-10, `PASSED` com 2 passos pulados e relatados), `validate:ui` (WU-11, 169 passando e 21 pulados, 0 retentativas), `validate:integration` (WU-12, gate autenticado com 305 `passed` e 0 retentativas; baseline 299 mais 1 `flaky`, +5 de `/onboarding/contatos-ignorados` nas cinco larguras) e `git diff --check` (WU-13), todos com saída 0. A WU-08 (`test:ia-loop`) foi pulada porque o repositório não tem o script; `visual-responses.test.mjs` roda dentro de `test:gate`.
- **Controles negativos do Developer (rodada 2):** (a) a caixa muda antes da resposta do `PUT`, 3 de 25 reprovam; (b) a lista lida com `ignored: false`, 2 de 25; (c) o rodapé conta duas vezes o mesmo contato, 3 de 25, e a variante que conta a conversa desmarcada, 10 de 25, mais as duas variantes do blocker 3 da rodada 1, 1 de 25 cada; (d) a 4.4 conectada com qualquer leitura, 1 de 10; (e) o 4.5 de `targets.json` com um passo que toca a caixa, 1 de 12 em `goal129-alvos-captura.test.ts` e 1 de 57 em `visual-responses.test.mjs`. Cada mutação foi revertida e conferida com `cmp`. O controle (d) mostrou um teste que passava sem provar nada; ele passou a esperar a leitura assentar.
- **Conferência do Tech Lead:**
  - **Código (rodadas 1 e 2):** o corpo conectado só aparece com `CONNECTED`; "Sim, continuar" é o submit de antes e "Conectei o número errado" só abre a folha, sem desconectar. A 4.5 lê `conversations.list({ limit: 20 })` sem `ignored`, `setKnown` vem depois de `setIgnored`, e a contagem é um conjunto de `externalContactId`, com a regra do contato nos dois sentidos depois da rodada 2. `IgnoredContactsPanel` de Configurações não mudou, e o CSS novo vale só nas classes novas e em `[data-step]`.
  - **Correções (rodadas 3 e 4):** a busca de 47 px vale só abaixo de 768 px e `.ignored-add-mark` só existe no corpo do onboarding; nenhuma das duas alcança a lógica que os controles testam.
  - **`visual:compare` de 4.4 e 4.5:** refeito pelo Tech Lead em todas as rodadas. Na rodada 4 (8 pares, saída 0): 4.4 em 3,8/1,5/2,0/1,5% e 4.5 em 1,1/0,9/1,3/1,0% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos percentuais do registro. Os oito `side-by-side.png` foram abertos e `prototype.png` foi medido contra `app.png`. Na 4.5, no tablet em retrato, as linhas do cartão coincidem (308/369/430/491/552/613), a borda de baixo fica em 679 contra 678 e o círculo tem 41 px; no celular, as linhas coincidem de 301 a 606 e o círculo fica a 1 px. Os botões primários coincidem nos quatro devices, com o texto a no máximo 1 px. A 4.4 não mudou depois da rodada 1 e só tem as divergências declaradas, com o chevron ausente como no quadro.

## Divergências aceitas

Declaradas pelo Goal ou por D-143, conferidas nas capturas:

1. Na 4.4, o disco com o ícone de pessoa no lugar das iniciais "CR" e o telefone na linha do nome: o contrato não traz nome nem foto. Com uma linha a menos, o grupo fica cerca de 12 px mais abaixo e o título cerca de 14 px mais acima que no quadro (mobile).
2. Na 4.5, as conversas marcadas antes aparecem já marcadas e contam no rodapé; os números marcados por telefone em outra sessão não aparecem, porque o contrato não tem essa leitura.
3. Na 4.5, em tablet em paisagem, desktop e celular, o quadro corta o cartão por `overflow: hidden` e mostra a borda arredondada de baixo; o app deixa o cartão inteiro e a coluna rola, sem cortar uma conversa real.
4. O preenchimento do 4º segmento da barra de progresso, derivado por `chapterFraction` (D-104): 4.4 com 50% no quadro e 2/6,5 no app; 4.5 com 62% no quadro e 3/6,5 no app.
5. O "Sair" do topo abaixo de 1024 px e do rodapé da sidebar (D-104).
6. A barra de status e o indicador de início do iPhone nos quadros mobile.

## Observações sem bloqueio

1. A rodada 2 editou registros já aceitos (D-137 e a seção do Goal128 no `VALIDATION_GATE.md`). A rodada 3 os devolveu ao texto da baseline, e o diff aceito de `docs/migration/` é só por acréscimo no fim de cada arquivo.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer, da rodada 2; o Tech Lead não os refez. As rodadas 3 e 4 só mudaram regras de `avenly.css`, e eles não foram refeitos depois delas.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop, sem reexecução pelo Tech Lead além do `visual:compare` de 4.4 e 4.5.
3. **A regressão de 4.1, 4.2, 4.6, W1 e W2** é a do Developer (18 dos 20 pares iguais byte a byte; nos dois outros, 8 e 7 pixels com diferença de no máximo 5 em 255 por canal); o Tech Lead não a refez.
4. **A WU-08 (`test:ia-loop`)** não rodou: o repositório não tem o script.
5. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.
