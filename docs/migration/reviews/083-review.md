# Review formal — Goal 083

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-30, conforme o [Goal083](../goals/083-novo-agendamento-conforme-o-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–081) foi reaberto, reavaliado ou revertido. **Três rodadas**: duas `CHANGES_REQUIRED`, com um blocker cada, e o aceite na terceira.

O Goal fecha **R-11 (ALTA)** do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080). `/agenda/novo` estava longe do protótipo **A6**: tinha campos no estilo nativo do navegador, cabeçalho desalinhado e a faixa "Agenda Avenly é a fonte oficial · Operacional". Agora a tela segue o A6 numa tela só, na mesma rota, e cria com um clique. A faixa sai da casca de todos os fluxos da Agenda. Uma regra de especificidade zero cobre os controles de texto sem classe da área logada. O gate autenticado ganha a medida de borda nativa e a rota `agenda-novo`. O conserto fica todo em `apps/frontend/`, e o contrato de criação não muda. Decisão: [D-098](../DECISIONS.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `1658cf2828b6ac1dbbf5c9ee902870ad76c561ce` (Goal081). Base imediata da implementação: `72ef392ee9d03251f81d197d9dc8f14e92170550`, HEAD da worktree `.ai-worktrees/goal-083`, inalterado nas três rodadas. Entre `1658cf2` e `72ef392` só há `docs/`: o fechamento do Goal081 e a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **18 arquivos**, hash do diff `02de59c7011593d6150d43e5144912f248f92bb6bc7ffa40ef54be8f0b8d0bfe`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **16 arquivos rastreados**, por `git diff --numstat 72ef392` no snapshot aceito:
  - Frontend: `features/agenda/AppointmentForm.tsx` (+316/−176), `features/agenda/AppointmentFlowShell.tsx` (+4/−7), `features/agenda/AgendaBoard.tsx` (−17, `SourceStrip` apagada), `features/agenda/SlotPicker.tsx` (+4/−1, só passa a exportar `holdNotice`), `shared/styles/avenly-agenda.css` (+315/−54) e `shared/styles/avenly.css` (+41, a regra `:where()`).
  - `e2e/`, só acréscimos: `routes.ts` (+8, a rota `agenda-novo`), `measure.ts` (+71, `measureNativeBorderControls`) e `authenticated-matrix.spec.ts` (+15, o passo que chama a medida).
  - Testes existentes reescritos, sem teste removido nem pulado: `goal016-appointment-create.test.tsx` (+21/−22), `goal016-a11y.test.tsx` (+28/−16) e `goal075-customer-profile.test.tsx` (+6/−4). O motivo de cada asserção mudada está em [FINAL_AUDIT §59](../FINAL_AUDIT.md).
  - Documentos do §7: `CURRENT_STATE.md` (+75), `DECISIONS.md` (+37, D-098), `FINAL_AUDIT.md` (+58, §59) e `VALIDATION_GATE.md` (+58).
- **Dois arquivos novos**: `apps/frontend/src/features/agenda/NewAppointmentFields.tsx` (**300** linhas) e `apps/frontend/tests/goal083-new-appointment.test.tsx` (**558** linhas, **11** testes nas seis provas).
- Nenhuma rota de API, migration, campo de contrato ou opção nova em allowlist. `apps/bff/` e `apps/bff/PUBLIC_API_V1.md` ficam na baseline. Nenhuma exceção nova em `KNOWN_*` e nenhum passo a menos em `validate:core` ou `validate:integration`. `vitest.config.*`, `playwright.config.*` e `next.config.ts` não mudaram. Nada foi tocado em `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `scripts/` ou `tools/ia-loop/`. `QA_LOCAL_REVIEW.md`, o vault e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 1 blocker.** O diff atendia quase todo o Goal:
   - (a) uma coluna abaixo de 1024 px e `DayList` ao lado a partir de 1024 px, sem modal;
   - (b) a ordem do A6, com `CustomerField`, chips com a soma por `agreementTotal`/`totalLabel`, `DateStrip`, observação recolhida, CTA com dia e hora e "Agendar série" mantido;
   - (c) criação em um clique, com o `ConflictPanel` e o motivo obrigatório preservados;
   - (e) aviso à cliente não renderizado;
   - (f) `SourceStrip` apagada e "Voltar" em chevron;
   - (g) a regra `:where()` com lista positiva de tipos;
   - (h) medida e rota só por acréscimo.

   O Tech Lead reexecutou oito arquivos de teste afetados (**95**/**95**). **Blocker:** a escolha (d) pede que a tela diga, em uma linha, por que "Outro, sem cadastro" não tem horários sugeridos. A linha não existia, e os documentos a declaravam como limite. Foram pedidos a linha e a afirmação dela na prova 4. Como a edição viria depois dos controles, foram pedidos também a execução final e os cinco controles refeitos, com a prosa reescrita no lugar.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker.** A parte de código do blocker 1 estava certa. Em "Outro, sem cadastro", o bloco do Horário mostra "Sem serviço cadastrado não há horários sugeridos. Digite o horário abaixo.", sem chips, e a prova 4 ganhou o teste que afirma isso. **Blocker:** a parte de evidência não veio. Os cinco controles do §6 não foram refeitos depois da edição. Os quatro documentos ainda citavam o `sha256` antigo de `AppointmentForm.tsx` (`2597c2ba863a`, contra `af2989fa015f`), **10** testes em vez de **11**, `test:frontend` **124**/**1279** e os `startTime` da rodada 1.
3. **Rodada 3 — `ACCEPTED`, 0 blockers.** O FIX-001 não editou código. Ele refez a execução final e os cinco controles sobre a árvore entregue e reescreveu os quatro documentos no lugar. O Tech Lead conferiu:
   - Os `sha256` atuais conferem com os hashes de antes e de restauração citados em §59: `AppointmentForm.tsx` `af2989fa015f`, `NewAppointmentFields.tsx` `d95b9a42fd0f`, `avenly.css` `3b72b0d9c690`, `AppointmentFlowShell.tsx` `78a7652ec070` e `AgendaBoard.tsx` `939dfc1faf8b`. A execução final e os controles da rodada 3 valem para a árvore entregue.
   - Os documentos citam **11** testes, `test:frontend` **124**/**1280** (1268 + 11 + 1), o gate autenticado em **175** e os `startTime` da rodada 3. Não citam mais `2597c2ba863a` nem os horários da rodada 1.
   - Código: o caminho "Outro" envia `serviceIds: []` sem `holdId`, e `chooseTime` não reserva nesse caso. A idempotência por `newIdempotencyKey()` está igual à baseline. O `409` abre o `ConflictPanel`, e sobrepor sem motivo é bloqueado. O erro de criação aparece em `role="alert"`.
   - D-098 está em `PROPOSED`, e §59 dá o veredito **0**/**7**/**5**. Os documentos dizem que a conferência humana do §8 não foi feita e que o vermelho da baseline não foi refeito na rodada 3.
   - `git status --porcelain=v1 -uall` listava só os 18 arquivos autorizados, sem `playwright.control5.config.ts` nem artefato de `e2e-results/`.

## Evidência final aceita

A execução final descrita nos documentos é a do **FIX-001 da rodada 3**, sobre a árvore entregue, sem edição de código na rodada, na ordem do §7, todos exit 0 ([FINAL_AUDIT §59](../FINAL_AUDIT.md)). `validate:integration` e o controle 5 rodaram contra um PostgreSQL descartável em `127.0.0.1:55733/atendly_bff_test`.

- `validate:core` **17** passos (**15** `passed`, **2** `skipped`: `test:bff` e `test:health-worker`).
- `test:gate` **233**/**233**.
- `validate:ui` **169** `passed`, **21** `skipped`, **0** `flaky` (`startTime` `2026-10-01T00:30:21.759Z`).
- `validate:integration` **36**/**36** passos. O gate autenticado teve **175** testes, dos quais **5** são `agenda-novo` (um por largura), com **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime` `2026-10-01T00:38:23.287Z`).
- Suítes lidas dentro do `validate:core` da rodada 3:
  - `test:frontend` **124**/**1280** (baseline **123**/**1268**). São **+11** testes de `goal083-new-appointment.test.tsx` e **+1** líquido em `goal016-a11y.test.tsx`, que trocou um teste por dois.
  - `test:ai-orchestrator` **1186** passando e **98** `skipped` de **1284**, sem mudança.
  - `test:scheduling-service` **37**/**502**, sem mudança.
  - `test:bff-integration` roda dentro de `validate:integration` e não foi relido por arquivo.
- Recontagem da baseline, feita pela WU-01 da rodada 1 em `1658cf2` antes da primeira edição: `test:frontend` **123**/**1268**; `test:gate` **233** testes, com **3** falhas porque o client Prisma do ai-orchestrator não estava gerado na worktree. É a mesma pré-condição de harness registrada no Goal081, não efeito do diff.
- Vermelho da baseline, feito pela WU-02 da rodada 1 contra o `AppointmentForm.tsx` da baseline, com restauração conferida por `sha256`: `Tests 9 failed | 1 passed (10)`, com as provas 1, 4 e 6 vermelhas. O arquivo tinha então **10** testes; o 11º é o da linha de (d), acrescentado na rodada 2. A rodada 3 não reexecutou o vermelho, e §59 não cola essa saída.
- Cinco controles negativos do §6, pelo FIX-001 da rodada 3, depois da execução final, por edição real revertida e conferida por `sha256`. Os controles 1 a 4 levam `goal083-new-appointment.test.tsx` de `11 passed (11)` a **6**, **1**, **1** e **1** testes que falham. O controle 5 roda o gate autenticado só em `agenda-novo` e `desktop-1440`, reprova e nomeia o `input` nativo. Todos passam restaurados.

