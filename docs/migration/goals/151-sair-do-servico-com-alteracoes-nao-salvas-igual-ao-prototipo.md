# Goal 151 — Sair do serviço com alterações não salvas igual ao protótipo

**Status: READY.** Preparado em 2026-10-09 pelo Tech Lead Agent após [Goal150 ACCEPTED](../reviews/150-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: S9, S4, S7, S3

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v175**, inserida depois do 150, sem renumerar nem remover ID. Origem: o S9 ("Serviço · descartar alterações"), um dos 10 quadros sem alvo, deixado fora desde a v150 só por pedir uma "guarda de navegação" que o app não tem. É o único dos 10 cujo motivo não é contrato, dado ou sinal que falta: o quadro diz o texto, os botões e a medida, e o resto da tela já existe. Só o frontend e a captura; o BFF, a IA, o Scheduling, o contrato e o banco não mudam.

## Baseline aceita

Baseline aceita: `f604dc9595d299a82f3fc2ae65a57df12b56f767`

Goal anterior: 150 — A lista de Clientes na medida do protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal150 já integrado em `main` (origem `e5bbc7f4aa9c029b7da0d9a3e00c078a9e890367`). Houve **uma rodada**, ACCEPTED com 0 blockers; a 1ª tentativa da suíte do frontend terminou `BLOCKED` por um número de divergência em `goal147-alvo-captura.test.ts`, corrigido por DIAG-001. **D-164** foi aceita. A última contagem aceita (rodada 1, árvore final `code-v1:fca9b804…f662f`):

- frontend **214** arquivos e **3113** testes;
- `goal150` do frontend **17** em 2 arquivos;
- `scripts/tests/visual-responses.test.mjs` **80**;
- `test:gate` **313**;
- `validate:core` com saída 0;
- `validate:ui` **169** `passed`;
- `targets.json` com **103** alvos; **10** dos 113 quadros sem alvo.

O Developer roda, na baseline e **antes de editar**, a suíte do frontend e `scripts/tests/visual-responses.test.mjs`, e registra os números de partida, com o comando e a hora (lição 2).

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **quem edita um serviço e tenta sair com alguma mudança não salva vê o "Salvar antes de sair?" do quadro S9, que diz o que mudou e oferece salvar, descartar ou continuar editando; sem mudança, sai como hoje.**

**Por que agora.** A fila do roadmap terminou no 150. Dos itens sem ID, os 10 quadros sem alvo são a lacuna que o próprio roadmap ainda conta (v137: "a migração não está completa enquanto essas telas não forem comparadas"; a Definition of Done global pede o frontend fiel ao Claude Design). Nove deles dependem de algo que não existe: cor livre fora de `colorToken` (S1b), as sheets que D-114 resolveu dentro do formulário (S5, S6 e S8), pagamento fora de `settingsStateSchema` (N2), o vínculo da pergunta a um serviço (N3), o sinal de IA instável (H6 e NT3) e o código de vinculação que só vem de um `POST` (4.3). O S9 não: o app já calcula `dirty` e já mostra "alterações não salvas" na barra, mas o "x" da barra é um link, e quem clica nele, ou em outra aba, **perde as mudanças em silêncio**. É perda de dado do usuário, e o quadro diz como evitar.

**Lições dos Goals 133 a 150, que valem aqui.**

1. A regressão por `cmp` não é determinística byte a byte. O Developer captura a baseline dos alvos de regressão (S3, S4 e S7) **três vezes** antes de editar, no mesmo ambiente em que vai capturar depois, mede o ruído e julga cada diferença depois das edições contra esse ruído, na **tabela por imagem** (alvo, device, pixels diferentes e delta máximo por canal).
2. A partida das suítes é medida **na baseline, antes da primeira edição**, e registrada com o comando e a hora.
3. Cada controle negativo traz, no relatório e em VALIDATION_GATE, o comando, o arquivo, o nome do teste e **a mensagem de asserção exata**, conferida contra a saída bruta. Antes de entregar, o Developer confere que cada controle reprova **o teste que este documento nomeia**.
4. Os `side-by-side.png` de todos os alvos da linha "Quadros do protótipo" são abertos **nos quatro devices** e listados no relatório.
5. Cada controle de `targets.json` roda pelos **dois** testes: o `goal151` do alvo e `scripts/tests/visual-responses.test.mjs`.
6. As `notes` de cada alvo citam **todas** as divergências visíveis na captura.
7. Um gate do IA Loop rodado depois do relatório é registrado com o número, nunca como "pendente". A "execução final" é sempre a da última árvore. Uma asserção antiga que muda de valor esperado (por exemplo, a contagem de alvos em `goal144-alvos-captura.test.ts`) é ajustada **na mesma rodada** e explicada no relatório (o Goal150 teve uma tentativa `BLOCKED` só por isso).
8. Numa worktree limpa, rodar `npx prisma generate` em `apps/bff`, em `apps/ai-orchestrator` e em `apps/scheduling-service` antes de `test:gate`.
9. Uma causa que não foi medida é registrada como provável, com o que a sustenta.

## O que a evidência desta passada mostra

Conferido no código da baseline `f604dc9` e em `docs/design-reference/claude-design/prototype/project/Servicos.dc.html` (celular), `Servicos-Tablet.dc.html` (retrato e paisagem) e `Servicos-Desktop.dc.html`.

1. **O quadro S9** ("Sair com alterações não salvas", `data-screen-label` "Serviço · descartar alterações") mostra o formulário de "Corte feminino" com "alterações não salvas" na barra, coberto por um véu `rgba(34,30,26,.38)`, e por cima:
   - no celular, uma sheet presa embaixo (`background:#FFFDFA; border-radius:24px 24px 0 0; box-shadow:0 -12px 40px rgba(34,30,26,.18); padding:10px 20px 46px; gap:18px`, com a alça de 40 × 4 px `#D6CEC2`);
   - no tablet em retrato, um diálogo centrado de **480 px**; no tablet em paisagem e no desktop, de **440 px** (`border-radius:20px; box-shadow:0 24px 64px rgba(34,30,26,.28); padding:22px 24px 24px; gap:18px`); no desktop, sobre a lista e o formulário.
   - O conteúdo: o título "Salvar antes de sair?" (Literata 24 px, 500, `line-height:1.2`); "Você mudou a **duração** (45 → 50 min) e o **preço** (R$ 90 → R$ 95) do Corte feminino." (15 px, `line-height:1.5`, `#5F574E`, os nomes dos campos em `<strong>` `#221E1A`); "Agendamentos já marcados continuam com os valores combinados na época." (13 px, `line-height:1.45`, `#716859`); "Salvar alterações" (52 px, raio 14, `#0F5F63`, texto `#F7F4EF` 16 px 600); "Descartar" (52 px, raio 14, borda `#D6CEC2`, texto `#8A2A21` 16 px 600, sem fundo); "Continuar editando" (texto 15 px 600 `#0F5F63`, `padding:6px 0`). A nota do quadro: "Descartar em vermelho de texto, nunca em botão cheio."
2. **O app hoje** (`apps/frontend/src/features/services/ServiceForm.tsx`): `dirty` vira `true` em qualquer `onChange` do formulário e nunca volta a `false`, mesmo que o valor volte ao original; a barra (`PushedBar`) mostra "alterações não salvas" com `edit && dirty`; o "x" (ou "‹" na revisão) é um `Link` do `next/link` para `/servicos`; de 1024 px em diante, `ListDetailLayout` põe `ServiceListPanel` ao lado, com links para cada serviço e para "Novo serviço"; não há `beforeunload` nem interceptação em todo o `src`. O app usa o App Router do Next, que não tem bloqueio de navegação.
3. **A regra do instantâneo é verdadeira:** `AppointmentItem` grava `serviceNameSnapshot`, `durationMinutesSnapshot`, `priceTypeSnapshot`, `priceSnapshot` e os intervalos (`bufferBeforeMinutesSnapshot`, `bufferAfterMinutesSnapshot`) em `apps/scheduling-service/prisma/schema.prisma`; mudar o serviço não muda o que já está marcado.
4. **O que já existe para reaproveitar:** `formatServiceDuration`, `formatServicePrice` (que já escreve "R$ 90", sem centavos inteiros) e `formatServiceRecurrence` em `serviceFormatting.ts`; os nomes de cor de `colorTokenOptions` (D-114 (g)); `shared/ui/Dialog.tsx` com as variantes `modal` e `sheet`, foco preso, `Esc` e clique no véu, mas que **sempre desenha um "Fechar" no cabeçalho**, que o quadro não tem.
5. **A captura alcança o estado:** `scripts/visual-compare.mjs` aceita os passos `click`, `clickRole`, `fill`, `press` e `waitFor`; o S7 já responde a lista fixa do quadro com "Corte feminino" (45 min, R$ 90, `SKY`). O "x" da barra aparece nos quatro devices fora da revisão (`hideBackWide` só na revisão).
6. **Contagens que mudam:** `goal144-alvos-captura.test.ts` espera 103 alvos; `visual-responses.test.mjs` lista os alvos que declaram `responses` (hoje termina em "S2 e S7").

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta do arquivo de cada device os valores da sheet e do diálogo (largura, raio, sombra, padding, gaps, fontes, cores, alturas dos botões, véu), sem inventar valor.
2. **Mudança real, não `dirty`.** Uma função pura (por exemplo, `describeServiceChanges` em `features/services/`) compara o serviço carregado com o estado do formulário, normalizado como o `PATCH` o enviaria, e devolve as mudanças na ordem abaixo. A guarda abre só se houver pelo menos uma; um campo que volta ao valor original deixa de contar. "alterações não salvas" na barra passa a seguir a mesma regra (aparece exatamente quando a guarda abriria).
3. **O texto de cada mudança**, nesta ordem, com o nome do campo em `<strong>`:
   - nome: "o **nome** (<antes> → <depois>)";
   - duração: "a **duração** (<antes> → <depois>)"; com os dois lados abaixo de 60 min, como o quadro, "45 → 50 min"; senão, cada lado por `formatServiceDuration` ("1 h 30 → 2 h", "sem duração → 50 min");
   - preço (tipo ou valor): "o **preço** (<antes> → <depois>)", cada lado por `formatServicePrice` ("R$ 90 → R$ 95", "a partir de R$ 60 → sob consulta");
   - cor: "a **cor na agenda** (<antes> → <depois>)", com os nomes de `colorTokenOptions` e "sem cor";
   - descrição: "a **descrição**";
   - recorrência: "a **recorrência** (<antes> → <depois>)", por `formatServiceRecurrence` e "sem recorrência";
   - intervalos: "o **intervalo antes e depois**" (um ou os dois);
   - instruções: "as **instruções para a IA**" (só se a leitura não falhou);
   - ativo: "o **status** (ativo → inativo)" ou "(inativo → ativo)".

   A frase é "Você mudou <lista> de <nome salvo>.", com a lista em "X", "X e Y" ou "X, Y e Z". **"de" no lugar de "do"** do quadro, porque o artigo depende do nome ("da Escova"); é divergência declarada, como "agenda por esta pessoa" em D-158. A segunda linha ("Agendamentos já marcados continuam com os valores combinados na época.") aparece só quando a lista tem nome, duração, preço ou intervalo, que são os campos do instantâneo.
4. **Onde a guarda vale.** Só no formulário de edição com o serviço carregado e o catálogo editável (inclusive no modo de revisão do S7). Com mudança, ela intercepta:
   - (a) o "x"/"‹" da barra;
   - (b) qualquer clique em link de mesma origem no documento (as linhas e o "Novo serviço" da lista ao lado, as abas e a barra lateral da casca, o sino), com o botão principal, sem `Ctrl`/`Meta`/`Shift`/`Alt`, sem `target` diferente de `_self` e sem `download`, para um endereço diferente do atual. A interceptação é um ouvinte de `click` em fase de captura no `document`, ligado só enquanto há mudança, que impede a navegação do `next/link` e guarda o destino;
   - (c) recarregar ou fechar a aba: `beforeunload` com o aviso nativo do navegador (não a sheet), ligado só enquanto há mudança.

   **Fora da guarda, declarado em D-165:** o voltar e o avançar do navegador e o gesto de voltar do Android (o App Router não tem bloqueio de navegação, e prender o histórico seria um conserto frágil); o novo serviço (S3), que o quadro não cobre e cujo texto não existe; e a navegação feita pelo próprio formulário (salvar, "Descartar").
5. **As três saídas.**
   - **"Salvar alterações"** faz exatamente o envio do botão do formulário (a mesma validação de preço e de duração, o mesmo `PATCH`, a mesma gravação das instruções). No modo de revisão, fica desabilitado nas mesmas condições de "Salvar e liberar para a IA". Enquanto envia, os três botões ficam desabilitados. Com sucesso, vai para o destino guardado (para `/servicos`, o mesmo `router.replace` de hoje; para outro link, `router.push`). Com erro de validação ou de rede, a sheet fecha, o formulário mostra o erro como hoje e nada navega.
   - **"Descartar"** não envia nada e vai para o destino guardado, sem reabrir a guarda.
   - **"Continuar editando"**, `Esc` e o clique no véu fecham sem mudar nenhum valor, e o foco volta ao controle que abriu a guarda.
6. **Acessibilidade.** `role="dialog"`, `aria-modal="true"`, nome acessível "Salvar antes de sair?", foco preso enquanto aberto, foco inicial em "Salvar alterações", ordem de foco Salvar → Descartar → Continuar editando, foco visível nos três, e movimento só com `prefers-reduced-motion: no-preference` (a entrada da sheet e do diálogo). Sem "Fechar" no cabeçalho, como o quadro. Se o Developer reaproveitar `Dialog`, o "Fechar" sai por uma prop opcional cujo padrão mantém todos os usos de hoje iguais; senão, o componente fica em `features/services/` com o mesmo foco preso, `Esc` e véu.
7. **CSS.** Classes novas escopadas a `.service-leave-*` (ou nome equivalente, prefixo único) em `shared/styles/avenly-services.css`; nada muda em `avenly.css`, na casca nem nos outros diálogos.
8. **O alvo S9.** Em `apps/frontend/e2e/visual/targets.json`, o alvo `S9`, `Servicos.dc.html`, label "Serviço · descartar alterações", rota literal `/servicos/editar?id=visual-compare-s9`, com `responses` só `GET`: `/v1/status` conectado (como S2 e S7), `/v1/services` com a lista do quadro (a do S7, com "Corte feminino" no id `visual-compare-s9`, 45 min, R$ 90, `SKY`) e `/v1/services/visual-compare-s9/ai-instruction` vazio; `steps` que levam a duração a 50 min (por exemplo, "Aumentar duração") e o preço a R$ 95, clicam no "x" e esperam "Salvar antes de sair?". As `notes` citam todas as divergências visíveis.
9. **O que não muda.** O formulário sem mudança (S3, S4 e S7 iguais à baseline, fora do ruído); `ServiceList.tsx`, salvo uma classe que falte; a casca, `PushedBar` (salvo o necessário para interceptar o "x" sem mudar o que ele desenha), `ListDetailLayout`; os outros diálogos; o BFF, a IA, o Scheduling, o contrato, `PUBLIC_API_V1.md`, o banco, `scripts/visual-compare.mjs`, `scripts/lib/visual-responses.mjs`, a semente da captura e a do gate, `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts`.
10. **Decisão.** O Developer propõe **D-165**, por acréscimo, depois das provas, cobrindo as escolhas 2 a 9, as divergências que restarem e a contagem de alvos (104) e de quadros sem alvo (9). Se o número já estiver tomado, usa o próximo livre e explica.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/services/`: a função das mudanças (escolhas 2 e 3), a guarda (escolha 4), a sheet/diálogo (escolhas 5 e 6) e a ligação com `ServiceForm.tsx`.
2. `shared/styles/avenly-services.css`: a escolha 7.
3. `shared/ui/Dialog.tsx` ou `shared/layout/PushedBar.tsx`: só nos limites das escolhas 6 e 9.

### 2. A captura

1. `apps/frontend/e2e/visual/targets.json`: o alvo S9 (escolha 8).
2. `scripts/tests/visual-responses.test.mjs`: o S9 na lista dos alvos que declaram `responses` e um teste do conteúdo do S9 (o "Corte feminino" de 45 min e R$ 90 no id dos passos, só `GET`).
3. `apps/frontend/tests/goal144-alvos-captura.test.ts`: a contagem de 103 para 104, explicada no relatório.

### 3. Provas

1. **Frontend**, em `apps/frontend/tests/goal151-*.test.ts` / `.test.tsx`:
   - a função das mudanças: nenhuma mudança; cada campo da escolha 3 com o texto exato; um campo que volta ao valor original; a junção com um, dois e três ou mais itens; a segunda linha só com nome, duração, preço ou intervalo; o caso do quadro dá exatamente "Você mudou a duração (45 → 50 min) e o preço (R$ 90 → R$ 95) de Corte feminino.";
   - `ServiceForm` em edição: sem mudança, o "x" navega sem abrir nada; com mudança, o "x", uma linha da lista ao lado e um link da casca abrem a guarda e não navegam; clique com `Ctrl`/`Meta` ou em `target="_blank"` não é interceptado; "Salvar alterações" envia um `PATCH` e vai ao destino guardado; com erro de validação ou de rede, fecha e não navega; "Descartar" não envia nada e navega; "Continuar editando" e `Esc` fecham, mantêm os valores e devolvem o foco; `beforeunload` só com mudança; "alterações não salvas" some quando o valor volta ao original; o novo serviço não tem guarda; no modo de revisão, "Salvar alterações" desabilitado com a duração vazia;
   - o alvo S9 de `targets.json`: cada resposta válida contra o schema da rota no contrato, só `GET`, a rota com o id das respostas e os passos que chegam ao título do quadro.
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a função das mudanças contando um campo que voltou ao valor original faz um teste `goal151` do frontend reprovar;
   - (b) a guarda sem impedir a navegação do link da lista ao lado faz um teste `goal151` do frontend reprovar;
   - (c) "Descartar" enviando o `PATCH` faz um teste `goal151` do frontend reprovar;
   - (d) o S9 de `targets.json` com um passo `POST` ou sem `/v1/services` faz reprovar o teste `goal151` do alvo **e** `visual-responses.test.mjs`.

   O relatório traz, para cada um, o comando, o arquivo e o nome do teste que reprovou, **a mensagem de asserção exata** e o `sha256sum -c` depois de reverter (lição 3).
3. **Fidelidade visual.**
   - `npm run visual:compare -- --target S9,S4,S7,S3`, numa pilha descartável própria (ou na que o harness deixar pronta, declarado), como nos Goals 118 a 150.
   - **A captura de antes é da baseline `f604dc9`, feita três vezes**, de S3, S4 e S7 (lição 1); depois das edições, os quatro alvos três vezes. S3, S4 e S7 sem diferença fora do ruído.
   - O Developer abre os `side-by-side.png` dos quatro alvos nos quatro devices (lição 4) e lista no relatório as diferenças que restam e por quê.
   - **Medidas do S9**, em cada device, no app e no quadro, com a diferença em px: largura, topo e altura da sheet/diálogo; topo e altura do título, do texto e da segunda linha; topo e altura de cada botão; raio e padding. Uma diferença acima de 1 px que não seja divergência declarada é corrigida antes de entregar. O formulário atrás do véu (o quadro o abstrai em três cartões vazios a 50 %) é divergência declarada, assim como a casca.
   - **Medidas que o `validate:ui` não alcança**, porque ele não abre a guarda: no S9 aberto, o contraste computado do texto dos três botões e dos dois parágrafos contra o fundo, o alvo de toque de "Continuar editando" (mínimo AA de 24 px) e a ausência de overflow horizontal da sheet em 360 px, registrados em VALIDATION_GATE.
   - Critério visual: **a guarda igual ao quadro S9 nos 4 devices**, salvo as divergências declaradas; S3, S4 e S7 sem diferença fora do ruído.
   - Largura, contraste, foco, alvo de toque e movimento reduzido das rotas são decididos pelo `validate:ui` (360, 390, 768, 1024 e 1440 px).

## Fora do escopo

- O voltar do navegador e o gesto do Android; a guarda no novo serviço e em outros formulários (cliente, agendamento, Configurações), cada um com Goal e decisão próprios.
- S1b, S5, S6, S8, N2, N3, H6, NT3 e 4.3, com os motivos da v150 a v174; o "Desativar" no "•••" (S8).
- O respiro de 20 px do celular e a barra de abas; o "+" do painel carregando sem `canCreate`; a borda dos cartões e a das ações; o `.min(1)` do `customerListPersonSchema` local do BFF.
- Qualquer mudança no BFF, na IA, no Scheduling, no contrato, em `PUBLIC_API_V1.md` ou no banco.

## Documentação

Por acréscimo, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-165** em `PROPOSED`, conforme a escolha 10.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal151.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal151, com as contagens da execução final de **todos** os gates que rodaram, a rodada e a árvore de cada número, as partidas medidas antes de editar, o ajuste das asserções existentes, o ruído das três capturas da baseline, a tabela por imagem, as medidas do S9 (inclusive as que o `validate:ui` não alcança) e os controles negativos com a mensagem exata.

Se uma correção posterior (DIAG ou FIX) mudar o que um registro já escrito diz, o Developer atualiza o mesmo registro do Goal151 na mesma rodada (lição 7). O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`, nem seção já aceita dos registros acima.

## Validação e ordem

1. Antes de editar: as partidas (lição 2) e a captura da baseline `f604dc9` de S3, S4 e S7 três vezes (§3.3).
2. A função das mudanças, com os testes (escolhas 2 e 3).
3. A guarda, a sheet e o CSS, com os testes do `ServiceForm` (escolhas 4 a 7).
4. O alvo S9 e as contagens, com os testes de alvo (escolha 8).
5. O `visual:compare` dos quatro alvos, as medidas e as três capturas; corrigir o que passar de 1 px.
6. Os controles negativos do §3.2, revertidos.
7. A execução final, sobre a árvore completa: typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`); os testes `goal151` e a suíte do frontend; `test:gate`, com o `prisma generate` dos três serviços já feito (lição 8); `validate:core` e `validate:ui`; `git diff --check`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. Em edição, com pelo menos uma mudança real, o "x"/"‹" da barra, os links da lista ao lado e os da casca abrem "Salvar antes de sair?" sem navegar; recarregar ou fechar a aba pede o aviso nativo; sem mudança (ou com o valor de volta ao original), tudo navega como hoje e a barra não mostra "alterações não salvas".
2. O texto diz o que mudou, com os valores e a ordem da escolha 3, e a segunda linha só com nome, duração, preço ou intervalo. "Salvar alterações" grava pelo mesmo caminho do formulário e vai ao destino; com erro, fica no formulário com o erro. "Descartar" não grava e vai ao destino. "Continuar editando" e `Esc` fecham sem mudar nada e devolvem o foco.
3. A guarda igual ao quadro S9 nos 4 devices (sheet no celular; diálogo de 480 px no retrato e de 440 px em paisagem e no desktop), salvo as divergências declaradas; S3, S4 e S7 sem diferença fora do ruído nas três capturas. Os `side-by-side.png` dos quatro alvos foram abertos nos quatro devices e as medidas do §3.3 foram feitas.
4. Largura (sem overflow horizontal em 360 a 1440 px), contraste, foco visível, alvo de toque e `prefers-reduced-motion` aprovados pelo `validate:ui` nas rotas, e as medidas do S9 aberto registradas.
5. Os quatro controles negativos reprovaram o teste nomeado com a mensagem registrada e foram revertidos com `sha256sum -c` igual.
6. typecheck, lint, `goal151`, a suíte do frontend (com a partida medida antes de editar), `visual-responses.test.mjs`, `test:gate`, `validate:core` e `validate:ui` com saída 0 na árvore final. Nenhuma asserção existente afrouxada; um valor esperado ajustado (a contagem de alvos, a lista dos que declaram `responses`, uma asserção de `dirty`) é explicado no relatório, com o que a asserção provava e onde a prova continua.
7. `targets.json` com 104 alvos; 9 dos 113 quadros sem alvo. D-165, CURRENT_STATE e VALIDATION_GATE escritos por acréscimo, com as contagens da execução final.

## Plano de execução

1. **WU-01 — As mudanças do serviço.** As partidas e as três capturas da baseline, antes de editar; a função das mudanças e o texto (escolhas 2 e 3), com os testes.
2. **WU-02 — A guarda e a sheet.** A interceptação, `beforeunload`, as três saídas, a acessibilidade e o CSS (escolhas 4 a 7), com os testes do `ServiceForm`.
3. **WU-03 — O alvo S9.** `targets.json`, `visual-responses.test.mjs` e a contagem de `goal144` (escolha 8), com o teste do alvo.
4. **WU-04 — Fidelidade visual.** `visual:compare` dos quatro alvos, as três capturas, os `side-by-side.png`, as medidas e as correções; as `notes` com o que restar.
5. **WU-05 — Os controles negativos.** (a) a (d), cada um revertido.
6. **WU-06 a WU-12 — Verificação determinística:** typecheck e lint do frontend; os testes `goal151`; a suíte do frontend; `test:gate`; `validate:core`; `validate:ui`.
7. **WU-13 — Registros.** D-165, CURRENT_STATE e VALIDATION_GATE, com os números da verificação determinística.
8. **WU-14 — `git diff --check`.**
