# TASK — Configurar o Harness de Projeto: AGENTS.md + READMEs + Roadmap

## Objetivo

Antes de iniciar qualquer goal de refatoração da Atendly, configure corretamente a documentação persistente usada por agentes de desenvolvimento para que futuras execuções do Codex:

- entendam o produto atual;
- conheçam a arquitetura atual e a arquitetura alvo;
- respeitem os limites entre frontend, BFF e serviços;
- não destruam o frontend recém-reconstruído;
- não revivam conceitos legados;
- não antecipem goals futuros;
- não criem arquitetura paralela;
- não criem endpoints especulativos;
- não alterem regras de produto silenciosamente;
- saibam exatamente quais documentos consultar;
- saibam o que pode e não pode ser alterado em cada app.

Esta tarefa é **somente de harness/documentação**.

Não implemente nenhuma etapa da refatoração neste momento.

---

# 1. Regra fundamental desta tarefa

Antes de editar qualquer arquivo:

1. leia a árvore atual do repositório;
2. leia os `AGENTS.md` existentes;
3. leia todos os `README.md` relevantes;
4. leia:
   - `docs/CONTEXTO_PRODUTO_ATENDLY.md`;
   - `docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md`;
   - `docs/DESIGN.md`;
5. inspecione a estrutura real de:
   - `apps/frontend`;
   - `apps/frontend-open-design`;
   - `apps/bff`;
   - `apps/api`;
   - `apps/evolution-go`;
   - `apps/health-worker`;
   - `packages`;
6. inspecione `render.yaml`;
7. confronte documentação com código antes de escrever os novos documentos.

Não assuma que README antigo está correto.

O código atual e os documentos de produto são as fontes para determinar o estado real.

---

# 2. Escopo estritamente proibido nesta tarefa

NÃO:

- alterar regras de negócio;
- implementar GOAL 01;
- alterar schemas Prisma;
- criar migrations;
- alterar banco;
- criar Tenant;
- criar Scheduling Service;
- renomear `apps/api`;
- instalar LangChain;
- instalar LangGraph;
- instalar pgvector;
- criar RAG;
- conectar frontend ao BFF;
- criar endpoints;
- remover endpoints;
- mover lógica de negócio;
- alterar Evolution Go;
- alterar comportamento do frontend;
- redesenhar telas;
- alterar CSS visual;
- alterar componentes da UI;
- adicionar dependências;
- atualizar versões de bibliotecas;
- criar testes;
- reescrever código da aplicação.

O diff desta tarefa deve ser essencialmente:

```text
AGENTS.md
README.md
docs/*.md relacionados ao harness/roadmap
```

Se for necessário alterar código para “deixar a documentação correta”, NÃO faça.

Documente o estado real.

---

# 3. Estratégia de AGENTS.md

Usar dois níveis de instrução:

```text
/AGENTS.md
        ↓ regras globais do monorepo

/apps/frontend/AGENTS.md
/apps/bff/AGENTS.md
/apps/api/AGENTS.md
/apps/evolution-go/AGENTS.md
/apps/health-worker/AGENTS.md
        ↓ regras específicas do app
```

Não duplicar o conteúdo inteiro do AGENTS raiz em cada app.

O AGENTS raiz deve funcionar principalmente como:

```text
mapa
+
invariantes
+
fontes de verdade
+
arquitetura
+
guardrails
+
sequência de migração
```

Os AGENTS locais devem conter somente as particularidades do app.

---

# 4. Criar `/AGENTS.md`

Atualmente não existe um AGENTS raiz.

Criá-lo.

Ele deve ser conciso o suficiente para permanecer útil no contexto de agentes.

Não transforme o AGENTS raiz em um documento de milhares de linhas.

Prefira apontar para documentação detalhada.

Objetivo aproximado:

```text
100–200 linhas úteis
```

Pode ultrapassar isso moderadamente se necessário, mas evite duplicar especificações inteiras.

---

# 5. Conteúdo obrigatório do AGENTS raiz

O arquivo deve conter pelo menos as seguintes seções.

---

## 5.1 Mission

Explicar sucintamente:

Atendly é um SaaS multi-tenant de atendimento via WhatsApp e agendamento assistido por IA.

Resultado principal:

```text
Transformar conversas do WhatsApp em
agendamentos reais e válidos,
reduzindo trabalho manual.
```

Não tratar Atendly apenas como chatbot.

---

## 5.2 Estado atual do projeto

Deixar claro que o repositório está em uma transição arquitetural.

Estado atual:

```text
apps/frontend
apps/bff
apps/api
apps/evolution-go
apps/health-worker
```

O frontend novo já foi reconstruído seguindo o Open Design.

Backend ainda possui arquitetura legada a ser refatorada incrementalmente.

Não escrever que AI Orchestrator ou Scheduling Service já existem se ainda não existirem.

---

## 5.3 Arquitetura alvo

Documentar:

```text
Frontend
   │
   ▼
BFF
   │
   ├──────────────► AI Orchestrator
   │
   ├──────────────► Scheduling Service
   │
   └──────────────► Evolution Go
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

---

## 5.4 Invariantes arquiteturais globais

Registrar explicitamente:

1. Frontend conhece somente BFF.
2. Frontend não chama AI Orchestrator.
3. Frontend não chama Scheduling Service.
4. Frontend não chama Evolution Go diretamente.
5. Frontend não chama Minha Agenda diretamente.
6. BFF é o backend público da aplicação web.
7. O fluxo crítico inbound do WhatsApp não precisa passar pelo BFF.
8. AI Orchestrator será dono de Conversation, Message, Handoff e execução da IA.
9. Scheduling Service será dono de calendário, serviços, clientes, disponibilidade e appointments.
10. Evolution Go é transporte WhatsApp.
11. Um serviço não acessa diretamente tabelas pertencentes a outro.
12. Todo dado operacional deve se tornar tenant-aware.
13. `tenantId` jamais deve ser confiado diretamente ao browser para autorização.
14. LLM nunca acessa SQL diretamente.
15. LLM nunca acessa Minha Agenda diretamente.
16. Ações reais da IA passam por tools tipadas.
17. RAG não substitui dados operacionais estruturados.
18. LangGraph não é source of truth de appointments.
19. Não criar rota pública sem consumidor real.
20. Não manter implementação legada paralela depois da migração correspondente estar concluída.

---

# 6. Source of truth

Registrar prioridade das fontes.

Para produto e regras de negócio:

```text
1. docs/CONTEXTO_PRODUTO_ATENDLY.md
2. docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md
```

Para frontend/design:

```text
1. apps/frontend-open-design/DESIGN-HANDOFF.md
2. apps/frontend-open-design/DESIGN-MANIFEST.json
3. HTML/CSS/JS da tela correspondente
4. docs/DESIGN.md
5. implementação existente em apps/frontend
```

O frontend atual já passou pela reconstrução baseada no Open Design.

Não alterar visualmente apenas por preferência técnica.

---

# 7. Regras de produto não negociáveis no AGENTS raiz

Resumir sem copiar toda a especificação.

Incluir:

### Tenant

Todo negócio é isolado.

Nunca criar query operacional sem contexto de tenant quando a fase multi-tenant estiver implementada.

---

### Agenda

Exatamente uma fonte oficial:

```text
Agenda Atendly
OU
Minha Agenda
```

Nunca ambas simultaneamente como sources of truth.

Troca de origem é uma migração assistida.

Não é toggle.

---

### Appointment

Nunca:

- inventar disponibilidade;
- inventar serviço;
- inventar preço;
- apresentar falha como sucesso;
- confirmar antes da persistência real.

Reagendamento deve preservar atomicidade operacional.

Cancelamento preserva histórico.

Historical price snapshot não deve ser alterado posteriormente.

---

### AI

V1 possui apenas:

```text
Profissional e objetiva
Leve e próxima
```

Não criar:

```text
CUSTOM persona
assistant fictional identity
assistant sex
persona conversation training
```

sem nova decisão explícita de produto.

---

### RAG

RAG futuramente será usado para conhecimento não estruturado.

Adequado:

```text
FAQ
orientações
cuidados
descrições longas
informações do negócio
políticas textuais configuradas
```

Não adequado como fonte operacional para:

```text
preço atual
serviço ativo
availability
appointment
customer appointment
WhatsApp status
integration status
```

Toda retrieval será tenant-scoped.

---

# 8. Regra crítica de execução incremental

Adicionar uma seção explícita:

```text
DO NOT JUMP AHEAD
```

O projeto será refatorado através de goals sequenciais.

Um goal futuro NÃO pode ser implementado porque “seria melhor já aproveitar”.

Exemplo:

Se executando GOAL 03:

```text
não criar Scheduling Service
não instalar LangChain
não criar RAG
```

Mesmo que isso pareça conveniente.

Cada goal deve deixar o repositório estável antes do seguinte.

---

# 9. Sequência dos goals

Registrar os títulos:

```text
GOAL 01 — Baseline arquitetural e inventário
GOAL 02 — Tooling + shared contracts
GOAL 03 — Multi-tenancy BFF
GOAL 04 — Scheduling Service foundation
GOAL 05 — Minha Agenda CalendarProvider
GOAL 06 — Agenda Atendly CalendarProvider
GOAL 07 — AI Orchestrator multi-tenant
GOAL 08 — LangChain
GOAL 09 — LangGraph
GOAL 10 — RAG + pgvector
GOAL 11 — BFF Public API V1
GOAL 12 — Frontend data layer
GOAL 13 — Auth + Onboarding + Settings + WhatsApp
GOAL 14 — Services + Customers + Calendar
GOAL 15 — Conversations + Handoff
GOAL 16 — Dashboard + Calendar Migration
GOAL 17 — Legacy cleanup
GOAL 18 — Deploy + final architecture audit
```

Apontar para o roadmap detalhado criado nesta tarefa.

---

# 10. Criar `docs/ROADMAP_INTEGRACAO_V1.md`

Criar um documento persistente para impedir drift entre execuções.

O documento deve conter:

- arquitetura alvo;
- princípios globais;
- lista dos 18 goals;
- dependência entre goals;
- status.

Tabela inicial:

```text
Goal | Descrição | Depende de | Status
```

Todos começam:

```text
NOT_STARTED
```

com:

```text
NEXT: GOAL 01
```

Não marcar GOAL 01 como concluído nesta tarefa.

Esta tarefa ocorre ANTES dele.

Adicionar regra:

```text
Somente o goal explicitamente solicitado pelo usuário
pode ser alterado para IN_PROGRESS ou COMPLETED.
```

Não permitir que Codex marque goals seguintes como concluídos automaticamente.

---

# 11. Preservação do frontend

Adicionar guardrails explícitos no AGENTS raiz:

O frontend em `apps/frontend` foi reconstruído e deve ser considerado uma base visual aprovada.

Não:

- recomeçar frontend do zero;
- trocar design system;
- trocar navegação;
- “melhorar” visual sem solicitação;
- substituir o design por biblioteca de componentes;
- mudar spacing/colors arbitrariamente;
- alterar copy de produto silenciosamente.

Mudanças futuras devem principalmente integrar dados e comportamento mantendo a UI aprovada.

---

# 12. Código legado

Adicionar regra:

Código legado ainda necessário durante a migração não deve ser apagado antecipadamente.

Por outro lado:

quando o goal responsável terminar a migração e não existir mais consumidor:

```text
remover código legado
```

Não criar diretórios:

```text
old/
legacy/
deprecated/
backup/
```

apenas para guardar implementações substituídas.

Git é o histórico.

---

# 13. Rotas

Adicionar:

```text
Create only routes required by a real consumer.
```

Para BFF:

```text
public API = necessidade do frontend
```

Para serviços internos:

```text
internal API = necessidade do BFF ou outro serviço autorizado
```

Não criar CRUD completo automaticamente.

---

# 14. Qualidade

Regras globais:

- TypeScript strict;
- Zod nas boundaries;
- erros estruturados;
- request IDs;
- logs sem secrets;
- funções pequenas quando razoável;
- módulos por domínio;
- dependências direcionais claras;
- evitar `any`;
- evitar casts para esconder erro de tipo;
- não duplicar DTOs se existir shared contract adequado;
- não compartilhar Prisma entre serviços;
- não introduzir abstração sem consumidor real.

---

# 15. Testing policy atual

Registrar que, durante os goals atuais iniciais:

```text
não criar novos testes
```

até nova instrução explícita.

Porém:

- não quebrar testes existentes deliberadamente;
- não apagar teste ainda válido só porque novos testes estão fora de escopo;
- teste órfão pode ser removido junto com implementação removida no goal correto.

---

# 16. Validation policy

Cada goal futuro deve executar os checks existentes/aplicáveis.

A intenção final será:

```text
lint
typecheck
format:check
build
```

Mas NÃO adicione tooling agora apenas para cumprir isso.

Tooling será tratado pelo GOAL 02.

Nesta tarefa documental, execute somente comandos já existentes se necessário para confirmar que nenhum arquivo de aplicação foi modificado.

---

# 17. Atualizar `apps/frontend/AGENTS.md`

O arquivo existente contém uma regra importante sobre a versão do Next.js.

PRESERVAR integralmente a seção existente:

```text
<!-- BEGIN:nextjs-agent-rules -->
...
<!-- END:nextjs-agent-rules -->
```

Não remover.

Depois dela adicionar instruções específicas do frontend.

---

# 18. Frontend AGENTS — conteúdo obrigatório

Registrar:

### Stack atual

Inspecionar `package.json` e usar somente o que realmente existe.

Não documentar Tailwind se não estiver instalado/usado.

---

### Design

`apps/frontend-open-design` é referência imutável de design.

Não importar seus HTML/JS diretamente no runtime.

`apps/frontend` é a implementação React/Next real.

---

### Arquitetura frontend

Manter:

```text
app/
features/
shared/
mocks/
```

conforme estrutura real.

---

### Data access

Futuro contrato:

```text
UI
↓
service adapter
↓
BFF
```

Nunca:

```text
component
↓
fetch aleatório
```

---

### Backend boundary

Frontend conhece exclusivamente BFF.

Não importar nem referenciar URLs de:

```text
AI Orchestrator
Scheduling Service
Evolution Go
Minha Agenda
```

---

### Mocks

Estado atual ainda utiliza mocks.

Até GOAL 12/13:

```text
não conectar BFF prematuramente
```

Posteriormente:

```text
produto real -> Bff*Service
_preview -> Mock*Service
```

Não remover `_preview`, pois é útil para preservar estados visuais.

---

### UI freeze

Durante refatoração de backend:

não alterar layout visual sem necessidade direta do goal.

Integrações devem adaptar dados ao design existente.

---

### Styling

Preservar solução CSS atual.

Não introduzir Tailwind, shadcn ou outro design system apenas por preferência.

---

# 19. Criar `apps/bff/AGENTS.md`

O arquivo deve deixar claro que BFF está em transição.

---

## Responsabilidade alvo do BFF

```text
Auth
Session
Tenant resolution
Legal acceptance
Business/account profile
Frontend API
Response aggregation
Backend clients
WhatsApp lifecycle/configuration
```

---

## BFF NÃO será owner de

```text
Conversation
Message
Handoff
Appointment
Availability
Service scheduling
RAG
LLM orchestration
```

Mas algumas dessas responsabilidades ainda existem no código atual.

Portanto inserir:

```text
Do not delete transitional legacy responsibilities
until the explicit migration goal that replaces them.
```

---

## Segurança

Future tenant:

```text
session
↓
TenantMember
↓
TenantContext
```

Nunca confiar em tenant recebido arbitrariamente pelo browser.

---

## Database

BFF só acessa seu próprio domínio.

Não acessar futuro Scheduling DB nem AI DB diretamente.

---

## Internal clients

Integrações futuras devem usar clients explícitos:

```text
AiOrchestratorClient
SchedulingClient
EvolutionClient
```

---

# 20. Criar `apps/api/AGENTS.md`

Este é especialmente importante porque `apps/api` é transitório.

Registrar no topo:

```text
TRANSITIONAL APPLICATION
```

Explicar:

- este app contém hoje orchestration de IA;
- também contém Minha Agenda legacy;
- será progressivamente transformado;
- não renomeá-lo antes do GOAL 07;
- Minha Agenda só sai no GOAL 05;
- LangChain só entra no GOAL 08;
- LangGraph só entra no GOAL 09;
- RAG/pgvector só entram no GOAL 10.

Isso deve impedir o agente de executar quatro goals de uma vez.

---

## Código valioso a preservar

Registrar que há implementações existentes que devem ser reutilizadas:

```text
MessageOrchestrator
AssistantService
EvolutionInboundMapper
EvolutionProvider
WhatsAppProvider
HandoffService
IdempotencyStore
prompt rules
Minha Agenda client/facade até sua extração
```

Não fazer rewrite big-bang.

---

## Target

Depois da fase correta:

```text
apps/api
↓
apps/ai-orchestrator
```

Mas apenas no goal correspondente.

---

# 21. Criar `apps/evolution-go/AGENTS.md`

Manter curto.

Responsabilidade:

```text
WhatsApp transport/provider
```

Não adicionar:

```text
AI business logic
scheduling logic
tenant business rules
RAG
prompt logic
```

Evitar alterações no fork sem necessidade explícita.

Preservar compatibilidade com integrações existentes.

Antes de mudar endpoint/protocolo:

procurar consumidores em BFF/API.

---

# 22. Criar `apps/health-worker/AGENTS.md`

Manter extremamente curto.

Responsabilidade:

```text
health monitoring only
```

Não mover regra de negócio para health-worker.

Não transformá-lo em job runner genérico durante esta refatoração.

---

# 23. `apps/frontend-open-design`

Não modificar seu conteúdo de design nesta tarefa.

Se já possui `AGENTS.md`, preservar.

O diretório é:

```text
REFERENCE / DESIGN CONTRACT
```

e não a aplicação production.

Adicionar essa regra no AGENTS raiz/frontend.

---

# 24. Corrigir `docs/AGENTS.md`

O atual `docs/AGENTS.md` é um arquivo criado para o antigo trabalho de prototipação UI/UX.

Ele NÃO deve continuar com nome `AGENTS.md`, porque instruções dentro de `docs/` passam a controlar trabalho futuro feito nesse diretório e seu conteúdo não representa mais a função geral de um agente trabalhando na documentação.

Faça:

```text
git mv docs/AGENTS.md docs/UI_UX_PROTOTYPE_GUIDELINES.md
```

ou um nome equivalente claro.

Preservar o conteúdo histórico/relevante.

Não simplesmente apagar.

Atualizar referências internas que apontem para `docs/AGENTS.md`.

O novo arquivo é documentação de design/produto, não harness de Codex.

---

# 25. README raiz

Reescrever o README raiz para refletir o estado REAL.

Não transformar o target em current state.

Estruturar claramente:

```text
# Atendly

