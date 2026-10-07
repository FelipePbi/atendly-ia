# Review formal — Goal 146

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, em review DEEP conforme o [Goal146](../goals/146-a-conversa-continua-de-quem-escreve-quando-o-responsavel-agenda-para-o-dependente.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 1 é histórica: parou antes do review, no pré-review do IA Loop, com 1 blocker, fechado na rodada 2.

`Contact.customerId` passa a ser **quem escreve** pelo número (sempre um candidato do telefone), e `Contact.lastScheduledCustomerId` e `Contact.lastScheduledAt` guardam **a última pessoa agendada**, que pode ser um dependente sem telefone. A migration `20261007120000_goal146_contact_last_scheduled_customer` é aditiva e idempotente, com backfill a partir do vínculo. A confirmação (`create_appointment` e a série de `confirm_recurring_appointments`) grava sempre a última pessoa agendada e põe no vínculo o candidato do telefone ou o responsável do dependente; a falha da leitura dos candidatos depois do efeito não derruba a confirmação. A pessoa provável (`LAST_BOOKED_FOR_DEPENDENT`), a memória inferida e a âncora do resumo leem a última pessoa agendada; a memória do prompt continua no vínculo, que agora é quem escreve. Antes, depois que a Maria agendava o Pedro, o perfil dela perdia "Conversa", o do Pedro abria o WhatsApp dela, o chat dela mostrava o Pedro e o prompt trazia a memória do Pedro. O vínculo velho que aponta para um dependente volta ao responsável na próxima confirmação do número. O Scheduling, o BFF, o contrato público, `PUBLIC_API_V1.md`, o prompt e o `src` do frontend não mudaram. Decisão: [D-160](../DECISIONS.md), aceita neste fechamento. Ela corrige o "o vínculo só serve à pessoa provável" de D-159 e a escolha 5 de D-156, sem editá-las.

## Escopo e identidade do diff

- Baseline aceita vigente: `48d39d02eed84e3e379f1f6ad1fdf761669d5859` (Goal145). Base imediata da implementação: `8be067a21cb080ebfb0b371cd7a529ca1a3aa772`, HEAD da worktree `.ai-worktrees/goal-146`, sem commit na worktree. Entre a baseline e `8be067a` só há o fechamento documental do Goal145, sem código.
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos** (18 rastreados e 4 novos não rastreados), hash do diff `752e1247d6946a72e0517f57e942401fdd8b310dba57157bbf09fa36f6efaf77`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - IA, banco e código (5): `apps/ai-orchestrator/prisma/schema.prisma`, a migration nova, `src/modules/tools/assistant-tools.ts` (`recordScheduledCustomer`, `contactLinkFor`, `lastScheduledCustomerId` e as chamadas na confirmação e na série), `src/modules/memory/customer-memory-service.ts` (`recordTurnInference`) e `src/modules/memory/customer-summary-service.ts` (`startSummaryRun`);
  - ensaio (1): `scripts/goal074-human-takeover-migration-rehearsal.mjs` (`alignAiDurabilityTargetWithGoal146`);
  - testes novos da IA (3): `tests/tools/goal146-contact-of-writer.test.ts` (10), `tests/memory/goal146-memory-of-scheduled.test.ts` (9) e `tests/integration/goal146-contact-last-scheduled.test.ts` (3, com banco);
  - testes da IA ajustados (8): `tests/tools/goal142-guardian-dependents.test.ts`, `goal143-customer-of-number.test.ts` e `goal145-number-appointments.test.ts`; `tests/memory/customer-memory-inference.test.ts` e `fake-memory-prisma.ts`; `tests/evals/harness.ts`; e `tests/integration/customer-memory.test.ts` e `goal109-avenly-human-control-source.test.ts`;
  - teste de outro Goal no frontend (1): `apps/frontend/tests/goal144-perfil-responsavel.test.tsx` (desvio do critério 10, aceito; ver "Desvio aceito");
  - `docs/migration/` (4, por acréscimo): D-160 em `DECISIONS.md`, a §27 de `DATA_MIGRATION.md`, o delta em `CURRENT_STATE.md` e a seção do Goal146 em `VALIDATION_GATE.md`.
- `findCustomerAppointments` (D-159), `prepareCancel`, `prepareReschedule`, `confirmAppointmentPresence`, as conferências de `customerId` de D-157, `loadForPrompt`, a `SessionService`, o teste de ativação, o prompt, as rotas internas da IA (`GET /internal/conversations` e `conversationDto`), `apps/scheduling-service`, `apps/bff`, o `src` de `apps/frontend`, `packages/` (o contrato público), `PUBLIC_API_V1.md`, `targets.json`, `tools/ia-loop/` e o documento do Goal146 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `PRE_REVIEW_INCOMPLETE`, 1 blocker.** WU-01 a WU-04 (código, testes e os controles negativos (a) a (d)) e WU-12 (registros) terminaram `COMPLETED`. Três gates reprovaram na primeira execução e ganharam diagnóstico: a unidade da IA (DIAG-001, falta do client Prisma gerado do BFF na worktree), o `validate:core` (DIAG-002, corrida intermitente no teste do Goal144 do frontend) e o `validate:integration` (DIAG-003, dois testes de integração que semeiam `Contact` sem as colunas novas). As segundas execuções (WU-08-g2, WU-10-g2 e WU-11-g2) passaram. O DIAG-003 editou os arquivos certos, mas o IA Loop o marcou `FAILED`/`UNKNOWN_FATAL` (`ACCEPTANCE_NOT_MET`) e não gravou o resultado. O resultado do Developer ficou `BLOCKED`, e o pré-review barrou o review com `WORK_UNIT_NOT_COMPLETED`.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** Rodada de correção (`CODE_OR_EVIDENCE`). A FIX-001 conferiu que a entrega do DIAG-003 já estava na árvore e terminou `COMPLETED` sem alterar arquivo; o hash do diff rastreado não mudou. Os gates WU-05 a WU-10 e WU-13 rodaram de novo na árvore final, todos com `attemptId` `a1` e o mesmo `codeFingerprint`, `code-v1:3880e753d6f17c25d773c029643676f15a03198b6e031bbb2282c138e91bec53`. O `validate:integration` (WU-11) foi reaproveitado da WU-11-g2 da rodada 1, na mesma árvore. Uma primeira passada do Tech Lead, só sobre o diff, deu §1 a §3 e os critérios 1 a 8 e 11 `COVERED`, o 9 `UNCLEAR` (gates não se conferem pelo diff) e o 10 `NOT_COVERED` (o teste do frontend). A decisão resolveu o 9 com os resultados das WU e aceitou o 10 como desvio.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-160: o status passou a ACCEPTED; o "Fora deste Goal" ganhou a exceção do teste do Goal144, pedida no review (única correção no texto da proposta); a nota de fechamento, com as duas rodadas, a conferência, o desvio aceito, o aceito sem prova completa, as observações não bloqueantes e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal146: o status no título e o parágrafo "Aceite".
3. `DATA_MIGRATION.md`, §27: a referência a D-160 como ACCEPTED neste review.
4. `VALIDATION_GATE.md`, seção do Goal146: o registro do aceite na abertura e as subseções "Rodada 2" (a FIX-001 e os gates da rodada 2) e "Aceite".
5. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal146), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal146), em [DATA_MIGRATION](../DATA_MIGRATION.md) §27 e em D-160.

