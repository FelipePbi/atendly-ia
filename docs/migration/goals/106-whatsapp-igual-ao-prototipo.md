# Goal 106 — WhatsApp igual ao protótipo

**Status: READY.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal104 ACCEPTED](../reviews/104-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: W1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v129 (PLANNED), dividida do 104, com o quadro W1. **READY na v130**, com o mesmo ID e título.

## Baseline aceita

Baseline aceita: `b31575aec9ffb4d536b8a2c6b4b015ce13eeebf4`

Goal anterior: 104 — IA, Conversas e Conta iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal104 já integrado em `main` (origem `6b7add573ec77654f850acac80821a9ed7152989`). **Duas rodadas**, com 4 e 0 blockers, todos de documento. **D-117** aceita. A virada de status do documento do Goal104 entrou no próprio commit de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **Configurações › WhatsApp, com o número conectado, igual ao quadro W1 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768), sem regressão no painel de conexão que o onboarding usa.

**Por que agora.** IA, Conversas e Conta fecharam no 104. Na ordem da v129, o próximo trecho de Configurações é o WhatsApp. A IA1 já aponta "Quem ela nunca responde" para `/configuracoes/whatsapp`, e hoje essa tela não tem onde marcar contato ignorado. O 105 (Importação) e o 102 (Avenly) vêm depois.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Mais-WhatsApp-Importacao-Conta.dc.html`, rótulo "Configurações · WhatsApp", e os equivalentes "Configurações / Configurações · WhatsApp / Portrait|Landscape|Desktop" de `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html`), no código da baseline, em `packages/public-api-contract/src/schemas.ts`, em `apps/bff/PUBLIC_API_V1.md`, em `scripts/visual-compare.mjs`, em `apps/frontend/e2e/visual/targets.json` e no review104.

1. **O W1 é todo o estado conectado.** De cima para baixo: um bloco de identidade (avatar de 72 px com as iniciais "CR" e um selo verde de confirmação, "Camila Reis" em Literata 22 px, "+55 11 98765-4321" e a pílula verde "Conectado desde 18/09"); um cartão "IA ativa neste número", com o ponto que respira e "Teste real concluído em 18/09 · 41 horários marcados"; um grupo de três linhas com chevron: "Contatos que a IA nunca responde" ("Mãe, Dudu"), "Uso pessoal" ("Sim · conversas separadas em Comercial, Não classificadas e Pessoal") e "Trocar número" ("Clientes, agenda e conversas continuam"); o texto "Você pode continuar usando este WhatsApp normalmente. Quando você responde, a IA sai de cena naquela conversa."; e, no fim, em área de atenção, "Desconectar WhatsApp" com "Sua IA deixa de atender até conectar de novo".
2. **O app, conectado, mostra outra coisa.** `WhatsAppSettings.tsx` põe `WhatsAppConnectionPanel` dentro de `SettingsPage`. Conectado, o painel mostra o cartão `settings-status-hero` ("Conectado", "WhatsApp conectado", o texto de operação e o telefone) e o botão "Desconectar número", que abre o diálogo "Desconectar WhatsApp?". Desconectado, mostra o consentimento, a pergunta de uso pessoal e a vinculação por QR ou código.
3. **O painel é o mesmo do onboarding.** `features/onboarding/blocks/whatsapp.tsx` usa `WhatsAppConnectionPanel` com `consentPhase` em `/onboarding/whatsapp-conectar`. Os quadros 4.2 e 4.6 foram aceitos no 099. Sem `consentPhase`, o painel é o de Configurações.
4. **A conta do `visual:compare` não tem número conectado.** A nota do W1 em `targets.json` diz "Compare a estrutura". `scripts/visual-compare.mjs` só reescreve a origem dos pedidos ao BFF (`context.route("**/api/bff/**")`) e não tem como dar uma resposta fixa. Sem isso, a captura do W1 mostra o consentimento e o QR, e nada do quadro.
5. **O contrato.** `whatsappConnectionSchema` traz `phoneNumber`, `status` e `connectedAt`, lidos por `GET /v1/whatsapp` (`BffWhatsAppService`). Não traz o nome nem a foto do perfil do WhatsApp. O vault (`03-UX-UI/04-Especificacao-das-Telas.md`, "WhatsApp") pede nome e foto "quando disponíveis". O bloco de identidade do M1 (`HubIdentity`, `SettingsHub.tsx`) já usa o nome do negócio lido (`settings.business.name`) e as iniciais dele.
6. **"Uso pessoal" não tem leitura.** `PUBLIC_API_V1.md`: a resposta à pergunta sobre uso pessoal "fica só na tela e nenhuma rota a recebe".
7. **Contatos ignorados.** Não há leitura da lista nem da contagem de contatos ignorados. Marcar existe: `PUT /v1/conversations/:id/ignore` e `PUT /v1/conversations/ignored-contacts`, os dois usados por `IgnoredContactsStepBody`, a etapa opcional do onboarding em `features/onboarding/blocks/whatsapp.tsx`.
8. **Trocar número.** O vault decide (pergunta 762 de `04-Referencia/99-Perguntas-e-Respostas.md`): "Desconectar atual e iniciar novo fluxo". `01-Regras/05-WhatsApp.md`: trocar o número não apaga clientes, agenda nem conversas. O app já desconecta por `DELETE /v1/whatsapp` (`whatsapp.disconnect()`), e depois o painel volta ao fluxo de conexão.
9. **O estado da IA.** O cartão do IA1 decide "IA ativa" por `settings.ai.enabled` (`AiSettings.tsx`), recebido de `ProductSettingsScreen`. Hoje `ProductSettingsScreen` passa a `WhatsAppSettings` só `onStatusChange`.
10. **Gate.** `/configuracoes/whatsapp` está em `AUTHENTICATED_ROUTES` com o `contentMarker` "WhatsApp". A conta do gate não tem número conectado, então o gate mede o painel desconectado, que este Goal não muda.

## Escolhas de desenho desta passada

**(a) O `visual:compare` ganha respostas fixas de `GET`, por alvo.** Sem elas o W1 não é comparável (evidência 4). É mudança no instrumento de medida dentro do Goal medido, e por isso tem estes limites:
- Um alvo de `targets.json` pode declarar `responses`: uma lista de `{ "method": "GET", "path": "/v1/…", "json": … }`. Só `GET`. O `path` é o caminho do BFF, comparado por igualdade, sem query. Outro método, caminho fora de `/v1/` ou campo desconhecido recusa o arquivo com erro claro.
- A validação e a escolha da resposta moram numa função pura nova, `scripts/lib/visual-responses.mjs`, com teste em `scripts/tests/` (entra no `test:gate`).
- Em `captureApp`, a resposta fixa é servida com `route.fulfill` só para o alvo que a declara, só para o pedido `GET` com aquele caminho exato. Todo o resto passa pela reescrita de origem de hoje.
- Só o W1 declara `responses`: `GET /v1/whatsapp` com o número conectado, nos valores do quadro (telefone `5511987654321`, `status` `"CONNECTED"`, `connectedAt` `"2026-09-18T15:00:00.000Z"`, que é 18/09 ao meio-dia de Brasília). O corpo segue o formato que o BFF devolve e que `BffWhatsAppService.get` valida. Nenhum outro caminho recebe resposta fixa: `GET /v1/status` continua real.
- A nota do W1 em `targets.json` passa a dizer que o estado conectado vem de resposta fixa, e o `$comment` do arquivo descreve `responses`. Nenhuma outra entrada muda.
- Nada é gravado: a resposta fixa existe só no navegador da captura.

**(b) Configurações › WhatsApp conectado igual ao W1.** Quando o painel lê o número conectado, a tela mostra, na ordem do quadro:
- **Identidade.** Avatar com as iniciais do nome do negócio e o selo verde, o nome do negócio, o telefone formatado (`formatBrazilianPhone`, como hoje) e a pílula "Conectado desde DD/MM", com a data de `connectedAt` no fuso do negócio (`settings.business.timezone`, com `America/Sao_Paulo` na falta, como o hub). Sem `connectedAt`, a pílula diz "Conectado". Sem o nome do negócio lido, o bloco mostra só o telefone e a pílula, e o avatar mostra o ícone de conversa no lugar das iniciais. Sem `phoneNumber`, a linha do telefone não aparece. Nunca um valor inventado.
- **O cartão da IA neste número**, pela mesma leitura e a mesma regra do cartão do IA1 (`settings.ai.enabled`, D-117 (a)). Com a IA ligada: "IA ativa neste número", com o ponto que respira; a animação para com `prefers-reduced-motion`. Sem a IA ligada: "A IA não está atendendo neste número", com o ponto sem animação e o link "Ver em IA" para `/configuracoes/ia`. Com `settings.ai.enabled` `null` (leitura que falhou ou não chegou), o cartão não aparece. Sem segunda linha de teste ou de contagem (divergência 3 de D-117).
- **"Contatos que a IA nunca responde"**, sem segunda linha (evidência 7). Abre um `Dialog` `variant="sheet"` com o título da linha e o componente da etapa de contatos ignorados do onboarding. O componente é **movido** de `features/onboarding/blocks/whatsapp.tsx` para `features/whatsapp/`, com o mesmo markup, os mesmos pedidos e as mesmas mensagens, e o onboarding passa a importá-lo de lá. O W3 não é portado.
- **"Trocar número"**, com "Clientes, agenda e conversas continuam". Abre um `Dialog` de confirmação: título "Trocar número?", texto "Clientes, agenda e conversas continuam. O número atual é desconectado, e a IA para de atender até você conectar o novo.", botões "Cancelar" e "Desconectar e trocar". Confirmar chama o mesmo `whatsapp.disconnect()` de hoje, uma vez, e a tela volta ao fluxo de conexão do painel, com o consentimento de novo. Cancelar não envia nada.
- **O texto** "Você pode continuar usando este WhatsApp normalmente. Quando você responde, a IA sai de cena naquela conversa."
- **"Desconectar WhatsApp"**, em área de atenção, no fim, com "Sua IA deixa de atender até conectar de novo". Abre o diálogo de hoje ("Desconectar WhatsApp?", com o texto, os botões e o pedido de hoje). O W2 não é portado.
- **"Uso pessoal" não entra** (evidência 6).
- O botão "Desconectar número" e o cartão `settings-status-hero` não aparecem mais em Configurações com o número conectado.
- A falha de desconectar, pelos dois caminhos, mostra a mensagem de hoje ("Não foi possível desconectar o número.") em `role="alert"`, e a tela continua conectada.

**(c) O painel continua um só.** `WhatsAppConnectionPanel` ganha **um** ponto de extensão opcional para o estado conectado, sem `consentPhase` (por exemplo, uma prop `renderConnected`). Ele recebe a conexão lida, o estado de ocupado, a abertura do diálogo de desconexão de hoje e a mesma função `disconnect` que esse diálogo chama. A leitura de estado, o `onStatusChange`, a vinculação e o diálogo continuam no painel. **Sem a prop, o painel é o de hoje, em comportamento e em markup.** O onboarding não passa a prop. Desconectado, Configurações mostra o painel de hoje, sem mudança.

**(d) Composição.** `/configuracoes/whatsapp` segue D-103 como hoje: tela empurrada abaixo de 1024 px, e a lista do hub à esquerda com "WhatsApp" marcada de 1024 px em diante. `ProductSettingsScreen` passa a `WhatsAppSettings` o `settings` que já passa às outras telas. Continua **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031), em `ProductSettingsScreen`. O `h1` "WhatsApp" continua um só em cada largura, nos dois estados.

**(e) Gate autenticado sem mudança.** `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` não mudam. O gate continua com **275** testes.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O estado da casca na conta visual, que `GET /v1/status` real decide: o banner "Atendimento automático parado", o item "Notificações" da sidebar (D-093, D-101 (c)) e o estado da linha "WhatsApp" na lista do hub de 1024 px em diante.
3. O nome e as iniciais do negócio da conta visual no lugar de "Camila Reis" e "CR" (evidência 5).
4. O cartão da IA sem a IA ligada na conta visual, e sem "Teste real concluído em 18/09 · 41 horários marcados". "IA ativa neste número" fica provado em jsdom.
5. "Contatos que a IA nunca responde" sem "Mãe, Dudu" (evidência 7).
6. A linha "Uso pessoal" ausente (evidência 6).

## Escopo obrigatório

### 1. W1 igual ao quadro

**Porte** o HTML/CSS do quadro. Use o elemento com `data-screen-label="Configurações · WhatsApp"` de `Mais-WhatsApp-Importacao-Conta.dc.html` (mobile) e os de `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html` ("Configurações / Configurações · WhatsApp / Portrait", "/ Landscape" e "/ Desktop"). Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença. Reaproveite as classes de linha, de grupo e de área de atenção que o 097 e o 104 criaram em `atendly-settings.css` (o hub, o AG1 e o "Excluir conta" do C1), quando o quadro tiver a mesma forma.

Primeiro entregue (a). Depois repita `npm run visual:compare -- --target W1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual ao quadro W1 nos 4 devices**. Para cada device, o relatório final traz o diff do início (já com a resposta fixa, sobre o painel de hoje) e do fim, e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script fora de (a). Depois de cada `visual:compare`, confira `git status`: no 095 e no 096, o `next dev` reescreveu `apps/frontend/AGENTS.md`. Arquivo fora do escopo que mudar volta ao original antes da entrega.

