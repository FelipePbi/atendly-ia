# Review formal — Goal 033

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-20, conforme o [Goal033](../goals/033-gate-renderizado-nas-telas-autenticadas.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–032) foi reaberto, reavaliado ou revertido. Três rodadas: duas `CHANGES_REQUIRED` (4 e 1 blockers) e o aceite na terceira, com zero blockers.

O Goal tinha uma classe única de risco, nomeada no enunciado: **fabricar a prova**. Um gate que injetasse cookie de sessão, medisse a tela de login achando que era a Agenda, medisse o esqueleto de carregamento em vez do conteúdo, ou usasse uma régua mais frouxa para a tela autenticada produziria verde que não corresponde a nada. A revisão foi conduzida contra esse risco. Nenhuma das duas recusas foi sobre ele: o núcleo — sessão digitada, régua única, prova de rota antes de medir — estava certo desde a rodada 1, e as recusas foram sobre documento vigente afirmando o que o código não faz e sobre duas medidas que tinham sobrado duplicadas.

## Escopo e identidade do diff

- Baseline aceita vigente: `dbea66416e8025a75cedf51a60a7cc921ac45fd0` (implementação do Goal032). Base imediata da implementação: `4527c49360e33ae417ab82ce03b4052cb319e6f5` (fechamento do Goal032), HEAD da worktree `.ai-worktrees/goal-033`, inalterado nas três rodadas.
- Snapshot aceito, calculado pelo IA Loop: **21 arquivos**, hash do diff `94a1e866729fd204844ef46d18f61b362e98c3ac2ec42ad725a1502f1ea2edbd`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Por área: **gate renderizado** 7 arquivos (`apps/frontend/e2e/measure.ts` novo, `authenticated-matrix.spec.ts` novo, `playwright.authenticated.config.ts` novo, `routes.ts`, `viewport-matrix.spec.ts`, `accessibility.spec.ts`, `playwright.config.ts`); **correção de produto** 2 arquivos de CSS (`apps/frontend/src/shared/styles/avenly-agenda.css`, `avenly.css`); **ensaio e gate** 4 arquivos (`scripts/goal033-authenticated-ui-rehearsal.mjs` novo, `scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` novo, `scripts/validate-integration.mjs`, `scripts/tests/validate-integration.test.mjs`); **harness do IA Loop** 2 arquivos (`tools/ia-loop/lib/deterministic-executor.mjs`, `tools/ia-loop/tests/deterministic-executor.test.mjs`) — ver o desvio 1 abaixo; **documentação** 6 arquivos em `docs/migration/`.
- **Nenhum arquivo de `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/` ou `apps/evolution-go/` mudou.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota, nenhum contrato público. `package.json` intocado: nenhuma entrada `rehearse:*` foi criada, mantendo o padrão confirmado no [review032](032-review.md).
- Inspecionado o patch completo de cada rodada contra a worktree, não contra o relatório do Developer. Nenhum arquivo foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

O núcleo já estava certo: extração verbatim da régua, sete rotas autenticadas com os três excluídos justificados no código, recusa de destino não descartável antes de qualquer conexão, semeadura só por rota de produto (zero `INSERT` direto na árvore inteira), nenhum bypass de auth e nenhum afrouxamento de throttle. Os quatro blockers:

1. **Documento vigente negando mudança que existe.** D-049 afirmava em negrito que nenhum arquivo fora de `apps/frontend/`, `scripts/` e `docs/migration/` tinha mudado, enquanto o diff alterava `tools/ia-loop/lib/deterministic-executor.mjs` e seu teste. A correção de harness é necessária e está certa; o defeito era o documento afirmar que ela não existe.
2. **Caracterização divergente do achado de `/agenda` entre quatro textos.** D-049, VALIDATION_GATE e GAP_ANALYSIS diziam "overflow do cabeçalho"; FINAL_AUDIT §10 registrava o que foi de fato medido — `<h1>Agenda</h1>` em caixa 0×33px. Nenhuma evidência da rodada mostrava a asserção de overflow reprovando naquela rota e largura.
3. **Limiar errado em FINAL_AUDIT §10:** a correção de `.agenda-page-header` foi descrita como "abaixo de 640px"; a regra alterada vive dentro de `@media (max-width: 767px)`.
4. **Duas das cinco medidas ainda duplicadas**, contra §1 e o critério 1: `measure.ts` ganhou `measureFirstTabFocus`, `hasFocusIndicator` e `measureRunningAnimations`, mas `accessibility.spec.ts` mantinha cópias inline equivalentes da leitura de foco, da regra outline-ou-sombra e do literal `0.2`.

