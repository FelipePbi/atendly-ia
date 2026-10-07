# Goal 137 — Os conflitos da importação do onboarding iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal136 ACCEPTED](../reviews/136-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.I6

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v161**, inserida depois do 136, sem renumerar nem remover ID. Origem: o Goal136 entregou no Scheduling, no contrato e no BFF o que o quadro 2.I6 ("Conflitos da importação") precisa mostrar e decidir, e deixou a tela para esta passada (D-150, item 9; pendência 2 do review136). Com 2.I8 e 2.I9 aceitos, `targets.json` tem 99 alvos, e 14 dos 113 quadros continuam sem alvo; o 2.I6 é o último da importação do onboarding alcançável sem decisão nova (a 4.3 continua fora pelo código de vinculação).

## Baseline aceita

Baseline aceita: `b119baf455e26ef683e19cfd5124c16e6595366b`

Goal anterior: 136 — Os conflitos da importação com a correspondência sugerida e os valores da origem no contrato

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal136 já integrado em `main` (origem `a1ec45543214e6ae1977ab6644b93ecb28619c9c`). Houve **uma rodada**, sem blocker. **D-150** foi aceita: a análise grava em `ImportItem` os candidatos (`matchCandidateInternalIds`) e os valores do serviço da origem (`proposedService`); o serviço de mesmo nome com duração ou preço da origem conhecidos e diferentes passa a `SERVICE_MATCH_DIVERGENT` `NEEDS_REVIEW`; a rota de itens devolve `candidates` (lidos no momento, só do negócio; no cliente, só `internalId` e `name`) e `proposedService`, com os dois campos opcionais em `importItemSchema`. O Goal136 não tocou `apps/frontend/` nem `scripts/`, então as contagens do frontend e da captura são as do Goal135. A última contagem aceita:

- frontend **198** arquivos e **2819** testes, `goal135` **82** (2 arquivos) — Goal136, iguais ao Goal135;
- `visual-responses.test.mjs` **62** e `test:gate` **295** — Goal135;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal135;
- Scheduling: unidade **41** arquivos e **571** testes; integração **21** arquivos e **161** testes — Goal136;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal136;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa — Goal136.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a tela de conflitos da importação (`ImportConflictsScreen`) fica igual ao quadro 2.I6 nos quatro devices, salvo as divergências declaradas, e a decisão de um conflito de serviço ou de cliente passa a ser tomada no próprio cartão, sobre o cadastro sugerido pela análise, sem identificador digitado.** A tela vale nas duas molduras (`/onboarding/importacao` e `/importacao`) e nas duas entradas que já existem (a prévia, por "Revisar conflitos", e a tela parada, por "Revisar pendências", "Corrigir" e "Nomear"), como a regra das mesmas telas nas duas molduras (D-084 item 5, D-119, D-145 a D-147, D-149).

A rota de decisão não muda: o mesmo `POST .../items/:itemId/decision`, as mesmas cinco decisões do contrato, o `targetInternalId` só em `MERGE_WITH_EXISTING` e `KEEP_EXISTING`, a chave de idempotência por pedido e a mesma reação a `IMPORT_ITEM_ALREADY_DECIDED`. Nenhuma rota do BFF muda, e o único dado novo lido são os campos opcionais que o Goal136 pôs na rota de itens que a tela já lê.

**Por que agora.** O 2.I6 era o único quadro da importação do onboarding com contrato a resolver, e o Goal136 o resolveu. A tela de hoje pede o ID interno do cadastro ("Identificador do cadastro existente") para "Mesclar" ou "Manter o cadastro existente", e o motivo novo `SERVICE_MATCH_DIVERGENT` cai no texto genérico de `conflictReasonLabel`: uma pessoa não consegue, hoje, apontar o serviço importado para o serviço que já tem sem saber um ID que a tela não mostra.

**Lições dos Goals 133 a 136, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
3. Os quatro `side-by-side.png` do 2.I6 são abertos, e as medidas do §3.5 são feitas em todos os devices, no app e no quadro.
4. Cada controle de `targets.json` roda pelos **dois** testes: o `goal137` e `scripts/tests/visual-responses.test.mjs`.
5. As `notes` do alvo citam **todas** as divergências visíveis na captura, inclusive as da moldura e as de cor de título (`avenly.css` dá `color: var(--fg)` a todo `h2`; review135, blocker 1).
6. O frontend resolve `@avenly-ia/public-api-contract` por `file:../../packages/public-api-contract`. Se o tipo `ImportItem` do frontend não trouxer `candidates` e `proposedService`, o Developer reconstrói o pacote (`build:public-api-contract`) e reinstala a dependência antes de editar, e registra o passo; isso não entra no diff (review136, "Ambiente do BFF").

## O que a evidência desta passada mostra

Conferido no código da baseline `b119baf` e em `docs/design-reference/claude-design/prototype/project/Onboarding-2-Importacao.dc.html` (quadro 2.I6), com `Onboarding-2-Importacao-Tablet.dc.html` (retrato e paisagem) e `Onboarding-2-Importacao-Desktop.dc.html`, que também têm o quadro.

