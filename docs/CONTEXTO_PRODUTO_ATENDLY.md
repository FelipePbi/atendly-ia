# Contexto do Produto — Atendly

**Status:** contexto consolidado do produto  
**Escopo:** primeira versão comercial focada em agendamentos  
**Público prioritário:** pequenos profissionais autônomos que administram o próprio negócio  

---

## 1. Visão geral

A Atendly é uma plataforma de atendimento e agendamento pelo WhatsApp, apoiada por inteligência artificial. O produto permite que um pequeno negócio responda clientes, apresente serviços e preços, consulte disponibilidade e realize agendamentos automaticamente.

A primeira versão é direcionada principalmente a profissionais autônomos que normalmente concentram todas as funções do negócio: atendimento, execução do serviço, controle da agenda e relacionamento com clientes. Por isso, o produto deve reduzir trabalho operacional sem exigir uma configuração extensa ou conhecimentos técnicos.

A Atendly deixa de ser uma solução configurada especificamente para um único usuário e passa a operar como uma plataforma escalável, na qual cada negócio possui seu próprio ambiente, seus próprios dados e suas próprias configurações.

---

# 2. O que é a Atendly

## 2.1 Definição do produto

A Atendly é uma plataforma SaaS multi-tenant que conecta uma atendente virtual ao WhatsApp de um negócio. Essa atendente utiliza as informações e regras configuradas pelo proprietário para:

- responder dúvidas de clientes;
- informar serviços, preços e duração;
- consultar horários disponíveis;
- criar agendamentos;
- consultar agendamentos existentes;
- reagendar atendimentos;
- cancelar agendamentos;
- encaminhar situações específicas para atendimento humano;
- manter o histórico de clientes e conversas.

O foco da primeira versão não é atendimento genérico. A proposta central é automatizar a jornada que começa na conversa e termina em um agendamento válido.

## 2.2 Proposta de valor

> A Atendly permite que profissionais autônomos atendam e agendem clientes pelo WhatsApp mesmo quando estão ocupados, sem perder o controle da agenda e sem depender de atendimento manual para cada conversa.

O produto deve transformar mensagens recebidas em ações operacionais reais, especialmente agendamentos, reagendamentos e cancelamentos.

## 2.3 Público-alvo inicial

O público inicial é formado por pequenos profissionais autônomos e microempreendedores que prestam serviços com horário marcado, por exemplo:

- cabeleireiros;
- barbeiros;
- manicures;
- profissionais de estética;
- massagistas;
- personal trainers;
- profissionais de atendimento individual;
- pequenos consultórios e prestadores de serviços semelhantes.

Características mais comuns desse público:

- uma única pessoa administra o negócio;
- o proprietário também realiza os atendimentos;
- o WhatsApp é o principal canal de contato;
- a agenda é controlada manualmente ou por um aplicativo simples;
- existe pouco tempo disponível para responder mensagens;
- parte dos clientes entra em contato fora do horário comercial;
- o usuário possui baixa tolerância a configurações longas ou técnicas.

## 2.4 Escopo funcional da primeira versão

A primeira versão contempla:

- criação de conta e autenticação;
- criação automática do ambiente do negócio;
- onboarding orientado e mobile-first;
- configuração básica do negócio;
- escolha obrigatória do sistema de agenda;
- agenda interna da Atendly;
- integração contínua com o aplicativo Minha Agenda;
- importação de dados do Minha Agenda para a Agenda Atendly;
- cadastro e consulta de serviços;
- controle de preços e duração;
- disponibilidade e horários de atendimento;
- cadastro e histórico de clientes;
- criação, consulta, reagendamento e cancelamento de agendamentos;
- definição do estilo de conversa da IA;
- conexão do WhatsApp;
- conversas automáticas e atendimento humano;
- dashboard com visão do trabalho realizado pela Atendly;
- páginas de Termos de Uso e Política de Privacidade.

## 2.5 Fora do foco inicial

Não fazem parte do núcleo da primeira versão:

- folha de pagamento;
- contabilidade;
- emissão fiscal;
- estoque complexo;
- gestão financeira completa;
- gestão avançada de equipes;
- múltiplas unidades;
- marketplace de integrações;
- campanhas avançadas de marketing;
- programa de fidelidade;
- personalização avançada de persona treinada com histórico de conversas.

Essas capacidades podem ser consideradas futuramente, mas não devem desviar o produto do fluxo principal de atendimento e agendamento.

---

# 3. Por que a Atendly existe

## 3.1 Problema do cliente

Profissionais autônomos frequentemente precisam interromper o trabalho para responder mensagens, consultar horários, informar preços e registrar agendamentos. Quando não conseguem responder rapidamente, podem perder o cliente para outro prestador.

Os principais problemas são:

- demora na primeira resposta;
- mensagens recebidas enquanto o profissional está atendendo;
- perda de clientes fora do horário comercial;
- repetição constante das mesmas informações;
- necessidade de alternar entre WhatsApp e agenda;
- erros manuais de horário;
- risco de agendamentos duplicados;
- dificuldade para acompanhar reagendamentos e cancelamentos;
- falta de histórico centralizado do cliente;
- baixa visibilidade sobre quantos agendamentos o atendimento gerou.

## 3.2 Problema atual do produto

O sistema atual contém dados, comportamentos e uma integração com o Minha Agenda configurados de forma fixa para um usuário específico. Esse modelo impede que novos negócios utilizem a plataforma de maneira independente e segura.

Os principais limites atuais são:

- informações específicas hardcoded;
- regras de atendimento vinculadas a um único negócio;
- integração com o Minha Agenda obrigatória e fixa;
- ausência de escolha da origem da agenda;
- risco de mistura de dados ao adicionar novos clientes da plataforma;
- baixa capacidade de configuração por negócio;
- dificuldade para oferecer planos e funcionalidades diferentes.

## 3.3 Razão da evolução

A evolução transforma a Atendly em um produto repetível e comercializável. Cada novo cliente poderá criar uma conta, configurar o negócio, escolher o sistema de agenda e conectar o próprio WhatsApp sem depender de configuração manual pela equipe da Atendly.

Isso permite:

- atender vários negócios com segurança;
- reduzir o custo de implantação;
- oferecer uma experiência de autosserviço;
- cobrar pela plataforma e por módulos de maior valor;
- permitir que o cliente migre gradualmente do Minha Agenda;
- diminuir dependência de um sistema externo;
- demonstrar valor por meio de resultados concretos.

## 3.4 Valor percebido pelo cliente

O valor da Atendly não deve ser apresentado apenas como “uma IA que responde mensagens”. O benefício principal é o resultado operacional gerado.

O produto deve evidenciar:

- clientes atendidos;
- agendamentos realizados pela IA;
- tempo médio de resposta;
- conversas resolvidas automaticamente;
- conversas que exigem atenção humana;
- horas de atendimento manual economizadas;
- cancelamentos e reagendamentos processados;
- receita estimada associada aos agendamentos, quando os preços estiverem disponíveis.

A pergunta principal do dashboard deve ser:

> O que a Atendly fez pelo meu negócio hoje?

---

# 4. Como a Atendly funciona

## 4.1 Modelo de conta e tenant

O tenant representa o ambiente isolado de um negócio.

Na primeira versão:

- ao criar a conta, um tenant é criado automaticamente;
- o usuário que criou a conta torna-se proprietário do tenant;
- o tenant representa o negócio do profissional autônomo;
- cada tenant utiliza um sistema principal de agenda;
- cada tenant possui um número de WhatsApp conectado por vez;
- clientes, serviços, conversas, configurações e agendamentos pertencem ao tenant;
- nenhuma informação de um tenant pode ser acessada por outro tenant.

O número de telefone não deve representar o tenant. Ele é um canal conectado ao negócio, pois pode ser alterado, desconectado ou substituído.

Embora a experiência da primeira versão seja voltada a um único proprietário, o modelo do produto não deve impedir que múltiplos usuários sejam adicionados ao mesmo tenant futuramente.

## 4.2 Fonte oficial da agenda

Todo tenant deve escolher obrigatoriamente uma fonte oficial para os agendamentos.

