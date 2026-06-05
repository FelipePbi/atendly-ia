# Plano Codex — Atendente Virtual V1 atualizado

## Contexto

Este documento consolida a refatoração da seção **Atendente Virtual** da plataforma, incorporando as decisões de produto já definidas.

A tela atual possui apenas a opção de ativar/desativar a IA. A nova versão deve transformar essa área em um painel completo de configuração da atendente virtual, organizado por abas, com foco em **mobile-first**, personalização por usuário e melhor naturalidade nas respostas.

A implementação deve respeitar os padrões já existentes no projeto. Antes de criar tabelas, rotas, componentes ou serviços novos, o Codex deve inspecionar a base atual e reaproveitar o que já existir.

---

## Decisões de produto já fechadas

1. O modo **“somente quando eu estiver fora do WhatsApp”** deve permitir dois escopos:
   - ausência global;
   - ausência por conversa.

2. O tempo mínimo de inatividade deve ser **1 minuto**.
   - Esse valor deve ser configurável pelo usuário dentro da plataforma.
   - Não criar limite máximo arbitrário sem nova decisão.
   - Não assumir um valor default obrigatório sem verificar o fluxo atual. Quando o modo exigir tempo, o usuário deve preencher um valor válido.

3. Os usuários atuais são apenas de teste.
   - É permitido resetar o banco de dados durante a implementação.
   - Não é necessário criar migração complexa de compatibilidade para dados antigos.

4. A persona personalizada aceitará somente arquivos `.txt` exportados do WhatsApp.
   - Não aceitar `.zip`.
   - Não processar mídia.
   - Não importar imagens, áudios, vídeos ou anexos.

5. Os arquivos originais de conversa **não devem ser armazenados permanentemente**.
   - O sistema deve apenas receber, validar, processar, gerar o perfil personalizado e descartar o conteúdo bruto.
   - Salvar apenas metadados mínimos e o perfil final gerado.

---

## Objetivo da refatoração

Transformar o menu **Atendente Virtual** em um painel onde cada usuário consiga configurar:

- se a IA está ativa ou pausada;
- quando a IA pode responder;
- se a ausência será calculada globalmente ou por conversa;
- o nome da atendente virtual;
- a persona da IA;
- instruções adicionais de comportamento;
- persona personalizada baseada em conversas reais do WhatsApp.

O objetivo é tornar a IA mais natural, humana e alinhada à forma de atendimento do negócio, sem perder segurança, controle e previsibilidade.

---

## Estrutura final da tela Atendente Virtual

A tela deve ser organizada em abas.

### Abas obrigatórias

1. **Geral**
2. **Personas**
3. **Instruções**

No mobile, as abas devem aparecer no topo do conteúdo, com rolagem horizontal se necessário. Todos os cards, campos e botões devem ser otimizados para toque.

---

# Aba 1 — Geral

A aba **Geral** será a aba principal da seção.

## Funcionalidades

### 1. Ativar/desativar IA

Manter a funcionalidade atual.

Estados esperados:

- **IA ativa**
  - Texto de apoio: “A atendente virtual pode responder clientes conforme as regras configuradas.”

- **IA pausada**
  - Texto de apoio: “Nenhuma resposta automática será enviada.”

A ativação da IA deve respeitar as configurações obrigatórias. Não permitir ativar a IA se o usuário ainda não definiu:

- nome da IA;
- persona válida;
- tempo de inatividade válido, quando o modo exigir;
- perfil personalizado pronto, quando a persona escolhida for personalizada.

---

### 2. Quando a IA entra em ação

Campo obrigatório.

Opções:

#### Opção A — A qualquer momento

A IA pode responder sempre que receber mensagens, desde que as regras já existentes sejam respeitadas:

- IA ativa;
- contato não está na lista de ignorados;
- chat não está pausado;
- debounce concluído;
- instância WhatsApp conectada;
- contexto suficiente para responder.

#### Opção B — Somente quando eu estiver fora do WhatsApp

A IA só responde se o sistema entender que o usuário/profissional está ausente.

Quando essa opção for selecionada, exibir configurações adicionais:

