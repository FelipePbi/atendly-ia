# Goal 077 — Fidelidade visual: Conversas e Notificações

**Status: ACCEPTED.** Preparado em 2026-09-29 pelo Tech Lead Agent após [Goal078 ACCEPTED](../reviews/078-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v96, com o mesmo ID e o mesmo título, dividida do 075; desde a v97, depois do 078. A v99 a marca READY e precisa o escopo com a evidência abaixo. A principal precisão: a espécie nova da central (NT-02) não é só contrato. `NotificationKind` é enum do Prisma no BFF (`apps/bff/prisma/schema.prisma:363`), então a espécie nova pede **uma migration aditiva** no BFF.

## Baseline aceita

Baseline aceita: `b0e42ad37c8669cd5df72682b9c10e40f576342c`

Goal anterior: 078 — Instruções privadas por serviço

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal078 já integrado em `main` (origem `efb893cc1a43e6493d5c020ea37a34e2b4f0366e`). A virada de status do documento do Goal078 para `ACCEPTED` entrou no próprio commit de fechamento. **Quatro rodadas**, com 3, 3, 3 e 0 blockers; só a rodada 1 teve blocker de código. **D-092** foi aceita e [FINAL_AUDIT §53](../FINAL_AUDIT.md) escrita sem reescrever §4 a §52. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review078](../reviews/078-review.md) e de FINAL_AUDIT §53 (execução final vigente, rodada 2 do Goal078): `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **109** arquivos e **1128** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **155** testes e **0** retentativas, rodado no IA Loop; `test:bff-integration` **59** arquivos e **455** testes. Backend que este Goal não toca: `test:ai-orchestrator` **1177** passando e **93** pulados de **1270**; `test:scheduling-service` **37** arquivos e **502** testes. A recontagem na baseline `b0e42ad`, feita pelo Developer antes da primeira edição, é o piso usado para comparar a execução final; se divergir destes números, o relatório diz por quê.

## Objetivo e posição

Fazer Conversas e a central de notificações baterem com os protótipos `Conversas-e-Chat.dc.html`, `Conversas-Tablet.dc.html`, `Conversas-Desktop.dc.html`, `Notificacoes.dc.html`, `Notificacoes-Tablet.dc.html` e `Notificacoes-Desktop.dc.html` (`docs/design-reference/claude-design/prototype/project/`), consultados só no chat aberto (K1) e nos estados NT1 (lista) e NT2 (vazio):

1. **Autoria discreta sob a bolha** (CV-05): "IA · 13:38" e "Você · 12:05" abaixo da bolha, no lugar de "<negócio> · IA" acima e "13:38 · resposta automática" e "Enviado" abaixo.
2. **A central é gaveta** (NT-01): no tablet e no desktop, o sino da Home abre uma gaveta de 440 px à direita, sobre a tela; no celular, o sino leva à central em tela própria. A rota `/notificacoes` continua existindo.
3. **O histórico registra os eventos do protótipo** (NT-02): a ativação da IA pelo teste real vira evento da central ("Sua IA está ativa"), e a condição resolvida diz como foi resolvida ("Resolvido às 09:14 · …"), em vez de repetir a instrução do problema aberto.

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **CV-05**, **NT-01** e **NT-02**. CV-01 a CV-03, NT-03 e NT-04 já foram corrigidos (Goals058, 070 e 067). O onboarding fiel ao protótipo é do Goal072, que vem depois deste.

## O que a evidência desta passada mostra

Conferido no código da baseline `b0e42ad`:

1. **A autoria da bolha é pesada.** `MessageBubble` (`apps/frontend/src/features/conversations/MessageTimeline.tsx:251-310`) monta `sender` como `${businessName} · IA`, "Você" ou o nome da pessoa (`:270`) e o põe **acima** da bolha (`:281`). Abaixo, a hora mais " · resposta automática" ou " · atendimento humano" (`:292-298`) e, para mensagem enviada, o `DeliveryBadge` com "Enviado", "Enviando…", "Não entregue" ou "Não confirmado" (`:208-249`), com "Tentar reenviar" só em `FAILED` (CV-05).
2. **A central é página.** `/notificacoes` (`apps/frontend/src/app/(platform)/notificacoes/page.tsx`) renderiza `NotificationsScreen`, com cabeçalho "Central de notificações", o histórico e a preferência de agendamento criado pela IA (`NotificationPreferenceSection`). O sino da Home (`HomeBell`, `features/dashboard/DashboardScreen.tsx:527-541`) é um `Link` para `/notificacoes`. A sidebar tem o item "Notificações" com contagem de não lidas (`shared/layout/AppShell.tsx:197-213`, `NOTIFICATIONS_DESTINATION` em `shared/layout/navigation.ts:74-83`), e o "Mais" do celular também (NT-01).
3. **Já existe um diálogo com variante gaveta.** `shared/ui/Dialog.tsx` tem `variant: "modal" | "sheet" | "drawer"`, foco no primeiro controle ao abrir, `Tab` preso no painel, `Escape` fecha e o foco volta a quem abriu.
4. **A central tem sete espécies, nenhuma de ativação.** `notificationKindSchema` (`packages/public-api-contract/src/schemas.ts:1023-1031`), a tabela `NOTIFICATION_SPECIES` (`apps/bff/src/modules/notifications/species.ts`) e o enum `NotificationKind` do Prisma (`apps/bff/prisma/schema.prisma:363-371`) têm as mesmas sete. Espécie nova pede migration aditiva no BFF (NT-02).
5. **A ativação acontece em dois caminhos do BFF, os dois com execução do teste real.** A autoativação em `reconcile` (`apps/bff/src/lib/ai-activation.ts:168-189`) grava `enabled: true` e `activatedByRunId: run.id` só com execução `SUCCEEDED` e ainda não consumida. O pedido humano `PATCH /v1/settings/ai` (`apps/bff/src/modules/settings/routes.ts:186-250`), na passagem desligada → ligada, exige execução válida (`getValidActivationRunOrRefuse`) e grava o mesmo `activatedByRunId`. Pausar grava a execução corrente como consumida, sem ligar.
6. **A condição resolvida repete a instrução do problema.** `notificationCopy` (`features/notifications/notificationViews.ts`) devolve, para `WHATSAPP_DISCONNECTED`, sempre "Reconecte o WhatsApp para a IA voltar a responder.", com ou sem `resolvedAt`; `NotificationRow` só acrescenta o selo "Resolvido" (`NotificationsScreen.tsx:171-181`). O histórico já mantém a condição resolvida: o motor da central resolve e reabre condições (`store.ts`, `reconcile.ts`), e a lista não as esconde.
7. **O gate autenticado já mede as duas telas.** `e2e/routes.ts` mede `/conversas` (`contentMarker: "Conversas"`) e `/notificacoes` (`contentMarker: "Central de notificações"`) nas cinco larguras. `authenticated-matrix.spec.ts` tem o bloco "reached by real click" (`:1339` em diante), em que um teste abre um destino por clique real. Nenhum teste renderizado abre o sino da Home hoje.

## Escolhas de desenho desta passada

- **Bolha (CV-05).**
  - Acima da bolha não há mais rótulo de autor.
  - Abaixo, uma linha discreta: "IA · 13:38" para `source === "AI"`, "Você · 12:05" para mensagem do dono (`OWNER` ou saída sem `source` de IA) e só a hora para a cliente. A autoria continua em texto, nunca só em cor.
  - `SENT` não ganha selo próprio. `PENDING` ("Enviando…"), `FAILED` ("Não entregue", com "Tentar reenviar") e `UNKNOWN` ("Não confirmado") continuam visíveis junto da bolha, com o mesmo texto e o mesmo `role="status"` de hoje. Falha de envio nunca fica escondida.
  - Os eventos da agenda no chat (Goal070) e o resto de `ConversationThread` não mudam.
- **Espécie nova `AI_ACTIVATED` (NT-02).**
  - Nível `INFO`, forma `EVENT`, na tabela de `species.ts`, no enum do Prisma por migration aditiva (`ALTER TYPE "NotificationKind" ADD VALUE 'AI_ACTIVATED'`), em `notificationKindSchema` e em `PUBLIC_API_V1.md`.
  - Nasce **só** na passagem desligada → ligada que grava `activatedByRunId` com uma execução do teste real, nos dois caminhos do item 5 da evidência. Nasce **na mesma transação** que grava `enabled: true`: ou as duas escritas acontecem, ou nenhuma.
  - Chave de dedupe `AI_ACTIVATED:run:<runId>`: uma notificação por execução do teste. Religar depois de pausar com a mesma execução não cria outra; um teste novo, depois de trocar o WhatsApp, cria.
  - `occurredAt` é o instante da ativação, gravado na mesma transação; `subjectId` é nulo; `payload` é vazio. Nenhum telefone, nem o do negócio: o protótipo mostra "+55 11 98765-4321", e a regra de `PUBLIC_API_V1.md` proíbe telefone no `payload`.
  - Pausar, desligar por troca de canal, conta em exclusão e religar com a execução já usada não criam notificação.
  - O motor da central (`reconcile.ts`) não ganha fonte nova: a espécie é escrita por quem ativa, não reconciliada.
- **Copy das espécies no frontend.**
  - `AI_ACTIVATED`: título "Sua IA está ativa"; descrição "Teste real concluído. A IA passou a atender pelo WhatsApp."; link para `/configuracoes/ia`.
  - Condição resolvida (`shape === "CONDITION"` e `resolvedAt` preenchido): a descrição passa a ser "Resolvido às HH:MM · <desfecho>", com a hora de `resolvedAt` no fuso do navegador, como o resto da central. Desfechos:
    - `WHATSAPP_DISCONNECTED`: "reconectado. A IA voltou a atender.";
    - `AI_UNAVAILABLE`: "a IA voltou a responder.";
    - `CUSTOMER_WAITING_HUMAN`: "a conversa foi atendida.";
    - `SETUP_INCOMPLETE`: "a configuração foi concluída.".
  - A condição resolvida aparece riscada ou esmaecida, como no protótipo, e continua com o selo "Resolvido" em texto.
- **O histórico.** Agrupado por dia de `occurredAt`: "Hoje", "Ontem" e, antes disso, a data curta ("15/09"). A ação "Marcar todas como lidas" pode passar a "Marcar lidas", como no protótipo. O nível de cada notificação continua legível sem cor: a forma do marcador muda por nível, e cada linha tem nome acessível com o nível ("Crítica", "Atenção", "Informativa"). O rótulo visível do nível pode sair se a forma e o nome acessível ficarem.
- **Gaveta (NT-01).**
  - Um componente da central, usado pela página e pela gaveta, com a mesma lista, a mesma leitura de `GET /v1/notifications` e as mesmas mutações de hoje.
  - A partir de 768 px, o sino da Home abre a gaveta: `Dialog` com `variant="drawer"`, 440 px de largura à direita, sobre a tela, com fundo escurecido, título "Notificações", "Marcar lidas" e botão de fechar com nome acessível "Fechar". `Escape`, o botão e o clique no fundo fecham, e o foco volta ao sino. Nenhuma navegação: a URL continua a da Home.
  - Abaixo de 768 px, o sino continua sendo link para `/notificacoes`, a central em tela própria, como no `Notificacoes.dc.html` do celular.
  - O item "Notificações" da sidebar continua, com a contagem de não lidas, e abre a mesma gaveta em vez de navegar. Motivo: o vault põe notificações na topbar do notebook e do desktop (`00-Produto/04-Navegacao-e-Modulos.md`), a área logada não tem topbar e o sino só existe na Home; tirar o item deixaria a central inalcançável fora da Home. **Divergência declarada** frente à sidebar do protótipo, que não tem o item, para a conferência humana do §7.
  - No "Mais" do celular, o item continua levando a `/notificacoes`.
  - A preferência de agendamento criado pela IA (`NotificationPreferenceSection`) fica só na página `/notificacoes`. A gaveta tem, no rodapé, um link para `/notificacoes` com o texto "Preferências de notificação".
  - `/notificacoes` continua com o cabeçalho "Central de notificações", que é o `contentMarker` do gate.
  - A animação de entrada da gaveta não roda com `prefers-reduced-motion: reduce`.
- **Sem mudança** no motor da central, na retenção de 90 dias, nas outras seis espécies, nas rotas de notificação, no banner persistente, na preferência nem na Home fora do sino.

## Fora do escopo

- O banner crítico sobre a lista de Conversas e o estado "IA sem conexão" por linha (NT3 do protótipo); o vazio "IA ativa · tudo em ordem" com o sino animado (NT2), além do texto de vazio que já existe; o sino fora da Home.
- A ação por notificação do protótipo ("Abrir conversa", "Corrigir em Serviços"): o link de cada linha continua o de `notificationCopy`.
- Notificação de pendência de serviço sem duração ("Design de sobrancelha está sem duração"): não é espécie do vault nem achado da revisão local.
- As observações do [review078](../reviews/078-review.md): a 1 e a 2 são do formulário de Serviços, que este Goal não toca, e seguem candidatas para quando outro Goal tocar o formulário; a 3 a 6 são registro.
- O onboarding (Goal072).
- `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `scripts/` e `tools/ia-loop/`.

