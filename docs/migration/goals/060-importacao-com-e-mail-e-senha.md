# Goal 060 — Importação com e-mail e senha

**Status: ACCEPTED** no [review060](../reviews/060-review.md), rodada 4 de 4 (rodadas 1, 2 e 3 `CHANGES_REQUIRED` com 4, 3 e 3 blockers). Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal070 ACCEPTED](../reviews/070-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v83 precisa o escopo com evidência conferida no código e acrescenta um item: a credencial deixa de sobreviver à importação concluída (vault Q894).

## Baseline aceita

Baseline aceita: `61beaa5d907fd1cc4328a800140abc314b131bdc`

Goal anterior: 070 — O chat mostra o que a agenda fez

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal070 já integrado em `main` (origem `8b89f5dd615efc48acf251503fd8b161b7aa3953`). **Duas rodadas**, com 3 e 0 blockers. **D-076** foi aceita e [FINAL_AUDIT §37](../FINAL_AUDIT.md) escrita sem reescrever §4 a §36. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O 070 não tocou `apps/scheduling-service/`, `apps/bff/src/modules/calendar/` nem `apps/frontend/src/features/imports/`. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review070](../reviews/070-review.md): `test:gate` **233**; `test:frontend` **76** arquivos e **704** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **65** testes e **0** retentativas. A contagem da suíte de `apps/scheduling-service` na baseline é medida pelo Developer antes da primeira edição e registrada no relatório.

## Objetivo e posição

Fazer a conexão com a Minha Agenda pedir só e-mail e senha, dizer por que falhou quando falha, e apagar a credencial quando a importação termina. Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA IM-01** (ALTA): o formulário pede seis dados técnicos (usuário, senha, "Chave de acesso", "Endereço da sua conta", "Código do profissional" e "Forma de pagamento padrão"). O dono, que conhece o sistema, errou o endereço.
- **QA IM-02** (MÉDIA): o erro diz "Não foi possível conectar ao Minha Agenda agora. Tente novamente." para um erro que não se resolve tentando de novo.

Aplica **U-07** ([DECISIONS](../DECISIONS.md)): só e-mail e senha; endereço e cliente OAuth fixos no sistema; código do profissional e forma de pagamento descobertos ou configurados pelo sistema, nunca digitados. Aplica também a pergunta **894** do vault (`docs/product-vault/04-Referencia/99-Perguntas-e-Respostas.md:1019`, "Senha do Minha Agenda deve permanecer? — Não manter relação permanente. Vigente no produto").

