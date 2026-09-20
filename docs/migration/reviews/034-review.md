# Review formal — Goal 034

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-20, conforme o [Goal034](../goals/034-guardrails-do-produto-como-invariante-verificada.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–033) foi reaberto, reavaliado ou revertido. Três rodadas: duas `CHANGES_REQUIRED` (2 e 3 blockers) e o aceite na terceira, com zero blockers.

O Goal tinha uma classe única de risco, nomeada no próprio enunciado: **afirmar invariante que não existe** e **fabricar prova**. Trocar `EVOLUTION_IGNORE_GROUPS` por descarte incondicional não fecha A-10 se nada ficar vermelho quando a condição voltar; escrever uma frase em `MAIN_RULES` não prova A-09, porque eval com dublê roteirizado demonstra que o teste escolheu bem a fala, não que o modelo real obedece. A revisão foi conduzida contra esse risco, e as duas recusas foram exatamente dele: um check estático cujo escopo real era menor do que quatro textos afirmavam, e um controle negativo substituído por um proxy mais fraco, com a documentação afirmando o contrário. O núcleo — as duas pontas da invariante de grupo, o predicado único, a separação entre o que o código garante e o que o prompt orienta — estava certo desde a rodada 1.

## Escopo e identidade do diff

- Baseline aceita vigente: `090ee2897835142b59c979ddb24d4372c2f4398e` (implementação do Goal033). Base imediata da implementação: `dfc6afefa0d117541512c1d01c5b213a38889a91` (fechamento do Goal033), HEAD da worktree `.ai-worktrees/goal-034`, inalterado nas três rodadas.
- Snapshot aceito, calculado pelo IA Loop: **27 arquivos**, hash do diff `77b65a98a729b4e35687a6dbfe105844f565dd0a0452f3f6469cc25e1bf4b7c2`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **invariante de grupo** 6 arquivos (`src/config/env.ts`, `src/modules/channel/InboundMessageProcessor.ts`, `src/modules/channel/domain/ChannelMessage.ts`, `src/modules/channel/adapters/evolution/EvolutionInboundMapper.ts`, `src/modules/graph/message-graph.ts`, `src/modules/graph/graph-state.ts`); **configuração** 2 arquivos (`.env.example`, `docker-compose.yml`); **textos do produto e prompt** 2 arquivos (`src/modules/assistant/assistant.service.ts`, `src/modules/prompts/system.ts`); **testes do ai-orchestrator** 6 arquivos, sendo `tests/evals/waiting-message-vocabulary.eval.test.ts` novo; **gate e ensaio** 6 arquivos em `scripts/`; **documentação** 5 arquivos em `docs/migration/`.
- **Nenhum arquivo de `apps/frontend/`, `apps/bff/`, `apps/scheduling-service/` ou `apps/evolution-go/` mudou.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota, nenhum contrato público. `package.json` intocado, nenhum passo de `validate:integration` criado, removido ou renomeado — a lista permanece com 35 passos. Nenhum `eslint-disable` novo. O único arquivo não rastreado é o da eval, declarado no relatório.
- Inspecionado o patch completo de cada rodada contra a worktree, não contra o relatório do Developer. Nenhum arquivo foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (2 blockers)

O grosso já estava certo e foi conferido na árvore: as oito ocorrências de `EVOLUTION_IGNORE_GROUPS` tratadas e nenhuma sobrando em `apps/**`; o descarte em `InboundMessageProcessor.ts:243` incondicional, no mesmo ponto do fluxo, com `action: "ignored_group"`; o caso "ignora grupos apenas enquanto a configuracao mandar" substituído — não removido — por um que prova o descarte incondicional, com os testes irmãos de grupo intactos; a recusa de saída em `message-graph.ts:1179` usando `isGroupJid` compartilhado com o mapper, com erro nomeado, log próprio, `recordDelivery` `FAILED` e teste próprio, e os outros quatro chamadores de `sendText` intocados com o motivo escrito no código; `PRODUCT_OWN_TEXTS` reunindo os sete textos fixos mais as três saudações de estilo sem alterar um caractere, conferido contra `git show HEAD:`; `MAIN_RULES` com a regra 16 e `PROMPT_TEMPLATE_VERSION` em `v6` com justificativa e hashes reais atualizados; a eval declarando por escrito o que não prova. Os dois blockers:

1. **Controle negativo 3 executado como proxy mais fraco do que o especificado.** §9.3 e o critério 16 exigem que fazer o elo novo aceitar resposta a grupo derrube o **ensaio** com falha nomeada. A WU-08 removeu a entrada `group` de `BREAKABLE_LINKS` e rodou o teste de registro — o que prova o guard de registro, não o ensaio. O ramo quebrado de `exerciseGroupLink` nunca tinha sido executado, e `checkGroupLink` nunca tinha sido visto reprovando, embora a WU-17 já provasse que havia cluster descartável disponível. FINAL_AUDIT §11 afirmava, mesmo assim, que os cinco controles derrubaram "o gate ou o ensaio correspondente com falha nomeada".
2. **`group_discard_is_not_configuration` afirmava escopo que não tinha.** O check recebia só `sourceFiles("apps")`, que coleta apenas `.cjs|.js|.jsx|.mjs|.ts|.tsx` — logo `.env.example` e `docker-compose.yml` nunca eram lidos, e a chave reaparecendo no `docker-compose.yml` não deixaria nada vermelho. Quatro textos diziam o contrário: o `details` do próprio check, a tabela de VALIDATION_GATE, D-050 e a fixture do teste de regressão, que usava um path `apps/ai-orchestrator/.env.example` que a chamada real jamais entregava à função — cobertura aparente sem cobertura real.

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

