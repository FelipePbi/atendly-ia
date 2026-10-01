# Goal 085 — A casca diz o estado real do WhatsApp e preenche a janela

(Até a v112, "Acabamento da casca, da Agenda e dos estados". O arquivo mantém o nome antigo para preservar os links do histórico.)

**Status: ACCEPTED.** Preparado de novo em 2026-10-01 pelo Tech Lead Agent após [Goal087 ACCEPTED](../reviews/087-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: H3

Histórico do status, preservado: PLANNED na v103; READY na v109 (sobre `10f2348`); de volta a PLANNED na v110 (o 086 passa à frente, por instrução do usuário) e mantido PLANNED na v111 (o 087 passa à frente, porque reescreve a casca). **READY de novo na v112**, com o mesmo ID, **título e escopo precisados sobre a casca do 087**: R-08 e R-09 saem deste Goal e passam aos Goals que portarem os quadros CL1 e A10 (motivo em "Objetivo e posição"). A decisão que este Goal propõe é **D-102**.

## Baseline aceita

Baseline aceita: `df620394401ea9391697288cd67aefa0a6d9fbc8`

Goal anterior: 087 — Navegação da área logada e Home idênticas ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal087 já integrado em `main` (origem `972ec31c4c19b76ef00bd04b7b729d2f427e6f0e`). A virada de status do documento do Goal087 para `ACCEPTED` **não** entrou no commit de fechamento: veio no commit documental seguinte, `2db8a0f`, que não é baseline. **Três rodadas**; as rodadas 1 e 2 tiveram três blockers cada. **D-101** foi aceita; FINAL_AUDIT sem seção nova; veredito vigente **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, o do §61. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review087](../reviews/087-review.md) (rodada 3): `test:frontend` **129** arquivos e **1359** testes; `test:gate` **233**; `validate:ui` **169** `passed` e **21** `skipped`; gate autenticado **195** testes, **0** `unexpected` e **0** retentativas. `validate:core` (**17** passos, **15** `passed` e **2** `skipped`) e os outros 35 passos de `validate:integration` vêm da rodada 1 do 087, porque o harness não provisionou os quatro bancos de teste na rodada 3.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Se divergir dos números acima, o relatório diz por quê. `test:gate` pode exigir `npx prisma generate` no ai-orchestrator antes: é pré-condição do harness, não efeito do diff.

## Objetivo e posição

Fechar dois achados do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080) em que a casca diz à pessoa algo diferente do que acontece:

- **R-06 (BAIXA).** Com a IA ativada e o WhatsApp desconectado, a casca diz "IA ativa" e, na mesma tela, o banner diz "Atendimento automático parado". Depois do 087, o cartão da IA na sidebar ainda diz "IA ativa · atendendo pelo WhatsApp" e oferece "Pausar" nesse estado.
- **R-10 (MÉDIA, relatado por Felipe).** A sidebar e o conteúdo terminam antes do fim da janela, e sobra fundo cinza embaixo. Não reproduz no Chromium do Playwright.

