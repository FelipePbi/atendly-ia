# Relatório de correção — Goal 002, rodada 2

**Status: REVIEW_REQUIRED.** Executor: Claude Code / Opus, 2026-09-06. Resposta
ao [review002](002-review.md) (CHANGES_REQUIRED, R2-01 e R2-02). Não é aceite.
Sem commit, push, merge, PR ou deploy. Goal003 não foi implementado.

Este documento substitui a tabela de fingerprints do
[relatório inicial](002-implementation.md); o resto daquele relato continua
válido para a primeira rodada.

> **Superado em parte.** A [rodada 2 do review](002-review.md#rodada-2) fechou
> R2-01 e R2-02 e abriu R2-03 (harness da IA), corrigido em
> [002-implementation-r3.md](002-implementation-r3.md). Os **fingerprints
> válidos** e o resultado atual de `validate:core` estão no relatório R3; a
> tabela no fim deste documento descreve o estado anterior a ele.

## R2-01 — P1: a URL validada podia não ser o destino da conexão

### Causa raiz

`resolveIntegrationTarget` validava apenas `new URL(raw).hostname`, `.port` e o
nome do banco no path, e devolvia a URL crua (`url: raw`) para o subprocesso. O
consumer real do BFF é `PrismaPg` sobre `pg`, cujo parser
(`pg-connection-string`) **deixa a query string sobrescrever a autoridade**.
Nenhuma das duas camadas do gate olhava para a query, então o alvo anunciado e o
alvo efetivo podiam divergir. `SELECT current_database()` não detectava o
desvio, porque o nome do banco continuava igual — só o servidor mudava.

### Reprodução antes da correção (RED)

Sem rede, sem conexão, só valores sintéticos. Guard da implementação anterior
contra o parser do driver:

```text
query                        guard aceitava              driver resolvia
host=outside.invalid&port=6432  127.0.0.1:55439/..._test   outside.invalid:6432/..._test
host=outside.invalid            127.0.0.1:55439/..._test   outside.invalid:55439/..._test
port=6432                       127.0.0.1:55439/..._test   127.0.0.1:6432/..._test
hostaddr=203.0.113.7            127.0.0.1:55439/..._test   127.0.0.1:55439/..._test
```

As três primeiras linhas são o bypass exato reportado pelo Astra: destino
anunciado loopback, destino real em outro servidor/porta. `hostaddr` não é
honrado por este parser, mas é honrado por libpq e por isso também passou a ser
recusado.

### Proteção depois (GREEN)

Duas camadas, ambas em processo e **antes de qualquer subprocesso ou conexão**,
em `scripts/validate-integration.mjs`:

1. **Allowlist de query parameters.** Só passam `application_name`,
   `connect_timeout`, `connection_limit`, `pool_timeout`, `schema` e `sslmode`.
   Qualquer outro nome é recusado explicitamente — `host`, `hostaddr`, `port`,
   `dbname`, `service`, `servicefile`, `passfile` e `options` incluídos.
2. **Conferência do destino efetivo** (`assertDriverResolvesSameDestination`).
   A URL é reparseada com o parser do próprio driver do BFF
   (`pg-connection-string`, resolvido via `createRequire` a partir de
   `apps/bff/package.json`, para ser a mesma versão do runtime) e o
   host/porta/banco resultantes precisam ser loopback e idênticos aos
   validados.

Sem as dependências do BFF instaladas o gate **recusa** em vez de seguir sem
verificar:

```text
validate:integration REFUSED — Cannot verify the effective PostgreSQL
destination: the BFF dependencies are not installed. Run
`npm ci --prefix apps/bff` before validate:integration.
```

Verificado movendo `pg-connection-string` para fora de `node_modules` numa cópia
descartável. Todas as recusas continuam saindo com **exit 2**, antes de
executar qualquer etapa.

A suíte também ficou mais estrita em runtime: além de `current_database()`, ela
confere `inet_server_port()` e `host(inet_server_addr())`, de modo que dois
servidores diferentes com o mesmo nome de banco não passam despercebidos.

O fallback embutido em `apps/bff/prisma.config.ts` continua sem participar: o
runner define `DATABASE_URL` e `DIRECT_DATABASE_URL` em todas as etapas, e há
teste garantindo isso.

### Testes negativos adicionados

Em `scripts/tests/validate-integration.test.mjs`:

- nove casos de query que redirecionam o driver (`host`, `host`+`port`, `port`,
  `hostaddr`, `dbname`, `service`, `servicefile`, `passfile`, `options`), cada
  um exigindo recusa;
- `the reported bypass really moves the driver, and is now refused` — confirma,
  via `driverDestination`, que `?host=outside.invalid&port=6432` de fato move o
  driver para `outside.invalid:6432`, e que o resolver agora recusa. É a
  regressão do bypass do review, sem rede;
- `the effective destination is compared against the validated one` — prova a
  segunda camada isoladamente;
- `keeps accepting harmless connection options` — `sslmode`, `schema`,
  `connect_timeout`, `application_name`, `connection_limit` e `pool_timeout`
  continuam aceitos, para não quebrar uso legítimo.

## R2-02 — P2: client Prisma ausente em checkout limpo

### Causa raiz

`validate:integration` executava apenas `prisma migrate deploy` e `vitest run`.
O generator do schema escreve em `apps/bff/src/generated/prisma`, que é código
gerado e não versionado. `npm ci` não o produz, e o job `core` tem filesystem
próprio, então nada o fornecia ao job `integration`. Localmente o erro ficava
mascarado porque um `npm run build` anterior já havia gerado o client.

### Reprodução antes da correção (RED)

Cópia isolada contendo só arquivos versionados de `apps/bff`,
`packages/legal-contract`, `package.json` e `scripts/`, mais os arquivos atuais
do gate — sem `node_modules`, `.env`, `dist` ou código gerado (73 arquivos):

```text
npm ci --prefix apps/bff                      -> exit 0; src/generated ausente
npx prisma migrate deploy                     -> exit 0; 14 migrations aplicadas
npx vitest run                                -> exit 1
  Error: Cannot find module '../generated/prisma/client.js'
          imported from <copia>/apps/bff/src/lib/prisma.ts
  Test Files 1 failed (1) | Tests no tests
```

### Proteção depois (GREEN)

`integrationSteps` passou a ter três etapas, nesta ordem:
`generate:bff-prisma-client` → `migrate:bff-test-database` →
`test:bff-integration`, todas com o mesmo ambiente e a mesma propagação de
falha do runner.

Na mesma cópia limpa, com o banco recriado do zero e `src/generated` removido:

```text
=== validate:integration summary ===
passed   generate:bff-prisma-client — exit code 0
passed   migrate:bff-test-database — exit code 0
passed   test:bff-integration — exit code 0
validate:integration PASSED against 127.0.0.1:55433/atendly_bff_clean_test
```

Resíduo no banco da cópia limpa: `User=0 Tenant=0 TenantMember=0
BusinessProfile=0 AiSettings=0 LegalAcceptance=0 _prisma_migrations=14`.

No workflow, o job `integration` ficou explícito: `npm ci --prefix apps/bff`,
um passo que **falha** se `apps/bff/src/generated/prisma` vier do checkout, e
então `npm run validate:integration` — que faz toda a preparação restante. O
job `core` não precisa de etapa nova: o `npm run build` de cada app já roda
`prisma generate` antes das suítes, e a ordem em `coreSteps` garante isso.
Comandos locais e workflow usam exatamente a mesma preparação.

Testes adicionados: `generates the Prisma client before migrating or testing`
(ordem e comando) e a asserção de ambiente idêntico em todas as etapas.

## Timeout da IA — investigação, sem correção

**Conclusão: falha preexistente, não causada pelo Goal002. Não corrigida;
decisão do Astra.**

- Teste: `apps/ai-orchestrator/tests/channel/evolution.routes.test.ts >
  rejects invalid webhook tokens`. Erro: `Test timed out in 5000ms`.
- **Reexecução isolada do arquivo:** 3/3 execuções falharam.
- **Reexecução da suíte completa:** 5/5 execuções em `1 failed | 39 passed (40)`.
  Não é flake aleatório na máquina atual — é determinístico agora, embora tenha
  passado 40/40 em 2026-09-05. A margem é estreita e depende da velocidade da
  máquina, o que explica o comportamento diferente entre execuções e entre
  executor e reviewer.
- **Comparação com a baseline:** com o único arquivo de IA tocado pelo Goal002
  (`inbound-message-processor.test.ts`) revertido via `git stash push`, o mesmo
  teste falhou com o mesmo erro. O arquivo de rotas não foi alterado pelo
  Goal002 e não importa nada do diff.
- **Causa demonstrada:** o teste chama `vi.resetModules()` e faz
  `import()` dinâmico de `evolutionWebhook.routes.js`, que puxa
  `@langchain/langgraph`, o client Prisma gerado, `OpenAIEmbeddingProvider`,
  `PGVectorKnowledgeStore`, `AssistantService` e o registro de tools. O custo de
  transform + import acontece **dentro** do corpo do teste e estoura o
  `testTimeout` padrão de 5000ms. Medição diagnóstica, sem alterar o
  repositório: `npx vitest run tests/channel/evolution.routes.test.ts
  --testTimeout=60000` → **3 passed**, `tests 6.48s` para três testes.
- **Nada foi alterado:** nenhum timeout aumentado, nenhum teste pulado, marcado
  como flaky ou removido, nenhuma mudança de comportamento funcional. O
  diagnóstico fica registrado para o Astra decidir se o ajuste (elevar o
  `testTimeout` desse arquivo, ou mover o import para fora do corpo do teste)
  entra no Goal002 ou vira item próprio.

**Consequência honesta:** enquanto isso não for resolvido, `npm run
validate:core` termina em **exit 1** nesta máquina e o gate **não** pode ser
declarado verde.

## Arquivos alterados nesta rodada

| Arquivo | Mudança |
| --- | --- |
| `scripts/validate-integration.mjs` | Allowlist de query parameters; `driverDestination` e `assertDriverResolvesSameDestination` exportados; etapa `generate:bff-prisma-client` |
| `scripts/tests/validate-integration.test.mjs` | 13 testes novos: bypass de query, comparação de destino efetivo, opções benignas, ordem da geração do client |
| `apps/bff/tests/auth-register.integration.test.ts` | Guarda de runtime também confere `inet_server_port()` e `host(inet_server_addr())` |
| `.github/workflows/validate.yml` | Job `integration` com preparação explícita e verificação de que o client Prisma não vem do checkout; comentários sobre checkout limpo no job `core` |
| `docs/migration/VALIDATION_GATE.md` | Seção do destino real, pré-requisito `npm ci --prefix apps/bff`, três etapas da integração, troubleshooting novo e o limite do `validate:core` vermelho |
| `docs/migration/MIGRATION_STATUS.md` | Linha do Goal002 e parágrafo de evidência da rodada 2 |
| `docs/migration/CURRENT_STATE.md` | Delta002 corrigido: a suíte de IA não está verde |
| `docs/migration/GAP_ANALYSIS.md` | G-33: "IA verde" corrigido; timeout listado no restante |
| `docs/migration/reviews/002-implementation.md` | Aviso de que os fingerprints daquele documento foram superados |

Nada mais foi tocado. `scripts/lib/gate.mjs`, `scripts/validate-core.mjs`, os
testes Go, o producer de webhook, `package.json`, `scripts/build-all.sh` e
`scripts/final-production-audit.mjs` continuam idênticos à rodada 1. Nenhuma
dependência, lock, schema, migration, rota, payload público ou `render.yaml` foi
alterado. `MASTER_PLAN.md` e `002-review.md`, escritos pelo reviewer, não foram
tocados. As alterações preexistentes de `graphify-out/` seguem intactas.

## Comandos e resultados

Windows 11 Pro (10.0.26200), Go 1.25.0 windows/amd64, Node 24.18.0, npm 11.16.0,
PostgreSQL 18.4 descartável em `127.0.0.1:55433`.

| Comando | Resultado |
| --- | --- |
| `node --test scripts/tests/**/*.test.mjs` | **exit 0 — 28/28** (era 15/15) |
| `npm run validate:core` | **exit 1** — 6 passed, **1 failed** (`test:ai-orchestrator`), 10 not_run |
| Etapas restantes do core, via `runGate(coreSteps.slice(7))`, sem alterar scripts | **exit 0** — Go build/vet/test, testes do gate e auditoria estática passed; 5 skipped declarados |
| `npm run validate:integration` | **exit 0** — 3/3 passed contra `127.0.0.1:55433/atendly_bff_test` |
| `validate:integration` em cópia limpa (só `npm ci`) | **exit 0** — 3/3 passed; sequência antiga falhava |
| `npm run build:all` | **exit 0**, incluindo Scheduling |
| `npm test` em `apps/ai-orchestrator` | **exit 1 — 39/40**, 5 execuções, sempre o mesmo timeout |
| `go build ./...`, `go vet ./...` | **exit 0** |
| `go test -count=1 ./...` | **exit 0**, 7 pacotes `ok` |
| `go test -count=5 ./pkg/instance/service ./pkg/events/webhook` | **exit 0**, ambos `ok` |
| `git diff --check` | **exit 0** |
| Parsing do workflow (js-yaml) | OK, três jobs |

Recusas do runner reverificadas: sem `BFF_TEST_DATABASE_URL`, com string vazia,
com banco sem `test` no nome, host não-loopback, protocolo não-postgres, query
que redireciona e dependências do BFF ausentes — todas **exit 2**, sem executar
etapa alguma.

Execução hospedada de CI **continua não realizada**. O workflow foi validado por
parsing e pelos mesmos comandos rodados localmente, incluindo a sequência de
checkout limpo do job de integração.

## Resíduos locais

- Cluster PostgreSQL efêmero desta rodada (`127.0.0.1:55433`) parado e diretório
  de dados removido; cópia limpa de reprodução removida. Ambos ficaram sempre
  fora do repositório, em diretório temporário da sessão.
- O diretório de review do Astra em `%TEMP%` estava com o cluster já parado
  (sem `postmaster.pid`, porta 55439 fechada) e foi removido, conforme
  autorização explícita. As conclusões do review não dependiam desses logs.
- `git status` não lista nenhum arquivo temporário; o diff continua restrito ao
  escopo do Goal002.

## Fingerprints SHA-256 válidos (conteúdo normalizado em LF)

Esta tabela substitui a do relatório inicial. O próprio
`002-implementation-r2.md` não se autoinclui.

| Arquivo | SHA-256 LF |
| --- | --- |
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
| `docs/migration/VALIDATION_GATE.md` | `c49dedcb60cc7eddcff415a078736e45ae17cdb90a35da61df6f400a2f65174b` |
| `docs/migration/MIGRATION_STATUS.md` | `f371077278f7d0655493dfe7eaeb867c169fba604b9c700b489eb8a6f98eea98` |
| `docs/migration/CURRENT_STATE.md` | `8d06e145e288855d9e4d93983c8672618978c08910e1d4afd8930865f2236cbe` |
| `docs/migration/GAP_ANALYSIS.md` | `046110e97126aed3e38b4267f153b2f5d9acc517e9fc01e5e2a84e16551383d3` |
| `docs/migration/reviews/002-implementation.md` | `629ffbed377a5b0063e941217e39a668ebe03e4d6e805b336fa6318f4cd962a3` |

Goal002 volta a **REVIEW_REQUIRED**. Goal003 permanece PLANNED e não
implementado.
