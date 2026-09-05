Antes de definir a direção visual final da Atendly, explore internamente pelo menos 3 direções visuais significativamente diferentes entre si.

Não escolha automaticamente padrões comuns de SaaS, dashboards administrativos ou produtos de IA.

As três direções devem diferir de verdade em aspectos como:

* composição;
* personalidade visual;
* uso de tipografia;
* superfícies;
* navegação;
* densidade;
* iconografia;
* uso de ilustrações/assets;
* microinterações;
* forma de destacar a IA;
* tratamento de Agenda, Conversas e Home;
* sensação geral da marca.

Avalie cada direção considerando principalmente:

* simplicidade para usuários leigos;
* uso prioritário em mobile;
* facilidade de uso diário;
* personalidade própria;
* diferenciação em relação a outros SaaS;
* aparência profissional;
* percepção de confiança;
* longevidade visual;
* capacidade de escalar para todo o produto;
* consistência entre mobile, tablet, notebook e desktop.

Não misture superficialmente elementos das três propostas apenas para criar uma quarta alternativa genérica.

Escolha internamente a direção que apresentar o melhor equilíbrio entre:

simplicidade + personalidade + elegância + profissionalismo + usabilidade.

Depois de escolher, desenvolva essa direção com profundidade e consistência em todo o produto.

Durante o processo, faça constantemente este teste:

“Se eu remover o logo da Atendly, esta interface poderia pertencer facilmente a qualquer outro SaaS?”

Se a resposta for sim, a solução ainda está genérica demais e deve ser refinada.

Também faça este segundo teste:

“Esta decisão visual está ajudando o usuário a entender ou operar o produto, ou está aqui apenas porque parece moderna?”

Se for apenas decoração sem função clara, remova ou refine.

A Atendly não deve parecer uma coleção de componentes prontos. Ela deve parecer um produto projetado especificamente para a rotina de profissionais autônomos que trabalham principalmente pelo celular e pelo WhatsApp.


# PROMPT MESTRE — DESIGN COMPLETO DO FRONTEND DA ATENDLY

Quero que você atue como **Lead Product Designer / UX/UI Designer Sênior**, responsável por criar o layout completo, consistente e navegável do frontend da **Atendly**.

Seu trabalho não é apenas “deixar bonito”.

Você deve transformar todas as regras de produto abaixo em uma experiência:

- extremamente simples de entender;
- mobile-first;
- elegante;
- profissional;
- moderna;
- visualmente trabalhada;
- coerente entre todas as telas;
- adequada para pessoas não técnicas;
- eficiente para uso diário;
- sem excesso de informações;
- sem aparência de dashboard corporativo genérico;
- sem aparência de template de SaaS;
- sem estética genérica de produto criado por IA.

A interface deve parecer um **produto real, autoral e cuidadosamente desenhado por uma equipe madura de produto**.

---

# 1. REGRA MAIS IMPORTANTE

Não invente funcionalidades.

Não altere regras de negócio.

Não crie campos, configurações, módulos, dashboards, métricas ou fluxos simplesmente porque “normalmente um SaaS teria”.

Todas as definições funcionais deste prompt devem ser consideradas **fonte de verdade**.

Quando houver espaço de decisão visual ou de interação, use sua criatividade.

Quando houver uma regra funcional explícita, siga-a.

Em caso de dúvida:

1. preserve a simplicidade;
2. preserve o comportamento definido;
3. não acrescente funcionalidade;
4. prefira revelar detalhes sob demanda;
5. não tome decisões de produto não especificadas.

Sua criatividade deve ser aplicada principalmente em:

- composição;
- direção visual;
- hierarquia;
- iconografia;
- microinterações;
- animações;
- transições;
- empty states;
- ilustrações;
- assets;
- organização espacial;
- tipografia;
- navegação contextual;
- formas inteligentes de apresentar informações.

Não use criatividade para mudar o produto.

---

# 2. SOBRE A ATENDLY

A Atendly é uma plataforma de atendimento por IA para profissionais autônomos e pequenos negócios de serviços.

Sua principal proposta de valor é:

> A IA atende clientes pelo WhatsApp, entende o que eles precisam, consulta a agenda real do profissional e realiza agendamentos automaticamente.

A agenda não é um módulo secundário.

A **Agenda Atendly é a fonte oficial da operação**.

O profissional administra pela Atendly:

- serviços;
- clientes;
- agenda;
- compromissos;
- bloqueios;
- conversas;
- IA;
- WhatsApp;
- regras básicas do negócio.

A Atendly deve transmitir a sensação de que o profissional ganhou uma espécie de **atendente inteligente que trabalha junto com ele**, sem retirar seu controle do WhatsApp.

Uma promessa muito importante do produto é:

> Continue usando seu WhatsApp normalmente. A IA identifica atendimentos, responde seus clientes e sai de cena quando você assume.

---

# 3. PÚBLICO PRINCIPAL

O MVP é pensado principalmente para:

- profissionais autônomos;
- cabeleireiros;
- barbeiros;
- manicures;
- designers de sobrancelha;
- profissionais de estética;
- terapeutas;
- massagistas;
- personal trainers;
- prestadores de serviço similares.

Não presuma familiaridade com softwares complexos.

O usuário pode saber:

- usar WhatsApp;
- usar Instagram;
- consultar agenda no celular;

mas não necessariamente entende conceitos como:

- automação;
- workflow;
- handoff;
- LLM;
- integração;
- tenant;
- pipeline;
- sincronização.

Nunca use linguagem técnica na experiência.

---

# 4. ESTRUTURA DO MVP

No MVP:

- 1 usuário;
- 1 negócio;
- 1 profissional;
- 1 número de WhatsApp;
- 1 agenda oficial da Atendly.

