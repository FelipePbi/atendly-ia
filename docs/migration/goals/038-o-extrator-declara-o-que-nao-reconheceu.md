# Goal 038 — O extrator declara o que não reconheceu: fechamento vazio, resíduo de forma e relatório de outra execução

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal037 ACCEPTED](../reviews/037-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 038 nasce na [v59 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 037, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `e90200403467e2860da3db22705d49df6e3822d9`

Goal anterior: 037 — O gate vê o que o produto emite: chamador em laço, texto fora do fechamento e retentativa silenciosa

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal037 já integrado em `main` (origem `e24a2bac586dc6f045b6cae505bb901792884bb5`), com as três chamadas literais de `BffConversationService.ts`, `frontend_v1_route_schema_calls_use_literal_patterns` em `audit:static`, os seis textos de `message-graph.ts` dentro de `PRODUCT_OWN_TEXTS`, `VOCABULARIO_DE_ESPERA` único em `apps/ai-orchestrator/tests/support/`, `extractRetriedTests` nomeando a rota e o [review037](../reviews/037-review.md). O commit posterior `0bde51d` corrige apenas o cabeçalho de status do documento do Goal037 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O 037 fechou três lugares onde um gate declarava ver mais do que via. O aceite dele, e a conferência desta passada sobre esta baseline, mostram que os três eram instâncias de **uma classe só**, e que a classe continua aberta: **todo extrator deste repositório reconhece por forma textual, e nenhum deles diz o que deixou de reconhecer**. O que passa despercebido não produz erro, não produz aviso e não produz contagem — produz verde. Este Goal fecha a classe, não mais uma instância dela.

Não é teoria. São quatro fatos conferidos nesta passada, sobre esta baseline.

**O primeiro é o caso extremo: um fechamento que passa por não ver nada.** `extractMessagesArrayLiterals` (`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:511`) extrai literais entre aspas de dentro de `messages: [...]`. Executado contra o `assistant.service.ts` real desta baseline, ele devolve **zero** literais: os seis sítios do arquivo (`:1495`, `:1608`, `:1621`, `:1633`, `:1645`, `:1690`) referenciam `PRODUCT_OWN_FIXED_TEXTS.<chave>` ou `buildStyleGreeting(...)`, e nenhum tem literal entre aspas. O teste "fecha o conjunto: todo literal em `messages: [...]` de assistant.service.ts pertence a ele" itera sobre lista vazia e passa. O teste irmão, sobre `message-graph.ts`, tem `expect(literals.length).toBeGreaterThan(0)`; este não tem. O fechamento que o Goal034 declarou e o Goal037 herdou está verde **porque não vê nada** no arquivo que ele existe para vigiar.

**O segundo é o reconhecimento por forma nas duas regras de rota.** `FRONTEND_ROUTE_SCHEMA_CALL_PATTERN` e `FRONTEND_V1_ROUTE_SCHEMA_NON_LITERAL_PATTERN` (`scripts/final-production-audit.mjs:977` e `:1007`) exigem, os dois, `routeSchema<...>(`. Uma chamada sem genérico — `routeSchema("GET", ...)`, que o TypeScript aceita por inferência — escapa dos **dois ao mesmo tempo**: some da tabela de chamadores de `public_api_route_coverage` e não aciona a regra do Goal037. É o mesmo escape duplo que o 037 fechou para a crase, por outra forma. Do lado do BFF, `BFF_V1_ROUTE_REGISTRATION_PATTERN` e `BFF_V1_NON_LITERAL_ROUTE_REGISTRATION_PATTERN` (`:974` e `:988`) exigem que o receptor se chame `app`: um registro em `server.get(...)`, `instance.post(...)` ou em qualquer outro identificador escapa dos dois. Conferido: hoje há **116** chamadas `routeSchema<...>` em **16** arquivos de `apps/frontend/src/data/services/`, todas com genérico, e nenhum registro de rota `/v1` fora de `app.<verbo>(` em `apps/bff/src`. Não há escape real, e é exatamente por isso que a hora de fechar é agora — a regra existe para o dia em que houver.

**O terceiro é o descarte silencioso no fechamento de texto.** `extractDispatchedModuleConstantTexts` (`assistant.service.test.ts:566`) percorre os sítios `text:` de `message-graph.ts` e resolve os que apontam para constante de módulo. Conferido: o arquivo tem **16** sítios `text:`; o extrator reconhece **3** (`imageReceivedReply` em `:889`, `unsupportedReplyFor(state)` em `:895`, `processingErrorReply` em `:978`) e descarta os **13** restantes sem contar, sem nomear e sem distinguir entre eles. Três desses treze nem são despacho — são anotação de tipo (`text: string`, `:1313`, `:1336`, `:1345`). Os outros dez são expressão dinâmica do turno, e o descarte é correto. O problema não é o descarte: é que **um `text: "..."` inline, um template literal ou um lookup em objeto seriam descartados do mesmo jeito**, e o comentário do extrator declara isso como se fosse desenho. Descartar o que não se entende e descartar o que se decidiu ignorar são a mesma linha de código.

**O quarto tem duas metades, e as duas ficaram declaradas no fechamento do 037.** `readGateReport` (`scripts/goal033-authenticated-ui-rehearsal.mjs:534`) recusa relatório ausente ou ilegível, mas **não confere frescor**: um `e2e-results/authenticated/results.json` de execução anterior é lido como se fosse o da execução que acabou, e o passo declara a retentativa errada — ou zero — se o Playwright morrer antes de reescrevê-lo. E o **gate público não tem leitor nenhum**: `validate:ui` é `cd apps/frontend && npm run test:ui`, que é `playwright test` direto; `playwright.config.ts` declara `retries: 1` e escreve `e2e-results/results.json`, e ninguém abre esse arquivo. O item 3 do Goal037 previa estender o tratamento ao gate público "apenas se couber sem mudar a forma de execução"; não coube, e ficou declarado. Fica fechado aqui.

O risco próprio deste Goal é o mesmo que o 037 nomeou, e mais afiado: **trocar cegueira por ruído**. Uma regra de resíduo que dispare em forma legítima não atrasa um review — bloqueia toda mudança futura naquele arquivo, e o caminho de menor resistência passa a ser afrouxá-la. Por isso a exigência central deste Goal não é "reprovar o que não reconheço", e sim **enumerar o que reconheço**: cada extrator passa a classificar cada ocorrência candidata em uma de categorias nomeadas, e só o que não cai em nenhuma delas é resíduo. O relatório traz a enumeração escrita e a saída real sobre a árvore real com resíduo **zero**.

Três decisões de planejamento já estão tomadas e **não** são do Developer:

- **Resíduo reprova; não é aviso.** Forma candidata que não cai em nenhuma categoria nomeada derruba o artefato que a vigia, com identificação de arquivo e linha. Um resíduo que só imprime é a mesma cegueira com mais texto.
- **A categoria "dinâmico" é enumerada, não inferida.** Expressão de turno continua sendo descartada, mas por pertencer a uma categoria declarada — não por ser o que sobrou.
- **`retries: 1` continua nos dois `playwright.*.config.ts` e `flaky` continua não reprovando.** O que passa a reprovar é relatório que não é da execução que acabou. Declarar retentativa continua sendo diagnóstico; ler o arquivo errado é defeito.

## Dependências e contexto mínimo

- Goals 001 a 037 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review037](../reviews/037-review.md): as cinco observações não bloqueantes, três delas endereçadas aqui — a regex que exige genérico, o `results.json` obsoleto e o limite de um terceiro módulo emissor com forma de despacho não reconhecida.
- [FINAL_AUDIT §14](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o registro de que nenhum achado novo entrou a partir de A-24.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide, os checks dos Goals 035 a 037 e a seção "Declaração de retentativa do Goal037", com o que ela declara **não** decidir.
- [DECISIONS](../DECISIONS.md): **D-050** (guardrail sustentado por código e por gate), **D-052** (a rigidez mora no produtor) e **D-053** (path literal nos dois lados, conjunto único de textos, retentativa declarada e não reprovada). As três continuam valendo inteiras.
- [AGENTS.md](../../../AGENTS.md): o guardrail que proíbe mensagem técnica de espera continua sendo o produto que o fechamento de texto existe para proteger.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.

### Fatos já confirmados na baseline, sem precisar redescobrir

- `extractMessagesArrayLiterals` devolve **lista vazia** sobre o `assistant.service.ts` real; os seis sítios `messages: [...]` não têm literal entre aspas.
- O teste de fechamento sobre `assistant.service.ts` **não** tem piso `toBeGreaterThan(0)`; o de `message-graph.ts` tem.
- `apps/frontend/src/data/services/` tem **16** arquivos, **16** imports de `routeSchema` e **116** chamadas, todas na forma `routeSchema<...>(`.
- `apps/bff/src` não tem registro de rota `/v1` fora de `app.<verbo>(`.
- `message-graph.ts` tem **16** sítios `text:`; o extrator reconhece **3**; **3** dos descartados são anotação de tipo e **10** são expressão dinâmica do turno.
- `readGateReport` não confere frescor do `results.json`.
- `validate:ui` é `cd apps/frontend && npm run test:ui`; `apps/frontend/package.json` define `test:ui` como `playwright test`; `playwright.config.ts` escreve `./e2e-results/results.json` e declara `retries: 1`.
- `audit:static` tem 33 checks e `validate:core` o inclui. `validate:integration` tem **35** passos. `scripts/tests/` tem 15 arquivos de teste.
- `PRODUCT_OWN_TEXTS` (`assistant.service.ts:309`) compõe `PRODUCT_OWN_FIXED_TEXTS`, as três saudações de estilo e os seis textos de `message-graph.ts`.

## Pontos de implementação

- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — os dois extratores de texto e os dois fechamentos.
- `apps/ai-orchestrator/tests/support/` — se o critério de reconhecimento couber melhor como módulo compartilhado.
- `scripts/final-production-audit.mjs` e `scripts/tests/final-production-audit-legacy-regression.test.mjs` — o resíduo das regras de rota, nas duas pontas.
- `scripts/goal033-authenticated-ui-rehearsal.mjs` e `scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` — o frescor do relatório.
- O executor do gate público (`package.json` na raiz e um script novo em `scripts/`) e sua regressão em `scripts/tests/`.

## Escopo obrigatório

### 1. O fechamento sobre `assistant.service.ts` deixa de passar por não ver nada

- O extrator de texto de `assistant.service.ts` passa a **reconhecer as formas que o arquivo realmente usa**: referência a `PRODUCT_OWN_FIXED_TEXTS.<chave>` e chamada de construtor de texto de módulo (`buildStyleGreeting(...)`), resolvendo cada uma para o texto que ela produz, além do literal entre aspas que ele já reconhece.
- O fechamento ganha **piso**: reprova se o extrator devolver menos textos do que os sítios `messages: [...]` que o arquivo tem. Um extrator que para de enxergar o arquivo fica vermelho em vez de ficar verde.
- Nenhuma copy muda, nenhum texto novo entra em `PRODUCT_OWN_TEXTS` e nenhum sai. O conjunto da baseline é o conjunto da árvore final, provado por diff.

### 2. Cada sítio candidato é classificado, e o que não cai em categoria nomeada reprova

Vale para os dois arquivos do fechamento de texto e para as duas regras de rota. Em cada um:

- O extrator enumera as **categorias de reconhecimento** que aceita, cada uma nomeada no código.
- Toda ocorrência candidata cai em exatamente uma categoria, ou é **resíduo**.
- Resíduo não vazio **derruba** o artefato que vigia — teste ou check de `audit:static` —, nomeando arquivo e linha de cada ocorrência.
- Sobre a árvore real, o resíduo é **zero** nos quatro casos, e a saída real está no relatório.

Concretamente:

- **Texto de `message-graph.ts`:** os 16 sítios `text:` são classificados em constante de módulo resolvida (texto do produto, entra no fechamento), expressão dinâmica do turno (categoria declarada, descartada) e anotação de tipo (categoria declarada, descartada). Um `text:` com literal inline, template literal ou qualquer forma fora dessas categorias é resíduo e reprova.
- **Texto de `assistant.service.ts`:** as ocorrências de `messages: [...]` são classificadas nas formas do item 1; qualquer outra é resíduo.
- **Chamador `/v1` do frontend:** o reconhecimento deixa de exigir genérico. Toda chamada de `routeSchema` em `apps/frontend/src/data/services/` é reconhecida como chamada com padrão literal, ou é resíduo que reprova `audit:static` com regra nomeada — inclusive a chamada sem genérico que hoje escapa das duas regras.
- **Registro de rota `/v1` do BFF:** o reconhecimento deixa de exigir que o receptor se chame `app`. Registro de rota `/v1` em qualquer identificador é reconhecido, ou é resíduo que reprova.

Duas restrições, e a violação de qualquer uma é blocker:

- **Nenhuma allowlist por arquivo, por rota ou por linha.** O conjunto reconhecido é computado, nunca escrito à mão.
- **Falso positivo é blocker.** Import, comentário, literal de teste, erro técnico, chave de log, nome de nó do grafo e sumário interno de handoff não são candidatos e não podem virar resíduo. O relatório diz qual é o critério que os exclui.

### 3. O relatório lido é o da execução que acabou

- O ensaio do gate autenticado passa a provar que o `results.json` que lê pertence à execução que ele acabou de rodar — removendo-o antes de iniciar o Playwright, conferindo o instante de escrita contra o início da execução, ou as duas coisas.
- Relatório de execução anterior faz o passo **falhar** com erro nomeado, dizendo que o relatório não é desta execução. Relatório ausente ou ilegível continua falhando como já falha.
- Nada mais do comportamento do ensaio muda: mesma ordem de passos, mesmo tratamento de exit code, mesma declaração de retentativa com projeto e título.

### 4. O gate público declara retentativa pelo mesmo critério

- `validate:ui` passa a ler `apps/frontend/e2e-results/results.json` depois da execução e a declarar, na saída do passo, quantos e **quais** testes precisaram de retentativa — projeto e título, pela mesma regra de cadeia de suites que o gate autenticado usa —, mesmo quando a execução termina com sucesso.
- O leitor é **um só**, compartilhado pelos dois gates. Duas cópias que podem divergir são a classe de problema que o Goal037 fechou para `VOCABULARIO_DE_ESPERA`.
- **A semântica de saída não muda:** `npm run validate:ui` continua sendo o comando, continua rodando `playwright test` com as cinco larguras da matriz e, quando o Playwright sai não-zero, esse é o exit code do passo. Quando o Playwright sai zero e o relatório está ausente, ilegível ou não é desta execução, o passo diz isso e falha.
- `retries: 1` **não muda** em nenhum dos dois arquivos de configuração e `flaky` **continua** terminando com sucesso.

### 5. Controle negativo: cada invariante morde

No padrão dos Goals 031 a 037, com saída real no relatório e reversão obrigatória. **No mínimo seis controles**, e estes seis são obrigatórios. Cada um é provado **executando o artefato que ele diz derrubar**; derrubar um guard vizinho é o proxy que foi recusado na rodada 2 do Goal034:

1. **Fechamento vazio.** Sobre a **baseline**, uma cópia sintética do arquivo sem nenhum sítio `messages: [...]` mantém o teste de fechamento **verde**; sobre a árvore final, o piso do item 1 o derruba. O relatório traz as duas saídas — é este controle que prova que a cegueira era real.
2. **Texto de cliente em forma não reconhecida.** Um `text:` com literal inline em `message-graph.ts` derruba o fechamento como **resíduo**, nomeando arquivo e linha, e não é silenciosamente descartado.
3. **Vocabulário de espera continua mordendo.** Trocar um dos seis textos do grafo por um que mande a cliente aguardar continua derrubando a invariante nomeada — o controle do Goal037 não regrediu.
4. **Chamador sem genérico.** Uma chamada `routeSchema("GET", "/v1/...")` sem genérico em `apps/frontend/src/data/services/` sai **verde** sobre a baseline, em `audit:static` e em `public_api_route_coverage`, e reprova sobre a árvore final. O relatório traz as duas saídas.
5. **Registro de rota em receptor não-`app`.** Um registro `/v1` em identificador diferente de `app` em `apps/bff/src` sai **verde** sobre a baseline e reprova sobre a árvore final.
6. **Relatório de outra execução.** Um `results.json` de execução anterior, presente antes do gate rodar, faz o passo falhar com erro nomeado em vez de declarar a retentativa daquele arquivo — provado nos dois gates, autenticado e público.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com identificação nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 6. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não mudar uma letra de copy** e não alterar `PRODUCT_OWN_TEXTS`: nem entrada nova, nem entrada removida, nem texto reescrito.
- **Não mudar comportamento da IA:** nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`, nenhuma mudança de quando o produto responde por conta própria.
- **Não mudar o contrato público** nem o que as rotas devolvem: nenhuma rota, verbo ou campo novo ou removido, `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma migration e nenhum `schema.prisma`.
- **Não mudar código de produção de `apps/frontend/src/`, `apps/bff/src/` nem `apps/ai-orchestrator/src/`.** Este Goal muda extratores, gates e seus testes. Se algum resíduo real aparecer em código de produção, ele vira **achado** a partir de **A-24**, com classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) e impacto de produto em uma frase — não vira correção silenciosa.
- **Não reprovar por retentativa** nem mudar `retries` em nenhum `playwright.*.config.ts`.
- **Não afrouxar asserção de gate renderizado:** nenhuma tolerância nova, nenhum teto aumentado, nenhum teste pulado, `fixme` ou `skip`, nenhuma largura removida da matriz, nenhuma mudança de tela, componente, texto de interface ou CSS.
- **Não tocar `apps/scheduling-service/`, `apps/evolution-go/` nem `apps/health-worker/`.**
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir nem reclassificar achado aberto:** A-04 a A-08, A-11 a A-17 e A-19 não são tocados. A-01 a A-03, A-09, A-10, A-18 e A-20 a A-23 continuam fechados e não são reabertos.
- **Não enfraquecer gate nenhum**, não encolher a lista de 35 passos de `validate:integration`, não remover check de `audit:static`, não remover nem renomear teste existente e não marcar teste como skip em silêncio.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

### 7. Prova

- `validate:core` exit 0 sobre a árvore final, com `audit:static` mostrando as regras de resíduo nomeadas, o `details` de escopo de cada regra tocada e `public_api_route_coverage` continuando a imprimir uma única rota sem chamador.
- `npm run test:gate` exit 0, com as regressões novas nos dois sentidos.
- A suíte do `ai-orchestrator` verde, com a contagem de testes antes e depois — nenhuma suíte encolheu. `test:bff` e `test:frontend` verdes.
- Os seis controles negativos executados, cada um com a saída real, e revertidos. Os controles 1, 4 e 5 trazem **as duas saídas**, baseline e árvore final.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.
- `validate:ui` executado sobre a árvore final pelo comando novo, provando que o gate renderizado continua verde, que as cinco larguras continuam sendo medidas e que a declaração de retentativa aparece.

### 8. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. O Goal036 e o Goal037 levaram rodada de `CHANGES_REQUIRED` por documentação escrita antes das últimas unidades: aqui isso é critério de aceite, não recomendação.

- [CURRENT_STATE](../CURRENT_STATE.md): delta038 — o que cada extrator passou a reconhecer por categoria nomeada, o que passou a ser resíduo e o que os dois gates renderizados passaram a exigir do relatório.
- [VALIDATION_GATE](../VALIDATION_GATE.md): as regras de resíduo, o frescor do relatório e a declaração de retentativa do gate público — o que cada uma decide **agora** e o que continua não decidindo, inclusive que `flaky` continua não reprovando.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§15**), no padrão de §8 e §10 a §14 e **sem reescrever** §4 a §14, registrando o fechamento da classe, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-24** quando houver.
- [DECISIONS](../DECISIONS.md): **D-054**, no formato das anteriores, cobrindo por que reconhecimento por forma exige resíduo declarado, por que a categoria de descarte é enumerada em vez de inferida e por que relatório de outra execução reprova enquanto `flaky` não reprova.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal038 no status resultante e o SHA aceito. Quatorze fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. O extrator de texto de `assistant.service.ts` devolve, sobre o arquivo real, os textos dos seis sítios `messages: [...]`, e o fechamento reprova se devolver menos textos do que sítios — provado pelo controle 1, com as duas saídas.
2. `PRODUCT_OWN_TEXTS` é idêntico ao da baseline, sem entrada nova, removida ou reescrita, provado por diff.
3. Os 16 sítios `text:` de `message-graph.ts` estão classificados em categorias nomeadas no código, com resíduo **zero** sobre a árvore real, e a saída real está no relatório.
4. Um `text:` com literal inline em `message-graph.ts` derruba o fechamento como resíduo, nomeando arquivo e linha — provado pelo controle 2.
5. A invariante de vocabulário de espera continua valendo sobre todos os textos do conjunto e continua mordendo — provado pelo controle 3.
6. O reconhecimento de chamada `routeSchema` em `apps/frontend/src/data/services/` não exige mais genérico; chamada sem genérico é reconhecida ou vira resíduo que reprova `audit:static` com regra nomeada, e o `details` declara os arquivos lidos — provado pelo controle 4, com as duas saídas.
7. O reconhecimento de registro de rota `/v1` em `apps/bff/src` não exige mais receptor chamado `app`; registro em outro identificador é reconhecido ou vira resíduo que reprova — provado pelo controle 5, com as duas saídas.
8. `public_api_route_coverage` continua imprimindo **uma** rota sem chamador — a de mídia —, com o conjunto computado e o número de rotas registradas no `details`; nenhuma allowlist por arquivo, rota ou linha entrou em nenhuma regra.
9. Nenhum import, comentário, literal de teste, erro técnico, chave de log, nome de nó do grafo ou sumário de handoff virou resíduo; o critério que os exclui está escrito no relatório.
10. O ensaio do gate autenticado prova que o `results.json` que lê é da execução que acabou, e relatório de execução anterior faz o passo falhar com erro nomeado — provado pelo controle 6.
11. `validate:ui` declara, na saída do passo, quantos e quais testes precisaram de retentativa, com projeto e título pela mesma regra de cadeia de suites, e usa o **mesmo** leitor do gate autenticado — uma implementação, não duas.
12. `npm run validate:ui` continua sendo o comando do gate público, continua executando `playwright test` com as cinco larguras, e o exit code não-zero do Playwright continua sendo o exit code do passo.
13. `retries: 1` continua inalterado nos dois `playwright.*.config.ts` e execução `flaky` continua terminando com sucesso nos dois gates.
14. Nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz de larguras continua com as cinco.
15. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhuma tela, componente, texto de interface ou CSS; nenhum arquivo de `apps/scheduling-service/`, `apps/evolution-go/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`.
16. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido.
17. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
18. Os seis controles negativos obrigatórios existem, cada um exercita **o artefato que o critério nomeia**, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
19. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos e `audit:static` não perdeu check.
20. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; resíduo encontrado em código de produção virou achado a partir de **A-24**, não correção silenciosa.
21. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, nem que a verificação de resposta roda em produção.
22. `validate:core` exit 0, `npm run test:gate` exit 0 e `validate:ui` exit 0 sobre a árvore final.
23. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
24. A documentação de §8 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados; [DECISIONS](../DECISIONS.md) tem **D-054** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§15** e nenhuma seção anterior foi reescrita.
25. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
26. `git status --porcelain` não lista artefato não rastreado não declarado.

## Entrega

Relatório do Developer com: a enumeração escrita das categorias de reconhecimento de cada um dos quatro extratores, com a saída real sobre a árvore real e resíduo zero em todos; as duas saídas dos controles 1, 4 e 5 — baseline verde, árvore final vermelha —, que são o que prova que cada cegueira era real; a saída real dos controles 2, 3 e 6; a prova por diff de que `PRODUCT_OWN_TEXTS` não mudou e de que nenhum arquivo de `src/` dos três apps foi tocado; o critério que distingue candidato de não candidato, com os casos que ele exclui nomeados; a forma escolhida para o leitor único de relatório e para a prova de frescor, com uma saída real de cada gate; o resultado por passo de `validate:core`, `test:gate`, `validate:ui` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual e A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
