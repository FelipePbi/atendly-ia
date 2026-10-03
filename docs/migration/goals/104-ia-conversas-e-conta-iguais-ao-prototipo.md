# Goal 104 — IA, Conversas e Conta iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal097 ACCEPTED](../reviews/097-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: IA1, R1, Mais-WhatsApp:C1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v128 (PLANNED) como "104 — IA, WhatsApp, Conversas e Conta iguais ao protótipo", dividida do 097, com os quadros IA1, W1, R1 e Mais-WhatsApp:C1. **READY na v129**, com o mesmo ID e o título precisado. **O 104 foi dividido na v129:** fica com IA, Conversas e Conta (IA1, R1, Mais-WhatsApp:C1). O WhatsApp (W1) vai para o **106**, PLANNED. O motivo está na evidência 1 abaixo.

## Baseline aceita

Baseline aceita: `a4bd80508e59786f14f7a8ff5aa582d3a07e4869`

Goal anterior: 097 — Configurações iguais ao protótipo: hub, Negócio e Agenda

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal097 já integrado em `main` (origem `dfed42a64b7df32bb49070e8f7e126009b360f88`). **Cinco rodadas**, com 2, 1, 1, 5 e 0 blockers; só os dois da rodada 1 foram de produção. **D-116** aceita. A virada de status do documento do Goal097 para `ACCEPTED` veio no commit documental `14b28bc`, que não é baseline. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **Configurações › IA igual ao quadro IA1, Configurações › Conversas igual ao R1 e Configurações › Conta igual ao Mais-WhatsApp:C1, nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768), com o conhecimento do negócio morando em Negócio.

