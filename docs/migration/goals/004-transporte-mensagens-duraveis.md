# Goal 004 — Transporte e mensagens duráveis

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-07 pelo Tech Lead Agent após [Goal003 ACCEPTED](../reviews/003-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

## Baseline aceita

Baseline aceita: `588b70f575670eeda015750b400a09752ceb5490`

Goal anterior: 003 — Tenant, sessão e vínculo WhatsApp

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal003 já integrado em `main` (origem `869fd4b50c4986a8c70d42c505f448c46690d136`), incluindo implementação das duas rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Remover a perda de mensagens e a incerteza de efeito no transporte: ACK antes de persistir, dedupe que não distingue "recebido" de "concluído", buffers de fragmentos em memória e envio cujo resultado é apagado ou presumido. Fechar G-05 e G-09, a parte de transporte de G-06 e o restante de G-04 no produtor Go, sobre a confiança e o ownership já aceitos no Goal003. Este é o primeiro Goal que amplia a persistência do transporte; o gate G-35 exigido para isso está satisfeito ([review003](../reviews/003-review.md)).

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), seção "Recebimento, entrega e jobs" (semântica de confiabilidade e alternativas); D-007 (PROPOSED, a implementar aqui), D-011, D-019 em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e API pública vigente; jobs no PostgreSQL do próprio dono, sem broker novo, sem serviço novo e sem biblioteca de fila aprovada — se uma for necessária, registrar decisão antes de adotá-la. Não repetir discovery global.

## Dependências e contexto mínimo

