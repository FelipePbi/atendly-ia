# Review formal — Goal 067

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-28, conforme o [Goal067](../goals/067-configuracoes-completas.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–066, 070 e 071) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 4 blockers, e a rodada 2 terminou com zero.

O Goal corrige **QA S-06** (só a parte das regras de oferta), **QA S-04**, **QA S-07**, **QA M-01**, **QA M-02**, **QA L-09**, **QA S-01**, **QA S-03**, **QA S-05**, **QA S-10** e **QA NT-03** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, a **observação 2 do [review063](063-review.md)** e a **observação 4 do [review064](064-review.md)**. Configurações › Agenda ganha as regras de oferta sem mudar contrato. A disponibilidade passa a ser por dia, com mais de um intervalo. "Outras informações importantes" volta a ser relida. Pausar com a IA já desligada deixa de consumir a prova do teste real. A pessoa edita o próprio nome. "Ajuda" sai dos dois menus, e o "Mais" fica completo no celular ([D-085](../DECISIONS.md)). A política de cancelamento de QA S-06 e QA S-08 passam ao Goal073.

## Escopo e identidade do diff

- Baseline aceita vigente: `a069d77f6dd1c7621edb032d6b606b3546016383` (Goal066). Base imediata da implementação: `a6b560b631c8a1fb24deca303e1af28431f2e2da`, HEAD da worktree `.ai-worktrees/goal-067`, inalterado nas duas rodadas. Os commits `80b85c2` e `a6b560b` são só documentais (status do Goal066 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **39 arquivos**, hash do diff `c1b113ea98144a3d486c75e4379f3141f13fc4b80b990f60f369c2de222bf4f3`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Trinta e cinco arquivos rastreados**, por `git diff --numstat a6b560b`:
  - `apps/ai-orchestrator/`: `modules/internal/routes.ts` (+15/−1) e `modules/knowledge/knowledge-document-service.ts` (+23/−0), a leitura isolada por tenant de `GET /internal/knowledge/other-info`; testes `assistant/assistant.service.test.ts` (+6/−6), `internal/knowledge.routes.test.ts` (+46/−1) e `knowledge/knowledge-document-service.test.ts` (+74/−8).
  - `apps/bff/`: `modules/settings/routes.ts` (+10/−7, ramo de pausa), `modules/account/routes.ts` (+25/−0, `PATCH /v1/account/profile`), `modules/auth/routes.ts` (+1/−1, `nameSchema` exportado), `modules/knowledge/routes.ts` (+7/−0), `clients/ai-orchestrator/index.ts` (+13/−0) e `PUBLIC_API_V1.md` (+18/−3).
  - `packages/public-api-contract/`: `src/schemas.ts` (+9/−0, `accountProfileResultSchema` e `otherInfoResultSchema`) e `src/routes.ts` (+4/−0, duas entradas em `publicApiRoutes`). É **desvio declarado do Goal067 §10**, exigido pela checagem `public_api_route_coverage` para as duas rotas novas, e está registrado em D-085.
  - `apps/frontend/`, produto: `features/settings/AvailabilitySettings.tsx` (+221/−168), `CalendarSettings.tsx` (+178/−24), `AccountSettings.tsx` (+49/−1), `ProductSettingsScreen.tsx` (+5/−2), `shared/fields.tsx` (+3/−2), `features/knowledge/OtherInfoSection.tsx` (+43/−19), `features/reminders/ReminderSettingsSection.tsx` (+5/−2), `features/notifications/NotificationPreferenceSection.tsx` (+5/−2), `shared/layout/navigation.ts` (+14/−0), `shared/layout/AppShell.tsx` (+0/−7), `shared/styles/avenly-settings.css` (+28/−3), `data/services/BffAccountService.ts` (+19/−1) e `BffKnowledgeService.ts` (+12/−0).
  - `apps/frontend/`, medição: `e2e/routes.ts` (+20/−0), com `/configuracoes/agenda`, `/configuracoes/disponibilidade` e `/configuracoes/conta` em `AUTHENTICATED_ROUTES`.
  - `apps/frontend/tests/` ajustados: `goal014-shell.test.ts` (+6/−0), `goal024-knowledge-section.test.tsx` (+9/−9), `goal024-settings-shell-invariant.test.tsx` (+6/−2) e `goal062-availability-phone.test.tsx` (+23/−38). Os ajustes acompanham a remoção do aviso "o conteúdo salvo não é reexibido", a saída de `fitsSingleIntervalForm` e os destinos novos do "Mais".
  - Os quatro documentos de `docs/migration/`, só por acréscimo no snapshot aceito: `CURRENT_STATE.md` (+114), `DECISIONS.md` (+36, D-085), `FINAL_AUDIT.md` (+106, §46) e `VALIDATION_GATE.md` (+110).
- **Quatro arquivos novos**, todos de teste:
  - `apps/bff/tests/goal067-other-info.integration.test.ts` (**161** linhas) e `goal067-pause-and-profile.integration.test.ts` (**288** linhas);
  - `apps/frontend/tests/goal067-configuracoes-agenda.test.tsx` (**295** linhas) e `goal067-configuracoes-ia-conta.test.tsx` (**319** linhas).
- Nenhum arquivo foi tocado em `apps/scheduling-service/`, `apps/evolution-go/`, `scripts/` ou `tools/ia-loop/`. Nenhuma migration. `KNOWN_*` sem exceção nova. `PATCH /v1/settings/availability` e o Scheduling não mudaram. `this.http.` em `apps/bff/src/clients/` passa de **42** para **43**, pela leitura nova de `other-info`. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

Já estava correto: o backend inteiro. `getOtherInfo` filtra por tenant no documento e no chunk. `GET /v1/knowledge/other-info` e `PATCH /v1/account/profile` usam o mesmo pré-handler de `PATCH /v1/auth/password`, reusam `nameSchema` e gravam só o `User` da sessão. O ramo de pausa só grava `activatedByRunId` quando o `enabled` gravado é `true`. No frontend também estavam corretos: a disponibilidade por dia com validação inline e reenvio das regras inativas, o abort do `ProductSettingsScreen`, o "Mais" e a "Ajuda", a separação por `aria-describedby` e as três rotas novas no gate (**155** = **140** + **15**). Os gates passaram. Os quatro blockers:

1. **Valor gravado fora das opções não aparecia selecionado** em `CalendarSettings`. O Scheduling aceita `minLeadMinutes` 0..43200, `maxLeadDays` 1..365 e `granularityMinutes` 5..120. Com 45 min, 120 dias ou 30 minutos, nenhum chip ficava com `aria-pressed=true`, contra o critério 1.
2. **"Outras informações importantes" deixava salvar sem ter lido o texto.** Com a leitura falhada ou pendente, o botão de salvar ficava ativo, e o `PUT` substituía o texto guardado. Isso reabria QA S-04.
3. **A documentação dizia que `packages/` não mudava**, mas o diff altera `packages/public-api-contract/src/routes.ts` e `schemas.ts`. O desvio do §10 precisava ser declarado em D-085, FINAL_AUDIT §46, CURRENT_STATE e VALIDATION_GATE.
4. **Execução final, controles e contagens refeitos** depois das correções, na ordem do §9.

## Rodada 2 — ACCEPTED (0 blockers)

- **B1:** `ChoiceGroup` com `isKnownValue` e `formatCustomLabel` mostra, nos três grupos, qualquer valor gravado fora das opções como opção extra selecionada. `save()` envia o estado inicializado do valor lido e reenvia as `rules` lidas sem mudança. Teste novo prova `aria-pressed=true` para 90 min, 45 dias e 20 min.
- **B2:** `OtherInfoSection` recusa gravar em `save()` e desabilita `SaveActions` enquanto a leitura está pendente ou falhou. Testes novos provam o botão desabilitado durante a leitura e que, depois de falha de leitura, `saveOtherInfo` nunca é chamado.
- **B3:** o desvio do §10 em `packages/public-api-contract` está declarado em D-085 ("Consequências" e "Limites declarados"), CURRENT_STATE, VALIDATION_GATE e FINAL_AUDIT §46. Nenhuma frase restante diz que `packages/` não muda.
- **B4:** os gates rodaram sobre a árvore final, e os números batem com os documentos. Os `sha256sum` atuais dos arquivos dos sete controles batem com os hashes "antes/depois" de FINAL_AUDIT §46. FINAL_AUDIT só recebeu acréscimos (106 linhas, 0 removidas), e §45 está intacta. `git status` lista só os arquivos declarados, sem `e2e-results/`.

Na revisão, o `test:frontend` completo rodou **94**/**94** arquivos e **979**/**979** testes, igual ao documentado.

Prova declarada pelo Developer e conferida na revisão:

- `validate:core`: **17** passos, **15** `passed`, **2** `skipped`, **0** `failed`. Dentro dele: `test:ai-orchestrator` **85**/**97** arquivos (**12** pulados) e **1117**/**1205** testes (**88** pulados); `test:scheduling-service` **35**/**35** e **484**/**484**; `test:frontend` **94**/**94** e **979**/**979** (baseline review066: **92**/**958**); `audit:static` **33** de **34**, **1** pulada.
- `test:gate`: **233**/**233**.
- `validate:ui`: **169** passando, **21** pulados, **0** falhando, **0** retentativas.
- `validate:integration`: **35**/**35** passos, contra PostgreSQL 18 descartável. `test:bff-integration` **55**/**434** (baseline **53**/**428**; os **2** arquivos e **6** testes novos são `goal067-*`). `test:scheduling-integration` **16**/**124**, inalterado. `rehearse:goal033-authenticated-ui`: **155** passando (os **140** de antes mais **15** das três rotas novas nas cinco larguras), **0** falhando, **0** retentativas.
- Sete controles negativos do §7 colados com hash antes, durante e depois, idênticos na restauração. Não reexecutados na revisão.
- Nenhuma exceção nova em `KNOWN_*`. Nenhuma suíte encolheu.

## Observações registradas, sem mudar a decisão

1. **O teste de B1 prova a seleção, mas não prova que salvar sem mexer envia 90/45/20.** O código faz isso de forma trivial.
2. **A caixa de `OtherInfoSection` continua editável durante a leitura pendente ou falhada.** Texto digitado antes de a leitura chegar é sobrescrito por ela. Não há perda de dado gravado, porque salvar fica bloqueado.
3. **A subseção "Rodada 2" de FINAL_AUDIT §46 atribui `validate:ui` e `validate:integration` à execução do FIX-001.** O relatório do FIX-001 admite que essas suítes não terminaram ali. As contagens foram confirmadas depois por WU-13 e WU-14 sobre a mesma árvore.
4. **O controle negativo 1 (isolamento por tenant da leitura do orquestrador) não foi reexecutado na rodada 2.** O arquivo não mudou, e o hash é idêntico ao do controle da rodada 1.
5. **`toggleDay` ignora o limite de 28 regras**; só "Adicionar intervalo" o respeita.
6. **Sobreposição entre regra ativa e regra inativa preservada só é recusada pelo Scheduling**, com 409 genérico. Hoje nenhum caminho do produto grava regra inativa.
7. **`AvailabilitySettings` usa `business.timezone`, e não `availability.timezone`**, como já fazia antes deste Goal.

As observações 2, 5 e 6 são candidatas a ajuste no Goal068 ou em revisão futura.

## O que o aceite não prova

- Que Configurações bate com os protótipos `Mais-Negocio-Agenda-IA` e `Mais-WhatsApp-Importacao-Conta` nas opções e nos textos. A conferência humana do §8 do Goal **não foi feita**.
- Que a IA, depois de mudar as regras de oferta, oferece horários com a antecedência, o limite e o intervalo escolhidos numa conversa real. Fica no jsdom e nos testes de integração.
- A política de cancelamento e "Como você vê a agenda" (QA S-08), que passam ao Goal073.
- A fidelidade visual de Configurações ao protótipo além do que este Goal cria, que é do Goal068.

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §46](../FINAL_AUDIT.md)).
