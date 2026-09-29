# Goal 076 — Fidelidade visual: Serviços

**Status: READY.** Preparado em 2026-09-29 pelo Tech Lead Agent após [Goal075 ACCEPTED](../reviews/075-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v96, com o mesmo ID e o mesmo título, dividida do 075. **A v97 reduz o escopo**: "Instruções para a IA", que a v96 punha aqui, sai deste Goal e forma o novo **078 — Instruções privadas por serviço**, PLANNED, logo depois deste e antes do 077. Motivo, conferido no código desta passada: a instrução não chega ao modelo com o que existe hoje (ver "O que a evidência desta passada mostra", item 7), e fazê-la chegar é mudança do grafo, do prompt e do contrato do orquestrador, não de tela. Com a saída, este Goal é **só frontend**.

## Baseline aceita

Baseline aceita: `faa094367cdcf6f04d4ccf12e9fd625a1e881128`

Goal anterior: 075 — Fidelidade visual: Clientes

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal075 já integrado em `main` (origem `b69b617c03739434ba2ee6b970a7f64a40ee24d9`). A virada de status do documento do Goal075 para `ACCEPTED` veio depois, no commit documental `93b6063`, que não é a baseline. **Duas rodadas**, com 4 e 0 blockers. **D-090** foi aceita e [FINAL_AUDIT §51](../FINAL_AUDIT.md) escrita sem reescrever §4 a §50. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review075](../reviews/075-review.md) e de FINAL_AUDIT §51: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **106** arquivos e **1100** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **155** testes e **0** retentativas, rodado também no IA Loop. Backend, que este Goal não toca: `test:ai-orchestrator` **1136** passando e **93** pulados de **1229**, `test:scheduling-service` **37** arquivos e **502** testes, `test:bff-integration` **58** arquivos e **448** testes.

## Objetivo e posição

Fazer Serviços (`/servicos`, `/servicos/novo`, `/servicos/editar` e as telas de `features/services/`) bater com os protótipos `Servicos.dc.html`, `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html` (`docs/design-reference/claude-design/prototype/project/`), consultados só nos estados S1 (lista) e S3 (novo serviço), e S5 só para as frases por tipo de preço:

1. **A lista é uma lista, não uma tabela**: cada linha com "nome · duração · preço", um filete na cor do serviço, as pendências em âmbar com "Corrigir" e os inativos separados, com "a IA não oferece" (SV-03).
2. **O formulário tem os apoios do protótipo**: duração com − e + e atalhos 30, 60 e 90, e a frase "A IA responde: …" que mostra como a IA fala o que está sendo cadastrado (SV-04, sem "Instruções para a IA").
3. **Nenhuma copy técnica**: sai a faixa "Gerenciado pela Agenda Atendly · … · Controle completo" e a origem "Agenda Atendly" repetida em cada linha (SV-05).

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **SV-03**, **SV-04** sem "Instruções para a IA" e **SV-05**. SV-01 e SV-02 já foram corrigidos no Goal058. A parte "Instruções para a IA" de SV-04 é do Goal078; CV-05, NT-01 e NT-02, do Goal077; o onboarding, do Goal072.

## O que a evidência desta passada mostra

Conferido no código da baseline `faa0943`:

