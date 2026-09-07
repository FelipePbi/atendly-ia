# Relatório de implementação — Goal 002

**Status: IMPLEMENTED / REVIEW_REQUIRED.** Executor: Claude Code / Opus,
2026-09-05. Não é aceite: a decisão sobre o Goal002 é do Astra. Sem commit,
push, merge, PR ou deploy.

> **Superado em parte.** O [review002](002-review.md) devolveu CHANGES_REQUIRED
> (R2-01 e R2-02). As correções, o novo RED/GREEN e os **fingerprints válidos**
> estão em [002-implementation-r2.md](002-implementation-r2.md). Este documento
> permanece como o relato da primeira rodada; a tabela de fingerprints no fim
> dele descreve o estado anterior às correções e não deve mais ser usada para
> identificar o diff.

## Referência e preservação

- Goal executado: [002](../goals/002-base-de-validacao-reproduzivel.md). Escopo
  restrito a infraestrutura de validação; nenhum comportamento de produto foi
  alterado.
- HEAD de partida: `9a0bb5d`. O texto do Goal002 descrevia a implementação001
  como working tree sem commit; ela já está commitada em `9a0bb5d`, junto da
  documentação de review001. Conferido com `git status`/`git log`: working tree
  limpo no início, exceto as alterações preexistentes de `graphify-out/`.
- **Código001 preservado:** `pkg/instance/handler/instance_authorization.go`,
  `instance_authorization_test.go` e `instance_handler.go` não foram tocados.
  Os 31 nós de autorização continuam passando.
- **Alterações preexistentes preservadas:** `graphify-out/` (GRAPH_REPORT,
  graph.html, graph.json, manifest.json modificados e dois `.graphify_labels`
  não rastreados) já estava assim antes deste trabalho e não foi alterado nem
  revertido.
- Nenhuma dependência de produção adicionada ou atualizada. Nenhum schema,
  migration, rota ou payload público alterado. `render.yaml` intocado.

## Arquivos e motivo

### Correções de defeito de validação

| Arquivo | Mudança | Motivo |
| --- | --- | --- |
| `apps/evolution-go/pkg/instance/service/instance_service_test.go` | Um único `t.TempDir()`, ID da instância em constante e `t.Cleanup` que fecha o logger | O `instance.log` aberto impedia o `RemoveAll` do `TempDir` no Windows. O cleanup é registrado **depois** de `t.TempDir()` e por isso roda antes dele (LIFO). Falha de `Close()` vira `t.Errorf`, não é ignorada |
| `apps/evolution-go/pkg/events/webhook/webhook_producer_test.go` | `t.Cleanup` que espera as goroutines de entrega e depois fecha o logger; helper `waitForDeliveries` | A resposta HTTP chega **antes** do último log do producer. A espera é por sinal (`sync.WaitGroup`) com limite de 10s, sem sleep arbitrário |
| `apps/evolution-go/pkg/events/webhook/webhook_producer.go` | **Seam mínimo:** campo `inflight sync.WaitGroup`, `Add(1)` antes do `go` e `defer Done()` dentro da goroutine | Única forma determinística de o teste saber que a entrega assíncrona terminou. Não altera política de retry/entrega, não muda nenhum caminho de execução e nada em produção espera nesse WaitGroup. `LoggerManager` não foi redesenhado |
| `apps/ai-orchestrator/tests/channel/inbound-message-processor.test.ts` | `requestId: "request-1"` na expectativa de `sendText` | O processor propaga o `requestId` da mensagem; a expectativa estava desatualizada. Destinatário, texto, quote e `correlationId` foram preservados; o runtime não foi afrouxado |
| `apps/bff/tests/auth-register.integration.test.ts` | Rota `/v1/auth/register`; guarda de banco de teste; verificação de `aiSettings`; confirmação de limpeza | A rota antiga retornava 404. A guarda impede que a suíte grave no banco de desenvolvimento |
| `scripts/final-production-audit.mjs` | `summarize()` separa `skipped`; cabeçalho declara o que o script é | Um health pulado era somado a `passed` (15/15). Agora: 14 passed, 0 failed, 1 skipped, com `skippedChecks` nomeado |

### Gate de validação

