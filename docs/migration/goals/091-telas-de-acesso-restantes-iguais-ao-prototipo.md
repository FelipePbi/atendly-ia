# Goal 091 — Telas de acesso restantes iguais ao protótipo

**Status: READY.** Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal099 ACCEPTED](../reviews/099-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: L3, L4, L5, L8, L9

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED), a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01). READY na v119, com o mesmo ID, título e quadros.

## Baseline aceita

Baseline aceita: `1e64c49b07a6e44f0778f2ad4dd52f4ede35fc49`

Goal anterior: 099 — Etapas de IA e WhatsApp iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal099 já integrado em `main` (origem `2e7ecec3a5d743cce12eabda3e06ff65550dcc2a`). **Quatro rodadas**, com 8, 1, 1 e 0 blockers. **D-106** aceita. A virada de status do documento do Goal099 para `ACCEPTED` veio no commit documental seguinte, `825d854`, que não é baseline e não muda código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

O Goal086 deixou `/login` igual ao quadro L1 e, por compartilhar a casca de `AuthScreen.tsx`, melhorou `/cadastro`, `/recuperar-senha` e `/solicitacao-enviada` sem portá-las. O conteúdo próprio de cada uma ficou fora ([review086](../reviews/086-review.md), "O que o aceite não prova"). As telas legais nunca foram portadas: `LegalDocumentLayout` ainda usa a casca de marca da autenticação.

Critério: **`/cadastro`, `/recuperar-senha`, `/solicitacao-enviada`, `/termos-de-uso` e `/politica-de-privacidade` iguais aos quadros L3, L4, L5, L8 e L9 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`, sem sessão.

**Por que agora.** Com o 099, o onboarding ficou sem quadro alcançável pendente. Este é o Goal de menor risco da fila de fidelidade visual: telas públicas, sem sessão, sem a casca da área logada, sobre a casca de autenticação já portada no 086. Os demais (092 a 097) dependem da casca logada e de lista e detalhe, e ficam para depois.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Login.dc.html`, `Login-Tablet.dc.html` e `Login-Desktop.dc.html`) e no código. A última medida das telas de autenticação é a do fim do Goal086 (mobile / retrato / paisagem / desktop): L3 **17,6 / 11,2 / 7,0 / 5,6**; L4 **11,6 / 5,3 / 5,1 / 4,6**; L5 **15,9 / 8,1 / 6,4 / 5,2**. L8 e L9 não têm medida em documento: o pente-fino só as lista como divergentes. A porcentagem é tendência; a leitura é a dos `side-by-side.png`, e o Developer recontará tudo na baseline.

1. **L3 Criar conta.** O quadro tem Nome, E-mail e Senha com a dica "Mínimo de 8 caracteres, com letras e números.", o checkbox "Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade.", "Criar conta" e "Já tem conta? Entrar". O app já tem os mesmos campos e o aceite por checkbox (D-082); a diferença é de composição, texto de apoio e estilo. A regra de senha do app ("pelo menos 8 caracteres, com letras e números") é a mesma.
2. **L4 Recuperar senha.** O quadro diz "Enviamos um código de 6 dígitos…" e tem "Enviar código" e "Voltar para entrar". O app envia **link** (D-082, item 4), com "Enviar link" e "← Voltar para entrar".
3. **L5 Código de recuperação.** O quadro tem "Confira seu e-mail", seis caixas de dígito, "Não chegou? Reenviar em 0:42", "Continuar" e "Usar outro e-mail". O app mostra, em `/solicitacao-enviada`, um estado de confirmação com ícone, "Enviamos um link de recuperação" e "Voltar para entrar". O `notes` do alvo em `targets.json` já registra que o app envia link, não código.
4. **L8 e L9 Termos e Política.** O quadro é uma página bege `#F7F4EF`, sem painel de marca. Tem "Voltar para criar conta", o eyebrow "Documento legal", o título, um resumo, o aviso de revisão jurídica, os metadados Versão / Vigência / Última atualização e as seções numeradas. No tablet e no desktop, há uma coluna "Sumário" com links para as seções. No app, `LegalDocumentLayout.tsx` usa `auth-layout` com `auth-brand-panel` ("Informação clara"), tem "← Voltar ao cadastro" e não tem sumário.
5. **Conteúdo legal.** O texto dos documentos vem de `src/content/legal/*.pt-BR.ts`, com versão de `config/legal-versions`. Os Termos do app têm 18 seções; o quadro tem 10, com outros títulos. A versão é a que o cadastro grava como aceita. O texto do quadro é um rascunho de exemplo.
6. **L6 e L7 ficam fora.** `/nova-senha` renderiza o formulário sem sessão, mas o quadro L6 tem "Confirmar senha" e uma lista de regras verificadas em tempo real. Isso muda o formulário e a regra única de D-082, e é escolha de produto, não porte. O L7 só aparece depois de uma redefinição real. Nenhum dos dois está em `targets.json`.

