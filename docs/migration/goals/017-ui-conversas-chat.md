# Goal 017 — Conversas e chat na UI

**Status: ACCEPTED.** Aceito na rodada 3 do [review017](../reviews/017-review.md); commit de fechamento `ea992ec82d337d080a291525d1b7d52ab9796b4b`. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-14 pelo Tech Lead Agent após [Goal016 ACCEPTED](../reviews/016-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `8d94acea2c435f3529cfe31c403f6267aef8064e`

Goal anterior: 016 — Agenda na UI

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal016 já integrado em `main` (origem `1c6a50d0ae0e4cc4f04903e74ae8a7df225c8e1f`), incluindo implementação das quatro rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Entregar a **inbox e o chat**: a última superfície de operação diária que ainda não foi redesenhada. Os Goals 004, 005, 011, 012 e 013 fecharam tudo o que está atrás dela — estado de entrega persistido antes do transporte, categoria de sessão com override manual e "Ignorar IA" absoluto, controle humano gravado no envio, sugestões de resposta com binding somente leitura, e mídia com transcrição de áudio e download sob demanda. **A tela de hoje não consome quase nada disso.** `ProductConversationsScreen` é um monolito de 964 linhas servindo duas rotas, com filtros locais inventados (`ai`/`waiting`/`paused`/`resolved`/`unread`) que não são o vocabulário do produto, sem as três abas de privacidade, sem override de categoria, sem ignorados, sem sugestões, sem mídia, sem transcrição e sem estado de entrega — e com um contador de não lidas que o backend devolve sempre zero.

Este Goal avança G-31 na última tela de módulo pesada, fecha a parte de interface de G-22 (inbox em três abas), de G-23 (player, transcrição e visualizador) e de G-09 (composição visual do estado de entrega), e absorve os resíduos que reviews anteriores dirigiram nominalmente a ele: a inbox em três abas ([review005](../reviews/005-review.md)), a composição visual do estado de entrega ([review004](../reviews/004-review.md)), o teto próprio do proxy de mídia do BFF ([review013](../reviews/013-review.md)), os cinco códigos de recusa de sugestão no contrato ([review012](../reviews/012-review.md)) e o buraco de lint em `tests/` ([review016](../reviews/016-review.md)).

O que este Goal **não** faz: onboarding, negócio e ativação real (018), importação na UI (019), lembretes e jobs (020), notificações e central de alertas (021), retenção e exclusão (022) e Home/Configurações completas (023) não são tocados além do que a decomposição exigir. **Retenção de conversa continua em Configurações** (Goals 022/023): aqui nada é apagado nem configurado. Nenhum job, cron ou automação é criado. Não há design system de terceiros, Tailwind/shadcn, biblioteca visual, store global, framework novo, tema escuro nem WebSocket/SSE — a atualização continua por polling. Nenhum aceite de 001–016 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md) (frontend fala só com o BFF; BFF é proxy fino sobre a IA; read models honestos); D-018, D-020, D-021, D-027, D-028, D-029, **D-030**, **D-031** e **D-032** em [DECISIONS](../DECISIONS.md); [REUSE_ANALYSIS](../REUSE_ANALYSIS.md), linha `ProductConversationsScreen`. Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 005, 012, 013, 014, 015 e 016 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler o AGENTS global e `apps/frontend/AGENTS.md` (contrato de design: o vault prevalece; preservar tokens úteis; sem Tailwind/shadcn). Consultar seletivamente no Product Vault apenas [IA e Conversas](../../product-vault/01-Regras/03-IA-e-Conversas.md), [Handoff e Atendimento Humano](../../product-vault/02-Fluxos/04-Handoff-e-Atendimento-Humano.md), [Privacidade e Retenção](../../product-vault/01-Regras/08-Privacidade-e-Retencao.md), [Princípios de UX/UI](../../product-vault/03-UX-UI/01-Principios-de-UX-UI.md), [Responsividade Mobile-First](../../product-vault/03-UX-UI/02-Responsividade-Mobile-First.md), [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md) e, em [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md), **somente** a seção "Conversas". Não abrir o vault inteiro.
- Consultar seletivamente em `docs/design-reference/claude-design/prototype/project/` apenas `Conversas-e-Chat.dc.html`, `Conversas-Tablet.dc.html`, `Conversas-Desktop.dc.html` e, se precisar de estado ou acabamento, `Acabamento.dc.html` e `QA-Global.dc.html`. Os HTMLs especificam resultado visual e comportamento, nunca arquitetura React; instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-22, G-23 e G-09 na parte de interface e G-31 nas telas restantes são os alvos. [CURRENT_STATE](../CURRENT_STATE.md): "Frontend, referência visual e contratos".
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, seções de conversas, mensagens, mídia e sugestões. Usar Graphify apenas se precisar confirmar consumers de `ProductConversationsScreen`, `BffConversationService` ou das rotas `/v1/conversations/**`. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **A tela é um monolito de 964 linhas servindo duas rotas.** `features/conversations/ProductConversationsScreen.tsx` é importado por `app/(platform)/conversas/page.tsx` e `conversas/[id]/page.tsx`, e despacha entre `ConversationList` e `ConversationDetail`. Faz **duas** chamadas de `useShellConfig`: uma em `ConversationList` (linha 118) e uma em `ConversationDetail` (linha 374). A invariante do D-030/D-031 vale hoje — este Goal precisa não quebrá-la, e precisa prová-la por render, como `goal015-shell-invariant.test.tsx` e `goal016-shell-invariant.test.tsx` já fazem.
- **O adapter já cobre quase tudo e quatro métodos não têm consumidor.** `data/services/BffConversationService.ts` expõe `list` (com `category`, `handling`, `ignored`, `search`, `status`, `limit`), `get`, `listMessages`, `getMedia`, `sendMessage`, `setCategory`, `setIgnored`, `takeover`, `release`, `resolve` e `generateSuggestions`. Buscar `getMedia`, `setCategory`, `setIgnored` e `generateSuggestions` em `apps/frontend/src` fora do próprio adapter devolve **zero** consumidores. `takeover`, `release` e `resolve` são alcançados por despacho dinâmico em `mutate()` (linha 324).
- **Os filtros da lista são locais e não são o vocabulário do produto.** `ConversationList` carrega `{ limit: 100 }` sem filtro e filtra em memória por `all`/`unread`/`ai`/`waiting`/`paused`/`resolved`, derivando o estado por heurística em `conversationViewState`. O vault define abas **Comercial / Não classificadas / Pessoal** e os estados de linguagem interna **IA ativa, IA pausada, IA atendendo, IA com instabilidade, Aguardando você, Você atendendo**. A busca (`query`) também é local, sobre os 100 itens já carregados, enquanto `search` existe na query do BFF e é servida pelo `contains` da IA (`internal/routes.ts:378-384`).
- **`unreadCount` é zero, sempre.** `conversationDto` em `apps/ai-orchestrator/src/modules/internal/routes.ts:1058` devolve `unreadCount: 0` literal, e nenhuma camada o recalcula. A tela ainda tem a aba "Não lidas" (linha 84), a contagem (linha 102) e o badge com `aria-label` "N não lidas" (linhas 699-704) — três afirmações que nunca podem ser verdadeiras. Não existe contrato de estado de leitura em camada alguma, e criá-lo é persistência nova, fora deste Goal.
- **O DTO de conversa não identifica a pessoa por ID.** `conversationSchema` traz `customerName` (texto) e `externalContactId` (telefone), mas **não** `customerId`. O vínculo existe do lado da IA: `Contact.customerId` é lido por `customer-summary-service.ts:176-182` para ancorar o resumo. `conversationDto` já recebe `conversation.contact` carregado (linhas 1066-1068, que leem `ignored`, `ignoredAt` e `aiPaused`). Sem esse campo, o painel de perfil do contato só poderia casar pessoa por telefone — exatamente a identidade que os Goals 006, 015 e 016 removeram.
- **Enviar já assume, e o backend faz isso desde o Goal005.** `POST /internal/conversations/:id/messages` grava `assumeHumanControl` **antes** do transporte e cancela a saída automática pendente (`internal/routes.ts:474-492`); o takeover prévio deixou de ser pré-condição. A tela ainda apresenta "assumir" como passo separado e não diz que enviar assume.
- **O estado de entrega existe e não é composto.** `messageSchema` traz `deliveryState` (`PENDING`/`SENT`/`FAILED`/`UNKNOWN`) e `deliveryDetail`, opcionais porque resposta anterior ao Goal004 não os tem e mensagem recebida nunca os tem. O envio devolve **201** quando o transporte confirmou e **202** quando a tentativa está registrada sem confirmação (`internal/routes.ts:548-552`). `MessageBubble` (linha 737) não lê nenhum dos dois.
- **Mídia e transcrição existem e não são exibidas.** `messageAttachmentSchema` traz `kind` (`AUDIO`/`IMAGE`/`DOCUMENT`/`VIDEO`/`STICKER`), `mimetype`, `fileName`, `sizeBytes`, `durationSeconds`, `tooLarge`, `transcript`, `transcriptStatus` (`PENDING`/`DONE`/`FAILED`/`SKIPPED`), `transcriptError` e `mediaAvailable`. `GET /v1/conversations/:id/messages/:messageId/media` proxia os bytes e as recusas próprias da IA chegam como `UPSTREAM_ERROR` com o código original em `error.details.upstreamCode`: `MESSAGE_ATTACHMENT_NOT_FOUND`, `MEDIA_TOO_LARGE` e `MEDIA_UNAVAILABLE` (`modules/media/message-media-service.ts:21-23`). A tela não menciona `attachment` em lugar nenhum.
- **O proxy de mídia do BFF tem teto de 10 s contra um download de até 60 s.** `internal-http-client.ts:178` usa `AbortSignal.timeout(env.INTERNAL_HTTP_TIMEOUT_MS)` também no `requestBinary` (linha 68), e `INTERNAL_HTTP_TIMEOUT_MS` é `intEnv(10_000)` (`apps/bff/src/config/env.ts:63`), enquanto o download sob demanda da IA tem teto próprio de `EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT_MS = intEnv(60_000)` (`apps/ai-orchestrator/src/config/env.ts:87`). Áudio grande vira `UPSTREAM_ERROR` 502 antes de a IA responder. É o resíduo do [review013](../reviews/013-review.md).
- **As cinco recusas de sugestão existem no código e não no contrato.** `SuggestionRefusalReason` em `apps/ai-orchestrator/src/modules/assistant/assistant.service.ts:105-110` é exatamente `CONTACT_IGNORED`, `SESSION_PERSONAL`, `HUMAN_HANDLING_REQUIRED`, `AI_DISABLED` e `NO_TEXTUAL_MESSAGE`, devolvidas com `statusCode: 409`. `PUBLIC_API_V1.md` descreve as cinco situações em prosa sem nomear código nenhum. É o resíduo do [review012](../reviews/012-review.md).
- **Código morto conhecido.** `src/mocks/data/conversations.ts` não tem importador — mesmo par que o Goal015 removeu do diretório e o Goal016 removeu da agenda. `shared/styles/avenly-conversations.css` tem 919 linhas e é o CSS de módulo a ser revisto pela decomposição.
- **Lint não cobre `tests/`.** `apps/frontend/package.json` define `"lint": "eslint src --max-warnings=0"`; nem `scripts/validate-core.mjs` nem o workflow de CI acrescentam passo de lint sobre `tests`. O [review016](../reviews/016-review.md) registrou o buraco ao encontrar uma constante sem uso que nenhum gate acusaria.
- **Gates disponíveis.** `apps/frontend` tem vitest com jsdom, `@testing-library/react`, `@testing-library/user-event`, `tests/setup/dom.ts`, o helper de axe em `tests/support/a11y.ts` e o padrão de suíte por Goal (`goal016-*.test.tsx`, incluindo invariante de shell, alcance de rotas e a11y). A IA tem `tests/internal/conversation-controls.routes.test.ts`, `tests/internal/media.routes.test.ts` e `tests/internal/suggestions.routes.test.ts`, todos dentro de `test:ai-orchestrator` no `validate:core`. O gate renderizado (`npm run validate:ui`, Playwright em 360/390/768/1024/1440) roda sem backend e cobre apenas as rotas públicas de `apps/frontend/e2e/routes.ts`.