1. **2.I6 no mobile.**
   - O topo da moldura: o chevron, a barra com o primeiro segmento `#0F5F63` e o segundo em 52 %, e o eyebrow "Sua agenda".
   - O corpo (`flex: 1`, `padding: 10px 20px 0`, 16 px entre os blocos):
     - o título "3 registros precisam da sua decisão" em Literata 28 px 500, `line-height: 1.2`, `letter-spacing: -0.01em`, e a descrição "Encontramos dados parecidos aqui e no Minha Agenda. Os outros 1.837 já estão prontos." em 14 px, `line-height: 1.45`, `#5F574E`, com 8 px entre os dois;
     - **o cartão do serviço decidido** ("Corte feminino"): `padding: 16px`, raio 16 px, borda de 1 px `#E5DED4`, fundo `#FFFDFA`, 12 px entre as partes; o nome em 15 px 600 à esquerda e "serviço · preço e duração diferentes" em 12 px `#716859` à direita; duas peças lado a lado (`flex: 1`, 8 px de espaço, `padding: 10px 12px`, raio 12 px): "Avenly" com borda de 1,5 px `#0F5F63` e fundo `#EDF4F3`, o rótulo em 11 px 600 maiúsculo `letter-spacing: .06em` `#0F5F63` e o valor "45 min · R$ 90" em 14 px 600, e "Minha Agenda" com borda de 1 px `#D6CEC2`, o rótulo `#716859` e o valor "50 min · R$ 95" em `#5F574E`; abaixo, o visto `#2E7D4F` de 14 px e "Vai manter o da Avenly" em 13 px `#5F574E`;
     - **o cartão do cliente em aberto** ("Ana Paula · Ana P. Souza", "cliente" à direita): a pergunta "Mesmo telefone, nomes diferentes. São a mesma pessoa?" em 14 px, `line-height: 1.4`, `#5F574E`, e dois botões lado a lado (`flex: 1`, 40 px, raio 12 px, borda de 1 px `#D6CEC2`, 14 px 600): "Sim, juntar" e "Não, manter separadas";
     - **o cartão fechado** ("Escova"): `padding: 14px 16px`, raio 16 px, o nome em 15 px 600, "serviço · duração diferente" em 13 px `#716859` embaixo, e o chevron para baixo de 20 px `#716859` à direita.
   - O rodapé (`padding: 12px 20px 46px`, 10 px de espaço): "Continuar" com 52 px, raio 14 px, fundo `#0F5F63`, texto `#F7F4EF` 16 px 600, e a nota "Itens sem decisão ficam de fora até você resolver." em 12 px `#716859`, centralizada.
   - A legenda do quadro: "Conflitos em linguagem leiga, um por vez, sem bloquear os 1.837 registros válidos. Nomes parecidos nunca são juntados sem confirmação."
   - No tablet e no desktop, o Developer lê os valores de cada arquivo para o seu device, sem deduzi-los do mobile.
2. **O app hoje.** `ImportConflictsScreen` (`features/imports/ImportConflictsScreen.tsx`) tem duas telas:
   - a lista de categorias ("Itens que precisam da sua decisão", uma linha por categoria com o número em `Badge`, e "Voltar");
   - a categoria (`ConflictCategoryScreen`): lê `listImportItems(sessionId, category, { status: "NEEDS_REVIEW", limit: 20, offset })`, com "Carregar mais"; cada item mostra o `label` e `conflictReasonLabel(reasonCode)` com "Resolver"; aberto, um `fieldset` de rádios com as decisões de `decisionsForCategory` (`INCLUDE`, `MERGE_WITH_EXISTING`, `CREATE_NEW`, `KEEP_EXISTING` e `EXCLUDE` em serviço e cliente; `INCLUDE` e `EXCLUDE` nas outras), o campo "Identificador do cadastro existente" quando a decisão pede alvo (`decisionRequiresTarget`), "Cancelar" e "Confirmar decisão"; em `AVAILABILITY`, as duas grades (`AvailabilityGridPreview`) com "Manter meus horários" (`EXCLUDE`) e "Usar os horários da Minha Agenda" (`INCLUDE`); o item decidido sai da lista; `IMPORT_ITEM_ALREADY_DECIDED` vira "Já decidido".
   - A prop `initialCategory` (Goal135) abre direto numa categoria, e voltar dela sai da tela.