## Dependências e contexto mínimo

- Goal078 ACCEPTED (baseline acima). O Goal017 fez o chat e o estado de envio, o Goal022 a central e o motor, o Goal063 a ativação só depois do teste real, o Goal070 os eventos da agenda no chat e o Goal074 o sino da Home.
- Arquivos de partida: `apps/frontend/src/features/conversations/MessageTimeline.tsx`; `features/notifications/NotificationsScreen.tsx`, `notificationViews.ts`, `NotificationPreferenceSection.tsx`; `features/dashboard/DashboardScreen.tsx` (`HomeBell`); `shared/layout/AppShell.tsx`, `navigation.ts`; `shared/ui/Dialog.tsx`; `apps/bff/src/modules/notifications/species.ts`, `store.ts`; `apps/bff/src/lib/ai-activation.ts`; `apps/bff/src/modules/settings/routes.ts`; `apps/bff/prisma/schema.prisma`; `packages/public-api-contract/src/schemas.ts`; `apps/bff/PUBLIC_API_V1.md`.
- Testes de partida: `apps/bff/tests/goal022-notification-*.ts`, `goal019-ai-activation-reconciliation.integration.test.ts`, `goal063-ai-activation.integration.test.ts`; `apps/frontend/tests/goal022-notifications-*.test.tsx`, `goal017-delivery-state.test.tsx`, `goal017-chat-media.test.tsx`, `goal017-shell-invariant.test.tsx`, `goal074-home.test.tsx`.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Espécie `AI_ACTIVATED`, migration, dedupe e escrita na ativação | `apps/bff/prisma/schema.prisma`, `apps/bff/prisma/migrations/<timestamp>_goal077_notification_ai_activated/`, `apps/bff/src/modules/notifications/species.ts`, `apps/bff/src/lib/ai-activation.ts`, `apps/bff/src/modules/settings/routes.ts` |
| Contrato | `packages/public-api-contract/src/schemas.ts`, `apps/bff/PUBLIC_API_V1.md` |
| Copy, resolvido, agrupamento por dia e nível sem cor | `apps/frontend/src/features/notifications/` |
| Gaveta, sino e item da sidebar | `features/notifications/`, `features/dashboard/DashboardScreen.tsx`, `shared/layout/AppShell.tsx`, `shared/styles/` |
| Bolha | `features/conversations/MessageTimeline.tsx`, `shared/styles/` |
| Testes | `apps/bff/tests/goal077-*.test.ts`, `apps/frontend/tests/goal077-*.test.tsx`, um teste novo em `apps/frontend/e2e/authenticated-matrix.spec.ts` |

