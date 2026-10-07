# Goal 133 — O progresso da importação do onboarding igual ao protótipo

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal132 ACCEPTED](../reviews/132-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.I7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v157**, inserida depois do 132, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 132. Com 2.I4 e 2.I5 aceitos, `targets.json` tem 95 alvos, e 18 dos 113 quadros continuam sem alvo. Dos cinco quadros que restam da importação do onboarding (2.I6 a 2.I10), este Goal leva só o 2.I7, a execução em andamento.

## Baseline aceita

Baseline aceita: `94e949dbef1abe8f0bc89351be7a9ed8b30ebfaf`

Goal anterior: 132 — A prévia e a escolha do que importar no onboarding iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal132 já integrado em `main` (origem `1b95e0ee853e91bcff9ba201580b6368582d7846`). Houve **uma rodada**, sem blocker. **D-146** foi aceita: o resumo e a escolha do que importar como os quadros 2.I4 e 2.I5, nas duas molduras. A última contagem aceita:

- frontend **192** arquivos e **2603** testes, `goal132` **94** (3 arquivos);
- `visual-responses.test.mjs` **59**;
- `test:gate` **292**;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a importação em andamento fica igual ao quadro 2.I7 nos quatro devices**, salvo as divergências declaradas. A tela continua em `/onboarding/importacao` e em `/importacao`, porque as duas molduras mostram as mesmas telas (D-084 item 5, D-119, D-145, D-146). A leitura do andamento, o intervalo de releitura, a parada da releitura num estado que não é `EXECUTING`, a interrupção, a retomada, a conclusão, os conflitos e a troca de conta continuam com os mesmos pedidos, a mesma regra e as mesmas mensagens. Nenhuma rota do BFF muda, e nenhum pedido novo.

**Por que agora.** A fila não tem Goal PLANNED. Dos 18 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 a v156: S1b (cor livre fora de `colorToken`); S5, S6, S8 e S9 (a composição de D-114 e a guarda de navegação); CL8 (outra tela); CL9 (carregamento, e `responses` não sabe atrasar uma resposta); H6 e NT3 (sinal de IA instável que o status não tem); N2, N3 e W3 (dado que o contrato não tem). A 4.3 continua fora (o código de vinculação só vem de `POST /v1/whatsapp/connect`). Da importação do onboarding, o 2.I7 é o único que restou que a captura alcança só com leitura e que o contrato cobre por inteiro (evidências 4 e 5). Os outros quatro ficam para as próximas passadas (evidência 8).

**Lições do Goal132, que valem aqui.**

1. A regressão por `cmp` não deu byte a byte: de 8 a 10 dos 20 `app.png` diferiram a cada execução, e o conjunto mudou entre execuções da mesma árvore, por antialiasing nos arcos e nas bordas. Aqui, o Developer captura a baseline **duas vezes** antes de editar e mede a diferença entre as duas capturas. Esse é o ruído da própria captura. Depois das edições, cada `app.png` que diferir da baseline é comparado contra esse ruído, com o número de pixels e o delta por canal.
2. O rótulo do alvo é o `data-screen-label` do quadro, não o título do quadro. O do 2.I7 é "Importando".
3. O lado a lado do 2.I4 em tablet paisagem não foi aberto, e a altura renderizada das ações de texto não foi medida em px. Aqui, o Developer abre os **quatro** `side-by-side.png` do 2.I7 e mede em px tudo o que a seção §3.5 pede.
4. Os controles (f) e (g) do Goal132 rodaram só pelo teste `goal132`, não por `scripts/tests/visual-responses.test.mjs`. Aqui, cada controle de `targets.json` roda pelos **dois** testes.

## O que a evidência desta passada mostra

Conferido no código da baseline `94e949d` e em `docs/design-reference/claude-design/prototype/project/Onboarding-2-Importacao.dc.html` (quadro 2.I7 "Importando · progresso", `data-screen-label="Importando"`), com `Onboarding-2-Importacao-Tablet.dc.html` (retrato e paisagem) e `Onboarding-2-Importacao-Desktop.dc.html`, que também têm o quadro.

1. **2.I7 no mobile.**
   - O topo: sem chevron (um espaço vazio de 40 px), a barra com o primeiro segmento `#0F5F63`, o segundo `#DCECEB` com 62 % preenchido e os outros dois `#E5DED4`, e o eyebrow "Sua agenda" da moldura.
   - O corpo (`padding: 10px 20px 0`, **22 px** entre os blocos). O cabeçalho (8 px de espaço): "Importando…" em Literata 28 px 500, `line-height: 1.2`, `letter-spacing: -0.01em`, e "Fique nesta tela até terminar. Leva alguns minutos." em 15 px, `line-height: 1.45`, `#5F574E`.
   - O total (10 px de espaço): numa linha, alinhados pela linha de base e separados (`justify-content: space-between`), "1.204" em Literata 34 px 500, `tabular-nums`, `line-height: 1`, e "de 1.840 registros" em 14 px `#5F574E`, `tabular-nums`. Abaixo, a barra de 8 px, raio 4 px, fundo `#E5DED4`, com o preenchimento `#0F5F63` em 65 %.
   - A lista, sem cartão. Cada linha com `padding: 12px 0`, 14 px de espaço, `align-items: center` e divisória de 1 px `#E5DED4` embaixo, salvo a última. Três estados:
     - **concluída:** o círculo de 24 px `#2E7D4F` com o visto `#FFFDFA` (13 px, traço 3), o nome em 15 px 600 e, à direita, a contagem em 14 px `#5F574E`, `tabular-nums` (Serviços 12, Clientes 386, Agendamentos futuros 42);
     - **em andamento:** o anel de 24 px (borda de 1,5 px `#0F5F63`, com a animação `at-breathe 2.4s`) com o ponto `#0F5F63` de 10 px no meio (`inset: 7px`); à direita do anel, uma coluna (6 px de espaço) com o nome em 15 px 600 e "764 de 1.400" em 14 px `#5F574E` na mesma linha, e abaixo uma barra de 4 px, raio 2 px, fundo `#E5DED4`, com o preenchimento `#0F5F63` (animado por `at-grow2 6s`) (Atendimentos anteriores);
     - **na fila:** o círculo vazio de 24 px, borda de 1,5 px `#D6CEC2`, `box-sizing: border-box`, e o nome em 15 px **500** `#716859`, sem contagem (Horários de atendimento).
   - O rodapé vazio (`padding: 12px 20px 46px`): sem botão. A legenda diz: "Sem botão Voltar — a etapa não pode ser abandonada."
2. **O app hoje.** A execução é `ImportRunScreen` (`features/imports/`), que `ImportsFlow` mostra para uma sessão com `startedAt` preenchido (`isPreviewStage` falso).
   - Com `progress.status` `EXECUTING` e `interrupted` falso, ou com `retrying`, a tela está "executando" (`executing`). O título é "Importando seus dados", e a descrição é "Estamos trazendo seus dados do Minha Agenda. Isso pode levar alguns minutos.", que na moldura do onboarding também liga o eyebrow "Importação".
   - Um `imports-panel` com `aria-busy`: o cabeçalho com `STATUS_LABELS[status]` e "Minha Agenda · <conta> · desde <hora>"; a barra `imports-progress-track` com `role="progressbar"`, `aria-valuemin`, `aria-valuemax` (o total), `aria-valuenow` (os processados) e `aria-valuetext`; e o resumo `aria-live="polite"` "<processados> de <total> registros processados · <importados> importados".
   - Com o que ainda não entrou maior que 0, o que sempre acontece durante a execução (há `pending`): o painel "O que ainda não entrou (N)", com uma linha por categoria que ainda tem algo de fora (`outstandingDetail`, os `failedReasons` e a contagem à direita, em `.imports-rows`) e "Revisar itens" quando há item esperando decisão.
   - Por último, `ReplaceAccountZone`.
   - O total soma `pending`, `imported`, `skipped`, `failed` e `needsReview` de `progress.counts` (`totalOf`), e os processados são o total menos `pending`. Nada é somado no cliente entre leituras: o número vem sempre de `GET .../progress`, relido a cada 3 s enquanto o banco disser `EXECUTING`.
3. **A ordem da execução.** O Scheduling executa as categorias numa ordem fixa, uma de cada vez (`CATEGORY_ORDER` de `apps/scheduling-service/src/modules/migrations/import-execution-service.ts`): Serviços, Clientes, **Horários de atendimento**, Bloqueios, Agendamentos futuros, Atendimentos anteriores, Cancelamentos e Faltas. O `CATEGORY_ORDER` do frontend (`labels.ts`) é o mesmo, e é o que `ImportRunScreen` já usa.
   - O quadro mostra os horários por último, ainda na fila, enquanto os atendimentos anteriores correm. Na execução real, os horários terminam antes dos agendamentos futuros. Por isso, a ordem e o estado dos horários do quadro não acontecem: na captura, os horários aparecem em terceiro, concluídos (divergência declarada).
   - Como a execução é sequencial, a categoria em andamento é a **primeira** da ordem com `pending` maior que 0. As que vêm antes estão concluídas, e as que vêm depois estão na fila.
   - Uma categoria desmarcada na escolha também passa pela ordem: os itens dela são gravados como `SKIPPED`, com o motivo `CATEGORY_NOT_SELECTED`, quando a vez dela chega.
4. **O que o contrato traz e o que não traz.**
   - `importProgressSchema` traz `counts` e, por categoria, `pending`, `imported`, `skipped`, `failed`, `needsReview` e `failedReasons`. Isso basta para o total, os processados, o estado de cada linha e o "764 de 1.400" da linha em andamento.
   - `importLiveSessionSchema` traz, por categoria, `selected`. É assim que a tela sabe que uma categoria ficou de fora.
   - "de 1.840 registros" no quadro soma 12 + 386 + 42 + 1.400 e deixa os horários de fora. O app soma também as regras de `AVAILABILITY`, como no resumo (D-146). Este Goal **não muda a conta do total nem a dos processados**. Com seis regras na resposta fixa, a captura mostra "1.210" e "de 1.846 registros" (divergência declarada, como "Importar 446 registros" no Goal132).
   - "Fique nesta tela até terminar." **não é verdade no app**: o Scheduling responde `202` e roda a execução em segundo plano (`importWork.dispatch` em `apps/scheduling-service/src/modules/internal-api/routes.ts`), então sair da tela não para a importação. A frase não é usada. Fica só "Leva alguns minutos." (divergência declarada).
5. **A captura alcança a tela sem escrita.**
   - `ImportsFlow` mostra `ImportRunScreen` para uma sessão `EXECUTING` com `startedAt` preenchido. A tela lê `GET /v1/calendar/imports/<sessionId>/progress` (`getImportProgress`) ao montar e de novo a cada 3 s, enquanto a resposta disser `EXECUTING`. Nada mais é pedido sem toque.
   - `responses` aceita o caminho exato do BFF sob `/v1/` (`scripts/lib/visual-responses.mjs`, `pickFixedResponse`), então o andamento com o `sessionId` fixo casa. Com a resposta fixa, cada releitura devolve o mesmo andamento, e a tela fica parada no mesmo estado.
   - `scripts/visual-compare.mjs` captura com `reducedMotion: "reduce"`, no protótipo e no app.
   - Hoje `Onboarding-2-Importacao.dc.html` tem três donos de `responses` (2.I3, 2.I4 e 2.I5), e `scripts/tests/visual-responses.test.mjs` afirma a lista fechada dos alvos que declaram `responses`.
   - Antes de editar, o Developer confere no navegador da captura se a tela lê outro `GET` que precise de resposta fixa. Se ler, só `GET` entra em `responses`, e ele registra o motivo nas `notes`.
6. **As classes de hoje são compartilhadas.** `.imports-panel`, `.imports-panel-header`, `.imports-progress-track`, `.imports-progress-fill`, `.imports-progress-summary`, `.imports-rows` e `.imports-row-count` também servem à tela parada (interrompida, `PARTIAL`, `READY` depois de uma passada, terminal), aos conflitos e à prévia. A tela em andamento usa classes próprias.
7. **O gate autenticado.** `ONBOARDING_ROUTES` (`e2e/routes.ts`) mede `/onboarding/importacao` na origem, com o marcador "De onde vamos trazer seus dados?" (D-119 (f)). A conta do gate não tem sessão de importação, e `/importacao` está fora de `AUTHENTICATED_ROUTES`. O Goal132 procurou em `e2e/authenticated-matrix.spec.ts` por busca dirigida e não achou bloco que toque a importação além da origem. Aqui, o Developer procura de novo por "Importando", "registros processados", "Andamento", "O que ainda não entrou" e "progress", e registra o resultado.
8. **Por que só o 2.I7.**
   - **2.I6 (conflitos):** o quadro mostra cada item com o valor da Avenly e o do Minha Agenda lado a lado ("45 min · R$ 90" e "50 min · R$ 95") e "Sim, juntar" ou "Não, manter separadas" no próprio cartão. O app abre os conflitos por categoria e decide item a item por opção. `ImportItem` só traz a comparação para os horários (`currentAvailability`, `proposedAvailability`). Portar o 2.I6 pede outra leitura e outra decisão.
   - **2.I8 (pendências) e 2.I9 (confirmação):** o 2.I8 lista os itens pendentes um a um, com "Corrigir" e "Nomear", o que pede `GET .../categories/:category/items` por categoria e um destino para cada ação. O 2.I9 é a confirmação sobre o 2.I8. Os dois vão juntos numa passada própria.
   - **2.I10 (conclusão):** no onboarding, a conclusão é `ImportHistoryScreen` com `ImportDoneActions`, que relê o onboarding. O I1, já aceito, é a mesma tela em Configurações. Portar o 2.I10 pede decidir como ela difere do I1 nas duas molduras.
9. **Testes que citam o que muda.** `goal020-import-run`, `goal061-import-async`, `goal020-import-preview`, `goal132-resumo` e `goal132-escolha` montam a execução em `EXECUTING`. O Developer procura também, em `apps/frontend/tests/`, "Importando seus dados", "Estamos trazendo seus dados", "registros processados", "Andamento da importação", "O que ainda não entrou", "Revisar itens", "desde" e `imports-progress`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do 2.I7: os valores inline de px, cor, fonte, raio e espaçamento, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device: `Onboarding-2-Importacao.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop, lendo os valores de cada arquivo, sem deduzi-los do mobile. A tela parada (interrompida, `PARTIAL`, `READY` depois de uma passada, terminal), a confirmação de concluir, os conflitos, a prévia e as telas de antes não mudam, nem no DOM, nem na captura.
2. **Só a tela em andamento.** O desenho novo vale só quando `ImportRunScreen` está executando: `progress.status` `EXECUTING` sem `interrupted`, ou `retrying`. Com `interrupted`, ou em qualquer outro estado, a tela é a de hoje, sem mudança.
3. **As duas molduras, o mesmo conteúdo.** A tela em andamento muda em `/onboarding/importacao` e em `/importacao`. Na moldura `platform`, a composição de D-119 (b) não muda: a barra "Importação" é o `h1`, e o título da tela é `h2`. Não nasce variante da tela por moldura.
4. **O cabeçalho.** O título "Importando…" (com o caractere de reticências) e a descrição "Leva alguns minutos." (evidência 4). Na moldura do onboarding, sem o eyebrow "Importação" (`eyebrow={false}`, a opção de D-145 e D-146).
5. **O total.**
   - Os processados em Literata 34 px 500, `tabular-nums`, e "de N registros" à direita em 14 px `#5F574E`, com o total e os processados calculados como hoje.
   - A barra de 8 px do quadro. Ela continua sendo o `role="progressbar"` de hoje, com `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` e `aria-valuetext` iguais aos de hoje, e com a largura igual a processados sobre total.
   - O resumo `aria-live="polite"` continua com o texto de hoje, visualmente oculto, para quem usa tecnologia assistiva continuar ouvindo o andamento.
   - O cabeçalho do painel de hoje (`STATUS_LABELS` e "Minha Agenda · … · desde …") sai da tela em andamento. Ele continua na tela parada.
6. **A lista por categoria.**
   - A ordem é a da execução, `CATEGORY_ORDER` (evidência 3), só com as categorias que o andamento traz com total maior que 0 e que a sessão não marca `selected: false`.
   - O estado sai das contagens, nunca de relógio nem de animação: **concluída** quando `pending` é 0; **em andamento** a primeira da ordem com `pending` maior que 0; **na fila** as outras com `pending` maior que 0.
   - A concluída mostra, à direita, o total da categoria (as cinco contagens somadas). A em andamento mostra "<processados> de <total>" da categoria e a barra de 4 px com a largura processados sobre total, **sem** animação de crescimento: a largura muda só quando uma leitura nova chega. A na fila não mostra número.
   - Horários de atendimento (`AVAILABILITY`) nunca mostra número, em nenhum estado, como no quadro e em D-146.
   - Uma categoria com item esperando decisão ou que falhou mostra, abaixo do nome, em 13 px `#716859`, "<N> esperando sua decisão" e "<N> não importados", unidos por " · ", com o mesmo texto de `outstandingDetail` de hoje, sem a parte de `pending`. Os `failedReasons` continuam só na tela parada.
   - O estado de cada linha também é dito para a tecnologia assistiva, em texto visualmente oculto: concluída, em andamento ou na fila. O círculo, o anel e o visto são decorativos (`aria-hidden`).
   - O anel respira só com `prefers-reduced-motion: no-preference`. Com `reduce`, o anel fica parado, como na captura.
7. **O rodapé.**
   - Sem primário, como no quadro.
   - Com item esperando decisão, "Revisar itens" continua, como ação de texto (o mesmo `button.imports-text-action` de D-146), abaixo da lista, e abre os conflitos como hoje. Sem item esperando decisão, ele não aparece.
   - `ReplaceAccountZone` continua por último, com o texto e a ação de hoje. O quadro não a mostra: divergência declarada.
8. **CSS.** As regras ficam em `shared/styles/avenly-imports.css`, em classes novas escopadas pela tela em andamento, sem alterar regra que a tela parada, os conflitos, a prévia, a origem, as credenciais, a análise, o I1 ou o I2 usam. Movimento só com `prefers-reduced-motion: no-preference`.
9. **Alvo.** `targets.json`, de `Onboarding-2-Importacao.dc.html`, com `account: "onboarding"` e rota `/onboarding/importacao`. O `sessionId` é `visual-compare-import-executing`, diferente dos de 2.I3, 2.I4, 2.I5 e I1.
   - **2.I7, novo:** label "Importando", **sem passos**, com `responses` de dois `GET`:
     - `/v1/calendar/imports`, válido para `importStateSchema`: `right` disponível com o mesmo `sessionId`, `history` `null`, e a sessão `EXECUTING` com `startedAt` preenchido, `finishedAt` nulo, `previewVersion` 1, `interrupted` `false`, `lastError` `null`, as cinco categorias com `selected: true` e `counts` iguais aos do andamento;
     - `/v1/calendar/imports/visual-compare-import-executing/progress`, válido para `importProgressSchema`: `status` `EXECUTING`, `previewVersion` 1, `interrupted` `false`, `lastError` `null`, e as categorias na ordem da execução e coerentes com ela: `SERVICE` 12 importados, `CUSTOMER` 386, `AVAILABILITY` 6, `FUTURE_APPOINTMENT` 42 (as quatro com `pending` 0) e `PAST_APPOINTMENT` com 764 importados e 636 em `pending`, todas com `skipped`, `failed` e `needsReview` 0 e `failedReasons` vazio. `counts` é a soma das categorias (1.210 importados e 636 em `pending`).
   - As `notes` dizem por que as respostas são fixas e citam as divergências. O 2.I1 a 2.I5 não mudam, salvo a correção das `notes` do 2.I4 (item 11).
10. **Captura, teste.**
    - `scripts/tests/visual-responses.test.mjs` passa a aceitar 2.I3, 2.I4, 2.I5 e 2.I7 como os únicos donos de `responses` em `Onboarding-2-Importacao.dc.html`, e prova que o 2.I7 só declara os dois `GET`, com o caminho exato do andamento, e que não tem passo.
    - Um teste `goal133` valida as respostas contra `importStateSchema` e `importProgressSchema` e confere:
      - que o `sessionId` é o mesmo na sessão, no direito, no andamento e no caminho;
      - que a sessão está `EXECUTING` com `startedAt` preenchido;
      - que `counts` é a soma das categorias, na sessão e no andamento;
      - que as categorias seguem a ordem da execução, com toda categoria antes da em andamento com `pending` 0 e toda depois dela sem nada processado.
11. **Pendências do review132.** O comentário de `apps/frontend/src/shared/styles/avenly.css` que ainda cita `.imports-select-row`, que saiu, é corrigido só no texto. As `notes` do 2.I4 em `targets.json` passam a citar a `ReplaceAccountZone` abaixo do rodapé e o chevron do topo, como D-146 já faz. Nenhuma das duas mudanças muda a captura nem o comportamento.
12. **Gate autenticado.** Pela evidência 7, o marcador de `onboarding-importacao` não muda, porque a origem não muda. Se a busca em `authenticated-matrix.spec.ts` achar um bloco que toque a tela em andamento, o Developer o ajusta **só para provar a tela nova, sem afrouxar asserção**, e registra o ajuste em D-147 e no relatório. Esse arquivo entra no critério 8 só para isso.
13. **Divergências declaradas.**
    - Os horários em terceiro e concluídos, no lugar de por último e na fila (evidência 3).
    - "1.210" e "de 1.846 registros", no lugar de "1.204" e "de 1.840 registros" (evidência 4).
    - "Leva alguns minutos." sem "Fique nesta tela até terminar." (evidência 4).
    - A barra da linha em andamento sem a animação de crescimento do quadro (escolha 6).
    - `ReplaceAccountZone` abaixo da lista (escolha 7).
    - O preenchimento do segundo segmento da barra do topo, derivado por `chapterFraction` (D-104), 62 % no quadro; o "Sair" (D-104); a barra de status e o indicador de início do iPhone.

    O Developer registra outras que encontrar nas `notes` do alvo e em D-147, com o motivo.
14. **Decisão.** O Developer propõe **D-147**, por acréscimo, depois das provas, cobrindo: a tela em andamento nas duas molduras; a ordem da execução e o estado de cada linha a partir das contagens; os horários sem número; o total sem mudança; o texto para a tecnologia assistiva; "Revisar itens" como ação de texto; o alvo 2.I7; e as divergências. Revê em parte D-119 (item 2 do "Revisar se": a execução portada). D-119, D-145 e D-146 não são editadas.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/imports/ImportRunScreen.tsx`: só a tela em andamento (escolhas 2 a 7). A leitura e a releitura do andamento, a interrupção, a retomada (`retryPending`), a conclusão (`runComplete`, a confirmação e a idempotência), os conflitos e `ReplaceAccountZone` não mudam de comportamento.
2. `features/imports/labels.ts`: só se faltar um texto da escolha 6, sem mudar `CATEGORY_ORDER`, `HISTORY_CATEGORY_ORDER` nem os rótulos de hoje.
3. `features/imports/ImportsLayout.tsx`: só se for preciso para o eyebrow, sem efeito em outra tela.
4. `shared/styles/avenly-imports.css`: o CSS da tela em andamento nos quatro devices (escolha 8).
5. `shared/styles/avenly.css`: só o texto do comentário da escolha 11.

`ImportPreviewScreen.tsx`, `ImportConflictsScreen.tsx`, `ImportsScreen.tsx`, `ConnectSourceScreen.tsx`, `ImportOriginScreen.tsx`, `ImportEmptyScreen.tsx`, `ImportHistoryCard.tsx`, `features/onboarding/`, o contrato e o BFF não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o 2.I7 novo (escolha 9) e as `notes` do 2.I4 (escolha 11).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal133-*.test.tsx` / `.test.ts`, nas duas molduras:
   - **Tela em andamento:** o título "Importando…" e "Leva alguns minutos.", sem "Fique nesta tela" e, no onboarding, sem o eyebrow "Importação"; os processados e "de N registros" com a conta de hoje (inclusive `AVAILABILITY`); a barra com os mesmos atributos `aria-*` de hoje; o resumo `aria-live` com o texto de hoje; sem o cabeçalho do painel; as linhas na ordem da execução; o estado de cada linha pelas contagens, inclusive a primeira com `pending` sendo a única em andamento; o total na concluída e "<processados> de <total>" na em andamento; os horários sem número em todos os estados; a categoria com `selected: false` fora da lista; a legenda de decisão e de falha; o texto oculto do estado; "Revisar itens" como ação de texto só com item esperando decisão, abrindo os conflitos; sem primário.
   - **O que não muda:** com `interrupted`, a tela é a de hoje ("Isso parou no meio do caminho" e "Continuar"); com `PARTIAL` e com `READY` depois de uma passada, a tela parada de hoje, com "Concluir importação" e a confirmação; a releitura a cada 3 s enquanto `EXECUTING` e a parada quando o banco deixa de dizer `EXECUTING`; a retomada a partir de `PARTIAL` mostra a tela em andamento enquanto `retrying`.
   - **Alvo:** os testes `goal133` da escolha 10.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) toda categoria com `pending` marcada em andamento, e não só a primeira, faz um teste reprovar;
   - (b) os horários com número faz um teste reprovar;
   - (c) o total sem `AVAILABILITY` faz um teste reprovar;
   - (d) a categoria com `selected: false` na lista faz um teste reprovar;
   - (e) a tela nova também com `interrupted` faz um teste reprovar;
   - (f) a barra sem `aria-valuenow` faz um teste reprovar;
   - (g) o 2.I7 de `targets.json` com um passo faz reprovar **o teste `goal133` e `visual-responses.test.mjs`**;
   - (h) o 2.I7 com o andamento num `sessionId` diferente do da sessão, no **caminho** e, numa segunda forma, no **corpo**, faz um teste reprovar;
   - (i) o 2.I7 com `AVAILABILITY` em `pending` e `PAST_APPOINTMENT` com processados (fora da ordem da execução) faz o teste `goal133` reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 9 só troca o texto ou a forma que este Goal muda (o título, a descrição, o cabeçalho do painel que sai da tela em andamento, o painel "O que ainda não entrou" durante a execução, "Revisar itens" como ação de texto). Nenhum ajuste afrouxa asserção sobre os pedidos, a releitura, a interrupção, a retomada, a conclusão, a idempotência, os conflitos ou a troca de conta. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 2.I7` e, para regressão, `--target 2.I1,2.I2,2.I3,2.I4,2.I5,I1,I2`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 132.
   - **A captura de antes é da baseline `94e949d`, feita duas vezes** (lição 1). O Developer guarda os 28 `app.png` de cada captura fora do repositório e registra quais diferem entre as duas, com o número de pixels e o delta por canal. Depois das edições, prova por `cmp` que os 28 `app.png` não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido entre as duas capturas da baseline.
   - O Developer abre os **quatro** `side-by-side.png` do 2.I7 (protótipo × app) e lista no relatório as diferenças que restam e por quê (lição 3).
   - **Medidas:** em cada device, no app e no quadro, com a diferença em px:
     - o topo do título, do número grande e da barra de 8 px;
     - a altura da barra de 8 px;
     - a altura de cada linha da lista;
     - o tamanho do círculo, do anel e do visto;
     - a altura da barra de 4 px.

     Diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`). Mudar a ordem da execução, a conta do total ou o intervalo de releitura exige outra decisão e não entra aqui.