Existem somente duas opções na primeira versão:

1. Agenda Atendly;
2. Minha Agenda integrado.

Não existe a opção de concluir o onboarding sem escolher e configurar uma agenda.

## 4.3 Agenda Atendly

Quando o usuário escolhe a Agenda Atendly:

- a Atendly se torna a fonte oficial dos dados;
- serviços, preços, duração e horários são gerenciados na Atendly;
- novos agendamentos são gravados na Atendly;
- reagendamentos e cancelamentos são processados na Atendly;
- a IA consulta diretamente a disponibilidade controlada pela Atendly;
- o usuário pode começar do zero ou importar dados do Minha Agenda.

O usuário autônomo é considerado inicialmente o responsável pelos serviços e atendimentos. A interface não precisa obrigá-lo a cadastrar uma equipe ou um profissional separado.

## 4.4 Minha Agenda integrado

Quando o usuário escolhe continuar utilizando o Minha Agenda:

- o Minha Agenda permanece como fonte oficial dos dados;
- a Atendly consulta serviços, preços e disponibilidade no Minha Agenda;
- agendamentos criados pela IA são enviados ao Minha Agenda;
- alterações e cancelamentos devem respeitar os dados do Minha Agenda;
- a interface deve informar o estado da conexão;
- a interface deve informar quando ocorreu a última sincronização;
- falhas de sincronização não podem ser apresentadas como agendamentos confirmados;
- a conexão deve ser validada antes da ativação do atendimento automático.

## 4.5 Importação e integração

Importação e integração possuem significados diferentes.

### Importação

- ocorre como processo de migração;
- transfere dados do Minha Agenda para a Atendly;
- pode incluir clientes, serviços e agendamentos existentes;
- após a conclusão, a Agenda Atendly passa a ser a fonte oficial;
- não pressupõe sincronização contínua com o Minha Agenda.

### Integração

- mantém uma conexão contínua;
- o Minha Agenda continua sendo a fonte oficial;
- a Atendly lê e envia operações ao sistema externo;
- o usuário continua administrando a agenda no Minha Agenda.

A interface deve deixar explícita essa diferença antes da confirmação do usuário.

## 4.6 Importação de dados

Quando o usuário optar por migrar para a Agenda Atendly, a importação deve apresentar uma prévia com:

- quantidade de clientes encontrados;
- quantidade de serviços encontrados;
- quantidade de agendamentos futuros;
- quantidade de agendamentos anteriores, quando disponíveis;
- possíveis duplicidades;
- itens que não puderam ser importados.

O usuário deve confirmar a importação antes da migração. O resultado deve informar sucessos, falhas e pendências. Uma nova execução da mesma importação não deve criar registros duplicados.

## 4.7 Serviço e disponibilidade mínimos

Para que a IA possa realizar agendamentos utilizando a Agenda Atendly, o tenant deve possuir:

- pelo menos um serviço ativo;
- nome do serviço;
- duração do serviço;
- preço definido ou indicação de “valor sob consulta”;
- pelo menos um período de disponibilidade;
- responsável pelo atendimento definido automaticamente como o proprietário na primeira versão.

Para tenants conectados ao Minha Agenda, esses requisitos devem ser encontrados e validados durante a conexão.

## 4.8 Funcionamento da atendente virtual

A atendente virtual utiliza os dados do tenant para formular respostas e executar ações. Ela deve respeitar a fonte oficial da agenda e nunca inventar disponibilidade, preço, serviço ou confirmação de agendamento.

O estilo da conversa possui duas opções:

### Profissional e objetiva

Comunicação clara, direta e mais formal.

### Leve e próxima

Comunicação natural, simpática e acolhedora.

A opção “Personalizada” não faz parte da primeira versão.

Por padrão:

- a IA fala em nome do negócio;
- não utiliza uma identidade pessoal separada obrigatória;
- responde em português do Brasil;
- utiliza o tom “Leve e próxima” como sugestão inicial, mas o usuário deve confirmar sua escolha;
- pode informar que é uma assistente virtual quando isso for necessário ou questionado;
- não responde quando a conversa está pausada para atendimento humano;
- não confirma uma operação que não foi registrada pela agenda;
- encaminha para atendimento humano quando não possui segurança para responder, quando o cliente solicita uma pessoa ou quando ocorre uma falha operacional.

