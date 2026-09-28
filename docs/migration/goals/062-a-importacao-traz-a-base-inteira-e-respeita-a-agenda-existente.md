# Goal 062 — A importação traz a base inteira e respeita a agenda existente

**Status: ACCEPTED** no [review062](../reviews/062-review.md), rodada 2 de 2 (rodada 1 `CHANGES_REQUIRED` com 6 blockers). Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal061 ACCEPTED](../reviews/061-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v85 precisa o escopo com evidência conferida no código: a categoria de clientes nunca leu a lista da origem; a execução soma a disponibilidade porque não olha as regras vigentes; a busca de candidatos por número compara dígitos por igualdade exata; e preço zero vira preço fixo.

## Baseline aceita

Baseline aceita: `c86ca2ecdd38fbe9e0daa60206e6a038db4c8f3f`

Goal anterior: 061 — A importação longa não depende de uma requisição

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal061 já integrado em `main` (origem `5971dd2f84a6122bb02c85c9fdd5e8859254d7a5`). **Duas rodadas**, com 5 e 0 blockers. **D-078** foi aceita e [FINAL_AUDIT §39](../FINAL_AUDIT.md) escrita sem reescrever §4 a §38. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O 061 mudou o início da análise e da execução, o lease da análise, a leitura do preview e a tela de acompanhamento. Não mudou a leitura da origem, a classificação de itens, a execução por categoria, os conflitos nem o cadastro de clientes. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review061](../reviews/061-review.md): `test:gate` **233**; `test:frontend` **78** arquivos e **750** testes; suíte unitária de `apps/scheduling-service` **32** arquivos e **448** testes; integração do Scheduling **13** arquivos e **103** testes; integração do BFF **48** arquivos e **386** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **65** testes e **0** retentativas.

## Objetivo e posição

Fazer a importação trazer a base inteira de clientes da Minha Agenda, trocar a disponibilidade só com escolha explícita do dono e nunca somá-la à existente, gravar telefone numa forma única que a busca por número do WhatsApp encontra, e tratar preço zero como preço não informado. Aplica **U-08** ([DECISIONS](../DECISIONS.md): a Minha Agenda tem lista completa de clientes). Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA IM-06** (ALTA): a tela diz que a Minha Agenda não tem lista completa de clientes, e a importação perde toda cliente sem agendamento ou bloqueio no período lido.
- **QA IM-09** (ALTA): depois de concluir, seg–sex têm três regras ativas (09–18 do onboarding, 08–12 e 13–19 da origem). O almoço some. `/configuracoes/disponibilidade` mostra só 08:00–12:00, e salvar apagaria a tarde.
- **QA IM-10** (MÉDIA): os 263 clientes vêm como `55<DDD+número>`, sem o `55` do país, enquanto o contato do WhatsApp chega como `5555…`.
- **QA CL-04** (MÉDIA): o telefone do cadastro manual é gravado e mostrado como digitado.
- **QA IM-11** (BAIXA): serviço com preço zero é importado como "R$ 0,00".
- **QA CL-05** (BAIXA), **só a parte de busca**: a cliente com o mesmo número passa a ser encontrada como candidata. O vínculo da conversa continua nascendo só na confirmação (D-005), e o painel de Conversas não muda (§11).

Junto, a **observação 2 do [review061](../reviews/061-review.md)**: `IMPORT_SOURCE_INVALID_RESPONSE` passa a ter texto próprio na tela, distinto da falha interna.