1. **A lista é uma grade de tabela.** `apps/frontend/src/features/services/ServiceList.tsx:147-156` desenha o cabeçalho Serviço/Duração/Preço/Status/Ação, e cada linha (`:158-215`) repete o ícone e a origem "Agenda Atendly" (`:168`), um selo "Ativo" ou "Inativo", o selo "Revisar · <origem>" quando `needsReview`, e um botão "Desativar" ou "Ativar" por linha (`:196-204`), com o link de edição de nome acessível `Editar <nome>` (`:207-213`). Pendentes e inativos ficam misturados com os ativos, separados só pelo filtro Todos/Ativos/Inativos (`:129-138`) (SV-03).
2. **A faixa técnica aparece em duas telas.** `DirectorySourceStrip` (`ServiceList.tsx:299-314`) diz "Gerenciado pela Agenda Atendly", "Serviços podem ser criados, editados e desativados aqui." e o selo "Controle completo"; é usada na lista (`:99`) e no formulário (`ServiceForm.tsx:18` e `:163`) (SV-05).
3. **A duração é um campo numérico cru.** `ServiceForm.tsx` desenha `name="duration"` com `min={1}` e `step={1}` (o Goal058 trocou o `step={5}` de SV-01), sem − nem +, sem atalhos e sem frase de prévia (SV-04).
4. **O contrato já traz tudo o que a lista precisa.** `serviceSchema` (`packages/public-api-contract/src/schemas.ts:262-277`) tem `colorToken`, `needsReview`, `reviewOrigin`, `active`, `priceType`, `price`, `durationMinutes` e `recurrenceIntervalDays`. Filete, pendência, "Corrigir", inativos e a frase não pedem campo novo.
5. **O modo somente leitura existe.** A lista só mostra ações quando `result?.editable` (`ServiceList.tsx:195-216`); fora disso, "Somente leitura". Essa guarda por fonte continua.
6. **O gate autenticado já mede Serviços.** `e2e/routes.ts:91` mede `/servicos` com `contentMarker: "Serviços"`. `authenticated-matrix.spec.ts:1251-1261` abre o serviço semeado pelo link de nome `Editar <nome>` e espera `form input[name="name"]` com o nome; `saveDurationByForm` (`:1268-1300`) preenche `form input[name="duration"]`, clica "Salvar alterações" e espera o `PATCH /v1/services/…`. Esses três pontos são invariantes deste Goal, porque os arquivos do gate não mudam (§10).
7. **"Instruções para a IA" não chega ao modelo com o que existe.** O vault fixa a instrução privada por serviço como vigente no MVP (Q345, Q566 e R17-478 de `99-Perguntas-e-Respostas.md`), e `KnowledgeDocument` já tem `serviceId`. Mas `retrieveKnowledge` só roda quando o turno é classificado como `knowledge` (`apps/ai-orchestrator/src/modules/graph/message-graph.ts:1303`), a busca é semântica com nota mínima (`pgvector-knowledge-store.ts:147-156`), e `buildKnowledgePrompt` manda ignorar instrução dentro dos trechos, sem regra de não citar. Por isso a instrução foi para o Goal078.

## Escolhas de desenho desta passada

- **Só frontend.** Nenhum campo, rota ou regra muda no BFF, no contrato, no Scheduling ou no orquestrador. A lista e o formulário leem e gravam pelos mesmos `GET /v1/services`, `POST /v1/services` e `PATCH /v1/services/:id` de hoje.
- **Cabeçalho da lista**: o título "Serviços" continua como `<h1>`, porque o gate usa esse marcador. Abaixo, o resumo em uma linha, "6 ativos · 1 precisa de revisão · 1 inativo", com singular e plural certos e sem as partes zeradas.
- **Três grupos, nesta ordem**, cada um só quando não vazio:
  - **Precisa de revisão**: `needsReview`, em âmbar, com "Precisa de revisão · sem duração" e a ação "Corrigir", que abre `/servicos/editar?id=`. A origem da pendência (importação ou cadastro manual) continua legível, como no Goal015.
  - **Ativos**: ativos e fora de revisão, em ordem alfabética pt-BR.
  - **Inativos**, sob um separador "Inativos": cada linha com "a IA não oferece" no fim do texto secundário. Inativo em revisão fica em "Precisa de revisão".
- **A linha**: o nome em destaque e, abaixo, "duração · preço", e " · a cada N semanas" (ou "a cada N dias", quando `recurrenceIntervalDays` não é múltiplo de 7) quando há recorrência:
  - duração: "40 min", "1 h", "1 h 30", "2 h"; sem duração, "sem duração";
  - preço: `FIXED` "R$ 90" (centavos só quando não zero, "R$ 55,50"), `STARTING_AT` "a partir de R$ 60", `ON_REQUEST` "sob consulta", `NOT_INFORMED` "sem preço informado".
- **O filete na cor**: uma barra vertical à esquerda da linha na cor de `colorToken`, com as mesmas cores da prévia de cor que o formulário já desenha (`.service-swatch[data-color]` em `shared/styles/atendly-services.css:57` em diante); sem cor, um filete neutro. A cor nunca é a única informação: o texto da linha não depende dela.
- **A ação de cada linha**: a linha inteira é o link de edição, com nome acessível **exatamente** `Editar <nome>`, porque o gate a abre por esse nome. "Corrigir" é um link visível a mais, só nas pendentes, com nome acessível `Corrigir <nome>`, para o mesmo destino.
- **Ativar e desativar continuam alcançáveis**, com o mesmo diálogo de confirmação de hoje ("Desativar serviço?", "Ativar serviço?") e o mesmo `PATCH`. O Developer escolhe entre manter a ação na linha, num menu da linha, ou no formulário de edição (o protótipo S4 e S8 a põem no formulário), e declara no relatório onde ficou. Nenhum serviço é excluído.
- **Somente leitura**: sem `editable`, nenhuma linha tem link de edição, "Corrigir" nem ativar/desativar, e a tela diz em linguagem de dono de negócio que os serviços não podem ser editados aqui.
- **Busca e filtro**: a busca por nome continua; o filtro Todos/Ativos/Inativos pode sair, porque os grupos o substituem, ou ficar, a critério do Developer, declarado no relatório. Grupo que a busca esvazia some.
- **Duração no formulário**:
  - o campo continua sendo `input` de nome `duration`, digitável, com a validação do Goal058: 40, 45, 60 e 41 válidos, 0 recusado, vazio válido;
  - "−" e "+" ao lado, com nomes acessíveis "Diminuir duração" e "Aumentar duração", mudam 5 minutos por clique; "−" não desce abaixo de 5 e, com o campo vazio, não faz nada; "+" com o campo vazio põe 5;
  - atalhos "30", "60" e "90" abaixo, que põem o valor exato; o atalho igual ao valor atual aparece selecionado (`aria-pressed`);
  - o texto "min" fica junto do número, como no protótipo.
