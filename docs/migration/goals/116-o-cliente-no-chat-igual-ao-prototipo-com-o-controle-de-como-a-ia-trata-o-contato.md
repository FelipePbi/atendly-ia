# Goal 116 — O cliente no chat igual ao protótipo, com o controle de como a IA trata o contato

**Status: READY.** Preparado em 2026-10-04 pelo Tech Lead Agent após [Goal115 ACCEPTED](../reviews/115-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: K5

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v140**, inserida depois do 115, sem renumerar nem remover ID. Origem: a leitura própria do K5 que a v139 deixou para depois do 115.

## Baseline aceita

Baseline aceita: `2961fd074d211b3520869add41e85c2483901782`

Goal anterior: 115 — Marcar como pessoal só nesta conversa ou sempre, e o menu do chat igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal115 já integrado em `main` (origem `b35e76e004793c90679e60c3a0fde1d886a2afdc`). Foram **duas rodadas**, com 5 e 0 blockers. **D-129** foi aceita: a decisão "Pessoal" vale por conversa (`ConversationSession.categoryOverride`) ou por contato (`Contact.categoryOverride`), com precedência sessão > contato > sugestão; `PUT /v1/conversations/{id}/category` aceita `scope` (`CONVERSATION` ou `CONTACT`, padrão `CONTACT`), e `scope: "CONTACT"` ou `category: null` limpam a decisão da sessão; a conversa traz `categoryScope`; o menu "•••" segue o K6; e "Assumir conversa", "Criar agendamento" e "Marcar como resolvida" moram no contexto. A última contagem aceita: frontend **158** arquivos e **1975** testes, `test:gate` **256**, `visual-responses.test.mjs` **23**, `validate:ui` **169** `passed`, `validate:integration` **36** de 36 passos e **275** testes no gate autenticado. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **tocar no nome do chat abre o cliente igual ao K5 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768), **e o controle "Como a IA trata este contato" grava o que cada posição diz**.

**Por que agora.** A fila não tem Goal PLANNED. O K5 é o último quadro do módulo de Conversas sem alvo no `visual:compare`. A v139 o deixou para depois do 115 porque o controle "Automático · Sempre atende · Nunca responde" só podia ser lido sobre a distinção entre conversa e contato, que D-129 agora fixa.

## O que a evidência desta passada mostra

Conferido no código da baseline `2961fd0`, no quadro K5 (`Conversas-e-Chat.dc.html`, `Conversas-Tablet.dc.html` e `Conversas-Desktop.dc.html`), no contrato e no vault.

