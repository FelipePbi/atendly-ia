# Goal 085 — Acabamento da casca, da Agenda e dos estados

**Status: PLANNED.** (READY na v109; de volta a PLANNED na v110, com o 086 à frente por instrução do usuário. Volta a READY com o mesmo ID, título e escopo, revalidando a baseline.) Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal082 ACCEPTED](../reviews/082-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v103, por instrução do usuário (Felipe Borges), a partir do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080); READY na v109, com o mesmo ID, título e posição. O escopo foi precisado nesta passada por evidência conferida no código.

## Baseline aceita

Baseline aceita: `10f2348bf120dcc43e49f762c7438abf49fdd4e9`

Goal anterior: 082 — A Minha Agenda conecta só com e-mail e senha e diz de quem é a falha

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal082 já integrado em `main` (origem `a222cc7eb5699fcc27e4a8a611109f57ee6d3c26`). A virada de status do documento do Goal082 para `ACCEPTED` entrou no próprio commit de fechamento. **Uma rodada**, sem blocker. **D-100** foi aceita e [FINAL_AUDIT §61](../FINAL_AUDIT.md) escrita sem reescrever §4 a §60. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review082](../reviews/082-review.md) e de FINAL_AUDIT §61: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **128** arquivos e **1337** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **175** testes e **0** retentativas.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline `10f2348` e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Esse é o piso usado para comparar a execução final; se divergir dos números acima, o relatório diz por quê. Nas recontagens do 081, do 083 e do 084, `test:gate` só passou depois de `npx prisma generate` no ai-orchestrator: é pré-condição do harness, não efeito do diff.

## Objetivo e posição

Fechar quatro achados do re-teste local em que a casca, a Agenda ou um estado dizem à pessoa algo diferente do que acontece:

- **R-06 (BAIXA).** Com a IA ativada e o WhatsApp desconectado, a sidebar diz "IA ativa" e, na mesma tela, o banner diz "Atendimento automático parado · Reconecte o WhatsApp". A IA não atende sem WhatsApp.
- **R-08 (BAIXA).** Em Clientes, nome, telefone e "último há…" aparecem sublinhados como link em todas as linhas. O protótipo CL1 não sublinha.
- **R-09 (BAIXA).** Na Semana, o atendimento de 1 h mostra só horário, ícone e "ATENDIMENTO"; nome e serviço ficam cortados. É resto de AG-04.
- **R-10 (MÉDIA, relatado por Felipe).** A sidebar e o conteúdo terminam antes do fim da janela, e sobra fundo cinza embaixo. Não reproduz no Chromium do Playwright.

O 085 é o último Goal PLANNED da tabela, na posição da v103. O 082 não tocou a casca, a Agenda nem a lista de Clientes.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **O ponto de estado da IA não olha o WhatsApp.** `aiStatusView` (`apps/frontend/src/shared/runtime/systemStatus.tsx`) deriva a apresentação só de `ai.state`. Dois lugares a mostram com "IA ativa": `StatusLine` na sidebar (`shared/layout/AppShell.tsx`) e `StatusPoint` nos pontos de estado da Home (`features/dashboard/DashboardScreen.tsx`). O banner da casca (`PersistentStatusBanner`, "Atendimento automático parado") e a faixa da Home (`resolveOperationalState`) já põem o WhatsApp desconectado à frente. O protótipo chama esse estado de **"IA sem conexão"** (`docs/design-reference/claude-design/prototype/project/Notificacoes-Tablet.dc.html`). O vault lista `IA ativa`, `IA pausada` e `IA com instabilidade` como estados da IA e "WhatsApp desconectado" como estado global próprio (`docs/product-vault/03-UX-UI/06-Copy-e-Linguagem.md`).
2. **A linha de lista é link sublinhado.** `ListItem` (`shared/ui/ListItem.tsx`) com `href` renderiza `<Link className="list-item">`. Nem `.list-item` nem a regra `a` de `shared/styles/atendly.css` (`color: inherit` só) tiram o sublinhado padrão do navegador. Os consumidores com link são `features/customers/CustomerList.tsx`, `CustomerForm.tsx` e `PrimaryGuardianPanel.tsx`.
3. **O bloco curto da Semana corta o nome.** `WeekEntryBar` (`features/agenda/WeekView.tsx`) empilha horário, tipo (com ícone, em maiúsculas), nome, detalhe e estado, um por linha. Em `shared/styles/atendly-agenda.css`, `.week-appointment` tem `height: calc(var(--span) * 72px - 10px)`, `min-height: 56px`, `padding: 8px 9px` e `overflow: hidden`: um bloco de 1 h tem 62 px, e o nome cai depois de horário e tipo. O atendimento semeado pelo gate autenticado (`scripts/goal033-authenticated-ui-rehearsal.mjs`, serviço "Corte") tem **30 min**, então cai no mínimo de 56 px. O nome acessível (`aria-label`) já tem tipo, nome, detalhe, horário e estado.
4. **A casca depende de unidade de viewport.** Em `shared/styles/atendly.css`, `.app-frame` tem `min-height: 100dvh` e `.sidebar` tem `position: sticky; top: 0; height: 100dvh`. O re-teste supôs `100vh`; o código usa `100dvh`, com o mesmo efeito: num navegador em que a unidade não acompanha a janela (webview, zoom, redimensionamento), a sidebar e a casca terminam antes do fim da janela. `body` tem `min-height: 100dvh` em `src/app/globals.css`, e `html` tem `background: var(--bg)`. O gate autenticado já mede a sobreposição horizontal entre `aside.sidebar` e `main` (`e2e/measure.ts`).

