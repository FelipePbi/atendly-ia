# Inventário do código atual

**Auditado em:** 2026-08-28

**Fonte:** código, schemas, manifests e `render.yaml`; READMEs usados como apoio, não substituto do runtime.

## CURRENT

Caminhos e consumidores observados no código aparecem nas colunas `CURRENT` e nas seções por app.

## TRANSITIONAL

Ação classificada e goal de migração aparecem em cada linha relevante.

## TARGET

Destino e owner aparecem nas colunas `TARGET`; isso não implica que app ou model já exista.

## Legenda

| Ação | Significado |
| --- | --- |
| KEEP | Responsabilidade e localização permanecem úteis |
| MOVE | Responsabilidade migra para outro serviço/local |
| REFACTOR | Responsabilidade continua, mas contrato/estrutura muda |
| REPLACE | Implementação atual será substituída pelo desenho V1 |
| REMOVE | Sem destino alvo; remover somente após confirmar ausência de consumidores |

## Visão do repositório

| Local | CURRENT confirmado | TARGET | Ação | Goal |
| --- | --- | --- | --- | --- |
| `apps/frontend` | Next 16/React 19; 37 `page.tsx`; features reais sobre mocks; sem backend | Frontend consumindo somente BFF, preview ainda mockado | REFACTOR | GOAL 12–16 |
| `apps/frontend-open-design` | 117 HTML, 7 CSS, 11 JS; contrato visual/launcher | Referência imutável, fora do runtime | KEEP | contínuo |
| `apps/bff` | Fastify/Prisma 7; auth, conta, WhatsApp, inbox, webhook e dispatch para API | Backend público web e clients internos | REFACTOR | GOAL 03, 11, 13–16 |
| `apps/api` | Fastify/Prisma 6; IA, OpenAI, Minha Agenda, handoff, idempotência e webhooks | Responsabilidades separadas entre Scheduling e AI Orchestrator | REFACTOR | GOAL 05 e 07 |
| `apps/evolution-go` | Go/Gin/whatsmeow; transporte, pairing, eventos, envio e estado técnico | Transporte WhatsApp | KEEP | GOAL 18 valida limite/deploy |
| `apps/health-worker` | Node; `/health`, `/targets`, polling de quatro serviços | Monitoramento apenas | KEEP | GOAL 18 |
| `packages/legal-contract` | Versões legais compartilhadas por frontend/BFF | Contrato legal compartilhado | KEEP | — |
| `render.yaml` | Cinco serviços; nenhum Scheduling/AI Orchestrator separado | Deploy da arquitetura alvo | REFACTOR | GOAL 18 |

Não existem: `apps/ai-orchestrator`, `apps/scheduling-service`, `packages/contracts`, Tenant, TenantMember, LangChain, LangGraph, pgvector ou RAG.

## Frontend

### Rotas reais

| Grupo | Rotas |
| --- | --- |
| Entrada/legal | `/` → `/login`; `/login`; `/cadastro`; `/recuperar-senha`; `/solicitacao-enviada`; `/nova-senha`; `/link-expirado`; `/termos-de-uso`; `/politica-de-privacidade` |
| Onboarding | `/onboarding` → `/onboarding/dados-do-negocio`; `/onboarding/[step]` |
| Produto | `/inicio`; `/conversas`; `/conversas/[state]`; `/agenda`; `/clientes`; `/servicos`; `/configuracoes` |
| Agenda | `/agenda/novo`; `/agenda/agendamento`; `/agenda/reagendar`; `/agenda/bloquear` |
| Clientes | `/clientes/novo`; `/clientes/detalhes`; `/clientes/detalhes/externo` |
| Serviços | `/servicos/novo`; `/servicos/editar` |
| Configurações | `/configuracoes/negocio`; `/configuracoes/ia`; `/configuracoes/agenda`; `/configuracoes/disponibilidade`; `/configuracoes/whatsapp`; `/configuracoes/conta` |
| Fluxos/estados | `/migracao/[step]`; `/sistema/[state]` |
| Preview | `/_preview`; `/_preview/[slug]` (filesystem codifica `_` como `%5F`) |

Features confirmadas: auth, onboarding, dashboard, conversations, calendar, customers/directory, services, settings, migration, system e preview. `AppShell` fornece navegação responsiva compartilhada.

### Mocks e contratos

