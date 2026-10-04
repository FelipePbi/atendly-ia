# Goal 083 — Novo agendamento conforme o protótipo

**Status: ACCEPTED.** Preparado em 2026-09-30 pelo Tech Lead Agent após [Goal081 ACCEPTED](../reviews/081-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v103, por instrução do usuário (Felipe Borges), a partir do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080); READY na v105, com o mesmo ID e o mesmo título. **Passa à frente do 082**, que fica PLANNED à espera de uma pessoa (motivo na v105 do MASTER_PLAN). O escopo foi precisado nesta passada por evidência conferida no código.

## Baseline aceita

Baseline aceita: `1658cf2828b6ac1dbbf5c9ee902870ad76c561ce`

Goal anterior: 081 — O onboarding não trava em "Local próprio" e o teste real diz quando está indisponível

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal081 já integrado em `main` (origem `8b86fd6693bfe2dc6f63298f79812e4b5e67a679`). A virada de status do documento do Goal081 para `ACCEPTED` entrou no próprio commit de fechamento. **Uma rodada**, sem blocker. **D-097** foi aceita e [FINAL_AUDIT §58](../FINAL_AUDIT.md) escrita sem reescrever §4 a §57. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review081](../reviews/081-review.md) e de FINAL_AUDIT §58: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **123** arquivos e **1268** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **170** testes e **0** retentativas. `test:bff-integration` **62** arquivos e **471** testes.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline `1658cf2` e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Esse é o piso usado para comparar a execução final; se divergir dos números acima, o relatório diz por quê. Na recontagem do 081, `test:gate` só passou depois de `npx prisma generate` no ai-orchestrator: é pré-condição do harness, não efeito do diff.

## Objetivo e posição

Fechar **R-11 (ALTA)** do re-teste local, relatado por Felipe: `/agenda/novo` está muito longe do protótipo **A6** (`Agenda-Desktop`, `Agenda-Tablet` e `Agenda` em `docs/design-reference/claude-design/prototype/project/`), com campos em estilo nativo do navegador, cabeçalho desalinhado e a faixa "Agenda Avenly é a fonte oficial · Operacional" que o AG-10 tirou da Agenda. E garantir que nenhum campo de texto, seleção ou área de texto da área logada fique com o estilo nativo do navegador.

**Por que o 083 passa à frente do 082.** O 082 aplica U-12: obter, a partir de e-mail e senha, o acesso que o portal da Minha Agenda obtém. O mapa histórico do portal (`apps/api/docs/MINHAAGENDA_ENDPOINTS.md` no commit `1e22dff`, citado nos limites de [D-077](../DECISIONS.md)) diz que o login do portal usa `grant_type=password` com `Authorization: Basic` e o segredo do próprio app do portal. Obter esse valor em tempo de execução "como o portal faz" é ler o código público de um terceiro para extrair a credencial de cliente do app dele. Nesta passada, a leitura do código público do portal pelo agente foi **negada pela política de permissões do ambiente**. Uma pessoa precisa decidir como isso acontece; nenhum Developer autônomo conduz essa investigação. O 083 não depende do 082 (a dependência na v103 era só de ordem), e é o próximo achado de severidade ALTA fechável pelo repositório sozinho.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **Campos sem classe.** `AppointmentForm.tsx` usa `<input>`, `<select>` e `<textarea>` sem `className`. O design system estiliza só `.input` e `.select` (`shared/styles/avenly.css`, bloco `.field`). Nenhuma regra alcança o controle sem classe, e o navegador desenha borda `inset` e raio 0.
2. **A faixa vem da casca dos fluxos.** `SourceStrip` (`AgendaBoard.tsx`) só é usado por `AppointmentFlowShell.tsx`, que o renderiza em todo fluxo da Agenda: novo, detalhe, bloqueio, bloqueio em série, cancelamento, remarcação, série e exceções. `goal069-agenda-structure.test.tsx` já proíbe "fonte oficial" no quadro da Agenda.
3. **O cabeçalho dos fluxos** é `agenda-flow-header`, com o link "Voltar à agenda", o eyebrow "Agenda", o título e a descrição, empilhados sem alinhamento com a casca.
4. **O contrato já cobre o A6, com uma exceção.** `POST /v1/calendar/appointments` (`apps/bff/src/modules/calendar/routes.ts`) aceita vários `serviceIds`. Aceita também o atendimento manual excepcional sem serviço cadastrado (`serviceIds` vazio, `title` e `durationMinutes`, Goal008). O cliente pode ser `customerId` ou `customerName` com `customerPhone` opcional. `CreateAppointmentInput` (`data/services/BffCalendarService.ts`) já tem esses campos. A exceção é **"Avisar a cliente pelo WhatsApp"**: `notifyCustomer` existe só em remarcar e cancelar, e o vault pede notificar "quando alteração relevante" (`03-UX-UI/04-Especificacao-das-Telas.md`, "Novo/editar agendamento"), não na criação.
5. **A reserva exige serviço.** O hold (`holdBodySchema`) exige ao menos um `serviceIds`, e a disponibilidade é consultada por `serviceIds`. O atendimento sem serviço cadastrado não tem horários sugeridos nem reserva.
6. **O gate autenticado não abre `/agenda/novo`.** `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`) não tem a rota. A conta principal do gate já tem dois serviços, um cliente e disponibilidade todos os dias (`scripts/goal033-authenticated-ui-rehearsal.mjs`). Nenhuma medida do gate olha o estilo do controle.
7. **Testes que guardam o fluxo atual:** `goal016-appointment-create.test.tsx` e `goal016-a11y.test.tsx` clicam em "Revisar e criar" e depois em "Confirmar agendamento"; `goal016-agenda-reachability.test.tsx`, `goal016-shell-invariant.test.tsx`, `goal074-home.test.tsx` e `goal075-customer-profile.test.tsx` chegam à tela.

