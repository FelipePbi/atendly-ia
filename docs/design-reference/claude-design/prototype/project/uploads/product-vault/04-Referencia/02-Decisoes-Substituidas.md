---
title: Decisões Substituídas
aliases: [Histórico de Mudanças de Direção]
tags: [atendly, decisoes, historico]
status: referencia
---

# Decisões Substituídas

Este documento evita que decisões antigas reapareçam durante design ou implementação.

## Minha Agenda como integração contínua

**Substituída.**

Direção atual:

- Agenda Atendly é sempre a agenda oficial;
- Minha Agenda serve somente para uma importação única;
- não há reimportação;
- não há sincronização.

## Reimportação

**Removida do MVP e da experiência definida.**

A primeira ideia permitia reimportar e reconciliar alterações. Isso foi descartado devido à complexidade.

## Demonstração apenas fake como validação final

**Substituída parcialmente.**

Existe demonstração automática para primeiro valor, mas a ativação do WhatsApp usa um **teste real** enviado por um número oficial da Atendly.

## Teste opcional/manual recorrente

**Substituído.**

Teste real é usado na ativação e em nova vinculação/troca do WhatsApp. Não é um simulador recorrente disponível livremente nas configurações.

## MVP reduzido / versões 0.x para validar antes

**Rejeitado.**

Existe um único MVP completo. Desenvolvimento pode ter etapas internas, mas validação começa após todo o escopo definido estar pronto.

## Beta explícito

**Rejeitado.**

Primeiros usos são controlados, mas o produto não deve exibir modo/badge beta ou infraestrutura específica de validação.

## Modo observação

**Removido.**

IA atende clientes reais após ativação.

## Painel administrativo para validação inicial

**Adiado.**

Não faz parte do MVP.

## Exportação de dados

**Adiada.**

Não entra no MVP.

## Google Calendar

**Descartado como direção de integração.**

Não haverá integração/sincronização de agenda externa.

## Múltiplos números de WhatsApp

**Descartado como direção do produto.**

Um negócio utiliza um número.

## Multi-profissional no MVP

**Adiado.**

MVP é orientado a um profissional.

## Avisos temporários como entidade de conhecimento

**Removidos.**

Fechamentos/indisponibilidades são tratados pela Agenda/bloqueios. Informações comerciais temporariamente alteradas são atualizadas na própria configuração correspondente.

## Instruções pré/pós-atendimento estruturadas

**Removidas do MVP.**

## Recorrência como série infinita/calendário tradicional

**Substituída.**

Recorrência é uma frequência configurada no serviço e usada para criar múltiplos agendamentos quando o cliente solicita. Depois, os agendamentos são independentes.

## Mensagem de “aguarde enquanto consulto”

**Rejeitada.**

A IA deve responder quando tiver o resultado, sem mensagens de espera rotineiras.

## Relacionado

- [[04-Referencia/99-Perguntas-e-Respostas]]
- [[01-Regras/01-Regras-de-Negocio]]
