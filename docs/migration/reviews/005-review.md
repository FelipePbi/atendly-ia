# Review formal — Goal 005

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-08, em review **DEEP dirigido** — privacidade, persistência e concorrência entre humano e IA — conforme o [Goal005](../goals/005-contatos-sessao-controle-humano.md). Aceite restrito ao diff identificado abaixo; não representa commit, deploy, merge, execução hospedada de CI nem WhatsApp real.

A rodada 1 é histórica: CHANGES_REQUIRED com dois blockers, ambos fechados na rodada 2. Nenhum aceite anterior (001–004) foi reavaliado.

## Escopo e identidade do diff

- Baseline aceita vigente: `ecaf7058f2b81ffe4bd4d2966e233b4b58c16dd5` (fechamento004). Base imediata da implementação: `8551717940a58128a2af4c40cffeb977334860a5`, HEAD da worktree `.ai-worktrees/goal-005`, inalterado nas duas rodadas. O conteúdo entre a baseline aceita e `8551717` é documentação de planejamento do IA Loop, preservado.
- Snapshot aceito, calculado pelo IA Loop: **41 arquivos** (27 rastreados modificados, +1365/−123, e 14 novos), hash do diff `f0b7fb1628aa71263b12569b3c7042927dd44bdbec587a6357c4d04ebac51ffc`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Inspecionados: patch completo de cada rodada e todos os arquivos novos; callers diretos — `HandoffService` (`isBotPaused`, `resumeBot`, `isBotOutboundMessage`), `operationalGuard`/`handleOwnerActivity`/`sessionGate`/`executeTool`/`sendResponse` em `message-graph.ts`, `recordInboundText` e `handleBufferedText` no `AssistantService`, as rotas internas de conversa e o mapa de escopos, o client e as rotas do BFF, os schemas do frontend, o ensaio de migration e todas as suítes. O caminho JSON `aiConversation.classification` usado pelo backfill foi conferido no `assistant.service.ts`. Graphify não foi usado.
- Nenhum arquivo foi editado pelo reviewer nas rodadas. Bancos usados nas reproduções foram descartáveis, criados e parados pelo próprio reviewer.

## Rodada 1 — CHANGES_REQUIRED, 2026-09-08

Verificado como sólido já na primeira rodada e mantido na segunda:

- **Persistência:** `Contact` (identidade externa por tenant e canal, `ignored` com autor/origem/data, `aiPaused` com motivo, override manual de categoria) e `ConversationSession` (início, última interação do contato, expiração, categoria vigente com origem, sugestão do agente com proveniência, atendimento humano com origem e autor, `contextResetAt`, `inboundVersion`), ambos com unicidade e FKs compostas por tenant; `Conversation.contactId` opcional.
- **Política pura (`session-policy.ts`):** expiração pela inatividade do contato no limite configurado (`AI_SESSION_INACTIVITY_SECONDS`, 86400); override manual > sugestão > Não classificadas; tradução da classificação técnica sem inventar Comercial; ordem de elegibilidade ignorado → pessoal → canal → IA desligada → pausa do contato → atendimento humano; guard de execução comparando a versão de entrada.
- **Grafo:** `loadSession` antes de `operationalGuard`; o guard só anota a decisão e `sessionGate` encerra **depois** de `recordInbound`, então a mensagem do cliente é persistida com IA desligada, canal desconectado, handoff, sessão pessoal e contato ignorado, e o conteúdo bloqueado não chega a `understandMessage`, RAG, modelo nem memória (`recordInboundText` faz apenas upsert da conversa e create da mensagem); guard determinístico antes de tool com efeito e antes de enviar; mensagem manual do dono pelo WhatsApp assume a sessão e pede supersede; comandos `/ia_pause`, `/bot off` e `/bot on` preservados e gravando a pausa no contato.
- **Contratos:** `PUT /internal/conversations/:id/category` e `/ignore` sob `conversations:write`, `release` como Retomar IA, `takeover` e envio do dono assumindo a sessão (o `409 HUMAN_HANDOFF_REQUIRED` saiu), filtros `category`/`handling`/`ignored` e DTO aditivo; BFF com tenant da sessão e CSRF por cookie; frontend aceitando campos e operações novas sem tela; `PUBLIC_API_V1.md` atualizado.
- **Migration:** aditiva e retomável; backfill conservador — Contato por ID externo, sessão derivada dos timestamps das mensagens, pausa indefinida em `Contact.aiPaused`, classificação do JSON como sugestão `legacy_agent_state`, pausa já vencida em pendência segura; nenhum `ignored` nem override inventado.
- **Resíduos do Goal004:** `renewLease` com fencing e heartbeat no worker (`INBOX_LEASE_HEARTBEAT_SECONDS`, 30); espera ambígua estendida enquanto os fragmentos seguintes forem saudação, até o teto.

Evidência reproduzida na rodada 1: `validate:integration` 11/11 em cluster próprio (ensaio 005 com 6 conversas, 3 em handoff, 2 pausas indefinidas, 3 classificações → 6 contatos, 0 ignorados, 0 overrides, 2 pausas explícitas; 34 testes de persistência da IA), `validate:core` 13/13, lint e `tsc` limpos na IA, no BFF e no frontend, `git diff --check` exit0.

### R1-01 — P1: a IA não voltava em sessão nova depois de atendimento humano

`assumeHumanControl` gravava o espelho legado `Conversation.humanHandoff` sem relógio e a rota `takeover` gravava `handoffPausedUntil` no ano 9999; `HandoffService.isBotPaused` devolvia pausa nesses casos antes de consultar a sessão. Após a rotação por inatividade o `operationalGuard` continuava em `human_takeover`, para sempre, contrariando o critério 3 do Goal. O teste existente provava só o `SessionService`.