## Escolhas de desenho desta passada

- **(a) Uma tela, a mesma rota.** `/agenda/novo` continua sendo a rota. Abaixo de 1024 px é tela cheia, com fechar no topo e CTA fixo no rodapé, como `Agenda` e `Agenda-Tablet`. A partir de 1024 px, como no A6 de `Agenda-Desktop`, o formulário fica num painel ao lado da lista do dia escolhido. A lista é só leitura e sai de `readOccupancy`, que já existe em `AppointmentForm.tsx`. Não há diálogo modal por cima do quadro da Agenda, nem mudança de roteamento.
- **(b) Ordem e partes do A6:**
  - Cliente: escolhida com "Trocar"; busca pelos cadastrados; "cadastrar <nome>" no mesmo campo, com telefone opcional.
  - Serviços: chips com duração; a soma aparece como "2 serviços · 1 h 25 · R$ 150", pela regra de `agreementTotal`.
  - "Outro, sem cadastro": título e duração à mão.
  - Data: faixa de dias a partir de hoje, com "…" para escolher outra data.
  - Horário: "Horário · livres para <duração>", os horários de `getAvailability` em chips e "Outro horário".
  - Observação: atrás de "Adicionar observação".
  - CTA: "Criar agendamento · <dia abreviado> <dia>, <hora>".
  - O link "Agendar série" continua, como ação secundária, porque o vault oferece recorrência ao agendar (Goal016, item 6).
- **(c) O CTA cria.** O CTA repete a decisão, como diz o A6, e cria o agendamento com um clique. O diálogo "Criar este agendamento?" sai. A sobreposição continua exigindo decisão explícita com motivo, pelo `ConflictPanel`, sem mudança.
- **(d) "Outro, sem cadastro"** envia `serviceIds: []`, `title` e `durationMinutes`, sem hold, com o horário de "Outro horário". A recusa de conflito leva ao mesmo `ConflictPanel`, com a duração digitada. Os chips de horário sugerido não aparecem nesse caso, e a tela diz por quê em uma linha.
- **(e) "Avisar a cliente pelo WhatsApp" não é renderizado.** Nenhum contrato de criação carrega o aviso, e o vault só pede aviso em alteração. É **divergência declarada** frente ao protótipo, registrada em D-098 como pergunta para uma pessoa. Mostrar o controle sem efeito seria prometer uma mensagem que não sai.
- **(f) A faixa sai da casca de todos os fluxos.** `AppointmentFlowShell` deixa de renderizar `SourceStrip`, e o componente é apagado se ficar sem uso. O cabeçalho da casca passa a ter o "Voltar" como chevron alinhado ao título, sem o eyebrow "Agenda", em todos os fluxos que a usam.
- **(g) Rede de segurança do design system.** Uma regra de especificidade zero, com `:where()` e escopada à casca da área logada, dá aos `input` de texto, `select` e `textarea` sem classe a aparência de `.input` e `.select`. Ficam de fora `checkbox`, `radio`, `range`, `color`, `file` e `hidden`. Qualquer regra com classe continua vencendo. O formulário novo usa as classes e os componentes do design system diretamente, e não depende da rede.
- **(h) A prova do estilo é renderizada.** O gate autenticado passa a reprovar, em toda rota que mede, controle visível com borda nativa. `/agenda/novo` entra em `AUTHENTICATED_ROUTES`.

