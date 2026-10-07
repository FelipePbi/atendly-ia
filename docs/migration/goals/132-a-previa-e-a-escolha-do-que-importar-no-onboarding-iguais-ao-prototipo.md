# Goal 132 — A prévia e a escolha do que importar no onboarding iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal131 ACCEPTED](../reviews/131-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.I4, 2.I5

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v156**, inserida depois do 131, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 131. Com 2.I2 e 2.I3 aceitos, `targets.json` tem 93 alvos, e 20 dos 113 quadros continuam sem alvo. Dos sete quadros que restam da importação do onboarding (2.I4 a 2.I10), este Goal leva só os dois que vêm logo depois da análise aceita (2.I3).

## Baseline aceita

Baseline aceita: `ada0875b651b9c180d31a3484e51df4df3b432af`

Goal anterior: 131 — As credenciais e a análise da importação do onboarding iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal131 já integrado em `main` (origem `f0ceb2ea4afe7aabedeb7e23530c9123cdc2dafe`). Houve **cinco rodadas**: duas barradas pelo harness, duas com blockers de código resolvidos pela FIX-001 e a última com 1 blocker só de documentação, corrigido no fechamento, só em `docs/migration/`. **D-145** foi aceita: as credenciais e a análise da importação como os quadros 2.I2 e 2.I3, nas duas molduras. A última contagem aceita:

- frontend **189** arquivos e **2509** testes, `goal131` **45** (4 arquivos);
- `visual-responses.test.mjs` **59**;
- `test:gate` **292**;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **304** `passed` e **1** `flaky` fora do Goal (a rodada 4 deu 305 sem retentativa).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o resumo do que foi encontrado fica igual ao quadro 2.I4, e a escolha do que importar fica igual ao quadro 2.I5, nos quatro devices**, salvo as divergências declaradas. As duas telas continuam em `/onboarding/importacao` e em `/importacao`, porque as duas molduras mostram as mesmas telas (D-084 item 5, D-119, D-145). Escolher uma categoria, executar a importação, a recusa de prévia obsoleta, os conflitos e a troca de conta continuam com os mesmos pedidos, a mesma regra e as mesmas mensagens. Nenhuma rota do BFF muda, e nenhum pedido novo.

**Por que agora.** A fila não tem Goal PLANNED. Dos 20 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 a v155: S1b (cor livre fora de `colorToken`); S5, S6, S8 e S9 (a composição de D-114 e a guarda de navegação); CL8 (outra tela); CL9 (carregamento, e `responses` não sabe atrasar uma resposta); H6 e NT3 (sinal de IA instável que o status não tem); N2, N3 e W3 (dado que o contrato não tem). A 4.3 continua fora (o código de vinculação só vem de `POST /v1/whatsapp/connect`). A importação do onboarding segue em fatias, na ordem do fluxo: o resumo e a escolha vêm logo depois da análise, a captura os alcança só com leitura (evidência 5), e o contrato tem tudo, salvo duas legendas que viram divergência declarada (evidência 4).

**Lições do Goal131, que valem aqui.**

1. A regressão dos alvos vizinhos foi aceita sem prova completa, por percentual, porque o `app.png` de antes não foi capturado antes das edições. Aqui, a captura de antes é feita **na baseline** `ada0875` (uma worktree descartável fora do repositório, ou a árvore antes da primeira edição) e a regressão é provada por `cmp` do `app.png`.
2. Os blockers de código das rodadas 2 e 4 foram de medida: uma margem de 6 px que o quadro não tem, um campo 2 px mais baixo (o quadro dá `height` ao content-box e soma a borda; o app usava `box-sizing: border-box`) e o `letter-spacing` da máscara. Aqui, antes de entregar, o Developer mede por pixel, em cada device, a altura de cada linha do cartão, da caixa de seleção, do primário e da ação de texto, e a posição do cartão e do rodapé, contra o quadro, e registra as medidas.
3. Um gate rodado pelo IA Loop depois do relatório é registrado com o resultado dele, com o número, nunca como "pendente", "não executado" nem remetido a `results/work_unit`.

## O que a evidência desta passada mostra