Não criar interface multi-profissional.

Não criar seletor de unidades.

Não criar múltiplos números.

Não criar multiempresa.

Não criar gerenciamento de equipe.

Esses conceitos não pertencem ao MVP.

---

# 5. PRIORIDADE DE DISPOSITIVOS

Esta definição é fundamental.

Projete na seguinte ordem:

1. MOBILE
2. TABLET
3. NOTEBOOK
4. DESKTOP

O produto deve nascer no mobile.

NÃO crie uma interface desktop e depois tente “encaixar” no celular.

Primeiro determine a melhor experiência para uma pessoa segurando um smartphone.

Depois evolua progressivamente a interface em telas maiores.

---

# 6. FILOSOFIA MOBILE-FIRST

No mobile:

- uma ação primária evidente por tela;
- poucas informações concorrentes;
- evitar tabelas;
- evitar formulários longos;
- evitar dashboards cheios de cards;
- evitar scroll excessivo nos fluxos principais;
- detalhes secundários devem aparecer sob demanda;
- ações frequentes devem estar próximas;
- botões devem ter área confortável para toque;
- campos devem ser fáceis de preencher;
- teclado não pode esconder CTA importante;
- não usar gestos escondidos como única maneira de executar ações;
- ícones não óbvios devem ter texto ou contexto.

A interface deve ser compreensível sem tutorial.

---

# 7. TELAS MAIORES

Notebook e desktop podem aproveitar o espaço adicional para:

- mostrar mais informações simultaneamente;
- usar painéis laterais;
- exibir mais colunas;
- mostrar lista + detalhe ao mesmo tempo;
- usar agenda semanal;
- manter contexto durante uma ação.

Mas:

> mais espaço não significa adicionar informação desnecessária.

Não transforme a Atendly em um dashboard administrativo denso.

Fluxos de configuração continuam simples mesmo em desktop.

---

# 8. DIREÇÃO VISUAL

Quero algo:

- autoral;
- sofisticado;
- atual;
- limpo;
- elegante;
- confiável;
- profissional;
- acolhedor sem ser infantil;
- tecnológico sem parecer futurista demais.

Evite os clichês visuais comuns de produtos de IA.

NÃO quero:

- excesso de gradientes roxo/azul;
- blobs abstratos;
- estrelas brilhantes em todo lugar;
- ícones de robô;
- cérebros;
- circuitos;
- “magic sparkles” excessivos;
- cards com glow;
- glassmorphism exagerado;
- dashboard cheio de números fictícios;
- visual genérico de template SaaS;
- interfaces que parecem geradas automaticamente;
- estética “AI startup 2024”.

A Atendly deve ter personalidade própria.

---

# 9. CRIATIVIDADE VISUAL

Você possui liberdade para desenvolver uma linguagem visual própria.

Pode utilizar:

- iconografia consistente;
- ilustrações;
- assets;
- pequenos elementos gráficos;
- microanimações;
- transições;
- estados de sucesso;
- animações de carregamento;
- skeletons;
- mudanças suaves de estado;
- feedback visual;
- animações durante o teste da IA;
- empty states trabalhados;
- detalhes visuais que deem identidade ao produto.

Esses recursos devem servir à experiência.

Não devem virar decoração gratuita.

---

# 10. CARDS

Não coloque tudo dentro de cards.

Use cards apenas quando realmente existir um agrupamento conceitual.

Prefira também:

- superfícies;
- divisores;
- seções;
- listas;
- linhas;
- hierarquia por tipografia;
- espaçamento.

Evite a aparência:

“card dentro de card dentro de card”.

---

# 11. ESTADOS E HIERARQUIA

Não dependa apenas de cor.

Combine quando necessário:

- texto;
- ícone;
- cor;
- forma;
- badge.

Ações primárias devem ser claramente diferentes das secundárias.

Ações raras podem ficar dentro de menus `•••`.

---

# 12. LINGUAGEM DA INTERFACE

A própria plataforma Atendly deve conversar de forma:

- clara;
- direta;
- próxima;
- profissional.

Não use linguagem corporativa complicada.

Não use termos técnicos.

Exemplo:

NÃO:

> Handoff solicitado.

USE:

> Aguardando você.

NÃO:

> Instabilidade no LLM.

USE:

> A IA está temporariamente indisponível.

---

# 13. O QUE SIGNIFICA “ATENDLY”

Atendly é o nome da **plataforma**.

Não é o nome da IA.

Dentro da interface, quando estiver falando especificamente do agente automatizado, use:

- IA;
- sua IA;
- IA ativa;
- IA pausada;
- IA atendendo.

Estados relevantes:

- IA ativa;
- IA pausada;
- IA com instabilidade;
- WhatsApp desconectado;
- configuração incompleta.

---

# 14. PERSONALIDADE DA IA

Existem três estilos configuráveis:

## Profissional

Clara, educada, natural e profissional.

Não deve parecer atendimento corporativo robótico.

## Equilibrada

Default.

Conversacional, simpática, clara, próxima e com poucos emojis quando apropriado.

## Descontraída

Mais casual e próxima.

Pode usar informalidades deliberadas como:

- Oiii
- Confirmadoo
- Fechouu 😄

Pode usar emojis moderadamente.

Não deve parecer adolescente nem imitar erros ortográficos aleatórios.

---

# 15. NAVEGAÇÃO MOBILE

Bottom navigation:

- Início
- Conversas
- Agenda
- Clientes
- Mais

Serviços não ocupa item principal.

Dentro de `Mais`, devem estar acessíveis:

- Serviços
- WhatsApp
- IA
- Configurações da Agenda
- Negócio
- Importação
- Conta

