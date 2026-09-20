# Goal 029 — Timezone único do negócio

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal028 ACCEPTED](../reviews/028-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

A linha 029 **nasce nesta v50** do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), inserida por evidência verificada na árvore da baseline aceita. Nenhum ID foi removido e nenhum aceite foi reaberto: a auditoria final do MVP, antes 029, passou a **030**, com título, objetivo, dependências e resultado preservados. O motivo está registrado na v50.

## Baseline aceita

Baseline aceita: `f1a8b7b818f6adea13621e897094c60f0ca6adf1`

Goal anterior: 028 — Ensaio de release, restore e configuração de produção

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal028 já integrado em `main` (origem `409bd5a7b26be42ff512d17f46d6f06e57ee280f`), incluindo a implementação das duas rodadas, o [review028](../reviews/028-review.md) e a documentação de fechamento. O commit `67471a6fae6797947df106705f89cb514360990d`, posterior a ela, corrige apenas o cabeçalho de status do próprio documento do Goal028, que a documentação de fechamento tinha deixado em `READY`, e não toca código. Baseline anterior: `977256ac7e592b9eac4cc9cf83a81c2888110fe2` (fechamento027). O diff inicial desta execução contra `f1a8b7b8` deve conter, no máximo, artefatos preexistentes de `graphify-out/`, a reconciliação administrativa de `docs/migration/` feita neste planejamento e ajustes de ferramental fora de `apps/`, que ficam preservados fora do escopo.

## Objetivo e posição

O fuso horário do negócio é **um fato do negócio**, e hoje ele está gravado em duas bases que não compartilham transação, escrito por três entradas públicas independentes e reconciliado por ninguém. A consequência é visível para a profissional: mudar o fuso em Configurações → Negócio grava a cópia do BFF, projeta o contexto da IA e **deixa a agenda inteira no fuso antigo**.

Verificado na árvore de `f1a8b7b8`, não inferido:

- **Duas cópias.** `BusinessProfile.timezone` (`apps/bff/prisma/schema.prisma:138`, default `America/Sao_Paulo`) e `CalendarSettings.timezone` (`apps/scheduling-service/prisma/schema.prisma:251`, sem default). Bases distintas, serviços distintos.
- **Três entradas públicas escrevem fuso, de forma independente.** `POST /v1/onboarding` aceita `business.timezone`, `calendar.timezone` e `availability.timezone` como três valores separados (`apps/bff/src/modules/onboarding/routes.ts:40,50,65`); `PATCH /v1/settings/business` escreve só a cópia do BFF; `PATCH /v1/settings/availability` encaminha um `timezone` próprio para o Scheduling (`apps/bff/src/modules/settings/routes.ts:61,183-193`), que grava `CalendarSettings.timezone` (`apps/scheduling-service/src/modules/internal-api/routes.ts:861-898`). Nada exige que os três concordem.
- **A cópia que decide o comportamento é a do Scheduling.** `calendar.timezone` alimenta oferta de horário, ocupação, bloqueios, exceções, lembretes e janelas de importação — mais de vinte usos só em `apps/scheduling-service/src/modules/internal-api/routes.ts` (linhas 1060–1250, 1472, 1613, 1688) e em `calendar-service.ts:417`. O frontend também renderiza a agenda a partir dela (`AgendaBoard.tsx:139`, `AppointmentForm.tsx:218`, `BlockForm.tsx:77`).
- **O caminho de escrita do negócio não propaga.** `PATCH /v1/settings/business` (`apps/bff/src/modules/settings/routes.ts:90-134`) atualiza `Tenant.name` e `BusinessProfile` numa transação e chama `syncAi`; não há nenhuma chamada a `configureCalendar` nesse caminho, embora o cliente interno já a ofereça (`apps/bff/src/clients/scheduling/index.ts:559-570`).
- **A tela já promete o que o backend não faz.** O diálogo de confirmação de `apps/frontend/src/features/settings/BusinessSettings.tsx:236` afirma "Horários futuros passarão a usar o novo fuso". Hoje eles não passam.
- **O contexto da IA já segue a cópia certa.** `businessContextPayload` lê `BusinessProfile.timezone` (`apps/bff/src/lib/business-profile.ts:41`) e a reconciliação de ativação o projeta (`apps/bff/src/lib/ai-activation.ts`). A IA não é o problema; o Scheduling é.