## Escolhas de desenho desta passada

**(a) A casca de autenticação é a do Goal086.** O hero, o selo, o painel bege e os ícones nos campos já seguem o L1 (D-087 e o Goal086). L3, L4 e L5 portam só o que é próprio de cada quadro. Se uma regra compartilhada precisar mudar, `/login` (L1) não pode piorar.

**(b) Textos do quadro.** Títulos, descrições, rótulos, dicas, CTAs e links das cinco telas passam a ser os do quadro, salvo onde este documento diz outra coisa. As mensagens de validação, os nomes acessíveis dos campos e o que é enviado ao BFF não mudam.

**(c) A recuperação continua por link (D-082, item 4).** Em L4, o texto e o CTA falam de link, não de código, na estrutura do quadro. Em L5, a tela de `/solicitacao-enviada` segue a hierarquia do quadro (título, e-mail em destaque se a tela o conhecer, ação principal e "Usar outro e-mail" para `/recuperar-senha`), sem caixas de dígito e sem contagem de reenvio. A tela não mostra o e-mail se ele não chegar a ela por um meio que já exista; não crie parâmetro de URL com o e-mail. "Voltar para entrar" continua alcançável.

**(d) Telas legais com o layout do quadro e o conteúdo do app.** `LegalDocumentLayout` passa a ter a estrutura de L8 e L9: página bege sem painel de marca, "Voltar para criar conta" para `/cadastro`, eyebrow "Documento legal", título, resumo (o `intro` do documento), o aviso de revisão jurídica, os metadados de versão e datas e as seções. No tablet e no desktop, entra a coluna "Sumário", gerada das seções do documento, com links para o `id` de cada seção. O texto, as seções, a versão e as datas continuam os de `src/content/legal/` e `config/legal-details`: o quadro não muda o conteúdo legal nem a versão aceita no cadastro. "Contato" continua no fim.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. A saudação e os textos que D-087 já declarou para a casca de autenticação.
3. L4 e L5: link no lugar de código, por (c). Em L5, sem caixas de dígito, sem contagem de reenvio e, se for o caso, sem o e-mail.
4. L8 e L9: o texto, o número e os títulos das seções, a versão e as datas, por (d). O sumário tem tantas linhas quanto o documento do app.
5. L3: dados de exemplo dos campos (o quadro mostra campos preenchidos; o app abre vazio, com o placeholder).

## Escopo obrigatório

