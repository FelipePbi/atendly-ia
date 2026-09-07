# IA Loop — tooling

Ferramental isolado do IA Loop. Não faz parte do runtime do Atendly e não é
importado por `apps/` nem por `packages/`.

Duas etapas concluídas:

| Etapa | Status |
| --- | --- |
| Spike 0 — Agent Invocation Bootstrap | `PASS` |
| Vertical Slice Supervisionada V1 | `PASS` |
| Spike 1 — Persistent Dual Session | `BLOCKED` (Fable OK, Opus 5 não sustenta multi-turno) |
| V2 — Hybrid Real Goal Harness | `PASS` (dry-run; Goal003 **não** executado) |

---

## Spike 0 — Agent Invocation Bootstrap

Provou que dois agentes independentes do Claude Code podem ser invocados
programaticamente com a assinatura existente, sem API paga separada.

### Ambiente confirmado

| Item | Valor |
| --- | --- |
| Claude Code (host) | `2.1.263` |
| Autenticação | assinatura Claude Max |
| `ANTHROPIC_API_KEY` | não usada |
| Billing da Claude API | não habilitado |
| Resolução do executável | encontrado no `PATH` |

### Mecanismo headless

| Necessidade | Flag |
| --- | --- |
| Execução não interativa | `-p` / `--print` |
| Envelope estruturado | `--output-format json` |
| Validação de schema na saída | `--json-schema <schema>` |
| Seleção explícita de modelo | `--model <nome-completo>` |
| Desabilitar todas as tools | `--tools ""` |
| Não travar em prompt de permissão | `--permission-prompts none` |
| Ignorar MCP externo | `--strict-mcp-config` |
| Ignorar skills | `--disable-slash-commands` |
| Ignorar CLAUDE.md, hooks, plugins, settings | `--safe-mode` |
| Sessão isolada e descartável | `--session-id <uuid>`, `--no-session-persistence` |

Nenhuma flag de bypass de permissão é usada, e `--fallback-model` é
deliberadamente evitado — há teste garantindo que nenhuma das duas apareça no
argv. Cada invocação roda em diretório temporário vazio, fora do repositório,
em processo e sessão próprios.

### Modelo primário vs. modelos auxiliares

`modelUsage` **não** contém apenas o modelo solicitado: o Claude Code pode usar
modelos auxiliares internamente (Haiku, por exemplo) para bookkeeping próprio.
A presença de outro modelo ali, sozinha, **não é fallback** — e tratá-la como
tal produziria falso positivo. Ao mesmo tempo, ignorar Haiku por allowlist
mascararia um fallback real para Haiku.

Critério adotado, sem allowlist e sem heurística de preço/ordem:

1. O `usage` de topo do envelope reflete a inferência principal.
2. Normalizam-se os quatro contadores, que mudam de convenção entre os dois
   lugares:

   | topo (snake_case) | por modelo (camelCase) |
   | --- | --- |
   | `input_tokens` | `inputTokens` |
   | `output_tokens` | `outputTokens` |
   | `cache_read_input_tokens` | `cacheReadInputTokens` |
   | `cache_creation_input_tokens` | `cacheCreationInputTokens` |

3. A **única** entrada de `modelUsage` que reproduz esses contadores é o
   `resolvedPrimaryModel`.
4. O resto vira `auxiliaryModels`, preservado para observabilidade.

Contadores ausentes contam como zero. Nunca se escolhe "o primeiro", "o último"
nem "o mais caro".

### Anti-fallback

| Situação | Código |
| --- | --- |
| Primary de outra família (ex.: pediu Opus, veio Haiku) | `MODEL_FALLBACK_DETECTED` |
| Sem `modelUsage`, ou sem `usage` de topo | `RESOLVED_MODEL_UNKNOWN` |
| Nenhuma entrada corresponde ao `usage` de topo | `RESOLVED_MODEL_UNKNOWN` |
| Duas ou mais entradas indistinguíveis | `RESOLVED_MODEL_AMBIGUOUS` |

