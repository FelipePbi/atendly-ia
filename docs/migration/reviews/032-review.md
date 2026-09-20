# Review formal — Goal 032

**Decisão — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-20, conforme o [Goal032](../goals/032-resposta-automatica-provada-ponta-a-ponta.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–031) foi reaberto, reavaliado ou revertido. Uma rodada, zero blockers.

O Goal tinha uma classe única de risco, nomeada no próprio enunciado: **fabricar a prova**. Um ensaio que substituísse o processador, chamasse o `AssistantService` direto, injetasse provedor de modelo por dentro da fábrica de produção ou afirmasse envio sem que o transporte real tivesse sido chamado repetiria, com aparência de prova, o limite que o Goal030 já havia declarado. A revisão foi conduzida contra esse risco, com execução própria — não só leitura do diff.

## Escopo e identidade do diff

- Baseline aceita vigente: `dcc00466abf82cdfabadf14ead54648e2181d260` (implementação do Goal031). Base imediata da implementação: `da502d176f42277990d05abfb75b159bbf947502` (fechamento do Goal031), HEAD da worktree `.ai-worktrees/goal-032`.
- Snapshot aceito, calculado pelo IA Loop: **13 arquivos**, hash do diff `203cc9b59b3a1e6824153b264e64537a13aa7c9d3aab3c4863784e4152d0e026`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **costura de ambiente** 2 arquivos (`apps/ai-orchestrator/src/modules/model/model-provider.ts`, `apps/ai-orchestrator/src/modules/knowledge/embedding-provider.ts`); **teste de unidade novo** 1 arquivo (`apps/ai-orchestrator/tests/model/openai-base-url.test.ts`); **ensaio e gate** 4 arquivos (`scripts/goal032-auto-reply-rehearsal.mjs`, `scripts/tests/goal032-auto-reply-rehearsal.test.mjs`, `scripts/validate-integration.mjs`, `scripts/tests/validate-integration.test.mjs`); **documentação** 6 arquivos em `docs/migration/`.
- **Nenhum arquivo fora de `apps/ai-orchestrator/`, `scripts/` e `docs/migration/` mudou.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota, nenhum contrato público, nenhum arquivo de `apps/bff/`, `apps/frontend/`, `apps/scheduling-service/` ou `apps/evolution-go/`. `package.json` não foi modificado — ver a observação 1 abaixo.
- Inspecionado o patch completo contra a worktree, não contra o relatório do Developer. Nenhum arquivo foi editado pelo reviewer.

## Verificação por execução própria

Execução do reviewer na worktree, contra cluster PostgreSQL descartável em `127.0.0.1:55433`:

- **Ensaio verde, exit 0.** As três asserções centrais com contagem lida do banco e do dublê de transporte: evento `DONE` mais **exatamente uma** `Message` `OUTBOUND` com o texto que o dublê de modelo devolveu naquela execução (`count=1`); o transporte recebeu **exatamente um** envio, com esse mesmo texto e o telefone do contato (`count=1`); a linha `OUTBOUND` já existia quando o transporte foi chamado (`count=1`). Os quatro elos com `pass=true`. Espera real do worker: 1309 ms contra o teto declarado de 60000 ms (`WORKER_WAIT_TIMEOUT_MS`).
- **Controle negativo rodado pelo reviewer nos quatro elos.** `GOAL032_BREAK_LINK=human-control | ignore-ai | idempotency | supersede` → `exit 1` nos quatro, cada um com mensagem própria do elo. Exemplo: `human-control` reprova relatando `model=1 response`, `transport=1 send` e `event=DONE/replied` onde o íntegro dá `DONE/paused_conversation`. Nos elos íntegros da mesma execução as demais asserções seguem `pass=true`, e o caminho verde é idêntico sem a variável — a quebra existe só por ambiente, não há resíduo de quebra na árvore.
- **Gates do Developer sobre a árvore final**, conferidos no relatório e compatíveis com a execução própria: `typecheck` exit 0, `lint` exit 0, `targeted-tests` exit 0, `test:gate` exit 0 (868 ms), `validate:core` exit 0 (58459 ms), `validate:integration` exit 0 (103255 ms, com a pré-condição de banco descartável presente — não houve passo declarado ausente), `git diff --check` exit 0.

## Inspeção do diff