Este Goal faz o fuso ser um fato só: um dono, uma entrada pública que o decide, duas cópias que convergem, e nenhum caminho público capaz de criar divergência nova. É o resíduo aberto de **G-26** ([GAP_ANALYSIS](../GAP_ANALYSIS.md)), registrado desde o Goal018 e sem Goal atribuído até aqui.

Entra agora, e nesta ordem, pelo critério que o próprio Goal028 acabou de provar: **fato declarado em mais de um lugar, sem gate que confira, deriva** — foi assim que o `schema.prisma` da IA e do Scheduling passou dezoito ensaios divergindo do histórico que o próprio repositório cria. Entra **antes** da auditoria final (**030**) porque a auditoria verifica conformidade e não constrói nem corrige contrato: descobrir nela que o fuso do negócio e o fuso da agenda podem divergir seria descobrir tarde, exatamente o argumento que a v49 usou para pôr o 028 antes dela.

Este Goal **não** reintroduz `packages/contracts` (**D-042** vale), não faz deploy, não mede capacidade, não fecha **U-03** nem **M4**, não toca retenção, lembretes, central de notificações, conhecimento ou ciclo de vida da conta, não muda a importação única e não faz a auditoria final do MVP. G-32 (parsers duplicados entre frontend, BFF e Scheduling) continua **sem Goal atribuído** e vai para o relatório da auditoria — não é escopo daqui.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md). **D-010** (reconciliação desired/effective em requisição), **D-026**, **D-042**, **D-043** e **D-044** em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente.

## Dependências e contexto mínimo

- Goals 009, 018, 019, 024 e 028 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- `apps/bff/PUBLIC_API_V1.md`: o contrato que encolhe em §3 é declarado ali.
- `apps/bff/src/lib/ai-activation.ts`: as quatro propriedades da reconciliação em requisição (limitada, idempotente, nunca lança, honesta) estão escritas no cabeçalho do arquivo e valem aqui sem reinvenção.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, provisionamento do PostgreSQL descartável, guards de destino descartável e o padrão dos ensaios `scripts/goalNNN-*-rehearsal.mjs` com passo nomeado em `scripts/validate-integration.mjs`.
- [DATA_MIGRATION](../DATA_MIGRATION.md): tabela de migrations por Goal e o padrão de ensaio.
- **Product Vault:** consultar apenas se precisar confirmar a regra de negócio de fuso e de horários (`docs/product-vault/`, busca dirigida, 1–3 notas). Não abrir o vault inteiro.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `f1a8b7b8`. Não gastar rodada redescobrindo:

- **`GET /v1/settings` já lê as duas cópias na mesma função:** `settingsState` (`apps/bff/src/modules/settings/routes.ts:230-275`) carrega `BusinessProfile` e `scheduling.calendar(context)` em paralelo e devolve as duas. É o ponto de leitura onde a divergência é observável sem nenhuma consulta nova.
- **`GET /v1/calendar` (`apps/bff/src/modules/calendar/routes.ts:642`)** é o que a agenda do frontend consome, e é dele que sai o `timezone` usado para renderizar dia, semana, mês, formulário de agendamento e bloqueios.
- **O cliente interno já tem o escritor:** `SchedulingClient.configureCalendar(context, { source: "ATENDLY", timezone })` (`apps/bff/src/clients/scheduling/index.ts:559-570`), que fala com `PATCH /internal/calendar` e devolve o calendário resultante validado por `calendarSchema`.
- **O Scheduling é o único dono de `CalendarSettings`:** `PATCH /internal/calendar` (`apps/scheduling-service/src/modules/internal-api/routes.ts:523-540`, `upsert` com `update: { timezone }`) e a rota de disponibilidade (`:861-898`) são os dois escritores; `assertTimezone` já valida IANA nos dois lados.
- **`source` já está travado em `ATENDLY`** pela `CalendarSettings_source_atendly_check` do Goal027; qualquer escrita de calendário feita aqui precisa continuar mandando `"ATENDLY"` e nada mais.
- **O frontend já manda o mesmo valor nas três chaves:** `ctx.draft.timezone` no onboarding (`blocks/business.tsx:196`, `blocks/schedule.tsx:230,281`) e `settings.business?.timezone` na disponibilidade (`AvailabilitySettings.tsx:41`). A divergência **não** nasce da interface atual; nasce de `PATCH /v1/settings/business`, que não propaga, e do contrato, que permite três valores diferentes.
- **A IA já deriva do dono certo** (`businessContextPayload`), então nenhum trabalho novo de projeção é esperado — só prova de que continua assim.
- **`assertTimezone` existe duas vezes no BFF** (`modules/settings/routes.ts:338` e `modules/onboarding/routes.ts:259`) e recusa fuso IANA inválido com `VALIDATION_ERROR` 400. Reusar a validação existente; não inventar código de erro novo.

## Pontos de implementação

- `apps/bff/src/modules/settings/routes.ts`: propagação na escrita do negócio, redução do corpo de disponibilidade e ponto de reconciliação de leitura.
- `apps/bff/src/modules/onboarding/routes.ts`: redução do corpo de onboarding.
- `apps/bff/src/modules/calendar/routes.ts`: reconciliação na leitura que a agenda consome.
- `apps/bff/src/lib/`: o módulo de reconciliação de fuso, no padrão de `ai-activation.ts` — arquivo novo ou função nova, a escolha é do executor, desde que o resultado seja legível e testável isoladamente.
- `apps/bff/src/clients/scheduling/index.ts`: só se a propagação exigir algo que `configureCalendar` ainda não ofereça.
- `apps/bff/PUBLIC_API_V1.md`: o contrato que encolhe.
- `apps/bff/tests/` e `apps/scheduling-service/tests/`: provas dirigidas.
- `scripts/goal029-timezone-reconciliation-rehearsal.mjs` (novo) e `scripts/validate-integration.mjs`: o ensaio com passo nomeado próprio.
- Documentação: `docs/migration/` conforme §8.

**Nenhuma migration nova é esperada em nenhum serviço.** Nenhum campo é removido de nenhum schema: `CalendarSettings.timezone` continua existindo e continua sendo lido — ele deixa de ser **decidido** em separado, não deixa de existir. Se o executor concluir que uma migration é necessária, ela precisa ser aditiva, declarada e justificada no relatório, jamais edição de migration já aplicada.

## Escopo obrigatório

### 1. Um dono declarado

- `BusinessProfile.timezone` é o dono do fuso do negócio. `CalendarSettings.timezone` passa a ser **réplica derivada**: continua sendo a fonte da matemática de data do Scheduling, e continua sendo lida por todo mundo que já a lê, mas o valor dela é consequência do dono, nunca uma decisão própria.
- A escolha do dono fica escrita no código, junto do módulo de reconciliação, e em §8. O Scheduling **não** passa a consultar o BFF: a direção é sempre BFF → Scheduling, e nenhuma leitura de agenda pode passar a depender de uma chamada nova ao BFF.

### 2. A escrita do negócio propaga, e o resultado é honesto

- `PATCH /v1/settings/business` propaga o fuso para o Scheduling **na mesma requisição**, por `configureCalendar` com `source: "ATENDLY"`, quando o fuso gravado mudou. Fuso igual ao que já está gravado não gera chamada.
- A propagação acontece **depois** do commit da transação do BFF, nunca dentro dela: são bases distintas e não há transação comum. O dado do dono não pode ficar refém do Scheduling estar de pé.
- Falha na propagação **não** pode virar sucesso silencioso e **não** pode virar `500` que apaga a gravação já feita. O estado precisa ficar legível na resposta, no mesmo espírito de `contextProjectionStatus` (Goal018/Goal019): quem lê sabe que o fuso do negócio mudou e que a agenda ainda não convergiu. Escolher entre reusar o campo existente e acrescentar um estado próprio é do executor, desde que a resposta não afirme convergência que não houve — a interface não pode prometer efeito que não aconteceu.
- O diálogo de `BusinessSettings.tsx` passa a ser verdade. Se a copy precisar mudar por causa disso, ela não muda: o backend passa a cumprir o que ela já diz.

### 3. O contrato público deixa de aceitar três fusos

- `POST /v1/onboarding`: `calendar.timezone` e `availability.timezone` deixam de ser valores independentes. O campo **não é removido** — mesmo tratamento que o Goal027 deu a `source` —, mas o domínio encolhe: ausente é aceito e resolvido a partir do fuso do negócio; presente e diferente do fuso do negócio é recusado com o `VALIDATION_ERROR` 400 que já existe, com mensagem própria. Fuso IANA inválido continua recusado como hoje.
- `PATCH /v1/settings/availability`: mesma regra. O corpo continua aceitando `timezone`, mas ele não pode decidir nada sozinho; divergir do fuso do negócio é erro de requisição, não escrita silenciosa.
- Se o negócio ainda não tiver `BusinessProfile` gravado — caminho real no onboarding, em que o bloco de negócio pode ainda não ter passado —, o comportamento precisa ser explícito e testado: o valor recebido é aceito e passa a ser o do negócio, ou a requisição é recusada com motivo claro. Não deixar esse caso implícito.
- `apps/bff/PUBLIC_API_V1.md` declara a redução, no formato que o documento já usa para mudanças de domínio de campo.
- Nenhum código de erro público novo é criado, nenhuma rota muda de forma, de método ou de status.

### 4. Tenant já gravado com divergência converge sozinho

- Reconciliação em requisição, no padrão de `ai-activation.ts` (**D-010**), com as quatro propriedades valendo e sem nenhuma opcional: **no máximo uma tentativa por requisição**, **idempotente**, **nunca lança** (leitura não vira `500` por causa de um efeito de favor) e **honesta** (o que aconteceu é legível, e "nada a fazer" é resposta).
- Pontos de reconciliação obrigatórios: `GET /v1/settings` e `GET /v1/calendar`. Os dois já leem as duas cópias ou podem lê-las sem consulta nova; quem lê estado é quem tem o dado para decidir.
- Sem worker, sem job novo, sem laço, sem retentativa interna. A continuidade vem da próxima requisição — é o que a plataforma já faz para ativação da IA, e acrescentar um laço de fundo aqui seria contradizer o inventário de loops que o Goal028 acabou de fechar.
- Divergência resolvida é resolvida em silêncio; divergência que não converge fica visível no mesmo lugar em que o estado é lido.

### 5. O que converge e o que não é reescrito

- Este Goal **não** reinterpreta dado gravado. Agendamento gravado tem instante; mudar o fuso muda como ele é exibido e como as regras locais de disponibilidade são lidas, não o instante. Nenhuma linha de `Appointment`, `AvailabilityRule`, `TimeBlock` ou exceção é reescrita por causa daqui.
- O único dado que muda de valor é `CalendarSettings.timezone`, e só quando ele divergia do dono.
- O que muda de comportamento visível precisa estar escrito em §8, incluindo o fato de que horários locais já configurados (regras de disponibilidade, bloqueios) passam a ser interpretados no fuso novo — que é exatamente o que o diálogo da tela já avisa.

### 6. O que não pode mudar de comportamento

- `CalendarSettings.source` continua `ATENDLY` e travado pela `CalendarSettings_source_atendly_check`; nenhuma escrita nova pode mandar outro valor.
- Importação única, retenção, lembretes, central de notificações, conhecimento, ciclo de vida da conta e mídia ficam como estão.
- `packages/contracts` **não** volta (**D-042**); os parsers continuam onde estão, e G-32 não é escopo deste Goal.
- Nenhum passo existente de `validate:core`/`validate:integration`/`validate:ui` é removido, renomeado ou enfraquecido, incluindo os dois passos novos do Goal028.
- Nenhuma tela é redesenhada. Mudança em `apps/frontend/` só é autorizada se for consequência direta da redução de contrato de §3 (por exemplo, parar de enviar uma chave que o BFF passou a recusar), e nesse caso o gate renderizado é obrigatório.

### 7. Prova

- **Integração contra PostgreSQL descartável:** passo nomeado novo em `scripts/validate-integration.mjs` que semeia um tenant com as duas cópias **divergentes** — o estado que existe hoje em qualquer base que já tenha passado por `PATCH /v1/settings/business` —, exerce a leitura reconciliadora e prova a convergência, reportando a contagem de linhas avaliadas e convergidas. Guards de destino descartável no padrão dos ensaios existentes: só loopback, só nome descartável, recusa com `exit 2` e mensagem `REFUSED — …`, sem imprimir credencial.
- **Testes dirigidos, cada um falhando pelo motivo que anuncia:** propagação na escrita do negócio; ausência de chamada quando o fuso não mudou; falha de propagação que não vira sucesso e não vira `500`; recusa das três entradas públicas quando divergem; reconciliação idempotente (segunda passada não gera efeito novo); reconciliação que não lança quando o Scheduling está fora; e o contexto da IA continuando a derivar do dono.
- **`validate:core` e `validate:integration`** executados sobre a **árvore final**, não sobre a de uma rodada anterior. Essa é a lição mais cara do Goal027 e do Goal028: documentação de fechamento se escreve depois da última mudança de árvore, ou se reexecuta.
- Se `apps/frontend/` for tocado, `validate:ui` nas cinco larguras é obrigatório e o relatório traz o resultado.
- Nada de asserção trivialmente verdadeira; fixture não pode mascarar o defeito que o teste diz cobrir; skip não é passe.
- O repositório é npm: não invocar `pnpm` nem `corepack`. Antes de declarar pronto, `git status --porcelain` não pode listar artefato não rastreado que não seja arquivo novo declarado no relatório.

### 8. Documentação

Atualizar apenas o que a mudança fizer mentir. [CURRENT_STATE](../CURRENT_STATE.md): o dono do fuso, a propagação e os pontos de reconciliação. [GAP_ANALYSIS](../GAP_ANALYSIS.md): a linha **G-26**, que deixa de ter a metade de timezone aberta — e só ela, se o diff não mover outra. [DATA_MIGRATION](../DATA_MIGRATION.md): o ensaio novo na tabela e o que ele prova, mais a nota de que nenhum dado de agendamento foi reescrito. [VALIDATION_GATE](../VALIDATION_GATE.md): o passo novo na tabela de comandos canônicos. `apps/bff/PUBLIC_API_V1.md`: a redução de domínio de §3. Registrar a decisão em [DECISIONS](../DECISIONS.md) como **D-045**, no formato das anteriores, cobrindo: o dono único do fuso, a direção da propagação e por que ela fica fora da transação, a forma da reconciliação entre bases sem transação comum, a redução das três entradas públicas a uma e o que continua não sendo reescrito. Não criar documento novo.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. `PATCH /v1/settings/business` com fuso diferente do gravado propaga para o Scheduling na mesma requisição, e `CalendarSettings.timezone` passa a valer o fuso novo, provado por teste contra o serviço real ou dublê fiel do cliente interno.
2. `PATCH /v1/settings/business` com o mesmo fuso não chama o Scheduling — provado por asserção sobre a chamada, não por inspeção visual.
3. A propagação ocorre fora da transação que grava `BusinessProfile`, e falha do Scheduling **não** desfaz a gravação do negócio nem devolve `500`.
4. Falha de propagação fica legível na resposta de leitura de estado; nenhum caminho responde afirmando convergência que não aconteceu.
5. `POST /v1/onboarding` com `calendar.timezone` ou `availability.timezone` diferente de `business.timezone` é recusado com `VALIDATION_ERROR` 400 e mensagem própria; com a chave ausente, o fuso do negócio é usado e o calendário fica com ele.
6. `PATCH /v1/settings/availability` com `timezone` divergente do fuso do negócio é recusado da mesma forma; com o mesmo fuso, o comportamento de hoje é preservado, incluindo `minLeadMinutes`, `maxLeadDays` e `granularityMinutes`.
7. O caso de negócio ainda não gravado no onboarding tem comportamento explícito, documentado e coberto por teste.
8. `GET /v1/settings` e `GET /v1/calendar` convergem um tenant divergente: depois da leitura, as duas cópias são iguais, provado por leitura direta das duas bases no ensaio.
9. A reconciliação faz **no máximo uma tentativa por requisição**, não tem laço, não tem worker novo e não tem retentativa interna.
10. A reconciliação é idempotente: a segunda leitura sobre um tenant já convergido não produz escrita nova nem efeito novo.
11. A reconciliação nunca lança: com o Scheduling indisponível, as duas leituras respondem normalmente, com o estado de não convergência legível, e sem `500`.
12. O contexto de negócio enviado à IA continua derivando de `BusinessProfile.timezone`, provado por teste; nenhuma projeção nova foi criada para isso.
13. Existe passo nomeado em `scripts/validate-integration.mjs` que semeia divergência real entre as duas bases, exerce a convergência e reporta as contagens, e ele roda verde contra PostgreSQL real.
14. O ensaio novo recusa destino que não seja loopback com nome descartável, com `exit 2` e mensagem própria, e não imprime credencial.
15. `CalendarSettings.source` continua `ATENDLY` em toda escrita nova, e a `CalendarSettings_source_atendly_check` continua recusando qualquer outro valor.
16. Nenhuma linha de `Appointment`, `AvailabilityRule`, `TimeBlock` ou exceção foi reescrita por este Goal.
17. Nenhuma migration nova foi criada; se alguma tiver sido, ela é aditiva, declarada e justificada, e nenhuma migration existente foi editada, renomeada ou removida.
18. `packages/contracts` não voltou, nenhum pacote compartilhado de contrato foi criado, e nenhum parser foi movido entre apps.
19. Nenhuma rota pública, rota interna, escopo interno ou código de erro mudou além da redução de domínio declarada em §3, registrada em `apps/bff/PUBLIC_API_V1.md`.
20. Nenhum passo existente de `validate:core`/`validate:integration`/`validate:ui` foi removido, renomeado ou enfraquecido, incluindo `rehearse:goal028-release-migrations` e `rehearse:goal028-restore`.
21. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha.
22. Os gates declarados foram executados **sobre a árvore final** e o relatório traz o resultado real de cada um; se `apps/frontend/` foi tocado, `validate:ui` nas cinco larguras está entre eles.
23. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.
24. [DECISIONS](../DECISIONS.md) tem **D-045** registrada no formato das anteriores, sem quebrar o bloco de nenhuma decisão anterior, e a documentação de §8 foi escrita **depois** da última mudança de árvore.

## Entrega

Relatório do Developer com: diff por área, o passo novo do gate com nome exato e tempo medido, as contagens reportadas pelo ensaio (tenants semeados, divergências criadas, convergidas), a decisão tomada sobre como a não convergência fica legível na resposta e por quê, o comportamento escolhido para o caso de negócio ainda não gravado no onboarding, a lista de arquivos tocados fora dos pontos de implementação com justificativa, e o que ficou declaradamente fora — com **G-32**, **U-03** e **M4** nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
