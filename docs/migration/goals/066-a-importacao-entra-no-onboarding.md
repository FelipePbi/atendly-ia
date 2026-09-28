# Goal 066 — A importação entra no onboarding

**Status: ACCEPTED.** Preparado em 2026-09-28 pelo Tech Lead Agent após [Goal065 ACCEPTED](../reviews/065-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v89 acrescentou QA O-17, O-18, O-19 e O-22, que descrevem as telas que este Goal substitui. A v90 precisa o escopo com evidência conferida no código da baseline e acrescenta a observação 5 do [review065](../reviews/065-review.md), que é escrita com perda no bloco de horários.

## Baseline aceita

Baseline aceita: `f565978a8da01165fd3b397f5c1a9ef58dd6e747`

Goal anterior: 065 — Onboarding conforme o vault

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal065 já integrado em `main` (origem `bc0e8a66aac400225c85ac6eac85e009fc8ff66b`). **Duas rodadas**, com 11 e 0 blockers. **D-083** foi aceita e [FINAL_AUDIT §44](../FINAL_AUDIT.md) escrita sem reescrever §4 a §43. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O commit documental seguinte, `6580232`, só passa o status do documento do Goal065 para `ACCEPTED` e não é a baseline. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review065](../reviews/065-review.md), rodada 2: `test:gate` **233**; `test:frontend` **90** arquivos e **927** testes; integração do BFF **53** arquivos e **428** testes; integração do Scheduling **16** arquivos e **124** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `audit:static` **33** de **34**, **1** pulada; `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **125** `expected`, **0** `unexpected`, **0** `flaky` e **0** retentativas nas execuções do Developer.

## Objetivo e posição

Aplicar **U-09** ([DECISIONS](../DECISIONS.md)): a importação fica nos dois lugares. O onboarding pergunta pelo sistema atual e oferece "Importar agora / Fazer depois", reaproveitando a mesma experiência de importação dos Goals 060 a 062. Mais › Importação continua para quem pulou. Fonte do produto: `docs/product-vault/02-Fluxos/01-Onboarding.md` §"Fluxo consolidado", §4, §5A e §5B; `03-UX-UI/04-Especificacao-das-Telas.md` §"Onboarding"; perguntas 247 a 252 e 959 de `04-Referencia/99-Perguntas-e-Respostas.md`.

Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79), seção 2b:

- **QA O-17**: duas telas sem decisão ("Onde seus agendamentos serão controlados?", com um card só, e "A Agenda Atendly cuidará dos seus horários") antes da pergunta real.
- **QA O-18**: fuso horário exibido como identificador técnico (`America/Sao_Paulo`).
- **QA O-19**: "Começar do zero" pré-marcado.
- **QA O-20** (ALTA): escolher "Importar do Minha Agenda" só mostra um aviso e segue para o primeiro serviço.
- **QA O-21**: o "depois" aponta para "Configurações → Agenda", e não para "Mais › Importação".
- **QA O-22**: o ✓ de seleção cobre o fim do título do card a 390 px.

Fecha também a **observação 5 do [review065](../reviews/065-review.md)**: um dia personalizado só no horário de início congela o fim antigo quando o fim do intervalo-base muda, e a gravação leva esse fim antigo.

A posição é a da v78, logo depois do 065. O 065 deixou o bloco "Sua agenda" como estava, de propósito, para este Goal.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **As três telas ainda existem.** `onboardingFlow` (`apps/frontend/src/features/onboarding/blocks.ts`) tem `fonte-da-agenda`, `agenda-atendly-confirmar` e `agenda-atendly-metodo` entre `modalidade` e `servico-nome`. Os títulos estão em `scenarios.ts` ("Fonte oficial", "Sua fonte oficial", "Escolha um caminho").
2. **A escolha de importar não faz nada.** Em `blocks/schedule.tsx`, `agenda-atendly-metodo` guarda `servicePopulation` só no rascunho, com `SCRATCH` como valor inicial (`OnboardingRuntime.tsx`). Com `IMPORT`, a tela mostra "A importação acontece depois, em Configurações → Agenda." e `persistScheduleStep` vai para `servico-nome` do mesmo jeito.
3. **O fuso aparece cru.** `agenda-atendly-confirmar` mostra `["Fuso horário", draft.timezone]`.
4. **A única gravação do bloco é `calendar.source`.** `fonte-da-agenda` grava `calendar: { source: "ATENDLY", timezone }` por `PATCH /v1/onboarding`. O BFF só aceita `ATENDLY` (`sourceSchema`, `apps/bff/src/modules/onboarding/routes.ts`) e chama `scheduling.configureCalendar`, que faz `calendarSettings.upsert` no Scheduling (`apps/scheduling-service/src/modules/internal-api/routes.ts`, perto da linha 572). `nextRequiredStep` devolve `fonte-da-agenda` enquanto `calendar.source` é nulo.
5. **A importação exige esse registro.** `import-execution-service.ts` (Scheduling, perto da linha 364) recusa a execução com `404 CALENDAR_SETTINGS_NOT_FOUND` sem `calendarSettings`. Logo, o onboarding precisa gravar `calendar.source` antes de a pessoa executar a importação.
6. **A experiência de importação só existe na área logada.** `/importacao` monta `ImportsScreen`, que chama `useShellConfig`. Esse hook lança erro fora de `ShellConfigProvider` (`apps/frontend/src/shared/layout/ShellConfig.tsx`), e o onboarding não está dentro do shell da plataforma. Todas as telas do módulo usam `ImportsPage` (`ImportsLayout.tsx`), que desenha um link "Configurações" e um `<h1>` próprios. O estado da importação vem de `migration.getImportState` e decide a tela: `history` (concluída), `session` (viva, em análise, revisão ou execução) ou nenhum dos dois (conectar).
7. **Mais › Importação já existe.** `MORE_DESTINATIONS` (`apps/frontend/src/shared/layout/navigation.ts`) tem `/importacao` com o rótulo "Importação", e `SettingsHub` aponta para a mesma rota.
8. **O onboarding já relê serviços e horários do Scheduling.** `GET /v1/onboarding` lista serviços e disponibilidade do Scheduling (`apps/bff/src/lib/onboarding-state.ts`). Depois de uma importação concluída, os serviços e os horários importados já aparecem no estado, e `nextRequiredStep` já pula `servico-nome` e `dias-de-atendimento` quando existem. Não há mudança de BFF para isso.
9. **O gate autenticado já mede o onboarding.** `ONBOARDING_ROUTES` (`apps/frontend/e2e/routes.ts`) tem dez etapas medidas com a segunda conta do ensaio do Goal033. Essa conta para depois do bloco de negócio, com "Local próprio", sem `calendar.source` e sem sessão de importação. As três telas antigas não estão em `ONBOARDING_ROUTES`.

## Escolhas de desenho desta passada

- **Sequência.** … Modalidade → Endereço (só com "Local próprio") → **Sistema atual** → se "Sim, quero importar": **Quando importar** → se "Importar agora": **Importação** → Primeiro serviço, Dias e Horários **só se a importação não os trouxe** → Demonstração da IA. Com "Não, começar do zero" ou "Fazer depois", o caminho é o de hoje: Primeiro serviço → Serviços adicionais → Dias → Horários → Agenda pronta → Demonstração da IA.
- **IDs de rota:** `sistema-atual`, `quando-importar` e `importacao`. `fonte-da-agenda`, `agenda-atendly-confirmar` e `agenda-atendly-metodo` deixam de ser etapas e redirecionam para `sistema-atual`, pelo mesmo mecanismo de `legacyStepRedirects`.
- **Sistema atual.** Pergunta do vault: "Você já usa algum sistema para organizar seus clientes e agendamentos?". Dois cards que **são** a ação, como no protótipo 2.1: "Sim, quero importar" e "Não, começar do zero". Nenhum vem marcado. Não há "Continuar" nem ✓ de seleção, então QA O-22 fecha por construção.
- **Quando importar.** Título "Quer importar agora?". Mostra que a cópia é do Minha Agenda para a Atendly, uma vez só. "Importar agora" é o botão principal, e "Fazer depois" é o secundário. Texto: "Se fizer depois, a importação fica em Mais › Importação.". Não há tela separada de escolha de origem: o produto só tem o Minha Agenda (pergunta 250), e uma tela de um card só é o defeito de QA O-17. D-084 registra essa escolha para a conferência humana.
- **Quando o bloco grava.** "Sim, quero importar" só navega. "Importar agora", "Fazer depois" e "Não, começar do zero" gravam `calendar: { source: "ATENDLY" }` pelo `PATCH /v1/onboarding` de hoje, e só avançam com `200`. Assim a importação sempre encontra `calendarSettings` (evidência 5), e quem sai antes de responder volta para `sistema-atual`. Nenhum campo novo é gravado, e o BFF não muda.
- **A importação no onboarding é a mesma de `/importacao`.** O módulo `features/imports` passa a ter uma entrada que não depende do shell da plataforma. `/importacao` e a etapa `importacao` do onboarding montam as mesmas telas (conectar, análise e revisão, conflitos, execução e resultado), sobre o mesmo `getImportState` e as mesmas chamadas. O que muda entre as duas é só a moldura:
  - `/importacao` continua como hoje, com o link "Configurações" e `useShellConfig`;
  - no onboarding, a moldura é a do onboarding (progresso, "Sair"), sem link para Configurações, e nenhum link da importação sai do onboarding. A tela tem um `<h1>` só.
- **Depois da importação, vault §5B e protótipo.** Com a importação concluída (`history`), a etapa mostra o resultado e "Continuar". "Continuar" vai para a primeira pendência, nesta ordem:
  - nenhum serviço ativo: `servico-nome`, com um aviso de que nenhum serviço importado está ativo e é preciso cadastrar pelo menos um;
  - nenhuma regra de horário ativa: `dias-de-atendimento`, com um aviso de que a importação não trouxe horários;
  - nada pendente: `demonstracao-da-ia`.
- **Retomada.** Com `calendar.source` gravado, sem serviço ativo e com uma sessão de importação viva, `nextRequiredStep` devolve `importacao`. Com importação concluída, vale a ordem do item anterior. Sem sessão e sem histórico, a regra de hoje (`servico-nome`). Se a leitura do estado da importação falhar, a retomada segue a regra sem importação e não bloqueia o onboarding. A importação continua alcançável por Mais › Importação.
- **Progresso.** `quando-importar` e `importacao` são desvio condicional, como `endereco`: usam a posição da etapa que sempre as antecede. A barra nunca volta atrás no caminho de quem começa do zero.
- **Horário personalizado só no início (observação 5 do review065).** Personalizar só o início de um dia não congela o fim. O dia acompanha o fim do intervalo-base enquanto o fim dele não foi personalizado, e o mesmo vale para o início. A gravação manda, para cada dia, o intervalo que a tela mostra.

## Fora do escopo

- Mudar a importação em si: leitura da origem, análise, revisão, conflitos, execução, conclusão, o formulário de conexão (Goal060) ou os textos das telas de importação. O que muda é só a moldura e a saída para o onboarding.
- QA IM-01 a IM-11 além do que os Goals 060 a 062 já fecharam.
- Fidelidade visual ao protótipo `Onboarding-2-Importacao*` (diagrama, ilustrações, composição): Goal072, com os outros achados de forma do onboarding.
- A observação 3 do review065 (ordem de Tab invertida por `row-reverse` na introdução do WhatsApp, a partir do tablet): Goal072, que refaz a composição dessas telas.
- A observação 4 do review065 (erro de servidor de `price` negativo cai no nome do serviço): fica registrada sem Goal. A validação inline do 065 recusa o valor negativo antes de enviar, e o caminho só é alcançável fora da tela.
- Mudar `apps/bff/`, `apps/scheduling-service/`, `POST /v1/onboarding/complete`, as regras de conclusão, a ativação da IA ou o modelo de dados. Nenhuma migration.
- Checklist da Home, Configurações (Goal067), marca e Home (Goal068).
- Editar o Product Vault ou o `QA_LOCAL_REVIEW.md`.
- As observações abertas dos reviews 059 a 065, 070 e 071 listadas em [MIGRATION_STATUS](../MIGRATION_STATUS.md). Se `goal025-account-purge` (observação 1 do review071), `goal008-agenda` (observação 4 do review059) ou o `net::ERR_NO_BUFFER_SPACE` do gate autenticado (observação 1 do review065) aparecerem em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa.

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas de QA O-17 a O-22 na seção 2b do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), e o parágrafo do protótipo logo acima da tabela;
- no vault: `02-Fluxos/01-Onboarding.md` §"Fluxo consolidado", §4, §5A e §5B; `03-UX-UI/04-Especificacao-das-Telas.md` §"Onboarding"; as perguntas 247 a 252 e 959 de `04-Referencia/99-Perguntas-e-Respostas.md`;
- no protótipo, só como referência de texto e de ordem: as telas 2.1 e 2.2 de `docs/design-reference/claude-design/prototype/project/Onboarding-1-Negocio-e-Agenda.dc.html` e o parágrafo de abertura de `Onboarding-2-Importacao.dc.html`;
- `apps/frontend/src/features/onboarding/` (`blocks.ts`, `scenarios.ts`, `OnboardingRuntime.tsx`, `OnboardingScreen.tsx`, `OnboardingShell.tsx`, `blocks/schedule.tsx`, `blocks/shared.tsx`) e `apps/frontend/src/app/onboarding/[step]/page.tsx`;
- `apps/frontend/src/features/imports/` (`ImportsScreen.tsx`, `ImportsLayout.tsx`, e as telas filhas só onde usam `ImportsPage` ou link de saída);
- `apps/frontend/src/shared/layout/ShellConfig.tsx` e `navigation.ts`, só para confirmar o que a evidência 6 e 7 dizem;
- os testes que montam o onboarding ou a importação em `apps/frontend/tests/` (procure por `fonte-da-agenda`, `agenda-atendly`, `OnboardingScreen` e `ImportsScreen`);
- `apps/frontend/e2e/routes.ts` e `apps/frontend/e2e/authenticated-matrix.spec.ts`, na parte de `ONBOARDING_ROUTES`.

## Pontos de implementação

- `apps/frontend/src/features/onboarding/` e `apps/frontend/src/app/onboarding/[step]/page.tsx`.
- `apps/frontend/src/features/imports/`, só para separar a moldura (shell da plataforma ou onboarding) das telas.
- A seção do onboarding e a da importação em `apps/frontend/src/shared/styles/`, se a moldura pedir.
- `apps/frontend/e2e/routes.ts` e `apps/frontend/e2e/authenticated-matrix.spec.ts`. `scripts/goal033-authenticated-ui-rehearsal.mjs` só se a segunda conta precisar de outro ponto de parada, sem mudar a conta principal.
- `apps/frontend/AGENTS.md`, se ele descrever a sequência do onboarding.
- Testes novos com prefixo `goal066-` em `apps/frontend/tests/`.

## Escopo obrigatório

### 1. Sistema atual e Quando importar (frontend)

- As etapas `sistema-atual` e `quando-importar` conforme "Escolhas de desenho", com os textos do vault e do protótipo.
- As três telas antigas saem da sequência, do progresso e de `blockForScenario`. As três rotas antigas redirecionam para `sistema-atual`.
- Os cards de `sistema-atual` são botões com nome acessível próprio. Nenhum tem estado selecionado, nem `aria-pressed`, nem ✓.
- Nenhuma etapa do bloco mostra fuso horário, "Fonte oficial" ou "Agenda Atendly" como escolha.
- `calendar.source` é gravado conforme "Quando o bloco grava". Falha no `PATCH` fica na etapa, com o erro de tela de sempre, e não avança.
- "Fazer depois" e "Não, começar do zero" levam a `servico-nome`. O texto "Configurações → Agenda" sai do onboarding.
- `servicePopulation` e o aviso de importação depois saem do rascunho e da tela.

### 2. A importação dentro do onboarding (frontend)

- A etapa `importacao` monta a experiência de importação conforme "Escolhas de desenho", pelo estado lido de `getImportState`. Ela nunca abre sessão só por montar.
- Dentro do onboarding, nenhuma tela da importação chama `useShellConfig`, mostra o link "Configurações" ou tem link que sai do onboarding. Cada tela tem um `<h1>` só.
- `/importacao` continua igual: mesmo shell, mesmo link, mesmas telas. Os testes existentes do módulo `features/imports` passam **sem mudança de asserção**.
- Com a importação concluída, "Continuar" segue a ordem de §5B de "Escolhas de desenho", com o aviso de cada caso.
- A retomada segue "Retomada", inclusive quando a leitura do estado da importação falha.

### 3. Horário personalizado só no início (frontend)

- Conforme a última escolha de desenho. Vale também para o fim personalizado sozinho.
- A retomada continua como o 065 deixou: intervalo-base pelo mais frequente, e `dayHours` só com os dias diferentes.

### 4. O gate renderizado mede as etapas novas

- `ONBOARDING_ROUTES` ganha `sistema-atual`, `quando-importar` e `importacao`, esta no estado de conectar (a segunda conta não tem sessão de importação). Cada uma tem marcador de conteúdo próprio.
- As medidas são as de `e2e/measure.ts`, nas cinco larguras, com a sessão vinda do formulário de `/login`, como as outras etapas.
- As dez etapas medidas pelo 065 continuam medidas. A conta principal e as medidas dela não mudam.
- Os estados de análise, revisão, conflitos, execução e resultado dentro do onboarding ficam no jsdom, porque exigem uma origem real. O relatório diz isso.
- `AUTHENTICATED_ROUTES` e `ONBOARDING_ROUTES` não perdem rota. Nenhuma exceção nova em `KNOWN_*`.

### 5. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `f565978`.

1. **Frontend (jsdom):**
   - depois do endereço (ou da modalidade, sem "Local próprio"), a próxima etapa é `sistema-atual`; as três rotas antigas redirecionam para ela;
   - `sistema-atual` tem os dois cards do vault, nenhum marcado, sem `aria-pressed` e sem "Continuar";
   - "Sim, quero importar" não grava nada e leva a `quando-importar`; "Importar agora" grava `calendar.source` antes de montar a importação; "Fazer depois" e "Não, começar do zero" gravam `calendar.source` e levam a `servico-nome`;
   - `quando-importar` diz "Se fizer depois, a importação fica em Mais › Importação.", e nenhuma etapa do bloco contém "Configurações → Agenda", "Fonte oficial" ou `America/`;
   - a etapa `importacao`, sem sessão, mostra a tela de conectar do módulo de importação, sem o link "Configurações" e com um `<h1>` só;
   - com sessão viva, a retomada vai a `importacao` e mostra a tela da fase da sessão;
   - com importação concluída, "Continuar" vai a `servico-nome` sem serviço ativo, a `dias-de-atendimento` sem horário ativo e a `demonstracao-da-ia` sem pendência, cada um com o seu aviso;
   - com falha na leitura do estado da importação, a retomada vai à etapa da regra sem importação;
   - `/importacao` continua mostrando o link "Configurações" e registrando o shell;
   - um dia personalizado só no início, com o fim do intervalo-base mudado depois, grava o fim novo para esse dia; o mesmo para o fim personalizado sozinho.
2. **Gate renderizado:** as treze etapas de `ONBOARDING_ROUTES` passam nas cinco larguras dentro de `validate:integration`, com **0** retentativas.

Os testes existentes continuam passando. Só muda asserção que dependa das três telas antigas, da ordem das etapas ou do texto trocado. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. `sistema-atual` volta a pré-marcar "Não, começar do zero": o teste de nenhum card marcado reprova.
2. "Importar agora" deixa de gravar `calendar.source` antes da importação: o teste de ordem reprova.
3. A moldura do onboarding volta a mostrar o link "Configurações": o teste da etapa `importacao` reprova.
4. `nextRequiredStep` volta a ignorar a sessão viva de importação: o teste de retomada reprova.
5. Depois da importação concluída sem serviço ativo, "Continuar" vai direto a `demonstracao-da-ia`: o teste de §5B reprova.
6. O dia personalizado só no início volta a congelar o fim antigo: o teste de horário reprova.

### 7. O que só uma pessoa confere

- Que o onboarding com importação, percorrido num aparelho real contra uma conta real do Minha Agenda, segue o vault de ponta a ponta, e que quem termina a importação chega à demonstração da IA sem recadastro.
- Que a ausência de uma tela separada de escolha de origem é aceitável (D-084).
- Que as etapas novas batem com o protótipo aprovado (Goal072).

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 8. Documentação

No mesmo diff, por **acréscimo**:

- [DECISIONS](../DECISIONS.md) ganha **D-084** em `PROPOSED`, no formato de D-080 a D-083. Ela diz:
  - que U-09 fica aplicada e que D-036, que pôs a interface de importação só em Configurações, é revista nessa parte, sem retirar Mais › Importação;
  - a sequência nova do bloco "Sua agenda" e as rotas antigas redirecionadas;
  - quando o bloco grava `calendar.source`, e por quê (`CALENDAR_SETTINGS_NOT_FOUND`);
  - a mesma experiência de importação nas duas molduras;
  - a saída depois da importação (§5B) e a retomada;
  - a ausência de tela separada de escolha de origem, para conferência humana;
  - o horário personalizado só no início.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§45**, sem reescrever §4 a §44. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram:
  - a sequência nova e a importação no onboarding;
  - as etapas medidas pelo gate e os estados que ficam no jsdom;
  - a conferência humana pendente;
  - as contagens da execução final de cada suíte tocada (arquivos e testes), de `test:gate`, de `validate:ui` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- `apps/frontend/AGENTS.md`, só se descrever a sequência do onboarding.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e o Product Vault não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

**Ordem obrigatória, a mesma do Goal065:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`. `test:gate` precisa do client Prisma que `validate:core` gera.
4. Rode os seis controles do §6.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.