Critério visual: **`/inicio` com o WhatsApp desconectado igual ao quadro H3 nos quatro devices** do `visual:compare` (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O alvo H3 já existe em `apps/frontend/e2e/visual/targets.json` e é o estado da conta visual.

**Por que R-08 e R-09 saem.** Sob a V33, um Goal que altera uma tela com quadro declara o quadro, e toda divergência visível dele vira blocker. R-08 (sublinhado das linhas de Clientes) altera o CL1, e R-09 (nome cortado no bloco curto da Semana) altera o A10. O review087 registra que o conteúdo próprio dessas telas ainda não segue os quadros. Declarar CL1 e A10 aqui transformaria um Goal de estado da casca em dois portes de tela. R-08 e R-09 ficam abertos e passam, como escopo obrigatório, aos Goals que portarem CL1 e A10, conforme a v112 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento).

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/`) e no código da baseline:

1. **O cartão da IA não olha o WhatsApp.** `IaCard` (`apps/frontend/src/shared/layout/AppShell.tsx`) recebe só `status.aiView`: com a IA `active`, mostra "IA ativa", "atendendo pelo WhatsApp" e o link "Pausar", mesmo com `status.whatsappView === "off"`. O banner da casca ("Atendimento automático parado") e a faixa da Home (`resolveOperationalState`, em `features/dashboard/DashboardScreen.tsx`) já põem o WhatsApp desconectado à frente da IA. Depois do 087, a Home não tem mais pontos de estado (`StatusPoint` saiu); o R-06 restante é o cartão da sidebar.
2. **O protótipo diz o que o cartão mostra nesse estado, e não é "IA sem conexão".** No quadro "Home / Home · WhatsApp desconectado / Desktop" (`Home-Desktop.dc.html`, H3), o cartão da sidebar tem fundo `#F8E2DE`, um ícone de círculo cortado em `#B3392E` (18 px, borda de 2 px), o título "WhatsApp desconectado" (13 px, peso 600, `#8A2A21`), a linha "a IA não está atendendo" (12 px, `#8A2A21`) e a ação "Reconectar" (13 px, peso 600, `#B3392E`). "IA sem conexão" é o estado **por linha** em Conversas (NT3, `Notificacoes*.dc.html`), não o do cartão. A escolha (a) da versão anterior deste Goal ("IA sem conexão" na sidebar) contradiz o H3 e é substituída.
3. **No H3, a Home não repete o aviso.** Nos quatro devices do H3, o único aviso é a faixa de estado: "WhatsApp desconectado", "Sua IA não está atendendo. …" e "Reconectar WhatsApp". O app, em `/inicio` com o WhatsApp desconectado, mostra o banner da casca (`PersistentStatusBanner`, "Atendimento automático parado · Reconecte o WhatsApp para a IA voltar a responder.") **e**, logo abaixo, a faixa "WhatsApp desconectado". Nas outras telas, o banner persiste, como em NT3.
4. **A casca depende de unidade de viewport.** Em `shared/styles/atendly.css`, `.app-frame` tem `min-height: 100dvh` e `.sidebar` tem `position: sticky; top: 0; height: 100dvh`; `body` tem `min-height: 100dvh` em `src/app/globals.css`. Depois do 087, a sidebar só aparece a partir de 1100 px (`.app-frame > .sidebar { display: none }` abaixo disso). O efeito relatado continua possível em navegador em que a unidade não acompanha a janela (webview, zoom, redimensionamento).
5. **O gate autenticado tem o WhatsApp conectado** (`configuracoes-whatsapp` espera "WhatsApp conectado" em `e2e/authenticated-matrix.spec.ts`). O estado desconectado só é alcançável em jsdom e na conta visual do `visual:compare`.
6. **Código morto do 087** (observação 2 do review087): `showMobileHeader` continua em `ShellConfig` (`shared/layout/ShellConfig.tsx`), em `sameConfig`, em `src/app/(platform)/layout.tsx` e em `ConversationThread.tsx`, sem efeito desde que o cabeçalho de marca saiu.

## Escolhas de desenho desta passada

**(a) Um derivado único para o cartão da IA.** Uma função pura, ao lado de `aiStatusView` em `shared/runtime/systemStatus.tsx`, recebe a apresentação da IA e a do WhatsApp e devolve o que o cartão mostra: tom, título, linha de apoio e ação (texto e `href`), ou nenhuma ação. Regra:

- WhatsApp `off`, com qualquer estado da IA: título **"WhatsApp desconectado"**, apoio **"a IA não está atendendo"**, ação **"Reconectar"** com `href="/configuracoes/whatsapp"`, tom de perigo. Nunca "IA ativa" e nunca "Pausar".
- Qualquer outra combinação: o que o cartão mostra hoje, por D-101 (d), sem mudança. WhatsApp `unknown` ou `loading` não muda o cartão: só a desconexão confirmada muda.

`IaCard` consome só essa função. Motivo: é o que o H3 mostra, e é a mesma prioridade que a faixa da Home e o banner já seguem.

