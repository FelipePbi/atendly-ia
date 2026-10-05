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
| `validate:core` | Build de `packages/public-api-contract` (antes de BFF e frontend, desde o Goal035); builds de Scheduling, IA, BFF e frontend; `npm run check` do health-worker; suíte da IA; suíte do adapter HTTP do frontend; `go build`/`go vet`/`go test` do Evolution Go; testes dos próprios scripts de gate; auditoria estática; a reprodução de A-03 (`repro:a03-contract-drift`) | Qualquer escrita em banco. Nenhum passo abre conexão de banco. A verificação de resposta do BFF contra o contrato **não** roda aqui — ela liga dentro da suíte de integração do BFF (`test:bff`, fora de produção), nunca em `validate:core` |
| `validate:integration` | 35 passos contra um PostgreSQL descartável: geração de client Prisma, migrations, a suíte de integração do BFF, a suíte de integração do Scheduling, a persistência da IA, a purga de conteúdo de conversa (Goal023) e a purga por negócio da IA (Goal025), o outbox do Evolution Go, um ensaio por migration de Goal — o mais recente deles `rehearse:goal027-calendar-source-migration` —, a reconciliação do fuso único do negócio (`rehearse:goal029-timezone-reconciliation`, Goal029) e, desde o Goal028, o ensaio de release (`rehearse:goal028-release-migrations`) e o de dump/restore (`rehearse:goal028-restore`); desde o Goal030, o percurso único de produto ponta a ponta (`rehearse:goal030-mvp-journey`); desde o Goal032, a resposta automática ponta a ponta (`rehearse:goal032-auto-reply`); desde o Goal033, o gate renderizado nas telas autenticadas de `AUTHENTICATED_ROUTES` — sete até o Goal062, oito desde o Goal063, com `/configuracoes/ia` — (`rehearse:goal033-authenticated-ui`, último da lista) | Envio real por WhatsApp e origem real do Minha Agenda, em qualquer passo. Jornada de interface passou a ter cobertura **parcial**, só pelo que o Goal033 mede — ver a nota abaixo |
| `git diff --check` | Espaço em branco/conflito no diff | Correção do diff |

Comandos auxiliares: `npm run test:gate` (só os testes dos scripts de gate) e
`npm run smoke:final-audit` (só a auditoria estática).

**Fidelidade visual ao protótipo.** `npm run visual:compare -- --target <códigos>`
renderiza o quadro do protótipo aprovado e a rota do app no mesmo tamanho, nos
quatro devices (mobile 402×812, tablet 768×1024 e 1024×768, desktop 1366×768).
Ele grava, por alvo, as duas capturas, o diff e o lado a lado em
`apps/frontend/e2e-results/visual/`. O mapa de quadro para rota fica em
`apps/frontend/e2e/visual/targets.json`. O comando precisa do BFF local rodando
e usa uma conta de teste semeada com os dados fictícios do protótipo. **Não é um
gate de pass/fail:** a porcentagem é tendência. Num Goal que declara
`Quadros do protótipo:`, o loop obriga o Developer e o revisor a abrir as
imagens, e uma divergência visível é blocker (ia-loop V33). Isso substitui, para
esses Goals, a "conferência humana" que as seções antigas citam.

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
`apps/frontend` e `apps/health-worker`). Desde o Goal035, `apps/bff` e
`apps/frontend` resolvem `@avenly-ia/public-api-contract` como dependência
`file:` com `install-links=true` (`apps/bff/.npmrc`, `apps/frontend/.npmrc`):
o npm copia o pacote para `node_modules` — o que mantém uma só cópia de Zod
por app — e executa o `prepare` do pacote
(`npm ci --ignore-scripts && npm run build`) nessa cópia, de modo que o
`npm ci` de cada app já produz `dist/`. `packages/public-api-contract` não
precisa de `npm ci` próprio antes do gate, e `dist/` continua fora do Git.
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
psql -h 127.0.0.1 -p 55432 -U pgtest -d postgres -c "CREATE DATABASE avenly_bff_test;"
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
BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/avenly_bff_test" npm run validate:integration
```

São 33 passos. A lista abaixo enumera o núcleo, na ordem em que roda — o item
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

`rehearse:goal030-mvp-journey` (Goal030, diff030 — [D-046](DECISIONS.md)), o
passo mais novo e o último da lista, é o único que não ensaia uma migration:
ele sobe o BFF, o Scheduling e a IA reais em três bancos descartáveis PRÓPRIOS
(não os do trio acima) e atravessa, com um único tenant, o percurso inteiro do
produto — cadastro e sessão pelo caminho de produção, onboarding nos quatro
blocos com as três recusas por mínimo faltando, catálogo, cliente, agendamento
com ocupação refletida, mensagem recebida pelo transporte durável, lembrete
programado, notificação central, alteração de fuso pelo mecanismo do Goal029,
retenção com purga e exclusão de conta recuperável até o fim. **O que ele
prova, e que nenhum outro passo prova:** a composição das fatias — que
onboarding, catálogo, agenda, conversa, lembrete, notificação, fuso, retenção e
exclusão continuam encaixando quando um negócio real os atravessa na ordem em
que uma pessoa os atravessaria, cada etapa provada por leitura direta do banco
do serviço dono do dado, nunca só pelo `200` da resposta HTTP. Um controle
negativo (`GOAL030_BREAK_LINK`) prova que o ensaio cai com `exit 1` quando
qualquer um dos nove elos declarados deixa de acontecer. **O que ele não
prova:** a resposta automática da IA — o grafo, o modelo e o envio pelo
transporte — porque o provedor de modelo é um dublê que lança se chamado; o
envio real por WhatsApp, porque o vínculo do canal é sintético e a Evolution Go
nunca é contactada; e nada sobre a origem real do Minha Agenda, que este
percurso não usa. Ver
[DATA_MIGRATION §17](DATA_MIGRATION.md#17-percurso-único-de-produto-ponta-a-ponta-goal030).

`rehearse:goal032-auto-reply` (Goal032, diff032 — [D-048](DECISIONS.md)), o
passo mais novo e o último da lista, fecha a lacuna que o passo acima deixou
declarada em aberto: sobe o orquestrador de IA real, com
`INBOX_WORKER_ENABLED` **ligado**, contra um banco descartável **próprio**
(não o do trio de migrations nem o do percurso do Goal030), e entrega a
mensagem pelo caminho de produção inteiro — `POST /webhooks/evolution` real →
`ProcessedEvent` gravado antes do `202` → claim pelo worker real →
`InboundEventDispatcher` **sem** `buildProcessor` injetado →
`buildInboundMessageProcessor` — grafo, assistente, sessão, memória e
ferramentas reais → `EvolutionProvider` real chamando o dublê de transporte.
**O que ele prova, e que nenhum outro passo prova:** por leitura direta do
banco e pelo que o dublê de transporte recebeu, que existe exatamente uma
`Message` `OUTBOUND` com o texto que o dublê de modelo produziu naquela
execução, que o transporte recebeu exatamente um envio com esse texto para o
telefone do contato, e que a linha `OUTBOUND` já existia quando o transporte
foi chamado — a ordem do G-09 conferida na execução. Um controle negativo
(`GOAL032_BREAK_LINK`) prova que o ensaio cai com `exit 1` quando qualquer um
dos quatro elos obrigatórios (controle humano, `Ignorar IA`, idempotência,
supersede) deixa de acontecer; os dois primeiros também provam que o dublê de
modelo não é chamado. **O que ele não prova:** nenhuma chamada a provedor de
LLM real nem a WhatsApp real — **M4** (envio real a número real) continua
aberto como gate operacional —, o laço de ferramentas contra o Scheduling
real, áudio, mídia e grupo, nem nada sobre a origem real do Minha Agenda. Ver
[DATA_MIGRATION §18](DATA_MIGRATION.md#18-resposta-automática-provada-ponta-a-ponta-goal032).

`rehearse:goal033-authenticated-ui` (Goal033, diff033 — [D-049](DECISIONS.md)),
o passo mais novo e o último da lista, fecha **A-02**
([FINAL_AUDIT §10](FINAL_AUDIT.md#10-fechamento-de-a-02--goal033-2026-09-20)):
sobe o BFF, o Scheduling e a IA reais em três bancos descartáveis **próprios**
(não os de nenhum passo acima), semeia um negócio inteiramente pelas rotas do
produto, constrói o frontend com `NEXT_PUBLIC_BFF_URL` embutida e o serve em
porta fixa própria, e entrega ao Playwright um e-mail e uma senha para digitar
em `/login` — nenhuma sessão fabricada. **O que ele prova, e que nenhum outro
passo prova:** as cinco medidas do gate renderizado — overflow horizontal,
alvo de toque mínimo AA, contraste real computado, foco visível e
`prefers-reduced-motion` — sobre as sete telas que só existem para quem está
autenticado (`/inicio`, `/agenda`, `/clientes`, `/conversas`,
`/configuracoes`, `/servicos`, `/notificacoes`), com a mesma régua
(`apps/frontend/e2e/measure.ts`) que o gate público usa, nunca uma cópia mais
frouxa. Um controle negativo, no padrão dos passos acima, prova que overflow,
alvo de toque, contraste e login quebrado cada um derruba o gate ou o ensaio
com falha nomeada. **O que ele não prova:** fidelidade visual à referência
aprovada — segue sendo conferência humana sobre o screenshot anexado —, nem
M4, nem nada sobre a origem real do Minha Agenda. **`validate:ui` não mudou**:
continua as mesmas sete rotas públicas, as mesmas cinco larguras, `npm run
start` e nenhuma pré-condição de banco — amarrar o gate público a PostgreSQL
transformaria o único gate renderizado sem pré-condição em mais um passo
dependente de ambiente. Ver
[DATA_MIGRATION §19](DATA_MIGRATION.md#19-gate-renderizado-nas-telas-autenticadas-goal033).

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
cd E:/Projetos/relay-loop-ia                    # o harness vive fora deste repositório
npm run ia-loop:resources                      # lista o que ainda está vivo
npm run ia-loop:resources:cleanup -- --dry-run  # plano de limpeza, sem mutação
```

Ver `docs/ENGINEERING_LOG.md` do `relay-loop-ia` (seção "V15 — Temporary Resource Lifecycle") para o
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

## Checks estáticos novos do Goal034

Dois checks novos em `audit:static` (`scripts/final-production-audit.mjs`),
cada um função pura exportada e provado nos dois sentidos por
`scripts/tests/final-production-audit-legacy-regression.test.mjs`. Nenhum dos
dois abre banco, sobe serviço ou executa o produto — os dois são leitura de
texto com expressão regular, no mesmo padrão dos checks existentes.

| Check | O que decide | O que não decide |
| --- | --- | --- |
| `group_discard_is_not_configuration` (`findGroupDiscardConfigurationViolations`) | Sobre `apps/**`: falha se o literal `EVOLUTION_IGNORE_GROUPS` reaparecer em qualquer arquivo, ou se algum `if (...)` cuja condição contenha `isGroup` também contiver `env`, `process.env` ou `config` — a mesma forma de regressão sob outro nome de variável | Não prova que o descarte de grupo acontece cedo o bastante no fluxo (isso é `apps/ai-orchestrator/tests/channel/inbound-message-processor.test.ts`, passo `test:ai-orchestrator`), nem que a resposta da IA recusa destino de grupo no despacho (isso é a suíte de `message-graph.ts`, mesmo passo). É guarda de regressão sobre o texto-fonte, não prova de comportamento em execução |
| `frontend_has_no_dark_theme_css` (`findDarkThemeCssReferences`) | Sobre o CSS de `apps/frontend/src`: falha se algum arquivo contiver `prefers-color-scheme: dark` ou um seletor comum de alternância manual de tema escuro (`[data-theme="dark"]`, `.dark`, `:root.dark`, `html.dark`) | Não prova que nenhuma tela **parece** escura — cor pode ser escrita sem media query nem seletor de tema; e não impede alguém de escrever CSS de tema escuro fora de `apps/frontend/src`. É a mesma classe de guarda que os demais checks estáticos: gate contra a forma reconhecida de regressão, não contra toda forma possível |

## Checks estáticos novos do Goal035

Dois checks novos em `audit:static` (`scripts/final-production-audit.mjs`),
cada um função pura exportada e provado nos dois sentidos por
`scripts/tests/final-production-audit-legacy-regression.test.mjs`. Nenhum dos
dois abre banco, sobe serviço ou executa o produto — os dois são leitura de
texto com expressão regular, no mesmo padrão dos checks existentes.

| Check | O que decide | O que não decide |
| --- | --- | --- |
| `public_api_route_coverage` (`findUncoveredPublicApiRoutes`) | Toda rota `/v1` registrada em `apps/bff/src` (`app.<verbo>("/v1/...")`) que tem pelo menos um chamador (`routeSchema(...)`) em `apps/frontend/src/data/services` precisa de entrada em `packages/public-api-contract/src/routes.ts`. O conjunto de rotas sem chamador é **computado e impresso** no `details`, nunca mantido como lista escrita à mão | Não prova que o schema da entrada descreve corretamente o que a rota devolve — isso é o check de runtime abaixo. Não decide sobre rota sem chamador nenhum: essas ficam fora da tabela por definição, não por omissão. **Não enxerga rota cujo path não seja literal entre aspas**: o padrão de extração exige `app.<verbo>("/v1/...")`, então as três rotas que `apps/bff/src/modules/conversations/routes.ts` registra em laço por template literal (`takeover`, `release`, `resolve`) são invisíveis aos dois lados da regra — hoje sem lacuna, porque as três têm entrada na tabela e chamador no frontend, mas uma rota futura escrita nessa forma escaparia do check em silêncio ([review035](reviews/035-review.md)) |
| `public_api_response_schema_single_source` (`findDuplicatePublicResponseSchemaDeclarations`) | Nenhum arquivo de `apps/frontend/src` pode declarar (`const nomeSchema = z....`) um schema cujo nome já é exportado por `packages/public-api-contract/src/schemas.ts`. Importar ou reexportar o pacote (como `publicApiSchemas.ts` faz) não aciona a regra | Não impede um schema de nome diferente, mas de forma equivalente, de ser declarado fora do pacote — a regra compara nome, não estrutura |

A verificação de **runtime** correspondente não é `audit:static`: é o hook
`onSend` de `apps/bff/src/lib/response-contract.ts`
(`registerResponseContractCheck`), que compara o `data` já serializado contra
a entrada da rota e derruba o processo com `ResponseContractViolationError`
nomeando rota, método e campo divergente quando os dois lados discordam. Ela
só liga fora de `NODE_ENV=production` (`RESPONSE_CONTRACT_CHECK_ENABLED`) —
**a verificação de resposta não roda em produção**, de propósito: um corpo
divergente já saiu do handler quando o hook o vê, e transformar isso em `500`
trocaria um bug de contrato por uma indisponibilidade real para quem está
comprando. Ela não prova que a tabela está completa (isso é
`public_api_route_coverage`, acima) nem que nenhum outro arquivo declarou
schema fora do pacote (isso é `public_api_response_schema_single_source`) —
ela só prova, quando ligada, que o que já foi decidido bate com o que o BFF
devolveu naquela chamada. Ela também não vê resposta que não seja texto: o
hook sai antes de comparar quando o payload não é string, o que deixa de fora
`GET /v1/conversations/:id/messages/:messageId/media` (bytes crus, fora do
envelope) — a entrada `z.unknown()` dessa rota na tabela **documenta** a
exceção, não a verifica ([review035](reviews/035-review.md)).

`validate:core` ganhou o passo `build:public-api-contract`
(`node scripts/build-public-api-contract.mjs`), posicionado antes de
`build:bff` e `build:frontend` — `scripts/tests/gate.test.mjs` afirma a
precedência — e o passo `repro:a03-contract-drift`
(`apps/bff/tests/goal030-a03-contract-drift.repro.mjs`), depois de
`audit:static`. O passo de build não roda só `tsc`: ele também atualiza a
cópia do pacote em `apps/bff/node_modules` e `apps/frontend/node_modules`.
Com `install-links=true` a cópia é congelada no instante da instalação, e sem
essa atualização o gate compilaria a fonte nova e continuaria medindo o
pacote instalado antes dela.

O que este passo **não** decide: ele não instala dependência de app nenhum,
não toca lockfile e não verifica que a cópia instalada veio de um `npm ci`
recente — ele a sobrescreve a partir do `dist/` recém-construído.

## Checks estáticos novos do Goal036

Um check novo em `audit:static` (`scripts/final-production-audit.mjs`),
função pura exportada e provado nos dois sentidos por
`scripts/tests/final-production-audit-legacy-regression.test.mjs`. Mesmo
padrão dos checks anteriores: leitura de texto com expressão regular, sem
abrir banco, subir serviço ou executar o produto.

| Check | O que decide | O que não decide |
| --- | --- | --- |
| `bff_v1_routes_use_literal_paths` (`findNonLiteralV1RouteRegistrations`) | Falha se algum arquivo de `apps/bff/src` registrar rota `/v1` com `` app.<verbo>(`/v1/...`) `` — path entre crases, com ou sem interpolação — em vez de path literal entre aspas. É a forma exata que deixava `apps/bff/src/modules/conversations/routes.ts` (`takeover`, `release`, `resolve`, registradas em `for` sobre uma lista de nomes de ação) invisível para `public_api_route_coverage`, abaixo | Não decide se a rota tem chamador no frontend nem se tem entrada na tabela — isso continua sendo `public_api_route_coverage`. Não cobre path não literal do **lado do frontend**: `FRONTEND_ROUTE_SCHEMA_CALL_PATTERN`, usado por `public_api_route_coverage`, também exige path literal entre aspas no segundo argumento de `routeSchema(...)`, e as mesmas três rotas são chamadas por `apps/frontend/src/data/services/BffConversationService.ts:171` com `` routeSchema<Conversation>("POST", `/v1/conversations/:id/${action}`) `` — crase do lado do frontend. Hoje isso não é lacuna real, porque a tabela já tem as três entradas e ambos os chamadores existem de fato; o check só passou a reportá-las como "sem chamador no frontend" (correto para o que ele consegue ler, incorreto sobre o produto) depois que este check as tornou visíveis do lado do BFF ([FINAL_AUDIT §13](FINAL_AUDIT.md#13-fechamento-de-a-20-a-a-23--goal036-2026-09-20)) |

`public_api_route_coverage` (do Goal035) não mudou de comportamento, só de
entrada: com as três rotas de `conversations/routes.ts` agora extraídas do
lado do BFF, `bffV1RouteRegistrations` passa de um número menor para
**116**, e as três aparecem no `details` do check como rotas "sem chamador
no frontend (entrada na tabela não exigida)" — não porque não tenham
chamador de fato, mas porque o padrão de extração do lado do frontend
também exige path literal, e o limite acima descreve exatamente isso.

A verificação de **runtime**, `apps/bff/src/lib/response-contract.ts`
(`registerResponseContractCheck`), ganhou uma segunda direção de
comparação: além do que o Goal035 já derrubava (campo faltando, tipo errado,
valor fora do vocabulário — o que o `safeParse` acusa), ela agora compara o
`data` emitido com o `data` que o `safeParse` devolveu e reprova toda chave
que o parse removeu em silêncio, em qualquer profundidade — objeto aninhado,
elemento de array e o lado da união que efetivamente parseou.
`z.record`, `z.unknown`, `z.any`, `.passthrough()` e `.catchall()` continuam
sem gerar achado, porque para esses tipos nenhuma chave é removida. **Isto
fecha o limite que o Goal035 tinha registrado** — campo a mais chegava a
sair verde no controle negativo daquela rodada — e não decide nada novo
sobre o resto do contrato: continua sendo o mesmo hook único, com o mesmo
teto de issues reportadas, a mesma mensagem e o mesmo desligamento fora de
`NODE_ENV=production` (`RESPONSE_CONTRACT_CHECK_ENABLED`) — **a verificação
de resposta continua não rodando em produção**, pelo mesmo motivo do
Goal035: um corpo divergente já saiu do handler quando o hook o vê, e
recusá-lo ali trocaria um bug de contrato por uma indisponibilidade real.

## Mudança de semântica do gate `rehearse:goal033-authenticated-ui` (Goal036)

O diff036 muda como `scripts/goal033-authenticated-ui-rehearsal.mjs` escolhe
o dia medido, sem mudar o que o gate prova (§ acima, "`rehearse:goal033-authenticated-ui`").
Antes, `measuredDate` vinha de `localIsoDate(new Date(), SEED.timezone)` — o
dia de hoje no fuso do negócio, no instante da semeadura — e a consulta a
`GET /v1/availability` pedia só esse dia (`days=1`). Perto da virada da meia-noite
do negócio, a duração do serviço podia não caber mais no dia corrente, e o
passo falhava com "the agenda offered no slot on the measured day" mesmo
havendo capacidade real no dia seguinte.

Agora a consulta pede dois dias (`days=2`), `offered[0]` (o primeiro horário
livre em ordem cronológica, o mesmo que a interface ofereceria) decide o
agendamento, e `measuredDate` passa a vir de `offered[0].date` — nunca mais
de `new Date()` congelado no instante da semeadura. Isso é seguro porque a
subida do frontend (`next build` + servidor) roda depois da semeadura e
sempre consome minutos: quando o Playwright abre a Agenda, o relógio do
navegador já alcançou o dia escolhido, mesmo quando esse dia é "amanhã" na
hora da semeadura. `apps/frontend/e2e/authenticated-matrix.spec.ts` reflete
essa mudança do lado do consumidor: exige `GOAL033_MEASURED_DATE` (novo,
ao lado de `GOAL033_GATE_BASE_URL`, `GOAL033_EMAIL`, `GOAL033_PASSWORD` e
`GOAL033_SEED`) e, só para a rota `agenda`, navega a grade do dia até
`MEASURED_DATE` antes de medir — clicando "Próximo dia" ou "Dia anterior"
pela diferença entre o dia que o navegador abriu e o dia semeado — porque a
Agenda sempre monta no `new Date()` do navegador, não no dia escolhido pela
semeadura.

**O que muda:** o gate deixa de poder falhar por semeadura perto da virada
da meia-noite do negócio, porque agora sempre mede o primeiro horário livre
real, qualquer que seja o dia. **O que não muda:** as cinco medidas do gate
renderizado, as sete telas, a régua (`apps/frontend/e2e/measure.ts`) e o
controle negativo — nenhum deles foi tocado por este diff.

## Checks estáticos novos do Goal037

Um check novo em `audit:static` (`scripts/final-production-audit.mjs`),
função pura exportada e provado nos dois sentidos por
`scripts/tests/final-production-audit-legacy-regression.test.mjs`. Mesmo
padrão dos checks anteriores: leitura de texto com expressão regular, sem
abrir banco, subir serviço ou executar o produto.

| Check | O que decide | O que não decide |
| --- | --- | --- |
| `frontend_v1_route_schema_calls_use_literal_patterns` (`findNonLiteralFrontendV1RouteSchemaCalls`) | Sobre `apps/frontend/src/data/services`: falha se `routeSchema<T>("MÉTODO", ...)` declarar o segundo argumento como um padrão `/v1/...` entre crases, em vez de path literal entre aspas. É a forma exata que deixava `BffConversationService.ts` (`takeover`, `release`, `resolve`, chamadas por um `mutateState` único que montava o path por template literal) invisível ao lado do frontend de `public_api_route_coverage` — o mesmo limite que [FINAL_AUDIT §13](FINAL_AUDIT.md#13-fechamento-de-a-20-a-a-23--goal036-2026-09-20) e [D-052](DECISIONS.md#d-052--rigidez-do-contrato-mora-no-produtor-campo-declarado-é-opcional-quando-o-produtor-pode-omiti-lo-e-rota-v1-exige-path-literal-propostas-no-goal036) tinham registrado sem virar achado | Não decide se a rota tem entrada na tabela do pacote nem se o BFF a registra com path literal — isso continua sendo `bff_v1_routes_use_literal_paths` (Goal036) e `public_api_route_coverage` (Goal035). Só cobre chamada dentro de `apps/frontend/src/data/services` para um padrão que comece com `/v1/`; path construído fora desse diretório, ou para uma rota que não seja `/v1`, não aciona a regra |

Com as três rotas de `BffConversationService.ts` agora chamadas com path
literal, elas deixam de aparecer no `details` de
`public_api_route_coverage` como "sem chamador no frontend" — o detalhe que
[FINAL_AUDIT §13](FINAL_AUDIT.md#13-fechamento-de-a-20-a-a-23--goal036-2026-09-20)
tinha registrado como limite de ferramenta, nunca achado, some junto com a
causa que o produzia.

## Invariante de texto ampliada do Goal037

`PRODUCT_OWN_TEXTS`, o conjunto fechado dos textos que o produto emite por
conta própria sem passar pelo modelo (D-050, Goal034), cobria só
`apps/ai-orchestrator/src/modules/assistant/assistant.service.ts`. O teste de
fechamento varria apenas literais dentro de `messages: [...]` desse arquivo —
uma observação não bloqueante do [review034](reviews/034-review.md) já
registrava que um texto de cliente emitido por outro módulo, de outra forma
(`text: identificador`), escaparia do fechamento em silêncio.

| O que decide | O que não decide |
| --- | --- |
| Os seis textos de cliente que `apps/ai-orchestrator/src/modules/graph/message-graph.ts` despacha por `text:` — direto (`unsupportedMessageReply`, `processingErrorReply`, `audioNotUnderstoodReply`, `imageReceivedReply`, `documentReceivedReply`, `videoReceivedReply`) ou por função que só retorna uma dessas constantes (`unsupportedReplyFor`) — pertencem a `PRODUCT_OWN_TEXTS`, com o mesmo teste permanente que reprova vocabulário de espera nesse conjunto e o mesmo fechamento que acusa texto novo ausente | `imageHandoffSummary` fica fora, de propósito: é o resumo gravado no `Handoff`, nunca o texto que a cliente recebe. Não cobre texto emitido pelo **modelo** — a fronteira que D-050 já tinha declarado entre garantia de código (absoluta, testada) e orientação de prompt (não verificável por eval determinístico) não muda. Não cobre um terceiro módulo que venha a emitir texto de cliente fora destes dois: o extrator novo lê identificador de constante de módulo e corpo de função que só retorna identificador — uma forma de despacho diferente dessas duas continuaria escapando, como o review034 já tinha avisado para a primeira |

`VOCABULARIO_DE_ESPERA` — a mesma expressão regular, antes duplicada em
`tests/assistant/assistant.service.test.ts` e em
`tests/evals/waiting-message-vocabulary.eval.test.ts` — vira uma definição
única em `tests/support/vocabulario-de-espera.ts`, importada pelas duas. As
duas cópias podiam divergir sem que nada acusasse; a definição única não
muda o que o vocabulário cobre, só onde ele mora.

## Declaração de retentativa do Goal037

`scripts/goal033-authenticated-ui-rehearsal.mjs` lê
`e2e-results/authenticated/results.json` — o relatório JSON que
`playwright.authenticated.config.ts` já escreve — depois que o gate
autenticado termina, e extrai todo teste marcado `status: "flaky"`
(`extractRetriedTests`): falhou numa tentativa, passou numa seguinte. As 35
medidas de `authenticated-matrix.spec.ts` compartilham o mesmo título de
teste (`"measured, logged in"`), um por `test.describe(route.name, ...)`;
`extractRetriedTests` inclui a cadeia de `suites` ancestrais (o nome da rota)
no título retornado, então duas retentativas do mesmo título em rotas
diferentes continuam distinguíveis no log.

| O que decide | O que não decide |
| --- | --- |
| Projeto e título de cada teste retentado aparecem no log do ensaio, sempre — inclusive "0" quando nenhum teste precisou de retentativa. `readGateReport` recusa com erro nomeado (`AuthenticatedUiRehearsalError`) quando o relatório está ausente ou não é JSON válido: um leitor que se cala diante de relatório quebrado reintroduziria a retentativa invisível que este delta fecha | **Não reprova o gate.** O processo continua saindo `0` quando toda retentativa passou na segunda tentativa — a mesma semântica de antes, `retries: 1, 2` do Playwright continua ativo e nenhum teto de retentativa mudou. Declarar a retentativa é diagnóstico, não critério de aceite: um `flaky` visível no log ainda é um `expected` no veredito do gate |

A investigação desta rodada também mede a causa do `flaky` já registrado em
[FINAL_AUDIT §10](FINAL_AUDIT.md#10-fechamento-de-a-02--goal033-2026-09-20)
como "timing de execução". §10 atribuiu esse `flaky` a `/agenda`,
`desktop-1440`, por leitura manual da estrutura de `suites` daquela execução
— não pelo `extractRetriedTests` desta rodada, que na sua primeira versão
colapsava todo título no mesmo `"measured, logged in"` e não teria conseguido
confirmar qual rota retentou. A causa medida agora não é uma propriedade da
rota: o log de requisições do BFF mostra as 35 medidas do gate autenticado
perto do teto de `@fastify/rate-limit` (`max: 300, timeWindow: "1 minute"`,
por IP, sem allow list) — 285 a 294 requisições numa janela de 60s, 95% a
98% do orçamento. Cruzá-lo faz `GET /v1/auth/session` ou a leitura de lista
da própria tela devolver `429`, que a interface trata como erro de sessão ou
de tela — daí a falha na primeira tentativa e o passe na segunda, depois que
a janela vira; qual das 35 medidas cruza o teto depende de quando ela cai na
janela de execução, não da rota que mede. `apps/frontend/e2e/authenticated-matrix.spec.ts`
passa a ler `x-ratelimit-remaining`/`x-ratelimit-reset` das respostas que a
página já recebe e espera a janela virar antes de qualquer teste — de
qualquer rota — que começaria com menos de 30 requisições de orçamento
restante. **O que isso não decide:** o limite do produto não muda —
`@fastify/rate-limit` continua `max: 300` por minuto, por IP, decisão do
produto e fora do escopo deste delta; esperar o orçamento evita que o
**gate** meça o próprio throttle por engano, não afrouxa nenhuma medida nem
pula nenhuma asserção.

## Checks estáticos ampliados do Goal038

Os dois checks de path literal `/v1` do Goal036/Goal037
(`bff_v1_routes_use_literal_paths`, `frontend_v1_route_schema_calls_use_literal_patterns`)
e a extração que `public_api_route_coverage` (Goal035) usa deixam de exigir
uma forma acidental do chamador/registro e passam a **enumerar cada
ocorrência candidata**, classificando-a em categoria nomeada. Nenhum check
novo entrou; os três existentes ganham enumeração, mesma função pura
exportada, mesmo par de arquivos, provados nos dois sentidos por
`scripts/tests/final-production-audit-legacy-regression.test.mjs`.

| O que decide agora | O que não decide |
| --- | --- |
| Do lado do BFF, `classifyBffRouteRegistrationSites` classifica toda chamada `<receptor>.<verbo>(` em `literal_v1_path` (registro reconhecido, entra na cobertura), `literal_other_path`, `template_other_path` ou `not_a_route_registration` (categorias declaradas, fora de escopo), ou em `template_v1_path` / `non_literal_path_expression` — **resíduo**, que reprova o check nomeando arquivo e linha. Do lado do frontend, `classifyFrontendRouteSchemaCallSites` classifica toda chamada de `routeSchema`, com ou sem o genérico `<T>`, em `literal_pattern` / `template_other_pattern` (declaradas) ou em `template_v1_pattern` / `non_literal_pattern` (**resíduo**). O receptor não precisa se chamar `app` e a chamada não precisa de genérico — nem o nome do receptor nem o genérico nunca definiram se a rota existe. A terceira forma, path vindo de constante ou identificador, deixa de escapar dos dois lados ao mesmo tempo. Sobre a árvore real: `bff_v1_routes_use_literal_paths` `ok: true` (65 arquivos, 142 sítios — `literal_other_path=4, literal_v1_path=116, not_a_route_registration=22`), `frontend_v1_route_schema_calls_use_literal_patterns` `ok: true` (17 arquivos, 116 sítios — `literal_pattern=116`), resíduo zero nos dois, e `public_api_route_coverage` continua `ok: true` (116 rotas registradas, só a rota de mídia sem chamador) | Continua não provando que o schema da entrada descreve corretamente o que a rota devolve (isso é o hook de runtime, Goal035). **Nenhuma allowlist por arquivo, rota ou linha entrou em nenhuma regra**: o conjunto reconhecido continua computado, nunca escrito à mão. O critério que separa candidato de não candidato também é computado e não olha a forma do handler — comentário é zerado antes da enumeração (`blankComments`), e uma chamada com um único argumento, ou cujo valor alguém consome (atribuição, `await`, `return`, argumento de outra chamada), não registra rota —, então import, comentário, literal de teste, erro técnico, chave de log, nome de nó do grafo, `mapa.get(chave)`, leitura de header e cliente HTTP com corpo não podem virar resíduo destes checks, enquanto `app.get(PATH, handleThing)`, com o handler passado por referência, é registro reconhecido |

## Invariante de texto classificada do Goal038

Os dois extratores de texto de cliente do fechamento do Goal034/Goal037
(`extractMessagesArrayLiterals` sobre `assistant.service.ts`,
`extractDispatchedModuleConstantTexts`/`classifyDispatchedTextSites` sobre
`message-graph.ts`) deixam de reconhecer só por não acusar o resto: cada
ocorrência candidata cai em exatamente uma categoria nomeada no código, ou é
resíduo, e resíduo derruba o teste de fechamento nomeando arquivo e linha —
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`, sem
alteração em `apps/ai-orchestrator/src/`.

| O que decide agora | O que não decide |
| --- | --- |
| Sobre `assistant.service.ts`: `classifyMessageExpressionSites` classifica cada expressão dentro de `messages: [...]` em `quoted_literal`, `fixed_text_reference`, `dynamic_turn_value_with_fixed_text_fallback` (o `\|\|` cujo lado direito resolve a `PRODUCT_OWN_FIXED_TEXTS.<chave>`) ou `style_greeting_builder` (`buildStyleGreeting(...)`, resolvida para o texto de cada estilo de `AI_CONVERSATION_STYLES`); forma fora dessas quatro é resíduo e derruba o fechamento nomeando arquivo e linha, em vez de virar `[]` em silêncio. Confirmado sobre a árvore real: 6 sítios, `{quoted_literal: 0, fixed_text_reference: 4, dynamic_turn_value_with_fixed_text_fallback: 1, style_greeting_builder: 1}`, 8 textos resolvidos, resíduo zero. O fechamento ganha piso: reprova se resolver menos textos do que sítios `messages: [...]` o arquivo tem, em vez de ficar verde por não enxergar nada. Sobre `message-graph.ts`: cada sítio `text:` é constante de módulo resolvida (entra em `PRODUCT_OWN_TEXTS`), expressão dinâmica do turno (`state.*`/`message.*`) ou anotação de tipo (`text: string`) — as duas últimas descartadas por pertencer a categoria declarada, não por sobrarem. Confirmado sobre a árvore real: 16 sítios, `{module_constant: 3, dynamic_turn_expression: 10, type_annotation: 3}`, resíduo zero | Continua não cobrindo texto emitido pelo **modelo** — a fronteira entre garantia de código e orientação de prompt que D-050 já declarou não muda. Continua não cobrindo um terceiro módulo emissor fora destes dois: uma forma de despacho diferente das reconhecidas aqui continuaria exigindo extensão própria, não resíduo automático. **Não é aviso**: forma candidata fora das categorias nomeadas derruba o teste de fechamento, com identificação de arquivo e linha — um resíduo que só imprime seria a mesma cegueira com mais texto. `imageHandoffSummary` nunca é candidato: despachado via `handoffSummary:`, não via `text:`, fora do padrão que os dois extratores varrem |

`PRODUCT_OWN_TEXTS` não ganha nem perde entrada por este delta: os dois
extratores passam a **ver** textos que já existiam na árvore (referência a
`PRODUCT_OWN_FIXED_TEXTS`, saudação de estilo, constante de módulo já
despachada), nunca a produzir texto novo.

## Conjunto de emissores de texto do Goal039

O Goal038 fechou a forma dentro de dois arquivos escolhidos à mão
(`assistant.service.ts`, `message-graph.ts`). O escopo de **quais** arquivos
um guard olha era, ele próprio, a mesma allowlist escrita à mão que o
Goal038 tinha proibido dentro das regras — um nível acima delas. Este delta
troca a lista de dois arquivos por uma leitura de
`apps/ai-orchestrator/src` inteiro.

| O que decide agora | O que não decide |
| --- | --- |
| `discoverSendTextSites` (`apps/ai-orchestrator/tests/support/send-text-sites.ts`, novo) lê `apps/ai-orchestrator/src` recursivamente e classifica toda ocorrência de `sendText(` em `port_declaration`, `adapter_implementation`, `product_own_text_to_customer`, `text_in_transit_named_origin` (com a origem nomeada) ou `person_typed_text`; ocorrência fora dessas cinco é resíduo e derruba o teste, nomeando arquivo e linha. Sobre a árvore real: **7** sítios, `{port_declaration: 1, adapter_implementation: 1, product_own_text_to_customer: 2, text_in_transit_named_origin: 2, person_typed_text: 1}`, resíduo zero — os cinco envios reais mais a porta e o adapter | Continua não cobrindo um canal de saída de texto que não seja `sendText` sobre `WhatsAppProvider` — um adapter que enviasse texto por um método diferente não seria descoberto por este descobridor específico, exigiria extensão própria. **Não é allowlist**: nenhum arquivo, módulo ou linha é nomeado no código do descobridor — só o `srcRoot` de partida e o padrão textual `sendText(`. Log, erro técnico, payload interno, anotação de tipo (`ReturnType<WhatsAppProvider["sendText"]>`) e chamada com outro nome (`sendTextMessage`) não são candidatos, provado por teste |

## Guardrail de espera sobre o texto do lembrete e do aviso de alteração

`notification-message.ts` compõe, sem chamada de modelo, o único texto
próprio do produto que chega à cliente **sem** que ela tenha escrito nada
antes — e não estava em `PRODUCT_OWN_TEXTS` nem passava por
`VOCABULARIO_DE_ESPERA`. Este delta fecha essa lacuna na camada de teste,
sem tocar `apps/ai-orchestrator/src/`.

| O que decide agora | O que não decide |
| --- | --- |
| `classifyNotificationTextSites` (`apps/ai-orchestrator/tests/support/notification-message-sites.ts`, novo) classifica cada sítio que produz texto em `notification-message.ts` em `style_voice_greeting_ternary`, `style_voice_static_literal`, `factual_change_notice_ternary` ou `factual_single_template`; forma fora dessas quatro é resíduo com arquivo e linha. Sobre o arquivo real: **12** sítios, `{style_voice_greeting_ternary: 3, style_voice_static_literal: 6, factual_change_notice_ternary: 1, factual_single_template: 2}`, resíduo zero. Em paralelo, `NOTIFICATION_MESSAGE_TEXTS` executa `composeNotificationText`/`notificationFactualLines` (exports já existentes) sobre fatos declarados no teste — saudação com/sem nome, confirmação e fechamento nos três estilos de `AI_CONVERSATION_STYLES`, e as seis formas factuais (lembrete/cancelamento/alteração, com/sem valor) — e entra em `VERIFIED_CLIENT_TEXTS` ao lado de `PRODUCT_OWN_TEXTS`. Todo item de `VERIFIED_CLIENT_TEXTS` é conferido contra `VOCABULARIO_DE_ESPERA` (definição única, `tests/support/`) | Continua não cobrindo texto emitido pelo **modelo** — mesma fronteira que D-050 já declarou. **`ACTIVATION_TEST_NOTICE` e as três falas de cliente simulado (`CLIENT_ASKS_PRICE`, `CLIENT_ASKS_SLOT`, `CLIENT_ACCEPTS_SLOT`) ficam fora deste guardrail, por decisão declarada, não por omissão**: são enumerados em `ACTIVATION_TEST_CHANNEL_TEXTS` na categoria `activation_test_channel`, cada um com o motivo escrito junto — o aviso é dirigido a quem observa o teste, não à cliente do negócio, e as falas são o script que o teste envia como se fosse a cliente, para a IA responder, não resposta do produto —, e um teste confirma que nenhum dos quatro está em `VERIFIED_CLIENT_TEXTS`. `PRODUCT_OWN_TEXTS` não muda: provado por teste que reafirma a lista da baseline |

## Escopo computado do chamador de contrato público do Goal039

`classifyFrontendRouteSchemaCallSites` lia só
`apps/frontend/src/data/services`; uma chamada de `routeSchema` em
qualquer outra pasta não era reconhecida **nem** virava resíduo — sumia da
cobertura e da regra de literalidade ao mesmo tempo. É o terceiro escape
duplo desta série (037 fechou o da crase, 038 o do genérico ausente e do
receptor não-`app`), agora pela pasta.

| O que decide agora | O que não decide |
| --- | --- |
| `classifyFrontendRouteSchemaCallSites` passa a receber `sourceFiles("apps/frontend/src")` inteiro, no lugar de só `data/services`. `function routeSchema<T>(` em `data/http/BffHttpClient.ts` cai na categoria própria `definition` — nunca conta como chamada nem como resíduo, mesmo dentro do escopo lido agora. Uma chamada fora de `data/services` é reconhecida como chamador (entra em `public_api_route_coverage`) ou vira resíduo que reprova `frontend_v1_route_schema_calls_use_literal_patterns`, nomeando arquivo e linha. Sobre a árvore real: `frontend_v1_route_schema_calls_use_literal_patterns` `ok: true` — **194** arquivos, **117** sítios (`definition=1, literal_pattern=116`), resíduo zero —, e `public_api_route_coverage` `ok: true` — **194** arquivos do frontend, **116** rotas do BFF, continua só `GET /v1/conversations/:id/messages/:messageId/media` sem chamador | Continua não provando que o schema descreve corretamente o que a rota devolve (hook de runtime, Goal035). **Nenhuma allowlist por arquivo, rota ou linha entrou**: o conjunto reconhecido continua computado. Não muda o critério de literal/não-literal em si — path vindo de constante ou identificador continua resíduo, dentro ou fora de `data/services` |



## Frescor do relatório compartilhado do Goal038

`scripts/lib/playwright-report.mjs` (novo) concentra `readPlaywrightReport`,
`extractRetriedTests` e `formatRetriesMessage` — leitor único, usado pelo
gate autenticado (`scripts/goal033-authenticated-ui-rehearsal.mjs`) e pelo
gate público (`scripts/validate-ui.mjs`, agora o executor de
`npm run validate:ui`, no lugar de `cd apps/frontend && npm run test:ui`
direto em `package.json`). Duas cópias que pudessem divergir são a mesma
classe de problema que o Goal037 fechou para `VOCABULARIO_DE_ESPERA`.

| O que decide agora | O que não decide |
| --- | --- |
| Os dois gates apagam o `results.json` da execução anterior (`rmSync(..., { force: true })`) antes de subir o Playwright e registram o instante em que começaram (`notBeforeMs`). Depois, o leitor compara o `mtime` do relatório contra esse instante: um relatório mais antigo é recusado com erro nomeado (`AuthenticatedUiRehearsalError` no gate autenticado, `ValidateUiReportError` no gate público) dizendo explicitamente que é de uma execução anterior, não da que acabou de rodar — nos dois gates, mesmo quando o Playwright saiu `0`. Relatório ausente ou ilegível continua falhando como já falhava (D-050/Goal033), agora pelo mesmo leitor nos dois gates | **Não reprova por retentativa, e `flaky` continua terminando com sucesso nos dois gates** — a mesma semântica de antes: o processo continua saindo `0` quando toda retentativa passou na segunda tentativa, `retries: 1` continua inalterado em `playwright.config.ts` e `playwright.authenticated.config.ts`, e declarar retentativa continua sendo diagnóstico no log, nunca critério de aceite. `npm run validate:ui` continua sendo o comando do gate público, continua executando `playwright test` com as cinco larguras da matriz, e o exit code não-zero do Playwright continua sendo o exit code do passo — a checagem de frescor só corre depois, e só derruba o passo quando o Playwright saiu `0` mas o relatório não é confiável |

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
- **Diff030 ([D-046](DECISIONS.md)):** auditoria final do MVP. `validate:integration`
  passou de 32 para 33 passos com `rehearse:goal030-mvp-journey` — ver a nota
  acima e [DATA_MIGRATION §17](DATA_MIGRATION.md#17-percurso-único-de-produto-ponta-a-ponta-goal030).
  Nenhuma migration nova, nenhum passo existente removido, renomeado ou
  enfraquecido. Resultado real dos três gates determinísticos sobre a árvore
  final desta rodada: `validate:core` exit 0 (15 passos: 13 `passed`, 0
  `failed`, 2 `skipped` — `test:bff`, `test:health-worker`); `validate:integration`
  exit 0 em 88652 ms, incluindo o passo novo; `validate:ui` exit 0 em 48878 ms
  (suíte Playwright 47896 ms, 169 `expected`, 21 `skipped` por `test.skip`
  declarado, 0 `unexpected`, 0 `flaky` — ver [FINAL_AUDIT §5](FINAL_AUDIT.md#5-interface--o-que-o-gate-renderizado-decide-e-o-que-ele-não-decide)).
  A auditoria em si não é gate automatizado: é conferência linha a linha da
  árvore, registrada em [FINAL_AUDIT](FINAL_AUDIT.md), com 1 achado
  `BLOQUEADOR-MVP` (A-01) e reprodução executável própria para o achado sem
  cobertura de gate existente (A-03,
  `apps/bff/tests/goal030-a03-contract-drift.repro.mjs`).
- **Diff031 ([ACCEPTED na rodada 4 do review031](reviews/031-review.md)):** a régua de alvo de
  toque de `apps/frontend/e2e/viewport-matrix.spec.ts` mudou o que ela mede,
  sem mudar o que o gate cobre. Continua medindo: só as sete rotas públicas de
  `e2e/routes.ts`, só nas duas larguras com toque (`mobile-360`, `mobile-390`),
  o mínimo AA de 24px (WCAG 2.5.8) como falha e o "confortável" de 44px (WCAG
  2.5.5 AAA) só como anexo informativo. O que mudou é a geometria da medição:
  em vez da caixa isolada do elemento nativo, ela agora mede a caixa do
  `<label>` associado (aninhado ou por `for`/`id`) quando o controle é um
  `<input>` visualmente escondido (`opacity: 0`, `visibility: hidden` ou
  `display: none`) — não uma união das duas caixas: um controle escondido por
  `display: none` reporta caixa degenerada `(0,0,0,0)`, e uma união por
  `Math.min`/`Math.max` esticaria a região medida em vez de medir o rótulo.
  Nos demais controles a régua mede a caixa própria do elemento, como antes.
  Um checkbox nativo dentro de `<label>` passa a ser medido pelo alvo que um
  dedo realmente toca, não pelo quadrado de 13×13px do input; e uma rota cujo
  seletor não coleta nenhum controle agora falha, em vez de passar em
  silêncio. `KNOWN_SMALL_TARGETS` está vazio: os três alvos que a auditoria
  do Goal030 encontrou abaixo de 24px (`A-01`) não reproduzem mais na régua
  corrigida — ver [FINAL_AUDIT §8](FINAL_AUDIT.md#8-fechamento-de-a-01--goal031-2026-09-20)
  e [GAP_ANALYSIS G-31](GAP_ANALYSIS.md). **Continua sem medir:** qualquer tela
  autenticada (Home, Agenda, Inbox, Clientes, Serviços, Configurações — `A-02`,
  aberto, sem Goal atribuído) e fidelidade visual à referência aprovada
  (`docs/design-reference/claude-design/`) — o screenshot de página inteira
  segue sendo anexado como evidência para conferência humana, nunca como
  pass/fail. `npm run validate:ui` desta rodada (execução da WU-08): exit 0,
  47546 ms.
- **Diff032 ([D-048](DECISIONS.md)):** `validate:integration` passa de 33 para
  34 passos com `rehearse:goal032-auto-reply` — ver a nota acima e
  [DATA_MIGRATION §18](DATA_MIGRATION.md#18-resposta-automática-provada-ponta-a-ponta-goal032).
  A única costura em `apps/*/src` é `OPENAI_BASE_URL` passar a valer também
  para `LangChainModelProvider` e `OpenAIEmbeddingProvider`, com o default
  inalterado. Os guards do ensaio (recusa de destino não descartável, registro
  dos quatro elos de controle negativo) ganham teste permanente em
  `scripts/tests/goal032-auto-reply-rehearsal.test.mjs`, rodado por
  `npm run test:gate`. Nenhuma migration nova, nenhum passo existente removido,
  renomeado ou enfraquecido. **M4** (envio real a número real) continua aberto
  como gate operacional; nenhuma chamada saiu para provedor de LLM real nem
  para WhatsApp real.
- **Diff033 (D-049):** `validate:integration` passa de 34 para 35 passos com
  `rehearse:goal033-authenticated-ui` — ver a nota acima e
  [DATA_MIGRATION §19](DATA_MIGRATION.md#19-gate-renderizado-nas-telas-autenticadas-goal033).
  A régua de `apps/frontend/e2e/viewport-matrix.spec.ts` saiu para o módulo
  compartilhado `apps/frontend/e2e/measure.ts`, sem mudar geometria nem
  limiar; `apps/frontend/e2e/routes.ts` ganhou `AUTHENTICATED_ROUTES` com as
  sete rotas autenticadas. Duas telas reprovaram a régua na primeira medição
  (`/agenda` em `mobile-360`, `<h1>Agenda</h1>` comprimido a uma caixa 0×33px
  porque `grid-template-columns` dava a largura inteira à coluna de ações;
  `/notificacoes` em mobile, checkbox nativo de 13×13px) e as duas foram
  corrigidas em `apps/frontend/src/**`;
  `KNOWN_SMALL_TARGETS` e `KNOWN_CONTRAST_FAILURES` do spec autenticado ficam
  vazios — nenhuma linha de base nova, nenhum achado a partir de A-20.
  `npm run test:gate` ganhou os guards de `resolveRehearsalPlan` e
  `assertPortsFree` do ensaio novo. Nenhuma migration nova, nenhum passo
  existente removido, renomeado ou enfraquecido. **`validate:ui` não mudou**:
  execução desta rodada, exit 0, 42,4 s, 169 `expected`, 21 `skipped`, 0
  `unexpected` — idêntico ao resultado de
  [FINAL_AUDIT §5.1/§8](FINAL_AUDIT.md#51-resultado-real-por-largura). **A-02**
  fecha em [FINAL_AUDIT §10](FINAL_AUDIT.md#10-fechamento-de-a-02--goal033-2026-09-20);
  fidelidade visual à referência aprovada continua sendo conferência humana, e
  **M4** continua aberto.
- A execução hospedada dos workflows ainda não ocorreu; o estado atual é
  "configuração validada localmente". Ver [MIGRATION_STATUS](MIGRATION_STATUS.md).

## Conjunto de métodos portadores de texto derivado da porta, categoria de texto próprio dividida e cadeia de trânsito seguida do Goal040

O Goal039 tinha computado o escopo de leitura de `discoverSendTextSites`
(`apps/ai-orchestrator/src` inteiro), mas o token que define quais métodos
da porta contam como envio de texto continuava escrito à mão
(`/\bsendText\s*\(/g`), e a categoria `product_own_text_to_customer`
misturava texto composto pelo código com texto decidido pelo modelo, sem
ligar o primeiro ao conjunto verificado. Este delta fecha os dois pontos e
segue a cadeia de trânsito até o chamador.

| O que decide agora | O que não decide |
| --- | --- |
| `parseWhatsAppProviderMethods` lê a interface `WhatsAppProvider` e classifica cada método como portador de texto se o tipo do primeiro parâmetro declarar, no nível superior, `text: string`; `resolveSendTextCarrierMethodNames()` devolve os nomes portadores (`["sendText"]` sobre a declaração real, ao lado de `downloadMedia`, não portador), e `buildSendTextTokenPattern()` monta o padrão de busca a partir desses nomes — o token não é mais literal. Método cujo parâmetro não resolve a uma interface no mesmo arquivo, ou cuja forma não é reconhecida, é resíduo nomeado | Continua exigindo que o tipo do parâmetro seja uma interface declarada **no mesmo arquivo** da porta — um tipo importado de outro arquivo não é resolvido, e um método cujo parâmetro é assim formado seria resíduo, não descoberta silenciosa, mas também não teria como ser classificado sem extensão própria |
| `SendTextSiteCategory` substitui `product_own_text_to_customer` por `` `composed_by_${compositor}` `` (variável local do mesmo bloco de função, atribuída de um compositor) e `assistant_decision_text` (`state.response.text`). Um teste liga `composed_by_composeNotificationText` — o único sítio dessa forma na árvore real — ao conjunto verificado: todo texto de `NOTIFICATION_MESSAGE_TEXTS` está em `VERIFIED_CLIENT_TEXTS` | **Texto emitido pelo modelo (`assistant_decision_text`) continua fora do guardrail por D-050**: não é demonstrável por um dublê roteirizado, e este Goal não revisita essa fronteira. Variável atribuída em outro bloco de função do mesmo arquivo não herda a categoria de compositor — vira resíduo, provado por teste; a resolução de compositor é de escopo de bloco, não de arquivo inteiro (observação já registrada em D-055, não fechada por este Goal) |
| `discoverSendTextTransitChains` resolve, para cada sítio `text_in_transit_named_origin`, o nome da função que o contém e procura toda chamada real desse nome na árvore lida, classificando o texto que cada chamador fornece pelo mesmo vocabulário dos sítios. Sobre a árvore real: 2 cadeias, cada uma com exatamente 1 chamador, resíduo zero; toda ocorrência do nome que não é chamada real (assinatura da porta, implementação, anotação de tipo) sai nomeada em `excludedOccurrences`, nunca resíduo | **A cadeia é seguida dentro de `apps/ai-orchestrator/src` e não além.** A raiz de leitura exclui teste — uma chamada real de `sendAiReply` em `tests/security/platform-credential-isolation.test.ts` não é vista, por estar fora da raiz, não por alguma marca de "é teste" no código. **A cadeia para em um elo**: o chamador direto da função de trânsito é classificado, mas se ele próprio repassa texto de um parâmetro seu, quem o chama não é seguido — não há recursão até a origem definitiva do texto |

O que separa declaração de chamada, nos dois descobridores, é a forma
completa: só modificadores conhecidos antes do nome **e** `:` ou `{` depois
do `)` correspondente. Chamada de identificador solto (`sendText({ ... });`
sem receptor) satisfaz a primeira metade e falha a segunda, e por isso
conta como sítio e como chamador — com o critério anterior ela saía como
declaração de porta, sem resíduo. Cinco controles negativos cobrem essa
forma, e um sexto cobre método de porta em forma genérica
(`sendTemplate<T>(input: SendTemplateInput<T>)`), que é resíduo nomeado, não
descoberta silenciosa.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff040-2026-09-21-d-056) e [D-056](DECISIONS.md).

## Egresso HTTP computado, egresso genérico fail-closed e cadeia de trânsito até raiz classificada do Goal041

O aceite do Goal040 declarou dois pontos fora: o conjunto de métodos
portadores de texto tinha virado computado, mas a **porta**
`WhatsAppProvider` continuava sendo premissa — nada provava que todo
texto do produto para o número da cliente passasse por ela — e a cadeia
de trânsito parava no primeiro chamador. Este delta fecha os dois e os
dois resíduos declarados do review040.

| O que decide agora | O que não decide |
| --- | --- |
| `discoverHttpEgressSites` (`apps/ai-orchestrator/tests/support/http-egress-sites.ts`) lê `apps/ai-orchestrator/src` e `apps/bff/src` inteiros e classifica **todo** sítio de `fetch(` em categoria nomeada, resolvida pelo que o código usa para montar a URL — nunca por nome de arquivo, de pasta ou de função, e sem pular arquivo nenhum. Sobre a árvore real: **9** sítios, resíduo **zero**, **1** só na categoria `product_prose_to_client_number` (`EvolutionProvider.ts:73`) | Um sítio sem categoria reconhecida deriva a leitura e nomeia arquivo e linha; a variação de forma que o descobridor não cobrir (nova forma de resolução de destino) continua exigindo extensão própria, não allowlist |
| `fetchJson` (`lib/http.ts:32`) — o primitivo genérico — é ele próprio um sítio classificado, na categoria `generic_egress_destination_decided_by_caller_fetchJson`, e é **fail-closed pelos chamadores**: o nome do primitivo sai da declaração que contém o `fetch` (nenhum arquivo é pulado, nenhum nome é escrito à mão), `genericEgressCallers` é computado a cada execução (hoje **zero**, nenhum código chama `fetchJson`), e um chamador cujo destino não resolve deriva a leitura inteira, nomeando arquivo e linha. Chamador que apenas repassa a URL recebida vira primitivo genérico ele próprio e a varredura segue até ponto fixo, com conjunto de nomes visitados | A categoria nunca aceita chamador silencioso — mas também não impede que um chamador novo apareça amanhã; o gate é a leitura da árvore a cada execução, não uma trava estática de código-fonte |
| `discoverSendTextTransitChains` segue o percurso elo a elo até raiz classificada (`http_route`, `worker_or_job`, `activation_test_entry`, `text_composed_at_link`, `assistant_decision_text`, `person_typed_text`, `literal_text_at_link`) ou até `cycle`, quando o percurso revisitaria um elo já visitado. Sobre a árvore real: as 2 cadeias do Goal040 terminam com resíduo zero, cada uma com um segundo elo — os 5 chamadores do review040 (`ActivationTestAiDriver.ts:203`; `ActivationTestService.ts:604`, `:608`, `:653`, `:679`), todos com raiz nomeada | A cadeia continua lida só dentro de `apps/ai-orchestrator/src` — a suíte de isolamento de credencial, fora dessa raiz, continua fora por construção, não por marca no código |
| Os dois resíduos declarados do review040 fecham: a forma propriedade-arrow de membro de porta ganhou teste permanente, e a mensagem de resíduo de `classifySendTextSites` nomeia o portador descoberto (`carrierName` lido do próprio casamento do padrão), não mais `sendText` fixo | — |

**O que o gate decide sobre a contagem de sítios.** A árvore real tem
**nove** sítios de `fetch(` nas duas raízes lidas, não oito: o Goal041
enumerou oito na sua lista de fatos de baseline, omitindo
`EvolutionProvider.ts:172` (download de mídia) e contando
`lib/http.ts:32` como sítio a não classificar. O número que vale é o
lido da árvore a cada execução — a lista do Goal era fato de
planejamento, não invariante —, e `lib/http.ts:32` é classificado como
qualquer outro sítio, porque pular um arquivo pelo nome era exatamente a
allowlist que este delta remove.

**`apps/evolution-go/` fica declaradamente fora do alcance do descobridor.**
O serviço Go recebe o que o adapter `EvolutionProvider` lhe entrega, mas
nada neste Goal — nem em nenhum anterior — prova que ele não compõe
texto próprio antes de repassar ao WhatsApp real. Isso é limite
declarado, não achado: nenhuma violação real foi observada, e fechar
esse limite exigiria instrumentar o próprio serviço Go, fora do escopo
de teste do `ai-orchestrator` que este Goal declara.

Texto emitido pelo modelo (`assistant_decision_text`) continua fora do
guardrail por **D-050**: não é demonstrável por um dublê roteirizado, e
este Goal não revisita essa fronteira.

**A forma de egresso reconhecida é `fetch(`, e só ela.** Cliente HTTP de
biblioteca — `axios`, `undici`, `node-fetch`, `got` — não seria visto
pelo descobridor. Hoje isso não é buraco: nenhum dos quatro existe em
`apps/ai-orchestrator/src` nem em `apps/bff/src`, e o único cliente HTTP
em uso é o `fetch` global. Fica como limite declarado no
[review041](reviews/041-review.md): adotar um desses clientes exige
estender `discoverHttpEgressSites` na mesma passada, porque a
enumeração ficaria silenciosamente incompleta em vez de reprovar.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff041-2026-09-21-d-057) e [D-057](DECISIONS.md).


## O elo de transporte é provado: texto que sai do serviço Go e origem fora do relé do Goal042

O aceite do Goal041 declarou, em D-057 item 5, um limite de outra
natureza dos anteriores: **uma fronteira de serviço**. O produto não
entrega texto ao WhatsApp — entrega ao serviço Go, e o serviço Go entrega
ao WhatsApp. Tudo que os Goals 034 a 041 provaram vale do lado de cá.
Este delta lê o lado de lá.

| O que decide agora | O que não decide |
| --- | --- |
| `transportguard` (`apps/evolution-go/pkg/transportguard/`, pacote Go novo, só de teste) lê `apps/evolution-go/pkg` e `cmd` inteiros por AST — **53** arquivos `.go` de produção, sem `_test.go` e sem `whatsmeow-lib/` — e enumera todo sítio que escreve campo portador de mensagem de proto. Sobre a árvore real: **82** sítios, **19** chamadas de transporte, resíduo **zero**. Categorias de sítio: `send_via_internal_wrapper` (36), `send_via_transport_client` (38), `embedded_in_non_transport_value` (8), `composed_by_transport_builder` (0) | Forma não reconhecida deriva a enumeração com `arquivo:linha` — a enumeração junta **todos** os resíduos de uma execução em vez de parar no primeiro. Uma forma nova de escrever o mesmo envio continua exigindo extensão do classificador, nunca allowlist |
| O conjunto de campos portadores é **derivado** das declarações de `waE2E`: todo campo `*string` de struct que declara `protoimpl.MessageState`. Hoje **325** campos. Nenhum nome de campo, de pacote ou de método está digitado no guard; o caminho do pacote de proto e o da biblioteca saem do `replace` do `go.mod` | O conjunto derivado é mais largo do que "texto que uma pessoa lê": inclui `URL`, `DirectPath`, `Mimetype` e `Vcard`, porque são `*string` de mensagem. Isso é deliberado — estreitar o conjunto por significado exigiria uma lista escrita à mão, que é o que o Goal proíbe |
| O conjunto de escritas cuja origem **não** é o relé é asserido elemento a elemento: **88** membros, cada um com arquivo, linha, tipo de mensagem, campo e categoria. Exatamente **um** é `value_from_instance_configuration` — `pkg/whatsmeow/service/whatsmeow.go:1806`, `ExtendedTextMessage.Text`, o texto de auto-rejeite de chamada. Membro novo, movido ou reclassificado reprova | Só `value_is_empty_placeholder` fica isento, por ser a ausência de valor. `value_computed_by_library_call` **não** fica isento: a isenção de categoria inteira que a rodada 1 fazia foi removida, porque isentar uma categoria é a mesma coisa que não asserir seus membros |
| Os literais de prosa em Go que alcançam campo portador na direção do fio são asseridos elemento a elemento: **27** literais, cada um com arquivo, linha, conteúdo e campos alcançados. Um novo reprova | A alcançabilidade é **sobre-aproximada** de propósito: quando o campo lê um local ligado em vários ramos, todos contam, porque qual ramo executa é fato de runtime. Sobre-aproximar é o lado fail-closed; o custo é um literal atribuído a mais campos do que uma execução usaria |
| A travessia por valor, lado Go: o caminho completo de cada uma das **94** rotas registradas é computado por AST (prefixo do grupo mais caminho do registro), `EVOLUTION_SEND_TEXT_PATH` é lido de `apps/ai-orchestrator/.env.example` como `CHAVE=VALOR`, e o encadeamento é seguido do registro (`pkg/routes/routes.go:141`) ao handler (`pkg/sendMessage/handler/send_handler.go:45`) e ao serviço, terminando em `pkg/sendMessage/service/send_service.go:611` com origem relé. Chave ausente, arquivo ausente ou caminho que não corresponde a rota registrada reprovam, com o caminho impresso | O encadeamento segue **o valor que o handler liga do corpo recebido**, não todo chamado alcançável a partir do handler. Isso é o que o torna uma cadeia e não um conjunto de alcançabilidade — e é também o que ele não decide: um caminho que passe o texto por um canal que o guard não segue (canal, closure guardada em campo, reflexão) não apareceria |
| A travessia por valor, lado TypeScript: `computeBoundaryValueCrossing` computa o default de `EVOLUTION_SEND_TEXT_PATH` de `apps/ai-orchestrator/src/config/env.ts` pela **forma** da declaração — chave, dois-pontos, um helper qualquer, um literal de string — e o compara ao `.env.example`. Divergência reprova; chave ausente em qualquer dos dois reprova em vez de pular. O valor não está digitado em teste nenhum | O lado TypeScript não parseia Go e o lado Go não parseia TypeScript. O encontro é o valor, e só ele: nada aqui prova que a variável de ambiente do ambiente real vale o default |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime.** Nada aqui executa o serviço Go, abre conexão whatsmeow, envia
mensagem ou observa o que chega a um telefone. O que se prova é o que a
árvore de código diz, lida por AST. **Não prova qual binário roda em
produção**: a árvore lida é a desta worktree, e nada liga esse código ao
artefato implantado. **Não alcança `whatsmeow-lib/`**: é biblioteca
vendorizada, excluída da árvore de produto por construção, e lida apenas
como fonte das declarações de proto — um envio composto dentro dela não
seria visto.

**Divergência declarada: o Goal afirmava achado zero, e o AST discorda.**
O Goal042 afirma, na sua lista de fatos de baseline, que os únicos
literais em campo portador de texto são **21** `proto.String("")` de
`QuotedMessage`, e que "hoje não há violação real". O AST enumera **27**
literais não vazios que alcançam campo portador na direção do fio. A
divergência é declarada, não corrigida: nenhum arquivo Go de produção
deste fork pode ser editado por este Goal. Os membros são de quatro
naturezas — discriminadores de protocolo e MIME types (`quick_reply`,
`cta_copy`, `cta_url`, `cta_call`, `payment_info`, `image/jpeg`,
`video/mp4`, `audio/ogg; codecs=opus`), os envelopes JSON dos payloads de
botão, marcas de formatação (`*`, `\n\n`, o espaço que substitui título
vazio de linha ou de seção), e **um** que não é nenhuma delas:
`"Ver Menu"` (`pkg/sendMessage/service/send_service.go:1960`), rótulo em
português que o fork substitui quando o chamador manda `ButtonText`
vazio, entregue ao número da cliente. Esse último é prosa de produto
composta dentro do transporte, exatamente o que o `AGENTS.md` de
`apps/evolution-go/` proíbe sem que nada verificasse — e virou o achado
**A-24** em [FINAL_AUDIT §19](FINAL_AUDIT.md), não correção silenciosa.

Texto emitido pelo modelo continua fora do guardrail por **D-050**: este
delta não revisita essa fronteira. **M4** continua aberto como gate
operacional; nada aqui o fecha nem afirma tê-lo fechado.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff042-2026-09-21-d-058) e [D-058](DECISIONS.md).

## A fronteira inteira é atravessada: rota de transporte que o produto alcança e prosa ligada ao uso real do Goal043

[D-058](DECISIONS.md) tinha deixado, no seu `Revisar se`, uma condição em
prosa: se o produto passasse a usar `POST /send/list`, o literal de
**A-24** deixaria de ser hipotético. Este delta computa exatamente essa
condição, em vez de a descrever de novo em texto.

| O que decide agora | O que não decide |
| --- | --- |
| A rota que o produto alcança no serviço Go é um arquivo de valores (`apps/ai-orchestrator/tests/support/product-transport-routes.txt`, **10** entradas `MÉTODO CAMINHO`), lido pelos dois lados — nenhuma rota está digitada dentro de um teste. No TypeScript, `discoverGoServiceHttpRequests` lê `apps/ai-orchestrator/src` e `apps/bff/src` inteiros e computa o mesmo conjunto; divergência em qualquer direção reprova, nomeando a rota que sobra. Uma dessas dez, `GET /health` (`apps/bff/src/routes/health.ts:22`, `fetch` em `:46`), tem o destino fora da expressão da URL: ele chega por parâmetro e é resolvido no chamador — o §1 do Goal, que nomeia nove caminhos, não a contava | O reconhecimento de cliente HTTP interno é por forma de classe — URL base de campo ligado no construtor, caminho do argumento do método —, não por nome de arquivo, pasta ou classe. Uma chamada ao serviço Go por uma forma não reconhecida (outra assinatura de cliente, por exemplo) reprovaria por resíduo do egresso cru já herdado de Goal041, não silenciosamente |
| No Go, `MatchProductTransportRoutes` casa as 10 entradas contra as **94** rotas registradas, segmento por segmento, com `{}` batendo só contra parâmetro de rota. As 10 casam, cada uma, com exatamente uma rota; as outras **84** ficam contadas como não alcançadas, não como falha | Duas entradas que casassem a mesma rota, ou uma entrada sem rota correspondente, reprovariam nomeando a entrada e a(s) rota(s) — provado pelos controles negativos 2 e 4 deste critério |
| O alcance de literal de prosa por rota é computado por AST (`ProseReachFrom`), sobre-aproximando a partir do handler. Das 10 rotas que o produto chama, 9 têm handler para seguir e 1 — `GET /health`, cujo handler registrado é um closure local (`pkg/routes/routes.go:82`) — é recusada com o motivo escrito, contada e não perdida; das 9 percorridas, só `POST /send/text` escreve em campo portador (100 declarações, 29 sítios), e alcança **zero** literais. Das 94 rotas registradas, 84 têm handler para seguir e **5** delas alcançam, juntas, os mesmos **27** literais que o Goal042 já tinha asserido, resíduo zero nos dois sentidos | A reach é deliberadamente mais larga do que uma execução real percorreria — todo ramo de todo valor ligado em mais de um lugar conta —, o mesmo motivo fail-closed que [D-058 item 3](DECISIONS.md) já registrava |
| O literal de **A-24** é alcançado por exatamente uma rota registrada, `POST /send/list`, e essa rota não está no conjunto de 10 que o produto chama — resultado de teste (`TestNoRouteThatReachesTheProductProseLiteralIsReachedByTheProduct`), não leitura manual. Se o produto passasse a chamar `POST /send/list`, ou qualquer rota nova que alcance um literal, o conjunto de literais alcançáveis a partir do produto deixaria de ser vazio e o teste que o assere vazio reprovaria, nomeando arquivo e linha | O achado **A-24** não é corrigido aqui: continua `PENDENCIA-POS-MVP` em [FINAL_AUDIT §19](FINAL_AUDIT.md), e a mudança de natureza do motivo do rebaixamento — de prosa para invariante computada — está registrada em [FINAL_AUDIT §20](FINAL_AUDIT.md), sem reescrever §19 |
| Os cinco controles negativos obrigatórios deste critério mordem sobre árvore sintética em diretório temporário: chamada nova por caminho ausente do arquivo (TS); entrada sem rota correspondente, em três formas (Go); literal novo alcançável a partir de rota do produto (Go); mover sítio/cliente/rota/arquivo para nome diferente não muda a classificação (TS e Go); cliente genérico para outro serviço e URL apenas montada (nunca despachada) ficam fora do conjunto alcançado (TS) | Nenhum dos cinco toca a árvore real — cada um monta e remove a própria árvore sintética — e nenhum deles amplia nem estreita o conjunto de 10 rotas ou de 27 literais que a suíte permanente assere |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime**: nada aqui executa o serviço Go, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não prova qual binário roda em
produção**. **Não alcança `whatsmeow-lib/`**, lida apenas como fonte das
declarações de proto. **Texto emitido pelo modelo continua fora do
guardrail por D-050**: esta fronteira cobre rota de transporte e prosa do
fork, nunca decisão do modelo — a mesma fronteira já declarada em
delta038/D-050 não muda aqui. **Não corrige A-24**: o achado continua
`PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork foi
editado por este Goal. **Não fecha M4**: nenhuma chamada saiu para
WhatsApp real nem para provedor de LLM real, e nenhuma conexão whatsmeow
foi aberta. **Não lê o valor real de variável de ambiente nenhuma**: só
o default do schema TypeScript e o `.env.example`, os mesmos que
[D-058](DECISIONS.md) já lia.

**Duas bordas em que a completude do conjunto de 10 rotas não é
fail-closed** — registradas no [review043](reviews/043-review.md) como
observação não bloqueante, e ditas aqui porque limitam o que a coluna
acima decide. Primeira: o reconhecimento de destino resolvido no chamador
varre chamadores **só no mesmo arquivo**; um helper exportado com
chamadores em outro arquivo cairia em `notGoBound` com motivo
factualmente errado, em vez de derrubar a leitura. Segunda: a superfície
pública do cliente HTTP interno é reconhecida por três nomes de método
(`request`, `requestWithStatus`, `requestBinary`); um método público novo
que delegasse ao `perform` privado de
`apps/bff/src/clients/internal-http-client.ts` não acrescentaria sítio de
`fetch` algum, e por isso **não** seria pego pelo resíduo de egresso cru
herdado do Goal041. Nas duas, a rota nova sairia do conjunto sem
registro — a forma branda da falha de subconjunto próprio que a rodada 1
deste Goal encontrou em `GET /health`.

**As duas bordas acima foram fechadas pelo Goal044, pelo mecanismo descrito
na seção seguinte** — computando a ligação entre arquivos e a superfície do
cliente, cada uma provada aberta antes por um controle negativo sobre
árvore sintética. Este parágrafo não é apagado: registra a observação
original do review043, que motivou o fechamento.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff043-2026-09-21-d-059) e [D-059](DECISIONS.md).

## As duas bordas do review043 são fechadas: chamador em outro arquivo e superfície de cliente derivada do Goal044

O parágrafo acima registrou duas bordas em que a completude do conjunto de
10 rotas do Goal043 não era fail-closed. Este delta fecha as duas, sem
tocar o conjunto de 10 rotas nem o de 27 literais que os Goals 042 e 043
já asseriam.

| O que decide agora | O que não decide |
| --- | --- |
| A primeira borda — chamador de `caller_resolved_base_url_via_*` só no mesmo arquivo do sítio — é fechada por `findCrossFileCallerBindings`: todo import relativo das duas árvores é resolvido a caminho de arquivo, o alias local é ligado ao nome exportado, e os chamadores reais do arquivo do sítio mais os de todo arquivo ligado dessa forma entram na leitura. Forma que a resolução não converte em arquivo conhecido — reexportação, import dinâmico, especificador não relativo, referência reexportada adiante — derruba a leitura nomeando arquivo e linha | A resolução é só pela forma do import — especificador relativo e alias de cláusula —, nunca por nome de função igual solto entre arquivos. Um chamador atrás de um alias de caminho não relativo (`@app/...`) ou de reflexão continua fora, derrubando a leitura em vez de resolver |
| A segunda borda — superfície do cliente HTTP interno reconhecida por três nomes de método fixos — é fechada por `computeInternalClientMemberSurface`: todo membro de topo da classe que alcança `fetch`, direto ou por delegação transitiva via `this.<membro>(...)` a outro membro, entra na superfície; membro `private`/`protected` que alcança `fetch` é excluído com o motivo escrito, por não ser chamável de fora da classe | Delegação por acesso computado (`this["campo"][membro]`) não é uma forma que este mecanismo reconhece. Um ciclo de delegação derruba a leitura, nomeando o membro, em vez de entrar em laço |
| Os dois mecanismos foram exercitados por controle negativo antes de fechar, não só depois: os controles 1 e 2 deste critério provam, cada um com par antes/depois sobre árvore sintética em diretório temporário, que a chamada por outro arquivo — ligada por import com alias, sem o nome da declaração aparecer no chamador — não era reconhecida antes do mecanismo existir e passa a ser depois, e que um método público sem `fetch` próprio só vira rota quando passa a delegar ao membro `private` que tem o `fetch` — antes da delegação, a chamada a ele é contada fora com motivo escrito; se o membro público não existir na classe, a leitura derruba com `arquivo:linha` | Os quatro controles negativos deste critério (o par 1/2, mais reexportação/import dinâmico e renomeação) rodam sobre árvore sintética própria, removida ao fim — nenhum deles amplia nem estreita o conjunto de 10 rotas ou de 27 literais que a suíte permanente assere |
| A varredura de chamadores do egresso genérico usa a mesma resolução de ligação: cada arquivo das duas árvores é lido pelo nome da declaração e pelo nome local de cada import com alias que liga a função, e o motivo escrito do sítio genérico conta os chamadores daquele primitivo (`genericEgressCallersByPrimitive`). Chamador sob alias com destino no serviço Go derruba a leitura, como qualquer outro | Antes, a varredura era por nome solto: um chamador que importasse o primitivo sob outro nome ficava invisível, e o motivo afirmava zero chamador onde existia um. O que continua fora é o que o import não resolve — alias de caminho não relativo, import dinâmico, reexportação —, e isso derruba a leitura |
| Nenhum motivo devolvido em `notGoBound` para um sítio `caller_resolved_base_url_via_*` afirma algo sobre um chamador que a leitura não alcançou: todo motivo relata quantos chamadores foram lidos e em quantos arquivos (`"N chamador(es) lido(s) em M arquivo(s)"`), e quantos arquivos das duas árvores foram varridos atrás da ligação | Sete afirmações permanentes (WU-03) sobre a árvore real consomem os dois mecanismos, ao lado das que o Goal043 já deixava — nenhuma delas foi relaxada, pulada ou removida |
| Nenhum dos dois mecanismos se desliga em silêncio por não reconhecer a forma: forma de exportação não convertível em ligação importável derruba com `arquivo:linha`, e o mesmo nome saindo do módulo por duas construções `export` vira duas ligações, as duas varridas — reconhecer a primeira não silencia as seguintes; membro de classe sem nome derivável da declaração derruba; chamada `this.<campo>.<membro>(` a membro que a classe declara mas que está fora da superfície é contada fora com motivo escrito, e a membro que a classe não declara derruba. A enumeração — superfície por classe, chamadas fora da superfície, e o que a resolução de chamadores leu por sítio — sai do descobridor e é conferida por afirmação permanente | O reconhecimento continua limitado à forma: `export =`, `module.exports`, alias de caminho não relativo e acesso computado (`this["campo"][membro]`) continuam derrubando a leitura em vez de resolver. Recusar não é resolver — é recusar em voz alta |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime**: nada aqui executa o serviço Go, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não prova qual binário roda em
produção**. **Não alcança `whatsmeow-lib/`**. **Texto emitido pelo modelo
continua fora do guardrail por D-050**. **Não corrige A-24**: o achado
continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork
foi editado por este Goal. **Não fecha M4**: nenhuma chamada saiu para
WhatsApp real nem para provedor de LLM real, e nenhuma conexão whatsmeow
foi aberta. **Não amplia nem reduz o conjunto de 10 rotas ou de 27
literais** que os Goals 042 e 043 já asseriam — este delta fecha duas
bordas de leitura do lado TypeScript, nunca o critério que decide o
conjunto.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff044-2026-09-21-d-060) e [D-060](DECISIONS.md).

## As três bordas do descobridor de cliente HTTP interno são fechadas: identidade por declaração, instanciação por ligação e destino indireto do Goal045

O parágrafo anterior registrou duas bordas fechadas pelo Goal044 e uma
observação não bloqueante deixada aberta: `discoverGoBoundInternalClientRequests`
ainda deduplicava classe de cliente por nome. A conferência deste Goal
achou mais duas na mesma família, no mesmo descobridor. Este delta fecha
as três, sem tocar o conjunto de 10 rotas nem o de 27 literais que os
Goals 042 a 044 já asseriam.

| O que decide agora | O que não decide |
| --- | --- |
| A identidade da classe de cliente é o sítio de declaração (`arquivo:linha`), nunca o nome: `classSurfaces` é indexado por `classDeclarationKey`, e duas classes homônimas declaradas em arquivos diferentes produzem duas entradas distintas em `internalClientSurfaces`, cada uma com sua própria superfície e varredura de instanciação | `className` continua no relatório só para leitura humana; nenhum casamento posterior usa esse campo isolado como chave. Duas declarações da mesma classe real no mesmo arquivo continuam sendo a mesma entrada — a chave é o sítio de declaração, não uma contagem de ocorrências |
| A instanciação só conta quando a ligação local resolve até a declaração: `findInstantiationsOfClassDeclaration` resolve, em cada arquivo candidato, a forma pela qual `new <Id>(` chega até a classe — declaração local, import nomeado, import nomeado sob alias, ou import default — reusando a máquina de ligação do Goal044. Nome igual sem ligação resolvida não entra; `new Alias(...)` sob `import { C as Alias }` entra | A resolução é só pela forma do import e da declaração local — nunca por nome de identificador igual solto entre arquivos. Alias de caminho não relativo, `export =`/`module.exports`, ou referência à classe repassada adiante como valor continuam fora, derrubando a leitura em vez de resolver |
| Forma de ligação que a resolução não alcança derruba a leitura com `arquivo:linha`, em cinco categorias nomeadas (`ClassBindingRefusalCategory`) — nenhum `continue` mudo sobra neste caminho | As cinco categorias cobrem o que a máquina de ligação do Goal044 já resolve mais o caso específico de referência de classe repassada como valor; forma de ligação inteiramente nova, que nem essa máquina reconhece, continua fora do alcance deste mecanismo |
| Destino de instanciação que a leitura não resolve a chave alguma derruba com `arquivo:linha`, nomeando a expressão não convertida; destino que resolve a uma chave fora do serviço Go é enumerado em `nonGoBoundInstantiations`, com arquivo, linha, nome local, forma de ligação e chave resolvida — as duas saídas são distintas, e o `continue` mudo que descartava a instanciação sem registro não existe mais | A enumeração não classifica se a chave fora do serviço Go aponta a um serviço real ou fictício — só que não é uma das chaves de `GO_SERVICE_BASE_URL_ENV_VARS`. Destino resolvido por forma que `resolveDestination` ainda não converte — por exemplo, base lida de um campo já atribuído em outro método — continua derrubando a leitura, não classificando às cegas |
| Os três mecanismos foram provados abertos antes de fechar: os controles 1 a 3 deste critério rodam, cada um com par antes/depois sobre árvore sintética em diretório temporário, provando que classe homônima em outro arquivo, instanciação sob alias e destino indireto por parâmetro do construtor não eram reconhecidos/fechados antes do mecanismo existir e passam a ser depois; o controle 4 prova que um homônimo não relacionado não altera a classificação, e que mover e renomear a classe real não muda o resultado | Os quatro controles negativos rodam sobre árvore sintética própria, removida ao fim — nenhum deles amplia nem estreita o conjunto de 10 rotas ou de 27 literais que a suíte permanente assere sobre a árvore real |
| A isenção por construção `export` em `refuseClassReferencesOutsideInstantiation` é do lado de LIGAÇÃO, nunca do lado de valor (`exportConstructBindingRange`): `export const X = <Classe>;` e `export class Sub extends <Classe> {` recusam sob `class_binding_reference_forwarded_as_value`; `export type` e `export interface` seguem isentos inteiros, por serem posição de tipo. `scannedFilePathsForInstantiation` é acumulado por `findCrossFileCallerBindings` enquanto abre cada arquivo, nunca preenchido de antemão com `allSources` | As duas bordas foram provadas abertas antes de fechar, revertendo cada correção na árvore e reexecutando: os dois repasses passavam em silêncio, e a classe declarada e não exportada reportava 4 arquivos varridos com zero varredura executada. O corte do lado de valor é por forma textual da construção `export` — uma forma de declaração exportada que não seja `type`/`interface`/`class`/`const`/`let`/`var` cai no caso geral e isenta a construção inteira |
| Duas afirmações permanentes (WU-04) provam, sem vacuidade, que `internalClientSurfaces` tem uma entrada por declaração distinta e que toda superfície tem ao menos uma ligação de instanciação resolvida, e que `nonGoBoundInstantiations` não é vazio e toda entrada tem motivo escrito apontando a uma superfície computada | O que os Goals 040 a 044 já provavam continua provado sem afrouxamento: resíduo de egresso zero, casamento segmento a segmento com o lado Go, superfície derivada por alcançabilidade, chamador seguido por ligação importada atravessando arquivo |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime**: nada aqui executa o serviço Go, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não prova qual binário roda em
produção**. **Não alcança `whatsmeow-lib/`**. **Texto emitido pelo modelo
continua fora do guardrail por D-050**. **Não corrige A-24**: o achado
continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork
foi editado por este Goal. **Não fecha M4**: nenhuma chamada saiu para
WhatsApp real nem para provedor de LLM real, e nenhuma conexão whatsmeow
foi aberta. **Não amplia nem reduz o conjunto de 10 rotas ou de 27
literais** que os Goals 042 a 044 já asseriam — este delta fecha três
bordas de leitura do lado TypeScript, nunca o critério que decide o
conjunto. **Não prova o valor real de variável de ambiente alguma** —
só o default do schema TypeScript e o `.env.example` são lidos.
`validate:integration` continua recusando por pré-condição de banco
ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado como
ausente.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff045-2026-09-21-d-061) e [D-061](DECISIONS.md).

## A isenção de `export` vira allowlist fechada e as categorias de recusa existem em runtime do Goal046

O parágrafo anterior registrou a isenção por construção `export`
recortada por forma textual, com o limite declarado de que uma forma
exportada fora de `type`/`interface`/`class`/`const`/`let`/`var` isentava
a construção inteira — a observação não bloqueante 3 do review045. Este
delta fecha esse limite, sem tocar o conjunto de 10 rotas nem o de 27
literais que os Goals 042 a 045 já asseriam.

| O que decide agora | O que não decide |
| --- | --- |
| A isenção de `export` é allowlist fechada: `exportConstructBindingRange` classifica cada construção contra um conjunto nomeado de formas — as três da baseline mais `function`/`async function`/`default function`, `default <identificador>` e `{ ... }`/`* from ...`, todas com `declare` opcional — e devolve `{ recognized: true }` com o range de lado de ligação para cada forma reconhecida; para o que não casa com nenhuma, devolve `{ recognized: false }`, nunca mais um range silencioso | A recusa é escopada à **ocorrência**, não à construção: uma forma `export` exótica que não mencione a classe ligada não derruba nada. A lista de formas reconhecidas é a que as duas árvores reais exigem hoje; forma `export` nova que a árvore vier a ter e que não estiver na lista recusa, não isenta — o próprio ponto deste delta |
| No ramo `const`/`let`/`var`, atribuição que a busca de profundidade não localiza recusa; construção que de fato não atribui valor algum continua isenta: `findTopLevelAssignmentIndex` devolve `TopLevelAssignmentSearch`, distinguindo `{ found: false, resolved: true }` (não atribui) de `{ found: false, resolved: false }` (atribui, mas a profundidade nunca fechou) | A heurística de `<`/`>` como delimitador de profundidade continua sendo heurística textual, não parser — `resolved: false` é o sinal de que ela não fechou, nunca uma correção da heurística em si |
| As categorias de recusa existem em runtime: `CLASS_BINDING_REFUSAL_CATEGORIES` é array `as const` exportado com seis categorias, e `ClassBindingRefusalCategory` é o tipo derivado dele — a suíte e a documentação permanente conferem contra o array, nunca contra união escrita à mão | Nenhum identificador de categoria existente mudou de nome, e nenhuma recusa existente mudou de categoria; a categoria nova (`class_binding_export_construct_form_unrecognized`) cobre os dois pontos de recusa deste delta, e só eles |
| A observação não bloqueante 2 do review045 é fechada, por acréscimo: `class_binding_export_form_not_resolved` também dispara quando a declaração está em arquivo fora das duas árvores varridas; `class_binding_cross_file_form_not_resolved` também quando o arquivo ligado tem texto fora do conjunto lido — [D-062](DECISIONS.md) nomeia os dois casos | D-061 não foi reescrita; a descrição completa mora em D-062, que fecha a observação sem reabrir o aceite anterior |
| Os cinco mecanismos foram provados abertos antes de fechar: os cinco controles negativos obrigatórios rodam, cada um sobre árvore sintética em diretório temporário, provando que `export default { Client: <Classe> };`, `export namespace`, `export =` no candidato, e atribuição de profundidade não fechada recusam pela categoria nova, e que as sete formas reais das duas árvores continuam classificando exatamente como antes | Os cinco controles negativos rodam sobre árvore sintética própria, removida ao fim — nenhum deles amplia nem estreita o conjunto de 10 rotas ou de 27 literais que a suíte permanente assere sobre a árvore real |
| Duas afirmações de não-vacuidade (WU-04) provam, sobre a árvore real, que ao menos uma construção `export` de forma reconhecida foi isenta e que a resolução por ligação reconheceu ao menos uma instanciação | O que os Goals 040 a 045 já provavam continua provado sem afrouxamento: resíduo de egresso zero, identidade por declaração, instanciação por ligação, destino de instanciação com as duas saídas nomeadas |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime**: nada aqui executa o serviço Go, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não prova qual binário roda em
produção**. **Não alcança `whatsmeow-lib/`**. **Texto emitido pelo modelo
continua fora do guardrail por D-050**. **Não corrige A-24**: o achado
continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork
foi editado por este Goal. **Não fecha M4**: nenhuma chamada saiu para
WhatsApp real nem para provedor de LLM real, e nenhuma conexão whatsmeow
foi aberta. **Não amplia nem reduz o conjunto de 10 rotas ou de 27
literais** que os Goals 042 a 045 já asseriam — este delta fecha uma
omissão de leitura do lado TypeScript, nunca o critério que decide o
conjunto. **Não prova o valor real de variável de ambiente alguma** —
só o default do schema TypeScript e o `.env.example` são lidos.
`validate:integration` continua recusando por pré-condição de banco
ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado como
ausente — não reexecutado por esta unidade de documentação (WU-05).
**NÚMERO CONFERIDO:** `scannedFilePathsForInstantiation` soma **205**
arquivos `.ts` varridos (**118** em `apps/ai-orchestrator/src`, **87**
em `apps/bff/src`, com o client do Prisma gerado presente nas duas
árvores) — o mesmo **205** que o documento do Goal046 registrava. O
número foi computado pelo descobridor sobre a árvore real e é asserido
pela suíte permanente; não há divergência a declarar.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff046-2026-09-21-d-062) e [D-062](DECISIONS.md).

## O uso do campo cliente é fail-closed: toda ocorrência é enumerada, e forma não reconhecida recusa, do Goal047

O parágrafo anterior registrou a isenção por construção `export`
fechada, com o limite declarado de que a leitura do **uso** do campo
cliente ainda reconhecia só a forma literal `this.<campo>.<membro>(` —
a observação não bloqueante 3 do review045, do lado espelhado. Este
delta fecha esse limite, sem tocar o conjunto de 10 rotas nem o de 27
literais que os Goals 042 a 046 já asseriam.

| O que decide agora | O que não decide |
| --- | --- |
| Toda ocorrência do token `this` no corpo da classe dona é enumerada — não o texto `this.<campo>` —, sobre o texto sem comentários e com as faixas `${...}` de template literal lidas como código; cada uma cai em chamada de transporte, chamada de membro fora da superfície, ou recusa nomeada — `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` (doze categorias): fora de corpo de método de topo, encadeamento opcional, acesso computado, desestruturado, membro não invocado, nome de membro não derivável, campo repassado como valor, e as cinco do receptor (encadeamento opcional, acesso computado, desestruturado, repassado como valor, nome de campo não derivável) | A recusa é escopada à **ocorrência**, não ao nome solto: propriedade homônima de outro objeto, ocorrência que prova alcançar outro campo, texto de template, string ou comentário não conta e não recusa. A lista de formas reconhecidas é a que as duas árvores reais exigem hoje; forma nova que não estiver na lista recusa, não isenta — o próprio ponto deste delta |
| O alvo da atribuição só vira campo provado em duas formas: `this.<campo> = new ...` em qualquer profundidade, ou declaração de propriedade de classe com inicializador; qualquer outra forma recusa sob `INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` (seis categorias: variável local, desestruturado, propriedade de objeto estranho, elemento de array, retorno direto, forma não reconhecida) | Nenhuma das seis categorias produz mais um "campo" que a busca por `this.<nome>` nunca encontraria; a atribuição continua sendo lida por forma de texto, não por parser |
| As duas saídas de `sourcesByPath` ausente, no ramo da superfície e no da instanciação, são a mesma recusa nomeada com `arquivo:linha` | Nenhum dos dois ramos pula sítio ou instanciação em silêncio |
| O critério 3 do Goal046 (recusa escopada à ocorrência) ganhou controle próprio: construção `export` exótica que não menciona a classe ligada não derruba nada, fechando a observação 1 do [review046](reviews/046-review.md) | Nenhum mecanismo do Goal046 foi alterado; só a afirmação passou a ser exercida |
| As categorias de recusa existem em runtime, em dois arrays `as const` exportados, com os tipos derivados deles — a suíte confere os dois por igualdade, nunca contra união escrita à mão | Nenhum identificador de categoria já existente (Goal045/046) mudou de nome, e nenhuma recusa existente mudou de categoria |
| Os sete controles negativos obrigatórios deste escopo rodam, cada um sobre árvore sintética em diretório temporário: encadeamento opcional, acesso computado, alias em variável local, instância guardada fora de campo de classe, ocorrência fora de corpo de método de topo, as três formas reais continuando classificadas igual, e o controle herdado do critério 3 do Goal046 | Os sete controles rodam sobre árvore sintética própria, removida ao fim — nenhum deles amplia nem estreita o conjunto de 10 rotas ou de 27 literais que a suíte permanente assere sobre a árvore real |
| Duas afirmações de não-vacuidade (WU-04) provam, sobre a árvore real, que ao menos uma ocorrência do campo cliente foi classificada como chamada de transporte e que a enumeração de `this.http.<membro>(` não é vazia | O que os Goals 040 a 046 já provavam continua provado sem afrouxamento: resíduo de egresso zero, identidade por declaração, instanciação por ligação, isenção de `export` fechada |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime**: nada aqui executa o serviço Go, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não prova qual binário roda em
produção**. **Não alcança `whatsmeow-lib/`**. **Texto emitido pelo modelo
continua fora do guardrail por D-050**. **Não corrige A-24**: o achado
continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork
foi editado por este Goal. **Não fecha M4**: nenhuma chamada saiu para
WhatsApp real nem para provedor de LLM real, e nenhuma conexão whatsmeow
foi aberta. **Não amplia nem reduz o conjunto de 10 rotas ou de 27
literais** que os Goals 042 a 046 já asseriam — este delta fecha o
último trecho fail-open da leitura do lado TypeScript, nunca o critério
que decide o conjunto. **Não prova o valor real de variável de ambiente
alguma** — só o default do schema TypeScript e o `.env.example` são
lidos. `validate:integration` continua recusando por pré-condição de
banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado
como ausente. Sobre a árvore final desta rodada: `validate:core` exit 0
(17 passos, 15 passados, 2 pulados), `npm run test:gate` com 226 testes
e 0 falhas, e `go test ./...` em `apps/evolution-go` ok. Cada uma das
doze categorias de `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` tem controle
permanente que a exercita, além da igualdade do array; os sete
controles que o critério de aceite do Goal nomeia (escopo §7) existem e
mordem todos. **NÚMERO CONFERIDO:**
`scannedFilePathsForInstantiation` soma **205** arquivos `.ts` varridos
(**118** em `apps/ai-orchestrator/src`, **87** em `apps/bff/src`, com o
client do Prisma gerado presente nas duas árvores) — o mesmo **205** que
o documento do Goal046 registrava. O número foi computado pelo
descobridor sobre a árvore real e é asserido pela suíte permanente; não
há divergência a declarar.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff047-2026-09-22-d-063) e [D-063](DECISIONS.md).

## A cobertura de recusa é computada, e categoria sem controle reprova a suíte, do Goal048

O parágrafo anterior registrou o fechamento do último trecho fail-open
de mecanismo, com **24** categorias de recusa nomeadas em três arrays
em runtime. O que sobrava não era fail-open de mecanismo: era fail-open
de **prova** — oito dessas categorias só existiam dentro da lista
literal de um teste de igualdade, sem controle algum que as fizesse
acontecer. Este delta fecha esse limite, sem tocar o conjunto de 10
rotas nem o de 27 literais que os Goals 042 a 047 já asseriam.

| O que decide agora | O que não decide |
| --- | --- |
| A cobertura é computada a partir dos três arrays em runtime — nunca de uma lista reescrita à mão. Um `Set` de módulo acumula toda categoria observada por um helper que todo controle negativo do arquivo passou a usar; um teste final concatena os três arrays e reprova, nomeando a categoria, quando alguma não foi observada | Categoria acrescentada a qualquer um dos três arrays sem controle correspondente reprova de imediato — ninguém precisa lembrar de atualizar lista alguma |
| Seis das oito categorias sem controle da baseline ganharam controle permanente sobre árvore sintética: três do vocabulário de atribuição (desestruturação, propriedade de outro objeto, instanciação passada como argumento) e três do de ligação de classe (duas declarações homônimas, exportação CommonJS, import de namespace atravessando arquivo) | As formas reais continuam classificando exatamente como antes; nenhuma regra de classificação, categoria ou ordem de consulta mudou |
| Duas categorias (`instance_field_assignment_array_element`, `instance_field_assignment_returned_directly`) são inalcançáveis por árvore sintética alguma, por construção do código que as declara — provado por dois controles permanentes que mostram a recusa saindo sob a categoria vizinha | As duas ficam nomeadas como resíduo em [D-064](DECISIONS.md) e em [FINAL_AUDIT §25](FINAL_AUDIT.md), descontadas da cobertura só por `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`, um registro nomeado que o próprio teste confere — não são declaradas cobertas pela igualdade do array |
| O sub-caso "comentário" da observação 1 do review047 ganhou controle permanente, e a asserção do escopo §3 do Goal047 deixou de depender de nome de variável | Nenhuma saída muda: as mesmas duas frases continuam afirmadas, agora de forma genérica |
| O título do teste de igualdade de `CLASS_BINDING_REFUSAL_CATEGORIES` deixou de afirmar cobertura que não existia | O array continua provado por igualdade, ordem e conteúdo — a cobertura por controle é conferida à parte |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime**: nada aqui executa o serviço Go, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não corrige A-24**: o achado
continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste
fork foi editado por este Goal. **Não fecha M4**. **Não amplia nem
reduz o conjunto de 10 rotas ou de 27 literais.** `npm run
validate:core` **PASSED** nesta árvore — dos 17 passos, 15 passaram
(inclusive `test:ai-orchestrator`) e 2 pulados por design (`test:bff`,
`test:health-worker`, cobertos só em `validate:integration`); nenhum
falhou. `npm run test:gate` (raiz, suíte independente sobre
`scripts/`) permanece em **226** testes e 0 falhas, inalterado, porque
não exercita este arquivo. `validate:integration` continua recusando
por pré-condição de banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is
not set`), declarado como ausente — não é este Goal quem a supre.
Sobre a árvore final desta rodada: `npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator` →
**200** testes, **200** passando, **0** falhando: as duas categorias
residuais são descontadas pelo registro nomeado
`PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`, não por igualdade de array;
`npx vitest run` completo → **1012** testes, **924** passando, **88**
pulados (mesma contagem da baseline), **0** falhando. Fora do escopo de
produto, dois arquivos de `tools/ia-loop/` (`lib/deterministic-executor.mjs`,
`tests/deterministic-executor.test.mjs`) também mudaram nesta rodada,
para corrigir um bug do próprio harness que dobrava o prefixo `scope/`
de `unit.pattern` e fazia o filtro do vitest não casar arquivo algum.
Se o registro nomeado é a forma de resíduo que a revisão aceita para as
duas categorias, é decisão registrada em "Revisar se" de
[D-064](DECISIONS.md).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff048-2026-09-22-d-064) e [D-064](DECISIONS.md).

## A categoria creditada passa a ser a declarada pelo controle, e o descarte silencioso é enumerado por forma idiomática, do Goal049

O parágrafo anterior fechou o último trecho fail-open de **prova**: a
cobertura passou a ser computada a partir dos três arrays em runtime.
O que sobrava era que o mecanismo novo creditava cobertura por
convenção — a `RegExp` de mensagem e a categoria extraída dela nunca
eram confrontadas —, e a asserção de saída silenciosa continuava presa
a um único acessor escrito à mão. Este delta fecha as duas, sem tocar
o conjunto de 10 rotas nem o de 27 literais.

| O que decide agora | O que não decide |
| --- | --- |
| `expectRefusal` passa a exigir a categoria declarada pelo controle; a cobertura só é creditada quando ela coincide com a categoria extraída da mensagem realmente lançada. Mensagem sem marcador, marcador com categoria diferente da declarada, e categoria declarada fora dos três arrays em runtime — as três reprovam, nomeando o que faltou | Recusa legítima sem categoria (nascida fora das quatro fábricas que emitem o marcador) continua existindo, agora declarada pelo controle via `NO_REFUSAL_CATEGORY`, em vez de creditar nada em silêncio |
| Os 29 sítios de chamada pré-existentes migraram para declarar categoria, sem nenhuma divergência entre a declarada e a observada; três controles novos e permanentes provam as três saídas do guard sobre o próprio mecanismo | Nenhuma categoria de recusa foi renomeada, remapeada ou teve sua regra de classificação alterada |
| O descarte silencioso deixa de ser casado por uma `RegExp` ancorada em `.get(` e passa a ser enumerado por forma idiomática — condição sobre valor ausente seguida de `continue;`, qualquer identificador, qualquer origem —, com cada ocorrência exigindo registro nomeado com `arquivo:linha` e motivo | O alcance é declarado e limitado: cobre descarte guardado por valor ausente, não todo `continue;` do módulo, e não prova conservação de candidatos |
| A varredura real encontrou 5 sítios de descarte silencioso, não os 2 nomeados no documento do Goal — descoberta sobre texto que já existia na baseline (diff zero de `http-egress-sites.ts`), não ajuste de comportamento | Nenhum dos 5 é candidato descartado; cada um está registrado com o motivo computado de ser inócuo |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
conservação de candidatos**: a enumeração de descarte cobre só a forma
idiomática de valor ausente seguido de `continue;`, não todo
`continue;` do módulo. **Não corrige A-24**: o achado continua
`PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork foi
editado por este Goal. **Não fecha M4.** **Não amplia nem reduz o
conjunto de 10 rotas ou de 27 literais.** `npm run validate:core`
**PASSED** nesta árvore — dos 17 passos, 15 passaram (inclusive
`test:ai-orchestrator`) e 2 pulados por design (`test:bff`,
`test:health-worker`); nenhum falhou. `npm run test:gate` (raiz)
permanece em **226** testes e 0 falhas, inalterado, porque não exercita
este arquivo. `validate:integration` continua recusando por
pré-condição de banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not
set`), declarado como ausente — não é este Goal quem a supre, e não foi
reexecutado por esta unidade de documentação (WU-12). Sobre a árvore
final desta rodada: `npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator` →
**204** testes, **204** passando, **0** falhando (baseline: 200); `npx
vitest run` completo → **1016** testes, **928** passando (baseline:
924), **88** pulados (mesma contagem da baseline), **0** falhando.
`npx tsc -p tsconfig.json --noEmit`: exit 0. `npm run lint` (`eslint
src --max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída.
`git status --porcelain=v1 -uall` lista, ao final desta rodada, só
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` e os
quatro documentos desta migração — nenhum arquivo de `tools/ia-loop/`
foi tocado nesta rodada.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff049-2026-09-22-d-065) e [D-065](DECISIONS.md).

## A conservação do conjunto de egresso vira partição computada por campo, e balde sem origem reprova, do Goal050

O parágrafo anterior fechou a categoria creditada por convenção. O que
sobrava era um nível acima: a asserção que prova que nenhum sítio de
egresso é descartado em silêncio decidia se um sítio "virou requisição"
por uma disjunção cujo segundo ramo era substring de prosa livre sobre
o motivo — a origem da requisição resolvida no chamador só existia
como texto, e o cliente HTTP interno não carregava origem alguma. Este
delta fecha essa abertura, sem tocar o conjunto de 10 rotas nem o de
27 literais.

| O que decide agora | O que não decide |
| --- | --- |
| Toda entrada de saída que nasce de sítio classificado carrega `originSite`, campo estrutural (`Pick<ClassifiedHttpEgressSite, "filePath" \| "line">`), preenchido nos oito sítios de `push`; a ligação entre sítio e balde é sempre por esse campo, nunca por `reason.includes(...)` — o ramo de prosa foi removido | A frase do motivo continua existindo, para quem lê; só deixou de ser dado de prova |
| A conservação é partição computada, nos dois sentidos: sítio sem balde algum reprova, sítio em mais de um balde reprova, entrada de balde cuja origem não corresponde a sítio lido reprova, e categoria que a partição não sabe encaminhar reprova — nunca um `else` mudo | O universo de candidatos é o que `EGRESS_CANDIDATE_UNIVERSE` declara: `sites` e `genericEgressPrimitives` entram, `excluded`/`genericEgressCallers`/`genericEgressCallersByPrimitive` ficam de fora com motivo escrito e conferido; coleção nova do descobridor sem declaração reprova. "Sítio em mais de um balde" é checado dentro do subconjunto de baldes que `egressPartitionBucketsForCategory` roteia para a categoria do sítio, não sempre os cinco — sítios `constructor_base_url_*` roteiam só para `[notGoBound]`, e por isso legitimamente têm `originSite` também em um dos quatro baldes de instanciação do cliente ao mesmo tempo, sem reprovar. Não vácuo: teste permanente (`assistant.service.test.ts:3137`) prova, sobre a árvore real, que esse caso ocorre de fato |
| Os cinco baldes de saída e `DOCUMENTED_SILENT_DISCARDS` passam a exigir motivo não vazio | O registro de descarte deixou de ser chaveado por número de linha — a chave é trecho normalizado mais função que o envolve; deslocamento de linha não reprova em massa, e chave ambígua reprova como saída nova |
| `NO_REFUSAL_CATEGORY` ganhou controle permanente, exercitado sobre uma recusa cujo destino não resolve por env, campo de instância nem parâmetro de chamador | As **5** entradas de `DOCUMENTED_SILENT_DISCARDS` continuam as mesmas da baseline; nenhuma edição deste Goal tocou o texto-fonte que a varredura lê |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
conservação de candidatos dentro das funções de varredura**: a
partição prova conservação entre o descobridor e os baldes de saída,
não dentro delas — um `continue;` sem guarda de valor ausente, ou em
bloco com outra instrução antes, continua fora de alcance. **Não
corrige A-24**: o achado continua `PENDENCIA-POS-MVP`, e nenhum
arquivo Go de produção deste fork foi editado por este Goal. **Não
fecha M4.** **Não amplia nem reduz o conjunto de 10 rotas ou de 27
literais.** `npm run validate:core` **PASSED** nesta árvore — dos 17
passos, 15 passaram (inclusive `test:ai-orchestrator`) e 2 pulados por
design (`test:bff`, `test:health-worker`); nenhum falhou. `npm run
test:gate` (raiz) permanece em **226** testes e 0 falhas, inalterado,
porque não exercita este arquivo. `validate:integration` continua
recusando por pré-condição de banco ausente (`exit 2`,
`BFF_TEST_DATABASE_URL is not set`), declarado como ausente — não é
este Goal quem a supre, e não foi reexecutado por esta unidade de
documentação (WU-06). Sobre a árvore final desta rodada: `npx vitest
run tests/assistant/assistant.service.test.ts` em
`apps/ai-orchestrator` → **215** testes, **215** passando, **0**
falhando (baseline: 204); `npx vitest run` completo → **1027** testes,
**939** passando (baseline: 928), **88** pulados (mesma contagem da
baseline), **0** falhando. `npx tsc -p tsconfig.json --noEmit`: exit
0. `npm run lint` (`eslint src --max-warnings=0`) em
`apps/ai-orchestrator`: exit 0, sem saída. `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
tem **26** inserções e **1** deleção contra a baseline — a primeira
vez desde o Goal047 que este arquivo tem diff não-zero;
`apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem
diff **zero**. `git status --porcelain=v1 -uall` lista, ao final desta
rodada, só `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` e os quatro
documentos desta migração — nenhum arquivo de `tools/ia-loop/` foi
tocado nesta rodada.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff050-2026-09-22-d-066) e [D-066](DECISIONS.md).

**Acréscimo, desde 2026-09-22 (Goal051 / [D-067](DECISIONS.md)):** a
linha da tabela acima que descreve "sítio em mais de um balde" checado
só dentro do subconjunto de baldes que a categoria roteia continua
verdadeira e não foi apagada — mas deixou de ser o único lado
verificado. Até esta data, o lado da **entrada** só cobrava que a
origem declarada fosse um sítio de fato lido e que o motivo não fosse
vazio; nenhuma asserção conferia se o balde em que uma entrada estava
era um dos que a categoria da sua origem permite. **Desde 2026-09-22,
toda entrada dos cinco baldes é conferida contra esse conjunto,
também**, nomeando balde, entrada, origem e categoria quando não
permitida. Ver o parágrafo novo abaixo.

## A partição de egresso passa a conferir as duas mãos, e o universo de saída de `discoverGoServiceHttpRequests` é declarado fail-closed, do Goal051

O parágrafo anterior fechou a conservação do conjunto de egresso como
partição computada por campo, mas só do lado do sítio: para cada
sítio, a checagem perguntava quais baldes sua categoria roteia e
conferia presença só nesses; do lado da entrada, o único requisito era
origem lida e motivo não vazio. Sondagem independente sobre essa
baseline achou **10** das **19** entradas dos cinco baldes num balde
que a categoria da própria origem não roteia, sem asserção nenhuma
sobre elas — a **observação 1** do [review050](reviews/050-review.md).
A **observação 2** do mesmo review: o motivo da requisição resolvida
no chamador repetia `arquivo:linha` da origem como prosa, sem nada que
impedisse a frase e o campo `originSite` de divergir. Um terceiro
achado, desta passada de planejamento: o universo de **saída** de
`discoverGoServiceHttpRequests` não tinha o mesmo tratamento
fail-closed que `EGRESS_CANDIDATE_UNIVERSE` já dava ao universo de
entrada. Este delta fecha as três, sem tocar o conjunto de 10 rotas
nem o de 27 literais.

| O que decide agora | O que não decide |
| --- | --- |
| Toda entrada dos cinco baldes é conferida contra o conjunto que a categoria da sua origem declarada permite — saída própria quando a entrada ocupa a posição do sítio, saída derivada quando não —, nomeando balde, entrada, origem e categoria quando não permitida | A checagem de "exatamente um balde" continua restrita à saída própria por categoria (parágrafo do Goal050 acima, não afrouxado) — a novidade é que a saída derivada também tem, agora, um conjunto permitido explícito, e entrada fora dele reprova |
| O universo de saída de `discoverGoServiceHttpRequests` está declarado, fail-closed: das **7** chaves que o descobridor devolve em runtime, as **5** de `EGRESS_PARTITION_BUCKETS` entram na partição; `internalClientSurfaces` e `callerResolutions` ficam fora, cada uma com motivo escrito e conferido | `internalClientSurfaces` e `callerResolutions` não viraram baldes de destino de sítio — continuam relatórios do que a resolução leu, sem `originSite` próprio |
| Cada um dos cinco baldes tem não-vacuidade asserida sobre a árvore real (`requests`, `notGoBound`, `assembledUrls`, `nonGoBoundInstantiations`) ou tem o sentido inverso exercido por árvore sintética (`nonTransportMemberCalls`, vazio hoje: o controle negativo 2 do Goal044 prova que o balde recebe entrada, e o controle negativo 7 do escopo §8, dedicado, prova que entrada de origem não permitida nesse balde reprova) | Nenhum balde novo foi criado, e a lista de cinco baldes de `EGRESS_PARTITION_BUCKETS` não mudou |
| O trecho do `reason` que cita a posição da origem, na requisição resolvida no chamador, passa a ser computado do campo `originSite` — os dois não podem mais divergir por construção | A frase continua existindo, prosa útil para quem lê; só a parte que citava a posição deixou de poder divergir do dado |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
conservação de candidatos dentro das funções de varredura**: a
partição continua provando conservação entre o descobridor e os
baldes de saída, não dentro delas — limite herdado do Goal050, não
afrouxado. **Não corrige A-24**: o achado continua `PENDENCIA-POS-MVP`,
e nenhum arquivo Go de produção deste fork foi editado por este Goal.
**Não fecha M4.** **Não amplia nem reduz o conjunto de 10 rotas ou de
27 literais.** `npm run validate:core` **PASSED** nesta árvore — dos
17 passos, 15 passaram (inclusive `test:ai-orchestrator`) e 2 pulados
por design (`test:bff`, `test:health-worker`); nenhum falhou. `npm run
test:gate` (raiz) permanece em **226** testes e 0 falhas, inalterado,
porque não exercita este arquivo. `validate:integration` continua
recusando por pré-condição de banco ausente (`exit 2`,
`BFF_TEST_DATABASE_URL is not set`), declarado como ausente — não é
este Goal quem a supre. Sobre a árvore final desta rodada: `npx vitest
run tests/assistant/assistant.service.test.ts` em
`apps/ai-orchestrator` → **227** testes, **227** passando, **0**
falhando (baseline: 215); `npx vitest run` completo → **1039** testes,
**951** passando (baseline: 939), **88** pulados (mesma contagem da
baseline), **0** falhando. `npx tsc -p tsconfig.json --noEmit`: exit
0. `npm run lint` (`eslint src --max-warnings=0`) em
`apps/ai-orchestrator`: exit 0, sem saída. `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
tem **3** inserções e **2** deleções contra a baseline (**3887**
linhas; baseline: 3886) — diff pequeno e localizado, só a montagem do
motivo da requisição resolvida no chamador;
`apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem
diff **zero**. `git status --porcelain=v1 -uall` lista, ao final desta
rodada, só `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` e os quatro
documentos desta migração — nenhum arquivo de `tools/ia-loop/` foi
tocado nesta rodada.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff051-2026-09-22-d-067) e [D-067](DECISIONS.md).

**Acréscimo, desde 2026-09-22 (Goal052 / [D-068](DECISIONS.md)):** o
parágrafo do Goal049 acima ("O descarte silencioso deixa de ser casado
por uma `RegExp`...") e o parágrafo do Goal050 sobre "**Não prova
conservação de candidatos dentro das funções de varredura**" (duas
seções acima) continuam verdadeiros e não foram apagados — mas o
alcance PARCIAL que os dois declaravam para a enumeração de descarte
ficou mais estreito. Até esta data, `findSilentDiscardLines`
reconhecia só a forma de guarda idiomática (`if (<condição sobre valor
ausente>) continue;`), e o total de `continue;` do módulo vivia
escrito à mão num comentário, sem asserção conferindo o número. **Desde
2026-09-22, a enumeração acha toda ocorrência de `continue;` do
módulo, com o total computado em runtime**, e cada ocorrência cai numa
classe do vocabulário `CONTINUE_LOOP_FORMS`, com resíduo zero sobre a
árvore real. O que continua fora, sem mudança — herdado de D-065 e
reafirmado por D-068 —, é a conservação de candidatos **dentro** das
funções de varredura: um `continue;` registrado ou classificado prova
que está nomeado, não que o candidato descartado não importava. Ver o
parágrafo novo abaixo.

## O descarte é enumerado por inteiro: toda ocorrência de `continue;` é classificada pela forma do laço, e a classe portadora de candidato tem chave por multiplicidade declarada, do Goal052

O parágrafo do Goal049 introduziu a enumeração de descarte silencioso
por forma idiomática; o do Goal050/051 estreitou a conservação do
conjunto de egresso, um nível acima. O que sobrava, um nível abaixo de
todos eles: a isenção do descarte de candidato continuava sendo
silêncio, não critério computado — `findSilentDiscardLines` só via a
forma de guarda, e o total de **120** ocorrências de `continue;` do
módulo vivia escrito à mão num comentário, sem asserção alguma. Este
delta fecha essa abertura, sem tocar o conjunto de 10 rotas nem o de
27 literais e sem alterar regra de classificação de egresso alguma.

| O que decide agora | O que não decide |
| --- | --- |
| A enumeração acha toda ocorrência de `continue;` do módulo (`enumerateContinueOccurrences`), com o total computado em runtime — **120** ocorrências na árvore real, todas em contexto `code`; o comentário que antes carregava o número à mão não o carrega mais | Ocorrência em literal de string, template ou comentário é reconhecida e nomeada pelo contexto léxico, mas o ramo é vazio na árvore real hoje — exercido por fonte sintética, não morto |
| Cada ocorrência cai numa classe computada do vocabulário fechado `CONTINUE_LOOP_FORMS` (`for-of` **41**, `for-indexed` **55**, `while-exec-match` **18**, `while-positional-read` **5**, `while-queue-drain` **1**, `for-in` e `do-while` vazios na árvore real); ocorrência cujo laço não resolve, ou classe fora do vocabulário, reprova nomeando `arquivo:linha` — resíduo zero sobre a árvore real, inclusive as 5 ocorrências (`:1761`, `:1765`, `:1769`, `:1773`, `:1796`) em que a sondagem por indentação do próprio Goal falhava | A classificação é por casamento de parênteses/chaves sobre texto mascarado, nunca por recuo de indentação — a técnica antiga não é reaproveitada |
| `while` é partido em **três** classes, cada uma com critério textual próprio: atribuição de `.exec(` (`while-exec-match`), não-vaziez da própria coleção (`while-queue-drain`) e cursor escalar contra limite (`while-positional-read`); cabeçalho de `while` fora dos três **reprova** nomeando `arquivo:linha`, exercido por fonte sintética no controle 3 | Não há classe de sobra para `while`. Até a rodada 1 deste Goal um único `while-condition` sem critério isentava em bloco as 6 ocorrências, inclusive `http-egress-sites.ts:1028`, que é descarte de candidato — esse fail-open está fechado |
| A classe iteração sobre candidatos (`for-of`, `while-exec-match`, `while-queue-drain`) exige registro com motivo não vazio; `DOCUMENTED_SILENT_DISCARDS` cresceu de **5** para **43** entradas, cobrindo as **60** ocorrências reais dessa classe, com as quatro saídas fail-closed (`ambiguousKeys`, `unregistered`, `obsolete`, `emptyReason`) vazias sobre a árvore real | A classe leitura posicional (`for-indexed`, `while-positional-read`) continua isenta pelo critério computado do laço, sem registro por ocorrência — não é isenção por prosa |
| A chave sobrevive à forma nua por multiplicidade declarada (`SilentDiscardEntry.multiplicity`): contagem real divergente da declarada reprova nos dois sentidos, sem número de linha | Deslocamento de linha continua não reprovando em massa — o controle 6 do escopo §9 prova, na forma nova, a mesma garantia do Goal050 |
| O ponteiro de prosa de `:3483` passou a citar `:4314` em vez de `:4199` | Nenhum outro ponteiro de prosa foi alterado — não é varredura geral |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
conservação de candidatos dentro das funções de varredura**: registrar
ou classificar um `continue;` diz que ele está nomeado e justificado,
não que o candidato descartado não importava — limite herdado de
D-065/D-066/D-067, não afrouxado. **Não amplia a enumeração a
`return`, `break` ou saída antecipada de função**: o alcance é
`continue;`, e o que fica fora continua declarado como fora, agora com
o número computado em vez de estimado. **Não corrige A-24**: o achado
continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste
fork foi editado por este Goal. **Não fecha M4. Não amplia nem reduz o
conjunto de 10 rotas ou de 27 literais. Nenhuma categoria de recusa,
regra de classificação de egresso ou isenção foi alterada.** `npm run
validate:core` **PASSED** nesta árvore — dos 17 passos, 15 passaram
(inclusive `test:ai-orchestrator`) e 2 pulados por design (`test:bff`,
`test:health-worker`); nenhum falhou. `npm run test:gate` (raiz)
permanece em **226** testes e 0 falhas, inalterado, porque não
exercita este arquivo. `validate:integration` continua recusando por
pré-condição de banco ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not
set`), declarado como ausente — não é este Goal quem a supre. Sobre a
árvore final desta rodada: `npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator` →
**249** testes, **249** passando, **0** falhando (baseline: 227); `npx
vitest run` completo → **1061** testes, **973** passando (baseline:
951), **88** pulados (mesma contagem da baseline), **0** falhando.
`npx tsc -p tsconfig.json --noEmit`: exit 0. `npm run lint` (`eslint
src --max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída.
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` está
**intocado** (diff zero; **3887** linhas, mesma contagem da baseline);
`apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem
diff **zero**. `git status --porcelain=v1 -uall` lista, ao final desta
rodada, só `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
e os quatro documentos desta migração — nenhum arquivo de
`tools/ia-loop/` foi tocado nesta rodada.

**Acréscimo, desde 2026-09-22 (Goal053 / [D-069](DECISIONS.md)):** a
linha da tabela acima — "a classe leitura posicional (`for-indexed`,
`while-positional-read`) continua isenta pelo critério computado do
laço, sem registro por ocorrência — não é isenção por prosa" — não é
apagada, mas passou a estar **incompleta sozinha**: isentar pela classe
do cabeçalho, sem olhar o que o cursor percorre, **era fail-open**,
medido sobre **6** ocorrências reais (`http-egress-sites.ts:1141`,
`:1143`, `:1157`, `:1159`, `:1160`, `:3872`, todas `for-indexed` sobre
`lines`, produzido por `.split(…)`). Ver seção seguinte para o critério
vigente desde esta rodada.

## O critério da isenção passa a ser o domínio percorrido, não a forma do cabeçalho, do Goal053

O parágrafo do Goal052 computava a classe do cabeçalho do laço
(`CONTINUE_LOOP_FORMS`) e isentava toda leitura posicional só por essa
forma. O que sobrava: classe computada não é o mesmo que critério
computado — a classe mede a forma sintática do cabeçalho, não o
**domínio que o cursor percorre**. Este delta fecha essa abertura, sem
tocar o conjunto de 10 rotas nem o de 27 literais e sem alterar regra de
classificação de egresso alguma.

| O que decide agora | O que não decide |
| --- | --- |
| Cada ocorrência em contexto `code` ganha um domínio computado do vocabulário fechado `CONTINUE_CURSOR_DOMAINS` (**sequência de caracteres**, **máscara paralela**, **coleção de elementos**, **sem domínio**). Para as três primeiras classes, a evidência é registrada por ocorrência citando `arquivo:linha` da ligação que a provou — nunca lista de nomes de variável, indentação ou nome de função; as **60** ocorrências `no-domain` não citam ligação alguma, porque o laço já consome candidato diretamente — sua evidência nomeia a forma do laço e o cabeçalho. Sobre a árvore real: **60** `no-domain`, **54** `character-sequence`, **6** `element-collection`, **0** `parallel-mask` (vazio, exercido por fonte sintética) — soma **120** | Domínio não resolvido, ou fora do vocabulário, **reprova** nomeando `arquivo:linha` e o motivo — nenhum ramo `else` mudo isenta em silêncio |
| `parallel-mask` tem **duas** provas: (a) o comprimento do arranjo vem do comprimento de uma sequência de caracteres; (b) o mesmo cursor indexa o arranjo **e** uma sequência de caracteres no mesmo corpo, mesmo sem a forma do arranjo provar relação alguma com `.length` — a prova (b) amplia a isenção, porque sem ela esse arranjo reprovaria como resíduo por forma não provada | `parallel-mask` computa **0** na árvore real porque a única máscara paralela real (prova (b)) compartilha cursor com uma sequência de caracteres, e a precedência de aperto dá o domínio final à sequência; prova (b) é exercida pela árvore real (mascarada pela precedência), só prova (a) precisa de fonte sintética |
| A isenção de leitura posicional (`for-indexed`, `while-positional-read`) passa a depender do domínio: `character-sequence` e `parallel-mask` continuam isentando; `element-collection` passa a **exigir registro**, mesmo em `for-indexed` | A classe iteração sobre candidatos (`for-of`, `while-exec-match`, `while-queue-drain`) continua exigindo registro independentemente do domínio — nada do Goal052 foi afrouxado |
| As **6** ocorrências reais sobre `lines` (`:1141`, `:1143`, `:1157`, `:1159`, `:1160`, `:3872`) passam a exigir registro; `DOCUMENTED_SILENT_DISCARDS` cresceu de **43** para **47** entradas — as 2 de `readEnvSchemaDefault` são reaproveitadas e agora conferidas de verdade, e as 4 novas cobrem `readEnvFileValue` (3) e `readProductTransportRoutesFile` (1) | Multiplicidade e a proibição de chave por linha (Goal050) não mudam; deslocamento de linha continua não reprovando em massa |
| `while` posicional (**5** ocorrências reais: `:1458`, `:1484`, `:2989`, `:2996`, `:2999`) continua isento porque o domínio que indexa é `character-sequence`; a prova de que a mesma forma sobre `element-collection` exigiria registro é por fonte sintética | Não há isenção de `while` posicional por forma sozinha desde esta rodada — a isenção sempre passa pelo domínio |
| Oito controles negativos permanentes provam as amarras do escopo §9 do Goal053, cada um chamando a mesma conta que o teste permanente chama | Nenhum dos oito controles do escopo §9 do Goal052 foi removido — foram adaptados ao critério novo |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
conservação de candidatos dentro das funções de varredura**: registrar
um descarte com motivo escrito diz que ele está nomeado e justificado,
não que o candidato descartado não importava — limite herdado de
D-065/D-066/D-067/D-068, não afrouxado. O domínio resolve **o que o
cursor indexa**, não **se o descarte perde candidato que importe**.
**Não amplia a enumeração a `return`, `break` ou saída antecipada de
função**: o alcance continua sendo `continue;`. **Não corrige A-24**: o
achado continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção
deste fork foi editado por este Goal. **Não fecha M4. Não amplia nem
reduz o conjunto de 10 rotas ou de 27 literais. Nenhuma categoria de
recusa, regra de classificação de egresso ou isenção de egresso foi
alterada.** Sobre a árvore final desta rodada: `npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator` →
**255** testes, **255** passando, **0** falhando (baseline: 249); `npx
vitest run` completo → **1067** testes, **979** passando (baseline:
973), **88** pulados (mesma contagem da baseline), **0** falhando. `npx
tsc -p tsconfig.json --noEmit`: sem saída, exit 0. `npm run lint`
(`eslint src --max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem
saída. `npm run test:gate` (raiz) permanece em **226** testes e 0
falhas, inalterado. `validate:integration` não foi reexecutado nesta
rodada: nada no diff toca banco, infraestrutura ou pré-condição, e o
comportamento herdado da baseline (recusa por `BFF_TEST_DATABASE_URL`
ausente, `exit 2`) não muda.
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` está
**intocado** (diff zero; **3887** linhas, mesma contagem da baseline);
`apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem
diff **zero**. `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
concentra o diff inteiro contra a baseline `2adb7cabf2cc09707287e1d440d6041b51d6cfe9`:
**1115** inserções, **37** deleções (**11631** linhas, baseline:
**10553**).

**Acréscimo, desde 2026-09-22 (Goal054 / [D-070](DECISIONS.md)):** a
frase acima — "**Não amplia a enumeração a `return`, `break` ou saída
antecipada de função**: o alcance continua sendo `continue;`" — não é
apagada, mas deixou de valer sozinha desde esta rodada: aquele alcance de
uma forma só era **fail-open medido**, não hipotético, sobre as **6**
ocorrências reais do escopo §5 do Goal054 (`:591`, `:2037`, `:2316` de
`break;` e `:576`, `:1144`, `:1161` de saída antecipada de função, todas
em laço portador de candidato ou sobre domínio `element-collection`, e
nenhuma tinha enumeração, classe, domínio, exigência ou resíduo antes
desta rodada). Ver seção seguinte para o vocabulário vigente desde esta
rodada.

## O alfabeto do descarte é completo: `break`, saída antecipada de função e as formas vazias entram na mesma enumeração, do Goal054

O parágrafo do Goal053 fechou o **critério** de isenção para a única
forma que a máquina conhecia; a máquina em si só via `continue;`. O que
sobrava: `break` e saída antecipada de função são **piores** que
`continue;`, porque não descartam um elemento — descartam todo o resto do
domínio percorrido ou a varredura inteira —, e nenhuma das duas tinha
enumeração, classe, domínio, exigência ou resíduo. Este delta fecha essa
abertura, sem tocar o conjunto de 10 rotas nem o de 27 literais e sem
alterar regra de classificação de egresso alguma.

| O que decide agora | O que não decide |
| --- | --- |
| A enumeração passa a percorrer um vocabulário fechado de **cinco** formas (`DISCARD_FORMS`, `assistant.service.test.ts:8056`): `continue`, `break`, `function-early-exit` (saída antecipada da função que contém o cabeçalho do laço), `nested-function-return` (`return` de função aninhada no corpo do laço) e `switch-break` (`break` cujo bloco mais próximo é um `switch`) | Forma fora do vocabulário **reprova**, nomeando `arquivo:linha`; `break`/`continue` rotulado usa as mesmas formas `break`/`continue` — o rótulo muda o laço abandonado, nunca a forma |
| A fronteira de função é computada por casamento de delimitadores sobre texto mascarado, nunca por indentação, nome de função ou lista escrita à mão: `return` de função aninhada não conta como saída antecipada, porque o laço segue percorrendo o domínio do mesmo jeito | Fronteira não resolvida **reprova**, nomeando `arquivo:linha` e o motivo — só `function-early-exit` e `nested-function-return` têm fronteira |
| A exigência de motivo combina forma, classe de laço e domínio: `character-sequence`/`parallel-mask` seguem isentos em qualquer forma; `element-collection` exige registro em qualquer forma; as classes já portadoras de candidato do Goal052 continuam exigindo registro em qualquer forma; `switch-break` e `nested-function-return` nunca exigem registro, com evidência computada própria | Nada do Goal052/053 foi afrouxado: o total de **120** ocorrências de `continue;` e a soma por classe/domínio continuam reconstruindo o mesmo total |
| **6** ocorrências reais passam a exigir registro — **3** de `break` (`:591`, `:2037`, `:2316`) e **3** de `function-early-exit` (`:576`, `:1144`, `:1161`); `DOCUMENTED_SILENT_DISCARDS` cresceu de **47** para **53** entradas, sem duplicar as existentes, com chave que distingue forma | `throw` fica fora do alfabeto, declarado, por não ser descarte silencioso — não foi enumerado |
| Sobre a árvore real: **143** ocorrências em código — `continue` **120**, `break` **6**, `function-early-exit` **17**; `nested-function-return` e `switch-break` computam **0** e são exercidos por fonte sintética; `unresolved` e `outsideVocabulary` vazias | `byCursorDomain` reconstrói **143**: `no-domain` **64**, `character-sequence` **71**, `element-collection` **8**, `parallel-mask` **0** |
| Dez controles negativos novos do escopo §10 mordem, cada um chamando a mesma conta que o teste permanente chama, com as duas saídas — cinco por fonte sintética (fronteira, `switch-break`/rótulo, isenção por domínio movida de classe) | Os oito controles do escopo §9 do Goal053 continuam mordendo, adaptados ao alfabeto novo — nenhum foi removido |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
conservação de candidatos dentro das funções de varredura**: registrar um
`break` ou uma saída antecipada com motivo escrito diz que o abandono
está nomeado e justificado, não que o candidato abandonado não importava
— limite herdado de D-065/D-066/D-067/D-068/D-069, não afrouxado. **Não
amplia o alfabeto para `throw`**: aborta a execução inteira e é ruidoso
por construção, não é descarte silencioso. **Não corrige A-24**: o achado
continua `PENDENCIA-POS-MVP`, e nenhum arquivo Go de produção deste fork
foi editado por este Goal. **Não fecha M4. Não amplia nem reduz o
conjunto de 10 rotas ou de 27 literais. Nenhuma categoria de recusa, regra
de classificação de egresso ou isenção de egresso foi alterada.** Sobre a
árvore final desta rodada: `npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator` →
**283** testes, **283** passando, **0** falhando (baseline: 255); `npx
vitest run` completo → **1095** testes, **1007** passando (baseline:
979), **88** pulados (mesma contagem da baseline), **0** falhando. `npx
tsc -p tsconfig.json --noEmit`: sem saída, exit 0. `npm run lint`
(`eslint src --max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem
saída. `npm run test:gate` (raiz) permanece em **226** testes e 0
falhas, inalterado. `validate:integration` não foi reexecutado nesta
rodada: nada no diff toca banco, infraestrutura ou pré-condição, e o
comportamento herdado da baseline (recusa por `BFF_TEST_DATABASE_URL`
ausente, `exit 2`) não muda.
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` está
**intocado** (diff zero; **3887** linhas, mesma contagem da baseline);
`apps/ai-orchestrator/tests/support/product-transport-routes.txt` tem
diff **zero**. `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
concentra o diff inteiro contra a baseline `d3e76645d3042e66eb9559f33fef9dda40904809`:
**2820** inserções, **215** deleções (**14236** linhas, baseline:
**11631**).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff052-2026-09-22-d-068) e [D-068](DECISIONS.md).

**Acréscimo, desde 2026-09-26 (Goal055 / [D-071](DECISIONS.md)):** a
linha da tabela acima — "A exigência de motivo combina forma, classe de
laço e domínio: `character-sequence`/`parallel-mask` seguem isentos em
qualquer forma; [...] `no-domain` em classe não portadora" (critério dos
quatro eixos do Goal054) — não é apagada, mas deixou de valer sozinha
desde esta rodada: a isenção por um eixo só era **fail-open medido**, não
hipotético, sobre as **8** ocorrências reais do escopo §5 do Goal055
(`:225`, `:228`, `:232`, `:236`, `:240` de `splitTopLevelItems`; `:1458`
e `:1479` de `splitTemplateLiteralParts`; `:2989` de
`findTopLevelMethodBodies`), todas isentas pelo domínio
`character-sequence` e todas abandonando região com `.push(` do próprio
corpo. Desde esta rodada, a isenção dos quatro eixos só é concedida
quando a região abandonada é livre de produção. Ver seção seguinte.

## A isenção é provada pelo que o descarte abandona: a região abandonada, o vocabulário de produção e um quinto eixo que só retira, do Goal055

O parágrafo do Goal054 fechou o **alfabeto** do descarte; o critério de
isenção continuava decidido só pelo antecedente (domínio ou classe), e o
consequente ("cada volta avança leitura, nunca descarta candidato") não
era conferido. Este delta o torna cômputo, sem tocar o conjunto de 10
rotas nem o de 27 literais e sem alterar regra de classificação de
egresso alguma.

| O que decide agora | O que não decide |
| --- | --- |
| Região abandonada por ocorrência (`resolveDiscardAbandonedRegion`, `assistant.service.test.ts:8251`): `continue`/`break` até o fim do corpo do laço (o do rótulo, quando há), `function-early-exit` do fim do `return` até o fim do corpo da função; na árvore real **120** + **6** + **17** regiões, **0** não resolvidas | `switch-break` e `nested-function-return` não têm região — isentos pela forma, como no Goal054; `break` abandonar as voltas seguintes é declarado, não computado |
| Vocabulário fechado `DISCARD_PRODUCING_OPERATIONS` (`:8323`: `push`, `add`, `set`), conferido nos dois sentidos — **51**/**14**/**5** na árvore real; operação reconhecida fora dele (`unshift`, `splice`, `append`) reprova nomeada | Método que devolve valor sem gravá-lo em estrutura que sobrevive não é produção |
| Fecho sobre as funções de módulo (`buildDiscardModuleProduction`, `:8647`), uma vez por arquivo: **89** funções, **23** produtoras diretas, **28** pelo fecho, **1** volta, estável | Chamada a destino que não é função de módulo (método de `string`/`Array`/`RegExp`, construtor, importada) não é produção — limite declarado, ramo `:8675` e filtro `:8785` |
| Eixo 5 em `resolveSilentDiscardRequirement` (`:11077`/`:11084`), depois dos quatro do Goal054 (intocados em `:10945`): região com produção exige registro nomeando `arquivo:linha` da produção; não resolvida exige e vai ao resíduo; livre isenta com as duas evidências | O eixo 5 nunca concede isenção: **0** das **72** ocorrências que os quatro eixos mandavam registrar passou a isenta, conferido ocorrência a ocorrência |
| Árvore real: **63** isentas com região livre, **8** desisentadas (todas por produção direta), `DOCUMENTED_SILENT_DISCARDS` de **53** para **57** entradas | Não prova conservação de candidatos dentro das funções de varredura na forma geral — limite de D-065 a D-070 |

Sobre a árvore final desta rodada: `npx vitest run
tests/assistant/assistant.service.test.ts` → **299** testes, **299**
passando (baseline 283); `npx vitest run` completo → **1111** testes,
**1023** passando (baseline 1007), **88** pulados, **0** falhando; `npm
run typecheck`, `npm run lint` e `npm run validate:core` exit 0; `npm run
test:gate` **226**/**226**; `npm run validate:integration` `exit 2`,
`validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`.
`http-egress-sites.ts` e `product-transport-routes.txt` com diff zero;
`assistant.service.test.ts` com **1810** inserções e **12** deleções
contra `0851b3362ced899954a5f19600e2a06944e6a913` (`git diff --histogram
--numstat`). **A-24 continua `PENDENCIA-POS-MVP`.**

Ver [CURRENT_STATE](CURRENT_STATE.md) e [D-071](DECISIONS.md).

## A-24 é corrigido: o serviço Go recusa `ButtonText` vazio em vez de compor `"Ver Menu"`, do Goal056

[D-058](DECISIONS.md) tinha deixado A-24 `PENDENCIA-POS-MVP` porque o
fork não podia ser editado naquele Goal; o Goal043 (§20) computou a
condição de rebaixamento em vez de descrevê-la em prosa; este delta
corrige o defeito na origem, sem tocar os conjuntos de 10 rotas ou de 27
literais além da entrada que o próprio literal composto ocupava.

| O que decide agora | O que não decide |
| --- | --- |
| `SendList` (`send_service.go:1953`–`:1955`) devolve `"button text is required"` quando `ButtonText` chega vazio, antes de qualquer uso de cliente, instância ou rede; `sectionsToString` (`:1878`, sem chamador) não ganha recusa, só perde a fallback; `grep -rn '"Ver Menu"' apps/evolution-go --include=*.go`, excluindo `whatsmeow-lib/` e `_test.go`, não acha ocorrência em código de produção | `sectionsToString` não foi apagada — continua sem chamador, por não ser escopo deste Goal; um chamador futuro mudaria o guard de alcance por rota |
| `expectedGoProseLiterals` e `expectedProseLiteralsReachedFromRegisteredRoutes` perdem a entrada `"Ver Menu"`: **27 → 26** entradas cada, nas mesmas **5** rotas; `TestGoal056RemovesTheProductProseLiteralFromTheTree` prova, sobre `GoProseLiteralsReachingTransport()` e `ProseReachOfEveryRegisteredRoute()`, que nenhum literal Go não vazio escreve no campo `ButtonText`, por campo e não só por conteúdo, e que o conjunto asserido não tem `"Ver Menu"` em nenhuma entrada | `expectedProseLiteralsReachedFromProductRoutes` continua vazio e as **10** rotas do produto têm diff zero — a fronteira que o Goal043 provou não muda |
| `expectedOffRelaySources` perde a entrada `send_service.go:1996`, `ListMessage.ButtonText`, `SourceBranchDependent`: a escrita final está em `:1990`, categoria computada `SourceRouteBody` (`value_from_route_body_parameter`), a mesma do relé direto do corpo recebido, e por isso não é mais candidata ao conjunto — não foi recategorizada para outra categoria fora do relé, foi removida | As demais entradas de `send_service.go` nos três testes de `transportguard` mudam só de linha, nunca de conteúdo, campo ou rota |
| Documentação segue o handler: comentário do campo, `@Description`, `docs.go`, `swagger.json`, `swagger.yaml` e as linhas de `buttonText`, `title` e `footerText` da tabela da wiki passam a dizer obrigatório/`400` | Nenhum outro campo da tabela é tocado |
| Teste novo `TestSendList_EmptyButtonText_ReturnsErrorBeforeUsingClient` (`send_service_list_test.go`), sem cliente WhatsApp — `PASS`; o arquivo é `_test.go` e fica fora de `DiscoverProductionGoFiles` (`pkg/transportguard/sources.go:60`) — a contagem de arquivos de produção é **65** tanto na baseline `4041db2` quanto na árvore final, e o total de `.go` de `pkg/`+`cmd/` sobe **90 → 91**, o **+1** do arquivo de teste | Um segundo caso, provando `ButtonText` não vazio intacto até `ListMessage`, não é viável sem fabricar dependência: `listMessage` é variável local (`:1987`–`:1994`) passada direto para `s.SendMessage(instance, msg, ...)` (`:2001`), que depende de cliente e instância reais — não há ponto de observação antes do envio |
| Controle negativo, executado de forma independente na rodada de correção (FIX-001, rodada 4) sobre a árvore já corrigida (`8d37112`): `if data.ButtonText == "" { return ... }` (`:1953`–`:1955`) trocado por `buttonText := data.ButtonText; if buttonText == "" { buttonText = "Ver Menu" }`, e o campo `ButtonText` (`:1990`) voltando a ler `proto.String(buttonText)` — as duas trocas juntas, senão não compila. Reprova `go test ./pkg/transportguard/...` em quatro testes — `TestGoProseLiteralsReachingTransportAreAssertedElementByElement` (`go_prose_test.go:93`, `:1955`, `"Ver Menu"` em `[ButtonText]`), `TestOffRelaySourceSetIsAssertedElementByElement` (`off_relay_test.go:180`, `:1991`, `ListMessage.ButtonText`/`value_bound_differently_per_branch`), `TestProseLiteralsReachedFromEveryRegisteredRouteAreAssertedElementByElement` (`route_reach_test.go:251`, `POST /send/list` → `:1955`) e `TestGoal056RemovesTheProductProseLiteralFromTheTree` (`route_reach_test.go:292`, `:1955`); as entradas seguintes reprovam só por deslocamento de uma linha (`:1962`/`:1968` → `:1963`/`:1969`; `:1975`/`:1977`/`:1981` → `:1976`/`:1978`/`:1982`); um segundo rótulo, `"Abrir"`, reprova pelos mesmos quatro testes, pelo campo em vez do conteúdo | Revertido cada um, a suíte volta a `PASS`, sem resto na árvore; `git diff --stat` sobre `send_service.go` confere com o diff real desta Work Unit, **+5/-11** (não **+9/-11**, número da rodada 1) |

**O que este delta não prova, e é preciso dizer alto.** **Não prova
runtime**: nada aqui executa o serviço Go, abre conexão whatsmeow ou
observa o que chega a um telefone. **Não prova qual binário roda em
produção**.

Sobre a árvore final desta rodada: `go test ./pkg/transportguard/...`
`PASS`; `go test ./...` em `apps/evolution-go` — **62** testes de topo
(**175** com subtestes), **0** falhando; `npm run validate:core` — **15**
passos `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0**
`failed`, exit 0; `npm run test:gate` **226**/**226**, mesma contagem da
baseline. **A-24 corrigido.**

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff056-2026-09-26-d-072),
[FINAL_AUDIT §33](FINAL_AUDIT.md) e [D-072](DECISIONS.md).

## QA A-01 e QA H-09 são corrigidos: a resposta não afirma efeito não gravado, e a Home conta agendamento, não reserva, do Goal057

`apps/ai-orchestrator/` ganha um guard determinístico e uma métrica corrigida; nenhuma tool, contrato ou schema muda.

| O que decide agora | O que não decide |
| --- | --- |
| `guardCommitmentClaim` (`assistant.service.ts:952`), chamado por `completeGraphTurn` (`:881`) antes de `prisma.message.create`: bloqueia texto que afirma efeito (`findCommitmentClaims`, vocabulário fechado `COMMITMENT_CLAIM_VOCABULARY`) quando há `pendingAction` do tipo correspondente não consumido e nenhuma `AiToolCall` `SUCCEEDED` do `AiRun` confirmou o efeito (`loadTurnConfirmedEffects`, lê o ledger, nunca o JSON da decisão) | Afirmação sem nenhum rascunho pendente passa sem checagem — o guard não lê a agenda para distinguir de fato verdadeiro; limite declarado em [D-073](DECISIONS.md) |
| Na violação sai o texto fixo `PRODUCT_OWN_FIXED_TEXTS.commitmentNotRecorded`, com log `warn` sem texto de cliente/modelo e `AiRun.outputText` preservando a saída original; sem segunda chamada ao modelo, sem handoff | Falso positivo do vocabulário é fail-closed: vira o mesmo texto fixo, nunca uma confirmação inventada — inclusive quando o termo genérico de confirmação casa com o tipo do rascunho `cancel`/`reschedule` sem afirmar esse efeito (limite concreto em [D-073](DECISIONS.md)) |
| `normalizeModelDashes`, antes do guard: U+2014 sempre e U+2013 cercado de espaço viram vírgula; faixa numérica sem espaço (`10–11`) intocada; nenhum texto de `PRODUCT_OWN_TEXTS` nem literal enviado ao modelo (`prompts/system.ts`, `prompts/summary.ts`) contém U+2014 | `PROMPT_TEMPLATE_VERSION` sobe de `v6` para `v7`; hashes de `system.test.ts` recalculados pela execução |
| `aiAppointmentsToday` (`routes.ts:1150`) soma 1 por `create_appointment` `SUCCEEDED` `action=confirm`, mais as ocorrências confirmadas de `confirm_recurring_appointments`; `prepare`, falha, hold vencido, remarcação e cancelamento não contam | Nome, tipo e schema do campo não mudam; BFF e Home não são tocados |
| `tests/assistant/commitment-claim-guard.test.ts` (**50** testes), `tests/evals/commitment-claim.eval.test.ts` (**8** testes, runtime real do `AssistantService`, cobrindo vocabulário dedicado e genérico em remarcação/cancelamento) e `tests/internal/dashboard-ai-appointments.routes.test.ts` (**9** testes) — os três novos, **67** testes, **67** passando | Aderência do modelo real ao prompt fora de prova (D-050): o eval usa dublê roteirizado |

**Quatro controles negativos, executados e revertidos por esta Work Unit.** (1) Guard desligado (`guardCommitmentClaim` retorna o texto sem checagem): reprova **16** de **58** testes nos dois arquivos de guard/eval (**10** de **50** no guard, **6** de **8** no eval). (2) Evidência lida do JSON da decisão em vez do ledger (`appointmentDraftPatch.status === "confirmed"` aceito como `confirm`): reprova **1** de **58**, o teste "a evidência nunca sai do JSON da decisão". (3) Métrica antiga restaurada (`aiAppointmentsToday = confirmedAppointmentCalls.length`): reprova **3** de **9** testes de rota, incluindo "prepare sem confirm da 0" (dá **1**, não **0**). (4) Normalização de travessão removida: reprova **2** de **58**, o teste de travessão do guard e o caso de travessão do eval. Revertido cada um, os três arquivos voltam a **67**/**67** passando; `git status --porcelain=v1 -uall` não mostra resto de controle.

**O que este delta não prova.** **Não prova aderência do modelo real ao prompt** (D-050): o eval usa dublê roteirizado.

Rodados nesta rodada de correção (FIX-001, rodada 4), sobre a árvore final: `npm run typecheck` (`apps/ai-orchestrator`: `prisma generate && tsc -p tsconfig.json --noEmit`) exit 0; `npm run lint` (`apps/ai-orchestrator`: `eslint src --max-warnings=0`) exit 0; `npm test` (`apps/ai-orchestrator`, `vitest run`, suíte completa) — **83** arquivos passando, **12** pulados, **1099** testes passando, **88** pulados, **0** falhando; `npm run validate:core` — **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`, exit 0, com `test:gate-scripts` em **226**/**226**, mesma contagem da baseline.

Sobre a árvore desta Work Unit: `npx vitest run
tests/assistant/commitment-claim-guard.test.ts
tests/evals/commitment-claim.eval.test.ts
tests/internal/dashboard-ai-appointments.routes.test.ts` → **67** testes,
**67** passando, **0** falhando, depois de cada controle negativo
revertido. **QA A-01 e QA H-09 corrigidos, fora da contagem A-01…A-24.**

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff057-2026-09-27-d-073),
[FINAL_AUDIT §34](FINAL_AUDIT.md) e [D-073](DECISIONS.md).

## A área logada volta a ter casca, e o gate autenticado passa a medir a composição, do Goal058

O passo `rehearse:goal033-authenticated-ui` continua o mesmo passo de `validate:integration`, com a mesma sessão digitada em `/login`, as mesmas sete rotas e as mesmas cinco larguras. O que muda é o que ele mede. As cinco medidas descritas acima (overflow, alvo de toque, contraste, foco, movimento) continuam, sem exceção nova em `KNOWN_SMALL_TARGETS` ou `KNOWN_CONTRAST_FAILURES`.

| O que decide agora | O que não decide |
| --- | --- |
| **Composição**, por rota e largura (`measureComposition`, `apps/frontend/e2e/measure.ts`): o `contentMarker` começa na primeira tela; `elementFromPoint` no centro da parte visível dele devolve o próprio marcador, nunca `aside.sidebar`, cabeçalho móvel, barra inferior ou FAB; a sidebar visível não sobrepõe o `main` na horizontal; cabeçalho móvel e barra inferior visíveis ficam inteiros dentro da viewport. Anexos `composition-<rota>` e `overflow-<rota>` por teste | O resto da tela fora do `contentMarker`; fidelidade visual ao protótipo, que segue conferência humana sobre o screenshot anexado ([D-074](DECISIONS.md)) |
| **Alcance por clique real** (`locator.click()` sem `force`, sem `dispatchEvent`, sem teclado): a linha semeada de `/conversas`, `/clientes` e `/servicos` abre o detalhe, e em `/servicos` "Novo serviço" abre o formulário e "Criar serviço" recebe o clique (alerta "Informe o valor", nada é criado), nas cinco larguras; a mensagem de falha nomeia o elemento que intercepta | Na baseline, a linha semeada de `/servicos` abria por clique mesmo sem casca (a sidebar ficava acima da lista, não sobre ela); o defeito dessa tela aparece na composição e em "Criar serviço" |
| **Serviço de 45 minutos** salvo pelo formulário, com `PATCH` 2xx e "45 min" na lista, sobre um serviço semeado só para isso (`scripts/goal033-authenticated-ui-rehearsal.mjs`), que volta aos 60 minutos semeados pelo mesmo caminho no fim do teste | Os intervalos antes e depois do atendimento, que continuam `step={5}` |
| **A casca que essas medidas protegem** é a classe base `app-frame`, que `AppShell` aplica em toda casca; cabeçalho móvel e barra inferior da base ficam em `:where()`, e a regra de um módulo (`.settings-bottom-nav`) sempre vence | Overflow recortado por ancestral: a medida de overflow compara `scrollWidth` do documento, e um elemento que passa da borda dentro de um ancestral que recorta aparece nos `offenders` da mensagem, mas não reprova |

**Por que o gate do Goal033 aprovou a casca quebrada (§5.1 do Goal058), medido na baseline.** Execução do gate inteiro numa `git worktree` temporária na baseline, com o `src/` da baseline e só `e2e/` e a semente do Goal058: **35** testes reprovados e **25** passando, exit 1. A composição reprova em `/conversas`, `/clientes` e `/servicos` nas cinco larguras (marcador em y=797 a 1089, sempre abaixo da primeira tela; sidebar e `main` com a largura inteira), e o clique real reprova em 20 testes com `aside.sidebar` nomeado. O overflow não reprovou em 390 porque `scrollWidth` e `clientWidth` ficaram em 390 nas três telas: sem grade, a sidebar é um bloco de largura cheia empilhado sobre o `main`, e nada estoura. O único elemento que passa da borda é a prévia de mensagem de `/conversas` (um `span` até x=409), recortada por um ancestral: o documento não rola, e o mesmo `span` continua recortado na execução final.

**Controles negativos** (saída colada em [FINAL_AUDIT §35](FINAL_AUDIT.md)): regra base removida reprova **55** de **60** testes do gate autenticado, todas as medidas de composição e 20 de clique; `step={5}` de volta reprova **1** de **13** testes de `tests/goal058-service-form.test.tsx`; `CurrencyInput` da baseline reprova **3** de **13**; preço `0` para serviço novo reprova **1** de **13**. A base sem `:where()` (a regressão da rodada 1) reprova **4** de **60**, só `/configuracoes` e `/notificacoes` em 360 e 390, com `nav.settings-bottom-nav` em x=-195..195.

Execução final desta rodada, sobre a árvore entregue, depois da última edição de código e dos controles negativos: `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55481/atendly_bff_test" npm run validate:integration`, contra um PostgreSQL 18 descartável em loopback — **35** passos, **35** `passed`, **0** `failed`, exit 0; nele, `rehearse:goal033-authenticated-ui` com **60** testes passando e **0** retentativas (`stats` do `results.json`: `expected` 60, `unexpected` 0, `flaky` 0). `npm run validate:core` — **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`, exit 0, com `test:frontend` em **74** arquivos e **686** testes passando e `test:gate-scripts` em **227**/**227** (baseline: **226**). `npm run validate:ui` — **169** testes passando, **21** pulados, **0** retentativas, exit 0. `npm run typecheck` e `npm run lint` (`apps/frontend`) exit 0.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff058-2026-09-27-d-074), [FINAL_AUDIT §35](FINAL_AUDIT.md) e [D-074](DECISIONS.md).

## QA X-01, QA H-02, QA S-09, QA O-46, QA O-47 e QA A-06 são corrigidos: a leitura de status usa o vínculo e a credencial abertos, do Goal059

`apps/bff/` ganha a leitura de status pelo vínculo e pela credencial já usados por `GET /v1/whatsapp`, número público em dígitos e remoção compensatória de instância órfã; `apps/frontend/` ganha o banner da Home pela mesma derivação da sidebar e o número formatado. Nenhum campo público, rota ou schema Prisma muda de forma.

| O que decide agora | O que não decide |
| --- | --- |
| `whatsappSummary` (`apps/bff/src/modules/dashboard/routes.ts`), reaproveitada por `GET /v1/status` e `GET /v1/dashboard`, resolve o vínculo por `findLinkedInstance` e abre a credencial por `resolveInstanceCredential` antes de `evolution.getStatus` — nunca `instance.evolutionInstanceToken` cru | Vínculo ausente continua `null`/`DISCONNECTED`; `whatsappSummary` não ganha escrita nova além da que `resolveInstanceCredential` já fazia: uma gravação única quando decifra credencial legada em texto puro (a linha vira selada e não regrava mais por este motivo) e uma gravação por evento de rotação de chave (`WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID` mudando). Como a sidebar chama `GET /v1/status` a cada tick do shell, só o primeiro tick depois de um vínculo legado ou de uma rotação grava; os ticks seguintes não gravam nada por este caminho. Leituras concorrentes nesse primeiro acesso podem regravar em paralelo o mesmo envelope, de forma idempotente |
| Vínculo `pending`/`divergent`, credencial que não abre e Evolution fora do ar viram `UNKNOWN` em `/v1/status` e `status: "error"` em `/v1/dashboard`, nunca `DISCONNECTED`; `settled` loga código/`statusCode`, nunca credencial, envelope, número ou corpo da resposta | A forma de `/v1/status` e `/v1/dashboard` não muda: nenhum campo novo, nenhum a menos |
| `phoneNumber` em dígitos, sem servidor nem sufixo de aparelho, nas quatro saídas que o expõem (`GET /v1/whatsapp`, `GET /v1/status`, `GET /v1/dashboard`, `lib/onboarding-state.ts`), via `phoneFromWhatsappJid`; linha antiga com JID é regravada em dígitos na próxima leitura de `GET /v1/whatsapp` | Nenhuma migration; JID de grupo ou `@lid` continua saindo `null` ou o último número guardado |
| `ensureInstance` (`apps/bff/src/modules/whatsapp/routes.ts`) confere `credentialKeysConfigured()` antes de `evolution.createInstance` (recusa com `CREDENTIAL_UNAVAILABLE` sem chamar a Evolution); falha entre a criação remota e a gravação local chama `evolution.deleteInstance` e relança o erro original | A remoção compensatória é melhor esforço e não varre órfãs antigas; falha depois da linha local existir não remove nada — limite declarado em [D-075](DECISIONS.md) |
| O banner de WhatsApp da Home (`ProductDashboardScreen`) deriva de `status.whatsappView`, a mesma fonte da sidebar e do checklist, não de um segundo predicado sobre `dashboard.whatsapp`; estado desconhecido não afirma "desconectado" nem "pausado" | `apps/frontend/src/shared/phone.ts` formata o número (9º dígito restaurado só para celular legado); nenhum identificador, chave de busca ou valor gravado muda por causa da exibição |
| `tests/goal059-whatsapp-status.integration.test.ts` (**10**), `tests/goal059-whatsapp-orphan.integration.test.ts` (**4**) e `tests/goal059-whatsapp-status-view.test.tsx` (**13**) — os três novos, **27** testes, **27** passando | Conexão real com um aparelho WhatsApp e fidelidade visual ao protótipo seguem fora de prova automatizada (Goals 068/069) |

**Rodada 2 (FIX-001):** o teste de sufixo de aparelho passou a usar o formato real que a Evolution devolve (`5511987654321:8@s.whatsapp.net`, número antes de `:sufixo@servidor`), em vez do formato irreal usado na rodada 1 (`…@s.whatsapp.net:42`); ganhou o caso de dígitos puros sem servidor; e o jsdom ganhou os casos de valor vazio (`formatBrazilianPhone("", …)` é `null`, `formatPhone("")` é `"Contato sem telefone"`) e de `WhatsAppConnectionPanel` sem número. A gravação de `phoneNumber` em `GET /v1/whatsapp` (`apps/bff/src/modules/whatsapp/routes.ts`) passou a converter o valor **antes** de gravar (`phoneFromWhatsappJid(rawPhone)`), não só na leitura: o caso "linha antiga sem `myJid` na resposta" grava dígitos na própria linha, não mais o JID cru.

**Cinco controles negativos, aplicados e revertidos, depois da última edição de código.** Ambiente do BFF: PostgreSQL 18 descartável em loopback (`postgresql://pgtest@127.0.0.1:55432/atendly_bff_test`), migrations aplicadas, `BFF_RUN_INTEGRATION_TESTS=true` e as demais variáveis sintéticas de `scripts/validate-integration.mjs`; frontend com `npx vitest run` sem banco. Re-executados por esta rodada (FIX-001), sobre a árvore com os 27 testes acima. (1) `whatsappSummary` volta a passar `instance.evolutionInstanceToken` cru: reprova **2** de **10** testes de `goal059-whatsapp-status`. (2) `whatsappSummary` volta a buscar por `getPrisma().whatsAppInstance.findUnique({ where: { userId } })`: reprova **1** de **10** (o caso `pending` ainda acusa `UNKNOWN`, mas porque a decifração falha com `tenantId` zerado no AAD do envelope selado, não pela regra de posse que o defeito removeu; o caso `divergent`, de outro usuário, reprova pela regra em si). (3) `phoneNumber` sem conversão, revertida no ponto real (`EvolutionClient.getStatus`, `phoneNumber: rawJid` em vez de `phoneFromWhatsappJid(rawJid)`): reprova **1** de **10** (`GET /v1/whatsapp` continua em dígitos porque `whatsappDto` reconverte por conta própria). (4) `ensureInstance` sem a conferência prévia e sem a remoção compensatória: reprova **2** de **4** testes de `goal059-whatsapp-orphan`. (5) Banner revertido para `dashboard.whatsapp?.status !== "CONNECTED"`: reprova **3** de **13** testes de `goal059-whatsapp-status-view` (o caso `unknown` e os dois casos sem banner, `active` e `loading`, que a derivação antiga não distinguia de um WhatsApp desconectado por status transitório da Evolution). Cada arquivo tocado foi salvo antes da mutação e restaurado logo depois (`diff` conferido idêntico ao original); revertidos os cinco, as suítes voltam a **14**/**14** (BFF) e **13**/**13** (frontend).

Sobre a árvore desta Work Unit, num PostgreSQL 18 descartável em loopback: `npx vitest run tests/goal059-whatsapp-status.integration.test.ts tests/goal059-whatsapp-orphan.integration.test.ts` (`apps/bff`) → **14** testes, **14** passando, **0** falhando, depois de cada controle negativo revertido; `npx vitest run tests/goal059-whatsapp-status-view.test.tsx` (`apps/frontend`) → **13** testes, **13** passando, **0** falhando, depois de cada controle negativo revertido. **QA X-01, QA H-02, QA S-09, QA O-46, QA O-47 e QA A-06 corrigidos, fora da contagem A-01…A-24.**

**Execução final desta rodada (FIX-001, rodada 3), sobre a árvore final:** `npm run typecheck` e `npm run lint` de `apps/bff` e `apps/frontend`, exit 0 nos quatro; `npm run validate:core` — **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`, exit 0; `npm run test:gate` — **227**/**227**, sem teste a menos que a baseline; `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test npm run validate:integration` — **35** passos, **35** `passed`, **0** `failed`, exit 0, com `rehearse:goal033-authenticated-ui` em **60** testes passando e **0** retentativas; `npm run validate:ui` — **169** testes passando, **21** pulados, **0** retentativas, exit 0. Uma primeira execução de `validate:integration` reprovou em `test:scheduling-integration` (`goal008-agenda.test.ts`, "completes what expired past the grace period and never touches cancelled or no-show", `expected completed:1, got completed:4`) — um teste dependente do relógio real, em `apps/scheduling-service`, que este Goal não toca; isolado, o mesmo arquivo passou **15**/**15** na tentativa seguinte, e a reexecução completa do gate saiu limpa nos **35** passos, confirmando que o defeito é intermitente e sem relação com o diff deste Goal.

**O que este delta não prova.** **Não prova conexão real** com um aparelho WhatsApp. **A remoção compensatória não alcança órfãs anteriores a este Goal.**

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--diff059-2026-09-27-d-075),
[FINAL_AUDIT §36](FINAL_AUDIT.md) e [D-075](DECISIONS.md).

## O chat mostra o que a agenda fez, pelo ledger, do Goal070

`apps/ai-orchestrator/` ganha a derivação pura dos eventos e a rota interna; `apps/bff/` e `packages/public-api-contract/` ganham a rota pública; `apps/frontend/` ganha a timeline com as três linhas de evento. Nenhuma tool, fluxo `prepare`/`confirm`, `messageSchema` ou resposta de `GET .../messages` foi tocada.

| O que decide agora | O que não decide |
| --- | --- |
| `deriveConversationEvents` (`apps/ai-orchestrator/src/modules/conversations/conversation-events.ts`) lê só `AiToolCall` de `create_appointment`, nunca texto; produz `HOLD_PLACED`, `APPOINTMENT_CREATED` e `HOLD_EXPIRED`, com o relógio injetado | Remarcação, cancelamento e série recorrente não são lidos; um `prepare` substituído antes de vencer por outro nunca produz `HOLD_EXPIRED` — a reserva dele já foi liberada; substituído depois de já ter vencido, o `HOLD_EXPIRED` continua |
| `GET /internal/conversations/:id/events` (escopo `conversations:read`, `requireConversation` antes do ledger) e `GET /v1/conversations/:id/events` (proxy fino, `conversationEventSchema` em `packages/public-api-contract`) entregam os eventos por rota própria | `GET .../messages` e `messageSchema` não mudam; conversa de outro tenant ou inexistente recusa como `/messages` recusa, nunca lista vazia |
| `MessageTimeline.tsx` intercala evento e bolha por instante (evento antes da bolha em empate); `HOLD_PLACED` mostra o vencimento no fuso do negócio (D-045); `APPOINTMENT_CREATED` tem "Ver" para `/agenda/agendamento?id=`; falha na consulta de eventos não esconde as mensagens | Fidelidade visual ao protótipo segue conferência humana (Goal069); o texto de `HOLD_EXPIRED` não tem referência nele |
| O gate autenticado (`rehearse:goal033-authenticated-ui`) semeia um `AiRun` com três `AiToolCall` (`prepare` no prazo, `confirm` que o consome, `prepare` vencido) e exige as três linhas e o clique real no "Ver" nas cinco larguras — a contagem sobe de **60** (D-074) para **65** | As demais medidas (overflow, toque, contraste, foco, movimento, composição) continuam as mesmas do D-074, sem exceção nova |

**Cinco controles negativos, aplicados e revertidos, depois da última edição de código**, saída colada em [FINAL_AUDIT §37](FINAL_AUDIT.md): (1) a derivação aceita `confirm` sem exigir `SUCCEEDED`: reprova **1** de **9** testes de `goal070-conversation-events` (ai-orchestrator). (2) a derivação deixa de tratar `prepare` substituído antes de vencer: reprova **1** de **9** do mesmo arquivo. (3) a rota interna perde `requireConversation`: reprova **1** de **4** testes de rota — conversa de outro tenant passa a responder **200** com lista vazia em vez de **404**. (4) a hora de vencimento sai no fuso do navegador: reprova **2** de **5** testes jsdom. (5) a timeline deixa de renderizar eventos: reprova **3** de **5** testes jsdom e **10** de **65** testes do gate autenticado (as três linhas e o clique no "Ver", nas cinco larguras). Cada arquivo tocado foi salvo antes da mutação e restaurado logo depois (diff conferido idêntico ao original); revertidos os cinco, as suítes voltam a **13**/**13** (ai-orchestrator, os dois arquivos `goal070-`), **5**/**5** (frontend) e **65**/**65** (gate autenticado, **0** retentativas).

**Duas correções incidentais, fora do escopo do ledger de eventos, sobre arquivos que WU-01/WU-02/WU-04 já tinham entregue**, necessárias para não deixar a árvore vermelha nas unidades determinísticas seguintes: `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` (Goal039/046/047) tinha três literais computados pela árvore real — `scannedFilePathsForInstantiation` (205→**206** arquivos `.ts`, pela nova `conversation-events.ts`), ocorrências de `this.http.` em `apps/bff/src/clients/` (41→**42**, pelo novo `listEvents`) e a linha de `person_typed_text` em `internal/routes.ts` (705→**743**, pela nova rota de eventos inserida antes) — atualizados para o número que a própria árvore produz, sem mudar categoria, isenção ou identificador algum. `apps/frontend/e2e/authenticated-matrix.spec.ts` comparava, no clique do "Ver", `new URL(page.url()).pathname` (que nunca contém `?id=`) contra um padrão que exigia `?id=` — reprovava sempre, com ou sem o defeito do controle 5; a asserção passou a comparar a URL inteira, sem tocar o `expectPath` compartilhado nem as demais medidas por clique real do mesmo arquivo.

Sobre a árvore final, depois dos cinco controles negativos revertidos, esta Work Unit (WU-05, controles e documentação) executou: `npm run typecheck` e `npm run lint` de `apps/ai-orchestrator`, `apps/bff` e `apps/frontend`, exit 0 nos seis; `apps/ai-orchestrator` — `npx vitest run` (suíte completa) **97** arquivos (**85** `passed`, **12** `skipped`), **1112** testes passando, **88** pulados, **0** falhando; `apps/bff` — arquivos de teste locais sem integração, **13** arquivos passando, **2** pulados, **118** testes passando, **39** pulados; `apps/frontend` — `npx vitest run` (suíte completa, `test:frontend`) **76** arquivos, **704** testes passando, **0** falhando; `npm run test:gate` — **233**/**233**, sem teste a menos que a baseline (**227**); `node scripts/final-production-audit.mjs` — **34** checks, **33** `passed`, **1** `skipped` (`production_health`, não solicitado), **0** `failed`, com `bff_v1_routes_use_literal_paths`, `public_api_route_coverage` e `public_api_response_schema_single_source` passando sem exceção nova para a rota `GET /v1/conversations/:id/events`; `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" node scripts/goal033-authenticated-ui-rehearsal.mjs` — **65** testes, **0** retentativas, exit 0 (`e2e-results/authenticated/results.json`: `expected` 65, `unexpected` 0, `flaky` 0).

**Os passos agregadores `validate:core`, `validate:ui` e `validate:integration` (com todos os seus passos, inclusive os das outras apps e serviços) ficam para as unidades determinísticas seguintes do plano (WU-06 a WU-19)**, que rodam depois desta Work Unit no DAG do Goal070 e não dependem de raciocínio de modelo.

**Execução final da rodada 2 (WU-06 a WU-19), sobre a árvore aceita no [review070](reviews/070-review.md):** `typecheck` e `lint` dos três apps e `git diff --check`, exit 0; testes dirigidos `goal070` — **13**/**13** (`apps/ai-orchestrator`), **6**/**6** (`apps/bff`), **5**/**5** (`apps/frontend`); `test:gate` — **233**/**233** (os **6** testes a mais são os de `buildConversationEventToolCalls`); `validate:core` — **17** passos, **15** `passed`, **2** `skipped`, **0** `failed`; `validate:ui` — **169** passando, **21** pulados, **0** retentativas; `validate:integration` — **35**/**35** passos, com `rehearse:goal033-authenticated-ui` em **65** testes passando e **0** retentativas.

**O que este delta não prova.** **Não prova** que o modelo real chama `prepare`/`confirm` no momento certo (D-050); que as linhas de evento batem com o protótipo aprovado (conferência humana, Goal069); que remarcação, cancelamento ou série recorrente aparecem na conversa — não aparecem, por decisão declarada.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal070-2026-09-27-d-076-accepted),
[FINAL_AUDIT §37](FINAL_AUDIT.md) e [D-076](DECISIONS.md).

## A conexão com a Minha Agenda pede só e-mail e senha, e a credencial não sobrevive à importação concluída, do Goal060

`apps/scheduling-service/` ganha configuração do sistema para endereço e cliente OAuth da origem, corpo novo da conexão, descoberta do profissional e classes de erro; `apps/bff/` ganha o corpo público novo e o repasse dos códigos; `apps/frontend/` ganha a tela de dois campos. Nenhuma tool, análise, execução, preview, conflito, lease ou retomada da importação foi tocada.

| O que decide agora | O que não decide |
| --- | --- |
| `MINHA_AGENDA_API_BASE_URL` e `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` (`apps/scheduling-service/src/config/env.ts`) são configuração do sistema; `parseMinhaAgendaConnection` sempre os usa, ignorando `baseUrl`/`basicAuth` de linha antiga; sem a credencial de ambiente, conectar recusa com `MINHA_AGENDA_NOT_CONFIGURED` (503) antes de qualquer chamada ou escrita | Linha antiga com `baseUrl`/`basicAuth` gravados continua legível, só ignorada; o resto do serviço sobe normalmente sem a credencial |
| `integrationConnectBodySchema`/`integrationSchema` aceitam só `{ email, password }`, `.strict()`; campo a mais (inclusive `credentials`/`configuration` antigos) é `VALIDATION_ERROR`, sem `fetch` e sem escrita | `packages/public-api-contract` e a resposta de sucesso (`calendarStateSchema`) não mudam |
| Depois do login, `GET /employees/professionals?includeDeleted=false` descobre o profissional; um só grava o `employeeId`; zero ou mais de um recusam com `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND`/`MINHA_AGENDA_MULTIPLE_PROFESSIONALS` (422), sem gravar | Nenhum caso escolhe um profissional por conta própria; escolha entre vários não existe (MVP de um profissional só) |
| Quatro classes de erro fixas (`client.ts`/`config.ts`): credencial recusada (422), profissional (422, acima), origem indisponível (502/504), falha nossa (503/500); nenhum código `MINHA_AGENDA_*` sai 401/403; o BFF repassa `details.upstreamCode` sob `UPSTREAM_ERROR`, sem tradução | Nenhuma falha da conexão grava linha nova nem altera a existente; `reconnect` continua gravando `status: "ERROR"` e `lastErrorCode` |
| `ConnectSourceScreen.tsx` tem só e-mail e senha; `connectErrorMessage` lê `details.upstreamCode` e dá um texto de produto por classe | Nenhum texto de erro usa "token", "OAuth", "endereço", "HTTP", "API" ou código cru; `IMPORT_ALREADY_COMPLETED`/`VALIDATION_ERROR` mantêm o tratamento atual |
| `completeOnce` apaga a `IntegrationConnection` `MINHA_AGENDA` do negócio na mesma transação que grava `completedAt` (vault Q894), desfazendo antes a referência de `ImportSession.connectionId` (FK `Restrict`) | Falha na transação mantém a linha; conclusão repetida não falha; a conclusão de um negócio nunca toca a linha de outro; `DELETE /internal/calendar/integration` não muda |

**Seis controles negativos, aplicados e revertidos, depois da última edição de código**, saída colada em [FINAL_AUDIT §38](FINAL_AUDIT.md): (1) o cliente volta a usar o status da origem em `MINHA_AGENDA_AUTH_FAILED`: reprova **3** de **19** testes de `goal060-minha-agenda-connection` (scheduling-service). (2) `connectErrorMessage` volta a comparar `error.code`: reprova **9** de **14** testes de `goal060-connect-source` (frontend). (3) o leitor volta a usar o `baseUrl` gravado: reprova **1** de **19** do mesmo arquivo de scheduling-service. (4) a descoberta passa a aceitar o primeiro de vários profissionais: reprova **1** de **19**. (5) o schema do corpo deixa de ser estrito: reprova **3** de **19**. (6) a conclusão deixa de apagar a linha (filtro do `deleteMany` trocado por um tenant que não casa): reprova **3** de **5** testes de integração contra PostgreSQL real. Cada arquivo tocado foi conferido idêntico ao original depois da reversão; revertidos os seis, as suítes voltam a **19**/**19** (scheduling-service, unidade), **14**/**14** (frontend) e **5**/**5** (scheduling-service, integração contra PostgreSQL real).

Sobre a árvore final, depois dos seis controles negativos revertidos, esta Work Unit (WU-05, controles e documentação) executou: `npm run typecheck` e `npm run lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`, exit 0 nos seis; `apps/scheduling-service` — `npx vitest run --dir tests/unit` **30** arquivos, **410** testes passando, **0** falhando; `apps/scheduling-service` (integração) — `SCHEDULING_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_scheduling_test" npx vitest run --dir tests/integration tests/integration/goal060-import-completion-credential.test.ts`, **5**/**5**, contra um PostgreSQL descartável provisionado por `scripts/provision-scheduling-test-database.mjs`; `apps/bff` — arquivos de teste locais sem integração, **15** arquivos passando, **32** pulados, **122** testes passando, **258** pulados (a suíte de integração de `apps/bff`, inclusive `tests/goal060-integration-connect.test.ts`, roda dentro de `validate:integration`); `apps/frontend` — `npx vitest run` (suíte completa) **77** arquivos, **718** testes passando, **0** falhando (baseline review070: **76**/**704**); `npm run test:gate` — **233**/**233**, sem teste a menos que a baseline (**233**, review070; este Goal não toca `scripts/tests/`); `node scripts/final-production-audit.mjs` — **34** checks, **33** `passed`, **1** `skipped` (`production_health`, não solicitado), **0** `failed`, com `production_config_env_example_parity` e `production_config_render_env_coverage` passando com as duas chaves novas do §1 sem valor real do cliente OAuth no diff; `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" node scripts/goal033-authenticated-ui-rehearsal.mjs` — **65** testes, **0** retentativas, exit 0 (sem mudança em relação à baseline: este Goal não toca nenhuma das sete rotas logadas medidas).

**Os passos agregadores `validate:core`, `validate:ui` e `validate:integration` (com todos os seus passos, inclusive os das outras apps e serviços) ficam para as unidades determinísticas seguintes do plano (WU-06 a WU-19)**, que rodam depois desta Work Unit no DAG do Goal060 e não dependem de raciocínio de modelo.

**Execução final da rodada 4 (WU-06 a WU-19), sobre a árvore aceita** ([review060](reviews/060-review.md)), todas com exit 0: `typecheck` e `lint` dos três apps e `git diff --check`; testes dirigidos `goal060` — **19** passando e **5** pulados sem banco (`apps/scheduling-service`), **6** pulados sem banco (`apps/bff`), **14**/**14** (`apps/frontend`); `test:gate` — **233**/**233**; `validate:core` — **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`; `validate:ui` — **169** passando, **21** pulados, **0** retentativas; `validate:integration` — **35**/**35** passos, inclusive `test:bff-integration` (§7.6) e `test:scheduling-integration` (§7.5), com `rehearse:goal033-authenticated-ui` em **65** testes passando e **0** retentativas.

**O que este delta não prova.** **Não prova** que o login e a descoberta do profissional funcionam contra a Minha Agenda real — conferência humana do §8 do Goal, **não feita** por este Goal; que a análise e a execução da importação terminam para uma conta real (Goal061); que o caminho e a forma de `/employees/professionals` batem com a API real, além do mapa histórico; que a tela bate com o protótipo aprovado (conferência humana, Goal069).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal060-2026-09-27-d-077-accepted),
[FINAL_AUDIT §38](FINAL_AUDIT.md) e [D-077](DECISIONS.md).

## A importação longa não depende de uma requisição, do Goal061

`apps/scheduling-service/` ganha o início curto de análise e execução, o lease da análise, o trabalho no próprio processo com fencing, a falha gravada, a leitura do preview e os campos `interrupted`, `lastError` e `failedReasons`; `packages/public-api-contract/` e `apps/bff/` repassam o `202`, a leitura nova e os campos novos; `apps/frontend/` acompanha em vez de esperar. Nenhuma migration, campo novo de schema, loop, timer, fila, worker ou processo foi criado; `INTERNAL_HTTP_TIMEOUT_MS`, o `rewrites` do Next e `IMPORT_LEASE_TTL_SECONDS` não mudaram.

| O que decide agora | O que não decide |
| --- | --- |
| `POST .../analyze` e `POST .../execute` (interno e `/v1`) respondem `202` com `{ sessionId, status, previewVersion }` depois de reivindicar o lease com `ANALYZING`/`EXECUTING`, sem chamar a origem; a mesma chave de idempotência não dispara segundo trabalho | Quanto tempo a origem real leva; o trabalho termina no processo, e só a conferência humana mostra uma conta real terminando |
| A análise tem lease; análise e execução se excluem pelo estado; novo início com lease vivo é `IMPORT_SESSION_LEASE_HELD` (409); a transação final da análise só grava com o mesmo `leaseOwner` e `ANALYZING` | Retomada automática: trabalho de instância que cai fica pendurado até alguém pedir "Continuar" |
| `interrupted` é decidido pelo relógio do banco (`isImportSessionInterrupted`); `lastError` expõe só `{ code }` de `IMPORT_WORK_ERROR_CODES`; `failedReasons` conta os itens `FAILED` por motivo | A mensagem gravada em `errorMessage` não sai do Scheduling |
| `GET /internal/calendar/imports/:sessionId/preview` e `GET /v1/calendar/imports/:sessionId/preview` leem o preview gravado sem a origem; sessão sem análise é `IMPORT_SESSION_PREVIEW_NOT_AVAILABLE` (409) | `changesSincePreviousVersion` não é gravado e não é devolvido pela leitura |
| A tela lê o preview gravado e só inicia a análise sozinha em `DRAFT` sem preview; falha de transporte no início da análise, em "Importar tudo" e na retomada relê o estado e só mostra erro quando nada começou; "Tentar de novo"/"Continuar" aceito mostra a análise em andamento, não a falha anterior; cada código de motivo de item falho que a execução grava tem texto próprio | Largura, toque, contraste, foco e movimento das telas de importação: `/importacao` segue fora do gate renderizado |

**Seis controles negativos, aplicados e restaurados**, saída colada em [FINAL_AUDIT §39](FINAL_AUDIT.md). Os controles 1 a 4 atuam em `apps/scheduling-service/src`, que a rodada 2 não mudou, e rodaram na rodada 1 contra PostgreSQL real, sobre `tests/integration/goal061-import-async.test.ts`: (1) a rota de análise volta a aguardar o trabalho: reprova **5** de **12**, por timeout. (2) a análise deixa de reivindicar o lease: reprova **9** de **12**, inclusive o de análise e execução simultâneas. (3) a transação final da análise deixa de conferir o `leaseOwner`: **não reprova** o teste de `replace`, porque `replace` também muda o estado e apaga o dono antes do último heartbeat; reprova **1** de **13** com o teste de tomada do lease depois do último heartbeat. (4) `interrupted` deixa de considerar lease vencido: reprova **2** de **13** (`ANALYZING` e `EXECUTING`). Os controles 5 e 6 rodaram de novo na rodada 2, **depois da última edição de código**, sobre `tests/goal061-import-async.test.tsx` com **32** testes: (5) a tela volta a chamar `analyzeImport` ao montar com sessão `READY`: reprova **9** de **32**, inclusive "sessão READY com preview gravado nunca chama analyzeImport, nem montando três vezes". (6) `handleExecute` volta a mostrar o erro sem reler o estado: reprova **1** de **32**, "falha de transporte com estado relido EXECUTING mostra o andamento, nunca o erro". Na mesma execução, os controles das correções da rodada 2: início da análise sem reler o estado, **4** de **32**; retomada sem reler o estado, **2** de **32**; fase derivada da sessão vencendo o reinício do dono, **2** de **32**; `IMPORT_CUSTOMER_MAPPING_MISSING` sem texto próprio, **1** de **32**. Cada arquivo tocado foi conferido contra a cópia salva antes; restaurados, `tests/goal061-import-async.test.tsx` volta a **32**/**32**.

Execução final da rodada 2, sobre a árvore final e depois dos controles restaurados: `npm run typecheck` e `npm run lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`, exit 0 nos seis. `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, que só tem suíte de integração, e `test:health-worker`, sem suíte automatizada), exit 0; dentro dele, `test:scheduling-service` **32** arquivos e **448** testes (baseline review060: **30**/**410**), `test:frontend` **78** arquivos e **750** testes (baseline review060: **77**/**718**), `test:ai-orchestrator` **85** arquivos passando e **12** pulados, **1112** testes passando e **88** pulados, e `test:gate-scripts` **233**/**233** (baseline **233**). `npm run validate:ui` — **169** passando, **21** pulados, **0** retentativas, exit 0. `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" node scripts/validate-integration.mjs` — **35**/**35** passos, exit 0, com `test:bff-integration` em **48** arquivos e **386** testes passando, `test:scheduling-integration` em **13** arquivos e **103** testes passando (inclusive os **13** do §7.1) e `rehearse:goal033-authenticated-ui` em **65** testes passando — **65** expected, **0** unexpected, **0** flaky — e **0** retentativas.

**Escopo.** `apps/ai-orchestrator/`, `apps/evolution-go/` e `tools/ia-loop/` não são tocados. A rodada 1 tinha editado `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` para subir de 42 para 43 a contagem congelada de `this.http.` em `apps/bff/src/clients/`; a rodada 2 reverteu o arquivo ao estado de `7623009` e manteve as **42** ocorrências fazendo `mutate` delegar a `mutateWithStatus`, e `test:ai-orchestrator` passou sem alterar o teste.

**Conferência humana pendente.** A conferência do §9 do Goal — com a pilha local e a conta de teste de U-05, a análise e a importação de uma conta real terminando e a tela acompanhando até o fim — **não foi feita** por este Goal.

**O que esta seção não prova.** **Não prova** que a análise e a importação de uma conta real terminam (conferência humana acima, não feita); que as telas de importação cumprem largura, toque, contraste, foco e movimento, porque `/importacao` não é medida; que a tela bate com o protótipo aprovado (conferência humana, Goal069); que trabalho de instância que cai é retomado sozinho (limite declarado da D-078).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal061-2026-09-27-d-078-accepted),
[FINAL_AUDIT §39](FINAL_AUDIT.md) e [D-078](DECISIONS.md).

## A importação traz a base inteira e respeita a agenda existente, do Goal062

`apps/scheduling-service/` ganha a listagem de clientes com recuo declarado, a troca da disponibilidade por decisão de item com a regra de sobreposição compartilhada, o telefone na forma canônica com busca por equivalência e o preço zero como não informado, mais a migration aditiva `20260927120000_goal062_import_item_proposed_availability` (uma coluna JSONB anulável, `ImportItem.proposedAvailability`); `packages/public-api-contract/` e `apps/bff/` acrescentam `currentAvailability`/`proposedAvailability` ao item de importação; `apps/frontend/` mostra as duas grades no conflito, exige confirmação na Disponibilidade e formata o telefone. `apps/ai-orchestrator/`, o painel de Conversas e o vínculo da conversa não mudaram. Decisão: [D-079](DECISIONS.md), ACCEPTED no [review062](reviews/062-review.md) (rodada 2 de 2).

| O que decide agora | O que não decide |
| --- | --- |
| `CUSTOMER` é a união de `GET /customers` com os clientes embutidos, sem `deleted: true` não referenciado; `404` ou forma inválida recua com `CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED` | Que a resposta real de `GET /customers` tem a forma validada: todo teste usa dublê local; é a conferência humana |
| Com horário ativo, `AVAILABILITY` nasce `NEEDS_REVIEW` (`AVAILABILITY_REPLACES_CURRENT`); só `INCLUDE` de item troca, numa transação com fencing que apaga a vigente e grava a da origem; `IMPORT_ALL` e categoria nunca trocam; horário criado depois da análise termina `FAILED` com `AVAILABILITY_CHANGED_SINCE_ANALYSIS`, sem gravar; grade da origem sobreposta (`AVAILABILITY_SOURCE_OVERLAP`) nunca é gravada | O editor de disponibilidade por dia (Goal067); largura, toque, contraste, foco e movimento de `/importacao` e `/configuracoes/disponibilidade`, fora do gate renderizado |
| `normalizePhone` devolve a forma canônica brasileira; `phone` é gravado como `+` canônica; a busca por número e a classificação da análise comparam com as formas equivalentes; `BRAZILIAN_DDDS` é comparada por teste com a lista do BFF | Reescrever linhas antigas (não há migration de dado); vincular a conversa ao cliente pelo número (D-005) |
| Preço `0` da origem vira `NOT_INFORMED`/`null` no catálogo e nos serviços embutidos, com `SERVICE_PRICE_NOT_INFORMED` informativo | Tipo de preço "gratuito", que o vault não prevê |

**Seis controles negativos, aplicados e restaurados**, rodados na rodada 2 **depois da última edição de código**, numa cópia da árvore final conferida arquivo a arquivo contra a worktree, cada arquivo restaurado conferido byte a byte; saída colada em [FINAL_AUDIT §40](FINAL_AUDIT.md). (1) a categoria de clientes volta a ignorar a listagem: reprova "analisa e importa clientes sem nenhum agendamento vinculado, com sourceSupported true" contra PostgreSQL real. (2) a execução volta a criar regras sem contar nem apagar a grade vigente: reprova **2** de **11** em `tests/integration/goal062-import-availability.test.ts` — o caso de "Importar tudo" que chega à execução (grade somada, 15 regras em vez de 5) e o de horário criado depois da análise. (3) `IMPORT_ALL` passa a confirmar a troca: reprova **1** de **2** alvos, o caso de `IMPORT_ALL` que chega à execução. (4) a busca volta à igualdade exata: reprova **2** de **7** em `tests/integration/goal062-customer-phone.test.ts`, as linhas gravadas antes do Goal, inclusive pela rota `GET /internal/customers?phone=`. (5) preço zero volta a `FIXED`: reprova **2** de **3** alvos em `tests/unit/goal062-import-customers.test.ts`. (6) a Disponibilidade volta a enviar sem confirmação: reprova **1** de **3** alvos em `tests/goal062-availability-phone.test.tsx`. Sem o defeito, cada alvo volta a passar por inteiro.

Execução final da rodada 2, sobre a árvore final e depois dos controles restaurados: `npm run typecheck` e `npm run lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`, exit 0 nos seis. `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, que só tem suíte de integração, e `test:health-worker`, sem suíte automatizada), exit 0; dentro dele, `test:scheduling-service` **35** arquivos e **484** testes (baseline review061: **32**/**448**), `test:frontend` **80** arquivos e **766** testes (baseline review061: **78**/**750**), `test:ai-orchestrator` **85** arquivos passando e **12** pulados, **1112** testes passando e **88** pulados, `test:gate-scripts` **233**/**233** (baseline **233**) e `audit:static` **33** de **34** verificações passando e **1** pulada. `npm run validate:ui` — **169** passando, **21** pulados, **0** retentativas, exit 0. `BFF_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55632/atendly_g062r2final_test" npm run validate:integration`, contra um PostgreSQL 18 descartável em loopback — **35**/**35** passos, exit 0, com `test:bff-integration` em **49** arquivos e **389** testes passando (baseline **48**/**386**; inclusive os **3** de `tests/goal062-import.integration.test.ts`), `test:scheduling-integration` em **16** arquivos e **124** testes passando (baseline **13**/**103**; inclusive os **21** do §7.1), `rehearse:goal028-release-migrations` aplicando o histórico inteiro com a migration nova e sem drift, e `rehearse:goal033-authenticated-ui` em **65** testes passando — **65** expected, **0** unexpected, **0** flaky — e **0** retentativas. `this.http.` em `apps/bff/src/clients/` segue **42**.

**Conferência humana pendente.** A conferência do §9 do Goal — com a pilha local e a conta de teste de U-05, `GET /customers` da conta real na forma validada, a contagem de clientes da revisão batendo com a da Minha Agenda, a troca da grade funcionando com a grade real e uma mensagem de um número importado encontrando a cliente como candidata — **não foi feita** por este Goal.

**O que esta seção não prova.** **Não prova** a forma real de `GET /customers` nem a contagem real de clientes (conferência humana acima, não feita); que as telas de importação e de Disponibilidade cumprem largura, toque, contraste, foco e movimento, porque não são medidas; que a tela bate com o protótipo aprovado (conferência humana, Goal069); que a conversa fica ligada à cliente sem confirmação, o que D-005 proíbe.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal062-2026-09-27-d-079-accepted),
[FINAL_AUDIT §40](FINAL_AUDIT.md) e [D-079](DECISIONS.md).

## A IA só liga depois do teste real, e `/configuracoes/ia` entra no gate autenticado, do Goal063

`apps/bff/` passa a exigir prova do teste real em `PATCH /v1/settings/ai` na passagem desligada → ligada (`409 AI_ACTIVATION_TEST_REQUIRED`), grava a execução que autorizou e marca a execução válida ao pausar; `apps/frontend/` conclui o onboarding só na saída dele, oferece o teste também em Configurações › IA pelo módulo compartilhado `features/activation-test/`, troca o interruptor da IA pelo estado lido e sua ação, e dá ação a cada item do checklist da Home. `apps/ai-orchestrator/`, `apps/scheduling-service/` e as rotas do teste real não mudaram; nenhuma migration. Decisão: [D-080](DECISIONS.md), proposta no Goal063 e ACCEPTED no [review063](reviews/063-review.md).

| O que decide agora | O que não decide |
| --- | --- |
| `PATCH /v1/settings/ai` recusa ligar sem execução `SUCCEEDED` não superada, e com leitura falhando, sem gravar; ordem exclusão → prova → serviço; ligar grava `activatedByRunId`; pausar marca a execução válida e `GET /v1/status` não religa | Que o teste real envia e recebe mensagem de verdade: o número oficial da Avenly não existe no ambiente (D-035); é a conferência humana, **não feita** |
| O onboarding só conclui na ação que sai dele; os dois botões de `contatos-ignorados` levam ao teste; a tela de sucesso só afirma a ativação depois de `GET /v1/status` | Largura, toque, contraste, foco e movimento de `/onboarding/*`, fora do gate renderizado |
| Configurações › IA sem interruptor, com os quatro estados e o teste compartilhado; o checklist da Home com link em cada item | Desligar a IA ligada antes deste Goal sem teste (não há regra retroativa) |
| `/configuracoes/ia` medida pelo gate autenticado no estado sem prova válida, nas cinco larguras; a sessão é conferida pelo `sessionMarker` da rota | Que as telas batem com o protótipo aprovado (conferência humana, Goal068) |

**Seis controles negativos, aplicados e restaurados**, rodados na rodada 2 **depois da última edição de código**, na própria worktree, cada arquivo restaurado conferido por `sha256`; saída colada em [FINAL_AUDIT §41](FINAL_AUDIT.md). (1) `PATCH /v1/settings/ai` volta a ignorar a prova: reprova "recusa ligar com sem execução nenhuma" contra PostgreSQL real. (2) a prova volta a aceitar execução superada: reprova "recusa ligar com execução SUCCEEDED superada por troca de canal". (3) pausar deixa de marcar a execução: reprova **1** de **2** alvos, a pausa da IA ligada antes do Goal, com `GET /v1/status` devolvendo `ACTIVATED`. (4) `contatos-ignorados` volta a concluir: reprova "Ir para o teste avança sem chamar onboarding.complete()". (5) a tela de sucesso volta a afirmar sem ler: reprova **3** de **4** alvos. (6) um item do checklist volta a ser texto sem ação: reprova **3** de **3** em `tests/goal063-home-checklist.test.tsx`. Sem o defeito, cada alvo volta a passar por inteiro.

Execução final da rodada 2, sobre a árvore final: `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, que só tem suíte de integração, e `test:health-worker`, sem suíte automatizada), exit 0; dentro dele, `test:frontend` **83** arquivos e **793** testes (baseline review062: **80**/**766**), `test:scheduling-service` **35** arquivos e **484** testes, `test:ai-orchestrator` **85** arquivos passando e **12** pulados, **1112** testes passando e **88** pulados, `test:gate-scripts` **233**/**233** (baseline **233**) e `audit:static` **33** de **34** verificações passando e **1** pulada. `npm run validate:ui` — **169** passando, **21** pulados, **0** retentativas, exit 0. Depois dessas duas execuções só mudou o arquivo de teste `apps/bff/tests/goal063-ai-activation.integration.test.ts`; em seguida rodaram os seis controles. Depois dos controles: `npm run typecheck` e `npm run lint` de `apps/bff` e `apps/frontend`, exit 0 nos quatro; `npm run test:gate` — **233**/**233**; `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55700/atendly_g063r2final2_test" npm run validate:integration`, contra um PostgreSQL 18 descartável em loopback — **35**/**35** passos, exit 0, com `test:bff-integration` em **50** arquivos e **402** testes passando (baseline **49**/**389**; inclusive os **13** de `tests/goal063-ai-activation.integration.test.ts`), `test:scheduling-integration` em **16** arquivos e **124** testes passando, e `rehearse:goal033-authenticated-ui` em **70** testes passando — **70** expected, **0** unexpected, **0** flaky — e **0** retentativas (baseline **65**; as **5** novas são `/configuracoes/ia` nas cinco larguras). `this.http.` em `apps/bff/src/clients/` segue **42**.

**Conferência humana pendente.** A conferência do §9 do Goal — na pilha local com número da plataforma configurado, o onboarding chegando ao teste pelos dois botões, o teste de Configurações › IA rodando, a IA ligando ao terminar bem e a pausa não sendo desfeita por nova leitura — **não foi feita** por este Goal.

**O que esta seção não prova.** **Não prova** o envio real do teste (conferência humana acima, não feita); que `/onboarding/*` cumpre largura, toque, contraste, foco e movimento, porque não é medida; que as telas batem com o protótipo aprovado (conferência humana, Goal068).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal063-2026-09-27-d-080-accepted),
[FINAL_AUDIT §41](FINAL_AUDIT.md) e [D-080](DECISIONS.md).

## A conexão do WhatsApp pede consentimento e mantém o QR válido, do Goal071

`apps/bff/` passa a exigir `consentAccepted: true` em `POST /v1/whatsapp/connect` e `POST /v1/whatsapp/reconnect`, antes de qualquer chamada à Evolution e de qualquer escrita. Ganha também `GET /v1/whatsapp/qr`, que relê o QR corrente só com vinculação por QR em curso (marcador na coluna `qrcode`, sem migration) e nunca com o número conectado. `apps/frontend/` move o consentimento para dentro de `WhatsAppConnectionPanel` (onboarding e Configurações › WhatsApp, mesma implementação). O painel renova o QR com uma leitura por vez, dentro de uma janela declarada de 5 minutos, e nunca mantém na tela um QR com mais de um giro (20 s) de idade. A visão de código copia com confirmação, numera passos e explica o formato do número. `apps/ai-orchestrator/`, `apps/scheduling-service/` e o fork Evolution não mudaram; nenhuma migration. Decisão: [D-081](DECISIONS.md), proposta no Goal071, **ACCEPTED** no [review071](reviews/071-review.md) (rodada 3 de 3). Este registro é da rodada 3, que corrigiu os quatro blockers da rodada 2 (a rodada 2 corrigiu os dez da rodada 1).

| O que decide agora | O que não decide |
| --- | --- |
| `connect`/`reconnect` recusam `400 VALIDATION_ERROR` sem `consentAccepted: true`, antes de `ensureInstance`, da Evolution e de qualquer escrita; o aceite não é gravado | Que o consentimento tem valor legal — não é gravado, e a revisão legal está nos temas adiados do vault |
| `GET /v1/whatsapp/qr` recusa `409 WHATSAPP_QR_NOT_IN_PROGRESS` sem marcador (inclusive depois de `connect` no modo código), sem chamar a Evolution; com marcador, lê o status antes do QR e não chama `/instance/qr` com o número conectado ou logado | Que a conexão real funciona com WhatsApp e Evolution reais (conferência humana do §11, **não feita**) |
| O painel exige o checkbox com a frase do consentimento e a resposta sobre número pessoal antes de habilitar "Conectar"/"Reconectar", nos dois caminhos (onboarding e Configurações), com o painel real nos testes; toda chamada envia `consentAccepted: true`; antes da primeira leitura de status, só carregamento (`aria-busy`), sem consentimento nem CTA | O fork abrir sessão nova depois do quinto QR (`QRCODE_MAX_COUNT`, inalterado) — o BFF e a tela evitam provocá-lo, não o eliminam |
| A renovação do QR nunca tem duas leituras em voo, pausa com a aba oculta, e mostra "O QR Code expirou" ao fim da janela ou quando nenhum QR novo chega em um giro; uma leitura em voo de um efeito já descartado não expira nem troca o QR da vinculação seguinte. No modo código, a leitura de status segue a cada 3 s | Largura, toque, contraste, foco e movimento dos estados de consentimento, QR e código e de `/onboarding/*`, fora do gate renderizado |
| `/configuracoes/whatsapp` medida pelo gate autenticado no estado conectado, nas cinco larguras: antes de medir, `LOADED_STATE` exige o título "WhatsApp conectado" e nenhum checkbox | Que as telas batem com o protótipo aprovado (conferência humana, Goal068) |

**Vermelho da baseline, rodado de novo na rodada 3.** Contra `0cb49b40154050e220e53c9b937f7b2dc7f7852c`, os dois arquivos `goal071-` do frontend reprovam **29** de **36**. `tests/goal071-whatsapp-consent-qr.integration.test.ts` reprova **12** de **15** contra PostgreSQL real. Saída colada em [FINAL_AUDIT §42](FINAL_AUDIT.md).

**Onze controles negativos, aplicados e revertidos**: os seis do §10 do Goal, os dois da rodada 2 e três novos, um por blocker de código da rodada 3. Rodaram **depois da última edição de código** e depois de `validate:integration`, na própria worktree, com cada arquivo restaurado e conferido byte a byte; saída colada em [FINAL_AUDIT §42](FINAL_AUDIT.md).

1. `connectSchema` deixa de exigir `consentAccepted`: reprova **2** de **15** em `tests/goal071-whatsapp-consent-qr.integration.test.ts`, contra PostgreSQL real (`expected 502 to be 400`).
2. A rota do QR deixa de ler o status antes: reprova **2** de **15** (`expected 502 to be 200`).
3. A rota do QR deixa de exigir vinculação em curso: reprova **2** de **15** (`expected 502 to be 409` e `expected 200 to be 409`).
4. O painel volta a ler o QR uma vez só: reprova **10** de **28** em `tests/goal071-whatsapp-connection-panel.test.tsx`.
5. O painel chama `connect` sem passar pelo consentimento: reprova **3** de **28**.
6. O fim da janela volta a mostrar o último QR: reprova **5** de **28**.
7. Voltar a ficar visível lê de novo com uma leitura em voo: reprova **1** de **28** (`expected "vi.fn()" to be called 1 times, but got 2 times`).
8. `qrcode: null` ou falha persistentes seguram o último QR: reprova **4** de **28**.
9. A leitura em voo volta a agir depois do cleanup do efeito de QR: reprova **2** de **28** (`expected 'data:image/png;base64,qr-stale' to contain 'qr-new'`).
10. O consentimento volta a aparecer antes da primeira leitura de status: reprova **1** de **28**.
11. A leitura de status do modo código volta a 4 s: reprova **1** de **28** (`expected 1 to be 2`).

Sem o defeito, cada alvo volta a passar por inteiro.

Execução final da rodada 3, sobre a árvore final, antes dos controles:

- `npm run validate:core`: **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0. Dentro dele, `test:frontend` em **85** arquivos e **829** testes (baseline review063: **83**/**793**) e `audit:static` em **33** de **34** verificações passando e **1** pulada.
- `npm run test:gate`: **233**/**233**.
- `npm run validate:ui`: artefato `apps/frontend/e2e-results/results.json` com `expected` **169**, `skipped` **21**, `unexpected` **0**, `flaky` **0**, e **0** retentativas, exit 0.
- `npm run validate:integration`: a primeira execução falhou em `test:bff-integration` com **1** de **417** testes, em `tests/goal025-account-purge.test.ts` (a passada de `runAccountPurge` reivindicou uma segunda conta vencida no banco; purga e teste fora do diff071). A reexecução completa, sem mudança na árvore: **35**/**35** passos, exit 0. Dentro dela, `test:bff-integration` em **51** arquivos e **417** testes (baseline review063: **50**/**402**) e `test:scheduling-integration` em **16**/**124**. O artefato `apps/frontend/e2e-results/authenticated/results.json` traz `expected` **75**, `skipped` **0**, `unexpected` **0** e `flaky` **0**, com **0** retentativas. Baseline **70**: a diferença é `/configuracoes/whatsapp` nas cinco larguras, cada uma medida só depois de "WhatsApp conectado" na tela e sem checkbox.
- `npm run typecheck` e `npm run lint` de `apps/bff` e `apps/frontend`: exit 0 nos quatro.
- `this.http.` em `apps/bff/src/clients/`: **42**.

**Conferência humana pendente.** A conferência do §11 do Goal **não foi feita** por este Goal. Ela confere o QR renovado conectando depois de 60 s aberto, "Gerar novo QR Code" depois da janela conectando, o código copiado conectando pelo celular, e ler o QR com o número já conectado sem derrubar a sessão.

**O que esta seção não prova.** **Não prova** a conexão real (conferência humana acima, não feita). Também não prova que o consentimento tem valor legal. Não prova que os estados de consentimento, carregamento, QR e código e `/onboarding/*` cumprem largura, toque, contraste, foco e movimento, porque não são medidos. Não prova que as telas batem com o protótipo aprovado (conferência humana, Goal068).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal071-2026-09-28-d-081-proposed),
[FINAL_AUDIT §42](FINAL_AUDIT.md) e [D-081](DECISIONS.md).

## O cadastro exige Nome, uma regra de senha só e a recuperação usa o fluxo real por link, do Goal064

`apps/bff/` ganha `User.name` (migration aditiva), exige `name` no cadastro,
escreve a regra de senha de U-10 uma única vez em
`packages/public-api-contract/` e separa o token de redefinição inválido
(`PASSWORD_RESET_TOKEN_INVALID`) da senha recusada (`VALIDATION_ERROR`).
`apps/frontend/` move `/recuperar-senha` para o fluxo real por link, remove
`recoveryMachine.ts` e a encenação de código, valida as quatro telas de
entrada inline sem balão nativo, tira o checkbox morto do login e faz a Home
cumprimentar pela pessoa. `apps/ai-orchestrator/` e
`apps/scheduling-service/` não mudaram; uma migration aditiva. Decisão:
[D-082](DECISIONS.md), proposta no Goal064, **ACCEPTED** no [review064](reviews/064-review.md).

| O que decide agora | O que não decide |
| --- | --- |
| `POST /v1/auth/register` recusa `400 VALIDATION_ERROR` sem `name` aparado de 1 a 120 caracteres, antes de qualquer escrita; `userDto` devolve `name` em `register`, `login` e `GET /v1/auth/session` | Editar o nome depois do cadastro, ou mostrar o nome em Configurações › Conta (fora do escopo) |
| A regra de U-10 é uma definição só, usada por cadastro, `reset-password`, `PATCH /v1/auth/password` e a troca de senha de Configurações › Conta; login continua sem a regra | Escolher, contratar ou configurar provider de e-mail (U-03) — a recuperação continua sem entregar nada de verdade |
| `reset-password` responde `PASSWORD_RESET_TOKEN_INVALID` para token ausente, usado ou vencido, distinto de `VALIDATION_ERROR`; senha igual à atual é recusada antes de consumir o token | Recuperação por código de 6 dígitos, como o protótipo e a pergunta 470 do vault descrevem — divergência registrada em D-082, pendente de confirmação humana |
| `/recuperar-senha` chama `forgotPassword` de verdade; "Senha redefinida" só depois de `resetPassword` responder `200`; nenhuma tela mostra "Digite o código" | Que a recuperação com provider real entrega o link e abre `/nova-senha` no endereço público certo — conferência humana do §11, **não feita** |
| Cadastro, login, recuperar senha e nova senha validam inline, com `noValidate` e todos os erros juntos; o login perde "Manter acesso neste dispositivo"; a Home cumprimenta pela pessoa | Login, sessão, CSRF, `logout`, `logout-all`, exclusão de conta ou purga — nenhum muda |

### Vermelho na baseline

Rodado na rodada 5, numa worktree temporária destacada na baseline aceita
`fbdb0ccbfc9b8457a11b06def3e856b12894e39b`, com só os três arquivos de teste
novos copiados da árvore final (`goal064-auth-screens.test.tsx`,
`goal064-greeting-and-account.test.tsx` e
`goal064-account.integration.test.ts`), o pacote de contrato construído da
fonte da baseline e o client Prisma e as migrations da baseline. A worktree
temporária foi removida depois e não aparece em `git worktree list`.

- Frontend (vitest, jsdom): **2** de **2** arquivos falhando; **27** de
  **31** testes falhando (**23** de **26** em `goal064-auth-screens.test.tsx`,
  **4** de **5** em `goal064-greeting-and-account.test.tsx`). Primeiras linhas:
  `Unable to find a label with the text of: /^Nome/`; `Unable to find an
  accessible element with the role "button" and name "Enviar link"`;
  `expected 'AtendlyAcesso protegidoProntinho para…' not to match /Senha
  redefinida/`.
- BFF (vitest, contra o PostgreSQL 18 descartável em `127.0.0.1:55432`, num
  banco próprio criado e removido para esta execução): **1** de **1** arquivo
  falhando; **6** de **7** testes falhando. Primeiras linhas:
  `expected 201 to be 400` (cadastro sem nome aceito);
  `expected 400 to be 201` (cadastro sem `confirmPassword` recusado);
  `expected 'VALIDATION_ERROR' to be 'PASSWORD_RESET_TOKEN_INVALID'`. O único
  que passa na baseline é o de `forgot-password` sem entrega configurada,
  comportamento anterior a este Goal.

### Controles negativos e execução final

**Seis controles negativos, aplicados e revertidos**, rodados na rodada 5,
**depois da última edição de código**, na própria worktree, com cada arquivo
copiado antes da mutação, restaurado depois e conferido por `md5sum` (mesmo
hash antes e depois); no controle 2, o pacote de contrato foi reconstruído com
o defeito e de novo depois da reversão. Testes por arquivo nesta execução:
`goal064-account.integration.test.ts` **7**, `goal064-auth-screens.test.tsx`
**26**, `goal064-greeting-and-account.test.tsx` **5**. Saída colada em
[FINAL_AUDIT §43](FINAL_AUDIT.md).

1. `registerSchema` deixa de exigir `name`: reprova **1** de **7** em
   `tests/goal064-account.integration.test.ts`, contra PostgreSQL real
   (`expected 201 to be 400` no cadastro sem nome).
2. A regra de senha volta a ser só `min(8)` no pacote (schema e lista de
   regras): reprova **1** de **7** no BFF (`expected 201 to be 400`), **1** de
   **5** em `tests/goal064-greeting-and-account.test.tsx` (a troca de senha
   deixa de recusar senha só de letras) e **1** de **26** em
   `tests/goal064-auth-screens.test.tsx` (as regras ao vivo deixam de mudar).
3. O token inválido volta a responder `VALIDATION_ERROR`: reprova **1** de
   **7** (`expected 'VALIDATION_ERROR' to be 'PASSWORD_RESET_TOKEN_INVALID'`).
4. A conferência contra a senha atual passa para depois do consumo do token:
   reprova **2** de **7** — o token aparece usado depois de uma tentativa
   recusada (`expected 2026-09-28T07:39:44.232Z to be null`), e o fluxo ponta
   a ponta recebe `400` em vez de `200`.
5. `/recuperar-senha` volta a navegar sem chamar `forgotPassword`: reprova
   **8** de **26** em `tests/goal064-auth-screens.test.tsx` (os casos `200`,
   `503`, `429`, falha de rede e `500`, e os três de vocabulário técnico em
   `/recuperar-senha`).
6. O cadastro volta a chamar `reportValidity` (campo Nome marcado
   `required`): reprova **1** de **26** — o caso de todos os erros juntos.

Sem o defeito, cada alvo volta a passar por inteiro na mesma execução.

Execução final da rodada 5, sobre a árvore final, depois dos controles acima:

- `npm run validate:core`: **17** passos, **15** `passed`, **0** `failed`,
  **2** `skipped` (`test:bff`, `test:health-worker`), exit 0. Dentro dele,
  `test:frontend` em **87** arquivos e **854** testes e `audit:static` em
  **33** de **34** verificações passando e **1** pulada.
- `npm run test:gate`: **233**/**233**, **0** falhando, exit 0.
- `npm run validate:ui`: artefato `apps/frontend/e2e-results/results.json`
  com `expected` **169**, `skipped` **21**, `unexpected` **0**, `flaky` **0**,
  e **0** retentativas, exit 0.
- `npm run validate:integration`, contra o PostgreSQL 18 descartável em
  `127.0.0.1:55432`: **35**/**35** passos, exit 0. Dentro dela,
  `test:bff-integration` em **52** arquivos e **424** testes,
  `test:scheduling-integration` em **16**/**124**, sem mudança. O artefato
  `apps/frontend/e2e-results/authenticated/results.json` traz `expected`
  **75**, `skipped` **0**, `unexpected` **0** e `flaky` **0**, com **0**
  retentativas — sem mudança, este Goal não toca nenhuma das nove rotas
  autenticadas.
- `this.http.` em `apps/bff/src/clients/`: **42**.

### Conferência humana e limites

**Conferência humana pendente.** A conferência do §11 do Goal **não foi
feita** por este Goal. Ela confere que a recuperação com um provider de
e-mail real entrega o link, que o link abre `/nova-senha` no endereço público
certo, e que a recuperação por link é aceitável para o produto frente ao
código de 6 dígitos do protótipo e da pergunta 470 do vault.

**O que esta seção não prova.** **Não prova** que a recuperação entrega
e-mail a alguém: não há provider (U-03), e todo teste usa o dublê de entrega
que grava `resetUrl`. Não prova que `/nova-senha` e os estados de erro e
sucesso das telas de entrada cumprem largura, toque, contraste, foco e
movimento — o gate renderizado mede `/login`, `/cadastro`, `/recuperar-senha`,
`/solicitacao-enviada` e `/link-expirado`, não os estados internos nem
`/nova-senha`. Não prova que as telas batem com o protótipo aprovado
(conferência humana, Goal068).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal064-2026-09-28-d-082-proposed),
[FINAL_AUDIT §43](FINAL_AUDIT.md) e [D-082](DECISIONS.md).

## O onboarding segue o vault e entra no gate autenticado, do Goal065

`apps/bff/` aceita os quatro tipos de preço em `PATCH /v1/onboarding`, com a
regra do valor antes do Scheduling. `apps/frontend/` refaz a sequência do
onboarding (Boas-vindas sem gravação; "Seu negócio" em três etapas; primeiro
serviço numa etapa; serviços adicionais; horário por dia; resumo completo),
valida inline sem balão nativo, chama a automação de "IA" e empilha os botões
da introdução do WhatsApp no celular. `scripts/goal033-authenticated-ui-rehearsal.mjs`
semeia uma segunda conta parada no meio do onboarding, e o gate autenticado
mede as etapas dela. Nenhuma migration; `apps/ai-orchestrator/` e
`apps/scheduling-service/` não mudaram. Decisão: [D-083](DECISIONS.md),
proposta no Goal065, **ACCEPTED** no [review065](reviews/065-review.md).

| O que decide agora | O que não decide |
| --- | --- |
| A sequência Boas-vindas → Segmento + nome → Modalidade → Endereço (só com "Local próprio") → "Sua agenda" como está → Primeiro serviço → Serviços adicionais → Dias → Horários → Agenda pronta → IA → WhatsApp; conta nova entra em Boas-vindas e a retomada nunca volta a ela | O bloco "Sua agenda" e a importação no onboarding (Goal066) |
| `PATCH /v1/onboarding` grava e devolve `FIXED`, `STARTING_AT`, `ON_REQUEST` e `NOT_INFORMED`, sem conversão no frontend; valor incoerente é `400 VALIDATION_ERROR` sem gravar | Fidelidade das etapas ao protótipo aprovado (Goal072, conferência humana) |
| Horário por dia: uma regra por dia, e a retomada reconstrói os intervalos gravados; mudar o intervalo-base muda os dias sem personalização | Busca de endereço por CEP (Goal072) |
| O gate autenticado mede, nas cinco larguras, Boas-vindas, Segmento + nome, Modalidade, Endereço, Primeiro serviço, Serviços adicionais, Dias, Horários (com "Personalizar dias diferentes" aberto), Agenda pronta e a introdução do WhatsApp, com os oito chips inteiros e os dois botões do WhatsApp empilhados no celular | Os estados de erro das etapas — ficam no jsdom; o gate não os mede |
| Nenhuma exceção nova em `KNOWN_*`; `AUTHENTICATED_ROUTES` e as medidas da conta principal não mudam | Que o onboarding num aparelho real segue o vault de ponta a ponta — conferência humana do §11, **não feita** |

### Vermelho na baseline

Rodado na rodada 2, depois da última edição de código e antes da execução
final, com os arquivos de teste da árvore final.

- Frontend (vitest, jsdom), numa cópia da árvore de
  `76293d0747d0c755c38f90ff71ded08c1247a987` extraída por `git archive` para
  fora do repositório, com só os três arquivos de teste novos copiados:
  **3** de **3** arquivos falhando; **67** de **76** testes falhando
  (**21** de **21** em `goal065-onboarding-business.test.tsx`, **12** de
  **18** em `goal065-onboarding-copy-whatsapp.test.tsx`, **34** de **37** em
  `goal065-onboarding-schedule.test.tsx`). Primeiras linhas:
  `expected 'dados-do-negocio' to be 'boas-vindas'`;
  `expected 'Atendente virtualComo a Atendly deve …' not to match /Atendly/`;
  `Unable to find role="button" and name "Personalizar dias diferentes"`.
- BFF (vitest, contra o PostgreSQL 18 descartável que
  `tools/ia-loop/lib/temporary-postgres.mjs#withTestDatabases` inicia em
  `127.0.0.1:55500` e remove ao fim), com `routes.ts` da baseline no lugar e
  restaurado por hash: **2** de **4** testes falhando
  (`expected 400 to be 200` nos quatro tipos; `STARTING_AT` sem `price`
  recusado sem nomear `price`).

### Controles negativos e execução final

**Seis controles negativos, aplicados e revertidos**, rodados na rodada 2,
**depois da última edição de código**, na própria worktree, com
`git hash-object` idêntico antes e depois de cada um. Testes por arquivo:
`goal065-onboarding.integration.test.ts` **4**,
`goal065-onboarding-business.test.tsx` **21**,
`goal065-onboarding-schedule.test.tsx` **37**,
`goal065-onboarding-copy-whatsapp.test.tsx` **18**. Saída colada em
[FINAL_AUDIT §44](FINAL_AUDIT.md).

1. `service.priceType` do `PATCH` volta a `FIXED`/`ON_REQUEST`: reprova **2**
   de **4** contra PostgreSQL real.
2. `draftFromState` volta a converter pelo par mais próximo: reprova **6** de
   **37** em `goal065-onboarding-schedule.test.tsx`, incluindo
   `um serviço existente lido como STARTING_AT continua STARTING_AT ao gravar…`.
3. O formulário volta a chamar `reportValidity`: reprova **10** de **58** nos
   arquivos de negócio e de agenda (todos os casos de erros juntos).
4. A gravação de horários volta a mandar o mesmo intervalo para todos os
   dias: reprova **2** de **37** (`expected '09:00' to be '08:00'`).
5. `nextRequiredStep` volta a devolver `dados-do-negocio` para conta nova:
   reprova **1** de **21**.
6. `.chip-row.segment-chip-row` volta a `nowrap` com rolagem horizontal,
   medido por `node scripts/goal033-authenticated-ui-rehearsal.mjs` (o passo
   `rehearse:goal033-authenticated-ui` de `validate:integration`): reprova
   `onboarding-segmento-e-nome` nas cinco larguras, `unexpected` **5** de
   **125**; a 360 px, `881px of content in 328px`.

Sem o defeito, cada alvo volta a passar por inteiro: **4**/**4** no BFF,
**76**/**76** no frontend, e o gate autenticado, rodado de novo depois da
restauração do controle 6, com `expected` **125** e `unexpected` **0**.

Execução final da rodada 2, sobre a árvore final, antes dos controles acima:

- `npm run validate:core`: **17** passos, **15** `passed`, **0** `failed`,
  **2** `skipped` (`test:bff`, `test:health-worker`), exit 0. Dentro dele,
  `test:frontend` em **90** arquivos e **927** testes e `audit:static` em
  **33** de **34** verificações passando e **1** pulada.
- `npm run test:gate`: **233**/**233**, **0** falhando, exit 0.
- `npm run validate:ui`: `apps/frontend/e2e-results/results.json` com
  `expected` **169**, `skipped` **21**, `unexpected` **0**, `flaky` **0** e
  **0** retentativas, exit 0.
- `npm run validate:integration`, contra o PostgreSQL 18 descartável em
  `127.0.0.1:55500`: **35**/**35** passos, exit 0. Dentro dela,
  `test:bff-integration` em **53** arquivos e **428** testes e
  `test:scheduling-integration` em **16**/**124**, sem mudança. O gate
  autenticado traz `expected` **125** — os **75** da conta principal, sem
  mudança, mais **50** (dez etapas do onboarding nas cinco larguras) —,
  `skipped` **0**, `unexpected` **0**, `flaky` **0** e **0** retentativas.
- `this.http.` em `apps/bff/src/clients/`: **42**.

**Execução do orquestrador na revisão da rodada 2.** O `validate:integration`
rodado pelo IA Loop para a revisão (fora das duas execuções do Developer, que
deram **125**/**0**/**0**) teve o gate autenticado com `expected` **124** e
`flaky` **1**: `onboarding-whatsapp@desktop-1440` falhou na primeira tentativa
com `net::ERR_NO_BUFFER_SPACE`, esgotamento de buffer de socket do Windows, e
passou na retentativa. Não é defeito do produto nem do teste; fica registrado
porque essa execução não foi limpa.

### Conferência humana e limites

**Conferência humana pendente.** A conferência do §11 do Goal **não foi
feita** por este Goal: percorrer o onboarding num aparelho real, com a conta
nova, de ponta a ponta, e conferir as etapas contra o protótipo aprovado
(Goal072).

**O que esta seção não prova.** Não prova que os estados de erro das etapas
cumprem largura, toque, contraste, foco e movimento — ficam no jsdom. Não
prova o bloco "Sua agenda" nem a importação no onboarding (Goal066). Não
prova fidelidade ao protótipo (Goal072).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal065-2026-09-28-d-083-accepted),
[FINAL_AUDIT §44](FINAL_AUDIT.md) e [D-083](DECISIONS.md).

## A importação entra no onboarding e as etapas novas entram no gate autenticado, do Goal066

`apps/frontend/` troca as três telas antigas do bloco "Sua agenda" por
"Sistema atual" e "Quando importar", grava `calendar.source` antes de
qualquer importação, monta a mesma experiência de `/importacao` numa etapa
`importacao` do onboarding (sem shell da plataforma, sem link
"Configurações") e corrige o horário personalizado só no início. O gate
autenticado mede as três etapas novas. Nenhuma migration; `apps/bff/`,
`apps/scheduling-service/` e `scripts/` não mudaram. Decisão:
[D-084](DECISIONS.md), proposta no Goal066, **ACCEPTED** no [review066](reviews/066-review.md).

| O que decide agora | O que não decide |
| --- | --- |
| A sequência … Endereço → Sistema atual → (Quando importar → Importação) → Primeiro serviço, Dias e Horários só se a importação não os trouxe → Demonstração da IA; as três rotas antigas redirecionam para `sistema-atual` | Que a importação no onboarding funciona contra uma conta real do Minha Agenda — conferência humana do §7, **não feita** |
| "Importar agora", "Fazer depois" e "Não, começar do zero" gravam `calendar.source` e só avançam com `200`; "Sim, quero importar" só navega | Que a ausência de tela separada de escolha de origem é aceitável (D-084, conferência humana) |
| A etapa `importacao` usa as mesmas telas e chamadas de `/importacao`, sem `useShellConfig`, sem link "Configurações", com um `<h1>` só; `/importacao` não muda | Largura, toque, contraste, foco e movimento dos estados de análise, revisão, conflitos, execução e resultado dentro do onboarding — ficam no jsdom |
| O gate autenticado mede, nas cinco larguras, as dez etapas do Goal065 mais `sistema-atual`, `quando-importar` e `importacao` (estado de conectar) | Fidelidade das etapas novas ao protótipo aprovado (Goal072) |
| Nenhuma exceção nova em `KNOWN_*`; `AUTHENTICATED_ROUTES`, `ONBOARDING_ROUTES` e as medidas da conta principal não perdem rota | — |

### Vermelho na baseline

Rodado na rodada 2, antes da execução final, numa cópia de `apps/frontend`
de `f565978a8da01165fd3b397f5c1a9ef58dd6e747` extraída por `git archive`
para fora do repositório, com só os dois arquivos de teste novos copiados:
**2** de **2** arquivos falhando; **33** de **36** testes falhando
(**23** de **23** em `goal066-onboarding-sistema-atual.test.tsx`, **10** de
**13** em `goal066-onboarding-importacao.test.tsx`). Primeiras linhas:
`TypeError: undefined is not iterable` (o cenário `sistema-atual` não existe);
`expected 'fonte-da-agenda' to be 'sistema-atual'`;
`expected 'servico-nome' to be 'importacao'`. Os **3** que passam são de
preservação (retomada com importação concluída ou com falha de leitura vai a
`servico-nome`; `/importacao` mantém o link e o shell).

### Controles negativos e execução final

**Seis controles negativos, aplicados e revertidos**, rodados na rodada 2,
**depois da última edição de código** e da execução final, na própria
worktree, com `git hash-object` idêntico antes e depois de cada um, contra os
**36** testes dos dois arquivos `goal066-`. Saída colada em
[FINAL_AUDIT §45](FINAL_AUDIT.md).

1. `sistema-atual` volta a pré-marcar "Não, começar do zero": reprova **2**
   de **36** (`expected 'choice-card is-selected' not to contain 'is-selected'`).
2. "Importar agora" deixa de gravar `calendar.source` antes: reprova **3**,
   incluindo o teste de ordem PATCH → releitura → etapa `importacao`.
3. A moldura do onboarding volta a mostrar o link "Configurações": reprova
   **5** (conectar, sessão viva e os três destinos de §5B).
4. `nextRequiredStep` volta a ignorar a sessão viva: reprova **2**
   (`expected 'servico-nome' to be 'importacao'`).
5. Depois da importação concluída, "Continuar" vai direto a
   `demonstracao-da-ia`: reprova **2** (os destinos `servico-nome` e
   `dias-de-atendimento`).
6. O dia personalizado só no início volta a congelar o fim antigo: reprova
   **2** (só o início, e só o fim).

Sem o defeito, **36**/**36**.

Execução final da rodada 2, sobre a árvore final, antes dos controles acima:

- `npm run validate:core`: **17** passos, **15** `passed`, **0** `failed`,
  **2** `skipped` (`test:bff`, `test:health-worker`), exit 0. Dentro dele,
  `test:frontend` em **92** arquivos e **958** testes e `audit:static` em
  **33** de **34** verificações passando e **1** pulada.
- `npm run test:gate`: **233**/**233**, **0** falhando, exit 0.
- `npm run validate:ui`: `apps/frontend/e2e-results/results.json` com
  `expected` **169**, `skipped` **21**, `unexpected` **0**, `flaky` **0** e
  **0** retentativas, exit 0.
- `npm run validate:integration`, contra o PostgreSQL 18 descartável em
  `127.0.0.1:55432`: **35**/**35** passos, exit 0. Dentro dela,
  `test:bff-integration` em **53** arquivos e **428** testes e
  `test:scheduling-integration` em **16**/**124**, sem mudança. O gate
  autenticado traz `expected` **140** — os **125** de antes, sem mudança,
  mais **15** (`onboarding-sistema-atual`, `onboarding-quando-importar` e
  `onboarding-importacao` nas cinco larguras) —, `skipped` **0**,
  `unexpected` **0**, `flaky` **0** e **0** retentativas.
- `this.http.` em `apps/bff/src/clients/`: **42**.

### Conferência humana e limites

**Conferência humana pendente.** A conferência do §7 do Goal **não foi
feita** por este Goal: percorrer o onboarding com importação num aparelho
real contra uma conta real do Minha Agenda e chegar à demonstração da IA sem
recadastro; decidir se a ausência de tela separada de escolha de origem é
aceitável (D-084); conferir as etapas novas contra o protótipo aprovado
(Goal072).

**O que esta seção não prova.** Não prova que os estados de análise,
revisão, conflitos, execução e resultado da importação dentro do onboarding
cumprem largura, toque, contraste, foco e movimento — ficam no jsdom. Não
prova a importação contra uma origem real. Não prova fidelidade ao
protótipo (Goal072).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal066-2026-09-28-d-084-proposed),
[FINAL_AUDIT §45](FINAL_AUDIT.md) e [D-084](DECISIONS.md).

## Regras de oferta, disponibilidade por dia, leitura de "Outras informações importantes", pausa sem consumir prova, nome da pessoa e "Mais" completo, do Goal067

`apps/frontend/` ganha tela para as regras de oferta em Configurações ›
Agenda, disponibilidade por dia com mais de um intervalo, reexibição de
"Outras informações importantes", edição do nome em Conta, "Mais" completo
no celular e a saída de "Ajuda" dos dois menus. `apps/bff/` para de consumir
a prova do teste real ao pausar com a IA já desligada e ganha
`PATCH /v1/account/profile` e `GET /v1/knowledge/other-info`.
`apps/ai-orchestrator/` ganha `GET /internal/knowledge/other-info`, isolado
por tenant. `packages/public-api-contract/` ganha `accountProfileResultSchema`
e `otherInfoResultSchema` e as duas entradas correspondentes em
`publicApiRoutes` — desvio declarado do Goal067 §10, exigido pela checagem
`public_api_route_coverage` desta mesma tabela para as duas rotas novas (ver
[D-085](DECISIONS.md)). O gate autenticado mede as três telas novas. Nenhuma
migration; `apps/scheduling-service/` e `scripts/` não mudam. Decisão:
[D-085](DECISIONS.md), proposta no Goal067, **ACCEPTED** no
[review067](reviews/067-review.md).

| O que decide agora | O que não decide |
| --- | --- |
| Configurações › Agenda com antecedência mínima, limite no futuro e intervalo entre horários, com o valor lido sempre representado; salvar reenvia `timezone`/`rules` lidos sem mudança | A política de cancelamento de QA S-06 e QA S-08 ("Como você vê a agenda") — não existem em camada nenhuma, ficam para o Goal073 |
| Disponibilidade por dia, com um ou mais intervalos, sobreposição e início-depois-do-fim recusados inline | Que a IA respeita as regras de oferta numa conversa real (conferência humana do §8; o motor é do Goal009 e não muda) |
| `GET /internal/knowledge/other-info` e `GET /v1/knowledge/other-info`, isolados por tenant; `OtherInfoSection` abre com o texto salvo | Que Configurações bate com o protótipo aprovado nas opções e nos textos (conferência humana do §8) |
| `PATCH /v1/settings/ai` só grava `activatedByRunId` na passagem ligada→desligada | Fidelidade visual de Configurações ao protótipo além do que este Goal cria (Goal068) |
| `PATCH /v1/account/profile`, mesma validação do cadastro, escreve só o `User` da sessão | — |
| `MORE_DESTINATIONS` ganha Disponibilidade e Conversas; "Ajuda" sai dos dois menus | — |
| O gate autenticado mede, nas cinco larguras, `/configuracoes/agenda`, `/configuracoes/disponibilidade` e `/configuracoes/conta` | — |
| Nenhuma exceção nova em `KNOWN_*`; `AUTHENTICATED_ROUTES` e `ONBOARDING_ROUTES` não perdem rota | — |

### Controles negativos e execução final

**Sete controles negativos, aplicados e revertidos**, rodados por esta
unidade (WU-15), **depois da última edição de código** e da execução final,
na própria worktree, com `sha256sum` idêntico antes e depois de cada um.
Saída colada em [FINAL_AUDIT §46](FINAL_AUDIT.md).

1. Isolamento por tenant da leitura do orquestrador (`getOtherInfo`) sai do
   filtro: reprova o teste de isolamento (apps/ai-orchestrator).
2. O ramo de pausa volta a gravar `activatedByRunId` sem olhar o `enabled`
   gravado: reprova o teste de estilo com a IA desligada (apps/bff,
   integração contra PostgreSQL real).
3. Gravar as regras de oferta envia `rules: []`: reprova o teste de
   preservação da grade (apps/frontend).
4. Disponibilidade volta a recusar a grade com dois intervalos no dia:
   reprova o teste de grade por dia (apps/frontend).
5. `OtherInfoSection` volta a abrir vazia: reprova o teste de reexibição
   (apps/frontend).
6. Disponibilidade sai de `MORE_DESTINATIONS`: reprova o teste do "Mais"
   (apps/frontend).
7. `PATCH /v1/account/profile` aceita nome só com espaços: reprova o teste
   de validação (apps/bff, integração contra PostgreSQL real).

Sem cada defeito, os testes nomeados voltam a passar, e o arquivo restaurado
bate hash com o original em todos os sete.

Execução final da rodada 2 (FIX-001), sobre a árvore com os blockers 1–3
corrigidos, antes dos controles acima:

- `node scripts/validate-core.mjs`: **17** passos, **15** `passed`, **0**
  `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0.
  Dentro dele, `test:ai-orchestrator` em **85**/**97** arquivos e
  **1117**/**1205** testes; `test:scheduling-service` em **35**/**35** e
  **484**/**484**; `test:frontend` em **94**/**94** arquivos e
  **979**/**979** testes (baseline desta seção **976**, os **3** a mais são
  o teste novo do blocker 1 e os dois testes novos do blocker 2);
  `audit:static` em **33** de **34** verificações
  passando e **1** pulada.
- `node --test scripts/tests/**/*.test.mjs` (`test:gate`): **233**/**233**,
  **0** falhando, exit 0.
- `node scripts/validate-ui.mjs`: **169** passando, **21** pulados, **0**
  falhando, **0** retentativas, exit 0.
- `node scripts/validate-integration.mjs`, contra o PostgreSQL 18
  descartável em `127.0.0.1:55432`
  (`BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test`):
  **35**/**35** passos, exit 0. Dentro dela, `test:bff-integration` em
  **55** arquivos e **434** testes (baseline **53**/**428**, os **2**
  arquivos e **6** testes novos continuam sendo `goal067-*`);
  `test:scheduling-integration` em **16**/**124**, sem mudança; gate
  autenticado (`rehearse:goal033-authenticated-ui`) com **155** testes
  passando (baseline **140**, mais **15** das três rotas novas nas cinco
  larguras), **0** falhando e **0** retentativas.
- `this.http.` em `apps/bff/src/clients/`: **43** (sem mudança nesta rodada).

Dos sete controles negativos acima, os seis de código (2 a 7) foram
reaplicados e revertidos depois desta execução, com hash antes/durante/
depois idêntico em cada um — saída real em [FINAL_AUDIT §46](FINAL_AUDIT.md).
O controle 1 (isolamento por tenant da leitura do orquestrador) não foi
re-executado nesta rodada: o arquivo (`knowledge-document-service.ts`) não
foi tocado pelo FIX-001, e a tentativa de reaplicar o mesmo defeito foi
recusada pela permissão do harness como remoção de controle de segurança,
antes de qualquer teste rodar; o arquivo foi restaurado de imediato e o
hash conferido idêntico ao original.

### Conferência humana e limites

**Conferência humana pendente.** A conferência do §8 do Goal **não foi
feita** por este Goal: que Configurações bate com o protótipo
`Mais-Negocio-Agenda-IA` e `Mais-WhatsApp-Importacao-Conta` nas opções e nos
textos; que a IA, depois de mudar as regras de oferta, oferece horários com
a antecedência, o limite e o intervalo escolhidos numa conversa real.

**O que esta seção não prova.** Não prova a política de cancelamento nem
"Como você vê a agenda" (Goal073). Não prova fidelidade visual de
Configurações ao protótipo além do que este Goal cria (Goal068). Não
reproduz o vermelho da baseline de cada escopo obrigatório (§6 do Goal):
essa evidência é das unidades que implementaram cada parte (WU-01 a WU-04).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal067-2026-09-28-d-085-proposed),
[FINAL_AUDIT §46](FINAL_AUDIT.md) e [D-085](DECISIONS.md).

## Política de cancelamento e remarcação, "Como você vê a Agenda" e as observações 2 e 5 do review067, do Goal073

`apps/scheduling-service/` ganha `CalendarSettings.customerChangeMinNoticeMinutes`
(migration aditiva `20260928120000_goal073_customer_change_policy`) e a regra
de antecedência mínima do cliente, aplicada só a chamador `AI` dentro da
transação de cancelar/remarcar. `apps/ai-orchestrator/` lê a regra ao
preparar e traduz a recusa do Scheduling ao confirmar, sem nunca contar a
recusa como efeito. `apps/bff/` ganha `AgendaViewPreference` (migration
aditiva `20260928130000_goal073_agenda_view_preference`) e
`GET`/`PATCH /v1/settings/agenda-view`. `apps/frontend/` ganha a tela da
política em Configurações › Agenda, a seção "Como você vê a Agenda", a
Agenda abrindo em Automática (Semana a partir de 1024px) ou na visualização
gravada com dias ocultos omitidos em Semana/Mês, e as observações 2 e 5 do
[review067](reviews/067-review.md). Decisão: [D-086](DECISIONS.md), proposta
no Goal073, **ACCEPTED** no [review073](reviews/073-review.md).

| O que decide agora | O que não decide |
| --- | --- |
| Antecedência mínima do cliente (0..10080 min, padrão 0), aplicada a todo chamador `AI` dentro da transação de cancelar/remarcar, com a única isenção nomeada `ACTIVATION_TEST_CLEANUP` só em `/cancel` | Prazo diferente por serviço, por cliente, ou separado para cancelar e remarcar — o vault fixa uma regra global |
| A IA recusa fora do prazo já no `prepare`, sem pendência e sem hold, e a recusa nunca conta como efeito confirmado | Que a IA, numa conversa real, explica o prazo com as palavras certas (conferência humana do §9) |
| `AgendaViewPreference` e `GET`/`PATCH /v1/settings/agenda-view`, isolados por tenant, sem linha por padrão | Estrutura e fidelidade visual da Agenda além de qual visualização abre e quais colunas aparecem (Goal069) |
| A Agenda abre em Automática (Semana ≥1024px, Dia abaixo) ou na visualização gravada; leitura falhada abre em Automática sem erro | Que as telas batem com o protótipo aprovado nas opções e nos textos (conferência humana do §9) |
| Dias ocultos somem de Semana e Mês e o espaço é redistribuído; "Dia" continua navegando por todos os dias | — |
| Observações 2 e 5 do review067 corrigidas (`OtherInfoSection` somente leitura durante leitura pendente/falhada; `toggleDay` respeita o limite de 28 regras) | — |
| O gate autenticado continua medindo `/agenda` e `/configuracoes/agenda`, nas cinco larguras, sem rota nova nem removida | — |

### Achado corrigido fora do escopo obrigatório

O helper do gate autenticado (`apps/frontend/e2e/authenticated-matrix.spec.ts`,
`ensureAgendaOnMeasuredDate`) assumia que `/agenda` sempre abre em "Dia" e
clicava no botão "Próximo dia" em qualquer largura. Com a Agenda abrindo em
Semana a partir de 1024px, essa visualização não tem esse botão, e a medida
de `/agenda` travava em timeout de 180000ms em `notebook-1024` e
`desktop-1440` — reproduzido pela execução final desta unidade (WU-17) antes
da correção. Corrigido pulando a navegação por dia quando o botão não existe:
a semeadura do gate procura horário livre nos dois dias seguintes a "hoje",
que a semana ou o mês correntes já cobrem sem precisar navegar. Nenhuma
medida foi desligada, e a conta do gate autenticado (155 testes) não mudou.
Ver [D-086](DECISIONS.md) e [FINAL_AUDIT §47](FINAL_AUDIT.md).

### Oito controles negativos e execução final

**Oito controles negativos, aplicados e revertidos**, rodados na rodada 3
(FIX-001) sobre a árvore final, **depois da última edição de código** (da
rodada 2; a rodada 3 só mudou documentação) e depois da execução final
abaixo, na própria worktree, com `sha256sum` idêntico antes e depois de
cada um. Saída colada em [FINAL_AUDIT §47](FINAL_AUDIT.md).

1. O Scheduling deixa de conferir o prazo: reprova o teste de cancelar a
   23h (apps/scheduling-service, integração contra PostgreSQL real).
2. O Scheduling passa a barrar também o chamador `USER`: reprova o teste da
   Agenda a 1h, em cancelamento e remarcação (apps/scheduling-service).
3. A comparação vira `<=` no lugar de `<`: reprovam os dois testes
   permanentes de fronteira ("exatamente 24h e 25h", em cancelamento e em
   remarcação), que congelam `databaseNow` com `vi.mock` parcial de
   `write-policy.ts` e põem o atendimento a exatamente 1440 minutos do
   instante que a regra lê (apps/scheduling-service, integração contra
   PostgreSQL real). Nenhum arquivo de controle temporário.
4. A isenção deixa de ser enviada pela limpeza do teste real: reprova o
   teste estático que conta onde o literal `ACTIVATION_TEST_CLEANUP`
   aparece (apps/ai-orchestrator).
5. `prepareReschedule` cria o hold antes de conferir o prazo: reprova o
   teste de remarcar fora do prazo sem hold (apps/ai-orchestrator).
6. A recusa passa a contar em `loadTurnConfirmedEffects`: reprova o teste
   que exige `AiToolCall.status: "FAILED"` numa confirmação recusada
   (apps/ai-orchestrator).
7. A Agenda volta a abrir sempre em Dia: reprova o teste de 1024px
   (apps/frontend).
8. Semana volta a mostrar o dia oculto: reprova o teste de dias visíveis
   (apps/frontend).

Sem cada defeito, os testes nomeados voltam a passar, e o arquivo restaurado
bate hash com o original em todos os oito (os controles 1, 2 e 3 compartilham
`apps/scheduling-service/.../provider.ts`, cada edição revertida antes da
próxima).

Execução final da rodada 3 (FIX-001), sobre a árvore final, na ordem do §10
do Goal, antes dos controles acima:

- `node scripts/validate-core.mjs`: **17** passos, **15** `passed`, **0**
  `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0.
  Dentro dele, `test:ai-orchestrator` em **86** arquivos passando e **12**
  pulados (**98**) e **1127** testes passando e **88** pulados (**1215**)
  (baseline **85**/**97** e **1117**/**1205**; o **1** arquivo e os **10**
  testes a mais são `goal073-customer-change-policy.test.ts`);
  `test:scheduling-service` em **35**/**35** e **484**/**484**, sem
  mudança; `test:frontend` em **96**/**96** arquivos e **1000**/**1000**
  testes (baseline **94**/**979**; os **2** arquivos e **21** testes a mais
  são `goal073-agenda-visualizacao.test.tsx`, **8**, e
  `goal073-configuracoes-agenda.test.tsx`, **13**); `audit:static` em
  **33** de **34** verificações passando e **1** pulada, sem mudança.
- `npm run test:gate` (`node --test scripts/tests/**/*.test.mjs`):
  **233**/**233**, **0** falhando, exit 0 — sem mudança.
- `node scripts/validate-ui.mjs`: **169** passando, **21** pulados, **0**
  falhando, **0** retentativas, exit 0; no `results.json` do Playwright,
  `expected` **169**, `unexpected` **0**, `flaky` **0** — sem mudança
  (rotas públicas só; `/agenda` e `/configuracoes/agenda` são do gate
  autenticado).
- `node scripts/validate-integration.mjs`, contra o PostgreSQL 18
  descartável em `127.0.0.1:55432`
  (`BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test`):
  **PASSED**, **35**/**35** passos, exit 0. Dentro dela,
  `test:bff-integration` em **56**/**56** arquivos e **439**/**439** testes
  (baseline **55**/**434**; o **1** arquivo e **5** testes a mais são
  `goal073-settings-policy-and-agenda-view.integration.test.ts`);
  `test:scheduling-integration` em **17**/**17** arquivos e **140**/**140**
  testes (baseline **16**/**124**; o **1** arquivo e **16** testes a mais
  são `goal073-customer-change-policy.integration.test.ts`);
  `test:ai-orchestrator-transport-durability` **9**/**69** e
  `test:ai-orchestrator-content-purge` **3**/**19**, sem mudança; gate
  autenticado (`rehearse:goal033-authenticated-ui`) com `expected`
  **155**, `unexpected` **0**, `flaky` **0** e **0** retentativas, com
  `/agenda` e `/configuracoes/agenda` nas cinco larguras — mesma contagem
  da baseline.
- `this.http.` em `apps/bff/src/clients/`: **43** (sem mudança).
- Typecheck de `apps/scheduling-service`, `apps/ai-orchestrator` e
  `apps/bff`, provado pelos passos `build:*` de `validate:core` (cada
  `build` roda `tsc -p tsconfig.json`); `apps/frontend` por
  `npx tsc --noEmit`, exit 0. `npm run lint` de `apps/frontend`
  (`eslint src tests --max-warnings=0`), exit 0.

**Vermelho da baseline `a1adf4b`.** O teste novo do Scheduling foi rodado
contra a baseline pela unidade que o implementou (WU-01, rodada 1: **16**
falhando). Os testes novos do orquestrador, do BFF e do frontend foram
rodados contra uma cópia de `a1adf4b` na rodada 2 (FIX-001), com só os
arquivos de teste novos copiados: orquestrador **8** falhando e **2**
passando de **10**; BFF **5** de **5** falhando; frontend **18** falhando e
**3** passando de **21**. Saída em [FINAL_AUDIT §47](FINAL_AUDIT.md).

### Conferência humana e limites

**Conferência humana pendente.** A conferência do §9 do Goal **não foi
feita** por este Goal: que Configurações › Agenda e a Agenda, num aparelho
real, batem com o protótipo `Mais-Negocio-Agenda-IA` nas opções e nos
textos, e se a opção Automática deve existir; que a IA, numa conversa real,
explica o prazo e oferece falar com o profissional sem dizer que cancelou.

**O que esta seção não prova.** Não prova estrutura e fidelidade visual da
Agenda além do que este Goal muda — qual visualização abre, quais colunas
aparecem (Goal069). O vermelho da baseline dos testes novos (§7 do Goal)
está acima: o do Scheduling é da rodada 1 (WU-01); o do orquestrador, do
BFF e do frontend é da rodada 2 (FIX-001).

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal073-2026-09-28-d-086-proposed),
[FINAL_AUDIT §47](FINAL_AUDIT.md) e [D-086](DECISIONS.md).

## Fidelidade visual de marca e autenticação, do Goal068

`apps/frontend/` ganha a marca v4 em SVG de uma cor (`Brand`/`BrandMark`),
favicon em SVG, assinatura animada uma vez por sessão do navegador e as
telas de entrada compostas por largura em Petróleo, com os textos de C-05,
C-06 e L-07. Decisão: [D-087](DECISIONS.md), proposta no Goal068,
**PROPOSED**.

| O que decide agora | O que não decide |
| --- | --- |
| O símbolo da marca é um SVG de três traços, uma cor só (`stroke="currentColor"`), vinda do contexto — nunca CSS de caixa/pontos | Que a marca, num aparelho real, bate pixel a pixel com `Marca.dc.html` (conferência humana do §8) |
| Favicon em `public/brand/avenly-icon.svg`; os quatro PNGs antigos e os cinco SVGs de exemplo do Next saíram de `public/` | — |
| A assinatura anima uma vez por sessão do navegador (`sessionStorage` por chave), nunca deixando o símbolo incompleto; `prefers-reduced-motion` e ausência de `sessionStorage` mostram o símbolo parado e completo | Que a assinatura, num aparelho real, bate com os tempos de `Movimento.dc.html` (conferência humana do §8) |
| `.entry-panel` usa `--accent` (Petróleo), nunca `--navy`; composição por três limiares de largura (768px, 1024px, 1280px) | Que as telas de entrada, num aparelho real, batem com os três protótipos de Login (conferência humana do §8) |
| Textos de C-05, C-06 e L-07 nas telas de entrada; "Esqueci minha senha" sozinho, à direita, abaixo da senha (L-06) | A saudação neutra ("Boas-vindas de volta...") no lugar de "Bem-vinda de volta." — divergência declarada, não decisão fechada |
| — | A Home (protótipo pede números da semana que nenhuma camada calcula) — vai para o Goal074 |
| `/nova-senha` fica fora de `PUBLIC_ROUTES` (`apps/frontend/e2e/routes.ts`), porque exige token — `validate:ui` não a alcança | Largura, toque, contraste, foco e movimento de `/nova-senha` num aparelho real: fica provada só em jsdom, por `goal064-auth-screens.test.tsx` (Goal064) |

### Sete controles negativos e execução final

**Sete controles negativos, aplicados e revertidos**, rodados por esta
unidade (WU-11) sobre a árvore final, **depois da última edição de código**
e da execução final abaixo, na própria worktree, com `sha256sum` idêntico
antes e depois de cada um. Saída colada em
[FINAL_AUDIT §48](FINAL_AUDIT.md).

1. `Brand` volta a renderizar `<span className="brand-mark">`: reprova os
   dois testes de estrutura do SVG (`apps/frontend`,
   `goal068-marca.test.tsx`).
2. Um dos traços ganha `stroke` fixo de outra cor: reprova o teste de
   `stroke=currentColor` único (`goal068-marca.test.tsx`).
3. `layout.tsx` volta a apontar para `atendly-favicon-32x32.png`: reprova o
   teste do favicon novo (`goal068-marca.test.tsx`).
4. A assinatura ignora `prefers-reduced-motion`: reprova o teste de
   movimento reduzido (`goal068-assinatura.test.tsx`).
5. A assinatura deixa de registrar a sessão: reprova os testes de segunda
   montagem, entrada e sidebar (`goal068-assinatura.test.tsx`).
6. A seta passa a fazer parte do nome acessível do botão: reprova o teste
   do nome acessível "Criar conta" e o fluxo de cadastro do Goal064
   (`goal068-telas-de-entrada.test.tsx`).
7. O apoio do cadastro volta ao texto antigo: reprova o teste da frase de
   C-05 (`goal068-telas-de-entrada.test.tsx`).

Sem cada defeito, os três arquivos de teste voltam a passar por inteiro:
`npx vitest run tests/goal068-marca.test.tsx tests/goal068-assinatura.test.tsx tests/goal068-telas-de-entrada.test.tsx`
→ **3** arquivos e **30** testes passando, exit 0. Os arquivos-alvo
(`Brand.tsx`, `layout.tsx`, `AuthScreen.tsx`) foram restaurados byte a byte:
o `sha256sum` de cada um depois da restauração bate com o de antes do
defeito, inclusive entre os controles que compartilham arquivo (1/2/4/5 em
`Brand.tsx`; 6/7 em `AuthScreen.tsx`), cada edição revertida antes da
próxima.

**Execução final**, na ordem do §10 do Goal (`validate:core`, `test:gate`,
`validate:ui`, `validate:integration`, WU-07 a WU-10), antes dos controles
acima:

- `test:frontend` (`npx vitest run`, reexecutado por esta unidade sobre a
  árvore final): **99**/**99** arquivos e **1030**/**1030** testes, exit 0
  — baseline `2995be5` **96**/**1000**; os **3** arquivos e **30** testes a
  mais são `goal068-marca.test.tsx` (11), `goal068-assinatura.test.tsx`
  (11) e `goal068-telas-de-entrada.test.tsx` (8).
- `test:gate` (`npm run test:gate`, reexecutado por esta unidade):
  `tests 233`, `pass 233`, `fail 0`, `skipped 0`, exit 0 — sem mudança.
- `validate:ui` (WU-09): `e2e-results/results.json.stats` → `expected`
  **169**, `skipped` **21**, `unexpected` **0**, `flaky` **0** — sem
  mudança (rotas públicas só).
- Gate autenticado (`rehearse:goal033-authenticated-ui`, dentro de
  `validate:integration`, WU-10): `e2e-results/authenticated/results.json.stats`
  → `expected` **155**, `skipped` **0**, `unexpected` **0**, `flaky` **0**;
  nenhum resultado individual com `retry > 0` — sem mudança de rota,
  **0** retentativas.
- `validate:integration` (WU-10): PASSED, exit 0, `393635ms`.

`test:frontend` e `test:gate` foram reexecutados por esta unidade (WU-11)
depois da última edição de código (anterior a WU-07); `validate:ui` e o
gate autenticado são lidos dos artefatos `results.json` gravados por
WU-09/WU-10, ainda presentes na worktree. `validate:core` (WU-07) não tem
número citado aqui: nenhuma execução própria desta unidade o mediu.

### Conferência humana e limites

**Conferência humana pendente.** A conferência do §8 do Goal **não foi
feita** por este Goal: que a marca, a assinatura animada e as telas de
entrada, num aparelho real nas cinco larguras, batem com `Marca.dc.html`,
`Movimento.dc.html` e os três protótipos de login; e que a saudação neutra
é aceitável no lugar de "Bem-vinda de volta.".

**O que esta seção não prova.** Não prova fidelidade visual da Home
(Goal074), das telas de módulo (Goal069) ou do onboarding (Goal072) além
da troca de marca, que já vale para eles pelos cinco usos de `Brand`.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal068-2026-09-29-d-087-proposed),
[FINAL_AUDIT §48](FINAL_AUDIT.md) e [D-087](DECISIONS.md).

### Correção — rodada 2 (FIX-001)

A revisão da rodada 1 encontrou quatro blockers, todos corrigidos: (1) a
sidebar (`AppShell.tsx`) não passava `signature="check"` para `Brand`, então
o check nunca animava apesar do que a tabela acima e D-087 §3 afirmavam;
(2) `avenly-icon.svg` tinha geometria divergente de `Marca.dc.html` (grade
64, traço full-bleed, saindo do canto arredondado), corrigido para grade
120 com `rect rx="27"` e o símbolo escalado a 80×80 centralizado; (3) no
celular, `.entry-main` e `.entry-panel`/`.entry-shell` usavam o mesmo
`--surface`, sem sobreposição, então o raio de 24px no topo não aparecia
contra o Petróleo — corrigido com `margin-top: -24px` e `z-index: 1` em
`.entry-main` abaixo de 768px, zerado nos três limiares de composição.

Execução final refeita sobre a árvore corrigida: `npm test` (`apps/frontend`)
**99**/**99** arquivos e **1030**/**1030** testes, exit 0 — sem mudança de
contagem (os três blockers não tocam nenhum arquivo de teste). `npm run
lint` e `npm run typecheck` exit 0. `node scripts/validate-core.mjs`:
**17** passos, **15** `passed`, **0** `failed`, **2** `skipped`, exit 0.
`node scripts/validate-ui.mjs`: `expected` **169**, `skipped` **21**,
`unexpected` **0**, `flaky` **0** — sem mudança.
`BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" npm run validate:integration`,
contra o PostgreSQL 18 descartável já provisionado na estação: **35**/**35**
passos, exit 0; dentro dela, o gate autenticado
(`rehearse:goal033-authenticated-ui`) mediu `expected` **154**, `skipped`
**0**, `unexpected` **0**, `flaky` **1** (`onboarding-quando-importar` em
`notebook-1024`, `net::ERR_NO_BUFFER_SPACE`, recuperado na primeira
retentativa — falha de rede transitória do Windows, sem relação com o
diff desta rodada; **155** cenários no total, igual à baseline).

Os sete controles negativos do §6 foram re-executados sobre a árvore
corrigida, com os mesmos hashes e as mesmas falhas da execução anterior
(nenhum dos três arquivos que eles tocam — `Brand.tsx`, `layout.tsx`,
`AuthScreen.tsx` — foi alterado pelos três blockers desta rodada). Detalhe
completo, hashes e saída real em
[FINAL_AUDIT §48 — Rodada 2](FINAL_AUDIT.md); nota de correção em
[D-087](DECISIONS.md) e em
[CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal068-2026-09-29-d-087-proposed).
A conferência humana do §8 do Goal continua **não feita**.

### Correção — rodada 3 (FIX-001)

A revisão da rodada 2 encontrou três blockers, todos corrigidos: (1)
`tests/goal068-assinatura.test.tsx` reprovava `npx eslint … --max-warnings=0`
por ordem de import (`simple-import-sort/imports`) — reordenado; (2) o
describe `AppShell — a sidebar de verdade…` só afirmava a primeira
montagem; faltavam a segunda montagem de `AppShell` na mesma sessão não
animando a sidebar de novo, e o `Brand` do cabeçalho do celular nunca
recebendo `brand-mark--check` (a sidebar consome a chave de sessão
primeiro) — os dois testes foram acrescentados; (3) este adendo, que
faltava desde a rodada 2. Nenhum arquivo de produto foi tocado.

`npx vitest run tests/goal068-assinatura.test.tsx`: **14**/**14** testes,
exit 0. `npx eslint tests/goal068-assinatura.test.tsx --max-warnings=0`:
exit 0. `npx vitest run` (suíte completa): **99**/**99** arquivos e
**1033**/**1033** testes, exit 0 — os registros anteriores diziam **1030**,
já errado desde a rodada 2 (o describe `AppShell` não tinha entrado na
contagem). `npx eslint src tests --max-warnings=0`: exit 0 — os registros
anteriores diziam "lint exit 0", falso na árvore desta rodada até a
correção do item (1). `npx tsc --noEmit`: exit 0, sem mudança.
`validate:core`, `validate:ui` e `validate:integration` (gate autenticado
incluso, `expected` **154**, `flaky` **1**) não foram reexecutados: nenhum
arquivo que eles medem foi tocado, só um teste jsdom fora de `e2e/`. Detalhe
completo em [FINAL_AUDIT §48 — Rodada 3](FINAL_AUDIT.md).

**Rodada 4 (FIX-001).** A revisão da rodada 3 encontrou três blockers: (1)
`AppShell.tsx:273` (cabeçalho móvel) ainda tinha `signature="check"`,
contradizendo o §2 — corrigido para `<Brand />`; (2) faltava o controle
negativo da sidebar (`AppShell.tsx:155`) e a re-execução real dos sete
controles do §6 depois da última edição — ambos rodados nesta rodada, com
hash antes/durante/depois e saída real colada em
[FINAL_AUDIT §48 — Rodada 4](FINAL_AUDIT.md); (3) a execução final completa,
na ordem do §7, contra um PostgreSQL 18 descartável em loopback provisionado
e apagado nesta rodada. Resultado: `npx vitest run` **99**/**99** arquivos e
**1033**/**1033** testes, exit 0; `npx eslint src tests --max-warnings=0` e
`npx tsc --noEmit` exit 0; `validate:core` **17** passos, **15** `passed`,
**0** `failed`, **2** `skipped`, exit 0; `validate:ui` `expected` **169**,
`skipped` **21**, `unexpected` **0**, `flaky` **0**, exit 0;
`validate:integration` **35**/**35** passos, exit 0, com o gate autenticado
em `startTime` **2026-09-29T06:18:27.839Z**, `expected` **155**, `skipped`
**0**, `unexpected` **0**, `flaky` **0** — **0** retentativas, substituindo o
`flaky` **1** que a rodada 3 tinha deixado sem reconfirmar.

## A Home ganha uma faixa de estado só, os três números reais de "Esta semana" e o sino, do Goal074

`apps/ai-orchestrator/` ganha o registro durável de tomada de controle humano e os dois números novos da semana; `apps/scheduling-service/` ganha o terceiro; `packages/public-api-contract/` e `apps/bff/` repassam os três, aditivos; `apps/frontend/` reorganiza a Home numa faixa de estado só, na ordem do protótipo, com o sino. Nenhum campo público existente muda ou sai; nenhuma migration no BFF nem no Scheduling.

| O que decide agora | O que não decide |
| --- | --- |
| `HumanTakeover` (migration aditiva, `apps/ai-orchestrator/prisma/`) grava uma linha por passagem real de "IA atende" para "humano atende", na própria transação de `assumeHumanControl`, só para `WHATSAPP`/`ATENDLY`; `BACKFILL` nunca grava | Tomadas anteriores à migration não existem em registro nenhum; `releaseToAi` não apaga linha, e assumir/devolver/assumir de novo grava duas |
| `startOfWeekInTimeZone` (`apps/ai-orchestrator/src/lib/dates.ts`) e a mesma `countConfirmedAppointments` de `aiAppointmentsToday`, aplicada à janela da semana, produzem `aiAppointmentsThisWeek`; `conversationsTakenOverThisWeek` conta conversas distintas com tomada desde segunda | `aiAppointmentsToday` não muda de valor; `prepare`, hold vencido, remarcação e cancelamento continuam sem contar (H-09) |
| `appointmentsThisWeek` (`apps/scheduling-service/src/modules/internal-api/routes.ts`) lê segunda a domingo da semana local do calendário, inclusive dias já passados | `appointmentsToday`, `todayAppointments` e `nextAppointment` não mudam de valor |
| Os três campos são aditivos em `dashboardSchema` e nos clientes do BFF; dependência indisponível mostra "—", nunca 0 | Nenhum campo público existente muda ou sai |
| `OperationalBand` resolve uma faixa de estado só, por gravidade, nunca duas ao mesmo tempo (H-01); ordem faixa → "Precisa da sua atenção" → "Hoje" → "Esta semana" (H-06); saem "Próximo atendimento", "O que a Avenly fez hoje", receita estimada e "Ações rápidas"; nenhuma copy técnica (H-08) nem data ISO (H-10) | Fidelidade visual aos protótipos aprovados; hora da pausa da IA e bloqueios pessoais em "Hoje", que pedem dado novo |
| `HomeBell` no cabeçalho, em todas as larguras, link para `/notificacoes`, ponto só com `unreadCount` maior que zero (H-07) | O sino não abre gaveta — isso é NT-01, do Goal069; o item "Notificações" da sidebar e do "Mais" continua |

**Oito controles negativos, aplicados e revertidos, depois da última edição de código**, saída colada em [FINAL_AUDIT §49](FINAL_AUDIT.md): (1) a janela da semana do orquestrador começa em hoje, não em segunda: reprova **2** de **6** testes de `goal074-dashboard-week.routes.test.ts`. (2) a contagem da semana passa a contar `prepare`: reprova **1** de **6** do mesmo arquivo. (3) `assumeHumanControl` grava a linha sem conferir a passagem: reprova **1** de **5** testes de `goal074-human-takeover.test.ts`, contra PostgreSQL real. (4) a leitura do Scheduling volta a começar em hoje: reprova **3** de **6** testes de `goal074-dashboard-week.test.ts` (scheduling-service). (5) o schema do cliente do BFF perde `aiAppointmentsThisWeek`: reprova o único teste de `goal074-dashboard-week.test.ts` (bff). (6) a Home volta a renderizar `StatusStrip`: reprova **1** de **6** testes de `goal074-home.test.tsx`. (7) o ponto do sino aparece com zero não lidas: reprova **1** de **6** do mesmo arquivo. (8) a Home volta a mostrar `nextAppointment.date` cru: reprova **1** de **6** do mesmo arquivo. Cada arquivo tocado foi salvo antes da mutação e restaurado logo depois (`sha256sum` conferido idêntico ao original); revertidos os oito, as cinco suítes voltam a **6**/**6**, **5**/**5**, **6**/**6**, **1**/**1** e **6**/**6**.

**Execução final desta unidade (WU-16), sobre a árvore final, depois da última edição de código (das unidades WU-01 a WU-04) e antes dos controles acima:** `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0, com `test:ai-orchestrator` **87**/**100** arquivos (**13** pulados) e **1133**/**1226** testes (**93** pulados), `test:scheduling-service` **36**/**36** arquivos e **490** testes, `test:frontend` **100**/**100** arquivos e **1039** testes, `test:gate-scripts` **233**/**233**. `npm run validate:ui` — **169** testes passando, **21** pulados, **0** retentativas, exit 0. `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" npm run validate:integration`, contra um PostgreSQL 18 descartável em loopback — **36**/**36** passos, **0** `failed`, exit 0 (**36**, não **35**: o passo novo é `rehearse:goal074-human-takeover-migration`); dentro dele, `test:bff-integration` em **57** arquivos e **440** testes (baseline **56**/**439**), `test:scheduling-integration` em **17** arquivos e **140** testes (sem mudança), `test:ai-orchestrator-transport-durability` em **10** arquivos e **74** testes (inclui `goal074-human-takeover.test.ts`, **5** testes, contra `AI_TEST_DATABASE_URL` derivado) e `rehearse:goal033-authenticated-ui` (gate autenticado) em `expected` **154**, `skipped` **0**, `unexpected` **0**, `flaky` **1** (`notebook-1024 › onboarding-horarios › measured, logged in`, recuperado na primeira retentativa, sem relação com este diff — `onboarding-horarios` não é tocado por nenhum arquivo do Goal074) — **155** cenários no total, igual à baseline.

**Correção incidental, fora do escopo do Goal074, necessária para `validate:core` fechar verde.** `scripts/tests/validate-integration.test.mjs` fixava a lista exata dos passos de `validate:integration` e não tinha sido atualizada para o passo `rehearse:goal074-human-takeover-migration`, já presente em `scripts/validate-integration.mjs` antes desta unidade começar — sincronizado por acréscimo de uma linha, sem relaxar regra de gate nenhuma. `node --test scripts/tests/validate-integration.test.mjs`: **28**/**28** testes, exit 0.

**Conferência humana pendente.** A conferência do §10 do Goal **não foi feita** por este Goal: que a Home, num aparelho real nas cinco larguras e nos estados da faixa, bate com `Home.dc.html`, `Home-Tablet.dc.html` e `Home-Desktop.dc.html`; e que os três números da semana fazem sentido para quem usa.

**O que esta seção não prova.** Não prova fidelidade visual da Home aos protótipos aprovados, nem das telas de módulo e da central de notificações (Goal069) ou do onboarding (Goal072). Não prova tomadas de controle humano anteriores à migration, que não existem em registro nenhum.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal074-2026-09-29-d-088-proposed),
[FINAL_AUDIT §49](FINAL_AUDIT.md) e [D-088](DECISIONS.md).

### Correção — rodada 2 (FIX-001)

A revisão da rodada 1 encontrou seis blockers, todos corrigidos: (1)
`resolveOperationalState` (`DashboardScreen.tsx`) mapeava todo `aiView`
diferente de `"off"` para o título "IA ativa", inclusive `pending`,
`unknown` e `loading` — a faixa contradizia o checklist "Ative sua IA" e o
`StatusPoint` ("IA em ativação"); ganhou três ramos novos, um por `aiView`,
antes do ramo `"off"` (H-02 continua fechado). (2) a seção "Precisa da sua
atenção" aparecia sempre, com "Nenhuma"/"Nenhuma conversa pendente" mesmo
sem pendência, contra o Objetivo item 2 do Goal ("só quando há pendência");
passou a renderizar só com `attentionCount > 0`. (3a) o estado vazio de
"Hoje" dizia "Ainda não há agendamentos hoje", sem ação; passou a "Nenhum
atendimento hoje." com o link "Novo agendamento" (`/agenda/novo`, como
`AgendaBoard.tsx`). (3b) o marcador "agora" em `AgendaToday` comparava só
`startTime > nowLabel`, então um atendimento em curso nunca o recebia;
passou a comparar `endTime > nowLabel`, marcando o atendimento em curso ou
o próximo. (4) `appointmentsThisWeek` (Scheduling) contava tudo que
`listAppointments` devolvia por sobreposição de instante, então um
agendamento de domingo anterior que cruza a meia-noite para a segunda desta
semana entrava na contagem; ganhou filtro adicional por `date` dentro de
`[weekStart, weekEnd]`. (5) o desvio de escopo do §11 do Goal (toque em
`scripts/`) não estava declarado; registrado agora em
[D-088](DECISIONS.md) ("Desvio declarado do §11") e referenciado em
[FINAL_AUDIT §49](FINAL_AUDIT.md). (6) a evidência documentada citava o gate
autenticado da execução WU-16 com `flaky` **1** (`onboarding-horarios`);
como os itens (1) a (4) mudam código, a execução final foi refeita por
inteiro nesta rodada, substituindo aquela evidência por uma nova, com **0**
retentativas.

Execução final desta rodada, sobre a árvore corrigida: `npm run lint` e
`npx tsc --noEmit` de `apps/ai-orchestrator`, `apps/scheduling-service`,
`apps/bff` e `apps/frontend`, exit 0 nos oito. `npx vitest run`
(`apps/frontend`, suíte completa): **100**/**100** arquivos e
**1040**/**1040** testes, exit 0 (baseline WU-16: **100**/**1039**; a
diferença é o teste novo de "com pendência" em `goal074-home.test.tsx`).
`npx vitest run tests/unit` (`apps/scheduling-service`, suíte completa):
**36**/**36** arquivos e **491**/**491** testes, exit 0 (baseline WU-16:
**36**/**490**; a diferença é o teste novo de agendamento que cruza
meia-noite em `goal074-dashboard-week.test.ts`). `npm run validate:core`:
**17** passos, **15** `passed`, **0** `failed`, **2** `skipped`
(`test:bff`, `test:health-worker`), exit 0, com `test:ai-orchestrator`
**87**/**100** arquivos (**13** pulados) e **1133**/**1226** testes
(**93** pulados, sem mudança — este Goal não toca o orquestrador nesta
rodada), `test:scheduling-service` **36**/**36** arquivos e **491** testes,
`test:frontend` **100**/**100** arquivos e **1040** testes,
`test:gate-scripts` **233**/**233**. `npm run validate:ui`: **169**
testes passando, **21** pulados, **0** `unexpected`, **0** `flaky`, **0**
retentativas, exit 0 — sem mudança (rotas públicas só, nenhuma tocada por
esta rodada). `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test"
npm run validate:integration`, contra o PostgreSQL 18 descartável já
provisionado na estação: **36**/**36** passos, **0** `failed`, exit 0;
dentro dele, `test:bff-integration` **57**/**57** arquivos e **440**
testes (sem mudança), `test:scheduling-integration` **17**/**17** arquivos
e **140** testes (sem mudança), `test:ai-orchestrator-transport-durability`
**10**/**10** arquivos e **74** testes (sem mudança, inclui
`goal074-human-takeover.test.ts`), `rehearse:goal074-human-takeover-migration`
PASSED, e `rehearse:goal033-authenticated-ui` (gate autenticado) em
`"155 passed (4.7m)"` e `"authenticated gate retries: 0 — every test
passed on its first attempt"` — **155** cenários no total, igual à
baseline, **substituindo o `flaky` 1** que a execução WU-16 tinha deixado
registrado.

**Quatro dos oito controles negativos do §8 foram re-executados**, porque
tocam os dois arquivos que esta rodada mudou (`DashboardScreen.tsx` e
`apps/scheduling-service/.../routes.ts`); os outros quatro (1, 2, 3 e 5,
que tocam `apps/ai-orchestrator/.../routes.ts`, `SessionService.ts` e
`apps/bff/.../ai-orchestrator/index.ts`) não foram tocados por esta rodada
e não foram reexecutados. `sha256sum` de cada arquivo-alvo conferido igual
ao registrado por WU-16 antes da mutação, e idêntico a ele depois da
restauração:

- **Controle 4** (`weekStart` volta a começar em hoje, não em segunda,
  `apps/scheduling-service/.../routes.ts`; hash antes/depois
  `0828d4438622829e6228922df2e42f3cbda6b0fe65515f26d16b9994a87714c7`):
  `npx vitest run tests/unit/goal074-dashboard-week.test.ts` — exit 1,
  `Tests 3 failed | 4 passed (7)`.
- **Controle 6** (`DashboardScreen.tsx` volta a renderizar `StatusStrip`;
  hash antes/depois
  `dfb49cdb86185e3c0de6a4a9ccda4ed11b20f05530b1447411af40d9b8402385`):
  `npx vitest run tests/goal074-home.test.tsx` — exit 1,
  `Tests 1 failed | 6 passed (7)`.
- **Controle 7** (o ponto do sino aparece com zero não lidas; mesmo
  arquivo, mesmo hash): `npx vitest run tests/goal074-home.test.tsx` —
  exit 1, `Tests 1 failed | 6 passed (7)`.
- **Controle 8** (a Home volta a mostrar `nextAppointment.date` cru; mesmo
  arquivo, mesmo hash): `npx vitest run tests/goal074-home.test.tsx` —
  exit 1, `Tests 2 failed | 5 passed (7)` — o teste novo de "com pendência"
  também reprova com este defeito.

Revertidos os quatro, `tests/unit/goal074-dashboard-week.test.ts` volta a
**7**/**7** e `tests/goal074-home.test.tsx` volta a **7**/**7**; `npx vitest
run` completo de `apps/frontend` e de `apps/scheduling-service` confirmado
de novo em **1040**/**1040** e **491**/**491**, respectivamente, depois da
última restauração.

Detalhe completo em [FINAL_AUDIT §49 — Correção, rodada 2](FINAL_AUDIT.md);
o desvio do §11 em [D-088](DECISIONS.md).

A conferência humana do §10 do Goal continua **não feita**.

### Correção — rodada 3 (blockers da revisão da rodada 3, entregues na rodada 4, FIX-001)

A revisão da rodada 3 encontrou três blockers: faltavam os testes dos
estados da faixa com a IA não ativa, o teste do marcador "agora" entre dois
atendimentos e esta documentação. As contagens da rodada 2 acima
(`test:frontend` **1040**, `goal074-home.test.tsx` **7**/**7**, controles 6
a 8 com "(7)") ficam substituídas pelas desta subseção.

- **Código.** Em `resolveOperationalState` (`DashboardScreen.tsx`), a
  faixa "IA em ativação" só diz "Conclua os passos abaixo…" com o checklist
  visível; com os quatro passos concluídos, diz "Os passos estão
  concluídos; falta a IA confirmar a ativação.". [D-088](DECISIONS.md)
  item 8 lista a ordem real da faixa, com "IA inativa" (`OFF`, checklist
  incompleto) e "IA pausada" (`OFF`, checklist completo, inferida porque
  não existe dado de pausa).
- **Testes novos em `goal074-home.test.tsx` (7 → 14).** Cinco nesta
  rodada: `PENDING` com checklist incompleto, `PENDING` com checklist
  completo, `OFF` com checklist incompleto e `UNKNOWN`, todos com WhatsApp
  `CONNECTED`, "IA ativa" ausente e uma só `#operational-status` com o
  título esperado; e o marcador "agora" às 10:45 (`America/Sao_Paulo`)
  entre 10:00–10:30 e 11:00–11:30, com ordem `[primeiro, "agora",
  segundo]` e um só `.agenda-now-marker`. Os outros dois são da rodada 3
  (vazio e atendimento em curso).

Execução final da rodada 4, sobre a árvore final, depois da última edição
de código: `npm run lint` de `apps/frontend`, exit 0. `npm run
validate:core`: **17** passos, **15** `passed`, **0** `failed`, **2**
`skipped` (`test:bff`, `test:health-worker`), exit 0, com
`test:ai-orchestrator` **87**/**100** arquivos (**13** pulados) e
**1133**/**1226** testes (**93** pulados), `test:scheduling-service`
**36**/**36** e **491** testes, `test:frontend` **100**/**100** e **1048**
testes (rodada 2: **1040**; **+5** desta rodada, **+3** da rodada 3),
`test:gate-scripts` **233**/**233**. `npm run test:gate`: **233**/**233**,
exit 0. `npm run validate:ui`: `169 passed`, **21** pulados, **0**
retentativas, exit 0.
`BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test"
npm run validate:integration`: **36**/**36** passos, **0** `failed`, exit 0;
`test:bff-integration` **57**/**440**, `test:scheduling-integration`
**17**/**140**, `test:ai-orchestrator-transport-durability` **10**/**74**,
`test:ai-orchestrator-content-purge` **3**/**19**, e o gate autenticado
(`rehearse:goal033-authenticated-ui`) em `155 passed (4.7m)` e
`authenticated gate retries: 0 — every test passed on its first attempt`
— **155**/**0** retentativas.

**Os oito controles negativos do §8 foram rodados de novo, todos**, depois
dessa execução, com `sha256sum` idêntico antes e depois de cada um e `git
status --porcelain=v1 -uall` idêntico antes e depois dos oito: (1) semana
do orquestrador começando hoje — `Tests 2 failed | 4 passed (6)`; (2)
`prepare` contado — `Tests 1 failed | 5 passed (6)`; (3)
`assumeHumanControl` sem conferir a passagem, contra PostgreSQL —
`Tests 1 failed | 4 passed (5)`; (4) Scheduling começando hoje —
`Tests 3 failed | 4 passed (7)`; (5) BFF sem `aiAppointmentsThisWeek` —
`Tests 1 failed (1)`; (6) `StatusStrip` de volta — `Tests 1 failed | 13
passed (14)`; (7) ponto do sino com zero não lidas — `Tests 1 failed | 13
passed (14)`; (8) `nextAppointment.date` cru — `Tests 2 failed | 12 passed
(14)`. Todos exit 1. Hashes e saída em
[FINAL_AUDIT §49 — Correção, rodada 3](FINAL_AUDIT.md).

A conferência humana do §10 do Goal continua **não feita**.

## Doze achados de fidelidade visual da Agenda (AG-01…AG-12) e as observações 2 e 4 do review073, do Goal069

`apps/frontend/` ganha uma barra superior única na Agenda, com "+ Novo" nos três tipos, a faixa da semana com pontos e duas colunas no Dia a partir de 1024px; nenhum contrato, rota, schema do BFF ou migration muda. `e2e/routes.ts` fica na baseline.

| O que decide agora | O que não decide |
| --- | --- |
| `AgendaNewMenu` (`AgendaBoard.tsx`) abre Agendamento, Compromisso pessoal e Bloqueio, cada um só com a capacidade que já o regia; sem nenhuma, o botão não existe | O contrato de `POST /v1/time-blocks`, que já aceitava os dois tipos |
| `WeekStrip` (`DayView.tsx`) marca ponto pelos dias em `datesWithActiveAppointment` (só `kind: "appointment"` com status ativo) | Dias ocultos pela preferência (D-086), que continuam fora da faixa |
| `goToAdjacent` (`AgendaBoard.tsx`) soma ou subtrai sete dias a `startOfWeek(cursor)`; `changeView` abre o Mês pelo `cursor` porque `goToAdjacent` o ancora na segunda-feira da semana mostrada | Nenhum estado de "dia focado" separado do `cursor` foi criado |
| `WeekEntryBar` (`WeekView.tsx`) leva nome e serviço no texto e no nome acessível, prefixado pelo tipo (`${typeLabel}: `) | A cor e a posição do bloco na grade |
| `nextActiveAppointment` (`occupancy.ts`), lido numa janela própria de hoje até 60 dias à frente | A data navegada (`view`/`cursor`), que não influencia mais "Próximo agendamento" |
| `actorLabel` (`AppointmentHistory.tsx`) só resolve nome quando `actor === session.user.id` | Qualquer outro `actor` — a linha "Por…" some, nunca mostra o identificador |
| `canComplete`/`canMarkNoShow` (`LifecycleActions.tsx`) exigem `appointmentHasStarted`, além do status | Cancelar e remarcar, que não mudam |
| `toggleHiddenDay` (`CalendarSettings.tsx`) recusa o sétimo dia oculto; o motivo aparece no controle desabilitado e na recusa do servidor | O limite do servidor (`agendaHiddenWeekdaysSchema`, BFF), que já recusava — só a tela ganhou o mesmo motivo |
| `ensureAgendaOnMeasuredDate` navega até a data semeada em qualquer visualização (dia, semana ou mês) | O restante de `authenticated-matrix.spec.ts`, que não muda |

**Divergência declarada:** `DayDetailPanel` reaproveita `LifecycleActions` e `AppointmentHistory`, mas não embute o componente `AppointmentDetail` inteiro. Detalhe em [D-089](DECISIONS.md).

**Vermelho da baseline dos testes reescritos do §6.6 e do §6.5**, rodado na rodada 6 com `AgendaBoard.tsx`, `WeekView.tsx` e `DayView.tsx` servidos do blob de `37c7371` por um plugin Vite de uma configuração do Vitest fora do repositório, sem sobrescrever a árvore: §6.6 "'Próxima semana' e depois Mês" — exit 1, `Tests 1 failed | 7 skipped (8)`, o Mês abre em outubro; §6.5 nome e serviço — exit 1, `Tests 1 failed | 7 skipped (8)`, nome acessível `Atendimento: Ana Paula, Confirmado`; §6.5 "Almoço" — exit 0 contra a baseline, porque o `WeekEntryBar` de `37c7371` já prefixava o tipo; o defeito só existiu no `WeekView.tsx` da rodada 1, e contra ele o teste reprova (exit 1, `Unable to find a label with the text of: /^Bloqueio: /`). Saída e hashes em [FINAL_AUDIT §50](FINAL_AUDIT.md).

**Oito controles negativos do §7, aplicados e revertidos** contra a árvore vigente, saída colada em [FINAL_AUDIT §50](FINAL_AUDIT.md): (1) `/agenda` volta a renderizar `SourceStrip`: reprova **1** de **11** testes de `goal069-agenda-structure.test.tsx`. (2) o menu "+ Novo" perde "Compromisso pessoal": reprova **2** de **11** do mesmo arquivo. (3) o ponto da faixa aparece em dia sem agendamento: reprova o teste isolado de `goal069-agenda-views.test.tsx` (§6.3). (4) `goToAdjacent` volta a usar o `cursor` sem ajuste (`addDays(cursor, direction * 7)`): reprova o teste isolado `-t "Próxima semana"` de `goal069-agenda-views.test.tsx` (§6.6). (5) "Próximo agendamento" volta a sair da janela navegada: reprova o teste isolado de `goal069-agenda-views.test.tsx` (§6.7). (6) o histórico volta a imprimir `event.actor`: reprova **3** de **6** testes de `goal069-appointment-detail.test.tsx` (§6.8). (7) `canComplete` volta a olhar só o status: reprova **1** de **6** do mesmo arquivo (§6.9). (8) `toggleHiddenDay` volta a aceitar o sétimo dia: reprova **2** de **5** testes de `goal069-hidden-days-limit.test.tsx`. Cada arquivo-alvo foi conferido por `git hash-object` antes da mutação e restaurado idêntico logo depois (`AgendaBoard.tsx`: `43b4d65c6dc50b22fc1da66bd850733fbd0ddd62`); revertidos os oito, as quatro suítes `goal069-*.test.tsx` passam com **30**/**30**.

**Execução final, rodada 2, sobre o código vigente** (nenhuma rodada posterior mudou código de produto): `node --test scripts/tests/**/*.test.mjs` (`test:gate`) — **233**/**233**, exit 0. `npx vitest run` (`apps/frontend`, suíte completa) — **104**/**104** arquivos, **1079**/**1079** testes, exit 0 (baseline **100**/**1048**). `npm run typecheck` e `npm run lint` (`apps/frontend`, `src tests`) exit 0 nos dois. `node scripts/validate-core.mjs`: **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0. `node scripts/validate-ui.mjs`: **169** `passed`, **21** `skipped`, **0** `unexpected`, **0** retentativas, exit 0. `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" npm run validate:integration`, contra o PostgreSQL 18 descartável da estação: **36**/**36** passos, exit 0; dentro dela, `rehearse:goal033-authenticated-ui` (o gate autenticado que mede `/agenda` e `/configuracoes/agenda`) — **155** `passed`, **0** `failed`, **0** retentativas, exit 0, mesma contagem da baseline WU-12.

**Rodadas de correção.** Rodada 2: `e2e/routes.ts` volta à baseline; o `<h1>` "Agenda" troca `sr-only` (cujo `clip`/`clip-path` tira a caixa do hit-test do gate autenticado) por `.agenda-page-title`; AG-05 passa a ser corrigido em `goToAdjacent`; o bloco da Semana recupera o prefixo do tipo no nome acessível, com o teste de regressão "Almoço". Rodada 3: os oito controles são refeitos contra `AgendaBoard.tsx` depois das edições da rodada 2. Rodada 4: o controle 4 passa a mutar `goToAdjacent`. Rodada 5: sem mudança de código. Rodada 6: esta seção é reescrita no estado vigente e ganha o vermelho da baseline.

**Conferência humana pendente.** A conferência do §9 do Goal **não foi feita** por este Goal: que a Agenda, num aparelho real nas cinco larguras, em Dia, Semana e Mês, com e sem agendamento, bate com `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`; e que a marca no trilho, o segmentado numa linha e o bloco da Semana legível batem com o protótipo.

**O que esta seção não prova.** Não prova fidelidade visual da Agenda aos protótipos aprovados, nem das telas de módulo e da central de notificações (Goal075) ou do onboarding (Goal072). `validate:integration` e o gate autenticado são a execução declarada pelo Developer contra o PostgreSQL descartável da estação.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal069-2026-09-29-d-089-accepted),
[FINAL_AUDIT §50](FINAL_AUDIT.md) e [D-089](DECISIONS.md), **ACCEPTED** no
[review069](reviews/069-review.md) (rodada 6 do IA Loop, sem blocker; os
gates da rodada 6 passaram, inclusive `validate:integration` no próprio IA
Loop).

## Próximo e último atendimento na lista, perfil de Clientes em três abas e o filtro `customerId` de conversa, do Goal075

`apps/scheduling-service/` calcula próximo e último atendimento e os números do histórico no fuso do calendário; `packages/public-api-contract/` e `apps/bff/` declaram os campos novos como opcionais e repassam `customerId` de conversa ao `apps/ai-orchestrator/`; `apps/frontend/` mostra a lista e o perfil novos. Nenhuma migration, nenhuma rota nova. `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` ficam na baseline.

| O que decide agora | O que não decide |
| --- | --- |
| `nextAppointmentsByCustomer`/`lastAppointmentsByCustomer` (`avenly-customer-service.ts`): duas consultas `DISTINCT ON` por negócio, `tenantId` em toda consulta, hora local por `instantToLocalDateTime(…, settings.timezone)` | O fuso do processo do Scheduling, que não entra no cálculo |
| `GET /internal/customers/:id` devolve `nextAppointment`/`lastAppointment` pelas mesmas consultas com `[id]` (`appointmentHighlights`) e `appointmentStats` | A busca por telefone (`findCandidatesByPhone`), que mantém filtro e ordem |
| `customerSchema`/`customerDetailSchema` do contrato e do cliente do Scheduling no BFF: campos novos opcionais, checagem de campo não declarado (Goal036) dentro deles | Resposta anterior ao Goal075, que continua válida sem os campos |
| `GET /v1/conversations?customerId=` → orquestrador filtra `contact.customerId` no negócio da sessão | Os filtros de conversa que já existiam |
| `CustomerList.tsx`: "hoje" é a data no fuso de `calendar.getCalendar().timezone`, com `America/Sao_Paulo` quando o calendário não traz fuso ou não responde | O fuso do navegador, que não decide mais o texto da linha |
| `CustomerProfile.tsx`: "Conversa" só com conversa da pessoa; "Agendar" só com `createAppointments`; abas com `role="tablist"`, setas e `?aba=` | Regra de memória, nota, tag, resumo e responsável principal, que não muda |

**Divergências declaradas:** `firstAppointmentDate` conta agendamento de qualquer estado, inclusive cancelado e futuro; os testes de integração §6.1 e §6.2 do Scheduling usam o relógio real; o controle 3 muta o orquestrador. Detalhe em [D-090](DECISIONS.md).

**Vermelho da baseline `6787755` dos testes novos**, rodado na rodada 2 com os 18 arquivos de código do diff servidos de `git show 6787755:<arquivo>` e o `dist` do contrato trocado pelo build da baseline em `packages/public-api-contract`, `apps/bff/node_modules/…` e `apps/frontend/node_modules/…`, tudo restaurado e conferido por hash: Scheduling integração contra PostgreSQL — exit 1, `Tests 3 failed (3)`; Scheduling unidade — exit 1, `Tests 9 failed | 2 passed (11)`; BFF §6.4 — exit 1, `Tests 8 failed (8)`; orquestrador §6.5 — exit 1, `Tests 1 failed | 2 passed (3)`; frontend §6.6 a §6.11 e os testes dos blockers 1 e 2 — exit 1, `Tests 20 failed | 1 passed (21)`. Os que passam contra a baseline são guardas de comportamento que não muda (lista sem fuso, conversa de outro negócio, conversa sem filtro, axe). Saída em [FINAL_AUDIT §51](FINAL_AUDIT.md).

**Sete controles negativos do §7, aplicados e revertidos** depois da execução final, saída colada em [FINAL_AUDIT §51](FINAL_AUDIT.md): (1) `lastAppointment` aceita cancelado: reprova **2** de **3** do teste de integração do Scheduling (§6.1 e, pelo detalhe, §6.2). (2) a lista usa o fuso do servidor: reprova o §6.3. (3) o orquestrador deixa de filtrar por `customerId`: reprova **1** de **3** do §6.5. (4) a linha volta a só nome e telefone: reprova **4** de **6** de `goal075-customer-list.test.tsx`. (5) "Conversa" aparece sem conversa: reprova "sem conversa da pessoa". (6) `AppointmentForm` ignora `customerId`: reprova o §6.9. (7) a faixa "Gerenciado pela Agenda Avenly" volta: reprova "nenhuma das copies proibidas aparece no perfil". Cada um passa sem o defeito, e cada arquivo-alvo volta ao mesmo `git hash-object`.

**Execução final, rodada 2, depois da última edição de código:** `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0; dentro dele `test:frontend` **106**/**106** arquivos e **1100**/**1100** testes (baseline **104**/**1079**), `test:scheduling-service` **37**/**502** (baseline **36**/**491**), `test:ai-orchestrator` **1136** `passed` e **93** pulados de **1229** (baseline **1133**/**1226**), `audit:static` **34** verificações com **1** pulada (`production_health`). `npx tsc --noEmit` em `apps/frontend`, `apps/bff` e `apps/scheduling-service` e `npm run lint` em `apps/frontend`, exit 0. `npm run test:gate` — **233**/**233**, exit 0. `npm run validate:ui` — **169** `passed`, **21** `skipped`, **0** retentativas, exit 0. `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test npm run validate:integration` — **36**/**36** passos, exit 0; `test:bff-integration` **58**/**448** (baseline **57**/**440**), `test:scheduling-integration` **18**/**143**; gate autenticado (`rehearse:goal033-authenticated-ui`) **155** `passed`, **0** retentativas, com `/clientes` medida nas cinco larguras e o perfil aberto pela linha semeada.

**Rodadas de correção.** Rodada 2: blockers 1 a 4 do review da rodada 1 — o detalhe do cliente devolve próximo e último; a lista calcula "hoje" no fuso do negócio e diz "há 1 mês"; o vermelho da baseline, a execução final e os sete controles refeitos; D-090, FINAL_AUDIT §51, CURRENT_STATE e esta seção escritos.

**Conferência humana pendente.** A conferência do §9 do Goal **não foi feita** por este Goal: que a lista e o perfil, num aparelho real nas cinco larguras, com cliente com e sem atendimento, batem com `Clientes.dc.html`, `Clientes-Tablet.dc.html` e `Clientes-Desktop.dc.html`; que o texto de próximo e último cabe na linha em 360 e 390px sem esconder o nome; e que "Conversa" e "Agendar" levam ao lugar certo com dados reais.

**O que esta seção não prova.** Não prova fidelidade visual de Clientes aos protótipos aprovados, nem de Serviços (Goal076), de Conversas e da central de notificações (Goal077) ou do onboarding (Goal072). `validate:integration` e o gate autenticado são a execução declarada pelo Developer contra o PostgreSQL descartável da estação.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal075-2026-09-29-d-090-accepted),
[FINAL_AUDIT §51](FINAL_AUDIT.md) e [D-090](DECISIONS.md), **ACCEPTED** no
[review075](reviews/075-review.md) (rodada 2 do IA Loop, sem blocker; os
gates da rodada 2 passaram, inclusive `validate:integration` no próprio IA
Loop).

## Fidelidade visual de Serviços: três grupos, linha "duração · preço", filete, − e + na duração e a frase "A IA responde", do Goal076

`apps/frontend/` troca a grade de tabela de Serviços por três grupos (Precisa de revisão, Ativos, Inativos), com a linha "duração · preço", o filete na cor de `colorToken`, "Corrigir" nas pendências e ativar/desativar na própria linha; o formulário ganha − e + de 5 minutos, atalhos 30/60/90 e a frase "A IA responde", prévia rotulada como tal. Nenhum contrato, rota ou migration muda. `e2e/routes.ts` fica na baseline.

| O que decide agora | O que não decide |
| --- | --- |
| `groups` (`ServiceList.tsx`, `useMemo`): `needsReview` sempre em "Precisa de revisão"; ativos fora de revisão em ordem pt-BR; inativos fora de revisão sob separador | O filtro Todos/Ativos/Inativos, que saiu — os grupos o substituem |
| `formatServiceLine`/`formatServiceDuration`/`formatServicePrice` (`serviceFormatting.ts`): a linha "duração · preço", com recorrência e "a IA não oferece" no inativo | A origem "Agenda Avenly" por linha, que saiu |
| `.service-row-accent` (`avenly-services.css`): `background: var(--swatch, var(--border-strong))`, a mesma variável da prévia de cor do formulário | O texto da linha, que nunca depende da cor |
| `.service-row-link` com `aria-label` `Editar <nome>` cobre a linha inteira; "Corrigir <nome>" só nas pendências | Exclusão de serviço, que não existe |
| Ativar/desativar num botão em `.service-row-actions`, com o mesmo diálogo e o mesmo `PATCH /v1/services/:id` | O formulário de edição, que não ganhou essa ação |
| `incrementDuration`/`decrementDuration` (`ServiceForm.tsx`): passo de 5 minutos, "−" não desce de 5, "+" com campo vazio põe 5; atalhos 30/60/90 com `aria-pressed` | A validação do Goal058 (`min`/`step` do `input[name="duration"]`), que não muda |
| `formatServicePreview` (`serviceFormatting.ts`): a frase por tipo de preço, rotulada "Prévia · como a IA responde" | O texto que o modelo realmente vai gerar — a frase é só prévia do frontend |

**Divergência declarada:** a frase "A IA responde" não usa artigo diante do nome do serviço, porque o frontend não conhece o gênero do nome. Detalhe em [D-091](DECISIONS.md).

**`directory-row` só como marcador.** Todas as regras CSS de `.directory-row` saem de `avenly-services.css`; a classe continua no `<li className="directory-row service-row">` da linha só porque o seletor travado do gate autenticado a usa, sem nenhuma regra CSS em `apps/frontend/src`.

**Desvio declarado do §8 do Goal, autorizado pelo review076, rodada 1:** `e2e/authenticated-matrix.spec.ts` mudou, contra o "fica como está" do §8. Motivo: o serviço semeado de 60 min passa a aparecer como "1 h" na linha que o design exige. A única linha mudada é, em `saveDurationByForm`, `toContainText(\`${minutes} min\`)` → `toContainText(expectedDurationText(minutes))`, mais o helper `expectedDurationText`, que espelha `formatServiceDuration`. A asserção não foi afrouxada: a linha `.directory-row` do serviço semeado ainda tem de mostrar a duração salva.

**Vermelho da baseline `faa0943` dos dois testes novos**, rodado de novo na rodada 3 do IA Loop contra a árvore vigente, sem edição de código, com `ServiceList.tsx` e `ServiceForm.tsx` servidos de `git show faa0943:<arquivo>` e restaurados com `git hash-object` idêntico antes e depois (`ServiceList.tsx` `2a4a4f4a…`, `ServiceForm.tsx` `867d8a86…`, `serviceFormatting.ts` `aa4003ba…`): `npx vitest run tests/goal076-service-list.test.tsx tests/goal076-service-form.test.tsx` — exit 1, `Test Files 2 failed (2)`, `Tests 14 failed | 5 passed (19)`. Contra a árvore do Goal, os mesmos dois arquivos passam: `Tests 19 passed (19)`. Saída em [FINAL_AUDIT §52](FINAL_AUDIT.md).

**Seis controles negativos do §5, aplicados e revertidos** na rodada 3, depois da execução final da rodada 2 e sem edição de código entre as duas, saída colada em [FINAL_AUDIT §52](FINAL_AUDIT.md): (1) a origem "Agenda Avenly" de volta na linha: reprova o §4.1, `Tests 1 failed | 5 passed (6)`. (2) o pendente sem grupo próprio: reprova o §4.2, `Tests 1 failed | 5 passed (6)`. (3) o link sem `Editar <nome>`: reprova o teste de §4.3 com `editable` e o de §4.2, que lê os nomes dos links, `Tests 2 failed | 4 passed (6)`. (4) "+" somando 1 minuto: reprova o §4.5, `Tests 1 failed | 2 passed | 10 skipped (13)`. (5) `STARTING_AT` sem "a partir de": reprova dois casos do §4.6, `Tests 2 failed | 6 passed | 5 skipped (13)`. (6) `DirectorySourceStrip` de volta ao formulário: reprova os dois casos do §4.7, `Tests 2 failed | 11 skipped (13)`. Cada um passa sem o defeito, e os três arquivos-alvo voltam ao mesmo `git hash-object` depois de cada controle (`ServiceList.tsx` `2a4a4f4a562dcacc1c36fd3b847594813f0abc92`, `ServiceForm.tsx` `867d8a86fcf8db647af35d941f1c9608d305c2a1`, `serviceFormatting.ts` `aa4003ba1d464f855ddddaacada60bae298b385b`).

**Execução final, da rodada 2 do IA Loop, depois da última edição de código** (o FIX-001 da rodada 2 em `ServiceList.tsx`): `npm run validate:core` (WU-08) — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0. `npx tsc --noEmit` (WU-03) e `npm run lint` (WU-04) em `apps/frontend`, exit 0 nos dois. `npm run test:gate` (WU-09) — **233**/**233**, exit 0, mesma contagem da baseline. `npm run validate:ui` (WU-10) — `e2e-results/results.json` com `startTime` `2026-09-29T19:50:45Z`: **169** `passed`, **21** `skipped`, **0** `unexpected`, **0** retentativas, exit 0. `npm run validate:integration` (WU-11, contra o PostgreSQL descartável do IA Loop em `127.0.0.1:55500/ia_bff_test`) — **36**/**36** passos, exit 0; gate autenticado (`rehearse:goal033-authenticated-ui`) em `e2e-results/authenticated/results.json` com `startTime` `2026-09-29T19:53:55Z`: **155** `passed`, **0** `unexpected`, **0** retentativas, medindo `/servicos` nas cinco larguras — mesma contagem da baseline. Na rodada 3, contra a mesma árvore, `npx vitest run` (`apps/frontend`, a suíte de `test:frontend`) deu **108**/**108** arquivos e **1119**/**1119** testes (baseline **106**/**1100**, **+2** arquivos e **+19** testes) e `npm run test:gate` de novo **233**/**233**, exit 0 nos dois.

**Conferência humana pendente.** A conferência do §7 do Goal **não foi feita**: que a lista e o formulário, num aparelho real nas cinco larguras, com serviço pendente, ativo e inativo, batem com `Servicos.dc.html`, `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html`; que o filete e o âmbar leem bem e que "duração · preço" cabe na linha em 360 e 390px sem esconder o nome; e que a frase sem artigo é aceitável frente ao protótipo.

**O que esta seção não prova.** Não prova fidelidade visual de Serviços aos protótipos aprovados, nem que a IA usa "Instruções para a IA" (Goal078), nem de Conversas e da central de notificações (Goal077) ou do onboarding (Goal072). `validate:integration` e o gate autenticado são a execução da WU-11 da rodada 2 do IA Loop, contra o PostgreSQL descartável do IA Loop.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal076-2026-09-29-d-091-accepted),
[FINAL_AUDIT §52](FINAL_AUDIT.md) e [D-091](DECISIONS.md), **ACCEPTED** no
[review076](reviews/076-review.md) (rodada 3 do IA Loop, sem blocker; os
gates da rodada 3 passaram, inclusive `validate:integration` no próprio IA
Loop, com as mesmas contagens da execução final da rodada 2).

## Instrução privada por serviço: documento reservado, entrega ao modelo e conferência de posse no BFF, do Goal078

Não é medida visual. `apps/ai-orchestrator/` grava a instrução como
`KnowledgeDocument` `GUIDANCE` de `source` reservada
`service-instruction/<serviceId>`, sem migration, exclui essa `source` da
busca semântica e a entrega ao modelo em todo turno com o serviço em
foco, numa seção nova do prompt (`v9`). `apps/bff/` confere a posse do
serviço antes de chamar a IA. `apps/frontend/` ganha o campo no
formulário de Serviços. Nenhum contrato existente muda; um schema e duas
rotas novas (`GET`/`PUT /v1/services/:id/ai-instruction`) entram no
contrato público.

| O que decide agora | O que não decide |
| --- | --- |
| `KnowledgeDocumentService.saveServiceInstruction`/`getServiceInstruction`/`getServiceInstructions`: texto por `(tenantId, serviceId)`, 1–2000 caracteres, versão a cada mudança, remoção por texto vazio | Guarda determinística contra o modelo repetir a instrução — é regra ao modelo, não filtro de saída |
| `create`/`get`/`edit`/`deactivate`/`list` recusando ou omitindo a `source` reservada; `PGVectorKnowledgeStore.search` excluindo-a no `WHERE`, antes do `LIMIT` | O comportamento das rotas genéricas de conhecimento fora da reserva, e de `other-info` — nenhum dos dois muda |
| `loadServiceInstructions` (`message-graph.ts`), entre `loadCustomerMemory` e `agent`, nos dois caminhos do grafo: entrega por `focusServiceIds`, qualquer que seja a intenção | Serviço em foco inferido do texto livre da mensagem — fica de fora; primeiro turno sem foco não recebe instrução |
| A seção do prompt (`service-instructions.ts`), com as quatro regras fixas e uma linha por instrução; `PROMPT_TEMPLATE_VERSION` `v9` | O texto que o modelo realmente vai gerar a partir da instrução — não é medido por teste determinístico |
| `requireOwnService` (`apps/bff/src/modules/services/routes.ts`): `scheduling.listServices` do negócio da sessão antes de `GET`/`PUT /v1/services/:id/ai-instruction` | Instrução no modo sugestão e no teste real da ativação — não recebem a seção neste Goal |
| O campo "Instruções para a IA" em `ServiceForm.tsx`: lido por `GET`, gravado por `PUT` só quando mudou, depois do `POST`/`PATCH` do serviço | O caminho de `saveDurationByForm` do gate autenticado — continua um único `PATCH`, sem `PUT` |

**Limites declarados:** o primeiro turno de uma conversa, antes de rascunho de agendamento ou ação pendente, não tem serviço em foco e não recebe instrução; falha na leitura não derruba o turno, mas segue sem a seção; o modo sugestão e o teste real da ativação não recebem a seção; a obediência do modelo à regra de não revelar não é provada por teste determinístico; o texto de apoio do formulário é promessa de produto sustentada só pela instrução ao modelo. Detalhe em [D-092](DECISIONS.md).

**Oito controles negativos do §7, aplicados e revertidos** depois da última edição de código (FIX-001 da rodada 2, em `ServiceForm.tsx`), com a rodada de cada um: os controles 3 e 8 na rodada 2, por edição real revertida; os controles 1, 2, 4, 5, 6 e 7 na rodada 3 (FIX-001), o 4 por edição real revertida e os 1, 2, 5, 6 e 7 por transform em memória, sem tocar o arquivo em disco. Saída colada em [FINAL_AUDIT §53](FINAL_AUDIT.md): (1) exclusão da `source` reservada fora do SQL (rodada 3): reprova o teste do SQL capturado, `Tests 1 failed | 19 passed (20)`. (2) leitura em lote sem `tenantId` (documento e chunk; rodada 3): reprova o teste de isolamento entre tenants, `Tests 1 failed | 19 passed (20)`. (3) passo restrito à intenção `knowledge` (rodada 2): reprova o caso de agendamento da entrega, `Tests 4 failed | 2 passed (6)`. (4) leitura que ignora `focusServiceIds` (chamada com lista vazia; rodada 3): reprova o caso do serviço B em foco, `Tests 4 failed | 2 passed (6)`. (5) linha da regra de não revelar removida da seção (rodada 3): reprova a entrega e o hash da versão do prompt, `Tests 7 failed | 49 passed (56)`. (6) `create` sem a reserva (rodada 3): reprova o teste de reserva, `Tests 1 failed | 19 passed (20)`. (7) BFF sem conferir posse no `PUT` (rodada 3): reprova o teste de serviço de outro negócio com `AssertionError: expected 502 to be 404`, `Tests 1 failed | 6 passed (7)`. (8) formulário que sempre manda `PUT` (rodada 2, contra o `ServiceForm.tsx` já corrigido pelo blocker 1): reprova os dois casos de salvar sem mudar o texto e de serviço novo sem texto, `Tests 2 failed | 7 passed (9)`. Cada um passa sem o defeito, e cada arquivo-alvo tem o mesmo `git hash-object` antes e depois do controle (`pgvector-knowledge-store.ts` `45a2a307…`, `knowledge-document-service.ts` `35a0e02f…`, `message-graph.ts` `be5e9c7c…`, `service-instructions.ts` `14cb55df…`, `apps/bff/src/modules/services/routes.ts` `eec77a0f…`, sem mudança desde a WU-19 da rodada 1; `ServiceForm.tsx` `88d3bb55…`, hash vigente desde o FIX-001 da rodada 2, que era `04d9bd8e…` na WU-19 da rodada 1).

**Execução final vigente, das WU-15 a WU-18 da rodada 2 do IA Loop, posterior à última edição de código (FIX-001 da rodada 2, em `ServiceForm.tsx`):** `npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0; `test:ai-orchestrator` **1177**/**1270** testes (**93** pulados; baseline **1136**/**1229**, **+41**) e `test:frontend` **109**/**1128** (baseline **108**/**1119**, **+1** arquivo e **+9** testes — 8 da WU-04 mais o teste do blocker 1 da rodada de correção 2). `npm run test:gate` — **233**/**233**, exit 0, mesma contagem da baseline. `npm run validate:ui` — **169** `passed`, **21** `skipped`, **0** `unexpected`, **0** retentativas, exit 0. `BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" npm run validate:integration` — **36**/**36** passos, exit 0; `test:bff-integration` **59**/**455** (baseline **58**/**448**, **+1** arquivo e **+7** testes), `test:scheduling-integration` **18**/**143**, `test:ai-orchestrator-transport-durability` **10**/**74**, `test:ai-orchestrator-content-purge` **3**/**19** (as três sem mudança); gate autenticado (`rehearse:goal033-authenticated-ui`) em **155** `passed`, **0** retentativas, exit 0 — mesma contagem da baseline, sem rota nem cenário novo medido. A rodada 3 não editou código e reexecutou os mesmos quatro gates, todos exit 0. Esta execução substitui a das WU-15 a WU-18 da rodada 1, rodada sobre a árvore das WU-01 a WU-04 antes da edição de `ServiceForm.tsx`: mesmas contagens nos gates e nas suítes de backend, e `test:frontend` com **109** arquivos, sem o teste do blocker 1, escrito depois dela (a contagem de testes dessa execução não foi guardada).

**Rodada de correção 2 (FIX-001).** A revisão da rodada 1 encontrou três blockers, todos corrigidos: (1) código, `ServiceForm.tsx` repetia `POST` no reenvio quando o `PUT` da instrução falhava depois de criar o serviço; (2) evidência, faltava o vermelho da baseline `011de8f` dos testes novos e a recontagem das três suítes de backend; (3) documentação, o parágrafo "Consequências" de D-092 nomeava mal as asserções mudadas fora de composição/versão de prompt. **Vermelho da baseline `011de8f`**, com os arquivos de produção deste Goal postos de lado por `git stash push -u`/`apply`/`drop`: os quatro arquivos novos de `apps/ai-orchestrator/tests/` contra o `src/` da baseline — `Tests 32 failed | 5 passed (37)`; `goal078-service-ai-instruction.integration.test.ts` do BFF, com `BFF_RUN_INTEGRATION_TESTS=true` e o PostgreSQL descartável, contra o `src/` da baseline — `Tests 7 failed (7)`; `goal078-service-instruction-form.test.tsx` do frontend contra o `src/` da baseline — `Tests 9 failed (9)`. **Recontagem das três suítes de backend na baseline** (produção e testes deste Goal postos de lado juntos): `test:ai-orchestrator` **1136** `passed`, **93** `skipped` de **1229**, em **88** arquivos; `test:scheduling-service` **502** `passed` em **37** arquivos (app não tocado); `test:bff-integration` **448** `passed` em **58** arquivos — os três batem com "Baseline aceita" (via review075), agora reconferidos em vez de só citados, e são o piso usado para comparar a execução final. A execução final vigente acima é a das WU-15 a WU-18 da rodada 2, depois do blocker 1 (`ServiceForm.tsx`). Detalhe completo, hashes e saída real em [FINAL_AUDIT §53 — Rodada de correção 2](FINAL_AUDIT.md); nota em [D-092](DECISIONS.md).

**Conferência humana pendente.** A conferência do §9 do Goal **não foi feita**: que, numa conversa real com o modelo de produção, com uma instrução como a da henna e o serviço em foco, a IA age conforme a instrução e não a repete à cliente; e que o campo "Instruções para a IA", num aparelho real nas cinco larguras, bate com as opções abertas de `Servicos.dc.html`, `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html`.

**O que esta seção não prova.** Não prova que o modelo de produção obedece à regra de não revelar, nem fidelidade visual do campo aos protótipos aprovados, nem Conversas e a central de notificações (Goal077) ou o onboarding (Goal072). `validate:integration` e o gate autenticado são a execução das WU-15 a WU-18, reconferida por esta unidade contra o PostgreSQL descartável da estação.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal078-2026-09-29-d-092-accepted),
[FINAL_AUDIT §53](FINAL_AUDIT.md) e [D-092](DECISIONS.md), **ACCEPTED** no
[review078](reviews/078-review.md) (rodada 4 do IA Loop, sem blocker; os
gates da rodada 4 passaram, inclusive `validate:integration` no próprio IA
Loop, com as mesmas contagens da execução final da rodada 2).

## Central de notificações em gaveta, espécie `AI_ACTIVATED` e autoria discreta sob a bolha, do Goal077

`apps/bff/` ganha a espécie `AI_ACTIVATED` por uma migration aditiva do enum
`NotificationKind` (`20260929000000_goal077_notification_ai_activated`),
escrita na mesma transação que liga a IA. `apps/frontend/` ganha a copy da
espécie, o desfecho da condição resolvida, o histórico por dia, a gaveta da
central a partir de 768 px e a autoria discreta sob a bolha do chat.
`packages/public-api-contract/` lista a espécie em `notificationKindSchema`.
Nenhuma rota nova; nenhuma rota entra ou sai de `PUBLIC_ROUTES`,
`AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.

| O que decide agora | O que não decide |
| --- | --- |
| `goal077-ai-activated-notification.integration.test.ts` (BFF, banco real, **10** testes): uma `AI_ACTIVATED` por execução, na mesma transação da ativação, só no negócio da sessão, `payload` vazio; pausar, troca de canal, conta em exclusão e ativação recusada não criam | Que a notificação aparece depois de um teste real num WhatsApp real — IA e Scheduling são dublês HTTP |
| `rehearse:goal028-release-migrations`: a migration nova aplica do zero e o `migrate diff` do BFF não mostra drift | Migration em banco de produto |
| `goal077-notifications-center.test.tsx` e `goal077-notifications-drawer.test.tsx` (jsdom): copy, desfecho, agrupamento, nome acessível com o nível, gaveta com `Escape` e foco devolvido, sino como link no celular | Layout real, contraste e largura — decididos pelo gate autenticado |
| `goal077-message-authorship.test.tsx` (jsdom): "IA · hora", "Você · hora", só a hora da cliente, `SENT` sem selo, `PENDING`/`FAILED`/`UNKNOWN` visíveis | Que a linha de autoria é discreta aos olhos de uma pessoa |
| Teste novo "inicio: the bell opens the notifications" no gate autenticado, nas cinco larguras: link para `/notificacoes` em 360 e 390; em 768, 1024 e 1440, o diálogo "Notificações" sem navegar, overflow e toque (≥ 24 px) do sino e dos controles da gaveta, `Escape` e foco de volta no sino | Fidelidade aos protótipos `Notificacoes*.dc.html` e `Conversas*.dc.html` |

O marcador de sessão de `/notificacoes` em `e2e/routes.ts` é
`a[href="/notificacoes"][aria-current="page"]`: o item "Notificações" da
sidebar continua link para `/notificacoes`, e o clique simples abre a
gaveta. Uma pré-checagem do gate autenticado com o item como botão reprovou
`/notificacoes` nas cinco larguras por esse marcador, antes da execução
final; nenhuma linha de `e2e/routes.ts` nem do spec existente mudou.

**Execução final do FIX-001 da rodada 2, depois da última edição de código:**
`npm run validate:core` — **17** passos, **15** `passed`, **0** `failed`,
**2** `skipped` (`test:bff`, `test:health-worker`), exit 0, com
`test:frontend` **112**/**1146** (baseline recontada **109**/**1128**);
`npm run test:gate` — **233**/**233**, exit 0; `npm run validate:ui` —
**169** `passed`, **21** `skipped`, **0** retentativas, exit 0;
`BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test_g077r2 npm run validate:integration`
— **36** passos, **36** `passed`, exit 0, com `test:bff-integration`
**60**/**465** (baseline recontada **59**/**455**), sem drift no BFF, e
`rehearse:goal033-authenticated-ui` com **160** testes passando (**155** da
baseline mais o novo nas cinco larguras) e **0** retentativas. Os oito
controles negativos do §7 foram rodados depois dessa execução; saída real
em [FINAL_AUDIT §54](FINAL_AUDIT.md).

**Conferência humana pendente.** A conferência do §9 do Goal **não foi
feita**: Conversas e a central num aparelho real nas cinco larguras frente
aos seis protótipos; a legibilidade de "IA · 13:38"; a gaveta de 440 px
sobre a Home no tablet; o item "Notificações" mantido na sidebar
(divergência declarada frente ao protótipo); e "Sua IA está ativa" depois
de um teste real num WhatsApp real. Nenhum teste é declarado prova de
fidelidade visual.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal077-2026-09-29-d-093-accepted),
[FINAL_AUDIT §54](FINAL_AUDIT.md) e [D-093](DECISIONS.md), **ACCEPTED** no
[review077](reviews/077-review.md) (rodada 3 do IA Loop, sem blocker; a
rodada 3 só restaurou seis arquivos de configuração de teste e build que as
unidades de diagnóstico tinham editado, e os gates passaram, inclusive
`validate:integration` no próprio IA Loop, com as mesmas contagens da
execução final da rodada 2).

## Onboarding com voltar no topo, progresso por capítulo, seleção tonal, campos da agenda e guard da `importacao`, do Goal072

`apps/frontend/` troca o "Voltar" do rodapé por um chevron no topo, põe a
barra segmentada (abaixo de 768 px) e o trilho "Configuração inicial" (a
partir de 768 px) no lugar da barra contínua, dá tom e ✓ à seleção, e troca os
campos nativos da agenda por duração de 5 em 5 minutos, preço com máscara,
sete pílulas de dia e horas com barra. A etapa `importacao` aberta sem
`calendarSource` volta a `sistema-atual`. Nenhuma rota, migration ou mudança
de contrato; nenhuma rota entra ou sai de `PUBLIC_ROUTES`,
`AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.

| O que decide agora | O que não decide |
| --- | --- |
| `goal072-onboarding-frame.test.tsx` (jsdom, **19** testes): um único "Voltar" antes do título nas onze etapas do §6.1, inativo e fora do Tab na Boas-vindas, ausente nas telas de estado do teste real e em `whatsapp-concluido`; trilho e barra com o mesmo capítulo atual e "concluído"; o guard da `importacao` com e sem fonte | Layout real: em que largura a barra vira trilho, e a largura do botão principal |
| `goal072-onboarding-selection.test.tsx` (jsdom, **8**): nenhum heading dentro de `<button>` ou `<label>` em `modalidade`, `sistema-atual`, `tom-da-ia` e `dias-de-atendimento`; ícone e ✓ do cartão de modalidade; ✓ e `aria-pressed` do chip, com oito `.chip` | Que o tom, a borda e o ✓ leem bem aos olhos de uma pessoa |
| `goal072-onboarding-schedule-fields.test.tsx` (jsdom, **13**): duração de 5 em 5 com atalhos e recusa em linha, preço "R$ 90,00" gravando o mesmo valor, erro de servidor no campo do preço, sete dias com resumo, intervalo em texto com a barra `aria-hidden` | Que a barra de horas e o resumo dos dias leem bem |
| Gate autenticado dentro de `validate:integration`, **160** testes e **0** retentativas: as `ONBOARDING_ROUTES` nas cinco larguras — overflow, toque, contraste, foco e movimento — com a segunda conta semeada com a fonte da agenda | Fidelidade aos protótipos `Onboarding-1-Negocio-e-Agenda*.dc.html` |

A segunda conta do ensaio autenticado grava `calendar.source` (`ATENDLY`),
porque sem ela o guard da `importacao` a redirecionava para `sistema-atual` e
`onboarding-importacao` reprovava nas cinco larguras (a primeira execução de
`validate:integration` da rodada 1, WU-12: **155** passando e **5**
inesperados). É uma edição em `scripts/`, fora do escopo do Goal (§10), feita
pelo DIAG-001 do harness e **aceita pelo Tech Lead no review072 como desvio
autorizado**: é a única saída coerente entre o guard exigido (§4 e §6.10) e o
§5, e o seed grava um estado real do produto sem desligar nenhuma medida. O
docblock de `seedOnboardingAccount` diz o que a função faz: dois
`PATCH /v1/onboarding` e nenhum `POST /v1/onboarding/complete`; nenhuma linha
de `e2e/` mudou. `apps/frontend/AGENTS.md` foi atualizado com a mesma frase.

O sprite `apps/frontend/public/icons/avenly-icons.svg` passa no `DOMParser` do
jsdom com `image/svg+xml`: sem `parsererror`, **31** símbolos.
`goal072-icon-sprite.test.ts` (jsdom, **3** testes) guarda isso e a cobertura de
todo `IconName`: com o atributo colado (`id="i-clock"viewBox`) reprova
(`Tests 2 failed | 1 passed (3)`), restaurado passa (`Tests 3 passed (3)`), com o
`sha256` do sprite idêntico antes e depois
(`3c46b3e88be5f66feafbc1aa92135aef1e1f61cf56c941147a4d5e23b12be227`). Com ele,
`test:frontend` do app fica em **116**/**1189** (piso **112**/**1146**: **+4**
arquivos e **+43** testes).

**Execução final vigente: a da rodada 3 do IA Loop**, sobre a árvore entregue
(com o teste do sprite), todos exit 0: `npm run validate:core` — **17** passos,
**15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`,
`test:health-worker`), com `test:frontend` **116**/**1189**; `npm run
test:gate` — **233**/**233**; `npm run validate:ui` — **169** `passed`, **21**
`skipped`, **0** retentativas (`startTime` `2026-09-30T11:43:11Z`);
`npm run validate:integration`, contra um PostgreSQL descartável em
`127.0.0.1:55500/ia_bff_test` — **36** passos, **36** `passed`, com
`rehearse:goal033-authenticated-ui` em **160** testes passando, **0**
`unexpected`, **0** `flaky` e **0** retentativas (`startTime`
`2026-09-30T11:46:27Z`); `tsc --noEmit` e `eslint` de `apps/frontend`, exit 0.
A execução da rodada 2 (`test:frontend` **115**/**1186**, `validate:ui`
`2026-09-30T11:08:11Z`, autenticado `2026-09-30T11:10:56Z`, PostgreSQL em
`127.0.0.1:55472/atendly_bff_test`) é **anterior**, com as mesmas contagens de
gate. Os nove controles negativos do §7 **continuam os da rodada 2**, com
restauração conferida por hash: depois deles só entrou
`goal072-icon-sprite.test.ts`, que não toca código de produto nem os arquivos de
teste do §6, então não foram refeitos; saída real em
[FINAL_AUDIT §55](FINAL_AUDIT.md).

**Conferência humana pendente.** A conferência do §9 do Goal **não foi
feita**: as etapas dos capítulos "Seu negócio" e "Sua agenda" num aparelho
real nas cinco larguras frente aos três protótipos; o trilho, o chevron e o
botão na largura da coluna nas etapas de "Sua IA" e "WhatsApp"; e a leitura
do chevron cinza, da barra de horas e do resumo dos dias. Nenhum teste é
declarado prova de fidelidade visual.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal072-2026-09-30-d-094-accepted),
[FINAL_AUDIT §55](FINAL_AUDIT.md) e [D-094](DECISIONS.md), **ACCEPTED** no
[review072](reviews/072-review.md) (rodada 4 do IA Loop, sem blocker; a
rodada 4 só reescreveu os documentos, e a execução final vigente continua a
da rodada 3). O rerun dos gates na rodada 4, sobre o mesmo código, deu exit 0
com **1** `flaky` no gate autenticado (`onboarding-whatsapp` em `tablet-768`,
parado em "Verificando seu acesso" de `shared/runtime/ProductRuntime.tsx`, que
o diff não toca), classificado como ambiente conforme o §10 do Goal. Esse
rerun sobrescreveu os `e2e-results`: público `startTime`
`2026-09-30T12:03:21Z` (**169**/**21**/**0**) e autenticado
`2026-09-30T12:06:34Z` (**159** `expected` e **1** `flaky`). A lição do
review: o sprite de ícones com XML inválido da rodada 1 apagava o ícone
`clock` no app inteiro e passou por todos os gates, inclusive o gate
autenticado; hoje `goal072-icon-sprite.test.ts`, dentro de `test:frontend`,
parseia `public/icons/avenly-icons.svg` e exige um símbolo por `IconName`.

## Onboarding com Boas-vindas animada, demonstração da IA em sequência, estilo com amostra e promessas, do Goal079

`apps/frontend/` anima a Boas-vindas, troca a demonstração da IA por uma
conversa em sequência calculada do rascunho, dá uma amostra a cada estilo da IA
(com Equilibrada como padrão), reescreve a introdução do WhatsApp em quatro
promessas e põe "Conectar meu WhatsApp" antes de "Fazer isso depois" na ordem
de Tab. Nenhuma rota, migration ou mudança de contrato; `ONBOARDING_ROUTES`
ganha duas entradas, por acréscimo, e nenhuma rota sai de `PUBLIC_ROUTES`,
`AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.

| O que decide agora | O que não decide |
| --- | --- |
| `goal079-onboarding-welcome-whatsapp.test.tsx` (jsdom, **9** testes): a Boas-vindas com relógio falso, sem e com `prefers-reduced-motion`, "Começar" habilitado no primeiro quadro, `role="img"` e `aria-label` mantidos; as quatro promessas na ordem, com `<strong>`, ícone `aria-hidden` distinto e "Só um número por negócio."; "Conectar meu WhatsApp" antes de "Fazer isso depois" e nenhuma regra de `.onboarding-actions` com `row-reverse`, `column-reverse` ou `order` | Fidelidade da composição e do ritmo aos protótipos |
| `goal079-onboarding-demo.test.tsx` (jsdom, **14**) e `goal079-demo-slots.test.ts` (**17**): a sequência item a item, o "Continuar" só com o último item, `role="log"`, o dia e os horários do rascunho, os eventos dentro da conversa, nenhuma escrita e o cálculo puro com relógio fixo (um candidato, dois, `dayHours` vencendo o intervalo-base, hoje não conta, os quatro tipos de preço) | Que o ritmo de cerca de 11 s leia bem |
| `goal079-onboarding-style.test.tsx` (jsdom, **8**): título, descritores e amostra com o serviço do rascunho, Equilibrada selecionada com `tone` nulo, CTA "Continuar com <estilo>", `BALANCED` gravado sem tocar, nenhum heading dentro de `<button>` | Que a amostra soe como o tom; a amostra é prévia do frontend, não a saída do modelo |
| `goal079-onboarding-gate-routes.test.ts` (**6**): as duas rotas novas em `ONBOARDING_ROUTES` com o título da etapa como `contentMarker`, e as treze anteriores ainda presentes | Que a medida da tela passe |
| Gate autenticado dentro de `validate:integration`, **170** testes e **0** retentativas: as `ONBOARDING_ROUTES` nas cinco larguras — overflow, toque, contraste, foco e movimento — com a segunda conta semeada com o negócio, a fonte da agenda, um serviço ativo e a disponibilidade | Fidelidade aos protótipos; e a demonstração é medida no quadro em que o gate a encontra, que pode ser do meio da sequência |

A segunda conta do ensaio autenticado ganhou um terceiro `PATCH
/v1/onboarding`, depois dos dois de antes, com um serviço ativo de preço fixo
(Corte, 30 min, R$ 90) e a disponibilidade de segunda a sexta, das 09:00 às
18:00; o ensaio exige 200. Sem isso, `onboarding-demonstracao-da-ia` mostraria o
aviso "Configure…" e não a conversa. É a edição em `scripts/` que o §5 e o §10
do Goal autorizam; o docblock de `seedOnboardingAccount` diz "três `PATCH
/v1/onboarding`" e continua dizendo que não há `POST /v1/onboarding/complete`, e
nenhuma linha de `e2e/authenticated-matrix.spec.ts` mudou. `apps/frontend/AGENTS.md`
foi atualizado com a mesma frase e com as duas rotas novas.

Seis arquivos de teste de Goals anteriores tiveram asserções alteradas (títulos,
texto das promessas, CTA "Continuar com <estilo>" e a demonstração abrindo
inteira com `prefers-reduced-motion` simulado), cada uma com o motivo e o teste
que a substitui em [FINAL_AUDIT §56](FINAL_AUDIT.md); nenhum teste foi removido
nem pulado.

**Execução final, da WU-14 da rodada 1 do IA Loop**, sobre a árvore entregue,
na ordem do §8, todos exit 0: `npm run validate:core` — **17** passos, **15**
`passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`),
com `test:frontend` **121**/**1243** (baseline **116**/**1189**: **+5**
arquivos e **+54** testes, a soma de 9 + 14 + 17 + 8 + 6); `npm run test:gate`
— **233**/**233**; `npm run validate:ui` — **169** `passed`, **21** `skipped`,
**0** retentativas (`startTime` `2026-09-30T13:01:45Z`); `npm run
validate:integration`, contra um PostgreSQL descartável em
`127.0.0.1:55590/ia_bff_test` — **36** passos, **36** `passed`, com
`rehearse:goal033-authenticated-ui` em **170** testes, **0** `unexpected`,
**0** `flaky` e **0** retentativas (`startTime` `2026-09-30T13:15:11Z`);
`tsc --noEmit` e `eslint` de `apps/frontend`, exit 0. Duas execuções anteriores
de `validate:integration`, sobre o mesmo código, tiveram cada uma **1**
retentativa (a de `startTime` `2026-09-30T13:07:16Z` em `servicos` a 360 px), em
rota fora do onboarding, parada na tela "Verificando seu acesso" de
`shared/runtime/ProductRuntime.tsx`, que o diff não toca; foram reexecutadas
sem editar configuração (§10 do Goal). Os oito controles negativos do §7 foram
rodados depois da última edição de código, com restauração conferida por
hash; saída real em [FINAL_AUDIT §56](FINAL_AUDIT.md).

**Conferência humana pendente.** A conferência do §9 do Goal **não foi feita**:
a Boas-vindas, a demonstração, o estilo e a introdução do WhatsApp num aparelho
real nas cinco larguras frente aos protótipos; o ritmo da demonstração (cerca
de 11 s) e o da Boas-vindas (cerca de 3 s); o "pop" da amostra; e o tom de cada
amostra. Nenhum teste é declarado prova de fidelidade visual.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal079-2026-09-30-d-095-accepted),
[FINAL_AUDIT §56](FINAL_AUDIT.md) e [D-095](DECISIONS.md), **ACCEPTED** no
[review079](reviews/079-review.md) (rodada 2 do IA Loop, sem blocker; nenhum
código de produção mudou entre as rodadas, e a execução final vigente
continua a da WU-14 da rodada 1). Os gates da rodada 2 deram exit 0 e
sobrescreveram os `e2e-results` com as mesmas contagens: público `startTime`
`2026-09-30T13:40:18Z` (**169**/**21**/**0**) e autenticado
`2026-09-30T13:43:29Z` (**170** `expected`, **0** `flaky`). A lição do review:
o "Continuar" da demonstração entra num efeito passivo (`onDemoDone`), um
render depois da conversa, então teste com relógio real precisa esperá-lo com
`findByRole`; a consulta síncrona deixou `goal018-onboarding-reachability`
intermitente (**1** falha em **5**) sem que nenhum gate o acusasse de forma
estável.

## Não classificadas segue o prazo Comercial do negócio, do Goal080

A IA, o BFF, o contrato compartilhado e a tela de retenção passam a aplicar a
decisão U-01: o conteúdo de `Não classificadas` expira pelo prazo Comercial do
negócio. O BFF escreve a regra uma vez (`unclassifiedCutoff` igual ao
`commercialCutoff`), a IA recebe o cutoff como opcional e preserva na ausência,
e o contrato troca `unclassifiedPurged: false` por `unclassifiedRetentionFollows:
"COMMERCIAL"`. Sem migration, sem backfill e sem `UPDATE`; nenhuma rota, gate ou
arquivo de configuração de teste ou de build mudou.

| O que decide agora | O que não decide |
| --- | --- |
| `apps/ai-orchestrator/tests/retention/content-purge.test.ts` (PostgreSQL descartável, **14** testes, eram 9): o ramo com o cutoff apaga o conteúdo vencido com os filhos e preserva o do prazo; sem o cutoff, nada do grupo é apagado; a janela ambígua só sai se toda sessão permitir; o negócio vizinho não é tocado. Passo `test:ai-orchestrator-content-purge` de `validate:integration` | Que um negócio real perca o volume esperado na primeira passada; nenhuma purga foi executada contra dado real |
| `apps/ai-orchestrator/tests/internal/goal080-content-purge.routes.test.ts` (**9**, arquivo novo): a rota repassa o cutoff e recusa valor inválido (texto livre, data sem hora, instante sem fuso, número, nulo) com `400`, sem purga | A ordem de deploy entre BFF e IA além do cutoff opcional |
| `apps/bff/tests/goal023-retention-sweep.test.ts` (**23**) e `goal080-retention-ai-port.test.ts` (**1**): `unclassifiedCutoff` é o `commercialCutoff` com Comercial em 30, 90, 180 e 365 dias, e não o Pessoal, e o cliente o envia no corpo | Que `RETENTION_SWEEP_ENABLED` esteja ligado em algum ambiente |
| `apps/bff/tests/goal023-retention-settings.test.ts` (**11**): `unclassifiedRetentionFollows` é `"COMMERCIAL"`, `unclassifiedPurged` não existe, e a resposta passa em `retentionSettingsSchema` | Consumidor externo que lia o campo antigo |
| `apps/frontend/tests/goal023-retention-settings.test.tsx` (**10**): a nota diz que Não classificadas seguem o prazo Comercial, e só o diálogo da Comercial cita o grupo | Que o texto esteja claro para uma pessoa (conferência humana do §9) |

Testes de Goals anteriores tiveram asserções e fixtures alteradas (o campo do
contrato, a nota, o teste do serviço que passou a valer sem o cutoff e a âncora
de linha 769 para 775 em `assistant.service.test.ts`), cada uma com o motivo em
[FINAL_AUDIT §57](FINAL_AUDIT.md); nenhum teste foi removido nem pulado.

**Execução final**, sobre a árvore entregue, todos exit 0: `npm run
validate:core` — **17** passos, **15** `passed`, **2** `skipped` (`test:bff`,
`test:health-worker`); `npm run test:gate` — **233**/**233**; `npm run
validate:ui` — **169** `passed`, **21** `skipped`, **0** retentativas
(`startTime` `2026-09-30T14:37:30.913Z`); `npm run validate:integration`,
contra um PostgreSQL descartável em `127.0.0.1:55500/ia_bff_test` — **36**
passos, **36** `passed`, com `rehearse:goal033-authenticated-ui` em **170**
testes, **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime`
`2026-09-30T14:40:43.946Z`). Reexecutados pela WU-17, com PostgreSQL descartável
em `127.0.0.1:55611` onde o teste exige banco: `test:frontend` **121**
arquivos e **1244** testes; `test:ai-orchestrator` sem banco **1186** passando
e **98** `skipped` de **1284**; `test:bff-integration` **61** arquivos e **470**
testes; `test:scheduling-service` **37** arquivos e **502** testes. Os seis
controles negativos do §7 foram feitos depois da última edição de código, com
restauração conferida por hash; saída real em [FINAL_AUDIT §57](FINAL_AUDIT.md).

**Conferência humana pendente.** A conferência do §9 do Goal **não foi feita**:
a leitura da nota e do diálogo de redução na tela, num aparelho real e nas
cinco larguras. Nenhum teste é declarado prova disso, e nenhuma purga, varredura
ou `content-purge` foi executada contra dado real.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal080-2026-09-30-d-096-accepted),
[FINAL_AUDIT §57](FINAL_AUDIT.md) e [D-096](DECISIONS.md), **ACCEPTED** no
[review080](reviews/080-review.md) (rodada 2 do IA Loop, sem blocker; nenhum
código de produção nem teste mudou entre as rodadas, então a execução final e
os controles acima continuam os da rodada 1).

**O que o review080 acrescenta ao gate.** O único blocker foi de documento:
D-096 e CURRENT_STATE nomeavam uma rota interna que não existe
(`/internal/retention/content-purge`), e nenhum gate automático o acusou.
Nome de rota, arquivo ou função citado em documento do §8 é conferido contra o
código pelo review, não pelo gate. Os gates da rodada 2 deram exit 0 e
sobrescreveram os `e2e-results` (`startTime` `2026-09-30T15:11:59Z`, **169**
`passed`, **21** `skipped`, **0** `flaky`; autenticado `2026-09-30T15:15:11Z`,
**169** `expected` e **1** `flaky`). O `flaky` foi `configuracoes-conta` em
`notebook-1024`, sem o marcador de sessão na primeira tentativa: falha de
ambiente, tratada por reexecução e nunca por edição de configuração. O
comentário do passo `test:ai-orchestrator-content-purge` em
`scripts/validate-integration.mjs` ainda diz que a purga não alcança conteúdo
não classificado; o passo roda o teste certo, mas o comentário ficou velho e
estava fora do escopo deste Goal.

## Local próprio e as recusas do teste real, do Goal081

O onboarding deixa de gravar `ON_SITE` sem endereço: a etapa `modalidade` não
grava com Local próprio e `endereco` grava endereço e modalidades juntos, que é
o que `PATCH /v1/onboarding` aceita. As sete recusas nomeadas de `POST
/v1/activation-test` ganham texto próprio num módulo só, usado pelo onboarding e
por Configurações › IA, e o erro de etapa do onboarding distingue dado recusado,
serviço fora do ar e falha nossa. Nenhuma rota, contrato, migration, gate ou
arquivo de configuração de teste ou de build mudou; em
`scripts/validate-integration.mjs` mudaram só linhas de comentário.

| O que decide agora | O que não decide |
| --- | --- |
| `apps/frontend/tests/goal081-onboarding-local-proprio.test.tsx` (**4**, arquivo novo): contra um dublê que aplica a regra do BFF, `modalidade` → `endereco` → `sistema-atual` com Local próprio não tem chamada recusada, `modalidade` não chama `update`, `endereco` chama com `address` e `modalities: ["ON_SITE"]` juntos, e `endereco` sem `ON_SITE` no rascunho não grava e leva a `modalidade` | Que a pessoa percorra o onboarding num navegador real contra o BFF real (conferência humana do §9) |
| `apps/frontend/tests/goal081-activation-test-refusals.test.tsx` (**20**, arquivo novo): a indisponibilidade no onboarding e em Configurações › IA com o mesmo texto, sem "Tente novamente" e sem navegar; o texto de cada uma das seis recusas `409`; `onboardingError` em três classes e o `409` de conclusão | Que os textos estejam claros para uma pessoa |
| `apps/bff/tests/goal081-onboarding-local-proprio.integration.test.ts` (**1**, arquivo novo, PostgreSQL real): os corpos que o frontend passa a mandar dão `200` em `PATCH /v1/onboarding` e o `GET` seguinte traz `ON_SITE` e o endereço; é guarda do contrato e passa também na baseline | Que o frontend grave na ordem certa; isso é do teste de frontend |
| `apps/frontend/tests/goal019-activation-test-screens.test.tsx`: "recusa do servidor não vira progresso nem sucesso" agora afirma também o texto de indisponibilidade | Que o teste real funcione com o número da plataforma configurado (A-08 segue pendente) |

Testes de Goals anteriores tiveram asserções alteradas (o teste de
`goal065-onboarding-business.test.tsx` que guardava o defeito, três asserções de
ausência e três de erro de tela em `goal065-onboarding-business`,
`goal065-onboarding-schedule` e `goal066-onboarding-sistema-atual`), cada uma
com o motivo em [FINAL_AUDIT §58](FINAL_AUDIT.md); nenhum teste foi removido nem
pulado.

**Execução final**, feita pela WU-13 sobre a árvore entregue, todos exit 0:
`npm run validate:core` — **17** passos, **15** `passed`, **2** `skipped`
(`test:bff`, `test:health-worker`); `npm run test:gate` — **233**/**233**;
`npm run validate:ui` — **169** `passed`, **21** `skipped`, **0** `flaky`
(`startTime` `2026-09-30T22:06:12.019Z`); `npm run validate:integration`,
contra um PostgreSQL descartável em `127.0.0.1:55711/atendly_bff_test` — **36**
passos, **36** `passed`, com `rehearse:goal033-authenticated-ui` em **170**
testes, **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime`
`2026-09-30T22:09:15.913Z`). Suítes reexecutadas pela WU-13: `test:frontend`
**123** arquivos e **1268** testes; `test:bff-integration` **62** arquivos e
**471** testes, com o teste novo do BFF rodando no banco descartável, sem
`skipped`; `test:ai-orchestrator` sem banco **1186** passando e **98**
`skipped` de **1284**; `test:scheduling-service` **37** arquivos e **502**
testes. Os cinco controles negativos do §7 foram feitos depois da execução
final, com restauração conferida por hash; saída real em
[FINAL_AUDIT §58](FINAL_AUDIT.md).

**Conferência humana pendente.** A conferência do §9 do Goal **não foi feita**:
percorrer o onboarding de uma conta nova com Local próprio num navegador, contra
o BFF real, até `sistema-atual`; ler o texto de indisponibilidade do teste real e
os três textos de erro de etapa; e aceitar o custo de a retomada voltar para
`modalidade`. Nenhum teste é declarado prova disso, e nenhum gate percorre a
etapa `modalidade` clicando.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal081-2026-09-30-d-097-accepted),
[FINAL_AUDIT §58](FINAL_AUDIT.md) e [D-097](DECISIONS.md), **ACCEPTED** no
[review081](reviews/081-review.md) (rodada 1 do IA Loop, sem blocker).

**O que o review081 acrescenta ao gate.** O defeito de R-01 passou por todos
os gates desde os Goals 065 e 072. O teste da etapa usava um dublê de
`onboarding.update` que não aplicava a regra do BFF, e o gate autenticado grava
`ON_SITE` e endereço num único `PATCH`, sem clicar na etapa `modalidade`. O
dublê novo de `goal081-onboarding-local-proprio.test.tsx` recusa `ON_SITE` sem
endereço com o mesmo erro do BFF, e o teste de integração do BFF prova os corpos
contra PostgreSQL real. Nenhum gate percorre a etapa clicando; isso continua na
conferência humana. Na recontagem da baseline, `test:gate` teve **3** falhas
porque o client Prisma do ai-orchestrator não estava gerado, e passou com
**233**/**233** depois de `npx prisma generate`: é pré-condição do harness,
tratada fora do diff.

## Novo agendamento conforme o A6 e a medida de borda nativa, do Goal083

`/agenda/novo` passa a seguir o A6 numa tela só, o CTA cria com um clique, a faixa
"fonte oficial" sai da casca de todos os fluxos da Agenda e uma regra de
especificidade zero dá a aparência do design system aos controles de texto sem
classe. O gate autenticado ganha uma medida nova e uma rota nova. Nenhuma rota de
API, contrato, migration, opção de allowlist, gate ou arquivo de configuração de
teste ou de build mudou; em `e2e/`, só houve acréscimos.

| O que decide agora | O que não decide |
| --- | --- |
| `apps/frontend/tests/goal083-new-appointment.test.tsx` (**11**, arquivo novo): a soma "2 serviços · 1 h 30 · R$ 150,00" e a criação com **um** clique com `customerId`, `holdId` e os dois serviços; cliente novo com `customerName` e `customerPhone` opcional; `customerId` de `/clientes` escolhido e trocável; "Outro, sem cadastro" com `serviceIds: []`, `title` e `durationMinutes` e sem hold, e o CTA desabilitado enquanto incompleto, e a linha que diz por que não há horários sugeridos, sem chips; conflito com `ConflictPanel` e sobreposição que exige motivo; nenhum "fonte oficial", "Operacional" nem "Avisar a cliente", e nenhum `input` de texto, `select` ou `textarea` do formulário sem classe | Que a tela se pareça com o A6; fidelidade visual é conferência humana |
| `measureNativeBorderControls` (`apps/frontend/e2e/measure.ts`), chamada no passo "1c" de `apps/frontend/e2e/authenticated-matrix.spec.ts` como `expect.soft`: reprova `input` (fora `hidden`, `checkbox`, `radio`, `range`, `color` e `file`), `select` e `textarea` **renderizado**, com borda visível, em `inset`/`outset` ou com raio `0px`, e nomeia a rota, a largura e o seletor, em toda rota do gate autenticado | Bloqueio, série, remarcação, cancelamento e exceções: não estão em `AUTHENTICATED_ROUTES`, e a regra de `avenly.css` os cobre só por construção |
| `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`) ganha `agenda-novo` (`/agenda/novo`, `contentMarker: "Novo agendamento"`): o gate autenticado passa de **170** para **175** testes, os **5** novos um por largura | Que o seletor nomeie o campo sem `id`, classe, `type` ou `name`: ele sai como `input`, e quem o nomeia é o campo `html` do relatório |
| `apps/frontend/tests/goal016-appointment-create.test.tsx`, `goal016-a11y.test.tsx` e `goal075-customer-profile.test.tsx`, reescritos para o fluxo de um clique, sem o diálogo de confirmação: o nome acessível do CTA traz a hora, e o erro de criação é anunciado por `role="alert"` | Nenhuma asserção de acessibilidade saiu, mas o foco preso num diálogo deixou de existir porque o diálogo deixou de existir |

Cada asserção de teste anterior que mudou tem o motivo em
[FINAL_AUDIT §59](FINAL_AUDIT.md); nenhum teste foi removido nem pulado.

**Execução final da rodada 3**, toda exit 0, refeita pelo FIX-001 sobre a árvore
atual, sem edição de código na rodada, antes dos cinco controles:
`npm run validate:core` — **17** passos, **15** `passed`, **2** `skipped`
(`test:bff`, `test:health-worker`) —; `npm run test:gate` — **233**/**233** —;
`npm run validate:ui` — **169** `passed`, **21** `skipped`, **0** `flaky`
(`startTime` `2026-10-01T00:30:21.759Z`); `npm run validate:integration`, contra
um PostgreSQL descartável em `127.0.0.1:55733/atendly_bff_test` — **36** passos
`passed` —, com `rehearse:goal033-authenticated-ui` em **175** testes, **0**
`unexpected`, **0** `flaky` e **0** retentativas (`startTime`
`2026-10-01T00:38:23.287Z`). Os `startTime` vêm dos `results.json` em
`apps/frontend/e2e-results/` dessa execução. Suítes lidas dentro do
`validate:core` da rodada 3: `test:frontend` **124** arquivos e **1280** testes
(baseline **123**/**1268**), `test:ai-orchestrator` **1186** passando e **98**
`skipped` de **1284**, `test:scheduling-service` **37** arquivos e **502**
testes.

**O que o controle 5 deixa no disco.** O quinto controle do §6 roda o gate
autenticado só em `agenda-novo` e `desktop-1440`, por
`scripts/goal033-authenticated-ui-rehearsal.mjs` com `GOAL033_PLAYWRIGHT_CONFIG`
apontando para uma configuração temporária, apagada depois, e sobrescreve
`apps/frontend/e2e-results/authenticated/results.json` com o relatório de um
teste. O FIX-001 **restaurou** o arquivo da cópia que guardou antes: `startTime`
`2026-10-01T00:38:23.287Z` e **175** testes. `e2e-results/` segue fora do Git.

Os cinco controles negativos do §6 foram feitos na rodada 3, depois da execução
final, com restauração conferida por hash; saída real em
[FINAL_AUDIT §59](FINAL_AUDIT.md). O vermelho da baseline do §5 é entrega da
rodada 1 e não foi reexecutado na rodada 3.

**Conferência humana pendente.** A conferência do §8 do Goal **não foi feita**: a
fidelidade visual da tela ao A6 em 360, 390, 768, 1024 e 1440 px; criar pela tela
nova, num navegador contra a pilha local, um agendamento com cliente cadastrado e
dois serviços e outro com cliente novo; e decidir a divergência (e), se a criação
deve avisar a cliente pelo WhatsApp. Nenhum teste é declarado prova disso.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal083-2026-09-30-d-098-accepted),
[FINAL_AUDIT §59](FINAL_AUDIT.md) e [D-098](DECISIONS.md), **ACCEPTED** no
[review083](reviews/083-review.md) (rodada 3 do IA Loop, depois de um blocker
na rodada 1 e outro na rodada 2).

**O que o review083 acrescenta ao gate.** Até este Goal, nenhuma medida do gate
olhava o estilo do controle, e `/agenda/novo` não estava em
`AUTHENTICATED_ROUTES`: os campos com borda nativa passaram por todos os gates.
`measureNativeBorderControls` reprova controle visível com borda `inset` ou
`outset` ou com raio `0px` em toda rota medida, e o controle 5 mostrou que ela
nomeia o campo. O seletor impresso pode ser só `input` quando o campo não tem
`id`, classe, `type` nem `name`; quem o identifica é o `html` impresso.
Bloqueio, série, remarcação, cancelamento e exceções continuam fora do gate
autenticado. A rodada 2 mostrou o custo da ordem do §7: uma edição pequena
depois dos controles obrigou a refazer a execução final, os cinco controles e
a prosa, e foi isso que a rodada 3 entregou.

## Preço em reais, telefone nacional formatado e demonstração sem artigo, do Goal084

O campo de preço passa a receber reais, o telefone na forma nacional passa a
aparecer formatado nas telas de cliente e a demonstração da IA deixa de pôr
artigo antes do nome do serviço. Nenhuma rota de API, contrato, migration,
opção de allowlist, gate ou arquivo de configuração de teste ou de build mudou,
e `e2e/` não foi tocado.

| O que decide agora | O que não decide |
| --- | --- |
| `apps/frontend/tests/goal084-price-input.test.tsx` (**24**, arquivo novo): a tabela de leitura do preço ("60" dá 6000 centavos, "60,5" dá 6050, "1.200" dá 120000, digitados e colados), a recusa acima de `Number.MAX_SAFE_INTEGER` centavos, e o `price: 60` enviado por serviço novo, edição e onboarding | Que a pessoa ache natural o campo formatar ao sair; é conferência humana |
| `apps/frontend/tests/goal084-phone-display.test.tsx` (**19**, arquivo novo): `formatBrazilianPhone` reconhece a forma nacional (`55991919817`, `5133334444`, `5191234567`, `051991234567`) e a lista de clientes, o perfil, o seletor do novo agendamento, o detalhe do agendamento e a confirmação de duplicata mostram o telefone formatado | Que toda linha da base importada real esteja num formato reconhecido: a prova usa as formas conhecidas de IM-10 e CL-04 |
| `apps/frontend/tests/goal084-demo-article.test.ts` (**10**, arquivo novo): nenhum texto da conversa nem da amostra de tom tem artigo antes do nome do serviço, nos quatro tipos de preço, e a primeira mensagem é "Oi! Quanto custa <nome>?" | Que a IA real concorde o gênero do serviço: a demonstração é prévia do frontend |
| Oito arquivos de teste anteriores com asserção trocada (a máscara de centavos e o texto com artigo que afirmavam) | Nenhum teste foi removido, pulado nem encolhido; o motivo de cada troca está em [FINAL_AUDIT §60](FINAL_AUDIT.md) |

**Execução final**, toda exit 0, refeita pela WU-14 sobre a árvore atual, sem
edição de código depois dela, antes dos quatro controles: `npm run validate:core`
— **17** passos, **15** `passed`, **2** `skipped` (`test:bff`,
`test:health-worker`) —; `npm run test:gate` — **233**/**233** —;
`npm run validate:ui` — **169** `passed`, **21** `skipped`, **0** `flaky`
(`startTime` `2026-10-01T01:48:45.905Z`, lido do `results.json` da WU-12, não
reexecutado); `npm run validate:integration`, contra um PostgreSQL descartável em
`127.0.0.1:55741/atendly_bff_test` — **36** passos `passed` —, com
`rehearse:goal033-authenticated-ui` em **175** testes, **0** `unexpected`, **0**
`flaky` e **0** retentativas (`startTime` `2026-10-01T02:11:32.086Z`). Suítes
lidas dentro do `validate:core`: `test:frontend` **127** arquivos e **1334**
testes (referência **124**/**1280**), `test:ai-orchestrator` **1186** passando e
**98** `skipped` de **1284**, `test:scheduling-service` **37** arquivos e **502**
testes.

**A retentativa da WU-13 e por que o gate foi refeito.** O
`validate:integration` da WU-13 (`startTime` `2026-10-01T01:54:27.776Z`) teve **1**
`flaky`: `[desktop-1440]` em `/configuracoes/agenda` falhou na primeira
tentativa com `net::ERR_NO_BUFFER_SPACE` e passou na retentativa. É falha de
ambiente, mas o Goal pede **0** retentativas; a WU-14 reexecutou o gate sem tocar
configuração, e o `results.json` em disco é o dessa reexecução. `e2e-results/`
segue fora do Git.

Os quatro controles negativos do §6 foram feitos pela WU-14 depois da execução
final, com restauração conferida por hash; saída real em
[FINAL_AUDIT §60](FINAL_AUDIT.md). O vermelho da baseline do §5 é entrega das
WU-01 a WU-03 e não foi reexecutado.

**Conferência humana pendente.** A conferência do §8 do Goal **não foi feita**:
digitar preço num navegador contra a pilha local (onboarding, serviço novo e
edição), ver a lista de Clientes da conta com a base importada e ler a
demonstração com um nome de serviço feminino e um masculino. Nenhum teste é
declarado prova disso.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal084-2026-09-30-d-099-accepted),
[FINAL_AUDIT §60](FINAL_AUDIT.md) e [D-099](DECISIONS.md), **ACCEPTED** no
[review084](reviews/084-review.md) (rodada 1 do IA Loop, sem blocker). O review
reexecutou `test:frontend` por `vitest run` (**127**/**1334**) e não acrescenta
medida nem passo ao gate: as provas deste Goal são de componente e de texto, e
nenhuma medida renderizada lê o campo de preço, o telefone exibido ou a
demonstração.

## Recusa do login da Minha Agenda com dono, do Goal082

A recusa do `/oauth/token` passa a dizer de quem é a falha: a da pessoa
(`MINHA_AGENDA_AUTH_FAILED` 422) pede para conferir e-mail e senha, e a da
Avenly (`MINHA_AGENDA_CLIENT_REJECTED` 503, código novo) diz que a importação
está indisponível e fica no log da operação, sem o valor da variável. Nenhuma
rota, migration, variável de ambiente, `render.yaml`, `/health`, opção de
allowlist, gate ou arquivo de configuração de teste ou de build mudou, e `e2e/`
não foi tocado.

| O que decide agora | O que não decide |
| --- | --- |
| `apps/scheduling-service/tests/unit/goal082-minha-agenda-auth-classes.test.ts` (**23**, arquivo novo): a tabela de classificação do `/oauth/token` (`invalid_grant` em 400 e 401 e 400 sem `error` dão a pessoa; 401 sem `invalid_grant`, em oito formas de corpo, dá a operação), o log de erro por recusa com código e `originStatus`, a ausência do valor da variável no log, o aviso ao subir sem a variável e o `originCode` do trabalho em segundo plano | Que o portal real responda a senha errada com `invalid_grant`: se responder 401 sem ele, a pessoa ouve que a importação está indisponível; é conferência humana |
| `apps/bff/tests/goal082-integration-connect-client-rejected.test.ts` (**3**, arquivo novo, contra PostgreSQL): o BFF repassa `MINHA_AGENDA_CLIENT_REJECTED` com 503, sem reduzi-lo a 502, e mantém `MINHA_AGENDA_AUTH_FAILED` e `MINHA_AGENDA_NOT_CONFIGURED` | Que o BFF de produção tenha a mesma variável do Scheduling: ela é só do Scheduling |
| `apps/frontend/tests/goal082-connect-source-client-rejected.test.tsx` (**3**, arquivo novo): `connectErrorMessage` dá ao código novo o mesmo texto de `MINHA_AGENDA_NOT_CONFIGURED`, e não o genérico; esse texto não cita senha nem e-mail, e `MINHA_AGENDA_AUTH_FAILED` continua pedindo para conferi-los | Como o texto lê num navegador real; é conferência humana |
| `goal060-minha-agenda-connection.test.ts`: o `it.each([400, 401])` virou cinco linhas de tabela (**+3** testes) | Nenhum teste foi removido, pulado nem encolhido; a linha `401` que valia `MINHA_AGENDA_AUTH_FAILED` é a que a decisão substituiu, e o motivo está em [FINAL_AUDIT §61](FINAL_AUDIT.md) |

**Execução final**, feita pela WU-16 sobre a árvore atual, sem edição de código
depois dela, antes dos cinco controles: `npm run validate:core` — **17** passos,
**15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), exit 0 —;
`npm run test:gate` — **233**/**233** —; `npm run validate:ui` — **169**
`passed`, **21** `skipped`, **0** `flaky` (`startTime`
`2026-10-01T03:05:23.264Z`, lido do `results.json` da WU-14, não reexecutado);
`npm run validate:integration`, contra um PostgreSQL descartável em
`127.0.0.1:55743/atendly_bff_test` — **36** passos `passed` —, com
`rehearse:goal033-authenticated-ui` em **175** testes, **0** `unexpected`, **0**
`flaky` e **0** retentativas (`startTime` `2026-10-01T03:33:36.737Z`). Suítes
lidas dentro do `validate:core` e do `validate:integration`:
`test:scheduling-service` **38** arquivos e **528** testes (referência
**37**/**502**), `test:frontend` **128**/**1337** (referência **127**/**1334**),
`test:bff-integration` **63**/**474** (referência **62**/**471**) e
`test:ai-orchestrator` **1186** passando e **98** `skipped` de **1284**.

**As retentativas anteriores e por que o gate foi refeito.** Duas execuções
anteriores do gate autenticado tiveram **1** `flaky` cada: a do
`validate:integration` da WU-15 (`startTime` `2026-10-01T03:09:15.119Z`,
`[notebook-1024]`, `/onboarding/tom-da-ia` sem o título em 20000 ms) e a primeira
da WU-16 (`startTime` `2026-10-01T03:24:40.433Z`, `[mobile-360]`, o marcador de
sessão ausente em `configuracoes`). As duas passaram na retentativa, sem edição
de código, e nenhuma tocou a tela de conexão. O Goal pede **0** retentativas e o
§10 manda reexecutar sem tocar configuração; a terceira execução, acima, passou
sem retentativa e o `results.json` em disco é o dela. `e2e-results/` segue fora
do Git.

Os cinco controles negativos do §7 foram feitos pela WU-16 depois da execução
final, com restauração conferida por hash (**13** arquivos, **0** divergências);
saída real em [FINAL_AUDIT §61](FINAL_AUDIT.md). A primeira tentativa do
controle 3 foi inválida (o arquivo não compilou) e foi refeita. O vermelho da
baseline do §6 é entrega das WU-01 e WU-02 e não foi reexecutado pela WU-16.

**Conferência humana pendente.** A conferência do §9 do Goal **não foi feita**:
conectar com e-mail e senha certos na conta de teste real e ver a importação
seguir; conectar com a senha errada e ver "Confira o e-mail e a senha"; subir o
Scheduling sem a variável, ou com um valor errado, e ver a tela e o log. Nenhum
teste é declarado prova disso.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal082-2026-10-01-d-100-accepted),
[FINAL_AUDIT §61](FINAL_AUDIT.md) e [D-100](DECISIONS.md), **PROPOSED** até o
review do Goal082. As provas deste Goal são de unidade, de rota e de texto: nenhuma
medida renderizada lê a mensagem da conexão, e nenhuma medida ou passo foi
acrescentado ao gate.

## A casca em três faixas e a Home iguais ao protótipo, e as medidas G-1 e G-2 do gate autenticado, do Goal087

A barra inferior passa a existir abaixo de 1100 px (sem cabeçalho de marca e sem
trilho de 88 px) e a sidebar de 232 px, de 1100 px em diante
([D-101](DECISIONS.md), **PROPOSED**). Duas medidas novas entram no gate
autenticado, **só por acréscimo** em `e2e/authenticated-matrix.spec.ts` e
`e2e/measure.ts`. Nenhum teste existente, `e2e/routes.ts`,
`playwright.*.config.ts`, semente, `scripts/`, `KNOWN_*` ou passo de
`validate:*` mudou.

| O que decide agora | O que não decide |
| --- | --- |
| **G-1 (faixas)**, em `/inicio` e `/clientes`, em cada uma das cinco larguras: abaixo de 1100 px a `aside.sidebar` não está renderizada, a barra inferior está com cinco itens e nenhum `header[class$="-mobile-header"]` está renderizado; a partir de 1100 px a `aside.sidebar` está renderizada com 232 px (tolerância de 1 px) e a barra inferior não está (**10** testes) | Que a barra e a sidebar tenham a aparência do quadro: isso é lido nos `side-by-side.png` do `visual:compare` |
| **G-2 (nada atrás da barra)**, em `/clientes` e `/servicos`, abaixo de 1100 px, depois de rolar até o fim: o último elemento focável dentro de `main` e o `a.fab`, se houver, têm a caixa inteira acima do topo da barra inferior (**10** testes). É regressão: na baseline, 768 e 1024 não tinham barra | Rotas que não são `/clientes` e `/servicos`, e conteúdo escondido pelo teclado aberto ou pelo indicador de início do iPhone: só a conferência num aparelho real |
| `goal087-shell-navigation.test.tsx` (jsdom, **20** testes): a ordem e os links da sidebar sem linha de estado do WhatsApp, o cartão da IA e o "Pausar" só com a IA ativa, a conta com nome ou e-mail, o menu, a ausência do cabeçalho de marca e a faixa da Home com "Pausar" e sem a linha de pontos | Layout e largura de viewport: jsdom não tem layout |

**Execução final (rodada 3)**, sobre a árvore sem edição de código depois dela.
A última edição de código é a de `apps/frontend/src/shared/styles/avenly.css`
às `2026-10-01T06:52:09Z` (conta do pé da sidebar em 32 px e barra do celular em
65 px); as execuções abaixo começam depois. As corridas da rodada 1
(`validate:ui` de `startTime` `2026-10-01T05:52:45.834Z` e gate autenticado de
`05:56:25.463Z`) **não** são mais a execução final e foram substituídas.
`npx tsc --noEmit` e `npm run lint` (`apps/frontend`) — exit 0 nos dois —;
`npx vitest run` (`apps/frontend`) — **129** arquivos e **1359** testes
passando —; `npm run test:gate` — **233**/**233** —; `npm run validate:ui` —
exit 0, `results.json` com `startTime` `2026-10-01T06:52:50.102Z`: **169**
`passed`, **21** `skipped`, **0** `unexpected`, **0** `flaky`, **0**
retentativas —; gate autenticado, por `node
scripts/goal033-authenticated-ui-rehearsal.mjs` sozinho (o passo
`rehearse:goal033-authenticated-ui` de `validate:integration`), contra um
PostgreSQL 18 descartável em `127.0.0.1:55497` (o cluster da porta 55432
aceitava TCP e não respondia), exit 0, `results.json` com `startTime`
`2026-10-01T07:39:33.917Z`: **195** testes `expected`, **0** `unexpected`, **0**
`flaky` e **0** retentativas: os **175** da baseline mais **20** de G-1 e G-2
(quatro testes novos vezes cinco larguras). **Não relido nesta rodada:**
`validate:core` completo (rodada 1: **17** passos, **15** `passed`, **2**
`skipped`; `test:frontend` **129**/**1359**, `test:scheduling-service`
**38**/**528**, `test:ai-orchestrator` **1186** passando e **98** `skipped`) e o
resumo dos **36** passos de `validate:integration`; a edição de CSS não toca
nenhum arquivo que eles leiam. `e2e-results/` segue fora do Git.

**Quatro controles negativos do §6 do Goal**, feitos pela WU-11 **na rodada 1**,
antes das duas edições de CSS das rodadas 2 e 3 (por isso **não** são
posteriores à última edição de código, como a rodada 1 afirmava), cada um por
edição real em
`apps/frontend/src/shared/layout/AppShell.tsx` e restaurado por cópia do
original, com o `sha256` conferido: `8fad2a0605fcf33ed4b96ade2be02d20742dc7cc783d4aa39fc09e6197533449`
antes e depois de cada um, nos quatro. O `sha256` de `AppShell.tsx` na árvore
final da rodada 3 é o mesmo, e as edições posteriores foram só de CSS, que o
jsdom não lê; por isso os controles não foram refeitos.

| Controle | Defeito introduzido | `goal087-shell-navigation.test.tsx` com o defeito | Restaurado |
| --- | --- | --- | --- |
| 1 | `<div className="wa-status">WhatsApp conectado</div>` de volta na sidebar | `Tests  2 failed \| 18 passed (20)`; `AssertionError: expected <div class="wa-status"></div> to be null` | `20 passed (20)` |
| 2 | `{(active \|\| view === "off") && <Link ...>Pausar</Link>}` no cartão da IA | `Tests  1 failed \| 19 passed (20)`; `AssertionError: expected <a class="ia-card-action" …(1)></a> to be null` (IA em `OFF`) | `20 passed (20)` |
| 3 | `accountLabel` volta a ser só `session?.user.email` | `Tests  2 failed \| 18 passed (20)`; `Unable to find an accessible element with the role "button"` (nome `/Marina Alves/`) | `20 passed (20)` |
| 4 | `<header className="{módulo}-mobile-header"><Brand /></header>` de volta antes do `main` | `Tests  9 failed \| 11 passed (20)`; `AssertionError: expected <header …(1)>…(1)</header> to be null` | `20 passed (20)` |

A primeira tentativa do controle 4 foi inválida (a edição apagou um espaço e o
arquivo não compilou, `no tests`) e foi refeita; o resultado acima é o da
segunda. Ao fim dos controles, `git status --porcelain=v1 -uall` listava os mesmos 15
caminhos de antes deles. O `visual:compare` final é o da rodada 3, rodado depois
da última edição de código.

O vermelho da baseline das provas 1 a 5 e de G-1 é entrega da WU-01 à WU-03 e
não foi reexecutado pela WU-11.

**Conferência humana pendente.** A conferência do §7 do Goal087 **não foi feita**:
a casca num celular e num tablet reais, com o indicador de início e o teclado
aberto num formulário, e as outras telas logadas, cujo conteúdo próprio ainda
diverge dos quadros. Nenhum teste é declarado prova disso, e `visual:compare`
é tendência: quem revisa lê os `side-by-side.png`.

Ver [CURRENT_STATE](CURRENT_STATE.md#delta-implementado--goal087-2026-10-01-d-101-accepted)
e [D-101](DECISIONS.md), **PROPOSED**. FINAL_AUDIT não ganha seção neste Goal.

## A casca diz o estado real do WhatsApp e preenche a janela, e a medida G-3 do gate autenticado, do Goal085

O cartão da IA na sidebar diz "WhatsApp desconectado" com o WhatsApp desconectado, a faixa da Home no estado do quadro H3 é a única que avisa em `/inicio`, e a casca e a sidebar não usam unidade de viewport ([D-102](DECISIONS.md), **PROPOSED**). Uma medida nova entra no gate autenticado, **só por acréscimo** em `e2e/authenticated-matrix.spec.ts` e `e2e/measure.ts`. Nenhum teste existente, `e2e/routes.ts`, `playwright.*.config.ts`, semente, `scripts/`, `KNOWN_*` ou passo de `validate:*` mudou.

| O que decide agora | O que não decide |
| --- | --- |
| **G-3 (a sidebar cobre a janela)**, em `/servicos` e `/clientes`, nas larguras do gate a partir de 1100 px: `aside.sidebar` com topo 0 e fundo igual a `window.innerHeight` (tolerância de 1 px). Dois testes vezes cinco larguras, **10** testes; nas larguras abaixo de 1100 px o teste confere que a sidebar não está renderizada. **É regressão:** o defeito de R-10 não reproduz no Chromium do Playwright, e a medida passa também na baseline | Que o defeito de R-10 esteja corrigido no navegador em que Felipe o viu: só a conferência humana do §7 do Goal |
| `goal085-shell-states.test.tsx` (jsdom, **27** testes): a tabela de `aiCardView` (prova 1), o cartão da IA na casca com a IA ativa e o WhatsApp desconectado (prova 2) e o banner do WhatsApp na Home (prova 3) | Layout: jsdom não tem layout |
| `goal085-shell-css.test.ts` (**4** testes): nenhuma regra de altura com `.app-frame` ou `.sidebar` usa `vh`, `dvh`, `svh` nem `lvh`, em cada arquivo de estilo (**2** testes); a guarda lê a folha de verdade; e a guarda reprova `vh` dentro de `@media` e aceita a mesma altura em px (provas 4 e 5). **É a prova vermelha de R-10** | Que a sidebar renderize como o quadro: isso é lido nos `side-by-side.png` do `visual:compare` |

**Execução final**, sobre a árvore sem edição de código depois dela. A última edição de código é a de `apps/frontend/src/shared/styles/avenly.css` às `2026-10-01T08:38:14Z`; as execuções abaixo começam depois. `npx tsc --noEmit` e `npm run lint` (`apps/frontend`): exit 0 nos dois. `npm run validate:core`: exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff` e `test:health-worker`, que a própria saída declara sem suíte própria), **0** `failed`; dentro dele `test:ai-orchestrator` com **1186** passando e **98** `skipped`, `test:scheduling-service` **38** arquivos e **528** testes e `test:frontend` **131** arquivos e **1390** testes passando (a baseline do Goal087 tinha **129** e **1359**: os **2** arquivos e os **31** testes novos são os de `goal085-*`, **27** e **4**). `npm run test:gate`: **233**/**233**, **0** falhas. `npm run validate:ui`: exit 0, `results.json` com `startTime` `2026-10-01T08:54:20.203Z`: **169** `passed`, **21** `skipped`, **0** `unexpected`, **0** `flaky`, **0** retentativas. `npm run validate:integration`: exit 0, **36** passos, **36** `passed`, **0** `failed`, **0** `skipped`, contra um PostgreSQL 18 descartável em `127.0.0.1:55611`; o passo do gate autenticado (`rehearse:goal033-authenticated-ui`) escreveu `results.json` com `startTime` `2026-10-01T08:57:34.803Z`: **205** testes `expected` (os **195** da baseline mais os **10** de G-3), **0** `unexpected`, **0** `flaky`, **0** `skipped` e **0** retentativas. `e2e-results/` segue fora do Git.

**`visual:compare` contra a baseline `05c92fc`.** A baseline foi renderizada numa cópia temporária da árvore em `05c92fc` (fora da worktree), com `npm run visual:compare -- --target H3` (`2026-10-01T08:49:58.589Z`) e `-- --target H1,A1,CL1,Servicos:S1,Conversas:C1,M1` (`2026-10-01T08:50:57.886Z`); a execução final é `-- --target H3,H1,A1,CL1,Servicos:S1,Conversas:C1,M1` (`2026-10-01T09:04:56.841Z`), exit 0, contra o BFF local em `localhost:3002`. A porcentagem é tendência, não gate. Diff em %, baseline → final, na ordem mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768, desktop 1366×768:

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| H3 Home · WhatsApp desconectado | 14,9 → **8,1** | 9,0 → **4,1** | 9,6 → **3,7** | 8,4 → **3,0** |
| H1 Home · IA ativa | 11,8 → 12,6 | 5,5 → 7,4 | 4,8 → 8,4 | 4,2 → 7,1 |
| A1 Agenda · dia | 12,9 → 12,9 | 5,7 → 5,7 | 5,1 → 5,1 | 4,3 → 4,4 |
| CL1 Clientes · lista | 11,0 → 11,0 | 5,1 → 5,1 | 4,6 → 4,6 | 3,6 → 3,7 |
| S1 Serviços · lista | 8,8 → 8,8 | 5,3 → 5,3 | 4,8 → 4,8 | 3,6 → 3,7 |
| C1 Conversas · Comercial | 11,0 → 11,0 | 5,4 → 5,4 | 4,6 → 4,6 | 4,3 → 4,4 |
| M1 Mais | 7,6 → 7,6 | 3,1 → 3,1 | 4,7 → 4,7 | 4,1 → 4,2 |

O H3 melhora nos quatro devices. **Os números que pioraram têm causa medida, não são regressão de layout:** (1) **H1** (+0,8 / +1,9 / +3,6 / +2,9 pontos): a conta visual está no estado do H3 (WhatsApp desconectado), e a faixa do app agora tem cerca de 130 px, como a do H3 (131 px), contra cerca de 67 px da faixa do quadro H1; todo o conteúdo abaixo dela desce cerca de 64 px em relação ao H1, que a baseline por acaso aproximava melhor. O quadro certo para essa conta é o H3, que melhorou. (2) **+0,1 ponto no desktop** em A1, CL1, S1, C1 e M1: o único aumento fica na coluna da sidebar (x < 232 px), onde o cartão da IA com a desconexão (fundo vermelho de quatro linhas) difere do cartão "IA ativa" desses quadros, cerca de 1300 pixels diferentes a mais; fora da sidebar a contagem de pixels diferentes não mudou. Nenhuma outra diferença foi medida entre baseline e final nesses quadros.

Li o `side-by-side.png` do H3 nos quatro devices. **Divergências que restam, todas declaradas ou de dado da conta:** a frase "Tentamos reconectar por 5 minutos sem sucesso." ausente (D-102, divergência 1); o checklist "Ative sua IA" (a conta está com a IA desligada), a data e os números (conta); o item Notificações na sidebar do desktop e o sino sem o ponto vermelho (D-101); a saudação do mobile cerca de 16 px mais baixa e a faixa do tablet cerca de 2 px mais baixa, por espaçamento que este Goal não alterou.

**Quatro controles negativos do §6 do Goal**, feitos nesta rodada **depois da última edição de código**, sobre a árvore da execução final (`git status --porcelain=v1 -uall` com os mesmos 15 caminhos antes e depois), cada um por edição real num arquivo de produção, restaurado por cópia do original no mesmo passo, com o `sha256` do arquivo conferido idêntico depois da restauração:

| Controle | Arquivo e `sha256` antes e depois da restauração | Defeito introduzido | Teste com o defeito | Restaurado |
| --- | --- | --- | --- | --- |
| 1 | `systemStatus.tsx`, `50dac8455e4a5aed8f55243b16b6002574ffd728710305cf0711975749505116` (com o defeito: `9922204cd629c3e28869d09bd87dcfea1a41142c3a7529bdee2a14f4a00c9581`) | `aiCardView` ignora o WhatsApp (`if (false as boolean)` no lugar de `whatsapp === "off"`) | `goal085-shell-states.test.tsx`: `Tests  7 failed \| 20 passed (27)`; seis da prova 1 e uma da prova 2; `AssertionError: expected { action: null, support: null, …(2) } to deeply equal { action: { …(2) }, …(3) }` | `27 passed (27)` |
| 2 | `AppShell.tsx`, `e80833bfae07b0eb3d5a63afeb9697078ade46a97693726313ad81ca3221b84e` (com o defeito: `e8bad1427150994fd8107a7668a8fd384588869aaf5fd514f87901313a284c47`) | `IaCard` monta "IA ativa" e "Pausar" direto de `aiView`, sem o WhatsApp | `Tests  1 failed \| 26 passed (27)`; o teste "com a IA ACTIVE e o WhatsApp DISCONNECTED, diz que o WhatsApp está desconectado e nunca 'IA ativa' nem 'Pausar'" | `27 passed (27)` |
| 3 | `AppShell.tsx`, mesmo `sha256` (com o defeito: `9ffe52f0061adf5c385c9c86da33358bc36834bd897cb5155eedadfc6af7bc95`) | o banner do WhatsApp volta em `/inicio` com o painel carregado (`whatsappDisconnected && (` sem `!whatsappInBand`) | `Tests  1 failed \| 26 passed (27)`; `AssertionError: expected <p class="alert-title"></p> to be null` | `27 passed (27)` |
| 4 | `avenly.css`, `78d57defdb52a0d0397f4528237ae7031e9d9ed75917381dd4d048ef1ef5f765` (com o defeito: `199cde6c74cd52a6182b1fa23b074a9e4867f887b38d6918d9d5f27647ee8219`) | `.sidebar` volta a ter `height: 100dvh` | `goal085-shell-css.test.ts`: `Tests  1 failed \| 3 passed (4)`; `AssertionError: expected [ '.sidebar { height: 100dvh }' ] to deeply equal []` | `4 passed (4)` |

**Não feito:** a conferência humana do §7 do Goal (o navegador em que Felipe viu R-10, com zoom e com a janela redimensionada; a sidebar e a Home com o WhatsApp desconectado de verdade e a IA ativada). A prova de R-10 neste Goal é a guarda sobre a folha de estilo e a medida G-3 como regressão, não a reprodução do defeito.

**Fechamento — review085, 2026-10-01.** Aceito na rodada 2 ([review085](reviews/085-review.md)). O Tech Lead conferiu em disco: o `sha256` de `systemStatus.tsx`, `AppShell.tsx` e `avenly.css`, igual ao da tabela de controles; o `mtime` de `avenly.css` (`08:38:14Z`); e o `results.json` do gate autenticado (`startTime` `08:57:34.803Z`, **205** `expected`, **0** `unexpected`, **0** `flaky`, **10** testes G-3, **0** retentativas). Também conferiu uma corrida de `validate:ui` posterior à citada, com **169** `passed` e **21** `skipped`, e rodou os quatro arquivos de teste tocados (**60**/**60**). **Limite de proveniência:** a WU-10 do harness (`validate:integration`) ficou `SKIPPED`. Os **36**/**36** passos acima vêm da execução do Developer contra o PostgreSQL descartável local, e só o passo do gate autenticado foi conferido em disco pelo Tech Lead. Os quatro controles negativos foram conferidos por hash e por este registro, não reexecutados.

## Lista e detalhe lado a lado, tela empurrada, e as medidas G-4 e G-5 do gate autenticado, do Goal088

Clientes, Serviços e Configurações abrem o detalhe ao lado da lista de 1024 px em diante e como tela empurrada, sem barra de abas, abaixo disso ([D-103](DECISIONS.md), **ACCEPTED** no [review088](reviews/088-review.md)). Duas medidas novas entram no gate autenticado, **só por acréscimo** no fim de `e2e/authenticated-matrix.spec.ts`. Nenhum teste existente, `e2e/routes.ts`, `playwright.*.config.ts`, semente, `scripts/`, `KNOWN_*` ou passo de `validate:*` mudou.

| O que decide agora | O que não decide |
| --- | --- |
| **G-4 (tela empurrada abaixo de 1024 px)**, em `/clientes/detalhes`, `/servicos/editar` e `/configuracoes/negocio`, alcançadas por clique real na linha semeada da lista: sem `.list-detail`, `.app-frame.is-pushed`, sem barra de abas e sem FAB, link "Voltar para …" com o `href` certo e alvo de ao menos 24 px, e o CTA fixo (quando existe) dentro da janela e sem cobrir o último elemento focável. De 1024 px em diante o teste só confirma que o frame não é `is-pushed`. Três rotas vezes cinco larguras, **15** testes | Que a barra empurrada seja igual ao protótipo: isso é lido nos `side-by-side.png` |
| **G-5 (lista ao lado do detalhe, de 1024 px em diante)**, nas mesmas rotas e pelo mesmo clique: coluna da lista com 380 px (tolerância de 1 px), painel à direita sem sobreposição, a lista e o detalhe na mesma linha, e exatamente um `aria-current="page"`, contendo o nome semeado. Abaixo de 1024 px o teste confere que a lista não está montada. Três rotas vezes cinco larguras, **15** testes | Que a lista de Configurações seja a do protótipo (outro Goal) |
| `goal088-list-detail.test.tsx` (jsdom, **23** testes): prova 1 (de 1024 px em diante, detalhe e lista juntos, `aria-current` único, um só `h1`), prova 2 (os painéis vazios e o hub com o Negócio), prova 3 (abaixo de 1024 px, `.is-pushed`, sem barra de abas, sem FAB, voltar com nome e destino; de 1024 px em diante a casca completa), prova 4 (**uma** chamada de `useShellConfig` nas seis rotas, nas duas faixas) e prova 5 (a lista é buscada 1 vez ao lado do detalhe e 0 vez quando empurrada) | Layout: jsdom não tem layout |

**Contagem do gate autenticado:** **235** testes `passed` (**205** da base mais **30** de G-4 e G-5), **0** `unexpected`, **0** `flaky`, **0** retentativas (`goal033:authenticated-ui-rehearsal authenticated gate retries: 0`). Nenhuma rota foi retirada nem largura cortada: o orçamento de requisições do BFF comportou os 30 testes novos, porque a lista não é montada nem buscada abaixo de 1024 px.

**Execução final**, depois da última edição de código (`ServiceForm.tsx`, `2026-10-01T10:28:52Z`; os arquivos dos controles negativos foram restaurados depois, com o `sha256` idêntico). `npx tsc --noEmit` e `npm run lint` (`apps/frontend`): exit 0 nos dois. `npx vitest run` (`apps/frontend`): **132** arquivos, **1413** testes, todos verdes. `npm run validate:core`: exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff` e `test:health-worker`), **0** `failed`. `npm run test:gate`: **233**/**233**. `npm run validate:ui`: na primeira corrida, exit 0 com **166** `passed`, **21** `skipped` e **3** testes de contraste do axe (`criar-conta` em 360 e 768, `entrar` em 390) que estouraram os 30 s e passaram na retentativa; na segunda corrida, sem nenhuma edição entre as duas, **169** `passed`, **21** `skipped` e **0** retentativas. As rotas públicas não foram tocadas por este Goal; o estouro é de tempo do axe, e não se repetiu.

**`validate:integration` não passou neste ambiente.** Havia um processo escutando em `127.0.0.1:55432` que fecha a conexão, então foi criado um cluster PostgreSQL 18 descartável próprio em `127.0.0.1:55433` (banco `atendly_bff_test`, extensão `vector`), e `BFF_TEST_DATABASE_URL` apontou para ele. Resultado: **36** passos, **26** `passed`, **1** `failed`, **9** `notRun`. O passo que falhou é `test:scheduling-integration`: 4 testes de `goal025-tenant-purge.test.ts` com `PrismaClientKnownRequestError`, em código do Scheduling que este Goal não toca; a causa não foi investigada. Os 9 passos seguintes, o último deles o do gate autenticado, não rodaram. **O passo `rehearse:goal033-authenticated-ui` foi então rodado à parte**, com `node scripts/goal033-authenticated-ui-rehearsal.mjs` e o mesmo `BFF_TEST_DATABASE_URL`: exit 0, `235 passed (6.9m)`, que é a contagem acima. Não é a corrida completa do gate.

**`visual:compare`** (`-- --target CL5,Servicos:S4,Mais-Negocio:N1`, exit 0, e `-- --target CL1,CL4,Servicos:S1,Servicos:S3,Agenda:S1,Mais-Negocio:M1,AG1,IA1,W1,R1,Mais-WhatsApp:C1`, exit 0), depois da última edição de código. A baseline `f0d53ae` não foi renderizada de novo nesta rodada; a porcentagem é tendência, não gate.

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| CL5 Cliente · resumo | 9,5 | 4,7 | 6,2 | 5,5 |
| S4 Serviço · opções | 9,8 | 8,8 | 14,3 | 8,7 |
| N1 Negócio | 8,2 | 4,2 | 5,9 | 5,1 |
| CL1 Clientes · lista (Goal085: 11,0 / 5,1 / 4,6 / 3,6) | 11,0 | 5,1 | 3,4 | 2,7 |
| S1 Serviços · lista (Goal085: 8,8 / 5,3 / 4,8 / 3,6) | 8,8 | 5,3 | 3,9 | 2,9 |
| M1 Mais (Goal085: 7,6 / 3,1 / 4,7 / 4,1) | 7,6 | 3,1 | 6,0 | 5,2 |
| CL4 | 17,3 | 8,1 | 9,2 | 7,4 |
| S3 | 7,0 | 12,3 | 13,4 | 7,7 |
| Agenda S1 | 9,8 | 8,9 | 14,5 | 8,8 |
| AG1 | 10,9 | 5,3 | 5,3 | 4,9 |
| IA1 | 14,5 | 5,5 | 6,7 | 5,5 |
| W1 | 9,4 | 4,8 | 5,7 | 4,9 |
| R1 | 14,3 | 8,4 | 8,7 | 7,5 |
| C1 (WhatsApp) | 11,1 | 4,4 | 4,6 | 4,1 |

Li o `side-by-side.png` de S4 em paisagem (o maior número dos três quadros) e o de M1 no desktop. No S4 em paisagem, o CTA "Salvar alterações" fica acima da barra de abas, e o resto do diff é a lista de Serviços à esquerda, o banner do WhatsApp e os campos abertos. O M1 piora em paisagem e desktop porque o painel do Negócio passou a aparecer ao lado de uma lista de Configurações que é de outro Goal. **Divergências que restam, todas declaradas em D-103 ou de dado da conta:** banner e cartão do WhatsApp desconectado; "alterações não salvas" só com o formulário alterado; S4 sem a linha-resumo dos campos essenciais; `⋯` ausente sem ação secundária; N1 com "Não informado" estático onde o contrato não tem o campo; título do painel Negócio em `h1` grande; lista de Configurações sem o cartão do negócio e os grupos; dados do CL5 da conta de teste.

**Prova vermelha contra a baseline.** `goal088-list-detail.test.tsx`, rodado contra os arquivos de produção da baseline `f0d53ae` (os arquivos do Goal trocados pelos de `git show f0d53ae:`, e restaurados por `sha256` conferido no fim), reprovou com **11** falhas; na árvore final passa com **23**/**23**.

**Quatro controles negativos**, feitos **depois da última edição de código**, cada um por edição real num arquivo de produção, restaurado por cópia do original no mesmo passo, com o `sha256` conferido idêntico depois (`node` com `neg.cjs`, saída reproduzida abaixo):

| Controle | Arquivo e `sha256` antes e depois da restauração | Defeito introduzido | Teste com o defeito | Restaurado |
| --- | --- | --- | --- | --- |
| 1 | `AppShell.tsx`, `03452351882fdd703a8fdf10582d2cad01f5df27f4b0ac000e789e4bb6627c38` | `const hideTabBar = false;` no lugar de `pushed && !wide` | `Tests  3 failed \| 20 passed (23)`: a prova 3 nas três rotas de detalhe, "mostra só o detalhe, com voltar claro e a casca sem barra de abas" | `23 passed (23)` |
| 2 | `CustomerList.tsx`, `f5efc36d0e44f41d973b92998efb01ba39d8254c97b8aaed99ddcfa28165b1d3` | `useShellConfig` dentro de `CustomerListPanel` | `Tests  4 failed \| 19 passed (23)`: prova 1 em `/clientes/detalhes`, "de 1024 px em diante, o detalhe mantém a casca completa", prova 4 "nas seis rotas, na faixa ≥1024" e prova 5 `/clientes/detalhes` ≥1024 | `23 passed (23)` |
| 3 | `CustomerProfile.tsx`, `d1037a5d4358b6cb572d364127fbea96d3a07a6f86ede3e23b187043731e36b8` | o detalhe devolve só o perfil também em largo (`if (wide \|\| !wide) return profile;`) | `Tests  2 failed \| 21 passed (23)`: prova 1 em `/clientes/detalhes` e prova 5 ≥1024 ("busca a lista 1 vez(es)") | `23 passed (23)` |
| 4 | `CustomerProfile.tsx`, mesmo `sha256` | a lista fica montada abaixo de 1024 px (sem o `if (!wide) return profile;`) | `Tests  2 failed \| 21 passed (23)`: prova 3 em `/clientes/detalhes` e prova 5 "<1024 busca a lista 0 vez(es)" | `23 passed (23)` |

**Não feito:** a conferência do §7 do Goal (aparelho real, com toque, teclado virtual e rotação). A prova de layout deste Goal é o gate renderizado (G-4 e G-5, no Chromium do Playwright), o `visual:compare` e os `side-by-side.png`, não um aparelho.

### Correção — rodada 3 (blockers da revisão da rodada 2, FIX-001)

As contagens acima são da rodada 2 e ficam substituídas pelas desta subseção. O que a rodada 3 mudou: subrotas de Configurações fora do Negócio no padrão (tela empurrada abaixo de 1024 px, painel ao lado da lista de 1024 px em diante); N1 sem o cartão permanente "Editar dados do negócio" (a linha com `›` abre o editor); CTA "Criar cliente" fixo no CL4; rótulos PRÓXIMO e PREFERÊNCIAS do CL5 em Hanken Grotesk e a legenda "a cada" sem quebra; e o corpo do S4 portado (linha-resumo, Recorrência, Intervalo antes e depois com steppers, Instruções para a IA, Serviço ativo, sem o disclosure). A linha-resumo do S4 abre **expandida**, pelo motivo da divergência 4 de [D-103](DECISIONS.md). `goal088-list-detail.test.tsx` passou de **23** para **25** testes (`/configuracoes/conversas` nas provas 1, 3 e 4).

**Execução final**, toda ela depois da última edição de código (`avenly-services.css`, `2026-10-01T11:39:47Z`, `sha256` `ee92627fb661e99ad4c1796960d74245fce7312af5333c29ecc69a9c8a469b21`; `ServiceForm.tsx` `af2b99b056e72b06952c43e0bf920c547239451542ce1f04fa394d6e08813d31`). `npx tsc --noEmit` e `npm run lint` (`apps/frontend`): exit 0 nos dois. `npx vitest run` (`apps/frontend`): **132** arquivos, **1415** testes, todos verdes. `npm run validate:core`: exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`; dentro dele, `test:frontend` **132**/**1415**, `test:scheduling-service` **38** arquivos e **528** testes, `test:ai-orchestrator` **93** arquivos passando e **13** pulados, **1186** testes passando e **98** pulados. `npm run test:gate`: **233**/**233**. `npm run validate:ui`, duas corridas sem edição entre elas, exit 0 nas duas: **167** `passed`, **21** `skipped`, **2** `flaky` em cada uma, todos em rotas públicas que este Goal não toca e com causa de ambiente (`browserContext.newPage: Target crashed` e o axe estourando os 30 s): na primeira, `politica-de-privacidade` em 1440 e o autoteste de contraste em 1024; na segunda, o autoteste de contraste em 360 e `termos-de-uso` em 768.

**`validate:integration`**, com um cluster PostgreSQL 18 descartável próprio em `127.0.0.1:55434` (a porta `55432` estava ocupada por outro processo), criado vazio e em UTC: **36** passos, **26** `passed`, **1** `failed`, **9** `notRun`, exit 1. `test:bff-integration` passou com **63** arquivos e **474** testes. O passo que falhou é `test:scheduling-integration`: `4 failed | 139 passed (143)`, os quatro em `goal025-tenant-purge.test.ts`, com `23514` `new row for relation "AppointmentHold" violates check constraint "AppointmentHold_expiresAt_check"` em `seedTenant` (linha 241). Uma primeira corrida desta rodada foi descartada: o PostgreSQL caiu no meio por falta de memória do Windows (`could not reattach to shared memory … error code 1455`), com `test:bff-integration` falhando por `57P03`; o cluster foi recriado e a corrida acima é a segunda, completa.

**`test:scheduling-integration` na base `c483db3`**, a partir de um `git archive` de `c483db3` (`apps/scheduling-service`, `scripts`, com as dependências ligadas às da worktree), com os mesmos passos e o mesmo ambiente de `validate:integration`, no mesmo cluster:

- banco do Scheduling reaproveitado da corrida da head: `5 failed | 138 passed (143)`, os quatro de `goal025` com o mesmo `23514` e `goal008-agenda.test.ts` "completes what expired past the grace period…" com `expected { locked: true, completed: 2 } to match object { locked: true, completed: 1 }`;
- banco do Scheduling apagado e recriado por `provision:scheduling-test-database`: `4 failed | 139 passed (143)`, os mesmos quatro de `goal025` — **idêntico à head**.

`apps/scheduling-service` e `scripts/` são idênticos entre a head e `c483db3` (`git diff --quiet c483db3 HEAD -- apps/scheduling-service`). Causa: `goal025-tenant-purge.test.ts` fixa o atendimento em `2026-10-01T09:00Z` e o hold expira em `10:05Z`; a constraint exige `expiresAt > createdAt`, e o relógio da corrida (depois das `11:40Z` de 2026-10-01) já passou desse instante. O `completed: 2` de `goal008` aparece só com o banco reaproveitado, quando sobra um atendimento vencido de outro negócio que a varredura global conclui. **Falha anterior ao Goal, dependente do relógio, fora do diff.**

**Os 9 passos `notRun`, rodados à parte** na head, na ordem de `validate:integration`, com o mesmo ambiente e o mesmo cluster: `rehearse:goal029-timezone-reconciliation`, `rehearse:goal074-human-takeover-migration`, `generate:ai-orchestrator-prisma-client`, `test:ai-orchestrator-transport-durability` (**10** arquivos, **74** testes), `test:ai-orchestrator-content-purge` (**3** arquivos, **24** testes), `test:evolution-go-webhook-outbox`, `rehearse:goal030-mvp-journey`, `rehearse:goal032-auto-reply` e `rehearse:goal033-authenticated-ui`, exit 0 nos nove. O gate autenticado (`startTime` `2026-10-01T11:47:02.995Z`): `235 passed (6.9m)`, `expected` **235**, `unexpected` **0**, `flaky` **0**, `authenticated gate retries: 0 — every test passed on its first attempt`; são os **205** da base mais os **30** de G-4 e G-5. "servicos: a 45-minute service saves through the form" passou nas cinco larguras, sem mudança no teste.

**Quatro controles negativos**, depois da execução acima e da última edição de código, cada um por edição real num arquivo de produção, restaurado por cópia do original com o `sha256` conferido idêntico, e `git status --porcelain=v1 -uall` idêntico antes e depois dos quatro:

| Controle | Arquivo e `sha256` antes e depois | Defeito | Teste com o defeito |
| --- | --- | --- | --- |
| 1 | `AppShell.tsx`, `03452351882fdd703a8fdf10582d2cad01f5df27f4b0ac000e789e4bb6627c38` | `const hideTabBar = false;` | `Tests  4 failed \| 21 passed (25)`: prova 3 em `/clientes/detalhes`, `/servicos/editar`, `/configuracoes/negocio` e `/configuracoes/conversas` |
| 2 | `CustomerList.tsx`, `f5efc36d0e44f41d973b92998efb01ba39d8254c97b8aaed99ddcfa28165b1d3` | `useShellConfig` dentro de `CustomerListPanel` | `Tests  4 failed \| 21 passed (25)`: prova 1 em `/clientes/detalhes`, prova 3 "de 1024 px em diante, o detalhe mantém a casca completa", prova 4 "nas sete rotas, na faixa ≥1024" e prova 5 ≥1024 |
| 3 | `CustomerProfile.tsx`, `d1037a5d4358b6cb572d364127fbea96d3a07a6f86ede3e23b187043731e36b8` | `if (wide \|\| !wide) return profile;` | `Tests  2 failed \| 23 passed (25)`: prova 1 em `/clientes/detalhes` e prova 5 "busca a lista 1 vez(es)" |
| 4 | `CustomerProfile.tsx`, mesmo `sha256` | sem `if (!wide) return profile;` | `Tests  2 failed \| 23 passed (25)`: prova 3 em `/clientes/detalhes` e prova 5 "<1024 busca a lista 0 vez(es)" |

Restaurados os quatro: `Tests  25 passed (25)`.

**`visual:compare`**, depois da última edição de código, exit 0 nas duas chamadas. A porcentagem é tendência.

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| CL5 Cliente · resumo | 9,4 | 4,6 | 6,1 | 5,4 |
| S4 Serviço · opções | 9,7 | 8,7 | 14,2 | 8,7 |
| N1 Negócio | 8,2 | 3,8 | 5,9 | 5,1 |
| CL1 | 11,0 | 5,1 | 3,4 | 2,7 |
| CL4 | 5,8 | 2,6 | 6,5 | 5,0 |
| S1 | 8,8 | 5,3 | 3,9 | 2,9 |
| S3 | 7,0 | 7,5 | 13,4 | 7,7 |
| Agenda S1 | 9,7 | 8,9 | 14,4 | 8,8 |
| M1 | 7,6 | 3,1 | 5,9 | 5,1 |
| AG1 | 13,4 | 5,9 | 7,1 | 5,9 |
| IA1 | 13,6 | 6,3 | 7,3 | 6,0 |
| W1 | 9,1 | 4,3 | 6,6 | 5,5 |
| R1 | 13,5 | 8,1 | 9,5 | 8,2 |
| C1 (WhatsApp) | 10,6 | 4,4 | 5,6 | 4,9 |

Leitura dos `side-by-side.png`: no CL5 em paisagem, PRÓXIMO e PREFERÊNCIAS saem em Hanken Grotesk e "a cada" fica numa linha; no N1 mobile, só as linhas agrupadas, sem cartão de edição; no S4 (mobile e desktop), barra empurrada, linha-resumo, e abaixo dela os campos de nome, duração e preço abertos, com as linhas portadas abaixo da dobra. Com `ESSENTIALS_OPEN_ON_EDIT = false` (rodado só para conferir, e revertido antes da execução final), o S4 dava 11,0 / 8,6 / 14,7 / 9,2 % e o corpo coincidia com o quadro: linha-resumo, Recorrência com o valor em petróleo, steppers Antes e Depois, Instruções e Serviço ativo; o que restava era a lista de Serviços à esquerda (S1, outro Goal), o banner do WhatsApp e "Onde é feito". Pioras das telas irmãs em relação à rodada 2: AG1, IA1, W1, R1 e C1 em paisagem e desktop, porque essas subrotas passaram a abrir ao lado da lista de Configurações (de outro Goal, diferente da do protótipo), e AG1 e IA1 no mobile, porque a barra empurrada substituiu o cabeçalho de página e o conteúdo próprio (Goal 097) subiu sobre as linhas do quadro. S3 em retrato melhora (12,3 para 7,5) com as opções abertas.

**Divergências que restam, todas declaradas em D-103 ou de dado da conta:** banner e cartão do WhatsApp desconectado; `⋯` ausente sem ação secundária; "alterações não salvas" só com o formulário alterado; linha-resumo do S4 aberta por padrão (autorizada no [review088](reviews/088-review.md)) e sem "Onde é feito"; N1 com "Não informado" estático onde o contrato não tem o campo; `PrimaryGuardianPanel` no CL5; lista de Configurações, CL1 e S1 de outros Goals; dados do CL5 da conta de teste.

**Não feito:** a conferência do §7 do Goal (aparelho real).

## Os testes de integração do Scheduling não dependem da data do dia, do Goal098

`test:scheduling-integration` falhava em qualquer diff desde 2026-10-01 e parava `validate:integration` no passo 27 de 36, sem rodar os 9 seguintes (entre eles o gate autenticado). A causa era de teste, não de produto: fixtures com data absoluta que o banco ou o código comparam com o relógio. Este Goal só mexe em arquivos de teste de `apps/scheduling-service/tests/integration/`; nenhum arquivo de `src/`, `prisma/`, `scripts/` ou configuração mudou.

**Regra para fixture de teste de integração do Scheduling.** Uma data que o banco (`now()`, `@default(now())`, constraint) ou o código compara com o agora é calculada a partir de `Date.now()` no momento do teste, no fuso do negócio, com folga para a duração da suíte. O helper único é `tests/integration/support/test-date.ts`: `localDateAhead(daysAhead)` devolve a data civil de `America/Sao_Paulo` daqui a `daysAhead` dias, e `upcomingLocalSlot(daysAhead, startTime = "09:00")` devolve `{ date, startTime, startAt }`, com `startAt` no offset fixo `-03:00` do negócio. Data que não é comparada com o relógio (hora do dia em `1970-01-01`, janela de snapshot passada como entrada, datas comparadas só entre si) continua absoluta. `vi.setSystemTime` não resolve comparação feita pelo banco, porque o relógio do PostgreSQL não muda.

**O que mudou.** `goal025-tenant-purge.test.ts`: `seedTenant` usa `upcomingLocalSlot(7)` para o atendimento, o fim e a data da exceção de disponibilidade. `goal010-import.test.ts`: `contestedStartAt` vem de `contestedSlot = upcomingLocalSlot(7)`; o agendamento de origem, o `createAppointment` e o `runQueued` do teste de concorrência usam `contestedSlot.date`; as outras datas de agendamento viram `localDateAhead(8)`, `localDateAhead(10)` e `localDateAhead(11)`. `goal075-customer-appointments.integration.test.ts`: o agendamento "muito à frente" usa `upcomingLocalSlot(400, "15:30")` no lugar de `2030-03-10T18:30Z`, e a expectativa usa `farSlot.date`. `goal008-agenda.test.ts` não foi editado. Nenhum teste foi removido, pulado ou teve asserção afrouxada, e a regra (d) (limpeza ou asserção do goal008) não foi aplicada.

**Baseline recontada** em um checkout separado de `6cb6389` (`C:\tmp\atendly-g098-base`, fora da worktree, já removido), contra um cluster PostgreSQL 18 descartável próprio em `127.0.0.1:55981`, em UTC. A hora de cada corrida é a do fim do log. `validate:integration` terminou às `12:56Z`: **36** passos, **26** `passed`, **1** `failed`, **9** `notRun`, exit 1; `test:bff-integration` com **63** arquivos e **474** testes; `test:scheduling-integration` com `5 failed | 138 passed (143)`, os quatro de `goal025-tenant-purge.test.ts` e o de concorrência de `goal010-import.test.ts`. Quatro corridas só do Scheduling depois dessa (`12:57Z`, `13:03Z`, `13:04Z`, `13:04Z`) deram `8 failed | 135`, `5 failed | 138`, `6 failed | 137` e `5 failed | 138`. Esses números **divergem** dos da baseline do Goal, `4 failed | 139`, pelo goal010 e, em algumas corridas, pelo goal008, e a diferença é a das duas hipóteses abaixo. Na corrida de `12:57Z` apareceram ainda `goal062-customer-phone` e `service-catalog`, por violação de chave estrangeira (`AppointmentItem_tenantId_serviceId_fkey`) em `resetTenant`, com linhas sobrando de corridas anteriores; não reapareceram nas outras.

- **Hipótese do goal010: confirmada na causa, não no instante.** `contestedStartAt` era `2026-10-01T12:00:00.000Z` fixo. Em todas as corridas da baseline, todas depois de `12:00Z`, o teste "produces a single effect when the confirmation reaches the day lock first" falhou em `expect(confirmation.status).toBe("fulfilled")` com `rejected`. Com o horário relativo, o mesmo teste passa no mesmo relógio. **Não medido:** uma corrida da baseline antes de `12:00Z`, que mostraria o teste passando; nenhuma corrida desta sessão começou antes disso. A prova é que a falha some quando só o horário fixo sai, não que o limite seja exatamente `12:00Z`.
- **Hipótese do goal008: confirmada.** `completed: 2` contra `completed: 1` apareceu na baseline em duas das quatro corridas só do Scheduling. Reproduzi na árvore corrigida, voltando só o `seedTenant` do goal025 para a data antiga e rodando a suíte inteira duas vezes seguidas no mesmo banco: `4 failed | 139 passed` às `13:58:15Z` e `5 failed | 138 passed` às `13:58:35Z`, com a segunda falhando no goal008 por `expected { locked: true, completed: 2 } to match object { locked: true, completed: 1 }`. A origem é o goal025 falhar no meio e deixar atendimento vencido que a varredura global (`runAutoCompleteSweep`, todos os negócios) conclui. Com o goal025 verde, o `seedTenant` não falha e o goal008 não vê sobra; por isso a correção é na fixture do goal025, e o goal008 ficou como estava. Não isolei qual linha sobra.

**Datas absolutas que restam em `tests/integration/`, e por que não dependem do relógio:**

| Arquivo e linhas | Data | Motivo |
| --- | --- | --- |
| `goal010-import.test.ts` 51–53 e 109; `goal020-import-category-selection.test.ts` 29–31 e 51; `goal062-import-availability.test.ts` 49–51; `goal062-import-customers.test.ts` 32–34; `goal062-customer-phone.test.ts` 141–143 | `startDate` `2026-01-01`, `endDate` `2026-12-31`, `referenceDate` `2026-09-10` e `generatedAt` `2026-09-10T12:00Z` | Entrada de snapshot do importador; só são lidas como dado, nenhuma é comparada com o relógio |
| `goal061-import-async.test.ts` 83; `goal062-import-availability.test.ts` 108 | `generatedAt` `2026-09-27T12:00Z` | Idem |
| `goal062-import-customers.test.ts` 93 | `date: "2026-10-10"` no agendamento de origem de `appointmentWithCarla()` | Só referencia a cliente Carla; o teste confere a categoria `CUSTOMER` da prévia, e `ImportPreviewService` lê o relógio só para `generatedAt` |
| `goal008-agenda.test.ts` 649 | `timestamp '2026-09-10 12:00:00'` | Força o empate de `occurredAt` entre dois eventos do mesmo atendimento; só um é comparado com o outro |
| `goal075-customer-appointments.integration.test.ts` 250, 297, 299, 306 | `2026-01-01T12:00Z` e as datas derivadas (`2026-01-31`) | Atendimentos concluídos e falta, sempre no passado |
| `goal075-customer-appointments.integration.test.ts` 317–357 | `vi.setSystemTime(2026-06-15T02:00Z)` e os horários ao redor | Já existia antes do Goal e não compara nada com o `now()` do banco: passa com o banco no relógio real |

**Execução final**, toda ela depois da última edição de código (`goal010-import.test.ts`, `goal025-tenant-purge.test.ts`, `goal075-customer-appointments.integration.test.ts` e `support/test-date.ts`; os controles negativos abaixo restauraram os arquivos com o `sha256` idêntico).

- `npm run validate:core` (`13:08:22Z` a `13:11:05Z`, `VITEST_MAX_WORKERS=3`): exit 0, **17** passos, **15** `passed`, **2** `skipped`, **0** `failed`; `test:scheduling-service` **38** arquivos e **528** testes, `test:frontend` **132** e **1415**, `test:ai-orchestrator` **93** passando e **13** pulados, **1186** testes passando e **98** pulados. É a contagem da baseline.
- `npm run validate:integration` (`13:44:20Z` a `13:54:58Z`, banco `atendly_final14_test` recém-criado, `VITEST_MAX_WORKERS=1`): exit 0, **36** passos, **36** `passed`, **0** `failed`, **0** `notRun`. `test:bff-integration` **63** arquivos e **474** testes; `test:scheduling-integration` **18** arquivos e **143** testes; `test:ai-orchestrator-transport-durability` **10** e **74**; `test:ai-orchestrator-content-purge` **3** e **24**; o gate autenticado `235 passed`, **0** retentativas (`authenticated gate retries: 0 - every test passed on its first attempt`).
- `test:scheduling-integration` de novo no mesmo banco, sem reprovisionar (`13:55:22Z`): **18** arquivos e **143** testes, exit 0. Quatro corridas completas do mesmo comando no mesmo banco depois dos controles (`13:56:28Z`, `13:59:30Z`, `14:00:59Z`, `14:01:18Z`): **143**/**143** em todas.

**`VITEST_MAX_WORKERS`.** O Vitest 4 deixa essa variável sobrepor `fileParallelism: false`, que a configuração do Scheduling aplica quando `SCHEDULING_TEST_DATABASE_URL` está definida. Com `VITEST_MAX_WORKERS=2`, arquivos do Scheduling rodaram em paralelo no mesmo banco e falharam de modo intermitente; as corridas assim foram descartadas. Use `1` ou deixe sem a variável. O valor `1` foi usado na execução final por causa da memória, sem editar configuração.

**Falha de ambiente, não de código.** Antes da corrida de `13:44Z`, **13** execuções completas de `validate:integration`, sem nenhuma edição de código entre elas, falharam por exaustão de memória do Windows: **5** com `FATAL ERROR: Zone Allocation failed - process out of memory` no `next build` do gate autenticado (`next build failed with exit 1. The authenticated gate has no product to measure.`, com os outros 35 passos verdes), **3** com `JavaScript heap out of memory` em `test:bff-integration` (exit `3221226505`) e **5** com o PostgreSQL em `the database system is in recovery mode` (`57P03`), uma delas no meio de `test:scheduling-integration`. Medido no meio dessa sequência: memória comprometida `49,8` de `50,6` GB e pool não paginado de `13` GB. As 13 foram reexecutadas, nunca contornadas por edição de configuração.

**Controles negativos**, depois da última edição de código, cada um por edição real num arquivo de teste, restaurado pelo mesmo caminho com o `sha256` dos quatro arquivos idêntico ao de antes (`goal025-tenant-purge.test.ts` `af8c8e91eab09ea00771b0d8fa37ffa41c48b630ad1c3d17d7b65b118e4bbddf`, `goal010-import.test.ts` `15f8cb3976e1cf72c4463517c07d6006a9a931dbb0733626357d25f11e1ff1f3`, `goal075-customer-appointments.integration.test.ts` `37fd00e62c2fd68d248602bddba3b7caf6849689e7cf8df41c4f2e6aa7a1957d`, `support/test-date.ts` `9293929c511b4ea0b1d572769d6a4de4c79296d7d9e3e4bd403dcbd78c8b46d6`):

| Controle | Defeito | Resultado com o defeito | Restaurado |
| --- | --- | --- | --- |
| 1 | `seedTenant` do goal025 com `const start = new Date("2026-10-01T09:00:00.000Z")` (`14:00:48Z`) | `4 failed (4)`, todos com `Code: 23514 ... violates check constraint "AppointmentHold_expiresAt_check"` | `143`/`143` |
| 2 | `localDateAhead` devolvendo `Date.now() - 30 * DAY_MS` (`13:56:16Z`) | `7 failed \| 11 passed (18)` nos três arquivos que usam o helper: quatro de `goal025` com `23514`, dois de `goal010` (a importação sobre destino em uso e o de concorrência, `expected 'rejected' to be 'fulfilled'`) e um de `goal075` (`§6.2`, `expected null to deeply equal { date: '2026-09-01', ... }`) | `143`/`143` |
| 3 | Não se aplica: a regra (d) não mudou a limpeza de nenhum arquivo | — | — |

Um primeiro controle 1 com a data `2026-09-08T12:00:00.000Z` (`13:55:57Z`, `4 failed (4)`, `23514`) foi refeito com o valor literal do Goal.

**Não provado por este Goal:** que os testes unitários e os de outros serviços não tenham data que vá vencer; que a suíte passe perto da meia-noite de `America/Sao_Paulo`. O `-03:00` fixo do helper vale enquanto o Brasil não voltar ao horário de verão. O gate autenticado semeia o agendamento "na data de hoje" do relógio da corrida (`1 appointment(s) on 2026-10-01` na execução final); este Goal não tocou nesse ensaio.

## A moldura do onboarding igual ao protótipo e a medida G-6 do gate autenticado, do Goal089

A moldura única do onboarding (topo de progresso abaixo de 1024 px, sidebar com painel de 1024 px em diante, CTA ancorado, "Sair" no rodapé da sidebar) está em [D-104](DECISIONS.md), **ACCEPTED** no [review089](reviews/089-review.md). A medida nova entra no gate autenticado **só por acréscimo** no fim de `e2e/authenticated-matrix.spec.ts`. Nenhum teste existente, `e2e/routes.ts`, `playwright.*.config.ts`, semente, `scripts/`, `KNOWN_*` ou passo de `validate:*` mudou.

| O que decide agora | O que não decide |
| --- | --- |
| **G-6 (moldura do onboarding)**, em `/onboarding/segmento-e-nome` e `/onboarding/tom-da-ia`, com a conta parada no meio do onboarding (`onboardingTest`). Abaixo de 1024 px: sidebar não renderizada, barra de progresso renderizada, "Sair" com alvo de ao menos 24 px, botão principal inteiro dentro da janela ao abrir e último elemento focável acima das ações depois de rolar. De 1024 px em diante: nenhuma barra superior, sidebar com a altura da janela (1 px de tolerância), 340 px em 1024 e 420 px em 1440, coluna de 560 px e 600 px nas mesmas larguras. Duas rotas vezes cinco larguras, **10** testes | Que a moldura seja igual ao protótipo: isso é lido nos `side-by-side.png` |
| `goal089-onboarding-shell.test.tsx` (jsdom, **15** testes): prova 1 (nenhuma etapa tem barra superior; a marca só existe na sidebar e "Sair" não está num `header`), prova 2 (o preenchimento parcial do segmento atual cresce no capítulo), prova 3 (✓ no concluído, número no atual e no pendente), prova 4 (o eyebrow fica fora do `header` do título) e prova 5 ("Sair" tem um só nome acessível e faz logout nas duas molduras) | Layout: jsdom não tem layout |

**Contagem do gate autenticado:** **245** testes `expected` (**235** da base mais **10** de G-6), **0** `unexpected`, **0** `flaky`, **0** retentativas (`goal033:authenticated-ui-rehearsal authenticated gate retries: 0 - every test passed on its first attempt`; `startTime` `2026-10-01T17:17:20.422Z`). O orçamento de requisições do BFF comportou G-6 nas cinco larguras e nas duas rotas; nenhuma rota foi retirada nem largura cortada. O teste "onboarding-whatsapp › measured, logged in" passou nas cinco larguras: a barra de ações mede a largura do botão (o respiro do rodapé é margem, não padding, em `.onboarding-actions`), e "Conectar meu WhatsApp" fica em largura total na barra de 390 px.

**Execução final**, sem nenhuma edição de código depois dela (`OnboardingShell.tsx` `22c552e8f3da1d1f3bd3adb253f85541972bea49c0b6872e14c82173212aca4a`, `blocks.ts` `68c25db80703f2cf0e6cd39a8a603c6276a4db2dd2c79fc9cf0edfca6681c5db`, `avenly.css` `4073a423e0667f29762327cfe9845b7cb4376fc6ae516864077341fa56f3efe3`; os controles negativos restauraram os arquivos com o `sha256` idêntico e o `git status` igual). `npm run validate:core`: exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff` e `test:health-worker`), **0** `failed`; `test:frontend` **133** arquivos e **1430** testes. `npm run test:gate`: **233**/**233**. `npm run validate:ui`: exit 0, **169** `passed`, **21** `skipped`, **0** retentativas. `npm run validate:integration`: exit 0, **36** passos, **36** `passed`, **0** `failed`, **0** `notRun`; `test:bff-integration` **63** arquivos e **474** testes, `test:scheduling-integration` **18** e **143**, `test:ai-orchestrator-transport-durability` **10** e **74**, `test:ai-orchestrator-content-purge` **3** e **24**, e o gate autenticado nos **245** testes acima.

**Ambiente.** Neste Windows a memória comprometida ficou perto do limite, sem edição de configuração. `validate:ui` caiu duas vezes (Chromium com `Target crashed`, `ERR_INSUFFICIENT_RESOURCES`, 30 s do axe) com o número de workers padrão; com `CI=1` (que o `playwright.*.config.ts` já lê para usar 1 worker) passou na primeira vez, sem retentativa. `validate:integration` usou `CI=1`, `VITEST_MAX_WORKERS=1` e um cluster PostgreSQL 18 descartável em `127.0.0.1:55432` (UTC, receita da seção do Goal098). Três tentativas antes da corrida final não chegaram ao fim: uma sem `BFF_TEST_DATABASE_URL` (exit 2, `BFF_TEST_DATABASE_URL is not set`); uma com o postmaster travado pela memória (`could not reserve shared memory region ... error code 487`, `P1001`), o que levou a encerrar o processo e reiniciar o cluster; e uma corrida completa que parou em `test:scheduling-integration` com `1 failed | 142 passed (143)`, `goal008-agenda.test.ts` com `expected { locked: true, completed: 2 } to match object { locked: true, completed: 1 }`, sobre um banco do Scheduling que as corridas interrompidas anteriores deixaram com atendimento vencido, a mesma assinatura descrita no Goal098. A causa não foi investigada além dessa semelhança. A corrida seguinte, sem edição entre as duas, passou **36**/**36**.

**`visual:compare`**, depois da última edição de código, exit 0 em todas as chamadas. **Baseline** é a árvore de `27e1a59` (os nove arquivos de produção trocados pelos de `git show HEAD:` e restaurados por `sha256` conferido), renderizada nesta rodada para os 16 quadros; 1.3 e 4.6 foram renderizados de novo para medir a causa das duas pioras. A porcentagem é tendência; a leitura é a dos `side-by-side.png`. Cada célula: mobile 402 / tablet em retrato 768 / tablet em paisagem 1024 / desktop 1366.

| Quadro | Baseline | Final |
| --- | --- | --- |
| 0 Boas-vindas | 18,2 / 9,8 / 7,4 / 5,8 | 1,2 / 0,5 / 0,9 / 0,6 |
| 1.1 Segmento e nome | 8,8 / 10,0 / 10,1 / 7,8 | 0,6 / 0,6 / 1,0 / 1,2 |
| 2.1 Sistema atual | 8,6 / 4,1 / 4,9 / 3,7 | 2,4 / 0,8 / 0,9 / 0,8 |
| 3.2 Estilo da IA | 19,6 / 9,1 / 8,8 / 6,9 | 5,5 / 1,4 / 1,9 / 1,4 |
| 1.2 | 17,6 / 9,4 / 10,9 / 8,4 | 4,5 / 1,8 / 2,2 / 1,6 |
| 1.3 Endereço | 8,5 / 9,3 / 10,9 / 8,4 | **16,7** / 5,2 / 5,3 / 4,2 |
| 2.2 | 14,6 / 8,2 / 9,8 / 7,6 | 11,8 / 7,5 / 7,3 / 5,9 |
| 2.3 | 16,9 / 10,2 / 7,6 / 5,9 | 5,9 / 2,7 / 3,0 / 2,3 |
| 2.4 | 16,8 / 9,2 / 10,7 / 8,2 | 4,5 / 1,8 / 2,2 / 1,7 |
| 2.5 | 20,0 / 10,5 / 12,0 / 9,3 | 6,8 / 2,7 / 3,1 / 2,3 |
| 2.6 | 18,3 / 8,8 / 8,5 / 6,6 | 5,8 / 4,3 / 3,5 / 2,6 |
| 2.I1 Importação | 15,2 / 9,1 / 9,1 / 7,0 | 15,1 / 8,6 / 6,7 / 5,2 |
| 3.1 | 17,8 / 7,8 / 7,6 / 6,0 | 6,9 / 3,4 / 3,1 / 2,4 |
| 4.1 | 16,6 / 10,1 / 11,7 / 9,0 | 6,9 / 8,8 / 8,8 / 6,9 |
| 4.2 | 15,0 / 8,3 / 8,4 / 6,5 | 14,3 / 7,4 / 7,4 / 5,8 |
| 4.6 Introdução ao teste | 12,2 / 10,0 / 8,1 / 6,1 | **13,1** / 6,7 / 6,8 / 5,3 |

Dos 64 pares quadro e largura, **62** não pioram. **Duas pioras, as duas no mobile, com a causa medida nos `side-by-side.png` da baseline e da árvore final.**

1. **1.3 mobile, 8,5 para 16,7.** O quadro do protótipo mostra o teclado aberto, com o "Continuar" logo acima dele (y 532–584). Na baseline o CTA ficava no fim do conteúdo curto da etapa e por coincidência caía no mesmo lugar (y 529–581); com o CTA ancorado no rodapé da coluna ele fica em y 818–870, 290 px abaixo do que o quadro mostra. O resto do diff é o conteúdo do Goal090 (um campo "Endereço do seu espaço" no lugar de CEP, rua e complemento). É o caso de teclado aberto da conferência do §7, que não foi feita.
2. **4.6 mobile, 12,2 para 13,1.** Sem o cabeçalho da baseline (cerca de 175 px), o eyebrow e o título caem na posição do protótipo (H1 em y 206 nos dois), e a lista de quatro itens do app sobe de y 478–724 para y 370–614: sai de cima da lista de três itens do protótipo (y 510–629) e passa sobre o cartão de conversa, que o app não tem. O CTA do app são duas ações lado a lado (y 818–870); o do protótipo é um botão de largura total com a nota "Leva cerca de 3 minutos". Cartão, lista, texto e nota são o conteúdo do Goal090.

Nenhuma das duas é defeito da moldura.

**Divergências que restam nos quatro quadros-alvo**, todas declaradas em D-104: "Sair" (ícone à direita da barra abaixo de 1024 px, botão no rodapé da sidebar de 1024 px em diante), que o protótipo não tem; a barra de status do iPhone nos quadros mobile; o botão "Continuar" desabilitado em 1.1 e 3.2 na corrida do Developer (depende do que a conta do `visual:compare` já escolheu; na corrida do Tech Lead, no review089, saiu habilitado nos dois) e as frases de exemplo de 3.2, do template de `demo.ts` preenchido com o serviço da conta ("Corte feminino custa R$ 90,00. …", sem o "Olá!" do protótipo); o instante da animação em 0. Lido por quadro: **0** (1,2 / 0,5 / 0,9 / 0,6): marca, cena, título, descrição, CTA e a nota alinhados; sobram o ícone de "Sair" no canto superior direito do mobile e deslocamentos de cerca de 1 px na cena animada. **1.1** (0,6 / 0,6 / 1,0 / 1,2): sidebar de 340 px em paisagem e 420 px no desktop, com a marca em petróleo e o nome escuro, o stepper com o atual sobre `#EDF4F3`, a coluna de 560/600 px e o CTA no rodapé; sobram "Sair" na sidebar e o botão desabilitado. **2.1** (2,4 / 0,8 / 0,9 / 0,8): dois cartões de ação, o primeiro com o ícone `import` em petróleo; o mobile diverge no ícone "Sair" e em cerca de 1 px na posição vertical dos cartões. **3.2** (5,5 / 1,4 / 1,9 / 1,4): dois capítulos concluídos com ✓ e o terceiro atual; sobram "Sair", o botão desabilitado e as frases de exemplo, que mudam a quebra de linha dentro dos três cartões; no mobile essa diferença é a maior das quatro.

**Não feito:** a conferência do §7 do Goal (celular real com o teclado aberto em Segmento e nome, e rotação do tablet no meio de uma etapa). A prova de layout deste Goal é o gate renderizado (G-6, no Chromium do Playwright), o `visual:compare` e os `side-by-side.png`. Também não foi repetida nesta rodada a execução das provas 1 a 4 contra os arquivos de produção da baseline; a prova de que elas reprovam é a dos quatro controles negativos de [D-104](DECISIONS.md).

**Controles negativos** (§6 do Goal), feitos **depois da última edição de código**, cada um por edição real num arquivo de produção, restaurado por cópia do original no mesmo passo, com o `sha256` conferido idêntico e `git status --porcelain=v1 -uall` e o hash de todos os arquivos alterados iguais antes e depois dos cinco:

| Controle | Arquivo e `sha256` antes e depois | Defeito | Teste com o defeito |
| --- | --- | --- | --- |
| 1 | `OnboardingShell.tsx`, `22c552e8f3da1d1f3bd3adb253f85541972bea49c0b6872e14c82173212aca4a` | `<header className="onboarding-topbar"><Brand href="/onboarding" /></header>` de volta no topo da coluna | `Tests  5 failed \| 10 passed (15)`: prova 1 em `boas-vindas`, `tom-da-ia`, `segmento-e-nome`, `modalidade` e `whatsapp-conectar` |
| 2a | `blocks.ts`, `68c25db80703f2cf0e6cd39a8a603c6276a4db2dd2c79fc9cf0edfca6681c5db` | preenchimento do segmento atual fixo em 0 (`status === "current" ? 0 : 0`) | `Tests  2 failed \| 13 passed (15)`: prova 2, "quatro itens, o atual com preenchimento parcial que cresce" e "tom-da-ia: os dois primeiros concluídos e o terceiro é o atual" |
| 2b | `blocks.ts`, mesmo `sha256` | preenchimento fixo em 100 % (`status === "current" ? 1 : 0`) | `Tests  2 failed \| 13 passed (15)`: os mesmos dois testes da prova 2 |
| 3 | `OnboardingShell.tsx`, mesmo `sha256` | `{index + 1}` no lugar do ✓ no concluído | `Tests  1 failed \| 14 passed (15)`: prova 3, "tom-da-ia: ✓ no concluído, número no atual e no pendente" |
| 4 | `OnboardingShell.tsx`, mesmo `sha256` | `<p className="onboarding-eyebrow">{eyebrow}</p>` de volta dentro do `header` do título | `Tests  2 failed \| 13 passed (15)`: prova 4 em `segmento-e-nome` e `tom-da-ia` |

Restaurados os cinco: `Tests  15 passed (15)`.

## As etapas de negócio e agenda iguais ao protótipo, do Goal090

O conteúdo das sete etapas dos quadros 1.2, 1.3, 2.2, 2.3, 2.4, 2.5 e 2.6 está em [D-105](DECISIONS.md), **ACCEPTED** no [review090](reviews/090-review.md). O Goal não mudou o gate autenticado: nenhum teste de `e2e/` foi acrescentado ou removido, `e2e/routes.ts` só trocou dois `contentMarker` (os títulos de `servico-nome` e `servicos-adicionais`), e nenhum `KNOWN_*`, `playwright.*.config.ts`, configuração de vitest ou de next e passo de `validate:*` mudou.

**Execução final (rodada 3)**, depois da última edição de código: a rodada 3 pôs `data-error-anchor` na caixa `div.price-value-field` de `blocks/schedule.tsx`, de modo que a mensagem de erro do preço entra depois da caixa (em 2.3 e no formulário de adicional de 2.4, que usam o mesmo `ServiceFields`) e não dentro dela, e acrescentou duas asserções em `tests/goal065-onboarding-schedule.test.tsx`. Essa edição é anterior a 21:17:16Z, início de `validate:core`; nenhuma edição de código veio depois (os controles abaixo restauram o arquivo por cópia, com o `sha256` conferido). `sha256` finais, conferidos depois de todas as execuções e dos controles: `scenarios.ts` `3b9cf274ad248410dbc0563bc7f347cb6e578bb9573d5e0cc68696c0e2a9b75c`, `OnboardingScreen.tsx` `957b9c0b057fd5ff787446aae08a0673b7f83e86fe02163affb10d9456e35e8a`, `blocks/business.tsx` `3851ad39bcb38c7d25899aaa0ca68306ebf2eb53080b4d4cedea00f052312385`, `blocks/schedule.tsx` `04ba12a04769c9c007f96d248f625920d3449f0d5b218c34e2f6beb4c54e5fd3`, `blocks/shared.tsx` `8b3f47df93047959f8a68ce011dd471e4bc6877761f791f1af4b76696c341b22`, `shared/ui/CurrencyInput.tsx` `f1609a1ec583858f88c712841561834e53eb893909b0f063012badcc953a81e3` e `avenly.css` `498a62452317b51d62db35cd2d32fc37d831d4d5b845b36e42b50d0da51d9e8f`. Todas em 2026-10-01, horários em UTC:

| Execução | Início e fim | Resultado |
| --- | --- | --- |
| `npm run validate:core` (inclui `test:frontend`) | início 21:17:16Z | exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff` e `test:health-worker`), **0** `failed`, **0** `notRun`; `test:frontend`: **134** arquivos, **1453** testes |
| `npm run test:gate` | depois de `validate:core` | exit 0, `tests 233`, `pass 233`, `fail 0` |
| `npm run typecheck` e `npm run lint` em `apps/frontend` | depois de `validate:core` | exit 0 e exit 0, sem aviso (`--max-warnings=0`) |
| `CI=1 npm run validate:ui` | início 21:19:25Z | exit 0, **169** `passed`, **21** `skipped`, `validate:ui public UI gate retries: 0 — every test passed on its first attempt` |
| `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test npm run validate:integration` (inclui o passo `rehearse:goal033-authenticated-ui`, o gate autenticado) | início 21:23:15Z, fim 21:32:12Z; `stats.startTime` do gate autenticado 21:25:17Z, duração 415 s | exit 0, **36** passos, **36** `passed`, **0** `failed`, **0** `skipped`, **0** `notRun`; gate autenticado **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`; `authenticated gate retries: 0` |
| Os quatro controles negativos do §6 | depois de 21:32:12Z | quatro reprovações e restauração conferida, abaixo |
| `npm run visual:compare` com os 15 quadros (0, 1.1, 1.2, 1.3, 2.1 a 2.6, 3.1, 3.2, 4.1, 4.2 e 4.6) nos quatro aparelhos | 21:33:37Z a 21:35:55Z | exit 0, 60 pares quadro e largura |

O `validate:integration` aprovado e o `results.json` do gate autenticado são **posteriores** à última edição de código. As execuções da rodada 2 (20:34Z em diante) deixaram de valer: são anteriores à edição da rodada 3.

O `validate:ui` rodou com `CI=1` (1 worker, o que o `playwright.*.config.ts` já lê), como no Goal089. A contagem de arquivos e testes do `vitest run` (**134** e **1453**) é a do passo `test:frontend` de `validate:core`; contra os **133** e **1430** do Goal089 há um arquivo e 23 testes a mais, dos quais **22** são do arquivo novo `goal090-onboarding-steps.test.tsx`; o teste restante vem de ajustes em testes existentes e não foi decomposto.

**`visual:compare`**, execução final acima (as células da rodada 3 saíram idênticas às da rodada 2), contra os números finais do Goal089 (a coluna "Início" é a coluna "Final" da tabela do Goal089 acima neste documento, **copiada, não remedida** nesta rodada; a recontagem de início do Goal090 não foi encontrada). A porcentagem é tendência; a leitura é a dos `side-by-side.png`. Cada célula: mobile 402 / tablet em retrato 768 / tablet em paisagem 1024 / desktop 1366.

| Quadro | Início (Goal089 final) | Final (Goal090) |
| --- | --- | --- |
| 0 Boas-vindas | 1,2 / 0,5 / 0,9 / 0,6 | 1,2 / 0,5 / 0,9 / 0,6 |
| 1.1 Segmento e nome | 0,6 / 0,6 / 1,0 / 1,2 | 0,6 / 0,6 / 1,0 / 1,2 |
| 1.2 Modalidade | 4,5 / 1,8 / 2,2 / 1,6 | 0,6 / 0,2 / 0,7 / 0,4 |
| 1.3 Endereço | 16,7 / 5,2 / 5,3 / 4,2 | 14,8 / 4,4 / 4,6 / 3,7 |
| 2.1 Sistema atual | 2,4 / 0,8 / 0,9 / 0,8 | 2,4 / 0,8 / 0,9 / 0,8 |
| 2.2 Importar agora ou depois | 11,8 / 7,5 / 7,3 / 5,9 | 1,1 / 0,4 / 0,7 / 0,7 |
| 2.3 Primeiro serviço | 5,9 / 2,7 / 3,0 / 2,3 | 2,1 / 0,6 / 1,0 / 0,5 |
| 2.4 Seus serviços | 4,5 / 1,8 / 2,2 / 1,7 | 2,9 / 1,3 / 1,7 / 1,3 |
| 2.5 Dias de atendimento | 6,8 / 2,7 / 3,1 / 2,3 | 1,2 / 0,5 / 1,0 / 0,8 |
| 2.6 Horário-base | 5,8 / 4,3 / 3,5 / 2,6 | 3,3 / 2,4 / 1,7 / 1,4 |
| 3.1 Demonstração da IA | 6,9 / 3,4 / 3,1 / 2,4 | 6,9 / 3,4 / 3,1 / 2,4 |
| 3.2 Estilo da IA | 5,5 / 1,4 / 1,9 / 1,4 | 5,5 / 1,4 / 1,9 / 1,4 |
| 4.1 Introdução WhatsApp | 6,9 / 8,8 / 8,8 / 6,9 | 6,9 / 8,8 / 8,8 / 6,9 |
| 4.2 Consentimento | 14,3 / 7,4 / 7,4 / 5,8 | 14,3 / 7,4 / **7,5** / 5,8 |
| 4.6 Introdução ao teste | 13,1 / 6,7 / 6,8 / 5,3 | 13,1 / 6,7 / 6,8 / 5,3 |

Dos 60 pares, **0**, **1.1**, **2.1** e **3.2** (16 pares) ficam **iguais** aos do Goal089 em todas as células; os 28 pares de 1.2, 1.3, 2.2, 2.3, 2.4, 2.5 e 2.6 **melhoram**, todos; 3.1, 4.1 e 4.6 ficam iguais; um par **piora**: 4.2 em paisagem, 7,4 para 7,5 (+0,1). Esse 4.2 é estável (7,5 na primeira corrida depois do código das etapas, na final e numa repetição isolada), a causa **não foi medida**, e o quadro 4.2 está fora da lista de etapas do Goal; fica declarado, sem causa afirmada.

**Uma piora corrigida no meio do caminho (1.1).** Na primeira corrida de `visual:compare` depois do código das sete etapas (2026-10-01T20:03:13Z), 1.1 saiu **4,1 / 1,9 / 2,2 / 1,7**, contra 0,6 / 0,6 / 1,0 / 1,2 do Goal089. Causa medida: `.onboarding-form .field` (especificidade 0,2,0), declarada depois no `avenly.css`, sobrescrevia `[data-step="segmento-e-nome"] .field` (também 0,2,0) e `.field:last-child`; com um override temporário dos dois seletores, 1.1 mobile caiu para 0,7 % (corrida isolada de 1.1 mobile, 20:09Z). A correção definitiva sobe a especificidade dos seletores de 1.1 para `[data-step="segmento-e-nome"] .onboarding-form .field` e `.field:last-child`, e a execução final acima devolve 1.1 aos números do Goal089.

**Leitura dos `side-by-side.png`** (protótipo | app | diferenças), por quadro, nos quatro aparelhos, das execuções finais. Em todos, o vermelho do diff em bordas de texto, chevron e ícones é anti-aliasing, e "Sair" (ícone no mobile e no tablet em retrato; botão no rodapé da sidebar de 1024 px em diante) não existe no protótipo.

- **1.2 Modalidade** (0,6 / 0,2 / 0,7 / 0,4). Mesma estrutura nos quatro: eyebrow "SEU NEGÓCIO", H1 "Onde você atende?", três cartões com "Local próprio" selecionado e o CTA no rodapé. Sobram "Sair" e anti-aliasing.
- **1.3 Endereço** (14,8 / 4,4 / 4,6 / 3,7). O app tem um campo "Endereço do seu espaço"; o quadro tem CEP, "Rua e número" e "Complemento" (divergência declarada). No mobile o quadro mostra o teclado aberto, com o CTA em y 428–479, e o do app fica ancorado em y 714–765: isso explica os 14,8 %. Nos outros três aparelhos o CTA do app fica 22 px acima do quadro (topo do botão em y 940 contra 962 no tablet em retrato; 684 contra 706 no tablet em paisagem e no desktop), porque o rodapé do quadro 1.3 é `padding:10px 20px 10px` e o das outras sete etapas do arquivo é `12px 20px 32px`; é a divergência 4 de D-105, não foi alinhada. O resto é o campo único e "Sair".
- **2.2 Importar agora ou depois** (1,1 / 0,4 / 0,7 / 0,7). As barras do cartão "Minha Agenda" saem #EFEAE2 e as do "Avenly" #DCECEB, como no quadro (rodada 2). Ilustração "MINHA AGENDA → UMA VEZ → AVENLY", "Importar agora" acima de "Fazer depois" e a nota; as posições batem em 1024 e 1366. No desktop o quadro diz "Configurações › Importação" na nota, e o app, "Mais › Importação", como os quadros mobile e tablet em retrato.
- **2.3 Primeiro serviço** (2,1 / 0,6 / 1,0 / 0,5). Nome, duração com o stepper (− 45 min +) e os atalhos 30/60/90, preço em controle segmentado (Fixo, A partir de, Sob consulta, Sem preço), o campo com o prefixo "R$" como adorno em #716859 a 8 px de "90,00" (rodada 2) e o CTA "Salvar serviço"; alinhado a 1–2 px. Sobram "Sair" e os dados da conta.
- **2.4 Seus serviços** (2,9 / 1,3 / 1,7 / 1,3). O app tem uma linha (rascunho "Corte feminino · 45 min · R$ 90"); o quadro tem três, com lápis. O botão tracejado "Adicionar outro serviço" e a nota alinham. Sobram os dados da conta, o lápis (declarado) e "Sair".
- **2.5 Dias de atendimento** (1,2 / 0,5 / 1,0 / 0,8). Chips de Seg a Sáb marcados, Dom desmarcado e o resumo "Segunda a sábado · 6 dias por semana", alinhados nos quatro aparelhos. Sobram anti-aliasing e "Sair".
- **2.6 Horário-base** (3,3 / 2,4 / 1,7 / 1,4). Os cartões Começa/Termina e "Personalizar dias diferentes" têm a altura do quadro (84 e 68 px; rodada 2). As marcas da régua usam #716859 e não o #948B80 do quadro, por contraste (desvio 10 de D-105). H1, descrição "Vale para segunda a sábado. Pausas e bloqueios você configura depois.", cartões "Começa" e "Termina", régua de 0h a 24h com cinco marcas e o cartão "Personalizar dias diferentes". O app mostra "09:00 AM" e "06:00 PM" (locale do harness, medido abaixo) e o painel já aberto, com as linhas "Segunda · Início/Fim", "Terça · …" (no retrato o CTA ancorado cobre a lista); o quadro tem o cartão recolhido, com a seta. É o maior resto da série e tem essas duas causas, ambas declaradas em D-105.

**Ambiente.** (1) O `visual:compare` abre o Chromium com `locale: "pt-BR"` no contexto, sem `--lang`; num script à parte, o `<input type="time">` nativo mostrou `AM/PM` nesse modo e `18:00` com `--lang=pt-BR` na abertura do navegador. Por isso 2.6 mostra "09:00 AM" no app; não foi mudado o script, que fica fora do escopo. (2) Corridas seguidas de `visual:compare` batem no limite de tentativas de login da conta visual: uma repetição de 4.2 respondeu `login da conta visual respondeu 429` (`RATE_LIMITED`, "Muitas tentativas. Aguarde alguns minutos e tente novamente."); não foi repetida, e a corrida final acima não foi afetada.

**Controles negativos** (§6 do Goal), feitos na rodada 3 **depois da última edição de código**, cada um por edição real num arquivo de produção, restaurado por cópia do original no mesmo passo, com o `sha256` conferido idêntico (saída real de `npx vitest run tests/goal090-onboarding-steps.test.tsx`):

| Controle | Arquivo e `sha256` antes e depois | Defeito | Teste com o defeito |
| --- | --- | --- | --- |
| 1 | `scenarios.ts`, `3b9cf274ad248410dbc0563bc7f347cb6e578bb9573d5e0cc68696c0e2a9b75c` | eyebrow de `servico-nome` de volta para "Primeiro serviço" | `Tests  1 failed \| 21 passed (22)`: prova 1, `'servico-nome': eyebrow "'Sua agenda'"` |
| 2 | `OnboardingScreen.tsx`, `957b9c0b057fd5ff787446aae08a0673b7f83e86fe02163affb10d9456e35e8a` | "Fazer depois" antes de "Importar agora" | `Tests  1 failed \| 21 passed (22)`: prova 2, "a ordem do DOM é Importar agora, Fazer depois, nota" |
| 3 | `blocks/schedule.tsx`, `04ba12a04769c9c007f96d248f625920d3449f0d5b218c34e2f6beb4c54e5fd3` | `draft.serviceName.trim() === ""` trocado por `true` (o serviço do rascunho sai da lista) | `Tests  2 failed \| 20 passed (22)`: prova 3, "ordem: rascunho primeiro, depois os adicionais, …" e "sem preço informado aparece como texto discreto, …" |
| 4 | `blocks/schedule.tsx`, mesmo `sha256` do controle 3 | `hoursStepDescription` devolve sempre "Vale para segunda a sábado. Pausas e bloqueios você configura depois." | `Tests  1 failed \| 21 passed (22)`: prova 5, `dias [1,3,5]`: "Vale para segunda, quarta e sexta." |

Restaurados os quatro: `Tests  22 passed (22)`; o `sha256` de cada arquivo conferido idêntico ao de antes do controle. O defeito do blocker 1 da rodada 3 (erro de preço dentro da caixa) tem prova própria: sem o `data-error-anchor` de `div.price-value-field`, `Tests  2 failed | 35 passed (37)` em `tests/goal065-onboarding-schedule.test.tsx` ("envio vazio mostra os erros de nome e valor juntos…" e "Adicionar com o formulário vazio mostra os erros no campo…"); restaurado, `37 passed (37)`, `sha256` de `blocks/schedule.tsx` idêntico.

**Não feito.**

- A conferência do §7 do Goal (celular real com o teclado aberto em Endereço e em Primeiro serviço, com o CTA ancorado; legibilidade da régua de horas e do resumo de dias). A prova de layout deste Goal é o `visual:compare` e a leitura dos `side-by-side.png`; jsdom não tem layout.
- A recontagem de início do Goal090 (WU-01) não foi encontrada; a coluna "Início" da tabela de `visual:compare` é a do Goal089, copiada.
- Execuções anteriores à edição da rodada 3 (as das rodadas 1 e 2 e as das WUs do IA Loop) não são citadas como contagem: valem para uma árvore que já não é a final. Os quatro controles negativos foram refeitos na rodada 3, depois da última edição de código.

**Aceite (review090, rodada 4).** O Tech Lead rodou `visual:compare` dos sete quadros nas rodadas 2, 3 e 4, exit 0, com células iguais às da tabela acima, e abriu os `side-by-side.png`. Na rodada 3 conferiu em disco `apps/frontend/e2e-results/authenticated/results.json` (`startTime` 21:25:17Z): **245** `expected`, **0** `unexpected`, **0** `flaky`; a WU-11 do IA Loop foi `SKIPPED` por falta de banco nessa rodada. Na rodada 4, os oito gates do IA Loop passaram, e os `sha256` dos sete arquivos de produção são os listados acima. Os controles negativos foram conferidos por este registro e pelos `sha256`, não reexecutados pelo Tech Lead.

## As etapas de IA e WhatsApp iguais ao protótipo, do Goal099

O conteúdo das etapas dos quadros 3.1, 4.1, 4.2 e 4.6 está em [D-106](DECISIONS.md), **ACCEPTED** no [review099](reviews/099-review.md). O Goal não mudou o gate autenticado: nenhum teste de `e2e/` foi acrescentado ou removido, `e2e/routes.ts` só trocou um `contentMarker` (o título de `whatsapp`, com o ponto final), e nenhum `KNOWN_*`, `playwright.*.config.ts`, configuração de vitest ou de next e passo de `validate:*` mudou.

**Execução final (rodada 4 do IA Loop, FIX-001, sobre a árvore da rodada 3)**, depois da última edição de código. A rodada 2 corrigiu o rodapé do 4.6 (um CTA primário) e a descrição do 4.6 (15 px, 1,45) e acrescentou o teste `goal099-onboarding-ia-whatsapp.test.tsx`. A rodada 3 fez a última edição de código: `.onboarding-demo-event > span` em `avenly.css` deixou de ter `white-space: nowrap` e ganhou `min-width: 0` e `text-align: center` (mtime do arquivo 2026-10-02T00:01:38Z; ver D-106 (h)). As execuções da rodada 2 (`avenly.css` `ed7331a4…19e2981c`, 2026-10-01 de 23:18Z a 23:37Z) valiam para uma árvore que já não é a final e **não** são citadas como contagem. Todas as execuções abaixo e os controles rodaram na rodada 4, depois daquela edição, e nenhum arquivo de código foi editado depois: o `sha256` de cada arquivo, conferido depois dos controles, é o listado, e os controles restauram o arquivo por cópia com o `sha256` conferido. `sha256` finais (8 primeiros e 8 últimos dígitos): `ActivationTestPanels.tsx` `e862b7ed…6da485e5`, `OnboardingScreen.tsx` `b47e537b…d75e5ca1`, `blocks/activation-test.tsx` `ad8ce0e9…bb396c96`, `blocks/ai.tsx` `d5e7d771…a9284afd`, `blocks/shared.tsx` `ef37e156…e4a7da35`, `blocks/whatsapp.tsx` `ab83ae2a…7799d238`, `demo.ts` `c2c3e913…67402b39`, `scenarios.ts` `5a2fe74b…3f012203`, `WhatsAppConnectionPanel.tsx` `f622198e…bdf699db`, `avenly.css` `27eeaa08…5dd5b42f`, e o teste novo `c6bb0107…208e6e68`. Os horários são UTC, de 2026-10-02; a última edição de código (`avenly.css`, 00:01:38Z) é anterior a todas as execuções abaixo.

| Execução | Início e fim | Resultado |
| --- | --- | --- |
| `npm run typecheck` e `npm run lint` em `apps/frontend`, e `vitest run tests/goal099-onboarding-ia-whatsapp.test.tsx` | 00:13:44Z a 00:14:03Z | exit 0 e exit 0 (sem aviso, `--max-warnings=0`); **12**/**12** testes |
| `npm run validate:core` (inclui `test:frontend`) | 00:14:05Z a 00:15:41Z | exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff` e `test:health-worker`), **0** `failed`; `test:frontend`: **135** arquivos, **1466** testes |
| `npm run test:gate` | 00:15:41Z a 00:15:43Z | exit 0, `tests 233`, `pass 233`, `fail 0` |
| `npm run validate:ui` | 00:15:43Z a 00:16:32Z | exit 0, **169** `passed`, **21** `skipped`, `validate:ui public UI gate retries: 0 — every test passed on its first attempt` |
| `BFF_TEST_DATABASE_URL=postgresql://bff_test@127.0.0.1:55098/atendly_bff_test npm run validate:integration` (inclui o passo `rehearse:goal033-authenticated-ui`, o gate autenticado) | 00:16:32Z a 00:25:43Z; `stats.startTime` do gate autenticado 00:18:41.116Z (`duration` 421983 ms) | exit 0, `validate:integration PASSED against 127.0.0.1:55098/atendly_bff_test`, **36**/**36** passos, **0** `failed`; gate autenticado **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`; `authenticated gate retries: 0 — every test passed on its first attempt` |
| `npm run visual:compare -- --target 3.1,4.1,4.2,4.6` (quatro aparelhos) | depois do `validate:integration` | exit 0, 16 pares quadro e largura |
| `npm run visual:compare -- --target 0,1.1,1.2,1.3,2.1,2.2,2.3,2.4,2.5,2.6,3.2,W1,IA1` (quatro aparelhos) | depois do `validate:integration` | exit 0, 52 pares quadro e largura |
| Os cinco controles negativos do §6 | depois das execuções acima, até 00:30Z | cinco reprovações e restauração conferida, abaixo; restaurado, `Tests  12 passed (12)` às 00:30Z |

O `validate:integration` aprovado e o `results.json` do gate autenticado (`startTime` 00:18:41.116Z) são **posteriores** à última edição de código (00:01:38Z) e são a execução final: eles substituem os da rodada 2, que valiam para o `avenly.css` anterior. O banco é um Postgres 18.4 nativo, recém-criado na rodada 4, em `127.0.0.1:55098`, descartável (`atendly_bff_test`, usuário `bff_test`, autenticação `trust` em loopback, `timezone=UTC`), com o diretório de dados em `%LOCALAPPDATA%\Temp`, fora do repositório, e parado depois da execução. É o mesmo tipo de banco da rodada 2: um Postgres em contêiner Docker foi reprovado pela própria suíte na rodada 2 (`Connected server port 5432 is not the declared test port`, depois `Connected server address 172.17.0.3 is not loopback`), porque a checagem exige porta e endereço de servidor em loopback. Nenhuma configuração foi mudada. O `validate:core` desta rodada rodou sem `BFF_TEST_DATABASE_URL` (como na rodada 2), por isso `test:bff` e `test:health-worker` aparecem `skipped`.

O `validate:ui` rodou sem `CI=1` (6 workers, o padrão do `playwright.config.ts`; os Goals 089 e 090 o rodaram com `CI=1`). A contagem do `vitest run` (**135** arquivos e **1466** testes) é a do passo `test:frontend` de `validate:core`; contra os **134** e **1453** do Goal090 há um arquivo e 13 testes a mais, dos quais **12** são do arquivo novo `goal099-onboarding-ia-whatsapp.test.tsx`; o teste restante vem de ajustes em testes existentes e não foi decomposto.

**`visual:compare`**, os quatro quadros do Goal nos quatro aparelhos, contra o início (a coluna "Início" é a coluna "Final" da tabela do Goal090 acima neste documento, **copiada, não remedida**, com duas conferências remedidas na rodada 2: 4.1 no mobile saiu 6,9 com os dez arquivos de produção trocados pelos de `HEAD`, e W1 e IA1, medidos do mesmo modo, saíram idênticos aos do final). A porcentagem é tendência; a leitura é a dos `side-by-side.png`. Cada célula: mobile 402 / tablet em retrato 768 / tablet em paisagem 1024 / desktop 1366. A coluna "Final" foi **remedida na rodada 4**, sobre a árvore final (`avenly.css` `27eeaa08…5dd5b42f`), e saiu igual à tabela, célula por célula; os vizinhos e W1 e IA1, também remedidos na rodada 4, saíram iguais ao texto abaixo.

| Quadro | Início (Goal090 final) | Final (Goal099) |
| --- | --- | --- |
| 3.1 Demonstração da IA | 6,9 / 3,4 / 3,1 / 2,4 | 4,6 / 2,6 / 2,4 / 2,0 |
| 4.1 Introdução WhatsApp | 6,9 / 8,8 / 8,8 / 6,9 | 1,3 / 1,4 / 1,3 / 1,4 |
| 4.2 Consentimento | 14,3 / 7,4 / 7,5 / 5,8 | 8,9 / 5,1 / 5,3 / 3,9 |
| 4.6 Introdução ao teste | 13,1 / 6,7 / 6,8 / 5,3 | 5,4 / 2,3 / 2,7 / 1,9 |

Nenhuma das 16 células piorou. A "Início" do 4.2 em paisagem é 7,5 (a célula do Goal090 que subiu 0,1, declarada em D-105). Os vizinhos, medidos de novo ao fim com o comando acima, ficam iguais ao final do Goal090, célula por célula: 0 (1,2 / 0,5 / 0,9 / 0,6), 1.1 (0,6 / 0,6 / 1,0 / 1,2), 1.2 (0,6 / 0,2 / 0,7 / 0,4), 1.3 (14,8 / 4,4 / 4,6 / 3,7), 2.1 (2,4 / 0,8 / 0,9 / 0,8), 2.2 (1,1 / 0,4 / 0,7 / 0,7), 2.3 (2,1 / 0,6 / 1,0 / 0,5), 2.4 (2,9 / 1,3 / 1,7 / 1,3), 2.5 (1,2 / 0,5 / 1,0 / 0,8), 2.6 (3,3 / 2,4 / 1,7 / 1,4) e 3.2 (5,5 / 1,4 / 1,9 / 1,4).

**Configurações › WhatsApp (W1) e Configurações › IA (IA1), início e fim.** O início foi medido com `npm run visual:compare -- --target W1,IA1` depois de trocar os dez arquivos de produção pelos de `HEAD` (cópia de segurança e restauração por `sha256`); o fim, com o comando dos quatro quadros e com o dos vizinhos. As duas telas ficam **iguais** nas três medidas.

| Tela | Início (baseline medida) | Fim |
| --- | --- | --- |
| W1 Configurações › WhatsApp | 9,1 / 4,3 / 6,6 / 5,5 | 9,1 / 4,3 / 6,6 / 5,5 |
| IA1 Configurações › IA | 13,6 / 6,3 / 7,3 / 6,0 | 13,6 / 6,3 / 7,3 / 6,0 |

**Leitura dos `side-by-side.png` do fim**, só o que resta de diferença:

- **3.1.** Seis trocas, rótulo "sua IA", três eventos com ícone e o rodapé como o quadro. Restam a redação das frases (o app diz "Quanto custa Corte feminino?" e "Corte feminino custa R$ 90,00. Leva 45 min."; o quadro diz "Quanto tá o corte feminino?" e "O corte feminino é R$ 90 e leva 45 min."), os horários e a data da conta de teste, "Tem horário na sexta?" no lugar de "Tem sexta à tarde?", e o instante da animação. O texto de cada evento quebra em linhas e fica centralizado quando é longo, em vez de correr numa linha só como no quadro (D-106 (h) e divergência 8); no mobile, o evento "Agenda consultada" aparece inteiro dentro da largura. Em D-106, divergência 4.
- **4.1.** Título, ausência de descrição, quatro promessas e rodapé empilhado como o quadro; sobra só o "Sair" e o que é do navegador.
- **4.2.** Título, cartão, pergunta e rodapé coincidem; o quadro está com o checkbox marcado, "Sim, também" escolhido, o bloco "Tudo bem" aberto e "Continuar" habilitado, e o app abre desmarcado, sem resposta e com "Continuar" desabilitado (D-081). É a maior diferença do Goal e vem do estado, não do layout. O link "Saiba mais" do cartão aparece sublinhado no app nos quatro aparelhos e sem sublinhado no quadro (D-106, divergência 9).
- **4.6.** Título, descrição (15 px, mesmas linhas no mobile), prévia, três itens e o CTA "Iniciar teste" em largura total, sem outro CTA primário. Restam: o aviso do orquestrador mais longo (quatro linhas contra duas), que empurra os itens para baixo; a pergunta neutra no lugar do serviço do quadro; o terceiro item com "e sua IA é ativada"; e "Fazer isso depois" discreto no lugar da nota "Leva cerca de 3 minutos.".
- Em todos: "Sair" (D-104 (e)) e a barra de status do iPhone nos quadros mobile.

**Controles negativos do §6**, rodados de novo na rodada 4, depois da última edição de código (`avenly.css`, 00:01:38Z) e depois das execuções finais acima, cada um por edição real de um arquivo de produção, rodando `vitest run tests/goal099-onboarding-ia-whatsapp.test.tsx`, com o arquivo restaurado por cópia e o `sha256` conferido depois (os três arquivos editados voltaram a `5a2fe74b…3f012203`, `b47e537b…d75e5ca1` e `c2c3e913…67402b39`, e `WhatsAppSettings.tsx`, que o Goal não toca, a `6249a450…cb714a3f`, igual ao de `HEAD`):

| Controle | Edição | Resultado |
| --- | --- | --- |
| C1 | `scenarios.ts`: eyebrow de `whatsapp-conectar` de volta a "Conectar WhatsApp" | `Tests  1 failed | 11 passed (12)`; reprova "1. o eyebrow é o capítulo > whatsapp-conectar mostra WhatsApp" |
| C2 | `OnboardingScreen.tsx`: fase inicial `"connect"` no lugar de `"consent"` | `Tests  3 failed | 9 passed (12)`; reprovam as duas provas 3 e a prova 4 |
| C3 | `OnboardingScreen.tsx`: `disabled={false}` no "Continuar" da fase de consentimento | `Tests  3 failed | 9 passed (12)`; reprovam as duas provas 3 e a prova 4 |
| C4 | `WhatsAppSettings.tsx`: `consentPhase` passada ao painel | `Tests  1 failed | 11 passed (12)`; reprova a prova 5 |
| C5 | `demo.ts`: fim da demonstração "Combinado! Te espero lá." no lugar de "Confirmado! Te espero …" | `Tests  1 failed | 11 passed (12)`; reprova a prova 6 |

Saída real da rodada 4 (linhas do `vitest run tests/goal099-onboarding-ia-whatsapp.test.tsx`, uma edição por vez, `EXIT 1` em todas): C1, `× whatsapp-conectar mostra WhatsApp`, `Tests  1 failed | 11 passed (12)`. C2, `× abre no consentimento, sem conexão; Continuar só depois de checkbox e resposta; só a fase seguinte conecta`, `× com a resposta mas sem o checkbox, Continuar segue desabilitado`, `× depois do erro, a fase de consentimento volta com o checkbox desmarcado`, `Tests  3 failed | 9 passed (12)`. C3, as mesmas três linhas, `Tests  3 failed | 9 passed (12)`. C4, `× consentimento, pergunta, escolha de modo e Conectar WhatsApp na mesma tela`, `Tests  1 failed | 11 passed (12)`. C5, `× conversa com os dados do rascunho, os três eventos e o fim do quadro, sem artigo fixo`, `Tests  1 failed | 11 passed (12)`. Os `sha256` de `scenarios.ts`, `OnboardingScreen.tsx`, `WhatsAppSettings.tsx` e `demo.ts` depois de cada restauração são os de antes da edição. Com tudo restaurado, `Tests  12 passed (12)`. **Vermelho contra a baseline** (medido na rodada 2; não repetido na rodada 4, porque o teste novo tem o mesmo `sha256` e a baseline `1eaecd0` não mudou): as provas 1 a 4, 6 e 7, rodadas contra os arquivos de produção de `1eaecd0` restaurados por hash, reprovam em 9 dos 12 testes; passam na baseline o eyebrow "Sua IA", a prova 5 e a introdução de Configurações › IA.

**Estado da árvore.** Nada foi editado depois das execuções e dos controles da rodada 4: o `sha256` dos arquivos de código conferido às 00:30Z é o listado, e `git status --porcelain=v1 -uall` lista só os arquivos autorizados (os onze de produção e de `e2e/routes.ts`, os oito testes ajustados, o teste novo e os três documentos), sem resto de controle negativo nem artefato de `e2e-results/`.

**Não feito.** A conferência humana do §7 do Goal (celular real; e que a prévia do 4.6 lê como prévia, e não como mensagem já enviada) **não foi feita**: nenhuma pessoa abriu o onboarding num aparelho real nem avaliou a leitura da prévia. O que existe é a comparação por imagem e os testes acima.

**Aceite (review099, rodada 4).** O Tech Lead rodou `visual:compare -- --target 3.1,4.1,4.2,4.6` nas rodadas 1 a 4, exit 0; a partir da rodada 2, com células iguais às da coluna "Final" acima, e abriu os dezesseis `side-by-side.png`. Na rodada 3, a WU-11 do IA Loop foi `SKIPPED` por falta de `*_TEST_DATABASE_URL`. Na rodada 4, conferiu em disco `apps/frontend/e2e-results/authenticated/results.json` da WU-11 refeita pelo IA Loop (`startTime` 2026-10-02T00:39:30Z, posterior à execução do Developer de 00:18:41Z e à última edição de código, de 00:01:38Z): **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`, **0** retentativas. Os oito gates do IA Loop da rodada 4 passaram, os `sha256` dos arquivos de produção e do teste novo são os listados acima, `git status --porcelain=v1 -uall` tem 23 entradas autorizadas e `git diff --check` está limpo. O vermelho contra a baseline e os controles negativos foram conferidos por este registro e pelos `sha256`, não reexecutados pelo Tech Lead.

## As telas de acesso restantes iguais ao protótipo, do Goal091

Registro da Work Unit WU-11 (rodada 1 do IA Loop): `visual:compare` final, controles negativos do §6 do Goal e execução final. Decisão: [D-107](DECISIONS.md) (PROPOSED). Os números abaixo são os desta execução; o que não foi medido está dito.

**Estado do código.** `sha256` dos arquivos de produção e do teste novo na execução final: `AuthScreen.tsx` `bd1b1b5c…2b68c031`, `LegalDocumentLayout.tsx` `4e38b6f4…7668b314`, `avenly.css` `54a0a3cf…b516424d`, `terms-of-use.pt-BR.ts` (conteúdo legal, não editado) `046a6b24…ec0c956c`, `goal091-telas-de-acesso.test.tsx` `8685b842…70af7545`. O teste ganhou `APP_SECTION_TITLES` nesta Work Unit (os 18 títulos de cada documento fixados no teste), porque o primeiro desenho não reprovava o controle 4; o código de produção não foi editado depois disso.

**Execução final** (`2026-10-02`, depois da última edição de código):

| Passo | Resultado |
| --- | --- |
| `typecheck` e `lint` em `apps/frontend` | exit 0 |
| `tests/goal091-telas-de-acesso.test.tsx` | `Tests  16 passed (16)` |
| `test:frontend` (vitest) | `Test Files  136 passed (136)`, `Tests  1483 passed (1483)` |
| `validate:core` | exit 0: **17** passos, **15** `passed`, **0** `failed`, **2** `skipped` (`test:bff`, `test:health-worker`) |
| `test:gate` | `tests 233`, **233** `pass` |
| `validate:ui` (cinco larguras) | exit 0: **169** `passed`, **21** `skipped`, **0** retentativas |
| `visual:compare -- --target L1,L3,L4,L5,L8,L9` | exit 0, `2026-10-02T01:55:19Z` |
| `validate:integration` (WU-10, rodadas 1 e 2 do IA Loop) | exit 0 nas duas; gate autenticado em **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`, **0** retentativas |

`validate:core` imprime que a persistência do banco só é validada por `validate:integration`. A WU-11 da rodada 1 não o rodou (precisa de PostgreSQL descartável em `BFF_TEST_DATABASE_URL`). Na mesma rodada 1, a **WU-10 rodou `validate:integration` e ele passou, exit 0** (depois de o DIAG-002 dar tempo limite de 60 s a um teste de `goal023-retention-sweep.test.ts`, ver "Estado da árvore"). O gate autenticado dessa execução: `apps/frontend/e2e-results/authenticated/results.json` com `startTime` `2026-10-02T01:46:47Z`, posterior à última edição de código de produção (os `sha256` acima não mudaram desde então), com **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`; os 245 resultados do arquivo têm todos `retry` 0 (**0** retentativas). Esta Work Unit (FIX-001) conferiu o arquivo; não reexecutou o gate nem registra o número de passos de `validate:integration`, que está no registro da WU-10.

**`visual:compare`** (mobile 402×812 / tablet em retrato 768×1024 / tablet em paisagem 1024×768 / desktop 1366×768, em %; a porcentagem é tendência, a leitura é a dos `side-by-side.png`):

| Quadro | Início (baseline `1e64c49`, medida neste Goal) | Final (Goal091) |
| --- | --- | --- |
| L1 Login | 4,8 / 1,0 / 1,0 / 1,0 | 4,8 / 1,0 / 1,0 / 1,0 |
| L3 Criar conta | 17,6 / 11,2 / 7,0 / 5,6 | 1,7 / 1,1 / 1,6 / 0,9 |
| L4 Recuperar senha | 11,6 / 5,3 / 5,1 / 4,6 | 2,2 / 1,5 / 1,4 / 1,6 |
| L5 Código de recuperação | 15,9 / 8,1 / 6,4 / 5,2 | 12,8 / 10,5 / 5,3 / 4,3 |
| L8 Termos de Uso | 23,4 / 52,3 / 48,6 / 47,0 | 9,3 / 8,7 / 6,8 / 5,3 |
| L9 Política de Privacidade | 23,8 / 52,6 / 49,6 / 47,8 | 9,1 / 8,0 / 7,6 / 5,6 |

**`visual:compare` de início.** A WU-01 rodou `npm run visual:compare -- --target L1,L3,L4,L5,L8,L9` sobre a baseline `1e64c49` antes de qualquer edição, e a coluna "Início" é essa medida. Esta Work Unit (FIX-001) a repetiu: restaurou os três arquivos de produção de `1e64c49` (`git show 1e64c49:<arquivo>`), rodou o mesmo comando (exit 0, `2026-10-02T02:19:35Z`) e obteve **os mesmos números** nas 24 células, que são os da tabela; em seguida restaurou os arquivos finais por cópia e conferiu os `sha256` (`bd1b1b5c…2b68c031`, `4e38b6f4…7668b314`, `54a0a3cf…b516424d`, iguais aos de cima) e rodou o comando de novo na árvore final (exit 0, `2026-10-02T02:20:58Z`), com as 24 células finais iguais às da coluna "Final". Em L3, L4 e L5 a medida de início coincide com a registrada ao fim do Goal086; L1, L8 e L9 não tinham medida em documento. L5 **piora no tablet em retrato** (8,1 para 10,5), confirmado pelas duas medidas; a causa provável é a altura do cartão (o do quadro tem as caixas de dígito e o do app é mais curto, divergência 3 de D-107), mas ela não foi isolada por outra medida.

**O que se vê em cada `side-by-side.png`** (lido nesta execução):

- **L3 Criar conta.** Mobile: hero, folha bege, título, descrição, rótulos, ícones, dica da senha, checkbox com os dois links, CTA "Criar conta →" e "Já tem conta? Entrar" iguais em posição e tamanho; difere o conteúdo dos campos (quadro preenchido com "Camila Reis", e-mail e senha, checkbox marcado; app vazio, com placeholder e checkbox desmarcado) e o rótulo "Crie uma senha" contra "Senha". Tablet em retrato e em paisagem e desktop: o cartão tem a mesma largura, a mesma ordem e a mesma altura, o hero e o selo coincidem; as diferenças são as mesmas de dado e de rótulo, mais o contorno do título do hero (Literata estática) e, no retrato, o título do cartão esmaecido na captura do protótipo, que o anima na entrada.
- **L4 Recuperar senha.** Os quatro devices: mesma estrutura (título, descrição, campo "E-mail" com ícone, CTA, "‹ Voltar para entrar"). Difere o texto ("código de 6 dígitos" e "Enviar código" contra "link" e "Enviar link", por D-107 (c)) e o campo, que o quadro mostra preenchido e com foco; no app está vazio com placeholder. No mobile a folha começa na mesma altura; no desktop o cartão tem a mesma altura, com o texto da descrição quebrando em outro ponto.
- **L5 Código de recuperação.** Mobile e tablet em retrato: o cartão do quadro tem as seis caixas de dígito, "Não chegou? Reenviar em 0:42" e "Continuar"; o app tem só o texto e "Voltar para entrar", e o cartão é mais curto (a folha do mobile começa mais baixa), o que faz o bloco vermelho do diff. Título "Confira seu e-mail", "‹ Usar outro e-mail" e a casca coincidem. Tablet em paisagem e desktop: mesma largura e posição do cartão, mesma diferença de altura e de conteúdo. Tudo isso é a divergência 3 de D-107.
- **L8 Termos de Uso.** Mobile: barra com seta e título, eyebrow "DOCUMENTO LEGAL", título, resumo, aviso, três cartões de metadados e as seções numeradas coincidem na estrutura, nas cores e na tipografia; diferem o texto do resumo, o aviso, a versão e as datas (`0.1-draft` e `2026-08-14` contra "0.1 · rascunho" e "14 de agosto de 2026"), e os títulos e o conteúdo das seções. Tablet em retrato e em paisagem e desktop: barra com a marca e "Voltar para criar conta", coluna "Sumário" com o primeiro item em destaque, metadados em grade e seções com divisórias coincidem; o sumário do app tem 18 linhas (algumas quebram em duas) contra 10, e por isso o sumário e o corpo ficam deslocados.
- **L9 Política de Privacidade.** Mesma leitura de L8 nos quatro devices: estrutura, barra, sumário, aviso, metadados e divisórias iguais; diferem o texto, o número e os títulos das seções (18 contra 10), o resumo, o aviso, a versão e as datas.

**Divergências que restam, todas declaradas em D-107:** barra de status do iPhone; saudação e texto de D-087; link no lugar de código em L4 e L5 (sem caixas de dígito, sem reenvio, sem e-mail); texto, seções, versão, datas e aviso de L8 e L9, que são os do app; campos do L3 preenchidos no quadro e vazios no app; "Crie uma senha"; animação de entrada do título e contorno de glifo. Há mais diferenças do que as cinco divergências do enunciado do Goal (rótulo "Crie uma senha", versão e datas em formato ISO, texto do aviso, cartão do L5 mais curto, e o aumento do L5 no tablet em retrato), todas listadas em D-107.

**Controles negativos do §6** (depois da última edição de código; cada defeito aplicado, o teste rodado com `npx vitest run tests/goal091-telas-de-acesso.test.tsx`, o arquivo restaurado por cópia e o `sha256` conferido):

1. `AuthScreen.tsx`, `? "Enviar link"` trocado por `? "Enviar código"`. `sha256` antes `bd1b1b5c…2b68c031`, com defeito `4ab18420…776ce650`. Saída: `× título, descrição e CTA falam de link, sem 'código'`, `× o envio chama o mesmo endpoint e leva a /solicitacao-enviada`, `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Enviar link"`, `Tests  2 failed | 14 passed (16)`. Restaurado: `bd1b1b5c…2b68c031` (IGUAL), `Tests  16 passed (16)`.
2. `AuthScreen.tsx`, "Usar outro e-mail" trocado por "Tentar de novo". Com defeito `1599b7b6…f3401e55`. Saída: `× título, ação principal e 'Usar outro e-mail' para /recuperar-senha`, `× a ação principal vem antes de 'Usar outro e-mail'`, `TestingLibraryElementError: Unable to find an accessible element with the role "link" and name /Usar outro e-mail/`, `Tests  2 failed | 14 passed (16)`. Restaurado: IGUAL, `Tests  16 passed (16)`.
3. `LegalDocumentLayout.tsx`, o sumário percorre `document.sections.slice(0, -1)`. `sha256` antes `4e38b6f4…7668b314`, com defeito `f0dd4a97…d842a14e`. Saída: `× Termos de Uso: um link por seção, apontando para o id da seção`, `× Política de Privacidade: um link por seção, apontando para o id da seção`, `AssertionError: expected [ Array(17) ] to have a length of 18 but got 17`, `Tests  2 failed | 14 passed (16)`. Restaurado: IGUAL, `Tests  16 passed (16)`.
4. `terms-of-use.pt-BR.ts`, `title: "1. Identificação da responsável"` trocado por `title: "1. Identificação e aceite"` (título do quadro). `sha256` antes `046a6b24…ec0c956c`, com defeito `1196ef0c…85fb2142`. Saída: `× Termos de Uso: o texto e o número das seções são os do conteúdo legal`, `AssertionError: expected [ '1. Identificação e aceite', …(17) ] to deeply equal [ …(18) ]`, `Tests  1 failed | 15 passed (16)`. Restaurado: IGUAL, `Tests  16 passed (16)`.

O controle 4 **não reprovou na primeira rodada** (`Tests  16 passed (16)`): a prova 5 comparava os `h2` renderizados com o próprio `document.sections`, a mesma fonte do defeito. A correção foi fixar os títulos do app no teste (`APP_SECTION_TITLES`) e refazer os quatro controles depois dela; as saídas acima são dessa rodada.

**Estado da árvore.** `git status --short` lista só os arquivos autorizados: os três de produção, `goal064-auth-screens.test.tsx`, o teste novo e os três documentos; `apps/frontend/e2e-results/` é ignorado pelo git, e nenhum resto de controle negativo ficou nos arquivos (os `sha256` acima voltam ao original). Constam também no diff, não editados por esta Work Unit, `apps/frontend/tests/goal076-service-list.test.tsx` (espera o fim do carregamento da lista) e `apps/bff/tests/goal023-retention-sweep.test.ts` (tempo limite maior numa passada em lote).

**Vermelho da baseline das provas 1 a 5** (exigido pelo §4 e pelo critério 3 do Goal). A WU-03 o executou: restaurou os três arquivos de produção de `1e64c49`, conferiu a restauração por `sha256` (`RESTORED_OK`) e rodou `npx vitest run tests/goal091-telas-de-acesso.test.tsx`, com `Tests  10 failed | 6 passed (16)`. Esta Work Unit (FIX-001) repetiu a execução sobre a baseline restaurada, com o mesmo resultado (`Tests  10 failed | 6 passed (16)`), e restaurou os arquivos finais por cópia, com os `sha256` conferidos e `Tests  16 passed (16)` depois. Os 10 que reprovam na baseline: prova 1, "título, descrição, dica da senha, aceite e 'Já tem conta? Entrar'"; prova 2, "título, descrição e CTA falam de link, sem 'código'"; prova 3, "título, ação principal e 'Usar outro e-mail' para /recuperar-senha" e "a ação principal vem antes de 'Usar outro e-mail'"; prova 4, os quatro testes (Termos de Uso e Política de Privacidade: "voltar para /cadastro, eyebrow, título, versão e datas do documento" e "sem o painel de marca da autenticação"); prova 5, "um link por seção, apontando para o id da seção" nos dois documentos. Os 6 que passam na baseline são os que fixam o que **não** muda: prova 1, "campos e validação da baseline" e "o corpo enviado ao BFF é o da baseline"; prova 2, "o envio chama o mesmo endpoint e leva a /solicitacao-enviada"; prova 3, "sem caixas de dígito, sem campo de código e sem contagem de reenvio"; prova 5, "o texto e o número das seções são os do conteúdo legal" nos dois documentos.

**`/nova-senha` e `/link-expirado` não quebraram** (§2 do Goal). `/link-expirado` está nas rotas do `validate:ui` desta rodada (**169** `passed`, **0** retentativas), nas cinco larguras. `/nova-senha` não está em `apps/frontend/e2e/routes.ts`, então o `validate:ui` não a cobre; a evidência é outra: o DOM dela não mudou (a diferença em `AuthScreen.tsx` é a prop nova `hint`, `undefined` ali, e `showRules`, que passa de `newPassword || signup` para `newPassword`, igual para `/nova-senha`, onde `signup` é falso), e `tests/goal064-auth-screens.test.tsx` ("em /nova-senha as regras seguem alternando entre 'Pendente' e 'Atendida'" e "sucesso só depois de resetPassword resolver") passa no `test:frontend` (**1483**/**1483**). Nenhum olhar humano nem `side-by-side` de `/nova-senha` foi feito.

**Não feito.** Conferência humana num aparelho real; `side-by-side` de `/nova-senha` (fora dos quadros do Goal); a repetição de `validate:integration` por esta Work Unit (o registro é o da WU-10).

**Aceite (review091, rodada 2).** O Tech Lead rodou `visual:compare -- --target L1,L3,L4,L5,L8,L9` nas rodadas 1 e 2, exit 0, com células iguais às da coluna "Final" acima, e abriu os vinte `side-by-side.png` dos cinco quadros. Na rodada 2, conferiu em disco `apps/frontend/e2e-results/authenticated/results.json` da WU-10 refeita pelo IA Loop (`startTime` 2026-10-02T02:28:46Z, posterior à restauração dos arquivos finais pelo FIX-001, de mtime 02:19:48Z, com o mesmo `sha256`): **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`, os 245 resultados com `retry` 0. Os oito gates do IA Loop das duas rodadas passaram, os `sha256` dos arquivos de produção e do teste novo são os listados acima e `git diff --check` está limpo (só aviso de CRLF). O vermelho contra a baseline e os quatro controles negativos foram conferidos por este registro e pelos `sha256`, não reexecutados pelo Tech Lead.

## A Agenda em Dia igual ao A1, do Goal092 (rodada 2)

Registro da execução final e dos controles do [Goal092](goals/092-agenda-dia-igual-ao-prototipo.md) ([D-108](DECISIONS.md), ACCEPTED no [review092](reviews/092-review.md)), reescrito na rodada 2 (FIX-001) **depois da última edição de código**, com as contagens da própria rodada 2. Tudo abaixo foi rodado em 2026-10-02, entre 04:11Z e 04:29Z, sobre a árvore abaixo, sem edição de código entre a primeira e a última execução.

**Árvore avaliada (`sha256`).** `AgendaBoard.tsx` `f88af80e…fb544571`, `DayView.tsx` `4ea17411…471f2d00`, `occupancy.ts` `b5772f36…81dc6547`, `avenly-agenda.css` `0ce459e0…b179be8d`, `goal092-agenda-dia.test.tsx` `69ab7d2f…19370e73`. Na rodada 1 eram `DayView.tsx` `ddd9a9cf…ce5958d2`, `avenly-agenda.css` `6506e9cf…b7348488` e `goal092-agenda-dia.test.tsx` `9991e0a0…1267bf79`; `AgendaBoard.tsx` e `occupancy.ts` não mudaram. Depois da medição da baseline (abaixo), os quatro arquivos de produção foram restaurados de cópia e o `sha256` conferido, igual ao acima.

**O que a rodada 2 mudou no código** (os cinco blockers do review da rodada 1): o preço mantém o espaço não separável U+00A0 entre "R$" e o valor (`priceLabel` não troca mais o espaço); a observação de presença diz "presença confirmada pelo lembrete"; a Agenda ganha `padding-bottom` de `120px` mais a área segura abaixo de 1024 px (o botão flutuante ocupa de 106 a 162 px acima da base, e a barra de abas da casca já tem 65 px, então a última linha, com a página rolada até o fim, termina 185 px acima da base, ou seja, 23 px acima do botão; é conta sobre os valores do CSS, não medida numa captura rolada); a linha de exceção mostra o motivo ("Feriado local"), e a asserção correspondente de `goal016-agenda-views.test.tsx` voltou.

**Execuções que sustentam as contagens**, cada uma pelo nome (todas da rodada 2, FIX-001):

| Execução | Comando | Quando | Resultado |
| --- | --- | --- | --- |
| E1 | `npm run validate:core` | 2026-10-02, depois da última edição de código | exit 0; **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`; `test:frontend` **137** arquivos e **1501** testes, todos `passed` (**1499** na rodada 1, mais os 2 testes novos); `test:gate-scripts` `passed` |
| E3 | `npm run validate:ui` | `startTime` 2026-10-02T04:16:44.911Z, 65,4 s | exit 0; **166** `expected`, **21** `skipped`, **0** `unexpected`, **3** `flaky` (`apps/frontend/e2e-results/results.json`). Os três `flaky` são rotas públicas que a Agenda não toca e passaram na repetição: `recuperar-senha` (WCAG, mobile-360 e mobile-390) e `criar-conta` (sem overflow, tablet-768). Na rodada 1 a mesma execução deu **169** `expected` e **0** `flaky` |
| E4 | passo `rehearse:goal033-authenticated-ui` de `npm run validate:integration` | `startTime` 2026-10-02T04:22:21.884Z, 418 s | **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped` (`apps/frontend/e2e-results/authenticated/results.json`) |
| E5 | `npm run visual:compare -- --target A1,A10,A11,H3` | 2026-10-02, depois de E1 | exit 0; 16 pares quadro e largura |
| E6 | `npx vitest run` nas seis suítes de Agenda (`goal092-agenda-dia`, `goal016-agenda-views`, `goal016-agenda-reachability`, `goal069-agenda-structure`, `goal069-agenda-views`, `goal073-agenda-visualizacao`) | depois da última edição | **68**/**68**; `goal092-agenda-dia.test.tsx` sozinho **18**/**18** (**16** na rodada 1, mais o preço com espaço não separável e a observação de presença) |
| E7 | `npm run lint` e `npm run typecheck` em `apps/frontend` | depois da última edição | os dois exit 0, sem aviso |
| E8 | `npm run validate:integration` completo, com `BFF_TEST_DATABASE_URL` apontando para um PostgreSQL descartável em `127.0.0.1:55492` (`atendly_bff_test`, cluster criado só para esta execução e parado depois) | 2026-10-02, de 04:19:43Z a 04:29:20Z, **579 s** | **exit 0**; **36** passos, **36** `passed`, **0** `failed`, **0** `skipped`, **0** `notRun`; "validate:integration PASSED against 127.0.0.1:55492/atendly_bff_test" |

**`validate:integration`: resultado real.** Passou. A execução da WU-10 da rodada 1 deu exit 0 em 554 s (o que a rodada 1 deixou como desconhecido nos documentos), e a execução desta rodada (E8) deu exit 0 em 579 s, com 36 de 36 passos; o gate autenticado (E4) é o passo `rehearse:goal033-authenticated-ui` dela.

### `visual:compare` do A1, A10, A11 e H3

Início (baseline `640a025`, medida pela WU-01 da rodada 1 e **reproduzida nesta rodada**: com os quatro arquivos de produção da Agenda restaurados da baseline, `visual:compare -- --target A1,A11` deu os mesmos números de A1 e A11) e final (E5), em porcentagem de pixels diferentes, na ordem mobile / tablet em retrato / tablet em paisagem / desktop:

| Quadro | Início (WU-01) | Final (E5) |
| --- | --- | --- |
| A1 Agenda · dia | 13,0 / 5,7 / 5,2 / 4,4 | 10,4 / 4,8 / 5,4 / 4,3 |
| A10 Agenda · semana | 15,0 / 5,2 / 5,3 / 4,6 | 12,9 / 5,1 / 5,5 / 4,6 |
| A11 Agenda · mês | 13,4 / 7,3 / 7,0 / 6,0 | 12,9 / 6,9 / 7,8 / 6,3 |
| H3 Home · WhatsApp desconectado | 8,1 / 4,1 / 3,8 / 3,0 | 8,1 / 4,1 / 3,8 / 3,0 |

**Onde piorou, e a causa.** A1 em tablet em paisagem (5,2 para 5,4), A11 em tablet em paisagem (7,0 para 7,8) e em desktop (6,0 para 6,3), e A10 em tablet em paisagem (5,3 para 5,5). A causa, lida nos `side-by-side.png` do A11 em desktop na baseline e no final: na baseline, o cartão "Próximo agendamento", a barra antiga e o botão solto "Exceções do dia" empurravam a grade do mês para baixo, e a captura de 768 px de altura cortava a grade na quarta semana; sem eles, a grade sobe, e a quinta semana e a borda de baixo entram na captura, com linhas de célula que não alinham com as do quadro (as células do app são mais baixas que as do quadro, que tem o resumo "Hoje, quinta 18" colado na grade) e passam a contar como diferença. O corpo do mês não mudou (`MonthView.tsx` está fora do diff), então a piora do A11 é pixel que passou a ser comparado, e não regressão do corpo. A mesma leitura vale, em escala menor, para A10 e para o A1 em paisagem, onde a barra nova e a lista põem mais conteúdo dentro dos 768 px (o A1 em desktop melhorou, de 4,4 para 4,3). A isolação foi feita por troca dos quatro arquivos de produção pelos da baseline na mesma execução do comando, não por medição de região. A porcentagem é tendência, não aprovação.

H3 não mudou em nenhum device: o diff desta rodada não toca nenhum arquivo da Home.

**O que se vê em cada `side-by-side.png` do A1** (lido na execução E5):

- **A1 mobile (402×812, 10,4 %).** Mês e ano em Literata ("Outubro 2026"), os dois botões ‹ › redondos, o segmentado Dia · Semana · Mês em toda a largura com "Dia" ativo, a faixa da semana com o dia de hoje em círculo verde, "Hoje, sexta 2" e "5 atendimentos · 1 bloqueio", e a lista com o horário à esquerda: Bia Castro "Concluído" com ✓, Carla Nunes "Não compareceu" em vermelho, "Almoço · bloqueio · 1 h" hachurado, a marca 13:45, Ana Paula, Juliana Mendes com traço dividido em duas cores, Pedro Alves e Dentista sem traço. O botão flutuante verde de 56 px fica na mesma posição do quadro, acima da barra de abas, e cobre o fim da linha de baixo na captura sem rolagem, como no quadro. Difere: o aviso de WhatsApp desconectado empurra a barra e a lista cerca de 135 px para baixo (lido na captura) (divergência 2); falta o chevron ⌄ (3); a faixa mostra 28 a 4, e não 15 a 21 (5); faltam a observação de Ana Paula, o preço de Juliana (5), o hold e o lembrete sem resposta (4).
- **A1 tablet em retrato (768×1024, 4,8 %).** Mesma barra e mesma lista em largura cheia, com o botão flutuante à direita, acima da barra de abas, no lugar do quadro. Difere: o aviso de WhatsApp no topo desloca tudo para baixo; falta o chevron; faltam a observação de Ana Paula, o preço de Juliana e o hold; a faixa da semana e os horários são os da conta de teste.
- **A1 tablet em paisagem (1024×768, 5,4 %).** Duas colunas: a lista à esquerda e o painel à direita com "Selecione um atendimento para ver os detalhes", como no quadro, "Novo" verde na barra e a barra de abas embaixo. Difere: o aviso de WhatsApp; falta o chevron; faltam a observação, o preço de Juliana e o hold; a última linha visível é Dentista, cortada pela barra de abas, como no quadro.
- **A1 desktop (1366×768, 4,3 %).** Sidebar, barra com "Outubro 2026", segmentado centrado, ‹ › e "Novo", faixa da semana, lista e o painel vazio com o mesmo texto do quadro. Difere: o aviso de WhatsApp no topo; na sidebar, o item "Notificações" e o cartão "WhatsApp desconectado" no lugar de "IA ativa" (D-102, divergência 2); o segmentado do app começa cerca de 12 px mais à esquerda e é um pouco mais estreito que o do quadro (lido na captura, não medido); falta o chevron; faltam a observação, o preço de Juliana e o hold. Em Pedro Alves, "R$ 50" vai inteiro para a linha de baixo, depois do " · ", como "R$ 150" em Juliana no quadro: a quebra cai entre o separador e o preço, e nunca entre "R$" e o valor (espaço não separável).

O Dia **não** é pixel a pixel igual ao quadro nos quatro devices: a lista tem a mesma estrutura, os mesmos textos e as mesmas cores em todos, e o que sobra está nas divergências 1 a 6 de D-108. As duas linhas que dependem de dado que o app não tem (hold e lembrete sem resposta) e a observação e o preço que o seed não grava continuam diferentes.

**O corpo de A10, A11 e H3 não quebrou** (lido na execução E5; a comparação numérica com o início está na tabela acima):

- **A10 Semana, desktop.** A barra nova ("Outubro 2026", segmentado com "Semana" ativo, ‹ ›, "Novo") substitui a antiga; o corpo continua sendo a grade de horas de `WeekView.tsx`, com os cartões de 10:00, 11:00 e 12:00 em sexta 2 e quinta 1, e o cartão "Próximo agendamento" não aparece. Continuam diferentes do quadro, e são do Goal100: o corpo em cartões por dia, a pílula "Seg-Sáb", o texto "15 - 20 de setembro · 31 atendimentos", a legenda de cores e o resumo "Hoje, quinta 18" com "Abrir dia".
- **A11 Mês, mobile.** A barra nova com "Mês" ativo e o botão flutuante no lugar do quadro; o corpo continua sendo a grade do mês com os chips de `MonthView.tsx`, sem o resumo do dia, as barras coloridas por dia e a pílula "Seg-Sáb" do quadro (Goal100).
- **H3 Home, mobile.** A Home mostra a saudação, o cartão "WhatsApp desconectado" com "Reconectar WhatsApp", o cartão "Ative sua IA", "Hoje · 5 atendimentos" e "Ver agenda", como antes. O diff deste Goal não toca nenhum arquivo da Home (`git diff --stat` lista só os quatro arquivos de produção da Agenda e os testes). O cartão "Ative sua IA" e a data do quadro são diferença de conta e de dado, e não deste Goal.

### Controles negativos do §6

Rodados na rodada 1 (WU-11) com `npx vitest run tests/goal092-agenda-dia.test.tsx`, sobre a árvore daquela rodada. A rodada 2 mudou `DayView.tsx` (preço, observação de presença, motivo da exceção) e o CSS, e nenhum dos quatro pontos controlados abaixo; os hashes e as contagens `16`/`16` desta seção são, por isso, os da rodada 1 e não foram refeitos. Cada defeito aplicado por substituição exata de texto, o arquivo restaurado por cópia no mesmo passo e o `sha256` conferido:

1. `AgendaBoard.tsx`, `.then((list) => setServiceColors(serviceColorMap(list.items)))` trocado por `.then(() => setServiceColors(new Map()))` (todo traço neutro). `sha256` antes `f88af80e…fb544571`, com defeito `5d7802e4…bfa16d31`, depois `f88af80e…fb544571`. Saída: `Tests  2 failed | 14 passed (16)`; `× o traço tem o token do serviço; dois serviços dividem o traço` e `× serviço sem cor no catálogo dá traço neutro, com a lista inteira na tela`, com `AssertionError: expected [ null ] to deeply equal [ 'VIOLET' ]`. Restaurado: `Tests  16 passed (16)`.
2. `DayView.tsx`, `.sort((left, right) => left.startMinutes - right.startMinutes)` trocado por ordenação pelo nome (`localeCompare`). `sha256` antes `ddd9a9cf…ce5958d2`, com defeito `2576289b…f6d35db9`, depois `ddd9a9cf…ce5958d2`. Saída: `Tests  1 failed | 15 passed (16)`; `× ordem de início, horário, nome, 'serviço · duração' e estado; sem eixo de horas; textos do quadro`, com `AssertionError: expected [ 'Carla Nunes', 'Ana Paula', …(4) ] to deeply equal [ 'Carla Nunes', 'Ana Paula', …(4) ]`. Restaurado: `Tests  16 passed (16)`.
3. `AgendaBoard.tsx`, o `<Link href="/agenda/excecoes">` "Exceção do dia" removido do menu. `sha256` antes `f88af80e…fb544571`, com defeito `03d6ad8a…f376318e`, depois `f88af80e…fb544571`. Saída: `Tests  1 failed | 15 passed (16)`; `× tem os quatro itens com seus destinos, e o botão solto 'Exceções do dia' não existe`, com `TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name "Exceção do dia"`. Restaurado: `Tests  16 passed (16)`.
4. `AgendaBoard.tsx`, um `<p className="agenda-next-appointment">Próximo agendamento</p>` renderizado antes do `WeekView`. `sha256` antes `f88af80e…fb544571`, com defeito `64cd75d8…2b3e88ff`, depois `f88af80e…fb544571`. Saída: `Tests  1 failed | 15 passed (16)`; `× nem em Dia, nem em Semana, nem em Mês`, com `AssertionError: expected <p class="agenda-next-appointment"></p> to be null`. Restaurado: `Tests  16 passed (16)`.

Uma primeira tentativa dos controles 3 e 4 não aplicou o defeito: a âncora multilinha não casou com as quebras de linha CRLF do arquivo (`MUTATION ANCHOR NOT UNIQUE/FOUND`), o script restaurou o arquivo sem rodar o teste, e o `sha256` voltou a `f88af80e…fb544571`. A tentativa seguinte, com a âncora convertida para CRLF, é a registrada acima.

**Estado da árvore.** `git status --short` lista só os oito arquivos modificados (os quatro de produção da Agenda e `goal016-agenda-reachability`, `goal016-agenda-views`, `goal069-agenda-structure` e `goal069-agenda-views`), o teste novo `goal092-agenda-dia.test.tsx` e, depois deste registro, os três documentos; `apps/frontend/e2e-results/` é ignorado pelo git, e nenhum resto de controle negativo ficou na árvore.

**Vermelho contra a baseline.** Executado pela WU-03 da rodada 1, com os quatro arquivos de produção da baseline restaurados e o `sha256` conferido, sobre os **16** testes daquela rodada: **12** reprovam e **4** passam, declarados um a um (prova 2 "cancelado fora", que a baseline já filtrava; prova 6 "Exceção do dia" sem `manageAvailability`, item que não existia; prova 6 Escape e foco e prova 7 link abaixo de 1024 px, comportamento preservado). Os dois testes acrescentados na rodada 2 não foram rodados contra a baseline. Registrado no fechamento, a partir do resultado da WU-03.

**Não feito.** A conferência humana num aparelho real; o vermelho contra a baseline e os controles negativos na árvore da rodada 2 (os dois são da rodada 1); `test:gate` como execução separada na rodada 2. A coluna "Início" do `visual:compare` e a saída global de `validate:integration` estão acima (WU-01 reproduzida nesta rodada, e E8).

## A Agenda em Semana e Mês iguais ao A10 e ao A11, do Goal100 (rodada 3)

Registro da execução final e dos controles do [Goal100](goals/100-agenda-semana-e-mes-iguais-ao-prototipo.md) ([D-109](DECISIONS.md), ACCEPTED no [review100](reviews/100-review.md)), reescrito na rodada 3 (FIX-001) **depois da última edição de código**, com as contagens das execuções da rodada 3 sobre a árvore abaixo. As contagens da rodada 1 foram retiradas: vinham de execuções com os tetos de workers (`maxWorkers: 4` no vitest e `workers: 2` no Playwright), sobre uma árvore que não existe mais (`avenly-agenda.css` mudou na rodada 2). Tudo abaixo foi rodado em 2026-10-02, entre 08:47Z e 09:08Z, sem edição de código entre a primeira e a última execução; os controles negativos mexeram nos arquivos de produção só dentro de cada passo, e o `sha256` voltou ao de antes. Nenhum arquivo de configuração foi alterado: o `validate:ui` roda com a configuração da baseline (`workers` indefinido, que o Playwright resolve em 6 neste host de 12 processadores lógicos, e `retries: 1`).

**Árvore avaliada (`sha256`).** `WeekView.tsx` `35387037…f18b46b4`, `MonthView.tsx` `d6c6f8f2…5617345d`, `AgendaBoard.tsx` `62a347ee…1c7d8ad5`, `occupancy.ts` `d40c45c3…d9949e7d`, `DayView.tsx` `e5db674b…8cf55a2f`, `DaySummaryCard.tsx` `562decdc…c1167dd7`, `avenly-agenda.css` `538ba8ac…fb2f78dc`, `goal100-agenda-semana-mes.test.tsx` `552288a9…fc3e7d93`, `goal016-agenda-views.test.tsx` `c3192556…7a56f172` e `goal016-a11y.test.tsx` `e72abc9a…0e41fd36`. Só o `avenly-agenda.css` difere do registro da rodada 1 (`1064ace3…95478fff`).

**Execuções que sustentam as contagens**, cada uma pelo nome (todas da rodada 3, FIX-001, exceto E3a, lida em disco antes de ser sobrescrita):

| Execução | Comando | Quando | Resultado |
| --- | --- | --- | --- |
| E1 | `npm run validate:core` | 08:52:09Z a 08:53:45Z, 96 s | exit 0; **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`; `test:frontend` **138** arquivos e **1522** testes, todos `passed`; `test:gate-scripts` `passed` |
| E2 | `npm run test:gate` | 09:08:06Z, 1456 ms | exit 0; **233** testes, **233** `pass`, **0** `fail`, **0** `skipped` |
| E3a | `npm run validate:ui`, sem teto de workers (rodada 2, lido de `apps/frontend/e2e-results/results.json` antes de ser sobrescrito) | `startTime` 2026-10-02T08:33:22.549Z, 55,9 s | **165** `expected`, **21** `skipped`, **0** `unexpected`, **4** `flaky` (retentativas; detalhe em "Retentativas do `validate:ui`") |
| E3b | `npm run validate:ui`, sem teto de workers | `startTime` 2026-10-02T08:47:26.481Z, 94,4 s | **exit 1**; **161** `expected`, **20** `skipped`, **2** `unexpected`, **7** `flaky` (retentativas e duas falhas, todas em rotas públicas fora da Agenda; detalhe abaixo) |
| E3c | `CI=1 npm run validate:ui` (a mesma configuração, com `workers: 1` pela condição `process.env.CI` que já existe nela) | `startTime` 2026-10-02T08:49:24.034Z, 153,4 s | exit 0; **169** `expected`, **21** `skipped`, **0** `unexpected`, **0** `flaky`; a saída do passo diz `retries: 0 — every test passed on its first attempt` |
| E4 | `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55433/atendly_bff_test node scripts/goal033-authenticated-ui-rehearsal.mjs` (o passo `rehearse:goal033-authenticated-ui` de `validate:integration`, rodado direto numa tentativa em que o `validate:integration` completo ainda não passava; o `validate:integration` completo que passou é o E4b) | `startTime` 2026-10-02T08:57:48.469Z, 416,5 s (`apps/frontend/e2e-results/authenticated/results.json`) | exit 0; **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`; a saída diz `authenticated gate retries: 0 — every test passed on its first attempt` |
| E4b | `npm run validate:integration` completo, na árvore final (idêntica byte a byte à avaliada acima), depois de quatro tentativas anteriores que não passaram (08:53:58Z, 08:56:50Z, 09:06:46Z e 09:07:23Z) | 543157 ms (cerca de 9 min); o gate autenticado dentro dele, `startTime` 2026-10-02T09:16:59.232Z, 416119 ms | **exit 0.** O resumo do próprio script diz `total 36, passed 36, failed 0, skipped 0, notRun 0` e `validate:integration PASSED against 127.0.0.1:55500/ia_bff_test`. O gate autenticado dentro dele deu **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped` (`apps/frontend/e2e-results/authenticated/results.json`). As quatro tentativas anteriores, todas na rodada 3 e antes desta execução, **não passaram** e não contam: 1ª, `P1001: Can't reach database server at 127.0.0.1:55432` (um postmaster morto, PID 27484, segura a porta); 2ª a 4ª, num cluster novo na 55433, `test:bff-integration` com `Worker exited unexpectedly` (8 e 13 workers mortos), e a 3ª com o banco sujo da 2ª (80 reprovados por `Unique constraint failed ... WhatsAppInstance_evolutionInstanceName_key`, erro de quem as rodou). Essas falhas eram de esgotamento de recurso do host, e a execução que passou é a que vale para a árvore final. O Goal100 não toca `apps/bff` |
| E5 | `npm run visual:compare -- --target A10,A11,A1,H3` | 09:04:51Z a 09:05:34Z, depois de E4 | exit 0; 16 pares quadro e largura |
| E6 | `npx vitest run tests/goal100-agenda-semana-mes.test.tsx` | 09:06Z, e de novo com cada arquivo restaurado | **21**/**21** |
| E7 | `npm run typecheck` e `npm run lint` em `apps/frontend`, cada um com o exit code lido isolado | 09:06Z, sem edição de código depois de E1 | exit **0** e exit **0**; `tsc --noEmit` e `eslint src tests --max-warnings=0` sem erro nem aviso |

### Retentativas do `validate:ui`

O critério 5 do Goal pede **0** retentativas. A configuração da baseline (`retries: 1`) deixa um teste passar na segunda tentativa, e o `validate:ui` só declara isso na saída. Sem os tetos de workers, as duas execuções da árvore final tiveram retentativas, todas em rotas **públicas** que a Agenda não toca (o gate público não tem rota da Agenda; o gate autenticado, que a tem, deu **0** retentativas em E4):

- **E3a (4 retentativas, 0 falhas).** `solicitacao-enviada`, WCAG 2.1 AA, em `mobile-360`, `mobile-390` e `tablet-768`: `Test timeout of 30000ms exceeded`, e passou na repetição; `criar-conta`, "exactly one first-level heading", em `mobile-360`: `worker process exited unexpectedly (code=3221226505, signal=null)` (`0xC0000409`), e passou na repetição.
- **E3b (7 retentativas, 2 falhas).** Retentativas: `criar-conta` e `termos-de-uso` (WCAG, `mobile-360` e `mobile-390`), `entrar` (um `h1`, `mobile-390`), `entrar` (alvos de toque, `mobile-390`: `page.goto: net::ERR_INSUFFICIENT_RESOURCES at http://127.0.0.1:3210/login`) e `link-expirado` (alvos de toque, `notebook-1024`, `Test timeout of 30000ms exceeded while running "beforeEach" hook`). Falhas, que esgotaram a retentativa: `recuperar-senha` (WCAG, `tablet-768`, `Test timeout of 30000ms exceeded` nas duas tentativas) e `entrar` (um `h1`, `tablet-768`, `Test timeout ... while running "beforeEach" hook` e depois `browserContext.close: Target page, context or browser has been closed`). Nenhuma é asserção de layout, contraste, foco ou alvo de toque: são tempo esgotado, falta de recurso e processo morto.

**Causa medida.** A mesma árvore, a mesma configuração e o mesmo comando, mudando só o número de workers: com os 6 workers padrão (E3a e E3b) houve retentativas e falhas; com `CI=1`, que dá **1** worker (E3c), **169** passaram, **21** foram pulados e **0** precisaram de retentativa. Os erros são de esgotamento de recurso do host, e o host o confirma: `FreeVirtualMemory` de 3,2 a 3,3 GB sobre 47,1 GB de memória virtual total (limite de commit) durante as execuções, com **26** processos `chrome` e **24** `claude` abertos, e o log do PostgreSQL de teste anterior registra `CreateProcess() call failed: A non-blocking socket operation could not be completed immediately (error code 1455)`, que é o limite de commit esgotado, às 05:01 no horário local (08:01Z). O mesmo esgotamento derrubou workers do vitest nas quatro tentativas anteriores de E4b (`Worker exited unexpectedly`); a execução final de E4b passou. Há precedente sem o Goal100: a E3 do Goal092 rodada 2 (acima, 04:16Z, árvore do Goal092) teve **3** `flaky` em `recuperar-senha` e `criar-conta`.

**O que isto autoriza e o que não autoriza.** O `validate:ui` com a configuração padrão **não** deu 0 retentativas neste host, e este registro não diz que deu. O 0 de E3c vale para `workers: 1`. A causa foi medida pela troca de workers, **não** pela troca dos arquivos de produção pelos da baseline (não foi feita), e por isso a ligação com o host, e não com o diff, é a hipótese que os dados sustentam, e não uma prova. Nenhum teste de rota da Agenda precisou de retentativa em nenhuma execução. Nada foi tolerado em silêncio: a decisão sobre aceitar `workers: 1` como a medida do critério 5, ou exigir o gate padrão em outro host, é do Tech Lead.

### `visual:compare` do A10, A11, A1 e H3

Início e final (E5, repetido na rodada 3 sobre a árvore final, com os mesmos números da rodada 1), em porcentagem de pixels diferentes, na ordem mobile / tablet em retrato / tablet em paisagem / desktop. O **início** são os números do E5 do Goal092 sobre a baseline `cba8d49`, que o Goal100 cita; a recontagem da baseline pela WU-01 deste Goal não foi entregue a esta unidade, e por isso não é citada. Na rodada 3 foram lidos de novo, em resolução de leitura, os `side-by-side.png` de A10 mobile e A11 desktop; os outros seis pares seguem como descritos abaixo.

| Quadro | Início (E5 do Goal092) | Final (E5 do Goal100) |
| --- | --- | --- |
| A10 Agenda · semana | 12,9 / 5,1 / 5,5 / 4,6 | 17,0 / 5,0 / 5,7 / 4,8 |
| A11 Agenda · mês | 12,9 / 6,9 / 7,8 / 6,3 | 10,9 / 5,3 / 5,7 / 4,6 |
| A1 Agenda · dia | 10,4 / 4,8 / 5,4 / 4,3 | 10,4 / 4,8 / 5,4 / 4,3 |
| H3 Home · WhatsApp desconectado | 8,1 / 4,1 / 3,8 / 3,0 | 8,1 / 4,1 / 3,8 / 3,0 |

**O Dia e a Home não quebraram:** A1 e H3 deram, nos quatro devices, os mesmos números do início. O A11 melhorou nos quatro devices (12,9 para 10,9; 6,9 para 5,3; 7,8 para 5,7; 6,3 para 4,6).

**Onde o A10 piorou, e a causa.** Mobile 12,9 para 17,0, tablet em paisagem 5,5 para 5,7 e desktop 4,6 para 4,8; o tablet em retrato melhorou (5,1 para 5,0). A causa, lida nos `side-by-side.png`: o quadro tem as seis colunas cheias de barras coloridas em toda a semana, e a conta de teste só tem entradas em quinta 1 e sexta 2; a baseline quase não pintava cor em nenhum dos dois lados, e agora cada barra colorida do quadro numa posição onde o app não tem barra (e cada barra do app onde o quadro não tem) conta como diferença. No mobile soma-se o aviso de WhatsApp, que empurra a Semana cerca de 135 px para baixo e põe o eixo, a legenda e o cartão fora do alinhamento do quadro, e a pílula do app diz "Todos os dias" com sete colunas. **A causa é provável, e não foi isolada** (não houve troca dos arquivos de produção pelos da baseline nesta unidade). A porcentagem é tendência, não aprovação.

**O que se vê em cada `side-by-side.png` do A10** (lido na execução E5; protótipo à esquerda ou em cima, app no meio):

- **A10 mobile (402×812, 17,0 %).** Protótipo e app têm a mesma ordem: barra com mês e ano em Literata, segmentado com "Semana" ativo e a pílula com o olho, a linha do intervalo com a contagem à direita ("15 – 20 de setembro" e "31 atendimentos" no quadro; "28 de setembro – 4 de outubro" e "10 atendimentos" no app), o eixo "8h…20h" a cada duas horas, as colunas com a sigla do dia e o número (o de hoje em círculo verde), barras **sem texto** na cor do serviço, a barra dividida em duas cores para Juliana Mendes (Escova + Hidratação), o almoço hachurado, o compromisso só com contorno, a marca da hora atual, as horas fora do horário rebaixadas, a legenda com bolinha de cor e o cartão "Hoje, … · 5 atendimentos" com "Abrir dia ›" e uma pílula por serviço. Difere: o aviso de WhatsApp no topo (divergência 2); falta o chevron ⌄ (3); a pílula diz "Todos os dias" e há a coluna DOM (8); as barras existem só em quinta 1 e sexta 2 (5); falta o tracejado do hold e o "· em confirmação" (4); a legenda e o cartão ficam em parte abaixo da barra de abas por causa do aviso; "Escova ×3" no app e "Escova ×2" no quadro são dado. O botão flutuante de 56 px está no lugar do de D-108.
- **A10 tablet em retrato (768×1024, 5,0 %).** Mesma estrutura, com as barras agora em cartão pequeno de duas linhas (nome e serviço) com o traço de cor à esquerda, como no quadro, incluindo a barra dividida de Juliana Mendes, o cartão tracejado do hold só no quadro, o bloqueio hachurado "Almoço · bloqueio · 1 h" e "Dentista · compromisso pessoal" com contorno. Difere: o aviso no topo desloca tudo para baixo; "Todos os dias" e sete colunas; poucas barras (dado); a legenda aparece cortada na borda de baixo e o cartão de resumo fica abaixo da primeira tela.
- **A10 tablet em paisagem (1024×768, 5,7 %).** Barras de uma linha "Nome · Serviço" com o traço de cor à esquerda, o "Novo" verde na barra, a pílula, a linha do intervalo e a marca da hora atual, como no quadro. Difere: o aviso no topo; sete colunas e "Todos os dias"; barras só em dois dias; a legenda e o cartão de resumo ficam abaixo da barra de abas na captura (o aviso empurra a Semana), e por isso **não foram vistos em paisagem**.
- **A10 desktop (1366×768, 4,8 %).** Sidebar, barra com "Outubro 2026", segmentado centrado, pílula, ‹ › e "Novo", barras "Nome · Serviço" em uma linha e o cartão de duas linhas de Juliana Mendes, bloqueio hachurado, compromisso com contorno e a marca da hora atual. Difere: o aviso no topo; na sidebar, o item "Notificações" e o cartão "WhatsApp desconectado" no lugar de "IA ativa" (divergência 2); sete colunas; só dois dias com barra; a legenda aparece cortada na borda de baixo e o cartão de resumo não entra na captura, **então não foi visto em desktop**.

**O que se vê em cada `side-by-side.png` do A11** (lido na execução E5):

- **A11 mobile (402×812, 10,9 %).** Barra com "Mês" ativo e a pílula, a linha de siglas dos dias, a grade de células com o número do dia e a pilha de traços de 3 px na cor do serviço (bloqueio hachurado), com "+N" embaixo, os dias do mês vizinho em cinza claro, o dia selecionado com fundo azulado e o número em círculo verde, e o cartão de resumo de baixo; o botão flutuante no lugar do quadro. Difere: o aviso no topo; "Todos os dias" e sete colunas (SEG a DOM) em vez de seis; traços só em quinta 1 e sexta 2 (dado); o quadro tem o dia 28 hachurado inteiro (bloqueio de dia inteiro, que a conta não tem); o cartão "Hoje, sexta 2 · 5 atendimentos" começa na borda de baixo, cortado pela barra de abas (o aviso empurra a grade); o hold e o "· em confirmação" (4).
- **A11 tablet em retrato (768×1024, 5,3 %).** Células com até três linhas "Nome · Serviço" com o traço de cor à esquerda, bloqueio hachurado e "+N"; quinta 1 e sexta 2 com as linhas e "+4", sexta 2 selecionada com fundo azulado. Difere: o aviso no topo; sete colunas que cabem na largura, enquanto as seis do quadro passam da borda direita da captura, então o texto das linhas do app corta mais cedo ("Bia Castro · …", "Almoço · blo…") (8); o cartão de resumo fica abaixo da primeira tela.
- **A11 tablet em paisagem (1024×768, 5,7 %).** Células com até duas linhas "Nome · Serviço" e "+5", o dia selecionado azulado, "Novo" na barra, como no quadro. Difere: o aviso; sete colunas; só dois dias com linhas; o quadro mostra três linhas em alguns dias, que a conta não tem; o cartão de resumo fica abaixo da barra de abas, **não visto em paisagem**.
- **A11 desktop (1366×768, 4,6 %).** Sidebar, barra, siglas, células com duas linhas "Nome · Serviço" e "+5", o dia selecionado azulado. Difere: o aviso, a sidebar com "Notificações" e o cartão "WhatsApp desconectado" (2); sete colunas; só dois dias preenchidos; as semanas de baixo vazias, porque o quadro está cheio; o cartão de resumo fica abaixo da primeira tela, **não visto em desktop**.

**Igual ao quadro, e o que isso quer dizer.** Nos oito pares, a estrutura, a ordem dos blocos, os componentes (pílula, linha do intervalo, eixo, barra, legenda, célula com traços ou linhas, cartão de resumo), as cores de serviço, a tipografia e os espaçamentos são os do quadro, e o que sobra está nas divergências 1 a 8 de D-109. O resumo do dia foi visto inteiro só no mobile (e cortado no tablet em retrato, A10); nas demais larguras ele fica abaixo da primeira tela por causa do aviso, e a conferência dele, em tablet e desktop, está nos testes (prova 6), e não na captura. Não é igualdade de pixel: a conferência humana num aparelho real **não foi feita**.

### Controles negativos do §6

Rodados na rodada 3 (FIX-001), depois da última edição de código e depois de E3 a E6, com `npx vitest run tests/goal100-agenda-semana-mes.test.tsx` (21 testes), cada defeito aplicado por substituição de texto no arquivo, o arquivo restaurado a partir dos bytes originais no mesmo passo e o `sha256` conferido antes e depois (um script só, os quatro controles em sequência; a âncora do controle 3 tolera CRLF):

1. `WeekView.tsx`, `appointmentServiceColors(appointment, colors)` trocado por `appointmentServiceColors(appointment, new Map())` (toda barra neutra). `sha256` antes `35387037…f18b46b4`, com defeito `68b5ca85…150d945e`, depois `35387037…f18b46b4` (**IGUAL**). Saída: `Test Files  1 failed (1)`, `Tests  2 failed | 19 passed (21)`; `× token do serviço por atendimento, barra dividida com dois serviços, bloqueio e compromisso com classe de tipo e prefixo no nome acessível` e `× serviço sem cor no catálogo dá barra neutra, com as outras barras na tela`.
2. `MonthView.tsx`, em `tapDay`, o desvio `if (isoDate(day) === focused) { onSelectDay(day); return; }` trocado por `onSelectDay(day); return;` (o Mês volta a abrir o Dia no primeiro toque). `sha256` antes `d6c6f8f2…5617345d`, com defeito `d91d1f3e…18cd65d9`, depois `d6c6f8f2…5617345d` (**IGUAL**). Saída: `Tests  3 failed | 18 passed (21)`; `× o primeiro toque marca a célula e mostra o resumo dela, sem trocar de visualização`, `× 'Abrir dia' abre o Dia na data do resumo, no primeiro toque de outro dia` e `× teclado: Enter seleciona e Espaço no dia marcado abre o Dia`.
3. `occupancy.ts`, em `appointmentEntries`, a linha `if (appointment.status.toUpperCase() === "CANCELLED") continue;` removida (a contagem da semana passa a incluir cancelados). `sha256` antes `d40c45c3…d9949e7d`, com defeito `e4b3507e…6aff0108`, depois `d40c45c3…d9949e7d` (**IGUAL**). Saída: `Tests  2 failed | 19 passed (21)`; `× intervalo dos dias visíveis, atendimentos não cancelados e legenda só com os serviços da semana` e, porque a função é compartilhada, `× um traço por entrada com o token do serviço, '+N' acima do limite, sem cancelado nem intervalo`.
4. `AgendaBoard.tsx`, `{visibleDaysLabel(hiddenWeekdays)}` trocado pelo texto fixo `Seg–Sáb`. `sha256` antes `62a347ee…1c7d8ad5`, com defeito `4616436f…601f323c`, depois `62a347ee…1c7d8ad5` (**IGUAL**). Saída: `Tests  1 failed | 20 passed (21)`; `× 'Todos os dias' sem ocultos, e leva a Configurações › Agenda, na Semana e no Mês`, com `TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Todos os dias"`. Restaurado: `Tests  21 passed (21)`, exit 0.

Com os quatro arquivos restaurados, o mesmo arquivo de teste deu `Tests  21 passed (21)`, exit 0. Cada controle reprova só os testes da prova que ele ataca, e o controle 3 reprova, além da prova 3, um teste da prova 4, porque o defeito está numa função compartilhada.

**Estado da árvore.** `git status --short` lista só os arquivos modificados de `apps/frontend/src/features/agenda/` (`AgendaBoard.tsx`, `DayView.tsx`, `MonthView.tsx`, `WeekView.tsx`, `occupancy.ts`), o `DaySummaryCard.tsx` novo, `apps/frontend/src/shared/styles/avenly-agenda.css`, os testes (`goal100-agenda-semana-mes.test.tsx` novo, `goal016-agenda-views.test.tsx` e `goal016-a11y.test.tsx`) e os três documentos. Nenhum arquivo de configuração (`vitest.config.*`, `playwright.config.*`) está alterado, e nenhum script de `scripts/` foi tocado. `apps/frontend/e2e-results/` é ignorado pelo git, e nenhum resto de controle negativo ficou na árvore. Fora da árvore: um PostgreSQL de teste, em diretório temporário da sessão, foi criado para E4 e E4b (na porta 55433 nas tentativas anteriores; a execução que passou usou `127.0.0.1:55500/ia_bff_test`); o postmaster morto da porta 55432 (PID 27484) não foi tocado.

**Vermelho contra a baseline.** Executado pela WU-03; esta unidade não o reexecutou nem recebeu o número, e por isso não o cita.

**Não feito.** A conferência humana num aparelho real; a Semana e o Mês com semana e mês cheios; o hold na Semana e no resumo; a sheet de dias visíveis (A12); o `validate:ui` com a configuração padrão e 0 retentativas (E3a e E3b tiveram retentativas; só E3c, com 1 worker, deu 0); a medida isolada da causa da piora do A10 (mobile, paisagem e desktop) e da causa das retentativas contra os arquivos da baseline; a conferência do resumo do dia em tablet e desktop por captura.

**Nota de fechamento — review100, 2026-10-02.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Vermelho contra a baseline.** WU-03 da rodada 1, com os arquivos de produção da baseline e a restauração conferida por hash: `Tests  17 failed | 4 passed (21)`. As quatro que passam são declaradas: prova 2 sem regras de horário e prova 2 com a leitura falhada (a baseline não rebaixava nada); prova 5, a Semana abrindo o Dia (comportamento preservado); prova 7, o Dia sem a pílula (a baseline não tinha pílula). A árvore da rodada 1 só difere da aceita no `avenly-agenda.css`, que o jsdom não avalia.
- **Janela das execuções.** "Entre 08:47Z e 09:08Z", no primeiro parágrafo, vale para E1 a E7 menos E4b; E4b terminou depois (o gate autenticado dentro dela começou às 09:16:59Z).
- **Retentativas do `validate:ui` nas WU-09 das rodadas 3 e 4**, com a configuração padrão, na mesma árvore de código: rodada 3, exit 0 em 64,9 s, **163** `passed`, **21** `skipped`, **6** `flaky`, todas em rotas públicas (`politica-de-privacidade`, WCAG, e `criar-conta`, "nothing overflows sideways", em `mobile-360`, `mobile-390` e `tablet-768`; erros `browserContext.newPage: Target crashed` e `Object with guid … was not bound in the connection`); rodada 4, exit 0 em 47,1 s, **168** `passed`, **21** `skipped`, **1** `flaky` (`politica-de-privacidade`, WCAG, `notebook-1024`, `worker process exited unexpectedly (code=3221226505)`). Nenhuma em rota da Agenda; todas passaram na segunda tentativa, e os erros registrados da primeira são de processo e conexão, a mesma família de E3a e E3b. O critério 5 foi aceito pela cláusula de causa medida, com o 0 de E3c (1 worker) e o gate autenticado com **0** retentativas.
- **Gates da rodada 4.** WU-10: `validate:integration` exit 0 em 539779 ms, `total 36, passed 36, failed 0, skipped 0, notRun 0`; gate autenticado (`startTime` 09:33:49Z) **245** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`. O Tech Lead rodou `visual:compare -- --target A10,A11` nas quatro rodadas, sempre com os números finais da tabela acima, e reexecutou na rodada 4 `goal100-agenda-semana-mes`, `goal016-agenda-views`, `goal016-a11y`, `goal092-agenda-dia`, `goal069-agenda-views` e `goal073-agenda-visualizacao`: **75**/**75**.

## Detalhe, cancelar e remarcar iguais ao A5, A8 e A9, e a medida G-7 do gate autenticado, do Goal093 (rodada 1)

Registro da execução final e dos controles do [Goal093](goals/093-detalhe-cancelar-e-remarcar-iguais-ao-prototipo.md) ([D-110](DECISIONS.md), ACCEPTED no [review093](reviews/093-review.md)), escrito pela WU-11 **depois da última edição de código** e depois dos controles. Tudo abaixo foi rodado em 2026-10-02, com a configuração da baseline (`vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` e `next.config.ts` não foram tocados); os controles negativos mexeram nos arquivos de produção só dentro de cada passo, e o `sha256` voltou ao de antes. Texto ainda não aceito: o Tech Lead decide.

**Árvore avaliada (`sha256`).** `AppointmentFlowShell.tsx` `faa9572c…416569d5`, `AgendaDayColumn.tsx` `716eb883…92d177fb`, `AppointmentDetail.tsx` `e7991f72…328d8e05`, `CancelFlow.tsx` `71aa6727…7801fa86`, `RescheduleFlow.tsx` `33966d23…3d707948`, `LifecycleActions.tsx` `bfa98e18…7acdcda3`, `AppointmentHistory.tsx` `c2f6aa6f…464b272b`, `DayView.tsx` `2a68a762…ead3c4dd`, `AgendaBoard.tsx` `3a78c3b8…27938768`, `avenly-agenda.css` `7956a3bb…ec652120`, `authenticated-matrix.spec.ts` `e1e398ed…8c61ef6d`, `goal093-detalhe-cancelar-remarcar.test.tsx` `787d7a17…dc45aad8`, `goal016-a11y.test.tsx` `0cb39a8f…b0ac183e`, `goal016-appointment-create.test.tsx` `8021bd13…efaf5e44`, `goal016-lifecycle-history.test.tsx` `28396af6…1875557d`, `goal016-shell-invariant.test.tsx` `86097825…2f655d59`, `goal021-notify-and-reminder-state.test.tsx` `a89ebd4f…03ba08cc` e `goal069-appointment-detail.test.tsx` `5c3b0a02…e174ec67`.

**Execuções que sustentam as contagens**, cada uma pelo nome:

| Execução | Comando | Quando | Resultado |
| --- | --- | --- | --- |
| E1a | `npm run validate:core` | 11:39:18Z a 11:40:40Z | **exit 1**, e **não conta**: em `test:frontend`, `FATAL ERROR: Zone Allocation failed - process out of memory` e `Worker exited unexpectedly`; `Test Files  138 passed (139)`, `Tests  1537 passed (1549)`, `Errors  1 error` (os 12 testes que faltam são do arquivo cujo worker morreu). Os passos seguintes ficaram `not_run`. Esgotamento de memória do host (ver "Retentativas e falhas por recurso do host") |
| E1b | `npm run validate:core`, de novo, sem edição de código | 11:40:54Z a 11:42:41Z, 107 s | exit 0; **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`; `test:frontend` **139** arquivos e **1549** testes, todos `passed` (`Test Files  139 passed (139)`, `Tests  1549 passed (1549)`); contra **138** e **1522** do Goal100 (E1 dele), são **+1** arquivo e **+27** testes, os do `goal093-detalhe-cancelar-remarcar.test.tsx`; nenhum teste a menos |
| E2 | `npm run test:gate` | 11:42:45Z, 1226 ms | exit 0; **233** testes, **233** `pass`, **0** `fail`, **0** `skipped` (o mesmo número do Goal100) |
| E3a | `npm run validate:ui`, configuração padrão (rodado pela WU-09) | `startTime` 2026-10-02T10:50:41Z, 68065 ms | **163** `expected`, **21** `skipped`, **0** `unexpected`, **6** `flaky` (retentativas; detalhe abaixo) |
| E3b | `CI=1 npm run validate:ui` (a mesma configuração, com `workers: 1` pela condição `process.env.CI` que já existe nela) | `startTime` 2026-10-02T11:36:26.267Z, 155,2 s | exit 0; **169** `expected`, **21** `skipped`, **0** `unexpected`, **0** `flaky`; a saída do passo diz `validate:ui public UI gate retries: 0 — every test passed on its first attempt` |
| E4 | `npm run validate:integration` completo (rodado pela WU-10) | 591877 ms; o gate autenticado dentro dele, `startTime` 2026-10-02T11:19:41Z, 469148 ms | **exit 0.** O gate autenticado dentro dele: **249** `expected`, **0** `unexpected`, **1** `flaky`, num total de **250** testes (os **245** da baseline mais os **5** de G-7, um por largura). **Teve 1 retentativa**; detalhe abaixo |
| E5 | `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55611/atendly_bff_test node scripts/goal033-authenticated-ui-rehearsal.mjs` (o passo `rehearse:goal033-authenticated-ui` de `validate:integration`, rodado direto, contra um PostgreSQL descartável criado e parado por esta unidade), sobre a mesma árvore | `startTime` 2026-10-02T11:45:54.155Z, 461,4 s (`apps/frontend/e2e-results/authenticated/results.json`) | exit 0; **250** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`; a saída diz `authenticated gate retries: 0 — every test passed on its first attempt` |
| E6 | `npm run visual:compare -- --target A5,A8,A9,A1,A6,A10,A11,H3` | cerca de 11:30Z, depois do gate autenticado de E4 | exit 0; 32 pares quadro e largura |
| E7 | `npx vitest run tests/goal093-detalhe-cancelar-remarcar.test.tsx`, em `apps/frontend` | antes dos controles e de novo com cada arquivo restaurado | **27**/**27** |
| E8 | `npm run typecheck` e `npm run lint` em `apps/frontend`, cada um com o exit code lido isolado | 11:43Z, sem edição de código depois de E1b | exit **0** e exit **0** |
| E9 | os quatro controles negativos do §7 | depois de E6 | ver "Controles negativos do §7" |

### G-7 e o gate autenticado

G-7 (`G-7 appointment detail from /agenda, five widths`, em `e2e/authenticated-matrix.spec.ts`, só por acréscimo) parte de `/agenda` na data semeada e abre o atendimento de Ana Paula por clique real, sem `force`: abaixo de 1024 px pelo link da lista do Dia; de 1024 px em diante, pelo dia da semana, pela linha e por "Ver detalhes completos" (a Agenda abre na Semana nessas larguras). Abaixo de 1024 px confere que o quadro está empurrado, que a barra de abas não está renderizada e que "Remarcar" e "Cancelar" estão inteiros dentro da janela e com alvo de ao menos 24 px; de 1024 px em diante, que a coluna da Agenda está ao lado do painel e que exatamente uma linha tem `aria-current="page"`, a do atendimento aberto. Em todas, aplica overflow horizontal, axe (contraste) e foco visível. Nenhum teste existente mudou. A contagem é **250** (245 da baseline mais 5), com **0** retentativas em E5. **E4 teve 1 retentativa**, não em G-7 nem em rota da Agenda: `authenticated-matrix.spec.ts`, "measured, logged in", `tablet-768`, rota `/onboarding/agenda-atendly-pronta`; a tentativa 0 falhou com "did not render its own heading ("Sua Agenda Avenly está pronta") within 20000ms" (20683 ms) e a tentativa 1 passou. A causa **não foi isolada**: a rota é a do onboarding, que este Goal não toca, e a reexecução E5, sobre a mesma árvore, não repetiu a falha; a hipótese que os dados sustentam, e não prova, é a do esgotamento de recurso do host descrito abaixo. G-7 usa `waitForRateLimitBudget` e `watchRateLimitBudget`, a espera pelo orçamento de limite de taxa do BFF que as outras rotas do gate já usam, e passou em E4 e em E5 sem falha de limite; esta unidade **não** mediu à parte a contagem de requisições que a coluna faz, e nada foi cortado dela.

### Retentativas e falhas por recurso do host

O critério 5 do Goal pede **0** retentativas. A configuração da baseline (`retries: 1`) deixa um teste passar na segunda tentativa, e o `validate:ui` só declara isso na saída.

- **E3a, `validate:ui` padrão (6 retentativas, 0 falhas), todas em rotas públicas fora da Agenda.** `accessibility.spec`, "meets WCAG 2.1 AA, contrast included", em `tablet-768`, duas vezes: `Target crashed` e `worker process exited unexpectedly (code=3221226505)`; `accessibility.spec`, "contrast really is being evaluated here", em `mobile-360` (`Test timeout of 30000ms exceeded`) e em `mobile-390` (`page.evaluate: Target crashed`); `viewport-matrix.spec`, "evidence: full-page screenshot", em `mobile-360`, e "the page has exactly one first-level heading", em `mobile-390`, ambas com `Test timeout … while running "beforeEach" hook`. Todas passaram na segunda tentativa.
- **E3b, `CI=1` (1 worker), mesma configuração, na mesma árvore:** **169** passaram, **21** foram pulados e **0** precisaram de retentativa.
- **E1a, `validate:core`:** o worker do vitest morreu por memória (`Zone Allocation failed - process out of memory`) e a repetição imediata, E1b, passou em tudo.
- **E4, gate autenticado:** a retentativa do onboarding acima.

**Causa medida.** Mesma árvore, mesma configuração e mesmo comando, mudando só o número de workers: com os 6 workers padrão (E3a) houve 6 retentativas; com `CI=1` (E3b), 0. Os erros são de esgotamento de recurso do host (`Target crashed`, `worker process exited unexpectedly`, tempo esgotado em `beforeEach`, `Zone Allocation failed`), e o host o confirma: logo depois de E1a, o `FreeVirtualMemory` era de cerca de 3,6 GB sobre 49,4 GB de memória virtual total (limite de commit), com 24 processos `chrome` e 35 `node` abertos. Há precedente sem este Goal: Goal092 (rodada 2) e Goal100 (rodadas 1 a 4), nas seções acima, com a mesma família de erros e a mesma troca de workers.

**O que isto autoriza e o que não autoriza.** O `validate:ui` com a configuração padrão **não** deu 0 retentativas neste host, e este registro não diz que deu; o 0 de E3b vale para `workers: 1`. O gate autenticado deu 0 retentativas em E5 e 1 em E4. A causa foi medida pela troca de workers, **não** pela troca dos arquivos de produção pelos da baseline (não foi feita), e por isso a ligação com o host é a hipótese que os dados sustentam, e não uma prova. Nenhum teste de rota da Agenda nem G-7 precisou de retentativa em nenhuma execução. Nada foi tolerado em silêncio: a decisão sobre aceitar `workers: 1` como a medida do critério 5 é do Tech Lead.

### `visual:compare` de A5, A8, A9, A1, A6, A10, A11 e H3

Final (E6), em porcentagem de pixels diferentes, na ordem mobile / tablet em retrato / tablet em paisagem / desktop:

| Quadro | Final (E6) |
| --- | --- |
| A5 Agendamento · detalhe | 7,9 / 3,4 / 7,9 / 6,3 |
| A8 Agendamento · cancelar | 6,3 / 4,6 / 7,9 / 5,8 |
| A9 Agendamento · remarcar | 13,8 / 8,1 / 11,7 / 9,6 |
| A1 Agenda · dia | 10,4 / 4,8 / 5,4 / 4,3 |
| A6 Novo agendamento | 14,5 / 9,5 / 10,8 / 9,1 |
| A10 Agenda · semana | 17,0 / 5,0 / 5,7 / 4,8 |
| A11 Agenda · mês | 10,9 / 5,3 / 5,7 / 4,6 |
| H3 Home · WhatsApp desconectado | 8,1 / 4,1 / 3,8 / 3,0 |

**O início não está aqui.** A recontagem da baseline (`visual:compare` do início, WU-01) e o vermelho das provas contra a baseline (WU-03) não foram entregues a esta unidade, e por isso não são citados. A1, A10, A11 e H3 dão, nos quatro devices, **os mesmos números que a seção do Goal100 acima registra como finais sobre a baseline** (A1 10,4 / 4,8 / 5,4 / 4,3; A10 17,0 / 5,0 / 5,7 / 4,8; A11 10,9 / 5,3 / 5,7 / 4,6; H3 8,1 / 4,1 / 3,8 / 3,0): não pioraram, mas esta unidade não os recontou na baseline. O A6 (`/agenda/novo`) não teve nenhum arquivo tocado e continua a tela antiga com a coluna `DayList` de D-098 (a), que é do Goal101; lidos nesta unidade, os `side-by-side.png` do A6 em mobile e em desktop mostram a página com cabeçalho "Voltar" e título de página, onde o quadro tem a sheet com X, e, em desktop, o painel com a lista do dia à direita em vez da Agenda em Dia. Os `side-by-side.png` de A1, A10, A11 e H3 **não foram abertos** por esta unidade.

**O que se vê em cada `side-by-side.png` do A5** (lido nesta unidade, na execução E6; protótipo à esquerda ou em cima, app no meio):

- **A5 mobile (402×812, 7,9 %).** Tela empurrada sem barra de abas: barra com voltar e "•••", o horário em Literata ("14:00 – 14:45") com o selo "Confirmado" ao lado, o avatar "AP" com nome, telefone e o botão "Conversa", "Serviços" com duração, preço e "Total", "Lembrete", "Observações" e "Histórico", e o rodapé fixo com "Remarcar" e "Cancelar". Estrutura, componentes, tipografia, cores e espaçamentos batem com o quadro.
- **A5 tablet em retrato (768×1024, 3,4 %).** A mesma tela empurrada em duas colunas, como o quadro: à esquerda horário, cliente e serviços; à direita lembrete, observações e histórico; sem barra de abas.
- **A5 tablet em paisagem (1024×768, 7,9 %).** A coluna da Agenda à esquerda ("Outubro 2026", Dia · Semana · Mês, "Novo", a tira SEG–DOM e a lista do dia, com a linha do agendamento marcada) e o detalhe no painel, com o "•••" na barra do painel.
- **A5 desktop (1366×768, 6,3 %).** O mesmo arranjo de paisagem, com a sidebar.
- **O que ainda difere nos quatro, todo declarado em D-110:** o aviso "Atendimento automático parado / Reconectar WhatsApp" empurra o conteúdo, e a sidebar mostra "Notificações" (divergência 2); o dia e o horário são os da conta (2 de outubro, 14:00–14:45, contra 19 de setembro, 15:30–16:15); o telefone "(11) 99123-4567 · 1 atendimento" no lugar de "+55 11 … · 9 atendimentos"; o lembrete "Não enviado: a antecedência configurada já tinha passado." no lugar de "Será enviado quinta, 18/09…"; o histórico "Criado por Camila Reis" e "Sobreposição autorizada…" no lugar de "Criado pela IA na conversa com Ana Paula"; sem "Adicionar" em Observações (divergência 4); a lista do dia com outros dados (divergência 3).

**O que se vê em cada `side-by-side.png` do A8:**

- **A8 mobile (6,3 %).** Sheet inferior sobre o detalhe escurecido: "Cancelar este agendamento?" (título), o resumo "Ana Paula · Corte feminino" com "sexta, 02/10 às 14:00", a caixa "Avisar a cliente pelo WhatsApp" marcada, o campo "Motivo (opcional, só para você)", o botão vermelho "Cancelar agendamento" e "Voltar".
- **A8 tablet em retrato (4,6 %), tablet em paisagem (7,9 %) e desktop (5,8 %).** O mesmo conteúdo como diálogo central sobre o detalhe escurecido; em paisagem e em desktop a coluna da Agenda aparece atrás do diálogo.
- **O que ainda difere:** o subtítulo do aviso ("Cancelamento é uma alteração relevante: recomendamos avisar o cliente." no app, "A IA envia o aviso e pergunta se ela quer outro horário." no quadro; divergência 6, porque o texto do quadro não foi comprovado no sistema) e as divergências 2 e 3 (aviso de WhatsApp, data e dados).

**O que se vê em cada `side-by-side.png` do A9:**

- **A9 mobile (13,8 %) e tablet em retrato (8,1 %).** Em uma coluna: "Remarcar" com X, o resumo com avatar ("AP Ana Paula · Corte feminino · 45 min · R$ 90"), "Horário atual" riscado e "Novo horário", a faixa de datas, "Horário · sexta, livres para 45 min" com os horários, "Outro horário", o interruptor "Avisar a cliente pelo WhatsApp" com "Recomendado: a data e o horário mudaram." e o CTA "Confirmar novo horário".
- **A9 tablet em paisagem (11,7 %) e desktop (9,6 %).** A coluna da Agenda à esquerda e o painel de remarcação, em duas colunas, à direita.
- **O que ainda difere:** o estado inicial: o quadro mostra "Sáb, 20/09 · 10:30" já escolhido e o CTA habilitado (verde), e o app abre com "Novo horário —" e o CTA desabilitado, mostrando os horários livres reais da conta (09:00, 13:00 e 17:00 em sexta 02/10); mais as divergências 2 e 3. É a maior porcentagem dos três quadros pela soma desse estado, do aviso de WhatsApp e dos dados.

**Igual ao quadro, e o que isso quer dizer.** Nos doze pares de A5, A8 e A9, a estrutura, a ordem dos blocos, os componentes, a tipografia, as cores e os espaçamentos são os do quadro, e o que sobra está nas divergências de D-110. Não é igualdade de pixel, e a conferência humana num aparelho real **não foi feita**.

### Controles negativos do §7

Rodados depois da última edição de código, com `npx vitest run tests/goal093-detalhe-cancelar-remarcar.test.tsx` (27 testes), cada defeito aplicado por substituição de texto, o arquivo restaurado a partir dos bytes originais no mesmo passo e o `sha256` conferido antes e depois (cópias dos quatro arquivos em diretório temporário da sessão, e `sha256sum` antes e depois):

1. **A coluna da Agenda montada abaixo de 1024 px** (prova 1). `AppointmentFlowShell.tsx`, `if (!appointmentRoute || !wide) return page;` trocado por `if (!appointmentRoute) return page;`. `sha256` antes `faa9572cfea3a76201ccc201b749660c86499bd0b1b31c881c1a9ef0416569d5`, depois o mesmo (**IGUAL**). Saída: `Test Files  1 failed (1)`, `Tests  4 failed | 23 passed (27)`; `× '/agenda/agendamento' abaixo de 1024 px é tela empurrada: sem coluna, sem leituras dela e sem barra de abas`, o mesmo para `'/agenda/cancelar'` e `'/agenda/reagendar'`, com `AssertionError: expected <aside …(2)>…(1)</aside> to be null`, e, de forma colateral, `× mostra horário, status, cliente, serviços, lembrete, observações e histórico`.
2. **A coluna passa a chamar `useShellConfig`** (prova 2). `AgendaDayColumn.tsx` passou a receber a configuração da tela por propriedade (`shellConfig`) e a chamar `useShellConfig(shellConfig)`, e `AppointmentFlowShell.tsx` a passá-la. `sha256` antes `716eb883821588cec193954c656fec472c1ddabc6d7d3bcfa8a47a0192d177fb` e `faa9572cfea3a76201ccc201b749660c86499bd0b1b31c881c1a9ef0416569d5`, depois os mesmos (**IGUAIS**). Saída: `Tests  3 failed | 24 passed (27)`; `× '/agenda/agendamento' em '1280 px'`, `× '/agenda/cancelar' em '1280 px'` e `× '/agenda/reagendar' em '1280 px'`, com `AssertionError: expected 2 to be 1 // Object.is equality`. Três tentativas anteriores deste controle deram `Maximum update depth exceeded` (uma segunda `useShellConfig` com configuração diferente da da tela entra em laço de atualização) ou não aplicaram a substituição por causa do CRLF do arquivo; a registrada é a que reprova pela asserção da prova.
3. **O cancelamento volta a pedir confirmação antes de enviar** (prova 5). `CancelFlow.tsx`, com um estado `reviewing` em que o primeiro toque em "Cancelar agendamento" só mostra um botão "Confirmar cancelamento". `sha256` antes `71aa6727c69dff2b3e7764eefa8c6af2bc1651b8ab7593e9aeda3a997801fa86`, depois o mesmo (**IGUAL**). Saída: `Tests  2 failed | 25 passed (27)`; `× um toque em Cancelar agendamento envia uma vez, com comments e notifyCustomer marcado, sem diálogo intermediário` e `× desmarcar o aviso envia notifyCustomer false`, com `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`.
4. **"Conversa" aparece sem `customerId`** (prova 4). `AppointmentDetail.tsx`, `{customerId && conversationId && (` trocado por `{(`, com o `href` caindo em `conversationId ?? ""`. `sha256` antes `e7991f7263fe84e9c745c89de093c6eadbcee028ff3297ea6c9cdcd4328d8e05`, depois o mesmo (**IGUAL**). Saída: `Tests  3 failed | 24 passed (27)`; `× sem customerId, o botão não aparece, nada é lido e não há erro` e `× com a leitura da conversa falhada, o botão não aparece e a tela não mostra erro`, ambas com `expect(element).not.toBeInTheDocument()`, e, de forma colateral por causa do `href`, `× com customerId, Conversa leva à primeira conversa da cliente` (`expect(element).toHaveAttribute("href", "/conversas/conv-9")`).

Com os quatro arquivos restaurados, o mesmo arquivo de teste deu `Tests  27 passed (27)`. Cada controle reprova os testes da prova que ele ataca, e os controles 1 e 4 reprovam também um teste colateral da prova 3 e da prova 4, como a saída mostra.

**Estado da árvore.** `git status --porcelain=v1 -uall` lista só os arquivos autorizados: os modificados de `apps/frontend/src/features/agenda/` (`AgendaBoard.tsx`, `AppointmentDetail.tsx`, `AppointmentFlowShell.tsx`, `AppointmentHistory.tsx`, `CancelFlow.tsx`, `DayView.tsx`, `LifecycleActions.tsx`, `RescheduleFlow.tsx`), `AgendaDayColumn.tsx` novo, `apps/frontend/src/shared/styles/avenly-agenda.css`, `apps/frontend/e2e/authenticated-matrix.spec.ts`, os testes (`goal093-detalhe-cancelar-remarcar.test.tsx` novo e os seis ajustados) e os três documentos. Nenhum arquivo de configuração está alterado, e nenhum resto de controle negativo ficou na árvore. `apps/frontend/e2e-results/` é ignorado pelo git. Fora da árvore, o PostgreSQL descartável de E5 (porta 55611, em diretório temporário da sessão) foi criado e parado por esta unidade; o postmaster morto da porta 55432 (PID 27484) não foi tocado.

**Asserções existentes mudadas (§6)**, cada uma pelo motivo, nenhum teste removido nem pulado: `goal016-a11y` (a confirmação de cancelamento foi reescrita para a sheet de passo único: foco, axe e Esc voltando ao detalhe); `goal016-appointment-create` (remarcar sem "Revisar alteração", com "Confirmar novo horário" e "Outro horário"; cancelar com "Cancelar agendamento" no lugar de "Confirmar cancelamento"); `goal016-lifecycle-history` (as ações do ciclo abertas pelo menu "•••", como `menuitem`, e o estado como selo); `goal016-shell-invariant` (menu "Não compareceu" e "Voltar" nas quatro rodadas, "Outro horário" e o rótulo "Motivo (opcional, só para você)"); `goal021-notify-and-reminder-state` ("Avisar a cliente pelo WhatsApp" no lugar de "Notificar cliente", "Recomendado: a data e o horário mudaram", os textos do lembrete "Será enviado…", "Enviado …", "Não enviado: …" e "1º lembrete: ", e as ações pelo menu); `goal069-appointment-detail` (histórico sem o prefixo "Por " e com "pela equipe" sem nome, e as ações pelo menu). `goal084-phone-display` não mudou.

**Vermelho contra a baseline.** Da WU-03; esta unidade não o reexecutou nem recebeu o número, e por isso não o cita.

**Não feito.** A conferência humana num aparelho real; o `validate:ui` com a configuração padrão e 0 retentativas (E3a teve 6; só E3b, com 1 worker, deu 0); a medida isolada da causa das retentativas contra os arquivos da baseline e da retentativa do onboarding em E4; os `side-by-side.png` de A1, A10, A11 e H3 abertos por esta unidade; o `visual:compare` do início e o vermelho das provas contra a baseline (WU-01 e WU-03); o texto do aviso de cancelamento do A8.

**Nota de fechamento — review093, 2026-10-02.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Vermelho contra a baseline.** WU-03 da rodada 1, com os dez arquivos de produção restaurados ao conteúdo de `a5a04bc` e a restauração conferida por `sha256` antes e depois: **24** dos **27** testes de `goal093-detalhe-cancelar-remarcar.test.tsx` reprovam e **3** passam. Os três que passam são declarados: a prova 2 a 390 px nas três rotas, porque uma chamada de `useShellConfig` abaixo de 1024 px já valia na baseline. As falhas são estruturais (menu "Mais ações do agendamento", sheet única, coluna da Agenda e barra empurrada ausentes) e de conteúdo.
- **`visual:compare` do início.** WU-01, `--target A5,A8,A9,A1,A6,A10,A11,H3`, antes de qualquer edição, na ordem mobile / tablet em retrato / tablet em paisagem / desktop: A5 **8,1 / 4,2 / 6,3 / 5,1**; A8 **52,8 / 78,8 / 80,6 / 85,5**; A9 **13,4 / 9,0 / 10,2 / 8,7**; A1, A6, A10, A11 e H3 iguais aos finais de E6. Contra o final, o A8 caiu nos quatro devices (o fluxo antigo era uma página em dois passos); o A5 melhorou no mobile e no retrato e piorou em paisagem (6,3 para 7,9) e desktop (5,1 para 6,3); o A9 melhorou no retrato e piorou no mobile (13,4 para 13,8), em paisagem (10,2 para 11,7) e em desktop (8,7 para 9,6). A causa provável das pioras é a da leitura dos `side-by-side.png` acima (aviso de WhatsApp, dados da conta e, no A9, o estado inicial sem horário escolhido); não foi isolada.
- **Primeira execução de `validate:integration`.** A WU-10 original terminou com exit 1: **5** falhas em **250**, os cinco testes de G-7, com `the appointment detail did not render the customer's heading`, e **245** passaram. A DIAG-001 trocou o `<strong>` do nome da cliente em `AppointmentDetail.tsx` por `<h2>`, com o seletor `.agenda-appt-customer-text h2` em `avenly-agenda.css` mantendo o tamanho e a fonte do `<strong>`, sem tocar no spec nem em configuração. E4 é a segunda execução, sobre a árvore com essa troca, que é a árvore avaliada acima.
- **Conferência do Tech Lead.** `visual:compare -- --target A5,A8,A9`, exit 0, com os doze `side-by-side.png` abertos: sobram só as divergências 1 a 8 de D-110. Reexecutou `goal093-detalhe-cancelar-remarcar`, `goal016` (quatro arquivos), `goal021-notify-and-reminder-state`, `goal069-appointment-detail`, `goal084`, `goal088` e `goal100`: **156**/**156**. O critério 5 foi aceito pela cláusula de retentativa medida e reportada: a retentativa de E4 é de rota de onboarding fora da Agenda, com causa não isolada, e E5 deu **0** na mesma árvore; as **6** de E3a são de rotas públicas, e E3b deu **0** com 1 worker.

## Novo agendamento igual ao A6, e a medida G-8 do gate autenticado, do Goal101 (rodada 3)

Registro da execução final e dos controles do [Goal101](goals/101-novo-agendamento-igual-ao-prototipo.md) ([D-111](DECISIONS.md), PROPOSED), **refeito na rodada 3 (FIX-001) sobre a árvore final**, depois da última edição de código (a cor do rótulo do dia fechado em `avenly-agenda.css`). Tudo abaixo foi rodado em 2026-10-02 sobre essa árvore; os números das rodadas 1 e 2 que ela substitui não são mais citados como finais. Nenhum arquivo de configuração está alterado: a rodada 2 havia deixado `apps/bff/vitest.config.ts` (`maxWorkers: 4`) e `apps/frontend/playwright.config.ts` (`workers: process.env.CI ? 1 : 2`) modificados, o que o Goal proíbe até para diagnóstico; os dois foram restaurados ao de `HEAD` (`git checkout -- <arquivo>`), e `git status --porcelain=v1 -uall` não lista mais nenhum `vitest.config.*` nem `playwright.config.*`. Os controles negativos mexeram nos arquivos de produção só dentro de cada passo, e o `sha256` voltou ao de antes. Texto ainda não aceito: o Tech Lead decide.

**Árvore avaliada (`sha256`, conferida no fim da rodada 3).** `AppointmentFlowShell.tsx` `7065b4bf…3c891086`, `AgendaDayColumn.tsx` `b12ebea9…7f784022`, `AppointmentForm.tsx` `7ef9eaf0…9ab540f4`, `NewAppointmentFields.tsx` `6f39ec97…2dff9603`, `ListDetail.tsx` `6d733556…504e92dc`, `avenly-agenda.css` `3d848087…c8dd05cc`, `authenticated-matrix.spec.ts` `0d9e301f…f771e7a9`, `goal101-novo-agendamento.test.tsx` `341e98a0…4411728b`, `goal016-appointment-create.test.tsx` `d72aad1c…60e14e68` e `goal083-new-appointment.test.tsx` `6846afd0…2c415b30`. Todas as execuções E1 a E8 abaixo foram rodadas nesta rodada, nesta ordem, **depois** da última edição de código, e nenhuma edição de código aconteceu depois delas; só os documentos foram escritos depois.

**Execuções que sustentam as contagens**, cada uma pelo nome:

| Execução | Comando | Quando | Resultado |
| --- | --- | --- | --- |
| E1 | `VITEST_MAX_WORKERS=2 npm run validate:core` | depois da última edição de código | exit 0; **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`; `test:frontend` **140** arquivos e **1564** testes, todos `passed` (`Test Files  140 passed (140)`, `Tests  1564 passed (1564)`); contra **139** e **1549** do Goal093 são **+1** arquivo e **+15** testes, os do `goal101-novo-agendamento.test.tsx`; nenhum teste a menos. **Duas execuções anteriores sem a variável falharam em `test:frontend` por memória do host**, ver "Falhas por recurso do host" |
| E2 | `npm run test:gate` | depois de E1 | exit 0; **233** testes, **233** `pass`, **0** `fail`, **0** `skipped` (o mesmo número do Goal093) |
| E3a | `npm run validate:ui`, configuração padrão | depois de E2; `startTime` 2026-10-02T14:09:05.447Z, 51,9 s | exit 0; **167** `expected`, **21** `skipped`, **0** `unexpected`, **2** `flaky` (retentativas; ver abaixo). A saída diz `validate:ui public UI gate retries: 2 test(s) needed a retry — mobile-390 › entrar > nothing overflows sideways; tablet-768 › solicitacao-enviada > meets WCAG 2.1 AA, contrast included` |
| E3b | `CI=1 npm run validate:ui` (a mesma configuração, com `workers: 1` pela condição `process.env.CI` que já existe nela) | depois de E3a; `startTime` 2026-10-02T14:10:03.433Z, 157,9 s | exit 0; **169** `expected`, **21** `skipped`, **0** `unexpected`, **0** `flaky`; a saída diz `validate:ui public UI gate retries: 0 — every test passed on its first attempt` |
| E4 | `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55556/atendly_bff_test npm run validate:integration` completo, num PostgreSQL 18 descartável em loopback criado só para esta execução (receita deste documento; porta 55556 porque a 55432 estava ocupada por outro processo) | depois de E3b | **exit 0**, `validate:integration PASSED against 127.0.0.1:55556/atendly_bff_test`. Gate autenticado dentro dele, `startTime` 2026-10-02T14:22:31.648Z, 471,3 s (`apps/frontend/e2e-results/authenticated/results.json`): **255** `expected`, **0** `unexpected`, **0** `flaky`, **0** `skipped`, num total de **255** testes (os **250** da baseline mais os **5** de G-8, um por largura); a saída diz `authenticated gate retries: 0 — every test passed on its first attempt`. **0** retentativas, por isso o gate autenticado não foi rodado de novo direto. Esta execução já tem a leitura nova de `settings.get` em `/agenda/novo` (FIX-001 da rodada 2) e a cor nova do rótulo do dia fechado, que as rodadas anteriores não tinham. Duas tentativas anteriores falharam, ver "Falhas por recurso do host" |
| E5 | `npm run visual:compare -- --target A6,A1,A5,A8,A9,A10,A11,H3` | depois de E4 | exit 0; 32 pares quadro e largura |
| E6 | `npx vitest run tests/goal101-novo-agendamento.test.tsx`, em `apps/frontend` | com a árvore intacta antes dos controles e de novo depois da restauração de cada arquivo | **15**/**15** nas duas |
| E7 | `npm run typecheck` e `npm run lint` em `apps/frontend`, cada um com o exit code lido isolado | depois de E2 | exit **0** e exit **0** |
| E8 | os quatro controles negativos do §7 | depois de E5 | ver "Controles negativos do §7" |

### G-8 e o gate autenticado

G-8 (`G-8 new appointment from /agenda, five widths`, em `e2e/authenticated-matrix.spec.ts`, só por acréscimo) parte de `/agenda` na data semeada e abre `/agenda/novo` pelo controle de criar da Agenda, por clique real, sem `force`. Abaixo de 1024 px confere que a barra de abas e o botão flutuante não estão renderizados e que o CTA "Criar agendamento" e o "×" estão inteiros dentro da janela e com alvo de ao menos 24 px; de 1024 px em diante, que a coluna da Agenda está à esquerda do formulário, sem sobreposição, e que nenhuma linha dela tem `aria-current="page"`. Em todas, aplica as verificações que o gate já aplica às rotas autenticadas (overflow horizontal, axe e foco visível). Nenhum teste existente mudou. A contagem é **255** (250 da baseline mais 5), todos `expected` em E4 (a execução da rodada 3, sobre a árvore final), com **0** retentativas. Esta unidade **não** mediu à parte a contagem de requisições que a coluna faz ao BFF; G-8 passou em E4 sem falha de limite de taxa, e nada foi cortado da coluna.

### Retentativas do validate:ui

O critério 5 do Goal pede **0** retentativas. A configuração da baseline (`retries: 1`) deixa um teste passar na segunda tentativa, e o `validate:ui` só declara isso na saída. A configuração **não foi alterada** nesta rodada: a mudança de `workers` que a rodada 2 havia feito em `playwright.config.ts` foi desfeita.

- **E3a, `validate:ui` padrão (2 retentativas, 0 falhas).** Os dois testes são de rotas públicas fora da Agenda (`entrar` em 390 px e `solicitacao-enviada` em 768 px), e o erro registrado da primeira tentativa é `browserContext.newPage: Target crashed`, a mesma família dos Goals 092, 100 e 093 abaixo.
- **E3b, `CI=1` (1 worker), mesma configuração, na mesma árvore:** **169** passaram, **21** foram pulados e **0** precisaram de retentativa.
- **E4, gate autenticado:** **0** retentativas, dentro de `validate:integration`.

**Causa medida.** Mesma árvore, mesma configuração e mesmo comando, mudando só o número de workers: com os workers padrão (E3a) houve 2 retentativas, com `Target crashed`; com `CI=1` (E3b), 0. O padrão e a troca de workers são os mesmos registrados nas seções do Goal092, do Goal100 e do Goal093 acima. A causa foi medida pela troca de workers, **não** pela troca dos arquivos de produção pelos da baseline. O host estava com `FreeVirtualMemory` de ~3,1 GB de ~47 GB de limite de commit (`Win32_OperatingSystem`, lido antes de E1), com várias sessões e o WSL residentes; isso é coerente com esgotamento de recurso, mas a ligação continua sendo hipótese sustentada pelos dados, e não prova. Nenhuma das 2 retentativas é em rota da Agenda.

**O que isto autoriza e o que não autoriza.** O `validate:ui` com a configuração padrão **não** deu 0 retentativas neste host, e este registro não diz que deu; o 0 de E3b vale para `workers: 1`. O gate autenticado deu 0 retentativas. Nada foi tolerado em silêncio: a decisão sobre aceitar `workers: 1` como a medida do critério 5 é do Tech Lead.

### Falhas por recurso do host (reexecutadas, sem editar configuração)

O Goal manda reexecutar ou reportar a falha de gate por ambiente, nunca corrigi-la editando configuração. Foi o que se fez, e todas as tentativas que falharam estão aqui:

- **`validate:core`, 2 tentativas, sem variável.** `test:frontend` falhou nas duas com `FATAL ERROR: Zone Allocation failed - process out of memory` e `Worker exited unexpectedly` do pool de forks do vitest (1ª: `Test Files  139 passed (140)`, `Tests  1561 passed (1564)`, 1 erro; 2ª: `Test Files  129 passed (138)`, `Tests  1368 passed (1488)`, 11 erros). Nenhum teste reprovou por asserção. `npm test` direto em `apps/frontend` com `VITEST_MAX_WORKERS=2` (variável de ambiente do vitest, que não é arquivo de configuração) deu `Test Files  140 passed (140)`, `Tests  1564 passed (1564)`, e `validate:core` inteiro com a mesma variável deu E1.
- **`validate:integration`, 3 tentativas.** (1) Sem variável: `test:bff-integration` com `Test Files  1 failed | 62 passed (63)`, `Tests  1 failed | 473 passed (474)`; o teste que reprovou foi `goal023-retention-sweep.test.ts > o piso por negócio tira da fila quem acabou de ser varrido por inteiro`, com `Error: Test timed out in 5000ms`, com o host sob a pressão de memória acima. (2) Com `VITEST_MAX_WORKERS=3`: `test:bff-integration` passou (`63 passed`, `474 passed`), mas `test:ai-orchestrator-transport-durability` reprovou 2 testes (`expected +0 to be 1`) em `session-durability.test.ts` e `transport-durability.test.ts`; a hipótese é que a variável sobrepõe a configuração de workers desse pacote, que serializa os arquivos que dividem o mesmo banco, e por isso ela **não** foi usada na tentativa seguinte (hipótese: a causa não foi isolada por um controle). (3) Sem variável, E4: exit 0, com `apps/bff/vitest.config.ts` no de `HEAD`, e portanto sem o `maxWorkers: 4` da rodada 2.

### `visual:compare` de A6, A1, A5, A8, A9, A10, A11 e H3

Final (E5), em porcentagem de pixels diferentes, na ordem mobile / tablet em retrato / tablet em paisagem / desktop:

| Quadro | Final (E5) |
| --- | --- |
| A6 Novo agendamento | 16,0 / 9,0 / 12,4 / 10,3 |
| A1 Agenda · dia | 10,4 / 4,8 / 5,4 / 4,3 |
| A5 Agendamento · detalhe | 7,9 / 3,4 / 7,9 / 6,3 |
| A8 Agendamento · cancelar | 6,3 / 4,6 / 7,9 / 5,8 |
| A9 Agendamento · remarcar | 13,7 / 8,0 / 11,7 / 9,6 |
| A10 Agenda · semana | 17,0 / 5,0 / 5,7 / 4,8 |
| A11 Agenda · mês | 10,9 / 5,3 / 5,7 / 4,6 |
| H3 Home · WhatsApp desconectado | 8,1 / 4,1 / 3,8 / 3,0 |

**O início (`visual:compare` sobre a baseline `29626e0`).** Medido no FIX-001 da rodada 2, com os seis arquivos de produção do Goal (`AgendaDayColumn.tsx`, `AppointmentFlowShell.tsx`, `AppointmentForm.tsx`, `NewAppointmentFields.tsx`, `ListDetail.tsx` e `avenly-agenda.css`) trocados pelos de `HEAD` (`git show HEAD:<arquivo>`), as cópias finais guardadas fora do repositório e restauradas por cópia, com `sha256` idêntico antes e depois (**IGUAIS**). Em mobile / tablet em retrato / tablet em paisagem / desktop: **A6 14,5 / 9,5 / 10,8 / 9,1**; A1 10,4 / 4,8 / 5,4 / 4,3; A5 7,9 / 3,4 / 7,9 / 6,3; A8 6,3 / 4,6 / 7,9 / 5,8; A9 13,7 / 8,0 / 11,7 / 9,6; A10 17,0 / 5,0 / 5,7 / 4,8; A11 10,9 / 5,3 / 5,7 / 4,6; H3 8,1 / 4,1 / 3,8 / 3,0. Só o A6 muda entre o início e o final; os outros sete quadros dão os mesmos números nos dois (o A9 tem 0,1 ponto de diferença no mobile e no retrato contra o registro do Goal093, o que é ruído de captura, porque o início de hoje já dá 13,7 / 8,0). Esta medida é a do FIX-001; a recontagem da WU-01 não é citada, porque a medida abaixo a substitui. A1, A10, A11 e H3 dão os mesmos números que o Goal093 e o Goal100 registram como finais (A1 10,4 / 4,8 / 5,4 / 4,3; A10 17,0 / 5,0 / 5,7 / 4,8; A11 10,9 / 5,3 / 5,7 / 4,6; H3 8,1 / 4,1 / 3,8 / 3,0); A5 e A8 dão os do E6 do Goal093 (A5 7,9 / 3,4 / 7,9 / 6,3; A8 6,3 / 4,6 / 7,9 / 5,8); o A9 dá 13,7 / 8,0 / 11,7 / 9,6 contra 13,8 / 8,1 / 11,7 / 9,6, **0,1 ponto a menos** no mobile e no retrato; e o A6 dá **16,0 / 9,0 / 12,4 / 10,3** contra 14,5 / 9,5 / 10,8 / 9,1 do E6 do Goal093, que é a medida que o Goal101 cita como a última. **O A6 piorou em mobile (14,5 para 16,0), em paisagem (10,8 para 12,4) e em desktop (9,1 para 10,3), e melhorou no retrato (9,5 para 9,0).** O início medido no FIX-001 (acima) confirma que os números de 14,5 / 9,5 / 10,8 / 9,1 são os da baseline. A causa da piora **não foi isolada por medida**. A leitura dos `side-by-side.png` abaixo mostra que a estrutura bate com o quadro e que o que difere é o estado da conta de teste e os dados (sem horário livre, o quadro tem chips de horário e o app tem "Nenhum horário disponível para esta seleção." e o CTA desabilitado e sem sufixo; a tira de datas começa em hoje; um serviço a mais; o aviso de WhatsApp; o mês); a hipótese, não provada, é que a soma disso explica o aumento. A porcentagem é tendência, e a leitura é a dos `side-by-side.png`. Os `side-by-side.png` de A1, A5, A8, A9, A10, A11 e H3 **não foram abertos** por esta unidade; os números deles estão idênticos aos dos Goals anteriores, exceto o A9 (−0,1 ponto).

**O que se vê em cada `side-by-side.png` do A6** (relido na rodada 3, na execução E5, sobre a árvore final; protótipo à esquerda ou em cima, app no meio):

- **A6 mobile (402×812, 16,0 %).** Tela empurrada sem barra de abas, como o quadro: "×" à esquerda e "Novo agendamento" centralizado, o chip "Ana Paula" com "Trocar", "Serviços" com os chips de nome e duração e "Outro, sem cadastro", a soma "2 serviços · 1 h 25 · A partir de R$ 150,00", "Data" com a tira e o ícone de calendário, "Horário · livres para 1 h 25" e "Outro horário", e o rodapé com a razão "Escolha um horário." e o CTA "Criar agendamento". O que difere: o aviso "Atendimento automático parado / Reconectar WhatsApp" no topo empurra tudo para baixo (divergência 2); o app tem um serviço a mais, "Coloração 1 h 30", e a ordem dos chips muda por causa dele; a tira de datas começa em "SEX 2", e não em "QUI 18" (divergência 3); no lugar dos chips 09:00, 10:30, 14:00 e 16:00 aparece "Nenhum horário disponível para esta seleção." e o CTA fica desabilitado e sem o sufixo "· sex 19, 14:00" (divergência 3, estado); "Adicionar observação" e "Agendar série" ficam abaixo do rodapé visível na captura, e o interruptor "Avisar a cliente pelo WhatsApp" do quadro não existe (divergências 4 e 5).
- **A6 tablet em retrato (768×1024, 9,0 %).** O mesmo esqueleto do quadro, em duas colunas e sem barra de abas: à esquerda "Cliente" e "Serviços" com a soma e "Adicionar observação"; à direita "Data" e "Horário · livres para 1 h 25"; o rodapé de largura inteira com o CTA. O que difere: o aviso de WhatsApp no topo; o serviço "Coloração" a mais e a tira "SEX 2 … QUA 7"; "Nenhum horário disponível para esta seleção." com o CTA desabilitado; "Agendar série" presente abaixo de "Adicionar observação" e o interruptor do WhatsApp ausente (divergências 4 e 5).
- **A6 tablet em paisagem (1024×768, 12,4 %).** A coluna da Agenda à esquerda ("Outubro 2026", Dia · Semana · Mês, "Novo", a tira SEG 28 … DOM 4 com SEX 2 marcado, "Hoje, sexta 2 · 5 atendimentos · 1 bloqueio" e a lista do dia, **sem linha marcada**) e o formulário no painel à direita, com "×" e o título, "Cliente", "Serviços", "Data", "Horário", e a barra de abas abaixo, como o quadro. O que difere: o aviso de WhatsApp no topo e a lista do dia com os dados da conta (divergências 2 e 3); "Outubro" no lugar de "Setembro"; no painel, os chips de serviço em uma coluna (o serviço "Coloração" a mais), a tira de datas e "Nenhum horário disponível para esta seleção."; o CTA desabilitado e sem sufixo; sem o interruptor do WhatsApp (divergência 4).
- **A6 desktop (1366×768, 10,3 %).** O mesmo arranjo de paisagem com a sidebar: a coluna da Agenda em Dia à esquerda, sem linha marcada, e o formulário no painel, com "×", título, "Cliente", "Serviços", "Data", "Horário" e o CTA no rodapé do painel. O que difere: o aviso de WhatsApp no topo, o cartão "WhatsApp desconectado" da sidebar no lugar de "IA ativa" e o item "Notificações" (divergência 2); os dados e o mês (divergência 3); "Nenhum horário disponível para esta seleção." e o CTA desabilitado e sem sufixo; sem o interruptor do WhatsApp (divergência 4); "Adicionar observação" parcialmente coberto pelo rodapé na captura.

**Igual ao quadro, e o que isso quer dizer.** Nos quatro pares do A6, a composição (tela empurrada com "×" e título abaixo de 1024 px; coluna da Agenda à esquerda e formulário no painel a partir dele; duas colunas no retrato), a ordem dos blocos e os componentes são os do quadro, e o que sobra está nas divergências de D-111 e no estado da conta de teste (sem horário livre para o dia e os serviços do quadro) e na cor do rótulo do dia fechado (divergência 9 de D-111). Não é igualdade de pixel, o A6 **não** foi visto com chips de horário nem com o CTA habilitado nesta execução, e a conferência humana num aparelho real **não foi feita**.

### Controles negativos do §7

Rodados na rodada 3, depois da última edição de código e depois de E5, com `VITEST_MAX_WORKERS=2 npx vitest run tests/goal101-novo-agendamento.test.tsx` (15 testes), por um script que aplica cada defeito por substituição de texto, roda a suíte e restaura o arquivo a partir dos bytes originais no mesmo passo (`finally`), imprimindo o `sha256` antes, com o defeito e depois. Com a árvore intacta, antes dos controles, a suíte deu `Tests  15 passed (15)`.

1. **A coluna da Agenda montada abaixo de 1024 px** (prova 1). `AppointmentFlowShell.tsx`, `if (!appointmentRoute || !wide) return page;` trocado por `if (!appointmentRoute) return page;`. `sha256` antes `7065b4bfc495341891e2ec154cb9ecc7944e2b3619b63ea6a1469d743c891086`, com o defeito `585b7a70e86b8c3d9778ca4c26ce2b59d5b7a8b1cfdd00d054e1b2367175c2a3`, depois `7065b4bf…3c891086` (**IGUAL**). Saída: `Tests  1 failed | 14 passed (15)`; `FAIL … 1. composição: coluna da Agenda de 1024 px em diante, tela empurrada abaixo > abaixo de 1024 px é tela empurrada: sem coluna, sem leituras dela, sem barra de abas, com × e título`, com `AssertionError: expected <aside …(2)>…(1)</aside> to be null`.
2. **A coluna do dia de volta à direita do formulário** (prova 1). `DayList` foi apagada e não pode ser restaurada como componente; o controle põe em `AppointmentFlowShell.tsx`, antes de `AgendaDayColumn`, `<aside aria-label="Dia 18 de setembro" className="agenda-new-day-panel" />` (e fecha o fragmento). `sha256` antes `7065b4bf…3c891086`, com o defeito `6b68ab12154e655f3846203c6bdd1162dbf4dafbb865b92bbba2f03129febfdb`, depois `7065b4bf…3c891086` (**IGUAL**). Saída: `Tests  1 failed | 14 passed (15)`; `FAIL … 1. composição … > em largura de desktop monta a coluna e o formulário no painel, sem linha marcada e sem a coluna do dia à direita`, com `expect(element).not.toBeInTheDocument()`.
3. **A coluna deixa de seguir a data do formulário** (prova 3). `AppointmentForm.tsx`, `appointmentRoute={{ date }}` trocado por `appointmentRoute={{ date: isoDate(new Date()) }}`. `sha256` antes `7ef9eaf035f4272f8ca57dbf670343abdc23017f0c507b603fcd20009ab540f4`, com o defeito `01599ff08bae5e60d3af6012baf2ed154303b34d775921a5ca3205d62e6e0dae`, depois `7ef9eaf0…09ab540f4` (**IGUAL**). Saída: `Tests  2 failed | 13 passed (15)`; `FAIL … 3. a coluna segue a data do formulário > escolher outra data no formulário leva a coluna para esse dia` e `… > ‹ › da coluna mudam o dia dela e não mudam a data do formulário nem o CTA`, com `Error: expect(element).toHaveAccessibleName()`.
4. **A coluna passa a chamar `useShellConfig`** (prova 2). `AgendaDayColumn.tsx` passou a importar `useShellConfig` de `@/shared/layout/ShellConfig` e a chamá-lo no início do componente (`useShellConfig({ active: "agenda", loading: false, module: "agenda", title: "x" })`), duas chamadas na mesma árvore com `AppointmentFlowShell`. `sha256` antes `b12ebea9d4d109aa14d35c15317ad4da1c0e8b8315c6afb73916e6ef7f784022`, com o defeito `31cb75f53de83fe2c40a731090690c003735e2154d28415d506ff525f3e48ac0`, depois `b12ebea9…7f784022` (**IGUAL**). Saída: `Tests  5 failed | 10 passed (15)`; reprova `FAIL … 2. uma chamada de useShellConfig por árvore renderizada > em 1280 px, com a coluna já montada` (o teste da prova 2 que ataca o defeito), mais os de desktop das provas 1, 3 e 5. A única linha de erro que o filtro da execução imprimiu é `Error: Maximum update depth exceeded`: as duas chamadas disputam a configuração da casca em laço; a mensagem própria do teste da prova 2 não foi impressa à parte.

Com os arquivos restaurados, o mesmo arquivo de teste deu `Tests  15 passed (15)`. Cada controle reprova o teste da prova que ele ataca; os controles 1 e 2 reprovam **1** teste cada, o controle 3, **2**, e o controle 4, **5** (o laço de atualização derruba também os de desktop das outras provas). O controle 4 foi aplicado duas vezes (a segunda para ler a saída) e deu o mesmo resultado, com o `sha256` **IGUAL** nas duas.

**Estado da árvore.** `git status --porcelain=v1 -uall` lista só os arquivos autorizados: os modificados de `apps/frontend/` (`AgendaDayColumn.tsx`, `AppointmentFlowShell.tsx`, `AppointmentForm.tsx`, `NewAppointmentFields.tsx`, `ListDetail.tsx`, `avenly-agenda.css`, `e2e/authenticated-matrix.spec.ts` e os testes `goal016-appointment-create.test.tsx` e `goal083-new-appointment.test.tsx`), `goal101-novo-agendamento.test.tsx` novo e os três documentos. **Nenhum arquivo de configuração está alterado** (`apps/bff/vitest.config.ts` e `apps/frontend/playwright.config.ts` voltaram ao de `HEAD` nesta rodada), e nenhum resto de controle negativo ficou na árvore. `apps/frontend/AGENTS.md`, que o `next dev` do `visual:compare` reescreve, voltou ao de `HEAD` pelo próprio comando. `apps/frontend/e2e-results/` é ignorado pelo git.

**Asserções existentes mudadas (§6)**, cada uma pelo motivo, nenhum teste removido nem pulado: `goal016-appointment-create` (3 asserções) e `goal083-new-appointment` (1 asserção) passaram a achar o total pelo `.agenda-new-total` (`totalText`), porque a soma deixou de ser texto solto na estrutura antiga. `goal016-shell-invariant` e `goal016-a11y` não precisaram mudar.

**Vermelho contra a baseline.** Medido no FIX-001 da rodada 2, na subseção "Rodada 2 (FIX-001)" abaixo: `Tests  9 failed | 6 passed (15)` (7 dos 13 testes originais mais os 2 novos). Não foi repetido na rodada 3, porque a rodada 3 só mudou a cor de um rótulo em `avenly-agenda.css`, que nenhuma prova toca.

**Não feito.** A conferência humana num aparelho real; o A6 visto com horários livres e o CTA habilitado (a conta de teste não tem horário livre para o dia e os serviços do quadro); a medida isolada da causa da piora do A6 em mobile, paisagem e desktop; a medida da contagem de requisições da coluna ao BFF; os `side-by-side.png` de A1, A5, A8, A9, A10, A11 e H3 abertos (os números deles são os mesmos de antes); o aviso à cliente na criação (D-098 (e)).

### Rodada 2 (FIX-001): início, vermelho contra a baseline e os três blockers

Registro do FIX-001 da rodada 2, escrito depois da última edição de código.

**Os três blockers.** (1) O chip "Outro horário" do bloco Horário renderizava 38 px com `padding: 0 12px`, porque a regra `.agenda-new-time .agenda-new-chip-other` (40 px, `0 14px`, como o quadro) exigia um ancestral `.agenda-new-time` que nenhum elemento tinha; o `<fieldset>` do Horário em `AppointmentForm.tsx` agora tem `className="agenda-new-block agenda-new-time"`. No `side-by-side.png` do tablet em retrato o chip mede ~40 px, como o do protótipo. (2) O dia fechado da tira de datas (o "DOM" do protótipo, rótulo `#948B80` e número `#716859`) foi **implementado**, não declarado como divergência: `AppointmentForm` lê as regras de atendimento de `settings.get` (mesma leitura do `AgendaBoard`) e `DateStrip` marca `data-closed="true"` no dia da semana sem regra ativa; `avenly-agenda.css` pintava o rótulo `#948b80` e o número `#716859`; **a rodada 3 trocou o rótulo para `#716859`** (ver "Rodada 3" abaixo). Sem regra alguma (ou sem a leitura), nenhum dia é esmaecido. Nos `side-by-side.png` o "DOM" do app aparece esmaecido, como o do quadro. Testes novos: o bloco "5b" de `goal101-novo-agendamento.test.tsx` (**15** testes). (3) Esta seção e CURRENT_STATE e D-111 passam a citar o início e o vermelho abaixo.

**Vermelho contra a baseline (medido no FIX-001).** Os seis arquivos de produção trocados pelos de `HEAD`, `npx vitest run tests/goal101-novo-agendamento.test.tsx`: `Tests  9 failed | 6 passed (15)`. Os 7 que reprovam dos 13 testes originais são os das provas 1, 2, 3 e 5 (coluna e tela empurrada, uma chamada de `useShellConfig`, a coluna que segue a data, "×" com `Fechar novo agendamento`), com `AssertionError: expected null not to be null` e `Unable to find an accessible element with the role "link" and name /^Fechar( novo agendamento)?$/`; os 2 novos do bloco 5b também reprovam (`expected +0 to be 1`; `expected "vi.fn()" to be called at least once`). Os 6 que passam são o de 390 px da prova 2, os 3 da prova 4 (criação preservada), o da reserva liberada ao sair da prova 5 e o da prova 6 (sem aviso à cliente): comportamento que a baseline já tinha. Restauração por cópia, `sha256` dos seis arquivos **IGUAIS** antes e depois; depois dela, `npx vitest run tests/goal101-novo-agendamento.test.tsx tests/goal016-appointment-create.test.tsx tests/goal083-new-appointment.test.tsx` deu `Tests  43 passed (43)` e `npx tsc --noEmit` saiu sem erro.

**Final (rodada 2).** `visual:compare` do A6 sobre a árvore final da rodada 2: **16,0 / 9,0 / 12,4 / 10,3**. Os `sha256` e as execuções dessa rodada foram substituídos pelos da rodada 3 acima; as execuções E3, E4 e os controles negativos que a rodada 2 não repetiu foram **repetidos na rodada 3**.

### Rodada 3 (FIX-001): configuração restaurada, contraste, árvore final verificada

Registro do FIX-001 da rodada 3, escrito depois da última edição de código e depois de E1 a E8.

**Os cinco blockers.** (1) `apps/frontend/playwright.config.ts` (`workers: process.env.CI ? 1 : 2` e o comentário) foi restaurado ao de `HEAD`. (2) `apps/bff/vitest.config.ts` (`maxWorkers: 4`) foi restaurado ao de `HEAD`; a falha por memória do host que o motivou está em "Falhas por recurso do host", reportada e reexecutada, sem editar configuração. (3) **Contraste do rótulo do dia fechado.** `.agenda-new-day[data-closed="true"] > span` em `avenly-agenda.css` usava `#948b80`, que sobre `#F7F4EF` dá **3,06:1** (fórmula de luminância relativa da WCAG 2.1), abaixo dos 4,5:1 do AA para texto de 11 px. Passou a `#716859`, **5,00:1** sobre o mesmo fundo, a cor que o rótulo normal da tira já usa e a que D-105 (divergência 10) usa no lugar de `#948B80`. O dia fechado continua distinto pelo atributo `data-closed`; o rótulo dele deixou de ser mais claro que o dos outros dias, e isso é a divergência 9 declarada em D-111. (4) A árvore final foi verificada depois da última edição: E1 a E8 acima, inclusive `validate:integration` (G-8, com a leitura de `settings.get`) e os quatro controles sobre a suíte de 15 testes. (5) Esta seção, CURRENT_STATE e D-111 foram reescritos para dizer isso: nenhum arquivo de configuração está alterado, o registro foi escrito depois da última edição de código, e as contagens são as da rodada 3.

**`visual:compare` do A6 depois da cor.** **16,0 / 9,0 / 12,4 / 10,3**, os mesmos números de antes: a cor de um rótulo de 11 px não move a porcentagem na casa decimal. `side-by-side.png` do A6 relidos nos quatro devices nesta rodada; a estrutura, a ordem dos blocos e os componentes são os do quadro, como descrito acima.

**Nota de fechamento — review101, 2026-10-02.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Gates do IA Loop sobre a árvore aceita.** Na rodada 4, os oito gates do Goal passaram: typecheck (WU-04), lint (WU-05), `goal101-novo-agendamento.test.tsx` **15**/**15** (WU-06), `validate:core` exit 0 (WU-07), `test:gate` **233**/**233** (WU-08), `validate:ui` com a configuração padrão **169** `passed`, **21** `skipped` e `retries: 0 — every test passed on its first attempt` (WU-09), `validate:integration` exit 0 com o gate autenticado em **255** `passed` e `retries: 0` (WU-10) e `git diff --check` (WU-12). A WU-09 da rodada 3, na mesma árvore de código, também deu **169** `passed` e **0** retentativas, e a WU-10 da rodada 3, **255** `passed` e **0** retentativas. As **2** retentativas de E3a acima continuam medidas como descritas; as execuções do IA Loop com a configuração padrão não as repetiram.
- **Rodada 4.** Só documentação mudou: o título `### Retentativas e falhas por recurso do host` da seção aceita do Goal093 voltou ao texto de `68a8344`, depois de renomeado na rodada 3. O diff deste documento contra `68a8344` é só acréscimo.
- **Conferência do Tech Lead.** `visual:compare -- --target A6`, exit 0, nas quatro rodadas, sempre com **16,0 / 9,0 / 12,4 / 10,3**, e os quatro `side-by-side.png` abertos em cada uma: sobram só as divergências de D-111 e o estado da conta de teste. Reexecutou as suítes dirigidas na rodada 1 (`goal101`, `goal083`, três de `goal016`, `goal093`, `goal092` e `goal069`: **114**/**114**) e na rodada 3 (`goal101`, `goal083`, três de `goal016`, `goal093`, `goal075` e `goal072`: **111**/**111**). Os `sha256` de "Árvore avaliada" conferem com a árvore aceita. O critério 5 foi aceito pela cláusula de retentativa medida e reportada; a leitura nova de `settings.get` no formulário, pela passagem de G-8 sem falha de limite de taxa.

## Clientes iguais ao protótipo (CL1, CL4, CL5, CL6, CL7), do Goal094 (rodada 4)

Registro da execução final e dos controles do Goal 094 ([D-112](DECISIONS.md), PROPOSED), refeito no FIX-001 da rodada 4 sobre a árvore final, depois da última edição de código (a correção da cor da linha concluída em `CustomerAgenda.tsx`). Tudo abaixo foi rodado em 2026-10-02. Nenhum arquivo de configuração de gate foi alterado (`vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts`, `next.config.ts`), nem `scripts/`, `e2e/routes.ts` ou `e2e/authenticated-matrix.spec.ts`. **`e2e/visual/targets.json` foi alterado**: os alvos CL6 e CL7 passaram a abrir a aba por `clickRole` com `role: "tab"` (antes, `click` com `optional`), porque em paisagem e em desktop o toque não chegava à aba e a captura mostrava o Resumo de Aline Santos; o Goal permite mudar o mapa quando um alvo está errado, e o efeito é só no mapa de capturas. Os controles negativos e o vermelho contra a baseline mexeram nos arquivos de produção só dentro de cada passo, e o `sha256` voltou ao de antes. Texto ainda não aceito: o Tech Lead decide.

### Árvore avaliada

`sha256` dos 17 arquivos de código e teste alterados, conferidos iguais antes e depois da sequência de execução e depois dos controles:

| Arquivo (em `apps/frontend/`) | `sha256` |
| --- | --- |
| `e2e/visual/targets.json` | `db19cd9fac6a4c43246f56f43c19d88d3bd9ded3c866dbb12152e5efe3920ea2` |
| `src/features/customers/AuthorizationControl.tsx` | `e0b1dc7fae8a777ced5f4d45c72d515f3fa69c4be59b14e2f99659c52f818d13` |
| `src/features/customers/CustomerAgenda.tsx` | `62e7046c3678ed5aa8cb4bc85118df02e4f51df49f725f88ee3075da42a23e02` |
| `src/features/customers/CustomerForm.tsx` | `c76594936be084c48d80f0d4887b6da4f022021a9ca87178074d12b7b81561c0` |
| `src/features/customers/CustomerList.tsx` | `1d6050f5a4442a4265c335207a343bd9607b601c548d87ef300dd42af517d663` |
| `src/features/customers/CustomerNotes.tsx` | `268610332aeefd3bb5c6233775ab6fdbb8b37291b906ba246255380f1448f81c` |
| `src/features/customers/CustomerProfile.tsx` | `ed89e3ae006b1025cdcc20656a32bc3e2eeb6aeeb679625e356c94c5efad2d26` |
| `src/features/customers/CustomerTags.tsx` | `11a5f11b91c5fd0790375becb05b3d4ca6b7acbc50e4ffd2ccda043fc2d2a54f` |
| `src/shared/phone.ts` | `6a7e3254d246fe3b7b3e5cde8d0b93ba27210ad3809f58429b1d1c547a59985c` |
| `src/shared/styles/avenly-customers.css` | `422ff4b1e810ddb55cc98f1da5c810c96d514e90db6865447648fd967512b0af` |
| `tests/goal015-customers.test.tsx` | `3530e0583740c806e0e3f12cc08c570d53b5f6510f39eef655948d92133e5c0e` |
| `tests/goal015-shell-invariant.test.tsx` | `7e9e1c032de3496030658f11fa64f6d32455a0084d3931baf611961dbfc8b1e6` |
| `tests/goal062-availability-phone.test.tsx` | `063c8367f53499e7ae46b63c98303715d80792a32c3784d29dfeef5e9756fd09` |
| `tests/goal075-customer-list.test.tsx` | `1114ccb6626b2f83a3204ed2753a4daedb33eeeb93e7f4ce81f1f0a136b7e5e2` |
| `tests/goal075-customer-profile.test.tsx` | `f88938a5bccace9b9a4114d1e17a5606adf7d1949c8ce64196af28417fbffe86` |
| `tests/goal084-phone-display.test.tsx` | `2a1aaad285cd5b134f953beac59dace5d2e63ba847359655ee6b5c21dac2136a` |
| `tests/goal094-clientes.test.tsx` | `08cae00e3ca216ab5637ccc6a91972aba4abbbf1b6c0ee11ae2f7b79635d160a` |

### Ambiente

PostgreSQL 18 descartável, só local, na porta 55494 (usuário `pgtest`, autenticação `trust`), com o banco `atendly_bff_test` para `validate:integration` e os bancos `vis094_sched`, `vis094_ai` e `vis094_bff` para o BFF descartável do `visual:compare`. Esse BFF sobe os três serviços (Scheduling, IA e BFF) com tokens sintéticos, o BFF em `http://localhost:3002`, e o `visual:compare` roda com `VISUAL_BFF_ORIGIN=http://localhost:3001`. Nada disso é do repositório.

### Execuções

| Passo | Resultado |
| --- | --- |
| `visual:compare` (doze alvos) | exit 0; números na tabela abaixo. |
| `validate:core` | exit 0. `test:frontend`: 141 arquivos e 1582 testes passaram. `test:gate`: 233/233. |
| `validate:ui` (configuração padrão) | exit 0. 169 `passed`, 21 `skipped`, `retries: 0`. |
| `validate:integration` | exit 0, 36/36 passos, contra `127.0.0.1:55494/atendly_bff_test` (`BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55494/atendly_bff_test`). Gate autenticado: 255 `passed`, `retries: 0`. Não foi pulado. |
| `tsc --noEmit` e `eslint src tests --max-warnings=0` em `apps/frontend` | exit 0, sem erro e sem aviso. |
| `tests/goal094-clientes.test.tsx` | 18/18. |

O gate autenticado teve **0 retentativas** e o `validate:ui` teve **0 retentativas**.

### Execução descartada

Uma primeira tentativa de `visual:compare`, `validate:core`, `validate:ui` e `validate:integration` desta rodada foi lançada por duas sequências ao mesmo tempo, que gravaram nos mesmos logs; nessa tentativa o `visual:compare` deu `locator.click: Timeout 8000ms exceeded` no CL6 e no CL7 e números diferentes no CL4 e no CL5; a causa não foi isolada, e a concorrência entre as duas sequências é a explicação provável. Foi **descartada por inteiro**: nenhum número dela está neste documento. As quatro execuções foram refeitas em uma sequência só, com a árvore conferida, e são as da tabela acima. Nenhuma configuração foi editada para contornar.

### `visual:compare`

Rodado da raiz com `npm run visual:compare -- --target CL1,CL4,CL5,CL6,CL7,Servicos:S1,Servicos:S4,M1,N1,A1,A5,H3`, contra o BFF descartável, com a conta `visual-prototipo-v2@example.invalid`. Porcentagem de diferença em mobile / tablet em retrato / tablet em paisagem / desktop. "Início" é a baseline `c809444`; "fim" é a árvore final.

| Alvo | Início | Fim |
| --- | --- | --- |
| CL1 | 10,9 / 5,0 / 3,4 / 2,7 | 8,8 / 3,6 / 3,0 / 2,7 |
| CL4 | 5,8 / 2,6 / 6,4 / 5,0 | 6,2 / 2,7 / 6,6 / 4,1 |
| CL5 | 10,0 / 4,5 / 6,0 / 5,3 | 10,0 / 4,5 / 6,0 / 5,3 |
| CL6 | 8,3 / 3,5 / 5,8 / 5,2 | 7,1 / 2,9 / 5,1 / 4,3 |
| CL7 | 14,4 / 8,5 / 9,6 / 8,4 | 8,0 / 3,3 / 6,0 / 5,2 |
| S1 | 8,8 / 5,3 / 3,9 / 2,9 | igual |
| S4 | 9,7 / 8,7 / 14,2 / 8,7 | igual |
| M1 | 7,6 / 3,1 / 5,9 / 5,1 | igual |
| N1 | 8,2 / 3,8 / 5,9 / 5,1 | igual |
| A1 | 10,4 / 4,8 / 5,4 / 4,3 | igual |
| A5 | 7,8 / 3,2 / 7,7 / 6,1 | igual |
| H3 | 8,1 / 4,1 / 3,7 / 3,0 | igual |

**Melhorou:** CL1 em mobile, retrato e paisagem; CL4 em desktop; CL6 nos quatro devices; CL7 nos quatro devices. **Piorou, e fica declarado:** CL4 em mobile, retrato e paisagem (0,4, 0,1 e 0,2 ponto), com causa **não isolada por medida**. **Igual:** CL1 em desktop e CL5 nos quatro devices. Nenhum outro alvo mudou de número. Os "iguais" de S1 a H3 são os da execução anterior e foram medidos de novo nesta rodada (as mesmas porcentagens).

**`side-by-side.png` lidos no fim, por quadro:**

- **CL1, CL4 e CL5.** Os números acima são os medidos; os `side-by-side.png` desses três quadros **não foram descritos** nesta unidade e a causa do que sobra não foi isolada. Pelas decisões de D-112, a lista não mostra "Agenda por ele" (a resposta da lista não traz o responsável) e o CL4 não vincula o responsável na criação (contrato).
- **CL6.** Com o `targets.json` corrigido, a captura é da aba Atendimentos de Ana Paula nos quatro devices (lidas as de paisagem e desktop; em mobile e retrato, a leitura é da rodada anterior e o CSS não mudou). A conta de teste não tem concluídos nem rodapé de valor: aparecem "Próximo" com uma linha e "Anteriores" com "Nenhum atendimento anterior.". A data é "dd/mm", o traço tem a cor do serviço e o status é texto. "Corte feminino" aparece sublinhado: é o hover residual do clique que abre a aba (`.customer-appt:hover .customer-appt-name`, divergência 10 de D-112), e em repouso nenhum texto é sublinhado. A linha concluída (que a conta não tem) só é provada pelo jsdom: `is-past`, sem `is-active` e sem ponto de status.
- **CL7.** Aba Notas de Ana Paula nos quatro devices (lida a de desktop): "Nenhuma observação registrada." e "Nenhuma tag cadastrada." onde o quadro tem texto e tags; a barra "Salvar" é fixa no rodapé da janela, como no quadro. A caixa de autorização, a explicação fixa da nota e "IA pode usar"/"só você" na tag só são provadas pelo jsdom, porque a conta não tem nota nem tag.

### Controles negativos

Rodados sobre a árvore final com `npx vitest run tests/goal094-clientes.test.tsx`, por um script que aplica cada defeito por substituição de texto, roda a suíte e restaura os bytes no mesmo passo. O `sha256` antes e depois foi **IGUAL** nos cinco, e é o da tabela "Árvore avaliada".

1. **Soma o preço previsto quando `finalValue` é nulo** (prova 3). `CustomerAgenda.tsx`: `if (item.finalValue === null) withoutValue += 1;` trocado por `if (item.finalValue === null) { withoutValue += 1; recorded += item.totalPrice ?? 0; }`. `Tests  1 failed | 17 passed (18)`: `expected 'Valor registrado: R$ 2101 atendimento…' to contain 'Valor registrado: R$ 90'`.
2. **A nota nasce marcada** (prova 4). `CustomerNotes.tsx`: `authorized={note.aiAuthorized}` trocado por `authorized={true}`. `Tests  2 failed | 16 passed (18)`, com `expect(element).not.toBeChecked()`.
3. **O pedido de criação leva o telefone mascarado** (prova 2). `CustomerForm.tsx`: `const phone = phoneInputDigits(phoneInput);` trocado por `const phone = phoneInput;`. `Tests  1 failed | 17 passed (18)`: `expected "vi.fn()" to be called with arguments: [ '11991234567' ]`.
4. **Uma segunda chamada de `useShellConfig` no perfil** (prova 5). `CustomerProfile.tsx`: a chamada completa (`active: "clientes"`, `loading: !customer && !error`, `module: "directory"`, `pushed: true`, `title: "Detalhes do cliente"`) duplicada. `Tests  2 failed | 16 passed (18)`: `/clientes/detalhes: expected 2 to be 1`.
5. **A linha concluída volta a ser `is-active`** (prova 3). `CustomerAgenda.tsx`: `const active = !completed && isActiveAppointmentStatus(appointment.status);` trocado por `const active = isActiveAppointmentStatus(appointment.status);`. `Tests  1 failed | 17 passed (18)`: `expect(element).toHaveClass("is-past")`.

Com os arquivos restaurados, o mesmo arquivo deu `Tests  18 passed (18)`.

### Vermelho contra a baseline

Os nove arquivos de produção (`apps/frontend/src/features/customers/` com sete arquivos, `shared/phone.ts` e `shared/styles/avenly-customers.css`) trocados pelos de `HEAD` (`c809444`, por `git show HEAD:<arquivo>`), com as cópias finais guardadas fora do repositório e `tests/goal094-clientes.test.tsx` mantido: `Tests  18 failed (18)`. As cópias finais foram restauradas por cópia e o `sha256` dos nove arquivos conferido igual ao da tabela "Árvore avaliada". A prova 5 reprova por esperar o CTA "Salvar cliente".

### Asserções existentes mudadas (D-112)

Nenhum teste removido nem pulado. `goal015-customers`, `goal015-shell-invariant`, `goal062-availability-phone`, `goal075-customer-list`, `goal075-customer-profile` e `goal084-phone-display` tiveram asserções atualizadas para o texto e a estrutura dos quadros (CTA "Salvar cliente", telefone "+55 11 99123-4567" no cabeçalho, uma só informação à direita na lista, autorização como `checkbox`); cada uma está listada em D-112.

### Estado da árvore

`git status --porcelain=v1 -uall` lista só os arquivos autorizados: o `targets.json`, nove arquivos de `apps/frontend/src` (`AuthorizationControl.tsx`, `CustomerAgenda.tsx`, `CustomerForm.tsx`, `CustomerList.tsx`, `CustomerNotes.tsx`, `CustomerProfile.tsx`, `CustomerTags.tsx`, `shared/phone.ts`, `avenly-customers.css`), seis testes existentes, o novo `goal094-clientes.test.tsx` e os três documentos (`DECISIONS.md`, `CURRENT_STATE.md`, este). Nenhum artefato de `e2e-results/` e nenhum resto de controle.

### Não feito

A conferência humana num aparelho real; o CL6 com concluídos e o rodapé de valor e o CL7 com observação e tags por captura (a conta de teste não os tem); a causa isolada da piora do CL4 e do que sobra de diferença no CL6 e no CL7; remover o sublinhado de hover da linha de atendimento (decisão do Tech Lead, divergência 10 de D-112); "Agenda por ele" na lista e o vínculo do responsável na criação (dependem de contrato). O critério de fidelidade visual do Goal **não** está provado em todos os pares quadro × device.

**Nota de fechamento — review094, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Gates do IA Loop na rodada 4.** typecheck, lint, `goal094-clientes.test.tsx` **18**/**18**, `validate:core`, `test:gate`, `validate:ui` e `git diff --check` passaram. A WU-10 (`validate:integration`) ficou `SKIPPED` por falta das URLs de banco de teste.
- **Conferência do Tech Lead na rodada 4.** Com BFF e Scheduling locais, `visual:compare -- --target CL1,CL4,CL5,CL6,CL7,Servicos:S1,Servicos:S4,M1,N1,A1,A5,H3` deu exit 0, e os 20 `side-by-side.png` de CL1 a CL7 foram lidos. Os números (mobile / retrato / paisagem / desktop) foram: CL1 **9,5 / 4,2 / 3,6 / 3,2**, CL4 **7,4 / 3,5 / 7,3 / 4,6**, CL5 **10,0 / 6,2 / 6,5 / 5,8**, CL6 **9,0 / 3,8 / 6,0 / 5,1** e CL7 **9,0 / 4,0 / 6,6 / 5,7**. Ficaram iguais aos da rodada 3 dentro de 0,2 ponto, e S1 a H3 não pioraram de forma visível. Esses números diferem dos da tabela acima, porque a conta e o ambiente das duas medidas são diferentes. O CL6 foi capturado com linhas concluídas: "✓ Concluído" aparece na cor esmaecida do quadro, e o verde rgb(31,92,57) aparece só no ponto de "Confirmado" da linha "Próximo", medido por pixel nos quatro devices. Isso responde à parte de "Não feito" sobre o CL6 com concluídos. Os `side-by-side.png` de CL1, CL4 e CL5, que a unidade do Developer não descreveu, foram lidos: só sobram divergências declaradas em D-112. O CL5 mostrou "Preferências indisponíveis" porque o AI Orchestrator não estava de pé, o que é estado de ambiente.
- **Reexecução do Tech Lead na árvore final.** `validate:core` exit 0 (`test:frontend` **141** arquivos e **1582** testes; `test:gate` **233**/**233**). `validate:ui` exit 0 (**169** `passed`, **21** `skipped`, **0** retentativas). `validate:integration` exit 0 contra um PostgreSQL descartável, com o gate autenticado em **255** `passed` e **0** retentativas, inclusive G-4 e G-5. Essa execução cobre o critério 5. Os `sha256` de "Árvore avaliada" conferem com a árvore aceita. O vermelho e os cinco controles negativos foram conferidos por registro e `sha256`, não reexecutados.
- **Sublinhado no hover.** Aceito como divergência 10 de D-112: o critério de QA R-08 vale para o estado em repouso.
- **Limite conhecido: `finalValue` não vem na listagem.** A primeira tentativa do review da rodada 4 mediu no BFF descartável: com `finalValue` 90,00 e 150,00 gravados em dois concluídos, a resposta JSON da listagem veio sem o campo. `CalendarAppointment` do Scheduling não tem `finalValue`, e o schema público o preenche com `null`. Com dados reais, o CL6 mostra "valor não registrado · registrar" em todo concluído e "Valor registrado: R$ 0" no rodapé. As provas jsdom passam porque o mock traz o campo. Detalhe e decisão pendente no [review094](reviews/094-review.md) e em [GAP_ANALYSIS](GAP_ANALYSIS.md).

## A listagem de agendamentos traz o valor registrado e a presença confirmada, do Goal103 (rodadas 1 e 2)

Registro da conferência com a pilha real, dos controles negativos e das contagens da execução final do Goal 103 ([D-113](DECISIONS.md), PROPOSED), escrito na WU-08 depois da última edição de código. Rodado em 2026-10-03. Nenhum arquivo de configuração de gate foi alterado (`vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts`, `next.config.ts`).

### Árvore avaliada

`sha256` dos dez arquivos alterados ou criados fora dos documentos, medidos na WU-08 depois de todos os controles, com a árvore restaurada. O spec `apps/frontend/e2e/authenticated-matrix.spec.ts`, que a rodada 1 listava como décimo primeiro, foi revertido ao estado de `79ddc3f` na rodada 2 e não é mais arquivo alterado:

| Arquivo | `sha256` |
| --- | --- |
| `apps/bff/src/clients/scheduling/index.ts` | `122859f10292c3c039d80191b446f1a418d1872c2a1383050547478a11d814ec` |
| `apps/scheduling-service/src/modules/appointments/appointment-lifecycle-service.ts` | `a21b793d295f05dbe1c98169dd1b5da68fbd099a6dcd22be174bdf0b850fac51` |
| `apps/scheduling-service/src/modules/calendar/calendar-provider.ts` | `43d7e334fb5d7a0ccba3492ba42f2f0d1d0249a658b59eb7a4aee1fe7ffd4884` |
| `apps/scheduling-service/src/modules/calendar/calendar-service.ts` | `856cfac1dcf0c1a337ea80dde2c44a8cabd5b0456ba778f254992ef248c3a4e6` |
| `apps/scheduling-service/src/modules/integrations/avenly/provider.ts` | `0c9abda38359ca999390a5a71b90ed6adb4e4adc3134fd68946e5c4852c810da` |
| `packages/public-api-contract/src/schemas.ts` | `9cc2c2184e9da58aea7577990b101336dd6c93d73084efdbc4b4a75b1428aa4f` |
| `apps/ai-orchestrator/tests/goal103-appointment-lifecycle-not-exposed.test.ts` | `20752a0d3498ae92d76b0d30379b04e7507bc4ff2236c7a86e387572bdf72caa` |
| `apps/bff/tests/goal103-appointment-listing-lifecycle.integration.test.ts` | `8222d7ecf11b03ed41df9e0442ee832f5d03e518267beed8cf27527ea5a9d78d` |
| `apps/scheduling-service/tests/integration/goal103-appointment-listing-lifecycle.integration.test.ts` | `d9fa16eac331453dae787aa1bb19e08b72b5b2ffe6be22aa18c42ac9393791fc` |
| `apps/scheduling-service/tests/unit/goal103-appointment-listing-lifecycle.test.ts` | `7ed6c77195ff188d3a625b94f54c8db5ca51cf0737d02165e5da3253915c4fc5` |

### Execuções

| Passo | Resultado | Execução que sustenta |
| --- | --- | --- |
| `validate:core` | exit 0, 114097 ms | WU-06 do IA Loop (`103-r1-unit-wu-06`) |
| `test:frontend` | **141** arquivos e **1582** testes passaram, exit 0 | medido na WU-08, `npm run test:frontend` |
| `test:gate` | **233**/**233**, exit 0 | medido na WU-08, `npm run test:gate` |
| `validate:integration`, primeira execução (rodada 1) | exit 1, 653637 ms | WU-07 (`103-r1-unit-wu-07`); a DIAG-001 ajustou `apps/frontend/e2e/authenticated-matrix.spec.ts`, ajuste **revertido na rodada 2** |
| `validate:integration`, segunda execução (rodada 1) | exit 0, 680509 ms, gate autenticado **255** `passed`, `retries: 0` | WU-07 (`103-r1-unit-wu-07-g2`), **com o spec alterado**; não vale para a árvore final |
| `validate:integration`, **execução final (rodada 2)**, na árvore final com o spec igual a `79ddc3f` | exit 0, **36**/**36** passos `passed`, gate autenticado **255** `passed`, `retries: 0` (`authenticated gate retries: 0 — every test passed on its first attempt`) | FIX-001 (`103-r2-unit-fix-001`), contra um PostgreSQL 18 recém-provisionado na porta 55621, só com o banco `atendly_bff_test` criado e os demais provisionados pelo próprio runner. `onboarding-demonstracao-da-ia` passou sem retentativa |
| `test:bff-integration` (dentro de `validate:integration`, rodada 2) | `Test Files  64 passed (64)`, `Tests  477 passed (477)` | FIX-001 |
| `test:scheduling-integration` (idem) | `Test Files  19 passed (19)`, `Tests  145 passed (145)` | FIX-001 |
| `test:ai-orchestrator-transport-durability` e `test:ai-orchestrator-content-purge` (idem) | `10` arquivos e `74` testes; `3` arquivos e `24` testes, todos passaram | FIX-001 |
| `test:ai-orchestrator` (`npm run test:ai-orchestrator`, suíte inteira, rodada 2) | `Test Files  94 passed \| 13 skipped (107)`, `Tests  1188 passed \| 98 skipped (1286)` | FIX-001 |
| Prova 1, Scheduling integração (PostgreSQL real) | **2**/**2** | medido na WU-08 |
| Prova 2, Scheduling unidade | **6**/**6** | medido na WU-08 |
| Prova 3, BFF | **3**/**3** | medido na WU-08 |
| Prova 4, IA | **2**/**2** | medido na WU-08 |

A causa da primeira falha de `validate:integration` (contraste em `onboarding-demonstracao-da-ia`, rodada 1) não foi medida: a rodada 1 a tratou editando o spec e a rodada 2 reverteu essa edição. Na rodada 2, com o spec igual a `79ddc3f`, a tela passou sem retentativa; a falha da rodada 1 fica registrada como intermitente, sem causa isolada. O vermelho da baseline das provas 1 a 3 vem dos relatórios de WU-01 e WU-02 (as provas 1 e 2 deram `Tests 7 failed | 1 passed (8)` com o código de produção intocado) e não foi reexecutado na WU-08.

### Recontagem da baseline por suíte (rodada 2)

Contagem final com o banco, tirada da execução final de `validate:integration` acima, e a baseline correspondente. A baseline é a contagem final menos os testes novos do Goal, que são todos arquivos novos: nenhum arquivo de teste rastreado foi alterado (`git diff --stat -- '*.test.ts'` vazio), então não há teste existente removido, pulado ou ajustado.

| Suíte | Baseline (`79ddc3f`) | Testes novos do Goal | Final |
| --- | --- | --- | --- |
| `test:bff-integration`, com banco | **474** testes em 63 arquivos (derivada: 477 − 3) | 3 (prova 3) | **477** em 64 arquivos |
| `test:scheduling-integration`, com banco | **143** testes em 18 arquivos (derivada: 145 − 2) | 2 (prova 1) | **145** em 19 arquivos |
| `test:ai-orchestrator`, suíte inteira | **1186** passaram, 98 puladas, em 106 arquivos (**medida**: `vitest run --exclude "tests/goal103*"` na árvore final) | 2 (prova 4) | **1188** passaram, 98 puladas, em 107 arquivos |

Só a baseline do `test:ai-orchestrator` foi medida; as do BFF e do Scheduling são derivadas por subtração, porque reexecutá-las sem os arquivos novos custaria outra execução inteira de `validate:integration`. A contagem do BFF **sem banco** da rodada 1 (WU-01) foi **134** `passed` e **340** `skipped`; ela não serve como baseline desta suíte, porque os 340 pulados só rodam com `BFF_TEST_DATABASE_URL`. Nenhuma suíte ficou com teste a menos.

### Ambiente

PostgreSQL 18 descartável, só local, na porta 55611 (usuário `pgtest`, autenticação `trust`), com os bancos `atendly_bff_test` e `atendly_scheduling_test` para as provas. A conferência da pilha real subiu o Scheduling e o BFF locais apontados para o banco descartável **só por variável de ambiente**, sem editar arquivo, com tokens sintéticos. O cluster fica fora do repositório e foi parado no fim.

### Conferência com a pilha real (§4)

Cenário: registro de uma conta nova, `PATCH /v1/onboarding` (negócio, calendário `ATENDLY` e regras de disponibilidade), três agendamentos por `POST /v1/appointments` com `Idempotency-Key`; um concluído por `POST /v1/appointments/:id/complete` e com valor por `POST /v1/appointments/:id/final-value` (`{ "amount": 149.9 }`), outro com `POST /v1/appointments/:id/presence`, e o terceiro sem nada. Resposta de `GET /v1/appointments?startDate=…&endDate=…` (status 200), reduzida aos campos do Goal:

```json
[
  { "id": "cmury0s000015ggi4edtc2j4r", "title": "Corte valor", "status": "COMPLETED",
    "completedAt": "2026-10-03T05:20:10.260Z", "completionOrigin": "MANUAL",
    "noShowAt": null, "noShowNote": null, "presenceConfirmedAt": null, "finalValue": 149.9 },
  { "id": "cmury0s12001aggi45jzv5kju", "title": "Corte presenca", "status": "CONFIRMED",
    "completedAt": null, "completionOrigin": null,
    "noShowAt": null, "noShowNote": null, "presenceConfirmedAt": "2026-10-03T05:20:10.288Z", "finalValue": null },
  { "id": "cmury0s1u001fggi44wleblir", "title": "Corte sem-nada", "status": "CONFIRMED",
    "completedAt": null, "completionOrigin": null,
    "noShowAt": null, "noShowNote": null, "presenceConfirmedAt": null, "finalValue": null }
]
```

`GET /v1/appointments/:id` do concluído: 200, `finalValue` **149.9**, `completedAt` `2026-10-03T05:20:10.260Z`, `completionOrigin` `"MANUAL"`. A rota `final-value` respondeu `finalValue: 149.9` e a `presence`, `presenceConfirmedAt: "2026-10-03T05:20:10.288Z"`, os mesmos valores da listagem. Execuções anteriores do roteiro falharam por defeito do roteiro e não do código (calendário sem configuração, disponibilidade sem regras e `POST` sem corpo com `content-type` JSON); o resultado acima é o da execução em que todas as rotas responderam 200. Não houve falta (`no-show`) nesse cenário: `noShowAt` e `noShowNote` preenchidos estão provados pelas provas 1 e 3, e não pela pilha real.

### Controles negativos (§5)

Rodados depois da última edição de código, cada defeito aplicado por substituição de texto e o arquivo restaurado a partir da cópia guardada fora do repositório. O `sha256` antes e depois foi **IGUAL** nos três arquivos tocados (`provider.ts` do Scheduling `0c9abda3…`, `clients/scheduling/index.ts` do BFF `122859f1…`, `client.ts` da IA `1d52cdac…`), e `git status --porcelain=v1 -uall` ficou idêntico ao do início.

1. **Sem `finalValue` no mapeamento de `toAvenlyAppointment`** (prova 1). **2** reprovados de **2**. Restaurado, **2**/**2**.
2. **Sem os seis campos no `appointmentSchema` do BFF** (prova 3). `Tests  3 failed (3)`, com `expected undefined to deeply equal '2026-10-10T12:30:00.000Z'`. Restaurado, **3**/**3**.
3. **`finalValue` serializado com `Math.round`** (prova 1). `Tests  2 failed (2)`, com `expected 150 to be 149.9`. Restaurado, **2**/**2**.
4. **`finalValue` declarado no schema da IA** (prova 4). **Não reprovou**: `Tests  2 passed (2)`. O cliente da IA decodifica com um `z.object` e depois monta o agendamento por `toAppointment`, que copia campo a campo; um campo declarado só no schema é lido e descartado, e a prova 4 mede a **exposição**, não a declaração. Variante rodada para ter um vermelho do defeito que (e) quer evitar: `finalValue` declarado no schema **e** copiado em `toAppointment`. `Tests  2 failed (2)`, com `expected {...} to not have property "finalValue"`. Restaurado, `sha256` igual e **2**/**2**. O §5.4 literal, portanto, **não** foi cumprido como escrito; a evidência é a execução literal (verde) mais a variante (vermelha), e o Tech Lead decide se isso cobre o critério 2.

### Estado da árvore

Rodada 2: `apps/frontend/e2e/authenticated-matrix.spec.ts` foi revertido ao estado de `79ddc3f` (`git checkout 79ddc3f -- apps/frontend/e2e/authenticated-matrix.spec.ts`), e `git diff 79ddc3f -- apps/frontend` ficou vazio. A tabela "Árvore avaliada" e a execução final de `validate:integration` acima valem para essa árvore. Os controles negativos, a conferência com a pilha real e as provas 1 a 4 da rodada 1 não tocam o spec e não foram refeitos.

`git status --porcelain=v1 -uall` lista, além dos cinco documentos (`docs/migration/DECISIONS.md`, `GAP_ANALYSIS.md`, `CURRENT_STATE.md`, `VALIDATION_GATE.md` e `apps/bff/PUBLIC_API_V1.md`), os seis arquivos de código do Goal e os quatro testes novos da tabela acima, e nada mais. Nenhuma configuração de gate foi alterada e não restou arquivo de controle negativo.

### Não feito

A conferência humana num aparelho real; o `visual:compare` (o CL6 e o A1 não mudam de código e a conta de teste não tem concluído com valor); a falta (`no-show`) pela pilha real; o resumo da Home com prova própria; o vermelho da baseline das provas 1 a 3 reexecutado nesta unidade.

**Nota de fechamento — review103, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-113 ACCEPTED na rodada 2, sem blocker. Os quatro blockers da rodada 1 (spec e2e alterado pela DIAG-001, `validate:integration` na árvore revertida, recontagem por suíte com banco e documentos) foram fechados; nenhum era de produção.
- **Conferência do Tech Lead na rodada 2.** `git hash-object` de `apps/frontend/e2e/authenticated-matrix.spec.ts` dá `2f75aa9d…`, igual ao blob de `79ddc3f`; o `sha256` do arquivo difere só por CRLF (`core.autocrlf=true`). `git diff 79ddc3f --stat` vazio em `apps/frontend`, `apps/ai-orchestrator/src`, `prisma`, `scripts` e nas configurações de vitest e playwright. Os dez `sha256` de "Árvore avaliada" batem com a worktree. Provas 2 (**6**/**6**) e 4 (**2**/**2**) reexecutadas; provas 1 e 3 lidas. A conferência com a pilha real (§4) e os controles negativos foram aceitos pelo registro acima, não reexecutados.
- **Gates do IA Loop na rodada 2.** typecheck, `validate:core` e `git diff --check` passaram. A WU-07 nativa da rodada 2 deu `validate:integration` exit 0, `255 passed (7.9m)` e `authenticated gate retries: 0`, além da execução do FIX-001 registrada em "Execuções".
- **Controle 4.** Aceito na forma registrada: a execução literal fica verde e a variante com a cópia em `toAppointment` fica vermelha. Isso cobre o critério 2.
- **Falha de contraste da rodada 1.** Sem causa medida. Fica como proposta de Goal futuro, com a hipótese da DIAG-001 (o axe mede o fade-in `rise` da demonstração do onboarding). Detalhe no [review103](reviews/103-review.md).

## Serviços iguais ao protótipo (Servicos:S1, S3, Servicos:S4 e Agenda:S1), do Goal095 (rodadas 1 a 4)

[D-114](DECISIONS.md), **PROPOSED**. Seção escrita na rodada 1 e **atualizada na rodada 4 sobre a árvore final** (a das rodadas 2 e 3), sem alterar nenhuma configuração de gate nem código. Os números do "Fim", os controles do §7, a contagem de testes e as execuções abaixo são os da árvore final, com os hashes de `ServiceList.tsx` `c249ac47…`, `ServiceForm.tsx` `505ebab7…` e `avenly-services.css` `d9a55fc7…`; os da rodada 1 foram substituídos.

### `visual:compare` do início e do fim

Comando do fim, rodado na rodada 4 sobre a árvore final (hashes acima; os três arquivos de produção não mudaram desde a rodada 3): `npm run visual:compare -- --target Servicos:S1,S3,Servicos:S4,Agenda:S1,CL1,CL6,M1,N1,A1,A10,H3`. O início é a execução da WU-01 sobre a baseline `a4cf1f6`, nesta mesma máquina; por isso ele difere um pouco dos números que o Goal cita (Goal088 e Goal094), e a comparação válida é entre as duas execuções desta máquina. Diff em % da página, na ordem mobile / tablet em retrato / tablet em paisagem / desktop.

| Quadro | Início | Fim |
| --- | --- | --- |
| Servicos:S1 | 9,4 / 5,8 / 4,4 / 3,4 | 8,5 / 4,5 / 4,2 / 3,2 |
| Servicos:S3 | 7,1 / 7,8 / 13,4 / 8,0 | 6,8 / 3,5 / 13,4 / 4,8 |
| Servicos:S4 | 9,7 / 9,1 / 14,4 / 8,9 | 9,5 / 5,9 / 13,7 / 5,0 |
| Agenda:S1 | 9,7 / 9,1 / 14,5 / 8,8 | 12,2 / 6,2 / 15,3 / 6,4 |
| CL1 | 9,5 / 4,2 / 3,6 / 3,2 | 9,5 / 4,2 / 3,6 / 3,2 |
| CL6 | 9,0 / 3,8 / 6,0 / 5,1 | 9,1 / 3,8 / 6,0 / 5,1 |
| M1 | 8,6 / 3,7 / 6,2 / 5,2 | 8,6 / 3,7 / 6,2 / 5,2 |
| N1 | 8,8 / 4,4 / 6,2 / 5,2 | 8,8 / 4,4 / 6,2 / 5,2 |
| A1 | 10,8 / 5,3 / 5,8 / 4,9 | 10,8 / 5,3 / 5,8 / 4,9 |
| A10 | 17,7 / 5,7 / 6,4 / 5,3 | 17,7 / 5,7 / 6,4 / 5,3 |
| H3 | 14,4 / 8,8 / 9,6 / 7,9 | 14,4 / 8,8 / 9,6 / 7,9 |

Os números são os do relatório de cada execução, não foram recalculados. Servicos:S1 melhorou em todos os devices (em S1 o mobile é 8,5, não os 8,4 da rodada 1). Servicos:S3 melhorou em todos, e no tablet em paisagem ficou igual ao início (13,4). Servicos:S4 melhorou em todos os devices (mobile 9,7 para 9,5, tablet em retrato 9,1 para 5,9, tablet em paisagem 14,4 para 13,7, desktop 8,9 para 5,0). Agenda:S1 melhorou no tablet em retrato (9,1 para 6,2) e no desktop (8,8 para 6,4), e **piorou no mobile (9,7 para 12,2) e no tablet em paisagem (14,5 para 15,3)**. A causa dessas duas pioras **não foi medida**: o início rodou sem os `steps` e o fim abre a linha "Cor na agenda", com a escolha de cores e a prévia, que o início não tinha na tela, mas isso é só a diferença de condição, não uma causa provada. A conclusão da rodada 1 de que Servicos:S4 piorava no mobile **não vale mais** para a árvore final. Dos quadros do §2, só CL6 no mobile se moveu (0,1 ponto), e é a mudança de cor do traço de (g), esperada; os outros quadros do §2 têm diff idêntico em todos os devices. A mudança de cor do traço em A1, A10 e CL6 é a esperada.

### Os dezesseis `side-by-side.png` do §1

Todas as capturas do app trazem os avisos "Atendimento automático parado" e "IA indisponível", o cartão "WhatsApp desconectado" e o item "Notificações" da sidebar: estado do ambiente (orquestrador da IA desligado), divergência 2 de D-114.

- **Servicos:S1, lista.**
  - *Mobile:* o quadro tem a barra "‹ Mais", o título "Serviços", "6 ativos · 1 precisa de revisão · 1 inativo", as linhas com traço de cor e seta, uma linha âmbar com "Corrigir", o grupo "INATIVOS" e o "+" flutuante. O app tem os dois avisos no alto, "Serviços", "5 ativos · 1 inativo", o campo "Buscar serviço" e as linhas com traço (Lavanda, Ardósia, Terracota, Oliva, na paleta nova) e seta, **sem botão "Desativar"** em nenhuma. A ordem é alfabética em pt-BR (Coloração primeiro). A barra "‹ Mais" não existe; a barra de abas e o "+" vêm da casca.
  - *Tablet em retrato:* a mesma estrutura de linha, com o grupo "INATIVOS" e "Progressiva · a IA não oferece". O app acrescenta os avisos, o campo de busca e a barra de abas, e não tem a linha "Corrigir" (a conta não tem serviço pendente).
  - *Tablet em paisagem e desktop:* a lista numa coluna de 380 px ao lado de um painel vazio ("Selecione um serviço" nos dois, depois da rodada 2); o "+" redondo verde-azulado no cabeçalho nos dois. O app tem a busca e os avisos, e a lista aparece cortada pela altura da captura.
- **Servicos:S3, novo serviço.**
  - O quadro vem preenchido (Manicure, 40 min, "Fixo", R$ 55,00, "A IA responde: …") e o app vem vazio ("Ex.: 45 min", "R$ 0,00", sem a frase da IA). Nos dois: "Nome", "Duração" (− e +, atalhos 30/60/90), o preço segmentado "Fixo | A partir de | Sob consulta | Sem preço", o título "MAIS OPÇÕES" com as cinco linhas fechadas e seus valores (Cor na agenda · Sem cor, Descrição · Opcional, Recorrência · Não, Intervalo antes e depois · Nenhum, Instruções para a IA · Nenhuma) e o CTA "Salvar serviço".
  - *Mobile:* uma coluna; no app as linhas ficam abaixo da dobra, sob os avisos.
  - *Tablet em retrato em diante:* duas colunas (campos à esquerda, "Mais opções" à direita) nos dois.
  - *Tablet em paisagem e desktop:* a lista ao lado do formulário; o CTA do app fica logo abaixo do conteúdo ou acima da barra de abas, e o do quadro fica fixo no pé do painel.
- **Servicos:S4, editar, opções.**
  - O app edita "Corte feminino" e o quadro "Coloração". As capturas ficam cortadas pelo rodapé. A linha-resumo do topo aparece aberta (divergência 6). O app mostra também as linhas "Cor na agenda" e "Descrição", que o quadro S4 não mostra (medida, não declarada).
  - "Recorrência" (aberta, "Não"), "Intervalo antes e depois" (aberta, com os passos de "Antes" e "Depois") e "Instruções para a IA" (aberta, "Nenhuma"), como no quadro. "Serviço ativo" fica abaixo das linhas (cortado pelo rodapé em tablet e desktop). "Onde é feito" não existe (divergência 5), nem "alterações não salvas" e o "•••" na barra (divergência 10). O CTA é "Salvar alterações".
  - *Correções da rodada 3, vistas nos `side-by-side.png` finais:* em tablet em paisagem e desktop, a linha aberta da lista (a do serviço em edição, "Corte feminino") vai de borda a borda do painel da lista, com o fundo `--accent-soft` e a barra de 3 px à esquerda, como a linha aberta "Coloração" do quadro, e não mais recuada pelo padding do painel (a lista só aparece ao lado do formulário a partir de 1024 px). O CTA "Salvar alterações" fica fixo no pé da tela com `padding-bottom` de **28 px** de 768 a 1099 px (tablet em retrato e em paisagem) e de **24 px** a partir de 1100 px (desktop de 1366), no lugar dos 46 px do mobile.
- **Agenda:S1, cor na agenda.**
  - A escolha de cor mostra "sem cor" e as seis cores como círculos com a marca de escolhido (no app, Lavanda, que é o token `VIOLET` do serviço semeado; no quadro, Ameixa), sem o "+" (divergência 4), e o texto "Seis cores sugeridas.". A prévia "ASSIM NA AGENDA", "15:30 Cliente" e "Corte feminino · 45 min · R$ 90" (no quadro, "Ana Paula", divergência 9). O CTA é "Salvar alterações" no app e "Salvar" no quadro (divergência 7).
  - Corrigido na rodada 2: na edição, "Duração" e "Preço" ficam lado a lado, com "Fixo · R$ 90,00" num campo só e a linha de cores espalhada pela largura, como no quadro. Sobra, por decisão: o rótulo "Fixo ·" abre o controle segmentado abaixo do campo (o quadro não tem segmentado) para a troca de tipo continuar possível.
  - *Correções da rodada 3, vistas nos `side-by-side.png` finais:* no tablet em retrato o CTA "Salvar alterações" tem `padding-bottom` de 28 px e fica fixo no pé da tela, como o "Salvar" do quadro; em tablet em paisagem a linha aberta da lista ("Corte feminino") vai de borda a borda do painel, e no desktop o CTA tem 24 px. O app tem a linha "Cor na agenda" aberta com "sem cor" e as seis cores, e a captura em paisagem fica cortada na altura do formulário pelos dois avisos no alto e pela barra de abas, que o quadro não tem.
  - Em tablet em paisagem e desktop, a lista do Agenda:S1 do quadro é uma variante antiga ("Revisar" e "Inativo" como selos, nota "A cor é só um acento…") e difere do S1 atual e da lista do app.
- **A1 (desktop).** Os traços usam a paleta nova (Terracota, Oliva, Ardósia e Lavanda em Escova, Hidratação, Corte masculino e Corte feminino). O dia é 3 de outubro, no quadro 18 de setembro. A mudança de cor do traço é a esperada.
- **A10.** Diff numericamente idêntico ao início nos quatro devices; a cor do traço dos serviços muda como em A1, é esperada e é a única mudança.
- **CL6 (desktop).** Os traços usam a paleta nova (esperado). A conta tem 2 atendimentos, "valor não registrado · registrar" e o rodapé "Valor registrado: R$ 0 / 2 atendimentos sem valor", no quadro 9 atendimentos e R$ 640 (dados, divergência 3).
- **CL1, M1, N1, H3.** Diff idêntico ao início nos quatro devices; sem mudança.

### Controles negativos (§7)

Rodados na **rodada 4**, **depois da última edição de código** (a da rodada 3, no `avenly-services.css`; a rodada 4 só mexe em documentos), em `apps/frontend`, com `npx vitest run tests/goal095-servicos.test.tsx` (**46 testes** no arquivo). Cada defeito foi injetado por edição real num dos três arquivos de produção e o arquivo foi restaurado do backup no mesmo passo; o sha256 conferido depois de cada controle é igual ao de antes (`sha256 identico` na saída do script): `ServiceList.tsx` `c249ac474f9661ab1f04037773731a4a9c8dc28646b000557024b60f10edb2ee`, `ServiceForm.tsx` `505ebab715d348bf8db762f2a9f9b2ea58d2171980567709c91e01cc86c18fae` e `avenly-services.css` `d9a55fc74c9ae74f71e5a12728d3bb00950772159247b9da8d2f0e323d5cded9`. Sem nenhum defeito, a execução do arquivo deu `46 passed (46)` antes dos controles, e a árvore tinha os mesmos três hashes depois deles (`git status --porcelain=v1 -uall` com as mesmas 17 linhas antes e depois, sem `.ctlbak` restante).

| Controle | Defeito injetado | Com o defeito | Sem o defeito |
| --- | --- | --- | --- |
| 1 | `ServiceList.tsx`: um botão "Desativar" volta à linha, antes de `service-row-body` | `1 failed, 45 passed (46)`: "nenhuma linha tem botão 'Desativar' ou 'Ativar'" (prova 1) | 46/46 |
| 2 | `ServiceForm.tsx`: "Sem preço" grava `ON_REQUEST` (`{ value: "ON_REQUEST", label: "Sem preço" }`) | `3 failed, 43 passed (46)`: "o preço tem quatro opções com estado, 'Fixo' marcado", "'Sob consulta' grava ON_REQUEST no pedido de criação, com active: true", "'Sem preço' grava NOT_INFORMED no pedido de criação, com active: true" (prova 2) | 46/46 |
| 3 | `ServiceForm.tsx`: a opção "recorrência" nasce aberta (`new Set<OptionKey>(["recurrence"])`) | `4 failed, 42 passed (46)`: "as cinco linhas de opção nascem fechadas e mostram o valor atual", "tocar a linha abre o editor dela, sem fechar as outras" (prova 2), "as linhas nascem fechadas e mostram o valor atual do serviço" e "a recorrência aberta mostra o valor como botão que revela o campo" (prova 3) | 46/46 |
| 4 | `avenly-services.css`: `[data-color="SKY"]` com `#5b8fb0` no lugar de `#8e5a86` | `1 failed, 45 passed (46)`: "[data-color=SKY] usa #8e5a86 (Ameixa)" (prova 4) | 46/46 |
| 5 | `ServiceForm.tsx`: segunda chamada de `useShellConfig`, igual à real, antes de `const barTitle` | `2 failed, 44 passed (46)`: "nas três rotas, na faixa ≥1024" e "nas três rotas, na faixa <1024" (prova 5) | 46/46 |

O vermelho da baseline dos 46 testes, medido na rodada 4 trocando os três arquivos de produção pelos de `HEAD` (copiados antes e restaurados depois, com os três hashes conferidos iguais): **39 reprovam e 7 passam** (`39 failed | 7 passed (46)`). Os 7 que passam já estavam cumpridos pela baseline e são declarados em [D-114](DECISIONS.md): na prova 1, "o resumo fica no cabeçalho", "a linha mostra o nome e 'duração · preço'", "o traço usa a cor do serviço", "o link 'Editar <nome>' e a classe directory-row continuam" e "sem edição a lista é só leitura, sem link nem 'Corrigir'"; e, na prova 5, "nas três rotas, na faixa ≥1024" e "nas três rotas, na faixa <1024", que guardam comportamento. Os testes que a rodada 1 tinha (42) davam 35 reprovados e os mesmos 7 aprovados; os 4 acrescentados nas rodadas 2 e 3 também reprovam na baseline (35 + 4 = 39), de modo que **nenhum teste do arquivo ficou sem vermelho medido**, salvo os 7 declarados.

### Execuções que sustentam as contagens

Todas de 2026-10-03. As do loop são as da **rodada 3** (`tools/ia-loop/.state/results/work_unit/095-r3-unit-wu-NN.json`), rodadas sobre a árvore final, que a rodada 4 não alterou em código. A suíte do frontend e o `visual:compare` são da rodada 4.

| Execução | Resultado |
| --- | --- |
| `tsc --noEmit`, rodada 3, WU-04 | código 0 em 1,7 s |
| `npm run lint`, rodada 3, WU-05 | código 0 em 13,7 s |
| `npx vitest run goal095-servicos`, rodada 3, WU-06 | código 0 em 8,8 s; `Tests 46 passed (46)` |
| `validate:core`, rodada 3, WU-07 | código 0 em 86,9 s; 17 passos, **15 passaram**, 0 falharam e 2 foram pulados (`test:bff` e `test:health-worker`, por desenho do gate); auditoria estática com 34 verificações, 33 passaram e 1 foi pulada (`production_health`) |
| `test:gate`, rodada 3, WU-08 | código 0 em 1,4 s; `tests 233, pass 233` |
| `validate:ui`, rodada 3, WU-09 | código 0 em 45,4 s; **169 passed**; "public UI gate retries: 0" |
| `validate:integration`, rodada 3, WU-10 | código 0 em 583,5 s; **36/36** passos; gate autenticado **255 passed (7,9 min)**; "authenticated gate retries: 0" |
| `git diff --check`, rodada 3, WU-12 | código 0 |
| Suíte do frontend, rodada 4 (`npx vitest run` em `apps/frontend`, depois dos cinco controles) | código 0; **142 arquivos e 1628 testes passaram** (`Test Files 142 passed (142)`, `Tests 1628 passed (1628)`); a rodada 1 tinha 1624, e a diferença são os 4 testes acrescentados em `goal095-servicos.test.tsx` nas rodadas 2 e 3 |
| `visual:compare` dos onze alvos, rodada 4 | código 0; a tabela do "Fim" acima |

O critério do Goal de **255** testes do gate autenticado e 0 retentativas é sustentado pela execução do `validate:integration` da rodada 3. A contagem de testes do `test:frontend` dentro do `validate:core` não consta do registro do loop (a saída vem truncada); por isso a contagem do frontend citada é a da execução própria da rodada 4. As execuções da rodada 1 (a primeira de `validate:core`, que falhou em `tests/goal084-price-input.test.tsx:238` por causa do rótulo antigo "Nome do serviço", a reexecução de 91,8 s, `validate:integration` de 585,9 s) descrevem a árvore da rodada 1 e **não** sustentam mais nenhuma contagem aqui.

### Estado da árvore

`git status` ao fim da rodada 4: 13 arquivos modificados em `apps/frontend` (os três de produção, `e2e/visual/targets.json`, `e2e/authenticated-matrix.spec.ts` e oito testes: `goal015-services`, `goal015-shell-invariant`, `goal058-service-form`, `goal076-service-form`, `goal076-service-list`, `goal078-service-instruction-form`, `goal084-price-input` e `goal088-list-detail`) e 1 novo (`apps/frontend/tests/goal095-servicos.test.tsx`), mais os três documentos desta seção. Nenhum arquivo de configuração de gate foi alterado; `targets.json` mudou só pelos `steps` de duas entradas e `authenticated-matrix.spec.ts` só pelas três linhas que o §6 autoriza. A rodada 1 contava 12 arquivos modificados; o décimo terceiro é `goal088-list-detail.test.tsx`, que uma rodada posterior mudou em uma linha (ver D-114).

### Não feito

- Conferência humana num aparelho real.
- Captura da linha "Corrigir" em âmbar: a conta de teste não tem serviço pendente, e o markup está provado só em jsdom.
- Medida da causa do aumento do diff em Agenda:S1 no mobile (9,7 para 12,2) e no tablet em paisagem (14,5 para 15,3). Servicos:S4 **não** piorou em nenhum device na árvore final.
- Os quadros S2, S5 a S9 e S1b.
- Decisão do Tech Lead sobre [D-114](DECISIONS.md), que segue PROPOSED.

**Nota de fechamento — review095, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-114 ACCEPTED na rodada 4, sem blocker. Os blockers das rodadas 1 a 3 (7, 2 e 2) foram fechados: sete de fidelidade visual, dois de CSS e dois de evidência e documento. O item "Decisão do Tech Lead sobre D-114" de "Não feito" está resolvido.
- **Conferência do Tech Lead na rodada 4.** Os `sha256` de `ServiceList.tsx`, `ServiceForm.tsx` e `avenly-services.css` batem com os citados nos controles do §7. `git status` tem as mesmas 17 linhas. O spec e2e difere da baseline só pelas três linhas do §6, e `targets.json` só pelos `steps` de Agenda:S1 e Servicos:S4. O `visual:compare` reexecutado deu exit 0 e os mesmos números do "Fim". O Tech Lead abriu os dezesseis `side-by-side.png`. Os controles do §7 e o vermelho da baseline foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Gates do IA Loop na rodada 4.** typecheck, lint, `goal095-servicos` 46/46, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `git diff --check` com exit 0.
- **Aceito sem prova completa.** A linha "Corrigir" em âmbar, só em jsdom; a piora de Agenda:S1 no mobile e no tablet em paisagem, sem causa medida. Detalhe no [review095](reviews/095-review.md).

## Conversas sem WhatsApp e central de notificações iguais ao protótipo (C5 e NT1), do Goal096 (rodada 1)

[D-115](DECISIONS.md), **PROPOSED**. Seção escrita na WU-11 da rodada 1, **depois da última edição de código** e da execução final, sem alterar nenhuma configuração de gate. Os números do "Fim", os controles do §7, a contagem de testes e as execuções abaixo são os da árvore final, com os hashes de `ConversationInbox.tsx` `78f4b20fd698af33f77278e04ad108ece3ba567a8359e318b1db15f256146597`, `NotificationsDrawer.tsx` `21a07628023e5ad1db0e208d85d27d918eec8c1ba0aab60755aa1a7f459941f5` e `NotificationsScreen.tsx` `bc6b9e1f780d265768ed05abd6854bf4c88018068471070b0070c3a418141d16`. Os outros arquivos da árvore final, conferidos por sha256 antes dos controles e depois deles: `inboxLenses.ts` `6b0a9eaf…`, `DashboardScreen.tsx` `2a34d7d9…`, `avenly-conversations.css` `9e528d7c…`, `avenly-notifications.css` `77cf4631…`, `e2e/routes.ts` `e1baa597…`, `e2e/authenticated-matrix.spec.ts` `8629db32…`, `e2e/visual/targets.json` `0bd786a1…` e `tests/goal096-conversas-e-notificacoes.test.tsx` `4a08548b…` (o teste foi reescrito na rodada 2; os sete arquivos de produção seguem com os hashes acima).

### `visual:compare` do início e do fim

Comando do fim, rodado na WU-11 sobre a árvore final (hashes acima), em 2026-10-03, 10:30 UTC: `npm run visual:compare -- --target C5,NT1,H3,CL1,Servicos:S1,N1`, código 0. O início é a mesma lista de alvos rodada nesta máquina, na mesma WU, com os sete arquivos de produção e o `targets.json` trocados pelos de `HEAD` (`b96e842`, que difere de `7393eda` só em documentos) e restaurados em seguida, com os hashes conferidos por `sha256sum -c`; no NT1 do início vale a entrada de `targets.json` da baseline, que abre `/notificacoes` nos quatro devices. Diff em % da página, na ordem mobile / tablet em retrato / tablet em paisagem / desktop.

| Quadro | Início | Fim |
| --- | --- | --- |
| C5 | 12,4 / 8,4 / 6,1 / 5,4 | 2,6 / 0,6 / 0,5 / 0,8 |
| NT1 | 11,3 / 5,8 / 59,2 / 68,8 | 10,4 / 4,4 / 49,2 / 60,2 |
| H3 | 8,1 / 4,1 / 3,7 / 3,0 | 8,1 / 4,1 / 3,7 / 3,0 |
| CL1 | 8,8 / 3,6 / 3,0 / 2,8 | 8,8 / 3,6 / 3,0 / 2,8 |
| Servicos:S1 | 7,7 / 3,6 / 3,7 / 2,7 | 7,7 / 3,6 / 3,7 / 2,7 |
| N1 | 8,2 / 3,8 / 5,9 / 5,1 | 8,2 / 3,8 / 5,9 / 5,1 |

Os números são os do relatório de cada execução, não foram recalculados. O C5 melhorou nos quatro devices. O NT1 melhorou nos quatro, mas o paisagem e o desktop seguem altos (49,2 e 60,2) porque o fim compara a Home da conta visual atrás da gaveta com a Home do quadro (divergência 6 de D-115); o início, que comparava a página `/notificacoes` com o quadro da gaveta, não é comparável com o fim por isso. H3, CL1, Servicos:S1 e N1 têm diff **idêntico** ao do início nos quatro devices: nenhuma piora. As linhas "passo opcional não encontrado" do NT1 são esperadas: o sino é link no mobile e no tablet em retrato e botão no paisagem e no desktop, e um dos dois passos opcionais não acha o papel que não existe.

### Os vinte e quatro `side-by-side.png`

Todas as capturas do app refletem o estado do ambiente do `visual:compare` (orquestrador da IA desligado e WhatsApp desconectado): avisos da casca, quando a tela não os cobre, e o cartão da sidebar no desktop.

- **C5, mobile, tablet em retrato, tablet em paisagem e desktop.** O app e o quadro têm o cabeçalho "Conversas", o ícone, o título "Conecte seu WhatsApp para ver suas conversas aqui.", o texto sobre Comercial, Não classificadas e Pessoal e o botão "Conectar WhatsApp", sem abas, sem busca e sem chip "Ignorados". Sobra: no mobile o título fica cerca de 16 px abaixo do do quadro e a barra de abas é mais baixa (o indicador de início do iPhone é a divergência 1, o título não foi medido além da vista); no desktop o cartão da sidebar é "WhatsApp desconectado" com "Reconectar", e o quadro tem "IA inativa" (divergência 2), e a sidebar tem o item "Notificações" com a contagem. O botão de busca do cabeçalho do quadro não existe no app (divergência 4).
- **NT1, mobile e tablet em retrato.** O app abre a Home e o passo do sino (link) leva a `/notificacoes`, que é a tela empurrada: voltar no topo para `/inicio`, o título "Notificações", sem barra de abas, sem eyebrow, subtítulo nem "Histórico recente", como o quadro. A conta tem duas notificações: a condição resolvida "IA indisponível", riscada e com o desfecho, e a não lida "WhatsApp desconectado", em negrito com o ponto à direita; os grupos são "Ontem" e uma data (`01/10`), e não "Hoje" e "Ontem". A casca mostra o aviso "Atendimento automático parado", que o quadro não tem, e a seção "Preferências" aparece abaixo da lista (divergência 5). A faixa âmbar, o grupo "Hoje" e o negrito âmbar não aparecem, porque a conta não tem notificação de atenção (divergência 3).
- **NT1, tablet em paisagem e desktop.** O app abre a Home e o sino (botão) abre a gaveta sobre ela, com o cabeçalho "Notificações", "Marcar lidas", as mesmas duas linhas e o rodapé "Preferências de notificação" (divergência 5). A Home atrás é a da conta visual (divergência 6), e é ela que sustenta os 49,2 e 60,2.
- **H3, CL1, Servicos:S1 e N1, nos quatro devices.** Sem mudança em relação ao início. Em Servicos:S1 e N1 no tablet em retrato aparece a linha verde-azulada de 2 px na largura toda no pé do conteúdo, que vem da casca (observação 2 do [review095](reviews/095-review.md)); a casca não mudou e o diff é idêntico ao do início.

### Mudanças do §6 no gate autenticado

`git diff` contra a baseline: em `apps/frontend/e2e/routes.ts`, uma linha, o `contentMarker` de `/notificacoes` de "Central de notificações" para "Notificações"; em `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no teste "inicio: the bell opens the notifications", o comentário (768 para 1024 px), o `if (width < 768)` para `if (width < 1024)` e o nome do `h1` esperado para "Notificações" (8 linhas no total, 4 inseridas e 4 removidas). O título do teste não mudou. Nenhum outro teste, helper, seletor ou constante desses arquivos mudou, e o gate autenticado tem **255** testes. `e2e/visual/targets.json` mudou só pela entrada do NT1 e pela nota do C1.

### Controles negativos (§7)

Rodados **na rodada 3, sobre a árvore final, depois da última edição de código e do último ajuste do teste**, em `apps/frontend`, com `npx vitest run tests/goal096-conversas-e-notificacoes.test.tsx` (**21 testes** no arquivo). Cada defeito foi injetado por edição real num dos três arquivos de produção citados no início da seção, e o arquivo foi restaurado do backup no mesmo passo; o sha256 conferido depois de cada controle é igual ao de antes. Sem nenhum defeito, a execução do arquivo deu `Tests 21 passed (21)` antes dos controles e depois deles, e a árvore tinha os mesmos hashes (`sha256sum -c` sem falha, e `git status --porcelain=v1 -uall` com as mesmas 21 linhas).

| Controle | Defeito injetado | Com o defeito | Sem o defeito |
| --- | --- | --- | --- |
| 1 | `ConversationInbox.tsx`: `if (whatsappView === "off") return <NoWhatsappState />;` antes da linha de `probe === "empty"` | `2 failed, 19 passed (21)`: "WhatsApp off com uma conversa: as abas, sem o C5, e a casca mantém o banner" e "a consulta da regra falhando: o caminho de hoje, com as abas e sem o C5" (prova 1), com `TestingLibraryElementError: Unable to find role="tablist"` | 21/21 |
| 2 | `ConversationInbox.tsx`: `probe === "empty" \|\| whatsappView === "unknown"` na linha que escolhe `NoWhatsappState` | `1 failed, 20 passed (21)`: "WhatsApp unknown: as abas, sem o C5 e sem a consulta da regra" (prova 1), com `Unable to find role="tablist"` | 21/21 |
| 3 | `ConversationInbox.tsx`: `href="/onboarding/whatsapp"` no lugar de `href="/configuracoes/whatsapp"` | `1 failed, 20 passed (21)`: "WhatsApp off e nenhuma conversa: o C5, sem abas, busca nem banner da casca" (prova 1), com `expect(element).toHaveAttribute("href", "/configuracoes/whatsapp")` | 21/21 |
| 4 | `NotificationsDrawer.tsx`: `NOTIFICATIONS_DRAWER_QUERY = "(min-width: 768px)"` | `2 failed, 19 passed (21)`: "a consulta da gaveta é a de lista e detalhe lado a lado" (`AssertionError: expected '(min-width: 768px)' to be '(min-width: 1024px)'`) e "com a consulta de largura falsa, o sino é link para /notificacoes" (`Unable to find role="link" and name /^Notificações, 2 não lidas$/`) (prova 4) | 21/21 |
| 5 | `NotificationsScreen.tsx`: `<span className="badge">{level.label}</span>` antes do título da linha | `2 failed, 19 passed (21)`: "na página, cada nível tem a forma do quadro e nenhum selo de texto" e "a gaveta mostra as mesmas linhas" (prova 3), com `AssertionError: expected <span class="badge"></span> to be null` | 21/21 |
| 6 | `ConversationInbox.tsx`: segunda chamada de `useShellConfig`, com a mesma configuração da real, no ramo `NoWhatsappState` | `3 failed, 18 passed (21)`: "WhatsApp off e nenhuma conversa: o C5, sem abas, busca nem banner da casca" (prova 1), com `AssertionError: expected [ { active: 'conversas', …(4) }, …(1) ] to have a length of 1 but got 2`, e "/conversas com o status pendente, com o C5 e com as abas, na faixa ≥1024" e "…na faixa <1024" (prova 5), cada um com `AssertionError: expected 2 to be 1 // Object.is equality` | 21/21 |

O vermelho da baseline dos 21 testes, medido na **rodada 3** trocando os sete arquivos de produção pelos de `HEAD` (copiados antes e restaurados depois, com os hashes conferidos iguais): **14 reprovam e 7 passam** (`14 failed | 7 passed (21)`). Reprovam: seis da prova 1 (o C5 com a consulta vazia, `off` com uma conversa, a consulta falhando, o status carregando, a consulta carregando e a troca do C5 pelas abas), dois da prova 2 (a tela empurrada e a página a partir de 1024 px), dois da prova 3 (a forma sem selo, na página e na gaveta), dois da prova 4 (a consulta da gaveta e o sino link com a consulta falsa) e os dois de `/conversas` da prova 5 (uma por faixa, porque a baseline não tem o ramo do C5). Passam e são declarados: `active` e `unknown` da prova 1 (a baseline já mostra as abas), "sem notificação não lida não há 'Marcar lidas'" da prova 2, "'Marcar como lida' marca só aquela notificação" da prova 3, "com a consulta verdadeira, o sino é botão e abre o dialog sem navegar" da prova 4 e os dois de `/notificacoes` da prova 5, que guardam comportamento.

### Execuções que sustentam as contagens

Todas de 2026-10-03. As do loop são as da **rodada 1** (`tools/ia-loop/.state/results/work_unit/096-r1-unit-wu-NN.json`), rodadas sobre a árvore final: nenhum arquivo de produção foi editado depois delas, e os hashes de cima são os mesmos antes e depois dos controles. A suíte do frontend, o `visual:compare` e os controles são da WU-11.

| Execução | Resultado |
| --- | --- |
| `tsc --noEmit`, rodada 1, WU-04 | código 0 em 1,6 s |
| `npm run lint`, rodada 1, WU-05 | código 0 em 13,5 s |
| `npx vitest run goal096-conversas-e-notificacoes`, rodada 1, WU-06 | código 0 em 2,7 s; `Tests 21 passed (21)` |
| `validate:core`, rodada 1, WU-07 | código 0 em 97,6 s; 17 passos, **15 passaram**, 0 falharam e 2 foram pulados (`test:bff` e `test:health-worker`, por desenho do gate); a auditoria estática pulou `production_health` |
| `test:gate`, rodada 1, WU-08 | código 0 em 1,3 s; `tests 233, pass 233, fail 0` |
| `validate:ui`, rodada 1, WU-09 | código 0 em 46,2 s; **169 passed** e 21 skipped na saída do Playwright; "public UI gate retries: 0" |
| `validate:integration`, rodada 1, WU-10 | código 0 em 585,0 s; **36/36** passos; gate autenticado **255 passed (7,9 min)**; "authenticated gate retries: 0" |
| Suíte do frontend, WU-11 (`npx vitest run` em `apps/frontend`, depois dos seis controles) | código 0; **143 arquivos e 1649 testes passaram** (`Test Files 143 passed (143)`, `Tests 1649 passed (1649)`); a baseline tinha 142 arquivos e 1628 testes (contagem do Goal095), e a diferença são os 21 testes de `goal096-conversas-e-notificacoes.test.tsx` |
| `npx vitest run tests/goal096-conversas-e-notificacoes.test.tsx` e `npx vitest run` em `apps/frontend`, rodada 3 (FIX-001), sobre a árvore final, depois dos seis controles e da restauração por sha256 | código 0; `Tests 21 passed (21)` no arquivo, e na suíte `Test Files 143 passed (143)` e `Tests 1649 passed (1649)` |
| `visual:compare` dos seis alvos, WU-11 | código 0; a tabela do "Fim" acima |

O critério do Goal de **255** testes do gate autenticado e 0 retentativas é sustentado pela execução do `validate:integration` da rodada 1. A contagem de testes do `test:frontend` dentro do `validate:core` não consta do registro do loop (a saída vem truncada); por isso a contagem do frontend citada é a da execução própria da WU-11. A saída do `validate:integration` não registra a contagem por suíte (`test:bff-integration` e as outras), e esta seção não a cita.

### Estado da árvore

`git status` ao fim da WU-11: 17 arquivos modificados em `apps/frontend` (os sete de produção `ConversationInbox.tsx`, `inboxLenses.ts`, `DashboardScreen.tsx`, `NotificationsDrawer.tsx`, `NotificationsScreen.tsx`, `avenly-conversations.css` e `avenly-notifications.css`; `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts` e `e2e/visual/targets.json`; e sete testes: `goal017-a11y`, `goal017-inbox-tabs`, `goal017-reachability`, `goal017-shell-invariant`, `goal022-notifications-screen`, `goal077-notifications-center` e `goal077-notifications-drawer`) e 1 novo (`apps/frontend/tests/goal096-conversas-e-notificacoes.test.tsx`), mais os três documentos desta seção. Nenhum arquivo de configuração de gate foi alterado, nem `apps/frontend/AGENTS.md`, e não há resto de controle negativo nem `e2e-results/` versionado.

### Não feito

- Conferência humana num aparelho real.
- O C1 e os demais quadros de Conversas: a conta visual não tem conversa.
- O NT1 com notificação de atenção ou crítica em captura: a conta não as tem, e a faixa âmbar, o grupo "Hoje" e o triângulo ficam provados só em jsdom.
- A regra de (a) para um negócio que desconectou com histórico, provada só em jsdom.
- Decisão do Tech Lead sobre [D-115](DECISIONS.md), que segue PROPOSED.

**Nota de fechamento — review096, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-115 ACCEPTED na rodada 3, sem blocker. O blocker da rodada 1 (a prova 5 sem o ramo do C5) e os dois da rodada 2 (o controle 6 e o vermelho da baseline não reexecutados, e os documentos com as contagens da versão antiga do teste) foram fechados. Nenhum foi de código de produção. O item "Decisão do Tech Lead sobre D-115" de "Não feito" está resolvido.
- **Conferência do Tech Lead na rodada 3.** Os hashes de produção, de `e2e/` e de `targets.json` batem com os do início desta seção, e o teste está em `4a08548b…`. `git status --porcelain=v1 -uall` tem 21 linhas, só de arquivos autorizados; `apps/frontend/AGENTS.md` foi restaurado depois do `visual:compare` e não há `e2e-results/`. `npx vitest run tests/goal096-conversas-e-notificacoes.test.tsx` deu `21 passed (21)`, e `git diff --check` saiu limpo. O `visual:compare -- --target C5,NT1`, rodado pelo Tech Lead nas rodadas 1 e 3, deu exit 0 e os mesmos números do "Fim". O Tech Lead abriu os oito `side-by-side.png` de C5 e NT1. Os controles 1 a 5 foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Gates do IA Loop na rodada 3,** sobre a árvore aceita, todos com exit 0: typecheck, lint, `goal096-conversas-e-notificacoes` 21/21, `validate:core`, `test:gate` (`tests 233, pass 233`), `validate:ui` (**169 passed**, 0 retentativas), `validate:integration` (gate autenticado **255 passed**, 0 retentativas) e `git diff --check`. A suíte do frontend, no FIX-001 da rodada 3, deu **143** arquivos e **1649** testes.
- **Aceito sem prova completa.** O NT1 com notificação de atenção ou crítica e a regra do C5 para quem desconectou com histórico, só em jsdom; o NT1 de paisagem e desktop comparado à vista, porque o diff mede a Home atrás da gaveta. Detalhe no [review096](reviews/096-review.md).

## Configurações iguais ao protótipo (M1, N1, AG1 e AG3), do Goal097

[D-116](DECISIONS.md), **PROPOSED**. Seção escrita na WU-12 da rodada 1 e **reescrita na rodada 3 (FIX-001) sobre a árvore final**, a das rodadas 1 e 2: a rodada 2 editou `ProductSettingsScreen.tsx`, `avenly-settings.css` e `tests/goal097-configuracoes.test.tsx` depois dos controles, e por isso o `visual:compare` do fim, os seis controles do §7, o vermelho da baseline e as contagens foram rodados de novo na rodada 3, depois dessa última edição. Nenhuma configuração de gate foi alterada. Os números do "Fim", os controles do §7, a contagem de testes e as execuções abaixo são os da árvore final, com os hashes (sha256) de `SettingsHub.tsx` `61daff927e878aacbea6d3a600d626a93df2e12fc6abeb870de3e2e58273e058`, `OfferRulesSettings.tsx` `b22f5519e782919c9fc58dbaa3565fd4b8c595e551f722667ec575c74d484bee`, `offerPreview.ts` `4a770ec1010371ceb9e98b71a5ce478e80fc3922a6e649d67f6cd80c03e30d0e`, `agendaSummaries.ts` `76b7d1bb2ea76777615413fc24668e6afe82749538a4fcb7dad1e4b28a9060a7`, `ProductSettingsScreen.tsx` `b4a44cc6960f65601f4da6c197576bae1d4f3ad5922213f61345de70c4efd80f`, `e2e/routes.ts` `4df19cee2fe8a3988694f0245bf21d1eef5dbfefb9360c1d44869298a33e2adb`, `e2e/visual/targets.json` `26c0b2e2b8a28271150a743307cf7a92ac3fac9e4250392cb5df569296d3fd63` e `shared/styles/avenly-settings.css` `68b6dc60f2374bc80cb0cd42c7f44d5efc79061f9ab4963b1ec02d1bf653f61e` e `tests/goal097-configuracoes.test.tsx` `9861642e76869820560bf85116a91a0f3dadf584004b1171a2b7829bb1a533fb`. A baseline é `4735b21f026454dd8bf1d3a1e589c9c738cf8f09`; o `HEAD` (`70efd42`) difere dela só em documentos.

### `visual:compare` do início e do fim

Comando do fim, rodado na rodada 3 (FIX-001) sobre a árvore final, em 2026-10-03, depois da última edição (a da rodada 2, em `avenly-settings.css`): `npm run visual:compare -- --target M1,N1,AG1,AG3,H3,CL1,Servicos:S1,C5`, código 0. A tabela substitui a da WU-12, rodada antes dessa edição. O início é o da WU-01 desta rodada, rodado na baseline.

| Quadro | Início | Fim |
| --- | --- | --- |
| M1 | 7,6 / 3,1 / 5,9 / 5,1 | 8,5 / 3,8 / 5,9 / 5,1 |
| N1 | 8,2 / 3,8 / 5,9 / 5,1 | 8,2 / 3,8 / 5,9 / 5,2 |
| AG1 | 13,4 / 5,9 / 7,1 / 5,9 | 8,3 / 3,7 / 6,1 / 5,1 |
| AG3 | 19,7 / 10,8 / 11,5 / 9,7 | 15,2 / 6,4 / 7,5 / 6,7 |
| H3 | 8,1 / 4,1 / 3,7 / 3,0 | 8,1 / 4,1 / 3,7 / 3,0 |
| CL1 | 8,8 / 3,6 / 3,0 / 2,8 | 8,8 / 3,6 / 3,0 / 2,8 |
| Servicos:S1 | 7,7 / 3,6 / 3,7 / 2,7 | 7,7 / 3,6 / 3,7 / 2,7 |
| C5 | 2,6 / 0,6 / 0,5 / 0,8 | 2,6 / 0,6 / 0,5 / 0,8 |

Ordem das colunas: mobile / tablet em retrato / tablet em paisagem / desktop. Os números são os do relatório de cada execução, não foram recalculados. O diff é uma tendência; o julgamento é visual. O AG1 e o AG3 melhoraram nos quatro devices. O N1 ficou igual no mobile, no tablet em retrato e no tablet em paisagem, e 0,1 pior no desktop. **O M1 piorou de leve** no mobile (7,6 para 8,5) e no tablet em retrato (3,1 para 3,8) e ficou igual nos dois maiores. A causa, vista nos `side-by-side.png`, é o banner da casca "Atendimento automático parado", que empurra a página, mais o hub novo ter muito mais texto e ícone no mesmo lugar; a estrutura, as medidas e os textos batem com o quadro. A causa não foi medida em pixels. H3, CL1, Servicos:S1 e C5 têm diff idêntico ao do início nos quatro devices; o C5 do início é o do fim do Goal096.

### Os trinta e dois `side-by-side.png`

Todas as capturas do app refletem o estado do ambiente do `visual:compare` (orquestrador da IA desligado e WhatsApp desconectado): o banner "Atendimento automático parado" da casca nas telas que não o cobrem, e, no desktop, o item "Notificações" e o cartão "WhatsApp desconectado" com "Reconectar" na sidebar. Os quadros trazem a barra de status do iPhone (divergência 1 de D-116).

- **M1, quatro devices.** O app tem o bloco de identidade e os três grupos "Atendimento", "Seu negócio" e "Dados e conta", com as linhas, ícones, setas e medidas do quadro. Sobra o título "Configurações" no lugar de "Mais" no mobile e no tablet em retrato (divergência 2) e o estado da conta visual na segunda linha: "5 ativos" em Serviços, "Desligada" em IA, "Desconectado" em WhatsApp, o e-mail `visual-prototipo-v2@example.invalid` em Conta e, em tablet e desktop, "Importar do Minha Agenda" em Importação (divergência 3). Do desktop em diante a linha Serviços não aparece, porque a sidebar já a oferece.
- **N1, quatro devices.** Estrutura do quadro; no app o campo sem dado mostra "Não informado" onde o quadro tem dado, e não há "Adicionar" nem valor nas linhas do conhecimento (divergência 6). Sem mudança estrutural em relação ao início.
- **AG1, quatro devices.** As linhas do quadro: "Dias e horários", "Antecedência e intervalos", "Cancelamento e remarcação", "Lembretes", "Dias visíveis" e "Visualização inicial", com a nota do fim. Sem "Bloqueios que se repetem" (divergência 4). A segunda linha traz o dado da conta: "Sem antecedência mínima · máx. 90 dias", "Todos os dias", "Automática" e Lembretes sem "pede confirmação".
- **AG3, quatro devices.** Tela "Antecedência e intervalos" com os três grupos segmentados, o bloco "Na prática" e a política em lista, como o quadro. Como a conta tem antecedência 0, o grupo mostra a opção extra "Sem antecedência mínima" selecionada e o bloco "Na prática" mostra as pílulas 14:00, 14:30 e 15:00 com a legenda "Só a partir de 13:45", e não as do quadro. No mobile, com 812 px de altura, a barra "Salvar" fixa cobre parte do grupo "Cancelar ou remarcar pelo WhatsApp" (medido, não declarado pelo Goal).
- **H3, CL1, Servicos:S1 e C5, quatro devices.** Sem mudança em relação ao início. Em Servicos:S1 o quadro tem "6 ativos · 1 precisa de revisão · 1 inativo", a linha "Corrigir" e nenhuma busca, e o app tem "5 ativos · 1 inativo", o campo "Buscar serviço" e outra ordem (Coloração primeiro); isso já era assim no início. No C5 a estrutura é a do quadro (título, ícone, texto e "Conectar WhatsApp"); no desktop a sidebar mostra "WhatsApp desconectado" onde o quadro mostra "IA inativa", e no mobile o título fica cerca de 16 px abaixo do do quadro, com a barra de abas mais baixa. No tablet em retrato aparece a linha verde-azulada de 2 px no pé do conteúdo, que vem da casca (observação 2 do [review095](reviews/095-review.md)).

### Mudanças do §6 no gate autenticado

`git diff` contra a baseline: em `apps/frontend/e2e/routes.ts`, 12 linhas inseridas e nenhuma removida, as duas entradas depois de `/configuracoes/agenda`: `configuracoes-agenda-regras` (`contentMarker` "Antecedência e intervalos") e `configuracoes-agenda-lembretes` (`contentMarker` "Lembretes"), as duas com `sessionMarker` "configuracoes". Em `apps/frontend/e2e/visual/targets.json`, só a entrada do AG3 (3 linhas inseridas e 2 removidas): `route` `/configuracoes/agenda/regras`, `clock` "13:45" e a nota sem "o app não tem tela própria". `e2e/authenticated-matrix.spec.ts` não mudou (`8629db32…`). O gate autenticado passa de 255 para **265** testes, os dez das duas rotas novas.

### Controles negativos (§7)

Rodados **na rodada 3 (FIX-001), sobre a árvore final, depois da última edição de código e de teste** (a da rodada 2), em `apps/frontend`, com `npx vitest run tests/goal097-configuracoes.test.tsx` (**44 testes** no arquivo). Os da WU-12 eram de uma versão de `ProductSettingsScreen.tsx` e do teste anteriores e foram substituídos. Cada defeito foi injetado por edição real num dos cinco arquivos de produção citados no início da seção (por um script que troca o texto, roda o arquivo de teste e restaura os bytes originais no mesmo passo), e o sha256 conferido depois de cada controle é igual ao de antes (os seis, `sha igual: true`; os hashes são os do início da seção). Sem nenhum defeito, a execução do arquivo deu `Tests 44 passed (44)` antes do primeiro controle e depois do último, e `git status --porcelain=v1 -uall` ficou igual ao de antes (32 linhas).

| Controle | Defeito injetado | Com o defeito | Sem o defeito |
| --- | --- | --- | --- |
| 1 | `SettingsHub.tsx`: linha `{ detail: null, href: "/configuracoes/disponibilidade", icon: "nav-calendar", title: "Disponibilidade" }` no grupo Atendimento | `3 failed \| 41 passed (44)`: "três grupos, com título, na ordem do protótipo, e cada linha com o seu href", "não existe linha Disponibilidade" (`Error: expect(element).not.toBeInTheDocument()`) e "o hub abre com todas as leituras secundárias falhando" (`expected [ …(9) ] to have a length of 8 but got 9`) (prova 1) | 44/44 |
| 2 | `SettingsHub.tsx`: `detail: services?.text ?? "0 ativos"` no lugar de `?? null` | `2 failed \| 42 passed (44)`: "com cada leitura falhando, a linha fica sem segunda linha e sem valor inventado" e "leituras ainda pendentes deixam as linhas sem segunda linha" (`expected <span class="hub-row-detail"></span> to be null`) (prova 1) | 44/44 |
| 3 | `OfferRulesSettings.tsx`: `rules` do pedido vazias no lugar das `rules` lidas | `1 failed \| 43 passed (44)`: "um único Salvar envia um só PATCH com os quatro campos, o timezone lido e as rules lidas" (`expected "vi.fn()" to be called with arguments`) (prova 3) | 44/44 |
| 4 | `offerPreview.ts`: `const limit = nowLocal;` (ignora a antecedência) | `5 failed \| 39 passed (44)`: "13:45, 2 h de antecedência e passo de 30 min", "antecedência de 1 dia move o bloco para o dia seguinte" (`expected 'Só a partir de 13:45, em passos de 30…' to be 'Só a partir de amanhã às 13:45…'`), "o intervalo muda os passos e o fuso muda o relógio", "mostra o exemplo com horários riscados, opções oferecidas e a legenda" (`expected [] to deeply equal [ '14:00', '15:30' ]`) e "trocar a antecedência e o intervalo na tela muda o bloco sem salvar" (`expected [ '13:45', '14:00', '14:15' ] to deeply equal [ '15:45', '16:00', '16:15' ]`) (prova 3) | 44/44 |
| 5 | `agendaSummaries.ts`: `if (false && last && last.key === key && adjacent)` (sem agrupar dias seguidos) | `5 failed \| 39 passed (44)`: "as linhas têm href e resumo lidos do dado salvo", "agrupa dias seguidos com os mesmos horários" (`expected 'Seg 09:00–18:00 · Ter 09:00–18:00 · Q…' to be 'Seg–Sex 09:00–18:00 · Sáb 09:00–14:00'`), "junta dois intervalos no mesmo dia, em ordem de início", "o domingo vem depois do sábado e junta com ele" (`expected 'Sáb 10:00–14:00 · Dom 10:00–14:00' to be 'Sáb–Dom 10:00–14:00'`) e "dias visíveis e visualização inicial" (`expected 'Seg, Ter, Qua, Qui, Sex, Sáb · doming…' to be 'Seg–Sáb · domingo oculto'`) (prova 2) | 44/44 |
| 6 | `ProductSettingsScreen.tsx`: segunda chamada de `useShellConfig` (`active: "configuracoes"`, `module: "settings"`, `pushed: true`, `title: "Configurações"`) no cenário `calendar-rules` | `11 failed \| 33 passed (44)`: sete testes de tela do AG3 (prova 3: os três grupos, a opção extra, a política 0, o `PATCH` único, a falha sem perder a edição e os dois de "Na prática" na tela) e quatro da prova 5 (os dois "uma chamada de useShellConfig por árvore nas quatro rotas", de 1024 px em diante e abaixo, e os dois de `/regras` nas duas faixas), com `Error: Maximum update depth exceeded` | 44/44 |

O controle 6 derruba mais que a prova 5 porque duas chamadas de `useShellConfig` na mesma árvore se disputam num laço de renderização (`Maximum update depth exceeded`); a causa foi medida no teste "um único Salvar envia um só PATCH…" rodado com o defeito, e o arquivo foi restaurado por hash depois.

O vermelho da baseline dos 44 testes, medido na rodada 3 (FIX-001), depois da última edição, trocando os dez arquivos de produção modificados pelos de `HEAD` (`git show HEAD:<caminho>`), removendo os cinco arquivos novos (`OfferRulesSettings.tsx`, `agendaSummaries.ts`, `offerPreview.ts` e as duas `page.tsx`) e restaurando tudo de uma cópia com os hashes dos quinze conferidos iguais: `exit 1`, `Tests 42 failed | 2 passed (44)`. Os dois que passam são da prova 5 e guardam comportamento que a baseline já cumpre: "/configuracoes/agenda, de 1024 px em diante, mostra a lista com Agenda marcada" e "/configuracoes/agenda, abaixo de 1024 px, é tela empurrada sem lista". O `git status --porcelain=v1 -uall` ficou igual ao de antes (32 entradas).

### Execuções que sustentam as contagens

Todas de 2026-10-03. As linhas "rodada 2", "rodada 3" e "rodada 4" são as das WU-05 a WU-11 do loop (`tools/ia-loop/.state/results/work_unit/097-rN-unit-wu-NN.json`), rodadas **depois** da edição da rodada 2 em `ProductSettingsScreen.tsx`, `avenly-settings.css` e no teste (a do `fix-001` da rodada 2, publicada às 12:53Z, antes das WU-05 a WU-11 da mesma rodada), e portanto sobre a árvore final. As execuções da rodada 1 são anteriores a essa edição e **não** sustentam nenhuma contagem final. O `validate:integration` foi rerodado nas rodadas 2, 3 e 4 (WU-11), as três com código 0.

| Execução | Resultado |
| --- | --- |
| `tsc --noEmit`, rodadas 2, 3 e 4, WU-05 | código 0 nas três (1,6 s, 1,7 s e 1,6 s) |
| `npm run lint`, rodadas 2, 3 e 4, WU-06 | código 0 nas três (13,9 s, 14,1 s e 14,2 s) |
| `npx vitest run goal097-configuracoes`, rodadas 2, 3 e 4, WU-07 | código 0 nas três (4,7 s); `Tests 44 passed (44)` |
| `validate:core`, rodadas 2, 3 e 4, WU-08 | código 0 nas três (88,7 s, 87,4 s e 91,7 s); 17 passos, **15 passaram** e 2 foram pulados (`test:bff` e `test:health-worker`, por desenho do gate) |
| `test:gate`, rodadas 2, 3 e 4, WU-09 | código 0 nas três; `tests 233, pass 233, fail 0` |
| `validate:ui`, rodadas 2, 3 e 4, WU-10 | código 0 nas três (45,5 s, 45,6 s e 45,7 s); **169 passed** e 21 skipped na saída do Playwright; "public UI gate retries: 0" |
| `validate:integration`, rodadas 2, 3 e 4, WU-11 | código 0 nas três (642,8 s, 641,3 s e 639,4 s, publicadas às 13:07Z, 13:37Z e 13:55Z); gate autenticado **265 passed (8,8 min)**; "authenticated gate retries: 0" |
| Suíte do frontend, rodada 3 (`npx vitest run` em `apps/frontend`, depois da última edição; a rodada 3 não editou código nem teste, e os controles restauraram os arquivos por hash) | código 0; **144 arquivos e 1693 testes passaram** (`Test Files 144 passed (144)`, `Tests 1693 passed (1693)`, 35,1 s); a baseline tinha 143 arquivos e 1649 testes (Goal096), e a diferença são os 44 testes de `goal097-configuracoes.test.tsx` |
| `npx vitest run tests/goal097-configuracoes.test.tsx`, rodada 3, antes do primeiro e depois do último controle | código 0; `Tests 44 passed (44)` |
| `tsc --noEmit` e `npm run lint` em `apps/frontend`, rodada 3 | código 0 nos dois (lint com `--max-warnings=0`) |
| `validate:core`, rodada 3 | código 0 em 88 s; 17 passos, **15 passaram**, 0 falharam e 2 foram pulados (`test:bff` e `test:health-worker`, por desenho do gate) |
| `test:gate`, rodada 3 | código 0; `tests 233, pass 233, fail 0` |
| `validate:ui`, rodada 3 | código 0; **169 passed** e 21 skipped; "public UI gate retries: 0" |
| `visual:compare` dos oito alvos, rodada 3 | código 0; a tabela do "Fim" acima |

O critério do Goal de **265** testes do gate autenticado e 0 retentativas é sustentado pela WU-11 (`validate:integration`) das rodadas 2, 3 e 4, que rodou sobre a árvore final, depois da edição da rodada 2 (`avenly-settings.css`, `ProductSettingsScreen.tsx`): as três terminaram com código 0, **265 passed (8,8 min)** e "authenticated gate retries: 0". `validate:core`, `test:gate` e `validate:ui` foram repetidos na árvore final nas mesmas rodadas. A contagem de testes do `test:frontend` dentro do `validate:core` não consta do registro do loop (a saída vem truncada); por isso a contagem do frontend citada é a da execução própria da rodada 3.

### Estado da árvore

`git status --porcelain=v1 -uall` ao fim da rodada 3: os arquivos de produção, de testes e de `e2e/` listados em D-116, mais os três documentos desta WU (`docs/migration/DECISIONS.md`, `docs/migration/CURRENT_STATE.md` e `docs/migration/VALIDATION_GATE.md`). Sem `apps/frontend/AGENTS.md` modificado e sem artefato de `e2e-results/` rastreado (a pasta é ignorada pelo git). Nenhum commit, push, merge nem PR.

### Não feito

- Conferência humana num aparelho real.
- O M1 com a IA ativa e o WhatsApp conectado, e a linha de Serviços com revisão em âmbar, em captura: a conta visual não tem esse estado, e ficam provados só em jsdom.
- A linha Importação depois de uma importação concluída, provada só em jsdom.
- Provar que a IA, numa conversa real, oferece horários como o bloco "Na prática" mostra.
- Medir em pixels a causa da piora do M1, e conferir num aparelho real se a barra "Salvar" do AG3 deixa o último grupo alcançável.
- "Bloqueios que se repetem", "Adicionar" no N1 e o AG2 (fora do Goal).
- Decisão do Tech Lead sobre [D-116](DECISIONS.md), que segue PROPOSED.

**Nota de fechamento — review097, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-116 ACCEPTED na rodada 5, sem blocker. Os dois blockers de produção da rodada 1 (o bloco de identidade do M1 sem reticências e `/configuracoes/disponibilidade` sem `aria-current` no hub) foram corrigidos na rodada 2. Os blockers das rodadas 2 a 4 foram de evidência e documento, e foram fechados nas rodadas 3 a 5. O item "Decisão do Tech Lead sobre D-116" de "Não feito" está resolvido.
- **Conferência do Tech Lead na rodada 5.** Os hashes de produção e do teste do início desta seção batem com os da árvore aceita e não mudam desde a rodada 2. `git status --porcelain=v1 -uall` tem 32 linhas, só de arquivos autorizados, sem `apps/frontend/AGENTS.md` alterado, resto de controle negativo nem `e2e-results/` rastreado. O `visual:compare -- --target M1,N1,AG1,AG3`, rodado pelo Tech Lead nas rodadas 1, 2, 3 e 5, deu exit 0; nas rodadas 3 e 5 deu os mesmos números do "Fim". O Tech Lead abriu os dezesseis `side-by-side.png` em cada uma dessas rodadas. Conferiu também `265 passed (8.8m)` e "authenticated gate retries: 0" nos JSONs `097-r{2,3,4}-unit-wu-11.json`. Os controles do §7 e o vermelho da baseline foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Gates do IA Loop na rodada 5,** sobre a árvore aceita, todos com exit 0: typecheck, lint, `goal097-configuracoes` 44/44, `validate:core`, `test:gate` (`tests 233, pass 233`), `validate:ui` (**169 passed**, 0 retentativas), `validate:integration` (gate autenticado **265 passed**, 0 retentativas) e `git diff --check`.
- **Aceito sem prova completa.** O M1 com a IA ativa e o WhatsApp conectado, a revisão em âmbar e a Importação concluída, só em jsdom; a piora leve do M1, aceita pela vista e sem causa medida em pixels; o "Na prática" sem prova numa conversa real. Detalhe no [review097](reviews/097-review.md).

## IA, Conversas e Conta iguais ao protótipo (IA1, R1 e C1), do Goal104

[D-117](DECISIONS.md), **PROPOSED**. Seção escrita na WU-11 da rodada 1, depois de todas as edições de código e de teste (a última, em `e2e/routes.ts` e nos testes, às 12:00:40 no horário local, 15:00:40Z; a WU-03 foi publicada às 15:02:52Z). Nenhuma configuração de gate foi alterada. Os hashes sha256 da árvore final, conferidos iguais antes e depois dos controles: `AiSettings.tsx` `e53f90c5…`, `BusinessSettings.tsx` `ca2b66ba…`, `RetentionSection.tsx` `1480985c…`, `AccountSettings.tsx` `9e978f44…`, `BusinessKnowledgeSettings.tsx` `65b8e891…`, `ProductSettingsScreen.tsx` `55aaba75…`, `avenly-settings.css` `a07b21c9…`, `perguntas-frequentes/page.tsx` `6c3e855f…`, o teste `goal104-ia-conversas-e-conta.test.tsx` `295f8cfa…` e `e2e/routes.ts` `5f68d49e…`. `e2e/authenticated-matrix.spec.ts` (`8629db32…`) e `e2e/visual/targets.json` (`26c0b2e2…`) não mudaram. Os controles restauraram os arquivos de produção por cópia e hash, e por isso as datas de modificação deles são as da restauração; o conteúdo é o mesmo.

### `visual:compare` do início e do fim

Comando do fim, rodado na WU-11 sobre a árvore final, em 2026-10-03, antes de qualquer controle: `npm run visual:compare -- --target IA1,R1,Mais-WhatsApp:C1,M1,N1,AG1,AG3,H3,CL1,Servicos:S1,C5`, código 0. O início é o da WU-01 desta rodada, rodado na baseline.

| Quadro | Início | Fim |
| --- | --- | --- |
| IA1 | 13,6 / 6,3 / 7,2 / 6,0 | 12,7 / 6,0 / 7,8 / 6,6 |
| R1 | 13,5 / 8,1 / 9,5 / 8,3 | 17,2 / 9,4 / 10,2 / 9,1 |
| Mais-WhatsApp:C1 | 10,6 / 4,4 / 5,7 / 4,9 | 5,1 / 2,4 / 4,9 / 4,2 |
| M1 | 8,5 / 3,8 / 5,9 / 5,1 | 8,5 / 3,8 / 5,9 / 5,1 |
| N1 | 8,2 / 3,8 / 5,9 / 5,2 | 8,2 / 3,8 / 5,9 / 5,2 |
| AG1 | 8,3 / 3,7 / 6,1 / 5,1 | 8,3 / 3,7 / 6,1 / 5,1 |
| AG3 | 15,2 / 6,4 / 7,5 / 6,7 | 15,2 / 6,4 / 7,5 / 6,7 |
| H3 | 8,1 / 4,1 / 3,7 / 3,0 | 8,1 / 4,1 / 3,7 / 3,0 |
| CL1 | 8,8 / 3,6 / 3,0 / 2,8 | 8,8 / 3,6 / 3,0 / 2,8 |
| Servicos:S1 | 7,7 / 3,6 / 3,7 / 2,7 | 7,7 / 3,6 / 3,7 / 2,7 |
| C5 | 2,6 / 0,6 / 0,5 / 0,8 | 2,6 / 0,6 / 0,5 / 0,8 |

Ordem das colunas: mobile / tablet em retrato / tablet em paisagem / desktop. Os números são os do relatório de cada execução, não foram recalculados; o início do M1, N1, AG1, AG3, H3, CL1, Servicos:S1 e C5 é o fim do Goal097, e a execução final mostra que não mudaram. O diff é uma tendência; o julgamento é visual. A IA1 melhorou no mobile e no tablet em retrato e **piorou** no tablet em paisagem e no desktop. O **R1 piorou nos quatro devices.** O C1 melhorou nos quatro. Os números da IA1 e do R1 **não chegaram a zero**: a igualdade com o quadro é critério do revisor.

### Os quarenta e quatro `side-by-side.png`

Todas as capturas do app refletem o estado do ambiente do `visual:compare` (orquestrador da IA desligado e WhatsApp desconectado): o banner "Atendimento automático parado" da casca e, no desktop, o item "Notificações" e o cartão "WhatsApp desconectado" na sidebar. Os quadros trazem a barra de status do iPhone. Abri os de IA1, R1, C1 e N1 nos quatro devices, o M1 no mobile e no desktop, e o mobile de AG1, AG3, H3, CL1, Servicos:S1 e C5; **não abri um a um** os de tablet e desktop desses seis alvos nem os tablets do M1, mas os números deles são idênticos aos do início nos quatro devices.

- **IA1, quatro devices.** A estrutura é a do quadro: cartão de estado, "Jeito de falar" com três opções e exemplos, "Equilibrada" selecionada, o aviso com interruptor, o contrato em duas colunas e as duas linhas de link. Diferenças: o banner da casca; "IA desligada" e "Conectar WhatsApp" onde o quadro tem "IA ativa" e "Pausar"; sem "2 contatos"; o texto de apoio do aviso, sem gênero; a barra de status do iPhone; os dados da lista da esquerda e a sidebar do desktop; a linha de 2 px no tablet em retrato.
- **R1, quatro devices.** Título, os dois grupos segmentados (90 e 30 dias marcados), "O que não é afetado" e "Salvar", como o quadro. Diferenças: a nota de U-01, que o quadro não tem; o "Salvar" desabilitado em tom mais claro; o banner "Atendimento automático parado", que empurra o conteúdo; no mobile, a barra "Salvar" fixa cobrindo o conteúdo de baixo. É o que vejo como causa da piora, e **não medi em pixels**.
- **Mais-WhatsApp:C1 (Conta), quatro devices.** Os grupos "Seus dados", "Segurança" e "Sobre" e "Excluir conta" com "Você tem 7 dias para desistir", como o quadro. O app não tem as segundas linhas ("Alterada há 2 meses", "Conectada em 2 aparelhos…") nem a versão no rodapé; o e-mail é `visual-prototipo-v2@example.invalid`; o banner da casca aparece. No tablet em paisagem e no desktop, "Excluir conta" fica abaixo da dobra, atrás do banner.
- **N1, quatro devices.** Só as duas linhas do conhecimento mudaram: agora são links com seta e mostram "Não informado", porque a conta visual não tem perguntas frequentes nem outras informações (o quadro mostra "4 perguntas" e "Produtos veganos…"). O número não mudou.
- **M1, mobile e desktop.** Sem mudança em relação ao início.
- **AG1, AG3, H3, CL1, Servicos:S1 e C5, mobile.** Sem mudança em relação ao início: AG1 sem "Bloqueios que se repetem"; AG3 com a opção extra "Sem antecedência mínima", as pílulas 14:00, 14:30 e 15:00 e a barra "Salvar" fixa cobrindo parte do último grupo; H3 com o cartão de onboarding; CL1 com 8 clientes; Servicos:S1 com o campo de busca e 5 ativos; C5 com a estrutura do quadro.

### Mudanças do §6 no gate autenticado

`git diff` contra a baseline: em `apps/frontend/e2e/routes.ts`, 13 linhas inseridas e 1 removida. O `contentMarker` de `/configuracoes/ia` passa de "Atendente virtual" para "IA"; entra `configuracoes-negocio-perguntas-frequentes` (marcador "Perguntas frequentes") depois de `/configuracoes`, e entra `configuracoes-conversas` (marcador "Conversas") depois de `/configuracoes/whatsapp`. `e2e/authenticated-matrix.spec.ts` e `e2e/visual/targets.json` não mudaram. O gate passa de 265 para **275** testes na WU-10 (`validate:integration`); o 10 de diferença é a conta de 265 mais 10, e a divisão por rota não aparece nos títulos da saída.

### Controles negativos (§7)

Rodados **na WU-11, sobre a árvore final, depois da última edição de código e de teste**, em `apps/frontend`, com `npx vitest run tests/goal104-ia-conversas-e-conta.test.tsx` (**65 testes** no arquivo; 65/65 antes do primeiro controle e depois do último). Cada defeito foi injetado por edição real, por um script que troca o texto, roda o arquivo de teste e restaura os bytes originais no mesmo passo, com o sha256 conferido igual depois de cada controle e `git status --porcelain=v1 -uall` igual ao de antes (27 linhas).

| Controle | Defeito injetado | Com o defeito | Sem o defeito |
| --- | --- | --- | --- |
| 1 | `AiSettings.tsx`: importa `KnowledgeSection` e a renderiza depois de `<AppointmentNoticeRow />` | `1 failed \| 64 passed (65)`: "nenhum texto de KnowledgeSection nem de OtherInfoSection aparece na tela" (`AssertionError: expected <h2></h2> to be null`) (prova 1) | 65/65 |
| 2 | `AiSettings.tsx`: no `.catch` de `AppointmentNoticeRow`, `setEnabled(false)` no lugar de `setError(true)` | `1 failed \| 64 passed (65)`: "enquanto a preferência carrega há esqueleto, e com a leitura falhando a linha não aparece" (`expected <span class="ai-notice-title"></span> to be null`) (prova 1) | 65/65 |
| 3 | `BusinessSettings.tsx`: o primeiro `.catch` de `useKnowledgeSummary` põe `faq: null` | `2 failed \| 63 passed (65)`: "com cada leitura falhando, a linha fica sem a segunda linha e nunca com 'Não informado'" e "uma leitura falhando não esconde o resumo da outra" (`expected <span class="business-row-text"></span> to be null`) (prova 2) | 65/65 |
| 4 | `RetentionSection.tsx`: `if (reductions.length > 99)` em `save()`, de modo que a confirmação nunca abre | `4 failed \| 61 passed (65)`: "reduzir abre a confirmação; cancelar não envia nada e mantém a escolha na tela", "confirmar a redução envia um único pedido com confirmReduction true", "reduzir os dois prazos abre uma confirmação que diz que são os dois" e "reduzir só o prazo Pessoal diz qual prazo diminui" (prova 3) | 65/65 |
| 5 | `AccountSettings.tsx`: `auth.logout()` no lugar de `auth.logoutAllDevices()` | `2 failed \| 63 passed (65)`: "'Sair' de Segurança só abre a confirmação; confirmar chama só logoutAllDevices e volta ao login" (`expected "vi.fn()" to be called 1 times, but got 0 times`) e "a falha de logoutAllDevices mostra o erro em role=alert e não sai da tela" (prova 4) | 65/65 |
| 6 | `BusinessKnowledgeSettings.tsx`: segunda chamada de `useShellConfig` (`active: "configuracoes"`, `module: "settings"`, `pushed: true`, `title: "Configurações"`), num componente que não é o de `ProductSettingsScreen` | `5 failed \| 60 passed (65)`: "a rota nova mostra as duas seções como tela empurrada, com voltar para Negócio" (prova 2), os dois "uma chamada de useShellConfig por árvore nas quatro rotas" (`/configuracoes/negocio/perguntas-frequentes: expected 2 to be 1`, de 1024 px em diante e abaixo) e os dois testes da rota nova (`expected null not to be null`) (prova 5) | 65/65 |

A segunda chamada do controle 6 foi posta em outro componente porque o mock de `useShellConfig` do teste guarda o `useId()` de cada chamada, e duas chamadas no mesmo componente dão o mesmo `useId()`.

O vermelho da baseline dos 65 testes, medido na WU-11 depois da última edição, trocando os nove arquivos de produção modificados (`OtherInfoSection.tsx`, `AccountSettings.tsx`, `AiSettings.tsx`, `BusinessSettings.tsx`, `ConversationsSettings.tsx`, `ProductSettingsScreen.tsx`, `RetentionSection.tsx`, `types.ts` e `avenly-settings.css`) pelos de `HEAD` (`git show HEAD:<caminho>`), removendo os dois novos (`BusinessKnowledgeSettings.tsx` e a `page.tsx`) e restaurando tudo de uma cópia com os onze hashes conferidos iguais: `Tests 49 failed | 16 passed (65)`. Reprovam 16 testes da prova 1, 8 da prova 2, 10 da prova 3, 14 da prova 4 e 1 da prova 5. Os 16 que passam guardam comportamento que a baseline já cumpre (7 nas provas 1 a 4 e 9 na prova 5, de composição que já existia; só o teste da rota nova abaixo de 1024 px, na prova 5, reprova). O vermelho foi refeito na rodada 2 sobre a árvore atual (mesmo procedimento, `vitest run --reporter=json`, restauração conferida por sha256 dos onze arquivos): `Tests 49 failed | 16 passed (65)`, e os mesmos 16 passam. Os 16, um a um, com o motivo de a baseline já cumpri-los:

1. Prova 1, "sem a IA ligada e sem WhatsApp: leva a 'Conectar WhatsApp', sem 'Teste real'": a tela de hoje já tem o link "Conectar WhatsApp" e não tem "Teste real".
2. Prova 1, "com a leitura do teste falhando: 'Tentar novamente' e o aria-busy do cartão": a tela de hoje já tem a ação e o `aria-busy`.
3. Prova 2, "resumo de Perguntas frequentes: zero vira 'Não informado'": o resumo do N1 já existia com esse texto.
4. Prova 2, "resumo de Outras informações: texto vazio vira 'Não informado'": idem.
5. Prova 3, "a leitura falhada mostra a indisponibilidade, sem inventar prazos": o R1 de hoje já tem esse estado.
6. Prova 4, "exclusão agendada: mostra o prazo e 'Cancelar exclusão', que chama o cancelamento": o estado da exclusão agendada já existe na Conta.
7. Prova 4, "conta já excluída: 'Conta excluída'": idem.
8. Prova 5, "uma chamada de useShellConfig por árvore nas quatro rotas, na faixa ≥1024": composição da casca que já existia.
9. Prova 5, "uma chamada de useShellConfig por árvore nas quatro rotas, na faixa <1024": idem.
10. Prova 5, "'/configuracoes/ia', de 1024 px em diante, mostra a lista do hub com a linha certa marcada": idem.
11. Prova 5, "'/configuracoes/conversas', de 1024 px em diante, mostra a lista do hub com a linha certa marcada": idem.
12. Prova 5, "'/configuracoes/conta', de 1024 px em diante, mostra a lista do hub com a linha certa marcada": idem.
13. Prova 5, "'/configuracoes/negocio/perguntas-freq…', de 1024 px em diante, mostra a lista do hub com a linha certa marcada": idem.
14. Prova 5, "'/configuracoes/ia', abaixo de 1024 px, é tela empurrada sem a lista e sem barra de abas": idem.
15. Prova 5, "'/configuracoes/conversas', abaixo de 1024 px, é tela empurrada sem a lista e sem barra de abas": idem.
16. Prova 5, "'/configuracoes/conta', abaixo de 1024 px, é tela empurrada sem a lista e sem barra de abas": idem.

Reprovam os outros 49, entre eles o teste da rota nova abaixo de 1024 px (`/configuracoes/negocio/perguntas-freq…`, "abaixo de 1024 px, é tela empurrada…").

### Execuções que sustentam as contagens

Todas de 2026-10-03. As linhas WU-04 a WU-10 são do loop (`tools/ia-loop/.state/results/work_unit/104-r1-unit-wu-NN.json`), publicadas depois da WU-03, a última a editar código e teste, e portanto sobre a árvore final.

| Execução | Resultado |
| --- | --- |
| `tsc --noEmit`, WU-04 | código 0 (1,6 s) |
| `npm run lint`, WU-05 | código 0 (14,1 s, `--max-warnings=0`) |
| `npx vitest run goal104-ia-conversas-e-conta`, WU-06 | código 0 (9,9 s); `Tests 65 passed (65)` |
| `validate:core`, WU-07 | código 0 (100,0 s); 17 passos, **15 passaram**, 0 falharam e 2 foram pulados (`test:bff` e `test:health-worker`, por desenho do gate) |
| `test:gate`, WU-08 | código 0; `tests 233, pass 233, fail 0` |
| `validate:ui`, WU-09 | código 0 (45,3 s); **169 passed** e 21 skipped; "public UI gate retries: 0" |
| `validate:integration`, WU-10 | código 0 (694,2 s, publicada às 15:17:54Z); 36 passos passaram, 0 falharam, 0 pulados; gate autenticado **275 passed (9,7 min)**; "authenticated gate retries: 0"; `e2e-results/authenticated/results.json`: `expected 275, skipped 0, unexpected 0, flaky 0` |
| Suíte do frontend, WU-11 (`npx vitest run` em `apps/frontend`, depois da última edição; a WU-11 não editou código nem teste e os controles restauraram os arquivos por hash) | código 0; **145 arquivos e 1759 testes passaram** (`Test Files 145 passed (145)`, `Tests 1759 passed (1759)`, 36,5 s); a baseline tinha 144 arquivos e 1693 testes (Goal097), e a diferença são os 65 testes do arquivo novo mais 1 em `goal024-settings-shell-invariant` (10 para 11) |
| `npx vitest run tests/goal104-ia-conversas-e-conta.test.tsx`, WU-11, antes do primeiro e depois do último controle | código 0; `Tests 65 passed (65)` |
| `visual:compare` dos onze alvos, WU-11 | código 0; a tabela do "Fim" acima |

O critério do Goal de **275** testes do gate autenticado e 0 retentativas é sustentado pela WU-10 (`validate:integration`), que rodou sobre a árvore final. A linha "retries: 1 … mobile-360" que aparece na saída do `test:gate` é uma cadeia de texto de um dos autotestes do gate, não uma retentativa real.

### Estado da árvore

`git status --porcelain=v1 -uall` ao fim da WU-11: os arquivos de produção, de testes e de `e2e/routes.ts` listados em D-117, mais os três documentos desta WU (`docs/migration/DECISIONS.md`, `docs/migration/CURRENT_STATE.md` e `docs/migration/VALIDATION_GATE.md`). Sem `apps/frontend/AGENTS.md` modificado e sem artefato de `e2e-results/` rastreado (a pasta é ignorada pelo git). Nenhum commit, push, merge nem PR.

### Não feito

- Conferência humana num aparelho real.
- A IA1 com "IA ativa" e "Pausar", em captura: a conta visual não tem esse estado, e fica provada só em jsdom.
- Medir em pixels a causa da piora do R1 e da IA1 no tablet em paisagem e no desktop, e conferir num aparelho real se a barra "Salvar" do R1 deixa o conteúdo alcançável.
- Abrir um a um os `side-by-side.png` de tablet e desktop de AG1, AG3, H3, CL1, Servicos:S1 e C5, e os tablets do M1 (os números são idênticos aos do início).
- Levar a IA1 e o R1 a diff zero: o critério "igual ao quadro" é do revisor.
- A N3, o "Adicionar" do N1 e as segundas linhas da Conta que dependem de dado que o contrato não traz.
- Decisão do Tech Lead sobre [D-117](DECISIONS.md), que segue PROPOSED; o Goal 104 não está declarado ACCEPTED.

**Nota de fechamento — review104, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-117 ACCEPTED na rodada 2, sem blocker. Os quatro blockers da rodada 1 foram só de documento: as duas linhas de link da IA1 descritas como "duas linhas para o conhecimento" em D-117 (a) e em CURRENT_STATE; a frase de D-117 (b) que punha a IA1 na âncora `#outras-informacoes`; os 16 testes que passam na baseline sem nome; e "quatorze testes" onde eram quatorze arquivos. A rodada 2 (FIX-001) mudou só os três documentos, refez o vermelho da baseline (`49 failed | 16 passed (65)`, os mesmos 16) e nomeou os 16 acima. O item "Decisão do Tech Lead sobre D-117" de "Não feito" está resolvido.
- **Conferência do Tech Lead na rodada 2.** Os sha256 de produção, do teste e de `e2e/routes.ts` do início desta seção batem com os da árvore aceita; o código não mudou desde a rodada 1. `git status --porcelain=v1 -uall` tem 30 linhas, só de arquivos autorizados; `authenticated-matrix.spec.ts`, `targets.json`, as configurações de gate e `apps/frontend/AGENTS.md` estão iguais à base. O Tech Lead rodou `visual:compare -- --target IA1,R1,Mais-WhatsApp:C1` nas rodadas 1 e 2 (exit 0), com os mesmos números do "Fim", e abriu os doze `side-by-side.png` em cada rodada. Na rodada 1, rodou de novo seis arquivos de teste, entre eles o `goal104` (151/151). Os controles do §7 e o vermelho da baseline foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Gates do IA Loop na rodada 2,** sobre a árvore aceita, todos com exit 0: typecheck, lint, `goal104-ia-conversas-e-conta` 65/65, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` (gate autenticado **275 passed**, 0 retentativas) e `git diff --check`.
- **Aceito sem prova completa.** A IA1 com "IA ativa" e "Pausar", só em jsdom; a piora do R1 nos quatro devices e a da IA1 no tablet em paisagem e no desktop, aceitas pela vista dos `side-by-side.png` (nota de U-01, banner da casca e "Salvar" desabilitado) e sem causa medida em pixels. A barra "Salvar" do R1 é `position: sticky`, então o conteúdo segue alcançável pela rolagem no jsdom e nas capturas; num aparelho real não foi conferido. Detalhe no [review104](reviews/104-review.md).

## Configurações › WhatsApp igual ao protótipo (W1), do Goal106

[D-118](DECISIONS.md), **PROPOSED**. Seção escrita na WU-11 da rodada 1 e **reescrita no lugar** nas rodadas 2 e 3 (FIX-001). Na rodada 2, depois da última edição de código (o fuso da pílula e a reversão em `e2e/`): `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e a execução 3 do `visual:compare`. Na rodada 3 só o arquivo de teste mudou (um teste a mais, o do fallback de fuso), e foram refeitos sobre essa árvore o vermelho da baseline, os controles, `tsc`, `lint`, a suíte do frontend e `validate:core`/`validate:ui` (tabela "Execuções que sustentam as contagens", que nomeia a rodada de cada número). Cada número abaixo nomeia a execução que o sustenta. Hashes sha256 da árvore final (início de cada um), conferidos iguais antes e depois dos controles e do vermelho da baseline da rodada 3: `features/onboarding/blocks/whatsapp.tsx` `92ac497a…`, `ProductSettingsScreen.tsx` `0bc27785…`, `WhatsAppSettings.tsx` `153fe61c…`, `WhatsAppConnectionPanel.tsx` `3a9a6294…`, `avenly-settings.css` `0edc3439…`, `WhatsAppConnectedSettings.tsx` `abdbf513…`, `IgnoredContactsPanel.tsx` `e6cc793a…`, `tests/goal106-whatsapp.test.tsx` `5ad6ff23…` (era `80f3ee4c…` na rodada 2; mudou só pelo teste novo), `scripts/lib/visual-responses.mjs` `f7fdb4fc…`, `scripts/tests/visual-responses.test.mjs` `a9aec83e…`. Os hashes dos cinco arquivos de produção modificados na baseline `HEAD` eram `whatsapp.tsx` `581a3271…`, `ProductSettingsScreen.tsx` `63e591b3…`, `WhatsAppSettings.tsx` `66fa90d9…`, `WhatsAppConnectionPanel.tsx` `d44c49f2…` e `avenly-settings.css` `190f2342…`. Nenhuma configuração de gate foi alterada. O gate autenticado mudou **só** no marcador de `LOADED_STATE` de `/configuracoes/whatsapp` em `e2e/authenticated-matrix.spec.ts` (`2e712734…`) e na linha correspondente de `apps/frontend/AGENTS.md` (`da13f610…`), que o Tech Lead autorizou no review 106 da rodada 1 (D-118 (e)); a espera da demonstração do onboarding que a DIAG-001 tinha acrescentado foi revertida.

### `visual:compare` das três execuções

Comando das três: `npm run visual:compare -- --target W1,4.2,4.6,IA1,M1,C5,H3`. **Execução 1:** WU-01, na baseline, antes de qualquer mudança (W1 sem `responses`, mostra o consentimento). **Execução 2:** WU-01, depois de (a) e antes de tocar o frontend (W1 com o número conectado e o painel de hoje). **Execução 3:** rodada 2 (FIX-001), sobre a árvore final (depois do fuso corrigido e da reversão em `e2e/`), depois de `validate:integration` e antes dos controles, código 0, 69 s (18:48:42Z a 18:49:51Z), app em `http://localhost:53876`; obteve os mesmos 28 números da execução 3 da rodada 1, device por device. `apps/frontend/AGENTS.md` ficou com o mesmo sha256 (`da13f610…`) antes e depois, sem reescrita pelo `next dev`.

| Quadro | Execução 1 | Execução 2 | Execução 3 |
| --- | --- | --- | --- |
| W1 (Mais-WhatsApp) | 9,4 / 4,9 / 6,9 / 5,8 | 8,3 / 3,9 / 6,1 / 5,1 | 9,5 / 4,3 / 6,7 / 5,5 |
| 4.2 | 8,9 / 5,1 / 5,3 / 3,9 | 8,9 / 5,1 / 5,3 / 3,9 | 8,9 / 5,1 / 5,3 / 3,9 |
| 4.6 | 5,4 / 2,3 / 2,7 / 1,9 | 5,4 / 2,3 / 2,7 / 1,9 | 5,4 / 2,3 / 2,7 / 1,9 |
| IA1 | 9,9 / 5,7 / 6,9 / 6,0 | 9,9 / 5,7 / 6,9 / 6,0 | 9,9 / 5,7 / 6,9 / 6,0 |
| M1 | 8,8 / 4,3 / 6,2 / 5,2 | 8,7 / 4,3 / 6,2 / 5,2 | 8,7 / 4,3 / 6,2 / 5,2 |
| C5 | 12,2 / 9,0 / 6,2 / 5,2 | 12,2 / 9,0 / 6,2 / 5,2 | 12,2 / 9,0 / 6,2 / 5,2 |
| H3 | 14,4 / 8,8 / 9,6 / 7,9 | 14,4 / 8,8 / 9,6 / 7,9 | 14,4 / 8,8 / 9,6 / 7,9 |

Ordem das colunas: mobile / tablet em retrato / tablet em paisagem / desktop. Os números são os do relatório de cada execução, não foram recalculados. **4.2, 4.6, IA1, C5 e H3** ficam com os mesmos números nas três execuções (igualdade pelo número do relatório, na mesma casa decimal; não comparei as imagens byte a byte). **M1** difere só no mobile, 8,8 na execução 1 e 8,7 nas execuções 2 e 3: é melhora, não piora; três repetições isoladas (`--target M1 --device mobile`) deram 8,7 estável, e o M1 não usa `responses`, então a causa da diferença da execução 1 **não foi isolada**. O **W1** não chegou a zero: da execução 1 para a 3 ficou 9,4 para 9,5 no mobile e melhor nos outros três devices, mas **da execução 2 (o painel de hoje com o número conectado) para a 3 ficou pior nos quatro** (8,3 para 9,5, 3,9 para 4,3, 6,1 para 6,7 e 5,1 para 5,5). **Causa medida** na WU-02 da rodada 1 (`tools/ia-loop/.state/results/work_unit/106-r1-unit-wu-02.json`): com uma resposta fixa temporária de `GET /v1/status` (conectado e IA ativa), depois removida, o W1 deu **6,0 / 2,0 / 4,8 / 3,7**, com os tablets e o desktop alinhados ao quadro; a diferença vem dos banners reais da casca (divergência 2 de D-118) somados ao `min-height: 100dvh` de `.settings-page.is-pushed:has(.wa-screen)`.

### Os side-by-side.png do W1, execução 3

Em todos os devices o app tem a estrutura do quadro: avatar com selo verde, nome em Literata, telefone, a pílula "Conectado desde 18/09", o cartão da IA, o grupo com "Contatos que a IA nunca responde" e "Trocar número" (com chevron) e o texto de uso normal. Diferenças comuns, todas declaradas em D-118 ou medidas aqui: dois banners da casca ("Atendimento automático parado" e "IA indisponível") empurram o conteúdo para baixo; "Studio Camila Reis" e "SC" no lugar de "Camila Reis" e "CR"; o cartão diz "A IA não está atendendo neste número", com "Ver em IA", no lugar de "IA ativa neste número" com "Teste real concluído…"; sem "Mãe, Dudu"; sem a linha "Uso pessoal". **A linha "Desconectar WhatsApp" não aparece no viewport do app em nenhum dos quatro devices** (causa medida na WU-02, acima: os banners da divergência 2 somados ao `min-height: 100dvh` de `.settings-page.is-pushed:has(.wa-screen)`; a captura é do viewport, não da página inteira). O Tech Lead rodou o `visual:compare` do W1 nas rodadas 1 e 2 e **abriu os quatro `side-by-side.png`**; fora das divergências declaradas e dessa linha, não há divergência visível.

- **Mobile (402×812), diff 9,5.** A estrutura do quadro até o texto de uso normal; os banners empurram a identidade para baixo e o app termina antes de "Desconectar WhatsApp".
- **Tablet em retrato (768×1024), diff 4,3.** Mesma estrutura; no fim do app há espaço vazio onde o quadro tem a área de atenção "Desconectar WhatsApp".
- **Tablet em paisagem (1024×768), diff 6,7.** Mesma estrutura à direita; a lista do hub à esquerda mostra a linha "WhatsApp" com "Desconectado" e o item "Notificações", que são o estado real da casca na conta visual (divergência 2).
- **Desktop (1366×768), diff 5,5.** Igual ao tablet em paisagem na composição: lista do hub com "WhatsApp Desconectado" e "Notificações", e a tela à direita sem a linha "Desconectar WhatsApp" no viewport.

**4.2 e 4.6 (o painel no onboarding)** ficaram iguais à execução 1 nos quatro devices, pelos números da tabela. Não abri os oito `side-by-side.png` de 4.2 e 4.6 da execução 3 um a um.

Na rodada 2 o Developer **não reabriu** os `side-by-side.png`: a descrição acima é da rodada 1, e os 28 números da execução 3 da rodada 2 são iguais aos da rodada 1, device por device; o Tech Lead rodou o `visual:compare` do W1 e abriu os quatro de novo na rodada 2 (9,5 / 4,3 / 6,7 / 5,5, iguais ao relatório). A pílula só diz "Conectado desde 18/09" na captura enquanto o fuso do negócio da conta visual for o de São Paulo; isso não foi conferido na captura.

### Teste novo do `test:gate`

`scripts/tests/visual-responses.test.mjs` (9 testes: "responses aceita GET com caminho em /v1/", "responses recusa método que não é GET, com erro que nomeia o alvo", "responses recusa caminho fora de /v1/ ou com query", "responses recusa campo desconhecido e item sem json", "validateTargetResponses recusa o arquivo inteiro por um item ruim e deixa passar alvo sem responses", "o alvo sem responses não recebe resposta fixa", "a resposta só vale para o método e o caminho exatos", "bffPathname tira /api/bff e ignora a query; fora do proxy devolve null" e "targets.json: só o W1 declara responses, e só GET /v1/whatsapp conectado"). `npm run test:gate`, rodado na rodada 2 (FIX-001) sobre a árvore final: código 0, `tests 242, pass 242, fail 0`; são os 233 da baseline do Goal mais os 9 do arquivo novo.

### Controles negativos (§6)

Refeitos **na rodada 3 (FIX-001), sobre a árvore final, depois da última edição de código e de teste (o teste do fallback de fuso)**, por um script que faz a cópia de segurança, aplica a edição exata (que exige exatamente um casamento do texto), roda o teste, restaura os bytes originais e confere o sha256 antes e depois, e roda o teste sem o defeito. Controles 1 a 6 e 8: `npx vitest run tests/goal106-whatsapp.test.tsx` em `apps/frontend` (**30 testes** no arquivo). Controle 7: `node --test scripts/tests/visual-responses.test.mjs` (**9 testes**). O controle 5 vale na **forma da variante**, que o Tech Lead aceitou porque o critério (c) do Goal exige a guarda `!consentPhase` do painel. Todos os arquivos voltaram ao sha256 de antes (`WhatsAppSettings.tsx` `153fe61c…`, `WhatsAppConnectedSettings.tsx` `abdbf513…`, `whatsapp.tsx` `92ac497a…`, `visual-responses.mjs` `f7fdb4fc…`, iguais antes e depois de cada controle).

| Controle | Defeito injetado | Com o defeito | Sem o defeito |
| --- | --- | --- | --- |
| 1 | `WhatsAppSettings.tsx`: deixa de passar `renderConnected` ao painel | `25 failed \| 5 passed (30)`: reprovam 11 na prova 1, 6 na prova 2, 4 na prova 3 e 4 na prova 5 | 30/30 |
| 2 | `WhatsAppConnectedSettings.tsx`: a pílula usa `connection.updatedAt` no lugar de `connectedAt` | `9 failed \| 21 passed (30)`: 7 da prova 1 (entre eles "a data da pílula vem de connectedAt, não de updatedAt", "a data da pílula usa o fuso do negócio, não um fuso fixo" e o teste novo do fallback) e 2 da prova 2 | 30/30 |
| 3 | `WhatsAppConnectedSettings.tsx`: o cartão sempre diz "IA ativa neste número" (`{true ? … }`) | `1 failed \| 29 passed (30)`: "sem a IA ligada, o cartão diz 'A IA não está atendendo neste número' e leva a /configuracoes/ia" (prova 1) | 30/30 |
| 4 | `WhatsAppConnectedSettings.tsx`: "Trocar número" chama `swapNumber()` direto, sem abrir a confirmação | `3 failed \| 27 passed (30)` (prova 2) | 30/30 |
| 5, forma literal do Goal (referência, não é a forma válida) | `features/onboarding/blocks/whatsapp.tsx`: passa `renderConnected` ao painel, mantendo `consentPhase` | `30 passed (30)`: o painel ignora `renderConnected` quando há `consentPhase`, então o defeito não tem efeito; é a guarda `!consentPhase`, exigida por (c), que o protege | 30/30 |
| **5 (forma válida do controle 5, aceita pelo Tech Lead)** | o mesmo arquivo: remove `consentPhase` e passa `renderConnected={() => <p>Identidade do W1</p>}` | `1 failed \| 29 passed (30)`: "/onboarding/whatsapp-conectar conectado mostra o painel de hoje, sem a identidade do W1" (prova 4) | 30/30 |
| 6 | `WhatsAppSettings.tsx`: chama `useShellConfig({ active: "configuracoes", module: "settings", title: "Configurações" })` (com o import) | `27 failed \| 3 passed (30)`: cascata (11 na prova 1, 6 na 2, 4 na 3 e 6 na 5, entre eles os dois "uma chamada de useShellConfig por árvore") | 30/30 |
| 7 | `scripts/lib/visual-responses.mjs`: aceita `POST` (`entry.method !== "GET" && entry.method !== "POST"`) | `tests 9, pass 7, fail 2` | `tests 9, pass 9, fail 0` |
| 8 (teste novo da rodada 3) | `WhatsAppConnectedSettings.tsx`: o fallback do fuso sem `settings.business` passa de `"America/Sao_Paulo"` para `"UTC"` | `1 failed \| 29 passed (30)`: "sem settings.business, a data da pílula cai no fuso America/Sao_Paulo, não em UTC" (prova 1) | 30/30 |

O controle 7 reprova em dois testes: "responses recusa método que não é GET, com erro que nomeia o alvo" e "validateTargetResponses recusa o arquivo inteiro por um item ruim e deixa passar alvo sem responses" (nomes impressos na rodada 3). O controle 5 vale na forma da variante, que o Tech Lead aceitou porque o critério (c) do Goal exige a guarda `!consentPhase` do painel: com ela, a forma literal não tem efeito, e sem ela a prova 4 reprova. Os sete controles reprovam com o defeito (o 5 na variante), e o oitavo cobre o teste novo.

### Vermelho da baseline das provas novas

Medido na rodada 3 (FIX-001) sobre a árvore final: os cinco arquivos de produção modificados trocados pelos de `HEAD` (`git show HEAD:<caminho>`), os dois novos (`WhatsAppConnectedSettings.tsx`, `IgnoredContactsPanel.tsx`) removidos, e tudo restaurado com os sha256 iguais. Resultado: `25 failed | 5 passed (30)`. Reprovam 11 na prova 1 (entre eles "a data da pílula usa o fuso do negócio, não um fuso fixo" e o novo "sem settings.business, a data da pílula cai no fuso America/Sao_Paulo, não em UTC"), 6 na 2, 4 na 3 e 4 na 5. Os 5 que passam, porque a baseline já cumpre o que eles afirmam:

1. Prova 4, "/onboarding/whatsapp-conectar conectado mostra o painel de hoje, sem a identidade do W1": o painel de hoje do onboarding é o da baseline.
2. Prova 4, "a etapa de contatos ignorados marca por telefone com o mesmo pedido": o componente existia, dentro do arquivo do onboarding, com os mesmos pedidos.
3. Prova 4, "a etapa de contatos ignorados marca uma conversa com o mesmo pedido": idem.
4. Prova 5, "desconectado, de 1024 px em diante, a lista do hub tem 'WhatsApp' marcada e há um só h1": composição da casca que já existia, no estado desconectado.
5. Prova 5, "desconectado, abaixo de 1024 px, é tela empurrada sem a lista e há um só h1": idem.

O teste "uma chamada de useShellConfig por árvore, conectado e desconectado" (duas faixas) itera os dois estados e **reprova** na baseline pelo estado conectado, que ela não tem.

### Mudanças em testes existentes (§5 do Goal)

`goal071-onboarding-whatsapp.test.tsx`: ganhou a função `settingsFixture` e passa `settings={settingsFixture()}` ao montar `WhatsAppSettings`. `goal099-onboarding-ia-whatsapp.test.tsx`: passa `settings={settingsFixture()}` (a função já existia no arquivo). Motivo das duas: `WhatsAppSettings` agora recebe `settings`. Nenhuma asserção de texto mudou, nenhum teste foi removido nem pulado. `goal059`, `goal024-settings-shell-invariant`, `goal018-a11y` e `goal019-a11y` não mudaram e passam.

### Execuções que sustentam as contagens

Todas de 2026-10-03. Cada linha diz a rodada da execução. **Rodada 3 (FIX-001):** a árvore final, depois da última edição, que foi só o teste do fallback de fuso em `tests/goal106-whatsapp.test.tsx` (código de produção, `e2e/` e `scripts/` iguais aos da rodada 2, pelos sha256 do início da seção). **Rodada 2 (FIX-001):** a árvore anterior, com o mesmo código de produção; as linhas `validate:integration` e `visual:compare` ficam desta rodada porque um teste de jsdom não entra nesses gates e não foi reexecutado. As execuções da rodada 1 (WU-04 a WU-10 do loop, `tools/ia-loop/.state/results/work_unit/106-r1-unit-wu-NN.json`) **não sustentam** nenhuma contagem abaixo: a árvore mudou depois delas.

| Execução | Resultado |
| --- | --- |
| `tsc --noEmit` em `apps/frontend` (rodada 3) | código 0 |
| `npm run lint` em `apps/frontend` (rodada 3) | código 0 (`--max-warnings=0`) |
| `validate:core` (rodada 3, terminou 19:24:33Z) | código 0; 17 passos, **15 passaram**, 0 falharam e 2 foram pulados (`test:bff` e `test:health-worker`, por desenho do gate) |
| `test:gate` (rodada 3) | código 0; `tests 242, pass 242, fail 0`: os 233 da baseline do Goal mais os 9 de `visual-responses.test.mjs` |
| `validate:ui` (rodada 3, 19:25:12Z a 19:25:58Z) | código 0; **169 passed**, 21 skipped; "public UI gate retries: 0" |
| `validate:integration`, primeira tentativa da rodada 2 (18:33:50Z) | **recusada, código 2**, antes de rodar qualquer passo: `BFF_TEST_DATABASE_URL` não definida. Causa: variável não exportada; não é falha de gate nem de código |
| `validate:integration` (**rodada 2**, sem reexecução na rodada 3), com `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55432/atendly_bff_test` (cluster PostgreSQL descartável, 18:36:20Z a 18:48:12Z, 11 min 52 s) | código 0; 36 passos passaram, 0 falharam, 0 pulados; gate autenticado **275 passed (9,7 min)**; "authenticated gate retries: 0"; `e2e-results/authenticated/results.json`: `expected 275, skipped 0, unexpected 0, flaky 0` |
| Suíte do frontend (`npx vitest run` em `apps/frontend`) | código 0; **146 arquivos e 1789 testes passaram** (rodada 3); a baseline do Goal104 tinha 145 arquivos e 1759 testes, e a diferença é o arquivo novo, com 30 testes |
| `npx vitest run tests/goal106-whatsapp.test.tsx` (rodada 3) | `30 passed (30)` |
| `visual:compare` da execução 3 (**rodada 2**, sem reexecução na rodada 3: o teste novo não muda a tela) | tabela acima |

A `validate:integration` final passou sem a espera da demonstração do onboarding, que foi revertida; o contraste intermitente de `onboarding-demonstracao-da-ia` não apareceu nessa execução (uma execução, sem retentativa). A `validate:integration` da WU-10 da rodada 1 tinha falhado uma vez (269 passed, 6 `unexpected`) pelo marcador de `LOADED_STATE`, antes do ajuste que o Tech Lead autorizou.

### Estado da árvore

Ao fim da rodada 3, `git status --short` lista os mesmos 14 arquivos modificados (os 11 abaixo mais os três documentos) e os mesmos 5 novos; a rodada 3 só mudou `tests/goal106-whatsapp.test.tsx` e os três documentos. `git status --porcelain=v1 -uall` ao fim da rodada 2: 11 arquivos modificados e 5 novos antes dos três documentos: `apps/frontend/AGENTS.md`, `e2e/authenticated-matrix.spec.ts`, `e2e/visual/targets.json`, `features/onboarding/blocks/whatsapp.tsx`, `ProductSettingsScreen.tsx`, `WhatsAppSettings.tsx`, `WhatsAppConnectionPanel.tsx`, `avenly-settings.css`, `goal071-onboarding-whatsapp.test.tsx`, `goal099-onboarding-ia-whatsapp.test.tsx` e `scripts/visual-compare.mjs`, mais os novos `WhatsAppConnectedSettings.tsx`, `IgnoredContactsPanel.tsx`, `goal106-whatsapp.test.tsx`, `scripts/lib/visual-responses.mjs` e `scripts/tests/visual-responses.test.mjs`. `apps/frontend/AGENTS.md` e `authenticated-matrix.spec.ts` estão modificados, só no que o Tech Lead autorizou (marcador de `LOADED_STATE` e a linha do `AGENTS.md`, D-118 (e)); o spec não tem mais o bloco da demonstração do onboarding. Sem resto de controle negativo e sem artefato de `e2e-results/` rastreado (a pasta é ignorada pelo git). Nenhum commit, push, merge nem PR.

### Não feito

- Conferência humana num aparelho real, e o W1 com um número conectado de verdade (a captura usa resposta fixa).
- "IA ativa neste número", em captura: a conta visual não tem esse estado, e fica provado só em jsdom.
- A causa do M1 mobile 8,8 para 8,7.
- Abrir um a um os `side-by-side.png` de 4.2, 4.6, IA1, M1, C5 e H3 da execução 3 (a igualdade vem do número do relatório), (o Tech Lead abriu os quatro do W1 nas rodadas 1 e 2).
- Decisão do Tech Lead sobre [D-118](DECISIONS.md), que segue PROPOSED; o Goal 106 não está declarado ACCEPTED.

**Nota de fechamento — review106, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-118 ACCEPTED na rodada 3, sem blocker, depois de 5 blockers na rodada 1 e 6 na rodada 2. A rodada 3 (FIX-001) mudou só `tests/goal106-whatsapp.test.tsx` (o teste do fallback de fuso) e os três documentos. O item "Decisão do Tech Lead sobre D-118" de "Não feito" está resolvido.
- **Conferência do Tech Lead na rodada 3.** Os sha256 do início desta seção batem com os da árvore aceita, e os de produção, de `scripts/` e de `e2e/` são iguais aos da rodada 2. `git status --porcelain=v1 -uall` lista só arquivos autorizados, mais o spec e o `AGENTS.md` autorizados na rodada 1. O Tech Lead rodou `npm run visual:compare -- --target W1` nas rodadas 1, 2 e 3 (exit 0, sempre **9,5 / 4,3 / 6,7 / 5,5**) e abriu os quatro `side-by-side.png` do W1 em cada rodada. Os controles do §6 e o vermelho da baseline foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Gates do IA Loop na rodada 3,** sobre a árvore aceita, todos com exit 0: typecheck, lint, `goal106-whatsapp` 30/30, `validate:core`, `test:gate` (`tests 242, pass 242`), `validate:ui` (**169 passed**, 0 retentativas), `validate:integration` e `git diff --check`.
- **`validate:integration` da rodada 3.** A linha "sem reexecução na rodada 3" da tabela acima descreve a execução do Developer. O IA Loop rodou a `validate:integration` na rodada 3, depois dos documentos (11 min 33 s): exit 0, gate autenticado **274 passed e 1 flaky**, com 1 retentativa, em `[mobile-390] › onboarding-agenda-atendly-pronta › measured, logged in`. A causa está no log: `page.goto: net::ERR_NO_BUFFER_SPACE`, esgotamento de buffer de socket do host Windows, não asserção. A rota está fora do escopo do Goal. A árvore da rodada 3 difere da rodada 2 só por um teste de jsdom, e a rodada 2 deu 275 passed com 0 retentativas no mesmo código de produção.
- **Aceito sem prova completa.** "IA ativa neste número", só em jsdom; o W1 com um número conectado de verdade (a captura usa resposta fixa); o W1 sem diff zero e pior pelo diff que o painel de hoje com o número conectado, aceito pela vista dos `side-by-side.png` e pela causa medida na WU-02; a causa do M1 mobile 8,8 para 8,7, não isolada. Detalhe no [review106](reviews/106-review.md).

## Configurações › Importação igual ao protótipo (I1, I2, 2.I1), do Goal105

Texto do Goal105 (decisão [D-119](DECISIONS.md), `PROPOSED`), escrito pela WU-12 da rodada 1, por acréscimo. Toda contagem diz a execução que a sustenta. As execuções 1 e 2 de `visual:compare` são as da WU-01 e da WU-02 (lidas do resultado delas em `tools/ia-loop/.state/results/work_unit/`); a execução 3 e os controles são da WU-12. A execução 3 vale para a árvore final (confirmada depois da última edição de código); o vermelho da baseline e os controles são de antes dela (ver "A correção da rodada 3 e a ordem dos fatos").

### As três execuções de `visual:compare`

Comando: `npm run visual:compare -- --target I1,I2,2.I1,2.2,M1,W1,H3`. Cada célula é o diff em % do início de cada device: mobile 402×812 / tablet em retrato 768×1024 / tablet em paisagem 1024×768 / desktop 1366×768. O diff é uma tendência; o hash do PNG varia entre corridas iguais.

| Alvo | Execução 1 (baseline, antes de qualquer mudança) | Execução 2 (logo depois de (a), antes do frontend) | Execução 3 (árvore final, saída 0) |
| --- | --- | --- | --- |
| I1 | 11,7 / 6,3 / 7,3 / 6,2 | 10,3 / 5,0 / 5,8 / 5,2 | 10,0 / 4,4 / 6,7 / 5,6 |
| I2 | 13,9 / 9,8 / 10,0 / 8,7 | igual à execução 1 | 16,1 / 11,3 / 12,2 / 10,8 |
| 2.I1 | 15,1 / 8,6 / 6,7 / 5,2 | igual à execução 1 | 2,7 / 1,8 / 2,1 / 1,6 |
| 2.2 | 1,1 / 0,4 / 0,7 / 0,7 | igual | igual à execução 1 |
| M1 | 8,5 / 3,8 / 5,9 / 5,1 | igual | igual à execução 1 |
| W1 | 8,1 / 3,4 / 6,0 / 5,0 | igual | igual à execução 1 |
| H3 | 8,1 / 4,1 / 3,7 / 3,0 | igual | igual à execução 1 |

- **Execução 2 contra a 1:** só o I1 muda (a resposta fixa de `GET /v1/calendar/imports` dá o histórico no lugar da tela de conectar). I2, 2.I1, 2.2, M1, W1 e H3 dão os mesmos números.
- **Execução 3 contra a 1:** 2.2, M1, W1 e H3 não mudam (a ilustração movida não mexeu na 2.2). O 2.I1 cai de 15,1 / 8,6 / 6,7 / 5,2 para 2,7 / 1,8 / 2,1 / 1,6. O I1 melhora nos quatro devices contra a execução 1; contra a execução 2, o tablet em paisagem (5,8 para 6,7) e o desktop (5,2 para 5,6) ficam um pouco piores, e o mobile e o tablet em retrato melhoram.
- **Piora medida: I2.** Passa de 13,9 / 9,8 / 10,0 / 8,7 (execução 1) para 16,1 / 11,3 / 12,2 / 10,8 (execução 3). **Causa medida** nas imagens `app.png` e `side-by-side.png` das duas execuções: na execução 1 o app mostrava a tela antiga de conectar, a mesma imagem do I1 (`app.png` idêntica), e não o I2; na execução 3 mostra o I2 correto, deslocado para baixo pelo banner real da casca "Atendimento automático parado" (divergência 2 do Goal), cerca de 168 px no mobile e cerca de 80 px no desktop, e a lista do hub traz dados da conta real (divergência 3). O diff compara pixels na mesma posição, então o deslocamento pesa mais que o ganho de estrutura. Uma nova medida com o banner removido **não foi feita**.
- **Divergências que restam, nos quatro devices:** as cinco declaradas pelo Goal (barra de status do iPhone, estado da casca por `GET /v1/status`, lista do hub com dados da conta real, bloco âmbar do I1 sem a lista por registro, stepper do 2.I1 derivado do fluxo), mais o deslocamento do I2 acima. O I1 e o 2.I1 não chegaram a diff zero, e o I2 não está "igual ao quadro" pelo diff; a comparação visual final é do Tech Lead.

### O teste novo do `test:gate`

`scripts/tests/visual-responses.test.mjs`, teste "targets.json: só W1 e I1 declaram responses, cada um só com o seu GET" (substitui o do Goal106, que dizia só o W1): exige exatamente W1 (`GET /v1/whatsapp`) e I1 (`GET /v1/calendar/imports`). Execução do `test:gate`: **242** testes, saída 0 (WU-09), sem teste a menos que a baseline.

### Vermelho da baseline das provas novas

`tests/goal105-importacao.test.tsx` rodado contra os arquivos de produção da baseline (`git show HEAD:` dos nove arquivos de produção modificados, e removidos os três arquivos novos), sem mexer no teste, na árvore da WU-12, antes da edição de CSS da rodada 3: `Tests  24 failed | 6 passed (30)` (a WU-04 mediu o mesmo). Restauração conferida por sha256 dos 12 arquivos, igual antes e depois, e `git status --porcelain` com o mesmo md5. As **seis** que passam na baseline, declaradas uma a uma:

1. Prova 3: "sem `pendingAcceptance`, nenhum bloco âmbar" (a baseline não tem bloco âmbar).
2. Prova 5: a sessão em análise, a sessão em execução, na faixa ≥1024 e na faixa <1024 (quatro testes de comportamento preservado).
3. Prova 5: o markup da ilustração da 2.2 (a baseline já o tem inline).

### Os sete controles negativos (WU-12, antes da edição de CSS da rodada 3)

Cada controle aplica o defeito, roda `npx vitest run tests/goal105-importacao.test.tsx` (o 7, `node --test scripts/tests/visual-responses.test.mjs`), restaura o arquivo e confere o sha256 antes e depois (todos **iguais**). Sem o defeito, a prova volta a **30**/**30** (o 7, a `pass 9, fail 0`). Saída real, as linhas decisivas:

| # | Defeito | Com o defeito | Sem o defeito |
| --- | --- | --- | --- |
| 1 | `ImportsScreen.tsx`: `ImportsFlow` mostra `ConnectSourceScreen` no lugar de `ImportEmptyScreen` | saída 1, `Tests  9 failed \| 21 passed (30)`; entre elas "sem histórico e sem sessão: ilustração, texto, botão e nota do I2, sem campo de credencial" (prova 1) | `Tests  30 passed (30)` |
| 2 | `ConnectSourceScreen.tsx`: a fase inicial passa a `"credentials"` | saída 1, `Tests  5 failed \| 25 passed (30)`; "o botão mostra a origem sem pedido novo; 'Continuar' mostra o formulário" e "na etapa importacao do onboarding: h1 da origem…" | `Tests  30 passed (30)` |
| 3 | `labels.ts`: `timeZone` tirado de `formatImportMoment` | saída 1, `Tests  1 failed \| 29 passed (30)`; "o mesmo instante em Pacific/Auckland dá outro dia, no bloco verde e no texto final" (prova 3) | `Tests  30 passed (30)` |
| 4 | `ImportHistoryCard.tsx`: o bloco âmbar sem a condição `pendingCount > 0` | saída 1, `Tests  1 failed \| 29 passed (30)`; "com pendingCount 0, nenhum bloco âmbar" (prova 3) | `Tests  30 passed (30)` |
| 5 | `ImportsScreen.tsx`: `if (true) return flow;`, sem a lista de 1024 px em diante | saída 1, `Tests  1 failed \| 29 passed (30)`; "de 1024 px em diante, a lista do hub tem 'Importação' marcada, o título dela é h2 e há um só h1" (prova 4) | `Tests  30 passed (30)` |
| 6a | `ImportHistoryCard.tsx` chama `useShellConfig` | saída 1, `Tests  16 failed \| 14 passed (30)`; entre elas as duas "uma chamada de useShellConfig por árvore, com pushed, na faixa ≥1024" e "<1024" (prova 4) | `Tests  30 passed (30)` |
| 6b | `ConnectSourceScreen.tsx` chama `useShellConfig` | saída 1, `Tests  5 failed \| 25 passed (30)`; `Error: Maximum update depth exceeded` e `Error: useShellConfig must be used inside ShellConfigProvider.` | `Tests  30 passed (30)` |
| 7 | `targets.json`: o I2 declara `responses` (cópia do GET do I1) | saída 1, `ℹ tests 9`, `ℹ pass 8`, `ℹ fail 1`; "✖ targets.json: só W1 e I1 declaram responses, cada um só com o seu GET", `actual: [ 'W1', 'I1', 'I2' ]`, `expected: [ 'W1', 'I1' ]` | `ℹ pass 9`, `ℹ fail 0` |

**O controle 6 só está provado de verdade na variante 6a.** Na 6b a prova 4 reprova apenas no teste da moldura do onboarding e por efeito colateral (laço de atualização e falta de provedor), não pela asserção "uma chamada de `useShellConfig` por árvore", que continua passando. Isto fica ao Tech Lead: aceitar a 6a como o controle 6, ou pedir uma asserção própria para `ConnectSourceScreen`.

Hashes sha256 (oito primeiros caracteres), iguais antes e depois dos controles e, conferido pelo Tech Lead, também na árvore final (a edição de CSS da rodada 3 não toca nenhum destes arquivos): `ImportsScreen.tsx` e422c055, `ConnectSourceScreen.tsx` a12c39b8, `ImportHistoryCard.tsx` fe9a6609, `ImportEmptyScreen.tsx` acabd454, `ImportOriginScreen.tsx` f17460d5, `ImportIllustration.tsx` 2dff25e6, `ImportsLayout.tsx` 737406b3, `labels.ts` 6b222a73, `goal105-importacao.test.tsx` 06620e50, `targets.json` 84737471, `visual-responses.test.mjs` 7719edda.

### Mudanças em testes existentes

Mudou só o caminho até o formulário (agora I2 e origem antes das credenciais), o texto ou a estrutura que os quadros trocam e o link "Configurações": `goal018-onboarding-reachability`, `goal020-a11y`, `goal020-import-conflicts`, `goal020-import-preview`, `goal020-import-run`, `goal020-imports-entry`, `goal020-reachability`, `goal020-shell-invariant`, `goal060-connect-source`, `goal061-import-async`, `goal062-import`, `goal066-onboarding-importacao`, `goal072-onboarding-frame`, `goal079-onboarding-gate-routes` e `goal082-connect-source-client-rejected`. Nenhum teste foi removido nem pulado.

### Execuções que sustentam cada contagem

| Contagem | Execução |
| --- | --- |
| Suíte do frontend: **147 arquivos e 1819 testes** (baseline do Goal106: 146 e 1789) | WU-04, depois de escrita a prova nova |
| `goal105-importacao`: **30**/**30** | WU-07 e as corridas "sem defeito" dos controles da WU-12 |
| Typecheck e lint: saída 0 | WU-05 (typecheck) e WU-06 (lint) |
| `validate:core`: saída 0, 15 passos passaram e 2 pulados de 17 | WU-08 |
| `test:gate`: **242** testes, saída 0 | WU-09 |
| `validate:ui`: 169 passaram, 21 pulados, 0 retentativas | WU-10 |
| `validate:integration`: saída 0 em 705 s (`durationMs` 705262), 36 passos passaram; gate autenticado **275** passaram, 0 retentativas | WU-11 da rodada 3 |
| `visual:compare`, execuções 1 e 2 | WU-01 e WU-02 |
| `visual:compare`, execução 3 (saída 0) | WU-12 |
| Baseline vermelha: 24 reprovam e 6 passam | WU-04 e WU-12 (mesma contagem) |
| Sete controles | WU-12, antes da edição de CSS da rodada 3 |

Os gates finais, WU-05 a WU-11 da rodada 3, correram na árvore com a impressão digital de código `code-v1:a698f84c…`; `a6695e1e…` é a árvore da rodada 1. Os documentos não entram na impressão digital.

### A correção da rodada 3 e a ordem dos fatos

- **(a) A correção.** A última edição de código foi `text-align: left` em `.import-card` (`apps/frontend/src/shared/styles/avenly.css`), feita na rodada 3 para o blocker do review 2: os rótulos do I2 saíam centralizados. Motivo: `.imports-empty { text-align: center }` era herdado pelo cartão. A regra é a base do componente compartilhado e vale também para a 2.2.
- **(b) O que é de antes dela.** O vermelho da baseline (24 reprovam, 6 passam) e os sete controles negativos rodaram antes dessa edição de CSS, não "na árvore final". Os 11 hashes sha256 citados acima seguem iguais na árvore final (conferido pelo Tech Lead) e a edição é só de CSS, então o Tech Lead os aceitou sem nova corrida. Nada foi reexecutado.
- **(c) A execução 3 depois da edição.** Os números de I1, I2 e 2.I1 foram confirmados depois da edição: a corrida da FIX-001 da rodada 3 e a do Tech Lead deram I1 10,0 / 4,4 / 6,7 / 5,6, I2 16,1 / 11,3 / 12,2 / 10,8 e 2.I1 2,7 / 1,8 / 2,1 / 1,6. A 2.2, medida de novo pelo Tech Lead, deu 1,1 / 0,4 / 0,7 / 0,7, igual à execução 1. M1, W1 e H3 não foram medidos de novo depois da edição: `.import-card` só existe em `ImportIllustration`.

### Estado da árvore

`git status --porcelain=v1 -uall` da WU-12, antes e depois dos controles, com o mesmo md5. Nenhum arquivo de `e2e-results/` aparece (a pasta é ignorada pelo git). Nenhuma configuração de gate mudou (`vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts`, `next.config.ts`). A execução 3 não reescreveu `apps/frontend/AGENTS.md` além da linha de (f).

### Não feito

A conferência humana da tela num aparelho real. Uma nova medida do I2 com o banner da casca removido. O 2.I2 a 2.I10 como quadros. A lista por registro do I1.

**Nota de fechamento — review105, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-119 ACCEPTED na rodada 4, sem blocker, depois de 2 blockers na rodada 1 (documento), 1 na rodada 2 (código: rótulos do I2) e 3 na rodada 3 (documento). A rodada 4 (FIX-001) mudou só as seções do Goal105 de CURRENT_STATE e VALIDATION_GATE.
- **Controle 6.** O Tech Lead aceita a variante 6a como o controle 6, porque ela cumpre o "ou" do Goal. A pergunta deixada acima fica respondida, sem asserção própria para `ConnectSourceScreen`.
- **Conferência do Tech Lead na rodada 4.** Os 11 sha256 da seção dos controles batem com a árvore aceita. O único diff de `avenly.css` é `text-align: left` em `.import-card`. Depois da comparação, `git status` lista os mesmos 36 arquivos, e `apps/frontend/AGENTS.md` difere da base só na linha de (f). O Tech Lead rodou `npm run visual:compare -- --target I1,I2,2.I1` nas rodadas 1 a 4 (exit 0; a 2.2 também na rodada 3) e abriu os doze `side-by-side.png` em cada rodada. Os números da rodada 4 são os da execução 3. O vermelho da baseline e os controles foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Gates do IA Loop na rodada 4.** São os da rodada 3 (WU-05 a WU-11), reaproveitados porque a impressão digital de código continua `code-v1:a698f84c…`. Todos têm exit 0, com as contagens da tabela "Execuções que sustentam cada contagem".
- **Aceito sem prova completa.** O histórico de uma importação real, só em jsdom (o I1 usa resposta fixa); I1 e 2.I1 sem diff zero e o I2 pior pelo diff que na execução 1, aceitos pela vista dos `side-by-side.png` e pela causa medida; o vermelho da baseline e os controles de antes da edição de CSS. Detalhe no [review105](reviews/105-review.md).

## Valores gravados e contratos passam a Avenly, do Goal109

Texto do Goal109 ([D-120](DECISIONS.md), `PROPOSED`), escrito pela WU-14 da rodada 1, por acréscimo, depois da execução final. Toda contagem diz a execução que a sustenta. A recontagem da baseline, o vermelho das provas e os resultados de typecheck, `test:gate`, `validate:core`, `validate:ui` e `validate:integration` são das WU-01 a WU-13, lidos do resultado delas em `tools/ia-loop/.state/results/work_unit/`. Os controles do §8, o inventário do §7, a suíte completa do frontend e a prova 7 medida de novo contra a baseline são da WU-14. Nenhuma seção de outro Goal foi editada.

### Recontagem da baseline (WU-01, `HEAD` `27ede84`, sem edição)

`test:gate`: 242 testes, `pass 242`. `test:ai-orchestrator` sem banco: `Test Files 94 passed | 13 skipped (107)` e `Tests 1188 passed | 98 skipped (1286)`. Scheduling, unitários: 39 arquivos e 534 testes. `test:scheduling-integration`: 19 arquivos e 145 testes. `test:bff-integration`: 64 arquivos e 477 testes. Frontend: 147 arquivos e 1819 testes (fim do Goal105, em D-119).

### As oito provas e o vermelho da baseline

Vermelho: os arquivos de produção da baseline (`git show HEAD:`) com só as provas novas presentes, medido pela unidade que escreveu cada prova (WU-01 a WU-04). A prova 7 foi medida de novo na WU-14, com `BffHttpClient.ts` de `HEAD`, e a restauração foi conferida por sha256 (`a62ef333`, igual antes e depois). Dos 61 testes novos (52 da rodada 1 e 9 da FIX-001, rodada 2), **38 reprovam** contra a baseline e **23 passam**. Na rodada 2, o vermelho dos 9 testes novos da prova 4 foi medido com `schemas.ts` de `HEAD` (sha256 restaurado depois); o caso novo do dashboard, na prova 5, está dentro de um teste que já reprovava na baseline, e a prova 5 não foi medida de novo contra a baseline. Os que passam protegem comportamento de hoje ou uma pré-condição; os nomeados abaixo vêm dos relatórios das WU-01 a WU-04 e da medida da WU-14.

| Prova | Arquivo | Com o código final | Contra a baseline | O que passa na baseline |
| --- | --- | --- | --- | --- |
| 1 (migration do Scheduling, PostgreSQL real) e 3 (rota interna do Scheduling) | `apps/scheduling-service/tests/integration/goal109-avenly-calendar-source.test.ts` | 7 de 7 | `5 failed \| 2 passed` | "starts from the state the previous migrations leave" (pré-condição) e "refuses any other value as before, without writing" (comportamento de hoje) |
| 2 (migration da IA, PostgreSQL real) | `apps/ai-orchestrator/tests/integration/goal109-avenly-human-control-source.test.ts` | 3 de 3 | `2 failed \| 1 passed` | a pré-condição (o estado que as migrations anteriores deixam) |
| 4 (contrato) e 5 (BFF, fonte da agenda) | `apps/bff/tests/goal109-avenly-calendar-source.test.ts` | 23 de 23 (rodada 2; eram 14 de 14) | `14 failed \| 9 passed` (10 da prova 4 e 4 da prova 5; eram `6 failed \| 8 passed`) | os 9 casos de recusa, que são comportamento antigo: os 7 valores recusados por `calendarSourceSchema`, a recusa de `EXTERNAL` pelos quatro schemas e o `PATCH /v1/onboarding` que recusa outra fonte |
| 6 (BFF, sessão por HTTP) | `apps/bff/tests/goal109-legacy-session-cookie.integration.test.ts` | 7 de 7 | `4 failed \| 3 passed` | leitura só com `atendly_session`, mutação com CSRF e sessão revogada recusada |
| 7 (`BffHttpClient`, CSRF) | `apps/frontend/tests/goal109-csrf-cookie.test.ts` | 4 de 4 | `2 failed \| 2 passed` (WU-03; de novo na WU-14) | "falls back to atendly_csrf when avenly_csrf is absent" e "sends no token when neither cookie is present" |
| 8 (frontend, demais valores) | `apps/frontend/tests/goal109-avenly-values.test.tsx` | 17 de 17 | `11 failed \| 6 passed` | `legal-details` só com nome antigo; valor novo em branco cai para o antigo; `check-legal-config` só com nomes antigos; `check-legal-config` sem aprovação jurídica falha nos dois prefixos; `Brand` com só a chave antiga em `entry`; `Brand` com só a chave antiga em `check` |

Total: 7 + 3 + 23 + 7 + 4 + 17 = 61 testes novos (Scheduling 7, IA 3, BFF 23 e 7, frontend 4 e 17); a rodada 1 tinha 52, com 14 no arquivo do BFF da prova 4 e 5. A prova 2 está sob `tests/integration` da IA, que o passo `test:ai-orchestrator-transport-durability` de `validate:integration` roda (`vitest run tests/integration`). O relatório desse passo traz só "passed", sem contagem por arquivo, então a execução da prova 2 dentro dele **não** é conferida por contagem. Na WU-14 a prova 2 rodou à parte, contra um PostgreSQL com `pgvector`: 3 de 3.

### Testes existentes que mudaram

Mudou só onde o teste afirmava `"ATENDLY"` como valor gravado (o Prisma e o `tsc` recusam o valor antigo) ou o nome antigo do cookie ou da constraint como padrão. Arquivos existentes modificados na árvore: **38** em `apps/scheduling-service/tests`, **7** em `apps/ai-orchestrator/tests` (seis da WU-01 e `assistant.service.test.ts`, da `DIAG-001`), **5** em `apps/bff/tests` (`goal029-timezone-owner`, `goal029-timezone-propagation.integration`, `goal029-timezone-read-reconciliation.integration`, `goal060-integration-connect`, `session-csrf.integration`), **76** em `apps/frontend/tests` e **1** em `scripts/tests`. Os testes que **enviam** `"ATENDLY"` como entrada do decodificador não mudaram de valor e passam a provar (b); em `goal029-calendar-timezone.test.ts` do Scheduling os payloads HTTP seguem `"ATENDLY"`. Nenhum teste foi removido, pulado ou marcado como `todo`, e nenhuma asserção foi afrouxada.

### Os controles negativos do §8 (WU-14, depois da última edição de código)

Cada controle copia o arquivo, aplica o defeito, roda a prova com `npx vitest run` e restaura o arquivo da cópia. O sha256 (oito primeiros caracteres) é conferido antes e depois e é **igual** em todos. Os controles 1 e 12 recompilam o contrato (`npx tsc -p tsconfig.json`) e copiam o `dist` para `apps/bff/node_modules/@atendly-ia/public-api-contract` e `apps/frontend/node_modules/@atendly-ia/public-api-contract`; depois da restauração e de nova recompilação, o `dist` das três pastas tem os mesmos hashes de antes. O controle 5 rodou contra um PostgreSQL com `pgvector`. Saída real, linhas decisivas:

| # | Defeito | Arquivo (sha256) | Com o defeito | Sem o defeito |
| --- | --- | --- | --- | --- |
| 1 | tirar `"ATENDLY"` de `calendarSourceSchema` do contrato (`.enum(["AVENLY"])`) | `packages/public-api-contract/src/schemas.ts` (`2d299647`) | saída 1, `5 failed` (rodada 2, FIX-001, de 23): "decodifica ATENDLY como AVENLY" e, na prova 4 dos quatro schemas com a fonte `ATENDLY`, `calendarStateSchema`, `onboardingStateSchema`, `customerListSchema` e `serviceListSchema` (a rodada 1 tinha `1 failed \| 13 passed (14)`) | saída 0, `23 passed (23)` |
| 2 | tirar a leitura de `atendly_session` em `presentedCredential` | `apps/bff/src/lib/auth.ts` (`db80c6de`) | saída 1, `5 failed \| 2 passed (7)`: leitura só com `atendly_session`, mutação com CSRF, logout dos quatro cookies, sessão revogada com o nome antigo, login e troca de senha gravando os nomes novos (prova 6) | saída 0, `7 passed (7)` |
| 3 | trocar `RENAME VALUE` por `ADD VALUE 'AVENLY'` | migration do Scheduling (`a9c88efd`) | saída 1, `3 failed \| 4 passed (7)`: "is a no-op when applied again", "keeps refusing MINHA_AGENDA in CalendarSettings through the renamed constraint", "renames the value and the constraint without rewriting a row" (prova 1) | saída 0, `7 passed (7)` |
| 4 | tirar o `RENAME CONSTRAINT` | mesma migration do Scheduling (`a9c88efd`) | saída 1, `3 failed \| 4 passed (7)`: os mesmos três casos (prova 1) | saída 0, `7 passed (7)` |
| 5 | tirar o `RENAME VALUE` da IA | migration da IA (`6e0b2f18`) | saída 1, `2 failed \| 1 passed (3)`: "reads AVENLY where ATENDLY was, and leaves WHATSAPP and BACKFILL alone" e "lets the current client read the renamed value and is a no-op when applied again" (prova 2) | saída 0, `3 passed (3)` |
| 6 | tirar a reserva `atendly_csrf` do `BffHttpClient` | `apps/frontend/src/data/http/BffHttpClient.ts` (`a62ef333`) | saída 1, `1 failed \| 3 passed (4)`: "falls back to atendly_csrf when avenly_csrf is absent" (prova 7) | saída 0, `4 passed (4)` |
| 7 | tirar a reserva `ATENDLY_*` de `readLegalEnvironment` | `apps/frontend/src/config/legal-details.ts` (`321d5f24`) | saída 1, `3 failed \| 14 passed (17)`: "só o nome antigo configurado ainda vale", "um valor novo em branco cai para o antigo", "a indexação dos documentos lê o nome novo e o antigo" (prova 8) | saída 0, `17 passed (17)` |
| 11 | tirar `"ATENDLY"` do `calendarSourceSchema` do **BFF** | `apps/bff/src/lib/calendar-source.ts` (`df9a43c6`) | saída 1, `2 failed` (rodada 2, FIX-001, de 23): "PATCH /v1/onboarding com ATENDLY chega ao Scheduling como AVENLY" e "as leituras devolvem AVENLY" com o Scheduling respondendo `ATENDLY`, que agora também cobre `GET /v1/dashboard` (prova 5) | saída 0, `23 passed (23)` |
| 12 | os controles 1 e 11 juntos | `schemas.ts` (`2d299647`) e `calendar-source.ts` (`df9a43c6`) | saída 1, `7 failed` (rodada 2, FIX-001, de 23): os 5 casos do controle 1 e os 2 do controle 11 | saída 0, `23 passed (23)` |

**O controle 1 do Goal diz "as provas 4 e 5 reprovam", mas feito só no contrato ele reprova só a prova 4.** O BFF tem o seu próprio `calendarSourceSchema` (`apps/bff/src/lib/calendar-source.ts`) e não importa o do pacote, então tirar `"ATENDLY"` só do contrato não mexe na prova 5. Os controles 11 e 12 foram acrescentados para cobrir a prova 5; os dois reprovam com o defeito e passam sem ele. Cabe ao Tech Lead decidir se isso basta ou se o controle 1 é reescrito para tocar os dois schemas.

**Rodada 2 (FIX-001), controles 1, 11 e 12 refeitos depois da edição do teste.** O arquivo `apps/bff/tests/goal109-avenly-calendar-source.test.ts` passou de 14 para 23 testes: a prova 4 agora faz o parse com os quatro schemas do contrato que usam `calendarSourceSchema` (`calendarStateSchema`, `onboardingStateSchema`, `customerListSchema` e `serviceListSchema`), com as fontes `ATENDLY` e `AVENLY`, e confere `AVENLY`; um caso recusa `EXTERNAL` nos quatro. A prova 5 passou a cobrir `GET /v1/dashboard` (caminho `data.scheduling.data.calendar.source`). Os três controles rodaram com sha256 conferido antes e depois (`2d299647` para `schemas.ts`, `df9a43c6` para `calendar-source.ts`, os dois iguais), com recompilação e cópia do `dist` do contrato nos controles 1 e 12. Resultado: controle 1 com 5 falhas, controle 11 com 2 e controle 12 com 7; sem o defeito, 23 passam. Portanto o controle 1 agora reprova também os casos novos da prova 4, e não só o decodificador isolado.

### Inventário do §7 (WU-14)

Comando: `git grep -n --untracked -e '"ATENDLY"' -e "'ATENDLY'" -e 'atendly_session' -e 'atendly_csrf' -e 'ATENDLY_' -e 'atendly:brand' -- apps packages scripts`, na árvore da WU-14, refeito na rodada 2 (FIX-001) depois de acrescentar ao teste do BFF os casos da prova 4 (a rodada 1 tinha **143** linhas, com **85** em (iii)). A saída tem **144** linhas (90 em arquivos rastreados e 54 em arquivos novos, ainda não rastreados, do Goal109), **todas classificadas, sem resto**: **30** em (i), **19** em (ii), **86** em (iii), **6** em (iv) e **3** em (v) (30 + 19 + 86 + 6 + 3 = 144). As colunas dizem arquivo, números de linha e motivo. Os pontos de julgamento estão em D-120. Esta é a lista de exceções que o 102 herda para o critério `git grep -i atendly`.

**Classe (i) migration antiga, que não pode mudar (ou ensaio que monta o estado legado que ela lê): 30 linhas em 10 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/ai-orchestrator/prisma/migrations/20260908120000_goal005_contact_session_human_control/migration.sql` | 24 | migration antiga (Goal005) |
| `apps/ai-orchestrator/prisma/migrations/20261003120000_goal109_avenly_human_control_source/migration.sql` | 19, 21 | migration deste Goal: o RENAME precisa nomear o rótulo antigo e ela é imutável depois de aplicada |
| `apps/scheduling-service/prisma/migrations/20260828175825_init/migration.sql` | 2 | migration antiga (init) |
| `apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql` | 36, 42, 44, 52 | migration antiga (Goal027) |
| `apps/scheduling-service/prisma/migrations/20261003120000_goal109_avenly_calendar_source/migration.sql` | 27, 29 | migration deste Goal: o RENAME precisa nomear o rótulo antigo e ela é imutável depois de aplicada |
| `scripts/goal006-ai-migration-rehearsal.mjs` | 93 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal009-migration-rehearsal.mjs` | 95, 222, 223 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal010-migration-rehearsal.mjs` | 117, 205, 206, 207, 208, 209, 210 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal027-calendar-source-migration-rehearsal.mjs` | 125, 191, 197, 198, 199, 423, 438 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal074-human-takeover-migration-rehearsal.mjs` | 112, 250 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |

**Classe (ii) constante ou ramo de legado de (b), (d), (e) ou (f): 19 linhas em 11 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/bff/.env.example` | 14 | (d) documenta a leitura dos nomes antigos |
| `apps/bff/PUBLIC_API_V1.md` | 46, 48, 50, 111 | (b) e (d) documentam a aceitação do valor e dos nomes antigos |
| `apps/bff/src/lib/auth.ts` | 39, 40 | (d) constantes legadas dos nomes de cookie |
| `apps/bff/src/lib/calendar-source.ts` | 8 | (b) constante legada do BFF |
| `apps/frontend/.env.example` | 5 | (e) documenta a leitura dos nomes ATENDLY_* |
| `apps/frontend/scripts/check-legal-config.mjs` | 16, 21 | (e) reserva ATENDLY_* no verificador .mjs e comentário dela |
| `apps/frontend/src/config/legal-details.ts` | 31, 36 | (e) reserva ATENDLY_* e comentário dela |
| `apps/frontend/src/data/http/BffHttpClient.ts` | 81, 94 | (d) constante e docstring do nome legado do cookie CSRF |
| `apps/frontend/src/shared/ui/Brand.tsx` | 16, 17 | (f) chaves legadas do localStorage |
| `apps/scheduling-service/src/modules/internal-api/routes.ts` | 116 | (b) constante legada do Scheduling |
| `packages/public-api-contract/src/schemas.ts` | 5 | (b) constante legada do contrato |

**Classe (iii) teste que prova a compatibilidade: 86 linhas em 28 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/ai-orchestrator/tests/integration/goal109-avenly-human-control-source.test.ts` | 39, 186, 198, 200, 209, 219 | prova nova do Goal109 |
| `apps/bff/tests/customer-identity.integration.test.ts` | 131 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` | 25, 32, 215, 235, 309, 347 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal019-ai-activation-reconciliation.integration.test.ts` | 157 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal022-notification-center.integration.test.ts` | 84, 171 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal022-notification-engine.test.ts` | 48 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal022-notification-rules.test.ts` | 272 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal027-onboarding-issues.test.ts` | 52, 82 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal029-timezone-contract.integration.test.ts` | 104, 148 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal029-timezone-propagation.integration.test.ts` | 51 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal029-timezone-read-reconciliation.integration.test.ts` | 87 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal036-response-contract-undeclared-key.test.ts` | 38, 118 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal036-wu02-declared-fields.test.ts` | 110 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal059-whatsapp-status.integration.test.ts` | 53 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal060-integration-connect.test.ts` | 62 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal063-ai-activation.integration.test.ts` | 101 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal065-onboarding.integration.test.ts` | 58 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal067-pause-and-profile.integration.test.ts` | 81 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal073-settings-policy-and-agenda-view.integration.test.ts` | 48 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal075-customers-contract.integration.test.ts` | 39, 255 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal077-ai-activated-notification.integration.test.ts` | 77 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal109-avenly-calendar-source.test.ts` | 31, 51, 145, 168, 234, 277 | prova nova do Goal109 |
| `apps/bff/tests/goal109-legacy-session-cookie.integration.test.ts` | 21, 29, 30, 85, 102 | prova nova do Goal109 |
| `apps/frontend/tests/goal109-avenly-values.test.tsx` | 8, 75, 196, 203, 222, 223, 233, 241, 249, 250, 267, 285, 298, 319, 323, 331 | prova nova do Goal109 |
| `apps/frontend/tests/goal109-csrf-cookie.test.ts` | 9, 17, 65, 66, 72 | prova nova do Goal109 |
| `apps/frontend/tests/service-schema.test.ts` | 64 | teste existente que envia ATENDLY ao schema do contrato e passa a provar (b) |
| `apps/scheduling-service/tests/integration/goal109-avenly-calendar-source.test.ts` | 153, 154, 157, 158, 177, 187, 210, 211, 243, 320, 328 | prova nova do Goal109 |
| `apps/scheduling-service/tests/unit/goal029-calendar-timezone.test.ts` | 142, 147, 162, 178, 197, 220 | teste existente que envia ATENDLY à rota interna e passa a provar (b) |

**Classe (iv) script que segue enviando o valor antigo por (g): 6 linhas em 4 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `scripts/goal030-mvp-journey-rehearsal.mjs` | 1336 | mesmo papel de (g): ensaio que segue enviando ATENDLY em PATCH /v1/onboarding |
| `scripts/goal033-authenticated-ui-rehearsal.mjs` | 1279, 1611 | (g) envia ATENDLY no gate autenticado |
| `scripts/lib/visual-seed.mjs` | 102, 244 | (g) envia ATENDLY no visual:compare |
| `scripts/tests/final-production-audit-legacy-regression.test.mjs` | 214 | fixture textual de teste do audit estático, sem decodificar nada; segue com o valor antigo até o 102 |

**Classe (v) comentário histórico que descreve o que uma migração antiga fez: 3 linhas em 3 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/bff/PUBLIC_API_V1.md` | 107 | texto histórico do Goal027 sobre calendar.source, mantido e marcado como histórico |
| `apps/scheduling-service/src/modules/internal-api/routes.ts` | 1945 | comentário histórico: o que o Goal027 fez nas capabilities |
| `apps/scheduling-service/tests/unit/goal027-calendar-guard.test.ts` | 20 | comentário histórico: o que o Goal027 fez nas capabilities |

### Execuções que sustentam cada contagem

| Contagem | Execução |
| --- | --- |
| Baseline: `test:gate` 242, IA sem banco 1188 passaram e 98 pulados, Scheduling unitários 534, integração do Scheduling 145 e do BFF 477 | WU-01 (`HEAD` `27ede84`) |
| Vermelho das provas: 30 reprovam e 22 passam de 52 | WU-01 a WU-04; a prova 7 de novo na WU-14 |
| Vermelho das provas na rodada 2: 38 reprovam e 23 passam de 61 (os 9 testes novos da prova 4: 8 reprovam e 1 passa) | FIX-001, `schemas.ts` de `HEAD` |
| Typecheck de `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff` e `apps/frontend`: saída 0 | WU-05 a WU-08 (`code-v1:5dabbe93…`) |
| `vitest run goal109` em `apps/frontend`: 2 arquivos e 21 testes, saída 0 | WU-09 (`5dabbe93…`) |
| `test:gate`: 242 testes, `pass 242` | WU-10 (`5dabbe93…`) |
| `validate:core`, primeira execução: saída 1, `assistant.service.test.ts` com 2 testes reprovados (`expected [ …(210) ] to have a length of 209 but got 210`) | WU-11 (`5dabbe93…`) |
| `validate:core`: saída 0, 17 passos, 15 passaram, 2 pulados (`test:bff`, `test:health-worker`), em 102984 ms | WU-11, segunda execução (`code-v1:8c0dd57d…`, depois da `DIAG-001`) |
| `validate:ui`: saída 0, 169 passaram, 21 pulados, 0 retentativas | WU-12 (`8c0dd57d…`); `results.json` com `expected` 169, `skipped` 21, `unexpected` 0, `flaky` 0 |
| `validate:integration`: saída 0 em 717054 ms, 36 de 36 passos; gate autenticado 275 passaram, 0 retentativas | WU-13 (`8c0dd57d…`); `results.json` com `expected` 275, `unexpected` 0, `flaky` 0 |
| Suíte do frontend: 149 arquivos e 1840 testes | WU-04 e WU-14 (`npx vitest run`) |
| Os controles 1 a 7, 11 e 12 e o inventário de 143 linhas | WU-14 (rodada 1); controles 1, 11 e 12 e o inventário, agora de 144 linhas, refeitos na FIX-001 (rodada 2) |
| `vitest run goal109-avenly-calendar-source` em `apps/bff`, contra um PostgreSQL de teste local: 23 passaram de 23 | FIX-001 (rodada 2), árvore final |
| Typecheck de `apps/bff` depois da edição do teste: saída 0 | FIX-001 (rodada 2) |
| `validate:core`: saída 0, 17 passos, 15 passaram, 2 pulados; suíte do frontend com 149 arquivos e 1840 testes | FIX-001 (rodada 2), depois da edição do teste e dos documentos |
| `validate:integration`: saída 0 em 711 s, 36 de 36 passos; integração do BFF com 507 testes; gate autenticado com 275 passaram, sem retentativa nem teste instável | FIX-001 (rodada 2), depois da edição do teste e dos documentos |

`DIAG-001`: a primeira execução de `validate:core` falhou porque as duas asserções "209 arquivos `.ts`" de `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` não contavam o arquivo novo `apps/bff/src/lib/calendar-source.ts`. A correção trocou 209 por 210 nas duas e atualizou os títulos, sem tocar `scripts/validate-core.mjs`, sem remover nem afrouxar asserção. Os dois resultados de `validate:core` ficam registrados acima; o primeiro não foi apagado.

### Estado da árvore

O `git status --porcelain=v1 -uall` da WU-14, antes e depois dos controles, tem o mesmo md5 (`87ea5ece…`) e 172 entradas: 163 modificadas e 9 novas, sem resto de controle negativo. Na rodada 2 (FIX-001), a árvore tem 175 entradas: 166 modificadas e 9 novas. As 3 a mais que na WU-14 são os 3 documentos desta seção (`DECISIONS.md`, `CURRENT_STATE.md` e este arquivo); o arquivo de teste do BFF já era uma das 9 novas. Sem resto de controle negativo. Nenhuma migration existente, nenhum CSS, nenhum arquivo de `e2e/` e nenhuma configuração de gate (`vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts`, `next.config.ts`) aparece como modificado. Os documentos desta WU entram por acréscimo: `docs/migration/DECISIONS.md` (D-120), `CURRENT_STATE.md` e este arquivo.

Ambiente da rodada 2: `validate:integration` precisa de um PostgreSQL nativo, em loopback, com nome de banco com "test" e com a extensão `vector` (o ensaio `rehearse:goal028-release-migrations` recusa um servidor sem ela). O PostgreSQL de `C:\Program Files\PostgreSQL8` não tem `vector`; foi usado o de `AppData\Local\Programs\PostgreSQL8\pgsql`, em cluster temporário numa porta própria. Um contêiner Docker com porta mapeada não serve: o servidor reporta um endereço que não é loopback. O banco de desenvolvimento `atendly_postgres_dev` (porta 5555) não foi tocado.

### Não feito

O deploy real no Render e a medida da janela de D-120 (h). O texto legal com os valores reais do ambiente de deploy. Um navegador real com um cookie `atendly_session` emitido antes do deploy. A troca de nome em texto, identificador, arquivo e documentação (102). Remover o valor antigo de vez.

**Nota de fechamento — review109, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-120 ACCEPTED na rodada 3, sem blocker, depois de 4 blockers na rodada 1 (provas 4 e 5 incompletas, evidência a refazer e a janela de escrita) e 3 na rodada 2 (documento). A rodada 3 (FIX-001) mudou só D-120 e a seção do Goal109 de CURRENT_STATE.
- **Gates do IA Loop na rodada 2,** reaproveitados na rodada 3 porque nenhum arquivo fora de `docs/` mudou e a impressão digital de código continua `code-v1:2d3cbafe…`. Todos com exit 0: typecheck de `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` (WU-05 a WU-08), testes dirigidos do frontend (WU-09), `test:gate` (WU-10), `validate:core` (WU-11, 102479 ms), `validate:ui` (WU-12, 49089 ms) e `validate:integration` (WU-13, 716049 ms). Na rodada 3, só `git diff --check` (WU-15) rodou de novo, com exit 0. A execução de 711 s da tabela acima é a da FIX-001 da rodada 2, na mesma árvore de código.
- **Conferência do Tech Lead.** Na rodada 2, ele reexecutou `apps/bff/tests/goal109-avenly-calendar-source.test.ts` sem banco: 18 passam e 5 de integração ficam pulados, de 23. Na rodada 3, refez o `git grep` do inventário: 90 linhas em arquivos rastreados e 54 em arquivos novos, total **144**, igual ao registrado. Conferiu também a janela de escrita contra `git show HEAD` (`internal-api/routes.ts:112`). O vermelho da baseline e os controles foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Controle 1.** O Tech Lead aceita o controle 1 como o Goal o escreve. Ele não alcança a prova 5 porque o BFF tem schema próprio, e os controles 11 e 12 a cobrem.
- **Aceito sem prova completa.** O deploy real e a duração das janelas; uma sessão anterior ao deploy num navegador real; o texto legal com os valores reais do ambiente; os controles 2 a 7 e o vermelho das provas 1 a 3 e 5 a 8, que são da rodada 1; a contagem por arquivo da prova 2 dentro de `validate:integration`. Detalhe no [review109](reviews/109-review.md).

## As credenciais derivadas passam a Avenly, do Goal110

Texto do Goal110 ([D-121](DECISIONS.md), `PROPOSED`), escrito pela WU-08 da rodada 1, por acréscimo, depois da execução final. Toda contagem diz a execução que a sustenta. A recontagem da baseline, o vermelho das provas e os resultados de typecheck, `validate:core` e `validate:integration` são das WU-01 a WU-07, lidos do resultado delas no armazenamento do IA Loop (os relatórios guardados vêm truncados, e por isso as contagens finais foram medidas de novo na WU-08). Os controles do §5, os inventários do §4 e a recontagem final são da WU-08. Nenhuma seção de outro Goal foi editada.

### Recontagem da baseline (WU-01, `HEAD` `23dd6e7`, antes de editar código de produção)

`test:ai-orchestrator` sem banco: `Test Files 94 passed | 14 skipped (108)` e `Tests 1188 passed | 101 skipped (1289)`. `test:scheduling-service` (unitários): 39 arquivos e 534 testes. `test:bff`: passo pulado no `validate:core` ("only the integration suite exists"). `test:bff-integration`: 66 arquivos e 507 testes, igual ao review109. `test:scheduling-integration`: 20 arquivos e 152 testes. Frontend: 149 arquivos e 1840 testes e `test:gate` 242 (D-120, medidos de novo na WU-08, abaixo).

### As quatro provas e o vermelho da baseline

Quatro provas, 28 testes, todas em arquivos novos `goal110-…`. Nenhum teste existente foi alterado. O vermelho vem do código de produção intocado (WU-01 para as provas 1 a 3; WU-02, com `session.ts` e `auth.ts` de `HEAD`, para a prova 4). **15 reprovam e 13 passam.**

| Prova | Arquivo | Testes | Na baseline | Partes que passam na baseline, e por quê |
| --- | --- | --- | --- | --- |
| 1, Scheduling | `apps/scheduling-service/tests/unit/goal110-internal-credential-label.test.ts` | 9 | 3 reprovam, 6 passam | Passam as que protegem o comportamento de hoje: token antigo para outra audiência, para outro uso e para chamador desconhecido (`401`), rótulo sem relação (`401`), segredo bruto (`401`) e a credencial explícita do BFF exclusiva. Reprovam "derives with the new label by default" e as duas de "identifies … by the new and the old label" (`avenly:internal:v1: expected 401 to be 200`). |
| 2, IA, e o lado da IA da prova 3 | `apps/ai-orchestrator/tests/security/goal110-internal-credential-label.test.ts` | 11 | 5 reprovam, 6 passam | Passam: `401` para o token antigo de outro chamador, de outra audiência e sem o uso, `403` para audiência declarada divergente, `401` para o segredo bruto e "keeps the old label only in the verifier's credential module" (o rótulo antigo já está só em `lib/internal-credentials.ts`). Reprovam: a derivação com o rótulo novo por padrão, "accepts provisioning and command tokens derived with either label" (`401` em vez de `200`), "answers 403 for the provisioning token on a command route and the reverse, with either label" (`401` em vez de `403`), "keeps an explicit credential exclusive for its use" e "sends the scheduling-service/command credential with the new label". |
| 3, BFF | `apps/bff/tests/goal110-internal-credential-label.test.ts` | 5 | 5 reprovam | Nenhuma parte passa: a derivação, os três pares captados no `fetch` simulado (ai-orchestrator/provisioning, ai-orchestrator/command, scheduling-service/command) e a varredura "has no production code in the BFF that derives with the old label" (`expected [ 'lib\internal-credentials.ts' ] to deeply equal []`). |
| 4, CSRF, PostgreSQL real | `apps/bff/tests/goal110-csrf-label.integration.test.ts` | 3 | 2 reprovam, 1 passa | Reprovam "stores the hash of the avenly:csrf: token on login" e "refuses an old-label token on a new session" (`expected 200 to be 403`). Passa "hands an old-label session its old token on a read, without Set-Cookie or any change to the row, and accepts it on a mutation", porque o comportamento de hoje já devolve o token antigo; o teste existe para a mudança não quebrá-lo. |

Depois da implementação: prova 1 `9 passed (9)`, prova 2 `11 passed (11)`, prova 3 `5 passed (5)` e prova 4 `3 passed (3)` (WU-01, WU-02 e WU-08).

### Os seis controles negativos do §5 (WU-08, depois da última edição de código)

Cada controle copia o arquivo, muda **uma linha**, roda a prova com `npx vitest run`, restaura o arquivo da cópia e confere o sha256. O sha256 (oito primeiros caracteres) é **igual** antes e depois em todos. A prova 4 (controles 5 e 6) rodou contra um PostgreSQL 18 nativo, temporário, em `127.0.0.1:5558`, com as migrations do BFF aplicadas. Saída real, linhas de relatório do vitest.

| # | Defeito | Arquivo (sha256) | Com o defeito | Sem o defeito |
| --- | --- | --- | --- | --- |
| 1 | tirar o rótulo antigo da lista de candidatos do Scheduling (`[INTERNAL_DERIVATION_PREFIX].map(`) | `apps/scheduling-service/src/shared/auth/internal-credentials.ts` (`4579fe17`) | prova 1, saída 1, `3 failed \| 6 passed (9)`: "identifies bff by the new and the old label", "identifies ai-orchestrator by the new and the old label" (`atendly:internal:v1: expected 401 to be 200`) e "keeps an explicit BFF credential exclusive for the BFF" | `9 passed (9)` |
| 2 | tirar o rótulo antigo da lista de candidatos da IA | `apps/ai-orchestrator/src/lib/internal-credentials.ts` (`aa6d5b51`) | prova 2, saída 1, `3 failed \| 8 passed (11)`: "accepts provisioning and command tokens derived with either label", "answers 403 for the provisioning token on a command route and the reverse, with either label" e "keeps an explicit credential exclusive for its use" | `11 passed (11)` |
| 3 | derivar o token legado da IA sem o uso (`${prefix}:${caller}:${audience}` só para o rótulo antigo) | `apps/ai-orchestrator/src/lib/internal-credentials.ts` (`aa6d5b51`) | prova 2, saída 1, `4 failed \| 7 passed (11)`: os três casos do controle 2 e "answers 401 for the old-label token derived without the use" (`expected 403 to be 401`) | `11 passed (11)` |
| 4 | voltar o prefixo do BFF para `atendly:internal:v1` | `apps/bff/src/lib/internal-credentials.ts` (`570c818a`) | prova 3, saída 1, `5 failed (5)`: a derivação, os três pares no `fetch` simulado e a varredura de `src` | `5 passed (5)` |
| 5 | o token devolvido à sessão sempre do rótulo novo (`if (current) return current;`) | `apps/bff/src/lib/session.ts` (`907ad52a`) | prova 4, saída 1, `1 failed \| 2 passed (3)`: "hands an old-label session its old token…" (`expected 'CPBw86Cd…' to be 'EohRFGT1…'`) | `3 passed (3)` |
| 6 | regravar `csrfTokenHash` com o hash do rótulo novo na leitura (`sessionCsrfToken` atualiza a linha de `UserSession`) | `apps/bff/src/lib/auth.ts` (`8d6562b0`) | prova 4, saída 1, `1 failed \| 2 passed (3)`: o mesmo teste, em `expected { …(8) } to deeply equal { …(8) }`, a igualdade da linha antes e depois | `3 passed (3)` |

**Variante do controle 3.** O Goal diz "sem o uso (ou sem a audiência)". A tabela traz a variante "sem o uso". A variante "sem a audiência" (`${prefix}:${caller}:${use}` só para o rótulo antigo), medida à parte, reprova a prova 2 em `3 failed | 8 passed (11)`: os três casos de aceitação do controle 2, porque o token legado derivado sem a audiência deixa de ser o que a IA espera. Os dois arquivos voltaram ao sha256 `aa6d5b51` depois de cada variante.

**Restauração.** Os cinco arquivos de produção tocados pelos controles (`4579fe17`, `aa6d5b51`, `570c818a`, `907ad52a` e `8d6562b0`; o da IA, `aa6d5b51`, nos controles 2 e 3) voltaram ao sha256 de antes de cada controle. O sha256 dos nove arquivos de código e de teste do Goal (cinco de produção e quatro provas) foi calculado antes e depois dos controles e é idêntico (`aa6d5b51`, `8d6562b0`, `570c818a`, `907ad52a` e `4579fe17` nos de produção; `a51f69b8`, `2af81d4d`, `f78f3eb0` e `97e51d3e` nas provas, na ordem dos arquivos do `git status`). O defeito do controle 6 grava a linha por um `import()` dinâmico, sem esperar a escrita (a função que ele altera é síncrona); a escrita terminou antes da asserção nas duas execuções, e a prova reprova na igualdade da linha, não por erro de importação.

### Inventário (A) do §4: o comando de D-120 (i)

Comando: `git grep -n -e '"ATENDLY"' -e "'ATENDLY'" -e 'atendly_session' -e 'atendly_csrf' -e 'ATENDLY_' -e 'atendly:brand' -- apps packages scripts`, na árvore da WU-08, com e sem `--untracked`. A saída tem **144** linhas, todas rastreadas (o Goal109 foi commitado), **todas classificadas, sem resto**: **30** em (i), **19** em (ii), **86** em (iii), **6** em (iv) e **3** em (v) (30 + 19 + 86 + 6 + 3 = 144).

**Diferença em relação às 144 linhas do Goal109: nenhuma.** Comparada com a saída do mesmo comando no commit `2d1410c` (`git grep … 2d1410c -- apps packages scripts`), a lista tem os mesmos 144 pares arquivo e linha e o mesmo texto de cada linha (a comparação ignora o fim de linha). Nenhuma das 28 provas novas nem os cinco arquivos de produção alterados contém um dos seis padrões, então nada entrou nem saiu. A classificação é a do Goal109, copiada abaixo, sem mudança de classe.

**Classe (i) migration antiga, que não pode mudar (ou ensaio que monta o estado legado que ela lê): 30 linhas em 10 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/ai-orchestrator/prisma/migrations/20260908120000_goal005_contact_session_human_control/migration.sql` | 24 | migration antiga (Goal005) |
| `apps/ai-orchestrator/prisma/migrations/20261003120000_goal109_avenly_human_control_source/migration.sql` | 19, 21 | migration deste Goal: o RENAME precisa nomear o rótulo antigo e ela é imutável depois de aplicada |
| `apps/scheduling-service/prisma/migrations/20260828175825_init/migration.sql` | 2 | migration antiga (init) |
| `apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql` | 36, 42, 44, 52 | migration antiga (Goal027) |
| `apps/scheduling-service/prisma/migrations/20261003120000_goal109_avenly_calendar_source/migration.sql` | 27, 29 | migration deste Goal: o RENAME precisa nomear o rótulo antigo e ela é imutável depois de aplicada |
| `scripts/goal006-ai-migration-rehearsal.mjs` | 93 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal009-migration-rehearsal.mjs` | 95, 222, 223 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal010-migration-rehearsal.mjs` | 117, 205, 206, 207, 208, 209, 210 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal027-calendar-source-migration-rehearsal.mjs` | 125, 191, 197, 198, 199, 423, 438 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |
| `scripts/goal074-human-takeover-migration-rehearsal.mjs` | 112, 250 | ensaio de migration antiga: monta o estado legado que a migration antiga lê |

**Classe (ii) constante ou ramo de legado de (b), (d), (e) ou (f): 19 linhas em 11 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/bff/.env.example` | 14 | (d) documenta a leitura dos nomes antigos |
| `apps/bff/PUBLIC_API_V1.md` | 46, 48, 50, 111 | (b) e (d) documentam a aceitação do valor e dos nomes antigos |
| `apps/bff/src/lib/auth.ts` | 39, 40 | (d) constantes legadas dos nomes de cookie |
| `apps/bff/src/lib/calendar-source.ts` | 8 | (b) constante legada do BFF |
| `apps/frontend/.env.example` | 5 | (e) documenta a leitura dos nomes ATENDLY_* |
| `apps/frontend/scripts/check-legal-config.mjs` | 16, 21 | (e) reserva ATENDLY_* no verificador .mjs e comentário dela |
| `apps/frontend/src/config/legal-details.ts` | 31, 36 | (e) reserva ATENDLY_* e comentário dela |
| `apps/frontend/src/data/http/BffHttpClient.ts` | 81, 94 | (d) constante e docstring do nome legado do cookie CSRF |
| `apps/frontend/src/shared/ui/Brand.tsx` | 16, 17 | (f) chaves legadas do localStorage |
| `apps/scheduling-service/src/modules/internal-api/routes.ts` | 116 | (b) constante legada do Scheduling |
| `packages/public-api-contract/src/schemas.ts` | 5 | (b) constante legada do contrato |

**Classe (iii) teste que prova a compatibilidade: 86 linhas em 28 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/ai-orchestrator/tests/integration/goal109-avenly-human-control-source.test.ts` | 39, 186, 198, 200, 209, 219 | prova nova do Goal109 |
| `apps/bff/tests/customer-identity.integration.test.ts` | 131 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` | 25, 32, 215, 235, 309, 347 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal019-ai-activation-reconciliation.integration.test.ts` | 157 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal022-notification-center.integration.test.ts` | 84, 171 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal022-notification-engine.test.ts` | 48 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal022-notification-rules.test.ts` | 272 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal027-onboarding-issues.test.ts` | 52, 82 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal029-timezone-contract.integration.test.ts` | 104, 148 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal029-timezone-propagation.integration.test.ts` | 51 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal029-timezone-read-reconciliation.integration.test.ts` | 87 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal036-response-contract-undeclared-key.test.ts` | 38, 118 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal036-wu02-declared-fields.test.ts` | 110 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal059-whatsapp-status.integration.test.ts` | 53 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal060-integration-connect.test.ts` | 62 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal063-ai-activation.integration.test.ts` | 101 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal065-onboarding.integration.test.ts` | 58 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal067-pause-and-profile.integration.test.ts` | 81 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal073-settings-policy-and-agenda-view.integration.test.ts` | 48 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal075-customers-contract.integration.test.ts` | 39, 255 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal077-ai-activated-notification.integration.test.ts` | 77 | teste existente que envia ATENDLY como entrada do decodificador e passa a provar (b) |
| `apps/bff/tests/goal109-avenly-calendar-source.test.ts` | 31, 51, 145, 168, 234, 277 | prova nova do Goal109 |
| `apps/bff/tests/goal109-legacy-session-cookie.integration.test.ts` | 21, 29, 30, 85, 102 | prova nova do Goal109 |
| `apps/frontend/tests/goal109-avenly-values.test.tsx` | 8, 75, 196, 203, 222, 223, 233, 241, 249, 250, 267, 285, 298, 319, 323, 331 | prova nova do Goal109 |
| `apps/frontend/tests/goal109-csrf-cookie.test.ts` | 9, 17, 65, 66, 72 | prova nova do Goal109 |
| `apps/frontend/tests/service-schema.test.ts` | 64 | teste existente que envia ATENDLY ao schema do contrato e passa a provar (b) |
| `apps/scheduling-service/tests/integration/goal109-avenly-calendar-source.test.ts` | 153, 154, 157, 158, 177, 187, 210, 211, 243, 320, 328 | prova nova do Goal109 |
| `apps/scheduling-service/tests/unit/goal029-calendar-timezone.test.ts` | 142, 147, 162, 178, 197, 220 | teste existente que envia ATENDLY à rota interna e passa a provar (b) |

**Classe (iv) script que segue enviando o valor antigo por (g): 6 linhas em 4 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `scripts/goal030-mvp-journey-rehearsal.mjs` | 1336 | mesmo papel de (g): ensaio que segue enviando ATENDLY em PATCH /v1/onboarding |
| `scripts/goal033-authenticated-ui-rehearsal.mjs` | 1279, 1611 | (g) envia ATENDLY no gate autenticado |
| `scripts/lib/visual-seed.mjs` | 102, 244 | (g) envia ATENDLY no visual:compare |
| `scripts/tests/final-production-audit-legacy-regression.test.mjs` | 214 | fixture textual de teste do audit estático, sem decodificar nada; segue com o valor antigo até o 102 |

**Classe (v) comentário histórico que descreve o que uma migração antiga fez: 3 linhas em 3 arquivos.**

| Arquivo | Linhas | Motivo |
| --- | --- | --- |
| `apps/bff/PUBLIC_API_V1.md` | 107 | texto histórico do Goal027 sobre calendar.source, mantido e marcado como histórico |
| `apps/scheduling-service/src/modules/internal-api/routes.ts` | 1945 | comentário histórico: o que o Goal027 fez nas capabilities |
| `apps/scheduling-service/tests/unit/goal027-calendar-guard.test.ts` | 20 | comentário histórico: o que o Goal027 fez nas capabilities |

### Inventário (B) do §4: o código de produção

Comando: `git grep -n --untracked -i -e 'atendly:' -e '"atendly' -e "'atendly" -e '`atendly' -- 'apps/*/src/**' 'apps/evolution-go/**' 'packages/**' ':!**/*.test.*' ':!**/*_test.go' ':!**/tests/**' ':!**/*.md'`, na árvore da WU-08. A saída tem **40** linhas (a mesma com e sem `--untracked`: os quatro arquivos novos do Goal estão sob `tests/`, excluídos pelo comando), **todas classificadas, sem resto**: **12** em (ii), **1** em (v), **3** em (vi) e **24** em (vii) (12 + 1 + 3 + 24 = 40). Nenhuma linha está em (i), (iii) ou (iv), que são classes de migration, de teste e de script, fora do alcance do comando. **(vi)** é a constante de rótulo legado deste Goal, no máximo uma por app; **(vii)** é o literal que não é gravado como chave, não entra em cálculo e não é conferido por outro serviço.

| Classe | Arquivo | Linha | Motivo |
| --- | --- | --- | --- |
| (vii) | `apps/ai-orchestrator/src/config/platform-whatsapp.ts` | 6 | comentário da configuração do número oficial |
| (vii) | `apps/ai-orchestrator/src/config/platform-whatsapp.ts` | 78 | mensagem de erro de configuração |
| (vi) | `apps/ai-orchestrator/src/lib/internal-credentials.ts` | 27 | `LEGACY_INTERNAL_DERIVATION_PREFIX` da IA, a constante de rótulo legado do verificador |
| (vii) | `apps/ai-orchestrator/src/modules/activation-test/ActivationTestAiDriver.ts` | 245 | nome do cliente do teste de ativação; enviado como `customerName`, não é chave |
| (vii) | `apps/ai-orchestrator/src/modules/activation-test/ActivationTestRunStore.ts` | 315 | nome do contato do teste de ativação; gravado como `displayName`, não é chave |
| (vii) | `apps/ai-orchestrator/src/modules/scheduling-service/types.ts` | 419 | comentário que cita `AtendlyCalendarProvider` |
| (ii) | `apps/bff/src/lib/auth.ts` | 39 | (d) constante legada do nome do cookie de sessão (D-120) |
| (ii) | `apps/bff/src/lib/auth.ts` | 40 | (d) constante legada do nome do cookie de CSRF (D-120) |
| (ii) | `apps/bff/src/lib/calendar-source.ts` | 8 | (b) constante legada do BFF (D-120) |
| (vi) | `apps/bff/src/lib/session.ts` | 35 | `LEGACY_CSRF_LABEL` do BFF, o rótulo legado do token de CSRF |
| (vii) | `apps/bff/src/modules/whatsapp/routes.ts` | 221 | prefixo de reserva do nome da instância (mais 4 bytes aleatórios), não é chave |
| (vii) | `apps/bff/src/modules/whatsapp/routes.ts` | 431 | mesmo prefixo de reserva, no `slug`, não é chave |
| (vii) | `apps/bff/src/routes/health.ts` | 12 | rótulo de saúde `service`, não gravado nem lido por consumidor |
| (vii) | `apps/evolution-go/pkg/routes/routes.go` | 85 | rótulo de saúde `service`, não gravado nem lido por consumidor |
| (vii) | `apps/frontend/src/app/(platform)/layout.tsx` | 39 | título de tela |
| (vii) | `apps/frontend/src/app/health/route.ts` | 10 | rótulo de saúde `service`, não gravado nem lido por consumidor |
| (vii) | `apps/frontend/src/app/layout.tsx` | 9 | título de página |
| (ii) | `apps/frontend/src/config/legal-details.ts` | 31 | (e) comentário da reserva `ATENDLY_*` (D-120) |
| (ii) | `apps/frontend/src/config/legal-details.ts` | 36 | (e) reserva `ATENDLY_*` (D-120) |
| (vii) | `apps/frontend/src/content/legal/terms-of-use.pt-BR.ts` | 30 | texto legal visível |
| (ii) | `apps/frontend/src/data/http/BffHttpClient.ts` | 81 | (d) constante legada do cookie de CSRF do frontend (D-120) |
| (ii) | `apps/frontend/src/data/http/BffHttpClient.ts` | 94 | (d) docstring do nome legado do cookie de CSRF (D-120) |
| (vii) | `apps/frontend/src/features/auth/AuthScreen.tsx` | 76 | `aria-label` de tela |
| (vii) | `apps/frontend/src/features/system/SystemScreen.tsx` | 87 | texto de tela |
| (vii) | `apps/frontend/src/shared/layout/AppShell.tsx` | 121 | título do documento |
| (vii) | `apps/frontend/src/shared/styles/atendly-imports.css` | 3 | comentário de CSS |
| (ii) | `apps/frontend/src/shared/ui/Brand.tsx` | 16 | (f) chave legada do `localStorage` (D-120) |
| (ii) | `apps/frontend/src/shared/ui/Brand.tsx` | 17 | (f) chave legada do `localStorage` (D-120) |
| (vii) | `apps/frontend/src/shared/ui/Brand.tsx` | 129 | `aria-label` de tela |
| (vii) | `apps/frontend/src/shared/ui/RouteAnnouncer.tsx` | 28 | título de rota anunciado |
| (vii) | `apps/frontend/src/shared/ui/RouteAnnouncer.tsx` | 31 | título do documento anunciado |
| (vii) | `apps/scheduling-service/src/modules/appointments/appointment-series-service.ts` | 42 | comentário que cita um nome de classe |
| (vii) | `apps/scheduling-service/src/modules/calendar/calendar-provider.ts` | 314 | comentário |
| (vii) | `apps/scheduling-service/src/modules/calendar/provider-factory.ts` | 8 | comentário que cita um nome de classe |
| (ii) | `apps/scheduling-service/src/modules/internal-api/routes.ts` | 113 | (b) comentário da constante legada do Scheduling (D-120) |
| (ii) | `apps/scheduling-service/src/modules/internal-api/routes.ts` | 116 | (b) constante legada do Scheduling (D-120) |
| (v) | `apps/scheduling-service/src/modules/internal-api/routes.ts` | 1945 | comentário histórico: o que o Goal027 fez nas capabilities (também em (A)) |
| (vii) | `apps/scheduling-service/src/modules/migrations/import-execution-service.ts` | 987 | comentário |
| (vi) | `apps/scheduling-service/src/shared/auth/internal-credentials.ts` | 19 | `LEGACY_INTERNAL_DERIVATION_PREFIX` do Scheduling, a constante de rótulo legado do verificador |
| (ii) | `packages/public-api-contract/src/schemas.ts` | 5 | (b) constante legada do contrato (D-120) |

**Linhas de (vii) gravadas no banco, e se alguma consulta as usa como chave.**

- `ACTIVATION_TEST_CONTACT_NAME` (`ActivationTestRunStore.ts:315`, "Atendly (teste)") é gravada como `displayName` (linha 541) e como `customerName` (linha 552). **Nenhuma consulta a usa como chave:** o único `select` de `displayName` (linha 326) lê a coluna sem filtrar por ela, e `activation-test-cleanup.ts` diz que não usa `pattern` nem `displayName` para achar o que apagar.
- `ACTIVATION_TEST_CLIENT_NAME` (`ActivationTestAiDriver.ts:245`, o mesmo texto) é enviada como `customerName` (linhas 155 e 174) e não aparece em nenhuma condição de busca.
- O nome de reserva `"atendly"` das duas linhas de `whatsapp/routes.ts` (221 e 431) vira o prefixo do nome da instância, seguido de `_` e de 4 bytes aleatórios em hexadecimal; nenhuma busca compara o nome com esse prefixo (a busca `git grep` não acha `startsWith` nem comparação com o literal nos arquivos de produção).
- Os rótulos de saúde (`atendly-ia-bff`, `atendly-ia-frontend`, `atendly-ia-evolution-go`) e os textos de tela não são gravados. Nenhum consumidor que a busca achou em `apps/health-worker/src` e nos scripts de gate lê o campo `service` dos três.

Como nenhuma linha de (vii) é chave de consulta, **nenhuma linha volta ao Tech Lead.**

### A soma de (A) e (B)

(A) tem 144 linhas, (B) tem 40, e **12** estão nas duas (`apps/bff/src/lib/auth.ts:39` e `:40`, `calendar-source.ts:8`, `legal-details.ts:31` e `:36`, `BffHttpClient.ts:81` e `:94`, `Brand.tsx:16` e `:17`, `scheduling-service/.../internal-api/routes.ts:116` e `:1945`, `public-api-contract/src/schemas.ts:5`). A união tem **172** linhas distintas (144 + 40 − 12), conferida por `sort -u` sobre os pares arquivo e linha das duas saídas. É a lista de exceções que o 102 herda para o critério `git grep -i atendly`, somada, nas classes de migration, de teste e de script, à de D-120 (i). O restante de `git grep -i atendly` (texto de tela, documentação, identificadores) é do 102 e não está nesta lista.

### Execuções que sustentam cada contagem

| Contagem | Execução |
| --- | --- |
| Baseline: IA sem banco 1188 passaram e 101 pulados, Scheduling unitários 534, integração do BFF 507 (66 arquivos) e do Scheduling 152 (20 arquivos) | WU-01 (`HEAD` `23dd6e7`) |
| Vermelho das provas 1 a 3: BFF 5 de 5, IA 5 de 11, Scheduling 3 de 9 | WU-01 |
| Vermelho da prova 4: 2 de 3 (`session.ts` e `auth.ts` de `HEAD`) | WU-02 |
| Depois da implementação: IA 1199, Scheduling 543, integração do BFF 512 em 67 arquivos (WU-01), depois 515 em 68 (WU-02) | WU-01 e WU-02 |
| Typecheck dos três apps (`npx tsc --noEmit`), saída 0 | WU-03, WU-04 e WU-05 |
| `validate:core`: saída 0, 129016 ms, 17 passos, 15 passaram, 2 pulados | WU-06 |
| `validate:integration`: saída 0, 716226 ms, 36 de 36 passos, gate autenticado 275 passaram, 0 retentativas | WU-07 |
| Os seis controles e as duas variantes do controle 3 | WU-08 |
| Inventários (A) e (B), a comparação com o Goal109 e a união de 172 linhas | WU-08 |
| `test:gate`: 242 testes, `pass 242`, 0 falha, 0 pulado (`npm run test:gate`, saída 0) | WU-08, depois dos controles |
| Frontend: 149 arquivos e 1840 testes (`npx vitest run` em `apps/frontend`) | WU-08, depois dos controles |
| IA sem banco: 95 arquivos passaram e 14 pulados (109), 1199 testes passaram e 101 pulados (1300) | WU-08, depois dos controles |
| Scheduling unitários: 40 arquivos e 543 testes | WU-08, depois dos controles |
| Integração do BFF: 68 arquivos e 515 testes, contra um PostgreSQL de teste local | WU-08, depois dos controles |

Os relatórios guardados das WU-03 a WU-07 não trazem a contagem por arquivo (o do `validate:integration` traz só "passed", 36 de 36), então a integração do BFF, a IA, o Scheduling, o frontend e o `test:gate` foram medidos de novo na WU-08 sobre a mesma árvore. A WU-08 não repetiu o `validate:core` nem o `validate:integration` inteiros: eles não mudaram de causa depois da WU-07, porque a WU-08 só acrescentou documentos.

### Estado da árvore

O sha256 dos nove arquivos de código e de teste do Goal é o mesmo antes e depois dos controles e das variantes (ver "Restauração"). O `git status --porcelain=v1 -uall` da WU-08, antes dos documentos, tem 9 entradas: 5 modificadas (os cinco arquivos de produção) e 4 novas (as provas). Com os três documentos desta seção (`DECISIONS.md`, `CURRENT_STATE.md` e este arquivo), a árvore tem 12 entradas: 8 modificadas e 4 novas, sem resto de controle negativo. Nenhuma migration, nenhum `schema.prisma`, nenhum CSS, nenhum arquivo de `e2e/`, nenhum script, nenhum arquivo de `render.yaml`, `.github/` ou `.env.example`, nenhum arquivo do frontend e nenhuma configuração de gate mudou. Ambiente: o PostgreSQL de teste dos controles 5 e 6 e da recontagem do BFF é um cluster nativo temporário em `127.0.0.1:5558`, criado no diretório de trabalho da WU-08 e parado ao final; o banco de desenvolvimento não foi tocado.

### Não feito

O deploy real no Render e a medida das janelas W6 e W7 de D-121 (d). Uma sessão aberta antes do deploy num navegador real. O `validate:ui`, porque nenhum arquivo do frontend mudou. O `validate:core` e o `validate:integration` não foram repetidos na WU-08. A troca de nome em texto, identificador, arquivo e documentação (102). Remover os rótulos antigos.

**Nota de fechamento — review110, 2026-10-03.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-121 ACCEPTED na rodada 3, sem blocker, depois de 2 blockers na rodada 1 (dois deploys recomendados e janelas de cada ordem ausentes) e 1 na rodada 2 (janela de leitura do frontend antigo na Ordem C), todos de documento. As rodadas 2 e 3 (FIX-001) mudaram só D-121 e a seção do Goal110 de CURRENT_STATE.
- **Gates do IA Loop na rodada 1,** reaproveitados nas rodadas 2 e 3 porque nenhum arquivo fora de `docs/` mudou. Todos com exit 0: typecheck de `apps/bff`, `apps/ai-orchestrator` e `apps/scheduling-service` (WU-03 a WU-05), `validate:core` (WU-06, 129016 ms) e `validate:integration` (WU-07, 716226 ms). Na rodada 3, só `git diff --check` (WU-09) rodou de novo, com exit 0. Snapshot aceito: 12 arquivos, hash do diff `b623aef5…`, com o sha256 das quatro provas igual ao da seção acima (`a51f69b8`, `2af81d4d`, `f78f3eb0` e `97e51d3e`).
- **Conferência do Tech Lead.** Nas rodadas 1 e 3, ele reexecutou as provas 1 a 3: 9/9, 11/11 e 5/5. Na rodada 1, refez os inventários (A) e (B): 144 e 40 linhas, as mesmas daqui. Na rodada 2, conferiu o sha256 dos cinco arquivos de produção e das quatro provas contra esta seção. Na rodada 3, conferiu a janela da Ordem C contra `git show 2d1410c~1` (`schemas.ts:3` e `BffHttpClient.ts:226`). A prova 4, o vermelho da baseline e os seis controles foram aceitos pelo registro acima, não reexecutados pelo Tech Lead.
- **Observação.** Na W6, o sweep de expurgo de conta (`apps/bff/src/modules/account/purge.ts`) também chama a IA e o Scheduling e recebe `401`. Não é blocker: a janela continua declarada, não medida.
- **Aceito sem prova completa.** O deploy real e a duração das janelas W6, W7 e as de D-120 (h); uma sessão anterior ao deploy num navegador real; as credenciais explícitas reais do ambiente de deploy; a prova 4 fora de `validate:integration`, contra o cluster temporário da WU-08. Detalhe no [review110](reviews/110-review.md).

## O produto passa a se chamar Avenly no código, nas telas e no protótipo, do Goal102

Texto do Goal102 ([D-122](DECISIONS.md), `PROPOSED`), escrito pela FIX-001 da rodada 2, por acréscimo, depois da execução final. Toda contagem diz a execução que a sustenta. A recontagem da baseline é da WU-01 da rodada 1; o resto é da FIX-001 da rodada 2. Nenhuma seção de outro Goal foi editada.

### Recontagem da baseline (WU-01, rodada 1, `HEAD` `d5c2fd5`, árvore limpa, antes de qualquer edição)

- `validate:core`: saída 0, 17 passos, 15 passaram e 2 pulados (`test:bff` e `test:health-worker`). `test:ai-orchestrator` `Test Files 95 passed | 14 skipped (109)` e `Tests 1199 passed | 101 skipped (1300)`; `test:scheduling-service` 40 arquivos e 543 testes; `test:frontend` 149 arquivos e 1840 testes; `test:gate-scripts` `tests 242`, `pass 242`; `audit:static` 34 checks, 33 passaram, 1 pulado (`production_health`); `repro:a03-contract-drift` "A-03 não reproduz"; `test:evolution-go` com todos os pacotes `ok`.
- `validate:integration`: saída 0, 36 de 36 passos. `test:bff-integration` 68 arquivos e 515 testes; `test:scheduling-integration` 20 arquivos e 152 testes; `test:ai-orchestrator-transport-durability` 11 arquivos e 77 testes; `test:ai-orchestrator-content-purge` 3 arquivos e 24 testes; gate autenticado 275 passed e "authenticated gate retries: 0". Rodado num PostgreSQL 18 temporário em `127.0.0.1:55433`.
- `validate:ui`: saída 0, 168 passed e 1 flaky (169 `passed` no total), 21 pulados. A retentativa foi `tablet-768 › recuperar-senha › nothing overflows sideways` (retry #1, passou na segunda), na árvore da baseline, antes de qualquer edição.

### Prova da substituição inversa (§4 e escolha (e))

Script em Python, rodado na FIX-001 sobre `git diff --cached --name-status -M d5c2fd5 -- docs/design-reference` (com `docs/design-reference/` no index): para cada entrada `M` ou `R`, aplica `Avenly→Atendly`, `avenly→atendly` e `AVENLY→ATENDLY` ao blob do caminho novo (`git show :<novo>`) e compara byte a byte com `git show d5c2fd5:<antigo>`. A comparação é feita entre blobs, e não com o arquivo da worktree, porque `core.autocrlf=true` grava CRLF na worktree e LF no index.

```
entries: {'M': 48, 'R': 4} identical after inverse: 52 mismatch/unexpected: 0
R100  claude-design/assets/uploads/atendly-logo-icon.png -> assets/uploads/avenly-logo-icon.png
R087  claude-design/prototype/Atendly-standalone.html -> prototype/Avenly-standalone.html
R099  claude-design/prototype/project/Atendly.dc.html -> prototype/project/Avenly.dc.html
R100  claude-design/prototype/project/uploads/atendly-logo-icon.png -> prototype/project/uploads/avenly-logo-icon.png
```

O sha256 do blob invertido é igual ao da baseline nos quatro renomeados (`3fe6570d…`, `96b717c2…`, `c4e4ace4…` e `3fe6570d…`). Os dois `.zip` não mudaram. Ficaram com o nome antigo, por desenho, as 7 linhas de texto que citam os `.zip` e as 2 URLs externas do Claude Design (D-122, ponto de julgamento 1). `inventory.json` não tinha o nome e não mudou. Dos 51 arquivos de texto com o nome antigo, 50 mudaram; `handoff/README.md` só cita o `.zip` e ficou igual.

### `visual:compare` (FIX-001, depois da última edição de código)

`npm run visual:compare -- --target L1,L3,L4,L5,L8,L9,H1,A1,NT1,0,2.1,2.2,2.I1,4.2,4.6,I1,I2,Mais-WhatsApp:C1`, saída 0 em 181 s, 72 capturas. O BFF, o Scheduling e a IA eram os da worktree, contra bancos descartáveis num PostgreSQL 18 temporário (`visual_bff_test`, `visual_scheduling_test` e `visual_ai_test` em `127.0.0.1:55433`), com a IA sem laços de fundo e com o LLM e o Evolution apontados para endereços mortos; a conta visual foi criada e semeada ali. O motivo: o banco de desenvolvimento do Scheduling não tem a migration do Goal109 (`Value 'ATENDLY' not found in enum 'CalendarSource'` na primeira tentativa) e o `.env` local da IA aponta para serviços reais. Diff por quadro (%):

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| L1 | 4,8 | 1,0 | 1,0 | 1,0 |
| L3 | 1,7 | 1,1 | 1,6 | 0,9 |
| L4 | 2,2 | 1,5 | 1,4 | 1,6 |
| L5 | 12,8 | 10,5 | 5,3 | 4,3 |
| L8 | 9,3 | 8,6 | 6,8 | 5,3 |
| L9 | 9,0 | 7,9 | 7,5 | 5,6 |
| H1 | 12,7 | 7,4 | 8,3 | 7,1 |
| A1 | 10,4 | 4,8 | 5,4 | 4,3 |
| NT1 | 9,8 | 4,2 | 49,0 | 60,1 |
| 0 | 1,2 | 0,5 | 0,9 | 0,6 |
| 2.1 | 2,4 | 0,8 | 0,9 | 0,8 |
| 2.2 | 1,1 | 0,4 | 0,7 | 0,7 |
| 2.I1 | 2,7 | 1,8 | 2,1 | 1,6 |
| 4.2 | 8,9 | 5,1 | 5,3 | 3,9 |
| 4.6 | 5,4 | 2,3 | 2,7 | 1,9 |
| I1 | 10,0 | 4,4 | 6,7 | 5,6 |
| I2 | 16,0 | 11,3 | 12,2 | 10,8 |
| Mais-WhatsApp:C1 | 5,1 | 2,4 | 4,9 | 4,2 |

Os `side-by-side.png` foram abertos. Avenly aparece nos dois lados: a marca do desktop e do onboarding, "Configure sua Avenly", "agendamentos para a Avenly", o cartão "AVENLY" de 2.2 e I2, "Avenly · Teste" de 4.6 e "Avenly · versão 1.0" de C1. Nenhuma divergência envolve o nome. As que restam são as já registradas pelos Goals que portaram cada quadro, e os números ficam na mesma faixa: L1 a L9 iguais aos da tabela do Goal091 (diferença de no máximo 0,1 ponto), H1 12,7 / 7,4 / 8,3 / 7,1 (antes 12,6 / 7,4 / 8,4 / 7,1), A1 igual (10,4 / 4,8 / 5,4 / 4,3), 2.1, 2.2, 2.I1 e I1 iguais, I2 16,0 / 11,3 / 12,2 / 10,8 (antes 16,1 no mobile), NT1 9,8 / 4,2 / 49,0 / 60,1 (antes 10,4 / 4,4 / 49,2 / 60,2). O que difere é estado da conta de teste, como `targets.json` declara: WhatsApp desconectado e IA não ativada (faixa "Atendimento automático parado", "Ative sua IA", "WhatsApp desconectado" na casca), data e dados semeados, notificações e e-mail da conta; e, em 4.2 e 4.6, o estado inicial e os textos já aceitos no porte (consentimento desmarcado, "Fazer isso depois"). Nenhuma divergência nova. Limite: das 72 capturas, as de L1 a L9 e duas de H1 foram abertas, mas a imagem saiu do contexto de trabalho antes da redação; para elas vale a comparação de números acima com as tabelas aceitas.

### Inventário do §6 (FIX-001, depois da execução final)

`git grep -n -i atendly -- ':!docs' ':!graphify-out'`: **444** linhas, **0** sem classe: (i) 65, (ii) 22, (iii) 117, (v) 10, (vi) 3, (viii) 181, (ix) 46. `git grep -n -i atendly -- docs/design-reference`: **11** linhas: (x) 9, (viii) 2. A classificação é de um script que aplica regras por caminho e por texto e sai com erro se sobrar linha; a lista abaixo é a saída dele, agrupada por arquivo quando todas as linhas do arquivo têm a mesma classe.

**Fora de `docs/`:**

- `.env.example` — (viii) — 6 linha(s): 2,3,7,8,11,31
- `.github/workflows/validate.yml` — (viii) — 3 linha(s): 92,96,101
- `apps/ai-orchestrator/.env.example` — (viii) — 1 linha(s): 137
- `apps/ai-orchestrator/prisma.config.ts` — (viii) — 1 linha(s): 13
- `apps/ai-orchestrator/prisma/migrations/20260908120000_goal005_contact_session_human_control/migration.sql` — (i) — 1 linha(s): 24
- `apps/ai-orchestrator/prisma/migrations/20261003120000_goal109_avenly_human_control_source/migration.sql` — (i) — 3 linha(s): 6,19,21
- `apps/ai-orchestrator/src/lib/internal-credentials.ts` — (vi) — 1 linha(s): 27
- `apps/ai-orchestrator/tests/activation-test/activation-test-service.test.ts` — (viii) — 1 linha(s): 22
- `apps/ai-orchestrator/tests/channel/platform-sender.test.ts` — (viii) — 1 linha(s): 9
- `apps/ai-orchestrator/tests/integration/goal109-avenly-human-control-source.test.ts` — (iii) — 12 linha(s): 15,20,21,22,39,118,186,198,200,206,209,219
- `apps/ai-orchestrator/tests/security/goal110-internal-credential-label.test.ts` — (iii) — 2 linha(s): 21,25
- `apps/ai-orchestrator/tests/security/platform-credential-isolation.test.ts` — (viii) — 1 linha(s): 14
- `apps/bff/.env.example:5` — (viii)
- `apps/bff/.env.example:9` — (viii)
- `apps/bff/.env.example:14` — (ii)
- `apps/bff/PUBLIC_API_V1.md:46` — (ii)
- `apps/bff/PUBLIC_API_V1.md:48` — (ii)
- `apps/bff/PUBLIC_API_V1.md:50` — (ii)
- `apps/bff/PUBLIC_API_V1.md:107` — (v)
- `apps/bff/PUBLIC_API_V1.md:111` — (ii)
- `apps/bff/prisma.config.ts` — (viii) — 1 linha(s): 13
- `apps/bff/src/lib/auth.ts` — (ii) — 2 linha(s): 39,40
- `apps/bff/src/lib/calendar-source.ts` — (ii) — 1 linha(s): 8
- `apps/bff/src/lib/session.ts` — (vi) — 1 linha(s): 35
- `apps/bff/tests/customer-identity.integration.test.ts` — (iii) — 1 linha(s): 131
- `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` — (iii) — 6 linha(s): 25,32,215,235,309,347
- `apps/bff/tests/goal019-ai-activation-reconciliation.integration.test.ts` — (iii) — 1 linha(s): 157
- `apps/bff/tests/goal022-notification-center.integration.test.ts` — (iii) — 2 linha(s): 84,171
- `apps/bff/tests/goal022-notification-engine.test.ts` — (iii) — 1 linha(s): 48
- `apps/bff/tests/goal022-notification-rules.test.ts` — (iii) — 1 linha(s): 272
- `apps/bff/tests/goal027-onboarding-issues.test.ts` — (iii) — 4 linha(s): 14,48,52,82
- `apps/bff/tests/goal029-timezone-contract.integration.test.ts` — (iii) — 2 linha(s): 104,148
- `apps/bff/tests/goal029-timezone-propagation.integration.test.ts` — (iii) — 2 linha(s): 51,111
- `apps/bff/tests/goal029-timezone-read-reconciliation.integration.test.ts` — (iii) — 3 linha(s): 83,87,283
- `apps/bff/tests/goal036-response-contract-undeclared-key.test.ts` — (iii) — 2 linha(s): 38,118
- `apps/bff/tests/goal036-wu02-declared-fields.test.ts` — (iii) — 1 linha(s): 110
- `apps/bff/tests/goal059-whatsapp-status.integration.test.ts` — (iii) — 1 linha(s): 53
- `apps/bff/tests/goal060-integration-connect.test.ts` — (iii) — 1 linha(s): 62
- `apps/bff/tests/goal063-ai-activation.integration.test.ts` — (iii) — 1 linha(s): 101
- `apps/bff/tests/goal065-onboarding.integration.test.ts` — (iii) — 1 linha(s): 58
- `apps/bff/tests/goal067-pause-and-profile.integration.test.ts` — (iii) — 1 linha(s): 81
- `apps/bff/tests/goal073-settings-policy-and-agenda-view.integration.test.ts` — (iii) — 1 linha(s): 48
- `apps/bff/tests/goal075-customers-contract.integration.test.ts` — (iii) — 2 linha(s): 39,255
- `apps/bff/tests/goal077-ai-activated-notification.integration.test.ts` — (iii) — 1 linha(s): 77
- `apps/bff/tests/goal109-avenly-calendar-source.test.ts` — (iii) — 7 linha(s): 24,31,51,145,168,234,277
- `apps/bff/tests/goal109-legacy-session-cookie.integration.test.ts` — (iii) — 5 linha(s): 21,29,30,85,102
- `apps/bff/tests/goal110-csrf-label.integration.test.ts` — (iii) — 2 linha(s): 22,29
- `apps/bff/tests/goal110-internal-credential-label.test.ts` — (iii) — 1 linha(s): 23
- `apps/frontend/.env.example` — (ii) — 1 linha(s): 5
- `apps/frontend/AGENTS.md` — (viii) — 1 linha(s): 250
- `apps/frontend/scripts/check-legal-config.mjs` — (ii) — 2 linha(s): 16,21
- `apps/frontend/src/app/onboarding/[step]/page.tsx` — (ix) — 4 linha(s): 13,15,16,17
- `apps/frontend/src/config/legal-details.ts` — (ii) — 2 linha(s): 31,36
- `apps/frontend/src/data/http/BffHttpClient.ts` — (ii) — 2 linha(s): 81,94
- `apps/frontend/src/shared/ui/Brand.tsx` — (ii) — 2 linha(s): 16,17
- `apps/frontend/tests/goal018-onboarding-reachability.test.tsx` — (ix) — 6 linha(s): 248,354,355,364,366,368
- `apps/frontend/tests/goal066-onboarding-sistema-atual.test.tsx` — (ix) — 7 linha(s): 4,101,102,110,114,126,127
- `apps/frontend/tests/goal068-marca.test.tsx` — (ix) — 5 linha(s): 74,82,83,84,85
- `apps/frontend/tests/goal109-avenly-values.test.tsx` — (iii) — 18 linha(s): 8,75,196,203,222,223,227,233,241,243,249,250,267,285,298,319,323,331
- `apps/frontend/tests/goal109-csrf-cookie.test.ts` — (iii) — 5 linha(s): 9,17,65,66,72
- `apps/frontend/tests/service-schema.test.ts` — (iii) — 1 linha(s): 64
- `apps/health-worker/.env.example` — (viii) — 1 linha(s): 1
- `apps/health-worker/README.md` — (viii) — 1 linha(s): 30
- `apps/scheduling-service/.env.example` — (viii) — 1 linha(s): 5
- `apps/scheduling-service/prisma.config.ts` — (viii) — 1 linha(s): 13
- `apps/scheduling-service/prisma/migrations/20260828175825_init/migration.sql` — (i) — 1 linha(s): 2
- `apps/scheduling-service/prisma/migrations/20260910100000_goal010_import_session/migration.sql` — (i) — 2 linha(s): 140,364
- `apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql` — (i) — 12 linha(s): 2,6,14,15,20,25,28,36,42,44,51,52
- `apps/scheduling-service/prisma/migrations/20261003120000_goal109_avenly_calendar_source/migration.sql` — (i) — 5 linha(s): 5,27,29,39,42
- `apps/scheduling-service/prisma/schema.prisma` — (ii) — 2 linha(s): 17,19
- `apps/scheduling-service/src/modules/internal-api/routes.ts:113` — (ii)
- `apps/scheduling-service/src/modules/internal-api/routes.ts:116` — (ii)
- `apps/scheduling-service/src/modules/internal-api/routes.ts:1945` — (v)
- `apps/scheduling-service/src/shared/auth/internal-credentials.ts` — (vi) — 1 linha(s): 19
- `apps/scheduling-service/tests/integration/goal010-import-completion.test.ts` — (v) — 2 linha(s): 34,35
- `apps/scheduling-service/tests/integration/goal010-import.test.ts` — (v) — 2 linha(s): 211,212
- `apps/scheduling-service/tests/integration/goal109-avenly-calendar-source.test.ts` — (iii) — 17 linha(s): 31,37,49,127,153,154,157,158,175,177,187,210,211,243,319,320,328
- `apps/scheduling-service/tests/unit/goal027-calendar-guard.test.ts` — (v) — 1 linha(s): 20
- `apps/scheduling-service/tests/unit/goal029-calendar-timezone.test.ts` — (iii) — 10 linha(s): 6,7,105,106,142,147,162,178,197,220
- `apps/scheduling-service/tests/unit/goal110-internal-credential-label.test.ts` — (iii) — 2 linha(s): 3,28
- `packages/public-api-contract/src/schemas.ts` — (ii) — 1 linha(s): 5
- `render.yaml` — (viii) — 24 linha(s): 3,19,21,24,50,66,72,79,92,99,125,132,141,161,182,187,205,229,244,246,250,255,258,259
- `scripts/final-production-audit.mjs:21` — (viii)
- `scripts/final-production-audit.mjs:22` — (viii)
- `scripts/final-production-audit.mjs:23` — (viii)
- `scripts/final-production-audit.mjs:24` — (viii)
- `scripts/final-production-audit.mjs:25` — (viii)
- `scripts/final-production-audit.mjs:26` — (viii)
- `scripts/final-production-audit.mjs:55` — (viii)
- `scripts/final-production-audit.mjs:262` — (ix)
- `scripts/final-production-audit.mjs:263` — (ix)
- `scripts/final-production-audit.mjs:265` — (ix)
- `scripts/final-production-audit.mjs:266` — (ix)
- `scripts/final-production-audit.mjs:267` — (ix)
- `scripts/final-production-audit.mjs:268` — (ix)
- `scripts/final-production-audit.mjs:269` — (ix)
- `scripts/final-production-audit.mjs:311` — (viii)
- `scripts/final-production-audit.mjs:312` — (viii)
- `scripts/final-production-audit.mjs:313` — (viii)
- `scripts/final-production-audit.mjs:318` — (viii)
- `scripts/final-production-audit.mjs:319` — (viii)
- `scripts/final-production-audit.mjs:320` — (viii)
- `scripts/final-production-audit.mjs:595` — (ix)
- `scripts/final-production-audit.mjs:597` — (ix)
- `scripts/final-production-audit.mjs:598` — (ix)
- `scripts/final-production-audit.mjs:599` — (ix)
- `scripts/final-production-audit.mjs:600` — (ix)
- `scripts/final-production-audit.mjs:748` — (viii)
- `scripts/final-production-audit.mjs:749` — (viii)
- `scripts/final-production-audit.mjs:750` — (viii)
- `scripts/final-production-audit.mjs:751` — (viii)
- `scripts/final-production-audit.mjs:752` — (viii)
- `scripts/final-production-audit.mjs:868` — (viii)
- `scripts/final-production-audit.mjs:869` — (viii)
- `scripts/final-production-audit.mjs:870` — (viii)
- `scripts/final-production-audit.mjs:928` — (viii)
- `scripts/final-production-audit.mjs:934` — (viii)
- `scripts/goal006-ai-migration-rehearsal.mjs` — (i) — 1 linha(s): 93
- `scripts/goal009-migration-rehearsal.mjs` — (i) — 3 linha(s): 95,222,223
- `scripts/goal010-migration-rehearsal.mjs` — (i) — 7 linha(s): 117,205,206,207,208,209,210
- `scripts/goal027-calendar-source-migration-rehearsal.mjs` — (i) — 26 linha(s): 4,24,25,73,77,125,191,197,198,199,359,391,415,423,424,427,430,431,432,438,439,494,525,535,584,587
- `scripts/goal074-human-takeover-migration-rehearsal.mjs` — (i) — 4 linha(s): 26,112,250,329
- `scripts/tests/final-production-audit-legacy-regression.test.mjs` — (ix) — 12 linha(s): 22,319,326,329,334,337,340,344,347,352,356,359
- `scripts/tests/goal011-ai-style-migration-rehearsal.test.mjs` — (viii) — 6 linha(s): 9,22,23,26,27,50
- `scripts/tests/goal012-knowledge-memory-migration-rehearsal.test.mjs` — (viii) — 4 linha(s): 9,14,15,37
- `scripts/tests/goal013-media-migration-rehearsal.test.mjs` — (viii) — 4 linha(s): 9,14,15,37
- `scripts/tests/goal019-activation-test-migration-rehearsal.test.mjs` — (viii) — 4 linha(s): 9,14,15,37
- `scripts/tests/goal028-production-config.test.mjs` — (viii) — 43 linha(s): 45,51,60,78,90,100,121,138,147,159,186,187,188,197,198,199,204,216,217,218,223,232,233,234,239,247,248,249,254,264,265,266,271,294,297,298,299,312,313,314,318,341,357
- `scripts/tests/goal028-release-rehearsal.test.mjs` — (viii) — 12 linha(s): 23,49,50,51,57,58,59,78,79,85,251,261
- `scripts/tests/goal028-restore-rehearsal.test.mjs` — (viii) — 12 linha(s): 24,86,87,88,94,95,96,116,118,135,149,170
- `scripts/tests/goal029-goal030-rehearsal-guards.test.mjs` — (viii) — 3 linha(s): 22,24,26
- `scripts/tests/goal032-auto-reply-rehearsal.test.mjs` — (viii) — 4 linha(s): 25,27,29,72
- `scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` — (viii) — 5 linha(s): 26,55,62,63,64
- `scripts/tests/validate-integration.test.mjs` — (viii) — 14 linha(s): 18,46,64,65,136,137,205,216,224,239,271,272,298,299
- `scripts/validate-integration.mjs:78` — (viii)
- `scripts/validate-integration.mjs:470` — (v)
- `scripts/validate-integration.mjs:473` — (v)
- `scripts/validate-integration.mjs:477` — (v)

**Em `docs/design-reference/`** (a classe `viii*` da saída do script é (viii), o ponto de julgamento 1 de D-122):

- `docs/design-reference/claude-design/README.md:7` — (viii*)
- `docs/design-reference/claude-design/README.md:52` — (x)
- `docs/design-reference/claude-design/README.md:56` — (x)
- `docs/design-reference/claude-design/README.md:66` — (x)
- `docs/design-reference/claude-design/README.md:68` — (x)
- `docs/design-reference/claude-design/README.md:120` — (x)
- `docs/design-reference/claude-design/README.md:126` — (x)
- `Binary file docs/design-reference/claude-design/handoff/Atendly-Stage-1-delivery-handoff.zip matches` — (x) — 1 linha(s)
- `docs/design-reference/claude-design/handoff/README.md` — (x) — 1 linha(s): 5
- `docs/design-reference/claude-design/handoff/claude-code-prompt.md` — (viii*) — 1 linha(s): 9
- `Binary file docs/design-reference/claude-design/prototype/Atendly-Stage-1-delivery.zip matches` — (x) — 1 linha(s)

**Contra as listas herdadas.** O comando de D-120 (i) passa de **144** linhas (baseline `d5c2fd5`) para **138**: saíram só as **6** de (iv) (`scripts/lib/visual-seed.mjs` 2, `scripts/goal033-authenticated-ui-rehearsal.mjs` 2, `scripts/goal030-mvp-journey-rehearsal.mjs` 1 e a fixture de `scripts/tests/final-production-audit-legacy-regression.test.mjs` 1, que agora dizem `"AVENLY"`); as **30** de (i), as 19 de (ii), as 86 de (iii) e as 3 de (v) continuam, com o mesmo arquivo e texto (comparação por `comm` sobre arquivo e texto, sem o número da linha). O comando (B) de D-121 (e) passa de **40** para **16**: saíram as **24** de (vii), e continuam as 12 de (ii), a 1 de (v) e as 3 de (vi). Nenhuma linha de (iv) ou (vii) sobra.

`git ls-files | grep -i atendly`:

```
apps/scheduling-service/prisma/migrations/20260828233000_add_atendly_calendar_provider/migration.sql
apps/scheduling-service/prisma/migrations/20260919120000_goal027_calendar_source_atendly/migration.sql
docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md
docs/design-reference/claude-design/handoff/Atendly-Stage-1-delivery-handoff.zip
docs/design-reference/claude-design/prototype/Atendly-Stage-1-delivery.zip
```

Os dois diretórios de migration são (i) e os dois `.zip` são (x). `docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md` é um `.md` solto de `docs/`, que este Goal não pode tocar: fica como **pendência do Goal111**, sem renomear.

### Execução final (FIX-001, rodada 2, depois da última edição de código)

A última edição de código foi a devolução de `source: "ATENDLY"` em `apps/frontend/tests/service-schema.test.ts:64` (D-122, ponto de julgamento 4). Os passos abaixo rodaram depois dela, nesta ordem, salvo as provas da primeira linha.

| Passo | Resultado |
| --- | --- |
| Provas `goal109-*` e `goal110-*`, num banco à parte do mesmo cluster | frontend 2 arquivos e 21 testes, BFF 4 e 38, Scheduling 2 e 16 (unitário 9 e integração 7), IA 2 e 14: **89** de 89, as 61 do Goal109 e as 28 do Goal110. Rodadas antes da devolução do `service-schema.test.ts`, que não é prova nem é importado por elas; as provas do frontend rodaram de novo dentro do `validate:core` abaixo, e as do BFF, do Scheduling e da IA dentro do `validate:integration` |
| Typecheck (`npm run typecheck`) de `apps/bff`, `apps/ai-orchestrator`, `apps/scheduling-service` e `apps/frontend` | saída 0 nos quatro |
| `validate:core` | saída 0 em 128172 ms; 17 passos, 15 passaram e 2 pulados; IA `95 passed \| 14 skipped (109)` e `1199 passed \| 101 skipped (1300)`; Scheduling 40 e 543; frontend **149 e 1841**; `test:gate` **242** (`pass 242`, `fail 0`); `audit:static` 33 de 34 e 1 pulado |
| `validate:ui` | saída 0 em 53630 ms; **169** passed, 21 pulados, "retries: 0" |
| `validate:integration`, num cluster PostgreSQL 18 recém-criado (`initdb` novo, banco `atendly_bff_test` vazio em `127.0.0.1:55433`) | saída 0 em 750874 ms; **36** de 36 passos; integração do BFF **68 e 515**; Scheduling 20 e 152; durabilidade da IA 11 e 77; expurgo 3 e 24; gate autenticado **275** passed e "authenticated gate retries: 0" |
| `visual:compare` (acima) | saída 0, 72 capturas |
| `git diff --check` | saída 0 |

Execução anterior, que não vale como veredito: na mesma rodada, antes da devolução do `service-schema.test.ts`, `validate:core` (frontend 1841, `test:gate` 242), `validate:ui` (169, 0 retentativas) e `validate:integration` (36 de 36, 747 s, BFF 515, gate autenticado 275 e 0 retentativas) já tinham passado; foram repetidos acima.

A suíte do frontend passa de 1840 para **1841** testes por causa do teste novo do alias `agenda-atendly-pronta` (D-122 (d)). Nenhuma suíte tem teste a menos que a recontagem da baseline, e nenhum teste foi pulado nem removido.

### Estado da árvore

`git diff --stat d5c2fd5` não mostra migration, `vitest.config.*` nem `playwright*.config.*`. `apps/frontend/next.config.ts` muda só as duas strings de `transpilePackages`. Os dois `schema.prisma` mudam só linhas `///` (0 linhas fora de `///` no `git diff -U0`). Fora de `docs/`, cada linha mudada difere da baseline só pela troca do nome, salvo a entrada nova de `legacyStepRedirects`, o comentário dela e o teste novo de (d), conferido linha a linha por script. Os lockfiles mudam só nomes, e `node_modules/@avenly-ia/` existe em `apps/bff` e `apps/frontend`, sem nenhum `node_modules/@atendly-ia`. Nos `goal109-*` e `goal110-*` mudaram só 2 arquivos e 3 linhas (D-122, ponto de julgamento 5). Em `docs/` mudam só `docs/design-reference/` e os três documentos desta seção (`DECISIONS.md`, `CURRENT_STATE.md` e este). `graphify-out/` não está no diff. O cluster temporário e os bancos descartáveis ficaram fora da worktree e foram parados no fim; o banco de desenvolvimento não foi migrado nem semeado.

### Não feito

O deploy real e a janela de D-122 (c). A troca dos nomes de ambiente (viii). A documentação e os registros fora de `docs/design-reference/` (Goal111), incluindo `docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md`. Os quadros sem alvo em `targets.json`, conferidos só pelo texto e pelos testes. A conferência humana num aparelho real.

**Nota de fechamento — review102, 2026-10-04.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-122 ACCEPTED na rodada 2, sem blocker, depois de 7 blockers na rodada 1: protótipo intocado, WU-03 do frontend `FAILED` sem relatório, os dois `goal109-*` editados sem declaração, e a falta do inventário, de `visual:compare`, da execução final sobre a árvore completa e de D-122. Os cinco pontos de julgamento de D-122 ficam aceitos como propostos.
- **Gates da rodada 1, que não valem como veredito.** Typecheck (WU-06 a WU-09), `validate:core` (WU-10, 116817 ms), `validate:ui` (WU-11, 49929 ms), `validate:integration` (WU-12, 725283 ms) e `git diff --check` (WU-14) passaram com exit 0, mas sobre a árvore sem o §4. A WU-03 terminou `FAILED` e a WU-13 (`visual:compare`) ficou `BLOCKED`.
- **Gates do IA Loop na rodada 2,** depois da FIX-001, todos com exit 0: typecheck de `apps/bff`, `apps/ai-orchestrator`, `apps/scheduling-service` e `apps/frontend` (WU-06 a WU-09), `validate:core` (WU-10, 122152 ms), `validate:ui` (WU-11, 52354 ms), `validate:integration` (WU-12, 733288 ms) e `git diff --check` (WU-14). As contagens da tabela "Execução final" acima são da corrida da FIX-001; o IA Loop registra só o exit e a duração das suas. Snapshot aceito: 286 arquivos, hash do diff `509dfb4b…`.
- **Conferência do Tech Lead na rodada 2.** Refez a comparação linha a linha fora de `docs/` contra `d5c2fd5`, a substituição inversa em `docs/design-reference/` (byte a byte, 4 `R`, `.zip` intactos), o inventário (444 e 11 linhas, sem resto) e o estado da árvore (`schema.prisma` só `///`, `next.config.ts` só `transpilePackages`, nenhuma migration nem configuração de gate, `node_modules/@avenly-ia` sem `@atendly-ia`). Não reexecutou os gates.
- **`visual:compare`.** Na conferência do Tech Lead, o comando saiu com "BFF local indisponível" (porta 3002), por isso não houve corrida própria. Ele abriu os `side-by-side.png` da corrida da FIX-001, 72 capturas geradas depois de toda edição do frontend e do protótipo: 0, 2.1, 2.2, 2.I1, 4.2, 4.6, I1, I2, C1, A1 e NT1 nos 4 devices; L1 a L9 e H1 no mobile e no desktop; H1 também no tablet retrato. Avenly aparece nos dois lados, sem divergência nova. Os tablets de L1 a L9 e o tablet paisagem de H1 não foram vistos e ficam aceitos pelos números da tabela acima, iguais aos do Goal091.
- **Aceito sem prova completa.** O deploy real e a janela de D-122 (c); os quadros sem alvo em `targets.json`; a conferência humana num aparelho real. Detalhe no [review102](reviews/102-review.md).

## A documentação e os registros passam a dizer Avenly, do Goal111

Seção da WU-05 da rodada 1 do [Goal111](goals/111-os-registros-e-a-documentacao-passam-a-dizer-avenly.md), em 2026-10-04, escrita por acréscimo e depois das provas, e refeita na rodada 2 (FIX-001): três erros de classe achados pelo review da rodada 1 foram corrigidos, e as provas, o inventário e as contagens abaixo foram refeitos sobre a árvore final. A base imediata é `db877ca`. Este Goal não muda código, então não há suíte a recontar nem gate de app a rodar. Cada contagem diz o comando e a árvore que a sustentam. A decisão é D-124, em `PROPOSED` ([DECISIONS](DECISIONS.md)).

### Recontagem de entrada (`HEAD` `db877ca`, antes de qualquer edição)

Comandos: `git grep -l -i atendly HEAD -- docs ':!docs/design-reference'` (arquivos), `git grep -n -i …` (linhas) e `git grep -i -o …` (ocorrências). Resultado: **193** arquivos, **1576** linhas e **2296** ocorrências.

| Parte | Arquivos | Linhas | Ocorrências |
| --- | ---: | ---: | ---: |
| `docs/product-vault/` | 34 | 151 | 160 |
| `docs/migration/goals/` | 65 | 387 | 625 |
| `docs/migration/reviews/` | 75 | 211 | 278 |
| raiz de `docs/migration/` | 14 | 811 | 1217 |
| `docs/architecture/`, `docs/landing-page/`, `docs/README.md`, `docs/PLANO_REFATORACAO.md` e o `.md` solto | 5 | 16 | 16 |
| **Total** | **193** | **1576** | **2296** |

A página do Goal conferiu a baseline `9fe209f` e deu 192 arquivos, 1541 linhas e 2206 ocorrências. A diferença para `db877ca` é o commit de planejamento do 111: o documento do próprio Goal (1 arquivo, 32 linhas, 81 ocorrências) e 3 linhas, com 9 ocorrências, nas entradas do 111 em MASTER_PLAN e MIGRATION_STATUS.

### Resultado da troca

`git diff -M --stat HEAD`: **171** arquivos mudados (170 `M` e 1 `R098`, o `.md` solto), **920** linhas removidas e **920** inseridas pela troca (mais as linhas dos acréscimos de documentação, que só inserem). `git grep -n -i atendly -- docs ':!docs/design-reference'` na árvore depois da troca e antes da documentação desta seção: **65** arquivos, **696** linhas e **1200** ocorrências; das **2296** de entrada, **1096** foram trocadas. O vault, `docs/architecture/`, `docs/landing-page/`, `docs/README.md`, `docs/PLANO_REFATORACAO.md` e o `.md` solto não têm mais o nome antigo.

### Prova linha a linha

Script (fora do repositório): para cada arquivo de `git diff -M --name-status HEAD`, alinha as linhas de `git show HEAD:<caminho original>` com as da worktree por `difflib.SequenceMatcher`, com as quebras de linha normalizadas para LF (a worktree é CRLF por `core.autocrlf`). Uma linha mudada passa quando a nova se obtém da antiga trocando um subconjunto das ocorrências do nome antigo pelo novo, na mesma caixa, e nada mais. Um trecho mudado com número de linhas diferente reprova, salvo a inserção pura dos acréscimos de documentação. Resultado sobre a árvore final, na rodada 2: **171** arquivos, **55355** linhas conferidas, **920** mudadas, com 1173 ocorrências nelas (1096 trocadas e 77 mantidas por serem das classes de exceção), e **0** divergências. Há uma exceção declarada: a linha 200 de `docs/product-vault/02-Fluxos/01-Onboarding.md` perdeu os dois espaços finais (uma quebra dura de Markdown), porque `git diff --check` recusa a linha trocada com espaço no fim. As únicas inserções puras são as linhas dos acréscimos: **45** em DECISIONS (D-124), **10** em CURRENT_STATE (o delta do Goal111) e **136** neste arquivo (esta seção), todas no fim do arquivo. Na rodada 2 a prova mudou de 923 para 920 linhas mudadas: as três linhas de saída de ferramenta e de campo retirado que a rodada 1 tinha trocado por engano (`CURRENT_STATE.md:2627`, `VALIDATION_GATE.md:2265` e `FINAL_AUDIT.md:6185`) voltaram a ser idênticas às da base, e `DECISIONS.md:509` e `FINAL_AUDIT.md:5612` continuam mudadas só pelas palavras que de fato trocam.

### Prova dos tokens protegidos

Comando, por token: `git grep -h -o -F -e '<token>' [HEAD] -- docs ':!docs/design-reference' | wc -l`, em `HEAD` e na worktree. O texto novo dos registros não repete nenhum dos quinze, e por isso a contagem é a mesma na árvore final. Refeita na rodada 2 sobre a árvore final: os quinze têm a mesma contagem de ocorrências e de arquivos antes e depois.

| Token (o que é) | Ocorrências | Arquivos |
| --- | ---: | ---: |
| cookie de sessão | 33 | 11 |
| cookie de CSRF | 31 | 11 |
| prefixo do HMAC das credenciais derivadas | 23 | 10 |
| rótulo do HMAC do token de CSRF | 21 | 9 |
| constraint da fonte da agenda no banco | 37 | 14 |
| valor legado do enum, entre aspas | 147 | 24 |
| valor legado do enum, entre crases | 124 | 29 |
| prefixo das variáveis de ambiente | 53 | 11 |
| diretório da migration do provedor de calendário | 4 | 3 |
| diretório da migration do Goal027 | 16 | 9 |
| prefixo dos aliases do passo de onboarding | 70 | 19 |
| identificadores do calendário legado | 29 | 9 |
| instância do WhatsApp | 14 | 8 |
| banco de teste do BFF e derivados | 123 | 19 |
| nome dos dois `.zip` do protótipo | 12 | 5 |

A prova reprovou na primeira passada: o prefixo dos aliases do passo de onboarding foi de 70 para 62. Oito ocorrências (a rota do passo, o nome do teste que a exercita e a rota da QA) são legado e tinham sido trocadas pela WU-03 e pela WU-04; foram devolvidas à forma original. A mesma passada achou dois caminhos de pacote em FINAL_AUDIT (`node_modules/@atendly-ia/public-api-contract/dist`, nas linhas 1065 e 6236) que tinham ficado como nome de ambiente; o pacote já existe como `@avenly-ia`, e os dois foram trocados.

### Links e âncoras

Script (fora do repositório): extrai os links relativos `[texto](alvo)` e `[texto](alvo#âncora)` fora de blocos de código, resolve o arquivo contra a árvore e a âncora contra os títulos do alvo (slug no estilo do GitHub), e compara com a mesma conferência sobre `HEAD`. Resultado, refeito na rodada 2 sobre a árvore final: **5965** links de **341** arquivos `.md` do repositório (fora de `docs/design-reference/` e `graphify-out/`; **5959** em `db877ca`), **20** quebrados agora, e os **20** já estavam quebrados em `db877ca` (âncoras de títulos que não existem, links de DECISIONS para `../FINAL_AUDIT.md`, dois links de review e dois diretórios citados como link), de modo que **0** foram quebrados por este diff. Os quatro links para a âncora de DATA_MIGRATION §14 resolvem, porque o título e os links ficaram juntos.

### Inventário final, por arquivo e classe

Comando: `git grep -n -i atendly -- docs ':!docs/design-reference'`, na árvore final. Cada ocorrência cai em uma só classe, pela precedência (F), (L), (E), (Q), (R), e nenhuma fica sem classe: (F) registro da própria troca, (L) valor ou nome legado que existe hoje fora de `docs/`, (E) nome de ambiente, (Q) citação literal de saída de ferramenta, (R) identificador retirado antes da troca. Total: **65** arquivos, **716** linhas e **1243** ocorrências: **735** em (F), **318** em (L), **144** em (E), **14** em (Q) e **32** em (R). Antes desta documentação eram 65 arquivos, **696** linhas e **1200** ocorrências (692, 318, 144, 14 e 32); a diferença está toda em (F), nos três arquivos que a recebem. A lista com arquivo, linha e classe de cada ocorrência está no relatório da WU-05, e os pontos de julgamento estão em D-124.

O review da rodada 1 achou três erros de classe, corrigidos na rodada 2 e já refletidos nos números acima: (R) o campo retirado `ShellConfig.source` (`CURRENT_STATE.md:2627` e `DECISIONS.md:509`, 3 ocorrências), que tinha sido trocado e voltou ao nome antigo; (Q) a mensagem de asserção do runner e o valor recebido pelo teste que falhou (`FINAL_AUDIT.md:5612` e `:6185` e `VALIDATION_GATE.md:2265`, 5 ocorrências), que também voltaram; e a lista de julgamento de D-124, que ganhou o rótulo de tela do I2 (item 10), a saída de ferramenta no meio da frase (item 11) e a regra do glob `atendly-*.css` (item 4). Por isso (R) foi de 29 para 32, (Q) de 9 para 14 e as ocorrências trocadas de 1104 para 1096.

Contagem de ocorrências por arquivo (os caminhos são relativos a `docs/migration/`):

| Arquivo | F | L | E | Q | R | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `AUDIT_PROGRESS.md` | — | 1 | — | — | — | 1 |
| `CURRENT_STATE.md` | 17 | 31 | 9 | 1 | 5 | 63 |
| `DATA_MIGRATION.md` | 11 | 23 | — | — | — | 34 |
| `DECISIONS.md` | 154 | 52 | 3 | 1 | 4 | 214 |
| `FINAL_AUDIT.md` | — | 27 | 55 | 5 | — | 87 |
| `GAP_ANALYSIS.md` | — | 14 | — | — | 1 | 15 |
| `goals/014-fundacao-visual-shell-auth.md` | — | — | — | — | 1 | 1 |
| `goals/016-ui-agenda.md` | — | 1 | — | — | 2 | 3 |
| `goals/020-importacao-na-ui-e-historico.md` | — | 2 | — | — | — | 2 |
| `goals/026-retirada-do-protocolo-legado-e-do-writer-remoto.md` | — | 2 | — | — | 1 | 3 |
| `goals/027-retirada-da-fonte-externa-da-agenda.md` | — | 30 | — | — | — | 30 |
| `goals/028-ensaio-de-release-restore-e-configuracao-de-producao.md` | — | 3 | 1 | — | — | 4 |
| `goals/029-timezone-unico-do-negocio.md` | — | 9 | — | — | — | 9 |
| `goals/030-auditoria-final-do-mvp.md` | — | 1 | — | — | — | 1 |
| `goals/058-a-area-logada-volta-a-ter-casca.md` | — | — | — | — | 2 | 2 |
| `goals/065-onboarding-conforme-o-vault.md` | — | 1 | — | — | — | 1 |
| `goals/066-a-importacao-entra-no-onboarding.md` | — | 10 | — | — | — | 10 |
| `goals/067-configuracoes-completas.md` | — | 2 | — | — | — | 2 |
| `goals/068-fidelidade-visual-marca-e-autenticacao.md` | — | 9 | — | — | — | 9 |
| `goals/074-a-home-conforme-o-prototipo.md` | — | 4 | — | — | — | 4 |
| `goals/089-casca-do-onboarding-igual-ao-prototipo.md` | — | — | — | — | 1 | 1 |
| `goals/090-etapas-de-negocio-e-agenda-iguais-ao-prototipo.md` | — | 3 | — | — | 1 | 4 |
| `goals/093-detalhe-cancelar-e-remarcar-iguais-ao-prototipo.md` | — | 3 | — | — | — | 3 |
| `goals/102-o-produto-passa-a-se-chamar-avenly-nas-telas-no-codigo-e-no-prototipo.md` | 84 | — | — | — | — | 84 |
| `goals/105-importacao-igual-ao-prototipo.md` | — | — | — | 1 | — | 1 |
| `goals/109-valores-gravados-e-contratos-passam-a-avenly-sem-quebrar-dado-nem-sessao.md` | 78 | — | — | — | — | 78 |
| `goals/110-as-credenciais-derivadas-passam-a-avenly-sem-derrubar-sessao-nem-chamada-entre-servicos.md` | 25 | — | — | — | — | 25 |
| `goals/111-os-registros-e-a-documentacao-passam-a-dizer-avenly.md` | 81 | — | — | — | — | 81 |
| `MASTER_PLAN.md` | 72 | 13 | — | — | 1 | 86 |
| `MIGRATION_STATUS.md` | 34 | 14 | 1 | 1 | 2 | 52 |
| `QA_LOCAL_REVIEW.md` | — | 6 | 1 | — | — | 7 |
| `REUSE_ANALYSIS.md` | — | — | — | — | 2 | 2 |
| `reviews/001-review.md` | — | — | 2 | — | — | 2 |
| `reviews/002-implementation-r2.md` | — | — | 2 | — | — | 2 |
| `reviews/002-implementation.md` | — | — | 4 | — | — | 4 |
| `reviews/002-review.md` | — | — | 6 | — | — | 6 |
| `reviews/003-review.md` | — | 3 | 3 | — | — | 6 |
| `reviews/004-review.md` | — | — | 1 | — | — | 1 |
| `reviews/005-review.md` | — | — | 1 | — | — | 1 |
| `reviews/006-review.md` | — | — | 1 | — | — | 1 |
| `reviews/007-review.md` | — | 1 | 1 | — | — | 2 |
| `reviews/010-review.md` | — | 3 | — | — | — | 3 |
| `reviews/015-review.md` | — | 2 | — | — | 2 | 4 |
| `reviews/016-review.md` | — | 4 | — | — | 2 | 6 |
| `reviews/018-review.md` | — | 1 | — | — | — | 1 |
| `reviews/020-review.md` | — | 1 | — | — | — | 1 |
| `reviews/021-review.md` | — | — | — | — | 1 | 1 |
| `reviews/026-review.md` | — | 1 | — | — | — | 1 |
| `reviews/027-review.md` | — | 18 | — | — | 1 | 19 |
| `reviews/028-review.md` | — | — | 1 | — | 3 | 4 |
| `reviews/029-review.md` | — | 3 | — | — | — | 3 |
| `reviews/068-review.md` | — | 4 | — | — | — | 4 |
| `reviews/072-review.md` | — | 1 | — | — | — | 1 |
| `reviews/074-review.md` | — | 1 | — | — | — | 1 |
| `reviews/081-review.md` | — | — | 2 | — | — | 2 |
| `reviews/082-review.md` | — | — | 1 | — | — | 1 |
| `reviews/083-review.md` | — | — | 1 | — | — | 1 |
| `reviews/084-review.md` | — | — | 1 | — | — | 1 |
| `reviews/093-review.md` | — | 2 | — | — | — | 2 |
| `reviews/102-review.md` | 21 | — | — | — | — | 21 |
| `reviews/105-review.md` | — | 1 | — | — | — | 1 |
| `reviews/106-review.md` | — | — | — | 1 | — | 1 |
| `reviews/109-review.md` | 12 | — | — | — | — | 12 |
| `reviews/110-review.md` | 4 | — | — | — | — | 4 |
| `VALIDATION_GATE.md` | 142 | 11 | 47 | 4 | — | 204 |
| **Total (65 arquivos)** | **735** | **318** | **144** | **14** | **32** | **1243** |

### Não feito

A troca dos nomes de ambiente (D-122 (viii)), que é do supervisor e do operador. A contração da compatibilidade de D-120 e D-121. A versão legal definitiva. Nenhum arquivo de `docs/design-reference/` nem de `graphify-out/`. Nenhum gate de app, porque nenhum código mudou. A conferência de que o texto do vault continua atual além do nome do produto.

**Nota de fechamento — review111, 2026-10-04.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-124 ACCEPTED na rodada 2, sem blocker, depois de 4 blockers de documento na rodada 1: o campo retirado `ShellConfig.source` trocado por engano (3 ocorrências), a saída do runner e o valor recebido pelo teste trocados por engano (5 ocorrências), a lista de julgamento incompleta e as contagens a refazer. Os onze pontos de julgamento de D-124 ficam aceitos como propostos.
- **Gates do IA Loop.** Só `git diff --check` (WU-06), com exit 0 na rodada 1 (170 ms) e na rodada 2 (180 ms). Nenhum gate de app rodou, porque nenhum código mudou. Snapshot aceito: 171 arquivos (170 `M` e 1 `R098`), hash do diff `2f61d906…`.
- **Conferência do Tech Lead na rodada 2,** com scripts próprios: a prova linha a linha contra `db877ca` (920 linhas mudadas, 1096 ocorrências trocadas e 77 mantidas, só com a exceção declarada de `01-Onboarding.md:200`); os 15 tokens protegidos com a mesma contagem; o inventário acima, que bate arquivo a arquivo; `git ls-files` com o nome antigo só nas duas migrations e nos dois `.zip`; D-120 a D-123 sem hunk; e o status só com arquivos de `docs/`.
- **Aceito sem prova completa.** A contagem de links e âncoras (5965 conferidos, 0 quebrados por este diff, 20 já quebrados na base) vem do script do Developer; o Tech Lead conferiu só os quatro links de DATA_MIGRATION §14 e os títulos mudados. Detalhe no [review111](reviews/111-review.md).

## As telas não perdem o que a pessoa fez quando a largura cruza 1024 px, do Goal112

Texto do Goal112 (decisão [D-126](DECISIONS.md), `PROPOSED`), escrito pela WU-05 da rodada 1 e refeito pela FIX-001 da rodada 2 sobre a árvore final, por acréscimo. Toda contagem diz a execução que a sustenta. O Goal previa D-125, tomada fora do loop pelos nomes de ambiente; a decisão deste Goal é D-126.

### O que a rodada 1 deixou e como a rodada 2 fechou

- **Gate autenticado.** Na rodada 1, `validate:integration` reprovou 9 testes `G-4 pushed screen below 1024px` (clientes, serviços e configurações, em mobile-360, mobile-390 e tablet-768) com `a list is mounted beside the detail below 1024px.`: `e2e/authenticated-matrix.spec.ts` procura `.list-detail` no DOM, e o invólucro sem divisão ainda carregava essa classe. A rodada 1 registrou os gates como não rodados e omitiu a falha. Correção: o invólucro sem divisão passa a ser `div.list-detail-flat`, **sem** a classe `list-detail`; o `.list-detail` existe só com a divisão ligada. O spec não foi editado.
- **Testes existentes.** Pelo mesmo motivo, os sete arquivos que a rodada 1 tinha editado (088, 093, 097, 101, 104, 105 e 106) voltaram a `HEAD`, sem diff: as asserções originais (`querySelector(".list-detail")` nulo abaixo de 1024 px) passam sem mudança, inclusive as do 088 que provam D-103 (f). Nenhum teste existente foi alterado por este Goal.
- **Visual.** O `visual:compare` dos doze quadros foi rodado antes e depois (seção própria abaixo).

### Execuções finais (árvore final, depois dos controles revertidos)

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` em `apps/frontend` | exit 0 |
| `npm run lint` em `apps/frontend` | exit 0, `--max-warnings=0` |
| `npx vitest run tests/goal112-*.test.tsx` | 4 arquivos, **52** testes passando (8 de `goal112-list-detail-stable`, 15 de `goal112-clientes-servicos`, 7 de `goal112-configuracoes-importacao` e 22 de `goal112-agenda`) |
| `npx vitest run` em `apps/frontend` | **153** arquivos e **1893** testes passando, com os sete arquivos antigos sem diff |
| `npm run validate:core` | exit 0, `PASSED`: 17 passos, 15 passaram, 0 falharam, 2 pulados e reportados (`test:bff`, que só existe na integração, e `test:health-worker`, sem suíte) |
| `npm run validate:ui` | exit 0: **169** testes passaram e 21 foram pulados pelo próprio spec, sem retentativa |
| `npm run validate:integration` com `BFF_TEST_DATABASE_URL` apontando para um PostgreSQL descartável em `127.0.0.1:55432/avenly_bff_test` | exit 0, `PASSED`: 36 passos, 36 passaram. O ensaio `rehearse:goal033-authenticated-ui` rodou **274** testes Playwright passando e **1 instável** (ver abaixo). Os quinze `G-4 pushed screen below 1024px` (três telas em cinco devices) passam |
| `git diff --check` | exit 0 |

**Instabilidade registrada.** Um teste passou só na segunda tentativa: `[notebook-1024] onboarding-tom-da-ia › measured, logged in`, com `/onboarding/tom-da-ia did not render its own heading ("Gostou da forma como a IA conversou?") within 20000ms` na primeira (20,7 s) e verde na retentativa (1,9 s). A rota de onboarding não usa `ListDetailLayout` e não foi tocada por este Goal; os outros quatro devices passaram de primeira. Não foi investigada além disso.

**Ambiente.** O banco de integração e os serviços do `visual:compare` usaram bancos PostgreSQL descartáveis num cluster local na porta 55432, criado só para esta rodada; o banco de desenvolvimento do operador não foi tocado.

### Controles negativos

Rodados de novo nesta rodada, sobre a árvore final, um de cada vez, cada um com o arquivo de produção devolvido ao original e o `sha256` conferido igual ao de antes.

| Controle | Edição | Comando | Testes que reprovaram e mensagem |
| --- | --- | --- | --- |
| (a) uma tela volta ao `if (!wide) return …` | `CustomerForm.tsx`: `if (!wide) return form;` antes do `ListDetailLayout` | `npx vitest run tests/goal112-clientes-servicos.test.tsx` | 2 de 15 reprovam, `Goal112 CL4 … estreito para largo e de volta` e `largo para estreito e de volta`: `AssertionError: expected <input autocomplete="name" …(4)></input> to be <input autocomplete="name" …(4)></input> // Object.is equality` |
| (b) o espaço `null` da lista vira um ramo que desloca o painel | `ListDetail.tsx`: `if (!split) return <div className={className}>{panelNode}</div>;` antes do retorno | `npx vitest run tests/goal112-list-detail-stable.test.tsx` | 2 de 8 reprovam, `lista à esquerda: alternar a divisão mantém o nó e o que foi digitado` (`expected <input …(1)></input> to be <input …(1)></input> // Object.is equality`) e `o invólucro do painel também é o mesmo objeto ao cruzar 1024 px` (`expected <div class="list-detail-panel">…(1)</div> to be <div class="list-detail-panel">…(1)</div> // Object.is equality`) |
| (c) a Importação volta a trocar a árvore por `!settings` | `ImportsScreen.tsx`: `if (!wide \|\| !settings) return flow;` antes do `ListDetailLayout` | `npx vitest run tests/goal112-configuracoes-importacao.test.tsx` | 3 de 7 reprovam (`estreito para largo e de volta`, `largo para estreito e de volta` e `na faixa larga, com settings pendente: avançar, resolver settings e manter fase e valores`): `TestingLibraryElementError: Unable to find a label with the text of: E-mail do Minha Agenda` (a fase volta ao início) |

Com os três arquivos revertidos, os mesmos arquivos de teste voltam a passar (execução acima).

### `visual:compare`: doze quadros, quatro devices, antes e depois

Comando, rodado duas vezes: `npm run visual:compare -- --target CL4,CL5,S3,Servicos:S4,M1,N1,IA1,I2,A5,A6,A8,A9`. **Antes:** a mesma árvore com os dez arquivos de `src/` trocados temporariamente pelas versões de `HEAD` (`git show HEAD:…`), devolvidos depois com o `sha256` conferido. **Depois:** a árvore final. A conta `visual-prototipo-v2@example.invalid` foi semeada nas duas vezes contra um BFF local (porta 3002) com scheduling-service e ai-orchestrator em bancos descartáveis; as 48 capturas (12 quadros por 4 devices) saíram nas duas rodadas, e o `side-by-side.png` de A6 em mobile foi aberto e lido como amostra (os demais 47 foram comparados por pixel, abaixo). A porcentagem do `visual:compare` é a diferença de pixels contra o protótipo, a mesma antes e depois em todos os 48 pares.

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| CL4 (`/clientes/novo`) | 6,2% | 2,7% | 6,6% | 4,1% |
| CL5 (`/clientes/detalhes`) | 9,5% | 4,7% | 6,1% | 5,4% |
| S3 (`/servicos/novo`) | 6,3% | 2,8% | 12,8% | 4,3% |
| S4 (`/servicos/editar`) | 9,9% | 6,0% | 13,7% | 5,3% |
| M1 | 8,5% | 3,8% | 5,9% | 5,1% |
| N1 | 8,2% | 3,8% | 5,9% | 5,2% |
| IA1 | 12,7% | 6,0% | 7,8% | 6,6% |
| I2 (`/importacao`) | 16,0% | 11,3% | 12,2% | 10,8% |
| A5 | 8,0% | 3,4% | 7,9% | 6,3% |
| A6 | 16,0% | 9,0% | 12,4% | 10,3% |
| A8 | 6,4% | 4,7% | 7,8% | 5,8% |
| A9 | 13,8% | 8,0% | 11,7% | 9,6% |

**Antes contra depois, pixel a pixel** (as capturas do app, com `sharp`): dos 48 pares, 35 são byte a byte idênticos; os outros 13 diferem em 2 a 61 pixels (suavização de borda de texto, sem deslocamento de bloco), e todos os 48 têm a mesma porcentagem contra o protótipo. Nenhum quadro mudou de desenho por causa desta mudança.

**Divergências que restam contra o protótipo** (as mesmas antes e depois, portanto não vêm deste Goal): o estado da conta de teste: faixa "Atendimento automático parado" por WhatsApp desconectado acima do conteúdo, serviço extra semeado (Coloração), datas do dia no lugar das do protótipo e "Nenhum horário disponível" em vez dos horários do protótipo (lido em A6 mobile) e diferenças de fidelidade que já existiam na baseline. Esta rodada não mexeu em nenhuma delas e não as classifica uma a uma; o que ela prova é que o Goal112 não acrescentou nenhuma.

### Alcance do que foi provado

A única mudança de CSS é `display: contents` em `.list-detail-flat`, `.list-detail-flat > .list-detail-panel` e `.agenda-appt-split.agenda-appt-split-flat`, que existem só com a divisão desligada. A identidade de nó e o valor nos dois sentidos estão provados nos 52 testes novos; a ausência de lista montada abaixo de 1024 px, pelos testes originais (088 e demais) sem alteração e pelos `G-4` do gate autenticado.

**Nota de fechamento — review112, 2026-10-04.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-126 ACCEPTED na rodada 2, sem blocker, depois de 4 blockers na rodada 1: o gate autenticado com nove `G-4` reprovados, sete testes existentes com asserção trocada, o `visual:compare` não rodado e os registros sem a execução final.
- **Gates do IA Loop, rodada 2, todos com exit 0:** `typecheck` (WU-06, 2,3 s), `lint` (WU-07, 21 s), testes alvo (WU-08, 7 s), suíte do frontend (WU-09, 57 s), `validate:core` (WU-10, 129 s), `validate:ui` (WU-11, 53 s), `validate:integration` (WU-12, 746 s) e `git diff --check` (WU-13). Na rodada 1, só WU-12 falhou (exit 1, 723 s). Snapshot aceito: 17 arquivos (13 rastreados e 4 testes novos não rastreados), hash do diff rastreado `e9280bd7…`.
- **Conferência do Tech Lead na rodada 2.** Os testes `goal112`, `goal088` e `goal105`: 6 arquivos e 107 testes passando. O `visual:compare` dos 12 quadros nos 4 devices, refeito num PostgreSQL descartável (porta 55441, com `prisma migrate deploy`) contra a árvore final e uma cópia da base `f2ba7c5` tirada com `git archive`: a porcentagem contra o protótipo é igual nos 48 pares e bate com a tabela acima; as capturas do app antes e depois (`sharp`, limiar 30) dão 0 pixel em 46 pares, 4 pixels em M1 desktop e 1 pixel em S4 tablet paisagem. Os `side-by-side.png` de 10 pares foram abertos (CL4 nos 4 devices, CL5 mobile, S4 mobile, I2 tablet retrato, A9 mobile, A6 tablet paisagem e N1 mobile); os outros 38, só por pixel. A diferença com a contagem do Developer (35 pares idênticos e 13 com 2 a 61 pixels) é de método: o Developer comparou sem limiar.
- **Aceito sem prova completa.** Os três controles negativos vêm da execução do Developer e não foram refeitos pelo Tech Lead. O teste instável de onboarding não foi investigado.
- **Ambiente.** Na rodada 1, o banco de desenvolvimento do scheduling-service do operador estava sem a migration do enum `CalendarSource` (D-120). Ninguém a aplicou ali: a rodada 2 e o review usaram bancos descartáveis. Detalhe no [review112](reviews/112-review.md).

## A lista de Conversas igual ao protótipo, do Goal113

Texto do Goal113 (decisão [D-127](DECISIONS.md), `PROPOSED`), escrito na rodada 1 e refeito nas rodadas 2, 3, 4 e 5 (FIX-001) contra os blockers do review113. Toda contagem diz a execução que a sustenta; os números abaixo são os da **rodada 5**, sobre a árvore final (a última edição de código foi a classe do invólucro, o CSS da coluna e uma asserção de teste, todos da rodada 5), e não foram copiados de rodada anterior.

### O que a rodada 5 mudou (FIX-001, blocker do review113 da rodada 4)

- Coluna da lista em 1024 px e em 1366 px: `ConversationInbox.tsx` põe a classe `conversation-list-detail` no invólucro dividido (`list-detail conversation-list-detail`), e `avenly-conversations.css` declara `grid-template-columns: 381px minmax(0, 1fr)` só nessa combinação. O quadro usa `width:380px` mais `border-right:1px` em `content-box`, ou seja, 381 px; a regra compartilhada `.list-detail` (380 px com a borda dentro) não foi tocada, e Clientes, Serviços e Configurações seguem como estavam. Teste: `goal113-conversas-composicao` afirma a classe no invólucro dividido.
- Conferido por pixel (linha y=600, cor da borda `#E5DED4`, protótipo e app): divisor em x=612 no desktop e x=380 na paisagem, igual nos dois lados, nos quatro pares medidos (C1 desktop, C1 paisagem, C2 desktop e C3 paisagem); os demais pares usam a mesma regra. `Posso confi…` trunca igual ao quadro em C1 desktop (lido na captura).
- O deslocamento de 1 px abaixo da faixa de abas **não sumiu** com a coluna de 381 px. Medido por pixel: em C2 desktop e em C2 e C3 paisagem, a caixa do aviso começa na mesma linha (133) no quadro e no app, e o texto do aviso e tudo abaixo dele ficam 1 px mais baixos no app (texto em 167 no quadro e 168 no app em C2 desktop e paisagem; linhas abaixo, 236 e 237). O CSS do aviso (`margin 16px … 6px`, `padding 12px 14px`, `13px/1.45`) é o do quadro; não isolei a causa. Continua nas divergências que restam.

### O que a rodada 4 mudou (FIX-001, blockers do review113 da rodada 3)

- Horário da linha (`.conversation-row.is-inbox .conversation-row-time`): ganhou `align-self: baseline`. A regra base `.conversation-row-time` declara `align-self: start`, e o override da lista de entrada não a desfazia, então o horário saía da linha de base do nome (15 px) e ficava 2 px acima do quadro, que alinha por `align-items: baseline`. Conferido por pixel (faixas de tinta da coluna do horário, protótipo contra app, na execução final): em C1, o topo de cada horário coincide nos quatro devices (mobile 155 / 250 / 386; retrato 179 / 274 / 410; paisagem e desktop 175 / 270 / 406 / 502, e 593 no desktop). Em C2 e C3 os horários coincidem em mobile e retrato, e em C3 desktop (305 / 390). Em C2 desktop e em C2 e C3 paisagem, o conteúdo abaixo da faixa de abas (nota, linhas, horários) fica 1 px mais baixo no app, e nesses quadros a faixa de abas não tem o contador da Comercial (divergência 4); não verifiquei se uma coisa causa a outra. Em paisagem e desktop, a coluna da lista é 1 px mais estreita no app (o divisor cai em x=611 no desktop e em 612 no quadro, porque `.list-detail` fixa 380 px com a borda dentro e o quadro tem 380 px mais a borda), e por isso a borda direita dos horários fica 1 px à esquerda (desktop 589 contra 590; paisagem 357 contra 358), o que ainda pinta o horário de vermelho no diff; não corrigi, porque mexeria na largura de `.list-detail`, compartilhada com Clientes e Agenda, fora do escopo desta rodada. O item "horário 1 a 2 px acima" saiu das divergências que restam.
- Registros: D-127 item 8 (cabeçalho de 1024 px, `letter-spacing` do `h2` do vazio, auditoria dos demais títulos e o horário), `CURRENT_STATE` com os números da execução final, controles negativos refeitos depois do CSS da rodada 4, e as tabelas de gates e de `visual:compare` refeitas nesta execução.

### O que a rodada 3 mudou (FIX-001, blockers do review113 da rodada 2)

- Cabeçalho da lista de 1024 px em diante: o `padding-top` de `.is-inbox .conversation-page-header` deixou de herdar os 29 px do tablet em retrato e passou a 25 px, com 1 px de `padding-bottom`; em 768 px o `padding-top` segue 29 px e ganhou o mesmo 1 px de `padding-bottom`. O quadro usa `24px 20px 0` em 1024 px e `28px 28px 0` em 768 px; o 1 px a mais em cima e o 1 px embaixo compensam a altura da linha do título do app, 1 px menor que a do quadro (medido por pixel nas capturas, não por estimativa). Resultado medido: topo do título, da faixa de abas e da primeira linha da lista coincidem com o quadro em linha de pixel (C1 e C4, paisagem e desktop: 38 / 89 / 92 e 38 / 89 / 114; retrato: 42 / 93 / 118). Em mobile o título do app fica 1 px abaixo do quadro (19 contra 18), e a faixa de abas e a lista coincidem; não foi tocado.
- Título do vazio conectado (C4): `.conversation-connected-copy h2` recebeu `letter-spacing: normal`, porque o `h2` herdava `-0.015em` da regra global. O quadro usa um `span` sem espaçamento de letras. As quebras de linha do título coincidem com as do quadro nos quatro devices.

### O que a rodada 2 mudou

- O contador da Comercial, o disco da lupa e os balões do C4 passaram a `box-sizing: content-box` (pílula 32×20, disco 42 px, balões 99×47), como as medidas do quadro. A divergência "gap 126/135" deixou de existir e saiu do D-127 e deste arquivo.
- O suporte a `query` no `visual:compare` foi retirado (harness, entradas de C2 e C3 em `targets.json` e testes). Ficou só `{today}` e `{today-N}`, exceção à D-118 (a) autorizada pelo review113 e registrada no D-127. A divergência 4 (contador da Comercial ausente em C2 e C3) voltou.

### Execuções da rodada 5, sobre a árvore final

A rodada 5 mudou `ConversationInbox.tsx` (uma classe), `avenly-conversations.css` (uma regra), uma asserção em `goal113-conversas-composicao.test.tsx` e os registros. Todas as linhas abaixo foram executadas **depois** dessas edições, na árvore final.

| Comando | Resultado |
| --- | --- |
| `npx vitest run` em `apps/frontend` | **155** arquivos e **1917** testes passando |
| `npx vitest run tests/goal113` em `apps/frontend` | 2 arquivos (`goal113-conversas-lista`, `goal113-conversas-composicao`), **23** testes passando |
| `npx tsc --noEmit` em `apps/frontend` | exit 0 |
| `rtk proxy npx eslint src tests --max-warnings=0` em `apps/frontend` | exit 0 (com o RTK ligado, `npx eslint` e `npm run lint` saem 1 sem mensagem, porque o RTK reescreve a saída do eslint; é problema de ferramenta, e o eslint cru é o que vale) |
| `npm run test:gate` | **249** testes, 249 passam, 0 falham |
| `node --test scripts/tests/visual-responses.test.mjs` | **16** testes, 16 passam, 0 falham |
| `npm run validate:core` | **PASSED**: 15 passos passaram, 0 falharam, 2 pulados e declarados (`test:bff`, que só existe como suíte de integração, e `test:health-worker`, sem suíte automatizada); `audit:static` passou, com a verificação `production_health` pulada (sem alvos pedidos). Dentro dele, `test:frontend` rodou 155 arquivos e 1917 testes, e `test:gate-scripts`, 249 |
| `npm run validate:ui` | **PASSED**: 169 testes passaram e 21 foram pulados (os de toque nos devices sem toque), 0 retentativas, tudo na primeira tentativa |
| `npm run validate:integration` | **PASSED**: 36 de 36 passos, 0 falhas, 0 pulados, contra um PostgreSQL descartável local (`127.0.0.1:55733/avenly_bff_test`). Suítes de vitest dos passos de integração, na ordem: 68 arquivos e 515 testes, 20 e 152, 11 e 77, 3 e 24, todos passando. O gate autenticado de `goal033-authenticated-ui` rodou com **275** testes passando, **0 flaky** e **0 retentativas** ("every test passed on its first attempt"), e é ele que exercita `/conversas` autenticada |
| `git diff --check` | exit 0 |

Na rodada 5, cada gate rodou uma vez e passou na primeira execução; nenhum teste foi retentado nem marcado como flaky.

`validate:integration` recusa rodar sem `BFF_TEST_DATABASE_URL` (não cai no `.env` do BFF). Foi subido um PostgreSQL local descartável em porta própria só para esta execução e depois parado.

### Controles negativos (§6.2)

Rodados de novo na rodada 5, **depois** da última edição de código (a classe do invólucro e a coluna de 381 px), um de cada vez: edição de produção, teste dirigido, reprovação lida, arquivo devolvido por `cp` do original. `cmp` confirma `inboxLenses.ts` e `ConversationInbox.tsx` iguais aos originais depois dos três, e os testes `goal113` voltam a passar 23 de 23.

| Controle | Edição | Comando | Testes que reprovaram e mensagem |
| --- | --- | --- | --- |
| (a) sem o grupo "Aguardando você" | `inboxLenses.ts`, em `groupInbox`: `if (conversationState(conversation) === "waiting-you")` trocado por `if ((1 as number) === 2)` | `npx vitest run tests/goal113-conversas-lista.test.tsx` | 1 de 12: `grupos e linha da aba Comercial > Aguardando você, Hoje e as anteriores, com tempo e motivo`: `AssertionError: expected [ 'Hoje', 'Anteriores' ] to deeply equal [ 'Aguardando você', 'Hoje', …(1) ]` |
| (b) contador sem o filtro de atenção | `inboxLenses.ts`, em `useCommercialAttention`: `own.filter(… needsAttention …).length` virou `own.length` e `items.filter(… needsAttention …).length` virou `items.length` | `npx vitest run tests/goal113-conversas-lista.test.tsx` | 3 de 12: `o contador da Comercial conta só quem exige atenção` (`Unable to find an element with the text: 2`), `em zero o contador some` (`expected 'Comercial22 aguardando você' to be 'Comercial' // Object.is equality`) e `nas outras abas o contador vem da leitura de category=COMMERCIAL` (`Unable to find an element with the text: 1`) |
| (c) `/conversas` sem o invólucro de 1024 px | `ConversationInbox.tsx`, em `InboxWithTabs`: `if (!wide) return inbox;` antes do `return` do invólucro | `npx vitest run tests/goal113-conversas-composicao.test.tsx` | 3 de 11: `abaixo de 1024 px não há painel nem coluna marcada` (`expected null not to be null`), `aba, termo e busca aberta sobrevivem a 390 -> 1280 -> 390, com os mesmos nós` (`expected null not to be null`) e `a mesma travessia de 1280 -> 390 -> 1280 mantém os mesmos nós` (`expected <input class="input" …(4)></input> to be <input class="input" …(4)></input> // Object.is equality`) |

### Controle da §4.3: o harness novo não muda os alvos antigos

Alvos sem relação com o Goal (W1, I1, Conversas:C5, NT1 e H3), em quatro devices, rodados com o `visual:compare` do commit-base `5b41f44` (extraído por `git archive` para uma cópia fora da árvore, com cópia física de `apps/frontend/node_modules`, porque o Turbopack recusa link simbólico para fora da raiz) e com o harness final desta árvore. Percentual de pixels diferentes por alvo e device (mobile / tablet retrato / tablet paisagem / desktop):

| Alvo | Base `5b41f44` | Harness final |
| --- | --- | --- |
| W1 | 8,1 / 3,4 / 6,0 / 5,0 | 8,1 / 3,4 / 6,0 / 5,0 |
| I1 | 10,0 / 4,4 / 6,7 / 5,6 | 10,0 / 4,4 / 6,7 / 5,6 |
| Conversas:C5 | 2,6 / 0,6 / 0,5 / 0,8 | 2,6 / 0,6 / 0,5 / 0,8 |
| NT1 | 9,8 / 4,2 / 49,0 / 60,1 | 14,1 / 4,2 / 49,0 / 60,1 |
| H3 | 8,1 / 4,1 / 3,7 / 3,0 | 8,1 / 4,1 / 3,7 / 3,0 |

19 de 20 números idênticos. A exceção é NT1 em mobile (9,8 contra 14,1), e ela é variação do próprio alvo, não do harness: repeti NT1 mobile e obtive 8,4 e 8,4 no harness final, e 8,4 e 9,8 na base. O NT1 mobile oscila entre 8,4 e 14,1 de uma execução para outra nas duas árvores. NT1 em paisagem e desktop mostram 49% e 60% nas duas árvores, e é por isso que o percentual é tendência e não gate.

### Conferência visual (`visual:compare`)

Execução final da rodada 5, depois da coluna de 381 px: `npm run visual:compare -- --target Conversas:C1,Conversas:C2,C3,C4`, contra o BFF local sobre PostgreSQL descartável em loopback (`127.0.0.1:55733`): 16 capturas (4 quadros × 4 devices), nenhuma com ERRO, exit 0. O C5 não foi tocado e não foi refeito; seus percentuais são os da rodada 3 (2,6 / 0,6 / 0,5 / 0,8). A porcentagem é a diferença de pixels contra o protótipo. "Rodada 4" é a execução anterior, com a coluna da lista 1 px mais estreita que a do quadro em paisagem e desktop.

| Quadro | mobile | tablet retrato | tablet paisagem | desktop | Rodada 4 (mobile / retrato / paisagem / desktop) |
| --- | --- | --- | --- | --- | --- |
| C1 Comercial | 1,5% | 0,4% | 0,2% | 0,3% | 1,5 / 0,4 / 0,4 / 0,4 |
| C2 Não classificadas | 1,8% | 0,5% | 0,9% | 0,8% | 1,8 / 0,5 / 1,0 / 0,8 |
| C3 Pessoal | 1,7% | 0,4% | 1,1% | 0,4% | 1,7 / 0,4 / 1,2 / 0,5 |
| C4 vazio | 1,0% | 0,1% | 0,7% | 0,3% | 1,0 / 0,1 / 0,7 / 0,3 (C4 não tem coluna de horário) |
| C5 sem WhatsApp | 2,6% | 0,6% | 0,5% | 0,8% | não refeito (C5 não foi tocado) |

**Capturas abertas e lidas** (`side-by-side.png`), na execução final da rodada 5, depois da coluna de 381 px: C1 desktop e C2 paisagem lidas uma a uma; as outras 14 não foram abertas nesta rodada (a mudança é a largura de uma coluna; o divisor foi medido por pixel em quatro pares, abaixo). **Rodada 5:** o divisor entre a lista e o detalhe coincide com o quadro, medido por pixel em x=612 no desktop e em x=380 em paisagem, tanto no quadro quanto no app; as faixas do horário de C1 em desktop e paisagem são idênticas, e o diff de C1 nesses dois devices não mostra o horário em vermelho. O que resta de 1 px vertical está só em C2 desktop e em C2 e C3 paisagem (última divergência da lista abaixo). **Rodada 4 (histórico):** as 16 capturas foram lidas uma a uma, e C1 desktop também em `app.png`. Além disso, medi por pixel as faixas de tinta da coluna do horário, protótipo contra app, nos 16 pares. Resultado da rodada 4: o horário de cada linha de C1 cai na mesma linha de pixel do quadro nos quatro devices, e o horário deixou de ser a diferença vertical em vermelho; os horários de C3 desktop e de C2 e C3 em mobile e retrato também coincidem. Na rodada 4, em paisagem e desktop, o horário ainda aparecia em vermelho no diff por 1 px na horizontal, porque a coluna da lista era 1 px mais estreita no app; a coluna de 381 px da rodada 5 resolveu isso. Título, faixa de abas, rótulo de grupo e linhas da lista caem na mesma linha de pixel do quadro em C1 (paisagem, desktop e retrato), e o título do vazio (C4) não aparece em vermelho como diferença de espaçamento. Em C4 paisagem, o bloco do vazio (balões, título, texto e pílula) fica 1 px abaixo do quadro, e em C4 desktop só o texto de apoio e a pílula, por arredondamento de centralização; não corrigi. O C5 não foi refeito nesta rodada (a primeira execução da rodada 3 sem o serviço de IA no ar deu 14,5 / 7,0 / 6,8 / 5,4, por estado de erro da IA, e foi refeita com o serviço no ar).

**Divergências que restam** (não corrigidas; todas no D-127):

- Casca: item "Notificações" na sidebar, badge "2" em Conversas na sidebar e na barra inferior que o app não mostra, estilo do ícone de Conversas e altura da barra inferior.
- C2: o ponto de "não lida" não existe (D-033).
- C1: "em confirmação" de Pedro não vem do contrato.
- C2 e C3 (divergência 4): o contador da Comercial não aparece no app, porque o `visual:compare` serve à leitura `category=COMMERCIAL` as linhas do próprio alvo, que não exigem atenção. O contador é provado por teste (`goal113-conversas-lista`) e aparece em C1.
- C3: Renata mostra `qui` no app e `ter` no protótipo, porque o app calcula o dia da semana e o alvo usa `{today-3}`; o rótulo depende do dia da captura.
- C1: linha verde-azulada na borda inferior do conteúdo, que é o anel de foco de `main` aplicado pelo `AppShell` ao mudar o `pathname`; a captura sem `steps` a registra.
- C2 desktop e C2 e C3 paisagem: o texto do aviso e o conteúdo abaixo dele ficam 1 px mais baixos no app; a caixa do aviso começa na mesma linha do quadro. A coluna de 381 px não o resolveu, e a causa não foi isolada.
- C1 a C4 mobile: o título "Conversas" fica 1 px abaixo do quadro.
- C5 mobile: o título fica 16 px mais baixo que no quadro, como antes deste Goal.
- O resto é antialiasing de texto e deriva de 1 px por linha.

### Não executado

Não houve conferência humana em aparelho real.

**Nota de fechamento — review113, 2026-10-04.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-127 ACCEPTED na rodada 6, sem blocker, depois de 5, 3, 2, 1 e 1 blockers nas rodadas 1 a 5. A rodada 6 mudou só o parágrafo "Capturas abertas e lidas", que ainda tinha uma frase da rodada 4 sobre a coluna 1 px mais estreita.
- **Gates do IA Loop, rodada 5, todos com exit 0:** `typecheck` (WU-05, 1,7 s), `lint` (WU-06, 14 s), testes `goal113` (WU-07, 2,8 s), suíte do frontend (WU-08, 40 s), `test:gate` (WU-09, 1,4 s), `validate:core` (WU-10, 92 s), `validate:ui` (WU-11, 45 s), `validate:integration` (WU-12, 699 s) e `git diff --check` (WU-13). Na rodada 6, os oito primeiros foram reaproveitados da rodada 5, porque só `docs/**/*.md` mudou, e `git diff --check` rodou de novo com exit 0. Snapshot aceito: 17 arquivos (15 rastreados e 2 testes novos não rastreados), hash do diff `ef98e8c5…`.
- **Conferência do Tech Lead.** Na rodada 6, com o PostgreSQL descartável em `127.0.0.1:55733` ligado só para a execução, `npm run visual:compare -- --target Conversas:C1,Conversas:C2,C3,C4` deu 16 capturas, exit 0, com os percentuais da tabela acima. Os 16 `side-by-side.png` foram abertos nas rodadas 5 e 6. O divisor da lista cai em x=612 no desktop e em 380 na paisagem, no quadro e no app, e as faixas do horário de C1 em desktop e paisagem são idênticas às do quadro.
- **Escopo.** A troca `{today}` e `{today-N}` em `scripts/lib/visual-responses.mjs` e `scripts/visual-compare.mjs` é exceção ao critério 7 do Goal, autorizada no review113 na rodada 1. Nada mais mudou em `scripts/` além do teste `visual-responses.test.mjs`, e nada mudou em `e2e/` além de `targets.json`.
- **Aceito sem prova completa.** Os três controles negativos e o controle do §4.3 vêm da execução do Developer e não foram refeitos pelo Tech Lead. O C5 não foi refeito depois da rodada 3. A causa do 1 px vertical do aviso de C2 e C3 de 1024 px em diante não foi isolada.
- **Redação.** No parágrafo "Capturas abertas e lidas", o parêntese "(última divergência da lista abaixo)" aponta para o sétimo item da lista, não para o último. A frase "o que resta de 1 px vertical está só em…" não conta o 1 px do título mobile de C1 a C4 nem o do bloco do C4, que a lista de divergências registra. A lista está completa. Detalhe no [review113](reviews/113-review.md).

## O chat igual ao protótipo, do Goal114

Texto do Goal114 (decisão [D-128](DECISIONS.md), `PROPOSED`), escrito na rodada 2 (FIX-001) contra os oito blockers do review114 da rodada 1 e corrigido na rodada 3 (FIX-001) contra os três blockers do review114 da rodada 2. A rodada 1 tinha entregado só `targets.json` e o teste de `visual-responses`. Toda contagem abaixo é de execução da rodada 3, depois da última edição de código; nenhuma foi copiada de rodada anterior.

### Ambiente

O BFF de desenvolvimento em `localhost:3002` respondia 500 no login da conta visual (o erro da rodada 1). Ele não foi tocado. O `visual:compare` desta rodada rodou contra uma pilha própria, com BFF em 3012, Scheduling em 3013 e IA em 3010, código da worktree, sobre bancos descartáveis criados só para isto (`g114_bff` e `g114_sched` no PostgreSQL do Docker de desenvolvimento, `g114_ai` no da IA), com `prisma migrate deploy` dos três serviços, laços de fundo desligados e LLM e Evolution da IA apontados para endereço morto. O script foi chamado com `VISUAL_BFF_URL=http://localhost:3012` e `VISUAL_BFF_ORIGIN=http://localhost:3001`, variáveis que ele já aceita. A conta visual foi criada e semeada ali na primeira execução. O banco de desenvolvimento do operador não foi migrado nem semeado. `npx prisma generate` rodou em `apps/ai-orchestrator` antes de `test:gate` (precondição apontada no review). O `validate:integration` rodou num cluster PostgreSQL 18 criado com `initdb` no scratchpad, em `127.0.0.1:55814`, porque a guarda dos testes de integração recusa o Docker, cuja porta interna (5432) não é a declarada.

### Execução de controle (§3.3) e medida de antes

As duas execuções rodaram com `targets.json` e o teste de `visual-responses` já mudados e com os dez arquivos de `apps/frontend/src/` desta rodada trocados temporariamente pelas versões de `HEAD` (`git show HEAD:…`; `ConversationListColumn.tsx`, novo, retirado). `git diff --ignore-all-space -- apps/frontend/src` não mostrou diferença nessa árvore. Depois os arquivos voltaram e o `sha256sum -c` conferiu os dez.

`npm run visual:compare -- --target W1,I1,Conversas:C1`, saída 0. Números iguais aos da baseline do Goal113 nos 12 pares:

| Alvo | Baseline (Goal113) | Controle (Goal114) |
| --- | --- | --- |
| W1 | 8,1 / 3,4 / 6,0 / 5,0 | 8,1 / 3,4 / 6,0 / 5,0 |
| I1 | 10,0 / 4,4 / 6,7 / 5,6 | 10,0 / 4,4 / 6,7 / 5,6 |
| Conversas:C1 | 1,5 / 0,4 / 0,2 / 0,3 | 1,5 / 0,4 / 0,2 / 0,3 |

Medida de antes, `npm run visual:compare -- --target Conversas:C1,C4,K1,K2,K3,K4`, saída 0, capturas guardadas fora do repositório: C1 1,5 / 0,4 / 0,2 / 0,3; C4 1,0 / 0,1 / 0,7 / 0,3; K1 10,2 / 6,2 / 7,5 / 7,1; K2 9,2 / 5,4 / 7,6 / 7,0; K3 8,8 / 5,3 / 7,4 / 6,8; K4 6,2 / 3,6 / 4,9 / 4,9 (mobile / tablet retrato / tablet paisagem / desktop).

### Conferência visual (`visual:compare`) depois

Execução final, depois da última edição de código: `npm run visual:compare -- --target K1,K2,K3,K4,Conversas:C1,C4`, 24 capturas, nenhuma com erro, saída 0.

| Quadro | mobile | tablet retrato | tablet paisagem | desktop | Antes |
| --- | --- | --- | --- | --- | --- |
| K1 IA atendendo | 0,5% | 2,8% | 0,4% | 0,5% | 10,2 / 6,2 / 7,5 / 7,1 |
| K2 aguardando você | 2,1% | 0,9% | 2,0% | 1,0% | 9,2 / 5,4 / 7,6 / 7,0 |
| K3 você atendendo | 6,2% | 2,7% | 2,9% | 2,4% | 8,8 / 5,3 / 7,4 / 6,8 |
| K4 pessoal | 0,0% | 0,0% | 0,5% | 0,5% | 6,2 / 3,6 / 4,9 / 4,9 |
| Conversas:C1 | 1,5% | 0,4% | 0,2% | 0,3% | igual |
| Conversas:C4 | 1,0% | 0,1% | 0,7% | 0,3% | igual |

**C1 e C4 iguais à captura de antes:** a comparação por pixel do `app.png` de antes e de depois (`sharp`, limiar 30 na soma RGB) deu **0 pixel** diferente nos 8 pares.

**Capturas abertas e lidas** (`side-by-side.png` ou `app.png`): as 16 de K1 a K4 da execução final ou de uma execução anterior com o mesmo número; K1 mobile, K2 mobile e K3 mobile em três execuções; K1 desktop e K2 paisagem também em `app.png`. C1 e C4 foram conferidos por pixel contra o antes. O que cada uma mostrou e o que mudou por causa delas:

- K1: na primeira execução a área não rolava até o fim (a altura do chat chega depois da primeira pintura); corrigido com a área presa ao fim e um `ResizeObserver`. Depois disso K1 bate com o quadro em celular, paisagem e desktop.
- K2: a conversa saía "IA com instabilidade", porque `image_received` era marcador de instabilidade; o vault e o quadro dizem "Aguardando você" (D-128 (6)). Corrigido, o avatar fica âmbar e a linha do motivo entra depois da imagem. Na paisagem e no desktop, a linha aberta aguardando você passou a manter o âmbar com a faixa, e a pílula da Fernanda diz só "Aguardando você", como no quadro. O placeholder de duas linhas do celular passou a caber como no quadro.
- K4: a nota estava 10 px mais alta; corrigida. Na rodada 3, o espaço entre "·" e "alterar" tinha uns 4 px, contra os 8 px de `gap` do quadro (`inline-flex; gap: 8px`, com "alterar" como filho próprio), porque o texto e o botão estavam dentro de um só `<span>`. Agora o texto (`<span>`) e o botão são filhos diretos de `.chat-ignored-note` e o `gap` vale entre eles. K4 foi de 0,3 / 0,1 / 0,7 / 0,6 para 0,0 / 0,0 / 0,5 / 0,5. Os `side-by-side.png` dos quatro devices foram abertos: nos de celular e de tablet em retrato a diferença da nota some (0,0%); na paisagem e no desktop o que resta de vermelho está na coluna da lista (divergências de D-127) e na casca, e a nota não aparece mais nas diferenças.
- Cabeçalho do celular 2 px mais baixo que o quadro; corrigido com `margin-top: -2px` (D-128).

**Divergências que restam**, todas em D-128: a sugestão aberta (K2 e K3), que na captura é o botão "Sugerir resposta"; o conteúdo da imagem (K2); a linha "Você editou o agendamento" (K3); o dia da semana dos eventos do K1 (`sáb`, calculado de 2026-09-19, contra `sex` no quadro); a pílula "Hoje" no K3, que o quadro não tem (o histórico do K3 fica 32 px mais baixo, e é por isso que o K3 mobile tem o maior número); o K1 no tablet em retrato, onde o quadro ancora as mensagens embaixo e o app as começa em cima; na coluna da lista, as divergências de D-127 (casca, "em confirmação", contador da Comercial fora da aba Comercial no K4, dia da semana de Renata, prévia da última mensagem da Mãe, que vem do alvo); e antialiasing.

### Controles negativos (§5.2)

Rodados de novo na rodada 3, depois da última edição de código (a que pôs o texto e o botão da nota do K4 como filhos diretos): mutação em `ConversationThread.tsx` por script, teste dirigido, reprovação lida, arquivo devolvido por `cp` da cópia e conferido com `cmp` (`cmp ok` nos três). Depois dos três, `npx vitest run tests/goal114` voltou a 37 de 37.

| Controle | Mutação | Comando | Reprovou |
| --- | --- | --- | --- |
| (a) a barra de estado volta | `div.conversation-state-bar` com o rótulo do estado e o botão "Assumir conversa" logo depois do `</header>` | `npx vitest run tests/goal114-chat.test.tsx` | 1 de 31: `o estado mora no cabeçalho, uma linha por estado > não há barra de estado nem botão Contexto, e o estado aparece uma vez só`: `AssertionError: expected <div …(1)><span></span>…` (esperava `null`) |
| (b) "Assumir" sai do menu | o item "Assumir conversa" do menu "Mais ações" deixa de ser montado (`{false && !closed && (…)}`) | `npx vitest run tests/goal114-chat.test.tsx` | 1 de 31: `toda ação de hoje continua alcançável > o menu Mais ações traz assumir, criar agendamento, categoria, ignorar e resolver`: `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Assumir conversa"` |
| (c) o chat sem o invólucro de 1024 px em diante | `if (wide) return <div className="conversation-workspace">{chat}</div>;` antes do `return` do invólucro | `npx vitest run tests/goal114-chat-composicao.test.tsx` | 5 de 6, entre eles `cruzar 1024 px não apaga o rascunho nem troca o campo > 1280 -> 390 -> 1280 mantém o texto e o mesmo nó`: `AssertionError: expected <textarea …(5)></textarea> to be <textarea …(5)></textarea> // Object.is equality`, e `390 -> 1280 -> 390 mantém o texto e o mesmo nó`: `Unable to find role="complementary" and name "Conversas"` |

### Testes novos e ajustes

- `goal114-chat.test.tsx` (31 testes; na rodada 3, o teste da nota do K4 passou a exigir que o texto e o botão "alterar" sejam filhos diretos de `.chat-ignored-note`): o cabeçalho dos oito estados (K1 a K4 e os sem quadro: IA ativa, IA pausada, IA com instabilidade, resolvida); o ponto que pulsa só com a IA atendendo; a ausência da barra e do botão "Contexto"; "Retomar IA" abrindo o diálogo de devolver; assumir, criar agendamento, mudar a categoria, ignorar e resolver pelo menu, e pelo contexto com você atendendo; o nome abrindo o contexto; os rótulos de autoria; as linhas de evento, com "Você assumiu a conversa" no seu instante e o motivo do K2 depois da imagem; o áudio com a transcrição na mesma bolha; a nota do K4 e o "alterar"; os avisos do composer (K1, K2, K3 e K4, resolvida); nenhuma chamada a `generateSuggestions`, `getMedia` nem à lista ao abrir; "Usar" e "Editar".
- `goal114-chat-composicao.test.tsx` (6 testes): abaixo de 1024 px, sem coluna e sem leitura da lista; de 1024 px em diante, a coluna com a aba da categoria (Comercial e Pessoal) e a linha aberta com `aria-current="page"`; o rascunho e o mesmo nó em 390 → 1280 → 390 e 1280 → 390 → 1280; um só `useShellConfig` vivo nas duas faixas e ao cruzar.
- Ajustes em testes existentes, só pela estrutura que o quadro tira:
  - `goal017-human-handling`: a linha do estado é `.chat-header-state` e "Aguardando você" vem com o tempo; o aviso de enviar-assume com a conversa aguardando você é o placeholder do K2 e a descrição acessível do campo; "Assumir conversa" é aberto pelo menu; o teste de resolver usa a IA atendendo, porque com você atendendo o K3 não tem menu (resolver nesse estado é provado pelo contexto em `goal114-chat`); os testes de categoria abrem o contexto pelo nome.
  - `goal017-a11y`: o grupo de categorias depois de abrir o contexto pelo nome; a sugestão alcançada pelo botão "Usar: {texto}"; o contexto aberto por "Abrir contexto de Marina Duarte".
  - `goal017-contact-profile`: o teste do painel lateral virou "não há coluna de contexto antes de abrir a folha"; a folha é aberta pelo nome; ignorar entra pelo menu "Mais ações", e depois de ignorar a prova é a nota "A IA nunca responde este contato".
  - `goal017-inbox-tabs`: o texto da barra ("A IA responde em nome do negócio na próxima mensagem.") virou a linha do cabeçalho "IA ativa".
  - `goal017-reachability`: o teste do rail virou o da coluna da lista de 1024 px em diante (com `matchMedia` largo), que também aponta para a rota de cada conversa; o contexto é a folha aberta pelo nome.
  - `goal017-shell-invariant`: o contexto é aberto pelo nome, e de novo antes de trocar a categoria.
  - `goal017-suggestions`: o teste "some quando aguardando você" virou "aparece quando aguardando você (K2)", com a prova de que nada é pedido ao abrir. É a única asserção invertida, e a inversão é o comportamento que o K2 e a divergência 4 do Goal pedem (a IA aceita sugestão com `humanHandoff`); o clique de usar passou para o botão "Usar".
  - `goal023-conversation-expired`: "continua listada" (link do rail) virou o cabeçalho da conversa aberta, porque o chat não tem mais rail.

### Execução final

Todas as linhas abaixo rodaram na rodada 3, depois da última edição de código (a nota do K4), sobre a mesma árvore, e a de `validate:integration` reutilizou o cluster PostgreSQL descartável de 127.0.0.1:55814 que já estava de pé.

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit -p .` em `apps/frontend` | saída 0 |
| `rtk proxy npm run lint` em `apps/frontend` | saída 0 |
| `npx vitest run tests/goal114` em `apps/frontend` | 2 arquivos, **37** testes passando |
| `npx vitest run` em `apps/frontend` | **157** arquivos, **1954** testes passando |
| `node --test scripts/tests/visual-responses.test.mjs` | 22 testes, 22 passando |
| `npm run test:gate` | **255** testes, 255 passando, 0 falhas |
| `npm run validate:core` | `PASSED`: 17 passos, 15 passaram, 0 falharam, 2 pulados e reportados (`test:bff`, só na integração, e `test:health-worker`, sem suíte); frontend 157 arquivos e 1954 testes |
| `npm run validate:ui` | **169** passed, "every test passed on its first attempt" |
| `npm run validate:integration` com `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55814/avenly_bff_test` | `PASSED`: **36** de 36 passos, 0 falharam, 0 pulados; o gate autenticado (`rehearse:goal033-authenticated-ui`) passou **275** testes, "authenticated gate retries: 0 — every test passed on its first attempt" |
| `git diff --check` | saída 0 |

Uma primeira tentativa de `validate:integration` com o banco no Docker (`127.0.0.1:5555`) saiu 1 em `test:bff-integration`, com "Connected server port 5432 is not the declared test port." em todos os arquivos: é a guarda dos testes recusando um servidor cuja porta interna não é a declarada. Não vale como veredito; a execução da tabela é a do cluster descartável.

Arquivos mudados: dez em `apps/frontend/src/` (um novo), dois testes novos e oito ajustados em `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e os três registros desta seção. Nenhum outro arquivo de `e2e/` mudou.

### Não executado

Não houve conferência humana em aparelho real.

**Nota de fechamento — review114, 2026-10-04.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-128 ACCEPTED na rodada 3, sem blocker, depois de 8 e 3 blockers nas rodadas 1 e 2. A rodada 3 mudou só a nota do K4 (o texto e o botão "alterar" como filhos diretos de `.chat-ignored-note`), a asserção correspondente de `goal114-chat.test.tsx` e os três registros.
- **Gates do IA Loop, rodada 3, sobre a árvore final, todos com exit 0:** `typecheck` (WU-05, 1,7 s), `lint` (WU-06, 14,5 s), testes `goal114` (WU-07, 3,5 s) e suíte do frontend (WU-08, 40 s), com estado `PASSED`; `test:gate` (WU-10, 1,4 s), `validate:core` (WU-11, 93 s), `validate:ui` (WU-12, 46 s), `validate:integration` (WU-13, 699 s) e `git diff --check` (WU-14), com estado `OBSERVED`, porque a WU-09 (`test:ia-loop`) não se aplica: o repositório não tem esse script. Snapshot aceito: 25 arquivos (22 rastreados e 3 novos não rastreados), hash do diff `a2719b65…`.
- **Conferência do Tech Lead.** Na rodada 3, contra a pilha descartável do Developer (BFF em 3012), `npm run visual:compare -- --target K1,K2,K3,K4,Conversas:C1,C4` deu 24 capturas, exit 0, com os percentuais da tabela acima. Os 16 `side-by-side.png` de K1 a K4 foram abertos nas rodadas 2 e 3, e a nota do K4 bate com o quadro nos quatro devices. `npx vitest run tests/goal114` deu 37 de 37.
- **Escopo.** Os 25 arquivos estão dentro do critério 7 do Goal, sem exceção. Nada mudou em `e2e/` além de `targets.json`, nem em `scripts/` além de `visual-responses.test.mjs`.
- **Aceito sem prova completa.** Os três controles negativos, a execução de controle do §3.3, as capturas de antes e a comparação por pixel de C1 e C4 contra o antes vêm da execução do Developer e não foram refeitos pelo Tech Lead. `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check` foram aceitos pelo exit 0, não por veredito `PASSED`.
- **Ambiente.** `test:gate` exige `npx prisma generate` em `apps/ai-orchestrator`. A guarda dos testes de integração recusa o PostgreSQL do Docker, cuja porta interna é 5432, e por isso `validate:integration` rodou num cluster criado com `initdb`. O BFF de desenvolvimento em `localhost:3002` respondia 500 no login da conta visual. Detalhe no [review114](reviews/114-review.md).

## O menu do chat e "Marcar como pessoal" por conversa ou por contato, do Goal115

Texto do Goal115 (decisão [D-129](DECISIONS.md), `PROPOSED`), escrito na rodada 2 (FIX-001) contra os cinco blockers do review115 da rodada 1. A rodada 1 entregou o código e os testes de unidade, sem a conferência visual, sem `validate:integration` verde, sem os controles negativos depois da última edição e sem os registros. Toda contagem abaixo é de execução da rodada 2, depois da última edição de código; nenhuma foi copiada de rodada anterior.

### Ambiente

Pilha própria para o `visual:compare`: BFF em 3012, Scheduling em 3013 e IA em 3010, código da worktree, sobre bancos descartáveis (`g115_bff`, `g115_sched` e `g115_ai`) num PostgreSQL 18 local em `127.0.0.1:55444`, com `prisma migrate deploy` nos três serviços (22, 26 e 20 migrations, a do Goal115 entre as da IA). O PostgreSQL de antes, na porta 55433, não subiu (`could not bind IPv4 address: Permission denied`), e o mesmo diretório de dados foi aberto na 55444. O BFF de desenvolvimento não foi tocado. O `validate:integration` rodou com `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55444/avenly_bff_test`.

### Migration aplicada em banco descartável

- A migration `20261004120000_goal115_session_category_override` entrou em `prisma migrate deploy` do `g115_ai` (banco vazio, histórico inteiro) e no ensaio `rehearse:goal028-release-migrations` do `validate:integration`, que aplica todo o histórico do zero.
- A primeira execução de `validate:integration` falhou em `test:ai-orchestrator-transport-durability` com `The column ConversationSession.categoryOverride does not exist`, porque o banco `avenly_bff_test_goal004` da suíte de durabilidade é montado pelo ensaio da Goal074 e não tinha a coluna. Exceção autorizada: `alignAiDurabilityTargetWithGoal115` em `scripts/goal074-human-takeover-migration-rehearsal.mjs`, no padrão de `alignAiDurabilityTargetWithGoal109`. Saída do ensaio: `durability target aligned with the Goal115 ConversationSession.categoryOverride column: avenly_bff_test_goal004`.
- Com isso restou uma falha em `apps/ai-orchestrator/tests/integration/goal109-avenly-human-control-source.test.ts` (prova 2): o teste aplica só as migrations anteriores ao Goal109 e semeia pela `SessionService` real, que lê `categoryOverride`. Ajuste: o preparo aplica também a migration do Goal115, com `const GOAL115_MIGRATION` e uma chamada `client.query(migrationSql(GOAL115_MIGRATION))` depois do laço das migrations anteriores (3 linhas). A asserção da prova não mudou.

### Conferência visual (`visual:compare`)

Execução final: `npm run visual:compare -- --target K6,K1,K2,K3,K4,Conversas:C1,C4` com `VISUAL_BFF_URL=http://127.0.0.1:3012` e `VISUAL_BFF_ORIGIN=http://localhost:3001`, 28 pares (7 alvos × 4 devices), nenhum com erro, saída 0. Percentual de pixels diferentes por device:

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| K6, antes (menu "Mais ações" da rodada 1) | 43,1% | 72,9% | 75,0% | 81,0% |
| K6, depois | 0,5% | 0,6% | 0,8% | 1,3% |
| K1 | 0,5% | 2,8% | 0,4% | 0,5% |
| K2 | 2,1% | 0,9% | 2,0% | 1,0% |
| K3 | 6,2% | 2,7% | 2,9% | 2,4% |
| K4 | 0,0% | 0,0% | 0,5% | 0,5% |
| Conversas:C1 | 1,5% | 0,4% | 0,2% | 0,3% |
| Conversas:C4 | 1,0% | 0,1% | 0,7% | 0,3% |

K1 a K4, C1 e C4 saíram com os mesmos números da captura de antes (a do Goal114, repetida nesta rodada). Comparação por pixel do `app.png` de antes e de depois (`sharp`, limiar 30 na soma RGB): 21 dos 24 pares são idênticos; K1, K2 e K3 no desktop diferem em 43 pixels, todos na região x 20 a 40 e y 110 a 751, o serrilhado dos ícones da barra lateral.

**O que as capturas do K6 mostraram.** Abri o `side-by-side.png` dos quatro devices. Na primeira execução do K6 o tablet paisagem deu 4,9%: no quadro paisagem do protótipo o diálogo tem 440 px e o app usava 480 px, porque o ponto dos 440 px estava em 1280 px. Corrigido em `avenly-conversations.css`: `.chat-sheet` tem 440 px de 1024 px em diante e 480 px de 768 a 1023 px (o quadro retrato). Depois disso o paisagem deu 0,8%. É o desvio da folha centrada a partir de 768 px, em D-129 (7).

**Divergências que restam no K6**, as quatro primeiras declaradas no Goal e em D-129:

- o subtítulo do cabeçalho atrás do escurecido, "IA ativa" no app e "Não classificada" no quadro;
- a barra de status do iPhone nos quadros mobile;
- o item "Notificações" e a casca, e, de 1024 px em diante, a coluna da lista com as divergências de D-127;
- dias da semana e datas calculados de `{today}`;
- **não declaradas no Goal, observadas e mantidas** (registradas em D-129): atrás do escurecido o quadro desenha uma conversa simplificada e o app mostra a conversa real, com a pílula "Hoje", a hora da mensagem e o campo de mensagem; a aba "Comercial" da coluna da lista atrás do escurecido não traz o contador; no celular o botão "Marcar como pessoal" aparece em `#0b484c`, a cor de `:hover`, contra `#0f5f63` no quadro, porque o ponteiro do Playwright fica onde estava a linha antes de a folha expandir. Nenhuma dessas é diferença do menu em si. Não afirmo igualdade perfeita: o número do K6 vai de 0,5% a 1,3%, e o que sobra é o que está listado acima.

### Controles negativos (§5.2)

Rodados depois da última edição de código (a do ponto dos 440 px no CSS; depois dela só mudaram um teste de integração e um script de ensaio), por mutação na fonte, teste dirigido, reprovação lida e arquivo devolvido por `cp` da cópia e conferido com `cmp` (sem diferença nos três):

| Controle | Mutação | Comando | Reprovou |
| --- | --- | --- | --- |
| (a) sem a decisão da sessão na precedência | removido o bloco `if (input.sessionOverride) { return { category: input.sessionOverride, source: "MANUAL" }; }` de `resolveEffectiveCategory` em `session-policy.ts` | `npx vitest run tests/session` em `apps/ai-orchestrator` | 8 testes, entre eles `mensagem nova na mesma sessao e sugestao do agente nao desfazem a decisao`: `AssertionError: expected {id: 'conversationSession-1', …} to match object { category: 'PERSONAL', …}` |
| (b) `CONVERSATION` grava o contato | em `SessionService.setCategoryOverride`, `if (scope === "CONTACT")` virou `if (scope === "CONTACT" or scope === "CONVERSATION")`, com o operador `\|\|` | `npx vitest run tests/session` em `apps/ai-orchestrator` | 4 testes, entre eles `a sessao seguinte volta a decisao do contato, que nao foi tocada` e `deixa a sessao aberta Pessoal sem tocar o contato, e a IA nao responde` (`expected … to match { categoryOverride: null …}`) |
| (c) o botão grava sempre `CONTACT` | em `ConversationActionsSheet.tsx`, `onClick={() => onMarkPersonal(scope)}` virou `onMarkPersonal("CONTACT")` | `npx vitest run tests/goal115-chat-menu.test.tsx` em `apps/frontend` | 1 de 21: `o botão grava Só esta conversa com scope CONVERSATION e a folha fecha no sucesso` (`expected "vi.fn()" to be called with arguments`) |

Depois dos três, `tests/session` voltou a 77 de 77 e `goal115-chat-menu` a 21 de 21.

### Testes novos e ajustes

- Novos: `apps/ai-orchestrator/tests/session/goal115-session-category-scope.test.ts` (precedência, escopo, escritas condicionais entrelaçadas, sessão seguinte) e `apps/frontend/tests/goal115-chat-menu.test.tsx` (21 testes: folha, escolha padrão, nada gravado antes do botão, erro, foco, `Escape`, novo destino das ações).
- Ampliados: `tests/session/session-policy.test.ts` e `tests/internal/conversation-controls.routes.test.ts` (IA), `apps/bff/tests/conversation-controls.integration.test.ts` (9 testes, executados, ver abaixo) e `scripts/tests/visual-responses.test.mjs` (K6; 23 testes).
- Ajustes em testes existentes, só pelo lugar novo das ações e sem afrouxar asserção: `goal114-chat.test.tsx` e `goal017-human-handling.test.tsx` (assumir, criar agendamento e resolver passam a ser provados no contexto, e o menu é a folha do K6), `goal017-contact-profile.test.tsx` (o rótulo de ignorar passou de "Ignorar contato na IA" para "Ignorar IA para este contato"); a chamada de `setCategory` em `goal017-human-handling` passou a esperar o terceiro argumento, `"CONTACT"`; `assistant.service.test.ts` só mudou o número de linha de `modules/internal/routes.ts` de 775 para 779 no conjunto de emissores de texto; `goal109-avenly-human-control-source.test.ts` (preparo, descrito acima).

### Execução final

Todas as linhas rodaram na rodada 2 sobre a árvore final (tipo e lint foram repetidos depois das duas últimas edições, a do teste da Goal109 e a do ensaio).

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` em `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` | saída 0 nos três |
| `rtk proxy npm run lint` nos três | saída 0 nos três |
| `npm test` em `apps/ai-orchestrator` | 96 arquivos passaram, 14 pulados; **1223** testes passaram, 101 pulados (integração, rodada no `validate:integration`) |
| `npm test` em `apps/bff` | 20 arquivos passaram, 48 pulados; **157** passaram, 361 pulados (integração) |
| `npx vitest run tests/conversation-controls.integration.test.ts` em `apps/bff` com `BFF_RUN_INTEGRATION_TESTS=true` e o banco descartável | 1 arquivo, **9** testes passando, **nenhum pulado**; sem as variáveis, o mesmo arquivo sai "9 skipped" |
| `npm test` em `apps/frontend` | **158** arquivos, **1975** testes passando |
| `node --test scripts/tests/visual-responses.test.mjs` | 23 testes, 23 passando |
| `npm run test:gate` | **256** testes, 256 passando, 0 falhas |
| `npm run validate:core` | `PASSED`: 17 passos, 15 passaram, 0 falharam, 2 pulados e reportados; testes dos serviços dentro dele: IA 1223, Scheduling 543, frontend 1975 |
| `npm run validate:ui`, nas cinco larguras 360, 390, 768, 1024 e 1440 | **169** passed, "public UI gate retries: 0 — every test passed on its first attempt" |
| `npm run validate:integration` com `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55444/avenly_bff_test` | `PASSED`: **36** de 36 passos, 0 falharam, 0 pulados. Testes: BFF integração 68 arquivos e **518** passando (as nove de `conversation-controls` entre elas, sem pulo), Scheduling 20 arquivos e 152, IA durabilidade 11 arquivos e 77, IA depuração de conteúdo 3 arquivos e 24; o gate autenticado (`rehearse:goal033-authenticated-ui`) passou **275** testes, "authenticated gate retries: 0 — every test passed on its first attempt" |
| `git diff --check` | saída 0 |

A primeira execução de `validate:integration` da rodada saiu 1 pelos dois motivos descritos em "Migration aplicada em banco descartável" e não vale como veredito; a da tabela é a segunda, depois dos dois ajustes.

Arquivos mudados nesta rodada: `avenly-conversations.css` (ponto dos 440 px), `scripts/goal074-human-takeover-migration-rehearsal.mjs`, `goal109-avenly-human-control-source.test.ts` e os quatro registros (D-129, delta de `CURRENT_STATE.md`, esta seção e `DATA_MIGRATION.md` §24).

### Não executado

Conferência em aparelho real; o Goal pede as capturas do `visual:compare`, não aparelho.

**Nota de fechamento — review115, 2026-10-04.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima:

- **Decisão.** D-129 ACCEPTED na rodada 2, sem blocker, depois de 5 blockers na rodada 1. Na rodada 1 a WU-04 (menu) e a WU-05 (provas e registros) ficaram `BLOCKED`, e a WU-17 (`validate:integration`) saiu com exit 1 pela coluna ausente no banco `_goal004`.
- **Gates do IA Loop, rodada 2, sobre a árvore final, todos `PASSED` com exit 0:** `typecheck` da IA, do BFF e do frontend (WU-06 a WU-08), `lint` do frontend (WU-09, 20 s), testes alvo `session` da IA (WU-10, 77 passando e 12 pulados), `conversation-controls` do BFF (WU-11, 9 pulados, porque o gate não recebe as variáveis de integração), `goal115` do frontend (WU-12, 21 de 21), suíte do frontend (WU-13, 158 arquivos e 1975 testes), `test:gate` (WU-14), `validate:core` (WU-15, 114 s), `validate:ui` (WU-16, 49 s), `validate:integration` (WU-17, 751 s) e `git diff --check` (WU-18). Snapshot aceito: 31 arquivos (27 rastreados e 4 novos não rastreados), hash do diff `c20ac04c…`.
- **Conferência do Tech Lead.** Pilha própria descartável: PostgreSQL 18 com `initdb` em `127.0.0.1:55471`, bancos `g115r_*`, `prisma migrate deploy` nos três serviços, BFF em 3022, IA em 3020 e Scheduling em 3023. No banco da IA, `categoryOverride` é `SessionCategory`, anulável e sem default. `npm run visual:compare -- --target K6,K1,K2,K3,K4,Conversas:C1,C4` deu 28 pares, exit 0, com os percentuais da tabela acima. Os quatro `side-by-side.png` do K6, mais K1 tablet-retrato e K3 mobile, foram abertos. Reexecutados: `tests/session` mais `conversation-controls.routes` da IA, 96 de 96; `goal115`, `goal114` e os `goal017` ajustados do frontend, 74 de 74; `conversation-controls.integration` do BFF, 9 de 9 executados contra banco descartável com o env sintético do `validate:integration` (com o env herdado do shell, 6 falhas com 502, por ambiente). A pilha e os dados foram removidos no fim.
- **Escopo.** Os 31 arquivos estão dentro do critério 9 do Goal, com uma exceção autorizada no review da rodada 1: `alignAiDurabilityTargetWithGoal115` em `scripts/goal074-human-takeover-migration-rehearsal.mjs`. Nada mudou em `e2e/` além de `targets.json`.
- **Aceito sem prova completa.** Os três controles negativos, as capturas de antes e a comparação por pixel contra o antes vêm da execução do Developer e não foram refeitos pelo Tech Lead. `validate:integration` foi aceito pelo `PASSED` da WU-17, sem reexecução completa pelo Tech Lead.
- **Ambiente.** O BFF de desenvolvimento em `localhost:3002` não respondia nas duas rodadas, e o `visual:compare` só rodou com pilhas próprias e `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN`. Migration nova da IA lida pela `SessionService` exige alinhar o banco `_goal004` no ensaio `goal074` e o preparo dos testes de integração que aplicam só parte do histórico. Detalhe no [review115](reviews/115-review.md).

## O cliente no chat igual ao protótipo e o controle de como a IA trata o contato, do Goal116

Texto do Goal116 (decisão [D-130](DECISIONS.md), `PROPOSED`), escrito na rodada 3 (FIX-001) contra os quatro blockers do review da rodada 2. Toda contagem abaixo é de execução da rodada 3, sobre a árvore completa; nenhuma foi copiada de rodada anterior. Entre os controles negativos e o fim da execução final não houve edição de código de produto nem dos testes dos controles; a DIAG-001 mudou depois só o timeout de hook dos dois testes de integração `goal109`, que nenhum controle toca: o `git diff` da árvore antes dos controles e depois de toda a execução é byte a byte igual (`cmp`), sem contar este registro.

### Ambiente

PostgreSQL 18 próprio em `127.0.0.1:55561` (cluster novo, `initdb` da rodada), sem nenhuma outra execução de `validate:integration` ao mesmo tempo. O `validate:integration` rodou com `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55561/avenly_bff_test`. A pilha do `visual:compare` usa os bancos descartáveis `g116r3_bff`, `g116r3_sched` e `g116r3_ai` do mesmo cluster, com `prisma migrate deploy` nos três serviços (BFF em 3042, Scheduling em 3043 e IA em 3040), `VISUAL_BFF_URL=http://127.0.0.1:3042` e `VISUAL_BFF_ORIGIN=http://localhost:3001`. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` mudou. A execução isolada da FIX-001 (cluster 55561) passou 36 de 36 sem tocar teste algum. A primeira execução da WU-16 no cluster do harness (127.0.0.1:55500, com os bancos de ensaios anteriores acumulados) reprovou em `test:scheduling-integration` (`Hook timed out in 10000ms` no `afterAll` de `goal109-avenly-calendar-source.test.ts`). O log do PostgreSQL mostrou que o checkpoint forçado pelo `DROP DATABASE ... WITH (FORCE)` levou 12,5 s. A DIAG-001 passou o timeout dos `beforeAll` e `afterAll` que criam e derrubam o banco da prova para `DATABASE_HOOK_TIMEOUT_MS = 120_000`, em `apps/scheduling-service/tests/integration/goal109-avenly-calendar-source.test.ts` e em `apps/ai-orchestrator/tests/integration/goal109-avenly-human-control-source.test.ts`. Nenhuma asserção, passo do gate, `vitest.config` ou `scripts/validate-integration.mjs` mudou. Com isso, a WU-16 passou: `validate:integration PASSED against 127.0.0.1:55500/ia_bff_test`, 36 de 36 passos, gate autenticado 275 passed, retries 0.

### Controles negativos (§4.2)

Rodados sobre a árvore final, por mutação na fonte, teste dirigido, reprovação lida e arquivo devolvido por `cp` da cópia e conferido com `cmp` (sem diferença nos três):

| Controle | Mutação | Comando | Reprovou |
| --- | --- | --- | --- |
| (a) Sempre atende grava o escopo da conversa | em `ConversationThread.tsx`, `chooseTreatment` passou a gravar `setCategory(id, 'COMMERCIAL', 'CONVERSATION')` (o `"CONTACT"` da chamada virou `"CONVERSATION"`) | `npx vitest run tests/goal116-customer-sheet.test.tsx` em `apps/frontend` | 3 de 38: `as gravações do controle > Sempre atende grava COMMERCIAL com scope CONTACT e a posição vem da resposta` (`AssertionError: expected "vi.fn()" to be called with arguments: [ 'conv-1', 'COMMERCIAL', 'CONTACT' ]`), `Automático grava category null com scope CONTACT` e `Pessoal só nesta conversa: tocar Automático, já marcado, grava para tirar a conversa de Pessoal` |
| (b) `ignored:false` antes da categoria | em `toggleIgnored`, com `ignoreExit` definido, `await conversations.setIgnored(conversation.id, false)` passou a vir antes do `setCategory` | `npx vitest run tests/goal116-customer-sheet.test.tsx` em `apps/frontend` | 4 de 38, entre eles `Nunca responde e a saída dele > sair para 'Sempre atende' abre o diálogo, não grava antes e grava a categoria antes de ignored:false` (`AssertionError: expected [ 'ignored', 'category', 'ignored' ] to deeply equal [ 'category', 'ignored' ]`) e `se a categoria falha, setIgnored não é chamado e o erro fica na folha` (`expected "vi.fn()" to not be called at all, but actually been called 1 times`) |
| (c) `contactCategory` sempre `null` | em `apps/ai-orchestrator/src/modules/internal/routes.ts`, `conversationDto` passou a devolver `contactCategory: null` | `npx vitest run tests/internal/goal116-contact-category.test.ts` em `apps/ai-orchestrator` | 6 de 7, entre eles `devolve COMMERCIAL quando o contato tem essa decisao, no detalhe e na lista` (`AssertionError: expected null to be 'COMMERCIAL'`) e `PUT category CONTACT: contactCategory acompanha a decisao gravada` |

Depois de cada reversão: `cmp` do arquivo contra a cópia, sem diferença, e, ao fim, `cmp` do `git diff` inteiro da árvore contra o de antes dos controles, sem diferença. Com a fonte revertida, `goal116-customer-sheet` voltou a 38 de 38 e `goal116-contact-category` da IA a 7 de 7.

### Execução final

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` em `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` | saída 0 nos três |
| `rtk proxy npm run lint` nos três | saída 0 nos três |
| `npm test` em `apps/ai-orchestrator` | 97 arquivos passaram, 14 pulados; **1230** testes passaram, 101 pulados (integração) |
| `npm test` em `apps/bff` | 21 arquivos passaram, 48 pulados; **166** passaram, 361 pulados (integração) |
| `npm test` em `apps/frontend` | **159** arquivos, **2013** testes passando (`goal116-customer-sheet.test.tsx`: 38) |
| `node --test scripts/tests/visual-responses.test.mjs` | 24 testes, 24 passando |
| `npx prisma generate` em `apps/ai-orchestrator`, depois `npm run test:gate` | **257** testes, 257 passando, 0 falhas |
| `npm run validate:core` | `PASSED`: 17 passos, 15 passaram, 0 falharam, 2 pulados e reportados; testes dos serviços dentro dele: IA 1230, Scheduling 543, frontend 2013 |
| `npm run validate:ui`, nas cinco larguras 360, 390, 768, 1024 e 1440 | **169** passed, 21 skipped, "public UI gate retries: 0 — every test passed on its first attempt" |
| `npm run validate:integration` com o banco descartável acima | `PASSED`: **36** de 36 passos, 0 falharam, 0 pulados. Testes: BFF integração 69 arquivos e **527** passando, Scheduling 20 arquivos e 152, IA durabilidade 11 arquivos e 77, IA depuração de conteúdo 3 arquivos e 24; o gate autenticado (`rehearse:goal033-authenticated-ui`) passou **275** testes, "authenticated gate retries: 0 — every test passed on its first attempt" |
| `git diff --check` | saída 0 |

### Conferência visual (`visual:compare`)

`npm run visual:compare -- --target K5,K1,K2,K3,K4,K6,Conversas:C1,C4` com a pilha acima: 32 pares (8 alvos × 4 devices), nenhum com erro, saída 0. Percentual de pixels diferentes por device:

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| K5 | 32,3% | 17,7% | 12,5% | 9,6% |
| K1 | 0,5% | 2,8% | 0,4% | 0,5% |
| K2 | 2,1% | 0,9% | 2,0% | 1,0% |
| K3 | 6,2% | 2,7% | 2,9% | 2,4% |
| K4 | 0,0% | 0,0% | 0,5% | 0,5% |
| K6 | 0,5% | 0,6% | 0,8% | 1,3% |
| Conversas:C1 | 1,5% | 0,4% | 0,2% | 0,3% |
| Conversas:C4 | 1,0% | 0,1% | 0,7% | 0,3% |

K1 a K4, K6, C1 e C4 saíram com os mesmos números das capturas do Goal115. Abri os `side-by-side.png` do K5 nos quatro devices. A estrutura e a ordem dos blocos são as do quadro (cabeçalho com avatar, nome em Literata, telefone e "cliente desde", "Ver perfil", bloco "Resumo da IA", "Próximo", "Último", "Como a IA trata este contato" com o controle de três posições e a frase de baixo). O percentual alto do K5 vem da divergência 7: a seção "Nesta conversa" deixa a folha mais alta que o quadro (no mobile o topo da folha sobe; do tablet em diante a folha centrada é mais alta, com rolagem interna), e tudo que fica abaixo do bloco "Resumo da IA" desce junto, o que o diff conta como pixel diferente.

**Divergências que restam no K5**, todas declaradas no Goal: o botão "Gerar resumo" no lugar do texto do resumo (o resumo é um `POST` sob demanda); dias da semana e datas do "Próximo" e do "Último" calculados de `{today}`; a seção "Nesta conversa", que o quadro não desenha; a conversa real e o seu cabeçalho atrás do escurecido, com a pílula "Hoje", a hora e o campo de mensagem; a barra de status do iPhone no mobile; o item "Notificações" da casca e a coluna da lista de D-127 a D-129. Nenhuma outra diferença visível.

### Escopo

**Escopo.** Os arquivos alterados estão dentro do critério 9 do Goal, com uma exceção autorizada no review116 (rodada 3): `apps/scheduling-service/tests/integration/goal109-avenly-calendar-source.test.ts`, só com o timeout de hook `DATABASE_HOOK_TIMEOUT_MS = 120_000` da DIAG-001. O ajuste igual em `apps/ai-orchestrator/tests/integration/goal109-avenly-human-control-source.test.ts` fica em `apps/ai-orchestrator/tests/` e não é exceção.

### Não executado

Conferência em aparelho real; o Goal pede as capturas do `visual:compare`, não aparelho.

**Nota de fechamento — review116, 2026-10-05.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima, salvo as duas correções de texto que o review da rodada 3 pediu (o parágrafo "Ambiente", a frase sobre edição de código do primeiro parágrafo e o item "Escopo"):

- **Decisão.** D-130 ACCEPTED na rodada 3, depois de 4 blockers na rodada 1 e 4 na rodada 2. O review da rodada 3 terminou `CHANGES_REQUIRED` com 2 blockers só de registro, e o IA Loop aceitou a rodada com os dois adiados para este fechamento, onde foram aplicados.
- **Gates do IA Loop, rodada 3, todos com exit 0 na árvore final:** `typecheck` da IA, do BFF e do frontend (WU-05 a WU-07), `lint` do frontend (WU-08), testes alvo `goal116` dos três serviços (WU-09 a WU-11), suíte do frontend (WU-12), `test:gate` (WU-13), `validate:core` (WU-14) e `validate:ui` (WU-15) foram reaproveitados da rodada 2, porque a FIX-001 da rodada 3 só mudou `docs/`; `validate:integration` (WU-16) rodou de novo: a primeira execução saiu com exit 1 em `test:scheduling-integration`, a DIAG-001 pôs o timeout de hook nos dois testes `goal109`, e a segunda execução (WU-16-g2, 841 s) saiu `PASSED`, com 36 de 36 passos e 275 testes no gate autenticado; `git diff --check` (WU-17) saiu com exit 0. O reaproveitamento dos gates WU-05 a WU-15 é anterior à DIAG-001; o review da rodada 3 registra o `typecheck` da IA e do Scheduling refeito depois dela, com saída 0. Snapshot aceito: 26 arquivos, hash do diff `b258311c…`.
- **Conferência do Tech Lead, rodada 3.** O PostgreSQL 55561 da pilha do Developer recusava conexões (Windows error 487) e o Scheduling em 3043 respondia 503; o Tech Lead reiniciou o cluster com `pg_ctl`, e a pilha 3040/3042/3043 voltou saudável. `npm run visual:compare -- --target K5,K6,K1,K3` deu saída 0, com os mesmos percentuais da tabela acima (K5 32,3 / 17,7 / 12,5 / 9,6%; K6 0,5 / 0,6 / 0,8 / 1,3%; K1 0,5 / 2,8 / 0,4 / 0,5%; K3 6,2 / 2,7 / 2,9 / 2,4%). Os `side-by-side.png` do K5 nos quatro devices e o do K6 no mobile foram abertos. Na rodada 1, o Tech Lead já tinha rodado o `visual:compare` e conferido K5, K6 e K1, depois de reiniciar o PostgreSQL 55481 da WU-02, que falhava com o erro 487.
- **Escopo.** A exceção ao critério 9 está no item "Escopo" acima.
- **Aceito sem prova completa.** Os três controles negativos, a execução isolada no cluster 55561 e as contagens da tabela "Execução final" vêm do Developer e não foram refeitos pelo Tech Lead. `validate:integration` foi aceito pelo `PASSED` da WU-16-g2. K2, K4, `Conversas:C1` e `Conversas:C4` vêm só da execução do Developer.
- **Ambiente.** O cluster do harness acumula os bancos dos ensaios anteriores, e o checkpoint de `DROP DATABASE ... WITH (FORCE)` passou dos 10 s padrão do hook. Teste de integração que cria e derruba banco próprio precisa de timeout de hook explícito. Detalhe no [review116](reviews/116-review.md).

## A Home igual ao protótipo nas pendências, no checklist e na pausa da IA, do Goal117

Texto do Goal117 (decisão [D-131](DECISIONS.md), `PROPOSED`), escrito na rodada 2 (FIX-001) contra os nove blockers do review da rodada 1 e atualizado nas rodadas 3 e 4 (FIX-001 de cada uma). Cada rodada tem o que ela mesma rodou. Os controles negativos, a execução final (typecheck, lint, suítes, `validate:core`, `validate:ui`, `validate:integration`) e as contagens delas vêm da execução da rodada 2, sobre a árvore completa, e nenhuma foi copiada da rodada 1. As rodadas 3 e 4 mudaram só `apps/frontend/src/shared/styles/avenly.css` (CSS do checklist e da Home): a rodada 3 para o blocker do review 2 e a rodada 4 para o do review 3. A rodada 3 não refez a execução final. A rodada 4 refez toda ela sobre a árvore final, pelos gates do harness, com saída 0 (typecheck, lint, suíte do frontend com 160 arquivos e 2038 testes, test:gate, validate:core, validate:ui com 169 passando e 21 pulados, validate:integration com 275 passando e git diff --check). Os controles negativos continuam sendo os da rodada 2, porque nenhuma mudança posterior tocou em código coberto por eles. A rodada 4 também rodou de novo os cinco arquivos de teste da Home (73 testes, todos passando) e o `visual:compare`. A tabela e as notas da conferência visual abaixo são da execução da rodada 4, sobre a árvore final. A última edição de código veio antes dos controles negativos. Depois dos controles e de toda a execução final, o `git diff` de `apps/`, `packages/` e `scripts/` é byte a byte igual ao de logo depois dos controles (`cmp`, sem diferença).

### Ambiente

A pilha do `visual:compare` usa os bancos descartáveis `g117_bff`, `g117_sched` e `g117_ai`, num cluster PostgreSQL 18 próprio em `127.0.0.1:55717`, com `prisma migrate deploy` nos três serviços (BFF em 3052, Scheduling em 3053 e IA em 3050), `VISUAL_BFF_URL=http://127.0.0.1:3052` e `VISUAL_BFF_ORIGIN=http://localhost:3001`. Esse cluster travou com o erro 487 do Windows (login da conta visual com 500 e o Scheduling sem resposta). Ele foi encerrado com `taskkill` no postmaster e religado com `pg_ctl start`, antes de qualquer comparação desta rodada. Os controles (a) e (b) rodaram no banco descartável `g117_bff_test` do mesmo cluster, com o histórico inteiro de migrations. O `validate:integration` rodou num cluster novo (`initdb` da rodada) em `127.0.0.1:55718`, com `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55718/avenly_bff_test` e nenhuma outra execução ao mesmo tempo. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` mudou.

### Controles negativos (§4.2)

Rodados depois da última edição de código, cada um por mutação na fonte e teste dirigido. Depois de ler a reprovação, o arquivo foi devolvido da cópia (`cp`) e conferido com `sha256sum -c` contra o hash de antes da mutação, com resultado `OK` nos três.

| Controle | Mutação | Comando | Reprovou |
| --- | --- | --- | --- |
| (a) a pausa sem gravar `pausedAt` | em `apps/bff/src/modules/settings/routes.ts`, a passagem ligada → desligada passou a gravar `{}` no lugar de `{ pausedAt: new Date() }` | `npx vitest run tests/goal117-ai-paused-at.integration.test.ts` em `apps/bff`, com `BFF_RUN_INTEGRATION_TESTS=true` e `BFF_TEST_DATABASE_URL` no banco descartável | 3 de 9: `pausar (ligada -> desligada) grava o instante, e GET e PATCH o devolvem`, `ligar de novo (PATCH) grava pausedAt null` e `autoativação por teste novo grava pausedAt null`, todos com `AssertionError: expected null not to be null` |
| (b) a autoativação sem limpar `pausedAt` | em `apps/bff/src/lib/ai-activation.ts`, o `update` da autoativação passou de `{ enabled: true, activatedByRunId: run.id, pausedAt: null }` para `{ enabled: true, activatedByRunId: run.id }` | o mesmo | 1 de 9: `autoativação por teste novo grava pausedAt null` (`AssertionError: expected 2026-10-05T16:17:25.718Z to be null`) |
| (c) "Pausar" grava no toque | em `apps/frontend/src/features/dashboard/DashboardScreen.tsx`, `onPause` passou de `() => setPauseOpen(true)` para `() => void writeAi(false)` | `npx vitest run tests/goal117-home.test.tsx` em `apps/frontend` | 5 de 25, todos de `Goal117: confirmação de pausa (H7)`: `Pausar abre a confirmação sem gravar`, `Pausar IA grava { enabled: false, tone } e fecha`, `Continuar atendendo fecha sem gravar e o foco volta a Pausar`, `Escape fecha sem gravar e o foco volta a Pausar` e `a falha ao pausar fica na confirmação com role=alert` (`TestingLibraryElementError: Unable to find role="dialog" and name "Pausar sua IA?"`) |

Com a fonte revertida, `goal117-ai-paused-at` voltou a 9 de 9 e `goal117-home` a 25 de 25.

### Execução final

Números medidos na rodada 2, sobre a árvore completa. A rodada 4 refez a execução pelos gates do harness, com as contagens citadas no início desta seção.

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` em `apps/bff`, `apps/frontend` e `apps/ai-orchestrator` | saída 0 nos três. A primeira chamada no BFF saiu com 2, porque rodou ao mesmo tempo que o `prisma generate` do `validate:integration`, que reescreve o cliente gerado. Rodada de novo sozinha, saiu com 0. |
| `rtk proxy npm run lint` nos três | saída 0 nos três |
| `npx vitest run` em `apps/frontend` | **160** arquivos, **2038** testes passando (`goal117-home.test.tsx`: 25) |
| `npx vitest run` em `apps/bff` | 22 arquivos passaram, 49 pulados; **170** passaram, 370 pulados (integração) |
| testes alvo da Home: `goal018-dashboard-status`, `goal063-home-checklist`, `goal074-home`, `goal087-shell-navigation` e `goal117-home` | 5 arquivos, **73** testes passando |
| `node --test scripts/tests/visual-responses.test.mjs` | 30 testes, 30 passando |
| `npx prisma generate` em `apps/ai-orchestrator`, depois `npm run test:gate` | **263** testes, 263 passando, 0 falhas |
| `npm run validate:core` | `PASSED`: 17 passos, 15 passaram, 0 falharam, 2 pulados e reportados; testes dos serviços dentro dele: IA 1230 (101 pulados), Scheduling 543, frontend 2038 |
| `npm run validate:ui`, nas cinco larguras 360, 390, 768, 1024 e 1440 | **169** passed, 21 skipped, "public UI gate retries: 0 — every test passed on its first attempt" |
| `npm run validate:integration` com o banco descartável acima | `PASSED`: **36** de 36 passos, 0 falharam, 0 pulados. Testes: BFF integração 71 arquivos e **540** passando (com `goal117-ai-paused-at`), Scheduling 20 arquivos e 152, IA durabilidade 11 arquivos e 77, IA depuração de conteúdo 3 arquivos e 24. O gate autenticado (`rehearse:goal033-authenticated-ui`) passou **275** testes, "authenticated gate retries: 0 — every test passed on its first attempt". |
| `git diff --check` | saída 0 |

### Testes existentes ajustados

Só para o novo texto ou o novo lugar, sem afrouxar asserção:

- `goal018-dashboard-status`: o rótulo "Concluir o teste da IA" virou "Fazer o teste real", o rótulo do quadro H4.
- `goal063-home-checklist`: o mesmo rótulo, no docblock e em três asserções. No teste "tudo pendente", `getByRole("link", { name: "Conectar" })` na linha do WhatsApp virou ausência (`queryByRole(...)` nulo), porque só o primeiro pendente tem ação (escolha 3 do Goal). Entrou uma asserção nova: "Cadastrar" → `/servicos` na linha do serviço, que é o primeiro pendente. No teste "WhatsApp conectado", a fixture passou de `{}` para `{ aiActivationReady: true, hoursConfigured: true }`. Com `{}`, o primeiro pendente seria "Cadastrar um serviço", e o teste não teria mais como conferir "Fazer o teste" na linha do teste. Com serviço e horários feitos, o teste é o primeiro pendente, e a asserção de `getByRole("link", { name: "Fazer o teste" })` com o `href` continua igual. Nenhuma asserção saiu sem uma substituta igual ou mais forte.
- `goal074-home`: no teste de pendência, a ordem esperada passou de `["Precisa da sua atenção", "Hoje", "Esta semana"]` para `["Precisa da sua atenção", "Hoje"]`, com a ausência de "Esta semana" afirmada (D-131 (4)). "Novo agendamento" virou "Criar agendamento", o rótulo do quadro. "Pausar" deixou de ser link para `/configuracoes/ia` e virou botão da faixa (D-131 (9)), nos dois testes do Goal087.
- `goal087-shell-navigation`: "Pausar" é botão da faixa, não mais link para `/configuracoes/ia`.

### Conferência visual (`visual:compare`)

`npm run visual:compare -- --target H2,H4,H5,H7,H1,H3,K5,K6,IA1` com a pilha acima, na rodada 4 (a pilha em 3052, 3053 e 3050 já estava de pé e respondeu `200` em `/health`): 36 pares (9 alvos × 4 devices), nenhum com erro, saída 0. Percentual de pixels diferentes por device:

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| H2 | 9,3% | 2,0% | 2,3% | 1,9% |
| H4 | 8,3% | 0,5% | 1,4% | 1,3% |
| H5 | 8,2% | 1,1% | 1,3% | 1,0% |
| H7 | 5,4% | 1,0% | 1,7% | 0,8% |
| H1 | 12,2% | 6,4% | 7,8% | 6,7% |
| H3 | 7,4% | 1,7% | 1,9% | 1,4% |
| K5 | 32,3% | 17,7% | 12,5% | 9,6% |
| K6 | 0,5% | 0,6% | 0,8% | 1,3% |
| IA1 | 12,7% | 6,0% | 7,8% | 6,6% |

Capturas abertas na rodada 4: H4 em tablet retrato, antes e depois da mudança, e H4 em mobile (lado a lado). Os outros pares só foram conferidos pelo percentual, que mudou desde a rodada 2 só em H2 (tablet retrato 2,1 para 2,0% e desktop 2,0 para 1,9%), H4 (tablet retrato 0,7 para 0,5%), H5 (tablet paisagem 1,4 para 1,3%), H7 (1,1/1,8/0,9 para 1,0/1,7/0,8%) e H3 (tablet paisagem 2,0 para 1,9%); as capturas abertas das rodadas anteriores ficam nos registros delas.

**Blocker da rodada 3 (H4, tablet retrato 768×1024).** A linha "Fazer o teste real" do checklist ficava 16 px mais baixa que no quadro e o cartão terminava 16 px antes. O rótulo quebra em duas linhas nessa largura ("Fazer o teste" / "real") e o quadro deixa a linha crescer com o texto (`padding:12px 16px` com um `<span>` de 15px em fluxo normal), enquanto `.checklist-link` tinha `min-height: 44px` com `margin: -10px 0`, que fixava a linha em 48 px. A rodada 4 trocou isso por `padding: 13px 0` com `margin: -13px 0` (o mesmo recurso que o quadro usa em "Ver agenda"): o alvo de toque tem 45 px com uma linha de texto, e a linha passa a crescer com o texto. Depois da mudança, o cartão termina no mesmo ponto do quadro e a linha do teste fica na mesma altura; H4 em tablet retrato foi de 0,7% para 0,5%. Mobile, paisagem e desktop não quebram o rótulo e ficam como estavam.

- **H2, H4, H5 e H7** batem com os quadros, salvo as divergências de D-131. H4 mostra a faixa clara "IA inativa · Falta conectar o WhatsApp e fazer o teste", com o anel vazado e sem botão. H2 e H4 não têm "Esta semana". Os traços de "Hoje" têm a cor do serviço: Ana Paula roxo, Juliana Mendes dividido em laranja e verde, Bia Castro laranja. H5 não tem a linha "Cliente · Dentista". H7 abre a confirmação pelo passo obrigatório. No mobile, todo o conteúdo fica cerca de 16 px mais baixo que no quadro. O `visual:compare` já recorta os 62 px da barra de status. O deslocamento vem do respiro de topo da casca do app, porque o quadro usa `padding:66px` (62 de barra mais 4). É uma divergência da casca e da barra de status, aceita nos reviews (D-131, primeira divergência).
- **K5, K6 e IA1** saíram com os mesmos números da captura de antes (baseline `cf6704c`), e o `app.png` dos 12 pares é igual pixel a pixel ao de antes (0 pixel diferente).
- **H1 e H3** mudaram contra a captura de antes, com o percentual menor nos oito pares: H1 de 12,7/7,4/8,4/7,1% para 12,2/6,4/7,8/6,7%, e H3 de 8,1/4,1/3,7/3,0% para 7,4/1,7/2,0/1,4%. As mudanças são duas. Primeira: o traço colorido de "Hoje" (D-131 (7)), autorizado no review117. Segunda: o checklist "Ative sua IA" entre a faixa e "Hoje", que a conta de teste mostrava na baseline, saiu. O motivo está em D-131 (10): a conta de teste está no estado do H4, e H1 e H3 passam a fixar `GET /v1/status` com a IA ligada. A faixa vermelha "WhatsApp desconectado" com "Reconectar WhatsApp", "Hoje" com "agora" e "Esta semana" continuam como antes. A sidebar não muda, porque a desconexão do WhatsApp vence o estado da IA em `aiCardView`.

### Escopo

Os arquivos alterados estão dentro do critério 8 do Goal: `apps/bff/prisma/`, `apps/bff/src/modules/settings/`, `apps/bff/src/lib/ai-activation.ts`, `apps/bff/src/modules/account/service.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `packages/public-api-contract/src/schemas.ts`, `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e os quatro registros. Nenhum ensaio ou teste de integração fora disso precisou da coluna nova (achado do §1.6 em D-131).

### Não executado

Conferência em aparelho real; o Goal pede as capturas do `visual:compare`, não aparelho.

**Nota de fechamento — review117, 2026-10-05.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima, salvo as duas correções de texto que o review da rodada 4 pediu (a frase sobre a execução final no primeiro parágrafo e a frase sobre o deslocamento do mobile em "Conferência visual"). A linha que atribui a tabela "Execução final" à rodada 2 entrou junto:

- **Decisão.** D-131 ACCEPTED na rodada 4, depois de 9 blockers na rodada 1, 1 na rodada 2 e 2 na rodada 3. O review da rodada 4 terminou `CHANGES_REQUIRED` com 3 blockers só de registro, e o IA Loop aceitou a rodada com os três adiados para este fechamento, onde foram aplicados.
- **Gates do IA Loop, rodada 4, todos com saída 0 na árvore final:** `typecheck` do BFF e do frontend (WU-05 e WU-06), `lint` do frontend (WU-07), testes alvo `goal117` do BFF e do frontend (WU-08 e WU-09), suíte do frontend (WU-10), `test:gate` (WU-11), `validate:core` (WU-12), `validate:ui` (WU-13), `validate:integration` (WU-14, 716 s) e `git diff --check` (WU-15). Snapshot aceito: 24 arquivos, hash do diff `c8f3462a…`.
- **Conferência do Tech Lead, rodada 4.** `npm run visual:compare -- --target H2,H4,H5,H7`: 16 pares, saída 0, com os percentuais da tabela acima. Os 16 `side-by-side.png` foram abertos. No H4, as bordas das linhas do checklist em tablet retrato ficam iguais no quadro e no app (y 279/328/377/436/501, cartão até 501); em tablet paisagem e desktop, deslocadas 1 px; no mobile, com a mesma altura e um deslocamento uniforme de 17 px, que é o respiro de topo da casca.
- **Aceito sem prova completa.** Os três controles negativos e as contagens da tabela "Execução final" vêm do Developer, na rodada 2, e não foram refeitos pelo Tech Lead. K5, K6 e IA1 vêm só do `visual:compare` do Developer. Detalhe no [review117](reviews/117-review.md).

## A Agenda igual ao protótipo no dia vazio, no calendário, no botão de criar e nos dias visíveis, do Goal118

Texto do Goal118 (decisão [D-132](DECISIONS.md), `PROPOSED`), escrito na rodada 2 (FIX-001) contra os oito blockers do review da rodada 1. Tudo abaixo foi rodado nesta rodada, sobre a árvore completa. Nada foi copiado da rodada 1. As duas primeiras execuções do `validate:integration` reprovaram 1 de 275 testes do gate autenticado (abaixo), e a correção foi no CSS do título. Os controles negativos rodaram de novo depois de cada correção, e a última rodada deles veio depois da última edição de código. Depois disso, só mudaram os três registros desta seção.

### Ambiente

A pilha do `visual:compare` usa os bancos descartáveis `g118_bff`, `g118_sched` e `g118_ai`, num cluster PostgreSQL 18 próprio em `127.0.0.1:56318` (criado com `initdb` no scratchpad da sessão, fora do repositório). `prisma migrate deploy` e `prisma generate` rodaram nos três serviços. O BFF ficou em 3012, o Scheduling em 3013 e a IA em 3010, todos com `tsx src/server.ts`, os laços de fundo desligados e o OpenAI apontando para uma porta de loopback onde nada escuta. As chamadas usaram `VISUAL_BFF_URL=http://127.0.0.1:3012` e `VISUAL_BFF_ORIGIN=http://localhost:3001`. Os três `/health` responderam `200`. A conta visual foi criada e semeada pelo próprio `visual:compare` na primeira chamada. O `validate:integration` usou o banco descartável `avenly_bff_test` no mesmo cluster, depois de os três serviços da pilha visual serem parados.

### Controles negativos (§3.2)

Rodados três vezes, a última depois da última edição de código (o CSS do título), com o mesmo resultado nas três, por mutação na fonte (`scratchpad/mutate.py`) e `npx vitest run tests/goal118-agenda.test.tsx` em `apps/frontend`. Antes, `AgendaVisibleDaysSheet.tsx`, `AgendaCalendarSheet.tsx` e `AgendaBoard.tsx` foram copiados para fora do repositório. Depois de ler a reprovação, os três voltaram da cópia (`cp`), e `cmp` contra a cópia saiu sem diferença nos três, depois de cada controle.

| Controle | Mutação | Reprovou |
| --- | --- | --- |
| (a) a folha do A12 grava no toque | em `AgendaVisibleDaysSheet.tsx`, o `onToggle` de cada linha passou a chamar `updateAgendaViewPreference` logo depois de `toggle(day)` | 2 de 30: `os interruptores não gravam nada antes de 'Salvar', e fechar descarta o rascunho` (`AssertionError: expected "vi.fn()" to not be called at all, but actually been called 2 times`) e `'Salvar' grava só hiddenWeekdays, em ordem, …` (`expected "vi.fn()" to be called 1 times, but got 3 times`) |
| (b) os pontos do A3 da janela já carregada | em `AgendaCalendarSheet.tsx`, os pontos passaram a vir de `marksFrom(loadedEntries)`, com as entradas que a Agenda já tinha (passadas por `AgendaBoard.tsx`), e o efeito da leitura do mês passou a sair antes de ler | 4 de 30: `lê o mês da grade com as três leituras e marca ponto …` (`TestingLibraryElementError: Unable to find role="button" and name /^terça-feira, 15 de setembro, com atendimentos$/`), `‹ › trocam de mês com uma leitura nova` (o mesmo, para 20 de outubro), `a falha da leitura do mês deixa a folha navegável …` (`expected "vi.fn()" to be called with arguments`) e `Escape fecha sem mover a Agenda, … e cancela a leitura em voo` (`expected undefined to be defined`) |
| (c) "Agendamento" sem `createAppointments` | em `AgendaBoard.tsx`, a condição da linha passou de `capabilities.createAppointments &&` para `(capabilities.createAppointments \|\| true) &&` | 1 de 30: `Agendamento só com createAppointments; os outros três só com manageAvailability` (`AssertionError: expected [ …(4) ] to deeply equal [ StringContaining{…}, …(2) ]`) |

Com a fonte revertida, `goal118-agenda` voltou a 30 de 30 (e a suíte inteira do frontend passou, abaixo).

### Execução final

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` em `apps/frontend` (antes e depois da última edição) | saída 0 |
| `rtk proxy npm run lint` em `apps/frontend` (antes e depois da última edição) | saída 0 |
| `npx vitest run` em `apps/frontend` (antes e depois da última edição) | **161** arquivos, **2068** testes passando (`goal118-agenda.test.tsx`: 30) |
| testes da Agenda: `goal016`, `goal069`, `goal073`, `goal092`, `goal097`, `goal100` e `goal118` | todos passando dentro da suíte acima |
| `node --test scripts/tests/visual-responses.test.mjs` | 33 testes, 33 passando |
| `npm run test:gate` (com o `prisma generate` de `apps/ai-orchestrator` já feito), depois da última edição | **266** testes, 266 passando, 0 falhas |
| `npm run validate:core`, depois da última edição | `PASSED`: 17 passos, 15 passaram, 0 falharam, 2 pulados e reportados (`test:bff` e `test:health-worker`) |
| `npm run validate:ui`, nas cinco larguras 360, 390, 768, 1024 e 1440, depois da última edição | **169** passed, 21 skipped, "public UI gate retries: 0 — every test passed on its first attempt" |
| `npm run validate:integration` com `BFF_TEST_DATABASE_URL` no banco descartável acima | `PASSED` na terceira execução: **36** de 36 passos, 0 falharam, 0 pulados. Testes: BFF integração 71 arquivos e **540** passando, Scheduling 20 arquivos e 152, IA durabilidade 11 arquivos e 77, IA depuração de conteúdo 3 arquivos e 24. O gate autenticado (`rehearse:goal033-authenticated-ui`) passou os **275** testes: 274 na primeira tentativa e `[mobile-360] › configuracoes-conta › measured, logged in` na nova tentativa ("the session marker is missing", fora da Agenda; o harness reportou "1 test(s) needed a retry") |
| `git diff --check` | saída 0 |

**Execuções reprovadas do `validate:integration`.** Nas duas primeiras, 35 de 36 passos passaram, e o gate autenticado (`rehearse:goal033-authenticated-ui`) passou 274 de 275 e 273 de 275. Nas duas, `[desktop-1440] › agenda › measured, logged in` reprovou nas duas tentativas, com `elementFromPoint at the centre of the content marker (Agenda, point {"x":268,"y":28}) found button.agenda-date-title, not the marker` (primeira) e `… found span.agenda-date-month, not the marker` (segunda). O marcador `.agenda-page-title` é um `h1` absoluto de 1 px no canto onde o título começa no desktop. Na baseline, o título era um `<strong>` não posicionado, e o `h1` pintava por cima dele. O título-botão tinha `position: relative` (para um `::before` que estendia o alvo de toque), e passou a pintar por cima do marcador. A primeira correção (o `::before` só para baixo) não bastava, porque o botão continuava posicionado. A correção final tira o `position` e o `::before` e estende o alvo de toque com `padding-bottom: 14px` e `margin-bottom: -14px`. O layout não muda: o `visual:compare` de A1, A10, A11, A2, A3, A4 e A12 depois dela deu 0 pixel diferente contra a chamada anterior em A3, A4 e A12, e os mesmos 28 pixels do chevron contra a captura de antes em A1, A10 e A11. A segunda execução teve também `[notebook-1024] › configuracoes-conta` instável ("the session marker is missing"), que passou na nova tentativa. O gate não mudou. A tabela acima traz a terceira execução, sobre a árvore final.

### Testes existentes ajustados

Só para o novo papel, o novo lugar ou o novo texto, sem afrouxar asserção:

- `goal016-agenda-reachability`, `goal069-agenda-structure`, `goal069-agenda-views` e `goal092-agenda-dia`: `getByRole("menu")` virou `getByRole("dialog", { name: "O que você quer adicionar?" })`, e `menuitem` virou `link`, com os mesmos nomes, destinos e ausências por capacidade (escolha 3).
- `goal069-agenda-views`: o motivo "Você não atende neste dia." virou "você não atende neste dia", que passou para o resumo do dia (escolha 1), na asserção de presença e na de ausência.
- `goal092-agenda-dia`: o resumo do dia fechado esperado passou de "Quarta 30" para "Quarta, 30", o texto do A2.
- `goal100-agenda-semana-mes`: a pílula deixou de ser link para `/configuracoes/agenda` e virou botão com `aria-haspopup="dialog"` (escolha 4), nos testes "'Todos os dias' sem ocultos …" (Semana e Mês) e "'Seg–Sáb' com o domingo oculto". No teste "o Dia não tem a pílula", a ausência do link virou a ausência de `.agenda-visible-days` e do botão "Todos os dias"; e o resumo do dia fechado esperado passou de "Quinta 1" para "Quinta, 1", o texto do A2 (escolha 1).
- `goal118-agenda` (da rodada 1): a descrição de "Exceção do dia" passou para "Atender ou fechar um dia fora do horário de sempre" (blocker 5); o teste da disponibilidade "não lida" virou dois, um com a leitura pendente e um com a leitura falhada (blocker 6).

### Ajuste autorizado do gate autenticado

No G-8 de `apps/frontend/e2e/authenticated-matrix.spec.ts`, com a autorização do review da rodada 1: o localizador do item passou de `page.getByRole("menuitem", { name: "Agendamento" })` para `page.getByRole("dialog", { name: "O que você quer adicionar?" }).getByRole("link", { name: /Agendamento/u })`, e o `what` passou de `the "Novo" menu` para `the "Novo" sheet`. O clique real, o timeout e a asserção do formulário "Novo agendamento" não mudaram. Nenhum outro arquivo de `e2e/` mudou, além de `e2e/visual/targets.json`.

### Conferência visual (`visual:compare`)

`npm run visual:compare -- --target A2,A3,A4,A12,A1,A10,A11,A5,A6,AG1,K5,K6,H7` com a pilha acima: 52 pares (13 alvos × 4 devices), nenhum com erro, saída 0. Depois dessa chamada, o vazio do A2 ainda mudou (a medida da barra inferior no tablet), e `npm run visual:compare -- --target A2` rodou de novo sobre o código final. Percentual de pixels diferentes por device:

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| A2 | 7,4% | 3,1% | 3,9% | 3,2% |
| A3 | 4,7% | 3,0% | 5,3% | 3,9% |
| A4 | 16,4% | 8,7% | 11,2% | 8,5% |
| A12 | 1,7% | 3,3% | 3,6% | 3,2% |
| A1 | 10,4% | 4,8% | 5,4% | 4,3% |
| A10 | 15,9% | 4,6% | 5,3% | 4,5% |
| A11 | 10,8% | 5,2% | 5,6% | 4,5% |
| A5 | 8,0% | 3,4% | 7,9% | 6,3% |
| A6 | 16,0% | 9,0% | 12,4% | 10,3% |
| AG1 | 8,3% | 3,7% | 6,1% | 5,1% |
| K5 | 32,3% | 17,7% | 12,5% | 9,6% |
| K6 | 0,5% | 0,6% | 0,8% | 1,3% |
| H7 | 5,4% | 1,0% | 1,7% | 0,8% |

Capturas abertas (`side-by-side.png`, e `app.png` onde indicado): A2 mobile, tablet retrato, tablet paisagem (`app.png`) e desktop; A3 mobile e desktop; A4 mobile e desktop; A12 mobile e desktop; A1 desktop e tablet retrato, e A5 mobile (`app.png`, antes e depois).

- **A2** bate com o quadro, salvo as divergências de D-132. O que mudou nesta rodada, depois de abrir as capturas: hoje passou a ter anel na faixa da semana (faltava) e o rótulo de hoje ficou cinza; o resumo ganhou os 14 px do A2 (de 52 para 56 px abaixo da faixa no mobile, contra 55 no quadro); o `min-height` provisório `calc(100dvh - 224px)` saiu, e o vazio passou a ser medido como o `flex: 1` do quadro (até a borda de baixo no mobile e até a barra inferior no tablet), com o centro a 1 a 5 px do centro calculado pela regra do quadro nos quatro devices; o painel de detalhe do desktop e do tablet paisagem ficou vazio, como no quadro. O vazio fica mais baixo que no quadro porque o aviso de WhatsApp da conta de teste empurra a Agenda (divergência declarada 2). A frase quebra em lugar diferente por causa do dia da semana (divergência declarada 3).
- **A3** bate com o quadro: a folha tem a mesma altura e posição (no desktop, 337 px nos dois, a 460 px de largura), a grade de 5 semanas a 44 px com 6 px entre linhas, o título "Outubro 2026" a 1 px do "Setembro 2026" do quadro, a legenda e "Ir para hoje". O fundo atrás do escurecido e os dias com ponto seguem a conta de teste.
- **A4** bate com o quadro nas três linhas do quadro (alça → título 35 px, título → primeira linha 31 px, linhas de 72 a 73 px e 85 px nos dois), mais a quarta linha declarada.
- **A12** bate com o quadro: no mobile, os sete interruptores, o texto e "Salvar" caem sobre o quadro sem diferença visível; no desktop, a folha tem 475 a 476 px de altura e 460 px de largura nos dois.
- **A1, A10 e A11:** o `app.png` dos 12 pares difere do de antes (capturas da WU-01 da rodada 1, na baseline) só em 28 pixels, no chevron ⌄ ao lado do ano, que é o dos quadros (16 px, traço 2, `#716859`). Na primeira chamada, as abas do desktop e do tablet paisagem tinham andado cerca de 12 px, porque o chevron alargava a coluna do título; a margem de −24 px do chevron a partir de 1024 px devolveu as abas ao lugar.
- **A6, AG1, K5, K6 e H7:** o `app.png` dos 20 pares é igual pixel a pixel ao de antes (0 pixel diferente), inclusive depois da mudança em `ChatSheetShell`.
- **A5:** difere do de antes só no horário de criação do histórico ("16:01" contra "15:11"), porque a conta visual foi semeada de novo neste banco.

### Escopo

Os arquivos alterados estão dentro do critério 8 do Goal, mais o ajuste autorizado do G-8: `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `apps/frontend/e2e/authenticated-matrix.spec.ts` (só o G-8), `scripts/tests/visual-responses.test.mjs` e os três registros.

### Não executado

Conferência em aparelho real; o Goal pede as capturas do `visual:compare`, não aparelho.

**Nota de fechamento — review118, 2026-10-05.** Registrado no fechamento, a partir dos resultados do IA Loop, sem reescrever o texto acima, salvo a linha de `goal100-agenda-semana-mes` em "Testes existentes ajustados", que o review da rodada 2 pediu (o resumo do dia fechado esperado, de "Quinta 1" para "Quinta, 1"):

- **Decisão.** D-132 ACCEPTED na rodada 2, depois de 8 blockers na rodada 1. O review da rodada 2 terminou `CHANGES_REQUIRED` com 1 blocker só de registro, e o IA Loop aceitou a rodada com ele adiado para este fechamento, onde foi aplicado.
- **Gates do IA Loop, rodada 2, todos com saída 0 na árvore final:** `typecheck` (WU-06), `lint` (WU-07), testes alvo (WU-08), suíte do frontend (WU-09), `test:gate` (WU-10), `validate:core` (WU-11), `validate:ui` (WU-12), `validate:integration` (WU-13, 706 s) e `git diff --check` (WU-14). Snapshot aceito: 22 arquivos (19 rastreados e 3 novos), hash do diff `95770e56…`.
- **Rodada 1.** A WU-13 (`validate:integration`) reprovou no G-8 nas cinco larguras, pelo `menuitem` "Agendamento", o que levou ao ajuste autorizado acima. Os gates WU-06 a WU-12 e WU-14 passaram, mas sobre árvore incompleta, e não contam como prova.
- **Conferência do Tech Lead, rodada 2.** Com a pilha descartável descrita em "Ambiente" (os três `/health` com `200`), `npm run visual:compare` de A2, A3, A4 e A12: os 16 `side-by-side.png` foram abertos. A3, A4 e A12 batem com os quadros nos quatro devices; A2 bate em mobile, tablet paisagem e desktop. No A2 em tablet retrato, a faixa da semana e o resumo têm recuo lateral de 24 px e cerca de 10 px a mais abaixo das abas, e o botão flutuante fica 8 px à direita, iguais ao A1 aceito; corrigir mudaria o A1, que o Goal manda manter igual à captura de antes. A1, A10, A11, A5, A6, AG1, K5, K6 e H7 foram comparados pixel a pixel com as capturas de antes da WU-01: K5, K6, H7, AG1 e A6 com 0 pixel diferente; A1, A10 e A11 só nos 28 pixels do chevron; A5 de 72 a 156 pixels, na hora do histórico.
- **Aceito sem prova completa.** Os três controles negativos e as contagens da tabela "Execução final" vêm do Developer, na rodada 2, e não foram refeitos pelo Tech Lead. Detalhe no [review118](reviews/118-review.md).

## O conflito de horário no novo agendamento igual ao protótipo, do Goal119

Texto do Goal119 (decisão [D-133](DECISIONS.md), `PROPOSED`), escrito na rodada 2 (FIX-001) e atualizado na rodada 3 (FIX-001). A execução final abaixo é a da rodada 3, sobre a árvore completa, depois da última edição de código.

### Ambiente

Rodada 2: pilha descartável própria, fora do repositório: um cluster PostgreSQL 18 criado com `initdb` no scratchpad da sessão, em `127.0.0.1:55437`, com os bancos `bff`, `sched`, `ai` (e `avenly_bff_test` para o `validate:integration`), `prisma migrate deploy` e `prisma generate` nos três serviços, o Scheduling em 3500, a IA em 3503 e o BFF em 3502, o `next dev` em 3011. O `visual:compare` rodou com `--app-url`, `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN` apontando para essa pilha, porque o BFF de desenvolvimento em `localhost:3002` não respondia. O cluster de 55433 ficou parado e não foi tocado. O `next dev` reescreve `apps/frontend/AGENTS.md`, que foi restaurado com `git checkout`. Na rodada 3, os gates da execução final rodaram como Work Units do harness (WU-04 a WU-13) na worktree do Goal.

### Correções da rodada 2 (blockers 1 a 6)

- **CSS do rodapé do A7** (`avenly-agenda.css`, só em `.agenda-new-footer.is-conflict`): "Escolher outro horário" transparente (hover `#EFEAE2`, ativo `#E5DED4`) e com 54 px de altura (52 px de conteúdo e 2 px de borda); `letter-spacing: 0` nos dois botões; texto de "Encaixar mesmo assim" em `#F7F4EF`. O CTA do A6 não mudou.
- **`entrySentence`** (`SlotConflictNotice.tsx`): o nome do bloqueio ou do compromisso é o título, senão o motivo, senão só o tipo, como em `describeEntry`. A asserção de `goal016-appointment-create` de que "Almoço" aparece voltou, em `Bloqueio "Almoço" das 12:00 às 13:00.`.
- **Testes novos em `goal119-novo-agendamento-conflito.test.tsx`:** trocar a data e trocar o cliente saem do conflito; compromisso pessoal com e sem título e bloqueio só com motivo (cinco blocos no mesmo teste); depois de "Escolher outro horário" o chip volta ao normal (sem `is-conflict`, sem chip manual extra) e o motivo está limpo quando o conflito reabre.

### Correção da rodada 3

Em `avenly-agenda.css`, `.agenda-new-conflict-title` passou de `line-height: 1.25` para `line-height: normal`, como o título do quadro (`<span style="font-size:15px;font-weight:600">`, sem line-height). Medido em `prototype.png` e `app.png` do `visual:compare` do A7, protótipo contra app. Mobile: caixa âmbar de 130 px nos dois; linhas de texto a partir do topo da caixa: protótipo 19-31, 42-53, 62-74, 81-90, 101-113; app 19-31, 42-53, 61-73, 81-90, 100-112. Tablet em retrato: caixa de 91 px nos dois; protótipo 19-31, 42-54, 62-74; app 19-31, 42-54, 61-73. Diferença de no máximo 1 px. Os controles negativos são os da rodada 2: a rodada 3 não tocou `AppointmentForm.tsx`, o arquivo das mutações.

### Controles negativos (§3.2)

Rodados na rodada 2, depois da última edição de código daquela rodada, por mutação de uma linha em `src/features/agenda/AppointmentForm.tsx` (cópia de segurança fora do repositório), com `npx vitest run tests/goal119-novo-agendamento-conflito.test.tsx` em `apps/frontend`. Depois de cada reprovação, o arquivo voltou da cópia (`cp`) e `cmp` contra a cópia saiu sem diferença nos quatro. Sem mutação, o arquivo tem 24 de 24 testes passando.

| Controle | Mutação | Reprovou |
| --- | --- | --- |
| (a) encaixar sem motivo | `if (!reason) {` virou `if (false) {` em `submitOverride` | 2 de 24: `sem motivo não envia e mostra a mensagem junto ao campo` e `motivo só com espaços também não envia` (`AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times`) |
| (b) leitura falhada tratada como lista vazia | em `readOccupancy`, o `return null;` do `catch` virou `return [];` | 1 de 24: `leitura da ocupação falhou: nunca vira 'nada ocupa'` (`expect(element).toHaveTextContent()`, que esperava o título "Não foi possível ver o que ocupa este horário") |
| (c1) "Escolher outro horário" chama `create` | em `chooseAnotherTime`, `resetSlotChoice();` virou `resetSlotChoice(); void create("motivo");` | 2 de 24: `não escreve, libera a reserva e leva o foco ao primeiro horário livre` e `sem horários livres, o foco vai para a legenda Horário` (`expected "vi.fn()" to not be called at all, but actually been called 1 times`) |
| (c2) "Escolher outro horário" não sai do conflito | em `chooseAnotherTime`, `resetSlotChoice();` virou `void 0;` | 4 de 24: `não escreve, libera a reserva e leva o foco …`, `o chip do horário oferecido volta ao normal e o motivo fica limpo …`, `o chip extra de 'Outro horário' some …` e `sem horários livres, o foco vai para a legenda Horário` (`expect(element).not.toBeInTheDocument()`) |

Limite registrado: a liberação do hold em "Escolher outro horário" não tem controle isolado. O conflito nunca convive com um hold vivo (a recusa do hold é justamente a ausência dele), então `releaseHold` não é chamado nesse caminho, e o teste prova a ausência de qualquer gravação e a saída do conflito. O controle (c) foi demonstrado pelos dois lados que o teste enxerga: chamar `create` e não sair do conflito.

### Execução final

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` em `apps/frontend` (WU-04) | saída 0 |
| `npm run lint` em `apps/frontend` (WU-05) | saída 0 |
| `npm test` em `apps/frontend` (WU-08) e `npx vitest run goal119` (WU-06) | **162** arquivos, **2092** testes passando (`goal119-novo-agendamento-conflito.test.tsx`: 24) |
| `node --test scripts/tests/visual-responses.test.mjs` | 34 de 34 (rodada 2; o arquivo não mudou depois) |
| `npm run test:gate` (WU-09) | **267** de 267, 0 falhas |
| `npm run validate:core` (WU-10) | `PASSED`: 17 passos, 15 passaram, 0 falharam, 2 pulados e reportados (`test:bff` e `test:health-worker`) |
| `npm run validate:ui`, nas cinco larguras (WU-11) | **169** passed, 21 skipped |
| `npm run validate:integration` (WU-12) | `PASSED`, **36** de 36 passos. Gate autenticado: **274** passaram de primeira e 1 flaky, G-7 (detalhe do agendamento a partir de /agenda) em mobile-360. Na primeira tentativa, "Cancelar" mediu 21 px de altura; passou na nova tentativa. O G-7 não usa nada que este Goal mudou. |
| `git diff --check` (WU-13) | saída 0 |

Rodada 2: uma primeira execução do `validate:integration` também passou 36 de 36 (275 do gate autenticado, 0 novas tentativas), mas os controles negativos mutaram `AppointmentForm.tsx` durante o estágio do gate autenticado, e por isso ela não conta como prova. A tabela da rodada 2 era da segunda execução, com a fonte igual à cópia (`cmp` sem diferença) do começo ao fim. A tabela acima é da rodada 3: os WU-04 a WU-13 registram a mesma impressão da fonte (`codeFingerprint`) do começo ao fim.

### Testes existentes ajustados

Só para o novo nome, o novo lugar ou o novo texto, sem afrouxar asserção:

- `goal016-appointment-create`: o painel "O intervalo 12:00–13:00 não está livre nesta agenda" virou o aviso `role="alert"` com "Esse horário já está ocupado" e a frase completa do atendimento e do bloqueio "Almoço" (a asserção do nome "Almoço" foi mantida); "Sobrepor mesmo assim" virou "Encaixar mesmo assim", "Motivo da sobreposição" virou "Motivo do encaixe", e a mensagem passou a "Descreva o motivo do encaixe. Sem motivo, o agendamento não é enviado.".
- `goal083-new-appointment`: os mesmos nomes; a região do painel virou o `alert`, e o teste da criação de "Outro, sem cadastro" agora também afirma os dois botões do rodapé, a ausência do CTA "Criar agendamento" e o texto "Nada na sua agenda ocupa 11:30–11:55, mas o horário fica fora da grade de atendimento.".
- `goal016-a11y`: o botão e o campo com os novos nomes, e a ordem de tabulação passou à do quadro A7: motivo, "Encaixar mesmo assim", "Escolher outro horário". O teste de axe continua cobrindo o estado de conflito.

Os testes da remarcação não mudaram, e `goal101-novo-agendamento` e `goal112-agenda` passam sem ajuste.

### Conferência visual (`visual:compare`)

`npm run visual:compare -- --target A7,A6,A5,A8,A9,A1,AG1` com a pilha acima: 28 pares (7 alvos × 4 devices), nenhum com erro. Percentual de pixels diferentes por device:

| Quadro | mobile | tablet retrato | tablet paisagem | desktop |
| --- | --- | --- | --- | --- |
| A7 (rodada 3) | 15,9% | 4,9% | 8,3% | 6,6% |
| A6 | 16,0% | 9,0% | 12,4% | 10,3% |
| A5 | 7,9% | 3,2% | 7,8% | 6,1% |
| A8 | 6,4% | 4,7% | 7,9% | 5,9% |
| A9 | 13,6% | 8,0% | 11,7% | 9,6% |
| A1 | 10,4% | 4,8% | 5,4% | 3,9% |
| AG1 | 8,3% | 3,7% | 6,1% | 5,1% |

Capturas abertas: os quatro `side-by-side.png` do A7, com o rodapé do A7 medido pixel a pixel contra o quadro nos quatro devices (posição e tamanho dentro de 1 px; cor, fonte e `letter-spacing` iguais), e os `side-by-side.png` de A6, A5, A8, A9, A1 e AG1.

- **A7** bate com o quadro nos quatro devices no chip âmbar, no aviso, nos dois botões e no rodapé, salvo as divergências de D-133; aviso medido por pixel no mobile e no tablet em retrato, dentro de 1 px; no tablet em paisagem e no desktop, o aviso fica abaixo da dobra da captura e não foi medido. O que não bate: a cliente (Ana Paula, da conta visual), a data e os horários da conta; o aviso de WhatsApp desconectado e a casca; no desktop, a coluna do Dia; o campo "Motivo do encaixe" entre o aviso e o rodapé; e, no tablet em paisagem e no desktop, o aviso fica abaixo da dobra do formulário (a faixa de datas e "Outro horário" do A6 aceito empurram o aviso para baixo, e o formulário rola com o rodapé fixo), enquanto o quadro o mostra à vista. Os percentuais acima vêm desses fatores, não do rodapé.
- **A6, A5, A8, A9, A1 e AG1:** capturados e abertos, sem divergência nova visível. Nada do que mudou toca esses quadros (o CSS novo só vale com `.is-conflict`, e o CTA do A6 não mudou). Esta rodada não refez a comparação pixel a pixel contra as capturas de antes da baseline.

### Escopo

Os arquivos alterados estão dentro do critério do Goal: `apps/frontend/src/features/agenda/` (`AppointmentForm.tsx` e `SlotConflictNotice.tsx`), `apps/frontend/src/shared/styles/avenly-agenda.css`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e os três registros.

### Não executado

Conferência em aparelho real; o Goal pede as capturas do `visual:compare`, não aparelho.

**Nota de fechamento — review119, 2026-10-05.** Registrado no fechamento, a partir dos resultados do IA Loop. O texto acima recebeu, neste fechamento, as correções que o review da rodada 3 pediu (abertura, "Correção da rodada 3", "Execução final" e o A7 na conferência visual), e as marcas de rodada 2 em "Ambiente" e "Controles negativos":

- **Decisão.** D-133 ACCEPTED na rodada 3, depois de 9 blockers na rodada 1 e 1 na rodada 2 (o `line-height` do título do aviso). O review da rodada 3 terminou `CHANGES_REQUIRED` com 1 blocker só de registro, e o IA Loop aceitou a rodada com ele adiado para este fechamento, onde foi aplicado.
- **Gates do IA Loop, rodada 3, todos com saída 0 na árvore final:** `typecheck` (WU-04), `lint` (WU-05), testes alvo `goal119` (WU-06), suíte do frontend (WU-08), `test:gate` (WU-09), `validate:core` (WU-10), `validate:ui` (WU-11), `validate:integration` (WU-12, 710 s) e `git diff --check` (WU-13). A WU-07 (`test:ia-loop`) foi pulada: o repositório não tem o script. Snapshot aceito: 12 arquivos (10 rastreados e 2 novos), hash do diff `e329d35b…`.
- **Rodada 1.** Os gates WU-04 a WU-13 passaram, mas sobre árvore incompleta (a WU-02 terminou `BLOCKED` sem `visual:compare`, e a WU-03 não rodou), e não contam como prova.
- **Conferência do Tech Lead.** Rodada 1: A6, A8, A9, A1 e AG1 com 0 pixel diferente contra as capturas de antes da WU-01, e A5 só no horário do histórico. Rodada 2: rodapé, chip e espaço até o aviso do A7 iguais ao quadro nos quatro devices. Rodada 3, na pilha do Developer (cluster 55437): `visual:compare` de A7 e A6, 8 pares sem erro, e o aviso do A7 dentro de 1 px no mobile e no tablet em retrato.
- **Aceito sem prova completa.** Os controles negativos vêm do Developer, na rodada 2; as contagens da execução final vêm dos gates do IA Loop da rodada 3, sem reexecução pelo Tech Lead; o aviso no tablet em paisagem e no desktop não foi medido. Detalhe no [review119](reviews/119-review.md).
