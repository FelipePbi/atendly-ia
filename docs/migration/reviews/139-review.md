# Review formal — Goal 139

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal139](../goals/139-a-lista-dos-contatos-ignorados-com-a-origem-de-cada-marcacao-no-contrato.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review do diff inteiro, sem blocker; nenhuma correção de registro ficou para o fechamento.

O contrato passa a ler os contatos que a IA nunca responde: `GET /v1/conversations/ignored-contacts` (BFF) e `GET /internal/contacts/ignored` (IA) devolvem os contatos ignorados do canal ativo do tenant, com nome, telefone, data e origem da marcação, paginados e em ordem estável. Os dois `PUT` de marcação aceitam `origin`, opcional; quem não manda grava o mesmo de antes. O onboarding passa a gravar `ONBOARDING`, e a folha de Configurações grava `SETTINGS` no telefone e `CONVERSATION` na conversa; o chat não mudou. "Remover" pela rota por telefone deixa as sessões abertas e não expiradas do contato em `PERSONAL` "só esta conversa", e a sessão seguinte nasce sem a decisão. A rota do chat (D-130 (6)) continua devolvendo a IA na hora. Nenhuma tela mudou de aparência, e o W3 continua fora de `targets.json`. Decisão: [D-153](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `2eec1fcdbaf9c17d0e608d203f7ecc31d9e8525e` (Goal138). Base imediata da implementação: `b7fc94c02d67b8efe55042ea0138fcbc66e34c0e`, HEAD da worktree `.ai-worktrees/goal-139`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **21 arquivos** (17 rastreados e 4 novos não rastreados), hash do diff `605260431a6272f65a3fd25906e1e17419843d8cfbc338dbbcfc21df474c00a0`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - IA (2): `apps/ai-orchestrator/src/modules/internal/routes.ts` (a rota de leitura, `origin` nos dois `PUT` e a linha de `requiredScope`) e `apps/ai-orchestrator/src/modules/session/SessionService.ts` (`listIgnoredContacts`, o mapeamento da origem e `keepOpenSessionsOutOfAi`);
  - contrato (2): `packages/public-api-contract/src/schemas.ts` e `routes.ts`;
  - BFF (3): `apps/bff/src/modules/conversations/routes.ts`, `apps/bff/src/clients/ai-orchestrator/index.ts` e `apps/bff/PUBLIC_API_V1.md`;
  - frontend (2): `apps/frontend/src/data/services/BffConversationService.ts` e `apps/frontend/src/features/whatsapp/IgnoredContactsPanel.tsx` (só o argumento `origin`);
  - testes novos (4): `apps/ai-orchestrator/tests/internal/goal139-ignored-contacts-list.routes.test.ts` (24), `apps/ai-orchestrator/tests/integration/goal139-ignored-contacts.test.ts` (7), `apps/bff/tests/goal139-ignored-contacts.test.ts` (16) e `apps/frontend/tests/goal139-contatos-ignorados.test.tsx` (9);
  - testes ajustados, só na forma (5): `goal018-onboarding-reachability.test.tsx`, `goal106-whatsapp.test.tsx` e `goal129-contatos-ignorados.test.tsx` (o terceiro argumento `origin` na lista exata de argumentos), `ignored-contacts.routes.test.ts` da IA (o fake ganhou `contact.findUnique` e `conversationSession.findMany`) e `assistant.service.test.ts` da IA (o pino de linha 779 → 799 e a contagem de `this.http.` 45 → 46);
  - `docs/migration/` (3, por acréscimo): D-153 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal139 em `VALIDATION_GATE.md`.
- O banco (`schema.prisma`, nenhuma migration nem backfill), `targets.json`, as telas, `tools/ia-loop/` e o documento do Goal139 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01, WU-02, WU-03 e WU-18 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates rodaram com `attemptId` `a1`, sobre três estados da árvore: `code-v1:002b4e0e…` (WU-04 a WU-06, a IA), `code-v1:a8c13f06…` (WU-07 a WU-15) e a árvore final `code-v1:d093135d903b7dbf7f8a0a035f1f8ca986177b3cbe5756da2dfde499a05abc83` (WU-15-g2, WU-16, WU-17 e WU-19). A primeira execução de `validate:core` (WU-15) deu saída 1 por um pino de contagem exata (`expected 46 to be 45`), desatualizado pelo método novo do cliente do BFF; a DIAG-001 trocou o pino para 46, sem afrouxar a asserção, e a segunda execução saiu 0. As seções §1 a §4 e os critérios 1 a 6, 8 e 9 têm trabalho correspondente no diff; o critério 7 depende de execução e foi conferido pelos resultados das WU.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-153: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, a observação não bloqueante e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal139: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal139: o registro do aceite na abertura; a linha de `git diff --check` ganhou o resultado da WU-19 do IA Loop (saída 0, na árvore final); e a subseção "Aceite", com a conferência do Tech Lead.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal139), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal139) e em D-153.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos): typecheck (WU-04) e lint (WU-05) da IA com saída 0; `goal139` da IA 24 passando e 7 de integração pulados, sem banco no gate dirigido (WU-06); typecheck (WU-07) e lint (WU-08) do BFF com saída 0; `goal139` do BFF 16 (WU-09); typecheck (WU-10) e lint (WU-11) do frontend com saída 0; `goal139` do frontend 9 (WU-12); frontend 202 arquivos e 2915 testes (WU-13; a baseline é 201 e 2906, +1 arquivo e +9 testes); `test:gate` 296 (WU-14); `validate:core` com saída 0, 15 de 17 passos e 2 pulados (WU-15-g2, depois da DIAG-001); `validate:ui` 169 passed, 21 pulados, 0 retentativas (WU-16); `validate:integration` com saída 0, 36 de 36 passos, o gate autenticado com 305 passed e 0 retentativas e `test:ai-orchestrator-transport-durability` (que inclui a integração `goal139` da IA) com saída 0 (WU-17); `git diff --check` com saída 0 (WU-19).
- **Do Developer:** unidade da IA 98 arquivos e 1262 testes passando, 15 arquivos e 108 testes pulados sem banco (a baseline é 97 e 1238, com 14 e 101 pulados); unidade do BFF 24 arquivos e 193 testes passando (a partida não foi medida; por conta, 23 e 177); integração `goal139` da IA, 7 de 7, três vezes, contra PostgreSQL descartável.
- **Controles negativos do Developer:** (a) a (h), cada um reprovando o teste indicado com a mensagem registrada e revertido com `cmp` igual ao backup: (a), (b), (c), (e), (f) e (g) na WU-01; (d) na WU-02, nos dois lados (BFF e o padrão gravado na IA); (h) na WU-03.
- **Conferência do Tech Lead:**
  - **IA:** `listIgnoredContacts` filtra `tenantId`, `channelId` e `ignored: true`, ordena por `ignoredAt` crescente com nulos por último e `id` como desempate, pagina por `take`/`skip` e conta `total` com o mesmo filtro. A rota usa `resolveTenantEvolutionChannel`, com a mesma recusa da marcação por telefone, e tem `conversations:read` em `requiredScope`. `IGNORED_SOURCE_BY_ORIGIN` grava `"onboarding"`, `"panel"` e `"settings"`; `ignoredOriginFromSource` devolve `null` para qualquer outro valor. Sem `origin`, a rota da conversa grava `CONVERSATION` e a rota por telefone grava `ONBOARDING`, como antes. `setIgnoredByExternalContact` lê o contato antes de gravar e só chama `keepOpenSessionsOutOfAi` quando ele estava ignorado; a função grava `setCategoryOverride` com `PERSONAL`, `scope: "CONVERSATION"` e o autor do pedido nas sessões com `endedAt` nulo e `expiresAt` ≥ agora. `setIgnored` (o chat, D-130 (6)) não mudou.
  - **Contrato e BFF:** `ignoredContactListSchema` e `ignoredContactEntrySchema` conforme a escolha 2, com a rota no contrato. A rota estática do BFF fica antes de `GET /v1/conversations/:id`, com teste. O enum de `origin` é recortado por rota, sem padrão no BFF, e o valor fora dele dá 400 antes da IA. A resposta é validada pelo contrato. `PUBLIC_API_V1.md` documenta a rota e o campo.
  - **Frontend:** `listIgnoredContacts` com o schema da rota; `OnboardingIgnoredContacts` manda `ONBOARDING` nas duas marcações; `IgnoredContactsPanel` manda `CONVERSATION` na conversa e `SETTINGS` no telefone; o chat não manda `origin`. O chat não passa `signal`, então o parâmetro novo na terceira posição não desloca argumento.
  - **Escopo:** dentro do critério 8; os cinco testes ajustados mudam só a forma, com a justificativa em VALIDATION_GATE.
  - **Reexecução:** `goal139-ignored-contacts-list.routes.test.ts` e `ignored-contacts.routes.test.ts` da IA, 29 de 29; `goal139-ignored-contacts.test.ts` do BFF, 16 de 16.

