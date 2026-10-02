# Goal 094 — Clientes iguais ao protótipo

**Status: READY.** Preparado em 2026-10-02 pelo Tech Lead Agent após [Goal101 ACCEPTED](../reviews/101-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL1, CL4, CL5, CL6, CL7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v113 (PLANNED), a partir do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01), com os quadros CL1, CL4, CL5, CL6 e CL7. **READY na v124**, com o mesmo ID, título e quadros.

## Baseline aceita

Baseline aceita: `c809444dd499f89d77d990345d6ca6e5bfc720aa`

Goal anterior: 101 — Novo agendamento igual ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal101 já integrado em `main` (origem `dd070a3779d992485fb3c62e04e4cf718f28031d`). **Quatro rodadas**, com 3, 5, 1 e 0 blockers. **D-111** aceita. A virada de status do documento do Goal101 para `ACCEPTED` entrou no próprio commit de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **`/clientes`, `/clientes/novo` e `/clientes/detalhes` (abas Resumo, Atendimentos e Notas) iguais aos quadros CL1, CL4, CL5, CL6 e CL7 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768). O mapa quadro→rota já está em `apps/frontend/e2e/visual/targets.json`: CL1 abre `/clientes`, CL4 abre `/clientes/novo`, CL5 abre `/clientes/detalhes?id={customerId}`, e CL6 e CL7 abrem a mesma rota e tocam "Atendimentos" e "Notas".

**Por que agora.** A Agenda terminou com o 101: A1, A5, A6, A8, A9, A10 e A11 estão iguais ao quadro. Na ordem da v113, o próximo é Clientes. A composição já existe: o 088 pôs a lista ao lado do detalhe de 1024 px em diante e a tela empurrada abaixo disso (D-103), e portou o corpo do Resumo (CL5). O que falta é conteúdo de tela: as linhas da lista, o formulário do novo cliente e as abas Atendimentos e Notas. Nada disso exige rota, contrato ou BFF novos.

## O que a evidência desta passada mostra

Conferido no protótipo (`docs/design-reference/claude-design/prototype/project/Clientes.dc.html`, `Clientes-Tablet.dc.html` e `Clientes-Desktop.dc.html`), no código da baseline e no contrato (`packages/public-api-contract/src/schemas.ts`).

