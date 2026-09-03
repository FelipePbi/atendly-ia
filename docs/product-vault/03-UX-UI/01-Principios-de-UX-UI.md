---
title: Princípios de UX/UI
aliases: [UX Atendly, UI Atendly]
tags: [atendly, ux, ui, mobile-first]
status: vigente
---

# Princípios de UX/UI

## Prioridade de dispositivos

**Mobile → Tablet → Notebook → Desktop**

A interface deve nascer para o celular. Desktop não deve ser a origem reduzida posteriormente para caber no mobile.

## Público leigo

Toda tela deve ser entendível por alguém sem familiaridade com softwares administrativos.

Evitar:

- jargão técnico;
- conceitos internos do sistema;
- excesso de controles simultâneos;
- filtros avançados expostos sem necessidade;
- dashboards densos;
- formulários extensos sem divisão lógica.

## Simplicidade não significa visual cru

A interface deve ser simples, mas visualmente trabalhada.

Usar criteriosamente:

- ícones;
- ilustrações e assets;
- microanimações;
- feedback de sucesso;
- transições suaves;
- skeletons;
- empty states bem compostos;
- hierarquia tipográfica;
- superfícies e bordas;
- animações de progresso quando ajudam compreensão.

Evitar uma sequência de telas composta apenas por texto + campo + botão sem acabamento visual.

## Hierarquia

Cada tela principal deve possuir uma ação primária evidente.

Ações secundárias:

- menor peso visual;
- menu `•••` quando pouco frequentes;
- detalhes avançados revelados sob demanda.

## Densidade

### Mobile

- foco na tarefa atual;
- poucas informações simultâneas;
- uma coluna;
- detalhes em telas/drawers próprios;
- listas em vez de tabelas horizontais.

### Telas maiores

Adicionar progressivamente:

- mais contexto;
- painéis laterais;
- mais colunas;
- agenda semanal;
- cliente ao lado da conversa;
- métricas secundárias.

Não preencher espaço apenas porque ele existe.

## Cards

Usar cards apenas quando houver agrupamento semântico real.

Não colocar todo elemento da interface dentro de cards.

## Formulários

- labels acima dos campos;
- normalmente 1–2 campos relacionados por linha no desktop;
- uma coluna no mobile;
- validação de formato durante digitação apenas quando útil;
- regra de negócio validada ao avançar/salvar;
- erro próximo ao campo;
- preservar valores em erro de servidor.

## Estados

Nunca depender apenas de cor.

Combinar quando apropriado:

- texto;
- ícone;
- forma;
- badge.

## Loading

- skeleton para carregamento de conteúdo;
- spinner para ações curtas;
- erros recuperáveis devem preservar a estrutura da tela e oferecer retry contextual.

## Ações destrutivas

Usar confirmação clara para ações realmente destrutivas.

Evitar modal em ações facilmente reversíveis, como marcar falta quando pode ser corrigida posteriormente.

## Acessibilidade

- contraste adequado;
- áreas de toque confortáveis;
- ações compreensíveis sem depender apenas de ícone;
- navegação por teclado nas áreas principais de desktop;
- ícones acompanhados de texto quando significado não for óbvio.

## Tema

MVP apenas tema claro.

Dark mode fica para evolução futura.
