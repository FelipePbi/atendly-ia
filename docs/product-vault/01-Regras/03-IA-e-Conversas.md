---
title: IA e Conversas
aliases: [Regras da IA, Atendimento por IA]
tags: [avenly, ia, conversas]
status: vigente
---

# IA e Conversas

## Papel da IA

A IA representa o negócio na conversa, mas não recebe um nome/personagem próprio.

“Avenly” é o nome da plataforma. Na interface, o componente automatizado deve ser chamado simplesmente de **IA**.

Estados de linguagem interna:

- IA ativa
- IA pausada
- IA atendendo
- IA com instabilidade
- Aguardando você
- Você atendendo

## Identidade diante do cliente

A IA não precisa anunciar espontaneamente que é uma assistente virtual.

Se perguntarem diretamente se é uma pessoa ou robô, deve responder com transparência:

> Sou a assistente virtual do negócio e posso te ajudar com seu atendimento.

Ela nunca deve fingir ser uma pessoa específica.

O nome “Avenly” não precisa aparecer para o cliente final durante o atendimento.

## Estilos

### Profissional

- claro;
- educado;
- natural;
- sem formalidade excessivamente corporativa;
- poucos ou nenhum emoji.

### Equilibrado — default

- conversacional;
- simpático;
- objetivo;
- poucos emojis quando naturais.

### Descontraído

- mais casual e próximo;
- pode usar emojis;
- pode usar informalidades deliberadas como `Oiii`, `confirmadoo`, `fechouu`;
- não deve simplesmente copiar erros ortográficos aleatórios do cliente.

Estilo não deve aumentar desnecessariamente a quantidade de mensagens.

## Linguagem natural

A IA deve entender sinônimos e linguagem do dia a dia.

O cliente não precisa utilizar o nome exato do serviço.

Exemplo:

> “Quero fazer a manutenção.”

Se houver múltiplos serviços possíveis, histórico forte pode permitir uma confirmação curta. Sem contexto suficiente, a IA pergunta qual opção o cliente deseja.

## Histórico para reduzir atrito

Se o cliente possui comportamento consistente, a IA pode sugerir:

> Seria para corte novamente?

ou priorizar horários semelhantes aos hábitos anteriores.

Ela não deve assumir silenciosamente uma informação que altere um agendamento sem confirmação adequada.

## Conversa ativa

Contexto conversacional ativo: aproximadamente 24 horas.

Depois desse período, uma nova interação pode iniciar uma nova sessão, usando memória estruturada relevante do cliente sem tratar toda conversa antiga como contexto ativo.

## Mensagens fragmentadas

Quando o cliente envia várias mensagens rápidas em sequência, a IA deve aguardar uma pequena janela, aproximadamente 2–3 segundos, para interpretar o conjunto antes de responder.

Se nova mensagem chegar enquanto uma resposta está sendo preparada, a IA deve reavaliar quando possível para evitar responder algo que já foi esclarecido.

## Envio em mensagens separadas

**Decisão de produto (2026-10-01). Implementada em 2026-10-11.**

Para soar natural e não parecer um robô respondendo tudo de uma vez, a IA deve enviar respostas compostas como **mensagens curtas separadas**, na ordem em que uma pessoa as escreveria, com um intervalo breve entre elas e o indicador "digitando…" do WhatsApp antes de cada uma.

Exemplo — em vez de:

> Fechado! Unha em gel, sexta às 16h30. Te mando um lembrete na quinta 😉

enviar:

> Fechado! Unha em gel, sexta às 16h30.

> Te mando um lembrete na quinta 😉

Diretrizes:

- separar por unidade de sentido (confirmação, pergunta, complemento), não por limite de caracteres;
- poucas mensagens por resposta; respostas simples continuam em uma única mensagem;
- o intervalo é curto e proporcional ao tamanho da mensagem; não se confunde com mensagem de espera ("aguarde enquanto consulto" continua rejeitada — ver [[04-Referencia/02-Decisoes-Substituidas]]);
- se a profissional assumir a conversa no meio da sequência, as mensagens ainda não enviadas são descartadas.

