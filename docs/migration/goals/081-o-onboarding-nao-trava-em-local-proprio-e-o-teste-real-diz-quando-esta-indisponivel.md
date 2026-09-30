# Goal 081 — O onboarding não trava em "Local próprio" e o teste real diz quando está indisponível

**Status: ACCEPTED.** Preparado em 2026-09-30 pelo Tech Lead Agent após [Goal080 ACCEPTED](../reviews/080-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v103, por instrução do usuário (Felipe Borges), a partir do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080); READY na v104, com o mesmo ID, título e posição. O escopo foi precisado nesta passada por evidência conferida no código.

## Baseline aceita

Baseline aceita: `cc6c4e655283c0b2684756a4bb1980096062c2b6`

Goal anterior: 080 — Não classificadas seguem o prazo Comercial

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal080 já integrado em `main` (origem `c4b7a546e9e1e4076e45fdd11516db7352bebc6a`). A virada de status do documento do Goal080 para `ACCEPTED` entrou no próprio commit de fechamento. **Duas rodadas**, com 1 e 0 blockers; o único defeito foi um nome de rota falso em documento, e nenhum código de produção mudou entre as rodadas. **D-096** foi aceita e [FINAL_AUDIT §57](../FINAL_AUDIT.md) escrita sem reescrever §4 a §56. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**. Depois do fechamento, `main` recebeu só o commit documental `853732c` (re-teste local, U-12, Goals 081–085 PLANNED), que não muda código. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review080](../reviews/080-review.md) e de FINAL_AUDIT §57: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **121** arquivos e **1244** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **170** testes e **0** retentativas. `test:bff-integration` **61** arquivos e **470** testes; `test:ai-orchestrator` **1284** (**1186** passando e **98** pulados sem banco); `test:scheduling-service` **37** arquivos e **502** testes.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline `cc6c4e6` e antes da primeira edição, `test:frontend`, `test:gate` e `test:bff-integration`, e cole a linha de resumo de cada um. Esse é o piso usado para comparar a execução final; se divergir dos números acima, o relatório diz por quê. `test:bff-integration` pula sem `*_TEST_DATABASE_URL`; nesse caso, o relatório diz quantos pularam.

## Objetivo e posição

Fechar dois achados do re-teste local que impedem a pessoa de terminar o onboarding ou de saber por que não consegue:

1. **R-01 (ALTA):** quem marca "Local próprio" em `/onboarding/modalidade` avança até o endereço e além. Hoje a etapa recebe `400 BUSINESS_ADDRESS_REQUIRED` e mostra "Não foi possível salvar esta etapa. Tente novamente.", e repetir não resolve.
2. **R-05 (MÉDIA):** sem o número da plataforma configurado, o teste real diz que está indisponível neste ambiente e não convida a tentar de novo. As outras recusas nomeadas do teste real também viram mensagem própria, no onboarding e em Configurações › IA.
3. O erro genérico de etapa do onboarding passa a distinguir três casos: dado recusado, serviço fora do ar e falha nossa.
4. Observação 2 do [review080](../reviews/080-review.md): o comentário do passo `test:ai-orchestrator-content-purge` em `scripts/validate-integration.mjs` deixa de dizer que a purga não alcança "não classificado".

A posição é a da v103: primeiro dos cinco Goals do re-teste, por severidade. O fechamento do 080 não tocou onboarding nem teste real e não traz evidência para reordenar.

## O que a evidência desta passada mostra

