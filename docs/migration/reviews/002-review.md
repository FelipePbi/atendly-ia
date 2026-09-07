# Review formal — Goal 002

**Decisão vigente — rodada 3: ACCEPTED.** R2-03 fechado; R2-01 e R2-02 permanecem CLOSED. Aceite técnico já concluído, formalizado nesta reconciliação administrativa em 2026-09-07. Ver [rodada 3](#rodada-3).

Os registros das rodadas 1 e 2 são históricos; todas as correções solicitadas foram atendidas e não constituem pendências vigentes.

**Modo: STANDARD, mantido.** Goal0 é a baseline arquitetural aceita. O diff não muda arquitetura, ownership de produto, contratos públicos, schemas ou migrations. Os defeitos abaixo pertencem ao próprio gate de validação e foram verificados de forma dirigida; não exigem discovery global, DEEP/ARCHITECTURE ou reauditoria de domínios inalterados. Nenhum subagente foi usado.

## Escopo e identidade do diff

- [Goal002](../goals/002-base-de-validacao-reproduzivel.md), [implementation report](002-implementation.md), diff rastreado contra `9a0bb5da5770c486e8d146b11ea7cc8161a8907b` e arquivos novos de scripts, testes, workflow e documentação. A implementação002 permanece no working tree.
- Os **21 fingerprints SHA-256 normalizados em LF** do implementation report coincidiram com os arquivos no início do review. Os **quatro fingerprints do review001** também coincidiram; autorização001 preservada. A implementação001 já está no HEAD, conforme correção factual do executor.
- Consumers inspecionados: ciclo de entrega/logger do webhook; `MessageGraphWorkflow.sendResponse`; cadastro, conexão/desconexão Prisma e fixture BFF; manifests, configuração Prisma, driver PostgreSQL instalado e comandos dos jobs de CI.
- Consultadas somente as decisões pertinentes D-003/D-011/D-016 e a seção de testes/operação da arquitetura alvo. Graphify foi usado apenas nas consultas `webhook producer` e `prisma disconnect`, com budget800; os pontos materiais foram confirmados no código. O grafo não foi reconstruído ou atualizado.
- Alterações preexistentes de `graphify-out/` e a política incremental de review em MASTER_PLAN foram preservadas. Nenhum código funcional, dependência, lock, Product Vault ou referência visual foi alterado pelo reviewer.

## Correções necessárias

### R2-01 — P1: a URL validada não representa necessariamente o destino da conexão

Local: `scripts/validate-integration.mjs:65–79`, especialmente o retorno de `url: raw` na linha74 e seu repasse às variáveis do subprocesso.

O guard valida `new URL(raw).hostname` e `.port`, mas aceita query parameters irrestritos. O consumer real do BFF, `PrismaPg` em `apps/bff/src/lib/prisma.ts`, usa `pg`: seu parser permite que `host` e `port` na query substituam o destino da autoridade da URL. O runner pode anunciar um banco local enquanto o BFF conecta em outro host/porta.

Reprodução sem abrir conexão e somente com valores sintéticos:

```js
import { resolveIntegrationTarget } from "./scripts/validate-integration.mjs";
import pg from "./apps/bff/node_modules/pg/lib/index.js";

const raw = "postgresql://synthetic:synthetic@127.0.0.1:55439/atendly_bff_test?host=outside.invalid&port=6432";
const target = resolveIntegrationTarget({ BFF_TEST_DATABASE_URL: raw });
const actual = new pg.Client({ connectionString: raw }).connectionParameters;
console.log(target.label, actual.host, actual.port, actual.database);
```

Resultado observado: guard aceita `127.0.0.1:55439/atendly_bff_test`; driver resolve `outside.invalid:6432/atendly_bff_test`. `SELECT current_database()` não detecta um servidor diferente com o mesmo nome de banco. Nenhuma conexão com `outside.invalid` ou produção foi tentada. O comportamento do parser do BFF foi comprovado; não se atribui ao engine de migrations um comportamento que não foi exercitado com essa URL.

**Para fechar:** validar o destino efetivo de todos os consumers antes de qualquer subprocesso, ou recusar parâmetros capazes de substituir o alvo. Uma allowlist pequena de parâmetros permitidos é suficiente se compatível com as ferramentas usadas. Acrescentar testes negativos de host/porta na query e provar recusa antecipada sem chamada de rede; preservar a execução positiva contra o PostgreSQL descartável. Isto corrige uma garantia explícita do Goal002, não o domínio de segurança do Goal003.

### R2-02 — P2: o job de integração não gera o client Prisma em checkout limpo

Local: `.github/workflows/validate.yml:97–100` e `scripts/validate-integration.mjs:101–117`.

O job instala o BFF e chama `validate:integration`, que só executa `prisma migrate deploy` e `vitest run`. O schema usa o generator `prisma-client` com saída em `src/generated/prisma`, ignorada pelo Git. `npm ci` não gera essa saída; o job `core` tem filesystem independente e não a fornece ao job `integration`.

Foi criada uma cópia isolada dos arquivos versionados do BFF e legal-contract, dos arquivos atuais do gate e do teste alterado, sem `.env`, `node_modules`, `dist` ou código gerado. Com o lock existente, `npm ci --prefix apps/bff` passou. O comando canônico seguinte aplicou as 14 migrations ao banco novo, mas falhou na importação:

```text
Error: Cannot find module '../generated/prisma/client.js'
Test Files  1 failed (1)
Tests       no tests
validate:integration: 1 passed, 1 failed; exit 1
```

**Para fechar:** incluir geração explícita do client na preparação canônica de integração, com propagação de falha e o mesmo ambiente de teste; alinhar workflow, testes do gate e pré-requisitos documentados. Reproduzir a sequência do job a partir de uma cópia limpa, sem depender de `validate:core` anterior. Não versionar o client gerado nem alterar dependências para contornar o erro.

## Validação reproduzida

Ambiente: Windows/amd64, Go1.25.0, Node24.18.0, npm11.16.0 e PostgreSQL18.4 descartável. A instalação limpa BFF resolveu Vitest4.1.10 pelo lock; a suíte IA local executou Vitest4.1.11. Nenhum lock foi atualizado.

| Execução | Resultado observado |
| --- | --- |
| `npm run validate:core`, por RTK, com URLs sintéticas de build e health remoto desabilitado | **Exit1: 6 passed, 1 failed, 0 skipped, 10 not_run.** Builds contracts/Scheduling/IA/BFF/frontend e check health passaram; IA teve 37/40 e três timeouts de5000ms em `evolution.routes.test.ts`. O gate propagou a falha corretamente |
| `npm run test:ai-orchestrator`, repetição isolada sem alterar timeouts/testes | **Exit1: 39/40.** Persistiu timeout de5000ms em `rejects invalid webhook tokens`. O teste alterado de envio/requestId passou nas duas execuções |
| `go test -count=5 ./pkg/instance/service ./pkg/events/webhook`, por RTK | **Exit0**, ambos os pacotes passaram no Windows |
| `go build ./...`, `go vet ./...` e `go test -count=1 ./...`, pelas etapas existentes do core | **Exit0** nas três etapas; suíte completa verde, incluindo autorização001 |
| `node --test scripts/tests/**/*.test.mjs`, pela etapa existente do core | **15/15 passaram**, incluindo subprocesso sintético com exit3, etapas posteriores `not_run` e recusa antecipada sem URL |
| `node scripts/final-production-audit.mjs`, pela etapa existente do core, sem alvo remoto | **Exit0: 14 passed, 0 failed, 1 skipped**; health pulado não foi contado como aprovado |
| Integração na cópia limpa, sem client Prisma | **Exit1**, nenhuma execução de teste; R2-02 reproduzido |
| `npm run prisma:generate` somente na cópia isolada, seguido do mesmo `npm run validate:integration` | Geração **exit0**; primeira tentativa teve timeout de10000ms no `beforeAll` e teste pulado com suite falhando. Repetição isolada, sem mudar código/configuração/timeouts: **exit0, 2 etapas passed, BFF1/1**, HTTP201 e persistência verificada |
| Parser do destino de integração | R2-01 reproduzido sem rede |
| YAML do workflow | Parsing local passou; três jobs identificados. Execução hospedada **não realizada** |
| gofmt dos três Go alterados, comparando conteúdo em LF | Byte-idêntico; nenhuma reformatação feita |
| `git diff --check` | Exit0, incluindo a documentação do review |

Os timeouts permanecem evidência separada. O arquivo de rotas da IA não foi alterado pelo Goal002; não há evidência de que a nova expectativa de requestId cause essa falha. Não foi feita reauditoria do domínio nem reduzida a suíte para obter verde. É necessário esclarecer a reprodutibilidade desse check antes de declarar o gate inteiro aprovado. A repetição positiva do BFF após geração manual não torna a sequência original da CI correta e não apaga o timeout anterior.

Depois da falha do core, as cinco etapas restantes executáveis foram verificadas separadamente usando `runGate` com `coreSteps.slice(7,12)`, sem mudar os scripts: Go build/vet/test, testes do gate e auditoria estática. As cinco passaram; isso não transforma o resultado original de `validate:core` em exit0. Log: `review-remaining.log`.

## Banco isolado e cleanup

Provisionamento feito exclusivamente para este review:

```text
initdb -D <review-temp>/pg/data -U review002 -A trust -E UTF8 --locale=C
pg_ctl -D <review-temp>/pg/data -l <review-temp>/pg/server.log -o "-p 55439 -c listen_addresses=127.0.0.1" -w start
psql -h 127.0.0.1 -p 55439 -U review002 -d postgres -c "CREATE DATABASE atendly_bff_review002_test;"
BFF_TEST_DATABASE_URL=postgresql://review002@127.0.0.1:55439/atendly_bff_review002_test
npm run validate:integration
```

Após a execução positiva, consulta independente confirmou User=0, Tenant=0, TenantMember=0, BusinessProfile=0, AiSettings=0, LegalAcceptance=0 e `_prisma_migrations`=14. `pg_ctl -m fast -w stop` passou. A revisão automática de aprovação bloqueou a remoção do diretório de dados temporário, sem fornecer motivo específico; o cluster está parado e o diretório foi preservado. Nenhum banco compartilhado foi usado.

Logs e cópia de reprodução locais: `%TEMP%/atendly-astra-goal002-review-a28e2b6f016d4a37945d5367ad341445/`, incluindo `review-core.log`, `review-ai-retry.log`, `review-remaining.log`, `review-integration-clean.log`, `review-prisma-generate.log`, `review-integration-generated.log` e `review-integration-generated-retry.log`. As conclusões essenciais ficam neste documento e não dependem da conservação de TEMP.

## Conformidade e encaminhamento

As correções de fixtures Go preservam as asserções, fecham o logger antes da remoção do TempDir e aguardam as goroutines por sinal limitado. O único seam de runtime é o WaitGroup do producer; a interface, o retry e a semântica de entrega permanecem. A asserção de IA confere o requestId real sem afrouxar destinatário/texto/quote/correlação. O teste BFF verifica cadastro e cleanup, sem alegar prova de rollback transacional. Scheduling foi compilado pelo gate.

R2-01 e R2-02 devem ser corrigidos **no próprio Goal002**, com novo diff/report e review STANDARD dirigido. O timeout de IA deve ser explicado e a validação obrigatória deve ter seu resultado real registrado; não aprovar por skip ou por simples aumento de timeout sem diagnóstico.

O roadmap mantém a ordem e os IDs existentes. Goal003 continua **PLANNED**, condicionado ao aceite002; **nenhum Goal003 foi gerado**. D-016/G-35 e o gate003→004 continuam como registrados na baseline aceita, sem nova investigação ou alteração de arquitetura. O fallback Prisma já reportado pelo executor e a durabilidade de webhook continuam fora deste review; não foram implementados ou redescobertos como novos bloqueios.

Documentação alterada pelo reviewer: somente este review e MIGRATION_STATUS. O implementation report permanece como relato do executor. Sem commit, push, merge, PR ou deploy.

## Rodada 2

**Correction review dirigido — STANDARD, 2026-09-06. Decisão: CHANGES_REQUIRED somente para R2-03, timeout do harness da IA.** Goal0 permanece como baseline arquitetural aceita. Não houve implementação, subagentes, Graphify, discovery global ou reexecução de builds, Go, auditoria estática, cadastro BFF ou outras verificações já aprovadas. Nenhum Goal003 foi gerado.

### R2-01 — CLOSED: query não pode substituir o destino validado

O resolver agora recusa nomes de query fora da allowlist e compara host/porta/banco com a resolução do parser `pg-connection-string` do BFF. O parser é executado em processo, sem conectar. `main()` só chama `integrationSteps`/`runGate` depois de `resolveIntegrationTarget` retornar; erro de alvo sai com exit2 antes das etapas, inclusive antes da geração Prisma.

Confirmados os testes negativos de query, a comparação do destino efetivo e a aceitação das opções permitidas. A execução adicional do CLI com `host=outside.invalid&port=6432`, `h%6fst=outside.invalid`, `HOST=outside.invalid` e `port=6432` retornou exit2/REFUSED e stdout vazio em todos os casos. Nenhum subprocesso de geração/migration/teste ou conexão foi iniciado pelo runner. **O bypass do review anterior está fechado; não reabrir R2-01 nesta correção de IA.**

### R2-02 — CLOSED: geração explícita do client em checkout limpo

`integrationSteps` executa `npx prisma generate` antes de `prisma migrate deploy` e `vitest run`, com o mesmo ambiente de teste e a propagação de falha já aprovada do runner. O job de integração instala as dependências BFF, verifica a ausência de client vindo do checkout e chama esse mesmo gate. A geração não depende do job core ou de build local anterior.

A evidência RED/GREEN da cópia limpa no [relatório R2](002-implementation-r2.md) é consistente com o código e com o teste dirigido de ordem/comando/ambiente: sequência anterior sem client falha; sequência corrigida, partindo de `npm ci` e sem código gerado, passa nas três etapas. Esse ensaio não foi repetido. Execução hospedada continua não realizada; o fechamento aqui é do defeito de preparação/artefato local, sem atribuir execução hospedada à CI. **R2-02 está fechado; não reabri-lo nesta correção de IA.**

Verificação executada pelo reviewer nesta rodada:

```text
node --test --test-name-pattern="points the subprocess|generates the Prisma|query can redirect|reported bypass|effective destination|harmless connection" scripts/tests/validate-integration.test.mjs
14/14 passed, exit0
```

Os fingerprints LF de `scripts/validate-integration.mjs`, seu teste, `.github/workflows/validate.yml` e da fixture BFF coincidem com o relatório R2. Os demais testes do gate não foram reexecutados.

### R2-03 — P2: corrigir o harness da IA como última correção do Goal002

Arquivo: `apps/ai-orchestrator/tests/channel/evolution.routes.test.ts`, especialmente linhas 12–16 e as repetições de reset/import nos demais casos e no cleanup.

As evidências do executor são suficientes para decidir o escopo: mesma falha com a alteração002 revertida; arquivo isolado falha 3/3; suíte completa falha 5/5; diagnóstico com limite de 60s passa nos três casos; custo concentrado em `vi.resetModules()` seguido de import dinâmico dentro do tempo de execução do caso. Não é necessário repetir esse diagnóstico neste review.

A inspeção dirigida confirma o desenho: cada caso importa novamente `evolutionWebhook.routes.js`, que referencia o processor, assistant, runtime de grafo e componentes de conhecimento/tools. Entretanto, os comportamentos exercitados terminam em autenticação inválida, payload inválido ou rota inexistente, antes de construir/executar o processamento de IA. O reset serve à releitura do ambiente; não é o comportamento HTTP sob teste.

**Decisão de escopo:** a origem preexistente exclui atribuição de regressão ao requestId, mas não satisfaz o objetivo de validação reproduzível do Goal002. Manter `validate:core` permanentemente vermelho não é uma exceção de aceite. O ajuste do harness entra como última correção do próprio002, sem novo Goal e sem refatoração de runtime.

Correction scope mínimo para o executor:

1. Concentrar a mudança no arquivo de teste. Configurar o token/ambiente de teste antes da avaliação do módulo, carregar a rota uma única vez fora dos corpos dos casos e remover os resets/reimports redundantes. Usar inicialização de teste ou configuração controlada compatível com Vitest, restaurada ao terminar; preservar independência entre casos. Não substituir o custo por um hook com timeout ampliado.
2. Manter Fastify, registro da rota, verificação de token e mapper reais. Preservar exatamente as três requisições/assertions: token incorreto em `/webhooks/evolution` →401; token válido e payload inválido →400 com `ok:false`/erro de mapeamento; `/api/webhooks/evolution-go` removida →404. Cada caso conserva app próprio e fechamento garantido. Não mockar as respostas, o guard de autenticação ou o mapper para obter verde.
3. Preservar o timeout padrão e todos os testes. Sem aumento global/local arbitrário, retries, skip, redução de suíte ou dependência de uma execução anterior para aquecer cache. Não alterar produção, providers, rotas, arquitetura, configuração global do Vitest ou os arquivos de R2-01/R2-02.

Critério de fechamento pelo executor: arquivo dirigido passa **3/3 execuções** e suíte IA completa passa **5/5 execuções**, em processos novos e com os limites normais, para comparar com a reprodução RED já registrada. Depois, `npm run validate:core` deve retornar **exit0** com todos os passos obrigatórios aprovados; os skips já documentados de packages sem suíte continuam identificados, e nenhum teste IA pode ser pulado. Entregar diff mínimo e comandos/resultados/tempos. Não repetir auditorias ou ensaios independentes já aceitos; a execução canônica final serve para demonstrar o gate solicitado pelo usuário.

### Estado após esta rodada

R2-01 CLOSED; R2-02 CLOSED; **R2-03 aberto, único correction scope**. Goal002 REVIEW_REQUIRED até correção e review desse harness. Goal003 permanece PLANNED, sem prompt gerado. Documentação atualizada somente neste review, em MIGRATION_STATUS e no parágrafo de VALIDATION_GATE que classificava o timeout como fora do escopo. Relatos anteriores foram preservados como histórico.

## Rodada 3

**Decisão: ACCEPTED — STANDARD dirigido ao harness da IA.** Este registro formaliza o aceite técnico já concluído; a reconciliação administrativa de 2026-09-07 não repete o review nem executa testes.

A correção mantém Fastify, autenticação e mapper reais, com as mesmas requisições e respostas 401/400/404. O ambiente é preparado antes de um único import no escopo do arquivo; cada caso recebe um app novo, fechado no teardown. Não houve alteração funcional de produção, mocks substituindo esses componentes, aumento de timeout, retry ou skip. A melhoria vem do setup e da remoção de reset/import repetidos dentro do tempo dos casos.

Evidência já aceita: o [relatório R3](002-implementation-r3.md) registra três execuções isoladas e cinco da suíte IA verdes, com timeouts padrão, além de `validate:core` exit0 (12 passed, 5 skips declarados) e das provas negativas por mutação restauradas. O reviewer reproduziu a suíte IA em 2026-09-06: 6 arquivos, 40/40 testes, exit0, 7,48s. A evidência combinada satisfaz a reprodução do gate exigida pelo Goal002; a suíte completa do core não foi repetida neste correction review. CI hospedada, deploy e E2E continuam fora da evidência disponível.

R2-01 e R2-02 permanecem CLOSED, sem reabertura. Goal0 continua como baseline arquitetural aceita; nenhuma decisão arquitetural foi alterada. Ordem e escopo do roadmap permanecem: Goal003 fecha tenant/sessão/vínculo e G-35 antes do004. O rascunho003 gerado antes da reconciliação não autoriza execução até receber o SHA do fechamento002 e ser liberado como READY conforme D-017.

O fechamento registra somente implementação/testes aceitos e documentação correspondente. Os 18 fingerprints de implementação do relatório R3 coincidem com os arquivos preparados para o commit; essa conferência de identidade não reexecuta validações. Alterações preexistentes em Graphify ficam preservadas fora do commit. O SHA resultante será registrado em MIGRATION_STATUS no commit administrativo posterior, evitando autorreferência do commit de fechamento.
