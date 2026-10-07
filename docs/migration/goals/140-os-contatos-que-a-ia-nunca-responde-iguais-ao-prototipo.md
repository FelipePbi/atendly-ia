# Goal 140 — Os contatos que a IA nunca responde iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-07 pelo Tech Lead Agent após [Goal139 ACCEPTED](../reviews/139-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: W3, W1, W2

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v164**, inserida depois do 139, sem renumerar nem remover ID. Origem: o Goal139 entregou no contrato a leitura dos contatos ignorados, a origem de cada marcação e a regra de "Remover" ([D-153](../DECISIONS.md)), e deixou a tela para esta passada, como o par 136 e 137. A causa da divergência 5 de [D-118](../DECISIONS.md) ("o contrato não lê a lista") deixou de existir; falta a tela. O W3 entra em `targets.json` como alvo novo (101 alvos; 12 dos 113 quadros continuam sem alvo), e o W1 e o W2 continuam alvos, agora com a segunda linha "Mãe, Dudu".

## Baseline aceita

Baseline aceita: `7a1f2f22e8e9e77309ca6b6ec935ea5580890f13`

Goal anterior: 139 — A lista dos contatos ignorados, com a origem de cada marcação, no contrato

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal139 já integrado em `main` (origem `63b45db72dd061532647fe2346ef85de36e54f24`). Houve **uma rodada**, sem blocker. **D-153** foi aceita: `GET /v1/conversations/ignored-contacts` devolve os contatos ignorados do canal ativo do tenant (`{ items, total }`, com `contactId`, `externalContactId`, `displayName`, `ignoredAt` e `origin`), em ordem de `ignoredAt` crescente, com `limit` (1 a 200, padrão 100) e `offset`; sem canal ativo, a IA recusa com `CHANNEL_CONNECTION_NOT_FOUND` (404), que o BFF repassa como `UPSTREAM_ERROR` com `details.upstreamCode`; os dois `PUT` aceitam `origin`; "Remover" pela rota por telefone deixa as sessões abertas do contato em `PERSONAL` só nesta conversa. O frontend já tem `BffConversationService.listIgnoredContacts`. A última contagem aceita:

- frontend **202** arquivos e **2915** testes — Goal139;
- `visual-responses.test.mjs` **63** — Goal138 (o Goal139 não tocou `scripts/`);
- `test:gate` **296** — Goal139;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa — Goal139;
- IA: unidade **98** arquivos e **1262** testes passando, 15 e 108 pulados sem banco — Goal139;
- BFF: unidade **24** arquivos e **193** testes passando — Goal139;
- `validate:core` com saída 0, 15 de 17 passos passando e 2 pulados — Goal139;
- `validate:integration` com saída 0, 36 de 36 passos, e o gate autenticado em **305** `passed`, sem retentativa — Goal139.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **Configurações › WhatsApp › "Contatos que a IA nunca responde" passa a ser a tela do quadro W3, em rota própria, com a lista lida do contrato, a origem de cada marcação, "Remover" e a busca que marca uma conversa ou um número; a linha do W1 ganha a segunda linha com os nomes da lista.** A folha de hoje (`Dialog` `sheet` com `IgnoredContactsPanel`) sai.

**Por que agora.** Hoje a pessoa marca contatos, mas não vê quem está marcado nem consegue desmarcar quem marcou por telefone. O Goal139 deu a leitura e a regra de "Remover" sem mudar tela nenhuma; esta passada mostra o que já está no contrato. Dos 13 quadros sem alvo, o W3 é o único com o contrato pronto e sem pergunta de produto aberta.

**Lições dos Goals 133 a 139, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline **três vezes** antes de editar, mede o ruído entre as três e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta.
3. Os `side-by-side.png` do W3, do W1 e do W2 são abertos nos quatro devices, e as medidas do §3.5 são feitas em todos os devices, no app e no quadro.
4. Cada controle de `targets.json` roda pelos **dois** testes: o `goal140` e `scripts/tests/visual-responses.test.mjs`.
5. As `notes` do alvo citam **todas** as divergências visíveis na captura, inclusive as da casca e as de cor de título (`avenly.css` dá `color: var(--fg)` a todo `h2`; review135, blocker 1).
6. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente".

## O que a evidência desta passada mostra

