# Goal 134 — A importação concluída do onboarding igual ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal133 ACCEPTED](../reviews/133-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.I10

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v158**, inserida depois do 133, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 133. Com 2.I7 aceito, `targets.json` tem 96 alvos, e 17 dos 113 quadros continuam sem alvo. Dos quatro quadros que restam da importação do onboarding (2.I6, 2.I8, 2.I9 e 2.I10), este Goal leva só o 2.I10, a conclusão.

## Baseline aceita

Baseline aceita: `a3cb8f1ec7b4480bb3b5cdea8caaa648b52ab0db`

Goal anterior: 133 — O progresso da importação do onboarding igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal133 já integrado em `main` (origem `e7ed800377674b115c8e1bc8e401f210eae352f6`). Houve **uma rodada**, sem blocker. **D-147** foi aceita: o andamento da importação como o quadro 2.I7, nas duas molduras. A última contagem aceita:

- frontend **194** arquivos e **2685** testes, `goal133` **82** (2 arquivos);
- `visual-responses.test.mjs` **60**;
- `test:gate` **293**;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a importação concluída, na etapa `importacao` do onboarding, fica igual ao quadro 2.I10 nos quatro devices**, salvo as divergências declaradas. A tela é a que `ImportsFlow` mostra quando o estado lido tem `history`, na moldura `onboarding` (`/onboarding/importacao`).

Em `/importacao` (moldura `platform`), a importação concluída continua sendo o quadro I1, já aceito, sem mudança. O bloco de Configurações › Agenda também não muda. O protótipo desenha duas telas diferentes para o mesmo estado: o 2.I10 no onboarding e o I1 em Configurações (evidência 3). Por isso, aqui a regra "as mesmas telas nas duas molduras" (D-084 item 5, D-119, D-145, D-146, D-147) tem uma exceção, declarada em D-148.

A leitura do estado, a releitura do onboarding, a regra de "Continuar", o destino dele e as mensagens de erro continuam com os mesmos pedidos e a mesma regra. Nenhuma rota do BFF muda, e nenhum pedido novo.

**Por que agora.** A fila não tem Goal PLANNED. Dos 17 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 a v157: S1b (cor livre fora de `colorToken`); S5, S6, S8 e S9 (a composição de D-114 e a guarda de navegação); CL8 (outra tela); CL9 (carregamento, e `responses` não sabe atrasar uma resposta); H6 e NT3 (sinal de IA instável que o status não tem); N2, N3 e W3 (dado que o contrato não tem). A 4.3 continua fora (o código de vinculação só vem de `POST /v1/whatsapp/connect`). Da importação do onboarding, o 2.I10 é o único que restou que a captura alcança com uma só leitura fixa e que o contrato cobre por inteiro (evidências 2 e 5). O 2.I6, o 2.I8 e o 2.I9 ficam para as próximas passadas (evidência 8).

**Lições do Goal133, que valem aqui.**

1. A regressão por `cmp` continua não determinística byte a byte (de 8 a 14 de 28 `app.png` diferem entre duas capturas da mesma árvore, por antialiasing). Aqui também, o Developer captura a baseline **duas vezes** antes de editar, mede o ruído entre as duas e julga cada diferença depois das edições contra esse ruído. O relatório traz uma **tabela por imagem** (alvo, device, pixels diferentes, delta máximo por canal, nas duas capturas da baseline e depois), e não só o máximo.
2. O review133 registrou que as mensagens exatas de dois controles negativos não ficaram transcritas em `VALIDATION_GATE.md`. Aqui, cada controle traz no relatório e em VALIDATION_GATE o comando, o arquivo de teste, o nome do teste e **a mensagem de asserção exata** que reprovou.
3. Os quatro `side-by-side.png` são abertos, e as medidas em px do §3.5 são feitas em todos os devices, no app e no quadro.
4. Cada controle de `targets.json` roda pelos **dois** testes: o `goal134` e `scripts/tests/visual-responses.test.mjs`.

## O que a evidência desta passada mostra

Conferido no código da baseline `a3cb8f1` e em `docs/design-reference/claude-design/prototype/project/Onboarding-2-Importacao.dc.html` (quadro 2.I10 "Importação concluída", `data-screen-label="Importação concluída"`), com `Onboarding-2-Importacao-Tablet.dc.html` (retrato e paisagem) e `Onboarding-2-Importacao-Desktop.dc.html`, que também têm o quadro.