| Arquivo atual | Responsabilidade CURRENT | Destino TARGET | Ação | Goal | Observação |
| --- | --- | --- | --- | --- | --- |
| `apps/frontend/src/mocks/index.ts` | Instancia todos `Mock*Service` | Composição de adapter de produção ou preview | REFACTOR | GOAL 12 | Produto real usa BFF; preview continua mock |
| `.../MockAuthService.ts` | Simula submit com timeout | BFF auth adapter no produto | KEEP | GOAL 13 | Manter para preview; substituir consumidor real |
| `.../MockOnboardingService.ts` | Draft em memória | BFF onboarding adapter | KEEP | GOAL 13 | Sem persistência real |
| `.../MockSettingsService.ts` | Save no-op | BFF settings adapter | KEEP | GOAL 13 | Sem persistência real |
| `.../MockCalendarService.ts` | Lista/cria/cancela em memória | Scheduling via BFF | KEEP | GOAL 14 | Manter para preview |
| `.../MockCustomerService.ts` | Lista/cria em memória | Scheduling via BFF | KEEP | GOAL 14 | Manter para preview |
| `.../MockServiceCatalogService.ts` | Lista/salva serviços em memória | Scheduling via BFF | KEEP | GOAL 14 | Manter para preview |
| `.../MockConversationService.ts` | Lista/muda estado em memória | AI Orchestrator via BFF | KEEP | GOAL 15 | Manter para preview |
| `.../MockDashboardService.ts` | Seleciona cenário | Agregação BFF | KEEP | GOAL 16 | Manter para preview |
| `.../MockMigrationService.ts` | Diagnóstico/execução simulados | Scheduling/agregação via BFF | KEEP | GOAL 16 | Manter para preview |
| `apps/frontend/src/mocks/data/appointments.ts` | Fixtures de agenda | Preview | KEEP | contínuo | Não é dado operacional |
| `apps/frontend/src/mocks/data/conversations.ts` | Fixtures de conversa | Preview | KEEP | contínuo | Não é dado operacional |
| `apps/frontend/src/mocks/data/directory.ts` | Fixtures de clientes/serviços | Preview | KEEP | contínuo | `DirectoryScreen` importa dados diretamente |

Interfaces de service existem em `features/*/types.ts`. No runtime atual, somente `AuthScreen` chama `mockServices.auth`; outras telas usam cenários e/ou fixtures diretamente. Não há chamada de rede no `src`.

## BFF

### Rotas implementadas

| Categoria | Rotas CURRENT |
| --- | --- |
| Health | `GET /health`; `GET /health/dependencies` |
| Auth | `POST /auth/register`; `POST /auth/login`; `POST /auth/logout`; `GET /auth/me`; `POST /auth/change-password` |
| Onboarding | `GET /onboarding`; `PATCH /onboarding/profile`; `POST /onboarding/complete` |
| Settings | `GET|PATCH /business-settings`; `GET|PATCH /virtual-attendant/settings`; `GET /virtual-attendant/prompt-preview`; persona import/list/generate; `GET|PATCH /automation/ai` |
| WhatsApp | status, instance create/delete, connect, QR, pair, logout e contacts sob `/whatsapp/*` |
| Inbox | ignored contacts list/create/bulk/delete; conversations list/consolidate/messages/update/send/pause/resume |
| Webhook | `POST /webhooks/evolution-go` |

### Rotas e services

| Arquivo atual | Responsabilidade CURRENT | Owner TARGET | Ação | Goal | Observação |
| --- | --- | --- | --- | --- | --- |
| `apps/bff/src/routes/health.ts` | Saúde BFF/API/Evolution | BFF | KEEP | GOAL 18 | Dependências internas |
| `.../routes/auth.ts` | Cadastro, aceite, cookie/JWT, senha | BFF | REFACTOR | GOAL 03/13 | Cadastro ainda não cria Tenant |
| `.../routes/onboarding.ts` | Perfil legado e conexão WhatsApp | BFF | REPLACE | GOAL 13 | Exige nascimento/sexo; não modela escolha de agenda |
| `.../routes/settings.ts` | Business + virtual attendant/persona + automação | BFF e AI Orchestrator | REFACTOR | GOAL 07/13 | Arquivo mistura owners; opções legadas violam V1 |
| `.../routes/whatsapp.ts` | Lifecycle, QR, pairing, contatos | BFF | REFACTOR | GOAL 03/13 | Evolution Go continua transporte |
| `.../routes/webhooks.ts` | Recebe inbound, persiste inbox, aplica elegibilidade e despacha API | AI Orchestrator no inbound | MOVE | GOAL 07 | BFF sai do caminho crítico inbound |
| `.../routes/conversations.ts` | Inbox, mensagens, envio manual e handoff | AI Orchestrator via BFF | REFACTOR | GOAL 07/11/15 | Persistência deixa BFF; rota pública futura vira proxy/DTO |
| `.../routes/ignored-contacts.ts` | Pausa/retomada e ignored contacts | AI Orchestrator | MOVE | GOAL 07 | Handoff/execução de IA |
| `.../services/internal-api.ts` | Client genérico para API transitória | Clients internos explícitos | REPLACE | GOAL 07/11 | Hoje usa `x-user-id`, sem tenant |
| `.../services/evolution-go.ts` | Client REST Evolution Go | BFF EvolutionClient | REFACTOR | GOAL 11/13 | Base útil; manter boundary |
| `.../services/evolution-webhook-parser.ts` | Normaliza eventos/mensagens inbound | AI Orchestrator | MOVE | GOAL 07 | Parte do caminho inbound |
| `.../services/persona.ts` | Importação e geração de persona por conversas | Sem destino V1 | REMOVE | GOAL 17 | Só após rota/consumidores substituídos |

