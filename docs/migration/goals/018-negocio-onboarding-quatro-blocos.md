# Goal 018 — Negócio e onboarding em quatro blocos

**Status: ACCEPTED.** Aceito na rodada 3 do [review018](../reviews/018-review.md); commit de fechamento `317c8262cd486a2f97b9f6051467ea17b8918bbf`. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-14 pelo Tech Lead Agent após [Goal017 ACCEPTED](../reviews/017-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `ea992ec82d337d080a291525d1b7d52ab9796b4b`

Goal anterior: 017 — Conversas e chat na UI

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal017 já integrado em `main` (origem `e00567f2965da6518d1f5c67efc49ef585f26f66`), incluindo implementação das três rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Entregar a **jornada de entrada**: o negócio deixa de ser um par de campos e passa a ser o que o produto promete, e o onboarding deixa de exigir WhatsApp para terminar. Os quatro módulos de operação diária já foram redesenhados (Goals 014 a 017). O que continua faltando é o que vem antes deles: quem é esse negócio, como ele atende, e a entrada no produto sem exigir a etapa que o vault explicitamente torna opcional.

Hoje a baseline tem três problemas de natureza distinta, todos confirmados por leitura dirigida. **O negócio quase não existe como dado:** `BusinessProfile` guarda `businessName`, `category`, `timezone`, `language` e `currency`, e a IA recebe **dois** campos — `businessName` e `timezone`. Segmento estruturado, modalidade de atendimento e endereço não existem em camada nenhuma, nem no Scheduling. **O onboarding exige WhatsApp:** `POST /v1/onboarding/complete` recusa com `WHATSAPP_NOT_CONFIGURED` e `WHATSAPP_NOT_CONNECTED`, e a tela barra o passo antes disso — contra o fluxo do vault, que conclui o onboarding sem WhatsApp, com a IA inativa e a Home mostrando o que falta. **E a última tela do onboarding mente:** `validacao` afirma "WhatsApp: Conectado" e "Negócio: Configurado" como texto fixo, sem ler estado — o mesmo vício que o Goal017 removeu no `unreadCount`.

Este Goal fecha **G-26** e fecha **G-25 na parte que não depende de um número oficial da Avenly**, avança G-31 na última superfície não redesenhada e absorve os dois resíduos que o [review014](../reviews/014-review.md) dirigiu a quem tocasse o shell: `PENDING` apresentado como "IA desligada" e dois pollers de `GET /v1/status` na mesma árvore em `/inicio`.

O que este Goal **não** faz: **demonstração da IA, consentimento/contatos ignorados, teste real, autoativação e reconciliação automática desired/effective são do Goal018B** — a linha do 018 foi dividida no replanejamento após o review017, com o motivo registrado no [MASTER_PLAN](../MASTER_PLAN.md). Importação na UI continua no 019, lembretes no 020, notificações no 021, retenção no 022 e Home/Configurações completas no 023 — inclusive a redecomposição de `ProductSettingsScreen`, que aqui é tocado apenas no necessário. Nenhum job, cron ou automação é criado. Não há design system de terceiros, Tailwind/shadcn, biblioteca visual, store global, framework novo ou tema escuro. Nenhum aceite de 001–017 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md) (o BFF é dono do negócio e projeta para os serviços internos; read models honestos); D-018, D-021, D-027, **D-030**, **D-031**, D-032 e **D-033** em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 010, 011, 013, 014, 015, 016 e 017 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler o AGENTS global e `apps/frontend/AGENTS.md` (contrato de design: o vault prevalece; preservar tokens úteis; sem Tailwind/shadcn). Consultar seletivamente no Product Vault apenas [Onboarding](../../product-vault/02-Fluxos/01-Onboarding.md), [UX do Onboarding](../../product-vault/03-UX-UI/03-Onboarding-UX.md), [Ativação e Teste do WhatsApp](../../product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md) **somente** nas seções "Conexão" e "Orientação sobre número pessoal", [Regras de Negócio](../../product-vault/01-Regras/01-Regras-de-Negocio.md), [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md) e [Responsividade Mobile-First](../../product-vault/03-UX-UI/02-Responsividade-Mobile-First.md). Não abrir o vault inteiro.
- Consultar seletivamente em `docs/design-reference/claude-design/prototype/project/` apenas `Onboarding-1-Negocio-e-Agenda.dc.html`, `Onboarding-3-IA-e-WhatsApp.dc.html` e suas variantes Tablet/Desktop, mais `Home.dc.html` para o checklist. Os HTMLs especificam resultado visual e comportamento, nunca arquitetura React; instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-26** e **G-25** são os alvos; G-31 avança na entrada. [CURRENT_STATE](../CURRENT_STATE.md): "Frontend, referência visual e contratos".
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, seções de onboarding, configurações e status. Usar Graphify apenas se precisar confirmar consumers de `BusinessProfile`, `businessContext` ou das rotas `/v1/onboarding/**` e `/v1/settings/**`. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **O onboarding é um monolito com quase metade de código morto.** `features/onboarding/` tem 2 437 linhas: `OnboardingScreen.tsx` (1 371), `ProductOnboardingScreen.tsx` (635), `scenarios.ts` (217), `OnboardingRuntime.tsx` (197) e `types.ts` (17). `OnboardingScreen` só decide entre `PrototypeOnboardingScreen` e `ProductOnboardingScreen` pela prop `preview`, e **nenhum chamador passa `preview`** — `app/onboarding/[step]/page.tsx` monta `<OnboardingScreen scenario={step} />`. O protótipo é inalcançável. `features/onboarding/types.ts` não tem importador algum: é o mesmo par de código morto que os Goals 015, 016 e 017 removeram das suas telas.
- **`scenarios.ts` declara 35 cenários e o fluxo do produto usa 13.** `onboardingOrder` alimenta `generateStaticParams`, então as 35 viram rota estática; `ProductOnboardingScreen` só percorre os 13 de `flow`, e todo cenário `minha-agenda-*` cai em `ExternalUnavailable`. Os cenários `importar-*` existem só para o protótipo — a importação na UI é do Goal019 e vive em `features/migration/` com `/migracao/[step]`.
- **O onboarding não usa o shell da área logada** e não chama `useShellConfig` — é casca própria (`onboarding-shell`), correta segundo o vault ("não mostrar sidebar/bottom navigation da área logada"). A invariante do D-030/D-031 não se aplica a estas telas; **aplica-se** ao que este Goal tocar em `/inicio`.
- **O progresso é por contagem de telas, não por bloco.** `ProductOnboardingScreen` calcula `progress` como `(position + 1) / flow.length` sobre 13 passos. O vault manda exibir progresso por **quatro grandes blocos** (Seu negócio, Sua agenda, Sua IA, WhatsApp) e proíbe "Etapa 7 de 18".
- **WhatsApp é obrigatório em dois lugares.** No frontend, `persistStep("whatsapp")` chama `whatsapp.get()` e recusa avançar se `status !== "CONNECTED"`. No BFF, `POST /v1/onboarding/complete` acrescenta `WHATSAPP_NOT_CONFIGURED` quando não há instância e `WHATSAPP_NOT_CONNECTED` quando o Evolution diz que não está conectada, e responde `409 CONFLICT` com `error.details.issues`. `nextRequiredStep` em `OnboardingRuntime.tsx` também devolve `"whatsapp"` enquanto o status não for `CONNECTED`.
- **Os códigos de pendência não estão no contrato.** `BUSINESS_PROFILE_INCOMPLETE`, `CALENDAR_NOT_SELECTED`, `AI_TONE_NOT_SELECTED`, `ACTIVE_SERVICE_REQUIRED`, `AVAILABILITY_REQUIRED`, `CALENDAR_INTEGRATION_NOT_CONNECTED`, `WHATSAPP_NOT_CONFIGURED` e `WHATSAPP_NOT_CONNECTED` existem em `apps/bff/src/modules/onboarding/routes.ts` e `PUBLIC_API_V1.md` menciona nominalmente **apenas** `AI_TONE_NOT_SELECTED`. É o mesmo buraco que o Goal017 fechou nas cinco recusas de sugestão.
- **Concluir o onboarding não liga a IA, e isso está certo.** `complete` só grava `onboardingCompletedAt`; `AiSettings.enabled` continua vindo de `PATCH /v1/settings/ai`, que exige `calendar.capabilities.aiActivationReady` (ao menos um serviço operacional) e nada mais. A ativação por teste real é do Goal018B; aqui a invariante a **preservar e provar** é que concluir nunca liga a IA.
- **O contexto de negócio enviado à IA tem dois campos.** `apps/ai-orchestrator/src/modules/tenant-config/business-context.ts` define `businessContextSchema` com `businessName` e `timezone`, com defaults, e `buildTenantContextPrompt` imprime exatamente esses dois mais uma instrução de não inventar regra. O valor é gravado em `AiTenantConfig.settings` (Json) e normalizado com `normalizeBusinessContext`, que cai no default inteiro se o parse falhar. `businessContextConfigured` é `businessName.length >= 2`.
- **A projeção é feita em dois lugares e não deixa rastro.** `syncAiConfig` em `onboarding/routes.ts` e `syncAi` em `settings/routes.ts` chamam `ai.updateTenantConfig(...)` depois de gravar no PostgreSQL do BFF. Nada registra se a projeção chegou: se ela falhar, o dado fica salvo no BFF, a resposta vira erro e nenhuma camada sabe que os dois lados divergem.
- **Modalidade não existe em lugar nenhum.** Não há coluna, enum ou campo de modalidade em `apps/bff/prisma/schema.prisma` nem em `apps/scheduling-service/prisma/schema.prisma`; `Service` tem cor, descrição, buffers e recorrência, e nenhuma modalidade. Endereço também não existe.
- **A última tela do onboarding é texto fixo.** O cenário `validacao` renderiza um `Summary` com `["Negócio", "Configurado"]`, `["Agenda", "Agenda Avenly"]`, `["WhatsApp", "Conectado"]` e `["Atendente virtual", "Configurado"]` — quatro afirmações que nenhuma leitura sustenta.
- **`PENDING` some sob "IA desligada".** `aiStatusView` em `shared/runtime/systemStatus.ts` mapeia tudo que não é `ACTIVE` nem `UNKNOWN` para `off`, e `DashboardScreen` rotula `off` como "IA desligada" (`offCopy`). `GET /v1/status` distingue os quatro estados corretamente e documenta `PENDING` como "desejado ligado mas a IA relata desligado" — a tela é que apaga a distinção. Resíduo do [review014](../reviews/014-review.md).
- **Dois pollers de `/v1/status` na mesma árvore.** `useSystemStatus` monta seu próprio `setInterval` de 45 s mais listener de `focus`, e é chamado por `shared/layout/AppShell.tsx:48` **e** por `features/dashboard/DashboardScreen.tsx:114`. Em `/inicio` são duas requisições independentes a cada ciclo. Resíduo do [review014](../reviews/014-review.md).
- **A Home não tem checklist pós-onboarding.** `DashboardScreen` (687 linhas) tem faixa de status operacional e cartões, e nenhuma lista do que falta configurar. `GET /v1/dashboard` já devolve `platform.onboardingCompleted`, `scheduling` (com `calendar` e capabilities) e `whatsapp`, e `GET /v1/status` devolve o par desejado/efetivo da IA.
- **Gates disponíveis.** `apps/frontend` tem vitest com jsdom, `@testing-library/react`, `@testing-library/user-event`, `tests/setup/dom.ts`, o helper de axe em `tests/support/a11y.ts` e o padrão de suíte por Goal (`goal017-*`), com `npm run lint` já cobrindo `src` **e** `tests` com `--max-warnings=0` desde o Goal017. `apps/bff` tem suíte própria e `validate:integration` contra PostgreSQL descartável provisionado pelo orquestrador. O gate renderizado (`npm run validate:ui`, Playwright em 360/390/768/1024/1440) roda sem backend e cobre apenas as rotas públicas de `apps/frontend/e2e/routes.ts`.