## Escopo obrigatório

### 1. A espécie `AI_ACTIVATED` no BFF e no contrato (NT-02)

- Migration aditiva e espécie conforme as escolhas de desenho. `prisma migrate diff` do BFF não mostra drift depois da migration.
- A escrita da notificação e a de `enabled: true` ficam na mesma transação, nos dois caminhos de ativação.
- `notificationKindSchema` e `PUBLIC_API_V1.md` listam a espécie, com nível, forma e a regra de `payload` vazio.

### 2. A central: copy, resolvido e histórico (NT-02)

- Copy de `AI_ACTIVATED`, desfecho da condição resolvida, agrupamento por dia e nível legível sem cor, conforme as escolhas de desenho.

### 3. A gaveta (NT-01)

- Gaveta, sino, item da sidebar, "Mais", página `/notificacoes` e preferência, conforme as escolhas de desenho.

### 4. A bolha (CV-05)

- Autoria abaixo da bolha e estado de envio, conforme as escolhas de desenho.

### 5. O gate renderizado

- `/conversas` e `/notificacoes` continuam medidas pelo gate autenticado dentro de `validate:integration`, nas cinco larguras. As rotas públicas continuam medidas por `validate:ui`. Nenhuma rota entra ou sai.
- **Um teste novo**, e só ele, entra em `apps/frontend/e2e/authenticated-matrix.spec.ts`, no bloco "reached by real click":
  - em cada largura, abre `/inicio` e clica no sino;
  - em 360 e 390, espera o caminho `/notificacoes` e o cabeçalho "Central de notificações";
  - em 768, 1024 e 1440, espera um `role="dialog"` com o título "Notificações" e o caminho ainda `/inicio`, mede overflow horizontal e alvos de toque com os auxiliares de `e2e/measure.ts`, aperta `Escape` e espera o diálogo fechado e o foco de volta no sino.