Posição: terceiro e último da cadeia de importação (060 → 061 → 062). O Goal066 (importação no onboarding) reaproveita a experiência que este Goal completa.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **A categoria de clientes nunca leu a lista.** `readCustomerCategory` (`apps/scheduling-service/src/modules/integrations/minha-agenda/import-source-reader.ts:327-362`) junta só os `customer` embutidos em agendamentos e bloqueios lidos, com `sourceSupported: false`, `CUSTOMER_DIRECTORY_UNAVAILABLE` e o texto "A origem não expõe um endpoint de listagem de clientes". `MinhaAgendaClient` (`client.ts`) não tem método de clientes.
2. **A rota de listagem está no mapa histórico, sem corpo confirmado.** O mapa do portal no commit `1e22dff` (`apps/api/docs/MINHAAGENDA_ENDPOINTS.md`, seção `CustomerService`) registra `findAllForCurrentUser()` → `GET /customers`, sem parâmetros, e `findAllForCurrentUserPaged(pageNumber, pageSize, searchTerm)` → `GET /customers/paged`. O mapa descreve a chamada do frontend do portal, não a resposta. `minhaAgendaCustomerSchema` (`types.ts`) já valida `id`, `name`, `phone1` e `phone2` com `.passthrough()`, a forma que o cliente tem quando vem embutido no agendamento. É o mesmo tipo de evidência que o Goal060 usou para `GET /employees/professionals`.
3. **A execução soma a disponibilidade.** `runAvailabilityGroup` (`apps/scheduling-service/src/modules/migrations/import-execution-service.ts:670-770`) calcula a grade com `migrationAvailabilityRules` e faz `availabilityRule.create` para cada regra, sem ler as regras vigentes do negócio. `PATCH /internal/availability-settings` (`internal-api/routes.ts:885-940`) faz o oposto: apaga a grade inteira e recria, depois de `assertNonOverlappingRules` (`routes.ts:2664`).
4. **A decisão de item já tem o par de que a troca precisa.** Para categoria sem correspondência (`AVAILABILITY`), a tela oferece só `INCLUDE` e `EXCLUDE` (`decisionsForCategory`, `apps/frontend/src/features/imports/labels.ts:147`). No Scheduling, `EXCLUDE` deixa o item `SKIPPED` e `INCLUDE` o devolve a `PENDING` com `INCLUDED_BY_DECISION` (`routes.ts:2534-2610`). A decisão é única por item e a tabela `ImportDecision` é append-only. Nenhum valor novo de `ImportDecisionKind` é necessário.
5. **A tela de Disponibilidade só conhece um intervalo.** `AvailabilitySettings.tsx` inicia início e fim com `active[0]` e salva o mesmo intervalo em todos os dias marcados. Uma grade com dois intervalos por dia aparece pela metade e é apagada ao salvar.
6. **A busca por número compara dígitos crus.** `normalizePhone` do Scheduling (`src/shared/phone/phone.ts`) só tira o que não é dígito. `AtendlyCustomerService.list({ phone })` filtra `normalizedPhone` por igualdade exata. A IA busca candidatos por essa rota (`findCustomerCandidatesByPhone`, `apps/ai-orchestrator/src/modules/scheduling-service/client.ts:536`, chamada em `assistant-tools.ts:977` e `:1128`) com o número vindo do JID. A classificação de cliente na análise também compara `normalizedPhone` por igualdade (`import-preview-service.ts:1026-1040`). O BFF já tem a regra brasileira de código do país e 9º dígito (`apps/bff/src/lib/phone.ts:1-110`); o frontend tem a de exibição (`apps/frontend/src/shared/phone.ts`); o Scheduling não tem nenhuma.
7. **O telefone não é formatado na exibição de cliente.** `CustomerList.tsx:126`, `CustomerProfile.tsx:146`, `PrimaryGuardianPanel.tsx:170` e `AppointmentDetail.tsx:123` mostram `phone` como gravado. `formatBrazilianPhone` existe em `apps/frontend/src/shared/phone.ts` e só é usado em Conversas.
8. **Preço zero vira preço fixo.** `knownNumber(0)` devolve `0`, então o serviço importado nasce `FIXED` 0 (`import-execution-service.ts:807-818`), e os serviços embutidos no agendamento também (`appointmentServices`, `:1470-1505`; `toCalendarService`, `import-source-reader.ts`). O vault só prevê fixo, a partir de, sob consulta e sem preço informado (perguntas 44 e 780 de `docs/product-vault/04-Referencia/99-Perguntas-e-Respostas.md`; `01-Regras/06-Importacao-Minha-Agenda.md`, "Serviços incompletos").
9. **`ImportItem` não guarda o registro da origem.** Só `label`, `reasonCode` e `reasonDetail` sanitizados (`schema.prisma:1176-1222`). A grade proposta pela origem não sobrevive à análise, então a tela de conflito não tem como mostrá-la sem gravar algo.
10. **As telas afetadas e o gate.** `/clientes` e `/configuracoes` estão no gate renderizado (`apps/frontend/e2e/routes.ts:43-60`); `/configuracoes/disponibilidade` e `/importacao` não.

