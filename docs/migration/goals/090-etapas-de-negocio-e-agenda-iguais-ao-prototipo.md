# Goal 090 — Etapas de Negócio e Agenda iguais ao protótipo

**Status: READY.** Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal089 ACCEPTED](../reviews/089-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 1.2, 1.3, 2.2, 2.3, 2.4, 2.5, 2.6

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED) como "Etapas do onboarding iguais ao protótipo", com doze quadros, a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01). READY na v117, com o mesmo ID e **título e escopo precisados**: fica com as etapas dos capítulos "Seu negócio" e "Sua agenda" que têm quadro. Os quadros 3.1, 4.1, 4.2 e 4.6 vão para o **099**, novo e PLANNED. O 2.I1 vai para o **097**. O motivo está na v117 do MASTER_PLAN.

## Baseline aceita

Baseline aceita: `f9bb86c26039d417097d8ff2122df8dd8415b07e`

Goal anterior: 089 — Casca do onboarding igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal089 já integrado em `main` (origem `0bbb840722ed6eab58225c5e1a6f94ece4529115`). A virada de status do documento do Goal089 para `ACCEPTED` **não** entrou no commit de fechamento: veio no commit documental seguinte, `6d25413`, que não é baseline. **Duas rodadas**; a rodada 1 teve seis blockers. **D-104** aceita. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, da execução final do Goal089 ([review089](../reviews/089-review.md), [CURRENT_STATE](../CURRENT_STATE.md), [VALIDATION_GATE](../VALIDATION_GATE.md)): `validate:core` **17** passos, **15** `passed` e **2** `skipped`; `test:frontend` **133** arquivos e **1430** testes; `test:gate` **233**; `validate:ui` **169** `passed`, **21** `skipped` e **0** retentativas (com `CI=1`); `validate:integration` **36** passos `passed`, com o gate autenticado em **245** testes e **0** retentativas.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Se divergir dos números acima, o relatório diz por quê. `test:gate` pode exigir `npx prisma generate` no ai-orchestrator antes: é pré-condição do harness, não efeito do diff.

**Ambiente.** O review089 registra que, neste Windows, `validate:ui` só passou sem retentativa com `CI=1`, e `validate:integration` com `CI=1` e `VITEST_MAX_WORKERS=1`, por falta de memória. Use essas variáveis de ambiente se precisar. Não edite configuração para isso. Se `test:scheduling-integration` falhar em `goal008-agenda.test.ts` com `completed: 2`, verifique se o banco do Scheduling sobrou de uma corrida interrompida (observação 4 do aceite do review089) antes de declarar a falha de ambiente.

## Objetivo e posição

O Goal089 portou a moldura do onboarding: topo, sidebar, stepper, painel, título e CTA ancorado. O conteúdo próprio das outras etapas continuou divergente, como o §2 do Goal089 previa. Este Goal porta o conteúdo das sete etapas dos capítulos "Seu negócio" e "Sua agenda" que têm quadro e que a conta do `visual:compare` alcança.