Conferido no código da baseline `7a1f2f2` e em `docs/design-reference/claude-design/prototype/project/Mais-WhatsApp-Importacao-Conta.dc.html` (mobile), `Configuracoes-Tablet.dc.html` (retrato e paisagem) e `Configuracoes-Desktop.dc.html`, que têm o W1, o W2 e o W3 (`DEVICE_FILE_BASE` em `scripts/visual-compare.mjs`).

1. **W3 no mobile** (`data-screen-label="WhatsApp · contatos ignorados"`):
   - A barra: o chevron de voltar em 40 px, o título "A IA nunca responde" em 16 px 600, centralizado.
   - O corpo (`padding` lateral do device, 16 px entre os blocos):
     - a descrição "Estes contatos continuam aparecendo nas suas conversas, mas a IA não responde nem usa o que eles escrevem." em 14 px, `line-height: 1.45`, `#5F574E`;
     - o campo de busca: 46 px de altura, raio 14 px, borda de 1 px `#D6CEC2`, fundo `#FFFDFA`, `padding: 0 14px`, 10 px entre a lupa (18 px) e o texto, "Buscar nas suas conversas ou digitar um número" em 15 px `#716859`;
     - a lista: raio 16 px, borda de 1 px `#E5DED4`, fundo `#FFFDFA`, `overflow: hidden`; cada linha com `padding: 12px 14px`, 12 px de espaço, borda superior de 1 px `#E5DED4` a partir da segunda; o avatar de 40 px redondo, fundo `#EFEAE2`, a inicial em 14 px 600 `#5F574E`; o nome em 15 px 600 e a legenda em 13 px `#716859` (`font-variant-numeric: tabular-nums` quando traz telefone), com 2 px entre os dois; "Remover" em 14 px 600 `#8A2A21` à direita;
     - as três linhas: "Mãe" com "+55 11 99900-1122 · desde o início", "Dudu ❤️" com "+55 11 98877-6655 · desde o início", e "Renata" com "marcada na conversa · 18/09", sem telefone;
     - a nota "Remover não apaga nada: a IA só volta a poder responder esse contato em uma nova conversa comercial." em 12 px, `line-height: 1.4`, `#716859`.
   - A legenda do quadro: "Mesma lista do onboarding, agora com origem de cada marcação (“marcada na conversa”) e remoção reversível. Sem a palavra “blacklist”."
   - No tablet e no desktop, o Developer lê os valores de cada arquivo para o seu device, sem deduzi-los do mobile. No tablet o corpo tem `padding: 14px 28px 0`; no desktop a lista de Configurações fica ao lado e o voltar fica oculto, como em toda subrota de Configurações (`SettingsPage`, `hideBackWide`).
2. **W1, a linha.** A linha "Contatos que a IA nunca responde" traz, embaixo do título, "Mãe, Dudu" (nos três arquivos). No app, a linha (`WhatsAppConnectedSettings.tsx`) só tem o título e abre a folha `Dialog` `sheet` com `IgnoredContactsPanel`.
3. **O app hoje.**
   - `IgnoredContactsPanel` (`features/whatsapp/IgnoredContactsPanel.tsx`) lista até 20 conversas não ignoradas com "Ignorar" (`setIgnored(id, true, "CONVERSATION")`) e um campo "Informar um número manualmente" com "Adicionar" (`ignoreByPhone(phone, true, "SETTINGS")`); não lê a lista de ignorados, não desmarca e só é usado pela folha do W1. O mesmo arquivo exporta `OnboardingIgnoredContacts` (quadro 4.5), que não muda.
   - As subrotas de Configurações são telas empurradas com `SettingsPage` (`PushedBar` com o título como cabeçalho, voltar e `hideBackWide`), em rota própria, como `/configuracoes/conta/excluir` (C2, Goal124).
   - `connectedSince` (`WhatsAppConnectedSettings.tsx`) escreve a data `dd/mm` no fuso do negócio, com o fallback de D-118.
   - O `externalContactId` gravado é o telefone já normalizado (só dígitos; `conversation-resolution.ts`, `normalizePhone`), então `ignoreByPhone(externalContactId, false)` chega ao mesmo contato pela chave `[tenantId, channelId, externalContactId]`.
   - A recusa sem canal chega ao frontend como `BffHttpError` com `details.upstreamCode` `CHANNEL_CONNECTION_NOT_FOUND`; `data/http/schedulingRefusal.ts` já lê `upstreamCode` desse jeito.
