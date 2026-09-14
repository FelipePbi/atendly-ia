# Goal 016 — Agenda na UI

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-14 pelo Tech Lead Agent após [Goal015 ACCEPTED](../reviews/015-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_HIGH

## Baseline aceita

Baseline aceita: `3c3cc16b5f0add1046ba4e0e2978076913601019`

Goal anterior: 015 — Clientes e Serviços na UI

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal015 já integrado em `main` (origem `6ac59a179dbebb0fc3277420184db9f8abfa125d`), incluindo implementação das três rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Entregar o **núcleo operacional** da plataforma: a Agenda. Os Goals 008 e 009 fecharam o domínio inteiro — política única de escrita, hold de cinco minutos pelo relógio do banco, sobreposição só por decisão humana registrada, estados do produto com presença e valor final separados, histórico por evento, compromisso pessoal distinto de bloqueio operacional, séries finitas com ocorrências materializadas, exceções de disponibilidade geridas e série de atendimento com confirmação atômica. O adapter do frontend mapeia quase tudo isso. **Nenhuma tela consome nada disso.** A agenda de hoje é uma lista de uma semana com filtro local: cria atendimento com um serviço só, exigindo telefone, sem hold, sem sobreposição, sem ciclo de vida, sem histórico, sem série, sem exceção — e não mostra bloqueio nenhum, porque não existe rota de leitura de bloco em camada alguma.

Este Goal fecha G-13 na parte de interface, avança G-31 na tela de módulo mais pesada do produto, e absorve três resíduos que reviews anteriores dirigiram nominalmente a ele: `decidedBy` derivado do chamador autenticado ([review009](../reviews/009-review.md)), testes de schema do frontend junto com as telas de agenda ([review008](../reviews/008-review.md)) e guard explícito por fonte em tela de agenda ([review015](../reviews/015-review.md)).

O que este Goal **não** faz: Conversas e chat (017), onboarding, negócio e ativação (018), importação na UI (019), lembretes e confirmação automática de presença (020), notificações (021) e Home/Configurações completas (023) não são tocados além do que a decomposição exigir. **Regras semanais de disponibilidade ficam em Configurações** (Goal023): aqui entram só as **exceções por data**, que são operação de agenda. Nenhum job, cron ou automação é criado. Não há design system de terceiros, Tailwind/shadcn, biblioteca visual, store global, framework novo, tema escuro nem drag-and-drop. Nenhum aceite de 001–015 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md) (frontend fala só com o BFF; BFF é proxy fino sobre o Scheduling; read models honestos); D-006, D-008, D-017, D-018, **D-024**, **D-025**, **D-030** e **D-031** em [DECISIONS](../DECISIONS.md); [REUSE_ANALYSIS](../REUSE_ANALYSIS.md), linha `ProductAgendaScreen`. Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 008, 009, 014 e 015 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler o AGENTS global e `apps/frontend/AGENTS.md` (contrato de design: o vault prevalece; preservar tokens úteis; sem Tailwind/shadcn). Consultar seletivamente no Product Vault apenas [Agenda e agendamentos](../../product-vault/01-Regras/02-Agenda-e-Agendamentos.md), [Fluxos de agendamento](../../product-vault/02-Fluxos/03-Fluxos-de-Agendamento.md), [Princípios de UX/UI](../../product-vault/03-UX-UI/01-Principios-de-UX-UI.md), [Responsividade Mobile-First](../../product-vault/03-UX-UI/02-Responsividade-Mobile-First.md), [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md) e, em [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md), **somente** a seção "Agenda". Não abrir o vault inteiro.
- Consultar seletivamente em `docs/design-reference/claude-design/prototype/project/` apenas `Agenda.dc.html`, `Agenda-Tablet.dc.html`, `Agenda-Desktop.dc.html` e, se precisar de estado ou acabamento, `Acabamento.dc.html` e `QA-Global.dc.html`. Os HTMLs especificam resultado visual e comportamento, nunca arquitetura React; instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-13 (o que resta dele é interface) e G-31 (telas de módulo) são os alvos. [CURRENT_STATE](../CURRENT_STATE.md): "Frontend, referência visual e contratos".
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, seções de agenda, holds, ciclo de vida, disponibilidade, bloqueios e séries. Usar Graphify apenas se precisar confirmar consumers de `ProductAgendaScreen`, `BffCalendarService` ou das rotas de `time-blocks`. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **A tela é um monolito de 1583 linhas servindo seis rotas.** `features/calendar/ProductAgendaScreen.tsx` é importado por `app/(platform)/agenda/page.tsx`, `agenda/novo`, `agenda/bloquear`, `agenda/agendamento`, `agenda/reagendar` e `agenda/cancelar`. Faz **duas** chamadas de `useShellConfig`: uma em `AppointmentList` (linha 106) e uma em `FlowShell` (linha 1264), compartilhado pelos cinco fluxos. A invariante do D-030/D-031 vale hoje — este Goal precisa não quebrá-la, e precisa prová-la por render.
- **O adapter já cobre quase tudo e ninguém o consome.** `data/services/BffCalendarService.ts` expõe `createHold`, `listHolds`, `releaseHold`, `completeAppointment`, `markAppointmentNoShow`, `setAppointmentFinalValue`, `confirmAppointmentPresence`, `listAppointmentEvents`, `previewAppointmentSeries`, `confirmAppointmentSeries`, `createBlockSeries`, `editBlockSeriesFromDate`, `removeBlockSeries`, `removeBlockOccurrence`, `moveBlockOccurrence`, `listAvailabilityExceptions`, `createExtraAvailability`, `createUnavailability` e `removeAvailabilityException`, além de `overlapOverride`/`overlapOverrideReason` em `CreateAppointmentInput` e `RescheduleAppointmentInput`. Buscar qualquer um desses nomes em `apps/frontend/src` fora do próprio adapter não devolve **nenhum** consumidor.
- **A criação de atendimento ainda identifica cliente por telefone.** `CreateAppointmentInput` declara `customerName: string` e `customerPhone: string` **obrigatórios** e não expõe `customerId`. `NewAppointment` monta `finalName`/`finalPhone` a partir do cliente selecionado e exige os dois (`canSubmit`), então **cliente sem telefone não pode ser agendado** e dois cadastros com o mesmo número são indistinguíveis. `POST /v1/appointments` aceita `customerId` desde o Goal008 (`apps/bff/src/modules/calendar/routes.ts`, schema de criação) e a [PUBLIC_API_V1](../../../apps/bff/PUBLIC_API_V1.md) diz isso explicitamente. É a mesma identidade que o Goal015 tirou do perfil do cliente, sobrevivendo na criação.
- **Não existe rota de leitura de bloco em camada nenhuma.** `POST`, `DELETE` e as operações de ocorrência existem em `/v1/time-blocks` e `/internal/time-blocks`; **`GET` não existe** — nem no BFF, nem no client `apps/bff/src/clients/scheduling/index.ts`, nem no `internal-api` do Scheduling, nem no adapter do frontend. Por isso a agenda atual não mostra bloqueio nem compromisso pessoal: a profissional vê horário livre que não está livre.
- **`decidedBy` ainda vem do corpo.** O schema de indisponibilidade em `apps/bff/src/modules/calendar/routes.ts:125-132` aceita `decidedBy` do cliente e o repassa. `internalContext(request)` (`apps/bff/src/modules/tenant/context.ts`) já carrega `userId` da sessão autenticada, e o Scheduling já deriva `decidedBy: context.userId` em outros caminhos (`internal-api/routes.ts:1315`). É exatamente o resíduo que o [review009](../reviews/009-review.md) dirigiu a este Goal.
- **`features/calendar/types.ts` descreve uma agenda que não existe.** Declara `Appointment` com `customer: string`, `service: string`, `duration: number`, `origin: "ai" | "manual" | "external"` e `status: "confirmed" | "cancelled"` — nada disso é o contrato. Seu único importador é `src/mocks/data/appointments.ts`, que nenhuma tela alcança: é o mesmo par de código morto que o Goal015 removeu do diretório.
- **O modelo real, para não ser reinventado.** Em `data/mappers/publicApiSchemas.ts`: `appointmentSchema` tem `customerId` nulável, `customer` nulável, `services[]` com preço e duração por serviço, `title` (atendimento manual excepcional), `totalPrice`/`totalPriceType`, `status` como **texto livre de propósito** (lido por `appointmentStatusLabel`, que trata `SCHEDULED` como confirmado), `completedAt`, `completionOrigin`, `noShowAt`, `noShowNote`, `presenceConfirmedAt`, `finalValue`, `bufferBeforeMinutes`, `bufferAfterMinutes` e `seriesId`. `appointmentHoldSchema` tem `expiresAt` e `status` (`ACTIVE`/`CONSUMED`/`RELEASED`/`EXPIRED`). `appointmentEventSchema` tem nove tipos, `actor`, `reason`, `before`/`after` e `sequence` para **desempate determinístico** quando `occurredAt` empata. `timeBlockSchema` tem `kind` (`BLOCK`/`PERSONAL`), `title` e `seriesId`. `seriesOccurrencePreviewSchema` tem `adjusted`, `unavailable` e `holdId` por ocorrência. `availabilityExceptionSchema` tem `available`, `decidedBy` e `decidedReason`.
- **A leitura da agenda é de uma semana só.** `AppointmentList` mantém um cursor de início de semana, chama `listAppointments` com janela de sete dias e filtra localmente por serviço ou por origem `AI`. Não há Dia, não há Mês, não há bloco, não há exceção.
- **Fonte externa já tem onde ser barrada.** `calendarStateSchema` traz `source` (`ATENDLY`/`EXTERNAL`) e `capabilities` (`manageAvailability`, `manageServices`, `manageCustomers`, `createAppointments`, `migrate`), e `FlowShell`/`ReadOnlyState` já usam isso em parte. O [review015](../reviews/015-review.md) registrou que `minha-agenda/provider.ts:168-193` **ignora `customerId`** e só filtra por `customerPhone`: qualquer leitura de agenda por pessoa em tenant externo precisa de guard explícito por fonte, nunca de confiança no filtro do provider.
- **Gates disponíveis.** `apps/frontend` tem vitest com jsdom, `@testing-library/react`, `@testing-library/user-event`, `tests/setup/dom.ts`, o helper de axe em `tests/support/a11y.ts` e o padrão de suíte por Goal (`goal015-*.test.tsx`, incluindo a de invariante de shell). `apps/bff/tests` tem o padrão `goalNNN-*.integration.test.ts` contra PostgreSQL descartável, com `goal009-calendar-routes.integration.test.ts` como vizinho direto. O gate renderizado (`npm run validate:ui`, Playwright em 360/390/768/1024/1440) roda sem backend e cobre apenas as rotas públicas de `e2e/routes.ts`.

## Pontos de implementação

`apps/scheduling-service/src/modules/internal-api/routes.ts` e o módulo de calendário correspondente (leitura de blocos), `apps/bff/src/clients/scheduling/index.ts`, `apps/bff/src/modules/calendar/routes.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `apps/frontend/src/data/services/BffCalendarService.ts`, `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `apps/frontend/src/features/agenda/` (destino da decomposição), `apps/frontend/src/features/calendar/` (origem), `apps/frontend/src/app/(platform)/agenda/**`, `apps/frontend/src/shared/ui/` (consumo das primitivas existentes), `apps/frontend/src/shared/styles/atendly-agenda.css` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. Os dois contratos que faltam, e só eles

**(a) Leitura de bloqueios e compromissos pessoais.** Criar `GET /internal/time-blocks?startDate&endDate` no Scheduling e `GET /v1/time-blocks?startDate&endDate` no BFF, escopados por tenant como todas as demais, devolvendo os blocos da janela com `id`, `startAt`, `endAt`, `reason`, `kind`, `title` e `seriesId` — a mesma forma já usada nas respostas de escrita. É **aditivo**: nenhuma rota existente muda de forma, e a janela é obrigatória para não permitir varredura sem limite. Sem isso a agenda mente sobre ocupação, e ocorrência de série não pode ser editada nem movida porque a tela nunca soube o `id` dela.

**(b) `decidedBy` derivado do chamador autenticado.** `POST /v1/availability-exceptions/unavailable` deixa de aceitar `decidedBy` no corpo; o BFF o preenche a partir de `internalContext(request).userId`, exatamente como o Goal009 fez com o `source` da mutação. `decidedReason` continua vindo do corpo, porque é conteúdo humano e não identidade. O contrato interno do Scheduling continua recebendo o par, e o BFF nunca repassa valor fornecido pelo cliente. Isso fecha o resíduo do [review009](../reviews/009-review.md). É a **única** mudança subtrativa do Goal, e é de identidade de ator: quem decide não se autodeclara.

Nenhum outro endpoint é criado, removido ou alterado. `PUBLIC_API_V1.md` é atualizado nesses dois pontos e em nada mais.

### 2. Decomposição por módulo, com a invariante do shell preservada

Separar `ProductAgendaScreen` em `features/agenda/`, com um componente de topo que **despacha os estados da tela** e declara `useShellConfig` uma única vez por branch mutuamente exclusivo, com os valores derivados do estado — o padrão que o D-031 registrou e que o Goal015 provou. As seis rotas continuam funcionando e continuam sendo as mesmas seis: este Goal não inventa rota nova a menos que um fluxo obrigatório exija, e se exigir, a rota entra declarada no relatório. O CSS de módulo (`atendly-agenda.css`) continua existindo e herdando os tokens do Goal014; as primitivas de `shared/ui/` são a base da composição.

### 3. Dia, Semana e Mês — mobile-first, com ocupação honesta

Três visualizações sobre a mesma janela de dados, alternáveis e com a escolha visível: **Dia** (grade cronológica, com os horários ocupados na posição real), **Semana** (sete dias navegáveis) e **Mês** (densidade por dia, com seleção que leva ao Dia). O ponto de partida é 360px: a visualização precisa ser usável no celular antes de ser confortável no desktop.

A grade mostra, na mesma superfície e distinguíveis por texto e forma — **nunca só por cor**: atendimentos (com cliente, serviços e estado), **bloqueios operacionais**, **compromissos pessoais** (que não são bloqueio operacional e precisam de rótulo próprio), **exceções de disponibilidade** do período (disponibilidade extra e indisponibilidade, com o motivo quando houver) e a **ocupação por buffer** (`bufferBeforeMinutes`/`bufferAfterMinutes`), que o Goal009 tornou ocupação real e que a tela precisa exibir como ocupado, não como livre. Atendimento cancelado ou com falta não ocupa a agenda (`isActiveAppointmentStatus`) e precisa ficar visualmente distinto de confirmado.

Estados de carregando, vazio e erro recuperável cujo retry **de fato sai do erro** — o defeito que o [review015](../reviews/015-review.md) pegou no `ServiceList` não pode reaparecer aqui. Nada de campo fabricado: o que o read model não devolve não aparece.

### 4. Criação de atendimento: pessoa por ID, múltiplos serviços, hold e sobreposição

- **Identidade por `customerId`.** `CreateAppointmentInput` passa a expor `customerId`, e `customerName`/`customerPhone` passam a ser opcionais no adapter, como o contrato sempre permitiu. Cliente escolhido da lista vai por ID. Cliente novo vai por nome e telefone, criado **na confirmação**, dentro da transação do agendamento. **Agendar cliente sem telefone tem de funcionar.** Identificar pessoa por telefone na criação é reintroduzir a identidade que o Goal006 removeu do domínio e que o Goal015 removeu do perfil.
- **Múltiplos serviços.** `serviceIds` é uma lista: a tela permite escolher mais de um serviço, mostra a duração somada e o preço conforme as quatro semânticas — quando qualquer serviço for `ON_REQUEST` ou `NOT_INFORMED`, o total **não** é apresentado como valor fechado, e `totalPriceType` do contrato é a fonte disso, não uma regra inventada na tela. A disponibilidade é consultada para o conjunto escolhido, não para o primeiro serviço.
- **Hold antes de confirmar.** Escolher um horário cria um hold (`createHold`) e a confirmação o consome (`holdId` em `createAppointment`). A tela mostra que o horário está **reservado** e por quanto tempo (`expiresAt`), trata a expiração sem fingir que o horário continua garantido, e **libera o hold** (`releaseHold`) quando a profissional abandona o fluxo ou troca de horário. Hold expirado ou perdido leva a reescolher horário com mensagem própria, nunca a um erro genérico.
- **Sobreposição só por decisão humana, com motivo.** Quando o horário conflita, a tela apresenta o conflito de forma legível — com o que ocupa o intervalo — e oferece duas saídas: escolher outro horário ou sobrepor explicitamente. Sobrepor exige `overlapOverrideReason` preenchido; sem motivo, a ação não envia. A sobreposição fica registrada como evento (`OVERLAP_OVERRIDE`) e aparece no histórico do atendimento.
- **Remarcar e cancelar** seguem as mesmas regras: remarcar usa hold e pode exigir sobreposição com motivo; cancelar pede confirmação e explica o efeito. O snapshot comercial do Goal007 é imutável — se a tela disser algo sobre preço de atendimento já criado, tem de dizer isso.

### 5. Compromisso pessoal, bloqueio e séries de bloqueio

Criar **bloqueio operacional** (`kind: "BLOCK"`) e **compromisso pessoal** (`kind: "PERSONAL"`) como coisas distintas, com título quando fizer sentido, e removê-los. Criar **série finita** (`createBlockSeries`) com dias da semana, horário e **um** entre data final e número de ocorrências — nunca os dois, porque o contrato recusa. Conflito na criação da série tem duas saídas explícitas, ambas do contrato: pular as ocorrências em conflito (`skipConflicts`) ou forçar com motivo (`forceOverlapReason`); a tela mostra o que será pulado antes de confirmar.

Sobre uma série existente: **editar a partir de uma data** (`editBlockSeriesFromDate`, que encerra a série atual e cria outra, preservando o passado — a tela precisa dizer isso, porque é o que acontece), **remover a série** (só as ocorrências futuras) e, sobre uma ocorrência isolada, **removê-la** ou **movê-la** sem tocar a série. Distinguir "esta ocorrência" de "a série a partir daqui" é obrigatório na UI: confundir as duas apaga trabalho da profissional.

### 6. Série de atendimento: pré-visualização e confirmação atômica

Oferecer recorrência ao agendar (o Goal007 persiste `recurrenceIntervalDays` por serviço e o Goal011 já o projeta para a IA). O fluxo é o do contrato, e não outro: `previewAppointmentSeries` devolve as ocorrências com `adjusted` (horário deslocado), `unavailable` (sem horário) e `holdId`; a tela mostra cada ocorrência com o que aconteceu com ela, permite desistir, e `confirmAppointmentSeries` confirma **de uma vez**, com `Idempotency-Key`, consumindo os holds. Série parcialmente confirmada não é resultado válido: a tela não oferece confirmar "as que deram certo" por conta própria. Ocorrência indisponível é mostrada como indisponível, não escondida nem substituída por outro horário sem dizer.

### 7. Ciclo de vida e histórico

No detalhe do atendimento: **concluir**, **marcar falta** (com nota opcional), **confirmar presença** e **registrar valor final**. Os três eixos do Goal008 são distintos e a tela precisa mantê-los distintos: **estado** (`CONFIRMED`/`COMPLETED`/`CANCELLED`/`NO_SHOW`, lidos por `appointmentStatusLabel`, que trata `SCHEDULED` legado como confirmado), **presença** (`presenceConfirmedAt`) e **valor final** (`finalValue`, que não é o preço do snapshot). Conclusão automática (`completionOrigin: "AUTO"`) é apresentada como automática, não como ação da profissional.

**Histórico por evento** (`listAppointmentEvents`): linha do tempo em ordem cronológica com desempate por `sequence` — `occurredAt` é o início da transação e empata de propósito —, mostrando tipo, origem (`AI`/`USER`/`SYSTEM`/`INTEGRATION`), ator e motivo quando houver. O que foi feito pela IA aparece como feito pela IA.

### 8. Exceções de disponibilidade por data

Abrir **disponibilidade extra** num dia (`createExtraAvailability`) e declarar **indisponibilidade** total ou parcial (`createUnavailability`), com motivo, e removê-las. Quando a indisponibilidade cobre atendimento confirmado, a decisão é humana e explícita: a tela mostra o que será afetado e exige `decidedReason`. **`decidedBy` não é campo de formulário** — vem da sessão, conforme o item 1(b). Regra semanal de disponibilidade continua em Configurações e não é editada aqui.

### 9. Fonte externa: guard explícito por operação

Toda operação de escrita e toda leitura por pessoa consultam `calendar.source` e `calendar.capabilities` **antes** de montar o fluxo, e a tela diz o que aquela fonte permite, em vez de oferecer operação que vai falhar. O motivo é concreto e está registrado no [review015](../reviews/015-review.md): `minha-agenda/provider.ts` ignora `customerId` e só filtra por `customerPhone`, então confiar no filtro do provider em tenant `EXTERNAL` listaria a agenda inteira do profissional como se fosse de uma pessoa. Em fonte externa, a agenda por pessoa não é oferecida — é explicada. O que já existe em `SourceStrip`/`ReadOnlyState` é reaproveitado, não substituído por mensagem genérica.

### 10. Limpeza do resíduo do Goal015

Bounded e listado, sem virar refactor de oportunidade: remover `features/calendar/types.ts` e `src/mocks/data/appointments.ts` (par de código morto, como o `directory.ts` do Goal015); remover `features/customers/types.ts` e `features/services/types.ts` se e somente se continuarem sem importador; remover `shared/styles/atendly-directory.css` e seu `@import` em `app/globals.css`, já que `features/directory/` está vazia — conferindo antes que nenhuma classe usada por tela viva dependa dele e, se depender, movendo a regra para o CSS do módulo certo em vez de apagar. Corrigir o botão "Revisar dados" do `CustomerForm`, que hoje volta ao formulário sem `defaultValue` e perde nome e telefone digitados. Nenhuma outra mudança em Clientes ou Serviços.

### 11. Provas

- **Invariante de shell por render**, no padrão que o Goal015 estabeleceu: montar `ShellConfigProvider` mais as telas reais de agenda em jsdom e falhar em `Maximum update depth`. Cobrir lista/visualizações e cada fluxo.
- **Identidade**: criação emitindo `customerId` para cliente existente e nunca identificando pessoa por telefone; agendamento de cliente **sem telefone** funcionando.
- **Hold**: horário escolhido cria hold, confirmação envia `holdId`, abandono ou troca de horário libera o hold, e hold expirado leva a reescolher com mensagem própria.
- **Sobreposição**: conflito apresentado com o que ocupa o intervalo; envio recusado sem `overlapOverrideReason`; com motivo, `overlapOverride` vai no corpo.
- **Ocupação honesta**: bloqueio, compromisso pessoal, exceção e buffer aparecem na grade; atendimento cancelado e com falta ficam distintos de confirmado; estado nunca só por cor.
- **Série de bloqueio**: "esta ocorrência" e "a série a partir daqui" emitem chamadas diferentes; conflito oferece pular ou forçar com motivo.
- **Série de atendimento**: ocorrência `adjusted` e `unavailable` visíveis; confirmação atômica com `Idempotency-Key`; nenhuma confirmação parcial oferecida pela tela.
- **Ciclo de vida e histórico**: estado, presença e valor final distintos; eventos ordenados por `occurredAt` com desempate por `sequence`; origem `AI` apresentada como IA.
- **Fonte externa**: em `EXTERNAL`, a agenda por pessoa não é requisitada e a operação indisponível é explicada.
- **Testes de schema do frontend** (resíduo do [review008](../reviews/008-review.md)): `goal016-schema.test.ts` no padrão de `goal009-schema.test.ts`, provando que os schemas decodificam resposta com os campos novos e continuam decodificando resposta antiga sem eles — inclusive `status` legado `SCHEDULED` e bloco sem `kind`/`title`/`seriesId`.
- **Integração do BFF** no padrão `goal016-calendar-routes.integration.test.ts`, contra PostgreSQL descartável: `GET /v1/time-blocks` escopado por tenant e com janela obrigatória, e `decidedBy` **ignorado quando enviado no corpo** e gravado a partir da sessão.
- **Acessibilidade** das telas novas com o helper de axe em jsdom: rótulos, foco por teclado nas grades, diálogos e controles de decisão.

