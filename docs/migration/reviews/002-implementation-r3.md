# Relatório de correção — Goal 002, rodada 3 (R2-03)

**Status: REVIEW_REQUIRED.** Executor: Claude Code / Opus, 2026-09-06. Resposta
ao [correction review da rodada 2](002-review.md#rodada-2), cujo único escopo
aberto era **R2-03**, o harness do teste de rotas da IA. Não é aceite. Sem
commit, push, merge, PR ou deploy. Goal003 não foi gerado nem implementado.

**R2-01 e R2-02 não foram reabertos nem alterados.** `scripts/validate-integration.mjs`,
`scripts/tests/validate-integration.test.mjs`, `.github/workflows/validate.yml`
e `apps/bff/tests/auth-register.integration.test.ts` continuam com os mesmos
fingerprints do [relatório R2](002-implementation-r2.md).

Esta tabela de fingerprints substitui a do relatório R2.

## Causa raiz

`apps/ai-orchestrator/tests/channel/evolution.routes.test.ts` pagava o custo de
carregamento do módulo **dentro do corpo de cada caso**:

```ts
it("rejects invalid webhook tokens", async () => {
  vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "secret");
  vi.resetModules();
  const { registerEvolutionWebhookRoutes } = await import(".../evolutionWebhook.routes.js");
  …
});
```

`vi.resetModules()` invalida o registro de módulos, então o `import()` seguinte
reavalia toda a cadeia de `evolutionWebhook.routes.js` —
`@langchain/langgraph`, client Prisma, `OpenAIEmbeddingProvider`,
`PGVectorKnowledgeStore`, `AssistantService`, `AssistantToolRegistry`,
`SchedulingClient`, `EvolutionProvider`. Isso acontecia três vezes por
execução, mais uma vez por causa do `afterEach` que também resetava, e o relógio
do `testTimeout` padrão (5000ms) corria durante essa reavaliação.

O reset existia por uma razão real: `src/config/env.js` lê `process.env` uma
única vez, quando o módulo é avaliado, e `isValidWebhookToken` consulta
`env.EVOLUTION_WEBHOOK_TOKEN`. O token precisa estar definido **antes** dessa
avaliação. O que estava errado não era a necessidade, e sim o lugar: a
preparação era repetida por caso, em vez de acontecer uma vez.

## Mudança realizada

Diff restrito a esse arquivo de teste (+27 / −32 linhas, por `git diff --numstat`):

- `vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "secret")` roda **uma vez**, no escopo
  do arquivo, antes do import;
- um único `await import(".../evolutionWebhook.routes.js")` no topo do arquivo.
  Como imports estáticos são avaliados antes das instruções de topo, o token já
  está no ambiente quando `config/env.js` é lido. Esse carregamento acontece na
  fase de avaliação do arquivo, que não é governada por `testTimeout`;
- `vi.resetModules()` removido dos casos e do `afterEach`;
- `beforeEach` cria um Fastify novo e registra a rota real; `afterEach` fecha o
  app, agora com fechamento garantido mesmo quando uma asserção falha (antes o
  `close()` ficava no fim do corpo do teste);
- `afterAll` restaura o ambiente com `vi.unstubAllEnvs()`.

O que **não** mudou: nenhum timeout (global ou local), nenhum `retry`, nenhum
`skip`, nenhum sleep, nenhum mock, nenhuma configuração do Vitest, nenhuma
linha de produção, nenhum contrato, nenhuma política de autenticação.

## Por que o comportamento testado continua sendo exercitado

Os três casos continuam batendo em Fastify real, na rota real registrada por
`registerEvolutionWebhookRoutes`, no guard real `isValidWebhookToken` e no
mapper real `mapEvolutionInbound` — as mesmas três requisições e as mesmas
asserções de antes: 401 com token errado, 400 com `ok:false` e
`"Payload did not map to inbound message"`, 404 na rota legada removida. Não há
`vi.mock` nenhum no arquivo.

Além do argumento estrutural, isso foi **falsificado por mutação**: três
alterações temporárias em código de produção, cada uma revertida logo em
seguida (`git status` limpo depois de cada uma).

| Mutação temporária em produção | Efeito no teste |
| --- | --- |
| `isValidWebhookToken` retornando sempre `true` | `× rejects invalid webhook tokens` — 1 failed \| 2 passed |
| `mapEvolutionInbound` retornando sempre um objeto | `× rejects malformed payloads even with a valid webhook token` — 1 failed \| 2 passed |
| Registrar `/api/webhooks/evolution-go` | `× does not expose the removed legacy frontend webhook bridge` — 1 failed \| 2 passed |

Cada mutação derrubou exatamente o caso correspondente e só ele. Se os testes
tivessem virado mocks de conveniência, nenhuma delas teria sido detectada.

Observação de escopo: o custo pesado que o teste carregava nunca chegava a ser
executado. `buildInboundMessageProcessor` — o construtor de LangGraph, Prisma,
embeddings e tools — só é chamado depois de token válido **e** payload mapeado,
o que nenhum dos três casos alcança. O ganho veio de parar de **carregar
repetidamente** esses módulos, não de deixar de exercitá-los: eles continuam
sendo importados, uma vez, pelo módulo de rotas real.

## RED anterior

Com o harness antigo, na mesma máquina:

```text
FAIL tests/channel/evolution.routes.test.ts > Evolution webhook route
     > rejects invalid webhook tokens
Error: Test timed out in 5000ms.
  ❯ tests/channel/evolution.routes.test.ts:11:3

Test Files  1 failed | 5 passed (6)
     Tests  1 failed | 39 passed (40)
  Duration  7.31s (transform 2.58s, import 12.33s, tests 7.43s)
```

Arquivo isolado: **3/3 execuções falharam**. Suíte completa: **5/5 execuções em
39/40**. Reproduzido também com o diff002 revertido (`git stash push` do único
arquivo de IA tocado pelo Goal002), confirmando origem preexistente.

## GREEN posterior

```text
Test Files  1 passed (1)
     Tests  3 passed (3)
  Duration  8.02s (transform 1.40s, import 6.52s, tests 507ms)
```

O tempo **dentro dos casos** caiu de ~6,5s para ~0,5s; o carregamento migrou
para a fase de avaliação do arquivo (`import`), que não tem `testTimeout`. A
duração total do arquivo é praticamente a mesma — o objetivo não era ficar mais
rápido, era parar de cobrar o carregamento do orçamento de tempo do caso.

### Execuções repetidas

| Execução | Resultado |
| --- | --- |
| `npx vitest run tests/channel/evolution.routes.test.ts` ×3, processos novos | **3/3 exit0**, sempre `Tests 3 passed (3)`; `tests` em 507ms / 591ms / 520ms |
| `npm test` (suíte IA completa) ×5, processos novos | **5/5 exit0**, sempre `Tests 40 passed (40)` |

Nenhum teste pulado, nenhum retry, `testTimeout` padrão em todas as execuções.

## Validação canônica

Windows 11 Pro (10.0.26200), Go 1.25.0 windows/amd64, Node 24.18.0, npm 11.16.0,
PostgreSQL 18.4 descartável em `127.0.0.1:55434`.

| Comando | Resultado |
| --- | --- |
| **`npm run validate:core`** | **exit 0 — 12 passed, 0 failed, 5 skipped, 0 not_run** |
| `node --test scripts/tests/**/*.test.mjs` | exit 0 — **28/28** |
| `npm run validate:integration` | exit 0 — 3/3 passed |
| `npm run build:all` | exit 0 |
| `npm run build` em `apps/ai-orchestrator` (tsc sobre `src` + `tests`) | exit 0 |
| `git diff --check` | exit 0 |

`validate:core`, etapa por etapa:

```text
passed   build:contracts            passed   build:evolution-go
passed   build:scheduling-service   passed   vet:evolution-go
passed   build:ai-orchestrator      passed   test:evolution-go
passed   build:bff                  passed   test:gate-scripts
passed   build:frontend             passed   audit:static
passed   check:health-worker
passed   test:ai-orchestrator
skipped  test:bff, test:scheduling-service, test:contracts,
         test:frontend, test:health-worker   (skips já documentados)
```

`validate:integration` contra banco descartável recriado: `generate:bff-prisma-client`,
`migrate:bff-test-database` e `test:bff-integration` passed; resíduo no banco
`User=0 Tenant=0 _prisma_migrations=14`. Cluster efêmero parado e diretório de
dados removido ao final; nenhum arquivo temporário no repositório.

## Arquivos alterados nesta rodada

| Arquivo | Mudança |
| --- | --- |
| `apps/ai-orchestrator/tests/channel/evolution.routes.test.ts` | Única mudança de código: preparação de ambiente e import do módulo uma vez na avaliação do arquivo; app por caso em `beforeEach`/`afterEach`; sem `vi.resetModules()` |
| `docs/migration/VALIDATION_GATE.md` | Limite do `validate:core` vermelho substituído pelo fechamento de R2-03; entrada de troubleshooting para o padrão `resetModules` + import dinâmico dentro do caso |
| `docs/migration/MIGRATION_STATUS.md` | Linha do Goal002 e parágrafo de evidência da rodada 3 |
| `docs/migration/CURRENT_STATE.md` | Delta002: o fato "não corrigido" virou fato corrigido |
| `docs/migration/GAP_ANALYSIS.md` | G-33: timeout retirado da lista de pendências |
| `docs/migration/reviews/002-implementation-r2.md` | Aviso de que seus fingerprints foram superados por este relatório |

Nada mais foi tocado. Os arquivos de R2-01/R2-02, os testes e o producer Go,
`scripts/lib/gate.mjs`, `scripts/validate-core.mjs`, `package.json`,
`scripts/build-all.sh` e `scripts/final-production-audit.mjs` estão idênticos.
Nenhuma dependência, lock, schema, migration, rota, payload público,
configuração do Vitest ou `render.yaml` foi alterado. `MASTER_PLAN.md` e
`002-review.md`, do reviewer, não foram tocados. As alterações preexistentes de
`graphify-out/` seguem intactas.

## Riscos e limitações

- **`vi.stubEnv` no escopo do arquivo** depende de o Vitest isolar cada arquivo
  de teste (`isolate` padrão). Isso é o padrão em uso aqui, e `afterAll`
  restaura o ambiente de qualquer forma. Se alguém desativar o isolamento
  globalmente, este arquivo precisa ser revisto — junto com vários outros que
  usam `stubEnv`.
- **Módulo carregado uma vez por arquivo.** Se um caso futuro precisar de um
  valor de ambiente diferente no momento da avaliação do módulo, ele precisará
  de arquivo próprio, e não de um `resetModules` reintroduzido no corpo do
  teste. Está registrado no troubleshooting do gate.
- **Top-level await** no arquivo de teste exige ESM. O app já é
  `"type": "module"` com `target ES2022`/`module NodeNext`, e o `tsc` do build
  (que compila `tests/**`) passa.
- A margem de tempo do caso ficou larga (~0,5s contra 5s), mas o carregamento
  continua custando ~6-7s na fase de import. Numa máquina bem mais lenta o
  arquivo demora mais, sem estourar `testTimeout`.
- Nada aqui amplia cobertura: continuam sendo os mesmos três comportamentos
  HTTP. Os limites gerais do gate (sem E2E, sem deploy, sem concorrência, um só
  fluxo de integração, CI hospedada não executada) permanecem como registrados.

## Fingerprints SHA-256 válidos (conteúdo normalizado em LF)

| Arquivo | SHA-256 LF |
| --- | --- |
| `apps/ai-orchestrator/tests/channel/evolution.routes.test.ts` | `2dea97c6119e8fc008914023db5250dddcacd554174e5344d5dcc69ffa4457aa` |
| `apps/ai-orchestrator/tests/channel/inbound-message-processor.test.ts` | `bb8fcf40545eadb96b52268d33f7c6ec7471155b6067587938d814eee592cfcb` |
| `apps/bff/tests/auth-register.integration.test.ts` | `adaa53534fc5702dda7430e7819a29bab336fb73eed9264470a66cd7b277d5cd` |
| `apps/evolution-go/pkg/events/webhook/webhook_producer.go` | `b54f94f2d5821658467e59e52ebe58f09d104b6ff241d14650bad5bbf9689fe4` |
| `apps/evolution-go/pkg/events/webhook/webhook_producer_test.go` | `7744d03d090493f95ccc2ab99f31ae9cc804bf0cf4853246f0aa0e5f58bcb989` |
| `apps/evolution-go/pkg/instance/service/instance_service_test.go` | `f5199fb34c322bd7c02199a8f3c62c3bfa998e169dee8d02451b96aa23ed1e64` |
| `package.json` | `6ce3d42daae259a1242be7356e2310baf66769ef499e0b0a3e28c71c2956fa66` |
| `scripts/build-all.sh` | `e66032cd548e02609e0cedab06b453ee6be4c4775271ffa994b09c7e28287453` |
| `scripts/final-production-audit.mjs` | `2df3571a7e742aa0e508762540824c41e965884d5a71cf356f27499bb9649d61` |
| `scripts/lib/gate.mjs` | `e7e6cf2cf5b7c8132c4d2361bbdf23046e7c60c53bcd311394e5607a0d6c91a3` |
| `scripts/validate-core.mjs` | `22ac7f6ae344d09aa51a6fc231223aa2981752312087ea9e4837d797982c8008` |
| `scripts/validate-integration.mjs` | `d28bc59c43993da3ebc6babf5d0544c3830054ec50b1b91d4edcf2acedae1fb2` |
| `scripts/tests/gate.test.mjs` | `18246a177d1efca3c7c546a740170ff2a2218be245f5f606ac562644f3d6f0ed` |
| `scripts/tests/validate-integration.test.mjs` | `cfdb937f62cfb347309019dc9b8c4eb02ed5dfc74127a1abaa75303b0c44e444` |
| `scripts/tests/final-production-audit.test.mjs` | `446d9086e91d49219e8966578f02858d09ce2eaf4dc132002b28612f1897d5e6` |
| `scripts/tests/fixtures/failing-step.mjs` | `42debc4b15535957f0e19c7ba46eec9562d4394efcbbeb103004d15260049c5e` |
| `scripts/tests/fixtures/passing-step.mjs` | `305835ae62ff2cc3b26b61f768008dc5d9c3a16d947ebd26d542bf43b19f9e72` |
| `.github/workflows/validate.yml` | `74863a090386f30eff714e1b1eb81fbacf4b7edc6735c459f61b1c9660bdb616` |
| `docs/migration/VALIDATION_GATE.md` | `e0d11709a04d0e21f8d35e624ed3e3c7251b80defc2094add993a1ee470409ab` |
| `docs/migration/MIGRATION_STATUS.md` | `da3aef7daa154d20629f36e43494f248cf29850a13005a446661752cc5e5146c` |
| `docs/migration/CURRENT_STATE.md` | `f9da49cb40807677c56079b1b97a0857d4cb8b80094477a23866d5157580f357` |
| `docs/migration/GAP_ANALYSIS.md` | `5b9f1f5f4bd25e048d43b833fc313c074efe9927a98db70058bdcd5dea4ee952` |
| `docs/migration/reviews/002-implementation.md` | `629ffbed377a5b0063e941217e39a668ebe03e4d6e805b336fa6318f4cd962a3` |
| `docs/migration/reviews/002-implementation-r2.md` | `6a6c939f1dd059024795b50db20c13a5daa163ff0b1912dbd0c219d7976a5a0f` |

Goal002 volta a **REVIEW_REQUIRED**. Goal003 permanece PLANNED e não
implementado.
