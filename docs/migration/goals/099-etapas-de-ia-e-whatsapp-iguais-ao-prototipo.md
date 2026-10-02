# Goal 099 — Etapas de IA e WhatsApp iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal090 ACCEPTED](../reviews/090-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 3.1, 4.1, 4.2, 4.6

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v117 (PLANNED), dividida do 090. READY na v118, com o mesmo ID, título e quadros. A v118 precisa o escopo: o consentimento do 4.2 vira uma fase própria **só no onboarding**, e Configurações não muda.

## Baseline aceita

Baseline aceita: `8406986e3569b51b82cb6ce6f0336e492d26e5ab`

Goal anterior: 090 — Etapas de Negócio e Agenda iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal090 já integrado em `main` (origem `cbb843772803c00b98eefef52a73720035dd1723`). A virada de status do documento do Goal090 para `ACCEPTED` entrou no próprio commit de fechamento. **Quatro rodadas**, com 5, 3, 3 e 0 blockers. **D-105** aceita. A correção de harness que estava no snapshot aceito (`tools/ia-loop/`, DIAG-001) **não** entrou no commit de fechamento e não faz parte desta baseline. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O Goal089 portou a moldura do onboarding, e o Goal090 portou o conteúdo das etapas de "Seu negócio" e "Sua agenda". Este Goal porta o conteúdo das quatro etapas de "Sua IA" e "WhatsApp" que têm quadro e que a conta do `visual:compare` alcança.

Critério: **`/onboarding/demonstracao-da-ia`, `/onboarding/whatsapp`, `/onboarding/whatsapp-conectar` e `/onboarding/teste-real` iguais aos quadros 3.1, 4.1, 4.2 e 4.6 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`.

**Por que agora.** Sobram só estas quatro etapas do onboarding com quadro alcançável. Elas vêm de um arquivo só do protótipo (`Onboarding-3-IA-e-WhatsApp*.dc.html`), e a moldura e o eyebrow por capítulo já estão prontos (D-104, D-105). Os quadros 4.3, 4.4, 4.5 e 4.7 a 4.10 existem no protótipo, mas a conta do `visual:compare` não chega a esses estados, e nenhum Goal os tem hoje.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Onboarding-3-IA-e-WhatsApp.dc.html`, com `-Tablet` e `-Desktop`) e no código. O `visual:compare` final do Goal090 (VALIDATION_GATE, delta do Goal090) dá, por device (mobile / retrato / paisagem / desktop): 3.1 **6,9 / 3,4 / 3,1 / 2,4**; 4.1 **6,9 / 8,8 / 8,8 / 6,9**; 4.2 **14,3 / 7,4 / 7,5 / 5,8**; 4.6 **13,1 / 6,7 / 6,8 / 5,3**. A porcentagem é tendência; a leitura é a dos `side-by-side.png`.

