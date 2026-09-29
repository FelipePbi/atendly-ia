# Goal 068 — Fidelidade visual: marca e autenticação

**Status: READY.** Preparado em 2026-09-29 pelo Tech Lead Agent após [Goal073 ACCEPTED](../reviews/073-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID. A v93 precisa o escopo com evidência conferida no código da baseline e **tira a Home deste Goal**: os achados H-01, H-06, H-07, H-08 e H-10 vão para o novo **074**, porque a seção "Esta semana" do protótipo pede números que não existem em camada nenhuma (ver "O que a evidência desta passada mostra"). O título passa de "marca, autenticação e Home" para "marca e autenticação". Entram três achados da revisão local que não tinham Goal: **G-07**, **C-05** e **C-06**.

## Baseline aceita

Baseline aceita: `2995be57e34d74cf1ca4e62d70f541856bb118a7`

Goal anterior: 073 — Política de cancelamento e visualização da agenda

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal073 já integrado em `main` (origem `a3cc0ca6a5d182398f8f96896b229527c1ea6473`). **Quatro rodadas**, com 4, 3, 1 e 0 blockers. **D-086** foi aceita e [FINAL_AUDIT §47](../FINAL_AUDIT.md) escrita sem reescrever §4 a §46. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review073](../reviews/073-review.md), rodada 4: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:ai-orchestrator` **86**/**98** arquivos (**12** pulados) e **1127**/**1215** testes (**88** pulados); `test:scheduling-service` **35** arquivos e **484** testes; `test:frontend` **96** arquivos e **1000** testes; `audit:static` **33** de **34**, **1** pulada; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos; integração do BFF **56** arquivos e **439** testes; integração do Scheduling **17** arquivos e **140** testes; gate autenticado com **155** `expected`, **0** `unexpected`, **0** `flaky` e **0** retentativas.

## Objetivo e posição

Fazer a marca e as telas de entrada baterem com a referência visual aprovada:

1. **Marca v4, "o A que confirma"**, em todo lugar onde a marca aparece: sidebar, cabeçalho do celular, onboarding, telas de entrada, páginas legais e telas de sistema. Símbolo em traço de uma cor só, solto, sem caixa; wordmark em Literata; favicon novo; assets mortos removidos.
2. **Assinatura animada**: na entrada sem sessão, o A se desenha uma vez por sessão; com sessão, só o check anima na sidebar. Com movimento reduzido, nada anima.
3. **Telas de entrada** (`/login`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada`, `/link-expirado`, `/nova-senha`): composição por largura conforme os protótipos, painel de marca em Petróleo e os textos do protótipo.

Referência visual, consultada só na página necessária (`docs/design-reference/claude-design/prototype/project/`):

- `Marca.dc.html`: símbolo, wordmark, cores, regras de uso e ícone do app;
- `Movimento.dc.html`: assinatura animada e movimento reduzido;
- `Login.dc.html` (celular), `Login-Tablet.dc.html` (retrato e paisagem) e `Login-Desktop.dc.html`.

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **G-01…G-07**, **C-05…C-10** e **L-06…L-08**. O vault não decide nada sobre marca; em autenticação, ele só lista campos e ações (`docs/product-vault/03-UX-UI/04-Especificacao-das-Telas.md`, §"Autenticação"), e este Goal não muda campo nem ação.

## O que a evidência desta passada mostra

Conferido no código da baseline `2995be5`:

1. **O símbolo é um desenho de CSS que não é um A.** `apps/frontend/src/shared/ui/Brand.tsx` renderiza `<span className="brand-mark">`, e `apps/frontend/src/shared/styles/atendly.css:164-192` desenha um quadrado de 28 px com raio 9 px, fundo `--navy`, dois pontos e uma barra em `--accent-vivid` (G-01, G-02, G-03). O painel de entrada troca as cores (`atendly.css:3389-3398`): caixa papel e pontos petróleo. O cabeçalho do celular (`.mobile-title .brand-mark`, `atendly.css:1944`), a sidebar de referência (`atendly.css:1793`) e o onboarding (`.onboarding-topbar .brand-mark`, `atendly.css:3264`) têm regras próprias.
2. **O wordmark usa a fonte do corpo.** `.brand` (`atendly.css:155-163`) tem `font-weight: 700` e herda `--font-body`. Literata já é servida pelo próprio app (`public/fonts/literata/`, `--at-font-display` em `tokens.css:99`) (G-04).
3. **O símbolo v4 existe pronto na referência.** `Marca.dc.html` traz o SVG em grade 64: `M6 56L28 9L40.85 36.5`, `M44.7 44.8L50 56` e `M25.5 38L32 44.5L58 21`, traço 6, pontas e junções arredondadas, uma cor só. A animação de desenho usa os mesmos três traços com `pathLength="100"`: 460 ms a partir de 0, 380 ms a partir de 340 ms e 220 ms a partir de 600 ms, somando os 820 ms de G-07.
4. **O favicon é o logo antigo.** `apps/frontend/src/app/layout.tsx:11` aponta para `/brand/atendly-favicon-32x32.png`, o A dentro de balão com gradiente (G-05). `public/brand/atendly-favicon-512x512.png`, `atendly-logo-horizontal.png` e `atendly-logo-icon.png` não são referenciados em lugar nenhum de `src/`, `e2e/`, `tests/` ou `scripts/` (G-06). Os SVGs de exemplo do Next em `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) também não são referenciados.
5. **O painel de entrada é Tinta, e o celular não tem painel.** `.auth-brand-panel` usa `background: var(--navy)`, que é `--at-color-ink` (C-08). Abaixo de 768 px, a regra de `atendly.css:3663-3680` reduz o painel a uma barra de 104 px e esconde a frase (C-07). Não há composição de tablet: de 768 px para cima vale o mesmo split do desktop (C-09). O painel mostra `story[scenario]` e um motivo de linhas (`auth-flow`), sem o mock de conversa do protótipo (C-10, L-08). Petróleo já é token: `--at-color-primary: #0f5f63` (`tokens.css:77`), exposto como `--accent`.
6. **Os textos de entrada não são os do protótipo.** `AuthScreen.tsx:398-420`: o cadastro diz "Use seus dados de acesso. Informações do negócio vêm na próxima etapa." (C-05) e o botão diz "Criar conta", sem seta (C-06); o login diz "Boas-vindas de volta · Entre para acompanhar conversas e agendamentos." (L-07).
7. **L-06 mudou de forma desde a revisão local.** O checkbox que dividia a linha com "Esqueci minha senha" saiu no Goal064 (QA L-05), e `.auth-row:has(> :only-child)` já alinha o link à direita. Falta só conferir, nas cinco larguras, que o link fica sozinho, à direita e abaixo da senha.
8. **A Home não cabe aqui.** O protótipo (`Home.dc.html` e `Home-Desktop.dc.html`) fecha com "Esta semana: agendamentos, marcados pela IA, conversas que você assumiu". `dashboardSchema` em `packages/public-api-contract/src/schemas.ts:847-879` só tem números de **hoje** (`appointmentsToday`, `aiAppointmentsToday`, `automatedConversationsToday`), e nenhum serviço conta a semana. Cumprir a Home pede contrato, BFF e orquestrador, com outro perfil de risco. Ela vai para o novo **074**.

## Escolhas de desenho desta passada

- **A marca é um componente SVG, não CSS.** `Brand` desenha os três traços do `Marca.dc.html` com `stroke="currentColor"`, e a cor vem do contexto: Tinta no papel, Papel no Petróleo. Nenhum contexto pinta o check de outra cor. O componente aceita tamanho, mantém o nome acessível atual ("Atendly — Início", ou o destino que o chamador passa) e esconde o SVG do leitor (`aria-hidden`).
- **Favicon em SVG.** `public/brand/atendly-icon.svg`: quadrado Petróleo com o A v4 em Papel, conforme o ícone do app em `Marca.dc.html`. `layout.tsx` passa a apontar para ele. PNG só entra se for gerado a partir desse SVG por comando registrado no relatório; caso contrário, fica só o SVG.
- **A assinatura toca uma vez por sessão do navegador.** A marca registra em `sessionStorage` que já desenhou; recarregar a página na mesma aba não repete. Com `prefers-reduced-motion: reduce`, o símbolo aparece completo e parado, sem transição. Sem `sessionStorage` disponível, o símbolo aparece parado.
- **A saudação do login fica neutra.** O protótipo diz "Bem-vinda de volta.", no feminino. O título passa a ser "Entrar", como no protótipo, e o apoio passa a ser "Boas-vindas de volta. Sua agenda continua de onde parou.". A divergência é declarada em D-087 e fica para a conferência humana do §8.
- **O mock de conversa é ilustração.** Mensagens fixas do protótipo, marcadas `aria-hidden`, sem dado real e sem rede. O texto dele continua sujeito à medida de contraste do gate.
- **Telas de entrada que o protótipo não desenha** usam o painel do login. Os textos por cenário (`story`) que não existem no protótipo saem.

