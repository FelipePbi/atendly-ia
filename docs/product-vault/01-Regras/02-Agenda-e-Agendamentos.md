---
title: Agenda e Agendamentos
aliases: [Regras de Agenda]
tags: [atendly, agenda, agendamento]
status: vigente
---

# Agenda e Agendamentos

## Agenda oficial

A agenda utilizada pela IA e pelo profissional é sempre a Agenda Atendly.

## Visualizações da Agenda

A Agenda oferece três modos de visualização da mesma operação:

- Dia;
- Semana;
- Mês.

No mobile, `Dia` é a visualização principal e padrão, mas o usuário também pode alternar para `Semana` e `Mês`.

Em tablets, notebooks e desktops, as três visualizações permanecem disponíveis. Em telas maiores, `Semana` pode ser a visualização padrão por facilitar a leitura dos compromissos distribuídos entre os dias.

`Mês` oferece uma visão macro para entender rapidamente a distribuição dos agendamentos ao longo do mês.

## Identidade visual do serviço

Um serviço pode ter uma identidade visual opcional para facilitar o reconhecimento dos seus eventos na Agenda. No MVP, essa configuração pode ser representada por uma cor escolhida pelo usuário.

A forma de aplicar essa identidade não é fixa. O design pode usar acento, borda, faixa, marcador, ponto, superfície tonal ou outro padrão visual consistente, desde que preserve legibilidade e evite poluição visual.

Quando o serviço não tiver uma identidade visual configurada, o evento usa o padrão visual da Agenda.

A identidade do serviço não substitui o tipo nem o estado do evento. Atendimento, compromisso pessoal, bloqueio, hold `Em confirmação` e os demais estados do agendamento devem continuar claramente distinguíveis, sem depender apenas da cor do serviço.

## Dias ocultos na visualização

O usuário pode escolher quais dias da semana deseja ocultar da Agenda, principalmente nas visualizações `Semana` e `Mês`.

Essa configuração:

- afeta apenas a visualização;
- não altera a disponibilidade real do negócio;
- não indica que o dia está fechado ou indisponível para atendimento;
- pode ser revertida a qualquer momento.

Ocultar dias sem utilidade frequente permite aproveitar melhor o espaço disponível sem mudar as regras operacionais da Agenda.

## Disponibilidade semanal

O profissional configura:

- dias em que atende;
- um período-base por dia;
- dias diferentes podem ter horários diferentes.

Exemplo:

- Segunda: 09:00–18:00
- Terça: 09:00–18:00
- Quarta: 10:00–19:00

Pausas como almoço não são um conceito especial: são representadas por bloqueios.

## Exceções

É possível:

- bloquear horários específicos;
- criar bloqueios recorrentes;
- adicionar disponibilidade extra em uma data normalmente indisponível;
- registrar compromissos pessoais que bloqueiam horários.

Feriados não são tratados automaticamente no MVP.

## Regras de oferta de horário

O negócio pode configurar:

- antecedência mínima para agendar;
- antecedência máxima;
- granularidade de horários.

A IA sempre consulta disponibilidade atual antes de afirmar que há ou não há vaga.

Quando cliente pergunta por horário sem informar serviço, a IA precisa conhecer a duração necessária. Pode usar histórico forte para sugerir o serviço e confirmar de forma curta.

Exemplo:

> Seria para o corte novamente?

## Oferta de opções

A IA deve apresentar poucas opções relevantes, normalmente até três, e oferecer mais se necessário.

Ela pode usar histórico para priorizar horários compatíveis com hábitos anteriores, sem necessariamente expor essa inferência ao cliente.

## Hold

Quando um horário é apresentado para confirmação, ele pode ser reservado temporariamente por 5 minutos.

Na agenda do profissional o horário aparece de forma discreta como:

> Em confirmação

Se o hold expirar, a conversa continua, mas a disponibilidade deve ser consultada novamente antes da confirmação.

## Confirmação

