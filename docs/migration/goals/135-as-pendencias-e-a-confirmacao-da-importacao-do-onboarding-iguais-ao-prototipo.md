# Goal 135 — As pendências e a confirmação da importação do onboarding iguais ao protótipo

**Status: READY.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal134 ACCEPTED](../reviews/134-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 2.I8, 2.I9

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v159**, inserida depois do 134, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 134. Com 2.I10 aceito, `targets.json` tem 97 alvos, e 16 dos 113 quadros continuam sem alvo. Dos três quadros que restam da importação do onboarding (2.I6, 2.I8 e 2.I9), este Goal leva o 2.I8 e o 2.I9 juntos, como o planejamento da v158 previu: o 2.I9 é a confirmação aberta sobre o 2.I8.

## Baseline aceita

Baseline aceita: `0939249d6e38e6db8c4cf201f0ce7bfac1bd9dce`

Goal anterior: 134 — A importação concluída do onboarding igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal134 já integrado em `main` (origem `d946acdc11cb40144f42f9b9eef58de05fcb80db`). Houve **uma rodada**, sem blocker. **D-148** foi aceita: a conclusão no onboarding como o quadro 2.I10, só na moldura `onboarding`. A última contagem aceita:

- frontend **196** arquivos e **2737** testes, `goal134` **52** (2 arquivos);
- `visual-responses.test.mjs` **61**;
- `test:gate` **294**;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a importação executada que ainda pode ser concluída (sessão `READY` ou `PARTIAL` depois da execução, sem passada em curso) fica igual ao quadro 2.I8, e a confirmação da conclusão com itens não importados fica igual ao quadro 2.I9, nos quatro devices**, salvo as divergências declaradas. As duas telas são de `ImportRunScreen` e valem nas duas molduras (`/onboarding/importacao` e `/importacao`), como a regra das mesmas telas nas duas molduras (D-084 item 5, D-119, D-145, D-146, D-147). O protótipo de Configurações (`Mais-WhatsApp-Importacao-Conta.dc.html`) não desenha esse estado, então não há a exceção de D-148 aqui.

A regra da conclusão não muda: os mesmos pedidos, o mesmo corpo (`{}` sem pendência e `{acceptPending:true}` só depois da confirmação), a mesma chave de idempotência por corpo, o mesmo guarda de dupla submissão, a mesma reação a `IMPORT_PENDING_ACCEPTANCE_REQUIRED`, a mesma retomada ("Importar os N que faltam") e as mesmas mensagens de erro. Nenhuma rota do BFF muda. O único pedido novo é uma leitura que já existe no contrato e já é feita pela tela de conflitos: `GET /v1/calendar/imports/:sessionId/categories/:category/items` com `status=NEEDS_REVIEW` (evidência 4).

**Por que agora.** A fila não tem Goal PLANNED. Fora do onboarding, os 13 quadros sem alvo continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 a v158: S1b (cor livre fora de `colorToken`); S5, S6, S8 e S9 (a composição de D-114 e a guarda de navegação); CL8 (outra tela); CL9 (carregamento, e `responses` não sabe atrasar uma resposta); H6 e NT3 (sinal de IA instável que o status não tem); N2, N3 e W3 (dado que o contrato não tem); 4.3 (o código de vinculação só vem de `POST /v1/whatsapp/connect`). Da importação do onboarding, o 2.I8 e o 2.I9 são alcançáveis só com leituras fixas e um clique que não grava (evidência 6), e o contrato já tem a lista dos itens que precisam de revisão (evidência 4). O 2.I6 fica para a próxima passada (evidência 9).

**Lições dos Goals 133 e 134, que valem aqui.**

1. A regressão por `cmp` continua não determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar (o review134 registrou que a terceira captura teria fechado a dúvida do 2.I5 em tablet retrato), mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído. O relatório traz a **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal, entre as capturas da baseline e depois).
2. Cada controle negativo traz no relatório e em VALIDATION_GATE o comando, o arquivo de teste, o nome do teste e **a mensagem de asserção exata** que reprovou, conferida contra a saída bruta.
3. Os oito `side-by-side.png` (2.I8 e 2.I9, quatro devices) são abertos, e as medidas do §3.5 são feitas em todos os devices, no app e no quadro.
4. Cada controle de `targets.json` roda pelos **dois** testes: o `goal135` e `scripts/tests/visual-responses.test.mjs`.
5. As `notes` de cada alvo citam **todas** as divergências visíveis na captura, inclusive as da moldura (pendência não bloqueante do review134: as `notes` do 2.I10 não citam o estado do item "Sua agenda" na sidebar).

## O que a evidência desta passada mostra

Conferido no código da baseline `0939249` e em `docs/design-reference/claude-design/prototype/project/Onboarding-2-Importacao.dc.html` (quadros 2.I8 "Pendências da importação" e 2.I9 "Confirmar conclusão"), com `Onboarding-2-Importacao-Tablet.dc.html` (retrato e paisagem) e `Onboarding-2-Importacao-Desktop.dc.html`, que também têm os dois quadros.