Posição: primeiro da cadeia de importação (060 → 061 → 062), como na v78. O 061 depende da conexão que este Goal define.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **O contrato exige os seis campos e mais cinco ajustes internos.** `integrationBodySchema` (`apps/scheduling-service/src/modules/internal-api/routes.ts:405`) e `integrationSchema` (`apps/bff/src/modules/calendar/routes.ts:201`) exigem `credentials.basicAuth`, `credentials.username`, `credentials.password`, `configuration.baseUrl`, `configuration.employeeId` e `configuration.paymentMethod`. Aceitam ainda `modelVersion`, `timeoutMs`, `refreshSkewSeconds`, `enableWrites` e `bufferBetweenServicesMinutes`. A tela é `apps/frontend/src/features/imports/ConnectSourceScreen.tsx`.
2. **Três desses campos não têm leitor.** `paymentMethod`, `modelVersion` e `bufferBetweenServicesMinutes` não são lidos em lugar nenhum de `apps/scheduling-service/src/`, porque o writer remoto saiu no Goal026 (D-042). O `paymentMethod` de `minhaAgendaAppointmentSchema` (`types.ts`) é dado da origem, não configuração. `enableWrites` só existe para ser recusado (`routes.ts:1302`). `timeoutMs` e `refreshSkewSeconds` são lidos pelo cliente (`client.ts:99`, `:153` e `:174`).
3. **A causa de IM-02 não é só a copy.** O BFF embrulha todo erro não-2xx de serviço interno como `UPSTREAM_ERROR`, com o código original em `details.upstreamCode` e o status repassado quando menor que 500 (`apps/bff/src/clients/internal-http-client.ts:186-204`). `connectErrorMessage` (`ConnectSourceScreen.tsx:73`) compara `error.code` com `MINHA_AGENDA_*`, então nenhum caso casa e toda falha cai no texto genérico. O padrão que já lê `details.upstreamCode` existe em `features/knowledge/KnowledgeDocumentForm.tsx:204` e em `features/conversations/format.ts:99-107`.
4. **O status HTTP da origem vira o nosso.** `getAccessToken` (`client.ts:128`, erro em `:160`) lança `MINHA_AGENDA_AUTH_FAILED` com `statusCode` igual ao status da origem, qualquer que seja (401, 403 ou 5xx). `fetchJson` (`client.ts:223`, erro em `:258`) faz o mesmo com `MINHA_AGENDA_HTTP_ERROR`. Falha de rede em `getAccessToken` sai como erro cru, sem código. Um 401 do BFF quer dizer sessão Atendly inválida (`shared/runtime/ProductRuntime.tsx:55`), não credencial de terceiro recusada.
5. **O profissional pode ser descoberto, mas a forma da resposta não está confirmada.** O mapa histórico de endpoints do portal (`apps/api/docs/MINHAAGENDA_ENDPOINTS.md` no commit `1e22dff`, lido com `git show 1e22dff:apps/api/docs/MINHAAGENDA_ENDPOINTS.md`) registra `GET /employees/professionals` com a query `excludeThirdParties` e `includeDeleted`. Registra também `GET /employees`, `GET /user/me` e `GET /auth/loggedInUser`. O mapa descreve o que o frontend do portal chama, não o corpo da resposta. O vault diz que o MVP é para um único profissional e que o produto não expõe conceito de equipe (`docs/product-vault/00-Produto/01-Visao-do-Produto.md:65`).
6. **A credencial sobrevive à importação.** `IntegrationConnection` só é apagada por `DELETE /internal/calendar/integration` (`routes.ts:1396`). A transação de conclusão (`ImportCompletionService.completeOnce`, `apps/scheduling-service/src/modules/migrations/import-completion-service.ts:494`) não a toca. A tela de Importação escolhe o que mostrar pelo estado da importação (`history` e `session`), não pela integração (`ImportsScreen.tsx:89-95`), e nenhuma tela do frontend lê `calendar.integration`.
7. **Configuração nova passa por um gate.** `scripts/final-production-audit.mjs` exige que toda chave de `config/env.ts` esteja em `render.yaml` e que o `.env.example` de cada serviço tenha exatamente as chaves do `env.ts`. Ele recusa valor literal em chave cujo nome casa `SECRET|TOKEN|PASSWORD|API_KEY|CREDENTIAL` (`SECRET_LIKE_KEY_PATTERN`, linha 866) e confere o host de toda chave `*_BASE_URL`.
8. **O schema não muda.** `IntegrationConnection.config` é JSON e `credentialsEncrypted` são bytes. A forma nova cabe nos dois sem migration.

## Fora do escopo