## Aceito sem prova completa

1. **A integração `goal139` da IA** não foi reexecutada pelo Tech Lead. Valem a execução do Developer contra PostgreSQL descartável (WU-01, 7 de 7, três vezes) e o passo `test:ai-orchestrator-transport-durability` com saída 0 dentro do `validate:integration` (WU-17), que não retém a contagem de testes.
2. **A partida do BFF** não foi medida antes de editar, como o Goal pedia. O número de partida (23 arquivos e 177 testes) é por conta, tirando os 16 testes do único arquivo de teste novo do BFF, e está declarado como desvio.
3. **"Contato de outro canal do mesmo tenant"** só tem prova de unidade: o banco admite um canal por tenant e provedor (`ChannelConnection_tenantId_provider_key`), e a integração prova o tenant distinto.
4. **Os controles negativos** são os do Developer (WU-01, WU-02 e WU-03); o Tech Lead não os refez.
5. **A marcação e a remoção ponta a ponta num WhatsApp real**, com mensagem de entrada depois de "Remover": a prova é com `SessionService.evaluate` contra o banco.
6. **As contagens por passo** dentro de `validate:core` e `validate:integration` não foram guardadas pelo IA Loop; vale a saída 0.

## Pendências não bloqueantes

1. **"Remover" por telefone sem transação.** Em `setIgnoredByExternalContact`, limpar o contato e gravar a decisão das sessões abertas são escritas separadas. Se a segunda falhar, o contato fica desmarcado e a conversa aberta volta à IA; o erro sobe como 5xx. Repetir o pedido não corrige, porque o contato já não está ignorado e a regra não se aplica de novo. O Goal não pede atomicidade, e o caminho feliz está provado contra o banco.
2. **Fora deste Goal, com Goal e decisão próprios:** portar o W3 e a segunda linha do W1 ("Mãe, Dudu"); busca, filtro por origem e marcação em lote na lista; os pendentes do [review138](138-review.md) (`SERVICE_PRICE_NOT_INFORMED` para preço negativo, o leitor do calendário, `CUSTOMER_PHONE_SHARED` em revisão, a deduplicação da duplicata idêntica e "usar os valores da Minha Agenda"); os 13 quadros ainda sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3). O W3 continua sem alvo, mas a causa da divergência 5 de D-118 (a falta de leitura no contrato) deixou de existir.
