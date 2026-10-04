# Review formal — Goal 064

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-28, conforme o [Goal064](../goals/064-conta-conforme-o-vault-cadastro-e-recuperacao-de-senha.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–063, 070 e 071) foi reaberto, reavaliado ou revertido. **Cinco rodadas**: as rodadas 1, 2, 3 e 4 terminaram `CHANGES_REQUIRED` com 6, 4, 4 e 6 blockers, e a rodada 5 terminou com zero.

O Goal corrige **QA C-01** (ALTA), **QA C-02**, **QA C-03**, **QA C-04**, **QA C-11**, **QA C-12**, **QA L-01** (ALTA), **QA L-02**, **QA L-03**, **QA L-04**, **QA L-05** e **QA H-05** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. O cadastro exige Nome. Uma única regra de senha (U-10) vale para cadastro, redefinição e troca, e nunca para login. A recuperação de senha usa o fluxo real por link e não afirma "Senha redefinida" antes de `200`. As quatro telas de entrada validam inline, sem balão nativo. O cadastro tem um aceite só, o login perde o checkbox morto e a Home cumprimenta pela pessoa ([D-082](../DECISIONS.md)). D-082 revê a parte "recuperação somente visual" de G-34 que D-030 fechou no Goal014, pelo "Revisar se" que D-030 previa.

## Escopo e identidade do diff