- tempo de inatividade;
- escopo da ausência.

---

### 3. Tempo de inatividade

Exibir somente quando o modo for **“Somente quando eu estiver fora do WhatsApp”**.

Campo:

- tipo numérico;
- unidade: minutos;
- mínimo: **1 minuto**;
- valor configurável pelo usuário.

Label sugerido:

> Responder após quantos minutos sem atividade?

Texto de apoio:

> A IA só entra em ação depois desse período sem atividade manual no WhatsApp.

Validações:

- obrigatório quando o modo for “fora do WhatsApp”;
- aceitar apenas inteiro positivo;
- mínimo de 1;
- não aceitar zero;
- não aceitar número negativo;
- não criar limite máximo sem decisão de produto.

---

### 4. Escopo da ausência

Exibir somente quando o modo for **“Somente quando eu estiver fora do WhatsApp”**.

Opções:

#### Ausência global

Label sugerido:

> Considerar minha atividade em qualquer conversa

Descrição:

> A IA só responde se você não demonstrar atividade manual em nenhuma conversa do WhatsApp durante o tempo configurado.

Comportamento:

- se o usuário/profissional enviar qualquer mensagem manual pelo WhatsApp, atualizar a última atividade global da instância;
- enquanto o intervalo configurado não passar, a IA não deve responder em nenhuma conversa.

Esse modo é mais seguro para evitar que a IA responda enquanto o usuário está atendendo manualmente.

#### Ausência por conversa

Label sugerido:

> Considerar minha atividade apenas na conversa específica

Descrição:

> A IA só responde em uma conversa se você não tiver interagido manualmente com aquela cliente durante o tempo configurado.

Comportamento:

- se o usuário/profissional responder manualmente uma conversa específica, atualizar a última atividade manual daquela conversa;
- a IA pode continuar respondendo outras conversas onde não houve atividade manual recente;
- esse modo é mais flexível, mas exige mais cuidado.

---

## Modelo conceitual da aba Geral

Campos sugeridos no banco:

```prisma
aiEnabled              Boolean
activationMode         String   // ALWAYS | AWAY_FROM_WHATSAPP
awayTimeoutMinutes     Int?
awayScope              String?  // GLOBAL | CONVERSATION
```

Valores sugeridos:

```ts
type ActivationMode = "ALWAYS" | "AWAY_FROM_WHATSAPP";
type AwayScope = "GLOBAL" | "CONVERSATION";
```

Regras:

- `awayTimeoutMinutes` só é obrigatório se `activationMode = AWAY_FROM_WHATSAPP`.
- `awayScope` só é obrigatório se `activationMode = AWAY_FROM_WHATSAPP`.
- `awayTimeoutMinutes >= 1`.

---

# Aba 2 — Personas

A aba **Personas** deve permitir configurar o nome e o estilo da IA.

## 1. Nome da IA

Campo obrigatório.

Label:

> Nome da atendente virtual

Placeholder:

> Ex: Sofia, Bella, Clara, Lili

Texto de apoio:

> Esse é o nome que a IA usará quando precisar se apresentar às clientes.

Regras:

- obrigatório;
- não aceitar apenas espaços;
- salvar por usuário;
- usar no prompt final;
- a IA não deve repetir o próprio nome em todas as mensagens, apenas quando fizer sentido.

---

## 2. Personas disponíveis

Criar três personas.

### Persona 1 — Corporativa

Tom:

- profissional;
- claro;
- objetivo;
- educado;
- seguro;
- sem excesso de emojis;
- sem gírias;
- foco em informação e agendamento.

Descrição para UI:

> Responde de forma profissional, clara e objetiva. Ideal para negócios que preferem um atendimento mais formal e direto.

Preview:

> Olá, tudo bem? Posso te ajudar com informações sobre serviços, horários e agendamentos.

---

### Persona 2 — Leve e Próxima

Substituir o nome “Divertida” por **Leve e Próxima**.

Motivo:

- “Divertida” pode soar informal demais;
- “Leve e Próxima” comunica simpatia, acolhimento e naturalidade sem perder profissionalismo.