4. **A captura.** `responses` compara o caminho exato, sem a query (`scripts/lib/visual-responses.mjs`), e só `GET` entra; o W1 e o W2 já fixam `GET /v1/whatsapp` conectado. `visual-responses.test.mjs` afirma a lista fechada dos alvos que declaram `responses` e o arquivo de cada um.
5. **Os testes que citam o que muda.** `goal106-whatsapp` (a folha, marcar por telefone, marcar uma conversa e a falha), `goal129-contatos-ignorados`, `goal139-contatos-ignorados` (a folha manda `SETTINGS` e `CONVERSATION`) e os testes `goal1xx-alvos-captura` que contam alvos ou citam o W1 e o W2. O Developer procura também por "Contatos que a IA nunca responde", "Informar um número manualmente", `IgnoredContactsPanel` e `sheet === "ignored"`, e lista os que montam a folha.
6. **O gate autenticado.** `e2e/routes.ts` lista `/configuracoes/whatsapp` e não tem a rota nova. O Developer busca em `e2e/authenticated-matrix.spec.ts` por "Contatos que a IA nunca responde" e "nunca responde" e registra o resultado.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do W3 e da linha do W1: os valores inline de px, cor, fonte, raio e espaçamento, e o `box-sizing` que cada valor pressupõe. Usa cada arquivo para o seu device.
2. **A rota.** `/configuracoes/whatsapp/contatos-ignorados`, uma página nova em `app/(platform)/configuracoes/whatsapp/contatos-ignorados/page.tsx`, pelo mesmo caminho das outras subrotas (`SettingsScreen` com um cenário novo, ou a tela direto, como o Developer achar no padrão de `conta/excluir`). A tela usa `SettingsPage` com `title="A IA nunca responde"` (o único cabeçalho de página), `backHref="/configuracoes/whatsapp"` e `backLabel="Voltar para WhatsApp"`.
3. **A linha do W1.** Vira um `Link` para a rota nova (sai `setSheet("ignored")` e o `Dialog` da folha). A segunda linha (`wa-row-detail`) vem de `listIgnoredContacts({ limit: 2 })`, lida quando a tela conectada monta e cancelada ao desmontar: os nomes dos itens (escolha 5), separados por ", ", e, quando `total` é maior que o número de itens, " e mais N", com N = `total` − itens. Lista vazia, leitura em curso ou falha: sem segunda linha, e a linha continua levando à rota.
4. **A lista.** A tela lê `listIgnoredContacts({ limit: 100, offset: 0 })`.
   - Enquanto lê: a área da lista com `aria-busy` e "Carregando contatos…".
   - Com itens: a lista da escolha 1, na ordem da resposta, e a nota "Remover não apaga nada: a IA só volta a poder responder esse contato em uma nova conversa comercial.". Com `total` maior que os itens lidos, "Carregar mais" (ação de texto) lê a página seguinte com o mesmo `limit`.
   - Vazia: "Nenhum contato nesta lista." em 14 px `#5F574E`, sem a nota.
   - Sem canal (`upstreamCode` `CHANNEL_CONNECTION_NOT_FOUND`): a descrição continua; no lugar da busca e da lista, "Conecte o WhatsApp para escolher quem a IA nunca responde." e o link "Conectar WhatsApp" para `/configuracoes/whatsapp`.
   - Outra falha: "Não foi possível carregar a lista agora." com `role="alert"` e "Tentar de novo", que relê; a forma segue o padrão de erro de D-135.
5. **Cada linha.**
   - **Nome:** `displayName`; sem ele, o telefone formatado.
   - **Telefone:** `formatBrazilianPhone(externalContactId, "plus")`, ou o `externalContactId` quando o formatador não reconhece.
   - **Data:** `ignoredAt` em `dd/mm`, no fuso do negócio, pela mesma regra de `connectedSince` (inclusive o fallback de D-118); o Developer extrai a função para um ponto comum em vez de copiá-la.
   - **Legenda, pela origem:** `ONBOARDING` dá "<telefone> · desde o início"; `CONVERSATION` dá "marcada na conversa · <data>" (sem `ignoredAt`, "marcada na conversa"), sem telefone, como o quadro; `SETTINGS` e `null` dão "<telefone> · desde <data>" (sem `ignoredAt`, só o telefone). Quando o nome já é o telefone, a legenda não o repete ("desde o início", "desde <data>" ou nenhuma).
   - **Avatar:** a primeira letra (`\p{L}`) de `displayName`, em maiúscula; sem nome ou sem letra, o ícone de pessoa no mesmo círculo.
   - **"Remover":** um `button` com o texto "Remover" e o nome acessível "Remover <nome>", alvo de toque de pelo menos 24 px. Chama `ignoreByPhone(externalContactId, false)`, sem `origin`. Enquanto envia, o botão fica desabilitado com "Removendo..."; só uma remoção por vez. Depois da resposta, a linha sai, `total` cai 1 e um `role="status"` anuncia "<nome> saiu da lista.". Na falha, a linha fica e mostra "Não foi possível remover agora. Tente novamente." com `role="alert"`. Nada sai da tela antes da resposta.
   - A linha em si não é clicável: sem `cursor: pointer` nem fundo de `:hover` (divergência declarada; o quadro não diz para onde a linha leva).