Critério: **`/onboarding/modalidade`, `/onboarding/endereco`, `/onboarding/quando-importar`, `/onboarding/servico-nome`, `/onboarding/servicos-adicionais`, `/onboarding/dias-de-atendimento` e `/onboarding/horarios` iguais aos quadros 1.2, 1.3, 2.2, 2.3, 2.4, 2.5 e 2.6 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`.

**Por que agora e por que só estes sete.** A moldura é a dependência deste Goal, e está fechada. Os sete quadros vêm do mesmo arquivo do protótipo (`Onboarding-1-Negocio-e-Agenda*.dc.html`) e tocam os mesmos componentes (`blocks/business.tsx` e `blocks/schedule.tsx`). Os quadros do capítulo "Sua IA" e "WhatsApp" (3.1, 4.1, 4.2, 4.6) dependem de uma escolha de fluxo: o protótipo separa o consentimento da conexão, e o app junta os dois. Eles ficam para o 099. O 2.I1 é a tela do módulo de importação, a mesma de `/importacao`, e a conta do `visual:compare` não o alcança (ela grava a fonte da agenda `ATENDLY` e não tem sessão de importação). Ele fica para o 097, que já porta I1 e I2.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Onboarding-1-Negocio-e-Agenda.dc.html`, com `-Tablet` e `-Desktop`) e no código. O `visual:compare` final do Goal089 dá, por device (mobile / retrato / paisagem / desktop): 1.2 **4,5 / 1,8 / 2,2 / 1,6**; 1.3 **16,7 / 5,2 / 5,3 / 4,2**; 2.2 **11,8 / 7,5 / 7,3 / 5,9**; 2.3 **5,9 / 2,7 / 3,0 / 2,3**; 2.4 **4,5 / 1,8 / 2,2 / 1,7**; 2.5 **6,8 / 2,7 / 3,1 / 2,3**; 2.6 **5,8 / 4,3 / 3,5 / 2,6**. A porcentagem é tendência; a leitura é a dos `side-by-side.png`.

1. **Eyebrow.** Em todos os quadros do capítulo 2 o eyebrow é o nome do capítulo, "Sua agenda". O app usa o primeiro item de `onboardingScenarios` (`scenarios.ts`): "Primeiro serviço", "Serviços adicionais", "Disponibilidade" e "Horário habitual". Em 1.2 e 1.3 o app já mostra "Seu negócio".
2. **Títulos e descrições.** Os quadros têm textos diferentes dos do app em 2.3 ("Qual é o seu primeiro serviço?" / "Comece pelo mais comum. Os outros você adiciona depois."), 2.4 ("Seus serviços" / "Adicione o que seus clientes mais pedem. Você pode ajustar tudo depois."), 2.2 ("A importação acontece uma única vez e leva alguns minutos. Depois dela, a Atendly passa a ser sua agenda oficial.") e 2.6 ("Vale para segunda a sábado. Pausas e bloqueios você configura depois."). O 2.5 não tem descrição. O Product Vault não fixa esses textos: a busca pelos títulos do app e dos quadros só acha as respostas 828 e 964 de `04-Referencia/99-Perguntas-e-Respostas.md`, que tratam do fluxo e não do texto.
3. **2.2 Importar agora ou depois.** O quadro tem uma ilustração "Minha Agenda → uma vez → Atendly" e, no rodapé, "Importar agora" como ação principal em cima, "Fazer depois" embaixo e a nota "Se fizer depois, a importação fica em Mais › Importação." O app não tem a ilustração, põe a nota no corpo (`scheduleStepBody`, `onboarding-note` com ícone) e mostra "Fazer depois" antes de "Importar agora" (`OnboardingScreen.tsx`).
4. **2.3 Primeiro serviço.** O CTA do quadro é "Salvar serviço"; o do app, "Continuar". Os controles (nome, duração de 5 em 5 com atalhos 30/60/90, os quatro tipos de preço e o preço com máscara) já existem desde D-094.
5. **2.4 Seus serviços.** O quadro mostra **todos** os serviços num cartão de lista (raio 16, borda `#E5DED4`, fundo `#FFFDFA`, linhas com borda superior), cada linha com nome (15 px, 600), "duração · preço" (13 px, `#5F574E`, "sem preço informado" em `#716859`) e um lápis à direita. Embaixo vêm o botão tracejado "Adicionar outro serviço" (52 px, raio 14, borda 1,5 px tracejada `#B9B1A6`, texto `#0F5F63`) e a nota "Recorrência, descrição e instruções para a IA ficam para depois, em Serviços." O app lista só os adicionais (`additional` filtra `draft.serviceId`), em `summary-row`, e o "Adicionar outro serviço" é `.btn .btn-secondary`. O onboarding não tem edição de serviço.
6. **2.5 Dias de atendimento.** Sete pílulas e uma linha-resumo com ícone, "Segunda a sábado · 6 dias por semana". O app já tem as pílulas e o resumo em `days-summary` (D-094, item 7); a diferença é de composição e estilo.
7. **2.6 Horário-base.** Rótulos "Começa" e "Termina" (o app usa "Início" e "Fim"), hora em Literata, régua de 0 a 24 h com as marcas 0h, 6h, 12h, 18h e 24h, e "Personalizar dias diferentes" como cartão com subtítulo "Ex.: sábado até mais cedo" e chevron (o app usa `.btn .btn-secondary`). A descrição diz para quais dias o horário vale.
8. **1.3 Endereço.** O quadro tem CEP, uma linha "Preenchido pelo CEP" com bairro e cidade, "Rua e número" e "Complemento (opcional)", e mostra o teclado aberto. O app tem um campo só, "Endereço do seu espaço", gravado como texto único em `business.address` (`blocks/business.tsx`). A busca por CEP está **pendente de decisão humana** (D-094, item 9), e campos estruturados mudariam o contrato. O `targets.json` manda ignorar o teclado.
9. **1.2 Modalidade.** Já está próximo do quadro (cartões com ícone e indicador, D-094, item 4). Conferir espaçamento, raios, tipografia e o estado selecionado contra o quadro.
10. **Regras mortas** (observação 3 do review089). Sobram regras `.onboarding-main` dentro de `@media (max-width: 767px)` em `atendly.css`. A classe ainda é usada por estados de carregamento.

