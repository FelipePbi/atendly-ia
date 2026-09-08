# Goal 005 — Contatos, sessão e controle humano

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-08 pelo Tech Lead Agent após [Goal004 ACCEPTED](../reviews/004-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

## Baseline aceita

Baseline aceita: `ecaf7058f2b81ffe4bd4d2966e233b4b58c16dd5`

Goal anterior: 004 — Transporte e mensagens duráveis

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal004 já integrado em `main` (origem `fd996f729845872daf6a4c6b01f5d9d5724d7953`), incluindo implementação das duas rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Tirar do LLM e do JSON do agente a política de contato, sessão e controle humano, tornando-a persistida e determinística: as três organizações da inbox (Comercial, Não classificadas, Pessoal) com override manual, Contato ignorado absoluto, sessão de aproximadamente 24 h, inbox que persiste mesmo com IA desligada, pausada ou humano atendendo, e envio humano que assume a sessão antes de qualquer resposta automática concorrente. Fechar G-07, G-08 e G-22 e a parte de conversa de G-06, sobre o transporte durável já aceito no Goal004. Este Goal é pré-requisito de clientes como pessoas (006) e do assistente (011): nenhum consumer novo deve ser construído sobre a classificação técnica atual.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), seção "Conversas, IA, memória e mídia"; D-009 (PROPOSED, a implementar aqui), D-011, D-020 em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e API pública vigente; sem novo serviço, broker ou biblioteca. Não repetir discovery global.

## Dependências e contexto mínimo