1. **O quadro.** Folha sobre o chat escurecido (`rgba(34,30,26,.38)`), com puxador. Linha do cliente: iniciais "AP", "Ana Paula", "+55 11 99123-4567 · cliente desde mar 2025" e o link "Ver perfil". Bloco "Resumo da IA" com o texto do resumo. Bloco com "Próximo" ("Sex, 19/09 · 15:30 · Corte feminino" e a pílula "Confirmado") e "Último" ("Qui, 31/07 · Corte feminino · R$ 90"). Bloco "Como a IA trata este contato" com o controle segmentado "Automático · Sempre atende · Nunca responde" e a frase "Automático: a IA decide pela conversa. “Nunca responde” é o mesmo que Ignorar IA." A nota do quadro diz: "Tocar no cabeçalho abre o cliente sob demanda". No tablet e no desktop é um diálogo centrado, de 480 px em retrato e de 440 px em paisagem e no desktop, com a mesma casca do K6.
2. **O contexto de hoje não é o quadro.** `ConversationContextPanel.tsx`, aberto pelo nome com chevron num `Dialog` "Contexto da conversa" em `ConversationThread.tsx`, tem as seções "Cliente" ("Abrir cliente"), "Categoria" (selo de D-129 (7), dica da sugestão, os chips Comercial, Não classificada e Pessoal e "Usar classificação automática"), "Ignorar na IA" e as ações "Assumir conversa", "Criar agendamento", "Abrir clientes" e "Marcar como resolvida".
3. **"Nunca responde" é `ignored`.** O quadro diz isso. O vault, item 206: "Ignorar IA: IA nunca envia, classificação continua separada". A gravação é `PUT /v1/conversations/{id}/ignore` (`BffConversationService.setIgnored`), hoje pelo diálogo de ignorar de `ConversationThread.tsx`.
4. **"Sempre atende" é a categoria manual do contato em Comercial.** O vault, item 208, aceita "sempre permitir IA", e o item 209 diz que a configuração manual sempre vence o classificador. O turno da IA só se cala por `ignored` ou por categoria `PERSONAL` (`message-graph.ts`, guardas `ignored_contact` e `PERSONAL_SESSION`). Com `Contact.categoryOverride = "COMMERCIAL"`, nenhuma classificação põe o contato em Pessoal. É o que "Mover para Comercial" do K6 já grava, com `scope: "CONTACT"`.
5. **"Automático" é sem decisão manual do contato.** `category: null` com `scope: "CONTACT"` limpa a decisão do contato e a da sessão (D-129).
6. **Falta uma leitura.** Com "Só esta conversa", a conversa traz `category: "PERSONAL"` e `categoryScope: "CONVERSATION"`, e a decisão do contato não aparece em campo nenhum. `conversationDto` (`apps/ai-orchestrator/src/modules/internal/routes.ts`) já lê `conversation.contact?.categoryOverride` para calcular `categoryScope`.
7. **O cliente já tem leitura.** `GET /v1/customers/{id}` traz `nextAppointment` e `lastAppointment` (`{ date, startTime, status }`) e `appointmentStats.firstAppointmentDate` (Goal075). `GET /v1/appointments` aceita `customerId`, `startDate` e `endDate` e traz `services` e `finalValue` (Goal103). O vault (`01-Regras/02-Agenda-e-Agendamentos.md`) diz que o preço previsto não representa receita quando o valor final não foi informado.
8. **O resumo da IA é sob demanda e chama o modelo.** `POST /v1/customers/{id}/summary` gera o resumo e grava `AiRun`; recusa com `CUSTOMER_NOT_LINKED` sem pessoa vinculada. Clientes o mostra pelo botão "Gerar resumo" (`CustomerSummary.tsx`).
9. **O quadro não desenha assumir, criar agendamento nem resolver.** Nenhum dos três aparece nos quadros de Conversas. O vault, `01-Regras/01-Regras-de-Negocio.md`, regra 5: "O profissional sempre pode assumir manualmente uma conversa."
10. **O `visual:compare` casa resposta fixa pelo caminho, sem a query** (`pickFixedResponse` em `scripts/lib/visual-responses.mjs`), e só troca `{today}` e `{today-N}`.

## Escolhas de desenho desta passada

1. **O contexto do chat vira a folha do K5.** O nome com chevron do cabeçalho e "Ver contato" do K6 abrem a folha. Ela substitui o `Dialog` "Contexto da conversa" e o conteúdo de `ConversationContextPanel`. A casca é a do K6: folha de baixo abaixo de 768 px; de 768 px em diante, diálogo centrado de 480 px até 1023 px e de 440 px de 1024 px em diante (D-129 (7)). O Developer pode extrair a casca de `ConversationActionsSheet` para um componente comum, desde que o K6 continue igual à captura de antes.
2. **A conversa ganha `contactCategory`, opcional e só de leitura.** É a decisão manual do contato (`COMMERCIAL`, `UNCLASSIFIED`, `PERSONAL` ou `null`), montada em `conversationDto` a partir de `conversation.contact?.categoryOverride`, na lista e no detalhe. Resposta antiga, sem o campo, continua válida. Nenhuma migration, nenhuma gravação nova, nenhuma regra nova no backend.
3. **A posição do controle vem do contato.** Na ordem:
   - `ignored: true` → **Nunca responde**.
   - `contactCategory` `COMMERCIAL` ou `UNCLASSIFIED` → **Sempre atende** (a IA responde, e a classificação não a cala).
   - `contactCategory` `PERSONAL` → nenhuma posição marcada.
   - `contactCategory` `null` → **Automático**.
   - Sem o campo `contactCategory` (resposta antiga): `categoryScope: "CONTACT"` usa `category` no lugar dele, `categoryScope` nulo vale `null`, e `categoryScope: "CONVERSATION"` deixa nenhuma posição marcada.
