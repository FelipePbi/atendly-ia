# Goal 057 — A confirmação é da agenda: a IA não afirma o que não gravou

**Status: ACCEPTED** no [review057](../reviews/057-review.md), rodada 5 de 5 (rodadas 1 a 4 `CHANGES_REQUIRED` com 4, 4, 2 e 2 blockers). Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal056 ACCEPTED](../reviews/056-review.md), a integração do seu commit de fechamento e a [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md). Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 057 nasce na [v78 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção do usuário depois do 056, e fica READY na v79, que também tira **CV-03** deste Goal e o passa ao 058.

## Baseline aceita

Baseline aceita: `1792e1234fff305d91487e8f249d9d1dce0ed807`

Goal anterior: 056 — A prosa sai do fork de transporte: o serviço Go deixa de compor o rótulo `"Ver Menu"` (A-24)

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal056 já integrado em `main` (origem `c4beceb61fd783047ea67b026c99b369e2b2040d`). **Cinco rodadas**, com 4, 4, 3, 1 e 0 blockers. **D-072** foi aceita e [FINAL_AUDIT §33](../FINAL_AUDIT.md) escrita sem reescrever §4 a §32. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. O commit `fdfa1fa`, posterior, é só documental (QA_LOCAL_REVIEW, MASTER_PLAN v78, U-06 a U-11) e não muda código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

**Nomes.** Os IDs deste Goal vêm do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e levam o prefixo `QA` porque o FINAL_AUDIT usa A-01…A-24 com outro significado. Em código, teste e documento permanente, escreva **QA A-01** e **QA H-09**, nunca A-01 sozinho.

**QA A-01 — a IA afirmou um agendamento que não existe.** Com WhatsApp e modelo reais, a conversa foi: `list_services` → `get_availability` → `list_customer_candidates` → `create_appointment` `action=prepare` (hold criado); a cliente escreveu "Confirmo"; **nesse turno nenhuma tool foi chamada** e a resposta enviada foi "Pronto, ficou confirmado para segunda às 10h…". Depois: `Appointment` = 0, `Customer` = 0, um `AppointmentHold` vencido. A única barreira é uma frase de prompt (`apps/ai-orchestrator/src/modules/prompts/scheduling.ts:17`). O `AGENTS.md` diz "nunca confirma uma ação antes de concluí-la" e "nunca invente […] confirmação". É o achado mais grave da revisão, porque o dano chega à cliente do negócio e ninguém percebe.

**QA H-09 — a Home conta reserva como agendamento.** `GET /internal/dashboard` (`apps/ai-orchestrator/src/modules/internal/routes.ts:1126`–`:1133`) conta todo `aiToolCall` `create_appointment` `SUCCEEDED` do dia, e a mesma tool serve ao `prepare` (só cria o hold) e ao `confirm`. Na revisão, a Home mostrou **1** agendamento feito pela IA quando a IA não tinha criado nenhum.

**U-06 — decisão do usuário sobre a condução** ([DECISIONS](../DECISIONS.md), U-06): (1) nada de perguntas desnecessárias — se a cliente já disse "pode marcar" e a pessoa está clara, não perguntar de novo para quem é nem pedir 2–3 confirmações; o protótipo K1 tem **uma** pergunta, "Posso confirmar?"; (2) **nunca** travessão nas respostas da IA; (3) ao concluir um agendamento, mensagem de encerramento no estilo "te vejo quarta-feira, obrigada, tenha um ótimo dia".

### O que a baseline já mostra, conferido nesta passada

- **Todo texto de modelo que vira mensagem passa por um ponto só.** `handleIncomingText` delega a `handleBufferedText`, o nó `composeResponse` de `message-graph.ts` chama `completeGraphTurn`, e `completeGraphTurn` (`assistant.service.ts:710`) faz `parseAiDecision` → `applyDecision` → `composeReplyText` (`:1699`) → `prisma.message.create`. É ali, antes de `composeReplyText` e antes de a `Message` existir, que o guard entra.
- **Já existe precedente de evidência pelo ledger, não pelo JSON do modelo.** `loadTurnAppointmentEvidence` (`assistant.service.ts:1329`) lê as `aiToolCall` `SUCCEEDED` do `AiRun` do turno e só aceita `create_appointment` com `arguments.action === "confirm"` ou `confirm_recurring_appointments` como agendamento confirmado. O comentário em `:1275`–`:1278` já diz por quê: o modelo pode escrever `status: "confirmed"` num rascunho que ninguém marcou.
- **O rascunho pendente é estado persistido, não inferência.** `PendingAction` (`assistant-tools.ts:87`) tem os tipos `schedule`, `cancel`, `reschedule` e `recurring`; o `prepare` grava o rascunho em `Conversation.state.pendingAction`, e o `confirm` bem-sucedido o consome (`clearPendingAction`, `:1655`). Hold vencido no `confirm` volta como falha de domínio (`holdExpiredAlternatives`) e o rascunho permanece, sem `holdId`.
- **Travessão chega ao modelo pelo próprio prompt.** `prompts/system.ts:61` (texto enviado ao modelo) e `prompts/summary.ts:100` (lista de agendamentos montada para o prompt) usam `—`. Comentários de código com `—` não chegam ao modelo e ficam fora do escopo.
- **Contagens que o diff pode mexer sem querer.** `assistant.service.test.ts:6217` e `:11901` afirmam **205** arquivos `.ts` varridos (118 em `apps/ai-orchestrator/src`, 87 em `apps/bff/src`); um arquivo novo em `src/` muda esse número. O teste de fechamento de `PRODUCT_OWN_TEXTS` (`assistant.service.test.ts:1170`–`:1207`) conta a baseline de textos fixos.

### O que este Goal não é

- Não é o **CV-03** (eventos "Horário reservado até…" e "Agendamento criado · Ver" no chat). Ele passou ao 058 na v79.
- Não é prova de aderência do modelo real ao prompt. Pela **D-050**, o que um eval com dublê roteirizado prova é o que o **runtime** deixa acontecer. A garantia deste Goal é de código: a resposta que afirma efeito não gravado não sai. As regras de condução da U-06 (1) e (3) são orientação de prompt e ficam declaradas como tal.
- Não é reescrita do fluxo `prepare`/`confirm`, das tools ou do Scheduling.

## Dependências e contexto mínimo

Leia só o necessário: `AGENTS.md` (seção da IA), U-06 em [DECISIONS](../DECISIONS.md), a seção 4b e as linhas A-01 e H-09 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), D-050 em [DECISIONS](../DECISIONS.md), e no vault apenas `docs/product-vault/01-Regras/03-IA-e-Conversas.md` e `docs/product-vault/02-Fluxos/03-Fluxos-de-Agendamento.md`. `tests/evals/harness.ts` explica o que um eval pode e não pode afirmar.