1. **Eyebrow.** Nos quadros 4.1, 4.2 e 4.6 o eyebrow é o nome do capítulo, "WhatsApp". O app usa "Antes de conectar", "Conectar WhatsApp" e "Teste real" (`scenarios.ts`). Em 3.1 o app já mostra "Sua IA".
2. **3.1 Demonstração.** O quadro tem a conversa com bolhas da cliente e da IA, o rótulo "sua IA" sob a bolha da IA e os eventos do sistema como linhas discretas ("Serviço identificado · …", "Agenda consultada · …", "Agendamento simulado · nada foi marcado"). O app já tem essa sequência (`demo.ts`, `blocks/ai.tsx`, D-095, item 3); a diferença é de composição, estilo e frase. As frases do quadro são outras: "Quero sim! Tem sexta à tarde?" contra "Tem horário sex?"; "3 horários livres na sexta" contra "… sex"; "Qual fica melhor?" contra "Qual prefere?"; "15h30" contra "Pode ser o de 15h30."; "Confirmado! Te espero sexta às 15h30 😊" contra "Combinado! Te espero lá.". Algumas frases do quadro usam artigo antes do nome do serviço ("Quanto tá o corte feminino?"), e o app não usa artigo fixo (D-099).
3. **3.2 e o template.** A observação 1 do [review089](../reviews/089-review.md) diz que as frases de exemplo de 3.2 vêm do template de `demo.ts` (`demoToneSample`), não do quadro. Mudar a resposta de preço de 3.1 muda também a amostra de 3.2.
4. **4.1 Introdução.** O quadro tem o título "Agora vamos colocar sua IA para atender de verdade." e não tem descrição. O app tem a descrição "Antes de conectar seu número, veja o que muda no seu dia a dia.". A quarta promessa do quadro termina em "família, amigos, quem quiser."; a do app não tem esse fim (`PERSONAL_NUMBER_POINTS`, `blocks/whatsapp.tsx`). As ações "Conectar meu WhatsApp" e "Fazer isso depois" já existem.
5. **4.2 Consentimento.** O quadro é uma tela só de consentimento: título "Antes de conectar", checkbox com a frase de consentimento e "Saiba mais", a pergunta "Você usa esse número também para conversas pessoais?" com "Sim, também" e "Não, só trabalho", o bloco "Tudo bem — você continua no controle:" quando a resposta é "Sim", e um único CTA "Continuar". A escolha de QR ou código e o número vêm no quadro seguinte (4.3). O app mostra tudo numa tela só: consentimento, pergunta, "Como prefere conectar?", número e "Conectar WhatsApp" (`WhatsAppConnectionPanel.tsx`), com o título "Ative o atendimento no seu número". O painel é o mesmo em Configurações › WhatsApp (D-081, item 3).
6. **4.6 Introdução ao teste.** O quadro tem o título "Vamos fazer um teste real", a descrição "Um número da Atendly vai enviar uma mensagem no seu WhatsApp simulando um cliente. Você só observa — a IA faz o atendimento sozinha.", uma prévia da mensagem no WhatsApp ("Atendly · Teste agora", o aviso de teste e a pergunta da cliente), três itens e "Iniciar teste" com a nota "Leva cerca de 3 minutos.". O app tem quatro itens com ✓ (`ActivationTestIntro`, `features/activation-test/ActivationTestPanels.tsx`), sem prévia. O quarto item do app diz que a IA é ativada no fim; o terceiro item do quadro diz só que o agendamento e o cliente de teste são apagados. O mesmo painel aparece em Configurações › IA (`AiSettings.tsx`).
7. **O que o teste envia de verdade.** O aviso de teste e a pergunta da cliente saem do orquestrador (`apps/ai-orchestrator/src/modules/activation-test/ActivationTestService.ts`). A pergunta usa o serviço escolhido pelo sistema no início da execução (`Oi! Quanto custa ${run.serviceName ?? "o atendimento"}?`), que a tela de introdução ainda não conhece. Não há constante de duração esperada do teste: `ACTIVATION_TEST_STALE_AFTER_MS` (5 minutos, `activation-test-run.ts`) é o limite de execução parada, não a duração.

## Escolhas de desenho desta passada

**(a) O eyebrow é o capítulo.** Em `whatsapp`, `whatsapp-conectar` e `teste-real`, o eyebrow é "WhatsApp", como no quadro. Se o Developer derivar o eyebrow do capítulo (`blockForScenario`) para o bloco inteiro, o relatório lista cada etapa fora destas três cujo eyebrow mudou, e cada uma precisa bater com o próprio quadro do protótipo (4.3, 4.4, 4.5, 4.7 a 4.10), lido no arquivo, mesmo sem captura.

**(b) Textos do quadro.** Títulos, descrições, rótulos, CTAs e notas das quatro etapas passam a ser os do quadro, salvo onde este documento diz outra coisa. As mensagens de validação, os nomes acessíveis e o que é gravado não mudam.

