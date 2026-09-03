# AGENTS.md — Atendly monorepo

## Missão

Atendly é uma plataforma de atendimento por IA para profissionais autônomos de serviços. A proposta central é transformar conversas do WhatsApp em atendimentos resolvidos e agendamentos válidos, usando a **Agenda Atendly como única agenda operacional oficial**.

A IA é parte da plataforma Atendly; não é uma persona chamada “Atendly”.

## Fonte soberana de produto

Antes de alterar comportamento, copy, fluxo ou interface, leia `docs/product-vault/00-HOME.md` e os documentos relevantes em `docs/product-vault/`.

Ordem de autoridade:

1. `docs/product-vault/` — regras vigentes de produto e UX/UI;
2. este `AGENTS.md` — guardrails globais de trabalho;
3. `AGENTS.md` do app alterado;
4. documentação técnica atual do repositório;
5. implementação existente, quando não conflitar com regra explícita de produto.

Se um README, roadmap, protótipo antigo, comentário ou implementação contradizer `docs/product-vault/`, **não propague a regra antiga**. Registre o conflito e alinhe o trabalho ao product vault.

## Regras de produto não negociáveis

### Agenda

- A Agenda Atendly é a única fonte oficial da operação.
- Minha Agenda existe apenas como **fonte opcional de uma única importação**.
- Não há sincronização contínua, troca de “fonte ativa”, reimportação ou modo híbrido.
- Depois de `Concluir importação`, não existe nova importação para aquele negócio.
- Nunca invente disponibilidade, preço, serviço ou confirmação.
- Nunca mostre sucesso antes de a operação ter sido realmente concluída.
- Remarcação preserva o horário anterior até a nova opção ser confirmada.
- Cancelamento preserva histórico.
- Alterações no catálogo não reescrevem silenciosamente agendamentos já combinados.

### WhatsApp

- Um negócio usa um único número de WhatsApp.
- O número pode ser pessoal e profissional ao mesmo tempo.
- O usuário continua podendo usar o WhatsApp normalmente.
- Quando o profissional responde manualmente, a IA sai de cena naquela conversa.
- Conversas são organizadas em `Comercial`, `Não classificadas` e `Pessoal`.
- Contatos em `Ignorar IA` nunca devem ser atendidos/processados pela IA.
- Grupos não são atendidos pela IA no MVP.

### IA

Estilos vigentes:

- `Profissional`
- `Equilibrada` — padrão
- `Descontraída`

Não crie persona fictícia, nome próprio para a IA ou opção “Personalizada” sem nova decisão explícita.

A IA:

- fala em nome do negócio;
- usa histórico para reduzir perguntas, mas confirma informações que alteram um agendamento;
- não negocia desconto nem cria encaixe sozinha;
- faz handoff quando não consegue resolver com segurança;
- não envia mensagens técnicas de “aguarde enquanto consulto”; 
- nunca confirma uma ação antes de concluí-la.

### MVP

Existe **um único MVP**. Não invente MVP 0.1, Beta 1, rollout funcional reduzido ou corte temporário de features sem decisão explícita.

O desenvolvimento pode ser executado em etapas, mas a validação do produto começa apenas após o MVP completo definido no product vault.

## UX/UI global

Prioridade de dispositivo:

**Mobile → Tablet → Notebook → Desktop**

Toda experiência deve nascer no mobile e ganhar contexto em telas maiores.

Princípios:

- uma ação principal evidente por tela;
- linguagem simples para usuários leigos;
- progressive disclosure para detalhes avançados;
- evitar telas densas e formulários longos;
- simplicidade não significa tela crua;
- usar ícones, assets, microanimações e feedback visual quando melhorarem compreensão e acabamento;
- preservar acessibilidade, contraste e touch targets;
- MVP em tema claro.

## Onboarding vigente

Quatro blocos percebidos:

1. Seu negócio
2. Sua agenda
3. Sua IA
4. WhatsApp

Fluxo macro:

`Cadastro → negócio → importar ou começar do zero → serviços/horários mínimos → demonstração da IA → estilo → WhatsApp opcional → contatos ignorados opcional → teste real → IA ativa`

Se o usuário pular WhatsApp, onboarding termina e a Home mostra checklist de ativação.

## Regra para documentação antiga

Ao tocar qualquer `.md` anterior ao product vault:

- remover referências a Minha Agenda como agenda ativa;
- remover fluxos de sincronização/reimportação;
- remover dois tons antigos de IA;
- remover navegação desktop-first ou mobile com Clientes escondido em Mais;
- remover “Atendly” como nome da IA;
- remover métricas não aprovadas como “horas economizadas” ou receita estimada como requisito principal;
- atualizar referências de fonte de verdade para `docs/product-vault/`.

## Limite entre produto e engenharia

O product vault define **o que e como o produto deve se comportar para o usuário**. Ele não autoriza, por si só:

- nova arquitetura de serviços;
- mudança de banco;
- mudança de provider;
- mudança de framework;
- novo contrato de API;
- remoção de serviço técnico existente;
- refatoração estrutural não solicitada.

Se uma regra nova exigir decisão técnica ainda não documentada, pare no limite da decisão de produto e registre a necessidade técnica separadamente.

## Frontend

O frontend deve representar fielmente o product vault. Protótipos antigos são referência visual histórica, não fonte soberana de comportamento.

Nunca preserve uma tela antiga apenas por fidelidade visual quando ela representa uma regra de produto substituída.

## Qualidade de produto

Antes de considerar uma mudança pronta, verifique:

- regra vigente no product vault foi respeitada;
- copy não usa jargão técnico;
- estado de loading/erro/vazio está coberto quando aplicável;
- mobile foi tratado como experiência primária;
- ação destrutiva tem feedback/confirmacão proporcional ao risco;
- estados de IA e WhatsApp não induzem o usuário a acreditar que algo está funcionando quando não está.

## Graphify / RTK

Ferramentas existentes de descoberta e economia de tokens continuam válidas para navegar no código. Elas não são fontes de verdade de produto.
