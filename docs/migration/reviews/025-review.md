# Review formal — Goal 025

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-16, em review **DEEP**, conforme o [Goal025](../goals/025-ciclo-de-vida-da-conta.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–024) foi reaberto, reavaliado ou revertido.

As rodadas 1 a 4 são históricas: CHANGES_REQUIRED com três, três, um e dois blockers, todos fechados e conferidos no código e na execução real dos gates, não no relatório do Developer.

## Escopo e identidade do diff

- Baseline aceita vigente: `d24d68146617ffe1ebb7eedb6617947a843a9bb8` (fechamento024). Base imediata da implementação: `5983c9accc780b24fca162f22c416494494c78ab`, HEAD da worktree `.ai-worktrees/goal-025`, **inalterado nas cinco rodadas**.
- Snapshot aceito, calculado pelo IA Loop: **63 arquivos**, hash do diff `fb503f73688a578232fc6565c5db32c471767651afa61bd5a88d901e75941fdf`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **37 arquivos modificados** (+1216/−111) e **26 arquivos novos** (~6.080 linhas, em maioria suítes). O diff atravessa quatro camadas: BFF (módulo novo, migration, schema, guardas, clientes internos), IA e Scheduling (rota interna de purga por negócio), frontend (seção Conta e shell) e a documentação de contrato e de migração.
- **BFF:** módulo novo `src/modules/account/` — `state.ts` (107 linhas, só decisão, sem Prisma e sem relógio próprio), `service.ts` (387), `purge.ts` (603), `worker.ts` (124), `routes.ts` (98), `errors.ts` (62), `constants.ts` (29); migration `20260916000000_goal025_account_deletion` (49 linhas); `schema.prisma` (+50); `lib/ai-activation.ts` (+77), `modules/settings/routes.ts`, `modules/status/routes.ts`, `app.ts`, `config/env.ts`, `.env.example`, `clients/ai-orchestrator` e `clients/scheduling`; `modules/whatsapp/disconnect.ts` (97 linhas) extraído de `modules/whatsapp/routes.ts` sem mudança de comportamento.
- **IA:** `modules/internal/tenantPurge.ts` (180 linhas, 16 tabelas com `tenantId`), `modules/internal/routes.ts` (+81), `ChannelConnectionService.ts` (+25), `lib/internal-credentials.ts` (+7, escopo `tenant:purge`), `NotificationDeliveryService.ts` (52 linhas tocadas, reordenação da avaliação).
- **Scheduling:** `modules/internal-api/tenantPurge.ts` (247 linhas, 27 tabelas com `tenantId`) e `modules/internal-api/routes.ts`.
- **Frontend:** `features/settings/AccountSettings.tsx`, `shared/layout/AppShell.tsx` (+39), `shared/runtime/systemStatus.tsx` (+33), `data/services/BffAccountService.ts` (25), `data/mappers/publicApiSchemas.ts` (+24), `data/index.ts`, `data/services/registry.ts`.
- **Uma migration, só no BFF.** Nenhuma migration em IA ou Scheduling: a purga por negócio nesses dois é código novo sobre tabelas que já existiam.
- Inspecionados linha a linha: o patch completo da rodada 1 e, nas seguintes, o delta exato entre as fotografias, sempre contra a worktree e não contra o relatório. Nenhum arquivo foi editado pelo reviewer em nenhuma rodada.

## Rodada 1 — CHANGES_REQUIRED, 2026-09-16

O núcleo chegou inteiro e sólido: modelo sem FK para `Tenant`/`User` com migration aditiva e retomável; rotas públicas sob sessão e CSRF com reautenticação por senha e identidade só do contexto; `SCHEDULED` e `AiSettings.enabled = false`/`activatedByRunId: null` na mesma transação; claim atômico com fencing por `leaseToken`; ordem IA → Scheduling → BFF com `User` por último; purga por enumeração derivada do schema nos dois serviços. Três blockers:

1. **Gate vermelho.** `validate:integration` falhou (26/28 OK, 1 falha, 1 não executado) no passo `test:ai-orchestrator-content-purge`: os 4 testes de `tests/retention/tenant-purge.test.ts` — acrescentados por este Goal — quebraram em `The table public.KnowledgeChunk does not exist`, abortando antes de exercitar regra alguma de purga, incluindo o isolamento entre dois negócios. A prova dos critérios 24, 25 e 35 só existia na máquina de quem escreveu.
2. **Guarda de não-reativação incompleta.** `PATCH /v1/settings/ai` continuava gravando `enabled: true` e projetando na IA sem passar pela reconciliação. Além de contradizer §3, fazia a IA voltar sozinha **ao cancelar** — violação do critério 15.
3. **Aviso persistente inexistente.** O estado só aparecia dentro da seção Conta; o shell seguia mostrando "Atendimento automático parado — Reconecte o WhatsApp", frase que o próprio Goal torna falsa durante o prazo.