## Escolhas de desenho desta passada

**(a) Um derivado único para o ponto de estado da IA.** Uma função pura, ao lado de `aiStatusView`, recebe a apresentação da IA e a do WhatsApp e devolve o texto e o tom do ponto. Quando a IA está `active` e o WhatsApp está `off`, o ponto diz **"IA sem conexão"**, com o tom de perigo. Em qualquer outra combinação, o ponto diz o que diz hoje. A sidebar e os pontos de estado da Home consomem a mesma função; nenhum dos dois decide sozinho. Motivo: a palavra é a do protótipo; "IA pausada" diria que a pessoa pausou, e "IA desligada" diria que a IA foi desligada, e nenhum dos dois é verdade. WhatsApp `unknown` ou `loading` não muda o ponto da IA: só a desconexão confirmada muda.

**(b) A linha de lista não é sublinhada.** A regra base de `.list-item` usada como link tira o sublinhado, para toda `ListItem` com `href`. O foco visível, o fundo no `hover` e a cor herdada continuam.

**(c) O bloco curto da Semana põe o nome logo depois do horário.** Um bloco com menos de **75 min** (o limite que o re-teste observou) entra numa apresentação compacta, decidida no código pela duração da entrada: o nome é o primeiro texto visível depois do horário, na mesma linha ou na seguinte, e o detalhe vem depois, se couber. O rótulo de tipo sai do texto visível do bloco compacto e continua no nome acessível, que **não muda**. Bloqueio e compromisso sem cliente mostram o título no lugar do nome, como hoje. Blocos de 75 min ou mais ficam como estão.

**(d) A casca e a sidebar não dependem de unidade de viewport.** Nas regras de `.app-frame` e `.sidebar`, em toda largura, nenhuma altura usa `vh`, `dvh`, `svh` ou `lvh`. A sidebar cobre a janela inteira por um meio que não depende dessas unidades. Recomendação, não obrigação: `position: fixed` com `inset-block: 0` e a coluna do conteúdo deslocada pela largura da sidebar em cada faixa (248 px, 88 px abaixo de 1100 px, oculta abaixo de 768 px), ou a cadeia de altura `html`/`body` a 100%. Exigências do meio escolhido:

- a sidebar não sobrepõe `main` em largura nenhuma; a medida existente do gate autenticado continua passando;
- quando a janela é mais baixa que o conteúdo da sidebar, a sidebar rola sozinha e o menu da conta, no fim dela, continua alcançável;
- o fundo abaixo do conteúdo, quando o conteúdo é mais curto que a janela, é o mesmo fundo do conteúdo;
- a barra inferior e o cabeçalho do celular (abaixo de 768 px) não mudam.

**(e) Limite declarado de R-10.** O defeito não reproduz no Chromium do Playwright, porque nele `dvh` acompanha a janela. Por isso a prova vermelha de R-10 é uma guarda sobre a folha de estilo (§5, prova 6), e a medida renderizada do §5 é regressão: ela passa na baseline. Só a conferência humana do §8, no navegador em que Felipe viu o defeito, confirma a correção.

## Fora do escopo

