# Review formal — Goal 037

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-21, conforme o [Goal037](../goals/037-o-gate-ve-o-que-o-produto-emite.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–036) foi reaberto, reavaliado ou revertido. Duas rodadas: uma `CHANGES_REQUIRED` (2 blockers) e o aceite na segunda, com zero blockers.

O Goal tinha uma classe de risco nomeada no enunciado — **trocar cegueira por ruído** — e ela não se materializou: a regra estática nova reprova só padrão `/v1` não literal em `apps/frontend/src/data/services/`, o fechamento de texto distingue texto de cliente de erro técnico, chave de log e sumário de handoff, e a retentativa virou declaração sem virar reprovação. Os dois blockers da rodada 1 foram de outra família, e ambos dentro do item 3 do escopo: **um gate que declara mais do que consegue identificar** e **documentação permanente que nomeia o flake errado**.

## Escopo e identidade do diff

- Baseline aceita vigente: `5829cc4db0bcac995678bc6b1092f1e9dbf14c5a` (implementação do Goal036). Base imediata da implementação: `ea0ccc2c7eb9e683e84f1c8c9f5cda2318c80240` (fechamento do Goal036), HEAD da worktree `.ai-worktrees/goal-037`, inalterado nas duas rodadas.
- Snapshot aceito, calculado pelo IA Loop: **15 arquivos**, hash do diff `748b89f00c700b91ff838235a3b866991b3238255c1d815be0d2647db07c7f24`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **ai-orchestrator** 5 arquivos (`src/modules/assistant/assistant.service.ts`, `src/modules/graph/message-graph.ts`, `tests/assistant/assistant.service.test.ts`, `tests/evals/waiting-message-vocabulary.eval.test.ts` e o novo `tests/support/vocabulario-de-espera.ts`); **frontend** 2 arquivos (`src/data/services/BffConversationService.ts`, `e2e/authenticated-matrix.spec.ts`); **scripts e gate** 4 arquivos (`final-production-audit.mjs`, `goal033-authenticated-ui-rehearsal.mjs`, `tests/final-production-audit-legacy-regression.test.mjs`, `tests/goal033-authenticated-ui-rehearsal.test.mjs`); **documentação** 4 arquivos em `docs/migration/`.
- **Nenhum arquivo de `apps/bff/`, `packages/public-api-contract/`, `apps/scheduling-service/`, `apps/evolution-go/` ou `apps/health-worker/` mudou.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota, verbo ou campo novo ou removido, nenhuma tela, componente, texto de interface ou CSS. Os dois `playwright.*.config.ts` seguem com `retries: 1`; `scripts/validate-integration.mjs` inalterado, com os mesmos 35 passos; `RESPONSE_CONTRACT_CHECK_ENABLED` intocado.
- Inspecionado o patch completo de cada rodada contra a worktree, não contra o relatório do Developer. Nenhum arquivo de código foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (2 blockers)

O escopo técnico já estava, na maior parte, entregue e conferido na árvore: as três chamadas literais sem mudança na URL emitida, a regra estática simétrica à do Goal036 provada nos dois sentidos, os seis textos de `message-graph.ts` somados a `PRODUCT_OWN_TEXTS` sem um caractere de copy alterado, `VOCABULARIO_DE_ESPERA` único e o diagnóstico do flake medido em vez de presumido. Os dois blockers:

1. **A declaração de retentativa não identificava o teste que retentou** — que é o propósito do item 3 do Goal. `extractRetriedTests` coletava só `spec.title` e descartava a cadeia de `suites` ancestrais; as 35 medidas de `authenticated-matrix.spec.ts` compartilham o mesmo título (`"measured, logged in"`), um por `test.describe(route.name, ...)`. A saída real produzida pelo próprio Developer provava a ambiguidade: `1 test(s) needed a retry — notebook-1024 › measured, logged in`, sem dizer qual das sete rotas. A fixture de regressão passava sem exercitar o caso real, porque usava título de spec único.
2. **A documentação permanente registrava o diagnóstico contra o flake errado e afirmava algo falso.** FINAL_AUDIT §14, VALIDATION_GATE e D-053 chamavam `/agenda`, `desktop-1440` de "único `flaky` já observado"; o [review036](036-review.md) já registrava um segundo, `[notebook-1024] › servicos`, e é esse que o §4 do Goal e o critério de aceite 13 mandavam diagnosticar. O identificador não aparecia em nenhum documento escrito.

## Rodada 2 — ACCEPTED

Os dois blockers foram conferidos na worktree, não no relatório:

- **O extrator passou a nomear a rota.** `extractRetriedTests` (`scripts/goal033-authenticated-ui-rehearsal.mjs:564`) encadeia as suites ancestrais, excluindo o suite de arquivo, e o teste novo reproduz a colisão real — dois describes distintos, mesmo `spec.title`, ambos `flaky` —, falhando se a cadeia for descartada. A declaração aparece no log do passo e no resultado devolvido (`retries: { count, tests }`).
- **A atribuição do flake foi corrigida nos três documentos.** FINAL_AUDIT §14, VALIDATION_GATE e D-053 deixaram de afirmar unicidade e de atribuir a causa à rota: registram que a atribuição `/agenda`/`desktop-1440` veio de leitura manual do §10 e que cruzar o teto de `@fastify/rate-limit` depende da posição da medida na janela de 60s, não da rota que ela mede.

