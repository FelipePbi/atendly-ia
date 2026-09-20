# Goal 033 — Gate renderizado nas telas autenticadas

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal032 ACCEPTED](../reviews/032-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 033 nasce na [v54 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 032, sem renumerar para trás e sem remover ID. Ela existe por um achado que a auditoria final nomeia duas vezes: **A-02**, em [FINAL_AUDIT §6](../FINAL_AUDIT.md), e o fecho de [§8](../FINAL_AUDIT.md), que registra que A-02 "continua aberto, sem Goal atribuído". É o único achado da lista descrito nesses termos.

## Baseline aceita

Baseline aceita: `dbea66416e8025a75cedf51a60a7cc921ac45fd0`

Goal anterior: 032 — Resposta automática provada ponta a ponta

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal032 já integrado em `main` (origem `60406fe1c3d05f73c814859cbe805522daa96bc5`), com o ensaio da resposta automática, a costura de `OPENAI_BASE_URL`, o [review032](../reviews/032-review.md) e a documentação de fechamento. O commit `2b2d369`, posterior a ele, corrige apenas o cabeçalho de status do documento do próprio Goal032 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Fazer o gate renderizado medir as telas **onde o produto realmente vive**. Hoje ele alcança sete rotas públicas e nenhuma tela autenticada: a Agenda em 360px, a Inbox, os Clientes, os Serviços, as Configurações e a Home não têm medição de overflow horizontal, de alvo de toque, de contraste computado, de foco visível nem de `prefers-reduced-motion`.

O Goal031 construiu a régua — alvo de toque **efetivo**, medindo a caixa do rótulo associado quando o controle é um `<input>` visualmente escondido — e a aplicou até esgotar os infratores públicos. O Goal032 provou, por execução, a peça que faltava para levar essa régua adiante: **BFF, Scheduling e IA sobem em processo contra bancos descartáveis, com as fronteiras externas em loopback**, e o produto responde por HTTP real. Junte as duas coisas e a sessão do gate deixa de ser um problema de fabricação e passa a ser um problema de orquestração.

`apps/frontend/e2e/routes.ts:1`–`:8` já explica por que o gate parou onde parou, e a explicação continua certa: *"a fake session would prove layout against data no user ever sees"*. Este Goal não contorna essa razão — ele a respeita e paga o preço: **pilha real, dado semeado pelas próprias rotas do produto, login digitado na tela de login**.

O risco próprio deste Goal é de uma classe só, e é o mesmo do 031 e do 032 com outra roupa: **fabricar a prova**. Um gate que injeta cookie de sessão, que renderiza a tela contra dado de mentira, que mede a rota errada porque foi redirecionado para `/login` sem perceber, ou que declara "medido" o esqueleto de carregamento em vez da tela com conteúdo, produz um número verde que não corresponde a nada. Tudo aqui é medido por esse critério.

## Dependências e contexto mínimo

- Goals 001 a 032 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [FINAL_AUDIT](../FINAL_AUDIT.md) §5.2–§5.4, **A-02** em §6, e o fecho de §8: o que o gate decide, o que ele não decide e por que A-02 está aberto.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `validate:ui` decide hoje e a pré-condição de bancos descartáveis de `validate:integration`.
- [DATA_MIGRATION §17](../DATA_MIGRATION.md) e a seção do Goal032: a forma de documentar um ensaio, incluindo elos de controle negativo.
- [AGENTS.md](../../../AGENTS.md): os guardrails de acessibilidade, mobile-first e tema claro que a régua materializa.
- **Product Vault:** consulta dirigida (1–3 notas) só se precisar confirmar uma regra de produto de uma tela medida. Não abrir o vault inteiro. E **não** usar o vault como referência de fidelidade visual: este Goal não decide fidelidade.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `dbea6641`. Não gastar rodada redescobrindo:

- **O gate renderizado alcança só rota pública.** `apps/frontend/e2e/routes.ts:9`–`:17` lista as sete; `apps/frontend/e2e/viewport-matrix.spec.ts:67` e `apps/frontend/e2e/accessibility.spec.ts` iteram exatamente essa lista. `apps/frontend/playwright.config.ts:18`–`:33` define a porta (`UI_GATE_PORT`, default 3210) e as cinco larguras; `:67`–`:74` sobe o servidor com `npm run start`, sem backend nenhum.
- **A régua do 031 vive dentro do spec, não num módulo.** `viewport-matrix.spec.ts:23`–`:24` (`TOUCH_TARGET_AA = 24`, `TOUCH_TARGET_COMFORTABLE = 44`), `:26` (`OVERFLOW_TOLERANCE`), `:65` (`KNOWN_SMALL_TARGETS`, hoje **vazia** e estrita nos dois sentidos) e a medição em `:108`–`:218`. Reaproveitar exige extrair, não recopiar.
- **O frontend é cliente puro do BFF, por HTTP, com cookie.** `apps/frontend/src/data/services/registry.ts:77` exige `NEXT_PUBLIC_BFF_URL`; `apps/frontend/src/shared/runtime/ProductRuntime.tsx` resolve a fase (`checking`/`unauthenticated`/`onboarding`/`authenticated`) chamando `auth.session()` e redirecionando. `NEXT_PUBLIC_*` é **embutida no build**: a URL do BFF precisa estar decidida antes do `next build`.
- **A origem e o cookie do BFF já são configuráveis por ambiente.** `apps/bff/src/app.ts:70`–`:72` registra CORS com `origin: env.FRONTEND_ORIGIN ? [env.FRONTEND_ORIGIN] : false` e `credentials: true`; `apps/bff/src/config/env.ts:41`–`:47` traz `SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `COOKIE_SECURE`, `COOKIE_SAME_SITE` e `FRONTEND_ORIGIN`. Porta diferente no mesmo host **não** é cross-site para cookie: `SameSite=lax` continua valendo. **Nenhuma mudança de código de produção é necessária para o CORS ou para o cookie.**
- **A pilha real já sobe em processo, e o padrão está escrito.** `scripts/goal030-mvp-journey-rehearsal.mjs:951`–`:1040` importa `build-app.ts`/`app.ts` dos três serviços na ordem das dependências, trocando `DATABASE_URL` entre um import e o outro, e escuta em `127.0.0.1` com porta `0`. `:281`–`:311` é a recusa de destino não descartável. `scripts/goal032-auto-reply-rehearsal.mjs` repete o padrão e acrescenta as fronteiras externas em loopback.
- **A semeadura tem porta de entrada real.** `goal030-mvp-journey-rehearsal.mjs:1207` registra o tenant por `POST /v1/auth/register` por HTTP real, e as etapas seguintes caminham os quatro blocos de onboarding, o cliente, o serviço, o atendimento e a conversa pelas rotas do produto.
- **As rotas autenticadas existem em `apps/frontend/src/app/(platform)/`:** `inicio`, `agenda`, `conversas`, `clientes`, `servicos`, `configuracoes`, `notificacoes`, além de `importacao` e `sistema`. O shell é montado uma vez em `(platform)/layout.tsx`.
- **`validate:ui` é gate separado e sem pré-condição de banco.** `package.json:43` é `cd apps/frontend && npm run test:ui`; ele não aparece em `validate:core` nem em `validate:integration`. `scripts/validate-integration.mjs:601`–`:615` termina em `rehearse:goal030-mvp-journey` e `rehearse:goal032-auto-reply`, e `scripts/tests/validate-integration.test.mjs` afirma a lista exata de 34 passos.
- **Nenhum ensaio tem script próprio em `package.json`.** Não existe entrada `rehearse:*` no arquivo; o padrão vigente, confirmado na observação 1 do [review032](../reviews/032-review.md), é o passo viver dentro de `validate:integration`. **Seguir o padrão vigente**, não inventar entrada nova.

## Pontos de implementação

- `apps/frontend/e2e/` (módulo novo de medição + spec nova + lista de rotas autenticadas): a régua compartilhada e o gate autenticado.
- `apps/frontend/playwright.*.config.ts`: a configuração do gate autenticado.
- `apps/frontend/src/**`: **apenas** correção de alvo de toque, overflow ou contraste que a régua reprovar.
- `scripts/goal033-authenticated-ui-rehearsal.mjs` (arquivo novo): a orquestração da pilha real.
- `scripts/validate-integration.mjs` e `scripts/tests/`: o passo novo e o teste permanente dos guards.
- `docs/migration/`: conforme §9.

**Nenhum arquivo fora de `apps/frontend/`, `scripts/` e `docs/migration/` deve mudar.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota nova, nenhum contrato público, nenhum arquivo de `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/` ou `apps/evolution-go/`.

## Escopo obrigatório

### 1. Uma régua só, extraída — nunca uma segunda régua

A medição do Goal031 sai de dentro de `viewport-matrix.spec.ts` para um módulo próprio em `apps/frontend/e2e/`, consumido **pelos dois** specs.

- O comportamento do gate público **não muda**: mesmas rotas, mesmos limiares (`24`/`44`/tolerância de overflow), mesma regra de rótulo associado, mesma asserção de exceção obsoleta. Extração é extração; se o resultado do gate público mudar, a extração está errada.
- Um segundo conjunto de constantes, um segundo cálculo de caixa efetiva ou um limiar próprio para tela autenticada é **blocker de review**. A tela autenticada é medida pela régua que o 031 defendeu em três rodadas de recusa, não por uma cópia mais frouxa.
- A lista de rotas autenticadas é declarada no mesmo padrão de `PUBLIC_ROUTES`, com o comentário dizendo o que ela cobre e o que ficou fora.

### 2. A sessão é real, e o gate prova que é

`scripts/goal033-authenticated-ui-rehearsal.mjs` sobe a pilha real e entrega ao Playwright um produto com dado de verdade.

- **A recusa de destino não descartável vem primeiro**, no padrão de `goal030`/`goal032`: sem as URLs de banco de ensaio apontando para cluster descartável em loopback, o ensaio recusa antes de qualquer escrita, `DROP` ou subprocesso.
- **Três bancos descartáveis**, migrations aplicadas do zero, e os três serviços próprios subindo em processo na ordem das dependências, todos em `127.0.0.1`. As fronteiras **externas** (OpenAI, Evolution Go) ficam em loopback onde nada escuta ou em dublê, como nos ensaios anteriores — este Goal não chama serviço externo nenhum.
- **O BFF escuta em porta fixa e declarada**, porque `NEXT_PUBLIC_BFF_URL` é embutida no `next build`. Porta ocupada é falha do ensaio com mensagem própria, nunca fallback silencioso para outra porta. `FRONTEND_ORIGIN` recebe a origem exata do servidor do gate.
- **O dado é semeado pelas rotas do produto**, por HTTP real, no padrão da etapa 1 do `goal030`: tenant registrado por `POST /v1/auth/register`, onboarding concluído, e o mínimo para cada tela medida ter conteúdo — pelo menos um cliente, pelo menos um serviço, pelo menos um atendimento no dia medido, pelo menos uma conversa com mensagem entrante e mensagem saída, e pelo menos uma notificação. Semear por `INSERT` direto no banco é permitido **apenas** onde não exista rota de produto para o dado, e cada caso desses é nomeado no relatório.
- **O login é digitado na tela.** O Playwright abre `/login`, preenche as credenciais que o ensaio semeou e envia o formulário. Nenhum `addCookies`, nenhum `localStorage`, nenhum `storageState` fabricado à mão, nenhuma chamada direta à rota de sessão para montar o contexto.
- **Cada rota medida prova que é ela mesma, autenticada.** Antes de medir, o spec afirma que a URL final é a rota pedida (não um redirecionamento para `/login` ou `/onboarding`) e que um marcador que só existe com sessão está montado. Medir a tela de login achando que é a Agenda é exatamente a falha que este Goal existe para não cometer.
- **Cada rota medida prova que já carregou.** A medição acontece depois do conteúdo real da tela, não sobre o esqueleto: o spec espera por um marcador de conteúdo carregado da própria tela, com teto de tempo declarado e falha por estouro com mensagem própria.

### 3. O que é medido, e em que largura

As **sete rotas autenticadas** obrigatórias — `/inicio`, `/agenda`, `/conversas`, `/clientes`, `/servicos`, `/configuracoes`, `/notificacoes` — nas **cinco larguras** já definidas (360, 390, 768, 1024, 1440), com as **cinco medidas** que o gate público já faz:

1. overflow horizontal;
2. alvo de toque efetivo, mínimo AA de 24px, pela régua do 031, com 44px reportado e nunca reprovado;
3. contraste real computado;
4. foco visível no primeiro `Tab`;
5. `prefers-reduced-motion` honrado.

`/importacao`, `/sistema` e `/onboarding` ficam **declaradamente fora** e o motivo é escrito no código: as duas primeiras dependem de estado de sessão de importação e de diagnóstico que a semeadura deste Goal não cria; a terceira exige um tenant em fase distinta e é escopo próprio. Fora declarado é fora escrito, nunca fora esquecido.

### 4. O que a régua reprovar

Medir tela nunca medida encontra dívida. A regra é assimétrica de propósito:

- **Overflow horizontal não tem linha de base.** Conteúdo correndo para fora da tela em 360px é defeito de produto e é **corrigido** neste Goal.
- **Alvo de toque abaixo de 24px é corrigido** quando a correção cabe no controle — tamanho de área clicável, `padding`, `min-height`. Só vira linha de base nomeada quando corrigir exigiria decidir a composição visual da tela, que é conferência humana e não é deste Goal.
- **Contraste reprovado é corrigido** quando o valor vem de um token já existente aplicado errado. Quando exigir escolher cor nova, vira linha de base nomeada.
- **Toda linha de base é nomeada** no padrão que `KNOWN_SMALL_TARGETS` já usa: rota, elemento, motivo e dono. A lista é **estrita nos dois sentidos** — entrada que não reproduz mais **falha**, para que a correção leve a exceção junto em vez de deixar cemitério.
- **Toda linha de base também é achado.** Cada entrada vira achado relatado na documentação de §9, com identificador novo em sequência a partir de A-20, classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) e impacto de produto em uma frase. Dívida escondida em allowlist sem achado é blocker de review.

### 5. Controle negativo: a régua morde na tela autenticada

No padrão dos Goals 031 e 032, com saída real no relatório e reversão obrigatória. **No mínimo quatro controles**, e estes quatro são obrigatórios:

1. **Overflow.** Forçar um elemento largo demais numa tela medida derruba o gate, nomeando a rota e a largura.
2. **Alvo de toque.** Encolher um controle real de tela autenticada abaixo de 24px derruba o gate, nomeando o elemento e a caixa medida.
3. **Contraste.** Aplicar um par de cores reprovado numa tela medida derruba o gate.
4. **Sessão.** Quebrar o login (credencial errada, ou sessão não estabelecida) derruba o ensaio com mensagem própria, em vez de medir a tela de login como se fosse a tela pedida.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com falha nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 6. O gate

- O ensaio vira passo de `validate:integration`, depois de `rehearse:goal032-auto-reply`, no padrão dos anteriores e **sem** criar entrada `rehearse:*` em `package.json`. A lista exata de passos afirmada por `scripts/tests/validate-integration.test.mjs` é **estendida**, nunca encolhida.
- **`validate:ui` continua exatamente como está**: as sete rotas públicas, as cinco larguras, `npm run start` e **nenhuma pré-condição de banco**. Amarrar o gate público a PostgreSQL seria transformar o único gate renderizado que roda sem pré-condição em mais um passo que falha por ambiente — isso é enfraquecer gate, e é blocker de review.
- Os guards do ensaio — recusa de destino não descartável, porta fixa ocupada, registro dos controles negativos — ganham **teste permanente** em `scripts/tests/`, rodado por `npm run test:gate`.
- Nenhum passo, suíte, limiar, rota ou largura de gate existente é removido, renomeado, pulado ou condicionado.

### 7. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não fabricar sessão.** Nenhum cookie montado à mão, nenhum `storageState` escrito por fora do login real, nenhum bypass de autenticação por variável de ambiente em `apps/*/src`.
- **Não afrouxar a régua.** Nenhum limiar próprio para tela autenticada, nenhuma segunda implementação da medição, nenhuma tolerância nova sem que o [review031](../reviews/031-review.md) a tivesse aceitado.
- **Não declarar fidelidade visual.** O gate decide overflow, alvo de toque, contraste, foco e movimento reduzido. Fidelidade à referência aprovada continua sendo **conferência humana** e não pode ser declarada provada por teste, em documento nenhum.
- **Não tocar backend.** Nada em `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/` ou `apps/evolution-go/`, nem migration, schema, rota ou contrato público. Se a pilha só subir com mudança de backend, isso é **achado relatado** e o Goal para ali — a decisão é do Tech Lead.
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir achado fora da régua.** A-03 a A-19 não são corrigidos, reclassificados nem tocados. Defeito encontrado fora do que a régua mede vira achado relatado, não correção silenciosa.
- **Não enfraquecer gate nenhum** e não marcar teste como skip em silêncio.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

### 8. Prova

- O ensaio roda verde contra bancos descartáveis, com a saída real no relatório: rotas medidas, larguras, contagens por medida e tempo.
- A tabela de medidas por rota e por largura, com o alvo menor encontrado em cada uma e o valor de contraste mais baixo.
- Os quatro controles negativos executados, cada um com a saída real, e revertidos.
- `validate:ui` executado **sem** o ensaio, provando que o gate público continua verde e inalterado.
- `npm run test:gate` e `validate:core` verdes sobre a árvore final.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.

### 9. Documentação

Escrita **depois** da última mudança de árvore:

- [CURRENT_STATE](../CURRENT_STATE.md): delta033 — o que passou a estar medido e o que continua fora.
- [DATA_MIGRATION](../DATA_MIGRATION.md): seção nova no padrão das anteriores, descrevendo o ensaio, a semeadura, os controles negativos e os limites.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o passo novo de `validate:integration`, o que ele decide e o que continua não decidindo; e o registro explícito de que `validate:ui` não mudou.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-31 e G-33 ganham a evidência nova, **sem** reabrir o que já está fechado.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada fechando **A-02**, no padrão de §8 — **sem reescrever** §6, §7, §8 ou §9 —, com o veredito recontado, os achados novos a partir de **A-20** quando houver linha de base nomeada, e a declaração explícita de que fidelidade visual continua fora.
- [DECISIONS](../DECISIONS.md): **D-049**, no formato das anteriores, cobrindo a sessão real do gate autenticado, por que o passo mora em `validate:integration` e não em `validate:ui`, e a regra assimétrica entre overflow (sem linha de base) e alvo de toque/contraste (linha de base nomeada e sempre também achado).

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A medição do Goal031 está num módulo próprio de `apps/frontend/e2e/`, consumido pelo spec público e pelo autenticado; não existe segunda implementação nem segundo limiar.
2. O gate público mantém as mesmas sete rotas, os mesmos limiares e o mesmo resultado; `validate:ui` roda verde sem pré-condição de banco.
3. O ensaio recusa destino não descartável antes de qualquer escrita, com mensagem própria.
4. O ensaio sobe BFF, Scheduling e IA reais contra três bancos descartáveis em `127.0.0.1`, com as migrations aplicadas do zero.
5. O BFF escuta em porta fixa declarada, a mesma embutida em `NEXT_PUBLIC_BFF_URL` no build; porta ocupada falha com mensagem própria, sem fallback silencioso.
6. Nenhum endereço fora de loopback é usado e nenhuma chamada sai para provedor de LLM real ou WhatsApp real.
7. O dado das telas é semeado pelas rotas do produto por HTTP real; todo `INSERT` direto está nomeado no relatório com o motivo.
8. A sessão é obtida digitando credenciais em `/login` pela própria tela; não há cookie, `storageState` ou bypass fabricado.
9. Cada rota medida afirma, antes de medir, que a URL final é a rota pedida e que um marcador de sessão está montado.
10. Cada rota medida afirma que o conteúdo real carregou, com teto de tempo declarado e falha por estouro.
11. As sete rotas autenticadas obrigatórias são medidas nas cinco larguras, com as cinco medidas.
12. `/importacao`, `/sistema` e `/onboarding` estão declaradas fora, com o motivo escrito no código.
13. Nenhum overflow horizontal ficou em linha de base: o que a régua encontrou foi corrigido.
14. Toda linha de base de alvo de toque ou contraste está nomeada com rota, elemento, motivo e dono, e a lista falha quando uma entrada deixa de reproduzir.
15. Toda linha de base tem achado correspondente a partir de **A-20**, com classificação e impacto de produto.
16. Os quatro controles negativos obrigatórios existem, cada um derruba o gate ou o ensaio com falha nomeada, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
17. O ensaio é passo de `validate:integration` depois de `rehearse:goal032-auto-reply`; a lista de passos do teste permanente foi estendida, não encolhida; nenhuma entrada `rehearse:*` foi criada em `package.json`.
18. Os guards do ensaio têm teste permanente em `scripts/tests/`, rodado por `npm run test:gate`.
19. Nenhum passo, suíte, limiar, rota ou largura de gate existente foi removido, renomeado, pulado ou condicionado.
20. Nenhum arquivo fora de `apps/frontend/`, `scripts/` e `docs/migration/` foi modificado; nenhuma migration, schema, rota ou contrato público mudou.
21. As mudanças em `apps/frontend/src/**` são exclusivamente correções que a régua reprovou, e cada uma está nomeada no relatório com a medida antes e depois.
22. Nenhum achado de A-03 a A-19 foi corrigido ou reclassificado; **A-02** só é declarado fechado com a medição executada.
23. Nenhum documento afirma fidelidade visual provada por teste, e nenhum afirma que **M4** foi fechado.
24. `validate:core` exit 0, `validate:ui` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
25. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
26. A documentação de §9 foi escrita depois da última mudança de árvore, [DECISIONS](../DECISIONS.md) tem **D-049** no formato das anteriores, e nenhuma seção anterior de [FINAL_AUDIT](../FINAL_AUDIT.md) foi reescrita.
27. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
28. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.

## Entrega

Relatório do Developer com: a tabela de medidas por rota e por largura, com o menor alvo e o menor contraste de cada célula; a lista de correções em `apps/frontend/src/**`, com a medida antes e depois; a lista de linhas de base nomeadas e os achados A-20+ correspondentes; a saída real dos quatro controles negativos, com a confirmação de que foram revertidos; o `INSERT` direto usado na semeadura, se houve, com o motivo; o resultado por passo de `validate:core`, `validate:ui`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; os achados de produto encontrados e **não** corrigidos; e o que ficou declaradamente fora — com **M4**, fidelidade visual, `/importacao`, `/sistema` e `/onboarding` nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
