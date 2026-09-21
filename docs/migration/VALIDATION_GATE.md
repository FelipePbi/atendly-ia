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
| `validate:integration` | 35 passos contra um PostgreSQL descartável: geração de client Prisma, migrations, a suíte de integração do BFF, a suíte de integração do Scheduling, a persistência da IA, a purga de conteúdo de conversa (Goal023) e a purga por negócio da IA (Goal025), o outbox do Evolution Go, um ensaio por migration de Goal — o mais recente deles `rehearse:goal027-calendar-source-migration` —, a reconciliação do fuso único do negócio (`rehearse:goal029-timezone-reconciliation`, Goal029) e, desde o Goal028, o ensaio de release (`rehearse:goal028-release-migrations`) e o de dump/restore (`rehearse:goal028-restore`); desde o Goal030, o percurso único de produto ponta a ponta (`rehearse:goal030-mvp-journey`); desde o Goal032, a resposta automática ponta a ponta (`rehearse:goal032-auto-reply`); desde o Goal033, o gate renderizado nas sete telas autenticadas (`rehearse:goal033-authenticated-ui`, último da lista) | Envio real por WhatsApp e origem real do Minha Agenda, em qualquer passo. Jornada de interface passou a ter cobertura **parcial**, só pelo que o Goal033 mede — ver a nota abaixo |
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
`apps/frontend` e `apps/health-worker`). Desde o Goal035, `apps/bff` e
`apps/frontend` resolvem `@atendly-ia/public-api-contract` como dependência
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
