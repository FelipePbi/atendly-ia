---
title: Especificação das Telas
aliases: [Telas Avenly]
tags: [avenly, telas, ux]
status: vigente
---

# Especificação das Telas

Este documento lista as principais telas que o protótipo deve cobrir. Regras detalhadas estão nos documentos temáticos.

## Autenticação

### Login

- e-mail;
- senha;
- entrar;
- recuperar senha;
- criar conta.

### Cadastro

- nome;
- e-mail;
- senha;
- aceite de Termos e Política;
- CTA criar conta.

### Recuperar senha

No MVP, experiência visual apenas; ação real não precisa funcionar nesta fase.

Telas previstas:

- informar e-mail;
- informar código;
- nova senha;
- sucesso.

## Onboarding

- Boas-vindas
- Segmento + nome
- Modalidade
- Endereço condicional
- Sistema atual
- Importar agora/depois
- Seleção da origem
- Explicação Minha Agenda
- Credenciais Minha Agenda
- Análise
- Preview
- Conflitos
- Progresso de importação
- Resultado/pendências
- Primeiro serviço
- Serviços adicionais opcional
- Dias de atendimento
- Horários
- Demonstração da IA
- Estilo da IA
- Explicação WhatsApp
- Conexão desktop QR
- Conexão mobile por código
- Contatos ignorados opcional
- Explicação do teste
- Teste em progresso
- Sucesso IA ativa
- Conclusão sem WhatsApp

## Início

### Mobile

- status IA/WhatsApp;
- pendências;
- próximos atendimentos;
- poucas métricas secundárias.

### Desktop

Pode adicionar mais contexto e métricas simples.

### Faturamento no Início

