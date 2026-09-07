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
| Capacity / Usage Limits | `PASS` (espera controlada, retomada exata) |
| V3 — Real Worktree + Supervised Execution | worktree real, execução supervisionada, parada em `AWAITING_HUMAN` |
| V4 — Automatic Correction Rounds | correção automática até 3 rodadas, depois escala |
| V5 — Accepted Goal Closure + Next Goal Planning | fechamento e planejamento automatizados, parada em AWAITING_HUMAN |
| V6 — Job Ownership and Leases | uma execução por operação lógica; timeout de observador não duplica trabalho |

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
comando que seria executado. Sem `--dry-run` (V3), `createWorktreeForGoal()` cria a
worktree de verdade, mas **somente a partir de um plano sem blockers**: a segurança
é garantida recusando o plano, nunca contornando-o.

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

O handoff operacional do papel de Tech Lead já foi formalizado: a fonte canônica
de quem exerce cada papel é [AGENT_ROLES](../../docs/migration/AGENT_ROLES.md),
e a decisão está em D-018. Os artefatos históricos que registram Astra como
reviewer dos Goals 001 e 002 permanecem inalterados — reviews concluídos não são
reatribuídos.

---

## Capacity / Usage Limits

Um limite de uso do modelo é uma pausa esperada, **não** uma falha do Goal.

O IA Loop persiste o estado, entra em espera controlada e retoma exatamente a
etapa bloqueada quando a capacidade volta. Nada do que já foi concluído é
refeito, e o modelo **nunca** é trocado.

### Garantias

| Garantia | Como é obtida |
| --- | --- |
| O Goal não é encerrado | Um limite leva a `WAITING_FOR_CAPACITY`, nunca a falha |
| O contexto não é perdido | Estado em disco com escrita atômica; sessão do Fable preservada |
| Trabalho concluído não é repetido | Resultado persistido por `jobId` + status do job |
| O modelo não é trocado | Sem fallback: o mesmo modelo retoma. `--fallback-model` nunca é usado |
| Sem retry apertado | Espera baseada em `nextRetryAt` persistido, não em polling |
| Limite temporário não vira HUMAN_REQUIRED | Só auth/billing/model/fatal escalam |

### Classificação de erros

Centralizada em `lib/capacity-classifier.mjs`. Sinais estruturados (nossos
próprios códigos de erro, `terminal_reason`, status HTTP) têm precedência sobre
casamento de texto, que é o último recurso.

| Causa | Política |
| --- | --- |
| `RATE_LIMIT` | Espera. Usa `Retry-After` quando existe; senão backoff progressivo |
| `USAGE_LIMIT` | Espera longa e retenta indefinidamente enquanto a causa for essa |
| `AUTH_ERROR` | `HUMAN_REQUIRED` — retry não resolve autenticação |
| `BILLING_ERROR` | `HUMAN_REQUIRED` — e não se troca de provider/modelo |
| `MODEL_UNAVAILABLE` | `HUMAN_REQUIRED` — sem fallback |
| `UNKNOWN_TRANSIENT` | Retry limitado (3), depois `HUMAN_REQUIRED` |
| `UNKNOWN_FATAL` | `HUMAN_REQUIRED` imediato |

Um fallback de modelo detectado (`MODEL_FALLBACK_DETECTED`) é classificado como
`UNKNOWN_FATAL` de propósito: é invariante violada, não algo a contornar com
retry.

Diagnósticos são sanitizados e truncados antes de qualquer persistência —
tokens, cookies, chaves, senhas e UUIDs de sessão são redigidos.

### Backoff

```
RATE_LIMIT:   30s → 60s → 120s → 300s   (teto de 5 min, inclusive sobre Retry-After)
USAGE_LIMIT:  20 min, sem teto de tentativas
UNKNOWN_TRANSIENT: 15s → 30s → 60s, máx. 3 tentativas
```

Configuração em `lib/capacity-config.mjs`; nada de número mágico espalhado.
Sobrescrevível por ambiente (`IA_LOOP_USAGE_LIMIT_RETRY_MS`, etc.).

### Estado persistido

```json
{
  "goal": "003",
  "round": 2,
  "state": "WAITING_FOR_CAPACITY",
  "blockedAgent": "tech_lead",
  "resumeFrom": "REVIEWER_RUNNING",
  "blockedJobId": "003-r2-tech_lead-…",
  "capacity": {
    "reason": "USAGE_LIMIT",
    "attempt": 4,
    "firstSeenAt": "…",
    "lastAttemptAt": "…",
    "nextRetryAt": "…",
    "retryIntervalMs": 1200000
  }
}
```

