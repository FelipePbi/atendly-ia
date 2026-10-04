# Goal 058 — A área logada volta a ter casca, e o gate autenticado passa a medir a composição

**Status: ACCEPTED** no [review058](../reviews/058-review.md), rodada 2 de 2 (rodada 1 `CHANGES_REQUIRED` com 5 blockers). Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal057 ACCEPTED](../reviews/057-review.md), a integração do seu commit de fechamento e a [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md). Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

A linha 058 nasce na [v78 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção do usuário depois do 056. Recebeu **CV-03** na v79 e o devolve na v80, que o separa como **058B**; a mesma v80 troca o título ("…e o gate renderizado entra nela") porque a evidência desta passada mostrou que o gate já entra na área logada e não enxerga o defeito.

## Baseline aceita

Baseline aceita: `b4c3f127fd5437848b28aec3ba59be8d3f3d401c`

Goal anterior: 057 — A confirmação é da agenda: a IA não afirma o que não gravou

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal057 já integrado em `main` (origem `8a2711ad1dd19f864ac987408c54e0f268287a36`). **Cinco rodadas**, com 4, 4, 2, 2 e 0 blockers. **D-073** foi aceita e [FINAL_AUDIT §34](../FINAL_AUDIT.md) escrita sem reescrever §4 a §33. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, que conta os achados A-01…A-24 do Goal030 e não os da revisão local. O 057 não tocou `apps/frontend/`. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Devolver à área logada a casca que ela perdeu, e fazer o gate autenticado reprovar quando ela faltar. Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79, para não colidir com A-01…A-24 do FINAL_AUDIT):

- **QA CV-01** (ALTA): em Conversas, Clientes e Serviços a sidebar ocupa a largura inteira e o conteúdo começa abaixo dela, em todas as larguras. Em 390 a página vaza para a direita e a barra de navegação inferior aparece solta no fim da página.
- **QA CV-02** (ALTA): a `aside.sidebar` fica sobre a lista e intercepta o clique ("`<aside class="sidebar">` intercepts pointer events"); o dono não abre conversa, cliente nem serviço pela lista, e em Serviços o botão "Criar serviço" fica embaixo da sidebar.
- **QA SV-01** (ALTA): a duração do serviço (`ServiceForm.tsx:210`–`:218`) tem `min={1}` e `step={5}`, então o navegador só aceita 1, 6, 11…; 40, 45 e 60 minutos são recusados sem mensagem na tela e sem requisição, e o serviço de 60 min criado no onboarding não pode ser salvo de novo.
- **QA SV-02** (MÉDIA): o preço de serviço novo nasce "R$ 0,00" (`ServiceForm.tsx:256`–`:260` passa `0` quando `service` é `undefined`), e `CurrencyInput` relê o texto inteiro a cada tecla, então o resultado depende da posição do cursor ("60" com cursor no fim dá R$ 0,60; "6000" com cursor no começo dá R$ 60.000,00).
- **QA NT-04** (MÉDIA): em 1440, o título da Central de notificações encosta na sidebar (x=248) e no topo (y=0); as outras telas têm respiro de cerca de 36px.

Posição: primeiro na série depois do 057 porque CV-01/CV-02 tornam três das sete telas centrais inutilizáveis por clique, e porque todo Goal seguinte da série (058B, 059, 060–069) entrega interface nessa área e precisa de um gate que reprove casca quebrada.

## O que a evidência desta passada mostra