- Baseline aceita vigente: `fbdb0ccbfc9b8457a11b06def3e856b12894e39b` (Goal071). Base imediata da implementação: `c44282d7a4bc07666fad0e9ff2573bc18988e080`, HEAD da worktree `.ai-worktrees/goal-064`, inalterado nas cinco rodadas. O commit `c44282d` é só documental (fechamento do 071 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **32 arquivos**, hash do diff `56388b08b7bdcb8e2092986aea15b6c6f80bccbc599165263f2b0c4bfdb500b3`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e sete arquivos rastreados**, por `git diff --numstat c44282d`:
  - `apps/bff/`: `PUBLIC_API_V1.md` (+8/−0), `prisma/schema.prisma` (+3/−0), `src/lib/dto.ts` (+4/−1), `src/lib/errors.ts` (+5/−0), `src/modules/auth/routes.ts` (+50/−30), `tests/auth-register.integration.test.ts` (+1/−0) e `tests/helpers/integration.ts` (+1/−0). Os dois testes só passam a enviar `name` no cadastro.
  - `apps/frontend/`: `src/app/solicitacao-enviada/page.tsx` (+1/−1), `src/data/services/BffAuthService.ts` (+1/−2), `src/features/auth/AuthScreen.tsx` (+263/−300), `src/features/auth/recoveryMachine.ts` (**removido**, −48), `src/features/dashboard/DashboardScreen.tsx` (+33/−2), `src/features/settings/AccountSettings.tsx` (+28/−3), `src/shared/styles/avenly.css` (+46/−0), `tests/goal014-auth.test.tsx` (+24/−153), `tests/goal018-dashboard-status.test.tsx` (+4/−1) e `tests/goal059-whatsapp-status-view.test.tsx` (+6/−2). Em `goal018` e `goal059`, "Olá, Studio Marina" vira o cumprimento pelo horário.
  - `packages/public-api-contract/`: `src/index.ts` (+1/−0) e `src/schemas.ts` (+3/−0, `userSchema.name`).
  - `scripts/goal030-mvp-journey-rehearsal.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` (+3/−0 cada): só `name` no corpo de `POST /v1/auth/register`. As senhas dos ensaios não mudaram.
  - Os seis documentos de `docs/migration/`, só por acréscimo no diff aceito, exceto uma linha: `CURRENT_STATE.md` (+127), `DATA_MIGRATION.md` (+16, §21), `DECISIONS.md` (+35, D-082), `FINAL_AUDIT.md` (+80, §43), `GAP_ANALYSIS.md` (+1/−1, linha G-34) e `VALIDATION_GATE.md` (+121).
- **Cinco arquivos novos**:
  - `apps/bff/prisma/migrations/20260917000000_goal064_user_name/migration.sql` (**7** linhas): só `ADD COLUMN "name" TEXT`, nulável, sem `UPDATE` e sem backfill;
  - `packages/public-api-contract/src/password-policy.ts` (**32** linhas: `passwordPolicySchema` e `PASSWORD_POLICY_RULES`);
  - `apps/bff/tests/goal064-account.integration.test.ts` (**423** linhas, **7** testes do §9.1);
  - `apps/frontend/tests/goal064-auth-screens.test.tsx` (**555** linhas, **26** testes) e `goal064-greeting-and-account.test.tsx` (**269** linhas, **5** testes).
- Nenhum arquivo foi tocado em `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `apps/bff/src/clients/` ou `tools/ia-loop/`. Em `packages/`, só `public-api-contract`. Uma migration, aditiva. `this.http.` em `apps/bff/src/clients/` segue em **42** ocorrências. Login, sessão, CSRF, `logout`, `logout-all`, `forgot-password`, exclusão de conta e purga não mudaram. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados.

## Rodada 1 — CHANGES_REQUIRED (6 blockers)

O BFF já estava correto no essencial: migration só aditiva; `name` validado antes de qualquer escrita; `passwordPolicySchema` no pacote, usado em `register`, `reset-password` e `PATCH /v1/auth/password`, e não em login; `PASSWORD_RESET_TOKEN_INVALID` como código próprio; a senha atual conferida antes do claim do token. A recuperação por link era real, e "Senha redefinida" só aparecia depois do `200`. Os seis blockers:

1. **Regressão em `PATCH /v1/auth/password`.** O refine `newPassword === confirmPassword` tinha saído de `passwordSchema`, e uma confirmação divergente trocava a senha em silêncio. O Goal só autorizava tirar `confirmPassword` do cadastro e da redefinição.
2. **Senhas dos ensaios alteradas fora do escopo**, em `goal030-` e `goal033-`, com justificativa falsa.
3. **Copy diferente da exigida**: texto do aceite, botão "Enviar link", `/solicitacao-enviada` sem validade limitada, spam e "Voltar para entrar", e `/nova-senha` sem dizer no formulário que a senha precisa ser diferente da anterior.
4. **Regras de senha ao vivo sem estado em texto**: só ícone e cor, com o ícone `aria-hidden`.
5. **Faltavam provas do §9.2** (regras ao vivo, `aria-invalid`/`aria-describedby` nas quatro telas, vocabulário técnico, erro genérico em `/recuperar-senha`) e o vermelho da baseline do frontend.
6. **FINAL_AUDIT §43 afirmava um teste de erro genérico que não existia**; contagens a refazer depois das correções.

## Rodada 2 — CHANGES_REQUIRED (4 blockers)

Código de produto corrigido: `confirmPassword` e o refine voltaram a `passwordSchema`, `AccountSettings` confere a divergência no cliente, os scripts voltaram às senhas originais, o aceite e o botão seguem o Goal e as regras ganharam estado em texto. O revisor rodou `goal064-account`, `auth-register` e `session-csrf` contra PostgreSQL real: **23**/**23**. Os quatro blockers:

1. **Faltava o teste do PATCH com confirmação divergente**, no BFF e no frontend.
2. **`/solicitacao-enviada` ainda dizia "Ir para entrar"**, e "diferente da anterior" só existia em `.auth-story`, oculto no mobile.
3. **Faltavam o teste de falha de rede ou `500` em `/recuperar-senha`** e o vermelho na baseline `fbdb0cc`.
4. **Evidência documental que não era saída real**: mensagens dos controles 1 e 2 no formato invertido do vitest, numeração das rodadas errada e nenhum mapa dos 8 testes tirados de `goal014-auth.test.tsx`.

## Rodada 3 — CHANGES_REQUIRED (4 blockers)

O código de produto ficou correto: teste BFF do PATCH divergente, CTA "Voltar para entrar", subtítulo "Diferente da senha anterior…", testes de `TypeError` e `500`, mensagens do vitest corrigidas. A rodada corrigiu só a primeira parte de cada blocker da rodada 2, e os documentos passaram a contradizer a árvore (diziam **845** testes; a execução real dava **87**/**847**). Os quatro blockers:

1. **Faltava o teste frontend de "As senhas não coincidem."** em Configurações › Conta.
2. **Faltavam os testes dos dois textos novos** de `/solicitacao-enviada` e `/nova-senha`.
3. **Vocabulário técnico conferido só no render inicial**, e vermelho da baseline ainda ausente.
4. **Documentação**: contagens erradas, controles 5 e 6 com contagens antigas, numeração das rodadas, mapa dos testes substituídos e execução final a refazer.

## Rodada 4 — CHANGES_REQUIRED (6 blockers)

A parte de testes dos blockers 1, 2 e 3(1) da rodada 3 foi feita, e os gates passaram na árvore da rodada 4. O código de produto não mudou. Nenhuma ação sobre a parte de evidência e documentação, pela segunda rodada seguida. O perfil do Developer foi trocado de `SONNET_HIGH` para `OPUS_MEDIUM` por esse motivo. Os seis blockers:

1. **Vermelho da baseline** ainda ausente.
2. **Controles do §10 não rodados de novo** na árvore final (os documentos diziam "1 de 18" e "1 de 4", contra **26** e **5** testes por arquivo).
3. **Numeração das rodadas** ainda errada nos três documentos.
4. **Mapa dos 8 testes tirados de `goal014-auth.test.tsx`** ainda ausente.
5. **Ausência de "Ir para entrar"** em `/solicitacao-enviada` sem asserção.
6. **Execução final a refazer**, na ordem `validate:core`, `test:gate`, `validate:ui`, `validate:integration`, com as contagens reescritas a partir dela.

## Rodada 5 — ACCEPTED (0 blockers)

- **B5:** `goal064-auth-screens.test.tsx` confere a ausência de "Ir para entrar" no teste do link "Voltar para entrar".
- **B1:** subseção "Vermelho na baseline" em FINAL_AUDIT §43 e em VALIDATION_GATE, com o SHA `fbdb0cc` e a saída real. Frontend: **27** de **31** falhando (**23**/**26** e **4**/**5**). BFF: **6** de **7** falhando; o que passa é o `503` sem delivery, comportamento anterior ao Goal. A worktree temporária foi removida.
- **B2:** os seis controles rodaram de novo depois da última edição de código, com restauração conferida por `md5sum`: C1 **1**/**7**; C2 **1**/**7**, **1**/**5** e **1**/**26**; C3 **1**/**7**; C4 **2**/**7**; C5 **8**/**26**; C6 **1**/**26**.
- **B3:** nenhuma seção do Goal064 atribui execução à rodada errada. Vermelho, controles e execução final são da rodada 5.
- **B4:** o mapa dos 8 testes está em FINAL_AUDIT §43. Os 4 de `recoveryReducer` ficam sem substituto direto, porque o redutor foi removido, e o motivo está escrito. Os 4 do fluxo de quatro telas têm substituto com nome exato.
- **B6:** execução final na ordem pedida.

Prova conferida na árvore final:

- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`. Dentro dele: `test:frontend` **87** arquivos e **854** testes (baseline review071: **85**/**829**); `audit:static` **33** de **34**, **1** pulada.
- `test:gate`: **233**/**233**.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos. `test:bff-integration` roda **52** arquivos e **424** testes (baseline **51**/**417**), inclusive os **7** do §9.1. `test:scheduling-integration` roda **16**/**124** (inalterado). `rehearse:goal033-authenticated-ui`: **75** expected, **0** unexpected, **0** flaky, **0** retentativas (inalterado; o Goal não toca as nove rotas autenticadas).
- `git status` lista só os **32** arquivos declarados.
- Nenhuma suíte encolheu. Os 8 testes tirados de `goal014-auth.test.tsx` estão mapeados, e nenhum foi pulado.

## Observações registradas, sem mudar a decisão

1. **Evidência feita em partes.** Rodadas 2, 3 e 4 corrigiram código e testes, mas deixaram de fora, repetidas vezes, as partes de evidência dos blockers (vermelho da baseline, controles, mapa de testes, numeração das rodadas). Custou duas rodadas e a troca de perfil do Developer.
2. **`validate:integration` pulado pelo harness na rodada 2.** O WU-12 não rodou nessa rodada, e o 35/35 daquela rodada foi só declarado. A execução da rodada 5 foi conferida.
3. **Divergência com o vault e o protótipo.** O produto usa link; a pergunta 470 do vault e o protótipo descrevem código de 6 dígitos. D-082 registra a divergência e não a resolve.
4. **Conta anterior ao Goal fica sem nome.** A Home cumprimenta sem nome, e não há tela para editar o nome depois do cadastro ([DATA_MIGRATION §21](../DATA_MIGRATION.md)).

## O que o aceite não prova

- Que a recuperação entrega e-mail a alguém: não há provider (U-03). Todo teste usa o dublê de entrega que grava `resetUrl`.
- Que a recuperação por link, em vez do código de 6 dígitos, é a que o produto quer. A conferência humana do §11 do Goal **não foi feita**.
- Que `/nova-senha` e os estados internos de erro e sucesso das telas de entrada cumprem largura, toque, contraste, foco e movimento. O gate renderizado mede `/login`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada` e `/link-expirado`, só no estado inicial.
- Que as telas batem com o protótipo aprovado (conferência humana, Goal068).

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §43](../FINAL_AUDIT.md)).
