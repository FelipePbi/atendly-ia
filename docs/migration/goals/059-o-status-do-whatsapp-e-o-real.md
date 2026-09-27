# Goal 059 — O status do WhatsApp é o real

**Status: ACCEPTED** no [review059](../reviews/059-review.md), rodada 3 de 3 (rodadas 1 e 2 `CHANGES_REQUIRED` com 5 e 3 blockers). Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal058 ACCEPTED](../reviews/058-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 059 nasce na [v78 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção do usuário a partir da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md). A v80 a pôs antes do 058B. A v81 a marca READY e amplia o escopo com cinco pontos conferidos no código, sem mudar o título.

## Baseline aceita

Baseline aceita: `5ff8e46caef207620a4ebc6022931fe315775573`

Goal anterior: 058 — A área logada volta a ter casca, e o gate autenticado passa a medir a composição

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal058 já integrado em `main` (origem `75dd844373eb84706c5555e1e00deb64e0bf8f0a`). **Duas rodadas**, com 5 e 0 blockers. **D-074** foi aceita e [FINAL_AUDIT §35](../FINAL_AUDIT.md) escrita sem reescrever §4 a §34. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, que conta os achados A-01…A-24 do Goal030 e não os da revisão local. O 058 não tocou `apps/bff/`. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Fazer a Home, a sidebar, o checklist, a central de notificações e a tela de WhatsApp dizerem o estado real da conexão, e mostrarem um número de telefone, não um identificador técnico. Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA X-01** (ALTA): `GET /v1/whatsapp` diz `CONNECTED`, e ao mesmo tempo `GET /v1/status` diz `whatsapp: UNKNOWN, degraded: true` e `GET /v1/dashboard` diz `whatsapp: {status: "error", code: "DEPENDENCY_UNAVAILABLE"}`. Todo negócio com credencial cifrada, ou seja todo negócio novo, vê "WhatsApp desconectado · O atendimento automático está pausado" e um convite a reconectar uma conexão que funciona.
- **QA H-02** (ALTA): estados contraditórios na mesma tela: "IA ativa" na sidebar e, ao mesmo tempo, "Atendimento automático pausado" e "WhatsApp desconectado".
- **QA S-09** e **QA O-46** (MÉDIA): a tela de WhatsApp mostra `55<número>:8@s.whatsapp.net`, o JID com o sufixo de aparelho `:8`, e `phoneNumber` de `GET /v1/whatsapp` guarda esse JID.
- **QA O-47** (BAIXA): tentativa de conexão que falha deixa na Evolution uma instância órfã, sem webhook e sem dono, que ninguém remove.
- **QA A-06** (BAIXA): contato cujo JID vem sem o 9º dígito (formato legado de celular brasileiro) aparece como telefone fixo.

Posição: primeiro depois do 058 e antes do 058B, pelo motivo da v80. QA X-01 é ALTA e atinge todo negócio novo; QA CV-03 (058B) é MÉDIA.

## O que a evidência desta passada mostra

- **A causa do X-01 é uma credencial usada sem abrir.** `whatsappSummary` (`apps/bff/src/modules/dashboard/routes.ts:133`–`:153`) passa `instance.evolutionInstanceToken` direto a `evolution.getStatus`. Esse campo guarda o envelope cifrado desde que a credencial passou a ser selada (`sealedInstanceCredentialData`, `modules/whatsapp/instance-link.ts`). `GET /v1/whatsapp` abre o envelope antes, por `resolveInstanceCredential` (`instance-link.ts:160`). `whatsappSummary` é chamada por `GET /v1/dashboard` (`dashboard/routes.ts:41`) e por `GET /v1/status` (`modules/status/routes.ts:64`).
- **A mesma função lê o vínculo fora da regra de posse.** `whatsappSummary` busca por `findUnique({ where: { userId } })`. As rotas de `/v1/whatsapp` usam `findLinkedInstance(tenant)`, que confere tenant e usuário e recusa vínculo `pending` e `divergent`. Hoje, `/v1/status` e `/v1/dashboard` consultam a Evolution com a instância de um vínculo que as outras rotas recusam.
- **O erro some sem registro.** `settled` (`dashboard/routes.ts`) transforma qualquer exceção em `DEPENDENCY_UNAVAILABLE` e não registra nada. A revisão local só achou a causa lendo o código.
- **Os testes não viram o defeito porque o mock não confere a credencial.** Em `apps/bff/tests/goal014-status.integration.test.ts`, o vínculo é criado com `sealedInstanceCredentialData("wa_synthetic_status_credential", …)`, mas o mock de `/instance/status` responde sem olhar o header `apikey`. O envelope cifrado passava e o teste ficava verde.
- **O H-02 não é só efeito do X-01.** Na Home, o banner deriva de `dashboard.whatsapp` com `whatsapp?.status !== "CONNECTED"` (`apps/frontend/src/features/dashboard/DashboardScreen.tsx:290`–`:307`; o mesmo predicado em `:195`–`:202`). Falha de consulta (`status: "error"`) vira "WhatsApp desconectado · O atendimento automático está pausado" e "Reconectar WhatsApp". A sidebar (`StatusLine`, `AppShell.tsx`) e o checklist da Home leem `status.whatsappView`, de `/v1/status`, e já mostram "WhatsApp não confirmado" quando o estado é desconhecido. Com o X-01 corrigido, a contradição voltaria em toda falha transitória da Evolution.
- **A central de notificações já está certa na regra.** `modules/notifications/plan.ts` não abre nem resolve `WHATSAPP_DISCONNECTED` com `UNKNOWN`. O que ela recebia de errado era o `UNKNOWN` em vez de `CONNECTED`, que vem do X-01.
- **O contrato público já diz dígitos; o código está errado.** `apps/bff/PUBLIC_API_V1.md:356` documenta `"phoneNumber": "5511999999999"`. `EvolutionClient.getStatus` (`apps/bff/src/clients/evolution/index.ts:164`) devolve `myJid`/`jid` cru, e `GET /v1/whatsapp` grava esse valor em `WhatsAppInstance.phoneNumber` e o devolve em `whatsappDto`. `apps/bff/src/lib/phone.ts` já tem `phoneFromWhatsappJid`, que tira servidor e sufixo de aparelho. A forma do campo no contrato (`z.string().nullable()` em `packages/public-api-contract/src/schemas.ts`) não muda.
- **A órfã do O-47 nasce na ordem de `ensureInstance`.** Em `apps/bff/src/modules/whatsapp/routes.ts`, `ensureInstance` chama `evolution.createInstance` e só depois `sealedInstanceCredentialData`, que lança `CREDENTIAL_UNAVAILABLE` quando `WHATSAPP_CREDENTIAL_KEYS` falta. A instância remota fica criada sem linha local. Foi a primeira falha da revisão local. `EvolutionClient.deleteInstance` existe e é o que `disconnect.ts` usa.
- **O número sem 9º dígito é exibição.** `formatPhone` (`apps/frontend/src/features/conversations/format.ts:21`) formata 12 dígitos com `55` como fixo, `(DD) XXXX-XXXX`. `WhatsAppConnectionPanel.tsx:151`–`:153` mostra `connection.phoneNumber` sem formatar.

## Fora do escopo

- **QA CV-03** (eventos da agenda no chat): Goal058B.
- A regra de produto sobre o que a sidebar diz da IA quando o WhatsApp está de fato desconectado ("IA ativa" com atendimento pausado). Este Goal tira a contradição que vem de estado **falso** ou **desconhecido**; não redesenha a faixa de estado (QA H-01, Goal068).
- Busca de cliente por telefone com e sem o 9º dígito. A revisão local não verificou, e o BFF já compara candidatos por `whatsappPhoneCandidates`. Não entra.
- Fidelidade visual da tela de WhatsApp e da Home ao protótipo: Goals 068 e 069.
- O webhook registrado como `localhost` e os `.env` locais defasados, que a revisão local marcou como "nota de ambiente (não é bug do produto)".
- Limpeza de órfãs que **já existem** na Evolution. Este Goal impede órfã nova; não varre instâncias antigas.

## Dependências e contexto mínimo

Leia só o necessário: as linhas X-01, H-02, S-09, O-46, O-47 e A-06 e as notas de ambiente da seção 4g do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md); `apps/bff/src/modules/whatsapp/instance-link.ts` inteiro; `apps/bff/src/lib/phone.ts`; a seção de `/v1/status` e de `/v1/whatsapp` em `apps/bff/PUBLIC_API_V1.md`; D-004 e D-019 em [DECISIONS](../DECISIONS.md) para a posse do vínculo e a credencial por instância. Para o protótipo, só a seção de WhatsApp conectado de `docs/design-reference/claude-design/prototype/project/Configuracoes-Desktop.dc.html`, e só para o formato do número ("Conectado · +55 11 98765-4321"). O protótipo é referência, não runtime.