O blocker 2 da rodada 1 foi resolvido e verificado de forma independente: `configurationFiles("apps")` (`.env.example` e `docker-compose*.yml`) passou a ser somado a `appsSources` antes de `findGroupDiscardConfigurationViolations`, e o teste novo em `scripts/tests/final-production-audit.test.mjs` roda o script real contra um `.env.example` mutado — executado pelo reviewer, 2/2 `pass`, incluindo o caso que exige `ok:false` com o arquivo nomeado e exit 1. Os três blockers desta rodada:

1. **O blocker 1 da rodada 1 não foi resolvido, e nunca foi blocker de código.** A FIX-001 o leu como "falta implementar o elo `group`", concluiu que o código já existia — verdade — e fechou a unidade rodando o mesmo guard de registro rejeitado na rodada 1. O que faltava era **execução**: o ramo quebrado de `exerciseGroupLink` continuava sem ter rodado uma única vez.
2. **FINAL_AUDIT §11 continuava afirmando o que não aconteceu** — os cinco controles executados e revertidos "pela WU-08 desta rodada" —, falso para o controle 3. Mesmo tratamento pedido para DATA_MIGRATION §20, que descrevia `GOAL032_BREAK_LINK=group` derrubando o ensaio como fato observado.
3. **`scripts/validate-integration.mjs:608` mentia sobre o próprio passo:** o comentário de `rehearse:goal032-auto-reply` ainda dizia "os quatro elos de controle negativo". São cinco desde este Goal.

## Rodada 3 — ACCEPTED

Os três blockers foram conferidos na árvore, e o crítico foi verificado por **execução própria do reviewer**, não por relato:

- **Controle negativo 3, na pilha real**, rodado pelo Tech Lead na worktree contra o cluster descartável em `127.0.0.1:55432`. Com `GOAL032_BREAK_LINK=group`, o ensaio saiu `exit 1` com a falha nomeada de `checkGroupLink` (`model=1 response`, `transport=1 send`, `outbound-delta=1`, `event=DONE/replied`, `pass=false`). Logo depois, o ensaio íntegro saiu `exit 0` com o elo `group` em `model=0`, `transport=0`, `outbound-delta=0`, `event=DONE/ignored_group`, `pass=true`. Prova nos dois sentidos, sem alterar código de produção e sem quebra sobrando na árvore.
- **FINAL_AUDIT §11** deixou de afirmar o que não aconteceu: separa os quatro controles executados pela WU-08 do quinto, executado na rodada 3, citando os dois comandos. **DATA_MIGRATION §20** passou a ser verdadeiro sem edição, porque o controle foi de fato executado.
- **O comentário de `validate-integration.mjs`** passou a dizer cinco elos, nomeando `group`.
- Reverificações próprias: `audit:static` exit 0 com `group_discard_is_not_configuration` e `frontend_has_no_dark_theme_css` ambos `ok: true`; `npm run test:gate` com 182 `pass` / 0 `fail`, e os 35 passos de `validate:integration` intactos.

### Gates da rodada 3

Os oito gates declarados do Goal rodaram nesta mesma árvore e passaram: `typecheck`, `lint`, `targeted-tests`, `unit-tests` e `gate-tests` exit 0; `validate:core` exit 0 (45497 ms); `validate:ui` exit 0 (43117 ms); `validate:integration` exit 0 (181955 ms), com a pré-condição de bancos descartáveis presente — nada foi apresentado como verde sem ter rodado.

## Observação não bloqueante

O teste de fechamento de `PRODUCT_OWN_TEXTS` varre literais dentro de `messages: [...]` de `assistant.service.ts`. Um texto novo emitido por `text:` ou por um `return "..."` direto escaparia do fechamento. O escopo está declarado honestamente na documentação, e apertá-lo é trabalho de um Goal futuro, não deste.

## O que este aceite não cobre

- **A-09 não está provado por eval.** A eval nova prova o que o runtime controla — o turno de tool não emite mensagem por conta própria. Aderência do modelo real à regra 16 de `MAIN_RULES` não é demonstrável com dublê roteirizado, e nenhum documento deste diff afirma o contrário.
- **`frontend_has_no_dark_theme_css` é guarda de forma reconhecida**, não prova de que nenhuma tela pareça escura: cor escura pode ser escrita sem media query nem seletor de tema.
- **M4 — envio real a número real — continua aberto** como gate operacional. Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para WhatsApp real.
- **Fidelidade visual à referência aprovada** continua sendo conferência humana, como no [review033](033-review.md).
- **Os demais achados abertos.** A-03 a A-08, A-11 a A-17 e A-19 não foram corrigidos, reclassificados nem tocados, e nenhum achado novo entrou a partir de A-20.
