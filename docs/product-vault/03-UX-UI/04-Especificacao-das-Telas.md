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
- destaque de handoff.

### Chat

- mensagens;
- autoria interna discreta;
- áudios e transcrição;
- imagens/documentos;
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

- resumo;
- dados;
- próximos atendimentos;
- histórico;
- observações;
- preferências;
- tags;
- métricas.

## Serviços

### Lista

- nome;
- duração;
- preço;
- status;
- indicador de pendência quando incompleto;
- título, resumo, "+" e busca ficam fixos; só os itens rolam;
- abrir ou trocar de serviço não recarrega a lista: ela mantém a busca e a rolagem, e só atualiza quando o catálogo muda;
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

## Mais / Configurações

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

- horários semanais;
- antecedência mínima/máxima;
- granularidade;
- bloqueios e regras relacionadas.

### IA

- estilo;
- comportamento geral;
- status;
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

### Conta

- dados da conta;
- sair de todos os dispositivos;
- exclusão de conta.

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
