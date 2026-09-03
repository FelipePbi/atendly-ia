# Plano de alinhamento da implementação — Atendly

## Objetivo

Preparar a futura refatoração de código e protótipos para o produto definido em `product-vault/`, sem antecipar decisões de arquitetura, persistência ou contrato.

Este arquivo delimita trabalho futuro real. Ele não é uma especificação técnica nem uma segunda fonte de requisitos.

## Frentes de refatoração

### 1. Fotografar o runtime atual

- identificar consumidores reais antes de remover contratos;
- mapear persistência, providers, rotas e estados ainda vinculados à proposta anterior;
- separar código operacional, migrações imutáveis e artefatos sem consumidor.

### 2. Definir o plano técnico

- derivar requisitos somente do product vault;
- registrar decisões necessárias sobre contratos, dados e ordem de migração;
- não assumir que abstrações atuais precisam permanecer;
- prever compatibilidade e remoção segura de consumidores legados.

### 3. Alinhar agenda e importação

- tornar a Agenda Atendly a única operação normal;
- limitar Minha Agenda ao fluxo de importação única;
- remover da experiência troca de fonte, operação externa e migração reversa;
- preservar histórico e segurança transacional.

### 4. Alinhar IA e conversas

- substituir os dois tons implementados pelos três estilos vigentes;
- remover identidade/persona incompatível;
- alinhar categorias, estados, handoff e controle manual às regras atuais.

### 5. Alinhar frontend e protótipos

- redesenhar onboarding e navegação a partir do mobile;
- substituir telas que representam agenda externa ativa;
- cobrir loading, vazio, erro e sucesso sem prometer operações não concluídas;
- atualizar ou remover os artefatos do Open Design identificados na auditoria documental.

### 6. Validar a transição

- testar contratos e consumidores após cada etapa;
- confirmar que nenhuma superfície ativa reintroduz regra substituída;
- revisar observabilidade, dados e rollback em proporção ao risco.

## Critério de conclusão do alinhamento

Os critérios funcionais vêm do product vault. O plano técnico futuro deverá demonstrar que contratos, persistência, serviços, frontend e protótipos convergem para esses critérios sem duas implementações concorrentes.

## Fora deste documento

Este plano não autoriza nem decide:

- desenho de serviços/backend;
- persistência;
- APIs;
- filas;
- infraestrutura;
- estratégia de migração técnica de dados internos;
- ordem de remoção de código legado.

Essas decisões pertencem à próxima análise técnica, baseada no código atual e no product vault.
