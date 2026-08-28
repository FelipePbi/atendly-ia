# Ownership de serviços

**Regra:** ownership TARGET define regra de negócio, escrita, persistência e contrato autoritativo. Um proxy ou client não transfere ownership.

## CURRENT

Ownership atual está fragmentado entre BFF e API transitória: ambos persistem conversa/handoff, e API também executa scheduling Minha Agenda. Matriz de transição abaixo registra correção sem declarar serviços ainda inexistentes.

## TARGET

| Serviço | Owner de | Não é owner de |
| --- | --- | --- |
| BFF | User, Tenant, TenantMember, LegalAcceptance, BusinessProfile, sessão, autenticação, onboarding/configuração de conta, fronteira pública web, lifecycle/configuração WhatsApp | Conversation, Message, Handoff, scheduling, Appointment, RAG, LLM orchestration |
| AI Orchestrator | Conversation, Message, Handoff, AiRun, AiToolCall, AI settings operacionais, execução da IA, LangGraph state/checkpoints, RAG, KnowledgeDocument, KnowledgeChunk | User/session/membership, Appointment, disponibilidade, credenciais Minha Agenda, transporte WhatsApp |
| Scheduling Service | CalendarSettings, IntegrationConnection, Customer, Service, AvailabilityRule, AvailabilityException, TimeBlock, Appointment, AppointmentItem, ExternalEntityMap, MigrationJob, MigrationConflict | Conversation, Message, Handoff, auth web, RAG, transporte WhatsApp |
| Evolution Go | Transporte WhatsApp e estado técnico necessário de instância, sessão, pairing e entrega | Tenant de produto, Conversation de negócio, Message canônica, IA, scheduling, Minha Agenda |
| Frontend | Experiência de usuário e estado de apresentação | Autorização, source of truth operacional, acesso direto a serviços internos |
| Health worker | Monitoramento de endpoints de saúde | Jobs de negócio, orchestration, persistência de domínio |

## TRANSITIONAL

### CURRENT → TARGET

| Responsabilidade | Owner CURRENT confirmado | Owner TARGET | Ação | Goal principal |
| --- | --- | --- | --- | --- |
| Auth, cookie/JWT, User, aceite legal | BFF | BFF | REFACTOR | GOAL 03 |
| Tenant resolution | Não existe | BFF | REPLACE | GOAL 03 |
| Business/profile e onboarding | BFF, com contrato legado | BFF | REPLACE | GOAL 13 |
| Lifecycle WhatsApp, QR, pairing, logout, contatos | BFF chamando Evolution Go | BFF + Evolution Go | REFACTOR | GOAL 13 |
| Transporte e sessão WhatsApp | Evolution Go | Evolution Go | KEEP | GOAL 18 valida deploy/limites |
| Inbound WhatsApp | Evolution Go → BFF → API; API também possui webhook legado | AI Orchestrator após Evolution Go | MOVE | GOAL 07 |
| Conversation e Message | Duplicadas em BFF e API | AI Orchestrator | MOVE | GOAL 07 |
| Handoff/pausa | BFF ignored contacts + API Handoff | AI Orchestrator | MOVE | GOAL 07 |
| Orchestration, prompt, OpenAI e tool loop | API | AI Orchestrator | MOVE | GOAL 07 |
| Minha Agenda, credenciais e disponibilidade | API | Scheduling Service | MOVE | GOAL 05 |
| Agenda Atendly | Não existe | Scheduling Service | REPLACE | GOAL 06 |
| Scheduling models autoritativos | Não existem; API guarda espelhos legados | Scheduling Service | REPLACE | GOAL 04 |
| OpenAI HTTP direto | API | AI Orchestrator com LangChain | REPLACE | GOAL 08 |
| Estado JSON ad hoc | API | AI Orchestrator com LangGraph | REPLACE | GOAL 09 |
| Retrieval inexistente | Não existe | AI Orchestrator com RAG/pgvector | REPLACE | GOAL 10 |
| Public API V1 | Rotas legadas no BFF; frontend novo não consome | BFF | REPLACE | GOAL 11 |
| Data layer frontend | Interfaces e mocks; sem BFF client | Frontend, consumindo BFF | REFACTOR | GOAL 12 |
| Serviços/clientes/agenda no frontend | Mock | Scheduling via BFF | REPLACE | GOAL 14 |
| Conversas/handoff no frontend | Mock | AI Orchestrator via BFF | REPLACE | GOAL 15 |
| Dashboard/migração no frontend | Mock | Agregação BFF | REPLACE | GOAL 16 |

## Fronteiras específicas

### WhatsApp

- BFF controla lifecycle/configuração da conexão para o usuário web.
- Evolution Go executa pairing, sessão, eventos e entrega.
- AI Orchestrator recebe mensagens inbound e decide resposta/handoff.
- BFF pode consultar status para UI, mas não se torna owner do transporte nem do inbound.

### Configurações de IA

Configuração operacional que muda execução da IA pertence ao AI Orchestrator. BFF pode expor endpoint público e agregar resposta, mas não persiste tabela do domínio de IA no TARGET.

### Agenda

Scheduling Service é única autoridade operacional para source selection, integração, serviços, clientes, disponibilidade e appointments. Cada tenant usa Agenda Atendly ou Minha Agenda, nunca ambas como fonte oficial simultânea.

### Código legado sem destino de produto

Persona `CUSTOM`, identidade fictícia/separada, sexo da assistente e treinamento por conversas existem no BFF CURRENT, mas não fazem parte da V1. Permanecem transitórios até substituição dos consumidores e remoção no GOAL 17; não definem ownership alvo.