**Por que agora.** O hub, Negócio e Agenda fecharam no 097. Na ordem da v128, o próximo trecho de Configurações é IA, WhatsApp, Conversas e Conta. As telas existem de ponta a ponta (Goals 023, 024, 025, 063, 064 e 067). Falta a forma do quadro e a mudança de lugar do conhecimento. Nada deste Goal exige contrato, BFF, Scheduling ou IA novos.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Mais-Negocio-Agenda-IA.dc.html`, `Mais-WhatsApp-Importacao-Conta.dc.html`, `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html`), no código da baseline, em `packages/public-api-contract/src/schemas.ts`, em `apps/frontend/e2e/routes.ts`, em `apps/frontend/e2e/visual/targets.json` e no review097.

1. **O W1 sai deste Goal.** O W1 mostra o WhatsApp conectado. A conta do `visual:compare` não tem número conectado, e a nota do W1 em `targets.json` já diz "Compare a estrutura". O W1 também reestrutura `WhatsAppConnectionPanel.tsx` (918 linhas), o mesmo painel de `/onboarding/whatsapp-conectar`, cujos quadros 4.2 e 4.6 foram aceitos no 099. O 097, com quatro quadros, levou cinco rodadas. O W1 vira o 106.
2. **IA1.** Título "IA". No topo, um cartão de estado: "IA ativa", "Atendendo pelo WhatsApp desde 18/09 · 41 horários marcados" e "Pausar". Depois, "Jeito de falar", com três opções e um exemplo em cada uma: Profissional ("Olá! Gostaria de agendar um horário?"), Equilibrada ("Oi! Quer marcar um horário? 😊") e Descontraída ("Oiii! Bora marcar? 😄"). Não há botão "Salvar". Depois, um interruptor "Avisar quando a IA marcar um horário", com "Desligado por padrão: você só é avisada quando algo precisa de você.". Depois, o contrato em duas colunas: "Sozinha, ela" (marca, remarca e cancela dentro dos seus horários · informa preços e pagamento · confirma tudo antes de marcar) e "Nunca" (dá desconto ou encaixe · marca fora dos horários · responde contatos ignorados ou conversas pessoais). No fim, duas linhas: "O que ela sabe responder" → "Negócio" e "Quem ela nunca responde" → "2 contatos · WhatsApp". O app (`AiSettings.tsx`) tem o título "Atendente virtual", os painéis "Atendimento automático", "Teste real" (quando se aplica) e "Estilo da IA" com "Salvar", e no fim `KnowledgeSection` e `OtherInfoSection`.
3. **O aviso do IA1 já existe como preferência.** `aiAppointmentCreated` é lido e gravado por `GET` e `PATCH /v1/notifications/preferences`. A tela de hoje é `NotificationPreferenceSection`, em `/notificacoes`. Quando a leitura falha, ela some; enquanto carrega, mostra esqueleto.
4. **O conhecimento mora em Negócio no protótipo.** O IA1 só aponta para Negócio. O N1 tem o grupo "O que a IA sabe responder", com "Perguntas frequentes" ("4 perguntas") e "Outras informações" ("Produtos veganos…"). O N3 ("Negócio · perguntas frequentes") é uma tela com as perguntas e, abaixo, o campo "Outras informações importantes". No app, `BusinessSummary` (`BusinessSettings.tsx`) mostra as duas linhas sempre com "Não informado" (`value: null`), e o conhecimento é editado em Configurações › IA. D-116 deixou isso para cá ("Revisar se" item 3 e divergência 6).
5. **R1.** Título "Conversas". "Por quanto tempo guardar as mensagens", com o texto "Depois do prazo, as mensagens são removidas. A conversa continua na lista, indicando que as antigas expiraram.". Dois grupos de opções segmentadas, "Conversas comerciais · com clientes" e "Conversas pessoais · aba Pessoal", cada um com 30 dias, 90 dias, 180 dias e 1 ano. Depois, "O que não é afetado": Clientes e agendamentos; Histórico de atendimentos e valores; Observações e resumo de cada cliente. Um botão "Salvar". O app (`ConversationsSettings.tsx` e `RetentionSection.tsx`) grava a cada escolha, com o diálogo "Reduzir retenção …?" quando o prazo diminui, e tem a nota de U-01 ("Conversas Não classificadas seguem o prazo Comercial…"). O contrato aceita os dois prazos e `confirmReduction` no mesmo `PATCH /v1/settings/retention`.
6. **Mais-WhatsApp:C1 (Conta).** Título "Conta". Grupo "Seus dados": Nome, E-mail e Senha ("Alterada há 2 meses"). Grupo "Segurança": "Sair de todos os dispositivos", com "Conectada em 2 aparelhos · este celular e um computador" e o botão "Sair". Grupo "Sobre": Termos de Uso e Política de Privacidade. No fim, em área de atenção, "Excluir conta" com "Você tem 7 dias para desistir", e o rodapé "Atendly · versão 1.0". O app (`AccountSettings.tsx`) mostra o formulário de nome, o e-mail, o formulário de senha inteiro, "Sair da conta", "Sair de todos os dispositivos" e a zona de exclusão com quatro estados.
7. **Textos de estado sem leitura no contrato.** Não existem no contrato: a data em que a IA passou a atender e o número de horários marcados por ela (IA1); a data da última troca de senha e o número de aparelhos conectados (C1); a contagem de contatos ignorados (só existe `PUT /v1/conversations/ignored-contacts`); a versão do app (`apps/frontend/package.json` não tem `version`). O prazo de exclusão é verdadeiro: `ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 7`.
8. **"Sair" existe na casca em todas as larguras.** O diálogo "Mais" (`AppShell.tsx`) e o menu da conta da sidebar têm "Sair", que chama o mesmo `logout`.
9. **Gate.** `/configuracoes/ia` está em `AUTHENTICATED_ROUTES` com o `contentMarker` "Atendente virtual", e `authenticated-matrix.spec.ts` espera o `aria-busy` do painel de ativação sair antes de medir. `/configuracoes/conta` está no gate com "Conta". `/configuracoes/conversas` e `/configuracoes/negocio` **não** estão. O marcador é procurado por `getByRole("heading", { level: 1, name })`, sem `exact`. `targets.json` já aponta IA1 para `/configuracoes/ia`, R1 para `/configuracoes/conversas` e Mais-WhatsApp:C1 para `/configuracoes/conta`.

## Escolhas de desenho desta passada

**(a) IA1 em `/configuracoes/ia`.** O título passa a "IA".
- **Estado.** Com a IA ligada, o cartão mostra "IA ativa", "Atendendo pelo WhatsApp" e "Pausar", que abre o mesmo diálogo de hoje. Sem a IA ligada, o cartão mostra o texto e as ações de hoje (`activationCopy`, "Conectar WhatsApp", "Retomar atendimento", "Tentar novamente"). O painel "Teste real" continua abaixo do cartão, nas mesmas condições de hoje. O `aria-busy` do cartão enquanto as leituras chegam continua, porque o gate depende dele.
- **"Jeito de falar".** As três opções do quadro, com o exemplo de cada uma, em grupo de rádio com nome acessível. **Escolher grava na hora**, com o mesmo pedido de hoje (`PATCH /v1/settings/ai`, com o `enabled` atual e o tom novo). Enquanto grava, as opções ficam desabilitadas. A falha volta a seleção ao tom gravado e mostra erro em `role="status"`. Não há "Salvar".
- **O aviso.** "Avisar quando a IA marcar um horário" é um interruptor que lê e grava `aiAppointmentCreated` pelo mesmo serviço de `NotificationPreferenceSection`. Esqueleto enquanto carrega, e a linha some quando a leitura falha, como em `/notificacoes`. `/notificacoes` não muda. O texto de apoio fica neutro quanto a gênero: "Desligado por padrão: você só recebe aviso quando algo precisa de você." (divergência 4).
- **O contrato em duas colunas**, com o texto do quadro.
- **"O que ela sabe responder"** é link para `/configuracoes/negocio/perguntas-frequentes`, com "Negócio" na segunda linha. **"Quem ela nunca responde"** é link para `/configuracoes/whatsapp`, com "WhatsApp" na segunda linha e sem contagem (evidência 7).
- `KnowledgeSection` e `OtherInfoSection` **saem** de Configurações › IA.

**(b) O conhecimento em Negócio.** Rota nova, `/configuracoes/negocio/perguntas-frequentes`, tela empurrada com o título "Perguntas frequentes" e o voltar para `/configuracoes/negocio`. Ela mostra `KnowledgeSection` e, abaixo, `OtherInfoSection` (com `id="outras-informacoes"`), com o comportamento de hoje. O N3 não é portado (divergência 6). O `h2` de dentro das seções pode mudar só se repetir o título da tela.

No N1, as linhas "Perguntas frequentes" e "Outras informações" passam a ser links para a rota nova (a segunda com `#outras-informacoes`). A segunda linha vem de uma leitura que o app já faz:
- "Perguntas frequentes": "1 item" ou "N itens", contando os documentos ativos de `knowledge.list` sem `BUSINESS_INFO`, como `KnowledgeSection` lista. Com zero, "Não informado".
- "Outras informações": o começo do texto de `knowledge.getOtherInfo`, numa linha com reticências por CSS. Vazio, "Não informado".
- **Leitura que falha ou ainda carrega deixa a linha sem a segunda linha.** Nunca "Não informado" sem leitura, nunca valor inventado. O resto do N1 não muda.

