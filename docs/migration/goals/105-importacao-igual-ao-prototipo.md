# Goal 105 — Importação igual ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal106 ACCEPTED](../reviews/106-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: I1, I2, 2.I1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v128 (PLANNED), dividida do 097, com os quadros I1, I2 e 2.I1. **READY na v131**, com o mesmo ID e título.

## Baseline aceita

Baseline aceita: `c13469f3c68e1eee8ef002e9d78ca6f53b30c0d1`

Goal anterior: 106 — WhatsApp igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal106 já integrado em `main` (origem `4e9d8b42f24ba21b9e1ed5c4789f0c05b12d3185`). **Três rodadas**, com 5, 6 e 0 blockers. **D-118** aceita. A virada de status do documento do Goal106 entrou no próprio commit de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **Configurações › Importação igual aos quadros I1 (importação concluída) e I2 (importação não feita), e a origem da importação igual ao quadro 2.I1, nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768), sem mudar o que a importação faz.

**Por que agora.** Com o 106, o hub e todas as linhas de Configurações seguem o protótipo, menos a Importação. O 106 deixou pronta a capacidade de que o I1 precisa: respostas fixas de `GET` por alvo no `visual:compare` (D-118 (a)). O 102 (Avenly) vem depois, de propósito no fim da fila.

## O que a evidência desta passada mostra

Conferido no protótipo (`Mais-WhatsApp-Importacao-Conta.dc.html`, rótulos "Configurações · Importação" e "Importação · não realizada"; os equivalentes "Configurações / … / Portrait|Landscape|Desktop" de `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html`; `Onboarding-2-Importacao.dc.html`, rótulo "Origem da importação", e os equivalentes "Onboarding / Origem da importação / …" de `Onboarding-2-Importacao-Tablet.dc.html` e `-Desktop.dc.html`), no código da baseline, em `packages/public-api-contract/src/schemas.ts`, em `scripts/lib/visual-seed.mjs`, em `apps/frontend/e2e/routes.ts`, em `apps/frontend/e2e/visual/targets.json`, em D-084 e D-118 e no review106.

