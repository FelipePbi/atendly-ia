---
title: Estado atual do backend
status: vigente
fase: 0
---

# 00 — Estado atual do backend

Levantamento **baseado em leitura de código**, não em documentação anterior. Onde a documentação existente contradiz o código, o código é registrado como fato e a divergência é anotada explicitamente.

Commit de referência: `d53b54a` (`main`).

> Regra de leitura deste documento: "NÃO EXISTE" significa verificado por busca no código, não inferido.

---

## 1. Topologia real

### Serviços (`render.yaml`)

| Serviço | Runtime | Plano | Papel |
| --- | --- | --- | --- |
| `atendly-ia-frontend` | Node (Next) | free | Web app |
| `atendly-ia-bff` | Node (Fastify) | free | **Única API pública** do produto |
| `atendly-ia-ai-orchestrator` | Node (Fastify) | free | IA, conversas, canal WhatsApp, RAG |
| `atendly-ia-scheduling-service` | Node (Fastify) | free | Domínio de agenda |
| `atendly-ia-evolution-go` | Docker (Go) | free | Gateway WhatsApp (fork Evolution Go 0.7.1 + whatsmeow) |
| `atendly-ia-health-worker` | Node | free | Ping de keep-alive nos demais |

Fatos estruturais:

- **Nenhum `type: cron`, nenhum `type: worker`.** Não existe infraestrutura de processamento assíncrono declarada.
- **5 bancos Postgres distintos**, um por dono: BFF, ai-orchestrator, scheduling, e **dois** do evolution-go (`POSTGRES_AUTH_DB` para o device store do whatsmeow, `POSTGRES_USERS_DB` para dados). Só `atendly-ia-scheduling-db` é gerenciado pelo blueprint; os demais são `sync: false` (externos). Há ainda um schema `langgraph` **dentro** do banco do ai-orchestrator, criado em runtime pelo checkpointer e **não gerenciado por migrations**.
- Os três schemas Prisma **não declaram `url`** — usam driver adapter `@prisma/adapter-pg`; a URL de migrate vem de `prisma.config.ts`. Só o BFF tem `DIRECT_DATABASE_URL` (padrão Neon pooler), e essa variável **não está no schema Zod de env** (`apps/bff/src/config/env.ts:35-57`) — funciona porque `prisma.config.ts` lê `process.env` direto.
- Todos em **plano free**, que hiberna por inatividade — o `health-worker` existe para mitigar isso. Incompatível com automação baseada em tempo.
- `render.yaml` **não declara `DATABASE_SAVE_MESSAGES`**, que o evolution-go exige via `panicIfEmpty` (`apps/evolution-go/pkg/config/config.go:226`). O serviço só sobe se a variável existir fora do blueprint.
- `INTERNAL_SERVICE_TOKEN` é passado ao evolution-go (`render.yaml:150`) mas **nenhum código Go o lê**.

### Escala do código autoral

| Área | Arquivos `.ts` | Linhas |
| --- | --- | --- |
| `apps/ai-orchestrator/src` | 43 | ~7.200 |
| `apps/scheduling-service/src` | 37 | ~4.900 |
| `apps/bff/src` | 31 | ~3.700 |
| `packages/contracts/src` | 22 | **118** |
| Testes (todos os serviços) | 7 | ~1.650 |

O backend é **pequeno**. Não existe legado volumoso: o custo da refatoração é dominado por decisões de modelagem, não por quantidade de código a reescrever.

### Autenticação entre serviços

Token estático único, o **mesmo valor para todos** (`render.yaml` propaga `INTERNAL_SERVICE_TOKEN` `fromService`). O chamador envia `Authorization: Bearer <token>` + `x-tenant-id` + `x-user-id` + `x-request-id` (`apps/bff/src/clients/internal-http-client.ts:70-92`). O receptor compara com `timingSafeEqual` e **confia no header de tenant** (`apps/scheduling-service/src/shared/auth/internal-auth.ts:31-69`; `apps/ai-orchestrator/src/modules/internal/routes.ts:50-55`).

Não há JWT de serviço, escopos, nem rate limit interno.

---

## 2. BFF (`apps/bff`)

### Forma

Fastify. **Não há camada de service/repository**: cada módulo é um único `routes.ts` com handlers inline (`apps/bff/src/app.ts:82-92`).

| Módulo | Natureza |
| --- | --- |
| `auth` | Domínio + persistência próprios |
| `whatsapp` | Dono de `WhatsAppInstance` + orquestração Evolution |
| `onboarding`, `settings` | Híbridos: persistem local e ressincronizam ai-orchestrator/scheduling |
| `dashboard` | Agregador com degradação parcial por dependência |
| `calendar`, `migrations`, `customers`, `services`, `conversations` | Fachadas |
| `tenant` | **Não expõe rotas** — só o helper `internalContext()` (`modules/tenant/context.ts:6`) |