- Goal004 ACCEPTED e integrado. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler AGENTS global e dos apps tocados. Consultar seletivamente no Product Vault apenas: [WhatsApp](../../product-vault/01-Regras/05-WhatsApp.md) — "Inbox", "Classificação", "Contatos ignorados", "Grupos", "Conversa pessoal", "Mensagem ambígua", "Profissional responde pelo WhatsApp", "Profissional responde pela Atendly" e "Troca entre humano e IA"; [Handoff e atendimento humano](../../product-vault/02-Fluxos/04-Handoff-e-Atendimento-Humano.md) — "Estado", "Abrir x assumir", "Onde responder", "Retomar IA" e "Transparência para cliente"; [IA e conversas](../../product-vault/01-Regras/03-IA-e-Conversas.md) — "Conversa ativa" (contexto ativo de aproximadamente 24 h) e "Cliente desaparece". Não abrir o vault inteiro; "Sugestões da IA" é do Goal012.
- [CURRENT_STATE](../CURRENT_STATE.md): "AI Orchestrator e conversas" e os deltas dos Goals 003 e 004. [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-06 (resto), G-07, G-08, G-22. [DATA_MIGRATION](../DATA_MIGRATION.md): seção 9, linha "Conversation única por contato, state JSON", e seção 10. [Review004](../reviews/004-review.md): observações 1 e 2.
- Fatos já confirmados, sem precisar redescobrir: `operationalGuard` em `message-graph.ts` devolve `bot_disabled`, `paused_conversation` ou `channel_disconnected` **antes** de `recordInbound`, então a mensagem do cliente não é persistida nesses casos; mensagem `fromMe` do dono cai em `handleOwnerActivity`, que só registra OWNER (`recordManualOutboundText`) — apenas os comandos `/ia_pause`, `/bot on` e `/bot off` pausam ou retomam; a pausa é `Conversation.humanHandoff` + `handoffPausedUntil` no `HandoffService`, com retomada automática por relógio em `isBotPaused` e `BOT_OFF_PAUSE_UNTIL` como "indefinido"; `POST /internal/conversations/:id/messages` exige `humanHandoff` prévio (`HUMAN_HANDOFF_REQUIRED`) em vez de assumir ao enviar; `release` zera `humanHandoff` e resolve handoffs abertos; a classificação (`potential_customer`, `supplier_or_partner`, `personal_contact`, `unknown`) vive no JSON do agente em `assistant.service.ts` e não existe Contact, Session, categoria persistida nem lista de ignorados no schema; grupos já são filtrados por `EVOLUTION_IGNORE_GROUPS`; a inbox durável do 004 grava todo evento antes do ACK e a resposta ainda não enviada pode ser cancelada por supersede.
- Usar Graphify apenas para confirmar callers de `HandoffService`, `operationalGuard`/`handleOwnerActivity`, `ContactClassification`, das rotas `takeover`/`release`/`resolve` e de `conversationDto`. Não reconstruir o grafo, percorrer domínios não envolvidos nem reabrir aceites de 001–004.

## Pontos de implementação

- IA: `prisma/schema.prisma` e migrations novas (Contact, Session ou campos equivalentes em Conversation, categoria e override); `src/modules/graph/message-graph.ts` (guard, `handleOwnerActivity`, `recordInbound`, gates antes de tool e de envio); `src/modules/handoff/HandoffService.ts`; `src/modules/assistant/assistant.service.ts` (classificação como sugestão, nunca como override); `src/modules/graph/graph-runtime.ts`; `src/modules/internal/routes.ts` (categoria/override, ignorar contato, retomar, filtros de lista e DTOs); `src/modules/inbox/inbox-policy.ts` (refino da espera ambígua).
- BFF: `src/modules/conversations/routes.ts` e `src/clients/ai-orchestrator/index.ts` (contratos por operação, D-011); `apps/bff/PUBLIC_API_V1.md`.
- Frontend: `apps/frontend/src/data/mappers/publicApiSchemas.ts` e `data/services/BffConversationService.ts` apenas para aceitar campos e operações novas; sem tela nova — a inbox em três abas é do Goal017.
- Resíduos do Goal004, pequenos e no mesmo diff: heartbeat ou renovação do lease da inbox durante a execução (ou lease maior que o orçamento de LLM+tools+envio, com justificativa), e a espera ambígua estendida até o teto quando os fragmentos seguintes continuam ambíguos.

## Escopo obrigatório

### 1. Contato, sessão e categoria persistidos

Persistir, no banco da IA, o Contato do canal (tenant, canal, ID externo, perfil predominante, `ignored` com data e origem) e a Sessão de conversa (início, última interação do contato, expiração em torno de 24 h sem interação do contato, categoria vigente, override manual com autor e data, estado de atendimento humano). A categoria é atributo da sessão — Comercial, Não classificadas ou Pessoal — e o override manual prevalece sobre qualquer classificação automática; a classificação do agente passa a ser sugestão gravada com proveniência, nunca escrita como override. Contato ignorado é regra do contato e prevalece sobre a sessão. Nova sessão após a expiração pode reavaliar a intenção, exceto para contato ignorado. Valores exatos de fronteira e inatividade são configuráveis e testados; não alterar o relógio de sessão silenciosamente (D-009).

Não construir memória estruturada, notas, tags ou identidade de pessoa: pertencem aos Goals 006 e 012.

### 2. Inbox independente do processamento

Toda mensagem permitida do cliente é persistida em `Message` antes de qualquer decisão de IA — inclusive com IA desligada, canal em handoff, sessão pessoal ou contato ignorado — sem que `operationalGuard` encerre antes de `recordInbound`. Conteúdo de contato ignorado e de sessão pessoal não passa por classificação, transcrição, modelo, RAG, embedding nem memória; mensagens de grupo continuam fora do processamento. A lista de conversas do BFF continua mostrando essas conversas.

### 3. Controle humano determinístico

Qualquer mensagem manual do profissional — pelo WhatsApp (`fromMe` que não é saída do bot) ou pela Atendly — assume a sessão atomicamente: marca atendimento humano, cancela a resposta automática ainda não enviada (supersede do Goal004) e muda o estado para "Você atendendo"; comandos `/ia_pause`, `/bot on` e `/bot off` continuam funcionando. `POST /v1/conversations/:id/messages` deixa de exigir takeover prévio: enviar assume. Abrir ou ler a conversa (`GET`) não altera estado. Durante a sessão, a IA só volta por `Retomar IA` explícito (`release`), que reavalia o contexto atual em vez de continuar do ponto anterior; a retomada automática por relógio (`handoffPausedUntil`) só vale como expiração da sessão, não como retorno silencioso dentro dela. Guards determinísticos antes de executar tool com efeito e antes de enviar comparam versão de entrada, controle humano, elegibilidade global, categoria e ignore. Nenhuma mensagem automática anuncia troca entre IA e humano.

### 4. Contratos por operação

Rotas internas e públicas para: definir ou limpar o override de categoria; marcar e desmarcar contato ignorado; retomar a IA; listar conversas filtrando por categoria e estado de atendimento; DTO de conversa expondo categoria vigente, origem (automática ou manual), estado de atendimento, sessão vigente e `ignored` do contato. BFF resolve tenant pela sessão autenticada e exige CSRF nas mutações por cookie, como nas demais rotas; frontend aceita os campos e operações novas sem redesenho. Documentar em `PUBLIC_API_V1.md`.

### 5. Resíduos do Goal004

Renovar o lease da inbox durante a execução (heartbeat) ou dimensioná-lo acima do orçamento de processamento, com teste de que um lote longo não é reivindicado por outro ciclo; estender a espera ambígua quando os fragmentos seguintes continuam ambíguos, até o teto `AI_AMBIGUOUS_MAX_WAIT_SECONDS`, com teste de política.

## Migração, compatibilidade e limites operacionais

- Antes de backfill, inventariar (M0) `Conversation` e `Handoff` com contagens sanitizadas: conversas com `humanHandoff`, com `handoffPausedUntil` indefinido, com `state` JSON contendo classificação, e distribuição de datas de última mensagem. Não presumir produção vazia nem permissão para alterar banco implantado; ensaiar em bancos descartáveis pelos gates existentes.
- Migrations novas e aditivas; não reescrever migrations aplicadas, rodar reset em URL herdada nem executar migration durante build. Backfill conservador e retomável: Contato criado a partir de `externalContactId` preservando o ID externo; sessão histórica derivada dos timestamps das mensagens com proveniência, sem inferir certeza; classificação técnica do JSON vira sugestão, nunca override manual; contato nasce não ignorado; `humanHandoff` vigente vira atendimento humano da sessão corrente e `BOT_OFF_PAUSE_UNTIL` vira pausa explícita, sem retomada automática inventada. Dados ambíguos ficam em pendência segura.
- Ordem de troca: (1) schema expandido e leitores compatíveis; (2) guard persistindo a inbox antes de decidir; (3) política de sessão/categoria/ignore ativa; (4) contratos novos no BFF/frontend com campos opcionais. Contexto antigo não retoma tool pendente automaticamente após a troca de sessão; pedir reconfirmação segura.
- Reversão segura: binário anterior ignora colunas novas; nenhuma mensagem persistida é apagada; override manual e ignore não podem ser desfeitos por rollback.
- Sem WhatsApp real, deploy, credenciais reais em fixtures, commits pelo executor, push/merge/PR ou alteração de provider/framework. O commit de fechamento é do IA Loop após o ACCEPTED do Tech Lead (D-017/D-018). Se surgir evidência de exposição ativa ou necessidade de mudar fronteiras, registrar evidência e devolver a decisão ao Tech Lead.

## Testes e critérios de aceite

1. Dois tenants em fixture real: categoria, override, ignore e estado de atendimento de A não aparecem nem mudam em B; tenant não selecionável por header/body/query.
2. Inbox: mensagem do cliente é persistida com IA desligada, em handoff, em sessão pessoal e de contato ignorado; conteúdo ignorado ou pessoal não chega a classificação, modelo, RAG, embedding nem memória (asserção por dublê que falha se chamado); grupo não é processado.
3. Controle humano: mensagem manual do dono via WhatsApp assume a sessão e cancela a resposta pendente; envio pela Atendly assume sem takeover prévio; `GET` não altera estado; `Retomar IA` reavalia o contexto; sem retomada silenciosa dentro da sessão; nova sessão após a expiração volta à IA quando elegível e nunca para contato ignorado; nenhuma mensagem automática anuncia a troca.
4. Sessão e categoria: expiração por inatividade do contato testada nos limites configurados; override manual prevalece sobre sugestão automática e persiste entre sessões conforme a regra; sessão pessoal desliga a IA só naquela sessão; reavaliação em sessão nova.
5. Contratos: rotas novas do BFF com CSRF e tenant da sessão; DTO e schemas do frontend compatíveis com respostas antigas e novas; `PUBLIC_API_V1.md` atualizado.
6. Ensaio das migrations em base nova e fixture legada (conversas em handoff, pausa indefinida, `state` com classificação, mensagens antigas); contagens reconciliadas; retomada sem duplicação; nenhum segredo no output.
7. Resíduos do 004: lote longo mantém o lease (ou lease dimensionado) sem reivindicação concorrente; espera ambígua estendida com fragmentos igualmente ambíguos até o teto.
8. `npm run validate:core`, `npm run validate:integration` e `git diff --check` passam; novas suítes incorporadas ao gate apropriado, sem fazer core depender de banco pessoal e sem pular testes de política ou persistência; skips explícitos do 002 mantidos.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo, migrations/compatibilidade, RED/GREEN dos casos negativos (mensagem ignorada chegando ao modelo, envio manual sem assumir, retomada silenciosa, inbox perdida com IA desligada), comandos/resultados e limitações. Atualizar somente contratos/docs afetados e registrar G-06 (resto), G-07, G-08 e G-22 conforme evidência, sem alegar fechamento de outros domínios. Goal005 termina IMPLEMENTED/REVIEW_REQUIRED até review do Tech Lead.

O review de 005 deve usar profundidade **DEEP dirigido** — privacidade, persistência e concorrência entre humano e IA — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão. Goal006 permanece condicionado ao aceite005 e ao commit de fechamento005 cujo SHA será sua baseline aceita. Não gerar prompts de 006 ou posteriores.