- **A causa do CV-01 está no CSS, não no componente.** `AppShell.tsx:83` monta `${styleModule}-shell`, e os módulos usados são `dashboard`, `agenda`, `conversations`, `directory` e `settings` (`system` e `migration` viram `settings`, `AppShell.tsx:81`–`:82`). Há regra de casca para `.dashboard-shell` (`avenly.css:2655`), `.agenda-shell` (`avenly-agenda.css:1`) e `.settings-shell` (`avenly-settings.css:1`). Não há para `.conversations-shell` nem `.directory-shell`, nem para `conversations-main`, `directory-main`, `conversations-mobile-header`, `directory-mobile-header`, `conversations-bottom-nav` e `directory-bottom-nav`. As regras saíram em `8d94ace` (Goal016, remoção de `atendly-directory.css`) e em `ea992ec` (Goal017, `.conversations-shell`, `.conversations-main` e as variantes responsivas em `avenly-conversations.css`). O histórico desses dois commits mostra o que existia.
- **O gate autenticado existe e foi aceito com o defeito presente.** O Goal033 criou `apps/frontend/e2e/authenticated-matrix.spec.ts`, rodado por `scripts/goal033-authenticated-ui-rehearsal.mjs` como o passo `rehearse:goal033-authenticated-ui` de `validate:integration`, com sessão real digitada em `/login`, nas sete rotas (`/inicio`, `/agenda`, `/clientes`, `/conversas`, `/configuracoes`, `/servicos`, `/notificacoes`) e nas cinco larguras. `ea992ec` é ancestral de `090ee28` (fechamento do Goal033), e `avenly-conversations.css` nesse commit tem **zero** ocorrência de `conversations-shell`. O gate passou porque mede overflow, alvo de toque, contraste, foco e movimento, e nenhuma dessas medidas vê uma sidebar da largura da tela sobre o conteúdo. Os testes `goal016-shell-invariant` e `goal017-shell-invariant` provam a árvore em jsdom, que não tem layout.
- **A frase que a revisão local citou está defasada.** `apps/frontend/AGENTS.md:166` diz "Rotas cobertas: só as públicas… Tela autenticada exigiria sessão real". Isso vale para `validate:ui`, não para o produto: o gate autenticado roda dentro de `validate:integration`.
- **Não foi medido nesta passada** por que o overflow de 390 que a revisão viu não reprovou o gate do 033. É a primeira coisa que a WU-03 reproduz (§5.1).

## Fora do escopo

- **QA CV-03** (eventos "Horário reservado até…" e "Agendamento criado · Ver" no chat) sai deste Goal e vira o **058B** (v80). Ele exige dado novo em `internal/routes.ts`, no BFF, em `PUBLIC_API_V1` e em `packages/public-api-contract`. Misturá-lo aqui juntaria contrato público entre três serviços com uma correção de CSS e de gate, e ele deve nascer numa tela que este Goal devolve ao gate.
- Fidelidade visual ao protótipo de Conversas, Clientes, Serviços e Notificações (QA SV-03…SV-05, CL-*, CV-05, NT-01…NT-03): Goal069. Este Goal devolve a casca e o respiro; não redesenha lista, formulário nem central.
- `validate:ui` continua sendo o gate público. Mover o gate autenticado para dentro dele exige banco e stack reais no passo que o IA Loop roda depois de `validate:core`, e essa mudança seria em `tools/ia-loop/`, que o fechamento de Goal não integra.
- Os intervalos antes e depois do atendimento (`ServiceForm.tsx:335`–`:355`, `min={0}` com `step={5}`) aceitam múltiplos de 5 de forma coerente e não são o defeito do SV-01; não mudam.

## Dependências e contexto mínimo

Leia só o necessário: `apps/frontend/AGENTS.md` (seção do gate renderizado), as seções 4c, 4f e 4i e as linhas CV-01, CV-02, SV-01, SV-02 e NT-04 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), D-030, D-031 e D-049 em [DECISIONS](../DECISIONS.md), e a seção do gate autenticado em [VALIDATION_GATE](../VALIDATION_GATE.md). Para a casca, consulte o CSS removido em `git show 8d94ace -- apps/frontend/src/shared/styles/atendly-directory.css` e `git show ea992ec -- apps/frontend/src/shared/styles/avenly-conversations.css`, e as regras vigentes de `.settings-shell`/`.agenda-shell`. Para o protótipo, apenas `Conversas-Desktop.dc.html`, `Clientes-Desktop.dc.html` e `Servicos-Desktop.dc.html` em `docs/design-reference/claude-design/prototype/project/`, e só para conferir a largura da sidebar e o respiro. O protótipo é referência, não runtime.

## Pontos de implementação

- `apps/frontend/src/shared/layout/AppShell.tsx` e os CSS de `apps/frontend/src/shared/styles/` (`avenly.css`, `avenly-conversations.css`, `avenly-customers.css`, `avenly-services.css`, `avenly-notifications.css`).
- `apps/frontend/src/features/services/ServiceForm.tsx` e `apps/frontend/src/shared/ui/CurrencyInput.tsx`.
- `apps/frontend/e2e/authenticated-matrix.spec.ts`, `apps/frontend/e2e/measure.ts`, e `scripts/goal033-authenticated-ui-rehearsal.mjs` apenas se a semente precisar mudar.
- Testes jsdom em `apps/frontend/tests/`, arquivo novo com prefixo `goal058-`.

