# Goal 028 — Ensaio de release, restore e configuração de produção

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal027 ACCEPTED](../reviews/027-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

A linha 028 nasceu na v48 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento) como *Ensaio de release, restore e capacidade*. A v49 **reduziu o escopo dela**, sem renumerar, inserir ou remover ID nenhum: este Goal fica com o que é provável em máquina descartável e contra arquivos versionados; execução hospedada de workflow, deploy real e capacidade contratada saem, porque dependem de ambiente que a migração não tem e de **U-03**, que é decisão de pessoa. O motivo está registrado na v49.

## Baseline aceita

Baseline aceita: `977256ac7e592b9eac4cc9cf83a81c2888110fe2`

Goal anterior: 027 — Retirada da fonte externa da agenda

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal027 já integrado em `main` (origem `6a0cd2fb410a8bdb1302c9997281a6b554e41fc5`), incluindo a implementação das seis rodadas, o [review027](../reviews/027-review.md) e a documentação de fechamento. O commit `3112e8ea5ac2bb7f12ddb9939f46acafae72abed`, posterior a ela, corrige apenas o cabeçalho de status do próprio documento do Goal027, que a documentação de fechamento tinha deixado em `READY`, e não toca código. Baseline anterior: `c3255982a00c365831de979b46779ccc6ad8656b` (fechamento026). O diff inicial desta execução contra `977256ac` deve conter, no máximo, artefatos preexistentes de `graphify-out/`, a reconciliação administrativa de `docs/migration/` feita neste planejamento e ajustes de ferramental fora de `apps/`, que ficam preservados fora do escopo.

## Objetivo e posição

Desde o Goal002 a migração tem um gate reprodutível, e ele prova muita coisa sobre **comportamento**. O que ele nunca provou é a **entrega**: que o histórico de migrations de cada serviço aplica do zero, que um banco restaurado de um dump volta íntegro, e que a configuração declarada em `render.yaml` corresponde ao que cada app realmente lê. As três lacunas são verificáveis na árvore de `977256ac`, e duas delas são novas neste planejamento:

- **A IA tem 19 migrations que nenhum gate aplica.** `apps/ai-orchestrator/prisma/migrations` tem 19 diretórios e o app declara `prisma:deploy`, que o `buildCommand` de produção executa. Mas `scripts/validate-integration.mjs` roda `prisma migrate deploy` só para o BFF (`migrate:bff-test-database`, linha 244) e para o Scheduling (dentro de `scripts/provision-scheduling-test-database.mjs`); o banco da IA usado pelo gate (`AI_TEST_DATABASE_URL`, linha 215) é construído **incrementalmente** pelos ensaios de Goal desde o `_goal004`, cada um aplicando o SQL que lhe interessa. A primeira execução real do histórico da IA do zero seria, hoje, o build de produção.
- **Não existe ensaio de restore em lugar nenhum.** As únicas menções a `pg_dump` no repositório estão na wiki vendorizada do Evolution Go (`apps/evolution-go/docs/wiki/`), que não é ferramental desta migração. O [VALIDATION_GATE](../VALIDATION_GATE.md) já declara, nos limites conhecidos, que a auditoria estática não verifica deploy.
- **A configuração de produção derivou do que o código lê.** `render.yaml` não declara `RETENTION_SWEEP_ENABLED` nem `ACCOUNT_PURGE_ENABLED`, cujos defaults em `apps/bff/src/config/env.ts` são `false`: os dois únicos trabalhos irreversíveis da plataforma — a purga de conteúdo do Goal023 e a purga de conta do Goal025 — ficariam **desligados em produção por omissão**, não por decisão escrita. Na direção oposta, `INBOX_WORKER_ENABLED`, `NOTIFICATION_DELIVERY_ENABLED` e `CALENDAR_AUTO_COMPLETE_ENABLED` nascem `true` e também não aparecem no blueprint. `PASSWORD_RESET_PUBLIC_URL` tem default `http://localhost:3001/nova-senha`. E os `buildFilter` de quatro serviços ainda listam `packages/**`, de onde o Goal026 removeu `packages/contracts`.

Este Goal fecha essas três lacunas com prova executável e deixa a plataforma em estado de ensaio de entrega. Ele **não** faz deploy, não roda workflow hospedado, não mede capacidade real, não contrata nem troca provider, e não fecha **U-03** nem **M4** — que continuam sendo decisão e ambiente de pessoa, exatamente como [DECISIONS](../DECISIONS.md) os mantém. Também **não** faz a auditoria final do MVP (**029**), não reabre nenhum aceite de 001–027, não muda regra de negócio, contrato público, tela de produto além do resíduo de §5, nem retenção, lembretes, central, conhecimento ou ciclo de vida da conta.