## Fora do escopo

- Vincular a conversa ao cliente pelo número, ou mudar o painel de Conversas ("Este contato ainda não é um cliente cadastrado"). D-005 manda preencher `Contact.customerId` só na confirmação; telefone não prova identidade (vault `01-Regras/04-Clientes-e-Memoria.md`).
- Reescrever `normalizedPhone` das linhas já gravadas. A busca passa a achar as formas antigas (§3); não há migration de dado.
- O editor de disponibilidade por dia (QA S-07, Goal067). Aqui a tela só deixa de esconder e de apagar em silêncio (§5).
- Tipo de preço "gratuito". O vault não o prevê.
- O identificador interno digitado pelo dono em `MERGE_WITH_EXISTING`/`KEEP_EXISTING` de clientes e serviços (`ImportConflictsScreen.tsx:275`). Continua como está; a troca da disponibilidade não usa esse caminho.
- Máscara de digitação no campo de telefone. O cadastro aceita o que a pessoa digita; o Scheduling normaliza.
- A importação no onboarding (U-09, Goal066) e a fidelidade visual das telas (Goal069).
- As observações 1, 3, 4, 5 e 6 do review061, as abertas do [review070](../reviews/070-review.md) e a 4 do [review059](../reviews/059-review.md) (`goal008-agenda.test.ts` intermitente). Se esse teste reprovar em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa, como no Goal059.
- Deploy e conta real. A conferência contra a conta de teste da Minha Agenda (U-05) é humana e fica fora da prova deste Goal (§9).

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas IM-06, IM-09, IM-10, IM-11, CL-04 e CL-05 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md);
- em [DECISIONS](../DECISIONS.md): a linha U-08, D-005 e a decisão de implementação do Goal006 (a que cita `findCandidatesByPhone`), e D-077 e D-078 só nos Limites;
- `docs/product-vault/01-Regras/06-Importacao-Minha-Agenda.md`, seções "Clientes incompletos", "Serviços incompletos" e "Conflitos";
- a seção `CustomerService` de `git show 1e22dff:apps/api/docs/MINHAAGENDA_ENDPOINTS.md`;
- em `apps/scheduling-service/src/modules/integrations/minha-agenda/`: `client.ts`, `types.ts`, `import-source-reader.ts` e `availability.ts`;
- em `apps/scheduling-service/src/modules/migrations/`: `classifyRecord`, `classifyCustomer` e `labelFor` de `import-preview-service.ts`; `runAvailabilityGroup`, a criação de serviço e `appointmentServices` de `import-execution-service.ts`;
- em `apps/scheduling-service/src/modules/internal-api/routes.ts`: `PATCH /internal/availability-settings`, `assertNonOverlappingRules`, a rota de decisão de item e `GET /internal/customers`;
- `apps/scheduling-service/src/shared/phone/phone.ts` e `apps/scheduling-service/src/modules/customers/atendly-customer-service.ts`;
- `apps/bff/src/lib/phone.ts`, só como referência da regra brasileira;
- `packages/public-api-contract/src/schemas.ts`, só os schemas de item de importação e de categoria;
- em `apps/frontend/src/features/imports/`: `labels.ts`, `ImportConflictsScreen.tsx` e `ImportPreviewScreen.tsx`; `apps/frontend/src/features/settings/AvailabilitySettings.tsx`; `apps/frontend/src/shared/phone.ts`; e os pontos de exibição de telefone do §7 da evidência;
- os testes existentes de leitura, classificação, execução e decisão da importação e de cliente por telefone.

## Pontos de implementação