- Goal003 ACCEPTED e integrado. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler AGENTS global e dos apps tocados. Consultar seletivamente no Product Vault apenas: [WhatsApp](../../product-vault/01-Regras/05-WhatsApp.md) — "Mensagem ambígua", "Profissional responde pelo WhatsApp" e "Profissional responde pela Atendly" — e [Lembretes, Notificações e Instabilidade](../../product-vault/01-Regras/07-Lembretes-Notificacoes-e-Instabilidade.md) — "Instabilidade da IA" e "Falha transacional". Não abrir o vault inteiro.
- [CURRENT_STATE](../CURRENT_STATE.md): "AI Orchestrator e conversas", "WhatsApp / Evolution Go" e o delta do Goal003. [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-04 (resto), G-05, G-06, G-09. [DATA_MIGRATION](../DATA_MIGRATION.md): seção 9, linhas Message/ProcessedEvent e Go, e gates M0–M3. [Review003](../reviews/003-review.md): observações não bloqueantes 1–8.
- Fatos já confirmados, sem precisar redescobrir: o webhook da IA responde 202 antes de `handleInboundMessage`; `IdempotencyStore.remember` cria `ProcessedEvent` com dedupe único `(tenantId, provider, eventKey)`, sem estado de execução; o buffer de fragmentos é `Map` por processor, criado a cada request; `sendResponse`/`markOutboundMessageSent` marcam o outbound sem estado de entrega; o envio do dono em `internal/routes.ts` apaga a mensagem pendente quando `sendText` falha, inclusive por timeout; a IA não consome os eventos `Receipt` (Delivered/Read) que o Go já emite, e o mapper responde 400 a qualquer evento fora do conjunto de mensagens; o produtor Go trata todo não-2xx como erro e repete cinco vezes com 30s, em goroutine sem persistência, logando a URL completa com o token de query; `whatsmeow.go` ainda inclui `instanceToken` no payload em cinco pontos, e o consumer da IA já o descarta desde o Goal003.
- Usar Graphify apenas para confirmar callers de `IdempotencyStore`, `InboundMessageProcessor`, `MessageGraphWorkflow.sendResponse`, `EvolutionProvider.sendText` e do webhook producer do Go. Não reconstruir o grafo, percorrer domínios não envolvidos nem reabrir aceites de 001–003.

## Pontos de implementação

- IA: `src/modules/channel/routes/evolutionWebhook.routes.ts`, `src/modules/channel/InboundMessageProcessor.ts`, `src/modules/idempotency/IdempotencyStore.ts`, `src/modules/graph/message-graph.ts` (`sendResponse`, `markOutboundMessageSent`), `src/modules/internal/routes.ts` (envio do dono), `src/modules/channel/adapters/evolution/EvolutionInboundMapper.ts` (eventos `Receipt` e demais eventos técnicos), `prisma/schema.prisma` e migrations novas, e um loop de processamento no próprio processo da IA.
- Evolution Go: `pkg/events/webhook/webhook_producer.go`, `pkg/whatsmeow/service/whatsmeow.go` (montagem de `postMap` e recibos), persistência do outbox técnico via `AutoMigrate`; documentação de eventos/webhook e Swagger só onde o contrato mudar.
- BFF, contratos e frontend: DTO de mensagem com estado de entrega, por operação (D-011): `apps/bff/src/clients/ai-orchestrator/index.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/frontend/src/data/mappers/publicApiSchemas.ts` aceitando o campo como opcional. Sem UI nova: a composição do chat é do Goal017.
- Resíduos do Goal003, pequenos e no mesmo diff: `resolveLinkState` passa a exigir `tenantId` nulo para classificar `pending` (caso contrário `divergent`); `@@index([credentialVersion])` declarado em `ChannelConnection` para alinhar schema e migration da IA; `INTERNAL_SERVICE_TOKEN` sem duplicata em `apps/ai-orchestrator/.env.example`; `projectChannelCredential` registra código/status do erro no `warn`.

## Escopo obrigatório

### 1. Inbox durável antes do ACK (IA)

Persistir o evento saneado com chave única `(tenantId, provider, eventKey)` **antes** de responder 202. Duplicata devolve ACK sem novo efeito; falha ao persistir devolve 5xx para o produtor retentar; nunca ACK sem linha gravada. O raw persistido continua sem token/apikey/authorization.

Evoluir `ProcessedEvent` por expansão (ou criar a entidade de inbox referenciando-o) com estado de execução (`received`, `processing`, `done`, `failed`, `ignored`), tentativas, próxima tentativa, lease (dono e expiração), resultado e erro sanitizado. Claim em transação com `FOR UPDATE SKIP LOCKED` ou equivalente, com fencing pelo lease; só lease expirado pode ser recuperado; retry com backoff limitado; dead-letter visível como atenção, sem reenvio em massa. Dedupe antigo é prova de recebimento, não de conclusão: linhas legadas de `ProcessedEvent` ficam marcadas como legadas e **não** são reprocessadas automaticamente.

Eventos que não são mensagem (`Receipt`, `Presence`, `Connected`, `QRCode`, `LoggedOut` etc.) passam a receber ACK 2xx e a ser registrados ou descartados por tipo, em vez de 400 seguido de cinco retries no produtor. `Receipt` alimenta a reconciliação de entrega do item 3.

### 2. Serialização por conversa e fragmentos sobre trabalho persistido

Processar os eventos de uma mesma conversa em ordem e um de cada vez, por lease de conversa, e conversas distintas em paralelo. A janela de fragmentos (2–3 s) e a espera de mensagem ambígua (aproximadamente 2 min, até cerca de 5 min desde a primeira) passam a operar sobre o inbox persistido: o claim agrupa os pendentes da conversa dentro da janela, e mensagem nova chegando durante uma execução reavalia ou cancela a resposta ainda não enviada quando possível. O `Map` em memória deixa de ser fonte de verdade; pode continuar como gatilho local sobre trabalho persistido. Queda entre o ACK e a resposta retoma exatamente uma vez após restart.

Não reimplementar classificação, categoria, Contact ignorado, sessão de 24h nem a política de takeover — pertencem ao Goal005. Preservar guards existentes de IA desligada e handoff; a persistência da mensagem permitida na inbox independe do processamento de IA.

### 3. Outbox e estado de entrega

Toda saída — resposta da IA e envio do dono — é persistida antes de chamar o transporte, com operation-id estável (`correlationId`) e estados `pending`, `sent`, `failed` e `unknown`. Timeout ou erro de rede após o envio vira `unknown`, nunca exclusão da tentativa: remover o `prisma.message.delete` do envio do dono. Retry automático apenas quando a falha comprovadamente ocorreu antes do envio; `unknown` só muda por reconciliação — ID externo devolvido pelo transporte ou recibo `Delivered`/`Read` vindo do Go — e é apresentado como incerto até lá. Não prometer exactly-once: entrega é at-least-once com dedupe/reconciliação.

O envio do dono devolve o estado real; o BFF expõe esse estado no DTO por operação e o frontend aceita o campo como opcional, sem redesenho de tela. A resposta gerada durante a janela de transição do Goal003 (credencial ainda não projetada) fica `failed` com motivo explícito e visível, em vez de se perder.

### 4. Evolution Go: segredos fora do produtor e entrega técnica durável

Remover `instanceToken` do payload de todos os eventos — o consumer compatível já está ativo desde o Goal003 — e deixar de registrar a URL com token de query nos logs do produtor (redigir a query ou logar só host/caminho). Preservar `instanceId`/`instanceName` e os IDs do transporte.

Persistir a tentativa de webhook (evento, destino redigido, tentativas, próxima tentativa, estado) **antes** da goroutine de HTTP, no banco já configurado do Evolution, via `AutoMigrate` aditivo; retomar pendentes no boot; retry limitado com backoff; 2xx conclui; distinguir 4xx definitivo de 5xx/timeout. Não bloquear o loop de eventos do whatsmeow nem mover regra de produto para o Go. Operação administrativa continua sob credencial admin; token de instância não alcança o outbox alheio.

## Migração, compatibilidade e limites operacionais

- Antes de backfill/corte, inventariar (M0) `ProcessedEvent`, `Message` OUTBOUND e a persistência opcional do Go com contagens sanitizadas. Não presumir produção vazia nem permissão para alterar banco implantado; ensaiar em bancos descartáveis pelos gates existentes.
- Migrations novas e aditivas; não reescrever migrations aplicadas, rodar reset em URL herdada nem executar migration durante build. Backfill conservador e retomável: mensagens OUTBOUND existentes recebem estado `unknown`/legado — nunca `sent` inventado; `ProcessedEvent` legado vira concluído-legado sem reprocessamento. Dados ambíguos ficam em pendência segura.
- Ordem de troca: (1) IA aceita eventos técnicos com 2xx e persiste antes do ACK; (2) Go persiste tentativas e deixa de enviar `instanceToken`; (3) outbox/reconciliação ativa; (4) DTO com estado exposto ao BFF/frontend com campo opcional. Nenhum evento se perde na transição; consumer compatível antes de retirar campo do produtor.
- Reversão segura: binário anterior ignora colunas novas; outbox não reenvia por rollback; não reintroduzir ACK antes de persistir nem `delete` de tentativa como estratégia.
- Capacidade de execução contínua do worker é gate posterior de operação: não contratar infraestrutura, provider ou broker; registrar a dependência no relatório.
- Sem WhatsApp real, deploy, credenciais reais em fixtures, commits pelo executor, push/merge/PR ou alteração de provider/framework. O commit de fechamento é do IA Loop após o ACCEPTED do Tech Lead (D-017/D-018). Se surgir evidência de exposição ativa ou necessidade de mudar fronteiras, registrar evidência e devolver a decisão ao Tech Lead.

## Testes e critérios de aceite

1. Inbox: evento gravado antes do 202 (prova por falha injetada de persistência devolvendo 5xx e nada processado); duplicata devolve 202 sem novo efeito; queda simulada entre ACK e processamento retoma exatamente uma vez após restart; lease vivo não é roubado e lease expirado é recuperado; dead-letter após o limite, sem reenvio em massa; raw persistido sem segredo sintético.
2. Serialização: dois eventos concorrentes da mesma conversa executam um por vez e em ordem; conversas distintas em paralelo; fragmentos dentro da janela são agrupados; mensagem nova cancela ou reavalia resposta pendente; nenhum teste depende do `Map` em memória como fonte de verdade.
3. Outbox: sucesso vira `sent` com ID externo; timeout vira `unknown` e a tentativa permanece; recibo `Delivered`/`Read` reconcilia; falha antes do envio vira `failed` com retry limitado; envio do dono devolve estado real e não apaga a mensagem; DTO do BFF e schema do frontend compatíveis; fixture de replay antigo continua legível.
4. Go: payload sem `instanceToken` em todos os eventos; logs sem token; tentativa persistida antes da goroutine; restart com pendente reenvia; 2xx conclui; 4xx definitivo e 5xx/timeout classificados; suítes de autorização (001) e ownership (003) preservadas.
5. Resíduos do 003: `resolveLinkState` classifica como `divergent` linha do usuário com `tenantId` de outro negócio (teste de integração); `prisma migrate diff` da IA sem drift quando pgvector estiver disponível, ou justificativa registrada; `.env.example` e `warn` corrigidos.
6. Ensaio das migrations em base nova e fixture legada (`ProcessedEvent` e OUTBOUND sem estado); contagens reconciliadas; retomada sem duplicação; nenhum segredo no output.
7. `npm run validate:core`, `npm run validate:integration` e `git diff --check` passam; novas suítes incorporadas ao gate apropriado, sem fazer core depender de banco pessoal e sem pular testes de persistência/concorrência; skips explícitos do 002 mantidos.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo, migrations/compatibilidade, RED/GREEN dos casos negativos (queda pós-ACK, timeout de envio, lease concorrente), comandos/resultados e limitações. Atualizar somente contratos/docs afetados e registrar G-04 (resto), G-05, G-06 (transporte) e G-09 conforme evidência, sem alegar fechamento de outros domínios. Goal004 termina IMPLEMENTED/REVIEW_REQUIRED até review do Tech Lead.

O review de 004 deve usar profundidade **DEEP dirigido** — persistência, concorrência e efeitos externos — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão. Goal005 permanece condicionado ao aceite004 e ao commit de fechamento004 cujo SHA será sua baseline aceita. Não gerar prompts de 005 ou posteriores.
