# Goal 136 — Os conflitos da importação com a correspondência sugerida e os valores da origem no contrato

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal135 ACCEPTED](../reviews/135-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v160**, inserida depois do 135, sem renumerar nem remover ID. Origem: a conferência do quadro 2.I6 ("Conflitos da importação"), o último da importação do onboarding com contrato a resolver. Este Goal **não tem quadro do protótipo e não muda o frontend**: ele entrega no Scheduling, no contrato e no BFF o que o 2.I6 precisa mostrar e decidir. A tela (`ImportConflictsScreen`) e o quadro 2.I6 ficam para a passada seguinte, sobre o contrato novo.

## Baseline aceita

Baseline aceita: `1669efa187da776ab908a1f0c1b3d955a2e2b5ae`

Goal anterior: 135 — As pendências e a confirmação da importação do onboarding iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal135 já integrado em `main` (origem `14ca938c8cf741286300b9c305b155d0d10ba36f`). Houve **duas rodadas**: a rodada 1 com 2 blockers (a cor do cabeçalho do painel do 2.I8 e uma divergência não declarada nas `notes` do 2.I9), resolvidos pela FIX-001; a rodada 2 aceita. **D-149** foi aceita. A última contagem aceita (rodada 2, IA Loop):

- frontend **198** arquivos e **2819** testes, `goal135` **82** (2 arquivos);
- `visual-responses.test.mjs` **62**;
- `test:gate` **295**;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **cada item de serviço e de cliente da importação passa a trazer, na rota de itens, os cadastros da Avenly que a análise sugeriu como correspondência (lidos no momento, só do negócio) e, no serviço, a duração e o preço da origem; e o serviço de mesmo nome com duração ou preço diferentes passa a ser um conflito em revisão**, como o vault pede. Nada muda na tela, na execução, na conclusão nem na rota de decisão.

**Por que agora.** O Goal135 fechou o 2.I8 e o 2.I9 sem lacuna de contrato. Da importação do onboarding resta o 2.I6 (a 4.3 continua fora pelo código de vinculação). O 2.I6 mostra cada conflito com o valor da Avenly e o do Minha Agenda lado a lado ("45 min · R$ 90" × "50 min · R$ 95") e a decisão no próprio cartão. Ao conferir o que a tela de hoje faz, esta passada achou uma lacuna funcional que vem antes do quadro (evidências 1 a 4): a pessoa precisa digitar o ID interno de um cadastro para decidir um conflito. Portar o 2.I6 antes disso mostraria uma comparação que o contrato não tem. A troca do campo pela escolha do candidato fica com o 2.I6, porque `ImportConflictsScreen` é a tela desse quadro e mudá-la sem portá-lo deixaria a fidelidade visual adiada.

## O que a evidência desta passada mostra

Conferido no código da baseline `1669efa`, em `docs/product-vault/` e em `Onboarding-2-Importacao.dc.html` (quadro 2.I6).

1. **A decisão pede um ID digitado.** Em `ImportConflictsScreen.tsx`, um item de `SERVICE` ou `CUSTOMER` em revisão oferece `decisionsForCategory` (`INCLUDE`, `MERGE_WITH_EXISTING`, `CREATE_NEW`, `KEEP_EXISTING`, `EXCLUDE`). Com `MERGE_WITH_EXISTING` ou `KEEP_EXISTING` (`decisionRequiresTarget`), a tela mostra um campo de texto, "Identificador do cadastro existente", e recusa enviar sem ele ("Informe o identificador do cadastro existente."). O Scheduling (`internal-api/routes.ts`, `applyImportDecision`) recusa as duas decisões sem `targetInternalId` e procura o alvo por `tenantId` e `id`.
2. **A análise calcula os candidatos e não os grava.** `import-preview-service.ts` (`classifyService`, `classifyCustomer`) devolve `candidateInternalIds`, e `analyze` os põe no resultado como `matchCandidateInternalIds`, mas `itemCreates` e `itemUpdates` não os gravam: `ImportItem` (`prisma/schema.prisma`) não tem coluna para eles. `importItemSchema` (contrato) não traz candidato nem valor da origem para serviço e cliente; só `currentAvailability` e `proposedAvailability`, em `AVAILABILITY` (Goal062).
3. **A origem não é guardada.** A execução relê a Minha Agenda (`import-execution-service.ts`, `importService` recebe o `record` da leitura) e deriva a duração e o preço com `knownPositiveDuration` e `resolvePrice` (preço ausente ou zero vira `NOT_INFORMED`/`null`, D-079). Os valores da origem só podem ser mostrados na decisão se a análise os gravar, como `proposedAvailability` faz para a grade (`20260927120000_goal062_import_item_proposed_availability`, uma coluna `JSONB` anulável).
4. **O vault pede o conflito que não existe.** `docs/product-vault/04-Referencia/99-Perguntas-e-Respostas.md`: "Conflitos da primeira importação? — Comparar e permitir decisão" (358); "Mesmo nome, preço/duração divergentes? — Mostrar conflito" (795); "Nomes parecidos? — Sugerir correspondência, usuário confirma" (796). Hoje `classifyService` dá `SERVICE_MATCH_EXACT` e `PENDING` ao serviço com um só cadastro de mesmo nome, qualquer que seja a duração e o preço; ele não aparece entre os conflitos.
5. **O que já existe e não muda.** `SERVICE_MATCH_AMBIGUOUS` e `SERVICE_MATCH_SIMILAR` (em revisão, com candidatos), `SERVICE_DURATION_MISSING` (prevalece sobre a correspondência), `SERVICE_PRICE_NOT_INFORMED` (só informativo), `CUSTOMER_MATCH_EXACT`, `CUSTOMER_MATCH_AMBIGUOUS`, `CUSTOMER_MATCH_SIMILAR`, `CUSTOMER_PHONE_SHARED` e `CUSTOMER_NAME_MISSING`, com o status de cada um. O item resolvido (`RESOLVED_ITEM_STATUSES`) não é reescrito pela reanálise.
6. **Quem lê `importItemSchema` hoje.** O frontend valida a resposta da rota de itens pelo contrato (`listImportItems`), em `ImportConflictsScreen`, `ConflictCategoryScreen` e na tela parada do 2.I8 (Goal135); os alvos 2.I8 e 2.I9 de `targets.json` têm respostas fixas de itens validadas por `goal135-alvos-captura.test.ts` contra `importItemsPageSchema`. Campos novos opcionais não mudam essas leituras; um campo obrigatório quebraria as respostas fixas.
7. **Observação, fora deste Goal.** `importService` e `importCustomer` sempre criam um cadastro novo para item `PENDING`, inclusive `SERVICE_MATCH_EXACT` e `CUSTOMER_MATCH_EXACT` com valores iguais ("mesclável, sem fundir sozinha", Goal010), enquanto o vault pede deduplicar a duplicata claramente idêntica (perguntas 778 e 792). Mudar isso muda o que a execução grava e pede Goal e decisão próprios. Também fica para o 2.I6 a escolha de "usar os valores da Minha Agenda" num serviço existente, que nenhuma decisão de hoje faz (`MERGE_WITH_EXISTING` e `KEEP_EXISTING` só apontam o item para o cadastro).

## Escolhas de desenho desta passada

1. **Duas colunas aditivas em `ImportItem`**, numa migration nova do Scheduling, no padrão da do Goal062 (comentário no SQL, só `ALTER TABLE ... ADD COLUMN`, nenhuma tabela, índice, constraint ou linha existente muda):
   - `matchCandidateInternalIds JSONB` anulável: a lista de IDs de `candidateInternalIds` que a análise calculou, só em itens `SERVICE` e `CUSTOMER`; `NULL` em toda outra categoria e nas linhas anteriores à migration (o mesmo que "sem candidato gravado"; a próxima análise preenche);
   - `proposedService JSONB` anulável: `{ durationMinutes, priceType, price }` da origem, só em itens `SERVICE`, derivados pelas **mesmas** funções da execução (`knownPositiveDuration` e `resolvePrice`, exportadas ou movidas para um módulo comum, nunca copiadas); `NULL` em toda outra categoria.
   - O Developer usa `JSONB` anulável nas duas, como o Goal062, e registra em D-150 o motivo se escolher outra forma.
2. **A análise grava as duas** no `itemCreates` e no `itemUpdates` de item não resolvido, como já grava `proposedAvailability`. O item resolvido não muda (evidência 5).
3. **O novo conflito do serviço (pergunta 795).** Em `classifyService`, com exatamente um cadastro de mesmo nome (o caso de hoje de `SERVICE_MATCH_EXACT`), o item passa a `NEEDS_REVIEW` com `reasonCode` `SERVICE_MATCH_DIVERGENT`, `matchClass` `DIVERGENT`, o mesmo candidato e um `reasonDetail` em português sem dado da origem, quando:
   - a duração da origem é conhecida e diferente de `durationMinutes` do cadastro (cadastro sem duração conta como diferente); ou
   - o preço da origem é informado (`priceType` `FIXED`) e diferente do cadastro (preço do cadastro nulo ou `priceType` diferente de `FIXED` conta como diferente).
   Valor desconhecido da origem (duração ausente, preço ausente ou zero) **nunca** fabrica divergência. Com os valores iguais, continua `SERVICE_MATCH_EXACT` `PENDING`. `SERVICE_DURATION_MISSING` continua prevalecendo. Os outros motivos e status da evidência 5 não mudam. A comparação de preço é numérica, sobre o valor que o cadastro devolve no DTO (o `Decimal` convertido como `serviceDto` converte).
4. **A rota de itens** (`GET /internal/calendar/imports/:sessionId/categories/:category/items`, e por ela a do BFF) acrescenta, só nos itens das categorias `SERVICE` e `CUSTOMER`:
   - `candidates`: a lista dos cadastros cujos IDs estão em `matchCandidateInternalIds`, **lidos no momento da leitura, com `tenantId` do contexto na consulta**, na ordem gravada, omitindo o que não existe mais; lista vazia quando não há candidato gravado. Uma consulta por página e por categoria (`findMany` com `id: { in }` e `tenantId`), nunca uma por item. No serviço, cada candidato traz `internalId`, `name`, `durationMinutes`, `priceType`, `price` e `active`, com a forma de `serviceSchema`. No cliente, só `internalId` e `name`: nenhum telefone, nota ou outro dado pessoal do cadastro;
   - `proposedService`: só nos itens `SERVICE`, com a forma da escolha 1 (ou `null`).
   Nas outras categorias os dois campos ficam **ausentes**, como `currentAvailability`. `AVAILABILITY` não muda.
5. **Contrato aditivo** (`packages/public-api-contract`): os dois campos **opcionais** em `importItemSchema`, com schemas nomeados (por exemplo `importMatchCandidateSchema` e `importProposedServiceSchema`); a resposta de hoje, sem eles, continua válida, e as respostas fixas dos alvos 2.I8 e 2.I9 continuam passando sem mudança. O cliente do Scheduling no BFF (`apps/bff/src/clients/scheduling/index.ts`) recebe os mesmos campos, e `apps/bff/PUBLIC_API_V1.md` documenta os dois, como documenta `currentAvailability`. Nenhuma rota nova; nenhuma rota muda de caminho, método ou corpo de pedido.
6. **O que não muda.** A rota de decisão (`applyImportDecision`), inclusive a validação do alvo; a execução; a conclusão; o andamento; a seleção de categoria; o frontend inteiro (`apps/frontend/`), inclusive `targets.json` e `labels.ts`; a semente da captura e do gate.
7. **Decisão.** O Developer propõe **D-150**, por acréscimo, depois das provas, cobrindo: as duas colunas e a migration; o que a análise grava e quando; `SERVICE_MATCH_DIVERGENT` e a regra do valor desconhecido; os dois campos da rota, a leitura no momento e só do tenant, o candidato omitido e o cliente só com nome; o contrato aditivo; a observação da evidência 7; e que a tela e o 2.I6 ficam para a passada seguinte. D-079 e as decisões aceitas não são editadas.

## Escopo obrigatório

### 1. Scheduling (`apps/scheduling-service`)

1. `prisma/schema.prisma` e uma migration nova em `prisma/migrations/` (escolha 1).
2. `src/modules/migrations/import-preview-service.ts`: a gravação das duas colunas (escolha 2) e `SERVICE_MATCH_DIVERGENT` (escolha 3). `MatchableService` passa a carregar a duração e o preço do cadastro.
3. `src/modules/migrations/import-execution-service.ts`: só exportar ou mover `knownPositiveDuration` e `resolvePrice` para o módulo comum, sem mudar o comportamento.
4. `src/modules/internal-api/routes.ts`: só a rota de itens (escolha 4).

### 2. Contrato e BFF

1. `packages/public-api-contract/src/schemas.ts` (e a exportação dos tipos, se o pacote as listar à parte): a escolha 5.
2. `apps/bff/src/clients/scheduling/index.ts` e `apps/bff/PUBLIC_API_V1.md`: a escolha 5.

### 3. Provas

1. **Scheduling, unidade** (`apps/scheduling-service/tests/unit/goal136-*.test.ts`), com o banco falso já usado em `import-preview-service.test.ts`:
   - duração diferente dá `SERVICE_MATCH_DIVERGENT` `NEEDS_REVIEW` com o candidato; preço diferente também; cadastro sem duração com duração da origem conhecida também;
   - valores iguais continuam `SERVICE_MATCH_EXACT` `PENDING`; duração da origem ausente continua `SERVICE_DURATION_MISSING`; preço da origem ausente ou zero com a mesma duração continua `SERVICE_MATCH_EXACT`;
   - `SERVICE_MATCH_AMBIGUOUS`, `SERVICE_MATCH_SIMILAR` e os motivos de cliente da evidência 5 sem mudança;
   - a análise grava `matchCandidateInternalIds` e `proposedService` no item novo e no item não resolvido reanalisado, e não toca o item resolvido; `proposedService` nulo fora de `SERVICE`; `matchCandidateInternalIds` nulo fora de `SERVICE` e `CUSTOMER`;
   - `proposedService` igual ao que a execução gravaria para o mesmo registro (as mesmas funções).
2. **Scheduling, integração** (`apps/scheduling-service/tests/integration/goal136-*.test.ts`, PostgreSQL real, pelo passo `test:scheduling-integration` de `validate:integration`):
   - a migration aplicada: as duas colunas existem, anuláveis, e as linhas anteriores ficam `NULL`;
   - a rota de itens devolve `candidates` com os valores **atuais** do cadastro (editado depois da análise, a rota mostra o valor novo) e `proposedService`; omite o candidato apagado; devolve lista vazia sem candidato gravado;
   - **isolamento:** um ID de cadastro de **outro** negócio gravado à força em `matchCandidateInternalIds` nunca aparece em `candidates`;
   - o cliente candidato vem só com `internalId` e `name`;
   - `AVAILABILITY` e as outras categorias sem os campos novos, como hoje;
   - a decisão `KEEP_EXISTING` com o `internalId` de um candidato devolvido funciona como hoje.
3. **Contrato e BFF** (`packages/public-api-contract` não tem testes próprios): em `apps/bff/tests/goal136-*.test.ts`, um teste do schema do contrato (a resposta de hoje válida; os campos novos válidos; candidato malformado recusado) e um teste de integração do BFF no padrão de `tests/goal062-import.integration.test.ts`, que passa a resposta do Scheduling com os campos novos pelo schema do contrato.
4. **O que não muda no frontend:** os testes `goal135` (82) e a suíte do frontend passam sem nenhuma edição em `apps/frontend/`.
5. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) tirar `tenantId` da consulta dos candidatos faz o teste de isolamento reprovar;
   - (b) tratar a duração ausente da origem como diferente faz um teste de unidade reprovar;
   - (c) deixar de gravar `matchCandidateInternalIds` no `itemUpdates` faz um teste de unidade reprovar;
   - (d) devolver o telefone no candidato de cliente faz um teste reprovar;
   - (e) tornar `candidates` obrigatório no contrato faz um teste reprovar;
   - (f) dar `SERVICE_MATCH_DIVERGENT` com valores iguais faz um teste de unidade reprovar.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata**, conferida contra a saída bruta, e o `cmp` depois de reverter.