- **§1 — a costura é de ambiente e só isso.** `configuration: { baseURL: env.OPENAI_BASE_URL }` em `model-provider.ts` e `embedding-provider.ts`, e nada mais. `config/env.ts` intocado: o default `https://api.openai.com/v1` está preservado e nenhuma variável nova existe. `requireOpenAiEnv()` e `requireEmbeddingEnv()` inalteradas — chave ausente continua falhando como antes. A extração de `createChatOpenAI()` é extração da construção inline, **não** um ponto de injeção: `invoke()` mantém as mesmas opções e continua chamando `.bindTools(...)`. O teste de unidade afirma a base **efetiva** dos dois provedores (4 casos, por `clientConfig.baseURL`), no default e redirecionada — nunca só "não lançou".
- **§2 e §3 — o caminho é o de produção.** O ensaio recusa destino não descartável antes de qualquer escrita (`resolveRehearsalPlan` e `assertRequiredBinaries` rodam antes de conexão, `DROP` ou subprocesso). Os dois dublês são conferidos pelo endereço **efetivo** depois do `listen`, ambos em `127.0.0.1`. `INBOX_WORKER_ENABLED` está ligado e é conferido dentro do processo; as janelas são encurtadas por ambiente; não há claim manual nem relógio falso; `InboundEventDispatcher` roda sem `buildProcessor` injetado; nenhum substituto de processador, assistente, grafo ou transporte.
- **§4 — o gate cresce sem encolher.** `integrationSteps()` tem 34 passos, com `rehearse:goal032-auto-reply` como último, logo depois de `rehearse:goal030-mvp-journey`. O teste permanente dos guards (`scripts/tests/goal032-auto-reply-rehearsal.test.mjs`, 7 casos) roda por `npm run test:gate`. A lista exata de passos afirmada por `scripts/tests/validate-integration.test.mjs` foi **estendida**, não encolhida. Nenhum passo, suíte, limiar ou rota existente foi removido, renomeado, pulado ou condicionado.
- **§7 — documentação sem reescrita do que já estava fechado.** `CURRENT_STATE`, `DATA_MIGRATION`, `DECISIONS` e `FINAL_AUDIT` são append puro (zero linhas removidas em cada — §6, §7 e §8 de FINAL_AUDIT intocados). `GAP_ANALYSIS` só acrescenta evidência nas células G-09, G-21 e G-33, sem reabrir fechamento. `VALIDATION_GATE` atualiza 33→34 e descreve o que o passo decide e o que continua não decidindo.
- **Higiene.** Nenhum `eslint-disable` novo, nenhum teste pulado, `git status --porcelain` sem artefato não declarado, nenhum comando `pnpm`/`corepack`.

## O que o diff aceito entrega

- **A promessa central do produto, provada por execução.** Pela primeira vez neste repositório, uma execução produziu a resposta que o cliente receberia: `POST /webhooks/evolution` real → `ProcessedEvent` gravado antes do `202` → claim pelo `InboxWorker` real → `buildInboundMessageProcessor` de produção → grafo, `AssistantService`, sessão, memória e ferramentas reais → `EvolutionProvider` real chamando o transporte. Os dois únicos dublês são as duas fronteiras **externas**.
- **A prova é lida do banco e do transporte, não do `200` da resposta HTTP**, e o texto conferido é o que o dublê de modelo devolveu naquela execução — não um texto fixo comparado consigo mesmo.
- **A ordem do G-09 conferida na execução.** A `Message` `OUTBOUND` já existia quando o transporte foi chamado — antes isso estava provado só por leitura de código.
- **Quatro elos de controle negativo, cada um provado nos dois sentidos**: controle humano e `Ignorar IA` (que também afirmam que o dublê de modelo **não** foi chamado), idempotência e supersede. Quebrar um elo é sempre pular uma etapa do percurso, nunca relaxar uma asserção nem tocar código de produção.
- **A fronteira externa do OpenAI passa a ser configurável como a do WhatsApp já era**, valendo igual em produção — e não uma costura que existe para teste.
- **O resíduo de ferramental do [review029](029-review.md) fecha para este ensaio**: os guards têm teste permanente rodado por `npm run test:gate`.

## Observações não bloqueantes

1. **`package.json` não mudou.** O critério 14 pede "script próprio em `package.json`", mas nenhum ensaio anterior (Goal028, 029, 030) tem script próprio — não existe nenhuma entrada `rehearse:*` no arquivo — e o passo roda pelo `validate:integration` já existente. A escolha foi declarada pelo Developer e mantém o padrão dos anteriores; registrada aqui como divergência literal de enunciado, não como defeito.
2. **[D-048](../DECISIONS.md) descreve `createChatOpenAI()` como método de `LangChainModelProvider`**; é função exportada de módulo. Impreciso, sem consequência.
3. **A prova positiva não exercita embeddings** (`model.embeddings=0`): a fronteira de embeddings fica coberta apenas pelo teste de unidade — que é exatamente o que o Goal exige.

## O que este aceite não cobre

- **M4 — envio real a número real — continua aberto como gate operacional.** Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para o WhatsApp real, e nenhum documento afirma o contrário.
- **O laço de ferramentas contra o Scheduling real, áudio, mídia e grupo** seguem declaradamente fora do ensaio (`SCHEDULING_SERVICE_BASE_URL` aponta para loopback onde nada escuta).
- **Qualidade de modelo real.** O dublê de modelo prova o caminho, nunca a resposta que um modelo real produziria; os evals do Goal011 continuam sendo a prova de guard contra modelo roteirizado.
- **A-02 e os demais achados abertos.** Nenhum achado de A-02 a A-19 foi corrigido, reclassificado ou tocado, e a contagem do veredito de [FINAL_AUDIT §7](../FINAL_AUDIT.md) não muda.