Não sobrecarregue a tela `Mais`.

Use lista de destinos clara e organizada.

---

# 16. NAVEGAÇÃO DESKTOP

Em desktop/notebook maior, utilizar sidebar.

Itens principais:

- Início
- Conversas
- Agenda
- Clientes
- Serviços
- Configurações

Também existirão na estrutura superior/contextual:

- status da IA;
- notificações;
- perfil/conta;
- negócio atual.

Como só existe um negócio, não crie seletor de negócios.

---

# 17. HOME MOBILE

A Home deve responder primeiro:

> Existe alguma coisa que eu preciso fazer agora?

Prioridade visual:

1. estado da IA;
2. problemas ou pendências;
3. próximos atendimentos;
4. informações secundárias;
5. poucas métricas úteis.

Não transforme a Home mobile em dashboard de analytics.

Possíveis informações:

- IA ativa/pausada;
- WhatsApp desconectado;
- conversa aguardando profissional;
- configuração impedindo atendimento;
- próximos 3–5 agendamentos;
- pequenos indicadores operacionais.

Métricas devem ficar em segundo plano.

---

# 18. HOME DESKTOP

Pode mostrar mais contexto que o mobile.

Ainda assim, prioridade continua sendo operação.

Evite grandes gráficos sem necessidade.

---

# 19. AGENDA MOBILE

A Agenda mobile deve ser extremamente fácil de usar.

Visualização principal:

**dia**

No topo:

- data;
- navegação anterior/próximo;
- acesso ao calendário;
- seletor horizontal de datas.

Os eventos do dia devem aparecer em lista cronológica clara.

Não usar uma grade semanal comprimida no celular.

Mostrar apenas eventos, não dezenas de slots vazios.

Botão principal:

`+`

Ao tocar:

- Novo agendamento
- Compromisso pessoal
- Bloqueio

Criação/edição abre tela própria full-screen.

---

# 20. AGENDA TABLET

Tablet em portrait pode se aproximar do mobile.

Tablet landscape pode oferecer:

- Dia
- Semana

---

# 21. AGENDA DESKTOP

Visualização inicial:

**semana**

Grade de horários.

Tipos de evento visualmente diferenciados:

- atendimento;
- compromisso pessoal;
- bloqueio.

Não usar uma cor diferente para cada serviço.

Status pode ser indicado por:

- badge;
- ícone;
- estilo do evento.

Agendamentos cancelados não precisam ocupar normalmente a grade.

---

# 22. HOLD

Quando um horário estiver temporariamente reservado pela IA aguardando confirmação do cliente, o profissional deve conseguir entender isso.

Mostrar um estado discreto como:

> Em confirmação

Não parecer um agendamento confirmado.

---

# 23. DETALHE DO AGENDAMENTO

Deve permitir visualizar claramente:

- cliente;
- serviço(s);
- data;
- horário;
- duração;
- preço quando aplicável;
- status;
- observações;
- histórico de alterações;
- origem/autoria de mudanças relevantes.

Ações:

- editar;
- remarcar;
- cancelar;
- concluir;
- marcar não compareceu;
- abrir conversa.

Em desktop pode usar drawer.

Em mobile, tela própria.

---

# 24. SERVIÇOS

Lista mobile simples.

Mostrar principalmente:

- nome;
- duração;
- preço;
- status.

Não mostrar descrição inteira na lista.

Serviço possui:

- nome;
- duração;
- preço;
- descrição opcional;
- status ativo/inativo;
- recorrência opcional;
- instrução interna para IA.

Preço pode ser:

- fixo;
- a partir de;
- sob consulta;
- não informado.

Serviço sem preço não é cadastro inválido.

Serviço importado sem duração deve aparecer como:

> Precisa de revisão

e não pode ser usado pela IA para novos agendamentos.

---

# 25. RECORRÊNCIA DO SERVIÇO

Um serviço pode possuir recomendação de recorrência.

Exemplo:

> Manutenção de sobrancelha  
> A cada 15 dias

Não crie sistema complexo de assinatura/série.

O profissional configura apenas a frequência recomendada.

Exemplos:

- sem recorrência;
- a cada 15 dias;
- a cada 2 semanas;
- a cada 1 mês.

---

# 26. CLIENTES

Mobile:

- lista;
- busca;
- criação manual.

Cada item deve ser simples.

Mostrar:

- nome;
- telefone quando existir;
- informação relevante de próximo ou último atendimento.

Não transformar cada cliente em card gigante.

---

# 27. PERFIL DO CLIENTE

Deve apresentar progressivamente:

- resumo;
- próximos agendamentos;
- histórico;
- observações;
- preferências;
- tags;
- algumas métricas úteis.

No mobile, considerar estrutura como:

- Resumo
- Agendamentos
- Observações

ou uma solução igualmente simples.

Não criar página interminável.

---

# 28. OBSERVAÇÕES DO CLIENTE

Observações são internas.

Existe ação explícita para definir se a IA pode usar aquela observação.

Algo equivalente a:

`A IA pode usar esta informação`

Também incluir orientação discreta:

> Evite registrar informações pessoais que não sejam necessárias para o atendimento.

---

# 29. CONVERSAS

É uma das áreas mais importantes.

Existem três categorias:

- Comercial
- Não classificadas
- Pessoal

No mobile, usar tabs no topo.

Evite dropdown para alternar as categorias.

---

# 30. ITEM DA LISTA DE CONVERSAS

Mostrar apenas o necessário:

- nome;
- última mensagem;
- horário;
- estado operacional.

Estados relevantes:

- IA atendendo;
- Aguardando você;
- Você atendendo.

Conversas que aguardam humano devem possuir maior destaque.