**(b) A Home não repete o aviso do WhatsApp.** Quando a faixa da Home está renderizada com dados (o ramo `dashboard` de `DashboardScreen`), o banner "Atendimento automático parado" da casca não aparece em `/inicio`, porque a faixa já diz "WhatsApp desconectado" com "Reconectar WhatsApp". Enquanto a Home carrega ou falha, o banner continua. O banner de exclusão agendada e o de IA indisponível não mudam, e o banner do WhatsApp continua em toda outra rota. Recomendação, não obrigação: um campo novo em `ShellConfig`, ligado só no ramo com dados da chamada única de `useShellConfig` da Home, em vez de testar a rota dentro de `AppShell`. **Nenhuma segunda chamada de `useShellConfig` na árvore** (D-030, D-031).

**(c) A faixa da Home no estado do H3.** Porte do H3 o título, a linha de apoio e a ação da faixa "WhatsApp desconectado", nos quatro devices. A frase "Tentamos reconectar por 5 minutos sem sucesso." **não** entra: o app não tem dado que a sustente. Divergência declarada.

**(d) A casca e a sidebar não dependem de unidade de viewport.** Nas regras cujo seletor contém `.app-frame` ou `.sidebar`, em toda largura, nenhuma altura usa `vh`, `dvh`, `svh` ou `lvh`. A sidebar (a partir de 1100 px) cobre a janela inteira por um meio que não depende dessas unidades. Recomendação, não obrigação: `position: fixed` com `inset-block: 0` e a coluna do conteúdo deslocada pelos 232 px da sidebar, ou a cadeia de altura `html`/`body` a 100%. Exigências do meio escolhido:

- a sidebar não sobrepõe `main` em largura nenhuma; a medida existente do gate autenticado continua passando;
- quando a janela é mais baixa que o conteúdo da sidebar, a sidebar rola sozinha, e o cartão da IA e o menu da conta, no fim dela, continuam alcançáveis;
- o fundo abaixo do conteúdo, quando o conteúdo é mais curto que a janela, é o mesmo fundo do conteúdo;
- as barras inferiores abaixo de 1100 px, a altura delas e o `padding-bottom` do `app-frame` (D-101 (a)) não mudam;
- o H1 e o H3 continuam iguais ao quadro no desktop.

**(e) Limite declarado de R-10.** O defeito não reproduz no Chromium do Playwright, porque nele `dvh` acompanha a janela. A prova vermelha de R-10 é uma guarda sobre a folha de estilo (§4, prova 4), e a medida renderizada G-1 é regressão: passa na baseline. Só a conferência humana do §7 confirma a correção.

**(f) Sem código morto na configuração da casca.** `showMobileHeader` sai de `ShellConfig`, de `sameConfig`, de `layout.tsx`, de `AppShellProps`, se estiver lá, e de `ConversationThread.tsx`. `attention` e `loading` de `ConversationThread` ficam para o Goal que tocar Conversas.

**Divergências declaradas, que não contam como defeito na comparação com o H3:**

1. A frase "Tentamos reconectar por 5 minutos sem sucesso." da faixa, por (c).
2. As divergências 1, 2 e 4 de D-101 (Notificações na sidebar do desktop, o indicador de início do iPhone na barra do celular, dados da conta de teste que não são layout). Na conta visual, a IA está desligada e o checklist "Ative sua IA" aparece; o H3 não tem checklist.
3. Conta que nunca conectou o WhatsApp. O protótipo tem um quadro próprio para ela (H4: "IA inativa · falta conectar o WhatsApp"), e `GET /v1/status` não distingue "nunca conectado" de "desconectado". O cartão e a faixa dizem "WhatsApp desconectado" nos dois casos, como a faixa já diz hoje. Fica registrado em D-102; nenhum contrato muda neste Goal.

## Fora do escopo

- R-08 (sublinhado das linhas de lista) e R-09 (nome no bloco curto da Semana): passam aos Goals que portarem CL1 e A10.
- O estado por linha em Conversas ("IA sem conexão"), a observação 1 do review084 (JID estrangeiro formatado como brasileiro), `attention` e `loading` de `ConversationThread`: para o Goal que tocar Conversas.
- Os estados "IA pausada" (H5), "IA com instabilidade" (H6) e "IA inativa" (H4) do cartão e da faixa, e a folha de pausa (H7).
- `height: 100dvh` de `.conversation-detail-main` (`shared/styles/atendly-conversations.css`), a conversa aberta: mexer nele mexe na rolagem interna do chat.
- O texto e o lugar do banner da casca nas outras rotas.
- Qualquer mudança em `GET /v1/status`, no BFF, no contrato, nos serviços, em `docs/design-reference/`, no vault e em `e2e/visual/targets.json` (H3 já está mapeado para `/inicio`; mude só se o alvo estiver errado, e explique no relatório).