## Pontos de implementação

- `apps/ai-orchestrator/src/modules/assistant/assistant.service.ts` — `completeGraphTurn`, `composeReplyText`, `PRODUCT_OWN_FIXED_TEXTS`, `loadTurnAppointmentEvidence`.
- `apps/ai-orchestrator/src/modules/prompts/scheduling.ts`, `prompts/system.ts` (`PROMPT_TEMPLATE_VERSION`), `prompts/summary.ts`.
- `apps/ai-orchestrator/src/modules/internal/routes.ts` — `/internal/dashboard`.
- Testes: `tests/assistant/`, `tests/evals/`, `tests/internal/`, `tests/prompts/system.test.ts`.
- Vault: as duas notas citadas acima.

## Escopo obrigatório

### 1. Nenhuma resposta afirma efeito que o turno não gravou

Em `completeGraphTurn`, antes de compor e persistir a mensagem, um guard determinístico decide se o texto do modelo pode sair. **Violação** é a conjunção:

1. o texto que vai à cliente contém **afirmação de efeito** de um tipo K — `schedule` (agendado, marcado, confirmado, "ficou confirmado", "tá marcado"…), `reschedule` (remarcado…), `cancel` (cancelado, desmarcado…); `recurring` usa o vocabulário de `schedule`;
2. **existe rascunho `pendingAction` do tipo K não consumido** no estado da conversa ao fim do turno;
3. **nenhuma `aiToolCall` `SUCCEEDED` deste `AiRun`** confirmou o efeito K (`create_appointment` `action=confirm` ou `confirm_recurring_appointments` para `schedule`/`recurring`; `reschedule_appointment` `action=confirm`; `cancel_appointment` `action=confirm`). A evidência sai do ledger, como em `loadTurnAppointmentEvidence`, nunca do JSON da decisão; estender essa função (ou uma irmã no mesmo arquivo) é o caminho esperado.