---

# 31. CHAT MOBILE

Chat full-screen.

Cabeçalho com:

- nome;
- estado;
- acesso aos detalhes do cliente.

Informações do cliente não ficam permanentemente abertas.

Acessar tocando no cabeçalho.

---

# 32. CHAT DESKTOP

Utilizar layout master-detail quando houver largura suficiente:

**lista de conversas | chat | contexto do cliente**

Em notebook menor:

**lista | chat**

e cliente abre sob demanda.

---

# 33. AUTORIA DAS MENSAGENS

Mensagens enviadas pela IA e pelo profissional não devem parecer dois personagens completamente diferentes.

Utilizar mesma linguagem visual com identificação discreta da autoria.

Não usar:

- avatar de robô;
- bolha neon;
- personagem “AI bot”.

---

# 34. EVENTOS INTERNOS DO CHAT

Eventos como:

- agendamento criado;
- horário reservado;
- conversa assumida pelo profissional;
- IA retomada;

podem aparecer como eventos centrais discretos.

Não usar bolha de mensagem comum.

---

# 35. SUGESTÕES DA IA

Quando o profissional estiver atendendo manualmente pela interface Atendly, a IA pode sugerir respostas.

No mobile, apresentar próximo ao composer, de maneira discreta.

Nunca misturar sugestão com mensagem já enviada.

Usuário precisa entender:

> isso é uma sugestão.

---

# 36. CONVERSAS PESSOAIS

Mesmo visual geral do chat.

Mas indicar claramente:

> Pessoal · IA desativada

Não usar tema radicalmente diferente.

Não borrar conteúdo.

---

# 37. IGNORAR IA

Usuário pode configurar determinados contatos como:

> Ignorar IA

Exemplos:

- familiares;
- amigos;
- pessoas que ele sempre quer atender manualmente.

Esse conceito deve ser compreensível para leigos.

Não usar palavras como blacklist.

---

# 38. ONBOARDING — DIREÇÃO GERAL

O onboarding é uma experiência extremamente importante.

Ele deve parecer:

- rápido;
- guiado;
- visual;
- leve;
- sem sensação de formulário burocrático.

No mobile:

- uma decisão principal por tela;
- evitar scroll;
- CTA claro;
- progressão visível;
- teclado bem tratado;
- animações e assets podem ajudar.

Não usar sidebar ou bottom navigation durante onboarding.

---

# 39. PROGRESSO DO ONBOARDING

O usuário percebe quatro grandes blocos:

1. Seu negócio
2. Sua agenda
3. Sua IA
4. WhatsApp

Não mostrar algo como:

> Etapa 7 de 19

Use barra ou indicador por bloco.

---

# 40. ONBOARDING — ABERTURA

Tela simples de boas-vindas.

Algo conceitualmente próximo de:

> Configure sua Atendly em poucos passos.

CTA:

> Começar

Pode utilizar ilustração/asset/microanimação que ajude a transmitir:

- atendimento;
- agenda;
- WhatsApp;
- automação.

Não usar robô.

---

# 41. SEU NEGÓCIO

Coletar:

- segmento;
- nome pelo qual clientes conhecem o profissional/negócio;
- modalidade;
- endereço se necessário.

Segmento + nome podem ficar juntos.

Modalidade deve ser uma decisão clara e visual.

Possíveis modalidades:

- atendimento no local;
- atendimento a domicílio;
- online.

Pode selecionar mais de uma.

Se atendimento físico:

pedir endereço.

Não sobrecarregar com campos desnecessários.

---

# 42. IMPORTAÇÃO / COMEÇAR DO ZERO

Perguntar:

> Você já usa algum sistema para organizar seus clientes e agendamentos?

Opções principais:

- Sim, quero importar
- Não, começar do zero

Se sim:

- Importar agora
- Fazer depois

Importar agora é principal.

---

# 43. MINHA AGENDA

Atualmente o primeiro sistema suportado para importação é Minha Agenda.

IMPORTANTE:

não existe sincronização contínua.

Não sugerir visualmente que as plataformas permanecerão conectadas.

A importação é uma **migração única**.

Depois da conclusão:

> a Atendly passa a ser a agenda oficial.

---

# 44. IMPORTAÇÃO — EXPERIÊNCIA

Fluxo:

1. explicar;
2. conectar ao Minha Agenda;
3. analisar;
4. mostrar resumo;
5. escolher importar tudo ou selecionar dados;
6. resolver possíveis conflitos;
7. acompanhar importação;
8. revisar pendências;
9. concluir.

A tela de resumo pode mostrar:

- serviços encontrados;
- clientes;
- agendamentos futuros;
- histórico;
- horários.

`Importar tudo` deve ser ação principal.

`Escolher o que importar` é alternativa.

---

# 45. REGRA CRÍTICA DA IMPORTAÇÃO

Existe apenas **uma importação concluída por negócio**.

Antes de concluir definitivamente, caso existam registros pendentes, deixar isso claro.

Exemplo conceitual:

> Esta é sua única importação. Existem 3 registros que ainda não foram importados. Se concluir agora, eles serão ignorados.

Não transformar isso em experiência assustadora, mas a consequência precisa ser evidente.

Depois de concluída:

Configurações > Importação mostra apenas histórico.

Não existe CTA “Importar novamente”.

---

# 46. CRIAÇÃO DO PRIMEIRO SERVIÇO

Se começar do zero:

primeiro criar pelo menos um serviço.

Cadastro inicial simplificado:

- Nome
- Duração
- Preço

Preço pode estar ausente.

Não incluir nessa etapa:

- descrição;
- recorrência;
- instruções IA;
- configurações avançadas.

Depois:

> Adicionar outro serviço

ou:

> Continuar

---

# 47. HORÁRIOS NO ONBOARDING

Depois dos serviços:

1. selecionar dias;
2. definir horário-base;
3. opcionalmente personalizar dias diferentes.

Não colocar:

- almoço;
- bloqueios;
- recorrência;
- antecedência;
- granularidade;
- exceções.

Esses conceitos ficam para depois.

---

# 48. DEMONSTRAÇÃO DA IA

Quando já existe:

- pelo menos um serviço operacional;
- disponibilidade;

mostrar uma demonstração automática.

Não deve ser apenas uma tela cheia de texto.

Criar algo visualmente interessante.

Simular conversa real.

Enquanto ocorre, mostrar discretamente eventos como:

- serviço identificado;
- agenda consultada;
- horário encontrado;
- agendamento preparado.

No mobile esses indicadores podem fazer parte da narrativa visual.

---

# 49. ESCOLHA DO ESTILO

Depois da demonstração:

> Gostou da forma como a IA conversou?

Mostrar:

- Profissional
- Equilibrada
- Descontraída

Ao selecionar, mostrar pequenas amostras reais.

Não apenas radio buttons frios.

Pode usar composição visual e microanimações para tornar a diferença perceptível.

---

# 50. WHATSAPP — INTRODUÇÃO

Depois da IA:

uma tela explica:

> Agora vamos colocar sua IA para atender de verdade.

Explicar:

- pode usar WhatsApp pessoal ou profissional;
- pode continuar usando normalmente;
- quando o profissional responde, a IA sai de cena;
- conversas serão processadas pela Atendly;
- contatos podem ser ignorados pela IA.

CTA:

> Conectar meu WhatsApp

Secundário:

> Fazer isso depois

---

# 51. CONEXÃO DESKTOP

Priorizar QR Code.

Interface simples.

Mostrar progresso de conexão automaticamente.

Não exigir botão desnecessário “Já conectei” se o sistema consegue detectar.

---

# 52. CONEXÃO MOBILE

Não depender de escanear QR do próprio celular.

Criar fluxo orientado por código de vinculação.

Deve ser extremamente claro.

Usar:

- passos visuais;
- números;
- ícones;
- pequenas ilustrações;
- botão copiar código;
- instruções curtas.

Algo conceitualmente como:

1. Copie o código
2. Abra o WhatsApp
3. Vá em Dispositivos conectados
4. Conecte um dispositivo
5. Use o código

Não criar paredes de texto.

---

# 53. DEPOIS DA CONEXÃO

Mostrar claramente:

- número conectado;
- nome/foto se disponíveis;
- estado Conectado.

Permitir corrigir se conectou número errado antes da ativação.

---

# 54. WHATSAPP PESSOAL

Perguntar se aquele número também é utilizado para conversas pessoais.

Se sim:

explicar rapidamente:

- Pessoal;
- Não classificadas;
- Ignorar IA.

Não assustar.

O objetivo é transmitir controle.

---

# 55. CONTATOS IGNORADOS

Antes da ativação, oferecer opcionalmente:

> Quer impedir que a IA responda algumas pessoas?

Explicação:

> Adicione familiares, amigos ou qualquer contato que você prefira atender sempre pessoalmente.

Selecionar:

- conversas existentes;
- busca;
- telefone manual.

Pode pular.

---

# 56. TESTE REAL DA IA

Esta é uma experiência central.

Depois de conectar WhatsApp:

mostrar tela explicando que a Atendly fará um teste real.

CTA:

> Iniciar teste

Explicar que:

- uma mensagem chegará no WhatsApp;
- será identificada claramente como teste;
- usuário não precisa responder;
- Atendly irá simular um cliente.

---

# 57. EXPERIÊNCIA DO TESTE

A Atendly envia uma conversa real de teste.

Fluxo:

1. mensagem identificando o teste;
2. cliente pergunta preço;
3. pede disponibilidade;
4. escolhe horário;
5. confirma.

O sistema realmente valida:

- serviço;
- preço;
- agenda;
- disponibilidade;
- criação;
- confirmação.

Durante o processo, a tela Atendly mostra progresso em tempo real.

Exemplos de etapas:

- Mensagem enviada
- Serviço identificado
- Consultando agenda
- Horário encontrado
- Agendamento confirmado
- Limpando dados de teste

Faça essa tela visualmente interessante.

É um ótimo lugar para:

- animações;
- progress indicators;
- checkmarks;
- microtransições;
- assets.

Não usar spinner genérico durante três minutos.

---

# 58. SUCESSO DO TESTE

Ao concluir:

uma tela de sucesso elegante.

Mensagem conceitual:

> Tudo pronto!
> Sua IA está ativa e pronta para atender seus clientes.

CTA:

> Ir para o início

O checklist de ativação desaparece.

---

# 59. SE PULAR WHATSAPP

Onboarding termina normalmente.

Mensagem:

> Sua Atendly está configurada.
> Conecte seu WhatsApp quando quiser colocar a IA para atender seus clientes.

A Home passa a mostrar checklist.

Itens:

- serviço operacional;
- horários;
- WhatsApp;
- teste.

Itens concluídos aparecem marcados.

Quando tudo for concluído, checklist desaparece.

---

# 60. CONFIGURAÇÕES

No mobile:

`Mais`

abre uma lista organizada.

Depois cada configuração abre tela própria.

Evite uma página gigantesca com todos os formulários.

Seções conceituais:

## Negócio

- dados do negócio;
- modalidades;
- endereço;
- informações adicionais.

## Agenda

- disponibilidade;
- antecedência;
- horizonte;
- granularidade;
- lembretes;
- políticas.

## IA