## Dependências e contexto mínimo

- Decisões: D-101 (a casca, o cartão da IA e a faixa da Home, aceita no 087), D-088 item 8 (a faixa resolve um estado só, pela gravidade), D-030 e D-031 (uma chamada de `useShellConfig` por árvore). Conferir em [DECISIONS](../DECISIONS.md) só o item que o diff tocar.
- Protótipo: só o quadro H3 nos três arquivos de Home e, para não-regressão, os quadros listados no §2.
- Não é preciso abrir o vault: nenhuma regra de produto muda.

## Escopo obrigatório

### 1. Cartão da IA, faixa e banner iguais ao H3

**Porte** o HTML/CSS do quadro H3. A referência fica em `docs/design-reference/claude-design/prototype/project/`:

- mobile: `Home.dc.html`, quadro "Home · WhatsApp desconectado";
- tablet: `Home-Tablet.dc.html`, quadros "Home / Home · WhatsApp desconectado / Portrait" e "… / Landscape";
- desktop: `Home-Desktop.dc.html`, quadro "Home / Home · WhatsApp desconectado / Desktop".

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app os mesmos valores inline do cartão da IA e da faixa: px, cores hex, pesos, raios, bordas e espaçamentos. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Implemente (a), (b) e (c). Repita `npm run visual:compare -- --target H3` até não haver divergência visível em nenhum dos quatro devices além das declaradas. Para cada device, o relatório final traz o diff final e descreve o que se vê em `side-by-side.png`; a porcentagem sozinha não basta.

### 2. As outras telas não pioram

O cartão da IA aparece em toda rota logada no desktop, e a casca muda de altura em todas. Rode `npm run visual:compare -- --target H1,A1,CL1,Servicos:S1,Conversas:C1,M1` no início e no fim, e cole o diff de cada device das duas execuções. Nenhum device pode ficar pior sem causa medida e registrada, e nenhuma tela pode quebrar. Na conta visual, o cartão dessas telas no desktop passa a dizer "WhatsApp desconectado", que é o estado da conta.

### 3. Casca que preenche a janela

Implemente (d) e (f).

### 4. Provas novas

Dois arquivos novos em `apps/frontend/tests/`, com dublês do `ProductRuntime` no padrão dos testes dos Goals 074 e 087:

`apps/frontend/tests/goal085-shell-states.test.tsx`:

1. A tabela de (a), linha a linha: cada combinação de apresentação da IA (`active`, `pending`, `off`, `unknown`, `loading`) com a do WhatsApp (`active`, `off`, `unknown`, `loading`) dá o tom, o título, a linha de apoio e a ação esperados. "WhatsApp desconectado" com "Reconectar" para `/configuracoes/whatsapp` aparece **só** com o WhatsApp `off`, e "Pausar" **só** com a IA `active` e o WhatsApp diferente de `off`.
2. Com `ai.state: "ACTIVE"` e o WhatsApp `DISCONNECTED`, a casca mostra no cartão "WhatsApp desconectado", "a IA não está atendendo" e o link "Reconectar" para `/configuracoes/whatsapp`, e nunca "IA ativa" nem "Pausar". Com o WhatsApp `CONNECTED`, o cartão diz "IA ativa" e tem "Pausar".
3. Em `/inicio`, com o WhatsApp `DISCONNECTED` e o painel carregado, o texto "Atendimento automático parado" não aparece e a faixa "WhatsApp desconectado" aparece uma vez; com o painel ainda carregando, o banner aparece. Em `/clientes`, com o WhatsApp `DISCONNECTED`, o banner aparece uma vez.