**(c) 3.1 com as frases do quadro, sem artigo fixo.** O template de `demo.ts` segue a frase do quadro em cada linha, com os dados do rascunho. Onde a frase do quadro precisa de artigo ou de concordância com o nome do serviço, fica a forma sem artigo (D-099), e a divergência é declarada. Artigo de dia da semana ("na sexta", "no sábado") é regra fixa e pode entrar. O período ("à tarde") só entra se todos os horários oferecidos estiverem nele. Os horários usam a forma do quadro ("14h", "15h30") se o app ainda não a usar. A amostra de 3.2 acompanha a resposta de preço nova; 3.2 não pode piorar. As regras de D-095, item 3 (dados do rascunho, os quatro tipos de preço, "nada é marcado de verdade", a demonstração distinta do teste real) continuam.

**(d) 4.2 é uma fase própria do onboarding.** Em `/onboarding/whatsapp-conectar`, com o número não conectado, a tela começa na **fase de consentimento**, igual ao quadro: título "Antes de conectar", checkbox desmarcado, a pergunta sobre número pessoal, o bloco de controle quando a resposta é "Sim" e um único CTA "Continuar", no rodapé ancorado (D-104 (f)). O CTA fica desabilitado até o checkbox marcado e a pergunta respondida, e não chama o BFF. Depois dele vem a **fase de conexão**, com a escolha de QR ou código, o número e "Conectar WhatsApp", como hoje; o título dessa fase continua "Ative o atendimento no seu número". A URL e a rota não mudam, e não há etapa nova em `blocks.ts`.
- O consentimento continua exigido a cada vinculação (D-081, item 3): se a vinculação expirar, falhar ou for desfeita, a tela volta à fase de consentimento com o checkbox desmarcado. `connect` e `reconnect` continuam mandando `consentAccepted: true` (D-081, item 1).
- O Developer escolhe onde a fase mora: uma prop opcional em `WhatsAppConnectionPanel` (padrão: comportamento de hoje) ou um estado em `OnboardingScreen.tsx`, no padrão de `whatsappConnected`. O relatório diz qual foi a escolha. Nunca há dois "Continuar" visíveis ao mesmo tempo.
- **Configurações › WhatsApp não muda.** O painel de `WhatsAppSettings.tsx` continua com consentimento, pergunta e conexão numa tela só. A fase em Configurações é do Goal097 (W1).

**(e) 4.1 com o texto do quadro.** Sem descrição, com o título do quadro e a quarta promessa terminando em "família, amigos, quem quiser.". As ações e os destinos não mudam.

**(f) 4.6 com a prévia, sem afirmação falsa.** A introdução do teste no onboarding ganha o título, a descrição, a prévia e o CTA do quadro. Regras:
- O aviso da prévia é o texto que o orquestrador envia (evidência 7), não o do quadro, se forem diferentes.
- A pergunta da prévia não nomeia um serviço que o sistema ainda não escolheu. Usa forma neutra, e a divergência é declarada.
- Os itens são os três do quadro, e o terceiro diz também que a IA é ativada no fim ("No fim, o agendamento e o cliente de teste são apagados, e sua IA é ativada."), porque é a consequência que o vault liga ao teste (Goal063). É divergência declarada.
- "Leva cerca de 3 minutos." só entra com uma medida ou constante do repositório que a sustente. Sem isso, a nota sai, e a divergência é declarada.
- **Configurações › IA não muda.** A introdução de `AiSettings.tsx` continua a de hoje. Se o Developer separar uma variante do onboarding em `ActivationTestPanels.tsx`, a variante de Configurações fica igual à da baseline.

**Divergências declaradas, que não contam como defeito na comparação:**

