# Goal 123 — Entrar com erro, nova senha e senha redefinida iguais ao protótipo

**Status: READY.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal122 ACCEPTED](../reviews/122-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: L2, L6, L7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v147**, inserida depois do 122, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 122. Serviços ficou com S5, S6, S8 e S9, que pedem decisão de composição ou guarda de navegação (D-114 e Goal122), e com o S1b de cor livre. As telas de acesso são a superfície seguinte com um grupo coerente de quadros sem alvo: L2, L6 e L7 são estados de `/login` e `/nova-senha`, telas que já existem, e D-107 deixou os três fora de propósito ("Revisar se: um Goal portar L6 e L7").

## Baseline aceita

Baseline aceita: `f81db1c8ba35a266732c71f3b607b05be8a21eee`

Goal anterior: 122 — Serviços igual ao protótipo no vazio e no serviço que precisa de revisão

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal122 já integrado em `main` (origem `fac562213d82d3317e440b19c27933c0f4192ace`). Foram **três rodadas**: a rodada 1 parou na conferência de entrega (`PRE_REVIEW_INCOMPLETE`, 6 pendências); a rodada 2 terminou com 5 blockers de código e de evidência; a rodada 3 os resolveu, sem blocker. **D-136** foi aceita: o vazio de Serviços como S2 e o modo de revisão como S7, sem perder os valores escondidos no `PATCH`. A última contagem aceita: frontend **168** arquivos e **2160** testes, `goal122` **17**, `visual-responses.test.mjs` **38**, `test:gate` **271**, `validate:core` 15 passos e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, sem retentativa, `validate:integration` **36** de 36 passos, com o gate autenticado em **275** de primeira e 0 retentativas. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o erro de credenciais em `/login` fica igual ao quadro L2, o formulário de `/nova-senha` fica igual ao quadro L6 e a confirmação da senha redefinida fica igual ao quadro L7, nos quatro devices**, salvo as divergências declaradas. L1, L3, L4 e L5 continuam iguais à captura de antes.

**Por que agora.** A fila não tem Goal PLANNED. `targets.json` tem 76 alvos, e 37 dos 113 quadros continuam sem alvo. Os de Serviços que restam (S5, S6, S8, S9 e S1b) pedem outra decisão de composição, guarda de navegação ou cor livre fora de `colorToken`. L2, L6 e L7 são estados de telas públicas que já existem, com o mesmo `AuthScreen.tsx`, e nenhum depende de contrato novo. A tela de entrar é a primeira que toda pessoa vê, e o erro de credenciais é o estado mais comum dela.

## O que a evidência desta passada mostra

Conferido no código da baseline `f81db1c` e em `docs/design-reference/claude-design/prototype/project/Login.dc.html` (com `Login-Tablet.dc.html` em Portrait e Landscape e `Login-Desktop.dc.html`, que também têm os três quadros).

1. **L2 — Login · erro.** O quadro mostra o L1 com o e-mail preenchido e o erro **no campo "Senha"**, sem modal: o rótulo em `#8A2A21`, a borda do campo em `#B8483D` e, abaixo, em 12 px e `#8A2A21`, "E-mail ou senha não conferem. Confira e tente de novo — ou recupere a senha.". "Esqueci minha senha" fica sublinhado (no L1 o sublinhado só aparece no hover); a nota do quadro diz "O caminho de recuperação ganha destaque". O app (`mapAuthError` em `features/auth/AuthScreen.tsx`) põe "E-mail ou senha incorretos." no campo `login-password` quando o BFF responde 401.
2. **L6 — Nova senha.** O quadro mostra:
   - o título "Crie uma nova senha" e o subtítulo "Ela substitui a anterior em todos os dispositivos conectados.";
   - "Nova senha" e "Confirmar senha" (este em foco);
   - abaixo dos campos, a lista de regras: "Pelo menos 8 caracteres", "Letras e números" e "Diferente da senha anterior", com o círculo de 18 px em `#DCECEB` e o traço `#0B4A4E` na regra atendida, e o círculo vazio com borda `#D6CEC2` e o texto em `#716859` na pendente;
   - "Salvar nova senha".

   O app tem o mesmo título, o subtítulo "Diferente da senha anterior, com pelo menos 8 caracteres, letras e números.", um só campo e a lista de duas regras (`PASSWORD_POLICY_RULES`) dentro do `PasswordField`, com "Atendida" ou "Pendente".
3. **L7 — Senha redefinida.** O quadro mostra, no cartão, o círculo de 72 px em `#DCECEB` com o traço de 34 px, "Senha redefinida", "Pronto. Você já pode entrar com a nova senha — e a IA segue atendendo normalmente." e o botão "Entrar" com a seta. O app mostra o `state-icon`, "Senha redefinida", "Você já pode entrar na Avenly com sua nova senha." e o link "Ir para entrar".
4. **"Confirmar senha" não volta.** U-10, decidida por Felipe Borges em 2026-09-27, fixou a senha única, sem "Repita a senha", com a mesma regra na redefinição. D-064 (item 3) tirou `confirmPassword` de `resetPasswordSchema`. O segundo campo do L6 fica como divergência declarada, e nenhum corpo enviado ao BFF muda.
5. **"Diferente da senha anterior" é conferida pelo BFF, não pelo navegador.** O BFF confere a nova senha contra a atual antes de consumir o token e responde `400 VALIDATION_ERROR` no campo `newPassword` (D-064, item 3); o app já mostra "Escolha uma senha diferente da atual, que atenda às regras acima.". O navegador não conhece a senha atual e não pode marcar essa regra como atendida enquanto a pessoa digita.
6. **O subtítulo do L6 é verdadeiro.** `POST /v1/auth/reset-password` revoga as sessões da pessoa (`apps/bff/src/modules/auth/routes.ts`), então "Ela substitui a anterior em todos os dispositivos conectados." descreve o que acontece.
7. **O que o `visual:compare` alcança hoje.** L2 pede uma resposta 401 de `POST /v1/auth/login`, e L7 pede uma resposta de sucesso de `POST /v1/auth/reset-password`. `responses` só aceita `GET` (D-118 (a), com `status` de 400 a 599 por D-135). As alternativas reais não servem: o login errado de verdade bate no limite de 10 tentativas em 15 minutos do BFF (`routes.ts`, `rateLimit`) e muda de estado entre as rodadas, e a redefinição de verdade pede um token que só chega por e-mail. O L6 não pede resposta: a rota `/nova-senha?token=<qualquer>` abre o formulário, e o token só é conferido no envio.
8. **Testes existentes que afirmam o texto trocado.** `apps/frontend/tests/goal014-auth.test.tsx` afirma "E-mail ou senha incorretos."; `apps/frontend/tests/goal064-auth-screens.test.tsx` afirma o link "Ir para entrar" e a ausência dele. `scripts/tests/visual-responses.test.mjs` afirma que `POST` é recusado num alvo com sessão (W1); essa asserção continua válida.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS de cada quadro (valores inline de px, cor, fonte, raio e espaçamento), em cada device: `Login.dc.html` no mobile, `Login-Tablet.dc.html` em Portrait e Landscape, `Login-Desktop.dc.html` no desktop. A casca de acesso (`AuthLayout`) não muda; o CSS novo fica nas classes de autenticação de `shared/styles/avenly.css` ou num arquivo próprio de autenticação em `shared/styles/`, sem mudar o visual de L1, L3, L4, L5, L8, L9 e `/link-expirado`.
2. **L2.** O 401 do login põe no campo "Senha" o texto do quadro ("E-mail ou senha não conferem. Confira e tente de novo — ou recupere a senha."), com o rótulo, a borda e a mensagem nas cores do quadro, `aria-invalid` e a mensagem ligada por `aria-describedby`, como hoje. O e-mail digitado continua no campo. Com o erro de credenciais na tela, "Esqueci minha senha" fica sublinhado. O foco continua indo para o campo com erro. Os outros erros do login (validação local, falha de rede) não mudam.
3. **L6.** O subtítulo passa a ser o do quadro. A lista de regras sai de dentro do campo e fica abaixo dele, na composição do quadro, com três itens:
   - "Pelo menos 8 caracteres" e "Letras e números", conferidas ao digitar, como hoje, com o estado lido por leitor de tela ("Atendida" ou "Pendente");
   - "Diferente da senha anterior", sempre no estado neutro do quadro (nunca marcada), com o estado lido como "Conferida ao salvar".

   A lista continua ligada ao campo por `aria-describedby`. A validação local, a mensagem de senha igual à atual e o corpo enviado (`token` e `newPassword`) não mudam. `/cadastro` continua com a dica fixa de D-107 (b).
4. **L7.** A confirmação passa a ter o círculo, o texto e o botão do quadro: "Pronto. Você já pode entrar com a nova senha — e a IA segue atendendo normalmente." e "Entrar", com a seta, levando a `/login`. Nenhuma sessão é criada: a pessoa entra pelo `/login`, como hoje.
5. **`responses` com `POST`, só em tela pública e só em autenticação.** `scripts/lib/visual-responses.mjs` passa a aceitar `"method": "POST"` **somente** quando o alvo tem `session: false` **e** o `path` começa com `/v1/auth/`. A resposta é servida pelo navegador da captura e o pedido nunca chega ao BFF: nada é gravado e nenhum limite do BFF é consumido. Num alvo com sessão, `POST` continua recusado com a mensagem de hoje (`só "GET"`), e `PUT`, `PATCH` e `DELETE` continuam recusados em qualquer alvo. `status` segue as regras de D-135; o `POST` sem `status` vale 200. `scripts/visual-compare.mjs` só muda se a escolha da resposta precisar; `pickFixedResponse` já compara o método.
6. **Alvos.** `targets.json` ganha L2, L6 e L7, os três de `Login.dc.html` e com `session: false`:
   - L2: rota `/login`; `steps` que preenchem "E-mail" com "camila.reis@gmail.com" e a senha com um valor de 8 caracteres e tocam "Entrar"; `responses` com `POST /v1/auth/login`, `status` 401 e o corpo de erro que o BFF devolve hoje para credencial inválida (o Developer copia a forma do envelope de erro do BFF, sem inventar código);
   - L6: rota `/nova-senha?token=<valor fixo>`; `steps` que preenchem "Nova senha" com um valor que atende às duas regras, para a lista ficar como a do quadro;
   - L7: a mesma rota; `steps` que preenchem "Nova senha", tocam "Salvar nova senha" e esperam "Senha redefinida"; `responses` com `POST /v1/auth/reset-password` e o corpo de sucesso que `BffAuthService.resetPassword` aceita (`{ data: { ok: true }, requestId }`).

   Os passos não são `optional`: sem o estado, a captura falha. Se `getByLabel` do passo casar também com "Mostrar senha", o Developer escolhe um rótulo que case só com o campo e registra nas `notes`. As `notes` de cada alvo citam as divergências declaradas.
7. **Divergências declaradas.**
   - L6: "Confirmar senha" não existe no app, por U-10 e D-064; o cartão do app é mais curto que o do quadro, e o foco do quadro (no segundo campo) não tem equivalente.
   - L2: a saudação ("Boas-vindas de volta" no app, "Bem-vinda de volta" no quadro), por D-087.
   - A casca: a barra de status e o indicador de início do iPhone, o painel de marca do tablet e do desktop e o contorno do glifo do hero, como em D-107 (divergências 1, 2 e 9).

   O Developer registra outras que encontrar nas `notes` do alvo e em D-137, com o motivo.
8. **Decisão.** O Developer propõe **D-137**, por acréscimo, depois das provas: o erro de credenciais no campo, a lista de regras com a terceira regra neutra, a confirmação do L7, o `POST` só em alvo público de autenticação e as divergências declaradas. D-137 revê D-107 (b) só no que diz respeito a `/nova-senha` e revê D-118 (a) só no método.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/auth/AuthScreen.tsx`: L2 (o texto do 401, o sublinhado de "Esqueci minha senha"), L6 (o subtítulo e a lista de três regras abaixo do campo) e L7 (o círculo, o texto e "Entrar").
2. `shared/styles/`: o CSS do erro no campo, da lista de regras e da confirmação, sem mudar as outras telas de acesso.

### 2. A captura

1. `scripts/lib/visual-responses.mjs`: o `POST` da escolha 5, com a mensagem de recusa que nomeia o alvo e o motivo.
2. `apps/frontend/e2e/visual/targets.json`: L2, L6 e L7.
3. `scripts/tests/visual-responses.test.mjs`: as provas do `POST` e L2 e L7 como donos de `responses` em `Login.dc.html`.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal123-*.test.tsx`:
   - L2: o 401 põe o texto do quadro no campo "Senha", com `aria-invalid` e a mensagem ligada; o e-mail continua preenchido; "Esqueci minha senha" ganha a classe ou o atributo do destaque só com o erro de credenciais; um erro de rede continua com "Não foi possível falar com a Avenly. Tente novamente.";
   - L6: o subtítulo do quadro; as três regras abaixo do campo; as duas primeiras passam de "Pendente" a "Atendida" ao digitar; a terceira fica "Conferida ao salvar" com qualquer valor; nenhum campo "Confirmar senha"; o corpo de `resetPassword` só com `token` e `newPassword`; a senha igual à atual continua com a mensagem de hoje;
   - L7: depois do sucesso, "Senha redefinida", o texto do quadro e o link "Entrar" para `/login`; nenhuma chamada de sessão.
2. `scripts/tests/visual-responses.test.mjs`:
   - `POST` com caminho em `/v1/auth/` é aceito num alvo com `session: false`;
   - `POST` é recusado num alvo com sessão (a asserção de hoje, em W1) e num alvo público com caminho fora de `/v1/auth/`;
   - `PUT`, `PATCH` e `DELETE` são recusados também num alvo público;
   - `pickFixedResponse` só serve o `POST` declarado ao `POST`, e não ao `GET` do mesmo caminho;
   - L2 e L7 são os donos de `responses` em `Login.dc.html`, e as respostas deles são `POST` do próprio caminho.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) o 401 de volta a "E-mail ou senha incorretos." faz um teste reprovar;
   - (b) a terceira regra marcada como atendida quando as outras duas estão faz um teste reprovar;
   - (c) `validateResponses` aceitando `POST` num alvo com sessão faz um teste reprovar;
   - (d) `validateResponses` aceitando `POST` fora de `/v1/auth/` faz um teste reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Os ajustes em `goal014-auth.test.tsx` e `goal064-auth-screens.test.tsx` só podem trocar o texto que este Goal muda ("E-mail ou senha incorretos." e "Ir para entrar"), nunca afrouxar uma asserção; cada ajuste é listado no relatório.
