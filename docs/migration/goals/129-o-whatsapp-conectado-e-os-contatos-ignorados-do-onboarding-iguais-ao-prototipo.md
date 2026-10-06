# Goal 129 — O WhatsApp conectado e os contatos ignorados do onboarding iguais ao protótipo

**Status: READY.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal128 ACCEPTED](../reviews/128-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 4.4, 4.5

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v153**, inserida depois do 128, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 128. Com 4.7 e 4.8 aceitos, `targets.json` tem 88 alvos, e 25 dos 113 quadros continuam sem alvo. O Goal128 e o Goal127 provaram o caminho: uma etapa do onboarding alcançada por URL direta pela conta parada no meio, com `GET` fixo na captura e um corpo próprio do onboarding, sem tocar a superfície de Configurações que usa o mesmo módulo.

## Baseline aceita

Baseline aceita: `f25c6e08163a988b3562f1f189b7e7f042db0d0e`

Goal anterior: 128 — O teste real em andamento e o teste que falhou iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal128 já integrado em `main` (origem `094436ffd9f0fa5a0321547d39b7b2bfb0211b93`). Houve **duas rodadas**: a rodada 1 teve 3 blockers (2 de código, de 2 px, e 1 de documentação), resolvidos pela FIX-001; o review da rodada 2 teve 1 blocker só de documentação, e o IA Loop aceitou a rodada com a correção feita no fechamento, só em `docs/migration/`. **D-142** foi aceita: o teste real em andamento e o que falhou como os quadros 4.7 e 4.8, com a linha do tempo lida só da execução. A última contagem aceita:

- frontend **180** arquivos e **2384** testes, `goal128` **66** (3 arquivos);
- `visual-responses.test.mjs` **56**;
- `test:gate` **289**;
- `validate:core` 17 passos, com 15 passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` **36** de 36 passos, com o gate autenticado em **299** `passed` e **1** `flaky` (`mobile-390 › configuracoes-conta`, `net::ERR_NO_BUFFER_SPACE`, rota fora do Goal128).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **as duas etapas do onboarding entre conectar o WhatsApp e o teste real ficam iguais aos quadros 4.4 e 4.5 nos quatro devices**, salvo as divergências declaradas. A 4.4 é `/onboarding/whatsapp-conectar` com o número já conectado. A 4.5 é `/onboarding/contatos-ignorados`. As duas só mostram o que a leitura traz, e cada marcação só aparece depois da resposta da API, como hoje. Nenhuma rota do BFF muda.

**Por que agora.** A fila não tem Goal PLANNED. Dos 25 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 a v152: S1b (cor livre fora de `colorToken`); S5, S6, S8 e S9 (a composição de D-114 e a guarda de navegação); CL8 (outra tela); CL9 (carregamento, e `responses` não sabe atrasar uma resposta); H6 e NT3 (sinal de IA instável que o status não tem); N2, N3 e W3 (dado que o contrato não tem). No onboarding, 2.7 e 2.I2 a 2.I10 pedem horários por dia ou uma sessão de importação, e 4.3 pede a vinculação em curso (evidência 4). A v151 tinha deixado 4.4 e 4.5 junto com 4.3, como "dependem da conexão do WhatsApp e da leitura dos contatos ignorados (W3)". Esta passada conferiu as duas uma a uma (evidências 1 a 3): a captura alcança as duas só com `GET`, e a 4.5 não depende da lista de contatos ignorados que falta ao W3, porque o quadro mostra **conversas** com a marca de cada uma, e `GET /v1/conversations` já devolve `ignored` por conversa.

## O que a evidência desta passada mostra

Conferido no código da baseline `f25c6e0`, em `apps/bff/PUBLIC_API_V1.md` (seção "Conversa: categoria, sessão e atendimento humano"), em `packages/public-api-contract/src/schemas.ts` e em `docs/design-reference/claude-design/prototype/project/Onboarding-3-IA-e-WhatsApp.dc.html` (quadros 4.4 "WhatsApp conectado" e 4.5 "Contatos que a IA nunca responde · opcional"), com `Onboarding-3-IA-e-WhatsApp-Tablet.dc.html` (retrato e paisagem) e `Onboarding-3-IA-e-WhatsApp-Desktop.dc.html`.

1. **4.4 no mobile.**
   - O topo: o espaço de 40 px do chevron **vazio**, a barra com três segmentos `#0F5F63` e o quarto `#DCECEB` com 50 % preenchido, e o eyebrow "WhatsApp" (12 px 600, `letter-spacing: .08em`, maiúsculas, `#0F5F63`).
   - O corpo, centrado na vertical (`justify-content: center`, 28 px de espaço): um disco de 104 px `#EFEAE2` com as iniciais em Literata 36 px 500 `#5F574E`, e o selo de 34 px `#2E7D4F` com borda de 3 px `#F7F4EF` e ✓ de 16 px `#FFFDFA`, no canto inferior direito; o nome em Literata 24 px 500; o telefone em 16 px `#5F574E` com `tabular-nums`; a pílula "Conectado" (26 px, fundo `#DFEFE4`, texto `#1F5C39` 12 px 600, ponto de 6 px `#2E7D4F`). Tudo isso entra com `at-pop .5s`.
   - O texto, centrado, com `at-reveal .4s` e atraso de .3 s: "WhatsApp conectado" em Literata 28 px 500 e "É este o número que seus clientes usam para falar com você?" em 15 px `#5F574E`.
   - O rodapé (`padding: 12px 20px 46px`, 14 px de espaço): "Sim, continuar" (primário, 52 px, raio 14 px, `#0F5F63`) e, embaixo, o link "Conectei o número errado" (15 px 600 `#0F5F63`).
   - A legenda: "Detecção automática. Nome e foto quando disponíveis; corrigir o número é possível antes da ativação."
2. **4.5 no mobile.**
   - O topo: o chevron de voltar, a barra com o quarto segmento 62 % preenchido e o eyebrow "WhatsApp".
   - O cabeçalho (6 px de espaço): "Quer impedir que a IA responda algumas pessoas?" em Literata 28 px 500 e "Adicione familiares, amigos ou qualquer contato que você prefira atender sempre pessoalmente." em 14 px `#5F574E`.
   - A busca: 46 px, raio 14 px, borda de 1 px `#D6CEC2`, fundo `#FFFDFA`, a lupa de 18 px e "Buscar nas suas conversas" em 15 px `#716859`.
   - O cartão da lista: raio 16 px, borda de 1 px `#E5DED4`, fundo `#FFFDFA`. Cada linha (`padding: 11px 14px`, 12 px de espaço, divisória de 1 px `#E5DED4`): avatar de 38 px com as iniciais em 13 px 600 (`#EFEAE2`/`#5F574E`, e `#DCECEB`/`#0B4A4E` na "Ana Paula"); o nome em 15 px 600 e a última mensagem em 13 px `#716859`; à direita, a caixa de 24 px, raio 7 px — marcada com fundo `#0F5F63` e ✓ de 14 px `#F7F4EF`, desmarcada com borda de 1,5 px `#D6CEC2`. Cinco linhas, duas marcadas ("Mãe" e "Dudu ❤️").
   - A última linha do cartão: "Adicionar por telefone" (15 px 600 `#0F5F63`) com o círculo tracejado de 38 px e o "+".
   - O rodapé (`padding: 12px 20px 46px`, 12 px de espaço): "Continuar · 2 pessoas" (primário, 52 px) e, embaixo, o link "Pular por agora".
   - A legenda: "Conversas existentes + busca + telefone manual. O CTA soma a escolha. Nenhuma palavra técnica: não existe “blacklist”."
3. **O que o contrato traz e o que não traz.**
   - `whatsappConnectionSchema` traz `id`, `phoneNumber`, `status`, `connectedAt` e `updatedAt`. **Não traz** o nome nem a foto do perfil do WhatsApp. A legenda do 4.4 diz "Nome e foto quando disponíveis": aqui não estão disponíveis.
   - `GET /v1/conversations` aceita `search`, `limit` e o filtro `ignored` (`true`/`false`); sem o filtro, devolve as conversas com `ignored` e `ignoredAt` de cada uma ("contato ignorado, regra do contato"), `customerName`, `externalContactId`, `customerId` e `lastMessage` (com `body`). Marcar e desmarcar uma conversa: `PUT /v1/conversations/:id/ignore` com `{ ignored }`. Marcar por telefone: `PUT /v1/conversations/ignored-contacts`, que devolve o contato.
   - **Não existe** leitura da lista de contatos ignorados por telefone sem conversa: é isso que falta ao W3 (Goal106, evidência 7), e a 4.5 não precisa disso para o quadro.
4. **4.3 continua fora.** O código de vinculação só existe na resposta de `POST /v1/whatsapp/connect` (`pairingCode`), e `responses` só aceita `GET` em alvo autenticado (`scripts/lib/visual-responses.mjs`). Alcançar a 4.3 pediria um passo que toca "Conectar WhatsApp", o que gravaria na conta visual, ou mudar o instrumento. Fica para outra passada.
5. **O app hoje.**
   - **`whatsapp-conectar` conectado.** `WhatsAppConnectionPanel` em fase (`consentPhase`), com o número conectado, mostra o `settings-status-hero` (badge "Conectado", "WhatsApp conectado", "O atendimento automático pode operar neste número." e o telefone) e o botão vermelho "Desconectar número", que abre `DisconnectSheet` (o W2 aceito). O título da etapa é o de `scenarios.ts`, "Ative o atendimento no seu número". O rodapé (`OnboardingScreen.tsx`) tem "Continuar", primário quando conectado, que chama `persistWhatsappStep` (confere a conexão e vai para `contatos-ignorados`). O ponto de extensão `renderConnected` (D-118) só vale sem `consentPhase`: é ele que dá ao W1 de Configurações a sua identidade.
   - **`contatos-ignorados`.** `IgnoredContactsPanel` (`features/whatsapp/`) lê `conversations.list({ ignored: false, limit: 20 })`, mostra cada conversa com o botão "Ignorar", que grava na hora e só então vira "Ignorado", e um campo de telefone com "Adicionar" (`ignoreByPhone`). O mesmo componente abre na folha "Contatos que a IA nunca responde" de Configurações › WhatsApp (`WhatsAppConnectedSettings.tsx`), que não tem quadro neste Goal (W3) e **não muda**. O rodapé da etapa tem "Pular esta etapa" (secundário) **antes** de "Ir para o teste" (primário).
6. **Captura e gate.**
   - O 4.2 (`/onboarding/whatsapp-conectar`, sem `responses`) mede a fase de consentimento da conta parada, sem número. O W1 e o W2 já fixam `GET /v1/whatsapp` com `CONNECTED` em `5511987654321`.
   - Em `Onboarding-3-IA-e-WhatsApp.dc.html`, os donos de `responses` são hoje 4.7, 4.8 e 4.9, e `scripts/tests/visual-responses.test.mjs` afirma isso.
   - `ONBOARDING_ROUTES` (`e2e/routes.ts`) não tem `whatsapp-conectar` nem `contatos-ignorados`.
7. **Testes que citam o que muda.** `goal018-onboarding-reachability`, `goal019-a11y`, `goal063-onboarding-activation`, `goal065-onboarding-copy-whatsapp`, `goal071-onboarding-whatsapp`, `goal072-onboarding-frame` e `goal106-whatsapp` montam uma das duas etapas, o painel de contatos ignorados ou citam "Pular esta etapa", "Ir para o teste" ou "Desconectar número".

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS das duas telas: os valores inline de px, cor, fonte, raio e espaçamento, e as animações. Usa cada arquivo para o seu device: `Onboarding-3-IA-e-WhatsApp.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop, lendo os valores de cada arquivo, sem deduzi-los do mobile. As outras etapas do onboarding e Configurações › WhatsApp não mudam, nem no DOM, nem na captura.
2. **4.4: o número conectado como o quadro.**
   - Só no onboarding, com a leitura dizendo `CONNECTED`: um corpo próprio de "WhatsApp conectado", no lugar do `settings-status-hero` e do "Desconectar número". O caminho preferido é o ponto de extensão `renderConnected` de D-118, passando a valer também com `consentPhase`; se o Developer achar outro caminho mais simples, ele explica em D-143. Configurações › WhatsApp (W1) continua igual.
   - O disco de 104 px com o selo ✓, como o quadro. **Sem nome e sem foto**, porque o contrato não traz (evidência 3): o disco mostra o ícone de pessoa no lugar das iniciais, e o telefone formatado (`formatBrazilianPhone(…, "plus")`) fica na linha do nome, em Literata 24 px. A pílula "Conectado" só aparece com `status: "CONNECTED"` na leitura.
   - O título passa a "WhatsApp conectado" e o texto a "É este o número que seus clientes usam para falar com você?", só neste estado; a fase de consentimento e a vinculação em curso continuam com os títulos de hoje.
   - O rodapé: "Sim, continuar" (primário, o efeito de hoje de "Continuar", `persistWhatsappStep`) e, embaixo, "Conectei o número errado" (link de texto, mínimo de 24 px de alvo), que abre o `DisconnectSheet` de hoje. Desconectar segue o caminho de hoje: depois da resposta, o painel volta ao consentimento.
   - O topo sem o chevron de voltar, se a moldura de etapa já permitir sem mudar outra etapa; se não permitir, fica como divergência declarada.
   - Movimento: `at-pop` no bloco do disco e `at-reveal` no texto, com os tempos do quadro; com `prefers-reduced-motion: reduce`, nada se move e tudo aparece no lugar final.
3. **4.5: escolher conversas como o quadro.** Um corpo próprio do onboarding, ao lado de `IgnoredContactsPanel` (ou o mesmo componente com uma variante só do onboarding); a folha de Configurações continua com a forma e os pedidos de hoje.
   - **A lista é a leitura.** `conversations.list({ limit: 20 })`, **sem o filtro `ignored`**, para que a caixa de cada linha mostre o `ignored` que a leitura trouxe. Cada linha: avatar com as iniciais do `customerName` (ou o ícone de pessoa, sem nome), o nome (ou o telefone formatado de `externalContactId`) e o `lastMessage.body` numa linha só, cortado com reticências. O avatar fica `#DCECEB`/`#0B4A4E` quando a conversa tem `customerId` (a pessoa é cliente da agenda) e `#EFEAE2`/`#5F574E` nos outros casos.
   - **Marcar grava na hora, como hoje.** Tocar a linha (ou a caixa) chama `PUT /v1/conversations/:id/ignore` com o contrário do estado lido; a caixa só muda depois da resposta. Durante o pedido a linha fica ocupada; com erro, a caixa não muda e aparece o erro de hoje ("Não foi possível marcar este contato. Tente novamente."). Nada é afirmado como ignorado sem a marcação gravada. A linha é um controle acessível de marcar (`role="checkbox"` com `aria-checked`, ou `input type="checkbox"`), com nome e foco visível.
   - **A busca.** "Buscar nas suas conversas" filtra pela leitura, com `search` de `GET /v1/conversations` e espera curta entre teclas; sem texto, volta à lista sem busca. Vazio, carregando e erro com os textos de hoje.
   - **Adicionar por telefone.** A última linha do cartão, como no quadro. Tocar abre, no lugar, o campo de telefone e "Adicionar" de hoje (`ignoreByPhone`, as mesmas mensagens de erro). Cada número marcado entra no cartão como linha marcada, com o telefone formatado.
   - **O rodapé soma a escolha.** "Continuar · N pessoas" (ou "Continuar · 1 pessoa"; só "Continuar" com zero), em que N conta as conversas da lista com `ignored: true` na última resposta gravada ou lida, mais os números marcados nesta tela, sem contar duas vezes. O efeito é o de hoje de "Ir para o teste". Embaixo, o link "Pular por agora", com o efeito de hoje de "Pular esta etapa" (`skipIgnoredContactsStep`). Principal primeiro, no DOM e na tela.
   - O cabeçalho em `scenarios.ts`: eyebrow "WhatsApp" (hoje "Antes de testar") e o texto "Adicione familiares, amigos ou qualquer contato que você prefira atender sempre pessoalmente."; o título continua.
4. **CSS.** As regras ficam em `shared/styles/avenly.css`, junto das do onboarding, escopadas por `[data-step="whatsapp-conectar"]`, `[data-step="contatos-ignorados"]` ou por classes novas, sem alterar regra que outra etapa ou Configurações usa.
5. **Alvos.** `targets.json` ganha, ambos de `Onboarding-3-IA-e-WhatsApp.dc.html`, com `account: "onboarding"`, nenhum passo e só `GET`:
   - **4.4**, rota `/onboarding/whatsapp-conectar`, label "WhatsApp conectado": `GET /v1/whatsapp` com `CONNECTED` em `5511987654321`, como o W1;
   - **4.5**, rota `/onboarding/contatos-ignorados`, label "Ignorar contatos": `GET /v1/conversations` com as cinco conversas do quadro (nomes, últimas mensagens, "Mãe" e "Dudu ❤️" com `ignored: true`, "Ana Paula" com `customerId`), válidas para o schema da lista do contrato;
   - nenhum passo toca "Sim, continuar", "Conectei o número errado", uma caixa, "Adicionar", "Continuar · 2 pessoas" nem "Pular por agora";
   - as `notes` citam as divergências declaradas.

   O 4.2 continua sem `responses` e igual à captura de antes.
6. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar 4.4, 4.5, 4.7, 4.8 e 4.9 como donos de `responses` em `Onboarding-3-IA-e-WhatsApp.dc.html` e ganha o teste que prova que 4.4 e 4.5 declaram só o `GET` de cada quadro, sem passos, e que o 4.2 continua sem `responses`. Um teste `goal129` valida cada resposta contra o schema da rota no contrato público.
7. **Gate autenticado.** `ONBOARDING_ROUTES` ganha `/onboarding/contatos-ignorados` (marcador "Quer impedir que a IA responda algumas pessoas?"), com o comentário do estado que a conta parada mostra. `whatsapp-conectar` fica fora do gate: na conta parada ele mede a fase de consentimento, que não é desta tela, e o 4.4 depende de um número conectado. `goal079-onboarding-gate-routes.test.ts` continua passando sem afrouxar asserção.
8. **Divergências declaradas.**
   - Na 4.4, o disco com o ícone de pessoa no lugar das iniciais e o telefone na linha do nome, sem nome nem foto: o contrato não os traz.
   - Na 4.4, o chevron de voltar, se a moldura não permitir tirá-lo sem mudar outra etapa.
   - Na 4.5, as conversas marcadas antes, em outra tela, aparecem já marcadas e contam no rodapé; os números marcados por telefone em outra sessão não aparecem, porque não há leitura deles (evidência 3).
   - O "Sair" do topo abaixo de 1024 px e do rodapé da sidebar (D-104), que os quadros não mostram.
   - A barra de status e o indicador de início do iPhone nos quadros mobile.

   O Developer registra outras que encontrar nas `notes` dos alvos e em D-143, com o motivo.
9. **Decisão.** O Developer propõe **D-143**, por acréscimo, depois das provas, cobrindo o corpo conectado do onboarding e o caminho escolhido, a lista lida sem o filtro `ignored`, a marcação que grava na hora, a busca, a contagem do rodapé, os alvos, a rota do gate e as divergências.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/whatsapp/WhatsAppConnectionPanel.tsx`: só o necessário para o corpo conectado do onboarding (escolha 2). A fase de consentimento, a vinculação, `DisconnectSheet` e o W1 não mudam.
2. `features/whatsapp/IgnoredContactsPanel.tsx` (ou um arquivo novo em `features/whatsapp/` ou `features/onboarding/blocks/`): o corpo da 4.5 (escolha 3). A folha de Configurações não muda.
3. `features/onboarding/OnboardingScreen.tsx`, `features/onboarding/blocks/whatsapp.tsx` e `features/onboarding/scenarios.ts`: o título e o rodapé da 4.4, o rodapé e o cabeçalho da 4.5.
4. `shared/styles/avenly.css`: o CSS das duas telas nos quatro devices e o movimento (escolha 4).

`OnboardingRuntime.tsx`, `blocks.ts`, as outras etapas, `features/settings/`, o contrato e o BFF não mudam. `OnboardingShell.tsx` só muda se for o caminho para tirar o chevron da 4.4, sem efeito em outra etapa.

### 2. A captura e o gate

1. `apps/frontend/e2e/visual/targets.json`: o 4.4 e o 4.5 (escolha 5).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 6.
3. `apps/frontend/e2e/routes.ts`: a rota da escolha 7.

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal129-*.test.tsx` / `.test.ts`:
   - **4.4:** com a leitura `CONNECTED`, o corpo novo com o telefone formatado, a pílula "Conectado", "WhatsApp conectado", o texto do quadro, "Sim, continuar" (vai para `contatos-ignorados`) e "Conectei o número errado" (abre a folha; nada é desconectado sem confirmar). Sem conexão, a fase de consentimento de hoje. Configurações › WhatsApp igual à de hoje.
   - **4.5, lista:** a leitura sem o filtro `ignored`; a caixa de cada linha pelo `ignored` lido; o avatar por `customerId`; o nome, ou o telefone sem nome.
   - **4.5, marcar:** a caixa só muda depois da resposta do `PUT`, com o valor contrário; com erro, não muda e mostra o erro; desmarcar chama `ignored: false`.
   - **4.5, busca e telefone:** a busca chama a leitura com `search`; "Adicionar por telefone" abre o campo, e o número marcado entra como linha marcada; as mensagens de erro de hoje.
   - **4.5, rodapé:** "Continuar" com zero, "Continuar · 1 pessoa", "Continuar · 2 pessoas", sem contar duas vezes; o efeito de "Continuar" e de "Pular por agora"; a ordem no DOM.
   - **A folha de Configurações:** "Contatos que a IA nunca responde" com a forma e os pedidos de hoje.
   - **Alvos:** as respostas do 4.4 e do 4.5 válidas para o schema da rota.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 6.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a caixa da 4.5 que muda antes da resposta do `PUT` faz um teste reprovar;
   - (b) a lista da 4.5 lida com `ignored: false` faz um teste reprovar;
   - (c) o rodapé que conta duas vezes um número já marcado, ou que conta uma conversa desmarcada, faz um teste reprovar;
   - (d) a pílula "Conectado" da 4.4 com a leitura sem `CONNECTED` faz um teste reprovar;
   - (e) o 4.5 de `targets.json` com um passo que toca uma caixa faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 7 só troca o texto, a ordem ou a ação que este Goal muda. Nenhum ajuste afrouxa asserção sobre consentimento, vinculação, desconexão, contatos ignorados, teste real ou conclusão do onboarding. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 4.4,4.5` e, para regressão, `--target 4.1,4.2,4.6,W1,W2`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 128.
   - Antes de editar, o Developer guarda o `app.png` dos alvos de regressão. Depois, mostra que eles não mudaram, ou explica cada diferença.
   - O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco. Nenhuma rota nova: o nome e a foto do perfil e a lista de contatos ignorados por telefone ficam fora até o contrato os trazer.
- A fase de consentimento (4.2), a vinculação (4.3), a introdução do WhatsApp (4.1), o teste real (4.6 a 4.10) e Configurações › WhatsApp (W1, W2 e a folha de contatos ignorados, W3).
- O resto das lacunas visuais sem ID (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3, 2.7, 2.I2 a 2.I10 e 4.3) e as outras observações abertas dos reviews 116 a 128.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-143** em `PROPOSED`, conforme a escolha 9. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal129.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal129, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado e as retentativas de cada um; um gate que o IA Loop roda depois do relatório é registrado com o resultado dele, nunca como "não executado";
  - os controles negativos e a rodada em que rodaram;
  - o `visual:compare` (alvos, percentuais, regressão e diferenças que restam);
  - a lista dos testes ajustados.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Montar a pilha descartável própria e capturar a regressão de antes, sem editar nada.
2. Implementar a 4.4 e a 4.5, com os testes `goal129`.
3. Adicionar os alvos, os testes da captura e a rota do gate.
4. Rodar o `visual:compare` de 4.4 e 4.5, e o de 4.1, 4.2, 4.6, W1 e W2 para regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `/onboarding/whatsapp-conectar` com o número conectado igual ao quadro 4.4 nos 4 devices e `/onboarding/contatos-ignorados` igual ao quadro 4.5 nos 4 devices, salvo as divergências declaradas. Provado em jsdom e pelo `visual:compare`.
2. A 4.4 só mostra o número e "Conectado" com a leitura `CONNECTED`; "Sim, continuar" faz o que "Continuar" fazia, e "Conectei o número errado" só desconecta depois da confirmação na folha de hoje.
3. Na 4.5, cada caixa vem do `ignored` lido ou da resposta gravada, nunca antes dela; a busca usa `search` da leitura; "Adicionar por telefone" marca pelo caminho de hoje; o rodapé soma a escolha sem contar duas vezes, e "Continuar" e "Pular por agora" fazem o que "Ir para o teste" e "Pular esta etapa" faziam.
4. As outras etapas do onboarding e Configurações › WhatsApp, inclusive a folha de contatos ignorados, não mudam. 4.1, 4.2, 4.6, W1 e W2 iguais à captura de antes, ou com cada diferença explicada.
5. Nenhum pedido ao BFF muda de rota, e nenhum passo de captura toca controle que grava. O teste da captura prova que 4.4 e 4.5 só declaram o `GET` de cada quadro.
6. Os cinco controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/onboarding/contatos-ignorados` passa nas cinco larguras (360, 390, 768, 1024 e 1440). O gate mede overflow horizontal ausente, alvo de toque de 24 px no mínimo (inclusive "Pular por agora" e "Adicionar por telefone"), contraste (inclusive `#716859` sobre `#FFFDFA` e `#0F5F63` sobre `#F7F4EF`), foco visível e `prefers-reduced-motion`. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora destes: os arquivos do §1; `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `apps/frontend/e2e/routes.ts` e `scripts/tests/visual-responses.test.mjs`; os três registros da seção "Documentação".
9. D-143 proposta, conforme a escolha 9.

## Plano de execução

1. **WU-01 — A 4.4.** O corpo conectado do onboarding, o título e o rodapé, o CSS com o movimento e os testes `goal129` da 4.4 e de Configurações › WhatsApp.
2. **WU-02 — A 4.5.** A lista lida sem o filtro, a marcação que grava na hora, a busca, "Adicionar por telefone", o rodapé que soma, o cabeçalho, o CSS, os testes `goal129` da 4.5 e da folha de Configurações, e os ajustes dos testes existentes.
3. **WU-03 — Captura, gate, fidelidade, provas e registros.** Os alvos 4.4 e 4.5, os testes da captura, a rota do gate, o `visual:compare` com a regressão, os controles negativos, D-143, CURRENT_STATE e VALIDATION_GATE.
4. **Verificação determinística:**
   - typecheck, lint, testes alvo `goal129`;
   - suíte do frontend, testes de ferramenta e `test:gate`;
   - `validate:core`, `validate:ui` e `validate:integration`;
   - `git diff --check`.
