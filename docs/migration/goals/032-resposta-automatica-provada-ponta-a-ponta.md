# Goal 032 — Resposta automática provada ponta a ponta

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal031 ACCEPTED](../reviews/031-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 032 nasce na [v53 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 031, sem renumerar para trás e sem remover ID. Ela existe por um fato que o próprio percurso do Goal030 registrou e que a v52 deixou explicitamente "para o planejamento seguinte decidir": **a resposta automática da IA nunca foi provada ponta a ponta**.

## Baseline aceita

Baseline aceita: `dcc00466abf82cdfabadf14ead54648e2181d260`

Goal anterior: 031 — Alvo de toque real nas telas públicas

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal031 já integrado em `main` (origem `e3edf80b7594ef36c5c8dbfb7f49e8982027bf82`), com a régua de alvo de toque corrigida, o alvo de `/link-expirado` corrigido, o [review031](../reviews/031-review.md) e a documentação de fechamento. O commit `9a14d0e`, posterior a ele, corrige apenas o cabeçalho de status do documento do próprio Goal031 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Provar, por execução e contra banco real, a promessa central do produto: **a mensagem que chega pelo WhatsApp é respondida automaticamente pela IA**, pelo caminho que a produção usa, do webhook até a saída entregue ao transporte.

O que existe hoje provado, em qualquer Goal deste repositório, é **recebimento durável e persistência na conversa**. A geração de resposta é exercitada em evals com modelo roteirizado, e o despacho da inbox é exercitado contra PostgreSQL com um processador dublê. Nenhuma suíte junta as duas pontas: **nenhuma execução deste repositório produziu a resposta que o cliente receberia**.

Isso não é regressão de Goal nenhum, e não reabre aceite algum. É a lacuna que a composição do Goal030 foi a primeira em posição de revelar, e ela cai direto sobre a [Definition of Done global do MVP](../MASTER_PLAN.md#definition-of-done-global-do-mvp), que exige "WhatsApp ponta a ponta e recuperação/entrega observável".

O risco próprio deste Goal tem uma classe só, e é o oposto do risco de um Goal de feature: **fabricar a prova**. Um ensaio que substitui o processador, que chama o `AssistantService` direto, que injeta um provedor de modelo por dentro da fábrica de produção ou que afirma envio sem que o transporte real tenha sido chamado não prova nada — repete o que o Goal030 já declarou como limite, com aparência de prova. Tudo aqui é medido por esse critério.

## Dependências e contexto mínimo

- Goals 001 a 031 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [CURRENT_STATE](../CURRENT_STATE.md), delta030: o FATO revelado "a resposta automática da IA nunca foi provada ponta a ponta" e o que a etapa 6 do percurso prova e não prova.
- [FINAL_AUDIT](../FINAL_AUDIT.md) §5.2–§5.4 e §7: o que os gates decidem, e a contagem vigente do veredito.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, pré-condição de bancos descartáveis de `validate:integration` e limites conhecidos.
- [DATA_MIGRATION §17](../DATA_MIGRATION.md#17-percurso-único-de-produto-ponta-a-ponta-goal030): a forma de documentar um ensaio de composição, incluindo elos de controle negativo.
- [AGENTS.md](../../../AGENTS.md), seções **WhatsApp** e **IA**: os guardrails que a resposta automática precisa respeitar — profissional que responde manualmente tira a IA de cena, `Ignorar IA` é absoluto, grupos fora do MVP, nunca confirmar antes de concluir.
- **Product Vault:** consulta dirigida (1–3 notas) só se precisar confirmar a regra de produto do atendimento automático. Não abrir o vault inteiro.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `dcc00466`. Não gastar rodada redescobrindo:

- **O laço de produção vive no próprio processo da IA.** `apps/ai-orchestrator/src/app.ts:72`–`:92` monta `InboxWorker` sobre `InboundEventDispatcher`; `:123` faz `worker.start()` somente `if (env.INBOX_WORKER_ENABLED)`; o webhook acorda o worker por `onEventStored`.
- **O dispatcher usa a fábrica de produção por padrão.** `apps/ai-orchestrator/src/modules/inbox/InboundEventDispatcher.ts:105` cai em `buildInboundMessageProcessor` quando `buildProcessor` não é injetado. A única suíte de integração que o exercita — `apps/ai-orchestrator/tests/integration/inbox-dispatch.test.ts:130` — **injeta** um processador dublê, e é por isso que o caminho do assistente nunca é exercitado ali.
- **A fábrica não tem costura de modelo.** `apps/ai-orchestrator/src/modules/channel/inbound-processor-factory.ts:43`–`:63` constrói o `AssistantService` real sem passar provedor, e `apps/ai-orchestrator/src/modules/assistant/assistant.service.ts:274`–`:277` faz o terceiro parâmetro cair em `new LangChainModelProvider()`. A mesma fábrica monta `EvolutionProvider`, `PGVectorKnowledgeStore` com `OpenAIEmbeddingProvider`, ferramentas, sessões e memória.
- **A fronteira do WhatsApp já é redirecionável por ambiente.** `apps/ai-orchestrator/src/modules/channel/adapters/evolution/EvolutionProvider.ts:53` monta a URL de envio com `env.EVOLUTION_BASE_URL` + `env.EVOLUTION_SEND_TEXT_PATH`.
- **A fronteira do OpenAI não é, e a variável para isso já existe e é ignorada por dois dos três chamadores.** `apps/ai-orchestrator/src/config/env.ts:55` declara `OPENAI_BASE_URL` com default `https://api.openai.com/v1`; só `apps/ai-orchestrator/src/modules/media/openai-transcription-provider.ts:41` a honra. `apps/ai-orchestrator/src/modules/model/model-provider.ts:57`–`:70` constrói `ChatOpenAI` (`useResponsesApi: true`, `zdrEnabled: true`) sem base URL, e `apps/ai-orchestrator/src/modules/knowledge/embedding-provider.ts:12`–`:17` constrói `OpenAIEmbeddings` sem base URL.
- **As janelas que adiam o trabalho são de ambiente, não de relógio de código.** `env.ts:98` (`AI_DEBOUNCE_MIN_SECONDS`, 8s), a espera de mensagem ambígua de primeiro contato (`AI_AMBIGUOUS_WAIT_SECONDS`, lida em `apps/ai-orchestrator/src/modules/inbox/InboxStore.ts:34`–`:36`) e `env.ts:113` (`INBOX_POLL_INTERVAL_MS`). Um ensaio pode encurtá-las por ambiente e deixar o worker real trabalhar; **não precisa de relógio falso nem de claim manual**.
- **O Goal030 declarou o limite no cabeçalho do próprio ensaio.** `scripts/goal030-mvp-journey-rehearsal.mjs:81` e `:1793` dizem que a resposta automática não é exercitada; `:754` desliga `INBOX_WORKER_ENABLED`; a etapa 6 (`:1776`–`:1900`) chama `assistant.recordInboundText()` direto, com um provedor de modelo dublê que **lança** se for chamado.
- **A saída já é persistida antes do transporte.** `assistant.service.ts:691` e `:1097` gravam `direction: "OUTBOUND"`, e o G-09 de [GAP_ANALYSIS](../GAP_ANALYSIS.md) registra a ordem "persistir em `Message` antes do transporte, com `correlationId`". O que falta não é a gravação — é a prova de que ela acontece quando o caminho inteiro roda.
- **Ensaio novo tem lugar e tem teste permanente.** `scripts/validate-integration.mjs:601` fecha a lista com `rehearse:goal030-mvp-journey`; os guards de ensaio têm suíte própria em `scripts/tests/` (por exemplo `goal029-goal030-rehearsal-guards.test.mjs`), que `npm run test:gate` roda.

## Pontos de implementação

- `apps/ai-orchestrator/src/modules/model/model-provider.ts` e `apps/ai-orchestrator/src/modules/knowledge/embedding-provider.ts`: honrar `OPENAI_BASE_URL`.
- `apps/ai-orchestrator/tests/model/` (arquivo novo): testes de unidade da fronteira configurável.
- `scripts/goal032-auto-reply-rehearsal.mjs` (arquivo novo): o ensaio.
- `scripts/validate-integration.mjs` e `package.json`: o passo novo do gate.
- `scripts/tests/` (arquivo novo): teste permanente dos guards do ensaio.
- `docs/migration/`: conforme §7.

**Nenhum arquivo fora de `apps/ai-orchestrator/`, `scripts/`, `package.json` e `docs/migration/` deve mudar.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota nova, nenhum contrato público, nenhum arquivo de `apps/bff/`, `apps/frontend/`, `apps/scheduling-service/` ou `apps/evolution-go/`.

## Escopo obrigatório

### 1. A fronteira externa do OpenAI passa a ser configurável, como a do WhatsApp já é

`LangChainModelProvider` e `OpenAIEmbeddingProvider` passam a usar `env.OPENAI_BASE_URL` como base das chamadas, do mesmo jeito que o provedor de transcrição já usa.

- **O default não muda** (`https://api.openai.com/v1`) e **nenhuma variável de ambiente nova é criada**.
- `requireOpenAiEnv()` e `requireEmbeddingEnv()` continuam exigindo o que já exigiam. Chave ausente continua falhando como antes.
- Cada um dos dois pontos tem teste de unidade que afirma a base efetiva — com a variável no default e com ela apontando para outro endereço. Teste que só afirma "não lançou" não conta.
- Esta é a **única** costura permitida para o ensaio. É de ambiente, vale igual em produção e não existe para teste: não entra costura de injeção na fábrica de produção, nem parâmetro opcional novo em `buildInboundMessageProcessor`, nem ramo condicional por variável de ensaio dentro de `apps/*/src`.

### 2. O ensaio: o caminho de produção inteiro, com as duas fronteiras externas em loopback

`scripts/goal032-auto-reply-rehearsal.mjs` sobe a IA real contra um banco descartável próprio, **com `INBOX_WORKER_ENABLED` ligado**, e prova a resposta automática.

- **A recusa de destino não descartável vem primeiro**, no mesmo padrão dos ensaios existentes: sem `AI_TEST_DATABASE_URL` apontando para cluster descartável, o ensaio recusa em vez de rodar.
- **Nenhum endereço fora de loopback.** As duas fronteiras externas viram dublês que escutam em `127.0.0.1`: um servidor compatível com a API que o `ChatOpenAI` usa (Responses API) mais o endpoint de embeddings, e um servidor que responde ao `POST` de envio do Evolution. Qualquer outra saída de rede é falha do ensaio.
- **O caminho é o de produção, sem substituto interno**: `POST /webhooks/evolution` por HTTP real → `ProcessedEvent` gravado antes do `202` → claim pelo worker real → `InboundEventDispatcher` **sem** `buildProcessor` injetado → `buildInboundMessageProcessor` → grafo, assistente, sessão e ferramentas reais → `EvolutionProvider` real chamando o dublê de transporte.
- **As janelas são encurtadas por ambiente**, não por relógio falso nem por claim manual. O ensaio espera o worker com teto de tempo declarado e falha por estouro com mensagem própria.
- **O que o ensaio prova, por leitura direta do banco e pelo que o dublê de transporte recebeu:** o evento terminou `DONE`; existe **exatamente uma** `Message` `OUTBOUND` na conversa, com o texto que o dublê de modelo produziu; o dublê de transporte recebeu **exatamente um** envio, para o telefone do contato, com esse mesmo texto; e a linha `OUTBOUND` já existia quando o transporte foi chamado — a ordem do G-09 conferida na execução, não no código.
- **O texto da resposta vem do dublê de modelo através do grafo real.** Texto fixo no ensaio, comparado consigo mesmo, é prova nenhuma: o valor conferido na saída é o que o dublê devolveu naquela execução.

### 3. Controle negativo: cada elo derruba o ensaio quando quebra

No padrão `GOAL030_BREAK_LINK` já existente, com registro nomeado por elo e saída real no relatório. **No mínimo quatro elos**, e estes quatro são obrigatórios:

1. **Controle humano.** Sessão sob takeover não recebe resposta automática: nenhum envio no transporte e **nenhuma chamada ao dublê de modelo**.
2. **`Ignorar IA`.** Contato marcado como ignorado não é atendido nem processado pela IA — mesmo par de asserções.
3. **Idempotência.** O mesmo evento entregue duas vezes produz **uma** resposta e **um** envio.
4. **Supersede.** Mensagem nova do mesmo contato antes de a saída pendente sair cancela essa saída, em vez de mandar as duas.

Cada elo é provado nos dois sentidos: com o elo íntegro o ensaio passa, com o elo quebrado o ensaio cai com `exit 1` e mensagem própria. Nenhuma quebra pode sobrar na árvore final.

### 4. O gate

- O ensaio vira passo de `validate:integration`, depois de `rehearse:goal030-mvp-journey`, com script próprio em `package.json` no padrão dos anteriores.
- Os guards do ensaio — recusa de destino não descartável e registro de elos — ganham **teste permanente** em `scripts/tests/`, rodado por `npm run test:gate`. Isso fecha, para este ensaio, o resíduo que o [review029](../reviews/029-review.md) declarou e o Goal030 herdou.
- Nenhum passo, suíte, limiar ou rota de gate existente é removido, renomeado, pulado ou condicionado.

### 5. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não chamar provedor de LLM real, nem WhatsApp real.** **M4** — envio real a número real — continua aberto como gate operacional, e este Goal não o fecha nem afirma tê-lo fechado.
- **Não substituir o processador, o assistente, o grafo ou o transporte** por dublê. Os dois únicos dublês autorizados são os dois serviços externos, em loopback.
- **Não acrescentar costura de teste em `apps/*/src`** além do `OPENAI_BASE_URL` de §1.
- **Não mexer no laço de entrega de notificações, na varredura de retenção nem na purga de conta**; eles ficam desligados no ensaio, como no Goal030.
- **Não corrigir achado da auditoria** (A-02 a A-19), não mexer em G-32, U-03 nem em deploy. Defeito de produto descoberto aqui vira **achado relatado**, não correção silenciosa — a decisão é do Tech Lead.
- **Não tocar backend de BFF/Scheduling, frontend, Evolution Go, migration, schema ou contrato público.**
- **Não exercitar o laço de ferramentas contra Scheduling real**, áudio, mídia ou grupo: ficam declarados fora.
- **Não enfraquecer gate nenhum** e não marcar teste como skip em silêncio.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

### 6. Prova

- O ensaio roda verde contra bancos descartáveis, com a saída real no relatório: identificadores, contagens por asserção e tempo medido.
- Os quatro elos de controle negativo executados, cada um com a saída real, e revertidos.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde.
- `npm run test:gate` e `validate:core` verdes sobre a árvore final.
- O texto exato que o dublê de modelo devolveu e o texto exato que o dublê de transporte recebeu, lado a lado.

### 7. Documentação

Escrita **depois** da última mudança de árvore:

- [CURRENT_STATE](../CURRENT_STATE.md): delta032 — o que passou a estar provado sobre a resposta automática e o que continua fora.
- [DATA_MIGRATION](../DATA_MIGRATION.md): seção nova no padrão da §17, descrevendo o ensaio, os elos e os limites.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o passo novo de `validate:integration`, o que ele decide e o que continua não decidindo.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-09 e G-21 ganham a evidência de composição, **sem** reabrir o que já está fechado; G-33 registra o passo novo.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada, **sem reescrever** §6, §7 ou §8, registrando o que a composição passou a provar sobre a resposta automática e o que isso muda — ou não muda — na contagem do veredito.
- [DECISIONS](../DECISIONS.md): **D-048**, no formato das anteriores, cobrindo a fronteira externa configurável por `OPENAI_BASE_URL`, por que a prova da resposta automática exige o caminho de produção sem substituto interno, e o que continua sendo gate operacional.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. `LangChainModelProvider` e `OpenAIEmbeddingProvider` usam `env.OPENAI_BASE_URL`; o default continua `https://api.openai.com/v1` e nenhuma variável de ambiente nova foi criada.
2. `requireOpenAiEnv()` e `requireEmbeddingEnv()` continuam exigindo o mesmo; nenhum caminho passou a aceitar chave ausente.
3. Existe teste de unidade que afirma a base efetiva dos dois provedores, no default e com a variável redirecionada.
4. Nenhuma costura de teste nova entrou em `apps/*/src` além de §1: `buildInboundMessageProcessor` continua sem parâmetro de modelo e o ensaio não injeta `buildProcessor`.
5. O ensaio recusa destino não descartável antes de qualquer escrita, com mensagem própria.
6. O ensaio sobe a IA real com o worker ligado e entrega a mensagem por `POST /webhooks/evolution` real; nenhum claim manual e nenhum relógio falso.
7. Os únicos dublês são os dois serviços externos, em loopback; nenhum endereço fora de loopback é usado.
8. O ensaio prova, por leitura do banco, exatamente uma `Message` `OUTBOUND` com o texto devolvido pelo dublê de modelo naquela execução.
9. O ensaio prova que o transporte real foi chamado exatamente uma vez, com esse texto e o telefone do contato.
10. O ensaio prova que a linha `OUTBOUND` já existia quando o transporte foi chamado.
11. Os quatro elos obrigatórios de controle negativo existem, cada um derruba o ensaio com `exit 1` e mensagem própria quando quebrado, e a saída real de cada um está no relatório.
12. Os elos 1 e 2 afirmam também que o dublê de modelo **não** foi chamado.
13. Nenhuma quebra de elo sobrou na árvore final.
14. O ensaio é passo de `validate:integration`, depois de `rehearse:goal030-mvp-journey`, com script próprio em `package.json`.
15. Os guards do ensaio têm teste permanente em `scripts/tests/`, rodado por `npm run test:gate`.
16. Nenhum passo, suíte, limiar, rota ou largura de gate existente foi removido, renomeado, pulado ou condicionado.
17. Nenhum arquivo fora de `apps/ai-orchestrator/`, `scripts/`, `package.json` e `docs/migration/` foi modificado; nenhuma migration, schema, rota ou contrato público mudou.
18. Nenhuma chamada saiu para provedor de LLM real ou para WhatsApp real, e nenhum documento afirma que **M4** foi fechado.
19. Nenhum achado de A-02 a A-19 foi corrigido ou reclassificado; defeito descoberto está relatado como achado, não corrigido em silêncio.
20. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
21. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
22. A documentação de §7 foi escrita depois da última mudança de árvore, [DECISIONS](../DECISIONS.md) tem **D-048** no formato das anteriores, e nenhuma seção anterior de [FINAL_AUDIT](../FINAL_AUDIT.md) foi reescrita.
23. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
24. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.

## Entrega

Relatório do Developer com: o texto que o dublê de modelo devolveu e o que o transporte recebeu, lado a lado; as contagens lidas do banco por asserção; o tempo medido do ensaio e o teto de espera usado; a saída real dos quatro elos de controle negativo, com a confirmação de que foram revertidos; o resultado por passo de `validate:core`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; os achados de produto encontrados e **não** corrigidos; e o que ficou declaradamente fora — com **M4**, laço de ferramentas, áudio e grupos nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