1. **CL1 (lista).** Cabeçalho "Clientes" com a contagem ("386"), busca "Buscar por nome ou telefone", grupos por letra e, em cada linha, avatar com iniciais, nome, telefone formatado ("+55 11 99123-4567") e, à direita, **uma** informação: "próximo sex 15:30" em petróleo, "último há 3 sem" em cinza, "último faltou · hoje" com a falta em vermelho ou "sem atendimentos". Cliente sem telefone mostra quem agenda por ele ("Maria Souza agenda por ele"). Cadastro importado sem nome aparece como "Cadastro sem nome · importado" com a ação "Nomear". De 1024 px em diante a lista fica à esquerda, com "Selecione um cliente para ver o perfil" no painel. O app já agrupa por letra, já calcula próximo e último (`CustomerList.tsx`, Goal075 CL-01) e já tem o grupo sem nome. Medida do 088 (rodada 3): **11,0 / 5,1 / 3,4 / 2,7**.
2. **CL4 (novo cliente).** Título "Novo cliente". Campos "Nome" e "Telefone (opcional)", este com o valor no formato "+55 (11) 9…". Texto de apoio: "Com o telefone, a IA reconhece a pessoa quando ela escrever no WhatsApp. Sem telefone serve para crianças ou para quem é agendado por outra pessoa." Uma linha opcional "Alguém agenda por esta pessoa? Vincule um responsável, como mãe ou pai". CTA "Salvar cliente". O app (`CustomerForm.tsx`) tem "Telefone" sem "(opcional)", ajudas próprias em cada campo, placeholder "(00) 00000-0000", sem a linha do responsável, e o CTA "Criar cliente". Depois de criar, o app já vai para o perfil, onde o vínculo com responsável existe (`PrimaryGuardianPanel`). Medida do 088: **5,8 / 2,6 / 6,5 / 5,0**.
3. **CL5 (Resumo).** Portado pelo 088 (D-103): cabeçalho com "Conversa" e "Agendar", abas, nota "Resumo da IA", quatro números, "Próximo" e "Preferências" com origem. Medida do 088: **9,4 / 4,6 / 6,1 / 5,4**. Fica no Goal para não piorar e para fechar o que ainda diferir.
4. **CL6 (Atendimentos).** Cabeçalho compacto ("AP", "Ana Paula", "9 atendimentos · desde mar 2025"), abas, seção "Próximo" e seção "Anteriores". Cada linha é a mesma linha da Agenda: data "19/09", hora "15:30", traço na cor do serviço, serviços unidos por "+", duração e preço no próximo, e nos anteriores o valor registrado ("R$ 90 registrado"), "valor não registrado · registrar" ou o motivo do cancelamento, mais o status ("Confirmado", "Concluído", "Cancelado"). O rodapé soma só o que foi registrado ("Valor registrado: R$ 640") e conta "2 atendimentos sem valor". O app (`CustomerAgenda.tsx`) tem "Próximos atendimentos" e "Histórico" com subtítulos, data "19 SET" em duas linhas, duração e um badge, sem traço de cor, sem valor e sem rodapé. O contrato já traz `finalValue` em cada agendamento, e a cor do serviço sai de `serviceColorMap` e `appointmentServiceColors` (`features/agenda/occupancy.ts`), como na Agenda.
5. **CL7 (Notas).** Seção "Observações · só você vê" com o texto, a caixa "A IA pode usar esta informação" desmarcada por padrão, "Ela considera a observação ao atender, sem repeti-la para a cliente." e a orientação de privacidade. Seção "Tags", cada tag com a mesma autorização ("IA pode usar" ou "só você"), campo "Adicionar tag" com "ex.: Noiva, Gestante, Fiel" e "Salvar". O app (`CustomerNotes.tsx`, `CustomerTags.tsx`, `AuthorizationControl.tsx`) tem "Observações" e "Tags" em cartões, com a autorização como badge e botão "Autorizar uso pela IA" / "Revogar autorização da IA". O contrato já traz `aiAuthorized` em nota e tag (`customerNoteSchema`, `customerTagSchema`), e a autorização continua explícita e nunca nasce marcada (Goal006/Goal012).
6. **O que o contrato não tem.** O agendamento não traz quem cancelou ("cancelado pela cliente"). A criação de cliente não aceita responsável (`create({ name, phone })`); o vínculo é feito no perfil, com o cliente já salvo. Isso entra como divergência declarada, não como contrato novo.
7. **Gate.** `/clientes` está em `AUTHENTICATED_ROUTES`. G-4 e G-5 (Goal088) medem a lista e o detalhe de Clientes nas duas faixas. Nenhuma medida nova é necessária para este Goal: a composição não muda.

## Escolhas de desenho desta passada

**(a) A composição não muda.** Lista e detalhe de D-103 continuam como o 088 deixou: lista ao lado do detalhe de 1024 px em diante, tela empurrada com `PushedBar` abaixo disso, e **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031, D-103 (f)). `ListDetail.tsx`, `PushedBar.tsx`, `useWideLayout.ts`, `AppShell.tsx` e `ShellConfig.tsx` não mudam. Serviços, Configurações e a Agenda não podem mudar.

**(b) CL1: a linha do quadro.** Porte a linha: avatar, nome, telefone formatado por `formatBrazilianPhone` (`shared/phone.ts`), e uma só informação à direita, com a cor de cada caso (próximo em petróleo, último em cinza, falta em vermelho). Use a mesma fonte do texto em `CustomerList.tsx` e no painel da lista (`CustomerListPanel`); não duplique o cálculo de próximo e último. "Agenda por ele" aparece só se a resposta da lista trouxer o responsável; se não trouxer, é divergência declarada. O grupo sem nome segue o quadro ("Cadastro sem nome · importado" e "Nomear"); "Nomear" abre o perfil, onde o nome já é editável. Nenhum texto fica sublinhado (QA R-08).

