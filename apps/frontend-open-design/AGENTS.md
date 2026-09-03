# AGENTS.md — Atendly Open Design

## Missão

Este diretório é a referência de prototipação e design da Atendly. Seu papel é traduzir o produto vigente em telas e estados visuais coerentes, navegáveis e responsivos.

## Fonte soberana

Antes de alterar qualquer protótipo, leia:

1. `../../docs/product-vault/00-HOME.md`;
2. documentos relevantes em `../../docs/product-vault/00-Produto/`, `01-Regras/`, `02-Fluxos/` e `03-UX-UI/`;
3. `DESIGN.md`;
4. este arquivo.

Protótipos HTML existentes, `DESIGN-MANIFEST.json` e handoffs visuais são insumos de implementação, não fonte de regra de produto.

Se uma tela existente contradizer o product vault, a tela deve ser redesenhada.

## Produto que o design deve representar

- Agenda Atendly é a única agenda oficial.
- Minha Agenda aparece apenas no fluxo de uma única importação.
- Um negócio usa um número de WhatsApp.
- O mesmo número pode ser pessoal e profissional.
- Conversas são organizadas em Comercial / Não classificadas / Pessoal.
- O profissional pode continuar usando o WhatsApp e assumir manualmente qualquer conversa.
- A IA possui estilos Profissional, Equilibrada e Descontraída.
- Atendly é a plataforma; a automação deve ser chamada de IA.

## Mobile-first

Prioridade:

**Mobile → Tablet → Notebook → Desktop**

Não desenhe desktop primeiro para depois comprimir.

### Mobile

- uma ação dominante por tela;
- conteúdo em uma coluna;
- detalhes sob demanda;
- formulários complexos em tela própria;
- bottom nav com `Início / Conversas / Agenda / Clientes / Mais`.

### Telas maiores

Adicionar progressivamente:

- mais contexto;
- painéis laterais;
- mais colunas;
- agenda semanal;
- contexto do cliente junto do chat.

## Onboarding

Quatro blocos visuais:

1. Seu negócio
2. Sua agenda
3. Sua IA
4. WhatsApp

Não usar contador rígido do tipo `Etapa X de Y` como estrutura principal.

Fluxo vigente:

`Boas-vindas → negócio → importar/começar do zero → serviço/horários mínimos → demonstração → estilo → WhatsApp → contatos ignorados → teste real → sucesso`

WhatsApp pode ser pulado. Nesse caso, onboarding conclui e Home exibe checklist.

## Minha Agenda

Remova/proíba telas que comuniquem:

- agenda externa ativa;
- sincronização;
- conflito de sync;
- last sync;
- editar no Minha Agenda;
- Agenda Atendly → Minha Agenda;
- troca de fonte de agenda.

Estados válidos:

- introdução à importação;
- autenticação;
- análise;
- preview;
- conflitos da primeira importação;
- progresso;
- resultado;
- pendências;
- histórico após conclusão.

## IA e conversas

Estados de conversa:

- IA atendendo;
- Aguardando você;
- Você atendendo.

Não use robô/mascote/avatar de assistente como identidade da IA.

Eventos do sistema aparecem visualmente diferentes de chat bubbles comuns.

## Qualidade visual

Simplicidade não é sinônimo de layout cru.

Use:

- ícones;
- assets/ilustrações pontuais;
- microanimações;
- transições;
- skeletons;
- feedback visual;
- empty states trabalhados;
- hierarquia tipográfica clara.

Evite decoração que prejudique entendimento.

## Não inventar

Não adicionar por conta própria:

- pagamentos;
- fidelidade;
- indicação;
- multi-profissional;
- equipe;
- vários WhatsApps;
- Google Calendar;
- lista de espera;
- campanhas;
- app nativo;
- novas personas/tom personalizado;
- interpretação de imagem/documentos pela IA.

## Entrega de protótipo

Toda tela nova deve ser verificável em mobile primeiro e possuir comportamento definido para estados:

- normal;
- vazio;
- loading;
- erro relevante;
- indisponibilidade/atenção quando aplicável.