### 2. O instrumento não muda o que já media, e o onboarding não regride

Rode `npm run visual:compare -- --target W1,4.2,4.6,IA1,M1,C5,H3` três vezes e cole o diff de cada device das três:
1. na baseline, antes de qualquer mudança;
2. logo depois de (a), antes de tocar o frontend: 4.2, 4.6, IA1, M1, C5 e H3 dão **os mesmos números** da execução 1, e só o W1 muda, agora com o número conectado e o painel de hoje;
3. na execução final.

Entre a 1 e a 3, 4.2 e 4.6 (o painel no onboarding) e IA1, M1, C5 e H3 não mudam. Toda piora tem causa medida.

### 3. Comportamento preservado

- Desconectado, `/configuracoes/whatsapp` é o painel de hoje: consentimento, pergunta de uso pessoal, QR, código, expiração e reconexão, com os mesmos pedidos.
- `/onboarding/whatsapp-conectar` e a etapa de contatos ignorados do onboarding funcionam como hoje, com o mesmo markup e os mesmos pedidos.
- Desconectar pede confirmação e usa o mesmo `DELETE /v1/whatsapp`. Depois de desconectar, `onStatusChange(false)` é chamado como hoje.
- Marcar contato ignorado, por conversa ou por telefone, usa os mesmos pedidos e mostra as mesmas mensagens.
- IA1, o hub, Conversas, Conta, Negócio, Agenda e a Importação não mudam.