**(c) R1 em `/configuracoes/conversas`.** O título e os textos do quadro. Os dois grupos são segmentados, com semântica de grupo de rádio, nome acessível e as opções de `retentionDaysOptions`, lidas do servidor. Fica a nota de U-01 (divergência 5). Fica a lista "O que não é afetado".
- **Um botão "Salvar"** grava os dois prazos num único `PATCH /v1/settings/retention`. Se algum prazo diminuiu, o mesmo diálogo de confirmação de hoje abre antes, dizendo qual prazo diminui (os dois, se for o caso), e o pedido confirmado leva `confirmReduction: true`. Sem mudança, "Salvar" fica desabilitado. A falha mostra erro sem perder a escolha. Enquanto grava, o botão fica desabilitado.
- A leitura falhada e o esqueleto continuam como hoje.

**(d) Mais-WhatsApp:C1 em `/configuracoes/conta`.** Linhas em grupos, na ordem do quadro.
- **Seus dados.** "Nome" mostra o nome da sessão e abre um `Dialog` `variant="sheet"` com o formulário de nome de hoje, mesmo pedido e mesma validação. "E-mail" só mostra o e-mail. "Senha" abre uma folha com o formulário de senha de hoje, mesmo pedido e mesmas mensagens de erro, sem segunda linha (evidência 7).
- **Segurança.** "Sair de todos os dispositivos", sem segunda linha, com o botão "Sair" que abre o diálogo de confirmação de hoje e chama `logoutAllDevices`.
- **Sobre.** Links para `/termos-de-uso` e `/politica-de-privacidade`.
- **Excluir conta** fica no fim, em área de atenção, com os quatro estados de hoje e "Você tem 7 dias para desistir" no estado sem pedido.
- **"Sair da conta" sai da tela**, porque a casca tem "Sair" em todas as larguras (evidência 8). Antes de tirar, confira, nas cinco larguras do gate, que o "Sair" da casca está ao alcance. Se faltar em alguma, a linha fica no grupo Segurança e o relatório diz por quê.
- O rodapé de versão não entra (evidência 7).

