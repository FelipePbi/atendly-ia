# Goal 110 — As credenciais derivadas passam a Avenly sem derrubar sessão nem chamada entre serviços

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal109 ACCEPTED](../reviews/109-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v133, já READY, inserida à frente do 102, sem renumerar nenhum Goal. Não há linha de quadros do protótipo: nenhuma tela muda de layout nem de texto. O Goal muda dois rótulos que entram no cálculo de credenciais; nomes, textos e arquivos continuam com "Atendly" até o 102.

## Baseline aceita

Baseline aceita: `2d1410cc0b28de67592c607f60e810c43df64187`

Goal anterior: 109 — Valores gravados e contratos passam a Avenly sem quebrar dado nem sessão

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal109 já integrado em `main` (origem `4bd1ed79119da6b4e28f87f0b513e4675d07d035`). **Três rodadas**, com 4, 3 e 0 blockers, nenhum de código de produção. **D-120** aceita. A virada de status do documento do Goal109 para `ACCEPTED` entrou no commit de fechamento. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, da execução final do Goal109 (FIX-001 da rodada 2, gates reaproveitados na rodada 3; [review109](../reviews/109-review.md), [VALIDATION_GATE](../VALIDATION_GATE.md), seção do Goal109): `validate:core` com 15 passos e 2 pulados; suíte do frontend com **149** arquivos e **1840** testes; `test:gate` **242**; `validate:ui` **169** `passed` e **0** retentativas (rodada 1); `validate:integration` com **36** de 36 passos, integração do BFF com **507** testes e gate autenticado com **275** `passed` e **0** retentativas.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1**, com a linha de resumo dos passos `test:bff`, `test:ai-orchestrator` e `test:scheduling-service` de `validate:core` e `test:bff-integration` e `test:scheduling-integration` de `validate:integration`, porque o review109 não traz todas.

## Objetivo e posição

A linha do 102 diz que "valores persistidos e contratos mudam com migration e leitura compatível do valor antigo; nenhuma sessão ou dado existente pode quebrar". O Goal109 fez essa parte para a fonte da agenda, os cookies, as variáveis do texto legal e o `localStorage`. Este Goal faz o que o inventário do 109 não cobriu: **dois rótulos de derivação HMAC com o nome antigo**. Eles não aparecem em nenhuma tela, mas mudar o texto deles muda o valor de credenciais que um serviço confere contra outro e contra o banco.

**Por que um Goal próprio e por que antes do 102.** A evidência 9 do Goal109 disse que nenhum evento de fila, cabeçalho HTTP nem chave de idempotência continha "atendly", e o inventário de D-120 (i) buscou só `"ATENDLY"`, os nomes de cookie, `ATENDLY_` e `atendly:brand`. Uma busca por literal minúsculo no código de produção, feita nesta passada, achou os dois rótulos abaixo. No diff de massa do 102, eles seriam trocados como texto. Isso derrubaria as chamadas entre serviços enquanto um lado estivesse na versão anterior e recusaria toda mutação de uma sessão aberta antes do deploy. É a mesma natureza do 109, mas pequena demais para reabri-lo e arriscada demais para ir no 102.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **Rótulo das credenciais internas, em três cópias.** `INTERNAL_DERIVATION_PREFIX = "atendly:internal:v1"` está em `apps/bff/src/lib/internal-credentials.ts:17`, `apps/ai-orchestrator/src/lib/internal-credentials.ts:21` e `apps/scheduling-service/src/shared/auth/internal-credentials.ts:13`. Nos três, `deriveInternalToken(rootSecret, caller, audience, use)` calcula `HMAC-SHA256(rootSecret, "<prefixo>:<caller>:<audience>:<use>")` em base64url.
2. **Quem apresenta o token.** O BFF, por `internalToken(audience, use)`, para a IA (`provisioning` e `command`) e para o Scheduling (`command`). A IA, por `schedulingCommandToken()` em `apps/ai-orchestrator/src/modules/scheduling-service/client.ts:955`, para o Scheduling (`command`).
3. **Quem confere o token.** A IA, por `expectedToken(use)` com `TRUSTED_CALLER_ID = "bff"` e `authorizeInternalRequest` (401 para credencial inválida, 403 para uso ou audiência errados). O Scheduling, por `expectedToken(client)` e `identifyInternalClient` (BFF e IA, uso `command`), em `shared/auth/internal-credentials.ts` e `shared/auth/internal-auth.ts`. A comparação é em tempo constante.
4. **Credencial explícita.** Quando a variável explícita está definida (`INTERNAL_PROVISIONING_TOKEN`, `INTERNAL_COMMAND_TOKEN`, `BFF_COMMAND_TOKEN`, `AI_ORCHESTRATOR_COMMAND_TOKEN`, `SCHEDULING_SERVICE_COMMAND_TOKEN` e as do BFF), a derivação não é usada nem aceita. O segredo bruto `INTERNAL_SERVICE_TOKEN` nunca é aceito como token.
5. **Rótulo do token de CSRF.** `deriveCsrfToken(sessionId)` em `apps/bff/src/lib/session.ts:52` calcula `HMAC-SHA256(JWT_SECRET, "atendly:csrf:<sessionId>")`. `createUserSession` grava `hashCsrfToken(token)` em `UserSession.csrfTokenHash`. A cada resposta autenticada por cookie, o hook `onSend` de `apps/bff/src/app.ts:101` devolve `sessionCsrfToken(request.session)` no cabeçalho de CSRF, e `lib/csrf.ts:63` confere o token da mutação contra o hash gravado. `request.session` já traz `csrfTokenHash` (`loadActiveSession`).
6. **Consequência de trocar só o texto.** Com o rótulo novo, o BFF devolveria a uma sessão aberta antes do deploy um token cujo hash não é o gravado, e toda mutação dela seria recusada com 403. Nas credenciais internas, um chamador novo contra um verificador antigo, ou o contrário, recebe 401 em toda chamada.
7. **Quem mais usa a derivação.** Os testes do Scheduling e da IA importam `deriveInternalToken` do próprio app (mais de vinte arquivos), e `scripts/goal032-auto-reply-rehearsal.mjs` importa o da IA. Nenhum teste nem script tem o literal `atendly:internal:v1` ou `atendly:csrf:`.
8. **Os demais literais minúsculos não guardam nada que precise de compatibilidade.** O nome de reserva `"atendly"` da instância nova do WhatsApp (`apps/bff/src/modules/whatsapp/routes.ts:221` e `:431`; a instância existente guarda o nome com que foi criada), os rótulos `service` das rotas de saúde, os caminhos de ícone, a classe `is-atendly` e os textos de tela ficam para o 102.
9. **Ainda não há usuário real.** O veredito de [FINAL_AUDIT](../FINAL_AUDIT.md) §7 continua valendo, e D-120 (h) declarou a janela de deploy do 109 nessa base.

## Escolhas de desenho desta passada

**(a) Credenciais internas: o chamador deriva com o rótulo novo, e o verificador aceita os dois.** O rótulo passa a `avenly:internal:v1` nos três módulos, e `deriveInternalToken` mantém a assinatura de hoje e passa a derivar com ele. Assim, os testes e o script que a importam continuam valendo sem mudança. O rótulo antigo fica numa constante nomeada como legado (`LEGACY_INTERNAL_DERIVATION_PREFIX`, ou nome equivalente), **um ponto por app**, usada só pelo verificador. A IA e o Scheduling passam a aceitar o token derivado com qualquer um dos dois rótulos, **para o mesmo chamador, a mesma audiência e o mesmo uso**. Um token antigo de `provisioning` continua sem autorizar `command`, um token antigo derivado para outra audiência ou outro chamador continua recusado, e a comparação continua em tempo constante contra cada valor esperado. Credencial explícita por ambiente continua exclusiva, como hoje. Motivo: um serviço ainda na versão anterior durante o deploy continua sendo aceito, e o segredo raiz não muda.

**(b) CSRF: sessão nova com o rótulo novo, sessão antiga com o token que confere com o hash gravado.** `createUserSession` grava o hash do token derivado com `avenly:csrf:`. O token devolvido a uma sessão já carregada é o derivado com o rótulo novo se o hash dele for o gravado; senão, o derivado com `atendly:csrf:` se o hash dele for o gravado. A conferência da mutação continua sendo só contra o hash gravado, sem regra nova. **Nenhuma linha de `UserSession` é reescrita** e nenhuma resposta de leitura comum passa a mandar `Set-Cookie`. Motivo: uma sessão aberta antes do deploy continua fazendo mutação até expirar ou ser revogada, sem login novo. Um token derivado com o rótulo antigo não vale para uma sessão nova, porque o hash gravado nela é o do rótulo novo; isso é o comportamento de hoje, não regra nova.

**(c) O Goal muda rótulos, não nomes.** Identificadores, nomes de arquivo, textos, comentários fora das linhas tocadas e os demais literais da evidência 8 ficam para o 102. Código novo pode usar "Avenly" no nome.

**(d) Ordem de deploy e janela, junto com D-120 (h).** Com o verificador aceitando os dois rótulos, a única janela é a de um chamador novo contra um verificador ainda antigo: BFF novo contra IA ou Scheduling antigos, e IA nova contra Scheduling antigo. A ordem de D-120 (h) é frontend, BFF, Scheduling e IA. Os dois Goals ainda não foram ao Render (nada nesta árvore o atravessa), então o deploy que levar o 109 leva também este Goal. O Developer escreve em D-121 a ordem combinada que recomenda, as janelas que sobram em cada ordem possível (as de leitura e escrita de D-120 (h) e a de autenticação deste Goal) e qual delas cada ordem troca por qual. Como ainda não há usuário real (evidência 9), a janela fica **declarada em D-121**, sem um segundo deploy em fases e sem tentativa automática com o rótulo antigo no chamador. Se houver usuário real antes do deploy, a decisão volta à pessoa.

## Escopo obrigatório

### 1. Credenciais internas

Conforme (a), em `apps/bff/src/lib/internal-credentials.ts`, `apps/ai-orchestrator/src/lib/internal-credentials.ts` (e onde a IA confere, em `modules/internal/routes.ts`, só se for preciso), `apps/ai-orchestrator/src/modules/scheduling-service/client.ts` (só se `schedulingCommandToken` não seguir a derivação nova sozinho) e `apps/scheduling-service/src/shared/auth/internal-credentials.ts` e `internal-auth.ts`. Os códigos de erro e os status (401, 403) não mudam.

### 2. CSRF

Conforme (b), em `apps/bff/src/lib/session.ts`, `apps/bff/src/lib/auth.ts` (`sessionCsrfToken` passa a receber o que precisa da sessão já carregada) e `apps/bff/src/app.ts` só se a chamada mudar de forma. `lib/csrf.ts` só muda se for preciso para o token antigo, e o relatório diz por quê.

### 3. Provas novas

Cada uma num arquivo novo `goal110-…`:

1. **Scheduling, verificador, pela rota HTTP** (`apps/scheduling-service/tests/unit/`, no padrão de `goal027-calendar-guard.test.ts`). Com só `INTERNAL_SERVICE_TOKEN` configurado: o token do BFF derivado com o rótulo novo e com o antigo é aceito e identificado como BFF; o mesmo para a IA; o token antigo derivado para outra audiência (por exemplo `ai-orchestrator`), para outro uso (`provisioning`) ou para um chamador desconhecido é recusado com 401; o segredo bruto é recusado com 401. Com `BFF_COMMAND_TOKEN` configurado, só ele vale para o BFF, e os dois tokens derivados do BFF são recusados.
2. **IA, verificador, pela rota HTTP** (`apps/ai-orchestrator/tests/security/`, no padrão de `internal-credentials.test.ts`). Os tokens de `provisioning` e de `command` derivados com os dois rótulos são aceitos nas rotas do seu escopo; o token antigo de `provisioning` numa rota de `command`, e o contrário, recebem 403, como o novo; o token antigo derivado para outro chamador ou outra audiência recebe 401; o cabeçalho de audiência divergente continua 403; o segredo bruto continua 401; com a credencial explícita configurada, os dois derivados são recusados.
3. **Chamadores derivam com o rótulo novo.** O token que o BFF apresenta à IA (`provisioning` e `command`) e ao Scheduling, e o que a IA apresenta ao Scheduling, capturados na requisição de saída (fetch simulado) ou pela função que o produz, são `HMAC-SHA256(root, "avenly:internal:v1:<caller>:<audience>:<use>")` e diferem do derivado com o rótulo antigo. Nada no código de produção deriva com o rótulo antigo para apresentar.
4. **BFF, CSRF, contra PostgreSQL real** (`apps/bff/tests/`, no padrão de `session-csrf.integration.test.ts` e de `goal109-legacy-session-cookie.integration.test.ts`). (a) O login grava em `csrfTokenHash` o hash do token derivado com `avenly:csrf:`, e o cabeçalho de CSRF devolve esse token. (b) Uma sessão cujo `csrfTokenHash` é o hash do token derivado com `atendly:csrf:` (gravado direto no banco, simulando a sessão aberta antes do deploy): uma leitura autenticada devolve no cabeçalho o token antigo, sem `Set-Cookie`, e a linha de `UserSession` fica igual, coluna por coluna, antes e depois; uma mutação com esse token passa; uma mutação com o token do rótulo novo é recusada com o status de hoje. (c) Uma sessão nova recusa o token derivado com o rótulo antigo. (d) Uma sessão antiga revogada continua recusada.

As provas reprovam na baseline, salvo as partes que só protegem comportamento de hoje (por exemplo, "segredo bruto recusado", "uso errado recebe 403" e "sessão revogada continua recusada"). O vermelho da baseline vem colado no relatório, com cada parte que passa nomeada e o motivo.

### 4. Inventário do que sobra

No fim, o relatório cola e classifica, linha por linha e sem resto:

- **(A)** a saída do comando de D-120 (i), `git grep -n -e '"ATENDLY"' -e "'ATENDLY'" -e 'atendly_session' -e 'atendly_csrf' -e 'ATENDLY_' -e 'atendly:brand' -- apps packages scripts`, nas classes (i) a (v) de D-120, dizendo o que mudou em relação às **144** linhas do 109;
- **(B)** a saída de `git grep -n -i -e 'atendly:' -e '"atendly' -e "'atendly" -e '`atendly' -- 'apps/*/src/**' 'apps/evolution-go/**' 'packages/**' ':!**/*.test.*' ':!**/*_test.go' ':!**/tests/**' ':!**/*.md'`, o código de produção, nas classes de D-120 e em duas novas: **(vi)** constante de rótulo legado deste Goal, no máximo uma por app; **(vii)** literal que não é gravado como chave, não entra em cálculo e não é conferido por outro serviço, trocado pelo 102 (texto, nome de reserva, rótulo de saúde, caminho, classe). Para cada linha de (vii) que é gravada no banco (por exemplo `ACTIVATION_TEST_CONTACT_NAME`, gravado como `displayName`), o relatório diz se alguma consulta a usa como chave; se usar, a linha não é (vii) e o caso volta ao Tech Lead.

A soma de (A) e (B) vira a lista de exceções que o 102 herda para o critério `git grep -i atendly`.

### 5. Controles negativos, rodados depois da última edição de código

Cada um com o arquivo restaurado e `sha256` idêntico conferido no fim:

1. Tirar a aceitação do rótulo antigo no Scheduling: a prova 1 reprova.
2. Tirar a aceitação do rótulo antigo na IA: a prova 2 reprova.
3. Derivar o token antigo da IA sem o uso (ou sem a audiência): a prova 2 reprova.
4. Voltar o rótulo do BFF para o antigo: a prova 3 reprova.
5. Fazer o token devolvido à sessão sempre usar o rótulo novo: a prova 4 reprova.
6. Regravar `csrfTokenHash` com o hash novo na leitura: a prova 4 reprova.

### 6. O que este Goal não pode fazer

- Mudar o segredo raiz, os nomes das variáveis de credencial, a regra de 401 e 403, os escopos, a lista de chamadores ou a comparação em tempo constante.
- Mudar regra de CSRF, de revogação ou de expiração de sessão, o nome de cookie, o cabeçalho de CSRF ou o JWT; reescrever linha de `UserSession`; criar sessão nova por causa do rótulo.
- Fazer o chamador tentar de novo com o rótulo antigo depois de um 401.
- Mudar texto visível, layout, rota, nome de arquivo, nome de pacote, identificador fora das linhas tocadas, classe CSS, prompt da IA, `docs/design-reference/`, o vault, `AGENTS.md` ou `CLAUDE.md` da raiz. Isso é do 102.
- Mudar migration, `schema.prisma`, `render.yaml`, `.github/`, `.env.example` ou o nome de banco, container ou volume do ambiente local.
- Mudar passo, contagem de passos ou configuração de `validate:*`; mudar `e2e/` ou `scripts/`.
- Pular, remover ou marcar teste como `skip`/`todo`; afrouxar asserção existente.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração.

## Pontos de implementação

- Os três `internal-credentials.ts`, `apps/scheduling-service/src/shared/auth/internal-auth.ts`, a conferência da IA e, se preciso, `schedulingCommandToken` na IA.
- `apps/bff/src/lib/session.ts`, `apps/bff/src/lib/auth.ts` e, se a chamada mudar de forma, `apps/bff/src/app.ts`.
- Teste existente que reprove só porque afirma o valor exato de um token derivado com o rótulo antigo: ajustar para o rótulo novo, declarado arquivo por arquivo no relatório. Teste existente que deriva pelo próprio `deriveInternalToken` não muda.
- Contagem exata de arquivos `.ts` varridos em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` (D-120, `DIAG-001`): se este Goal criar arquivo novo em `apps/bff/src` ou `apps/ai-orchestrator/src`, a contagem muda e o relatório diz qual arquivo; o preferível é não criar.
- Os documentos abaixo.

## Fora do escopo

- A troca de nome em texto, identificador, arquivo, pacote, documentação e protótipo (102), inclusive os literais da evidência 8.
- Os nomes de serviço e de host do Render, a instância `atendly-platform` do WhatsApp, o remote git, o domínio e a conta do WhatsApp: vivem fora do repositório e dependem do operador.
- Os nomes do ambiente Docker local, trocados pelo supervisor depois do 102.
- Remover o rótulo antigo, os valores antigos de D-120 ou qualquer leitura de legado (contrair a compatibilidade). Fica para quando houver motivo medido.
- O deploy real e a medida das janelas.
- As lacunas visuais registradas sem ID (C1 a C4, K1 a K6, 2.I2 a 2.I10) e a observação 2 do review105.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-121** em `PROPOSED`, no formato de D-120: (a) a (d) com o motivo de cada uma, a ordem de deploy combinada com D-120 (h) e as janelas declaradas, o inventário do §4 como acréscimo à lista de exceções de D-120 (i) e um "Revisar se" que inclua a contração dos dois rótulos antigos junto com a de D-120. D-120 não é reescrita.
- [CURRENT_STATE](../CURRENT_STATE.md) ganha um delta curto, e [VALIDATION_GATE](../VALIDATION_GATE.md) uma subseção do Goal110 com as provas, o vermelho da baseline, os controles do §5, o inventário do §4 e as contagens da execução final.
- FINAL_AUDIT **não** ganha seção. `PUBLIC_API_V1.md` não muda: nada público muda. O vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função ou teste citado é conferido contra o código antes da entrega. Seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

**Blockers de documento.** Se o review apontar blockers de documento, cada um vira um item curto e separado, e o Developer confere item por item antes de devolver (regra do 097 e do 104).

## Validação e ordem

1. Recontar a baseline como manda "Baseline aceita".
2. Implementar o §1 e o §2, com as provas do §3.
3. Rodar o vermelho da baseline das provas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: typecheck de `apps/bff`, `apps/ai-orchestrator` e `apps/scheduling-service`, `validate:core` e `validate:integration` num banco recém-provisionado. O frontend não muda, então `validate:ui` não é exigido.
6. Rodar os controles do §5 e o inventário do §4.
7. Escrever a prosa só depois disso.

Os controles do §5 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório mede a causa antes de declará-la de ambiente. A prova 4 precisa de banco: o relatório diz em que passo de `validate:integration` ela roda, com a contagem do arquivo, ou a executa à parte e diz contra qual banco.

**Retentativas e recurso do host.** Já houve falha por memória em `validate:core` (101, passou com `VITEST_MAX_WORKERS=2`), `ERR_NO_BUFFER_SPACE` no gate autenticado (106), o Postgres local interceptado em `127.0.0.1:5555` (observação 3 do review105) e a exigência de um PostgreSQL com `vector` nativo em loopback para `validate:integration` (observação 5 do review109). Se algo assim se repetir, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

## Critério de aceite

1. As provas 1 a 4 passam e reprovaram na baseline, salvo as partes nomeadas no relatório que só protegem comportamento de hoje. A prova 4 roda contra PostgreSQL real.
2. Os seis controles do §5 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
3. O inventário do §4 está no relatório e em VALIDATION_GATE, com cada linha classificada e sem resto; nenhuma linha de (vii) é usada como chave de consulta.
4. Typecheck de `apps/bff`, `apps/ai-orchestrator` e `apps/scheduling-service` passa. `validate:core` passa, com `test:gate` em **242** ou mais e a suíte do frontend em **1840** testes ou mais. Nenhuma suíte tem teste a menos que a recontagem da baseline.
5. `validate:integration` com exit 0 e **36** passos, rodado depois da última edição de código, com a integração do BFF em **507** testes ou mais e o gate autenticado em **275** testes e **0** retentativas. Retentativa é medida e reportada com a causa.
6. Nenhuma tela muda: `git diff --stat` não mostra arquivo de `apps/frontend/`, de `e2e/`, de `scripts/`, de `docs/design-reference/`, de migration nem de `schema.prisma`.
7. D-121 está em `PROPOSED`, com a ordem de deploy combinada e as janelas. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada e sem resto de controle negativo.

**O que o aceite não prova:** o deploy real no Render e as janelas de D-120 (h) e de (d), que nada nesta árvore atravessa; uma sessão aberta antes do deploy num navegador real (a prova 4 usa requisição HTTP contra o BFF); credenciais explícitas reais do ambiente de deploy.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; credenciais internas (a) nos três apps; provas 1, 2 e 3 com o vermelho da baseline |
| WU-02 | STANDARD | WU-01 | CSRF (b) no BFF; prova 4 com o vermelho da baseline |
| WU-03 | DETERMINISTIC | WU-02 | typecheck de `apps/bff` |
| WU-04 | DETERMINISTIC | WU-02 | typecheck de `apps/ai-orchestrator` |
| WU-05 | DETERMINISTIC | WU-02 | typecheck de `apps/scheduling-service` |
| WU-06 | DETERMINISTIC | WU-03, WU-04, WU-05 | validate-core |
| WU-07 | DETERMINISTIC | WU-06 | validate-integration |
| WU-08 | STANDARD | WU-07 | Controles negativos (§5), inventário (§4) e documentação (D-121, CURRENT_STATE, VALIDATION_GATE), depois da execução final |
| WU-09 | DETERMINISTIC | WU-08 | git-diff-check final |
