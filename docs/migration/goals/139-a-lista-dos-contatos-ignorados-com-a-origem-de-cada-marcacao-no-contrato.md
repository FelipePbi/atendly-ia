# Goal 139 — A lista dos contatos ignorados, com a origem de cada marcação, no contrato

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal138 ACCEPTED](../reviews/138-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v163**, inserida depois do 138, sem renumerar nem remover ID. Origem: o quadro W3 ("Contatos que a IA nunca responde", `Mais-WhatsApp-Importacao-Conta.dc.html`) está fora de `targets.json` desde a v150 porque "a lista de contatos ignorados não tem leitura no contrato" ([D-118](../DECISIONS.md), divergência 5). Este Goal entrega **só o contrato** que o W3 pede, como o Goal136 fez para o 2.I6: nenhuma tela muda de aparência, e o W3 continua sem alvo até o Goal que o portar. Por isso não há linha de quadros do protótipo neste documento.

## Baseline aceita

Baseline aceita: `2eec1fcdbaf9c17d0e608d203f7ecc31d9e8525e`

Goal anterior: 138 — Os valores malformados da origem não derrubam a revisão da importação

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal138 já integrado em `main` (origem `18d71e557abec71df3ae1f1a31416e65d1798053`). Houve **uma rodada**, sem blocker. **D-152** foi aceita: a duração de serviço da origem que não é inteiro positivo é desconhecida, o preço negativo é não informado, e a rota de itens da importação nunca devolve um `proposedService` que o contrato recuse. O Goal138 não tocou a IA, o BFF, o contrato nem o banco. A última contagem aceita:

- frontend **201** arquivos e **2906** testes — Goal138;
- `visual-responses.test.mjs` **63** e `test:gate` **296** — Goal138;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal138;
- Scheduling: unidade **42** arquivos e **587** testes; integração **22** arquivos e **165** testes — Goal138;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal138;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa — Goal138.

As suítes da IA (`apps/ai-orchestrator`) e do BFF não têm contagem recente nos registros: o Developer as roda na baseline **antes de editar** e registra os números de partida.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o contrato passa a ler os contatos que a IA nunca responde, com o nome, o telefone, quando e onde cada um foi marcado, e "Remover" deixa de devolver à IA a conversa que já está aberta.** Tudo o que o W3 desenha passa a ter fonte, sem tela nova.

**Por que agora.** Com o Goal138, a importação do onboarding ficou sem defeito conhecido que não peça decisão de produto. Dos 13 quadros sem alvo, o W3 é o único cuja falta é só de contrato, sem pergunta de produto aberta: o vault manda que a pessoa possa cadastrar contatos que a IA nunca responde (`01-Regras/05-WhatsApp.md`, "Contatos ignorados"; perguntas 274, 275 e 750), e Configurações › WhatsApp inclui "contatos ignorados" (`03-UX-UI/04-Especificacao-das-Telas.md`). Hoje a pessoa marca, mas não vê quem está marcado nem consegue desmarcar quem marcou por telefone. Os outros quadros pedem decisão ou trabalho maior (motivos da v150 a v162 do MASTER_PLAN).

**Lições dos Goals 133 a 138, que valem aqui.**

1. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
2. O frontend resolve `@avenly-ia/public-api-contract` por `file:../../packages/public-api-contract`. Depois de mudar o contrato, o Developer reconstrói o pacote (`build:public-api-contract`) e reinstala a dependência no frontend e no BFF antes de usar os tipos novos, e registra o passo; isso não entra no diff.
3. Os testes de integração rodam contra PostgreSQL descartável (`AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL`); sem banco, eles são pulados, e o relatório diz quantos rodaram e onde. `validate:ui` roda sem `AI_TEST_DATABASE_URL` apontando para banco não migrado.
4. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".

## O que a evidência desta passada mostra

Conferido no código da baseline `2eec1fc`.

1. **O dado já existe.** `Contact` (`apps/ai-orchestrator/prisma/schema.prisma`) guarda `displayName`, `externalContactId` (o telefone normalizado), `ignored`, `ignoredAt`, `ignoredBy` e `ignoredSource`, com índice `[tenantId, ignored]` e a chave única `[tenantId, channelId, externalContactId]`. `displayName` vem do nome da conversa (`SessionService.resolveContext`).
2. **A escrita existe, a leitura não.** `PUT /internal/conversations/:id/ignore` grava `ignoredSource: "panel"`; `PUT /internal/contacts/ignore` (por telefone, com `upsert` no canal ativo de `resolveTenantEvolutionChannel`, que recusa com `CHANNEL_CONNECTION_NOT_FOUND`) grava `"onboarding"`. O BFF expõe as duas como `PUT /v1/conversations/:id/ignore` e `PUT /v1/conversations/ignored-contacts`. A única leitura é `GET /v1/conversations?ignored=true`, que lista **conversas**: o contato marcado por telefone sem conversa não aparece em lugar nenhum.
3. **A origem não diz onde a marcação foi feita.** O onboarding marca conversas por `setIgnored` (`OnboardingIgnoredContacts` em `apps/frontend/src/features/whatsapp/IgnoredContactsPanel.tsx`), que grava `"panel"`; Configurações marca telefone por `ignoreByPhone`, que grava `"onboarding"`. O W3 distingue "desde o início" (marcado no onboarding) de "marcada na conversa · 18/09": com o que se grava hoje, as duas legendas sairiam trocadas.
4. **"Remover" hoje devolve a conversa aberta à IA.** Desmarcar só limpa os campos do contato. A sessão aberta do contato continua com a categoria que tinha, e a próxima mensagem já pode ser respondida pela IA. O W3 diz o contrário: "Remover não apaga nada: a IA só volta a poder responder esse contato em uma nova conversa comercial." O mecanismo que cumpre a frase já existe: a decisão "só esta conversa" de D-129 (3), `setCategoryOverride` com `scope: "CONVERSATION"`, prevalece sobre a do contato (`resolveEffectiveCategory`), e a sessão `PERSONAL` barra a IA, a classificação, o modelo e a memória antes de tudo (`message-graph.ts`, a mesma guarda do contato ignorado). A sessão nova, depois da inatividade de D-009, nasce sem essa decisão.
5. **A saída de "Nunca responde" no chat é outra regra e fica como está.** Em D-130 (6), escolher Automático ou Sempre atende grava primeiro a categoria do contato e depois `{ ignored: false }` por `PUT /v1/conversations/:id/ignore`: ali a pessoa decide, na própria conversa, que a IA volta. A regra de "Remover" vale só para a rota por telefone.
6. **O escopo interno.** `requiredScope` (`apps/ai-orchestrator/src/modules/internal/routes.ts`) dá `conversations:write` a `PUT /internal/contacts/ignore`; uma rota nova sem linha ali cai em `internal:unmapped`.

## Escolhas de desenho desta passada

1. **A leitura.** `GET /internal/contacts/ignored` na IA e `GET /v1/conversations/ignored-contacts` no BFF. Lê os contatos com `ignored: true` do **canal ativo** do tenant (o mesmo `resolveTenantEvolutionChannel` da marcação por telefone, com a mesma recusa sem canal), porque é nesse canal que "Remover" por telefone grava. Consulta `limit` (1 a 200, padrão 100) e `offset` (≥ 0, padrão 0). Ordem: `ignoredAt` crescente, nulos por último, e `id` como desempate (o W3 mostra primeiro o que foi marcado no onboarding). Escopo `conversations:read` em `requiredScope`. No BFF, a rota estática convive com `GET /v1/conversations/:id`; o Developer prova que a estática vence e que `/v1/conversations/<id>` continua lendo a conversa.
2. **A forma.** `ignoredContactListSchema` no contrato: `{ items, total }`, com `total` o número de contatos ignorados do canal ativo. Cada item (`ignoredContactEntrySchema`): `contactId`, `externalContactId`, `displayName` (`string` anulável), `ignoredAt` (data e hora ISO, anulável) e `origin` (`"ONBOARDING" | "CONVERSATION" | "SETTINGS"`, anulável). `ignoredContactSchema`, a resposta do `PUT` por telefone, não muda.
3. **A origem na escrita.** Os dois `PUT` aceitam `origin`, **opcional**, e quem não manda grava o mesmo de hoje:
   - `PUT /v1/conversations/:id/ignore`: `origin` `"ONBOARDING" | "CONVERSATION"`, padrão `"CONVERSATION"`;
   - `PUT /v1/conversations/ignored-contacts`: `origin` `"ONBOARDING" | "SETTINGS"`, padrão `"ONBOARDING"`.

   O valor gravado em `ignoredSource` continua texto livre e sem migration: `"onboarding"` para `ONBOARDING`, `"panel"` para `CONVERSATION` (o valor de hoje) e `"settings"` para `SETTINGS`. A leitura faz o caminho inverso, e qualquer outro valor gravado vira `origin: null`. Com `ignored: false`, `origin` é aceito e não grava nada.
4. **Os consumidores do frontend mandam a origem certa.** `BffConversationService.setIgnored` e `ignoreByPhone` ganham o parâmetro `origin`, opcional, e um método novo, `listIgnoredContacts({ limit?, offset? })`, com o schema da rota. `OnboardingIgnoredContacts` manda `ONBOARDING` nas duas marcações; `IgnoredContactsPanel` (a folha de Configurações) manda `SETTINGS` no telefone e `CONVERSATION` na conversa; o chat (`ConversationThread`, `ConversationContextPanel`) não muda e fica no padrão. Nenhum texto, layout ou estado de tela muda.
5. **"Remover" mantém a conversa aberta fora da IA.** Em `PUT /internal/contacts/ignore` com `ignored: false`, quando o contato estava ignorado, a IA, além de limpar os campos do contato, grava em cada sessão **aberta e não expirada** das conversas desse contato a decisão "só esta conversa" `PERSONAL`, pelo mesmo caminho de `setCategoryOverride` com `scope: "CONVERSATION"` e com o autor do pedido. A sessão expirada ou encerrada não muda, e o contato que não estava ignorado não muda nada. A próxima sessão nasce sem a decisão e segue a classificação de sempre: é a "nova conversa comercial" da frase do W3. `PUT /internal/conversations/:id/ignore` (o chat, D-130 (6)) **não** ganha essa regra.
6. **Fora da IA e do BFF, nada muda.** Nenhuma migration, nenhum backfill, nenhuma regra nova de classificação, nenhuma tela nova. O W3 e a segunda linha do W1 ("Mãe, Dudu") ficam para o Goal que portar o quadro.
7. **Decisão.** O Developer propõe **D-153** com as escolhas 1 a 6: a leitura, a forma, a origem na escrita e na leitura, os consumidores do frontend e a regra de "Remover". Se o número já estiver tomado, use o próximo livre e explique. D-118, D-129 e D-130 não são editadas; D-153 diz que a causa da divergência 5 de D-118 deixou de existir no contrato, sem mudar a tela.

## Escopo obrigatório

### 1. IA (`apps/ai-orchestrator/src`)

- `modules/internal/routes.ts`: `GET /internal/contacts/ignored` (escolhas 1 e 2); `origin` nos dois `PUT` (escolha 3); a linha de `requiredScope`.
- `modules/session/SessionService.ts`: a leitura dos contatos ignorados do canal, a origem gravada e a regra de "Remover" (escolhas 1, 3 e 5).

### 2. Contrato e BFF

- `packages/public-api-contract/src/schemas.ts` e `routes.ts`: `ignoredContactListSchema`, `ignoredContactEntrySchema`, o tipo exportado e a rota `GET /v1/conversations/ignored-contacts`.
- `apps/bff/src/modules/conversations/routes.ts`: a rota de leitura e `origin` nos dois corpos de `PUT`.
- `apps/bff/src/clients/ai-orchestrator/index.ts`: o cliente da leitura, com o schema da resposta, e `origin` repassado nas duas escritas.
- `apps/bff/PUBLIC_API_V1.md`: a rota nova e o campo `origin` nas duas rotas de escrita.

### 3. Frontend (`apps/frontend/src`), só dados

- `data/services/BffConversationService.ts` (e a interface do serviço de conversas, se ela declarar os métodos): `listIgnoredContacts` e `origin` (escolha 4).
- `features/whatsapp/IgnoredContactsPanel.tsx`: só o argumento `origin` nas chamadas (escolha 4).

### 4. Provas

1. **IA, unidade** (`apps/ai-orchestrator/tests/**/goal139-*.test.ts`, no estilo de `tests/internal/ignored-contacts.routes.test.ts`):
   - a leitura devolve só os ignorados do canal ativo do tenant (um contato ignorado de outro tenant e um de outro canal do mesmo tenant ficam fora), na ordem da escolha 1, com `total`, `limit` e `offset`; sem canal ativo, a mesma recusa da marcação por telefone; o escopo `conversations:read`;
   - o mapeamento da origem nos dois sentidos, inclusive `ignoredSource` desconhecido dando `null`; sem `origin`, os dois `PUT` gravam o mesmo de hoje;
   - "Remover" pela rota por telefone: a sessão aberta e não expirada fica `PERSONAL` com decisão da conversa; a expirada não muda; contato que não estava ignorado não muda; desmarcar pela rota da conversa não grava categoria nenhuma.
2. **IA, integração** (`apps/ai-orchestrator/tests/integration/goal139-*.test.ts`, contra PostgreSQL descartável): marcar no onboarding por telefone, marcar uma conversa, marcar por telefone em Configurações e ler a lista com as três origens e as datas; depois "Remover" um contato com sessão aberta e mostrar que a guarda de envio (`SessionService.evaluate`) recusa a IA nessa sessão e que uma sessão nova do mesmo contato, depois de expirar a anterior, não herda a decisão.
3. **BFF** (`apps/bff/tests/goal139-*.test.ts`, e `.integration.test.ts` se usar banco): a rota de leitura com a resposta validada pelo contrato; `GET /v1/conversations/<id>` continua chegando à conversa; `origin` repassado nas duas escritas e ausente quando não vem; `origin` fora do enum recusado com 400 antes de chegar à IA.
4. **Contrato:** `findPublicApiRoute("GET", "/v1/conversations/ignored-contacts")` devolve a rota nova; o schema aceita item com `displayName`, `ignoredAt` e `origin` nulos e recusa `origin` fora do enum.
5. **Frontend** (`apps/frontend/tests/goal139-*.test.ts` ou `.tsx`): `listIgnoredContacts` monta a consulta e valida a resposta; `OnboardingIgnoredContacts` manda `ONBOARDING` nas duas marcações; `IgnoredContactsPanel` manda `SETTINGS` no telefone e `CONVERSATION` na conversa; o chat continua sem `origin`. Os testes existentes (`goal106-whatsapp`, os do onboarding e os do chat) passam sem ajuste de expectativa; se algum precisar mudar, o relatório diz qual, por quê e mostra que só a forma mudou.
6. **Controles negativos**, depois da última edição de código, cada um reprovando o teste indicado, com a mensagem exata registrada e revertido com `cmp` igual ao backup:
   - (a) a leitura sem o filtro de canal;
   - (b) a leitura sem o filtro de tenant;
   - (c) `"panel"` lido como `ONBOARDING`;
   - (d) o padrão de `origin` do `PUT` por telefone trocado para `SETTINGS`;
   - (e) "Remover" sem gravar a decisão da sessão;
   - (f) a regra de "Remover" aplicada também à rota da conversa;
   - (g) a linha de `requiredScope` da rota nova removida;
   - (h) `OnboardingIgnoredContacts` sem `origin` na marcação da conversa.

## Fora do escopo

- Portar o W3 ou mudar o W1, a folha de contatos ignorados, o onboarding ou o chat em texto, layout ou estado; qualquer entrada de `targets.json` e qualquer `visual:compare`.
- Migration, backfill ou reescrita de `ignoredSource` já gravado; marcação em lote; busca na lista.
- A saída de "Nunca responde" no chat (D-130 (6)), as categorias do contato e da sessão fora da regra de "Remover", a expiração de sessão (D-009).
- Os pendentes do review138: `SERVICE_PRICE_NOT_INFORMED` para preço negativo, o leitor do calendário (`import-source-reader.ts`), `CUSTOMER_PHONE_SHARED` em revisão, a deduplicação da duplicata idêntica e "usar os valores da Minha Agenda" (D-150, item 8).
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, H6, NT3 e 4.3) e as observações abertas dos reviews 116 a 138.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-153** em `PROPOSED`, conforme a escolha 7.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal139.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal139, com as contagens de partida da IA e do BFF, as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número, quantos testes de integração rodaram contra banco e onde, e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal139 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Rodar, na baseline `2eec1fc`, as suítes de unidade da IA e do BFF e registrar os números de partida.
2. Implementar a IA (escolhas 1, 3 e 5) com os testes do §4.1 e do §4.2.
3. Implementar o contrato e o BFF (escolhas 1 a 3), reconstruir o pacote do contrato e reinstalar a dependência, com os testes do §4.3 e do §4.4.
4. Implementar os consumidores do frontend (escolha 4) com os testes do §4.5.
5. Rodar os controles negativos do §4.6 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint da IA, do BFF e do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes de unidade da IA, do BFF e do frontend;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `GET /v1/conversations/ignored-contacts` devolve os contatos ignorados do canal ativo do tenant, e só eles, com nome, telefone, data e origem, na ordem e na paginação da escolha 1; outro tenant e outro canal nunca aparecem. Provado na unidade e na integração da IA e no BFF.
2. A origem gravada e lida segue a escolha 3; quem não manda `origin` grava o mesmo de antes; valor antigo desconhecido volta `null`.
3. O onboarding grava `ONBOARDING`, a folha de Configurações grava `SETTINGS` no telefone e `CONVERSATION` na conversa, e o chat continua no padrão, sem mudança de tela.
4. "Remover" pela rota por telefone deixa a sessão aberta do contato fora da IA (`PERSONAL` só nesta conversa), e a sessão seguinte não herda a decisão; a rota da conversa (D-130 (6)) continua devolvendo a IA na hora. Provado na integração da IA, contra banco.
5. `GET /v1/conversations/<id>` continua lendo a conversa; o contrato encontra a rota nova; `origin` fora do enum é recusado com 400.
6. Os oito controles negativos reprovam, com a mensagem exata registrada, e foram revertidos. Os testes existentes continuam passando.
7. `validate:ui` (overflow horizontal, alvo de toque de 24 px, contraste computado, foco visível e `prefers-reduced-motion` nas cinco larguras), `validate:core`, `validate:integration` com o gate autenticado e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os do §1, do §2 e do §3; `apps/ai-orchestrator/tests/`, `apps/bff/tests/`, `apps/frontend/tests/` e os testes do contrato, se houver; os três registros da seção "Documentação".
9. D-153 proposta, conforme a escolha 7.

## Plano de execução

1. **WU-01 — A leitura, a origem e "Remover" na IA.** Rota, `requiredScope`, `SessionService`, testes `goal139` de unidade e de integração e os controles (a), (b), (c), (e), (f) e (g).
2. **WU-02 — O contrato e o BFF.** Schemas, rota do contrato, rotas e cliente do BFF, `PUBLIC_API_V1.md`, testes `goal139` do BFF e do contrato e o controle (d).
3. **WU-03 — Os consumidores do frontend.** `BffConversationService`, as chamadas com `origin`, os testes `goal139` do frontend e o controle (h).
4. **WU-04 a WU-17 — Verificação determinística:** typecheck, lint e testes alvo `goal139` da IA, do BFF e do frontend; suíte do frontend e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
5. **WU-18 — Registros.** D-153, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
6. **WU-19 — `git diff --check`.**