### Persistência própria

8 models (`apps/bff/prisma/schema.prisma`): `User`, `PasswordResetToken`, `Tenant`, `TenantMember`, `BusinessProfile`, `LegalAcceptance`, `WhatsAppInstance`, `AiSettings`.

3 enums: `WhatsAppInstanceStatus` (8 valores, `:10`), **`AiTone` com 2 valores** — `PROFESSIONAL_OBJECTIVE | LIGHT_CLOSE` (`:21`) — e `TenantRole` com valor único `OWNER` (`:26`).

**Não persiste** conversas, mensagens, contatos ignorados, personas, agendamentos, serviços, clientes. Removidos por migration:

- `20260831000000_remove_legacy_conversation_models` — `DROP TABLE "Message"`, `"Conversation"`, `"AiSuppressionLog"`.
- `20260831220000_goal17_legacy_cleanup` — `DROP TABLE "IgnoredContact"`, `"PersonaConversationImport"`; `DROP TYPE "VirtualAttendantPersona"`, `"CustomPersonaStatus"`, `"VirtualAttendantIdentityMode"`, `"VirtualAttendantAssistantSex"`, `"IgnoredContactSource"`.

O trabalho de remoção de persona **já foi feito**. O de "Ignorar IA" também foi feito — mas removeu a única implementação existente sem substituto.

### Autenticação e tenant

JWT HS256 via `jose`, por cookie httpOnly **ou** Bearer (`apps/bff/src/lib/auth.ts:14-73`). O tenant é resolvido **exclusivamente do banco a partir do `sub` do JWT**, nunca de header do browser (`apps/bff/src/lib/tenant-context.ts:13-59`). Mais de uma membership retorna **409** (`:37-43`).

Lacunas: `logout` só limpa o cookie — não há revogação e um Bearer emitido continua válido; trocar a senha **não** invalida sessões.

### Superfície pública vs `PUBLIC_API_V1.md`

O inventário de rotas bate 1:1. As divergências são de **conteúdo**:

1. O documento afirma que os estilos de IA são Profissional/Equilibrada/Descontraída — **os três não existem em nenhum ponto do código** de nenhum serviço.
2. O documento afirma que não existe migração reversa — `POST /v1/calendar/migrations` aceita `target: "ATENDLY" | "EXTERNAL"` (`modules/migrations/routes.ts:10`).
3. O documento afirma que a Agenda Atendly é a única agenda operacional — `POST /v1/calendar/integration/connect` aceita credenciais, `baseUrl`, `employeeId`, `refreshSkewSeconds` e **`enableWrites`** (`modules/calendar/routes.ts:57-73`).

### Divergências código × product vault (BFF)

| Regra de produto | Código |
| --- | --- |
| 3 estilos de IA | 2 tons |
| Preço FIXED / STARTING_AT / ON_REQUEST / UNKNOWN | apenas `FIXED \| ON_REQUEST` (`modules/services/routes.ts:13`) |
| Cliente pode existir sem telefone | `POST /v1/customers` exige `phone` (`modules/customers/routes.ts:12`) |
| Conversas em Comercial / Não classificadas / Pessoal | **não existe categoria** — só `status: ACTIVE \| HUMAN_HANDOFF \| CLOSED` |
| Ignorar IA por contato | **removido do schema**; único controle é `AiSettings.enabled` global |
| Retenção configurável | **não existe** |
| Importação única | **nenhuma trava no BFF** |
| Teste real de ativação | **não existe rota nem handler** |

### Duplicações

1. **Timezone** em três lugares: `BusinessProfile.timezone`, `calendar.timezone` do scheduling, `availabilitySettings.timezone`. `PATCH /v1/settings/business` grava só o local e **não propaga** (`modules/settings/routes.ts:57-76`).
2. **Estado da IA** (`enabled`, `tone`): fonte no BFF, replicada por push ao ai-orchestrator em 3 lugares com lógica duplicada, com fallback hardcoded `?? "LIGHT_CLOSE"` (`settings/routes.ts:184`, `whatsapp/routes.ts:249`).
3. **Nome do negócio**: `Tenant.name` e `BusinessProfile.businessName` gravados com o mesmo valor.
4. **Instância WhatsApp**: existe no BFF, no ai-orchestrator (`ChannelConnection`) e no evolution-go.
5. **Tradução `ATENDLY|MINHA_AGENDA` → `ATENDLY|EXTERNAL` duplicada em 7 arquivos** do BFF.

### Testes

**1 arquivo, 71 linhas**, desligado por padrão (`describe.skipIf(!runIntegration)`) e com bug de rota (chama `/auth/register` sem `/v1`). `npm test` executa **zero asserções**.

---

## 3. `packages/contracts`

**É um esqueleto vazio, sem nenhum consumidor.**

