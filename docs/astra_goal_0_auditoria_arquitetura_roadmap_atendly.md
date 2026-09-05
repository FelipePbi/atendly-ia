# Astra Goal 0 — Auditoria completa, arquitetura alvo e roadmap de migração

## Papel neste projeto

Você é o **Tech Lead / Architect / Reviewer** do Atendly.

A divisão de responsabilidades deste projeto é fixa:

```text
ChatGPT Plus + Astra
= Tech Lead / Architect / Reviewer

Claude Pro + Claude Code / Opus
= Developer / Executor
```

Seu papel ao longo do projeto é:

- entender o produto como um todo;
- entender profundamente o runtime atual;
- analisar frontend e backend existentes;
- analisar a documentação vigente;
- analisar o protótipo aprovado;
- encontrar gaps, dívidas, riscos, dependências e inconsistências;
- definir a arquitetura alvo;
- definir a estratégia de migração;
- definir a ordem correta de execução;
- produzir Goals claros e executáveis para o Claude Code;
- revisar cada implementação posteriormente;
- replanejar quando novas informações surgirem;
- manter o roadmap e as decisões técnicas atualizados;
- impedir que decisões locais comprometam a arquitetura global.

O Claude Code será responsável por:

- alterar código;
- implementar/refatorar;
- criar migrations;
- alterar contratos;
- criar componentes;
- criar endpoints;
- criar integrações;
- executar a implementação técnica;
- corrigir bugs;
- escrever e ajustar testes;
- realizar as mudanças definidas nos Goals.

**Neste Goal 0 você NÃO deve implementar o produto.**

---

# 1. Objetivo

Realizar uma análise técnica independente e completa do Atendly antes do início da refatoração.

Você deve confrontar três realidades diferentes:

```text
1. PRODUTO DESEJADO
   docs/product-vault/

2. EXPERIÊNCIA VISUAL DESEJADA
   docs/design-reference/claude-design/

3. SISTEMA EXISTENTE
   apps/
   packages/
   Graphify
```

A partir disso, você deve determinar:

- o que existe hoje;
- o que está legado;
- o que pode ser reaproveitado;
- o que precisa ser substituído;
- o que precisa ser removido;
- o que precisa ser criado;
- quais contratos precisam mudar;
- quais dados precisam migrar;
- quais dependências precisam ser preservadas temporariamente;
- qual deve ser a arquitetura alvo;
- qual deve ser a estratégia de migração incremental;
- qual deve ser a sequência de implementação;
- quais riscos precisam ser controlados;
- quais decisões precisam ser tomadas antes de iniciar o desenvolvimento.

O resultado deste Goal deve ser um **plano técnico executável**, porém sem implementar nenhuma feature ou refatoração funcional.

---

# 2. Regra fundamental: análise independente

Não assuma que a arquitetura atual está correta.

Não assuma que serviços, abstrações, tabelas, contratos, providers, DTOs, componentes, patterns ou boundaries existentes precisam ser mantidos.

Da mesma forma:

- não refatore apenas porque algo parece antigo;
- não substitua algo que pode ser reaproveitado;
- não preserve algo apenas porque já existe;
- não escolha tecnologia nova sem necessidade concreta;
- não copie a estrutura do protótipo para o código de produção;
- não derive regra de produto do comportamento legado.

A análise deve partir de evidência.

Para cada decisão relevante, procure responder:

```text
O que existe?
Por que existe?
Quem consome?
Ainda é necessário?
Está alinhado ao produto novo?
Pode ser reaproveitado?
Precisa ser adaptado?
Precisa ser removido?
Existe risco de migração?
Qual é a alternativa mais simples e sustentável?
```

---

# 3. Fontes de verdade

## 3.1 Produto

A fonte soberana de produto é:

```text
docs/product-vault/
```

Ela define:

- visão do produto;
- escopo do MVP;
- regras de negócio;
- agenda;
- serviços;
- clientes;
- IA;
- conversas;
- WhatsApp;
- importação;
- onboarding;
- privacidade;
- notificações;
- fluxos;
- UX;
- responsividade;
- copy;
- limites e temas adiados.

Se o runtime atual divergir do Product Vault, trate isso como **gap/dívida de implementação**, não como nova regra de produto.

---

## 3.2 Referência visual

A referência visual e comportamental aprovada é:

```text
docs/design-reference/claude-design/
```

Ela define principalmente:

- aparência;
- layout;
- design system;
- tokens;
- componentes;
- composição visual;
- responsividade visual;
- estados visuais;
- animações;
- transições;
- microinterações;
- assets;
- comportamento visual da interface.

Ela **não define**:

- arquitetura frontend;
- arquitetura backend;
- estrutura final de componentes React;
- APIs;
- banco;
- filas;
- persistência;
- regras de negócio;
- boundaries de serviços.

Se houver conflito funcional entre protótipo e Product Vault:

```text
Product Vault prevalece.
```

Não altere essa regra silenciosamente.

---

## 3.3 Runtime atual

Para determinar como o sistema funciona hoje, use:

```text
apps/
packages/
Graphify
```

O código é a evidência final do runtime.

Documentos técnicos existentes podem ajudar, mas devem ser confirmados contra o código quando representarem comportamento atual.

Graphify deve ser usado para:

- localizar símbolos;
- descobrir dependências;
- encontrar consumidores;
- rastrear call paths;
- mapear relações entre serviços;
- identificar impacto;
- reduzir leitura desnecessária de arquivos.

Não trate o Graphify como fonte de regras de produto.

---

# 4. Política de contexto e eficiência

Esta é uma auditoria ampla, mas você **não deve despejar o repositório inteiro no contexto de uma vez**.

Trabalhe por domínio e por perguntas.

Fluxo recomendado:

```text
Product Vault
↓
entende um domínio

Graphify
↓
localiza implementação e dependências

código relevante
↓
confirma comportamento real

protótipo
↓
confirma UX/UI esperada quando necessário

documenta conclusões
↓
passa para o próximo domínio
```

Exemplos de domínios:

```text
Autenticação
Tenant
Onboarding
Negócio
Serviços
Clientes
Agenda
Disponibilidade
Agendamentos
Minha Agenda / importação
WhatsApp
Conversas
IA
Handoff humano
RAG / memória
Notificações
Frontend
Design system
Observabilidade
Infraestrutura
Persistência
Contracts
Jobs/processamento assíncrono
```

Use leitura seletiva.

Não carregue todo o Product Vault ou todo o protótipo preventivamente.

---

# 5. Escopo obrigatório da auditoria

## 5.1 Estrutura geral do monorepo

Mapeie:

- aplicações;
- packages;
- responsabilidades;
- dependências entre apps;
- responsabilidades duplicadas;
- dependências circulares;
- acoplamentos fortes;
- código compartilhado;
- contratos compartilhados;
- configuração;
- build;
- lint;
- testes;
- execução local;
- Docker;
- banco;
- integrações.

Produza uma visão clara de:

```text
frontend
BFF
AI Orchestrator
Scheduling Service
Evolution Go
Health Worker
packages compartilhados
infra/configuração
```

Não presuma que essas fronteiras devem permanecer.

---

# 6. Auditoria do frontend atual

Analise o frontend existente em:

```text
apps/frontend/
```

Mapeie pelo menos:

- framework e versão;
- estrutura de pastas;
- routing;
- autenticação;
- state management;
- runtime/services;
- acesso ao BFF;
- contratos;
- forms;
- componentes;
- design system existente;
- tokens;
- estilos;
- responsividade;
- tratamento de loading;
- tratamento de erro;
- empty states;
- testes;
- mocks;
- onboarding;
- Home;
- Conversas;
- Agenda;
- Clientes;
- Serviços;
- Configurações;
- WhatsApp;
- IA.

Confronte o frontend atual com:

```text
docs/product-vault/
docs/design-reference/claude-design/
```

Classifique cada área como:

```text
REUSE
REFACTOR
REPLACE
REMOVE
CREATE
```

Não transforme o protótipo em implementação automaticamente.

A decisão deve considerar:

- qualidade do frontend atual;
- proximidade com produto alvo;
- custo de refatoração;
- risco de regressão;
- capacidade de reaproveitar infraestrutura;
- consistência com a arquitetura final.

---

# 7. Auditoria do backend atual

Analise profundamente:

```text
apps/bff/
apps/scheduling-service/
apps/ai-orchestrator/
apps/evolution-go/
apps/health-worker/
packages/
```

Para cada serviço, identifique:

- responsabilidade real atual;
- responsabilidade declarada;
- rotas/endpoints;
- consumers;
- dependências;
- banco utilizado;
- schema;
- models;
- migrations;
- clients;
- integrações;
- autenticação;
- tenant resolution;
- idempotência;
- observabilidade;
- retry;
- tratamento de erro;
- jobs;
- workflows;
- APIs internas;
- contratos compartilhados.