Conferido no código da baseline `ada0875` e em `docs/design-reference/claude-design/prototype/project/Onboarding-2-Importacao.dc.html` (quadros 2.I4 "Resumo do que foi encontrado" e 2.I5 "Escolher o que importar"), com `Onboarding-2-Importacao-Tablet.dc.html` (retrato e paisagem) e `Onboarding-2-Importacao-Desktop.dc.html`, que também têm os dois quadros.

1. **2.I4 no mobile.**
   - O topo: o chevron de voltar (40 px), a barra com o primeiro segmento `#0F5F63`, o segundo `#DCECEB` com 44 % preenchido e os outros dois `#E5DED4`, e o eyebrow "Sua agenda" da moldura.
   - O corpo (`padding: 10px 20px 0`, 20 px entre os blocos): só o título "Encontramos isto no Minha Agenda", em Literata 28 px 500, `line-height: 1.2`, `letter-spacing: -0.01em`. **Sem descrição.**
   - O cartão: raio 16 px, borda de 1 px `#E5DED4`, fundo `#FFFDFA`, `overflow: hidden`. Cada linha com `padding: 16px`, 14 px de espaço e divisória de 1 px `#E5DED4` a partir da segunda; o número **à esquerda**, em Literata 26 px 500, `tabular-nums`, `min-width: 72px`, alinhado à direita, e o nome à direita dele, em 15 px 600, minúsculo, alinhados pela linha de base. A ordem: 12 serviços, 386 clientes, 42 agendamentos futuros, 1.400 atendimentos anteriores (com a legenda "incluindo cancelamentos e faltas" em 13 px `#716859`) e, por último, "Horários de atendimento" (com maiúscula), sem número: no lugar dele, um selo de 26 px, redondo, `#DFEFE4`, com o visto, e a legenda "segunda a sábado".
   - O rodapé (`padding: 12px 20px 46px`, 14 px de espaço, centrado): "Importar tudo" (primário, 52 px, raio 14 px, `#0F5F63`, texto `#F7F4EF` 16 px 600) e, abaixo, "Escolher o que importar" como ação de texto (15 px 600 `#0F5F63`, `padding: 6px 0`).
   - A legenda: "Números grandes em Literata dão peso ao que será trazido. “Importar tudo” é o caminho principal; a escolha fina é um link secundário."
2. **2.I5 no mobile.**
   - O topo igual ao do 2.I4.
   - O corpo (`padding: 10px 20px 0`, 20 px entre os blocos). O cabeçalho (8 px de espaço): "O que você quer trazer?" em Literata 28 px 500 e "O que ficar de fora não poderá ser importado depois." em 15 px, `line-height: 1.45`, `#5F574E`.
   - O cartão igual ao do 2.I4. Cada linha (`align-items: center`, 14 px de espaço, `padding: 16px`): a caixa de 24 px, raio 7 px (marcada: fundo `#0F5F63` com o visto claro; desmarcada: borda de 1,5 px `#D6CEC2`, `box-sizing: border-box`), o nome com maiúscula em 15 px 600 e, à direita, a contagem em 15 px `#5F574E`, `tabular-nums`. A ordem: Serviços 12, Clientes 386, Agendamentos futuros 42, Atendimentos anteriores 1.400 (**desmarcado**: nome em `#5F574E`, a legenda "histórico de cada cliente" em 13 px `#716859` e a contagem em `#716859`) e Horários de atendimento, marcado e **sem** contagem.
   - O rodapé (`padding: 12px 20px 46px`, 10 px de espaço): "Importar 440 registros" (primário, 52 px) e, abaixo, centrada, "Sem o histórico, o resumo por IA de cada cliente começa do zero." em 12 px `#716859`.
   - A legenda: "Mesma lista, agora com caixas de seleção. O CTA mostra a contagem para a decisão ficar concreta."