1. "Sair" (D-104, item (e)).
2. A barra de status e o indicador de início do iPhone nos quadros mobile.
3. Dados da conta de teste que não são layout: nome, preço e duração do serviço, dias e horários, data da demonstração e estado habilitado dos CTAs.
4. 3.1: frases sem artigo fixo, por (c); o instante da animação de entrada das mensagens.
5. 4.2: o estado do checkbox. O quadro mostra o checkbox já aceito ("aqui, já aceito"), e o app começa desmarcado, como o próprio quadro manda.
6. 4.6: o aviso e a pergunta da prévia, o terceiro item e, se for o caso, a nota de duração, por (f).
7. 4.6 e 4.2 no estado de carregamento antes da primeira leitura do status do WhatsApp (D-081): a captura vale depois da leitura.

## Escopo obrigatório

### 1. As quatro etapas iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Onboarding-3-IA-e-WhatsApp.dc.html` (mobile), `Onboarding-3-IA-e-WhatsApp-Tablet.dc.html` ("Onboarding / <rótulo> / Portrait" e "… / Landscape") e `Onboarding-3-IA-e-WhatsApp-Desktop.dc.html` ("… / Desktop"). Os rótulos são "Demonstração da IA", "Introdução WhatsApp", "Consentimento" e "Introdução ao teste".

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença. A moldura é a do Goal089 e não muda.

Repita `npm run visual:compare -- --target 3.1,4.1,4.2,4.6` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros 3.1, 4.1, 4.2 e 4.6 nos 4 devices**. Para cada quadro e device, o relatório final traz o diff final e o que ainda difere, com o motivo. Corridas seguidas batem no limite de login da conta visual (`429`, `RATE_LIMITED`, observação 5 do review090): espere entre corridas em vez de mudar o script.

### 2. As etapas vizinhas e Configurações não pioram

Rode `npm run visual:compare -- --target 0,1.1,1.2,1.3,2.1,2.2,2.3,2.4,2.5,2.6,3.2,W1,IA1` no início e no fim, e cole o diff de cada device das duas execuções. Nenhum desses quadros pode piorar sem causa medida no relatório. 3.2 é o vizinho afetado pelo template de (c). W1 e IA1 provam que Configurações › WhatsApp e Configurações › IA não mudaram.

A moldura, as etapas dos capítulos 1 e 2, `contatos-ignorados`, as telas do teste depois da introdução, `whatsapp-concluido`, a área logada e Configurações **não** mudam, salvo o eyebrow de (a) se o Developer derivar do capítulo.

### 3. Comportamento preservado

- As rotas, a ordem das etapas, `nextRequiredStep`, a retomada e os destinos do chevron não mudam.
- "Conectar meu WhatsApp" e "Fazer isso depois" levam ao mesmo destino de antes. `persistWhatsappStep` de `whatsapp-conectar` continua exigindo `CONNECTED` antes de seguir para `contatos-ignorados`.
- O consentimento e a pergunta sobre número pessoal continuam obrigatórios antes de qualquer `connect` ou `reconnect`, a cada vinculação. O BFF não muda e continua recusando sem `consentAccepted: true`.
- A leitura do QR, a janela de renovação, o código copiável, o "Aguardando conexão…" e a desconexão (D-081, itens 2 a 4) não mudam.
- "Iniciar teste" inicia a execução como antes (`startActivationTest`), e as telas seguintes do teste não mudam.
- A demonstração continua sem marcar nada, respeita `prefers-reduced-motion` e mostra "Continuar" só no fim (D-095).
- O `RouteAnnouncer` continua anunciando a troca de etapa.
- As medidas do onboarding no gate autenticado (D-083, item 10, e G-6 de D-104) continuam passando sem mudança.

### 4. Provas novas

`apps/frontend/tests/goal099-onboarding-ia-whatsapp.test.tsx`, com dublês do runtime no padrão dos testes do Goal071, do Goal089 e do Goal090:

1. O eyebrow é "WhatsApp" em `whatsapp`, `whatsapp-conectar` e `teste-real`, e continua "Sua IA" em `demonstracao-da-ia`.
2. Em `whatsapp`, o título é o do quadro, não há descrição, e a quarta promessa termina em "família, amigos, quem quiser.".
3. Em `whatsapp-conectar`, com o número não conectado: a tela abre na fase de consentimento, com o título "Antes de conectar", o checkbox desmarcado e sem "Como prefere conectar?", sem campo de número e sem "Conectar WhatsApp". "Continuar" fica desabilitado sem o checkbox ou sem a resposta, e clicá-lo não chama o BFF. Depois dele aparece a fase de conexão, e "Conectar WhatsApp" envia `consentAccepted: true`.
4. Depois de uma vinculação expirada ou falha, a tela volta à fase de consentimento com o checkbox desmarcado.
5. `WhatsAppSettings` continua mostrando consentimento, pergunta, escolha de modo e "Conectar WhatsApp" na mesma tela, sem fase de consentimento.
6. Em `demonstracao-da-ia`, a conversa segue o template novo com os dados do rascunho: as frases do quadro onde (c) permite, os três eventos e o fim com "Agendamento simulado · nada foi marcado". Nenhum item usa artigo fixo antes do nome do serviço.
7. Em `teste-real`, o título, a descrição, a prévia e os três itens são os de (f); a prévia não nomeia serviço; o terceiro item diz que a IA é ativada; "Iniciar teste" inicia a execução como antes. A introdução de `AiSettings` continua a da baseline.

As provas 1 a 4, 6 e 7 **reprovam na baseline**; a 5 pode passar e é regressão declarada. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

Nenhuma medida nova no gate autenticado. Se o Developer achar que alguma escolha só se prova renderizada, o relatório diz qual e por quê, e a medida entra em `e2e/authenticated-matrix.spec.ts` só por acréscimo.

### 5. Testes existentes

Continuam passando. Só muda asserção que dependa de: eyebrow das etapas do capítulo 4, textos trocados por (b) a (f), a fase de consentimento no onboarding (um teste que conectava direto agora clica "Continuar" antes) ou as frases da demonstração e da amostra de 3.2. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado. Os testes de Configurações › WhatsApp e Configurações › IA não mudam.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O eyebrow de `whatsapp-conectar` volta a ser "Conectar WhatsApp": a prova 1 reprova.
2. A fase de consentimento é pulada no onboarding (a tela abre com a escolha de modo): a prova 3 reprova.
3. "Continuar" fica habilitado com o checkbox desmarcado: a prova 3 reprova.
4. A fase de consentimento passa a valer também em Configurações › WhatsApp: a prova 5 reprova.
5. O fim da demonstração volta a "Combinado! Te espero lá.": a prova 6 reprova.

### 7. O que só uma pessoa confere

- Num celular real, a fase de consentimento e a passagem para a fase de conexão, com o CTA ancorado.
- Se a prévia do teste lê como prévia, e não como uma mensagem já recebida.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

## Pontos de implementação