### Prisma CURRENT

| Model(s) | Owner atual | Owner TARGET | Ação | Goal |
| --- | --- | --- | --- | --- |
| `User`, `LegalAcceptance` | BFF | BFF | REFACTOR | GOAL 03 |
| `UserProfile`, `BusinessSettings` | BFF | BFF (`BusinessProfile`) | REFACTOR | GOAL 03/13 |
| `WhatsAppInstance` | BFF | BFF lifecycle | REFACTOR | GOAL 03/13 |
| `Conversation`, `Message` | BFF | AI Orchestrator | MOVE | GOAL 07 |
| `IgnoredContact`, `AiSuppressionLog` | BFF | AI Orchestrator | MOVE | GOAL 07 |
| `UserSettings` | BFF | AI Orchestrator para settings operacionais | MOVE | GOAL 07 |
| `PersonaConversationImport` | BFF | Sem destino V1 | REMOVE | GOAL 17 |

## API transitória

### Rotas implementadas

- health: `/health`, `/healthy`;
- legais legadas: `/privacy`, `/terms`, `/data-deletion`;
- webhook bridge: `/api/webhooks/evolution-go`;
- webhook direto: `/webhooks/evolution`;
- internas autenticadas: handoffs, bot resume/status e `/internal/evolution/dispatch`.

### Módulos

| Arquivo atual | Responsabilidade CURRENT | Destino TARGET | Ação | Goal | Observação |
| --- | --- | --- | --- | --- | --- |
| `apps/api/src/modules/automation/MessageOrchestrator.ts` | Idempotência, filtro, debounce, handoff, assistant e envio | AI Orchestrator | MOVE | GOAL 07 | Código valioso; buffer é memória do processo |
| `.../assistant/assistant.service.ts` | Conversas/mensagens, contexto, loop OpenAI/tools, decisões | AI Orchestrator | MOVE | GOAL 07 | Depois evolui nos GOAL 08/09 |
| `.../openai/openai-client.ts` | Client HTTP Responses API | AI Orchestrator | MOVE | GOAL 07 | Refatoração LangChain no GOAL 08 |
| `.../openai/prompts.ts` | Prompt e regras de agenda/persona | AI Orchestrator | REFACTOR | GOAL 07 | Remover regras incompatíveis; LangChain só GOAL 08 |
| `.../openai/tools.ts` | 12 tools; chama Minha Agenda e persiste estado/espelhos | AI Orchestrator + Scheduling API | REFACTOR | GOAL 05/07 | LLM já usa tools tipadas, mas registry importa facade diretamente |
| `.../minha-agenda/client.ts` | OAuth, cache token e endpoints Minha Agenda | Scheduling Service provider | MOVE | GOAL 05 | Credencial global CURRENT |
| `.../minha-agenda/service.ts` | Serviços, clientes, disponibilidade, create/cancel/reschedule | Scheduling Service | MOVE | GOAL 05 | Revalida slot antes de escrita |
| `.../minha-agenda/availability.ts` | Cálculo determinístico de slots | Scheduling Service | MOVE | GOAL 05 | Código reaproveitável |
| `.../minha-agenda/types.ts` | DTOs externos Minha Agenda | Scheduling Service | MOVE | GOAL 05 | Não compartilhar persistence model |
| `.../handoff/HandoffService.ts` | Pausa/handoff por telefone | AI Orchestrator | MOVE | GOAL 07 | Consolidar com handoff do BFF |
| `.../idempotency/IdempotencyStore.ts` | Deduplicação de eventos | AI Orchestrator | MOVE | GOAL 07 | `ProcessedEvent` precisa tenant scope |
| `.../channel/domain/ChannelMessage.ts` | Contrato inbound normalizado | AI Orchestrator/contracts | MOVE | GOAL 07 | Adicionar tenant context confiável |
| `.../channel/ports/WhatsAppProvider.ts` | Porta de envio | AI Orchestrator | MOVE | GOAL 07 | Mantém Evolution atrás de interface |
| `.../channel/adapters/evolution/EvolutionInboundMapper.ts` | Mapeia payload Evolution | AI Orchestrator | MOVE | GOAL 07 | Inbound target |
| `.../channel/adapters/evolution/EvolutionProvider.ts` | Envia texto pelo Evolution Go | AI Orchestrator | MOVE | GOAL 07 | Transporte permanece Evolution |
| `.../channel/routes/evolutionWebhook.routes.ts` | Webhook direto e bridge para frontend legado | AI Orchestrator / sem destino bridge | REFACTOR | GOAL 07/17 | Bridge aponta para `/api` ausente no frontend novo |
| `.../internal/routes.ts` | Dispatch e administração de handoff | AI Orchestrator internal API | REFACTOR | GOAL 07 | Contrato atual usa `x-user-id`, não tenant |
| `.../business-settings/business-settings.ts` | Snapshot de configurações recebido do BFF | Contrato interno BFF→AI | REFACTOR | GOAL 02/07 | BFF segue owner do profile |
| `.../virtual-attendant/virtual-attendant.ts` | Settings/identidade/persona da IA | AI Orchestrator | REPLACE | GOAL 07 | V1 só dois tons, sem identidade fictícia |
| `.../legal/routes.ts` | Páginas legais HTML legadas | Frontend/BFF público | REMOVE | GOAL 17 | Após confirmar consumidores |