- 22 arquivos, **118 linhas**. Só `common/` tem conteúdo: primitivos zod (`id`, `isoDateTime`, `money`, `pagination`, `phone`, `requestId`, `timezone`, `errorResponse`).
- Todos os namespaces de domínio são stubs de 2 linhas: comentário + `export {}`.
- `src/index.ts` exporta **somente** `./common`.
- **Zero `z.enum` de domínio.**
- **Nenhum app importa `@atendly-ia/contracts`.** Não há `workspaces` no `package.json` raiz.
- Os primitivos de `common` estão **reimplementados inline** no BFF (`modules/settings/routes.ts:192`, `modules/onboarding/routes.ts:300`, `app.ts:96-128`).

Isto é um ativo: não há contrato legado a desmontar, há um lugar vazio e corretamente estruturado para o contrato novo.

---

## 4. Scheduling service (`apps/scheduling-service`)

### Modelo de dados

13 models, 5 enums. `PriceType {FIXED, ON_REQUEST}` (`prisma/schema.prisma:32`).

- `Appointment.status` é **`String` livre, não enum** (`:141`), com apenas **dois valores escritos**: `"SCHEDULED"` e `"CANCELLED"` (`integrations/atendly/provider.ts:145, :251`).
- `AppointmentItem` guarda **snapshot completo** de nome, duração, tipo de preço e preço (`:161-164`) — correto e alinhado ao vault.
- `Customer` tem **`@@unique([tenantId, normalizedPhone])`** (`:74`) e `phone` NOT NULL (`:66`).
- Instantes são **`TIMESTAMP(3)` sem timezone**, não `TIMESTAMPTZ` (`migrations/20260828175825_init/migration.sql:118`).
- **Não existe exclusion constraint de sobreposição.** Nenhuma das 4 migrations contém `EXCLUDE`.

### O que existe e é bom

- **Motor de slots** (`modules/availability/atendly-availability.ts:91-215`): regras semanais + exceções (merge de disponibilidade extra, subtração de bloqueios) − time blocks − agendamentos.
- **Concorrência séria**: advisory lock por `(tenant, dia)` via `pg_advisory_xact_lock` + transação `Serializable` + **revalidação dentro da transação** (`integrations/atendly/provider.ts:127-177`, `:199-237`).
- **Idempotência com tabela dedicada**: `CalendarMutationIdempotency`, claim por INSERT, replay de resposta, detecção de reuso com payload diferente (`modules/calendar/idempotency.ts`). `Idempotency-Key` **obrigatória** nas 3 mutações (`calendar/routes.ts:172-183`).
- **Snapshot comercial** no item.
- **Timezone competente** (`shared/date-time/calendar-date-time.ts:45-85`): conversão wall-clock ↔ instante por ponto fixo com verificação de round-trip, rejeitando horários inexistentes de DST.

### O que não existe

| Capacidade exigida pelo vault | Estado |
| --- | --- |
| **Holds de 5 min / "Em confirmação"** | **NÃO EXISTE** — grep `hold\|reservation\|tentative`: zero |
| Status `Concluído` e `Não compareceu` | **NÃO EXISTEM** |
| Confirmação de presença separada do status | **NÃO EXISTE** |
| Valor final cobrado | **NÃO EXISTE** campo persistido |
| Histórico/audit do agendamento | **NÃO EXISTE**. Remarcação é `update` in place — **o horário anterior é perdido** (`integrations/atendly/provider.ts:225-234`) |
| Recorrência (serviço, agendamento, bloqueio) | **NÃO EXISTE** em nenhuma entidade |
| Preço `STARTING_AT` e `UNKNOWN` | **NÃO EXISTEM** |
| Buffer antes/depois na agenda Atendly | **NÃO EXISTE** (só `bufferBetweenServicesMinutes` no provider externo) |
| Antecedência mínima/máxima | **NÃO EXISTE** — único filtro é `startAt <= now` (`atendly-availability.ts:196`) |
| Granularidade por tenant | **NÃO EXISTE** — `stepMinutes` vem no request |
| **CRUD de `AvailabilityException`** | Tabela **lida e nunca escrita**; sem endpoint. Disponibilidade extra e bloqueio por data são inalcançáveis |
| Bloqueio recorrente / compromisso pessoal tipado | **NÃO EXISTEM** — `TimeBlock` tem só `startAt`, `endAt`, `reason?` |
| Cliente sem telefone | **IMPOSSÍVEL** — `phone` NOT NULL |
| Telefone compartilhado | **IMPOSSÍVEL** — unique. Pior: `create()` é **upsert por telefone** que sobrescreve silenciosamente o nome do cliente existente (`customers/atendly-customer-service.ts:38-52`) |
| Relações entre clientes, tags, preferências, observações, memória, resumo | **NÃO EXISTEM** |
| Update/delete de cliente; delete de serviço | **NÃO EXISTEM** |
| Overlap manual forçado | **NÃO EXISTE** — sem `force`/`allowOverlap` |
| IA impedida de overlap por caminho distinto | **NÃO** — mesmo endpoint e mesmo código; `source` é rótulo **nunca lido para decisão** |
| Auto-complete, no-show, lembretes, expurgo | **NÃO EXISTEM** |
| Testes | **ZERO** — sem script `test`, sem runner |

