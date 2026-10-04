# Review formal — Goal 035

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-20, conforme o [Goal035](../goals/035-contrato-publico-verificado-entre-bff-e-frontend.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–034) foi reaberto, reavaliado ou revertido. Duas rodadas: uma `CHANGES_REQUIRED` (4 blockers) e o aceite na segunda, com zero blockers.

O Goal tinha uma classe de risco nomeada no próprio enunciado — **fechar a reprodução sem fechar o achado** — e uma segunda, que o enunciado não previu e que produziu três dos quatro blockers da rodada 1: **afirmar prova de empacotamento que a árvore não sustenta**. O núcleo arquitetural — schemas movidos sem reescrita, tabela de rotas derivada do pareamento que já existia, verificação de resposta como gate e não escudo, lista de rotas sem chamador computada — estava certo desde a rodada 1 e não foi tocado pelas correções. O que foi recusado foi o caminho de instalação, a contagem da tabela, o escopo dos lockfiles e uma frase de auditoria que negava os achados que o próprio relatório declarava.

## Escopo e identidade do diff

- Baseline aceita vigente: `f1fb6203d11270053c8e702d155b98ff7915e7bc` (implementação do Goal034). Base imediata da implementação: `250789ebc39d954713a6ccc4be38b8bbb56ebaf9` (fechamento do Goal034), HEAD da worktree `.ai-worktrees/goal-035`, inalterado nas duas rodadas.
- Snapshot aceito, calculado pelo IA Loop: **45 arquivos**, hash do diff `c349047abcce151137c994489d6109815034134a5a5b5bb9725e09ef87f7d58a`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **pacote novo** 6 arquivos (`packages/public-api-contract/`: `package.json`, `package-lock.json`, `tsconfig.json`, `src/index.ts`, `src/routes.ts`, `src/schemas.ts`); **frontend** 21 arquivos (os dezessete `Bff*Service.ts`, `BffHttpClient.ts`, `publicApiSchemas.ts`, `next.config.ts` e `.npmrc`); **BFF** 5 arquivos (`src/app.ts`, `src/lib/response-contract.ts` novo, a reprodução de A-03, `package.json`, `.npmrc`); **gate e scripts** 6 arquivos (`scripts/validate-core.mjs`, `scripts/build-all.sh`, `scripts/build-public-api-contract.mjs` novo, `scripts/final-production-audit.mjs`, `scripts/tests/gate.test.mjs`, `scripts/tests/final-production-audit-legacy-regression.test.mjs`); **manifests e lockfiles dos apps** 4 arquivos; **documentação** 5 arquivos em `docs/migration/`.
- **Nenhum arquivo de `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` ou `apps/health-worker/` mudou.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota nova, nenhum verbo novo, nenhum campo novo ou removido no contrato público, nenhuma tela, componente, texto ou CSS. Nenhum `eslint-disable` novo, nenhum teste pulado em silêncio, e a lista de `validate:integration` permanece com 35 passos.
- Inspecionado o patch completo de cada rodada contra a worktree, não contra o relatório do Developer. Nenhum arquivo foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

O grosso já estava certo e foi conferido na árvore: os 106 schemas movidos com conteúdo idêntico, o hook `onSend` devolvendo o payload pela mesma referência, `RESPONSE_CONTRACT_CHECK_ENABLED` negativo em produção com o motivo escrito, os dois checks estáticos com `details` declarando os arquivos lidos, e os cinco controles negativos executados cada um contra o artefato que o critério nomeia. Os quatro blockers:

1. **Instalação limpa a partir do repositório não funcionava.** `packages/public-api-contract/dist/` é ignorado por `.gitignore` e não entrava no commit, e nada no caminho de deploy construía o pacote. Com `install-links=true` o npm **copia** o diretório do pacote no `npm ci` — sem `dist/`, e a cópia fica congelada. Reproduzido pelo reviewer em fixture própria: `npm install` seguido de `import("@avenly-ia/public-api-contract")` falhava com `ERR_MODULE_NOT_FOUND ... /dist/index.js`. O `buildCommand` de `render.yaml` (`npm ci && npm run build`, com `rootDir` em cada app) quebraria nos dois serviços. A prova apresentada pelo Developer tinha rodado sobre uma árvore em que uma unidade anterior já havia construído o pacote.
2. **FINAL_AUDIT §12 negava os achados que o próprio relatório declarava.** A seção afirmava que nenhum achado novo entrava a partir de A-20, enquanto o relatório da mesma rodada registrava A-20 a A-23 com execução. A-20 é verificável estaticamente: o produtor tipa `{ deleted: z.boolean() }` e a entrada da tabela admite só `z.literal(true)`.
3. **Contagem da tabela errada em dois documentos.** FINAL_AUDIT §12 e CURRENT_STATE diziam 119 entradas; 119 é o número de ocorrências do texto `pathPattern:`, que inclui a interface e os comentários. A contagem real é 116.
4. **Escopo dos lockfiles violado.** Os dois locks foram regenerados do zero e trouxeram churn transitivo não pedido — 85 versões alteradas, 18 adicionadas e 5 removidas em `apps/bff`; 103, 7 e 6 em `apps/frontend`, incluindo `@next/*`, `@fastify/cookie`, `@fastify/cors` e até um downgrade de `@emnapi/core`. O Goal autoriza os locks a mudarem **apenas** para declarar a dependência nova.

## Rodada 2 — ACCEPTED

Os quatro blockers foram conferidos na árvore, e o crítico foi verificado por **execução própria do reviewer**, não por relato:

- **Instalação limpa, reproduzida do zero pelo Tech Lead** em fixture isolada, com cópia do pacote sem `dist/` e sem `node_modules`, app sintético com `install-links=true` e dependência `file:`. `npm install` e `npm ci` (npm 11.16.0 / node 24.18.0) saíram exit 0; a cópia em `node_modules/@avenly-ia/public-api-contract/` nasceu **com** `dist/`; o import do pacote resolveu e imprimiu `routes: 116`; a busca por diretórios `zod` achou uma só cópia. O mecanismo é o `prepare` do pacote (`npm ci --ignore-scripts && npm run build`), que o npm executa ao empacotar o diretório — logo o `npm ci && npm run build` de `render.yaml` constrói o pacote sem passo novo de deploy. O outro lado — a cópia congelada depois da instalação — é coberto por `scripts/build-public-api-contract.mjs`, presente em `validate:core` e em `build-all.sh`, antes dos builds dos apps.
- **Achados novos registrados.** FINAL_AUDIT §12 ganhou "Achados novos — A-20 a A-23", com classificação no vocabulário fechado de §6 (quatro `PENDENCIA-POS-MVP`), reprodução, impacto de produto em uma frase e o lado errado identificado, mais a subseção que declara que campo a mais não reprova. A frase falsa saiu. A ocorrência remanescente da mesma negativa em §11 é texto pré-existente do fechamento do Goal034, escopado a "por este diff" — corretamente **não** reescrito.
- **Contagem corrigida para 116** em FINAL_AUDIT §12 e CURRENT_STATE, com o método escrito. Conferido pelo reviewer: o parse da tabela devolve 116 entradas únicas e `publicApiRoutes.length` é 116.
- **Lockfiles restaurados da baseline:** `+10 −6` em cada um, contendo só a entrada nova e a mudança de forma (`link: true` para `resolved: file:`) que `install-links` exige na entrada de `legal-contract`. Nenhuma versão de dependência existente alterada; `package.json` dos dois apps com uma linha a mais cada.

### Verificações próprias além dos blockers