## 4.9 WhatsApp

O WhatsApp é o canal principal de atendimento da primeira versão.

No desktop:

- a conexão é realizada por QR Code;
- o usuário aponta a câmera do WhatsApp para o código;
- o estado da conexão é atualizado automaticamente.

No mobile:

- o usuário recebe um código de vinculação destacado;
- existe uma ação para copiar o código;
- a interface apresenta um passo a passo para inserir o código no WhatsApp;
- o usuário não precisa escanear a própria tela;
- após a ativação no WhatsApp, o frontend atualiza automaticamente e continua o fluxo.

O atendimento automático somente pode ser considerado disponível quando o WhatsApp estiver efetivamente conectado.

---

# 5. Jornada de entrada no produto

## 5.1 Cadastro

O cadastro contém:

- e-mail;
- senha;
- confirmação de senha;
- aceite obrigatório dos Termos de Uso.

O checkbox de aceite:

- inicia desmarcado;
- precisa ser marcado pelo próprio usuário;
- impede a criação da conta quando não aceito;
- apresenta links independentes para os Termos de Uso e para a Política de Privacidade.

Os documentos são exibidos em páginas próprias. O usuário pode voltar para o cadastro sem perder dados não sensíveis já preenchidos. Senhas não devem ser armazenadas de forma persistente no navegador.

## 5.2 Princípios do onboarding

O onboarding é mobile-first e deve reduzir esforço cognitivo. Cada tela deve apresentar uma única pergunta ou tarefa principal.

Princípios obrigatórios:

- evitar formulários extensos;
- evitar scroll no mobile sempre que possível;
- apresentar no máximo dois inputs principais por tela;
- apresentar no máximo duas decisões grandes por tela;
- usar descrições curtas;
- manter a ação principal visível na base da tela;
- informar progresso de forma compacta;
- utilizar subetapas quando uma configuração exigir várias decisões;
- não pedir dados que possam ser inferidos ou configurados depois;
- não bloquear o usuário com personalizações que não sejam necessárias ao agendamento.

## 5.3 Etapas principais do onboarding

O onboarding possui as seguintes etapas conceituais:

1. Seu negócio;
2. Escolha da agenda;
3. Configuração ou conexão da agenda;
4. Como a IA deve conversar;
5. Conexão com o WhatsApp;
6. Teste e ativação.

### Etapa 1 — Seu negócio

Coleta somente:

- nome do negócio;
- segmento de atuação.

Idioma, moeda e fuso horário devem possuir valores sugeridos automaticamente. Data de nascimento e sexo não devem ser solicitados, pois não são necessários para a finalidade do produto.

### Etapa 2 — Escolha da agenda

O usuário escolhe obrigatoriamente entre:

- usar a Agenda Atendly;
- continuar usando o Minha Agenda.

Nenhuma opção deve ser tratada como escolha silenciosa. O usuário precisa entender qual sistema será responsável pelos agendamentos.

### Etapa 3 — Configuração ou conexão

O fluxo varia conforme a escolha:

- Agenda Atendly: começar do zero ou importar do Minha Agenda;
- Minha Agenda: conectar, validar e confirmar os dados encontrados.

Ao começar do zero, serviço, preço, duração, dias e horários podem ser distribuídos em telas menores para evitar formulários longos.

### Etapa 4 — Como a IA deve conversar

O usuário escolhe entre:

- Profissional e objetiva;
- Leve e próxima.

Não existe a opção Personalizada na primeira versão.

### Etapa 5 — WhatsApp

O fluxo se adapta ao dispositivo:

- QR Code no desktop;
- código de vinculação no mobile.

### Etapa 6 — Teste e ativação

Antes de concluir, o sistema valida:

- agenda disponível;
- pelo menos um serviço consultável;
- disponibilidade encontrada;
- WhatsApp conectado;
- capacidade de consultar um horário e formular uma resposta.