3. **O que as decisões fazem** (`applyImportDecision`, `internal-api/routes.ts`, sem mudança): `EXCLUDE` resolve como `SKIPPED`; `MERGE_WITH_EXISTING` e `KEEP_EXISTING` resolvem como `IMPORTED` apontando para o cadastro escolhido e gravam `ExternalEntityMap` (os agendamentos importados depois usam esse cadastro), sem mudar o cadastro; `INCLUDE` e `CREATE_NEW` devolvem o item a `PENDING`, e a execução cria um cadastro novo. A decisão é registrada **uma vez** e não pode ser desfeita. Nenhuma decisão de hoje troca os valores de um serviço existente pelos da origem (D-150, item 8).
4. **O que o item traz** (D-150): em `SERVICE` e `CUSTOMER`, `candidates` (no serviço, `internalId`, `name`, `durationMinutes`, `priceType`, `price` e `active`; no cliente, `internalId` e `name`), na ordem gravada, sem o cadastro apagado, lista vazia sem candidato; em `SERVICE`, `proposedService` (`durationMinutes`, `priceType`, `price` da origem, ou `null`). Itens anteriores à migration podem vir sem candidato até a próxima análise.
5. **Os motivos em revisão** (`import-preview-service.ts`): `SERVICE_MATCH_DIVERGENT` (um candidato), `SERVICE_MATCH_AMBIGUOUS` (dois ou mais), `SERVICE_MATCH_SIMILAR` (um ou mais), `SERVICE_DURATION_MISSING` (prevalece sobre a correspondência e **pode trazer candidatos**, porque `classifyService` os calcula antes), `CUSTOMER_MATCH_AMBIGUOUS`, `CUSTOMER_MATCH_SIMILAR`, `AVAILABILITY_*` e os motivos de agendamento. `CUSTOMER_NAME_MISSING` sozinho e `CUSTOMER_PHONE_SHARED` saem `PENDING`, **sem candidato**, e não chegam a esta tela.
6. **O cliente do quadro não é um caso em revisão hoje.** "Mesmo telefone, nomes diferentes. São a mesma pessoa?" é o `CUSTOMER_PHONE_SHARED`, que o Scheduling trata como normal (`PENDING`, sem candidato, cadastro novo separado). O vault diz "Mesmo telefone, nomes claramente diferentes? — Manter separados e pedir decisão" (pergunta 793 de `99-Perguntas-e-Respostas.md`) e "Não mesclar silenciosamente" (R13-original-367). A parte "manter separados" já vale; "pedir decisão" pede mudar a classificação no Scheduling, fora deste Goal (frontend só), e fica registrada como observação para uma passada própria. A captura usa um cliente `CUSTOMER_MATCH_SIMILAR`, que tem a mesma forma de decisão.
7. **A captura alcança a tela sem gravar.**
   - A conta `onboarding` da captura não tem sessão de importação. Com `GET /v1/calendar/imports` fixo numa sessão `READY` não executada e `GET .../preview` fixo com itens em revisão, `ImportPreviewScreen` abre no resumo com `ConflictsZone` ("Revisar conflitos"), que só troca o modo da tela, sem pedido.
   - `responses` compara o caminho exato, sem a query (`scripts/lib/visual-responses.mjs`), e só `GET` entra. `scripts/visual-compare.mjs` captura com `reducedMotion: "reduce"`. Hoje `Onboarding-2-Importacao.dc.html` tem sete donos de `responses` (2.I3, 2.I4, 2.I5, 2.I7, 2.I8, 2.I9 e 2.I10), e `scripts/tests/visual-responses.test.mjs` afirma a lista fechada.
   - Nenhum passo pode tocar uma decisão: ela sai por `POST`, que não tem resposta fixa e gravaria.