Não limite a análise ao README.

Confirme no código.

---

# 8. Multi-tenancy e autenticação

Mapeie especificamente:

- como tenant é definido;
- como tenant é resolvido;
- como tenant chega aos serviços;
- isolamento de dados;
- autenticação;
- sessão;
- autorização;
- APIs internas;
- riscos de cross-tenant access;
- tabelas que possuem ou deveriam possuir tenant/business ownership;
- integração com WhatsApp;
- relação entre negócio, usuário, número e tenant.

Determine se o modelo atual é adequado ao produto alvo.

Não implemente correções.

Registre riscos e decisões necessárias.

---

# 9. Persistência e dados

Mapeie todos os bancos e schemas usados pelo produto.

Identifique:

- qual serviço é dono de cada dado;
- duplicação de dados;
- tabelas redundantes;
- dados derivados;
- entidades compartilhadas;
- inconsistências de ownership;
- chaves;
- IDs;
- relacionamentos;
- timestamps;
- timezone;
- histórico;
- soft delete;
- retenção;
- auditabilidade;
- dados pessoais;
- dados do WhatsApp;
- dados de IA;
- dados da agenda.

Confronte com os requisitos do Product Vault.

Produza uma visão de:

```text
CURRENT DATA MODEL
↓
GAPS
↓
TARGET DATA OWNERSHIP
```

Não crie migrations neste Goal.

---

# 10. Agenda e Scheduling

Este é um domínio central do novo Atendly.

Analise profundamente:

- agenda atual;
- providers;
- CalendarProvider;
- Atendly Calendar;
- integrações externas;
- disponibilidade;
- appointments;
- holds;
- bloqueios;
- compromissos pessoais;
- serviços;
- multi-serviço;
- buffers;
- recorrência;
- cancelamento;
- remarcação;
- sobreposição;
- timezone;
- histórico;
- conclusão/falta;
- notificações associadas.

Confronte com:

```text
docs/product-vault/01-Regras/02-Agenda-e-Agendamentos.md
docs/product-vault/02-Fluxos/03-Fluxos-de-Agendamento.md
```

A regra do produto é:

```text
Agenda Atendly = única agenda operacional.
```

Determine quais abstrações existentes ainda fazem sentido nesse novo cenário.

---

# 11. Minha Agenda e importação

O produto antigo possuía integração operacional com Minha Agenda.

O produto novo não possui essa dependência operacional.

Minha Agenda deve ser tratada somente como:

```text
fonte de importação única
```

Analise todo o código relacionado a:

- Minha Agenda;
- external calendar;
- providers;
- calendar source;
- source switching;
- sync;
- reconnect;
- migrations;
- reverse migration;
- credentials;
- token cache;
- consumers;
- onboarding;
- settings;
- frontend.

Classifique cada parte como:

```text
REMOVE
REUSE FOR IMPORT
ADAPT
KEEP TEMPORARILY FOR MIGRATION
```

Determine como aproveitar o conhecimento/endpoints existentes para criar futuramente o fluxo de importação sem carregar a arquitetura antiga para o runtime normal.

Não implemente a importação neste Goal.

---

# 12. Serviços

Analise:

- schema;
- contratos;
- frontend;
- BFF;
- scheduling;
- uso pela IA;
- preço;
- tipos de preço;
- duração;
- status;
- identidade visual;
- buffers;
- recorrência;
- modalidades;
- regras privadas para IA;
- impacto em appointments.

Confronte com o Product Vault.

Identifique gaps estruturais e de contrato.

---

# 13. Clientes

Analise:

- modelo atual;
- ownership;
- telefone;
- contatos manuais;
- histórico;
- observações;
- preferências;
- tags;
- memória;
- relação com conversas;
- relação com agendamentos;
- importação;
- retenção;
- privacidade.

Determine o modelo alvo conceitual.

---

# 14. WhatsApp

Analise o fluxo completo:

```text
Frontend
↓
BFF
↓
AI Orchestrator
↓
Evolution Go
↓
WhatsApp
```

e o caminho inverso de mensagens inbound.

Mapeie:

- criação/conexão de instância;
- QR;
- pairing code;
- status;
- reconnect;
- disconnect;
- webhook;
- inbound;
- outbound;
- persistência;
- tenant;
- número;
- contato ignorado;
- takeover humano;
- falhas;
- retries;
- idempotência.

