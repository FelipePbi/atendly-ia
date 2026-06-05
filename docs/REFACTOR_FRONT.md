# Refatoração V1 — Frontend WhatsApp + IA

## 1. Visão geral

Esta refatoração tem como objetivo reorganizar a experiência do usuário, simplificar o header, separar melhor os contextos da aplicação e redesenhar o frontend com abordagem **mobile-first**.

A V1 deve deixar claro que o sistema tem três áreas principais:

1. **Chat / Atendimento**  
   Área principal de operação diária, onde o usuário vê conversas e mensagens.

2. **IA**  
   Área dedicada ao controle da inteligência artificial. Nesta V1, terá somente a opção de ativar ou desativar a IA.

3. **Configurações**  
   Área para dados de conta, troca de senha e conexão do WhatsApp.

O header deixa de ser uma área de ações complexas e passa a exibir apenas informações essenciais de estado.

---

## 2. Objetivos da refatoração

### Objetivos principais

- Redesenhar o frontend priorizando uso em celular.
- Criar uma navegação mais clara usando menu lateral.
- Remover ações complexas do header.
- Concentrar o contexto de IA em uma área exclusiva.
- Concentrar configurações de usuário e WhatsApp em uma área de configurações acessível pelo menu lateral.
- Criar um menu exclusivo para o chat, separado do menu global da aplicação.
- Manter o produto simples para V1, sem adicionar configurações avançadas de IA neste momento.

### Resultado esperado

O usuário deve conseguir entender rapidamente:

- se o WhatsApp está conectado;
- se a IA está ativa ou pausada;
- onde acessa conversas;
- onde controla a IA;
- onde configura conta e WhatsApp.

---

## 3. Escopo da V1

### Dentro do escopo

- Refatoração visual e estrutural do frontend.
- Novo layout mobile-first.
- Menu lateral global.
- Header simplificado.
- Página exclusiva para IA.
- Página de configurações de usuário.
- Página ou seção de conexão com WhatsApp dentro de configurações.
- Menu exclusivo do chat.
- Estados visuais para WhatsApp conectado/desconectado.
- Estados visuais para IA ativa/pausada.
- Organização de rotas, componentes e layout.

### Fora do escopo neste momento

- Configuração de prompt da IA.
- Treinamento de IA com base de conhecimento.
- Regras de atendimento automático.
- Horário de funcionamento da IA.
- Multiatendentes.
- Múltiplos números de WhatsApp por usuário.
- Relatórios e métricas.
- Testes automatizados.
- CRM completo.

---

## 4. Nova arquitetura de navegação

A aplicação deve ter dois níveis de navegação:

1. **Navegação global**, exibida no menu lateral principal.
2. **Navegação contextual do chat**, exibida apenas dentro da área de chat.

### 4.1 Menu lateral global

O menu lateral global deve ser o principal ponto de navegação da aplicação.

#### Itens sugeridos

- **Chat**
  - Acesso à tela principal de atendimento.

- **IA**
  - Acesso ao controle de ativar/desativar inteligência artificial.

- **WhatsApp**
  - Acesso à conexão, reconexão, status e QR Code.
  - Pode ficar como item próprio ou dentro de Configurações, dependendo da decisão de UX.

- **Conta**
  - Dados do usuário.
  - Troca de senha.

- **Sair**
  - Logout da aplicação.

#### Recomendação de estrutura para V1

Para uma V1 mais clara, recomendo separar visualmente assim:

```text
Menu lateral
├── Atendimento
│   └── Chat
├── Automação
│   └── IA
├── Configurações
│   ├── WhatsApp
│   └── Conta
└── Sair
```

Essa estrutura evita que o menu cresça de forma bagunçada nas próximas versões.

---

## 5. Header simplificado

O header deve deixar de ser um local de navegação e ações principais. Ele deve funcionar como uma barra de status da operação.

### 5.1 Conteúdo do header

O header deve conter apenas:

- Nome/logo curto do produto.
- Status da conexão WhatsApp.
- Status da IA.
- Botão de abrir menu lateral no mobile.

### 5.2 O que não deve ficar no header

- Botão direto de ativar/desativar IA.
- Botão de trocar senha.
- Botão de conectar WhatsApp.
- Lista de conversas.
- Configurações avançadas.

### 5.3 Status do WhatsApp no header

Estados sugeridos:

- **Conectado**
  - Texto: `WhatsApp conectado`
  - Versão mobile curta: `WA online`

- **Desconectado**
  - Texto: `WhatsApp desconectado`
  - Versão mobile curta: `WA offline`

- **Aguardando QR Code**
  - Texto: `Aguardando QR`

- **Conectando**
  - Texto: `Conectando...`

### 5.4 Status da IA no header

Estados sugeridos:

- **IA ativa**
  - Texto: `IA ativa`
  - Aparência positiva, chamativa, mas não exagerada.

- **IA pausada**
  - Texto: `IA pausada`
  - Aparência neutra/amarela/cinza.

### 5.5 Comportamento recomendado

Na V1, o status de IA no header deve ser preferencialmente **informativo**, não o controle principal.

Sugestão:

- Clique no chip `IA ativa` ou `IA pausada` pode levar para a tela de IA.
- A ativação/desativação real acontece apenas na página de IA.

Motivo: isso reduz erro operacional. O usuário não desativa a IA sem querer ao tocar no header pelo celular.

---

## 6. Contexto exclusivo de IA

A IA deve ter uma área própria acessível pelo menu lateral.

### 6.1 Rota sugerida

```text
/ia
```

ou, se preferir estrutura em inglês:

```text
/ai
```

Para o público brasileiro, recomendo `/ia`.

### 6.2 Conteúdo da tela de IA na V1

A tela deve conter:

- Título: `Inteligência Artificial`
- Status atual:
  - `IA ativa`
  - `IA pausada`
- Toggle principal:
  - Ativar IA
  - Pausar IA
- Texto explicativo curto.
- Última atualização do status, se disponível.

### 6.3 Microcopy sugerida

Quando IA estiver ativa:

```text
A IA está ativa e poderá responder automaticamente conforme as regras configuradas para sua conta.
```

Quando IA estiver pausada:

```text
A IA está pausada. Nenhuma resposta automática será enviada enquanto esse modo estiver ativo.
```

Como na V1 ainda não haverá regras avançadas, usar um texto preventivo:

```text
Nesta primeira versão, você pode apenas ativar ou pausar a IA. Configurações de comportamento, prompt e horários serão adicionadas em versões futuras.
```

### 6.4 Componente sugerido

```text
AiControlPanel
├── AiStatusCard
├── AiToggle
└── AiInfoBox
```

### 6.5 Estado

A IA deve continuar usando um estado booleano:

```ts
aiEnabled: boolean
```

O valor deve ser persistido por usuário, preferencialmente na tabela ou coleção de configurações do usuário.

---

## 7. Configurações de usuário e WhatsApp

As configurações devem sair do header e ficar acessíveis pelo menu lateral.

### 7.1 Estrutura recomendada

```text
/settings
/settings/account
/settings/whatsapp
```

ou em português:

```text
/configuracoes
/configuracoes/conta
/configuracoes/whatsapp
```

Recomendação para o código: usar rotas em inglês para padronização técnica, mas exibir labels em português.

Exemplo:

```text
/settings/account   -> label: Conta
/settings/whatsapp  -> label: WhatsApp
```

---

## 8. Tela de configurações da conta

### 8.1 Rota sugerida

```text
/settings/account
```

### 8.2 Conteúdo

- Email do usuário.
- Data de criação da conta, se disponível.
- Formulário de troca de senha.
- Botão de logout secundário, opcional.

### 8.3 Formulário de troca de senha

Campos:

- Senha atual.
- Nova senha.
- Confirmar nova senha.

Validações:

- Senha atual obrigatória.
- Nova senha com pelo menos 8 caracteres.
- Confirmação deve ser igual à nova senha.
- Nova senha não deve ser igual à senha atual.

Estados:

- Salvando.
- Sucesso.
- Erro de senha atual incorreta.
- Erro de validação.

---

## 9. Tela de configuração/conexão do WhatsApp

### 9.1 Rota sugerida

```text
/settings/whatsapp
```

### 9.2 Conteúdo

- Status da instância.
- Número conectado, quando disponível.
- Card de conexão via QR Code.
- Botão de reconectar, se desconectado.
- Mensagem clara informando que cada usuário pode ter apenas um número cadastrado.

### 9.3 Regras de negócio

- Cada usuário pode ter somente uma instância/número.
- Se já existir uma instância, não exibir ação de criar uma nova.
- Se a instância estiver desconectada, permitir reconexão.
- Se o QR Code expirar, permitir gerar novo QR Code.

### 9.4 Microcopy sugerida

```text
Cada conta pode conectar apenas um número de WhatsApp nesta versão.
```

```text
Para conectar, abra o WhatsApp no celular, acesse Dispositivos conectados e escaneie o QR Code abaixo.
```

```text
Seu QR Code expirou. Gere um novo código para continuar.
```

---

## 10. Chat com menu exclusivo

A área de chat deve ter uma navegação própria, independente do menu global.

### 10.1 Rota sugerida

```text
/chat
```

### 10.2 Estrutura da tela

No desktop/tablet:

```text
┌──────────────────────────────────────────────┐
│ Header global: status WhatsApp + status IA   │
├───────────────┬──────────────────────────────┤
│ Menu lateral  │ Chat                          │
│ global        │ ┌────────────┬──────────────┐ │
│               │ │ Conversas  │ Mensagens    │ │
│               │ │            │              │ │
│               │ └────────────┴──────────────┘ │
└───────────────┴──────────────────────────────┘
```

No mobile:

```text
┌────────────────────────────┐
│ Header compacto             │
├────────────────────────────┤
│ Lista de conversas          │
│ ou                          │
│ Thread da conversa aberta   │
└────────────────────────────┘
```

### 10.3 Menu exclusivo do chat

O menu do chat deve controlar apenas elementos relacionados ao atendimento.

#### Itens possíveis para V1

- Todas as conversas.
- Não lidas.
- Respondidas por mim.
- Aguardando resposta.

Se ainda não houver dados suficientes para filtros reais, implementar apenas visualmente os itens que são funcionais.

Recomendação para V1:

- Implementar `Todas` e `Não lidas`.
- Deixar outros filtros como melhoria futura.

### 10.4 Componentes sugeridos

```text
ChatLayout
├── ChatToolbar
├── ChatMenu
├── ConversationList
├── ConversationItem
├── ChatThread
├── MessageBubble
├── ChatEmptyState
└── ChatMobileBackButton
```

### 10.5 Comportamento mobile

No mobile, o chat deve funcionar em duas etapas:

1. Usuário vê a lista de conversas.
2. Ao tocar em uma conversa, abre a thread.
3. Dentro da thread, aparece botão de voltar para a lista.

Evitar mostrar lista e conversa lado a lado em telas pequenas.

### 10.6 Comportamento desktop

No desktop:

- Lista de conversas à esquerda.
- Conversa aberta à direita.
- Se nenhuma conversa estiver selecionada, exibir estado vazio.

---

## 11. Redesign mobile-first

### 11.1 Princípios visuais

- Começar o design pelo celular.
- Priorizar leitura, toque e clareza.
- Usar cards simples.
- Evitar excesso de informação na mesma tela.
- Usar espaçamentos confortáveis.
- Botões com área mínima de toque adequada.
- Não depender de hover para ações importantes.

### 11.2 Breakpoints sugeridos

Usando Tailwind:

```text
Base: mobile
sm: celulares grandes
md: tablets
lg: desktop
xl: telas grandes
```

A UI deve funcionar completamente no breakpoint base, antes de qualquer ajuste `md:` ou `lg:`.

### 11.3 Header mobile

No mobile, o header deve ser compacto:

```text
[Menu] [Nome curto] [WA online] [IA ativa]
```

Se faltar espaço:

```text
[Menu] [Logo] [WA] [IA]
```

Ao tocar em `WA`, pode abrir a configuração do WhatsApp.  
Ao tocar em `IA`, pode abrir a tela de IA.

### 11.4 Menu lateral mobile

No mobile, o menu lateral deve abrir como drawer/off-canvas.

Comportamento:

- Botão hambúrguer no header.
- Drawer desliza da esquerda.
- Fundo escurecido.
- Fechar ao tocar fora.
- Fechar ao selecionar uma rota.

### 11.5 Menu lateral desktop

No desktop, o menu lateral pode ficar fixo.

Largura sugerida:

```text
240px a 280px
```

---

## 12. Estrutura técnica sugerida

### 12.1 Estrutura de pastas

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── chat/
│   │   ├── ia/
│   │   └── settings/
│   │       ├── account/
│   │       └── whatsapp/
│   └── api/
│       ├── auth/
│       ├── conversations/
│       ├── user/
│       ├── whatsapp/
│       └── webhooks/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── AppHeader.tsx
│   │   ├── AppSidebar.tsx
│   │   └── MobileSidebar.tsx
│   ├── chat/
│   │   ├── ChatLayout.tsx
│   │   ├── ChatMenu.tsx
│   │   ├── ConversationList.tsx
│   │   ├── ConversationItem.tsx
│   │   ├── ChatThread.tsx
│   │   └── MessageBubble.tsx
│   ├── ia/
│   │   ├── AiControlPanel.tsx
│   │   ├── AiStatusCard.tsx
│   │   └── AiToggle.tsx
│   ├── settings/
│   │   ├── AccountSettings.tsx
│   │   ├── PasswordChangeForm.tsx
│   │   └── WhatsAppSettings.tsx
│   └── ui/
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── EmptyState.tsx
│       └── LoadingState.tsx
├── hooks/
│   ├── useAiSettings.ts
│   ├── useWhatsappStatus.ts
│   └── useMobileNavigation.ts
├── lib/
│   ├── auth.ts
│   ├── validations.ts
│   ├── routes.ts
│   └── utils.ts
├── services/
│   └── evolution-go.ts
└── types/
    ├── ai.ts
    ├── chat.ts
    ├── user.ts
    └── whatsapp.ts
```

---

## 13. Layout base da aplicação

### 13.1 AppShell

O `AppShell` deve ser usado nas rotas autenticadas.

Responsabilidades:

- Renderizar header global.
- Renderizar menu lateral global.
- Controlar abertura/fechamento do menu no mobile.
- Proteger rotas autenticadas.
- Buscar dados básicos do usuário.
- Buscar status resumido de WhatsApp e IA para o header.

Pseudoestrutura:

```tsx
<AppShell>
  <AppHeader />
  <AppSidebar />
  <main>{children}</main>
</AppShell>
```

### 13.2 AppHeader

Responsabilidades:

- Exibir estado do WhatsApp.
- Exibir estado da IA.
- Exibir botão de menu no mobile.
- Não conter ações complexas.

### 13.3 AppSidebar

Responsabilidades:

- Navegação principal.
- Destacar item ativo.
- Agrupar itens por contexto.
- Exibir logout.

---

## 14. Estados globais necessários

### 14.1 Estado de WhatsApp

Tipo sugerido:

```ts
type WhatsAppConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'waiting_qr'
  | 'qr_expired'
  | 'unknown';
```

### 14.2 Estado da IA

Tipo sugerido:

```ts
type AiStatus = {
  enabled: boolean;
  updatedAt?: string;
};
```

### 14.3 Estado do usuário

Tipo sugerido:

```ts
type CurrentUser = {
  id: string;
  email: string;
};
```

---

## 15. Rotas e responsabilidades

### 15.1 Rotas públicas

```text
/login
/register
```

### 15.2 Rotas autenticadas

```text
/chat
/ia
/settings/account
/settings/whatsapp
```

### 15.3 Redirecionamentos

- Usuário não autenticado tentando acessar rota privada:

```text
redirect -> /login
```

- Usuário autenticado acessando `/login` ou `/register`:

```text
redirect -> /chat
```

- Usuário autenticado sem instância WhatsApp:

```text
permitir acessar /settings/whatsapp
exibir alerta em /chat
```

Recomendação: não bloquear totalmente o `/chat`. Em vez disso, mostrar um estado vazio orientando o usuário a conectar o WhatsApp. Isso evita sensação de erro.

---

## 16. Novo comportamento esperado por tela

### 16.1 Chat

A tela de chat deve ser o centro operacional.

Quando WhatsApp estiver conectado:

- Exibir lista de conversas.
- Exibir mensagens da conversa selecionada.
- Exibir estados de carregamento e vazio.

Quando WhatsApp não estiver conectado:

- Exibir card orientando conexão.
- CTA: `Conectar WhatsApp`.
- CTA leva para `/settings/whatsapp`.

### 16.2 IA

A tela de IA deve mostrar apenas o controle da IA.

Conteúdo:

- Status atual.
- Toggle.
- Texto explicativo.
- Card “Em breve” para configurações futuras, opcional.

Não incluir ainda:

- Prompt customizado.
- Temperatura/modelo.
- Base de conhecimento.
- Regras por horário.

### 16.3 Conta

Conteúdo:

- Email.
- Troca de senha.
- Logout opcional.

### 16.4 WhatsApp

Conteúdo:

- Status de conexão.
- QR Code.
- Reconectar.
- Número conectado.
- Informação sobre limite de um número por usuário.

---

## 17. Design system mínimo

### 17.1 Cores semânticas

Definir classes/tokens semânticos para:

```text
success  -> conectado / IA ativa
warning  -> aguardando QR / IA pausada
danger   -> erro / desconectado crítico
neutral  -> estados informativos
```

Evitar espalhar cores diretamente nos componentes. Preferir componentes como `StatusBadge`.

### 17.2 Componentes de status

Criar componente genérico:

```tsx
<StatusBadge status="connected" label="WhatsApp conectado" />
```

ou específico:

```tsx
<WhatsappStatusBadge status={status} />
<AiStatusBadge enabled={aiEnabled} />
```

Recomendação: usar componentes específicos para evitar lógica visual duplicada.

---

## 18. Sugestões de melhoria para a V1

### 18.1 Header apenas informativo

A mudança mais importante é o header deixar de ser um lugar de ações. Em mobile, header com muitas ações causa toques acidentais e confusão.

Sugestão: chips do header podem ser clicáveis apenas para navegação, não para alteração direta de estado.

Exemplo:

- Clicar em `IA ativa` abre `/ia`.
- Clicar em `WA online` abre `/settings/whatsapp`.

### 18.2 IA com tela simples, mas preparada para crescer

Mesmo que a V1 tenha apenas ativar/desativar, a tela de IA já deve estar estruturada para futuras seções:

```text
/ia
├── Status
├── Controle
├── Comportamento futuro
├── Horários futuros
└── Base de conhecimento futura
```

Na V1, só renderizar `Status` e `Controle`.

### 18.3 Separar WhatsApp de Conta

Embora ambos sejam configurações, WhatsApp é operacionalmente mais importante. Recomendo manter como item visível no menu lateral, mesmo que tecnicamente a rota fique dentro de `/settings/whatsapp`.

No menu:

```text
Chat
IA
WhatsApp
Conta
Sair
```

Isso é mais fácil para usuários não técnicos.

### 18.4 Chat deve abrir rápido

Evitar bloquear a tela de chat aguardando muitas chamadas. Carregar em etapas:

1. Renderizar layout.
2. Carregar status.
3. Carregar conversas.
4. Carregar mensagens da conversa selecionada.

### 18.5 Estados vazios bem escritos

A V1 precisa ter bons empty states, principalmente porque no início o usuário pode não ter mensagens.

Exemplo para chat sem mensagens:

```text
Nenhuma conversa ainda.
Quando alguém enviar uma mensagem para o seu WhatsApp conectado, ela aparecerá aqui.
```

Exemplo para WhatsApp desconectado:

```text
Seu WhatsApp ainda não está conectado.
Conecte um número para começar a receber mensagens no painel.
```

### 18.6 Não esconder o estado da IA

Mesmo que a ação de ativar/desativar esteja na tela de IA, o status precisa estar sempre visível no header para evitar dúvidas.

### 18.7 Usar linguagem operacional

Evitar termos técnicos como:

- instância;
- webhook;
- token;
- sessão;
- JID.

Na interface, usar termos como:

- WhatsApp conectado;
- número conectado;
- IA ativa;
- IA pausada;
- conversas;
- mensagens.

Os termos técnicos podem ficar apenas no código, logs e documentação.

---

## 19. Critérios de aceite da refatoração

### Navegação

- O menu lateral global existe e funciona no mobile e desktop.
- No mobile, o menu lateral abre e fecha corretamente.
- O item ativo do menu fica destacado.
- Chat, IA, WhatsApp e Conta são acessíveis pelo menu lateral.
- Logout está disponível no menu lateral.

### Header

- Header mostra status do WhatsApp.
- Header mostra status da IA.
- Header não contém troca de senha.
- Header não contém conexão manual do WhatsApp.
- Header não contém botão direto de ativar/desativar IA.
- Header permanece compacto no mobile.

### IA

- Tela exclusiva de IA existe.
- Tela de IA mostra status atual.
- Usuário consegue ativar e desativar a IA pela tela de IA.
- Mudança de estado reflete no header.
- Estado da IA é persistido.

### WhatsApp

- Tela ou seção de WhatsApp existe dentro de configurações ou item próprio no menu.
- Usuário consegue ver status de conexão.
- Usuário consegue conectar/reconectar via QR Code.
- Interface informa que cada usuário pode ter apenas um número.
- Header atualiza status da conexão.

### Conta

- Tela de conta existe.
- Usuário consegue visualizar email.
- Usuário consegue trocar senha.
- Usuário consegue fazer logout.

### Chat

- Chat possui menu exclusivo/contextual.
- Menu do chat não substitui o menu lateral global.
- Lista de conversas funciona bem no mobile.
- Thread de mensagens funciona bem no mobile.
- Usuário consegue voltar da thread para a lista no mobile.
- Em desktop, lista e thread podem aparecer lado a lado.

### Mobile-first

- Todas as telas funcionam bem em largura mobile.
- Botões têm área de toque confortável.
- Menus não quebram em telas pequenas.
- Header não fica poluído.
- Não há dependência de hover para ação essencial.

---

## 20. Checklist de implementação

### Layout

- [ ] Criar `AppShell` para rotas autenticadas.
- [ ] Criar `AppHeader` simplificado.
- [ ] Criar `AppSidebar` desktop.
- [ ] Criar `MobileSidebar` como drawer.
- [ ] Garantir destaque de rota ativa.

### IA

- [ ] Criar rota `/ia`.
- [ ] Criar `AiControlPanel`.
- [ ] Criar toggle de IA.
- [ ] Persistir `aiEnabled`.
- [ ] Refletir status no header.

### Configurações

- [ ] Criar `/settings/account`.
- [ ] Criar `/settings/whatsapp`.
- [ ] Migrar troca de senha para `/settings/account`.
- [ ] Migrar conexão WhatsApp para `/settings/whatsapp`.
- [ ] Remover essas ações do header.

### Chat

- [ ] Criar `ChatLayout` próprio.
- [ ] Criar `ChatMenu` exclusivo.
- [ ] Ajustar lista de conversas para mobile.
- [ ] Ajustar thread para mobile.
- [ ] Criar botão de voltar no mobile.
- [ ] Criar empty state quando WhatsApp não estiver conectado.

### UX

- [ ] Revisar textos da interface.
- [ ] Criar estados de loading.
- [ ] Criar estados de erro.
- [ ] Criar estados vazios.
- [ ] Validar layout em celular pequeno.

---

## 21. Sugestão de ordem de execução

1. Refatorar estrutura de rotas autenticadas.
2. Criar `AppShell`, `AppHeader` e `AppSidebar`.
3. Mover status de WhatsApp e IA para o header simplificado.
4. Criar tela `/ia` com toggle.
5. Mover configurações de conta para `/settings/account`.
6. Mover conexão WhatsApp para `/settings/whatsapp`.
7. Refatorar chat para ter layout e menu próprios.
8. Ajustar responsividade mobile-first.
9. Revisar microcopy e estados vazios.
10. Fazer revisão final dos critérios de aceite.

---

## 22. Prompt complementar para implementar a refatoração

Use este prompt com o agente de desenvolvimento:

```text
Refatore a aplicação existente para a V1 com foco em mobile-first e separação clara de contextos.