## Pontos de implementação

`apps/ai-orchestrator/src/modules/internal/routes.ts` (projeção do DTO de conversa), `apps/ai-orchestrator/tests/internal/`, `apps/bff/src/clients/ai-orchestrator/index.ts`, `apps/bff/src/clients/internal-http-client.ts`, `apps/bff/src/config/env.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `apps/frontend/src/data/services/BffConversationService.ts`, `apps/frontend/src/features/conversations/` (origem e destino da decomposição), `apps/frontend/src/app/(platform)/conversas/**`, `apps/frontend/src/shared/ui/` (consumo das primitivas existentes), `apps/frontend/src/shared/styles/avenly-conversations.css`, `apps/frontend/package.json` (escopo do lint) e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. O único contrato que falta, e só ele

`customerId` **nulável** no DTO de conversa. A IA passa a projetar `contact.customerId` em `conversationDto`; o schema do cliente da IA no BFF e o `conversationSchema` do frontend passam a aceitar o campo como opcional e nulável, para que resposta anterior continue válida. É **aditivo**: nenhuma rota existente muda de forma, nenhum campo sai, nenhum endpoint nasce. Sem ele, o painel de perfil do contato (item 8) só poderia casar pessoa por telefone, e essa é a identidade que os Goals 006, 015 e 016 removeram do produto.

Nenhum outro endpoint é criado, removido ou alterado. `PUBLIC_API_V1.md` é atualizado neste ponto, nos cinco códigos de recusa do item 12 e em nada mais.

### 2. Teto próprio para o proxy de mídia do BFF

`requestBinary` deixa de usar `INTERNAL_HTTP_TIMEOUT_MS`. Um teto próprio, configurável e **maior que o download sob demanda da IA** (`EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT_MS`, 60 s por default), passa a valer só para esse caminho; as rotas JSON mantêm os 10 s de hoje, sem alteração. É mudança de configuração e de um caminho de cliente, não de contrato: nenhum código de erro novo, nenhum corpo novo. Fecha o resíduo do [review013](../reviews/013-review.md). O default escolhido fica documentado junto dos demais envs do BFF.

### 3. Decomposição por módulo, com a invariante do shell preservada

`features/conversations/ProductConversationsScreen.tsx` (964 linhas) é decomposto em módulos dentro de `features/conversations/`, no mesmo padrão que o Goal015 aplicou a Clientes/Serviços e o Goal016 à Agenda (D-031): um despachante de cenários mutuamente exclusivos, cada cenário declarando a configuração de shell **uma única vez** por árvore renderizada. O número de call sites de `useShellConfig` não aumenta com o número de telas: continua um por cenário vivo. Rota nova só nasce se um fluxo obrigatório a exigir, e nesse caso é declarada na entrega. `avenly-conversations.css` acompanha a decomposição; classe que deixar de ter consumidor em tela viva sai, e o que ainda tiver dono migra — conferência uma a uma, como no Goal016.

### 4. Inbox em três abas, servidas pelo backend

Abas **Comercial**, **Não classificadas** e **Pessoal**, alimentadas por `category` na query do BFF — não por filtro local. A aba corrente é visível, a escolha persiste enquanto a tela vive, e a busca (item 5) respeita a aba corrente. Cada linha traz nome, última mensagem, horário, estado (item 6) e destaque de handoff. **Prioridade de quem espera**: conversa em `Aguardando você` sobe no topo da aba Comercial, conforme o fluxo de handoff.

A aba **Pessoal** diz explicitamente que a IA está desativada naquela sessão — é regra de privacidade, não detalhe. Conversa pessoal não alimenta contagem comercial nenhuma nesta tela.

**Ignorados** ganham entrada própria por `ignored` na query e a operação `setIgnored`. Contato ignorado é apresentado como "a IA não usa esta conversa" — conteúdo não vira contexto, histórico anterior deixa de ser contexto —, nunca como conversa apagada ou bloqueada. Marcar e desmarcar são reversíveis e a tela diz o que cada uma faz antes de confirmar.

**Override manual de categoria** por `setCategory`, incluindo `null` para devolver a conversa à classificação automática. A origem vigente é visível: `categorySource` `MANUAL` se apresenta como decisão da profissional e `AUTOMATIC` como classificação da plataforma, e `suggestedCategory` aparece como sugestão a aceitar ou recusar, nunca aplicada sozinha. Override manual prevalece e atravessa a troca de sessão — a tela não pode sugerir o contrário.

### 5. Busca servida pelo backend

A busca passa a usar `search` na query, com a aba corrente junto, em vez de filtrar em memória os 100 itens carregados. Digitação com debounce, estado de "buscando" distinto de "sem resultado", e o vazio de busca distinto do vazio de aba. Limite de resultado explícito; a tela nunca afirma total que não tem.

### 6. Estados reais, no vocabulário do produto

Os seis estados de linguagem interna do vault — **IA ativa, IA pausada, IA atendendo, IA com instabilidade, Aguardando você, Você atendendo** — derivados do que o contrato devolve (`status`, `humanHandoff`, `handling`, `aiPaused`, `ignored`, `category`, `session`), não de heurística local sobre nomes de filtro. O componente automatizado é chamado de **IA**, nunca de "Avenly", nunca com nome de pessoa. `handoffReason` é apresentado quando existe: a profissional vê **por que** a conversa caiu no colo dela.

**A contagem de não lidas sai.** Aba, contador e badge de `unreadCount` são removidos enquanto o backend devolver zero constante: a tela não pode afirmar o que nenhuma camada calcula. Criar estado de leitura é persistência nova e está fora deste Goal — se o produto quiser, é item próprio.

### 7. Chat: mensagens, autoria e eventos internos

Mensagens em ordem, com autoria **discreta e honesta**: `source` `CUSTOMER`, `AI` e `OWNER` distinguíveis por texto e forma, e o que a IA escreveu aparece como escrito pela IA. Eventos internos (handoff, pausa, assunção, mudança de categoria) recolhíveis e discretos, sem competir com a conversa. Campo de resposta sempre alcançável por teclado. Carregamento, erro e conversa vazia com estados próprios; o polling de atualização não pode apagar o que a profissional está digitando nem rolar a conversa sob o dedo dela.

### 8. Perfil do contato no contexto da conversa

Desktop: painel lateral. Mobile: tela ou drawer acionado pelo cabeçalho, conforme o vault. Mostra o que já existe e é autorizado, e liga para a pessoa **por `customerId`** (item 1) quando há vínculo. Sem vínculo, a tela diz que o contato ainda não é um cliente cadastrado, e não inventa correspondência por telefone. Nada de memória, nota ou tag é criado ou editado aqui — isso é Clientes (Goal015), já entregue.

### 9. Mídia e transcrição

**Áudio**: transcrição apresentada quando `transcriptStatus` é `DONE`; `PENDING` como "transcrevendo", `FAILED` com a falha dita (`transcriptError`) e **nunca** texto inventado no lugar, `SKIPPED` explicando que a política não permitiu transcrever aquela mensagem. A transcrição é marcada como transcrição, não como texto que o cliente escreveu. Duração exibida quando `durationSeconds` existe.

**Imagem, documento e vídeo**: visíveis sob demanda pelo proxy de mídia (`getMedia`), sem interpretação nenhuma pela plataforma. `mediaAvailable: false` **não** oferece "ver mídia"; `tooLarge` aparece como metadado (nome, tipo, tamanho) com a explicação de que os bytes não estão disponíveis. Sticker e GIF aparecem sem tratamento especial e sem afirmar intenção.

As três recusas próprias chegam por `error.details.upstreamCode` e ganham copy própria: `MESSAGE_ATTACHMENT_NOT_FOUND`, `MEDIA_TOO_LARGE` e `MEDIA_UNAVAILABLE` — nunca erro genérico, nunca "tente novamente" quando a causa é conhecida e definitiva. O download sob demanda pode demorar: a tela mostra progresso e permite cancelar, e o teto do item 2 é o que garante que a espera chegue ao fim sem 502 prematuro.

Nenhum byte é guardado pelo frontend além do necessário para exibir, e nenhum `mediaUrl` é exposto — o proxy é o único caminho.

### 10. Estado de entrega no chat

`deliveryState` e `deliveryDetail` compostos no balão da mensagem enviada, fechando o resíduo do [review004](../reviews/004-review.md):

- `PENDING` é tentativa em curso, não sucesso;
- `SENT` é entrega confirmada pelo transporte;
- `FAILED` é falha dita, com `deliveryDetail` quando existe;
- `UNKNOWN` é **não confirmado** — nem enviado, nem falho. A tela diz isso com essas palavras e **não oferece reenviar**, porque reenviar uma mensagem que pode ter chegado duplica no WhatsApp do cliente.

Resposta **202** do envio é tentativa registrada, e a tela a apresenta como tal; **201** é confirmação. Mensagem antiga sem o campo não é falha: ausência de estado se apresenta como ausência, não como erro. Mensagem recebida nunca exibe estado de entrega.

### 11. Assumir no envio, retomar IA, resolver

**Abrir a conversa não altera estado nenhum.** Enviar assume — o backend já grava o controle humano antes do transporte —, e a tela diz isso **antes** do envio, junto ao campo, e reflete a transição `Aguardando você` → `Você atendendo` depois. O `takeover` explícito continua disponível para quem quiser assumir sem escrever.

**Retomar IA** (`release`) explica que a IA reavalia o contexto atual em vez de continuar cegamente de onde parou, e não é oferecida quando não se aplica. **Resolver** (`resolve`) encerra o atendimento. Nenhuma mensagem automática anunciando troca entre IA e humano é enviada ao cliente — não existe caminho para isso nesta tela e nenhum é criado.

### 12. Sugestões da IA no atendimento humano

`generateSuggestions` oferecida **apenas** quando o humano está atendendo dentro da Avenly, acima do campo de texto. Até três sugestões, que a profissional pode usar, editar ou ignorar; **nenhuma é enviada automaticamente** — usar uma sugestão preenche o campo, e o envio continua sendo o caminho humano já existente.

As cinco recusas próprias ganham copy própria, cada uma dizendo o que é, lidas de `error.details.upstreamCode`: `CONTACT_IGNORED` (contato ignorado pela IA), `SESSION_PERSONAL` (sessão pessoal), `HUMAN_HANDLING_REQUIRED` (não há atendimento humano vigente), `AI_DISABLED` (IA desligada para o negócio) e `NO_TEXTUAL_MESSAGE` (última mensagem do cliente não é texto). Nenhuma delas pode virar lista vazia silenciosa nem erro genérico. As mesmas cinco passam a ser **listadas nominalmente** em `PUBLIC_API_V1.md`, fechando o resíduo do [review012](../reviews/012-review.md).

### 13. Limpeza e cobertura de lint

`src/mocks/data/conversations.ts` sai, junto com o que mais ficar sem consumidor vivo depois da decomposição — conferido por busca, não por suposição. O script de lint de `apps/frontend` passa a cobrir `tests` além de `src`, com `--max-warnings=0`, e o que ele acusar é corrigido no mesmo diff. Fecha o resíduo do [review016](../reviews/016-review.md). Nenhuma regra de lint é afrouxada para isso.

### 14. Provas

Suítes `goal017-*` em `apps/frontend/tests`, no padrão dos Goals 015 e 016, cobrindo no mínimo: invariante de shell por render (`ShellConfigProvider` mais as telas reais, falhando em `Maximum update depth` se a invariante quebrar), alcance de cada cenário pela rota que o serve, as três abas com `category` na requisição e a prioridade de handoff, override de categoria e ignorados, busca servida pelo backend, os seis estados de linguagem, mídia e transcrição nos quatro `transcriptStatus` e nas três recusas, estado de entrega nos quatro valores mais a ausência do campo, assunção no envio, as cinco recusas de sugestão, o painel de perfil por `customerId` com e sem vínculo, e acessibilidade com axe. Teste que passe sobre componente sem importador não prova fluxo entregue: o alcance pela rota é o critério.

Do lado do backend: a projeção de `customerId` provada em `apps/ai-orchestrator/tests/internal/`, com e sem `Contact.customerId`, e o teto próprio do proxy de mídia provado em `apps/bff/tests/` — que o caminho binário usa um teto diferente do JSON e que ele é maior que o download da IA.

Todo teste novo precisa ser sensível à mutação: remover o comportamento que ele descreve tem que fazê-lo falhar.

### 15. Documentação

`apps/bff/PUBLIC_API_V1.md` nos pontos dos itens 1 e 12, e nada mais. `docs/migration/CURRENT_STATE.md`, `GAP_ANALYSIS.md` (G-22, G-23, G-09 e G-31) e `REUSE_ANALYSIS.md` atualizados apenas onde este diff os fizer mentir. Nenhum documento de arquitetura é reescrito.

## Migração, compatibilidade e limites operacionais

- **Nenhuma migration de banco.** Nenhum schema Prisma muda: `Contact.customerId` já existe e só passa a ser projetado.
- **Compatibilidade aditiva.** `customerId` é opcional e nulável em todas as camadas; resposta anterior continua decodificando. Nada é removido do contrato público.
- **Envio de mídia pela profissional fica fora.** `POST /v1/conversations/:id/messages` aceita **só texto**, e o transporte expõe apenas `sendText` — habilitar envio de mídia seria contrato novo em três serviços e no adapter de transporte. A seção "Chat" do vault não o lista entre os elementos da tela. O [review013](../reviews/013-review.md) o dirigiu a este Goal; fica **declarado fora**, por falta de contrato e de especificação de produto, e volta como item próprio se o produto o pedir.
- **Estado de leitura fica fora**, pela mesma razão: `unreadCount` é zero literal na origem e criar leitura por usuário é persistência nova.
- **Retenção e expiração de conteúdo ficam no Goal022.** Se conteúdo expirado aparecer, a tela apenas não mente sobre ele; nada é purgado aqui.
- **Sem transporte real.** Nenhum WhatsApp real, nenhuma transcrição real, nenhum modelo real e nenhuma CI hospedada são exercitados. Toda prova é contra dublê ou contra PostgreSQL descartável.
- **Larguras em rota autenticada continuam fora.** O gate renderizado cobre só rotas públicas; estender o Playwright a rota autenticada exige dar sessão ao gate e continua sendo decisão de escopo própria, não tomada aqui.

## Testes e critérios de aceite

1. `customerId` nulável aparece no DTO de conversa da IA, no schema do cliente da IA no BFF e no `conversationSchema` do frontend, provado com vínculo e sem vínculo; resposta sem o campo continua decodificando.
2. O proxy de mídia do BFF usa teto próprio, configurável, maior que `EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT_MS`; as rotas JSON mantêm `INTERNAL_HTTP_TIMEOUT_MS`, provado por teste que distingue os dois caminhos.
3. `features/conversations/` é um conjunto de módulos com um despachante; `ProductConversationsScreen.tsx` como monolito de 964 linhas não existe mais.
4. A invariante do shell é provada **por render**: montar `ShellConfigProvider` com as telas reais não entra em laço, e o teste falha em `Maximum update depth` se a invariante for quebrada.
5. Cada cenário é alcançável pela rota que o serve; nenhum componente novo fica sem importador.
6. As três abas Comercial / Não classificadas / Pessoal enviam `category` ao BFF e a aba corrente é visível; a aba Pessoal declara que a IA está desativada naquela sessão.
7. Conversa em `Aguardando você` aparece priorizada no topo da aba Comercial.
8. Ignorados têm entrada própria por `ignored`; marcar e desmarcar funcionam e a copy diz que a IA não usa a conversa, não que ela foi apagada.
9. Override de categoria funciona nos três valores e em `null`; `categorySource` distingue decisão da profissional de classificação automática, e `suggestedCategory` é apresentada como sugestão, nunca aplicada sozinha.
10. A busca envia `search` ao BFF junto da aba corrente; "buscando", "sem resultado" e "aba vazia" são estados distintos.
11. Os seis estados de linguagem interna são derivados do contrato e apresentados com o vocabulário do vault; o componente automatizado é chamado de IA; `handoffReason` aparece quando existe.
12. Aba, contador e badge de não lidas não existem mais em tela; nenhuma asserção nova depende de `unreadCount`.
13. Autoria `CUSTOMER`, `AI` e `OWNER` é distinguível; o que a IA escreveu se apresenta como escrito pela IA.
14. Áudio com `transcriptStatus` `DONE`, `PENDING`, `FAILED` e `SKIPPED` é apresentado distintamente; `FAILED` nunca exibe texto no lugar da transcrição.
15. Imagem, documento e vídeo são exibidos sob demanda pelo proxy; `mediaAvailable: false` não oferece "ver mídia"; `tooLarge` aparece como metadado.
16. `MESSAGE_ATTACHMENT_NOT_FOUND`, `MEDIA_TOO_LARGE` e `MEDIA_UNAVAILABLE` têm copy própria, lida de `error.details.upstreamCode`.
17. `deliveryState` nos quatro valores é composto no balão; `UNKNOWN` se apresenta como não confirmado e **não** oferece reenviar; mensagem sem o campo não vira erro; mensagem recebida não exibe estado de entrega.
18. Resposta 202 do envio é apresentada como tentativa registrada e 201 como confirmação.
19. Abrir a conversa não muda estado; enviar assume, a tela avisa antes e reflete `Você atendendo` depois; `takeover`, `release` e `resolve` continuam alcançáveis, com "Retomar IA" explicando a reavaliação de contexto.
20. Sugestões só são oferecidas com atendimento humano vigente, até três, editáveis, e nenhuma é enviada sozinha.
21. As cinco recusas de sugestão têm copy própria e distinta, e nenhuma vira lista vazia silenciosa; as cinco estão listadas nominalmente em `PUBLIC_API_V1.md`.
22. O painel de perfil do contato liga por `customerId` quando há vínculo e, sem vínculo, diz que o contato não é cliente cadastrado, sem casar por telefone.
23. `src/mocks/data/conversations.ts` saiu, e nada que a decomposição deixou órfão continua no repositório.
24. `npm run lint` em `apps/frontend` cobre `src` e `tests` com `--max-warnings=0` e sai limpo, sem regra afrouxada.
25. Suíte de acessibilidade com axe verde nas telas novas em jsdom.
26. `npx tsc --noEmit` limpo em `apps/frontend` e em `apps/bff`.
27. `npm run validate:core` exit 0, com os skips já declarados do Goal002 e nenhum novo.
28. `npm run validate:ui` exit 0 — continua cobrindo apenas as rotas públicas, e **nenhum critério deste Goal declara largura, contraste, foco ou estado de tela autenticada como provado por teste**.
29. `git diff --check` exit 0.

Fidelidade visual à referência aprovada **não** é provada por teste nenhum e continua sendo conferência humana.

## Entrega

Diff sobre a baseline aceita, com relatório do que foi entregue, o que foi provado e como, e o que ficou fora com o motivo. Nenhum commit, merge ou deploy é feito pelo executor. Componente sem importador conta como não entregue. Gate vermelho não é entrega: se um passo determinístico falhar, isso vai no relatório com o output, não é omitido.
