# Goal 026 — Retirada do protocolo legado e do writer remoto

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-16 pelo Tech Lead Agent após [Goal025 ACCEPTED](../reviews/025-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

A linha 026 do roadmap somava, até a v47 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), **retirada do legado** e **ensaio de release**. Esta passada de planejamento a dividiu: este Goal é a retirada do legado **de código e contrato**; o ensaio de migrations, restore, deploy e capacidade passou a ser o **027**, e a auditoria final do MVP passou de 027 para **028**. Títulos, dependências e histórico de cada linha estão preservados; o motivo da divisão está registrado na v47.

## Baseline aceita

Baseline aceita: `bd5990abf0869821a35d67c9f9a775831d53cb75`

Goal anterior: 025 — Ciclo de vida da conta

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal025 já integrado em `main` (origem `5e36832ce8e42841415624ef741e9196d781ebc9`), incluindo a implementação das cinco rodadas, o [review025](../reviews/025-review.md) e a documentação de fechamento. O commit `e93d6c4f363e6303d2430026bd39dac05928fd3c`, posterior a ela, corrige apenas o cabeçalho de status do próprio documento do Goal025, que o fechamento deixou em `READY`, e não toca código. Baseline anterior: `d24d68146617ffe1ebb7eedb6617947a843a9bb8` (fechamento024). O diff inicial desta execução contra `bd5990ab` deve conter, no máximo, artefatos preexistentes de `graphify-out/`, a reconciliação administrativa de `docs/migration/` feita neste planejamento e ajustes de ferramental fora de `apps/`, que ficam preservados fora do escopo.

## Objetivo e posição

Tornar verdadeira, **na árvore e não só na intenção**, a regra de produto que o contrato público já enuncia: *Agenda Avenly é a única agenda operacional; Minha Agenda só pode participar da importação única; não existe conexão operacional, troca de fonte ou migração reversa* (`apps/bff/PUBLIC_API_V1.md`). Hoje o produto **se comporta** assim — o Goal010 cortou o caminho operacional e o Goal020 tirou o protocolo antigo da interface —, mas o código que fazia o contrário continua na árvore, compilado, publicado e alcançável por rota pública:

- `POST /v1/calendar/migrations/diagnose`, `POST /v1/calendar/migrations` e `GET /v1/calendar/migrations/:id` continuam registradas no BFF, com cliente interno, rota interna no Scheduling e as 939 linhas de `CalendarMigrationService` atrás delas — sem consumidor de frontend desde 2026-09-12, como o próprio contrato declara;
- `MinhaAgendaCalendarProvider` (1 010 linhas) continua implementando `CalendarProvider` inteiro, com `createAppointment`, `rescheduleAppointment`, `cancelAppointment`, `createHold`, `releaseHold` e `getAvailability` escritos e testáveis. Nenhum caminho operacional o instancia — `CalendarProviderFactory` recusa `MINHA_AGENDA` com `409` —, mas *writer remoto inexistente* é o resultado verificável que o roadmap pede, e um writer que existe e não é chamado não é um writer inexistente.

É o marco **M6** de [DATA_MIGRATION](../DATA_MIGRATION.md) na parte que depende só de código: *consumers, replays e jobs legados zerados ou arquivados; então remover campos/rotas/código obsoletos*. Entra agora, e nesta ordem, porque a condição que o segurava caiu: a linha do Goal020 preservava as rotas legadas "até o 025", e o 025 fechou. E entra **antes** do ensaio de release (027) por uma razão de método: ensaiar migrations, restore e deploy de uma árvore que ainda carrega caminho morto é ensaiar a coisa errada.

Este Goal **não** faz: retirada do valor `EXTERNAL`/`MINHA_AGENDA` como fonte de agenda armazenada, nem das telas que degradam por causa dele — isso é dado, contrato público e doze arquivos de frontend, e é o **027**; ensaio de migrations, restore, deploy ou capacidade (027); auditoria final (028); qualquer mudança na importação única, em retenção (023), lembretes (021), central (022), conhecimento (024) ou no ciclo de vida da conta (025). Não reabre nenhum aceite de 001–025.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md). **D-026** (job legado é classificado e nunca convertido; nada é apagado; o direito de importação mora em `ImportSession.completedAt`), **D-036** (estado da importação como leitura própria) e **D-041** (purga por negócio derivada do schema) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 010, 020, 023, 024 e 025 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Não abrir o Product Vault para este Goal: nenhuma regra de produto muda. Se alguma copy de tela for tocada por remoção de código morto, conferir apenas [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md).
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-10** (somente Agenda Avenly operacional) e **G-19/G-20** (importação) são os alvos de consistência; **G-32** é tocado por honestidade, não por fechamento — ver §3.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, seção de calendário/importação. Usar Graphify apenas para confirmar consumidores de `CalendarMigrationService`, de `MinhaAgendaCalendarProvider` e de `@atendly/contracts`; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `bd5990ab`. Não gastar rodada redescobrindo:

- **O protocolo legado tem exatamente três rotas públicas e três internas.** Público: `apps/bff/src/modules/migrations/routes.ts:104,120,135`. Cliente interno: `apps/bff/src/clients/scheduling/index.ts:1280,1290,1299`. Interno: `apps/scheduling-service/src/modules/internal-api/routes.ts:1423,1433,1445`. Serviço: `apps/scheduling-service/src/modules/migrations/calendar-migration-service.ts` (939 linhas), instanciado em `internal-api/routes.ts:509` e exportado em `modules/migrations/index.ts:1`.
- **No frontend ele é só contrato, sem tela:** `BffMigrationService.diagnose/create/get` (`apps/frontend/src/data/services/BffMigrationService.ts:60-88`) e os schemas `migrationSchema`, `migrationDiagnosisSchema` e `migrationStartSchema` de `data/mappers/publicApiSchemas.ts`. O resto da classe é a importação única e **fica**.
- **Três comentários no código ainda prometem a remoção "no Goal024"** — `internal-api/routes.ts:1415-1421`, `calendar-migration-service.ts:70-78` e `BffMigrationService.ts:50-57`. São da numeração anterior à v46; a promessa é deste Goal.
- **`CalendarMigrationService` só tem dois consumidores fora das rotas:** `tests/unit/import-completion-service.test.ts:469` e `tests/unit/import-lease.test.ts:352`, ambos usando-o para **fabricar um job legado** e provar que ele não consome o direito de importação única. As duas suítes rodam sobre `createDatabaseDouble()`, sem PostgreSQL.
- **A leitura da origem sobrevive em dois pontos e só neles:** `listServices()` na conexão e na reconexão da credencial (`internal-api/routes.ts:1329,1372`) e `getImportSnapshot` no preview e na execução da importação (`import-preview-service.ts:179`, `import-execution-service.ts:376`). `getMigrationSnapshot` tem um único chamador, `calendar-migration-service.ts:358`, que sai neste Goal.
- **`migrationAvailabilityRules`, de `integrations/minha-agenda/availability.ts`, é consumido por `import-execution-service.ts:23` e fica.** Só o que perder o último consumidor sai desse arquivo.
- **`packages/contracts` tem 119 linhas em 20 arquivos e zero importadores** em `apps/` depois de 25 Goals aceitos; mesmo assim está em `build:all` (`package.json:12`, `scripts/build-all.sh:6`) e em `validate:core` como skip declarado `test:contracts` (`scripts/validate-core.mjs`). `packages/legal-contract` é outra coisa: tem consumidores reais no BFF e no frontend e **não é tocado**.
- **`apps/frontend/src/mocks/` é o resíduo declarado no [review017](../reviews/017-review.md):** `previewServices` tem um único leitor, o ramo `preview` de `AuthScreen.tsx:187-188`, e **nenhuma página passa `preview`** — as seis rotas de `app/` montam `AuthScreen` só com `scenario`.
- **`final-production-audit.mjs` é o lugar já existente para regra estática de árvore**, com `check(name, ok, details)` e suíte própria em `scripts/tests/`, executada por `test:gate-scripts` em `validate:core`.
- **Os `{@link}` de `tenantPurge.ts` na IA e no Scheduling apontam arquivos de teste inexistentes** — resíduo declarado no [review025](../reviews/025-review.md).

## Pontos de implementação