**(e) Composição.** As três telas e a rota nova seguem D-103. Abaixo de 1024 px, são tela empurrada, sem barra de abas. De 1024 px em diante, a lista do hub fica à esquerda. A rota nova marca "Negócio" (`aria-current="page"`); IA, Conversas e Conta marcam a própria linha, como hoje. A rota nova entra em cada lista de cenário de `ProductSettingsScreen.tsx` que decide tela empurrada e linha marcada: no 097, esquecer uma dessas listas foi blocker. Continua **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031).

**(f) `targets.json` não muda.** IA1, R1 e Mais-WhatsApp:C1 já apontam para as rotas certas.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O estado da conta visual: sem WhatsApp, a IA não está ligada, e o IA1 mostra o cartão sem a IA ativa e o painel "Teste real". O cartão "IA ativa" fica provado em jsdom. Os dados da conta (nome, e-mail, prazos) vêm dela, não do quadro.
3. Textos de estado sem leitura no contrato (evidência 7): "desde 18/09 · 41 horários marcados", "Alterada há 2 meses", "Conectada em 2 aparelhos…", "2 contatos" e "Atendly · versão 1.0".
4. O texto de apoio do aviso, neutro quanto a gênero.
5. A nota de U-01 no R1.
6. O N3 não é portado: a rota nova mostra `KnowledgeSection` e `OtherInfoSection` com a forma de hoje. "Adicionar" ao lado de "Não informado" no N1 continua fora (D-116, divergência 6).
7. O item "Notificações" da sidebar no desktop (D-093, D-101 (c)) e o banner "Atendimento automático parado" da casca.

## Escopo obrigatório

### 1. IA1, R1 e Mais-WhatsApp:C1 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`:
- `Mais-Negocio-Agenda-IA.dc.html` (mobile), com o rótulo "Configurações · IA";
- `Mais-WhatsApp-Importacao-Conta.dc.html` (mobile), com "Configurações · Conversas" e "Configurações · Conta";
- `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html`, com os equivalentes de IA, Conversas e Conta.

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença. Reaproveite as classes de linha e de grupo que o 097 criou em `atendly-settings.css` para o hub e o AG1, quando o quadro tiver a mesma forma.