### Abstração multi-provider

O provider ativo é `CalendarSettings.source`, resolvido **a cada request** (`calendar/calendar-service.ts:127-144`) por um switch em `calendar/provider-factory.ts:17-48`. Duas implementações de `CalendarProvider`.

Pontos de contaminação da premissa antiga: bypass da abstração `internal-api/routes.ts:128-133`; guard `requireAtendlyCalendar()` `:539-549`; `{items: [], managedExternally: true}` `:167-173`; `capabilities` derivado do source `:507-517`; bloqueio de troca de source `:110-116`; `CALENDAR_SOURCE_MISMATCH` `:317-323`; ramificação na migração `calendar-migration-service.ts:281, 319-336`.

`MinhaAgendaCalendarProvider` **não é um importador**: é fonte de verdade em tempo real enquanto `source === MINHA_AGENDA`, com leitura **e escrita** (atrás de `enableWrites`, default `false`). Uma consulta de disponibilidade externa custa **4 chamadas HTTP**.

### Migração

`modules/migrations/calendar-migration-service.ts` — 910 linhas, o maior arquivo do serviço.

- Direção suportada: **somente `MINHA_AGENDA → ATENDLY`**; o inverso é `supported: false` (`:303`). O contrato público do BFF, porém, aceita os dois sentidos.
- **Trava de execução concorrente existe** (`MIGRATION_ALREADY_RUNNING`, `:77-89`), mas é trava de **job ativo**, não de **importação única por negócio**: nada impede uma segunda migração depois da primeira terminar.
- **Não existe "Concluir importação" como passo do usuário**: o flip de `CalendarSettings.source` acontece automaticamente na mesma transação (`:572-575`).
- **Não existe resolução de conflito**: `MigrationConflict.status` é sempre `"OPEN"`; qualquer conflito ≠ 0 **aborta a importação inteira** (`:199-213`). Importação parcial com pendências não é suportada.
- Importação inteira em **uma única transação `Serializable`** (`:411, :596`) sobre janela de **10 anos** (`:341`).
- Execução por **`queueMicrotask` in-process** (`:162-168`), com `resumeIncomplete()` no boot. Sem fila durável, retry ou backoff.

### Riscos de correção

1. `createAppointment` cria/upserta o cliente **antes** do `assertAvailable` e fora da transação (`:108-125`): slot indisponível deixa cliente órfão e pode ter sobrescrito nome existente.
2. `cancelAppointment` é update solto, **sem transação e sem lock** (`:246-255`).
3. Criação de `TimeBlock` faz check-then-act **fora de transação** (`internal-api/routes.ts:266-289`). Também não valida sobreposição entre blocos.
4. Remarcação trava apenas o dia de **destino**, não o de origem.
5. Marcação `COMPLETED` da idempotência ocorre em transação **separada** do efeito (`calendar/idempotency.ts:35-42`): crash entre os dois causa **replay real do efeito colateral** após 5 min.
6. `calendar/idempotency.ts:74` — `catch { }` sem discriminar erro.
7. Sem retry de `40001` (serialization failure) em lugar nenhum.
8. Dois motores de disponibilidade divergentes: o externo opera em minutos locais **sem timezone algum**.

---

## 5. AI Orchestrator (`apps/ai-orchestrator`)

### Estrutura real

`src/modules/` tem 18 diretórios, mas **6 são pastas vazias**: `automation`, `business-settings`, `legal`, `minha-agenda`, `openai`, `virtual-attendant`. A árvore de diretórios promete uma arquitetura que não existe.

O AI Orchestrator **não faz mais nada com Minha Agenda** — toda operação de agenda vai para o scheduling-service. Resíduos: chave `"minha_agenda_password"` em `lib/redact.ts:17` e nomenclatura em testes.

### Stack

LangChain `@langchain/core@1.2.9`, `@langchain/langgraph@1.4.13`, `@langchain/langgraph-checkpoint-postgres@1.0.5`, `@langchain/openai@1.5.8`, Prisma 7.10, Fastify 5, Vitest 4.

Modelo default `gpt-5.4-mini`; embeddings `text-embedding-3-small` (1536 dims).

`modules/model` tem uma abstração `ModelProvider` com implementação única `LangChainModelProvider`, injetável por construtor. `ModelResponse.continuation` guarda a `AIMessage` bruta, então o acoplamento a LangChain vaza pela abstração.

### Grafo LangGraph

14 nós (`modules/graph/message-graph.ts:118-132`), loop ReAct com limite de 5 iterações:

```
loadRuntimeContext → loadConversation → operationalGuard
  → understandMessage → (bufferInbound | recordInbound)
  → retrieveKnowledge → agent ⇄ executeTool → validateToolResult
  → composeResponse → (handoff) → persistResponse → sendResponse
```

Checkpointer `PostgresSaver` em schema PostgreSQL separado `langgraph`, criado no boot. **`thread_id` = `conversationId`** — 1 conversa = 1 contato por canal, **para sempre**. Não há segmentação por sessão nem TTL.

### Tools expostas ao LLM (8)

| Tool | Destino |
| --- | --- |
| `list_services`, `get_availability`, `create_appointment`, `list_customer_appointments`, `reschedule_appointment`, `cancel_appointment` | **Scheduling service** via HTTP |
| `request_human_handoff` | Prisma local |
| `search_business_knowledge` | **RAG pgvector** |

`create_appointment`, `reschedule_appointment` e `cancel_appointment` implementam padrão **`prepare` / `confirm`** de duas fases, com `pendingAction` persistido em `Conversation.state`. `confirmSchedule` **re-resolve os serviços contra o scheduling** antes de criar. Idempotência de tool: chave `${aiRunId}:${call.id}:${call.name}` propagada como header ao scheduling.

### RAG — a separação exigida pelo vault já existe e é forte

**Só conhecimento textual é indexado.** Tipos: `FAQ, GUIDANCE, CARE, PROCEDURE, BUSINESS_INFO, TEXT_POLICY`. Nenhum código indexa serviços, preços, durações ou disponibilidade.

Barreira tripla contra usar RAG para dado determinístico:

1. **Guard de código** na tool — `isOperationalKnowledgeQuery` bloqueia por regex (`preco|valor|quanto custa|servico ativo`, `agenda|horario|disponib|marcar|remarcar|cancelar`, `status do whatsapp|integracao conectada`) e lança `KNOWLEDGE_QUERY_NOT_ALLOWED` (`modules/tools/assistant-tools.ts:418-423`).
2. **Descrição da tool** proíbe explicitamente esses usos.
3. **Prompt** repete a proibição em `prompts/knowledge.ts:10-11, :28` e `prompts/system.ts:51-53`.

Também há defesa anti prompt-injection nos chunks recuperados (`prompts/knowledge.ts:27`).

Vazamento residual: o nó `retrieveKnowledge` do grafo chama `knowledge.search()` **sem passar pelo guard** — na prática não colide porque o roteador de intent manda consultas operacionais para `operational`, mas o guard determinístico protege só a tool.

Fragilidades do RAG: **não há chunking automático** (chunks vêm prontos; única entrada é um script CLI, sem rota HTTP de ingestão) e **não há índice ANN** — a migration cria a extensão e índices B-tree, mas nenhum `ivfflat`/`hnsw`, então a busca vetorial faz scan sequencial.

### Guardrails de IA — o que existe e o que falta

| Guardrail exigido | Estado |
| --- | --- |
| Não inventar preço/serviço/disponibilidade | **FORTE** — prompt + revalidação de `serviceId` contra o scheduling (`SERVICE_NOT_FOUND`, `SERVICE_ID_UNRESOLVED`, `SERVICE_ID_AMBIGUOUS`); preço e duração sempre do scheduling; sem `businessContext` a IA nem roda |
| Nunca criar persona/nome próprio | **FORTE e explícito** — `"Nao invente identidade, nome ou sexo para a IA."` (`tenant-config/ai-settings.ts:40`), coberto por teste |
| Não atender grupos | **FORTE** — filtro em 3 camadas (instância `ignoreGroups`, evolution-go, orchestrator antes da idempotência) |
| Isolamento multi-tenant | **FORTE** — `tenantId` em todas as queries, uniques compostos, validação `channel.tenantId === message.tenantId` |
| **Não confirmar antes de persistir** | **PARCIAL — só por prompt.** O padrão prepare/confirm existe, mas `validateToolResult` **calcula `toolResultsValid` e nunca o usa**; a aresta para `agent` é incondicional. Nada impede o modelo de emitir "confirmado!" junto da tool call |
| **Não negociar desconto** | **NÃO EXISTE** — grep `desconto\|discount`: zero ocorrências em código |
| **Não criar encaixe** | Sem regra explícita; coberto apenas de forma indireta porque o slot vem do scheduling |
| **Ignorar IA por contato** | **NÃO EXISTE em nenhum app** — grep `ignorar.?ia\|ignoreAi\|IGNORE_AI` retorna **apenas documentação** |
| Handoff em imagem | **NÃO EXISTE** — imagem recebe resposta canned "me envie em texto", **sem handoff** |
| Threshold de confiança | `confidence` é parseado e **nunca comparado a threshold** |

### Achado crítico: mensagem manual do profissional NÃO pausa a IA