- Nenhuma asserção existente do spec muda; `e2e/routes.ts` não muda.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela, sem desligar medida. O sino, "Fechar", "Marcar lidas", cada linha e "Tentar reenviar" são alvos de toque e precisam de pelo menos 24 px. A linha discreta de autoria da bolha precisa passar no contraste computado do gate.

### 6. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `b0e42ad`. Testes do BFF em `apps/bff/tests/goal077-*.test.ts` (integração com banco real onde tocar Prisma); testes do frontend em `apps/frontend/tests/goal077-*.test.tsx` (jsdom), com o serviço de dados dublado como nos testes do Goal022.

BFF:

1. A autoativação por execução `SUCCEEDED` cria exatamente uma notificação `AI_ACTIVATED`, `INFO`, `EVENT`, com `payload` vazio e `subjectId` nulo, visível em `GET /v1/notifications` do negócio e não visível para outro negócio.
2. Reconciliar de novo com a mesma execução não cria outra.
3. `PATCH /v1/settings/ai` desligada → ligada com execução válida cria a notificação; pausar não cria; religar com a mesma execução não cria outra.
4. Desligar por troca de canal, conta em exclusão e ativação recusada (sem execução válida, sem serviço operacional) não criam notificação.
5. Uma falha forçada na escrita da notificação desfaz o `enabled: true` da mesma passada: nenhuma das duas escritas fica.

Frontend:

6. `AI_ACTIVATED` mostra "Sua IA está ativa" e "Teste real concluído. A IA passou a atender pelo WhatsApp.", sem telefone.
7. `WHATSAPP_DISCONNECTED` resolvida mostra "Resolvido às HH:MM · reconectado. A IA voltou a atender." e não mostra "Reconecte o WhatsApp"; aberta, continua mostrando "Reconecte o WhatsApp…". O mesmo vale para os desfechos das outras três condições.
8. O histórico agrupa em "Hoje", "Ontem" e data curta, e cada linha tem nome acessível com o nível.
9. Na largura de tablet ou desktop dublada, o sino abre um `role="dialog"` "Notificações" sem mudar a rota; `Escape` fecha e devolve o foco ao sino; o item "Notificações" da sidebar abre a mesma gaveta. Na largura de celular, o sino é link para `/notificacoes`. A gaveta tem o link "Preferências de notificação" para `/notificacoes`.
10. A bolha da IA mostra "IA · <hora>" abaixo da bolha, e não mostra o nome do negócio, "resposta automática" nem "Enviado"; a do dono mostra "Você · <hora>"; a da cliente só a hora.
11. `FAILED` continua mostrando "Não entregue" e "Tentar reenviar"; `UNKNOWN`, "Não confirmado"; `PENDING`, "Enviando…".

Os testes existentes continuam passando. Só muda asserção que dependa de texto ou composição trocados aqui: por exemplo, "resposta automática" e "Enviado" nos testes do Goal017, o `href` do sino no `goal074-home.test.tsx` e o item da sidebar como link no `goal022-notifications-chrome.test.tsx`. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual. As asserções de estado de envio, de reenvio, de axe, de guarda por fonte e da invariante da casca (D-030, D-031) não podem ser apagadas; podem mudar de seletor.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório, com a rodada de origem de cada um:

1. A chave de dedupe de `AI_ACTIVATED` passa a incluir o instante: o teste 2 ou o 3 reprova.
2. A notificação passa a ser escrita também ao pausar: o teste 3 reprova.
3. A notificação sai da transação e é escrita depois do `upsert`: o teste 5 reprova.
4. O `payload` passa a levar o telefone do vínculo: o teste 1 ou o 6 reprova.
5. A descrição da condição resolvida volta a ignorar `resolvedAt`: o teste 7 reprova.
6. O sino volta a ser link em qualquer largura: o teste 9 reprova.
7. A bolha da IA volta a mostrar "<negócio> · IA" acima: o teste 10 reprova.
8. `FAILED` deixa de mostrar "Tentar reenviar": o teste 11 reprova.