### Verificações próprias do reviewer

- **As três chamadas literais.** `mutateState` deu lugar a três `routeSchema` com padrão literal, um por ação; verbo, URL emitida (com `encodeURIComponent(id)`), schema de resposta e `signal` idênticos aos da baseline, conferidos no diff.
- **A regra estática nova.** `frontend_v1_route_schema_calls_use_literal_patterns` tem `details` declarando os arquivos lidos, regressão nos dois sentidos em árvore sintética e controle com rota não-`/v1`. `audit:static` exit 0 com a regra nomeada e `public_api_route_coverage` imprimindo uma única rota sem chamador — a de mídia.
- **O conjunto de textos.** Executei o extrator novo contra o `message-graph.ts` real: devolve exatamente os seis textos de cliente, com copy byte a byte igual — o diff só acrescenta `export` —, e `imageHandoffSummary` fica de fora. Nenhum ciclo de import: `message-graph` importa `AssistantService` apenas como tipo. `VOCABULARIO_DE_ESPERA` ficou único em `tests/support/`, importado pelas duas suítes.
- **A espera de rate limit.** `authenticated-matrix.spec.ts` lê `x-ratelimit-remaining`/`x-ratelimit-reset` reais (`apps/bff/src/app.ts:88`, `max: 300`), sem `skip`, sem `fixme`, sem tolerância nova, sem asserção afrouxada e sem remover largura da matriz.
- **Documentação.** Os quatro arquivos de `docs/migration/` só acrescentam linhas (zero deleções); §4 a §13 do FINAL_AUDIT preservadas, a seção nova é §14, e D-053 segue o formato das anteriores.

### Gates da rodada 2

Oito gates `PASSED` nesta mesma árvore: lint dos dois apps tocados, testes dirigidos, `test:gate`, verificação de diff, `validate:core`, `validate:integration` e `validate:ui`. Nada foi apresentado como verde sem ter rodado.

## Observações não bloqueantes

- **`findUncoveredPublicApiRoutes` manteve o `continue`** antes da conferência de entrada na tabela. A justificativa do Developer é razoável — mudar quebraria o contrato "table entry not required", já coberto por teste do Goal035 — e a regra nova fecha a classe concreta pela outra ponta: um chamador `/v1` não literal reprova antes de a cobertura precisar enxergá-lo.
- **A regex da regra nova casa `routeSchema<T>("MÉTODO", ...)`**; uma chamada sem genérico, ou com o padrão guardado em variável, escaparia. A forma hoje usada em `apps/frontend/src/data/services/` é sempre a com genérico.
- **Um `results.json` obsoleto de execução anterior** faria o leitor declarar zero retentativas se o Playwright morresse antes de reescrevê-lo. O passo falha quando o arquivo não existe ou não é legível, mas não confere frescor.
- **`[notebook-1024] › servicos` não é nomeado como caso reproduzido em documento permanente** — o critério 13 pede a causa no relatório, e ela está lá; a documentação registra a causa comum aos dois `flaky` sem afirmar que um extrator retroativo os nomeou.
- **Correção factual feita no fechamento:** CURRENT_STATE (delta037) ainda dizia "a causa real da retentativa de `/agenda`" e "o único `flaky` observado" — a redação que os outros três documentos corrigiram na rodada 2. O bullet passou a nomear os dois `flaky` observados, a origem manual da atribuição do §10 e o fato de que a causa medida depende da posição da medida na janela de 60s, não da rota.

## O que este aceite não cobre

- **`flaky` continua não reprovando o gate.** Execução com retentativa segue terminando com sucesso; o que mudou é que ela deixa de ser indistinguível de uma execução limpa. `retries: 1` inalterado nos dois `playwright.*.config.ts`.
- **O teto de `@fastify/rate-limit` não foi tocado** — `max: 300, timeWindow: "1 minute"` é regra de produto. O gate passou a esperar a janela; o produto não foi facilitado para o gate.
- **O texto que o modelo produz continua fora do conjunto fechado**, pela mesma fronteira de [D-050](../DECISIONS.md). Este diff amplia o conjunto para um segundo módulo emissor; não muda o que ele significa. Um texto de cliente novo, num terceiro módulo com forma de despacho que o extrator não reconhece, reabriria o limite.
- **A verificação de resposta continua sem rodar em produção**, por [D-051](../DECISIONS.md), que este Goal não reabre.
- **M4 — envio real a número real — continua aberto** como gate operacional. Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para WhatsApp real.
- **Fidelidade visual à referência aprovada** continua sendo conferência humana, como nos reviews [033](033-review.md) a [036](036-review.md). O gate autenticado mede o que já media.
- **Os demais achados abertos.** A-04 a A-08, A-11 a A-17 e A-19 não foram corrigidos, reclassificados nem tocados; nenhum achado fechado foi reaberto; nenhum achado novo a partir de A-24 entrou. O veredito de §14 segue **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**.