8. **Testes que citam o que muda.** `goal020-import-conflicts`, `goal020-a11y`, `goal020-import-run`, `goal020-reachability`, `goal020-shell-invariant`, `goal062-import` (a comparação dos horários), `goal120-importacao-recusas`, `goal133-andamento` e `goal135-pendencias` citam `ImportConflictsScreen`, "Identificador do cadastro existente", "Confirmar decisão" ou "Itens que precisam da sua decisão". O Developer procura também por "Resolver", "Carregar mais", "Já decidido", "Revisar conflitos", "Manter meus horários" e `DECISION_LABELS`, e lista os que montam a tela.
9. **O gate autenticado.** A conta do gate não tem sessão de importação, e `ONBOARDING_ROUTES` (`e2e/routes.ts`) mede `/onboarding/importacao` na origem (D-119 (f)). Uma busca em `e2e/authenticated-matrix.spec.ts` por "Revisar conflitos", "precisam da sua decisão" e "Resolver" não achou nada nesta passada; o Developer repete a busca e registra o resultado.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do 2.I6: os valores inline de px, cor, fonte, raio e espaçamento, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device: `Onboarding-2-Importacao.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop.
2. **Uma lista só, no lugar das duas telas.**
   - `ImportConflictsScreen` deixa de ter a lista de categorias e a tela por categoria: mostra **uma lista de cartões**, com os itens em revisão de todas as categorias recebidas em `categories`, na ordem de `CATEGORY_ORDER` e, dentro da categoria, na ordem da resposta.
   - **Leitura:** uma `listImportItems(sessionId, category, { status: "NEEDS_REVIEW", limit: 20, offset: 0 })` por categoria com `needsReviewCount > 0`, canceladas ao desmontar (`AbortController`). Enquanto lê, a lista tem `aria-busy` e "Carregando itens…". Com mais itens que os lidos, "Carregar mais" (ação de texto) no fim da lista lê a página seguinte da primeira categoria que ainda tem itens.
   - **Falha:** se uma leitura falhar, a tela mostra o que leu e, acima da lista, "Não foi possível carregar todos os itens agora." (`role="alert"`); se todas falharem, o `StatePanel` de erro de hoje ("Itens indisponíveis"). "Continuar" nunca fica bloqueado.
   - **`initialCategory`:** a lista mostra só os itens dessa categoria, e o título conta só ela. "Continuar" sai da tela, como voltar faz hoje.
3. **O topo.**
   - O título é o único `h1`: "<N> registros precisam da sua decisão", com N = a soma de `needsReviewCount` das categorias mostradas, no singular quando N é 1 ("1 registro precisa da sua decisão"). N não muda enquanto a tela está aberta, como no quadro (o cartão decidido continua contado).
   - A descrição: "Encontramos dados parecidos aqui e no Minha Agenda." e, quando a prop nova opcional `readyCount` é maior que zero, "Os outros <N> já estão prontos." (com N igual a 1, "O outro já está pronto."), em `importCountFormatter`. `ImportPreviewScreen` passa a soma, nas categorias selecionadas, de `discoveredCount − needsReviewCount`; `ImportRunScreen` passa `progress.counts.imported`. Sem `readyCount`, só a primeira frase.
   - Sem o eyebrow "Importação" (`ImportsPage` como no 2.I7 e no 2.I8).
4. **O cartão, um por vez.**
   - Cada item é um cartão com a forma do quadro: o título e o motivo curto no cabeçalho, o corpo da decisão e, depois de decidido, a linha do resultado.
   - **Só um cartão sem decisão fica aberto por vez:** ao abrir a tela, o primeiro; os outros sem decisão ficam fechados, como o "Escova" do quadro, num `button` com `aria-expanded="false"` e nome acessível com o título e o motivo curto. Tocar um cartão fechado o abre e fecha o que estava aberto sem decisão. Depois de uma decisão, o próximo cartão sem decisão na ordem abre sozinho.
   - **O cartão decidido fica na lista** até sair da tela, com o resultado (escolha 6) e sem ações, como o "Corte feminino" do quadro. A tela não relê a lista depois da decisão.
   - "Já decidido" (`IMPORT_ITEM_ALREADY_DECIDED`) continua: o cartão mostra "Este item já foi decidido antes de você confirmar." sem ações. O erro de decisão continua com `role="alert"` e o texto de hoje, dentro do cartão.
5. **O corpo da decisão, pelo que o item traz, não pelo texto do motivo.**
   - **Serviço com candidato** (`SERVICE` e `candidates` não vazio, qualquer motivo, inclusive `SERVICE_DURATION_MISSING`):
     - com **um** candidato: as duas peças do quadro, "Avenly" com a duração e o preço do candidato e "Minha Agenda" com os de `proposedService`, e os botões "Manter o da Avenly" (`KEEP_EXISTING` com `targetInternalId` do candidato) e "Criar outro serviço" (`CREATE_NEW`);
     - com **dois ou mais**: uma peça por candidato, como `radio` de um `radiogroup` ("Qual serviço da Avenly é este?"), cada uma com o nome, a duração e o preço, a peça "Minha Agenda" sem escolha, e os botões "Manter o escolhido" (`KEEP_EXISTING` com o candidato escolhido, desabilitado sem escolha) e "Criar outro serviço";
     - a duração e o preço com `formatServiceDuration` e `formatServicePrice` (`features/services/serviceFormatting.ts`), os mesmos de Serviços; valor desconhecido da origem aparece como esses formatadores o escrevem ("sem duração", "sem preço informado"); `proposedService` nulo dá "Valores não informados";
     - sem decisão, as duas peças com a borda neutra (`#D6CEC2`), porque nada é mantido sem escolha; a peça escolhida ganha o estilo "Avenly" do quadro (borda de 1,5 px `#0F5F63`, fundo `#EDF4F3`) **só** depois da decisão.
   - **Cliente com candidato** (`CUSTOMER` e `candidates` não vazio):
     - com **um** candidato: o título "<label> · <nome do candidato>", a pergunta por motivo e os botões "Sim, juntar" (`MERGE_WITH_EXISTING` com `targetInternalId` do candidato) e "Não, manter separadas" (`CREATE_NEW`);
     - com **dois ou mais**: o título é o `label`, e uma lista de `radio` com o nome de cada candidato ("Qual cliente da Avenly é esta pessoa?"); "Sim, juntar" fica desabilitado sem escolha;
     - a pergunta: `CUSTOMER_MATCH_SIMILAR` dá "Nomes parecidos. São a mesma pessoa?"; `CUSTOMER_MATCH_AMBIGUOUS` dá "Mais de um cliente com o mesmo nome e telefone. Qual é a mesma pessoa?"; `CUSTOMER_PHONE_SHARED` dá "Mesmo telefone, nomes diferentes. São a mesma pessoa?" (o texto do quadro, pronto para quando o Scheduling pedir essa decisão; evidência 6); qualquer outro, "Parece alguém que já está na Avenly. São a mesma pessoa?". Nenhum dado do cliente além do nome aparece (D-150, item 4).
   - **Serviço ou cliente sem candidato** (lista vazia ou ausente): o texto longo de `conflictReasonLabel` como parágrafo e os botões "Importar mesmo assim" (`INCLUDE`) e "Não importar" (`EXCLUDE`). Num `SERVICE_MATCH_*` ou `CUSTOMER_MATCH_*` sem candidato, o parágrafo é "O cadastro sugerido não está mais na Avenly." e o primeiro botão é "Criar outro serviço" ou "Manter separadas" (`CREATE_NEW`).
   - **Horários** (`AVAILABILITY`): as duas grades de hoje (`AvailabilityGridPreview`, "Horários atuais" e "Horários do Minha Agenda") no corpo do cartão, com "Manter meus horários" (`EXCLUDE`) e "Usar os horários da Minha Agenda" (`INCLUDE`), com a mesma regra do grupo (Goal062); só a forma muda.
   - **Outras categorias:** o parágrafo de `conflictReasonLabel` e "Importar mesmo assim" (`INCLUDE`) e "Não importar" (`EXCLUDE`).
   - **"Não importar" em serviço e cliente com candidato:** uma ação de texto abaixo dos botões, "Não importar este item" (`EXCLUDE`), para que nenhum resultado de hoje deixe de ser alcançável. É divergência declarada.
   - **Nenhuma decisão pede identificador digitado.** O campo "Identificador do cadastro existente", o `fieldset` de rádios das cinco decisões, "Resolver", "Cancelar" e "Confirmar decisão" saem. Cada botão envia a decisão na hora, com a chave de idempotência e o guarda de dupla submissão de hoje (todos os botões do cartão desabilitados enquanto envia, o tocado com o texto ocupado "Enviando...").