1. **A regra do BFF não mudou; o fluxo do frontend mudou.** `resolveBusinessProfileFields` (`apps/bff/src/lib/business-profile.ts:76`) recusa `ON_SITE` sem endereço, e é chamada igual por `PATCH /v1/onboarding` (`modules/onboarding/routes.ts:132`) e `PATCH /v1/settings/business` (`modules/settings/routes.ts:129`). `apps/bff/PUBLIC_API_V1.md` diz "Regra de gravação, igual nas duas rotas". `goal018-business-profile.integration.test.ts` prova a recusa nas duas rotas, incluindo "PATCH /v1/onboarding recusa ON_SITE sem endereço com o mesmo erro próprio".
2. **A etapa `modalidade` grava antes do endereço existir.** `persistBusinessStep` (`apps/frontend/src/features/onboarding/blocks/business.tsx`, ramo `scenario === "modalidade"`) chama `onboarding.update` com `modalities` e sem `address`. Quando `modalities` inclui `ON_SITE`, o BFF recusa. A etapa `endereco` vem depois e já manda `address` e `modalities` juntos. A separação das duas etapas veio dos Goals 065/072.
3. **O teste existente guarda o defeito.** `goal065-onboarding-business.test.tsx`, "com Local próprio, grava e avança para endereco", espera `updateOnboarding` com `modalities: ["ON_SITE"]` sem endereço. O dublê não aplica a regra do BFF, por isso o teste passa.
4. **O gate autenticado não passa por esse caminho.** `seedOnboardingAccount` (`scripts/goal033-authenticated-ui-rehearsal.mjs`) grava `ON_SITE` e endereço num único `PATCH`. Nenhum gate percorre a etapa `modalidade` clicando.
5. **A retomada já conhece o estado intermediário.** `nextRequiredStep` (`OnboardingRuntime.tsx`) leva `ON_SITE` sem endereço para `endereco`, e `onboardingIssues` (`apps/bff/src/lib/onboarding-state.ts`) recusa a conclusão nesse estado. Esse estado só existe hoje em dado antigo ou gravado por outro caminho.
6. **O rascunho sobrevive à navegação e não à releitura.** `OnboardingRuntimeProvider` guarda `draft` entre etapas (`ctx.go` é `router.push`). `refresh()` chama `draftFromState`, que troca `businessModalities` pelo valor gravado.
7. **O contrato do teste real já diz o que a tela deve fazer.** `PUBLIC_API_V1.md`, "Recusas nomeadas de `POST /v1/activation-test`", lista `PLATFORM_NUMBER_NOT_CONFIGURED` (`502`, `error.details.upstreamCode`) com "a tela diz que o teste não está disponível, sem simular progresso", e mais seis códigos com status `409`: `ACTIVATION_TEST_AI_ALREADY_ACTIVE` (em `error.code`), `ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED`, `ACTIVATION_TEST_TENANT_PHONE_UNKNOWN`, `ACTIVATION_TEST_NO_ELIGIBLE_SERVICE`, `ACTIVATION_TEST_NO_AVAILABILITY` e `ACTIVATION_TEST_ALREADY_RUNNING` (em `upstreamCode`).
8. **O frontend não traduz nenhuma delas.** `startActivationTest` (`features/activation-test/ActivationTestPanels.tsx`) só devolve a recusa própria "Conecte seu WhatsApp…" e deixa o erro do servidor subir. No onboarding, `persistActivationTestStep` não o captura, e `OnboardingScreen` aplica `onboardingError` (`blocks/shared.tsx:111`): `409` vira "Ainda há itens obrigatórios pendentes…", e todo o resto vira "Não foi possível salvar esta etapa. Tente novamente.". Em Configurações › IA, `AiSettings.startTest` mostra "Não foi possível iniciar o teste agora." para qualquer erro. `goal019-activation-test-screens.test.tsx`, "recusa do servidor não vira progresso nem sucesso", só prova que não há progresso; não prova o que a tela diz.
9. **Falha de rede tem forma própria.** `BffHttpClient` lança `BffHttpError` com `status: 0` e `code: "NETWORK_ERROR"` ou `"REQUEST_ABORTED"`.
10. **O comentário velho existe.** `scripts/validate-integration.mjs:591` diz "o que ela não alcança — não classificado, órfão de sessão…". Desde o Goal080, a purga alcança o não classificado pelo prazo Comercial.

## Escolhas de desenho desta passada

(a) **Local próprio é gravado junto com o endereço, e o contrato do BFF não muda.** A regra "ON_SITE exige endereço" está documentada e testada igual nas duas rotas desde o Goal018, e Configurações › Negócio depende dela. Afrouxar `PATCH /v1/onboarding` criaria duas regras de gravação para o mesmo campo. O defeito nasceu no frontend, quando as etapas foram separadas; o conserto fica lá. Na etapa `modalidade`, com `ON_SITE` marcado, **nada** é gravado e a pessoa segue para `endereco`. Sem `ON_SITE`, a etapa grava como hoje. A etapa `endereco` continua gravando `address` e `modalities` juntos.

(b) **A etapa `endereco` não grava sem `ON_SITE` no rascunho.** Se a pessoa abrir `/onboarding/endereco` direto, ou recarregar a página, o rascunho relido do servidor pode não ter `ON_SITE`. Nesse caso a etapa volta para `modalidade`, sem gravar `modalities` vazio nem endereço solto.

(c) **Custo aceito da escolha (a):** quem marca Local próprio e fecha a janela no endereço volta, na retomada, para `modalidade`, e não para `endereco`. A escolha de modalidade dessa pessoa não foi gravada. O ramo `endereco` de `nextRequiredStep` fica como está, para dado gravado por outro caminho.

(d) **As recusas nomeadas do teste real são traduzidas num único lugar**, no módulo compartilhado `features/activation-test/`, e usadas pelo onboarding e por Configurações › IA. `startActivationTest` passa a devolver como recusa, e não a lançar, os sete códigos do contrato (evidência 7). Qualquer outro erro continua subindo.

(e) **Indisponibilidade não convida a tentar de novo.** Para `PLATFORM_NUMBER_NOT_CONFIGURED`, a mensagem diz que o teste real não está disponível neste ambiente e que a IA só pode ser ativada depois dele. Ela não diz "Tente novamente" e não nomeia variável de ambiente. No onboarding, o caminho já existente de pular o teste continua visível. Nenhum progresso é simulado. As outras seis recusas dizem o que resolver, na linha do "Como se resolve" do contrato. `ACTIVATION_TEST_ALREADY_RUNNING` leva à leitura do estado, se o fluxo já tem como fazer isso sem código novo de estado; senão, diz que já há um teste em andamento.

(f) **`onboardingError` distingue três classes**, além do `409` de conclusão que já existe:
- dado recusado (`400` que nenhum campo da etapa absorveu): pede para revisar o que foi preenchido;
- serviço fora do ar (`status: 0`, `502`, `503`, `504`): diz que não foi possível falar com o servidor e que vale tentar em instantes;
- falha nossa (qualquer outro status): diz que algo deu errado do nosso lado.

O `409` de conclusão continua com o texto de hoje. A frase "Não foi possível salvar esta etapa. Tente novamente." deixa de existir como texto único para todos os casos. A copy final é do Developer, dentro destas regras, e fica exposta à conferência humana do §9.

(g) **Nenhuma rota, contrato, migration ou mudança de BFF em `src/`.** O BFF ganha só um teste que reproduz a sequência nova de gravação contra PostgreSQL real (§6.3).

## Fora do escopo

- R-02 a R-04 e R-06 a R-11, que têm Goals 082–085.
- Mudar a regra "ON_SITE exige endereço", o contrato de `PATCH /v1/onboarding` ou de `PATCH /v1/settings/business`.
- Mostrar a indisponibilidade do teste real **antes** do clique, o que exigiria uma leitura nova de capacidade no contrato.
- Configurar `PLATFORM_WHATSAPP_*` em qualquer ambiente (A-08 segue pendente).
- A busca por CEP (O-15), pendente de decisão humana.

## Dependências e contexto mínimo

- Depende do 080 só como baseline. Toca o que os Goals 063 (teste real e U-11), 065 e 072 (etapas do negócio) entregaram.
- Leitura suficiente: evidências 1 a 10 acima; `blocks/business.tsx`, `blocks/shared.tsx`, `blocks/activation-test.tsx`, `OnboardingRuntime.tsx`, `OnboardingScreen.tsx`, `features/activation-test/ActivationTestPanels.tsx`, `features/settings/AiSettings.tsx`; no BFF, só `lib/business-profile.ts` e a tabela de recusas de `PUBLIC_API_V1.md` como referência.
- Vault: `docs/product-vault/02-Fluxos/01-Onboarding.md`, só as seções de modalidade, endereço e teste real, se a copy precisar de apoio. Não carregar o vault inteiro.

