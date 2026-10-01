# Review formal — Goal 082

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, conforme o [Goal082](../goals/082-a-minha-agenda-conecta-so-com-e-mail-e-senha-e-diz-de-quem-e-a-falha.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–081, 083 e 084) foi reaberto, reavaliado ou revertido. **Uma rodada**, sem blocker.

O Goal fecha **R-02** do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080) **no que o repositório prova**, aplicando a **U-12 revista**. A pessoa informa só e-mail e senha da Minha Agenda. A identificação do app do portal continua configuração interna do servidor (`MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`), fornecida pela operação e nunca pedida à pessoa. Antes, toda recusa 400 ou 401 do `/oauth/token` dizia "Confira o e-mail e a senha", e a operação não via a falta nem a recusa da variável. Agora a falha tem dono: a recusa da senha da pessoa (`invalid_grant`, ou 400) continua `MINHA_AGENDA_AUTH_FAILED` 422; o 401 sem `invalid_grant` vira `MINHA_AGENDA_CLIENT_REJECTED` 503, falha da Atendly; e a operação vê a falta e a recusa no log, sem o valor. Decisão: [D-100](../DECISIONS.md), que muda o item 4 de D-077 no 401 do login.

## Escopo e identidade do diff

- Baseline aceita vigente: `20b90554cdf7a45ac1f3c434abc9a135e010774a` (Goal084). Base imediata da implementação: `70157b5d65b92524313b7a8518e133abfb77c940`, HEAD da worktree `.ai-worktrees/goal-082`, inalterado na rodada. Entre `20b9055` e `70157b5` só há `docs/`: a marcação do Goal084 como ACCEPTED e o fechamento dele com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **17 arquivos**, hash do diff `117989848125c60663e68760917802c090e286c8c7bec035fb9b9b395684e4a4`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **14 arquivos rastreados**, por `git diff --numstat 70157b5` no snapshot aceito:
  - Produção, no Scheduling: `src/modules/integrations/minha-agenda/client.ts` (+31/−7), `src/app/build-app.ts` (+45/−2), e só comentários em `src/modules/integrations/minha-agenda/config.ts` (+3/−2) e `src/config/env.ts` (+6/−3). No BFF: `src/modules/calendar/routes.ts` (+2/−1). No frontend: `src/features/imports/ConnectSourceScreen.tsx` (+1).
  - Teste existente reescrito, sem teste removido nem pulado: `apps/scheduling-service/tests/unit/goal060-minha-agenda-connection.test.ts` (+17/−9). O `it.each([400, 401])` virou cinco linhas da tabela de (a), e o motivo está em [FINAL_AUDIT §61](../FINAL_AUDIT.md).
  - Documentos de app: `apps/scheduling-service/.env.example` (+11/−3, a linha da variável continua vazia), `apps/scheduling-service/README.md` (+18, seção "Operação: importação da Minha Agenda") e `apps/bff/PUBLIC_API_V1.md` (+3/−3, `MINHA_AGENDA_CLIENT_REJECTED` em "Falha nossa", com 503).
  - Documentos do §8: `CURRENT_STATE.md` (+74), `DECISIONS.md` (+32/−1, D-100 e a nota de substituição no item 4 de D-077), `FINAL_AUDIT.md` (+57, §61) e `VALIDATION_GATE.md` (+62).
