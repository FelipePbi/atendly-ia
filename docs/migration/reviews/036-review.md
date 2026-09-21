# Review formal — Goal 036

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-20, conforme o [Goal036](../goals/036-contrato-publico-completo-campo-a-mais-e-rota-em-laco.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–035) foi reaberto, reavaliado ou revertido. Duas rodadas: uma `CHANGES_REQUIRED` (2 blockers) e o aceite na segunda, com zero blockers.

O Goal tinha uma classe de risco nomeada no enunciado — **declarar o contrato completo enquanto o gate continua cego** — e ela não se materializou: a detecção de chave não declarada entrou recursiva, no gate do produtor, e os quatro achados fechados ganharam reprodução permanente na árvore. Os dois blockers da rodada 1 foram de outra natureza, e da mesma família entre si: **documentação de fechamento que descrevia uma árvore menor do que a real**. As páginas de §9 foram escritas pela unidade WU-07, antes das unidades de diagnóstico que ainda alteraram testes do frontend e o rehearsal; o texto ficou verdadeiro para o momento em que foi escrito e falso para a árvore entregue.

## Escopo e identidade do diff

- Baseline aceita vigente: `3202cb0b30f2e59c9d69e7a86b4940853c97d922` (implementação do Goal035). Base imediata da implementação: `4f02c538d2cc92befa4edc50dd6961265bdc87ae` (fechamento do Goal035), HEAD da worktree `.ai-worktrees/goal-036`, inalterado nas duas rodadas.
- Snapshot aceito, calculado pelo IA Loop: **20 arquivos**, hash do diff `2eb161836860feab5689ce98aabd0e35e228f8d8225828a4ab7230bf1731e95b`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **BFF** 5 arquivos (`src/lib/response-contract.ts`, `src/modules/conversations/routes.ts` e três testes novos em `tests/`: `goal036-response-contract-undeclared-key.test.ts`, `goal036-wu02-declared-fields.test.ts`, `goal036-wu03-idempotent-delete.test.ts`); **pacote de contrato** 2 arquivos (`src/schemas.ts`, `src/routes.ts`); **frontend** 6 arquivos (`src/data/services/BffCustomerService.ts`, `e2e/authenticated-matrix.spec.ts` e quatro fixtures de teste dos Goals 018, 022 e 025); **scripts e gate** 3 arquivos (`final-production-audit.mjs`, `goal033-authenticated-ui-rehearsal.mjs`, `tests/final-production-audit-legacy-regression.test.mjs`); **documentação** 4 arquivos em `docs/migration/`.
- **Nenhum arquivo de `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` ou `apps/health-worker/` mudou.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota nova, nenhum verbo novo, nenhum campo novo ou removido no corpo emitido, nenhuma tela, componente, texto ou CSS. `RESPONSE_CONTRACT_CHECK_ENABLED` intocado. `scripts/validate-integration.mjs` inalterado, com os mesmos 35 passos.
- Inspecionado o patch completo de cada rodada contra a worktree, não contra o relatório do Developer. Nenhum arquivo de código foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (2 blockers)

O escopo técnico já estava entregue e foi conferido na árvore: `collectUndeclaredKeys` comparando o `data` emitido com `parsed.data`; o mesmo `ResponseContractViolationError`, o mesmo `MAX_REPORTED_ISSUES = 5` e o mesmo formato de mensagem; payload devolvido pela mesma referência; os quatro achados corrigidos no contrato e não no produtor; as três rotas literais; o check novo com regressão nos dois sentidos. Os dois blockers:

1. **FINAL_AUDIT §13 e CURRENT_STATE (delta036) declaravam um escopo de arquivos que a árvore contradizia.** O texto afirmava que o diff036 era `apps/bff/`, `packages/public-api-contract/`, `BffCustomerService.ts` e `scripts/final-production-audit.mjs`, "nada além disso", e que "este diff não toca `apps/frontend/e2e/`". A árvore final também alterava `apps/frontend/e2e/authenticated-matrix.spec.ts` (+47), quatro testes de `apps/frontend/tests/` e `scripts/goal033-authenticated-ui-rehearsal.mjs` — mudanças das unidades de diagnóstico, posteriores à WU-07 que escreveu a documentação. O critério 24 exige documentação escrita **depois** da última mudança de árvore.
2. **A mudança de semântica do gate `rehearse:goal033-authenticated-ui` não estava registrada em lugar nenhum.** O rehearsal passou a pedir `GET /v1/availability` com `days=2` (era `days=1`) e a derivar `measuredDate` de `offered[0].date` em vez de `localIsoDate(new Date())`; a spec passou a exigir `GOAL033_MEASURED_DATE` e a navegar a Agenda com "Próximo dia"/"Dia anterior" antes de conferir o conteúdo semeado. Consequência para o próximo leitor: o gate deixou de provar que a Agenda renderiza o atendimento semeado **na visão padrão (hoje)** e passa a prová-lo **no dia efetivamente semeado**.

## Rodada 2 — ACCEPTED

Os dois blockers foram conferidos na worktree, não no relatório:

- **Escopo corrigido nos dois documentos.** FINAL_AUDIT §13 e CURRENT_STATE delta036 passaram a listar a árvore real — a spec e2e, os quatro testes de frontend, o rehearsal e `scripts/tests/` — declarando que são dados de asserção e fixtures de schema, nunca tela. §4 a §12 do FINAL_AUDIT não foram reescritas.
- **Semântica do gate registrada.** VALIDATION_GATE ganhou seção própria com `days=1` para `days=2`, `measuredDate = offered[0].date`, a exigência de `GOAL033_MEASURED_DATE` e a navegação de dia na Agenda, dizendo o que o passo decide agora e o que continua igual.