Em qualquer falha, `observedModels` preserva os ids crus reportados pelo CLI.

---

## Vertical Slice Supervisionada V1

Prova o caminho completo Developer → orchestrator → Reviewer → decisão, sem
executar Goal real e sem dar acesso ao repositório aos agentes.

### Papéis

| Papel | Modelo | Responsabilidade em V1 |
| --- | --- | --- |
| Developer | `claude-opus-5` | Recebe a tarefa sintética e devolve resultado estruturado |
| Tech Lead / Reviewer | `claude-fable-5-1` | Recebe tarefa + resultado do Developer e emite decisão estruturada |

Nenhum dos dois acessa o repositório. Ambos rodam com tools desabilitadas, em
diretório temporário vazio, em processos e sessões separados.

A tarefa sintética vive em `fixtures/synthetic-goal.md` e é deliberadamente
trivial: o que está sendo medido é transporte e contrato, não capacidade de
programação.

### Handoff entre agentes

Fable **não** compartilha a sessão de Opus. Não há `--resume` entre modelos. O
único canal é o objeto que o orchestrator monta:

```
Opus (processo A) → JSON → validação → ReviewRequest → Fable (processo B) → JSON → validação
```

O orchestrator não interpreta semântica. Não existe `if (text.includes(...))`:
toda transição vem de campo estruturado já validado.

### Contrato do Developer

```json
{
  "protocolVersion": 1,
  "role": "developer",
  "taskId": "synthetic-001",
  "status": "REVIEW_REQUIRED",
  "summary": "…",
  "evidence": ["…"]
}
```

`status` aceita apenas `REVIEW_REQUIRED` em V1. `evidence` exige ao menos um
item não vazio.

### Contrato do Reviewer

```json
{
  "protocolVersion": 1,
  "role": "tech_lead",
  "taskId": "synthetic-001",
  "decision": "ACCEPTED",
  "blockers": [],
  "nextAction": "STOP"
}
```

`decision` aceita `ACCEPTED`, `CHANGES_REQUIRED` ou `HUMAN_REQUIRED`.
A coerência entre os três campos é obrigatória e falha fechado:

| decision | blockers | nextAction |
| --- | --- | --- |
| `ACCEPTED` | vazio | `STOP` |
| `CHANGES_REQUIRED` | ao menos um | `RETURN_TO_DEVELOPER` |
| `HUMAN_REQUIRED` | livre | `HUMAN_REQUIRED` |

### Estados implementados

```
START
  → DEVELOPER_RUNNING
  → REVIEW_REQUIRED
  → REVIEWER_RUNNING
  → ACCEPTED | CHANGES_REQUIRED | HUMAN_REQUIRED
  → STOP
```

Qualquer transição fora desse grafo falha com `INVALID_TRANSITION`.

### Ainda NÃO implementado

Explicitamente fora do escopo desta etapa:

- Goal real (Goal003 segue `READY` e intocado);
- acesso ao repositório pelos agentes;
- **loop de correção** — com `CHANGES_REQUIRED`, V1 registra que a próxima
  transição *seria* `RETURN_TO_DEVELOPER` e para, sem chamar Opus de novo;
- `CREATE_NEXT_GOAL`;
- commit automático;
- criação automática de Goal;
- worktree por Goal;
- autonomous mode.

Um `CHANGES_REQUIRED` legítimo **não** torna o harness falho: o que está sendo
provado é transporte, contrato e transição de estado. Nesse caso a execução
ainda reporta `Overall: PASS`, com `Next action: RETURN_TO_DEVELOPER`.

---

## Spike 1 — Persistent Dual Session

Pergunta: é possível manter duas sessões persistentes e independentes (Fable
como Tech Lead, Opus como Developer), enviando várias mensagens a cada uma ao
longo do tempo, sem reconstruir contexto?