Entra agora, e nesta ordem, porque o Goal027 acabou de terminar a subtração: ensaiar a entrega de uma árvore que ainda carregasse vocabulário morto seria ensaiar a coisa errada. E entra **antes** da auditoria final porque a auditoria verifica conformidade, não constrói ferramental — descobrir na 029 que o histórico da IA não aplica do zero seria descobrir tarde.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md). **D-026** (histórico legado preservado), **D-041** (purga por negócio derivada do schema), **D-042** e **D-043** (as duas remoções subtrativas) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e toda a API pública vigente.

## Dependências e contexto mínimo

- Goals 002, 023, 025, 026 e 027 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, provisionamento do PostgreSQL descartável sem Docker no Windows, guards de destino descartável e a seção de limites conhecidos.
- [DATA_MIGRATION](../DATA_MIGRATION.md): marcos **M5** e **M6**, tabela de migrations por Goal e o padrão de ensaio.
- [DECISIONS](../DECISIONS.md): **U-03** segue aberta e é decisão de pessoa; nada aqui a resolve.
- **Não** abrir o Product Vault: este Goal não tem regra de produto. Usar Graphify apenas para confirmar consumidores de `config/env.ts`, se precisar; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `977256ac`. Não gastar rodada redescobrindo:

- **Contagem de migrations por serviço:** BFF 23, IA 19, Scheduling 17 diretórios em `prisma/migrations`, cada um com `migration_lock.toml`.
- **Cada serviço tem `prisma.config.ts` próprio** e é dele que sai a URL do CLI: no BFF, `process.env.DIRECT_DATABASE_URL?.trim() || process.env.DATABASE_URL || <default local>`; na IA e no Scheduling, `process.env.DATABASE_URL ?? <default local>`, com a IA declarando também `shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL`. O bloco `datasource db` dos `schema.prisma` **não** traz `url` — é Prisma 7 com adapter, e quem migra é o config.
- **Quem aplica migrations no gate hoje:** `migrate:bff-test-database` (`validate-integration.mjs:244`) e `npx prisma migrate deploy` dentro de `scripts/provision-scheduling-test-database.mjs`. A IA só tem `generate:ai-orchestrator-prisma-client` (`:515`).
- **O padrão de script de ensaio já existe e é reproduzível:** dezoito scripts `scripts/goalNNN-*-rehearsal.mjs`, cada um com um passo nomeado em `validate-integration.mjs` — o mais recente é `rehearse:goal027-calendar-source-migration` (`:481`). Todos recusam destino que não seja loopback com nome de banco descartável, imprimem contagem sanitizada e nunca imprimem credencial. `provision-scheduling-test-database.mjs` é o modelo mais curto desse guard.
- **`scripts/final-production-audit.mjs` é o lugar já existente para regra estática de árvore**, com `check(name, ok, details)` e 23 checagens depois do Goal027; funções puras são testadas em caso positivo e negativo em `scripts/tests/`, executadas por `test:gate-scripts` dentro de `validate:core` (`validate-core.mjs:58`) e por `npm run test:gate`.
- **O blueprint tem seis serviços e um banco gerenciado:** frontend, BFF, IA, Scheduling, Evolution Go (docker) e health-worker, mais `atendly-ia-scheduling-db`. Só o Scheduling recebe `DATABASE_URL` `fromDatabase`; BFF e IA recebem `sync: false`. O BFF é o único com `DIRECT_DATABASE_URL`, e ele é de fato lido pelo `prisma.config.ts` do BFF.
- **Tokens ausentes do blueprint por desenho, não por esquecimento:** `AI_ORCHESTRATOR_PROVISIONING_TOKEN`, `AI_ORCHESTRATOR_COMMAND_TOKEN` e `SCHEDULING_SERVICE_COMMAND_TOKEN` (BFF) e `BFF_COMMAND_TOKEN`/`AI_ORCHESTRATOR_COMMAND_TOKEN` (Scheduling) têm default vazio e são **derivados de `INTERNAL_SERVICE_TOKEN` por HMAC** quando vazios — está escrito no comentário de `apps/bff/src/config/env.ts:53-55`. A regra estática de §3 precisa distinguir essa ausência legítima da ausência acidental, ou vai reprovar a árvore correta.
- **Os cinco loops de fundo da plataforma e seus flags:** `apps/bff/src/modules/retention/RetentionSweepWorker.ts` (`RETENTION_SWEEP_ENABLED`, default `false`), `apps/bff/src/modules/account/worker.ts` (`ACCOUNT_PURGE_ENABLED`, default `false`), `apps/ai-orchestrator/src/modules/inbox/InboxWorker.ts` (`INBOX_WORKER_ENABLED`, default `true`), `apps/ai-orchestrator/src/modules/reminders/NotificationDeliveryWorker.ts` (`NOTIFICATION_DELIVERY_ENABLED`, default `true`) e o auto-complete do Scheduling (`CALENDAR_AUTO_COMPLETE_ENABLED`, default `true`, intervalo em `apps/scheduling-service/src/app/build-app.ts:52`). Nenhum dos cinco flags aparece em `render.yaml`.
- **O Evolution Go cria as próprias tabelas em código Go** (`POSTGRES_AUTH_DB`/`POSTGRES_USERS_DB`, sem histórico de migrations versionado nesta migração) e `scripts/provision-evolution-test-database.mjs` apenas cria o banco. Por isso ele fica **fora** do ensaio de restore de §2, declaradamente.
- **Resíduo declarado no [review027](../reviews/027-review.md):** `apps/frontend/src/features/system/SystemScreen.tsx` ainda serve o cenário `external-unavailable`, com `source: "external"` no `ShellConfig` e a frase "Minha Agenda está indisponível"; a única referência viva é o mapa de rota em `apps/frontend/src/app/(platform)/sistema/[state]/page.tsx:9` (`"agenda-indisponivel": "external-unavailable"`). Nenhum teste cobre a tela hoje. É de §5 deste Goal.