1. **O I2 é a entrada da importação para quem não importou.** De cima para baixo: a mesma ilustração "Minha Agenda → uma vez → Avenly" da etapa 2.2 do onboarding; "Você ainda não importou do Minha Agenda"; "Traga serviços, clientes, horários e agendamentos de uma vez. Leva alguns minutos e acontece uma única vez — depois, a Avenly é sua agenda oficial."; o botão "Importar do Minha Agenda"; e a nota "Já tem clientes ou serviços aqui? Avisamos se algo coincidir antes de importar.". A nota do quadro diz que o botão abre o fluxo do arquivo Onboarding 2, que começa no 2.I1.
2. **O 2.I1 é a origem, antes das credenciais.** Eyebrow "Sua agenda", título "De onde vamos trazer seus dados?", um único cartão de origem ("MA", "Minha Agenda", "Serviços, clientes, horários e agendamentos"), "Por enquanto, a importação está disponível para o Minha Agenda.", o bloco "Isto é uma migração, não uma conexão" com três itens numerados ("Seus dados são copiados **uma única vez**.", "O Minha Agenda não fica conectado. Alterações feitas lá depois não chegam aqui.", "A Avenly passa a ser sua agenda oficial.") e "Continuar". A nota do quadro: "A explicação da migração vem antes das credenciais, como pede a regra."
3. **O I1 é o histórico, só leitura.** Um bloco verde com o ícone de confirmação, "Importação concluída" e "Minha Agenda · 18 de setembro de 2026, 10:42"; um grupo com uma linha por categoria, o número em Literata 22 px alinhado à direita (12 serviços, 386 clientes, 42 agendamentos futuros, 1.400 atendimentos anteriores) e "horários de atendimento" com o ícone de confirmação no lugar do número; um bloco âmbar "3 registros com pendência", com uma linha por registro e o estado atual de cada um ("Corrigido em Serviços", "Corrigir", "Nomear"); e o texto "A importação do Minha Agenda é feita uma única vez. Alterações feitas lá depois de 18/09 não chegam à Avenly — sua agenda oficial é esta.". Não há "Importar novamente".
4. **A composição é a de Configurações (D-103).** Nos quadros de tablet em paisagem e desktop, I1 e I2 aparecem à direita da lista do hub, com a linha "Importação" marcada. No mobile e no tablet em retrato, são tela empurrada com a barra "Importação" e o voltar.
5. **O app hoje.** `/importacao` monta `ImportsScreen` (`features/imports/`), com `useShellConfig({ active: "importacao", module: "migration", title: "Importação" })`, sem `pushed` e sem a lista do hub em nenhuma largura. `ImportsPage` mostra o link "Configurações", o eyebrow "Importação", o `h1` e uma descrição. Sem importação, `ImportsFlow` mostra `ConnectSourceScreen`: o painel "Isto é uma migração, não uma conexão" e o formulário "Entre no Minha Agenda" na mesma tela (2.I1 e 2.I2 juntos), com o `h1` "Importar do Minha Agenda". Com a importação concluída, mostra `ImportHistoryCard`: "Importação concluída", "Minha Agenda · <conta> · <data>", uma lista por categoria com `imported`, as segundas linhas de categoria sem suporte e de `failed`, o texto final e a frase do aceite de pendentes.
6. **O onboarding usa as mesmas telas.** `OnboardingImportStep` monta `ImportsFlow` dentro de `OnboardingFrame`, com `ImportsFrameProvider frame="onboarding"` (D-084 item 5). O gate mede `/onboarding/importacao` em `ONBOARDING_ROUTES` com o `contentMarker` "Importar do Minha Agenda", o `h1` de hoje. As duas contas que medem o onboarding (a do gate, semeada por `scripts/goal033-authenticated-ui-rehearsal.mjs`, e a do `visual:compare`, em `seedOnboardingAccount` de `scripts/lib/visual-seed.mjs`) gravam `calendar.source` e não têm sessão de importação. Por isso a etapa abre no estado de conectar, e a nota do 2.I1 em `targets.json` ("se a captura mostrar outra etapa, o estado da conta de onboarding não alcança este quadro") deve estar desatualizada. A execução 1 do §2 confirma.
7. **O contrato.** `GET /v1/calendar/imports` devolve `{ right, session, history }` (`importStateSchema`). `history` traz `completedAt`, `sourceAccountLabel`, `counts`, `categories` (por categoria: `imported`, `failed`, `sourceSupported` e os demais contadores) e `pendingAcceptance` (`pendingCount` e `acceptedAt`, ou `null`). **Não traz a lista dos registros pendentes nem o estado atual de cada um.** As linhas "Escova", "Design de sobrancelha" e "+55 11 97654-3210", com "Corrigido em Serviços", "Corrigir" e "Nomear", não têm leitura.
8. **A data.** `formatImportDateTime` (`labels.ts`) usa `dateStyle: "long"` e `timeStyle: "short"` sem fuso, ou seja, o fuso do navegador. A linha "Importação" do hub (`importDetail` em `settings/shared/labels`) já usa o fuso do negócio.
9. **O `visual:compare`.** I1 e I2 apontam para `/importacao`. A conta visual não importou, então o I2 é alcançado com o estado real. O I1 só é alcançado com uma resposta fixa de `GET /v1/calendar/imports`. Esse é o item 3 do "Revisar se" de D-118: outro alvo passa a usar `responses`, os limites são revistos para ele e a execução 2 do §2 é repetida. `scripts/tests/visual-responses.test.mjs` tem o teste "targets.json: só o W1 declara responses, e só GET /v1/whatsapp conectado", que fica falso.
10. **A ilustração.** A etapa 2.2 (`quando-importar`) desenha a ilustração inline em `scheduleStepBody` (`features/onboarding/blocks/schedule.tsx`, classe `import-illustration`), aceita no 090.

## Escolhas de desenho desta passada