### Prisma CURRENT

| Model(s) | Destino TARGET | Ação | Goal |
| --- | --- | --- | --- |
| `Conversation`, `Message`, `Handoff`, `ProcessedEvent`, `ToolCall` | AI Orchestrator tenant-aware | MOVE | GOAL 07 |
| `CustomerLink` | `ExternalEntityMap` no Scheduling Service | REPLACE | GOAL 04/05 |
| `ExternalAppointment` | Appointment/ExternalEntityMap no Scheduling Service | REPLACE | GOAL 04/05 |

## Evolution Go, health e deploy

| Componente | CURRENT | Ação | Goal/nota |
| --- | --- | --- | --- |
| `apps/evolution-go/pkg/routes/routes.go` | API ampla; auth admin/instância; CORS `*` | KEEP | GOAL 18 revisa exposição |
| `.../instance/model/instance_model.go` | Instância, token, webhook, QR, conexão e settings técnicos | KEEP | Estado técnico do transporte |
| `.../message/model/message_model.go` | Status técnico opcional de mensagem | KEEP | Não é Message canônica do produto |
| `.../events/webhook/webhook_producer.go` | Envio assíncrono com cinco retries | KEEP | Destino muda para AI Orchestrator no GOAL 07 |
| `apps/health-worker/src/index.js` | Poll a cada 40s; expõe `/health` e `/targets` | REFACTOR | GOAL 18 atualiza targets |
| `packages/legal-contract/*` | Versões legais comuns | KEEP | Único package compartilhado atual |
| `render.yaml` | Frontend, BFF, API, Evolution e worker | REFACTOR | GOAL 18; apps alvo ausentes hoje |

## Consumidores e legado confirmados

- BFF consome `/internal/evolution/dispatch`, `/internal/handoffs`, `/internal/bot/status` e `/internal/bot/resume` da API.
- BFF cria instâncias Evolution com webhook apontando para `/webhooks/evolution-go` no próprio BFF.
- BFF consome Evolution para instance create/connect/status/QR/pair/logout/delete, send text e contacts.
- OpenAI tool registry consome `MinhaAgendaServiceFacade` diretamente.
- `apps/api /api/webhooks/evolution-go` encaminha para `/api/webhooks/evolution-go` em um frontend legado; frontend novo não possui route handler `/api/*`. Nenhum consumidor runtime desse bridge foi encontrado no repositório além de testes/documentação.
- Frontend novo não consome rotas BFF ou API.
- Persona import/generate ainda é consumida pelas rotas settings do BFF; portanto não pode ser apagada agora.

## Riscos concretos observados

1. BFF e API possuem Conversation/Message e mecanismos de handoff distintos; consistência depende de dispatch e sincronização entre dois bancos.
2. Nenhum schema operacional possui Tenant/TenantMember; BFF é user-scoped e API usa telefone global/único.
3. Credenciais Minha Agenda e employee ID são globais por ambiente, incompatíveis com múltiplos tenants.
4. BFF oferece `CUSTOM`, assistente separada/sexo e importação de conversas; regras V1 permitem somente dois tons sem identidade fictícia.
5. Onboarding BFF exige nascimento e sexo, campos proibidos pelo produto V1, e não exige escolha de agenda.
6. Debounce do `MessageOrchestrator` fica em `Map`/timer em memória; restart pode perder lote pendente.
7. Bridge legado da API aponta para route handler ausente no frontend novo.
8. Evolution Go aplica CORS global `*` apesar de ser serviço interno no TARGET.
9. API captura processamento assíncrono do webhook direto após responder `200`; falhas posteriores ficam somente em logs/handoff.
10. `apps/ai-orchestrator`, `apps/scheduling-service` e seus deploys não existem; arquitetura alvo ainda não é executável.

Riscos pertencentes a goals posteriores foram documentados, não corrigidos no GOAL 01.