- **Três arquivos novos**: `apps/scheduling-service/tests/unit/goal082-minha-agenda-auth-classes.test.ts` (**395** linhas, **23** testes, provas 1 a 4), `apps/bff/tests/goal082-integration-connect-client-rejected.test.ts` (**104** linhas, **3** testes, prova 5) e `apps/frontend/tests/goal082-connect-source-client-rejected.test.tsx` (**77** linhas, **3** testes, prova 6).
- Nenhuma rota, migration, variável de ambiente nova, `render.yaml`, `/health` ou campo de contrato mudou, e o conjunto fechado de `lastError` é o mesmo. O único acréscimo de contrato é o código `MINHA_AGENDA_CLIENT_REJECTED`. `modules/migrations/import-lease.ts` não foi editado. Nada em `e2e/`, `vitest.config.*`, `playwright.config.*`, `scripts/` ou `tools/ia-loop/`. `QA_LOCAL_REVIEW.md`, o vault e `docs/design-reference/` não foram editados. Nenhum arquivo recebe o valor da variável.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blocker.** O Tech Lead conferiu no código:
   - §1/(a): `getAccessToken` lê o corpo de erro uma vez. `readOAuthErrorCode` faz `JSON.parse` dentro de `try` e compara só o campo `error`, quando é texto, com `trim` e sem diferença de caixa. 400, ou 401 com `invalid_grant`, dá `MINHA_AGENDA_AUTH_FAILED` 422. Qualquer outro 401 (corpo vazio, não JSON, `error` que não é texto ou desconhecido) dá `MINHA_AGENDA_CLIENT_REJECTED` 503, com `details` só `{ originStatus }` e mensagem fixa em inglês. 403, 429 e 5xx continuam `MINHA_AGENDA_HTTP_ERROR` 502.
   - §2/(b): `buildApp` emite um `warn` por instância que nomeia a variável quando ela falta. O `setErrorHandler` registra um `error` com `errorCode`, `originStatus` e `reqId` para `MINHA_AGENDA_NOT_CONFIGURED` e `MINHA_AGENDA_CLIENT_REJECTED` (`OPERATOR_VISIBLE_REFUSALS`), e a resposta mantém a forma. `importWorkOriginCode` põe `originCode` no log do trabalho em segundo plano.
   - (d): `classifyImportWorkCode` já manda código desconhecido, direto ou como `cause`, para `IMPORT_INTERNAL_ERROR`. Por isso `import-lease.ts` ficou intocado, como o Goal permite, e a prova 4 cobre o caso.
   - §3/(c): o BFF repassa `MINHA_AGENDA_CLIENT_REJECTED` com 503 (`MINHA_AGENDA_UPSTREAM_STATUS`), e `connectErrorMessage` dá ao código novo o texto de `MINHA_AGENDA_NOT_CONFIGURED`, sem citar senha nem e-mail.
   - §4: `.env.example`, o README do Scheduling e `PUBLIC_API_V1.md` atendem o texto pedido.
   - §5: o `it.each` do goal060 foi reescrito em cinco linhas, sem remoção. O teste "nunca 401/403" ficou intacto.
   - §6: as provas 1 a 6 existem, com sentinela em `error_description` e `expectNoSecrets` sobre a resposta e o log.
   - §7: os cinco controles foram rodados depois da execução final, com hashes. A primeira tentativa do controle 3 não compilou, foi declarada e foi refeita.
   - §8: D-100 escrita com (a) a (e), o limite declarado, `/health` e "Revisar se". A nota de substituição no item 4 de D-077 segue o precedente do Goal084. FINAL_AUDIT §61 traz o veredito 0/7/5. CURRENT_STATE e VALIDATION_GATE trazem as contagens finais e declaram o §9 como não feito.

## Evidência final aceita

A execução final descrita nos documentos é a da **WU-16 da rodada 1**, sobre a árvore entregue, sem edição de código depois dela, toda exit 0 ([FINAL_AUDIT §61](../FINAL_AUDIT.md)). `validate:integration` rodou contra um PostgreSQL descartável em `127.0.0.1:55743/atendly_bff_test`.