`apps/frontend/tests/goal085-shell-css.test.ts`, guarda sobre a folha de estilo, lendo `src/shared/styles/atendly.css` e, se tocado, `src/app/globals.css`:

4. Toda declaração de altura (`height`, `min-height`, `max-height`) dentro de qualquer regra cujo seletor contenha `.app-frame` ou `.sidebar`, inclusive dentro de `@media`, não usa `vh`, `dvh`, `svh` nem `lvh`.
5. A guarda da prova 4 lê o arquivo de verdade: o teste falha se o arquivo não tiver nenhuma regra com `.app-frame` ou `.sidebar`, para não passar por arquivo vazio ou caminho errado.

As provas 1 a 4 **reprovam na baseline**; a 5 é guarda da própria prova. O relatório cola a saída dos dois arquivos novos rodados contra os arquivos de produção da baseline, com a restauração conferida por hash.

**Medida nova no gate autenticado**, em `e2e/authenticated-matrix.spec.ts` e, se preciso, `e2e/measure.ts`, como teste novo, sem mudar teste existente, `e2e/routes.ts`, `playwright.*.config.ts`, semente nem `scripts/`:

- **G-3 (R-10):** em `/servicos` e `/clientes`, nas larguras do gate a partir de 1100 px, `aside.sidebar` tem topo 0 e fundo igual a `window.innerHeight` (tolerância de 1 px) depois de carregar, depois de `page.setViewportSize` com altura maior sem recarregar, e depois de rolar o conteúdo até o fim. Passa na baseline, pelo limite (e); é regressão. O nome G-3 evita confusão com G-1 e G-2 do 087.

### 5. Testes existentes

Continuam passando. Só muda asserção que dependa de "IA ativa" ou "Pausar" no cartão com o WhatsApp desconectado, do banner "Atendimento automático parado" em `/inicio` com o painel carregado, da altura da casca, ou de `showMobileHeader`. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A função de (a) passa a ignorar o WhatsApp: as provas 1 e 2 reprovam.
2. `IaCard` volta a montar o texto de `status.aiView` direto, sem a função de (a): a prova 2 reprova.
3. O banner do WhatsApp volta a aparecer em `/inicio` com o painel carregado: a prova 3 reprova.
4. `.sidebar` volta a ter `height: 100dvh`: a prova 4 reprova.

### 7. O que só uma pessoa confere

- No navegador em que Felipe viu R-10, com zoom e com a janela redimensionada: a sidebar e o conteúdo vão até o fim da janela em Serviços, Clientes, Configurações e Agenda.
- A sidebar e a Home com o WhatsApp desconectado de verdade e a IA ativada.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

## Pontos de implementação