1. **2.I10 no mobile.**
   - O topo: sem chevron (um espaço vazio de 40 px), a barra com os dois primeiros segmentos `#0F5F63` e os outros dois `#E5DED4`, e o eyebrow "Sua agenda" da moldura.
   - O corpo (`flex: 1`, `padding: 10px 20px 0`, `justify-content: center`, **26 px** entre os blocos):
     - **o selo:** um quadro de 96 × 96 px, centrado, com um anel de 96 px (borda de 2 px `#2E7D4F`, `opacity: .35`, animação `at-pop .6s ease-out .1s both`) e, no meio, um círculo de 72 px `#2E7D4F` (animação `at-pop .5s ease-out both`) com o visto `#FFFDFA` de 34 px, traço 3;
     - **o texto** (10 px de espaço, centrado, animação `at-reveal .4s … .3s both`): "Importação concluída" em Literata 32 px 500, `line-height: 1.15`, `letter-spacing: -0.015em`, e "Seus dados agora estão na Avenly. A partir de agora, sua agenda é gerenciada por aqui. Alterações futuras no Minha Agenda não serão refletidas." em 15 px, `line-height: 1.5`, `#5F574E`, `text-wrap: pretty`;
     - **as pílulas** (`flex-wrap: wrap`, `justify-content: center`, 8 px de espaço, animação `at-reveal .4s … .5s both`): "12 serviços", "386 clientes", "42 futuros", "1.400 anteriores" e "Horários", cada uma com 32 px de altura, `padding: 0 12px`, raio 999 px, fundo `#EFEAE2`, 13 px 600 e `tabular-nums` (a de Horários sem número e sem `tabular-nums`).
   - O rodapé (`padding: 12px 20px 46px`, 10 px de espaço): "Continuar" com 52 px de altura, raio 14 px, fundo `#0F5F63`, texto `#F7F4EF` em 16 px 600; e abaixo, centrado, "O histórico desta importação fica em Mais › Importação." em 12 px `#716859`.
   - A legenda diz: "O bloco Sua agenda fecha aqui. Como vieram serviços e horários, a etapa seguinte é a demonstração da IA — sem recadastro."
   - No tablet, a nota do rodapé também diz "Mais › Importação". No desktop, diz "Configurações › Importação". O Developer lê os valores de px de cada arquivo para o seu device, sem deduzi-los do mobile.
2. **O app hoje.** `ImportsFlow` (`features/imports/ImportsScreen.tsx`) mostra `ImportHistoryScreen` sempre que o estado lido tem `history`, nas duas molduras.
   - `ImportHistoryScreen` é `ImportsPage` com o título "Importação" e `ImportHistoryCard`: o visto com "Importação concluída" e "Minha Agenda · <data>", uma linha por categoria em `HISTORY_CATEGORY_ORDER` com o importado (os horários com o visto), "N não importados" e a origem que não oferece a categoria, o bloco "N registros com pendência" com a data do aceite, e a nota "A importação do Minha Agenda é feita uma única vez…".
   - No onboarding, `OnboardingImportStep` passa `historyActions={<ImportDoneActions go={go} />}`. `ImportDoneActions` relê o onboarding uma vez (`refresh`, `GET /v1/onboarding`), calcula `stepAfterImport` e mostra o aviso `next.notice` (`role="status"`), o erro (`role="alert"`) e "Continuar", que vai para `next.step`.
   - `stepAfterImport` tem três saídas: sem serviço ativo, "Nenhum serviço importado está ativo…" e `servico-nome`; sem horário ativo, "A importação não trouxe seus horários de atendimento…" e `dias-de-atendimento`; e, com os dois, "Seus serviços e horários foram importados. Agora é só ver sua IA em ação." e `demonstracao-da-ia`.
   - `ImportHistoryCard` também serve a `/importacao` (I1) e ao bloco de Configurações › Agenda.