- `validate:core` **17** passos (**15** `passed`, **2** `skipped`: `test:bff` e `test:health-worker`).
- `test:gate` **233**/**233**.
- `validate:ui` **169** `passed`, **21** `skipped`, **0** `flaky` (`startTime` `2026-10-01T03:05:23.264Z`, da WU-14).
- `validate:integration` **36**/**36** passos, com o gate autenticado em **175** testes, **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime` `2026-10-01T03:33:36.737Z`). Duas execuções anteriores do gate tiveram **1** `flaky` cada, por falha de ambiente fora da tela de conexão: a da WU-15 (`2026-10-01T03:09:15.119Z`) e a primeira da WU-16 (`2026-10-01T03:24:40.433Z`). A terceira execução passou sem retentativa e sem tocar configuração.
- Suítes: `test:scheduling-service` **38**/**528** (referência **37**/**502**; **+23** do arquivo novo e **+3** no goal060), `test:frontend` **128**/**1337** (referência **127**/**1334**), `test:bff-integration` **63**/**474** (referência **62**/**471**) e `test:ai-orchestrator` **1186** passando e **98** `skipped` de **1284**, sem mudança.
- Cinco controles negativos do §7, pela WU-16, depois da execução final, por edição real revertida e conferida por `sha256` (**13** arquivos, **0** divergências): controle 1 (o 401 volta a ser `MINHA_AGENDA_AUTH_FAILED`) deixa `goal082-minha-agenda-auth-classes.test.ts` em `9 failed | 14 passed (23)`; controle 2 (o `error` deixa de ser lido) em `1 failed | 22 passed (23)`; controle 3 (o log inclui o valor da variável) em `9 failed | 14 passed (23)`; controle 4 (o código sai de `MINHA_AGENDA_UPSTREAM_STATUS`) deixa o teste do BFF em `1 failed | 2 passed (3)`; controle 5 (o `case` sai de `connectErrorMessage`) deixa o teste da tela em `1 failed | 2 passed (3)`. Todos passam restaurados.
- O vermelho da baseline das provas 1, 2, 5 e 6 é entrega das WU-01 e WU-02, e não está colado em §61. A recontagem da baseline (37/502, 127/1334 e o gate com 233) está no resultado da WU-01.
- Os 14 gates declarados do IA Loop deram exit 0.

Evidência conferida pelo Tech Lead:

- Testes do Scheduling `goal082-minha-agenda-auth-classes` e `goal060-minha-agenda-connection`: **2** arquivos, **45**/**45** passando.
- Testes de frontend `goal082`: **3**/**3** passando.
- `git diff --check` limpo; `git status` só com os 17 arquivos autorizados, com `e2e-results/` ignorado.
- O Tech Lead não reexecutou os cinco controles, o vermelho da baseline, o teste do BFF contra PostgreSQL nem os gates renderizados. Os controles vêm da WU-16, o vermelho das WU-01 e WU-02, e as contagens de `validate:ui` e `validate:integration` dos `results.json` citados.

## Observações registradas, sem mudar a decisão

1. **Um 400 com `error` `invalid_client` vira `MINHA_AGENDA_AUTH_FAILED`.** É coerente com a tabela de (a), que só dá à operação o 401. Se o portal real responder a identificação do app recusada com 400, a pessoa ouve que a senha está errada; só a conta real decide.
2. **Perfil de execução.** O Goal declarava `OPUS_MEDIUM`, e a execução usou Sonnet high. Sem efeito no resultado.
3. **O limite declarado de (a) depende da conta real.** Se o portal responder senha errada com 401 sem `invalid_grant`, a pessoa ouve que a importação está indisponível.

## O que o aceite não prova

- O formato real da resposta do portal à senha errada e à identificação do app recusada. A conferência humana do §9 **não foi feita**: conectar com e-mail e senha certos na conta de teste real e ver a importação seguir; conectar com a senha errada e ver "Confira o e-mail e a senha"; subir o Scheduling sem a variável, ou com valor errado, e ver a tela e o log.
- Que o portal aceita o valor que a operação fornecer em `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`. O repositório não guarda o valor, e o agente não o extrai.
- Que a integração não oficial continua funcionando se o portal mudar. O risco de termos de uso é de negócio, assumido por Felipe na U-12 revista.
- R-06 e R-08 a R-10 do re-teste local (Goal085).

Veredito do FINAL_AUDIT: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem mudança em relação a §60. R-02 fica corrigido no que o repositório prova. Ele é achado do re-teste local, fora da enumeração A-01…A-24 ([FINAL_AUDIT §61](../FINAL_AUDIT.md)).