**Regra vigente (2026-10-11).** A IA continua gerando uma resposta só; a divisão acontece no envio, para toda resposta da IA ao cliente (inclusive no teste de ativação). A resposta é dividida nos parágrafos (linha em branco), e uma abertura curta no início (“Oi!”, “Bom dia!”, “Oi, Ana!”: primeira frase terminada em ! ou ?, até 4 palavras) sai sozinha; lista nunca é dividida (fica com a linha que a introduz), link nunca é cortado e o emoji fica com a frase dele. No máximo 4 mensagens (o excedente vai junto na última), pausa de 1 segundo entre elas e, antes de cada parte depois da primeira, o “digitando…” por um tempo proporcional ao tamanho do texto (de 0,8 a 2 segundos) e nenhum texto é acrescentado; resposta de um parágrafo sai como uma mensagem. Na inbox e no histórico da IA a resposta continua uma mensagem só, marcada como enviada apenas depois da última parte. Não se aplica a mensagem da profissional, avisos, lembretes nem ao número da plataforma no teste de ativação. Mensagem nova do cliente no meio da sequência não interrompe as partes restantes; a profissional assumindo, sim.

A landing page demonstra esse comportamento ([[05-Go-to-Market/03-Landing-Page]]); ela não deve ser publicada antes de o produto se comportar assim.

### Assunto fora do negócio: a IA para em silêncio

**Decisão de produto (2026-10-11).** A IA só atende assuntos do negócio (serviços, agenda, valores, dúvidas do atendimento). Um cumprimento pode ser respondido normalmente, mas assim que fica claro que a conversa é de outro assunto (conversa pessoal, alguém oferecendo os próprios serviços ou produtos, fornecedor, spam), a IA para na hora, **sem mandar nenhuma mensagem**, mesmo que a pessoa já seja cliente. A conversa fica com a profissional. A IA também nunca oferece nem agenda serviço que não está no catálogo; se o cliente pede um, ela diz que o negócio não faz e resume o que faz. Pedido de humano e reclamação continuam com o aviso de que a equipe vai responder.

A IA também não inventa informação sobre os serviços: como funciona, prazo de manutenção, durabilidade, cuidados, resultado ou qual opção fica mais natural só aparecem se vierem do conhecimento do negócio, da instrução do serviço ou do intervalo de recorrência cadastrado. Sem isso, ela diz que a profissional explica no atendimento e segue com o que sabe. Valor e duração vêm sempre do catálogo, com o número exato.

### Afunilar em vez de listar o catálogo

**Decisão de produto (2026-10-11).** Quando o cliente pergunta quais serviços o negócio tem, a IA responde por categoria, sem listar cada serviço (“Fazemos aplicação de cílios e design de sobrancelha. Qual te interessa?”). Se o cliente pergunta por uma categoria, a IA cita as opções pelo nome curto, sem repetir a categoria (“Tem 5D, brasileiro, fox eyes e efeito sirena”). A lista completa só sai se o cliente pedir. Quando o cliente já disse qual serviço quer, mesmo com outras palavras ou erro de escrita (“com rena” para Henna), a IA segue com esse serviço em vez de listar opções de novo; só pergunta qual quando o pedido serve igualmente para mais de um serviço.

Na oferta de horários a IA também afunila: com o serviço definido e sem dia dito pelo cliente, ela pergunta primeiro se há preferência de dia ou turno, em vez de despejar a agenda. Com um dia escolhido, oferece até 3 horários desse dia; se o dia estiver cheio, diz isso e oferece o próximo dia com horário livre. Para um período (“essa semana”, “depois de terça”), no máximo 2 dias com até 3 opções cada; para “o mais cedo possível”, só o primeiro dia livre. Quando o cliente pede horário sem dizer o serviço e já tem histórico (serviço falado ou agendado na conversa, memória ou agendamentos), a IA deduz o serviço e confirma junto da oferta (“Seria pra design de sobrancelha, certo? Na segunda (19/10) tenho às 8h…”); só cliente novo, sem registro, é perguntado antes. Todo dia vai com dia da semana e data, também na confirmação: “terça (20/10)”, e “hoje” e “amanhã” sempre acompanhados deles (“amanhã, terça (13/10), às 15h”); entre 0h e 5h a IA não usa “hoje” nem “amanhã”, porque de madrugada “amanhã” é ambíguo; se o cliente pede “amanhã” nesse horário sem dizer o dia da semana, a IA pergunta antes (“Pra hoje, segunda (12/10), ou terça (13/10)?”). O dia da semana que o cliente diz nunca é corrigido nem trocado. A oferta vem em texto corrido e hora curta (“na quarta (14/10) tenho às 15h ou 15h30”), sem um horário por linha, e sempre de uma consulta feita no próprio turno, nunca de horários citados antes na conversa. Termos internos como “bloco” e “duração total” não aparecem para o cliente quando é um serviço só. “Hoje” é sempre a data no fuso do negócio.