## Escolhas de desenho desta passada

**(a) O eyebrow é o capítulo.** Nas sete etapas, o eyebrow é o nome do capítulo, como no quadro: "Seu negócio" em `modalidade` e `endereco`, "Sua agenda" em `quando-importar`, `servico-nome`, `servicos-adicionais`, `dias-de-atendimento` e `horarios`. O Developer escolhe entre mudar o primeiro item de `onboardingScenarios` dessas etapas ou derivar o eyebrow do capítulo (`blockForScenario`). Se derivar, o relatório lista toda etapa fora destas sete cujo eyebrow mudou, e cada uma precisa bater com o próprio quadro. `agenda-atendly-pronta` e as etapas dos capítulos 3 e 4 não mudam neste Goal.

**(b) Textos do quadro.** Títulos, descrições, rótulos de campo, CTAs e notas das sete etapas passam a ser os do quadro (evidência 2 a 7). As mensagens de validação, os nomes acessíveis dos controles e o que é gravado não mudam, salvo onde este documento diz.

**(c) 2.2 com a ilustração e a ordem do quadro.** A ilustração "Minha Agenda → uma vez → Atendly" é decorativa (`aria-hidden`), porque o título e a descrição já dizem o que ela mostra. As ações ficam empilhadas no rodapé: "Importar agora" primeiro, "Fazer depois" depois e a nota embaixo. A ordem no DOM é a ordem visual. A gravação de cada ação não muda.

**(d) 2.3 com "Salvar serviço".** O CTA muda de texto. A gravação e o destino não mudam.

**(e) 2.4 lista todos os serviços.** O cartão mostra o primeiro serviço (o do rascunho) e os adicionais, nessa ordem, com "duração · preço" no formato de `formatPrice` de `blocks/schedule.tsx` (D-099, Goal084). Preço não informado aparece como texto discreto, não como erro. **Sem lápis:** o onboarding não tem edição de serviço, e um ícone que parece ação sem ser ação engana. É divergência declarada. O "Adicionar outro serviço" vira o botão tracejado do quadro e continua abrindo o formulário em linha, que não tem quadro e segue o estilo dos campos de 2.3.

**(f) 2.6 diz para quais dias vale.** A descrição usa o mesmo resumo de dias de 2.5, em minúsculas depois de "Vale para" ("Vale para segunda a sábado."), seguido de "Pausas e bloqueios você configura depois." Os campos ganham os rótulos "Começa" e "Termina". A régua ganha as cinco marcas. "Personalizar dias diferentes" vira o cartão do quadro, continua `button` com `aria-expanded`, e o nome acessível começa por "Personalizar dias diferentes".

