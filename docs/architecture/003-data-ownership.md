# Ownership de dados

## Regra fundamental

> Nenhum serviço acessa diretamente tabelas pertencentes a outro domínio.

Regra vale mesmo quando serviços usam mesmo PostgreSQL, cluster ou provedor. Compartilhar infraestrutura física não autoriza compartilhar schema, Prisma, repository, migration ou conexão de domínio.

## CURRENT

### Banco do BFF

`apps/bff/prisma/schema.prisma` contém:

| Dados atuais | Situação |
| --- | --- |
| User, LegalAcceptance | Domínio BFF, ainda sem Tenant/TenantMember |
| UserProfile, BusinessSettings | Domínio BFF, contrato legado user-scoped |
| WhatsAppInstance | Configuração/lifecycle BFF com token de instância Evolution |
| Conversation, Message | Duplicação transitória; owner alvo é AI Orchestrator |
| UserSettings, PersonaConversationImport | Configuração de IA/persona transitória; parte incompatível com V1 |
| IgnoredContact, AiSuppressionLog | Controle operacional de IA transitório |

### Banco da API transitória

`apps/api/prisma/schema.prisma` contém:

| Dados atuais | Situação |
| --- | --- |
| Conversation, Message, Handoff | Base reaproveitável do futuro AI Orchestrator; não tenant-aware |
| ProcessedEvent | Idempotência inbound da IA |
| ToolCall | Registro de execução de tools |
| CustomerLink | Mapeamento Minha Agenda legado e global por telefone |
| ExternalAppointment | Espelho Minha Agenda legado |

### Persistência Evolution Go

Evolution Go usa bancos de autenticação/sessão WhatsApp e GORM para `Instance`, `Message` opcional, `Label` e estado técnico auxiliar. Esses registros suportam transporte. Não são Conversation/Message canônicas do produto.

### Frontend

Mocks são dados em memória do processo/browser. Não são persistência nem source of truth.

## TARGET

| Owner | Dados autoritativos |
| --- | --- |
| BFF | User, Tenant, TenantMember, LegalAcceptance, BusinessProfile, sessão e configuração/lifecycle de WhatsApp necessária à conta |
| AI Orchestrator | Conversation, Message, Handoff, AiRun, AiToolCall, AI operational settings, LangGraph checkpoints, KnowledgeDocument, KnowledgeChunk e dados RAG |
| Scheduling Service | CalendarSettings, IntegrationConnection, Customer, Service, AvailabilityRule, AvailabilityException, TimeBlock, Appointment, AppointmentItem, ExternalEntityMap, MigrationJob, MigrationConflict |
| Evolution Go | Instância/sessão do provedor, pairing, entrega, status e persistência técnica do transporte |

## TRANSITIONAL

Durante extração, bancos podem permanecer no mesmo provedor, mas cada novo owner recebe schema, migrations e client próprios. Cópia legada pode coexistir somente até cutover e verificação de consumidores; não vira acesso cruzado permanente.

## Credenciais e secrets

| Credencial | Owner TARGET | Regra |
| --- | --- | --- |
| JWT/session web | BFF | Nunca enviada a serviço não necessário |
| Membership e TenantContext | BFF | Derivados da sessão; não aceitar `tenantId` arbitrário do browser |
| Credenciais Minha Agenda | Scheduling Service | Nunca frontend, LLM ou AI Orchestrator direto |
| Credencial OpenAI | AI Orchestrator | Não expor em BFF/frontend/logs |
| Chaves/tokens Evolution | BFF para lifecycle e Evolution Go para autenticação do transporte | Compartilhar apenas por contrato interno mínimo necessário |

CURRENT usa uma credencial Minha Agenda e `MINHA_AGENDA_DEFAULT_EMPLOYEE_ID` globais por ambiente em `apps/api`; isso não é modelo multi-tenant e será substituído no GOAL 05.

## Regras de acesso

1. Cada request interno carrega identidade autenticada e contexto de tenant explícito, emitido por serviço confiável.
2. Browser nunca autoriza acesso enviando somente `tenantId`.
3. BFF consulta AI Orchestrator e Scheduling Service por APIs internas tipadas, não por SQL.
4. AI Orchestrator consulta scheduling por tool/API tipada, não por Prisma compartilhado ou Minha Agenda.
5. Scheduling Service não lê tabelas de Conversation para executar appointment.
6. Evolution Go não interpreta tenant, agenda, prompt ou regra de negócio.
7. IDs externos ficam em `ExternalEntityMap` do Scheduling Service, não viram chaves de ownership entre bancos.
8. Eventos/DTOs podem carregar snapshots mínimos; não concedem acesso ao banco produtor.

## Requisitos de migração

- Introduzir Tenant/TenantMember no BFF antes de dados operacionais multi-tenant.
- Criar storage próprio do Scheduling Service antes de extrair Minha Agenda.
- Consolidar Conversation/Message/Handoff no AI Orchestrator antes de remover cópias do BFF.
- Preservar histórico e idempotência durante cutover.
- Não compartilhar Prisma entre serviços durante transição.
- Remover tabela legada somente após migrar dados necessários e confirmar ausência de consumidores.