3. **O app hoje.** As duas telas são as fases `summary` e `select` (`mode`) de `ImportPreviewScreen` (`features/imports/`), depois da análise.
   - O resumo: `ImportsPage` com o título "Encontramos isto no Minha Agenda" e a descrição "Isso não altera nada na Avenly. Revise antes de confirmar." (que, na moldura do onboarding, também liga o eyebrow "Importação"); um `imports-panel` com `ul.imports-rows`, cada linha com o nome (`CATEGORY_LABELS`, minúsculo) à esquerda, a legenda da limitação ou "Você deixou esta categoria de fora" e a contagem (`imports-row-count`) à direita, na ordem de `CATEGORY_ORDER` (horários em terceiro); a nota quando nem tudo está escolhido; o primário "Importar tudo" ou "Importar N registros" e o terciário "Escolher o que importar" (`imports-actions is-stacked`); `ConflictsZone` e `ReplaceAccountZone`.
   - A escolha: título "O que você quer trazer?", descrição "O que ficar de fora não poderá ser importado depois. Nada muda até você confirmar."; caixas nativas em `ul.imports-select-rows`, cada uma gravando com `setImportCategorySelection` (marca antes da resposta e desfaz se falhar, com a mensagem de hoje); "Voltar" e "Importar N registros" lado a lado (`is-split`); `ConflictsZone` e `ReplaceAccountZone`.
   - A soma (`selectedCount`) soma `discoveredCount` de toda categoria escolhida, inclusive `AVAILABILITY`; o primário fica desabilitado com `executing` ou soma 0; "Importar tudo" só quando toda categoria está escolhida (`everythingSelected`).
4. **O que o contrato traz e o que não traz.**
   - `importPreviewCategorySchema` tem oito categorias (`SERVICE`, `CUSTOMER`, `AVAILABILITY`, `TIME_BLOCK`, `FUTURE_APPOINTMENT`, `PAST_APPOINTMENT`, `CANCELLED_APPOINTMENT`, `NO_SHOW_APPOINTMENT`), cada uma com `discoveredCount`, `sourceSupported` e `limitationCode`. A escolha é gravada **por categoria**. O quadro mostra cinco linhas e põe "incluindo cancelamentos e faltas" sob os atendimentos anteriores; agrupar categorias numa linha mudaria o que uma caixa grava. Este Goal mantém **uma linha por categoria** e não usa essa legenda.
   - O resumo dos dias dos horários ("segunda a sábado") não vem do contrato: `AVAILABILITY` só traz a contagem de regras. A legenda não é usada.
   - "Sem o histórico, o resumo por IA de cada cliente começa do zero." **não é verdade no app**: o resumo do cliente (`customerSummarySchema.sources`) usa memória, observações, etiquetas e próximos agendamentos, não os atendimentos anteriores. A nota não é usada.
   - "Importar 440 registros" no quadro soma 12 + 386 + 42 e deixa os horários de fora. O app soma também as regras de `AVAILABILITY`. Mudar a soma mudaria quando o primário fica habilitado (só os horários escolhidos dariam soma 0). Este Goal **não muda a soma nem a regra**; com seis regras de horário na resposta fixa, o 2.I5 mostra "Importar 446 registros". Divergência declarada.
5. **A captura alcança as duas telas sem escrita.**
   - `ImportsFlow` mostra `ImportPreviewScreen` para uma sessão `READY` com `startedAt` nulo (`ImportsScreen.tsx`). Com `previewVersion` maior que 0, sem `lastError` e sem `interrupted`, a tela só lê `GET /v1/calendar/imports/<sessionId>/preview` (`readPreview`) e não chama `analyzeImport`.
   - `responses` aceita o caminho exato do BFF sob `/v1/` (`scripts/lib/visual-responses.mjs`, `pickFixedResponse`), então a prévia com o `sessionId` fixo casa.
   - A escolha marcada vem de `session.categories[].selected` (`applyPreview`), então o 2.I5 tem "Atendimentos anteriores" desmarcado pela leitura, sem `PUT`. "Escolher o que importar" só troca `mode`, sem pedido.
   - Hoje `Onboarding-2-Importacao.dc.html` tem um dono de `responses` (o 2.I3), e `scripts/tests/visual-responses.test.mjs` afirma a lista fechada dos alvos que declaram `responses`.
   - Antes de editar, o Developer confere no navegador da captura (ou no código de `ImportsScreen` e da moldura) se a tela lê outro `GET` que precise de resposta fixa para chegar à prévia; se ler, só `GET` entra em `responses`, e ele registra o motivo nas `notes`.