- O estado por linha em Conversas: o protótipo muda a linha para "IA sem conexão" com o WhatsApp desconectado (`conversationState.ts`). Fica para o próximo Goal que tocar Conversas, junto com a observação 1 do review084 (JID estrangeiro formatado como brasileiro, nota de fechamento de D-099).
- `height: 100dvh` de `.conversation-detail-main` (`shared/styles/atendly-conversations.css`), a conversa aberta. É limite declarado: mexer nele mexe na rolagem interna do chat.
- A visão Dia e o Mês da Agenda. O bloco de 75 min ou mais na Semana.
- Qualquer mudança em `GET /v1/status`, no BFF, no Scheduling ou na IA.
- A observação 2 do review083 (a prop `calendar` de `AppointmentFlowShell`). A pergunta do item 5 de D-098 (aviso à cliente na criação), que é de uma pessoa.

## Dependências e contexto mínimo

- Decisões: D-030 e D-031 (uma chamada de `useShellConfig` por árvore), D-093 (sino, gaveta e item de notificações na sidebar), D-098 (rede de especificidade zero `:where()` para controles sem classe, medida de borda nativa no gate autenticado). Conferir em [DECISIONS](../DECISIONS.md) só o item que o diff tocar.
- Protótipo, só para (a) e (c): `Notificacoes-Tablet.dc.html` ("IA sem conexão") e a Semana de `Agenda-Desktop.dc.html`.
- Não é preciso abrir o vault além da linha citada em (1): nenhuma regra de produto muda.

## Pontos de implementação

- `apps/frontend/src/shared/runtime/systemStatus.tsx`: a função de (a).
- `apps/frontend/src/shared/layout/AppShell.tsx` e `apps/frontend/src/features/dashboard/DashboardScreen.tsx`: consumir (a). `AppShell.tsx` também, se (d) exigir mudança de marcação.
- `apps/frontend/src/shared/styles/atendly.css`: (b) e (d). `apps/frontend/src/app/globals.css`: só se (d) usar a cadeia de altura de `html`/`body`.
- `apps/frontend/src/features/agenda/WeekView.tsx` e `apps/frontend/src/shared/styles/atendly-agenda.css`: (c).
- `apps/frontend/e2e/authenticated-matrix.spec.ts` e, se preciso, `apps/frontend/e2e/measure.ts`: as medidas do §5, **só por acréscimo**.

## Escopo obrigatório

### 1. Ponto de estado da IA coerente com o WhatsApp

Implemente (a). O banner da casca, a faixa da Home e o texto do ponto do WhatsApp não mudam. Os chips de estado continuam com `role="status"`.

### 2. Linha de lista sem sublinhado

Implemente (b).

### 3. Bloco curto da Semana com o nome

Implemente (c). O `aria-label` de cada bloco é o mesmo da baseline, para qualquer duração.

### 4. Casca que preenche a janela

Implemente (d).

### 5. Provas novas

Dois arquivos novos em `apps/frontend/tests/`, com dublês do `ProductRuntime` no padrão dos testes dos Goals 074 e 084:

`apps/frontend/tests/goal085-shell-states.test.tsx`:

1. A tabela de (a), linha a linha: cada combinação de apresentação da IA (`active`, `pending`, `off`, `unknown`, `loading`) com a do WhatsApp (`active`, `off`, `unknown`, `loading`) dá o texto e o tom esperados. "IA sem conexão" aparece **só** em IA `active` com WhatsApp `off`.
2. Com `ai.state: "ACTIVE"` e o WhatsApp `DISCONNECTED`, a casca mostra "IA sem conexão" na sidebar e nunca "IA ativa", e o banner "Atendimento automático parado" aparece uma vez. Na Home, os pontos de estado dizem "IA sem conexão". Com o WhatsApp `CONNECTED`, os dois dizem "IA ativa".
3. `WeekView` com uma entrada de atendimento de 30 min e outra de 60 min: o nome da cliente aparece no texto visível do bloco, antes de qualquer outro texto que não seja o horário, e o rótulo de tipo não está no texto visível. Uma entrada de 90 min mantém o rótulo de tipo visível. O `aria-label` das três é igual ao que a fórmula da baseline produz. Um bloqueio de 30 min mostra o título.

`apps/frontend/tests/goal085-shell-css.test.ts`, guarda sobre a folha de estilo, lendo `src/shared/styles/atendly.css` e, se tocado, `src/app/globals.css`:

4. Toda declaração de altura (`height`, `min-height`, `max-height`) dentro de qualquer regra cujo seletor contenha `.app-frame` ou `.sidebar`, inclusive dentro de `@media`, não usa `vh`, `dvh`, `svh` nem `lvh`.
5. A regra que estiliza `.list-item` como link declara `text-decoration: none` (ou `text-decoration-line: none`).
6. A guarda da prova 4 lê o arquivo de verdade: o teste falha se o arquivo não tiver nenhuma regra com `.app-frame` ou `.sidebar`, para não passar por arquivo vazio ou caminho errado.

As provas 1 a 5 **reprovam na baseline**; a 6 é guarda da própria prova. O relatório cola a saída dos dois arquivos novos rodados contra os arquivos de produção da baseline, com a restauração conferida por hash.

**Medidas novas no gate autenticado**, em `e2e/authenticated-matrix.spec.ts`, como testes novos, sem mudar teste existente, `playwright.*.config.ts`, rota, semente nem `scripts/`:

- **G-1 (R-10):** em `/servicos` e `/clientes`, nas larguras do gate a partir de 768 px, `aside.sidebar` tem topo 0 e fundo igual a `window.innerHeight` (tolerância de 1 px) depois de carregar, depois de `page.setViewportSize` com altura maior sem recarregar, e depois de rolar o conteúdo até o fim. Passa na baseline, pelo limite (e); é regressão.
- **G-2 (R-08):** em `/clientes`, na linha da cliente semeada, o link e todo descendente dele têm `text-decoration-line` computado igual a `none`, em 390 e 1440. Reprova na baseline.
- **G-3 (R-09):** em `/agenda`, na Semana da data semeada, a partir da largura em que a Semana aparece, o elemento com o nome da cliente semeada no bloco do atendimento de 30 min tem a caixa inteira dentro da caixa do bloco. Reprova na baseline.

O relatório cola a saída do gate autenticado com G-2 e G-3 vermelhos contra os arquivos de produção da baseline, ou declara, com o motivo, que essa execução não foi possível e que o vermelho de R-08 e R-09 está nas provas 3 e 5.

### 6. Testes existentes

Continuam passando. Só muda asserção que dependa de "IA ativa" com o WhatsApp desconectado, da ordem do texto num bloco curto da Semana, ou da altura da casca. O relatório lista cada asserção mudada e o motivo. Nenhum teste é removido nem pulado.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. A função de (a) passa a ignorar o WhatsApp: as provas 1 e 2 reprovam.
2. A sidebar volta a usar `StatusLine` com `status.aiView` direto, sem a função de (a): a prova 2 reprova.
3. O limite de 75 min vira 0 (nenhum bloco é compacto): a prova 3 reprova.
4. `text-decoration: none` sai da regra de `.list-item`: a prova 5 reprova.
5. `.sidebar` volta a ter `height: 100dvh`: a prova 4 reprova.

### 8. O que só uma pessoa confere