6. **A busca.** O campo do quadro, um `input` `type="search"` com o nome acessível "Buscar nas suas conversas ou digitar um número", sem rótulo visível.
   - Texto vazio: nenhuma leitura de conversa (a captura não pede `GET /v1/conversations`).
   - Texto não vazio, depois de 250 ms sem digitar: `conversations.list({ limit: 20, search, ignored: false })`, cancelada quando o texto muda. Os resultados ficam num bloco entre o campo e a lista, com a forma das linhas da lista: avatar, `contactLabel` da conversa, o telefone na legenda e "Ignorar" no lugar de "Remover", que chama `setIgnored(id, true, "CONVERSATION")` (D-153: conversa marcada em Configurações grava `CONVERSATION`). Sem resultado: "Nenhuma conversa encontrada.".
   - Quando o texto tem 10 dígitos ou mais (contados sem os outros caracteres), o bloco termina com a linha "Adicionar <texto>" e o botão "Adicionar", que chama `ignoreByPhone(texto, true, "SETTINGS")`; `VALIDATION_ERROR` dá "Use o formato +55 11 99999-0000, com DDD.", e outra falha dá "Não foi possível marcar este número. Tente novamente.", com `role="alert"`.
   - Depois de "Ignorar" ou "Adicionar" com sucesso: o campo esvazia, o bloco some, a lista relê do começo e um `role="status"` anuncia "<nome> entrou na lista.". Os botões do bloco ficam desabilitados enquanto um pedido está em curso.
7. **A folha sai.** O `Dialog` `sheet` "Contatos que a IA nunca responde" e o componente `IgnoredContactsPanel` são removidos; `OnboardingIgnoredContacts` e as funções que ele usa ficam no mesmo arquivo, sem mudança de comportamento, e o onboarding (4.5) não muda. O que a folha provava (`SETTINGS` no telefone e `CONVERSATION` na conversa) passa a ser provado na tela nova.
8. **CSS.** Em `shared/styles/avenly-settings.css`, em classes novas escopadas (`.wa-ignored*` ou equivalente), sem alterar regra que o W1, o W2, Conversas (R1, R2), Conta (C1, C2), a Importação (I1, I2) ou o onboarding usam. Classe da folha que ficar sem uso é removida só se nenhum outro arquivo a usar. Movimento só com `prefers-reduced-motion: no-preference`. `h2` novo, se houver, recebe a cor do quadro explicitamente (lição 5).
9. **Os alvos.** Em `targets.json`, de `Mais-WhatsApp-Importacao-Conta.dc.html`:
   - **W3 novo**, label "WhatsApp · contatos ignorados", rota `/configuracoes/whatsapp/contatos-ignorados`, sem passo, com `GET /v1/conversations/ignored-contacts` fixo, válido contra `ignoredContactListSchema`: `total` 3 e três itens na ordem do quadro: "Mãe" (`5511999001122`, `ONBOARDING`), "Dudu ❤️" (`5511988776655`, `ONBOARDING`) e "Renata" (`CONVERSATION`, `ignoredAt` que dá 18/09 no fuso de São Paulo), com `contactId` próprios e `ignoredAt` crescentes.
   - **W1 e W2**: acrescentam `GET /v1/conversations/ignored-contacts` com "Mãe" e "Dudu ❤️" e `total` 2, os mesmos dois itens do W3; o resto do alvo não muda. Os passos do W2 continuam sem tocar "Desconectar".
   - As `notes` dizem por que as respostas são fixas, que a tela só lê esses `GET`, que nenhum passo grava e citam **todas** as divergências visíveis (lição 5).
10. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar o W3 entre os donos de `responses` de `Mais-WhatsApp-Importacao-Conta.dc.html` e prova que o W3 só declara o `GET` da lista e não tem passo. Um teste `goal140` valida cada resposta da lista (W1, W2, W3) contra `ignoredContactListSchema` e confere que o `total` do W3 é o número de itens, que os dois do W1 e do W2 são os dois primeiros do W3 e que nenhum alvo declara método diferente de `GET`.
11. **O gate.** `e2e/routes.ts` ganha a rota nova, com o `sessionMarker` de Configurações e o `contentMarker` "A IA nunca responde". Se a busca da evidência 6 achar um bloco que abra a folha, o Developer o ajusta **só para a rota nova, sem afrouxar asserção**, e registra o ajuste em D-154. As contagens de `validate:ui` e do gate autenticado mudam por causa da rota nova; o relatório diz quanto e por quê.
12. **Divergências declaradas.**
    - A linha da lista sem `:hover` nem `cursor: pointer` (escolha 5).
    - A busca vazia na captura, como no quadro; o bloco de resultados não aparece.
    - O estado da casca da conta visual, que o quadro não tem (D-118): os banners e o estado do hub ao lado no desktop.
    - A barra de status e o indicador de início do iPhone.

    O Developer registra outras que encontrar nas `notes` do alvo e em D-154, com o motivo.
13. **Decisão.** O Developer propõe **D-154**, por acréscimo, depois das provas, cobrindo as escolhas 2 a 12: a rota, a linha do W1, a lista e os seus estados, a legenda por origem, "Remover", a busca, o fim da folha, os alvos e as divergências. Diz que a divergência 5 de D-118 deixou de existir, sem editar D-118 nem D-153. Se o número já estiver tomado, usa o próximo livre e explica.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `app/(platform)/configuracoes/whatsapp/contatos-ignorados/page.tsx`: a rota nova (escolha 2).
2. Um componente novo em `features/settings/` ou `features/whatsapp/` para a tela (escolhas 4 a 6), e, se o Developer seguir o padrão de cenário, `features/settings/types.ts` e `ProductSettingsScreen.tsx` só para o cenário novo.
3. `features/settings/WhatsAppConnectedSettings.tsx`: a linha do W1 (escolha 3) e a saída da folha; a função de data extraída (escolha 5) pode ir para um módulo comum em `features/settings/` ou `shared/`.
4. `features/whatsapp/IgnoredContactsPanel.tsx`: só a remoção de `IgnoredContactsPanel` (escolha 7).
5. `shared/styles/avenly-settings.css`: o CSS do W3 e da segunda linha nos quatro devices (escolha 8).

`data/services/`, `shared/ui/`, `features/onboarding/`, o contrato, o BFF, a IA e o banco não mudam.

### 2. A captura e o gate