Evidência conferida pelo Tech Lead:

- Na rodada 3, `goal083-new-appointment`, `goal069-agenda-structure`, `goal016-a11y` e `goal075-customer-profile`: 4 arquivos, **45**/**45**.
- Os 9 gates declarados do IA Loop deram exit 0 na rodada 3.
- Os `sha256` dos cinco arquivos de produção tocados pelos controles conferem com os citados em §59.
- O Tech Lead não reexecutou os cinco controles nem o vermelho da baseline. Os controles vêm do FIX-001 da rodada 3, e o vermelho vem da WU-02 da rodada 1.

## Observações registradas, sem mudar a decisão

1. **`startTime` em disco diferente do citado.** Depois do FIX-001, o orquestrador rodou de novo `validate:ui` e `validate:integration` sobre o mesmo código. Os `results.json` em disco têm `startTime` `2026-10-01T00:57:42.811Z` (**169**/**21**/**0**) e `2026-10-01T01:03:21.252Z` (**175**, **0** `unexpected`, **0** `flaky`). Os documentos citam `00:30:21.759Z` e `00:38:23.287Z`, a execução do FIX-001, que também é da rodada 3. As contagens são as mesmas.
2. **A prop `calendar` de `AppointmentFlowShell` ficou opcional e sem uso.** Os oito fluxos da Agenda ainda a passam. Remover a prop é limpeza fora deste Goal.
3. **O controle 5 neutraliza a rede (g) trocando o seletor, e não comentando a regra.** O efeito é o mesmo, e §59 declara isso. O seletor impresso pela medida é `input`, porque o campo não tem `id`, classe, `type` nem `name`. Quem nomeia o campo é o `html` impresso.
4. **O texto da prova 6 já passava no vermelho da baseline.** "fonte oficial", "Operacional" e "Avisar a cliente" não apareciam porque a WU-01 tirou `SourceStrip` antes da WU-02. O vermelho da prova 6 vem do teste dos controles sem classe. O controle 3 prova a regressão da faixa.
5. **Copy do Developer.** A soma, o CTA, a razão do CTA desabilitado e a linha de (d) seguem as regras do Goal. A clareza deles depende da conferência humana do §8.

## O que o aceite não prova

- A fidelidade visual da tela ao A6 em 360, 390, 768, 1024 e 1440 px. A conferência humana do §8 **não foi feita**.
- Que a pessoa cria pela tela nova, num navegador contra a pilha local, um agendamento com cliente cadastrado e dois serviços e outro com cliente novo.
- Que a criação deveria avisar a cliente. A divergência (e) segue como pergunta para uma pessoa em D-098.
- Que bloqueio, série, remarcação, cancelamento e exceções estão sem controle nativo. A rede (g) os cobre por construção, mas nenhuma medida renderizada os abre.
- A importação real da Minha Agenda (R-02, Goal082, à espera de uma pessoa).

Veredito do FINAL_AUDIT: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem mudança em relação a §58. R-11 fica corrigido. Ele é achado do re-teste local, fora da enumeração A-01…A-24 ([FINAL_AUDIT §59](../FINAL_AUDIT.md)).