O vocabulário de afirmação é um **conjunto fechado, exportado e testado**, por tipo, aplicado sobre texto normalizado: minúsculas, sem acento e com letra repetida colapsada (o vault permite "confirmadoo", `03-IA-e-Conversas.md:58`). **Não são afirmação**, e cada um tem teste: "reservado", "pré-agendado"/"pre agendado", "posso confirmar?", "quer que eu confirme?", "vou confirmar" e negação imediata ("ainda não está confirmado", "não ficou marcado"), com janela de negação curta, fixa e escrita no código. Falso positivo é **fail-closed** — a resposta vira o texto fixo do §2 — e cada forma conhecida de falso positivo que sobrar fica registrada em D-073 como limite.

**Fora do guard, declarado:** afirmação sem nenhum rascunho pendente (por exemplo, "seu horário de quinta está confirmado" sobre agendamento antigo) não é violação — o guard não tem como distingui-la de fato verdadeiro sem ler a agenda, e isso fica em D-073 como limite, junto com a observação de que o caso real da revisão cai dentro do guard.

### 2. O que sai no lugar

Na violação, a mensagem persistida e enviada é um **texto fixo novo** do produto, que entra em `PRODUCT_OWN_FIXED_TEXTS` e, por consequência, em `PRODUCT_OWN_TEXTS`: `"Ainda nao ficou registrado na agenda. Posso confirmar agora pra voce?"`. Ele segue a grafia dos textos fixos atuais (sem acento), não afirma efeito, não tem travessão e não pode casar com `VOCABULARIO_DE_ESPERA`; se casar, ajuste mínimo da redação, registrado no relatório. O teste de fechamento de `PRODUCT_OWN_TEXTS` ganha exatamente essa entrada na baseline de textos fixos.

Além do texto: log estruturado de nível `warn` com `requestId`, `tenantId`, `conversationId`, `aiRunId`, o tipo K e o tipo do rascunho — **sem o texto da cliente nem o do modelo** no log. `AiRun.outputText` continua guardando a saída original do modelo para auditoria. O turno não vira handoff por causa do guard e não há segunda chamada ao modelo: reinvocar o modelo com instrução corretiva foi considerado e fica fora deste Goal (entra em "Revisar se" de D-073).

### 3. Travessão nunca sai (U-06, item 2)

- Normalização determinística no texto do modelo, no mesmo ponto do §1 e antes dele: `—` (U+2014) sempre, e `–` (U+2013) entre espaços, viram pontuação comum (vírgula ou ponto, regra escrita no código e testada). Faixa numérica sem espaço (`10–11`) não é tocada.
- Nenhum texto de `PRODUCT_OWN_TEXTS` contém U+2014 — teste.
- Os textos que **chegam ao modelo** deixam de ter travessão: `prompts/system.ts:61` e `prompts/summary.ts:100`, e qualquer outro literal de prompt que a execução encontrar; comentários de código ficam.

### 4. Prompt da condução (U-06, itens 1 e 3)

`prompts/scheduling.ts` ganha, sem apagar as regras atuais: no máximo **uma** pergunta de confirmação por operação; não perguntar para quem é quando a pessoa já está clara; quando a cliente confirma ("sim", "confirmo", "pode"), chamar `action=confirm` **no mesmo turno** antes de responder; e, depois de agendamento confirmado pela tool, mensagem curta de encerramento. `MAIN_RULES`/`system.ts` ganha a regra de nunca usar travessão. `PROMPT_TEMPLATE_VERSION` sobe de `v6` para `v7`, e os hashes de `tests/prompts/system.test.ts` são atualizados **pela execução**, com o motivo no teste, como nos bumps anteriores.