## Rodada 2 — CHANGES_REQUIRED (1 blocker)

Os quatro blockers foram conferidos na árvore: D-049 passou a declarar a mudança de harness com o motivo; a caracterização do achado de `/agenda` ficou uniforme nos quatro documentos e bate com o comentário no CSS; a deduplicação é real (`accessibility.spec.ts` importa as três funções de `./measure`, e `REDUCED_MOTION_TOLERANCE_SECONDS` vive só dentro de `measureRunningAnimations` — uma implementação, um limiar). O blocker 3 tinha sido corrigido só em FINAL_AUDIT:

1. **O limiar de 640px sobrevivia em dois documentos** — `CURRENT_STATE.md:2891` e `DATA_MIGRATION.md:741` — enquanto a regra alterada está em `avenly-agenda.css:1229`, dentro do bloco `@media (max-width: 767px)` aberto em `:1192`.

## Rodada 3 — ACCEPTED

O diff r2→r3 contém exatamente duas linhas: 640px passa a 767px nos dois pontos, conferido contra o CSS. O fingerprint dos arquivos não rastreados é idêntico ao da rodada 2 (mesmos cinco arquivos, mesmos `sha256`), então nada mais da árvore mudou.

Verificação dirigida, por inspeção própria do reviewer:

- **Régua única.** `apps/frontend/e2e/measure.ts` concentra `TOUCH_TARGET_AA` (24), `TOUCH_TARGET_COMFORTABLE` (44), `OVERFLOW_TOLERANCE` (1), `REDUCED_MOTION_TOLERANCE_SECONDS` (0.2), a regra `targetBox = labelBox ?? ownBox` e `findStaleExceptions`. Os três specs importam dela; o spec autenticado não tem limiar próprio. O diff de `viewport-matrix.spec.ts` é −125/+16, só troca de chamadas.
- **Sessão real.** O login é digitado em `/login` (`form.auth-form`, preenchimento de e-mail e senha, submit). O `storageState` é derivado **desse** login real, por worker, com identificador de execução e teto de frescor — não é cookie fabricado. O reuso por worker está declarado e tem motivo verificável: o produto limita `POST /v1/auth/login` a dez tentativas por IP a cada quinze minutos e o gate faz 35 medições; logar a cada medição bateria no limite, e a alternativa seria mexer no BFF, que o Goal proíbe.
- **Cada rota prova que é ela mesma.** `pathname` final, `a[href][aria-current="page"]`, nome do negócio semeado e marcador de conteúdo próprio, cada um com teto declarado e mensagem própria — antes de qualquer medição.
- **Gate público intocado.** `playwright.config.ts` só ganhou `testIgnore` do spec autenticado, necessário porque `testDir: ./e2e` passava a coletá-lo e o gate público devolveria zero testes. `validate:ui` continua com as mesmas sete rotas, as mesmas cinco larguras, `npm run start` e nenhuma pré-condição de banco: exit 0, 42,4 s, 169 `expected`, 21 `skipped`, 0 `unexpected` — o mesmo resultado registrado em FINAL_AUDIT §5.1/§8.
- **O gate cresce sem encolher.** `rehearse:goal033-authenticated-ui` entrou como 35º passo de `validate:integration`, depois de `rehearse:goal032-auto-reply`; a lista exata de `scripts/tests/validate-integration.test.mjs` foi estendida de 34 para 35, não encolhida. Os guards do ensaio (`resolveRehearsalPlan`, `assertPortsFree`) ganharam teste permanente rodado por `npm run test:gate`.
- **Nenhuma linha de base nova.** `KNOWN_SMALL_TARGETS` e `KNOWN_CONTRAST_FAILURES` do spec autenticado estão vazios: as duas reprovações foram corrigidas em CSS, não baselineadas — por isso nenhum achado abre a partir de A-20, o que FINAL_AUDIT §10 declara explicitamente.
- **Higiene.** Nenhum `eslint-disable` novo; o único `test.skip` em `e2e/` é o preexistente de toque fora de mobile; `git status --porcelain` lista só os cinco arquivos novos declarados; nenhum comando `pnpm`/`corepack`.

## O que o diff aceito entrega