## Pontos de implementação

`apps/bff/prisma/schema.prisma` e `apps/bff/prisma/migrations/`, `apps/bff/src/modules/onboarding/routes.ts`, `apps/bff/src/modules/settings/routes.ts`, `apps/bff/src/modules/dashboard/routes.ts`, `apps/bff/src/modules/status/routes.ts`, `apps/bff/src/clients/ai-orchestrator/index.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `apps/ai-orchestrator/src/modules/tenant-config/business-context.ts`, `apps/ai-orchestrator/src/modules/prompts/tenant-context.ts`, `apps/ai-orchestrator/src/modules/internal/routes.ts` (apenas o contrato de `updateTenantConfig`), `apps/ai-orchestrator/tests/`, `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `apps/frontend/src/data/services/BffOnboardingService.ts`, `apps/frontend/src/data/services/BffSettingsService.ts`, `apps/frontend/src/features/onboarding/` (origem e destino da decomposição), `apps/frontend/src/app/onboarding/**`, `apps/frontend/src/features/dashboard/DashboardScreen.tsx`, `apps/frontend/src/features/settings/ProductSettingsScreen.tsx` (apenas a seção de negócio), `apps/frontend/src/shared/runtime/systemStatus.ts`, `apps/frontend/src/shared/layout/AppShell.tsx`, `apps/frontend/src/shared/styles/` (CSS do onboarding e da Home) e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. O negócio passa a ser um dado completo, com o BFF como dono