Escrita atômica, timestamps ISO. Registro corrompido **falha fechado**
(`CAPACITY_STATE_CORRUPT`) e nunca é zerado: agir sobre um estado meio escrito
poderia duplicar uma inferência ou pular trabalho concluído. A baseline aceita e
o Goal nunca são alterados por um evento de capacidade.

### Retomada exata

O campo `resumeFrom` é o que impede repetir trabalho. Exemplo real:

```
Opus termina Goal003/R2  → DeveloperResult persistido
Fable começa o review    → bate USAGE_LIMIT
                         → WAITING_FOR_CAPACITY, resumeFrom = REVIEWER_RUNNING
Quando volta             → retoma SÓ o review, com o mesmo ReviewJob
                         → Opus NÃO é chamado de novo
```

E no sentido inverso: se o Developer for limitado na R3, ao voltar retoma
somente a R3 — a R2 não é refeita e o Fable não é chamado antes do Developer
terminar.

A idempotência fecha a janela perigosa: se o retry disparou, a resposta chegou e
o processo caiu antes de avançar o estado, o restart encontra o resultado no
disco e **não chama o modelo de novo**.

### Limites são por agente

Fable e Opus têm limites independentes. Se o Tech Lead está em
`WAITING_FOR_CAPACITY`, o Developer continua `IDLE` — não é marcado como
limitado. O orchestrator sabe qual agente está bloqueado (`blockedAgent`).

### Heartbeat durante a espera

Um worker esperando continua batendo heartbeat com estado
`WAITING_FOR_CAPACITY`, `reason` e `nextRetryAt`. Ele está saudável, não travado,
então o health check nunca o classifica como `STALE`/`OFFLINE`.

### Sobrevive a restart

O cenário coberto: o limite chega, o estado é salvo, você fecha os terminais ou
reinicia o Windows, reabre os dois workers e roda `resume`. O sistema conhece
Goal, round, job, agente bloqueado, motivo, `nextRetryAt` e `resumeFrom` — e não
reexecuta nada.

Ao retomar, só o tempo **restante** é aguardado: se a máquina ficou desligada 15
dos 20 minutos, espera-se apenas os 5 que faltam.

### Comandos

```bash
npm run ia-loop:status
```

```
ATENDLY IA LOOP

Goal: 003
Round: 2
State: WAITING_FOR_CAPACITY

Developer:
  Model: claude-opus-5
  State: IDLE
  Reason: waiting for Tech Lead

Tech Lead:
  Model: claude-fable-5-1
  State: WAITING_FOR_CAPACITY
  Reason: USAGE_LIMIT
  Retry in: 12m 43s
  Attempt: 4

Resume from: REVIEWER_RUNNING
Blocked job: 003-r2-tech_lead-…

Last accepted baseline:
1e874e27…

No work lost.
```

```bash
npm run ia-loop:resume
```

Carrega o estado, valida integridade, respeita `nextRetryAt`, não duplica job e
não recria resultado que já exista. Sem nada parado, informa e sai com sucesso.

**`resume` não é override de human gate.** Com o estado em `HUMAN_REQUIRED` ele
recusa continuar e diz por quê.

### Eventos registrados

`CAPACITY_LIMIT_REACHED`, `CAPACITY_WAIT_STARTED`, `CAPACITY_RETRY`,
`CAPACITY_AVAILABLE`, `CAPACITY_WAIT_ENDED`, `HUMAN_REQUIRED` — com goal, round,
agente, motivo, tentativa e `nextRetryAt`. Prompt e resposta completos nunca são
registrados.

### Testes

Toda a política é testada com fixtures sanitizadas, agente falso e **relógio
virtual**: a espera de 20 minutos do `USAGE_LIMIT` é exercitada ponta a ponta sem
gastar tempo real nem quota. Nenhum teste provoca limite de verdade.


---

## V3 — Real Worktree + Supervised Execution

Primeira execução real de um Goal pelo IA Loop. Termina obrigatoriamente em
`AWAITING_HUMAN`.

```bash
npm run ia-loop:goal -- 003        # execução real (exige os dois workers rodando)
```

### Três baselines, não duas

| Conceito | Papel |
| --- | --- |
| `migrationAcceptedBaseline` | Último Goal funcional aceito |
| `executionBase` | HEAD do tooling no momento da execução |
| `worktreeInitialHead` | HEAD da worktree ao ser criada (== executionBase) |

