# Goal 039 — O conjunto vigiado é computado: emissor de texto fora da dupla e chamador fora da pasta

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal038 ACCEPTED](../reviews/038-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 039 nasce na [v60 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 038, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `9ba6b751cac2b1af958fac47e5c83c0e1ddc7d6c`

Goal anterior: 038 — O extrator declara o que não reconheceu: fechamento vazio, resíduo de forma e relatório de outra execução

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal038 já integrado em `main` (origem `e97fdf08dbee1a6808a13bccd62dad5ba259027c`), com `classifyMessageExpressionSites`, `classifyDispatchedTextSites`, `classifyBffRouteRegistrationSites` e `classifyFrontendRouteSchemaCallSites` em resíduo zero sobre a árvore real, `scripts/lib/playwright-report.mjs` como leitor único dos dois gates renderizados, `validate:ui` executando `node scripts/validate-ui.mjs`, **D-054** registrada e o [review038](../reviews/038-review.md). O commit posterior `9be7a7b` corrige apenas o cabeçalho de status do documento do Goal038 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O 038 fechou a classe **dentro** de cada extrator: cada um enumera as categorias que reconhece e reprova o que não cai em nenhuma, com arquivo e linha. O aceite dele declara o limite que ele não tocou, em uma frase — *"resíduo zero não é cobertura universal"*. Esta passada deu nome preciso a esse limite: **o escopo de cada guard continua sendo lista escrita à mão**. É a mesma allowlist que o Goal038 proibiu dentro das regras, um nível acima delas. Uma regra que enumera perfeitamente o que reconhece dentro de dois arquivos escolhidos à mão não vê nada no terceiro — e não reprova, porque nem olhou.

Não é teoria. São quatro fatos conferidos nesta passada, sobre esta baseline.

**O primeiro é a contagem.** `apps/ai-orchestrator/src` tem **cinco** sítios reais de `provider.sendText(` — `modules/graph/message-graph.ts:1207`, `modules/reminders/NotificationDeliveryService.ts:318`, `modules/activation-test/ActivationTestReplySender.ts:120`, `modules/channel/platform/PlatformWhatsAppSender.ts:98` e `modules/internal/routes.ts:705` —, além da declaração da porta (`modules/channel/ports/WhatsAppProvider.ts:38`) e da implementação do adapter (`modules/channel/adapters/evolution/EvolutionProvider.ts:36`). O fechamento de texto do Goal038 vigia **dois** arquivos: `assistant.service.ts` e `message-graph.ts`, nomeados dentro do próprio teste. Os outros caminhos de saída não são resíduo — são invisíveis.

**O segundo é o que existe do lado invisível, e é texto de produto para a cliente.** `modules/reminders/notification-message.ts` compõe, sem nenhuma chamada de modelo, o texto que o lembrete e o aviso de alteração entregam ao número da cliente: `STYLE_VOICES` traz saudação com e sem nome, pedido de confirmação de presença e fechamento nos três estilos de `AI_CONVERSATION_STYLES`, e `notificationFactualLines` traz as frases de lembrete, de cancelamento e de alteração, mais a linha de valor. **Nenhuma** dessas frases está em `PRODUCT_OWN_TEXTS` e **nenhuma** passa por `VOCABULARIO_DE_ESPERA`. O guardrail de `AGENTS.md` que o Goal034 tornou invariante, e que o Goal037 estendeu a `message-graph.ts`, não alcança o único texto do produto que chega à cliente **sem** que ela tenha escrito nada antes.

**O terceiro é o texto que sai pelo mesmo canal e não é para a cliente.** `modules/activation-test/ActivationTestService.ts` emite `ACTIVATION_TEST_NOTICE` (`:52`) ao número do próprio dono do negócio e três falas de cliente simulado (`:612`, `:657`, `:683`) pelo mesmo `sendAsClient`. Não é texto de produto para cliente, e por isso o guardrail de espera não deve mordê-lo — mas hoje isso não está **declarado** em lugar nenhum: está apenas esquecido, que é a forma indistinguível de estar errado.

**O quarto é o escopo do chamador do contrato público.** `classifyFrontendRouteSchemaCallSites` é chamado sobre `sourceFiles("apps/frontend/src/data/services")` (`scripts/final-production-audit.mjs:401`). Uma chamada de `routeSchema` em qualquer outra pasta de `apps/frontend/src` não é reconhecida **nem** vira resíduo: some da tabela de `public_api_route_coverage` e some da regra `frontend_v1_route_schema_calls_use_literal_patterns` ao mesmo tempo. É o terceiro escape duplo desta série, pela terceira forma — o 037 fechou o da crase, o 038 fechou o do genérico ausente e do receptor não-`app`, e este é o da pasta.

Conferido, e é o que faz este Goal ser fechamento de classe e não conserto: **hoje não há violação real em nenhum dos quatro**. Nenhuma frase de `notification-message.ts` nem de `ActivationTestService.ts` casa com `VOCABULARIO_DE_ESPERA`; as **116** chamadas de `routeSchema` de `apps/frontend/src` estão todas em `data/services` (a única ocorrência fora é a **definição**, em `data/http/BffHttpClient.ts:47`). O resultado esperado é achado zero. A regra existe para o dia em que houver — que é o dia em que ninguém vai reler este documento.

O risco próprio deste Goal é o mesmo do 038, deslocado: **descobrir demais**. Um descobridor de emissores que classifique qualquer chamada com um argumento `text:` como emissor de texto de cliente transforma log, erro técnico, payload interno e chamada de teste em resíduo, e o caminho de menor resistência passa a ser afrouxá-lo. Por isso a exigência central é a mesma: **enumerar o que se reconhece**, com categorias nomeadas no código e resíduo zero provado sobre a árvore real.

Quatro decisões de planejamento já estão tomadas e **não** são do Developer:

- **Emissor não classificado reprova; não é aviso.** Sítio de envio que não cai em nenhuma categoria nomeada derruba o teste que o vigia, com arquivo e linha.
- **O guardrail de vocabulário de espera vale sobre texto próprio do produto entregue à cliente do negócio.** Aviso operacional ao dono e roteiro de cliente simulado **não** são isso, continuam não passando pelo guardrail e passam a ser **categoria declarada** — não omissão.
- **`apps/*/src/` não é editado, e `PRODUCT_OWN_TEXTS` não muda.** O conjunto verificado novo mora na camada de teste e é montado a partir dos exports que já existem (`composeNotificationText`, `notificationFactualLines`, `ACTIVATION_TEST_NOTICE`) e da leitura da fonte. Importar o texto de lembrete dentro de `assistant.service.ts` criaria acoplamento de produção para servir a um teste, e isso é pior do que o problema que resolve.
- **Achado zero é o resultado esperado, e não é o critério de sucesso.** O que prova o Goal é o descobridor funcionando sobre a árvore real com resíduo zero **e** os controles negativos mordendo. Se aparecer violação real em código de produção, ela vira **achado a partir de A-24**, com classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) — não vira correção silenciosa.

## Dependências e contexto mínimo

- Goals 001 a 038 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review038](../reviews/038-review.md): as cinco observações não bloqueantes, e em especial "resíduo zero não é cobertura universal", que é a que este Goal endereça.
- [FINAL_AUDIT §15](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o registro de que nenhum achado novo entrou a partir de A-24.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e os checks dos Goals 035 a 038.
- [DECISIONS](../DECISIONS.md): **D-050** (guardrail sustentado por código e por gate), **D-052** (a rigidez mora no produtor), **D-053** (conjunto único de textos, com o limite do módulo emissor novo já registrado) e **D-054** (reconhecimento por forma exige resíduo declarado; categoria de descarte enumerada). As quatro continuam valendo inteiras.
- [AGENTS.md](../../../AGENTS.md): o guardrail que proíbe mensagem técnica de espera é o produto que este fechamento existe para proteger, agora também no lembrete.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.

### Fatos já confirmados na baseline, sem precisar redescobrir

- `apps/ai-orchestrator/src` tem **cinco** sítios de `provider.sendText(` (`message-graph.ts:1207`, `NotificationDeliveryService.ts:318`, `ActivationTestReplySender.ts:120`, `PlatformWhatsAppSender.ts:98`, `internal/routes.ts:705`), mais a porta (`WhatsAppProvider.ts:38`) e o adapter (`EvolutionProvider.ts:36`).
- `NotificationDeliveryService.ts:263` monta o texto por `composeNotificationText`; `PlatformWhatsAppSender.ts:100` e `ActivationTestReplySender.ts:122` repassam `message.text`/`input.text` recebidos do chamador; `internal/routes.ts:705` envia `body.text`, texto digitado por pessoa no BFF.
- `notification-message.ts` exporta `composeNotificationText` e `notificationFactualLines`; `STYLE_VOICES` é privado e alcançável pelos três estilos de `AI_CONVERSATION_STYLES` através de `composeNotificationText`.
- `ActivationTestService.ts` exporta `ACTIVATION_TEST_NOTICE` (`:52`) e tem três falas de cliente simulado inline (`:612`, `:657`, `:683`), sendo a de `:612` um template com `run.serviceName`.
- Nenhuma frase de `notification-message.ts` nem de `ActivationTestService.ts` casa com `VOCABULARIO_DE_ESPERA` hoje.
- `scripts/final-production-audit.mjs:401` limita o chamador do frontend a `apps/frontend/src/data/services`; há **116** chamadas de `routeSchema` em **16** arquivos dessa pasta e nenhuma em outra pasta de `apps/frontend/src` — a única ocorrência fora é a definição em `data/http/BffHttpClient.ts:47`.
- `scripts/final-production-audit.mjs` tem **34** sítios de `check(` e `validate:core` inclui `audit:static`. `validate:integration` tem 35 passos. `scripts/tests/` tem 15 arquivos de teste. `apps/ai-orchestrator/tests/support/` tem um arquivo, `vocabulario-de-espera.ts`.
- `PRODUCT_OWN_TEXTS` (`assistant.service.ts:309`) compõe `PRODUCT_OWN_FIXED_TEXTS`, as três saudações de estilo e os seis textos de `message-graph.ts`.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — os extratores e fechamentos existentes.
- `apps/ai-orchestrator/tests/support/` — o descobridor de emissores e o conjunto de texto de cliente cabem melhor como módulo compartilhado, ao lado de `vocabulario-de-espera.ts`.
- Teste novo em `apps/ai-orchestrator/tests/` para o fechamento dos emissores fora da dupla, se a suíte de `assistant.service.test.ts` ficar desproporcional.
- `scripts/final-production-audit.mjs` e `scripts/tests/final-production-audit-legacy-regression.test.mjs` — o escopo do chamador do frontend, nas duas pontas.

## Escopo obrigatório

### 1. O conjunto de emissores é descoberto, não escrito à mão

- Um descobridor lê `apps/ai-orchestrator/src` e computa **todos** os sítios de envio de texto pelo canal do produto — hoje as chamadas a `sendText` sobre a porta `WhatsAppProvider`. O conjunto é computado a cada execução; nenhuma lista de arquivos é escrita à mão.
- Cada sítio cai em **exatamente uma** categoria nomeada no código. As categorias mínimas, que a árvore de hoje já exige:
  - **declaração da porta** e **implementação do adapter** — não emitem texto próprio;
  - **texto próprio do produto para a cliente do negócio** — `message-graph.ts` e `notification-message.ts` via `NotificationDeliveryService`;
  - **texto em trânsito** — repasse de texto originado em outro módulo, com a **origem nomeada** (`PlatformWhatsAppSender`, `ActivationTestReplySender`);
  - **texto digitado por pessoa** — `internal/routes.ts`, corpo vindo do BFF;
  - **aviso operacional ao dono do negócio** e **roteiro de cliente simulado** — `ActivationTestService`.
- Sítio que não cai em nenhuma categoria é **resíduo** e **derruba** o teste, nomeando arquivo e linha.
- Sobre a árvore real o resíduo é **zero**, e a saída real — sítio a sítio, com categoria — está no relatório.
- **Nenhuma allowlist por arquivo, por módulo ou por linha.** O conjunto reconhecido é computado, nunca escrito à mão. Violação disto é blocker.
- **Falso positivo é blocker.** Log, erro técnico, payload interno, anotação de tipo, chamada de teste e comentário não são sítios de envio e não podem virar resíduo. O relatório diz qual é o critério que os exclui.

### 2. O guardrail de espera alcança todo texto próprio entregue à cliente

- Um conjunto verificado de **texto de cliente do produto** passa a incluir, além de `PRODUCT_OWN_TEXTS`, os textos que `notification-message.ts` produz: as saudações com e sem nome, o pedido de confirmação e o fechamento dos **três** estilos de `AI_CONVERSATION_STYLES`, e as frases factuais de lembrete, de cancelamento e de alteração, com e sem linha de valor.
- Esses textos são obtidos **executando os exports existentes** (`composeNotificationText`, `notificationFactualLines`) sobre fatos declarados no próprio teste. Nenhum arquivo de `apps/ai-orchestrator/src/` é editado e `PRODUCT_OWN_TEXTS` não muda.
- Todo texto do conjunto é conferido contra `VOCABULARIO_DE_ESPERA`, que continua com **uma** definição, em `tests/support/`.
- O fechamento sobre `notification-message.ts` classifica os sítios que produzem texto, no padrão do Goal038: forma que produz texto e não é reconhecida é resíduo, com arquivo e linha, e não descarte silencioso.
- `ACTIVATION_TEST_NOTICE` e as três falas de cliente simulado ficam em categoria declarada — **fora** do guardrail de espera e **dentro** da enumeração —, com o motivo escrito junto da categoria: não são o produto falando com a cliente do negócio.

### 3. O chamador do contrato público é procurado em `apps/frontend/src` inteiro

- `classifyFrontendRouteSchemaCallSites` passa a receber os arquivos de `apps/frontend/src`, não só de `data/services`. A definição de `routeSchema` em `data/http/BffHttpClient.ts` é reconhecida como definição, em categoria própria, e não vira chamada nem resíduo.
- Uma chamada de `routeSchema` fora de `data/services` é reconhecida como chamador — entra em `public_api_route_coverage` — ou é resíduo que reprova `frontend_v1_route_schema_calls_use_literal_patterns`.
- O `details` de cada regra tocada declara quantos arquivos foram lidos e em que escopo.
- `public_api_route_coverage` continua imprimindo **uma** rota sem chamador — a de mídia —, com o conjunto computado.

### 4. Controle negativo: cada invariante morde

No padrão dos Goals 031 a 038, com saída real no relatório e reversão obrigatória. **No mínimo cinco controles**, e estes cinco são obrigatórios. Cada um é provado **executando o artefato que ele diz derrubar**; derrubar um guard vizinho é o proxy que foi recusado na rodada 2 do Goal034:

1. **Emissor novo sem categoria.** Um sexto sítio de `sendText` em módulo novo de `apps/ai-orchestrator/src` sai **verde** sobre a baseline e vira resíduo que derruba o teste sobre a árvore final, nomeando arquivo e linha. O relatório traz as duas saídas — é este controle que prova que a cegueira era real.
2. **Texto de espera no lembrete.** Trocar uma frase de `notification-message.ts` por uma que mande a cliente aguardar sai **verde** sobre a baseline e derruba o guardrail sobre a árvore final. As duas saídas no relatório.
3. **Texto de espera continua mordendo onde já mordia.** Trocar um dos seis textos de `message-graph.ts` por um de espera continua derrubando a invariante — o controle do Goal037/038 não regrediu.
4. **Forma não reconhecida no emissor de lembrete.** Uma forma de produção de texto fora das categorias em `notification-message.ts` vira resíduo com arquivo e linha, em vez de ser descartada.
5. **Chamador fora da pasta.** Uma chamada `routeSchema<...>("GET", "/v1/...")` em `apps/frontend/src/features/` sai **verde** sobre a baseline, em `audit:static` e em `public_api_route_coverage`, e é reconhecida como chamador sobre a árvore final; a variante sem padrão literal reprova. O relatório traz as duas saídas.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com identificação nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 5. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não mudar uma letra de copy**, em nenhum dos módulos emissores, e não alterar `PRODUCT_OWN_TEXTS`.
- **Não mudar código de produção de `apps/frontend/src/`, `apps/bff/src/` nem `apps/ai-orchestrator/src/`.** Este Goal muda testes, suporte de teste e `audit:static`. Violação real encontrada em código de produção vira **achado a partir de A-24**, com impacto de produto em uma frase — não vira correção silenciosa.
- **Não mudar comportamento da IA:** nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`, nenhuma mudança de quando o produto responde por conta própria.
- **Não mudar o contrato público** nem o que as rotas devolvem: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido, nenhuma migration e nenhum `schema.prisma`.
- **Não mudar o comportamento dos gates renderizados:** `retries: 1` inalterado nos dois `playwright.*.config.ts`, `flaky` continua não reprovando, `scripts/lib/playwright-report.mjs`, `scripts/validate-ui.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` intocados salvo necessidade escrita e justificada no relatório.
- **Não afrouxar asserção de gate renderizado:** nenhuma tolerância nova, nenhum teto aumentado, nenhum teste pulado, `fixme` ou `skip`, nenhuma largura removida da matriz, nenhuma mudança de tela, componente, texto de interface ou CSS.
- **Não tocar `apps/scheduling-service/`, `apps/evolution-go/` nem `apps/health-worker/`.**
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir nem reclassificar achado aberto:** A-04 a A-08, A-11 a A-17 e A-19 não são tocados. A-01 a A-03, A-09, A-10, A-18 e A-20 a A-23 continuam fechados e não são reabertos.
- **Não enfraquecer gate nenhum**, não encolher a lista de 35 passos de `validate:integration`, não remover check de `audit:static`, não remover nem renomear teste existente e não marcar teste como skip em silêncio.
- **Não mexer em `tools/ia-loop/`.** O review038 registrou trabalho de harness entrando em diff de Goal sem estar previsto; aqui ele não está previsto e não entra. Se o harness impedir a execução, isso é **declarado no relatório**, não consertado dentro deste Goal.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

### 6. Prova

- `validate:core` exit 0 sobre a árvore final, com `audit:static` mostrando o `details` de escopo de cada regra tocada e `public_api_route_coverage` continuando a imprimir uma única rota sem chamador.
- `npm run test:gate` exit 0, com as regressões novas nos dois sentidos.
- A suíte do `ai-orchestrator` verde, com a contagem de testes antes e depois — nenhuma suíte encolheu. `test:bff` e `test:frontend` verdes.
- Os cinco controles negativos executados, cada um com a saída real, e revertidos. Os controles 1, 2 e 5 trazem **as duas saídas**, baseline e árvore final.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.
- A enumeração completa dos sítios de envio, com a categoria de cada um e resíduo zero, e a enumeração dos textos de cliente conferidos contra `VOCABULARIO_DE_ESPERA`.

### 7. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. Os Goals 036, 037 e 038 levaram rodada de `CHANGES_REQUIRED` por documentação escrita antes das últimas unidades, e no 038 isso custou duas rodadas: aqui é critério de aceite, não recomendação. A documentação descreve o conjunto **real** de arquivos alterados, com os números que a árvore final mostra.

- [CURRENT_STATE](../CURRENT_STATE.md): delta039 — como o conjunto de emissores passou a ser computado, quais categorias existem, qual texto passou a ser conferido contra o guardrail e qual é o escopo novo do chamador do contrato público.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a regra nova decide **agora** e o que continua não decidindo, inclusive que aviso ao dono e roteiro de cliente simulado ficam fora do guardrail de espera por decisão declarada.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§16**), no padrão de §8 e §10 a §15 e **sem reescrever** §4 a §15, registrando o fechamento do escopo, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-24** quando houver.
- [DECISIONS](../DECISIONS.md): **D-055**, no formato das anteriores, cobrindo por que o escopo de um guard precisa ser computado como o conteúdo dele já é, por que texto que não vai à cliente do negócio é categoria declarada em vez de omissão, e por que o conjunto verificado novo mora no teste em vez de entrar em `PRODUCT_OWN_TEXTS`.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal039 no status resultante e o SHA aceito. Quinze fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. O conjunto de sítios de envio de texto é computado a partir de `apps/ai-orchestrator/src` a cada execução, sem lista de arquivos escrita à mão, e a enumeração real — sítio, arquivo, linha e categoria — está no relatório.
2. Os sete sítios da árvore de hoje (cinco envios, a porta e o adapter) caem em categorias nomeadas no código, com resíduo **zero**.
3. Sítio de envio sem categoria derruba o teste com arquivo e linha — provado pelo controle 1, com as duas saídas.
4. Nenhum log, erro técnico, payload interno, anotação de tipo, comentário ou chamada de teste virou resíduo; o critério que os exclui está escrito no relatório.
5. O conjunto verificado de texto de cliente inclui os textos de `notification-message.ts` nos três estilos, com e sem nome, com e sem linha de valor, e nas três formas factuais (lembrete, cancelamento, alteração), obtidos pelos exports existentes.
6. Todo texto do conjunto é conferido contra `VOCABULARIO_DE_ESPERA`, que continua com uma única definição em `tests/support/`.
7. Texto de espera introduzido em `notification-message.ts` derruba o guardrail — provado pelo controle 2, com as duas saídas — e o guardrail continua mordendo em `message-graph.ts` (controle 3).
8. Forma de produção de texto não reconhecida em `notification-message.ts` vira resíduo com arquivo e linha — provado pelo controle 4.
9. `ACTIVATION_TEST_NOTICE` e as três falas de cliente simulado estão em categoria declarada, com o motivo escrito no código, e não passam pelo guardrail de espera.
10. `classifyFrontendRouteSchemaCallSites` lê `apps/frontend/src` inteiro; a definição de `routeSchema` é reconhecida como definição; chamada fora de `data/services` é reconhecida ou vira resíduo que reprova — provado pelo controle 5, com as duas saídas.
11. `public_api_route_coverage` continua imprimindo **uma** rota sem chamador, com o conjunto computado e o número de arquivos lidos no `details`; nenhuma allowlist por arquivo, rota ou linha entrou em nenhuma regra.
12. `PRODUCT_OWN_TEXTS` é idêntico ao da baseline, provado por diff, e nenhuma copy mudou em nenhum módulo emissor.
13. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum arquivo de `apps/scheduling-service/`, `apps/evolution-go/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; nenhum arquivo de `tools/ia-loop/`.
14. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados.
15. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
16. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso e nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada; a matriz continua com as cinco larguras.
17. Os cinco controles negativos obrigatórios existem, cada um exercita **o artefato que o critério nomeia**, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
18. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos e `audit:static` não perdeu check.
19. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-24**, não correção silenciosa.
20. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, nem que a verificação de resposta roda em produção.
21. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
22. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
23. A documentação de §7 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados; [DECISIONS](../DECISIONS.md) tem **D-055** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§16** e nenhuma seção anterior foi reescrita.
24. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
25. `git status --porcelain` não lista artefato não rastreado não declarado.

## Entrega

Relatório do Developer com: a enumeração escrita das categorias de emissor, com a saída real sobre a árvore real, sítio a sítio, e resíduo zero; as duas saídas dos controles 1, 2 e 5 — baseline verde, árvore final vermelha —, que são o que prova que cada cegueira era real; a saída real dos controles 3 e 4; a lista dos textos de cliente conferidos contra `VOCABULARIO_DE_ESPERA`, com a origem de cada um; o critério que distingue sítio de envio de não-sítio, com os casos que ele exclui nomeados; a prova por diff de que `PRODUCT_OWN_TEXTS` não mudou, de que nenhum arquivo de `src/` dos três apps foi tocado e de que `tools/ia-loop/` não aparece no diff; o resultado por passo de `validate:core`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual e A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
