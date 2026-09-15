# Goal 020 — Importação única na UI e histórico

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-15 pelo Tech Lead Agent após [Goal019 ACCEPTED](../reviews/019-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `cf4cea91b1fa0b321590cbf865aa7a00618b4247`

Goal anterior: 019 — Demonstração da IA, teste real e autoativação

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal019 já integrado em `main` (origem `5f449e5a0f6353a24bd655d20ae612bb5a8b446d`), incluindo implementação das quatro rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fechar **G-19** na parte que o [review010](../reviews/010-review.md) deixou nominalmente aberta: *"a experiência — tela de importação, preview visual e histórico em Configurações — não existe"*. O domínio da importação única foi inteiro construído e aceito no Goal010 — sessão, preview versionado que não escreve dado operacional, execução por item com checkpoint e idempotência, lease pelo relógio do banco, conclusão única garantida por índice parcial. Nada disso tem consumidor. Este Goal dá ao negócio a jornada que o vault descreve, sem inventar capacidade nova de domínio.

Junto vem a consequência que o Goal010 declarou e adiou: a interface ainda dirige o **protocolo legado** `MigrationJob` e ainda oferece migrar *para* o Minha Agenda — troca de fonte que o backend recusa desde o corte do writer remoto. O Goal010 entregou "compatibilidade mínima dos consumers atuais para que o corte operacional não deixe o frontend oferecendo operação impossível"; o 020 é quem entrega "a composição visual final" e retira a oferta impossível.

O que torna este Goal caro de errar não é o número de telas: é que **concluir a importação consome o direito único do negócio**. Não existe segunda importação, e nenhuma tela pode chegar a essa decisão por acidente, por duplo clique, por retomada mal lida ou por um preview obsoleto sendo executado no lugar do que o negócio aprovou. A conclusão é a única decisão irreversível da interface do produto até aqui.

Este Goal **não** faz: lembretes (021), notificações e alertas (022), retenção e exclusão de conta (023), Home e Configurações completas, inclusive a redecomposição de `ProductSettingsScreen` (024), retirada das rotas legadas `/v1/calendar/migrations` e das rotas `/internal/calendar/integration/*` (025). Não cria job, cron ou agendador. Não cria migration: o esquema da importação está pronto desde o Goal010 e nada aqui exige coluna nova. Não há design system de terceiros, Tailwind/shadcn, biblioteca visual, store global, framework novo ou tema escuro. Nenhum aceite de 001–019 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md); **D-026** (contratos da importação única, adotados no Goal010 — é a decisão que este Goal expõe na interface), **D-030** e **D-031** (fundação visual, shell compartilhado com uma única fonte de configuração por árvore, decomposição por módulo, identidade por ID, autorização negada por padrão), D-018, D-032 e D-033 em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 010, 014, 015, 016, 017, 018 e 019 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler o AGENTS global e `apps/frontend/AGENTS.md` (contrato de design: o vault prevalece; preservar tokens úteis; sem Tailwind/shadcn). Consultar seletivamente no Product Vault apenas [Importação do Minha Agenda](../../product-vault/01-Regras/06-Importacao-Minha-Agenda.md) e [Fluxo de Importação Única](../../product-vault/02-Fluxos/05-Importacao-Unica.md) — os dois **inteiros**, são a fonte deste Goal —, mais [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md) e [Responsividade Mobile-First](../../product-vault/03-UX-UI/02-Responsividade-Mobile-First.md). Não abrir o vault inteiro.
- Consultar seletivamente em `docs/design-reference/claude-design/prototype/project/` apenas `Onboarding-2-Importacao.dc.html` e suas variantes Tablet/Desktop, `Mais-WhatsApp-Importacao-Conta.dc.html` e `Configuracoes-Desktop.dc.html`/`Configuracoes-Tablet.dc.html` para a seção de histórico. Os HTMLs especificam resultado visual e comportamento, nunca arquitetura React; instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-19** é o alvo, na parte de experiência; **G-10** fecha na parte de consumidor; G-31 avança na última tela de módulo pesada. [CURRENT_STATE](../CURRENT_STATE.md): seções de agenda e importação.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, o bloco "Importação única (Goal010)" e a linha do protocolo legado. Usar Graphify apenas para confirmar consumidores de `BffMigrationService`, de `BffCalendarService.connectIntegration` e das rotas `/v1/calendar/migrations`. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