- `apps/scheduling-service/src/modules/integrations/minha-agenda/`: método de listagem de clientes, leitura da categoria com recuo declarado, preço zero.
- `apps/scheduling-service/src/modules/migrations/`: classificação da disponibilidade com grade vigente, troca na execução, preço zero, equivalência de telefone na classificação.
- `apps/scheduling-service/src/shared/phone/phone.ts` e `modules/customers/`: forma canônica e busca por equivalência.
- `apps/scheduling-service/src/modules/internal-api/routes.ts`: regra de sobreposição compartilhada, grade proposta na leitura do item.
- `apps/scheduling-service/prisma/`: no máximo a migration aditiva do §2.
- `packages/public-api-contract/src/schemas.ts`, `apps/bff/src/clients/scheduling/index.ts` e `apps/bff/PUBLIC_API_V1.md`.
- `apps/frontend/src/features/imports/`, `features/settings/AvailabilitySettings.tsx`, `features/customers/`, `features/agenda/AppointmentDetail.tsx`.
- Testes novos com prefixo `goal062-` em `apps/scheduling-service/tests/unit/`, `apps/scheduling-service/tests/integration/`, `apps/bff/tests/` (se o contrato mudar) e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. A base inteira de clientes (scheduling-service)

- `MinhaAgendaClient` ganha `listCustomers()`: `GET /customers`, pelo mesmo `request` autenticado dos demais métodos, validado como lista de `minhaAgendaCustomerSchema`. Se a resposta não for lista, ou algum registro não passar no schema, o método lança o erro de resposta inválida que o cliente já usa (`IMPORT_SOURCE_INVALID_RESPONSE` na falha do trabalho).
- A categoria `CUSTOMER` passa a ser a **união** da listagem com os clientes embutidos em agendamentos e bloqueios que a listagem não trouxe, deduplicada pelo `id` da origem. Com a listagem lida: `sourceSupported: true`, `readCount` igual ao tamanho da união, sem limitação.
- Registro da listagem com `deleted: true` não entra, a menos que um agendamento ou bloqueio lido o referencie.
- **Recuo declarado.** Se a listagem responder `404` ou vier fora da forma, a categoria volta à cobertura de hoje (só clientes embutidos), com `sourceSupported: false` e um código de limitação **novo**, distinto de `CUSTOMER_DIRECTORY_UNAVAILABLE`, cujo texto diz que a lista completa não pôde ser lida desta vez. O recuo não esconde a causa: o código de limitação é gravado e a tela o mostra (§6). Login recusado, origem indisponível e erro de rede continuam falhando o trabalho inteiro, como nas demais categorias.
- A execução, que relê a origem, usa o mesmo leitor; nenhum caminho de execução volta a derivar clientes só de agendamentos quando a listagem foi lida.
- Nenhum teste chama a Minha Agenda real. A forma da resposta real é conferida por uma pessoa (§9).

### 2. A disponibilidade é trocada, nunca somada (scheduling-service)

- **Análise.** Se o negócio tem pelo menos uma `AvailabilityRule` ativa, os itens de `AVAILABILITY` nascem `NEEDS_REVIEW` com um `reasonCode` próprio de troca (por exemplo, `AVAILABILITY_REPLACES_CURRENT`). Sem regra ativa, ficam `PENDING` como hoje. A grade proposta pela origem (`migrationAvailabilityRules`) é validada pela mesma regra de sobreposição da tela de configuração; grade da origem que se sobrepõe a si mesma é classificada com um código próprio e nunca é gravada.
- **A escolha é de item e só de item.** Para a troca, `INCLUDE` significa "usar os horários da Minha Agenda no lugar dos atuais" e `EXCLUDE` significa "manter meus horários". A escolha vale para o grupo inteiro de disponibilidade (os itens `company` e `employee:<id>` formam uma grade só na tela e na execução); o Developer escolhe como aplicá-la ao grupo e prova. **Nenhuma decisão de sessão (`IMPORT_ALL`) ou de categoria confirma a troca.** "Importar tudo" nunca apaga a grade vigente.
- **Execução.** Com a troca confirmada, uma única transação apaga a grade vigente do negócio, grava a grade da origem e confirma os itens, como `PATCH /internal/availability-settings` faz com a grade da tela. Fencing pelo lease igual às demais escritas da execução (D-078).
- **A grade mudou depois da análise.** Se, na hora de gravar, o negócio tem regra ativa e a troca não foi confirmada (a pessoa criou horário depois da análise), a execução não grava nada de disponibilidade: o item termina `FAILED` com um código próprio, e o texto da tela manda analisar de novo.
- **Regra de sobreposição única.** `assertNonOverlappingRules` sai de `routes.ts` para um módulo compartilhado, usado pela tela de configuração e pela importação. O comportamento da rota de configuração não muda.
- **A grade proposta é mostrada antes da escolha.** A leitura dos itens de conflito devolve, por acréscimo, a grade vigente e a grade proposta, por dia da semana (`dayOfWeek`, `startTime`, `endTime`), só para itens de `AVAILABILITY`. Como `ImportItem` não guarda o registro da origem (evidência 9), **uma migration aditiva é permitida**, e só esta: uma coluna JSON anulável que guarda a grade proposta já derivada e sanitizada (horários e dias, nada mais da origem), gravada pela análise. Nenhuma outra mudança de schema. A migration passa em `migrate diff` e nos ensaios de migration que `validate:integration` já roda.