Repita `npm run visual:compare -- --target IA1,R1,Mais-WhatsApp:C1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros IA1, R1 e Mais-WhatsApp:C1 nos 4 devices**. Para cada quadro e cada device, o relatório final traz o diff do início e do fim e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script. Depois de cada `visual:compare`, confira `git status`: no 095 e no 096, o `next dev` reescreveu `apps/frontend/AGENTS.md`. Arquivo fora do escopo que mudar volta ao original antes da entrega.

### 2. O resto da área logada não quebra

Rode `npm run visual:compare -- --target M1,N1,AG1,AG3,H3,CL1,Servicos:S1,C5` no início e no fim e cole o diff de cada device das duas execuções. A única mudança esperada é a segunda linha de "Perguntas frequentes" e "Outras informações" no N1, que passa a mostrar o estado lido. O resto não muda. Toda piora tem causa medida.

### 3. Comportamento preservado

- Todas as rotas de Configurações de hoje continuam abrindo a mesma seção.
- Pausar e retomar a IA, o teste real e o "Conectar WhatsApp" do cartão funcionam como hoje, com os mesmos pedidos.
- O tom grava pelo mesmo `PATCH /v1/settings/ai`, sem mudar o `enabled`.
- Criar, editar e desativar documento de conhecimento, e gravar "Outras informações importantes", funcionam como hoje, agora na rota nova.
- A preferência do aviso continua a mesma em `/notificacoes`, que não muda.
- A retenção continua pedindo confirmação para reduzir e recusa valor fora de `retentionDaysOptions`.
- Nome, senha, sair de todos os dispositivos e os quatro estados da exclusão funcionam como hoje, com os mesmos pedidos e mensagens.
- O hub, o N1 (fora das duas linhas de (b)), a Agenda, o WhatsApp e a Importação não mudam.

### 4. Provas novas

`apps/frontend/tests/goal104-ia-conversas-e-conta.test.tsx`, no padrão de `goal097-configuracoes.test.tsx`:

1. **IA1.** O `h1` "IA". Com a IA ligada: "IA ativa", "Pausar" abre o diálogo e pausa pelo pedido de hoje. Sem a IA ligada: os textos e ações de hoje e o "Teste real". "Jeito de falar" com os três exemplos; escolher envia **um** `PATCH /v1/settings/ai` com o `enabled` lido e o tom novo; a falha volta ao tom gravado. O interruptor lê e grava `aiAppointmentCreated`; com a leitura falhando, a linha não aparece. As duas colunas do contrato. As duas linhas com os `href` de (a). Nenhum texto de `KnowledgeSection` nem de `OtherInfoSection` na tela.
2. **Conhecimento em Negócio.** A rota nova mostra as duas seções, como tela empurrada, com o voltar para `/configuracoes/negocio`. No N1, as duas linhas com os `href` de (b). Resumos: zero, um e vários itens (sem contar `BUSINESS_INFO`), o começo do texto e "Não informado" para vazio. Com cada leitura falhando ou pendente, a linha aparece sem a segunda linha.
3. **R1.** Os dois grupos com o valor lido selecionado e as opções da leitura. "Salvar" desabilitado sem mudança. Aumentar envia **um** `PATCH /v1/settings/retention` com os dois prazos e sem `confirmReduction`. Reduzir abre a confirmação, e confirmar envia **um** pedido com `confirmReduction: true`; cancelar não envia nada. A falha mostra erro sem perder a escolha. A lista "O que não é afetado" e a nota de U-01.
4. **Conta.** Os grupos e as linhas de (d). As folhas de nome e de senha enviam os pedidos de hoje e mostram as mensagens de hoje. "Sair" de Segurança chama só `logoutAllDevices`, depois da confirmação. Os links de "Sobre". Os quatro estados da exclusão. Não há "Sair da conta", salvo o caso de (d), declarado.
5. **Casca.** Uma chamada de `useShellConfig` por árvore renderizada em `/configuracoes/ia`, `/configuracoes/conversas`, `/configuracoes/conta` e `/configuracoes/negocio/perguntas-frequentes`, nas duas faixas. De 1024 px em diante, a rota nova mostra a lista do hub com "Negócio" marcada.

As provas 1 a 4 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. A prova 5 guarda comportamento e pode passar em parte na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa de texto, rótulo ou estrutura que o quadro troca. Exemplos: o título "Atendente virtual", o "Salvar" do estilo, o conhecimento dentro de Configurações › IA, a retenção que grava a cada escolha, os formulários abertos de nome e senha e "Sair da conta". Teste que exercita o conhecimento em `/configuracoes/ia` passa a exercitá-lo na rota nova. A asserção sobre o pedido enviado não muda, salvo onde (a) e (c) mudam o momento do pedido; nesses casos, o relatório diz qual asserção e por quê. Prováveis afetados: `goal063-ai-settings`, `goal067-configuracoes-ia-conta`, `goal024-knowledge-section`, `goal023-retention-settings`, `goal023-conversations-settings`, `goal024-account-sessions`, `goal064-greeting-and-account`, `goal025-account-deletion-screen`, `goal024-settings-shell-invariant` e `goal097-configuracoes`. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. As únicas mudanças autorizadas no gate autenticado

Em `apps/frontend/e2e/routes.ts`:
- o `contentMarker` de `/configuracoes/ia` passa de "Atendente virtual" a "IA";
- uma entrada nova logo depois de `/configuracoes/whatsapp`: `/configuracoes/conversas`, nome `configuracoes-conversas`, `sessionMarker` `"configuracoes"`, `contentMarker` "Conversas";
- uma entrada nova logo depois de `/configuracoes`: `/configuracoes/negocio/perguntas-frequentes`, nome `configuracoes-negocio-perguntas-frequentes`, `sessionMarker` `"configuracoes"`, `contentMarker` "Perguntas frequentes".

Confira que cada marcador acha **um** `h1` em cada largura. O marcador "IA" é procurado sem `exact`: confira que nenhum outro `h1` da tela, em nenhuma largura, contém "ia". O gate passa de **265** para **275** testes: cinco por rota nova. `e2e/authenticated-matrix.spec.ts`, `e2e/visual/targets.json` e o resto de `e2e/` não mudam.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. `KnowledgeSection` volta a Configurações › IA: a prova 1 reprova.
2. O interruptor do aviso aparece desligado quando a leitura falha: a prova 1 reprova.
3. A linha "Perguntas frequentes" do N1 mostra "Não informado" quando a leitura falha: a prova 2 reprova.
4. O "Salvar" do R1 reduz um prazo sem abrir a confirmação: a prova 3 reprova.
5. O "Sair" de Segurança chama `auth.logout` no lugar de `logoutAllDevices`: a prova 4 reprova.
6. `/configuracoes/negocio/perguntas-frequentes` chama `useShellConfig` duas vezes na mesma árvore: a prova 5 reprova.

## Pontos de implementação

- `apps/frontend/src/features/settings/`: `AiSettings.tsx`, `ConversationsSettings.tsx`, `RetentionSection.tsx`, `AccountSettings.tsx`, `BusinessSettings.tsx` (só as duas linhas de (b)), `ProductSettingsScreen.tsx`, `types.ts` (cenário novo), `SettingsScreen.tsx` se precisar, e `shared/`. Componentes novos para a tela do conhecimento e as folhas de Conta, na mesma pasta.
- `apps/frontend/src/app/(platform)/configuracoes/negocio/perguntas-frequentes/page.tsx`, no padrão de `configuracoes/agenda/regras/page.tsx`.
- `apps/frontend/src/features/knowledge/` só para o `id` de (b) e um `h2` repetido, sem mudar comportamento.
- `apps/frontend/src/features/notifications/` só se for preciso extrair a leitura e a gravação da preferência para uso nas duas telas, sem mudar `/notificacoes`.
- `apps/frontend/src/shared/styles/atendly-settings.css`. `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/routes.ts`: só o que o §6 autoriza.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- W1, W2 e W3 (106), e I1, I2 e 2.I1 (105). `WhatsAppConnectionPanel.tsx`, `WhatsAppSettings.tsx` e a Importação não mudam.
- N2, N3, AG2, R2 e C2 como quadros. A confirmação de redução e o diálogo de exclusão continuam com a forma de hoje.
- O hub e o diálogo "Mais", e qualquer mudança na casca: `AppShell.tsx`, `navigation.ts`, `PushedBar.tsx`, `ListDetail.tsx`, `useWideLayout.ts` e `ShellConfig.tsx`.
- `/notificacoes` e `NotificationPreferenceSection` na tela de lá.
- Qualquer mudança em contrato, BFF, Scheduling, IA, `scripts/`, `docs/design-reference/`, vault e `e2e/visual/targets.json`.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-117** em `PROPOSED`, no formato de D-116. Ela diz (a) a (f), com o motivo de cada um, e as divergências declaradas. Ao fim de D-116 entra, só por acréscimo, uma linha "**Revista em parte por D-117**" que diz o quê: o conhecimento foi para Negócio ("Revisar se" item 3), e as linhas do conhecimento no N1 deixam a divergência 6. Ela não reescreve D-116, D-093, D-101 nem D-103. O "Revisar se" cobre: o contrato ganhar a data de ativação, a contagem de horários marcados pela IA, a data da troca de senha, o número de aparelhos ou a lista de contatos ignorados (as segundas linhas voltam); o N3 ser portado; e o 106 mudar a linha "Quem ela nunca responde".
- [CURRENT_STATE](../CURRENT_STATE.md) registra o IA1, o conhecimento em Negócio, o R1 com um "Salvar", a Conta em linhas, a rota nova e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim dos quadros do §1 e do §2, as mudanças do §6 e a contagem do gate autenticado.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md) só se uma linha vigente de Configurações ficar falsa.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target IA1,R1,Mais-WhatsApp:C1,M1,N1,AG1,AG3,H3,CL1,Servicos:S1,C5` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target IA1,R1,Mais-WhatsApp:C1`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target IA1,R1,Mais-WhatsApp:C1,M1,N1,AG1,AG3,H3,CL1,Servicos:S1,C5`.
6. Rodar os seis controles do §7.
7. Escrever a prosa só depois disso.