1. **Dez métodos de adapter sem um único consumidor.** `apps/frontend/src/data/services/BffMigrationService.ts` expõe os sete métodos da importação (`/v1/calendar/imports` e derivados, linhas 95–190) e `BffCalendarService.ts` expõe `connectIntegration`, `reconnectIntegration` e `disconnectIntegration` (linhas 517–543). A busca por qualquer um deles fora do próprio adapter não devolve nenhum chamador. É o mesmo padrão que os Goals 015 e 016 encontraram e fecharam.
2. **A interface dirige o protocolo legado.** `features/migration/ProductMigrationScreen.tsx` tem 878 linhas, serve nove rotas por `app/(platform)/migracao/[step]/page.tsx` e chama `migration.diagnose` (linha 118), `migration.create` (150) e `migration.get` (496) — `POST /v1/calendar/migrations/diagnose`, `POST /v1/calendar/migrations` e `GET /v1/calendar/migrations/:id`, o protocolo que o Goal010 substituiu. Duas dessas rotas (`para-minha-agenda`, `target=external`) são **troca de fonte**, que o backend recusa desde o corte do writer remoto (G-10).
3. **O contrato público já afirma o que ainda não é verdade.** `apps/bff/PUBLIC_API_V1.md` linha 73 classifica o protocolo legado como *"sem consumidor no frontend vigente"*. Na baseline isso é falso. O 020 resolve pelo lado do código, não apagando a linha.
4. **A leitura da sessão não existe em camada nenhuma.** `ImportCompletionService.getHistory()` (`import-completion-service.ts:251`) **não tem um único chamador**, e `getImportRight()` (`:265`) só é usado internamente por `assertImportAvailable`, `startSession` e `complete`. Não há rota interna, não há rota `/v1`. Consequência direta e verificável: recarregar a página perde a sessão; Configurações não tem como mostrar histórico; e a única forma de descobrir se o negócio já importou é tentar criar e levar `409 IMPORT_ALREADY_COMPLETED`, ou seja, descobrir por erro.
5. **`ImportSessionCategory.selected` é lido e nunca escrito.** `import-execution-service.ts:398-431` pula as categorias desmarcadas na execução, e o único escritor de `selected` é o upsert do preview (`import-preview-service.ts:410`). Não existe rota, nem método de serviço, que desmarque uma categoria — de modo que *"Importar tudo por padrão, com opção de escolher categorias"*, regra do vault, é inalcançável hoje.
6. **A credencial da origem já tem caminho e não é capacidade nova.** `POST /v1/calendar/integration/connect` (BFF `modules/calendar/routes.ts:621`) chega a `/internal/calendar/integration/connect`, que testa a credencial com `listServices()`, recusa `enableWrites` com `INTEGRATION_WRITES_NOT_SUPPORTED` e grava cifrada por tenant via `encryptIntegrationCredentials` (AAD do `tenantId`). `requireIntegration` (`internal-api/routes.ts:1552`) exige a conexão `MINHA_AGENDA` antes de abrir a sessão e devolve `404 INTEGRATION_CONNECTION_NOT_FOUND` quando não existe — que é o estado de todo negócio hoje, porque nenhuma tela conecta.
7. **O onboarding promete o que o fluxo vigente não cumpre.** `features/onboarding/blocks/schedule.tsx`, cenário `agenda-atendly-metodo`, oferece só "Começar do zero" e exibe em texto fixo *"A importação única será habilitada no fluxo de migração"*.
8. **`features/migration/types.ts` não tem importador** — declara `MigrationService`, `ImportStage` e `ImportSessionService` e ninguém os usa. É o mesmo código morto que os Goals 015, 016, 017 e 018 removeram nos seus módulos.
9. **Os schemas de importação do frontend já existem e já têm suíte:** `data/mappers/publicApiSchemas.ts` exporta `ImportPreview`, `ImportItemsPage`, `ImportProgress`, `ImportCompletion` e os demais, provados por `tests/goal010-import-schema.test.ts`.
10. **Vocabulário do domínio, para não ser reinventado:** `ImportCategory` tem oito valores (`SERVICE`, `CUSTOMER`, `AVAILABILITY`, `TIME_BLOCK`, `FUTURE_APPOINTMENT`, `PAST_APPOINTMENT`, `CANCELLED_APPOINTMENT`, `NO_SHOW_APPOINTMENT`); `ImportSessionStatus` tem oito (`DRAFT`, `ANALYZING`, `READY`, `EXECUTING`, `PARTIAL`, `FAILED`, `SUPERSEDED`, `COMPLETED`, sendo terminais os três últimos `COMPLETED`, `FAILED` e `SUPERSEDED`); `ImportItemStatus` tem cinco (`PENDING`, `IMPORTED`, `SKIPPED`, `FAILED`, `NEEDS_REVIEW`); as decisões de item são `INCLUDE`, `EXCLUDE`, `MERGE_WITH_EXISTING`, `CREATE_NEW` e `KEEP_EXISTING`; e as limitações já declaradas pela origem são `CUSTOMER_DIRECTORY_UNAVAILABLE` e `NO_SHOW_NOT_MODELED_BY_SOURCE`.

