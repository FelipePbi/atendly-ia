---
title: Clientes e Memória
aliases: [Regras de Clientes]
tags: [avenly, clientes, memoria]
status: vigente
---

# Clientes e Memória

## Cadastro básico

Cliente possui:

- nome;
- telefone quando disponível;
- observações internas;
- tags;
- histórico de atendimentos;
- próximos agendamentos;
- preferências relevantes.

E-mail, CPF e data de nascimento não fazem parte do cadastro básico do MVP.

## Cliente sem telefone

Pode existir quando criado manualmente, por exemplo uma criança ou pessoa agendada presencialmente.

## Telefone compartilhado

Mais de um cliente pode compartilhar o mesmo telefone.

Exemplo:

- mãe usa o próprio WhatsApp para agendar para o filho.

A IA não deve tratar telefone como prova absoluta de identidade da pessoa atendida.

## Criação automática

Durante conversa no WhatsApp, não criar cliente apenas porque alguém perguntou preço ou disponibilidade.

O cliente é criado quando um agendamento é efetivamente confirmado e o cadastro ainda não existe.

## Relações entre clientes

Relações como responsável/filho são estruturadas no produto.

No MVP, um cliente pode ter um responsável principal relacionado.

Exemplo:

> Maria costuma agendar para Pedro.

Quando a IA identifica essa situação, a relação permanente deve ser confirmada antes de ser salva.

Em interações futuras, pode perguntar:

> Seria para o Pedro novamente?

## Preferências

Preferências podem incluir:

- serviço recorrente;
- período de horário preferido;
- profissional futuro;
- observações autorizadas.

A origem da preferência deve ser distinguível conceitualmente:

- informada pelo cliente;
- inferida pela IA;
- cadastrada pelo profissional.

Preferências inferidas não devem ser tratadas como verdades eternas; sua relevância diminui quando ficam antigas ou são contrariadas por comportamento recente.

## Observações internas

O profissional pode registrar observações livres.

A interface deve orientar:

> Evite registrar informações pessoais que não sejam necessárias para o atendimento.

Por padrão, observações internas não devem ser usadas pela IA sem autorização explícita.

## Perfil do cliente

O perfil deve reunir:

- dados básicos;
- próximos atendimentos;
- histórico;
- observações;
- preferências;
- tags;
- métricas básicas;
- resumo gerado por IA.

## Foto de perfil

Quando a cliente tem foto de perfil no WhatsApp visível para o número conectado, ela aparece no lugar das iniciais em todo avatar da cliente: Conversas (lista, chat e contexto da conversa), Clientes (lista e perfil) e Agenda. Sem foto, com foto escondida pela privacidade da cliente ou com falha ao carregar, ficam as iniciais.

- A foto é buscada sob demanda e nunca gravada pela Avenly — ver [[01-Regras/08-Privacidade-e-Retencao]].
- Cliente cadastrada à mão começa sem foto; a busca é tentada de novo depois de alguns minutos, e a foto pode aparecer a partir da primeira conversa pelo WhatsApp.
- Dependente sem telefone próprio fica com as iniciais: a foto do telefone do responsável não é usada para ela.
- O navegador guarda a foto por um dia para não buscar a cada tela; troca de foto pela cliente pode levar esse tempo para aparecer.

## Métricas do cliente

Podem incluir:

- total de atendimentos;
- último atendimento;
- frequência média;
- faltas;
- cancelamentos;
- valor final efetivamente registrado quando disponível.

Não usar preço previsto como receita real quando o valor efetivamente cobrado não foi registrado.

## Resumo por IA

Saiu do perfil (D-174, 2026-10-16, a pedido do usuário). No lugar, o Resumo mostra o **Histórico** em linguagem natural: quantos atendimentos e desde quando, de quanto em quanto tempo a cliente volta, em média, e faltas e cancelamentos — que só ganham cor quando aconteceram.

Se o resumo por IA voltar, ele só pode considerar informações que a IA está autorizada a utilizar.

## Tags

Tags manuais fazem parte do MVP.

A IA só pode considerar uma tag na conversa quando essa tag estiver autorizada para uso pela IA.

## Relacionado

- [[01-Regras/03-IA-e-Conversas]]
- [[01-Regras/08-Privacidade-e-Retencao]]
