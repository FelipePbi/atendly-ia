# Gate de validação local e CI

Documento operacional do Goal002. Descreve como executar as verificações
reprodutíveis da migração, o que cada comando prova e o que **não** prova.

Um comando verde aqui não é atestado de produção: não há deploy, teste E2E,
comparação visual, prova de concorrência nem verificação de banco de produto.

## Comandos canônicos

```bash
npm run validate:core
npm run validate:integration
git diff --check
```

| Comando | Cobre | Não cobre |
| --- | --- | --- |
| `validate:core` | Builds de Scheduling, IA, BFF e frontend; `npm run check` do health-worker; suíte da IA; suíte do adapter HTTP do frontend; `go build`/`go vet`/`go test` do Evolution Go; testes dos próprios scripts de gate; auditoria estática | Qualquer escrita em banco. Nenhum passo abre conexão de banco |
| `validate:integration` | 32 passos contra um PostgreSQL descartável: geração de client Prisma, migrations, a suíte de integração do BFF, a suíte de integração do Scheduling, a persistência da IA, a purga de conteúdo de conversa (Goal023) e a purga por negócio da IA (Goal025), o outbox do Evolution Go, um ensaio por migration de Goal — o mais recente deles `rehearse:goal027-calendar-source-migration` —, a reconciliação do fuso único do negócio (`rehearse:goal029-timezone-reconciliation`, Goal029) e, desde o Goal028, o ensaio de release (`rehearse:goal028-release-migrations`) e o de dump/restore (`rehearse:goal028-restore`) | Qualquer camada acima do dado: nenhuma jornada de interface, nenhum envio real por WhatsApp e nenhuma origem real do Minha Agenda |
| `git diff --check` | Espaço em branco/conflito no diff | Correção do diff |

Comandos auxiliares: `npm run test:gate` (só os testes dos scripts de gate) e
`npm run smoke:final-audit` (só a auditoria estática).

`npm run build:all` continua existindo e agora também compila o Scheduling
Service; ele é o agregador histórico, não o gate.

## Pré-requisitos

| Dependência | Versão usada na validação do Goal002 | Origem da versão |
| --- | --- | --- |
| Node | 24.18.0 (CI fixa 24.13.0) | `render.yaml` declara 24.13.0; `engines` exige `>=20` |
| npm | 11.16.0 | acompanha o Node |
| Go | 1.25.0 (windows/amd64), CGO habilitado | `apps/evolution-go/go.mod` |
| PostgreSQL | 18.4 local descartável (CI: `postgres:16-alpine`) | binários já instalados na estação |

Dependências de cada package precisam estar instaladas antes do gate
(`npm ci` em `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff`,
`apps/frontend`, `apps/health-worker`).
Nenhuma dependência de produção foi adicionada ou atualizada pelo Goal002.
`packages/contracts` — que nunca teve import de runtime em nenhum app — e os
passos `build:contracts`/`test:contracts` do gate saíram no diff026
([review026](reviews/026-review.md); [DECISIONS D-042](DECISIONS.md)). O loop de
`npm ci` do CI (`.github/workflows/validate.yml`) deixou de instalar o pacote no
mesmo diff.

Nada além disso precisa existir no checkout. O client Prisma é gerado dentro
dos gates: em `validate:core` pelo `npm run build` de cada app, em
`validate:integration` pelo passo `generate:bff-prisma-client`. Código gerado
não é versionado e nenhum artefato produzido por execução local anterior é
pré-requisito implícito.

Para `validate:integration` basta `npm ci --prefix apps/bff`; sem isso o gate
recusa antes de conectar, porque não consegue nem verificar o destino real do
banco.

## Separação unitário / integração / estático

- **Unitário e build (`validate:core`).** Não toca banco. A suíte do BFF fica
  de fora de propósito: o único teste existente lá é de integração, e rodá-lo
  com o `.env` pessoal seria executar integração por acidente.
- **Integração (`validate:integration`).** Exige `BFF_TEST_DATABASE_URL`
  apontando para um PostgreSQL descartável. O runner injeta
  `DATABASE_URL`/`DIRECT_DATABASE_URL` no subprocesso a partir dessa URL;
  como o `dotenv` não sobrescreve variável já definida, `apps/bff/.env` nunca
  vence. A própria suíte confere `SELECT current_database()` antes de gravar.
- **Estático (`scripts/final-production-audit.mjs`).** Auxiliar: lê arquivos e
  aplica expressões regulares. Não executa serviços, não prova isolamento em
  runtime e não substitui integração ou E2E. Só faz chamada remota quando
  `PRODUCTION_HEALTH_TARGETS` é fornecido; sem isso o check de health é
  registrado como `skipped` e **não** entra na contagem de `passed`.

## Banco de teste descartável

O runner recusa o alvo quando a URL está ausente, não é `postgres(ql)://`,
não nomeia um banco cujo nome marque descarte (precisa conter `test`), ou não
aponta para loopback. A recusa sai com **exit 2**, antes de qualquer
subprocesso — nunca com skip silencioso.