**(c) CL4: o formulário do quadro.** "Nome" e "Telefone (opcional)", o texto de apoio do quadro sob o telefone, e o CTA "Salvar cliente". O campo de telefone mostra a máscara do quadro ao digitar ("+55 (11) 9…"). O valor enviado ao BFF continua o de hoje, só com os dígitos que a pessoa digitou, sem os caracteres da máscara. A verificação de cadastros com o mesmo telefone (`listCandidatesByPhone`) continua. A linha "Alguém agenda por esta pessoa?" aparece como no quadro. Como a criação não aceita responsável, tocar nela mostra que o vínculo é feito no perfil, depois de salvar. Não crie campo, rota nem parâmetro novos. Depois de salvar, o app continua indo para o perfil.

**(d) CL5: sem piora.** O corpo do 088 fica. Feche só o que ainda diferir do quadro, sem mudar dados nem ações.

**(e) CL6: a linha da Agenda e o rodapé de valor.** Duas seções, "Próximo" e "Anteriores", sem subtítulo. Cada linha tem data "dd/mm", hora, traço na cor do primeiro serviço (`appointmentServiceColors`), serviços unidos por " + ", e o status em texto. No próximo, mostre duração e preço previsto. Nos anteriores concluídos, mostre "R$ X registrado" quando `finalValue` não é nulo, e "valor não registrado · registrar" quando é nulo. "registrar" leva ao detalhe do agendamento, onde o valor final já é registrado. Nos cancelados e nas faltas, mostre o status. O rodapé "Valor registrado: R$ X" soma **só** `finalValue` não nulo dos atendimentos listados. Preço previsto nunca entra na soma. "N atendimentos sem valor" conta os concluídos com `finalValue` nulo. Sem nenhum concluído, o rodapé não aparece. A linha inteira continua levando ao detalhe do agendamento. As leituras de dados não mudam.

**(f) CL7: a autorização do quadro.** "Observações · só você vê" e "Tags" com o visual do quadro. A autorização de cada nota e de cada tag passa a ser a caixa do quadro: "A IA pode usar esta informação" na nota, com a explicação, e "IA pode usar" ou "só você" na tag. A caixa reflete `aiAuthorized`. Ao alternar, ela chama o mesmo serviço de hoje, com o mesmo pedido. Ela nunca nasce marcada. Ela tem nome acessível e estado (`checkbox` ou `switch`), e o texto diz o efeito sem depender só da cor. Criar e remover nota e tag continuam como hoje. "Memória" e "Responsável principal" continuam onde estão hoje no perfil; este Goal não remove funcionalidade.

**Divergências declaradas, que não contam como defeito na comparação:**

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O aviso de WhatsApp desconectado, o cartão da IA da sidebar com "WhatsApp desconectado" e o item "Notificações" da sidebar (D-102), estado da conta de teste.
3. Os dados: nomes, telefones, contagens, datas, serviços, valores, notas, tags e resumo são os da conta de teste.
4. "Maria Souza agenda por ele" na lista, se a resposta da lista não trouxer o responsável, por (b).
5. "cancelado pela cliente": o contrato não diz quem cancelou, e a linha mostra só "Cancelado", por (e).
6. A linha "Alguém agenda por esta pessoa?" leva ao vínculo no perfil depois de salvar, e não vincula na criação, por (c).
7. "Memória" e "Responsável principal" no perfil, onde estão hoje (D-103, divergência 10), por (f).
8. Os valores de cor do traço: a paleta é a de Serviços (D-108 (f)). Renomear e reajustar cores é do 095.

## Escopo obrigatório

### 1. CL1, CL4, CL5, CL6 e CL7 iguais aos quadros

**Porte** o HTML/CSS dos quadros. A referência fica em `docs/design-reference/claude-design/prototype/project/`: `Clientes.dc.html` (mobile), `Clientes-Tablet.dc.html` ("Clientes / <rótulo> / Portrait" e "… / Landscape") e `Clientes-Desktop.dc.html` ("Clientes / <rótulo> / Desktop"), com os rótulos "Clientes · lista", "Novo cliente", "Cliente · resumo", "Cliente · atendimentos" e "Cliente · notas".

