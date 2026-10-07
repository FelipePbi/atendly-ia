# Review formal — Goal 141

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, conforme o [Goal141](../goals/141-remover-um-contato-ignorado-grava-tudo-ou-nada.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review do diff inteiro, sem blocker; nenhuma correção de registro ficou para o fechamento.

"Remover" pela rota por telefone (`PUT /internal/contacts/ignore` com `ignored: false`) passa a gravar a limpeza do contato e a decisão `PERSONAL` só nesta conversa das sessões abertas e não expiradas numa transação só. Com a escrita da sessão falhando, nada fica gravado e a rota responde 5xx; repetir o pedido aplica a regra inteira; uma leitura de fora vê o contato ainda ignorado até a sessão estar gravada; dois pedidos simultâneos respondem 200 e gravam a decisão uma vez. Só a IA: o contrato, o BFF, o frontend e o banco não mudaram, e nenhuma tela mudou. Decisão: [D-155](../DECISIONS.md), aceita neste fechamento. A pendência 1 do [review139](139-review.md), repetida na pendência 4 do [review140](140-review.md), deixou de existir.

## Escopo e identidade do diff

- Baseline aceita vigente: `40273d8180fcffc1cdf1c9a6b09013ceb1a6d13d` (Goal140). Base imediata da implementação: `6034c5d5140ee127589f8cfabf95db7d0510feed`, HEAD da worktree `.ai-worktrees/goal-141`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **8 arquivos** (6 rastreados e 2 novos não rastreados), hash do diff `1898ace17fd5f9c178acfae5bc733bd2eb38097ffe850870fd821e1a6ffdfcc5`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - IA, código (1): `apps/ai-orchestrator/src/modules/session/SessionService.ts` (84 inserções e 45 remoções);
  - testes novos (2): `apps/ai-orchestrator/tests/internal/goal141-remove-ignored-contact-atomic.test.ts` (10, unidade) e `apps/ai-orchestrator/tests/integration/goal141-remove-ignored-contact-atomic.test.ts` (4, contra PostgreSQL);
  - testes ajustados (2): `tests/internal/goal139-ignored-contacts-list.routes.test.ts` e `tests/internal/ignored-contacts.routes.test.ts`, só no falso de Prisma (`$transaction` e `contact.updateMany`; no segundo, também o helper `findByKey` e um comentário);
  - `docs/migration/` (3, por acréscimo): D-155 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal141 em `VALIDATION_GATE.md`.
- `modules/internal/routes.ts`, `schema.prisma`, o BFF, o contrato, o frontend, `tests/session/support/fake-prisma.ts`, `tools/ia-loop/` e o documento do Goal141 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (a transação e os testes de unidade), WU-02 (a integração contra PostgreSQL e os controles (a) a (c)) e WU-10 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-03 a WU-09 e WU-11 rodaram todos com `attemptId` `a1` sobre uma só árvore, `code-v1:458693bae5dd9495c5228c2018cbeaabe6e74cf0b6139167c2715f5f81bf260e`; nenhum precisou ser refeito.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-155: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, as observações não bloqueantes e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal141: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal141: o registro do aceite na abertura e a subseção "Aceite", com a conferência do Tech Lead e o resultado da WU-11.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal141), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal141) e em D-155.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos, mesma árvore): typecheck (WU-03) e lint (WU-04) da IA com saída 0; `goal141` 10 passando e 4 pulados, sem banco (WU-05); unidade da IA 99 arquivos e 1272 testes passando, 16 arquivos e 112 testes pulados (WU-06; a partida é 98 e 1262, 15 e 108: +1 arquivo e +10 testes de unidade, +1 arquivo e +4 testes de integração pulados sem banco); `test:gate` 297, igual à baseline (WU-07); `validate:core` com saída 0, 15 de 17 passos e 2 pulados, sem pino de contagem a corrigir (WU-08); `validate:integration` com saída 0, 36 de 36 passos e o gate autenticado com 310 passed e 0 retentativas, que inclui `tests/integration` da IA com o arquivo `goal141` (WU-09); `git diff --check` com saída 0 depois dos registros (WU-11). Sem `validate:ui`: nenhum arquivo do frontend mudou.
- **Do Developer:** a integração `goal141` contra um PostgreSQL descartável em 5 execuções (4 seguidas e 1 final, junto da integração `goal139` e da unidade `goal141`, 21 de 21), 4 de 4 em todas; o mecanismo de falha e de pausa só nos testes (`vi.spyOn` em `writeEffectiveCategory` e um segundo `PrismaClient` para a leitura de fora).
- **Controles negativos do Developer:** (a) a limpeza fora do `tx`, (b) a exceção da sessão engolida e (c) a limpeza sem `ignored: true`, na WU-02, cada um reprovando os testes que o Goal nomeia (no (c), também o `goal139` equivalente), com a mensagem registrada em VALIDATION_GATE e revertido com `cmp` igual ao backup.
- **Conferência do Tech Lead:**
  - **A transação:** com `ignored: false`, um único `this.prisma.$transaction`, nesta ordem: `tx.contact.updateMany` pela chave `[tenantId, channelId, externalContactId]` com `ignored: true`; `tx.contact.upsert`, que mantém a criação do contato inexistente já desmarcado; e, só com `count` 1, `keepOpenSessionsOutOfAi(tx, ...)`. Sem `timeout` próprio; a exceção sobe como antes (5xx, sem código de erro novo).
  - **A escrita da sessão:** `keepOpenSessionsOutOfAi` lê as sessões abertas e não expiradas pelo `tx` e chama `writeEffectiveCategory` com a sessão e o contato já lidos, `PERSONAL`, o autor e `db = tx`. É o recálculo condicional de `setCategoryOverride` com `scope: "CONVERSATION"`: sem `update` cru, sem releitura de `currentSession`, sem transação aninhada. `writeEffectiveCategory` e `requireContact` ganharam só o `db` opcional (padrão `this.prisma`); nenhum chamador existente mudou.
  - **O que não mudou:** a marcação (`ignored: true`) com um `upsert` fora da transação; `modules/internal/routes.ts`, `setIgnored` (D-130 (6)) e a leitura da lista (D-153 (1)). Nenhum gancho de teste no código de produção.
  - **Concorrência:** em PostgreSQL com `READ COMMITTED`, o segundo "Remover" simultâneo espera o lock da linha do contato e, depois do commit do primeiro, reavalia `ignored: true` e recebe `count` 0: sem efeito duplo e sem ciclo de lock.
  - **Testes:** a unidade `goal141` usa um falso que separa o cliente raiz do cliente da transação, com um diário que desfaz o que o `tx` escreveu e erro em transação aninhada; cobre o caminho feliz com o autor, o `where` exato, as duas variantes de falha com repetição, o contato não ignorado, o inexistente, a marcação e a rota da conversa. A integração cobre (i) a (iv). Nos falsos `goal139` só entraram `$transaction` e `updateMany`, e nenhum `expect` mudou.
  - **Reexecução:** num contêiner pgvector descartável, migrado e removido no fim, os cinco arquivos `goal141` e `goal139` da IA (unidade e integração) três vezes, 50 de 50 nas três. `tests/integration` da IA inteiro no mesmo banco teve só duas falhas, fora do diff e causadas pelo banco ad hoc (`goal109` recusa o nome do banco; o fixture legado de `transport-durability` não estava ali); o `validate:integration` da WU-09, com o ambiente próprio, saiu 0.
  - **Registros:** D-155 com número livre e em PROPOSED; CURRENT_STATE e VALIDATION_GATE só por acréscimo, com contagens coerentes com os resultados das WU e os limites declarados.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-02); o Tech Lead não os refez.
2. **A falha real do banco** no meio da transação (conexão caída): a prova usa o espião em `writeEffectiveCategory`.
3. **A corrida sob carga:** o teste simultâneo (iii) usa pausa e uma espera de 300 ms entre duas conexões.
4. **"Remover" ponta a ponta num WhatsApp real.**
5. **As contagens por passo** dentro de `validate:core` e `validate:integration` não foram guardadas pelo IA Loop; vale a saída 0.

## Pendências não bloqueantes

1. **O teste de unidade "pedido repetido depois do sucesso"** serializa os pedidos no falso, então não prova concorrência; quem a prova é (iii) da integração.
2. **(iii) não mostra que o segundo pedido chegou a esperar o lock** da linha do contato; o limite está declarado em D-155 e em VALIDATION_GATE.
3. **Fora deste Goal, com Goal e decisão próprios:** as observações não bloqueantes do [review140](140-review.md) (a mensagem de falha de "Remover" abaixo do cartão, `displayName` sem `trim` na segunda linha do W1); busca na lista, filtro por origem e marcação em lote; o telefone da conversa marcada no contrato; os pendentes do [review138](138-review.md); os 12 quadros ainda sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, H6, NT3 e 4.3).
