---
title: Escopo do MVP
aliases: [MVP Atendly, Escopo Atendly]
tags: [atendly, mvp, escopo]
status: vigente
---

# Escopo do MVP

## Regra de escopo

Existe **um único MVP**.

O desenvolvimento pode ser dividido em etapas sequenciais de implementação, mas essas etapas não são MVPs menores nem versões de validação isoladas.

A validação prática começa somente quando o MVP completo definido nesta documentação estiver concluído.

## Validação inicial

O sistema deve ser desenvolvido com aparência e comportamento de produto real, sem comunicação de “beta”.

Primeiros usuários controlados:

- o próprio criador do produto;
- sua namorada, que trabalha em um estúdio de beleza;
- uso com operação e clientes reais.

Não criar infraestrutura especial de beta apenas para esse momento.

## Incluído no MVP

### Conta e negócio

- cadastro e login;
- recuperação de senha apenas representada visualmente no frontend, sem serviço real nesta fase;
- um usuário por negócio;
- um profissional por negócio;
- um número de WhatsApp por negócio;
- dados básicos e modalidades do negócio.

### Agenda

- Agenda Atendly como agenda oficial;
- serviços;
- clientes;
- disponibilidade semanal;
- diferenças de horário por dia;
- disponibilidade excepcional;
- bloqueios recorrentes;
- compromissos pessoais;
- criação manual de agendamentos;
- criação de agendamentos pela IA;
- multi-serviço;
- holds de horário;
- cancelamento e remarcação;
- recorrência orientada pela configuração do serviço;
- status e histórico operacional;
- valor final cobrado opcional.

### IA e WhatsApp

- conexão do WhatsApp;
- uso de número pessoal ou comercial;
- IA identificando intenção comercial;
- Comercial / Não classificadas / Pessoal;
- contatos com IA ignorada;
- atendimento automatizado;
- handoff para humano;
- pausa quando o profissional responde manualmente;
- chat dentro da Atendly;
- sugestões de resposta no atendimento humano;
- compreensão de áudio;
- imagens gerando handoff;
- documentos visíveis sem interpretação pela IA;
- três estilos de linguagem;
- FAQ e conhecimento do negócio;
- teste real de ativação;
- lembretes de agendamento;
- confirmação, cancelamento e remarcação via WhatsApp.

### Clientes

- cadastro e histórico;
- observações;
- tags;
- preferências;
- relações entre clientes;
- resumo por IA;
- métricas básicas do cliente;
- cliente sem telefone em casos manuais específicos.

### Migração

- uma única importação do Minha Agenda;
- durante onboarding ou posteriormente;
- preview;
- conflitos;
- importação parcial;
- conclusão explícita;
- histórico da importação;
- nenhuma reimportação posterior.

### Operação

- Home operacional;
- Agenda;
- Conversas;
- Clientes;
- Serviços;
- Configurações;
- notificações;
- alertas críticos;
- retenção de conversas.

## Fora do MVP

- planos e cobrança;
- fidelidade;
- indicação;
- página do cliente;
- campanhas e marketing proativo;
- reativação automática de clientes;
- aniversário;
- pedido automático de avaliação;
- pagamentos;
- cobrança de sinal;
- módulo financeiro;
- multi-profissional;
- múltiplos usuários/permissões;
- vários números de WhatsApp por negócio;
- app nativo;
- push mobile;
- analytics avançado;
- relatórios PDF/Excel;
- exportação de dados;
- integrações com CRM/ERP;
- personalização avançada da IA usando conversas reais;
- prompt livre para o usuário;
- Instagram/Facebook;
- IA em grupos de WhatsApp;
- interpretação de imagens pela IA;
- interpretação de documentos pela IA;
- uploads de PDFs como base de conhecimento;
- lista de espera;
- Google Calendar ou qualquer sincronização de agenda externa.

## Monetização

Não implementar camada comercial antes da validação prática.

Hipóteses futuras como “Agenda básica” e “Agenda + IA + automações” ficam deliberadamente em aberto até observar uso real.