| Arquivo | Papel |
| --- | --- |
| `scripts/lib/gate.mjs` | Runner: executa subprocessos, converte qualquer erro em `failed`, interrompe na primeira falha (restante vira `not_run`) e imprime resumo com as quatro contagens |
| `scripts/validate-core.mjs` | Etapas do core, com Scheduling no build e contracts antes dos consumidores; packages sem suíte declarados como `skipped` |
| `scripts/validate-integration.mjs` | Resolve e valida `BFF_TEST_DATABASE_URL`, injeta `DATABASE_URL`/`DIRECT_DATABASE_URL` e segredos sintéticos, aplica migrations e roda a suíte do BFF |
| `scripts/tests/*.test.mjs`, `scripts/tests/fixtures/*` | Testes do próprio gate com `node:test`, incluindo subprocesso sintético que falha |
| `scripts/build-all.sh` | Passou a compilar o Scheduling Service, depois de contracts |
| `package.json` | `validate:core`, `validate:integration`, `test:gate`, `test:ai-orchestrator`, `build:scheduling-service`. Comandos antigos preservados |
| `.github/workflows/validate.yml` | CI mínima com os mesmos comandos |
| `docs/migration/VALIDATION_GATE.md` | Pré-requisitos, comandos, separação, leitura de resultados e troubleshooting |

## RED / GREEN

Todos os RED foram reproduzidos antes da correção, na mesma máquina.

| Defeito | RED observado | GREEN observado |
| --- | --- | --- |
| Fixture Go — instance service | `--- FAIL: TestConnectPreservesExistingConfigurationOnEmptyPayload (1.52s)` / `TempDir RemoveAll cleanup: unlinkat ...\instance.log: The process cannot access the file because it is being used by another process` | `ok .../pkg/instance/service`, inclusive com `-count=5` |
| Fixture Go — webhook producer | `--- FAIL: TestProduceSendsOnlyToInstanceWebhookURL (1.77s)` com o mesmo erro de cleanup | `ok .../pkg/events/webhook`, inclusive com `-count=5` |
| Teste IA | `AssertionError: expected "vi.fn()" to be called with arguments`, diff mostrando `+ "requestId": "request-1"`; suíte 39 passed / 1 failed | 6 arquivos, 40/40 passed |
| Integração BFF | `Route POST:/auth/register not found`; `expected 404 to be 201` | 1/1 passed em `POST /v1/auth/register` |
| Auditoria estática | Resumo `{"total":15,"passed":15,"failed":0}` com `production_health` marcado `skipped:true` | `{"total":15,"passed":14,"failed":0,"skipped":1,"skippedChecks":["production_health"]}` |
| Gate | Não existia | 15/15 testes de `node:test`, incluindo propagação de exit code 3 e recusa do runner de integração |

## Comandos, plataformas e resultados

Plataforma do executor: Windows 11 Pro (10.0.26200). Go 1.25.0 windows/amd64;
Node 24.18.0; npm 11.16.0; PostgreSQL 18.4 (cluster descartável local).

```text
npm run validate:core            -> exit 0
npm run validate:integration     -> exit 0   (com BFF_TEST_DATABASE_URL)
git diff --check                 -> exit 0
```

`validate:core` — 17 etapas declaradas: **12 passed, 0 failed, 5 skipped, 0 not_run**.

```text
passed  build:contracts  build:scheduling-service  build:ai-orchestrator
passed  build:bff  build:frontend  check:health-worker
passed  test:ai-orchestrator  build:evolution-go  vet:evolution-go
passed  test:evolution-go  test:gate-scripts  audit:static
skipped test:bff (só integração; roda em validate:integration)
skipped test:scheduling-service, test:contracts, test:frontend, test:health-worker
        (packages sem suíte automatizada)
```

`validate:integration` — 2 etapas: **2 passed**, alvo
`127.0.0.1:55432/atendly_bff_test`.

Go em `apps/evolution-go`:

```text
go build ./...                                               -> exit 0
go vet ./...                                                 -> exit 0
go test -count=1 ./...                                       -> 7 pacotes ok, 0 FAIL
go test -count=5 ./pkg/instance/service ./pkg/events/webhook -> ok, ok
go test -count=1 -json ./pkg/instance/handler                -> 31 nós pass, 0 fail
```

Formatação: `gofmt -l` lista `webhook_producer_test.go`,
`instance_authorization.go`, `instance_authorization_test.go` e
`instance_handler.go`. Rodando `gofmt -l` sobre cópias com finais de linha
normalizados para LF, a saída é vazia: a diferença é **apenas de EOL**, efeito
de `core.autocrlf=true` neste checkout. Nenhum arquivo foi reformatado, e os
três arquivos do Goal001 seguem intocados.

