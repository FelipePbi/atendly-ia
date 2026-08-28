# AGENTS.md — Atendly monorepo

## Mission

Atendly é um SaaS multi-tenant de atendimento via WhatsApp e agendamento assistido por IA.
Resultado central: transformar conversas do WhatsApp em agendamentos reais e válidos, reduzindo trabalho manual. Não trate o produto apenas como chatbot.

## Leia antes de alterar

- Produto e regras: `docs/CONTEXTO_PRODUTO_ATENDLY.md`, depois `docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md`.
- Design: `apps/frontend-open-design/DESIGN-HANDOFF.md`, `apps/frontend-open-design/DESIGN-MANIFEST.json`, HTML/CSS/JS da tela, `docs/DESIGN.md`, então `apps/frontend`.
- Migração: `docs/ROADMAP_INTEGRACAO_V1.md` e somente o arquivo do goal solicitado em `docs/goals/`.
- Instruções locais: leia o `AGENTS.md` do app alterado; ele complementa este arquivo.
- Código e configuração atuais vencem READMEs antigos para descrever estado implementado. Regras explícitas de produto vencem preferências técnicas.

## Current — transição arquitetural

- `apps/frontend`: frontend novo, reconstruído a partir do Open Design; base visual aprovada; ainda usa mocks.
- `apps/frontend-open-design`: REFERENCE / DESIGN CONTRACT; não é aplicação de produção.
- `apps/bff`: backend público web atual, com responsabilidades legadas em transição.
- `apps/api`: aplicação transitória com orchestration de IA e integração Minha Agenda legadas.
- `apps/evolution-go`: transporte/provedor WhatsApp.
- `apps/health-worker`: monitoramento de saúde.
- `packages`: hoje contém `legal-contract`; contratos compartilhados adicionais são planejados.

AI Orchestrator e Scheduling Service ainda não existem como apps separados. Backend será refatorado incrementalmente.

## Target — arquitetura alvo

```text
Frontend
   │
   ▼
BFF
   ├──────────────► AI Orchestrator
   ├──────────────► Scheduling Service
   └──────────────► Evolution Go
```

Fluxo inbound alvo:

```text
WhatsApp
   ↓
Evolution Go
   ↓
AI Orchestrator
   ↓
Scheduling Service quando necessário
   ↓
AI Orchestrator
   ↓
Evolution Go
   ↓
WhatsApp
```

## Invariantes arquiteturais

1. Frontend conhece somente BFF.
2. Frontend não chama AI Orchestrator.
3. Frontend não chama Scheduling Service.
4. Frontend não chama Evolution Go diretamente.
5. Frontend não chama Minha Agenda diretamente.
6. BFF é o backend público da aplicação web.
7. Fluxo crítico inbound do WhatsApp não precisa passar pelo BFF.
8. AI Orchestrator será dono de Conversation, Message, Handoff e execução da IA.
9. Scheduling Service será dono de calendário, serviços, clientes, disponibilidade e appointments.
10. Evolution Go é somente transporte WhatsApp.
11. Serviço não acessa diretamente tabelas de outro serviço.
12. Todo dado operacional deve se tornar tenant-aware.
13. Nunca confie em `tenantId` recebido do browser para autorização.
14. LLM nunca acessa SQL diretamente.
15. LLM nunca acessa Minha Agenda diretamente.
16. Ações reais da IA passam por tools tipadas e serviços determinísticos.
17. RAG não substitui dados operacionais estruturados.
18. LangGraph não é source of truth de appointments.
19. Não crie rota pública sem consumidor real.
20. Não mantenha implementação legada paralela após concluir sua migração e remover todos os consumidores.

## Regras de produto não negociáveis

### Tenant

Cada negócio é isolado. Após implementação multi-tenant, nenhuma query operacional pode existir sem contexto de tenant validado pela sessão e associação do usuário.

### Agenda e appointments

- Cada tenant usa exatamente uma fonte oficial: Agenda Atendly OU Minha Agenda, nunca ambas simultaneamente.
- Troca de origem é migração assistida, não toggle.
- Nunca invente disponibilidade, serviço, preço ou confirmação.
- Nunca apresente falha como sucesso nem confirme antes da persistência real na fonte oficial.
- Reagendamento libera slot anterior somente após sucesso do novo agendamento.
- Cancelamento preserva histórico.
- Snapshot histórico de preço não muda quando preço do serviço muda.

### AI

