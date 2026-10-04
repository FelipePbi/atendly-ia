# Review formal — Goal 063

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal063](../goals/063-a-ia-so-liga-depois-do-teste-real.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–062 e 070) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 10 blockers; a rodada 2 terminou com zero.

O Goal aplica **U-11** e corrige **QA O-49** (ALTA), **QA S-02** (ALTA), **QA H-03** (ALTA) e **QA H-04** (MÉDIA) da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. A IA passa de desligada a ligada só com prova do teste real, por qualquer caminho. Pausar fica pausado. O onboarding só é concluído pela ação que sai dele, e o teste é alcançável no onboarding e em Configurações › IA enquanto a IA não está ativa. O checklist da Home leva a cada módulo ([D-080](../DECISIONS.md)). QA O-40, O-45 e O-48 saíram deste Goal na v86 e formam o Goal071.

## Escopo e identidade do diff

- Baseline aceita vigente: `57012750d63631b09f6bd6ac3a6310b31a05b84c` (fechamento do Goal062). Base imediata da implementação: `1c426899d689fc51ed8fb156b198189f88deba22`, HEAD da worktree `.ai-worktrees/goal-063`, inalterado nas duas rodadas. O commit `1c42689` é só documental (fechamento do 062 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **27 arquivos**, hash do diff `0e217ff2aa7ff5110e8951286fe481d97cac55d1f1a58125c074bbf28d23aa9a`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e dois arquivos rastreados**, por `git diff --numstat 1c42689`:
  - `apps/bff/`: `PUBLIC_API_V1.md` (+14/−2), `src/lib/ai-activation.ts` (+37/−0), `src/lib/errors.ts` (+4/−0), `src/modules/dashboard/routes.ts` (+4/−17) e `src/modules/settings/routes.ts` (+68/−5).
  - `apps/frontend/`: `AGENTS.md` (+3/−2), `e2e/authenticated-matrix.spec.ts` (+9/−5), `e2e/routes.ts` (+9/−0), `src/features/dashboard/DashboardScreen.tsx` (+37/−3), `src/features/onboarding/OnboardingRuntime.tsx` (+34/−1), `OnboardingScreen.tsx` (+42/−7), `blocks/activation-test.tsx` (+43/−367), `blocks/whatsapp.tsx` (+19/−11), `scenarios.ts` (+1/−1), `src/features/settings/AiSettings.tsx` (+344/−29), `src/shared/styles/avenly.css` (+20/−2), `tests/goal018-onboarding-reachability.test.tsx` (+21/−13) e `tests/goal024-settings-shell-invariant.test.tsx` (+4/−2).
  - Os quatro documentos de `docs/migration/`, por acréscimo no diff aceito: `CURRENT_STATE.md` (+91), `FINAL_AUDIT.md` (+161), `DECISIONS.md` (+35/−1, a nota de aplicação na linha U-11 e D-080) e `VALIDATION_GATE.md` (+23/−1, a linha de `validate:integration` passa a dizer oito rotas autenticadas).
- **Cinco arquivos novos**:
  - `apps/frontend/src/features/activation-test/ActivationTestPanels.tsx` (**512** linhas), o módulo compartilhado do teste real;
  - `apps/bff/tests/goal063-ai-activation.integration.test.ts` (**470** linhas, **13** testes do §7.1);
  - `apps/frontend/tests/goal063-onboarding-activation.test.tsx` (**436** linhas, **16** testes), `goal063-ai-settings.test.tsx` (**355** linhas, **8** testes) e `goal063-home-checklist.test.tsx` (**234** linhas, **3** testes).
- Nenhum arquivo foi tocado em `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/` ou `tools/ia-loop/`. Nenhuma migration. As rotas do teste real, `WhatsAppConnectionPanel` e as rotas de WhatsApp do BFF não mudaram. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados. `this.http.` em `apps/bff/src/clients/` segue em **42** ocorrências. Testes existentes alterados: só `goal018-onboarding-reachability` (a conclusão saiu de `contatos-ignorados` e do skip do WhatsApp) e `goal024-settings-shell-invariant` (a pausa abre pelo botão, não pelo checkbox), os dois pela regra do Goal.

## Rodada 1 — CHANGES_REQUIRED (10 blockers)

WU-01 (BFF) e WU-02 (onboarding) já estavam coerentes na rodada 1: `getValidActivationRun` como definição única de prova; `409 AI_ACTIVATION_TEST_REQUIRED` antes de qualquer escrita; ordem exclusão → prova → serviço; `activatedByRunId` ao ligar e ao pausar; a IA já ligada sem exigência de prova; o onboarding concluído só na saída; a tela de sucesso lendo `GET /v1/status`. WU-03 e WU-13 não tinham rodado. Os dez blockers:

1. **Testes `goal063` do BFF reprovavam contra PostgreSQL real** (11 falhas em `validate:integration`). As recusas esperavam `AiSettings` ausente, mas o cadastro já cria a linha com `enabled: false`. O caminho feliz recebia `502` por dublê HTTP incompleto.
2. **O vermelho da baseline dos testes do BFF não estava colado.**
3. **`validate:integration` não passava inteiro**, e os testes existentes que chamam `PATCH /v1/settings/ai` precisavam ser conferidos contra a leitura nova do teste na pausa.
4. **Configurações › IA ainda tinha o checkbox**, sem os quatro estados do §3.
5. **A extração para o módulo compartilhado era parcial**: introdução, progresso, pausa por interferência, falha e sucesso continuavam no bloco do onboarding.
6. **O checklist da Home continuava com `li` sem ação.**
7. **`/configuracoes/ia` não estava em `AUTHENTICATED_ROUTES`.**
8. **Nenhum dos seis controles negativos do §8 tinha rodado.**
9. **A documentação do §10 faltava**: D-080, a nota em U-11, FINAL_AUDIT §41, CURRENT_STATE, VALIDATION_GATE e o teste fora do onboarding em `PUBLIC_API_V1.md`.
10. **`test:gate` reprovava 3 de 233** em `goal029-goal030-rehearsal-guards` ("The generated Prisma client of apps/ai-orchestrator is missing").

## Rodada 2 — ACCEPTED (0 blockers)

- **B1:** `goal063-ai-activation.integration.test.ts` tem **13** casos. As recusas usam `expectUnchanged` (`enabled`, `activatedByRunId`, `tone` e `updatedAt`). O dublê atende o caminho feliz. Os casos cobrem a IA ligada antes do Goal e depois pausada (o que faz o controle 3 reprovar), a troca de canal e o isolamento entre negócios.
- **B2:** o arquivo final rodou contra o código da baseline `1c42689`, contra PostgreSQL real: **11** de **13** reprovam, com a saída colada em FINAL_AUDIT §41.
- **B3:** `validate:integration` passou **35**/**35** na árvore final. Nenhum teste de integração do BFF anterior ao Goal063 foi alterado.
- **B4:** `AiSettings` não tem checkbox e mostra os quatro estados. Com `AI_ACTIVATION_TEST_REQUIRED`, relê o estado. O estilo é salvo com o `enabled` lido.
- **B5:** a extração está completa. O bloco do onboarding virou só mapeamento de cenário para `features/activation-test/ActivationTestPanels.tsx`, usado também por Configurações › IA.
- **B6:** cada item do checklist é `Link`, com "Conectar", "Fazer o teste" e "depois do WhatsApp".
- **B7:** `/configuracoes/ia` está em `AUTHENTICATED_ROUTES`, medida no estado sem prova válida. A medição espera `aria-busy`. A seleção da sessão passou para `/${sessionMarker}`, equivalente para as rotas antigas.
- **B8:** os seis controles do §8 rodaram depois da última edição de código, com cada arquivo restaurado conferido por `sha256`. A saída real está em FINAL_AUDIT §41.
- **B9:** D-080 `PROPOSED`, a nota em U-11, FINAL_AUDIT §41 com veredito 0/7/6, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md`, todos por acréscimo. Declaram que a conferência humana do §9 não foi feita.
- **B10:** causa de ambiente. O client Prisma da IA não é versionado e não existia na worktree naquela execução. Com o client gerado por `validate:core`, `test:gate` passou **233**/**233** antes e depois dos controles.

Prova conferida na árvore final:

- `typecheck` e `lint` de `apps/bff` e `apps/frontend`: exit 0 nos quatro.
- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`. Dentro dele: `test:frontend` **83** arquivos e **793** testes (baseline review062: **80**/**766**); `test:scheduling-service` **35**/**484** (inalterado); `test:gate-scripts` **233**/**233**.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `test:gate`: **233**/**233**.
- `validate:integration`: **35**/**35** passos. `test:bff-integration` roda **50** arquivos e **402** testes (baseline **49**/**389**), inclusive os **13** do §7.1. `test:scheduling-integration` roda **16**/**124** (inalterado). `rehearse:goal033-authenticated-ui` roda **70** testes: **70** expected, **0** unexpected, **0** flaky, **0** retentativas (baseline **65**; as **5** novas são `/configuracoes/ia` nas cinco larguras).
- O revisor rodou de novo os três testes `goal063` do frontend mais `goal018-onboarding-reachability` e `goal024-settings-shell-invariant`: **5** arquivos, **101**/**101**.
- `git status` lista só os **27** arquivos declarados.
- Nenhuma suíte encolheu.

## Observações registradas, sem mudar a decisão

1. **Leitura da execução que falha.** A rota responde `409 AI_ACTIVATION_TEST_REQUIRED`, e o §1 do Goal pedia que o erro subisse como os demais erros de upstream do BFF. O invariante "dúvida nunca liga a IA" vale nos dois casos, e nada é gravado. O desvio está justificado em D-080 (Alternativas) e em `PUBLIC_API_V1.md`. Aceitar D-080 aceita esse desvio.
2. **Salvar o estilo com a IA desligada marca a execução como usada.** A tela envia `enabled: false`, e a rota trata isso como pausa: se existe prova válida que ainda não ligou a IA, o `id` dela vai para `activatedByRunId`, e a autoativação da reconciliação deixa de agir sobre ela. Há recuperação por "Retomar atendimento". É caso de borda. Candidato a correção: marcar a execução só quando o `enabled` gravado era `true`.
3. **Caso legado do §7.1.** O §7.1 pede "já ligada sem `activatedByRunId`: salvar só o estilo". O teste cobre o caso com `activatedByRunId` preenchido. O ramo de código é o mesmo.
4. **Ordem das checagens.** O teste de exclusão usa execução nula, não prova válida. A ordem exclusão → prova fica provada mesmo assim, porque a recusa é a da exclusão.
5. **"Conectar agora" em `whatsapp-concluido`.** Com o onboarding aberto, o link volta à etapa WhatsApp do onboarding. É aceitável; fica registrado para o Goal071, que mexe no mesmo bloco.
6. **Comentário defasado.** O comentário "seven routes" em `apps/frontend/e2e/authenticated-matrix.spec.ts` não foi atualizado para oito.

## O que o aceite não prova

- Que o teste real envia e recebe mensagem de verdade: o número oficial da Avenly não existe no ambiente (D-035). A conferência humana do §9 do Goal — onboarding chegando ao teste pelos dois botões, teste de Configurações › IA rodando, a IA ligando ao terminar bem e a pausa não sendo desfeita por nova leitura — **não foi feita**.
- Que `/onboarding/*` cumpre largura, toque, contraste, foco e movimento: não é medida pelo gate renderizado.
- Que as telas batem com o protótipo aprovado (conferência humana, Goal068).
- Consentimento, QR e visão de código (Goal071).
- IA ligada antes do Goal063 sem teste continua ligada: não há regra retroativa.

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §41](../FINAL_AUDIT.md)).