4. **A frase abaixo do controle diz o estado.** A primeira regra que valer:
   - `categoryScope: "CONVERSATION"`: "Só esta conversa está em Pessoal: a IA não responde aqui. Automático ou Sempre atende tiram esta conversa de Pessoal."
   - `contactCategory: "PERSONAL"`: "{nome} está em Pessoal para sempre: a IA nunca responde. Escolha Automático ou Sempre atende para mudar."
   - Nunca responde: "Nunca responde: a IA não responde nem usa as conversas de {nome}. As mensagens continuam aqui."
   - Sempre atende: "Sempre atende: a IA responde {nome} mesmo quando a conversa parece pessoal."
   - Automático: a frase do quadro.
   {nome} é o nome que o cabeçalho mostra.
5. **Cada posição grava pelas rotas de hoje.** Nada é gravado antes da escolha e, quando há diálogo, antes da confirmação.
   - **Automático**: `PUT …/category` com `{ category: null, scope: "CONTACT" }`.
   - **Sempre atende**: `PUT …/category` com `{ category: "COMMERCIAL", scope: "CONTACT" }`.
   - **Nunca responde**: abre o diálogo de ignorar de hoje; a confirmação grava `PUT …/ignore` com `{ ignored: true }`. A categoria não muda (vault 206).
   - **Saindo de Nunca responde** para Automático ou Sempre atende: abre o diálogo de hoje, "Voltar a usar este contato na IA?". A confirmação grava **primeiro** a categoria e **depois** `{ ignored: false }`. Se a categoria falhar, nada mais é gravado. Se a segunda gravação falhar, o contato continua ignorado. Nos dois casos, o erro aparece na folha com `role="alert"`, e a falha nunca deixa a IA respondendo um contato que estava ignorado.
   - Tocar a posição já marcada não grava nada.
   - Durante a gravação, o controle fica desabilitado. Depois, a posição marcada é a que a resposta da conversa diz, nunca a que foi tocada.
6. **O cliente na folha.**
   - Linha do cliente: iniciais, nome, e o telefone formatado mais " · cliente desde {mês abreviado} {ano}" de `appointmentStats.firstAppointmentDate`. Sem essa data, só o telefone. "Ver perfil" leva a `/clientes/detalhes?id={customerId}`.
   - "Resumo da IA": o rótulo do quadro e o botão "Gerar resumo" de hoje, com o mesmo `POST` sob demanda, os mesmos estados e erros e o texto gerado no lugar do quadro. Abrir a folha não chama o modelo.
   - "Próximo": `nextAppointment`, com dia da semana, data, hora, o nome dos serviços e a pílula do estado. "Último": `lastAppointment`, com dia da semana, data, o nome dos serviços e o valor só quando `finalValue` está gravado. Os serviços e o valor vêm de `GET /v1/appointments` com `customerId`, filtrado no cliente pela data e pela hora do item. Sem item, a linha some; sem os dois, o bloco some.
   - Conversa sem `customerId`: a linha do cliente com nome e telefone, sem "Ver perfil", com "Este contato ainda não é um cliente cadastrado."; sem resumo, próximo nem último. O controle continua, porque é regra do contato.
   - As leituras do cliente começam quando a folha abre, e não ao abrir o chat. Enquanto carregam, um estado de carregamento com texto. Se falharem, uma mensagem com `role="alert"` e "Tentar de novo". O controle e as ações não esperam essas leituras.
7. **As ações que o quadro não desenha ficam abaixo do controle.** Uma seção "Nesta conversa", com linhas no estilo das linhas do K6: "Assumir conversa" (com a regra de hoje: conversa não resolvida e ninguém atendendo), "Criar agendamento" (`/agenda/novo`, como hoje) e "Marcar como resolvida" (desabilitada com a conversa resolvida). "Abrir clientes" sai, porque "Ver perfil" leva ao cliente. Assumir fecha a folha antes, como hoje.
8. **O que sai do contexto.** Os chips de categoria, "Usar classificação automática", o selo de D-129 (7) e a dica "A IA sugere…". Mudar a categoria continua alcançável: "Mover para Comercial" e "Marcar como pessoal" no K6, e Automático e Sempre atende no K5. O estado que o selo dizia passa para a frase da escolha 4.
9. **Decisão.** O Developer propõe **D-130**, por acréscimo, depois das provas: a folha do K5, a leitura e a gravação de cada posição do controle, a ordem das gravações ao sair de Nunca responde, `contactCategory`, o novo lugar de assumir, criar agendamento e resolver (revê o item que D-129 deu ao contexto), o que saiu do contexto (revê D-129 (7)) e as divergências. D-129 não é reescrita.