A IA deve consolidar data, horário e serviço de forma explícita antes de persistir.

Exemplo:

> Corte, sexta-feira, 18 de setembro, às 14h. Posso confirmar?

Confirmações semanticamente claras são válidas, como:

- sim;
- pode;
- fechou;
- beleza;
- 👍;
- áudio com confirmação clara.

Respostas ambíguas exigem nova confirmação.

## Multi-serviço

Um agendamento pode conter vários serviços.

Exemplo:

> Corte + barba

A duração operacional é a soma das durações dos serviços. Não há entidade de combo comercial no MVP.

## Buffer

Serviços podem possuir intervalos de preparação/recuperação antes e depois. Em um atendimento com vários serviços, os buffers intermediários não devem ser somados entre cada serviço; aplica-se o comportamento externo definido para o atendimento.

## Agendamento manual

O profissional pode criar agendamento diretamente pela Agenda.

Se o cliente não existir, deve ser possível criá-lo rapidamente no mesmo fluxo.

Também é permitido criar manualmente um atendimento excepcional sem serviço cadastrado, informando título e duração.

A IA não cria atendimento sem conseguir mapear a intenção para um serviço ativo; quando necessário, faz handoff.

## Sobreposição

A IA nunca cria encaixe fora da disponibilidade.

O profissional pode forçar uma sobreposição manualmente com alerta explícito de conflito.

## Cancelamento

O cliente pode solicitar cancelamento pelo WhatsApp.

Default do MVP: sem restrição de antecedência.

Se o negócio configurar uma restrição e a solicitação estiver fora da política:

1. IA explica a regra de forma breve;
2. oferece falar com o profissional.

Antes de cancelar, a IA faz uma confirmação clara.

Depois, pergunta se o cliente deseja procurar outro horário.

## Remarcação

Durante remarcação:

- o horário original permanece reservado até a nova confirmação;
- o novo horário recebe hold;
- após confirmação, o próprio agendamento é atualizado;
- alterações ficam registradas no histórico operacional.

## Conclusão e falta

O sistema pode marcar um atendimento como concluído automaticamente 30 minutos após o horário previsto de término, desde que não esteja cancelado ou marcado como falta.

O profissional pode corrigir posteriormente para `Não compareceu`.

Não comparecimento é marcado manualmente e pode ter observação opcional.

## Valor final

O profissional pode registrar opcionalmente o valor efetivamente cobrado após o atendimento.

Se o valor final não for informado, não se deve assumir que o preço previsto representa receita efetivamente realizada.

## Recorrência por serviço

Um serviço pode ser configurado como recorrente, por exemplo:

- manutenção de sobrancelha: a cada 2 semanas;
- outro serviço: a cada 1 mês.

Essa recorrência é uma referência padrão, não uma obrigação absoluta.

Exemplo de cliente:

> Quero marcar minhas próximas 3 manutenções.

A IA:

1. usa a frequência configurada no serviço;
2. calcula os próximos períodos;
3. consulta disponibilidade;
4. busca horários próximos quando a data/horário ideal estiver ocupado;
5. apresenta todas as opções antes de criar;
6. confirma somente após aceite do cliente.

Exemplo:

> Encontrei estes horários para as próximas manutenções: 18/09 às 14h, 03/10 às 14h30 e 18/10 às 14h. Posso confirmar os três?

Depois de criados, os agendamentos funcionam como atendimentos independentes.

Se uma remarcação feita pela IA alterar muito a distância para os próximos atendimentos, ela deve perguntar se o cliente deseja ajustar os seguintes também.

Esse aviso de preservação de cadência não é obrigatório quando o profissional edita manualmente pela Agenda.

## Relacionado

- [[02-Fluxos/03-Fluxos-de-Agendamento]]
- [[01-Regras/06-Importacao-Minha-Agenda]]
- [[01-Regras/07-Lembretes-Notificacoes-e-Instabilidade]]
- [[04-Referencia/01-Glossario]]