### 3. Telefone numa forma única (scheduling-service)

- `normalizePhone` do Scheduling passa a devolver a forma canônica. Número brasileiro reconhecido (10 ou 11 dígitos nacionais com DDD válido; 12 ou 13 dígitos começando por `55` com DDD válido; prefixos `00` e `0` de discagem removidos) vira `55` + DDD + assinante, **com o 9º dígito** quando o assinante de 8 dígitos começa por 6–9. O resto continua como hoje: dígitos, entre 6 e 15, ou `INVALID_PHONE`.
- `phone` passa a ser gravado como `+` seguido da forma canônica quando o número é reconhecido; quando não é, como digitado, sem espaços nas pontas, como hoje. Vale para cadastro manual, edição, criação na confirmação do agendamento e importação, todos pelo mesmo caminho (`AtendlyCustomerService`).
- **Busca por equivalência.** `list({ phone })` e `findCandidatesByPhone` comparam `normalizedPhone` com o conjunto de formas equivalentes do número pedido: a canônica, a sem 9º dígito e as duas formas nacionais sem `55` (com e sem 9º dígito). As formas nacionais existem só para achar linhas gravadas antes deste Goal. O resultado continua sendo lista de candidatos; nada vincula, funde nem renomeia (D-005).
- A classificação de cliente na análise usa a mesma equivalência para achar correspondência por telefone.
- A lista de DDDs válidos do Scheduling é a mesma do BFF. Um teste compara as duas listas, para que não divirjam em silêncio.
- `apps/ai-orchestrator/` não muda: ele já busca pela rota do Scheduling com o número do JID.

### 4. Preço zero é preço não informado (scheduling-service)

- Serviço da origem com preço `0` nasce `NOT_INFORMED`, com `price` nulo, no catálogo e nos serviços embutidos em agendamentos importados. O preço total do agendamento importado não muda.
- A análise marca o serviço com um `reasonCode` informativo (por exemplo, `SERVICE_PRICE_ZERO_AS_NOT_INFORMED`), sem mudar o status para `NEEDS_REVIEW`: não bloqueia a importação.
- Serviço cadastrado à mão não muda.

### 5. Contrato público e BFF

- Os códigos novos (limitação de clientes do §1, motivos e falhas do §2, motivo do §4) entram nos conjuntos que o contrato declara, se o contrato os fecha.
- A grade vigente e a proposta do §2 entram, por acréscimo, no schema do item de importação que a tela de conflito lê.
- `apps/bff/src/clients/scheduling/index.ts` valida o que mudou. As rotas do BFF repassam sem regra própria. **A contagem congelada de chamadas `this.http.` em `apps/bff/src/clients/` (42) não muda**, e nenhum teste de outro app é editado para acomodar contagem (blocker 1 do review061).
- `apps/bff/PUBLIC_API_V1.md`: a listagem completa de clientes e o recuo, a troca da disponibilidade com `INCLUDE`/`EXCLUDE` de item, a grade vigente e a proposta, o preço zero e a busca de clientes por número com equivalência de formas.

### 6. Telas (frontend)

