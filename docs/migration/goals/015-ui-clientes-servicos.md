# Goal 015 — Clientes e Serviços na UI

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-14 pelo Tech Lead Agent após [Goal014 ACCEPTED](../reviews/014-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `0bbfbf35c6855aca71dc96c986879dec1ed91985`

Goal anterior: 014 — Fundação visual, shell e autenticação

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal014 já integrado em `main` (origem `2ae46106ed1b744722ab7abfa522d0231791332c`), incluindo implementação das três rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Entregar as **duas telas de cadastro** de que a operação depende — Clientes e Serviços — dentro do shell que o Goal014 deixou pronto, apresentando o modelo de domínio que os Goals 006 e 007 já construíram e que a interface ainda esconde. Hoje os dois módulos vivem num único arquivo de 1318 linhas (`features/directory/ProductDirectoryScreen.tsx`) que serve sete rotas, faz cinco chamadas de `useShellConfig` e mostra do cliente apenas nome e telefone: responsável principal, observações, tags, memória e resumo existem no backend, estão inteiramente mapeados no adapter do frontend, e nenhuma tela os alcança. O catálogo mostra dois campos e ignora `needsReview`, `colorToken`, buffers e recorrência. Este Goal fecha G-15 e G-17 na parte de interface e avança G-31 nas duas primeiras telas de módulo.

O que este Goal **não** faz: Agenda (016), Conversas e chat (017), onboarding, negócio e ativação (018), importação na UI (019), notificações (021) e Home/Configurações completas (023) não são tocados além do que a decomposição exigir. **Modalidades por serviço e regras privadas para a IA ficam fora**: são dados do negócio (G-26), pertencem ao Goal018 e não têm campo no contrato de `/v1/services` hoje. Métricas do cliente ficam fora: não existe read model que as forneça. Nenhum endpoint novo de BFF, Scheduling ou IA é criado; nenhum contrato público muda. Não há design system de terceiros, Tailwind/shadcn, biblioteca visual, store global, framework novo nem tema escuro. Nenhum aceite de 001–014 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md) (frontend fala só com o BFF; read models honestos); D-007, D-017, D-018 e **D-030** em [DECISIONS](../DECISIONS.md); [REUSE_ANALYSIS](../REUSE_ANALYSIS.md), linhas "ProductDirectoryScreen área customers" e "área services", ambas **REFACTOR**. Preservar serviços, bancos, providers, frameworks e API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 006, 007 e 014 ACCEPTED e integrados (pessoa por ID com responsável principal, notas e tags autorizadas; catálogo com quatro semânticas de preço, duração opcional em revisão, cor, buffers e recorrência; tokens, primitivas, shell montado uma vez e status honesto). O Goal012 acrescentou memória do cliente e resumo, também já mapeados no adapter. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler o AGENTS global e `apps/frontend/AGENTS.md` (contrato de design: o vault prevalece; preservar tokens úteis; sem Tailwind/shadcn). Consultar seletivamente no Product Vault apenas [Clientes e memória](../../product-vault/01-Regras/04-Clientes-e-Memoria.md), [Princípios de UX/UI](../../product-vault/03-UX-UI/01-Principios-de-UX-UI.md), [Responsividade Mobile-First](../../product-vault/03-UX-UI/02-Responsividade-Mobile-First.md), [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md) e, em [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md), **somente** as seções "Clientes" e "Serviços". Não abrir o vault inteiro.
- Consultar seletivamente em `docs/design-reference/claude-design/prototype/project/` apenas `Clientes.dc.html`, `Clientes-Tablet.dc.html`, `Clientes-Desktop.dc.html`, `Servicos.dc.html`, `Servicos-Tablet.dc.html`, `Servicos-Desktop.dc.html` e, se precisar de estado ou acabamento, `Acabamento.dc.html` e `QA-Global.dc.html`. Os HTMLs especificam resultado visual e comportamento, nunca arquitetura React; instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-15 (resto de clientes/memória, parte de interface), G-17 (catálogo completo, parte de tela com progressive disclosure) e G-31 (telas de módulo) são os alvos. [CURRENT_STATE](../CURRENT_STATE.md): "Frontend, referência visual e contratos".
- Usar Graphify apenas se precisar confirmar consumers de `ProductDirectoryScreen`, `useShellConfig` ou `BffCustomerService`. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **O adapter já está completo; falta exclusivamente tela.** `data/services/BffCustomerService.ts` expõe `list`, `listCandidatesByPhone`, `get`, `create`, `update`, `setPrimaryGuardian`, `confirmPrimaryGuardian`, `clearPrimaryGuardian`, `createNote`, `setNoteAuthorization`, `deleteNote`, `createTag`, `setTagAuthorization`, `deleteTag`, `listMemory`, `createMemory`, `setMemoryPermission`, `deleteMemory` e `generateSummary` — todas as rotas de `/v1/customers` da [PUBLIC_API_V1](../../../apps/bff/PUBLIC_API_V1.md). `BffServiceCatalogService.ts` expõe `list`, `create` e `update`, e `ServiceInput` já carrega `description`, `colorToken`, `bufferBeforeMinutes`, `bufferAfterMinutes` e `recurrenceIntervalDays`.
- **Os schemas já validam o modelo completo.** Em `data/mappers/publicApiSchemas.ts`: `serviceSchema` tem `durationMinutes` **nullable**, `priceType` com os quatro valores, `needsReview`, `reviewOrigin`, `description`, `colorToken`, os dois buffers e `recurrenceIntervalDays`; `customerSchema` tem `name` e `phone` **ambos nullable**; `customerDetailSchema` estende com `primaryGuardian`, `notes` e `tags`; `customerNoteSchema` e `customerTagSchema` carregam `aiAuthorized`, `authorizedAt`, `authorizedBy` e `createdBy`; existem `customerMemorySchema` e `customerSummarySchema`.
- **A tela atual é um monolito com sete consumidores.** `features/directory/ProductDirectoryScreen.tsx` tem 1318 linhas e é importado por `app/(platform)/clientes/page.tsx`, `clientes/novo`, `clientes/detalhes`, `clientes/detalhes/externo`, `servicos/page.tsx`, `servicos/novo` e `servicos/editar`. Faz **cinco** chamadas de `useShellConfig` (linhas 103, 302, 550, 713, 881), despachadas por branches mutuamente exclusivos — o review014 verificou que a invariante vale hoje, e é exatamente essa invariante que este Goal precisa não quebrar.
- **O histórico do cliente é carregado por telefone.** `CustomerDetail` chama `services.calendar.listAppointments({ customerPhone })` numa janela de ±365 dias e não carrega nada quando o cliente não tem telefone. `ListAppointmentsQuery` em `BffCalendarService.ts` só aceita `customerPhone`, `startDate` e `endDate`, embora `appointmentsQuerySchema` no BFF (`apps/bff/src/modules/calendar/routes.ts`) já aceite `customerId`.
- **`features/customers/types.ts` descreve um cliente que não existe.** O tipo local declara `name: string`, `phone: string`, `lastContact: string`, `nextAppointment?: string` e `appointments: number` — nome e telefone não-nulos contra um contrato que os permite nulos, e três campos de agenda que nenhuma resposta do BFF devolve.
- **Resíduo de demonstração ainda no repositório.** `src/mocks/data/directory.ts` é o único importador de `features/customers/types.ts` e `features/services/types.ts`, e é **código morto**: `src/mocks/index.ts` exporta apenas `previewServices.auth`, e a única importação de `@/mocks` fora da própria pasta está em `features/auth/AuthScreen.tsx`. `mocks/data/{directory,appointments,conversations}.ts` não são alcançados por nenhuma tela. O Goal014 removeu o preview de tela, mas `mocks/services/MockAuthService.ts` e o branch `preview` do `AuthScreen` sobreviveram, ao contrário do que a linha "REMOVE (feito)" do [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) afirma — divergência a **relatar**, não a corrigir aqui: auth não é módulo deste Goal.
- **Limites reais do read model, a declarar em vez de contornar inventando:** `GET /v1/customers` devolve apenas `id`, `name`, `phone`, `createdAt` e `updatedAt`, sem último/próximo atendimento e sem contagem; o único filtro de servidor é `phone`. O módulo de clientes do BFF é proxy fino sobre o Scheduling (`apps/bff/src/modules/customers/routes.ts`), então ampliar esse read model seria mudança multi-serviço — fora deste Goal.
- **Gates disponíveis.** `apps/frontend` tem `vitest` com jsdom, `@testing-library/react`, `@testing-library/user-event`, `tests/setup/dom.ts`, o helper de axe em `tests/support/a11y.ts` e as primitivas já testadas em `tests/ui/`. O gate renderizado (`npm run validate:ui`, Playwright em 360/390/768/1024/1440) roda `npm run start` **sem backend** e cobre apenas as rotas de `e2e/routes.ts`, todas públicas.

