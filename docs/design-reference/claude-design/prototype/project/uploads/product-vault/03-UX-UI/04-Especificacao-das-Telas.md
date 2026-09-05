---
title: Especificação das Telas
aliases: [Telas Atendly]
tags: [atendly, telas, ux]
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

### Mobile

- seletor de data;
- lista cronológica;
- filtros simples;
- botão `+`;
- hold visual;
- estados dos atendimentos.

### Desktop

- grade semanal;
- filtros por status/serviço;
- eventos diferenciados entre atendimento, compromisso e bloqueio.

### Novo evento

Escolha:

- Agendamento
- Compromisso
- Bloqueio

### Novo/editar agendamento

- cliente;
- serviços;
- data;
- horário;
- duração quando excepcional;
- preço quando necessário;
- observações;
- notificar cliente quando alteração relevante.

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
- nome;
- telefone;
- último/próximo atendimento;
- criar cliente.

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
- indicador de pendência quando incompleto.

### Criar/editar

- nome;
- duração;
- preço/tipo;
- descrição;
- ativo/inativo;
- recorrência;
- buffers;
- regras privadas para IA;
- modalidade por serviço quando aplicável.

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