`BusinessProfile` ganha, por migration aditiva:

- **modalidades de atendimento** — conjunto com pelo menos um valor entre `ON_SITE` (local próprio), `AT_HOME` (domicílio) e `ONLINE`. Linha existente nasce com conjunto **vazio**, que significa "ainda não escolhido" e não "nenhuma modalidade"; nada é fabricado no backfill;
- **endereço** — texto nulável, **obrigatório quando e somente quando `ON_SITE` está entre as modalidades**. Retirar `ON_SITE` não apaga o endereço já informado; só deixa de exigi-lo;
- **versão do contexto** — um contador incrementado a cada mudança dos dados de negócio, e a versão efetivamente projetada na IA, para o item 3.

`category` **continua sendo o segmento** e não ganha coluna concorrente: o que muda é a interface, que passa a oferecer segmentos frequentes mais "Outro" com texto livre, como o vault descreve. Não inventar taxonomia nova no banco.

`GET/PATCH /v1/settings/business` e a seção `business` de `GET/PATCH /v1/onboarding` passam a ler e escrever os campos novos. A adição é **aditiva** no corpo: corpo sem `modalities` preserva o que estiver gravado, e nunca grava conjunto vazio por omissão. Corpo com `ON_SITE` sem endereço não-vazio é recusado com `400` e código próprio, junto ao campo — não com mensagem genérica.