Use o elemento com `data-screen-label` de cada quadro. Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, bordas, sombras, espaçamentos e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target CL1,CL4,CL5,CL6,CL7` até não haver divergência visível em nenhum dos quatro devices além das declaradas. O resultado deve ser **igual aos quadros CL1, CL4, CL5, CL6 e CL7 nos 4 devices**. Para cada quadro e cada device, o relatório final traz o diff do início e do fim e o que ainda difere, com o motivo. As telas fazem login: se corridas seguidas baterem em limite (`429`), espere entre corridas em vez de mudar o script.

### 2. O resto da área logada não quebra

Rode `npm run visual:compare -- --target Servicos:S1,Servicos:S4,M1,N1,A1,A5,H3` no início e no fim e cole o diff de cada device das duas execuções. Serviços e Configurações usam a mesma composição de D-103: eles não pioram. A Agenda e a Home também não. Toda piora tem causa medida. As rotas de Serviços, Configurações, Agenda e Conversas e a casca não mudam.

### 3. Comportamento preservado

- A busca por nome ou telefone continua filtrando a lista.
- A lista continua abrindo o perfil, e de 1024 px em diante o perfil abre no painel.
- Criar cliente envia o mesmo pedido de hoje (`name`, `phone`), com o telefone só em dígitos. A verificação de cadastros com o mesmo telefone continua antes de criar.
- Depois de criar, a tela vai para o perfil.
- "Conversa" e "Agendar" do perfil levam aonde levam hoje (`/agenda/novo?customerId=`).
- A linha do agendamento em Atendimentos leva ao detalhe do agendamento.
- Criar, remover e autorizar nota e tag enviam os mesmos pedidos de hoje. A autorização nunca nasce marcada.
- Memória do cliente e responsável principal continuam funcionando.
- O erro de cada operação continua anunciado por `role="alert"`.

### 4. Provas novas

`apps/frontend/tests/goal094-clientes.test.tsx`, no padrão de `goal075-customer-list.test.tsx`, `goal075-customer-profile.test.tsx` e `goal088-list-detail.test.tsx`:

1. **Linha da lista (CL1).** O telefone aparece formatado. À direita há uma só informação, com a classe de cada caso: próximo, último, falta e "sem atendimentos". O grupo sem nome mostra "Cadastro sem nome · importado" e "Nomear".
2. **Novo cliente (CL4).** Os rótulos "Nome" e "Telefone (opcional)", o texto de apoio do quadro e o CTA "Salvar cliente". Digitar o telefone mostra a máscara, e o pedido de criação leva só os dígitos. A linha do responsável aparece e, ao ser tocada, diz que o vínculo é feito no perfil depois de salvar.
3. **Atendimentos (CL6).** As seções "Próximo" e "Anteriores". A linha tem a data "dd/mm", o traço com a cor do serviço e o status. O rodapé soma só `finalValue` não nulo: um concluído com preço previsto e sem `finalValue` não entra na soma e conta em "sem valor". Um cancelado não conta em nenhum dos dois. Sem concluído, não há rodapé. "registrar" leva ao detalhe do agendamento.
4. **Notas (CL7).** "Observações · só você vê". A autorização de nota e de tag é um controle com estado, desmarcado quando `aiAuthorized` é falso. Alternar chama o mesmo serviço de hoje com o mesmo pedido.
5. **Casca.** Uma chamada de `useShellConfig` por árvore renderizada em `/clientes`, `/clientes/novo` e `/clientes/detalhes`, nas duas faixas, no padrão de `goal088-list-detail`.

As provas 1 a 4 **reprovam na baseline**, salvo asserção que a baseline já cumpra, declarada uma a uma. A prova 5 guarda comportamento e pode passar na baseline; declare o que passa. O relatório cola a saída das provas rodadas contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 5. Testes existentes

Continuam passando. Muda só asserção que dependa de texto, rótulo ou estrutura que o quadro troca. Exemplos: "Criar cliente", "Telefone", "Próximos atendimentos", "Histórico", "Autorizar uso pela IA", "Revogar autorização da IA", a data "19 SET" e o badge de status. Prováveis afetados: `goal015-customers`, `goal075-customer-list`, `goal075-customer-profile` e `goal088-list-detail`. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O rodapé de Atendimentos soma o preço previsto quando `finalValue` é nulo: a prova 3 reprova.
2. A autorização da nota nasce marcada: a prova 4 reprova.
3. O pedido de criação leva o telefone com a máscara: a prova 2 reprova.
4. O perfil chama `useShellConfig` duas vezes na mesma árvore: a prova 5 reprova.

## Pontos de implementação

- `apps/frontend/src/features/customers/`: `CustomerList.tsx` (linha e painel da lista), `CustomerForm.tsx`, `CustomerProfile.tsx`, `CustomerSummary.tsx`, `CustomerAgenda.tsx`, `CustomerNotes.tsx`, `CustomerTags.tsx` e `AuthorizationControl.tsx`. `CustomerMemory.tsx` e `PrimaryGuardianPanel.tsx` só se o estilo exigir, sem mudar o comportamento.
- O CSS de Clientes, onde ele está hoje (`apps/frontend/src/shared/styles/`). `atendly.css` só se uma regra compartilhada exigir, sem piorar outra tela.
- `apps/frontend/src/features/agenda/occupancy.ts`: só importar `serviceColorMap` e `appointmentServiceColors`, sem mudar a função.
- `apps/frontend/src/shared/phone.ts`: só por acréscimo, se a máscara do campo exigir uma função nova; as funções existentes não mudam.
- Ícones que faltarem, em `shared/icons/Icon.tsx` e `public/icons/atendly-icons.svg`. `goal072-icon-sprite.test.ts` guarda o sprite.
- `apps/frontend/tests/`: a prova nova e as asserções do §5.

## Fora do escopo

- CL2, CL3, CL8, CL9 e CL10, que a conta de teste não alcança. O que eles compartilham com CL1 e CL5 pode mudar junto, declarado no relatório.
- Vincular responsável na criação, quem cancelou o agendamento e qualquer outra mudança de contrato.
- A forma do telefone gravado (D-079) e o vínculo automático entre contato do WhatsApp e cliente (QA CL-05). Isso é regra de dado e de BFF, não de tela; a máscara da escolha (c) é só de exibição no campo (D-099).
- Serviços (095), Conversas e Notificações (096) e Configurações (097).
- Qualquer mudança em rota, contrato, BFF, IA, `scripts/` (inclusive o seed visual), `docs/design-reference/`, vault, `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts` e `e2e/visual/targets.json`. Mude o mapa só se um alvo estiver errado, e explique no relatório.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-112** em `PROPOSED`, no formato de D-111. Ela diz (a) a (f), com o motivo de cada um, e as divergências declaradas. Ela registra que (f) muda só a forma da autorização, não a regra de Goal006/Goal012, e que (e) soma só valor registrado. Ela não reescreve D-090, D-099, D-103 nem D-108. O "Revisar se" cobre três casos: o contrato passar a dizer quem cancelou; a criação de cliente passar a aceitar responsável; uma pessoa decidir mostrar receita prevista no perfil.
- [CURRENT_STATE](../CURRENT_STATE.md) registra que Clientes segue CL1, CL4, CL5, CL6 e CL7, e as contagens da execução final.
- [VALIDATION_GATE](../VALIDATION_GATE.md) registra o `visual:compare` do início e do fim dos quadros do §1 e do §2, e a contagem do gate autenticado.
- FINAL_AUDIT **não** ganha seção neste Goal. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de rota, arquivo, função, classe ou teste citado é conferido contra o código antes da entrega. Texto ainda não aceito deste Goal é reescrito no lugar quando fica falso. Decisão já aceita (D-079, D-090, D-099, D-103, D-108, D-110, D-111) não é reescrita, e seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

## Validação e ordem

1. Recontar a baseline. Rodar `npm run visual:compare -- --target CL1,CL4,CL5,CL6,CL7,Servicos:S1,Servicos:S4,M1,N1,A1,A5,H3` na baseline e colar o diff de cada par.
2. Implementar, iterando com `npm run visual:compare -- --target CL1,CL4,CL5,CL6,CL7`.
3. Rodar o vermelho da baseline das provas novas.
4. Fazer a última edição de código.
5. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `npm run visual:compare -- --target CL1,CL4,CL5,CL6,CL7,Servicos:S1,Servicos:S4,M1,N1,A1,A5,H3`.
6. Rodar os quatro controles do §6.
7. Escrever a prosa só depois disso.

Os controles do §6 e os documentos **não esperam** `validate:integration`. Se ele falhar só por ambiente, os controles e os documentos seguem, e o relatório declara a falha e mede a causa antes de declará-la de ambiente.

**Retentativas e recurso do host.** Nos Goals 092, 100, 093 e 101, o `validate:ui` com a configuração padrão teve retentativas em rotas públicas (`Target crashed`), e com `CI=1`, que a configuração já lê para usar 1 worker, a mesma árvore deu 0. No 101, `validate:core` sem variável falhou por memória (`Zone Allocation failed - process out of memory`) e passou com `VITEST_MAX_WORKERS=2`. Se acontecer de novo, rode a configuração padrão e a variante por variável de ambiente na mesma árvore e registre as duas. A configuração não muda.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nos Goals 100 e 101, unidades de diagnóstico editaram `playwright.config.ts` e `vitest.config.ts` e geraram blocker. Nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`, nem temporária. Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração.