### O alvo validado precisa ser o alvo real

Host e porta na autoridade da URL não bastam: o driver do BFF (`pg`, sob
`PrismaPg`) aceita `host`, `port`, `hostaddr`, `dbname`, `service`,
`servicefile`, `passfile` e `options` na query string e **substitui** por eles o
destino da autoridade. `postgresql://…@127.0.0.1:55432/x_test?host=outro&port=6432`
anuncia loopback e conecta em outro servidor.

Duas camadas fecham isso, ambas em processo e antes de qualquer subprocesso ou
conexão:

1. **Allowlist de query parameters.** Só passam `application_name`,
   `connect_timeout`, `connection_limit`, `pool_timeout`, `schema` e `sslmode`.
   Qualquer outro parâmetro é recusado pelo nome.
2. **Conferência do destino efetivo.** A URL é reparseada com o parser do
   próprio driver (`pg-connection-string`, resolvido a partir de
   `apps/bff/node_modules`) e host/porta/banco resultantes precisam ser
   loopback e idênticos aos validados.

A suíte reconfirma em runtime com `SELECT current_database()`,
`inet_server_port()` e `host(inet_server_addr())`: nome de banco igual em outro
servidor não passa despercebido.

### Provisionamento local (Windows, sem Docker)

```bash
PGBIN="$LOCALAPPDATA/Programs/PostgreSQL/18/pgsql/bin"
PGDIR=/c/tmp/atendly-pgtest

"$PGBIN/initdb.exe" -D "$PGDIR/data" -U pgtest -A trust -E UTF8 --locale=C
"$PGBIN/pg_ctl.exe" -D "$PGDIR/data" -l "$PGDIR/server.log" -o "-p 55432 -c listen_addresses=127.0.0.1 -c timezone=UTC" start
psql -h 127.0.0.1 -p 55432 -U pgtest -d postgres -c "CREATE DATABASE atendly_bff_test;"
```

O cluster usa autenticação `trust` em loopback e existe apenas para teste;
não há credencial real envolvida.

O `-c timezone=UTC` importa: `initdb` herda o fuso da máquina, e produção roda
em UTC. Como as colunas de instante são `timestamp` sem fuso — gravadas e
lidas em UTC pelo Prisma — enquanto `now()` avaliado no SQL cai para a hora de
parede da sessão, um cluster em outro fuso põe o relógio do banco e os
instantes do processo em escalas diferentes, e vencimentos passam a errar pelo
deslocamento. `provision:scheduling-test-database` fixa isso no próprio banco
descartável do Scheduling; o cluster criado à mão deve começar já em UTC.

### Extensão de servidor exigida pelo histórico (pgvector)

O histórico de migrations do `ai-orchestrator` executa `CREATE EXTENSION IF NOT
EXISTS vector` desde `20260829180000_rag_pgvector`. Nenhuma migration instala
uma extensão: a biblioteca precisa já existir **no servidor**, no cluster
descartável e em produção igualmente. Sem pgvector, `prisma migrate deploy`
para no meio do histórico com `P3018` / `0A000 extension "vector" is not
available`, e o ensaio de release recusa antes de criar banco, com exit 2.

No Windows, sem Docker, pgvector é compilado contra a instalação local e
copiado para dentro dela:

```bash
git clone --branch v0.8.6 https://github.com/pgvector/pgvector.git
# num shell do Visual Studio (vcvars64.bat), com
# PGROOT apontando para .../Programs/PostgreSQL/18/pgsql
nmake /F Makefile.win
nmake /F Makefile.win install
```

Isso instala `lib/vector.dll` e `share/extension/vector*` na instalação do
PostgreSQL; é reversível apagando esses arquivos.

### Execução

```bash
npm ci --prefix apps/bff
BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" npm run validate:integration
```

São 32 passos. A lista abaixo enumera o núcleo, na ordem em que roda — o item
5 agrupa o par do Evolution Go. Entre os itens 6 e 7 rodam, nesta ordem, os demais
ensaios de migration por Goal (005 a 013, 019, 021, 022, 023 e 027), o ensaio de
release do Goal028 (`rehearse:goal028-release-migrations`), o ensaio de
dump/restore do Goal028 (`rehearse:goal028-restore`, que semeia dado em cadeia
nos três bancos que o ensaio de release deixou migrados, executa `pg_dump` em
formato custom, restaura em banco novo `<origem>_restore` e compara contagem por
tabela, `_prisma_migrations`, índices, constraints nomeadas e enums — provando
por `UPDATE` real que `CalendarSettings_source_atendly_check` sobrevive ao
restore e recusa `MINHA_AGENDA` com `23514`; o Evolution Go fica de fora porque
cria as próprias tabelas em código Go, sem histórico versionado), o trio do
Scheduling (`generate:scheduling-prisma-client`,
`provision:scheduling-test-database`, `test:scheduling-integration`) e, logo em
seguida, `rehearse:goal029-timezone-reconciliation` (Goal029): duas bases
descartáveis próprias, distintas do trio acima, com divergência real semeada
entre `BusinessProfile.timezone` e `CalendarSettings.timezone`, exercida pelas
rotas públicas `GET /v1/settings` e `GET /v1/calendar` do BFF real (cada uma
com o seu próprio tenant divergente) contra um `scheduling-service` real, e
convergência provada por leitura direta das duas bases depois delas, nunca pela
resposta HTTP. A lista
autoritativa é `scripts/validate-integration.mjs`:

1. `generate:bff-prisma-client` produz `apps/bff/src/generated/prisma`;
2. `migrate:bff-test-database` aplica as migrations existentes
   (`prisma migrate deploy`) **somente** nesse banco;
3. `test:bff-integration` roda a suíte do BFF — cadastro/aceite legal, sessão
   revogável com CSRF/origem e vínculo tenant/instância com credencial cifrada;
4. `rehearse:goal003-link-migration` ensaia a migration de vínculo contra um
   estoque legado sintético, em banco `<alvo>_rehearsal` recriado a cada
   execução, e reconcilia as contagens;
5. `provision:evolution-test-database` + `test:evolution-go-ownership` rodam o
   ensaio de propriedade de metadados do Evolution Go em `<alvo>_evolution`;
6. `rehearse:goal004-transport-migration` ensaia a migration de transporte
   durável em `<alvo>_goal004`, recriado a cada execução, e deixa o banco no
   estado pós-migration;
7. `generate:ai-orchestrator-prisma-client` produz
   `apps/ai-orchestrator/src/generated/prisma`;
8. `test:ai-orchestrator-transport-durability` roda a suíte de persistência e
   concorrência da IA sobre o resultado do ensaio;
9. `test:ai-orchestrator-content-purge` roda `tests/retention` da IA
   contra o mesmo banco: a purga de conteúdo de conversa e a retenção
   técnica do inbox durável (`ProcessedEvent`) do Goal023 — o que cada uma
   apaga e, sobretudo, o que ela não alcança (não classificado, órfão de
   sessão, trabalho vivo, evidência de falha e o negócio vizinho) — e,
   desde o Goal025, a purga por negócio
   (`tests/retention/tenant-purge.test.ts`), incluindo a prova de
   isolamento com dois negócios povoados;
   é por causa dela que o banco deste passo precisa ter `KnowledgeChunk`
   (ver abaixo);
10. `test:evolution-go-webhook-outbox` roda o outbox técnico do Evolution Go
    no mesmo servidor descartável.

