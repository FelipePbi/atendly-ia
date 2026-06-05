# SDD — Lista de Ignorados da IA V1

**Produto:** Plataforma de atendimento e automação via WhatsApp com IA  
**Feature:** Lista de ignorados / contatos sem resposta automática  
**Versão:** V1  
**Data:** 2026-06-04  
**Objetivo principal:** impedir que a IA responda contatos pessoais, familiares, amigos, fornecedores ou qualquer conversa onde o usuário queira manter controle manual.

---

## 1. Resumo executivo

A plataforma deve ganhar uma funcionalidade chamada **Lista de ignorados**. Contatos incluídos nessa lista continuarão aparecendo no chat da plataforma, mas **não serão respondidos pela IA**, mesmo que a automação global esteja ativa.

A feature deve permitir três formas principais de cadastro:

1. **Cadastro manual pela plataforma**, informando nome/opcional, telefone/JID e motivo/opcional.
2. **Importação/seleção a partir dos contatos salvos no WhatsApp**, buscando contatos via Evolution Go.
3. **Comando enviado pelo próprio WhatsApp conectado**, usando `/ia_pause` dentro da conversa que deve ser ignorada.

A feature deve ter um **menu exclusivo** na plataforma, preferencialmente dentro de **Automação**, mas como uma tela própria:

```text
Automação
├── IA
├── Configurações do negócio
└── Lista de ignorados
```

Essa lista deve ser vinculada ao **usuário logado** e à **instância WhatsApp** do usuário. Como cada usuário possui apenas uma instância/número, a regra fica simples agora, mas o modelo deve ser preparado para suportar múltiplas instâncias no futuro.

---

## 2. Validação técnica — contatos via Evolution Go

A documentação do Evolution Go indica que é possível listar contatos do usuário conectado pelo endpoint:

```http
GET /user/contacts
```

A resposta documentada contém uma lista de contatos com campos como:

```json
{
  "data": [
    {
      "Jid": "5511999999999@s.whatsapp.net",
      "Found": true,
      "FirstName": "",
      "FullName": "",
      "PushName": "Contact Name",
      "BusinessName": ""
    }
  ],
  "message": "success"
}
```

Portanto, para a V1 é viável implementar uma tela que busca os contatos salvos pelo Evolution Go e permite ao usuário selecionar quais devem ser ignorados pela IA.

### Observação importante

O Evolution Go também documenta endpoints de bloqueio, desbloqueio e blocklist:

```http
POST /user/block
GET /user/blocklist
POST /user/unblock
```

**Não usar esses endpoints para esta feature na V1.** A regra de negócio aqui é somente “não deixar a IA responder”. Bloquear o contato no WhatsApp é uma ação muito mais agressiva e pode impedir mensagens reais de chegarem ao usuário. A lista de ignorados deve ser uma regra interna da plataforma.

---

## 3. Problema que a feature resolve

Hoje, quando a IA está ativa, existe risco de ela responder conversas que não são comerciais, por exemplo:

- mãe, pai, marido, esposa, namorado(a), filhos;
- amigos;
- fornecedores;
- entregadores;
- conversas internas;
- contatos pessoais do número usado no WhatsApp;
- contatos que o usuário prefere atender manualmente.

Isso é especialmente crítico porque muitos negócios pequenos usam o mesmo WhatsApp para vida pessoal e profissional.

A Lista de ignorados reduz esse risco e aumenta a confiança do usuário para deixar a IA ligada.

---

## 4. Decisão de produto

A feature deve se chamar no produto:

**Lista de ignorados**

Texto de apoio sugerido:

> Contatos nesta lista continuarão aparecendo no chat, mas a IA não responderá automaticamente. Use para familiares, amigos, fornecedores ou conversas que você prefere atender manualmente.

Alternativas de nome para validar futuramente:

- Contatos sem IA
- Pausar IA por contato
- Lista protegida
- Contatos manuais
- Exceções da IA

Minha recomendação: manter **Lista de ignorados** na V1 porque é direto e fácil de entender.

---

## 5. Escopo da V1

### Dentro do escopo

- Criar menu exclusivo para Lista de ignorados.
- Listar contatos ignorados.
- Adicionar contato manualmente.
- Buscar contatos salvos no WhatsApp via Evolution Go.
- Selecionar múltiplos contatos importados e adicioná-los à lista.
- Remover contato da lista.
- Reativar IA para um contato removendo-o da lista.
- Pausar IA pelo chat da plataforma.
- Pausar IA pelo WhatsApp usando `/ia_pause`.
- Mostrar no chat um aviso visual quando a IA estiver pausada para aquele contato.
- Garantir que a IA consulte a lista antes de gerar qualquer resposta.
- Cancelar jobs pendentes/debounce quando um contato entrar na lista.