- **QA IM-03 a IM-11**: timeout de análise e execução, reanálise a cada visita, contagem de clientes, lista completa de clientes, disponibilidade somada, telefone sem código do país e preço zero. São dos Goals 061 e 062. O `timeoutMs` atual (10 s) não muda aqui.
- A importação dentro do onboarding (U-09, Goal066).
- Escolha entre vários profissionais. O MVP é de um profissional só. Conta com mais de um é recusada com erro próprio (§3), e mudar isso é decisão de produto.
- A observação 4 do [review059](../reviews/059-review.md) (`goal008-agenda.test.ts` intermitente). Se ela reprovar em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa, como no Goal059.
- A observação 3 do [review070](../reviews/070-review.md) (seção de Conversas de `PUBLIC_API_V1.md`). Este Goal não toca essa seção.
- Deploy e conta real. A conferência contra a conta de teste da Minha Agenda (U-05) é humana e fica fora da prova deste Goal (§8).

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas IM-01 e IM-02 e o diagnóstico da seção 4k do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md);
- U-05 e U-07 na tabela de perguntas de [DECISIONS](../DECISIONS.md), e D-026 e D-042 só na parte da conexão da origem;
- em `apps/scheduling-service/src/modules/integrations/minha-agenda/`: `config.ts`, `client.ts`, `types.ts` e o construtor de `import-source-reader.ts`;
- em `apps/scheduling-service/src/modules/internal-api/routes.ts`: `integrationBodySchema` e as rotas `/internal/calendar/integration/connect`, `/reconnect` e `DELETE /internal/calendar/integration`;
- `apps/scheduling-service/src/config/env.ts`, `apps/scheduling-service/.env.example` e o bloco do scheduling-service em `render.yaml`;
- `completeOnce` em `import-completion-service.ts`;
- `integrationSchema` e a rota `/v1/calendar/integration/connect` em `apps/bff/src/modules/calendar/routes.ts`, e `upstreamError` em `apps/bff/src/clients/internal-http-client.ts`;
- a linha da conexão da origem em `apps/bff/PUBLIC_API_V1.md` (linha 74) e a seção de Importação;
- `ConnectSourceScreen.tsx`, `CalendarIntegrationInput` e `connectIntegration` em `apps/frontend/src/data/services/BffCalendarService.ts`;
- os testes que montam o corpo antigo: `apps/scheduling-service/tests/unit/import-origin-connection.test.ts`, `import-routes.test.ts`, `minha-agenda-client.test.ts` e `minha-agenda-import-snapshot.test.ts`; `apps/bff/tests/goal010-import-routes.integration.test.ts` e `goal020-import-state-routes.integration.test.ts`; `apps/frontend/tests/goal020-imports-entry.test.tsx`.

## Pontos de implementação