1. **2.I8 no mobile.**
   - O topo: sem chevron (um espaço vazio de 40 px), a barra com o primeiro segmento `#0F5F63` e o segundo em 80 %, e o eyebrow "Sua agenda" da moldura.
   - O corpo (`flex: 1`, `padding: 10px 20px 0`, 20 px entre os blocos):
     - "Importação quase concluída" em Literata 28 px 500, `line-height: 1.2`, `letter-spacing: -0.01em`;
     - **o cartão do sucesso:** `padding: 16px`, raio 16 px, fundo `#DFEFE4`, 14 px de espaço; um círculo de 40 px `#2E7D4F` com o visto; "1.840 registros" em Literata 24 px 500, `tabular-nums`, `line-height: 1.1`, `#1F5C39`, e "já estão na Avenly" em 14 px `#1F5C39`;
     - **o painel das pendências:** raio 16 px, fundo `#F8ECD5`; o cabeçalho "3 registros precisam de revisão" em 15 px 600 `#7A4E0A` (`padding: 14px 16px 10px`); cada linha com `padding: 12px 16px` e borda superior de 1 px `#EBD7AE`, o nome em 14 px 600 (o telefone com `tabular-nums`), o motivo em 13 px `#7A4E0A` ("sem duração · precisa de revisão", "cliente sem nome") e a ação de texto "Corrigir" ou "Nomear" em 13 px 600 `#0F5F63`, com `padding: 13px 0; margin: -13px 0`;
     - a nota "Você pode corrigir agora ou depois, em Serviços e Clientes. Até lá, a IA não marca esses serviços." em 13 px, `line-height: 1.45`, `#716859`.
   - O rodapé (`padding: 12px 20px 46px`, 10 px de espaço): "Concluir importação" com 52 px, raio 14 px, fundo `#0F5F63`, texto `#F7F4EF` 16 px 600; "Revisar pendências" com 52 px, raio 14 px, borda de 1 px `#D6CEC2`, 16 px 600.
2. **2.I9 no mobile.** A mesma tela do 2.I8 (só o título e o cartão do sucesso) com `opacity: .5`, um véu `rgba(34,30,26,.38)` e uma folha presa embaixo: fundo `#FFFDFA`, raio `24px 24px 0 0`, sombra `0 -12px 40px rgba(34,30,26,.18)`, `padding: 10px 20px 46px`, 18 px de espaço; a alça de 40 × 4 px `#D6CEC2`; "Esta é sua única importação." em Literata 24 px 500, `line-height: 1.2`; o texto em 15 px, `line-height: 1.5`, `#5F574E`, com o número em negrito `#221E1A`; "Concluir importação" (como no 2.I8) e "Voltar e revisar" (como "Revisar pendências"). Animações `at-fade` e `at-sheet`. No tablet e no desktop, o Developer lê os valores de cada arquivo para o seu device, sem deduzi-los do mobile.
3. **O app hoje.** `ImportRunScreen` (`features/imports/ImportRunScreen.tsx`), com `completable` (sessão `READY` ou `PARTIAL` e nada em execução) e sem `running`, mostra:
   - o título "Continuar importação" com o eyebrow "Importação" e a descrição "Você já tem uma importação em andamento. Continue de onde parou.";
   - o painel com `STATUS_LABELS[status]` ("Pronto para revisão", "Importação parcial em andamento"), a conta e a hora, o `progressbar` e "N de M registros processados · K importados";
   - o painel "O que ainda não entrou (N)", uma linha por categoria com o que falta (`outstandingOf`: `pending + failed + needsReview`), os motivos de falha (`failedReasonLabel`) e "Revisar itens" quando há `needsReview`;
   - as ações: "Importar os N que faltam" (primária, só com `pending`) e "Concluir importação" (primária sem `pending`, secundária com `pending`);
   - `ReplaceAccountZone`;
   - a confirmação, um `Dialog` (modal) com o eyebrow "Isto não pode ser desfeito", o título `SINGLE_IMPORT_CONFIRMATION_TITLE`, o corpo `SINGLE_IMPORT_CONFIRMATION_BODY`, "N registro(s) não serão importados.", "Revisar antes de concluir" e "Concluir mesmo assim" (`btn-danger`). Abre quando "Concluir importação" é tocado com `outstanding > 0` (sem pedido) ou quando o BFF recusa com `IMPORT_PENDING_ACCEPTANCE_REQUIRED`.