## Escopo obrigatório

### 1. A casca existe para todo módulo (QA CV-01/CV-02)

- Toda casca que `AppShell` monta tem layout nas cinco larguras: sidebar de 248px e conteúdo ao lado no desktop, trilho no intervalo que `.agenda-shell` e `.settings-shell` já usam (`max-width: 1099px`), e cabeçalho móvel com barra inferior abaixo de 768px, no mesmo padrão das cascas vigentes.
- **A grade é declarada uma vez para todo módulo.** O caminho esperado é uma classe base comum que `AppShell` sempre aplica (por exemplo, `app-shell` ao lado de `${styleModule}-shell`), com as regras de grade, trilho e mobile nela, e as regras por módulo ficando só com o que é realmente do módulo. Um módulo novo, ou um CSS de módulo apagado, não pode mais deixar uma tela sem casca. Se a execução mostrar que as três cascas vigentes divergem de propósito, a diferença fica na regra do módulo e é registrada no relatório.
- As variantes `-main`, `-mobile-header` e `-bottom-nav` dos módulos `conversations` e `directory` também passam a ter regra, pela mesma classe base ou por regra própria.
- Nada muda em `/inicio`, `/agenda` e `/configuracoes` além do que a classe base unificar. Nenhuma das medidas atuais do gate autenticado nessas rotas pode piorar.
- Teste jsdom novo: todo valor de `module` aceito por `AppShell` produz a classe base na raiz da casca. A lista de módulos sai do tipo ou da constante que o próprio `AppShell` usa, não de uma lista escrita no teste. jsdom não prova layout, e o teste diz isso no comentário; a prova de layout é o §5.

### 2. Notificações com respiro (QA NT-04)

A Central de notificações ganha o mesmo respiro externo das outras telas do módulo `settings` (o de `.settings-page`, `avenly-settings.css:35`), por reuso da regra existente, não por número novo. Em 1440, o título deixa de começar em x=248 e y=0.

### 3. Duração do serviço aceita qualquer minuto inteiro (QA SV-01)

O campo de duração aceita qualquer inteiro a partir de 1: 40, 45, 60 e 41 são válidos, 0 e negativo não são, vazio continua permitido e continua mantendo o serviço pendente de revisão. O campo não pode ter combinação de `min` e `step` que recuse múltiplo de 5. Teste jsdom novo com `checkValidity()` do campo para 40, 45, 60, 41, 0 e vazio. Se o jsdom da suíte não implementar `stepMismatch`, o teste afirma os atributos que decidem a validade e a prova de comportamento fica no §5.3.

### 4. Preço: nasce vazio e a digitação não depende do cursor (QA SV-02)

- Serviço novo: o campo de preço nasce vazio, não "R$ 0,00". Serviço existente com preço continua mostrando o preço atual; serviço existente sem preço nasce vazio.
- `CurrencyInput` passa a tratar a entrada como máscara de centavos que **acrescenta ao fim**: cada dígito digitado entra à direita do valor, qualquer que seja a posição do cursor; `Backspace` tira o último dígito; seleção total seguida de dígito recomeça o valor; colar texto extrai os dígitos; caractere que não é dígito é ignorado. Digitar "6000" dá R$ 60,00 com o cursor no começo, no meio ou no fim.
- Testes jsdom novos com `@testing-library/user-event` e cursor posicionado por `setSelectionRange` no começo, no meio e no fim, mais serviço novo nascendo vazio e serviço existente mantendo o valor. Os testes existentes de `CurrencyInput` e de `goal015-services` continuam passando; se uma asserção existente dependia do comportamento antigo, a mudança é a mínima, com o motivo no teste e no relatório.

### 5. O gate autenticado passa a medir composição e alcance de clique

Tudo em `apps/frontend/e2e/`, pela mesma sessão real do Goal033: login digitado em `/login`, sem `addCookies`, `storageState` escrito à mão nem chamada direta à rota de sessão.