### 4. Provas novas

`apps/frontend/tests/goal106-whatsapp.test.tsx`, no padrão de `goal104-ia-conversas-e-conta.test.tsx`:

1. **W1 conectado.** A identidade de (b): iniciais e nome do negócio, telefone formatado, "Conectado desde 18/09" vindo de `connectedAt` (e "Conectado" sem ele), e o bloco sem nome e sem iniciais quando `settings.business` falta. O cartão da IA com "IA ativa neste número" quando `settings.ai.enabled` é `true`, "A IA não está atendendo neste número" com o link para `/configuracoes/ia` quando é `false`, e nenhum cartão quando é `null`. As linhas "Contatos que a IA nunca responde" e "Trocar número", o texto de uso normal e "Desconectar WhatsApp". Não há "Uso pessoal", "Desconectar número" nem o `h2` "WhatsApp conectado".
2. **Ações.** "Desconectar WhatsApp" abre o diálogo de hoje; "Manter conectado" não envia nada; confirmar chama `whatsapp.disconnect` **uma** vez, e a tela mostra o consentimento. "Trocar número" abre a confirmação de (b); "Cancelar" não envia nada; confirmar chama `whatsapp.disconnect` **uma** vez, e a tela mostra o consentimento. A falha de desconectar mostra a mensagem de hoje e mantém a tela conectada.
3. **Contatos ignorados.** A linha abre a folha com o componente movido. Marcar por telefone chama `conversations.ignoreByPhone` **uma** vez, com o número digitado; marcar uma conversa chama `conversations.setIgnored` **uma** vez. Fechar a folha volta à tela.
4. **Onboarding intacto.** Em `/onboarding/whatsapp-conectar` com o número conectado, o painel mostra o que mostra hoje (sem a identidade do W1). A etapa de contatos ignorados mostra o componente movido, com os mesmos pedidos.
5. **Casca.** Uma chamada de `useShellConfig` por árvore renderizada em `/configuracoes/whatsapp`, conectado e desconectado, nas duas faixas. De 1024 px em diante, a lista do hub tem "WhatsApp" marcada.