V1 possui somente `Profissional e objetiva` e `Leve e próxima`.
Não crie persona `CUSTOM`, identidade fictícia, sexo de assistente ou treinamento por conversas sem nova decisão explícita de produto.

### RAG

Uso futuro adequado: FAQ, orientações, cuidados, descrições longas, informações do negócio e políticas textuais configuradas.
Não usar como fonte operacional de preço atual, serviço ativo, disponibilidade, appointment, appointment do cliente, status WhatsApp ou status de integração. Toda retrieval deve ser tenant-scoped.

## Frontend aprovado

`apps/frontend` é base visual aprovada. Mudanças futuras devem integrar dados e comportamento preservando UI existente.

Não:

- recomeçar frontend do zero;
- trocar design system ou navegação;
- “melhorar” visual sem solicitação;
- substituir design por biblioteca de componentes;
- alterar spacing, cores ou copy de produto arbitrariamente;
- importar HTML/JS do Open Design no runtime.

## DO NOT JUMP AHEAD

Execute apenas goal explicitamente solicitado. Não antecipe goal futuro por conveniência. Exemplo: em GOAL 03, não criar Scheduling Service, instalar LangChain ou criar RAG.
Cada goal deve deixar repositório estável antes do próximo. Somente usuário pode autorizar mudança de status no roadmap.

## Sequência de migração

1. GOAL 01 — Baseline arquitetural e inventário
2. GOAL 02 — Tooling + shared contracts
3. GOAL 03 — Multi-tenancy BFF
4. GOAL 04 — Scheduling Service foundation
5. GOAL 05 — Minha Agenda CalendarProvider
6. GOAL 06 — Agenda Atendly CalendarProvider
7. GOAL 07 — AI Orchestrator multi-tenant
8. GOAL 08 — LangChain
9. GOAL 09 — LangGraph
10. GOAL 10 — RAG + pgvector
11. GOAL 11 — BFF Public API V1
12. GOAL 12 — Frontend data layer
13. GOAL 13 — Auth + Onboarding + Settings + WhatsApp
14. GOAL 14 — Services + Customers + Calendar
15. GOAL 15 — Conversations + Handoff
16. GOAL 16 — Dashboard + Calendar Migration
17. GOAL 17 — Legacy cleanup
18. GOAL 18 — Deploy + final architecture audit

Detalhes e status: `docs/ROADMAP_INTEGRACAO_V1.md`.

## Legado, rotas e escopo

- Não apague legado ainda consumido antes do goal responsável.
- Quando migração correspondente terminar e não houver consumidor, remova legado.
- Não crie `old/`, `legacy/`, `deprecated/` ou `backup/`; Git é histórico.
- Create only routes required by a real consumer.
- BFF public API existe por necessidade real do frontend.
- Internal API existe por necessidade real do BFF ou serviço autorizado.
- Não gere CRUD completo automaticamente.
- Não altere regra de produto silenciosamente nem crie arquitetura paralela.

## Qualidade

- TypeScript strict; Zod nas boundaries.
- Erros estruturados e request IDs.
- Logs sem secrets.
- Funções pequenas quando razoável; módulos por domínio; dependências direcionais claras.
- Evite `any` e casts usados para esconder erros de tipo.
- Reutilize shared contracts adequados; não duplique DTOs.
- Nunca compartilhe Prisma, repositories ou persistência entre serviços.
- Não introduza abstração sem consumidor real.

## Testing e validation policy

Até nova instrução explícita nos goals iniciais, não crie testes novos. Não quebre testes existentes deliberadamente nem apague teste válido. Teste órfão pode sair junto da implementação removida no goal correto.

Execute checks já existentes e aplicáveis ao app alterado. Intenção final: `lint`, `typecheck`, `format:check`, `build`. Não adicione tooling fora do GOAL 02 somente para cumprir a lista.

## Limites locais

- `apps/frontend/AGENTS.md`: Next.js, Open Design, mocks, data access e UI freeze.
- `apps/bff/AGENTS.md`: backend público web, tenant resolution e responsabilidades transitórias.
- `apps/api/AGENTS.md`: aplicação transitória; calendário de extrações e tecnologias futuras.
- `apps/evolution-go/AGENTS.md`: transporte WhatsApp.
- `apps/health-worker/AGENTS.md`: health monitoring only.
- `apps/frontend-open-design/AGENTS.md`: contrato histórico de prototipação; preserve diretório.