O diff **funcional** do Goal é medido de `worktreeInitialHead` até o estado atual
da worktree — não da baseline aceita, porque entre as duas existem commits
legítimos de tooling, documentação do Goal e handoff que não pertencem a esta
implementação. O reviewer recebe os três valores e sabe distingui-los.

### Perfis de execução

| Papel | Tools | Permission mode | safe-mode |
| --- | --- | --- | --- |
| Spikes / V1 | nenhuma | — | on |
| Developer (real) | Read, Write, Edit, Glob, Grep, Bash, TodoWrite | `auto` | off |
| Tech Lead (real) | Read, Glob, Grep, Bash | `auto` | off |

`auto` foi escolhido por medição: `acceptEdits` nega Bash e `dontAsk` nega Write.
Nenhum perfil usa flag de bypass de permissão, e `--permission-prompts none`
continua garantindo que nada trave. O reviewer não tem tool de escrita.

### Guardas de política

O orchestrator fotografa o repositório antes e depois de cada agente e coleta a
superfície de mudança **do git**, nunca do que o modelo diz ter alterado.

| Violação | Quando |
| --- | --- |
| `DEVELOPER_COMMITTED` | Surgiu commit na worktree |
| `DEVELOPER_MOVED_HEAD` | HEAD da worktree saiu do initialHead |
| `MAIN_CHECKOUT_MUTATED` | HEAD, branch ou sujeira nova no checkout principal |
| `DEVELOPER_CHANGED_BRANCH` | Branch principal mudou |
| `GOAL_DOC_MUTATED` | Developer editou goals/, reviews/ ou MIGRATION_STATUS |
| `REVIEWER_MUTATED_WORKTREE` | Worktree mudou durante o review |

Qualquer violação leva a `HUMAN_REQUIRED` e encerra a execução.

**Limitação honesta:** estas guardas **detectam**, não isolam. Um agente com Bash
pode alcançar fora do diretório de trabalho. A mitigação é em camadas — worktree
separada, `--add-dir` restrito e estas checagens — mas a checagem é a última
linha, não um sandbox.

### Parada supervisionada

A execução **não** commita o Goal, não atualiza a baseline da migração, não cria o
Goal seguinte e não remove a worktree. A implementação fica na branch
`ai-loop/goal-003`, sem commit, para inspeção humana.

A partir da V4, `CHANGES_REQUIRED` não para imediatamente: dispara uma rodada de
correção enquanto houver orçamento de rodadas. Ver abaixo.


---

## V4 — Automatic Correction Rounds

O reviewer pedir mudanças deixa de ser fim de execução: vira a próxima rodada.

### Orçamento de rodadas

`maxCorrectionRounds = 3`, em `lib/loop-config.mjs`.

| Rodada | Conteúdo |
| --- | --- |
| R1 | Implementação inicial + review |
| R2 | Primeira correção + review |
| R3 | Segunda correção + review |

Um `CHANGES_REQUIRED` depois do review da R3 escala com
`MAX_CORRECTION_ROUNDS_REACHED`. A R4 nunca começa sozinha. O número de rodadas
é orçamento, não evidência de problema — por isso é a única coisa que converte um
pedido de mudança repetido em escalação.

### Ciclo

```
CHANGES_REQUIRED → CORRECTION_QUEUED → CORRECTION_RUNNING
                → REVIEW_REQUIRED → REVIEWER_QUEUED → REVIEWER_RUNNING
                → ACCEPTED | CHANGES_REQUIRED | HUMAN_REQUIRED
```

`ACCEPTED` e `HUMAN_REQUIRED` sempre param em `AWAITING_HUMAN`.

### Escopo de uma correção

O `CorrectionContext` carrega os blockers do reviewer, e eles são a autoridade da
rodada — não o Goal inteiro. A implementação da rodada anterior **permanece** na
worktree; a instrução é corrigir só os blockers e preservar o que já foi aceito.
As baselines não se movem entre rodadas, então o diff funcional continua medido
contra o `worktreeInitialHead` original.

O engine é genérico: nada específico do Goal está no código, tudo chega em
blockers estruturados. O contexto também nunca carrega transcript ou histórico de
conversa — há teste que falha se carregar.

### Mesma worktree, sempre

Todas as rodadas usam `.ai-worktrees/goal-NNN` e a branch `ai-loop/goal-NNN`.
Não se cria `goal-NNN-r2`. A correção acontece sobre a implementação existente.

### Jobs terminais