Nenhuma etapa foi pulada de forma impeditiva e nenhuma falha foi mascarada.

## Banco de teste isolado — provisionamento, migrations e limpeza

Cluster PostgreSQL efêmero, criado só para esta validação, em loopback e porta
não padrão, com autenticação `trust` (nenhuma credencial real envolvida):

```text
initdb  -D <tmp>/pgtest/data -U pgtest -A trust -E UTF8 --locale=C
pg_ctl  -D <tmp>/pgtest/data -l <tmp>/pgtest/server.log \
        -o "-p 55432 -c listen_addresses=127.0.0.1" start
psql    -h 127.0.0.1 -p 55432 -U pgtest -d postgres -c "CREATE DATABASE atendly_bff_test;"
```

Migrations aplicadas **somente** nesse banco, pelo próprio runner
(`prisma migrate deploy` em `apps/bff`): `14 migrations found` →
`All migrations have been successfully applied`. A execução foi repetida a
partir de `DROP DATABASE` + `CREATE DATABASE` para provar reprodutibilidade do
zero; nos dois casos exit 0.

Prova de escrita no banco certo: a suíte roda `SELECT current_database()` e
aborta se o valor não for o banco nomeado em `BFF_TEST_DATABASE_URL`.

Limpeza — contagens no banco de teste depois do gate:

```text
User=0  Tenant=0  TenantMember=0  BusinessProfile=0  AiSettings=0
LegalAcceptance=0  _prisma_migrations=14
```

Descarte do cluster: `pg_ctl ... stop -m immediate` e remoção do diretório de
dados. Nenhum banco compartilhado, de desenvolvimento ou de produto foi tocado
em nenhum momento. Nenhum segredo, credencial real ou dado pessoal aparece
neste relatório, nos scripts ou no workflow.

### Recusa antecipada do runner (verificada)

```text
sem BFF_TEST_DATABASE_URL          -> exit 2, "REFUSED ... will not fall back"
BFF_TEST_DATABASE_URL=""           -> exit 2
banco "atendly_bff" (sem "test")   -> exit 2, "not recognised as disposable"
host não loopback                  -> exit 2, "not loopback"
protocolo não postgres             -> exit 2
```

Em todos os casos nenhuma etapa chegou a executar — verificado por teste que
inspeciona a saída do processo.

## Estado da CI

- **Configuração versionada:** `.github/workflows/validate.yml`, três jobs
  (`core` ubuntu, `go-windows` windows, `integration` ubuntu com PostgreSQL
  descartável em service container). O job Windows inclui `-count=5` nos dois
  pacotes de cleanup, exatamente a classe de falha corrigida.
- **Validação feita localmente:** o YAML foi parseado (js-yaml) sem erro, e
  todos os comandos que os jobs executam foram rodados nesta máquina. A
  propagação do exit code 2 do passo de recusa foi verificada via `npm run`.
- **Execução hospedada: NÃO REALIZADA.** Não há execução de GitHub Actions
  registrada para este workflow. `npm ci` em cada package também não foi
  exercitado em runner limpo. Registrado como pendência em
  [MIGRATION_STATUS](../MIGRATION_STATUS.md), não como aprovação.
- Sem deploy, sem banco compartilhado, sem plataforma de CI nova e sem serviço
  pago. As credenciais do service container são sintéticas.

## Novos problemas fora do escopo (não implementados)

1. **`apps/bff/prisma.config.ts` tem URL de fallback embutida**
   (`postgresql://user:password@localhost:5432/atendly_bff`). Sem
   `DATABASE_URL`/`DIRECT_DATABASE_URL`, comandos Prisma apontam silenciosamente
   para um banco default em vez de falhar. O gate de integração contorna isso
   injetando as variáveis, mas o fallback continua no repositório. Sugestão para
   um Goal de infraestrutura; não corrigido aqui.
2. **`webhookProducer.Produce` retorna `nil` mesmo quando a entrega falha nas
   cinco tentativas**, e a goroutine pode sobreviver ao processo. É semântica de
   entrega/durabilidade — pertence ao Goal004 (outbox/ACK), não a este Goal.
   Nenhuma mudança de política foi feita.
3. **Cobertura real é estreita:** só IA e Evolution Go têm suítes; BFF tem um
   único teste de integração; Scheduling, contracts e frontend não têm nenhuma.
   O gate reporta isso como `skipped`, sem disfarçar. Ampliar cobertura por
   risco é trabalho dos Goals de domínio.