## Fora do escopo

- O 082 inteiro, e qualquer leitura do portal ou da API da Minha Agenda.
- Aviso ao cliente na criação (e), preço editado à mão no agendamento e edição de agendamento existente.
- R-03, R-04 e R-07 (Goal084); R-06, R-08, R-09 e R-10 (Goal085).
- Redesenho dos outros fluxos da Agenda além da casca comum (f) e da rede (g).
- A busca por CEP de O-15, pendente de decisão humana.

## Dependências e contexto mínimo

- Protótipo: a seção A6 (e A7, conflito, só para conferir que o `ConflictPanel` continua coerente) em `Agenda-Desktop.dc.html`, `Agenda-Tablet.dc.html` e `Agenda.dc.html`. Consulte só essas seções.
- Vault: "Novo/editar agendamento" em `docs/product-vault/03-UX-UI/04-Especificacao-das-Telas.md`.
- Decisões: D-011 (total do acordo reimplementado no frontend), Goal008 (hold, sobreposição com motivo, atendimento manual excepcional), Goal016 (identidade por `customerId`), Goal075 (`customerId` vindo de `/clientes`).

## Pontos de implementação

- `apps/frontend/src/features/agenda/AppointmentForm.tsx`: reescrita da apresentação. Hold, idempotência, conflito, `customerId` de entrada, `managedExternally`, `ReadOnlyState` e a leitura da capacidade `createAppointments` continuam com o mesmo comportamento.
- `apps/frontend/src/features/agenda/AppointmentFlowShell.tsx` e `SourceStrip` em `AgendaBoard.tsx`: (f).
- `apps/frontend/src/features/agenda/SlotPicker.tsx`: pode ganhar apresentação em chips e "Outro horário". O comportamento dos outros consumidores (remarcação, série, bloqueio) não muda, e os testes deles passam sem edição.
- Componentes novos só se servirem ao formulário, em `features/agenda/` ou em `shared/ui/` quando forem genéricos.
- `apps/frontend/src/shared/styles/avenly-agenda.css` e `avenly.css`: (b) e (g).
- `apps/frontend/e2e/routes.ts` (uma rota por acréscimo) e `apps/frontend/e2e/measure.ts` ou `authenticated-matrix.spec.ts` (uma medida por acréscimo): (h).

## Escopo obrigatório

### 1. A tela conforme o A6

Implementar (a) a (e). Textos da tela sem jargão técnico: nada de "fonte oficial", "hold", "slot", "Operacional". Os valores seguem os formatadores que o app já usa. Duração em "1 h 25" ou "45 min"; valor pela regra de `totalLabel`, com "Sob consulta" e "A partir de" como hoje. O CTA fica desabilitado enquanto faltar cliente, serviço ou "Outro" completo, data ou horário, com a razão dita perto do CTA. Toda animação respeita `prefers-reduced-motion`.

### 2. A casca dos fluxos

Implementar (f). Nenhum fluxo da Agenda mostra "fonte oficial" nem "Operacional".

### 3. Nenhum controle nativo na área logada

