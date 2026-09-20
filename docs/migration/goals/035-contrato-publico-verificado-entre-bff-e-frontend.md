# Goal 035 — Contrato público verificado entre BFF e frontend

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal034 ACCEPTED](../reviews/034-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

A linha 035 nasce na [v56 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 034, sem renumerar para trás e sem remover ID. Ela existe porque, depois de A-01 (Goal031), A-02 (Goal033) e A-09/A-10/A-18 (Goal034), **A-03 é o único achado aberto que este repositório fecha sozinho** — sem credencial externa, sem ambiente hospedado e sem decisão de pessoa.

## Baseline aceita

Baseline aceita: `f1fb6203d11270053c8e702d155b98ff7915e7bc`

Goal anterior: 034 — Guardrails do produto como invariante verificada

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal034 já integrado em `main` (origem `efcec2228c3aa3b48ddefa9b8e9dc7c6fbed418a`), com A-09, A-10 e A-18 fechados, `group_discard_is_not_configuration` e `frontend_has_no_dark_theme_css` em `audit:static`, o quinto elo do ensaio do Goal032, o [review034](../reviews/034-review.md) e a documentação de fechamento. O commit `0ff5937`, posterior a ela, corrige apenas o cabeçalho de status do documento do próprio Goal034 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Fazer o corpo que o BFF devolve parar de ser **palpite do consumidor** e passar a ser **contrato declarado em um artefato só**, lido pelos dois lados e verificado do lado de quem produz.

A auditoria escreve o achado em uma frase, e o impacto em outra. [FINAL_AUDIT A-03](../FINAL_AUDIT.md): "o BFF pode mudar o corpo que devolve sem nada ficar vermelho, e a divergência aparece pela primeira vez como tela quebrada para o usuário". Hoje o frontend declara 106 formatos de resposta em `apps/frontend/src/data/mappers/publicApiSchemas.ts`, **ninguém fora de `apps/frontend` lê essas declarações**, `packages/` tem só `legal-contract`, e **nenhuma das 115 rotas do BFF valida a própria resposta**. A fronteira oposta já é guardada — o BFF valida com Zod o que recebe do ai-orchestrator (`apps/bff/src/clients/ai-orchestrator/index.ts:141`). É a fronteira pública, a que o usuário vê, que está sem guarda.

O risco próprio deste Goal é o mesmo dos Goals 031 a 034 com outra roupa: **fechar a reprodução sem fechar o achado**. A reprodução sai `exit 0` com três condições formais — um pacote de contrato existir, alguém fora do frontend ler as declarações e **um** arquivo do BFF validar resposta. Satisfazer as três com uma rota e um pacote vazio é fabricar prova, e é blocker de review. O que fecha A-03 é a **cobertura**: toda rota `/v1` que o produto chama tem contrato e valida a própria resposta, e a lista do que fica de fora é **computada**, não escrita à mão.

Três decisões de planejamento já estão tomadas e não são do Developer:

- **O contrato não é schema novo.** Os 106 schemas são **movidos**, não reescritos. Reescrever schema no mesmo Goal em que ele vira gate faz o gate medir o que o Developer decidiu, não o que o produto devolve.
- **A lista de rotas sem contrato é computada.** Uma rota `/v1` só fica de fora se **nenhum** `Bff*Service.ts` a chamar, e o próprio gate calcula e imprime esse conjunto. Lista de exceção escrita à mão envelhece em silêncio.
- **A validação de resposta não fica ligada em produção.** Ela existe para ficar vermelha em teste, em `validate:integration` e nos ensaios, onde quebrar é barato. Ligá-la no caminho da cliente transformaria divergência de schema em erro 500 para quem está comprando. Esse limite é declarado por escrito e não vale como prova de nada além do que mede.

## Dependências e contexto mínimo

- Goals 001 a 034 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [FINAL_AUDIT](../FINAL_AUDIT.md): **A-03** em §6 (com a nota sobre a fronteira oposta já guardada), o veredito de §7 e o recontar de §11.
- [`apps/bff/PUBLIC_API_V1.md`](../../../apps/bff/PUBLIC_API_V1.md): o contrato público como está documentado hoje. Divergência entre o documento e a rota é **achado**, não licença para mudar a rota.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e a pré-condição de bancos descartáveis de `validate:integration`.
- [AGENTS.md](../../../AGENTS.md): guardrails do produto. Este Goal **não** muda comportamento de produto nenhum.
- **Product Vault:** não é necessário. Este Goal não decide regra de negócio. Se alguma resposta divergir do que a tela espera, a pergunta é de contrato, não de produto.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `f1fb6203`. Não gastar rodada redescobrindo:

- **A reprodução sai `exit 1` hoje.** `node apps/bff/tests/goal030-a03-contract-drift.repro.mjs` imprime: 106 formatos declarados pelo frontend, **0** consumidores fora de `apps/frontend`, `packages/` só com `legal-contract`, **115** rotas registradas, **0** arquivos do BFF validando resposta. O arquivo tem 115 linhas, é estático de propósito (não sobe banco nem servidor) e o cabeçalho declara que `exit 0` passaria a significar que alguém fechou **G-32**.
- **São 113 rotas `/v1` e 2 `/health`.** Por arquivo: `calendar` 33, `customers` 18, `conversations` 10, `migrations` 9, `auth` 8, `settings` 6, `knowledge` 6, `notifications` 5, `whatsapp` 4, `services` 3, `onboarding` 3, `activation-test` 3, `retention` 2, `account` 2, `routes/health.ts` 2, `status` 1, `dashboard` 1. Todas registradas por `app.<verbo>("<path>"` em `apps/bff/src/modules/*/routes.ts`, muitas com o path na linha seguinte à chamada.
- **O mapa rota→formato já existe na árvore, espalhado.** `BffHttpClient.request` exige `path` **e** `schema` em toda chamada (`apps/frontend/src/data/http/BffHttpClient.ts`, `BffRequestOptions`), e os dezessete arquivos de `apps/frontend/src/data/services/` fazem esse pareamento em cada método — `BffServiceCatalogService.ts:30`–`:35` é o exemplo mínimo (`path: "/v1/services"`, `schema: serviceListSchema`). O trabalho deste Goal é tornar esse mapa **um artefato único**, não inventá-lo.
- **O envelope é `{ data, requestId }`.** `dataResponse` em `apps/bff/src/lib/http.ts:6`–`:11`; o `BffHttpClient` valida `responseEnvelopeSchema` e aplica o schema da chamada sobre `data`. O contrato de resposta descreve o **`data`**, não o envelope.
- **Os schemas são estritos e usáveis como contrato do produtor.** `publicApiSchemas.ts` tem 1377 linhas, 106 `export const *Schema`, **nenhuma** ocorrência de `passthrough`, `catchall`, `.optional()` ou `nullish` — são `z.object` com `z.email()`, `z.literal`, `z.enum`, `min(1)` e regex de data/hora. Zod é `^4.4.3` nos dois apps.
- **Existe precedente exato de pacote compartilhado.** `packages/legal-contract` é consumido pelos dois apps por `file:../../packages/legal-contract` (`apps/bff/package.json:24`, `apps/frontend/package.json:22`), com `transpilePackages` em `apps/frontend/next.config.ts:22` e reexport local em `src/config/legal-versions.ts` dos dois lados. Ele é `index.js` + `index.d.ts` escritos à mão, **sem build** — o que não serve para 1377 linhas de Zod.
- **O BFF compila com `rootDir: "src"` e `module: "NodeNext"`** (`apps/bff/tsconfig.json`), e `build` é `prisma generate && tsc -p tsconfig.json`. Um pacote em TypeScript puro **não** é compilado pelo `tsc` do BFF: o pacote precisa publicar JS + `.d.ts` emitidos por build próprio, e esse build precisa acontecer **antes** de `build:bff` e `build:frontend`.
- **`validate:core` constrói na ordem** `build:scheduling-service`, `build:ai-orchestrator`, `build:bff`, `build:frontend` (`scripts/validate-core.mjs:23`–`:26`), roda `audit:static` (`:64`) e `test:gate-scripts` (`:58`). `coreSteps` é exportado e consumido por `scripts/tests/gate.test.mjs`, que hoje **não** afirma a lista exata.
- **O BFF já tem hooks e roda Fastify `^5.6.2`.** `apps/bff/src/app.ts:92` (`onRequest`) e `:100` (`onSend`), com as dezessete funções `registerV1*Routes` chamadas em `:114`–`:131`. Em Fastify 5, `request.routeOptions.url` devolve o **padrão** da rota (`/v1/services/:id`), que é a chave natural do registro.
- **`audit:static` já tem o padrão a seguir.** `scripts/final-production-audit.mjs` expõe funções puras (`findGroupDiscardConfigurationViolations:557`, `findDarkThemeCssReferences:583`, …) e registra com `check(name, ok, details)`; `sourceFiles`(`:901`), `configurationFiles`(`:927`) e `styleFiles`(`:947`) são os coletores, e **cada um coleta extensões diferentes** — foi exatamente aí que o Goal034 foi recusado na rodada 1.
- **Os testes de regressão provam nos dois sentidos.** `scripts/tests/final-production-audit-legacy-regression.test.mjs` usa árvore sintética que passa e árvore sintética que falha; `scripts/tests/final-production-audit.test.mjs` (nascido no 034) roda o **script real** contra árvore mutada.
- **`validate:integration` tem 35 passos**, com `rehearse:goal030-mvp-journey` (`scripts/validate-integration.mjs:601`), `rehearse:goal032-auto-reply` (`:613`) e `rehearse:goal033-authenticated-ui` (`:626`); `scripts/tests/validate-integration.test.mjs` afirma a lista exata. `apps/bff/tests/` tem 42 arquivos, dos quais 40 são coletados pelo Vitest.

## Pontos de implementação

- `packages/public-api-contract/` (novo): os schemas movidos e a tabela de rotas, com build próprio emitindo JS + `.d.ts`.
- `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `apps/frontend/src/data/services/*.ts`, `apps/frontend/src/data/index.ts`, `apps/frontend/next.config.ts`, `apps/frontend/package.json`: passar a consumir o pacote.
- `apps/bff/src/app.ts`, `apps/bff/src/lib/`, `apps/bff/package.json`: o registro rota→contrato e a verificação de resposta.
- `scripts/final-production-audit.mjs`, `scripts/tests/`, `scripts/validate-core.mjs`: as regras estáticas, os casos negativos e o passo de build do pacote.
- `apps/bff/tests/goal030-a03-contract-drift.repro.mjs`: a reprodução, que passa a sair `exit 0` e a ser executada permanentemente.
- `docs/migration/`: conforme §10.

**Nenhum arquivo de `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` ou `apps/health-worker/` deve mudar.** Nenhuma migration, nenhum `schema.prisma`, **nenhuma rota nova, nenhum verbo novo, nenhum campo novo no corpo de resposta**. `apps/bff/package.json`, `apps/frontend/package.json` e os dois `package-lock.json` mudam **apenas** para declarar a dependência nova. Nenhum comando `pnpm` ou `corepack`.

## Escopo obrigatório

### 1. O pacote de contrato existe e é o único lugar onde o formato é declarado

- Nasce `packages/public-api-contract/`, no padrão de dependência de `packages/legal-contract` (`file:` nos dois apps), mas com **build próprio**: fonte em TypeScript, emissão de JS + `.d.ts`, `exports` declarado no `package.json`. Zod entra como **`peerDependency`**, nunca como dependência própria — duas cópias de Zod na árvore é defeito, não detalhe.
- Os 106 schemas de `apps/frontend/src/data/mappers/publicApiSchemas.ts` são **movidos para o pacote sem alteração de conteúdo**. Mover não é reescrever: qualquer mudança de campo, de tipo, de `min`, de regex ou de nome exportado neste Goal é blocker de review, e o Developer confere o conteúdo movido contra `git show HEAD:apps/frontend/src/data/mappers/publicApiSchemas.ts`.
- O arquivo antigo do frontend deixa de declarar schema próprio. Ou some, com os importadores apontando para o pacote, ou vira reexport fino — a escolha é do Developer, desde que **não exista mais declaração de formato de resposta fora do pacote**.
- O build do pacote roda **antes** de `build:bff` e `build:frontend` em `validate:core`, e o passo novo aparece nomeado na saída do gate. `scripts/tests/gate.test.mjs` passa a afirmar que o passo existe e **precede** os dois builds.

### 2. A tabela de rotas é o contrato, e ela mora no pacote

- O pacote exporta uma **tabela de rotas** com uma entrada por rota `/v1` que o produto chama: método, o **padrão** do path como o BFF o registra (`/v1/services/:id`, não a URL concreta) e o schema do `data` da resposta de sucesso.
- As entradas são derivadas do pareamento `path` + `schema` que já existe nos dezessete `Bff*Service.ts`. Onde o serviço monta o path com template (`/v1/services/${encodeURIComponent(id)}`), a entrada usa o padrão correspondente.
- Os `Bff*Service.ts` passam a obter o schema **da tabela**, não de import solto, de modo que consumidor e produtor leiam a mesma entrada. Nenhum comportamento de tela muda: mesmos paths, mesmos métodos, mesmos tipos.
- Rota `/health`, webhook e qualquer rota sem chamador no frontend **não** entram na tabela. Elas entram no conjunto computado de §4.

### 3. O BFF valida a própria resposta, com erro nomeado e fora de produção

- O BFF registra a tabela e passa a validar o `data` que devolve contra a entrada da rota, por hook único no ciclo de resposta, usando `request.routeOptions.url` como chave. Rota sem entrada não é validada e **não** é erro em runtime — quem cobra a existência da entrada é o gate estático de §4.
- Quando a validação falha, o erro é **nomeado**, identifica rota, método e o caminho do campo divergente, e **derruba o teste**. Em produção a verificação fica desligada; o padrão de ativação é explícito no código, com o motivo escrito: gate de drift, não escudo de runtime.
- A validação **não altera o corpo devolvido**. Nada é removido, reordenado, coagido ou preenchido: quem valida observa, não reescreve. Resposta de erro (`AppError`, envelope de erro) não é tocada.
- **Divergência real encontrada é o objetivo, não acidente.** Se a validação reprovar uma rota porque o BFF devolve algo diferente do que a tela declara, o Developer determina qual lado está errado. Defeito do produtor que caiba no escopo é corrigido no BFF, com o motivo escrito. Divergência cuja correção exigiria mudar contrato público, schema de banco ou comportamento de produto para o Goal ali: vira achado relatado, com identificador novo a partir de **A-20**, e o Tech Lead decide. Afrouxar o schema movido para a divergência sumir é blocker de review.

### 4. O gate estático: rota nova sem contrato fica vermelha

Duas regras novas em `scripts/final-production-audit.mjs`, funções puras exportadas, no padrão das existentes, cada uma exercitada **nos dois sentidos** pelo teste de regressão:

- **Cobertura.** Toda rota `/v1` registrada em `apps/bff/src` que **tenha chamador** em `apps/frontend/src/data/services/` tem entrada na tabela de contrato. O conjunto sem chamador é **computado pela própria regra** e impresso nomeadamente no `details` — nunca uma lista literal mantida à mão.
- **Fonte única.** Nenhum arquivo de `apps/frontend/src` declara schema de resposta de rota pública por conta própria fora do pacote.
- O `details` de **cada** uma declara, em texto, **o conjunto de arquivos que a regra efetivamente leu**. Foi a divergência entre escopo afirmado e escopo real que derrubou a rodada 1 do Goal034, e este Goal nasce com a exigência escrita: se a regra lê só `sourceFiles`, o `details` diz isso.
- Os dois checks aparecem nomeados na saída de `audit:static`, que já roda em `validate:core`.

### 5. A reprodução de A-03 sai do limbo

- `apps/bff/tests/goal030-a03-contract-drift.repro.mjs` passa a sair **`exit 0`** na árvore final, e o motivo é a cobertura real, não as três condições formais.
- Ela deixa de ser arquivo fora do caminho verde: passa a ser executada em gate — como passo próprio ou dentro de `audit:static`, à escolha do Developer —, de modo que voltar a reproduzir deixe alguma coisa vermelha. O cabeçalho é atualizado para dizer o que ela passou a significar; o texto histórico do que ela reproduzia **não** é apagado.
- Se o Developer renomear o arquivo por ele não ser mais "reprodução", o nome antigo é citado no relatório e em FINAL_AUDIT, para que o comando registrado em §6 da auditoria continue rastreável.

### 6. Controle negativo: cada invariante morde

No padrão dos Goals 031 a 034, com saída real no relatório e reversão obrigatória. **No mínimo cinco controles**, e estes cinco são obrigatórios. Cada um é provado **executando o artefato que ele diz derrubar** — derrubar um guard vizinho é o proxy que foi recusado na rodada 2 do Goal034:

1. **Drift de campo.** Mudar o tipo ou o nome de um campo em uma resposta do BFF derruba o teste de integração do BFF com o erro nomeado da rota.
2. **Rota sem contrato.** Acrescentar rota `/v1` com chamador no frontend e sem entrada na tabela derruba `audit:static` com o check de cobertura nomeado.
3. **Schema fora do pacote.** Declarar um schema de resposta em `apps/frontend/src` fora do pacote derruba `audit:static` com o check de fonte única nomeado.
4. **Pilha real.** Um drift que só o percurso exercita derruba `rehearse:goal030-mvp-journey` com falha nomeada, executado contra cluster descartável.
5. **Reprodução.** A reprodução de A-03, executada na baseline `f1fb6203`, sai `exit 1`; na árvore final, `exit 0`. Os dois lados no relatório.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com falha nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 7. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não fechar a reprodução sem fechar o achado.** Pacote vazio, uma rota validada e um import de fachada satisfazem as três condições do script e **não** fecham A-03.
- **Não reescrever schema.** Os 106 formatos são movidos com o conteúdo idêntico. Afrouxar schema para uma divergência sumir é o inverso do objetivo.
- **Não mudar contrato público.** Nenhuma rota nova, nenhum verbo novo, nenhum campo novo, nenhum campo removido, nenhum código de erro novo. `apps/bff/PUBLIC_API_V1.md` só muda se descrever errado o que a rota já devolve hoje, e a correção é do documento.
- **Não mudar comportamento de tela.** Nenhuma tela, nenhum componente, nenhum texto, nenhum CSS. O gate renderizado do Goal033 continua exatamente como está.
- **Não ligar a validação de resposta em produção.**
- **Não manter lista de exceção escrita à mão.** O conjunto de rotas sem contrato é computado.
- **Não tocar `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` nem `apps/health-worker/`**, nem migration, nem schema de banco.
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir achado fora de A-03.** A-04 a A-08, A-11 a A-17 e A-19 não são corrigidos, reclassificados nem tocados. Defeito encontrado fora do escopo vira achado relatado, com identificador novo em sequência a partir de **A-20**, classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) e impacto de produto em uma frase.
- **Não enfraquecer gate nenhum**, não encolher a lista de 35 passos de `validate:integration` e não marcar teste como skip em silêncio.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

### 8. Instalação e build precisam ser provados, não supostos

- A dependência nova é declarada em `apps/bff/package.json` e `apps/frontend/package.json` e refletida nos respectivos `package-lock.json`, com `npm` — nunca `pnpm` nem `corepack`.
- O Developer prova, por execução, que **a resolução funciona nos dois apps a partir de instalação limpa**: `npm ci` (ou `npm install` quando o lock exigir regeneração) seguido de build, com a saída real no relatório. `Cannot find module` descoberto pelo reviewer é blocker.
- O Developer prova que **existe uma só cópia de Zod** em uso por app depois da instalação, e diz como provou.

### 9. Prova

- `validate:core` exit 0 sobre a árvore final, com o passo de build do pacote nomeado antes dos builds dos apps e `audit:static` mostrando os dois checks novos nomeados.
- `npm run test:gate` exit 0, com as regressões novas nos dois sentidos.
- `test:bff` e `test:frontend` verdes, com a contagem de testes antes e depois — nenhuma suíte encolheu.
- Os cinco controles negativos executados, cada um com a saída real, e revertidos.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.
- `validate:ui` executado sobre a árvore final, provando que o gate renderizado continua verde e inalterado.

### 10. Documentação

Escrita **depois** da última mudança de árvore:

- [CURRENT_STATE](../CURRENT_STATE.md): delta035 — o pacote de contrato, quem o lê e o que passou a ficar vermelho.
- [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md): o contrato público como artefato compartilhado, se e onde o documento hoje descrever a fronteira de outro jeito.
- [VALIDATION_GATE](../VALIDATION_GATE.md): os checks estáticos novos, o passo de build novo, o que cada um decide e o que continua não decidindo — inclusive que a verificação de resposta **não** roda em produção.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (§12) fechando **A-03**, no padrão de §8, §10 e §11 — **sem reescrever** §4 a §11 —, com o veredito recontado, os achados novos a partir de **A-20** quando houver, e o limite da verificação escrito.
- [DECISIONS](../DECISIONS.md): **D-051**, no formato das anteriores, cobrindo o contrato público como artefato único versionado com o código, por que a validação de resposta é gate e não escudo de runtime, e por que a lista de rotas sem contrato é computada em vez de mantida.
- `apps/bff/PUBLIC_API_V1.md` só é tocado se descrever errado o que a rota já devolve.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. `packages/public-api-contract/` existe, tem build próprio emitindo JS + `.d.ts`, declara Zod como `peerDependency` e é dependência declarada dos dois apps.
2. Os 106 schemas foram movidos com conteúdo **idêntico** ao da baseline, conferido contra `git show`; nenhum campo, tipo, limite, regex ou nome exportado mudou.
3. Nenhum arquivo de `apps/frontend/src` declara schema de resposta de rota pública fora do pacote.
4. O pacote exporta tabela de rotas com entrada para **toda** rota `/v1` que tem chamador em `apps/frontend/src/data/services/`, com o padrão de path como o BFF o registra.
5. Os dezessete `Bff*Service.ts` obtêm o schema da tabela; nenhum path, método ou tipo de retorno de tela mudou.
6. O BFF valida o `data` que devolve contra a entrada da rota, com erro nomeado que identifica rota, método e campo, e a verificação fica **desligada em produção**, com o motivo escrito no código.
7. A validação não altera o corpo devolvido, e as respostas de erro não foram tocadas.
8. `audit:static` tem check de **cobertura** nomeado, que falha com rota `/v1` chamada pelo frontend e sem entrada na tabela, e cujo conjunto de rotas sem chamador é **computado e impresso**.
9. `audit:static` tem check de **fonte única** nomeado, que falha com schema de resposta declarado fora do pacote.
10. O `details` de cada check novo declara o conjunto de arquivos que a regra efetivamente lê, e o teste de regressão exercita cada regra nos dois sentidos.
11. A reprodução de A-03 sai `exit 0` na árvore final e `exit 1` na baseline `f1fb6203`, com as duas saídas no relatório, e passa a ser executada em gate.
12. Nenhuma rota nova, verbo novo, campo novo ou campo removido no contrato público; nenhuma migration, nenhum `schema.prisma`.
13. Nenhum arquivo de `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` ou `apps/health-worker/` mudou, e nenhuma tela, componente, texto ou CSS do frontend mudou.
14. Divergência real encontrada entre o que o BFF devolve e o que a tela declara está no relatório, com o lado corrigido e o motivo, ou com identificador a partir de A-20 quando a correção exceder o escopo. Nenhum schema foi afrouxado para uma divergência sumir.
15. `validate:core` tem passo nomeado de build do pacote **antes** de `build:bff` e `build:frontend`, e `scripts/tests/gate.test.mjs` afirma essa precedência.
16. A instalação limpa foi provada nos dois apps, com saída real, e existe uma só cópia de Zod em uso por app; nenhum comando `pnpm` ou `corepack` foi invocado.
17. Os cinco controles negativos obrigatórios existem, cada um derruba **o artefato que o critério nomeia** com falha nomeada, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
18. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; a lista de `validate:integration` continua com os mesmos 35 passos.
19. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado; **A-03** só é declarado fechado com a verificação executada.
20. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, nem que a verificação de resposta roda em produção.
21. `validate:core` exit 0, `npm run test:gate` exit 0 e `validate:ui` exit 0 sobre a árvore final.
22. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
23. A documentação de §10 foi escrita depois da última mudança de árvore, [DECISIONS](../DECISIONS.md) tem **D-051** no formato das anteriores, e nenhuma seção anterior de [FINAL_AUDIT](../FINAL_AUDIT.md) foi reescrita.
24. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
25. `git status --porcelain` não lista artefato não rastreado não declarado.

## Entrega

Relatório do Developer com: a forma do pacote e como os dois apps o resolvem, com a saída real da instalação limpa e a prova de cópia única de Zod; a confirmação, com o comando usado, de que os 106 schemas foram movidos sem alteração; a tabela de rotas com a contagem de entradas e o conjunto **computado** de rotas sem chamador, nomeado; o ponto exato da verificação de resposta no BFF, como ela é ligada e desligada e o texto do erro nomeado; a saída real de `audit:static` com os dois checks novos e o `details` de escopo de cada um; as divergências reais encontradas, com o lado corrigido ou o identificador a partir de A-20; as duas saídas da reprodução de A-03 (baseline e árvore final); a saída real dos cinco controles negativos, com a confirmação de que foram revertidos; o resultado por passo de `validate:core`, `test:gate`, `validate:ui` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
