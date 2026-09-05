---
title: Responsividade Mobile-First
aliases: [Responsividade Atendly]
tags: [atendly, responsivo, mobile]
status: vigente
---

# Responsividade Mobile-First

## Mobile

### Navegação

Bottom nav:

- Início
- Conversas
- Agenda
- Clientes
- Mais

### Ação contextual

Botão `+` pode mudar de função conforme módulo:

- Agenda → novo evento;
- Clientes → novo cliente;
- Serviços → novo serviço.

### Formulários

Fluxos complexos usam telas full-screen em vez de modais pequenos.

### Agenda

- `Dia` como visualização principal e padrão;
- `Semana` e `Mês` também disponíveis;
- seletor horizontal de datas e lista cronológica de eventos na visualização `Dia`;
- solução própria para cada visualização, sem comprimir uma grade desktop para caber no celular;
- não mostrar todos os espaços vazios como slots;
- `+` abre escolha Agendamento / Compromisso / Bloqueio.

### Conversas

- abas Comercial / Não classificadas / Pessoal;
- lista primeiro;
- chat full-screen após selecionar;
- perfil do cliente acessível pelo cabeçalho.

### Clientes

- lista;
- busca visível;
- resumo mínimo por linha;
- perfil em tela própria.

### Serviços

- lista compacta;
- editar em tela própria.

### Configurações

`Mais` abre lista de destinos, não um painel cheio de cards.

## Tablet

Comportamento base semelhante ao mobile.

Em landscape:

- Conversas: lista + chat;
- Agenda: oferecer `Dia`, `Semana` e `Mês`, aproveitando a largura para aumentar a densidade sem prejudicar a leitura;
- detalhes adicionais podem aparecer sem obrigar layout desktop completo.

## Notebook

Pode usar estrutura desktop, mas evitar três painéis apertados.

Exemplo Conversas:

- lista + chat;
- cliente abre sob demanda.

## Desktop

### Conversas

Quando largura permitir:

`lista | chat | cliente`

### Agenda

- `Semana` pode ser a visualização padrão;
- `Dia` e `Mês` permanecem disponíveis;
- mostrar mais contexto conforme o espaço permitir, sem excesso de informação.

### Clientes

Lista/tabela compacta com mais colunas.

### Home

Pode mostrar mais contexto e métricas sem transformar a tela em dashboard analítico.

## Dias visíveis na Agenda

O usuário pode ocultar dias da semana apenas da visualização, principalmente em `Semana` e `Mês`. O espaço liberado deve ser redistribuído entre os dias visíveis de forma adequada ao dispositivo.

Ocultar um dia não altera disponibilidade nem significa que o negócio está fechado nesse dia. O usuário pode voltar a exibi-lo a qualquer momento.

## Regra de progressão

Responsive design deve seguir:

> **Adicionar contexto conforme o espaço aumenta**, e não “esconder problemas do desktop” quando o espaço diminui.

## Relacionado

- [[03-UX-UI/01-Principios-de-UX-UI]]
- [[00-Produto/04-Navegacao-e-Modulos]]