4. **O que o contrato traz.** `importProgressSchema` traz as contagens por categoria (`pending`, `imported`, `skipped`, `failed`, `needsReview`) e `failedReasons`. `listImportItems` (`BffMigrationService.ts`) lê `GET .../categories/:category/items` com `status`, `limit` e `offset`, e `importItemSchema` traz `label`, `status` e `reasonCode`. `ConflictCategoryScreen` já lê essa rota com `status: "NEEDS_REVIEW"`. Os motivos dos itens do quadro existem no Scheduling (`import-preview-service.ts`): `SERVICE_DURATION_MISSING` e `CUSTOMER_NAME_MISSING`, com o texto longo em `conflictReasonLabel` (`labels.ts`).
5. **O que a conclusão faz com o que falta.** Conferido em `apps/scheduling-service/src/modules/migrations/import-completion-service.ts`: `outstanding = pending + failed + needsReview`; com `outstanding > 0`, a conclusão exige `acceptPending: true`, grava o aceite e **não importa** o que falta. O que ficou em revisão não entra na Avenly e não aparece em Serviços nem em Clientes depois. Por isso a nota do 2.I8 ("Você pode corrigir agora ou depois, em Serviços e Clientes…") e o fim do texto do 2.I9 ("…você pode corrigi-los depois, em Serviços e Clientes.") descrevem um efeito que o produto não tem. O vault (`docs/product-vault/02-Fluxos/05-Importacao-Unica.md`, "Confirmação final") fixa o texto da confirmação: "Depois de concluir, não será possível importar novamente do Minha Agenda. Alguns registros não serão importados. Deseja concluir mesmo assim?". O texto do vault prevalece; a forma é a do quadro (escolha 6).
6. **A captura alcança as duas telas sem gravar.**
   - A conta `onboarding` da captura não tem sessão de importação. Com `GET /v1/calendar/imports` fixo numa sessão `PARTIAL` executada (`startedAt` e `finishedAt` preenchidos), `GET /v1/calendar/imports/<sessionId>/progress` fixo no mesmo estado e `GET .../categories/SERVICE/items` e `GET .../categories/CUSTOMER/items` fixos nos itens em revisão, `ImportRunScreen` mostra o estado do 2.I8.
   - `responses` compara o caminho exato, sem a query (`scripts/lib/visual-responses.mjs`, `pickFixedResponse`), então a mesma resposta serve à leitura do 2.I8 e à de `ConflictCategoryScreen`.
   - O 2.I9 é o mesmo estado com um passo `clickRole` em "Concluir importação". Com `outstanding > 0`, o clique só abre a confirmação, sem pedido (evidência 3). O passo não toca "Concluir importação" da folha.
   - `scripts/visual-compare.mjs` captura com `reducedMotion: "reduce"`. Hoje `Onboarding-2-Importacao.dc.html` tem cinco donos de `responses` (2.I3, 2.I4, 2.I5, 2.I7 e 2.I10), e `scripts/tests/visual-responses.test.mjs` afirma a lista fechada.