- **Importação.** A revisão mostra a contagem de clientes da união. O texto "O Minha Agenda não tem uma lista completa de clientes…" só aparece para sessão analisada antes deste Goal (`CUSTOMER_DIRECTORY_UNAVAILABLE`); o recuo do §1 tem texto próprio. `IMPORT_SOURCE_INVALID_RESPONSE` ganha texto próprio, distinto da falha interna (observação 2 do review061). Todo código novo do §1, §2 e §4 tem texto leigo; código desconhecido cai no texto genérico.
- **Conflito de disponibilidade.** Mostra os horários atuais e os da Minha Agenda, por dia, e duas escolhas: "Usar os horários da Minha Agenda" (substitui os atuais) e "Manter meus horários". Nenhum identificador interno é pedido. O texto diz que a escolha substitui a grade inteira.
- **Configurações › Disponibilidade.** Mostra todas as regras ativas, agrupadas por dia. Se a grade não cabe no formulário de intervalo único (algum dia com mais de um intervalo, ou dias com intervalos diferentes), a tela diz isso e salvar exige confirmação explícita de que a grade inteira será substituída pelo intervalo do formulário. Sem essa confirmação, nada é enviado.
- **Telefone na exibição.** Lista, perfil, candidatos de responsável e detalhe do agendamento mostram o telefone formatado por `formatBrazilianPhone` quando é brasileiro reconhecido, e o valor gravado quando não é.
- Nenhum texto contém "token", "OAuth", "API", "HTTP", "lease", "E.164" nem código cru.

### 7. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório** (observação 7 do review061). A origem é sempre um leitor de teste ou um servidor local. Nenhum teste chama a Minha Agenda real.

1. **Scheduling, contra PostgreSQL real** (suíte de integração):
   - com a origem de teste devolvendo em `GET /customers` clientes sem agendamento, a análise lista todos na categoria `CUSTOMER` com `sourceSupported: true`, e a execução os cria;
   - com `GET /customers` respondendo `404` ou fora da forma, a análise termina com a cobertura de hoje e o código de limitação novo;
   - negócio com 09–18 seg–sex e origem com 08–12 e 13–19: sem decisão, "Importar tudo" termina sem alterar nenhuma `AvailabilityRule`; com `INCLUDE` de item, a grade final é exatamente 08–12 e 13–19, sem sobreposição; com `EXCLUDE`, a grade final é 09–18;
   - decisão de sessão `IMPORT_ALL` e de categoria não trocam a grade;
   - regra ativa criada depois da análise faz o item terminar `FAILED` com o código do §2, sem gravar;
   - cliente importado com `55<DDD55 + 9 dígitos>` é achado por `GET /internal/customers?phone=` com `5555<8 dígitos>` e com `55559<8 dígitos>`; cliente gravado antes deste Goal, com dígitos nacionais, também;
   - dois negócios diferentes não enxergam grade, clientes nem candidatos um do outro.
2. **Scheduling, unitário:** a forma canônica para cada caso do §3 (10, 11, 12 e 13 dígitos, fixo e celular, `00` e `0`, DDD inválido, número estrangeiro, menos de 6 e mais de 15 dígitos); o conjunto de formas equivalentes; a lista de DDDs igual à do BFF; preço zero no catálogo e no serviço embutido; `deleted: true` fora da listagem salvo quando referenciado; grade da origem com sobreposição classificada sem gravar.
3. **BFF:** os schemas novos passam com a resposta real do Scheduling montada no teste.
4. **Frontend (jsdom):** o conflito de disponibilidade mostra as duas grades e envia `INCLUDE` ou `EXCLUDE` de item sem pedir identificador; a tela de Disponibilidade com dois intervalos por dia mostra os dois e não envia nada sem a confirmação; telefone gravado `+5555…` aparece formatado na lista e no perfil; o texto do recuo de clientes e o de `IMPORT_SOURCE_INVALID_RESPONSE` aparecem; nenhum texto contém os termos proibidos do §6.

Os testes existentes continuam passando. Só muda asserção que espera a forma antiga do telefone gravado, a categoria de clientes com `CUSTOMER_DIRECTORY_UNAVAILABLE` ou a soma da disponibilidade; o relatório lista cada mudança com o motivo.

