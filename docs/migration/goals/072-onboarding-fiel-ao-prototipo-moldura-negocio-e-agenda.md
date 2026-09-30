# Goal 072 — Onboarding fiel ao protótipo: moldura, negócio e agenda

**Status: ACCEPTED.** Preparado em 2026-09-30 pelo Tech Lead Agent após [Goal077 ACCEPTED](../reviews/077-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v89, dividida do 065, com o título "Onboarding fiel ao protótipo"; desde a v96, depois do 077. A v100 a marca READY com o mesmo ID, **divide** a linha e precisa o escopo com a evidência abaixo. Este Goal fica com a **moldura do onboarding** e com os **campos dos capítulos "Seu negócio" e "Sua agenda"**. A demonstração animada, a amostra por estilo, as promessas com ícone, a composição animada da Boas-vindas e a ordem de Tab da introdução do WhatsApp vão para o novo **079**, PLANNED, logo depois deste.

## Baseline aceita

Baseline aceita: `79d2133bc1be5eae0f81f6c9114cbdc5a3abdd1b`

Goal anterior: 077 — Fidelidade visual: Conversas e Notificações

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal077 já integrado em `main` (origem `390fb8328abc284ab6507cc8a5ac83d8bee27fb7`). A virada de status do documento do Goal077 para `ACCEPTED` não entrou no commit de fechamento; veio no commit documental `5651274`, que não é a baseline. **Três rodadas**, com 7, 1 e 0 blockers; o blocker da rodada 2 foi configuração de teste e build editada por unidades de diagnóstico do harness, restaurada na rodada 3. **D-093** foi aceita e [FINAL_AUDIT §54](../FINAL_AUDIT.md) escrita sem reescrever §4 a §53. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review077](../reviews/077-review.md) e de FINAL_AUDIT §54 (execução final vigente, FIX-001 da rodada 2 do Goal077, com os gates da rodada 3 no IA Loop): `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **112** arquivos e **1146** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **160** testes e **0** retentativas, rodado no IA Loop; `test:bff-integration` **60** arquivos e **465** testes. Backend que este Goal não toca: `test:ai-orchestrator` **1177** passando e **93** pulados de **1270**; `test:scheduling-service` **37** arquivos e **502** testes. A recontagem na baseline `79d2133`, feita pelo Developer antes da primeira edição, é o piso usado para comparar a execução final; se divergir destes números, o relatório diz por quê.

## Objetivo e posição

Fazer a moldura do onboarding e as etapas dos capítulos "Seu negócio" e "Sua agenda" baterem com os protótipos `Onboarding-1-Negocio-e-Agenda.dc.html`, `Onboarding-1-Negocio-e-Agenda-Tablet.dc.html` e `Onboarding-1-Negocio-e-Agenda-Desktop.dc.html` (`docs/design-reference/claude-design/prototype/project/`). A moldura vale para todas as etapas, inclusive as do capítulo 3; para ela, os protótipos `Onboarding-3-IA-e-WhatsApp*` servem só de conferência do trilho e do voltar.

1. **Voltar no topo** (O-10, O-23): chevron ‹ no topo em todas as etapas com etapa anterior, cinza e inativo na Boas-vindas; nenhum "Voltar" no rodapé.
2. **Progresso por capítulo** (O-11): no celular, barra segmentada; a partir de 768 px, trilho lateral "Configuração inicial" com os quatro capítulos numerados.
3. **CTA na largura da coluna** (O-12).
4. **Seleção tonal com ✓** (O-13, O-07): chip e cartão selecionados com fundo tonal, borda petróleo e ✓; os cartões de modalidade com ícone à esquerda e indicador de seleção à direita.
5. **Campos da agenda** (O-25, O-27, O-29, O-32): duração com − e + de 5 minutos e atalhos 30/60/90; preço com máscara "R$ 90,00"; dias em sete pílulas com resumo; horas em Literata com a barra de 0–24 h.
6. **Resíduos de review** que tocam os mesmos componentes: a etapa `importacao` sem `calendarSource` volta a `sistema-atual` (observação 1 do [review066](../reviews/066-review.md)); nenhum título de seção dentro de `<button>` (observação 2 do review066); o erro de servidor do preço cai no campo do preço (observação 4 do [review065](../reviews/065-review.md)).

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **O-07**, **O-10/O-23**, **O-11**, **O-12**, **O-13**, **O-25**, **O-27**, **O-29** e **O-32**. Ficam para o **079**: O-36/O-37, O-39, O-42, a composição animada da Boas-vindas e a observação 3 do review065. A busca por CEP de O-15 não entra em nenhum dos dois: depende de serviço externo, e a linha da v89 a condicionava a uma pessoa querer.

## O que a evidência desta passada mostra

Conferido no código da baseline `79d2133`:

1. **"Voltar" mora no rodapé.** `OnboardingScreen.tsx` monta as ações da etapa em oito ramos (`:241-420`), e em cada um "Voltar" é um `Link` `btn btn-secondary` para `/onboarding/${previous}`. `previous` já é calculado pelo cenário e pelo rascunho, com os desvios de `endereco`, `sistema-atual` e `quando-importar` (`:82-99`). A Boas-vindas não tem voltar. As telas de estado do teste real (`teste-real-progresso`, `-interferencia`, `-falha`, `-sucesso`) e `whatsapp-concluido` também não.
2. **O progresso é uma barra contínua.** `OnboardingTopbar` (`OnboardingShell.tsx:94-127`) desenha o rótulo do bloco e uma `.progress-bar` com largura em `progressPercent`, em todas as larguras. `OnboardingFrame`, a moldura da etapa `importacao`, usa a mesma barra. Os blocos e a ordem já existem em `blocks.ts`: `onboardingBlockLabels` ("Seu negócio", "Sua agenda", "Sua IA", "WhatsApp"), `blockForScenario` e `onboardingFlow`. Os protótipos Tablet e Desktop dos capítulos 1 e 3 têm o trilho lateral "Configuração inicial" com os quatro capítulos numerados.
3. **Os campos da agenda são nativos crus.** Em `blocks/schedule.tsx`, a duração é `type="number"` com `min={5}`, `max={1440}` e sem `step` (`:195-206`); o preço é `type="number"` com `step="0.01"` (`:228-244`); os dias são sete `choice-card` com `<h3>` (`:500-520`); as horas são dois `type="time"` por intervalo (`:111-137`). O padrão pronto está no módulo de Serviços desde o 076: `shared/ui/CurrencyInput.tsx` (máscara BRL em centavos) e o − / + com atalhos 30/60/90 de `features/services/ServiceForm.tsx:275-320`.
4. **Títulos dentro de controles.** `Choice` e `ActionCard` (`blocks/shared.tsx:30-85`) põem `<h2>` dentro de `<button>`. A modalidade (`blocks/business.tsx:209-257`) põe `<h3>` dentro de `<label>` com checkbox `sr-only`, sem ícone nem indicador. O chip selecionado (`.chip.is-active`) é preenchido em Tinta, sem ✓.
5. **A etapa `importacao` não confere a fonte.** O rascunho já tem `calendarSource` (`OnboardingRuntime.tsx:29`, `:304`), e a retomada já manda para `sistema-atual` quando ele é nulo (`:227`); a etapa aberta por URL direta não confere.
6. **O gate autenticado já mede todas as etapas.** `ONBOARDING_ROUTES` (`e2e/routes.ts:124` em diante) tem as etapas do onboarding, medidas nas cinco larguras pela segunda conta em `authenticated-matrix.spec.ts:899` em diante. Dois pontos do spec dependem de marcação desta tela: a contagem de oito `.chip` dentro de `.segment-chip-row` em `onboarding-segmento-e-nome`, e o botão "Personalizar dias diferentes" com `aria-expanded` em `onboarding-horarios`.

## Escolhas de desenho desta passada

- **Voltar (O-10, O-23).**
  - Um chevron ‹ no topo da etapa, na posição do protótipo, com nome acessível "Voltar", `Link` para `/onboarding/${previous}`. A regra de `previous` não muda.
  - Na Boas-vindas, o chevron aparece cinza e inativo: `aria-disabled="true"`, fora da ordem de Tab, sem destino.
  - Onde hoje não há voltar (as quatro telas de estado do teste real e `whatsapp-concluido`), o chevron não aparece.
  - Nenhum "Voltar" fica no rodapé de nenhuma etapa.
  - A etapa `importacao` mantém a própria navegação do módulo de importação (Goal066) e não ganha chevron.
- **Progresso (O-11).**
  - Abaixo de 768 px: barra segmentada no topo, derivada de `onboardingFlow` e `blockForScenario`, com o capítulo atual e os concluídos distinguíveis sem depender só de cor.
  - A partir de 768 px: trilho lateral "Configuração inicial" com os quatro capítulos numerados, na ordem "Seu negócio", "Sua agenda", "Sua IA", "WhatsApp". O capítulo atual tem `aria-current="step"`. Capítulo concluído mostra ✓ no lugar do número e tem nome acessível com "concluído".
  - As duas formas podem existir no DOM, com uma delas escondida por `display: none` na largura em que não vale, para que só uma fique na árvore de acessibilidade.
  - A moldura da etapa `importacao` (`OnboardingFrame`) usa o mesmo progresso.
  - "Sair" continua na moldura, com o mesmo nome acessível.
- **CTA (O-12).** O botão primário da etapa ocupa a largura da coluna do formulário, ancorado embaixo, conforme o protótipo. As ações secundárias (por exemplo "Fazer depois", "Pular esta etapa") continuam visíveis e na ordem de hoje. A ordem da introdução do WhatsApp (observação 3 do review065) fica para o 079; aqui ela só perde o "Voltar" do rodapé.
- **Seleção (O-13, O-07).**
  - Chip selecionado: fundo tonal, borda petróleo e ✓ decorativo, com `aria-pressed` como hoje. As classes `.chip` e `.segment-chip-row` ficam, porque o gate as conta.
  - Cartão de modalidade: ícone à esquerda (pino para "Local próprio", casa para "A domicílio", monitor para "Online"), círculo de seleção à direita, fundo tonal e ✓ quando marcado. O controle continua um checkbox nomeado pelo título. O título deixa de ser heading.
  - `Choice` e `ActionCard`: o título passa de `<h2>` a texto sem heading (por exemplo `<span>` com a mesma classe visual). O nome acessível do botão continua começando pelo título. Nenhum `h1`–`h6` fica dentro de `<button>` ou `<label>` no onboarding.
- **Duração (O-25).** − e + mudam 5 minutos; atalhos 30, 60 e 90, com `aria-pressed`. O campo continua editável, com `min=5`, `max=1440` e `step=5`; valor fora do passo é recusado pela validação em linha, com a mensagem "A duração vai de 5 em 5 minutos.". Pode reaproveitar o padrão de `ServiceForm.tsx`. Se extrair um componente compartilhado, os testes de Serviços continuam passando sem mudança de asserção.
- **Preço (O-27).** `CurrencyInput` no lugar do `type="number"`, mostrando "R$ 90,00". O valor gravado continua o mesmo de hoje (reais, com centavos) em `PATCH /v1/onboarding`. Nenhum contrato muda. O erro de servidor de `service.price` aparece no campo do preço, e não no primeiro campo da seção (observação 4 do review065).
- **Dias (O-29).** Sete pílulas numa linha, de segunda a domingo, cada uma um checkbox nomeado pelo nome completo do dia. Abaixo, um resumo em texto:
  - dias corridos: "Segunda a sábado · 6 dias por semana";
  - dias soltos: "Segunda, quarta e sexta · 3 dias por semana";
  - um dia: "Só segunda · 1 dia por semana".
  - O erro de nenhum dia marcado continua o de hoje.
- **Horas (O-32).** Os `type="time"` continuam como controle, com rótulo e validação de fim depois do início, e passam a mostrar a hora grande em Literata. Abaixo, uma barra de 0 a 24 h mostra o intervalo, decorativa (`aria-hidden`), e o intervalo também fica escrito em texto. "Personalizar dias diferentes" continua botão com `aria-expanded`, e a personalização por dia não muda de comportamento.
- **Guard da `importacao`.** Aberta sem `calendarSource` no rascunho, a etapa troca a rota para `/onboarding/sistema-atual` (`router.replace`), sem chamar a importação. Com a fonte gravada, abre como hoje.
- **Sem mudança** no BFF, no contrato, na ordem das etapas, em `onboardingFlow`, no que cada etapa grava, na importação dentro do onboarding (Goal066), no painel de conexão do WhatsApp (Goal071) nem no teste real (Goal063).

## Fora do escopo

- O-36/O-37 (demonstração animada e conversa do protótipo), O-39 (amostra por estilo), O-42 (promessas com ícone e ênfase), a composição animada da Boas-vindas e a observação 3 do review065: Goal079.
- A busca por CEP de O-15: pendente de decisão humana.
- A observação 5 do review065 (dia personalizado só no início): comportamento de retomada que o 066 mandou preservar.
- As observações 1 e 2 do [review078](../reviews/078-review.md): formulário de Serviços.
- `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/public-api-contract/`, `scripts/` e `tools/ia-loop/`.

## Dependências e contexto mínimo

- Goal077 ACCEPTED (baseline acima). O Goal065 reescreveu o onboarding conforme o vault, o Goal066 pôs a importação nele, o Goal068 fez a marca e o Goal076 o − / + da duração e o uso de `CurrencyInput` em Serviços.
- Arquivos de partida: `apps/frontend/src/features/onboarding/OnboardingShell.tsx`, `OnboardingScreen.tsx`, `OnboardingImportStep.tsx`, `blocks.ts`, `blocks/shared.tsx`, `blocks/business.tsx`, `blocks/schedule.tsx`; `shared/ui/CurrencyInput.tsx`; `features/services/ServiceForm.tsx` (só como padrão); o CSS do onboarding em `shared/styles/`.
- Testes de partida: `apps/frontend/tests/goal065-onboarding-business.test.tsx`, `goal065-onboarding-schedule.test.tsx`, `goal065-onboarding-copy-whatsapp.test.tsx`, `goal066-onboarding-importacao.test.tsx`, `goal066-onboarding-sistema-atual.test.tsx`, `goal018-onboarding-reachability.test.tsx`, `goal063-onboarding-activation.test.tsx`, `goal071-onboarding-whatsapp.test.tsx`.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Voltar no topo, progresso, CTA e guard da `importacao` | `features/onboarding/OnboardingShell.tsx`, `OnboardingScreen.tsx`, `OnboardingImportStep.tsx`, `blocks.ts`, `shared/styles/` |
| Chip, cartão, modalidade, `Choice` e `ActionCard` | `features/onboarding/blocks/shared.tsx`, `blocks/business.tsx`, `shared/styles/` |
| Duração, preço, dias e horas | `features/onboarding/blocks/schedule.tsx`, `shared/ui/` (se extrair), `shared/styles/` |
| Testes | `apps/frontend/tests/goal072-*.test.tsx` |

## Escopo obrigatório

### 1. A moldura (O-10, O-23, O-11, O-12)

- Voltar, progresso e CTA conforme as escolhas de desenho, em todas as etapas, inclusive as do capítulo 3.

### 2. Seleção (O-07, O-13, observação 2 do review066)

- Chip, modalidade, `Choice` e `ActionCard` conforme as escolhas de desenho.

### 3. Campos da agenda (O-25, O-27, O-29, O-32, observação 4 do review065)

- Duração, preço, dias e horas conforme as escolhas de desenho.

### 4. Guard da `importacao` (observação 1 do review066)

- Conforme as escolhas de desenho.

### 5. O gate renderizado

- Todas as `ONBOARDING_ROUTES` continuam medidas pelo gate autenticado dentro de `validate:integration`, nas cinco larguras. As rotas públicas continuam medidas por `validate:ui`. Nenhuma rota entra ou sai, e `authenticated-matrix.spec.ts` não muda.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela, sem desligar medida. O chevron, cada segmento ou capítulo interativo (se houver), cada pílula de dia, − e +, cada atalho, cada chip e cada cartão são alvos de toque e precisam de pelo menos 24 px. As pílulas dos sete dias cabem na largura em 360 px sem rolagem horizontal. O chevron cinza da Boas-vindas passa no contraste computado do gate, se o gate o medir.

### 6. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `79d2133`. Testes em `apps/frontend/tests/goal072-*.test.tsx` (jsdom), com o serviço de dados dublado como nos testes do Goal065 e do Goal066.

1. Em cada etapa com etapa anterior (pelo menos `segmento-e-nome`, `endereco`, `sistema-atual` com e sem "Local próprio", `quando-importar`, `servico-nome`, `horarios`, `tom-da-ia`, `whatsapp-conectar` e `teste-real`), existe um único link "Voltar", no topo, com o `href` de hoje, e nenhum "Voltar" no rodapé.
2. Na Boas-vindas, "Voltar" existe com `aria-disabled="true"`, sem `href` e fora da ordem de Tab. Em `teste-real-sucesso` e `whatsapp-concluido`, não existe "Voltar".
3. O trilho "Configuração inicial" tem os quatro capítulos na ordem do protótipo. Em `servico-nome`, "Sua agenda" tem `aria-current="step"` e "Seu negócio" tem nome acessível com "concluído". A barra segmentada tem o mesmo capítulo atual.
4. Nenhum `h1`–`h6` dentro de `<button>` ou `<label>` nas etapas `modalidade`, `sistema-atual`, `tom-da-ia` e `dias-de-atendimento`. Os botões de `sistema-atual` continuam alcançáveis pelo nome do título.
5. Cada cartão de modalidade tem ícone decorativo e continua um checkbox nomeado pelo título; marcado, tem a classe de seleção e o ✓. O chip de segmento selecionado tem `aria-pressed="true"` e o ✓; `.segment-chip-row` continua com oito `.chip`.
6. Na duração, + a partir de 60 dá 65, − dá 55, o atalho 90 dá 90 com `aria-pressed="true"`, e 7 digitado é recusado com "A duração vai de 5 em 5 minutos." sem gravar.
7. O preço mostra "R$ 90,00" e grava o mesmo valor de hoje em `PATCH /v1/onboarding`. Um erro de servidor em `service.price` aparece no campo do preço.
8. Os dias são sete checkboxes nomeados pelo nome completo; o resumo diz "Segunda a sábado · 6 dias por semana", "Segunda, quarta e sexta · 3 dias por semana" e "Só segunda · 1 dia por semana" nas seleções correspondentes.
9. Em `horarios`, o intervalo aparece em texto, a barra de 0–24 h é `aria-hidden`, o fim antes do início continua recusado, e "Personalizar dias diferentes" continua com `aria-expanded`.
10. `/onboarding/importacao` com `calendarSource` nulo troca a rota para `/onboarding/sistema-atual` e não chama a importação; com a fonte gravada, abre a etapa.

Os testes existentes continuam passando. Só muda asserção que dependa de composição trocada aqui: por exemplo, "Voltar" como botão do rodapé, o `<h2>`/`<h3>` como heading nos cartões e o `type="number"` do preço, nos testes do Goal065 e do Goal066. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual. As asserções de gravação, de validação em linha, de axe, de guarda por fonte e de reachability do onboarding não podem ser apagadas; podem mudar de seletor.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório, com a rodada de origem de cada um:

1. "Voltar" volta ao rodapé em `servico-nome`: o teste 1 reprova.
2. O chevron da Boas-vindas ganha `href`: o teste 2 reprova.
3. O trilho perde o `aria-current="step"`: o teste 3 reprova.
4. `Choice` volta a ter `<h2>`: o teste 4 reprova.
5. O chip selecionado perde o ✓: o teste 5 reprova.
6. A duração volta a passo 1: o teste 6 reprova.
7. O preço volta a `type="number"`: o teste 7 reprova.
8. O resumo dos dias deixa de contar os dias: o teste 8 reprova.
9. O guard da `importacao` sai: o teste 10 reprova.

### 8. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-094** em `PROPOSED`, no formato de D-085 a D-093. Ela diz:
  - o voltar no topo, inativo na Boas-vindas e ausente nas telas de estado do teste real;
  - o progresso segmentado abaixo de 768 px e o trilho de capítulos a partir de 768 px;
  - a seleção tonal com ✓ e a regra de nenhum heading dentro de controle;
  - duração em passos de 5 minutos, preço com máscara sem mudança de contrato, resumo dos dias e a barra de horas decorativa;
  - o guard da `importacao`;
  - a divisão da v100 com o 079 e a busca por CEP pendente de decisão humana.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§55**, sem reescrever §4 a §54. Registra O-07, O-10/O-23, O-11, O-12, O-13, O-25, O-27, O-29 e O-32 corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, a conferência humana pendente e as contagens da execução final.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§54 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada (observação 6 do review069; rodadas 2 e 3 do review078).

**Ordem obrigatória, a mesma dos Goals065 a 077:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os nove controles do §7.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Antes de entregar uma rodada de correção, rode um grep, nos documentos do §8, de cada frase que o review apontou como falsa, e cole o resultado vazio no relatório.

### 9. O que só uma pessoa confere

- Que as etapas dos capítulos "Seu negócio" e "Sua agenda", percorridas num aparelho real nas cinco larguras, batem com os três protótipos do Objetivo.
- Que o trilho, o chevron e o CTA na largura da coluna batem com os protótipos também nas etapas dos capítulos "Sua IA" e "WhatsApp".
- Que o chevron cinza da Boas-vindas, a barra de horas e o resumo dos dias leem bem.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 10. O que este Goal não pode fazer

- Só toca `apps/frontend/` e os documentos do §8. Não toca `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/public-api-contract/`, `scripts/`, `tools/ia-loop/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma migration, nenhuma rota, nenhuma mudança de contrato.
- Não muda configuração de teste nem de build: `vitest.config.*`, `playwright.config.*`, `next.config.ts`, `e2e/routes.ts`, `e2e/measure.ts` e `e2e/authenticated-matrix.spec.ts` ficam como estão. **Falha de gate por ambiente** (memória, contenção, porta, rede) é reexecutada ou reportada, nunca corrigida editando configuração (rodada 3 do review073, rodada 2 do review077). Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.
- Não muda o que cada etapa grava nem a ordem das etapas.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Toda etapa com etapa anterior tem um único "Voltar" no topo, com o destino de hoje; a Boas-vindas o tem inativo; nenhuma etapa tem "Voltar" no rodapé. Provado pelos testes jsdom §6.1 e §6.2.
2. O trilho "Configuração inicial" e a barra segmentada marcam o capítulo atual e os concluídos sem depender de cor. Provado pelo teste jsdom §6.3; a troca entre as duas formas por largura é decidida pelo gate autenticado dentro de `validate:integration`, que mede as etapas nas cinco larguras.
3. Nenhum heading dentro de controle; modalidade com ícone e indicador; chip com ✓. Provado pelos testes jsdom §6.4 e §6.5.
4. Duração em passos de 5 minutos com atalhos, preço com máscara e o mesmo valor gravado, erro de preço no campo certo, resumo dos dias e horas com o intervalo em texto. Provado pelos testes jsdom §6.6 a §6.9.
5. A etapa `importacao` sem fonte volta a `sistema-atual`. Provado pelo teste jsdom §6.10.
6. Largura, toque, contraste, foco e movimento de todas as etapas do onboarding são decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas; os das rotas públicas, por `validate:ui`. A fidelidade ao protótipo não é provada por teste; fica no §9.
7. Os nove controles negativos do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
8. Typecheck e lint de `apps/frontend` passam. `test:frontend` não tem teste a menos que a recontagem da baseline (referência: **112**/**1146**); `test:gate` não tem teste a menos que **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **160** testes e **0** retentativas. Provado por execução.
9. D-094 em `PROPOSED`, FINAL_AUDIT §55, CURRENT_STATE e VALIDATION_GATE foram escritos depois da execução final e dos controles, trazem as contagens da execução final e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
10. `git status --porcelain=v1 -uall` lista só arquivos de `apps/frontend/` e os documentos do §8, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que o onboarding bate com os protótipos aprovados (conferência humana);
- a demonstração animada, a amostra por estilo, as promessas e a Boas-vindas animada (Goal079);
- a busca por CEP (pendente de decisão humana).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Moldura: voltar no topo, progresso segmentado e trilho, CTA na largura da coluna e guard da `importacao`, com os testes §6.1 a §6.3 e §6.10 (§1, §4) |
| WU-02 | STANDARD | WU-01 | Seleção: chip, modalidade, `Choice` e `ActionCard`, com os testes §6.4 e §6.5 (§2) |
| WU-03 | STANDARD | WU-02 | Campos da agenda: duração, preço, dias e horas, com os testes §6.6 a §6.9 (§3) |
| WU-04 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-03 | testes dirigidos de `apps/frontend` com o filtro `goal072` |
| WU-07 | DETERMINISTIC | WU-03 | testes dirigidos de `apps/frontend` com o filtro `goal065-onboarding` |
| WU-08 | DETERMINISTIC | WU-03 | testes dirigidos de `apps/frontend` com o filtro `goal066-onboarding` |
| WU-09 | DETERMINISTIC | WU-04…WU-08 | validate-core |
| WU-10…WU-12 | DETERMINISTIC | WU-09 | gate-tests, validate-ui e validate-integration |
| WU-13 | STANDARD | WU-10, WU-11, WU-12 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular.

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, sem editar configuração.
