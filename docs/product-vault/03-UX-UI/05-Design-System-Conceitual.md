---
title: Design System Conceitual
aliases: [Design System Atendly]
tags: [atendly, design-system, ui]
status: direcao
---

# Design System Conceitual

Este documento define direção de experiência, não tokens técnicos finais.

## Personalidade visual

- clean;
- elegante;
- profissional;
- moderna;
- acessível para leigos;
- não excessivamente corporativa;
- não infantil/playful.

## Cor

Base neutra com cor de marca como destaque.

Não usar muitas cores para decorar dados. Cores funcionais devem comunicar estado.

## Identidade visual de serviço na Agenda

O Design System deve definir um padrão consistente para aplicar a identidade visual opcional do serviço nos eventos da Agenda, nas visualizações `Dia`, `Semana` e `Mês`, inclusive em estados compactos e locais com pouco espaço.

No MVP, essa identidade pode partir de uma cor escolhida pelo usuário. Sua representação pode usar faixa, borda, marcador, ponto, superfície tonal ou outra solução validada pelo design; não é obrigatório preencher toda a superfície do evento.

Quando não houver identidade configurada para o serviço, o evento usa o padrão visual da Agenda.

A cor do serviço não pode conflitar com cores semânticas de erro, alerta, sucesso ou estados operacionais. Estado e tipo do evento nunca devem depender somente da cor escolhida para o serviço.

Atendimento, compromisso pessoal, bloqueio, hold `Em confirmação` e os estados do agendamento devem continuar distinguíveis quando a identidade do serviço estiver presente.

## Gradientes

Uso pontual em:

- onboarding;
- momentos de sucesso;
- elementos de marca/marketing.

Evitar gradiente como linguagem dominante de telas operacionais.

## Bordas e cantos

Arredondamento moderado e consistente.

Evitar tanto aparência excessivamente “consumer toy” quanto visual quadrado/enterprise antigo.

## Sombras

Sutis.

Preferir separação através de:

- bordas;
- superfícies;
- espaço;
- hierarquia.

## Iconografia

Ícones devem ajudar reconhecimento rápido.

Quando a ação não for universalmente óbvia, acompanhar com texto.

## Assets e ilustrações

Podem ser usados em:

- onboarding;
- empty states;
- sucesso;
- conexão do WhatsApp;
- demonstração/teste.

Evitar assets meramente decorativos que roubem espaço da tarefa.

## Motion

Microanimações adequadas:

- mudança de etapa;
- conexão do WhatsApp;
- progresso do teste;
- mensagens entrando na demonstração;
- sucesso;
- atualização de status;
- skeleton/loading.

Motion deve ser rápido, útil e respeitar redução de movimento quando aplicável.

## Componentes principais esperados

- Button / IconButton
- Input / Textarea
- Select / Combobox
- Checkbox / Radio / Toggle
- Tabs
- Badge / Status
- Alert / Banner
- Toast
- Modal de confirmação
- Drawer
- Bottom sheet para ações curtas
- List row
- Empty state
- Skeleton
- Date selector
- Calendar event
- Chat bubble
- Chat system event
- Audio message + transcript
- Notification row
- Progress step/block
- Service row
- Customer row
- Appointment card

## Regra de consistência

O mesmo conceito deve usar o mesmo componente/padrão visual em todas as telas.

Exemplo: `IA ativa` não pode parecer um switch em uma tela, um badge sem ação em outra e um card totalmente diferente numa terceira sem motivo claro.

## Relacionado

- [[03-UX-UI/01-Principios-de-UX-UI]]
- [[03-UX-UI/04-Especificacao-das-Telas]]