- `apps/scheduling-service/src/modules/migrations/` — `calendar-migration-service.ts`, `index.ts`; `legacy-job-reconciliation.ts` **permanece**.
- `apps/scheduling-service/src/modules/internal-api/routes.ts` — três rotas legadas e a instanciação do serviço.
- `apps/scheduling-service/src/modules/integrations/minha-agenda/` — `provider.ts` e `availability.ts`; `index.ts` do módulo `integrations`.
- `apps/scheduling-service/src/modules/calendar/provider-factory.ts` — comentário, não comportamento.
- `apps/bff/src/modules/migrations/routes.ts` e `apps/bff/src/clients/scheduling/index.ts`.
- `apps/frontend/src/data/services/BffMigrationService.ts`, `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `apps/frontend/src/features/auth/AuthScreen.tsx`, `apps/frontend/src/mocks/`.
- `packages/contracts/`, `package.json`, `scripts/build-all.sh`, `scripts/validate-core.mjs`.
- `scripts/final-production-audit.mjs` e `scripts/tests/`.
- `apps/ai-orchestrator/src/modules/internal/tenantPurge.ts` e `apps/scheduling-service/src/modules/internal-api/tenantPurge.ts` — apenas os `{@link}`.
- `apps/bff/PUBLIC_API_V1.md` e `docs/migration/`.
- Suítes correspondentes em `apps/*/tests/`.

## Escopo obrigatório

### 1. O protocolo legado de migração sai do código; os dados ficam

Remover, end to end, o protocolo de migração bidirecional pré-Goal010: as três rotas públicas do BFF, o mapper `publicMigration` e os três métodos do cliente do Scheduling; as três rotas internas e `CalendarMigrationService` por inteiro; os três métodos e os três schemas correspondentes no frontend. Símbolo que perder o último consumidor por causa dessa remoção sai junto; símbolo que continuar tendo consumidor fica.

**O que não sai, e por quê:** os modelos `MigrationJob` e `MigrationJobItem` e o enum `LegacyMigrationJobClass` permanecem no `schema.prisma` do Scheduling, e `legacy-job-reconciliation.ts` permanece como o **único leitor** deles. Nenhuma migration deste Goal apaga tabela, coluna, enum ou linha. A razão é D-026: o que resolveu U-02 foi classificar o job legado e **nunca** convertê-lo, com a promessa explícita de que nada é apagado; e a cobertura de purga por negócio do Goal025 é derivada do `schema.prisma`, de modo que sumir com as tabelas mudaria em silêncio o que D-041 declara purgar. O que morre é a capacidade de **escrever** um job legado novo; o que já está gravado continua legível e classificável.

As duas suítes que hoje fabricam o job legado por `CalendarMigrationService` (`import-completion-service.test.ts`, `import-lease.test.ts`) são **reescritas para semear a linha direto pelo Prisma**, preservando exatamente a invariante que elas provam: job legado, mesmo `COMPLETED`, não consome o direito de importação única. Apagar essas asserções junto com o serviço é perda de prova e não será aceito.

### 2. O writer remoto deixa de existir

`MinhaAgendaCalendarProvider` deixa de implementar `CalendarProvider` e perde todo método de escrita e de leitura operacional: `createAppointment`, `rescheduleAppointment`, `cancelAppointment`, `createHold`, `listHolds`, `getHold`, `releaseHold`, `getAvailability`, `getAppointment`, `listAppointments` e `getMigrationSnapshot`. Sobra o que a origem realmente ainda faz no produto: `listServices()`, usado como prova de credencial na conexão e na reconexão, e `getImportSnapshot`, usado pelo preview e pela execução da importação.

A classe passa a se chamar por aquilo que é — uma **origem de leitura da importação**, não um provider de agenda —, com o arquivo renomeado no mesmo sentido e o `export` de `modules/integrations/index.ts` acompanhando. O nome antigo não pode sobreviver como alias.

`CalendarProviderFactory` mantém o comportamento exatamente como está, inclusive o `409 MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED`, porque `Calendar.source` ainda pode valer `MINHA_AGENDA` em linha gravada — o valor só é retirado no 027. O que muda ali é o comentário, que hoje descreve uma classe que deixará de existir.

### 3. Código morto com proveniência declarada

- `apps/frontend/src/mocks/` inteiro e o ramo `preview` de `AuthScreen` saem: a prop, o `import`, o desvio de submit e as duas condições que dependem dela. Resíduo do [review017](../reviews/017-review.md), sem nenhum chamador.
- **`packages/contracts` é retirado**, junto com `build:contracts` no `package.json`, o trecho correspondente de `scripts/build-all.sh` e o skip declarado `test:contracts` de `validate:core`. O pacote tem zero importadores desde o Goal0 e serve hoje para dar aparência de contrato compartilhado onde não há nenhum. A alternativa — preenchê-lo — foi considerada e recusada aqui: o contrato de fato é `apps/bff/PUBLIC_API_V1.md` mais validação por zod em cada fronteira, que é o que os 25 Goals aceitos exercitaram. **Isso não fecha G-32:** a linha de G-32 em [GAP_ANALYSIS](../GAP_ANALYSIS.md) deve ser reescrita com honestidade — o pacote vazio deixa de existir, a exigência de alinhamento producer/consumer continua aberta e endereçada à auditoria final. Declarar G-32 fechado por deleção será recusado no review.
- Os três comentários que prometem remoção "no Goal024" saem com o código que descrevem; o que restar deles precisa dizer a verdade da árvore.
- Os `{@link}` de `tenantPurge.ts` na IA e no Scheduling passam a apontar os arquivos de teste que existem.

### 4. Prova de que não sobrou consumidor

Acrescentar a `scripts/final-production-audit.mjs` regras estáticas, no formato `check(...)` já usado, que falhem se o legado voltar: nenhuma fonte de `apps/` referenciando `/v1/calendar/migrations` ou `/internal/calendar/migrations`; nenhuma referência a `CalendarMigrationService`; nenhum método de escrita de agenda na origem Minha Agenda; `apps/frontend/src/mocks` inexistente. Cada regra nova ganha caso em `scripts/tests/`, **inclusive o caso negativo** — a suíte precisa provar que a regra reprova uma árvore que contenha o padrão, e não apenas que aprova a árvore atual. Regra que passaria com o legado de volta não conta.

### 5. O que não pode mudar de comportamento

- A **importação única** continua idêntica de ponta a ponta: direito, abertura de sessão, preview por categoria, seleção, decisões, execução, retomada por lease, conclusão forte e histórico.
- `POST /v1/calendar/integration/connect`, `POST /v1/calendar/integration/reconnect` e `DELETE /v1/calendar/integration` continuam com o mesmo contrato, incluindo a recusa `409 INTEGRATION_WRITES_NOT_SUPPORTED`.
- `CalendarProviderFactory` continua recusando `MINHA_AGENDA` com o mesmo código e o mesmo status.
- O ciclo de vida da conta e a purga por negócio do Goal025 continuam com a mesma cobertura de tabelas, incluindo `MigrationJob` e `MigrationJobItem`.
- Nenhuma rota pública além das três legadas muda de forma, de código de erro ou de status.
- **Nenhuma migration nova em nenhum dos três bancos.** Um Goal de retirada que precise de migration está fora do desenho aprovado aqui e deve parar e reportar.

### 6. Contrato público

Em `apps/bff/PUBLIC_API_V1.md`, as três rotas legadas saem da tabela de conceitos legados. Esta é a **primeira remoção subtrativa de rota pública** da migração: registrar isso explicitamente no documento, com a data e o motivo (sem consumidor de frontend desde o fechamento do Goal010), para que a remoção não pareça omissão. O restante da seção — conexão, reconexão e desconexão da origem, e o parágrafo que declara `ATENDLY | EXTERNAL` como dívida — fica **intacto**: a retirada desse valor é o 027. Nenhuma outra linha do contrato muda.

### 7. Prova

- **Suítes dirigidas** do Scheduling, do BFF e do frontend passando depois da remoção, com as invariantes reescritas de §1 realmente exercitadas.
- **A importação única é exercitada, não apenas compilada:** as suítes de preview, execução, lease e conclusão continuam verdes, e a integração do BFF que cobre `/v1/calendar/imports*` continua verde contra PostgreSQL descartável.
- **A cobertura de purga derivada do schema** (Goal025) continua verde nos dois serviços.
- `validate:core`, `validate:integration`, `validate:ui` e `build:all` executados sobre a **árvore final**, não sobre a árvore de uma rodada anterior — foi assim que o Goal025 gastou duas rodadas. O número de skips declarados em `validate:core` muda com a saída de `test:contracts`; declarar o número novo no relatório.
- Teste que falha por motivo diferente do que anuncia não conta. Nada de asserção trivialmente verdadeira. Fixture não pode mascarar o defeito que o teste diz cobrir.

### 8. Documentação

Atualizar apenas o que a mudança fizer mentir: `apps/bff/PUBLIC_API_V1.md`; e em `docs/migration/` as linhas de **G-10**, **G-19/G-20** e **G-32** em [GAP_ANALYSIS](../GAP_ANALYSIS.md), [CURRENT_STATE](../CURRENT_STATE.md) nas partes de Scheduling, BFF e frontend, [DATA_MIGRATION](../DATA_MIGRATION.md) na parte de M5/M6 e do arquivo legado inerte, [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) nos módulos que perderem consumidor e [VALIDATION_GATE](../VALIDATION_GATE.md) nos passos de gate que mudarem — skips declarados e regras estáticas novas. Registrar a decisão em [DECISIONS](../DECISIONS.md) como **D-042**, no formato das anteriores, cobrindo: a retirada do protocolo legado com preservação das linhas já gravadas, a morte do writer remoto com sobrevivência da leitura de importação, a retirada do pacote de contratos vazio com G-32 mantido aberto, e a regra estática como forma de impedir o retorno. Não criar documento novo.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. `POST /v1/calendar/migrations/diagnose`, `POST /v1/calendar/migrations` e `GET /v1/calendar/migrations/:id` não estão mais registradas no BFF; requisição a qualquer uma delas responde `404`.
2. Os três métodos correspondentes do cliente interno do Scheduling no BFF não existem mais.
3. As três rotas `/internal/calendar/migrations*` não estão mais registradas no Scheduling.
4. `CalendarMigrationService` não existe mais na árvore, nem como arquivo, nem como export, nem como import.
5. `BffMigrationService` não expõe mais `diagnose`, `create` nem `get`, e os schemas de migração legada saíram de `publicApiSchemas.ts`.
6. Nenhum arquivo de `apps/` menciona `/v1/calendar/migrations` ou `/internal/calendar/migrations`.
7. Os modelos `MigrationJob`, `MigrationJobItem` e o enum `LegacyMigrationJobClass` continuam no `schema.prisma` do Scheduling, sem alteração.
8. `legacy-job-reconciliation.ts` continua existindo e continua sendo capaz de inventariar e classificar jobs legados já gravados.
9. A invariante "job legado, mesmo `COMPLETED`, não consome o direito de importação única" continua provada por teste, agora com a linha semeada direto pelo Prisma, e o teste falha se a regra sair.
10. Nenhuma migration nova foi criada em BFF, IA ou Scheduling.
11. A origem Minha Agenda não expõe mais nenhum método de escrita de agenda, hold ou disponibilidade.
12. A classe da origem não implementa mais `CalendarProvider` e foi renomeada para nome que não a confunde com provider operacional; o nome antigo não sobrevive como alias.
13. `listServices()` continua funcionando na conexão e na reconexão da credencial, provado por teste.
14. `getImportSnapshot` continua funcionando no preview e na execução da importação, provado por teste.
15. `getMigrationSnapshot` não existe mais.
16. De `availability.ts` da origem saiu apenas o que perdeu o último consumidor; `migrationAvailabilityRules` continua exportado e consumido pela execução da importação.
17. `CalendarProviderFactory` continua recusando `MINHA_AGENDA` com o mesmo código de erro e o mesmo status, provado por teste, e seu comentário descreve a árvore real.
18. `apps/frontend/src/mocks/` não existe mais e `AuthScreen` não tem mais a prop `preview` nem nenhum ramo que dependa dela; as seis rotas públicas de autenticação continuam renderizando e submetendo como antes.
19. `packages/contracts` não existe mais, e `build:contracts`, o trecho de `scripts/build-all.sh` e o skip `test:contracts` saíram junto; `build:all` e `validate:core` continuam exit 0.
20. `packages/legal-contract` não foi tocado e continua consumido por BFF e frontend.
21. A linha de **G-32** em `GAP_ANALYSIS` foi reescrita e **não** declara o gap fechado.
22. Nenhum comentário na árvore promete mais remoção "no Goal024"; os `{@link}` de `tenantPurge.ts` na IA e no Scheduling apontam arquivos que existem.
23. `final-production-audit.mjs` ganhou as regras estáticas de §4 e elas aparecem no resultado do `audit:static`.
24. Cada regra estática nova tem caso negativo em `scripts/tests/` que prova que ela reprova uma árvore com o padrão de volta.
25. A importação única continua íntegra: direito, sessão, preview, seleção, decisões, execução, retomada, conclusão forte e histórico, com as suítes correspondentes verdes.
26. A cobertura de purga por negócio derivada do schema continua verde na IA e no Scheduling, com `MigrationJob` e `MigrationJobItem` ainda cobertos.
27. Nenhuma rota pública além das três removidas mudou de forma, de código de erro ou de status.
28. `PUBLIC_API_V1.md` mudou exatamente na retirada das três rotas e no registro dessa retirada, e em nenhum outro ponto; o parágrafo de `ATENDLY | EXTERNAL` continua como está.
29. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha.
30. Os gates declarados foram executados **sobre a árvore final** e o relatório traz o resultado real de cada um, incluindo `validate:integration`, `validate:ui` nas cinco larguras e o número novo de skips declarados de `validate:core`.
31. `GAP_ANALYSIS` reflete o estado real de **G-10** e **G-19/G-20** depois do diff.
32. `DECISIONS` tem **D-042** registrada no formato das anteriores, sem quebrar o bloco de nenhuma decisão anterior.

## Entrega

Relatório do Developer com: diff por área e por serviço, contagem de linhas removidas por bloco, resultado real dos gates (não "deveria passar"), a lista de símbolos removidos e a de símbolos preservados com o consumidor que os preserva, como as duas suítes de invariante foram reescritas, o número novo de skips declarados de `validate:core`, a lista de arquivos tocados fora dos pontos de implementação com justificativa, e o que ficou declaradamente fora. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