- **Gates do IA Loop, rodada 2** (`attemptId` `a1` em todos, mesma árvore):
  - typecheck da IA com saída 0 (WU-05) e lint da IA com saída 0 (WU-06);
  - `goal146` com 19 passando e 3 pulados sem banco (WU-07);
  - unidade da IA com 104 arquivos e 1338 testes passando, 17 arquivos e 115 testes pulados (WU-08). A partida é 102 e 1319: +2 arquivos e +19 testes passando, +1 arquivo e +3 testes pulados;
  - `test:gate` 298 (WU-09), igual ao Goal145;
  - `validate:core` com saída 0, 15 de 17 passos e 2 pulados (WU-10);
  - `git diff --check` com saída 0, 97 ms (WU-13);
  - `validate:integration` (WU-11, reaproveitado da WU-11-g2 da rodada 1): saída 0, 36 de 36 passos, inclusive `rehearse:goal028-release-migrations` e `rehearse:goal074-human-takeover-migration`, e o gate autenticado com 310 passed e 0 retentativas, igual ao Goal145.

  O Scheduling não mudou, e o frontend mudou só num teste. As contagens de unidade deles não foram refeitas fora do `validate:core`, e o `validate:ui` não rodou.
- **Do Developer:** a partida da unidade da IA, medida na WU-12 numa cópia de `HEAD` fora do repositório, depois da primeira edição: 102 arquivos e 1319 testes passando, igual à última contagem aceita. A integração `goal146` com banco, 3 de 3, num PostgreSQL descartável (WU-01).
- **Controles negativos do Developer (WU-04, refeitos pela WU-12 numa cópia):** (a) a gravação volta a pôr `customerId` = a pessoa agendada (4 reprovados); (b) `resolveScheduleCustomer` volta a ler o vínculo (2 reprovados); (c) `recordTurnInference` volta a usar `contact.customerId` (3 reprovados); (d) `startSummaryRun` sem a procura por `lastScheduledCustomerId` (1 reprovado). Cada um reprovou o teste que o Goal nomeia e foi revertido com `cmp` igual ao backup. Comando, testes, linhas e mensagens estão em VALIDATION_GATE.
- **Conferência do Tech Lead:**
  - **A migration:** `ADD COLUMN IF NOT EXISTS` para as duas colunas, sem default, e o backfill exatamente igual à escolha 2, com o cabeçalho no padrão do Goal115. `schema.prisma` tem os dois campos anuláveis e os comentários reescritos.
  - **A gravação:** `recordScheduledCustomer` faz um só `updateMany` com o mesmo `where` e grava sempre `lastScheduledCustomerId` e `lastScheduledAt`. O vínculo vem de `contactLinkFor`, que lê `customerCandidates` depois do efeito. O candidato do telefone vira o vínculo; um dependente leva `guardian.id`; fora disso o vínculo não muda. Se a leitura falhar, o `catch` devolve `null` e a confirmação continua com sucesso. O método é chamado depois de `createAppointment` e depois de `confirmAppointmentSeries`, com `seriesCustomerId`; sem pessoa conhecida, nada é gravado.
  - **Os leitores:** `resolveScheduleCustomer` lê `lastScheduledCustomerId` só quando o número tem dependente. `recordTurnInference` usa `lastScheduledCustomerId` e mantém `customer_not_linked`. `loadForPrompt` continua em `customerId`. `startSummaryRun` procura primeiro por `customerId` e, sem resultado, por `lastScheduledCustomerId` (`lastScheduledAt desc`). A inferência roda depois das tools do `AiRun` (`assistant.service.ts:1523`), então lê o campo gravado no mesmo turno.
  - **O que não mudou:** as rotas internas, o BFF, o contrato e o `src` do frontend.
  - **Testes:** `goal146-contact-of-writer` (10) e `goal146-memory-of-scheduled` (9) cobrem todos os casos do §3.1, inclusive o vínculo velho no Pedro, a falha da leitura depois do efeito, a série e a Ana com `CUSTOMER_NOT_LINKED`. A integração `goal146` cobre as colunas no `information_schema`, o backfill reaplicado duas vezes com retrato idêntico e `GET /internal/conversations` pela Maria e pelo Pedro.
  - **Asserções trocadas:** só as da escolha 8 (`goal142`:380 e `goal143`:448). O resto são falsos e semeios ajustados só na forma (`goal142`, `goal145`, `customer-memory-inference`, `fake-memory-prisma`, `evals/harness`, `customer-memory.test` e `goal109`). Nenhum outro `expect` mudou.
  - **O blocker da rodada 1:** o que o DIAG-003 devia entregar está na árvore: o `goal109` aplica a migration do Goal146, `customer-memory.test` semeia as colunas novas e o ensaio `goal074` tem `alignAiDurabilityTargetWithGoal146`. A WU-11-g2, publicada às 19:43, depois do DIAG-003 (19:29), provou essa entrega, e o código não mudou depois.
  - **Gates:** os JSON de `results/work_unit` do IA Loop batem com VALIDATION_GATE, todos com o mesmo `codeFingerprint` e saída 0.
  - **Reexecução no fechamento:** `npx vitest run goal146 goal142 goal143 goal145 customer-memory-inference` em `apps/ai-orchestrator`: 6 arquivos e 89 testes passando, 1 arquivo e 3 testes pulados (a integração `goal146`, sem banco).
  - **Escopo e registros:** os arquivos listados acima. D-160 com número livre, em PROPOSED na rodada, só por acréscimo, sem editar D-156 nem D-159. As contagens (1338, 298 e 310) batem entre VALIDATION_GATE, CURRENT_STATE e os resultados das WU.