6. Os testes existentes continuam passando. Um ajuste num teste existente do Scheduling só troca o que este Goal muda (o serviço de mesmo nome com valores diferentes, que deixa de ser `SERVICE_MATCH_EXACT`); nenhum ajuste afrouxa asserção sobre status, decisão, execução ou isolamento. Cada ajuste é listado no relatório.

## Fora do escopo

- Qualquer arquivo em `apps/frontend/`, inclusive `ImportConflictsScreen.tsx`, `labels.ts`, `targets.json` e os testes do frontend. A escolha do candidato no lugar do campo de ID, a comparação na tela e o 2.I6 ficam para a passada seguinte.
- A rota de decisão, a execução (inclusive a deduplicação da evidência 7), a conclusão, o andamento, a seleção, a IA, a semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`).
- "Usar os valores da Minha Agenda" num serviço existente.
- Os quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3, 2.I6 e 4.3) e as observações abertas dos reviews 116 a 135.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-150** em `PROPOSED`, conforme a escolha 7. Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/DATA_MIGRATION.md`: a migration nova (aditiva, sem backfill, linhas antigas `NULL` até a próxima análise).
- `docs/migration/CURRENT_STATE.md`: o delta do Goal136.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal136, com as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core` e `validate:integration`, com `test:scheduling-integration`, `test:bff-integration` e as retentativas), a rodada de cada número, os controles negativos com a mensagem exata e a lista dos testes ajustados.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal136 na mesma rodada. Um gate rodado pelo IA Loop depois do relatório é registrado com o resultado dele, com o número, nunca como "pendente". O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Ler `classifyService`, `classifyCustomer`, `analyze`, a rota de itens, `applyImportDecision`, `knownPositiveDuration` e `resolvePrice`; listar os testes do Scheduling que afirmam `SERVICE_MATCH_EXACT`.
2. Migration, schema e a gravação na análise, com os testes de unidade.
3. A rota de itens, o contrato, o cliente do BFF e `PUBLIC_API_V1.md`, com os testes de integração e do contrato.
4. Os controles negativos do §3.5, revertidos.
5. A execução final, sobre a árvore completa: typecheck e lint do Scheduling e do BFF (o contrato é compilado por `build:public-api-contract`, em `validate:core`) (com o RTK ligado, lint por `rtk proxy`); os testes `goal136`; os testes `goal135` do frontend; `validate:core`; `validate:integration` (com `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis, num cluster PostgreSQL criado com `initdb` fora do repositório; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado); `git diff --check`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A análise grava, em cada item `SERVICE` e `CUSTOMER` novo ou não resolvido, os candidatos que calculou, e em cada item `SERVICE` a duração e o preço da origem derivados pelas mesmas funções da execução; o item resolvido não muda. Provado em unidade.
2. O serviço com um só cadastro de mesmo nome e duração ou preço da origem conhecidos e diferentes fica `SERVICE_MATCH_DIVERGENT` `NEEDS_REVIEW`; com valores iguais ou desconhecidos, nada muda; os outros motivos e status não mudam. Provado em unidade.
3. A rota de itens do Scheduling e a do BFF devolvem `candidates` (valores atuais, só do negócio, sem o que não existe mais, cliente só com nome) e `proposedService` nos itens `SERVICE` e `CUSTOMER`, e nada novo nas outras categorias. Provado em integração contra PostgreSQL, inclusive o isolamento.
4. A migration é aditiva (duas colunas anuláveis), passa pelos ensaios de `validate:integration` e não muda linha existente.
5. O contrato é aditivo: a resposta de hoje continua válida, e as respostas fixas dos alvos 2.I8 e 2.I9 passam sem mudança.
6. Nenhum arquivo em `apps/frontend/` mudou; os testes `goal135` e a suíte do frontend passam. A rota de decisão, a execução e a conclusão não mudaram.
7. Os seis controles negativos reprovam, com a mensagem exata registrada, e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
8. `validate:core` e `validate:integration` passam, com `test:scheduling-integration` e `test:bff-integration` contados.
9. Nenhum arquivo mudou fora destes: os do §1 e do §2; os testes em `apps/scheduling-service/tests/` e `apps/bff/tests/`; os quatro registros da seção "Documentação".
10. D-150 proposta, conforme a escolha 7.

## Plano de execução

1. **WU-01 — A análise grava a correspondência e o serviço divergente vira conflito.** Migration e schema, a gravação das duas colunas, `SERVICE_MATCH_DIVERGENT`, as funções comuns com a execução e os testes de unidade, com os ajustes dos testes existentes.
2. **WU-02 — O contrato e o BFF.** Os schemas opcionais, o cliente do Scheduling no BFF, `PUBLIC_API_V1.md` e os testes do contrato e do BFF.
3. **WU-03 — A rota de itens devolve candidatos e valores da origem.** A leitura no momento, só do tenant, uma consulta por página, e os testes de integração contra PostgreSQL, inclusive o isolamento; depois, os controles negativos.
4. **WU-04 a WU-11 — Verificação determinística:** typecheck e lint do Scheduling e do BFF; os testes alvo `goal136` do Scheduling e do BFF; `validate:core` (que roda a suíte do frontend, com os `goal135`) e `validate:integration`.
5. **WU-12 — Registros.** D-150, DATA_MIGRATION, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
6. **WU-13 — `git diff --check`.**