`handleOwnerActivity` (`message-graph.ts:317-328`) apenas **registra** a mensagem (`source: "OWNER"`). Não chama `pauseForHuman` nem `pauseIndefinitely`. Os testes **asseguram esse comportamento**: `expect(subject.handoff.pauseForHuman).not.toHaveBeenCalled()` (`tests/channel/inbound-message-processor.test.ts:156, :238, :274, :310`).

A única pausa por ação do dono é o comando explícito `/ia_pause` ou `/bot off` digitado no WhatsApp, ou o botão de takeover no painel. Isto contraria diretamente a regra central do produto.

Agravante: `upsertActiveConversation` **reseta `humanHandoff: false, status: "ACTIVE"` a cada mensagem de cliente** (`assistant.service.ts:725-730`), então uma pausa pode ser derrubada pela próxima mensagem.

### Achado crítico: o debounce não funciona em produção

O buffer de mensagens fragmentadas é um `Map` de instância em `InboundMessageProcessor` (`:154`), mas **o processador inteiro é recriado a cada webhook** (`routes/evolutionWebhook.routes.ts:60`). Cada mensagem cria seu próprio buffer e seu próprio `setTimeout`. O agrupamento só funciona nos testes, que reutilizam uma instância.

Além disso os valores são **8–60 s** (`AI_DEBOUNCE_MIN_SECONDS=8`, `MAX_WAIT=60`), não os 2–3 s exigidos para fragmentação, e a janela de 2–5 min para mensagem ambígua **não existe**: `"Oi"` recebe resposta **imediata** por atalho pré-modelo (`assistant.service.ts:985-1006`), sem sequer chamar o LLM.

### Estado de handoff triplicado

O mesmo fato é representado em quatro lugares: `Conversation.status`, `Conversation.humanHandoff`, `Conversation.state.aiConversation.stage` e a tabela `Handoff`. Podem divergir.

`pauseIndefinitely` usa `BOT_OFF_PAUSE_UNTIL = 9999-12-31`, e `applyDecision`/`createHandoff` gravam `handoffPausedUntil: null` — **na prática nenhuma pausa expira sozinha**. `HUMAN_HANDOFF_PAUSE_MINUTES` é env declarada e **nunca lida**.

### Sessão de 24h

**NÃO EXISTE.** Sem TTL de checkpoint, sem expiração de sessão, sem limpeza. Checkpoints e `Conversation.state` crescem indefinidamente — e o `Conversation.state` **inteiro é serializado no system prompt a cada turno** (`prompts/system.ts:77-78`), incluindo até 20 decision logs e 5 availability lookups.

### Mídia

Áudio, imagem e documento são **classificados e rejeitados**. Não há transcrição (grep `transcri|whisper|speech`: zero), não há visão, não há download de mídia — o port `WhatsAppProvider` tem **apenas `sendText`**. Todo `kind ≠ text` recebe uma resposta canned, **não abre handoff**, e **não é persistido** como `Message` (pula `recordInbound`). Legenda de imagem é descartada.

### Persistência

O AI Orchestrator é o **dono único** de `Conversation`, `Message`, `Handoff`, `AiRun`, `AiToolCall`, `ProcessedEvent`, `KnowledgeDocument/Chunk`. O BFF não tem cópia — apenas proxia. **Isto está correto.**

A duplicação real é de **configuração de tenant** (enabled, tone, businessName, timezone), sincronizada por push manual sem reconciliação. Agrava: `businessContext` é JSON não tipado normalizado com `safeParse` que **cai em default silenciosamente** — um `settings` corrompido vira `businessName: ""`, que dispara handoff-por-configuração-incompleta sem sinalizar a causa.

### Lógica órfã identificada

- `intent: "handoff"` do classificador **nunca roteia** para o nó `handoff`.
- `isUnsupportedMessagePause` detecta uma razão de pausa que **nenhum código gera**.
- A action `unsupported_handoff` está declarada e **nunca é produzida**.
- `prompts/response.ts:5-6` manda "respeitar a persona configurada na Atendente Virtual" — **aponta para o vazio**.

### Testes

6 arquivos, 1.582 linhas, Vitest, **todos unitários com fakes manuais**. Sem teste de integração com banco, sem e2e, sem teste do grafo compilado. Sem cobertura para: o grafo, o checkpointer, o RAG inteiro, o `SchedulingClient`, as 10 rotas internas do painel, e o cálculo de debounce.

---

## 6. WhatsApp / Evolution

### Natureza

`apps/evolution-go` é um **fork vendorizado da Evolution Go 0.7.1** (`go.mod:1` → `github.com/EvolutionAPI/evolution-go`), com whatsmeow como submódulo. Guardrail próprio (`apps/evolution-go/AGENTS.md:3-7`): é transporte, sem lógica de negócio.

É **tenant-agnóstico**: a tabela `instances` conhece só `Id`, `Name`, `Token`, `Webhook`, `Jid`, `Connected`, `Events`.

