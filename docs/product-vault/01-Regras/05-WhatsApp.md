---
title: WhatsApp
aliases: [Regras do WhatsApp]
tags: [atendly, whatsapp, conversas]
status: vigente
---

# WhatsApp

## Regra central

Cada negócio utiliza **um único número de WhatsApp**.

O número pode ser:

- profissional;
- pessoal e profissional ao mesmo tempo.

O produto deve explicar claramente:

> **Você pode continuar usando seu WhatsApp normalmente. Quando você responde manualmente, a IA sai de cena.**

## Inbox

Todas as conversas aparecem organizadas em:

1. Comercial
2. Não classificadas
3. Pessoal

A interface não deve esconder conversas pessoais nem criar uma experiência separada de WhatsApp “comercial”.

## Classificação

Existem dois conceitos diferentes:

- perfil predominante do contato;
- estado/classificação da conversa atual.

Exemplo: um amigo pode ser um contato pessoal e iniciar uma conversa comercial quando pede um horário.

Classificação manual do usuário prevalece sobre classificação automática.

## Contatos ignorados

Usuário pode cadastrar contatos para os quais a IA nunca responde.

Exemplos:

- pai;
- mãe;
- parceiro(a);
- amigos;
- contatos profissionais que prefere atender pessoalmente.

Contato ignorado pode continuar aparecendo normalmente na inbox.

## Grupos

A IA nunca participa de grupos no MVP.

## Conversa pessoal

Quando uma conversa é claramente pessoal:

- IA fica desativada naquela sessão;
- conversa permanece visível;
- em nova sessão futura, o sistema pode reavaliar a intenção caso não seja um contato explicitamente ignorado.

## Mensagem ambígua

Número desconhecido envia apenas:

> Oi

Comportamento:

1. não responder imediatamente;
2. aguardar aproximadamente 2 minutos;
3. se novas mensagens igualmente ambíguas chegarem, a espera pode se estender, com limite aproximado de 5 minutos desde a primeira mensagem;
4. depois, pode enviar saudação neutra adaptada ao estilo da IA;
5. se ficar claro que a conversa é pessoal, a IA para de responder.

Exemplo:

> Oiii, tudo bem? Como posso ajudar?

## Profissional responde pelo WhatsApp

Quando o profissional envia qualquer mensagem manual:

- IA pausa imediatamente naquela conversa;
- qualquer resposta pendente da IA deve ser cancelada quando possível;
- a conversa muda para atendimento humano.

Visualizar mensagens não significa assumir atendimento.

## Profissional responde pela Atendly

Também é possível responder diretamente pelo chat interno.

Durante atendimento humano, a IA pode sugerir uma resposta, mas nunca enviar sozinha.

## Troca entre humano e IA

Durante a sessão atual, depois que o humano assumiu, a IA só volta quando o profissional escolher `Retomar IA`.

Uma nova sessão após aproximadamente 24 horas pode voltar ao atendimento automatizado.

Para o cliente, a troca deve ser natural, sem mensagens como “agora você está falando com humano” ou “a IA voltou”.

## Um número por negócio

Trocar o número não apaga clientes, agenda nem conversas armazenadas.

Visualmente, a experiência histórica continua unificada; o usuário não precisa distinguir conversas por “número antigo”.

## Relacionado

- [[01-Regras/03-IA-e-Conversas]]
- [[02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp]]
- [[02-Fluxos/04-Handoff-e-Atendimento-Humano]]