5. **Fidelidade visual.** `npm run visual:compare -- --target L2,L6,L7` e, para regressão, `--target L1,L3,L4,L5`, numa pilha descartável própria (banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 122). O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco. Nenhuma mudança em login, sessão, CSRF, limite de tentativas, token de redefinição ou corpo enviado.
- "Confirmar senha" (U-10); a recuperação por código (D-082, item 4, e D-107 (c)).
- `/link-expirado`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada` e as telas legais, salvo o que o CSS compartilhado exigir sem mudar o visual.
- `GET` com outra regra, `PUT`, `PATCH` e `DELETE` em `responses`, e `POST` em alvo com sessão.
- As outras lacunas visuais sem ID (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, AG2, W2, W3, R2, a exclusão de conta, NT2, NT3, H6 e as etapas do onboarding) e as observações abertas dos reviews 116 a 122.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-137** em `PROPOSED`, conforme a escolha 8. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal123.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal123, com as contagens da execução final, os controles negativos, o `visual:compare` (alvos, percentuais e diferenças que restam) e a lista dos testes ajustados.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. A pilha descartável própria, antes de editar.
2. O `POST` em `responses`, com os testes da captura.
3. L2, L6 e L7, com os testes e os alvos.
4. `visual:compare` de L2, L6 e L7, e de L1, L3, L4 e L5 para regressão.
5. Controles negativos do §3.3, revertidos.
6. Execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. L2 igual ao quadro L2 nos 4 devices, salvo as divergências declaradas: o erro no campo "Senha" com o texto e as cores do quadro e "Esqueci minha senha" sublinhado. Provado em jsdom e pelo `visual:compare`.
2. L6 igual ao quadro L6 nos 4 devices, salvo as divergências declaradas: o subtítulo do quadro e as três regras abaixo do campo, com a terceira neutra. Provado em jsdom e pelo `visual:compare`.
3. L7 igual ao quadro L7 nos 4 devices: o círculo, "Senha redefinida", o texto do quadro e "Entrar" para `/login`. Provado em jsdom e pelo `visual:compare`.
4. O corpo de `login` e de `resetPassword`, a validação local, o foco no campo com erro e a mensagem de senha igual à atual continuam como antes; L1, L3, L4 e L5 iguais à captura de antes.
5. `responses` aceita `POST` só em alvo com `session: false` e caminho em `/v1/auth/`; o resto continua recusado com erro que nomeia o alvo; os testes da captura provam os dois lados.
6. Os quatro controles negativos reprovam e foram revertidos; os testes existentes continuam passando, com os ajustes de texto listados.
7. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque de 24 px no mínimo ("Esqueci minha senha", "Mostrar senha", "Salvar nova senha" e "Entrar" inclusive), contraste (a mensagem em `#8A2A21` e o texto da regra neutra em `#716859` sobre o fundo do cartão), foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam.
8. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/lib/visual-responses.mjs`, `scripts/visual-compare.mjs`, `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação" mudou.
9. D-137 proposta, com o erro no campo, a lista de regras, a confirmação, o `POST` restrito e as divergências declaradas.

## Plano de execução

1. **WU-01 — `POST` em `responses`.** `visual-responses.mjs` e as provas da captura.
2. **WU-02 — As três telas.** L2, L6 e L7 em `AuthScreen.tsx`, com o CSS, os testes novos, os ajustes de texto e os alvos.
3. **WU-03 — Fidelidade, provas e registros.** `visual:compare`, controles negativos, D-137, CURRENT_STATE e VALIDATION_GATE.
4. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, testes da captura, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