3. **Duas telas para o mesmo estado.** O I1 (`Mais-WhatsApp-Importacao-Conta.dc.html`, "Configurações · Importação", já aceito, com `responses` de `GET /v1/calendar/imports`) é a importação concluída vista em Configurações: o histórico, por categoria, com as pendências. O 2.I10 é a mesma conclusão vista no fim do bloco "Sua agenda" do onboarding: o selo, o texto, as pílulas e "Continuar". Portar o 2.I10 em `/importacao` desfaria o I1. Então o 2.I10 vale só na moldura `onboarding`, e o I1 continua na moldura `platform`.
4. **O que o contrato traz.** `importHistorySchema` traz `status`, `completedAt`, `counts`, as categorias com `imported`, `failed`, `sourceSupported` e o resto das contagens, e `pendingAcceptance` (`pendingCount`, quando há). Isso basta para as pílulas, a nota de pendência e a de falha (escolha 5). Nada do 2.I10 pede outro dado.
5. **A captura alcança a tela com uma leitura fixa.**
   - A conta `onboarding` da captura (`scripts/lib/visual-seed.mjs`) não importou nada, mas tem o negócio, a agenda, um serviço e horários ativos gravados. Com `GET /v1/calendar/imports` fixo numa `history` `COMPLETED`, `ImportsFlow` mostra a conclusão. A releitura real do onboarding devolve serviço e horários ativos, então `stepAfterImport` sai em `demonstracao-da-ia`.
   - `GET /v1/onboarding` continua real. Antes de editar, o Developer confere no navegador da captura que a tela não lê outro `GET` que precise de resposta fixa. Se ler, só `GET` entra em `responses`, e ele registra o motivo nas `notes`.
   - `responses` aceita o caminho exato do BFF sob `/v1/` (`scripts/lib/visual-responses.mjs`). `scripts/visual-compare.mjs` captura com `reducedMotion: "reduce"`, no protótipo e no app.
   - Hoje `Onboarding-2-Importacao.dc.html` tem quatro donos de `responses` (2.I3, 2.I4, 2.I5 e 2.I7), e `scripts/tests/visual-responses.test.mjs` afirma a lista fechada.
6. **As classes de hoje são compartilhadas.** `.import-history*` serve a `/importacao` e a Configurações › Agenda. `.onboarding-actions` e `.onboarding-note` servem às outras etapas do onboarding. A conclusão no onboarding usa classes próprias para o corpo; o rodapé só ganha regra escopada por ela.
7. **O gate autenticado.** `ONBOARDING_ROUTES` (`e2e/routes.ts`) mede `/onboarding/importacao` na origem, com o marcador "De onde vamos trazer seus dados?" (D-119 (f)). A conta do gate não tem sessão de importação nem histórico. O Goal133 procurou em `e2e/authenticated-matrix.spec.ts` e não achou bloco que toque a importação além da origem. Aqui, o Developer procura de novo por "Importação concluída", "Seus dados agora estão", "Continuar", "historyActions", "import-history" e "stepAfterImport", e registra o resultado.
8. **Por que só o 2.I10.**
   - **2.I6 (conflitos):** o quadro mostra cada item com o valor da Avenly e o do Minha Agenda lado a lado e a decisão no próprio cartão. `ImportItem` só traz a comparação para os horários. Pede outra leitura e outra decisão.
   - **2.I8 (pendências) e 2.I9 (confirmação):** o 2.I8 é a tela parada "Importação quase concluída", com os itens pendentes um a um ("Escova · sem duração", "Corrigir", "Nomear"), o que pede `GET .../categories/:category/items` por categoria e um destino para cada ação. O 2.I9 é a confirmação sobre o 2.I8. Os dois vão juntos numa passada própria.