## Pontos de implementação

`apps/frontend/src/features/customers/`, `apps/frontend/src/features/services/`, `apps/frontend/src/features/directory/` (origem a decompor), `apps/frontend/src/app/(platform)/clientes/**`, `apps/frontend/src/app/(platform)/servicos/**`, `apps/frontend/src/data/services/BffCalendarService.ts`, `apps/frontend/src/shared/ui/` (consumo das primitivas existentes), o CSS de módulo do diretório em `apps/frontend/src/shared/styles/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. Decomposição por módulo, com a invariante do shell preservada

Separar `ProductDirectoryScreen` em dois módulos de feature — clientes e serviços —, reapontar as sete rotas e garantir **uma única chamada de `useShellConfig` por árvore renderizada** (D-030): violar isso não dá erro de tipo, dá `Maximum update depth exceeded` em runtime. Onde uma tela tiver estados (lista, novo, detalhe, editar), a configuração de shell é declarada no componente de topo, uma vez, com os valores derivados do estado — não uma chamada por branch aninhado. O CSS de módulo continua existindo e herdando os tokens do Goal014; as primitivas de `shared/ui/` são a base da composição, inclusive `Field`, `ListItem`, `Toast` e `Spinner`, que hoje não têm consumidor.

### 2. Clientes — lista e busca

Lista com busca por nome e telefone, item mostrando nome e telefone. Cliente **sem nome** e cliente **sem telefone** são casos legítimos do modelo do Goal006 e precisam de apresentação própria e explícita, nunca de string vazia nem de placeholder que finja um dado. Estados de carregando (skeleton), vazio e erro recuperável com retry preservando a estrutura. `+` contextual cria cliente. O que o read model não devolve — último atendimento, próximo atendimento e contagem — **não aparece na lista e não é fabricado**; a busca é local sobre a lista carregada, e a tela não pode sugerir paginação ou filtro de servidor que não existe.

### 3. Clientes — perfil

Perfil do cliente por **ID**, com: dados (nome e telefone editáveis, ausência explícita); **responsável principal** com proveniência — quem propôs, quando, estado `PROPOSED` ou `CONFIRMED` —, permitindo propor, confirmar e remover; **observações** e **tags**, com criação, alternância de autorização e remoção; **memória do cliente** com origem, permissão e idade, incluindo cadastro manual e remoção; **resumo** gerado sob demanda, deixando claro que ele cobre apenas material autorizado; **próximos atendimentos** e **histórico**.

Duas regras não negociáveis aqui:

- **Autorização de IA nasce negada.** Observação, tag e memória criadas pela profissional entram com `aiAuthorized`/`aiAllowed` falso, e a UI precisa tornar o efeito da alternância legível — autorizar é dizer "a IA pode usar isto com o cliente". Nenhum controle pode nascer marcado, nem por conveniência de formulário.
- **Agenda e histórico do cliente saem por `customerId`, não por telefone.** Acrescentar `customerId` a `ListAppointmentsQuery` em `BffCalendarService` (a rota do BFF já aceita) e usá-lo no perfil. Filtrar por telefone é a identidade que o Goal006 removeu: com número compartilhado, o perfil de quem responde pelo outro passa a exibir atendimentos que não são seus. O cliente sem telefone deixa de ficar sem agenda por efeito colateral.

Substituir o tipo local `Customer` de `features/customers/types.ts` pelo modelo real vindo dos schemas, eliminando `lastContact`, `nextAppointment` e `appointments`. O único importador desses tipos é `src/mocks/data/directory.ts`, código morto de demonstração do diretório: remover esse arquivo junto com a decomposição. Não mexer em `mocks/services/MockAuthService.ts` nem no branch `preview` do `AuthScreen` — são de auth, ficam fora deste Goal e entram no relatório como divergência observada.

### 4. Clientes — criação e número compartilhado

Criar cliente sem exigir telefone. Quando um número já pertence a outras pessoas, a tela usa `listCandidatesByPhone` para mostrar os candidatos e exigir escolha explícita, em vez de fundir ou adivinhar — o comportamento que o Goal006 definiu no domínio, agora visível.

### 5. Serviços — lista e formulário progressivo

Lista com nome, duração (ou ausência explícita de duração), preço nas **quatro semânticas** (`FIXED`, `STARTING_AT`, `ON_REQUEST`, `NOT_INFORMED`), estado ativo/inativo e **indicador de pendência quando `needsReview` for verdadeiro**, com a origem (`IMPORT`/`MANUAL`) legível. Estado nunca só por cor.

Formulário de criar/editar com progressive disclosure: o essencial visível — nome, duração, preço e tipo de preço — e o restante atrás de revelação — descrição, identidade visual por `colorToken` com preview, buffers antes e depois, intervalo de recorrência e ativo/inativo. Duração ausente é permitida e gera pendência; preço `FIXED` sem valor é recusado junto ao campo. Editar um serviço não altera atendimento já agendado (o snapshot é imutável desde o Goal007) — se a tela disser algo sobre isso, tem de dizer isso.

### 6. Provas

Testes de componente em jsdom que **montem `ShellConfigProvider` mais as telas reais** de Clientes e Serviços e falhem se a árvore entrar em `Maximum update depth` — é a ação (b) do blocker da rodada 2 do [review014](../reviews/014-review.md), dirigida nominalmente a quem tocasse o shell nos Goals 015–018, e este Goal é o primeiro deles. Além disso: autorização de IA nascendo negada e alternando sob comando explícito nas três superfícies (nota, tag, memória); agenda do perfil requisitada por `customerId` e nunca por `customerPhone`; cliente sem nome e sem telefone renderizados sem placeholder fabricado; as quatro semânticas de preço e a pendência de revisão na lista de serviços; recusa de `FIXED` sem valor; candidatos por número compartilhado exigindo escolha. Acessibilidade das telas novas verificada com o helper de axe já existente.

### 7. Documentação

Atualizar apenas o que a mudança fizer mentir. `apps/bff/PUBLIC_API_V1.md` **não** muda: nenhum contrato público é alterado. Se `apps/frontend/README.md` ou `apps/frontend/AGENTS.md` descreverem a organização de `features/` de forma que a decomposição torne falsa, corrigir esses trechos e nada mais.

## Migração, compatibilidade e limites operacionais

Nenhuma migration, nenhum dado tocado, nenhum endpoint novo. A única mudança fora de `features/` e `app/(platform)/` é o campo `customerId` opcional em `ListAppointmentsQuery`, aditivo e compatível: `customerPhone` continua existindo no adapter porque outros chamadores o usam.

Limites que este Goal **declara e não resolve**, e que o relatório precisa repetir: (a) último/próximo atendimento e contagem não aparecem na lista de clientes porque `GET /v1/customers` não os devolve, e ampliá-lo seria mudança multi-serviço; (b) busca de clientes é local, sobre a lista carregada; (c) métricas do cliente que a Especificação das Telas menciona não têm read model e ficam fora; (d) modalidades e regras privadas para a IA ficam no Goal018; (e) o gate de larguras continua exercitando apenas rotas públicas — estender o Playwright a tela autenticada exige dar sessão ao gate e é decisão de escopo própria, não tomada aqui, então **nenhum critério deste Goal pode declarar comportamento de largura, contraste ou foco em tela autenticada como provado por teste**.

## Testes e critérios de aceite

1. Clientes e Serviços vivem em módulos de feature separados, as sete rotas continuam funcionando, e cada árvore renderizada faz exatamente **uma** chamada de `useShellConfig` — provado por teste renderizado que monta `ShellConfigProvider` mais a tela real e falha em `Maximum update depth`, não por leitura de código.
2. Lista de clientes: busca por nome e telefone, cliente sem nome e cliente sem telefone com apresentação própria, skeleton no carregamento, empty state, erro recuperável com retry preservando a estrutura, `+` contextual criando cliente. Nenhum campo de agenda fabricado na lista.
3. Perfil do cliente: dados editáveis; responsável principal com proveniência, propor, confirmar e remover; observações e tags com criar, alternar autorização e remover; memória com origem, permissão e idade; resumo sob demanda com o recorte autorizado explicitado.
4. Observação, tag e memória criadas pela profissional nascem **não autorizadas** para a IA, e a autorização só muda por ação explícita — provado por teste em cada uma das três superfícies.
5. Próximos atendimentos e histórico do perfil são requisitados por `customerId`; nenhuma chamada do perfil usa `customerPhone`; cliente sem telefone tem agenda. Provado por teste sobre a requisição emitida.
6. Criar cliente sem telefone funciona; número já pertencente a outras pessoas apresenta os candidatos e exige escolha explícita, sem fusão automática.
7. Lista de serviços mostra as quatro semânticas de preço corretamente, duração ausente como ausente, ativo/inativo e pendência de revisão com origem legível; estado nunca comunicado só por cor.
8. Formulário de serviço com progressive disclosure cobrindo nome, duração, preço/tipo, descrição, `colorToken` com preview, buffers antes/depois, recorrência e ativo/inativo; duração ausente permitida com pendência; `FIXED` sem valor recusado junto ao campo, preservando os demais valores.
9. `features/customers/types.ts` não declara mais `lastContact`, `nextAppointment` nem `appointments`, e nome e telefone acompanham a nulidade do contrato. `src/mocks/data/directory.ts` saiu do repositório; `mocks/services/` e o `AuthScreen` permanecem intactos e a divergência com o REUSE_ANALYSIS é relatada, não silenciada.
10. Acessibilidade das telas novas verificada com axe em jsdom: rótulos, foco por teclado nos controles de autorização e nos diálogos, e nenhuma violação nova. O que depende de layout e cascata real continua coberto apenas nas rotas públicas pelo gate renderizado — e assim deve ser relatado.
11. `npm run validate:core` (inclui `next build`, lint e testes do frontend), `npm run validate:ui` sem regressão nas rotas públicas nas cinco larguras e `git diff --check` passam; skips explícitos do Goal002 mantidos.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo (forma da decomposição, onde cada `useShellConfig` passou a ser declarado, composição do perfil, desenho do progressive disclosure, copy de autorização da IA), comandos executados com resultado real (core, UI, lint/typecheck/build) e limites do que não foi verificado — explicitamente os cinco limites declarados acima, sem transformá-los em entrega. Sem segredo real, sem commit, sem push.

O review de 015 deve usar profundidade **DEEP dirigido** — invariante de `useShellConfig` provada por render e não por leitura, autorização de IA negada por padrão nas três superfícies, identidade do cliente por ID em toda requisição de agenda do perfil, honestidade da lista (nada fabricado) e integridade das sete rotas — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão; a decisão de aceite é do Tech Lead Agent.