**(g) 1.3 continua com um campo só.** O campo segue o estilo de campo do quadro (rótulo, altura, raio, borda, tipografia). CEP, a linha "Preenchido pelo CEP", "Rua e número" e "Complemento" não entram: dependem da busca por CEP, pendente de decisão humana, e de mudança de contrato. É divergência declarada.

**(h) Regras mortas.** As regras `.onboarding-*` que nenhum seletor vivo usa saem de `atendly.css`. Antes de remover, confira o uso em `src/`. A classe `.onboarding-main` fica enquanto um estado de carregamento a usar.

**Divergências declaradas, que não contam como defeito na comparação:**

1. "Sair" (D-104, item (e)).
2. A barra de status e o indicador de início do iPhone nos quadros mobile.
3. Dados da conta de teste que não são layout: nome e preço dos serviços, quantos serviços a conta tem em 2.4, os dias e horários marcados, o endereço e o estado habilitado do "Continuar".
4. 1.3: um campo de endereço no lugar de CEP, bairro e cidade, rua e complemento, por (g); o teclado do quadro e o CTA logo acima dele (no app o CTA fica ancorado no rodapé, D-104 (f)).
5. 2.4: nenhum lápis nas linhas, por (e).
6. O instante da animação de entrada das linhas (`at-reveal`).

## Escopo obrigatório

### 1. As sete etapas iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Onboarding-1-Negocio-e-Agenda.dc.html` (mobile), `Onboarding-1-Negocio-e-Agenda-Tablet.dc.html` ("Onboarding / <rótulo> / Portrait" e "… / Landscape") e `Onboarding-1-Negocio-e-Agenda-Desktop.dc.html` ("… / Desktop"). Os rótulos são "Modalidade", "Endereço", "Importar agora ou depois", "Primeiro serviço", "Seus serviços", "Dias de atendimento" e "Horário-base".

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença. A moldura é a do Goal089 e não muda.

Repita `npm run visual:compare -- --target 1.2,1.3,2.2,2.3,2.4,2.5,2.6` até não haver divergência visível em nenhum dos quatro devices além das declaradas. Para cada quadro e device, o relatório final traz o diff final e o que ainda difere, com o motivo.

### 2. As etapas vizinhas não pioram

Rode `npm run visual:compare -- --target 0,1.1,2.1,3.2,3.1,4.1,4.2,4.6` no início e no fim, e cole o diff de cada device das duas execuções. 0, 1.1, 2.1 e 3.2 são os quadros do Goal089 e não podem piorar. Toda piora de device tem causa medida no relatório.

A moldura, `agenda-atendly-pronta`, a etapa `importacao`, as etapas dos capítulos 3 e 4, a área logada e `/importacao` fora do onboarding **não** mudam, salvo o eyebrow de (a) se o Developer derivar do capítulo.

### 3. Comportamento preservado

- As rotas, a ordem das etapas, `nextRequiredStep`, a retomada, os destinos do chevron e o guard da `importacao` não mudam.
- O que cada etapa grava não muda: `PATCH /v1/onboarding` (negócio, fonte da agenda, serviço, disponibilidade) e `POST /v1/services` levam os mesmos campos e valores de antes, incluindo o preço em reais (D-094, item 6) e os horários por dia.
- "Fazer depois" e "Importar agora" gravam e levam ao mesmo destino de antes (`skipImportAndGoToScratch` e o envio da etapa).
- A validação inline, o foco no primeiro inválido e os erros de servidor no campo (D-083, item 4) continuam. O formulário de adicional valida só ao "Adicionar" (`data-validation-scope`).
- A duração de 5 em 5, os atalhos com `aria-pressed`, a máscara de preço, as pílulas `sr-only` de nome completo e o resumo `aria-live="polite"` (D-094, itens 5 a 7) continuam.
- O `RouteAnnouncer` continua anunciando a troca de etapa.
- As medidas do onboarding no gate autenticado (D-083, item 10, e G-6 de D-104) continuam passando sem mudança.