7. **O gate autenticado.** `ONBOARDING_ROUTES` (`e2e/routes.ts`) mede `/onboarding/importacao` na origem, com o marcador "De onde vamos trazer seus dados?" (D-119 (f)). A conta do gate não tem sessão de importação. O Developer procura em `e2e/authenticated-matrix.spec.ts` por "Concluir importação", "quase concluída", "Revisar pendências", "única importação", "Concluir mesmo assim", "Revisar antes de concluir" e "O que ainda não entrou", e registra o resultado.
8. **Testes que citam o que muda.** `goal020-a11y`, `goal020-import-run`, `goal020-shell-invariant`, `goal120-importacao-recusas` e `goal133-andamento` citam a confirmação ou a tela parada. O Developer procura também em `apps/frontend/tests/` por "Continuar importação", "O que ainda não entrou", "Revisar itens", "Concluir importação", "Concluir mesmo assim", "Revisar antes de concluir", "registro(s) não serão importados", "Isto não pode ser desfeito", `SINGLE_IMPORT_CONFIRMATION` e `STATUS_LABELS`, e lista os que montam a tela parada ou a confirmação.
9. **Por que não o 2.I6.** O 2.I6 mostra cada conflito com o valor da Avenly e o do Minha Agenda lado a lado ("45 min · R$ 90" × "50 min · R$ 95") e a decisão no próprio cartão. `ImportItem` só traz a comparação para os horários (`currentAvailability` e `proposedAvailability`). Pede outra leitura e outra decisão, numa passada própria.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do 2.I8 e do 2.I9: os valores inline de px, cor, fonte, raio e espaçamento, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device: `Onboarding-2-Importacao.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop.
2. **Onde vale.** O desenho novo vale para o corpo de `ImportRunScreen` com `completable` e sem `running`, nas duas molduras. Não mudam: a tela em andamento (2.I7, D-147), a tela interrompida ("Isso parou no meio do caminho"), a tela terminal ("Esta importação não pode continuar"), o carregamento e o erro da leitura do andamento, `ImportConflictsScreen`, `ImportDoneScreen`, `ImportHistoryCard` e `ReplaceAccountZone`.
3. **O topo e o sucesso.**
   - O título "Importação quase concluída" é o único `h1`, sem o eyebrow "Importação" (`ImportsPage` como no 2.I7) e sem a descrição de hoje.
   - O cartão do sucesso diz "<N> registros" e "já estão na Avenly", com N = `progress.counts.imported` em `importCountFormatter`, no singular quando N é 1 ("1 registro", "já está na Avenly"). O círculo com o visto é decorativo (`aria-hidden`).
   - O painel de status de hoje (o rótulo, a conta, a hora, o `progressbar` e o resumo) sai deste estado. Ele continua nas telas interrompida e terminal.
4. **O painel das pendências.** Só com `outstanding > 0`.
   - O cabeçalho é um `h2`: "<N> registros precisam de revisão", com N = `progress.counts.needsReview`, no singular quando N é 1. Sem `needsReview` e com `failed` ou `pending`, o cabeçalho diz "<N> registros ainda não entraram", com N = `outstanding` (o mesmo número da confirmação).
   - **Itens em revisão:** para cada categoria com `needsReview > 0`, na ordem de `CATEGORY_ORDER`, uma leitura de `listImportItems(sessionId, category, { status: "NEEDS_REVIEW", limit: 5 })`. A lista mostra no máximo **5** itens no total, na ordem das categorias e da resposta. Cada linha traz o `label` do item (sem `label`, "Sem nome"), o motivo curto e a ação.
   - **Motivo curto e ação**, por acréscimo em `labels.ts`: `SERVICE_DURATION_MISSING` dá "sem duração · precisa de revisão" e "Corrigir"; `CUSTOMER_NAME_MISSING` dá "cliente sem nome" e "Nomear"; qualquer outro motivo dá "<categoria no singular, minúscula> · precisa de revisão" e "Corrigir". A ação é um `button` com nome acessível que inclui o item ("Corrigir Escova", por texto oculto).
   - **"Corrigir" e "Nomear"** abrem `ImportConflictsScreen` já na categoria do item. O Developer acrescenta a `ImportConflictsScreen` uma prop opcional para abrir numa categoria (ex.: `initialCategory`), sem mudar o comportamento de quem não a passa. Voltar volta ao 2.I8 e relê o andamento, como `onBack` faz hoje.
   - **Mais itens que a lista:** com `needsReview` maior que os itens mostrados, uma linha final, sem ação: "Mais <N> em Revisar pendências.", no singular quando N é 1.
   - **Falhas e pendentes:** com `failed > 0`, uma linha por categoria com falha, com "<N> não importados" e os motivos de `failedReasonLabel`, como hoje. Com `pending > 0`, uma linha "<N> ainda não foram importados". As duas linhas usam o estilo das linhas do quadro, sem ação. São divergência declarada: o quadro só desenha itens em revisão.
   - **Leitura dos itens:** enquanto lê, o painel mostra o cabeçalho e as linhas de falha e de pendentes, com `aria-busy`. Se a leitura falhar, o painel mostra uma linha por categoria em revisão com "<N> <categoria>" e a nota "Não foi possível listar os itens agora." (`role="status"`), sem bloquear "Concluir importação" nem "Revisar pendências". A leitura é uma por categoria, uma vez por leitura do andamento, e cancelada ao desmontar (`AbortController`).
   - **A nota** abaixo do painel, em 13 px `#716859`: "Você pode revisar agora. O que continuar pendente não será importado quando você concluir." (evidência 5).
5. **O rodapé.**
   - Com `pending > 0`: "Importar os N que faltam" primária, como hoje, e "Concluir importação" secundária.
   - Sem `pending`: "Concluir importação" primária, com a medida e a cor do quadro.
   - "Revisar pendências", secundária, com a medida do quadro, só com `needsReview > 0`. Abre `ImportConflictsScreen` na lista de categorias, como "Revisar itens" faz hoje. O "Revisar itens" de hoje sai deste estado.
   - Os textos ocupados ("Importando...", "Concluindo..."), os `disabled`, a regra de abrir a confirmação com `outstanding > 0` sem pedido e a de concluir direto sem pendência não mudam. Os erros continuam com `role="alert"`.
   - `ReplaceAccountZone` continua abaixo do rodapé (divergência declarada, como em D-146 e D-147).
6. **A confirmação (2.I9).**
   - O `Dialog` continua, com o `variant` `sheet` que ele já tem (foco preso, Escape, `aria-modal`, foco devolvido), e classes novas escopadas pela confirmação da importação para a folha do quadro: o véu, a alça, o raio, a sombra e o `padding`. Se o `variant` `sheet` não alcançar o quadro num device, o Developer escopa a regra por classe própria, sem mudar o `Dialog` para os outros usos.
   - O título "Esta é sua única importação." (`SINGLE_IMPORT_CONFIRMATION_TITLE`). O eyebrow "Isto não pode ser desfeito" sai, como no quadro.
   - O texto é o do vault, na forma do quadro: "Depois de concluir, não será possível importar novamente do Minha Agenda. **<N> registros não serão importados.** Deseja concluir mesmo assim?", com o número em negrito `#221E1A` e N = `outstanding`, no singular quando N é 1 ("**1 registro não será importado.**"). `SINGLE_IMPORT_CONFIRMATION_BODY` não muda; o Developer acrescenta as partes em `labels.ts` sem alterar a constante de hoje, que continua sendo a fonte do texto do vault.
   - As ações: "Concluir importação" (primária, `#0F5F63`, ocupado "Concluindo...") e "Voltar e revisar" (secundária). O pedido, o corpo `{acceptPending:true}`, a chave por corpo, o guarda e o erro não mudam. "Voltar e revisar" fecha a folha, como "Revisar antes de concluir" faz hoje; não fecha enquanto conclui.
   - O fundo atrás da folha é a própria tela do 2.I8 sob o véu. O `opacity: .5` do quadro vem do véu; o Developer não esconde o painel das pendências só para a captura (divergência declarada, se o quadro desenhar menos).