- `apps/frontend/src/shared/runtime/systemStatus.tsx`: a função de (a).
- `apps/frontend/src/shared/layout/AppShell.tsx`, `ShellConfig.tsx` e `src/app/(platform)/layout.tsx`: (a), (b) e (f).
- `apps/frontend/src/features/dashboard/DashboardScreen.tsx`: (b) e (c).
- `apps/frontend/src/features/conversations/ConversationThread.tsx`: só a remoção de `showMobileHeader`, por (f).
- `apps/frontend/src/shared/styles/atendly.css`: o cartão, a faixa e (d). `apps/frontend/src/app/globals.css`: só se (d) usar a cadeia de altura de `html`/`body`.
- Ícone que faltar (o círculo cortado do H3), em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`, no padrão do Goal086.
- `apps/frontend/tests/`: as provas novas e as asserções do §5.
- `apps/frontend/e2e/authenticated-matrix.spec.ts` e, se preciso, `e2e/measure.ts`: G-3, **só por acréscimo**.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-102** em `PROPOSED`, no formato de D-090 a D-101. Ela diz (a) a (f), com o motivo de cada um, as divergências declaradas e o limite de R-10, e que muda D-101 (d) no estado WhatsApp desconectado. O "Revisar se" inclui: `/v1/status` passar a distinguir "nunca conectado" de "desconectado"; a conferência do §7 mostrar R-10 de pé; e o produto ganhar os estados H4 a H7 no cartão.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§62**, sem reescrever §4 a §61. Ela registra R-06 e R-10 como corrigidos por este Goal, R-10 com o limite (e), R-08 e R-09 como abertos e dirigidos aos Goals de CL1 e A10, e dá o veredito **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem contar os achados da revisão local, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, a medida G-3, o `visual:compare` final e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md`, [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o vault e `docs/design-reference/` **não** são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução que a sustenta, conferida contra a execução final. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. **O texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada. Os blockers das rodadas 1 e 2 do 087 incluíram documentos que citavam como execução final corridas anteriores à última edição de CSS: não repita.

## Validação e ordem

1. Recontar a baseline; rodar `npm run visual:compare -- --target H3` e `-- --target H1,A1,CL1,Servicos:S1,Conversas:C1,M1` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target H3`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`, e `npm run visual:compare -- --target H3,H1,A1,CL1,Servicos:S1,Conversas:C1,M1`.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos, e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.**

**Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração; isso inclui `validate:integration` sem os bancos de teste provisionados (review087, "Aceito sem prova completa", item 1). Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma regra de `final-production-audit.mjs` relaxada, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima; não toca `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `scripts/` nem `tools/ia-loop/`.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target H3` e abriu os quatro `side-by-side.png`. `/inicio` com o WhatsApp desconectado está **igual ao quadro H3 nos 4 devices**: cartão da IA no desktop, faixa e ausência do banner repetido, sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas.
2. H1, A1, CL1, Servicos:S1, Conversas:C1 e M1 não ficaram piores em nenhum device sem causa medida e registrada, e nenhuma tela quebrou.
3. Com o WhatsApp desconectado, o cartão da IA diz "WhatsApp desconectado" com "Reconectar", nunca "IA ativa" nem "Pausar"; nas outras combinações, nada muda. Provado pelas provas 1 e 2.
4. Em `/inicio`, com o painel carregado, o aviso do WhatsApp aparece uma vez, na faixa; nas outras rotas, o banner continua. Provado pela prova 3.
5. A casca e a sidebar não usam unidade de viewport, e a sidebar vai do topo ao fim da janela, inclusive depois de a janela crescer. Provado pela prova 4 e por G-3, com o limite (e).
6. Largura, toque, contraste, foco e `prefers-reduced-motion` das telas tocadas são decididos pelo gate renderizado: `validate:ui` nas cinco larguras e o gate autenticado dentro de `validate:integration`, com os **195** testes da baseline mais G-3, e **0** retentativas.
7. As provas 1 a 4 passam e reprovaram na baseline; os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
8. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline (referências: `test:frontend` **129**/**1359**, `test:gate` **233**). `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam, ou a falha por ambiente está reportada com o motivo.
9. D-102 está em `PROPOSED`. FINAL_AUDIT §62 dá o veredito **0/7/5**. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §7 não foi feita.
10. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:**

- que R-10 sumiu no navegador de Felipe: o defeito não reproduz no Chromium, e só o §7 decide;
- o estado "IA ativa" com o WhatsApp desconectado em imagem: a conta visual tem a IA desligada, então ele é provado em jsdom;
- R-08 e R-09, que continuam abertos;
- os estados H4 a H7 do cartão e da faixa.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; cartão da IA (a), Home sem aviso repetido (b), faixa do H3 (c) e `showMobileHeader` removido (f); provas 1 a 3 com o vermelho da baseline; asserções existentes ajustadas |
| WU-02 | STANDARD | WU-01 | Casca sem unidade de viewport (d); `goal085-shell-css` (provas 4 e 5) com o vermelho da baseline; G-3 no gate autenticado, só por acréscimo; iteração final de `visual:compare` do H3 e das telas irmãs |
| WU-03 | DETERMINISTIC | WU-02 | typecheck de `apps/frontend` |
| WU-04 | DETERMINISTIC | WU-02 | lint de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-02 | testes dirigidos: `goal085-shell-states` |
| WU-06 | DETERMINISTIC | WU-02 | testes dirigidos: `goal085-shell-css` |
| WU-07 | DETERMINISTIC | WU-03…WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |

WU-01 e WU-02 tocam `atendly.css` e por isso correm em série. Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest.
