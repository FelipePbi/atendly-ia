# Goal 112 — As telas não perdem o que a pessoa fez quando a largura cruza 1024 px

**Status: READY.** Preparado em 2026-10-04 pelo Tech Lead Agent após [Goal111 ACCEPTED](../reviews/111-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: CL4, CL5, S3, Servicos:S4, M1, N1, IA1, I2, A5, A6, A8, A9

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v136**, inserida depois do 111, sem renumerar nem remover ID. Origem: a observação 2 do [review105](../reviews/105-review.md), registrada "para um Goal futuro", e a passada desta versão, que achou o mesmo defeito em mais cinco telas.

## Baseline aceita

Baseline aceita: `baf0a65b0fe3baeef4f9c6ed532ec57befab78ca`

Goal anterior: 111 — Os registros e a documentação passam a dizer Avenly

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal111 já integrado em `main` (origem `3a82e60bd1217286d2241972c64f0582a7cb6b3d`). Foram **duas rodadas**, com 4 e 0 blockers, todos de documento. **D-124** foi aceita, com os onze pontos de julgamento como propostos. A virada de status do documento do Goal111 para `ACCEPTED` entrou no commit de fechamento. O 111 não mudou código: a última contagem de suítes aceita é a do fechamento do 102 (frontend **149** arquivos e **1841** testes, `validate:ui` **169** `passed`, gate autenticado **275** `passed`). Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **o que a pessoa digitou, escolheu ou abriu numa tela de detalhe, criação ou edição continua lá quando a janela cruza 1024 px, nos dois sentidos, e quando a lista ao lado termina de carregar**, sem mudar o que as telas mostram em nenhuma das quatro larguras de comparação (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768).

**Por que agora.** O 111 era o último Goal PLANNED da fila. O que resta registrado sem Goal é de duas naturezas: lacunas visuais que dependem de semear dado na conta visual (C1 a C4, K1 a K6 e 2.I2 a 2.I10) e um defeito de comportamento, a observação 2 do review105. O defeito é o único dos dois que a pessoa sente ao usar o produto, e girar um tablet faz exatamente isso: 768 px em retrato, 1024 px em paisagem. A passada desta versão mostrou que ele não é da Importação, mas do jeito como D-103 foi montado, e que alcança formulários com dado digitado.

## O que a evidência desta passada mostra

Conferido no código da baseline `baf0a65`, em D-103 e no review105.

1. **A causa é a posição do detalhe na árvore.** Abaixo de 1024 px a tela devolve o detalhe como raiz (`if (!wide) return form;`). De 1024 px em diante, devolve `<ListDetailLayout detail={form} list={…} />`, e `ListDetailLayout` (`shared/layout/ListDetail.tsx`) põe o detalhe dentro de `div.list-detail > div.list-detail-panel`. Para o React, o detalhe muda de pai e de posição: a subárvore inteira é desmontada e montada de novo, e todo `useState` dentro dela volta ao valor inicial.
2. **Onde acontece, na baseline.** `useWideLayout()` é chamado em dez arquivos de `features/` e `shared/layout/`. Em seis deles o detalhe troca de posição. Campo não controlado (os formulários que leem `FormData`) perde o valor; campo controlado por estado acima da subárvore guarda o valor, mas o nó é trocado e o foco sai do campo; estado de componente dentro da subárvore volta ao inicial:
   - `features/customers/CustomerForm.tsx` (`/clientes/novo`, CL4): os campos são lidos por `FormData`, e o que foi digitado se perde;
   - `features/customers/CustomerProfile.tsx` (`/clientes/detalhes`, CL5): a aba sobrevive por acaso, porque é gravada em `?aba=` e relida na montagem; a edição continua aberta, porque `editing` fica no componente que lê a largura, mas o nome e o telefone digitados nela (campos com `defaultValue`) voltam ao valor gravado;
   - `features/services/ServiceForm.tsx` (`/servicos/novo` e `/servicos/editar`, S3 e S4): quase todo o estado fica no componente que lê a largura (`name`, `durationValue`, `openOptions` e outros) e sobrevive; o que se perde é o nó, o foco e o estado interno dos componentes filhos (por exemplo, o campo de preço iniciado por `defaultValueCents`);
   - `features/settings/ProductSettingsScreen.tsx` (`/configuracoes/*`, N1, IA1 e as demais seções): `SettingsSection` troca de posição, e a edição em curso se perde;
   - `features/imports/ImportsScreen.tsx` (`/importacao`, I2): `if (!wide || !settings) return flow;`. A troca acontece também **sem mudar a largura**, quando a leitura de `settings` chega depois de a pessoa clicar em "Importar do Minha Agenda" (`started` em `ImportEmptyScreen`) ou de passar à fase de credenciais (`phase` e `values` em `ConnectSourceScreen`, inclusive a senha digitada). É a observação 2 do review105;
   - `features/agenda/AppointmentFlowShell.tsx` com `AgendaDayColumn.tsx` (`/agenda/agendamento`, `/agenda/novo`, `/agenda/cancelar` e `/agenda/reagendar`, A5, A6, A8 e A9): `if (!appointmentRoute || !wide) return page;`, e a coluna do dia envolve a página em `div.agenda-appt-split` e `ListDetailLayout`. Aqui o estado dos fluxos fica quase todo acima da casca (`comments` em `CancelFlow`, `startTime` em `RescheduleFlow`, os campos de `AppointmentForm`), então os valores sobrevivem; o que se perde é o nó (o foco sai do campo em que a pessoa digitava) e o estado de componente dentro de `children`.
3. **Onde não acontece, ou acontece de outro jeito.** `AppShell` só troca classe (`hideTabBar`), não a posição de `children`. `NotificationsScreen` só passa `pushed={!wide}`. `CustomerList` e `ServiceList` trocam a árvore entre a lista sozinha e a lista em `ListDetailLayout`, mas os dados vêm de um hook no componente da rota; se a busca ou outro estado da lista ficar dentro da subárvore, ele também se perde, e o inventário do §1 decide. No hub de Configurações (`/configuracoes`), a faixa estreita mostra só a lista, e a larga mostra a lista e o Negócio (M1, D-103 (d)): o Negócio **não existe** na faixa estreita, então perder a edição do Negócio ao estreitar o hub é consequência do desenho, não deste defeito.
4. **O servidor responde `false`.** `useWideLayout` usa `useSyncExternalStore` com `() => false` no servidor. Na hidratação de uma página aberta direto numa janela larga, a primeira árvore é a estreita e a segunda é a larga. Hoje isso também remonta o detalhe logo depois da hidratação. É inofensivo para dado digitado, mas é a mesma causa, e a correção a elimina.
5. **Os testes atuais não veem o defeito.** `tests/goal088-list-detail.test.tsx` simula `matchMedia` com `addEventListener: () => undefined`: a largura é fixada antes do render e nunca muda. Nenhum teste muda a largura com a tela aberta, nem resolve `settings` depois de a pessoa avançar na Importação.
6. **O CSS que depende da estrutura.** `.list-detail`, `.list-detail-list` e `.list-detail-panel` (`shared/styles/avenly.css`, a partir da linha 7105), `.agenda-appt-split .list-detail…` (`avenly-agenda.css:2563` a `2569`) e `.list-detail-panel .resume-stats` (`avenly-customers.css:1017`). Qualquer seletor de filho direto (`>`) ou de posição (`:first-child`) que alcance a raiz do detalhe na faixa estreita é afetado por um invólucro novo.

## Escolhas de desenho desta passada

1. **O detalhe fica no mesmo lugar da árvore em todas as larguras; quem aparece e some é a coluna da lista.** A forma recomendada: `ListDetailLayout` passa a ser montado sempre pelas seis telas, com uma propriedade que diz se a divisão está ligada (`split`, verdadeira só com a faixa larga **e** a lista disponível). Com a divisão desligada, os dois invólucros continuam no DOM, mas não geram caixa (`display: contents`, por classe), e a coluna da lista não é montada (o espaço dela na lista de filhos fica `null`, para não deslocar o painel). O Developer pode escolher outra técnica, desde que cumpra o critério 1 do §1 por **identidade de nó** e não mude o que D-103 (f) garante: abaixo de 1024 px a lista não é montada e não busca.
2. **A coluna do dia da Agenda segue a mesma regra.** `AppointmentFlowShell` monta sempre a estrutura da coluna, e `AgendaDayColumn` deixa a barra do dia e a coluna fora quando a divisão está desligada, sem deslocar a página.
3. **A Importação sem `settings` não é dividida.** De 1024 px em diante, enquanto a leitura de `settings` não chegou ou se ela falhou, a tela continua sem a lista do hub, como hoje. Quando a leitura chega, a lista aparece ao lado, e a fase da importação não muda.
4. **Nenhuma tela muda de aparência.** Este Goal não porta nem reinterpreta layout: as doze telas dos quadros listados já foram aceitas iguais ao protótipo (Goals 093, 094, 095, 097, 101, 104 e 105) e têm de continuar iguais. Qualquer diferença visível entre a captura de antes e a de depois é regressão.
5. **Decisão.** O Developer propõe **D-125**, por acréscimo, depois das provas: a invariante (o detalhe não muda de posição na árvore quando a divisão liga ou desliga), a técnica escolhida, a lista das telas que a usam, o tratamento da hidratação e o que fica fora (o hub de Configurações, item 3 da evidência). D-103 não é reescrita: D-125 a complementa.

## Escopo obrigatório

### 1. O estado sobrevive à troca de faixa

1. Nas seis telas do item 2 da evidência, mudar a largura de 390 px para 1280 px e de volta, com a tela aberta, **não desmonta o detalhe**. A prova é por identidade de nó: o elemento do campo (ou da raiz do detalhe) obtido antes da troca é o mesmo objeto depois (`toBe`), e o valor digitado ou a escolha feita continua lá.
2. Casos mínimos, cada um nos dois sentidos (estreito para largo e largo para estreito):
   - CL4: nome e telefone digitados continuam nos campos;
   - CL5: com a edição aberta, o nome e o telefone digitados continuam;
   - S3 e S4: o campo de preço editado continua com o valor editado, o campo em edição é o mesmo nó e mantém o foco, e uma linha aberta no S4 continua aberta;
   - uma seção de Configurações com formulário (o Negócio em `/configuracoes/negocio`): um campo editado continua com o valor editado;
   - I2: depois de "Importar do Minha Agenda" e "Continuar", a fase de credenciais continua, com o e-mail e a senha digitados;
   - A6, A8 e A9: o campo em que a pessoa digitava (um campo do novo agendamento, o comentário do cancelamento, o horário manual do reagendamento) é o mesmo nó, com o mesmo valor e com o foco.
3. **Importação com `settings` tardia.** Na faixa larga, com a leitura de `settings` ainda pendente, a pessoa avança até as credenciais e digita; quando a leitura resolve, a lista do hub aparece ao lado e a fase e os valores continuam. Com a leitura falhando, a tela continua sozinha, sem erro novo.
4. A lista e o inventário: o Developer confere cada chamada de `useWideLayout()` da baseline (as dez) e registra no relatório e em D-125, para cada uma, se o detalhe ou outro estado local troca de posição e o que foi feito. `CustomerList` e `ServiceList` entram na correção se o inventário achar estado perdido.

### 2. O que já valia continua valendo

1. **D-103 (f):** abaixo de 1024 px a coluna da lista não é montada, e os hooks de dados dela recebem `enabled: false`. Os testes do 088 que provam isso continuam passando sem mudar a asserção.
2. **D-103 (c) e (d):** rotas, parâmetros, item aberto marcado com `aria-current="page"` (um por lista) e painel vazio de `/clientes` e `/servicos` continuam iguais.
3. **Uma chamada de `useShellConfig` por árvore** (D-030, D-031, D-103 (f)), em todas as larguras.
4. **Acessibilidade:** a coluna da lista continua um `aside` com o nome acessível de hoje. Um invólucro sem caixa não ganha `role` nem nome. A ordem de foco de `panelFirst` (detalhe antes da lista no DOM) continua.
5. **A aparência:** os doze quadros listados continuam iguais ao quadro nos quatro devices, e nenhuma outra rota muda. Se algum seletor de CSS depender da estrutura antiga na faixa estreita, ele é ajustado para dar o mesmo resultado, não o contrário.
6. O comportamento das telas (o que salva, o que busca, as mensagens e os destinos) não muda.

### 3. Provas novas

1. Um arquivo de teste novo, `apps/frontend/tests/goal112-*.test.tsx`, com uma simulação de `matchMedia` que **dispara** `change` para os ouvintes registrados (a do 088 não dispara), e com os casos do §1.2 e do §1.3.
2. Um teste do invólucro (`ListDetailLayout` ou o que o substituir): com a divisão desligada, a coluna da lista não é montada e o painel não gera caixa; ao ligar e desligar, o nó do detalhe é o mesmo.
3. **Controles negativos, rodados depois da última edição de código e revertidos:** (a) devolver uma das telas ao `if (!wide) return …` faz o teste dela reprovar; (b) trocar o espaço `null` da lista por um ramo condicional que desloca o painel faz o teste do invólucro reprovar; (c) na Importação, voltar a condição `!settings` para a troca de árvore faz o teste do §1.3 reprovar. O relatório traz o comando, o teste que reprovou e a mensagem.

### 4. Testes existentes

Os testes do frontend continuam passando. Teste que dependa da estrutura antiga do DOM (por exemplo, um seletor de filho direto) pode ser ajustado só para a estrutura nova, sem afrouxar a asserção, e cada ajuste é listado no relatório.

## Fora do escopo

- Mudar o desenho de qualquer tela, portar quadro novo ou mexer nas lacunas visuais sem ID (C1 a C4, K1 a K6 e 2.I2 a 2.I10).
- O hub de Configurações na faixa estreita (item 3 da evidência).
- Guardar estado entre navegações de rota, em armazenamento local ou na URL.
- Backend, contratos, `packages/`, scripts de semeadura e `apps/frontend/e2e/visual/targets.json` (nenhum quadro novo).
- Os nomes de ambiente de D-122 (viii) e a contração da compatibilidade de D-120 e D-121.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-125** em `PROPOSED`, conforme a escolha 5.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal112 (o que mudou, as telas, o que fica fora).
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal112, com as contagens da execução final, os controles negativos e a lista das capturas do `visual:compare` conferidas.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Antes de editar: rodar `npm run visual:compare -- --target CL4,CL5,S3,Servicos:S4,M1,N1,IA1,I2,A5,A6,A8,A9` na baseline e guardar as capturas como referência de "antes" (fora do repositório).
2. Implementar, com os testes novos.
3. Rodar os controles negativos do §3.3 e reverter.
4. Rodar de novo o `visual:compare` dos mesmos alvos e **olhar** as capturas lado a lado (protótipo × app, 4 devices), e também contra as de "antes". Divergência visível é blocker.
5. Execução final, sobre a árvore completa: typecheck e lint do frontend, os testes do Goal112, a suíte do frontend, `validate:core`, `validate:ui` e `validate:integration` (o gate autenticado mede a composição das telas logadas, que este Goal toca), e `git diff --check`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. Os casos do §1.2 e do §1.3 passam, provados por identidade de nó e por valor, nos dois sentidos.
2. O inventário das dez chamadas de `useWideLayout()` está no relatório e em D-125, sem chamada sem destino.
3. Os testes do 088 e os demais do frontend passam; todo ajuste de teste existente está listado e não afrouxa asserção.
4. Os três controles negativos reprovam e foram revertidos.
5. CL4, CL5, S3, Servicos:S4, M1, N1, IA1, I2, A5, A6, A8 e A9 continuam **iguais ao quadro nos 4 devices**, conferidos olhando as capturas do `visual:compare`, e iguais às capturas de antes da mudança.
6. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion` como hoje; `validate:core` e `validate:integration` passam.
7. Nenhum arquivo fora de `apps/frontend/src/`, `apps/frontend/tests/` e dos três registros da seção "Documentação" mudou.
8. D-125 proposta, com a invariante, a técnica, o inventário e o que fica fora.

## Plano de execução

1. **WU-01 — Invólucro estável.** `ListDetailLayout` (ou o substituto) mantém o detalhe na mesma posição com a divisão ligada ou desligada; CSS sem caixa para a divisão desligada; teste do invólucro.
2. **WU-02 — Clientes e Serviços.** `CustomerForm`, `CustomerProfile`, `ServiceForm` e, se o inventário pedir, `CustomerList` e `ServiceList`; testes do §1.2.
3. **WU-03 — Configurações e Importação.** `ProductSettingsScreen` e `ImportsScreen`, inclusive a `settings` tardia; testes do §1.2 e do §1.3.
4. **WU-04 — Agenda.** `AppointmentFlowShell` e `AgendaDayColumn`; testes de A6, A8 e A9.
5. **WU-05 — Provas e registros.** Controles negativos, `visual:compare` antes e depois, D-125, CURRENT_STATE e VALIDATION_GATE.
6. Verificação determinística: typecheck, lint, testes do Goal112, suíte do frontend, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
