# Goal 124 — Desconectar o WhatsApp, reduzir a retenção e excluir a conta iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal123 ACCEPTED](../reviews/123-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: W2, R2, Mais-WhatsApp:C2

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v148**, inserida depois do 123, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 123. As telas de acesso ficaram sem quadro sem alvo. Configurações tem o grupo seguinte de quadros sem alvo em telas que já existem: W2, R2 e C2 são as três confirmações de ação com consequência (desconectar o WhatsApp, reduzir a retenção e excluir a conta). O W3 fica fora porque pede uma leitura da lista de contatos ignorados que o contrato não tem (D-118, divergência 5).

**Código do quadro C2.** `C2` existe em `Conversas-e-Chat.dc.html` ("Conversas · Não classificadas") e em `Mais-WhatsApp-Importacao-Conta.dc.html` ("Conta · excluir"). Este Goal trata só o segundo. Na linha acima ele aparece como `Mais-WhatsApp:C2`, como o `Mais-WhatsApp:C1` do Goal104: `selectRuns` de `visual-compare.mjs` desambigua pelo começo do nome do arquivo (`--target Mais-WhatsApp:C2`).

## Baseline aceita

Baseline aceita: `7e5de46dd5320f7b54032865c53ceb173408183e`

Goal anterior: 123 — Entrar com erro, nova senha e senha redefinida iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal123 já integrado em `main` (origem `3d8e2779f413e8ef47b18b8de24784103e14121c`). Foi **uma rodada**: o review DEEP terminou `CHANGES_REQUIRED` com 1 blocker só de documentação. O IA Loop aceitou a rodada e adiou a correção para o fechamento, onde ela foi aplicada só em `docs/migration/`. **D-137** foi aceita: o erro de credenciais no campo "Senha", a lista de três regras abaixo de "Nova senha", a confirmação "Senha redefinida" e `POST` em `responses` só em alvo público sob `/v1/auth/`. A última contagem aceita: frontend **169** arquivos e **2173** testes, `goal123` **13**, `visual-responses.test.mjs` **46**, `test:gate` **279**, `validate:core` 17 passos com 15 passando e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, sem retentativa, `validate:integration` **36** de 36 passos, com o gate autenticado em **275** de primeira e 0 retentativas. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a confirmação de desconectar o WhatsApp fica igual ao quadro W2, a confirmação de reduzir a retenção fica igual ao quadro R2 e a exclusão da conta fica igual ao quadro C2 de Configurações, nos quatro devices**, salvo as divergências declaradas. W1, R1 e C1 continuam iguais à captura de antes. Nenhum pedido ao BFF muda.

**Por que agora.** A fila não tem Goal PLANNED. `targets.json` tem 79 alvos, e 34 dos 113 quadros continuam sem alvo. Os que restam fora de Configurações pedem outra decisão: S1b (cor livre fora de `colorToken`), S5, S6, S8 e S9 (composição de D-114 e guarda de navegação), CL8 e CL9 (outra tela e leitura parada), H6 e NT3 (sinal de IA instável que não existe), NT2 e as etapas do onboarding. Em Configurações, W2, R2 e C2 são estados de telas que já existem, com gravações que já existem e nenhum contrato novo. As três são as ações de Configurações em que errar custa mais: a IA para, mensagens somem ou a conta é apagada. O quadro de cada uma explica a consequência antes do toque.

## O que a evidência desta passada mostra

Conferido no código da baseline `7e5de46` e em `docs/design-reference/claude-design/prototype/project/Mais-WhatsApp-Importacao-Conta.dc.html` (com `Configuracoes-Tablet.dc.html` em Portrait e Landscape e `Configuracoes-Desktop.dc.html`, que têm os três quadros).

1. **W2 — Desconectar · confirmação.** No mobile, uma folha de baixo sobre o W1 esmaecido; no tablet, um diálogo centrado de 480 px; no desktop, de 440 px. Mesma casca do K5 e do K6 (D-129 e D-130). A folha tem:
   - o título "Desconectar o WhatsApp?" e o texto "O número +55 11 98765-4321 deixa de estar ligado à Avenly.";
   - três linhas com ícone: o anel cortado em `#B3392E` com "**Sua IA para de atender** na hora. Ninguém recebe resposta automática."; o check em `#DFEFE4`/`#2E7D4F` com "**Clientes, agenda e histórico** de conversas continuam na Avenly."; e o check com "Para voltar, basta conectar de novo e refazer o teste de 3 minutos.";
   - "Desconectar" (fundo `#B3392E`) e "Manter conectado" (borda `#D6CEC2`), os dois com 52 px de altura.

   O app (`disconnectDialog` em `features/whatsapp/WhatsAppConnectionPanel.tsx`) mostra um `Dialog` modal com o sobretítulo "Interrupção do serviço", o título "Desconectar WhatsApp?", "A Avenly deixará de responder automaticamente assim que a desconexão for concluída." e os botões "Manter conectado" e "Desconectar WhatsApp". O mesmo diálogo serve Configurações (pelo `openDisconnectDialog` de `renderConnected`, D-118 (c)) e o "Desconectar número" do onboarding.
2. **O que o W2 promete é verdade, salvo a duração.** Desconectar desliga a IA na hora. O contrato diz que reconectar ou trocar o WhatsApp volta a exigir o teste real (`PUBLIC_API_V1.md`, `ACTIVATION_TEST_AI_ALREADY_ACTIVE`). Clientes, agenda e conversas não são apagados pela desconexão. Nenhuma tela do app promete "3 minutos" para o teste (`grep` em `features/activation-test`, `features/onboarding` e `features/whatsapp`).
3. **R2 — Reduzir retenção · confirmação.** A mesma casca do W2, sobre o R1 com "30 dias" marcado em "Conversas comerciais". A folha tem:
   - o título "Guardar conversas comerciais por 30 dias?";
   - o texto "Mensagens com mais de 30 dias serão removidas — hoje isso alcança **86 conversas**. Elas continuam na lista, com a indicação de que as mensagens antigas expiraram.";
   - a nota em 13 px e `#716859`: "Clientes, agendamentos e histórico de atendimentos não mudam.";
   - "Reduzir para 30 dias" em tinta (`#221E1A`, não vermelho; a nota do quadro diz "não é a única ação vermelha do produto") e "Manter 90 dias".

   O app (`RetentionSection.tsx`) mostra um `Dialog` modal com o sobretítulo "Redução de prazo", o título "Reduzir retenção {categoria}?" (ou "Reduzir os prazos de retenção?" com as duas), o texto da próxima varredura e "Não há como recuperá-las depois.", e os botões "Manter prazo atual" e "Reduzir prazo" (`btn-danger`).
4. **O R2 tem uma contagem que o contrato não dá.** `GET /v1/settings/retention` traz os prazos, `retentionDaysOptions` e `unclassifiedRetentionFollows`. Nenhuma rota diz quantas conversas o novo prazo alcança. Reduzir Comercial também encurta as Não classificadas (`unclassifiedRetentionFollows: "COMMERCIAL"`), e o R1 já diz isso. A conversa expirada continua na lista: `contentExpiredThrough` e "Mensagens antigas expiraram" em `MessageTimeline.tsx`. O pedido de redução vai com `confirmReduction: true` só depois da confirmação; até lá nada é enviado.
5. **C2 — Excluir conta.** Uma tela própria, não folha. No mobile, tela empurrada com "‹", o título "Excluir conta" no cabeçalho e o rodapé fixo. No tablet e no desktop, o detalhe de Configurações com "Conta" marcada na lista. A tela tem:
   - o `h1` "Excluir sua conta na Avenly?" (Literata 26 px) e "Você tem 7 dias para mudar de ideia. Depois disso, a exclusão é definitiva.";
   - a linha do tempo em três passos com círculo numerado de 26 px: "Hoje" ("Sua IA para de atender e o WhatsApp é desconectado. Nenhum cliente recebe aviso."), "Próximos 7 dias" ("Para desistir, basta entrar de novo e tocar em “Cancelar exclusão”. Ao voltar, você reconecta o WhatsApp e refaz o teste.") e "Em 25 de setembro", em `#8A2A21` com círculo `#F8E2DE` ("Clientes, agenda, serviços e conversas são apagados de forma definitiva.");
   - o campo "Confirme com sua senha";
   - no rodapé, "Excluir minha conta", em cinza `#B9B1A6` enquanto a senha está vazia (a nota diz "O botão vermelho só ativa depois da senha"), e "Voltar".

   O app (`AccountSettings.tsx`) abre, pela linha "Excluir conta" de `AccountDeletionSection`, um `Dialog` modal com "Excluir sua conta?", uma lista de quatro itens, "Senha atual" e os botões "Cancelar" e "Pedir exclusão", este sempre habilitado.
6. **O que o C2 promete é verdade.** `POST /v1/account/deletion` com a senha correta agenda a exclusão em `SCHEDULED`, com `dueAt` sete dias à frente. Desliga a IA na mesma transação e tenta desconectar o WhatsApp. Cancelar não religa nada: voltar exige reconectar e refazer o teste real (`PUBLIC_API_V1.md`, seção do `DELETE`). A data do terceiro passo não existe antes do pedido: `accountDeletion.dueAt` é `null` com `status: "NONE"`.
7. **Rotas e captura.** `/configuracoes/agenda/regras` (AG3, D-116) já é uma sub-rota de Configurações com cenário próprio em `ProductSettingsScreen` e com "Agenda" marcada (`openHrefFor`). `e2e/routes.ts` lista `/configuracoes/conta` em `AUTHENTICATED_ROUTES`, e o gate autenticado mede essa rota. O W1 já tem `responses` com `GET /v1/whatsapp` conectado. O R1 e o C1 não têm `responses`. `visual-compare.mjs` aceita `steps` com `clickRole`, `fill`, `press` e `waitFor`, e `responses` só intercepta o método e o caminho declarados. Um `PATCH` ou um `POST` que um passo dispare chega ao BFF de verdade e grava na conta visual.
8. **Testes existentes que afirmam o que muda.**
   - `goal106-whatsapp.test.tsx`: o diálogo de "Desconectar WhatsApp".
   - `goal023-retention-settings.test.tsx`, `goal024-settings-shell-invariant.test.tsx` e `goal104-ia-conversas-e-conta.test.tsx`: os textos da redução.
   - `goal025-account-deletion-screen.test.tsx`, `goal023-conversations-settings.test.tsx`, `goal024-account-sessions.test.tsx`, `goal064-greeting-and-account.test.tsx` e de novo `goal024-settings-shell-invariant.test.tsx` e `goal104-ia-conversas-e-conta.test.tsx`: o diálogo de exclusão.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS de cada quadro (valores inline de px, cor, fonte, raio e espaçamento), em cada device: `Mais-WhatsApp-Importacao-Conta.dc.html` no mobile, `Configuracoes-Tablet.dc.html` em Portrait e Landscape, `Configuracoes-Desktop.dc.html` no desktop. A casca de Configurações (D-103, D-116) não muda. O CSS novo fica em `shared/styles/avenly-settings.css`, sem mudar o visual de W1, R1, C1 e das outras telas de Configurações.
2. **Casca das duas folhas.** W2 e R2 usam a casca de folha que já existe para o K5 e o K6 (`ChatSheetShell`, exportada de `features/conversations/ConversationActionsSheet.tsx`, D-129 e D-130). O Developer pode importá-la de lá ou movê-la para `shared/ui/` sem mudar o markup nem o comportamento, com o K5 e o K6 iguais à captura de antes. A casca dá folha de baixo abaixo de 768 px, diálogo centrado de 480 px no tablet e de 440 px no desktop, como nos quadros. Se `ChatSheetShell` não servir fora do chat sem mudança de comportamento, o Developer usa `Dialog` com `variant="sheet"` e CSS próprio para o diálogo centrado, e registra o motivo em D-138. Nenhuma casca nova.
3. **W2.**
   - O diálogo de desconexão de `WhatsAppConnectionPanel` passa a ter o título "Desconectar o WhatsApp?", sem sobretítulo.
   - O texto passa a "O número {telefone} deixa de estar ligado à Avenly.", com o telefone de `formatBrazilianPhone` no modo `"plus"`, como o W1. Sem `phoneNumber`, o texto é "Seu número deixa de estar ligado à Avenly.".
   - As três linhas com os ícones do quadro: o anel cortado é o mesmo desenho do estado "desconectado" da Home, se o app já o tiver; se não, o Developer porta o do quadro.
   - A terceira linha fica "Para voltar, basta conectar de novo e refazer o teste.", sem "de 3 minutos" (evidência 2), como divergência declarada.
   - Os botões ficam na ordem e na cor do quadro: "Desconectar" em vermelho e "Manter conectado".
   - Confirmar chama o mesmo `disconnect()` de hoje, uma vez. A falha mostra a mensagem de hoje em `role="alert"`. "Desconectando..." continua no botão durante o pedido. O mesmo diálogo vale no onboarding, que não ganha alvo novo. "Trocar número?" não muda.
4. **R2.**
   - Com só Comercial reduzida, o título é "Guardar conversas comerciais por {novo} dias?". Com só Pessoal, "Guardar conversas pessoais por {novo} dias?". `{novo}` usa o rótulo da opção de R1 ("1 ano" para 365, "{n} dias" para o resto).
   - O texto é "Mensagens com mais de {novo} serão removidas. Elas continuam na lista, com a indicação de que as mensagens antigas expiraram.", sem a contagem (evidência 4), como divergência declarada.
   - Com Comercial reduzida, o texto ganha "As Não classificadas seguem o mesmo prazo.", porque reduzir Comercial também as alcança. É divergência declarada do texto do quadro, e é regra (`unclassifiedRetentionFollows`).
   - A nota "Clientes, agendamentos e histórico de atendimentos não mudam." fica em 13 px e `#716859`.
   - Os botões são "Reduzir para {novo}", em tinta (`#221E1A`), e "Manter {atual}".
   - Com as duas categorias reduzidas, o título é "Reduzir os dois prazos?". O texto diz o novo prazo de cada uma, na mesma composição, e os botões são "Reduzir os dois prazos" e "Manter os prazos atuais". O Developer registra o texto exato em D-138.
   - O corpo do `PATCH` (`confirmReduction: true` só depois de confirmar), o fluxo sem redução e o "Salvar" do R1 não mudam.
5. **C2 como rota própria.**
   - `/configuracoes/conta/excluir` é uma rota nova (`app/(platform)/configuracoes/conta/excluir/page.tsx`), com cenário novo em `SettingsScenario` e "Conta" marcada na lista de 1024 px em diante (`openHrefFor`), como o AG3.
   - Abaixo de 1024 px, é tela empurrada com "‹" para `/configuracoes/conta` e o rodapé fixo do quadro. Continua **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031).
   - Em C1, a linha "Excluir conta" de `AccountDeletionSection` (estado sem pedido ou cancelado) passa a ser um link para a rota, com a mesma aparência de hoje. O diálogo "Excluir sua conta?" sai. Os estados agendado, excluído, carregando e indisponível de `AccountDeletionSection` e o diálogo "Cancelar exclusão" não mudam.
6. **C2: o que a tela mostra.**
   - O `h1`, o texto e a linha do tempo do quadro.
   - O terceiro passo diz "Em {dia} de {mês}". A data é a de hoje mais sete dias, no fuso do negócio (`settings.business?.timezone ?? "America/Sao_Paulo"`, como o W1). `ProductSettingsScreen` passa `settings` à tela, como D-118 (d) fez com `WhatsAppSettings`. É uma previsão: o vencimento que vale é o `dueAt` do servidor, que a tela de Conta mostra depois do pedido.
   - O campo "Confirme com sua senha" é o `Password` de hoje, com "Mostrar senha".
   - "Excluir minha conta" fica desabilitado enquanto a senha está vazia e vermelho quando tem texto.
   - "Voltar" leva a `/configuracoes/conta` sem enviar nada.
7. **C2: o que não muda no pedido.**
   - Enviar chama o mesmo `account.requestDeletion(password)`, uma vez.
   - O `401` mostra "Senha atual incorreta." e o resto mostra "Não foi possível pedir a exclusão agora. Tente novamente.", em `role="alert"`, como hoje.
   - Durante o pedido, o botão diz "Pedindo exclusão..." e fica desabilitado.
   - No sucesso, a tela relê `GET /v1/status` (`refresh` de `useSystemStatus`, como hoje) e vai para `/configuracoes/conta` com `replace`. Lá a pessoa vê "Exclusão da conta agendada".
8. **C2: estados da rota.** A tela só mostra o formulário com `accountDeletion.status` `NONE` ou `CANCELLED`. Enquanto a primeira leitura não chegou, mostra o carregando de hoje e nunca o formulário, a mesma regra de `AccountDeletionSection` ("nunca assume sem pedido"). Com a leitura falhada, mostra a mensagem de hoje, sem formulário. Com `SCHEDULED` ou `PURGED`, vai para `/configuracoes/conta` com `replace`.
9. **Alvos.** `targets.json` ganha W2, R2 e C2, os três de `Mais-WhatsApp-Importacao-Conta.dc.html`, com sessão:
   - W2: rota `/configuracoes/whatsapp`, a mesma `responses` do W1 (`GET /v1/whatsapp` conectado), e `steps` que tocam a linha "Desconectar WhatsApp" e esperam "Desconectar o WhatsApp?";
   - R2: rota `/configuracoes/conversas`, `responses` com `GET /v1/settings/retention` (Comercial 90, Pessoal 30, `retentionDaysOptions` e `unclassifiedRetentionFollows` como o BFF devolve), e `steps` que marcam "30 dias" em "Conversas comerciais", tocam "Salvar" e esperam "Guardar conversas comerciais por 30 dias?";
   - C2: rota `/configuracoes/conta/excluir`, sem `steps` e sem `responses`; a conta visual não tem exclusão pedida.

   Os passos não são `optional`. **Nenhum passo toca o botão que confirma**: "Desconectar", "Reduzir para…" ou "Excluir minha conta". `responses` só cobre `GET`, e um toque desses gravaria de verdade na conta visual. Se o `:hover` do último toque escurecer um botão que o quadro mostra claro, o Developer usa a mesma saída do L2 (teclado em vez de clique) e registra nas `notes`. As `notes` de cada alvo citam as divergências declaradas.
10. **Gate autenticado.** `e2e/routes.ts` ganha `/configuracoes/conta/excluir` em `AUTHENTICATED_ROUTES`, com `sessionMarker: "configuracoes"` e `contentMarker` no `h1` da tela. O gate passa a medir a tela nova nas cinco larguras, com sessão real. Se o spec exigir marcador em `LOADED_STATE` para a rota nova, o Developer o acrescenta só para ela. Nenhuma outra linha de `e2e/` muda. W2 e R2 são estados abertos por toque, e o gate não os alcança: contraste e alvo de toque das duas folhas ficam para conferência por cálculo, como no Goal123.
11. **Divergências declaradas.**
    - W2: "de 3 minutos" sai da terceira linha (evidência 2).
    - W2 e C2: o nome e o telefone do negócio da conta visual no fundo, como em D-118 (divergências 3 e 4).
    - R2: a contagem "hoje isso alcança 86 conversas" não aparece, porque o contrato não a dá; a frase "As Não classificadas seguem o mesmo prazo." aparece com Comercial reduzida.
    - C2: a data do terceiro passo é a da captura mais sete dias, não "25 de setembro".
    - A casca: a barra de status e o indicador de início do iPhone; o estado da casca na conta visual, que `GET /v1/status` real decide (o banner "Atendimento automático parado", o item "Notificações" e o estado das linhas do hub, D-118, divergência 2); e as linhas do hub de 1024 px em diante com os dados da conta visual.

    O Developer registra outras que encontrar nas `notes` do alvo e em D-138, com o motivo.
12. **Decisão.** O Developer propõe **D-138**, por acréscimo, depois das provas. D-138 cobre a folha do W2, a folha do R2 com os textos de uma e de duas categorias, o C2 como rota com os estados, a data prevista, o botão desabilitado sem senha, a regra de que nenhum passo de captura confirma ação gravada e as divergências declaradas. D-138 revê D-117 só na linha "Excluir conta" do C1 (de diálogo para rota) e D-118 só no diálogo de desconexão.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/whatsapp/WhatsAppConnectionPanel.tsx`: o diálogo de desconexão como o W2 (escolha 3).
2. `features/settings/RetentionSection.tsx`: a confirmação como o R2 (escolha 4).
3. `features/settings/`: a tela do C2 (componente novo), o cenário novo em `types.ts`, `ProductSettingsScreen.tsx` (cenário, `openHrefFor` e `settings` para a tela) e `AccountSettings.tsx` (a linha vira link e o diálogo de pedir exclusão sai) (escolhas 5 a 8).
4. `app/(platform)/configuracoes/conta/excluir/page.tsx`: a rota nova, no padrão de `configuracoes/agenda/regras/page.tsx`.
5. `shared/styles/avenly-settings.css`: o CSS das duas folhas e da tela do C2. Se a casca de folha exigir, o CSS dela em `shared/styles/avenly-conversations.css` ganha só seletor, sem mudar o visual de K5 e K6.

### 2. A captura e o gate

1. `apps/frontend/e2e/visual/targets.json`: W2, R2 e C2 (escolha 9).
2. `scripts/tests/visual-responses.test.mjs`:
   - W2 e R2 entre os donos de `responses` em `Mais-WhatsApp-Importacao-Conta.dc.html`, com o `GET` do próprio caminho;
   - um teste novo: nenhum passo de nenhum alvo tem `clickRole` com o nome "Desconectar", "Excluir minha conta" ou "Reduzir os dois prazos", ou com nome que comece por "Reduzir para". Se W2 ou R2 usarem teclado em vez de clique (escolha 9), o teste também recusa `press` logo depois de um passo que dê foco a um desses botões.
3. `apps/frontend/e2e/routes.ts` (e, só se preciso, `LOADED_STATE` em `e2e/authenticated-matrix.spec.ts`): a rota do C2 (escolha 10).

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal124-*.test.tsx`:
   - W2: o título, o texto com o telefone formatado e sem telefone, as três linhas e os dois botões na ordem do quadro; "Desconectar" chama `whatsapp.disconnect()` uma vez; "Manter conectado" fecha sem chamar; a falha mostra a mensagem de hoje; o diálogo do onboarding é o mesmo;
   - R2: só Comercial (título, texto com a frase das Não classificadas, nota, "Reduzir para 30 dias" e "Manter 90 dias"); só Pessoal (sem a frase das Não classificadas); as duas categorias; "Reduzir para…" envia o `PATCH` com `confirmReduction: true` uma vez; "Manter…" fecha sem enviar nada; nenhuma redução abre a folha; o botão de confirmar não tem a classe de perigo;
   - C2: a linha "Excluir conta" do C1 leva à rota; a tela tem o `h1`, a linha do tempo e a data de hoje mais sete dias no fuso do negócio (com relógio fixo, inclusive num instante em que o fuso do negócio e o UTC caem em dias diferentes); "Excluir minha conta" desabilitado com a senha vazia e habilitado com texto; enviar chama `account.requestDeletion` uma vez com a senha; o `401` e a falha genérica com as mensagens de hoje; o sucesso relê o status e vai para `/configuracoes/conta`; "Voltar" não envia nada; carregando e falha sem formulário; `SCHEDULED` e `PURGED` vão para `/configuracoes/conta`; uma chamada de `useShellConfig` por árvore abaixo e a partir de 1024 px.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 9 e do §2.2.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) "Excluir minha conta" habilitado com a senha vazia faz um teste reprovar;
   - (b) a tela do C2 mostrando o formulário enquanto a leitura de status carrega faz um teste reprovar;
   - (c) "Reduzir para…" enviando o `PATCH` sem `confirmReduction` faz um teste reprovar;
   - (d) a frase das Não classificadas sumindo com Comercial reduzida faz um teste reprovar;
   - (e) um passo de `targets.json` que toque "Excluir minha conta" faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Os ajustes nos arquivos da evidência 8 podem trocar o texto que este Goal muda. Também podem trocar a abertura do diálogo de exclusão pela navegação até a rota. Nenhum ajuste pode afrouxar uma asserção de comportamento: senha, corpo, mensagens de erro, releitura do status, estados de `AccountDeletionSection`, `confirmReduction` ou chamada de `disconnect`. Cada ajuste é listado no relatório.
5. **Fidelidade visual.** `npm run visual:compare -- --target W2,R2,Mais-WhatsApp:C2` e, para regressão, `--target W1,R1,Mais-WhatsApp:C1,M1,K5,K6`, numa pilha descartável própria (banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 123). O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco. Nenhuma mudança na desconexão, na retenção, na exclusão de conta, no corpo enviado ou nos códigos de erro.
- A contagem de conversas alcançadas pela redução (pede leitura nova no contrato e na IA).
- W3 (a lista de contatos ignorados pede leitura nova), "Trocar número?", "Cancelar exclusão", "Sair de todos os dispositivos", a troca de senha da Conta e o resto do C1.
- `PATCH`, `POST`, `PUT` e `DELETE` em `responses` de alvo com sessão.
- As outras lacunas visuais sem ID (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, AG2, W3, NT2, NT3, H6 e as etapas do onboarding) e as observações abertas dos reviews 116 a 123.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-138** em `PROPOSED`, conforme a escolha 12. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal124.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal124. Ela traz as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado. Traz também os controles negativos, o `visual:compare` (alvos, percentuais e diferenças que restam), a lista dos testes ajustados e a nota do que `validate:ui` e o gate autenticado não alcançam (as folhas W2 e R2).

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. A pilha descartável própria, antes de editar.
2. W2 e R2, com os testes e os alvos.
3. C2: a rota, a tela, a linha do C1, os testes, o alvo e a rota no gate.
4. `visual:compare` de W2, R2 e Mais-WhatsApp:C2, e de W1, R1, Mais-WhatsApp:C1, M1, K5 e K6 para regressão.
5. Controles negativos do §3.3, revertidos.
6. Execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. W2 igual ao quadro W2 nos 4 devices, salvo as divergências declaradas: a folha no mobile, o diálogo de 480 px no tablet e de 440 px no desktop, o título, o texto com o telefone, as três linhas e "Desconectar" e "Manter conectado". Provado em jsdom e pelo `visual:compare`.
2. R2 igual ao quadro R2 nos 4 devices, salvo as divergências declaradas: a mesma casca, o título com o novo prazo, o texto, a nota e "Reduzir para 30 dias" em tinta e "Manter 90 dias". Provado em jsdom e pelo `visual:compare`.
3. C2 igual ao quadro C2 de Configurações nos 4 devices, salvo as divergências declaradas: a tela empurrada no mobile e o detalhe com "Conta" marcada a partir de 1024 px, o `h1`, a linha do tempo com a data prevista, o campo de senha e "Excluir minha conta" desabilitado sem senha. Provado em jsdom e pelo `visual:compare`.
4. A desconexão, o `PATCH` da retenção e o pedido de exclusão enviam o mesmo de antes, uma vez e só depois de confirmar. "Manter conectado", "Manter…" e "Voltar" não enviam nada. As mensagens de erro são as de hoje. A tela do C2 nunca mostra o formulário sem ter lido o estado da exclusão. W1, R1, C1, M1, K5 e K6 iguais à captura de antes.
5. Nenhum passo de captura toca um botão que confirma ação gravada, e o teste da captura prova isso.
6. Os cinco controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/configuracoes/conta/excluir` passa nas cinco larguras (360, 390, 768, 1024 e 1440): sem overflow horizontal, com alvo de toque de 24 px no mínimo ("‹", o campo, "Mostrar senha", "Excluir minha conta" e "Voltar"), contraste, foco visível e `prefers-reduced-motion`. `validate:ui` passa. As folhas W2 e R2, que nenhum gate alcança, têm contraste e alvo de toque conferidos por cálculo e registrados em VALIDATION_GATE: `#B3392E` sob `#FFFDFA`, o texto em `#5F574E` e `#716859` sobre `#FFFDFA`, e os botões de 52 px. `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `apps/frontend/e2e/routes.ts`, `apps/frontend/e2e/authenticated-matrix.spec.ts` (só `LOADED_STATE` da rota nova, se preciso), `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação".
9. D-138 proposta, com as três telas, os textos de uma e de duas categorias, os estados da rota, a regra dos passos de captura e as divergências declaradas.

## Plano de execução

1. **WU-01 — W2 e R2.** O diálogo de desconexão e a confirmação da retenção na casca de folha, com o CSS, os testes `goal124` das duas, os ajustes de texto e os alvos W2 e R2.
2. **WU-02 — C2.** A rota, o cenário, a tela, os estados, a linha do C1, o CSS, os testes `goal124` do C2, os ajustes dos testes de exclusão, o alvo C2 e a rota no gate autenticado.
3. **WU-03 — Captura, fidelidade, provas e registros.** O teste dos passos que não confirmam e os donos de `responses` em `visual-responses.test.mjs`, o `visual:compare`, os controles negativos, D-138, CURRENT_STATE e VALIDATION_GATE.
4. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, testes da captura, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