### Fora do escopo da V1

- Bloquear contato no WhatsApp real.
- Sincronização automática em tempo real de todos os contatos sem ação do usuário.
- Regras complexas de auto-classificação de parentes/amigos.
- Allowlist obrigatória.
- Configuração por horário ou pausa temporária.
- Permissões por equipe/usuário operador.
- Histórico avançado de auditoria com tela própria.

---

## 6. Regras de negócio

### 6.1 Regra central

Antes de qualquer resposta da IA, o backend deve verificar:

```text
O contato/conversa está na lista de ignorados ativa?
```

Se sim:

- não enviar mensagem para o LLM;
- não chamar API de envio de mensagem;
- não agendar resposta;
- não continuar fluxo de agendamento;
- registrar internamente que a IA foi suprimida por contato ignorado.

### 6.2 A lista é por usuário e instância

Mesmo que hoje cada usuário tenha apenas uma instância, o modelo deve considerar:

```text
userId + instanceId + jid
```

Isso evita retrabalho caso futuramente um usuário possa ter mais de um número.

### 6.3 Um contato ignorado continua aparecendo no chat

A lista não deve esconder mensagens. Ela só impede ação automática da IA.

### 6.4 Comando `/ia_pause`

Quando o sistema receber uma mensagem com o texto exato:

```text
/ia_pause
```

Deve colocar o contato/conversa na lista de ignorados **somente se a mensagem foi enviada pelo próprio número conectado**, ou seja, quando o webhook indicar que a mensagem é `fromMe`/`IsFromMe = true`.

Isso é essencial para evitar que uma cliente envie `/ia_pause` e consiga desligar a IA por conta própria.

### 6.5 Mensagem `/ia_pause` enviada por cliente

Se uma cliente ou terceiro enviar `/ia_pause`, o sistema deve tratar como uma mensagem comum ou simplesmente ignorar como comando. Não deve pausar IA automaticamente.

Sugestão de comportamento seguro:

```text
Se IsFromMe = false e texto = /ia_pause:
  - salvar a mensagem no histórico;
  - não executar comando;
  - continuar a lógica normal da conversa, se apropriado.
```

### 6.6 Cancelamento de resposta pendente

Se houver debounce/job aguardando para responder aquele contato e o usuário enviar `/ia_pause`, o sistema deve:

- adicionar o contato à lista;
- cancelar resposta pendente;
- marcar a conversa como `aiPaused` ou equivalente;
- não enviar nenhuma mensagem automática depois disso.

### 6.7 Grupos

Para V1, a IA não deve responder grupos por padrão.

Regra sugerida:

```text
Se Info.IsGroup = true:
  - não responder com IA;
  - opcionalmente marcar como ignorado automático com source = AUTO_SAFETY;
  - mostrar no chat: “IA desativada para grupos”.
```

Isso reduz muito o risco da IA responder conversas familiares ou grupos de fornecedores.

---

## 7. Fluxos funcionais

## 7.1 Fluxo A — adicionar manualmente pela plataforma

1. Usuário acessa **Automação > Lista de ignorados**.
2. Clica em **Adicionar contato**.
3. Informa:
   - nome/apelido, opcional;
   - telefone, obrigatório;
   - motivo, opcional.
4. Sistema normaliza o telefone para JID.
5. Sistema salva `IgnoredContact`.
6. Se já existir conversa com esse JID, exibe banner na conversa:
   - “IA pausada para este contato”.
7. A IA para imediatamente de responder esse contato.

Validações:

- Telefone deve ter DDI.
- Aceitar formatos digitados como:
  - `5599999999999`
  - `+55 99 99999-9999`
  - `55 (99) 99999-9999`
- Normalizar para:
  - `5599999999999@s.whatsapp.net`

---

## 7.2 Fluxo B — importar contatos salvos do WhatsApp

1. Usuário acessa **Automação > Lista de ignorados**.
2. Entra na aba **Contatos do WhatsApp**.
3. Clica em **Sincronizar contatos**.
4. Backend chama Evolution Go:

```http
GET /user/contacts
```

5. Plataforma exibe lista pesquisável com:
   - nome do contato;
   - telefone/JID;
   - nome comercial, se houver;
   - indicador “já ignorado”, se já estiver na lista.