## Pontos de implementação

- `scripts/goal028-release-rehearsal.mjs` (novo) e `scripts/goal028-restore-rehearsal.mjs` (novo), ou um único script com dois modos — a escolha é do executor, desde que cada prova tenha passo nomeado próprio em `scripts/validate-integration.mjs`.
- `scripts/validate-integration.mjs`: passos novos, no lugar certo da ordem.
- `scripts/final-production-audit.mjs`: checagens novas de configuração de produção.
- `scripts/tests/`: casos positivos e negativos das funções puras novas.
- `apps/frontend/src/features/system/SystemScreen.tsx` e `apps/frontend/src/app/(platform)/sistema/[state]/page.tsx`: §5.
- `apps/frontend/tests/goal028-system-scenarios.test.tsx` (novo).
- `render.yaml` e os `.env.example` afetados, conforme o que as regras de §3 acharem.
- Documentação: `docs/migration/` conforme §8.

Nenhuma migration nova é esperada em nenhum dos três serviços — este Goal ensaia o histórico que existe. Se o passo de drift de §1 acusar divergência entre `schema.prisma` e o histórico, a correção é **uma migration nova e aditiva**, jamais edição de migration já aplicada, e o fato vira item explícito do relatório.

## Escopo obrigatório

### 1. As migrations dos três serviços aplicam do zero, e não há drift

- Passo novo que cria um banco descartável **vazio** por serviço (BFF, IA, Scheduling) e roda `prisma migrate deploy` contra ele, do zero, com o `prisma.config.ts` de cada app resolvendo a URL. Não reaproveitar os bancos já povoados pelos ensaios anteriores: a prova é de histórico completo em banco limpo.
- Depois de aplicar, asserção de que `_prisma_migrations` tem exatamente o número de linhas com `finished_at IS NOT NULL` igual ao número de diretórios de migration do serviço, e nenhuma linha com `rolled_back_at`. A contagem é reportada por serviço.
- Segunda execução de `prisma migrate deploy` no mesmo banco não aplica nada e não falha.
- **Drift:** para cada serviço, comparar o estado produzido pelo histórico com `schema.prisma` e exigir ausência de diferença — `prisma migrate diff` entre o banco migrado e o datamodel, com saída vazia. Se a ferramenta exigir shadow database, usar um banco descartável próprio e derrubá-lo ao fim; nunca apontar para banco de desenvolvimento.
- Os guards de destino são os mesmos que os scripts existentes já usam: só loopback, só nome reconhecidamente descartável, recusa com `exit 2` e mensagem `REFUSED — …`, sem imprimir credencial.

### 2. Ensaio de `pg_dump`/restore com integridade verificada

