# Goal 095 — Serviços iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal103 ACCEPTED](../reviews/103-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: Servicos:S1, S3, Servicos:S4, Agenda:S1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED), a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01), com os quadros Servicos:S1, S3, Servicos:S4 e Agenda:S1. **READY na v126**, com o mesmo ID, título e quadros.

## Baseline aceita

Baseline aceita: `a4cf1f6bc03055f60106bf583a8c433de11e56b6`

Goal anterior: 103 — A listagem de agendamentos traz o valor registrado e a presença confirmada

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal103 já integrado em `main` (origem `efb21000e087721b597edd013a187b39211397a9`). **Duas rodadas**, com 4 e 0 blockers. **D-113** aceita. A virada de status do documento do Goal103 para `ACCEPTED` não entrou no commit de fechamento: veio no commit documental `ca50a55`, que não é baseline. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/servicos`, `/servicos/novo` e `/servicos/editar` iguais aos quadros Servicos:S1, S3, Servicos:S4 e Agenda:S1 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`: Servicos:S1 abre `/servicos`, S3 abre `/servicos/novo`, e Servicos:S4 e Agenda:S1 abrem `/servicos/editar?id={serviceId}`. Os dois últimos são estados diferentes da mesma tela e ganham passos neste Goal (escolha (e)).

**Por que agora.** Clientes fechou no 094, e a listagem de agendamentos, no 103. Na ordem da v113, o próximo módulo é Serviços. A composição já existe: o 088 pôs a lista ao lado do formulário de 1024 px em diante e a tela empurrada abaixo disso (D-103), e portou o corpo do S4. O 076 já trouxe os três grupos da lista, a linha "duração · preço" e o filete na cor (D-091). Falta conteúdo de tela e a paleta. Nada disso exige rota, contrato ou BFF novos.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Servicos.dc.html`, `Servicos-Tablet.dc.html`, `Servicos-Desktop.dc.html`, `Agenda.dc.html` e a legenda de cores de `Atendly.dc.html`), no código da baseline e no contrato (`packages/public-api-contract/src/schemas.ts`).

1. **S1 (lista).** Cabeçalho "Serviços" com o resumo "6 ativos · 1 precisa de revisão · 1 inativo". Cada linha tem o traço na cor do serviço, o nome e "45 min · R$ 90". A pendência fica em âmbar, com "Precisa de revisão · sem duração" e a ação "Corrigir" ao lado. "Inativos" fica separado, em cinza, com "· a IA não oferece". A legenda do quadro diz: "Sem descrição na lista". **A linha não tem botão "Desativar"**; o app tem esse botão em cada linha (`ServiceList.tsx`, D-091 item 5), além do resumo "Serviços cadastrados" e de um cabeçalho próprio. Medida do 094 (início e fim): **8,8 / 5,3 / 3,9 / 2,9**.
2. **S3 (novo serviço).** Título "Novo serviço". Campos "Nome" e "Duração" (− 40 min +, atalhos 30, 60 e 90). "Preço" com controle segmentado "Fixo | A partir de | Sob consulta | Sem preço" e o valor "R$ 55,00". A frase "A IA responde: …". Depois, "Mais opções" como **linhas fechadas que mostram o valor atual**: "Cor na agenda · Sem cor", "Descrição · Opcional", "Recorrência · Não", "Intervalo antes e depois · Nenhum" e "Instruções para a IA · Nenhuma". O CTA é "Salvar serviço". A legenda diz: "Novo serviço nasce ativo". O app (`ServiceForm.tsx`) tem o título de seção "Essencial", "Nome do serviço", o seletor de tipo de preço com "Preço fixo" e "Não informado", "Prévia · como a IA responde", as opções **sempre abertas** (D-103), a caixa "Serviço ativo" também na criação e o CTA "Criar serviço". Medida do 088: **7,0 / 7,5 / 13,4 / 7,7**.
3. **Servicos:S4 (editar, opções abertas).** Portado pelo 088 (D-103), com a linha-resumo aberta (`ESSENTIALS_OPEN_ON_EDIT = true`, divergência 4 de D-103, autorizada no review088). As linhas do quadro aparecem abertas: "Recorrência", "Intervalo antes e depois" com os steppers Antes e Depois, "Instruções para a IA · só ela lê" e "Serviço ativo". O CTA é "Salvar alterações". "Onde é feito" não existe no contrato `Service`. Medida do 094: **9,7 / 8,7 / 14,2 / 8,7**.
4. **Agenda:S1 (editar, cor na agenda).** Mesma tela, com "Cor na agenda (opcional)" aberta: "sem cor", **seis cores** e o "+" do seletor livre; o texto "Seis cores sugeridas ou toque em + para escolher qualquer outra no seletor de cores."; e a prévia "Assim na agenda", uma linha da Agenda com hora, traço na cor, nome e "Corte feminino · 45 min · R$ 90". O app mostra "Identidade visual (opcional)", um seletor com nomes próprios e um quadrado de cor com texto de ajuda. Medida do 088: **9,7 / 8,9 / 14,4 / 8,8**.
5. **A paleta.** A legenda de cores do protótipo (`Atendly.dc.html`) nomeia as seis cores, na ordem do quadro: **Ameixa `#8E5A86`, Terracota `#B8674A`, Oliva `#7C8A3E`, Ardósia `#5B6E9A`, Rosa-antigo `#C07A88` e Lavanda `#8B7BB5`**. O contrato tem seis tokens (`ROSE`, `AMBER`, `EMERALD`, `SKY`, `VIOLET`, `SLATE`), persistidos no Scheduling. O app os chama de "Rosa", "Âmbar", "Esmeralda", "Azul-celeste", "Violeta" e "Ardósia" (`ServiceForm.tsx`), com outros hex. O hex mora num lugar só: as regras `[data-color="…"]` de `shared/styles/atendly-services.css`, que a Agenda e Clientes também leem por `--swatch` (D-108 (f)). D-108 (f) e D-112 deixaram a troca para este Goal.
6. **O que o contrato não tem.** Cor livre (S1b, o "+"), "Onde é feito" (estúdio ou domicílio) e o menu "•••" com o sheet de desativar (S8). Isso entra como divergência declarada, não como contrato novo.
7. **Gate.** `/servicos` está em `AUTHENTICATED_ROUTES`. G-4 e G-5 (Goal088) medem a lista e o formulário nas duas faixas. Dois testes do gate autenticado tocam este formulário: "servicos: a 45-minute service saves through the form" preenche `input[name="duration"]` logo que `/servicos/editar` carrega e clica "Salvar alterações"; "servicos: Criar serviço is reached by a real click" clica o botão pelo nome "Criar serviço". O segundo deixa de achar o botão quando o CTA vira "Salvar serviço" (escolha (c)).