## Fora do escopo

- A Home (`/inicio`): H-01, H-06, H-07, H-08 e H-10 vão para o **074**.
- Agenda, Clientes, Serviços, Conversas e Notificações (Goal069) e o onboarding fiel ao protótipo (Goal072). Neles, este Goal só troca a marca.
- Campos, validação, regra de senha, aceite e fluxo de recuperação. O fluxo por link do Goal064 fica ([D-082](../DECISIONS.md)); o código de 6 dígitos do protótipo continua divergência declarada.
- BFF, contrato público, orquestrador, Scheduling, `packages/` e migrations.
- As observações do [review073](../reviews/073-review.md): a 1 vai para o 074, e a 2 e a 4 vão para o 069.

## Dependências e contexto mínimo

- Goal067 ACCEPTED e Goal073 ACCEPTED (baseline acima). O Goal064 refez os formulários de entrada, e o Goal058 pôs a casca e a sidebar no gate autenticado.
- Arquivos de partida:
  - `apps/frontend/src/shared/ui/Brand.tsx` e os cinco usos: `features/auth/AuthScreen.tsx`, `features/onboarding/OnboardingShell.tsx`, `features/system/SystemScreen.tsx`, `components/legal/LegalDocumentLayout.tsx` e `shared/layout/AppShell.tsx`;
  - `apps/frontend/src/shared/styles/atendly.css` (regras de `.brand`, `.brand-mark` e `.auth-*`) e `tokens.css`;
  - `apps/frontend/src/app/layout.tsx` e `apps/frontend/public/`.
- Gates: `validate:ui` mede as rotas de `PUBLIC_ROUTES` (`apps/frontend/e2e/routes.ts`) nas cinco larguras. O gate autenticado, dentro de `validate:integration`, mede a casca com a sidebar e as rotas de onboarding.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Marca | `shared/ui/Brand.tsx`, `shared/styles/atendly.css`, `app/layout.tsx`, `public/brand/`, `public/*.svg` |
| Assinatura animada | `shared/ui/Brand.tsx` (ou módulo irmão em `shared/ui/`), `shared/styles/atendly.css` |
| Telas de entrada | `features/auth/AuthScreen.tsx`, `shared/styles/atendly.css` |
| Testes | `apps/frontend/tests/goal068-*.test.tsx` |

## Escopo obrigatório

### 1. Marca v4

- `Brand` renderiza o SVG de três traços do `Marca.dc.html`, grade 64, traço 6, pontas arredondadas, `stroke="currentColor"` e `fill="none"`. Nenhum pseudo-elemento, caixa ou segunda cor (G-01, G-02, G-03).
- O wordmark usa `--font-display`, peso 600 e tracking −2% (G-04).
- Nos cinco usos, a marca aparece solta. As regras de `.brand-mark` que pintam caixa ou pontos saem de `atendly.css`.
- Favicon conforme as escolhas de desenho (G-05). `atendly-favicon-32x32.png`, `atendly-favicon-512x512.png`, `atendly-logo-horizontal.png`, `atendly-logo-icon.png` e os cinco SVGs de exemplo do Next saem de `public/` (G-06), depois de conferir de novo que nada os referencia.

### 2. Assinatura animada (G-07)

- Nas telas de entrada, a primeira exibição da marca na sessão desenha os três traços, com os tempos do `Marca.dc.html` (820 ms no total). As exibições seguintes na mesma sessão mostram o símbolo pronto.
- Na sidebar da área logada, só o check anima (420 ms), uma vez por sessão, conforme `Movimento.dc.html`.
- Com `prefers-reduced-motion: reduce`, nenhuma das duas anima, e o símbolo aparece completo.
- O símbolo nunca fica invisível ou parcial depois do fim da animação, nem se ela for interrompida.