- estilo;
- comportamento;
- status;
- automação.

## WhatsApp

- número;
- estado;
- conexão;
- contatos ignorados;
- desconectar/trocar.

## Importação

- histórico da importação única.

## Conta

- nome;
- segurança;
- exclusão da conta.

---

# 61. CONHECIMENTO DO NEGÓCIO

Não crie uma página genérica enorme chamada “Base de conhecimento da IA” para duplicar informações.

A IA aprende com dados nos módulos corretos.

Dados do negócio:

- nome;
- descrição;
- modalidades;
- endereço;
- meios de pagamento;
- estacionamento;
- acessibilidade;
- redes sociais;
- instruções de chegada;
- parcelamento;
- área atendida em domicílio.

Pode existir:

- FAQ;
- informações adicionais.

---

# 62. FAQ

Interface simples:

pergunta + resposta.

FAQ pode ser:

- geral;
- associada a serviço.

Não criar CMS sofisticado.

---

# 63. LEMBRETES

Configuração simples.

Até dois lembretes.

Default:

- um lembrete 24 horas antes.

Possibilitar presets.

Não exigir configuração no onboarding.

---

# 64. NOTIFICAÇÕES

Possuir central de notificações.

Não notificar tudo.

Priorizar eventos que exigem atenção.

Exemplos:

- conversa aguardando profissional;
- WhatsApp desconectado;
- IA indisponível;
- configuração bloqueando atendimento;
- falha operacional.

Níveis visuais:

- informação;
- atenção;
- crítico.

Críticos podem gerar banner persistente.

---

# 65. EMPTY STATES

Todas as áreas vazias devem ser desenhadas.

Não deixar simplesmente uma tabela vazia.

Exemplos:

## Agenda

> Nenhum atendimento neste dia.

CTA:

> Criar agendamento

## Clientes

> Seus clientes aparecerão aqui conforme você cria agendamentos ou adiciona novos clientes.

## Conversas sem WhatsApp

explicar conexão + CTA.

## Conversas conectadas mas vazias

> Quando alguém falar com você pelo WhatsApp, a conversa aparecerá aqui.

## Serviços

> Cadastre seu primeiro serviço.

Use iconografia/assets de maneira elegante quando fizer sentido.

---

# 66. LOADING

Utilizar:

- skeleton para carregamento de conteúdo;
- spinner apenas para ações curtas;
- progress visual específico para processos longos.

---

# 67. ERROS

Erro recuperável deve manter contexto.

Evite tela branca com:

> Algo deu errado.

Dizer:

- o que aconteceu;
- o que usuário pode fazer.

Exemplo:

> Não conseguimos carregar sua agenda.
> Tente novamente.

Pode existir detalhes técnicos opcionalmente para diagnóstico, mas nunca como mensagem principal.

---

# 68. AÇÕES DESTRUTIVAS

Usar confirmação clara quando necessário.

Exemplos:

- cancelar agendamento;
- desconectar WhatsApp;
- concluir importação com pendências;
- excluir conta.

Não usar browser alert.

---

# 69. PRIVACIDADE

No cadastro:

checkbox obrigatório, inicialmente desmarcado:

- Termos de Uso;
- Política de Privacidade.

Links devem abrir páginas próprias.

Antes de conectar WhatsApp:

confirmação explícita sobre processamento/armazenamento das conversas.

---

# 70. RETENÇÃO DE CONVERSAS

Existe configuração em Conversas/Configurações.

Opções:

- 30 dias
- 90 dias
- 180 dias
- 365 dias

Defaults:

- Comercial: 90
- Pessoal: 30

Não precisa aparecer em onboarding.

---

# 71. INTERNACIONALIZAÇÃO FUTURA

O MVP é brasileiro.

Interface:

- pt-BR;
- R$;
- formato brasileiro de data;
- hora 24h.

Não exibir seletor de país, idioma ou moeda agora.

A experiência deve parecer brasileira e natural.

Mas não use linguagem visual excessivamente regional que impeça evolução futura.

---

# 72. O QUE NÃO DEVE APARECER NO MVP

Não desenhar módulos ou telas para:

- pagamentos;
- sinal;
- financeiro;
- cartão fidelidade;
- programa de indicação;
- página do cliente;
- campanhas;
- marketing;
- aniversários;
- avaliações automáticas;
- multi-profissional;
- múltiplos usuários;
- permissões;
- múltiplos negócios;
- múltiplos WhatsApps;
- Google Calendar;
- sincronização de agenda externa;
- aplicativo nativo;
- analytics avançado;
- relatórios complexos;
- exportação;
- CRM;
- ERP;
- Instagram;
- Facebook;
- grupos;
- análise de imagem;
- análise de documentos;
- upload de base de conhecimento;
- lista de espera;
- billing;
- planos pagos.

Não use esses conceitos para preencher telas.

---

# 73. DESIGN SYSTEM

Crie um design system consistente para a Atendly.

Defina pelo menos:

- paleta;
- cores semânticas;
- tipografia;
- escala de espaçamento;
- grid;
- border radius;
- elevação;
- ícones;
- botões;
- inputs;
- selects;
- segmented controls;
- chips;
- badges;
- tabs;
- cards quando necessários;
- list items;
- dialogs;
- drawers;
- bottom sheets;
- navigation;
- toasts;
- banners;
- skeletons;
- empty states;
- estados da IA;
- estados de agendamento;
- componentes da Agenda;
- componentes de Conversas.

Componentes devem parecer da mesma família.

Não crie cada tela como projeto separado.

---

# 74. TOKENS VISUAIS

Procure criar uma identidade visual própria.

Não dependa exclusivamente de:

- azul padrão;
- cinza neutro;
- botão azul.