6. **O motivo curto e o resultado**, por acréscimo em `labels.ts`:
   - **Motivo curto** (cabeçalho, 12 px aberto e 13 px fechado, `#716859`): `SERVICE_MATCH_DIVERGENT` dá "serviço · duração diferente", "serviço · preço diferente" ou "serviço · preço e duração diferentes", pela regra de D-150 item 3 aplicada ao primeiro candidato e a `proposedService` (valor desconhecido da origem nunca diverge; sem candidato, "serviço · valores diferentes"); `SERVICE_MATCH_SIMILAR` dá "serviço · nome parecido"; `SERVICE_MATCH_AMBIGUOUS` dá "serviço · mais de um com esse nome"; `SERVICE_DURATION_MISSING` dá "serviço · sem duração"; todo item de `CUSTOMER` dá "cliente", como no quadro; outros, `CATEGORY_SINGULAR_LABELS` em minúscula. `conflictReasonLabel` ganha o texto longo de `SERVICE_MATCH_DIVERGENT` ("Esse serviço já existe na Avenly com outra duração ou outro preço. Compare e escolha qual fica.").
   - **Resultado** (o visto `#2E7D4F` de 14 px, `aria-hidden`, e o texto em 13 px `#5F574E`): `KEEP_EXISTING` dá "Vai manter o da Avenly"; `CREATE_NEW` em serviço dá "Vai entrar como outro serviço"; `MERGE_WITH_EXISTING` dá "Vai juntar com <nome do candidato>"; `CREATE_NEW` em cliente dá "Vão ficar separadas"; `INCLUDE` dá "Vai ser importado"; `EXCLUDE` dá "Não vai ser importado"; nos horários, "Vai manter seus horários" e "Vai usar os horários da Minha Agenda". O resultado é anunciado num `role="status"` do cartão.
   - `DECISION_LABELS`, `decisionsForCategory` e `decisionRequiresTarget` só mudam se ficarem sem consumidor; nesse caso o Developer os remove e lista no relatório.
7. **O rodapé.** "Continuar" (primário, 52 px, a medida e a cor do quadro) chama `onBack`, com o mesmo efeito do "Voltar" de hoje (a prévia volta ao resumo; a tela parada relê o andamento), e a nota "Itens sem decisão ficam de fora até você resolver." (`importacao` não importa item em revisão, e a conclusão com `acceptPending` não o importa; D-149). O "Voltar" de hoje sai.
8. **CSS.** As regras ficam em `shared/styles/avenly-imports.css`, em classes novas escopadas (`.imports-conflicts*` ou nomes equivalentes), sem alterar regra que a origem, as credenciais, a análise, a prévia, a escolha, o andamento, as pendências, a confirmação, a conclusão, `/importacao` (I1, I2) ou Configurações › Agenda usam. As classes antigas que ficarem sem uso (`.imports-conflict-row`, `.imports-conflict-item*`, `.imports-decision-option*`) são removidas só se nenhum outro arquivo as usar. Movimento só com `prefers-reduced-motion: no-preference`. Os `h2` do cartão, se houver, recebem a cor do quadro explicitamente (lição 5).
9. **O alvo.** `targets.json`, de `Onboarding-2-Importacao.dc.html`, código `2.I6`, label "Conflitos da importação", `account: "onboarding"`, rota `/onboarding/importacao`, `sessionId` `visual-compare-import-conflicts`, diferente dos de 2.I3, 2.I4, 2.I5, 2.I7, 2.I8, 2.I9, 2.I10 e I1.
   - **Respostas fixas**, válidas contra os schemas do contrato:
     - `GET /v1/calendar/imports`: `right` disponível com o mesmo `sessionId`; `session` `READY`, `previewVersion` 1, `startedAt` nulo, sem interrupção e sem erro, todas as categorias `selected`.
     - `GET /v1/calendar/imports/visual-compare-import-conflicts/preview`: as categorias do 2.I4 (12 serviços, 386 clientes, 42 agendamentos futuros, 1.400 atendimentos anteriores e 6 regras de horário, todas `sourceSupported`), com `needsReviewCount` 2 em `SERVICE`, 1 em `CUSTOMER` e 0 nas outras.
     - `GET .../categories/SERVICE/items`: dois itens `NEEDS_REVIEW` `SERVICE_MATCH_DIVERGENT`: "Corte feminino" com um candidato "Corte feminino" (45 min, `FIXED`, 90, ativo) e `proposedService` (50 min, `FIXED`, 95); "Escova" com um candidato "Escova" (40 min, `FIXED`, 70, ativo) e `proposedService` (50 min, `FIXED`, 70).
     - `GET .../categories/CUSTOMER/items`: um item `NEEDS_REVIEW` `CUSTOMER_MATCH_SIMILAR`, `label` "Ana Paula", com um candidato `{ internalId, name: "Ana P. Souza" }` e sem `proposedService`.
   - **Um passo:** `clickRole` no `button` "Revisar conflitos". Nenhum passo toca um cartão, um botão de decisão ou "Continuar".
   - As `notes` dizem por que as respostas são fixas, que a tela só lê esses quatro `GET`, que o passo não grava e citam **todas** as divergências visíveis (lição 5).