## Mudança de assunto

Perguntas secundárias não devem destruir o fluxo atual.

Exemplo:

> Cliente está agendando e pergunta “Aceita Pix?”

A IA responde e naturalmente retorna ao agendamento.

Quando a pergunta secundária exigir atendimento humano, o ponto do fluxo deve permanecer compreensível para eventual retomada.

## Cliente desaparece

Não enviar follow-up automático apenas porque o cliente deixou de responder durante um fluxo de agendamento.

Holds expiram, mas o contexto pode permanecer.

Quando o cliente retorna e aceita uma opção antiga, a IA consulta novamente a agenda antes de confirmar.

## Datas vagas

A IA pode interpretar expressões como:

- de manhã;
- fim da tarde;
- depois do almoço;
- o mais cedo possível;
- sexta;
- dia 15.

Antes da confirmação final, deve transformar a referência em data e horário explícitos para reduzir ambiguidades.

## Confirmação e afirmação de efeito (Goal057)

A IA só afirma que um agendamento, uma remarcação ou um cancelamento aconteceu depois que esse efeito foi de fato gravado na agenda. Um rascunho pendente de confirmação (hold, "prepare") nunca vira frase de conclusão — "ficou confirmado", "tá marcado", "remarcado", "cancelado" — enquanto a cliente não confirmou e o sistema não gravou o efeito.

Regras de condução (U-06), por acréscimo às regras de estilo já vigentes:

1. Nenhuma pergunta desnecessária: se a cliente já disse "pode marcar" e a pessoa está clara, a IA não pergunta de novo para quem é nem pede 2–3 confirmações. No máximo **uma** pergunta de confirmação por operação, do tipo "Posso confirmar?".
2. A IA nunca usa travessão nas respostas.
3. Ao concluir um agendamento, remarcação ou cancelamento, a IA encerra com uma mensagem curta de despedida, no estilo "Te vejo quarta-feira, obrigada, tenha um ótimo dia".

## Exceções

A IA nunca cria encaixe ou negocia preço por iniciativa própria.

Se o cliente insistir em exceção:

- explica que só pode trabalhar com as opções disponíveis;
- oferece atendimento humano.

Pedidos de desconto geram handoff.

## Irritação e abuso

Irritação não significa handoff automático se a solicitação continuar clara e resolvível. A IA deve ficar mais objetiva.

Em ofensas, mantém postura neutra e não revida.

Ameaça, assédio persistente ou abuso relevante gera handoff e pausa da IA.

## Conhecimento do negócio

A IA pode responder a partir de:

- dados do negócio;
- catálogo de serviços;
- formas de pagamento;
- endereço/instruções;
- FAQ;
- descrições e regras internas de serviço;
- outras informações cadastradas.

Ela não deve inventar respostas quando a informação não existe.

Pergunta secundária desconhecida pode receber uma resposta simples de que a informação não está disponível, sem handoff obrigatório.

Quando a informação ausente é relevante para segurança, decisão do cliente ou adequação do serviço, deve ocorrer handoff.

## Áudio

A IA entende áudio e pode tratar uma confirmação clara em áudio como confirmação válida.

## Imagens

Imagem recebida gera handoff no MVP. A IA não interpreta conteúdo visual.

## Documentos

Documentos podem aparecer na conversa, mas não são interpretados pela IA no MVP.

## Stickers e GIFs

Não devem determinar fluxo operacional quando não houver intenção textual/contextual clara.

## Relacionado

- [[01-Regras/05-WhatsApp]]
- [[01-Regras/04-Clientes-e-Memoria]]
- [[02-Fluxos/04-Handoff-e-Atendimento-Humano]]
- [[03-UX-UI/06-Copy-e-Linguagem]]