## Escolhas de desenho desta passada

**(a) A composição não muda.** Lista e formulário de D-103 continuam como o 088 deixou: lista ao lado de 1024 px em diante, tela empurrada com `PushedBar` abaixo disso, e **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031, D-103 (f)). `ListDetail.tsx`, `PushedBar.tsx`, `useWideLayout.ts`, `AppShell.tsx` e `ShellConfig.tsx` não mudam. Clientes, Configurações e a Agenda não podem mudar de estrutura. O cabeçalho do S1 no mobile ("‹ Mais" acima de "Serviços") entra só se a `ShellConfig` da lista já o permitir; se não, é divergência declarada.

**(b) S1: a linha do quadro, sem ação de status.** Porte a linha: traço na cor, nome, "duração · preço" de `formatServiceLine`, pendência em âmbar com "Corrigir" e inativos separados em cinza. O resumo do quadro fica no cabeçalho. **O botão "Desativar"/"Ativar" sai da linha**, como no quadro. Ativar e desativar continuam pela caixa "Serviço ativo" do formulário de edição, que já existe desde o 088 e já envia `active` no mesmo `PATCH /v1/services/:id`. Sem `editable`, a lista continua sem link de edição, sem "Corrigir" e com "Somente leitura". O link da linha inteira mantém o nome acessível **exatamente** `Editar <nome>`, e a classe-marcador `directory-row` fica no `<li>` (D-091 itens 2 e 4). Isso revê só o item 5 de D-091.

**(c) S3: o formulário do quadro.** "Nome", "Duração" e "Preço", sem o título de seção "Essencial". O preço é um controle segmentado com quatro opções, "Fixo", "A partir de", "Sob consulta" e "Sem preço", que gravam `FIXED`, `STARTING_AT`, `ON_REQUEST` e `NOT_INFORMED`. Ele tem papel e estado acessíveis (`radiogroup` com `radio`, ou botões com `aria-pressed`). O campo "R$" e a máscara de D-099 não mudam. A frase "A IA responde: “…”" usa `formatServicePreview`, sem artigo fixo (D-091 item 7, D-099). A mensagem da regra de preço continua começando por "Informe o valor"; o resto dela pode citar "Sem preço". O CTA da criação passa a "Salvar serviço". A caixa "Serviço ativo" **não aparece na criação**, e o pedido de criação continua com `active: true`.