- `diff --strip-trailing-cr` entre `git show f1fb620:apps/frontend/src/data/mappers/publicApiSchemas.ts` e `packages/public-api-contract/src/schemas.ts`: vazio, md5 normalizado idêntico, 106 `export const *Schema` — critério 2 satisfeito. O arquivo antigo virou `export * from "@avenly-ia/public-api-contract";`.
- Cruzamento dos 113 `routeSchema<T>(...)` dos `Bff*Service.ts` contra a tabela: zero divergência de schema. Os tipos de retorno são `z.infer<typeof schema>` do mesmo schema, não tipos escritos à mão — nenhum comportamento de tela muda.
- `node scripts/final-production-audit.mjs` exit 0, com `public_api_route_coverage` e `public_api_response_schema_single_source` ambos `ok: true`, cada um declarando no `details` quantos arquivos leu (65 do BFF, 17 de serviços do frontend, 194 de `apps/frontend/src`).
- `node apps/bff/tests/goal030-a03-contract-drift.repro.mjs` exit 0 na árvore final; a saída `exit 1` na baseline `f1fb6203` foi obtida pelo Developer em worktree destacada temporária, não reexecutada pelo reviewer.
- `gate.test.mjs` afirma o comando e a precedência de `build:public-api-contract` sobre `build:bff` e `build:frontend`; as regressões dos dois checks novos são exercitadas nos dois sentidos com árvore sintética.
- Hook `onSend` inspecionado linha a linha: devolve o payload pela mesma referência, descarta o resultado do `safeParse`, ignora status fora de 2xx e payload não-string, e trata rota sem entrada como caso normal, não como erro.

### Gates da rodada 2

Os nove gates declarados do Goal rodaram nesta mesma árvore e passaram: `typecheck` do BFF e do frontend, `lint` do frontend, `unit-tests` dos dois apps e `gate-tests` exit 0; `validate:core` exit 0 (46937 ms); `validate:integration` exit 0 (193918 ms), com a pré-condição de bancos descartáveis presente; `validate:ui` exit 0 (44094 ms). Nada foi apresentado como verde sem ter rodado.

## Observações não bloqueantes

- **Rota registrada por template literal é invisível aos dois lados da regra de cobertura.** O padrão de extração exige o path entre aspas, e `apps/bff/src/modules/conversations/routes.ts:207` registra `takeover`, `release` e `resolve` em laço, com um template literal. Hoje não há lacuna — as três têm entrada na tabela e chamador no frontend —, mas uma rota futura nesse formato escaparia do check em silêncio. Registrado em [VALIDATION_GATE](../VALIDATION_GATE.md#checks-estáticos-novos-do-goal035).
- **`GET /v1/conversations/:id/messages/:messageId/media` é a única rota sem chamador que mesmo assim tem entrada**, com `z.unknown()` e comentário declarando bytes crus fora do envelope. O hook a ignora porque o payload não é string — a entrada documenta a exceção, não a verifica.

## O que este aceite não cobre

- **A verificação de resposta não roda em produção**, por decisão escrita ([D-051](../DECISIONS.md)): ela liga em `development` e `test`. Nada neste diff prova o comportamento do contrato em produção.
- **A-20 a A-23 ficam abertos.** São quatro divergências reais entre o que o BFF devolve e o que a tela declarava, todas `PENDENCIA-POS-MVP`, nenhuma com reprodução executável permanente na árvore — os dublês e a instrumentação que as observaram eram temporários e foram revertidos. Qual lado muda é decisão de Goal próprio.
- **O check de fonte única compara nome, não estrutura:** um schema de nome diferente e forma equivalente, declarado fora do pacote, passa.
- **M4 — envio real a número real — continua aberto** como gate operacional. Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para WhatsApp real.
- **Fidelidade visual à referência aprovada** continua sendo conferência humana, como no [review033](033-review.md) e no [review034](034-review.md).
- **Os demais achados abertos.** A-04 a A-08, A-11 a A-17 e A-19 não foram corrigidos, reclassificados nem tocados.