**(a) O I1 declara uma resposta fixa, nos limites de D-118 (a).** A entrada do I1 em `targets.json` ganha `responses` com um só item: `GET /v1/calendar/imports`, com o envelope `{ data, requestId }` e um corpo que `importStateSchema` aceita: `session` `null`; `right` coerente com a importação concluída; `history` com os valores do quadro: `completedAt` `"2026-09-18T13:42:00.000Z"` (10:42 em Brasília); as categorias `SERVICE` 12, `CUSTOMER` 386, `FUTURE_APPOINTMENT` 42, `PAST_APPOINTMENT` 1400 e `AVAILABILITY` com `imported` maior que zero; `pendingAcceptance` com `pendingCount` 3. A nota do I1 passa a dizer que o estado concluído vem da resposta fixa. A nota do 2.I1 é corrigida conforme a execução 1. **`scripts/visual-compare.mjs` e `scripts/lib/visual-responses.mjs` não mudam.** Em `scripts/tests/visual-responses.test.mjs` muda só o teste de `targets.json`, que passa a exigir exatamente W1 e I1, cada um só com o seu caminho. Nenhum outro alvo declara `responses`; I2 e 2.I1 usam o estado real. A lista do hub, de 1024 px em diante, lê o mesmo `GET /v1/calendar/imports` e recebe a mesma resposta, coerente com o quadro ("Concluída em 18/09 · Minha Agenda").

**(b) `/importacao` segue a composição de Configurações (D-103).** A rota continua `/importacao`: o hub, a navegação e as notificações já apontam para ela.
- Abaixo de 1024 px: tela empurrada, com a barra "Importação" e o voltar para `/configuracoes`, sem barra de abas, como as outras telas empurradas de Configurações.
- De 1024 px em diante: `SettingsHubPanel` à esquerda, com `openHref="/importacao"` (a linha "Importação" marcada, com `aria-current`), e a tela da importação à direita, pelo mesmo `ListDetailLayout` de `ProductSettingsScreen`.
- `ImportsScreen` lê `settings` com a mesma chamada de `ProductSettingsScreen` (`settings.get`) para montar a lista. Enquanto essa leitura não chega, ou se ela falhar, a tela da importação aparece sozinha, sem lista e sem estado inventado.
- Continua **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031), em `ImportsScreen`. As telas filhas e a lista não chamam o hook. A casca marca Configurações, como nas outras telas de Configurações. Se `active: "importacao"` já faz isso, o valor não muda.
- Em cada largura há um só `h1`. De 1024 px em diante, o título da lista é `h2`, como em D-103.
- Na moldura `platform`, `ImportsPage` deixa de mostrar o link "Configurações": a barra empurrada e a lista fazem esse papel. Na moldura `onboarding`, nada muda.
- As telas de análise, revisão, conflitos e execução mudam só de moldura. O conteúdo e o comportamento delas não mudam.

**(c) I2: a entrada de quem não importou, só em Configurações.** Na moldura `platform`, sem `history` e sem `session`, a tela segue o I2, na ordem do quadro (evidência 1). A ilustração é **a mesma** da 2.2: o markup sai de `scheduleStepBody` para um componente de `features/imports/`, usado pelas duas telas. A 2.2 continua com o mesmo markup e as mesmas classes. "Importar do Minha Agenda" leva à origem (d) na mesma rota, sem pedido nenhum. Na moldura `onboarding` o I2 não aparece: a pessoa já escolheu "Importar agora" na 2.2.

**(d) 2.I1: a origem vem antes das credenciais, em toda entrada.** `ConnectSourceScreen` passa a ter duas fases:
- **Origem**, portada do 2.I1 (evidência 2). O cartão "Minha Agenda" é a única opção e já vem escolhido. Não há promessa de outra origem.
- **Credenciais**, depois de "Continuar": o formulário "Entre no Minha Agenda" de hoje, com os mesmos campos, a mesma validação, os mesmos pedidos (`calendar.connectIntegration`, depois `migration.startImport`, depois `migration.getImportState`) e as mesmas mensagens de erro. O painel "Isto é uma migração, não uma conexão" sai desta fase, porque está na origem.