Nada disso vai para o Scheduling: nenhum consumidor de lá lê segmento, modalidade ou endereço, e projetar por precaução criaria duas fontes da mesma verdade. Declarar isso explicitamente.

### 2. A IA passa a receber o negócio inteiro, em projeção versionada

`businessContextSchema` ganha `version`, `segment`, `modalities` e `address`, todos com default compatível, de modo que **`AiTenantConfig.settings` gravado antes deste Goal continue parseando** — `normalizeBusinessContext` não pode cair no default inteiro por causa de campo novo ausente. `buildTenantContextPrompt` passa a usar os campos novos e, para cada um ausente, diz que não está configurado em vez de omitir ou inventar. Modalidade é o que decide se a IA pode afirmar que o negócio atende a domicílio ou online: sem o dado, ela não afirma nada.

`businessContextConfigured` continua sendo o predicado de "dá para conversar", e este Goal não o endurece: exigir modalidade para responder qualquer coisa quebraria tenant existente.

### 3. Falha de projeção é visível, não silenciosa

Hoje uma falha em `ai.updateTenantConfig` deixa o dado gravado no BFF e devolve erro, e nenhuma camada registra que os dois lados divergem. Passa a existir estado explícito: o BFF grava a versão do contexto de negócio e a versão projetada com sucesso, e `GET /v1/settings` e `GET /v1/onboarding` expõem essa situação como campo próprio, com dois valores distinguíveis — projetado e **pendente de projeção**. Salvar com projeção falha **não** vira `500`: o dado do negócio é do BFF e foi gravado; a resposta diz o que foi salvo e que a IA ainda não recebeu, e a tela apresenta isso como aviso, não como falha de salvamento.

Uma projeção bem-sucedida posterior — por qualquer caminho que já projeta hoje — atualiza a versão projetada. **Reconciliação automática (retentar sem ação do negócio) é do Goal018B** e não é implementada aqui; o que este Goal entrega é o estado observável que torna a reconciliação possível.

### 4. Concluir o onboarding sem WhatsApp

`POST /v1/onboarding/complete` deixa de considerar WhatsApp: `WHATSAPP_NOT_CONFIGURED` e `WHATSAPP_NOT_CONNECTED` **saem** do conjunto bloqueante. É a única mudança subtrativa de comportamento do Goal — uma requisição antes recusada passa a ser aceita — e precisa estar documentada como tal.