## Desvio aceito

**Critério 10 (escopo).** O DIAG-002 editou `apps/frontend/tests/goal144-perfil-responsavel.test.tsx`, um teste de outro Goal que reprovou de forma intermitente o `validate:core` da rodada 1. A edição acrescenta um `waitFor` até o spinner "Carregando memória do cliente" (`CustomerMemory.tsx:225`) sumir, antes da asserção. As asserções de `role` `status` e `alert` continuam. A mudança é só de teste, está declarada em VALIDATION_GATE e segue o precedente do [review130](130-review.md) (desvio feito por DIAG e aceito). Não é motivo de reprovação. D-160 registra a exceção em "Fora deste Goal".

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-04, refeitos pela WU-12 numa cópia fora do repositório). O Tech Lead não os refez.
2. **A partida da unidade da IA** foi medida pelo Developer depois da primeira edição, numa cópia de `HEAD` (`8be067a`, sem código novo sobre `48d39d0`). O Tech Lead não a refez.
3. **A integração `goal146` com banco** só tem a execução da WU-01 e a do `validate:integration`. O Tech Lead a rodou só sem banco (pulada).
4. **Uma conversa real no WhatsApp** com o responsável que agenda para o dependente, e a ação "Conversa" do perfil lida depois de uma confirmação. A IA é provada com o cliente do Scheduling falso e o falso de Prisma da casa.
5. **Um banco com dados reais migrado** e a ordem do deploy entre a IA e o BFF.
6. **A contagem de testes por passo** de `validate:core` e de `validate:integration` não foi retida pelo IA Loop; vale a saída 0 e os passos.

