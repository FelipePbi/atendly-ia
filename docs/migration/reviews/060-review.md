# Review formal — Goal 060

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal060](../goals/060-importacao-com-e-mail-e-senha.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–059 e 070) foi reaberto, reavaliado ou revertido. **Quatro rodadas**: as rodadas 1, 2 e 3 terminaram `CHANGES_REQUIRED`, com 4, 3 e 3 blockers; a rodada 4 terminou com zero.

O Goal corrige **QA IM-01** (ALTA) e **QA IM-02** (MÉDIA) da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e aplica a pergunta 894 do vault. A conexão com a Minha Agenda passa a pedir só e-mail e senha. Endereço e cliente OAuth vêm da configuração do sistema. O profissional é descoberto, e conta com zero ou mais de um profissional é recusada. O erro diz a causa por classe, e o status da origem nunca vira o nosso. A credencial é apagada na transação que conclui a importação ([D-077](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `61beaa5d907fd1cc4328a800140abc314b131bdc` (fechamento do Goal070). Base imediata da implementação: `037a041346e2d5b3057fd1495eb74ed2a9ae1923`, HEAD da worktree `.ai-worktrees/goal-060`, inalterado nas quatro rodadas. O commit `037a041` é só documental (fechamento do 070 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **28 arquivos**, hash do diff `8643700ed0114a54f9c608133aab9ea73a86e3a668b25c464999d6eed169593c`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e quatro arquivos rastreados**, por `git diff --numstat 037a041`:
  - `apps/scheduling-service/`: `.env.example` (+6/−0), `src/config/env.ts` (+8/−0), `src/modules/integrations/minha-agenda/client.ts` (+80/−22), `config.ts` (+102/−18), `types.ts` (+11/−0), `src/modules/internal-api/routes.ts` (+39/−36) e `src/modules/migrations/import-completion-service.ts` (+13/−0).
  - Testes de `apps/scheduling-service/`: `tests/integration/support/reset-tenant.ts` (+1/−0), `tests/unit/import-completion-service.test.ts` (+5/−1), `import-origin-connection.test.ts` (+42/−60), `minha-agenda-client.test.ts` (+0/−4), `minha-agenda-import-snapshot.test.ts` (+0/−4) e `support/test-env.ts` (+11/−0, valor fictício do cliente OAuth).
  - `apps/bff/`: `PUBLIC_API_V1.md` (+19/−0) e `src/modules/calendar/routes.ts` (+38/−20).
  - `apps/frontend/`: `src/data/services/BffCalendarService.ts` (+2/−15), `src/features/imports/ConnectSourceScreen.tsx` (+61/−135), `tests/goal020-imports-entry.test.tsx` (+19/−43) e `tests/goal020-shell-invariant.test.tsx` (+3/−10).
  - `render.yaml` (+6/−0, `sync: false`, sem valor).
  - Os quatro documentos de `docs/migration/`, por acréscimo puro no diff aceito: `CURRENT_STATE.md` +128, `FINAL_AUDIT.md` +91, `DECISIONS.md` +31 e `VALIDATION_GATE.md` +24.
- **Quatro arquivos novos**: `apps/scheduling-service/tests/unit/goal060-minha-agenda-connection.test.ts` (**379** linhas, **19** testes, §7.1 a §7.4), `apps/scheduling-service/tests/integration/goal060-import-completion-credential.test.ts` (**220** linhas, **5** testes contra PostgreSQL real, §7.5), `apps/bff/tests/goal060-integration-connect.test.ts` (**260** linhas, **6** testes de integração, §7.6) e `apps/frontend/tests/goal060-connect-source.test.tsx` (**228** linhas, **14** testes, §7.7).
- Nenhum arquivo foi tocado em `packages/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `tools/ia-loop/`, migrations ou schema Prisma. Análise, execução, preview, conflitos, lease e retomada da importação não mudaram; `SYSTEM_TIMEOUT_MS` fica em `10_000`, igual ao default anterior. `QA_LOCAL_REVIEW.md` não foi editado.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

O backend estava correto e bem provado desde a rodada 1, e não mudou depois dela:

- Schema estrito `{ email, password }` nas duas rotas; configuração do sistema por ambiente, com `MINHA_AGENDA_NOT_CONFIGURED` 503 antes de qualquer `fetch` ou escrita.
- Descoberta por `/employees/professionals?includeDeleted=false`, com a regra zero/um/mais de um. O status da origem vai só em `details.originStatus`, nunca como 401/403, e a nova tentativa usa `originStatus`.
- Linha antiga continua legível com endereço e Basic do sistema; `reconnect` grava `ERROR` como antes.
- `completeOnce` desfaz `connectionId` e apaga a `IntegrationConnection` na mesma transação, com filtro por tenant, pelo padrão já documentado no schema para FK `Restrict`.
- No BFF, o override local de status cobre só `AUTH_FAILED` e `NOT_CONFIGURED`. As chaves novas estão em `env.ts`, `.env.example` e `render.yaml`, sem segredo.

Os quatro blockers:

1. **§5, textos de erro fora do especificado** em `ConnectSourceScreen.tsx`. (a) `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND` e `MINHA_AGENDA_MULTIPLE_PROFESSIONALS` tinham o mesmo texto. (b) O texto de origem indisponível não dizia que nada foi salvo. (c) O texto de falha nossa era quase igual ao genérico de IM-02 e não dizia que a falha é da Atendly.
2. **§5, rótulo** `Senha` no lugar de `Senha do Minha Agenda`.
3. **§7.7, termos proibidos.** O teste jsdom não verificava "endereço", "API", "HTTP" como palavra solta nem código cru (`MINHA_AGENDA_`, `INTEGRATION_CONFIGURATION_INVALID`, `UPSTREAM_ERROR`) nos 9 `upstreamCode`.
4. **Afirmação falsa em `PUBLIC_API_V1.md`.** O documento dizia que um novo `connect` depois da conclusão é recusado pelo direito já consumido. A rota de `connect` não consulta esse direito e grava a credencial de novo. Só `POST /v1/calendar/imports` recusa. Pedido: corrigir a frase e declarar o resíduo como limite em D-077 e FINAL_AUDIT §38, sem mudar a rota.

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

Corrigidos: 1(a), com textos distintos e o de MULTIPLE dizendo que a Atendly importa um profissional só; o blocker 2, com o rótulo e as buscas por rótulo nos três testes; o blocker 3, com o regex ampliado nos 9 códigos; e a frase de `PUBLIC_API_V1.md`. Continuavam abertos:

1. 1(b): o texto de origem indisponível ainda não dizia que nada foi salvo.
2. 1(c): o texto de falha nossa ainda era o genérico. Pedido também: rodar de novo o controle negativo 2 do §9 e colar a saída nova.
3. Blocker 4, em parte: o limite de reconexão depois da conclusão não estava em D-077 nem em FINAL_AUDIT §38, e as Consequências da D-077 diziam que "a credencial nunca mais existe depois de uma importação concluída".

## Rodada 3 — CHANGES_REQUIRED (3 blockers)

O código ficou correto: `ConnectSourceScreen.tsx:68-75` diz que a Minha Agenda não respondeu, que nada foi salvo e que vale tentar de novo; e diz que a falha nossa é da Atendly, não dos dados informados. O teste compara o texto exato por caso. Continuavam abertos três itens de documentação:

1. A frase falsa das Consequências da D-077 contradizia o limite declarado na própria decisão.
2. FINAL_AUDIT §38 não registrava o limite de reconexão.
3. O controle negativo 2 não tinha sido rodado de novo: §38 item 2 mostrava um texto esperado que não existia mais no código.

## Rodada 4 — ACCEPTED (0 blockers)

A rodada só mudou `DECISIONS.md` e `FINAL_AUDIT.md` (FIX-001). O código, julgado correto na rodada 3, não mudou.

- **B1:** as Consequências da D-077 dizem que a credencial é apagada na conclusão e volta a existir se o negócio reconectar depois, com remissão aos Limites.
- **B2:** FINAL_AUDIT §38 registra o limite em "O que mudou" e em "O que esta seção não prova", com o mesmo texto da D-077: as duas rotas de `connect` gravam de novo, e `POST /v1/calendar/imports` recusa com `409 IMPORT_ALREADY_COMPLETED`. `PUBLIC_API_V1.md` e `CURRENT_STATE` dizem o mesmo. Nenhum documento vigente mantém "nunca mais existe" nem o texto antigo "não pode ser importada agora".
- **B3:** o controle 2 mostra os textos atuais de `AUTH_FAILED` e `PROFESSIONAL_NOT_FOUND` e **9** failed | **5** passed. A saída é coerente com o código: com `switch (error.code)`, `UPSTREAM_ERROR` não casa com nenhum `case`, e os 9 casos do `test.each` caem no genérico. O controle não foi reaplicado pelo revisor, porque a revisão é só leitura; a suíte `goal060-connect-source` passa **14**/**14**, e o diff de `ConnectSourceScreen.tsx` segue +61/−135, sem resíduo da reversão.

Prova conferida na árvore final (unidades determinísticas da rodada 4, WU-06 a WU-19, todas exit 0):

- `typecheck` e `lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`: exit 0 nos seis.
- Testes dirigidos `goal060`: `apps/scheduling-service` **19** passando, **5** pulados (o arquivo de integração, sem banco nesta unidade); `apps/bff` **6** pulados (integração, sem banco nesta unidade); `apps/frontend` **14**/**14**.
- `test:gate`: **233**/**233** (baseline **233**; o Goal não toca `scripts/tests/`).
- `git diff --check`: exit 0.
- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos, inclusive `test:bff-integration` (onde rodam os 6 testes do §7.6) e `test:scheduling-integration` (onde roda o §7.5). Nele, `rehearse:goal033-authenticated-ui` roda **65** testes, todos passando, com **0** retentativas.
- A suíte completa de `apps/frontend` (**77** arquivos e **718** testes; baseline 76/704) e a unitária de `apps/scheduling-service` (**30** arquivos, **410** testes) têm as contagens da Work Unit de documentação (WU-05) registradas em CURRENT_STATE, VALIDATION_GATE e FINAL_AUDIT §38. Nenhuma suíte encolheu.
- `final-production-audit`: **34** checks, **33** `passed`, **1** `skipped` (`production_health`), **0** `failed`, com a paridade de `env.ts`, `.env.example` e `render.yaml` passando para as duas chaves novas.
- Os seis controles negativos do §9 têm saída colada em FINAL_AUDIT §38.

### Observações não bloqueantes

1. **`apps/bff/PUBLIC_API_V1.md:76` ficou defasado.** A seção do Goal010 ainda diz que credencial que se declara de escrita é recusada com `409 INTEGRATION_WRITES_NOT_SUPPORTED`. Esse código não existe mais na árvore: com o schema estrito, `enableWrites` a mais é `VALIDATION_ERROR` (400). As seções novas do Goal060 no mesmo arquivo estão corretas. O arquivo fica fora do escopo de escrita deste fechamento; a correção fica para o próximo Goal que tocar a seção de integração.
2. **O teste antigo de `enableWrites` foi substituído, não perdido.** `import-origin-connection.test.ts` perdeu o caso "recusa guardar credencial de origem que se declara de escrita" (409). O comportamento equivalente é provado em `goal060-minha-agenda-connection.test.ts` §7.1, "corpo com campo antigo (enableWrites a mais) é recusado com VALIDATION_ERROR, sem fetch e sem escrita", e o controle 5 reprova esse caso.
3. **Vermelho da baseline dos testes `goal060` não foi colado.** A prova de que os testes pegam o defeito vem dos seis controles negativos, não de uma execução contra `037a041`.
4. **Reconexão depois da conclusão grava a credencial de novo** (limite declarado da D-077). O frontend não oferece esse caminho, e nenhuma importação nova é possível com ela. Impedir a reconexão é decisão de produto.
5. **O BFF preserva localmente 422 e 503** (`withMinhaAgendaUpstreamStatus`) só para `AUTH_FAILED` e `NOT_CONFIGURED`. Os demais códigos seguem o repasse de status existente do cliente interno.
6. **As observações abertas herdadas continuam abertas**: as do [review070](070-review.md) e as que ele herdou.

### O que este aceite não cobre

- Não prova login e descoberta do profissional contra a Minha Agenda real. A conferência humana do §8 (U-05) **não foi feita**.
- Não prova que o caminho e a forma de `/employees/professionals` batem com a API real; vêm do mapa histórico do portal (commit `1e22dff`).
- Não prova que análise e execução terminam para uma conta real (Goal061).
- Não prova fidelidade visual da tela ao protótipo aprovado (conferência humana, Goal069).
- Nenhum achado A-01…A-24 foi corrigido ou reclassificado. A auditoria segue com **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §38](../FINAL_AUDIT.md)).

### Correções de registro feitas no fechamento

- **D-077 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review, a contagem de rodadas e uma nota de fechamento. A decisão não mudou.
- **FINAL_AUDIT §38** passa a citar D-077 como `ACCEPTED` (dizia "review060 ainda não escrito") e ganha uma nota com as contagens de `validate:core`, `validate:ui` e `validate:integration` da rodada 4, que a seção deixava para WU-06 a WU-19.
- **CURRENT_STATE** (delta Goal060) passa a citar D-077 como `ACCEPTED` e ganha as contagens dos passos agregadores. O FATO do Goal010 que dizia que `connect` recusa `enableWrites` com `409 INTEGRATION_WRITES_NOT_SUPPORTED` ganha nota de superação.
- **VALIDATION_GATE** (seção Goal060) ganha as contagens dos passos agregadores, e o link para o delta de CURRENT_STATE acompanha o título atualizado.
- **GAP_ANALYSIS** (G-10) e **DATA_MIGRATION** (§3) ganham nota do Goal060: `enableWrites` agora é recusado pelo schema estrito, a configuração gravada fica só `{ employeeId }` e a credencial é apagada na conclusão.
- **O status do documento do Goal060 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