No relatório, para cada quadro e cada device, descreva o que se vê em `side-by-side.png`; a porcentagem sozinha não basta. Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:core` ou `validate:integration`. Não remove teste, não pula teste e não encolhe suíte. Toca só os arquivos de "Pontos de implementação" e os documentos acima.

## Critério de aceite

1. O revisor rodou `npm run visual:compare -- --target CL1,CL4,CL5,CL6,CL7` e abriu os vinte `side-by-side.png`. Clientes está **igual aos quadros CL1, CL4, CL5, CL6 e CL7 nos 4 devices**. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento além das declaradas, inclusive na lista ao lado do detalhe em paisagem e desktop.
2. Serviços, Configurações, a Agenda e a Home não quebraram: Servicos:S1, Servicos:S4, M1, N1, A1, A5 e H3 do início e do fim, com o que mudou descrito. Toda piora tem causa medida.
3. As provas 1 a 4 passam e reprovaram na baseline, salvo asserção declarada. A prova 5 passa. Os quatro controles do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código.
4. O comportamento do §3 continua.
5. Largura, toque, contraste, foco e `prefers-reduced-motion` são decididos pelo gate renderizado. O gate autenticado, dentro de `validate:integration`, tem os **255** testes da baseline, com **0** retentativas, inclusive G-4 e G-5 de Clientes. `validate:ui` passa nas cinco larguras. Retentativa é medida e reportada com a causa, como em "Validação e ordem", e não é tolerada em silêncio.
6. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline. `validate:core`, `test:gate`, `validate:ui` e `validate:integration` passam.
7. D-112 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e só por acréscimo.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem configuração de gate alterada, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:** a tela num aparelho real; CL2, CL3 e CL8 a CL10, que a conta de teste não alcança; quem cancelou o agendamento e o responsável na criação, que dependem de contrato novo.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem e `visual:compare` da baseline; CL1 (linha e painel da lista) e CL4 (formulário, máscara, linha do responsável, "Salvar cliente") iguais aos quadros |
| WU-02 | STANDARD | — | CL5 sem piora, CL6 (Próximo, Anteriores, traço de cor, valor registrado e rodapé) e CL7 (observações e tags com a autorização do quadro) iguais aos quadros |
| WU-03 | STANDARD | WU-01, WU-02 | Provas 1 a 5 com o vermelho da baseline; asserções do §5 |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos: `goal094-clientes` |
| WU-07 | DETERMINISTIC | WU-04, WU-05, WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | `visual:compare` final, controles negativos (§6) e documentação, depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |
