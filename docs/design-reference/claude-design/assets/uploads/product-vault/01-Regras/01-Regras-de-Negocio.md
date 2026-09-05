---
title: Regras de Negócio
aliases: [Regras Atendly]
tags: [atendly, regras, produto]
status: vigente
---

# Regras de Negócio

## Princípios fundamentais

1. A Agenda Atendly é a única agenda oficial do negócio.
2. Minha Agenda é apenas uma fonte de migração única.
3. O MVP possui um usuário, um profissional, um negócio e um número de WhatsApp.
4. A IA pode executar agendamentos, cancelamentos e remarcações dentro das regras do negócio.
5. O profissional sempre pode assumir manualmente uma conversa.
6. A IA nunca deve confirmar uma operação antes de ela ter sido realmente concluída.
7. A IA nunca deve inventar disponibilidade, preço ou informação comercial.
8. A IA respeita regras; o humano pode conscientemente executar exceções manuais quando a interface permitir.
9. O usuário pode concluir onboarding sem WhatsApp conectado, mas a IA permanece inativa.
10. O onboarding concluído não é reaberto como wizard; configurações posteriores são feitas nos módulos normais.

## Ativação da IA

Para a IA ficar ativa, o negócio precisa ter:

- pelo menos um serviço operacional;
- disponibilidade válida;
- WhatsApp conectado;
- teste real concluído com sucesso.

Após o teste real bem-sucedido, a IA é ativada automaticamente.

## Serviço operacional

Um serviço precisa ter:

- nome;
- duração válida.

Preço é opcional e pode ser:

- fixo;
- a partir de;
- sob consulta;
- não informado.

Um serviço sem duração importado pode existir como pendência, mas não pode ser agendado pela IA enquanto não for corrigido.

## Cliente

Todo atendimento deve estar associado a um cliente.

Regra geral de cadastro:

- nome;
- telefone.

Exceção: agendamentos manuais podem criar cliente sem telefone.

O telefone é importante para operação no WhatsApp, mas pessoas diferentes podem compartilhar o mesmo número.

## Agendamento

Um agendamento pode possuir um ou vários serviços.

A IA só cria um agendamento após uma confirmação final clara do cliente.

Estados principais do atendimento:

- Confirmado
- Concluído
- Cancelado
- Não compareceu

A confirmação de lembrete é um estado separado da situação do agendamento.

## Snapshot comercial

Ao confirmar um agendamento, preço e duração acordados ficam associados àquele atendimento. Alterações posteriores no catálogo de serviços não modificam automaticamente agendamentos já existentes.

## Operação humana x IA

- mensagem manual enviada pelo profissional pausa a IA na conversa;
- apenas visualizar a conversa não pausa;
- após handoff, a IA só retorna durante a mesma sessão quando o profissional escolher retomar;
- uma nova sessão após 24h pode voltar à IA automaticamente;
- em erro crítico da IA, o cliente não recebe mensagem automática de infraestrutura.

## Conversas pessoais

Conversas são organizadas em:

- Comercial
- Não classificadas
- Pessoal

Contato e conversa são conceitos separados. Um contato predominantemente pessoal pode iniciar uma conversa comercial em outro momento.

Configuração manual sempre prevalece sobre classificação automática.

## Ignorar IA

Um contato marcado como **Ignorar IA**:

- nunca recebe resposta da IA;
- seu conteúdo não é usado pela IA;
- continua podendo aparecer na Atendly conforme organização da inbox.

## Uma única importação

Cada negócio pode concluir apenas uma importação do Minha Agenda.

- falha total não consome a importação;
- importação parcial permanece aberta até conclusão explícita;
- após `Concluir importação`, não existe nova importação;
- credenciais deixam de ser usadas;
- alterações futuras no Minha Agenda não chegam à Atendly.

## Relacionado

- [[01-Regras/02-Agenda-e-Agendamentos]]
- [[01-Regras/03-IA-e-Conversas]]
- [[01-Regras/05-WhatsApp]]
- [[00-Produto/02-Escopo-do-MVP]]