## Pontos de implementação

- `apps/frontend/src/features/onboarding/blocks/business.tsx` — `persistBusinessStep`, ramos `modalidade` e `endereco`.
- `apps/frontend/src/features/onboarding/blocks/shared.tsx` — `onboardingError`.
- `apps/frontend/src/features/activation-test/ActivationTestPanels.tsx` — `startActivationTest` e a tradução das recusas.
- `apps/frontend/src/features/onboarding/blocks/activation-test.tsx` — só se precisar para mostrar a recusa e manter o caminho de pular visível.
- `apps/frontend/src/features/settings/AiSettings.tsx` — `startTest` usa a mesma tradução.
- `scripts/validate-integration.mjs` — **só** o comentário perto da linha 591.

## Escopo obrigatório

### 1. Local próprio avança (R-01)

Aplicar (a), (b) e (c). Voltar de `endereco` para `modalidade` mantém "Local próprio" marcado. Desmarcar Local próprio grava sem `ON_SITE`, e o BFF preserva o endereço gravado, como hoje.

### 2. Recusas do teste real (R-05)

Aplicar (d) e (e) no onboarding e em Configurações › IA. As duas telas mostram o mesmo texto para o mesmo código.

### 3. Erro de etapa em três classes

Aplicar (f). `onboardingError` continua sendo o único lugar dessa decisão no onboarding.

### 4. Comentário

Reescrever o comentário do passo `test:ai-orchestrator-content-purge` para dizer o que a purga não alcança hoje: órfão de sessão, dentro do prazo e o negócio vizinho, e não classificado só depois do prazo Comercial. Nenhum outro byte do arquivo muda.

### 5. Testes existentes

- "com Local próprio, grava e avança para endereco" (`goal065-onboarding-business.test.tsx`) é reescrito pelo §6.1: ele guarda o defeito.
- As asserções `queryByText("Não foi possível salvar esta etapa. Tente novamente.")` que provam ausência de aviso geral passam a nomear o texto novo que poderia aparecer, para não ficarem vazias.
- "recusa do servidor não vira progresso nem sucesso" (`goal019-activation-test-screens.test.tsx`) continua e ganha a asserção do texto de indisponibilidade.

O relatório lista cada asserção existente que mudou e diz por quê.

### 6. Provas que reprovam na baseline

Cada teste abaixo reprova na baseline `cc6c4e6` e passa no diff, salvo o §6.3, que é guarda. O relatório da rodada 1 cola o vermelho de cada um, rodado com os arquivos de `src/` restaurados da baseline e os testes novos no lugar, e confere a restauração por hash.