### R1-02 — P2: `/bot on` não devolvia a conversa à IA

O comando limpava a pausa do contato sem liberar `humanHandling` da sessão; depois de qualquer resposta manual do dono, a IA continuava bloqueada.

## Rodada 2 — ACCEPTED, 2026-09-08

### R1-01 — CLOSED

`SessionService.resolveContext` chama `syncLegacyPauseMirror` ao criar a sessão nova: zera `humanHandoff`, `status` e `handoffPausedUntil` da conversa apenas quando o contato não está `aiPaused` nem `ignored`, então a rotação devolve a IA no guard do grafo (`loadSession` roda antes de `operationalGuard`) enquanto `/bot off`, `/ia_pause` e contato ignorado sobrevivem à troca de sessão. A rota `takeover` deixou de gravar o relógio 9999; o atendimento humano dentro da sessão é persistido por `assumeHumanControl`. `isBotPaused` não foi alterado: a decisão ficou onde contato e sessão são conhecidos.

### R1-02 — CLOSED

O ramo `/bot on` chama `releaseSessionToAi`, que usa o mesmo `releaseToAi` de Retomar IA (`humanHandling` false, `contextResetAt`, reset do rascunho pendente e limpeza da pausa do contato), com fallback para limpar a pausa quando não há sessão vigente.

Cobertura dos dois fechamentos, em cinco cenários: resposta manual pelo WhatsApp → sessão expira → IA responde; takeover pelo painel → idem; `/bot off` → segue pausado; contato ignorado → segue ignorado com a mensagem persistida; resposta manual seguida de `/bot on` → IA responde. Os cenários existem em `tests/session/human-control-across-sessions.test.ts` (core, sobre Prisma em memória) e em `tests/integration/human-control-graph.test.ts` com `HandoffService`, `SessionService` e grafo reais contra PostgreSQL. O executor não conseguiu executar a suíte de integração por falta de banco descartável no ambiente dele; o reviewer a executou.

### Evidência reproduzida pelo reviewer na rodada 2

Ambiente: Windows 11, PostgreSQL 18 descartável criado pelo reviewer. Uma primeira execução do gate falhou em `test:ai-orchestrator-transport-durability` com `Server has closed the connection` quando o cluster local caiu com o erro 487 de reserva de memória compartilhada do Windows — o mesmo defeito que já derrubara clusters do executor em Goals anteriores; a reexecução em cluster novo (`127.0.0.1:55440`, parado ao final) passou integralmente, e a falha não é atribuível ao código.

| Execução | Resultado |
| --- | --- |
| `npm run validate:core` | **PASSED — 13 passed, 0 failed, 4 skipped** (`test:bff`, `test:scheduling-service`, `test:contracts`, `test:health-worker`). IA 21 arquivos/167 testes (39 pulados por exigirem banco); frontend 10 |
| `BFF_TEST_DATABASE_URL=postgresql://pgtest@127.0.0.1:55440/atendly_bff_test npm run validate:integration` | **PASSED — 11/11**: BFF; ensaios 003, 004 e 005; ownership e outbox do Go; client Prisma da IA; **39 testes** de integração da IA em 4 arquivos, incluindo os cinco cenários de controle humano entre sessões |
| `eslint --max-warnings=0` na IA e no BFF; `tsc --noEmit` na IA | exit0 |
| `git diff --check` | exit0 |

### Observações não bloqueantes

1. Handoffs `OPEN` remanescentes não são resolvidos na rotação de sessão, embora a conversa saia de `HUMAN_HANDOFF`.
2. Mensagens não textuais do contato não renovam a sessão nem avançam a versão de entrada.
3. Uma sessão aberta por conversa é garantida por código (transação e fechamento da anterior), não por índice único parcial.
4. Retomar IA e `/bot on` também limpam a pausa explícita do contato (`/bot off`); decisão aceitável, documentada em D-021.
5. Sessões expiradas só são fechadas na próxima interação; filtros por categoria e atendimento podem ler uma sessão vencida.
6. O Prisma em memória de `tests/session/support/fake-prisma.ts` duplica semântica do banco e cobre só o que os serviços usam; a prova contra PostgreSQL está na suíte de integração.
7. Nomes de FK da migration diferem do padrão do Prisma (drift só de nome, como nos Goals anteriores); `migrate diff --from-migrations` da IA continua sem execução local por falta de pgvector.

### Limites

Sem WhatsApp real, deploy, CI hospedada ou credencial real em fixture; modelo e transporte são dublês em todas as suítes.

## Aceite e encaminhamento

- **G-07 fechado** (envio manual assume, leitura não, retorno explícito na sessão); **G-08 fechado** (inbox persistida independentemente do processamento; ignorados fora de classificação, modelo, RAG e memória); **G-22 fechado** no escopo do MVP (três organizações, override manual, Ignorar IA absoluto, política persistida antes de qualquer leitura de conteúdo); **G-06 fechado** por completo (sessão de ~24 h e reavaliação sobre trabalho persistido). Memória estruturada, notas, tags e identidade de pessoa continuam nos Goals 006 e 012; a inbox em três abas é do Goal017.
- D-009 passa a ACCEPTED para este diff; os contratos adotados estão em D-021. CURRENT_STATE, GAP_ANALYSIS, DATA_MIGRATION, MASTER_PLAN, REUSE_ANALYSIS e TARGET_ARCHITECTURE foram alinhados no fechamento; o SHA do commit de fechamento será registrado em MIGRATION_STATUS pelo IA Loop na etapa posterior, conforme D-017/D-018.
- Nenhum Goal seguinte foi criado nem marcado READY nesta etapa.