- `apps/scheduling-service/src/config/env.ts`, `.env.example` e `render.yaml`: as duas chaves do §1.
- `apps/scheduling-service/src/modules/integrations/minha-agenda/config.ts`, `client.ts` e `types.ts`: configuração vinda do sistema, descoberta do profissional e classes de erro.
- `apps/scheduling-service/src/modules/internal-api/routes.ts`: corpo novo da conexão.
- `apps/scheduling-service/src/modules/migrations/import-completion-service.ts`: apagar a credencial na conclusão.
- `apps/bff/src/modules/calendar/routes.ts` e `apps/bff/PUBLIC_API_V1.md`: corpo público novo e códigos de erro.
- `apps/frontend/src/features/imports/ConnectSourceScreen.tsx` e `apps/frontend/src/data/services/BffCalendarService.ts`.
- Testes novos com prefixo `goal060-` em `apps/scheduling-service/tests/`, `apps/bff/tests/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. Endereço e cliente OAuth vêm do sistema (scheduling-service)

- `MINHA_AGENDA_API_BASE_URL` entra em `config/env.ts` com default `https://api.minhaagendaapp.com.br`, e em `.env.example` e `render.yaml` com esse valor. É endereço público, não segredo.
- `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` entra em `config/env.ts` como opcional, sem default, e em `.env.example` sem valor. Em `render.yaml` entra com `sync: false`. É o valor do cabeçalho `Basic` do cliente OAuth do portal, igual para todo negócio. O cliente continua aceitando o valor com ou sem o prefixo `Basic `.
- **Nenhum valor real desse cliente OAuth entra no repositório**, em código, teste, fixture, documento ou relatório. Os testes usam valor fictício.
- Sem `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, conectar é recusado com `MINHA_AGENDA_NOT_CONFIGURED` (503). A recusa acontece antes de qualquer chamada à origem e antes de qualquer escrita. O serviço sobe normalmente sem a chave; só a conexão com a Minha Agenda fica indisponível.
- O leitor da origem (`parseMinhaAgendaConnection` e `MinhaAgendaClient`) usa **sempre** o endereço e o cliente OAuth do sistema. Linha antiga de `IntegrationConnection` que ainda guarde `baseUrl` na configuração ou `basicAuth` na credencial continua legível, e esses dois valores gravados são ignorados.
- `timeoutMs` e `refreshSkewSeconds` deixam de vir de quem chama. Ficam como valores do sistema, com os defaults atuais (10.000 ms e 300 s). `paymentMethod`, `modelVersion`, `bufferBetweenServicesMinutes` e `enableWrites` saem da configuração gravada e da validação, porque não têm leitor.

### 2. A conexão pede só e-mail e senha

- `POST /internal/calendar/integration/connect` e `POST /v1/calendar/integration/connect` passam a aceitar só `{ "email": string, "password": string }`, com schema estrito. Campo a mais, inclusive `basicAuth`, `baseUrl`, `employeeId`, `paymentMethod`, `enableWrites` ou o envelope antigo `credentials`/`configuration`, é recusado com `VALIDATION_ERROR`, sem chamada à origem e sem escrita. A resposta de sucesso continua `calendarStateSchema`; `packages/public-api-contract` não muda.
- O servidor exige e-mail e senha não vazios, com limite de tamanho. Ele não valida o formato do e-mail: quem decide se o login existe é a origem.
- A conexão faz o login, descobre o profissional (§3) e só então grava. A credencial gravada, cifrada por negócio como hoje (`encryptIntegrationCredentials`), guarda só o e-mail e a senha. A configuração gravada guarda o `employeeId` descoberto.
- `reconnect` continua testando a credencial gravada, agora com o endereço e o cliente OAuth do sistema.

### 3. O profissional é descoberto, e a conta de mais de um profissional é recusada

- Depois do login, a conexão chama `GET /employees/professionals` com `includeDeleted=false`, pelo mesmo cliente autenticado. Não use outro filtro que a baseline não justifique.
- A resposta passa por schema antes de qualquer uso: lista de objetos com `id` inteiro positivo e o resto preservado (`.passthrough()`, como os outros schemas de `types.ts`). Resposta fora da forma sai `MINHA_AGENDA_INVALID_RESPONSE`, pela mesma sanitização de `parseSourceResponse`.
- Um profissional: o `id` dele é o `employeeId` gravado. Nenhum: `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND`. Mais de um: `MINHA_AGENDA_MULTIPLE_PROFESSIONALS`. Os dois saem com 422, e nenhum escolhe um profissional por conta própria.
- O caminho e a forma da resposta são os do mapa histórico (evidência 5) e **não estão confirmados contra a API real**. D-077 declara isso, e o §8 separa a conferência humana.

### 4. O erro diz a causa, e o status da origem nunca vira o nosso

Toda falha da conexão cai em uma de quatro classes, com código e status próprios:

| Classe | Quando | Código | Status |
| --- | --- | --- | --- |
| Credencial recusada | `/oauth/token` responde 400 ou 401 | `MINHA_AGENDA_AUTH_FAILED` | 422 |
| Conta sem um profissional único | §3 | `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND`, `MINHA_AGENDA_MULTIPLE_PROFESSIONALS` | 422 |
| Origem indisponível | timeout; falha de rede; `/oauth/token` com outro status não-2xx (403, 429, 5xx); chamada autenticada não-2xx depois da nova tentativa; resposta fora do schema | `MINHA_AGENDA_TIMEOUT` (504), `MINHA_AGENDA_UNREACHABLE` (502, novo, para falha de rede), `MINHA_AGENDA_HTTP_ERROR` (502), `MINHA_AGENDA_INVALID_RESPONSE` (502) | 502 ou 504 |
| Falha nossa | configuração do sistema ausente; configuração gravada ilegível | `MINHA_AGENDA_NOT_CONFIGURED` (503), `INTEGRATION_CONFIGURATION_INVALID` (500, já existe) | 503 ou 500 |

- **Nenhum código `MINHA_AGENDA_*` sai com status 401 ou 403**, em nenhuma rota do scheduling-service. O status da origem pode ir para os `details`, nunca para o status da resposta.
- Nenhuma mensagem ou `details` carrega e-mail, senha, token, cabeçalho `Basic` ou corpo da resposta da origem. Nada disso vai para log.
- Em toda falha da conexão nada é gravado: nem linha nova, nem alteração da linha existente. `reconnect` continua gravando `status: "ERROR"` e `lastErrorCode`, como hoje.
- O BFF não traduz os códigos. Eles chegam ao frontend pelo mecanismo existente: `code: "UPSTREAM_ERROR"`, `details.upstreamCode` e o status repassado.

### 5. A tela pede e-mail e senha e fala a causa (frontend)

- `ConnectSourceScreen` tem só dois campos: "E-mail do Minha Agenda" e "Senha do Minha Agenda". Somem "Chave de acesso", "Endereço da sua conta", "Código do profissional" e "Forma de pagamento padrão", com a validação e o texto de ajuda deles.
- A validação continua sendo a do próprio formulário, com erro inline, sem balão nativo do navegador.
- `CalendarIntegrationInput` passa a ser `{ email, password }`.
- `connectErrorMessage` lê `details.upstreamCode`, no mesmo padrão de `KnowledgeDocumentForm.tsx`. Cada classe do §4 tem um texto distinto, em linguagem de produto:
  - credencial recusada: pede para conferir o e-mail e a senha da Minha Agenda;
  - sem profissional e com mais de um profissional: cada um diz o que encontrou na conta. O de mais de um diz que, por enquanto, a Atendly importa a agenda de um profissional só;
  - origem indisponível: diz que a Minha Agenda não respondeu, que nada foi salvo e que vale tentar de novo em alguns minutos;
  - falha nossa: diz que a importação está indisponível por uma falha da Atendly, e não por causa dos dados informados.
- `IMPORT_ALREADY_COMPLETED` e `VALIDATION_ERROR` mantêm o tratamento atual. Nenhum texto usa "token", "OAuth", "endereço", "HTTP", "API" ou o código cru, e nenhum repete `error.message`.
- A tela diz, perto dos campos, que a Atendly usa esses dados só para esta importação e os apaga quando ela termina. Esse texto só é verdadeiro por causa do §6.

### 6. A credencial é apagada quando a importação termina (vault Q894)

- Na mesma transação de `completeOnce` que grava `completedAt`, a linha `IntegrationConnection` `MINHA_AGENDA` do negócio é apagada, filtrada pelo `tenantId` do contexto.
- Se a transação falha, a linha fica. Conclusão repetida (idempotente) não falha por a linha já não existir. A conclusão de um negócio nunca toca a linha de outro.
- Depois da conclusão, `GET /v1/calendar` devolve `integration: null`. A tela de Importação mostra o histórico, como hoje.
- `DELETE /internal/calendar/integration` não muda.

### 7. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e a saída do vermelho vai colada no relatório. A origem é sempre um dublê de `fetch` ou um servidor local. Nenhum teste chama a Minha Agenda real.

1. **Scheduling, conexão:**
   - com `{ email, password }`, o login vai para `<MINHA_AGENDA_API_BASE_URL>/oauth/token?isWeb=true` com o `Basic` do sistema, a descoberta vai para `/employees/professionals` com `includeDeleted=false`, e a linha gravada tem o `employeeId` descoberto e não tem `baseUrl`, `paymentMethod` nem `basicAuth`;
   - corpo com qualquer campo antigo é recusado com `VALIDATION_ERROR`, sem `fetch` e sem escrita;
   - sem `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, sai `MINHA_AGENDA_NOT_CONFIGURED` 503, sem `fetch` e sem escrita.
2. **Scheduling, classes de erro:** token 400 e 401 dão `MINHA_AGENDA_AUTH_FAILED` 422; token 403 e 500, falha de rede e timeout dão a classe "origem indisponível" com 502 ou 504; chamada autenticada 401 depois da nova tentativa dá `MINHA_AGENDA_HTTP_ERROR` 502. Nenhum caso sai 401 ou 403, e nenhum grava.
3. **Scheduling, profissional:** zero dá `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND`; dois dão `MINHA_AGENDA_MULTIPLE_PROFESSIONALS`; resposta fora da forma dá `MINHA_AGENDA_INVALID_RESPONSE`. Nenhum grava.
4. **Scheduling, linha antiga:** uma `IntegrationConnection` gravada com `baseUrl` do portal e `basicAuth` na credencial é lida com o endereço e o cliente OAuth do sistema. O teste confere o host e o cabeçalho que o `fetch` recebeu.
5. **Scheduling, conclusão, contra PostgreSQL real** (suíte de integração do Scheduling): concluir apaga a linha do negócio; a linha de outro negócio fica; falha dentro da transação mantém a linha; repetir a conclusão não falha.
6. **BFF:** o corpo público novo passa; o corpo antigo é recusado com `VALIDATION_ERROR` sem chamar o scheduling; `MINHA_AGENDA_AUTH_FAILED` 422 e `MINHA_AGENDA_NOT_CONFIGURED` 503 chegam como `UPSTREAM_ERROR` com `details.upstreamCode` e o mesmo status; a resposta de sucesso passa no schema do contrato.
7. **Frontend (jsdom):**
   - só os dois campos existem, e o envio manda `{ email, password }`;
   - cada classe do §4 mostra o seu texto, com o erro montado **no formato real** que o BFF emite: `code: "UPSTREAM_ERROR"` e o código em `details.upstreamCode`. O teste atual que monta `code: "MINHA_AGENDA_AUTH_FAILED"` direto é o formato irreal que escondeu IM-02;
   - nenhum texto de erro contém "token", "OAuth", "endereço", "HTTP", "API" nem código cru.

Os testes existentes continuam passando. Só muda asserção de teste que monta o corpo antigo de seis campos ou o erro no formato irreal, e o relatório lista cada uma dessas mudanças.

### 8. O que só uma pessoa confere

Depois do aceite, com a pilha local e a conta de teste de U-05, uma pessoa confere que o login e a descoberta do profissional funcionam contra a Minha Agenda real. O valor de `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` é posto no ambiente local por essa pessoa, nunca num arquivo versionado nem no chat. O Developer não pede, não procura e não registra esse valor.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Se a conta real tiver mais de um profissional, ou se a resposta de `/employees/professionals` tiver outra forma, isso é evidência nova para o planejamento, não falha escondida.

### 9. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo. Cole a **saída real** no relatório, como nos Goals 059 e 070:

1. O cliente volta a usar o status da origem no `MINHA_AGENDA_AUTH_FAILED`: o teste "nunca 401 ou 403" do §7.2 reprova.
2. `connectErrorMessage` volta a comparar `error.code`: o teste jsdom de classes do §7.7 reprova.
3. O leitor volta a usar o `baseUrl` gravado: o teste de linha antiga do §7.4 reprova.
4. A descoberta passa a aceitar o primeiro de vários profissionais: o teste de dois profissionais do §7.3 reprova.
5. O schema do corpo deixa de ser estrito: o teste de corpo antigo do §7.1 ou do §7.6 reprova.
6. A conclusão deixa de apagar a linha: o teste de PostgreSQL do §7.5 reprova.

### 10. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: o corpo novo de `/v1/calendar/integration/connect` e a tabela de códigos do §4, com as classes. Diz que a credencial é apagada ao concluir a importação.
- [DECISIONS](../DECISIONS.md) ganha **D-077** em `PROPOSED`, no formato de D-073 a D-076. Ela diz que:
  - endereço e cliente OAuth da origem são configuração do sistema, e o cliente OAuth é segredo de ambiente;
  - a conexão pede só e-mail e senha, com schema estrito;
  - o profissional é descoberto, e a conta de mais de um é recusada;
  - o status da origem nunca vira status nosso, e as classes de erro são as do §4;
  - a credencial é apagada na conclusão, pela pergunta 894 do vault.

  Limites da D-077: caminho e forma da descoberta vêm do mapa histórico e não foram conferidos contra a API real; a conferência humana do §8 não foi feita; escolha entre vários profissionais não existe. A D-077 diz o que muda em U-07, sem reescrevê-la.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§38**, sem reescrever §4 a §37: **QA IM-01** e **QA IM-02** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram a conexão nova, as chaves de ambiente, as classes de erro, a remoção da credencial na conclusão, a conferência humana pendente e as contagens da execução final. As contagens incluem as suítes de `apps/scheduling-service`, `apps/bff` e `apps/frontend` (arquivos e testes), `test:gate` e o `expected`/`unexpected`/`flaky` do gate autenticado.
- `apps/scheduling-service/AGENTS.md` ou `README.md`, só se descreverem a configuração da conexão de forma que o diff torne falsa.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) não é editado.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

### 11. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/`, migrations, schema Prisma, `tools/ia-loop/` nem `QA_LOCAL_REVIEW.md`.
- Não muda análise, execução, preview, conflitos, lease nem retomada da importação, fora o apagar da credencial no §6. Não muda `timeoutMs`.
- Não grava valor real do cliente OAuth, e-mail ou senha em arquivo nenhum, nem em log.
- Não chama a Minha Agenda real em teste, ensaio ou gate.
- Não cria escolha de profissional nem conceito de equipe na tela.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core`, nenhuma regra de `final-production-audit.mjs` relaxada e nenhuma medida do gate autenticado desligada.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A conexão aceita só `{ email, password }`, usa o endereço e o cliente OAuth do sistema, descobre o profissional e grava sem `baseUrl`, `paymentMethod` nem `basicAuth`. Corpo antigo é recusado sem escrita. Provado por execução dos testes `goal060-` de `apps/scheduling-service` e `apps/bff` (§7.1 e §7.6), com o vermelho da baseline colado.
2. As classes de erro do §4 saem com o código e o status da tabela, nenhuma com 401 ou 403, e nenhuma falha grava. Provado por execução (§7.2 e §7.3).
3. Linha antiga continua legível e é lida com a configuração do sistema. Provado por execução (§7.4).
4. A conclusão apaga a credencial do negócio na mesma transação e não toca a de outro. Provado por execução contra PostgreSQL real (§7.5), dentro de `validate:integration`.
5. A tela tem só e-mail e senha e mostra um texto distinto por classe, com o erro no formato real do BFF. Provado por execução jsdom (§7.7). Largura, toque, contraste, foco e movimento das telas medidas continuam decididos por `validate:ui`.
6. As duas chaves estão em `env.ts`, `.env.example` e `render.yaml`, e `final-production-audit.mjs` passa sem regra relaxada. Nenhum valor real do cliente OAuth está no diff. Provado por diff e por execução de `test:gate` e `validate:core`.
7. Os seis controles negativos do §9 reprovam com o defeito e passam sem ele. A saída está colada, e os controles rodaram depois da última edição de código. Provado por execução.
8. Typecheck e lint de `apps/scheduling-service`, `apps/bff` e `apps/frontend` passam. As suítes dos três não têm teste a menos que a baseline (`test:frontend` **76** arquivos e **704** testes). `test:gate` não tem teste a menos que a baseline (**233**). `validate:core`, `validate:ui` e `validate:integration` passam, este com o gate autenticado em **65** testes ou mais e **0** retentativas. Provado por execução.
9. D-077 em `PROPOSED`, FINAL_AUDIT §38, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo, trazem as contagens da execução e dizem que a conferência humana do §8 não foi feita. Provado por diff contra a execução.
10. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que o login e a descoberta funcionam contra a Minha Agenda real. Isso é a conferência humana do §8;
- que a análise e a execução da importação terminam para uma conta real, o que é do Goal061;
- que a tela bate com o protótipo aprovado, o que é conferência humana (Goal069).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Configuração do sistema, corpo novo da conexão, descoberta do profissional e classes de erro no scheduling-service (§1 a §4), com `env.ts`, `.env.example`, `render.yaml` e os testes `goal060-` do §7.1 a §7.4 |
| WU-02 | STANDARD | WU-01 | Apagar a credencial na conclusão (§6), com o teste de PostgreSQL do §7.5 |
| WU-03 | STANDARD | WU-01 | Corpo público novo no BFF e `PUBLIC_API_V1.md` (§2, §4), com os testes `goal060-` do BFF (§7.6) |
| WU-04 | STANDARD | WU-03 | Tela de dois campos e mensagens por classe no frontend (§5), com os testes jsdom (§7.7) |
| WU-05 | STANDARD | WU-01, WU-02, WU-03, WU-04 | Controles negativos (§9) e documentação (§10) |
| WU-06…WU-19 | DETERMINISTIC | WU-05 | typecheck e lint dos três apps, testes dirigidos (`goal060`) nos três, gate-tests, git-diff-check, validate-core, validate-ui e validate-integration |

A unidade `validate-integration` roda a suíte de integração do Scheduling (onde fica o teste do §7.5), a do BFF e o gate autenticado contra bancos descartáveis. Se ela falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, como o Goal059 fez com `goal008-agenda`. Os critérios 4 e 8 continuam exigindo a saída desses passos.
