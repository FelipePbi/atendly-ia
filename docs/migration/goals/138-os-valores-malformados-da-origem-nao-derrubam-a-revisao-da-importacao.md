# Goal 138 — Os valores malformados da origem não derrubam a revisão da importação

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal137 ACCEPTED](../reviews/137-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.I6

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v162**, inserida depois do 137, sem renumerar nem remover ID. Origem: a pendência 1 do [review136](../reviews/136-review.md) ("Valores malformados da origem"), que o Goal137 deixou explicitamente fora do escopo ("a tela só mostra o que o contrato aceita"), e as pendências não bloqueantes 1 e 2 do [review137](../reviews/137-review.md). A tela de conflitos não muda de aparência: o quadro 2.I6 entra aqui como **prova de regressão**, porque o Goal mexe em `ImportConflictsScreen.tsx` e nas `notes` do alvo 2.I6.

## Baseline aceita

Baseline aceita: `a32c52bf7bc12566f68ed7b789e6c55c5ef84133`

Goal anterior: 137 — Os conflitos da importação do onboarding iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal137 já integrado em `main` (origem `019f4979e0b080cf08582d0b4be865a3e21d455a`). Houve **uma rodada**, sem blocker. **D-151** foi aceita: `ImportConflictsScreen` ficou como o 2.I6, uma lista única de cartões, um aberto por vez, com a decisão no próprio cartão sobre o candidato que a análise sugeriu e sem identificador digitado; o alvo 2.I6 entrou em `targets.json` (100 alvos). O Goal137 não tocou o Scheduling, o BFF, o contrato nem o banco. A última contagem aceita:

- frontend **200** arquivos e **2897** testes, `goal137` **78** (2 arquivos) — Goal137;
- `visual-responses.test.mjs` **63** e `test:gate` **296** — Goal137;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal137;
- Scheduling: unidade **41** arquivos e **571** testes; integração **21** arquivos e **161** testes — Goal136 (o Goal137 não tocou o Scheduling);
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal137;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa — Goal137.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **nenhum valor de duração ou de preço que a origem mande derruba a página de itens da importação nem faz um item falhar na execução por ser malformado.** A duração de serviço que não é um inteiro positivo de minutos é tratada como duração desconhecida, e o preço negativo como preço não informado, nos dois sentidos em que já se trata o valor ausente: na análise (classificação e `proposedService`) e na execução (o cadastro criado). A rota de itens também deixa de devolver um `proposedService` que o contrato recusaria, mesmo para os itens que uma análise anterior a este Goal já gravou. No frontend, só as duas correções não bloqueantes do review137; a tela continua igual ao 2.I6.

**Por que agora.** Com o 2.I6 aceito, a tela de conflitos lê `proposedService` em cada página de itens de `SERVICE`. Um único serviço da origem com duração fracionária (por exemplo, `47.5`) ou preço negativo grava um `proposedService` que `importProposedServiceSchema` recusa (`durationMinutes` inteiro positivo, `price` não negativo). O BFF valida a resposta inteira e devolve 502, e a tela mostra "Não foi possível carregar todos os itens agora." ou o `StatePanel` "Itens indisponíveis" para a categoria inteira: a pessoa não consegue decidir nenhum serviço em revisão por causa de um valor que nem aparece. Na execução, o mesmo valor faz `AvenlyServiceService.create` recusar o cadastro (`Number.isInteger(durationMinutes)` e `price >= 0`), e o item termina `FAILED`, quando o vault manda tratar o valor que não serve como ausente ("sem preço: `Sem preço informado`"; "sem duração: `Precisa de revisão`", `06-Importacao-Minha-Agenda.md`). É o único defeito de comportamento conhecido no fluxo da importação que não pede decisão de produto, e cada quadro restante sem alvo depende de decisão ou fica fora do frontend (motivos da v150 a v161 do MASTER_PLAN).

**Lições dos Goals 133 a 137, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
3. Cada controle de `targets.json` roda pelos **dois** testes: o do Goal e `scripts/tests/visual-responses.test.mjs`.
4. O frontend resolve `@avenly-ia/public-api-contract` por `file:../../packages/public-api-contract`. Se o tipo do contrato no frontend estiver desatualizado, o Developer reconstrói o pacote (`build:public-api-contract`) e reinstala a dependência antes de editar, e registra o passo; isso não entra no diff.
5. Os testes de integração do Scheduling rodam contra PostgreSQL descartável (`SCHEDULING_TEST_DATABASE_URL`); sem banco, eles são pulados, e o relatório diz quantos rodaram e onde.

## O que a evidência desta passada mostra

Conferido no código da baseline `a32c52b`.

1. **Os valores da origem.** `apps/scheduling-service/src/modules/migrations/import-source-values.ts` tem `knownNumber` (número finito), `knownPositiveDuration` (finito e maior que zero, **aceita fração**), `resolvePrice` (ausente ou zero viram `NOT_INFORMED`/`null`; **qualquer outro número finito, inclusive negativo, vira `FIXED`**) e `proposedServiceFrom` (a soma dos dois, gravada em `ImportItem.proposedService`). O schema da origem (`minhaAgendaServiceSchema`, `integrations/minha-agenda/types.ts`) só exige `duration: z.number()` e `price: z.number()`, então `47.5` e `-10` passam.
2. **A análise.** `classifyService` (`import-preview-service.ts`) lê a duração por `asPositiveNumber`, outra função, não pelas de `import-source-values.ts`: a duração fracionária conta como conhecida e o serviço não cai em `SERVICE_DURATION_MISSING`. `serviceValuesDiverge` usa `knownPositiveDuration` e `resolvePrice`; `proposedServiceFrom` é chamada na gravação do item (`import-preview-service.ts`, perto da linha 606).
3. **A rota de itens.** `proposedServiceDto` (`internal-api/routes.ts`, perto da linha 2513) relê o JSON gravado e copia `durationMinutes` e `price` se forem `number`, sem conferir inteiro, sinal ou finitude. O contrato (`importProposedServiceSchema`, `packages/public-api-contract/src/schemas.ts`) recusa fração em `durationMinutes` e negativo em `price`; o BFF valida a página inteira pelo contrato e responde 502 se um item falhar.
4. **A execução.** `importService` (`import-execution-service.ts`) cria o serviço com `knownPositiveDuration` e `resolvePrice`; `AvenlyServiceService.create` recusa duração não inteira ou não positiva e preço negativo com `FIXED`, e o item falha. `appointmentServices` usa as mesmas funções para o retrato do serviço no atendimento (`AppointmentItem.durationMinutesSnapshot Int?` e `priceSnapshot Decimal(12,2)`): a duração fracionária quebra a gravação do atendimento inteiro. `resolveInterval` usa `knownPositiveDuration(appointment.duration)` para o **intervalo** do atendimento, que aceita fração de minuto sem problema.
5. **O leitor do calendário.** `integrations/minha-agenda/import-source-reader.ts` tem uma cópia própria de `knownNumber` e `knownPositiveDuration` e um `toCalendarService` que dá `FIXED` a preço negativo; ele serve `listServices` do provedor de calendário (`routes.ts`, perto da linha 1429), não a importação única. **Fora deste Goal.**
6. **A tela.** Em `ImportConflictsScreen.tsx`, `settle` só incrementa `decidedSince` quando a decisão é aceita (`record.kind === "decided"`). Com `IMPORT_ITEM_ALREADY_DECIDED` (`record.kind === "already"`), o item também saiu da fila, mas `hasMore` (`undecidedLoaded(category) < read.total - read.decidedSince`) continua contando com ele, e "Carregar mais" pode aparecer sem item restante (review137, pendência 2).
7. **As `notes` do 2.I6.** As `notes` do alvo 2.I6 em `apps/frontend/e2e/visual/targets.json` declaram a `ReplaceAccountZone` abaixo do rodapé como divergência, e `apps/frontend/tests/goal137-alvo-captura.test.ts` exige a palavra. No modo de conflitos, `ImportPreviewScreen` devolve só `ImportConflictsScreen`, e a zona não aparece: é uma divergência inexistente (review137, pendência 1).

## Escolhas de desenho desta passada

1. **Uma função para a duração de serviço.** `import-source-values.ts` ganha `knownServiceDuration(value: unknown): number | null`, que devolve o valor só quando é número finito, **inteiro** e maior que zero, e `null` em qualquer outro caso. Ela passa a ser a **única** leitura de duração de serviço da origem na importação: `proposedServiceFrom`; `serviceValuesDiverge` e `classifyService` (no lugar de `asPositiveNumber` para a duração; se `asPositiveNumber` ficar sem consumidor, sai); `importService`; e as três leituras de `durationMinutes` em `appointmentServices`. Não arredondar: `47.5` vira desconhecida, nunca `47` ou `48` (duração fabricada, DATA-09). `knownPositiveDuration` **continua** como está e só em `resolveInterval`, porque o intervalo de um atendimento aceita fração de minuto.
2. **O preço negativo é preço não informado.** `resolvePrice` passa a devolver `{ priceType: "NOT_INFORMED", price: null }` também para número negativo, como já faz para ausente e zero; o comentário da função diz por quê. Vale para todos os consumidores de `resolvePrice` (o serviço, `proposedService`, `serviceValuesDiverge` e o retrato do preço no atendimento). Nenhuma outra regra de preço muda (o preço com mais de duas casas continua como hoje).
3. **A consequência na análise, que é a regra de antes aplicada ao valor que não serve.** O serviço com duração fracionária, zero, negativa ou não finita passa a `SERVICE_DURATION_MISSING` `NEEDS_REVIEW`, como o serviço sem duração, mantendo os candidatos que `classifyService` já calcula. O preço negativo nunca diverge (`serviceValuesDiverge` já trata `NOT_INFORMED` como valor desconhecido da origem). `proposedService` é gravado com `durationMinutes: null` e `NOT_INFORMED`/`null` nesses casos.
4. **A consequência na execução.** O serviço da origem com duração malformada é criado com `durationMinutes: null` e `reviewOrigin: "IMPORT"` ("Precisa de revisão"), e com preço negativo, como `NOT_INFORMED` ("Sem preço informado"); o item termina `IMPORTED`, não `FAILED`. O retrato do serviço no atendimento grava `durationMinutesSnapshot` nulo e `priceTypeSnapshot` `NOT_INFORMED` nesses casos, e o atendimento é importado. Nada muda para valor bem formado: o Developer prova que serviço e atendimento com duração inteira e preço não negativo gravam o mesmo de antes.
5. **A rota de itens nunca devolve o que o contrato recusa.** `proposedServiceDto` aplica, na leitura, a mesma regra: `durationMinutes` só se for inteiro positivo, senão `null`; `priceType` `FIXED` com `price` só se `price` for número finito não negativo, senão `NOT_INFORMED` com `price: null`. Isso cobre os itens que uma análise anterior a este Goal gravou: **sem migration, sem backfill e sem reanálise**. O contrato, o BFF e `PUBLIC_API_V1.md` não mudam.
6. **"Carregar mais" depois de `IMPORT_ITEM_ALREADY_DECIDED`.** `settle` incrementa `decidedSince` também quando `record.kind === "already"`: o item saiu da fila do mesmo jeito. O `offset` de `loadMore` continua sendo `undecidedLoaded(category)`. Nenhuma outra regra da tela muda (D-151 itens 2 a 8).
7. **As `notes` do 2.I6.** O trecho que declara a `ReplaceAccountZone` sai das `notes` do 2.I6 em `targets.json`, e `"ReplaceAccountZone"` sai da lista de divergências exigidas em `goal137-alvo-captura.test.ts`. As outras `notes` e as respostas fixas do 2.I6 não mudam, nem as `notes` de outro alvo.
8. **Decisão.** O Developer propõe **D-152** com as escolhas 1 a 7: a duração de serviço inteira positiva, o preço negativo como não informado, as consequências na análise e na execução, a leitura defensiva na rota e as duas correções da tela. Se o número já estiver tomado, use o próximo livre e explique. D-150 e D-151 não são editadas.

## Escopo obrigatório

### 1. Scheduling (`apps/scheduling-service/src`)

- `modules/migrations/import-source-values.ts`: `knownServiceDuration` e `resolvePrice` (escolhas 1 e 2).
- `modules/migrations/import-preview-service.ts`: `classifyService` e `serviceValuesDiverge` com `knownServiceDuration` (escolhas 1 e 3).
- `modules/migrations/import-execution-service.ts`: `importService` e `appointmentServices` com `knownServiceDuration`; `resolveInterval` sem mudança (escolhas 1 e 4).
- `modules/internal-api/routes.ts`: `proposedServiceDto` (escolha 5).

### 2. Frontend (`apps/frontend`)

- `src/features/imports/ImportConflictsScreen.tsx`: `settle` (escolha 6).
- `e2e/visual/targets.json`: só as `notes` do 2.I6 (escolha 7).

### 3. Provas

1. **Unidade do Scheduling** (`apps/scheduling-service/tests/unit/goal138-import-source-values.test.ts`, nome livre com o prefixo `goal138`):
   - `knownServiceDuration`: inteiro positivo passa; `47.5`, `0`, `-30`, `NaN`, `Infinity`, texto e ausente dão `null`;
   - `resolvePrice`: `-10` e `-0.01` dão `NOT_INFORMED`/`null`; `0` e ausente como antes; `90` e `89.9` como antes (`FIXED`);
   - `proposedServiceFrom` com duração fracionária e preço negativo devolve um objeto que `importProposedServiceSchema` aceitaria (o Scheduling não importa o pacote do contrato: a regra do schema afirmada campo a campo, sem adicionar dependência);
   - a análise: o serviço com duração fracionária sai `SERVICE_DURATION_MISSING` `NEEDS_REVIEW`, com os candidatos de mesmo nome preservados; o serviço com preço negativo e um cadastro de mesmo nome com a mesma duração **não** vira `SERVICE_MATCH_DIVERGENT`;
   - a execução: o serviço com duração fracionária é criado com duração nula e `reviewOrigin` `IMPORT`, e o de preço negativo como `NOT_INFORMED`, com o item `IMPORTED`; o retrato do atendimento com serviço de duração fracionária ou preço negativo grava nulo e `NOT_INFORMED`; `resolveInterval` com `appointment.duration` fracionária continua usando a duração (sem cair no `endTime`);
   - os testes de unidade existentes (`goal136-import-match`, `import-preview-service`, `import-execution-service` e os demais) passam sem ajuste de expectativa; se algum precisar mudar, o relatório diz qual, por quê e mostra que só a forma mudou.
2. **Integração do Scheduling** (`apps/scheduling-service/tests/integration/goal138-*.test.ts`, contra PostgreSQL descartável):
   - um `ImportItem` com `proposedService` gravado **à força** como `{ durationMinutes: 47.5, priceType: "FIXED", price: -10 }` (a forma de uma análise anterior a este Goal) volta na rota de itens como `{ durationMinutes: null, priceType: "NOT_INFORMED", price: null }`; os outros itens da mesma página não mudam. O Scheduling não importa o pacote do contrato hoje: a prova afirma, em cada `proposedService` da página, a regra de `importProposedServiceSchema` campo a campo (inteiro positivo ou nulo; `price` finito não negativo ou nulo, e nulo fora de `FIXED`), sem adicionar dependência;
   - uma análise com um serviço da origem de duração fracionária e outro de preço negativo grava `proposedService` aceito pelo contrato, e a execução importa os dois (os dois itens `IMPORTED`, nenhum `FAILED`), com os cadastros da escolha 4.
3. **Frontend** (`apps/frontend/tests/goal138-*.test.tsx` ou `.test.ts`):
   - depois de um `IMPORT_ITEM_ALREADY_DECIDED` no último item que faltava de uma categoria com `total` igual aos itens lidos, "Carregar mais" não aparece; com mais itens na fila, aparece e lê a página seguinte com o `offset` certo; nas duas molduras;
   - as `notes` do 2.I6 não citam `ReplaceAccountZone`, e as demais divergências exigidas pelo `goal137-alvo-captura.test.ts` continuam;
   - no modo de conflitos, a `ReplaceAccountZone` não é renderizada (a afirmação que tornava a nota inexistente).
4. **Controles negativos**, depois da última edição de código, cada um reprovando o teste indicado, com a mensagem exata registrada e revertido com `cmp` igual ao backup:
   - (a) `knownServiceDuration` voltando a aceitar fração;
   - (b) `resolvePrice` voltando a dar `FIXED` a negativo;
   - (c) `classifyService` voltando a `asPositiveNumber`;
   - (d) `proposedServiceDto` voltando a copiar qualquer `number`;
   - (e) `resolveInterval` trocado para `knownServiceDuration` (o teste do intervalo fracionário reprova);
   - (f) `settle` voltando a incrementar só em `decided`;
   - (g) a frase da `ReplaceAccountZone` de volta às `notes` do 2.I6 (pelos dois testes da captura, lição 3).
5. **Fidelidade e regressão visual.** Três capturas da baseline `a32c52b` do 2.I6 antes de editar; depois das edições, `npm run visual:compare -- --target 2.I6`, os quatro `side-by-side.png` abertos e o `app.png` dos quatro devices comparado contra as três capturas da baseline, na tabela por imagem. A tela tem de continuar **igual ao quadro 2.I6 nos 4 devices**, com as mesmas divergências declaradas em D-151 (menos a `ReplaceAccountZone`, que nunca apareceu).

## Fora do escopo

- O contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), o BFF, a IA, o banco (nenhuma migration), a semente da captura e do gate.
- O leitor do calendário (`import-source-reader.ts`, evidência 5) e `serviceSchema` das rotas de Serviços.
- Arredondar duração ou preço; limitar o preço ao que `Decimal(12,2)` guarda; o preço com mais de duas casas.
- Pôr `CUSTOMER_PHONE_SHARED` em revisão com candidato (D-151, item 14), a deduplicação da duplicata idêntica e "usar os valores da Minha Agenda" num serviço existente (D-150, item 8): pedem decisão própria (ver a v162 do MASTER_PLAN).
- Qualquer mudança visual ou de texto na tela de conflitos, na prévia, no andamento, nas pendências e na conclusão; qualquer outro alvo de `targets.json`.
- Os quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3) e as outras observações abertas dos reviews 116 a 137.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-152** em `PROPOSED`, conforme a escolha 8, com o antes e o depois de cada consumidor de `knownServiceDuration` e `resolvePrice`, e o que muda no que a execução grava.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal138.
- `docs/migration/DATA_MIGRATION.md`: uma nota por acréscimo no fim da seção da importação (§26, a de `ImportItem.proposedService`), dizendo que duração de serviço não inteira e preço negativo da origem são tratados como ausentes.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal138, com as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número, os controles negativos com a mensagem exata, quantos testes de integração do Scheduling rodaram contra banco e o `visual:compare` do 2.I6 com a tabela por imagem.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal138 na mesma rodada. Um gate rodado pelo IA Loop depois do relatório é registrado com o resultado dele, com o número, nunca como "pendente". O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Montar a pilha descartável própria e capturar **três vezes**, na baseline `a32c52b`, o `app.png` do 2.I6; medir o ruído entre as três, por imagem.
2. Implementar o Scheduling (escolhas 1 a 5) com os testes de unidade e de integração do §3.
3. Implementar as duas correções do frontend (escolhas 6 e 7) com os testes do §3.
4. Rodar o `visual:compare` do 2.I6, abrir os quatro lados a lados e comparar com as três capturas da baseline.
5. Rodar os controles negativos do §3.4 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do Scheduling e do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes de unidade do Scheduling e do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. Duração de serviço da origem que não é inteiro positivo é desconhecida em toda a importação (análise, `proposedService`, divergência, execução e retrato do atendimento), sem arredondar; o intervalo do atendimento continua aceitando fração. Provado pelos testes de unidade e de integração do §3.
2. Preço negativo da origem é `NOT_INFORMED`/`null` em todos os consumidores de `resolvePrice`; ausente, zero e preço positivo como antes.
3. A rota de itens nunca devolve `proposedService` que `importProposedServiceSchema` recuse, inclusive para item gravado antes deste Goal, sem migration nem backfill; provado na integração do Scheduling pela regra do schema, campo a campo.
4. A execução importa o serviço e o atendimento com valores malformados (item `IMPORTED`, não `FAILED`), com os cadastros da escolha 4; valores bem formados gravam o mesmo de antes.
5. "Carregar mais" não aparece sem item restante depois de `IMPORT_ITEM_ALREADY_DECIDED`, nas duas molduras; as `notes` do 2.I6 sem a `ReplaceAccountZone`, provado pelos dois testes da captura.
6. A tela de conflitos continua igual ao quadro 2.I6 nos 4 devices, com as divergências de D-151: `visual:compare --target 2.I6` com os quatro lados a lados abertos, e o `app.png` dos quatro devices igual por `cmp` a uma das três capturas da baseline ou dentro do ruído medido entre elas.
7. Os sete controles negativos reprovam, com a mensagem exata registrada, e foram revertidos. Os testes existentes continuam passando.
8. No gate autenticado de `validate:integration`, `/onboarding/importacao` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440); `validate:ui` (overflow horizontal, alvo de toque de 24 px, contraste computado, foco visível e `prefers-reduced-motion` nas cinco larguras), `validate:core` e `test:gate` passam.
9. Nenhum arquivo mudou fora destes: os do §1 e do §2; `apps/scheduling-service/tests/`, `apps/frontend/tests/` e `scripts/tests/visual-responses.test.mjs` (só se um controle exigir); os quatro registros da seção "Documentação".
10. D-152 proposta, conforme a escolha 8.

## Plano de execução

1. **WU-01 — Os valores da origem no Scheduling.** `knownServiceDuration`, `resolvePrice`, `classifyService`, `serviceValuesDiverge`, `importService`, `appointmentServices` e `proposedServiceDto`, com os testes `goal138` de unidade e de integração e os controles (a) a (e).
2. **WU-02 — As duas correções da tela e a regressão do 2.I6.** As três capturas da baseline, `settle`, as `notes` do 2.I6, os testes `goal138` do frontend, o ajuste de `goal137-alvo-captura.test.ts`, os controles (f) e (g), o `visual:compare` do 2.I6 e a tabela por imagem.
3. **WU-03 a WU-13 — Verificação determinística:** typecheck, lint e testes alvo `goal138` do Scheduling e do frontend; suíte do frontend e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
4. **WU-14 — Registros.** D-152, CURRENT_STATE, DATA_MIGRATION e VALIDATION_GATE, com os números da verificação determinística.
5. **WU-15 — `git diff --check`.**