Implementar (g) e (h). A medida nova do gate considera controle **com borda visível** (`border-top-width` maior que 0 e `border-top-style` diferente de `none`). Ela reprova quando o estilo é `inset` ou `outset`, ou quando o raio é `0px`, e diz a rota, a largura e o seletor do controle. Se a medida reprovar numa rota que não é `/agenda/novo`, a correção é no CSS ou na classe do controle, nunca na medida.

### 4. Testes existentes

Continuam passando. Só muda asserção que depende do diálogo de confirmação removido (c), do texto "Revisar e criar", do eyebrow ou da faixa (f), ou da marcação antiga dos campos. Cada teste afetado é **reescrito** para o fluxo de um clique, não removido. O relatório lista cada asserção mudada e o motivo. Em `goal016-a11y.test.tsx`, a verificação de foco do diálogo removido é trocada por uma do fluxo novo: o nome acessível do CTA traz o dia e a hora, e o erro de criação é anunciado por `role="alert"`. Nenhuma outra verificação de acessibilidade sai.

### 5. Provas novas

Em `apps/frontend/tests/goal083-new-appointment.test.tsx`, com dublês do `ProductRuntime` no padrão dos testes do Goal016:

1. Cliente cadastrado, dois serviços, dia e horário sugerido: a soma aparece como no (b); o hold é pedido com os dois `serviceIds`; o CTA diz o dia e a hora e cria com **um** clique, com `customerId`, `holdId` e os dois serviços.
2. Cliente novo pelo mesmo campo: cria com `customerName` e, quando digitado, `customerPhone`, sem `customerId`.
3. `customerId` vindo de `/clientes` (Goal075) chega escolhido e pode ser trocado.
4. "Outro, sem cadastro": sem título ou duração o CTA fica desabilitado; completo, cria com `serviceIds: []`, `title` e `durationMinutes`, sem hold.
5. Conflito na criação abre o `ConflictPanel`, e sobrepor exige motivo, como antes.
6. Nenhum texto "fonte oficial", "Operacional" nem "Avisar a cliente" na tela, e nenhum `input` de texto, `select` ou `textarea` sem classe do design system dentro do formulário.

As provas 1, 4 e 6 **reprovam na baseline**. O relatório da rodada 1 cola a saída do arquivo novo rodado contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. O CTA volta a abrir um diálogo de confirmação antes de criar: a prova 1 reprova.
2. "Outro, sem cadastro" passa a enviar `holdId` ou um serviço: a prova 4 reprova.
3. `SourceStrip` volta à casca: a prova 6 reprova.
4. A classe do design system sai de um campo do formulário novo: a prova 6 reprova.
5. A medida nova do gate é exercida contra um controle nativo: rode o gate autenticado **só na rota `agenda-novo` e numa largura**, com a regra (g) comentada e a classe tirada de um campo. A medida reprova e nomeia o controle. Restaurado, passa.

### 7. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-098** em `PROPOSED`, no formato de D-090 a D-097. Ela diz: (a) a (h) e o motivo de cada uma. A divergência (e) fica como pergunta para uma pessoa: avisar a cliente na criação muda contrato e produto. "Revisar se" inclui: uma pessoa decidir o aviso na criação; o protótipo passar a exigir diálogo modal no desktop; a rede (g) esconder um controle que deveria ter classe própria.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§59**, sem reescrever §4 a §58. Ela registra R-11 como corrigido por este Goal e dá o veredito **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem contar os achados da revisão local, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, a medida nova do gate e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md` **não** muda. O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§58 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada. Todo nome de rota, arquivo, função, classe ou teste citado nos documentos do §7 é conferido contra o código antes da entrega.

**Ordem obrigatória, a mesma dos Goals 065 a 081:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os cinco controles do §6.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos, e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz o que foi feito no código, na evidência e o que ficou faltando.

### 8. O que só uma pessoa confere

- Fidelidade visual da tela ao A6 nas 5 larguras (360, 390, 768, 1024 e 1440), comparada com `Agenda`, `Agenda-Tablet` e `Agenda-Desktop`. Nenhum teste prova fidelidade.
- Criar pela tela nova, num navegador contra a pilha local, um agendamento com cliente cadastrado e dois serviços e outro com cliente novo.
- A divergência (e): se a criação deve avisar a cliente.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 9. O que este Goal não pode fazer