6. Usuário seleciona um ou vários contatos.
7. Clica em **Ignorar selecionados**.
8. Sistema faz upsert dos contatos em `IgnoredContact`.
9. Tela mostra sucesso.

UX sugerida:

- Campo de busca fixo no topo.
- Filtro “todos”, “já ignorados”, “não ignorados”.
- Seleção múltipla com checkboxes grandes, fáceis no mobile.
- Botão sticky no rodapé no mobile: “Ignorar X contatos”.

---

## 7.3 Fluxo C — pausar IA pelo chat da plataforma

1. Usuário abre uma conversa.
2. Clica no menu do chat.
3. Seleciona **Pausar IA para este contato**.
4. Sistema adiciona o JID à lista de ignorados.
5. Chat exibe banner:

```text
IA pausada para este contato. Você pode reativar quando quiser.
```

6. Menu passa a mostrar **Reativar IA para este contato**.

Este fluxo deve ser o mais recomendado, porque não envia nenhum comando visível ao cliente.

---

## 7.4 Fluxo D — pausar IA pelo WhatsApp com `/ia_pause`

1. Usuário abre o WhatsApp conectado no celular.
2. Dentro da conversa desejada, envia:

```text
/ia_pause
```

3. Webhook recebe a mensagem.
4. Sistema valida:
   - mensagem é da instância do usuário;
   - mensagem pertence a uma conversa individual;
   - `IsFromMe = true`;
   - texto normalizado é exatamente `/ia_pause`.
5. Sistema adiciona o contato à lista de ignorados.
6. Sistema cancela qualquer resposta pendente da IA.
7. Plataforma mostra a conversa como pausada.

Observação de UX:

Como a mensagem `/ia_pause` pode ficar visível para a outra pessoa no WhatsApp, esta não deve ser a principal forma recomendada. Ela deve ser tratada como atalho emergencial. A forma principal deve ser o botão dentro da plataforma.

Melhoria opcional:

- Após processar `/ia_pause`, tentar apagar a mensagem para todos usando o endpoint de deletar mensagem do Evolution Go, se a instância permitir e se estiver dentro da janela aceita pelo WhatsApp.
- Caso falhe, apenas registrar log interno.

---

## 7.5 Fluxo E — reativar IA para contato

A V1 deve permitir reativação pela plataforma.

1. Usuário acessa Lista de ignorados ou abre o chat.
2. Clica em **Reativar IA**.
3. Sistema marca o registro como inativo ou remove logicamente.
4. Próximas mensagens desse contato voltam a passar pelo motor da IA, desde que a IA global esteja ativa.

Sugestão para V1.1:

Adicionar comando:

```text
/ia_resume
```

Com a mesma regra de segurança: somente quando `IsFromMe = true`.

---

## 8. Arquitetura proposta

## 8.1 Camadas

```text
Webhook Evolution Go
        ↓
Message Ingestion Service
        ↓
Command Detector
        ↓
Ignored Contact Guard
        ↓
Conversation Persistence
        ↓
AI Debounce / Queue
        ↓
AI Orchestrator
        ↓
Send Message Service
```

A Lista de ignorados deve ser verificada em dois pontos:

1. **Logo após receber a mensagem**, para evitar enfileirar resposta.
2. **Logo antes de enviar a resposta**, para evitar race condition caso o usuário pause a IA enquanto o debounce ainda está aguardando.

---

## 8.2 Ordem recomendada no webhook

```text
1. Receber webhook.
2. Identificar instância.
3. Persistir mensagem bruta e mensagem normalizada.
4. Normalizar chatJid/contactJid.
5. Detectar comandos internos.
6. Se comando interno válido:
   6.1 Executar comando.
   6.2 Cancelar jobs pendentes.
   6.3 Registrar evento de sistema.
   6.4 Encerrar processamento sem chamar IA.
7. Verificar se contato está ignorado.
8. Se ignorado:
   8.1 Não chamar IA.
   8.2 Registrar suppression log.
   8.3 Encerrar.
9. Se não ignorado:
   9.1 Aplicar debounce.
   9.2 Após janela de espera, consolidar mensagens.
   9.3 Verificar novamente se contato está ignorado.
   9.4 Se ainda liberado, chamar IA.
```

---

## 9. Modelo de dados sugerido

## 9.1 Enum de origem