7. **CSS.** As regras ficam em `shared/styles/avenly-imports.css`, em classes novas escopadas (`.imports-pending*` para o 2.I8 e `.imports-confirm*` para o 2.I9, ou nomes equivalentes), sem alterar regra que a origem, as credenciais, a análise, a prévia, a escolha, o andamento, a conclusão, `/importacao` (I1, I2), Configurações › Agenda, os conflitos ou o `Dialog` dos outros usos usam. Movimento só com `prefers-reduced-motion: no-preference`.
8. **Alvos.** `targets.json`, de `Onboarding-2-Importacao.dc.html`, com `account: "onboarding"` e rota `/onboarding/importacao`. O `sessionId` é `visual-compare-import-pending`, diferente dos de 2.I3, 2.I4, 2.I5, 2.I7, 2.I10 e I1.
   - **Resposta fixa comum** aos dois alvos, válida contra os schemas do contrato:
     - `GET /v1/calendar/imports`: `right` disponível com o mesmo `sessionId`; `session` `PARTIAL`, `previewVersion` 1, `startedAt` e `finishedAt` preenchidos, sem interrupção e sem erro, todas as categorias `selected`.
     - `GET /v1/calendar/imports/visual-compare-import-pending/progress`: `PARTIAL`, `interrupted: false`, `lastError: null`, as categorias do quadro com `pending`, `skipped` e `failed` 0 e `failedReasons` vazio: `SERVICE` com 10 importados e 2 em revisão; `CUSTOMER` com 385 importados e 1 em revisão; `FUTURE_APPOINTMENT` 42, `PAST_APPOINTMENT` 1.400 e `AVAILABILITY` 6 importados. `counts` é a soma das categorias (1.843 importados e 3 em revisão). A sessão de `GET /v1/calendar/imports` tem as mesmas contagens.
     - `GET .../categories/SERVICE/items`: dois itens `NEEDS_REVIEW` com `reasonCode` `SERVICE_DURATION_MISSING`, `label` "Escova" e "Design de sobrancelha"; `GET .../categories/CUSTOMER/items`: um item `NEEDS_REVIEW` com `reasonCode` `CUSTOMER_NAME_MISSING`. Antes de escrever o `label` do cliente, o Developer confere em `import-preview-service.ts` o que o Scheduling grava como `label` de um cliente sem nome, e a resposta fixa usa a mesma forma. Se não for o telefone do quadro, a diferença é divergência declarada.
   - **2.I8, novo:** label "Pendências da importação", **sem passos**, com os quatro `GET` acima.
   - **2.I9, novo:** label "Confirmar conclusão", com os mesmos quatro `GET` e **um** passo: `clickRole` no `button` "Concluir importação" (o do rodapé). Nenhum passo toca a folha.
   - As `notes` de cada alvo dizem por que as respostas são fixas, que a tela só lê esses `GET`, que o passo do 2.I9 não grava (com `outstanding > 0` o clique só abre a confirmação) e citam **todas** as divergências visíveis, inclusive as da moldura (lição 5).
9. **Captura, teste.**
   - `scripts/tests/visual-responses.test.mjs` passa a aceitar 2.I3, 2.I4, 2.I5, 2.I7, 2.I8, 2.I9 e 2.I10 como os únicos donos de `responses` em `Onboarding-2-Importacao.dc.html`. Prova que o 2.I8 e o 2.I9 só declaram os quatro `GET` da escolha 8, que o 2.I8 não tem passo e que o 2.I9 tem só o `clickRole` em "Concluir importação".
   - Um teste `goal135` valida cada resposta contra o schema do contrato (`importStateSchema`, `importProgressSchema`, `importItemsPageSchema`) e confere: o mesmo `sessionId` no direito, na sessão, no andamento, nos caminhos e nas páginas de itens, diferente dos outros alvos da importação; as mesmas contagens na sessão e no andamento; `counts` igual à soma das categorias; o número de itens de cada página igual ao `needsReview` da categoria e todos `NEEDS_REVIEW`; e que os dois alvos têm as mesmas respostas.
