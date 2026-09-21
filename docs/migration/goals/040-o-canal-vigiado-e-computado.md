# Goal 040 — O canal vigiado é computado: método de envio fora do token e origem de texto não seguida

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal039 ACCEPTED](../reviews/039-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 040 nasce na [v61 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 039, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `502a70c46be73cb50cab734fa76046a54d5af6be`

Goal anterior: 039 — O conjunto vigiado é computado: emissor de texto fora da dupla e chamador fora da pasta

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal039 já integrado em `main` (origem `6e7a14337282384ac807dbe6520140d85a83a272`), com `discoverSendTextSites` e `classifyNotificationTextSites` em resíduo zero sobre a árvore real, `classifyFrontendRouteSchemaCallSites` lendo `apps/frontend/src` inteiro, **D-055** registrada e o [review039](../reviews/039-review.md) em rodada única com zero blockers. O commit posterior `61ca858` corrige apenas o cabeçalho de status do documento do Goal039 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O 038 fechou a classe **dentro** de cada extrator: cada um enumera as categorias que reconhece e reprova o resíduo. O 039 fechou a classe um nível acima: o **escopo** de leitura deixou de ser lista escrita à mão e passou a ser a árvore inteira de um diretório de partida. O aceite do 039 declara, em uma frase, o limite que ele não tocou — *"escopo computado não é canal computado"*. Esta passada deu nome preciso a esse limite, e ele tem três formas, todas conferidas sobre esta baseline.

**A primeira é o canal em si.** O descobridor de emissores acha sítios por um token escrito à mão: `SEND_TEXT_TOKEN_PATTERN = /\bsendText\s*\(/g` (`apps/ai-orchestrator/tests/support/send-text-sites.ts:235`). A porta `WhatsAppProvider` (`apps/ai-orchestrator/src/modules/channel/ports/WhatsAppProvider.ts:37`) declara **dois** métodos — `sendText` (`:38`) e `downloadMedia?` (`:43`) — e o guard vigia **um**, pelo nome, digitado dentro do próprio módulo de teste. Um terceiro método na porta que leve texto ao número da cliente — envio de template, envio de mídia com legenda, envio em lote — não é reconhecido **nem** vira resíduo: some do conjunto e some da reprovação ao mesmo tempo. É o mesmo escape duplo que o 037 fechou para a crase, o 038 para o genérico ausente e o 039 para a pasta, agora pela forma do **método**.

**A segunda é a categoria que afirma mais do que o descobridor prova.** `product_own_text_to_customer` é atribuída a dois sítios (`send-text-sites.ts:214` e `:222`; distribuição afirmada em `tests/assistant/assistant.service.test.ts:1224`) e **nada** liga essa categoria ao conjunto `VERIFIED_CLIENT_TEXTS`. O nome diz "texto próprio do produto para a cliente"; a prova é outra coisa, montada em separado a partir dos exports de `notification-message.ts` e de `PRODUCT_OWN_TEXTS`. Os dois lados podem divergir sem que nada caia. Pior, o segundo sítio é reconhecido por `hasComposeNotificationTextAssignmentBefore` (`:197`), que é de **escopo de arquivo**: ele procura a última `const text = composeNotificationText(` em qualquer ponto anterior do arquivo, em qualquer bloco. Um segundo `sendText({ text })` no mesmo arquivo, com `text` de outra origem, herda a categoria sem que a origem seja a mesma — a classificação mais frouxa das cinco, como o [review039](../reviews/039-review.md) registrou.

**A terceira é a origem nomeada que ninguém segue.** `text_in_transit_named_origin` preenche `origin` com o **nome do parâmetro** de onde o texto veio (`/^([A-Za-z_$][\w$]*)\.text$/`, `send-text-sites.ts:228`) — `message` em `PlatformWhatsAppSender.ts:100`, `input` em `ActivationTestReplySender.ts:122`. Nome de parâmetro não é produtor. Nada confere quem chama essas funções nem que texto elas recebem. Hoje as duas cadeias fecham: `PlatformWhatsAppSender.sendToTenantUnderTest` tem **um** chamador (`ActivationTestService.ts:852`, dentro de `sendAsClient`) e `ActivationTestReplySender.sendAiReply` tem **um** (`ActivationTestAiDriver.ts:228`, em `deliverReply`). Fechar de fato e ser provado fechado são coisas diferentes: um chamador novo de qualquer uma das duas, compondo texto próprio na hora, entrega esse texto à cliente com o guardrail de espera sem ver nada.

Conferido, e é o que faz este Goal ser fechamento de classe e não conserto: **hoje não há violação real em nenhuma das três**. `downloadMedia` não carrega texto; os dois sítios `product_own_text_to_customer` de hoje têm a origem que a categoria afirma; as duas cadeias de trânsito têm um chamador cada, e nenhum deles compõe texto próprio. O resultado esperado é achado zero. A regra existe para o dia em que houver — que é o dia em que ninguém vai reler este documento.

O risco próprio deste Goal é o mesmo do 038 e do 039, deslocado mais uma vez: **descobrir demais**. Um seguidor de chamadores que trate qualquer função com parâmetro `text` como cadeia de emissão transforma helper, log e teste em resíduo, e o caminho de menor resistência passa a ser afrouxá-lo. E um classificador de métodos de porta que trate qualquer método como emissor transforma `downloadMedia` em resíduo. Por isso a exigência central é a mesma das duas passadas anteriores: **enumerar o que se reconhece**, com categorias nomeadas no código e resíduo zero provado sobre a árvore real.

Quatro decisões de planejamento já estão tomadas e **não** são do Developer:

- **Método de porta não classificado reprova; não é aviso.** Todo método declarado em `WhatsAppProvider` cai em exatamente uma categoria nomeada, com o motivo escrito junto. Método novo sem categoria derruba o teste, com arquivo e linha.
- **Categoria de emissor que afirma texto próprio do produto é ligada ao conjunto verificado.** Sítio cuja categoria diz "texto próprio do produto" nomeia o compositor e o compositor entra em `VERIFIED_CLIENT_TEXTS`; sítio que carrega texto emitido pelo modelo é **categoria própria e declarada**, com a fronteira de **D-050** escrita como motivo — não é omissão nem é o mesmo balde.
- **Origem em trânsito é seguida até o chamador, dentro de `apps/ai-orchestrator/src`.** Chamador de função de trânsito que não cai em categoria nomeada é resíduo. Seguir para fora do repositório, ou para dentro de `apps/scheduling-service/`, não está no escopo.
- **`apps/*/src/` não é editado, e `PRODUCT_OWN_TEXTS` não muda.** Tudo o que este Goal constrói mora na camada de teste, lendo a árvore de produção e executando os exports que já existem. Achado zero é o resultado esperado e **não** é o critério de sucesso: o que prova o Goal é o descobridor funcionando sobre a árvore real com resíduo zero **e** os controles negativos mordendo. Violação real encontrada em código de produção vira **achado a partir de A-24**, com classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) — não vira correção silenciosa.

## Dependências e contexto mínimo

- Goals 001 a 039 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review039](../reviews/039-review.md): as quatro observações não bloqueantes e a seção "O que este aceite não cobre", em especial *"escopo computado não é canal computado"*, que é a frase que este Goal endereça.
- [FINAL_AUDIT §16](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o registro de que nenhum achado novo entrou a partir de A-24.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e os checks dos Goals 035 a 039.
- [DECISIONS](../DECISIONS.md): **D-050** (guardrail sobre texto próprio do produto, não sobre texto do modelo), **D-052** (a rigidez mora no produtor), **D-053** (conjunto único de textos), **D-054** (reconhecimento por forma exige resíduo declarado) e **D-055** (o escopo de um guard é computado como o conteúdo dele já é; o limite de canal único está registrado ali). As cinco continuam valendo inteiras.
- [AGENTS.md](../../../AGENTS.md): o guardrail que proíbe mensagem técnica de espera é o produto que este fechamento existe para proteger.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.

### Fatos já confirmados na baseline, sem precisar redescobrir

- `WhatsAppProvider` declara **dois** métodos: `sendText(input: SendTextInput): Promise<SendTextResult>` (`:38`) e `downloadMedia?(input: DownloadMediaInput): Promise<DownloadMediaResult>` (`:43`). Só o primeiro carrega texto.
- `send-text-sites.ts` tem 331 linhas e reconhece o canal por `SEND_TEXT_TOKEN_PATTERN` (`:235`); as cinco categorias são `port_declaration`, `adapter_implementation`, `product_own_text_to_customer`, `text_in_transit_named_origin` e `person_typed_text`.
- Os **7** sítios da árvore real, com resíduo zero: `WhatsAppProvider.ts:38` (porta), `EvolutionProvider.ts:36` (adapter), `message-graph.ts:1207` e `NotificationDeliveryService.ts:318` (`product_own_text_to_customer`, distribuição afirmada como `2`), `PlatformWhatsAppSender.ts:98` e `ActivationTestReplySender.ts:120` (`text_in_transit_named_origin`, `origin` = `message` e `input`), `internal/routes.ts:705` (`person_typed_text`).
- `message-graph.ts:1209` envia `state.response.text` — a resposta do turno, que carrega tanto texto emitido pelo modelo quanto os seis textos próprios do módulo que já estão em `PRODUCT_OWN_TEXTS`.
- `hasComposeNotificationTextAssignmentBefore` (`:197`) casa `/\bconst\s+text\s*=\s*composeNotificationText\s*\(/` em qualquer ponto anterior do arquivo, sem limite de bloco.
- `PlatformWhatsAppSender.sendToTenantUnderTest` (`:79`) tem um único chamador em `apps/ai-orchestrator/src`: `ActivationTestService.ts:852`. `ActivationTestReplySender.sendAiReply` (`:105`) tem um único chamador: `ActivationTestAiDriver.ts:228`.
- `apps/ai-orchestrator/tests/support/` tem **três** arquivos: `send-text-sites.ts`, `notification-message-sites.ts` e `vocabulario-de-espera.ts`. `VOCABULARIO_DE_ESPERA` continua com uma única definição.
- Números da baseline, para comparar depois: `audit:static` com **34** checks (33 `passed`, 1 `skipped` declarado); `scripts/tests/final-production-audit-legacy-regression.test.mjs` com **64 pass**; `npm run test:gate` com **226 pass, 0 fail, 0 skipped**; `tests/assistant/assistant.service.test.ts` com **37** testes; `validate:integration` com **35** passos; `scripts/tests/` com 15 arquivos.
- Do lado do contrato público, inalterado por este Goal: 194 arquivos lidos em `apps/frontend/src`, 117 sítios de `routeSchema` (`definition=1, literal_pattern=116`), 116 rotas registradas no BFF e **uma** rota sem chamador (a de mídia).

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/send-text-sites.ts` — o descobridor de emissores: conjunto de métodos, classificação de origem e seguimento de chamador.
- `apps/ai-orchestrator/tests/support/` — módulo novo, se o seguidor de chamadores ficar desproporcional dentro de `send-text-sites.ts`.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — a enumeração afirmada, as categorias declaradas e a ligação com `VERIFIED_CLIENT_TEXTS`.
- Teste novo em `apps/ai-orchestrator/tests/`, se a suíte de `assistant.service.test.ts` ficar desproporcional.

## Escopo obrigatório

### 1. O conjunto de métodos vigiados é derivado da porta

- O descobridor lê a declaração da interface `WhatsAppProvider` e computa o conjunto de métodos dela a cada execução. Nenhum nome de método é escrito à mão no código do descobridor.
- Cada método cai em **exatamente uma** categoria nomeada, com o motivo escrito junto: **carrega texto ao destinatário do canal** (`sendText`) ou **não carrega texto** (`downloadMedia`). Método sem categoria é resíduo e **derruba** o teste, nomeando arquivo e linha.
- A descoberta de sítios roda sobre **todos** os métodos classificados como portadores de texto, não sobre um token fixo. Um método portador novo passa a ter seus sítios descobertos e classificados sem nenhuma edição do descobridor; o que exige edição é apenas declarar a categoria do método.
- Sobre a árvore real: **dois** métodos, resíduo zero, e a enumeração — método, linha, categoria e motivo — está no relatório.
- **Nenhuma allowlist por método, arquivo, módulo ou linha.** Violação disto é blocker.

### 2. A categoria de emissor é ligada à prova, ou declara por que não é

- `product_own_text_to_customer` deixa de ser um balde único. Sítio cujo texto é composto por um módulo nomeado do produto fica em categoria que **nomeia o compositor**, e os textos que esse compositor produz estão em `VERIFIED_CLIENT_TEXTS` — a ligação é verificada por teste, não afirmada em comentário.
- Sítio que carrega a resposta do turno (`state.response.text`) fica em **categoria própria e declarada**, com a fronteira de **D-050** escrita como motivo: o guardrail vale sobre o texto próprio do produto, que já está em `PRODUCT_OWN_TEXTS`, e não sobre o texto emitido pelo modelo.
- A resolução da origem de uma variável local passa a ser de **bloco**, não de arquivo: uma atribuição `const text = ...` de outra origem, no mesmo arquivo, não herda a categoria de compositor. Origem não resolvida é resíduo com arquivo e linha, nunca herança silenciosa.
- `VOCABULARIO_DE_ESPERA` continua com **uma** definição, em `tests/support/`, e `VERIFIED_CLIENT_TEXTS` continua sendo obtido **executando** os exports existentes, nunca copiando string de módulo de produção.

### 3. A origem em trânsito é seguida até o chamador

- Para cada sítio `text_in_transit_named_origin`, o descobridor computa os chamadores da função que contém o sítio, lendo `apps/ai-orchestrator/src` inteiro — nenhuma lista de arquivos ou de funções escrita à mão.
- Cada chamador cai em categoria nomeada pelo que ele fornece como texto: texto recebido de mais acima (trânsito, com a cadeia continuando), texto de categoria já declarada (canal de teste de ativação), ou texto composto na hora por módulo do produto — este último **exige** que o compositor esteja em `VERIFIED_CLIENT_TEXTS`.
- Chamador que não cai em nenhuma categoria é **resíduo** e derruba o teste, com arquivo e linha.
- Sobre a árvore real, as duas cadeias têm **um** chamador cada e o resíduo é **zero**; a cadeia completa, sítio a sítio, está no relatório.
- **Falso positivo é blocker.** Helper, log, anotação de tipo, chamada de teste e função homônima de outro módulo não são chamadores de cadeia de emissão. O relatório diz qual é o critério que os exclui e nomeia os casos excluídos.

### 4. Controle negativo: cada invariante morde

No padrão dos Goals 031 a 039, com saída real no relatório e reversão obrigatória. **No mínimo cinco controles**, e estes cinco são obrigatórios. Cada um é provado **executando o artefato que ele diz derrubar**; derrubar um guard vizinho é o proxy que foi recusado na rodada 2 do Goal034:

1. **Método novo na porta sem categoria.** Um terceiro método em `WhatsAppProvider` sai **verde** sobre a baseline e vira resíduo que derruba o teste sobre a árvore final, nomeando arquivo e linha. As duas saídas no relatório — é este controle que prova que a cegueira de canal era real.
2. **Sítio de um segundo método portador.** Uma chamada do método novo, classificado como portador de texto, é descoberta e classificada (ou vira resíduo, se a forma do texto não for reconhecida) sobre a árvore final, e é **invisível** sobre a baseline. As duas saídas no relatório.
3. **Origem herdada por escopo de arquivo.** Um segundo `sendText({ text })` no mesmo arquivo do compositor, com `text` de outra origem, é classificado como texto próprio do produto sobre a **baseline** — que é o erro — e vira resíduo com arquivo e linha sobre a árvore final. As duas saídas no relatório.
4. **Chamador novo de função de trânsito compondo texto próprio.** Um chamador novo de uma das duas funções de trânsito, fornecendo texto composto na hora e ausente de `VERIFIED_CLIENT_TEXTS`, não é visto sobre a baseline e vira resíduo sobre a árvore final. As duas saídas no relatório.
5. **O que já mordia continua mordendo.** Texto de espera introduzido em `notification-message.ts` e em um dos seis textos de `message-graph.ts` continua derrubando o guardrail, e forma não reconhecida em `notification-message.ts` continua virando resíduo — os controles dos Goals 037 a 039 não regrediram.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com identificação nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 5. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não mudar uma letra de copy**, em nenhum módulo emissor, e não alterar `PRODUCT_OWN_TEXTS`.
- **Não mudar código de produção de `apps/frontend/src/`, `apps/bff/src/` nem `apps/ai-orchestrator/src/`.** Este Goal muda testes e suporte de teste. Violação real encontrada em código de produção vira **achado a partir de A-24**, com impacto de produto em uma frase — não vira correção silenciosa.
- **Não mudar comportamento da IA:** nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`, nenhuma mudança de quando o produto responde por conta própria.
- **Não mudar o contrato público** nem o que as rotas devolvem: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido, nenhuma migration e nenhum `schema.prisma`.
- **Não enfraquecer `audit:static`:** nenhum check removido, nenhuma regra afrouxada, nenhuma allowlist nova em regra nenhuma. `scripts/final-production-audit.mjs` só é tocado se houver necessidade escrita e justificada no relatório; o escopo declarado deste Goal é a camada de teste do `ai-orchestrator`.
- **Não mudar o comportamento dos gates renderizados:** `retries: 1` inalterado nos dois `playwright.*.config.ts`, `flaky` continua não reprovando, `scripts/lib/playwright-report.mjs`, `scripts/validate-ui.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` intocados.
- **Não afrouxar asserção de gate renderizado:** nenhuma tolerância nova, nenhum teto aumentado, nenhum teste pulado, `fixme` ou `skip`, nenhuma largura removida da matriz, nenhuma mudança de tela, componente, texto de interface ou CSS.
- **Não tocar `apps/scheduling-service/`, `apps/evolution-go/` nem `apps/health-worker/`.**
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir nem reclassificar achado aberto:** A-04 a A-08, A-11 a A-17 e A-19 não são tocados. A-01 a A-03, A-09, A-10, A-18 e A-20 a A-23 continuam fechados e não são reabertos.
- **Não remover, renomear nem pular teste existente**, não encolher a lista de 35 passos de `validate:integration` e não deixar suíte menor do que a da baseline.
- **Não mexer em `tools/ia-loop/`.** Se o harness impedir a execução, isso é **declarado no relatório**, não consertado dentro deste Goal.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

**Permitido, e opcional:** precomputar índices de linha em vez de recortar o prefixo do arquivo a cada sítio (`lineAt`, `send-text-sites.ts:57`), observação não bloqueante do [review039](../reviews/039-review.md). Se for feito, é mudança que **preserva comportamento**, e o relatório diz que preservou.

### 6. Prova

- `validate:core` exit 0 sobre a árvore final, com `audit:static` mantendo os 34 checks e `public_api_route_coverage` continuando a imprimir uma única rota sem chamador.
- `npm run test:gate` exit 0, com a contagem antes e depois — nenhuma suíte encolheu.
- A suíte do `ai-orchestrator` verde, com a contagem de testes de `assistant.service.test.ts` antes e depois. `test:bff` e `test:frontend` verdes.
- Os cinco controles negativos executados, cada um com a saída real, e revertidos. Os controles 1 a 4 trazem **as duas saídas**, baseline e árvore final.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.
- A enumeração completa: os métodos da porta com categoria e motivo; os sítios de envio com categoria; a cadeia de cada origem em trânsito até o chamador; e os textos ligados a `VERIFIED_CLIENT_TEXTS`, com a origem de cada um.

### 7. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. Os Goals 036 a 038 levaram rodada de `CHANGES_REQUIRED` por documentação escrita antes das últimas unidades; o 039 acertou isso e foi aceito em rodada única. Aqui é critério de aceite, não recomendação. A documentação descreve o conjunto **real** de arquivos alterados, com os números que a árvore final mostra.

- [CURRENT_STATE](../CURRENT_STATE.md): delta040 — como o conjunto de métodos vigiados passou a ser derivado da porta, quais categorias de emissor existem agora, como a categoria de texto próprio ficou ligada ao conjunto verificado e até onde a cadeia de trânsito é seguida.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a regra nova decide **agora** e o que continua não decidindo — inclusive que a cadeia é seguida dentro de `apps/ai-orchestrator/src` e não além, e que texto emitido pelo modelo continua fora do guardrail por **D-050**.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§17**), no padrão de §8 e §10 a §16 e **sem reescrever** §4 a §16, registrando o fechamento, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-24** quando houver. O que não for reexecutado é declarado como não reexecutado, e não herdado como número próprio.
- [DECISIONS](../DECISIONS.md): **D-056**, no formato das anteriores, cobrindo por que o conjunto de métodos vigiados é derivado da declaração da porta, por que categoria que afirma texto próprio precisa estar ligada ao conjunto verificado, e por que texto emitido pelo modelo é categoria declarada em vez de ficar no mesmo balde.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal040 no status resultante e o SHA aceito. Dezesseis fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. O conjunto de métodos vigiados é computado a partir da declaração de `WhatsAppProvider` a cada execução, sem nome de método escrito à mão no descobridor, e a enumeração — método, linha, categoria e motivo — está no relatório.
2. Os dois métodos da porta caem em categorias nomeadas, com resíduo **zero**; método sem categoria derruba o teste com arquivo e linha — provado pelo controle 1, com as duas saídas.
3. A descoberta de sítios roda sobre todos os métodos classificados como portadores de texto, e um método portador novo tem seus sítios descobertos sem edição do descobridor — provado pelo controle 2, com as duas saídas.
4. Os sete sítios da árvore real continuam classificados, com resíduo **zero**, e a distribuição está no relatório.
5. Sítio cuja categoria afirma texto próprio do produto nomeia o compositor, e os textos desse compositor estão em `VERIFIED_CLIENT_TEXTS`, verificado por teste.
6. O sítio que carrega a resposta do turno está em categoria própria e declarada, com **D-050** escrita como motivo no código.
7. A resolução de origem de variável local é de bloco: `const text = ...` de outra origem no mesmo arquivo não herda a categoria de compositor e vira resíduo com arquivo e linha — provado pelo controle 3, com as duas saídas.
8. Para cada sítio em trânsito, os chamadores da função que o contém são computados a partir de `apps/ai-orchestrator/src`, sem lista escrita à mão, e cada um cai em categoria nomeada com resíduo **zero**; a cadeia completa está no relatório.
9. Chamador de função de trânsito que fornece texto composto na hora e ausente do conjunto verificado é resíduo — provado pelo controle 4, com as duas saídas.
10. Nenhum helper, log, anotação de tipo, comentário ou chamada de teste virou resíduo; o critério que os exclui está escrito no relatório, com os casos excluídos nomeados.
11. `VOCABULARIO_DE_ESPERA` continua com uma única definição em `tests/support/`, e `VERIFIED_CLIENT_TEXTS` continua obtido executando os exports existentes.
12. Texto de espera continua derrubando o guardrail em `notification-message.ts` e em `message-graph.ts`, e forma não reconhecida em `notification-message.ts` continua virando resíduo — controle 5.
13. Nenhuma allowlist por método, arquivo, módulo, rota ou linha entrou em nenhuma regra ou descobridor.
14. `PRODUCT_OWN_TEXTS` é idêntico ao da baseline, provado por diff, e nenhuma copy mudou em nenhum módulo emissor.
15. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum arquivo de `apps/scheduling-service/`, `apps/evolution-go/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; nenhum arquivo de `tools/ia-loop/`.
16. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados.
17. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
18. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
19. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso e nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada; a matriz continua com as cinco larguras.
20. Os cinco controles negativos obrigatórios existem, cada um exercita **o artefato que o critério nomeia**, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
21. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos e a suíte de `assistant.service.test.ts` não encolheu abaixo dos 37 testes da baseline.
22. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-24**, não correção silenciosa.
23. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, nem que a verificação de resposta roda em produção.
24. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
25. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
26. A documentação de §7 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados; [DECISIONS](../DECISIONS.md) tem **D-056** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§17** e nenhuma seção anterior foi reescrita.
27. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
28. `git status --porcelain` não lista artefato não rastreado não declarado.

## Entrega

Relatório do Developer com: a enumeração dos métodos da porta, com categoria e motivo, e a saída real sobre a árvore real; a enumeração dos sítios de envio com categoria e resíduo zero; a cadeia completa de cada origem em trânsito até o chamador, com a categoria de cada elo; a lista dos textos ligados a `VERIFIED_CLIENT_TEXTS`, com a origem de cada um; as duas saídas dos controles 1 a 4 — baseline verde, árvore final vermelha —, que são o que prova que cada cegueira era real, e a saída real do controle 5; o critério que distingue chamador de cadeia de emissão de não-chamador, com os casos excluídos nomeados; a prova por diff de que `PRODUCT_OWN_TEXTS` não mudou, de que nenhum arquivo de `src/` dos três apps foi tocado e de que `tools/ia-loop/` não aparece no diff; o resultado por passo de `validate:core`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual e A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
