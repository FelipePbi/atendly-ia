# Atendly

Atendly é uma plataforma de atendimento por IA para profissionais autônomos de serviços. A IA conversa com clientes pelo WhatsApp, entende a necessidade, consulta a **Agenda Atendly** e executa agendamentos, cancelamentos e remarcações dentro das regras do negócio.

A promessa central é simples:

> **Continue usando seu WhatsApp normalmente. A IA atende seus clientes, organiza os agendamentos e sai de cena quando você assume.**

## Produto atual

No MVP:

- 1 usuário por negócio;
- 1 profissional por negócio;
- 1 número de WhatsApp por negócio;
- Agenda Atendly como única agenda oficial;
- IA com estilos Profissional, Equilibrada e Descontraída;
- Conversas em Comercial / Não classificadas / Pessoal;
- atendimento humano pelo próprio WhatsApp ou pela Atendly;
- clientes, serviços, disponibilidade, bloqueios, compromissos e agendamentos dentro da Atendly;
- uma única importação opcional do Minha Agenda.

## Minha Agenda

Minha Agenda **não é integração ativa** e não é uma alternativa à Agenda Atendly.

Ela pode ser usada uma única vez para migrar, quando disponível:

- serviços;
- clientes;
- disponibilidade;
- agendamentos futuros;
- histórico;
- cancelamentos/faltas e outros dados compatíveis.

Depois de concluir a importação, a operação segue exclusivamente na Atendly.

## UX

A prioridade da experiência é:

**Mobile → Tablet → Notebook → Desktop**

O produto deve ser fácil de entender por usuários leigos, com fluxos simples e uma ação dominante por vez. Telas maiores podem ganhar contexto, mas não devem transformar o produto em um painel administrativo denso.

## Documentação de produto

A fonte soberana é o vault em:

- [`docs/product-vault/00-HOME.md`](docs/product-vault/00-HOME.md)

Principais entradas:

- visão: `docs/product-vault/00-Produto/01-Visao-do-Produto.md`;
- escopo: `docs/product-vault/00-Produto/02-Escopo-do-MVP.md`;
- regras: `docs/product-vault/01-Regras/`;
- fluxos: `docs/product-vault/02-Fluxos/`;
- UX/UI: `docs/product-vault/03-UX-UI/`;
- histórico de decisões: `docs/product-vault/04-Referencia/99-Perguntas-e-Respostas.md`.

## Regra para documentação legada

Documentos anteriores ao product vault podem conter decisões substituídas, especialmente:

- Minha Agenda como agenda oficial;
- sincronização de calendários;
- reimportação;
- dois tons antigos de IA;
- onboarding baseado em escolha de fonte de agenda;
- fluxos desktop-first.

Nesses conflitos, o product vault prevalece.

## Estrutura do repositório

O repositório continua organizado em apps e packages especializados. Para decisões técnicas e setup, consulte os READMEs locais e a documentação de arquitetura existente, sempre respeitando as regras de produto vigentes.

## Para agentes de código/design

Leia [`AGENTS.md`](AGENTS.md) antes de alterar o projeto.