1. `apps/frontend/e2e/visual/targets.json`: o W3 novo e a resposta da lista no W1 e no W2 (escolha 9). Os outros alvos não mudam.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.
3. `apps/frontend/e2e/routes.ts`: a rota nova (escolha 11); `e2e/authenticated-matrix.spec.ts` só no caso da escolha 11.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal140-*.test.tsx` / `.test.ts`:
   - **Rota e linha do W1:** a linha é um link para `/configuracoes/whatsapp/contatos-ignorados`; a segunda linha com dois nomes, com " e mais N" quando `total` passa os itens, com o telefone formatado sem `displayName`, e ausente com lista vazia e com falha; uma leitura com `limit: 2`; nenhum `Dialog` de contatos ignorados.
   - **Lista:** uma leitura com `limit: 100` e `offset: 0`; a ordem da resposta; o carregamento com `aria-busy`; "Carregar mais" lendo `offset` 100 e escondido quando tudo foi lido; o vazio sem a nota; a falha sem canal com o link; a outra falha com `role="alert"` e "Tentar de novo" relendo; um só cabeçalho de página, "A IA nunca responde"; voltar para `/configuracoes/whatsapp`.
   - **Legenda e avatar:** cada origem (`ONBOARDING`, `CONVERSATION`, `SETTINGS`, `null`), com e sem `ignoredAt`, com e sem `displayName`; a data no fuso do negócio (um instante que muda de dia entre `America/Sao_Paulo` e `Pacific/Auckland`); a inicial e o ícone sem nome.
   - **"Remover":** chama `ignoreByPhone(externalContactId, false)` sem `origin`, uma vez; o botão desabilitado com "Removendo..." e uma remoção por vez; a linha só sai depois da resposta; o `role="status"`; a falha com a linha mantida e `role="alert"`; o nome acessível "Remover <nome>".
   - **Busca:** nenhuma leitura com o campo vazio; uma leitura depois da espera, com `ignored: false` e `search`, e a anterior cancelada; "Ignorar" chamando `setIgnored(id, true, "CONVERSATION")`; "Adicionar" só com 10 dígitos ou mais, chamando `ignoreByPhone(texto, true, "SETTINGS")`; `VALIDATION_ERROR` e a outra falha; depois do sucesso, o campo vazio, a lista relida do começo e o `role="status"`; "Nenhuma conversa encontrada.".
   - **O que não muda:** o onboarding (4.5) com `OnboardingIgnoredContacts` mandando `ONBOARDING` nas duas marcações; o resto do W1 e o W2.
   - **Alvos:** os testes `goal140` da escolha 10.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 10.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a legenda de `CONVERSATION` com o telefone faz um teste reprovar;
   - (b) `ONBOARDING` e `CONVERSATION` com as legendas trocadas fazem um teste reprovar;
   - (c) "Remover" tirando a linha antes da resposta faz um teste reprovar;
   - (d) "Remover" mandando `origin` faz um teste reprovar;
   - (e) "Adicionar" mandando `CONVERSATION` ou sem `origin` faz um teste reprovar;
   - (f) "Ignorar" na busca mandando `ONBOARDING` faz um teste reprovar;
   - (g) a data em UTC em vez do fuso do negócio faz um teste reprovar;
   - (h) a segunda linha do W1 sem " e mais N" faz um teste reprovar;
   - (i) o W3 de `targets.json` com um passo que toca "Remover" faz reprovar **o teste `goal140` e `visual-responses.test.mjs`**;
   - (j) o `total` do W3 diferente do número de itens faz o teste `goal140` reprovar.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `cmp` depois de reverter (lição 2).
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 5 só troca o que este Goal muda (a folha que vira rota, a linha do W1 e a contagem de alvos). Nenhum ajuste afrouxa asserção sobre os pedidos, a origem, o onboarding ou as outras telas. Cada ajuste é listado no relatório, com o que cada asserção removida provava e onde essa prova continua.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target W3,W1,W2` e, para regressão, `--target R1,R2,I1,I2,Mais-WhatsApp:C1,Mais-WhatsApp:C2,IA1,4.5` (`C1` e `C2` também existem em `Conversas-e-Chat.dc.html`, por isso o prefixo). Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 137.
   - **A captura de antes é da baseline `7a1f2f2`, feita três vezes** (lição 1), com os alvos de regressão e o W1 e o W2. O Developer guarda os `app.png` de cada captura fora do repositório. Depois das edições, prova por `cmp` que os de regressão não mudaram, ou mostra, para cada um que mudou, que a diferença está dentro do ruído medido, na tabela por imagem. No W1 e no W2, a única diferença fora do ruído é a segunda linha.
   - O Developer abre os **doze** `side-by-side.png` (W3, W1 e W2, protótipo × app, nos quatro devices) e lista no relatório as diferenças que restam e por quê (lição 3).
   - **Medidas**, em cada device, no app e no quadro, com a diferença em px: o topo do título da barra, da descrição, do campo, da lista e da nota; a altura e o raio do campo; o raio e a borda da lista; a altura de cada linha, o tamanho do avatar e a posição de "Remover"; no W1, a altura da linha com a segunda linha. Diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar.
   - Critério visual: **o W3 igual ao quadro W3 nos 4 devices, e o W1 e o W2 iguais aos quadros W1 e W2 nos 4 devices**, salvo as divergências declaradas.

## Fora do escopo

