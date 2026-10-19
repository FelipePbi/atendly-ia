---
title: Lembretes, Notificações e Instabilidade
aliases: [Notificações Avenly]
tags: [avenly, lembretes, notificacoes]
status: vigente
---

# Lembretes, Notificações e Instabilidade

## Lembretes de agendamento

O negócio pode configurar até dois lembretes por agendamento.

Default:

- 1 lembrete;
- 24 horas antes.

Antecedência pode usar presets e opção personalizada.

## Conteúdo do lembrete

Mensagem deve manter conteúdo objetivo e adaptar a linguagem ao estilo da IA.

Informações padrão:

- serviço;
- data;
- horário.

Endereço não é repetido automaticamente; a IA responde quando o cliente perguntar ou quando o contexto exigir.

### Mensagem de exemplo

A profissional pode editar a mensagem de exemplo do lembrete (Configurações › Agenda › Lembretes) para mostrar como gostaria que ele soasse: saudação, emojis, tom e uma linha extra (ex.: "Lembre de vir sem rímel 😉"). `{nome}`, `{servico}`, `{data}` e `{hora}` marcam onde entram os dados de cada cliente.

O exemplo é referência de tom, nunca fonte de fato:

- nome, serviço, data e horário vêm sempre do agendamento;
- se o exemplo não tiver `{servico}`, `{data}` e `{hora}`, a frase padrão com esses dados entra depois da primeira linha;
- o valor só aparece pela regra de preço acima, logo depois da frase do atendimento;
- com a confirmação habilitada, a pergunta de confirmação (na voz do estilo da IA) entra no fim;
- data, horário ou valor escritos à mão e campos desconhecidos são recusados ao salvar;
- "Restaurar padrão" volta à mensagem pelo estilo da IA. O aviso de alteração não usa o exemplo.
- em várias mensagens curtas ([[../../migration/DECISIONS#D-208|D-208]], o padrão), cada linha do exemplo é uma mensagem, o texto inicial tem uma ideia por linha e a prévia mostra um balão por mensagem.

Preço é configurável:

- **Nunca** — padrão;
- mostrar quando houver preço fixo definido no agendamento.

## Confirmação pelo lembrete

Pode ser habilitada pelo negócio.

O agendamento continua com seu status normal e mantém uma confirmação de presença separada.

Cliente responde “sim”:

- registrar confirmação;
- responder brevemente.

Cliente responde “não”:

- perguntar se deseja cancelar ou remarcar.

Cliente responde de forma vaga:

- IA tenta esclarecer.

Sem resposta:

- agendamento permanece válido;
- profissional pode ver discretamente que a confirmação não foi recebida.

## Alterações manuais

Ao remarcar ou cancelar manualmente, a interface deve oferecer `Notificar cliente`, marcada por padrão.

Alterações em data, horário, serviço ou local devem enfatizar a recomendação de notificar.

Alterações somente internas, como observações ou preço administrativo, não devem gerar notificação automática.

## Central de notificações

Existe uma central própria para eventos realmente relevantes.

Níveis:

- informativa;
- atenção;
- crítica.

Eventos adequados:

- cliente aguardando humano;
- WhatsApp desconectado;
- IA indisponível;
- configuração que impede atendimento;
- importação concluída;
- falha de lembrete.

Novo agendamento pela IA pode gerar notificação conforme configuração do usuário, com default silencioso.

Abrir a central (gaveta ou tela) marca como lidas as notificações não lidas que ela mostra. Enquanto a central está aberta, elas mantêm o destaque de novas. Ao fechá-la ou sair da tela, o contador de não lidas já reflete a leitura. Ler não resolve uma condição: um problema ainda aberto, como o WhatsApp desconectado, continua avisado.

## Alertas persistentes

Problemas que impedem a operação podem gerar banner persistente, como:

- WhatsApp desconectado;
- IA indisponível;
- configuração essencial incompleta.

## Handoff

Conversas aguardando humano sobem de prioridade na aba Comercial.

Mostrar:

- estado `Aguardando você`;
- tempo de espera;
- prioridade quando relevante.

Abertura da conversa não significa que o profissional assumiu. O estado muda quando ele envia uma mensagem.

## Alertas externos

E-mail deve ser usado para problemas críticos em que o usuário pode não estar com a Avenly aberta.

Exemplos:

- WhatsApp desconectado após tentativas de reconexão;
- indisponibilidade prolongada da IA.

## Instabilidade da IA

Quando a IA não consegue operar:

- não enviar mensagem automática ao cliente apenas para explicar que a IA caiu;
- conversa entra em atenção humana;
- status do produto informa instabilidade;
- logs e aviso ficam disponíveis ao profissional.

Se a IA se recuperar, o status global pode retornar automaticamente quando aplicável. Conversas já encaminhadas a humano não precisam voltar automaticamente no meio da sessão.

## Falha na agenda

Se a IA não consegue consultar a agenda:

- não usar disponibilidade antiga como se fosse atual;
- não oferecer horários inventados;
- encaminhar para atendimento humano.

## Falha transacional

Nunca enviar confirmação de operação que não foi concluída.

Em erro ao criar agendamento:

1. tentar novamente uma vez quando apropriado;
2. se continuar falhando, realizar handoff;
3. informar ao profissional de forma simples que o cliente ainda não recebeu confirmação.

## Relacionado

- [[01-Regras/02-Agenda-e-Agendamentos]]
- [[01-Regras/03-IA-e-Conversas]]