### 9. O que este Goal não pode fazer

- Não toca `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `tools/ia-loop/`, `docs/product-vault/` nem `QA_LOCAL_REVIEW.md`. Se a importação no onboarding exigir mudança fora de `apps/frontend/` (por exemplo, um estado que o BFF não devolve), o Developer para e relata, sem ampliar o escopo.
- Em `scripts/`, só o ponto de parada da segunda conta no ensaio do Goal033, e só se preciso.
- Nenhuma migration. Não acrescenta chamada `this.http.` (segue **42**).
- Não muda o comportamento de `/importacao`, as chamadas da importação, `POST /v1/onboarding/complete`, a ativação da IA, o painel de conexão do WhatsApp nem o teste real.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte. Teste de etapa que deixa de existir é substituído por teste da etapa que a substitui, e o relatório diz qual substitui qual.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Depois dos dados do negócio, o onboarding pergunta pelo sistema atual com dois cards sem padrão, e as três telas antigas redirecionam. Provado por execução jsdom do §5.1.
2. "Importar agora" grava `calendar.source` e abre a mesma experiência de `/importacao` dentro do onboarding, sem saída para Configurações; "Fazer depois" e "Começar do zero" levam ao primeiro serviço e apontam para Mais › Importação. Provado por execução jsdom do §5.1.
3. Depois da importação concluída, o onboarding pula o que a importação trouxe e pede só o que falta; a retomada volta à importação viva. Provado por execução jsdom do §5.1.
4. `/importacao` não muda: os testes existentes do módulo passam sem mudança de asserção. Provado por execução e por diff dos testes.
5. Dia personalizado só no início ou só no fim grava o intervalo que a tela mostra. Provado por execução jsdom do §5.1.
6. Largura, toque, contraste, foco e movimento de `sistema-atual`, `quando-importar` e `importacao` (estado de conectar) são decididos pelo gate autenticado dentro de `validate:integration`, nas cinco larguras. Os outros estados da importação no onboarding não são medidos pelo gate renderizado.
7. Os seis controles negativos do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
8. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **90**/**927**; integração do BFF **53**/**428**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **125** testes mais os das três etapas novas nas cinco larguras, e **0** retentativas. Provado por execução.
9. D-084 em `PROPOSED`, FINAL_AUDIT §45, CURRENT_STATE e VALIDATION_GATE foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §7 não foi feita. Provado por diff contra a execução.
10. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a importação dentro do onboarding funciona contra uma conta real do Minha Agenda (conferência humana);
- que os estados de análise, revisão, conflitos, execução e resultado dentro do onboarding cumprem largura, toque, contraste, foco e movimento;
- que as etapas novas batem com o protótipo aprovado (Goal072).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | `sistema-atual` e `quando-importar`, rotas antigas redirecionadas, gravação de `calendar.source`, textos, e o horário personalizado só no início, com testes jsdom (§1, §3) |
| WU-02 | STANDARD | WU-01 | Moldura da importação separada das telas, etapa `importacao` no onboarding, saída depois da importação e retomada, com testes jsdom (§2) |
| WU-03 | STANDARD | WU-02 | Etapas novas no gate autenticado (§4) |
| WU-04…WU-06 | DETERMINISTIC | WU-03 | typecheck e lint de `apps/frontend`, testes dirigidos `goal066` |
| WU-07 | DETERMINISTIC | WU-04…WU-06 | validate-core |
| WU-08…WU-10 | DETERMINISTIC | WU-07 | gate-tests, validate-ui e validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | Controles negativos (§6) e documentação (§8), depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