## O produto

## Estado atual do repositório

## Apps

## Arquitetura atual

## Arquitetura alvo

## Plano de migração

## Fontes de verdade

## Setup local

## Validações

## Deploy

## Documentação
```

---

# 26. Corrigir informações obsoletas no README raiz

Remover/corrigir afirmações como:

```text
Monorepo privado
```

se o repositório atual é público.

Separar:

```text
CURRENT
```

de:

```text
TARGET
```

Não escrever que já existem:

```text
ai-orchestrator
scheduling-service
```

se ainda não existem.

Mostrar target como target.

---

# 27. Apps no README raiz

Listar somente diretórios reais.

Estado atual deve incluir:

```text
frontend
frontend-open-design
bff
api
evolution-go
health-worker
```

Explicar `frontend-open-design` como referência visual, não serviço.

---

# 28. Setup local

Inspecionar package.json atuais.

Não copiar comandos antigos cegamente.

Documentar comandos que realmente existem.

---

# 29. Deploy

Usar `render.yaml` como fonte.

Não inventar serviços que ainda não foram criados.

Pode existir uma seção:

```text
Target after refactor
```

separada do deploy atual.

---

# 30. Atualizar `apps/frontend/README.md`

O README atual pertence em grande parte ao frontend antigo.

Reescrevê-lo com base na implementação NOVA.

Deve conter:

```text
# Atendly Frontend