9. **Testes que citam o que muda.** O Developer procura em `apps/frontend/tests/` por "Importação concluída", "Seus serviços e horários foram importados", "Nenhum serviço importado", "A importação não trouxe", "registros com pendência", "não importados", "A importação do Minha Agenda é feita uma única vez", `ImportDoneActions`, `historyActions`, `import-history` e `onboarding-importacao`, e lista os que montam a conclusão no onboarding.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do 2.I10: os valores inline de px, cor, fonte, raio e espaçamento, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device: `Onboarding-2-Importacao.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop.
2. **Só no onboarding.** O desenho novo vale só quando `ImportsFlow` mostra `history` na moldura `onboarding`. Na moldura `platform`, `ImportHistoryScreen` com `ImportHistoryCard` não muda, nem no DOM, nem na captura (I1). O bloco de Configurações › Agenda não muda. `ImportHistoryCard` não muda. A forma de compor é do Developer: um componente novo em `features/imports/`, escolhido em `ImportsFlow` por `useImportsFrame()`, que recebe `historyActions` no rodapé, é o caminho esperado.
3. **O cabeçalho.** `ImportsPage` sem o cabeçalho da tela (`bare`), e o título "Importação concluída" é o único `h1` da etapa, centrado, em Literata. A descrição é a do quadro (evidência 1), sem data. Sem o eyebrow "Importação": o único eyebrow é o "Sua agenda" da moldura.
4. **O selo.** O anel de 96 px e o círculo de 72 px com o visto de 34 px, todos decorativos (`aria-hidden`). As animações `at-pop` e `at-reveal` só com `prefers-reduced-motion: no-preference`; com `reduce`, tudo fica no estado final, como na captura.
5. **As pílulas e as notas.**
   - Uma pílula por categoria com `imported` maior que 0, na ordem de `HISTORY_CATEGORY_ORDER` (a do quadro: serviços, clientes, futuros, anteriores, horários; depois bloqueios, cancelamentos e faltas). Categoria com `imported` 0 não tem pílula.
   - O texto curto do quadro, com o número em `importCountFormatter`: "N serviços", "N clientes", "N futuros", "N anteriores", "N bloqueios", "N cancelamentos", "N faltas", no singular quando N é 1 ("1 serviço", "1 cliente", "1 futuro", "1 anterior", "1 bloqueio", "1 cancelamento", "1 falta"). Horários de atendimento (`AVAILABILITY`) é sempre "Horários", sem número, como no quadro, em D-146 e em D-147.
   - As pílulas formam uma lista (`ul`) com nome acessível. Para quem usa tecnologia assistiva, cada pílula diz o nome inteiro da categoria (`CATEGORY_LABELS`), por texto visualmente oculto, sem mudar o texto visível.
   - Com `pendingAcceptance.pendingCount` maior que 0, ou com a soma de `failed` das categorias maior que 0, uma nota abaixo das pílulas, centrada, em 13 px `#716859`: "<N> registros com pendência" (o texto do I1, no singular quando N é 1) e "<N> não importados", unidos por " · ". Sem nenhum dos dois, não há nota. O detalhe por categoria continua em `/importacao`.
6. **O rodapé.**
   - "Continuar" com a medida e a cor do quadro, com o mesmo pedido, o mesmo destino e o mesmo texto ocupado ("Abrindo...") de hoje.
   - O aviso de sucesso de `stepAfterImport` ("Seus serviços e horários foram importados…") **não aparece**: o selo e o título já dizem isso, e o quadro não o mostra. Os dois avisos que mudam o destino ("Nenhum serviço importado está ativo…" e "A importação não trouxe seus horários…") continuam acima de "Continuar", com o mesmo texto e o mesmo `role="status"`. O erro continua com `role="alert"`.
   - Abaixo de "Continuar", a nota do quadro, centrada, em 12 px `#716859`, com o caminho que **o app mostra naquela largura**: "Mais › Importação" onde a navegação tem a aba "Mais" e `/importacao` está em `MORE_DESTINATIONS`, e "Configurações › Importação" onde a entrada fica em Configurações. O Developer confere em `shared/layout/navigation.ts` e no `AppShell` em cada largura. Onde o caminho real diferir do quadro, a diferença é divergência declarada.
7. **CSS.** As regras ficam em `shared/styles/avenly-imports.css` (e, só se o rodapé precisar, uma regra escopada em `avenly.css`, onde vivem `.onboarding-actions` e `.onboarding-note`), em classes novas escopadas pela conclusão no onboarding, sem alterar regra que `/importacao`, Configurações › Agenda, a origem, as credenciais, a análise, a prévia, a escolha, o andamento, os conflitos ou as outras etapas do onboarding usam. Movimento só com `prefers-reduced-motion: no-preference`.
8. **Alvo.** `targets.json`, de `Onboarding-2-Importacao.dc.html`, com `account: "onboarding"` e rota `/onboarding/importacao`. O `sessionId` é `visual-compare-import-done`, diferente dos de 2.I3, 2.I4, 2.I5, 2.I7 e I1.
   - **2.I10, novo:** label "Importação concluída", **sem passos**, com `responses` de **um** `GET`, `/v1/calendar/imports`, válido para `importStateSchema`: `right` indisponível (`available: false`) com o mesmo `sessionId` e `completedAt` preenchido, `session` `null`, e `history` `COMPLETED` com `startedAt`, `finishedAt` e `completedAt` preenchidos, `pendingAcceptance` `null` e as categorias do quadro: `SERVICE` 12, `CUSTOMER` 386, `FUTURE_APPOINTMENT` 42, `PAST_APPOINTMENT` 1.400 e `AVAILABILITY` 6 importados, todas com `pending`, `skipped`, `failed` e `needsReview` 0 e `sourceSupported` verdadeiro. `counts` é a soma das categorias (1.846 importados).
   - As `notes` dizem por que a resposta é fixa, que `GET /v1/onboarding` continua real (e por que "Continuar" leva à demonstração) e citam as divergências.