## Pontos de implementação

- `apps/bff/src/modules/dashboard/routes.ts` (`whatsappSummary`, `settled`) e `apps/bff/src/modules/status/routes.ts` (chamada de `whatsappSummary`).
- `apps/bff/src/modules/whatsapp/routes.ts` (`GET /v1/whatsapp`, `ensureInstance`, `connect`, `whatsappDto`) e `apps/bff/src/clients/evolution/index.ts` só se a normalização do número morar nele.
- `apps/bff/src/lib/onboarding-state.ts`, que também expõe `phoneNumber`.
- Testes em `apps/bff/tests/`, arquivo novo com prefixo `goal059-`, no mesmo arnês de `goal014-status.integration.test.ts`.
- `apps/frontend/src/features/dashboard/DashboardScreen.tsx`, `apps/frontend/src/features/whatsapp/WhatsAppConnectionPanel.tsx`, `apps/frontend/src/features/conversations/format.ts` e, se o formatador passar a ser compartilhado, um módulo em `apps/frontend/src/shared/`.
- Testes jsdom em `apps/frontend/tests/`, arquivo novo com prefixo `goal059-`.

## Escopo obrigatório

### 1. A leitura de status usa o vínculo e a credencial abertos (QA X-01)

- `whatsappSummary` recebe o `TenantContext` (ou o que for preciso para chamar `findLinkedInstance`), resolve o vínculo por `findLinkedInstance` e abre a credencial por `resolveInstanceCredential`, como `GET /v1/whatsapp` já faz. Nenhum caminho de leitura de status passa `evolutionInstanceToken` cru à Evolution.
- Vínculo ausente continua sendo `null`, que `/v1/status` mostra como `DISCONNECTED`, como hoje. Vínculo `pending` ou `divergent`, credencial que não abre e Evolution fora do ar viram erro, que `/v1/status` mostra como `UNKNOWN` e `/v1/dashboard` como `status: "error"`. Nenhum desses casos vira `DISCONNECTED`.
- `whatsappSummary` não ganha escrita nova. Se `resolveInstanceCredential` regravar o envelope por rotação ou cifrar estoque legado, é o comportamento que ele já tem em `GET /v1/whatsapp`. O relatório diz se a leitura de status passou a disparar essa escrita, e com que frequência (a sidebar lê `/v1/status` no tick do shell).
- `settled` registra a falha com `request.log.warn` (ou equivalente), com código e status HTTP do erro quando existirem, e **sem** credencial, envelope, número ou corpo da resposta no log. A forma da resposta pública não muda.
- A forma de `/v1/status` e `/v1/dashboard` não muda: nenhum campo novo, nenhum campo a menos.