Um job que chegou a `COMPLETED`, `FAILED` ou `SUPERSEDED` nunca mais é
executado. Antes disso, reiniciar um worker reexecutava um job `FAILED` e gastava
uma segunda inferência em trabalho que um humano ainda não tinha visto. O
histórico é preservado — o job continua em disco com seu resultado, apenas deixa
de ser elegível. Só uma transição explícita cria um `jobId` novo.

### Estado RUNNING persistido

`DEVELOPER_RUNNING`, `CORRECTION_RUNNING` e `REVIEWER_RUNNING` são gravados
**antes** da chamada ao modelo. Se o processo cair no meio, o runtime diz o que
estava de fato acontecendo, e `ia-loop:status` reflete a realidade em vez de
ficar preso em `QUEUED` por horas.

### HARNESS_ERROR

Falha local do harness — spawn ruim, lista de argumentos longa demais, executável
ausente — é classificada como `HARNESS_ERROR`, **não** como limite de
capacidade. Ela não gera `CAPACITY_LIMIT_REACHED`, não entra em
`WAITING_FOR_CAPACITY` e vai direto a `HUMAN_REQUIRED`: esperar não conserta
tooling quebrado. Registrar isso como limite de modelo poluiria o histórico de
capacidade e induziria a erro qualquer análise posterior.

---

## V5 — Accepted Goal Closure + Next Goal Planning

O IA Loop **não** decide que um Goal foi aceito. Ele mecaniza o fechamento só
depois de encontrar uma ReviewDecision persistida com `ACCEPTED`. Nenhum review
novo acontece e o Developer nunca é chamado.

```bash
npm run ia-loop:close -- 003
```

### Fonte canônica de estados

`lib/state-registry.mjs` define cada estado **uma vez**: suas transições e suas
propriedades (`resumable`, `execution`, `agent`). O grafo, o conjunto resumível e as
categorias de observabilidade são **derivados** dali.

Isso existe por causa de um bug real: `CORRECTION_RUNNING` foi adicionado à máquina
de estados mas esquecido numa lista paralela de estados resumíveis, e um retry de
capacidade durante uma correção não podia sequer ser persistido. Duas listas que
precisam concordar, sem nada que force isso, é o defeito. Derivar é a correção.

### Taxonomia de falhas

| Família | Exemplos | Gera evento de capacidade? |
| --- | --- | --- |
| `MODEL_CAPACITY` | RATE_LIMIT, USAGE_LIMIT | **sim** |
| `HARNESS` | ENAMETOOLONG, spawn, transição inválida | não |
| `AGENT_CONTRACT` | protocolVersion, jobId, schema | não |

Conflatar as três fazia o log mentir: deslizes de contrato e uma falha de spawn
apareciam como `CAPACITY_LIMIT_REACHED`, o que induziria a erro qualquer análise de
quantas vezes limites reais foram atingidos. O histórico anterior é preservado como
fato; a classificação muda daqui para frente.

### Accepted snapshot

Prova que o que será commitado é exatamente o que foi aceito. O fingerprint é
**de conteúdo, nunca de mtime**: cobre o commit base, a branch, a lista exata de
arquivos e o hash do diff completo. Qualquer edição posterior ao aceite — em
arquivo rastreado ou não — muda o fingerprint e bloqueia o fechamento com
`ACCEPTED_WORKTREE_CHANGED`.

Para um Goal aceito antes desta feature, o snapshot é reconstruído do review
packet persistido, e **só** quando a lista de arquivos e o diff salvo ainda batem
byte a byte com a worktree. Sem essa evidência, o backfill é recusado.

### Duas baselines no fechamento

O cherry-pick produz um SHA diferente do commit da topic branch. A baseline aceita
operacional é o `integratedClosureCommit` — o commit que existe em `main` — nunca o
da branch. E o commit documental do planejamento, que vem depois, **não** substitui
a baseline.

### Escopo de escrita do Tech Lead

Durante review, o Fable é read-only. Durante fechamento e planejamento ele pode
escrever **somente** em `docs/migration/`. A verificação é dupla: o contrato recusa
um caminho fora do escopo, e o orchestrator confere no git o que realmente mudou.
Qualquer coisa fora disso é `TECH_LEAD_CLOSURE_SCOPE_VIOLATION`.

### Idempotência

Cada etapa grava seu SHA (`sourceClosureCommit`, `integratedClosureCommit`,
`sourcePlanningCommit`, `planningIntegrationCommit`). Um restart retoma em vez de
repetir: sem commit duplicado, sem segundo cherry-pick, sem dois Goals novos.

---

## V6 — Job Ownership, Leases and Duplicate Execution Prevention

