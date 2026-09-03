---
title: Atendly — Product Vault
aliases: [Atendly Product Vault, Atendly MVP]
tags: [atendly, produto, ux, ui, mvp]
status: vigente
---

# Atendly — Product Vault

Este vault consolida as decisões de **produto** e **UX/UI** do MVP da Atendly.

> [!important]
> Este pacote **não é uma especificação técnica de implementação**. Decisões de infraestrutura, banco, APIs, arquitetura de serviços, modelos de persistência, bibliotecas e detalhes internos devem ser documentadas separadamente.

## Como abrir

Esta pasta é um **Obsidian Vault**: abra `docs/product-vault` diretamente no Obsidian (`Open folder as vault`). A configuração mínima e portátil fica em `.obsidian/`; estado de janela e cache não são versionados. Notas são ligadas por `[[wikilinks]]`, então Graph View e backlinks funcionam sem plugin externo.

O grafo de **código** é outro artefato e vive em `graphify-out/` — ele nunca é exportado por cima deste vault. Ver `docs/AI_WORKFLOW.md`.

## Comece por aqui

- [[00-HOME]] — mapa geral da documentação
- [[00-Produto/01-Visao-do-Produto]] — o que é a Atendly, por que existe e qual problema resolve
- [[00-Produto/02-Escopo-do-MVP]] — o que entra e o que não entra no MVP
- [[01-Regras/01-Regras-de-Negocio]] — regras centrais consolidadas
- [[02-Fluxos/01-Onboarding]] — onboarding definitivo
- [[03-UX-UI/01-Principios-de-UX-UI]] — princípios mobile-first e linguagem visual
- [[04-Referencia/99-Perguntas-e-Respostas]] — rastreabilidade da entrevista de produto

## Convenções

- **MVP** = única versão mínima definida para validação. Não há MVP 0.1/0.2.
- **IA** = automação inteligente que atende clientes. “Atendly” é o nome da plataforma, não da persona da IA.
- **Negócio** = unidade do usuário dentro da plataforma.
- **Agenda Atendly** = agenda oficial do negócio.
- **Minha Agenda** = fonte opcional de uma única migração de dados; nunca uma integração contínua.

## Ordem de prioridade da experiência

**Mobile → Tablet → Notebook → Desktop**

A interface nasce no mobile e ganha contexto/densidade progressivamente em telas maiores.
