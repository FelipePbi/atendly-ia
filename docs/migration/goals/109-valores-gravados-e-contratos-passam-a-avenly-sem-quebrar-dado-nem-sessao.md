# Goal 109 — Valores gravados e contratos passam a Avenly sem quebrar dado nem sessão

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal105 ACCEPTED](../reviews/105-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v132, já READY, **dividida do 102** e inserida à frente dele, sem renumerar nenhum Goal. Não há linha de quadros do protótipo: nenhuma tela muda de layout nem de texto. O Goal muda valores que o sistema grava e troca entre serviços; nomes, textos e arquivos continuam com "Atendly" até o 102.

## Baseline aceita

Baseline aceita: `308f85f03410990afc8d465a39d575a6193e0a69`

Goal anterior: 105 — Importação igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal105 já integrado em `main` (origem `cf353b5d6fbeac38f92c0c20edd46857d753844b`). **Quatro rodadas**, com 2, 1, 3 e 0 blockers. **D-119** aceita. A virada de status do documento do Goal105 para `ACCEPTED` entrou no commit de fechamento. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, dos gates do IA Loop na rodada 3 do 105, reaproveitados na rodada 4 ([review105](../reviews/105-review.md), [VALIDATION_GATE](../VALIDATION_GATE.md), seção do Goal105): `validate:core` com 15 passos e 2 pulados; suíte do frontend com **147** arquivos e **1819** testes; `test:gate` **242**; `validate:ui` **169** `passed`, **21** pulados e **0** retentativas; `validate:integration` com **36** passos e o gate autenticado com **275** `passed` e **0** retentativas.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1**, com a linha de resumo de `test:scheduling-integration`, `test:bff-integration` e `test:ai-orchestrator`, que não constam do review105.

## Objetivo e posição

O operador decidiu em 2026-10-02 que o produto passa a se chamar **Avenly** (linha do 102). A linha do 102 diz que "valores persistidos e contratos mudam com migration e leitura compatível do valor antigo; nenhuma sessão ou dado existente pode quebrar". Este Goal faz **só essa parte**: os valores que o banco grava, que os serviços trocam entre si e que o navegador guarda passam a usar o nome novo, e o valor antigo continua aceito onde ainda pode chegar.

**Por que dividir o 102 e por que esta parte primeiro.** Contado nesta baseline, `git grep -il atendly` devolve **658** arquivos e **4032** ocorrências. Quase tudo é texto, identificador e nome de arquivo, que se troca de forma mecânica. Uma parte pequena muda dado gravado e sessão: dois enums do PostgreSQL com linhas existentes, uma constraint cujo nome o gate de restauração confere, o valor de fonte da agenda no contrato público e no interno, os nomes dos cookies de sessão e CSRF, os nomes das variáveis de ambiente do texto legal e as chaves do `localStorage`. Errar essa parte quebra sessão ou dado. Num diff de seiscentos arquivos, o review não conseguiria isolá-la. Precedentes da mesma divisão por risco e tamanho: 097 em 104 e 105, e 104 em 106. Fazendo esta parte antes, o 102 fica só com a troca mecânica, sem valor gravado para preservar.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **Scheduling, enum com linhas.** `CalendarSource` é um tipo do PostgreSQL (`CREATE TYPE "CalendarSource" AS ENUM ('ATENDLY', 'MINHA_AGENDA')`, migration `20260828175825_init`), usado por `CalendarSettings.source` e por `MigrationJob.source` e `MigrationJob.target` (histórico preservado por D-026). A migration `20260919120000_goal027_calendar_source_atendly` criou `CalendarSettings_source_atendly_check` (`CHECK ("source" = 'ATENDLY')`).
2. **IA, enum com linhas.** `HumanControlSource` é um tipo do PostgreSQL (`'WHATSAPP'`, `'ATENDLY'`, `'BACKFILL'`, migration `20260908120000_goal005_contact_session_human_control`). `apps/ai-orchestrator/src/modules/internal/routes.ts` grava `"ATENDLY"` em dois pontos, e `session-policy.ts` e `message-graph.ts` declaram o tipo. Nenhum consumidor fora da IA lê esse valor.
3. **Contrato público.** `calendarSourceSchema = z.enum(["ATENDLY"])` em `packages/public-api-contract/src/schemas.ts`, usado em quatro pontos. O frontend envia `"ATENDLY"` em `PATCH /v1/onboarding` (`features/onboarding/blocks/schedule.tsx`) e compara `=== "ATENDLY"` em `AgendaBoard.tsx`, `AgendaDayColumn.tsx`, `AppointmentDetail.tsx`, `CalendarSettings.tsx` e `settings/shared/labels.ts`.
4. **Contrato interno.** O BFF decodifica a fonte com `z.enum(["ATENDLY"])` em `clients/scheduling/index.ts` e em `modules/onboarding/routes.ts`, e compara ou grava o literal em `onboarding-state.ts`, `timezone-reconciliation.ts` e nas rotas de `calendar`, `customers`, `dashboard`, `services` e `settings`. O Scheduling decodifica com `z.enum(["ATENDLY"])` em `internal-api/routes.ts`.
5. **Cookies.** `SESSION_COOKIE_NAME` e `CSRF_COOKIE_NAME` têm os padrões `atendly_session` e `atendly_csrf` em `apps/bff/src/config/env.ts`. `presentedCredential` (`apps/bff/src/lib/auth.ts`) lê só `env.SESSION_COOKIE_NAME`. O frontend lê `atendly_csrf` como padrão em `BffHttpClient.ts`. `PUBLIC_API_V1.md` e `apps/bff/.env.example` documentam os dois nomes.
6. **Variáveis de ambiente do texto legal.** `apps/frontend/src/config/legal-details.ts` e `apps/frontend/scripts/check-legal-config.mjs` leem `ATENDLY_LEGAL_NAME`, `ATENDLY_TRADE_NAME`, `ATENDLY_CNPJ`, `ATENDLY_LEGAL_ADDRESS`, `ATENDLY_SUPPORT_EMAIL`, `ATENDLY_PRIVACY_EMAIL`, `ATENDLY_PRIVACY_OFFICER`, `ATENDLY_AI_PROVIDER`, `ATENDLY_HOSTING_PROVIDER`, `ATENDLY_ANALYTICS_PROVIDERS`, `ATENDLY_RETENTION_PERIOD`, `ATENDLY_APPLICABLE_FORUM`, `ATENDLY_LEGAL_REVIEW_APPROVED` e `ATENDLY_LEGAL_INDEXABLE`. Os valores reais vivem no ambiente de deploy, fora do repositório.
7. **`localStorage`.** `apps/frontend/src/shared/ui/Brand.tsx` grava `atendly:brand-signature-entry` e `atendly:brand-signature-check`.
8. **O gate confere o nome da constraint.** `scripts/goal027-calendar-source-migration-rehearsal.mjs` e `scripts/goal028-restore-rehearsal.mjs` têm `CONSTRAINT_NAME = "CalendarSettings_source_atendly_check"`, e `scripts/tests/goal028-restore-rehearsal.test.mjs` (`test:gate`) confere o nome por regex.
9. **O que não tem o nome antigo.** Nenhum evento de fila, cabeçalho HTTP nem chave de idempotência contém "atendly" (busca nesta baseline). O passo de onboarding `agenda-atendly-pronta` é só rota do frontend, sem estado gravado; fica para o 102.
10. **Ainda não há usuário real.** O veredito de [FINAL_AUDIT](../FINAL_AUDIT.md) §7 diz que o MVP "não está pronto para o primeiro usuário real". `render.yaml` roda `prisma:deploy` no `buildCommand` de cada serviço, então a migration roda antes de o código novo entrar no ar.

## Escolhas de desenho desta passada

**(a) Renomear o valor do enum, não acrescentar outro.** Uma migration nova em cada serviço: no Scheduling, `ALTER TYPE "CalendarSource" RENAME VALUE 'ATENDLY' TO 'AVENLY'` e `ALTER TABLE "CalendarSettings" RENAME CONSTRAINT "CalendarSettings_source_atendly_check" TO "CalendarSettings_source_avenly_check"`; na IA, `ALTER TYPE "HumanControlSource" RENAME VALUE 'ATENDLY' TO 'AVENLY'`. Motivo: o rename é atômico e não reescreve linha nenhuma. `updatedAt` não se move, o histórico de `MigrationJob` continua dizendo de onde para onde a importação foi, e a constraint continua recusando `MINHA_AGENDA` em `CalendarSettings`, porque o PostgreSQL guarda o valor do enum pelo OID. `ADD VALUE` mais `UPDATE` reescreveria linhas, mexeria em `updatedAt` e deixaria dois valores com o mesmo significado. As migrations antigas **não mudam**: o Prisma confere o checksum delas. Os `schema.prisma` passam a declarar `AVENLY`.

**(b) Toda fronteira que decodifica a fonte aceita os dois valores e devolve só `AVENLY`.** `calendarSourceSchema` passa a aceitar `"AVENLY"` e `"ATENDLY"` e a devolver sempre `"AVENLY"` (por exemplo, `z.enum(["AVENLY", "ATENDLY"]).transform(() => "AVENLY" as const)`, ou equivalente com o mesmo efeito). A mesma regra vale para os decodificadores do BFF (`clients/scheduling/index.ts` e `modules/onboarding/routes.ts`) e do Scheduling (`internal-api/routes.ts`). Quem escreve passa a escrever `AVENLY`. Assim, uma resposta gravada antes deste Goal (replay de idempotência), um cliente antigo que ainda envie `"ATENDLY"` e um serviço ainda na versão anterior durante o deploy continuam decodificando. O literal antigo aparece uma vez por pacote ou app, num ponto nomeado como legado.

**(c) Comparações do frontend.** O frontend envia `"AVENLY"` e compara com `"AVENLY"`. Toda resposta do BFF que o frontend lê já passa por um schema do contrato; onde isso não for verdade, a comparação usa um helper que aceita os dois valores. O Developer confere cada um dos cinco pontos da evidência 3 e diz no relatório qual caminho cada um seguiu.

**(d) Cookies: nome novo por padrão e leitura do nome antigo.** Os padrões passam a `avenly_session` e `avenly_csrf`. O BFF lê o cookie de sessão pelo nome configurado e, na falta dele, por `atendly_session`. Se os dois chegarem, vale o nome configurado. Uma sessão aberta antes do deploy continua válida até expirar ou ser revogada, sem login novo. Não há reemissão do cookie numa leitura comum: nenhuma resposta de `GET` passa a mandar `Set-Cookie` por causa deste Goal. Todo ponto que hoje grava os cookies (`establishSession`: login, cadastro, troca de senha) grava os nomes novos e apaga os antigos. `clearSessionCookie` (logout, revogação) apaga os dois pares. O frontend lê `avenly_csrf` e, na falta dele, `atendly_csrf`. O token vem do mesmo servidor e a sessão é a mesma: nenhuma regra de CSRF, de revogação ou de expiração muda. Os nomes antigos ficam constantes fixas, não configuráveis.

**(e) Variáveis de ambiente do texto legal: nome novo primeiro, antigo como reserva.** `AVENLY_*` é lido primeiro e `ATENDLY_*` na falta dele, em `legal-details.ts` e em `check-legal-config.mjs`, para as catorze variáveis da evidência 6. `apps/frontend/.env.example` passa a documentar só os nomes novos, com uma linha dizendo que os antigos ainda são lidos. Motivo: o deploy tem os valores com o nome antigo, e trocá-los é tarefa do operador fora do repositório; o texto legal não pode voltar aos marcadores `[RAZÃO SOCIAL]` porque o nome da variável mudou.

**(f) `localStorage`.** As chaves passam a `avenly:brand-signature-entry` e `avenly:brand-signature-check`. A leitura considera também a chave antiga, para a animação de assinatura não tocar de novo para quem já a viu.

**(g) Este Goal muda valores, não nomes.** Identificadores (`AtendlyCalendarProvider`, `toAtendlyAppointment`), nomes de arquivo, classes CSS, nomes de pacote, textos de tela ("Agenda Atendly"), prompts, comentários fora das linhas tocadas e a rota `agenda-atendly-pronta` ficam para o 102. Código novo pode usar "Avenly" no nome. `scripts/lib/visual-seed.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` continuam enviando `"ATENDLY"`: passam a ser prova viva de (b) no `visual:compare` e no gate autenticado, e o 102 os troca.

**(h) Ordem de deploy e janela declarada.** Os leitores toleram os dois valores antes de os escritores mudarem: frontend, depois BFF, depois Scheduling e IA, com as migrations no build deles. Com o deploy de um commit só, uma instância antiga do Scheduling ou da IA ainda no ar quando a migration roda não reconhece `AVENLY` até ser substituída. Como ainda não há usuário real (evidência 10), essa janela fica **declarada em D-120** com a ordem recomendada, sem um segundo deploy em fases. Se houver usuário real antes do deploy deste Goal, a decisão volta à pessoa.

## Escopo obrigatório

### 1. Bancos

Migration nova no Scheduling e na IA, conforme (a), com nome `<timestamp>_goal109_avenly_…`, depois da última migration de cada serviço. Os `schema.prisma` declaram `AVENLY`, e os comentários deles que citam o valor ou o nome da constraint passam a citar os novos. Nenhuma migration existente muda.

### 2. Contratos e serviços

`calendarSourceSchema` e os decodificadores do BFF e do Scheduling conforme (b). Escritores do BFF, do Scheduling e da IA gravam ou enviam `AVENLY`. `apps/bff/PUBLIC_API_V1.md` documenta `calendar.source: "AVENLY"`, a aceitação de `"ATENDLY"` na entrada, os nomes novos dos cookies e a leitura do nome antigo.

### 3. Sessão e CSRF

Conforme (d), em `apps/bff/src/config/env.ts`, `apps/bff/src/lib/auth.ts`, `apps/bff/.env.example` e `apps/frontend/src/data/http/BffHttpClient.ts`.

### 4. Frontend

(c), (e) e (f). Nenhuma mudança de layout, de texto visível ou de rota.

### 5. Gate

`scripts/goal027-calendar-source-migration-rehearsal.mjs`, `scripts/goal028-restore-rehearsal.mjs` e `scripts/tests/goal028-restore-rehearsal.test.mjs` mudam **só** onde conferem o valor ou o nome da constraint depois da cadeia completa de migrations. O que eles provam não muda: a constraint recusa valor que não seja a fonte única e sobrevive à restauração. Os comentários de `scripts/validate-integration.mjs` que citam o nome podem ser atualizados; nenhum passo de `validate:*` muda, nem a contagem de passos (**36**). O `test:gate` continua com **242** testes ou mais.

### 6. Provas novas

Cada uma num arquivo novo `goal109-…`:

1. **Migration do Scheduling, contra PostgreSQL real** (`apps/scheduling-service/tests/integration/`). Um banco descartável recebe as migrations **anteriores** à nova, aplicadas na ordem dos diretórios. Depois recebe linhas de `CalendarSettings` com `ATENDLY` e um `MigrationJob` com `source` `MINHA_AGENDA` e `target` `ATENDLY`. Então a migration nova roda. Prova: as mesmas linhas, contadas antes e depois, leem `AVENLY`; `updatedAt` não muda; o tipo não tem mais o rótulo `ATENDLY` (`pg_enum`); `CalendarSettings_source_avenly_check` existe e o nome antigo não; um `UPDATE` para `MINHA_AGENDA` em `CalendarSettings` ainda é recusado pela constraint; o `MigrationJob` continua com `MINHA_AGENDA` em `source`.
2. **Migration da IA, contra PostgreSQL real** (`apps/ai-orchestrator/tests/`, no padrão de integração que a suíte já usa). Mesmo roteiro para `HumanControlSource`: uma sessão com `ATENDLY` lê `AVENLY` depois da migration, e `WHATSAPP` e `BACKFILL` não mudam.
3. **Scheduling pela rota HTTP.** A rota interna que grava a fonte da agenda aceita `"ATENDLY"` e `"AVENLY"`, grava `AVENLY` nos dois casos e devolve `"AVENLY"`. Um valor fora dos dois é recusado como hoje.
4. **Contrato** (teste no pacote ou no BFF). `calendarSourceSchema` decodifica `"ATENDLY"` e `"AVENLY"` como `"AVENLY"` e recusa outro valor; os quatro schemas que o usam devolvem `"AVENLY"`.
5. **BFF, fonte da agenda.** `PATCH /v1/onboarding` com `"ATENDLY"` e com `"AVENLY"` chega ao Scheduling simulado como `"AVENLY"`. As leituras que expõem `calendar.source` devolvem `"AVENLY"` com o Scheduling simulado respondendo `"AVENLY"` e também respondendo `"ATENDLY"` (versão anterior durante o deploy).
6. **BFF, sessão.** Uma requisição autenticada só com `atendly_session` responde 200, sem `Set-Cookie`. Uma mutação nessa sessão com o token de CSRF passa. O login grava `avenly_session` e `avenly_csrf` e apaga os dois nomes antigos. O logout apaga os quatro. Com os dois cookies de sessão presentes e diferentes, vale o novo. Uma sessão revogada continua recusada pelo nome antigo.
7. **Frontend, CSRF.** `BffHttpClient` envia o token de `avenly_csrf`; sem ele, o de `atendly_csrf`; com os dois, o de `avenly_csrf`.
8. **Frontend, demais valores.** O onboarding envia `"AVENLY"`; a Agenda e o detalhe liberam o ciclo de vida com `"AVENLY"`; `legal-details` usa `AVENLY_*`, cai para `ATENDLY_*` na falta, e prefere o novo com os dois; `check-legal-config.mjs` aceita a configuração só com nomes antigos e só com nomes novos; `Brand` não repete a assinatura para quem tem só a chave antiga.

As provas 1 a 8 reprovam na baseline, salvo as partes que só protegem comportamento de hoje (por exemplo, "valor fora dos dois é recusado" e "sessão revogada continua recusada"). O vermelho da baseline vem colado no relatório, com cada parte que passa nomeada e o motivo.

### 7. Inventário do que sobra

No fim, o relatório cola a saída de `git grep -n -e '"ATENDLY"' -e "'ATENDLY'" -e 'atendly_session' -e 'atendly_csrf' -e 'ATENDLY_' -e 'atendly:brand' -- apps packages scripts`, classificada linha por linha numa destas classes, sem resto:

- (i) migration antiga, que não pode mudar;
- (ii) constante ou ramo de legado de (b), (d), (e) ou (f), no máximo um ponto por família em cada app ou pacote;
- (iii) teste que prova a compatibilidade;
- (iv) script que segue enviando o valor antigo por (g);
- (v) comentário histórico que descreve o que uma migration antiga fez.

Esse inventário vira a lista de exceções que o 102 herda para o critério `git grep -i atendly`.

### 8. Controles negativos, rodados depois da última edição de código

Cada um com o arquivo restaurado e `sha256` idêntico conferido no fim:

1. Tirar `"ATENDLY"` de `calendarSourceSchema`: as provas 4 e 5 reprovam.
2. Tirar a leitura de `atendly_session` em `presentedCredential`: a prova 6 reprova.
3. Trocar o `RENAME VALUE` do Scheduling por `ADD VALUE 'AVENLY'`: a prova 1 reprova.
4. Tirar o `RENAME CONSTRAINT`: a prova 1 reprova.
5. Tirar o `RENAME VALUE` da IA: a prova 2 reprova.
6. Tirar a reserva `atendly_csrf` do `BffHttpClient`: a prova 7 reprova.
7. Tirar a reserva `ATENDLY_*` de `legal-details.ts`: a prova 8 reprova.

### 9. O que este Goal não pode fazer

- Mudar texto visível, layout, rota, nome de arquivo, nome de pacote, identificador fora das linhas tocadas, classe CSS, prompt da IA, `docs/design-reference/`, o vault, `AGENTS.md` ou `CLAUDE.md` da raiz. Isso é do 102.
- Mudar migration existente, `render.yaml`, `.github/`, `tools/ia-loop/` ou o nome de banco, container ou volume do ambiente local.
- Mudar regra de CSRF, de revogação ou de expiração de sessão, ou criar sessão nova por causa do nome do cookie.
- Mudar passo, contagem de passos ou configuração de `validate:*`; mudar `e2e/`.
- Pular, remover ou marcar teste como `skip`/`todo`; afrouxar asserção existente.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração.

## Pontos de implementação

- `apps/scheduling-service/prisma/schema.prisma` e a migration nova; `apps/scheduling-service/src/modules/internal-api/routes.ts` e os escritores do valor no Scheduling.
- `apps/ai-orchestrator/prisma/schema.prisma` e a migration nova; `src/modules/internal/routes.ts`, `src/modules/session/session-policy.ts` e `src/modules/graph/message-graph.ts`.
- `packages/public-api-contract/src/schemas.ts` (`calendarSourceSchema`) e o build do contrato que o repositório já usa.
- `apps/bff/src/clients/scheduling/index.ts`, `src/modules/onboarding/routes.ts`, `src/lib/onboarding-state.ts`, `src/lib/timezone-reconciliation.ts` e as rotas de `calendar`, `customers`, `dashboard`, `services` e `settings`, só onde comparam ou gravam o valor.
- `apps/bff/src/config/env.ts`, `src/lib/auth.ts`, `apps/bff/.env.example`, `apps/bff/PUBLIC_API_V1.md`.
- `apps/frontend/src/data/http/BffHttpClient.ts`, `src/config/legal-details.ts`, `scripts/check-legal-config.mjs`, `.env.example`, `src/shared/ui/Brand.tsx`, `features/onboarding/blocks/schedule.tsx`, `features/agenda/AgendaBoard.tsx`, `AgendaDayColumn.tsx`, `AppointmentDetail.tsx`, `features/settings/CalendarSettings.tsx` e `features/settings/shared/labels.ts` (só a comparação; o texto "Agenda Atendly" fica).
- Os scripts do §5.
- Testes existentes que afirmam o literal `"ATENDLY"` como saída, ou o nome antigo do cookie ou da constraint como padrão, e reprovam só por isso: ajustar para o valor novo, declarado arquivo por arquivo no relatório. Teste existente que **envia** `"ATENDLY"` como entrada não muda: ele passa a provar (b).
- Os documentos abaixo.

## Fora do escopo

- A troca de nome em texto, identificador, arquivo, pacote, documentação e protótipo (102).
- `PLATFORM_WHATSAPP_INSTANCE_ID=atendly-platform`, os nomes de serviço e de host do Render, o remote git, o domínio e a conta do WhatsApp: vivem fora do repositório e dependem do operador.
- `tools/ia-loop/` e os nomes do ambiente Docker local, trocados pelo supervisor depois do 102.
- Remover o valor antigo de vez (contrair a compatibilidade). Fica para quando houver motivo medido.
- As lacunas visuais registradas sem ID (C1 a C4, K1 a K6, 2.I2 a 2.I10) e a observação 2 do review105 (o fluxo da importação remonta e perde a fase).

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-120** em `PROPOSED`, no formato de D-119: (a) a (h) com o motivo de cada uma, a ordem de deploy e a janela declarada de (h), e o inventário do §7 como lista de exceções herdada pelo 102. Nenhuma decisão anterior é reescrita.
- `apps/bff/PUBLIC_API_V1.md`, `apps/bff/.env.example` e `apps/frontend/.env.example`, conforme o §2 e (e).
- [CURRENT_STATE](../CURRENT_STATE.md) ganha um delta curto, e [VALIDATION_GATE](../VALIDATION_GATE.md) uma subseção do Goal109 com as provas, o vermelho da baseline, os controles do §8, o inventário do §7 e as contagens da execução final.
- FINAL_AUDIT **não** ganha seção. O vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, migration ou teste citado é conferido contra o código antes da entrega. Seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

**Blockers de documento.** Se o review apontar blockers de documento, cada um vira um item curto e separado, e o Developer confere item por item antes de devolver (regra do 097 e do 104).

## Validação e ordem

1. Recontar a baseline como manda "Baseline aceita".
2. Implementar o §1 ao §5, com as provas do §6.
3. Rodar o vermelho da baseline das provas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: typecheck de cada app tocado, `validate:core`, `validate:ui` e `validate:integration` num banco recém-provisionado.
6. Rodar os controles do §8 e o inventário do §7.
7. Escrever a prosa só depois disso.

Os controles do §8 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório mede a causa antes de declará-la de ambiente.

**Retentativas e recurso do host.** Já houve falha por memória em `validate:core` (101, passou com `VITEST_MAX_WORKERS=2`), `ERR_NO_BUFFER_SPACE` no gate autenticado (106) e o Postgres local interceptado por outro programa em `127.0.0.1:5555` (observação 3 do review105). Se algo assim se repetir, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

## Critério de aceite

1. As provas 1 a 8 passam e reprovaram na baseline, salvo as partes nomeadas no relatório que só protegem comportamento de hoje. As provas 1 e 2 rodam contra PostgreSQL real, partindo de um banco com as migrations anteriores e linhas com `ATENDLY`.
2. Os sete controles do §8 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
3. O inventário do §7 está no relatório e em VALIDATION_GATE, com cada linha classificada e sem resto.
4. Typecheck de `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` passam. `validate:core` passa, com a suíte do frontend em **1819** testes ou mais e `test:gate` em **242** ou mais. Nenhuma suíte tem teste a menos que a recontagem da baseline.
5. `validate:ui` passa com **169** `passed` ou mais e **0** retentativas.
6. `validate:integration` com exit 0 e **36** passos, rodado depois da última edição de código, com o gate autenticado em **275** testes e **0** retentativas. Retentativa é medida e reportada com a causa.
7. Nenhuma tela muda: `git diff --stat` não mostra arquivo de CSS, de `e2e/`, de `docs/design-reference/` nem de migration existente, e os textos visíveis são os de antes.
8. D-120 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
9. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada e sem resto de controle negativo.

**O que o aceite não prova:** o deploy real no Render e a janela de (h), que nada nesta árvore atravessa; o texto legal com os valores reais do ambiente de deploy; um navegador real com um cookie `atendly_session` emitido antes do deploy (a prova 6 usa requisição HTTP contra o BFF).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | COMPLEX | — | Recontagem da baseline; migrations e `schema.prisma` do Scheduling e da IA (a); decodificador e escritores do Scheduling e da IA (b); scripts do §5; provas 1, 2 e 3 com o vermelho da baseline |
| WU-02 | STANDARD | WU-01 | `calendarSourceSchema` e os decodificadores e escritores do BFF (b); `PUBLIC_API_V1.md` na parte da fonte; provas 4 e 5 com o vermelho da baseline |
| WU-03 | COMPLEX | WU-02 | Sessão e CSRF (d) no BFF e no `BffHttpClient`; `apps/bff/.env.example` e `PUBLIC_API_V1.md` na parte dos cookies; provas 6 e 7 com o vermelho da baseline |
| WU-04 | STANDARD | WU-03 | Frontend: (c), (e) e (f), `apps/frontend/.env.example`; prova 8 com o vermelho da baseline; testes existentes ajustados |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/scheduling-service` |
| WU-06 | DETERMINISTIC | WU-04 | typecheck de `apps/ai-orchestrator` |
| WU-07 | DETERMINISTIC | WU-04 | typecheck de `apps/bff` |
| WU-08 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-09 | DETERMINISTIC | WU-04 | testes dirigidos `goal109` em `apps/frontend` |
| WU-10 | DETERMINISTIC | WU-04 | `test:gate` |
| WU-11 | DETERMINISTIC | WU-05 a WU-10 | validate-core |
| WU-12 | DETERMINISTIC | WU-11 | validate-ui |
| WU-13 | DETERMINISTIC | WU-11 | validate-integration |
| WU-14 | STANDARD | WU-12, WU-13 | Controles negativos (§8), inventário (§7) e documentação, depois da execução final |
| WU-15 | DETERMINISTIC | WU-14 | git-diff-check final |