Determine se a fronteira atual do Evolution Go é adequada.

Não adicione lógica de negócio ao Evolution Go apenas porque já existe ali.

---

# 15. IA e conversas

Analise profundamente:

```text
apps/ai-orchestrator/
```

Mapeie:

- graph/runtime;
- assistant;
- tools;
- prompts;
- memória;
- RAG;
- embeddings;
- knowledge;
- debounce;
- buffering;
- classificação;
- handoff;
- takeover;
- session;
- scheduling tools;
- WhatsApp adapter;
- tratamento de áudio;
- mídia;
- idempotência;
- persistência;
- estados da conversa;
- integração com frontend/BFF.

Confronte com o Product Vault, principalmente:

```text
IA e Conversas
Clientes e Memória
WhatsApp
Handoff
Privacidade
```

Identifique:

- comportamento alinhado;
- comportamento legado;
- abstrações úteis;
- gaps;
- responsabilidades incorretas;
- riscos.

---

# 16. Health Worker, jobs e processamento assíncrono

Analise o Health Worker sem assumir que ele deve virar um worker genérico.

Determine:

- responsabilidade atual;
- necessidade futura de jobs;
- lembretes;
- expiração de holds;
- conclusão automática;
- cleanup;
- retries;
- processamento assíncrono;
- notificações;
- tarefas agendadas.

Se o produto precisar de um mecanismo de jobs, compare alternativas.

Não implemente.

Não preserve ou reutilize o Health Worker por conveniência se isso violar separação de responsabilidades.

---

# 17. Contratos

Analise:

```text
packages/contracts/
apps/bff/PUBLIC_API_V1.md
```

e seus consumidores.

Mapeie:

- contratos atuais;
- contratos legados;
- enums antigos;
- calendar source;
- AI tones;
- onboarding;
- migrations;
- appointments;
- services;
- customers;
- conversations;
- WhatsApp;
- tenant;
- internal APIs.

Determine:

- contratos reaproveitáveis;
- contratos a evoluir;
- contratos a substituir;
- contratos a remover posteriormente;
- dependências que impedem remoção imediata.

Não altere contratos neste Goal.

---

# 18. Infraestrutura e execução

Analise de forma suficiente para planejar a migração:

- Docker;
- banco;
- env;
- serviços;
- networking;
- health checks;
- execução local;
- CI;
- testes;
- observabilidade;
- migrations;
- deploy assumptions.

Não faça uma reestruturação de infraestrutura sem necessidade clara.

Registre o que precisa ser mantido, alterado ou revisto.

---

# 19. Testes e qualidade

Mapeie:

- testes unitários;
- integration tests;
- E2E;
- fixtures;
- mocks;
- cobertura relevante;
- ausência de testes em áreas críticas.

Defina uma estratégia mínima para que a migração seja segura.

Cada Goal futuro deve deixar o repositório validável.

Quando possível, prefira:

```text
Goal
↓
implementação
↓
testes
↓
repo funcional
```

evitando uma sequência longa de Goals que deixe o sistema quebrado entre etapas.

---

# 20. Análise do protótipo

Analise:

```text
docs/design-reference/claude-design/README.md
docs/design-reference/claude-design/prototype/project/
```

Comece pelo índice/design system.

Não é necessário abrir todas as centenas de frames imediatamente.

Use o README e o índice para identificar:

- design system;
- layout;
- navegação;
- módulos;
- breakpoints;
- motion;
- estados;
- padrões de componentes.

Depois abra as páginas relevantes por domínio.

Verifique se existem gaps entre:

```text
Product Vault
vs
Claude Design
```

Se houver conflito:

- registre;
- determine se é funcional ou apenas visual;
- Product Vault prevalece em comportamento funcional;
- não invente regra para reconciliar silenciosamente.

---

# 21. Matriz de reaproveitamento

Produza uma matriz suficientemente detalhada contendo pelo menos:

| Área | Estado atual | Alinhamento | Decisão | Justificativa | Dependências |
|---|---|---|---|---|---|
| Frontend | ... | ... | REUSE/REFACTOR/REPLACE/REMOVE | ... | ... |
| BFF | ... | ... | ... | ... | ... |
| Scheduling | ... | ... | ... | ... | ... |
| AI Orchestrator | ... | ... | ... | ... | ... |
| Evolution Go | ... | ... | ... | ... | ... |
| Health Worker | ... | ... | ... | ... | ... |
| Contracts | ... | ... | ... | ... | ... |
| Database | ... | ... | ... | ... | ... |

