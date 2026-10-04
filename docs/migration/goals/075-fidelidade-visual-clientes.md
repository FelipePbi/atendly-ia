# Goal 075 — Fidelidade visual: Clientes

**Status: ACCEPTED.** Preparado em 2026-09-29 pelo Tech Lead Agent após [Goal069 ACCEPTED](../reviews/069-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v95, com o mesmo ID. **A v96 divide a linha**: este Goal fica só com Clientes e passa a se chamar "Fidelidade visual: Clientes" (na v95, "Fidelidade visual: Clientes, Serviços, Conversas e Notificações"). Serviços (SV-03…SV-05) forma o novo **076**, e Conversas e Notificações (CV-05, NT-01, NT-02) formam o novo **077**, os dois PLANNED, nesta ordem, antes do 072. Motivo da divisão, conferido no código desta passada: CL-01 e CL-02 pedem dado que nenhum contrato traz hoje (próximo e último atendimento por cliente na lista, e os quatro números do perfil), então Clientes sozinho já atravessa Scheduling, orquestrador, BFF, contrato público e frontend; o Goal069, uma tela só e só frontend, levou seis rodadas. Entra também a observação 1 do [review074](../reviews/074-review.md), dirigida a este Goal na v95.

## Baseline aceita

Baseline aceita: `67877555caf7addbbb4bbd68aaa4676c9f0aefde`

Goal anterior: 069 — Fidelidade visual: Agenda

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal069 já integrado em `main` (origem `1cffdbcc7d5c0dc383462a7b20ae7f92ecf9e4be`). Desta vez a virada de status do documento do Goal069 para `ACCEPTED` entrou no próprio commit de fechamento. **Seis rodadas**, com 4, 2, 2, 2, 2 e 0 blockers; só as rodadas 1 e 2 mudaram código. **D-089** foi aceita e [FINAL_AUDIT §50](../FINAL_AUDIT.md) escrita sem reescrever §4 a §49. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review069](../reviews/069-review.md) e de FINAL_AUDIT §50: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **104** arquivos e **1079** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **155** testes e **0** retentativas, e desta vez rodado também no IA Loop. O 069 não tocou backend; as contagens de backend vêm do [review074](../reviews/074-review.md): `test:ai-orchestrator` **1133**/**1226** (**93** pulados), `test:scheduling-service` **36** arquivos e **491** testes, `test:bff-integration` **57** arquivos e **440** testes.

## Objetivo e posição

Fazer Clientes (`/clientes`, `/clientes/detalhes` e as telas de `features/customers/`) bater com os protótipos `Clientes.dc.html`, `Clientes-Tablet.dc.html` e `Clientes-Desktop.dc.html` (`docs/design-reference/claude-design/prototype/project/`), consultados só no estado necessário:

1. **A lista diz quando a pessoa vem ou veio**: à direita de cada linha, "próximo" com dia e hora, ou "último" com o tempo passado, ou "sem atendimentos"; e a lista é alfabética, com a letra como separador (CL-01).
2. **O perfil tem cabeçalho com "Conversa" e "Agendar" e três abas**, Resumo, Atendimentos e Notas, com quatro números e as preferências com origem (CL-02).
3. **Nenhuma copy técnica** no perfil (CL-03).

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **CL-01…CL-03**. Entra também a observação 1 do [review074](../reviews/074-review.md). CL-04 já foi corrigido no Goal062. Os achados SV-03…SV-05 são do Goal076; CV-05, NT-01 e NT-02, do Goal077.

O vault define a Agenda como fonte única da operação (`AGENTS.md`): o que a lista e o perfil dizem sobre atendimentos vem do Scheduling, não de cópia no frontend nem de cache.

## O que a evidência desta passada mostra

Conferido no código da baseline `6787755`:

1. **A lista só tem nome e telefone.** `apps/frontend/src/features/customers/CustomerList.tsx:67-75` monta cada `ListItem` com as iniciais, o nome e `displayPhone(customer.phone)`. `customerSchema` (`packages/public-api-contract/src/schemas.ts:279-285`) tem só `id`, `name`, `phone`, `createdAt` e `updatedAt`, e `customerListSchema` (`:586-591`) só acrescenta `source`, `managedExternally` e `filteredByPhone`. Nada diz próximo nem último atendimento (CL-01).
2. **A lista vem de uma consulta só no Scheduling.** `GET /internal/customers` (`apps/scheduling-service/src/modules/internal-api/routes.ts:621-637`) chama `AvenlyCustomerService.list` (`apps/scheduling-service/src/modules/customers/avenly-customer-service.ts:59-70`), ordenado por nome, e a mesma função atende a busca por telefone (`findCandidatesByPhone`), que devolve candidatos para o orquestrador. O BFF repassa por `SchedulingClient.listCustomers` (`apps/bff/src/clients/scheduling/index.ts:1015-1029`) e `GET /v1/customers` (`apps/bff/src/modules/customers/routes.ts:97-107`).
3. **O perfil é uma coluna de oito seções.** `CustomerProfile.tsx:110-270` empilha `CustomerAgenda`, `CustomerNotes`, `CustomerMemory`, `CustomerTags`, `CustomerSummary` e `PrimaryGuardianPanel`, sem "Conversa" nem "Agendar" (CL-02). `CustomerAgenda.tsx:26-51` lê os agendamentos por `customerId` numa janela de 365 dias para trás e 365 para frente; os quatro números do protótipo (atendimentos, intervalo, faltas, cancelamentos) e o "cliente desde" precisam do histórico inteiro, que nenhuma rota devolve.
4. **A copy técnica está em dois lugares.** `CustomerProfile.tsx:258-268` desenha a faixa "Gerenciado pela Agenda Avenly · Cadastros pertencem somente a este negócio." com o selo "Controle completo"; `CustomerMemory.tsx:135-136` diz "Preferências e observações com origem, permissão e idade. Cadastro manual nasce sem autorização de uso pela IA."; `CustomerForm.tsx:134` diz "Cadastros são controlados pela fonte oficial…" (CL-03). A faixa igual em `ServiceList.tsx:307-311` é do Goal076.
5. **"Conversa" não tem como achar a conversa da pessoa.** `conversationSchema` tem `customerId`, mas `GET /v1/conversations` (`apps/bff/src/modules/conversations/routes.ts:24-34`) e `GET /internal/conversations` do orquestrador (`apps/ai-orchestrator/src/modules/internal/routes.ts:120-129`, filtros em `:524-551`) só filtram por status, categoria, atendimento, ignorado e texto, com limite de 100. Procurar a pessoa na lista inteira não é confiável.
6. **"Agendar" não tem como levar a pessoa.** `AppointmentForm.tsx:61` começa sempre em "cliente novo" (`useState(NEW_CUSTOMER)`) e a rota `/agenda/novo` não lê parâmetro de cliente.
7. **As origens da memória já existem.** `customerMemoryOriginSchema` (`schemas.ts:1105-1109`) tem `CUSTOMER_STATED`, `AI_INFERRED` e `PROFESSIONAL`, que são exatamente "informada pela cliente", "percebida pela IA" e "cadastrada por você" do protótipo.
8. **O gate autenticado já mede Clientes.** `e2e/routes.ts:44` mede `/clientes` com `contentMarker: "Clientes"`, e `authenticated-matrix.spec.ts:1238-1249` abre o perfil pela linha com o nome semeado e espera o `<h1>` com esse nome.
9. **Observação 1 do review074.** Os comentários em `packages/public-api-contract/src/schemas.ts:851` e `:870`, `apps/bff/src/clients/ai-orchestrator/index.ts:551` e `apps/bff/src/clients/scheduling/index.ts:1520` dizem "checklist da Home" para os números de "Esta semana".

## Escolhas de desenho desta passada

- **O Scheduling calcula; o frontend só formata.** Próximo, último e os números do perfil são calculados pelo Scheduling, no fuso do calendário do negócio (D-045, Goal029), a partir do histórico inteiro. Nenhuma tela deriva esses valores de uma janela de agendamentos.
- **Lista: dois campos novos por cliente, aditivos.** Cada item de `GET /v1/customers` ganha `nextAppointment` e `lastAppointment`, cada um `{ date, startTime, status }` ou `null`:
  - `nextAppointment` é o agendamento ativo (`CONFIRMED`, ou `SCHEDULED` legado) de início mais cedo a partir de agora;
  - `lastAppointment` é o agendamento de início mais recente antes de agora, que não esteja cancelado; pode ser `COMPLETED`, `NO_SHOW` ou `CONFIRMED` ainda não concluído;
  - um cálculo só para o negócio inteiro, sem uma consulta por cliente;
  - a busca por telefone continua devolvendo candidatos com a mesma ordem e o mesmo filtro; os campos novos podem vir também nela, e nenhum consumidor passa a depender deles.
- **Perfil: um bloco novo, aditivo.** `GET /v1/customers/:id` ganha `appointmentStats`: `completed`, `noShows`, `cancelled` (contagens do histórico inteiro), `averageIntervalDays` (média dos intervalos entre atendimentos concluídos consecutivos, `null` com menos de dois) e `firstAppointmentDate` (`null` sem atendimento).
- **O contrato declara tudo.** Os campos novos entram em `packages/public-api-contract` (schema e rota), em `PUBLIC_API_V1.md` e nos schemas dos clientes do BFF, opcionais no schema público para que resposta antiga continue válida. A checagem de campo não declarado (Goal036) continua valendo.
- **A linha da lista**, à direita, em texto pequeno:
  - com próximo: "próximo" e o dia, "hoje 15:00", "amanhã 10:00" ou "sex 15:30" nesta semana e nas duas seguintes, e "19/10 15:30" depois disso;
  - sem próximo e com último: "último" e o tempo, "hoje", "ontem", "há 5 dias", "há 3 sem" ou "há 4 meses"; com `NO_SHOW`, "último faltou ·" antes do tempo;
  - sem os dois: "sem atendimentos".
  - Nenhuma data ISO aparece. O nome acessível da linha tem nome, telefone e esse texto.
- **A lista é alfabética com separador por letra**, na ordem de `localeCompare` em pt-BR, sem acento distinguindo letra (Á fica em A). Cadastro sem nome vai para o fim, sob um separador próprio ("Sem nome"). A busca continua filtrando por nome e telefone, e os separadores vazios somem.
- **Cabeçalho do perfil**: avatar com iniciais, o nome como `<h1>`, o telefone formatado, "cliente desde" com mês e ano do primeiro atendimento (ou do cadastro, sem atendimento), as tags, e duas ações:
  - **"Conversa"** abre `/conversas/<id>` da conversa mais recente da pessoa, lida por `GET /v1/conversations?customerId=<id>&limit=1`; sem conversa, a ação não aparece;
  - **"Agendar"** abre `/agenda/novo?customerId=<id>`, só com a capacidade `createAppointments`; o formulário começa com a pessoa escolhida, e continua podendo trocar.
- **Filtro novo de conversa**: `customerId` opcional em `GET /v1/conversations`, repassado ao orquestrador, que filtra pelo `customerId` do contato. Resolvido pela sessão, como os demais filtros. O que já existe não muda.
- **Três abas**, com `role="tablist"`, setas do teclado e a aba no endereço (`?aba=atendimentos`, `?aba=notas`) para link direto:
  - **Resumo**: o resumo da IA como nota discreta (a geração sob demanda continua, com a mesma auditoria), os quatro números (atendimentos, "a cada N sem", faltas, cancelamentos), o próximo atendimento, as preferências com a origem por extenso e o responsável principal;
  - **Atendimentos**: o próximo e os anteriores, lidos como hoje por `customerId`;
  - **Notas**: as notas e as tags, com as ações de hoje.
- **Nenhuma capacidade some.** Editar o cadastro, criar, editar e remover nota com a autorização da IA, criar, editar e remover tag, criar memória, mudar a permissão e remover memória, gerar o resumo, e propor, confirmar e remover o responsável principal continuam alcançáveis, cada uma na aba em que o Developer a puser, declarada no relatório.
- **Copy**: saem a faixa "Gerenciado pela Agenda Avenly", o selo "Controle completo", "pertencem somente a este negócio", "origem, permissão e idade", "nasce sem autorização de uso pela IA" e "fonte oficial". O aviso de que memória cadastrada à mão não é usada pela IA até ser autorizada continua existindo, em linguagem de dono de negócio.
- **Observação 1 do review074**: os quatro comentários passam a dizer "Esta semana". Só comentário; nenhuma linha de código muda por isso.

## Fora do escopo

- Serviços (SV-03…SV-05): Goal076. Conversas e a central de notificações (CV-05, NT-01, NT-02): Goal077. Onboarding fiel ao protótipo: Goal072.
- A seção "Cadastro sem nome · importado · Nomear" do protótipo como fluxo próprio, e a linha "agenda por ele" do responsável na lista: não são achados da revisão local.
- Regra de agenda, de identidade do cliente (D-005: nenhuma rota funde, vincula ou renomeia por telefone), de memória, de autorização de nota e tag, de resumo e de responsável principal.
- As observações 1 a 6 do [review069](../reviews/069-review.md): ficam como registradas em MIGRATION_STATUS.
- `apps/evolution-go/`, `scripts/` e `tools/ia-loop/`.

## Dependências e contexto mínimo

- Goal069 ACCEPTED (baseline acima). O Goal015 fez Clientes, o Goal012 a memória e o resumo, o Goal045 a identidade do cliente, o Goal062 o telefone canônico, o Goal058 a casca e o gate que mede a composição, e o Goal069 a Agenda que "Agendar" abre.
- Arquivos de partida: `apps/scheduling-service/src/modules/customers/avenly-customer-service.ts`, `modules/internal-api/routes.ts` (rotas de cliente); `apps/ai-orchestrator/src/modules/internal/routes.ts` (lista de conversas); `apps/bff/src/modules/customers/routes.ts`, `modules/conversations/routes.ts`, `clients/scheduling/index.ts`, `clients/ai-orchestrator/index.ts`, `PUBLIC_API_V1.md`; `packages/public-api-contract/src/schemas.ts` e `routes.ts`; `apps/frontend/src/features/customers/*`, `features/agenda/AppointmentForm.tsx`, `shared/styles/`.
- Testes de partida: `apps/frontend/tests/goal015-customers.test.tsx`, `goal015-shell-invariant.test.tsx`, `goal017-contact-profile.test.tsx`, `goal017-reachability.test.tsx`; `apps/bff/tests/customer-identity.integration.test.ts`, `goal036-*`; os testes de cliente do Scheduling.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Próximo, último e números do perfil | `apps/scheduling-service/src/modules/customers/`, `modules/internal-api/routes.ts` |
| Filtro de conversa por pessoa | `apps/ai-orchestrator/src/modules/internal/routes.ts`, `apps/bff/src/modules/conversations/routes.ts`, `apps/bff/src/clients/ai-orchestrator/index.ts` |
| Contrato e BFF | `packages/public-api-contract/src/schemas.ts`, `routes.ts`, `apps/bff/src/clients/scheduling/index.ts`, `modules/customers/routes.ts`, `PUBLIC_API_V1.md` |
| Lista | `apps/frontend/src/features/customers/CustomerList.tsx`, `shared/styles/` |
| Perfil, abas, ações e copy | `features/customers/CustomerProfile.tsx`, `CustomerMemory.tsx`, `CustomerNotes.tsx`, `CustomerTags.tsx`, `CustomerSummary.tsx`, `CustomerAgenda.tsx`, `PrimaryGuardianPanel.tsx`, `CustomerForm.tsx`, `features/agenda/AppointmentForm.tsx` |
| Testes | `apps/scheduling-service/tests/**/goal075-*`, `apps/bff/tests/goal075-*`, `apps/ai-orchestrator/tests/**/goal075-*`, `apps/frontend/tests/goal075-*.test.tsx` |

## Escopo obrigatório

### 1. Scheduling: próximo, último e números (CL-01, CL-02)

- `GET /internal/customers` devolve `nextAppointment` e `lastAppointment` por item, conforme as escolhas de desenho, calculados no fuso do calendário, num cálculo só para o negócio.
- `GET /internal/customers/:id` devolve `appointmentStats`, conforme as escolhas de desenho.
- Só o negócio da requisição entra no cálculo. Nenhuma migration: os dados já existem.

### 2. Contrato, BFF e orquestrador

- `customerSchema` (ou o item de `customerListSchema`) e o detalhe do cliente declaram os campos novos, opcionais; `PUBLIC_API_V1.md` descreve as regras de próximo, último e números.
- `GET /v1/conversations` aceita `customerId`, repassado ao orquestrador, que filtra pelo contato da pessoa; `PUBLIC_API_V1.md` descreve o filtro.
- Os quatro comentários da observação 1 do review074 passam a dizer "Esta semana".

### 3. Lista (CL-01)

- Cada linha com o texto de próximo, último ou "sem atendimentos", conforme as escolhas de desenho.
- Lista alfabética com separador por letra e "Sem nome" no fim.

### 4. Perfil (CL-02, CL-03)

- Cabeçalho, "Conversa", "Agendar" e as três abas, conforme as escolhas de desenho. `/agenda/novo?customerId=` começa com a pessoa escolhida.
- Nenhuma capacidade some.
- Nenhuma destas copies aparece em `/clientes`, `/clientes/detalhes` nem `/clientes/novo`: "Gerenciado pela", "Controle completo", "pertencem somente", "origem, permissão e idade", "nasce sem autorização", "fonte oficial".
- O `<h1>` do perfil continua sendo o nome da pessoa, porque o gate abre o perfil por ele.

### 5. O gate renderizado

- `/clientes` continua medida pelo gate autenticado dentro de `validate:integration`, nas cinco larguras, e o perfil continua aberto pela linha com o nome semeado. As rotas públicas continuam medidas por `validate:ui`. Nenhuma rota entra ou sai.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela, sem desligar medida. As abas, "Conversa", "Agendar" e as linhas da lista são alvos de toque e precisam de pelo menos 24 px.

### 6. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `6787755`. Relógio fixo em todos.

No Scheduling (`goal075-*`, com PostgreSQL de teste na integração e unidade para o cálculo):

1. Com um atendimento concluído há três semanas, um cancelado ontem e um confirmado amanhã, a lista devolve `nextAppointment` de amanhã e `lastAppointment` concluído; sem o de amanhã, `nextAppointment` é `null`; um agendamento de outro negócio não entra.
2. O detalhe devolve `appointmentStats` com as contagens e a média de intervalo certas, e `averageIntervalDays` `null` com um atendimento só.
3. Com o relógio perto da meia-noite no fuso do negócio e o servidor em UTC, "agora" é o do fuso do negócio.

No BFF e no orquestrador (`goal075-*`):

4. `GET /v1/customers` e `GET /v1/customers/:id` passam os campos novos pelo schema do contrato, sem campo não declarado.
5. `GET /v1/conversations?customerId=` devolve só a conversa daquela pessoa, e nenhuma de outro negócio.

No frontend (`apps/frontend/tests/goal075-*.test.tsx`, jsdom):

6. A linha mostra "próximo hoje 15:00", "último há 3 sem", "último faltou · hoje" e "sem atendimentos" nos casos correspondentes, sem data ISO.
7. A lista tem separadores por letra, em ordem pt-BR, com "Sem nome" no fim, e a busca esconde separador vazio.
8. O perfil tem "Conversa" levando à conversa da pessoa e "Agendar" levando a `/agenda/novo?customerId=`; sem conversa, "Conversa" não aparece; sem `createAppointments`, "Agendar" não aparece.
9. `/agenda/novo?customerId=<id>` começa com a pessoa escolhida.
10. As três abas trocam por clique e por seta, e a aba do endereço abre direto; os quatro números aparecem em Resumo; cada capacidade listada nas escolhas de desenho está alcançável.
11. Nenhuma das copies proibidas do §4 aparece; a preferência mostra a origem por extenso.

Os testes existentes continuam passando. Só muda asserção que dependa de texto ou composição trocados aqui. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual. Asserção que prova identidade do cliente (D-005), autorização de nota, tag ou memória para a IA, guarda por fonte, capacidade ou invariante da casca (D-030, D-031) não pode ser apagada; pode mudar de seletor.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. `lastAppointment` passa a aceitar agendamento cancelado: o teste 1 reprova.
2. O cálculo ignora o fuso do calendário e usa o do servidor: o teste 3 reprova.
3. O filtro `customerId` deixa de ser repassado ao orquestrador: o teste 5 reprova.
4. A linha da lista volta a mostrar só nome e telefone: o teste 6 reprova.
5. "Conversa" passa a aparecer sem conversa da pessoa: o teste 8 reprova.
6. `AppointmentForm` volta a ignorar `customerId`: o teste 9 reprova.
7. A faixa "Gerenciado pela Agenda Avenly" volta ao perfil: o teste 11 reprova.

### 8. Documentação

No mesmo diff, por **acréscimo**:

- [DECISIONS](../DECISIONS.md) ganha **D-090** em `PROPOSED`, no formato de D-080 a D-089. Ela diz:
  - que próximo, último e os números do perfil são calculados pelo Scheduling, no fuso do negócio, sobre o histórico inteiro, e as regras de cada um;
  - os campos novos do contrato e o filtro `customerId` de conversa;
  - a composição da lista e do perfil, onde ficou cada capacidade, e as divergências declaradas, se houver.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§51**, sem reescrever §4 a §50. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, as telas medidas, a conferência humana pendente e as contagens da execução final.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§50 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada (observação 6 do review069).

**Ordem obrigatória, a mesma dos Goals065 a 074 e 069:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rode os sete controles do §7.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Entrega parcial sem essa lista reprova (observação 4 do review068). Documento não afirma blocker corrigido antes de a correção ser executada e conferida (observação 4 do review074). Antes de entregar uma rodada de correção, rode um grep, nos quatro documentos, de cada frase que o review apontou como falsa, e cole o resultado vazio no relatório (rodadas 3 a 5 do review069).

### 9. O que só uma pessoa confere

- Que a lista e o perfil, percorridos num aparelho real nas cinco larguras, com cliente com e sem atendimento, batem com `Clientes.dc.html`, `Clientes-Tablet.dc.html` e `Clientes-Desktop.dc.html`.
- Que o texto de próximo e último cabe na linha em 360 e 390 px sem esconder o nome, porque jsdom não tem layout nem cascata.
- Que "Conversa" e "Agendar" levam ao lugar certo com dados reais.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 10. O que este Goal não pode fazer

- Só toca `apps/frontend/`, `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/public-api-contract/` e os documentos do §8. Não toca `apps/evolution-go/`, `scripts/`, `tools/ia-loop/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma migration. Nenhuma rota nova; só campos aditivos e o filtro `customerId`. Nenhum campo existente muda de forma ou de significado.
- Não muda configuração de teste: `vitest.config.*`, `playwright.config.*`, `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` ficam como estão. Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. O Scheduling devolve próximo, último e os números do perfil conforme as regras, só do negócio da requisição e no fuso dele. Provado pela execução dos testes §6.1 a §6.3.
2. O contrato declara os campos novos, e `GET /v1/conversations` filtra por `customerId`. Provado pela execução dos testes §6.4 e §6.5 e pela checagem de campo não declarado.
3. A lista mostra próximo, último ou "sem atendimentos", com separadores por letra. Provado por execução jsdom do §6.6 e §6.7.
4. O perfil tem cabeçalho, "Conversa", "Agendar", três abas e nenhuma copy técnica, e nenhuma capacidade some. Provado por execução jsdom do §6.8 a §6.11.
5. Largura, toque, contraste, foco e movimento de `/clientes` e do perfil são decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas; os das rotas públicas, por `validate:ui`. A fidelidade ao protótipo não é provada por teste; fica na conferência humana do §9.
6. Os sete controles negativos do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
7. Typecheck e lint passam. `test:frontend` não tem teste a menos que a baseline (**104**/**1079**), `test:scheduling-service` não tem menos que **36**/**491**, `test:bff-integration` não tem menos que **57**/**440**, e `test:gate` segue em **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **155** testes e **0** retentativas. Provado por execução.
8. D-090 em `PROPOSED`, FINAL_AUDIT §51, CURRENT_STATE e VALIDATION_GATE foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
9. `git status --porcelain=v1 -uall` lista só arquivos dos diretórios do §10 e os documentos do §8, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que Clientes bate com os protótipos aprovados (conferência humana);
- a fidelidade visual de Serviços (Goal076), de Conversas e da central de notificações (Goal077) e do onboarding (Goal072).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Scheduling: próximo, último e `appointmentStats`, com testes §6.1 a §6.3 (§1) |
| WU-02 | STANDARD | WU-01 | Contrato, BFF, filtro `customerId` no orquestrador, `PUBLIC_API_V1.md` e os comentários da observação 1 do review074, com testes §6.4 e §6.5 (§2) |
| WU-03 | STANDARD | WU-02 | Lista com próximo, último e separadores, com testes §6.6 e §6.7 (§3) |
| WU-04 | STANDARD | WU-02 | Perfil com cabeçalho, ações, abas e copy, e `customerId` em `AppointmentForm`, com testes §6.8 a §6.11 (§4) |
| WU-05…WU-09 | DETERMINISTIC | WU-01…WU-04 | typecheck de `apps/frontend` e `apps/bff`, lint de `apps/frontend`, testes dirigidos `goal075` no frontend e no Scheduling |
| WU-10 | DETERMINISTIC | WU-05…WU-09 | validate-core |
| WU-11…WU-13 | DETERMINISTIC | WU-10 | gate-tests, validate-ui e validate-integration |
| WU-14 | STANDARD | WU-11, WU-12, WU-13 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-15 | DETERMINISTIC | WU-14 | git-diff-check final |

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