### 5. A métrica conta agendamento, não reserva (QA H-09)

`aiAppointmentsToday` em `/internal/dashboard` passa a contar só agendamentos **criados** pela IA no dia: `create_appointment` `SUCCEEDED` com `arguments.action === "confirm"` conta 1, e `confirm_recurring_appointments` `SUCCEEDED` conta o número de agendamentos do resultado. `prepare`, falha, hold vencido, remarcação e cancelamento não contam. O nome, o tipo e o schema do campo não mudam, então o BFF (`apps/bff/src/clients/ai-orchestrator/index.ts:505`) e a Home não são tocados. Teste de rota novo em `tests/internal/` com os casos acima, inclusive o da revisão (um `prepare` sem `confirm` dá **0**).

### 6. Provas por eval e por teste

- **Teste do guard** (arquivo novo em `tests/assistant/`, nome contendo `commitment-claim`): vocabulário por tipo, normalização, cada não-afirmação do §1, negação, e as três condições da violação isoladas (sem rascunho → sai; com rascunho e `confirm` bem-sucedido → sai; com rascunho e sem `confirm` → texto fixo).
- **Eval que reproduz a revisão** (arquivo novo em `tests/evals/`, nome contendo `commitment-claim`), no harness existente: turno 1 com `prepare` e pedido de confirmação; turno 2 com "Confirmo" e o dublê respondendo "Pronto, ficou confirmado…" **sem tool** — a `Message` persistida é o texto fixo do §2, nenhum `Appointment` chegou ao gateway, o log de `warn` existe. Casos irmãos: dublê chamando `confirm` e afirmando (sai como escrito, sem travessão); hold vencido no `confirm` com afirmação (texto fixo); remarcação e cancelamento com afirmação sem `confirm` (texto fixo); travessão no texto do dublê (sai normalizado).
- **Nenhum teste existente é removido nem pulado.** Se uma asserção existente sobre texto enviado mudar por causa da normalização do §3 ou do guard do §1 (por exemplo, um roteiro de eval que usa `—`), a mudança é a mínima, com o motivo no teste e listada no relatório.

### 7. Controles negativos, rodados depois da última edição de código

Cada controle é aplicado numa cópia ou revertido no mesmo passo, e a saída real é **colada** no relatório — observação 4 do [review056](../reviews/056-review.md): oito dos doze blockers do 056 foram evidência escrita antes da última edição.

1. Guard desligado (a checagem devolve "pode sair" sempre): o eval da revisão e os testes de violação do §6 reprovam.
2. Evidência lida do JSON da decisão em vez do ledger (`appointmentDraftPatch.status === "confirmed"` conta como `confirm`): pelo menos um caso reprova.
3. Métrica antiga restaurada em `/internal/dashboard`: o teste de rota do §5 reprova no caso `prepare` sem `confirm`.
4. Normalização de travessão removida: o caso de travessão reprova.

### 8. Documentação

No mesmo diff, por **acréscimo**:

- Vault: `01-Regras/03-IA-e-Conversas.md` passa a dizer que a IA só afirma agendamento, remarcação ou cancelamento depois de gravado, e registra as três regras da U-06; `02-Fluxos/03-Fluxos-de-Agendamento.md` registra uma pergunta de confirmação e a mensagem de encerramento. Sem reescrever regra vigente; se algo for substituído, `04-Referencia/02-Decisoes-Substituidas.md` diz o quê.
- [DECISIONS](../DECISIONS.md) ganha **D-073** em `PROPOSED`, no formato de D-054 a D-072: afirmação de efeito é verificada contra rascunho pendente e ledger do turno; texto fixo em vez de reinvocação; travessão normalizado em código; métrica pelo ledger com `action`; limites (afirmação sem rascunho, falso positivo fail-closed, aderência do modelo real fora de prova por D-050). D-050 não é reescrita; D-073 diz o que acrescenta a ela.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§34**, sem reescrever §4 a §33: **QA A-01** e **QA H-09** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24; o veredito da auditoria segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o guard, o texto fixo novo, a métrica e os testes novos com as contagens da execução.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) não é editado: é o registro da revisão como ela foi.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