10. **Captura, teste.**
    - `scripts/tests/visual-responses.test.mjs` passa a aceitar 2.I3, 2.I4, 2.I5, 2.I6, 2.I7, 2.I8, 2.I9 e 2.I10 como os únicos donos de `responses` em `Onboarding-2-Importacao.dc.html`. Prova que o 2.I6 só declara os quatro `GET` da escolha 9 e só tem o `clickRole` em "Revisar conflitos".
    - Um teste `goal137` valida cada resposta contra o schema do contrato (`importStateSchema`, o schema que a leitura da prévia usa — `importPreviewSnapshotSchema` ou `importPreviewSchema` — e `importItemsPageSchema`) e confere: o mesmo `sessionId` no direito, na sessão, no caminho e nas páginas, diferente dos outros alvos da importação; o número de itens de cada página igual ao `needsReviewCount` da categoria e todos `NEEDS_REVIEW`; cada item de serviço com `candidates` e `proposedService`; o candidato de cliente só com `internalId` e `name`.
11. **Gate autenticado.** Pela evidência 9, o marcador de `onboarding-importacao` não muda. Se a busca achar um bloco que toque a tela de conflitos, o Developer o ajusta **só para provar a tela nova, sem afrouxar asserção**, e registra o ajuste em D-151 e no relatório. Esse arquivo entra no critério 8 só para isso.
12. **Divergências declaradas.**
    - O cartão do serviço aberto e sem decisão na captura, no lugar do "Corte feminino" decidido do quadro: a decisão sai por `POST`, e nenhum passo grava; os botões "Manter o da Avenly" e "Criar outro serviço", a ação "Não importar este item" e as duas peças com a borda neutra.
    - A ordem dos cartões por categoria (os dois serviços e depois o cliente), e o cliente fechado na captura, por "um por vez".
    - A pergunta do cliente "Nomes parecidos. São a mesma pessoa?", no lugar da do quadro, que é o `CUSTOMER_PHONE_SHARED` que o Scheduling não põe em revisão (evidência 6).
    - "Os outros 1.843 já estão prontos." no lugar de "1.837": a soma conta as 6 regras de `AVAILABILITY`, como em D-147 e D-149.
    - O preço como `formatServicePrice` o escreve, se não for "R$ 90".
    - O preenchimento dos segmentos da barra do topo, derivado por `chapterFraction` (D-104); o chevron do topo, que a moldura não mostra na etapa `importacao` (D-145); o "Sair" (D-104); o estado do item "Sua agenda" na sidebar; a barra de status e o indicador de início do iPhone.
    - Sem as animações de entrada e as transições na captura (`reduce`).

    O Developer registra outras que encontrar nas `notes` do alvo e em D-151, com o motivo.