Toda entrada começa na origem: o botão do I2, a etapa `importacao` do onboarding e "Conectar outra conta" (`replace`), que mantém o "Cancelar" de hoje. O motivo é a regra que o quadro cita: a explicação vem antes das credenciais. No onboarding, o `h1` da etapa passa a ser "De onde vamos trazer seus dados?".

**(e) I1: o histórico igual ao quadro.** `ImportHistoryCard` segue o I1:
- **O bloco verde.** "Importação concluída" e "Minha Agenda · <data>", no formato "18 de setembro de 2026, 10:42", com `completedAt` no fuso do negócio. Em Configurações, o fuso vem de `settings.business.timezone`. No onboarding, vem do fuso que o rascunho já tem, sem leitura nova. Na falta, `America/Sao_Paulo`, como o hub. `sourceAccountLabel` sai da linha, como no quadro.
- **O grupo de categorias.** Uma linha por categoria que `history.categories` traz, nesta ordem: `SERVICE`, `CUSTOMER`, `FUTURE_APPOINTMENT`, `PAST_APPOINTMENT` e `AVAILABILITY`, depois as demais na ordem do contrato. O número é `imported`, com separador de milhar pt-BR ("1.400"). `AVAILABILITY` com `imported` maior que zero mostra o ícone de confirmação no lugar do número. As segundas linhas de hoje continuam: "Minha Agenda não oferece esta categoria" e "N não importados".
- **O bloco âmbar**, só com `pendingAcceptance` e `pendingCount` maior que zero. O título é "N registros com pendência" ("1 registro com pendência" no singular). Uma linha diz a informação de hoje: "Ficaram pendentes e foram aceitos por decisão explícita em <data>.". Sem `pendingAcceptance`, ou com zero, o bloco não aparece. A lista por registro não é portada (evidência 7).
- **O texto final.** "A importação do Minha Agenda é feita uma única vez. Alterações feitas lá depois de DD/MM não chegam à Avenly — sua agenda oficial é esta.", com a data no mesmo fuso.
- Sem "Importar novamente". A descrição "Sua única importação do Minha Agenda. Não é possível importar novamente." sai da tela, como no quadro.

No onboarding, a tela do resultado usa o mesmo cartão, com as ações de hoje (`ImportDoneActions`). O 2.I10 não é portado.

**(f) Gate autenticado: só o marcador da etapa do onboarding.** Em `e2e/routes.ts`, o `contentMarker` de `onboarding-importacao` passa de "Importar do Minha Agenda" para "De onde vamos trazer seus dados?", e o comentário do Goal066 sobre essa rota passa a dizer "na origem". A linha correspondente de `apps/frontend/AGENTS.md` muda do mesmo jeito. Nada mais em `e2e/` muda: `e2e/authenticated-matrix.spec.ts` fica igual, e o gate continua com **275** testes. `/importacao` continua fora de `AUTHENTICATED_ROUTES`, pelo motivo já escrito em `routes.ts`. **Antes de mudar o marcador**, confira na recontagem (WU-01) que a conta de onboarding do gate abre a etapa sem sessão de importação. No 106, a evidência 10 do Goal estava errada sobre o estado da conta do gate. Se a conta estiver em outro estado, pare e reporte antes de mexer em `e2e/`.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O estado da casca na conta visual, decidido pelo `GET /v1/status` real: o banner "Atendimento automático parado", o item "Notificações" da sidebar (D-093, D-101 (c)) e a pílula de estado do bloco de identidade do hub.
3. Na lista do hub, de 1024 px em diante, o nome e as iniciais do negócio da conta visual e as segundas linhas lidas da conta real (Serviços, IA, WhatsApp, Negócio, Agenda, Conversas e Conta). No I1, a linha "Importação" vem da resposta fixa.
4. No I1, o bloco âmbar sem a lista por registro e sem "Corrigido em Serviços", "Corrigir" e "Nomear" (evidência 7). No lugar, a linha do aceite de (e).
5. No 2.I1, o progresso e o stepper do onboarding derivados do fluxo da conta de onboarding (D-104), se diferirem do quadro.

## Escopo obrigatório

### 1. I1, I2 e 2.I1 iguais aos quadros