- Sobre os bancos descartáveis de §1, semear um conjunto **mínimo e representativo** por serviço — o suficiente para que a asserção de integridade signifique algo: pelo menos um tenant com dado relacionado em cadeia (no BFF, tenant + sessão + notificação; na IA, conversa + mensagem + `ProcessedEvent`; no Scheduling, `CalendarSettings` + serviço + agendamento). Nada de semear o domínio inteiro.
- `pg_dump` em formato custom, restore em um banco novo e vazio, e então asserção de que o restaurado é equivalente ao original em: contagem de linhas por tabela semeada, linhas de `_prisma_migrations`, existência dos índices e das constraints nomeadas — **incluindo obrigatoriamente `CalendarSettings_source_atendly_check`, do Goal027** —, e os valores dos enums.
- Prova negativa real: uma tentativa de `UPDATE` que viole `CalendarSettings_source_atendly_check` no banco **restaurado** precisa falhar com `23514`. Constraint que não sobrevive ao restore é a classe de defeito que este ensaio existe para achar.
- `pg_dump`/`pg_restore` ausentes no PATH **não** são passe livre: o passo recusa com mensagem própria e `exit 2`, como os demais guards fazem com `BFF_TEST_DATABASE_URL`. Skip silencioso é o que este Goal está corrigindo.
- Evolution Go fica fora, pelo motivo declarado nos fatos de baseline. Dizer isso no próprio script, em comentário, e no documento de §8.

### 3. Gate estático de configuração de produção

Checagens novas em `scripts/final-production-audit.mjs`, cada uma com função pura testável:

- **Toda chave lida pelo app está contabilizada.** Para BFF, IA e Scheduling, extrair as chaves de `config/env.ts` e classificar cada uma em: declarada em `render.yaml` para aquele serviço; ausente por ter default seguro para produção; ou ausente por ser derivada (o caso HMAC dos tokens de comando/provisionamento, que a regra reconhece **por nome** e justifica em comentário). Qualquer chave que não caia em nenhuma das três categorias reprova.
- **Os flags de loop são decisão escrita.** Os cinco flags listados nos fatos de baseline precisam aparecer em `render.yaml` com valor explícito, cada um. O valor em si é decisão de operação e este Goal não a toma — o que ele proíbe é que ligado/desligado em produção seja efeito colateral de um default.
- **Nenhum default de desenvolvimento vaza para produção.** `PASSWORD_RESET_PUBLIC_URL`, `FRONTEND_ORIGIN` e as `*_BASE_URL` declaradas no blueprint não podem conter `localhost` nem `127.0.0.1`; `COOKIE_SECURE` e `NODE_ENV` precisam estar declarados com valor de produção; `JWT_SECRET` não pode ter valor literal no arquivo.
- **O blueprint não aponta para diretório inexistente.** Todo caminho de `buildFilter.paths` e todo `rootDir` precisa existir na árvore — é isso que pega o `packages/**` que sobrou do Goal026, e é a mesma classe do `npm ci --prefix packages/contracts` que o review026 encontrou no workflow.
- **`.env.example` e `config/env.ts` não divergem.** Para cada um dos três serviços, toda chave do schema aparece no `.env.example` do app e vice-versa; chave a mais ou a menos reprova, com a lista no `details`.
- Cada regra precisa de **caso negativo executável** em `scripts/tests/`: um contraexemplo sintético que a regra reprova de verdade. O review026 rejeitou uma regra que devolvia `[]` contra o contraexemplo — não repetir.
- Se alguma dessas regras rodar **vermelha contra a árvore real**, corrigir a árvore (é o achado, não o defeito da regra) e registrar o achado no relatório e em §8. Ajustar `render.yaml`/`.env.example` é esperado e autorizado; relaxar a regra para a árvore passar, não.

### 4. Inventário de loops e capacidade declarada, sem contratar nada

- Documentar, em [VALIDATION_GATE](../VALIDATION_GATE.md), uma tabela dos cinco loops: arquivo, flag, default, intervalo, tamanho de lote e lease, todos lidos do código, mais o que cada um consome por ciclo em termos de consultas ao banco.
- Não medir throughput, não simular carga, não estimar custo de provider, não recomendar plano. **U-03 continua aberta e é decisão de pessoa**; este Goal apenas entrega o inventário que uma pessoa precisa para decidir.
- Registrar explicitamente, no mesmo lugar, o que o ensaio **não** prova: que os loops sustentam volume real, que o plano gratuito os mantém vivos, e que o deploy hospedado funciona.

### 5. Resíduo do Goal027: o cenário de agenda externa sai da tela de sistema