- **A frase "A IA responde"** abaixo do preço, atualizada a cada mudança de nome, duração, tipo de preço ou valor, com o texto entre aspas curvas. Sem artigo, porque o gênero do nome do serviço não é conhecido — divergência declarada frente ao "A manicure é…" do protótipo, para a conferência humana:
  - `FIXED`: "Manicure custa R$ 55 e leva 40 min."
  - `STARTING_AT`: "Escova custa a partir de R$ 60 e leva 40 min."
  - `ON_REQUEST`: "O valor de Coloração é combinado no atendimento, que leva 1 h 30."
  - `NOT_INFORMED`: "Hidratação leva 30 min; o valor você confirma com a cliente."
  - sem duração, a parte da duração some ("Manicure custa R$ 55."); sem nome, a frase não aparece; com preço fixo ou a partir de sem valor, a frase não aparece.
  - A frase é **prévia**, rotulada como tal, e não é o texto literal que o modelo vai gerar. Nenhum teste nem documento diz que a IA fala exatamente isso.
- **Copy**: saem "Gerenciado pela Agenda Atendly", "Serviços podem ser criados, editados e desativados aqui.", "Controle completo" e a origem "Agenda Atendly" por linha, na lista e no formulário. `DirectorySourceStrip` deixa de ser usado; pode ser removido.
- **O que o formulário não ganha**: "Instruções para a IA" (Goal078), "Onde é feito" (modalidade por serviço, não é achado da revisão local), o sheet de tipo de preço do S5, o de recorrência do S6, o de revisão do S7 e o de sair sem salvar do S9. As opções atrás de `<details>` continuam como estão.

## Fora do escopo

- "Instruções para a IA" (parte de SV-04): Goal078. Conversas e a central de notificações (CV-05, NT-01, NT-02): Goal077. Onboarding fiel ao protótipo, inclusive o stepper de duração do onboarding (O-25): Goal072.
- Regra de catálogo (D-023: quatro tipos de preço, duração opcional com revisão, predicado operacional), de ocupação por buffers e de recorrência.
- As observações do [review075](../reviews/075-review.md) e do [review069](../reviews/069-review.md): ficam como registradas em MIGRATION_STATUS.
- `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/public-api-contract/`, `apps/evolution-go/`, `scripts/` e `tools/ia-loop/`.

## Dependências e contexto mínimo

- Goal075 ACCEPTED (baseline acima). O Goal007 fez o catálogo, o Goal015 a tela de Serviços e o Goal058 a correção da duração e do preço (SV-01, SV-02) e a casca medida pelo gate.
- Arquivos de partida: `apps/frontend/src/features/services/ServiceList.tsx`, `ServiceForm.tsx`, `ProductServicesScreen.tsx`; `apps/frontend/src/shared/styles/atendly-services.css` e `atendly.css`.
- Testes de partida: `apps/frontend/tests/goal015-services.test.tsx`, `goal058-service-form.test.tsx`, `service-schema.test.ts`, `goal015-shell-invariant.test.tsx`.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Lista, grupos, linha, filete, "Corrigir", ativar/desativar, copy | `apps/frontend/src/features/services/ServiceList.tsx`, `shared/styles/atendly-services.css` |
| Duração com − e +, atalhos, frase, copy do formulário | `apps/frontend/src/features/services/ServiceForm.tsx`, `shared/styles/atendly-services.css` |
| Formatação comum de duração e preço | onde o Developer escolher dentro de `features/services/`, usada pela linha e pela frase |
| Testes | `apps/frontend/tests/goal076-*.test.tsx` |

## Escopo obrigatório