Mudanças obrigatórias:

1. Criar um menu lateral global para navegação principal.
2. O menu lateral deve conter acesso a Chat, IA, WhatsApp, Conta e Logout.
3. No mobile, o menu lateral deve abrir como drawer a partir de botão no header.
4. No desktop, o menu lateral deve ficar fixo à esquerda.
5. O header deve ser simplificado e conter apenas:
   - botão de menu no mobile;
   - nome/logo curto do produto;
   - status de conexão do WhatsApp;
   - status da IA.
6. Remover do header ações como troca de senha, conexão WhatsApp e ativar/desativar IA.
7. Criar uma tela exclusiva `/ia` para o contexto da inteligência artificial.
8. Nesta V1, a tela de IA deve permitir apenas ativar e desativar a IA.
9. O status da IA deve ser refletido no header.
10. Mover configurações de usuário para `/settings/account`.
11. Mover conexão e reconexão do WhatsApp para `/settings/whatsapp`.
12. O chat deve ter um menu exclusivo/contextual, separado do menu lateral global.
13. Refatorar a tela de chat para funcionar bem em mobile:
    - lista de conversas primeiro;
    - ao tocar em uma conversa, abrir thread;
    - botão de voltar para a lista;
    - no desktop, lista e thread podem aparecer lado a lado.
14. Criar empty states, loading states e error states amigáveis.
15. Manter a regra de um único número de WhatsApp por usuário.
16. Não criar testes automatizados neste momento.
17. Não implementar configurações avançadas de IA agora.
18. Não expor tokens ou API keys no client.

Priorize clareza visual, UX mobile-first, componentes reutilizáveis e separação de responsabilidades.

Ao finalizar, atualize o README com a nova estrutura de navegação e descreva as telas da V1.
```

---

## 23. Recomendação final de produto

Para esta V1, a prioridade deve ser reduzir confusão operacional.

O usuário precisa responder rapidamente a três perguntas:

1. Meu WhatsApp está conectado?
2. A IA está ligada ou pausada?
3. Onde vejo minhas conversas?

A nova estrutura resolve isso bem:

- Header mostra os estados críticos.
- Menu lateral organiza os contextos.
- Chat fica focado em atendimento.
- IA fica em uma tela própria.
- Configurações deixam de competir com a operação diária.

Essa base deixa o produto pronto para evoluir depois para prompts customizados, horários de atendimento, múltiplos atendentes, funil de vendas, etiquetas e relatórios.