### Superfície consumida

O BFF consome 7 endpoints (`/instance/create`, `/connect`, `/qr`, `/pair`, `/status`, `/logout`, `/delete/:id`). O ai-orchestrator consome **um único**: `POST /send/text`. Nada de mídia, chat, grupo ou websocket.

### Caminho inbound

```
WhatsApp → whatsmeow → filtros do evolution-go (broadcast, grupos, tipos)
  → webhook POST {AI_ORCHESTRATOR}/webhooks/evolution?token=…
  → mapper → resolução de tenant por instanceId → HTTP 202 imediato
  → processamento fire-and-forget (void) → grafo LangGraph
  → POST /send/text
```

O webhook vai **direto ao ai-orchestrator, não passa pelo BFF**.

### Riscos do caminho WhatsApp

| # | Achado |
| --- | --- |
| 1 | Webhook **sem assinatura HMAC**; token em **query string**; comparação não timing-safe (`evolutionWebhook.routes.ts:155-160`) |
| 2 | O `instanceToken` vem **no corpo do webhook** e é reutilizado como credencial de envio outbound — payload forjado que passe o token de query controla o `apikey` do outbound |
| 3 | **HTTP 202 antes de processar** (`:77-79`): crash pós-ACK perde a mensagem, e o retry do evolution-go não recupera porque já recebeu 2xx |
| 4 | Outbound **sem retry, sem timeout, sem backoff** — `fetch` cru (`EvolutionProvider.ts:50`) |
| 5 | Eventos `CONNECTION` e `QRCODE` são **assinados mas rejeitados com 400** pelo mapper, que só aceita `Message`/`SendMessage` |
| 6 | **Nenhum alerta de desconexão**; o estado só é conhecido por polling de `GET /instance/status` |
| 7 | `webhook`/`webhookEvents` enviados no `/instance/create` são **silenciosamente ignorados** pelo Go (só o `/connect` os grava) |
| 8 | `DELETE /v1/whatsapp` **não desativa o `ChannelConnection`** no ai-orchestrator; erros de logout/delete são engolidos com `.catch(() => null)` |
| 9 | `ProcessedEvent.rawPayload` persiste o webhook cru **incluindo o `instanceToken`**, sem TTL |
| 10 | `normalizePhone` remove tudo que não é dígito — JID com sufixo de device corrompe o `externalContactId` |

### Teste real de ativação

**NÃO EXISTE.** Não há endpoint, não há instância/número oficial Atendly configurado, não há fluxo. O gate de onboarding apenas consulta `GET /instance/status` e emite `WHATSAPP_NOT_CONNECTED` — verificação **passiva**, sem confirmação de que mensagens realmente fluem.

### Troca de número

Não há endpoint dedicado. Na prática é `DELETE /v1/whatsapp` + `POST /v1/whatsapp/connect`, que cria instância nova. As conversas sobrevivem porque o `ChannelConnection.id` é preservado no upsert por `tenantId_provider`.

---

## 7. Processamento assíncrono — inventário

**Não existe infraestrutura de jobs em nenhum serviço.**

- `render.yaml`: nenhum `type: cron`, nenhum `type: worker`.
- `apps/scheduling-service`: dependências são apenas Prisma, adapter-pg, dotenv, fastify, pg, zod. Grep `setInterval|node-cron|bullmq|Worker|queue`: **zero**.
- `apps/ai-orchestrator`: mesma busca, **zero**. O único temporizador é o `setTimeout` do debounce, em memória de processo.
- Único trabalho assíncrono real: a migração de calendário via `queueMicrotask` in-process, sem fila durável nem retry.

Consequência direta: **lembretes, confirmação de presença, expiração de hold, auto-complete, no-show, retenção/limpeza de mensagens, alertas por e-mail, retry de falhas e expurgo de idempotência não são extensões — são uma capacidade nova a introduzir.**

Não há provider de e-mail configurado em nenhum serviço.

---

## 8. Configuração, testes e observabilidade

### Testes — panorama consolidado

| Serviço | Runner | Arquivos | Casos | Roda em CI? |
| --- | --- | --- | --- | --- |
| `ai-orchestrator` | Vitest 4 | 6 | ~36 | sim, todos unitários com fakes manuais |
| `bff` | Vitest 4 | 1 | 1 | **não** — `skipIf` + rota errada |
| `scheduling-service` | **nenhum** | 0 | 0 | — |
| `health-worker` | `node --check` | 0 | 0 | — |
| `packages/contracts` | nenhum | 0 | 0 | — |