### 1. Lista (SV-03, SV-05)

- Cabeçalho, resumo, três grupos, linha, filete, "Corrigir", ativar/desativar e somente leitura conforme as escolhas de desenho.
- A linha é link com nome acessível exatamente `Editar <nome>`.
- Nenhuma das copies proibidas aparece em `/servicos`.

### 2. Formulário (SV-04 sem instruções, SV-05)

- Duração com − e +, atalhos e validação do Goal058, conforme as escolhas de desenho. O campo continua `name="duration"` e o botão de edição continua "Salvar alterações".
- A frase "A IA responde" conforme as escolhas de desenho.
- Nenhuma das copies proibidas aparece em `/servicos/novo` nem `/servicos/editar`.

### 3. O gate renderizado

- `/servicos` continua medida pelo gate autenticado dentro de `validate:integration`, nas cinco larguras; o serviço semeado continua aberto pelo link `Editar <nome>`, e `saveDurationByForm` continua preenchendo a duração e salvando. As rotas públicas continuam medidas por `validate:ui`. Nenhuma rota entra ou sai.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela, sem desligar medida. "−", "+", os atalhos, "Corrigir" e a linha são alvos de toque e precisam de pelo menos 24 px. O âmbar da pendência precisa passar no contraste computado do gate.

### 4. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `faa0943`. Todos em `apps/frontend/tests/goal076-*.test.tsx` (jsdom), com o serviço de dados dublado como nos testes do Goal015:

1. Com serviços dos quatro tipos de preço, com e sem duração e com recorrência de 35 dias, cada linha mostra "45 min · R$ 90", "40 min · a partir de R$ 60", "30 min · sem preço informado", "1 h 30 · sob consulta · a cada 5 semanas" e "2 h · R$ 250 · a IA não oferece", sem a origem "Agenda Atendly".
2. Os grupos: o pendente aparece sob "Precisa de revisão" com "Corrigir" levando a `/servicos/editar?id=<id>`; o inativo aparece sob "Inativos"; os ativos ficam em ordem pt-BR; o resumo diz "N ativos · N precisa(m) de revisão · N inativo(s)" com os números certos; a busca esconde grupo vazio.
3. Cada linha é link com nome acessível exatamente `Editar <nome>`; a linha tem o filete com a cor de `colorToken` e o filete neutro sem cor; sem `editable`, não há link de edição, "Corrigir" nem ativar/desativar.
4. Ativar e desativar continuam alcançáveis, abrem a confirmação e chamam o `PATCH` com `active` trocado.
5. "+" leva de vazio a 5 e de 40 a 45; "−" leva de 45 a 40, não desce abaixo de 5 e não faz nada com o campo vazio; "30", "60" e "90" põem o valor exato e ficam `aria-pressed` quando iguais ao valor; o valor digitado 41 continua válido.
6. A frase mostra o texto de cada um dos quatro tipos de preço, some sem nome, perde a parte da duração sem duração e acompanha a mudança de tipo e de valor.
7. Nenhuma destas copies aparece em `/servicos`, `/servicos/novo` nem `/servicos/editar`: "Gerenciado pela", "Controle completo", "podem ser criados, editados e desativados aqui", e "Agenda Atendly" como origem da linha.

Os testes existentes continuam passando. Só muda asserção que dependa de texto ou composição trocados aqui. O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual. As asserções do `goal058-service-form.test.tsx` (duração válida e inválida, preço vazio no serviço novo, digitação do preço, buffers com `min 0` e `step 5`), as de axe do Goal015, as de guarda por fonte e as da invariante da casca (D-030, D-031) não podem ser apagadas; podem mudar de seletor.

### 5. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. A linha volta a mostrar a origem "Agenda Atendly": o teste 1 ou o 7 reprova.
2. O serviço pendente volta ao grupo dos ativos, sem "Corrigir": o teste 2 reprova.
3. O link da linha perde o nome `Editar <nome>`: o teste 3 reprova.
4. "+" passa a somar 1 minuto: o teste 5 reprova.
5. A frase de `STARTING_AT` perde "a partir de": o teste 6 reprova.
6. `DirectorySourceStrip` volta ao formulário: o teste 7 reprova.

### 6. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-091** em `PROPOSED`, no formato de D-085 a D-090. Ela diz:
  - que a lista de Serviços tem três grupos (revisão, ativos, inativos), a linha "duração · preço", o filete na cor e "Corrigir", e onde ficou ativar e desativar;
  - que a duração tem − e + de 5 minutos e atalhos, sem mudar a validação do Goal058;
  - que a frase "A IA responde" é prévia do frontend, não o texto do modelo, e a divergência declarada do artigo;
  - que "Instruções para a IA" ficou para o Goal078.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§52**, sem reescrever §4 a §51. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, as telas medidas, a conferência humana pendente e as contagens da execução final.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§51 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada (observação 6 do review069).