**Resposta: parcialmente. Fable sim, Opus 5 não.**

### Mecanismo oficial de sessão (confirmado no 2.1.263)

| Necessidade | Flag |
| --- | --- |
| Criar sessão com id escolhido | `--session-id <uuid>` |
| Retomar sessão | `-r` / `--resume <id>` |
| Continuar a última do diretório | `-c` / `--continue` |
| Retomar criando id novo | `--fork-session` |
| **Impedir** persistência | `--no-session-persistence` |
| Processo vivo multi-turno | `--input-format stream-json` + `--output-format stream-json` |

Dois detalhes que mudam o desenho:

1. **`--resume` preserva o mesmo session id.** O envelope devolve
   `session_id` idêntico ao solicitado, então o registro do orchestrator
   continua válido indefinidamente.
2. **A sessão é gravada sob um slug derivado do `cwd`**
   (`~/.claude/projects/<slug>/<session-id>.jsonl`). Cada papel precisa de um
   diretório estável e próprio entre turnos.

O Spike 0 usava `--no-session-persistence` — exatamente o que impede resume.
Persistência é a **ausência** dessa flag.

### Resultado medido

| | Fable 5.1 | Opus 5 |
| --- | --- | --- |
| Criar sessão | OK | OK |
| Retomar por id | OK | **falha** |
| Contexto retido entre turnos | OK | não medido |
| Isolamento entre sessões | OK | não medido |

Saída real do Tech Lead no turno 3, depois de dois resumes:
`{"taskMarker": null, "reviewMarker": "FABLE-456"}` — guardou o próprio
marcador e **não** conhece o do Developer.

### O blocker: `reasoning_extraction` no Opus 5

A partir do segundo/terceiro turno, o Opus 5 responde:

```
API Error: Opus 5's safeguards flagged this message … Details: `[reasoning_extraction]`
```

Investigação feita para isolar a causa:

| Hipótese | Teste | Conclusão |
| --- | --- | --- |
| Prompt "o que você memorizou?" soa como extração | Trocado por prompt inócuo ("registre a fase 2") | Falhou igual — **não é o conteúdo** |
| `--json-schema` é o gatilho | Resume sem schema | 1º resume passou, 2º e 3º falharam — **não é o schema** |
| Thinking acumulado no histórico | `--effort low`, `thinking_tokens=0` | Falhou igual — **não é o thinking** |
| É o mecanismo `--resume` | Processo vivo com `stream-json`, sem resume | Falhou no turno 3 — **não é o resume** |

Matriz final, com o mesmo prompt trivial nos dois mecanismos:

| Mecanismo | Fable 5.1 | Opus 5 |
| --- | --- | --- |
| `--session-id` + `--resume` | 3/3 OK | 0/3 (com schema) · 1/3 (sem schema) |
| Processo vivo `stream-json` | 4/4 OK, recuperou o código guardado | turnos 1–2 OK, 3–4 bloqueados |

Ou seja: **a limitação é do Opus 5 em conversa multi-turno neste ambiente**,
não do mecanismo de sessão nem da forma dos prompts. Nenhum dos dois desenhos
de "sessão persistente" contorna isso.

### Arquitetura recomendada

O requisito real declarado é *contexto persistente por agente*, não um processo
vivo. Com a evidência acima, o desenho defensável é **híbrido**:

- **Tech Lead (Fable 5.1) — sessão persistente.** `--session-id` no primeiro
  turno, `--resume <id>` nos seguintes, id guardado no registro. Serve bem ao
  papel: o Architect/Reviewer ganha com memória acumulada de decisões.
- **Developer (Opus 5) — stateless por turno.** Uma chamada, um turno, com o
  orchestrator reinjetando o contexto necessário. É exatamente o que a Vertical
  Slice V1 já faz, e funciona de forma estável.