Os controles do §7 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Contraste intermitente em `onboarding-demonstracao-da-ia`.** No 103, uma execução de `validate:integration` falhou por contraste nessa tela, e as duas seguintes passaram sem retentativa (observação 1 do [review103](../reviews/103-review.md)). Os reviews 095, 096 e 097 não registram recorrência. Se acontecer de novo, rode `validate:integration` outra vez na mesma árvore e registre as duas execuções. Não mude `e2e/` por causa disso.

**Retentativas e recurso do host.** Nos Goals 092, 100, 093 e 101, o `validate:ui` com a configuração padrão teve retentativas em rotas públicas (`Target crashed`), e com `CI=1` a mesma árvore deu 0. No 101, `validate:core` sem variável falhou por memória e passou com `VITEST_MAX_WORKERS=2`. Se acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração. Fora do §6, `e2e/` não muda.

**Controles do §7 e números depois da última edição.** No 095 e no 096, rodadas caíram porque os controles ou o vermelho da baseline tinham rodado antes de uma edição posterior, e os documentos ficaram com os números antigos. Qualquer edição de código ou de teste depois dos controles obriga a rodá-los de novo, a rodar de novo o vermelho da baseline das provas tocadas e a atualizar os números e os hashes citados.

**Blockers de documento, item por item.** No 097, um blocker de documento chegou truncado, e a rodada seguinte corrigiu só a primeira parte. Ao receber blockers, trate cada item separado, e antes de devolver confira cada um contra o texto dos três documentos (DECISIONS, CURRENT_STATE e VALIDATION_GATE). Afirmação sobre gate que rodou ou não rodou é conferida contra os registros da execução, não contra a memória da rodada.