Uma invariante: **para uma operação lógica, nunca existem duas execuções de agente
concorrentes.**

Isto existe por causa de um incidente real. Um runner desistiu de esperar um job
enquanto o worker ainda o executava; uma segunda correção foi enfileirada para a
mesma rodada e duas inferências Opus trabalharam na mesma worktree. Nada quebrou
daquela vez — que é exatamente por que precisava ser corrigido.

### Vocabulário

| Conceito | O que é |
| --- | --- |
| logical job | a operação: `goal004 / correction / round 2` |
| attempt | uma execução concreta dela: `<jobId>-a1`, `-a2` |
| worker instance | um processo worker vivo, nunca reusado após restart |
| lease | prova durável de que uma attempt possui o job ou a worktree |

### Claim atômico de verdade

O claim usa `open(path, 'wx')` — criação exclusiva, uma única syscall. Não é um
read-check-write, porque dois processos podem ambos passar pela verificação. Há um
teste que sobe **dois processos Node reais** disputando o mesmo claim e exige que
exatamente um vença; duas promises no mesmo processo não provariam atomicidade.

### Timeout do observador não é falha do job

Era o bug central. O runner é espectador: o trabalho pertence à attempt que detém a
lease. Um timeout de espera agora **não** marca FAILED, não libera lease, não cria
attempt nova e não chama modelo de novo — apenas para de observar.

```
runner desiste  ->  job continua RUNNING, lease intacta
                ->  ia-loop:status mostra a attempt viva
                ->  ia-loop:resume re-anexa a execucao existente
```

### Falha fechada em ambiguidade

Uma lease expirada é `SUSPECTED_ORPHAN`, **nunca** "morta". Expiração sozinha não é
evidência de que o worker parou, e agir sobre ela é como dois writers acabam na
mesma árvore. Sem prova de que a execução anterior terminou:
`ORPHANED_EXECUTION_UNCERTAIN` → `HUMAN_REQUIRED`.

PID não conta como prova: PIDs são reusados, então um pid vivo nada diz sobre *esta*
execução. É evidência adicional, jamais suficiente.

### Result fencing

Todo resultado carrega `attemptId`. Um resultado atrasado de uma attempt superada é
gravado para auditoria em `<job>.stale-<attempt>.json`, recusado com
`STALE_ATTEMPT_RESULT`, e **não** avança a máquina de estados nem sobrescreve o
resultado autorizado.

### Cobertura

Vale para todos os agentes, não só o Developer: review, closure e planning também
adquirem lease. Duplicar um review custa inferência e pode gerar duas decisões
conflitantes; duplicar planning poderia criar dois Goals por corrida.

### O que NÃO é retry

Inferência longa com heartbeat saudável é execução válida. Nada aqui mata ou
reinicia por demora: `warningAfterMs` seria observabilidade, não política. Um
deadline real, se um dia existir, será decisão separada e explícita.

---

## Como executar

```bash
npm run test:ia-loop       # 206 testes locais, sem chamadas reais a modelo
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

```bash
npm run ia-loop:status     # lê o estado persistido; não chama modelo
```

```bash
npm run ia-loop:resume     # retoma uma etapa parada por limite de capacidade
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
| `run-status.mjs` | Status a partir do disco; nunca chama modelo |
| `run-resume.mjs` | Retomada de etapa parada por capacidade |
| `lib/capacity-config.mjs` | Intervalos e limites centralizados |
| `lib/capacity-classifier.mjs` | Classificação de erro e sanitização de diagnóstico |
| `lib/capacity-policy.mjs` | Política por causa: esperar ou escalar |
| `lib/capacity-state.mjs` | Estado durável de espera, com resumeFrom |
| `lib/capacity-runner.mjs` | Executa uma inferência sob controle de capacidade |
| `lib/clock.mjs` | Relógio injetável, para testar esperas sem esperar |
| `lib/claude-process.mjs` | Executável, spawn, timeout, parsing, resolução de modelo |
| `lib/contracts.mjs` | Contratos Developer/Reviewer e handoff |
| `lib/state-machine.mjs` | Máquina de estados mínima |
| `lib/agents.mjs` | Papéis fixos e construção de prompt |
| `lib/persistent-session.mjs` | Sessão por agente: cria no 1º turno, resume nos seguintes |
| `lib/session-registry.mjs` | Registro durável de sessões, com escrita atômica |
| `fixtures/synthetic-goal.md` | Tarefa sintética, fora do runtime |
| `tests/*.test.mjs` | 206 testes com processo/agente fake; nenhuma chamada real |

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