## Escopo obrigatório

### 1. A leitura `contactCategory` (IA, contrato e BFF)

1. `apps/ai-orchestrator/src/modules/internal/routes.ts`: `contactCategory` em `conversationDto`, para a lista e o detalhe. Se a leitura da lista não traz `contact.categoryOverride`, o Developer a inclui na mesma consulta.
2. `packages/public-api-contract/src/schemas.ts`: `contactCategory` opcional e anulável em `conversationSchema`.
3. `apps/bff/src/clients/ai-orchestrator/index.ts`: o schema da conversa aceita e repassa `contactCategory`. O BFF repassa o campo na lista, no detalhe e na resposta de `PUT …/category` e `PUT …/ignore`.
4. `apps/bff/PUBLIC_API_V1.md`: o campo novo, na seção "Conversa: categoria, sessão e atendimento humano".
5. Provas, com teste que reprova sem a mudança: a IA devolve `contactCategory` com cada valor e `null` sem decisão; com "Só esta conversa" e o contato em Comercial, a conversa traz `category: "PERSONAL"`, `categoryScope: "CONVERSATION"` e `contactCategory: "COMMERCIAL"`; o BFF repassa o campo. A prova do BFF roda sem as variáveis de integração quando o padrão dos testes do BFF permitir; se não permitir, roda em `validate:integration`, e o relatório diz qual.

### 2. A folha do K5 (`apps/frontend`)

1. A folha da escolha 1, aberta pelo nome com chevron e por "Ver contato", com nome acessível, foco preso enquanto aberta, `Escape` fecha e o foco volta a quem a abriu. Alvos de toque de no mínimo 44 px.
2. O Developer porta o HTML/CSS do K5: linha do cliente, blocos com os valores inline de px, cor, fonte e raio, a pílula, o controle segmentado e o movimento (`at-fade`, `at-sheet`, `at-reveal`, parados com `prefers-reduced-motion`). As medidas do protótipo são `content-box` (D-127 (8)).
3. O controle é um `radiogroup` com nome acessível "Como a IA trata este contato". O estado tem texto e não depende só de cor.
4. A leitura, a frase, as gravações, o cliente e as ações das escolhas 3 a 7.
5. `BffConversationService`, a interface de dados e o tipo da conversa aceitam `contactCategory`.
6. `apps/frontend/e2e/visual/targets.json`: entra **K5**, com `route` `/conversas/{id fixo}`, `clock`, `responses` para a conversa (Ana Paula, com `customerId`, sem atendimento humano, `contactCategory: null`), as mensagens do quadro ("Pode!" e "Confirmado! Te espero sexta às 15h30 😊"), os eventos, a lista, `GET /v1/status` conectado, `GET /v1/customers/{id}` (com `nextAppointment`, `lastAppointment` e `appointmentStats.firstAppointmentDate` em março de 2025) e `GET /v1/appointments` (os dois atendimentos, com "Corte feminino" e `finalValue` 90 no último), e `steps` que abrem a folha pelo nome do cabeçalho. Tudo nos limites de D-127 (7): só `GET`, caminho exato, nenhuma capacidade nova no `visual:compare`.
7. `scripts/tests/visual-responses.test.mjs` passa a exigir também o K5.

### 3. O que já valia continua valendo

