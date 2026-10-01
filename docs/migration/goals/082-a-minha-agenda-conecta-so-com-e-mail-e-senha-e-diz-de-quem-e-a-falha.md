# Goal 082 — A Minha Agenda conecta só com e-mail e senha e diz de quem é a falha

**Status: ACCEPTED.** Preparado em 2026-09-30 pelo Tech Lead Agent após [Goal084 ACCEPTED](../reviews/084-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v103 com o título "A Minha Agenda conecta só com e-mail e senha, sem credencial em ambiente", parada à espera de uma pessoa na v105 e destravada na v107 pela revisão da **U-12** por Felipe Borges ([DECISIONS](../DECISIONS.md)). READY na v108, com o mesmo ID, **à frente do 085**. O título muda nesta passada porque a U-12 revista mantém a variável de ambiente: o título antigo prometia o contrário. O escopo foi precisado por evidência conferida no código.

## Baseline aceita

Baseline aceita: `20b90554cdf7a45ac1f3c434abc9a135e010774a`

Goal anterior: 084 — Dados exibidos como a pessoa espera: preço em reais, telefone formatado e texto sem artigo fixo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal084 já integrado em `main` (origem `dd165fcbecd63ab26853954b8ba4ca3b28d99ad7`). **Uma rodada**, sem blocker. **D-099** foi aceita e [FINAL_AUDIT §60](../FINAL_AUDIT.md) escrita sem reescrever §4 a §59. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**. Depois dele, `main` recebeu só o commit documental `7a16ad8` (status do documento do Goal084), que não é baseline. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review084](../reviews/084-review.md) e de FINAL_AUDIT §60: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **127** arquivos e **1334** testes; `test:scheduling-service` **37** arquivos e **502** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **175** testes e **0** retentativas. A última contagem registrada de `test:bff-integration` é **62** arquivos e **471** testes ([VALIDATION_GATE](../VALIDATION_GATE.md), execução final do Goal081); os Goals 083 e 084 não tocaram `apps/bff/`.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline e antes da primeira edição, `test:scheduling-service`, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Esse é o piso da execução final; se divergir dos números acima, o relatório diz por quê. Nas recontagens do 081 ao 084, `test:gate` só passou depois de `npx prisma generate` no ai-orchestrator: é pré-condição do harness, não efeito do diff.

## Objetivo e posição

Fechar **R-02 (ALTA)** do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080) dentro do que a **U-12 revista** decide:

- a pessoa informa **só e-mail e senha** da Minha Agenda, e nada mais lhe é pedido nem mostrado;
- a identificação do app do portal (`Authorization: Basic` do login) é **configuração interna do servidor da Atendly**, em `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, igual para todo negócio e fornecida pela operação;
- o agente **não** extrai esse valor do código do portal, nem o procura, nem o escreve em arquivo algum;
- a integração não é oficial: pode quebrar se o portal mudar, e o risco de termos de uso foi assumido por Felipe.

Com isso, o que falta ao produto é **dizer de quem é a falha**. A pessoa precisa saber quando corrigir a própria senha e quando não há nada a fazer do lado dela. A operação precisa saber, pelo log, que a configuração falta ou que o portal a recusou.

**Posição.** O 082 passa à frente do 085. R-02 é o único achado de severidade ALTA do re-teste ainda aberto, e a v107 o destravou. O 085 junta R-06, R-08, R-09 (BAIXA) e R-10 (MÉDIA), todos de acabamento de tela. Os dois não tocam os mesmos arquivos.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **A tela e o contrato já pedem só e-mail e senha.** `POST /v1/calendar/integration/connect` aceita só `{ email, password }` (Goal060, D-077). O endereço vem de `MINHA_AGENDA_API_BASE_URL` e a identificação do app vem de `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, as duas em `apps/scheduling-service/src/config/env.ts`. Nada disso muda.
2. **Configuração ausente já tem código próprio.** `minhaAgendaSystemSettings` (`integrations/minha-agenda/config.ts`) recusa com `MINHA_AGENDA_NOT_CONFIGURED` 503 antes de qualquer chamada de rede. O BFF repassa o 503 (`MINHA_AGENDA_UPSTREAM_STATUS` em `apps/bff/src/modules/calendar/routes.ts`), e `connectErrorMessage` (`features/imports/ConnectSourceScreen.tsx`) diz que a falha é da Atendly e não dos dados informados. **Mas ninguém da operação fica sabendo:** o serviço sobe sem aviso, e a recusa não é registrada em log, porque o `setErrorHandler` de `app/build-app.ts` só registra erro que não é `AppError`.
3. **O login confunde a identificação do app com a senha da pessoa.** Em `getAccessToken` (`integrations/minha-agenda/client.ts`), toda resposta 400 **ou 401** do `/oauth/token` vira `MINHA_AGENDA_AUTH_FAILED` 422, e a tela diz "Confira o e-mail e a senha". O corpo da resposta é lido e descartado. Felipe observou que chamar o login sem a identificação do app volta **401**. Pela RFC 6749 §5.2, o 401 do endpoint de token é a recusa da autenticação **do cliente** (`invalid_client`), e a senha errada da pessoa é `invalid_grant`, em 400. Resultado: se a identificação configurada estiver errada, vencida ou trocada pelo portal, **toda** pessoa ouve que a senha dela está errada, e a operação não vê nada.
4. **A importação em segundo plano herda a mesma confusão.** `classifyImportWorkCode` (`modules/migrations/import-lease.ts`) traduz `MINHA_AGENDA_AUTH_FAILED` em `IMPORT_SOURCE_AUTH_REJECTED`, que a tela mostra como "A senha pode ter mudado". `MINHA_AGENDA_NOT_CONFIGURED` já cai em `IMPORT_INTERNAL_ERROR`. O log do trabalho (`ImportBackgroundWork` em `build-app.ts`) registra só o código do conjunto fechado, sem o código da origem.
5. **A documentação de operação não diz o que é a variável.** `.env.example` do Scheduling a chama de "cliente OAuth do portal", sem dizer quem a fornece, em que formato, nem como saber que ela falta ou foi recusada. O README do Scheduling não tem seção de operação. `render.yaml` já declara a variável com `sync: false`.
6. **Os testes de hoje afirmam a regra antiga.** `tests/unit/goal060-minha-agenda-connection.test.ts` tem `it.each([400, 401])` esperando `MINHA_AGENDA_AUTH_FAILED` para os dois status, com dublê de `fetch` que devolve corpo vazio.

## Escolhas de desenho desta passada

- **(a) A recusa do login é classificada pelo campo `error` do corpo, com o status como reserva.** O corpo da resposta de erro do `/oauth/token` é lido como texto e, se for JSON com `error` em texto, só esse campo é comparado, sem diferença entre maiúsculas e minúsculas, com uma lista fixa. Nenhuma outra parte do corpo é lida, guardada, registrada ou repassada.

  | Resposta do `/oauth/token` | Código | HTTP nosso | Quem age |
  | --- | --- | --- | --- |
  | 400 ou 401 com `error` `invalid_grant` | `MINHA_AGENDA_AUTH_FAILED` | 422 | a pessoa (e-mail ou senha) |
  | 400 sem `error` reconhecido | `MINHA_AGENDA_AUTH_FAILED` | 422 | a pessoa (como hoje) |
  | 401 com `error` `invalid_client`, `unauthorized_client` ou `unauthorized` | `MINHA_AGENDA_CLIENT_REJECTED` (novo) | 503 | a operação |
  | 401 sem `error` reconhecido (corpo vazio, não JSON ou outro valor) | `MINHA_AGENDA_CLIENT_REJECTED` | 503 | a operação |
  | 403, 429, 5xx ou outro status | `MINHA_AGENDA_HTTP_ERROR` | 502 | ninguém (como hoje) |
  | rede ou tempo esgotado | `MINHA_AGENDA_UNREACHABLE` / `MINHA_AGENDA_TIMEOUT` | 502 / 504 | ninguém (como hoje) |

  Motivo: a RFC 6749 §5.2 dá o 401 à autenticação do cliente e o `invalid_grant` à credencial da pessoa, e o login sem a identificação do app volta 401. O `error` vence o status, então um portal que responda senha errada com `401 invalid_grant` continua culpando a senha. **Limite declarado:** se o portal real responder senha errada com 401 sem `invalid_grant`, a pessoa ouve que a importação está indisponível. Isso só se confere contra a conta real (§8). `details` de `MINHA_AGENDA_CLIENT_REJECTED` carrega só `{ originStatus }`, como os demais. O status da origem nunca vira o nosso, e nenhum `MINHA_AGENDA_*` sai com 401 ou 403.
- **(b) A operação vê a falta e a recusa no log, nunca o valor.** Ao subir, sem `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, o Scheduling registra **um** aviso (`warn`) que nomeia a variável e diz que a importação da Minha Agenda está indisponível; o serviço sobe normalmente. A cada recusa `MINHA_AGENDA_NOT_CONFIGURED` ou `MINHA_AGENDA_CLIENT_REJECTED`, o Scheduling registra um erro (`error`) com o código, o `originStatus` quando houver e o `requestId`. O log do trabalho em segundo plano passa a levar também o código da origem que causou a falha (por exemplo, `MINHA_AGENDA_CLIENT_REJECTED`), ao lado do código do conjunto fechado. Nenhum desses registros contém o valor da variável, e-mail, senha, token ou corpo da origem. **`/health` não muda:** o endereço do Scheduling é público no Render, e a falta da configuração não pode derrubar o health check do serviço inteiro.
- **(c) Para a pessoa, configuração ausente e recusada são a mesma coisa.** `MINHA_AGENDA_CLIENT_REJECTED` usa o mesmo texto que `MINHA_AGENDA_NOT_CONFIGURED` já usa em `connectErrorMessage`: a falha é da Atendly, não dos dados informados. Nenhum texto pede à pessoa outra credencial, código ou configuração. O BFF repassa `MINHA_AGENDA_CLIENT_REJECTED` com o 503 do Scheduling, como já faz com `MINHA_AGENDA_NOT_CONFIGURED`.
- **(d) Em segundo plano, a recusa da identificação é falha nossa.** `MINHA_AGENDA_CLIENT_REJECTED`, direto ou como causa de `MINHA_AGENDA_IMPORT_CATEGORY_FAILED`, vira `IMPORT_INTERNAL_ERROR`, nunca `IMPORT_SOURCE_AUTH_REJECTED`. O conjunto fechado de `lastError` do contrato público não muda.
- **(e) A variável fica.** Nenhuma variável é removida ou renomeada, nem ganha valor default. O formato aceito continua o de hoje: com ou sem o prefixo `Basic `. Nenhum arquivo do repositório recebe o valor.

## Fora do escopo

- Qualquer leitura, download ou análise do código, do bundle ou do tráfego do portal `portal.minhaagendaapp.com.br` ou de `api.minhaagendaapp.com.br`, e qualquer tentativa de obter, adivinhar ou testar o valor da identificação do app. Nenhuma chamada de rede real à Minha Agenda: todo teste usa dublê.
- Remover, renomear ou dar default a `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` ou `MINHA_AGENDA_API_BASE_URL`; mudar `render.yaml`.
- Mudar `/health` de qualquer serviço, o contrato de `POST /v1/calendar/integration/connect` além do código novo de recusa, ou o conjunto fechado de `lastError`.
- Descobrir antes do formulário que a importação está indisponível (exigiria um campo novo de contrato). Fica registrado em D-100 como "Revisar se".
- Mudar a descoberta do profissional, a leitura das categorias, a renovação do token por tempo ou a nova tentativa da chamada autenticada.
- R-06, R-08, R-09 e R-10 (Goal085). A observação 1 do review084 (a Inbox formata JID estrangeiro como brasileiro). A pergunta do item 5 de D-098.

## Dependências e contexto mínimo

- Decisões: **U-12 revista** e U-07 ([DECISIONS](../DECISIONS.md), tabela de decisões do usuário); **D-077**, item 4 (classes de erro da conexão, que este Goal muda no 401); D-005 não se aplica.
- Contrato: `apps/bff/PUBLIC_API_V1.md`, seção "Conexão da origem: só e-mail e senha (Goal060)".
- Não é preciso abrir o vault: nenhuma regra de produto muda. Não abra `apps/api/docs/MINHAAGENDA_ENDPOINTS.md` nem o histórico de `apps/api/`.

## Pontos de implementação

- `apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts`: (a) em `getAccessToken`.
- `apps/scheduling-service/src/modules/integrations/minha-agenda/config.ts` e `src/config/env.ts`: só comentários, para dizer o que a variável é, quem a fornece e o que acontece sem ela.
- `apps/scheduling-service/src/app/build-app.ts`: (b), o aviso ao subir, o erro por recusa e o código da origem no log do trabalho em segundo plano. Pode ser numa função pequena ao lado, se ficar mais claro.
- `apps/scheduling-service/src/modules/migrations/import-lease.ts`: (d), só se a classificação atual não bastar. Hoje um código desconhecido já cai em `IMPORT_INTERNAL_ERROR`; o teste prova.
- `apps/bff/src/modules/calendar/routes.ts`: `MINHA_AGENDA_CLIENT_REJECTED: 503` em `MINHA_AGENDA_UPSTREAM_STATUS`.
- `apps/frontend/src/features/imports/ConnectSourceScreen.tsx`: (c), um `case` a mais.
- `apps/scheduling-service/.env.example` e `apps/scheduling-service/README.md`: §4.
- `apps/bff/PUBLIC_API_V1.md`: §4.

## Escopo obrigatório

### 1. O login diz de quem é a falha

Implemente (a). Leia o corpo da resposta de erro uma vez, como hoje. Interprete-o como JSON dentro de `try`. Compare só `error`, quando for texto, com a lista fixa. Corpo vazio, não JSON, `error` ausente ou de outro tipo contam como "sem `error` reconhecido". A mensagem de `MINHA_AGENDA_CLIENT_REJECTED` é fixa e em inglês, como as demais, e não contém nada da resposta.

### 2. A operação vê a falta e a recusa

Implemente (b) e (d). O aviso ao subir sai uma vez por processo, não por requisição. O erro por recusa sai em toda recusa `MINHA_AGENDA_NOT_CONFIGURED` ou `MINHA_AGENDA_CLIENT_REJECTED`, de qualquer rota. A resposta HTTP dessas recusas não muda de forma: `{ error: { code, message, details }, requestId }`.

### 3. A tela e o BFF tratam o código novo

Implemente (c) no BFF e na tela. Nenhum outro texto da tela muda.

### 4. Documentação de operação

- `apps/scheduling-service/.env.example`: o comentário da variável diz que ela é a identificação do app do portal Minha Agenda, usada no cabeçalho `Authorization: Basic` do login, igual para todo negócio e fornecida pela operação da Atendly. Diz também que nunca é pedida ao usuário, que aceita o valor com ou sem o prefixo `Basic `, que sem ela a importação fica indisponível e o serviço registra um aviso ao subir, e que `MINHA_AGENDA_CLIENT_REJECTED` no log quer dizer que o portal recusou o valor configurado. A linha continua vazia.
- `apps/scheduling-service/README.md` ganha uma seção curta "Operação: importação da Minha Agenda", com as duas variáveis, o que cada código de log quer dizer (`MINHA_AGENDA_NOT_CONFIGURED`, `MINHA_AGENDA_CLIENT_REJECTED`) e o que a pessoa vê na tela. Diz que a integração não é oficial, que pode quebrar se o portal mudar e que o valor nunca entra no repositório.
- `apps/bff/PUBLIC_API_V1.md`, seção da conexão: a tabela de classes passa a ter `MINHA_AGENDA_CLIENT_REJECTED` em "Falha nossa", com 503. "Credencial recusada" passa a dizer que é a da pessoa. O parágrafo do status repassado passa a citar os três códigos.

### 5. Testes existentes

Continuam passando. Só muda asserção que depende de 401 virar `MINHA_AGENDA_AUTH_FAILED`. Em `goal060-minha-agenda-connection.test.ts`, o `it.each([400, 401])` é **reescrito** para a tabela de (a), sem ser removido. O teste "nenhuma classe de erro sai com status 401 ou 403" continua valendo sem mudança. O relatório lista cada asserção mudada e o motivo.

### 6. Provas novas

Dublê de `fetch` no padrão de `goal060-minha-agenda-connection.test.ts`, sem rede real. Em cada resposta de erro do dublê, o corpo carrega um texto sentinela em `error_description` (por exemplo, `SENTINELA-ORIGEM-082`).

`apps/scheduling-service/tests/unit/goal082-minha-agenda-auth-classes.test.ts`:

1. Cada linha da tabela de (a), pela rota de conexão: o código e o status da resposta são os da tabela, nenhuma linha é gravada e o corpo da resposta não contém o sentinela, o e-mail, a senha nem o valor de `TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`. Inclui `401 invalid_grant` (pessoa), `400` sem corpo (pessoa), `401 {"error":"unauthorized"}` (operação), `401 {"error":"Invalid_Client"}` (operação, sem diferença de caixa), `401` sem corpo (operação) e `401` com corpo não JSON (operação).
2. O log capturado da instância de teste: com `MINHA_AGENDA_CLIENT_REJECTED`, há um registro `error` com o código e `originStatus: 401`. Sem a variável, `buildApp` registra um `warn` que nomeia `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, e a conexão registra um `error` com `MINHA_AGENDA_NOT_CONFIGURED`. Em nenhum registro aparecem o valor da variável, o sentinela, o e-mail, a senha ou o token.
3. Com a variável preenchida, `buildApp` não registra o aviso.
4. Em segundo plano, `importWorkFailure` dá `IMPORT_INTERNAL_ERROR` para `MINHA_AGENDA_CLIENT_REJECTED` direto e como causa de `MINHA_AGENDA_IMPORT_CATEGORY_FAILED`, e continua dando `IMPORT_SOURCE_AUTH_REJECTED` para `MINHA_AGENDA_AUTH_FAILED`.

`apps/bff/tests/goal082-integration-connect-client-rejected.test.ts`, no padrão de `goal060-integration-connect.test.ts`:

5. `MINHA_AGENDA_CLIENT_REJECTED` vindo do Scheduling com 503 chega como `UPSTREAM_ERROR` com status **503**, não 502, e `details.upstreamCode` igual. `MINHA_AGENDA_AUTH_FAILED` e `MINHA_AGENDA_NOT_CONFIGURED` continuam como hoje.

`apps/frontend/tests/goal082-connect-source-client-rejected.test.tsx`, no padrão de `goal060-connect-source.test.tsx`:

6. `MINHA_AGENDA_CLIENT_REJECTED` mostra o mesmo texto de `MINHA_AGENDA_NOT_CONFIGURED`, e nenhum dos dois textos contém "senha", "e-mail" nem "Confira". `MINHA_AGENDA_AUTH_FAILED` continua pedindo para conferir e-mail e senha.

As provas 1, 2, 5 e 6 **reprovam na baseline**. A prova 3 e a parte de `MINHA_AGENDA_AUTH_FAILED` da prova 4 podem passar na baseline, e o relatório diz quais passaram. O relatório cola a saída dos três arquivos novos rodados contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. `getAccessToken` volta a tratar 401 como `MINHA_AGENDA_AUTH_FAILED`: a prova 1 reprova.
2. O `error` do corpo deixa de ser lido (só o status decide): a linha `401 invalid_grant` da prova 1 reprova.
3. O registro de erro por recusa passa a incluir o valor da variável: a prova 2 reprova.
4. `MINHA_AGENDA_CLIENT_REJECTED` sai de `MINHA_AGENDA_UPSTREAM_STATUS` no BFF: a prova 5 reprova.
5. O `case` de `MINHA_AGENDA_CLIENT_REJECTED` sai de `connectErrorMessage`: a prova 6 reprova.

### 8. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-100** em `PROPOSED`, no formato de D-090 a D-099. Ela muda o item 4 de D-077 no 401 do login, aplica a U-12 revista e diz:
  - (a) a (e), com o motivo de cada um, incluindo a RFC 6749 §5.2 e a observação de Felipe sobre o 401;
  - o limite declarado de (a);
  - que `/health` não muda, e por quê.

  O "Revisar se" inclui: a conferência do §9 mostrar que o portal responde senha errada com 401 sem `invalid_grant`; o portal passar a exigir outra coisa no login; e o produto querer dizer antes do formulário que a importação está indisponível.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§61**, sem reescrever §4 a §60. Ela registra R-02 como fechado no que o repositório prova e diz o que segue dependendo da conta real. O veredito é **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, recontado por execução, sem contar os achados da revisão local.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md`, `.env.example` e o README do Scheduling, pelo §4.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o vault, `docs/design-reference/` e `render.yaml` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§60 e as decisões aceitas. **O texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada. Todo nome de rota, arquivo, função, classe, código de erro ou teste citado nos documentos é conferido contra o código antes da entrega.

**Ordem obrigatória, a mesma dos Goals 065 a 084:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os cinco controles do §7.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos, e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz o que foi feito no código, o que foi feito na evidência e o que ficou faltando.

### 9. O que só uma pessoa confere

Em sessão assistida, com a conta de teste real (U-05) e o valor fornecido pela operação, fora do repositório:

- Conectar com e-mail e senha certos e ver a importação seguir.
- Conectar com a senha errada e ver "Confira o e-mail e a senha". É esta conferência que decide o limite declarado de (a).
- Subir o Scheduling sem a variável, ou com um valor errado, e ver na tela que a importação está indisponível sem culpar a senha, e no log o aviso ao subir e o código da recusa.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 10. O que este Goal não pode fazer

- Toca só os arquivos de "Pontos de implementação", os testes novos e reescritos em `apps/scheduling-service/tests/unit/`, `apps/bff/tests/` e `apps/frontend/tests/`, e os documentos do §8. Não toca `apps/frontend/e2e/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `apps/health-worker/`, `packages/`, `scripts/`, `tools/ia-loop/`, `render.yaml`, o vault, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma rota de API, migration, reescrita de dado, campo de contrato, variável de ambiente nova ou removida, ou opção nova em allowlist. O único acréscimo de contrato é o código de recusa `MINHA_AGENDA_CLIENT_REJECTED`.
- **Nenhum segredo em arquivo, log, teste ou relatório.** O teste usa só o valor fictício de `TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`. Nenhuma chamada de rede real à Minha Agenda.
- **Falha de gate por ambiente** é reexecutada ou reportada, e nunca corrigida editando configuração. Isso vale para memória, contenção, porta, rede, `net::ERR_NO_BUFFER_SPACE`, a tela "Verificando seu acesso" ou "the session marker is missing" que some na retentativa.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma mudança em `vitest.config.*`, `playwright.config.*` ou `next.config.ts`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A recusa do login segue a tabela de (a), com o `error` do corpo vencendo o status. Provado pela prova 1 e pelo teste reescrito de `goal060-minha-agenda-connection.test.ts`.
2. A operação vê no log a falta da variável ao subir e cada recusa por configuração, sem o valor, o corpo da origem, e-mail, senha ou token. Provado pelas provas 2 e 3.
3. Em segundo plano, a recusa da identificação é `IMPORT_INTERNAL_ERROR`, e a senha recusada continua `IMPORT_SOURCE_AUTH_REJECTED`. Provado pela prova 4.
4. O BFF repassa `MINHA_AGENDA_CLIENT_REJECTED` com 503, e a tela não culpa a senha. Provado pelas provas 5 e 6.
5. `/health`, `render.yaml` e as variáveis de ambiente não mudam. Verificável no diff.
6. A largura, o toque, o contraste, o foco e `prefers-reduced-motion` da tela de conexão são decididos pelo gate renderizado (`validate:ui` e o gate autenticado dentro de `validate:integration`, com **175** testes e **0** retentativas). O que a pessoa entende do texto fica no §9.
7. Os cinco controles do §7 reprovam com o defeito e passam sem ele. Eles rodam depois da última edição de código, com a saída colada.
8. Typecheck e lint de `apps/scheduling-service`, `apps/bff` e `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline (referências: `test:scheduling-service` **37**/**502**, `test:frontend` **127**/**1334**, `test:gate` **233**, `test:bff-integration` **62**/**471**). `validate:core`, `validate:ui` e `validate:integration` passam.
9. D-100 está em `PROPOSED`. FINAL_AUDIT §61 dá o veredito **0/7/5**. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §9 não foi feita.
10. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:**

- que o portal real responde senha errada com `invalid_grant` ou 400, que é a conferência do §9;
- que o valor que a operação fornecer é aceito pelo portal, nem que o portal não mudou;
- que a importação real da conta de teste traz a base inteira, que segue como a conferência humana dos Goals 060 a 062.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; login classificado (§1) e log de operação (§2) no Scheduling; teste do Goal060 reescrito (§5); `goal082-minha-agenda-auth-classes` com o vermelho da baseline (§6, provas 1 a 4) |
| WU-02 | MECHANICAL | WU-01 | BFF e tela tratam o código novo (§3); `goal082-integration-connect-client-rejected` e `goal082-connect-source-client-rejected` com o vermelho da baseline (§6, provas 5 e 6); documentação de operação e contrato (§4) |
| WU-03 | DETERMINISTIC | WU-01 | typecheck de `apps/scheduling-service` |
| WU-04 | DETERMINISTIC | WU-02 | typecheck de `apps/bff` |
| WU-05 | DETERMINISTIC | WU-02 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-01 | lint de `apps/scheduling-service` |
| WU-07 | DETERMINISTIC | WU-02 | lint de `apps/bff` |
| WU-08 | DETERMINISTIC | WU-02 | lint de `apps/frontend` |
| WU-09 | DETERMINISTIC | WU-01 | testes dirigidos: `goal082-minha-agenda-auth-classes` |
| WU-10 | DETERMINISTIC | WU-01 | testes dirigidos: `goal060-minha-agenda-connection` |
| WU-11 | DETERMINISTIC | WU-02 | testes dirigidos: `goal082-connect-source-client-rejected` |
| WU-12 | DETERMINISTIC | WU-03…WU-11 | validate-core |
| WU-13 | DETERMINISTIC | WU-12 | gate-tests |
| WU-14 | DETERMINISTIC | WU-12 | validate-ui |
| WU-15 | DETERMINISTIC | WU-12 | validate-integration (inclui `test:bff-integration`, onde roda a prova 5) |
| WU-16 | STANDARD | WU-13, WU-14, WU-15 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-17 | DETERMINISTIC | WU-16 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular. A prova 5 roda no BFF, cuja suíte só existe dentro de `validate:integration`; por isso não há unidade dirigida para ela. A WU-02 depende da WU-01 porque usa o código que a WU-01 cria e porque a recontagem da baseline vem antes de qualquer edição.