### 1. As cinco telas iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Login.dc.html` (mobile), `Login-Tablet.dc.html` ("Login / <rótulo> / Portrait" e "… / Landscape") e `Login-Desktop.dc.html` ("… / Desktop"). Os rótulos são "Criar conta", "Recuperar senha", "Código de recuperação", "Termos de Uso" e "Política de Privacidade".

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target L3,L4,L5,L8,L9` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros L3, L4, L5, L8 e L9 nos 4 devices**. Para cada quadro e device, o relatório final traz o diff final e o que ainda difere, com o motivo. As telas são públicas e não fazem login, mas, se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script.

### 2. O L1 e as telas irmãs não pioram

Rode `npm run visual:compare -- --target L1` no início e no fim, e cole o diff de cada device das duas execuções. O L1 não pode piorar. `/nova-senha` e `/link-expirado` usam a mesma casca e não têm alvo: o relatório diz, por leitura de captura do gate renderizado ou por screenshot local, que elas não quebraram.

A casca da área logada, o onboarding e as demais telas **não** mudam.

### 3. Comportamento preservado

- Os campos, a validação, a regra única de senha, o aceite por checkbox e a ordem do foco no primeiro erro (D-082) não mudam.
- O cadastro envia o mesmo corpo ao BFF, com a mesma versão de Termos e Política.
- `/recuperar-senha` continua chamando o mesmo endpoint, levando a `/solicitacao-enviada` sem dizer se o e-mail existe.
- `/nova-senha`, `/link-expirado` e o "Senha redefinida" só depois de `200` real não mudam.
- As telas legais continuam públicas, com o mesmo `metadata` (título, descrição e `robots`), e os links do checkbox do cadastro continuam abrindo os dois documentos.
- O `RouteAnnouncer` continua anunciando a troca de tela.

### 4. Provas novas

`apps/frontend/tests/goal091-telas-de-acesso.test.tsx`, no padrão de `goal064-auth-screens.test.tsx` e `goal068-telas-de-entrada.test.tsx`:

1. Em `/cadastro`, os textos do quadro de (b): título, descrição, a dica da senha, o checkbox e "Já tem conta? Entrar". Os campos, a validação e o corpo enviado são os da baseline.
2. Em `/recuperar-senha`, título, descrição e CTA na forma de (c), falando de link, sem "código".
3. Em `/solicitacao-enviada`, a hierarquia de (c): título, a ação principal e "Usar outro e-mail" para `/recuperar-senha`, sem caixas de dígito e sem contagem de reenvio; "Voltar para entrar" continua alcançável.
4. Em `/termos-de-uso` e `/politica-de-privacidade`, a estrutura de (d): "Voltar para criar conta" para `/cadastro`, o eyebrow "Documento legal", o título, a versão e as datas do documento do app, sem o painel de marca da autenticação.
5. O sumário tem um link por seção do documento do app, cada um apontando para o `id` da seção, e o texto e o número das seções são os de `src/content/legal/`.

As provas 1 a 5 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. O relatório cola a saída delas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Só muda asserção que dependa de texto trocado por (b) a (d) ou de marcação puramente visual removida (por exemplo, o painel de marca das telas legais). O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O CTA de `/recuperar-senha` volta a falar de "código": a prova 2 reprova.
2. `/solicitacao-enviada` perde "Usar outro e-mail": a prova 3 reprova.
3. O sumário omite a última seção: a prova 5 reprova.
4. Uma seção do conteúdo legal ganha o título do quadro no lugar do título do app: a prova 5 reprova.

## Pontos de implementação

- `apps/frontend/src/features/auth/AuthScreen.tsx`: textos e composição de L3, L4 e L5.
- `apps/frontend/src/components/legal/LegalDocumentLayout.tsx`: estrutura de L8 e L9 e o sumário.
- `apps/frontend/src/shared/styles/atendly.css`, nos blocos `.auth-*`, `.entry-*` e `.legal-*`. Regra compartilhada com o L1 só muda se o L1 não piorar.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/routes.ts`, só se um `contentMarker` depender de texto trocado, com o motivo no relatório.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- L1, L2, L6 e L7, e qualquer mudança no formulário de `/nova-senha` ("Confirmar senha", regras em tempo real).
- Recuperação por código, parâmetro de URL com e-mail, reenvio com contagem.
- O conteúdo legal, a versão dos documentos e `config/legal-*`.
- Qualquer mudança em rota, contrato, BFF, `scripts/`, `docs/design-reference/`, vault e `e2e/visual/targets.json`. Mude o mapa só se um alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-107** em `PROPOSED`, no formato de D-105 e D-106. Ela diz (a) a (d), com o motivo de cada um, e as divergências declaradas. Ela registra que (c) mantém o item 4 de D-082 e que (d) separa o layout das telas legais do conteúdo legal. O "Revisar se" cobre três casos: o produto decidir recuperação por código; o conteúdo legal ganhar revisão jurídica que mude seções ou versão; ou um Goal portar L6 e L7.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que as cinco telas seguem os quadros e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita (D-082, D-087, D-106) não é reescrita.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target L1,L3,L4,L5,L8,L9` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target L3,L4,L5,L8,L9`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target L1,L3,L4,L5,L8,L9`.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

No relatório, para cada device dos cinco quadros, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. **Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`, nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target L3,L4,L5,L8,L9` e abriu os vinte `side-by-side.png`. As cinco telas estão **iguais aos quadros L3, L4, L5, L8 e L9 nos 4 devices**: sem divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além das declaradas.
2. O L1 não piorou; toda piora tem causa medida. `/nova-senha` e `/link-expirado` não quebraram.
3. As provas 1 a 5 passam e reprovaram na baseline, salvo asserção declarada. Os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua: campos, validação, aceite, corpo enviado, recuperação por link e conteúdo e versão legais iguais aos da baseline.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` das cinco telas são decididos pelo gate renderizado: `validate:ui` nas cinco larguras, com **0** retentativas. O gate autenticado, dentro de `validate:integration`, mantém os **245** testes da baseline e **0** retentativas.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. D-107 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** as telas num aparelho real; L2, L6 e L7; a recuperação por código; o conteúdo legal, que segue sujeito a revisão jurídica.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e comparação da baseline (L1, L3, L4, L5, L8, L9); L3, L4 e L5 portados, com o L1 sem piora |
| WU-02 | STANDARD | WU-01 | L8 e L9 portados em `LegalDocumentLayout`, com o sumário e o conteúdo legal do app |
| WU-03 | STANDARD | WU-02 | Provas 1 a 5 com o vermelho da baseline; asserções do §5 |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal091-telas-de-acesso` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
