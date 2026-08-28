Você está iniciando a execução sequencial do roadmap de integração V1 da Atendly.

## GOAL ATUAL

Execute exclusivamente:

`docs/goals/GOAL_01_BASELINE_ARQUITETURAL.md`

Não implemente nenhum outro goal.

---

# 1. LEITURA OBRIGATÓRIA ANTES DE ALTERAR QUALQUER ARQUIVO

Antes de fazer qualquer mudança, leia integralmente:

1. `/AGENTS.md`
2. todos os `AGENTS.md` aplicáveis aos diretórios que você pretende inspecionar ou alterar;
3. `docs/ROADMAP_INTEGRACAO_V1.md`;
4. `docs/goals/GOAL_01_BASELINE_ARQUITETURAL.md`;
5. `docs/CONTEXTO_PRODUTO_ATENDLY.md`;
6. `docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md`;
7. os documentos de arquitetura/design apontados pelos AGENTS;
8. os README.md relevantes.

Depois inspecione o estado REAL do repositório.

Não confie cegamente em documentação antiga se ela divergir do código atual.

---

# 2. REGRA DE ESCOPO

Você está autorizado a executar SOMENTE o GOAL 01.

O GOAL 02 e todos os seguintes estão fora de escopo.

Em particular, nesta execução NÃO:

- altere schemas Prisma;
- crie migrations;
- crie Tenant;
- crie TenantMember;
- crie `packages/contracts`;
- padronize Prisma;
- instale ESLint/Prettier;
- crie Scheduling Service;
- mova Minha Agenda;
- renomeie `apps/api`;
- instale LangChain;
- instale LangGraph;
- configure pgvector;
- crie RAG;
- altere rotas públicas;
- integre frontend ao BFF;
- remova código legado;
- altere comportamento de runtime;
- modifique o frontend visualmente;
- avance para qualquer goal posterior porque a mudança "faria sentido aproveitar".

Se identificar algo que pertence a outro goal:

DOCUMENTE.

NÃO IMPLEMENTE.

---

# 3. OBJETIVO DESTA EXECUÇÃO

O GOAL 01 deve criar uma fotografia arquitetural confiável do estado atual e registrar formalmente:

- arquitetura atual;
- arquitetura alvo;
- ownership de cada domínio;
- ownership de dados;
- limites entre serviços;
- fronteira da API pública;
- inventário do código atual;
- destino futuro de cada responsabilidade relevante;
- ordem da migração.

Nenhuma feature deve mudar de comportamento.

---

# 4. AUDITORIA DO REPOSITÓRIO

Antes de produzir os documentos do GOAL 01, audite pelo menos:

```text
apps/frontend
apps/frontend-open-design
apps/bff
apps/api
apps/evolution-go
apps/health-worker
packages
docs
render.yaml
```

No frontend, identifique:

- routes reais;
- features;
- mocks;
- service contracts;
- preview system;
- qualquer integração de backend existente.

No BFF, identifique:

- routes;
- services;
- Prisma models;
- autenticação;
- sessão;
- WhatsApp;
- conversations;
- webhook;
- persistence;
- chamadas à API/Evolution.

Na API atual, identifique:

- MessageOrchestrator;
- AssistantService;
- OpenAI;
- prompts;
- tools;
- Minha Agenda;
- availability;
- handoff;
- idempotency;
- conversations/messages;
- Evolution adapters;
- internal routes.

Não faça inferência quando puder confirmar no código.

---

# 5. CLASSIFICAR CÓDIGO EXISTENTE

Para componentes relevantes, classifique usando apenas:

```text
KEEP
MOVE
REFACTOR
REPLACE
REMOVE
```

Exemplo de estrutura:

| Local atual | Responsabilidade | Owner atual | Owner alvo | Ação | Goal responsável | Observação |
|---|---|---|---|---|---|---|

Não marque algo como REMOVE apenas porque parece antigo.

Primeiro confirme consumidores.

Quando a remoção pertencer a um goal futuro, registre o goal correspondente.

---

# 6. DOCUMENTOS OBRIGATÓRIOS

Produza exatamente os documentos exigidos pelo GOAL 01:

```text
docs/architecture/
├── 001-target-architecture.md
├── 002-service-ownership.md
├── 003-data-ownership.md
├── 004-public-api-boundary.md
└── 005-migration-order.md
```

Além disso, se o próprio GOAL 01 exigir inventário separado, crie um documento adequado dentro de `docs/architecture/`.

Não crie documentação redundante sem necessidade.

---

# 7. ARQUITETURA ALVO QUE NÃO PODE SER REINTERPRETADA

A direção definida é:

```text
Frontend
   ↓
BFF
   ├── AI Orchestrator
   ├── Scheduling Service
   └── Evolution Go
```

Fluxo inbound:

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

Não proponha uma arquitetura alternativa neste goal.

Se encontrar impedimentos técnicos concretos, documente-os.

---

# 8. OWNERSHIP ALVO

O resultado deve preservar:

## BFF

Owner de:

```text
User
Tenant
TenantMember
LegalAcceptance
BusinessProfile
sessão
autenticação
onboarding de conta
configuração da conta
fronteira pública para frontend
lifecycle/configuração WhatsApp conforme arquitetura definida
```

## AI Orchestrator

Owner de:

```text
Conversation
Message
Handoff
AiRun
AiToolCall
AI operational settings
LangGraph state/checkpoints
RAG
KnowledgeDocument
KnowledgeChunk
```

## Scheduling Service

Owner de:

```text
CalendarSettings
IntegrationConnection
Customer
Service
AvailabilityRule
AvailabilityException
TimeBlock
Appointment
AppointmentItem
ExternalEntityMap
MigrationJob
MigrationConflict
```

## Evolution Go

Owner do transporte WhatsApp.

Não mova ownership silenciosamente.

---

# 9. DATA OWNERSHIP

Documente explicitamente:

> Um serviço não pode consultar diretamente tabelas pertencentes a outro serviço.

Mesmo que inicialmente bancos utilizem o mesmo PostgreSQL ou cluster.

Shared contracts podem existir futuramente.

Shared persistence não.

---

# 10. PUBLIC API BOUNDARY

Documente claramente:

```text
Browser
   ↓
BFF
```

O browser não acessará diretamente:

```text
AI Orchestrator
Scheduling Service
Evolution Go
Minha Agenda
```

Serviços internos não precisam expor CORS para o navegador.

---

# 11. FRONTEND É UMA BASE APROVADA

O frontend recém-construído não deve ser reconstruído neste goal.

Não altere:

- layout;
- CSS;
- design system;
- componentes;
- navegação;
- copy;
- mocks;
- services.

Somente audite seu estado para mapear futuros consumidores da API.

---

# 12. CURRENT VS TARGET

Todos os documentos devem distinguir claramente:

```text
CURRENT
TRANSITIONAL
TARGET
```

Exemplo:

Não escreva:

```text
apps/ai-orchestrator existe
```

se atualmente ainda existe:

```text
apps/api
```

Em vez disso:

```text
CURRENT: apps/api
TARGET: apps/ai-orchestrator
MIGRATION: GOAL 07
```

Faça isso para todos os elementos ainda não implementados.

---

# 13. MAPA DE MIGRAÇÃO

Para cada responsabilidade relevante, indique qual goal é responsável.

Exemplos:

```text
multi-tenancy → GOAL 03
Scheduling foundation → GOAL 04
Minha Agenda → GOAL 05
Agenda Atendly → GOAL 06
AI rename/multi-tenancy → GOAL 07
LangChain → GOAL 08
LangGraph → GOAL 09
RAG → GOAL 10
BFF Public API → GOAL 11
Frontend data layer → GOAL 12
...
```

Não execute nenhum deles.

---

# 14. VALIDAÇÃO DO GOAL 01

Antes de concluir, confirme que a documentação responde inequivocamente:

```text
Quem é dono de Conversation?
Quem é dono de Appointment?
Quem resolve tenant?
Quem recebe WhatsApp inbound?
Quem possui credenciais Minha Agenda?
Quem executa RAG?
Quem é o único backend público para o frontend?
```

As respostas obrigatórias são:

```text
Conversation       -> AI Orchestrator
Appointment        -> Scheduling Service
tenant             -> BFF
WhatsApp inbound   -> AI Orchestrator
Minha Agenda creds -> Scheduling Service
RAG                -> AI Orchestrator
frontend backend   -> BFF
```

Se a documentação não permitir responder isso claramente, o GOAL ainda não está pronto.

---

# 15. NÃO MARCAR O PRÓXIMO GOAL

Ao concluir:

Atualize `docs/ROADMAP_INTEGRACAO_V1.md` apenas se o mecanismo de status previsto pelo roadmap determinar isso.

O estado esperado após aprovação do GOAL 01 é:

```text
GOAL 01 = COMPLETED
GOAL 02 = NEXT
GOAL 03+ = BLOCKED
```

Porém:

NÃO marque GOAL 01 como COMPLETED automaticamente se algum gate deste goal não tiver sido atendido.

NÃO inicie GOAL 02.

---

# 16. GIT DIFF

Antes de finalizar:

```bash
git status --short
git diff --check
git diff --stat
```

Audite o diff.

Este goal deve ser predominantemente documental.

Se aparecer alteração de runtime:

investigue e reverta, salvo se explicitamente exigida pelo GOAL 01.

---

# 17. RELATÓRIO FINAL OBRIGATÓRIO

Entregue:

## Goal executed

```text
GOAL 01 — Baseline arquitetural e inventário definitivo
```

## Files created

Lista.

## Files modified

Lista.

## Current architecture found

Resumo baseado no código real.

## Target architecture recorded

Resumo.

## Ownership findings

Tabela resumida.

## Legacy/transitional findings

Liste as principais responsabilidades atuais que serão migradas posteriormente.

## Potential risks discovered

Somente riscos observados concretamente.

Não os corrija se forem de outro goal.

## Gate validation

Marque individualmente:

```text
[PASS/FAIL] service ownership documented
[PASS/FAIL] data ownership documented
[PASS/FAIL] public API boundary documented
[PASS/FAIL] migration order documented
[PASS/FAIL] repository inventory produced
[PASS/FAIL] frontend remained unchanged
[PASS/FAIL] runtime behavior remained unchanged
[PASS/FAIL] git diff --check
```

## Next

Se todos os gates passarem:

```text
READY FOR GOAL 02
```

Caso contrário:

```text
GOAL 01 NOT COMPLETE
```

Liste exatamente o que falta.

NÃO EXECUTE O GOAL 02.