Escolha uma cor de marca com personalidade, mantendo:

- contraste;
- acessibilidade;
- sofisticação;
- legibilidade.

Use cores semânticas cuidadosamente para:

- sucesso;
- alerta;
- erro;
- informação;
- estados da IA;
- eventos da agenda.

Não permita que cores semânticas concorram com a cor principal da marca.

---

# 75. TIPOGRAFIA

Priorize legibilidade no celular.

Crie hierarquia clara:

- título de página;
- título de seção;
- body;
- secondary;
- metadata;
- label;
- caption.

Evite textos pequenos demais.

Não use tipografia excessivamente “tech”.

---

# 76. ANIMAÇÃO

Animações devem ser rápidas e funcionais.

Utilize principalmente em:

- mudança de estado;
- onboarding;
- criação de agendamento;
- ativação;
- teste real da IA;
- conexão do WhatsApp;
- sucesso;
- abertura de drawers/sheets;
- feedback de ações.

Não criar animações longas que atrasem operação diária.

---

# 77. ACESSIBILIDADE

Manter:

- contraste adequado;
- targets confortáveis;
- foco visível;
- estados não dependentes apenas de cor;
- labels claros;
- navegação por teclado em desktop;
- componentes semanticamente compreensíveis.

---

# 78. COPY

Revise todo texto criado.

Português brasileiro natural.

Evite:

- textos genéricos;
- lorem ipsum;
- frases de marketing artificiais;
- traduções literais do inglês;
- linguagem técnica;
- frases exageradamente empolgadas.

Interface deve parecer escrita por uma equipe brasileira de produto.

---

# 79. CRITÉRIO DE SIMPLICIDADE

Para cada elemento colocado em uma tela, pergunte:

> O usuário precisa disso para tomar uma decisão ou executar uma ação nesta tela?

Se não:

- remova;
- esconda sob demanda;
- mova para detalhe;
- mova para configuração.

---

# 80. CRITÉRIO DE QUALIDADE VISUAL

Ao mesmo tempo, não confunda simplicidade com falta de acabamento.

Uma tela não deve ser apenas:

> título + texto + botão

quando uma composição visual melhor puder:

- explicar;
- orientar;
- criar confiança;
- comunicar progresso;
- dar personalidade ao produto.

Use recursos visuais quando contribuírem.

---

# 81. EVITAR “CARA DE IA”

Faça uma revisão específica procurando padrões comuns de interfaces geradas por IA.

Remova ou redesenhe qualquer coisa que pareça:

- template SaaS;
- dashboard Dribbble genérico;
- landing page de IA;
- shadcn sem customização;
- cards excessivos;
- gradientes previsíveis;
- ícones aleatórios;
- texto demais;
- excesso de badges;
- layout simétrico demais;
- tudo centralizado;
- grandes espaços vazios sem intenção;
- componentes padrão sem identidade.

Quero decisões visuais autorais.

---

# 82. FLUXO MACRO

Considere este fluxo principal:

Cadastro

↓

Onboarding — Seu negócio

↓

Já possui sistema?

→ Importar agora  
→ Fazer depois  
→ Começar do zero

↓

Serviços

↓

Disponibilidade

↓

Demonstração da IA

↓

Escolher estilo

↓

WhatsApp

→ Fazer depois → Home com checklist

OU

→ Conectar

↓

Configurar contatos ignorados opcionalmente

↓

Teste real da IA

↓

IA ativa

↓

Home

---

# 83. TELAS QUE DEVEM SER PROJETADAS

Projete no mínimo todos os estados relevantes das seguintes áreas:

## Acesso

- Login
- Cadastro
- Esqueci minha senha
- Código de recuperação visual
- Termos
- Política de Privacidade

## Onboarding

- Boas-vindas
- Negócio
- Modalidade
- Endereço
- Já utiliza sistema?
- Importar agora ou depois
- Seleção de fonte
- Login Minha Agenda
- Importação analisando
- Preview
- Seleção do que importar
- Conflitos
- Progresso
- Pendências
- Confirmação final
- Primeiro serviço
- Adicionar outros serviços
- Dias de atendimento
- Horário-base
- Personalização por dia
- Demonstração IA
- Escolha de estilo
- Introdução WhatsApp
- Consentimento
- WhatsApp pessoal/comercial
- QR desktop
- Código mobile
- WhatsApp conectado
- Ignorar contatos
- Introdução ao teste
- Teste em progresso
- Teste falhou
- Teste concluído
- Final sem WhatsApp
- Final com IA ativa

## Home

- IA ativa
- IA pausada
- configuração incompleta
- WhatsApp desconectado
- IA instável
- pendências
- sem agendamentos
- agenda normal

## Agenda

- dia mobile
- semana desktop
- calendário de navegação
- novo agendamento
- novo compromisso
- novo bloqueio
- detalhe
- edição
- remarcação
- cancelamento
- conflito manual
- hold em confirmação
- agendamento concluído
- não compareceu

## Conversas

- sem WhatsApp
- vazio
- Comercial
- Não classificadas
- Pessoal
- aguardando profissional
- IA atendendo
- profissional atendendo
- chat
- áudio
- imagem
- documento
- sugestão de resposta
- detalhe cliente
- retomar IA
- marcar pessoal
- sempre permitir IA
- ignorar IA

## Clientes

- vazio
- lista
- busca
- novo cliente
- perfil
- resumo
- histórico
- próximos agendamentos
- observações
- tags
- preferências

## Serviços

- vazio
- lista
- novo
- editar
- ativo
- inativo
- precisa revisão
- recorrência
- instrução privada IA

## Configurações