1. **Local próprio contra um dublê que aplica a regra do BFF** (`goal081-*` no frontend). O dublê de `onboarding.update` recusa `ON_SITE` sem endereço, gravado ou enviado, com o mesmo `BffHttpError` do BFF: `status: 400`, `code: "BUSINESS_ADDRESS_REQUIRED"`, `details: { field: "address" }`. Percorrendo `modalidade` → `endereco` → `sistema-atual` com Local próprio, nenhuma chamada é recusada, a etapa `modalidade` não chama `update`, e a etapa `endereco` chama `update` com `address` e `modalities: ["ON_SITE"]` juntos. Na baseline, a etapa `modalidade` é recusada.
2. **Endereço sem rascunho** (mesmo arquivo): abrir `endereco` com rascunho sem `ON_SITE` e continuar não chama `update` e leva a `modalidade`.
3. **Sequência nova contra PostgreSQL real** (`goal081-*` no BFF, em `apps/bff/tests/`): os corpos que o frontend passa a mandar, na ordem `segmento-e-nome` → `endereco`, dão `200` cada um em `PATCH /v1/onboarding`, e o `GET` seguinte traz `ON_SITE` e o endereço. É guarda do contrato: passa também na baseline, e está aqui porque o controle 1 do §7 depende do §6.1, e não deste.
4. **Indisponibilidade no onboarding** (`goal081-*` no frontend): `startActivationTest` do serviço rejeita com `502`, `UPSTREAM_ERROR`, `upstreamCode: "PLATFORM_NUMBER_NOT_CONFIGURED"`. A tela `teste-real` mostra o texto de indisponibilidade, não mostra "Tente novamente" nem "Não foi possível salvar esta etapa", não navega e mantém o caminho de pular visível.
5. **Indisponibilidade em Configurações › IA** (mesmo arquivo ou `goal081-*` próprio): o mesmo erro mostra o mesmo texto do §6.4, e não "Não foi possível iniciar o teste agora.".
6. **As seis recusas `409`**: cada código da evidência 7 produz o seu texto, e nenhum deles produz "Ainda há itens obrigatórios pendentes".
7. **Três classes do erro de etapa**: `onboardingError` devolve textos distintos para `400` sem campo, para `status: 0`/`502`/`503`/`504` e para `500`, e mantém o texto do `409`.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. A etapa `modalidade` volta a gravar `modalities` com `ON_SITE`: o teste §6.1 reprova.
2. A etapa `endereco` perde a guarda de (b): o teste §6.2 reprova.
3. `PLATFORM_NUMBER_NOT_CONFIGURED` sai da tradução: os testes §6.4 e §6.5 reprovam.
4. `AiSettings.startTest` volta a ignorar a tradução: o teste §6.5 reprova.
5. `onboardingError` volta ao texto único: o teste §6.7 reprova.

### 8. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-097** em `PROPOSED`, no formato de D-090 a D-096. Ela diz: a escolha (a) e o motivo; a guarda (b); o custo (c); a tradução única das recusas do teste real, (d) e (e); as três classes de (f); nenhuma mudança de contrato. "Revisar se" inclui: a retomada no endereço virar pedido de produto; o contrato ganhar leitura de capacidade do teste real; a regra "ON_SITE exige endereço" mudar.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§58**, sem reescrever §4 a §57. Ela registra R-01 e R-05 como corrigidos por este Goal e dá o veredito **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem contar os achados da revisão local, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md` **não** muda: o contrato já dizia o que a tela passa a fazer. O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§57 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada. Todo nome de rota, arquivo, função ou teste citado nos documentos do §8 é conferido contra o código antes da entrega: o blocker do review080 foi um nome de rota falso que nenhum gate acusou.

**Ordem obrigatória, a mesma dos Goals 065 a 080:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os cinco controles do §7.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos, e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Antes de entregar uma rodada de correção, rode um grep, nos documentos do §8, de cada frase que o review apontou como falsa, e cole o resultado vazio no relatório.

### 9. O que só uma pessoa confere

- Percorrer o onboarding de uma conta nova com "Local próprio", num navegador, contra o BFF real, até `sistema-atual`. O §6.3 prova os corpos contra o BFF, mas nenhum gate percorre a etapa clicando.
- Que o texto de indisponibilidade do teste real e os três textos de erro de etapa são claros para a profissional.
- Que o custo (c), voltar para `modalidade` na retomada, é aceitável.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 10. O que este Goal não pode fazer