- A tela parada (interrompida, `PARTIAL`, `READY` depois de uma passada, terminal), a confirmação de concluir e as telas de 2.I6, 2.I8, 2.I9 e 2.I10 (conflitos, pendências, confirmação e conclusão).
- O comportamento do chevron e do "Sair" na etapa `importacao`, e a troca de conta durante a execução.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3) e as outras observações abertas dos reviews 116 a 132.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-147** em `PROPOSED`, conforme a escolha 14. Inclui o contraste calculado de cada par de texto novo: `#221E1A` e `#5F574E` sobre `#F7F4EF`, `#716859` sobre `#F7F4EF` (o nome na fila, em 15 px 500, e a legenda, em 13 px). Inclui também o contraste dos gráficos que dizem estado: `#0F5F63` sobre `#E5DED4` nas duas barras, `#2E7D4F` sobre `#F7F4EF` no círculo concluído e `#FFFDFA` sobre `#2E7D4F` no visto. E inclui o alvo de toque de "Revisar itens". Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal133.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal133, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um, com os números;
  - a rodada de cada número, sem atribuir a uma rodada o que outra fez;
  - os controles negativos, a rodada em que rodaram e o teste que reprovou em cada um;
  - o `visual:compare` (percentuais, os quatro lados a lados, as medidas, o ruído das duas capturas da baseline, a regressão e as diferenças que restam);
  - a lista dos testes ajustados e o resultado da busca em `authenticated-matrix.spec.ts` (evidência 7).

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal133 na mesma rodada, para que nenhum deles descreva uma árvore anterior. Um gate rodado pelo IA Loop depois do relatório é registrado com o resultado dele, com o número, nunca como "pendente". O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos três registros acima.