4. **G-35 continua aberto** e não foi tocado: pertence ao Goal003, que deve ser
   fechado antes de ampliar persistência no Goal004.

## Limites — o que este trabalho NÃO prova

- Não prova deploy, restore, disponibilidade, custo, entrega WhatsApp real nem
  comportamento visual.
- Não prova rollback transacional: nenhum caso exercita falha **dentro** da
  transação de cadastro. O que foi verificado é que o caminho feliz grava
  usuário, tenant, membership, perfil de negócio, `aiSettings` e aceite legal.
- Não prova isolamento entre tenants, concorrência nem cobertura de domínio.
- A auditoria estática continua sendo regex sobre arquivos; não é E2E e não
  verifica isolamento em runtime.
- `validate:core` verde não diz nada sobre persistência: só
  `validate:integration` toca banco.

## Fingerprints SHA-256 (conteúdo normalizado em LF)

| Arquivo | SHA-256 LF |
| --- | --- |
| `apps/ai-orchestrator/tests/channel/inbound-message-processor.test.ts` | `bb8fcf40545eadb96b52268d33f7c6ec7471155b6067587938d814eee592cfcb` |
| `apps/bff/tests/auth-register.integration.test.ts` | `e56a2e8f9f7ba34448713a05d451bdc955caf5d104d1e8058783746260feeb35` |
| `apps/evolution-go/pkg/events/webhook/webhook_producer.go` | `b54f94f2d5821658467e59e52ebe58f09d104b6ff241d14650bad5bbf9689fe4` |
| `apps/evolution-go/pkg/events/webhook/webhook_producer_test.go` | `7744d03d090493f95ccc2ab99f31ae9cc804bf0cf4853246f0aa0e5f58bcb989` |
| `apps/evolution-go/pkg/instance/service/instance_service_test.go` | `f5199fb34c322bd7c02199a8f3c62c3bfa998e169dee8d02451b96aa23ed1e64` |
| `package.json` | `6ce3d42daae259a1242be7356e2310baf66769ef499e0b0a3e28c71c2956fa66` |
| `scripts/build-all.sh` | `e66032cd548e02609e0cedab06b453ee6be4c4775271ffa994b09c7e28287453` |
| `scripts/final-production-audit.mjs` | `2df3571a7e742aa0e508762540824c41e965884d5a71cf356f27499bb9649d61` |
| `scripts/lib/gate.mjs` | `e7e6cf2cf5b7c8132c4d2361bbdf23046e7c60c53bcd311394e5607a0d6c91a3` |
| `scripts/validate-core.mjs` | `22ac7f6ae344d09aa51a6fc231223aa2981752312087ea9e4837d797982c8008` |
| `scripts/validate-integration.mjs` | `3b117681b8890ae95e9df1fb1c83d6191e198449bd758a7e46506f1dc90d715a` |
| `scripts/tests/gate.test.mjs` | `18246a177d1efca3c7c546a740170ff2a2218be245f5f606ac562644f3d6f0ed` |
| `scripts/tests/validate-integration.test.mjs` | `47008308cc6d5019af06cedddd12d84c180aee6a9a75f7f58e54b49360a4f9f0` |
| `scripts/tests/final-production-audit.test.mjs` | `446d9086e91d49219e8966578f02858d09ce2eaf4dc132002b28612f1897d5e6` |
| `scripts/tests/fixtures/failing-step.mjs` | `42debc4b15535957f0e19c7ba46eec9562d4394efcbbeb103004d15260049c5e` |
| `scripts/tests/fixtures/passing-step.mjs` | `305835ae62ff2cc3b26b61f768008dc5d9c3a16d947ebd26d542bf43b19f9e72` |
| `.github/workflows/validate.yml` | `ae953da1e06c936f6e41247d0700c37508fe63182f02b248b60115bad35c6557` |
| `docs/migration/VALIDATION_GATE.md` | `ec3f2da55d290e795214001e20bcc279aeb620a7a71bef2217e90ef792f5ca75` |
| `docs/migration/MIGRATION_STATUS.md` | `f667935f064a060021fa5c0d4206fbb6c5d89569b8a41d8ede707dcb2f603824` |
| `docs/migration/CURRENT_STATE.md` | `b43712f2bd0d370f3956147fc23e92d0bc65a96ca03832cd58b5cdd6574132a2` |
| `docs/migration/GAP_ANALYSIS.md` | `684598d89a9e1c6ea62eacf3d572b842a1414f81650e91665bb393e254365189` |

Goal003 e posteriores permanecem não implementados.