**(d) As opções são linhas que abrem uma a uma.** "Mais opções" vira uma lista de linhas: "Cor na agenda", "Descrição", "Recorrência", "Intervalo antes e depois" e "Instruções para a IA". Cada linha mostra o valor atual à direita ("Sem cor" ou o nome da cor, "Opcional" ou o começo do texto, "Não" ou "A cada N semanas", "Nenhum" ou "Antes 0 · Depois 15", "Nenhuma" ou "Definidas"). Cada linha é um botão com `aria-expanded` e abre o editor da opção no lugar, como no S4. **Todas nascem fechadas**, na criação e na edição. Abrir uma não fecha as outras. Os campos de cada opção, seus nomes acessíveis e sua validação não mudam: buffers com `min` 0 e `step` 5 e os nomes "Intervalo antes/depois do atendimento (minutos)", a recorrência, a descrição e as instruções para a IA (Goal078). Campo de uma linha fechada continua no formulário e é enviado; fechar não descarta valor. Na edição, "Serviço ativo" fica abaixo das linhas, como no S4, e o CTA continua "Salvar alterações". A linha-resumo do topo na edição continua aberta (`ESSENTIALS_OPEN_ON_EDIT` e divergência 4 de D-103 sem mudança), para que o teste dos 45 minutos não mude. Isso revê só a frase de D-103 sobre as opções "sempre abertas".

**(e) Agenda:S1 e Servicos:S4 por passos de `targets.json`.** As duas abrem `/servicos/editar?id={serviceId}` e só diferem pelas linhas abertas. Acrescente `steps` só a essas duas entradas de `targets.json`: no Agenda:S1, abrir "Cor na agenda"; no Servicos:S4, abrir "Recorrência", "Intervalo antes e depois" e "Instruções para a IA". Use `click` ou `clickRole` pelo nome acessível da linha, como CL6 e CL7. Nenhuma outra entrada muda.

**(f) A cor do quadro.** Aberta, "Cor na agenda (opcional)" mostra "sem cor" e as seis cores como círculos de 40 px, com a marca de escolhido do quadro. Elas formam um grupo de escolha única com nome acessível. Cada opção tem o nome da cor e estado. O texto de apoio é "Seis cores sugeridas." (sem o "+", escolha (g)). Abaixo fica a prévia "Assim na agenda": hora de exemplo "15:30", traço na cor escolhida (neutro sem cor), o nome de exemplo "Cliente" e a linha "<nome do serviço> · <duração> · <preço>" com os valores atuais do formulário, formatados pelas funções de `serviceFormatting.ts`. Escolher a cor grava o mesmo `colorToken` de hoje.

**(g) A paleta do protótipo, sem mudar o token.** Os seis tokens persistidos continuam os mesmos no contrato, no Scheduling, no BFF e na IA. Mudam só o nome mostrado e o hex. Ordem de exibição e mapa:

| Ordem | Nome na tela | Hex | Token persistido |
| --- | --- | --- | --- |
| 1 | Ameixa | `#8E5A86` | `SKY` |
| 2 | Terracota | `#B8674A` | `AMBER` |
| 3 | Oliva | `#7C8A3E` | `EMERALD` |
| 4 | Ardósia | `#5B6E9A` | `SLATE` |
| 5 | Rosa-antigo | `#C07A88` | `ROSE` |
| 6 | Lavanda | `#8B7BB5` | `VIOLET` |