- Qualquer mudança no BFF, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`), em banco ou na semente da captura (`scripts/lib/visual-seed.mjs`) e do gate (`scripts/goal033-authenticated-ui-rehearsal.mjs`).
- A transação de "Remover" por telefone (pendência 1 do review139), filtro por origem, marcação em lote e a mudança das origens gravadas (D-153).
- O onboarding (4.5, `OnboardingIgnoredContacts`), o chat ("Nunca responde", D-130 (6)) e o resto do W1 e do W2.
- Os pendentes do review138 e os outros quadros sem alvo (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, H6, NT3 e 4.3), e as observações abertas dos reviews 116 a 139.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-154** em `PROPOSED`, conforme a escolha 13. Inclui o contraste calculado de cada par de texto novo: `#221E1A` sobre `#FFFDFA` (o nome, em 15 px 600); `#716859` sobre `#FFFDFA` (a legenda, em 13 px, e o texto do campo, em 15 px); `#8A2A21` sobre `#FFFDFA` ("Remover", em 14 px 600); `#5F574E` sobre `#EFEAE2` (a inicial, em 14 px 600); `#5F574E` sobre `#F7F4EF` (a descrição, em 14 px); `#716859` sobre `#F7F4EF` (a nota, em 12 px); e a segunda linha do W1 com a cor que o Developer portar. Inclui também as bordas `#D6CEC2` (campo) e `#E5DED4` (lista) como contraste de não texto, e o alvo de toque de "Remover", "Ignorar", "Adicionar" e "Carregar mais".
- `docs/migration/CURRENT_STATE.md`: o delta do Goal140.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal140, com as contagens da execução final de **todos** os gates que rodaram (inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas), a rodada de cada número, a mudança de contagem de `validate:ui` e do gate pela rota nova, os ajustes de testes existentes, a tabela por imagem, as medidas e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal140 na mesma rodada. O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Capturar a baseline `7a1f2f2` três vezes (§3.5) antes de editar.
2. Implementar a rota, a tela, a busca e o CSS do W3 (escolhas 2, 4 a 6 e 8), com os testes do §3.1.
3. Implementar a linha do W1 e a saída da folha (escolhas 3 e 7), ajustando os testes existentes (§3.4).
4. Acrescentar os alvos, o teste de captura e a rota do gate (escolhas 9 a 11), rodar o `visual:compare` e as medidas e corrigir o que passar de 1 px.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes `goal140` e a suíte do frontend;
   - `scripts/tests/visual-responses.test.mjs` e `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `AI_TEST_DATABASE_URL`, `BFF_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL` em bancos descartáveis e migrados);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `/configuracoes/whatsapp/contatos-ignorados` mostra os contatos ignorados lidos do contrato, com o nome, a legenda por origem e data e "Remover", nos estados de carregamento, vazio, sem canal e erro da escolha 4.
2. "Remover" só tira a linha depois da resposta de `ignoreByPhone(externalContactId, false)`; "Ignorar" grava `CONVERSATION` e "Adicionar" grava `SETTINGS`.
3. A linha do W1 leva à rota e mostra os nomes da lista; a folha não existe mais; o onboarding e o chat não mudam.
4. O W3 igual ao quadro W3 nos 4 devices, e o W1 e o W2 iguais aos quadros W1 e W2 nos 4 devices, salvo as divergências declaradas, com os doze `side-by-side.png` abertos e as medidas do §3.5 dentro de 1 px; os alvos de regressão sem mudança fora do ruído.
5. `validate:ui` (overflow horizontal, alvo de toque de 24 px, contraste computado, foco visível e `prefers-reduced-motion` nas cinco larguras, inclusive a rota nova), `validate:core`, `validate:integration` com o gate autenticado e `test:gate` passam.
6. Os dez controles negativos reprovam, com a mensagem exata registrada, e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. Nenhum arquivo mudou fora destes: os do §1 e do §2; `apps/frontend/tests/`; os três registros da seção "Documentação".
8. D-154 proposta, conforme a escolha 13.

## Plano de execução

1. **WU-01 — A tela do W3.** Rota, tela, lista, legenda, "Remover", busca, CSS, a rota em `e2e/routes.ts` e os testes `goal140` da tela.
2. **WU-02 — A linha do W1 e o fim da folha.** `WhatsAppConnectedSettings`, a função de data comum, a remoção de `IgnoredContactsPanel`, os testes `goal140` da linha e os ajustes dos testes existentes.
3. **WU-03 — Os alvos e a fidelidade visual.** `targets.json`, `visual-responses.test.mjs`, os testes `goal140` dos alvos, a captura de antes e de depois, as medidas e as correções, e os controles negativos (a) a (j).
4. **WU-04 a WU-12 — Verificação determinística:** typecheck, lint e testes `goal140` do frontend; a suíte do frontend; `tooling-tests` e `test:gate`; `validate:core`, `validate:ui` e `validate:integration`.
5. **WU-13 — Registros.** D-154, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
6. **WU-14 — `git diff --check`.**