## Purpose
## Stack
## Architecture
## Directory structure
## Design source of truth
## Current data state
## Routes
## Commands
## Environment
## Preview system
## Backend boundary
## Migration status
```

---

# 31. Frontend README — não manter informações antigas sem verificar

Não afirmar:

```text
Tailwind CSS
Next /api proxy
/chat
/ia
/settings/account legado
persona
webhook frontend
```

a menos que estejam realmente presentes na implementação nova.

Inspecionar `src/app`.

Documentar rotas reais.

---

# 32. Frontend README — estado atual

Deixar explícito:

```text
O novo frontend foi implementado com base no Open Design.
Nesta etapa, os fluxos de dados ainda utilizam mocks.
A futura integração será exclusivamente com o BFF.
```

Não escrever que o BFF já está integrado se não estiver.

---

# 33. Criar `apps/bff/README.md` se não existir

Documentar estado REAL.

Estrutura:

```text
Purpose
Current responsibilities
Transitional responsibilities
Target responsibilities
Stack
Architecture
Database
Auth/session
Current routes
Environment
Commands
Migration notes
```

Diferenciar explicitamente:

```text
CURRENT
TARGET
```

---

# 34. Atualizar `apps/api/README.md`

O README atual descreve o MVP antigo como se fosse a arquitetura final.

Reescrever com duas partes:

```text
Current transitional role
Target role
```

Explicar que:

- ainda contém AI orchestration;
- ainda contém integração Minha Agenda neste momento;
- será refatorado incrementalmente;
- não deve sofrer big-bang rewrite.

Não escrever que LangChain/LangGraph/RAG já existem.

---

# 35. Evolution Go e Health Worker READMEs

Auditar READMEs existentes.

Só alterar se houver informação objetivamente desatualizada ou conflitante.

Não reescrever sem necessidade.

---

# 36. Criar `docs/README.md`

Criar índice simples da documentação.

Exemplo:

```text
Product
- CONTEXTO_PRODUTO_ATENDLY.md
- ESPECIFICACAO_TELAS_UX_ATENDLY.md

