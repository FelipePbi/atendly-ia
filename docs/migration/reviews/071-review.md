# Review formal — Goal 071

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-28, conforme o [Goal071](../goals/071-a-conexao-do-whatsapp-pede-consentimento-e-mantem-o-codigo-valido.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–063 e 070) foi reaberto, reavaliado ou revertido. **Três rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 10 blockers, a rodada 2 `CHANGES_REQUIRED` com 4, e a rodada 3 terminou com zero.

O Goal corrige **QA O-40** (ALTA), **QA O-45** (ALTA), **QA O-48** (MÉDIA) e **QA O-44** (MÉDIA) da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. Vincular o WhatsApp passa a exigir consentimento a cada vinculação, pelo BFF, por qualquer caminho. O QR é relido pelo que está valendo, só com vinculação por QR em curso e nunca com o número conectado. A tela renova o QR dentro de uma janela declarada e mostra expiração em vez de sessão morta. A visão de código copia, numera passos e expira ([D-081](../DECISIONS.md)). Fecha também as observações 5 ("Conectar agora" em `whatsapp-concluido`) e 6 (comentário de contagem de rotas) do [review063](063-review.md).

## Escopo e identidade do diff

- Baseline aceita vigente: `0cb49b40154050e220e53c9b937f7b2dc7f7852c` (fechamento do Goal063). Base imediata da implementação: `4a355b163e1d1a0689ee0150af3fc3669fd5b2d9`, HEAD da worktree `.ai-worktrees/goal-071`, inalterado nas três rodadas. O commit `4a355b1` é só documental (fechamento do 063 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **24 arquivos**, hash do diff `b23caf950fdc8a7c5ba9a27bc349ab8fd2d6fc9716fbab04af17b06d1c50852e`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e um arquivos rastreados**, por `git diff --numstat 4a355b1`:
  - `apps/bff/`: `PUBLIC_API_V1.md` (+15/−1), `src/lib/errors.ts` (+4/−0), `src/modules/whatsapp/routes.ts` (+63/−1) e `tests/goal059-whatsapp-orphan.integration.test.ts` (+5/−5).
  - `apps/frontend/`: `AGENTS.md` (+7/−2), `e2e/authenticated-matrix.spec.ts` (+36/−7), `e2e/routes.ts` (+10/−0), `src/data/services/BffWhatsAppService.ts` (+20/−2), `src/features/onboarding/OnboardingScreen.tsx` (+26/−2), `blocks/shared.tsx` (+3/−0), `blocks/whatsapp.tsx` (+4/−1), `src/features/whatsapp/WhatsAppConnectionPanel.tsx` (+571/−110), `src/shared/styles/atendly-settings.css` (+111/−0) e `tests/goal018-onboarding-reachability.test.tsx` (+3/−1).
  - `packages/public-api-contract/`: `src/routes.ts` (+2/−0) e `src/schemas.ts` (+9/−0).
  - `scripts/goal033-authenticated-ui-rehearsal.mjs` (+1/−1): só `consentAccepted: true` no corpo de `POST /v1/whatsapp/connect`.
  - Os quatro documentos de `docs/migration/`, só por acréscimo no diff aceito: `CURRENT_STATE.md` (+128), `DECISIONS.md` (+33, D-081), `FINAL_AUDIT.md` (+392, §42) e `VALIDATION_GATE.md` (+46).
- **Três arquivos novos**:
  - `apps/bff/tests/goal071-whatsapp-consent-qr.integration.test.ts` (**670** linhas, **15** testes do §9.1);
  - `apps/frontend/tests/goal071-whatsapp-connection-panel.test.tsx` (**1011** linhas, **28** testes) e `goal071-onboarding-whatsapp.test.tsx` (**266** linhas, **8** testes).
- Nenhum arquivo foi tocado em `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `apps/bff/src/clients/` ou `tools/ia-loop/`. Em `packages/`, só `public-api-contract`. Nenhuma migration. `this.http.` em `apps/bff/src/clients/` segue em **42** ocorrências. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados. Testes existentes alterados, pela regra do Goal: `goal059-whatsapp-orphan` (os corpos de `connect` passam a levar `consentAccepted: true`) e `goal018-onboarding-reachability` ("Conectar agora" aponta para `/onboarding/whatsapp`).

## Rodada 1 — CHANGES_REQUIRED (10 blockers)

O BFF já estava correto no essencial: `consentAccepted` validado antes de `ensureInstance`; `GET /v1/whatsapp/qr` com `409 WHATSAPP_QR_NOT_IN_PROGRESS` sem marcador, status lido antes do QR e marcador limpo com o número conectado ou logado; nenhuma migration; contrato e `PUBLIC_API_V1.md` atualizados. O painel descumpria partes explícitas do §3, §4 e §5. Os dez blockers:

1. **Leitura concorrente do QR.** Voltar a ficar visível chamava `tick()` com uma leitura ainda em voo, e ficavam duas cadeias de renovação.
2. **QR velho ou ausente sem expirar.** `qrcode: null` persistente e falhas seguidas mantinham "Aguardando conexão" até o fim da janela de 5 min, com QR de mais de um giro na tela.
3. **Consentimento fora do texto exigido.** O rótulo do checkbox não era a frase do §3, e faltava "Saiba mais" para `/politica-de-privacidade`.
4. **Visão de código incompleta.** Sem "Código copiado", rótulo do campo errado, e o erro inline de formato nunca aparecia (CTA desabilitado; `VALIDATION_ERROR` caía na mensagem genérica).
5. **Termos proibidos errados no teste**, e conferidos só no estado de consentimento.
6. **Faltavam provas do §9.2**: o mesmo consentimento nos dois caminhos com o painel real, "Não, só trabalho" sem o bloco de controle, e um CTA primário nos estados QR, código e expirado.
7. **Faltavam provas do §9.1**: modo código seguido de `409` sem ler o QR, e `DELETE` seguido de nenhuma leitura.
8. **Comentário de contagem ainda errado**: dizia oito rotas, eram nove.
9. **Vermelho da baseline dos testes jsdom não colado.**
10. **Gates, controles e documentação a refazer** depois das correções, mais a frase confusa sobre o corpo de conexão em `PUBLIC_API_V1.md`.

## Rodada 2 — CHANGES_REQUIRED (4 blockers)

Os dez blockers da rodada 1 foram corrigidos e conferidos no código e nos testes: flag `inFlight`, relógio de giro, rótulo e "Saiba mais", "Código copiado", erro inline, lista de termos certa, dois caminhos com o painel real, testes de `PAIRING_CODE` e `DELETE`, comentário de nove rotas. Os quatro blockers:

1. **Corrida no QR.** Uma leitura em voo sobrevivia ao cleanup do efeito, armava um relógio órfão e podia expirar, ou sobrescrever, a vinculação reaberta por "Gerar novo QR Code".
2. **Consentimento antes da primeira leitura de status.** Com `connection === null`, o painel mostrava o consentimento e o CTA também para quem já tinha o número conectado, contra o §3. O marcador `h1` estático de `/configuracoes/whatsapp` não garantia que o gate medisse o estado conectado.
3. **Intervalo do modo código em 4 s**, contra os 3 s do §5.
4. **Gates, controles e documentação a refazer** depois das correções.

## Rodada 3 — ACCEPTED (0 blockers)

- **B1:** flag `disposed`, ligada no cleanup e conferida depois do `await whatsapp.qr()` e no `catch`. Leitura descartada não expira, não rearma o relógio e não troca o QR. Dois testes novos (leitura em voo com `qrcode: null` e com QR velho depois de "Gerar novo QR Code"); o controle 9 reprova **2** de **28**.
- **B2:** até a primeira leitura, o painel mostra só `<section aria-busy>` com skeleton, sem checkbox nem botão. Falha nessa leitura mostra "Não foi possível verificar a conexão." com "Tentar novamente", mais conservador que o sugerido e dentro do §3. `LOADED_STATE` em `e2e/authenticated-matrix.spec.ts` exige "WhatsApp conectado" e nenhum checkbox antes de medir `/configuracoes/whatsapp`; `apps/frontend/AGENTS.md` foi atualizado.
- **B3:** `PAIRING_CODE_POLL_INTERVAL_MS = 3_000`, com teste em 2999, 3000 e 6000 ms.
- **B4:** contagens coerentes entre FINAL_AUDIT §42, CURRENT_STATE, VALIDATION_GATE e D-081. Os quatro documentos são só acréscimo.

Prova conferida na árvore final:

- `typecheck` e `lint` de `apps/bff` e `apps/frontend`: exit 0 nos quatro.
- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`. Dentro dele: `test:frontend` **85** arquivos e **829** testes (baseline review063: **83**/**793**); `audit:static` **33** de **34**, **1** pulada.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `test:gate`: **233**/**233**.
- `validate:integration`: **35**/**35** passos na reexecução. `test:bff-integration` roda **51** arquivos e **417** testes (baseline **50**/**402**), inclusive os **15** do §9.1. `test:scheduling-integration` roda **16**/**124** (inalterado). `rehearse:goal033-authenticated-ui`: **75** expected, **0** unexpected, **0** flaky, **0** retentativas (baseline **70**; as **5** novas são `/configuracoes/whatsapp` nas cinco larguras, medida só depois do estado conectado).
- Vermelho da baseline, rodado de novo na rodada 3 contra `0cb49b4`: frontend **29** de **36**, BFF **12** de **15**, contra PostgreSQL real.
- **11** controles negativos (os seis do §10, dois da rodada 2 e três da rodada 3), rodados depois da última edição de código, com restauração conferida byte a byte. Saída real em [FINAL_AUDIT §42](../FINAL_AUDIT.md).
- O revisor rodou de novo os dois arquivos `goal071-` do frontend mais `goal059-whatsapp-status-view`, `goal018-onboarding-reachability` e `goal024-settings-shell-invariant`: **5** arquivos, **123**/**123**.
- `git status` lista só os **24** arquivos declarados, sem `e2e-results/`.
- Nenhuma suíte encolheu.

## Observações registradas, sem mudar a decisão

1. **`goal025-account-purge` não é isolado.** A primeira execução de `validate:integration` reprovou **1** de **417** em `tests/goal025-account-purge.test.ts`: `runAccountPurge` reivindicou uma segunda conta vencida no banco compartilhado. A reexecução completa, sem mudança na árvore, passou limpa. Teste e purga estão fora do diff071. Candidato a correção: isolar as contas vencidas que o teste enxerga.
2. **Possível flake na medida de 1024 px.** `/configuracoes/whatsapp` levou 22,1 s a 1024 px, contra ~1,8 s nas outras larguras. Passou na primeira tentativa.
3. **`LOADED_STATE` sem controle negativo Playwright.** A prova é que as cinco medidas passaram com a asserção ativa; nenhum controle mostrou a medição reprovando sem ela.
4. **`connect` no modo QR com `qrcode` vazio.** Se a Evolution devolver `connect` sem QR, o marcador não é gravado e a tela expira na primeira releitura. Segue o texto do Goal; vale olhar na conferência humana.

## O que o aceite não prova

- Que a conexão real funciona com WhatsApp e Evolution reais. A conferência humana do §11 do Goal — QR renovado conectando depois de 60 s aberto, "Gerar novo QR Code" conectando depois da janela, código copiado conectando pelo celular, e ler o QR com o número conectado sem derrubar a sessão — **não foi feita**.
- Que o consentimento tem valor legal: ele não é gravado, e a revisão legal segue nos temas adiados do vault.
- Que os estados de consentimento, QR e código e `/onboarding/*` cumprem largura, toque, contraste, foco e movimento: o gate renderizado mede só `/configuracoes/whatsapp` no estado conectado.
- Que as telas batem com o protótipo aprovado (conferência humana, Goal068).

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §42](../FINAL_AUDIT.md)).