- Toca só os arquivos de "Pontos de implementação", os testes de `apps/frontend/tests/` e os documentos do §7. Não toca `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `scripts/`, `tools/ia-loop/`, o vault, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma rota de API, migration, campo de contrato ou opção nova em allowlist.
- Em `e2e/`, só **acrescenta**: uma rota em `AUTHENTICATED_ROUTES` e uma medida. Nenhuma medida existente é desligada, afrouxada ou pulada, e nenhuma rota sai.
- **Falha de gate por ambiente** (memória, contenção, porta, rede, a tela "Verificando seu acesso" ou "the session marker is missing" que some na retentativa) é reexecutada ou reportada. Nunca é corrigida editando configuração (rodada 3 do review073, rodada 2 do review077, observação 1 do review072, observação 4 do review079, observação 1 do review080).
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma mudança em `vitest.config.*`, `playwright.config.*` ou `next.config.ts`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A tela cria com cliente cadastrado e dois serviços em um clique, com a soma e o CTA do A6. Provado pela prova 1.
2. Cliente novo no mesmo campo e `customerId` vindo de `/clientes` funcionam. Provado pelas provas 2 e 3.
3. "Outro, sem cadastro" cria sem serviço e sem hold, e não deixa criar incompleto. Provado pela prova 4.
4. Conflito e sobreposição com motivo continuam como antes. Provado pela prova 5 e pelos testes do Goal016.
5. Nenhum fluxo da Agenda mostra a faixa, e a tela não oferece aviso ao cliente. Provado pela prova 6 e por `goal069-agenda-structure.test.tsx`.
6. Nenhum controle visível com borda nativa em nenhuma rota do gate autenticado, `/agenda/novo` incluída, nas 5 larguras. Provado pelo gate autenticado dentro de `validate:integration`, com **175** testes (os **170** da baseline mais os 5 de `agenda-novo`) e **0** retentativas.
7. Largura, toque, contraste, foco e `prefers-reduced-motion` da tela nova são decididos pelo gate renderizado: `validate:ui` e o gate autenticado. A fidelidade ao A6 fica no §8.
8. Os cinco controles negativos do §6 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada.
9. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline (referências: `test:frontend` **123**/**1268**, `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam.
10. D-098 em `PROPOSED`, FINAL_AUDIT §59 com o veredito **0/7/5**, CURRENT_STATE e VALIDATION_GATE escritos depois da execução final e dos controles, com as contagens dela e dizendo que a conferência do §8 não foi feita.
11. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:**

- fidelidade visual ao A6, que é conferência humana;
- que a criação deveria avisar a cliente (divergência (e), decisão de uma pessoa);
- que os fluxos da Agenda fora do gate autenticado (bloqueio, série, remarcação, cancelamento, exceções) não têm controle nativo: a rede (g) os cobre por construção, mas nenhuma medida renderizada os abre;
- a importação real da Minha Agenda (R-02, Goal082, à espera de uma pessoa).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; casca comum (f) e rede (g); medida nova do gate e rota `agenda-novo` (h) (§2, §3) |
| WU-02 | STANDARD | WU-01 | Tela conforme o A6, (a) a (e); testes existentes reescritos (§4); provas novas com o vermelho da baseline (§1, §5) |
| WU-03 | DETERMINISTIC | WU-02 | typecheck de `apps/frontend` |
| WU-04 | DETERMINISTIC | WU-02 | lint de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-02 | testes dirigidos: `goal083` |
| WU-06 | DETERMINISTIC | WU-02 | testes dirigidos: `goal016-appointment-create` |
| WU-07 | DETERMINISTIC | WU-03…WU-06 | validate-core |
| WU-08 | DETERMINISTIC | WU-07 | gate-tests |
| WU-09 | DETERMINISTIC | WU-07 | validate-ui |
| WU-10 | DETERMINISTIC | WU-07 | validate-integration |
| WU-11 | STANDARD | WU-08, WU-09, WU-10 | Controles negativos (§6) e documentação (§7), depois da execução final |
| WU-12 | DETERMINISTIC | WU-11 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular.