### 2. O número é número (QA S-09/O-46)

- `phoneNumber` sai do BFF em dígitos, como `PUBLIC_API_V1.md:356` já documenta, em `GET /v1/whatsapp`, em `GET /v1/status`, em `GET /v1/dashboard` e no estado de onboarding (`lib/onboarding-state.ts`). A conversão usa o que `lib/phone.ts` já tem (`phoneFromWhatsappJid` ou `normalizeWhatsappPhone`); não nasce um parser novo de JID.
- `GET /v1/whatsapp` passa a gravar em `WhatsAppInstance.phoneNumber` o número já convertido. Linha antiga que ainda guarda JID sai convertida na resposta, sem migration, e é regravada na próxima leitura de `GET /v1/whatsapp`, que já regrava a linha.
- JID de grupo ou `@lid` não vira número: sai `null` ou o último número guardado, como hoje quando a Evolution não informa. O teste cobre JID com sufixo de aparelho (`5511987654321:8@s.whatsapp.net`), JID sem sufixo, dígitos puros e `@lid`.

### 3. Tentativa de conexão que falha não deixa instância órfã (QA O-47)

- `ensureInstance` confere, **antes** de `evolution.createInstance`, o que ele sabe que vai recusar depois: sem `WHATSAPP_CREDENTIAL_KEYS` (`credentialKeysConfigured()`), a conexão recusa com `CREDENTIAL_UNAVAILABLE` sem chamar a Evolution.
- Se qualquer passo entre `createInstance` e a gravação da linha local lançar, o BFF tenta remover a instância remota com `evolution.deleteInstance` e relança o erro original. Falha da remoção é registrada em log, sem credencial, e não troca o erro que o dono vê.
- Falha **depois** da gravação da linha (por exemplo em `provisionChannel`) não remove nada: a linha local existe e a próxima tentativa a reutiliza por `findLinkedInstance`, como hoje. O relatório confirma esse caminho com um teste ou com a leitura do código citada.