### 8. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-093** em `PROPOSED`, no formato de D-085 a D-092. Ela diz:
  - a espécie `AI_ACTIVATED`: nível, forma, dedupe por execução, escrita na mesma transação da ativação, os dois caminhos, o `payload` vazio e a migration aditiva;
  - o desfecho da condição resolvida por espécie;
  - a gaveta a partir de 768 px, a tela própria no celular, o item da sidebar abrindo a gaveta com a divergência declarada frente ao protótipo, e a preferência só na página;
  - a autoria discreta da bolha e os estados de envio que continuam visíveis.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§54**, sem reescrever §4 a §53. Registra CV-05, NT-01 e NT-02 corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, a migration, o teste novo do gate, a conferência humana pendente e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md`, conforme o §1.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§53 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada (observação 6 do review069; rodadas 2 e 3 do review078).

**Ordem obrigatória, a mesma dos Goals065 a 078:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os oito controles do §7.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos e a prosa é reescrita no lugar (rodadas 1 e 2 do review076, rodada 1 do review078). **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Documento não afirma blocker corrigido antes de a correção ser executada e conferida. Antes de entregar uma rodada de correção, rode um grep, nos documentos do §8, de cada frase que o review apontou como falsa, e cole o resultado vazio no relatório.

### 9. O que só uma pessoa confere

- Que o chat aberto e a central, percorridos num aparelho real nas cinco larguras, batem com os seis protótipos do Objetivo.
- Que a linha "IA · 13:38" é discreta e ainda legível, e que a gaveta de 440 px sobre a Home lê bem no tablet.
- Que manter o item "Notificações" na sidebar, abrindo a gaveta, é aceitável frente à sidebar do protótipo, que não o tem.
- Que "Sua IA está ativa" aparece no histórico depois de um teste real de verdade, num WhatsApp real.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 10. O que este Goal não pode fazer

- Só toca `apps/frontend/`, `apps/bff/`, `packages/public-api-contract/` e os documentos do §8. Não toca `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `scripts/`, `tools/ia-loop/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Uma migration só: a aditiva do enum `NotificationKind` no BFF. Nenhuma outra mudança de `schema.prisma`, em nenhum serviço, e nenhuma rota nova.
- Não muda configuração de teste: `vitest.config.*`, `playwright.config.*` e `e2e/routes.ts` ficam como estão. Em `e2e/authenticated-matrix.spec.ts`, só o acréscimo do teste do §5; nenhuma linha existente muda. Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.
- Não põe telefone, credencial nem identificador do vínculo no `payload` de notificação.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A ativação da IA com execução do teste real cria uma notificação `AI_ACTIVATED` por execução, na mesma transação da ativação, só no negócio da sessão e sem telefone; pausar, religar com a mesma execução, desligar por troca de canal e ativação recusada não criam. Provado pelos testes §6.1 a §6.5 dentro de `validate:integration`.
2. A migration é aditiva e o `migrate diff` do BFF não mostra drift. Provado por execução dentro de `validate:integration`.
3. A central mostra a copy de `AI_ACTIVATED`, o desfecho da condição resolvida, o agrupamento por dia e o nível sem depender de cor. Provado pelos testes jsdom §6.6 a §6.8.
4. A partir de 768 px o sino e o item da sidebar abrem a gaveta sem navegar, com foco preso e devolvido; abaixo de 768 px o sino leva a `/notificacoes`; a preferência continua alcançável. Provado pelo teste jsdom §6.9 e pelo teste novo do gate autenticado do §5, com **0** retentativas.
5. A bolha tem a autoria discreta abaixo, e os estados de envio que exigem ação continuam visíveis. Provado pelos testes jsdom §6.10 e §6.11.
6. Largura, toque, contraste, foco e movimento de `/conversas`, `/notificacoes` e da gaveta aberta sobre `/inicio` são decididos pelo gate autenticado dentro de `validate:integration`; os das rotas públicas, por `validate:ui`. A fidelidade ao protótipo não é provada por teste; fica no §9.
7. Os oito controles negativos do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
8. Typecheck e lint de `apps/bff` e `apps/frontend` passam. `test:frontend` e `test:bff-integration` não têm teste a menos que a recontagem da baseline (referência: **109**/**1128** e **59**/**455**); `test:gate` não tem teste a menos que **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **156** testes (os **155** da baseline mais o novo) e **0** retentativas. Provado por execução.
9. D-093 em `PROPOSED`, FINAL_AUDIT §54, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos depois da execução final e dos controles, trazem as contagens da execução final e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
10. `git status --porcelain=v1 -uall` lista só arquivos dos diretórios do §10 e os documentos do §8, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que Conversas e a central batem com os protótipos aprovados (conferência humana);
- que a notificação aparece depois de um teste real num WhatsApp real (conferência humana);
- o banner crítico sobre Conversas e o vazio animado do protótipo (fora do escopo);
- a fidelidade visual do onboarding (Goal072).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | BFF e contrato: migration, espécie `AI_ACTIVATED`, escrita transacional nos dois caminhos de ativação e `PUBLIC_API_V1.md`, com testes §6.1 a §6.5 (§1) |
| WU-02 | STANDARD | WU-01 | Central: copy de `AI_ACTIVATED`, desfecho da condição resolvida, agrupamento por dia e nível sem cor, com testes §6.6 a §6.8 (§2) |
| WU-03 | STANDARD | WU-02 | Gaveta, sino, item da sidebar, "Mais" e preferência, com o teste §6.9 e o teste novo do gate autenticado (§3, §5) |
| WU-04 | STANDARD | — | Bolha: autoria discreta e estados de envio, com testes §6.10 e §6.11 (§4) |
| WU-05, WU-06 | DETERMINISTIC | WU-01…WU-04 | typecheck de `apps/bff` e `apps/frontend` |
| WU-07, WU-08 | DETERMINISTIC | WU-01…WU-04 | lint de `apps/bff` e `apps/frontend` |
| WU-09 | DETERMINISTIC | WU-02, WU-03, WU-04 | testes dirigidos de `apps/frontend` com o filtro `goal077` |
| WU-10 | DETERMINISTIC | WU-02, WU-03 | testes dirigidos de `apps/frontend` com o filtro `goal022-notifications` |
| WU-11 | DETERMINISTIC | WU-04 | testes dirigidos de `apps/frontend` com o filtro `goal017` |
| WU-12 | DETERMINISTIC | WU-01 | testes dirigidos de `apps/bff` com o filtro `goal022-notification` |
| WU-13 | DETERMINISTIC | WU-05…WU-12 | validate-core |
| WU-14…WU-16 | DETERMINISTIC | WU-13 | gate-tests, validate-ui e validate-integration |
| WU-17 | STANDARD | WU-14, WU-15, WU-16 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-18 | DETERMINISTIC | WU-17 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular. Os testes de integração do BFF (`goal077` e os do Goal022 que tocam banco) dependem de `*_TEST_DATABASE_URL`; se a unidade dirigida os pular, a prova deles é a execução dentro de `validate:integration`, e o relatório diz qual execução rodou cada um.

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