1. **Primeiro, reproduzir o vermelho.** Na baseline, com o CSS atual, rodar o gate autenticado com a medida nova e colar no relatório qual medida reprova em `/conversas`, `/clientes` e `/servicos`, e em que larguras. Registrar também por que a medida de overflow do 033 não reprovou em 390 na baseline: se a semente é curta demais, se a sidebar em trilho não estoura, ou outra causa medida. Essa resposta vai para o relatório e para CURRENT_STATE.
2. **Medida nova de composição**, em `measure.ts`, aplicada às sete rotas nas cinco larguras e reprovando por `expect.soft` como as outras:
   - o `contentMarker` da rota começa dentro da primeira tela (topo menor que a altura da viewport);
   - `document.elementFromPoint` no centro da caixa do `contentMarker` devolve o próprio marcador ou um descendente dele, e nunca um elemento dentro da navegação (`aside.sidebar`, cabeçalho móvel, barra inferior);
   - nas larguras em que a sidebar está visível, a caixa dela e a caixa do `main` não se sobrepõem na horizontal.
   A mensagem de falha nomeia rota, largura e o elemento encontrado no ponto.
3. **Alcance por clique real.** Em `/conversas`, `/clientes` e `/servicos`, clicar na linha semeada com `locator.click()` sem `force`, sem `dispatchEvent` e sem teclado, e provar que a URL de detalhe abriu e que o conteúdo do detalhe carregou. Pelo menos em 390 e 1440; nas cinco larguras se o orçamento de rate limit do ensaio (`waitForRateLimitBudget`) permitir, com o motivo registrado se não permitir. Em `/servicos`, também "Criar serviço" por clique real em 1440.
4. **Serviço de 45 minutos salva pelo formulário**, numa largura: abrir o serviço semeado por clique, digitar 45 na duração, salvar por clique, e provar a resposta 2xx e "45 min" na lista. A execução não pode deixar a semente em estado que mude outra medida. Se precisar, a semente ganha um serviço próprio para esse caso, em `scripts/goal033-authenticated-ui-rehearsal.mjs`, com o teste do ensaio em `scripts/tests/` atualizado.
5. **Nada afrouxa.** `KNOWN_SMALL_TARGETS` e `KNOWN_CONTRAST_FAILURES` continuam vazios, nenhuma medida existente é removida ou desligada, nenhuma rota sai de `AUTHENTICATED_ROUTES`, e nenhum passo sai da lista exata de `scripts/tests/validate-integration.test.mjs`.

### 6. Controles negativos, rodados depois da última edição de código

Cada controle é aplicado numa cópia ou revertido no mesmo passo, e a **saída real** é colada no relatório. É a observação 5 do [review057](../reviews/057-review.md) e a 4 do [review056](../reviews/056-review.md): a maioria dos blockers dos dois Goals foi evidência escrita antes da última edição.

1. Regra da classe base removida (ou `AppShell` sem a classe base): a medida de composição reprova em `/conversas`, `/clientes` e `/servicos`, e o clique real do §5.3 reprova com o elemento interceptador nomeado.
2. `step={5}` com `min={1}` de volta na duração: o teste jsdom do §3 ou o caso do §5.4 reprova.
3. `CurrencyInput` antigo restaurado: os testes de cursor do §4 reprovam.
4. `ServiceForm` passando `0` para serviço novo: o teste de preço vazio do §4 reprova.

O controle 1 roda o gate autenticado inteiro por `node scripts/goal033-authenticated-ui-rehearsal.mjs` contra banco descartável, e a saída colada nomeia a medida e a rota.

### 7. Documentação

No mesmo diff, por **acréscimo**:

- `apps/frontend/AGENTS.md`: a frase de `:166` passa a dizer o que vale. `validate:ui` cobre as rotas públicas; o gate autenticado cobre as sete rotas logadas dentro de `validate:integration`, com as medidas que ele tem depois deste Goal. Também explica como rodá-lo.
- [DECISIONS](../DECISIONS.md) ganha **D-074** em `PROPOSED`, no formato de D-054 a D-073: a casca é uma regra base comum a todo módulo; o gate autenticado mede composição (conteúdo na primeira tela, ponto central sem navegação por cima, sidebar sem sobrepor o `main`) e alcance por clique real; a máscara de centavos acrescenta ao fim. Limites: fidelidade visual ao protótipo continua sendo conferência humana; o gate autenticado roda em `validate:integration`, não em `validate:ui`; a medida de composição usa o `contentMarker` de cada rota e não prova o resto da tela. D-030, D-031 e D-049 não são reescritas; D-074 diz o que acrescenta a elas.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§35**, sem reescrever §4 a §34: **QA CV-01, QA CV-02, QA SV-01, QA SV-02 e QA NT-04** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24; o veredito da auditoria segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram a classe base, a medida de composição, o clique real, a resposta do §5.1 e as contagens da execução.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) não é editado: é o registro da revisão como ela foi.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Documento não diz que um gate "fica para depois" nem cita comentário ou linha que a execução final não confirme.

