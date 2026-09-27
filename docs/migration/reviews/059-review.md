# Review formal — Goal 059

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal059](../goals/059-o-status-do-whatsapp-e-o-real.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–058) foi reaberto, reavaliado ou revertido. **Três rodadas**: as rodadas 1 e 2 terminaram `CHANGES_REQUIRED`, com 5 e 3 blockers; a rodada 3 terminou com zero.

O Goal corrige seis achados da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT:

- **QA X-01**: `/v1/status` e `/v1/dashboard` usavam o envelope cifrado cru e contradiziam `/v1/whatsapp`.
- **QA H-02**: o banner da Home afirmava desconexão e pausa sob estado desconhecido.
- **QA S-09** e **QA O-46**: `phoneNumber` saía como JID cru.
- **QA O-47**: uma conexão falha deixava instância órfã na Evolution.
- **QA A-06**: celular legado de 12 dígitos aparecia como fixo.

## Escopo e identidade do diff

- Baseline aceita vigente: `5ff8e46caef207620a4ebc6022931fe315775573` (fechamento do Goal058). Base imediata da implementação: `5fd31cd3996eeb406c3692d2cc28dd5a89ed80df`, HEAD da worktree `.ai-worktrees/goal-059`, inalterado nas três rodadas. O commit `5fd31cd` é só documental (fechamento do 058 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **18 arquivos**, hash do diff `44adf0f9ced845c830a64fd372f0b8059d237f7f6519939e84472df634f05440`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Catorze arquivos rastreados**, por `git diff --numstat 5fd31cd`:
  - `apps/bff/`: `PUBLIC_API_V1.md` (+4/−2), `src/clients/evolution/index.ts` (+10/−6), `src/lib/onboarding-state.ts` (+8/−1), `src/modules/dashboard/routes.ts` (+46/−14), `src/modules/status/routes.ts` (+1/−1) e `src/modules/whatsapp/routes.ts` (+60/−14).
  - `apps/frontend/`: `AGENTS.md` (+2/−2), `src/features/conversations/format.ts` (+6/−8), `src/features/dashboard/DashboardScreen.tsx` (+64/−30) e `src/features/whatsapp/WhatsAppConnectionPanel.tsx` (+5/−3).
  - Os quatro documentos de `docs/migration/`, por acréscimo puro: `CURRENT_STATE.md` +119, `FINAL_AUDIT.md` +79, `DECISIONS.md` +28 e `VALIDATION_GATE.md` +26.
- **Quatro arquivos novos**: `apps/bff/tests/goal059-whatsapp-status.integration.test.ts` (**506** linhas, 10 testes), `apps/bff/tests/goal059-whatsapp-orphan.integration.test.ts` (**302** linhas, 4 testes), `apps/frontend/src/shared/phone.ts` (**61** linhas) e `apps/frontend/tests/goal059-whatsapp-status-view.test.tsx` (**331** linhas, 13 testes).
- Nenhum arquivo foi tocado em `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `tools/ia-loop/` ou `scripts/`. Nenhuma migration nem schema Prisma mudou, e nenhum campo público, rota ou schema do contrato mudou de forma. `QA_LOCAL_REVIEW.md` não foi editado.

## Rodada 1 — CHANGES_REQUIRED (5 blockers)

O núcleo estava correto:

- `whatsappSummary` usava `findLinkedInstance` e `resolveInstanceCredential`, e `settled` registrava só código e `statusCode`.
- O número saía em dígitos nas quatro saídas.
- `ensureInstance` fazia a checagem prévia e a remoção compensatória.
- O banner derivava de `status.whatsappView`.
- `validate:integration` passava com 35/35 passos.

Os cinco blockers:

1. **§2 (QA O-46), gravação do legado.** Quando a Evolution não informava número, `GET /v1/whatsapp` regravava o JID cru de `instance.phoneNumber`. A resposta saía em dígitos só porque `whatsappDto` convertia.
2. **§2, formato do JID no teste.** O teste usava o formato irreal `…@s.whatsapp.net:42`, e não o formato real `5511987654321:8@s.whatsapp.net`. Também faltava o caso de dígitos puros.
3. **§5, valor vazio.** O teste jsdom não cobria o valor vazio.
4. **§1, frequência da escrita.** Nem o relatório nem os documentos diziam com que frequência a leitura de status passava a disparar `persistSealed`.
5. **§8 e critério 10.** A seção 059 de VALIDATION_GATE deslocou a linha de fechamento do 058. Os documentos também diziam "não prova" no lugar das contagens dos gates.

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

B2, B3 e a parte (a) de B5 foram resolvidos. Restaram três blockers:

1. **B4 incompleto.** O parágrafo de FINAL_AUDIT §36 terminava vazio, e as Consequências de D-075 não foram atualizadas. CURRENT_STATE e VALIDATION_GATE descreviam a frequência de forma contraditória.
2. **B1 sem prova no banco.** O código já convertia antes do `update`, mas o teste conferia só a resposta HTTP, que `whatsappDto` mascara.
3. **B5(b) aberto.** Os documentos ainda não traziam as contagens da execução completa.

## Rodada 3 — ACCEPTED (0 blockers)

- **B1:** FINAL_AUDIT §36 e as Consequências de D-075 descrevem os dois únicos casos de escrita. O texto foi conferido contra `instance-link.ts:160-203` (`resolveInstanceCredential`, `needsRotation`, `persistSealed`).
- **B2:** `goal059-whatsapp-status.integration.test.ts:416-420` lê a linha por `getPrisma().whatsAppInstance.findUnique` e exige `phoneNumber === "5511987654321"`. Isso prova a gravação de `GET /v1/whatsapp` (`whatsapp/routes.ts:63-71`), não só a resposta.
- **B3:** VALIDATION_GATE, CURRENT_STATE e FINAL_AUDIT §36 trazem as contagens reais da execução final. A falha intermitente de `goal008-agenda` está registrada com nome, causa e reexecução limpa.

Prova conferida na árvore final:

- `typecheck` e `lint` de `apps/bff` e `apps/frontend`: exit 0 nos quatro.
- `validate:core`: **17** passos, **15** `passed`, **2** `skipped`, **0** `failed`.
- `test:gate`: **227**/**227**.
- `validate:integration`: **35**/**35**. Nele, `rehearse:goal033-authenticated-ui` roda **60** testes com **0** retentativas, e `test:bff-integration` roda `vitest run` sobre todo `apps/bff`, com os **14** testes goal059.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `npx vitest run` em `apps/frontend`, rodado pelo Tech Lead: **75** arquivos e **699** testes. É a baseline de 74/686 mais o arquivo goal059 com 13 testes; nenhuma suíte encolheu.
- Os cinco controles negativos têm saída colada em FINAL_AUDIT §36. `git status` mostra os 18 arquivos declarados, e `git diff --check` passa.

### Observações não bloqueantes

1. **Leituras concorrentes no primeiro acesso.** Os documentos não diziam que duas leituras simultâneas nesse primeiro acesso podem regravar o envelope em paralelo, de forma idempotente. Isso foi registrado no fechamento (ver abaixo).
2. **Contagens não escritas.** A contagem de `test:frontend` (75/699) e o `expected`/`unexpected`/`flaky` do gate autenticado não estão escritos nos documentos do diff059. Os números foram conferidos por execução nesta revisão e ficam registrados aqui.
3. **Observação 1 do [review058](058-review.md) resolvida.** A frase de `apps/frontend/AGENTS.md` sobre "Criar serviço" foi corrigida neste diff: "Novo serviço" abre o formulário e "Criar serviço" recebe o clique.
4. **Teste intermitente fora do escopo.** `goal008-agenda.test.ts` ("completes what expired past the grace period…", `apps/scheduling-service`) depende do relógio real e reprovou uma vez em `validate:integration`. O Goal não toca esse arquivo. O teste continua intermitente até um Goal próprio o corrigir.
5. **As observações abertas herdadas continuam abertas**: as do [review058](058-review.md) (exceto a 1, resolvida) e as que ele herdou.

### O que este aceite não cobre

- Não prova conexão real com um aparelho WhatsApp.
- Não prova fidelidade visual da Home e da tela de WhatsApp ao protótipo aprovado. Essa conferência é humana (Goals 068/069).
- Não prova busca de cliente com e sem o 9º dígito. `whatsappPhoneCandidates` não foi tocado.
- A remoção compensatória é melhor esforço. Ela não alcança órfãs anteriores a este Goal nem falha depois da linha local existir.
- Nenhum achado A-01…A-24 foi corrigido ou reclassificado. A auditoria segue com **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §36](../FINAL_AUDIT.md)).

### Correções de registro feitas no fechamento

- **D-075 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review e a contagem de rodadas. D-075 também ganha uma nota de fechamento sobre a frequência da escrita, as leituras concorrentes idempotentes e a prova da gravação no banco. A decisão não mudou.
- **FINAL_AUDIT §36** passa a citar D-075 como `ACCEPTED` neste review, em vez de `PROPOSED`.
- **CURRENT_STATE** (delta diff059) e a tabela do Goal059 em **VALIDATION_GATE** tinham uma frase ambígua: "cada tick com vínculo legado ainda não selado grava uma vez". A frase passa a dizer que só o primeiro tick depois de um vínculo legado ou de uma rotação grava. Também passa a registrar as leituras concorrentes idempotentes.
- **O status do documento do Goal059 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