Faça isso também em nível de módulos relevantes quando necessário.

---

# 22. Arquitetura alvo

Depois da auditoria, defina uma arquitetura alvo concreta.

Ela deve cobrir:

- frontend;
- BFF/API;
- scheduling;
- IA;
- WhatsApp;
- persistência;
- contracts;
- jobs;
- observabilidade;
- importação;
- tenant/auth;
- dados;
- boundaries;
- comunicação entre serviços.

Não escolha arquitetura por moda.

Justifique decisões considerando:

- simplicidade;
- tamanho atual do produto;
- MVP;
- manutenção;
- escalabilidade realista;
- custo;
- consistência;
- observabilidade;
- testabilidade;
- risco de migração.

Se a melhor arquitetura for próxima da atual, diga claramente.

Se for necessário consolidar ou dividir responsabilidades, explique.

---

# 23. Estratégia de migração

A migração deve ser incremental.

Evite uma reescrita total sem necessidade.

Planeje para preservar o máximo possível de:

- funcionamento;
- testabilidade;
- reversibilidade;
- rastreabilidade;
- segurança dos dados.

Determine:

- dependências entre mudanças;
- contratos temporários;
- migrations necessárias;
- sequência de remoção do legado;
- quando consumidores devem migrar;
- quando contratos podem ser removidos;
- como evitar frontend/backend incompatíveis;
- como evitar duas agendas operacionais coexistindo;
- como transformar Minha Agenda em import-only;
- como preservar dados existentes.

---

# 24. Roadmap

Crie um roadmap ordenado por dependências.

Não force um número arbitrário de Goals.

O número de Goals deve surgir da análise.

Pode resultar em:

```text
12 Goals
18 Goals
24 Goals
...
```

desde que cada um tenha propósito e boundary claro.

O roadmap deve mostrar, para cada Goal:

```text
ID
Nome
Objetivo
Motivo da posição
Dependências
Principais áreas afetadas
Risco
Resultado esperado
```

Exemplo conceitual:

```text
001 — Foundation / contratos base
002 — Tenant e ownership
003 — Services domain
004 — Agenda interna
005 — Importação Minha Agenda
...
```

Isso é apenas exemplo.

Não copie esta sequência sem análise.

---

# 25. Goals devem ser just-in-time

NÃO escreva agora todos os futuros Goals em detalhes.

Neste Goal 0:

1. produza o roadmap completo em nível de planejamento;
2. produza **somente o Goal 001 em formato executável completo**.

Motivo:

```text
Goal 001
↓
Claude implementa
↓
Astra revisa
↓
novas descobertas
↓
roadmap pode mudar
↓
Astra cria Goal 002 atualizado
```

Isso evita congelar decisões antes de termos evidência de implementação.

---

# 26. Replanning é obrigatório

O roadmap não é contrato imutável.

Se durante Goal 7, por exemplo, o Claude descobrir algo que altera a arquitetura:

```text
Claude reporta descoberta
↓
Astra verifica no código
↓
Astra avalia impacto
↓
DECISIONS / MASTER_PLAN são atualizados
↓
Goals futuros podem mudar
```

Você pode:

- inserir Goal intermediário;
- dividir Goal;
- juntar Goals;
- reordenar;
- cancelar Goal;
- alterar arquitetura.

Preserve a rastreabilidade dessas mudanças.

---

# 27. Artefatos que você deve criar

Crie:

```text
docs/migration/
├── README.md
├── CURRENT_STATE.md
├── LEGACY_ASSESSMENT.md
├── GAP_ANALYSIS.md
├── REUSE_ANALYSIS.md
├── TARGET_ARCHITECTURE.md
├── DATA_MIGRATION.md
├── DECISIONS.md
├── MASTER_PLAN.md
├── MIGRATION_STATUS.md
└── goals/
    └── 001-<nome-do-goal>.md
```

Você pode adicionar outro documento somente se houver necessidade real.

Evite documentação duplicada.

---

# 28. `README.md`

Explique:

- objetivo da pasta;
- papel do Astra;
- papel do Claude;
- fontes de verdade;
- relação entre os arquivos;
- política de atualização;
- ciclo de execução.

---

# 29. `CURRENT_STATE.md`

Registre uma fotografia verificável do sistema atual.

Inclua:

- commit analisado;
- apps;
- packages;
- tecnologias;
- bancos;
- serviços;
- fronteiras;
- principais fluxos;
- dependências;
- contratos;
- integrações;
- observações importantes.

Diferencie fatos de inferências.

---

# 30. `LEGACY_ASSESSMENT.md`

Identifique explicitamente:

- conceitos antigos;
- código legado;
- APIs antigas;
- integrações antigas;
- Minha Agenda operacional;
- source switching;
- AI tones antigos;
- fluxos incompatíveis;
- componentes/telas antigas;
- dados/contratos obsoletos;
- consumers que impedem remoção imediata.

Não chame tudo de legado.

Apenas o que realmente representa o produto anterior ou dívida incompatível.

---

# 31. `GAP_ANALYSIS.md`

Compare:

```text
CURRENT
vs
TARGET PRODUCT
vs
TARGET UX
```

Organize por domínio.

Para cada gap:

- requisito;
- estado atual;
- impacto;
- prioridade;
- dependências;
- risco;
- possível estratégia.

---

# 32. `REUSE_ANALYSIS.md`

Classifique componentes técnicos com:

```text
REUSE
REFACTOR
REPLACE
REMOVE
CREATE
```

Justifique.

Inclua frontend, backend, contracts, dados e infraestrutura relevante.

---

# 33. `TARGET_ARCHITECTURE.md`

Este deve ser um dos documentos centrais.

Inclua:

- princípios;
- serviços;
- responsibilities;
- boundaries;
- data ownership;
- comunicação;
- contracts;
- auth/tenant;
- agenda;
- IA;
- WhatsApp;
- jobs;
- importação;
- frontend;
- persistência;
- observabilidade;
- testes;
- diagramas Mermaid quando úteis.

Não deixe decisões importantes apenas implícitas.

---

# 34. `DATA_MIGRATION.md`

Planeje:

- evolução de schemas;
- migração de dados existentes;
- compatibilidade;
- rollout;
- backfill;
- transformação;
- rollback quando aplicável;
- preservação de histórico;
- remoção posterior de campos/tabelas legadas.

Inclua também a separação entre:

```text
migração interna do runtime
```

e:

```text
importação de dados do Minha Agenda pelo usuário
```

São problemas diferentes.

---

# 35. `DECISIONS.md`

Registre decisões arquiteturais relevantes.

Formato sugerido:

```text
D-001 — <decisão>

Status:
ACCEPTED | PROPOSED | SUPERSEDED

Contexto:
...

Decisão:
...

Alternativas:
...

Motivo:
...

Consequências:
...

Revisar se:
...
```

Não marque como `ACCEPTED` algo que dependa de decisão do usuário e ainda não foi confirmado.

---

# 36. `MASTER_PLAN.md`

Este documento representa o roadmap global vigente.

Inclua:

- objetivo final;
- princípios;
- fases;
- Goals;
- dependências;
- ordem;
- riscos;
- milestones;
- Definition of Done global.

Não inclua prompts completos de todos os Goals.

---

# 37. `MIGRATION_STATUS.md`

Inicialmente registre:

```text
Goal 0
= COMPLETE após auditoria aceita

Goal 001
= READY

demais Goals
= PLANNED
```

Estrutura sugerida:

| Goal | Status | Commit | Review | Observações |
|---|---|---|---|---|

Status possíveis:

```text
PLANNED
READY
IN_PROGRESS
IMPLEMENTED
REVIEW_REQUIRED
ACCEPTED
BLOCKED
SUPERSEDED
```

---

# 38. Goal 001

Crie apenas o primeiro Goal detalhado em:

```text
docs/migration/goals/001-<nome>.md
```

Ele deve ser suficientemente completo para que o Claude Code execute sem precisar adivinhar arquitetura.

Formato obrigatório:

```md
# Goal 001 — <nome>

## Objetivo

## Por que agora

## Dependências

## Contexto necessário

## Arquivos/domínios relevantes

## Escopo

## Fora de escopo

## Estado atual relevante

## Arquitetura esperada

## Regras de compatibilidade/migração

## Critérios de aceite

## Testes obrigatórios

## Validação obrigatória

## Entrega esperada do Claude

## Não fazer
```

O Goal deve ser pequeno o suficiente para revisão real, mas significativo o suficiente para mover a arquitetura.

---

# 39. Definition of Done para futuros Goals

Defina uma regra global.

Um Goal só pode ser considerado concluído quando:

```text
1. Claude implementou
2. testes obrigatórios passaram
3. Astra inspecionou o diff real
4. Astra confirmou aderência arquitetural
5. documentação necessária foi atualizada
6. riscos/pendências foram registrados
7. MIGRATION_STATUS foi atualizado
8. próximo Goal foi reavaliado
```

**O relatório do Claude sozinho nunca é suficiente para aceitar um Goal.**

---

# 40. Ciclo de trabalho após Goal 0

O processo futuro será:

```text
ASTRA
analisa estado global
↓
gera Goal N
↓
CLAUDE CODE / OPUS
implementa
↓
testes
↓
commit/diff/report
↓
ASTRA
inspeciona implementação real
↓
ACCEPT ou CORRECTION GOAL
↓
atualiza roadmap/decisões
↓
gera próximo Goal
```

Astra é responsável por manter visão global.

Claude é responsável por execução.

---

# 41. Como revisar o Claude futuramente

Quando receber uma implementação do Claude:

NÃO se limite ao resumo textual.

Inspecione:

- `git diff`;
- commit;
- arquivos alterados;
- contratos;
- migrations;
- testes;
- comportamento;
- arquitetura;
- possíveis efeitos colaterais.

Compare com:

```text
Goal
TARGET_ARCHITECTURE
DECISIONS
MASTER_PLAN
Product Vault
```

Se algo estiver errado:

```text
não aceite silenciosamente.
```

Crie um correction Goal ou peça correção antes de seguir.

---

# 42. Tratamento de descobertas inesperadas

Se encontrar durante esta auditoria:

- vulnerabilidade;
- risco de perda de dados;
- problema sério de isolamento tenant;
- contrato inconsistente;
- dependência escondida;
- componente sem consumidor;
- dado duplicado;
- abstração incorreta;
- comportamento não documentado;
- feature existente que não está no Product Vault;

registre.

Não implemente correções neste Goal.

Classifique por severidade e impacto no roadmap.

---

# 43. Dúvidas e decisões do usuário

Não interrompa a análise por perguntas pequenas que podem ser resolvidas pelo repositório.

Faça inferências técnicas quando forem:

- reversíveis;
- sustentadas por evidência;
- claramente documentadas.

Solicite decisão do usuário apenas quando existir uma escolha real de produto, custo ou direção arquitetural com consequências relevantes e nenhuma fonte vigente resolver a questão.

Quando isso ocorrer:

- registre a questão;
- apresente opções;
- recomende uma;
- explique impacto.

Não bloqueie toda a auditoria se a questão puder ser isolada.

---

# 44. Não implementar nada

Durante Goal 0 é proibido alterar código funcional.

Não altere:

```text
*.ts
*.tsx
*.js
*.jsx
*.go
Prisma schema
migrations
Dockerfiles
contracts
APIs
components
routes
services
tests de runtime
```

salvo se alguma ferramenta gerar automaticamente arquivo técnico indispensável apenas para análise — e, nesse caso, não mantenha alteração funcional.

As únicas mudanças permanentes esperadas são documentos de planejamento em:

```text
docs/migration/
```

Não faça refatoração oportunista.

Não corrija bugs.

Não "já aproveite para".

---

# 45. Não alterar as fontes soberanas neste Goal

Não altere:

```text
docs/product-vault/
docs/design-reference/claude-design/
```

Se encontrar inconsistências, registre em `GAP_ANALYSIS.md` ou `DECISIONS.md`.

Não tente corrigir Product Vault ou protótipo durante esta fase.

---

# 46. Git

Antes de começar:

- registre o commit atual usado como baseline;
- confirme working tree;
- não misture alterações externas.

Ao final:

- mostre todos os arquivos criados/alterados;
- nenhuma mudança funcional deve existir.

Não faça push.

Não faça merge.

Não crie PR.

Se o ambiente/política atual permitir commits apenas de documentação e isso fizer parte do fluxo explícito do usuário, aguarde instrução; por padrão, neste Goal não faça commit.

---

# 47. Critérios mínimos de qualidade da arquitetura alvo

A arquitetura proposta deve ser:

- coerente com o Product Vault;
- compatível com o MVP;
- simples o suficiente para manutenção;
- multi-tenant de forma segura;
- testável;
- observável;
- incrementalmente migrável;
- clara em data ownership;
- clara em responsabilidades;
- sem duas agendas operacionais;
- sem dependência operacional do Minha Agenda;
- capaz de sustentar IA + WhatsApp + Agenda Atendly;
- sem acoplamento desnecessário ao protótipo;
- sem serviços extras sem justificativa.

