# Retorno de clientes: Renovação e Resgate

**Status:** implementada em 2026-10-18 ([[../../migration/DECISIONS#D-206|D-206]]): Renovação, Resgate, ritmo, horários de costume, a IA conduzindo a resposta e os números da rodada. Onde fica: "Chamar clientes de volta" na lista de Clientes (`/clientes/retorno`), "Retorno de clientes" em Configurações e "Mensagens de retorno" no Resumo do perfil. Ainda não: a linha do Retorno no bloco "O que a IA fez" do Faturamento, a marca "veio pelo Resgate" no próprio atendimento, os horários de costume em toda oferta da IA (hoje só na conversa do convite) e a menção na Política de Privacidade.

## Objetivo

Trazer de volta, por mensagem no WhatsApp, dois grupos de clientes que não marcaram:

1. **Renovação:** quem está no prazo de refazer um serviço (manutenção de cílios, por exemplo) e não tem horário marcado.
2. **Resgate:** quem não vem há dois ou três meses ou mais.

Nos dois casos a profissional escolhe para quem a mensagem vai e aprova. A partir daí a Avenly envia aos poucos, e a IA conduz a conversa até o agendamento.

## Decisões já tomadas com o usuário

| Pergunta | Decisão |
| --- | --- |
| De onde vem o prazo de volta | Do serviço primeiro. Sem prazo no serviço, vale a média da própria cliente. |
| Automático ou com aprovação | Aprovação manual: a lista vem pronta e pré-selecionada, a profissional desmarca quem não quer e aprova. |
| Incentivo no Resgate | Texto livre escrito pela profissional (desconto, brinde, condição); a IA usa esse texto na conversa. |
| Quantos dias contam como "sumida" | Configurável. |
| Horários oferecidos | Os de costume da cliente (dia da semana e faixa de horário do histórico) ou os mais próximos deles. |

## 1. Renovação

### Quem entra

- **Data esperada de volta** = último atendimento concluído do serviço + prazo de volta.
  - O prazo de volta é o `recurrenceIntervalDays` do serviço, a "Recorrência" que o editor de serviço já tem.
  - Sem prazo no serviço, vale a média da cliente (`averageIntervalDays`), se ela tiver pelo menos dois atendimentos concluídos.
  - Sem nenhum dos dois, a cliente não entra.
- A data esperada cai **nesta semana**, de segunda a domingo, contada a partir de hoje. A tela também deixa escolher "próxima semana". Quem venceu de segunda até ontem aparece como "venceu há N dias".
- A cliente **não tem nenhum agendamento futuro** (confirmado ou aguardando).

### Quem nunca entra

- Cliente desativada (D-185).
- Contato ignorado ou conversa marcada como pessoal.
- Quem pediu para não receber mensagens de retorno.
- Quem já recebeu uma mensagem de retorno nos últimos 14 dias.

### Tela: "Chamar clientes desta semana"

1. A tela abre com a lista pronta, **todas as clientes marcadas**. Cada linha mostra:
   - nome;
   - serviço e quanto falta, por exemplo "Manutenção 5D vence em 5 dias" ou "venceu há 2 dias";
   - último atendimento;
   - um resumo dos horários de costume, por exemplo "costuma vir sex ou sáb, depois das 17h".
2. A profissional desmarca quem não quer chamar.
3. Ela vê a mensagem que vai sair, com os campos preenchidos, e pode editar o texto-base.
4. Ao tocar em **Aprovar**, a seleção vira uma **rodada de envios**. Nada sai de uma vez.

### Rodada de envios (fila)

Uma rodada é uma fila com regras de ritmo:

| Regra | Padrão | Configurável |
| --- | --- | --- |
| Mensagens por dia | 10 | sim, de 1 a 30 |
| Janela de envio | seg a sáb, 9h às 19h, fuso do negócio | sim |
| Intervalo entre duas mensagens | sorteado entre 3 e 10 min | não |
| Prazo da cliente | até **2 dias antes** da data esperada de volta | sim, de 1 a 5 dias |

- **Ordem:** quem vence antes recebe antes.
- **Não cabe no prazo:** se a cliente não couber até 2 dias antes da data dela (por exemplo, vence na segunda e a rodada só chega nela na segunda), a tela avisa já na aprovação ("3 clientes não cabem no limite de 10 por dia antes da data delas") e oferece aumentar o limite do dia ou deixar essas de fora. Ninguém recebe no próprio dia do vencimento nem depois dele, a não ser que a data já tenha passado (ou seja hoje) quando a rodada foi aprovada. Aprovada depois do prazo de 2 dias, vale o último dia antes da data.
- **Antes de cada envio** as regras são conferidas de novo. Se a cliente marcou nesse meio-tempo, foi desativada ou pediu para não receber, ela sai da rodada sem mensagem.
- A profissional acompanha a rodada (enviadas, na fila, respondidas, agendadas) e pode pausar ou cancelar o que falta.

### Mensagem

A Avenly monta um texto curto. O padrão é a IA escrever no estilo de conversa do negócio, a partir de um modelo, por exemplo:

> Oi, Adri! Sua manutenção 5D completa 15 dias na quinta. Quer que eu já reserve? Tenho sex às 17h30 ou sáb às 18h.

**Sempre com dois horários reais**, livres na agenda no momento do envio e escolhidos pela regra de horários de costume (seção 3).

## 2. Resgate

### Quem entra

- O último atendimento concluído foi há **N dias ou mais**, com N configurável (padrão 60; opções 30, 45, 60, 90, 120 ou um número livre).
- Não há nenhum agendamento futuro.
- As mesmas exclusões da Renovação. Em vez de 14 dias, a regra é: nenhuma mensagem de retorno nos últimos 30 dias.

### Incentivo

- Campo de texto livre na configuração do Resgate, por exemplo "10% de desconto em qualquer serviço até o fim do mês" ou "hidratação de brinde na volta".
- A IA usa esse texto na primeira mensagem e na conversa, sem inventar outro benefício.
- **Sem texto, sem incentivo:** a mensagem é só de reaproximação.
- Também fica registrado no atendimento que veio pelo Resgate, para quem for atender saber qual condição foi prometida.

### Tela e envio

O fluxo é o mesmo da Renovação: lista pré-selecionada → desmarcar → aprovar → rodada com ritmo. Cada linha mostra "última vez há 3 meses", o serviço mais feito e os horários de costume.

A mensagem é mais leve, de saudade, sem pressão, por exemplo:

> Oi, Joice! Faz um tempinho que você não aparece por aqui 💕 Esse mês estou com 10% de desconto pra quem volta. Quer que eu veja um horário pra você?

## 3. Horários de costume da cliente

Vale para as duas rotinas e para toda vez que a IA oferece horário a uma cliente com histórico.

1. **Padrão da cliente:** a partir dos últimos 10 atendimentos concluídos, calcular:
   - os dias da semana mais frequentes (os que somam pelo menos 70% das vezes, até 3 dias);
   - a faixa de horário de início (mediana com ±90 min; por exemplo "17h às 19h30").
   O padrão só vale com **pelo menos 3 atendimentos concluídos**.
2. **Ordem de busca dos horários livres**, dentro da janela da rodada até 7 dias depois da data esperada:
   1. no dia e na faixa de costume;
   2. no dia de costume, na faixa mais próxima;
   3. em outro dia, na faixa de costume;
   4. qualquer horário livre, do mais próximo da data esperada para o mais distante.
3. Com padrão claro, a IA **não oferece primeiro** um dia que a cliente nunca usou. Esse dia só aparece se ela pedir outro horário ou se não houver nada nos passos 1 a 3.
4. Sem padrão (menos de 3 atendimentos), a regra é a de hoje: os horários livres mais próximos.
5. O padrão aparece para a profissional na lista ("costuma vir sex ou sáb, depois das 17h") e entra no contexto da IA na conversa.

## 4. Conversa depois do envio

- Quando a cliente responde, **a IA assume** com o contexto da rodada: tipo (Renovação ou Resgate), serviço, data esperada de volta, incentivo e os horários já oferecidos.
- A IA segue a regra de horários da seção 3, confirma o serviço e agenda pelo fluxo normal de agendamento.
- **Recusa** ("não quero", "agora não", "parei de fazer"): a IA agradece, encerra e marca a cliente para não receber mensagens de retorno por 90 dias.
- **Pedido para parar** ("pare", "não me mande mais"): bloqueio permanente de mensagens de retorno. Só a profissional desfaz, no perfil da cliente.
- **Sem resposta em 3 dias:** no máximo **um** lembrete curto, dentro da mesma janela e do mesmo ritmo. Depois disso, silêncio.
- Pedido fora do que a IA resolve: segue a regra de atendimento humano de hoje.

## 5. Medição

Cada envio registra:
- quando foi enviado;
- se a cliente respondeu;
- se agendou, com o agendamento ligado ao envio;
- quanto faturou quando o atendimento foi concluído.

Onde isso aparece:
- **Na rodada:** enviadas, respondidas, agendadas e faturamento.
- **No Faturamento, bloco "O que a IA fez" (D-178):** "Retorno trouxe 6 clientes e R$ 640 este mês".

## 6. Dados (rascunho)

- `ReturnCampaign` (rodada): tipo (`RENEWAL` ou `WINBACK`), criada por, regras de ritmo, incentivo (só no Resgate), estado (`ACTIVE`, `PAUSED`, `DONE`, `CANCELLED`) e datas.
- `ReturnCampaignTarget` (cliente na rodada): cliente, serviço, data esperada de volta, horários oferecidos, estado (`QUEUED`, `SENT`, `REPLIED`, `BOOKED`, `DECLINED`, `SKIPPED` com motivo, `FAILED`), mensagem enviada, agendamento ligado e datas.
- `Customer`: data da última mensagem de retorno, bloqueio de retorno (até quando ou permanente) e motivo.
- **Configuração do negócio:** limite diário, janela de envio, dias de antecedência, N dias do Resgate, texto do incentivo e texto-base de cada rotina.
- **Quem faz o quê:** os envios saem pelo canal do negócio, pela fila de saída que já existe (outbox), e o despachante respeita o ritmo. A IA lê a rodada como contexto da conversa.

## 7. Riscos e cuidados

- **Número não oficial.** O número do negócio está conectado pela Evolution, não pela API oficial do WhatsApp, e mensagem ativa em volume é a principal causa de banimento. Por isso:
  - limite diário baixo, com teto de 30;
  - intervalo sorteado entre mensagens;
  - envio só para quem já foi atendida pelo negócio (o histórico de conversa da Avenly começa na conexão do WhatsApp, então "já conversou" não dá para provar; D-206);
  - mensagens personalizadas, nunca um texto idêntico em massa.
- **LGPD.** O envio se apoia no interesse legítimo de quem já é cliente, com saída fácil: o pedido de parar é respeitado na hora e registrado. A Política de Privacidade deve citar mensagens de retorno.
- **Nada sai sem aprovação.** A rodada é aprovada pela profissional, e cada envio confere as regras de novo antes de sair.

## 8. Fases

1. **Renovação com aprovação manual:** prazo de volta pelo serviço ou pela média, lista da semana, rodada com ritmo, horários de costume e a IA assumindo a conversa.
2. **Resgate:** N dias configurável, incentivo, lembrete único e regras de saída.
3. **Medição:** números da rodada e o bloco no Faturamento.