10. **Gate autenticado.** Pela evidência 7, o marcador de `onboarding-importacao` não muda, porque a origem não muda. Se a busca em `authenticated-matrix.spec.ts` achar um bloco que toque a tela parada ou a confirmação, o Developer o ajusta **só para provar a tela nova, sem afrouxar asserção**, e registra o ajuste em D-149 e no relatório. Esse arquivo entra no critério 8 só para isso.
11. **Divergências declaradas.**
    - A nota do 2.I8 e o fim do texto do 2.I9 com o efeito real da conclusão e o texto do vault, não "você pode corrigir depois, em Serviços e Clientes" (evidência 5).
    - "1.843 registros" no lugar de "1.840": o importado conta as regras de `AVAILABILITY`, como em D-147.
    - O `label` do cliente sem nome como o Scheduling grava, se não for o telefone (escolha 8).
    - As linhas de falha e de pendentes, o cabeçalho "ainda não entraram", "Mais N em Revisar pendências." e a nota de falha da leitura, que o quadro não desenha.
    - `ReplaceAccountZone` abaixo do rodapé.
    - O preenchimento dos segmentos da barra do topo, derivado por `chapterFraction` (D-104); o chevron do topo (D-145); o "Sair" (D-104); o estado do item "Sua agenda" na sidebar; a barra de status e o indicador de início do iPhone.
    - Sem as animações de entrada na captura (`reduce`).

    O Developer registra outras que encontrar nas `notes` dos alvos e em D-149, com o motivo.