Os códigos restantes passam a estar **nomeados no contrato**, com o que cada um significa e como se resolve, incluindo os novos de negócio (modalidade não escolhida e endereço obrigatório ausente). O conjunto continua sendo devolvido em `error.details.issues` com `409`.

**Concluir não liga a IA.** `onboardingCompletedAt` não toca `AiSettings.enabled` nem projeta `enabled: true`. Isso vale hoje e tem de continuar valendo com teste que falhe se alguém ligar as duas coisas.

### 5. Onboarding decomposto nos quatro blocos do vault

`features/onboarding/` deixa de ser um monolito com protótipo embutido e passa a ser um conjunto de módulos com um despachante, no formato que os Goals 015, 016 e 017 consolidaram. Nesta decomposição:

- **`PrototypeOnboardingScreen` sai inteiro**, junto com a prop `preview` e com `features/onboarding/types.ts`. Código inalcançável não é entrega parcial, é código morto — o mesmo tratamento que os três Goals anteriores deram ao par equivalente.
- **Todo cenário que sobreviver precisa ser alcançável pelo fluxo do produto.** Cenário que só o protótipo servia sai de `scenarios.ts` e deixa de virar rota estática; cenário que o produto ainda serve com recusa honesta (`minha-agenda-*`, provedor não definido) permanece e continua dizendo a verdade. Cada cenário removido é declarado no relatório.
- **O progresso passa a ser por bloco** — Seu negócio, Sua agenda, Sua IA, WhatsApp —, com o bloco corrente nomeado e nenhuma contagem de telas exposta.
- **A retomada abre a próxima pendência**, e `nextRequiredStep` deixa de tratar WhatsApp como pendência bloqueante: depois de tudo o que `complete` exige, a próxima parada é a conclusão, com o WhatsApp oferecido e não imposto.
- `Voltar` continua disponível e o progresso continua salvo por etapa concluída, como já é hoje.

### 6. O bloco "Seu negócio", na entrada e nas configurações

O bloco de negócio passa a coletar segmento (frequentes mais "Outro"), nome pelo qual os clientes conhecem o negócio, modalidades (seleção múltipla, ao menos uma) e endereço quando há local próprio. Segmento e nome podem dividir a mesma tela — o vault autoriza nominalmente esse par.

Os mesmos campos passam a ser editáveis em `configuracoes/negocio`, dentro de `ProductSettingsScreen` **como ele está**: este Goal não redecompõe a tela de Configurações, que é do Goal023. Tocar apenas a seção de negócio.

### 7. O bloco "WhatsApp" é opcional, e a conclusão sem ele existe

- Antes de oferecer a conexão, explicar o que o vault manda explicar sobre número pessoal: pode ser pessoal ou comercial, a Avenly organiza as conversas, a IA pode ser desativada para pessoas específicas e responder manualmente tira a IA de cena.
- Duas ações: **`Conectar meu WhatsApp`** e **`Fazer isso depois`**.
- Pular conclui o onboarding com a IA inativa e leva à conclusão sem WhatsApp, com a copy do vault e as duas ações — `Ir para o início` principal e `Conectar agora` secundária.
- Conectar durante o onboarding continua usando `WhatsAppConnectionPanel` como está; **o teste real e a autoativação são do Goal018B**, e nenhuma tela aqui pode afirmar que a IA foi ativada.
- **O cenário `validacao` com o resumo de texto fixo sai.** O que a conclusão afirmar tem de vir de leitura real; o que não houver fonte para afirmar, não é afirmado.

### 8. Checklist pós-onboarding na Home, só com o que tem fonte

Enquanto a IA não estiver efetivamente ativa, `/inicio` mostra o que falta, com item concluído marcado, e some quando a IA estiver ativa. Os itens deste Goal são **serviço operacional**, **horários configurados** e **WhatsApp conectado**, cada um derivado de leitura real já disponível (`GET /v1/dashboard` e `GET /v1/status`) — nenhum derivado de configuração local.

O quarto item do vault, **teste concluído, não entra**: não existe produtor em camada nenhuma, e exibi-lo agora seria afirmar o que nada calcula — exatamente o que o Goal017 removeu no `unreadCount`. Ele entra no Goal018B junto com o seu produtor, e isso é declarado no relatório, não escondido.