- **Não existe `npm test` na raiz.** `scripts/build-all.sh` não roda nenhum teste Node.
- **Nenhum teste E2E cruzando serviços.** `scripts/final-production-audit.mjs` é auditoria estática de arquivos, não exercita fluxo de negócio.
- Existe uma fixture de webhook do WhatsApp, mas é **script manual sem asserções** (`apps/ai-orchestrator/scripts/send-sample-webhook.mjs`), exige servidor local rodando.
- Nenhum serviço usa testcontainers, docker-compose de teste ou banco de teste dedicado.

O serviço com o schema mais complexo, que faz criptografia de credenciais e executa o job de migração é justamente o que **não tem sequer o script `test`**.

### Configuração e deploy — achados

| # | Achado |
| --- | --- |
| 1 | **Reset de senha quebrado em produção**: o BFF delega a um webhook genérico (`PASSWORD_RESET_DELIVERY_URL`), que **não é declarado no `render.yaml`**; sem ela o código lança `CONFIGURATION_ERROR` 500 (`apps/bff/src/clients/password-reset-delivery.ts:11-17`). Não há nenhum provider de e-mail em nenhum serviço |
| 2 | **URL do ai-orchestrator com 3 valores divergentes**: `render.yaml:54,187` aponta para `atendimeto-ia.onrender.com` (typo legado), enquanto os `.env.example` usam `atendly-ia-ai-orchestrator.onrender.com` |
| 3 | `INTERNAL_SERVICE_TOKEN` é `sync: false` no ai-orchestrator e propagado por `fromService` aos demais — se não for setado manualmente, **todo o tráfego interno cai** |
| 4 | `INTEGRATION_CREDENTIALS_KEY` usa `generateValue: true`, mas o código exige **base64 de 32 bytes** para AES-256-GCM; rotacionar torna toda `IntegrationConnection.credentialsEncrypted` indecifrável |
| 5 | **Validação de token divergente**: o scheduling usa `timingSafeEqual` corretamente (`shared/auth/internal-auth.ts:21-29`); o ai-orchestrator usa **comparação de string simples** (`modules/internal/routes.ts:499`) |
| 6 | **Fallback de tenant no ai-orchestrator**: com `x-tenant-id` ausente e `requireExplicitTenant=false`, o tenant é **inferido** do primeiro `ChannelConnection` ACTIVE do usuário (`modules/internal/routes.ts:472-479`) |
| 7 | `docker-compose` existe apenas em `apps/ai-orchestrator/`, sobe **4 de 7 componentes** (não sobe BFF, scheduling, frontend, health-worker) e tem **colisão de porta 5434** com o banco esperado pelo scheduling |
| 8 | Não há npm workspaces: **6 `package-lock.json` independentes**. `packages/contracts` está em todos os `buildFilter.paths`, então mudá-lo **redeploya todos os serviços** — custo sem benefício, já que ninguém o importa |

### Observabilidade

| Aspecto | Estado |
| --- | --- |
| Logging | Pino nos 3 serviços TS, com **redact de campos sensíveis** configurado corretamente. `health-worker` usa `console.log` cru |
| Request ID | ✅ propagado ponta a ponta (`x-request-id`) nos 4 serviços Node |
| Health check | BFF tem `/health` + `/health/dependencies` com fan-out; scheduling verifica o banco de verdade; **ai-orchestrator não checa o banco** |
| Tracing / métricas / error tracking | **NÃO EXISTEM** em nenhum serviço. Zero OpenTelemetry instanciado, zero Prometheus, zero Sentry |
| Agregação de logs | **NÃO EXISTE** — cada serviço loga isolado no stdout do Render |
| Auditoria de IA | `AiRun` e `AiToolCall` persistem provider, modelo, prompt version, argumentos, resultado, status e timings — **sem retenção** |

O `health-worker` não alerta ninguém: só faz `console.error`. Seu efeito prático é manter os serviços free-tier acordados.

### Retenção de dados

**Não existe nenhuma política de retenção em nenhum serviço.** Crescem indefinidamente: `Message`, `ProcessedEvent` (com `rawPayload` cru do webhook, incluindo o `instanceToken`), `AiRun`, `AiToolCall`, `CalendarMutationIdempotency` e os checkpoints LangGraph. Os únicos `deleteMany` do repositório são operações de request-time; **nenhum por idade**.

---

## 9. Síntese: o que o backend hoje realmente faz

Funciona hoje, ponta a ponta: cadastro/login → onboarding com negócio, serviço e disponibilidade → conexão do WhatsApp por QR ou pairing code → recepção de mensagem → classificação de intenção → RAG de conhecimento textual → loop ReAct com tools reais contra a agenda → criação/remarcação/cancelamento de agendamento com idempotência e controle de concorrência → resposta outbound → inbox no painel com takeover manual.

Não funciona / não existe: holds, ciclo de vida do atendimento além de agendado/cancelado, recorrência, buffers, exceções de agenda, categorias de conversa, Ignorar IA, retenção, lembretes, teste de ativação, pausa automática ao responder manualmente, sessão de 24h, mídia, e qualquer automação temporal.