- No navegador em que Felipe viu R-10, com zoom e com a janela redimensionada: a sidebar e o conteúdo vão até o fim da janela em Serviços, Clientes, Configurações e Agenda.
- A Semana com a base importada: nome legível em bloco de 30 min e de 1 h, e a aparência fiel à Semana do protótipo.
- A sidebar e a Home com o WhatsApp desconectado de verdade, e a palavra "IA sem conexão" natural ao lado do banner.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 9. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-101** em `PROPOSED`, no formato de D-090 a D-100. Ela diz (a) a (e), com o motivo de cada um, as divergências frente ao protótipo que ficam (o estado por linha em Conversas) e o limite declarado de R-10. O "Revisar se" inclui: o produto passar a ter estado de IA próprio para "sem WhatsApp" em `/v1/status`; a conferência do §8 mostrar o defeito de R-10 de pé; e a pessoa precisar do tipo visível no bloco curto.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§62**, sem reescrever §4 a §61. Ela registra R-06, R-08, R-09 e R-10 como corrigidos por este Goal, R-10 com o limite (e), e dá o veredito **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem contar os achados da revisão local, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, as medidas G-1 a G-3 e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md` **não** muda. O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§61 e as decisões aceitas. **O texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada. Todo nome de rota, arquivo, função, classe ou teste citado nos documentos do §9 é conferido contra o código antes da entrega.

**Ordem obrigatória, a mesma dos Goals 065 a 084:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os cinco controles do §7.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos, e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz o que foi feito no código, o que foi feito na evidência e o que ficou faltando.

### 10. O que este Goal não pode fazer

- Toca só os arquivos de "Pontos de implementação", os testes de `apps/frontend/tests/` e os documentos do §9. Não toca `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `scripts/`, `tools/ia-loop/`, o vault, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Em `apps/frontend/e2e/`, só acrescenta: nenhum teste existente muda, nenhuma medida existente é afrouxada, nenhuma rota sai de `routes.ts`.
- Nenhuma rota de API, migration, campo de contrato ou opção nova em allowlist.
- **Falha de gate por ambiente** é reexecutada ou reportada, e nunca corrigida editando configuração. Isso vale para memória, contenção, porta, rede, a tela "Verificando seu acesso" ou "the session marker is missing" que some na retentativa (rodada 3 do review073, rodada 2 do review077, observação 1 do review072, observação 4 do review079, observação 1 do review080, as duas execuções com 1 `flaky` do review082).
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `playwright.authenticated.config.ts` ou `next.config.ts`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Com a IA ativa e o WhatsApp desconectado, a sidebar e a Home dizem "IA sem conexão", e nunca "IA ativa"; nas outras combinações, nada muda. Provado pelas provas 1 e 2.
2. A linha de Clientes não é sublinhada. Provado pela prova 5 e por G-2.
3. O bloco de atendimento com menos de 75 min mostra o nome da cliente dentro do bloco; o nome acessível não muda; o bloco de 75 min ou mais não muda. Provado pela prova 3 e por G-3.
4. A casca e a sidebar não usam unidade de viewport, e a sidebar vai do topo ao fim da janela, inclusive depois de a janela crescer. Provado pela prova 4 e por G-1, com o limite (e).
5. A largura, o toque, o contraste, o foco e `prefers-reduced-motion` das telas tocadas são decididos pelo gate renderizado (`validate:ui` e o gate autenticado dentro de `validate:integration`, com **175** testes da baseline mais G-1 a G-3, e **0** retentativas). A fidelidade ao protótipo e o comportamento no navegador de Felipe ficam no §8.
6. Os cinco controles negativos do §7 reprovam com o defeito e passam sem ele. Eles rodam depois da última edição de código, com a saída colada.
7. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline (referências: `test:frontend` **128**/**1337**, `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam.
8. D-101 está em `PROPOSED`. FINAL_AUDIT §62 dá o veredito **0/7/5**. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §8 não foi feita.
9. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:**

- que R-10 sumiu no navegador de Felipe: o defeito não reproduz no Chromium, e só o §8 decide;
- a fidelidade visual da Semana e da casca ao protótipo, que é conferência humana;
- o estado por linha em Conversas com o WhatsApp desconectado, fora do escopo;
- a importação real da Minha Agenda e o teste real com o número da plataforma (A-08).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; ponto de estado da IA (§1); provas 1 e 2 em `goal085-shell-states` com o vermelho da baseline; asserções existentes ajustadas (§6) |
| WU-02 | STANDARD | WU-01 | Linha de lista sem sublinhado (§2) e casca sem unidade de viewport (§4); `goal085-shell-css` (provas 4 a 6) com o vermelho da baseline |
| WU-03 | STANDARD | WU-01 | Bloco curto da Semana (§3); prova 3 em `goal085-shell-states` com o vermelho da baseline |
| WU-04 | STANDARD | WU-02, WU-03 | Medidas G-1 a G-3 no gate autenticado, só por acréscimo |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-04 | lint de `apps/frontend` |
| WU-07 | DETERMINISTIC | WU-04 | testes dirigidos: `goal085-shell-states` |
| WU-08 | DETERMINISTIC | WU-04 | testes dirigidos: `goal085-shell-css` |
| WU-09 | DETERMINISTIC | WU-05…WU-08 | validate-core |
| WU-10 | DETERMINISTIC | WU-09 | gate-tests |
| WU-11 | DETERMINISTIC | WU-09 | validate-ui |
| WU-12 | DETERMINISTIC | WU-09 | validate-integration |
| WU-13 | STANDARD | WU-10, WU-11, WU-12 | Controles negativos (§7) e documentação (§9), depois da execução final |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular. WU-02 e WU-03 não tocam os mesmos arquivos de produção e podem correr em paralelo depois da WU-01: a WU-02 escreve só em `goal085-shell-css`, e a WU-03 acrescenta a prova 3 a `goal085-shell-states`. A WU-01 vem antes porque reconta a baseline e cria `goal085-shell-states`.