1. K1, K2, K3, K4 e K6 continuam iguais à captura de antes. O cabeçalho, o "•••", "Retomar IA" e o menu não mudam.
2. `/conversas` (`Conversas:C1` e C4) não muda de aparência.
3. Toda ação do chat continua alcançável: ler, enviar, reenviar, assumir, devolver, resolver, criar agendamento, sugerir, abrir mídia, ver eventos, mudar a categoria e ignorar.
4. O gate autenticado (`e2e/authenticated-matrix.spec.ts`) não muda. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` muda. Se o gate reprovar pela mudança, o Developer para e registra; não ajusta o gate sem autorização no review.
5. Acessibilidade: foco visível nas posições do controle, nos links, nos botões e nas linhas de ação; movimento parado com `prefers-reduced-motion`.

### 4. Provas do frontend

1. Testes novos em `apps/frontend/tests/goal116-*.test.tsx`, com:
   - a folha aberta pelo nome e por "Ver contato", `Escape` e o foco de volta;
   - a posição marcada e a frase para cada linha das escolhas 3 e 4, inclusive a resposta antiga sem `contactCategory`;
   - Automático e Sempre atende chamando `setCategory` com `scope: "CONTACT"` e a categoria certa;
   - Nunca responde abrindo o diálogo, sem gravar antes da confirmação, e gravando `ignored: true` depois dela;
   - a saída de Nunca responde gravando a categoria antes de `ignored: false`, sem chamar `setIgnored` quando a categoria falha, e com o erro na folha quando a segunda gravação falha;
   - a posição já marcada sem gravação;
   - o cliente com "cliente desde", "Ver perfil", "Próximo" e "Último" com os serviços, e o valor só com `finalValue`;
   - a conversa sem `customerId`;
   - o carregamento e o erro das leituras do cliente, com "Tentar de novo";
   - o resumo só pelo botão, sem `POST` ao abrir a folha;
   - "Assumir conversa", "Criar agendamento" e "Marcar como resolvida" na seção "Nesta conversa", com as regras de hoje.
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) no frontend, Sempre atende gravando com `scope: "CONVERSATION"` faz um teste reprovar;
   - (b) no frontend, a saída de Nunca responde gravando `ignored: false` antes da categoria faz o teste da ordem reprovar;
   - (c) na IA, `contactCategory` sempre `null` em `conversationDto` faz o teste da IA reprovar.
   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes de Conversas existentes continuam passando. Teste que dependa do que sai do contexto (os chips, "Usar classificação automática", o selo, a dica da sugestão, "Abrir clientes", "Abrir cliente") pode ser ajustado só para o novo lugar ou para a nova leitura, sem afrouxar a asserção. Cada ajuste é listado no relatório.

## Divergências declaradas

Não contam como defeito na comparação do K5:

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O nome e as iniciais do negócio da conta visual, e a casca, como em D-127 e D-128.
3. Atrás do escurecido, a conversa real e o seu cabeçalho, com a linha de estado de D-128 (2), como em D-129 (a).
4. Na faixa de 1024 px em diante, a coluna da lista atrás do escurecido, com as divergências de D-127, D-128 e D-129.
5. Dias da semana e datas do "Próximo" e do "Último" calculados de `{today}`.
6. O bloco "Resumo da IA" mostra o botão "Gerar resumo", e não o texto do quadro, porque o resumo é um `POST` sob demanda e o `visual:compare` só fixa `GET`.
7. A seção "Nesta conversa" abaixo do controle, que o quadro não desenha. A folha fica mais alta por ela; no mobile, o topo da folha sobe.

Qualquer outra diferença visível é blocker.

## Fora do escopo

- Qualquer regra nova no backend: o classificador, as guardas da IA, `ignored`, `aiPaused`, a purga e as gravações de categoria e de ignorar ficam como estão. `assistant.service` e `customer-memory` continuam lendo `Contact.categoryOverride` (observação 1 do review115).
- Migration, coluna nova ou mudança de gravação na IA, no BFF ou no Scheduling.
- Gerar o resumo ao abrir a folha, ou guardar o resumo.
- `{today+N}` ou qualquer outra mudança no `visual:compare` além de `targets.json` e do teste de `scripts/tests/visual-responses.test.mjs`.
- O menu do K6, a lista de `/conversas`, Clientes, as Notificações, a casca e qualquer arquivo de `e2e/` além de `e2e/visual/targets.json`.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-130** em `PROPOSED`, conforme a escolha 9. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal116.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal116, com as contagens da execução final, os controles negativos e a lista das capturas do `visual:compare` conferidas.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md`, `MASTER_PLAN.md` nem `DATA_MIGRATION.md` (nada de dado muda).