## Rodada 2 — CHANGES_REQUIRED, 2026-09-16

Blocker 2 fechado e verificado: `assertAiActivationNotBlockedByDeletion` mora em `account/service.ts` e é chamada antes de qualquer gravação; enumerados todos os gravadores de `AiSettings` no BFF, só a autoativação da reconciliação e essa rota escrevem `enabled: true`, e ambos estão guardados, com `409 CONFLICT` sem forma nova (critério 33 preservado). Blocker 1 diagnosticado corretamente — e o diagnóstico da rodada 1 estava parcialmente errado: faltava apenas `KnowledgeChunk`, e a fixture idempotente no ensaio do Goal012 estreita o pulo nomeado sem afrouxar teste algum. Três blockers na rodada:

1. **O aviso não precedia nem suprimia o banner errado**, e o teste novo **fixava o defeito** (`toHaveLength(2)`), de modo que a correção futura passaria a quebrar o teste.
2. **`PUBLIC_API_V1.md` passou a afirmar o contrário do critério 9:** a seção nova foi inserida no meio da seção do Goal024, deixando "a sessão que fez a chamada também é revogada" pendurada sob o ciclo de vida da conta.
3. **Gates não exercitados sobre a árvore da rodada.** `validate:core` verificado pelo reviewer e verde; `validate:integration` impossível na ocasião, com o cluster descartável travado por falha de shared memory do Postgres no Windows.

## Rodada 3 — CHANGES_REQUIRED, 2026-09-16

Banner corrigido e verificado: o aviso de exclusão é o primeiro bloco do `<main>` e os dois banners do Goal022 passaram a ser suprimidos enquanto o prazo corre; o teste reescrito afirma a supressão e as fixtures **não** mascaram o defeito — com elas, os dois banners suprimidos apareceriam se a correção saísse. Contrato público reordenado. Gates executados pelo próprio reviewer sobre a árvore: `validate:integration` 28/28 exit 0 e `validate:ui` 169 passed / 21 skipped nas cinco larguras. Restou um blocker, só de documentação:

- **D-041 e `CURRENT_STATE` descreviam metade da guarda.** Os dois afirmavam que ela "vive no caminho comum de reconciliação, **não em cada chamador**", e D-041 registrava como rejeitada a alternativa de guardar por rota — enquanto o código tinha, desde a rodada 2, a segunda guarda de escrita em `PATCH /v1/settings/ai`, já contratual em `PUBLIC_API_V1.md`. É o mesmo erro do blocker 2 da rodada 1, sobrevivendo na documentação do mecanismo central de segurança do Goal.

## Rodada 4 — CHANGES_REQUIRED, 2026-09-16

D-041 corrigida e conferida chamador por chamador (+16/−0, nenhum outro bloco tocado). Dois blockers, ambos de prova e não de desenho:

1. **`validate:integration` nunca foi reexecutado depois da correção escrita.** O único lugar onde a purga destrutiva roda contra PostgreSQL real estava vermelho desde a rodada 1, e as rodadas 2 a 4 não rodaram gate nenhum. Não era a falha ambiental conhecida de goals antigos: o mesmo gate saiu exit 0 nos Goals 020 a 024.
2. **Lint, `validate:core` e `validate:ui` só tinham execução sobre a árvore da rodada 1**, e `settings/routes.ts`, `AppShell.tsx`, `AccountSettings.tsx`, `systemStatus.tsx` e o script de ensaio mudaram depois disso.

## Rodada 5 — ACCEPTED, 2026-09-16

Os dois blockers foram fechados com evidência verificada no store determinístico do orquestrador, não no relatório:

- `validate:integration` **exit 0, 28 passed / 0 failed / 0 skipped / 0 notRun**, contra `127.0.0.1:55500/ia_bff_test`. `test:ai-orchestrator-content-purge` passou (3 arquivos, 19 testes, incluindo `tests/retention/tenant-purge.test.ts`) e `test:bff-integration` passou com as suítes `goal025` **realmente executadas**: o gate exporta `BFF_RUN_INTEGRATION_TESTS="true"` (`scripts/validate-integration.mjs:217`), que é o que `RUN_INTEGRATION` lê em `apps/bff/tests/helpers/integration.ts:8` — não houve skip silencioso. A causa original foi corrigida por fixture idempotente documentada como pulo nomeado em `scripts/goal012-knowledge-memory-migration-rehearsal.mjs`, e `rehearse:goal012` passou.
- Lint do BFF, `validate:core` (PASSED, 14 passos, 3 skips declarados) e `validate:ui` (exit 0, 169 passed / 21 skipped nas cinco larguras) rodaram sobre a árvore final, depois da última correção. O reviewer rodou `npm run lint` no frontend de forma independente: exit 0.
- A alteração de `goal023-notification-retention.test.ts` (`NOW` fixo em vez de relógio real) é correção legítima de fragilidade temporal num teste preexistente, sem tocar produto e sem enfraquecer asserção.

