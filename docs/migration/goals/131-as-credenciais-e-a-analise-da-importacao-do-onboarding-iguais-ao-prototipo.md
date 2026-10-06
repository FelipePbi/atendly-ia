# Goal 131 — As credenciais e a análise da importação do onboarding iguais ao protótipo

**Status: READY.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal130 ACCEPTED](../reviews/130-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.I2, 2.I3

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v155**, inserida depois do 130, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 130. Com o 2.7 aceito, `targets.json` tem 91 alvos, e 22 dos 113 quadros continuam sem alvo. Dos nove quadros da importação do onboarding (2.I2 a 2.I10), este Goal leva só os dois que vêm logo depois da origem aceita (2.I1).

## Baseline aceita

Baseline aceita: `77b1f1e49597a2db7c6cd19bd43c82e7f1e88a87`

Goal anterior: 130 — Os horários por dia do onboarding iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal130 já integrado em `main` (origem `856d4e8d5416607513b728733a34d789990e9a1f`). Houve **uma rodada**: o review teve 3 blockers só de documentação, e o IA Loop aceitou a rodada com as correções feitas no fechamento, só em `docs/migration/`. **D-144** foi aceita: os horários por dia do onboarding como o quadro 2.7, e o horário-base capturado recolhido, como o 2.6. A última contagem aceita:

- frontend **185** arquivos e **2464** testes, `goal130` **33** (2 arquivos);
- `visual-responses.test.mjs` **58**;
- `test:gate` **291**;
- `validate:core` com saída 0, 15 passos passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` com saída 0, e o gate autenticado em **305** `passed`, sem retentativa.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **as credenciais do Minha Agenda ficam iguais ao quadro 2.I2, e a análise fica igual ao quadro 2.I3, nos quatro devices**, salvo as divergências declaradas. As duas telas continuam em `/onboarding/importacao` e em `/importacao`, porque as duas molduras mostram as mesmas telas (D-084 item 5, D-119). O envio continua com os mesmos pedidos, a mesma validação e as mesmas mensagens. A análise não mostra número que a leitura não traga. Nenhuma rota do BFF muda, e nenhum pedido novo.

**Por que agora.** A fila não tem Goal PLANNED. Dos 22 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 a v154: S1b (cor livre fora de `colorToken`); S5, S6, S8 e S9 (a composição de D-114 e a guarda de navegação); CL8 (outra tela); CL9 (carregamento, e `responses` não sabe atrasar uma resposta); H6 e NT3 (sinal de IA instável que o status não tem); N2, N3 e W3 (dado que o contrato não tem). A 4.3 continua fora (o código de vinculação só vem de `POST /v1/whatsapp/connect`). A v154 deixou a importação do onboarding para as próximas passadas, por serem nove quadros sobre telas que `/importacao` também usa. Esta passada a leu em fatias (evidências 1 a 6). As credenciais e a análise são a primeira fatia: vêm logo depois da origem, a captura as alcança sem escrita, e o contrato já tem tudo, salvo as contagens da análise, que viram divergência declarada.

## O que a evidência desta passada mostra

Conferido no código da baseline `77b1f1e` e em `docs/design-reference/claude-design/prototype/project/Onboarding-2-Importacao.dc.html` (quadros 2.I2 "Login no Minha Agenda · com teclado" e 2.I3 "Analisando · animado"), com `Onboarding-2-Importacao-Tablet.dc.html` (retrato e paisagem) e `Onboarding-2-Importacao-Desktop.dc.html`.

1. **2.I2 no mobile.**
   - O topo: o chevron de voltar (40 px), a barra com o primeiro segmento `#0F5F63`, o segundo `#DCECEB` com 32 % preenchido e os outros dois `#E5DED4`, e o eyebrow "Sua agenda" (12 px 600, `letter-spacing: .08em`, maiúsculas, `#0F5F63`).
   - O corpo (`padding: 6px 20px 0`, 14 px entre os blocos). O cabeçalho (6 px de espaço): "Entre no Minha Agenda" como `h1`, em Literata 28 px 500, `line-height: 1.2`, `letter-spacing: -0.01em`; e "Usamos seu acesso só para ler seus dados durante a importação. Ele não fica guardado." em 14 px, `line-height: 1.4`, `#5F574E`.
   - Dois campos (6 px entre rótulo e campo): rótulo em 13 px 600 `#5F574E` ("E-mail do Minha Agenda" e "Senha"); campo de 52 px, raio 14 px, borda de 1 px `#D6CEC2`, fundo `#FFFDFA`, `padding: 0 16px`, texto 16 px. O campo de senha está em foco no quadro (borda de 1,5 px `#0F5F63` e anel de 3 px `#DCECEB`) e tem, à direita, o olho de 20 px em `#716859`.
   - O rodapé (`padding: 10px 20px 10px`): "Analisar meus dados" (primário, 52 px, raio 14 px, `#0F5F63`, texto `#F7F4EF` 16 px 600).
   - O teclado do iOS ocupa a parte de baixo do quadro mobile.
   - A legenda: "O CTA descreve o próximo passo (“analisar”), não “entrar”. Credenciais não persistem após a migração."
2. **2.I3 no mobile.**
   - O topo igual ao do 2.I2, com o segundo segmento 38 % preenchido e **sem** o chevron (o espaço de 40 px fica vazio).
   - O corpo (`padding: 10px 20px 0`, 24 px entre os blocos). O cabeçalho (8 px de espaço): "Analisando seus dados…" em Literata 28 px 500; "Nada muda na Avenly até você confirmar." em 15 px, `line-height: 1.45`, `#5F574E`.
   - Uma barra de 6 px, raio 3 px, trilho `#E5DED4`, preenchimento `#0F5F63` que cresce uma vez (`at-grow`, 4,5 s).
   - O cartão: raio 16 px, borda de 1 px `#E5DED4`, fundo `#FFFDFA`, `overflow: hidden`. Cinco linhas (`padding: 16px`, 14 px de espaço, divisória de 1 px `#E5DED4` a partir da segunda): ícone de 22 px em `#0F5F63`, o nome da categoria (15 px 600) e, à direita, a contagem em Literata 20 px 500, `tabular-nums`. A ordem: Serviços (12), Clientes (386), Agendamentos futuros (42), Atendimentos anteriores (1.400) e Horários de atendimento. A última linha ainda está lendo: ícone e nome em `#716859` e `#5F574E`, e no lugar do número uma pílula de 54 × 14 px com brilho que corre (`at-shimmer`). As linhas aparecem uma a uma (`at-reveal`), e os números depois (`at-pop`).
   - Abaixo do cartão, centrado: "Isso pode levar alguns minutos." em 13 px `#716859`.
   - A legenda: "Em vez de um spinner, as categorias vão aparecendo com as contagens. O usuário entende o que está sendo lido enquanto espera."
3. **O app hoje.**
   - As credenciais são a fase `credentials` de `ConnectSourceScreen` (`features/imports/`), depois de "Continuar" na origem (`ImportOriginScreen`, 2.I1, D-119 (d)). `ImportsPage` mostra o título "Importar do Minha Agenda" (ou "Conectar outra conta do Minha Agenda" ao trocar de conta), a descrição "Copie seus dados do Minha Agenda uma única vez. Nada muda na Avenly até você confirmar." e, na moldura do onboarding, o eyebrow "Importação" acima do título (`ImportsPage` o mostra quando há `description`). Dentro do formulário, o subtítulo `h2` "Entre no Minha Agenda", o texto "Usamos seu e-mail e senha só para esta importação. Eles não ficam guardados: são apagados assim que você concluir a importação.", os rótulos "E-mail do Minha Agenda" e "Senha do Minha Agenda", e os botões "Cancelar" (só ao trocar de conta) e "Conectar Minha Agenda" ("Conectando..." durante o envio). O envio chama `calendar.connectIntegration`, `migration.startImport` e `migration.getImportState`, e trata os `MINHA_AGENDA_*` (Goal060, Goal082, Goal120).
   - A análise é a fase `working` de `ImportPreviewScreen`: título "Analisando seus dados…", descrição "Nada muda na Avenly até você confirmar.", e um painel `aria-busy` com "Isso pode levar alguns minutos." **acima** de quatro linhas de esqueleto (`imports-skeleton-rows`, as quatro primeiras de `CATEGORY_ORDER`, sem número).
4. **A análise não traz contagem enquanto corre.** `ImportPreviewService.recordAnalysis` (`apps/scheduling-service/src/modules/migrations/import-preview-service.ts`) lê a origem inteira e só depois grava os itens e as categorias da sessão, de uma vez. As categorias da sessão viva (`GET /v1/calendar/imports`, `session.categories`) vêm da contagem de `ImportItem` (`import-completion-service.ts`). Na primeira análise, a leitura não traz número por categoria até a análise terminar. Numa reanálise, traria os números da análise anterior, que não são o que está sendo lido. Por isso este Goal mostra as linhas **sem número** e não mexe no Scheduling.
5. **A captura alcança as duas telas sem escrita.**
   - O 2.I2: `/onboarding/importacao` na conta de onboarding, que não tem sessão de importação (o 2.I1 já é capturado assim). Os passos de captura aceitam `click`, `clickRole`, `fill`, `press` e `waitFor` (`scripts/visual-compare.mjs`): `clickRole` em "Continuar" leva às credenciais, e `fill` preenche os dois campos. Nenhum passo envia o formulário.
   - O 2.I3: a mesma rota, com uma resposta fixa de `GET /v1/calendar/imports` (`importStateSchema`): `right` disponível, `history` `null` e `session` em `ANALYZING`, `previewVersion` 0, `interrupted` `false`, `lastError` `null`, sem categorias. `ImportsFlow` mostra `ImportPreviewScreen`; em `ANALYZING`, a tela só relê `GET /v1/calendar/imports` (`pollUntilSettled`), que continua devolvendo a mesma resposta. Nenhum pedido de escrita sai. Hoje `Onboarding-2-Importacao.dc.html` não tem dono de `responses`, e `scripts/tests/visual-responses.test.mjs` afirma a lista fechada dos alvos que declaram `responses`, por arquivo.
6. **2.I4 a 2.I10, para as próximas passadas.** A prévia, a escolha, os conflitos, a execução, as pendências, a confirmação e a conclusão dependem de `.../preview`, `.../categories/:category/items` e `.../progress` com respostas fixas coerentes entre si. Não entram aqui.
7. **O gate autenticado.** `ONBOARDING_ROUTES` (`e2e/routes.ts`) mede `/onboarding/importacao` com o marcador "De onde vamos trazer seus dados?" (D-119 (f)), a origem. A conta do gate não tem sessão de importação. `/importacao` está fora de `AUTHENTICATED_ROUTES`. **Lição do Goal130:** a evidência 5 dele dizia que o gate não alcançava a tela nova, mas `e2e/authenticated-matrix.spec.ts` tinha um bloco próprio da rota que clicava num controle. Antes de editar, o Developer lê `authenticated-matrix.spec.ts` inteiro e registra se algum bloco toca `/onboarding/importacao`, "Continuar" da origem ou as credenciais.
8. **Testes que citam o que muda.** `goal020-a11y`, `goal020-import-preview`, `goal020-imports-entry`, `goal020-reachability`, `goal020-shell-invariant`, `goal060-connect-source`, `goal061-import-async`, `goal066-onboarding-importacao`, `goal082-connect-source-client-rejected`, `goal105-importacao`, `goal112-configuracoes-importacao` e `goal120-importacao-recusas` citam "Entre no Minha Agenda", "Senha do Minha Agenda", "Conectar Minha Agenda", "Analisando seus dados" ou `imports-skeleton`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS de 2.I2 e 2.I3: os valores inline de px, cor, fonte, raio e espaçamento. Usa cada arquivo para o seu device: `Onboarding-2-Importacao.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop, lendo os valores de cada arquivo, sem deduzi-los do mobile. A origem (2.I1), a entrada de Configurações (I2), o histórico (I1) e as telas seguintes da importação não mudam, nem no DOM, nem na captura.
2. **As duas molduras, o mesmo conteúdo.** As credenciais e a análise mudam em `/onboarding/importacao` e em `/importacao`, porque são as mesmas telas (D-084 item 5). Na moldura `platform`, a composição de D-119 (b) não muda: a barra "Importação" é o `h1`, e o título da tela é `h2`. Não nasce variante da tela por moldura.
3. **As credenciais (2.I2).**
   - O título da tela passa a "Entre no Minha Agenda". Ao trocar de conta, continua "Conectar outra conta do Minha Agenda", com o "Cancelar" de hoje.
   - A descrição passa a "Usamos seu acesso só para ler seus dados durante a importação. Ele é apagado assim que você concluir a importação." A segunda frase do quadro ("Ele não fica guardado.") não é usada: o acesso fica guardado, cifrado (`IntegrationConnection.credentialsEncrypted`), durante a importação, e a conclusão apaga a conexão (`integrationConnection.deleteMany` em `import-completion-service.ts`), como o texto de hoje já diz. Divergência declarada.
   - Saem o subtítulo `h2` interno, a descrição "Copie seus dados…" e, na moldura do onboarding, o eyebrow "Importação" desta tela: o único eyebrow é o "Sua agenda" da moldura, como no 2.I1. Se `ImportsPage` precisar de uma opção para isso, ela vale só para esta tela e é explicada em D-145.
   - Os rótulos passam a "E-mail do Minha Agenda" e "Senha". Os campos seguem o quadro (52 px, raio 14 px, borda `#D6CEC2`, fundo `#FFFDFA`; em foco, borda `#0F5F63` e anel `#DCECEB`).
   - **Mostrar a senha.** Dentro do campo de senha, à direita, um botão com o olho, nome acessível "Mostrar senha" e `aria-pressed`. Tocar troca o `type` do campo entre `password` e `text`, sem perder o valor nem o foco do campo; o nome passa a "Ocultar senha". Alvo de toque de 24 px no mínimo (o ícone é de 20 px; a área tocável pode ser maior que o ícone).
   - O botão de envio passa a "Analisar meus dados". Durante o envio, "Conectando…" e desabilitado, como hoje.
   - O envio, a validação de cada campo, os pedidos, a ordem deles e as mensagens (inclusive as `MINHA_AGENDA_*` e a recusa do cliente do Goal082) **não mudam**.
4. **A análise (2.I3).**
   - O título e a descrição continuam os de hoje, que já são os do quadro.
   - Abaixo do cabeçalho, a barra do quadro (6 px, raio 3 px, trilho `#E5DED4`, `#0F5F63`). A barra **não** mostra fração: o contrato não dá progresso da análise. É indeterminada: `role="progressbar"` com nome acessível, sem `aria-valuenow`; um trecho que corre no trilho. Com `prefers-reduced-motion: reduce`, nada se move. Divergência declarada: o quadro cresce uma vez até um ponto.
   - O cartão do quadro, com as **cinco** categorias na ordem do quadro: Serviços (`SERVICE`), Clientes (`CUSTOMER`), Agendamentos futuros (`FUTURE_APPOINTMENT`), Atendimentos anteriores (`PAST_APPOINTMENT`) e Horários de atendimento (`AVAILABILITY`), com os nomes de `CATEGORY_LABELS` e os ícones do quadro (do conjunto de `Icon` quando existirem; senão, o SVG do quadro).
   - **Nenhuma linha mostra número** (evidência 4). Todas ficam como a última linha do quadro: no lugar do número, a pílula de 54 × 14 px com o brilho que corre, decorativa (`aria-hidden`). Com `prefers-reduced-motion: reduce`, a pílula fica parada. O nome de cada linha usa a cor da linha que ainda lê no quadro (`#5F574E`) ou a das linhas lidas (`#221E1A`): o Developer escolhe uma para todas e explica em D-145.
   - "Isso pode levar alguns minutos." vai para **abaixo** do cartão, centrado, em 13 px `#716859`.
   - O painel continua `aria-busy="true"`. A leitura em `ANALYZING`, o início da análise em `DRAFT`, o erro, a interrupção e a recusa de prévia obsoleta não mudam.
   - As animações de entrada das linhas (`at-reveal`) são opcionais; se entrarem, respeitam `prefers-reduced-motion`.
5. **CSS.** As regras ficam em `shared/styles/avenly-imports.css` (ou `avenly.css`, onde já estiverem as regras da importação), em classes novas ou escopadas pelas telas, sem alterar regra que a origem, o I1, o I2 ou as telas seguintes usam. `.imports-skeleton-rows` e `.imports-skeleton-row` podem sair se nada mais as usar.
6. **Alvos.** `targets.json`, ambos de `Onboarding-2-Importacao.dc.html`, com `account: "onboarding"` e rota `/onboarding/importacao`:
   - **2.I2, novo:** label "Credenciais Minha Agenda", sem `responses`. Passos: `clickRole` no botão "Continuar" da origem; `fill` no "E-mail do Minha Agenda" com `camila.reis@gmail.com`; `fill` na "Senha" com um valor de oito caracteres. Nenhum passo toca "Analisar meus dados" nem pressiona Enter. As `notes` dizem que o teclado do quadro mobile não é capturado e citam as divergências.
   - **2.I3, novo:** label "Analisando dados", sem passos, com `responses` de um só `GET /v1/calendar/imports` (evidência 5), válido para `importStateSchema`, com `sessionId` `visual-compare-import-analyzing` (diferente do `visual-compare-import` do I1). As `notes` dizem por que as linhas não têm número.
   - O 2.I1 não muda.
7. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar o 2.I3 como único dono de `responses` em `Onboarding-2-Importacao.dc.html`, só com o `GET /v1/calendar/imports` e sem passos, e ganha o teste que prova que o 2.I2 não declara `responses` e que os passos dele só usam `clickRole` em "Continuar" e `fill` nos dois campos. Um teste `goal131` valida a resposta do 2.I3 contra `importStateSchema` e confere `ANALYZING`, `interrupted` `false`, `lastError` `null`, `history` `null` e nenhuma categoria.
8. **Gate autenticado.** Pela evidência 7, o marcador de `onboarding-importacao` não muda, porque a origem não muda. Se a leitura de `authenticated-matrix.spec.ts` achar um bloco que toque as credenciais ou a análise, o Developer o ajusta **só para provar a tela nova, sem afrouxar asserção**, e registra o ajuste em D-145 e no relatório. Esse arquivo entra no critério 8 só para isso.
9. **Divergências declaradas.**
   - O teclado do iOS no 2.I2 mobile, e o campo de senha em foco (a captura preenche, mas o foco depende do último passo).
   - A segunda frase da descrição do 2.I2 (escolha 3).
   - As contagens do 2.I3, que a leitura não traz (escolha 4 e evidência 4); a barra indeterminada no lugar da que cresce.
   - O preenchimento do segundo segmento da barra de progresso, derivado por `chapterFraction` (D-104): 32 % e 38 % nos quadros.
   - O chevron do topo no 2.I3, se a moldura do onboarding o mostrar na etapa `importacao`: o comportamento do chevron nesta etapa não muda neste Goal.
   - O "Sair" do topo abaixo de 1024 px e do rodapé da sidebar (D-104), que os quadros não mostram.
   - A barra de status e o indicador de início do iPhone nos quadros mobile.

   O Developer registra outras que encontrar nas `notes` dos alvos e em D-145, com o motivo.
10. **Decisão.** O Developer propõe **D-145**, por acréscimo, depois das provas, cobrindo as credenciais e a análise nas duas molduras, o texto da descrição, mostrar a senha, a análise sem número e com a barra indeterminada, os alvos 2.I2 e 2.I3 e as divergências. Revê em parte D-119 (item 2 do "Revisar se": o 2.I2 e a análise portados). D-119 não é editada.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/imports/ConnectSourceScreen.tsx`: as credenciais (escolha 3).
2. `features/imports/ImportPreviewScreen.tsx`: só a fase `working` (escolha 4).
3. `features/imports/ImportsLayout.tsx`: só se for o caminho para tirar o eyebrow "Importação" desta tela (escolha 3), sem efeito em outra tela.
4. `features/imports/labels.ts`: só se faltar um nome de categoria ou de ícone.
5. `shared/styles/avenly-imports.css` (e `avenly.css` só onde as regras da importação já estiverem): o CSS das duas telas nos quatro devices (escolha 5).

`ImportOriginScreen.tsx`, `ImportEmptyScreen.tsx`, `ImportHistoryCard.tsx`, `ImportRunScreen.tsx`, `ImportConflictsScreen.tsx`, `ImportsScreen.tsx`, `features/onboarding/`, o contrato e o BFF não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o 2.I2 e o 2.I3 novos (escolha 6).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 7.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal131-*.test.tsx` / `.test.ts`, nas duas molduras:
   - **Credenciais:** "Continuar" na origem mostra o `h1` (onboarding) ou `h2` (Configurações) "Entre no Minha Agenda", a descrição da escolha 3, os rótulos "E-mail do Minha Agenda" e "Senha", e "Analisar meus dados"; sem o subtítulo interno, sem "Copie seus dados…" e, no onboarding, sem o eyebrow "Importação"; ao trocar de conta, o título "Conectar outra conta do Minha Agenda" e "Cancelar".
   - **Mostrar a senha:** o botão muda o `type` do campo e o nome acessível, com `aria-pressed`, sem perder o valor; começa oculta.
   - **Envio:** "Analisar meus dados" com os campos válidos chama `connectIntegration` e `startImport` uma vez cada, na ordem de hoje; a validação de cada campo vazio e uma mensagem `MINHA_AGENDA_*` continuam as de hoje; "Conectando…" durante o envio.
   - **Análise:** com a sessão em `ANALYZING`, as cinco linhas na ordem do quadro, nenhum número em nenhuma linha (inclusive quando `session.categories` traz contagens de uma análise anterior), a barra `progressbar` sem `aria-valuenow`, "Isso pode levar alguns minutos." depois do cartão, o painel `aria-busy`; nenhum pedido além de `getImportState`.
   - **Alvos:** a resposta do 2.I3 válida para `importStateSchema`, com os campos da escolha 7; o 2.I2 sem `responses`, com só os três passos permitidos.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 7.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a análise que mostra o número de `session.categories` numa linha faz um teste reprovar;
   - (b) a barra da análise com `aria-valuenow` faz um teste reprovar;
   - (c) "Mostrar senha" que não troca o `type` do campo faz um teste reprovar;
   - (d) o envio que deixa de chamar `startImport` faz um teste reprovar;
   - (e) o 2.I2 de `targets.json` com um passo que toca "Analisar meus dados" (ou `press` Enter) faz o teste da captura reprovar;
   - (f) o 2.I3 de `targets.json` com uma resposta a mais, ou com um método que não seja `GET`, faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 8 só troca o texto, a ordem ou a ação que este Goal muda (por exemplo, "Analisar meus dados" no lugar de "Conectar Minha Agenda", "Senha" no lugar de "Senha do Minha Agenda", o título no lugar do subtítulo). Nenhum ajuste afrouxa asserção sobre os pedidos, a validação, as mensagens, a idempotência, a retomada ou a troca de conta. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 2.I2,2.I3` e, para regressão, `--target 2.I1,I1,I2`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 130.
   - Antes de editar, o Developer guarda o `app.png` de 2.I1, I1 e I2. Depois, mostra que não mudaram, ou explica cada diferença.
   - O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`). Contagem durante a análise exige mudar o Scheduling e o contrato e não entra aqui.