12. **Decisão.** O Developer propõe **D-149**, por acréscimo, depois das provas, cobrindo: a tela parada como o 2.I8 e a confirmação como o 2.I9, nas duas molduras; a leitura dos itens em revisão (a rota, o filtro, o limite de 5, a falha da leitura); o motivo curto e a ação por `reasonCode`; "Corrigir" e "Nomear" abrindo a categoria; o texto do vault no lugar do texto do quadro, pelo efeito real da conclusão; a regra da conclusão sem mudança; os alvos 2.I8 e 2.I9; e as divergências. Revê em parte D-147 só no que ela diz da tela parada, se disser. D-084, D-119 e D-145 a D-148 não são editadas.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/imports/ImportRunScreen.tsx`: só o corpo do estado `completable` sem `running` (escolhas 3 a 5) e a confirmação (escolha 6). A leitura e a releitura do andamento, `runComplete`, `settleCompleted`, `retryPending`, a chave de idempotência, o guarda, a reação a `IMPORT_PENDING_ACCEPTANCE_REQUIRED`, a tela em andamento, a interrompida, a terminal, o carregamento e o erro da leitura não mudam.
2. Um componente novo em `features/imports/` para o painel das pendências, se o Developer não o escrever em `ImportRunScreen.tsx`.
3. `features/imports/ImportConflictsScreen.tsx`: só a prop opcional para abrir numa categoria (escolha 4).
4. `features/imports/labels.ts`: só os textos novos das escolhas 4 a 6, por acréscimo, sem mudar `CATEGORY_ORDER`, `CATEGORY_LABELS`, `conflictReasonLabel`, `STATUS_LABELS`, `SINGLE_IMPORT_CONFIRMATION_TITLE`, `SINGLE_IMPORT_CONFIRMATION_BODY` nem os rótulos de hoje.
5. `shared/styles/avenly-imports.css`: o CSS do 2.I8 e do 2.I9 nos quatro devices (escolha 7).

`ImportsScreen.tsx`, `ImportDoneScreen.tsx`, `ImportHistoryCard.tsx`, `ImportPreviewScreen.tsx`, `ConnectSourceScreen.tsx`, `ImportOriginScreen.tsx`, `ImportEmptyScreen.tsx`, `ImportsLayout.tsx`, `shared/ui/Dialog.tsx`, `features/onboarding/`, `features/settings/`, `data/services/`, o contrato e o BFF não mudam.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o 2.I8 e o 2.I9 novos (escolha 8). Os outros alvos não mudam.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 9.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal135-*.test.tsx` / `.test.ts`:
   - **2.I8:** "Importação quase concluída" como único `h1`, sem o eyebrow "Importação"; o cartão do sucesso com o importado e o singular; o círculo `aria-hidden`; o cabeçalho com `needsReview` e o singular; o cabeçalho "ainda não entraram" sem `needsReview`; uma leitura de itens por categoria com `needsReview > 0`, com `status: "NEEDS_REVIEW"` e `limit: 5`, e nenhuma leitura de categoria sem `needsReview`; no máximo 5 linhas e "Mais N em Revisar pendências."; o motivo curto e a ação de cada `reasonCode` e o caso genérico; o nome acessível da ação; "Corrigir" e "Nomear" abrindo `ImportConflictsScreen` na categoria; "Revisar pendências" abrindo a lista; a falha da leitura com a nota e as ações livres; as linhas de falha (com os motivos) e de pendentes; a nota do vault; sem pendência, sem painel e "Concluir importação" concluindo direto com `{}`.
   - **2.I9:** "Concluir importação" com `outstanding > 0` abre a folha sem pedido; o título, sem o eyebrow; o texto do vault com o número em negrito e o singular; "Concluir importação" da folha envia `{acceptPending:true}` uma vez, com a chave por corpo; "Voltar e revisar" fecha sem pedido e não fecha enquanto conclui; `IMPORT_PENDING_ACCEPTANCE_REQUIRED` abre a folha; o erro com `role="alert"`.
   - **O que não muda:** a retomada com `pending` ("Importar os N que faltam" primária e "Concluir importação" secundária); a tela em andamento, a interrompida e a terminal como hoje; `ImportConflictsScreen` sem a prop nova como hoje; as duas molduras com a mesma tela.
   - **Alvos:** os testes `goal135` da escolha 9.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 9.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a leitura de itens sem o filtro `NEEDS_REVIEW` faz um teste reprovar;
   - (b) mostrar 6 itens faz um teste reprovar;
   - (c) "Concluir importação" com `outstanding > 0` enviando o pedido sem a folha faz um teste reprovar;
   - (d) a folha enviando `{}` no lugar de `{acceptPending:true}` faz um teste reprovar;
   - (e) o texto do 2.I9 do quadro ("você pode corrigi-los depois, em Serviços e Clientes") faz um teste reprovar;
   - (f) "Nomear" para `SERVICE_DURATION_MISSING` faz um teste reprovar;
   - (g) a falha da leitura dos itens bloqueando "Concluir importação" faz um teste reprovar;
   - (h) o 2.I8 de `targets.json` com um passo faz reprovar **o teste `goal135` e `visual-responses.test.mjs`**;
   - (i) o 2.I9 com um passo que toca a folha faz reprovar **o teste `goal135` e `visual-responses.test.mjs`**;
   - (j) o andamento fixo com `counts` diferente da soma das categorias faz o teste `goal135` reprovar.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 2).
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 8 só troca o texto ou a forma que este Goal muda (o título, o painel de status, "O que ainda não entrou", "Revisar itens", o eyebrow e os botões da confirmação). Nenhum ajuste afrouxa asserção sobre os pedidos, o corpo, a chave, o guarda, a retomada, os erros ou as outras telas. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 2.I8,2.I9` e, para regressão, `--target 2.I1,2.I2,2.I3,2.I4,2.I5,2.I7,2.I10,I1,I2`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 134.
   - **A captura de antes é da baseline `0939249`, feita três vezes** (lição 1). O Developer guarda os 36 `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que os 36 `app.png` não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido entre as três capturas da baseline, na tabela por imagem.
   - O Developer abre os **oito** `side-by-side.png` (protótipo × app) e lista no relatório as diferenças que restam e por quê (lição 3).
   - **Medidas:** em cada device, no app e no quadro, com a diferença em px:
     - 2.I8: o topo do título, do cartão do sucesso, do painel, da nota e de "Concluir importação"; a altura do cartão, do cabeçalho do painel e de uma linha; o círculo de 40 px; a altura dos dois botões e o espaço entre eles;
     - 2.I9: o topo da folha, da alça, do título e de "Concluir importação"; o raio da folha; a altura dos dois botões e o espaço entre eles.

     Diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`). Mudar o que a conclusão faz com os itens em revisão exige outra decisão de produto e não entra aqui.
- O 2.I6 (conflitos) e a tela de decisão por item de `ImportConflictsScreen`, salvo a prop opcional da escolha 4.
- A tela em andamento (2.I7), a interrompida, a terminal, a conclusão (2.I10, I1) e Configurações › Agenda.
- O comportamento do chevron e do "Sair" na etapa `importacao`.
- Os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3 e 4.3) e as outras observações abertas dos reviews 116 a 134.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-149** em `PROPOSED`, conforme a escolha 12. Inclui o contraste calculado de cada par de texto novo: `#221E1A` sobre `#F7F4EF` (o título); `#1F5C39` sobre `#DFEFE4` (o cartão do sucesso, em 24 px e em 14 px); `#7A4E0A` sobre `#F8ECD5` (o cabeçalho, em 15 px 600, e o motivo, em 13 px); `#221E1A` sobre `#F8ECD5` (o nome); `#0F5F63` sobre `#F8ECD5` (a ação, em 13 px 600); `#716859` sobre `#F7F4EF` (a nota, em 13 px); `#F7F4EF` sobre `#0F5F63` ("Concluir importação"); `#221E1A` sobre `#F7F4EF` e sobre `#FFFDFA` (os botões secundários e o título da folha); `#5F574E` sobre `#FFFDFA` (o texto da folha). Inclui também a borda de "Revisar pendências" e de "Voltar e revisar" (`#D6CEC2`), o alvo de toque das ações de texto (com o `padding` de 13 px) e dos botões. Se o número já estiver tomado, use o próximo livre e explique. Nenhuma decisão já aceita é editada.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal135.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal135, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um, com os números;
  - a rodada de cada número, sem atribuir a uma rodada o que outra fez;
  - os controles negativos, a rodada em que rodaram, o teste que reprovou e a mensagem de asserção exata de cada um;
  - o `visual:compare` (percentuais, os oito lados a lados, as medidas, a tabela por imagem do ruído das três capturas da baseline e da regressão, e as diferenças que restam);
  - a lista dos testes ajustados e o resultado da busca em `authenticated-matrix.spec.ts` (evidência 7).

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal135 na mesma rodada, para que nenhum deles descreva uma árvore anterior. Um gate rodado pelo IA Loop depois do relatório é registrado com o resultado dele, com o número, nunca como "pendente". O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos três registros acima.