6. **As classes de hoje são compartilhadas.** `.imports-rows`, `.imports-row-count` e `.imports-panel` também servem a `ImportConflictsScreen` e `ImportRunScreen`; `.imports-actions` serve a várias telas. As linhas novas usam classes próprias.
7. **O gate autenticado.** `ONBOARDING_ROUTES` (`e2e/routes.ts`) mede `/onboarding/importacao` na origem, com o marcador "De onde vamos trazer seus dados?" (D-119 (f)). A conta do gate não tem sessão de importação, e `/importacao` está fora de `AUTHENTICATED_ROUTES`. O Goal131 leu `e2e/authenticated-matrix.spec.ts` inteiro e não achou bloco que toque a importação além da origem. O Developer confere de novo, na baseline, e registra o resultado.
8. **Testes que citam o que muda.** `goal020-a11y`, `goal020-import-preview`, `goal020-import-run`, `goal020-imports-entry`, `goal020-reachability`, `goal020-shell-invariant`, `goal061-import-async` e `goal105-importacao` citam "Encontramos isto no Minha Agenda", "Escolher o que importar" ou "O que você quer trazer?". O Developer procura também "Isso não altera nada na Avenly", "Nada muda até você confirmar", "Voltar" e `imports-select-row` em `apps/frontend/tests/`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS de 2.I4 e 2.I5: os valores inline de px, cor, fonte, raio e espaçamento, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device: `Onboarding-2-Importacao.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop, lendo os valores de cada arquivo, sem deduzi-los do mobile. A origem (2.I1), as credenciais (2.I2), a análise (2.I3), o histórico (I1), a entrada de Configurações (I2), os conflitos, a execução e a conclusão não mudam, nem no DOM, nem na captura.
2. **As duas molduras, o mesmo conteúdo.** O resumo e a escolha mudam em `/onboarding/importacao` e em `/importacao`. Na moldura `platform`, a composição de D-119 (b) não muda: a barra "Importação" é o `h1`, e o título da tela é `h2`. Não nasce variante da tela por moldura.
3. **A ordem das categorias nas duas telas.** Serviços, Clientes, Agendamentos futuros, Atendimentos anteriores, Cancelamentos, Faltas, Bloqueios e Horários de atendimento (`SERVICE`, `CUSTOMER`, `FUTURE_APPOINTMENT`, `PAST_APPOINTMENT`, `CANCELLED_APPOINTMENT`, `NO_SHOW_APPOINTMENT`, `TIME_BLOCK`, `AVAILABILITY`), só as que a prévia traz. A ordem vale só para o resumo e a escolha: `CATEGORY_ORDER`, `HISTORY_CATEGORY_ORDER` e as outras telas não mudam.
4. **O resumo (2.I4).**
   - Só o título "Encontramos isto no Minha Agenda". A descrição de hoje sai, como no quadro (a análise e a escolha já dizem que nada muda até confirmar). Sem descrição, `ImportsPage` não mostra o eyebrow "Importação" no onboarding; o único eyebrow é o "Sua agenda" da moldura.
   - O cartão do quadro, em classes novas. Cada linha: o número à esquerda (Literata 26 px 500, `tabular-nums`, `min-width: 72px`, à direita), o nome em minúsculo (`CATEGORY_LABELS`) e, abaixo do nome, em 13 px `#716859`, a legenda de hoje quando houver: a limitação (`limitationLabel`) ou "Você deixou esta categoria de fora".
   - **Horários de atendimento** (`AVAILABILITY`) com `sourceSupported` e `discoveredCount` maior que 0: o nome com maiúscula, sem número, e o selo do quadro no lugar dele (26 px, `#DFEFE4`, o visto), decorativo. A linha continua dizendo, para a tecnologia assistiva, que os horários foram encontrados (por exemplo, um texto visualmente oculto); o Developer escolhe a forma e a explica em D-146. Com 0 ou sem suporte da origem, a linha mostra o número ou a limitação, como as outras.
   - A nota de hoje quando nem tudo está escolhido continua, com o mesmo texto e a mesma regra, abaixo do cartão.
   - O rodapé do quadro: o primário com o texto e a regra de hoje ("Importar tudo" ou "Importar N registros", desabilitado como hoje) e, abaixo, "Escolher o que importar" como ação de texto (15 px 600 `#0F5F63`), um `button` com alvo de toque de 24 px no mínimo e foco visível.
   - `ConflictsZone` e `ReplaceAccountZone` continuam, depois do rodapé, com o texto e a ação de hoje. O quadro não os mostra: divergência declarada quando aparecerem na captura.