- Toca só os arquivos de "Pontos de implementação", os testes, o teste novo do BFF em `apps/bff/tests/` e os documentos do §8. Não toca `apps/bff/src/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `tools/ia-loop/`, outros arquivos de `scripts/`, o vault, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Em `scripts/validate-integration.mjs`, muda só linhas de comentário. `git diff` desse arquivo não pode ter linha de código.
- Nenhuma rota, migration, campo de contrato ou opção nova em allowlist.
- **Falha de gate por ambiente** (memória, contenção, porta, rede, a tela "Verificando seu acesso" ou "the session marker is missing" que some na retentativa) é reexecutada ou reportada. Nunca é corrigida editando configuração (rodada 3 do review073, rodada 2 do review077, observação 1 do review072, observação 4 do review079, observação 1 do review080).
- Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff. Mas o teste §6.3 só vale como prova quando roda contra PostgreSQL real, e o relatório diz em qual execução isso aconteceu.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `next.config.ts`, nos specs de `e2e/` ou em `e2e/routes.ts`.
- Não remove teste, não pula teste e não encolhe suíte. O teste da evidência 3 é reescrito pelo §5, não removido.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Com Local próprio, o onboarding passa por `modalidade` e `endereco` sem recusa do BFF, e grava `ON_SITE` com o endereço numa única chamada. Provado pelo teste §6.1 e, contra PostgreSQL real, pelo §6.3 dentro de `validate:integration`.
2. `endereco` sem `ON_SITE` no rascunho não grava e volta para `modalidade`. Provado pelo teste §6.2.
3. Sem número da plataforma, o teste real diz que está indisponível no onboarding e em Configurações › IA, com o mesmo texto, sem "Tente novamente" e sem progresso; no onboarding, pular continua possível. Provado pelos testes §6.4 e §6.5.
4. As seis recusas `409` do teste real têm texto próprio. Provado pelo teste §6.6.
5. O erro de etapa distingue dado recusado, serviço fora do ar e falha nossa, e mantém o `409` de conclusão. Provado pelo teste §6.7.
6. `scripts/validate-integration.mjs` muda só em comentário, e o comentário diz a regra do Goal080. Provado por `git diff`.
7. Largura, contraste, foco e toque das telas tocadas continuam decididos pelo gate renderizado: `validate:ui` e o gate autenticado dentro de `validate:integration`, com os **170** testes da baseline e **0** retentativas. A clareza da copy fica no §9.
8. Os cinco controles negativos do §7 reprovam com o defeito e passam sem ele. Eles rodam depois da última edição de código, com a saída colada. Provado por execução.
9. Typecheck e lint de `apps/frontend` e `apps/bff` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline (referências: `test:frontend` **121**/**1244**, `test:gate` **233**, `test:bff-integration` **61**/**470**). `validate:core`, `validate:ui` e `validate:integration` passam. Provado por execução.
10. D-097 em `PROPOSED`, FINAL_AUDIT §58 com o veredito **0/7/5**, CURRENT_STATE e VALIDATION_GATE foram escritos depois da execução final e dos controles. Eles trazem as contagens da execução final e dizem que a conferência do §9 não foi feita. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a pessoa percorre o onboarding com Local próprio num navegador real, o que depende de conferência humana;
- que a copy nova é clara;
- que o teste real funciona com o número da plataforma configurado (A-08 segue pendente);
- a busca por CEP, pendente de decisão humana.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; R-01: `persistBusinessStep`, guarda de `endereco`, reescrita do teste da evidência 3, testes §6.1 a §6.3, com o vermelho da baseline (§1, §5) |
| WU-02 | STANDARD | WU-01 | R-05 e erro de etapa: tradução das recusas no módulo do teste real, onboarding, Configurações › IA, `onboardingError`, testes §6.4 a §6.7; comentário de `scripts/validate-integration.mjs` (§2, §3, §4, §5) |
| WU-03, WU-04 | DETERMINISTIC | WU-02 | typecheck de `apps/frontend` e `apps/bff` |
| WU-05, WU-06 | DETERMINISTIC | WU-02 | lint de `apps/frontend` e `apps/bff` |
| WU-07, WU-08 | DETERMINISTIC | WU-02 | testes dirigidos: `goal081` e `goal065-onboarding-business` no frontend |
| WU-09 | DETERMINISTIC | WU-03…WU-08 | validate-core |
| WU-10…WU-12 | DETERMINISTIC | WU-09 | gate-tests, validate-ui e validate-integration |
| WU-13 | STANDARD | WU-10, WU-11, WU-12 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular.

A prova de banco do §6.3 roda em `validate:integration`, no passo de `test:bff-integration`. Se `validate:integration` falhar num passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, sem editar configuração.