### 8. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo. Cole a **saída real** no relatório:

1. A categoria de clientes volta a ignorar a listagem: o teste de clientes sem agendamento do §7.1 reprova.
2. A execução volta a criar regras sem ler a grade vigente: o teste de "Importar tudo" sem decisão do §7.1 reprova.
3. `IMPORT_ALL` passa a confirmar a troca: o teste de decisão de sessão do §7.1 reprova.
4. A busca volta à igualdade exata: o teste de candidato sem 9º dígito do §7.1 reprova.
5. Preço zero volta a `FIXED`: o teste unitário do §7.2 reprova.
6. A tela de Disponibilidade volta a enviar sem confirmação: o teste jsdom do §7.4 reprova.

### 9. O que só uma pessoa confere

Depois do aceite, com a pilha local e a conta de teste de U-05, uma pessoa confere que `GET /customers` da conta real devolve a lista na forma validada, que a contagem de clientes da revisão bate com a da Minha Agenda, que a troca da grade funciona com a grade real e que uma mensagem de um número importado encontra a cliente como candidata. O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 10. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: o §5.
- [DECISIONS](../DECISIONS.md) ganha **D-079** em `PROPOSED`, no formato de D-075 a D-078. Ela diz que:
  - a categoria de clientes lê a listagem da origem e recua para a cobertura parcial com limitação declarada quando a forma não bate (aplica U-08);
  - a disponibilidade importada substitui a vigente só por decisão de item, nunca por decisão de sessão ou de categoria, e nunca é somada;
  - o Scheduling grava o telefone na forma canônica brasileira e busca candidatos por equivalência de formas, sem vincular, fundir nem renomear (aplica D-005);
  - preço zero da origem é preço não informado.

  Limites da D-079: a forma real de `GET /customers` não foi conferida por teste; linhas antigas não são reescritas; o editor por dia fica no 067; o vínculo da conversa não muda. D-079 aplica U-08 e D-005 e diz isso, sem reescrever nenhuma das duas.
- A linha U-08 de DECISIONS ganha só uma nota de aplicação ("aplicada no Goal062, ver D-079"), sem mudar o texto.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§40**, sem reescrever §4 a §39: **QA IM-06, IM-09, IM-10, IM-11 e CL-04** corrigidos e **QA CL-05** corrigido só na busca, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram a listagem e o recuo, a troca da disponibilidade, a forma do telefone, o preço zero, a migration aditiva (se criada), a conferência humana pendente e as contagens da execução final, de cada suíte tocada (arquivos e testes), de `test:gate` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- [DATA_MIGRATION](../DATA_MIGRATION.md) ganha uma nota sobre clientes, disponibilidade e preço zero, se alguma passagem vigente dele passar a mentir.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) não é editado.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Escreva a prosa **depois** da execução final. Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova.

