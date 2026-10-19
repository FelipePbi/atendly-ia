---
title: Decisões Substituídas
aliases: [Histórico de Mudanças de Direção]
tags: [avenly, decisoes, historico]
status: referencia
---

# Decisões Substituídas

Este documento evita que decisões antigas reapareçam durante design ou implementação.

## Resposta em partes como uma mensagem só na inbox

Substituída em 2026-10-19 ([[../../migration/DECISIONS#D-208|D-208]]). A regra de 2026-10-11 dizia que, na inbox, a resposta da IA dividida continuava um balão só, e que lembretes e avisos nunca eram divididos. Agora toda mensagem composta pela plataforma pode sair em partes (escolha do negócio), e a conversa do app mostra um balão por parte.

## Minha Agenda como integração contínua

**Substituída.**

Direção atual:

- Agenda Avenly é sempre a agenda oficial;
- Minha Agenda serve somente para uma importação única;
- não há reimportação;
- não há sincronização.

## MVP apenas tema claro

**Substituída em 2026-10-17 (D-181).**

Direção atual: a profissional escolhe em Configurações › Aparência uma de seis cores de destaque e o modo Claro, Escuro ou Automático. O padrão continua sendo o verde-petróleo no claro.

## Resumo por IA no perfil do cliente

**Substituída em 2026-10-16 (D-174).**

Direção atual: o perfil não mostra resumo gerado por IA. O Resumo traz o Histórico em linguagem natural, o próximo atendimento detalhado e as preferências.

## Preço previsto nunca conta como receita

**Refinada em 2026-10-16 (D-177).**

Direção atual: na tela Faturamento, atendimento concluído sem valor final conta pelo preço do acordo quando todos os serviços dele têm preço fixo, e a tela diz que o faturado é "pelo preço combinado ou pelo valor final". "A partir de", "sob consulta" e "não informado" continuam sem virar número. Fora dessa tela, a regra antiga vale.

## Faturamento como implementação futura

**Substituída em 2026-10-16 (D-177).**

Direção atual: Faturamento existe como item próprio do menu. Não é módulo financeiro: soma atendimentos, sem despesa, cobrança, pagamento ou caixa.

## Cartão de Faturamento e cartão curto da IA no Início

**Substituídos em 2026-10-18 (D-201).**

Direção atual: o Início mostra o faturamento em duas direções trocadas por um seletor ao lado do sino — "Painel do dia" (padrão) e "Agenda que fatura" —, com o bloco "O que a IA fez por você" da semana no tablet e no desktop. O cartão com abas Hoje/Semana e a linha "Neste mês a IA trouxe…" saíram. Meta mensal e projeção do protótipo ficaram de fora: não há meta guardada e projeção é valor estimado.

## Reimportação

**Removida do MVP e da experiência definida.**

A primeira ideia permitia reimportar e reconciliar alterações. Isso foi descartado devido à complexidade.

## Demonstração apenas fake como validação final

**Substituída parcialmente.**

Existe demonstração automática para primeiro valor, mas a ativação do WhatsApp usa um **teste real** enviado por um número oficial da Avenly.

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

## Visualizações e leitura visual da Agenda

**Evoluída após a primeira rodada de prototipação.**

A decisão anterior priorizava `Dia` no mobile e `Semana` no desktop, não previa uma visualização mensal completa e concentrava a diferenciação visual nos tipos de evento.

Direção atual:

- `Dia`, `Semana` e `Mês` são modos de visualização da mesma Agenda;
- `Dia` continua como padrão no mobile;
- `Semana` pode ser o padrão em telas maiores;
- `Mês` oferece a visão macro da distribuição dos agendamentos;
- serviços podem ter identidade visual opcional, representada por uma cor no MVP;
- identidade do serviço não substitui tipo nem estado do evento;
- o usuário pode ocultar dias da semana apenas da visualização, sem alterar a disponibilidade.

Essa mudança é um refinamento da experiência após a prototipação, não uma correção de erro.

## Plano único de assinatura

**Substituída em 2026-10-01** (era hipótese — rodada de monetização, pergunta 405 do [[04-Referencia/99-Perguntas-e-Respostas]]).

A hipótese anterior previa um único plano pago. Direção atual: dois planos, **Grátis** (agenda e operação manual) e **Pro** (tudo que envolve WhatsApp e IA), com teste de 14 dias sem cartão iniciado na ativação da IA. Ver [[05-Go-to-Market/02-Oferta-e-Planos]].

As demais hipóteses de monetização (404–434) continuam hipóteses, exceto onde a nova direção as confirma: teste de 14 dias (406), início na ativação da IA (407), agenda utilizável antes do teste (408), IA pausa e dados permanecem sem assinatura (411) e lembretes não continuam sem assinatura (414).

## Série de atendimentos em tela própria

**Substituída em 2026-10-12** (D-171).

A série de atendimento era uma tela à parte, com formulário próprio, e só podia ser confirmada inteira. Direção atual: repetir é parte do novo agendamento ("Repetir este atendimento"), com revisão antes de confirmar e a possibilidade de pular a data com conflito. O link antigo abre o novo agendamento com a repetição ligada.

## Relacionado

- [[04-Referencia/99-Perguntas-e-Respostas]]
- [[01-Regras/01-Regras-de-Negocio]]