```prisma
enum IgnoredContactSource {
  MANUAL
  EVOLUTION_CONTACT_IMPORT
  WHATSAPP_COMMAND
  CHAT_ACTION
  AUTO_SAFETY
  SYSTEM
}
```

## 9.2 Tabela `IgnoredContact`

```prisma
model IgnoredContact {
  id                  String               @id @default(cuid())

  userId              String
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)

  instanceId          String
  instance            WhatsAppInstance     @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  jid                 String
  phoneNumber         String?
  displayName         String?
  pushName            String?
  businessName        String?

  source              IgnoredContactSource @default(MANUAL)
  reason              String?

  isActive            Boolean              @default(true)
  createdByUserId     String?
  createdByMessageId  String?

  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  deletedAt           DateTime?

  @@unique([userId, instanceId, jid])
  @@index([userId, instanceId, isActive])
  @@index([instanceId, jid])
}
```

## 9.3 Tabela opcional `AiSuppressionLog`

Recomendada para debug e confiança do usuário.

```prisma
enum AiSuppressionReason {
  GLOBAL_AI_DISABLED
  IGNORED_CONTACT
  GROUP_CHAT
  HUMAN_HANDOFF
  COMMAND_RECEIVED
  INSTANCE_DISCONNECTED
}

model AiSuppressionLog {
  id              String              @id @default(cuid())
  userId          String
  instanceId      String
  conversationId  String?
  messageId       String?
  contactJid      String
  reason          AiSuppressionReason
  metadata        Json?
  createdAt       DateTime            @default(now())

  @@index([userId, instanceId, contactJid])
  @@index([createdAt])
}
```

## 9.4 Ajuste sugerido em `Conversation`

```prisma
model Conversation {
  // campos existentes...
  aiPaused            Boolean   @default(false)
  aiPausedReason      String?
  aiPausedUpdatedAt   DateTime?
}
```

Observação: `Conversation.aiPaused` é uma denormalização útil para UI rápida. A fonte da verdade continua sendo `IgnoredContact` quando a pausa vier da lista.

---

## 10. Normalização de telefone e JID

Criar helper central:

```ts
normalizeWhatsappJid(input: string): string
```

Regras:

- Remover espaços, parênteses, hífens e `+`.
- Se já vier como JID, manter formato normalizado.
- Se for número individual, gerar:

```text
<digits>@s.whatsapp.net
```

- Se for grupo, manter:

```text
<id>@g.us
```

- Para contatos individuais, salvar também `phoneNumber` sem sufixo.

Exemplos:

```text
+55 (54) 99999-9999       → 5554999999999@s.whatsapp.net
5554999999999             → 5554999999999@s.whatsapp.net
5554999999999@s.whatsapp.net → 5554999999999@s.whatsapp.net
```

---

## 11. APIs internas da plataforma

## 11.1 Listar ignorados

```http
GET /api/automation/ignored-contacts
```

Query params opcionais:

```text
?q=camili&status=active&page=1&pageSize=20
```

Resposta:

```json
{
  "data": [
    {
      "id": "...",
      "jid": "5554999999999@s.whatsapp.net",
      "phoneNumber": "5554999999999",
      "displayName": "Mãe",
      "pushName": "Mãe",
      "source": "MANUAL",
      "reason": "Contato pessoal",
      "isActive": true,
      "createdAt": "2026-06-04T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

---

## 11.2 Adicionar manualmente

```http
POST /api/automation/ignored-contacts
```

Body:

```json
{
  "phoneNumber": "+55 54 99999-9999",
  "displayName": "Mãe",
  "reason": "Contato pessoal"
}
```

Comportamento:

- Validar sessão.
- Buscar instância do usuário.
- Normalizar telefone/JID.
- Fazer upsert.
- Se `isActive = false`, reativar.
- Retornar contato salvo.

---

## 11.3 Remover ou reativar IA para contato

```http
DELETE /api/automation/ignored-contacts/:id
```

Recomendação: usar soft delete ou `isActive = false` para manter histórico.

---

## 11.4 Buscar contatos do WhatsApp via Evolution

```http
GET /api/automation/evolution-contacts
```

Responsabilidade:

- Validar sessão.
- Buscar instância do usuário.
- Chamar Evolution Go server-side.
- Normalizar resposta.
- Marcar quais contatos já estão ignorados.

Resposta sugerida:

```json
{
  "data": [
    {
      "jid": "5554999999999@s.whatsapp.net",
      "phoneNumber": "5554999999999",
      "displayName": "Mãe",
      "firstName": "",
      "fullName": "",
      "pushName": "Mãe",
      "businessName": "",
      "alreadyIgnored": true
    }
  ]
}
```

---

## 11.5 Adicionar contatos em lote

```http
POST /api/automation/ignored-contacts/bulk
```

Body:

```json
{
  "contacts": [
    {
      "jid": "5554999999999@s.whatsapp.net",
      "displayName": "Mãe",
      "pushName": "Mãe",
      "businessName": ""
    }
  ],
  "reason": "Selecionado nos contatos do WhatsApp"
}
```

Comportamento:

- Fazer upsert por `userId + instanceId + jid`.
- Não duplicar contatos.
- Retornar quantidade adicionada e quantidade já existente.

---

## 11.6 Pausar IA por conversa

```http
POST /api/conversations/:conversationId/ai/pause
```

Body:

```json
{
  "reason": "Usuário pausou pelo chat"
}
```

Comportamento:

- Validar dono da conversa.
- Adicionar JID à lista de ignorados com `source = CHAT_ACTION`.
- Cancelar jobs pendentes da IA.
- Atualizar conversa para exibir estado pausado.

---

## 11.7 Reativar IA por conversa

```http
POST /api/conversations/:conversationId/ai/resume
```

Comportamento:

- Validar dono da conversa.
- Marcar `IgnoredContact.isActive = false`.
- Atualizar conversa.

---

## 12. Serviço Evolution Go

Criar/estender:

```text
/src/services/evolution-go.ts
```

Métodos sugeridos:

```ts
export async function getEvolutionContacts(instance: WhatsAppInstance): Promise<EvolutionContact[]>;
export async function tryDeleteEvolutionMessage(instance: WhatsAppInstance, chatJid: string, messageId: string): Promise<void>;
```

Exemplo conceitual:

```ts
export async function getEvolutionContacts(instance: WhatsAppInstance) {
  const response = await fetch(`${EVOLUTION_GO_BASE_URL}/user/contacts`, {
    method: 'GET',
    headers: buildEvolutionAuthHeaders(instance),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new EvolutionGoError('Não foi possível buscar contatos do WhatsApp', response.status);
  }

  const payload = await response.json();

  return normalizeEvolutionContacts(payload.data ?? payload.contacts ?? []);
}
```

Notas:

- A documentação do Evolution Go mostra o endpoint como `/user/contacts`.
- Validar na instância real se a autenticação usa API key global, token da instância ou customUrl.
- Não expor chamada ao Evolution Go no client.
- Fazer tudo por rota interna do Next/API.

---

## 13. Command detector

Criar helper:

```text
/src/lib/ai-command-detector.ts
```

Comandos V1:

```ts
const AI_COMMANDS = {
  PAUSE: '/ia_pause',
} as const;
```

Função:

```ts
export function detectAiCommand(messageText: string): AiCommand | null {
  const normalized = messageText.trim().toLowerCase();

  if (normalized === '/ia_pause') {
    return { type: 'PAUSE_AI_FOR_CONTACT' };
  }

  return null;
}
```

Regra de execução:

```ts
if (command && message.isFromMe) {
  await ignoredContactsService.pauseByCommand({
    userId,
    instanceId,
    conversationId,
    contactJid,
    messageId,
  });

  await aiQueue.cancelPendingJobs(conversationId);
  return;
}
```

---

## 14. Integração com o motor da IA

Criar guard central antes do LLM:

```ts
export async function canAiRespondToConversation(input: {
  userId: string;
  instanceId: string;
  contactJid: string;
  conversationId: string;
}) {
  const userSettings = await getUserSettings(input.userId);

  if (!userSettings.aiEnabled) {
    return { allowed: false, reason: 'GLOBAL_AI_DISABLED' };
  }

  const ignored = await ignoredContactRepository.findActiveByJid({
    userId: input.userId,
    instanceId: input.instanceId,
    jid: input.contactJid,
  });

  if (ignored) {
    return { allowed: false, reason: 'IGNORED_CONTACT' };
  }

  return { allowed: true };
}
```

Usar este guard:

- no webhook antes do debounce;
- no worker/job depois do debounce;
- imediatamente antes de enviar a mensagem;
- no endpoint de envio manual se futuramente a IA puder sugerir resposta.

---

## 15. UX/UI mobile-first

## 15.1 Menu lateral

Adicionar item próprio:

```text
Automação
  IA
  Configurações do negócio
  Lista de ignorados
```

No mobile, esse item deve aparecer no drawer lateral ou navegação inferior, dependendo do padrão atual do app.

---

## 15.2 Tela Lista de ignorados

Rota sugerida:

```text
/automation/ignored-contacts
```

Título:

```text
Lista de ignorados
```

Subtítulo:

```text
Escolha contatos que a IA não deve responder automaticamente.
```

### Estrutura da tela

Mobile-first:

```text
[Header da página]
[Tabs/Segmented control]
  - Ignorados
  - Contatos do WhatsApp
  - Adicionar manualmente

[Aba ativa]
```

Desktop:

```text
Header
Cards de resumo
Layout em duas colunas, se fizer sentido
```

---

## 15.3 Aba “Ignorados”

Componentes:

- Campo de busca.
- Lista de contatos ignorados.
- Card por contato.
- Botão “Reativar IA”.
- Badge de origem:
  - Manual
  - Contatos do WhatsApp
  - Comando /ia_pause
  - Chat
  - Segurança

Card sugerido:

```text
[Mãe]
+55 54 99999-9999
IA pausada desde 04/06/2026
Origem: Manual
[Reativar IA]
```

Empty state:

```text
Nenhum contato ignorado ainda.
Adicione familiares, amigos ou fornecedores para evitar respostas automáticas da IA.
```

---

## 15.4 Aba “Contatos do WhatsApp”

Componentes:

- Botão “Sincronizar contatos”.
- Campo de busca.
- Lista com seleção múltipla.
- Estados:
  - carregando;
  - erro ao buscar contatos;
  - WhatsApp desconectado;
  - nenhum contato retornado;
  - lista carregada.

Ações:

```text
[ ] Camili Krauser      +55 54 99999-9999
[ ] Mãe                +55 54 98888-8888
[ ] Fornecedor X       +55 54 97777-7777

[Ignorar 3 selecionados]
```

No mobile, o botão de ação deve ficar sticky no rodapé quando houver seleção.

---

## 15.5 Aba “Adicionar manualmente”

Campos:

- Nome/apelido, opcional.
- Telefone, obrigatório.
- Motivo, opcional.

Microcopy:

```text
Use esta opção para adicionar contatos que ainda não aparecem na lista do WhatsApp.
```

Botão:

```text
Adicionar à lista de ignorados
```

---

## 15.6 Chat

No header da conversa, adicionar menu exclusivo do chat:

```text
⋮
├── Pausar IA para este contato
├── Reativar IA para este contato
├── Ver detalhes do contato
└── Copiar telefone
```

Quando o contato estiver ignorado, mostrar banner:

```text
IA pausada para este contato
A IA não responderá automaticamente. Você ainda pode atender manualmente.
[Reativar IA]
```

No item da lista de conversas, mostrar um pequeno badge:

```text
IA pausada
```

---

## 16. Estados e mensagens do sistema

### Sucesso ao adicionar manualmente

```text
Contato adicionado à lista de ignorados. A IA não responderá mais esta conversa.
```

### Sucesso ao importar contatos

```text
3 contatos adicionados à lista de ignorados.
```

### Já estava ignorado

```text
Este contato já está na lista de ignorados.
```

### Reativação

```text
IA reativada para este contato.
```

### WhatsApp desconectado ao buscar contatos

```text
Conecte seu WhatsApp para buscar seus contatos salvos.
```

### Erro Evolution Go

```text
Não conseguimos buscar seus contatos agora. Tente novamente em alguns instantes.
```

### Comando `/ia_pause` processado

Criar evento interno no chat:

```text
IA pausada para este contato por comando enviado no WhatsApp.
```

---

## 17. Segurança e privacidade

### 17.1 Não permitir que cliente pause a IA

O comando `/ia_pause` só deve funcionar quando a mensagem vier do próprio número conectado (`IsFromMe = true`).

### 17.2 Não expor contatos entre usuários

Toda consulta deve filtrar por:

```text
userId + instanceId
```

### 17.3 Não expor token Evolution no frontend

A busca de contatos deve passar por API interna.

### 17.4 Não usar block real do WhatsApp

A lista de ignorados deve ser interna. Não bloquear o contato real no WhatsApp.

### 17.5 Auditoria mínima

Salvar origem da inclusão:

- manual;
- importado;
- comando;
- ação no chat;
- segurança automática.

Isso ajuda o usuário a entender por que a IA está pausada.

---

## 18. Validações com Zod

```ts
export const addIgnoredContactSchema = z.object({
  phoneNumber: z.string().min(10).max(30),
  displayName: z.string().max(120).optional(),
  reason: z.string().max(300).optional(),
});

export const bulkIgnoredContactsSchema = z.object({
  contacts: z.array(z.object({
    jid: z.string().min(8),
    phoneNumber: z.string().optional(),
    displayName: z.string().max(120).optional(),
    pushName: z.string().max(120).optional(),
    businessName: z.string().max(120).optional(),
  })).min(1).max(500),
  reason: z.string().max(300).optional(),
});
```

---

## 19. Critérios de aceite

1. Usuário logado consegue acessar menu exclusivo **Lista de ignorados**.
2. Usuário consegue adicionar contato manualmente por telefone.
3. Sistema normaliza telefone para JID.
4. Sistema não duplica contatos ignorados.
5. Usuário consegue buscar contatos salvos pelo Evolution Go.
6. Usuário consegue selecionar múltiplos contatos e adicioná-los à lista.
7. Contatos já ignorados aparecem marcados como “já ignorado”.
8. Usuário consegue remover/reativar contato ignorado.
9. Chat mostra banner quando a IA está pausada para aquele contato.
10. Lista de conversas mostra indicação discreta de “IA pausada”.
11. O comando `/ia_pause` enviado pelo número conectado adiciona o contato à lista.
12. O comando `/ia_pause` enviado por cliente/terceiro não pausa a IA.
13. Ao pausar por comando, jobs pendentes de IA são cancelados.
14. O motor da IA verifica a lista antes de responder.
15. A verificação acontece também após o debounce, evitando race condition.
16. Contatos ignorados continuam recebendo mensagens no chat, mas sem resposta automática.
17. A busca no Evolution Go acontece server-side.
18. Tokens/API keys não aparecem no browser.
19. Usuário não consegue ver ou alterar lista de ignorados de outro usuário.
20. Grupos não recebem resposta da IA por padrão.

---

## 20. Checklist técnico de implementação

### Banco

- [ ] Criar enum `IgnoredContactSource`.
- [ ] Criar model `IgnoredContact`.
- [ ] Opcional: criar `AiSuppressionLog`.
- [ ] Adicionar campos denormalizados em `Conversation`, se necessário.
- [ ] Criar migration Prisma.
- [ ] Rodar generate/migrate.

### Backend

- [ ] Criar repository `ignored-contact.repository.ts`.
- [ ] Criar service `ignored-contact.service.ts`.
- [ ] Criar helper `normalizeWhatsappJid`.
- [ ] Criar helper `ai-command-detector`.
- [ ] Criar APIs internas da lista.
- [ ] Criar API para buscar contatos Evolution.
- [ ] Integrar guard no webhook.
- [ ] Integrar guard no worker/debounce da IA.
- [ ] Cancelar jobs pendentes no pause.
- [ ] Garantir `IsFromMe = true` para comando.

### Frontend

- [ ] Adicionar item no menu lateral.
- [ ] Criar tela `/automation/ignored-contacts`.
- [ ] Criar aba “Ignorados”.
- [ ] Criar aba “Contatos do WhatsApp”.
- [ ] Criar aba “Adicionar manualmente”.
- [ ] Criar cards mobile-first.
- [ ] Adicionar badge de IA pausada no chat.
- [ ] Adicionar ação no menu do chat.
- [ ] Criar estados de loading/empty/error.

### QA manual

- [ ] Adicionar contato manual.
- [ ] Importar contato do WhatsApp.
- [ ] Pausar pelo chat.
- [ ] Pausar com `/ia_pause` enviado pelo número conectado.
- [ ] Confirmar que `/ia_pause` enviado por cliente não pausa.
- [ ] Confirmar que IA não responde contato ignorado.
- [ ] Confirmar que reativação volta a permitir IA.
- [ ] Confirmar que usuário A não altera contatos do usuário B.

---

## 21. Sugestões de melhoria para esta feature

## 21.1 Comando `/ia_resume`

Adicionar na V1.1:

```text
/ia_resume
```

Para reativar IA pelo WhatsApp quando enviado pelo próprio número conectado.

---

## 21.2 Comando `/ia_status`

Adicionar:

```text
/ia_status
```

Retornar internamente na plataforma ou como evento:

```text
IA ativa globalmente, mas pausada para este contato.
```

Evitar responder isso ao cliente final.

---

## 21.3 Modo “somente clientes confirmadas”

Para usuários que usam WhatsApp pessoal, pode ser mais seguro inverter a lógica:

```text
A IA só responde contatos marcados como clientes ou leads.
```

Isso seria uma **allowlist**, mais segura que blacklist. Não recomendo para V1 porque aumenta atrito, mas pode ser uma opção avançada.

---

## 21.4 Sugestões automáticas de contatos pessoais

A plataforma pode sugerir contatos para ignorar com base em nomes como:

- mãe;
- pai;
- amor;
- marido;
- esposa;
- filho;
- família;
- fornecedor.

Importante: não adicionar automaticamente sem confirmação. Apenas sugerir.

---

## 21.5 Pausa temporária

Permitir pausar IA por contato por:

- 1 hora;
- 24 horas;
- 7 dias;
- até reativar manualmente.

Útil quando a profissional assumiu uma conversa temporariamente.

---

## 21.6 Motivo obrigatório opcional por configuração

Em contas maiores, exigir motivo para pausar IA pode ajudar auditoria.

---

## 21.7 Histórico de decisões da IA

Mostrar na conversa:

```text
04/06/2026 14:31 — IA não respondeu porque contato está na lista de ignorados.
```

Isso aumenta transparência e reduz confusão.

---

## 22. Prompt complementar para agente de desenvolvimento

```text
Você é um engenheiro full-stack sênior em Next.js, TypeScript, Prisma e integrações WhatsApp via Evolution Go.

Implemente a funcionalidade “Lista de ignorados da IA”.

Objetivo:
Permitir que o usuário logado cadastre contatos que devem ser ignorados pela IA. Contatos ignorados continuam aparecendo no chat, mas a IA não pode responder automaticamente.

Requisitos principais:
1. Criar menu exclusivo “Lista de ignorados”, preferencialmente em Automação.
2. Criar tela mobile-first com abas:
   - Ignorados
   - Contatos do WhatsApp
   - Adicionar manualmente
3. Permitir adicionar contato manualmente por telefone.
4. Buscar contatos salvos do WhatsApp usando Evolution Go via endpoint server-side GET /user/contacts.
5. Permitir seleção múltipla dos contatos retornados e inclusão em lote na lista de ignorados.
6. Não usar endpoints de block/unblock do Evolution Go para esta feature.
7. Criar model Prisma IgnoredContact com userId, instanceId, jid, phoneNumber, displayName, source, reason e isActive.
8. Garantir unique por userId + instanceId + jid.
9. Criar APIs internas:
   - GET /api/automation/ignored-contacts
   - POST /api/automation/ignored-contacts
   - DELETE /api/automation/ignored-contacts/:id
   - GET /api/automation/evolution-contacts
   - POST /api/automation/ignored-contacts/bulk
   - POST /api/conversations/:id/ai/pause
   - POST /api/conversations/:id/ai/resume
10. No webhook do Evolution Go, detectar comando /ia_pause.
11. O comando /ia_pause só deve funcionar se a mensagem vier do próprio número conectado, ou seja, IsFromMe = true.
12. Se /ia_pause for recebido de cliente ou terceiro, não executar comando.
13. Ao pausar, cancelar jobs/debounce pendentes da IA para aquela conversa.
14. Antes de qualquer chamada ao LLM, verificar se contato está ignorado.
15. Verificar novamente depois do debounce e imediatamente antes de enviar mensagem.
16. Exibir banner no chat quando a IA estiver pausada para o contato.
17. Exibir badge “IA pausada” na lista de conversas.
18. Garantir que um usuário não acesse contatos ignorados de outro usuário.
19. Todas as chamadas ao Evolution Go devem ficar no servidor.
20. Não criar testes automatizados agora.

Priorize UX mobile-first, estados de carregamento, erro, lista vazia e feedback claro de sucesso.
```

---

## 23. Conclusão

A Lista de ignorados é uma feature pequena, mas muito importante para aumentar confiança na IA. Ela resolve um medo real do usuário: a IA responder pessoas que não deveriam receber automação.

A decisão mais importante é manter essa lista como uma regra **interna da plataforma**, sem bloquear contatos no WhatsApp. Assim, o usuário continua recebendo e visualizando tudo, mas mantém controle sobre onde a IA pode atuar.

Para a V1, eu priorizaria nesta ordem:

1. Guard backend para impedir resposta da IA.
2. Comando `/ia_pause` seguro com `IsFromMe = true`.
3. Tela de Lista de ignorados.
4. Importação de contatos via Evolution Go.
5. Ação rápida no chat.
6. Logs de supressão para debug.