`rehearse:goal023-retention-migration` (Goal023/WU-09), entre os ensaios de
migration por Goal enumerados acima, ensaia as quatro migrations deste Goal —
`RetentionSettings`/`RetentionSweepState` no BFF, `Conversation.
contentExpiredThrough` na IA, o índice de `AppointmentNotificationIntent` no
Scheduling — em três bancos próprios e descartáveis, aplicando cada uma duas
vezes para provar retomada: ver [DATA_MIGRATION §12](DATA_MIGRATION.md#12-migração-de-retenção-configurável-e-purga-de-conteúdo-goal023).

`rehearse:goal027-calendar-source-migration` (Goal027/WU-01, diff027 —
aceito no [review027](reviews/027-review.md)), o mais recente dos ensaios de migration por Goal,
ensaia contra um banco próprio e descartável a primeira migration deste
repositório que **reescreve** dado existente (`CalendarSettings.source` de
`MINHA_AGENDA` para `ATENDLY`), com a contagem de linhas reescritas reportada
pelo ensaio e a `CHECK` nova provada por `UPDATE`/`INSERT` reais recusados com
`23514`: ver [DATA_MIGRATION §14](DATA_MIGRATION.md#14-migração-da-fonte-da-agenda-para-atendly-goal027).

Nada de `migrate reset` sobre URL herdada, e nenhuma migration é reescrita.

Os bancos derivados (`_rehearsal`, `_evolution`, `_goal004`) saem do alvo já
validado — mesmo servidor descartável, nome próprio que preserva o marcador
`test`. Não existe variável nova para configurar, e nenhum passo depende de
banco pessoal.

O banco do passo 6 não roda `prisma migrate deploy` da IA: o schema é
reconstruído em SQL porque o cluster descartável não tem pgvector. Depois das
asserções do ensaio, o script cria as tabelas de apoio que o caminho durável
toca (`AiTenantConfig`, `AiRun`, `Handoff`) sem semear linha alguma, para que o
passo 8 exercite o fluxo inteiro com um alvo só.

Pelo mesmo motivo, `KnowledgeChunk` ficava de fora desse banco por pulo
nomeado — `embedding` é `vector(1536)` no schema da IA e nem o cluster local
nem o `postgres:16-alpine` do CI instalam pgvector. O Goal025 foi o primeiro a
rodar contra esse banco um teste que exige a tabela existir (a purga por
negócio atravessa as 16 tabelas com `tenantId`, e ela é uma delas), então
`rehearse:goal012-knowledge-memory-migration` passou a criar a tabela como
fixture idempotente com `embedding` em `TEXT`. O pulo continua nomeado e
estreito: a purga apaga a linha sem ler nem comparar embedding, nenhuma busca
por similaridade roda neste banco, e o que precisa ser fiel — `tenantId`, a
FK composta para `KnowledgeDocument` com `ON DELETE CASCADE` e a ordem
folha-para-raiz — continua igual à produção. Nenhum passo novo entrou no
gate: continuam 28.

O runner também injeta chaves de cifra **sintéticas**
(`WHATSAPP_CREDENTIAL_KEYS`, `CHANNEL_CREDENTIAL_KEYS`) para que selagem,
abertura e rotação sejam exercitadas sem qualquer credencial real.

### Limpeza

A fixture apaga apenas o que criou (usuário pelo e-mail sintético e o tenant
criado no cadastro; as cascatas do schema removem membership, perfil de
negócio, `aiSettings` e aceite legal) e confirma no `afterAll` que as
contagens voltaram a zero. Depois do gate sobram apenas as 14 linhas de
`_prisma_migrations`.

Descarte do cluster inteiro:

```bash
"$PGBIN/pg_ctl.exe" -D "$PGDIR/data" stop -m immediate
rm -rf "$PGDIR"
```

Se este cluster foi provisionado por uma attempt do IA Loop (Developer ou
Tech Lead rodando `validate:integration` durante um Goal) e a attempt foi
interrompida antes deste passo — `USAGE_LIMIT`, crash, Ctrl+C — o cluster
pode ter ficado para trás sem que ninguém tenha rodado o descarte acima.
Confira com:

```bash
npm run ia-loop:resources                      # lista o que ainda está vivo
npm run ia-loop:resources:cleanup -- --dry-run  # plano de limpeza, sem mutação
```

Ver `tools/ia-loop/README.md` (seção "Temporary Resource Lifecycle") para o
porquê disso existir — um cluster efêmero criado por esta receita antes
daquela etapa não tem registro e não aparece nesses comandos; um criado
depois, sim.

## Leitura dos resultados

Cada passo termina em um de quatro estados, e o resumo em JSON separa todos:

| Estado | Significado |
| --- | --- |
| `passed` | Subprocesso terminou com código 0 |
| `failed` | Código != 0, sinal, ou falha ao iniciar o processo |
| `skipped` | Passo declarado sem execução, com motivo (ex.: package sem suíte) |
| `not_run` | Passo posterior à primeira falha; nunca deve ser lido como aprovação |

Códigos de saída: `0` sucesso, `1` alguma etapa falhou, `2` (só integração)
alvo de banco recusado. `skipped` e `not_run` jamais viram `passed`.

Packages sem suíte automatizada aparecem explicitamente como `skipped` em
`validate:core`: `apps/bff` (só integração) e `apps/health-worker`.
`packages/contracts` tinha o mesmo tratamento até o diff026, quando o pacote
e o passo saíram do gate junto — os skips declarados passaram de três para dois.

`apps/frontend` deixou de ser skip: o Goal003 acrescentou `test:frontend`
(`vitest run`), que exercita o adapter HTTP contra o BFF — sessão e CSRF sem
cookie jar compartilhado, com `fetch` injetado. Não abre banco nem rede, por
isso pertence ao core.

## Ordem de corte do Goal003

Duas transições deste Goal têm consumidor e produtor em serviços diferentes.
Nenhuma delas pode perder evento no meio do caminho, então a ordem abaixo é
parte da entrega, não sugestão de operação.

### Projeção cifrada da credencial de canal (BFF → IA)

`20260907120000_goal003_channel_credential_projection` é aditiva e deixa todo
`ChannelConnection` já existente com `credentialVersion` 0 e sem cipher. A
ordem de corte é:

1. **Consumer compatível primeiro.** O webhook da IA resolve a credencial de
   forma **preguiçosa**, no momento do envio. Receber, mapear e persistir o
   inbound não dependem da projeção: um vínculo em `credentialVersion` 0 grava
   a mensagem do cliente normalmente e só falha ao responder, com
   `CHANNEL_CREDENTIAL_NOT_PROVISIONED` registrado no log do webhook. Em
   nenhuma hipótese o envio cai em `EVOLUTION_API_KEY`.
2. **Migration aditiva.** Aplicada sem backfill; ninguém precisa dela para
   receber mensagem.
3. **Reprovisionamento sem reconexão manual.** Além de `POST /v1/whatsapp/connect`
   e `POST /v1/whatsapp/reconnect`, agora `GET /v1/whatsapp` reprojeta a
   credencial na IA. É idempotente e não altera o estado do número, então o
   vínculo se restabelece na primeira vez que o negócio abre a tela de
   WhatsApp — sem depender de cada dono reconectar o número. Falha de projeção
   é registrada e não derruba a leitura de status.
4. **Retirada de campos do produtor.** Não acontece neste Goal. Enquanto
   existir vínculo em `credentialVersion` 0, o estado é observável pelo índice
   `ChannelConnection_credentialVersion_idx`.

Cobertura: `apps/ai-orchestrator/tests/security/webhook-credential-transition.test.ts`
— inbound de vínculo em `credentialVersion` 0 é processado e persistido, o
envio é recusado e nenhuma chamada sai ao transporte; depois de reprovisionado,
o envio usa a credencial da instância e não a chave global.

### Estados ambíguos do vínculo tenant/instância (BFF)

O backfill deixa em pendência segura as linhas sem proveniência inequívoca.
Dois estados, com caminhos de resolução diferentes:

| Estado | Resolução | Quem executa |
| --- | --- | --- |
| Pendente (linha do próprio usuário, sem negócio dono) | `DELETE /v1/whatsapp` descarta o vínculo; em seguida `POST /v1/whatsapp/connect` cria um novo | o próprio dono, autenticado |
| Divergente (duas linhas, ou dono de negócio ≠ dono de usuário) | nenhuma rota resolve: envolveria decidir por outro negócio | operação, caso a caso |

A mensagem de erro do estado pendente cita a rota que resolve. Cobertura em
`apps/bff/tests/tenant-instance-link.integration.test.ts`: descarte pelo dono
seguido de novo vínculo, e recusa do descarte no estado divergente sem apagar
nada.

## Transporte durável do Goal004

O que os dois passos novos trancam, além do que a lista acima descreve:

- **Recebimento antes do ACK.** O evento é gravado com chave única
  `(tenantId, provider, eventKey)` antes do 202; duplicata devolve 202 sem novo
  efeito e queda entre ACK e processamento retoma exatamente uma vez.
- **Dedupe no lugar certo.** O guard do grafo não repete a prova de recebimento
  do trabalho já reivindicado: um evento único claimado é processado e
  respondido, não marcado `duplicate`. Coberto por
  `apps/ai-orchestrator/tests/integration/inbox-dispatch.test.ts`, que roda o
  `InboundEventDispatcher` com `InboxStore` e `IdempotencyStore` reais.
- **Fila sem bloqueio de cabeça.** O claim exclui conversas com `PROCESSING` de
  lease vivo e segue para a próxima candidata no mesmo ciclo: uma conversa
  ocupada não segura as outras, e ela própria continua serializada.
- **Janela de conversa sobre o inbox persistido.** A janela adaptativa de
  fragmentos (mínimo `AI_DEBOUNCE_MIN_SECONDS`, até
  `AI_DEBOUNCE_MAX_SECONDS`, limitada por `AI_DEBOUNCE_MAX_WAIT_SECONDS` desde
  o primeiro fragmento) e a espera da primeira mensagem ambígua de contato sem
  histórico (`AI_AMBIGUOUS_WAIT_SECONDS`, teto
  `AI_AMBIGUOUS_MAX_WAIT_SECONDS`) são recalculadas em `nextAttemptAt`, não em
  buffer de memória. Cobertas em
  `apps/ai-orchestrator/tests/integration/transport-durability.test.ts` e, na
  parte de política pura, em `apps/ai-orchestrator/tests/inbox/inbox-policy.test.ts`.
  A espera é heurística de transporte; classificação de intenção é do Goal005.
- **Entrega sem promessa falsa.** Timeout vira `unknown` e a tentativa
  permanece; recibo `Delivered`/`Read` reconcilia; estoque legado fica
  `UNKNOWN`, nunca `SENT` presumido.

Capacidade de execução contínua do worker (quantas instâncias, com que
disponibilidade) continua sendo decisão de operação, fora do gate.

## Inventário de loops de fundo (Goal028 §4)

Os cinco laços de fundo do produto, lidos do código na baseline do Goal028.
Este inventário **não** mede throughput, não simula carga e não recomenda
plano: ele existe para que a decisão de capacidade — **U-03**, que continua
aberta em [DECISIONS](DECISIONS.md) — seja tomada por uma pessoa com os
números da árvore à vista.

| Loop | Arquivo | Flag | Default | Intervalo | Lote | Lease | Consultas por ciclo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Varredura de retenção (BFF) | `apps/bff/src/modules/retention/RetentionSweepWorker.ts`, ciclo em `retention/sweep.ts` | `RETENTION_SWEEP_ENABLED` | `false` | `RETENTION_SWEEP_INTERVAL_SECONDS` = 900 s | `RETENTION_SWEEP_TENANT_BATCH` = 20 negócios; `RETENTION_SWEEP_MAX_ROWS_PER_STORE` = 500 linhas por loja; `RETENTION_SWEEP_MIN_TENANT_INTERVAL_SECONDS` = 3600 s entre passadas do mesmo negócio | `RETENTION_SWEEP_LEASE_TTL_SECONDS` = 300 s | Ciclo ocioso: **1** — `dueTenants`, um `SELECT` com `LEFT JOIN RetentionSweepState`. Por negócio reivindicado: lease, leitura de `RetentionSettings`, as três lojas (IA, Scheduling, notificações) e a liberação do lease. Teto por ciclo ≈ 1 + 20 × 6 |
| Purga de conta (BFF) | `apps/bff/src/modules/account/worker.ts`, ciclo em `account/purge.ts` | `ACCOUNT_PURGE_ENABLED` | `false` | `ACCOUNT_PURGE_INTERVAL_SECONDS` = 900 s | `ACCOUNT_PURGE_BATCH` = 5 contas; `ACCOUNT_PURGE_MAX_ROWS_PER_STORE` = 2000 linhas por loja | `ACCOUNT_PURGE_LEASE_TTL_SECONDS` = 300 s | Ciclo ocioso: **1** — `dueAccounts`. Por conta reivindicada: lease, leitura dos membros, as lojas de cada serviço e a liberação do lease |
| Inbox durável (IA) | `apps/ai-orchestrator/src/modules/inbox/InboxWorker.ts` | `INBOX_WORKER_ENABLED` | `true` | `INBOX_POLL_INTERVAL_MS` = 1000 ms quando o ciclo anterior não processou nada; 0 ms enquanto houver trabalho, e `nudge()` acorda o laço no webhook | `INBOX_GROUP_BATCH_LIMIT` = 20 eventos por conversa; `INBOX_MAX_CONCURRENT_CONVERSATIONS` = 4 conversas em voo | `INBOX_LEASE_SECONDS` = 120 s, renovado a cada `INBOX_LEASE_HEARTBEAT_SECONDS` = 30 s | Ciclo ocioso: até **4** `claimNext`, um por slot de concorrência; o primeiro claim vazio corta o restante. Por conversa em voo: mais 1 heartbeat a cada 30 s e 1 `settle` no fim |
| Entrega de notificação (IA) | `apps/ai-orchestrator/src/modules/reminders/NotificationDeliveryWorker.ts` | `NOTIFICATION_DELIVERY_ENABLED` | `true` | `NOTIFICATION_DELIVERY_POLL_INTERVAL_MS` = 15000 ms quando nada foi entregue; 0 ms enquanto houver fila | `NOTIFICATION_DELIVERY_BATCH_LIMIT` = 50 intenções; `NOTIFICATION_DELIVERY_TENANT_LIMIT` = 10 por negócio | `NOTIFICATION_DELIVERY_LEASE_SECONDS` = 120 s | Ciclo ocioso: **1 chamada interna** ao Scheduling (`claimDueNotificationIntents`), que lá dentro é 1 consulta de claim. A IA não consulta o banco do dono da agenda direto: o custo de banco do claim é do Scheduling |
| Autoconclusão de atendimento (Scheduling) | `apps/scheduling-service/src/modules/appointments/auto-complete-loop.ts` | `CALENDAR_AUTO_COMPLETE_ENABLED` | `true` | `CALENDAR_AUTO_COMPLETE_POLL_INTERVAL_MS` = 60000 ms | Sem teto de lote declarado: o ciclo varre todo `Appointment` com status confirmado e `endAt` anterior ao corte de `CALENDAR_AUTO_COMPLETE_GRACE_MINUTES` = 30 min | Sem lease em tabela: exclusão mútua por `pg_try_advisory_xact_lock` dentro da transação do ciclo | Ciclo ocioso: **3** — lock consultivo, relógio do banco e o `findMany` dos vencidos, tudo numa transação. Por atendimento vencido: mais as escritas de `completeAppointmentWithin` |

O que este inventário **não** prova:

- que os loops sustentam volume real — nenhuma carga foi simulada e nenhum
  throughput foi medido;
- que um plano de hospedagem gratuito mantém os processos vivos entre ciclos;
- que o deploy hospedado funciona. **M4** continua aberto.

O valor de cada flag em `render.yaml` é decisão de operação escrita, nunca
efeito colateral de default: a checagem estática
`production_config_loop_flags_explicit` reprova o blueprint que omitir
qualquer um dos cinco.

## O que os ensaios de release e de restore provam, e o que não provam

`rehearse:goal028-release-migrations` **prova**, por serviço (BFF, IA e
Scheduling) e em banco vazio recém-criado:

- que `prisma migrate deploy` leva um banco vazio até o schema vigente com o
  histórico completo, e não só a migration do Goal da vez;
- que o número de linhas de `_prisma_migrations` com `finished_at IS NOT NULL`
  bate com o número de diretórios lido de `prisma/migrations`, sem nenhuma
  linha com `rolled_back_at`;
- que uma segunda execução no mesmo banco não aplica nada e não falha;
- que o banco migrado não divergiu do `schema.prisma` — `prisma migrate diff`
  com saída vazia.

`rehearse:goal028-restore` **prova**, sobre esses mesmos bancos:

- que um `pg_dump` em formato custom restaurado em banco novo e vazio preserva
  contagem de linhas por tabela, linhas de `_prisma_migrations`, índices,
  constraints nomeadas e valores de enum;
- que `CalendarSettings_source_atendly_check`, do Goal027, sobrevive ao
  restore: uma tentativa real de `UPDATE` no banco **restaurado** falha com
  `23514`.

Nenhum dos dois **prova**:

- que a subida em produção funciona — o alvo é um PostgreSQL descartável em
  loopback, não a infraestrutura hospedada;
- que o volume de dados de produção cabe numa janela de manutenção: o conjunto
  semeado é mínimo e representativo, escolhido para que a asserção de
  integridade signifique algo, não para medir tempo de dump;
- nada sobre o Evolution Go, que cria as próprias tabelas em código Go, sem
  histórico versionado, e por isso fica declaradamente fora dos dois ensaios.

## CI

`.github/workflows/validate.yml` roda os mesmos comandos:

- `core` (ubuntu): `npm run validate:core`.
- `go-windows` (windows): `go build`/`vet`/`test` e `go test -count=5` nos dois
  pacotes de cleanup, reproduzindo no Windows a classe de falha corrigida.
- `integration` (ubuntu): PostgreSQL descartável como service container,
  `npm run validate:integration` e, em seguida, a checagem de que o gate
  **recusa** (exit 2) quando `BFF_TEST_DATABASE_URL` some.

Sem deploy, sem banco compartilhado, sem plataforma nova e sem segredo real:
as credenciais do service container são sintéticas e morrem com o runner.

## Troubleshooting

| Sintoma | Causa e ação |
| --- | --- |
| `TempDir RemoveAll cleanup: ... being used by another process` em teste Go | Logger da instância aberto. Fechar com `Logger.Close()` num `t.Cleanup` registrado **depois** de `t.TempDir()` (cleanups rodam em LIFO) e, no producer de webhook, esperar as goroutines de entrega antes de fechar |
| `spawnSync npm.cmd EINVAL` | Node no Windows recusa executar `.cmd` sem shell (CVE-2024-27980). O runner do gate já monta a linha de comando e usa `shell: true` |
| `gofmt -l` lista arquivos sem diferença real | Checkout com `core.autocrlf=true`: a diferença é só de EOL. Comparar com `gofmt -d` sobre cópia normalizada em LF; não reformatar o repositório |
| `validate:integration REFUSED — … is not set` | Faltou `BFF_TEST_DATABASE_URL`. Provisionar o banco descartável; não apontar para o banco de desenvolvimento |
| `REFUSED — Query parameter(s) … are not allowed` | A URL traz um parâmetro capaz de redirecionar a conexão. Remova-o; só a allowlist acima é aceita |
| `REFUSED — The PostgreSQL driver resolves …` | Autoridade da URL e destino efetivo divergem. Corrija a URL; não relaxe o guard |
| `REFUSED — Cannot verify the effective PostgreSQL destination` | Dependências do BFF ausentes. Rode `npm ci --prefix apps/bff` |
| `Cannot find module '../generated/prisma/client.js'` | Client Prisma não gerado. Use `npm run validate:integration` (gera no primeiro passo) ou `npm run prisma:generate` em `apps/bff`; não versione o código gerado |
| `goal028:release-rehearsal REFUSED — The target server does not offer the extension(s) vector` | O servidor descartável não tem pgvector. Instalar conforme a seção acima; não remover a exigência do ensaio |
| `goal028:restore-rehearsal REFUSED — pg_dump is not available on PATH` | Faltam as ferramentas de cliente do PostgreSQL (`pg_dump`/`pg_restore`). Instalar as mesmas que o runbook de restore usa; o ensaio recusa com exit 2 e nunca faz skip |
| `goal028:restore-rehearsal REFUSED — The source database … does not exist` | O ensaio de restore parte dos bancos que `rehearse:goal028-release-migrations` deixa migrados. Rodar `validate:integration`, que executa os dois na ordem, ou o ensaio de release antes |
| Porta 55432 ocupada | Outro cluster de teste rodando. Parar com `pg_ctl ... stop -m immediate` ou usar outra porta na URL |
| `Route POST:/auth/register not found` | Rota antiga; a pública é `POST /v1/auth/register` |
| `Test timed out in 5000ms` num teste que faz `vi.resetModules()` | O import dinâmico do módulo pesado está sendo pago dentro do corpo do caso. Prepare o ambiente e importe o módulo uma vez na avaliação do arquivo de teste; não aumente o timeout |

## Limites conhecidos

- R2-03 corrigido: `evolution.routes.test.ts` prepara o ambiente e importa o
  módulo de rotas **uma vez**, na avaliação do arquivo, em vez de repetir
  `vi.resetModules()` + import dinâmico dentro de cada caso. Fastify, o guard de
  token, o mapper e as respostas 401/400/404 continuam reais, com app próprio
  por caso e o `testTimeout` padrão. `validate:core` volta a exit0 de forma
  reproduzível — ver [002-implementation-r3](reviews/002-implementation-r3.md).
  R2-01 e R2-02 permanecem fechados.
- Só um fluxo de integração existe hoje (cadastro). Persistência dos demais
  domínios continua **NÃO VERIFICADA**.
- A auditoria estática não verifica concorrência, isolamento real nem deploy.
  A fronteira exata mudou no Goal028 sem que essa frase deixe de ser verdadeira:
  a auditoria passou a verificar a **declaração** de configuração de produção —
  que toda chave de `config/env.ts` está contabilizada em `render.yaml`, que os
  cinco flags de loop têm valor explícito, que nenhum `*_BASE_URL`,
  `FRONTEND_ORIGIN` ou `PASSWORD_RESET_PUBLIC_URL` resolve para host de
  desenvolvimento, que `NODE_ENV`/`COOKIE_SECURE` têm valor de produção, que
  nenhum segredo entra literal no arquivo, que todo `rootDir` e todo
  `buildFilter.paths` existe na árvore e que `.env.example` e `config/env.ts`
  declaram o mesmo conjunto de chaves. Ela continua sem verificar que o serviço
  **sobe** com essa configuração: o blueprint é lido como texto, nenhum deploy
  é feito e nenhum endereço é chamado.
- **Diff027 ([D-043](DECISIONS.md), aceito no [review027](reviews/027-review.md)):**
  `scripts/final-production-audit.mjs` ganhou três checagens (23 no total).
  `no_external_calendar_source_comparison` rodou **vermelha contra a árvore
  real** na rodada 1: três arquivos fora do escopo do diff027 ainda
  declaravam `EXTERNAL`/`MINHA_AGENDA` como valor de fonte de agenda —
  `apps/frontend/src/features/settings/shared/labels.ts`,
  `apps/scheduling-service/src/modules/internal-api/routes.ts` e
  `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` — sem
  caminho vivo capaz de escrever esse valor de volta em `CalendarSettings`
  (a `CHECK` da migration recusaria). A rodada 2 (FIX-001) corrigiu os três;
  `smoke:final-audit` e `validate:core` fecham limpos nessa checagem. O tipo
  de `SchedulingClient.configureCalendar` foi estreitado para
  `{ source: "ATENDLY"; timezone: string }` na rodada 3; ver
  [DATA_MIGRATION §14](DATA_MIGRATION.md#14-migração-da-fonte-da-agenda-para-atendly-goal027)
  e [GAP_ANALYSIS G-10](GAP_ANALYSIS.md).
- **Diff028 ([D-044](DECISIONS.md), aceito no [review028](reviews/028-review.md)):**
  `scripts/final-production-audit.mjs` ganhou cinco checagens (28 no total,
  27 pass e o skip declarado `production_health`). Três coisas rodaram
  **vermelhas contra a árvore real** na rodada 1, e as correções são de
  natureza diferente: (a) chaves ausentes de `render.yaml`, `NODE_ENV`
  faltando no BFF e os cinco flags de loop implícitos foram corrigidos **na
  árvore** (`render.yaml` e `.env.example`); (b) o passo de drift acusou
  divergência entre `schema.prisma` e o histórico na IA e no Scheduling,
  corrigida na **declaração**, com zero SQL e nenhuma migration criada ou
  editada — ver
  [DATA_MIGRATION §15](DATA_MIGRATION.md#15-ensaio-de-release-restore-e-configuração-de-produção-goal028);
  (c) a sub-regra de segredo literal reprovava `PASSWORD_RESET_PUBLIC_URL`
  por casar `PASSWORD` como substring, contradizendo a sub-regra de host de
  desenvolvimento, que exige `value:` literal na mesma chave — este era
  defeito **da regra**, corrigido por `isPublicUrlKey()` com dois casos
  negativos que provam que segredo real com valor literal continua
  reprovando. `validate:integration` passou de 29 para 31 passos, e o CI
  exige agora imagem com pgvector e cliente `pg_dump`/`pg_restore` não mais
  antigo que o servidor.
- **Diff029 ([D-045](DECISIONS.md), aceito no [review029](reviews/029-review.md)):**
  `validate:integration`
  passou de 31 para 32 passos com `rehearse:goal029-timezone-reconciliation`,
  que prova a reconciliação dono/réplica do fuso do negócio contra duas bases
  descartáveis próprias — ver
  [DATA_MIGRATION §16](DATA_MIGRATION.md#16-reconciliação-do-fuso-único-do-negócio-goal029).
  Nenhuma migration nova, nenhuma linha de `Appointment`, `AvailabilityRule`,
  `AvailabilityException` ou `TimeBlock` tocada. Nenhum passo existente foi
  removido, renomeado ou enfraquecido. Limite declarado no review: diferente
  dos ensaios do Goal028, os guards de destino descartável deste ensaio não
  têm teste permanente em `scripts/tests/` — existem em
  `resolveRehearsalPlan`/`refuse` e foram exercitados por controle negativo
  manual.
- A execução hospedada dos workflows ainda não ocorreu; o estado atual é
  "configuração validada localmente". Ver [MIGRATION_STATUS](MIGRATION_STATUS.md).