Motivo do mapa: `SLATE` já se chama "Ardósia" e fica com o nome; `ROSE`, `AMBER`, `EMERALD` e `VIOLET` vão para a cor do protótipo de mesma família; `SKY` é o único token sem família correspondente e fica com Ameixa. O hex muda só nas regras `[data-color="…"]` de `atendly-services.css`. A Agenda (A1, A10, A11) e Clientes (CL6) passam a mostrar as novas cores pelo mesmo `--swatch`, sem mudar código deles. A cor nunca é a única informação (D-108 (f)).

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O aviso de WhatsApp desconectado, o cartão da IA da sidebar com "WhatsApp desconectado" e o item "Notificações" da sidebar (D-102), estado da conta de teste.
3. Os dados: nomes, durações, preços, recorrências, contagens, cores escolhidas e instruções são os da conta de teste.
4. O "+" e o seletor de cor livre (S1b): o contrato só tem os seis tokens. O texto de apoio perde a parte do "+", por (f).
5. "Onde é feito" no S4: o contrato `Service` não tem o campo (D-103).
6. A linha-resumo do topo do S4 aberta na edição (divergência 4 de D-103, mantida por (d)).
7. "Salvar" no Agenda:S1 fica "Salvar alterações", o CTA da edição no S4 e no gate.
8. A frase "A IA responde" sem artigo ("Manicure custa … e leva 40 min.", não "A manicure é …"), por D-091 item 7 e D-099.
9. O nome "Cliente" na prévia "Assim na agenda", no lugar de "Ana Paula", por (f).
10. O menu "•••" e o sheet de desativar (S8): desativar fica na caixa "Serviço ativo", por (b).

## Escopo obrigatório

### 1. Servicos:S1, S3, Servicos:S4 e Agenda:S1 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Servicos.dc.html` (mobile), `Servicos-Tablet.dc.html` ("Serviços / <rótulo> / Portrait" e "… / Landscape"), `Servicos-Desktop.dc.html` ("Serviços / <rótulo> / Desktop"), com os rótulos "Serviços · lista", "Novo serviço" e "Editar serviço · opções"; e `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`, rótulo "Serviço · editar".

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target Servicos:S1,S3,Servicos:S4,Agenda:S1` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros Servicos:S1, S3, Servicos:S4 e Agenda:S1 nos 4 devices**. Para cada quadro e cada device, o relatório final traz o diff do início e do fim e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script.

### 2. O resto da área logada não quebra

Rode `npm run visual:compare -- --target CL1,CL6,M1,N1,A1,A10,H3` no início e no fim e cole o diff de cada device das duas execuções. Clientes e Configurações usam a mesma composição de D-103: eles não pioram. O traço de cor de A1, A10 e CL6 **muda de cor por (g)**; essa mudança é esperada e é descrita, não conta como piora. Qualquer outra piora tem causa medida. As rotas de Clientes, Configurações, Agenda e Conversas e a casca não mudam.

### 3. Comportamento preservado

- A busca por nome continua filtrando a lista, e um grupo que a busca esvazia some.
- A linha inteira continua abrindo a edição; de 1024 px em diante, o formulário abre no painel.
- "Corrigir" continua levando à edição do serviço pendente.
- Criar envia o mesmo pedido de hoje (`POST /v1/services`), com `active: true`. Editar envia o mesmo `PATCH /v1/services/:id`. As instruções para a IA continuam no mesmo `PUT /v1/services/:id/ai-instruction` (Goal078), com o mesmo aviso quando só elas falham.
- A duração aceita 40, 45, 60 e 41, recusa 0 e aceita vazio (Goal058). "−", "+" e os atalhos fazem o que fazem hoje (D-091 item 6).
- O preço é digitado em reais e formatado ao sair do campo (D-099). A regra de preço responde antes de qualquer pedido.
- Ativar e desativar um serviço, agora só pela caixa "Serviço ativo" da edição, enviam `active` no mesmo `PATCH`.
- Fonte sem edição continua só leitura, na lista e no formulário.
- O erro de cada operação continua anunciado por `role="alert"`.

### 4. Provas novas

`apps/frontend/tests/goal095-servicos.test.tsx`, no padrão de `goal076-service-list.test.tsx`, `goal076-service-form.test.tsx` e `goal088-list-detail.test.tsx`:

1. **Lista (S1).** O resumo, a linha com nome e "duração · preço", o traço com `data-color`, a pendência com "Corrigir" e os inativos com "a IA não oferece". Nenhuma linha tem botão "Desativar" ou "Ativar". O link `Editar <nome>` e a classe `directory-row` continuam.
2. **Novo serviço (S3).** Os rótulos "Nome", "Duração" e "Preço", sem "Essencial". O preço tem quatro opções com estado, e cada uma grava o `priceType` de (c). As cinco linhas de opção nascem fechadas (`aria-expanded="false"`), mostram o valor atual e abrem ao toque. "Serviço ativo" não aparece. O CTA é "Salvar serviço", e o pedido de criação leva `active: true` e os mesmos campos de hoje.
3. **Editar (S4 e Agenda:S1).** As linhas nascem fechadas e abrem ao toque, e os campos de buffer, recorrência e instruções mantêm nome acessível e validação. Fechar uma linha alterada não descarta o valor no pedido. "Cor na agenda" mostra "sem cor" e as seis cores na ordem e com os nomes de (g); escolher envia o token do mapa; a prévia "Assim na agenda" mostra a cor escolhida e a linha do serviço. Desmarcar "Serviço ativo" e salvar envia `active: false` no `PATCH`.
4. **Paleta.** As regras `[data-color="…"]` de `atendly-services.css` têm o hex de (g) para cada token, conferidas pelo texto do arquivo.
5. **Casca.** Uma chamada de `useShellConfig` por árvore renderizada em `/servicos`, `/servicos/novo` e `/servicos/editar`, nas duas faixas, no padrão de `goal088-list-detail`.

As provas 1 a 4 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. A prova 5 guarda comportamento e pode passar na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa de texto, rótulo ou estrutura que o quadro troca. Exemplos: "Criar serviço", "Nome do serviço", "Preço fixo", "Não informado", "Essencial", "Identidade visual", os nomes antigos das cores e o botão "Desativar"/"Ativar" da linha. Teste que abre uma opção passa a tocar a linha dela antes. Teste que ativa ou desativa pela linha passa a fazer isso pela caixa "Serviço ativo" da edição, com a mesma asserção sobre o `PATCH`. Prováveis afetados: `goal015-services`, `goal058-service-form`, `goal076-service-form`, `goal076-service-list`, `goal078-service-instruction-form` e `goal088-list-detail`. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. A única mudança autorizada no gate autenticado

Em `apps/frontend/e2e/authenticated-matrix.spec.ts`, só no teste "servicos: Criar serviço is reached by a real click": o nome do botão no locator passa de "Criar serviço" para "Salvar serviço", e as mensagens do teste citam o novo nome. O título do teste **não muda**, para que ele mantenha a identidade nas contagens. A espera por `role="alert"` com "Informe o valor", a lista `created` vazia e todo o resto ficam iguais. Nenhum outro teste, helper ou seletor do arquivo muda, inclusive `saveDurationByForm`. O gate continua com **255** testes.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A linha da lista volta a mostrar o botão "Desativar": a prova 1 reprova.
2. "Sem preço" grava `ON_REQUEST`: a prova 2 reprova.
3. A linha "Recorrência" nasce aberta: as provas 2 e 3 reprovam.
4. `[data-color="SKY"]` volta a `#5b8fb0`: a prova 4 reprova.
5. O formulário de edição chama `useShellConfig` duas vezes na mesma árvore: a prova 5 reprova.