## Pendências não bloqueantes

1. **A lição 2 do Goal** (medir a partida antes de editar) de novo não foi cumprida. O desvio está declarado em VALIDATION_GATE, e o número bate com o Goal145.
2. **Série sem pessoa conhecida:** uma série confirmada sem `customerId` conhecido não grava nada e deixa o `lastScheduledCustomerId` anterior. A memória inferida desse turno vai para essa pessoa. É o que o Goal manda (não gravar sem pessoa) e equivale ao comportamento de antes, com `customerId`.
3. **Falha do `updateMany` depois da série:** agora pode virar erro da tool depois do efeito. É o mesmo risco que já existia em `create_appointment`.
4. **Worktree limpa:** precisa do `npx prisma generate` em `apps/bff` antes da unidade da IA, porque o teste de varredura de árvore (Goal046 e Goal047) conta o client gerado do BFF (DIAG-001).
5. **Lint e formatação de `tests/`:** os erros de lint já existentes em `tests/tools/goal142-guardian-dependents.test.ts` (linhas 12, 867 e 868) continuam. A WU-03 viu `prettier --check` apontar `customer-memory-prompt.test.ts`, `customer-summary-service.test.ts` e `evals/harness.ts`, sem confirmar se o aviso já existia. O `npm run lint` da IA cobre só `src` e passou.
6. **O resultado do DIAG-003 não foi gravado** pelo IA Loop (`UNKNOWN_FATAL`). A entrega dele está no diff e foi exercida pela WU-11-g2.
7. **Fora deste Goal, com Goal e decisão próprios:** o conserto retroativo do vínculo velho que aponta para um dependente, sem nova confirmação; a passada de tela do perfil ("Conversa com <responsável>"); a presença pelo responsável (pergunta 135); a IA propor responsável (D-022 (5)); o tipo de relação (pergunta 141); a conferência de `customerId` nas rotas internas do Scheduling; a série que não reconfere a pessoa na confirmação ([review143](143-review.md)); as pendências não bloqueantes dos reviews [138](138-review.md) a [145](145-review.md); e os 11 quadros ainda sem alvo.