Tom:

- simpático;
- acolhedor;
- natural;
- conversacional;
- pode usar emojis com moderação;
- parece uma conversa com alguém próximo, mas ainda profissional;
- conduz ao agendamento aos poucos, sem parecer forçada.

Descrição para UI:

> Responde de forma simpática, natural e acolhedora. Ideal para criar proximidade com a cliente sem perder o profissionalismo.

Preview:

> Oii, tudo bem? Me conta o que você quer fazer que eu te ajudo a encontrar o melhor horário 😊

---

### Persona 3 — Personalizada

Tom:

- começa com um padrão inicial parecido com “Leve e Próxima”;
- depois é ajustada com base nas conversas importadas pelo usuário;
- aprende o estilo real de atendimento do negócio;
- não copia mensagens sensíveis;
- extrai apenas padrões de comunicação.

Descrição para UI:

> A IA aprende o estilo de atendimento do seu negócio a partir de conversas reais importadas do WhatsApp.

Preview:

> A IA adapta o tom, as frases e a forma de atendimento com base no seu histórico de conversas.

---

## Persona personalizada — importação de conversas

### Requisito

Para habilitar a persona personalizada, o usuário deve importar pelo menos **3 arquivos `.txt` de conversas do WhatsApp**.

### Restrições

- Aceitar somente `.txt`.
- Não aceitar `.zip`.
- Não aceitar mídia.
- Não armazenar os arquivos originais de forma permanente.
- Processar o conteúdo e descartar os dados brutos após gerar o perfil.

### UX esperada

Mostrar área de upload com contador:

- “0 de 3 conversas importadas”
- “1 de 3 conversas importadas”
- “2 de 3 conversas importadas”
- “3 de 3 conversas importadas”

Estados:

- aguardando arquivos;
- processando;
- persona gerada;
- erro ao ler arquivo;
- arquivo inválido;
- menos de 3 arquivos válidos.

### Fluxo técnico

1. Usuário seleciona persona **Personalizada**.
2. Sistema mostra upload obrigatório.
3. Usuário envia pelo menos 3 arquivos `.txt`.
4. Backend valida:
   - extensão `.txt`;
   - tamanho permitido conforme configuração técnica;
   - conteúdo textual legível;
   - quantidade mínima de conversas válidas.
5. Backend extrai as mensagens.
6. Backend identifica participantes.
7. Se não conseguir identificar qual participante representa o usuário/profissional, a UI deve pedir confirmação.
8. Backend analisa o estilo de atendimento.
9. Backend gera um perfil estruturado.
10. Backend salva apenas:
    - status da análise;
    - metadados mínimos;
    - perfil personalizado gerado.
11. Backend descarta o conteúdo bruto dos arquivos.
12. Persona personalizada fica disponível quando o status for `READY`.

---

## Perfil personalizado estruturado

Salvar a análise da persona personalizada em formato estruturado, não apenas como texto solto.

Exemplo conceitual:

```ts
type CustomPersonaProfile = {
  greetingStyle: string;
  formalityLevel: "formal" | "balanced" | "informal";
  emojiUsage: "none" | "low" | "moderate" | "high";
  commonExpressions: string[];
  schedulingStyle: string;
  objectionHandlingStyle: string;
  closingStyle: string;
  persuasionStyle: string;
  messageLengthPreference: "short" | "medium" | "long";
  doList: string[];
  avoidList: string[];
  generatedPersonaInstructions: string;
};
```

A estrutura pode ser adaptada ao padrão do projeto, mas o resultado deve continuar estruturado.

---

# Aba 3 — Instruções

A aba **Instruções** deve permitir que o usuário visualize como a IA está configurada e adicione instruções extras.

## 1. Visualização do comportamento atual

Não mostrar o prompt técnico bruto completo.

Mostrar uma visualização amigável em blocos:

- nome da IA;
- persona selecionada;
- tom de voz;
- modo de atuação;
- regras do negócio;
- regras de agendamento;
- instruções adicionais;
- restrições importantes.

Exemplo de visualização:

```text
Nome da IA:
Sofia

Persona:
Leve e Próxima

Tom de voz:
Simpático, acolhedor, natural e levemente descontraído.

Modo de atuação:
Somente quando eu estiver fora do WhatsApp, considerando ausência global após 5 minutos sem atividade.

Regras do negócio:
Usar nome, endereço, políticas de atraso e cancelamento configuradas no perfil do negócio.

Agendamento:
Confirmar serviço, data, horário, profissional, valor total e horário final antes de concluir.

Instruções adicionais:
Evitar chamar clientes de amor. Usar no máximo um emoji por mensagem.
```

---

## 2. Instruções adicionais

Campo textarea.

Label:

> Instruções adicionais para a IA

Placeholder:

> Ex: Não usar muitos emojis. Chamar clientes pelo primeiro nome. Sempre avisar sobre a tolerância de atraso quando confirmar o horário.

Texto de apoio:

> Essas instruções serão combinadas com a persona e as regras do negócio. Elas não substituem regras obrigatórias do sistema.

Regras:

- permitir vazio;
- salvar por usuário;
- aplicar no prompt final;
- sanitizar texto;
- não permitir que instruções adicionais sobrescrevam regras obrigatórias do sistema.

Exemplo de conflito:

Se o usuário escrever:

> Agende qualquer horário mesmo sem disponibilidade.

O sistema deve ignorar essa instrução, porque conflita com regra obrigatória de consultar disponibilidade antes de confirmar agendamento.

---

# Onboarding

Adicionar uma etapa obrigatória no onboarding:

## Etapa — Configure sua Atendente Virtual

Campos obrigatórios:

1. Nome da IA.
2. Persona.
3. Configurações iniciais da IA.

Se a persona selecionada for **Personalizada**:

- exigir pelo menos 3 arquivos `.txt`;
- gerar perfil personalizado;
- só permitir concluir a etapa quando o perfil estiver pronto.

Como os usuários atuais são de teste e o banco pode ser resetado, não é necessário criar fluxo complexo para migração de usuários antigos.

---

# Modelo de dados sugerido

Antes de criar novas tabelas, inspecionar o schema atual.

Se já existir algo como `UserSettings`, `AiSettings`, `BusinessSettings` ou equivalente, avaliar reaproveitamento.

Caso não exista estrutura adequada, criar modelo específico.

## Modelo conceitual