Confirmados no código, na revisão funcional do Goal inteiro: gravação de `SCHEDULED` e desligamento da IA na mesma transação; as duas guardas de não-reativação; claim atômico pelo relógio do banco com fencing por token e liquidação exigindo o mesmo token; ordem IA → Scheduling → BFF com `User` por último e `PURGED` como última escrita, só com todas as lojas confirmadas; cobertura de purga derivada de `schema.prisma` nos dois serviços, com guarda explícita contra parse vazio — não é asserção vacuamente verdadeira; escopo interno próprio `tenant:purge`, distinto de `retention:purge`; schemas `.strict()` que recusam qualquer campo além de `maxRows`, com o negócio vindo só do contexto interno autenticado; `AccountDeletion` sem FK, sobrevivendo à purga e sem dado pessoal; `disconnectWhatsApp` extraído sem mudança de comportamento (divergência continua recusando com `CONFLICT`); reordenação do `NotificationDeliveryService` produzindo `AI_NOT_ENABLED`, explicitamente autorizada pelo §3 e coberta por teste novo; laço desligado por default com variável própria e nenhum teste subindo o worker; `PUBLIC_API_V1.md` estritamente aditivo; nenhum `eslint-disable` novo.

## O que o diff aceito entrega

- **A segunda máquina irreversível da plataforma existe.** Pedir exclusão exige sessão, CSRF e a senha atual; senha errada recusa com `401` sem tocar em efeito nenhum; o aceite grava `SCHEDULED` com vencimento em sete dias (`ACCOUNT_DELETION_GRACE_PERIOD_DAYS`, constante de produto) **na mesma transação** que desliga a IA desejada, e só depois tenta derrubar o canal na IA e desconectar o WhatsApp, tolerando falha remota. A sessão não é revogada por pedir — cancelar exige entrar.
- **A automação não volta sozinha, por dois caminhos distintos e nomeados:** a reconciliação força o desejado a `false` mesmo contra execução `SUCCEEDED`, que em qualquer outra conta autoativaria; e `PATCH /v1/settings/ai` recusa com o `409 CONFLICT` que a rota já usava, sem `details` novo.
- **Cancelar interrompe a purga e não restaura nada** — sem porta de efeito no módulo, por decisão de produto declarada no código e dita na tela.
- **A purga por negócio é enumeração derivada do schema**, não cascata: 16 tabelas na IA, 27 no Scheduling, cada serviço com rota interna própria sob escopo `tenant:purge`, idempotente e com teto de linhas por passada; um modelo novo com `tenantId` que não entre na lista quebra o teste de cobertura.
- **O BFF é a última loja e o `User` a última linha**, com `PURGED` escrito só quando as três lojas confirmaram; a instância da Evolution é removida antes do `DELETE` local, porque a credencial selada vive na linha que a cascata levaria embora.
- **A linha de exclusão sobrevive à purga como prova**, sem e-mail, nome, telefone ou conteúdo.
- **O aviso persistente vem do servidor e suprime o banner falso** enquanto o prazo corre; a tela conta os dias a partir do `dueAt` devolvido, nunca do pedido.
- **`PUBLIC_API_V1.md` mudou só onde devia:** a tabela de rotas, os dois campos novos de `GET /v1/status` e a seção nova do ciclo de vida.

## Limites do aceite e resíduos

- **Nenhuma purga rodou contra dado real.** Toda prova é contra PostgreSQL descartável e dublês das rotas internas remotas. `ACCOUNT_PURGE_ENABLED` nasce desligado: ligá-lo em produção é decisão de operação, não deste diff — mesma classe de gate operacional do M4 e dos Goals 010, 019 e 023.
- **O teto por passada vale nas duas lojas remotas; o apagamento local do BFF não tem teto** — é um `DELETE` em cascata a partir de `Tenant`. Defensável porque as tabelas por tenant do BFF são limitadas por natureza, ainda que o §5 fale em teto "por loja". Registrado em D-041 como condição de revisão.
- **`decideCancel` usa o relógio do processo enquanto o claim usa o do banco** — mesma tolerância já praticada no Goal023, não uma divergência nova deste Goal.
- **Os `{@link}` em `tenantPurge.ts` (IA e Scheduling) apontam nomes de arquivo de teste inexistentes**; os reais são `tests/internal/tenant-purge.schema.test.ts` e `tests/unit/tenant-purge-schema.test.ts`. Comentário errado, não comportamento errado.
- **`validate:ui` cobre só rota pública.** Configurações é autenticada inteira, então o que o gate decide aqui é a não regressão das superfícies públicas e do chrome. Fidelidade visual à referência aprovada continua sendo conferência humana.
- **A retirada do legado não foi feita**, por escopo declarado: é do Goal026.
