# Review formal — Goal 066

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-28, conforme o [Goal066](../goals/066-a-importacao-entra-no-onboarding.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–065, 070 e 071) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 8 blockers, e a rodada 2 terminou com zero.

O Goal aplica **U-09** e corrige **QA O-17**, **QA O-18**, **QA O-19**, **QA O-20**, **QA O-21** e **QA O-22** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e a **observação 5 do [review065](065-review.md)**. As três telas antigas do bloco "Sua agenda" dão lugar a "Sistema atual" e "Quando importar". `calendar.source` é gravado antes de qualquer importação. A mesma experiência de `/importacao` roda numa etapa `importacao` do onboarding, sem o shell da plataforma. O horário personalizado só no início deixa de congelar o fim ([D-084](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `f565978a8da01165fd3b397f5c1a9ef58dd6e747` (Goal065). Base imediata da implementação: `6e0d663a13b7f5efa27be86b1b8f584085475879`, HEAD da worktree `.ai-worktrees/goal-066`, inalterado nas duas rodadas. Os commits `6580232` e `6e0d663` são só documentais (status do Goal065 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos**, hash do diff `8b13dd85c5137d2fe4789d451e5e98d958da35465f37e1f089111e4662ea1ab6`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Dezenove arquivos rastreados**, por `git diff --numstat 6e0d663`:
  - `apps/frontend/`, produto: `app/onboarding/[step]/page.tsx` (+6/−2), `features/imports/ImportsLayout.tsx` (+38/−6), `features/imports/ImportsScreen.tsx` (+56/−9), `features/onboarding/OnboardingRuntime.tsx` (+76/−8), `OnboardingScreen.tsx` (+90/−13), `OnboardingShell.tsx` (+69/−25), `blocks.ts` (+12/−8), `blocks/business.tsx` (+2/−2), `blocks/schedule.tsx` (+45/−75), `blocks/shared.tsx` (+30/−0) e `scenarios.ts` (+20/−17).
  - `apps/frontend/`, documentação e medição: `AGENTS.md` (+8/−4) e `e2e/routes.ts` (+24/−0).
  - `apps/frontend/tests/`: `goal018-onboarding-reachability.test.tsx` (+34/−88) e `goal065-onboarding-business.test.tsx` (+7/−4). Cada mudança está mapeada em [FINAL_AUDIT §45](../FINAL_AUDIT.md): cinco testes das três telas antigas substituídos pela suíte goal066, um por um, e dois destinos de rota trocados. Nenhum teste foi pulado. Nenhum teste de `features/imports` mudou.
  - Os quatro documentos de `docs/migration/`, só por acréscimo no snapshot aceito: `CURRENT_STATE.md` (+83), `DECISIONS.md` (+36, D-084), `FINAL_AUDIT.md` (+78, §45) e `VALIDATION_GATE.md` (+95).
- **Três arquivos novos**:
  - `apps/frontend/src/features/onboarding/OnboardingImportStep.tsx` (**121** linhas): a etapa `importacao`, que monta `ImportsFlow` em `ImportsFrameProvider frame="onboarding"` dentro de `OnboardingFrame`;
  - `apps/frontend/tests/goal066-onboarding-sistema-atual.test.tsx` (**491** linhas, **23** testes) e `goal066-onboarding-importacao.test.tsx` (**504** linhas, **13** testes).
- Nenhum arquivo foi tocado em `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/`, `scripts/` ou `tools/ia-loop/`. Nenhuma migration. `KNOWN_*` sem exceção nova. `POST /v1/onboarding/complete`, as regras de conclusão, a ativação da IA, as chamadas da importação e `/importacao` não mudaram. `this.http.` em `apps/bff/src/clients/` segue em **42** ocorrências. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados.

## Rodada 1 — CHANGES_REQUIRED (8 blockers)

Só a WU-01 foi entregue (§1 e §3 do Goal). O que já estava correto: `sistema-atual` com dois `ActionCard` sem seleção, sem `aria-pressed`, sem ✓ e sem "Continuar"; as três rotas antigas redirecionando por `legacyStepRedirects`; `calendar.source` gravado antes de avançar em "Importar agora", "Fazer depois" e "Não, começar do zero"; `servicePopulation` e os textos proibidos removidos; `dayHourOf`/`setDayHour` guardando a personalização por campo. A WU-02 (§2), a WU-03 (§4) e a WU-11 (§6 e §8) ficaram `BLOCKED` por dependência. Os oito blockers:

1. **A etapa `importacao` não existia.** `persistScheduleStep` chamava `ctx.go("importacao")` para um cenário inexistente: erro TS2345, que derrubava typecheck, `next build` e os três `validate:*`, e em execução levava a uma rota inexistente. Faltavam o cenário, a separação entre moldura e telas em `features/imports/`, a montagem pelo estado de `getImportState`, a saída §5B e a retomada em `nextRequiredStep`.
2. **Testes jsdom da importação no onboarding ausentes**: tela de conectar sem link "Configurações", sessão viva na retomada, três destinos de §5B, falha de leitura, `/importacao` preservado. O teste de "Importar agora" só provava um `push` para rota inexistente.
3. **Gate autenticado sem as etapas novas**: `e2e/routes.ts` não mudou, e o critério 6 não era decidível.
4. **Vermelho contra `f565978` não rodado**: o sandbox negou a leitura histórica, e o relatório não trazia a saída.
5. **Execução final não passou**: typecheck exit 1, `validate:core` parou em `build:frontend`, `validate:integration` exit 1.
6. **Seis controles negativos do §6 não rodados.**
7. **Documentação do §8 ausente**: sem D-084, FINAL_AUDIT §45, CURRENT_STATE e VALIDATION_GATE.
8. **Ajustes menores**: `ActionCard` não ficava desabilitado durante a gravação (dois cliques, dois `PATCH`); títulos e comentários defasados em goal018, goal065 e goal066; falta do mapa de qual teste substitui qual.

## Rodada 2 — ACCEPTED (0 blockers)

- **B1:** cenário `importacao` em `scenarios.ts`, `blockScenarios.schedule` e `progressPercent`, com a posição de `sistema-atual`. `ImportsFrameProvider` separa a moldura; o link "Configurações" só aparece com `platform`. `useImportState` só chama `getImportState`, e `ImportsFlow` é compartilhado; `ImportsScreen` mantém `useShellConfig`. `OnboardingImportStep` usa `OnboardingFrame`, sem formulário e sem `useShellConfig`, e nenhuma tela de `features/imports` tem outro `href` ou `router`. `stepAfterImport` segue a ordem §5B; o BFF já devolve `service` como serviço ativo (`onboarding-state.ts`). `nextRequiredStep(state, importState)` e `OnboardingResume` só leem a importação quando a próxima etapa seria `servico-nome`, e falha de leitura cai em `servico-nome`.
- **B2:** `goal066-onboarding-importacao` com **13** testes, entre eles a ordem `PATCH` → releitura → `push` → `getImportState` por `invocationCallOrder`, a montagem fora de `ShellConfigProvider`, os três destinos de §5B com aviso e `/importacao` com o link e o shell registrado.
- **B3:** `ONBOARDING_ROUTES` ganhou `sistema-atual`, `quando-importar` e `importacao` (estado de conectar), cada uma com marcador. Conferido em `e2e-results/authenticated/results.json` da execução nativa: **140** `expected`, **0** `unexpected`, **0** `flaky`; as **15** medições novas nas cinco larguras, sem retentativa.
- **B4:** vermelho contra `f565978` por `git archive`, colado em FINAL_AUDIT §45: **33** de **36** falhando; os **3** que passam são de preservação. Não reexecutado na revisão.
- **B5:** os oito gates nativos da rodada 2 passaram (typecheck, lint, testes dirigidos, `validate:core`, `test:gate`, `validate:ui`, `validate:integration`, `git diff --check`). `validate:ui` **169**/**21**/**0**/**0** bate com `results.json`.
- **B6:** os seis controles colados com `git hash-object` antes, durante e depois, idênticos na restauração. Não reexecutados na revisão.
- **B7:** D-084 PROPOSED, FINAL_AUDIT §45 (veredito 0/7/6), CURRENT_STATE, VALIDATION_GATE e `apps/frontend/AGENTS.md` escritos por acréscimo, com a conferência humana declarada como não feita.
- **B8:** `ActionCard` com `disabled={busy}` e teste; títulos e comentários de goal018 e goal065 corrigidos, com o mapa de substituição em FINAL_AUDIT §45.

Na revisão, goal066 (as duas suítes), goal018 e goal065 rodaram **113**/**113**. `git status` mostrou só os arquivos declarados.

Prova declarada pelo Developer e conferida na revisão:

- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`. Dentro dele: `test:frontend` **92** arquivos e **958** testes (baseline review065: **90**/**927**); `audit:static` **33** de **34**, **1** pulada.
- `test:gate`: **233**/**233**.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos. `test:bff-integration` **53**/**428** e `test:scheduling-integration` **16**/**124**, ambos inalterados. `rehearse:goal033-authenticated-ui`: **140** `expected` (os **125** de antes, sem mudança, mais **15** das três etapas novas nas cinco larguras), **0** `unexpected`, **0** `flaky`, **0** retentativas.
- Nenhuma exceção nova em `KNOWN_*`. Nenhuma suíte encolheu.

## Observações registradas, sem mudar a decisão

1. **`/onboarding/importacao` por URL direta abre sem `calendar.source`.** Só a retomada leva a `sistema-atual`; quem digita a URL chega à tela de conectar, e uma execução receberia `CALENDAR_SETTINGS_NOT_FOUND` do Scheduling. Vale um guard na etapa.
2. **`ActionCard` põe `<h2>` dentro de `<button>`.** É o mesmo padrão de `Choice`, que já existia.
3. **Na retomada, `dayHours` guarda o par inteiro do dia diferente.** É o comportamento que o Goal065 deixou e que este Goal manda preservar; a personalização por campo vale na edição.

As observações 1 e 2 são candidatas a ajuste no Goal072 ou em revisão futura.

## O que o aceite não prova

- Que a importação dentro do onboarding funciona contra uma conta real do Minha Agenda, nem que quem termina a importação chega à demonstração da IA sem recadastro num aparelho real. A conferência humana do §7 do Goal **não foi feita**.
- Que a ausência de tela separada de escolha de origem é aceitável (D-084, item 7, conferência humana).
- Que os estados de análise, revisão, conflitos, execução e resultado dentro do onboarding cumprem largura, toque, contraste, foco e movimento. Ficam no jsdom; o gate mede `importacao` só no estado de conectar.
- Que as etapas novas batem com o protótipo aprovado (`Onboarding-2-Importacao*`), nem o endereço por CEP (Goal072).

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §45](../FINAL_AUDIT.md)).