Isso não é uma concessão: para o Developer, contexto reinjetado é mais
auditável e mais fácil de retomar após falha do que contexto implícito num
histórico de conversa.

Reavaliar quando o safeguard do Opus 5 mudar — basta rodar
`npm run ia-loop:sessions` de novo, o harness já mede os dois lados.

### Registro durável de sessões

`lib/session-registry.mjs` grava, com escrita atômica, em
`tools/ia-loop/.state/sessions.json` (fora do git):

`role`, `model`, `sessionId`, `status`, `cwd`, `turns`, `lastActivity`.

O Spike descarta os handles em memória depois do primeiro turno e reconstrói as
sessões a partir do disco, provando que sobrevivem à morte do orchestrator. Uma
invariante é verificada a cada escrita: **dois papéis nunca compartilham
session id** (`SESSION_ID_COLLISION`). Registro corrompido ou de outra versão é
recusado, nunca zerado em silêncio.

### Terminais visíveis — como expor depois

O CLI já traz o mecanismo oficial, então não é preciso inventar nada:

| Comando | Uso |
| --- | --- |
| `claude --bg` | Inicia sessão em background e imprime o id |
| `claude agents` | Lista as sessões em background |
| `claude attach <id>` | Abre a sessão num terminal, de forma interativa |
| `claude logs <id>` | Mostra a saída recente |
| `claude stop <id>` | Encerra mantendo a conversa (`--resume` volta a funcionar) |
| `claude rm <id>` | Remove a sessão |

Recomendação para os dois terminais visíveis no Windows: o orchestrator segue
dono das sessões e as identifica pelo registro; para inspeção humana, abre-se
uma janela por papel apontando para o mesmo id, por exemplo

```
wt.exe -w 0 new-tab --title "IA Loop — Tech Lead" pwsh -NoExit -Command claude --resume <sessionId>
```

Como `--resume` preserva o id, a janela mostra a mesma conversa que o
orchestrator conduz. Vale só para o Tech Lead enquanto o Opus 5 não sustentar
multi-turno; para o Developer, o equivalente é acompanhar os turnos pelo log do
orchestrator. Anexar uma janela interativa a uma sessão que o orchestrator está
usando ao mesmo tempo ainda não foi testado — fazer isso antes de depender do
recurso.

---

## V2 — Hybrid Real Goal Harness

Prepara a infraestrutura para executar um Goal real. **Nenhum Goal foi
executado**: a V2 termina em `--dry-run`.

### Arquitetura oficial

| Papel | Modelo | Processo | Sessão Claude |
| --- | --- | --- | --- |
| Tech Lead / Architect / Reviewer | `claude-fable-5-1` | persistente | **persistente** (`--session-id` + `--resume`) |
| Developer / Executor | `claude-opus-5` | persistente | **stateless** (sessão nova por tarefa) |

A assimetria é deliberada e vem direto do Spike 1: Fable sustenta multi-turno,
Opus 5 não. Para o Developer, o **processo** fica vivo e visível, mas cada
tarefa usa uma sessão Claude nova e recebe contexto reinjetado explicitamente
pelo orchestrator.

Isso não é contorno de bug nem limitação temporária a ser "consertada". Não
transforme o Developer em multi-turno; o worker do Developer nunca usa
`--resume` nem grava sessão no registro, e há teste garantindo isso.

Os dois lifecycles vivem em arquivos separados (`workers/tech-lead.mjs` e
`workers/developer.mjs`) justamente para não serem abstraídos como se fossem
iguais. O que compartilham — transporte, contratos, heartbeat, polling — está em
`lib/`.

### Dois terminais

```bash
npm run ia-loop:tech-lead
```

```bash
npm run ia-loop:developer
```

Cada um imprime seu banner, fica `IDLE` e aguarda jobs. São workers Node, não
shells interativos do `claude`. Abertura automática de janelas não faz parte
desta versão: o usuário abre os dois terminais manualmente.