### 4. Provas novas

`apps/frontend/tests/goal090-onboarding-steps.test.tsx`, com dublês do runtime no padrão dos testes do Goal072, do Goal079 e do Goal089:

1. O eyebrow é "Seu negócio" em `modalidade` e `endereco`, e "Sua agenda" em `quando-importar`, `servico-nome`, `servicos-adicionais`, `dias-de-atendimento` e `horarios`.
2. Em `quando-importar`, a ilustração existe com `aria-hidden`; "Importar agora" vem antes de "Fazer depois" na ordem do DOM; a nota vem depois das duas ações. Cada ação grava o que gravava.
3. Em `servicos-adicionais`, a lista mostra o serviço do rascunho e os adicionais, nessa ordem, cada um com "duração · preço"; o serviço sem preço mostra "sem preço informado" sem `role="alert"`.
4. Em `servico-nome`, o botão principal é "Salvar serviço", e o `PATCH` tem o mesmo corpo de antes.
5. Em `horarios`, a descrição muda com os dias do rascunho: segunda a sábado dá "Vale para segunda a sábado."; segunda, quarta e sexta dá "Vale para segunda, quarta e sexta."; os campos se chamam "Começa" e "Termina".
6. Regressão de gravação: `endereco`, `dias-de-atendimento`, `horarios` (com e sem dia personalizado) e o "Adicionar" de `servicos-adicionais` gravam o mesmo corpo de antes.

As provas 1 a 5 **reprovam na baseline**; a 6 pode passar e é regressão declarada. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash. Este vermelho é obrigatório nesta rodada: o review089 aceitou sem ele, e este Goal não repete a exceção.

Nenhuma medida nova no gate autenticado. Se o Developer achar que alguma escolha só se prova renderizada, o relatório diz qual e por quê, e a medida entra em `e2e/authenticated-matrix.spec.ts` só por acréscimo.

### 5. Testes existentes

Continuam passando. Só muda asserção que dependa de: eyebrow das etapas do capítulo 2, textos de título, descrição, rótulo ou CTA trocados por (b), ordem das ações de `quando-importar`, lista de `servicos-adicionais` sem o primeiro serviço, ou rótulos "Início" e "Fim". O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O eyebrow de `servico-nome` volta a ser "Primeiro serviço": a prova 1 reprova.
2. "Fazer depois" volta para antes de "Importar agora": a prova 2 reprova.
3. A lista de `servicos-adicionais` volta a excluir o serviço do rascunho: a prova 3 reprova.
4. A descrição de `horarios` volta a ser fixa: a prova 5 reprova.

### 7. O que só uma pessoa confere

- Num celular real, o teclado aberto em Endereço e em Primeiro serviço, com o CTA ancorado.
- Se a régua de horas e o resumo dos dias leem bem num aparelho real.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

## Pontos de implementação

