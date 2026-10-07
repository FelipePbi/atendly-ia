# Goal 141 — "Remover" um contato ignorado grava tudo ou nada

**Status: ACCEPTED.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal140 ACCEPTED](../reviews/140-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v165**, inserida depois do 140, sem renumerar nem remover ID. Origem: a pendência 1 do [review139](../reviews/139-review.md) ("Remover" por telefone sem transação), repetida na pendência 4 do [review140](../reviews/140-review.md) e deixada pela v164 para "Goal próprio na IA". Este Goal muda **só a IA**: nenhuma tela, nenhum contrato, nenhuma rota do BFF e nenhum quadro do protótipo mudam. Por isso não há linha de quadros do protótipo neste documento.

## Baseline aceita

Baseline aceita: `40273d8180fcffc1cdf1c9a6b09013ceb1a6d13d`

Goal anterior: 140 — Os contatos que a IA nunca responde iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal140 já integrado em `main` (origem `3351168317013b380ceef27e253285c4da024822`). Houve **uma rodada**, sem blocker. **D-154** foi aceita: Configurações › WhatsApp › "Contatos que a IA nunca responde" é a tela do quadro W3, em `/configuracoes/whatsapp/contatos-ignorados`, e "Remover" nessa tela chama `ignoreByPhone(externalContactId, false)`, ou seja, `PUT /v1/conversations/ignored-contacts` com `ignored: false`, que chega a `PUT /internal/contacts/ignore` na IA. O Goal140 não tocou a IA, o BFF, o contrato nem o banco. A última contagem aceita:

- IA: unidade **98** arquivos e **1262** testes passando, 15 arquivos e 108 testes pulados sem banco — Goal139 (o Goal140 não tocou a IA);
- IA: integração `goal139` **7** de 7 contra PostgreSQL descartável — Goal139;
- frontend **204** arquivos e **2964** testes — Goal140;
- `test:gate` **297** — Goal140;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal140;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal140;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **310** `passed`, sem retentativa — Goal140.

O Developer roda a suíte de unidade da IA na baseline **antes de editar** e registra os números de partida.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **"Remover" pela rota por telefone limpa o contato e tira da IA as sessões abertas dele numa transação só: ou as duas coisas ficam gravadas, ou nenhuma fica, e repetir o pedido depois de uma falha aplica a regra.**

**Por que agora.** Até o Goal140, a rota por telefone com `ignored: false` não tinha botão que a chamasse para um contato marcado: a folha de Configurações só marcava. Com o W3, "Remover" está numa tela, em cada linha da lista. A regra de D-153 (5) ("a IA só volta a poder responder esse contato em uma nova conversa comercial") passou a ser usada pela pessoa, e hoje ela pode falhar pela metade sem conserto. Dos itens sem ID, este é o único que corrige um comportamento já entregue e não pede decisão de produto: os quadros sem alvo pedem decisão ou trabalho maior (motivos da v150 a v164 do MASTER_PLAN), e as observações do review140 não mudam o que a pessoa vê no caminho normal.

**Lições dos Goals 133 a 140, que valem aqui.**

1. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
2. Os testes de integração rodam contra PostgreSQL descartável (`AI_TEST_DATABASE_URL`); sem banco, eles são pulados, e o relatório diz quantos rodaram, quantas vezes e onde. `validate:integration` roda `tests/integration` da IA inteiro, então o arquivo novo entra no gate sem mudar script.
3. Um pino de contagem exata desatualizado reprova `validate:core` (DIAG-001 do Goal139). Se o Goal mudar um número que um teste fixa, o Developer acha o pino antes da execução final e corrige sem afrouxar a asserção.
4. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".

## O que a evidência desta passada mostra

Conferido no código da baseline `40273d8`, em `apps/ai-orchestrator/src/modules/session/SessionService.ts`.

1. **São três escritas independentes.** `setIgnoredByExternalContact`, com `ignored: false`, faz:
   - `contact.findUnique` para saber se o contato estava ignorado (`wasIgnored`);
   - `contact.upsert`, que limpa `ignored`, `ignoredAt`, `ignoredBy` e `ignoredSource`;
   - só se `wasIgnored`, `keepOpenSessionsOutOfAi`, que lê as sessões abertas e não expiradas do contato e, para cada uma, chama `setCategoryOverride` (`PERSONAL`, `scope: "CONVERSATION"`).

   Cada passo usa `this.prisma` direto, sem `$transaction`, e o `upsert` já está gravado quando as sessões começam a ser escritas.
2. **A falha no meio não tem conserto.** Se a escrita de uma sessão falhar (banco fora, `writeEffectiveCategory` esgotando `CATEGORY_WRITE_ATTEMPTS` com "Conversation session category kept changing while it was being written."), o contato fica desmarcado, a sessão aberta fica com a categoria de antes e a IA volta a responder nela na próxima mensagem. A rota devolve 5xx, a tela do W3 mantém a linha e anuncia a falha, e a pessoa tenta de novo. Mas o novo pedido lê `wasIgnored: false` e não grava a decisão de sessão nenhuma: responde 200, a linha sai da lista e a conversa aberta continua com a IA. É o contrário do que o W3 diz.
3. **Há uma janela mesmo sem falha.** Entre o `upsert` e a escrita da sessão, uma mensagem de entrada encontra o contato já desmarcado e a sessão ainda sem a decisão "só esta conversa". A guarda da IA (`message-graph.ts`, a mesma do contato ignorado e da sessão `PERSONAL`) não tem o que barrar nesse intervalo.
4. **O padrão de transação já existe no serviço.** `assumeHumanControl` faz a sessão, o espelho da conversa e o registro de tomada num `this.prisma.$transaction(async (tx) => ...)`. O recálculo da categoria (`writeEffectiveCategory`) é uma escrita condicional com releitura, hoje presa a `this.prisma`; `currentSession` também. O falso de Prisma das suítes de sessão (`tests/session/support/fake-prisma.ts`) já implementa `$transaction` chamando o callback com ele mesmo.
5. **Duas sessões abertas são possíveis, uma por conversa.** `keepOpenSessionsOutOfAi` acha as sessões pelo contato e escreve pela conversa (`setCategoryOverride` volta a ler `currentSession` da conversa). Hoje o resultado é o mesmo, mas a releitura é desnecessária quando a sessão já foi achada.
6. **A marcação e a rota da conversa não têm o problema.** Com `ignored: true`, a rota por telefone grava um `upsert` só. `PUT /internal/conversations/:id/ignore` (`setIgnored`, a saída de "Nunca responde" no chat, D-130 (6)) grava só o contato e não aplica a regra de "Remover".

## Escolhas de desenho desta passada

1. **Uma transação para "Remover".** Em `setIgnoredByExternalContact` com `ignored: false`, a leitura de quem estava ignorado, a limpeza do contato, a leitura das sessões abertas e a decisão de cada uma acontecem dentro de um único `this.prisma.$transaction(async (tx) => ...)`, todas pelo `tx`. Uma exceção em qualquer passo desfaz tudo e sobe como hoje (5xx pela rota, sem novo código de erro). Sem `timeout` próprio na transação, salvo se a prova mostrar necessidade; nesse caso o relatório diz o valor e o porquê.
2. **Quem estava ignorado é decidido pela própria escrita.** A limpeza do contato que estava ignorado é condicional (`updateMany` pela chave `[tenantId, channelId, externalContactId]` com `ignored: true`): `count` 1 quer dizer que este pedido desmarcou e grava a decisão das sessões; `count` 0 quer dizer que o contato não estava ignorado (ou outro pedido já desmarcou), e o pedido segue o caminho de hoje para quem não estava ignorado, sem tocar sessão. Dois "Remover" simultâneos do mesmo contato terminam com o contato desmarcado e a decisão gravada uma vez só, os dois com 200. O contato inexistente continua sendo criado desmarcado, como hoje.
3. **O recálculo da sessão roda no cliente da transação.** `writeEffectiveCategory` (e o que a escrita da sessão precisar ler) passa a aceitar o cliente de banco como parâmetro opcional, com `this.prisma` como padrão; nenhum chamador fora da regra de "Remover" muda de comportamento nem de assinatura pública. A decisão de cada sessão continua saindo de `resolveEffectiveCategory`, com a escrita condicional e a releitura de hoje, o autor do pedido e `scope: "CONVERSATION"`; nada de `update` cru na categoria. A escrita usa a sessão já achada pelo contato, sem reler `currentSession` pela conversa. Nenhuma transação aninhada.
4. **O resto não muda.** A marcação (`ignored: true`) grava o mesmo de hoje; o Developer pode mantê-la fora da transação. A rota da conversa (D-130 (6)), a leitura da lista (D-153 (1)), a origem gravada, a forma da resposta da rota e a expiração de sessão (D-009) não mudam. Sem migration, sem mudança no BFF, no contrato ou no frontend.
5. **Decisão.** O Developer propõe **D-155** com as escolhas 1 a 4: "Remover" por telefone é atômico, repetível depois de falha e sem efeito duplo quando simultâneo. Se o número já estiver tomado, use o próximo livre e explique. D-153 não é editada; D-155 diz que a pendência 1 do review139 deixou de existir.

## Escopo obrigatório

### 1. IA (`apps/ai-orchestrator/src`)

- `modules/session/SessionService.ts`: as escolhas 1 a 3.
- `modules/internal/routes.ts`: só se a prova mostrar que a rota precisa mudar; a forma da resposta e o mapeamento de erro ficam iguais.

### 2. Provas

1. **IA, unidade** (`apps/ai-orchestrator/tests/**/goal141-*.test.ts`, com o falso de Prisma da casa ou um equivalente que implemente `$transaction`):
   - "Remover" de contato ignorado com sessão aberta grava o contato limpo e a sessão `PERSONAL` só nesta conversa, com o autor;
   - falha forçada na escrita da sessão: a rota responde 5xx, e o contato continua ignorado com `ignoredAt`, `ignoredBy` e `ignoredSource` de antes, e a sessão sem decisão; repetir o pedido sem a falha desmarca e grava a decisão;
   - contato que não estava ignorado e contato inexistente: o mesmo resultado de hoje, sem decisão de sessão;
   - a marcação (`ignored: true`) e a rota da conversa sem mudança.

   Os testes `goal139` (`tests/internal/goal139-ignored-contacts-list.routes.test.ts`, `tests/internal/ignored-contacts.routes.test.ts`) continuam passando. Se o falso de Prisma deles precisar ganhar `$transaction` ou `updateMany`, o relatório diz qual arquivo, o que mudou no falso e mostra que nenhuma asserção mudou.
2. **IA, integração** (`apps/ai-orchestrator/tests/integration/goal141-*.test.ts`, contra PostgreSQL descartável, no estilo de `goal139-ignored-contacts.test.ts`):
   - (i) **falha no meio:** com a escrita da sessão forçada a falhar, a rota responde 5xx, o contato continua ignorado no banco com os campos de antes e a sessão sem decisão; `SessionService.evaluate` continua recusando a IA; repetir o pedido sem a falha deixa o contato desmarcado, a sessão `PERSONAL` e `evaluate` recusando a IA;
   - (ii) **sem janela:** com a transação pausada depois da limpeza do contato e antes da escrita da sessão, uma leitura por outro cliente vê o contato ainda ignorado; liberada a pausa, o contato aparece desmarcado e a sessão `PERSONAL` juntos;
   - (iii) **simultâneo:** dois "Remover" do mesmo contato ao mesmo tempo respondem 200, o contato termina desmarcado e a sessão `PERSONAL` com uma decisão;
   - (iv) a sessão nova do mesmo contato, depois de expirar a anterior, nasce sem a decisão, como no Goal139.

   O mecanismo de falha e de pausa fica nos testes (espião, `vi.spyOn` em método do serviço ou do cliente, ou outro), e o relatório o descreve. **Nenhum gancho de teste entra no código de produção.** O relatório diz quantas vezes a integração rodou contra banco; rodar ao menos três vezes, porque (ii) e (iii) dependem de ordem entre conexões.
3. **Controles negativos**, depois da última edição de código, cada um reprovando o teste indicado, com a mensagem exata registrada e revertido com `cmp` igual ao backup:
   - (a) a limpeza do contato feita por `this.prisma`, fora do `tx` → reprova (i) e (ii) da integração e o teste de falha da unidade;
   - (b) a escrita das sessões com a exceção engolida (`try`/`catch` que só registra) → reprova o teste de falha da unidade e (i) da integração;
   - (c) a limpeza sem a condição `ignored: true`, com a regra aplicada a todo `ignored: false` → reprova o teste do contato que não estava ignorado (unidade) e (iii) da integração, ou o teste `goal139` equivalente; o relatório diz quais reprovaram.

## Fora do escopo

- Qualquer mudança no frontend, no BFF, no contrato, no banco (migration ou backfill) ou na captura; qualquer entrada de `targets.json` e qualquer `visual:compare`.
- As observações não bloqueantes do review140: a mensagem de falha de "Remover" abaixo do cartão, `displayName` sem `trim` na segunda linha do W1 e a precisão do relatório da WU-02.
- Busca na lista, filtro por origem e marcação em lote; o telefone da conversa marcada no contrato.
- A rota da conversa (D-130 (6)), a marcação, as categorias fora da regra de "Remover" e a expiração de sessão (D-009).
- Os pendentes do review138 e os 12 quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, H6, NT3 e 4.3).

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-155** em `PROPOSED`, conforme a escolha 5.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal141.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal141, com as contagens de partida da unidade da IA, as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número, quantos testes de integração rodaram contra banco, quantas vezes e onde, e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal141 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Rodar, na baseline `40273d8`, a suíte de unidade da IA e registrar os números de partida.
2. Implementar as escolhas 1 a 3 com os testes do §2.1.
3. Escrever a integração do §2.2 e rodá-la ao menos três vezes contra PostgreSQL descartável.
4. Rodar os controles negativos do §2.3 e revertê-los.
5. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint da IA (com o RTK ligado, lint por `rtk proxy`);
   - testes alvo `goal141` e a suíte de unidade da IA;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. "Remover" pela rota por telefone de um contato ignorado grava a limpeza do contato e a decisão `PERSONAL` só nesta conversa das sessões abertas e não expiradas numa transação só. Provado na unidade e na integração da IA, contra banco.