Eventos mostrados (Developer):

```
[JOB 003/R1 RECEIVED] · [OPUS STARTED] · [OPUS COMPLETED] · [RESULT REVIEW_REQUIRED] · [IDLE]
```

Eventos mostrados (Tech Lead):

```
[REVIEW 003/R1 RECEIVED] · [FABLE STARTED] · [FABLE COMPLETED] · [DECISION ACCEPTED] · [IDLE]
```

Nunca são impressos prompts completos, tokens, secrets ou session ids inteiros —
apenas os 8 primeiros caracteres, para correlação de log.

### Comunicação: nunca direta

Fable jamais escreve no stdin de Opus, nem o contrário. Todo hand-off passa pelo
orchestrator, que valida contrato e transição antes de publicar o próximo job.
É o que torna o loop auditável.

```
Developer result → orchestrator → valida contrato → transição → ReviewJob → Tech Lead
```

O protocolo é local, em arquivos, sob `tools/ia-loop/.state/` (fora do git):

```
runtime.json          snapshot da execução
current-goal.json     Goal descoberto
events.jsonl          log append-only
sessions.json         registro durável de sessões
workers/<role>.json   heartbeat
jobs/<role>/*.json    fila de jobs
results/<role>/*.json resultados publicados
```

Toda escrita é atômica (arquivo temporário + `rename`), então uma queda no meio
da escrita nunca deixa um job parcialmente legível. Arquivo corrompido é
**recusado**, nunca zerado em silêncio: apagar o estado esconderia justamente a
falha que o operador precisa ver. Job duplicado, papel errado e versão de store
divergente também falham fechado.

### Orchestrator

`run-goal.mjs` é o único componente que decide quem trabalha. Os modelos não
escolhem quem chamar. Ele constrói input, chama, valida contrato, valida
transição e registra — sem interpretar prosa.

```bash
npm run ia-loop:goal -- 003 --dry-run
```

Executar sem `--dry-run` é recusado com `DRY_RUN_REQUIRED`: execução real é uma
etapa separada e ainda não autorizada.

### Estados implementados

```
IDLE → GOAL_READY → PREPARING_WORKTREE → WORKTREE_READY
     → DEVELOPER_QUEUED → DEVELOPER_RUNNING → REVIEW_REQUIRED
     → REVIEWER_QUEUED → REVIEWER_RUNNING
     → ACCEPTED | CHANGES_REQUIRED | HUMAN_REQUIRED
     → AWAITING_HUMAN → STOPPED
```

**Human gate.** Todos os três veredictos convergem para `AWAITING_HUMAN`,
inclusive `ACCEPTED`. `CHANGES_REQUIRED` **não** volta ao Developer: a transição
não existe no grafo e há teste provando que é recusada. O harness registra qual
*seria* a próxima ação (`RETURN_TO_DEVELOPER`, `CLOSE_GOAL`) sem executá-la.

Ainda **não** implementados, de propósito: `CLOSING_GOAL`, `CREATE_NEXT_GOAL`,
`AUTONOMOUS_NEXT_GOAL` e o loop de correção automático.

### Descoberta do Goal

`lib/goal-discovery.mjs` lê os artefatos de migração como autoridade e não
adivinha. Verifica, falhando fechado em cada ponto:

| Verificação | Código de falha |
| --- | --- |
| Exatamente um arquivo `003-*.md` | `GOAL_NOT_FOUND` / `GOAL_AMBIGUOUS` |
| Status declarado é `READY` | `GOAL_NOT_READY` |
| Baseline do Goal == baseline do MIGRATION_STATUS | `BASELINE_DIVERGENCE` |
| Status do Goal == status na tabela | `GOAL_STATUS_DIVERGENCE` |
| Goal anterior `ACCEPTED` | `PREVIOUS_GOAL_NOT_ACCEPTED` |
| SHA resolve neste repositório | `BASELINE_NOT_IN_REPO` |