### 12. Documentação

Atualizar apenas o que a mudança fizer mentir: `apps/bff/PUBLIC_API_V1.md` nos dois pontos do item 1, e `apps/frontend/README.md` ou `apps/frontend/AGENTS.md` apenas se descreverem a organização de `features/` de forma que a decomposição torne falsa. Nada mais.

## Migração, compatibilidade e limites operacionais

Nenhuma migration e nenhum dado tocado: as duas mudanças de contrato são uma leitura nova e uma derivação de identidade de ator. `GET /v1/time-blocks` é aditivo. A remoção de `decidedBy` do corpo é subtrativa e o único consumidor do endpoint é o frontend deste repositório — um cliente antigo que ainda envie o campo tem a chamada aceita e o valor ignorado, nunca `400`, e a prova disso é critério de aceite.

Limites que este Goal **declara e não resolve**, e que o relatório precisa repetir: (a) regras semanais de disponibilidade continuam em Configurações e não são editáveis aqui; (b) lembretes, confirmação automática de presença por lembrete e qualquer job ficam no Goal020; (c) notificações e alertas ficam no Goal021; (d) nenhum backend real, WhatsApp real, tenant com Minha Agenda real ou CI hospedada é exercitado — a capacidade da API real do Minha Agenda segue sem prova e o guard por fonte é verificado contra dublê; (e) o gate de larguras continua exercitando apenas rotas **públicas** — estender o Playwright a tela autenticada exige dar sessão ao gate e é decisão de escopo própria, não tomada aqui, então **nenhum critério deste Goal pode declarar comportamento de largura, contraste ou foco em tela autenticada como provado por teste**; (f) fidelidade visual à referência aprovada não é provada por teste nenhum e continua sendo conferência humana.

## Testes e critérios de aceite

1. `GET /v1/time-blocks?startDate&endDate` existe no BFF e no Scheduling, é escopado por tenant, exige a janela e devolve `kind`, `title` e `seriesId`; nenhuma rota existente mudou de forma. Provado por teste de integração do BFF contra PostgreSQL.
2. `POST /v1/availability-exceptions/unavailable` grava `decidedBy` a partir da sessão autenticada; `decidedBy` enviado no corpo é ignorado sem erro; `decidedReason` continua vindo do corpo. Provado por teste de integração do BFF. `PUBLIC_API_V1.md` reflete os dois pontos.
3. A agenda vive em `features/agenda/`, as seis rotas continuam funcionando, e cada árvore renderizada faz exatamente **uma** chamada de `useShellConfig` — provado por teste renderizado que monta `ShellConfigProvider` mais a tela real e falha em `Maximum update depth`, não por leitura de código.
4. Dia, Semana e Mês existem, são alternáveis com a escolha visível e funcionam a partir de 360px; a grade mostra atendimentos, bloqueios, compromissos pessoais, exceções e ocupação por buffer, distinguíveis por texto e forma e nunca só por cor; cancelado e falta ficam distintos de confirmado; carregando, vazio e erro recuperável cujo retry sai do erro.
5. Criar atendimento emite `customerId` para cliente já cadastrado e nunca identifica pessoa por telefone; cliente **sem telefone** pode ser agendado; cliente novo é criado na confirmação por nome e telefone. Provado por teste sobre a requisição emitida.
6. Múltiplos serviços podem ser escolhidos, a duração somada é apresentada e o total respeita `totalPriceType`: com serviço `ON_REQUEST` ou `NOT_INFORMED`, nenhum valor fechado é exibido.
7. Escolher horário cria hold, a confirmação envia `holdId`, abandonar o fluxo ou trocar de horário libera o hold, e hold expirado leva a reescolher horário com mensagem própria. Provado por teste.
8. Conflito de horário apresenta o que ocupa o intervalo e oferece outro horário ou sobreposição explícita; sobrepor sem `overlapOverrideReason` não envia; com motivo, `overlapOverride` vai no corpo e o evento aparece no histórico.
9. Bloqueio operacional e compromisso pessoal são criados como `kind` distintos e apresentados como coisas distintas; série finita é criada com dias/horário e **um** entre data final e contagem; conflito na série oferece pular ou forçar com motivo, mostrando antes o que será pulado.
10. Sobre série existente, "esta ocorrência" (remover/mover) e "a série a partir daqui" (editar/remover) são ações distintas, com chamadas distintas, e a tela explica que editar a partir de uma data encerra a série atual e preserva o passado.
11. Série de atendimento: a pré-visualização mostra ocorrência ajustada como ajustada e indisponível como indisponível; a confirmação é única, com `Idempotency-Key`; a tela não oferece confirmar parcialmente.
12. O detalhe do atendimento permite concluir, marcar falta com nota, confirmar presença e registrar valor final, mantendo estado, presença e valor final como eixos distintos; conclusão automática é apresentada como automática.
13. Histórico por evento aparece em ordem cronológica com desempate por `sequence`, com tipo, origem, ator e motivo; o que a IA fez aparece como feito pela IA.
14. Exceção de disponibilidade extra e indisponibilidade (total ou parcial) podem ser criadas e removidas por data; indisponibilidade que cobre atendimento confirmado mostra o que será afetado e exige `decidedReason`; **não existe campo `decidedBy` no formulário**.
15. Em fonte `EXTERNAL`, nenhuma leitura de agenda por pessoa é requisitada e cada operação indisponível é explicada pela capability correspondente, não por erro genérico. Provado por teste com estado de calendário externo.
16. `goal016-schema.test.ts` prova que os schemas de agenda decodificam resposta nova e resposta antiga sem os campos opcionais, incluindo `status` legado `SCHEDULED` e bloco sem `kind`/`title`/`seriesId`.
17. `features/calendar/types.ts` e `src/mocks/data/appointments.ts` saíram do repositório; `atendly-directory.css` e seu `@import` saíram sem perda de estilo em tela viva; tipos órfãos de `features/{customers,services}` removidos ou justificados por importador real; "Revisar dados" do `CustomerForm` preserva nome e telefone digitados.
18. Acessibilidade das telas novas verificada com axe em jsdom: rótulos, foco por teclado nas grades, diálogos e controles de decisão, sem violação nova. O que depende de layout e cascata real continua coberto apenas nas rotas públicas pelo gate renderizado — e assim deve ser relatado.
19. `npm run validate:core` (inclui build, lint e testes), `npm run validate:integration` (inclui a suíte nova do BFF), `npm run validate:ui` sem regressão nas rotas públicas nas cinco larguras e `git diff --check` passam; skips explícitos do Goal002 mantidos.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo (forma da decomposição, onde cada `useShellConfig` passou a ser declarado, desenho das três visualizações, ciclo de vida do hold na UI, apresentação de conflito e sobreposição, distinção entre ocorrência e série, copy de fonte externa), comandos executados com resultado real (core, integração, UI, lint/typecheck/build) e limites do que não foi verificado — explicitamente os seis limites (a)–(f) declarados acima, repetidos por inteiro e sem transformá-los em entrega. Sem segredo real, sem commit, sem push.

O review de 016 deve usar profundidade **DEEP dirigido** — invariante de `useShellConfig` provada por render, identidade por `customerId` em toda criação, ciclo de vida do hold (criar, consumir, liberar, expirar), sobreposição impossível sem motivo, honestidade da ocupação na grade, distinção entre ocorrência e série, `decidedBy` inderivável do cliente e guard por fonte — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão; a decisão de aceite é do Tech Lead Agent.