O Início mostra o dinheiro por trás de cada número, na mesma ordem de leitura (IA → hoje → semana → mês), em duas direções ([[../../migration/DECISIONS#D-201|D-201]], quadro `Home-Faturamento.dc.html`). Um seletor discreto ao lado do sino troca entre elas; a escolha fica lembrada na aba e a troca entra com a mesma coreografia de abertura do Início.

**Painel do dia** (padrão):

- logo abaixo da faixa da IA, um painel em papel rosado com o faturado de hoje em número grande, "N de M atendimentos", a variação contra **ontem a esta hora** e o total do dia se tudo confirmar, numa barra do que já entrou e do que ainda vem; abaixo, "A entrar" (confirmados pela frente), "Ticket médio" e "Pela IA" (marcado pela IA, faturado e a entrar, com a parte do dia);
- no celular, **Hoje** e **Semana** alternam de verdade (a escolha fica lembrada); a semana mostra o faturado, a variação contra a semana passada até o mesmo dia e hora, uma coluna por dia (o faturado embaixo, o a entrar em cima, o valor escrito e "hoje" no dia corrente), "A entrar" e "Pela IA". O rodapé do painel é o mês, que abre o Faturamento;
- no tablet e no desktop o painel abre em três zonas lado a lado — hoje, semana e mês — sem alternar nada; entre 768 e 1023 px o mês desce para baixo das outras duas;
- abaixo do painel: no celular e no tablet, só os **Próximos** atendimentos; no desktop, a agenda de hoje inteira, com os concluídos rebaixados e o marcador "agora". No tablet e no desktop, ao lado, o bloco **O que a IA fez por você** da semana, com a manchete "A IA marcou R$ X dos seus R$ Y nesta semana." e os destaques de [[#Faturamento]]; no desktop também "Desde que você começou…".

**Agenda que fatura**:

- o dinheiro vira atributo do dia: o cabeçalho de "Hoje" ganha "R$ X faturado · R$ Y a entrar" com a variação e a barra do dia, e cada atendimento mostra o valor (o final registrado ou o preço fixo combinado; sem preço fixo, só o estado);
- no celular, dois ou mais concluídos antes de "agora" se recolhem numa linha ("3 concluídos até 12:30", os nomes e o total faturado), que abre os atendimentos ao toque;
- semana em colunas e o mês abaixo da agenda no celular; no tablet e no desktop, numa coluna à direita, com "O que a IA fez por você" sem manchete e "Ver faturamento completo".

Regras das duas direções:

- o mês mostra só o que já entrou e o que está confirmado pela frente ("R$ X a entrar até o fim do mês · faltam N dias"; no desktop do painel, também o dia da semana mais forte). **Sem meta mensal e sem projeção**: o app não guarda meta e projeção seria valor estimado;
- a variação só aparece quando já houve faturamento e há com o que comparar;
- no desktop, com a IA ativa, a faixa da IA sai do conteúdo (ela já vive na sidebar) e a saudação carrega "N conversas hoje, M aguardam você"; qualquer outro estado da faixa continua no conteúdo. No tablet, "M aguardam você" entra na linha da IA ativa;
- "Precisa da sua atenção" e o checklist "Ative sua IA" continuam logo abaixo da faixa; com pendências, a agenda lista só o que ainda não começou;
- a leitura é a mesma do Faturamento (hoje, semana e mês) e fica lembrada na aba; a que falhar tira da tela só o que dependia dela — a agenda continua.

### Carregamento

- sem esqueleto: enquanto a primeira leitura não chega, a área do conteúdo fica vazia; se passar de ~150 ms, aparece o "A" animado no centro (o carregamento padrão);
- quando o dado chega, o painel entra com fade curto, também com movimento reduzido (só opacidade);
- voltar ao Início mostra na hora a última leitura da aba, sem fade, e a revalida no lugar.

## Agenda

### Agenda — visualização Dia

- seletor de data;
- lista cronológica;
- prioridade e default no mobile;
- solução adequada a espaços estreitos, sem comprimir a grade das telas maiores;
- o atendimento aberto ao lado (painel ou detalhe) fica destacado na lista, não só pela cor.

### Agenda — visualização Semana

- compromissos distribuídos entre os dias;
- possibilidade de ser a visualização padrão em telas maiores;
- filtros por status/serviço em telas maiores;
- adaptação própria para mobile, tablet, notebook e desktop;
- tocar no cabeçalho de um dia escolhe esse dia (coluna destacada) e o resumo abaixo da grade passa a mostrá-lo; `Abrir dia` no resumo é que leva ao Dia.

### Agenda — visualização Mês

- visão macro da distribuição dos agendamentos no mês;
- leitura eficiente também quando houver pouco espaço por evento;
- adaptação própria para mobile, tablet, notebook e desktop.

### Troca de visualização

- seletor entre `Dia`, `Semana` e `Mês`;
- os três modos representam a mesma Agenda, sem criar fluxos separados;
- filtros simples, botão `+`, hold visual e estados dos atendimentos permanecem coerentes entre os modos;
- o voltar do detalhe de um atendimento reabre a Agenda no dia de onde a pessoa saiu (sem origem, no dia do atendimento), na visualização que ela usava.

### Personalização dos dias visíveis

- configuração opcional dos dias da semana exibidos;
- aplicação principalmente em `Semana` e `Mês`;
- redistribuição do espaço entre os dias visíveis;
- possibilidade de voltar a exibir qualquer dia;
- indicação clara de que ocultar não altera disponibilidade nem fecha o dia para atendimento.

### Identidade visual do serviço nos eventos

- exemplo de serviço com identidade visual/cor configurada, como `Manutenção de cílios` com rosa;
- exemplo de serviço sem identidade configurada, usando o padrão da Agenda;
- representação que preserve a distinção entre atendimento, compromisso, bloqueio, hold `Em confirmação` e estados do agendamento;
- apoio visual adicional à cor para que tipo e estado do evento continuem reconhecíveis.

### Novo evento

Escolha:

- Agendamento
- Bloquear horário: uma tela só, direto no período. "Dia inteiro" fecha a data; com período, é pausa no atendimento ou, com a chave "É um compromisso pessoal", compromisso pessoal (D-169, revisão de 2026-10-12)

O horário extra (disponibilidade fora do horário de sempre) não aparece aqui. Ele fica em Configurações > Agenda.

### Novo/editar agendamento

- cliente;
- serviços;
- data;
- horário;
- duração quando excepcional;
- preço quando necessário;
- observações;
- notificar cliente quando alteração relevante.

No novo agendamento (D-170, 2026-10-12), a tela revela uma etapa por vez: no começo só o Cliente; depois os Serviços; depois a Data (com o dia vindo da Agenda, ou hoje) e os Horários; com o horário, "Criar agendamento" e "Repetir este atendimento". O que já vem preenchido aparece de uma vez.

Data e horário ficam num quadro só (Seletores-de-Data-e-Hora.dc.html, "No formulário"): no topo, o resumo grande repete o dia, o início e o fim, ao lado de quem, o quê e quanto tempo; embaixo, o calendário — que começa recolhido na semana do dia escolhido e abre o mês — e os horários livres, empilhados no celular e lado a lado no tablet e no desktop. Os horários oferecidos pela disponibilidade continuam sendo o caminho principal; "Outro horário" abre o tambor de horas e minutos, com aviso (nunca bloqueio) fora do horário de atendimento, e "Usar este horário" confirma.

Serviços mostra os 5 mais usados — os que aparecem em mais atendimentos não cancelados dos últimos 90 dias; no empate, ou sem atendimentos, a ordem do catálogo —, mais "Ver outros serviços" (folha com os demais e busca por nome) e "Outro, sem cadastro".

Criar, remarcar e cancelar não mostram a barra da Agenda (Dia/Semana/Mês, setas e "+ Novo"): só a barra do próprio fluxo.

Repetir (D-171): quantos atendimentos (2 a 12) e o intervalo, com o do serviço sugerido. O botão vira "Revisar N agendamentos" e abre a lista de tudo o que será criado, com as datas com conflito ou sem horário em destaque e a opção de pular a data, antes de "Confirmar N agendamentos". Não existe mais tela separada de série de atendimentos.

### Detalhes do agendamento

- cliente;
- serviços;
- data/horário;
- status;
- confirmação do lembrete;
- ações;
- abrir conversa;
- histórico de alterações.

## Conversas

### Lista

Abas:

- Comercial
- Não classificadas
- Pessoal

Cada linha:

- foto de perfil do WhatsApp quando disponível, senão iniciais;
- nome;
- última mensagem;
- horário;
- estado IA/humano;
- destaque de handoff;
- ponto de "não lida" quando há mensagem do cliente que a profissional ainda não viu (D-195).

Mensagens novas (D-195):

- o item "Conversas" da sidebar e da barra inferior mostra quantas conversas têm mensagem do cliente ainda não vista (some no zero, "9+" acima de nove); abrir a conversa ou responder a ela (pelo app ou pelo WhatsApp) conta como visto; resposta da IA não;
- em qualquer tela que não seja a própria conversa, uma mensagem nova desce do topo como aviso, no jeito do WhatsApp: nome (ou telefone) e a primeira linha; tocar abre a conversa; some sozinho em cerca de 5 s ou pelo botão de fechar;
- contato em "Ignorar IA" e conversa Pessoal não entram no contador nem no aviso.

Com o chat ao lado (desktop):

- título, busca, abas e nota da aba ficam fixos; só as conversas rolam;
- abrir ou trocar de conversa não recarrega a lista: ela mantém a aba, a busca e a rolagem;
- trocar de conversa não mostra esqueleto: a anterior fica até a nova chegar e a troca é um fade suave. Voltar a uma conversa já aberta é imediato.

### Chat

- mensagens;
- autoria interna discreta;
- áudios e transcrição: o primeiro toque em "Ouvir" já toca; pausar, mudar a posição pela onda (também pelo teclado) e a velocidade (1×, 1,5×, 2×); só um áudio toca por vez;
- imagens em miniatura no balão (quadrada, legenda embaixo), que aparecem sozinhas e ampliam ao clicar; enquanto vêm, o lugar delas fica parado, sem esqueleto piscando;
- figurinhas (inclusive animadas) aparecem sozinhas, fora do balão;
- documentos e vídeos com rótulo, nome e tamanho, abertos por "Ver mídia";
- mídia que o WhatsApp não guarda mais (cerca de 30 dias depois do envio) aparece como "Mídia indisponível" (D-175);
- eventos internos recolhíveis/discretos;
- campo de resposta;
- sugestão da IA quando humano atende;
- Retomar IA quando aplicável.

### Perfil do contato no contexto da conversa

Desktop: painel lateral.

Mobile: tela/drawer acionada pelo cabeçalho.

## Clientes

### Lista

- busca;
- foto de perfil do WhatsApp quando disponível, senão iniciais;
- nome;
- telefone;
- último/próximo atendimento;
- criar cliente;
- carregamento sob demanda: cerca de 15 por vez, mais ao chegar perto do fim da lista; a busca e o total no cabeçalho valem para todos os clientes, não só os já carregados;
- título, total, "+" e busca ficam fixos; só os itens rolam;
- abrir ou trocar de cliente não recarrega a lista: ela mantém o que já carregou, a busca e a rolagem, e só atualiza quando o cadastro muda.

### Perfil

- resumo: Histórico em frases (total e desde quando, frequência média, faltas e cancelamentos), próximo atendimento com serviço, duração, valor e quem marcou, e preferências — sem resumo por IA (D-174);
- dados;
- próximos atendimentos;
- histórico;
- observações;
- preferências;
- tags;
- responsável principal: no menu ⋯ do perfil, numa janela; confirmado, aparece no cartão do topo; proposto, um aviso no Resumo leva à janela;
- trocar de cliente com a lista ao lado: crossfade, sem esqueleto.
- cabeçalho igual em Resumo, Atendimentos e Notas (nome, telefone, desde quando, tags, responsável confirmado, "Conversa" e "Agendar"): trocar de aba só troca o conteúdo abaixo;
- "Conversa" fica sempre ao lado de "Agendar" e leva direto ao chat da pessoa (ou do responsável, se ela não tem telefone próprio); sem conversa ainda, aparece desabilitado.

## Serviços

### Lista

- nome;
- duração;
- preço;
- status;
- indicador de pendência quando incompleto;
- título, resumo, "+" e busca ficam fixos; só os itens rolam;
- abrir ou trocar de serviço não recarrega a lista: ela mantém a busca e a rolagem, e só atualiza quando o catálogo muda;
- na primeira carga não há esqueleto: título, "+" e busca já aparecem no lugar final, a área dos itens fica vazia e os itens entram com um fade curto (nenhum, com movimento reduzido);
- com a lista ao lado (a partir de 1024 px), o "+" é só o do topo da lista, sem botão flutuante;
- sem paginação: o catálogo de um profissional autônomo é curto e vem inteiro.

### Criar/editar

- nome;
- duração;
- preço/tipo;
- descrição;
- identidade visual/cor opcional;
- preview simples da identidade visual quando apropriado;
- ativo/inativo;
- recorrência;
- buffers;
- regras privadas para IA;
- modalidade por serviço quando aplicável;
- ao lado da lista (a partir de 1024 px), trocar de serviço mantém o anterior até o novo chegar e troca com um crossfade curto, sem esqueleto.

## Faturamento

Item próprio no menu (`/faturamento`, D-177): depois de Serviços na barra lateral; no celular, atalho no topo do "Mais". Responde "quanto eu atendi e de onde vem a minha receita". Não é financeiro: sem despesa, cobrança, pagamento ou caixa. Regra do valor em [[01-Regras/02-Agenda-e-Agendamentos#Faturamento]].

Período:

- Dia, Semana, Mês (padrão) e Ano; setas para o período anterior e o seguinte; fora do período atual, um botão "Hoje" / "Esta semana" / "Este mês" / "Este ano" volta;
- a semana vai de segunda a domingo; tudo no fuso do negócio;
- trocar de período mantém o anterior na tela até o novo chegar, sem esqueleto.

Resumo:

- **Faturado** em destaque, com a linha "Atendimentos concluídos, pelo preço combinado ou pelo valor final que você registrou.";
- comparação com o período anterior de mesmo tamanho ("+12% que setembro", "−8% que ontem", "Igual a 2025"); com o período ainda correndo, compara o mesmo trecho até a mesma hora de agora e diz qual ("Comparando 1 a 16 de outubro com 1 a 16 de setembro, até as 15:00."); sem faturamento no anterior, só "Setembro não teve faturamento para comparar";
- atendimentos concluídos, ticket médio e **Previsto** (confirmados pela frente), separado do faturado;
- "N atendimentos concluídos sem valor (sob consulta, “a partir de” ou sem preço). Registre o valor final no atendimento para ele entrar aqui.", só quando houver; o aviso inteiro é clicável ("Ver qual" / "Ver quais") e abre a lista desses atendimentos ([[../../migration/DECISIONS#D-179|D-179]]).

Gráficos:

- no Ano, **Mês a mês**; no Mês e na Semana, **Dia a dia**; o Dia não tem gráfico;
- toda coluna tem o valor escrito em cima, em formato curto ("R$ 770", "R$ 9,7 mil"; o valor exato fica no rótulo da coluna), e todo dia (ou mês) tem o rótulo embaixo; no mês, com 31 colunas, e no celular o valor fica na vertical, e no celular o mês rola de lado dentro do cartão; o gráfico respira abaixo do subtítulo (pedido de 2026-10-17);
- o melhor mês (ou dia) ganha a cor cheia, e o título diz qual ("Melhor mês: março, R$ 3.200,00"); o previsto entra claro e listrado em cima do faturado, com legenda;
- cada barra é um botão que abre o período dela (mês no ano, dia no mês e na semana) e diz ao leitor de tela o período, o faturado, os atendimentos e o previsto;
- **Por serviço**: barra de composição nas cores dos serviços e uma linha por serviço com valor, quantidade de atendimentos e participação ("65% do faturamento"), que fecha em 100%.

**O que a IA fez por você** ([[../../migration/DECISIONS#D-178|D-178]]), uma faixa larga logo abaixo do período, antes dos cartões — é o número que justifica assinar a IA. Só o que a agenda prova, nada estimado:

- título com a parte da IA no faturado: "A IA marcou R$ 400,00 dos seus R$ 1.000,00 neste mês", com a porcentagem ao lado e uma barra; abaixo, o previsto dela ("+ R$ 250,00 em 2 atendimentos que ela já marcou pela frente");
- destaques, cada um só quando aconteceu: **clientes novos que chegaram pela IA** (o primeiro agendamento foi dela; importados não contam), com quanto já gastaram e os nomes; **atendimentos marcados fora do seu horário** (a hora em que a IA marcou caiu fora do horário de atendimento ou em dia fechado), com o valor; **atendimentos remarcados pela IA**, com o valor que continuou na agenda;
- "Desde que você começou, a IA trouxe 12 clientes novos, que já faturaram R$ 3.200,00." — o histórico inteiro desses clientes, mesmo as visitas que você marcou;
- no gráfico, a parte do faturado que a IA marcou fica na base de cada barra, em tom escuro, com a legenda "Marcado pela IA", e o leitor de tela diz o valor;
- com a IA desligada (status confirmado) e nada dela no período, a faixa vira convite: "Neste mês, 18 mensagens de clientes chegaram fora do seu horário de atendimento." e "Ligar a IA"; uma hora só conta como fora do horário quando nenhum minuto dela está dentro do horário daquele dia. Com o status incerto ou sem mensagem fora do horário, a faixa não aparece.

No **Início**, o bloco da semana aparece no tablet e no desktop (ver [[#Faturamento no Início]]).

Também, quando houver dado:

- **Clientes que mais faturaram** (cinco), cada nome abre o perfil;
- **Dia da semana mais forte** (no Mês e no Ano): "Sábado: 34% do faturado, R$ 1.200,00", com as barras de segunda a domingo;
- **Faltas e cancelamentos**: quantas e quanto deixou de entrar, pelo valor do acordo. Cada número maior que zero é clicável ("Ver quais") e abre a lista do período (D-179).

**Lista dos atendimentos** (D-179), num painel lateral a partir de 1024 px e numa folha de baixo no celular, com o período no topo:

- cancelamentos e faltas: o resumo de quem fez ("5 por você · 3 pela IA"), e uma linha por atendimento, do mais recente para o mais antigo, com dia e hora, cliente, serviços, o valor do acordo, quem cancelou ou registrou a falta ("Cancelado pela IA", "Cancelado por você", "Cancelado automaticamente", "Veio cancelado da importação"; sem registro, "Sem registro de quem fez"), "Marcado pela IA" quando foi a IA que marcou, e o motivo escrito entre aspas;
- sem valor: o motivo ("Serviço sob consulta", "Preço “a partir de”", "Serviço sem preço", "Atendimento avulso") e "Registrar valor";
- cada linha abre o atendimento — é lá que se registra o valor final; no máximo 200 linhas, com "Mostrando os 200 mais recentes de N atendimentos" quando houver mais;
- carregando sem esqueleto (o texto só aparece se passar de ~150 ms); erro com "Tentar novamente".

Layout: uma coluna no celular; a partir de 1024 px, resumo, gráfico e serviços à esquerda e o resto numa coluna ao lado. Valores em R$ no formato pt-BR.

Estados:

- carregando: sem esqueleto; o "A" animado só se a leitura passar de ~150 ms; a tela entra com fade;
- vazio: "Nenhum atendimento neste período", com a navegação de período ainda disponível;
- erro: "Não foi possível carregar o faturamento" com "Tentar novamente"; falha ao trocar de período mantém o que já estava na tela, com o aviso e "Tentar novamente".

## Mais / Configurações

A partir de 1024 px, a lista de Configurações fica ao lado da seção aberta, inclusive em Importação. Trocar de seção mantém a lista montada e troca só o painel, com um crossfade curto, sem passar por "Carregando configurações". Cada seção busca só o próprio dado quando abre. As configurações já lidas na aba aparecem na hora e são relidas em segundo plano.

### Negócio

- nome;
- segmento;
- modalidades;
- endereço;
- formas de pagamento;
- parcelamento;
- estacionamento;
- acessibilidade;
- redes/instruções;
- área de atendimento domiciliar;
- outras informações.

### Agenda

- horários semanais — a Disponibilidade usa as mesmas peças do onboarding (dias em pílulas, horário de sempre em cartões, "Personalizar dias diferentes" com "Horários por dia" e "Copiar … para outros dias"), e aqui cada dia aceita mais de um intervalo ([[../../migration/DECISIONS#D-196|D-196]]);
- antecedência mínima/máxima;
- granularidade;
- bloqueios e regras relacionadas.

### IA

- estilo;
- comportamento geral;
- status: com o WhatsApp desconectado, a IA aparece **pausada** ("IA pausada", sem "Pausar", com "Reconectar WhatsApp"), aqui e na lista de Configurações; ao reconectar, volta sozinha, sem mudar a escolha gravada;
- "Modo sandbox", para testar sem afetar clientes ([[../../migration/DECISIONS#D-199|D-199]]): interruptor com explicação; ligado, as mensagens (respostas da IA, mensagens enviadas pelo app, lembretes e avisos de alteração) aparecem como enviadas, mas não chegam ao WhatsApp de quem não está na lista "Números que recebem de verdade" (até 20 números com DDD; vazia, nada sai). A IA, a agenda e os lembretes continuam funcionando. Enquanto ligado, toda tela mostra no topo o lembrete "Modo sandbox: mensagens não saem para clientes", sem opção de ocultar, que leva a esta seção;
- FAQ/conhecimento acessado a partir dos módulos adequados.

### WhatsApp

- número;
- nome/foto quando disponíveis;
- conexão;
- estado;
- IA;
- contatos ignorados;
- trocar número;
- desconectar.

### Importação

Antes de concluir primeira migração: fluxo de importação.

Depois: histórico somente leitura.

### Conversas / Retenção

- retenção Comercial;
- retenção Pessoal.

### Aparência

Linha "Aparência" no grupo "Dados e conta", entre Atividade e Conta (`/configuracoes/aparencia`, [[../../migration/DECISIONS#D-181|D-181]]), com a escolha atual na segunda linha ("Rosé · Escuro").

- **Cor:** seis cartões — Verde-petróleo (com "Padrão"), Rosé, Champanhe, Azul sereno, Lavanda e Terracota —, cada um com uma miniatura da interface na própria cor (barra, cartão, etiqueta e botão), no modo em uso. Duas colunas no celular, três a partir de 600 px.
- **Modo:** Claro, Escuro e Automático ("Segue o aparelho"), com ícone de sol, lua e tela.
- Escolher aplica na hora, sem "Salvar": a própria tela é a prévia, e a troca atravessa as cores (com movimento reduzido, só opacidade). A escolha fica salva na conta e vale em qualquer aparelho.
- Se não der para salvar na conta, a aparência volta para a anterior e aparece "Não deu para salvar na sua conta. A aparência voltou para a anterior; tente de novo."
- Uma nota diz que vale para a pessoa em qualquer aparelho e que as clientes não veem nada disso.

### Conta

- dados da conta;
- sair de todos os dispositivos;
- exclusão de conta.

### Atividade

Linha "Atividade" no grupo "Dados e conta", entre Conversas e Aparência (`/configuracoes/atividade`, D-176, D-200). Mostra tudo o que você e a IA fizeram no negócio, do mais recente para o mais antigo, agrupado por dia ("Hoje", "Ontem", "Quinta, 16 de outubro"), um cartão por dia com a quantidade de registros.

Cada linha:

- marca de quem fez: o ícone da IA ou o ícone de pessoa;
- frase em português, com "Você" ou "A IA" como sujeito: "A IA remarcou Ana de 14:00 para 15:30 em 20/10", "Você alterou o cadastro de Ana Souza";
- hora, à direita da frase;
- antes e depois de cada campo alterado num bloco rebaixado ("Nome Ana → Ana Souza"), o antes riscado; o que a frase já diz (situação do cancelamento, IA ligada, serviço arquivado) não se repete embaixo, e o que foi adicionado ou apagado (observação, etiqueta, preferência) aparece como um valor só;
- valores sempre legíveis: cor do serviço com o círculo da cor e o nome (o da paleta, "Rosa-antigo", ou o código da personalizada, "#D479FF"), telefone formatado ("+55 55 99693-6463"), minutos por extenso ("5 h 35 min antes"), dinheiro com centavos ("R$ 90,00"), fuso pelo nome da cidade, "Sim"/"Não", datas em pt-BR; campo sem tradução ganha o rótulo "Outro ajuste", nunca "Campo";
- contato ou cliente pelo nome quando há; sem nome, o telefone formatado;
- nota quando houver (motivo do cancelamento, resumo do que a IA passou, itens importados e não importados, dias e horário de um bloqueio que se repete, o efeito de ligar ou desligar o modo sandbox);
- área numa etiqueta com ícone.

Linha de cliente, agendamento ou conversa abre o detalhe, que volta para Atividade.

Busca pelo nome do cliente, serviço ou contato, no servidor, sempre à vista. Ao lado, o botão "Filtros" abre um modal no centro com Período (todo o período, hoje, 7, 30 ou 90 dias), Quem fez (você e a IA, só você, só a IA), Área (Agenda, Clientes, Serviços, Conversas, Configurações, Importação) e Tipo de ação (criou ou marcou, alterou, cancelou ou removeu), cada um em chips de escolha única. Nada muda até "Aplicar"; fechar descarta a escolha; "Limpar filtros" volta tudo para o padrão. O botão mostra quantos filtros estão ligados, e cada filtro ligado aparece como chip embaixo da busca, que se remove com um toque ("Limpar filtros" ao lado quando há mais de um).

Rolagem sob demanda como na lista de Clientes: a próxima leva chega perto do fim; falha numa leva mostra "Tentar novamente" sem perder o que já veio.

Estados:

- carregando: sem esqueleto; o "A" animado só se a leitura passar de ~150 ms; a lista entra com fade;
- vazio: "Ainda não há atividade", ou "Nenhuma atividade encontrada" com filtro;
- erro: "Atividade indisponível" com "Tentar novamente".

## Notificações

Central com:

- informativas;
- atenção;
- críticas;
- estado lida/não lida;
- histórico recente;
- problemas resolvidos identificados como resolvidos.

## Relacionado

- [[00-Produto/04-Navegacao-e-Modulos]]
- [[03-UX-UI/05-Design-System-Conceitual]]
- [[03-UX-UI/02-Responsividade-Mobile-First]]