- `apps/frontend/src/features/onboarding/scenarios.ts`: textos de (b) e, se for a escolha, o eyebrow de (a).
- `apps/frontend/src/features/onboarding/demo.ts` e `blocks/ai.tsx`: 3.1 e o template de (c).
- `apps/frontend/src/features/onboarding/blocks/whatsapp.tsx`: 4.1 e a fase de (d).
- `apps/frontend/src/features/onboarding/blocks/activation-test.tsx`: 4.6.
- `apps/frontend/src/features/onboarding/OnboardingScreen.tsx`: CTA da fase de consentimento, título por fase e o eyebrow, se for derivado do capítulo.
- `apps/frontend/src/features/whatsapp/WhatsAppConnectionPanel.tsx`: só a prop opcional de (d), se for a escolha, com o padrão igual ao de hoje.
- `apps/frontend/src/features/activation-test/ActivationTestPanels.tsx`: só a variante do onboarding de (f), com a de Configurações igual à da baseline.
- `apps/frontend/src/shared/styles/atendly.css`, nas regras `.onboarding-*`, `.message-*` e `.settings-consent-*` usadas pelas quatro etapas, mais as regras novas. Regra compartilhada com Configurações só muda com seletor escopado ao onboarding.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/routes.ts`, só se um `contentMarker` depender de texto trocado, com o motivo no relatório.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- Os quadros 4.3, 4.4, 4.5 e 4.7 a 4.10, e a captura de estados que a conta do `visual:compare` não alcança.
- A fase de consentimento em Configurações › WhatsApp (W1, Goal097) e a introdução do teste em Configurações › IA (IA1, Goal097).
- Gravar o consentimento ou a resposta sobre número pessoal (D-081, "Revisar se").
- O formato de hora do `<input type="time">` no `visual:compare` (observação 1 do review090): o script fica em `scripts/`.
- Qualquer mudança em rota, fluxo, contrato, BFF, orquestrador, serviços, `scripts/`, `docs/design-reference/`, vault e `e2e/visual/targets.json`. Mude o mapa só se o alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-106** em `PROPOSED`, no formato de D-104 e D-105. Ela diz (a) a (f), com o motivo de cada um, e as divergências declaradas. Ela registra que (d) **acrescenta** a fase de consentimento ao item 3 de D-081 só no onboarding, sem substituí-lo. O "Revisar se" cobre três casos: o Goal097 levar a fase a Configurações; uma decisão de produto ou jurídica mandar gravar o consentimento; ou o teste real ganhar duração medida.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que as quatro etapas seguem os quadros e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim e a contagem do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita (D-104, D-105) não é reescrita.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare` dos quatro quadros e dos vizinhos do §2 na baseline, e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target 3.1,4.1,4.2,4.6`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e o `visual:compare` dos quatro quadros e dos vizinhos do §2.
6. Rodar os cinco controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

No relatório, para cada device dos quatro quadros, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target 3.1,4.1,4.2,4.6` e abriu os dezesseis `side-by-side.png`. As quatro etapas estão **iguais aos quadros 3.1, 4.1, 4.2 e 4.6 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das declaradas.
2. Os vizinhos do §2, incluindo 3.2, W1 e IA1, não pioraram; toda piora tem causa medida.
3. As provas 1 a 7 passam, e as provas 1 a 4, 6 e 7 reprovaram na baseline (a 5 é regressão declarada). Os cinco controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O consentimento continua exigido a cada vinculação, no onboarding e em Configurações, e Configurações › WhatsApp e Configurações › IA não mudaram de comportamento.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` das etapas são decididos pelo gate renderizado: `validate:ui` nas cinco larguras e o gate autenticado dentro de `validate:integration`. O gate tem os **245** testes da baseline e **0** retentativas. O comportamento do §3 continua.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. D-106 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §7 não foi feita.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** as etapas num aparelho real; os quadros 4.3, 4.4, 4.5 e 4.7 a 4.10; a fase de consentimento em Configurações; a duração real do teste.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e comparação da baseline (§2 e os quatro quadros); 3.1 portado, com o template de (c) e 3.2 sem piora |
| WU-02 | STANDARD | WU-01 | 4.1 e 4.2 portados: eyebrow, textos e a fase de consentimento de (d) só no onboarding |
| WU-03 | STANDARD | WU-02 | 4.6 portado: título, descrição, prévia e itens de (f), com Configurações › IA igual |
| WU-04 | STANDARD | WU-03 | Provas 1 a 7 com o vermelho da baseline; asserções do §5 |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-04 | lint de `apps/frontend` |
| WU-07 | DETERMINISTIC | WU-04 | testes dirigidos: `goal099-onboarding-ia-whatsapp` |
| WU-08 | DETERMINISTIC | WU-05, WU-06, WU-07 | validate-core |
| WU-09 | DETERMINISTIC | WU-08 | gate-tests |
| WU-10 | DETERMINISTIC | WU-08 | validate-ui |
| WU-11 | DETERMINISTIC | WU-08 | validate-integration |
| WU-12 | STANDARD | WU-09, WU-10 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-13 | DETERMINISTIC | WU-12 | git-diff-check final |