### 9. O que este Goal não pode fazer

- Não cria arquivo novo em `apps/ai-orchestrator/src/` nem em `apps/bff/src/`; a contagem de **205** arquivos varridos não muda. Arquivos novos só em `apps/ai-orchestrator/tests/`.
- Não toca `apps/bff/`, `apps/frontend/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, migrations, `tools/ia-loop/`, `apps/bff/PUBLIC_API_V1.md` nem `QA_LOCAL_REVIEW.md`.
- Não muda nome, assinatura, schema ou semântica de tool; não muda o fluxo `prepare`/`confirm`; não mexe em `http-egress-sites.ts` nem em `product-transport-routes.txt`.
- Não afrouxa guard existente: nenhum conjunto esperado de `assistant.service.test.ts` ganha entrada por edição de expectativa; se um conjunto computado mudar por causa do texto fixo novo, o número vem da execução e o motivo vai para o relatório e para CURRENT_STATE.
- Não remove teste nem encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. O eval que reproduz a revisão passa: com rascunho `schedule` pendente e "Confirmo" respondido sem tool, a `Message` persistida é o texto fixo do §2 e nenhum `Appointment` foi criado — provado por execução.
2. Com `confirm` bem-sucedido no mesmo `AiRun`, a afirmação sai como o modelo escreveu (menos travessão) — provado por execução.
3. Remarcação, cancelamento e hold vencido seguem a mesma regra — provado por execução.
4. O vocabulário é conjunto fechado e exportado; cada não-afirmação do §1 tem teste e não dispara o guard — provado por execução.
5. A evidência de efeito vem de `aiToolCall` do `AiRun`, nunca do JSON da decisão — provado por diff e pelo controle 2.
6. O texto fixo novo está em `PRODUCT_OWN_TEXTS`, a baseline do teste de fechamento ganhou só ele, e ele não casa com `VOCABULARIO_DE_ESPERA` — provado por execução.
7. Nenhuma mensagem de IA persistida contém U+2014; nenhum literal de prompt enviado ao modelo contém U+2014 — provado por execução.
8. `prompts/scheduling.ts` e `MAIN_RULES` têm as regras da U-06; `PROMPT_TEMPLATE_VERSION` é `v7`; os hashes de `system.test.ts` vêm da execução — provado por diff e execução.
9. `aiAppointmentsToday` dá **0** para `prepare` sem `confirm`, **1** por `confirm` de `create_appointment` e N para série confirmada de N — provado pelo teste de rota.
10. Os quatro controles negativos do §7 reprovam com a mudança e passam sem ela, com a saída colada, rodados depois da última edição de código — provado por execução.
11. `scannedFilePathsForInstantiation` continua **205**; nenhum arquivo novo em `src/` — provado por execução e `git status`.
12. Suíte de `apps/ai-orchestrator` sem teste a menos que a baseline e `npm run validate:core` verde; `npm run test:gate` passa sem teste a menos que a baseline (**226**) — provado por execução.
13. Vault atualizado nas duas notas; D-073 em `PROPOSED`; FINAL_AUDIT §34; CURRENT_STATE e VALIDATION_GATE com as contagens da execução — provado por diff contra a execução.
14. `git status --porcelain=v1 -uall` lista só os arquivos declarados; nenhum resto de controle negativo — provado por execução.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | COMPLEX | — | Guard do §1, texto fixo do §2, teste do guard (§6, primeiro item) |
| WU-02 | STANDARD | WU-01 | Normalização de travessão (§3) e prompt da U-06 com `v7` (§4) |
| WU-03 | STANDARD | — | Métrica do §5 com teste de rota |
| WU-04 | STANDARD | WU-01, WU-02 | Eval que reproduz a revisão e casos irmãos (§6) |
| WU-05 | STANDARD | WU-03, WU-04 | Controles negativos do §7 e documentação do §8 |
| WU-06…WU-11 | DETERMINISTIC | WU-05 | typecheck, lint, testes dirigidos (`commitment-claim`), unit-tests, gate-tests, validate-core, git-diff-check |

Não há unidade `validate-ui`: `apps/frontend/` não é tocado.