### 4. A Home diz o mesmo que a sidebar (QA H-02)

- O banner da Home deriva o estado do WhatsApp da mesma fonte que a sidebar e o checklist da mesma tela já usam (`status.whatsappView`, de `/v1/status`), não de um segundo predicado sobre `dashboard.whatsapp`. Se a execução mostrar motivo para manter `dashboard.whatsapp`, o predicado passa a distinguir as mesmas três situações, e o relatório diz por quê.
- Estado desconhecido (erro de consulta, `UNKNOWN`) não mostra "WhatsApp desconectado", nem "O atendimento automático está pausado", nem o botão "Reconectar WhatsApp". Mostra que o estado não foi confirmado, com a copy que a sidebar já usa ("WhatsApp não confirmado") ou equivalente sem afirmar desconexão, e um caminho para `/configuracoes/whatsapp`.
- Estado desconectado de fato continua mostrando o banner de hoje. Estado conectado não mostra banner de WhatsApp.
- Carregando (`loading`) não mostra banner de desconexão.

### 5. O número aparece formatado (QA S-09, QA A-06)

- A tela de WhatsApp conectado mostra o número formatado como no protótipo ("+55 11 98765-4321"), nunca o JID nem dígitos crus.
- Celular brasileiro com 12 dígitos (`55` + DDD + 8 dígitos) cujo primeiro dígito do assinante é de 6 a 9 é exibido com o 9º dígito, como celular. Número de 12 dígitos cujo primeiro dígito do assinante é de 2 a 5 continua exibido como fixo. Isso vale para `formatPhone` de Conversas e para a tela de WhatsApp, pela mesma função de normalização; o formato de cada tela pode continuar o de hoje.
- Só exibição: nenhum identificador, chave de busca ou valor gravado muda por causa deste item.
- Teste jsdom com JID com sufixo de aparelho, 13 dígitos, 12 dígitos de celular, 12 dígitos de fixo e valor vazio.

### 6. Provas que reprovam na baseline