### 3. Telas de entrada

- Composição por largura conforme os três protótipos de login:
  - celular: faixa Petróleo no topo com o símbolo, "Seu atendimento começa com uma boa conversa." e o texto de apoio do protótipo, e o formulário sobe como folha com raio de 24 px no topo (C-07);
  - tablet: fundo Petróleo cheio com o card centralizado no retrato; na paisagem, marca à esquerda e card à direita, os dois sobre Petróleo (C-09);
  - desktop: painel Petróleo com a frase e o mock de conversa do protótipo, e card compacto centralizado na vertical (C-10, L-08).
- O painel é Petróleo (`--accent`), não Tinta (C-08).
- Os limiares de largura seguem os protótipos. O relatório declara os limiares escolhidos e qual largura do gate (360, 390, 768, 1024, 1440) cai em qual composição.
- Textos:
  - cadastro: apoio "Configure o negócio e conecte seu WhatsApp em poucos minutos." (C-05) e botão "Criar conta" com seta decorativa `aria-hidden`, de modo que o nome acessível continua "Criar conta" (C-06);
  - login: título "Entrar" e apoio "Boas-vindas de volta. Sua agenda continua de onde parou." (L-07).
- "Esqueci minha senha" fica sozinho na linha, à direita e abaixo da senha, nas cinco larguras (L-06).
- Campos, mensagens de erro, validação inline, aceite e os fluxos de recuperação e de link expirado não mudam.

### 4. O gate renderizado mede as telas tocadas

- As rotas de `PUBLIC_ROUTES` continuam medidas nas cinco larguras por `validate:ui`. A casca autenticada e o onboarding continuam medidos pelo gate autenticado. Nenhuma rota entra ou sai.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela dentro do escopo do §3, sem desligar medida.
- `/nova-senha` não está em `PUBLIC_ROUTES`, porque exige token. Ela fica provada só em jsdom, e o relatório diz isso.

### 5. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `2995be5`. Testes jsdom em `apps/frontend/tests/goal068-*.test.tsx`:

1. `Brand` renderiza um `svg` com os três `path` do `Marca.dc.html`, `stroke="currentColor"`, nenhum outro atributo de cor e nenhum elemento `.brand-mark` com pseudo-caixa; o link mantém o nome acessível.
2. `layout.tsx` declara o ícone `/brand/atendly-icon.svg`; o arquivo existe; os quatro PNGs antigos não existem.
3. A assinatura toca na primeira montagem da sessão e não toca na segunda; com `matchMedia('(prefers-reduced-motion: reduce)')` verdadeiro, não toca; sem `sessionStorage`, o símbolo aparece parado.
4. Cadastro mostra o apoio de C-05 e um botão cujo nome acessível é exatamente "Criar conta"; login mostra o título "Entrar" e o apoio de L-07; o painel do desktop contém o mock de conversa marcado `aria-hidden`.
5. Nenhum texto antigo do painel (`story`) aparece em `/login` nem em `/cadastro`.

Os testes existentes continuam passando. Só muda asserção que dependa do texto ou da composição trocados aqui. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. `Brand` volta a renderizar `<span className="brand-mark">`: o teste 1 reprova.
2. Um dos traços ganha `stroke` fixo de outra cor: o teste 1 reprova.
3. `layout.tsx` volta a apontar para `atendly-favicon-32x32.png`: o teste 2 reprova.
4. A assinatura ignora `prefers-reduced-motion`: o teste 3 reprova.
5. A assinatura deixa de registrar a sessão: o teste 3 reprova na segunda montagem.
6. A seta passa a fazer parte do nome acessível do botão: o teste 4 reprova.
7. O apoio do cadastro volta ao texto antigo: o teste 4 reprova.

### 7. Documentação

No mesmo diff, por **acréscimo**:

- [DECISIONS](../DECISIONS.md) ganha **D-087** em `PROPOSED`, no formato de D-080 a D-086. Ela diz:
  - que a marca é o componente SVG de uma cor, com a cor vinda do contexto, e o favicon em SVG;
  - as regras da assinatura: uma vez por sessão, os tempos e o movimento reduzido;
  - a composição das telas de entrada por largura, com os limiares escolhidos;
  - a saudação neutra no lugar de "Bem-vinda de volta." como divergência declarada;
  - que a Home saiu deste Goal para o 074, e por quê.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§48**, sem reescrever §4 a §47. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, os assets removidos, as telas medidas pelo gate, a conferência humana pendente e as contagens da execução final de `test:frontend` (arquivos e testes), de `test:gate`, de `validate:ui` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- `apps/frontend/AGENTS.md`, só se descrever a marca ou as telas de entrada.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

**Ordem obrigatória, a mesma dos Goals065 a 073:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`. `test:gate` precisa do client Prisma que `validate:core` gera.
4. Rode os sete controles do §6.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.

### 8. O que só uma pessoa confere

- Que a marca, a assinatura animada e as telas de entrada, percorridas num aparelho real nas cinco larguras, batem com `Marca.dc.html`, `Movimento.dc.html` e os três protótipos de login.
- Que a saudação neutra é aceitável no lugar de "Bem-vinda de volta.".

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 9. O que este Goal não pode fazer

- Só toca `apps/frontend/` e os documentos do §7. Não toca `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/`, `scripts/`, `tools/ia-loop/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma migration.
- Não muda configuração de teste: `vitest.config.*`, `playwright.config.*` e `e2e/routes.ts` ficam como estão. Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff (observação 7 do [review073](../reviews/073-review.md)).
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A marca é o SVG de três traços, de uma cor, sem caixa, com wordmark em Literata 600, nos cinco usos. Provado por execução jsdom do §5.1 e pelo diff de `atendly.css`.
2. O favicon é o SVG novo, e os assets mortos saíram. Provado por execução do §5.2 e pelo diff de `public/`.
3. A assinatura toca uma vez por sessão, respeita movimento reduzido e nunca deixa o símbolo incompleto. Provado por execução jsdom do §5.3; o movimento reduzido nas telas renderizadas é decidido por `validate:ui` e pelo gate autenticado.
4. Os textos de C-05, C-06 e L-07 estão nas telas, e os textos antigos do painel saíram. Provado por execução jsdom do §5.4 e §5.5.
5. Largura, toque, contraste, foco e movimento das telas de `PUBLIC_ROUTES` são decididos por `validate:ui` nas cinco larguras. Os da casca autenticada e do onboarding são decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas. A composição por largura (C-07, C-09, C-10) e a posição de "Esqueci minha senha" (L-06) não são provadas por teste; ficam na conferência humana do §8.
6. Os sete controles negativos do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
7. Typecheck e lint de `apps/frontend` passam. `test:frontend` não tem teste a menos que a baseline (**96**/**1000**), e `test:gate` segue em **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **155** testes e **0** retentativas. Provado por execução.
8. D-087 em `PROPOSED`, FINAL_AUDIT §48, CURRENT_STATE e VALIDATION_GATE foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §8 não foi feita. Provado por diff contra a execução.
9. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que as telas batem com os protótipos aprovados (conferência humana);
- a fidelidade visual da Home (074), das telas de módulo (069) e do onboarding (072), onde este Goal só troca a marca.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Marca v4: `Brand` em SVG, wordmark, CSS dos cinco usos, favicon SVG, assets mortos e testes jsdom (§1, §5.1, §5.2) |
| WU-02 | STANDARD | WU-01 | Assinatura animada na entrada e na sidebar, movimento reduzido e testes jsdom (§2, §5.3) |
| WU-03 | STANDARD | WU-01 | Telas de entrada: composição por largura, painel Petróleo, mock de conversa, textos e testes jsdom (§3, §5.4, §5.5) |
| WU-04…WU-06 | DETERMINISTIC | WU-02, WU-03 | typecheck e lint de `apps/frontend` e testes dirigidos `goal068` |
| WU-07 | DETERMINISTIC | WU-04…WU-06 | validate-core |
| WU-08…WU-10 | DETERMINISTIC | WU-07 | gate-tests, validate-ui e validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | Controles negativos (§6) e documentação (§7), depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