## Pontos de implementação

`apps/scheduling-service/src/modules/migrations/`, `apps/scheduling-service/src/modules/internal-api/routes.ts`, `apps/bff/src/modules/migrations/routes.ts`, `apps/bff/src/clients/scheduling/index.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/frontend/src/data/services/BffMigrationService.ts`, `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `apps/frontend/src/features/imports/` (novo), `apps/frontend/src/features/migration/` (retirada), `apps/frontend/src/app/(platform)/` (rotas), `apps/frontend/src/features/settings/ProductSettingsScreen.tsx`, `apps/frontend/src/features/onboarding/blocks/schedule.tsx`, `apps/frontend/src/shared/layout/navigation.ts`, `apps/frontend/src/shared/styles/`, e suítes em `apps/scheduling-service/tests/`, `apps/bff/tests/` e `apps/frontend/tests/`.

Arquivo fora desta lista só entra se for consequência direta e declarada do escopo, e o relatório precisa dizer por quê.

## Escopo obrigatório

### 1. Ler o estado da importação do negócio

Criar a leitura que falta, com o domínio que já existe. No Scheduling, rota interna que devolve, para o tenant do contexto e só para ele: o **direito** (`available`, `sessionId`, `completedAt`, de `getImportRight`), a **sessão viva** quando houver (id, `status`, `previewVersion`, contagens por categoria, `selected` por categoria, `sourceAccountId`/`sourceAccountLabel`, marcos de tempo) e o **histórico** quando houver conclusão (`getHistory`, que hoje não tem chamador). No BFF, a rota pública correspondente sob `/v1/calendar/imports`, com `requireTenantContext` como todas as outras.

Regras que a leitura precisa respeitar, e que o review vai verificar:

- é **leitura**: não abre sessão, não muda `status`, não incrementa `previewVersion`, não consome direito nenhum;
- o tenant vem sempre do contexto autenticado, nunca de corpo, query ou header — como no resto do módulo;
- negócio sem conexão, sem sessão e sem histórico é resposta **válida** com os três campos vazios, não erro: é o estado de todo negócio novo, e é dele que a UI decide o ponto de entrada;
- a conexão da origem entra na resposta apenas como estado (conectada ou não, status, rótulo), **jamais** credencial, nem cifrada, nem parcial.

### 2. Escolher o que importar

Expor a escrita de `ImportSessionCategory.selected`, hoje lida pela execução e nunca escrita. Rota interna no Scheduling e rota pública no BFF, por sessão e categoria. Regras:

- só é aceita enquanto a sessão admite decisão — sessão `COMPLETED`, `FAILED` ou `SUPERSEDED` recusa com código próprio, no mesmo vocabulário das recusas já existentes do módulo;
- desmarcar **não** invalida o preview nem muda `previewVersion`: não é releitura da origem, é escolha sobre o preview aprovado;
- toda categoria nasce selecionada, como o `@default(true)` do schema já diz. "Importar tudo" é o caminho principal e não exige nenhuma chamada extra;
- categoria que a origem não suporta não pode ser apresentada como selecionada de um jeito que prometa importar o que não existe.

### 3. Conectar a origem, sem nunca segurar a credencial

Tela de conexão consumindo `POST /v1/calendar/integration/connect`, já existente. A credencial vai no corpo da requisição e **não é guardada no frontend** — nem em estado que sobreviva à navegação, nem em `localStorage`, nem em query string, nem em log. Erro de credencial é mensagem de produto, não `stack`. `INTEGRATION_WRITES_NOT_SUPPORTED` não pode nem ser alcançável pela UI: a interface não oferece escrita de volta.

### 4. A jornada, na ordem que o vault define

Analisar sem alterar nada → preview por categoria com **quantidade** → "Importar tudo" como CTA principal, "Escolher o que importar" como caminho secundário → conflitos explicados em linguagem leiga → executar → revisar pendências → concluir → resultado.

Obrigações verificáveis:

- **análise não altera dado operacional**, e a tela afirma isso antes de qualquer confirmação — o preview do Goal010 já garante isso no domínio, e a copy não pode contradizê-lo;
- cada categoria mostra a contagem real vinda do preview e, quando a origem não fornece a categoria, a **limitação declarada** em linguagem de produto (`CUSTOMER_DIRECTORY_UNAVAILABLE`, `NO_SHOW_NOT_MODELED_BY_SOURCE`): explicar a ausência, nunca fabricar número;
- **poucos conflitos não bloqueiam milhares de registros válidos**: conflito é resolvido por item, com as cinco decisões do contrato, e deixar conflitos sem decidir não impede executar o resto;
- a execução mostra progresso lido de `GET .../progress` a cada chamada — progresso é fato do banco, nunca contador local somando o que a tela acha que aconteceu. Em estado terminal a leitura **para**;
- falha parcial marca o item, não a sessão: `PARTIAL` é estado legítimo e a tela o trata como tal, com o que faltou visível e reprocessável durante a sessão.

### 5. Executar sempre o preview que o negócio aprovou

`POST .../execute` exige `previewVersion`, e ela é obrigatória de propósito — o contrato registra que, fosse opcional, "a recusa de preview obsoleto viraria opt-in". A interface envia a versão que a tela de preview mostrou ao negócio, não a que ela descobriu depois. Se a versão estiver obsoleta, a recusa é tratada como um estado do produto — o preview mudou, veja de novo antes de executar — e nunca como erro genérico.

### 6. Concluir é definitivo

`POST .../complete` consome o direito único. A interface precisa, nesta ordem:

- pedir confirmação explícita quando houver itens não importados, com a copy que o vault define, incluindo **"Esta é sua única importação."** e a consequência de não poder importar de novo;
- mapear `acceptPending` para essa confirmação, e só para ela: aceitar pendências é decisão consciente do negócio, nunca default silencioso;
- impedir dupla submissão — botão ocupado, requisição única e `Idempotency-Key` estável para a mesma tentativa, como as demais mutações do módulo;
- depois de concluída, nenhum caminho da interface oferece nova importação; o que existe é histórico.

### 7. Histórico em Configurações

Seção de Importação em Configurações que mostra **somente o histórico** quando há conclusão — origem, quando, o que entrou por categoria, o que ficou de fora e por quê — e o ponto de entrada quando o direito ainda está disponível. É a mesma leitura do item 1; nenhuma tela inventa estado próprio. `ProductSettingsScreen` não é redecomposta aqui (isso é do 024): a seção nova entra como bloco do módulo de importação consumido pela tela de Configurações, e não como mais quinhentas linhas dentro dela.

### 8. Pontos de entrada honestos

- Onboarding, cenário `agenda-atendly-metodo`: a escolha entre "Começar do zero" e importar do Minha Agenda passa a ser real. O texto fixo que promete habilitação futura sai.
- Configurações → Agenda e a navegação deixam de apontar para o fluxo legado.
- O ponto de entrada é decidido pelo estado lido no item 1 — direito disponível, sessão viva para retomar, ou conclusão que só rende histórico. Retomar uma sessão viva é o comportamento padrão, como `startSession` já faz no domínio; substituir (`replace`) é decisão explícita do negócio, apresentada como descarte do que estava em andamento.

### 9. Retirada do protocolo legado da interface

`ProductMigrationScreen` e as rotas `migracao/[step]` deixam de existir na forma atual. O que fica é o módulo novo da importação; o que sai é o protocolo `MigrationJob` e a direção `para-minha-agenda`, isto é, troca de fonte pela UI — operação que o backend recusa desde o Goal010 e que a interface não pode continuar oferecendo.

**As rotas `/v1/calendar/migrations` do BFF e as rotas internas correspondentes permanecem intactas.** A retirada delas é do Goal025 e não acontece aqui. O que muda é que passam a ter zero consumidor — e com isso a linha 73 de `PUBLIC_API_V1.md`, que já afirma isso, passa a ser verdadeira. Atualizar essa linha para registrar desde quando, e documentar as duas rotas novas na seção da importação única, com os códigos de recusa que elas podem devolver.

CSS: `shared/styles/atendly-migration.css` acompanha o módulo — o que a jornada nova usa é preservado e renomeado junto; o que ficar sem seletor correspondente sai. Não deixar folha importada apontando para diretório vazio, o resíduo que o [review015](../reviews/015-review.md) registrou.

### 10. Invariante do shell e código morto

Uma única chamada de `useShellConfig` por árvore renderizada, provada por render como nos Goals 015–018 (D-030/D-031). `features/migration/types.ts` sai ou ganha importador — não fica como está. Nenhum arquivo novo sem consumidor.

### 11. Provas

O padrão que atravessou as três recusas do Goal019 é o que este Goal precisa evitar: **dublê sustentando afirmação sobre produção**. Aqui isso tem endereço concreto — a leitura nova e a escrita de `selected` tocam o banco real do Scheduling, e a suíte precisa exercitá-las contra PostgreSQL, não contra um dublê que implemente a semântica que o schema não tem.

- Scheduling, integração contra PostgreSQL: leitura do estado sem sessão, com sessão viva e após conclusão; `selected` escrito e depois **honrado pela execução**, que é o consumidor real do campo; recusa de decisão em sessão terminal; isolamento por tenant, com dois negócios na mesma base e nenhum vendo o estado do outro.
- BFF, integração: as duas rotas novas com contexto de tenant, incluindo 401/403 e a forma exata da resposta; nenhum campo de credencial na resposta da leitura.
- Frontend: suíte de schema para as respostas novas (no padrão de `goal010-import-schema.test.ts`); jornada completa em jsdom — preview, escolher categorias, decidir conflito, executar com progresso lido, concluir com confirmação; a confirmação de conclusão **exigida** quando há pendências e ausente quando não há; dupla submissão não gerando duas conclusões; progresso parando em estado terminal; alcance das telas novas; invariante do shell; e suíte axe das telas novas, como o 016, o 017 e o 019 fizeram.
- Nenhuma suíte pode afirmar que a origem real respondeu: toda origem continua sendo dublê ou fixture, como no Goal010, e isso é declarado.

### 12. Documentação

Atualizar, na medida exata do que este diff muda: [CURRENT_STATE](../CURRENT_STATE.md) (importação e agenda na interface), [GAP_ANALYSIS](../GAP_ANALYSIS.md) (G-19 na parte de experiência, G-10 na parte de consumidor, G-31) e [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) (o que foi reaproveitado do módulo de migração e o que foi retirado). Não tocar documentos de fechamento, review, MASTER_PLAN, DECISIONS ou MIGRATION_STATUS — isso é do reviewer.

## Migração, compatibilidade e limites operacionais

- **Sem migration.** O esquema da importação está pronto desde o Goal010 e nada aqui exige coluna nova. Se a execução concluir que precisa de uma, isso é evidência contrária ao plano: declarar no relatório, com ensaio próprio e `validate:integration` executado de verdade, no padrão dos Goals anteriores.
- **Compatibilidade:** nenhuma rota pública existente muda de forma ou de significado. As duas rotas novas são aditivas. As rotas legadas continuam respondendo o que respondem hoje.
- **Gate operacional declarado, que este Goal não fecha:** a capacidade da API **real** do Minha Agenda continua sem prova, porque não há credencial autorizada (M4, [DATA_MIGRATION §3](../DATA_MIGRATION.md#3-minha-agenda-matriz-de-destino)). Toda origem exercitada aqui é dublê ou fixture, e a interface precisa se comportar corretamente diante de uma origem que responde menos do que o ideal — que é justamente o que as limitações declaradas por categoria existem para expressar.
- **Fidelidade visual à referência aprovada continua sendo conferência humana** e não pode ser declarada como provada por teste.
- **Nenhuma tela autenticada passa por render de largura, contraste e foco**, porque o gate de browser cobre rotas públicas e as telas da importação exigem sessão. É o mesmo limite dos Goals 015–019, e continua declarado em vez de contornado.

## Testes e critérios de aceite

1. A leitura do estado da importação existe no Scheduling e no BFF, devolve direito, sessão viva e histórico, e não altera nada.
2. Negócio sem conexão, sem sessão e sem histórico recebe resposta válida e vazia, não erro.
3. `getHistory` passa a ter chamador e alimenta o histórico de Configurações.
4. A leitura nunca devolve credencial da origem, em nenhuma forma.
5. Dois negócios na mesma base não veem o estado um do outro em nenhuma das rotas novas.
6. `ImportSessionCategory.selected` pode ser escrito, e a execução honra a escolha — provado pelo consumidor real, não só pela escrita.
7. Desmarcar categoria não muda `previewVersion` nem dispara releitura da origem.
8. Sessão terminal recusa decisão de categoria com código próprio.
9. A tela de conexão consome `POST /v1/calendar/integration/connect` e a credencial não sobrevive à navegação nem aparece em log, storage ou URL.
10. O preview mostra contagem por categoria e explica em linguagem de produto cada limitação declarada pela origem.
11. "Importar tudo" é o caminho principal e não exige nenhuma chamada extra para funcionar.
12. Conflito é decidido por item com as cinco decisões do contrato, e conflito pendente não impede executar o resto.
13. `POST .../execute` envia a `previewVersion` que a tela mostrou, e preview obsoleto vira estado de produto explicado, não erro genérico.
14. O progresso exibido vem de `GET .../progress` e a leitura para em estado terminal.
15. `PARTIAL` é tratado como estado legítimo, com o que faltou visível e reprocessável na sessão.
16. Concluir com itens não importados exige confirmação explícita com a copy do vault, incluindo "Esta é sua única importação."; sem pendências, essa confirmação não aparece.
17. `acceptPending` só é enviado a partir dessa confirmação.
18. Dupla submissão de conclusão não conclui duas vezes.
19. Depois de concluída, nenhum caminho da interface oferece nova importação.
20. Configurações mostra o histórico da importação concluída e o ponto de entrada quando o direito está disponível, lendo o mesmo estado.
21. O onboarding oferece a importação como escolha real e o texto que prometia habilitação futura sai.
22. Retomar sessão viva é o padrão; substituir é decisão explícita apresentada como descarte.
23. `ProductMigrationScreen`, as rotas `migracao/[step]` e a direção `para-minha-agenda` saem da interface, e nenhuma tela consome `/v1/calendar/migrations`.
24. As rotas `/v1/calendar/migrations` continuam existindo e respondendo como hoje.
25. `PUBLIC_API_V1.md` documenta as duas rotas novas e a linha 73 passa a ser verdadeira.
26. Uma única chamada de `useShellConfig` por árvore renderizada, provada por render.
27. `features/migration/types.ts` não fica sem importador, e nenhum arquivo novo fica sem consumidor.
28. Nenhuma folha de estilo fica importada apontando para diretório vazio.
29. Suíte axe cobre as telas novas.
30. Suíte de schema cobre as respostas novas.
31. As suítes do Scheduling exercitam a leitura e o `selected` contra PostgreSQL real, não contra dublê de banco.
32. Nenhuma suíte afirma que a origem real respondeu.
33. `tsc --noEmit` exit 0 em `apps/scheduling-service`, `apps/bff` e `apps/frontend`.
34. Lint exit 0, cobrindo também `tests`.
35. `validate:core` exit 0.
36. `validate:integration` exit 0.
37. `validate:ui` exit 0.
38. `git diff --check` exit 0.
39. `CURRENT_STATE`, `GAP_ANALYSIS` e `REUSE_ANALYSIS` atualizados na medida do diff; nenhum documento de fechamento tocado.
40. Nenhum aceite de 001–019 reaberto; nenhuma migration criada sem declaração e ensaio.

## Entrega

Relatório do executor com: diff por arquivo e por quê, incluindo justificativa nominal de todo arquivo fora dos pontos de implementação; saída dos gates; o que foi provado contra PostgreSQL real e o que foi provado com dublê, dito com essas palavras; e a lista do que este Goal deliberadamente não fez, com destino. Sem commit, push, merge ou deploy.