### 9. Os dois resíduos de status do review014

- **`PENDING` deixa de se apresentar como "IA desligada".** O estado em que o negócio pediu a IA ligada e a IA ainda não confirma passa a ter apresentação própria, distinta de desligada e de indisponível. As quatro situações de `GET /v1/status` (`ACTIVE`, `OFF`, `PENDING`, `UNKNOWN`) mais o carregamento inicial ficam distinguíveis em tela.
- **Um único poller de `/v1/status` por árvore renderizada.** `AppShell` e `DashboardScreen` param de instanciar cada um o seu; a leitura passa a ser compartilhada, no mesmo espírito da invariante de `useShellConfig` (D-030/D-031), e a invariante é **provada por render** — montar a Home dentro do shell real e contar as chamadas —, não por leitura de código.

### 10. Provas

Suíte `goal018-*` em `apps/frontend/tests/`, no padrão já estabelecido: schema dos campos novos (incluindo resposta antiga sem eles), alcance por rota de cada cenário sobrevivente, blocos e progresso, negócio com modalidade e endereço condicional, WhatsApp opcional e conclusão sem ele, checklist da Home, poller único por render e axe nas telas novas. No BFF, testes da migration e das rotas, incluindo a recusa de `ON_SITE` sem endereço, o conjunto de `issues` de `complete` sem os dois códigos de WhatsApp, e a invariante de que concluir não liga a IA. Na IA, teste de que `settings` gravado antes deste Goal continua parseando e de que o prompt usa os campos novos sem inventar o que falta.

Teste que não falharia se o comportamento fosse removido não conta como prova.

### 11. Documentação

`apps/bff/PUBLIC_API_V1.md` nos pontos tocados: campos novos de negócio, o estado de projeção, os códigos de pendência nomeados e a saída dos dois códigos de WhatsApp de `complete`. E, em `docs/migration/`, **os documentos que este diff tornar falsos** — [GAP_ANALYSIS](../GAP_ANALYSIS.md) em G-25 e G-26, [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) na linha do onboarding e [CURRENT_STATE](../CURRENT_STATE.md) na seção de frontend e contratos. Não tocar `MIGRATION_STATUS.md`, `MASTER_PLAN.md`, `DECISIONS.md` nem os documentos de fechamento: esses são do reviewer e do IA Loop.

## Migração, compatibilidade e limites operacionais

- **Há migration de banco, e ela é aditiva.** Colunas novas em `BusinessProfile` com default que não fabrica escolha: modalidades nascem vazias, endereço nulo, versão projetada distinta da versão corrente para tenant que ainda não foi projetado. Nenhum backfill inventa modalidade a partir de categoria, nome ou serviço. Por haver migration, `validate:integration` é exigido e tem de rodar de verdade — o [review017](../reviews/017-review.md) registrou um teste de integração escrito e nunca executado, e isso não se repete aqui.
- **Compatibilidade do contrato interno.** `AiTenantConfig.settings` gravado antes deste Goal continua válido; a projeção nova é lida com defaults e sem descartar o que já existe.
- **Uma mudança subtrativa declarada:** `POST /v1/onboarding/complete` deixa de recusar por WhatsApp. Nenhum outro comportamento existente é removido.
- **Ativação continua não acontecendo aqui.** `PATCH /v1/settings/ai` mantém a regra vigente (ao menos um serviço operacional) e nada mais; o teste real que ativa é do Goal018B.
- **Sem transporte real.** Nenhum WhatsApp real, nenhum modelo real e nenhuma CI hospedada são exercitados. Toda prova é contra dublê ou contra PostgreSQL descartável.
- **Larguras em rota autenticada continuam fora.** O gate renderizado cobre só rotas públicas; as rotas de onboarding exigem sessão e não são públicas. Estender o Playwright a rota autenticada continua sendo decisão de escopo própria, não tomada aqui.

## Testes e critérios de aceite