- **As sete telas onde o produto realmente vive passam a ser medidas**: `/inicio`, `/agenda`, `/clientes`, `/conversas`, `/configuracoes`, `/servicos` e `/notificacoes`, nas cinco larguras, com as cinco medidas do gate renderizado — pela mesma régua que o gate público usa, nunca por uma cópia mais frouxa.
- **A sessão é digitada na tela de login do produto**, contra a pilha real em processo e um negócio semeado inteiramente por rota de produto, inclusive a mensagem entrante, que entra pelo caminho durável real do webhook. Zero `INSERT` direto.
- **Duas dívidas reais de produto foram encontradas e corrigidas**: o `<h1>` da Agenda comprimido a 0×33px em 360px, porque a coluna `auto` das ações tomava a largura inteira; e o checkbox nativo de `.switch-row` em 13×13px, abaixo do mínimo AA.
- **Quatro controles negativos**, um por medida obrigatória — overflow, alvo de toque, contraste e login quebrado —, cada um derrubando o gate ou o ensaio com falha nomeada e revertido depois.
- **A-02 fecha com medição executada**, não por declaração: a auditoria passa a 0 `BLOQUEADOR-MVP`, 10 `PENDENCIA-POS-MVP` (era 11) e 7 `LIMITE-DECLARADO`, sem tocar A-03 a A-19.

## Desvios aceitos explicitamente

1. **Critério 20 violado na letra.** `tools/ia-loop/lib/deterministic-executor.mjs` e seu teste estão modificados, fora de `apps/frontend/`, `scripts/` e `docs/migration/`. É correção de harness (`patternRelativeToScope`: o filtro de teste escopado concatenava `apps/frontend` com `apps/frontend/tests` e o vitest devolvia "No test files found" em vez de rodar a suíte pedida), com três testes novos. Não enfraquece verificação nenhuma e não toca produto; reverter reabriria a falha da verificação sem ganho de produto. Registrado como desvio aceito e declarado em [D-049](../DECISIONS.md), não como prova ausente.
2. **`/agenda` em `desktop-1440` é flaky.** Estourou 20 s esperando o nome do cliente semeado na primeira tentativa e passou no retry (`retries: 1`, o mesmo valor do gate público). O resultado da execução é 34 `expected`, 1 `flaky`, 0 `unexpected`. É o ponto mais fraco da evidência deste gate: um retry mascarando essa espera. Se reaparecer, vira dívida a investigar no próximo Goal que tocar a Agenda.
3. **Controle negativo 4 (login quebrado) rodou com o config temporariamente reduzido** a `mobile-360` e `retries: 0`, por causa do throttle real de login. Mesmo caminho de código, mesma mensagem; reversão confirmada por `git status`.

## Gates — o que foi aceito e com que prova

- `typecheck`, `lint` e `test:gate`: `PASSED` nesta rodada.
- `targeted-tests`: constou `FAILED` por bug do próprio harness (o mesmo `patternRelativeToScope` do desvio 1), não da árvore. Não aceitei explicação de terceiros: o reviewer rodou `npx vitest run tests` em `apps/frontend` — 72 arquivos, 666 testes, exit 0.
- `validate:core`, `validate:ui` e `validate:integration`: exit 0, rotulados `OBSERVED` pelo harness só por causa da cadeia do passo acima. Aceitos como verdes porque rodaram sobre esta mesma árvore e depois da correção do harness, e porque o log de `validate:integration` mostra a pilha real subindo e o gate autenticado medindo de fato (`apps/frontend/e2e-results/authenticated/results.json`, 85111 ms).
- Na rodada 2 o `validate:integration` **não** rodou no harness, por falta de `BFF_TEST_DATABASE_URL`, `AI_TEST_DATABASE_URL`, `EVOLUTION_TEST_DATABASE_URL` e `SCHEDULING_TEST_DATABASE_URL`. Isso foi declarado como ausente, nunca apresentado como verde.

## Observação não bloqueante

`npx eslint e2e` acusa dois erros em `authenticated-matrix.spec.ts` (`simple-import-sort/imports`, autofixável, e um falso positivo de `react-hooks/rules-of-hooks` no fixture `use` do Playwright). O script `npm run lint` cobre `src tests`, não `e2e/`, então nenhum gate fica vermelho.

## O que este aceite não cobre

- **Fidelidade visual à referência aprovada** (`docs/design-reference/claude-design/`) continua sendo conferência humana. Este gate decide só overflow, alvo de toque, contraste, foco e movimento reduzido, e nenhum documento afirma o contrário.
- **M4 — envio real a número real — continua aberto** como gate operacional. Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para WhatsApp real.
- **`/importacao`, `/sistema` e `/onboarding`** seguem declaradamente fora do gate autenticado, com o motivo escrito no código.
- **Os demais achados abertos.** Nenhum achado de A-03 a A-19 foi corrigido, reclassificado ou tocado.