- `apps/frontend/src/features/onboarding/scenarios.ts`: textos de (b) e, se for a escolha, o eyebrow de (a).
- `apps/frontend/src/features/onboarding/blocks/business.tsx`: 1.2 e 1.3.
- `apps/frontend/src/features/onboarding/blocks/schedule.tsx`: 2.2 a 2.6.
- `apps/frontend/src/features/onboarding/OnboardingScreen.tsx`: ações de `quando-importar` e o CTA de `servico-nome`; o eyebrow, se for derivado do capítulo.
- `apps/frontend/src/features/onboarding/blocks/shared.tsx` e `OnboardingShell.tsx`, só se a etapa precisar passar algo novo para a moldura. A moldura não muda.
- `apps/frontend/src/shared/styles/atendly.css`, nas regras `.onboarding-*`, `.days-*`, `.hours-*`, `.service-summary` e `.summary-row`, mais as regras novas das sete etapas. Se o Developer preferir, as regras novas podem ir para `shared/styles/atendly-onboarding.css`, importada como as outras folhas de módulo. O relatório diz qual foi a escolha.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- 3.1, 4.1, 4.2 e 4.6, incluindo a separação entre consentimento e conexão do WhatsApp (Goal099) e as frases de exemplo de 3.2 que vêm de `demo.ts` (observação 1 do review089, também do 099).
- 2.I1 e as telas do módulo de importação (Goal097).
- 2.7 ("Horários por dia"): fora da varredura, porque a conta de teste não alcança o estado.
- A busca por CEP e campos de endereço estruturados (pendente de decisão humana, D-094, item 9).
- Edição de serviço dentro do onboarding.
- Qualquer mudança em rota, fluxo, contrato, BFF, serviços, `scripts/`, `docs/design-reference/`, vault e `e2e/visual/targets.json`. Mude o mapa só se o alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-105** em `PROPOSED`, no formato de D-103 e D-104. Ela diz (a) a (h), com o motivo de cada um, e as divergências declaradas. O "Revisar se" cobre três casos: uma pessoa decidir a busca por CEP; o onboarding ganhar edição de serviço; ou o vault fixar textos diferentes dos quadros para estas etapas.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que as sete etapas seguem os quadros e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim e a contagem do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare` dos sete quadros e das etapas vizinhas do §2 na baseline, e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target 1.2,1.3,2.2,2.3,2.4,2.5,2.6`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e o `visual:compare` dos sete quadros e das etapas do §2.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

No relatório, para cada device dos sete quadros, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target 1.2,1.3,2.2,2.3,2.4,2.5,2.6` e abriu os vinte e oito `side-by-side.png`. As sete etapas estão **iguais aos quadros 1.2, 1.3, 2.2, 2.3, 2.4, 2.5 e 2.6 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das declaradas.
2. 0, 1.1, 2.1 e 3.2 não pioraram, e as etapas 3.1, 4.1, 4.2 e 4.6 não quebraram; toda piora tem causa medida.
3. As provas 1 a 6 passam, e as provas 1 a 5 reprovaram na baseline (a 6 é regressão declarada). Os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. Largura, toque, contraste, foco e `prefers-reduced-motion` das etapas são decididos pelo gate renderizado: `validate:ui` nas cinco larguras e o gate autenticado dentro de `validate:integration`. O gate tem os **245** testes da baseline e **0** retentativas. O comportamento do §3 continua.
5. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
6. D-105 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §7 não foi feita.
7. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** as etapas num aparelho real com o teclado aberto; 2.7; o conteúdo dos capítulos "Sua IA" e "WhatsApp"; a importação dentro do onboarding.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e comparação da baseline; 1.2 e 1.3 portados; eyebrow do capítulo (a); regras mortas (h) |
| WU-02 | STANDARD | WU-01 | 2.2, 2.3 e 2.4 portados, com a ilustração, a ordem das ações e a lista com o primeiro serviço |
| WU-03 | STANDARD | WU-02 | 2.5 e 2.6 portados, com a descrição derivada dos dias, "Começa" e "Termina", a régua e o cartão de personalizar |
| WU-04 | STANDARD | WU-03 | Provas 1 a 6 com o vermelho da baseline; asserções do §5 |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-04 | lint de `apps/frontend` |
| WU-07 | DETERMINISTIC | WU-04 | testes dirigidos: `goal090-onboarding-steps` |
| WU-08 | DETERMINISTIC | WU-05, WU-06, WU-07 | validate-core |
| WU-09 | DETERMINISTIC | WU-08 | gate-tests |
| WU-10 | DETERMINISTIC | WU-08 | validate-ui |
| WU-11 | DETERMINISTIC | WU-08 | validate-integration |
| WU-12 | STANDARD | WU-09, WU-10 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-13 | DETERMINISTIC | WU-12 | git-diff-check final |