---

# 48. Critérios de qualidade do roadmap

O roadmap deve:

- respeitar dependências;
- reduzir risco cedo;
- tratar fundações antes de consumers dependentes;
- evitar big bang;
- preservar funcionamento quando possível;
- migrar consumers antes de remover contratos;
- deixar remoção de legado para depois da substituição;
- incluir testes;
- incluir dados;
- incluir frontend;
- incluir backend;
- incluir integração;
- incluir observabilidade;
- incluir auditoria final.

---

# 49. Definition of Done global do projeto

Defina no MASTER_PLAN um DoD global semelhante a:

O novo Atendly só está concluído quando:

- Product Vault está implementado no escopo MVP;
- frontend está alinhado ao Claude Design aprovado;
- Agenda Atendly é a única agenda operacional;
- Minha Agenda existe apenas como importação única;
- dados importados permanecem operáveis no Atendly;
- frontend e backend estão alinhados;
- contratos legados sem consumers foram removidos;
- IA usa regras e estilos vigentes;
- WhatsApp funciona de ponta a ponta;
- handoff humano funciona;
- tenant isolation foi validado;
- migrations foram validadas;
- estados de erro/loading/vazio existem onde necessário;
- testes críticos passam;
- fluxos E2E principais passam;
- observabilidade mínima existe;
- documentação técnica reflete a implementação final;
- não existem dois caminhos concorrentes para a mesma regra substituída;
- Astra realizou uma auditoria final de conformidade.

Adapte conforme sua análise.

---

# 50. Auditoria final deste Goal 0

Antes de declarar o Goal concluído, confirme:

- [ ] Product Vault foi analisado por domínios relevantes;
- [ ] protótipo foi analisado;
- [ ] frontend atual foi analisado;
- [ ] BFF foi analisado;
- [ ] Scheduling Service foi analisado;
- [ ] AI Orchestrator foi analisado;
- [ ] Evolution Go foi analisado;
- [ ] Health Worker foi analisado;
- [ ] packages compartilhados foram analisados;
- [ ] contratos foram analisados;
- [ ] persistência foi analisada;
- [ ] tenant/auth foram analisados;
- [ ] Minha Agenda foi analisada;
- [ ] Graphify foi utilizado para confirmar dependências;
- [ ] gaps foram registrados;
- [ ] matriz de reaproveitamento foi criada;
- [ ] arquitetura alvo foi definida;
- [ ] data migration foi planejada;
- [ ] decisões foram registradas;
- [ ] roadmap foi criado;
- [ ] riscos foram classificados;
- [ ] somente Goal 001 foi detalhado;
- [ ] nenhum código funcional foi implementado;
- [ ] nenhum Product Vault foi alterado;
- [ ] nenhum arquivo do Claude Design foi alterado;
- [ ] nenhum Goal futuro foi detalhado prematuramente.

---

# 51. Entrega final esperada

Ao concluir o Goal 0, apresente um resumo executivo contendo:

## Estado atual

- arquitetura atual resumida;
- principais strengths;
- principais dívidas;
- principais gaps.

## Arquitetura alvo

- decisão resumida;
- diferenças principais em relação ao runtime atual;
- serviços/boundaries que permanecem;
- serviços/boundaries que mudam.

## Reaproveitamento

- o que permanece;
- o que será refatorado;
- o que será substituído;
- o que será removido.

## Riscos

Top riscos ordenados por severidade.

## Roadmap

- quantidade estimada de Goals;
- principais fases;
- caminho crítico;
- primeiros Goals.

## Decisões pendentes

Liste apenas decisões realmente dependentes do usuário.

## Próxima ação

Indique claramente:

```text
Goal 001 criado em:
docs/migration/goals/001-<nome>.md

Próximo executor:
Claude Code / Opus
```

---

# 52. Regra final

Não confunda planejamento com execução.

O sucesso deste Goal não é produzir código.

O sucesso deste Goal é chegar a um estado em que:

```text
Astra entende o sistema atual
+
Astra entende o produto desejado
+
Astra entende o protótipo aprovado
+
Astra definiu uma arquitetura alvo defensável
+
Astra definiu um caminho incremental para chegar nela
+
Claude Code recebeu um primeiro Goal preciso e executável
```

A partir daí, a implementação começa com o Claude Code.

**Não implemente nenhuma parte do produto neste Goal 0.**