5. **A escolha (2.I5).**
   - O título de hoje e a descrição do quadro: "O que ficar de fora não poderá ser importado depois." (sai "Nada muda até você confirmar.", que a análise já disse). Na moldura do onboarding, sem o eyebrow "Importação" (`eyebrow={false}`, a opção de D-145).
   - O cartão do quadro, em classes novas. Cada linha é um `label` com uma caixa de seleção **nativa** (`input type="checkbox"`), desenhada como a do quadro (24 px, raio 7 px; marcada com fundo `#0F5F63` e o visto claro; desmarcada com a borda de 1,5 px `#D6CEC2`), com foco visível; o nome com maiúscula em 15 px 600 e a contagem à direita em 15 px `#5F574E`, `tabular-nums`. Desmarcada, o nome passa a `#5F574E` e a contagem a `#716859`, como no quadro.
   - Sob "Atendimentos anteriores", a legenda "histórico de cada cliente" em 13 px `#716859`; a limitação de hoje, quando houver, no lugar dela. As outras linhas mostram só a limitação, quando houver.
   - Horários de atendimento sem contagem, como no quadro.
   - Marcar e desmarcar continuam como hoje: o mesmo pedido, a mesma idempotência, o mesmo desfazer e a mesma mensagem quando a gravação falha.
   - O rodapé: o primário "Importar N registros", com a soma e a regra de hoje, e, abaixo, "Voltar" como ação de texto, igual a "Escolher o que importar" do resumo, que volta ao resumo. A nota do quadro sobre o resumo por IA **não** entra (evidência 4). O quadro volta pelo chevron do topo, que a moldura do onboarding não mostra nesta etapa (D-145); o "Voltar" fica para não perder a volta. Divergência declarada.
   - `ConflictsZone` e `ReplaceAccountZone` como no resumo.
6. **CSS.** As regras ficam em `shared/styles/avenly-imports.css`, em classes novas escopadas pelas duas telas, sem alterar regra que a origem, as credenciais, a análise, os conflitos, a execução, o I1 ou o I2 usam. `.imports-select-rows`, `.imports-select-row` e `.imports-actions.is-split` podem sair se nada mais as usar. Movimento só com `prefers-reduced-motion: no-preference`.
7. **Alvos.** `targets.json`, ambos de `Onboarding-2-Importacao.dc.html`, com `account: "onboarding"` e rota `/onboarding/importacao`, e o mesmo `sessionId` `visual-compare-import-ready` (diferente do `visual-compare-import` do I1 e do `visual-compare-import-analyzing` do 2.I3):
   - **2.I4, novo:** label "Resumo da importação", sem passos, com `responses` de dois `GET`: `/v1/calendar/imports` (válido para `importStateSchema`: `right` disponível, `history` `null`, `session` `READY` com `startedAt` nulo, `previewVersion` 1, `interrupted` `false`, `lastError` `null`, e as cinco categorias do quadro com `selected: true`) e `/v1/calendar/imports/visual-compare-import-ready/preview` (válido para `importPreviewSnapshotSchema`, `previewVersion` 1, com `SERVICE` 12, `CUSTOMER` 386, `FUTURE_APPOINTMENT` 42, `PAST_APPOINTMENT` 1400 e `AVAILABILITY` 6, todas com `sourceSupported: true` e `needsReviewCount` 0).
   - **2.I5, novo:** label "Escolher o que importar", as mesmas duas respostas, salvo `PAST_APPOINTMENT` com `selected: false` na leitura da sessão, e um só passo: `clickRole` no botão "Escolher o que importar". Nenhum passo toca uma caixa, o primário nem "Conectar outra conta".
   - As `notes` dizem por que as respostas são fixas e citam as divergências. O 2.I1, o 2.I2 e o 2.I3 não mudam.
8. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar 2.I3, 2.I4 e 2.I5 como os únicos donos de `responses` em `Onboarding-2-Importacao.dc.html`; o 2.I4 e o 2.I5 só com os dois `GET` e o caminho exato da prévia; o 2.I4 sem passos; o 2.I5 só com o `clickRole` em "Escolher o que importar". Um teste `goal132` valida as respostas contra `importStateSchema` e `importPreviewSnapshotSchema`, confere que o `sessionId` da sessão e o da prévia são o mesmo e o do caminho, que a sessão está `READY` com `startedAt` nulo, e que o 2.I5 difere do 2.I4 só no `selected` de `PAST_APPOINTMENT`.
9. **Gate autenticado.** Pela evidência 7, o marcador de `onboarding-importacao` não muda, porque a origem não muda. Se a leitura de `authenticated-matrix.spec.ts` achar um bloco que toque o resumo ou a escolha, o Developer o ajusta **só para provar a tela nova, sem afrouxar asserção**, e registra o ajuste em D-146 e no relatório. Esse arquivo entra no critério 8 só para isso.
10. **Divergências declaradas.**
    - "incluindo cancelamentos e faltas" e "segunda a sábado" (evidência 4).
    - A nota sobre o resumo por IA no 2.I5 (evidência 4).
    - "Importar 446 registros" no lugar de "Importar 440 registros" (evidência 4).
    - "Voltar" como ação de texto no 2.I5 (escolha 5).
    - `ConflictsZone` e `ReplaceAccountZone`, se aparecerem abaixo do rodapé.
    - O chevron do topo, que a moldura do onboarding não mostra nesta etapa (D-145); o preenchimento do segundo segmento da barra, derivado por `chapterFraction` (D-104), 44 % nos quadros; o "Sair" (D-104); a barra de status e o indicador de início do iPhone.

    O Developer registra outras que encontrar nas `notes` dos alvos e em D-146, com o motivo.