E `scripts/tests/visual-responses.test.mjs`, para (a): `responses` aceita `GET` com caminho em `/v1/`; recusa outro método, caminho fora de `/v1/` e campo desconhecido; o alvo sem `responses` não recebe resposta fixa; a resposta só vale para o caminho exato.

As provas 1 a 3 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. As provas 4 e 5 guardam comportamento e podem passar na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa de texto, rótulo ou estrutura que o quadro troca em Configurações com o número conectado, como "Desconectar número" e o cartão "WhatsApp conectado". Prováveis afetados: `goal071-whatsapp-connection-panel`, `goal059-whatsapp-status-view`, `goal024-settings-shell-invariant`, `goal018-a11y` e `goal019-a11y`. Teste do onboarding não muda, salvo o caminho de import do componente movido. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. `WhatsAppSettings` deixa de passar o ponto de extensão (volta o cartão de hoje): a prova 1 reprova.
2. A pílula usa `updatedAt` no lugar de `connectedAt`: a prova 1 reprova.
3. O cartão da IA mostra "IA ativa neste número" com `settings.ai.enabled` `false`: a prova 1 reprova.
4. "Trocar número" desconecta sem abrir a confirmação: a prova 2 reprova.
5. O onboarding passa o ponto de extensão ao painel: a prova 4 reprova.
6. `WhatsAppSettings` chama `useShellConfig`: a prova 5 reprova.
7. `visual-responses.mjs` aceita `POST`: `scripts/tests/visual-responses.test.mjs` reprova.