- menu
- Negócio
- Agenda
- IA
- WhatsApp
- Importação
- Conta
- retenção de conversas
- FAQ
- outras informações do negócio
- lembretes
- políticas
- contatos ignorados
- troca de número
- desconexão
- exclusão de conta

## Notificações

- lista
- informação
- atenção
- crítico
- resolvido
- vazio

---

# 84. ESTADOS RESPONSIVOS

Para as telas principais, não entregue apenas desktop.

Defina no mínimo comportamento para:

### Mobile

~375–430 px

### Tablet

~768–1024 px

### Notebook

~1280–1440 px

### Desktop maior

>1440 px

Não é necessário criar quatro designs completamente diferentes.

Crie comportamento responsivo coerente.

---

# 85. FLUXOS MAIS IMPORTANTES PARA QUALIDADE

Dê atenção especial a estes fluxos:

1. onboarding do zero;
2. onboarding com importação;
3. conexão WhatsApp no mobile;
4. teste real da IA;
5. criar agendamento manual;
6. cliente agendando via IA;
7. profissional assumindo uma conversa;
8. remarcação;
9. cancelamento;
10. configurar serviço recorrente;
11. identificar problema na Home e resolver;
12. usar Agenda durante rotina diária.

Esses fluxos devem ser especialmente refinados.

---

# 86. NÃO CRIAR TELAS DESNECESSÁRIAS

Não transforme cada pequena ação em nova página se:

- bottom sheet;
- drawer;
- menu;
- expansão;
- edição inline;

for mais apropriado.

Por outro lado:

no mobile, formulários importantes devem preferir tela completa a modal pequeno.

---

# 87. PROCESSO QUE VOCÊ DEVE SEGUIR

Não comece desenhando telas aleatoriamente.

Execute nesta ordem.

## FASE 1 — Compreensão

Leia completamente estas especificações.

Crie internamente um mapa de:

- entidades;
- módulos;
- fluxos;
- dependências;
- estados.

Não altere requisitos.

## FASE 2 — Arquitetura de informação

Defina:

- navegação;
- hierarquia;
- módulos;
- subpáginas;
- relação mobile/desktop.

## FASE 3 — Design system

Defina a linguagem visual antes de desenhar dezenas de telas.

## FASE 4 — Mobile

Projete os principais fluxos primeiro em mobile.

Especialmente:

- onboarding;
- Home;
- Agenda;
- Conversas;
- Clientes.

## FASE 5 — Tablet

Adapte aproveitando largura adicional.

## FASE 6 — Desktop

Evolua a experiência adicionando contexto onde realmente houver benefício.

## FASE 7 — Estados

Adicione:

- loading;
- vazio;
- erro;
- sucesso;
- offline;
- bloqueado;
- disabled;
- hover;
- focus;
- active.

## FASE 8 — Microinterações

Adicione animações úteis.

## FASE 9 — Auditoria

Faça revisão completa.

---

# 88. AUDITORIA OBRIGATÓRIA

Antes de considerar o trabalho concluído, revise todas as telas procurando:

## Consistência

- spacing;
- tipografia;
- radius;
- ícones;
- botões;
- inputs;
- cabeçalhos;
- navegação.

## Copy

- ortografia;
- linguagem natural;
- consistência terminológica;
- textos claros;
- zero termos técnicos desnecessários.

## UX

- fluxo compreensível;
- sem campos excessivos;
- sem scroll desnecessário;
- CTAs claros;
- ações destrutivas protegidas;
- feedback após ações.

## Mobile

- teclado;
- áreas de toque;
- bottom navigation;
- headers;
- scroll;
- sheets;
- formulários;
- menus.

## Visual

- não parecer template;
- não parecer “interface de IA” genérica;
- identidade consistente;
- assets com propósito;
- composição refinada.

---

# 89. TESTE MENTAL DE USABILIDADE

Para cada fluxo principal, imagine uma profissional autônoma que:

- usa WhatsApp todos os dias;
- nunca usou um CRM;
- não sabe o que é IA generativa;
- não sabe o que é integração;
- quer começar rápido;
- está usando um celular.

Pergunte:

> Ela entenderia o que fazer sem alguém explicar?

Se a resposta for não:

simplifique.

---

# 90. LIBERDADE CRIATIVA

Não quero que você simplesmente copie:

- Calendly;
- Google Calendar;
- WhatsApp Web;
- Intercom;
- HubSpot;
- Linear;
- Notion;
- Stripe;
- ChatGPT.

Pode estudar padrões conhecidos de interação, mas a combinação visual final deve possuir identidade própria.

Crie algo que pareça **Atendly**.

---

# 91. RESULTADO ESPERADO

Ao final, quero um frontend cujo design transmita:

> “É muito mais simples do que eu imaginava.”

e simultaneamente:

> “Isso parece um produto profissional em que eu confiaria meu atendimento.”

A experiência deve fazer a IA parecer poderosa sem tornar a interface complexa.

A tecnologia deve ficar em segundo plano.

O usuário deve perceber principalmente:

- meus clientes;
- minhas conversas;
- meus horários;
- meus serviços;
- minha IA trabalhando;
- o que precisa da minha atenção.

---

# 92. REGRA FINAL

Se precisar escolher entre:

**mais funcionalidades visíveis**

ou

**mais clareza**

escolha clareza.

Se precisar escolher entre:

**interface genérica segura**

ou

**uma solução visual mais autoral, elegante e coerente**

escolha a solução autoral.

Se precisar escolher entre:

**decorar**

ou

**comunicar melhor**

comunique melhor.

Mas nunca entregue uma experiência visualmente pobre sob o argumento de simplicidade.

Quero um produto:

**simples de usar, difícil de desenhar, claramente bem pensado.**