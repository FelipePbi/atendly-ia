# DESIGN-HANDOFF — Atendly

## Papel deste documento

Este handoff resume a direção visual que deve acompanhar o product vault. Ele não substitui regras de produto.

Fonte soberana:

- `../../docs/product-vault/00-HOME.md`
- `../../docs/product-vault/03-UX-UI/`

## Norte da experiência

Atendly deve parecer um produto operacional premium para autônomos: simples de entender, confiável, elegante e leve.

A experiência deve transmitir:

- controle;
- clareza;
- automação confiável;
- pouco esforço;
- profissionalismo sem aparência enterprise pesada.

## Mobile-first

O primeiro frame de referência para novos fluxos é mobile.

A experiência cresce assim:

`Mobile → Tablet → Notebook → Desktop`

Telas maiores adicionam contexto, não novas complexidades sem necessidade.

## Navegação

### Mobile

`Início | Conversas | Agenda | Clientes | Mais`

### Desktop

Sidebar:

`Início | Conversas | Agenda | Clientes | Serviços | Configurações`

## Fluxos prioritários para prototipação

1. Cadastro e onboarding
2. Home
3. Conversas
4. Agenda
5. Agendamento manual
6. Cliente
7. Serviços
8. WhatsApp
9. Importação Minha Agenda
10. Configurações
11. Notificações/erros críticos

## Onboarding

Blocos:

- Seu negócio
- Sua agenda
- Sua IA
- WhatsApp

Pontos visuais fortes:

- progressão clara;
- demonstração animada da IA;
- escolha de estilo com preview;
- conexão do WhatsApp adequada ao dispositivo;
- teste real com progresso;
- tela final de ativação trabalhada.

## Agenda

### Mobile

- data atual + navegação;
- seletor horizontal de dias;
- lista cronológica;
- botão `+`;
- telas próprias para criação/edição.

### Desktop

- grade semanal;
- contexto adicional;
- filtros simples;
- hold `Em confirmação` visível discretamente.

## Conversas

### Mobile

Lista por abas → chat full-screen → contexto do cliente via cabeçalho.

### Desktop amplo

Lista | Chat | Contexto do cliente

### Estados

- IA atendendo
- Aguardando você
- Você atendendo
- Pessoal — IA desativada

## Minha Agenda

Não existe design de “agenda externa ativa”.

Minha Agenda só aparece como migração única:

`Introdução → login → análise → preview → conflitos → importação → conclusão`

Depois: histórico da importação.

## Linguagem visual

Preservar o conceito visual de **Conversation Flow**:

`mensagem → entendimento → disponibilidade → agendamento → resultado`

Usar de forma sutil em:

- onboarding;
- autenticação;
- demonstração;
- teste;
- empty states;
- estados de IA.

## Motion

Microanimações são recomendadas para:

- troca de etapa;
- mensagens da demonstração;
- conexão do WhatsApp;
- progresso do teste;
- sucesso;
- alteração de status;
- loading skeleton.

Evitar motion decorativo longo.

## Componentes essenciais

- buttons e icon buttons;
- inputs, textareas, selects;
- checkbox, radio, toggle;
- tabs;
- badges/status;
- alert/banner;
- toast;
- modal de confirmação;
- drawer;
- list rows;
- skeleton/empty state;
- date selector;
- appointment item/event;
- chat bubble;
- system event;
- audio + transcript;
- notification row;
- onboarding progress;
- cards somente quando agruparem informação real.

## Regra de atualização do protótipo existente

Qualquer tela com `external`, `sync`, `Minha Agenda ativa`, `integration error` relacionado a agenda externa operacional ou `calendar source` deve ser tratada como candidata a remoção/substituição.

Não use fidelidade ao HTML antigo para perpetuar regra de produto removida.