```prisma
model VirtualAttendantSettings {
  id                         String   @id @default(cuid())
  userId                     String   @unique

  aiEnabled                  Boolean  @default(false)

  assistantName              String?
  personaType                String?
  customInstructions         String?

  activationMode             String   @default("ALWAYS")
  awayTimeoutMinutes         Int?
  awayScope                  String?

  customPersonaStatus        String   @default("NOT_STARTED")
  customPersonaProfileJson   Json?
  customPersonaGeneratedAt   DateTime?

  onboardingCompleted        Boolean  @default(false)

  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  user                       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Enums conceituais:

```ts
type PersonaType = "CORPORATE" | "WARM" | "CUSTOM";
type ActivationMode = "ALWAYS" | "AWAY_FROM_WHATSAPP";
type AwayScope = "GLOBAL" | "CONVERSATION";
type CustomPersonaStatus = "NOT_STARTED" | "WAITING_UPLOADS" | "PROCESSING" | "READY" | "FAILED";
```

Labels da UI:

```ts
CORPORATE = "Corporativa"
WARM = "Leve e Próxima"
CUSTOM = "Personalizada"
```

---

## Metadados de importação

Se for necessário registrar os imports, salvar apenas metadados mínimos.

```prisma
model PersonaConversationImport {
  id              String   @id @default(cuid())
  userId          String
  fileName        String
  fileSize        Int?
  status          String
  extractedCount  Int?
  errorMessage    String?
  createdAt       DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Não adicionar campo para armazenar o conteúdo bruto da conversa, salvo se for temporário e removido imediatamente após o processamento.

---

# APIs internas sugeridas

Adaptar aos padrões existentes do projeto.

## Configurações do Atendente Virtual

```http
GET /api/virtual-attendant/settings
PATCH /api/virtual-attendant/settings
```

Responsabilidades:

- buscar configurações do usuário logado;
- atualizar:
  - `aiEnabled`;
  - `assistantName`;
  - `personaType`;
  - `customInstructions`;
  - `activationMode`;
  - `awayTimeoutMinutes`;
  - `awayScope`.

Validações:

- usuário autenticado;
- isolamento por `userId`;
- `awayTimeoutMinutes >= 1` quando obrigatório;
- `awayScope` obrigatório quando `activationMode = AWAY_FROM_WHATSAPP`;
- persona personalizada só pode ser ativada se `customPersonaStatus = READY`.

---

## Upload e geração da persona personalizada

```http
POST /api/virtual-attendant/persona/import
GET /api/virtual-attendant/persona/imports
POST /api/virtual-attendant/persona/generate
```

Responsabilidades:

- receber arquivos `.txt`;
- validar quantidade mínima de 3 arquivos válidos;
- processar texto;
- descartar conteúdo bruto;
- gerar perfil estruturado;
- salvar status e resultado;
- retornar erros amigáveis.

---

## Preview visual do prompt

```http
GET /api/virtual-attendant/prompt-preview
```

Responsabilidade:

- retornar uma versão visual e segura da configuração atual da IA;
- não expor prompt técnico bruto sensível;
- não expor ferramentas internas, tokens, segredos ou instruções privadas.

---

# Motor de resposta da IA

Antes de gerar qualquer resposta, o sistema deve verificar as configurações atualizadas do usuário.

## Validações obrigatórias antes da IA responder

1. Usuário existe.
2. Instância pertence ao usuário.
3. IA está ativa.
4. Atendente Virtual está configurado.
5. Nome da IA está preenchido.
6. Persona está selecionada.
7. Se persona for personalizada, status está `READY`.
8. Contato não está na lista de ignorados.
9. Chat não está pausado.
10. Debounce terminou.
11. Modo de ativação permite resposta.
12. Existe contexto suficiente para responder.

---

## Regra para modo “A qualquer momento”

Se `activationMode = ALWAYS`, a IA pode responder após passar pelas validações normais.

---

## Regra para modo “Somente quando eu estiver fora do WhatsApp”

Se `activationMode = AWAY_FROM_WHATSAPP`, verificar:

- `awayTimeoutMinutes` preenchido e maior ou igual a 1;
- `awayScope` preenchido;
- se a ausência já ultrapassou o tempo configurado.

### Escopo global

Se `awayScope = GLOBAL`:

- usar a última atividade manual global do dono da instância;
- se o dono enviou qualquer mensagem manual recentemente, a IA não responde em nenhuma conversa;
- a IA só responde depois de passar `awayTimeoutMinutes` desde a última atividade manual global.

### Escopo por conversa

Se `awayScope = CONVERSATION`:

- usar a última atividade manual do dono naquela conversa específica;
- se o dono respondeu manualmente aquela conversa recentemente, a IA não responde naquela conversa;
- a IA pode responder outras conversas onde não houve atividade manual recente.

---

## Como detectar atividade manual

O Codex deve verificar como o projeto recebe e salva mensagens vindas do Evolution Go.

Procurar campos como:

- `fromMe`;
- `IsFromMe`;
- `data.Info.IsFromMe`;
- equivalente no payload atual.

Quando chegar mensagem com `fromMe = true` ou equivalente:

- atualizar a última atividade global da instância;
- atualizar a última atividade manual da conversa correspondente.

Campos conceituais possíveis:

```prisma
WhatsAppInstance.lastOwnerActivityAt DateTime?
Conversation.lastOwnerActivityAt     DateTime?
```

Se já existir estrutura equivalente, reutilizar.

---

## Pseudofluxo

```ts
async function shouldVirtualAttendantRespond(context) {
  const settings = await getVirtualAttendantSettings(context.userId);

  if (!settings.aiEnabled) return false;
  if (!settings.assistantName) return false;
  if (!settings.personaType) return false;

  if (settings.personaType === "CUSTOM" && settings.customPersonaStatus !== "READY") {
    return false;
  }

  if (await isIgnoredContact(context.userId, context.contactJid)) return false;
  if (await isConversationPaused(context.conversationId)) return false;

  if (settings.activationMode === "AWAY_FROM_WHATSAPP") {
    if (!settings.awayTimeoutMinutes || settings.awayTimeoutMinutes < 1) return false;
    if (!settings.awayScope) return false;

    const isAway = await checkOwnerAwayState({
      userId: context.userId,
      instanceId: context.instanceId,
      conversationId: context.conversationId,
      awayTimeoutMinutes: settings.awayTimeoutMinutes,
      awayScope: settings.awayScope,
    });

    if (!isAway) return false;
  }

  return true;
}
```

---

# Composição do prompt final

Criar ou refatorar um módulo central para montar o prompt da IA.

Nome sugerido:

```ts
buildVirtualAttendantPrompt(...)
```

Adaptar ao padrão existente do projeto.

## Ordem de composição

1. Regras obrigatórias do sistema.
2. Regras de segurança.
3. Configurações do negócio.
4. Regras de agendamento.
5. Nome da IA.
6. Persona selecionada.
7. Perfil personalizado gerado, se aplicável.
8. Instruções adicionais do usuário.
9. Histórico recente da conversa.
10. Pendências identificadas na conversa.

As instruções adicionais do usuário podem complementar o comportamento, mas não podem sobrescrever regras obrigatórias.

---

# Regras de naturalidade da IA

Adicionar ao prompt regras para evitar respostas robóticas.

A IA deve:

- variar saudações;
- evitar repetir sempre a mesma abertura;
- usar o nome da cliente quando disponível;
- não oferecer agendamento imediatamente se a cliente apenas cumprimentou;
- conversar brevemente para entender a intenção;
- conduzir ao agendamento de forma gradual;
- fazer uma pergunta por vez quando a cliente estiver indecisa;
- ser objetiva quando a cliente já sabe o que quer;
- ser acolhedora quando a cliente parecer insegura;
- usar emojis conforme a persona;
- não exagerar em exclamações;
- não prometer algo que depende da profissional;
- confirmar informações antes de criar agendamento.

---

# Importação de TXT do WhatsApp — diretrizes técnicas

A importação deve considerar que arquivos `.txt` exportados do WhatsApp podem variar conforme idioma, plataforma e formato de data.

Implementar parser defensivo.

## O sistema deve tentar extrair

- data e hora da mensagem;
- autor/remetente;
- conteúdo textual;
- sequência de mensagens;
- padrões de resposta do usuário/profissional.

## O sistema deve ignorar

- linhas de sistema do WhatsApp;
- mensagens de mídia omitida;
- mensagens vazias;
- anexos;
- qualquer marcador de mídia.

## Quando não identificar o usuário/profissional

Se o parser encontrar mais de um participante e não conseguir determinar quem representa o dono do negócio:

- retornar para UI uma etapa de confirmação;
- mostrar os nomes/identificadores encontrados;
- pedir para o usuário selecionar qual participante é ele/ela;
- só então gerar o perfil personalizado.

---

# Privacidade

Regras obrigatórias:

- não armazenar arquivos originais permanentemente;
- não salvar conteúdo bruto completo das conversas no banco;
- processar e descartar;
- salvar apenas perfil estruturado e metadados mínimos;
- garantir isolamento por usuário;
- não usar conversas de um usuário para persona de outro;
- não expor conteúdo importado na UI após processamento, salvo resumos seguros necessários para validação.

---

# Reset do banco

Como os usuários atuais são apenas de teste, é permitido resetar o banco.

O Codex pode:

- ajustar schema Prisma;
- gerar novas migrations;
- limpar dados antigos se necessário;
- documentar no README ou em comentário de implementação que houve reset por decisão de produto.

Mesmo podendo resetar, ainda deve evitar apagar configurações de ambiente, secrets ou estrutura não relacionada.

---

# UI mobile-first

## Geral

No mobile:

- cards empilhados;
- botões grandes;
- textos curtos;
- feedback visual claro;
- evitar tabelas complexas;
- campos com largura total;
- abas fáceis de tocar.

## Aba Geral

Componentes sugeridos:

- `AiStatusCard`
- `AiEnabledSwitch`
- `ActivationModeSelector`
- `AwayTimeoutMinutesField`
- `AwayScopeSelector`

## Aba Personas

Componentes sugeridos:

- `AssistantNameField`
- `PersonaCard`
- `PersonaSelector`
- `CustomPersonaUploadPanel`
- `CustomPersonaStatusCard`
- `ParticipantSelector`, se necessário

## Aba Instruções

Componentes sugeridos:

- `PromptVisualPreview`
- `CustomInstructionsTextarea`
- `PromptSafetyNotice`
- `SaveInstructionsButton`

---

# Estados obrigatórios

Implementar estados para:

- carregando configurações;
- salvando configurações;
- salvo com sucesso;
- erro ao salvar;
- IA ativa;
- IA pausada;
- modo fora do WhatsApp incompleto;
- persona personalizada aguardando TXT;
- persona personalizada com menos de 3 arquivos;
- processando persona;
- persona pronta;
- falha ao processar TXT;
- participante não identificado;
- onboarding incompleto.

---

# Critérios de aceite

## Aba Geral

1. A tela Atendente Virtual possui a aba **Geral**.
2. A aba Geral permite ativar/desativar a IA.
3. A aba Geral permite escolher entre:
   - A qualquer momento;
   - Somente quando eu estiver fora do WhatsApp.
4. Quando o modo “fora do WhatsApp” é escolhido, o usuário precisa definir tempo de inatividade.
5. O tempo mínimo aceito é 1 minuto.
6. Quando o modo “fora do WhatsApp” é escolhido, o usuário precisa escolher escopo:
   - ausência global;
   - ausência por conversa.
7. No escopo global, qualquer atividade manual recente impede a IA de responder em todas as conversas.
8. No escopo por conversa, atividade manual recente impede a IA apenas naquela conversa.

## Aba Personas

9. A aba **Personas** permite definir nome da IA.
10. O nome da IA é obrigatório.
11. A aba Personas permite escolher entre:
    - Corporativa;
    - Leve e Próxima;
    - Personalizada.
12. A persona selecionada altera o tom das respostas.
13. A IA usa o nome configurado ao se identificar.
14. A persona personalizada aceita somente arquivos `.txt`.
15. A persona personalizada exige pelo menos 3 arquivos válidos.
16. A persona personalizada não armazena os arquivos originais permanentemente.
17. O perfil personalizado é salvo em formato estruturado.
18. A persona personalizada só pode ser usada quando o status estiver pronto.

## Aba Instruções

19. A aba **Instruções** mostra uma visualização amigável da configuração atual da IA.
20. O prompt técnico bruto não é exposto integralmente.
21. O usuário consegue salvar instruções adicionais.
22. As instruções adicionais são aplicadas ao prompt final.
23. As instruções adicionais não sobrescrevem regras obrigatórias do sistema.

## Onboarding

24. O onboarding possui etapa obrigatória para configurar Atendente Virtual.
25. O usuário precisa definir nome da IA.
26. O usuário precisa escolher uma persona.
27. Se escolher Personalizada, precisa importar pelo menos 3 arquivos `.txt` e gerar o perfil.

## Motor da IA

28. Antes de responder, o sistema verifica se a IA está ativa.
29. Antes de responder, o sistema verifica persona e nome da IA.
30. Antes de responder, o sistema verifica lista de ignorados.
31. Antes de responder, o sistema verifica modo de ativação.
32. Antes de responder, o sistema respeita ausência global ou por conversa.
33. Antes de responder, o sistema respeita debounce.

## Técnica

34. As configurações são persistidas por usuário.
35. Nenhum segredo é exposto no client.
36. O banco pode ser resetado conforme decisão de produto.
37. O layout funciona bem em mobile.
38. O build passa.
39. O lint passa se o projeto já usa lint.

---

# Checklist para o Codex

## 1. Inspeção

- Localizar tela atual de Atendente Virtual.
- Localizar onde `aiEnabled` é salvo.
- Localizar onboarding atual.
- Localizar motor de resposta da IA.
- Localizar builder de prompt atual.
- Localizar webhook do Evolution Go.
- Localizar processamento de mensagens `fromMe`.
- Localizar schema Prisma atual.
- Localizar padrões de UI e validação.

## 2. Banco

- Criar ou ajustar modelo de configurações do Atendente Virtual.
- Adicionar campos para:
  - nome da IA;
  - persona;
  - instruções adicionais;
  - modo de ativação;
  - tempo de inatividade;
  - escopo da ausência;
  - status da persona personalizada;
  - perfil personalizado.
- Adicionar campos para última atividade manual global e por conversa, se ainda não existirem.
- Resetar banco se necessário, pois usuários atuais são de teste.

## 3. APIs

- Criar/ajustar API de configurações.
- Criar/ajustar API de preview do prompt.
- Criar API para upload de arquivos `.txt`.
- Criar fluxo para geração de persona personalizada.
- Garantir autenticação e isolamento por usuário.

## 4. UI

- Refatorar tela para abas.
- Implementar aba Geral.
- Implementar aba Personas.
- Implementar aba Instruções.
- Implementar etapa no onboarding.
- Implementar estados de loading, erro e sucesso.
- Garantir mobile-first.

## 5. Motor da IA

- Atualizar decisão de resposta para considerar configurações do Atendente Virtual.
- Aplicar escopo global/conversa.
- Atualizar última atividade manual quando mensagens `fromMe` forem recebidas.
- Refatorar prompt builder.
- Aplicar persona e instruções adicionais.

## 6. Persona personalizada

- Aceitar somente `.txt`.
- Exigir mínimo de 3 arquivos válidos.
- Extrair mensagens.
- Identificar participante do usuário/profissional.
- Gerar perfil estruturado.
- Descartar conteúdo bruto.
- Salvar apenas resultado final e metadados mínimos.

## 7. QA manual

Validar:

- cadastro/onboarding novo;
- configuração de nome da IA;
- seleção de cada persona;
- upload com menos de 3 arquivos;
- upload com 3 arquivos `.txt` válidos;
- tentativa de upload `.zip`;
- tentativa de upload de mídia;
- modo “a qualquer momento”;
- modo “fora do WhatsApp” com escopo global;
- modo “fora do WhatsApp” com escopo por conversa;
- tempo de inatividade menor que 1;
- ativar/desativar IA;
- prompt preview;
- instruções adicionais;
- resposta real da IA respeitando persona.

---

# Sugestões adicionais

## 1. Criar simulador de resposta

Futuramente, adicionar na aba **Instruções** um campo para testar como a IA responderia antes de ativar em produção.

Exemplo:

> Cliente: “Oi, queria fazer cílios e sobrancelha”

O sistema mostraria uma resposta simulada usando a persona atual, sem enviar para o WhatsApp.

## 2. Mostrar aviso de segurança no upload

Na persona personalizada, mostrar texto claro:

> Os arquivos são usados apenas para gerar o estilo da sua atendente virtual. O conteúdo original não será armazenado após o processamento.

Isso aumenta confiança do usuário.

## 3. Criar indicador de “IA pronta”

No topo da tela, mostrar um card:

- IA pausada — configuração incompleta;
- IA pausada — pronta para ativar;
- IA ativa — respondendo a qualquer momento;
- IA ativa — respondendo quando você estiver fora;
- IA ativa — respondendo por conversa quando você estiver ausente.

## 4. Criar opção futura de intensidade de persuasão

Não implementar agora, mas futuramente pode ser útil:

- Baixa;
- Média;
- Alta.

Isso controlaria o quanto a IA conduz a cliente para fechar o agendamento.

## 5. Criar histórico de mudanças

Futuramente, salvar alterações importantes:

- quem ativou/desativou IA;
- mudança de persona;
- mudança de instruções;
- mudança de modo de atuação.

Isso ajuda em auditoria e suporte.