### 8. O que este Goal não pode fazer

- Não toca `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, migrations, `tools/ia-loop/`, `apps/bff/PUBLIC_API_V1.md` nem `QA_LOCAL_REVIEW.md`.
- Não muda rota, contrato, schema, copy de tela nem markup de `AppShell` além das classes da casca.
- Não redesenha tela (Goal069) e não cria regra de cor, fonte ou espaçamento nova quando já existe token ou regra equivalente.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum `force: true`, nenhuma medida desligada, nenhum passo a menos em `validate:integration` ou `validate:core`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Na baseline, a medida nova reprova em `/conversas`, `/clientes` e `/servicos`, com a saída colada; a causa de o overflow do 033 não ter reprovado em 390 está medida e registrada. Provado por execução.
2. Com a mudança, o gate autenticado passa nas sete rotas e nas cinco larguras, com a medida de composição ativa em todas. Provado pela execução de `rehearse:goal033-authenticated-ui`, dentro de `validate:integration`.
3. A linha semeada de Conversas, Clientes e Serviços abre o detalhe por clique real em 390 e 1440, e "Criar serviço" por clique real em 1440. Provado pelo gate autenticado.
4. A grade da casca é declarada uma vez, e todo módulo de `AppShell` recebe a classe base, pelo teste jsdom que deriva a lista do próprio `AppShell`. Provado por diff e execução.
5. Notificações tem o mesmo respiro de `.settings-page`, pela medida de composição e pela regra reutilizada. Provado por diff e pelo gate autenticado.
6. Duração de 40, 45, 60 e 41 minutos é válida, 0 não é, e vazio continua permitido; o serviço de 45 min salva pelo formulário no gate. Provado por execução.
7. Preço de serviço novo nasce vazio; "6000" dá R$ 60,00 com o cursor no começo, no meio e no fim. Provado por execução.
8. Os quatro controles negativos do §6 reprovam com o defeito e passam sem ele, com a saída colada e rodados depois da última edição de código. Provado por execução.
9. `KNOWN_SMALL_TARGETS` e `KNOWN_CONTRAST_FAILURES` continuam vazios; nenhuma rota sai de `AUTHENTICATED_ROUTES`; a lista de `validate-integration.test.mjs` não encolhe. Provado por diff.
10. Typecheck e lint de `apps/frontend` verdes; suíte de `apps/frontend` sem teste a menos que a baseline; `validate:core` e `validate:ui` verdes; `test:gate` sem teste a menos que a baseline (**226**). Provado por execução.
11. `apps/frontend/AGENTS.md` corrigido; D-074 em `PROPOSED`; FINAL_AUDIT §35; CURRENT_STATE e VALIDATION_GATE com as contagens da execução. Provado por diff contra a execução.
12. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:** fidelidade visual da casca e das telas ao protótipo aprovado. Essa conferência é humana e não pode ser declarada como provada por teste.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Casca com classe base para todo módulo e respiro de Notificações (§1, §2), com o teste jsdom da classe base |
| WU-02 | STANDARD | — | Duração (§3) e preço (§4) com os testes jsdom |
| WU-03 | COMPLEX | WU-01, WU-02 | Gate autenticado: vermelho na baseline, medida de composição, clique real, serviço de 45 min (§5) |
| WU-04 | STANDARD | WU-03 | Controles negativos (§6) e documentação (§7) |
| WU-05…WU-13 | DETERMINISTIC | WU-04 | typecheck, lint, testes dirigidos (`goal058`), unit-tests, gate-tests, git-diff-check, validate-core, validate-ui, validate-integration |

A unidade `validate-integration` é a que executa o gate autenticado deste Goal. Se ela falhar em passo sem relação com o diff, o relatório nomeia o passo e a causa, e o critério 2 continua exigindo a saída de `rehearse:goal033-authenticated-ui`.