## Pontos de implementação

- `apps/frontend/src/features/settings/`: `WhatsAppSettings.tsx`, `ProductSettingsScreen.tsx` (só passar `settings` a `WhatsAppSettings`), e um componente novo para o estado conectado, na mesma pasta.
- `apps/frontend/src/features/whatsapp/`: `WhatsAppConnectionPanel.tsx` (só o ponto de extensão de (c)) e o arquivo novo do componente de contatos ignorados, movido.
- `apps/frontend/src/features/onboarding/blocks/whatsapp.tsx`: só tirar o componente movido e importá-lo do lugar novo.
- `apps/frontend/src/shared/styles/atendly-settings.css`. `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `scripts/visual-compare.mjs` (só servir `responses` em `captureApp`), o novo `scripts/lib/visual-responses.mjs` e o novo `scripts/tests/visual-responses.test.mjs`.
- `apps/frontend/e2e/visual/targets.json`: só o `$comment` e a entrada do W1.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- W2 e W3 como quadros. O diálogo de desconexão e a folha de contatos ignorados ficam com a forma de hoje.
- O painel desconectado, o consentimento e a vinculação, em Configurações e no onboarding.
- I1, I2 e 2.I1 (105). O 102.
- A IA1: a linha "Quem ela nunca responde" continua indo para `/configuracoes/whatsapp`.
- A casca e o hub: `AppShell.tsx`, `navigation.ts`, `PushedBar.tsx`, `ListDetail.tsx`, `useWideLayout.ts`, `ShellConfig.tsx` e `SettingsHub.tsx`.
- `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts`, o resto de `e2e/`, `scripts/lib/visual-seed.mjs` e qualquer outro arquivo de `scripts/` fora do §"Pontos de implementação".
- Qualquer mudança em contrato, BFF, Scheduling, IA, `tools/ia-loop/`, `docs/design-reference/` e vault.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-118** em `PROPOSED`, no formato de D-117. Ela diz (a) a (e), com o motivo de cada um, e as divergências declaradas. (a) diz por que o instrumento mudou dentro do Goal medido e os limites que o seguram. Ela não reescreve D-117, D-116 nem D-103. A linha "Quem ela nunca responde" do IA1 não muda, então D-117 não ganha nota. O "Revisar se" cobre: o contrato ganhar o nome ou a foto do perfil, a resposta de uso pessoal ou a leitura de contatos ignorados (a identidade, a linha "Uso pessoal" e a segunda linha voltam); o W2 ou o W3 serem portados; e outro alvo passar a usar `responses`.
- [CURRENT_STATE](../CURRENT_STATE.md) registra o W1 conectado, o painel com o ponto de extensão, o componente de contatos ignorados movido, as respostas fixas do `visual:compare` e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra as três execuções de `visual:compare` do §2, o teste novo do `test:gate` e as contagens dos gates.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md) só se uma linha vigente de Configurações ficar falsa.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar a execução 1 do §2.
2. Entregar (a) com o teste de `scripts/tests/`. Rodar a execução 2 do §2 e conferir que só o W1 mudou.
3. Implementar (b) a (d), iterando com `npm run visual:compare -- --target W1`.
4. Rodar o vermelho da baseline das provas novas.
5. Fazer a última edição de código.
6. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e a execução 3 do §2.
7. Rodar os sete controles do §6.
8. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Contraste intermitente em `onboarding-demonstracao-da-ia`.** No 103, uma execução de `validate:integration` falhou por contraste nessa tela, e as duas seguintes passaram sem retentativa. Os reviews 095 a 104 não registram recorrência. Se acontecer de novo, rode `validate:integration` outra vez na mesma árvore e registre as duas execuções. Não mude `e2e/` por causa disso.

**Retentativas e recurso do host.** Nos Goals 092, 100, 093 e 101, o `validate:ui` com a configuração padrão teve retentativas em rotas públicas (`Target crashed`), e com `CI=1` a mesma árvore deu 0. No 101, `validate:core` sem variável falhou por memória e passou com `VITEST_MAX_WORKERS=2`. Se acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração. `e2e/` não muda, salvo o que (a) autoriza em `e2e/visual/targets.json`.

**Controles do §6 e números depois da última edição.** No 095, no 096 e no 097, rodadas caíram porque os controles ou o vermelho da baseline tinham rodado antes de uma edição posterior, e os documentos ficaram com os números antigos. Qualquer edição de código ou de teste depois dos controles obriga a rodá-los de novo, a rodar de novo o vermelho da baseline das provas tocadas e a atualizar os números e os hashes citados.

**Blockers de documento, item por item.** No 097 e no 104, blockers de documento chegaram truncados ao Developer. Ao receber blockers, trate cada item separado. Se um item chegar cortado, leia o review inteiro em `docs/migration/reviews/106-review.md` antes de corrigir. Antes de devolver, confira cada item contra o texto dos três documentos (DECISIONS, CURRENT_STATE e VALIDATION_GATE). Afirmação sobre gate que rodou ou não rodou é conferida contra os registros da execução, não contra a memória da rodada.

No relatório, para cada device, descreva o que se vê em `side-by-side.png` do W1, e diga se 4.2 e 4.6 ficaram iguais à execução 1; a porcentagem sozinha não basta. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target W1` e abriu os quatro `side-by-side.png`. `/configuracoes/whatsapp` com o número conectado está **igual ao quadro W1 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas.
2. O painel no onboarding e o resto da área logada não quebraram: 4.2, 4.6, IA1, M1, C5 e H3 das execuções 1, 2 e 3 do §2, com os números da 2 iguais aos da 1 e o que mudou na 3 descrito. Toda piora tem causa medida.
3. `scripts/visual-compare.mjs` difere da baseline só pelo serviço de `responses` em `captureApp`. `targets.json` difere só no `$comment` e na entrada do W1. Só o W1 declara `responses`, e só para `GET /v1/whatsapp`.
4. As provas 1 a 3 passam e reprovaram na baseline, salvo asserção declarada. As provas 4 e 5 passam. `scripts/tests/visual-responses.test.mjs` passa. Os sete controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
5. O comportamento do §3 continua. Nenhuma linha mostra estado que o app não leu. Sem a prop de (c), o painel é o de hoje.
6. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem **275** testes, com **0** retentativas. `validate:ui` passa nas cinco larguras. Retentativa é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
7. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline; o `test:gate` tem os **233** da baseline mais os do teste novo. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
8. `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` não mudam.
9. D-118 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
10. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada, sem resto de controle negativo, sem `apps/frontend/AGENTS.md` alterado e sem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o W1 com um número conectado de verdade (a captura usa resposta fixa de `GET /v1/whatsapp`, e a casca continua lendo o estado real); o cartão "IA ativa neste número", que a conta visual não tem e fica provado só em jsdom; o estado conectado medido pelo gate renderizado, que só vê a conta do gate, desconectada; e que trocar de número preserve clientes, agenda e conversas, que é regra do BFF e não muda aqui.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e execução 1 do §2; `responses` no `visual:compare` (a), com `scripts/lib/visual-responses.mjs`, o teste em `scripts/tests/` e a entrada do W1; execução 2 do §2 |
| WU-02 | STANDARD | WU-01 | Componente de contatos ignorados movido para `features/whatsapp/`; ponto de extensão do painel (c); W1 conectado em Configurações (b), com as duas confirmações e a folha; composição (d) |
| WU-03 | STANDARD | WU-02 | Provas 1 a 5 com o vermelho da baseline; asserções do §5 |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal106-whatsapp` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | Execução 3 do §2, controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
