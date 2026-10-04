# Review formal — Goal 062

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal062](../goals/062-a-importacao-traz-a-base-inteira-e-respeita-a-agenda-existente.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–061 e 070) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 6 blockers; a rodada 2 terminou com zero.

O Goal aplica **U-08** e corrige **QA IM-06** (ALTA), **QA IM-09** (ALTA), **QA IM-10** (MÉDIA), **QA CL-04** (MÉDIA), **QA IM-11** (BAIXA) e **QA CL-05** (BAIXA), este só na busca, da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. A categoria de clientes lê a listagem da origem e recua com limitação declarada quando a forma não bate. A disponibilidade importada troca a vigente só por decisão de item e nunca é somada. O Scheduling grava o telefone na forma canônica brasileira e busca candidatos por formas equivalentes, sem vincular a conversa (D-005). Preço zero da origem é preço não informado ([D-079](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `c86ca2ecdd38fbe9e0daa60206e6a038db4c8f3f` (fechamento do Goal061). Base imediata da implementação: `a070c540214bbbc69529cade6872c876593ee1fb`, HEAD da worktree `.ai-worktrees/goal-062`, inalterado nas duas rodadas. O commit `a070c54` é só documental (fechamento do 061 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **37 arquivos**, hash do diff `93c6a18b6b83a952a59e8dae55ab199cb58208a694c4ccb47c1d834fae8c67af`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e seis arquivos rastreados**, por `git diff --numstat a070c54`:
  - `apps/scheduling-service/`: `prisma/schema.prisma` (+7/−0), `src/modules/customers/avenly-customer-service.ts` (+15/−7), `src/modules/integrations/minha-agenda/client.ts` (+16/−0), `import-source-reader.ts` (+92/−23), `types.ts` (+1/−0), `src/modules/internal-api/routes.ts` (+130/−50), `src/modules/migrations/import-execution-service.ts` (+126/−28), `import-preview-service.ts` (+169/−6) e `src/shared/phone/phone.ts` (+103/−3).
  - `packages/public-api-contract/src/schemas.ts` (+21/−0).
  - `apps/bff/`: `PUBLIC_API_V1.md` (+23/−0) e `src/clients/scheduling/index.ts` (+13/−0).
  - `apps/frontend/src/`: `features/agenda/AppointmentDetail.tsx` (+2/−1), `features/customers/CustomerList.tsx` (+2/−1), `CustomerProfile.tsx` (+2/−1), `PrimaryGuardianPanel.tsx` (+5/−2), `features/imports/ImportConflictsScreen.tsx` (+105/−11), `labels.ts` (+54/−1), `types.ts` (+2/−0), `features/settings/AvailabilitySettings.tsx` (+111/−6) e `shared/phone.ts` (+12/−0).
  - Os cinco documentos de `docs/migration/`, por acréscimo no diff aceito: `CURRENT_STATE.md` (+124/−1), `FINAL_AUDIT.md` (+117), `DECISIONS.md` (+33/−1, a nota de aplicação na linha U-08 e D-079), `VALIDATION_GATE.md` (+22) e `DATA_MIGRATION.md` (+2).
- **Onze arquivos novos**:
  - a migration aditiva `apps/scheduling-service/prisma/migrations/20260927120000_goal062_import_item_proposed_availability/migration.sql` (**11** linhas, só `ADD COLUMN` JSONB anulável em `ImportItem`);
  - `apps/scheduling-service/src/modules/availability/availability-grid.ts` (**65** linhas, a regra de sobreposição que saiu de `routes.ts`);
  - integração do Scheduling (§7.1): `tests/integration/goal062-import-customers.test.ts` (**256** linhas), `goal062-import-availability.test.ts` (**643** linhas) e `goal062-customer-phone.test.ts` (**376** linhas);
  - unidade do Scheduling (§7.2): `tests/unit/goal062-import-customers.test.ts` (**457** linhas), `goal062-availability.test.ts` (**217** linhas) e `goal062-phone.test.ts` (**204** linhas);
  - `apps/bff/tests/goal062-import.integration.test.ts` (**212** linhas);
  - `apps/frontend/tests/goal062-import.test.tsx` (**419** linhas) e `goal062-availability-phone.test.tsx` (**239** linhas).
- Nenhum arquivo foi tocado em `apps/ai-orchestrator/`, `apps/evolution-go/` ou `tools/ia-loop/`. Nenhum teste existente foi editado. Em `packages/`, só `public-api-contract`. O comportamento de `PATCH /internal/availability-settings` não mudou. Não há migration de dado: `phone` e `normalizedPhone` gravados antes do Goal ficam como estavam. `QA_LOCAL_REVIEW.md` não foi editado. `this.http.` em `apps/bff/src/clients/` segue em **42** ocorrências.

## Rodada 1 — CHANGES_REQUIRED (6 blockers)

O código de produto já estava bem encaminhado na rodada 1:

- listagem de clientes com união e deduplicação pelo `id` da origem; `deleted: true` só entra quando referenciado; recuo em `404` ou forma inválida com `CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED`; login recusado e `5xx` continuam falhando o trabalho;
- disponibilidade `NEEDS_REVIEW` com grade ativa; `proposedAvailability` aditivo; decisão de item propagada ao grupo com uma `ImportDecision` por item; troca só por `INCLUDE` de escopo `ITEM`, numa transação com fencing do lease, `deleteMany` e `create`; `AVAILABILITY_CHANGED_SINCE_ANALYSIS`; `assertNonOverlappingRules` extraída sem mudar o `PATCH`;
- telefone canônico `55` + DDD + assinante, com busca por equivalência em `list`, `findCandidatesByPhone` e na classificação;
- preço `0` como `NOT_INFORMED`;
- contrato e BFF com campos opcionais; tela de conflito com as duas grades, confirmação na Disponibilidade e telefone formatado.

Faltava prova e registro. Os seis blockers:

1. **`validate:integration` não rodou na árvore final.** Os critérios 1, 2, 4 e 9 dependiam dele; o §7.1 inteiro e o teste de integração do BFF ficaram sem prova contra PostgreSQL real, e `goal062-customer-phone` rodou só como pulado.
2. **Controles negativos do §8 não rodados.** O critério 8 dependia dos seis.
3. **Documentação do §10 ausente do diff**: D-079, a nota de aplicação em U-08, FINAL_AUDIT §40, CURRENT_STATE, VALIDATION_GATE e a revisão de DATA_MIGRATION.
4. **Códigos novos sem texto leigo.** `FAILED_REASON_LABELS` não tinha `AVAILABILITY_CHANGED_SINCE_ANALYSIS` nem `AVAILABILITY_SOURCE_OVERLAP`, e a tela caía em "Este item não foi importado." sem pedir nova análise; `SERVICE_PRICE_NOT_INFORMED` não tinha texto em nenhum mapa.
5. **O teste de DDDs não comparava as duas listas.** Usava cópia literal e só testava o Scheduling; mudança em `apps/bff/src/lib/phone.ts` passaria em silêncio.
6. **Provas do §7 incompletas.** O §7.1 de telefone chamava `AvenlyCustomerService` direto, com DDD 11 e criação manual, em vez da rota `GET /internal/customers?phone=` com cliente de DDD 55 criado pela importação; o vermelho da baseline `a070c54` só foi colado por uma Work Unit.

## Rodada 2 — ACCEPTED (0 blockers)

- **B1:** `validate:integration` passou na árvore final, **35**/**35** passos. O revisor rodou de novo, contra PostgreSQL descartável (banco removido depois), os três arquivos de integração `goal062` do Scheduling: **21**/**21**.
- **B2:** os seis controles do §8 estão colados com saída real em FINAL_AUDIT §40. A explicação dos controles 2, 3 e 4 é coerente com o código: item `NEEDS_REVIEW` não é executado; o caso novo de `IMPORT_ALL` com itens `PENDING` chega à execução; a forma canônica cobre o caso sem 9º dígito; a equivalência cobre as linhas antigas.
- **B3:** D-079 escrita como `PROPOSED` com os quatro pontos e os limites; nota em U-08 sem mudar o texto; FINAL_AUDIT §40 com veredito 0/7/6; CURRENT_STATE e VALIDATION_GATE citam a migration `20260927120000`; DATA_MIGRATION revisado; `PUBLIC_API_V1.md` diz que o §9 não foi feito.
- **B4:** `labels.ts` tem texto para os três códigos, cobertos por jsdom; o de `AVAILABILITY_CHANGED_SINCE_ANALYSIS` manda analisar de novo.
- **B5:** `goal062-phone.test.ts` lê `apps/bff/src/lib/phone.ts` e compara com `BRAZILIAN_DDDS` exportada pelo Scheduling.
- **B6:** três casos `app.inject` em `GET /internal/customers?phone=` usam cliente de DDD 55 criado por análise e execução reais, mais a linha antiga e o isolamento de tenant.

Prova conferida na árvore final:

- `typecheck` e `lint` de `apps/scheduling-service`, `apps/bff` e `apps/frontend`: exit 0 nos seis.
- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`. Dentro dele: `test:scheduling-service` **35** arquivos e **484** testes (baseline review061: **32**/**448**); `test:frontend` **80** arquivos e **766** testes (baseline **78**/**750**); `test:gate-scripts` **233**/**233** (baseline **233**).
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos. `test:scheduling-integration` roda **16** arquivos e **124** testes (baseline **13**/**103**), inclusive os **21** do §7.1. `test:bff-integration` roda **49** arquivos e **389** testes (baseline **48**/**386**), inclusive os **3** de `goal062-import.integration.test.ts`. `rehearse:goal028-release-migrations` aplica o histórico inteiro com a migration nova, sem drift. `rehearse:goal033-authenticated-ui` roda **65** testes: **65** expected, **0** unexpected, **0** flaky, **0** retentativas.
- Nenhuma suíte encolheu.

### Observações não bloqueantes

1. **`CREATE_NEW` num item de `AVAILABILITY`, fora da tela, grava o `reasonDetail` "Troca confirmada" sem confirmar a troca.** O comportamento é seguro: a troca só é confirmada por `INCLUDE` de item. O texto gravado engana.
2. **A tela de conflito oferece "Usar os horários da Minha Agenda" também em item com `AVAILABILITY_SOURCE_OVERLAP`.** A execução falha o item sem gravar; o dono só descobre depois de executar.
3. **Número estrangeiro de 11 dígitos cujos dois primeiros formam DDD válido é lido como brasileiro.** É o que o §3 do Goal especifica; fica registrado como limite da regra.
4. **Os documentos trazem a URL do PostgreSQL descartável local com a credencial padrão `postgres:postgres`.** É banco efêmero em loopback, sem segredo real; não se repete o padrão com credencial de ambiente persistente.
5. Na rodada 1 também ficaram sem bloqueio: `classifyService` só marca preço `0` numérico, enquanto `resolvePrice` usa `knownNumber`; e `markFailed` continua sem fencing, como antes do Goal.
6. **As observações abertas herdadas continuam abertas**: as do [review070](070-review.md), a 4 do [review059](059-review.md), as do [review060](060-review.md) exceto a 1, e as 1, 3, 4, 5 e 6 do [review061](061-review.md). A observação 2 do review061 (`IMPORT_SOURCE_INVALID_RESPONSE` com o texto da falha interna) foi resolvida neste diff: o código tem texto leigo próprio em `labels.ts`.

### O que este aceite não cobre

- Não prova a forma real de `GET /customers` nem a contagem real de clientes: todo teste usa dublê local do client. A conferência humana do §9, com a pilha local e a conta de teste de U-05, **não foi feita** — nem a troca da grade com a grade real, nem uma mensagem de número importado encontrando a cliente como candidata.
- Não reescreve `phone` nem `normalizedPhone` de linhas gravadas antes do Goal; a busca as acha pelas formas equivalentes.
- Não entrega o editor de disponibilidade por dia (Goal067); a tela de Disponibilidade só deixa de esconder a grade e de apagá-la em silêncio.
- Não vincula a conversa ao cliente pelo número (D-005); o painel de Conversas continua igual.
- Não prova largura, toque, contraste, foco nem movimento de `/importacao` e `/configuracoes/disponibilidade`: seguem fora do gate renderizado.
- Não prova fidelidade visual ao protótipo aprovado (conferência humana, Goal069).
- Nenhum achado A-01…A-24 foi corrigido ou reclassificado. A auditoria segue com **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §40](../FINAL_AUDIT.md)).

### Correções de registro feitas no fechamento

- **D-079 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review, a contagem de rodadas e uma nota de fechamento. A decisão não mudou.
- **FINAL_AUDIT §40** passa a citar D-079 como `ACCEPTED`.
- **CURRENT_STATE**: o título do delta Goal062 passa a citar D-079 como `ACCEPTED`.
- **VALIDATION_GATE** (seção Goal062): D-079 citada como `ACCEPTED`, e o link para o delta de CURRENT_STATE acompanha o título atualizado.
- **DATA_MIGRATION** (§3, parágrafo do Goal062): D-079 citada como `ACCEPTED`, com referência a este review.
- **GAP_ANALYSIS** (G-20) ganha nota do Goal062: a limitação `CUSTOMER_DIRECTORY_UNAVAILABLE` deixa de valer para sessão nova; o recuo passa a ser `CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED`, e a forma real da resposta continua sem prova.
- **O status do documento do Goal062 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
