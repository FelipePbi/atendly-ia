---
title: Privacidade e Retenção
aliases: [Privacidade Avenly]
tags: [avenly, privacidade, conversas]
status: vigente
---

# Privacidade e Retenção

> [!note]
> Este documento descreve comportamento de produto, não substitui revisão jurídica de Termos, Política de Privacidade ou LGPD.

## Cadastro

Termos e Política de Privacidade devem ser aceitos através de checkbox obrigatório não marcado por padrão.

Os links abrem páginas próprias da Avenly.

## Conexão do WhatsApp

Antes de conectar, deve existir confirmação explícita de que as conversas do número poderão ser processadas e armazenadas para fornecer os recursos da Avenly.

Também perguntar se o número é usado para conversas pessoais.

Se for pessoal, reforçar visualmente:

- abas Comercial / Não classificadas / Pessoal;
- contatos ignorados;
- comportamento da IA quando usuário assume.

Mesmo em número exclusivamente comercial, as proteções continuam disponíveis.

## Conversas pessoais

Conversas pessoais continuam armazenadas e aparecem na aba Pessoal.

Elas:

- não entram em métricas comerciais;
- exibem claramente que a IA está desativada naquela sessão;
- podem ser pesquisadas conforme filtro do usuário.

Uma conversa classificada como Pessoal não precisa ser relida integralmente pela IA para futuras métricas ou memória.

## Ignorar IA

Para contato marcado como Ignorar IA:

- conteúdo não é usado pela IA;
- histórico anterior também deixa de ser contexto da IA;
- conversa pode permanecer armazenada para o usuário.

## Retenção

Retenção é configurável em Configurações → Conversas.

Opções:

- 30 dias
- 90 dias
- 180 dias
- 365 dias

Defaults:

- Comercial: 90 dias
- Pessoal: 30 dias

Comercial e Pessoal podem ter períodos diferentes.

Conversas Não classificadas seguem o prazo Comercial, sem prazo, opção ou default próprios.

Ao reduzir retenção, a interface deve explicar que mensagens antigas poderão ser removidas e pedir confirmação.

Depois que o conteúdo expira, a conversa pode continuar existindo na lista com informações mínimas e indicação de que mensagens antigas expiraram.

## Observações de clientes

Campo interno aceita texto livre, com orientação para evitar dados desnecessários.

Uso pela IA exige autorização explícita da observação.

## Foto de perfil das clientes

A foto de perfil do WhatsApp da cliente é exibida, não armazenada. É buscada no momento em que a tela precisa dela, fica só em memória por algumas horas e no cache do navegador da profissional por um dia, e não entra em banco nem backup. Só aparece o que o próprio WhatsApp já mostra ao número conectado: se a cliente esconde a foto, a Avenly também não a vê. Ver [[01-Regras/04-Clientes-e-Memoria]].

## Logs e mensagens de erro

Logs e mensagens exibidas ao profissional não devem expor segredos, credenciais ou detalhes internos sensíveis.

Conteúdo completo de conversa não deve ser tratado como requisito para todo log operacional; apenas o necessário para diagnóstico.

O registro de atividade do negócio ([[01-Regras/01-Regras-de-Negocio#Registro de atividade]]) guarda nomes, telefones e valores de antes e depois, mas nunca senha, hash, token, credencial ou chave: troca de senha e conexão da Minha Agenda aparecem só como fato. Textos longos (perguntas frequentes, instrução para a IA, observações) entram cortados. O registro sai junto com o negócio na exclusão da conta.

## Exclusão de cliente

A interface do MVP não oferece um fluxo self-service de exclusão de dados do cliente por solicitação. Esse tema deve ser tratado posteriormente em especificação jurídica/operacional apropriada.

## Exclusão da conta

O usuário pode excluir sua própria conta com período de recuperação de 7 dias.

Ao iniciar exclusão:

- automações são desligadas;
- WhatsApp é desconectado;
- usuário pode cancelar a exclusão dentro do prazo.

Se restaurar a conta, precisa reconectar o WhatsApp e realizar novo teste de ativação.

## Relacionado

- [[01-Regras/04-Clientes-e-Memoria]]
- [[01-Regras/05-WhatsApp]]