**Ordem obrigatória, a mesma dos Goals065 a 075:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rode os seis controles do §5.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Entrega parcial sem essa lista reprova (observação 4 do review068). Documento não afirma blocker corrigido antes de a correção ser executada e conferida (observação 4 do review074). Antes de entregar uma rodada de correção, rode um grep, nos quatro documentos, de cada frase que o review apontou como falsa, e cole o resultado vazio no relatório (rodadas 3 a 5 do review069).

### 7. O que só uma pessoa confere

- Que a lista e o formulário, percorridos num aparelho real nas cinco larguras, com serviço pendente, ativo e inativo, batem com `Servicos.dc.html`, `Servicos-Tablet.dc.html` e `Servicos-Desktop.dc.html`.
- Que o filete e o âmbar leem bem e que "duração · preço" cabe na linha em 360 e 390 px sem esconder o nome, porque jsdom não tem layout nem cascata.
- Que a frase sem artigo ("Manicure custa R$ 55 e leva 40 min.") é aceitável frente ao "A manicure é R$ 55 e leva 40 min." do protótipo.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 8. O que este Goal não pode fazer

- Só toca `apps/frontend/` e os documentos do §6. Não toca `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/public-api-contract/`, `apps/evolution-go/`, `scripts/`, `tools/ia-loop/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma migration, rota, campo de contrato ou regra de catálogo.
- Não muda configuração de teste: `vitest.config.*`, `playwright.config.*`, `e2e/routes.ts` e `e2e/authenticated-matrix.spec.ts` ficam como estão. Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A lista mostra os três grupos, a linha "duração · preço", o filete, "Corrigir" e ativar/desativar, sem copy técnica, e a linha continua sendo o link `Editar <nome>`. Provado por execução jsdom do §4.1 a §4.4 e §4.7.
2. O formulário tem − e + de 5 minutos, atalhos e a frase por tipo de preço, sem copy técnica, e a validação do Goal058 continua. Provado por execução jsdom do §4.5 a §4.7 e de `goal058-service-form.test.tsx`.
3. Largura, toque, contraste, foco e movimento de `/servicos` e do formulário de edição são decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas; os das rotas públicas, por `validate:ui`. A fidelidade ao protótipo não é provada por teste; fica na conferência humana do §7.
4. Os seis controles negativos do §5 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
5. Typecheck e lint de `apps/frontend` passam. `test:frontend` não tem teste a menos que a baseline (**106**/**1100**), e `test:gate` segue em **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **155** testes e **0** retentativas. Provado por execução.
6. D-091 em `PROPOSED`, FINAL_AUDIT §52, CURRENT_STATE e VALIDATION_GATE foram escritos depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §7 não foi feita. Provado por diff contra a execução.
7. `git status --porcelain=v1 -uall` lista só arquivos de `apps/frontend/` e os documentos do §6, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que Serviços bate com os protótipos aprovados (conferência humana);
- que a IA usa instrução privada por serviço (Goal078);
- a fidelidade visual de Conversas e da central de notificações (Goal077) e do onboarding (Goal072).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Lista com grupos, linha, filete, "Corrigir", ativar/desativar, somente leitura e copy, com testes §4.1 a §4.4 e a parte da lista do §4.7 (§1) |
| WU-02 | STANDARD | WU-01 | Formulário com − e +, atalhos, frase e copy, com testes §4.5, §4.6 e a parte do formulário do §4.7 (§2) |
| WU-03, WU-04 | DETERMINISTIC | WU-02 | typecheck e lint de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-02 | testes dirigidos de `apps/frontend` com o filtro `goal076` |
| WU-06 | DETERMINISTIC | WU-02 | testes dirigidos de `apps/frontend` com o filtro `goal058-service-form` |
| WU-07 | DETERMINISTIC | WU-02 | testes dirigidos de `apps/frontend` com o filtro `goal015-services` |
| WU-08 | DETERMINISTIC | WU-03…WU-07 | validate-core |
| WU-09…WU-11 | DETERMINISTIC | WU-08 | gate-tests, validate-ui e validate-integration |
| WU-12 | STANDARD | WU-09, WU-10, WU-11 | Controles negativos (§5) e documentação (§6), depois da execução final |
| WU-13 | DETERMINISTIC | WU-12 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular; por isso os três filtros ficam em três unidades.

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
