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

- dia como visualização principal;
- seletor horizontal de datas;
- lista cronológica de eventos;
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
- Agenda: permitir Dia/Semana;
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

Grade semanal.

### Clientes

Lista/tabela compacta com mais colunas.

### Home

Pode mostrar mais contexto e métricas sem transformar a tela em dashboard analítico.

## Regra de progressão

Responsive design deve seguir:

> **Adicionar contexto conforme o espaço aumenta**, e não “esconder problemas do desktop” quando o espaço diminui.

## Relacionado

- [[03-UX-UI/01-Principios-de-UX-UI]]
- [[00-Produto/04-Navegacao-e-Modulos]]
