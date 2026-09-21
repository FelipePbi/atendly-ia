# Goal 036 — Contrato público completo: campo a mais reprova e rota em laço é vista

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal035 ACCEPTED](../reviews/035-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 036 nasce na [v57 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 035, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `3202cb0b30f2e59c9d69e7a86b4940853c97d922`

Goal anterior: 035 — Contrato público verificado entre BFF e frontend

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal035 já integrado em `main` (origem `18080701e4c1f87e6dece47691b7fbfa0f2a69e6`), com **A-03** fechado, `packages/public-api-contract/` existindo com os 106 schemas movidos e a tabela de 116 rotas, o hook `onSend` de verificação de resposta em `apps/bff/src/lib/response-contract.ts`, os dois checks novos de `audit:static`, o [review035](../reviews/035-review.md) e a documentação de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O Goal035 deu ao produto um contrato público em um artefato só, lido pelos dois lados. Ao entregá-lo, mediu o alcance dele — e o alcance é menor do que "o contrato está verificado" sugere, em duas direções que o próprio Goal declarou por escrito em vez de esconder. **Este Goal fecha as duas, e fecha com elas os quatro achados que o 035 abriu.**

**A primeira cegueira é de forma.** `z.object` **remove** chave não declarada em vez de recusá-la. O controle negativo de campo a mais da rodada 1 do Goal035 (`conversationDays` acrescentado a `/v1/settings/retention`) passou **verde**, enquanto o controle de valor fora do vocabulário derrubou cinco testes. O que o gate cobre hoje é campo faltando, tipo errado, nulo indevido e valor fora do vocabulário; campo a mais, não — está escrito em [FINAL_AUDIT §12](../FINAL_AUDIT.md), na subseção "Limite da verificação: campo a mais não reprova".

**A segunda cegueira é de cobertura.** A regra `public_api_route_coverage` extrai rota do BFF com o path **entre aspas**, e `apps/bff/src/modules/conversations/routes.ts:207` registra `takeover`, `release` e `resolve` em laço, com template literal. Conferido nesta passada sobre esta baseline: **113 registros literais, 1 registro por template literal, 116 entradas na tabela, 112 rotas com chamador literal no frontend e 1 rota sem chamador.** Hoje não há lacuna — as três rotas do laço têm entrada e chamador —, mas a regra compara 113 rotas contra uma tabela de 116, e a próxima rota escrita nesse formato escapa em silêncio.

**As duas cegueiras juntas produziram quatro achados que hoje ninguém consegue reproduzir na árvore.** [FINAL_AUDIT §12](../FINAL_AUDIT.md) registra **A-20 a A-23**, todos `PENDENCIA-POS-MVP`, todos com o lado errado identificado como **o contrato** — o produtor cumpre o comportamento documentado em `apps/bff/PUBLIC_API_V1.md`. A-21, A-22 e A-23 só apareceram porque o hook foi **instrumentado temporariamente** para comparar o `data` enviado com o `data` devolvido pelo `safeParse`; a instrumentação foi revertida antes do aceite. Um achado que só uma instrumentação apagada consegue observar é um achado que volta.

O risco próprio deste Goal, e ele é o que o review vai procurar primeiro: **declarar o contrato completo enquanto o gate continua cego.** Acrescentar os campos que faltam sem tornar campo a mais reprovável fecha os quatro achados e **não** fecha a classe. Escrever a detecção só no nível raiz não veria `businessProfile.modalities`, que é aninhado. E apertar os schemas compartilhados com `.strict()` — em vez do gate do BFF — faria o **frontend** recusar resposta legítima, trocando um achado de auditoria por uma tela quebrada para quem está usando o produto.

Duas decisões de planejamento já estão tomadas e **não** são do Developer:

- **A rigidez mora no gate do BFF, nunca nos schemas compartilhados.** Nenhum `.strict()`, `.passthrough()` ou mudança de modo nos schemas de `packages/public-api-contract/src/schemas.ts`. O consumidor continua tolerante a campo que não conhece; quem fica intolerante é o produtor, em `development` e `test`, onde quebrar custa uma suíte.
- **Campo que passa a ser declarado é `optional` sempre que o produtor puder omiti-lo.** Declarar obrigatório por observação única faz o frontend recusar uma resposta legítima. O padrão já existe na árvore e é para ser seguido: `onboardingStateSchema.business.modalities` e `.address` são `optional` com o motivo escrito em comentário desde o Goal018.

## Dependências e contexto mínimo

- Goals 001 a 035 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [FINAL_AUDIT](../FINAL_AUDIT.md): **§12**, com A-20 a A-23, a subseção "Limite da verificação: campo a mais não reprova" e o veredito recontado (0 `BLOQUEADOR-MVP`, 11 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`).
- [review035](../reviews/035-review.md): as duas observações não bloqueantes — rota por template literal e a rota de mídia sem chamador.
- [`apps/bff/PUBLIC_API_V1.md`](../../../apps/bff/PUBLIC_API_V1.md): o contrato público como está documentado. **Quando o documento e a rota concordam e só o schema diverge, quem está errado é o schema.**
- [DECISIONS](../DECISIONS.md): **D-051** — a verificação de resposta é gate de drift e não escudo de runtime, e não liga em produção. Continua valendo inteira.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e a pré-condição de bancos descartáveis de `validate:integration`.
- **Product Vault:** não é necessário. Este Goal não decide regra de negócio. Divergência entre resposta e tela é questão de contrato.

### Fatos já confirmados na baseline, sem precisar redescobrir

- `packages/public-api-contract/src/routes.ts` tem **116** entradas, uma por rota `/v1` com chamador no frontend; `findPublicApiRoute(method, pathPattern)` resolve pela chave `${method} ${pathPattern}`.
- `apps/bff/src/lib/response-contract.ts` já tem o hook `onSend`, o erro nomeado `ResponseContractViolationError` com `method`, `pathPattern` e `fieldPaths`, a função pura `responseContractViolation(request, statusCode, payload)`, o helper `fieldPath` que formata `data.items[0].name`, o teto `MAX_REPORTED_ISSUES = 5` e `RESPONSE_CONTRACT_CHECK_ENABLED = env.NODE_ENV !== "production"`.
- O hook devolve o payload **pela mesma referência** e descarta o resultado do `safeParse`. Ele ignora status fora de 2xx, payload não-string, rota sem padrão registrado e rota sem entrada na tabela.
- `businessProfileSchema` (`schemas.ts:39`) declara `id`, `businessName`, `category`, `timezone`, `language`, `currency`, `createdAt`, `updatedAt` — e é o `businessProfile` de `sessionSchema` (`:57`).
- `systemStatusSchema` (`:867`) declara `ai: { desiredEnabled, effectiveEnabled, state }`, sem `reconciled`.
- O objeto `service` inline de `onboardingStateSchema` (`:137`) declara seis campos; o `serviceSchema` cheio do pacote já declara os sete que faltam.
- `deletedSchema` (`:547`) é `z.object({ deleted: z.literal(true) })`; a entrada de `DELETE /v1/customers/:id/primary-guardian` é `deletedSchema.or(customerPrimaryGuardianSchema)`; o produtor devolve `{ deleted: deleted.count > 0 }`; e `deletedSchema` também é consumido por `BffCalendarService.ts` e `BffCustomerService.ts` via `z.infer`.
- `scripts/final-production-audit.mjs` tem as funções puras `findUncoveredPublicApiRoutes`, `extractBffV1RouteRegistrations` e `extractPublicApiRouteTableEntries`, com os três regex no topo do bloco do Goal035; as regressões moram em `scripts/tests/final-production-audit-legacy-regression.test.mjs`, que já passa árvore sintética.
- `validate:integration` tem **35** passos. `validate:core` inclui `build:public-api-contract` antes dos builds dos apps e `audit:static`.

## Pontos de implementação

- `apps/bff/src/lib/response-contract.ts` — a detecção de chave não declarada.
- `packages/public-api-contract/src/schemas.ts` — os campos que passam a ser declarados.
- `packages/public-api-contract/src/routes.ts` — só se a entrada de uma rota precisar mudar de schema.
- `apps/bff/src/modules/conversations/routes.ts` — as três rotas do laço viram três registros literais.
- `scripts/final-production-audit.mjs` e `scripts/tests/` — a regra nova e as regressões.
- `apps/bff/tests/` — o teste permanente de cada achado fechado.
- `apps/bff/PUBLIC_API_V1.md` — só se descrever errado o que a rota devolve.

## Escopo obrigatório

### 1. Campo a mais reprova, em qualquer profundidade

A verificação de resposta passa a reprovar **chave presente no corpo e não declarada pelo contrato**, não só campo faltando ou tipo errado.

- O mecanismo é o que já encontrou A-21, A-22 e A-23: comparar o `data` emitido com o `data` que o `safeParse` devolveu, e reportar o que o parse **removeu**. Ele é preferido justamente porque não reimplementa a semântica do Zod: a chave que o schema aceitou permanece, e a que ele não declarou some.
- A comparação é **recursiva**: objeto dentro de objeto, elemento de array por índice, e o lado dentro de `union`/`or` que efetivamente parseou. `businessProfile.modalities` é aninhado, e uma detecção só de raiz não o veria — este é o caso de teste obrigatório.
- A chave não declarada entra no **mesmo erro nomeado** já existente, com o caminho no formato de `fieldPath` (`data.businessProfile.modalities`), a mesma identificação de rota e método e o mesmo teto de issues reportadas. Nada de erro novo, classe nova ou canal de saída novo.
- **Falso positivo é blocker.** Onde o schema legitimamente mantém chave arbitrária — `z.record`, `z.unknown`, `.passthrough()`, `.catchall()` — não há chave removida e portanto não há achado; a implementação não pode inventar um. A entrada de `GET /v1/conversations/:id/messages/:messageId/media` é `z.unknown()` e continua passando.
- A verificação continua **sem tocar o corpo devolvido**: o payload sai pela mesma referência, e continua **desligada em produção**, por [D-051](../DECISIONS.md). Nada neste Goal reabre essa decisão.

### 2. O contrato declara o que o produtor já devolve — A-21, A-22 e A-23

Os três são a mesma correção com três alvos, e em todos o lado que muda é **o contrato**, porque o produtor cumpre o que `apps/bff/PUBLIC_API_V1.md` documenta:

- **A-21:** `systemStatusSchema` passa a declarar `ai.reconciled`, com os valores que o documento descreve. O vocabulário vem do produtor e do documento, não de uma observação de suíte.
- **A-22:** `businessProfileSchema` passa a declarar `modalities` e `address`, no mesmo formato em que `/v1/onboarding` e `/v1/settings` já os declaram. A assimetria era só na sessão.
- **A-23:** o objeto `service` inline de `onboardingStateSchema` passa a declarar os sete campos que as duas rotas de onboarding já devolvem, no mesmo tipo do `serviceSchema` cheio.

Regras que valem para os três, e a violação de qualquer uma é blocker:

- **Cada campo novo é `optional` quando o produtor pode omiti-lo.** Obrigatório só quando o produtor **sempre** o emite, e o Developer diz no relatório como sabe disso — lendo o produtor, não observando uma execução.
- **Nenhum campo existente muda de tipo, de nome ou de obrigatoriedade.** Isto é declaração aditiva do que já trafega, não redesenho de contrato.
- **Nenhuma tela passa a usar o campo novo.** Declarar não é consumir. Nenhum componente, texto ou CSS muda.
- Se declarar um campo exigir corrigir `apps/bff/PUBLIC_API_V1.md`, a correção é do documento e só quando ele descrever errado o que a rota devolve.

### 3. A-20 — o corpo idempotente real da remoção de responsável

`DELETE /v1/customers/:id/primary-guardian` devolve `{ deleted: false }` quando não havia responsável, que é a remoção idempotente que o produto documenta, e a entrada da tabela admite só `z.literal(true)`.

- O lado que muda é o contrato: o corpo declarado passa a admitir o que a rota realmente emite.
- `deletedSchema` é consumido por mais de um `Bff*Service.ts` via `z.infer`. O Developer confere **todos** os consumidores do tipo e relata o efeito; se algum depender do literal, o relatório diz qual e como ficou.
- O achado passa a ter **reprodução permanente na árvore**: um teste do BFF exercita o caminho idempotente e prova que o corpo emitido satisfaz o contrato. Fechar A-20 sem esse teste é fechar reprodução sem fechar achado.

### 4. Rota `/v1` é registrada com path literal, e a cobertura passa a ver 116

- As três rotas do laço de `apps/bff/src/modules/conversations/routes.ts` passam a ser **três registros com path literal**. O comportamento de cada uma é idêntico ao de hoje — mesmo `preHandler`, mesma resolução de `id`, mesma chamada ao cliente da IA, mesmo corpo.
- Entra em `audit:static` uma regra nomeada que **reprova registro de rota `/v1` cujo path não seja literal de string**, com o `details` declarando o conjunto de arquivos que a regra efetivamente leu, no padrão que o Goal034 impôs e o Goal035 cumpriu.
- A regra de cobertura passa a comparar **116 rotas registradas** contra a tabela, e o número aparece no `details`. O conjunto de rotas sem chamador continua **computado**, nunca escrito à mão.
- A regressão em `scripts/tests/` exercita a regra nova **nos dois sentidos**, com árvore sintética: um arquivo com registro por template literal reprova; um só com literais passa.

### 5. Varredura: o que a verificação estrita encontrar entra no diff

Ligar a detecção de campo a mais sobre 116 rotas vai acender o que ninguém declarou até hoje. **Isso é o objetivo, não um contratempo.**

- O Developer roda a suíte do BFF e `validate:integration` inteiros com a verificação estrita ligada e **resolve cada divergência declarando a verdade**: o campo que o produtor emite passa a ser declarado, com `optional` decidido pela regra de §2.
- **Afrouxar é proibido.** Nenhuma exceção por rota, nenhuma allowlist de chave, nenhum `.passthrough()` para uma divergência sumir, nenhum teste desligado. Uma lista de desculpas escrita à mão é exatamente o que o Goal035 recusou e continua recusado.
- Divergência cuja correção exija mudar o que a rota devolve — e não o que o contrato declara — **não** é corrigida aqui: vira achado relatado, com identificador novo em sequência a partir de **A-24**, classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) e impacto de produto em uma frase.
- O relatório traz a lista completa do que a varredura acendeu, com rota, caminho de campo e o que foi feito em cada caso. "Rodou e ficou verde" sem essa lista não é evidência.

### 6. Controle negativo: cada invariante morde

No padrão dos Goals 031 a 035, com saída real no relatório e reversão obrigatória. **No mínimo cinco controles**, e estes cinco são obrigatórios. Cada um é provado **executando o artefato que ele diz derrubar** — derrubar um guard vizinho é o proxy que foi recusado na rodada 2 do Goal034:

1. **Campo a mais na raiz.** Acrescentar uma chave não declarada ao `data` de uma rota derruba a suíte de integração do BFF com o erro nomeado, citando a rota e o caminho da chave. É o controle que passava **verde** antes deste Goal.
2. **Campo a mais aninhado.** O mesmo, com a chave dentro de um objeto aninhado — o caso de `businessProfile.modalities`. Detecção só de raiz falha aqui, e falhar aqui é blocker.
3. **Campo declarado que some.** Remover do produtor um dos campos que este Goal passou a declarar como obrigatório derruba a suíte com o erro nomeado. Se um campo foi declarado `optional`, este controle usa um obrigatório e o relatório diz qual.
4. **Rota por template literal.** Registrar uma rota `/v1` com path em template literal derruba `audit:static` com a regra nova nomeada.
5. **Rota sem contrato.** Acrescentar rota `/v1` com chamador no frontend e sem entrada na tabela continua derrubando `public_api_route_coverage` — a regra existente não pode ter sido enfraquecida pela mudança.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com falha nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 7. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não apertar os schemas compartilhados.** Nenhum `.strict()`, `.passthrough()`, `.catchall()` ou mudança de modo em `packages/public-api-contract/src/schemas.ts`. A rigidez é do gate do produtor.
- **Não declarar obrigatório o que o produtor pode omitir.** Campo novo é `optional` salvo prova de que o produtor sempre o emite.
- **Não afrouxar schema nem manter exceção escrita à mão** para uma divergência sumir.
- **Não mudar o que as rotas devolvem.** Nenhuma rota nova, verbo novo, campo novo no corpo emitido, campo removido, código de erro novo. As três rotas do laço mudam de **forma de registro**, não de comportamento.
- **Não ligar a verificação de resposta em produção.** D-051 continua valendo inteira.
- **Não mudar comportamento de tela.** Nenhuma tela, componente, texto ou CSS. O gate renderizado do Goal033 continua exatamente como está, e nenhum campo recém-declarado passa a ser exibido.
- **Não tocar `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` nem `apps/health-worker/`**, nem migration, nem `schema.prisma`.
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir achado fora de A-20 a A-23.** A-04 a A-08, A-11 a A-17 e A-19 não são corrigidos, reclassificados nem tocados.
- **Não enfraquecer gate nenhum**, não encolher a lista de 35 passos de `validate:integration`, não remover check de `audit:static` e não marcar teste como skip em silêncio.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.** Em particular, os 106 schemas continuam sendo os mesmos schemas: o que muda são os campos nomeados em §2 e §3, e nada além deles.

### 8. Prova

- `validate:core` exit 0 sobre a árvore final, com `audit:static` mostrando a regra nova nomeada e o `details` de escopo de cada regra tocada.
- `npm run test:gate` exit 0, com as regressões novas nos dois sentidos.
- `test:bff` e `test:frontend` verdes, com a contagem de testes antes e depois — nenhuma suíte encolheu.
- Os cinco controles negativos executados, cada um com a saída real, e revertidos.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde. É aqui que a varredura de §5 acontece.
- `validate:ui` executado sobre a árvore final, provando que o gate renderizado continua verde e inalterado.

### 9. Documentação

Escrita **depois** da última mudança de árvore:

- [CURRENT_STATE](../CURRENT_STATE.md): delta036 — o que a verificação passou a reprovar e o que o contrato passou a declarar.
- [VALIDATION_GATE](../VALIDATION_GATE.md): a regra estática nova, o que a verificação de resposta decide **agora** e o que ela continua não decidindo — inclusive que segue desligada em produção.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (§13) fechando **A-20 a A-23**, no padrão de §8 e §10 a §12 — **sem reescrever** §4 a §12 —, com o veredito recontado, a cegueira de campo a mais registrada como fechada e os achados novos a partir de **A-24** quando houver.
- [DECISIONS](../DECISIONS.md): **D-052**, no formato das anteriores, cobrindo por que a rigidez contra campo a mais mora no produtor e não no consumidor, por que campo declarado é opcional quando o produtor pode omiti-lo, e por que registro de rota `/v1` passa a exigir path literal.
- `apps/bff/PUBLIC_API_V1.md` só é tocado se descrever errado o que a rota já devolve.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A verificação de resposta do BFF reprova chave presente no corpo e não declarada pelo contrato, com o mesmo erro nomeado, citando rota, método e caminho da chave no formato de `fieldPath`.
2. A detecção é **recursiva**: prova com chave aninhada em objeto e com chave em elemento de array, cada uma com teste próprio.
3. A verificação continua devolvendo o payload pela mesma referência, sem remover, reordenar, coagir nem preencher nada, e continua desligada em produção.
4. Nenhum schema de `packages/public-api-contract/src/schemas.ts` ganhou `.strict()`, `.passthrough()` ou `.catchall()`, e nenhum campo existente mudou de nome, tipo ou obrigatoriedade.
5. `systemStatusSchema` declara `ai.reconciled` com o vocabulário que o produtor emite e que `PUBLIC_API_V1.md` documenta — **A-21** fechado.
6. `businessProfileSchema` declara `modalities` e `address` no mesmo formato de `/v1/onboarding` e `/v1/settings` — **A-22** fechado.
7. O objeto `service` inline de `onboardingStateSchema` declara os sete campos que as duas rotas de onboarding devolvem — **A-23** fechado.
8. O corpo idempotente real de `DELETE /v1/customers/:id/primary-guardian` satisfaz o contrato, todos os consumidores de `deletedSchema` foram conferidos e o efeito de cada um está no relatório — **A-20** fechado.
9. Cada um dos quatro achados tem **reprodução permanente na árvore**: teste que fica vermelho se a divergência voltar. Nenhum deles depende de instrumentação temporária.
10. Cada campo novo é `optional` ou obrigatório conforme a regra de §2, e o relatório diz, para cada um, como o Developer sabe que o produtor sempre o emite.
11. As três rotas `takeover`, `release` e `resolve` são registradas com path literal, com comportamento idêntico ao da baseline.
12. `audit:static` tem regra nomeada que reprova registro de rota `/v1` com path não literal, cujo `details` declara os arquivos lidos e cuja regressão exercita os dois sentidos.
13. `public_api_route_coverage` passa a ver **116** rotas registradas, o número aparece no `details`, e o conjunto de rotas sem chamador continua computado e impresso.
14. A varredura de §5 está no relatório com a lista completa do que acendeu — rota, caminho de campo e o que foi feito —, sem allowlist, sem exceção por rota e sem teste desligado.
15. Divergência cuja correção exigiria mudar o que a rota devolve está relatada como achado a partir de **A-24**, com classificação no vocabulário fechado e impacto de produto em uma frase.
16. Nenhuma rota nova, verbo novo, campo novo no corpo emitido ou campo removido; nenhuma migration, nenhum `schema.prisma`.
17. Nenhum arquivo de `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` ou `apps/health-worker/` mudou, e nenhuma tela, componente, texto ou CSS do frontend mudou.
18. Os cinco controles negativos obrigatórios existem, cada um derruba **o artefato que o critério nomeia** com falha nomeada, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
19. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; a lista de `validate:integration` continua com os mesmos 35 passos e `audit:static` não perdeu check.
20. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado; A-20 a A-23 só são declarados fechados com a verificação executada.
21. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, nem que a verificação de resposta roda em produção.
22. `validate:core` exit 0, `npm run test:gate` exit 0 e `validate:ui` exit 0 sobre a árvore final.
23. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
24. A documentação de §9 foi escrita depois da última mudança de árvore, [DECISIONS](../DECISIONS.md) tem **D-052** no formato das anteriores, e nenhuma seção anterior de [FINAL_AUDIT](../FINAL_AUDIT.md) foi reescrita — a seção nova é §13 e o conteúdo novo mora dentro dela.
25. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
26. `git status --porcelain` não lista artefato não rastreado não declarado.

## Entrega

Relatório do Developer com: o mecanismo exato da detecção de chave não declarada, onde ela mora e por que não produz falso positivo em `z.record`, `z.unknown` e união; a prova dos dois casos recursivos, raiz e aninhado; a lista dos campos que passaram a ser declarados, um a um, com `optional` ou obrigatório e o motivo lido no produtor; o efeito da mudança de `deletedSchema` em cada consumidor; a confirmação de que as três rotas do laço têm comportamento idêntico ao da baseline, com o diff; a saída real de `audit:static` com a regra nova e o `details` de escopo, mais o número de rotas registradas que a cobertura passou a ver; a lista completa do que a varredura da verificação estrita acendeu e o que foi feito em cada caso; a saída real dos cinco controles negativos, com a confirmação de que foram revertidos; o resultado por passo de `validate:core`, `test:gate`, `validate:ui` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