9. **Captura, teste.**
   - `scripts/tests/visual-responses.test.mjs` passa a aceitar 2.I3, 2.I4, 2.I5, 2.I7 e 2.I10 como os únicos donos de `responses` em `Onboarding-2-Importacao.dc.html`, e prova que o 2.I10 só declara o `GET /v1/calendar/imports` e que não tem passo.
   - Um teste `goal134` valida a resposta contra `importStateSchema` e confere: que o `sessionId` é o mesmo no direito e no histórico e difere dos outros alvos da importação; que o histórico está `COMPLETED`, com `session` `null`; que `counts` é a soma das categorias; e que `pendingAcceptance` é `null`.
10. **Gate autenticado.** Pela evidência 7, o marcador de `onboarding-importacao` não muda, porque a origem não muda. Se a busca em `authenticated-matrix.spec.ts` achar um bloco que toque a conclusão no onboarding, o Developer o ajusta **só para provar a tela nova, sem afrouxar asserção**, e registra o ajuste em D-148 e no relatório. Esse arquivo entra no critério 8 só para isso.
11. **Divergências declaradas.**
    - O 2.I10 só no onboarding; em `/importacao`, o I1 (evidência 3).
    - "Horários" vem de seis regras na resposta fixa, sem número, como no quadro; "de 1.846" não aparece no 2.I10, então o total não diverge na tela.
    - A nota do rodapé com o caminho real de cada largura, se diferir do quadro (escolha 6).
    - O preenchimento dos segmentos da barra do topo, derivado por `chapterFraction` (D-104); o "Sair" (D-104); a barra de status e o indicador de início do iPhone.
    - Sem as animações de entrada na captura (`reduce`).

    O Developer registra outras que encontrar nas `notes` do alvo e em D-148, com o motivo.