No relatório, para cada quadro e cada device, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target IA1,R1,Mais-WhatsApp:C1` e abriu os doze `side-by-side.png`. `/configuracoes/ia` está **igual ao quadro IA1 nos 4 devices**, `/configuracoes/conversas` está **igual ao quadro R1 nos 4 devices**, e `/configuracoes/conta` está **igual ao quadro Mais-WhatsApp:C1 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas.
2. O hub, Negócio, Agenda, a Home, Clientes, Serviços e Conversas não quebraram: M1, N1, AG1, AG3, H3, CL1, Servicos:S1 e C5 do início e do fim, com o que mudou descrito. No N1, só as duas linhas de (b). Toda piora tem causa medida.
3. As provas 1 a 4 passam e reprovaram na baseline, salvo asserção declarada. A prova 5 passa. Os seis controles do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua. Nenhuma linha mostra estado que o app não leu. O conhecimento é editado só em `/configuracoes/negocio/perguntas-frequentes`. O R1 grava os dois prazos num pedido só e confirma antes de reduzir.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem **275** testes (os 265 da baseline mais os 10 das duas rotas novas), com **0** retentativas. `validate:ui` passa nas cinco larguras. Retentativa é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. `e2e/routes.ts` difere da baseline só pelo que o §6 autoriza. `e2e/authenticated-matrix.spec.ts` e `e2e/visual/targets.json` não mudam.
8. D-117 está em `PROPOSED`, com a nota "Revista em parte por D-117" em D-116 só por acréscimo. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
9. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada, sem resto de controle negativo, sem `apps/frontend/AGENTS.md` alterado e sem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o IA1 com a IA ativa, que a conta visual não tem e fica provado só em jsdom; que o aviso ligado no IA1 gere a notificação numa conversa real; e o W1 (106).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; IA1 em `/configuracoes/ia`; o conhecimento em `/configuracoes/negocio/perguntas-frequentes` e as duas linhas do N1 |
| WU-02 | STANDARD | WU-01 | R1 com um "Salvar" e a confirmação de redução; Conta em linhas, com as folhas de nome e senha |
| WU-03 | STANDARD | WU-02 | Provas 1 a 5 com o vermelho da baseline; asserções do §5; as mudanças do §6 em `e2e/routes.ts` |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal104-ia-conversas-e-conta` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | `visual:compare` final, controles negativos (§7) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