## Validação e ordem

1. Montar a pilha descartável própria e capturar **três vezes**, na baseline `0939249`, o `app.png` de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, 2.I10, I1 e I2. Medir o ruído entre as três capturas, por imagem. Buscar em `authenticated-matrix.spec.ts` (evidência 7), conferir o `label` do cliente sem nome no Scheduling (escolha 8) e conferir no navegador da captura que a tela não lê outro `GET` que precise de resposta fixa. Se ler, só `GET` entra em `responses`, e o motivo vai nas `notes`.
2. Implementar o 2.I8 e o 2.I9, com os testes `goal135` deles e os ajustes dos testes existentes.
3. Adicionar os alvos 2.I8 e 2.I9 e escrever os testes da captura.
4. Rodar o `visual:compare` de 2.I8 e 2.I9, abrir os oito lados a lados, medir, e rodar o de 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, 2.I10, I1 e I2 para a regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A tela parada em `/onboarding/importacao` igual ao quadro 2.I8, e a confirmação igual ao quadro 2.I9, nos 4 devices, salvo as divergências declaradas. Provado em jsdom, pelo `visual:compare`, pelos oito lados a lados abertos e pelas medidas do §3.5.
2. O 2.I8 com "Importação quase concluída" como único `h1`, o cartão do sucesso, o painel com os itens em revisão lidos da rota de itens (no máximo 5), o motivo curto e a ação por `reasonCode`, "Corrigir" e "Nomear" abrindo a categoria, as linhas de falha e de pendentes, a falha da leitura sem bloquear, a nota do vault, "Concluir importação" e "Revisar pendências". O 2.I9 com o título, o texto do vault com o número em negrito, "Concluir importação" e "Voltar e revisar".
3. A conclusão, a retomada, a releitura do andamento, a confirmação aberta sem pedido, o corpo `{acceptPending:true}` só depois da confirmação, a chave por corpo, o guarda, a reação a `IMPORT_PENDING_ACCEPTANCE_REQUIRED` e os erros fazem os mesmos pedidos, com a mesma regra e as mesmas mensagens. A única leitura nova é `GET .../categories/:category/items` com `status=NEEDS_REVIEW`. As duas molduras mostram a mesma tela.
4. 2.I1, 2.I2, 2.I3, 2.I4, 2.I5, 2.I7, 2.I10, I1 e I2 iguais byte a byte à captura da baseline (`cmp` dos 36 `app.png`), ou com cada diferença dentro do ruído medido entre as três capturas da baseline, mostrada na tabela por imagem.
5. Nenhum pedido ao BFF muda de rota, e nenhum passo de captura grava. O teste da captura prova que 2.I3, 2.I4, 2.I5, 2.I7, 2.I8, 2.I9 e 2.I10 são os únicos donos de `responses` no arquivo, que o 2.I8 e o 2.I9 só declaram os quatro `GET`, que o 2.I8 não tem passo e que o 2.I9 só tem o clique em "Concluir importação". O teste `goal135` prova a coerência das respostas.
6. Os dez controles negativos reprovam, com a mensagem exata registrada, e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/importacao` continua passando nas cinco larguras (360, 390, 768, 1024 e 1440), na origem. O gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo, contraste, foco visível e `prefers-reduced-motion`. O 2.I8 e o 2.I9 não são alcançados pelo gate. As cores são as do quadro, com o contraste de cada par calculado e registrado em D-149. O alvo de toque das ações de texto e dos botões é provado em jsdom pelo CSS aplicado e pelas medidas do §3.5. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json` e `scripts/tests/visual-responses.test.mjs`; `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no caso da escolha 10; os três registros da seção "Documentação".
9. D-149 proposta, conforme a escolha 12.

## Plano de execução

1. **WU-01 — A tela parada e a confirmação.** As três capturas da baseline e o ruído por imagem, a busca no spec do gate, a conferência do `label` do cliente sem nome, o 2.I8 (o título, o sucesso, o painel com a leitura dos itens, o motivo curto, as ações e o rodapé), a prop opcional de `ImportConflictsScreen`, o 2.I9 (a folha e o texto do vault), o CSS nos quatro devices, os testes `goal135` das telas e os ajustes dos testes existentes, nas duas molduras.
2. **WU-02 — Os alvos.** O 2.I8 e o 2.I9 em `targets.json`, os testes da captura e os testes `goal135` dos alvos.
3. **WU-03 — Fidelidade e controles.** O `visual:compare` de 2.I8 e 2.I9, com os oito lados a lados e as medidas, a regressão contra o ruído da baseline e os controles negativos, com as correções de medida que faltarem.
4. **WU-04 a WU-11 — Verificação determinística:** typecheck, lint e testes alvo `goal135`; suíte do frontend e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
5. **WU-12 — Registros.** D-149, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística escritos no registro.
6. **WU-13 — `git diff --check`.**