- Remover o cenário `external-unavailable` de `SystemScreen.tsx` — incluindo o `source: "external"` do `ShellConfig`, a frase "Minha Agenda está indisponível", o ícone, o tom e o destino "Assumir atendimento" específicos dele — e a entrada `"agenda-indisponivel"` do mapa de rota.
- Os demais cenários (`offline`, `error`, `session-expired` e o que mais existir no tipo) continuam com o comportamento de hoje, provados por teste novo em `apps/frontend/tests/goal028-system-scenarios.test.tsx`: cada cenário sobrevivente renderiza seu texto e sua ação, e a rota removida não resolve mais para cenário nenhum.
- Nenhuma outra tela muda. Não é redesenho.

### 6. O que não pode mudar de comportamento

- Nenhuma migration existente é editada, renomeada ou removida. Nenhum dado de produto é apagado por este Goal.
- `validate:core`, `validate:integration` e `validate:ui` continuam existindo com os mesmos nomes e continuam recusando destino não descartável; nenhum passo existente é removido ou enfraquecido para caber os novos.
- Nenhum passo novo pode aumentar o tempo do gate a ponto de torná-lo inviável sem que o relatório diga o custo medido de cada passo novo.
- O contrato público, as rotas internas, os escopos internos e as telas de produto (fora de §5) ficam como estão.

### 7. Prova

- **Integração contra PostgreSQL descartável:** os passos de §1 e §2 verdes, com as contagens reportadas — migrations aplicadas por serviço, linhas semeadas, linhas restauradas — e o `23514` real do restore.
- **`validate:core`** com as regras estáticas novas aparecendo no resultado de `audit:static`, e `test:gate` com os casos positivos e negativos novos.
- `validate:core`, `validate:integration`, `validate:ui` e `build:all` executados sobre a **árvore final**, não sobre a de uma rodada anterior. Essa é a lição mais cara do Goal027: cinco rodadas foram gastas com documentação escrita antes da última correção. **Documentação de fechamento se escreve depois da última mudança de árvore, ou se reexecuta.**
- `validate:ui` nas cinco larguras cobre §5.
- Teste que falha por motivo diferente do que anuncia não conta. Nada de asserção trivialmente verdadeira. Fixture não pode mascarar o defeito que o teste diz cobrir. Skip não é passe.
- O repositório é npm: não invocar `pnpm` nem `corepack` em unidade de trabalho nenhuma. Antes de declarar pronto, `git status --porcelain` não pode listar artefato não rastreado que não seja arquivo novo declarado no relatório.

### 8. Documentação