11. **Decisão.** O Developer propõe **D-146**, por acréscimo, depois das provas, cobrindo o resumo e a escolha nas duas molduras, a ordem das categorias só nessas telas, o selo dos horários e o texto para a tecnologia assistiva, a soma sem mudança, "Voltar" como ação de texto, os alvos 2.I4 e 2.I5 e as divergências. Revê em parte D-119 (item 2 do "Revisar se": a prévia e a escolha portadas). D-119 e D-145 não são editadas.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/imports/ImportPreviewScreen.tsx`: só as fases `summary` e `select` (escolhas 3 a 5). A fase `working`, o erro, a interrupção, a prévia obsoleta, `handleExecute`, `toggleCategory` e `ConflictsZone` não mudam de comportamento.
2. `features/imports/labels.ts`: só se faltar o nome com maiúscula de uma categoria ou a ordem da escolha 3, sem mudar `CATEGORY_ORDER`, `HISTORY_CATEGORY_ORDER` nem os rótulos de hoje.
3. `features/imports/ImportsLayout.tsx`: só se for preciso para o eyebrow ou o rodapé, sem efeito em outra tela.
4. `shared/styles/avenly-imports.css`: o CSS das duas telas nos quatro devices (escolha 6).

`ImportOriginScreen.tsx`, `ConnectSourceScreen.tsx`, `ImportEmptyScreen.tsx`, `ImportHistoryCard.tsx`, `ImportRunScreen.tsx`, `ImportConflictsScreen.tsx`, `ImportsScreen.tsx`, `features/onboarding/`, o contrato e o BFF não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o 2.I4 e o 2.I5 novos (escolha 7).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 8.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal132-*.test.tsx` / `.test.ts`, nas duas molduras:
   - **Resumo:** com a prévia pronta, o título sem descrição e, no onboarding, sem o eyebrow "Importação"; as linhas na ordem da escolha 3, com o número antes do nome; os horários com o selo e sem número, e com o texto para a tecnologia assistiva; com 0 regras de horário, o número; a legenda da limitação e "Você deixou esta categoria de fora" como hoje; "Importar tudo" com tudo escolhido e "Importar N registros" com uma categoria de fora, com a soma de hoje (inclusive `AVAILABILITY`); "Escolher o que importar" é um botão que abre a escolha sem pedido.
   - **Escolha:** o título e a descrição do quadro, sem "Nada muda até você confirmar."; caixas nativas na ordem da escolha 3, marcadas pela leitura da sessão; "histórico de cada cliente" sob os atendimentos anteriores; os horários sem contagem; marcar e desmarcar chamam `setImportCategorySelection` uma vez, com o mesmo corpo de hoje, e a falha desfaz a caixa com a mensagem de hoje; o primário com a soma e a regra de hoje (desabilitado com soma 0); "Voltar" volta ao resumo; nenhuma nota sobre o resumo por IA.
   - **Execução:** "Importar tudo" e "Importar N registros" chamam `executeImport` com o `previewVersion` da prévia, como hoje; a recusa de prévia obsoleta mostra a tela de hoje.
   - **Alvos:** os testes `goal132` da escolha 8.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 8.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) o resumo na ordem de `CATEGORY_ORDER` faz um teste reprovar;
   - (b) a soma sem `AVAILABILITY` faz um teste reprovar;
   - (c) o primário habilitado com soma 0 faz um teste reprovar;
   - (d) a escolha que não chama `setImportCategorySelection` ao marcar faz um teste reprovar;
   - (e) "Voltar" que não volta ao resumo faz um teste reprovar;
   - (f) o 2.I5 de `targets.json` com um passo que toca uma caixa ou o primário faz o teste da captura reprovar;
   - (g) o 2.I4 de `targets.json` com a prévia num `sessionId` diferente do da sessão faz um teste reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 8 só troca o texto, a ordem ou a ação que este Goal muda (por exemplo, a descrição que sai, "Voltar" como ação de texto, a ordem das linhas). Nenhum ajuste afrouxa asserção sobre os pedidos, a escolha gravada, a execução, a idempotência, a prévia obsoleta, os conflitos ou a troca de conta. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 2.I4,2.I5` e, para regressão, `--target 2.I1,2.I2,2.I3,I1,I2`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 131.
   - **A captura de antes é da baseline `ada0875`** (lição 1): o Developer guarda o `app.png` de 2.I1, 2.I2, 2.I3, I1 e I2 capturado na baseline, fora do repositório. Depois das edições, prova por `cmp` que os 20 `app.png` não mudaram, ou explica cada diferença.
   - O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.
   - **Medidas** (lição 2): em cada device, a altura de cada linha do cartão nas duas telas, da caixa de seleção, do primário e da ação de texto, e o topo do cartão e do primário, no app e no quadro, com a diferença em px. Diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`). Agrupar categorias, resumir os dias dos horários ou mudar a soma exige outra decisão e não entra aqui.
- A origem (2.I1), as credenciais (2.I2), a análise (2.I3), o I1, o I2 e as telas de 2.I6 a 2.I10 (conflitos, execução, pendências, confirmação e conclusão).
- O comportamento do chevron e do "Sair" na etapa `importacao`.
- A forma de marcar a caixa (antes da resposta, com desfazer na falha): continua a de hoje.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3) e as outras observações abertas dos reviews 116 a 131.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-146** em `PROPOSED`, conforme a escolha 11, com o contraste calculado de cada par de texto novo (inclusive `#0F5F63` sobre `#F7F4EF`, `#5F574E` e `#716859` sobre `#FFFDFA`, `#221E1A` sobre `#FFFDFA` e `#F7F4EF` sobre `#0F5F63`) e o alvo de toque da caixa e das duas ações de texto. Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal132.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal132, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um, com os números (lição 3);
  - a rodada de cada número, sem atribuir a uma rodada o que outra fez;
  - os controles negativos e a rodada em que rodaram;
  - o `visual:compare` (alvos, percentuais, medidas, regressão por `cmp` e diferenças que restam);
  - a lista dos testes ajustados e o resultado da leitura de `authenticated-matrix.spec.ts` (evidência 7).

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal132 na mesma rodada, para que nenhum deles descreva uma árvore anterior. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos três registros acima.