12. **Decisão.** O Developer propõe **D-148**, por acréscimo, depois das provas, cobrindo: a conclusão no onboarding como o 2.I10 e a exceção à regra das mesmas telas nas duas molduras (o I1 continua em `/importacao`); as pílulas, o texto curto, o singular e o texto oculto; os horários sem número; a nota de pendência e de falha; o aviso de sucesso que sai e os dois que ficam; a nota do rodapé por largura; o alvo 2.I10; e as divergências. Revê em parte D-084 item 5 e D-119 só para este estado. D-084, D-119, D-145, D-146 e D-147 não são editadas.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/imports/ImportsScreen.tsx`: só a escolha, em `ImportsFlow`, da conclusão no onboarding (escolha 2). A leitura do estado, o erro, a sessão viva e a troca de conta não mudam.
2. Um componente novo em `features/imports/` para a conclusão no onboarding (escolhas 3 a 5), se o Developer não a escrever em `ImportsScreen.tsx`.
3. `features/imports/labels.ts`: só os textos curtos da escolha 5, por acréscimo, sem mudar `CATEGORY_ORDER`, `HISTORY_CATEGORY_ORDER`, `CATEGORY_LABELS` nem os rótulos de hoje.
4. `features/onboarding/OnboardingImportStep.tsx`: só o rodapé (escolha 6). A releitura, `stepAfterImport`, o destino de "Continuar" e o erro não mudam. `OnboardingRuntime.tsx` não muda.
5. `shared/styles/avenly-imports.css` (e, só se o rodapé precisar, uma regra escopada em `avenly.css`): o CSS da conclusão no onboarding nos quatro devices (escolha 7).

`ImportHistoryCard.tsx`, `ImportRunScreen.tsx`, `ImportPreviewScreen.tsx`, `ImportConflictsScreen.tsx`, `ConnectSourceScreen.tsx`, `ImportOriginScreen.tsx`, `ImportEmptyScreen.tsx`, `ImportsLayout.tsx`, `features/settings/`, o contrato e o BFF não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o 2.I10 novo (escolha 8). Os outros alvos não mudam.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 9.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal134-*.test.tsx` / `.test.ts`:
   - **Conclusão no onboarding:** o título "Importação concluída" como único `h1`, a descrição do quadro, sem o eyebrow "Importação" e sem `ImportHistoryCard`; o selo `aria-hidden`; uma pílula por categoria com `imported` maior que 0, na ordem de `HISTORY_CATEGORY_ORDER`, com o texto curto, o singular e o texto oculto; "Horários" sem número; a categoria com `imported` 0 sem pílula; a nota com pendência, com falha, com as duas e sem nenhuma; o aviso de sucesso ausente; os dois avisos de destino presentes, com o texto de hoje; o erro com `role="alert"`; "Continuar" indo para o destino de `stepAfterImport` e com "Abrindo..." ocupado; a nota do rodapé.
   - **O que não muda:** na moldura `platform`, com `history`, `ImportHistoryScreen` e `ImportHistoryCard` como hoje (o título "Importação", as linhas, a pendência e a nota de hoje), sem a tela nova; sem `history`, as outras telas como hoje; a releitura do onboarding uma vez.
   - **Alvo:** os testes `goal134` da escolha 9.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 9.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) uma pílula para categoria com `imported` 0 faz um teste reprovar;
   - (b) os horários com número faz um teste reprovar;
   - (c) o aviso de sucesso visível faz um teste reprovar;
   - (d) o aviso de `servico-nome` oculto faz um teste reprovar;
   - (e) a tela nova também na moldura `platform` faz um teste reprovar;
   - (f) a nota sem a pendência, com `pendingCount` maior que 0, faz um teste reprovar;
   - (g) o 2.I10 de `targets.json` com um passo faz reprovar **o teste `goal134` e `visual-responses.test.mjs`**;
   - (h) o 2.I10 com `counts` diferente da soma das categorias faz o teste `goal134` reprovar;
   - (i) o 2.I10 com um segundo `GET` em `responses` faz reprovar **o teste `goal134` e `visual-responses.test.mjs`**.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 2).
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 9 só troca o texto ou a forma que este Goal muda no onboarding (o título, o cartão do histórico, o aviso de sucesso). Nenhum ajuste afrouxa asserção sobre os pedidos, a releitura, o destino de "Continuar", o erro ou a moldura `platform`. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 2.I10` e, para regressão, `--target 2.I1,2.I2,2.I3,2.I4,2.I5,2.I7,I1,I2`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 133.
   - **A captura de antes é da baseline `a3cb8f1`, feita duas vezes** (lição 1). O Developer guarda os 32 `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que os 32 `app.png` não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido entre as duas capturas da baseline, na tabela por imagem.
   - O Developer abre os **quatro** `side-by-side.png` do 2.I10 (protótipo × app) e lista no relatório as diferenças que restam e por quê (lição 3).
   - **Medidas:** em cada device, no app e no quadro, com a diferença em px:
     - o topo do anel, do título, da primeira linha de pílulas e de "Continuar";
     - o tamanho do anel, do círculo e do visto;
     - a altura de uma pílula e de "Continuar";
     - a distância entre "Continuar" e a nota do rodapé.

     Diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`). Mudar `stepAfterImport`, a ordem do onboarding ou o destino de "Continuar" exige outra decisão e não entra aqui.
- A importação concluída em `/importacao` (I1) e em Configurações › Agenda, e `ImportHistoryCard`.
- As telas de 2.I6, 2.I8 e 2.I9 (conflitos, pendências e confirmação), a tela parada e o andamento.
- O comportamento do chevron e do "Sair" na etapa `importacao`.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3) e as outras observações abertas dos reviews 116 a 133.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-148** em `PROPOSED`, conforme a escolha 12. Inclui o contraste calculado de cada par de texto novo: `#221E1A` e `#5F574E` sobre `#F7F4EF`; `#716859` sobre `#F7F4EF` (a nota do rodapé, em 12 px, e a nota de pendência, em 13 px); `#221E1A` sobre `#EFEAE2` (a pílula, em 13 px 600); e `#F7F4EF` sobre `#0F5F63` ("Continuar"). Inclui também `#FFFDFA` sobre `#2E7D4F` (o visto) e diz que o selo é decorativo. E inclui o alvo de toque de "Continuar". Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal134.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal134, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um, com os números;
  - a rodada de cada número, sem atribuir a uma rodada o que outra fez;
  - os controles negativos, a rodada em que rodaram, o teste que reprovou e a mensagem de asserção exata de cada um;
  - o `visual:compare` (percentuais, os quatro lados a lados, as medidas, a tabela por imagem do ruído das duas capturas da baseline e da regressão, e as diferenças que restam);
  - a lista dos testes ajustados e o resultado da busca em `authenticated-matrix.spec.ts` (evidência 7).

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal134 na mesma rodada, para que nenhum deles descreva uma árvore anterior. Um gate rodado pelo IA Loop depois do relatório é registrado com o resultado dele, com o número, nunca como "pendente". O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos três registros acima.