O usuário é direcionado à área logada somente após visualizar o resultado do teste.

---

# 6. Área logada

## 6.1 Estrutura principal

A área logada deve priorizar as atividades diárias do profissional autônomo:

- Início;
- Conversas;
- Agenda;
- Clientes;
- Serviços;
- Configurações.

Funcionalidades futuras, como Equipe, Relatórios avançados, Automações e Integrações adicionais, não devem tornar a navegação inicial complexa.

## 6.2 Dashboard

O dashboard deve destacar:

- próximos atendimentos;
- agenda do dia;
- novos agendamentos realizados pela IA;
- conversas aguardando atenção humana;
- estado da conexão do WhatsApp;
- estado da agenda ou integração;
- horas estimadas de atendimento economizadas;
- receita estimada associada aos agendamentos, quando possível.

## 6.3 Agenda

A agenda deve permitir:

- visualizar compromissos;
- criar agendamentos manualmente;
- consultar detalhes;
- reagendar;
- cancelar;
- bloquear períodos;
- identificar agendamentos realizados pela IA;
- identificar a origem do dado quando houver integração.

## 6.4 Clientes

Cada cliente pertence a um único tenant e pode possuir:

- nome;
- telefone;
- histórico de conversas;
- histórico de agendamentos;
- observações relevantes;
- origem do cadastro.

O telefone identifica o cliente dentro do contexto do tenant, mas não representa o tenant.

## 6.5 Serviços

Cada serviço pertence a um tenant e possui, no mínimo:

- nome;
- duração;
- preço ou indicação de valor sob consulta;
- estado ativo ou inativo;
- disponibilidade aplicável.

Serviços inativos não devem ser oferecidos pela IA para novos agendamentos.

---

# 7. Configurações padrão

Para reduzir o onboarding, algumas regras assumem valores iniciais seguros:

| Configuração | Valor inicial |
| --- | --- |
| Idioma | Português do Brasil |
| Moeda | Real brasileiro |
| Fuso horário | Detectado pelo dispositivo, com possibilidade de correção |
| Identidade da IA | Fala em nome do negócio |
| Tom sugerido | Leve e próxima |
| Sobreposição de agendamentos | Não permitida |
| Intervalo adicional entre serviços | Zero |
| Responsável pelo atendimento | Proprietário do tenant |
| Dados mínimos do cliente | Nome e telefone |
| Serviço sem preço | Informar “valor sob consulta” |
| Conversa assumida por humano | IA pausada |
| WhatsApp desconectado | IA indisponível para atendimento automático |
| Falha ao registrar agendamento | Não confirmar o agendamento ao cliente |
| Lembretes | Desativados até configuração posterior |

Não devem assumir valores silenciosos por afetarem diretamente a operação:

- dias de atendimento;
- horários de atendimento;
- duração dos serviços;
- preços;
- prazo mínimo para cancelamento;
- exigência de sinal;
- atendimento simultâneo;
- limite de antecedência para agendar;
- regras específicas por serviço.

---

# 8. Regras de negócio consolidadas

## 8.1 Conta, tenant e isolamento

**RN-001.** Toda conta criada deve possuir um tenant associado.  
**RN-002.** Na primeira versão, o tenant é criado automaticamente durante o cadastro.  
**RN-003.** O criador da conta é o proprietário do tenant.  
**RN-004.** O tenant representa o negócio; o número do WhatsApp representa apenas um canal.  
**RN-005.** Todos os dados operacionais devem pertencer explicitamente a um tenant.  
**RN-006.** Um tenant não pode consultar, alterar ou relacionar dados de outro tenant.  
**RN-007.** A experiência inicial considera um único proprietário, sem impedir múltiplos usuários futuramente.  
**RN-008.** Na primeira versão, cada tenant possui somente um WhatsApp ativo por vez.  

## 8.2 Cadastro e documentos legais

**RN-009.** O aceite dos Termos de Uso é obrigatório para criar a conta.  
**RN-010.** O checkbox de aceite deve iniciar desmarcado.  
**RN-011.** Termos de Uso e Política de Privacidade devem possuir páginas próprias e acessíveis pelo cadastro.  
**RN-012.** O usuário deve conseguir retornar dos documentos legais ao cadastro.  
**RN-013.** Dados não sensíveis do formulário podem ser preservados durante a navegação interna.  
**RN-014.** Senha e confirmação de senha não podem ser gravadas em armazenamento persistente do navegador.  
**RN-015.** A versão dos documentos aceitos deve ser associada ao registro do aceite.  

## 8.3 Onboarding

**RN-016.** A escolha de uma agenda é obrigatória.  
**RN-017.** O onboarding não oferece uma modalidade sem agendamento.  
**RN-018.** Cada tela deve concentrar uma decisão ou tarefa principal.  
**RN-019.** Informações dispensáveis ao agendamento devem ser removidas ou postergadas.  
**RN-020.** Data de nascimento e sexo não fazem parte do onboarding.  
**RN-021.** O usuário deve selecionar explicitamente Agenda Atendly ou Minha Agenda.  
**RN-022.** O estilo de conversa deve ser escolhido entre Profissional e objetiva ou Leve e próxima.  
**RN-023.** A opção Personalizada não existe na primeira versão.  
**RN-024.** A ativação exige validação da agenda, de um serviço consultável e do WhatsApp.  

## 8.4 Agenda Atendly

**RN-025.** Ao selecionar a Agenda Atendly, ela se torna a fonte oficial dos agendamentos.  
**RN-026.** O usuário pode começar sem dados ou importar dados do Minha Agenda.  
**RN-027.** Um serviço ativo precisa possuir nome e duração.  
**RN-028.** Um serviço deve possuir preço ou indicação de valor sob consulta.  
**RN-029.** A agenda não pode oferecer horários fora da disponibilidade configurada.  
**RN-030.** Sobreposição de agendamentos fica desativada por padrão.  
**RN-031.** Agendamentos cancelados não ocupam disponibilidade.  
**RN-032.** Serviços inativos não podem gerar novos agendamentos.  
**RN-033.** O proprietário é considerado o responsável inicial pelos atendimentos.  

## 8.5 Minha Agenda

**RN-034.** Quando integrado, o Minha Agenda permanece como fonte oficial.  
**RN-035.** A conexão deve ser validada antes de ativar a IA.  
**RN-036.** Serviços e disponibilidade devem ser consultados a partir dos dados sincronizados ou obtidos do Minha Agenda.  
**RN-037.** Uma falha de comunicação com o Minha Agenda não pode produzir uma confirmação falsa.  
**RN-038.** O usuário deve visualizar o estado e a atualização da integração.  
**RN-039.** A indisponibilidade da integração deve gerar orientação e encaminhamento seguro, não informações inventadas.  

## 8.6 Importação

**RN-040.** Importar significa migrar dados para a Agenda Atendly, não manter sincronização contínua.  
**RN-041.** O usuário deve visualizar uma prévia antes de confirmar.  
**RN-042.** A importação pode abranger clientes, serviços e agendamentos existentes.  
**RN-043.** A importação deve informar itens importados, ignorados, duplicados e com erro.  
**RN-044.** Repetir uma importação não deve criar duplicidades.  
**RN-045.** Após a migração confirmada, a Atendly se torna a fonte oficial.  

## 8.7 Inteligência artificial e conversas

**RN-046.** A IA somente pode usar dados pertencentes ao tenant da conversa.  
**RN-047.** A IA não pode inventar serviços, preços, horários ou confirmações.  
**RN-048.** Um agendamento somente pode ser confirmado após registro bem-sucedido na fonte oficial.  
**RN-049.** A IA deve respeitar conversas pausadas ou assumidas manualmente.  
**RN-050.** Solicitações explícitas por uma pessoa devem permitir encaminhamento humano.  
**RN-051.** Situações de baixa confiança, reclamações ou falhas operacionais devem ser encaminhadas ou sinalizadas.  
**RN-052.** A IA fala em nome do negócio por padrão.  
**RN-053.** O estilo escolhido pelo tenant deve ser aplicado às respostas.  
**RN-054.** Alterar o estilo não pode alterar dados objetivos do negócio.  

