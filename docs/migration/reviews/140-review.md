# Review formal — Goal 140

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal140](../goals/140-os-contatos-que-a-ia-nunca-responde-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review `DEEP` do diff inteiro, sem blocker; nenhuma correção de registro ficou para o fechamento.

Configurações › WhatsApp › "Contatos que a IA nunca responde" passa a ser a tela do quadro W3, em rota própria (`/configuracoes/whatsapp/contatos-ignorados`): a lista lida do contrato (D-153), na ordem da resposta e com "Carregar mais", a legenda pela origem de cada marcação, "Remover" sem `origin` e a busca que marca uma conversa (`CONVERSATION`) ou um número (`SETTINGS`). A linha do W1 vira um `Link` para a rota e ganha a segunda linha com os nomes da lista. A folha `Dialog` `sheet` e `IgnoredContactsPanel` saíram; `OnboardingIgnoredContacts` (4.5) ficou com o mesmo comportamento. O W3 entra em `targets.json` (101 alvos; 12 dos 113 quadros seguem sem alvo), e a divergência 5 de D-118 deixou de existir. Só frontend: o contrato, o BFF, a IA e o banco não mudaram. Decisão: [D-154](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `7a1f2f22e8e9e77309ca6b6ec935ea5580890f13` (Goal139). Base imediata da implementação: `c51c7b2cff7bbc856bd8f74e93103af100a618ce`, HEAD da worktree `.ai-worktrees/goal-140`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **20 arquivos** (15 rastreados e 5 novos não rastreados), hash do diff `edabce02b3a100303b3bc2ffeb10d3f394bbb3ad91815221f5855c5e41bed888`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - frontend, código (8): `app/(platform)/configuracoes/whatsapp/contatos-ignorados/page.tsx` (novo), `features/settings/IgnoredContactsScreen.tsx` (novo), `features/settings/dayMonth.ts` (novo, `dayMonthLabel` extraída de `connectedSince`), `features/settings/types.ts` e `ProductSettingsScreen.tsx` (o cenário `whatsapp-ignored`), `features/settings/WhatsAppConnectedSettings.tsx` (a linha do W1 e o fim da folha), `features/whatsapp/IgnoredContactsPanel.tsx` (sai o painel da folha) e `shared/styles/avenly-settings.css` (`.wa-ignored*` e `text-decoration: none` em `.wa-row`);
  - captura e gate (3): `apps/frontend/e2e/visual/targets.json` (o W3 novo e a lista fixa no W1 e no W2), `apps/frontend/e2e/routes.ts` (a rota nova em `AUTHENTICATED_ROUTES`) e `scripts/tests/visual-responses.test.mjs`;
  - testes novos (2): `apps/frontend/tests/goal140-contatos-ignorados.test.tsx` (42) e `goal140-alvos-captura.test.ts` (14);
  - testes ajustados (4): `goal106-whatsapp.test.tsx`, `goal129-contatos-ignorados.test.tsx`, `goal129-whatsapp-conectado.test.tsx` e `goal139-contatos-ignorados.test.tsx`, só no que o Goal muda (a folha que vira rota, a linha do W1 e o mock da leitura);
  - `docs/migration/` (3, por acréscimo): D-154 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal140 em `VALIDATION_GATE.md`.
- O contrato, o BFF, a IA, o banco, a semente da captura e do gate, `e2e/authenticated-matrix.spec.ts`, `features/onboarding/`, `tools/ia-loop/` e o documento do Goal140 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (a tela do W3), WU-02 (a linha do W1 e o fim da folha), WU-03 (os alvos, a captura, as medidas e os controles (a) a (j)) e WU-13 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-04 a WU-12 e WU-14 rodaram todos com `attemptId` `a1` sobre uma só árvore, `code-v1:1900711e7c35bf8f7f635f515a572a10fba68070e959fb1ce72e56d55fd8ac01`; nenhum precisou ser refeito. WU-08 (`tooling-tests`) ficou `SKIPPED`, porque o repositório não declara `test:ia-loop`.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-154: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, dois pontos que ficam mais precisos que a proposta, o aceito sem prova completa, a observação não bloqueante e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal140: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal140: o registro do aceite na abertura e a subseção "Aceite", com a conferência do Tech Lead e o resultado da WU-14.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal140), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal140) e em D-154.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos, mesma árvore): typecheck (WU-04) e lint (WU-05) do frontend com saída 0; `goal140` 2 arquivos e 56 testes (WU-06); frontend 204 arquivos e 2964 testes (WU-07; a baseline é 202 e 2915: +56 do `goal140` e −7 da folha que saiu); `tooling-tests` `SKIPPED` (WU-08); `test:gate` 297 (WU-09; 296 na baseline, +1 do W3 em `visual-responses.test.mjs`); `validate:core` com saída 0, 15 de 17 passos e 2 pulados (WU-10); `validate:ui` 169 passed, 21 pulados, 0 retentativas, igual à baseline, porque o gate público não mede rotas autenticadas (WU-11); `validate:integration` com saída 0, 36 de 36 passos e o gate autenticado com 310 passed e 0 retentativas, +5 pela rota nova nas cinco larguras (WU-12); `git diff --check` com saída 0 depois dos registros (WU-14).
- **Do Developer:** `visual-responses.test.mjs` 64 (63 na baseline); a baseline do `visual:compare` capturada seis vezes e o depois quatro, com a regressão dos 32 `app.png` de R1, R2, I1, I2, C1, C2, IA1 e 4.5 dentro do ruído medido; os doze `side-by-side.png` abertos e as medidas em até 1 px, salvo o deslocamento de 14 px do mobile (a barra do iPhone) e a área de toque de "Remover" (72 × 40 px).
- **Controles negativos do Developer:** (a) a (j), na WU-03, cada um reprovando o teste indicado com a mensagem registrada em VALIDATION_GATE e revertido com `cmp` igual ao backup.
- **Conferência do Tech Lead:**
  - **A tela:** a rota pelo cenário `whatsapp-ignored` e `IgnoredContactsScreen` com `SettingsPage` (título único "A IA nunca responde", voltar para `/configuracoes/whatsapp`); a leitura com `limit: 100` e `offset: 0`, "Carregar mais" com `offset` igual aos itens lidos; os estados de carregamento (`aria-busy`), vazio sem a nota, sem canal (`schedulingRefusalCode` `CHANNEL_CONNECTION_NOT_FOUND`, com o link "Conectar WhatsApp") e de falha (`role="alert"` e "Tentar de novo").
  - **Cada linha:** a legenda por origem da escolha 5 (`CONVERSATION` sem telefone, o nome que já é telefone sem repetição) e a data por `dayMonthLabel`, no fuso do negócio; "Remover" com `ignoreByPhone(externalContactId, false)`, sem `origin`, uma remoção por vez, e a linha saindo só depois da resposta.
  - **A busca:** 250 ms, `conversations.list` com `ignored: false`, `limit: 20` e `search`, com `AbortController`; "Ignorar" grava `CONVERSATION`, "Adicionar" (a partir de 10 dígitos) grava `SETTINGS`; `VALIDATION_ERROR` e a falha geral com mensagem própria.
  - **O W1:** `Link` para a rota, a segunda linha de `listIgnoredContacts({ limit: 2 })` com " e mais N"; o `Dialog` da folha e `IgnoredContactsPanel` removidos; `OnboardingIgnoredContacts` sem mudança de comportamento.
  - **Testes ajustados:** nenhuma asserção de pedido ou de origem afrouxada; as provas que a folha tinha (`SETTINGS` no telefone e `CONVERSATION` na conversa) migraram para o `goal140`.
  - **Reexecução:** `npx vitest run goal140 goal106 goal129 goal139`, 7 arquivos e 135 testes passando; `npm run visual:compare -- --target W3,W1,W2` na árvore aceita, saída 0 (W3 7,6 / 3,5 / 5,8 / 4,9 %, W1 8,1 / 3,7 / 6,3 / 5,2 %, W2 2,3 / 6,2 / 7,7 / 6,3 %). Essa captura vem depois da última escrita de `avenly-settings.css` e resolve a ressalva do Developer sobre a data de modificação do arquivo.
  - **Visual:** os doze `side-by-side.png` abertos. O W3 tem a mesma estrutura, ordem, avatar, legendas, "Remover", raios, bordas e nota do quadro nos quatro devices; as diferenças que restam são as declaradas (a casca de D-118, a barra do iPhone no mobile e o hub ao lado). O campo de busca de 48 px confere com o quadro (`height: 46px` em caixa de conteúdo mais 1 px de borda). O W1 mostra "Mãe, Dudu ❤️", o nome como foi marcado, declarado nas `notes`; o W2 só muda atrás do véu.
  - **Registros:** D-154 PROPOSED com contrastes e alvos de toque; CURRENT_STATE e VALIDATION_GATE com contagens coerentes com os resultados das WU.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-03); o Tech Lead não os refez.