13. **Decisão.** O Developer propõe **D-151**, por acréscimo, depois das provas, cobrindo: a tela como o 2.I6, nas duas molduras e nas duas entradas; a lista única no lugar das duas telas, a leitura por categoria e a falha; "um por vez" e o cartão decidido que fica; o corpo da decisão pelo que o item traz e o mapeamento de cada botão para a decisão do contrato; o fim do identificador digitado; o motivo curto e o resultado; `readyCount`; o alvo 2.I6; as divergências; e a observação da evidência 6 (o `CUSTOMER_PHONE_SHARED` e a pergunta 793), sem decidi-la. D-149 e D-150 não são editadas.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/imports/ImportConflictsScreen.tsx`: a tela inteira (escolhas 2 a 7), mantendo a assinatura (`categories`, `initialCategory`, `onBack`, `sessionId`) e acrescentando só `readyCount` opcional.
2. Um ou mais componentes novos em `features/imports/` para o cartão, se o Developer não os escrever em `ImportConflictsScreen.tsx`.
3. `features/imports/ImportPreviewScreen.tsx` e `features/imports/ImportRunScreen.tsx`: só passar `readyCount` (escolha 3).
4. `features/imports/labels.ts`: só os textos e as funções novas da escolha 6, por acréscimo, sem mudar `CATEGORY_ORDER`, `CATEGORY_LABELS`, `CATEGORY_SINGULAR_LABELS`, `importReviewCopy`, `STATUS_LABELS` nem os textos longos de hoje de `conflictReasonLabel`.
5. `shared/styles/avenly-imports.css`: o CSS do 2.I6 nos quatro devices (escolha 8).

`ImportsScreen.tsx`, `ImportDoneScreen.tsx`, `ImportHistoryCard.tsx`, `ConnectSourceScreen.tsx`, `ImportOriginScreen.tsx`, `ImportEmptyScreen.tsx`, `ImportsLayout.tsx`, `features/services/` (só importado), `shared/ui/`, `features/onboarding/`, `features/settings/`, `data/services/`, o contrato, o BFF e o Scheduling não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o 2.I6 novo (escolha 9). Os outros alvos não mudam.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal137-*.test.tsx` / `.test.ts`:
   - **Lista e topo:** uma leitura por categoria com `needsReviewCount > 0`, com `status: "NEEDS_REVIEW"` e `limit: 20`, e nenhuma de categoria sem revisão; os cartões na ordem de `CATEGORY_ORDER`; o título com N e o singular; a descrição com e sem `readyCount` e o singular; "Carregar mais"; a falha de uma leitura com a nota e "Continuar" livre; a falha de todas com o `StatePanel`; `initialCategory` só com a categoria; "Continuar" chamando `onBack`; um só `h1`; sem o campo "Identificador do cadastro existente".
   - **Um por vez:** só o primeiro aberto; tocar um fechado abre esse e fecha o outro; depois da decisão, o próximo abre; o decidido fica com o resultado e sem ações; `aria-expanded` e o nome acessível do cartão fechado.
   - **Mapeamento:** serviço com um candidato ("Manter o da Avenly" envia `KEEP_EXISTING` com o `internalId` do candidato; "Criar outro serviço" envia `CREATE_NEW` sem alvo); serviço com dois candidatos (sem escolha, desabilitado; com escolha, `KEEP_EXISTING` com o escolhido); `SERVICE_DURATION_MISSING` com candidato; cliente com um candidato ("Sim, juntar" envia `MERGE_WITH_EXISTING` com o alvo; "Não, manter separadas" envia `CREATE_NEW`); cliente com dois; item sem candidato (`INCLUDE` e `EXCLUDE`) e `SERVICE_MATCH_*` sem candidato (`CREATE_NEW`); "Não importar este item" (`EXCLUDE`); horários (`EXCLUDE` e `INCLUDE`, como hoje); agendamento (`INCLUDE` e `EXCLUDE`); cada pedido uma vez, com a chave, e os botões desabilitados enquanto envia; `IMPORT_ITEM_ALREADY_DECIDED` e o erro com `role="alert"`.
   - **Valores e textos:** as duas peças com os valores do candidato e da origem; "sem duração", "sem preço informado" e "Valores não informados"; o motivo curto de cada caso da escolha 6, inclusive valor desconhecido da origem sem divergência; a pergunta de cada motivo de cliente; o resultado de cada decisão; nenhum telefone na tela.
   - **O que não muda:** as duas entradas (a prévia e a tela parada, inclusive "Corrigir" e "Nomear" com `initialCategory`) e as duas molduras com a mesma tela; o resumo e a tela parada sem outra mudança além de `readyCount`.
   - **Alvo:** os testes `goal137` da escolha 10.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) "Manter o da Avenly" enviando `KEEP_EXISTING` sem `targetInternalId` faz um teste reprovar;
   - (b) "Criar outro serviço" enviando `KEEP_EXISTING` faz um teste reprovar;
   - (c) "Sim, juntar" enviando `CREATE_NEW` faz um teste reprovar;
   - (d) devolver o campo "Identificador do cadastro existente" à tela faz um teste reprovar;
   - (e) abrir todos os cartões sem decisão ao mesmo tempo faz um teste reprovar;
   - (f) o motivo curto "serviço · duração diferente" quando só o preço difere faz um teste reprovar;
   - (g) contar a duração desconhecida da origem como diferente no motivo curto faz um teste reprovar;
   - (h) tirar o cartão decidido da lista faz um teste reprovar;
   - (i) o 2.I6 de `targets.json` com um passo que toca "Manter o da Avenly" faz reprovar **o teste `goal137` e `visual-responses.test.mjs`**;
   - (j) a prévia fixa com `needsReviewCount` de `SERVICE` diferente do número de itens da página faz o teste `goal137` reprovar.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 2).
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 8 só troca o texto ou a forma que este Goal muda (as duas telas que viram uma lista, "Resolver", o `fieldset`, o campo do identificador, "Cancelar", "Confirmar decisão", "Voltar" e o item decidido que fica). Nenhum ajuste afrouxa asserção sobre os pedidos, o corpo da decisão, a chave, o guarda, a regra do grupo dos horários, `IMPORT_ITEM_ALREADY_DECIDED` ou as outras telas. Cada ajuste é listado no relatório, com o que cada asserção removida provava e onde essa prova continua.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 2.I6` e, para regressão, `--target 2.I1,2.I2,2.I3,2.I4,2.I5,2.I7,2.I8,2.I9,2.I10,I1,I2`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 135.
   - **A captura de antes é da baseline `b119baf`, feita três vezes** (lição 1). O Developer guarda os 44 `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que os 44 não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido entre as três capturas da baseline, na tabela por imagem.
   - O Developer abre os **quatro** `side-by-side.png` do 2.I6 (protótipo × app) e lista no relatório as diferenças que restam e por quê (lição 3).
   - **Medidas**, em cada device, no app e no quadro, com a diferença em px: o topo do título, da descrição, do primeiro cartão e de "Continuar"; o `padding`, o raio e a borda do cartão; a altura e a largura das duas peças e o espaço entre elas; a altura dos botões do cartão; a altura do cartão fechado; a altura de "Continuar" e o topo da nota. Diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`).
- Pôr `CUSTOMER_PHONE_SHARED` em revisão com candidatos (evidência 6); a deduplicação da duplicata idêntica na execução e "usar os valores da Minha Agenda" num serviço existente (D-150, item 8); desfazer uma decisão.
- Os valores malformados da origem (pendência 1 do review136): a tela só mostra o que o contrato aceita.
- O resumo e a escolha (2.I4, 2.I5), o andamento (2.I7), as pendências e a confirmação (2.I8, 2.I9), a conclusão (2.I10, I1) e Configurações › Agenda, salvo `readyCount`.
- O comportamento do chevron e do "Sair" na etapa `importacao`.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3) e as outras observações abertas dos reviews 116 a 136.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-151** em `PROPOSED`, conforme a escolha 13. Inclui o contraste calculado de cada par de texto novo: `#221E1A` sobre `#F7F4EF` (o título); `#5F574E` sobre `#F7F4EF` (a descrição); `#221E1A` sobre `#FFFDFA` (o nome no cartão, em 15 px 600, e os botões do cartão, em 14 px 600); `#716859` sobre `#FFFDFA` (o motivo curto, em 12 px e em 13 px, e o rótulo "Minha Agenda", em 11 px 600); `#5F574E` sobre `#FFFDFA` (a pergunta, o valor da origem e o resultado); `#0F5F63` sobre `#EDF4F3` (o rótulo "Avenly", em 11 px 600) e `#221E1A` sobre `#EDF4F3` (o valor); `#716859` sobre `#F7F4EF` (a nota, em 12 px); `#F7F4EF` sobre `#0F5F63` ("Continuar"). Inclui também as bordas `#E5DED4` (cartão) e `#D6CEC2` (botões e peças), o visto `#2E7D4F` e o chevron `#716859` como contraste de não texto, e o alvo de toque dos botões de 40 px, do cartão fechado e de "Não importar este item". Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal137.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal137, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um, com os números;
  - a rodada de cada número, sem atribuir a uma rodada o que outra fez;
  - os controles negativos, a rodada em que rodaram, o teste que reprovou e a mensagem de asserção exata de cada um;
  - o `visual:compare` (percentuais, os quatro lados a lados, as medidas, a tabela por imagem do ruído das três capturas da baseline e da regressão, e as diferenças que restam);
  - a lista dos testes ajustados e o resultado da busca em `authenticated-matrix.spec.ts` (evidência 9).

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal137 na mesma rodada, para que nenhum deles descreva uma árvore anterior. Um gate rodado pelo IA Loop depois do relatório é registrado com o resultado dele, com o número, nunca como "pendente". O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos três registros acima.