## 8.8 WhatsApp

**RN-055.** O WhatsApp precisa estar conectado para o atendimento automático operar.  
**RN-056.** Desktop utiliza QR Code para vinculação.  
**RN-057.** Mobile utiliza código copiável e instruções de vinculação.  
**RN-058.** A confirmação da conexão deve atualizar a interface automaticamente.  
**RN-059.** A desconexão deve ser visível ao usuário e impedir que a plataforma aparente estar atendendo normalmente.  

## 8.9 Clientes, serviços e agendamentos

**RN-060.** Clientes, serviços e agendamentos pertencem a um tenant.  
**RN-061.** O mesmo telefone pode existir em tenants diferentes sem relacionar os respectivos clientes.  
**RN-062.** Alterações de preço não devem modificar silenciosamente o valor histórico já associado a um agendamento confirmado.  
**RN-063.** Reagendamentos devem liberar o horário anterior somente quando a alteração for concluída com sucesso.  
**RN-064.** Cancelamentos devem registrar o estado do agendamento e liberar a disponibilidade correspondente.  
**RN-065.** A origem de um agendamento deve poder ser identificada, como IA, usuário ou integração.  

---

# 9. Indicadores de sucesso do produto

O produto deve ser avaliado principalmente por resultados operacionais:

- percentual de usuários que concluem o onboarding;
- percentual de tenants com agenda válida e WhatsApp conectado;
- tempo até o primeiro agendamento realizado pela IA;
- quantidade de agendamentos realizados pela IA;
- taxa de conversão de conversa em agendamento;
- tempo médio de primeira resposta;
- percentual de conversas resolvidas sem atendimento humano;
- quantidade de falhas de agenda ou sincronização;
- horas estimadas de trabalho manual economizadas;
- retenção de negócios ativos;
- cancelamento da assinatura;
- receita estimada gerada ou preservada pelos agendamentos.

---

# 10. Premissas comerciais

A Atendly deve ser capaz de oferecer funcionalidades de forma modular, permitindo que a cobrança futura considere o valor utilizado pelo cliente.

Possíveis dimensões comerciais:

- uso da agenda interna;
- integração contínua com o Minha Agenda;
- volume de conversas;
- quantidade de agendamentos;
- números adicionais de WhatsApp em versões futuras;
- usuários adicionais em versões futuras;
- automações, lembretes e relatórios avançados.

Preços, limites e nomes de planos ainda não estão definidos. A definição comercial deve considerar os custos reais de IA, WhatsApp, infraestrutura, sincronização e suporte.

---

# 11. Pendências de definição do produto

Os seguintes pontos ainda precisam de decisão antes de se tornarem regras definitivas:

- método oficial de autenticação e capacidades disponíveis na integração com o Minha Agenda;
- frequência e direção da sincronização contínua;
- política para conflitos entre alterações simultâneas;
- regras de cancelamento e antecedência;
- uso de lembretes automáticos;
- cobrança de sinal ou pagamento antecipado;
- limite de antecedência para novos agendamentos;
- possibilidade de mais de um atendimento simultâneo;
- tratamento de feriados e exceções de disponibilidade;
- dados históricos disponíveis para importação;
- critérios de retenção e exclusão de conversas;
- composição dos planos e limites de uso;
- disponibilidade futura de múltiplos usuários, unidades e números;
- identidade jurídica e informações finais dos Termos de Uso e da Política de Privacidade.

Esses itens não devem ser assumidos silenciosamente durante o desenvolvimento.

---

# 12. Síntese do produto

> A Atendly é uma plataforma multi-tenant de atendimento e agendamento pelo WhatsApp para pequenos profissionais autônomos. Cada negócio possui um ambiente isolado, escolhe obrigatoriamente entre a Agenda Atendly e a integração com o Minha Agenda, configura o estilo da atendente virtual e conecta seu WhatsApp. A IA utiliza os dados do negócio para responder clientes e executar agendamentos reais, sem inventar informações e sem confirmar operações que não tenham sido registradas. O valor do produto está em reduzir trabalho manual, evitar perda de clientes e transformar conversas em agendamentos mensuráveis.