2. Com a escrita da sessão falhando, nada fica gravado: o contato continua ignorado com os campos de antes, a sessão sem decisão, a rota responde 5xx e `evaluate` continua recusando a IA; repetir o pedido sem a falha aplica a regra inteira. Provado na integração.
3. Durante a remoção, uma leitura de fora vê o contato ainda ignorado até a sessão estar gravada. Provado na integração.
4. Dois "Remover" simultâneos do mesmo contato respondem 200 e gravam a decisão uma vez. Provado na integração.
5. A marcação, a rota da conversa (D-130 (6)), a leitura da lista, a forma da resposta e o caso do contato não ignorado ou inexistente continuam como antes; os testes `goal139` continuam passando sem asserção afrouxada.
6. Os três controles negativos reprovam, com a mensagem exata registrada, e foram revertidos.
7. Typecheck e lint da IA, a suíte de unidade da IA, `test:gate`, `validate:core` e `validate:integration` com o gate autenticado passam.
8. Nenhum arquivo mudou fora destes: os do §1; `apps/ai-orchestrator/tests/`; os três registros da seção "Documentação".
9. D-155 proposta, conforme a escolha 5.

## Plano de execução

1. **WU-01 — "Remover" numa transação só.** As escolhas 1 a 3 em `SessionService`, os testes `goal141` de unidade e o ajuste, se preciso, do falso de Prisma das suítes `goal139`.
2. **WU-02 — A prova contra PostgreSQL e os controles.** A integração `goal141` (falha no meio, sem janela, simultâneo e sessão nova), rodada ao menos três vezes, e os controles (a) a (c).
3. **WU-03 a WU-09 — Verificação determinística:** typecheck, lint, testes alvo `goal141` e a suíte de unidade da IA; `test:gate`; `validate:core`; `validate:integration`.
4. **WU-10 — Registros.** D-155, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
5. **WU-11 — `git diff --check`.**
