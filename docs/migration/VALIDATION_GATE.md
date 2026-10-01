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
| `PATCH /v1/settings/ai` recusa ligar sem execução `SUCCEEDED` não superada, e com leitura falhando, sem gravar; ordem exclusão → prova → serviço; ligar grava `activatedByRunId`; pausar marca a execução válida e `GET /v1/status` não religa | Que o teste real envia e recebe mensagem de verdade: o número oficial da Atendly não existe no ambiente (D-035); é a conferência humana, **não feita** |
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
| Favicon em `public/brand/atendly-icon.svg`; os quatro PNGs antigos e os cinco SVGs de exemplo do Next saíram de `public/` | — |
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
(2) `atendly-icon.svg` tinha geometria divergente de `Marca.dc.html` (grade
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
| `OperationalBand` resolve uma faixa de estado só, por gravidade, nunca duas ao mesmo tempo (H-01); ordem faixa → "Precisa da sua atenção" → "Hoje" → "Esta semana" (H-06); saem "Próximo atendimento", "O que a Atendly fez hoje", receita estimada e "Ações rápidas"; nenhuma copy técnica (H-08) nem data ISO (H-10) | Fidelidade visual aos protótipos aprovados; hora da pausa da IA e bloqueios pessoais em "Hoje", que pedem dado novo |
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
| `nextAppointmentsByCustomer`/`lastAppointmentsByCustomer` (`atendly-customer-service.ts`): duas consultas `DISTINCT ON` por negócio, `tenantId` em toda consulta, hora local por `instantToLocalDateTime(…, settings.timezone)` | O fuso do processo do Scheduling, que não entra no cálculo |
| `GET /internal/customers/:id` devolve `nextAppointment`/`lastAppointment` pelas mesmas consultas com `[id]` (`appointmentHighlights`) e `appointmentStats` | A busca por telefone (`findCandidatesByPhone`), que mantém filtro e ordem |
| `customerSchema`/`customerDetailSchema` do contrato e do cliente do Scheduling no BFF: campos novos opcionais, checagem de campo não declarado (Goal036) dentro deles | Resposta anterior ao Goal075, que continua válida sem os campos |
| `GET /v1/conversations?customerId=` → orquestrador filtra `contact.customerId` no negócio da sessão | Os filtros de conversa que já existiam |
| `CustomerList.tsx`: "hoje" é a data no fuso de `calendar.getCalendar().timezone`, com `America/Sao_Paulo` quando o calendário não traz fuso ou não responde | O fuso do navegador, que não decide mais o texto da linha |
| `CustomerProfile.tsx`: "Conversa" só com conversa da pessoa; "Agendar" só com `createAppointments`; abas com `role="tablist"`, setas e `?aba=` | Regra de memória, nota, tag, resumo e responsável principal, que não muda |

**Divergências declaradas:** `firstAppointmentDate` conta agendamento de qualquer estado, inclusive cancelado e futuro; os testes de integração §6.1 e §6.2 do Scheduling usam o relógio real; o controle 3 muta o orquestrador. Detalhe em [D-090](DECISIONS.md).

**Vermelho da baseline `6787755` dos testes novos**, rodado na rodada 2 com os 18 arquivos de código do diff servidos de `git show 6787755:<arquivo>` e o `dist` do contrato trocado pelo build da baseline em `packages/public-api-contract`, `apps/bff/node_modules/…` e `apps/frontend/node_modules/…`, tudo restaurado e conferido por hash: Scheduling integração contra PostgreSQL — exit 1, `Tests 3 failed (3)`; Scheduling unidade — exit 1, `Tests 9 failed | 2 passed (11)`; BFF §6.4 — exit 1, `Tests 8 failed (8)`; orquestrador §6.5 — exit 1, `Tests 1 failed | 2 passed (3)`; frontend §6.6 a §6.11 e os testes dos blockers 1 e 2 — exit 1, `Tests 20 failed | 1 passed (21)`. Os que passam contra a baseline são guardas de comportamento que não muda (lista sem fuso, conversa de outro negócio, conversa sem filtro, axe). Saída em [FINAL_AUDIT §51](FINAL_AUDIT.md).

**Sete controles negativos do §7, aplicados e revertidos** depois da execução final, saída colada em [FINAL_AUDIT §51](FINAL_AUDIT.md): (1) `lastAppointment` aceita cancelado: reprova **2** de **3** do teste de integração do Scheduling (§6.1 e, pelo detalhe, §6.2). (2) a lista usa o fuso do servidor: reprova o §6.3. (3) o orquestrador deixa de filtrar por `customerId`: reprova **1** de **3** do §6.5. (4) a linha volta a só nome e telefone: reprova **4** de **6** de `goal075-customer-list.test.tsx`. (5) "Conversa" aparece sem conversa: reprova "sem conversa da pessoa". (6) `AppointmentForm` ignora `customerId`: reprova o §6.9. (7) a faixa "Gerenciado pela Agenda Atendly" volta: reprova "nenhuma das copies proibidas aparece no perfil". Cada um passa sem o defeito, e cada arquivo-alvo volta ao mesmo `git hash-object`.

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
| `formatServiceLine`/`formatServiceDuration`/`formatServicePrice` (`serviceFormatting.ts`): a linha "duração · preço", com recorrência e "a IA não oferece" no inativo | A origem "Agenda Atendly" por linha, que saiu |
| `.service-row-accent` (`atendly-services.css`): `background: var(--swatch, var(--border-strong))`, a mesma variável da prévia de cor do formulário | O texto da linha, que nunca depende da cor |
| `.service-row-link` com `aria-label` `Editar <nome>` cobre a linha inteira; "Corrigir <nome>" só nas pendências | Exclusão de serviço, que não existe |
| Ativar/desativar num botão em `.service-row-actions`, com o mesmo diálogo e o mesmo `PATCH /v1/services/:id` | O formulário de edição, que não ganhou essa ação |
| `incrementDuration`/`decrementDuration` (`ServiceForm.tsx`): passo de 5 minutos, "−" não desce de 5, "+" com campo vazio põe 5; atalhos 30/60/90 com `aria-pressed` | A validação do Goal058 (`min`/`step` do `input[name="duration"]`), que não muda |
| `formatServicePreview` (`serviceFormatting.ts`): a frase por tipo de preço, rotulada "Prévia · como a IA responde" | O texto que o modelo realmente vai gerar — a frase é só prévia do frontend |

**Divergência declarada:** a frase "A IA responde" não usa artigo diante do nome do serviço, porque o frontend não conhece o gênero do nome. Detalhe em [D-091](DECISIONS.md).

**`directory-row` só como marcador.** Todas as regras CSS de `.directory-row` saem de `atendly-services.css`; a classe continua no `<li className="directory-row service-row">` da linha só porque o seletor travado do gate autenticado a usa, sem nenhuma regra CSS em `apps/frontend/src`.

**Desvio declarado do §8 do Goal, autorizado pelo review076, rodada 1:** `e2e/authenticated-matrix.spec.ts` mudou, contra o "fica como está" do §8. Motivo: o serviço semeado de 60 min passa a aparecer como "1 h" na linha que o design exige. A única linha mudada é, em `saveDurationByForm`, `toContainText(\`${minutes} min\`)` → `toContainText(expectedDurationText(minutes))`, mais o helper `expectedDurationText`, que espelha `formatServiceDuration`. A asserção não foi afrouxada: a linha `.directory-row` do serviço semeado ainda tem de mostrar a duração salva.

**Vermelho da baseline `faa0943` dos dois testes novos**, rodado de novo na rodada 3 do IA Loop contra a árvore vigente, sem edição de código, com `ServiceList.tsx` e `ServiceForm.tsx` servidos de `git show faa0943:<arquivo>` e restaurados com `git hash-object` idêntico antes e depois (`ServiceList.tsx` `2a4a4f4a…`, `ServiceForm.tsx` `867d8a86…`, `serviceFormatting.ts` `aa4003ba…`): `npx vitest run tests/goal076-service-list.test.tsx tests/goal076-service-form.test.tsx` — exit 1, `Test Files 2 failed (2)`, `Tests 14 failed | 5 passed (19)`. Contra a árvore do Goal, os mesmos dois arquivos passam: `Tests 19 passed (19)`. Saída em [FINAL_AUDIT §52](FINAL_AUDIT.md).

**Seis controles negativos do §5, aplicados e revertidos** na rodada 3, depois da execução final da rodada 2 e sem edição de código entre as duas, saída colada em [FINAL_AUDIT §52](FINAL_AUDIT.md): (1) a origem "Agenda Atendly" de volta na linha: reprova o §4.1, `Tests 1 failed | 5 passed (6)`. (2) o pendente sem grupo próprio: reprova o §4.2, `Tests 1 failed | 5 passed (6)`. (3) o link sem `Editar <nome>`: reprova o teste de §4.3 com `editable` e o de §4.2, que lê os nomes dos links, `Tests 2 failed | 4 passed (6)`. (4) "+" somando 1 minuto: reprova o §4.5, `Tests 1 failed | 2 passed | 10 skipped (13)`. (5) `STARTING_AT` sem "a partir de": reprova dois casos do §4.6, `Tests 2 failed | 6 passed | 5 skipped (13)`. (6) `DirectorySourceStrip` de volta ao formulário: reprova os dois casos do §4.7, `Tests 2 failed | 11 skipped (13)`. Cada um passa sem o defeito, e os três arquivos-alvo voltam ao mesmo `git hash-object` depois de cada controle (`ServiceList.tsx` `2a4a4f4a562dcacc1c36fd3b847594813f0abc92`, `ServiceForm.tsx` `867d8a86fcf8db647af35d941f1c9608d305c2a1`, `serviceFormatting.ts` `aa4003ba1d464f855ddddaacada60bae298b385b`).

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

O sprite `apps/frontend/public/icons/atendly-icons.svg` passa no `DOMParser` do
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
parseia `public/icons/atendly-icons.svg` e exige um símbolo por `IconName`.

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
| `measureNativeBorderControls` (`apps/frontend/e2e/measure.ts`), chamada no passo "1c" de `apps/frontend/e2e/authenticated-matrix.spec.ts` como `expect.soft`: reprova `input` (fora `hidden`, `checkbox`, `radio`, `range`, `color` e `file`), `select` e `textarea` **renderizado**, com borda visível, em `inset`/`outset` ou com raio `0px`, e nomeia a rota, a largura e o seletor, em toda rota do gate autenticado | Bloqueio, série, remarcação, cancelamento e exceções: não estão em `AUTHENTICATED_ROUTES`, e a regra de `atendly.css` os cobre só por construção |
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