### Verificações próprias do reviewer

- `node scripts/final-production-audit.mjs`: exit 0, 33 checks, 0 falhas. `bff_v1_routes_use_literal_paths` `ok: true` com `details` declarando os arquivos lidos ("read 65 files"); `public_api_route_coverage` `ok: true` exibindo `(116 routes registered)` no `details`, com o conjunto de rotas sem chamador computado — critérios 12 e 13.
- Regressões de `scripts/tests/`: 45 testes, 0 falhas, com a regra nova exercitada nos dois sentidos em árvore sintética.
- `schemas.ts` sem `.strict()`, `.passthrough()` ou `.catchall()` (grep vazio) e sem `transform`, `pipe` ou `coerce` — critério 4. Nenhum campo existente mudou de nome, tipo ou obrigatoriedade.
- **`ai.reconciled` obrigatório está justificado no produtor, não em observação de suíte:** `reconcileAiActivation` captura erro e sempre devolve um `AiActivationOutcome` (incluindo `"FAILED"`), `systemStatusSchema` só é usado por `GET /v1/status`, e o enum bate com `PUBLIC_API_V1.md:486-496`. `modalities`, `address` e os sete campos de serviço entraram opcionais, com as mesmas cadeias de `serviceSchema`.
- **Falso positivo controlado:** a detecção itera só as chaves do emitido contra a saída do `safeParse`, então `default()` não vira achado, e `z.record`, `z.unknown`, `.passthrough()` e `.catchall()` têm teste próprio provando que nada é reportado.
- **Consumidores de `deletedSchema` conferidos um a um:** só a entrada `DELETE /v1/customers/:id/primary-guardian` usa `deletedIdempotentSchema`; calendário, notas e tags seguem em `z.literal(true)`, e nenhuma tela lê o resultado da chamada.
- As três rotas de `conversations` viraram `app.post` literais com `preHandler`, resolução de `id` e corpo idênticos aos do laço.
- `npx vitest run` no frontend, executado pelo reviewer: 72 arquivos, 666 testes, 0 falhas. `npx eslint src tests --max-warnings=0` no frontend: exit 0. As quatro fixtures só ganharam campos neutros, sem mexer em asserção; o `eslint-disable` novo da spec e2e tem justificativa escrita na própria linha.

### Gates da rodada 2

Rodaram nesta mesma árvore e passaram: typecheck do BFF e do frontend, lint do BFF e do frontend, testes dirigidos do BFF (13 testes), suíte unitária do BFF (`13 passed | 30 skipped` arquivos, `114 passed | 240 skipped` testes — os skips são os de integração, pré-existentes), `test:gate` exit 0, `validate:core` exit 0, `validate:integration` exit 0 com a pré-condição de bancos descartáveis presente, e `validate:ui` exit 0. Nada foi apresentado como verde sem ter rodado.

## Observações não bloqueantes

- **O check novo cobre só o lado do BFF.** A extração de chamador do frontend (`FRONTEND_ROUTE_SCHEMA_CALL_PATTERN`) também exige path literal, e `BffConversationService.ts` chama `takeover`, `release` e `resolve` com path entre crases. Desde que as três rotas ficaram visíveis do lado do BFF, elas aparecem como "sem chamador" no `details` de `public_api_route_coverage` mesmo tendo chamador de fato. Não há lacuna real — as três têm entrada na tabela —, e o limite está registrado em CURRENT_STATE, FINAL_AUDIT §13 e VALIDATION_GATE.
- **Um bloco de falha com exit 0 no log de `validate:integration`**, em `[notebook-1024] › servicos`, explicado por `retries: 1` em `playwright.authenticated.config.ts:41` — teste instável que passou na retentativa. Vale vigiar se reaparecer.
- **Correção factual feita no fechamento:** CURRENT_STATE e FINAL_AUDIT §13 chamavam `apps/frontend/e2e/authenticated-matrix.spec.ts` de "o novo". O arquivo existe desde o [Goal033](033-review.md) (`090ee28`) e neste diff só recebe +47 linhas; o parêntese que descrevia a mudança já estava correto. As duas frases passaram a dizer isso.

## O que este aceite não cobre

- **A verificação de resposta continua sem rodar em produção**, por [D-051](../DECISIONS.md), que este Goal não reabre. `RESPONSE_CONTRACT_CHECK_ENABLED` segue `env.NODE_ENV !== "production"`.
- **A rigidez é do produtor, não do consumidor**, por [D-052](../DECISIONS.md). Os schemas compartilhados continuam tolerantes a campo que não conhecem: em produção, uma resposta com chave a mais continua decodificando na tela sem reclamar.
- **Fechar A-20 a A-23 não decidiu se as rotas *deveriam* devolver esses campos** — decidiu que, já devolvendo, o contrato deve declará-los.
- **M4 — envio real a número real — continua aberto** como gate operacional. Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para WhatsApp real.
- **Fidelidade visual à referência aprovada** continua sendo conferência humana, como no [review033](033-review.md), no [review034](034-review.md) e no [review035](035-review.md). O gate autenticado do Goal033 mudou de dia medido, não de tela.
- **Os demais achados abertos.** A-04 a A-08, A-11 a A-17 e A-19 não foram corrigidos, reclassificados nem tocados. Nenhum achado novo a partir de A-24 entrou.