## Pontos de implementação

- `apps/frontend/src/features/services/`: `ServiceList.tsx`, `ServiceForm.tsx` e `serviceFormatting.ts` (só por acréscimo, se o valor atual de uma linha de opção exigir uma função nova; as funções existentes não mudam de saída). `ProductServicesScreen.tsx` só se a composição exigir, sem mudar D-103.
- `apps/frontend/src/shared/styles/atendly-services.css`, inclusive as regras `[data-color="…"]`. `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- `apps/frontend/src/data/services/BffServiceCatalogService.ts`: nada muda no tipo do token.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/e2e/visual/targets.json`: só os `steps` das entradas Agenda:S1 e Servicos:S4, por (e).
- `apps/frontend/e2e/authenticated-matrix.spec.ts`: só o que o §6 autoriza.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- S2, S5 a S9 e S1b, que a conta de teste não alcança ou que dependem de contrato. O que eles compartilham com S1, S3 e S4 pode mudar junto, declarado no relatório.
- Cor livre, "Onde é feito", o menu "•••" e o sheet de desativar, e qualquer outra mudança de contrato.
- Renomear ou migrar os tokens de cor. O token persistido não muda neste Goal.
- O primeiro serviço e a lista de serviços do onboarding (2.3 e 2.4, D-105), Clientes (094), Conversas e Notificações (096) e Configurações (097).
- Qualquer mudança em rota, contrato, BFF, Scheduling, IA, `scripts/` (inclusive o seed visual), `docs/design-reference/`, vault, `e2e/routes.ts` e as demais entradas de `e2e/visual/targets.json`.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-114** em `PROPOSED`, no formato de D-112. Ela diz (a) a (g), com o motivo de cada um, a tabela da paleta e as divergências declaradas. Ela registra que (b) revê só o item 5 de D-091 e que (d) revê só a frase de D-103 sobre as opções sempre abertas. Ao fim de D-091 e de D-103 entra, só por acréscimo, uma linha "**Revista em parte por D-114**" que diz qual item, no formato da nota que D-108 deixou em D-089. Ela não reescreve D-091, D-099, D-103, D-105 nem D-108. O "Revisar se" cobre três casos: o contrato ganhar cor livre ou "Onde é feito"; uma pessoa preferir outro mapa de tokens para a paleta; e o Goal102 ou outro Goal migrar os tokens de cor.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que Serviços segue Servicos:S1, S3, Servicos:S4 e Agenda:S1, a paleta nova e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim dos quadros do §1 e do §2, a mudança do §6 e a contagem do gate autenticado.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md) só se uma linha vigente de Serviços ficar falsa.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target Servicos:S1,S3,Servicos:S4,Agenda:S1,CL1,CL6,M1,N1,A1,A10,H3` na baseline e colar o diff de cada par. Na baseline, Servicos:S4 e Agenda:S1 rodam sem os passos novos.
2. Implementar, iterando com `npm run visual:compare -- --target Servicos:S1,S3,Servicos:S4,Agenda:S1`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target Servicos:S1,S3,Servicos:S4,Agenda:S1,CL1,CL6,M1,N1,A1,A10,H3`.
6. Rodar os cinco controles do §7.
7. Escrever a prosa só depois disso.