Atualizar apenas o que a mudança fizer mentir. [VALIDATION_GATE](../VALIDATION_GATE.md): os passos novos na tabela de comandos canônicos, a tabela de loops de §4, o que o ensaio de restore prova e o que ele não prova, e a revisão da seção de limites conhecidos — a frase de que a auditoria estática não verifica deploy continua verdadeira e ganha a fronteira exata do que passou a ser verificado. [DATA_MIGRATION](../DATA_MIGRATION.md): **M5** e o que de **M6** este Goal alcança, com a lacuna do histórico da IA registrada como achado e a sua correção. [CURRENT_STATE](../CURRENT_STATE.md): ferramental de gate e a tela de sistema de §5. [GAP_ANALYSIS](../GAP_ANALYSIS.md): só as linhas que o diff realmente mover. Registrar a decisão em [DECISIONS](../DECISIONS.md) como **D-044**, no formato das anteriores, cobrindo: o que o ensaio de release passa a provar, o que ele declaradamente não prova, a regra de que configuração de produção é conferida por regra estática com caso negativo, a de que flag de loop em produção é decisão escrita e não default, e a fronteira preservada de **U-03** e **M4**. Não criar documento novo.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Existe passo nomeado em `scripts/validate-integration.mjs` que aplica `prisma migrate deploy` **do zero** em banco vazio para cada um dos três serviços, e ele roda verde contra PostgreSQL real.
2. O passo reporta, por serviço, o número de migrations aplicadas, e a asserção compara esse número com o de diretórios em `prisma/migrations` — 23 no BFF, 19 na IA, 17 no Scheduling na baseline, lidos da árvore e não escritos à mão.
3. Reexecutar `prisma migrate deploy` no mesmo banco não aplica migration nenhuma e não falha.
4. Para cada serviço, a comparação entre o banco migrado e o `schema.prisma` acusa ausência de drift; se houver drift, ele foi corrigido por **migration nova e aditiva**, nenhuma migration existente foi editada, e o fato está no relatório.
5. Existe ensaio de `pg_dump`/restore com passo nomeado próprio, que semeia dado em cadeia nos três serviços, restaura em banco novo e compara contagens por tabela, `_prisma_migrations`, índices, constraints nomeadas e enums.
6. A constraint `CalendarSettings_source_atendly_check` existe no banco **restaurado** e recusa `MINHA_AGENDA` com `23514`, provado por tentativa real de `UPDATE`.
7. Ausência de `pg_dump`/`pg_restore`, de variável de ambiente ou de destino descartável faz o passo **recusar** com `exit 2` e mensagem própria; nenhum caminho de skip silencioso foi introduzido.
8. Nenhum script novo imprime credencial, e todos recusam destino que não seja loopback com nome de banco descartável, no mesmo padrão dos ensaios existentes.
9. `final-production-audit.mjs` ganhou as regras de §3, elas aparecem no resultado de `audit:static`, e **cada uma** tem caso negativo executável em `scripts/tests/` que a reprova de verdade.
10. A regra de cobertura de chaves reconhece, por nome e com justificativa em comentário, os tokens derivados por HMAC de `INTERNAL_SERVICE_TOKEN`, e não reprova a árvore por causa deles.
11. Os cinco flags de loop aparecem em `render.yaml` com valor explícito, e a regra reprova a remoção de qualquer um deles.
12. Nenhum `*_BASE_URL`, `FRONTEND_ORIGIN` ou `PASSWORD_RESET_PUBLIC_URL` do blueprint contém `localhost`/`127.0.0.1`; `COOKIE_SECURE` e `NODE_ENV` estão declarados com valor de produção; nenhum segredo literal entrou no arquivo.
13. Todo `rootDir` e todo caminho de `buildFilter.paths` do blueprint existe na árvore — em particular o resíduo `packages/**` do Goal026 está resolvido.
14. Para os três serviços, `.env.example` e `config/env.ts` declaram o mesmo conjunto de chaves, e a divergência de qualquer uma reprova com a lista no `details`.
15. Todo achado real dessas regras contra a árvore foi corrigido na árvore, e nenhuma regra foi afrouxada para a árvore passar.
16. [VALIDATION_GATE](../VALIDATION_GATE.md) traz a tabela dos cinco loops com arquivo, flag, default, intervalo, lote e lease lidos do código, e diz explicitamente que capacidade real, plano de hospedagem e deploy continuam não provados.
17. **U-03** continua aberta em [DECISIONS](../DECISIONS.md), nenhum provider foi trocado, nada foi contratado e **M4** continua aberto.
18. O cenário `external-unavailable` não existe mais em `SystemScreen.tsx`, o mapa de rota não tem mais `"agenda-indisponivel"`, e nenhuma menção a "Minha Agenda está indisponível" sobrou no frontend.
19. `apps/frontend/tests/goal028-system-scenarios.test.tsx` prova que cada cenário sobrevivente renderiza texto e ação, e que a rota removida não resolve para cenário nenhum.
20. Nenhuma migration nova foi criada em nenhum serviço, exceto a eventual migration aditiva do critério 4, declarada e justificada.
21. Nenhuma rota pública, rota interna, escopo interno ou tela fora de §5 mudou de forma, de código de erro ou de status.
22. Nenhum passo existente de `validate:core`/`validate:integration` foi removido, renomeado ou enfraquecido, e o relatório traz o custo de tempo medido de cada passo novo.
23. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha.
24. Os gates declarados foram executados **sobre a árvore final** e o relatório traz o resultado real de cada um, incluindo `validate:integration` com os passos novos e `validate:ui` nas cinco larguras.
25. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.
26. [DECISIONS](../DECISIONS.md) tem **D-044** registrada no formato das anteriores, sem quebrar o bloco de nenhuma decisão anterior, e a documentação de §8 foi escrita **depois** da última mudança de árvore.

## Entrega

Relatório do Developer com: diff por área, os passos novos do gate com o nome exato e o tempo medido de cada um, as contagens reportadas pelos ensaios (migrations aplicadas por serviço, linhas semeadas, linhas restauradas, constraints conferidas), o resultado real de cada regra estática nova na **primeira** execução contra a árvore — inclusive as que reprovaram e o que foi corrigido por causa disso —, a decisão tomada para cada flag de loop no `render.yaml` e por quê, a lista de arquivos tocados fora dos pontos de implementação com justificativa, e o que ficou declaradamente fora, com **U-03** e **M4** nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