Design
- DESIGN.md
- UI_UX_PROTOTYPE_GUIDELINES.md
- apps/frontend-open-design/...

Engineering
- ROADMAP_INTEGRACAO_V1.md

Agent instructions
- /AGENTS.md
- scoped AGENTS inside apps
```

Se algum documento citado não existir, não inventar.

---

# 37. Evitar duplicação documental

Não copiar os mesmos 100 parágrafos para:

```text
AGENTS.md
README.md
ROADMAP.md
```

Responsabilidades:

### AGENTS

```text
como o agente deve trabalhar
guardrails
fontes
invariantes
```

### README

```text
como humano entende e executa o projeto
```

### ROADMAP

```text
sequência de migração
```

### CONTEXTO/ESPECIFICAÇÃO

```text
produto e regras
```

---

# 38. Current vs target

Este conceito deve aparecer em toda documentação de arquitetura.

Nunca misturar:

```text
já existe
```

com:

```text
será criado
```

Usar labels claras:

```text
Current
Target
Planned
Transitional
```

Isso é especialmente importante para:

```text
apps/api
AI Orchestrator
Scheduling Service
RAG
LangChain
LangGraph
multi-tenancy
```

---

# 39. Consistência de nomenclatura

Padronizar:

```text
Atendly
BFF
AI Orchestrator
Scheduling Service
Evolution Go
Agenda Atendly
Minha Agenda
Open Design
```

Evitar continuar usando nomes antigos como:

```text
Atendente IA
salao-whatsapp-api
whatsapp-ai-inbox
```

como nome conceitual do produto.

Esses nomes podem continuar tecnicamente em package metadata até o goal apropriado, mas não devem confundir documentação arquitetural.

---

# 40. Não alterar package names agora

Apesar de alguns package names estarem antigos:

NÃO renomeá-los nesta tarefa.

Apenas registrar quando necessário que são nomes legados.

Renames técnicos pertencem aos goals de refatoração.

---

# 41. Não alterar Render agora

Não modificar `render.yaml` nesta tarefa.

Apenas documentar seu estado atual corretamente.

Mudanças de serviços acontecerão nos goals correspondentes.

---

# 42. Não alterar env files agora

Não remover nem adicionar env vars.

Somente atualizar documentação se estiver objetivamente errada.

Mudança real de env pertence ao respectivo goal.

---

# 43. Auditoria obrigatória após alterações

Depois de editar todos os documentos:

## Verificar AGENTS hierarchy

Confirmar que existem:

```text
/AGENTS.md
/apps/frontend/AGENTS.md
/apps/bff/AGENTS.md
/apps/api/AGENTS.md
/apps/evolution-go/AGENTS.md
/apps/health-worker/AGENTS.md
```

E que:

```text
docs/AGENTS.md
```

não permanece como agente de prototipação.

---

# 44. Auditar conflitos entre AGENTS

Ler novamente todos.

Garantir que um scoped AGENTS não contradiz os invariantes globais.

Exemplos de conflito proibido:

Frontend AGENT permitindo API direta.

BFF AGENT dizendo que BFF é owner definitivo de Conversation.

API AGENT dizendo para instalar LangGraph imediatamente.

---

# 45. Auditar README vs código

Para cada README:

```text
comando documentado existe?
diretório existe?
rota documentada existe?
dependência documentada existe?
env documentada existe?
serviço documentado existe?
```

Se não:

corrigir README.

---

# 46. Auditar README vs AGENTS

README pode explicar.

AGENTS pode instruir.

Eles não podem descrever arquiteturas diferentes.

---

# 47. Links

Verificar links e paths Markdown.

Não manter referências para arquivos que não existem.

Especial atenção aos READMEs antigos, que podem apontar para documentos removidos.

---

# 48. Git diff

Ao final:

```bash
git diff --check
```

Deve passar.

Verificar:

```bash
git status --short
```

Confirmar que não houve alteração acidental de código.

---

# 49. Nenhuma mudança de runtime

O relatório final deve confirmar explicitamente:

```text
No runtime application code was intentionally changed.
No database schema was changed.
No dependency was added or removed.
No API route was created or removed.
No migration goal was started.
```

Se qualquer uma dessas afirmações não for verdadeira:

explique e reverta a mudança antes de finalizar, salvo necessidade incontornável.

---

# 50. Relatório final obrigatório

Ao terminar, não responda apenas “feito”.

Entregar:

## Created

Lista de arquivos criados.

## Updated

Lista de arquivos atualizados.

## Renamed

Lista de arquivos renomeados.

## AGENTS hierarchy

Mostrar árvore resultante.

## Documentation hierarchy

Mostrar:

```text
AGENTS
README
ROADMAP
product docs
design docs
```

## Stale information corrected

Listar objetivamente informações antigas encontradas e corrigidas.

## Current vs target architecture

Confirmar que estão claramente separadas.

## Validation

Resultado de:

```text
git diff --check
```

e auditoria manual de links/paths.

## Runtime impact

Confirmar:

```text
none
```

## Next goal

Informar:

```text
GOAL 01 — Baseline arquitetural e inventário definitivo
```

mas NÃO iniciar o GOAL 01.

---

# Definition of Done

Esta tarefa só está pronta quando um novo Codex, sem conhecer conversas anteriores, puder entrar no repositório e compreender apenas através da documentação:

1. o que é Atendly;
2. qual é o estado atual;
3. qual é a arquitetura alvo;
4. que o frontend novo já está visualmente aprovado;
5. que não deve reconstruí-lo;
6. que frontend só falará com BFF;
7. quem será owner de cada domínio;
8. que multi-tenancy é obrigatório;
9. que LangChain, LangGraph e RAG ainda são etapas futuras;
10. quando cada tecnologia deve ser introduzida;
11. que não pode avançar goals por conta própria;
12. quais regras de negócio não pode quebrar;
13. quais arquivos consultar antes de tomar decisões;
14. quais comandos e padrões seguir no app em que estiver trabalhando;
15. que o próximo trabalho é exclusivamente GOAL 01.

Não iniciar nenhuma implementação da refatoração após configurar o harness.