## Validação e ordem

1. Montar a pilha descartável própria e capturar **duas vezes**, na baseline `a3cb8f1`, o `app.png` de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, I1 e I2. Medir o ruído entre as duas capturas, por imagem. Buscar em `authenticated-matrix.spec.ts` (evidência 7) e conferir as leituras da evidência 5.
2. Implementar a conclusão no onboarding, com os testes `goal134` dela e os ajustes dos testes existentes.
3. Adicionar o alvo 2.I10 e escrever os testes da captura.
4. Rodar o `visual:compare` do 2.I10, abrir os quatro lados a lados, medir, e rodar o de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, I1 e I2 para a regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A importação concluída em `/onboarding/importacao` igual ao quadro 2.I10 nos 4 devices, salvo as divergências declaradas. Provado em jsdom, pelo `visual:compare`, pelos quatro lados a lados abertos e pelas medidas do §3.5.
2. A conclusão no onboarding com "Importação concluída" como único `h1`, a descrição do quadro, o selo decorativo, as pílulas por categoria importada com o texto curto, o singular e o texto oculto, "Horários" sem número, a nota de pendência e de falha só quando há, o aviso de sucesso ausente, os dois avisos de destino presentes, "Continuar" e a nota do rodapé com o caminho real da largura.
3. A leitura do estado, a releitura do onboarding, o destino de "Continuar", o texto ocupado e o erro fazem os mesmos pedidos, com a mesma regra e as mesmas mensagens. Em `/importacao`, a conclusão continua sendo o I1, sem mudança.
4. 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, I1 e I2 iguais byte a byte à captura da baseline (`cmp` dos 32 `app.png`), ou com cada diferença dentro do ruído medido entre as duas capturas da baseline, mostrada na tabela por imagem.
5. Nenhum pedido ao BFF muda de rota, e nenhum passo de captura grava. O teste da captura prova que 2.I3, 2.I4, 2.I5, 2.I7 e 2.I10 são os únicos donos de `responses` no arquivo, que o 2.I10 só declara o `GET /v1/calendar/imports` e que não tem passo. O teste `goal134` prova a coerência da resposta.
6. Os nove controles negativos reprovam, com a mensagem exata registrada, e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/importacao` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440), na origem. O gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo, contraste, foco visível e `prefers-reduced-motion`. A conclusão no onboarding não é alcançada pelo gate. As cores dela são as do quadro, com o contraste de cada par calculado e registrado em D-148. O alvo de toque de "Continuar" (52 px) é provado em jsdom pelo CSS aplicado e pelas medidas do §3.5. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json` e `scripts/tests/visual-responses.test.mjs`; `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no caso da escolha 10; os três registros da seção "Documentação".
9. D-148 proposta, conforme a escolha 12.

## Plano de execução

1. **WU-01 — A conclusão no onboarding.** As duas capturas da baseline e o ruído por imagem, a busca no spec do gate, a conclusão no onboarding (a escolha em `ImportsFlow`, o selo, o título, as pílulas, as notas e o rodapé de `OnboardingImportStep`), o CSS nos quatro devices, os testes `goal134` da tela e os ajustes dos testes existentes, nas duas molduras.
2. **WU-02 — O alvo.** O 2.I10 em `targets.json`, os testes da captura e os testes `goal134` do alvo.
3. **WU-03 — Fidelidade e controles.** O `visual:compare` do 2.I10, com os quatro lados a lados e as medidas, a regressão contra o ruído da baseline e os controles negativos, com as correções de medida que faltarem.
4. **WU-04 a WU-11 — Verificação determinística:** typecheck, lint e testes alvo `goal134`; suíte do frontend e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
5. **WU-12 — Registros.** D-148, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística escritos no registro.
6. **WU-13 — `git diff --check`.**