Cada teste novo do §1 ao §5 é rodado primeiro contra o código da baseline, e a saída do vermelho vai colada no relatório. Em particular:

1. **O mock de Evolution passa a conferir a credencial.** No teste novo `goal059-`, a resposta de `/instance/status` só é `connected: true` quando o header `apikey` é exatamente a credencial em claro (`wa_synthetic_status_credential` ou a do próprio teste), e responde 401 para qualquer outro valor, inclusive o envelope. Na baseline, `/v1/status` sai `UNKNOWN` e `/v1/dashboard` sai `status: "error"` com o vínculo conectado. Com a correção, `CONNECTED` nos dois e igual a `GET /v1/whatsapp`.
2. **Vínculo `pending` e `divergent`:** `/v1/status` sai `UNKNOWN`, e o mock prova que a Evolution **não** foi chamada.
3. **Número:** `/v1/whatsapp`, `/v1/status` e `/v1/dashboard` devolvem dígitos quando a Evolution devolve JID com sufixo.
4. **Órfã:** sem `WHATSAPP_CREDENTIAL_KEYS`, `POST /v1/whatsapp/connect` recusa e o mock prova zero chamada a `/instance/create`; com falha forçada entre a criação remota e a gravação local, o mock recebe `/instance/delete/<id>`.
5. **Home:** com `whatsappView` `unknown`, o banner não contém "desconectado", "pausado" nem "Reconectar"; com `off`, contém; com `active`, não há banner de WhatsApp.

Os testes existentes de `goal014-status` e de `tenant-instance-link` continuam passando. Se uma asserção existente dependia do mock que não conferia a credencial, a mudança é a mínima, com o motivo no teste e no relatório.

### 7. Controles negativos, rodados depois da última edição de código

Cada controle é aplicado numa cópia ou revertido no mesmo passo, e a **saída real** é colada no relatório, como no Goal058:

1. `whatsappSummary` volta a passar `instance.evolutionInstanceToken` cru: o teste do §6.1 reprova.
2. `whatsappSummary` volta a buscar por `userId`: o teste do §6.2 reprova.
3. `phoneNumber` sem conversão: o teste do §6.3 reprova.
4. `ensureInstance` sem a conferência prévia e sem a remoção compensatória: o teste do §6.4 reprova.
5. O banner da Home volta a `whatsapp?.status !== "CONNECTED"`: o teste do §6.5 reprova.

### 8. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: a descrição de `phoneNumber` em `/v1/status` e em `/v1/whatsapp` diz que é o número em dígitos, sem servidor nem sufixo de aparelho, e que `UNKNOWN` cobre vínculo que não pode ser lido. Forma e exemplo não mudam.
- `apps/frontend/AGENTS.md:191`: "Criar serviço" abre o formulário passa a dizer que "Novo serviço" abre o formulário e "Criar serviço" recebe o clique, como D-074 item 3 e VALIDATION_GATE já dizem (observação 1 do [review058](../reviews/058-review.md)).
- [DECISIONS](../DECISIONS.md) ganha **D-075** em `PROPOSED`, no formato de D-073 e D-074: toda leitura de estado do canal passa por `findLinkedInstance` e `resolveInstanceCredential`; estado desconhecido nunca é exibido como desconexão; `phoneNumber` público é dígitos; criação remota de instância é desfeita quando a linha local não chega a existir. Limites: a remoção compensatória é melhor esforço e não varre órfãs antigas; a exibição com o 9º dígito é só exibição. D-004 e D-019 não são reescritas; D-075 diz o que acrescenta a elas.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§36**, sem reescrever §4 a §35: **QA X-01, QA H-02, QA S-09, QA O-46, QA O-47 e QA A-06** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24; o veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram a leitura de status pelo vínculo, o mock que confere a credencial, a remoção compensatória, a derivação única do banner e as contagens da execução.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) não é editado.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