## Validação e ordem

1. Conferir que o tipo `ImportItem` do frontend traz `candidates` e `proposedService` (lição 6). Montar a pilha descartável própria e capturar **três vezes**, na baseline `b119baf`, o `app.png` de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, 2.I8, 2.I9, 2.I10, I1 e I2. Medir o ruído entre as três capturas, por imagem. Buscar em `authenticated-matrix.spec.ts` (evidência 9) e listar os testes da evidência 8.
2. Implementar a lista, os cartões, o mapeamento, os textos, `readyCount` e o CSS, com os testes `goal137` deles e os ajustes dos testes existentes.
3. Adicionar o alvo 2.I6 e escrever os testes da captura. Conferir no navegador da captura que a tela não lê outro `GET` que precise de resposta fixa; se ler, só `GET` entra em `responses`, e o motivo vai nas `notes`.
4. Rodar o `visual:compare` do 2.I6, abrir os quatro lados a lados, medir, e rodar o da regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A tela de conflitos igual ao quadro 2.I6 nos 4 devices, salvo as divergências declaradas. Provado em jsdom, pelo `visual:compare`, pelos quatro lados a lados abertos e pelas medidas do §3.5.
2. Uma lista única dos itens em revisão, com o título e a descrição do quadro, "um por vez", o cartão decidido com o resultado, o motivo curto, "Continuar" e a nota; nenhuma decisão pede identificador digitado. Provado em jsdom.
3. Cada botão envia a decisão da escolha 5, com o `targetInternalId` do candidato só em `KEEP_EXISTING` e `MERGE_WITH_EXISTING`, uma vez, com a chave e o guarda; a regra do grupo dos horários, `IMPORT_ITEM_ALREADY_DECIDED` e os erros como hoje. Nenhuma rota muda, e nenhum dado do cliente além do nome aparece.
4. As duas entradas (a prévia e a tela parada, com `initialCategory`) e as duas molduras mostram a mesma tela; o resto da prévia e da tela parada só muda em `readyCount`.
5. 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, 2.I8, 2.I9, 2.I10, I1 e I2 iguais byte a byte à captura da baseline (`cmp` dos 44 `app.png`), ou com cada diferença dentro do ruído medido entre as três capturas da baseline, mostrada na tabela por imagem.
6. Nenhum passo de captura grava. O teste da captura prova que 2.I3, 2.I4, 2.I5, 2.I6, 2.I7, 2.I8, 2.I9 e 2.I10 são os únicos donos de `responses` no arquivo e que o 2.I6 só declara os quatro `GET` e só clica em "Revisar conflitos"; o teste `goal137` prova a coerência das respostas.
7. Os dez controles negativos reprovam, com a mensagem exata registrada, e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
8. No gate autenticado de `validate:integration`, `/onboarding/importacao` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440), na origem. O gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo, contraste, foco visível e `prefers-reduced-motion`; o 2.I6 não é alcançado por ele. As cores são as do quadro, com o contraste de cada par calculado e registrado em D-151; o alvo de toque dos botões, do cartão fechado e da ação de texto é provado em jsdom pelo CSS aplicado e pelas medidas do §3.5. `validate:ui`, `validate:core` e `test:gate` passam.
9. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json` e `scripts/tests/visual-responses.test.mjs`; `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no caso da escolha 11; os três registros da seção "Documentação".
10. D-151 proposta, conforme a escolha 13.

## Plano de execução

1. **WU-01 — A lista e os cartões de decisão.** As três capturas da baseline e o ruído por imagem, a conferência do tipo do contrato, a busca no spec do gate, a lista única, a leitura por categoria, "um por vez", o corpo da decisão e o mapeamento para o contrato, o motivo curto e o resultado em `labels.ts`, `readyCount` nas duas entradas, o CSS nos quatro devices, os testes `goal137` da tela e os ajustes dos testes existentes.
2. **WU-02 — O alvo.** O 2.I6 em `targets.json`, os testes da captura e os testes `goal137` do alvo.
3. **WU-03 — Fidelidade e controles.** O `visual:compare` do 2.I6, com os quatro lados a lados e as medidas, a regressão contra o ruído da baseline e os controles negativos, com as correções de medida que faltarem.
4. **WU-04 a WU-11 — Verificação determinística:** typecheck, lint e testes alvo `goal137`; suíte do frontend e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
5. **WU-12 — Registros.** D-151, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística escritos no registro.
6. **WU-13 — `git diff --check`.**