### 11. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/evolution-go/`, `tools/ia-loop/` nem `QA_LOCAL_REVIEW.md`. Em `packages/`, só `packages/public-api-contract/`. Nenhum teste de outro app é editado para acomodar contagem congelada.
- Não cria migration além da coluna aditiva do §2, e nenhuma migration reescreve linha existente.
- Não muda o painel de Conversas, o vínculo da conversa ao cliente, nem a criação de cliente na confirmação além do telefone canônico.
- Não muda a conexão com a origem (D-077), o início assíncrono, o lease nem a leitura do preview (D-078).
- Não afirma largura, contraste, foco nem movimento de `/importacao` ou de `/configuracoes/disponibilidade`: nenhuma das duas é medida pelo gate renderizado.
- Não chama a Minha Agenda real em teste, ensaio ou gate.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core`, nenhuma regra de `final-production-audit.mjs` relaxada e nenhuma medida do gate autenticado desligada.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A categoria de clientes traz a união da listagem com os clientes embutidos, e recua com limitação declarada quando a listagem não é lida. Provado por execução do §7.1 contra PostgreSQL real, dentro de `validate:integration`, com o vermelho da baseline colado.
2. A disponibilidade nunca é somada: sem decisão de item nada muda; `INCLUDE` troca a grade inteira numa transação; `EXCLUDE` mantém; decisão de sessão ou de categoria não troca; grade mudada depois da análise não é gravada. Provado por execução do §7.1.
3. A mesma regra de sobreposição vale para a tela de configuração e para a importação, e a rota de configuração se comporta como antes. Provado por execução do §7.1, do §7.2 e dos testes existentes da rota.
4. Telefone gravado na forma canônica em cadastro manual e importado; candidato achado com e sem código do país e com e sem 9º dígito, inclusive linha antiga; nenhum vínculo automático. Provado por execução do §7.1 e do §7.2.
5. Preço zero da origem nasce sem preço informado, sem bloquear. Provado por execução do §7.2.
6. As telas do §6 fazem o que o §6 diz. Provado por execução jsdom do §7.4. Largura, toque, contraste, foco e movimento de `/clientes` e `/configuracoes` continuam decididos por `validate:ui`; `/importacao` e `/configuracoes/disponibilidade` não são medidas (§11).
7. Contrato público, BFF e `PUBLIC_API_V1.md` descrevem o que mudou, e a contagem de `this.http.` em `apps/bff/src/clients/` segue **42**. Provado por diff e por execução do §7.3 e de `test:gate`.
8. Os seis controles negativos do §8 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
9. Typecheck e lint de `apps/scheduling-service`, `apps/bff` e `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **78**/**750**; unitária do Scheduling **32**/**448**; integração do Scheduling **13**/**103**; integração do BFF **48**/**386**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam, este com o gate autenticado em **65** testes ou mais e **0** retentativas. Provado por execução.
10. D-079 em `PROPOSED`, a nota em U-08, FINAL_AUDIT §40, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo depois da execução final, trazem as contagens dela e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que `GET /customers` da conta real tem a forma validada, nem que a contagem bate com a Minha Agenda. Isso é a conferência humana do §9;
- que as telas de importação e de Disponibilidade cumprem largura, toque, contraste, foco e movimento;
- que a tela bate com o protótipo aprovado (conferência humana, Goal069);
- que a conversa fica ligada à cliente sem confirmação, o que D-005 proíbe.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Listagem de clientes, união, `deleted` e recuo declarado (§1) e preço zero (§4), com os testes `goal062-` de leitura e de preço |
| WU-02 | STANDARD | WU-01 | Forma canônica do telefone, busca por equivalência, classificação por equivalência e lista de DDDs (§3), com os testes unitários e de integração de telefone |
| WU-03 | COMPLEX | WU-01, WU-02 | Troca da disponibilidade: regra de sobreposição compartilhada, classificação com grade vigente, grade proposta gravada (migration aditiva), escolha de item aplicada ao grupo, transação de troca e grade mudada depois da análise (§2), com os testes de integração |
| WU-04 | STANDARD | WU-01, WU-02, WU-03 | Contrato público, cliente do BFF e `PUBLIC_API_V1.md` (§5), com os testes do BFF |
| WU-05 | STANDARD | WU-04 | Telas de importação: contagem, recuo, textos novos e conflito de disponibilidade (§6), com os testes jsdom |
| WU-06 | STANDARD | WU-02 | Tela de Disponibilidade e telefone formatado na exibição (§6), com os testes jsdom |
| WU-07…WU-15 | DETERMINISTIC | WU-05, WU-06 | typecheck e lint dos três apps, testes dirigidos (`goal062`) do Scheduling e do frontend, gate-tests |
| WU-16…WU-18 | DETERMINISTIC | WU-07…WU-15 | validate-core; depois validate-ui e validate-integration |
| WU-19 | STANDARD | WU-17, WU-18 | Controles negativos (§8) e documentação (§10), depois da execução final |
| WU-20 | DETERMINISTIC | WU-19 | git-diff-check final |

Os testes `goal062-` do BFF rodam dentro de `validate:integration`. A unidade `validate-integration` roda a suíte de integração do Scheduling (onde fica o §7.1), a do BFF, os ensaios de migration e o gate autenticado contra bancos descartáveis. Se ela falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, como o Goal059 fez com `goal008-agenda`.