## Validação e ordem

1. Montar a pilha descartável própria e capturar **duas vezes**, na baseline `94e949d`, o `app.png` de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, I1 e I2. Medir o ruído entre as duas capturas. Buscar em `authenticated-matrix.spec.ts` (evidência 7) e conferir as leituras da evidência 5.
2. Implementar a tela em andamento, com os testes `goal133` dela e os ajustes dos testes existentes.
3. Adicionar o alvo 2.I7, corrigir as `notes` do 2.I4 e o comentário de `avenly.css`, e escrever os testes da captura.
4. Rodar o `visual:compare` do 2.I7, abrir os quatro lados a lados, medir, e rodar o de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, I1 e I2 para a regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A importação em andamento em `/onboarding/importacao` igual ao quadro 2.I7 nos 4 devices, salvo as divergências declaradas. Provado em jsdom, pelo `visual:compare`, pelos quatro lados a lados abertos e pelas medidas do §3.5.
2. A tela em andamento com "Importando…" e "Leva alguns minutos.", o número grande, "de N registros", a barra de 8 px com os atributos `aria-*` de hoje, a lista na ordem da execução, o estado de cada linha pelas contagens, os horários sem número, o texto oculto do estado, "Revisar itens" como ação de texto só com item esperando decisão e sem primário, nas duas molduras.
3. O total, os processados, a releitura a cada 3 s, a parada da releitura, a interrupção, a retomada, a conclusão, a confirmação, os conflitos e a troca de conta fazem os mesmos pedidos, com a mesma conta, a mesma regra e as mesmas mensagens. A tela parada não muda.
4. 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, I1 e I2 iguais byte a byte à captura da baseline (`cmp` dos 28 `app.png`), ou com cada diferença dentro do ruído medido entre as duas capturas da baseline.
5. Nenhum pedido ao BFF muda de rota, e nenhum passo de captura grava. O teste da captura prova que 2.I3, 2.I4, 2.I5 e 2.I7 são os únicos donos de `responses` no arquivo, que o 2.I7 só declara os dois `GET` e que não tem passo. O teste `goal133` prova a coerência das respostas com a ordem da execução.
6. Os nove controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/importacao` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440), na origem. O gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo, contraste, foco visível e `prefers-reduced-motion`. A tela em andamento não é alcançada pelo gate. As cores dela são as do quadro, com o contraste de cada par calculado e registrado em D-147. O alvo de toque de "Revisar itens" (24 px no mínimo) é provado em jsdom pelo CSS aplicado. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json` e `scripts/tests/visual-responses.test.mjs`; `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no caso da escolha 12; os três registros da seção "Documentação".
9. D-147 proposta, conforme a escolha 14.

## Plano de execução

1. **WU-01 — A tela em andamento.** As duas capturas da baseline e o ruído, a busca no spec do gate, a tela em andamento em `ImportRunScreen` (cabeçalho, total, lista por estado, rodapé), o CSS nos quatro devices, os testes `goal133` da tela e os ajustes dos testes existentes, nas duas molduras.
2. **WU-02 — O alvo.** O 2.I7 em `targets.json`, as `notes` do 2.I4, o comentário de `avenly.css`, os testes da captura e os testes `goal133` do alvo.
3. **WU-03 — Fidelidade e controles.** O `visual:compare` do 2.I7, com os quatro lados a lados e as medidas, a regressão contra o ruído da baseline e os controles negativos, com as correções de medida que faltarem.
4. **WU-04 a WU-11 — Verificação determinística:** typecheck, lint e testes alvo `goal133`; suíte do frontend e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
5. **WU-12 — Registros.** D-147, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística escritos no registro.
6. **WU-13 — `git diff --check`.**