2. **`tooling-tests` (WU-08)** ficou `SKIPPED`: o repositório não declara `test:ia-loop`. Não se aplica a este Goal.
3. **A tela num aparelho real**, e "Remover", "Ignorar" e "Adicionar" contra um WhatsApp real: a captura só lê (nenhum `PUT`), os pedidos são provados em jsdom contra o serviço simulado e o efeito na IA é o provado no Goal139.
4. **As contagens por passo** dentro de `validate:core` e `validate:integration` não foram guardadas pelo IA Loop; vale a saída 0.

## Pendências não bloqueantes

1. **Mensagem de falha de "Remover" fora da linha.** Na falha, a linha fica e a mensagem com `role="alert"` aparece abaixo do cartão da lista, não dentro da linha, como D-154 (4) descreve. Atende ao critério do Goal (a linha não sai e a falha é anunciada).
2. **`displayName` sem `trim` na segunda linha do W1.** `WhatsAppConnectedSettings` usa `item.displayName ??` direto, e a tela do W3 usa `displayName?.trim() || null`. Um `displayName` só de espaços sairia como nome em branco na segunda linha do W1.
3. **Precisão do relatório da WU-02.** O relatório diz que `OnboardingIgnoredContacts` ficou "byte a byte", mas um bloco JSX dele foi reformatado pelo Prettier. Não há mudança de comportamento.
4. **Fora deste Goal, com Goal e decisão próprios:** a transação de "Remover" por telefone (pendência 1 do [review139](139-review.md)); busca na lista, filtro por origem e marcação em lote; o telefone da conversa marcada no contrato; os pendentes do [review138](138-review.md); os 12 quadros ainda sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, H6, NT3 e 4.3).