Os controles do §7 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Contraste intermitente em `onboarding-demonstracao-da-ia`.** No 103, uma execução de `validate:integration` falhou por contraste nessa tela, e as duas seguintes, na mesma árvore, passaram sem retentativa; a causa não foi medida (observação 1 do [review103](../reviews/103-review.md)). Se acontecer de novo, rode `validate:integration` outra vez na mesma árvore e registre as duas execuções. Não mude `e2e/` por causa disso: o §6 é a única mudança autorizada no spec.

**Retentativas e recurso do host.** Nos Goals 092, 100, 093 e 101, o `validate:ui` com a configuração padrão teve retentativas em rotas públicas (`Target crashed`), e com `CI=1`, que a configuração já lê para usar 1 worker, a mesma árvore deu 0. No 101, `validate:core` sem variável falhou por memória (`Zone Allocation failed - process out of memory`) e passou com `VITEST_MAX_WORKERS=2`. Se acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração. No 103, uma unidade de diagnóstico editou `e2e/authenticated-matrix.spec.ts` e gerou blocker: fora do §6, o spec não muda.

No relatório, para cada quadro e cada device, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target Servicos:S1,S3,Servicos:S4,Agenda:S1` e abriu os dezesseis `side-by-side.png`. Serviços está **igual aos quadros Servicos:S1, S3, Servicos:S4 e Agenda:S1 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas, inclusive na lista ao lado do formulário em paisagem e desktop.
2. Clientes, Configurações, a Agenda e a Home não quebraram: CL1, CL6, M1, N1, A1, A10 e H3 do início e do fim, com o que mudou descrito. A troca de cor do traço por (g) é a única mudança esperada. Toda outra piora tem causa medida.
3. As provas 1 a 4 passam e reprovaram na baseline, salvo asserção declarada. A prova 5 passa. Os cinco controles do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem os **255** testes da baseline, com **0** retentativas, inclusive G-4 e G-5 de Serviços e os dois testes do formulário citados na evidência 7. `validate:ui` passa nas cinco larguras. Retentativa é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. `e2e/authenticated-matrix.spec.ts` difere da baseline só pelo que o §6 autoriza, e `e2e/visual/targets.json`, só pelos `steps` de Agenda:S1 e Servicos:S4.
8. D-114 está em `PROPOSED`, com as notas "Revista em parte por D-114" em D-091 e D-103 só por acréscimo. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
9. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; S2, S5 a S9 e S1b, que a conta de teste não alcança; cor livre, "Onde é feito" e o sheet de desativar, que dependem de contrato ou de Goal futuro.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; S1 (linha do quadro, sem botão de status) e a paleta de (g) em `atendly-services.css` |
| WU-02 | STANDARD | WU-01 | S3, S4 e Agenda:S1: preço segmentado, linhas de opção fechadas com valor, cor do quadro com a prévia "Assim na agenda", "Salvar serviço", `steps` de `targets.json` e a mudança do §6 no spec |
| WU-03 | STANDARD | WU-01, WU-02 | Provas 1 a 5 com o vermelho da baseline; asserções do §5 |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal095-servicos` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | `visual:compare` final, controles negativos (§7) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