## Validação e ordem

1. Antes de editar: subir uma pilha própria em bancos descartáveis com `prisma migrate deploy` dos três serviços e chamar o `visual:compare` com `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN` (observação 2 do review115); rodar `npx prisma generate` em `apps/ai-orchestrator` antes de `test:gate`. Rodar `npm run visual:compare -- --target K1,K2,K3,K4,K6,Conversas:C1,C4` na baseline. As capturas de antes ficam fora do repositório.
2. A leitura `contactCategory`, com os testes do §1.
3. `targets.json` com o K5 e o teste de `visual-responses`; `npm run visual:compare -- --target K5` na baseline, para ter o antes.
4. A folha do K5, com os testes novos e os ajustes listados.
5. Controles negativos do §4.2, revertidos.
6. `npm run visual:compare -- --target K5,K1,K2,K3,K4,K6,Conversas:C1,C4` e **olhar** as capturas lado a lado (protótipo × app, 4 devices). K5 tem de ficar igual ao quadro, salvo as divergências declaradas; K1 a K4, K6, `Conversas:C1` e C4 iguais à captura de antes.
7. Execução final, sobre a árvore completa: typecheck da IA, do BFF e do frontend; lint; testes da IA, do BFF e do frontend; `test:gate`; `validate:core`; `validate:ui`; `validate:integration` (com `BFF_TEST_DATABASE_URL` num banco descartável e o PostgreSQL de um cluster próprio, observação 3 do review114); `git diff --check`. Com o RTK ligado, lint por `rtk proxy`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A folha do K5 fica **igual ao quadro K5 nos 4 devices**, conferido olhando as capturas do `visual:compare`, salvo as divergências declaradas. K1 a K4, K6, `Conversas:C1` e C4 continuam iguais à captura de antes.
2. Cada posição do controle mostra o estado certo para cada combinação de `ignored`, `contactCategory` e `categoryScope`, e para a resposta antiga sem `contactCategory`, com a frase da escolha 4.
3. Automático e Sempre atende gravam com `scope: "CONTACT"`; Nunca responde grava `ignored: true` só depois do diálogo; a saída de Nunca responde grava a categoria antes de `ignored: false`, e nenhuma falha deixa a IA respondendo um contato que estava ignorado. Provado em jsdom.
4. A conversa traz `contactCategory` na lista, no detalhe e nas respostas de categoria e de ignorar, e resposta sem o campo continua válida. Provado por teste da IA que reprova sem a mudança e pelo repasse do BFF.
5. O cliente mostra "cliente desde", "Ver perfil", "Próximo" e "Último" com os serviços, e o valor só com `finalValue`; o resumo só pelo botão; a conversa sem cliente e o erro das leituras têm o estado da escolha 6.
6. Toda ação do chat continua alcançável, provado em jsdom; assumir, criar agendamento e resolver na seção "Nesta conversa".
7. Os três controles negativos reprovam e foram revertidos.
8. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança em `e2e/` fora de `targets.json`.
9. Nenhum arquivo fora de `apps/ai-orchestrator/src/modules/internal/routes.ts`, `apps/ai-orchestrator/tests/`, `packages/public-api-contract/src/schemas.ts`, `apps/bff/src/clients/ai-orchestrator/`, `apps/bff/src/modules/conversations/`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
10. D-130 proposta, com a leitura e a gravação do controle, a ordem das gravações, `contactCategory`, o novo lugar das ações, o que saiu do contexto e as divergências.

## Plano de execução

1. **WU-01 — A leitura `contactCategory`.** DTO da IA, contrato, cliente do BFF, documentação da API e os testes do §1.
2. **WU-02 — Alvo K5 e medida de antes.** A pilha descartável, as capturas de antes, `targets.json` com o K5 e o teste de `visual-responses`.
3. **WU-03 — A folha do K5.** Casca, cliente, controle com leitura e gravação, seção "Nesta conversa", testes novos e ajustes.
4. **WU-04 — Provas e registros.** Controles negativos, `visual:compare` depois, D-130, CURRENT_STATE e VALIDATION_GATE.
5. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