- A origem (2.I1), o I1, o I2 e as telas de 2.I4 a 2.I10 (prévia, escolha, conflitos, execução, pendências, confirmação e conclusão).
- O comportamento do chevron e do "Sair" na etapa `importacao`.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3) e as outras observações abertas dos reviews 116 a 130.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-145** em `PROPOSED`, conforme a escolha 10. Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal131.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal131, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um; um gate que o IA Loop roda depois do relatório é registrado com o resultado dele, nunca como "não executado" nem "pendente";
  - a rodada de cada número, sem atribuir a uma rodada o que outra fez;
  - os controles negativos e a rodada em que rodaram;
  - o `visual:compare` (alvos, percentuais, regressão e diferenças que restam);
  - a lista dos testes ajustados e o resultado da leitura de `authenticated-matrix.spec.ts` (evidência 7).

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal131 na mesma rodada, para que nenhum deles descreva uma árvore anterior. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos três registros acima.

## Validação e ordem

1. Montar a pilha descartável própria e capturar a regressão de antes, sem editar nada. Ler `authenticated-matrix.spec.ts` (evidência 7).
2. Implementar as credenciais, com os testes `goal131` delas e os ajustes dos testes existentes.
3. Implementar a análise, com os testes `goal131` dela e os ajustes dos testes existentes.
4. Adicionar os alvos 2.I2 e 2.I3 e os testes da captura.
5. Rodar o `visual:compare` de 2.I2 e 2.I3, e o de 2.I1, I1 e I2 para regressão.
6. Rodar os controles negativos do §3.3 e revertê-los.
7. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. As credenciais em `/onboarding/importacao` iguais ao quadro 2.I2 nos 4 devices, e a análise igual ao quadro 2.I3 nos 4 devices, salvo as divergências declaradas. Provado em jsdom e pelo `visual:compare`.
2. As credenciais com o título "Entre no Minha Agenda", a descrição da escolha 3, "E-mail do Minha Agenda", "Senha", mostrar e ocultar a senha e "Analisar meus dados", nas duas molduras; ao trocar de conta, o título e o "Cancelar" de hoje. O envio faz os mesmos pedidos, na mesma ordem, com a mesma validação e as mesmas mensagens.
3. A análise com a barra indeterminada, as cinco categorias na ordem do quadro, nenhum número em nenhuma linha e "Isso pode levar alguns minutos." abaixo do cartão; a leitura em `ANALYZING`, o início, o erro, a interrupção e a prévia obsoleta como hoje.
4. A origem (2.I1), o I1 e o I2 iguais à captura de antes, ou com cada diferença explicada; as telas de 2.I4 a 2.I10 não mudam.
5. Nenhum pedido ao BFF muda de rota, e nenhum passo de captura envia o formulário. O teste da captura prova que o 2.I3 só declara o `GET /v1/calendar/imports` e que o 2.I2 não declara `responses` e só tem os três passos permitidos.
6. Os seis controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/importacao` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440), na origem; o gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo, contraste, foco visível e `prefers-reduced-motion`. As credenciais e a análise não são alcançadas pelo gate: as cores delas são as do quadro, com o contraste de cada par de texto calculado e registrado em D-145 (inclusive `#5F574E` sobre `#F7F4EF` e `#FFFDFA`, `#716859` sobre `#F7F4EF` e `#F7F4EF` sobre `#0F5F63`), e o alvo de toque de "Mostrar senha" (24 px no mínimo) é provado em jsdom pelo CSS aplicado ou medido no `visual:compare`. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json` e `scripts/tests/visual-responses.test.mjs`; `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no caso da escolha 8; os três registros da seção "Documentação".
9. D-145 proposta, conforme a escolha 10.

## Plano de execução

1. **WU-01 — As credenciais.** O título, a descrição, os rótulos, mostrar a senha, "Analisar meus dados", o CSS nos quatro devices, os testes `goal131` das credenciais e os ajustes dos testes existentes, nas duas molduras.
2. **WU-02 — A análise.** A barra indeterminada, o cartão das cinco categorias sem número, a nota abaixo do cartão, o CSS nos quatro devices, os testes `goal131` da análise e os ajustes dos testes existentes.
3. **WU-03 — Captura, fidelidade, provas e registros.** Os alvos 2.I2 e 2.I3, os testes da captura, o `visual:compare` com a regressão, a leitura do spec do gate, os controles negativos, D-145, CURRENT_STATE e VALIDATION_GATE.
4. **Verificação determinística:**
   - typecheck, lint, testes alvo `goal131`;
   - suíte do frontend, testes de ferramenta e `test:gate`;
   - `validate:core`, `validate:ui` e `validate:integration`;
   - `git diff --check`.