## Validação e ordem

1. Montar a pilha descartável própria e capturar, na baseline `ada0875`, o `app.png` de 2.I1, 2.I2, 2.I3, I1 e I2. Ler `authenticated-matrix.spec.ts` (evidência 7) e conferir as leituras da evidência 5.
2. Implementar o resumo, com os testes `goal132` dele e os ajustes dos testes existentes.
3. Implementar a escolha, com os testes `goal132` dela e os ajustes dos testes existentes.
4. Adicionar os alvos 2.I4 e 2.I5 e os testes da captura.
5. Rodar o `visual:compare` de 2.I4 e 2.I5, medir, e rodar o de 2.I1, 2.I2, 2.I3, I1 e I2 para a regressão por `cmp`.
6. Rodar os controles negativos do §3.3 e revertê-los.
7. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. O resumo em `/onboarding/importacao` igual ao quadro 2.I4 nos 4 devices, e a escolha igual ao quadro 2.I5 nos 4 devices, salvo as divergências declaradas. Provado em jsdom, pelo `visual:compare` e pelas medidas do §3.5.
2. O resumo com o título sem descrição, o número antes do nome, a ordem da escolha 3, o selo dos horários com o texto para a tecnologia assistiva, "Importar tudo" ou "Importar N registros" e "Escolher o que importar" como ação de texto, nas duas molduras.
3. A escolha com a descrição do quadro, as caixas do quadro (nativas, com foco visível), "histórico de cada cliente", os horários sem contagem, "Importar N registros" e "Voltar" como ação de texto, nas duas molduras. Marcar, desmarcar, executar, a prévia obsoleta, os conflitos e a troca de conta fazem os mesmos pedidos, com a mesma soma, a mesma regra de habilitar o primário e as mesmas mensagens.
4. 2.I1, 2.I2, 2.I3, I1 e I2 iguais byte a byte à captura da baseline (`cmp` dos 20 `app.png`), ou com cada diferença explicada; a análise, os conflitos, a execução e a conclusão não mudam.
5. Nenhum pedido ao BFF muda de rota, e nenhum passo de captura grava. O teste da captura prova que 2.I3, 2.I4 e 2.I5 são os únicos donos de `responses` no arquivo, que o 2.I4 e o 2.I5 só declaram os dois `GET` e que o 2.I5 só tem o passo permitido.
6. Os sete controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/importacao` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440), na origem; o gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo, contraste, foco visível e `prefers-reduced-motion`. O resumo e a escolha não são alcançados pelo gate: as cores deles são as do quadro, com o contraste de cada par de texto calculado e registrado em D-146, e o alvo de toque da caixa e das duas ações de texto (24 px no mínimo) é provado em jsdom pelo CSS aplicado ou medido no `visual:compare`. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json` e `scripts/tests/visual-responses.test.mjs`; `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no caso da escolha 9; os três registros da seção "Documentação".
9. D-146 proposta, conforme a escolha 11.

## Plano de execução

1. **WU-01 — O resumo.** A captura de antes na baseline, a leitura do spec do gate, o resumo (ordem, número à esquerda, selo dos horários, rodapé), o CSS nos quatro devices, os testes `goal132` do resumo e os ajustes dos testes existentes, nas duas molduras.
2. **WU-02 — A escolha.** A descrição, as caixas do quadro, a legenda dos atendimentos anteriores, os horários sem contagem, "Voltar" como ação de texto, o CSS nos quatro devices, os testes `goal132` da escolha e os ajustes dos testes existentes.
3. **WU-03 — Os alvos.** O 2.I4 e o 2.I5 em `targets.json`, os testes da captura e os testes `goal132` dos alvos.
4. **WU-04 — Fidelidade e controles.** O `visual:compare` de 2.I4 e 2.I5 com as medidas, a regressão por `cmp` e os controles negativos, com as correções de medida que faltarem.
5. **WU-05 a WU-13 — Verificação determinística:** typecheck, lint, testes alvo `goal132`; suíte do frontend, testes de ferramenta e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
6. **WU-14 — Registros.** D-146, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística escritos no registro (lição 3).
7. **WU-15 — `git diff --check`.**
