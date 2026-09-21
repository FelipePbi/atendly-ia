# Goal 041 — O canal único é provado: saída de texto fora da porta e cadeia de trânsito de um elo

**Status: ACCEPTED** na rodada 5, conforme o [review041](../reviews/041-review.md) — quatro rodadas `CHANGES_REQUIRED` (5, 2, 1 e 1 blocker) antes do aceite com zero blockers. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal040 ACCEPTED](../reviews/040-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 041 nasce na [v62 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 040, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `9709b1ac2f2de7d338344845a0b4b78d6a3aea93`

Goal anterior: 040 — O canal vigiado é computado: método de envio fora do token e origem de texto não seguida

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal040 já integrado em `main` (origem `63ecc443692c296bd5b26357501dc8b47b726bd2`), com `parseWhatsAppProviderMethods` derivando o conjunto de métodos portadores da declaração da porta, `composed_by_composeNotificationText` ligada por teste a `VERIFIED_CLIENT_TEXTS`, `assistant_decision_text` como categoria própria por **D-050**, `discoverSendTextTransitChains` afirmando as duas cadeias, e o [review040](../reviews/040-review.md) aceito na rodada 3 com zero blockers. O commit posterior `40a7b5c` corrige apenas o cabeçalho de status do documento do Goal040 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

A série tem uma forma constante. O 037 fechou três **instâncias** de cegueira. O 038 fechou a **classe** dentro de cada extrator: cada um enumera o que reconhece e reprova o resíduo. O 039 fechou o **escopo** de leitura: a lista de arquivos escrita à mão virou árvore inteira. O 040 fechou o **canal**: o token `sendText` digitado dentro do teste virou conjunto de métodos derivado da declaração de `WhatsAppProvider`. Cada passada fechou o nível anterior e declarou, em uma frase, o nível que não tocou. O aceite do 040 declarou **dois**, e este Goal endereça os dois.

**O primeiro é o canal único.** O conjunto de métodos passou a ser computado, mas a **porta** continua sendo premissa: nada prova que todo texto que sai do produto para o número da cliente passa por `WhatsAppProvider`. Conferido sobre esta baseline, ninguém olha o egresso HTTP. `apps/ai-orchestrator/src` tem **quatro** sítios de `fetch(` — `lib/http.ts:32`, `modules/channel/adapters/evolution/EvolutionProvider.ts:75`, `modules/media/openai-transcription-provider.ts:58` e `modules/scheduling-service/client.ts:793` — e `apps/bff/src` tem **quatro** — `clients/internal-http-client.ts:83` e `:149`, `clients/password-reset-delivery.ts:20` e `routes/health.ts:46`. Um deles, e só um, leva prosa do produto ao número da cliente: o do adapter, que monta `joinUrl(env.EVOLUTION_BASE_URL, env.EVOLUTION_SEND_TEXT_PATH)` com `buildSendTextBody(input)`. Os outros sete levam áudio para transcrição, chamada a serviço interno, dado estruturado de recuperação de senha (`to`, `resetUrl`, `expiresAt`, sem uma linha de prosa) e sonda de saúde. Nenhum guard sabe disso, e nenhum guard nota se mudar.

O caso mais claro é o **egresso genérico**. `fetchJson` (`lib/http.ts:20`) é exportado e tem **zero** chamadores em `apps/ai-orchestrator/src`: uma porta de saída aberta, com URL, método e corpo decididos por quem chamar. Um chamador novo dela apontando para `EVOLUTION_SEND_TEXT_PATH` entrega texto à cliente sem tocar em `WhatsAppProvider`, e o descobridor do 040 — que só conhece os métodos da porta — não vê nem reprova. É o mesmo escape duplo que o 037 fechou para a crase, o 038 para o genérico ausente, o 039 para a pasta e o 040 para o método, agora pela forma do **egresso**.

**O segundo é a cadeia que para em um elo.** `discoverSendTextTransitChains` segue o sítio em trânsito até quem chama a função que o contém, e para ali. Os dois chamadores encontrados — `ActivationTestService.ts:852` e `ActivationTestAiDriver.ts:228` — são eles próprios trânsito, e quem os chama não é olhado. O segundo elo existe e está na árvore: `ActivationTestService.sendAsClient` tem **quatro** chamadores (`:604`, `:608`, `:653`, `:679`) e `ActivationTestAiDriver.deliverReply` tem **um** (`:203`). Hoje eles carregam `ACTIVATION_TEST_NOTICE` e as falas de cliente simulado, ambas já em categoria declarada. Um sexto chamador compondo prosa própria na hora entrega esse texto à cliente do negócio com o guardrail de espera sem ver nada — exatamente o buraco que o controle 4 do Goal040 fechou **um elo acima**, e não mais.

Conferido, e é o que faz este Goal ser fechamento de classe e não conserto: **hoje não há violação real em nenhum dos dois**. O único egresso portador de prosa é o do adapter; `fetchJson` não tem chamador; os cinco chamadores de segundo elo carregam texto de categoria já declarada. O resultado esperado é achado zero. A regra existe para o dia em que houver — que é o dia em que ninguém vai reler este documento.

O risco próprio deste Goal é o mesmo das três passadas anteriores, deslocado mais uma vez: **descobrir demais**. Um classificador de egresso que trate qualquer `fetch` como canal de cliente transforma saúde, transcrição e chamada interna em resíduo; um seguidor de cadeia que não pare transforma a árvore de chamadas inteira em resíduo, ou entra em laço. Por isso as exigências centrais são as mesmas: **enumerar o que se reconhece**, com categorias nomeadas no código, resíduo zero provado sobre a árvore real, e exclusão nomeada em vez de silêncio.

Cinco decisões de planejamento já estão tomadas e **não** são do Developer:

- **Egresso HTTP não classificado reprova; não é aviso.** Todo sítio de egresso das duas árvores cai em exatamente uma categoria nomeada, com o motivo escrito junto. Egresso novo sem categoria derruba o teste, com arquivo e linha.
- **Egresso genérico é fail-closed pelos chamadores.** Sítio cujo destino não é resolvível estaticamente — URL vinda de parâmetro — é categoria própria e declarada, e a regra dela é: **ou tem zero chamadores na árvore, ou todos os chamadores caem em categoria nomeada**. Chamador não classificado é resíduo.
- **A cadeia de trânsito é seguida até ponto fixo, com raiz nomeada.** A parada é por **raiz classificada** (rota HTTP registrada, worker ou job, entrada do canal de teste de ativação, elo que compõe prosa própria com o compositor em `VERIFIED_CLIENT_TEXTS`), nunca por profundidade fixa. Ciclo é detectado e reportado, nunca percorrido duas vezes nem silenciado. O escopo de leitura da cadeia continua sendo `apps/ai-orchestrator/src`.
- **`apps/evolution-go/` fica declaradamente fora.** O serviço Go recebe o que lhe entregam, mas nada aqui prova que ele não compõe texto próprio. Isso é **limite declarado**, escrito em [VALIDATION_GATE](../VALIDATION_GATE.md) e na decisão nova — não é achado, porque nenhuma violação real foi observada, e não é fechado por este Goal.
- **`apps/*/src/` não é editado, e `PRODUCT_OWN_TEXTS` não muda.** Tudo o que este Goal constrói mora na camada de teste, lendo as árvores de produção e executando os exports que já existem. Achado zero é o resultado esperado e **não** é o critério de sucesso: o que prova o Goal é o descobridor funcionando sobre a árvore real com resíduo zero **e** os controles negativos mordendo. Violação real encontrada em código de produção vira **achado a partir de A-24**, com classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) — não vira correção silenciosa.

## Dependências e contexto mínimo

- Goals 001 a 040 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review040](../reviews/040-review.md): as cinco observações não bloqueantes e a seção "O que este aceite não cobre", em especial *"canal computado não é canal único provado"* e *"a cadeia de trânsito para em um elo"*, que são as duas frases que este Goal endereça.
- [FINAL_AUDIT §17](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o registro de que nenhum achado novo entrou a partir de A-24.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e os checks dos Goals 035 a 040.
- [DECISIONS](../DECISIONS.md): **D-050** (guardrail sobre texto próprio do produto, não sobre texto do modelo), **D-052** (a rigidez mora no produtor), **D-053** (conjunto único de textos), **D-054** (reconhecimento por forma exige resíduo declarado), **D-055** (escopo computado) e **D-056** (conjunto de métodos derivado da porta; o limite de canal único está registrado ali). As seis continuam valendo inteiras.
- [AGENTS.md](../../../AGENTS.md): o guardrail que proíbe mensagem técnica de espera é o produto que este fechamento existe para proteger.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.

### Fatos já confirmados na baseline, sem precisar redescobrir

- `apps/ai-orchestrator/src` tem **quatro** sítios de `fetch(`: `lib/http.ts:32` (dentro de `fetchJson`), `modules/channel/adapters/evolution/EvolutionProvider.ts:75`, `modules/media/openai-transcription-provider.ts:58` e `modules/scheduling-service/client.ts:793`.
- `apps/bff/src` tem **quatro**: `clients/internal-http-client.ts:83` e `:149`, `clients/password-reset-delivery.ts:20` e `routes/health.ts:46`.
- `EvolutionProvider.sendText` (`:36`) monta `joinUrl(env.EVOLUTION_BASE_URL, env.EVOLUTION_SEND_TEXT_PATH)` e envia `buildSendTextBody(input)`. É o único egresso das duas árvores que leva prosa do produto ao número da cliente.
- `PasswordResetDeliveryClient.send` (`apps/bff/src/clients/password-reset-delivery.ts:5`) envia `{ to, resetUrl, expiresAt }` — dado estruturado, sem prosa do produto. `apps/bff/src/clients/evolution/index.ts` só tem caminhos de ciclo de vida de instância (`/instance/create`, `/instance/connect`, `/instance/qr`, `/instance/pair`, `/instance/status`, `/instance/logout`, `/instance/delete/...`): **nenhum** caminho de envio de mensagem.
- `fetchJson` (`lib/http.ts:20`) é exportado e tem **zero** chamadores em `apps/ai-orchestrator/src`.
- Segundo elo das duas cadeias: `ActivationTestService.sendAsClient` (`:844`) é chamado em `:604` (com `ACTIVATION_TEST_NOTICE`), `:608`, `:653` e `:679`; `ActivationTestAiDriver.deliverReply` (`:218`) é chamado em `:203`.
- `apps/ai-orchestrator/tests/support/` tem **três** arquivos: `send-text-sites.ts` (1200 linhas), `notification-message-sites.ts` (305) e `vocabulario-de-espera.ts` (11). `VOCABULARIO_DE_ESPERA` continua com uma única definição.
- Números da baseline, para comparar depois: `audit:static` com **34** checks (33 `passed`, 1 `skipped` declarado); `npm run test:gate` com **226 pass, 0 fail, 0 skipped**; `tests/assistant/assistant.service.test.ts` com **55** testes; `validate:integration` com **35** passos; `scripts/tests/` com 15 arquivos.
- Do lado do contrato público, inalterado por este Goal: 194 arquivos lidos em `apps/frontend/src`, 117 sítios de `routeSchema`, 116 rotas registradas no BFF e **uma** rota sem chamador (a de mídia).

## Pontos de implementação

- `apps/ai-orchestrator/tests/support/` — módulo novo para o descobridor de egresso HTTP, que lê duas árvores e não pertence a `send-text-sites.ts`.
- `apps/ai-orchestrator/tests/support/send-text-sites.ts` — o seguimento de cadeia até ponto fixo e os dois resíduos declarados do [review040](../reviews/040-review.md).
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — as enumerações afirmadas e os controles permanentes.
- Teste novo em `apps/ai-orchestrator/tests/`, se a suíte de `assistant.service.test.ts` ficar desproporcional.

## Escopo obrigatório

### 1. A saída de texto é computada, não presumida

- Um descobridor novo lê `apps/ai-orchestrator/src` e `apps/bff/src` inteiros e enumera **todo** sítio de egresso HTTP. Nenhuma lista de arquivos, de módulos ou de clientes escrita à mão.
- Cada sítio cai em **exatamente uma** categoria nomeada, com o motivo escrito junto — no mínimo: **leva prosa do produto ao número da cliente**, **leva dado estruturado sem prosa**, **fala com serviço interno da plataforma**, **fala com provedor de modelo ou de mídia**, **sonda de saúde** e **egresso genérico com destino decidido pelo chamador**. Sítio sem categoria é resíduo e **derruba** o teste, nomeando arquivo e linha.
- Sobre a árvore real: **oito** sítios, resíduo zero, e **exatamente um** na categoria de prosa ao número da cliente — o do adapter. A enumeração — arquivo, linha, categoria e motivo — está no relatório.
- O destino é resolvido pelo que o código usa (variável de ambiente, base URL, caminho), não pelo nome do arquivo nem pela pasta. Classificar por nome de arquivo é blocker.
- **Egresso genérico é fail-closed:** a categoria exige que o sítio tenha zero chamadores na árvore **ou** que todos os chamadores caiam em categoria nomeada. Chamador não classificado é resíduo com arquivo e linha. Sobre a árvore real, `fetchJson` tem zero chamadores em `src`, e o relatório afirma isso como fato computado, não como comentário.
- **Nenhuma allowlist por arquivo, módulo, cliente, URL ou linha.** Violação disto é blocker.

### 2. A cadeia de trânsito é seguida até ponto fixo

- `discoverSendTextTransitChains` deixa de parar no primeiro elo: a partir de cada sítio em trânsito, os chamadores são seguidos **transitivamente** dentro de `apps/ai-orchestrator/src`, até que cada ramo termine em raiz classificada.
- As raízes são nomeadas e enumeradas — no mínimo: rota HTTP registrada, worker ou job, entrada do canal de teste de ativação, e elo que compõe prosa própria (que **exige** o compositor em `VERIFIED_CLIENT_TEXTS`). Ramo que termina sem raiz classificada é **resíduo** com arquivo e linha.
- **Ciclo não trava e não some:** o percurso mantém conjunto de visitados, termina, e reporta o ciclo como tal em vez de silenciá-lo ou de percorrê-lo duas vezes.
- Sobre a árvore real, as duas cadeias ficam completas até a raiz, com resíduo zero, e a cadeia inteira — elo a elo, com a categoria de cada um — está no relatório. Os cinco chamadores de segundo elo (`ActivationTestService.ts:604`, `:608`, `:653`, `:679` e `ActivationTestAiDriver.ts:203`) aparecem nomeados.
- **Falso positivo é blocker.** Helper, log, anotação de tipo, comentário, chamada de teste e função homônima de outro módulo não são elos de cadeia de emissão. O relatório diz qual é o critério que os exclui e nomeia os casos excluídos.

### 3. Os dois resíduos declarados do review040 fecham

- A forma **propriedade-arrow** de membro de porta (`nome: (input: X) => Promise<void>;`) ganha teste permanente em `assistant.service.test.ts`: hoje o comportamento está correto e não tem regressão protegida.
- A mensagem de resíduo de `classifySendTextSites` deixa de escrever `sendText` fixo e passa a nomear o **portador descoberto**, provado por teste com porta sintética que declara portador de outro nome.
- As duas mudanças **preservam comportamento** sobre a árvore real, e o relatório diz que preservaram.

### 4. Controle negativo: cada invariante morde

No padrão dos Goals 031 a 040, com saída real no relatório e reversão obrigatória. **No mínimo cinco controles**, e estes cinco são obrigatórios. Cada um é provado **executando o artefato que ele diz derrubar**; derrubar um guard vizinho é o proxy que foi recusado na rodada 2 do Goal034.

1. **Egresso novo levando prosa ao número da cliente, fora do adapter.** Um `fetch` novo para `EVOLUTION_SEND_TEXT_PATH` em outro módulo de `apps/ai-orchestrator/src` é **invisível** sobre a baseline e, sobre a árvore final, é descoberto e cai na categoria de prosa ao número da cliente — quebrando a afirmação de egresso **único** com arquivo e linha. As duas saídas no relatório; é este controle que prova que a cegueira de canal era real.
2. **Chamador novo do egresso genérico.** Um chamador de `fetchJson` sem categoria nomeada é invisível sobre a baseline e vira resíduo sobre a árvore final, nomeando arquivo e linha. As duas saídas no relatório.
3. **Elo de segundo nível compondo prosa própria.** Um chamador novo de `sendAsClient` (ou de `deliverReply`) fornecendo texto composto na hora e ausente de `VERIFIED_CLIENT_TEXTS` sai **verde** sobre a baseline — porque a cadeia para em um elo — e vira resíduo sobre a árvore final. As duas saídas no relatório.
4. **Ciclo na cadeia.** Duas funções de trânsito que se chamam mutuamente fazem o percurso **terminar** e reportar o ciclo sobre a árvore final, sem laço infinito, sem estouro de pilha e sem sumir com o ramo. Saída real no relatório.
5. **O que já mordia continua mordendo.** Método novo na porta sem categoria continua derrubando o teste; `const text = ...` de outra origem no mesmo arquivo continua virando resíduo por escopo de bloco; texto de espera introduzido em `notification-message.ts` e em um dos seis textos de `message-graph.ts` continua derrubando o guardrail — os controles dos Goals 037 a 040 não regrediram.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com identificação nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 5. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não mudar uma letra de copy**, em nenhum módulo emissor, e não alterar `PRODUCT_OWN_TEXTS`.
- **Não mudar código de produção de `apps/frontend/src/`, `apps/bff/src/` nem `apps/ai-orchestrator/src/`.** Este Goal muda testes e suporte de teste; as árvores de produção são **lidas**, nunca editadas. Violação real encontrada em código de produção vira **achado a partir de A-24**, com impacto de produto em uma frase — não vira correção silenciosa.
- **Não mudar comportamento da IA:** nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`, nenhuma mudança de quando o produto responde por conta própria.
- **Não mudar o contrato público** nem o que as rotas devolvem: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido, nenhuma migration e nenhum `schema.prisma`.
- **Não enfraquecer `audit:static`:** nenhum check removido, nenhuma regra afrouxada, nenhuma allowlist nova em regra nenhuma. `scripts/final-production-audit.mjs` só é tocado se houver necessidade escrita e justificada no relatório; o escopo declarado deste Goal é a camada de teste do `ai-orchestrator`.
- **Não mudar o comportamento dos gates renderizados:** `retries: 1` inalterado nos dois `playwright.*.config.ts`, `flaky` continua não reprovando, `scripts/lib/playwright-report.mjs`, `scripts/validate-ui.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` intocados.
- **Não afrouxar asserção de gate renderizado:** nenhuma tolerância nova, nenhum teto aumentado, nenhum teste pulado, `fixme` ou `skip`, nenhuma largura removida da matriz, nenhuma mudança de tela, componente, texto de interface ou CSS.
- **Não tocar `apps/scheduling-service/`, `apps/evolution-go/` nem `apps/health-worker/`.** O que o serviço Go compõe por conta própria é **limite declarado**, não fechado aqui.
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real, nenhuma requisição de rede acrescentada à suíte. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir nem reclassificar achado aberto:** A-04 a A-08, A-11 a A-17 e A-19 não são tocados. A-01 a A-03, A-09, A-10, A-18 e A-20 a A-23 continuam fechados e não são reabertos.
- **Não remover, renomear nem pular teste existente**, não encolher a lista de 35 passos de `validate:integration` e não deixar suíte menor do que a da baseline.
- **Não mexer em `tools/ia-loop/`.** Se o harness impedir a execução, isso é **declarado no relatório**, não consertado dentro deste Goal.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

**Permitido, e opcional:** as três observações restantes do [review040](../reviews/040-review.md) — resolução de tipo de parâmetro importado de outro arquivo, `text: string | undefined` e `interface X extends Base`. Se alguma for endereçada, é mudança que **preserva** a direção do erro (resíduo nomeado, nunca classificação silenciosa), e o relatório diz o que mudou.

### 6. Prova

- `validate:core` exit 0 sobre a árvore final, com `audit:static` mantendo os 34 checks e `public_api_route_coverage` continuando a imprimir uma única rota sem chamador.
- `npm run test:gate` exit 0, com a contagem antes e depois — nenhuma suíte encolheu.
- A suíte do `ai-orchestrator` verde, com a contagem de testes de `assistant.service.test.ts` antes e depois (baseline: 55). `test:bff` e `test:frontend` verdes.
- Os cinco controles negativos executados, cada um com a saída real, e revertidos. Os controles 1 a 3 trazem **as duas saídas**, baseline e árvore final.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.
- A enumeração completa: os oito sítios de egresso com categoria e motivo; a regra do egresso genérico com a contagem computada de chamadores; a cadeia de cada origem em trânsito até a raiz, elo a elo; e a lista dos textos ligados a `VERIFIED_CLIENT_TEXTS`, inalterada em relação à baseline.

### 7. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. Os Goals 036 a 038 levaram rodada de `CHANGES_REQUIRED` por documentação escrita antes das últimas unidades; o 039 e o 040 acertaram isso. Aqui é critério de aceite, não recomendação. A documentação descreve o conjunto **real** de arquivos alterados, com os números que a árvore final mostra.

- [CURRENT_STATE](../CURRENT_STATE.md): delta041 — como o conjunto de egressos passou a ser computado nas duas árvores, quais categorias existem, qual é a regra do egresso genérico e até onde a cadeia de trânsito é seguida agora.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a regra nova decide **agora** e o que continua não decidindo — inclusive que `apps/evolution-go/` está fora do alcance do descobridor e que texto emitido pelo modelo continua fora do guardrail por **D-050**.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§18**), no padrão de §8 e §10 a §17 e **sem reescrever** §4 a §17, registrando o fechamento, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-24** quando houver. O que não for reexecutado é declarado como não reexecutado, e não herdado como número próprio.
- [DECISIONS](../DECISIONS.md): **D-057**, no formato das anteriores, cobrindo por que o conjunto de saídas de texto é computado por egresso em vez de presumido pela porta, por que egresso genérico é fail-closed pelos chamadores, e por que a cadeia de trânsito para em raiz classificada em vez de profundidade fixa — com o limite do serviço Go declarado no mesmo lugar.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal041 no status resultante e o SHA aceito. Dezessete fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Todo sítio de egresso HTTP de `apps/ai-orchestrator/src` e `apps/bff/src` é enumerado a cada execução, sem lista escrita à mão, e cai em categoria nomeada com motivo escrito junto; a enumeração está no relatório.
2. Sobre a árvore real são **oito** sítios, com resíduo **zero**, e **exatamente um** na categoria de prosa do produto ao número da cliente.
3. Egresso sem categoria derruba o teste com arquivo e linha, e egresso novo levando prosa ao número da cliente fora do adapter quebra a afirmação de egresso único — provado pelo controle 1, com as duas saídas.
4. O destino de cada egresso é resolvido pelo que o código usa, não pelo nome do arquivo nem pela pasta.
5. A categoria de egresso genérico é fail-closed: zero chamadores ou todos os chamadores classificados; chamador não classificado é resíduo — provado pelo controle 2, com as duas saídas. A contagem de chamadores de `fetchJson` é computada, não afirmada em comentário.
6. A cadeia de trânsito é seguida transitivamente até raiz classificada, dentro de `apps/ai-orchestrator/src`, e a cadeia completa elo a elo está no relatório, com os cinco chamadores de segundo elo nomeados.
7. Ramo que termina sem raiz classificada é resíduo com arquivo e linha; elo que compõe prosa própria exige o compositor em `VERIFIED_CLIENT_TEXTS` — provado pelo controle 3, com as duas saídas.
8. Ciclo na cadeia termina, é reportado como ciclo e não faz o ramo sumir — provado pelo controle 4.
9. Nenhum helper, log, anotação de tipo, comentário ou chamada de teste virou resíduo; o critério que os exclui está escrito no relatório, com os casos excluídos nomeados.
10. A forma propriedade-arrow de membro de porta tem teste permanente, e a mensagem de resíduo de `classifySendTextSites` nomeia o portador descoberto, provado por porta sintética com portador de outro nome.
11. Os **7** sítios de envio e as categorias do Goal040 continuam classificados com resíduo zero; `VOCABULARIO_DE_ESPERA` continua com uma única definição em `tests/support/`; `VERIFIED_CLIENT_TEXTS` continua obtido executando os exports existentes.
12. Texto de espera continua derrubando o guardrail em `notification-message.ts` e em `message-graph.ts`, e método de porta sem categoria continua derrubando o teste — controle 5.
13. Nenhuma allowlist por arquivo, módulo, cliente, URL, rota ou linha entrou em nenhuma regra ou descobridor.
14. `PRODUCT_OWN_TEXTS` é idêntico ao da baseline, provado por diff, e nenhuma copy mudou em nenhum módulo emissor.
15. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum arquivo de `apps/scheduling-service/`, `apps/evolution-go/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; nenhum arquivo de `tools/ia-loop/`.
16. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados.
17. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
18. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
19. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso e nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada; a matriz continua com as cinco larguras.
20. Os cinco controles negativos obrigatórios existem, cada um exercita **o artefato que o critério nomeia**, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
21. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos e a suíte de `assistant.service.test.ts` não encolheu abaixo dos 55 testes da baseline.
22. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-24**, não correção silenciosa.
23. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, que a verificação de resposta roda em produção, nem que o serviço Go foi provado sem texto próprio.
24. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
25. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
26. A documentação de §7 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados; [DECISIONS](../DECISIONS.md) tem **D-057** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§18** e nenhuma seção anterior foi reescrita.
27. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
28. `git status --porcelain` não lista artefato não rastreado não declarado.

## Entrega

Relatório do Developer com: a enumeração dos oito sítios de egresso, com arquivo, linha, categoria e motivo, e a saída real sobre as duas árvores; a regra do egresso genérico com a contagem computada de chamadores; a cadeia completa de cada origem em trânsito até a raiz, elo a elo, com a categoria de cada um e os cinco chamadores de segundo elo nomeados; a saída do percurso sobre o ciclo; as duas saídas dos controles 1 a 3 — baseline verde, árvore final vermelha —, que são o que prova que cada cegueira era real, e a saída real dos controles 4 e 5; o critério que distingue elo de cadeia de emissão de não-elo, com os casos excluídos nomeados; a prova por diff de que `PRODUCT_OWN_TEXTS` não mudou, de que nenhum arquivo de `src/` dos três apps foi tocado e de que `tools/ia-loop/` não aparece no diff; o resultado por passo de `validate:core`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, `apps/evolution-go/` e A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