### 9. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, migrations, `tools/ia-loop/` nem `QA_LOCAL_REVIEW.md`.
- Não muda a forma de nenhum campo público, não acrescenta rota e não muda schema Prisma.
- Não cria caminho de credencial novo: nada de ler `EVOLUTION_GO_API_KEY` no lugar da credencial da instância, nada de queda para chave global, nada de guardar a credencial em claro, nada de credencial, envelope ou número completo em log.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core`, nenhuma medida do gate autenticado desligada.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Com vínculo conectado e credencial cifrada, `/v1/status` e `/v1/dashboard` dizem `CONNECTED`, iguais a `/v1/whatsapp`, com o mock de Evolution recusando qualquer `apikey` que não seja a credencial em claro. Na baseline, o mesmo teste reprova, com a saída colada. Provado por execução de `test:bff-integration`, dentro de `validate:integration`.
2. Vínculo `pending` e `divergent` dão `UNKNOWN` em `/v1/status` sem chamada à Evolution. Provado por execução.
3. `settled` registra a falha sem credencial nem número. Provado por diff e por teste que lê o log ou o espião do logger.
4. `phoneNumber` sai em dígitos nas quatro saídas do §2, inclusive para linha antiga que guarda JID. Provado por execução.
5. Sem chave de credencial, a conexão recusa sem chamar `/instance/create`; com falha entre a criação remota e a linha local, `/instance/delete/<id>` é chamado e o erro original chega ao cliente. Provado por execução.
6. Na Home, estado desconhecido não afirma desconexão nem pausa; desconectado mostra o banner de hoje; conectado não mostra banner de WhatsApp; o banner usa a mesma derivação da sidebar. Provado por execução jsdom e por diff.
7. O número aparece formatado na tela de WhatsApp e em Conversas, com o 9º dígito para celular legado e sem ele para fixo. Provado por execução jsdom.
8. Os cinco controles negativos do §7 reprovam com o defeito e passam sem ele, com a saída colada e rodados depois da última edição de código. Provado por execução.
9. Typecheck e lint de `apps/bff` e de `apps/frontend` verdes; suítes dos dois sem teste a menos que a baseline; `test:gate` sem teste a menos que a baseline (**227**); `validate:core`, `validate:ui` e `validate:integration` verdes, com o gate autenticado (`rehearse:goal033-authenticated-ui`) em **60** testes ou mais. Provado por execução.
10. `PUBLIC_API_V1.md`, `apps/frontend/AGENTS.md:191`, D-075 em `PROPOSED`, FINAL_AUDIT §36, CURRENT_STATE e VALIDATION_GATE escritos por acréscimo e com as contagens da execução. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:** que a conexão real com o WhatsApp funciona num aparelho, o que exige número e Evolution reais; que o texto e o layout da Home e da tela de WhatsApp batem com o protótipo aprovado, que é conferência humana.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Leitura de status pelo vínculo e pela credencial aberta, log em `settled`, número em dígitos no BFF (§1, §2), com os testes `goal059-` do BFF e o vermelho na baseline |
| WU-02 | STANDARD | WU-01 | Conferência prévia e remoção compensatória em `ensureInstance` (§3), com o teste da órfã |
| WU-03 | STANDARD | — | Banner da Home pela mesma derivação da sidebar e número formatado (§4, §5), com os testes jsdom |
| WU-04 | STANDARD | WU-01, WU-02, WU-03 | Controles negativos (§7) e documentação (§8) |
| WU-05…WU-15 | DETERMINISTIC | WU-04 | typecheck e lint de `apps/bff` e `apps/frontend`, testes dirigidos (`goal059`) nos dois, gate-tests, git-diff-check, validate-core, validate-ui, validate-integration |

A unidade `validate-integration` é a que executa os testes de integração do BFF deste Goal (`test:bff-integration`) contra banco descartável. Se ela falhar em passo sem relação com o diff, o relatório nomeia o passo e a causa, e o critério 1 continua exigindo a saída de `test:bff-integration`.