**Porte** o HTML/CSS dos quadros. Use os elementos com `data-screen-label="Configurações · Importação"` e `"Importação · não realizada"` de `Mais-WhatsApp-Importacao-Conta.dc.html` (mobile) e os de `Configuracoes-Tablet.dc.html` e `Configuracoes-Desktop.dc.html` ("Configurações / Configurações · Importação / Portrait", "/ Landscape" e "/ Desktop"; o mesmo para "Importação · não realizada"). Para a origem, use `data-screen-label="Origem da importação"` de `Onboarding-2-Importacao.dc.html` e "Onboarding / Origem da importação / Portrait|Landscape|Desktop" de `Onboarding-2-Importacao-Tablet.dc.html` e `-Desktop.dc.html`. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença. Reaproveite as classes de grupo e de linha que o 097, o 104 e o 106 criaram em `avenly-settings.css` quando o quadro tiver a mesma forma, e a moldura do onboarding do 089 para o 2.I1.

Primeiro entregue (a). Depois repita `npm run visual:compare -- --target I1,I2,2.I1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros I1, I2 e 2.I1 nos 4 devices**. Para cada quadro e device, o relatório final traz o diff do início e do fim, e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script. Depois de cada `visual:compare`, confira `git status`: no 095 e no 096, o `next dev` reescreveu `apps/frontend/AGENTS.md`. Arquivo fora do escopo que mudar volta ao original antes da entrega.

### 2. O instrumento não muda o que já media, e o resto não regride

Rode `npm run visual:compare -- --target I1,I2,2.I1,2.2,M1,W1,H3` três vezes e cole o diff de cada device das três:
1. na baseline, antes de qualquer mudança;
2. logo depois de (a), antes de tocar o frontend: I2, 2.I1, 2.2, M1, W1 e H3 dão **os mesmos números** da execução 1, e só o I1 muda, agora com o histórico de hoje;
3. na execução final.

Entre a 1 e a 3, 2.2 (a ilustração movida), M1, W1 e H3 não mudam. Toda piora tem causa medida.

### 3. Comportamento preservado

- Conectar, analisar, revisar, resolver conflitos, executar, concluir e descartar para conectar outra conta usam os mesmos pedidos, na mesma ordem, com as mesmas mensagens.
- O formulário de credenciais tem os mesmos campos, a mesma validação e as mesmas mensagens de erro, inclusive as de `MINHA_AGENDA_*` (Goal060, Goal082).
- Montar `/importacao` ou a etapa `importacao` só lê o estado (`getImportState`). Nenhuma sessão é aberta sem a pessoa enviar as credenciais.
- No onboarding, a etapa `importacao` continua só para quem gravou `calendar.source`, e a saída depois da importação (`ImportDoneActions`, `stepAfterImport`) não muda.
- A 2.2, o hub (`SettingsHub.tsx`), Configurações › WhatsApp, IA, Conversas, Conta, Negócio e Agenda não mudam.

### 4. Provas novas

`apps/frontend/tests/goal105-importacao.test.tsx`, no padrão de `goal106-whatsapp.test.tsx`:

1. **I2 e entrada.** Em `/importacao`, sem `history` e sem `session`: os textos do I2, a ilustração e "Importar do Minha Agenda"; nenhum campo de credencial. O botão mostra a origem sem pedido novo. "Continuar" mostra o formulário. Enviar chama `calendar.connectIntegration` e `migration.startImport` **uma** vez cada, como hoje.
2. **Origem.** Na etapa `importacao` do onboarding, a tela abre na origem, com o `h1` "De onde vamos trazer seus dados?", sem o I2 e sem campo de credencial antes de "Continuar". "Conectar outra conta", numa sessão viva, também abre na origem, e o "Cancelar" volta à sessão sem pedido.
3. **I1.** Com `history`: o bloco verde com a data no fuso do negócio (o mesmo instante com `Pacific/Auckland` dá outro dia, e sem `settings.business` vale `America/Sao_Paulo`); sem `sourceAccountLabel`; as categorias na ordem de (e), com "1.400" e o ícone em `AVAILABILITY`; as segundas linhas de categoria sem suporte e de `failed`; o bloco âmbar com "3 registros com pendência" e "1 registro com pendência"; nenhum bloco sem `pendingAcceptance` ou com `pendingCount` 0; o texto final com DD/MM; e nenhum "Importar novamente".
4. **Composição.** Em `/importacao`, uma chamada de `useShellConfig` por árvore renderizada, com `pushed`, nas duas faixas. De 1024 px em diante, a lista do hub com "Importação" marcada; abaixo dela, sem lista. Um só `h1` por largura. Sem o link "Configurações" na moldura `platform`. Na moldura `onboarding`, sem lista do hub.
5. **Preservado.** As telas de análise, revisão e execução aparecem pelo estado, como hoje, dentro da composição. A 2.2 mostra a ilustração com o mesmo markup.

E, em `scripts/tests/visual-responses.test.mjs`, o teste de `targets.json` reescrito para W1 e I1, cada um só com o seu caminho `GET`.

As provas 1 a 4 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. A prova 5 guarda comportamento e pode passar na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só o que depende do caminho até o formulário (agora I2 e origem antes das credenciais), do texto ou da estrutura que os quadros trocam, ou do link "Configurações". Prováveis afetados: `goal020-imports-entry`, `goal020-shell-invariant`, `goal020-a11y`, `goal020-reachability`, `goal060-connect-source`, `goal061-import-async`, `goal062-import`, `goal066-onboarding-importacao`, `goal066-onboarding-sistema-atual`, `goal072-onboarding-frame`, `goal082-connect-source-client-rejected` e `goal097-configuracoes`. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado. Asserção sobre pedido, ordem de pedido ou mensagem de erro não muda.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. `ImportsFlow` mostra o formulário direto, sem o I2: a prova 1 reprova.
2. `ConnectSourceScreen` começa nas credenciais: a prova 2 reprova.
3. A data do I1 é formatada sem `timeZone`: a prova 3 reprova.
4. O bloco âmbar aparece com `pendingCount` 0: a prova 3 reprova.
5. `ImportsScreen` não monta a lista de 1024 px em diante: a prova 4 reprova.
6. `ImportHistoryCard` ou `ConnectSourceScreen` chama `useShellConfig`: a prova 4 reprova.
7. A entrada do I2 em `targets.json` declara `responses`: `scripts/tests/visual-responses.test.mjs` reprova.

## Pontos de implementação

- `apps/frontend/src/features/imports/`: `ImportsScreen.tsx` (composição de (b) e I2 de (c)), `ImportsLayout.tsx` (só a moldura e o link), `ConnectSourceScreen.tsx` (as duas fases de (d)), `ImportHistoryCard.tsx` (I1 de (e)), `labels.ts` (a data com fuso), e componentes novos na mesma pasta (a ilustração, o I2 e a origem, se separados).
- `apps/frontend/src/features/onboarding/blocks/schedule.tsx`: só trocar a ilustração inline pelo componente movido. `OnboardingImportStep.tsx`: só passar o fuso do rascunho ao cartão, se precisar.
- `apps/frontend/src/shared/styles/avenly-settings.css` e o CSS da importação que já existe. `avenly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/avenly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/visual/targets.json`: só as entradas do I1 (com `responses`) e do 2.I1 (a nota).
- `scripts/tests/visual-responses.test.mjs`: só o teste de `targets.json`.
- `apps/frontend/e2e/routes.ts` e `apps/frontend/AGENTS.md`: só o que (f) autoriza.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- 2.I2 a 2.I10 como quadros. O formulário de credenciais e as telas de análise, revisão, conflitos, execução e resultado ficam com a forma de hoje, só com a moldura nova em Configurações.
- A lista de registros pendentes com o estado atual de cada um e as ações "Corrigir" e "Nomear".
- A casca e o hub: `AppShell.tsx`, `navigation.ts`, `PushedBar.tsx`, `ListDetail.tsx`, `useWideLayout.ts`, `ShellConfig.tsx` e `SettingsHub.tsx`. Se a composição de (b) precisar mudar um deles, pare e reporte.
- A moldura do onboarding (`OnboardingShell.tsx`, `OnboardingScreen.tsx`) e as outras etapas.
- `scripts/visual-compare.mjs`, `scripts/lib/visual-responses.mjs`, `scripts/lib/visual-seed.mjs` e qualquer outro arquivo de `scripts/` fora do §"Pontos de implementação". `e2e/authenticated-matrix.spec.ts` e o resto de `e2e/`.
- Qualquer mudança em contrato, BFF, Scheduling, IA, `tools/ia-loop/`, `docs/design-reference/` e vault. O 102.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-119** em `PROPOSED`, no formato de D-118. Ela diz (a) a (f), com o motivo de cada um, e as divergências declaradas. (a) diz por que um segundo alvo passa a usar `responses` e confirma que os limites de D-118 (a) continuam os mesmos. Ao fim de D-118 entra, só por acréscimo, uma linha "**Revista em parte por D-119**" que diz o quê: o I1 também declara `responses`, só para `GET /v1/calendar/imports` (item 3 do "Revisar se"). D-084 não ganha nota: da origem em diante, as duas molduras mostram as mesmas telas, e o I2 é só a entrada de Configurações. O "Revisar se" de D-119 cobre: o contrato passar a trazer os registros pendentes e o estado de cada um (a lista do I1 volta); o 2.I2 ou as telas seguintes serem portados; e um terceiro alvo passar a usar `responses`.
- [CURRENT_STATE](../CURRENT_STATE.md) registra o I1, o I2, a origem antes das credenciais, a composição de `/importacao`, a resposta fixa do I1, o marcador do gate e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra as três execuções de `visual:compare` do §2, o teste novo e as contagens dos gates.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md) só se uma linha vigente de Importação ou de Configurações ficar falsa.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline e conferir o estado da conta de onboarding do gate (f). Rodar a execução 1 do §2.
2. Entregar (a) com o teste de `scripts/tests/`. Rodar a execução 2 do §2 e conferir que só o I1 mudou.
3. Implementar (b) a (f), iterando com `npm run visual:compare -- --target I1,I2,2.I1`.
4. Rodar o vermelho da baseline das provas novas.
5. Fazer a última edição de código.
6. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e a execução 3 do §2.
7. Rodar os sete controles do §6.
8. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Retentativas por recurso do host.** Na rodada 3 do 106, `validate:integration` teve 1 retentativa em `[mobile-390] › onboarding-agenda-atendly-pronta`, por `page.goto: net::ERR_NO_BUFFER_SPACE`, falta de buffer de socket no Windows. Nos Goals 092, 100, 093 e 101, o `validate:ui` com a configuração padrão teve retentativas por `Target crashed`, e com `CI=1` a mesma árvore deu 0. No 101, `validate:core` sem variável falhou por memória e passou com `VITEST_MAX_WORKERS=2`. Se uma dessas falhas acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore, e registre as duas com a causa tirada do log. A configuração não muda.

**Contraste intermitente em `onboarding-demonstracao-da-ia`.** No 103, uma execução de `validate:integration` falhou por contraste nessa tela, e as duas seguintes passaram sem retentativa. Os reviews 095 a 106 não registram recorrência. Se acontecer de novo, rode `validate:integration` outra vez na mesma árvore e registre as duas execuções. Não mude `e2e/` por causa disso.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração. `e2e/` não muda, salvo o que (a) e (f) autorizam.

**Controles do §6 e números depois da última edição.** No 095, no 096, no 097 e no 106, rodadas caíram porque os controles, o vermelho da baseline ou um teste tinham ficado para trás de uma edição posterior, e os documentos ficaram com os números antigos. Qualquer edição de código ou de teste depois dos controles obriga a rodá-los de novo, a rodar de novo o vermelho da baseline das provas tocadas e a atualizar os números e os hashes citados.

**Blockers de documento, item por item.** No 097 e no 104, blockers de documento chegaram truncados ao Developer. Ao receber blockers, trate cada item separado. Se um item chegar cortado, leia o review inteiro em `docs/migration/reviews/105-review.md` antes de corrigir. Antes de devolver, confira cada item contra o texto dos três documentos (DECISIONS, CURRENT_STATE e VALIDATION_GATE). Afirmação sobre gate que rodou ou não rodou é conferida contra os registros da execução, não contra a memória da rodada.

No relatório, para cada quadro e device, descreva o que se vê em `side-by-side.png` de I1, I2 e 2.I1, e diga se 2.2, M1, W1 e H3 ficaram iguais à execução 1; a porcentagem sozinha não basta. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target I1,I2,2.I1` e abriu os doze `side-by-side.png`. `/importacao` concluída está **igual ao quadro I1 nos 4 devices**; `/importacao` sem importação, **igual ao quadro I2 nos 4 devices**; e a origem em `/onboarding/importacao`, **igual ao quadro 2.I1 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas.
2. O resto não quebrou: 2.2, M1, W1 e H3 das execuções 1, 2 e 3 do §2, com os números da 2 iguais aos da 1 (salvo o I1) e o que mudou na 3 descrito. Toda piora tem causa medida.
3. `scripts/visual-compare.mjs` e `scripts/lib/visual-responses.mjs` não mudam. `targets.json` difere só nas entradas do I1 e do 2.I1. Só W1 e I1 declaram `responses`, e o I1 só para `GET /v1/calendar/imports`.
4. As provas 1 a 4 passam e reprovaram na baseline, salvo asserção declarada. A prova 5 passa. `scripts/tests/visual-responses.test.mjs` passa. Os sete controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
5. O comportamento do §3 continua. Nenhuma linha mostra estado que o app não leu. Credenciais só depois da origem, em toda entrada.
6. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem **275** testes, com **0** retentativas, ou com retentativa medida e reportada com a causa, como em "Validação e ordem". `validate:ui` passa nas cinco larguras.
7. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. O `test:gate` tem os **242** da baseline, sem teste a menos. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
8. `e2e/authenticated-matrix.spec.ts` não muda. `e2e/routes.ts` difere só no `contentMarker` de `onboarding-importacao` e no comentário dessa rota.
9. D-119 está em `PROPOSED`, com a nota "Revista em parte por D-119" ao fim de D-118 só por acréscimo. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
10. `git status --porcelain=v1 -uall` lista só os arquivos autorizados. Não há configuração de gate alterada, resto de controle negativo, `apps/frontend/AGENTS.md` alterado além da linha de (f) nem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; o I1 com uma importação concluída de verdade, porque a captura usa resposta fixa de `GET /v1/calendar/imports` e a casca continua lendo o estado real; a lista de registros pendentes com o estado de cada um, que o contrato não lê; e as telas de credenciais, análise, revisão, conflitos, execução e resultado contra os quadros 2.I2 a 2.I10.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem, conferência da conta de onboarding do gate e execução 1 do §2; `responses` do I1 e nota do 2.I1 em `targets.json`; o teste de `targets.json` em `scripts/tests/`; execução 2 do §2 |
| WU-02 | STANDARD | WU-01 | Composição de `/importacao` (b); ilustração movida e I2 (c); origem antes das credenciais (d); marcador do gate e linha do `AGENTS.md` (f) |
| WU-03 | STANDARD | WU-02 | I1 (e): bloco verde com a data no fuso do negócio, categorias, bloco âmbar e texto final |
| WU-04 | STANDARD | WU-03 | Provas 1 a 5 com o vermelho da baseline; asserções do §5 |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-04 | lint de `apps/frontend` |
| WU-07 | DETERMINISTIC | WU-04 | testes dirigidos: `goal105-importacao` |
| WU-08 | DETERMINISTIC | WU-05, WU-06, WU-07 | validate-core |
| WU-09 | DETERMINISTIC | WU-08 | gate-tests |
| WU-10 | DETERMINISTIC | WU-08 | validate-ui |
| WU-11 | DETERMINISTIC | WU-08 | validate-integration |
| WU-12 | STANDARD | WU-09, WU-10, WU-11 | Execução 3 do §2, controles negativos (§6) e documentação, depois da execução final |
| WU-13 | DETERMINISTIC | WU-12 | git-diff-check final |