Este módulo **apenas lê**. Nunca escreve em `docs/migration`.

### Duas baselines, nunca colapsadas

| Conceito | Valor | Papel |
| --- | --- | --- |
| `migrationAcceptedBaseline` | `1e874e27…` | Último Goal formalmente ACCEPTED; é contra ela que o diff funcional continua rastreável |
| `executionBase` | HEAD atual | Árvore sobre a qual se trabalha, que também carrega a documentação do Goal003 e este tooling |

São diferentes por definição, e isso é esperado, não erro. A baseline aceita
**nunca** é inferida do HEAD: vem declarada nos documentos. As duas viajam em
todo job e ficam registradas no runtime.

### Worktree

Plano apenas. Convenção: `.ai-worktrees/goal-003`, branch `ai-loop/goal-003`.

Em `--dry-run` a worktree **não é criada** — só o plano é exibido, incluindo o
comando que seria executado. `createWorktree()` existe apenas para lançar
`WORKTREE_CREATION_NOT_IMPLEMENTED`, de modo que a fronteira seja explícita no
código e coberta por teste, em vez de ser uma ausência que alguém preencha por
acidente.

Condições que bloqueiam o plano, todas acumuladas em vez de curto-circuito:
árvore principal suja, branch já existente, worktree já registrada, diretório
desconhecido ocupando o caminho. Nada é forçado, resetado ou apagado; o checkout
principal e a branch do usuário não são tocados.

### Contextos explícitos

Os dois construtores são assimétricos, espelhando as estratégias de sessão.

**DeveloperContext** carrega papel, Goal e caminho, as duas baselines, worktree,
round, blockers (quando correção) e ponteiros para ler `CLAUDE.md`, `AGENTS.md` e
o Goal, além de consultar Graphify/Product Vault seletivamente. **Nunca** carrega
conversa anterior do Opus — há teste que falha se aparecer `transcript`,
`conversation`, `messages`, `history` ou `sessionId` no pacote.

**TechLeadContext** repete os fatos mesmo tendo sessão persistente: Goal, as duas
baselines, round, arquivos alterados reais, relatório de implementação,
validações, blockers anteriores e nível de review. O repositório é a autoridade;
a sessão serve para continuidade recente, não como registro oficial.

### Restart dos workers

| Worker | Ao reiniciar |
| --- | --- |
| Developer | Continua stateless; nada a recuperar |
| Tech Lead | Recupera o session id do registro e retoma a sessão |

Se o resume do Fable falhar, a política **depende do estado**, e a diferença
importa: com um review em andamento, criar uma sessão nova silenciosamente
mudaria a continuidade sobre a qual o review foi iniciado, então o job vira
`HUMAN_REQUIRED`. Com o worker `IDLE`, abrir sessão nova é aceitável e fica
registrado como evento.

### Heartbeat

Cada worker escreve um heartbeat a cada 5s. O orchestrator deriva saúde só pela
idade: `RUNNING` (< 15s), `STALE` (15–60s), `OFFLINE` (> 60s ou arquivo ausente).
Sem daemon, sem socket, sem polling agressivo — o loop de jobs usa polling de 1s.

### Nota sobre a documentação da migração

`docs/migration/` **não** foi alterado nesta etapa. Os artefatos históricos
continuam registrando o reviewer como Astra. A troca formal do Tech Lead para
Fable será tratada separadamente, antes da primeira execução real do Goal003.

---

## Como executar

```bash
npm run test:ia-loop       # 127 testes locais, sem chamadas reais a modelo
```

```bash
npm run ia-loop:spike      # Spike 0: valida invocação e seleção de modelo (2 chamadas)
```

```bash
npm run ia-loop:supervised # Vertical Slice V1: Developer → Reviewer (2 chamadas)
```

