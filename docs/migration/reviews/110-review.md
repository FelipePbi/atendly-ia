# Review formal — Goal 110

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, conforme o [Goal110](../goals/110-as-credenciais-derivadas-passam-a-avenly-sem-derrubar-sessao-nem-chamada-entre-servicos.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

As credenciais derivadas passam a Avenly, sem derrubar sessão nem chamada entre serviços. O prefixo do HMAC das credenciais internas passa de `atendly:internal:v1` a `avenly:internal:v1` nos três apps, e `deriveInternalToken` mantém a assinatura. O BFF e a IA apresentam só o rótulo novo. A IA e o Scheduling, que verificam, aceitam o token derivado com o rótulo novo ou com o antigo (`LEGACY_INTERNAL_DERIVATION_PREFIX`, um ponto por app), só para o mesmo chamador, a mesma audiência e o mesmo uso, comparando todos os candidatos em tempo constante. O token de CSRF do BFF passa a derivar com `avenly:csrf:`. `sessionCsrfTokenFor` devolve o token cujo hash a sessão guarda: o novo, senão o de `atendly:csrf:` (`LEGACY_CSRF_LABEL`). Nenhuma linha de `UserSession` é reescrita, e nenhuma leitura comum emite `Set-Cookie`. Segredo raiz, nomes de variável, regra de `401` e `403`, escopos, cookies, cabeçalho de CSRF e JWT não mudaram. Decisão: [D-121](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `2d1410cc0b28de67592c607f60e810c43df64187` (Goal109). Base imediata da implementação: `23dd6e72774836ef135a205915d26efe1543e1b2`, HEAD da worktree `.ai-worktrees/goal-110` (branch `ai-loop/goal-110`), sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **12 arquivos** (8 modificados e 4 novos), hash do diff `b623aef5b5dfe8cdb240f7e171d7410e8d3481d67ba2db51c602e09af2e141bd`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção, cinco arquivos: `apps/bff/src/lib/internal-credentials.ts`, `apps/bff/src/lib/session.ts`, `apps/bff/src/lib/auth.ts`, `apps/ai-orchestrator/src/lib/internal-credentials.ts` e `apps/scheduling-service/src/shared/auth/internal-credentials.ts`. `internal-auth.ts` do Scheduling, `client.ts` e `internal/routes.ts` da IA, `csrf.ts` e `app.ts` do BFF não mudaram.
  - Provas novas, quatro arquivos `goal110-…` com **28** testes: `apps/scheduling-service/tests/unit/goal110-internal-credential-label.test.ts` (9, prova 1), `apps/ai-orchestrator/tests/security/goal110-internal-credential-label.test.ts` (11, prova 2), `apps/bff/tests/goal110-internal-credential-label.test.ts` (5, prova 3) e `apps/bff/tests/goal110-csrf-label.integration.test.ts` (3, prova 4).
  - Documentos: `docs/migration/DECISIONS.md` (D-121), `CURRENT_STATE.md` e `VALIDATION_GATE.md`, só por acréscimo.
- sha256 (oito primeiros caracteres) dos nove arquivos de código e de teste, iguais da rodada 1 à rodada 3: produção `4579fe17`, `aa6d5b51`, `570c818a`, `907ad52a` e `8d6562b0`; provas `a51f69b8`, `2af81d4d`, `f78f3eb0` e `97e51d3e`.
- Nenhum teste existente foi alterado, removido ou pulado. Nenhum arquivo novo em `apps/bff/src` ou `apps/ai-orchestrator/src`, então a contagem da `DIAG-001` (210) não muda. Nenhum arquivo de `apps/frontend/`, `e2e/`, `scripts/`, `docs/design-reference/`, migration, `schema.prisma`, `render.yaml`, `.github/`, `.env.example` ou configuração de gate mudou.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 2 blockers, só de documento.** O código de produção foi aceito no mérito. Os blockers, ambos em D-121 (d) e no item de deploy do delta do Goal110 em CURRENT_STATE: (1) a recomendação de publicar o Goal109 e o Goal110 em dois deploys contradizia a escolha (d) do Goal (o deploy que levar o 109 leva também este Goal) e D-120, que descartou o deploy em fases; (2) faltavam as janelas que sobram em cada ordem possível e qual janela cada ordem troca por qual.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker, só de documento.** Os dois blockers da rodada 1 foram resolvidos: um deploy só, e as ordens A, B e C com as suas janelas. Faltava na Ordem C a janela de leitura do frontend antigo contra o BFF novo: o contrato anterior ao Goal109 tem `calendarSourceSchema = z.enum(["ATENDLY"])`, o `BffHttpClient` antigo valida cada resposta com `safeParse`, e o BFF novo devolve só `AVENLY`.
3. **Rodada 3 — `ACCEPTED`, 0 blockers.** A Ordem C passou a declarar as duas janelas do frontend antigo contra o BFF novo (sessão sem CSRF e leitura de `calendar.source`), em D-121 (d) e no delta do Goal110. A Ordem A passou a citar essas duas janelas como evitadas, o que é correto porque o frontend é trocado primeiro. Contagem de janelas: A tem 5, B tem 4 e C tem 5.

As correções das rodadas 2 e 3 rodaram como unidade FIX-001, com o perfil `SONNET_MEDIUM`. Nenhum arquivo fora de `docs/` mudou depois da rodada 1.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal110 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal110) e na "Prova" de D-121.

- **Código, conferido pelo Tech Lead nas três rodadas.** Na IA, `acceptedTokens(use)` devolve só a credencial explícita quando ela existe, nada quando não há segredo raiz, e `[novo, legado]` para o chamador `bff` e a audiência `ai-orchestrator`. No Scheduling, `expectedTokens(client)` faz o mesmo por chamador. `matchesAny` passa por todos os candidatos em `timingSafeEqual`, sem curto-circuito. A ordem de checagem de `authorizeInternalRequest` (audiência antes do token) e os códigos `401` e `403` não mudaram. O BFF não guarda o rótulo antigo. `sessionCsrfTokenFor` só lê, e nada reescreve `UserSession`. O chamador não tenta de novo com o rótulo antigo depois de um `401`.
- **Provas.** O Tech Lead reexecutou as provas 1 a 3 na rodada 1 (9/9, 11/11 e 5/5; 24 com `internal-credentials.test.ts` da IA) e de novo na rodada 3, com as mesmas contagens. A prova 4 (3 testes, contra PostgreSQL) não foi reexecutada pelo Tech Lead. Contra a baseline, medido pelo Developer, **15** dos 28 testes novos reprovam e **13** passam; os 13 protegem comportamento de hoje e estão nomeados no VALIDATION_GATE. O Tech Lead conferiu que esse vermelho é coerente com a ordem real de `authorizeInternalRequest`.
- **Controles negativos do §5**, rodados pelo Developer na WU-08, depois da última edição de código, com a restauração conferida por sha256. Os seis reprovam com o defeito e passam sem ele: 3 falhas de 9, 3 de 11, 4 de 11, 5 de 5, 1 de 3 e 1 de 3. O Tech Lead os aceitou pelo registro, sem nova corrida.
- **Inventário do §4.** (A) tem as mesmas **144** linhas do Goal109, conferidas contra `2d1410c`. (B) tem **40** linhas: 12 em (ii), 1 em (v), 3 em (vi) e 24 em (vii). A união tem **172** linhas distintas. Na rodada 1, o Tech Lead refez os dois `git grep` e achou as mesmas linhas.
- **Janelas de deploy, conferidas contra o código.** Ordem A: W6, W7 e as janelas de D-120 (h) estão certas, e a chamada da IA ao Scheduling não tem janela. Ordem B: o Scheduling novo aceita `"ATENDLY"` (`internal-api/routes.ts`), e a ordem tem uma janela a menos. Ordem C: o Tech Lead conferiu `git show 2d1410c~1` em `packages/public-api-contract/src/schemas.ts:3` e `apps/frontend/src/data/http/BffHttpClient.ts:226`.
- **Gates do IA Loop na rodada 1,** reaproveitados nas rodadas 2 e 3 sobre código idêntico, todos com exit 0: typecheck de `apps/bff`, `apps/ai-orchestrator` e `apps/scheduling-service` (WU-03 a WU-05), `validate:core` (WU-06, 129016 ms, 17 passos, 15 passaram e 2 pulados por desenho) e `validate:integration` (WU-07, 716226 ms, 36 de 36 passos, gate autenticado com **275** passaram e 0 retentativas). Na rodada 3, só `git diff --check` (WU-09) rodou de novo, com exit 0. Recontagem da WU-08: `test:gate` **242**; frontend **149** arquivos e **1840** testes; IA sem banco **1199** passaram (eram 1188); Scheduling unitários **543** (eram 534); integração do BFF **515** em 68 arquivos (eram 507 em 66), contra um PostgreSQL de teste local.

## Aceito sem prova completa

1. **O deploy real no Render e a duração das janelas W6, W7 e as de D-120 (h).** Nada nesta árvore atravessa o Render. As janelas ficam declaradas em D-121 (d), sem segundo deploy e sem deploy em fases, porque ainda não há usuário real ([FINAL_AUDIT](../FINAL_AUDIT.md) §7).
2. **Uma sessão aberta antes do deploy, num navegador real.** A prova 4 usa requisição HTTP contra o BFF e um PostgreSQL de teste.
3. **O ambiente real de deploy.** Só se sabe pelo `render.yaml`, que declara `INTERNAL_SERVICE_TOKEN` e nenhuma credencial explícita por uso. A credencial explícita é provada só com valores de teste.
4. **O vermelho da baseline, os controles do §5 e a prova 4** vêm do Developer. O Tech Lead reexecutou só as provas 1 a 3.
5. **A prova 4 dentro de `validate:integration`.** A contagem do BFF (515 em 68 arquivos) é da recontagem da WU-08, contra um cluster temporário em `127.0.0.1:5558`.

## Observações registradas, sem mudar a decisão

1. **W6 alcança também o expurgo de conta.** D-121 (d) diz que, na W6, as telas de login e conta não falham. O sweep de expurgo de `apps/bff/src/modules/account/purge.ts` chama a IA e o Scheduling por `AiOrchestratorClient` e `SchedulingClient`, então ele também recebe `401` enquanto o verificador daquele serviço for antigo. A observação veio da rodada 2 e não é blocker: ainda não há usuário real, e a janela continua declarada, não medida.
2. **Variante do controle 3.** O Goal pede "sem o uso (ou sem a audiência)". A tabela traz "sem o uso" (4 falhas de 11). A variante "sem a audiência", medida à parte, reprova 3 de 11. As duas bastam.
3. **Ordem B como alternativa.** A ordem B tem uma janela a menos que a A, e D-121 a registra como a alternativa se a pessoa preferir. A ordem A fica recomendada porque é a de D-120 (h), já aceita, e a B reabre a janela de leitura que D-120 (h) escolheu evitar.
4. **Pontos de julgamento do inventário (B).** As 24 linhas de (vii) ficam como propostas. Das duas constantes gravadas no banco, `ACTIVATION_TEST_CONTACT_NAME` e `ACTIVATION_TEST_CLIENT_NAME`, nenhuma é usada como chave de consulta, então nenhuma volta ao Tech Lead. Para o 102, a proposta continua: trocar (vii), manter (i), (iii) e (v), e tirar (ii) e (vi) só ao contrair a compatibilidade.
5. **Este review não estava em disco durante as rodadas.** Os blockers foram escritos autocontidos no resultado de cada rodada.

## O que o aceite não prova

- O deploy no Render, a ordem frontend, BFF, Scheduling e IA na prática e a duração das janelas.
- Uma sessão real emitida antes do deploy, num navegador.
- Credenciais explícitas reais do ambiente de deploy.
- A troca de nome em texto, identificador, arquivo, pacote e documentação, que continua do 102.
- A remoção dos rótulos antigos, que só vem com motivo medido e junto com a contração de D-120 (D-121, "Revisar se" (2)).
