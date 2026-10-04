# Goal 103 — A listagem de agendamentos traz o valor registrado e a presença confirmada

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal094 ACCEPTED](../reviews/094-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v125, já READY, inserida **à frente do 095** sem renumerar nenhum Goal. Não há linha de quadros do protótipo: o Goal não muda código de tela nem layout. Ele muda o dado que a listagem entrega, e as telas que já leem esse dado (CL6 e A1, aceitas no 094 e no 092) passam a mostrar o que está gravado.

## Baseline aceita

Baseline aceita: `da5fc19a7b75593e721364648316b140411cc108`

Goal anterior: 094 — Clientes iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal094 já integrado em `main` (origem `21b10e0b3a6c9e80c0755ea38707b139885680f7`). **Quatro rodadas**, com 8, 6, 3 e 0 blockers. **D-112** aceita. A virada de status do documento do Goal094 para `ACCEPTED` **não** entrou no commit de fechamento: veio no commit documental seguinte, `d947d6d`, que não é baseline. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, da reexecução do Tech Lead na rodada 4 do 094 ([review094](../reviews/094-review.md)): `validate:core` exit 0, `test:frontend` **141** arquivos e **1582** testes, `test:gate` **233**/**233**; `validate:ui` **169** `passed`, **21** `skipped`, **0** retentativas; `validate:integration` exit 0, gate autenticado **255** `passed` e **0** retentativas. A WU-10 do IA Loop (`validate:integration`) ficou `SKIPPED` por falta das URLs de banco de teste.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1**, com a linha de resumo de `test:scheduling-integration`, `test:bff-integration` e `test:ai-orchestrator`, que não constam do review094.

## Objetivo e posição

A observação 1 do [review094](../reviews/094-review.md) mediu, com BFF e Scheduling reais, que `GET /v1/appointments` não devolve `finalValue`. Por isso, com dados reais, todo concluído do CL6 mostra "valor não registrado · registrar", e o rodapé mostra "Valor registrado: R$ 0", mesmo com valor registrado. A tela mente para a profissional e a convida a registrar de novo um valor que já existe. O limite está na nota de fechamento de D-112 e em [GAP_ANALYSIS](../GAP_ANALYSIS.md).

Este Goal faz a listagem e a leitura de um agendamento devolverem os campos de ciclo de vida que o contrato público já declara, com o valor gravado no banco. Nenhuma tela muda de código.

**Por que agora, à frente do 095.** O defeito está numa tela aceita e mostra informação falsa sobre dinheiro. O 095 a 097 não dependem dele, mas cada Goal visual a mais sobre uma tela que mente aumenta o que precisa ser revisto. O conserto é pequeno, fica no caminho de leitura e não tem decisão de produto aberta: a regra de D-112 (e) já está aceita, e o dado já existe no banco.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **O dado existe.** `Appointment` tem `completedAt`, `completionOrigin`, `noShowAt`, `noShowNote`, `presenceConfirmedAt` e `finalValue` (`apps/scheduling-service/prisma/schema.prisma`, migration `20260909180000_goal008_agenda_expand`). A rota de ciclo de vida já os serializa em `appointment-lifecycle-service.ts` (`toSnapshot`, com `toDecimalNumber` para o decimal e `toISOString` para as datas).
2. **O Scheduling descarta.** `CalendarAppointment` (`apps/scheduling-service/src/modules/calendar/calendar-provider.ts`) não tem esses campos, e `toAvenlyAppointment` (`apps/scheduling-service/src/modules/integrations/avenly/provider.ts`) não os copia. A mesma função alimenta a listagem, a leitura de um agendamento, a série (`appointment-series-service.ts`) e o resumo da Home (`todayAppointments` e `nextAppointment` em `internal-api/routes.ts`).
3. **O BFF também descartaria.** `appointmentSchema` em `apps/bff/src/clients/scheduling/index.ts` é um `z.object` sem esses campos, e o zod remove chave desconhecida. Mesmo com o Scheduling corrigido, o BFF não repassaria.
4. **O contrato já os declara.** `appointmentSchema` em `packages/public-api-contract/src/schemas.ts` tem os seis campos, opcionais e com `default(null)`. O comentário diz que o DTO "só os traz quando a rota de ciclo respondeu". O frontend já lê `finalValue` em `CustomerAgenda.tsx` e `presenceConfirmedAt` em `DayView.tsx`. O detalhe do agendamento (`AppointmentDetail.tsx`) junta a resposta da rota de ciclo e não depende da listagem.
5. **A Agenda em Dia tem o mesmo defeito.** `DayView.tsx` mostra "presença confirmada pelo lembrete" quando a linha tem `presenceConfirmedAt`, e a listagem nunca o traz. A divergência 5 da prova visual de D-108 atribui a ausência ao seed ("o seed não grava `presenceConfirmedAt`"), com "causa não medida". A causa provável é este descarte; o Developer confirma ou descarta.
6. **A IA não recebe esses campos.** `apps/ai-orchestrator/src/modules/scheduling-service/client.ts` decodifica `/internal/appointments` com um `z.object` próprio, que não declara esses campos e os remove. Isso deve continuar assim.
7. **O planejamento do 094 errou a premissa** ao dizer que "o contrato já traz `finalValue` em cada agendamento". Ele conferiu o schema do contrato, não o que a rota devolve. Por isso, a prova deste Goal sai da rota real.

## Escolhas de desenho desta passada

**(a) Os seis campos de ciclo de vida do contrato.** `CalendarAppointment` ganha `completedAt`, `completionOrigin`, `noShowAt`, `noShowNote`, `presenceConfirmedAt` e `finalValue`, exatamente os que o contrato público já declara no agendamento. `finalValueSetAt` e `finalValueSetBy` ficam só na rota de ciclo de vida, porque o contrato do agendamento não os tem.

**(b) Mesmo valor que a rota de ciclo de vida.** Para o mesmo agendamento, cada um dos seis campos da listagem é igual ao da rota de ciclo de vida: decimal como `number` com o mesmo arredondamento, data como a mesma string ISO. A serialização é a mesma, por função compartilhada ou extraída, nunca reescrita com outra regra.

**(c) Resposta antiga continua decodificável.** `AvenlyCalendarProvider` é hoje o único `CalendarProvider`. Mas a resposta de idempotência gravada antes deste Goal não tem os campos, e `parseCalendarAppointment` (`calendarAppointmentSchema` em `calendar-service.ts`) a decodifica no replay e na série. Esse schema e o `appointmentSchema` do BFF recebem os seis campos com `nullable().default(null)` (ou equivalente). Nenhuma chave já respondida deixa de decodificar.

**(d) Só leitura.** Nenhuma regra de escrita muda. Concluir, marcar não comparecimento, confirmar presença e registrar valor continuam nas rotas de ciclo de vida, com as mesmas validações. Nenhuma migration, coluna, índice ou consulta nova: a linha já é lida inteira pelo `appointmentInclude` atual. Se a leitura exigir mudar a consulta, o Developer para e reporta.

**(e) A IA continua sem esses campos.** `apps/ai-orchestrator/src` não muda, e o schema dele continua sem declará-los.

**(f) O contrato público só muda de comentário.** Os seis campos já estão em `packages/public-api-contract`. O comentário passa a dizer que a listagem e a leitura de um agendamento os trazem, e que `null` significa "não aconteceu" ou resposta gravada antes do Goal103. O tipo não muda.

## Escopo obrigatório

### 1. Scheduling

`CalendarAppointment` e `toAvenlyAppointment` conforme (a) e (b). `calendarAppointmentSchema` conforme (c). `GET /internal/appointments`, `GET /internal/appointments/:id` e o resumo da Home passam a trazer os seis campos com o valor gravado.

### 2. BFF

`appointmentSchema` de `apps/bff/src/clients/scheduling/index.ts` conforme (c). `GET /v1/appointments`, `GET /v1/appointments/:id` e o resumo da Home repassam os seis campos sem transformar.

### 3. Provas

1. **Scheduling, contra PostgreSQL real** (`apps/scheduling-service/tests/integration/`, arquivo novo `goal103-…`). Um agendamento concluído com valor registrado, um com presença confirmada e não concluído, um não comparecimento com nota e um confirmado sem nada. Pela rota HTTP `/internal/appointments` (com `customerId` e com intervalo de datas) e por `/internal/appointments/:id`, cada um devolve os seis campos com o valor gravado. Para cada um, os seis campos são iguais aos da rota de ciclo de vida do mesmo agendamento (b). Um `finalValue` com centavos (por exemplo 149,90) volta como `149.9`. O agendamento sem nada devolve os seis como `null`.
2. **Scheduling, unidade** (`apps/scheduling-service/tests/unit/`, arquivo novo `goal103-…`). `toAvenlyAppointment` mapeia os seis campos de um registro, e `parseCalendarAppointment` de um replay antigo (sem os campos) dá `null` nos seis.
3. **BFF** (`apps/bff/tests/`, arquivo novo `goal103-…`). Com o Scheduling simulado devolvendo os seis campos, `GET /v1/appointments` e `GET /v1/appointments/:id` os devolvem iguais; com o Scheduling devolvendo a forma antiga (sem os campos), as duas rotas respondem 200 com `null`.
4. **IA** (no arquivo da prova 2 ou num teste existente do `ai-orchestrator`, sem mudar `src/`). O agendamento decodificado pelo cliente da IA não tem `finalValue` nem `noShowNote`, mesmo quando a resposta do Scheduling os traz.

As provas 1 a 3 reprovam na baseline (vermelho colado no relatório). A prova 4 passa na baseline e continua passando: ela protege (e).

### 4. Conferência com a pilha real

Depois da última edição de código, o Developer sobe BFF e Scheduling locais apontados para um banco descartável (só por variável de ambiente, sem editar arquivo), registra um valor final num concluído e confirma presença noutro pelas rotas públicas, e cola no relatório a resposta de `GET /v1/appointments` com os campos. Se o ambiente não permitir, o relatório mede e diz por quê; o review094 mostra que isso foi possível nas rodadas 2 a 4. O CL6 e o A1 não mudam de código, então o `visual:compare` não é exigido; se o Developer o rodar com dados de concluído, a captura entra no relatório.

### 5. Controles negativos, rodados depois da última edição de código

Cada um com o arquivo restaurado e `sha256` idêntico conferido no fim:

1. Remover `finalValue` do mapeamento de `toAvenlyAppointment`: a prova 1 reprova.
2. Remover os campos do `appointmentSchema` do BFF: a prova 3 reprova.
3. Serializar `finalValue` com `Math.round` (inteiro): a prova 1 reprova no valor com centavos.
4. Declarar `finalValue` no schema da IA: a prova 4 reprova.

### 6. O que este Goal não pode fazer

- Mudar qualquer arquivo de `apps/frontend/src/`, `apps/ai-orchestrator/src/`, `apps/*/prisma/` (schema e migrations), o tipo dos campos em `packages/public-api-contract`, `docs/design-reference/` ou o vault.
- Mudar rota de escrita, regra de ciclo de vida, `scripts/`, `e2e/`, `KNOWN_*` ou qualquer passo de `validate:*`.
- Expor `finalValueSetAt`, `finalValueSetBy` ou qualquer outro campo além dos seis de (a).
- Pular, remover ou marcar teste como `skip`/`todo`; afrouxar asserção existente.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração.

## Pontos de implementação

- `apps/scheduling-service/src/modules/calendar/calendar-provider.ts` (`CalendarAppointment`).
- `apps/scheduling-service/src/modules/integrations/avenly/provider.ts` (`toAvenlyAppointment`).
- `apps/scheduling-service/src/modules/appointments/appointment-lifecycle-service.ts`, só para exportar ou extrair a serialização de (b), sem mudar o que a rota de ciclo devolve.
- `apps/scheduling-service/src/modules/calendar/calendar-service.ts` (`calendarAppointmentSchema`).
- `apps/bff/src/clients/scheduling/index.ts` (`appointmentSchema`).
- `packages/public-api-contract/src/schemas.ts`, só o comentário de (f).
- Os três arquivos de teste novos da seção 3 e, se a prova 4 ficar no `ai-orchestrator`, um arquivo novo em `apps/ai-orchestrator/tests/`.
- Asserções existentes que comparem o agendamento inteiro com `toEqual` e reprovarem só porque os seis campos apareceram: ajustar para incluir os campos, declarado arquivo por arquivo no relatório.
- Os documentos abaixo.

## Fora do escopo

- Qualquer mudança de tela. Se o CL6 ou o A1 mostrarem algo errado com o dado real, o relatório descreve, sem corrigir.
- Quem cancelou o agendamento e o responsável na criação (divergências 4, 5 e 6 de D-112).
- Receita prevista no perfil (o "Revisar se" de D-112).
- Serviços (095), Conversas e Notificações (096), Configurações (097) e a troca de nome (102).

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-113** em `PROPOSED`, no formato de D-112: (a) a (f) com o motivo de cada uma. D-112 e D-108 **não** são reescritas; cada uma ganha só uma nota curta ao final, apontando para D-113: em D-112, que o limite de (e) com a API real se resolve por D-113 quando ela for aceita; em D-108, a causa medida da divergência 5 ("presença confirmada pelo lembrete"), se a prova confirmar.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): a linha "Valor registrado em Clientes › Atendimentos" ganha o estado "resolvido no Goal103, D-113 proposta", sem apagar a linha.
- `apps/bff/PUBLIC_API_V1.md`: `GET /v1/appointments` e `GET /v1/appointments/:id` passam a listar os seis campos e o significado de `null`.
- [CURRENT_STATE](../CURRENT_STATE.md) ganha um delta curto, e [VALIDATION_GATE](../VALIDATION_GATE.md) uma subseção do Goal103 com as provas, os controles do §5, a conferência do §4 e as contagens da execução final.
- FINAL_AUDIT **não** ganha seção. O vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função ou teste citado é conferido contra o código antes da entrega. Seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline como manda "Baseline aceita".
2. Implementar §1 e §2 com as provas do §3.
3. Rodar o vermelho da baseline das provas 1 a 3.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, depois `validate:integration` num banco recém-provisionado.
6. Fazer a conferência do §4 e rodar os controles do §5.
7. Escrever a prosa só depois disso.

Os controles do §5 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Retentativas e recurso do host.** No 101, `validate:core` sem variável falhou por memória e passou com `VITEST_MAX_WORKERS=2`. Se acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

## Critério de aceite

1. As provas 1 a 3 passam e reprovaram na baseline; a prova 4 passa. A prova 1 roda contra PostgreSQL real pela rota HTTP e compara cada campo com a rota de ciclo de vida.
2. Os quatro controles do §5 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
3. A conferência do §4 mostra `finalValue` e `presenceConfirmedAt` gravados em `GET /v1/appointments` da pilha real, ou o relatório mede por que o ambiente não permitiu.
4. Typecheck de `apps/scheduling-service` e `apps/bff` passam. `validate:core` passa, com `test:frontend` em **1582** testes ou mais e `test:gate` em **233**. Nenhuma suíte tem teste a menos que a recontagem da baseline.
5. `validate:integration` com exit 0, rodado depois da última edição de código, com o gate autenticado em **255** testes e **0** retentativas. Retentativa é medida e reportada com a causa.
6. `git diff --stat` não mostra arquivo em `apps/frontend/src/`, `apps/ai-orchestrator/src/` nem `prisma/`.
7. D-113 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada e sem resto de controle negativo.

**O que o aceite não prova:** a tela num aparelho real; o CL6 com o rodapé de valor capturado pelo `visual:compare`, porque a conta de teste não tem concluído com valor.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; Scheduling conforme (a) a (d); provas 1 e 2 com o vermelho da baseline |
| WU-02 | STANDARD | WU-01 | BFF conforme (c); comentário do contrato (f); provas 3 e 4 com o vermelho da baseline; asserções existentes ajustadas |
| WU-03 | DETERMINISTIC | WU-02 | typecheck de `apps/scheduling-service` |
| WU-04 | DETERMINISTIC | WU-02 | typecheck de `apps/bff` |
| WU-05 | DETERMINISTIC | WU-02 | testes dirigidos: `goal103` em `apps/scheduling-service` (prova 2, de unidade) |
| WU-06 | DETERMINISTIC | WU-03, WU-04, WU-05 | validate-core |
| WU-07 | DETERMINISTIC | WU-06 | validate-integration |
| WU-08 | STANDARD | WU-07 | Conferência com a pilha real (§4), controles negativos (§5) e documentação, depois da execução final |
| WU-09 | DETERMINISTIC | WU-08 | git-diff-check final |