1. Migration aditiva aplicada em banco descartável recriado do zero, com modalidades vazias, endereço nulo e nenhuma escolha fabricada para linha existente.
2. `GET/PATCH /v1/settings/business` e a seção `business` de `GET/PATCH /v1/onboarding` leem e escrevem modalidades e endereço; corpo sem `modalities` preserva o gravado e nunca grava conjunto vazio.
3. `ON_SITE` sem endereço não-vazio é recusado com `400` e código próprio; sem `ON_SITE`, endereço nulo é aceito; retirar `ON_SITE` não apaga o endereço já informado.
4. `businessContextSchema` aceita `settings` gravado antes deste Goal sem cair no default inteiro, e aceita o formato novo completo; o prompt imprime segmento, modalidades e endereço e diz "não configurado" para o que faltar, sem inventar.
5. O estado de projeção é observável em `GET /v1/settings` e `GET /v1/onboarding`, com projetado e pendente distinguíveis; projeção falha grava o dado, responde sucesso com o aviso e **não** vira `500`; projeção posterior bem-sucedida passa o estado a projetado.
6. `POST /v1/onboarding/complete` conclui com WhatsApp ausente e com WhatsApp desconectado; `WHATSAPP_NOT_CONFIGURED` e `WHATSAPP_NOT_CONNECTED` não aparecem mais em `issues`.
7. As demais pendências continuam bloqueando, com os códigos nomeados em `PUBLIC_API_V1.md`, e as duas novas de negócio entram no mesmo conjunto.
8. Concluir o onboarding não altera `AiSettings.enabled` nem projeta `enabled: true`; o teste falha se alguém acoplar as duas coisas.
9. `features/onboarding/` é um conjunto de módulos com um despachante; `PrototypeOnboardingScreen`, a prop `preview` e `features/onboarding/types.ts` não existem mais.
10. Cada cenário declarado em `scenarios.ts` é alcançável pelo fluxo do produto, provado por teste de alcance; nenhum componente novo fica sem importador.
11. O progresso é apresentado pelos quatro blocos, com o bloco corrente nomeado, e nenhuma contagem de telas aparece em tela.
12. A retomada abre a próxima pendência real e não força o passo de WhatsApp.
13. O bloco de negócio coleta segmento com frequentes mais "Outro", nome, modalidades múltiplas e endereço condicional; os mesmos campos são editáveis em `configuracoes/negocio` sem redecompor `ProductSettingsScreen`.
14. O bloco de WhatsApp explica o uso de número pessoal antes de oferecer a conexão e oferece `Conectar meu WhatsApp` e `Fazer isso depois`.
15. Pular o WhatsApp conclui o onboarding, leva à conclusão sem WhatsApp com as duas ações do vault, e **nenhuma tela afirma que a IA foi ativada**.
16. O cenário `validacao` com resumo de texto fixo não existe mais; toda afirmação da conclusão vem de leitura real.
17. O checklist de `/inicio` mostra serviço operacional, horários configurados e WhatsApp conectado, cada um derivado de leitura real, com item concluído marcado, e some quando a IA está efetivamente ativa; "teste concluído" não aparece.
18. `PENDING` tem apresentação própria, distinta de desligada e de indisponível; os quatro estados de `GET /v1/status` mais o carregamento inicial são distinguíveis em tela.
19. Existe **um** poller de `GET /v1/status` por árvore renderizada, provado por render da Home dentro do shell real.
20. Suíte de acessibilidade com axe verde nas telas novas em jsdom.
21. `npx tsc --noEmit` limpo em `apps/frontend`, em `apps/bff` e em `apps/ai-orchestrator`.
22. `npm run lint` em `apps/frontend` cobre `src` e `tests` com `--max-warnings=0` e sai limpo, sem regra afrouxada.
23. `npm run validate:core` exit 0, com os skips já declarados do Goal002 e nenhum novo.
24. `npm run validate:integration` exit 0 contra PostgreSQL descartável, com a migration nova aplicada — executado de verdade, com output no relatório.
25. `npm run validate:ui` exit 0 — continua cobrindo apenas as rotas públicas, e **nenhum critério deste Goal declara largura, contraste, foco ou estado de tela autenticada como provado por teste**.
26. `git diff --check` exit 0.

Fidelidade visual à referência aprovada **não** é provada por teste nenhum e continua sendo conferência humana.

## Entrega

Diff sobre a baseline aceita, com relatório do que foi entregue, o que foi provado e como, e o que ficou fora com o motivo. Nenhum commit, merge ou deploy é feito pelo executor. Componente sem importador conta como não entregue. Gate vermelho não é entrega: se um passo determinístico falhar, isso vai no relatório com o output, não é omitido.