```bash
npm run ia-loop:sessions   # Spike 1: duas sessões persistentes (até 6 chamadas)
```

V2 — dois terminais e o dry-run:

```bash
npm run ia-loop:tech-lead  # Terminal A: worker Fable, sessão persistente
```

```bash
npm run ia-loop:developer  # Terminal B: worker Opus, inferências stateless
```

```bash
npm run ia-loop:goal -- 003 --dry-run   # não publica job, não cria worktree, não chama modelo
```

| Variável | Efeito |
| --- | --- |
| `IA_LOOP_CLAUDE_BIN` | Caminho explícito do executável |
| `IA_LOOP_TECH_LEAD_MODEL` | Modelo do Tech Lead (padrão `claude-fable-5-1`) |
| `IA_LOOP_DEVELOPER_MODEL` | Modelo do Developer (padrão `claude-opus-5`) |
| `IA_LOOP_TIMEOUT_MS` | Timeout por processo (padrão `120000` no Spike, `180000` na V1) |

Prompts completos não são impressos. A saída não contém tokens, credenciais,
session ids nem dados pessoais.

---

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `spike-agent-invocation.mjs` | Runner do Spike 0 |
| `run-supervised.mjs` | Orchestrator da Vertical Slice V1 |
| `persistent-session-spike.mjs` | Runner do Spike 1 |
| `run-goal.mjs` | Orchestrator da V2: descoberta, baselines, plano e dry-run |
| `workers/tech-lead.mjs` | Worker Fable — processo e sessão persistentes |
| `workers/developer.mjs` | Worker Opus — processo persistente, inferência stateless |
| `lib/goal-discovery.mjs` | Descoberta determinística do Goal e coerência da migração |
| `lib/worktree-manager.mjs` | Plano de worktree; criação não implementada |
| `lib/job-store.mjs` | Protocolo local em arquivos, escrita atômica, log append-only |
| `lib/worker-registry.mjs` | Heartbeat e saúde RUNNING/STALE/OFFLINE |
| `lib/contracts-v2.mjs` | Contratos protocolVersion 2 |
| `lib/context-builders.mjs` | Pacotes explícitos de contexto por papel |
| `lib/loop-state.mjs` | Máquina de estados V2 com human gate |
| `lib/worker-loop.mjs` | Plumbing comum dos workers |
| `lib/claude-process.mjs` | Executável, spawn, timeout, parsing, resolução de modelo |
| `lib/contracts.mjs` | Contratos Developer/Reviewer e handoff |
| `lib/state-machine.mjs` | Máquina de estados mínima |
| `lib/agents.mjs` | Papéis fixos e construção de prompt |
| `lib/persistent-session.mjs` | Sessão por agente: cria no 1º turno, resume nos seguintes |
| `lib/session-registry.mjs` | Registro durável de sessões, com escrita atômica |
| `fixtures/synthetic-goal.md` | Tarefa sintética, fora do runtime |
| `tests/*.test.mjs` | 127 testes com processo fake; nenhuma chamada real |

## Limitações conhecidas

1. **Auth não é herdável por subprocesso a partir do app desktop.** O que
   funciona é o CLI instalado e autenticado no host, visível no `PATH` — não o
   bundle interno do app. O runner deve depender do CLI do host.
2. **Kill em timeout usa `child.kill('SIGKILL')`**, que no Windows não mata a
   árvore inteira de processos. Suficiente para as etapas atuais; revisar se o
   orquestrador rodar agentes de longa duração.
3. **A correspondência de usage é exata.** Se o CLI passar a arredondar ou
   agregar os contadores de topo, a resolução cai em `RESOLVED_MODEL_UNKNOWN` —
   falha fechado, mas exigirá revisão do critério.
4. **Sem verificação de versão do CLI em runtime.** A versão encontrada é
   registrada, não exigida.
5. **Uma única tentativa por agente.** Não há retry: qualquer falha de contrato
   encerra a execução.
