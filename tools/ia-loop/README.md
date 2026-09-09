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
| V13 — Identidade do modelo por evidência explícita | `modelUsage`/`usage` viram observabilidade; identidade vem de `message.model` do stream |
| V14 — Adaptive Model Routing | modelo escolhido por risco: Opus padrão no Tech Lead, Sonnet no Developer, Fable só para HIGH/CRITICAL |
| V18 — Work Unit Execution | rodada decomposta em DAG de Work Units; determinístico sem modelo, mecânico em Haiku, normal em Sonnet, difícil em Opus; contexto por unidade. Atrás de `IA_LOOP_WORK_UNIT_EXECUTION` (padrão: desligado) |
| V19 — Closure documentation roteada | fechamento deixa de cair em Fable por padrão; stage e política próprios, `routeClosureDocumentation` |

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

### Session limit é USAGE_LIMIT

O Claude CLI anuncia o limite de sessão com estas palavras:

```
You've hit your session limit · resets 3:10am (America/Sao_Paulo)
```

Nenhum padrão antigo casava com isso — procurava-se `usage limit`, `quota`,
`limit will reset`. A única condição que o loop existe para **esperar** foi
classificada `UNKNOWN_FATAL`, escalou na hora e parou o Goal005 para um humano
**onze minutos antes** da própria quota resetar. O event log ainda registrou o
episódio como `CAPACITY_LIMIT_REACHED` com `reason: UNKNOWN_FATAL` — um evento
de capacity cuja razão nega que houve limite.

Reconhecidos agora, todos como `USAGE_LIMIT`:

```
session limit
you've hit your session limit
session usage limit
usage limit / quota / weekly limit / N-hour limit
limit will reset
resets 3:10am | resets at 3:10am | resets 15:10
```

`limit` sozinho continua **não** bastando: orçamento de rodada, limite de
contexto e teto de retries carregam a palavra e não são quota. `AUTH_ERROR` e
`BILLING_ERROR` são testados antes, então uma mensagem com as duas coisas
continua sendo o problema que uma pessoa precisa resolver.

### Horário de reset

`parseResetAt()` transforma `resets 3:10am (America/Sao_Paulo)` na espera real.
É uma subtração de relógios de parede na timezone declarada, então a virada de
dia cai fora da conta sozinha: às 23:50 um reset de 3:10am é amanhã.

- a timezone entre parênteses vence; depois `IA_LOOP_TIMEZONE`; depois a da máquina;
- sem `am`/`pm` a hora é lida literalmente em 24h — o horário declarado, não um palpite;
- timezone irresolúvel, hora impossível ou espera acima de 24h → `null`, e a
  política usa o intervalo configurado. Nada é inventado;
- ao **reparar** uma falha antiga, o reset é calculado a partir do instante em
  que a mensagem foi produzida, não do agora. `resets 3:10am` significava 3:10
  daquele dia; ancorar no presente inventaria uma espera de quase um dia para um
  horário que já passou.

Um `Retry-After` explícito continua vencendo o horário de reset.

### FAILED não é o mesmo que capacidade

| Status | Significado | Retry |
| --- | --- | --- |
| `COMPLETED` | resultado em disco | nunca repetir |
| `FAILED` | tentou e não deu certo | não automático; é decisão de pessoa |
| `INTERRUPTED` | nada foi aprendido — crash, reboot | nova attempt |
| `WAITING_FOR_CAPACITY` | o modelo disse "agora não" | nova attempt após `nextRetryAt` |
| `SUPERSEDED` | histórico | nunca executar |

Um limite de quota **nunca** termina como `FAILED`. `RETRYABLE_JOB_STATUSES` é
`['INTERRUPTED', 'WAITING_FOR_CAPACITY']`, e `FAILED`/`SUPERSEDED`/`COMPLETED`
seguem fora dela de propósito.

### Cada chamada real é uma attempt

Antes, um retry de capacidade reentrava na **mesma** attempt: um `attemptId`
cobria a chamada que bateu no muro e a que fez o trabalho, o result fencing não
distinguia as duas e a história mostrava uma tentativa onde houve duas.

```
005:r1:review                       stage lógico — o que precisa acontecer uma vez
005-r1-tech_lead-ca1d7bf4           job do stage — id estável
  a1  WAITING_FOR_CAPACITY / USAGE_LIMIT
  a2  QUEUED → RUNNING → COMPLETED
```

O stage e o job não mudam; o que um retry cria é uma attempt sucessora, via a
mesma `startNextAttempt()` usada por recovery — não uma segunda implementação.
`attemptHistory` guarda, por attempt: `attemptId`, `startedAt`, `endedAt`,
`status`, `classification`, `retryReason`, `nextRetryAt`, `capacityWait`, `role`.

Idempotência: se `a2` já está `QUEUED`, um novo resume não cria `a3`; se está
`RUNNING`, espera; se `COMPLETED`, consome o resultado. Se `a2` também bater na
quota, ela vira `WAITING_FOR_CAPACITY` e `a3` virá depois. O modelo é sempre o
mesmo — não existe ação de fallback na política.

### Eventos de capacity só nomeiam capacity

`capacity-runner` escolhia o evento com um ternário que só sabia "harness ou
capacity", então toda outra família virava `CAPACITY_LIMIT_REACHED`. O tipo agora
vem de `eventTypeFor()`/`producesCapacityEvent()`:

| Reason | Evento |
| --- | --- |
| `RATE_LIMIT`, `USAGE_LIMIT` | `CAPACITY_LIMIT_REACHED`, `CAPACITY_WAIT_STARTED`, `CAPACITY_RETRY`, `CAPACITY_AVAILABLE`, `CAPACITY_WAIT_ENDED` |
| `HARNESS_ERROR`, códigos locais | `HARNESS_ERROR` |
| erros de contrato | `AGENT_CONTRACT_ERROR` |
| `UNKNOWN_FATAL`, `UNKNOWN_TRANSIENT` | `AGENT_FAILURE`, e a espera vira `AGENT_RETRY` / `AGENT_RETRY_SCHEDULED` |

Eventos históricos não são reescritos: a correção vale daqui para frente.

### Reclassificar uma falha mal lida

```bash
npm run ia-loop:reclassify -- --role tech_lead --job 005-r1-tech_lead-ca1d7bf4
npm run ia-loop:reclassify -- --role tech_lead --job <id> --apply
```

Dry por padrão. Isto **não** é `--resolved`: não aposenta a run nem declara um
problema resolvido. Ele diz o que a falha realmente era, com base na evidência
já em disco, e devolve o fluxo à trilha normal de capacidade.

O que o impede de virar um jeito de fazer falhas sumirem:

- a nova classificação é **derivada**, nunca afirmada — o diagnóstico persistido
  é reprocessado pelo classificador atual; se continuar lendo igual, o reparo é
  recusado (`NOTHING_TO_RECLASSIFY`);
- só move uma falha para algo que a política **esperaria**. Fatal continuar fatal
  não é reparo (`RECLASSIFICATION_NOT_A_WAIT`);
- stage já concluído nunca é reaberto;
- nada é apagado: status original, classificação original e o envelope de falha
  sobrevivem (`results/<role>/<jobId>.failed-<attemptId>.json`), e o evento
  `FAILURE_RECLASSIFIED` registra a correção com `from`, `to`, `attemptId`,
  `reason` e ponteiro para a evidência.

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

## V7 — Autonomous Goal-to-Goal Execution

Até a V6 o loop parava em toda fronteira: `ACCEPTED` levava a `AWAITING_HUMAN`,
e o próximo Goal só começava por comando. A V7 remove **essa** parada, e apenas
ela. Tudo o que era motivo legítimo de parar continua parando.

### O que passou a continuar sozinho

```
ACCEPTED → CLOSURE_PREPARING → … → BASELINE_ACCEPTED
        → NEXT_GOAL_PLANNING → NEXT_GOAL_READY → NEXT_GOAL_STARTING
        → PREPARING_WORKTREE  (Goal seguinte)
```

`AWAITING_HUMAN` segue alcançável para uma execução supervisionada, mas deixou
de ser onde o caminho feliz termina. Um teste percorre o ciclo completo e falha
se ele encostar em `AWAITING_HUMAN`.

### O que continua parando

| Situação | Efeito | Por quê |
| --- | --- | --- |
| `RATE_LIMIT`, `USAGE_LIMIT` | **espera**, não parada | Limite de uso é hora do dia, não problema. Parar aqui pararia o loop toda noite. |
| `AUTH_ERROR`, `BILLING_ERROR`, `MODEL_UNAVAILABLE` | `PAUSED_FOR_HUMAN` | Nada que o loop faça resolve. |
| `HARNESS_ERROR`, `AGENT_CONTRACT_ERROR`, `POLICY_VIOLATION` | `PAUSED_FOR_HUMAN` | O harness ou o contrato está errado; insistir amplifica o erro. |
| `MAX_CORRECTION_ROUNDS_REACHED` | `PAUSED_FOR_HUMAN` | O Developer não está convergindo. |
| `CHERRY_PICK_CONFLICT`, `ACCEPTED_WORKTREE_CHANGED` | `PAUSED_FOR_HUMAN` | Integração ambígua; resolver sozinho é reescrever história. |
| `ORPHANED_EXECUTION_UNCERTAIN` | `PAUSED_FOR_HUMAN` | Herdado da V6: lease expirada nunca é prova de morte. |
| Fronteira de Goal ambígua | `PAUSED_FOR_HUMAN` | Ver abaixo. |
| Decisão de produto ou arquitetura | `PAUSED_FOR_HUMAN` | Não cabe a nenhum agente. |

`PAUSED` e `PAUSED_FOR_HUMAN` são estados diferentes de propósito: o primeiro é
uma **decisão** reversível com `clearPause()`; o segundo é um **problema**, e
não há caminho que o transforme no primeiro.

### A fronteira entre dois Goals

É o único ponto onde um loop autônomo pode fazer a coisa errada em silêncio:
começar sobre a baseline errada, reaproveitar uma worktree de outra execução, ou
recomeçar trabalho que já foi commitado. `lib/goal-boundary.mjs` julga a
fronteira sobre fatos já coletados — função pura, testável sem repositório — e
**não conserta nada**:

- Goal precisa estar `READY`;
- a baseline declarada pelo Goal precisa bater com a aceita (divergência = um
  fechamento que não terminou de registrar, ou commit fora do loop);
- `main` limpa;
- branch e worktree do Goal precisam existir **juntos** — um sem o outro é um
  estado meio-feito que ninguém interpreta com segurança. Os dois presentes é o
  caso de retomada; nenhum dos dois é começo limpo.

### Run state e goal execution state

Dentro de um único `runtime.json` existem **duas coisas diferentes**, e tratá-las
como uma só foi o defeito que a primeira transição automática de Goal expôs:

| | o que é | atravessa a fronteira? |
| --- | --- | --- |
| **run state** | a campanha: `autonomousRunId`, `migrationAcceptedBaseline`, `reviewLevel`, `mode`, `mainGuardCheckpoint` | **sim** |
| **goal execution state** | uma tentativa de um Goal: `round`, `currentJobId`, `currentAttemptId`, `jobIdsByRound`, `blockers`, `decision`, `correction`, `closure`, `recovery`, `capacity`/`resumeFrom`, `acceptedSnapshot`, worktree da execução | **nunca** |

A fronteira vive em `lib/goal-execution.mjs`:

- `goalExecutionOf(runtime, goalId)` — **o portão de leitura**. Devolve `null`
  quando o estado em disco é de outro Goal. Todo lugar que antes espiava o
  runtime atrás de uma dica (um job id, um round, um relatório, um ponto de
  retomada) passa por aqui, e recebe `null` — que é a verdade: nada se sabe
  ainda sobre este Goal.
- `initializeGoalExecutionState({ previousRuntime, goal, execution })` —
  constrói o estado do próximo Goal **explicitamente**, carregando apenas a
  allowlist run-scoped. Nunca `{ ...oldRuntime, goal: '005' }`: um spread
  preserva todo campo em que ninguém pensou, e foi exatamente assim que os job
  ids do Goal 004 chegaram ao dispatch do Goal 005.
- `staleGoalPointers(runtime, goalId)` — relata (não conserta) os ponteiros de
  outro Goal encontrados em disco, com o campo e o que ele nomeava. Job ids são
  julgados pelo **próprio id**, não pelo `runtime.goal`: um runtime pode dizer o
  Goal certo e carregar ids errados — foi exatamente o que a transição falha
  deixou em disco (`goal: "005"` ao lado de `currentJobId:
  "004-r1-developer-69a88746"`).
- `assertBelongsToGoal` / `jobIdForGoal` / `readJobForGoal` — falham fechado com
  `CROSS_GOAL_STATE_LEAK`.

Um campo que ninguém classificou é **descartado** na fronteira em vez de
herdado: perder um campo é visível e recuperável; herdar um é o defeito.

### Toda entidade "current" é escopada por Goal

No contexto de execução do Goal G, toda entidade que é *current* satisfaz
`entity.goal === G` — job, attempt, stage, result, review, origem de blocker,
continuação de recovery, operação de capacidade, metadados de worktree. Uma
entidade histórica de outro Goal **continua existindo no store** — isso é o que
história é — mas nunca pode ser selecionada:

- o job id carrega o Goal (`005-r1-developer-…`), então um ponteiro cross-goal é
  detectável sem consultar o store (`goalOfJobId`);
- `reconcileExecutionState({ goal })` filtra na leitura **e** o ledger recusa
  segurar stage de outro Goal — toda `stageKey` começa pelo Goal;
- `dispatchJob` recusa reaproveitar um job em disco cujo `goal` não bate com o
  despachado;
- `planRecovery` descarta um `runtime.currentJobId` que nomeia outro Goal em vez
  de segui-lo.

`CROSS_GOAL_STATE_LEAK` é **HARNESS_ERROR** na taxonomia e `HUMAN_REQUIRED` na
run — nunca um veredito sobre o Goal que estava começando.

### O boundary Goal→Goal

```
FINALIZE_GOAL_EXECUTION
  → ARCHIVE_GOAL_EXECUTION_STATE     .state/goal-executions/<goal>.json
  → INITIALIZE_NEXT_GOAL_EXECUTION   round 1, sem nada herdado
  → DISPATCH_NEXT_GOAL
```

Atravessado em `run-auto` no início de cada iteração — não no instante em que o
ponteiro da run mudou — porque esse é o ponto que **todo** caminho alcança:
continuação automática, retomada de pausa, e restart após crash entre o
fechamento de um Goal e o começo do próximo. É idempotente: chegar duas vezes
não custa nada e não rebobina um Goal que já começou a trabalhar. O arquivo do
Goal anterior é escrito uma vez e nunca reescrito; nada é apagado.

Eventos: `GOAL_EXECUTION_ARCHIVED`, `NEXT_GOAL_EXECUTION_INITIALIZED`,
`CROSS_GOAL_STATE_LEAK_DETECTED` (com campos sanitizados).

O defeito que gerou tudo isso: Goal 004 `ACCEPTED` → closure → nova baseline →
Goal 005 `READY` → o loop seguiu sozinho. `run-auto` moveu o ponteiro da run
para 005; o execution state em disco continuou sendo o de 004. O ledger do Goal
005 estava vazio, então a cadeia de fallback de job id em `run-goal` chegou a
`jobIdsByRound["1"].developer` do Goal **anterior** e despachou
`004-r1-developer-69a88746` — uma tentativa já `SUPERSEDED`. O store recusou
(`STAGE_NOT_RETRYABLE`) e a run parou como `UNKNOWN_FATAL`, parecendo, de fora,
que o Goal 005 havia falhado. O Goal 005 nunca rodou; nenhuma inferência
aconteceu para ele.

### Fim de migração é afirmação, nunca inferência

O planning tem exatamente três respostas — `NEXT_GOAL`, `MIGRATION_COMPLETE`,
`HUMAN_REQUIRED`. "Não achei próximo Goal" não é uma delas. `MIGRATION_COMPLETE`
exige `reason` e `remainingCriticalGaps` vazio, e depois é **verificada contra o
repositório**: se qualquer Goal continuar `READY`, `IN_PROGRESS`,
`REVIEW_REQUIRED` ou `CHANGES_REQUIRED`, a declaração é rejeitada com
`MIGRATION_NOT_COMPLETE`, independentemente do que o modelo afirmou. As três
opções vão no `enum` do schema entregue ao CLI, não só na validação local.

### Uma execução autônoma por vez

O orquestrador tem lease própria (`migration-loop`), separada das leases de job
e worktree da V6: ela governa **decisões globais**, não execuções em voo. Um
segundo `ia-loop:auto` é recusado com `AUTONOMOUS_RUN_ALREADY_ACTIVE`. Um
processo que morre e volta faz `attach()` — retoma o mesmo `autonomousRunId`,
com `completedGoals` preservado, e nunca abre uma segunda run.

`recordGoalCompleted()` é idempotente: uma run retomada não conta o mesmo Goal
duas vezes.

**Bug corrigido aqui:** o teste de corrida com dois processos Node reais expôs
que o perdedor quebrava com `LEASE_CORRUPT`. Criar o arquivo com `wx` e escrever
o conteúdo são dois passos, e quem chega no meio vê um arquivo vazio — que é a
assinatura de *claim em andamento*, não de corrupção. A leitura agora aguarda a
claim assentar por uma janela curta; um arquivo que continua vazio depois disso
segue sendo `LEASE_CORRUPT`.

### Pausa

`ia-loop:pause` levanta uma flag; não mata nada. A flag é consultada apenas em
fronteiras seguras, nunca no meio de uma inferência ou de uma escrita.
`--after-goal` espera o Goal inteiro terminar, que é o que deixa a árvore
inspecionável quando o loop para.

### O que a primeira execução real expôs

Três defeitos que só existiam porque, até a V6, **nada atravessava uma fronteira
de Goal sozinho**. Eram inofensivos enquanto um humano começava cada Goal; a V7
os transformou em falha na primeira tentativa.

1. **Herança do runtime entre Goals.** O Goal003 terminara na rodada 2 com
   `CHANGES_REQUIRED`. O loop abriu o Goal004 como *"Round 2 (correction)"* sem
   blockers — job que nem é válido. `PER_GOAL_RUNTIME_FIELDS` passou a declarar
   explicitamente o que descreve **uma** execução (rodada, blockers, decisão,
   jobs, closure, relatório de implementação, bloqueio de capacidade), e
   `clearPerGoalRuntime()` os remove ao começar um Goal diferente. Retomada do
   mesmo Goal continua preservando tudo. A lista é explícita, e não um filtro,
   para que acrescentar um campo por Goal seja decisão de alguém aqui.

2. **Decisão lida fora de escopo.** O `run-auto` leu `decision: ACCEPTED` do
   runtime e produziu o diagnóstico `"Goal 004 ended as ACCEPTED"` junto de uma
   falha — a decisão era do Goal003. Decisão e closure agora só contam se
   pertencerem ao Goal que acabou de rodar. Ler decisão de outro Goal é como um
   loop se parabeniza por trabalho que não fez.

3. **Lease do orquestrador vazando.** Uma run que parava por `HUMAN_REQUIRED`
   lançava **antes** do próprio bloco `try`, então o lease tomado por `attach()`
   ficava para trás; a tentativa seguinte era recusada por um lease que ninguém
   segurava — o loop trancado fora de si mesmo. Todo caminho de saída entre
   `attach()` e o `try` passa a soltar o lease, e o teste lê o código-fonte,
   porque o defeito está no fluxo de controle e não em um valor.

Junto veio a saída de `PAUSED_FOR_HUMAN`, que não existia: `--resolved "<o que
foi resolvido>"` arquiva a run parada em `.state/autonomous-runs/<id>.json`,
preservando o motivo da parada, quem resolveu e a nota. Sem nota, nada é
arquivado — silêncio não limpa problema — e o loop não pode executar esse
caminho sozinho.

### Job não é attempt

Depois do fix anterior, o recovery decidiu `REQUEUE_JOB` para a correção
interrompida da R2 e devolveu o job para `QUEUED` — **apontando ainda para a
tentativa interrompida**. O job parecia pronto, nada estava, a lease órfã da `a1`
continuava no disco, e o Developer ficou `IDLE` contra um trabalho que era dele.
Indefinidamente.

Re-enfileirar o job lógico e criar a próxima tentativa são atos diferentes. Só o
segundo produz algo reivindicável.

```
job         004-r2-correction-dde6dca4     o estágio 004:r2:correction
attempt a1  ...-a1  INTERRUPTED            uma tentativa dele
attempt a2  ...-a2  QUEUED                 a seguinte
```

**Estado proibido, agora detectado:** job `QUEUED` + attempt `INTERRUPTED`.
`isInconsistentAttemptState()` o reconhece e `needsNewAttempt()` o traduz em
"precisa de nova tentativa" em vez de "já enfileirado" — que era a leitura que
deixava o worker esperando. `setJobStatus` passou a escrever status do job e da
tentativa **juntos**, para que não voltem a divergir.

`startNextAttempt()` é a única implementação de "faça a próxima tentativa",
compartilhada por recovery e dispatch. Ela: recusa se o estágio tem resultado;
recusa se a tentativa atual está `QUEUED` ou `RUNNING`; exige `INTERRUPTED`;
incrementa; grava `currentAttemptId`; e **anexa** a anterior ao `attemptHistory`.
Duas recoveries concorrentes criam **uma** tentativa — vencedor por criação
exclusiva de arquivo.

**Leases.** A lease da `a1` é aposentada com prova de orphan e arquivada em
`.superseded`; a `a2` reivindica a sua. Sem isso, a tentativa nova seria tão
inreivindicável quanto a velha: era a lease órfã que fazia o worker recusar.

**O worker parou de se cegar.** O conjunto `seen` era por *job*: uma recusa
virava permanente, e a tentativa que o recovery materializasse depois nunca era
notada. Agora a chave é `<jobId>#a<N>`, e uma recusa que o recovery pode desfazer
não é memorizada.

### Fingerprint por tentativa

`worktree-fingerprint-before-a1.json`, `-a2.json`, … Um arquivo único era
sobrescrito a cada passagem, então o estado de onde uma tentativa partiu se
perdia assim que a seguinte rodava — e reconstruir isso é a razão de capturar.
Snapshots anteriores nunca são reescritos.

### Estágio, tentativa, e o direito de tentar de novo

O recovery decidiu `REQUEUE_JOB` para uma correção interrompida, a reconciliação
concordou — *"next is CORRECTION at round 2"* — e o despacho morreu com
`DUPLICATE_JOB`. As duas metades discordavam sobre **quem é dono da existência
do job**: o recovery re-enfileirava o mesmo job, e o runner sempre chamava
`publishJob`, que recusa sobrescrever.

Não era específico do caso interrompido: **qualquer retomada de um estágio cujo
job já existisse** morria igual.

```
stageKey   004:r2:correction          o que precisa acontecer uma vez
jobId      004-r2-correction-dde6dca4 o job DESSE estágio
attempt    a1 INTERRUPTED, a2 QUEUED  cada tentativa dele
```

O `jobId` **é** o job do estágio. O que muda entre tentativas é o número. Criar
um id novo significaria o mesmo trabalho sob dois nomes — exatamente a confusão
que o ledger de estágios existe para remover.

`store.dispatchJob()` substitui o `publishJob` cego no runner:

| situação no disco | resultado |
| --- | --- |
| job ausente | `PUBLISHED`, tentativa 1 |
| resultado bem-sucedido | `ALREADY_COMPLETED` — reaproveita, não chama modelo |
| `QUEUED` | `ALREADY_QUEUED` — espera, não publica de novo |
| `RUNNING` | `ALREADY_RUNNING` — quem julga se está vivo é a lease |
| `INTERRUPTED` | `NEW_ATTEMPT` — mesmo job, tentativa seguinte |
| `COMPLETED`/`FAILED`/`SUPERSEDED` | `STAGE_NOT_RETRYABLE` |

`FAILED` está deliberadamente fora dos retentáveis: o trabalho foi tentado e não
deu certo, e repetir é decisão de política que uma pessoa toma — não algo que um
restart assume.

A tentativa anterior fica no `attemptHistory` como `INTERRUPTED`, com o motivo.
Duas recoveries concorrentes criam **uma** tentativa: o vencedor sai de criação
exclusiva de arquivo, o mesmo primitivo das leases.

O worker parou de fixar `attemptIdFor(jobId, 1)` e passa a ler o número do job —
sem isso a segunda tentativa usaria o id da primeira, e o result fencing não
distinguiria as duas.

**Leases ganharam versão.** O compare-and-swap comparava `heartbeatAt`, que tem
resolução de milissegundo: um claim e um renew no mesmo milissegundo eram
indistinguíveis, e o CAS sobrescrevia uma lease que havia se movido. Era a causa
de uma falha de teste que aparecia de vez em quando e não reproduzia. `version` é
monotônica; `heartbeatAt` fica como fallback para leases escritas antes disso.

### Fingerprint completo da worktree

A perícia do incidente do duplicate R1 conseguiu provar só metade da árvore.

O conteúdo **tracked** era demonstrável: o diff da R1 estava salvo em
`artefacts/004-r1/implementation.patch` e o packet trazia o mesmo diff inline —
os dois com o mesmo sha256, o que valida a evidência contra si mesma. Recalculado
pelo mesmo code path, o diff de hoje bate byte a byte.

Os **20 arquivos untracked**, não. `git diff` não os inclui, e o
`worktreeFingerprint` antigo hashava só conteúdo tracked (`git stash create`).
O veredito honesto para eles foi `UNPROVEN` — e continua sendo. Nada aqui declara
retroativamente que a R1 estava provada nos untracked; o que existe é ausência de
evidência de alteração (mesmos 20 caminhos, nenhum novo ou removido, nenhum
tracked alterado, mtimes anteriores à tentativa duplicada), e ausência de
evidência não é prova.

`fullWorktreeFingerprint()` fecha a lacuna daqui para frente:

| campo | o que cobre |
| --- | --- |
| `trackedDiffHash` | sha256 do diff contra a base |
| `untracked[]` | cada caminho untracked com o **sha256 do conteúdo** e o tamanho |
| `untrackedHash` | um valor que muda se qualquer untracked mudar, entrar ou sair |
| `head`, `branch`, `worktreeInitialHead`, `base` | identidade da árvore |
| `contentHash` | a árvore inteira em um valor, para uma comparação só |

Conteúdo, nunca timestamp: mtime diz quando alguém escreveu; hash diz o que está
lá. O conteúdo é hasheado como **bytes** — normalizar fim de linha faria dois
arquivos genuinamente diferentes hashearem igual, que é a única coisa que um
fingerprint não pode fazer.

É capturado e persistido **antes** de cada inferência
(`worktree-fingerprint-before.json`) e junto do review packet
(`worktree-fingerprint-reviewed.json`, também embutido no packet).
`compareFingerprints()` devolve os deltas — caminhos adicionados, removidos e
modificados — porque "algo mudou" não é acionável; depois do incidente o que
faltou foi a lista de caminhos.

### Reconcile before dispatch

Depois do attach, o loop publicou `004-r1-developer-69a88746` e mandou o Opus
**reimplementar a rodada 1** — cuja implementação e cujo review já estavam no
disco, com quatro blockers.

A causa não foi o handoff. Foi a seleção de rodada: ela derivava dos **ids
gravados no runtime**, que são uma pista, e o código os tratava como
autoridade. O `jobIdsByRound` só passou a existir num commit posterior à
execução da R1, então o runtime no disco não tinha o campo. Sem id gravado, o
loop concluiu que nada havia sido feito, sorteou um id novo, não achou resultado
sob um nome que nunca existira, e despachou.

A pergunta mudou de *"que id eu anotei?"* para *"o que está terminado?"*.
Completude passa a ser derivada dos **resultados**, a única prova durável de que
uma inferência aconteceu. Ids são tentativas; resultados são fatos.

### Identidade lógica de estágio

`004-r1-developer-d8f21303` e `004-r1-developer-69a88746` são duas tentativas da
mesma coisa. Nada no sistema dizia isso.

```
stageKey   004:r1:implementation      o que precisa acontecer uma vez
jobId      004-r1-developer-69a88746  uma tentativa disso
```

Tentativas continuam únicas — é o que faz lease e result fencing funcionarem.
Completude é propriedade do **estágio**, e o estágio é derivado dos próprios
campos do job (papel, rodada, tipo), então vale para todo job já no disco,
inclusive os escritos antes de estágios terem nome.

### Duplicate stage guard

`assertNoDuplicateStageDispatch` roda **imediatamente antes** de publicar
qualquer job e falha fechado com `DUPLICATE_COMPLETED_STAGE_DISPATCH`.

A invariante, verificada contra toda rota que já produziu um id — restart,
recovery, attach, capacity resume, ponteiro velho, id aleatório novo:

> para um mesmo goal + rodada + estágio, se existe resultado terminal válido, o
> despacho daquele estágio é proibido.

A única exceção é a tentativa que **produziu** o resultado: reentrar com ela é
idempotência, e o runner reaproveita o resultado em vez do modelo.

**Duas camadas independentes, de propósito:** o handoff diz *onde continuar*; o
result store prova *o que terminou*. O handoff pode estar ausente, velho ou
corrompido — os resultados barram o duplicado assim mesmo, porque o guard não
consulta o handoff.

Tentativas que nunca deveriam ter existido viram `SUPERSEDED`, não são apagadas:
o que o harness fez de errado continua legível.

### Blockers viajam com o review

`CHANGES_REQUIRED` na R1 leva à correção da R2 carregando **os blockers daquele
review**, lidos do resultado no disco. Nunca são redescobertos chamando o Fable
de novo.

### Ctrl+C devolve a lease do loop

O `run-auto` não tratava sinal, então o `finally` nunca rodava e a lease do
orquestrador ficava para trás envelhecendo — foi assim que a `migration-loop-a3`
virou órfã. Agora SIGINT/SIGTERM devolvem **apenas essa** lease, sem `force`.
Leases de job e worktree não são tocadas: um sinal ao orquestrador não diz nada
sobre um processo de modelo ainda escrevendo.

### Handoff: a run é uma coisa, o orchestrator é outra

O primeiro recovery real terminou dizendo `RECOVERY COMPLETE / Continue with:
npm run ia-loop:auto` — e o `auto` respondeu `AUTONOMOUS_RUN_ALREADY_ACTIVE:
Run auto-7b32c56a owns the loop`, enquanto o `status` dizia `NOT HOLDING THE
LOOP`. As duas frases eram verdadeiras sobre coisas diferentes.

```
Autonomous Run   auto-7b32c56a   RUNNING   a campanha não terminou
Orchestrator     NONE                      nenhum processo está conduzindo
```

Esse par é um estado **válido** depois de um crash. `RUNNING` fala do ciclo de
vida da migração; não afirma que existe processo vivo. Confundir os dois é o que
deixou a run encalhada.

**Dois defeitos, e o segundo é o mais perigoso:**

1. **Posse fantasma.** O `run-recover` adquiria a lease do orquestrador e
   terminava. Por toda a janela de expiração a lease lia como dono saudável — e
   bloqueava exatamente o comando que o próprio recovery mandava rodar.

2. **`run-auto` apagava lease alheia.** O `failAfterAttach` liberava com
   `force: true`, que ignora a checagem de dono. Recusar-se a começar porque
   *outro* orquestrador detinha o loop **também apagava a lease dele** — "outro
   é dono" virava "ninguém é dono" na mesma respiração. Se houvesse um segundo
   orquestrador de verdade, essa era a porta para dois processos na mesma run.
   A liberação passou a ser sem `force`: `LEASE_NOT_OWNED` é o no-op correto.

**Recovery não vira o orquestrador.** Ele prova que o dono anterior morreu,
registra qual é o próximo passo seguro, escreve um handoff e sai **sem segurar
nada**. O handoff é um token de uso único (`nonce`) com `autonomousRunId`,
`recoveryAttempt`, `recoveredFromState`, `nextSafeAction`, `jobId` e o dono
substituído.

**`ia-loop:auto` anexa.** Ao reatacar, valida o handoff — mesma run, não
consumido, bem formado — consome o token e segue como orquestrador **da mesma
run**: mesmo `autonomousRunId`, mesma história, tentativa posterior. Handoff de
outra run é recusado, nunca esticado para servir. Dois `auto` simultâneos: a
lease decide por criação exclusiva, e o token confirma; o perdedor recebe
`ORCHESTRATOR_ALREADY_ATTACHED`.

Nenhuma run nova é criada. `start()` deixou de responder
`AUTONOMOUS_RUN_ALREADY_ACTIVE` para uma run `RUNNING` sem lease — agora é
`AUTONOMOUS_RUN_NEEDS_ATTACH`, que é o que realmente se quer dizer.

### Main guard checkpoint ≠ execution base

Commits de tooling entram na main enquanto um Goal está parado. Para que a
execução seguinte não leia isso como o Developer tendo escrito fora da worktree,
recovery e attach gravam `mainGuardCheckpoint` — head da main, instante e
motivo, rotulado como *operational checkpoint, not the execution base*.

`executionBase`, `worktreeInitialHead` e `migrationAcceptedBaseline` **não são
tocados**: o diff de mérito continua medido contra a árvore original. São coisas
distintas e ficam guardadas como coisas distintas.

### Status

```
Current Goal: 005
Goal execution:
  Round: 1
  State: GOAL_READY
Previous Goal: 004 (ACCEPTED)

Active job: none for Goal 005.

Run:
  auto-7b32c56a
  State: RUNNING

Orchestrator:
  State: RECOVERED_READY
  Holding loop: NO
  Recovery: VALID
  Next action: CONSUME_RESULT — 004-r1-tech_lead-4ded365b
```

Run e orchestrator são blocos separados, então não há como imprimir "ninguém
segura o loop" e recusar o attach dizendo "a run segura o loop".

Do mesmo modo, *current Goal* e *goal execution* são blocos separados: o bloco de
execução só é preenchido quando o estado em disco é daquele Goal, e job ativo é
filtrado pelo Goal corrente. Nunca aparece um job `004-*` como ativo enquanto o
Goal corrente é 005 — leases de outros Goals são listadas à parte, rotuladas
como históricas.

Eventos: `RECOVERY_READY_FOR_ATTACH`, `ORCHESTRATOR_ATTACH_STARTED`,
`ORCHESTRATOR_ATTACH_SUCCEEDED`, `ORCHESTRATOR_ATTACH_FAILED`,
`RECOVERED_RUN_RESUMED`.

### Testes da V7

Nenhum chama modelo. O principal (`THE MULTI-GOAL RUN`) leva dois Goals
completos — um com rodada de correção, outro aceito de primeira — até uma
declaração de fim verificada, e afirma o que define autonomia:
`humanInterventionCount === 0`, `completedGoals == ['004','005']`, baseline
avançando a cada Goal, uma chamada de Developer por rodada.

Os demais cobrem: parada por `HUMAN_REQUIRED` sem avançar de Goal; espera de
capacidade atravessando Goals sem encerrar a run; crash entre Goals retomando
exatamente uma vez; fronteira ambígua; **dois processos Node reais** disputando
a lease do orquestrador; pausa; e fim de migração.

---

## Recovery — quando o processo morre

A V6 estabeleceu que uma lease vencida é `SUSPECTED_ORPHAN` e nunca "morta":
heartbeat velho não prova morte, e agir sobre ele é como dois processos acabam
escrevendo na mesma worktree. Isso estava certo — e deixava uma lacuna: **não
havia caminho para chegar à prova**. Uma máquina que reiniciasse no meio de uma
execução ficava presa, e a única saída era apagar arquivo interno na mão.

Isto fecha a lacuna sem afrouxar a regra.

### Como o abandono é provado

Uma lease vira `ORPHAN_CONFIRMED` só quando algo torna **impossível** o dono
antigo escrever de novo:

| Prova | Evidência |
| --- | --- |
| `DIFFERENT_BOOT` | a máquina bootou depois de a lease ser tomada — nenhum processo que a segurava sobreviveu |
| `PROCESS_GONE` | o pid não existe |
| `PID_REUSED` | o pid existe mas começou em outro instante: é outro processo com número reciclado |

Qualquer outra coisa continua `SUSPECTED_ORPHAN`. Ausência de evidência nunca
vira evidência de ausência. E um dono **vivo** com heartbeat velho é
`OWNER_ALIVE` — uma inferência longa não é um crash.

`DIFFERENT_BOOT` compara o boot atual com o `acquiredAt` da própria lease, então
funciona inclusive em lease escrita **antes** desta feature existir — que é
exatamente a lease que o primeiro reboot deixa para trás.

pid sozinho nunca basta: Windows e POSIX reciclam ids. Toda lease passou a
carregar `hostname`, `bootAt`, `pid`, `processStartedAt` e `workerInstanceId`.
No Windows o start time vem do CIM, no POSIX do `ps`; falha na consulta devolve
`UNKNOWN`, e `UNKNOWN` nunca confirma nada.

### Takeover é troca, não remoção

Recovery nunca é "apagar a lease e tentar de novo". O vencedor é decidido pelo
mesmo primitivo que decide um claim — criação exclusiva de arquivo — e a troca é
um compare-and-swap contra a lease exata que foi julgada: se ela mudou entre o
julgamento e a troca, alguém agiu e o takeover **aborta**. A lease substituída é
arquivada em `<lease>.superseded`, com a prova que a aposentou. História não se
sobrescreve.

`attach()` deixou de tomar lease envelhecida à força — era precisamente o
palpite que recovery existe para evitar.

### `resume` e `recover` são coisas diferentes

```bash
npm run ia-loop:resume    # a espera por capacidade terminou?
```

```bash
npm run ia-loop:recover   # o dono da execução desapareceu
```

Juntar os dois faria "o modelo está com limite de uso" e "o processo morreu"
serem o mesmo evento, e eles pedem respostas opostas. `resume` inalterado;
quando o estado é de execução, ele passa a apontar para `recover` em vez de
dizer "nada a fazer".

```bash
npm run ia-loop:recover -- --dry-run   # inspeciona e não escreve nada, nem evento
```

### O que recovery decide, por estado

| Estado | Resultado já no disco | Ação |
| --- | --- | --- |
| `DEVELOPER_RUNNING`, `CORRECTION_RUNNING`, `REVIEWER_RUNNING`, `CLOSURE_DOCUMENTING`, `NEXT_GOAL_PLANNING` | sim | `CONSUME_RESULT` — **o modelo não é chamado de novo** |
| idem | não | tentativa vira `INTERRUPTED`, o **mesmo** job é re-enfileirado |
| `*_QUEUED` | — | re-enfileira |
| `ACCEPTED`, `CLOSURE_*`, `GOAL_COMMIT*`, `INTEGRATING_ACCEPTED`, `BASELINE_ACCEPTED` | — | `RESUME_PHASE` — o `run-close` pula o que já registrou (SHA de commit, cherry-pick, jobs) |
| `WAITING_FOR_CAPACITY` | — | `RECOVERY_BLOCKED` — isso é `resume` |
| `HUMAN_REQUIRED`, `AWAITING_HUMAN`, run `PAUSED_FOR_HUMAN` | — | `RECOVERY_BLOCKED` — recovery não resolve porta humana |

Os estados de execução são **derivados** do registry (`execution: true`), não
listados à mão — a lista paralela que esqueceu `CORRECTION_RUNNING` na V4 não se
repete.

`INTERRUPTED` é deliberadamente diferente de `FAILED`: `FAILED` é trabalho
tentado que não deu certo, e um humano olha; `INTERRUPTED` é trabalho sobre o
qual nada se aprendeu. Um worker nunca pega um `INTERRUPTED` sozinho — quem
decide re-enfileirar, substituir ou consumir um resultado é o orchestrator.

### O defeito que a inspeção encontrou

Dois, na verdade, e o segundo teria custado uma inferência:

1. **O job id do reviewer era sorteado a cada passagem.** Qualquer retomada
   republicava o review e chamava o Fable de novo, mesmo com a resposta dele já
   no disco. Agora é registrado e reaproveitado como o do Developer.

2. **`currentJobId` era um só para os dois papéis.** Com o loop parado em
   `REVIEWER_RUNNING`, o id gravado era o do Tech Lead — e o passo do Developer
   o adotaria na retomada, não acharia resultado de Developer sob ele, e
   chamaria o Opus outra vez, sob um job id que pertencia ao Tech Lead. Duas
   inferências, uma delas já paga. Os ids passaram a ser gravados por **papel e
   por rodada**.

No caso real que motivou tudo isto, o resultado do review tinha sido gravado
**4 segundos depois** do último heartbeat: o crash matou o leitor, não o
trabalho.

### Auditoria

`ORCHESTRATOR_ORPHAN_SUSPECTED`, `ORCHESTRATOR_ORPHAN_CONFIRMED`,
`RECOVERY_STARTED`, `LEASE_TAKEOVER_SUCCEEDED`, `LEASE_TAKEOVER_FAILED`,
`JOB_INTERRUPTED`, `JOB_RESULT_REUSED`, `JOB_REQUEUED_AFTER_RECOVERY`,
`RECOVERY_COMPLETED`, `RECOVERY_BLOCKED` — cada um com goal, round, state,
runId, attemptId, dono antigo e novo, sanitizados.

`ia-loop:status` ganhou um bloco `ORCHESTRATOR:` com dono, tentativa, idade do
heartbeat e **`Recovery eligible: YES/NO`** com o motivo. E `Attempt:` deixou de
imprimir `undefined`: a lease do orchestrator não tinha tentativa nenhuma, e
agora tem — `migration-loop-a1`, `-a2` a cada recuperação, na mesma run.

---

## Como executar

```bash
npm run test:ia-loop       # 513 testes locais, sem chamadas reais a modelo
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

```bash
npm run ia-loop:recover    # retoma uma execução interrompida por crash ou reboot
```

```bash
npm run ia-loop:reclassify -- --role tech_lead --job <jobId>   # dry-run; --apply escreve
```

V7 — execução autônoma de Goal em Goal:

```bash
npm run ia-loop:auto -- --from 004   # roda Goals em sequência até uma parada real
```

```bash
npm run ia-loop:auto -- --from 004 --resolved "o que foi resolvido"   # retoma depois de PAUSED_FOR_HUMAN
```

```bash
npm run ia-loop:pause                # pede parada na próxima fronteira segura
```

```bash
npm run ia-loop:pause -- --after-goal   # espera o Goal inteiro terminar
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
| `workers/developer.mjs` | Worker do Developer — um único processo, modelo/effort vindos do job |
| `lib/goal-discovery.mjs` | Descoberta determinística do Goal e coerência da migração |
| `lib/worktree-manager.mjs` | Plano de worktree; criação não implementada |
| `lib/job-store.mjs` | Protocolo local em arquivos, escrita atômica, log append-only |
| `lib/worker-registry.mjs` | Heartbeat e saúde RUNNING/STALE/OFFLINE |
| `lib/contracts-v2.mjs` | Contratos protocolVersion 2 |
| `lib/context-builders.mjs` | Pacotes explícitos de contexto por papel |
| `lib/loop-state.mjs` | Máquina de estados V2 com human gate |
| `lib/state-registry.mjs` | Fonte canônica dos estados; grafo e resumíveis derivados |
| `lib/leases.mjs` | Leases de job e worktree; claim atômico, nunca declara morte |
| `lib/autonomous-state.mjs` | Run autônoma durável, lease do orquestrador, pausa |
| `lib/planning-decision.mjs` | Três decisões de planning; fim de migração verificado |
| `lib/goal-boundary.mjs` | Julgamento puro da fronteira entre dois Goals |
| `lib/goal-execution.mjs` | Run state vs goal execution state; escopo por Goal e guarda `CROSS_GOAL_STATE_LEAK` |
| `lib/failure-reclassification.mjs` | Reparo auditável de falha mal classificada, derivado da evidência persistida |
| `run-reclassify.mjs` | CLI do reparo; dry por padrão, `--apply` escreve |
| `lib/process-inspector.mjs` | Identidade e liveness de processo; Windows-aware, fake nos testes |
| `lib/orphan-evidence.mjs` | De suspeita a prova: quando uma lease pode ser tomada |
| `lib/recovery-plan.mjs` | O passo seguro após um crash, por estado |
| `lib/recovery-handoff.mjs` | Token de uso único que passa uma run recuperada ao próximo orchestrator |
| `lib/stage-identity.mjs` | Identidade lógica do trabalho: estágio vs tentativa |
| `lib/worktree-fingerprint.mjs` | Identidade de conteúdo da árvore inteira, untracked incluído |
| `lib/reconcile.mjs` | Reconcilia disco antes de despachar; barra estágio já concluído |
| `run-recover.mjs` | Recovery de execução interrompida; não chama modelo nem retém lease |
| `run-auto.mjs` | Orchestrator autônomo Goal a Goal |
| `run-pause.mjs` | Pedido de pausa; não interrompe inferência em voo |
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
| `lib/telemetry.mjs` | Níveis, sanitização e emissão da telemetria observacional |
| `lib/stream-telemetry.mjs` | Parsing incremental do stream do CLI em eventos seguros |
| `lib/developer-profiles.mjs` | Registry de perfis do Developer, effort do CLI e prova anti-fallback |
| `lib/profile-routing.mjs` | Precedência do perfil por rodada: persistido > escalation > planejado > padrão |
| `lib/direct-execution.mjs` | Guard de execução direta: importar um entry point não o executa |
| `lib/harness-retry.mjs` | Autorização auditável de UMA retry depois de corrigir bug do harness |
| `run-authorize-retry.mjs` | CLI do repair de harness, dry-run por padrão |
| `lib/runtime-reconciliation.mjs` | Precedência dos fatos sobre o runtime derivado; também converge um estado "em voo" já resolvido |
| `run-reconcile-runtime.mjs` | CLI da reconciliação do runtime, dry-run por padrão |
| `lib/attempt-handoff.mjs` | Prova pura de lineage: a attempt corrente descende de uma esperada por uma cadeia autorizada? |
| `lib/result-waiter.mjs` | `waitForResult` — cerca por attempt, e segue uma sucessora autorizada sem nunca aceitar "a mais nova" por hábito |
| `lib/closure-eligibility.mjs` | Reprova, cercada por attempt, que um Goal está elegível para closure; o retorno vira a evidência de `hydrateTo` |
| `lib/orchestrator-fault.mjs` | Classifica um defeito da própria state machine (`INVALID_TRANSITION`...) como `HARNESS_ERROR`, nunca `UNKNOWN_FATAL` |
| `fixtures/synthetic-goal.md` | Tarefa sintética, fora do runtime |
| `tests/*.test.mjs` | 679 testes com processo/agente fake; nenhuma chamada real |

## V8 — Telemetria zero-token + roteamento adaptativo do Developer

Dois incrementos independentes que compartilham uma regra: **nenhum dos dois
adiciona uma chamada de modelo**.

### Telemetria zero-token

Os terminais mostram o que o agente está fazendo enquanto ele trabalha. Toda
linha é **derivada** de um evento que o CLI já produzia; nada é pedido ao
modelo.

```
[10:31:02] JOB 006/R1 IMPLEMENTATION
[10:31:02] PROFILE SONNET_MEDIUM
[10:31:02] MODEL Claude Sonnet 5 · effort Medium
[10:31:04] READ apps/bff/src/session/SessionService.ts
[10:31:08] SEARCH SessionService in apps/bff
[10:31:15] TEST pnpm test apps/bff
[10:31:42] EDIT apps/bff/src/ConversationService.ts
[10:32:10] WRITE apps/bff/test/integration.test.ts
[10:34:22] RESULT TEST pnpm test apps/bff — ok (3.4s)
```

**Fonte.** `--output-format stream-json`. O CLI emite um objeto JSON por linha
enquanto executa — init de sessão, cada `tool_use` que ele decidiu usar, cada
`tool_result`, e por fim um evento `result` que carrega **exatamente o mesmo
envelope** que `--output-format json` imprimiria no final. `parseEnvelope`
aceita os dois formatos, então o structured output que o orchestrator valida é
o mesmo. A telemetria é um **side channel observacional**: a máquina de estados
nunca lê texto de terminal, só o envelope e os arquivos em disco.

**O que nunca é emitido:** blocos de texto ou de `thinking` do assistente,
inputs de tool além de caminho/pattern/comando, e o conteúdo de qualquer
`tool_result`. Nenhum prompt foi alterado para produzir telemetria; nada é
reenviado ao modelo.

**Sanitização.** Todo detalhe passa por `sanitize()` antes de chegar a um
terminal ou a um arquivo: `Authorization`/`Bearer`, `password`, `token`,
`api_key`, `secret`, `cookie`, credenciais em URL, chaves reconhecíveis
(`sk-…`, `ghp_…`, `xox…`, JWT) e atribuições de env com valor longo viram
`«redacted»`. Depois disso o texto é colapsado e truncado em 160 caracteres —
nenhum payload cabe numa linha de telemetria.

**Níveis.** `IA_LOOP_LOG_LEVEL` = `minimal` | `normal` | `verbose`
(padrão `normal`).

| Nível | Mostra |
| --- | --- |
| `minimal` | job start/end, profile/model, decisão, capacity, erro |
| `normal` | acima + categoria de tool, caminhos, comandos resumidos, testes, transições de estado, e todo resultado que **falhou** |
| `verbose` | acima + todos os eventos seguros, durações, tool start/end e resultados bem-sucedidos |

**Invariante testada:** mudar o nível **não** muda o que o modelo recebe. Os
testes comparam o argv, o prompt e o schema entre os três níveis e exigem
igualdade byte a byte. `buildArgs` não tem sequer um parâmetro de nível — a
propriedade é estrutural, não coincidência.

**Persistência.** `tools/ia-loop/.state/telemetry/<role>-<data>.jsonl`, só com
o que já foi renderizado (categoria, detalhe curto, duração, erro). Desligue com
`IA_LOOP_TELEMETRY_PERSIST=0`. Uma falha de telemetria — writer, sink ou parser
— é engolida: ela nunca derruba uma execução.

**Desligar o streaming.** `IA_LOOP_STREAM_EVENTS=0` volta ao
`--output-format json`. Isso muda apenas o formato de saída; prompt, modelo,
effort, schema e sessão continuam idênticos.

### Perfis de execução do Developer

O Developer deixou de ser fixo em Opus. O **mesmo** worker
(`npm run ia-loop:developer`) executa qualquer perfil; não existe
`ia-loop:developer-sonnet` nem `ia-loop:developer-opus` — um segundo worker
seria um segundo lugar para a decisão de roteamento divergir.

| Perfil | Modelo | Effort | Quando |
| --- | --- | --- | --- |
| `SONNET_MEDIUM` | `claude-sonnet-5` | `medium` | implementação localizada, CRUD, UI, adapters, testes, refactor simples, arquitetura já definida, risco baixo/médio |
| `OPUS_MEDIUM` | `claude-opus-5` | `medium` | mudança multi-serviço, contrato importante, domínio complexo, migration, debugging difícil, concorrência, vários consumers |
| `OPUS_HIGH` | `claude-opus-5` | `high` | segurança, auth/sessão, isolamento de tenant, dado crítico, race condition, consistência distribuída, mudança arquitetural, alto custo de erro |

`--effort` é uma flag real do CLI instalado (2.1.263), que aceita
`low, medium, high, xhigh, max`. Um valor desconhecido produz apenas um
*warning* e roda no effort padrão — um downgrade silencioso —, então o registry
valida antes do spawn e falha fechado com `UNSUPPORTED_EFFORT`.

**Padrão: `SONNET_MEDIUM`.** A ideia é não pagar Opus por trabalho que Sonnet
resolve. O Tech Lead promove explicitamente quando o Goal justifica.

**Quem escolhe, e sem inferência extra.** A escolha viaja em chamadas que o
ciclo **já faz**:

- `PlanningDecision` (a chamada que escreve o próximo Goal) ganhou
  `developerProfile` e um `developerProfileReason` de uma frase;
- `ReviewDecision` ganhou `nextDeveloperProfile` e `nextDeveloperProfileReason`,
  válidos apenas com `CHANGES_REQUIRED`.

Não existe `MODEL_SELECTION_JOB`, e nenhuma chamada de modelo é feita para
escolher um modelo.

**Precedência**, resolvida em `lib/profile-routing.mjs` (função pura, testável
sem store, sem git e sem modelo):

1. o que a rodada **já** está executando — restart, recovery e espera por
   capacidade caem aqui; o perfil é relido, nunca recalculado;
2. o `nextDeveloperProfile` que o Tech Lead anexou ao review anterior;
3. o perfil vigente do Goal, quando a rodada avança e o Tech Lead não disse nada
   — **silêncio preserva**, o número da rodada não promove nada;
4. compatibilidade: um Goal que **já estava em execução** antes do roteamento
   existir mantém o modelo com que começou (`LEGACY_OPUS`, sem flag `--effort`);
5. o que o Tech Lead escolheu ao planejar o Goal (registro durável, ou a linha
   `Developer execution profile: <PERFIL>` no documento do Goal);
6. o padrão, `SONNET_MEDIUM`.

**Persistência.** O perfil é gravado no próprio job (`developerProfile`), no
estado de execução do Goal (`runtime.developerProfile`, campo por-Goal) e num
handoff durável em `.state/developer-profiles.json`, escrito pelo planejamento.
O worker lê do job — por isso restart, retry de capacidade e recovery rodam
exatamente o mesmo modelo.

**Sem fallback, nunca.** Nenhum caminho passa `--fallback-model`. O modelo que
efetivamente serviu a chamada é resolvido do `modelUsage` e confrontado com a
família do perfil; divergência é `MODEL_FALLBACK_DETECTED`, e um modelo
indisponível é `MODEL_UNAVAILABLE` — ambos terminam em `HUMAN_REQUIRED`, jamais
em outro modelo.

**Tech Lead continua fixo** em Claude Fable 5.1 com sessão persistente. Só o
Developer é dinâmico.

**Auditoria.** Eventos `DEVELOPER_PROFILE_SELECTED` e
`DEVELOPER_PROFILE_CHANGED`, com goal, round, stage, profile, model, effort,
`selectedBy`, origem e uma razão curta. Nenhum reasoning longo é registrado.

**Terminais.**

```
ATENDLY IA LOOP — DEVELOPER

Supported profiles:
  SONNET_MEDIUM · Claude Sonnet 5 · effort Medium
  OPUS_MEDIUM · Claude Opus 5 · effort Medium
  OPUS_HIGH · Claude Opus 5 · effort High
Log level: normal
Session strategy: STATELESS
State: IDLE
```

`npm run ia-loop:status` reporta o perfil roteado, o modelo, o effort e — quando
existe — o perfil que o Tech Lead escolheu para a próxima rodada.

## V9 — Argumentos do Claude CLI e recuperação de falha do harness

Escrito a partir de uma falha real. O review do Goal005 R1 morreu em:

```
Error: When using --print, --output-format=stream-json requires --verbose
exit 1 · stdout vazio · 0 eventos de stream · 0 inferência
```

O commit da V8 passou a usar `--output-format stream-json` sem adicionar
`--verbose`. Todos os 560 testes passaram, porque **todos usavam spawn fake**:
eles provavam o argv que nós *construímos*, nunca o argv que o CLI *aceita*.
A sondagem prévia também não pegou — um `--session-id` inválido curto-circuita a
validação do CLI antes de essa restrição ser alcançada.

A parada foi correta (ninguém gastou token, nada foi perdido), mas o
diagnóstico foi `UNKNOWN_FATAL`: um defeito determinístico e local aparecendo
como algo incognoscível.

### `--verbose` é requisito de forma de saída, não de inferência

`buildArgs` acrescenta `--verbose` sempre que `outputFormat === 'stream-json'`
sob `--print`, e nunca fora disso.

```
--print --model <m> --output-format stream-json --verbose --json-schema … --resume <id>
```

Isso muda **como este processo imprime** o que o CLI já ia produzir. Não muda
prompt, contexto, schema, modelo, effort nem sessão. A telemetria continua
zero-token, e o teste correspondente afirma isso de forma nomeada: entre
`minimal`, `normal` e `verbose` os argumentos de inferência (`--model`,
`--json-schema`, `--tools`, `--effort`, `--permission-mode`, `--session-id`,
`--resume`, `--system-prompt`, `--append-system-prompt`) são idênticos, e a
única diferença entre `json` e `stream-json` é o formato mais o `--verbose` que
o CLI exige junto.

### Validação de argumentos antes do spawn

`validateClaudeCliArgs()` é a função canônica e roda **antes** de qualquer
processo existir. Recusa, com `INVALID_CLAUDE_CLI_ARGS`:

- `--print` + `stream-json` sem `--verbose`;
- `--output-format` desconhecido;
- `--effort` fora de `low|medium|high|xhigh|max` (o CLI apenas *avisa* e roda no
  padrão — um downgrade silencioso);
- `--resume` sem sessão persistida.

`assertArgvCompatible()` revalida o array já construído e recusa flag duplicada.
`buildArgs` chama as duas: uma antes de montar, outra sobre o resultado. Não
dependemos de o CLI reclamar depois — uma combinação que já sabemos inválida
falha aqui, como bug nosso, com código estável, sem consumir attempt.

### Rejeição de argv é `HARNESS_ERROR`

O classificador reconhece as mensagens de validação **local** do CLI —
`requires --<flag>`, `unknown/invalid option`, `invalid value for --<flag>`,
`cannot be used with`, `mutually exclusive`, `unsupported output format`,
`--json-schema is not valid JSON`, `invalid session id` — e as classifica como
`HARNESS_ERROR`. Os códigos `INVALID_CLAUDE_CLI_ARGS` e `UNSUPPORTED_EFFORT`
entram no mapa estrutural.

Deliberadamente estreito: **nada casa por exit code**. Um `NON_ZERO_EXIT`
genérico continua `UNKNOWN_FATAL`, e limite de sessão, rate limit, auth, billing
e modelo indisponível continuam em suas próprias categorias — há teste para cada
um.

`HARNESS_ERROR` continua levando a `HUMAN_REQUIRED`, e isso está certo: esperar
não conserta um argv inválido. O ganho é o diagnóstico deixar de mentir.

### Repair auditável ≠ capacity retry

Duas causas diferentes de uma attempt merecer sucessora, com instrumentos
diferentes:

| | `ia-loop:reclassify` | `ia-loop:authorize-retry` |
| --- | --- | --- |
| Causa | o modelo disse "agora não" | defeito **nosso**, já corrigido |
| A attempt | não falhou — foi estacionada | **falhou**, e continua FAILED |
| Vira | `WAITING_FOR_CAPACITY` | permanece `FAILED` no histórico |
| Sucessora | pelo caminho normal de capacidade | uma, explicitamente autorizada |
| Exige | classificação virar um WAIT | classificação ser `HARNESS_ERROR` |

```bash
npm run ia-loop:authorize-retry -- --role tech_lead --job <id> --reason "<o que foi corrigido>" --fix-commit <sha> --apply
```

Dry-run por padrão. A nova classificação é **derivada** do diagnóstico
persistido pelo classificador atual, nunca afirmada pelo operador. Precondições,
todas fail-closed: attempt `FAILED`; falha lê como `HARNESS_ERROR`; run em
`HUMAN_REQUIRED`/`AWAITING_HUMAN`; operador deu um motivo; nenhuma sucessora já
existe; stage incompleto e sem result válido. Rodar duas vezes responde
`ALREADY_REPAIRED` e **não** cria uma quarta attempt.

Nada é apagado. O envelope de falha é arquivado sob o nome da attempt, ela entra
no `attemptHistory` **como FAILED** com `originalClassification`,
`correctedClassification` e `originalError`, e a autorização vira registro
próprio (`retryAuthorizations`) com `sourceAttemptId`, `successorAttemptId`,
`reason`, `fixCommit` e `authorizedAt`. Eventos: `FAILURE_RECLASSIFIED` e
`RETRY_AUTHORIZED_AFTER_HARNESS_FIX`.

### Importar um entry point não executa nada

Durante a introspecção desta própria tooling, um `import()` feito só para checar
dependências circulares **iniciou os dois workers** — heartbeat e polling de
jobs incluídos. Nada foi reivindicado, mas por sorte.

Todo executável agora se protege:

```js
if (isDirectExecution(import.meta.url)) { main().catch(...) }
```

`lib/direct-execution.mjs` compara `import.meta.url` com `process.argv[1]`,
ambos passados por `realpath`, então bin symlinkado, argv relativo e caixa de
caminho no Windows continuam comparando iguais; o que não resolve responde
`false`, porque não iniciar é a direção segura. Há regressão que importa todos os
entry points e afirma que nenhum imprime coisa alguma.

## V10 — Resultados cercados por attempt e reconciliação do runtime

Escrito a partir de uma falha real, e de uma que doeu mais que as anteriores
porque **nada tinha falhado**.

A review a3 do Goal005 R1 rodou 4 min 34 s, resumiu a sessão Fable, leu código,
rodou `validate:core` e lint, subiu e derrubou um PostgreSQL efêmero, e concluiu
`CHANGES_REQUIRED` com 2 blockers e escalation `OPUS_MEDIUM`. Isso ficou correto
em disco o tempo todo.

Mesmo assim o Goal parou como `HUMAN_REQUIRED / UNKNOWN_FATAL` — **4 min 29 s
antes de a a3 terminar**.

### O que aconteceu

O repair que autorizou a a3 **copiou** o envelope de falha da a2 para um arquivo
histórico, mas deixou o original no caminho primário. E `waitForResult` retornava
"o primeiro envelope não-nulo", sem saber de qual attempt ele era. O worker
reivindicou a a3 às 15:14:00; o orquestrador começou às 15:14:06, foi direto
para a espera, encontrou a falha da a2 e a consumiu como se fosse a resposta da
a3.

| horário | fato |
| --- | --- |
| 15:04:57 | repair enfileira a3; **primário ainda com a falha da a2** |
| 15:14:00 | worker reivindica a a3 |
| 15:14:06 | orquestrador inicia |
| 15:14:15 | `SUPERVISED_STOP` HUMAN_REQUIRED / UNKNOWN_FATAL |
| **15:18:45** | **a a3 publica `CHANGES_REQUIRED`** |

Dois defeitos compostos: leitura sem cerca, e ciclo de vida errado do arquivo
primário.

### Cerca por attempt

Um resultado pertence a **uma** attempt, e diz isso de si mesmo:

```json
{ "attemptId": "005-r1-tech_lead-ca1d7bf4-a3",
  "result": { "attemptId": "005-r1-tech_lead-ca1d7bf4-a3", "decision": "CHANGES_REQUIRED" } }
```

**Publicação.** `publishResult` **exige** `attemptId` (`RESULT_ATTEMPT_REQUIRED`
sem ele). A attempt autorizada é lida do **job em disco**, não confiada em quem
escreve: um escritor atrasado é justamente a parte que não pode saber que foi
superada. Uma a2 tardia tentando publicar depois de a a3 existir é recusada com
`STALE_ATTEMPT_RESULT` — e o que ela escreveu é preservado em
`<jobId>.stale-<attemptId>.json`, nunca descartado. A mesma attempt publicando
duas vezes é idempotente.

**Leitura.** `readResult` responde a duas perguntas diferentes, e confundi-las
era o bug:

| chamada | pergunta | quem usa |
| --- | --- | --- |
| `readResult(role, jobId)` | "qual o último resultado válido deste job lógico?" | reconciliação, fechamento, reuso |
| `readResult(role, jobId, { expectedAttemptId })` | "**esta** attempt já respondeu?" | toda execução ativa |

Na forma cercada, um envelope de outra attempt devolve `null` e o leitor
**continua esperando** — nunca consome. Um envelope sem `attemptId` é anterior à
cerca e também conta como stale: não dá para provar a quem pertence, e consumir
sem prova foi exatamente o erro. Cada stale distinto reporta uma vez, via
`onStale`, e vira evento `STALE_RESULT_IGNORED` — observação, não erro fatal.

`hasCompletedResult` aceita o mesmo `expectedAttemptId` opcional.

### Ciclo de vida do arquivo primário

`results/<role>/<jobId>.json` é o resultado da attempt **corrente**, e nada mais.

Quando uma sucessora é materializada — recovery de `INTERRUPTED`, retry de
capacidade, ou repair de harness —, `archiveResultForAttempt` preserva o
envelope em `<jobId>.attempt-<attemptId>.json` e **remove o primário**, nessa
ordem: preserva primeiro, apaga depois, então uma queda entre as duas não perde
nada. Copiar e deixar o antigo disponível foi o que custou uma review inteira.

Os três caminhos usam a mesma infraestrutura: `startNextAttempt`,
`reclassifyFailure` e `authorizeRetryAfterHarnessFix`.

### Precedência: os fatos vencem o cache

`runtime.json` é estado **derivado** — o que o orquestrador concluiu enquanto
andava. Os jobs e seus resultados são os fatos.

1. resultado `COMPLETED` válido da attempt corrente/mais recente;
2. `attemptHistory` do JobStore;
3. o stage ledger persistido;
4. o runtime derivado.

**Um human gate no runtime nunca vence um resultado concluído.**

```bash
npm run ia-loop:reconcile-runtime -- --goal 005          # dry-run
npm run ia-loop:reconcile-runtime -- --goal 005 --apply
```

Corrige **apenas o cache**: não cria attempt, não chama modelo, não repara
falha. Recusa (`NOTHING_TO_RECONCILE`) quando o runtime já concorda com o disco
**e** quando os fatos realmente pedem uma pessoa. Os blockers vêm exatamente do
`ReviewDecision` persistido — nunca re-derivados, nunca reinventados —, o
`nextDeveloperProfile` vem da mesma review, e `roundsRun` é reconstruído das
reviews em disco. Evento auditável:
`RUNTIME_RECONCILED_FROM_COMPLETED_RESULT`, com decisão e razão anteriores ao
lado da autoritativa. Nada é apagado.

### A corrida worker-antes-do-orquestrador

Deixou de importar quem começa primeiro. O orquestrador lê o `attemptId`
corrente do job depois do dispatch e passa esse valor para `waitForResult`; um
envelope de qualquer outra attempt é ignorado, venha ele de antes ou de depois.
O teste cobre as duas ordens de início explicitamente.

### O que o status mostra agora

Lido dos **resultados**, não do runtime:

```
Review:
  Job: 005-r1-tech_lead-ca1d7bf4
  Attempt: 005-r1-tech_lead-ca1d7bf4-a3
  Status: COMPLETED
  Decision: CHANGES_REQUIRED
  Blockers: 2
  Next developer profile: OPUS_MEDIUM

Next:
  005 R2 CORRECTION
  Developer profile: OPUS_MEDIUM
  Blockers: 2
```

E quando o runtime ainda carrega um human gate que os resultados já
desmentiram, a tela diz isso e aponta o comando — em vez de repetir o cache.

## V11 — Successor-attempt handoff

A cerca por attempt (V10) resolveu "o waiter consome a resposta errada". Ficou
uma segunda forma de a mesma classe de bug aparecer: o waiter fica correto e
**preso**, para sempre, numa attempt que nunca mais vai responder.

### O caso real: Goal 005 R2

```
Review a1   WAITING_FOR_CAPACITY / USAGE_LIMIT
(a capacidade volta; o capacity runner materializa a a2)
Review a2   COMPLETED, decision ACCEPTED
```

O orquestrador tinha despachado a review, lido o `attemptId` da a1 e ia dormir
em `waitForResult`. Quando a capacidade voltou e a a2 foi materializada, o
`expectedAttemptId` local **nunca foi atualizado** — ele foi capturado uma vez,
antes do loop. O terminal mostrava, a cada poll:

```
… ignoring a result left by 005-r2-tech_lead-8eec8bd3-a2; waiting for 005-r2-tech_lead-8eec8bd3-a1.
```

Isso prova que a cerca funcionava exatamente como projetada — e ainda assim
estava errado: a1 não ia responder de novo. `status` já calculava corretamente
`Next: 005 R2 CLOSE_GOAL` a partir do disco (a leitura do ledger não é
cercada), mas o **processo vivo**, preso no loop, nunca chegava lá.

### Stale result vs. sucessora válida

São perguntas diferentes, e confundi-las nos dois sentidos é o erro:

| | pergunta | quem responde |
| --- | --- | --- |
| stale result | "isto que apareceu no caminho primário é resposta da attempt que eu espero?" | `readResult({ expectedAttemptId })`, V10 |
| sucessora autorizada | "a attempt que eu espero **acabou**, e o job **avançou** para uma sucessora legítima?" | `findAuthorizedSuccessor`, V11 |

Um resultado de outra attempt no caminho primário é sempre stale — nunca
consumido diretamente. Mas a pergunta certa, antes de continuar esperando pela
attempt original para sempre, é se o **job** já se moveu, e por quê.

`findAuthorizedSuccessor(attemptState, expectedAttemptId)` (`lib/attempt-handoff.mjs`)
responde só a partir do que o job já prova sobre si mesmo — `attemptHistory` e
`currentAttemptId`, do próprio `readAttemptState`:

1. a attempt corrente já é a esperada → nada a fazer, `null`.
2. a esperada não aparece no histórico → `UNKNOWN_ATTEMPT`, sem handoff.
3. entre a esperada e a corrente, cada elo (um por número de attempt) precisa
   estar presente e ter terminado por um motivo que o próprio store autoriza:
   `WAITING_FOR_CAPACITY` ou `INTERRUPTED` (os mesmos `RETRYABLE_JOB_STATUSES`
   que guardam `startNextAttempt`), ou `FAILED` com `retryAuthorizedBy`
   carimbado por `authorizeRetryAfterHarnessFix`. Faltando um elo →
   `BROKEN_LINEAGE`. Um elo que terminou por qualquer outro motivo — um
   `FAILED` sem autorização, um `SUPERSEDED` — → `NOT_AUTHORIZED`.
4. dois elos reivindicando o mesmo número de attempt → `CONFLICTING_LINEAGE`,
   recusado sem escolher um dos dois. Isso nunca acontece pelas APIs do store
   (`startNextAttempt` serializa cada incremento atrás do próprio lock file),
   mas a checagem continua: "pegar a mais nova" é exatamente o atalho que este
   módulo existe para recusar.

Uma cadeia de vários saltos — capacidade, depois uma falha de harness
reparada, depois conclusão — é seguida **de uma vez**: `findAuthorizedSuccessor`
caminha do número da attempt esperada até o corrente, exigindo que **todos**
os elos intermediários sejam autorizados. Um `ATTEMPT_WAIT_HANDOFF` cobre o
salto inteiro, não um por elo.

### `waitForResult` segue a sucessora

`lib/result-waiter.mjs` (antes uma função local em `run-goal.mjs`) mantém
`currentAttemptId` como variável, não como constante do closure. A cada volta
do loop, se ainda não veio resultado:

```
lida o resultado com { expectedAttemptId: currentAttemptId }
  → achou? retorna.
  → não achou: pergunta findAuthorizedSuccessor(job atual, currentAttemptId)
      → autorizada? currentAttemptId = sucessora; evento ATTEMPT_WAIT_HANDOFF; continue (sem dormir)
      → não autorizada: segue esperando currentAttemptId, como antes
```

O `continue` sem `sleep` importa: se a sucessora já tiver publicado (o caso
real do Goal 005 R2), a próxima volta do loop encontra o resultado
imediatamente, sem esperar mais um ciclo de poll.

```json
{ "type": "ATTEMPT_WAIT_HANDOFF", "goal": "005", "round": 2, "role": "tech_lead",
  "jobId": "005-r2-tech_lead-8eec8bd3",
  "fromAttemptId": "...-a1", "toAttemptId": "...-a2",
  "reason": "USAGE_LIMIT", "hops": 1 }
```

`STALE_RESULT_IGNORED` (V10) continua existindo e continua sendo emitido para
qualquer resultado de uma attempt que **não** seja uma sucessora autorizada —
o handoff nunca enfraquece essa parte da cerca.

### O que isso NUNCA faz

- Não aceita "a attempt mais nova" sem uma cadeia provada.
- Não cria uma nova attempt. Só segue uma que os dois portões existentes já
  materializaram (`startNextAttempt`, `authorizeRetryAfterHarnessFix`).
- Não reconcilia em direção a um human gate — ver a seção seguinte.
- Não troca `expectedAttemptId` por nada que o próprio job não prove.

### Restart: o caso que já funcionava

Um restart nunca herda um `expectedAttemptId` desatualizado: `run-goal.mjs` lê
`readAttemptState(role, jobId).attemptId` **de novo**, do disco, logo antes de
cada dispatch. O bug só existe para um processo **vivo**, dormindo no loop,
quando a sucessora é materializada enquanto ele dorme — exatamente a corrida
worker-antes-do-orquestrador (V10) e orquestrador-antes-do-worker, agora
também para o caso em que o worker é, na verdade, o próprio capacity runner
retomando depois da espera.

### Runtime "em voo" também converge

`assessRuntimeDivergence` (V10) sabia detectar só um tipo de mentira: um
human gate no runtime que os fatos já desmentiam. Ficou faltando o caso do
Goal 005 R2: o runtime dizia `REVIEWER_RUNNING`, `decision: CHANGES_REQUIRED`
(sobra da rodada 1), enquanto o ledger já mostrava a review da rodada 2
`COMPLETED` / `ACCEPTED`. Não é um human gate — é um marcador "em voo" que os
fatos já ultrapassaram.

`runtimeInFlightStale` cobre exatamente isso: o runtime afirma que um estágio
do seu próprio round está rodando (`DEVELOPER_QUEUED/RUNNING`,
`CORRECTION_QUEUED/RUNNING`, `REVIEWER_QUEUED/RUNNING`), e o ledger mostra
esse **mesmo** estágio `COMPLETED`. Isso só pode ser verdade quando um
resultado decisivo já chegou — um estágio genuinamente ativo aparece como
`IN_FLIGHT` ou `NOT_STARTED` no ledger, nunca `COMPLETED` — então nunca marca
trabalho real em andamento como obsoleto.

Deliberadamente restrito: só reconcilia **progresso** (`CLOSE_GOAL`, o
próximo estágio, a próxima rodada) — nunca em direção a `HUMAN_REQUIRED`. Para
esse caso, a mesma correção do `waitForResult` já é suficiente: um processo
vivo, deixando de ficar preso numa attempt superada, chega ao human gate
sozinho, pelo caminho normal.

```bash
npm run ia-loop:reconcile-runtime -- --goal 005          # dry-run
npm run ia-loop:reconcile-runtime -- --goal 005 --apply
```

O mesmo comando de V10 agora também repara este caso — nada de novo na CLI,
só um `diverged` mais completo por baixo.

## V12 — Resumir um Goal já ACCEPTED através de uma closure guardada

`npm run ia-loop:auto` reinvoca `run-goal.mjs` como processo filho a **cada**
iteração — inclusive para um Goal que já foi aceito e só está esperando
closure, porque descobrir isso é exatamente o papel dessa chamada. Um
processo novo sempre começa em `IDLE` e caminha `GOAL_READY` →
`PREPARING_WORKTREE` → `WORKTREE_READY` **antes** de olhar o ledger — o estado
local nunca é herdado de `runtime.json`.

### O caso real: Goal 005, depois do commit anterior

Depois da reconciliação de V11, `runtime.json` já dizia `decision: ACCEPTED`,
`round: 2`. `npm run ia-loop:auto` reconheceu corretamente:

```
Reconciled: next is CLOSE_GOAL at round 2.
Round 2 was ACCEPTED; the Goal is ready for closure.
```

E travou:

```
[INVALID_TRANSITION]
Transition WORKTREE_READY -> ACCEPTED is not allowed
```

`run-auto.mjs`, um processo separado que só vê o código de saída e o disco,
leu isso como `UNKNOWN_FATAL` — o mesmo rótulo de uma falha de modelo
inexplicável.

### Por que não simplesmente liberar `WORKTREE_READY -> ACCEPTED`

Isso permitiria, em qualquer contexto futuro, que `transitionTo` aceitasse
esse salto **sem prova nenhuma** — um Goal sem review válido chegando a
`ACCEPTED` porque alguém chamou a função na ordem errada. O grafo de
`state-registry.mjs` continua exatamente como estava; nenhuma aresta nova foi
adicionada a ele.

### `hydrateTo`: um segundo caminho, não um atalho no primeiro

`lib/loop-state.mjs` ganha `machine.hydrateTo(next, { reason, evidence })`,
ao lado — nunca no lugar — de `transitionTo`:

- ignora o grafo de `ALLOWED_TRANSITIONS`, mas **exige** `reason` e
  `evidence`; sem os dois, recusa com `HYDRATION_EVIDENCE_REQUIRED`;
- marca a entrada do histórico com `hydrated: true`, então uma auditoria
  sempre distingue um passo real de um salto reconciliado;
- **não verifica** a evidência — quem chama é responsável por ela ser real.
  `transitionTo` não muda em nada: toda outra chamada continua recusando
  exatamente como antes.

```js
machine.hydrateTo(LOOP_STATES.ACCEPTED, {
  reason: 'AUTHORITATIVE_REVIEW_ACCEPTED',
  evidence, // de assertGoalEligibleForClosure — nunca inventada aqui
});
```

O mesmo problema existia, de forma latente, para `HUMAN_REQUIRED`:
`WORKTREE_READY -> HUMAN_REQUIRED` também não está no grafo, e a
reconciliação early-exit podia chegar lá do mesmo jeito (rodada esgotada,
review pedindo humano, decisão sem contrato). Corrigido do mesmo modo.

### `assertGoalEligibleForClosure`: a prova que vira evidência

`lib/closure-eligibility.mjs` **não confia** em `reconciled.next.kind ===
CLOSE_GOAL` sozinho — relê os mesmos fatos direto do job store, cercado por
attempt, escopado ao job/round exatos que o ledger apontou:

1. o job de review existe e pertence ao Goal e à rodada certos;
2. a attempt corrente está `COMPLETED`;
3. o resultado confiado é o da attempt `COMPLETED` — nunca um envelope de
   outra attempt (`RESULT_NOT_FENCED` se divergir);
4. `decision === 'ACCEPTED'`;
5. zero blockers pendentes.

Qualquer falha recusa com `CLOSURE_INELIGIBLE` e uma `reason` específica —
nunca um "provavelmente está tudo bem". O retorno **é** a `evidence` que
`hydrateTo` exige; nada entre a prova e o salto é inventado.

### Harness fault ≠ UNKNOWN_FATAL

`lib/orchestrator-fault.mjs` classifica `INVALID_TRANSITION`,
`UNKNOWN_STATE` e `HYDRATION_EVIDENCE_REQUIRED` — códigos que só podem
significar um defeito no uso da própria state machine, nunca um fato sobre o
Goal — como `HARNESS_ERROR`, reaproveitando o vocabulário que
`harness-retry.mjs` já usa para o mesmo tipo de problema (um bug do harness,
não uma falha de modelo). O catch de nível superior de `run-goal.mjs` grava
essa classificação em `runtime.escalationReason` antes de propagar o erro —
`store` foi elevado a escopo de módulo justamente para isso, já que o catch
roda fora de `main()`. `run-auto.mjs` já sabia ler `escalationReason`; o que
faltava era esse valor nunca ser preenchido para este tipo de erro.

### Idempotência da closure

`run-close.mjs` já cria sua própria state machine iniciada direto em
`ACCEPTED` (`createLoopStateMachine({ initialState: LOOP_STATES.ACCEPTED })`)
— nunca sofreu este bug, porque nunca caminha o grafo a partir de
`WORKTREE_READY`. E já é idempotente por etapa (`closure.sourceClosureCommit`,
`closure.acceptedSnapshot`, etc. — cada passo verifica antes de agir). Este
fix não duplica nem substitui essa infraestrutura; ele só garante que
`run-goal.mjs` PARE de travar antes de `run-close.mjs` sequer começar.

### Reconciliação do Goal 005 real

`runtime.json` (ignorado pelo git) tinha `state: WORKTREE_READY` — sobra do
processo que travou — enquanto `decision: ACCEPTED` já estava correto desde
V11. Corrigido para `state: ACCEPTED`, evento
`RUNTIME_RECONCILED_FOR_CLOSURE` (`reason:
INVALID_REENTRY_STATE_AFTER_ACCEPTED_REVIEW`). O run autônomo
(`autonomous-run.json`) segue `PAUSED_FOR_HUMAN` — só um `--resolved`
explícito tira dali, de propósito — mas o rótulo do motivo foi corrigido de
`UNKNOWN_FATAL` para `HARNESS_ERROR`, com o valor anterior preservado em
`reclassifiedFrom` e um evento `AUTONOMOUS_RUN_HUMAN_REQUIRED_RECLASSIFIED`
auditável. Nenhum modelo foi chamado.

## V13 — Identidade do modelo por evidência explícita, não por accounting

Escrito a partir de uma falha real. O review do Goal006 R1 (Tech Lead, Fable
5.1, sessão persistente, turno 3 de um `--resume`) terminou assim:

```
AGENT_FAILURE code=RESOLVED_MODEL_UNKNOWN
"No modelUsage entry accounts for the top-level usage, so the primary
model cannot be determined"
→ UNKNOWN_FATAL → HUMAN_REQUIRED
```

O CLI tinha rodado por completo: sessão retomada com sucesso, dezenas de
ferramentas executadas, `StructuredOutput` emitido sem erro no stream. A
attempt morreu inteira por causa de uma etapa **posterior** à resposta do
modelo — a mesma classe de bug que a V9 já tinha documentado para argv, agora
no mecanismo de identidade do modelo. Isso já era o item 3 da lista de
limitações conhecidas ("a correspondência de usage é exata... exigirá revisão
do critério") — o item previu exatamente esta falha antes de ela acontecer.

### Por que accounting nunca foi prova de identidade

O critério antigo (`resolvePrimaryModel`, ainda existente, ver abaixo) exigia
igualdade byte a byte entre o `usage` de topo do envelope e **uma única**
entrada de `modelUsage`. Isso sempre foi um proxy, nunca uma fonte primária: o
próprio binário do CLI instalado documenta, no schema dos seus eventos, que
`modelUsage` e o `usage`/`total_cost_usd` que o acompanham "share a lifecycle"
que é "cumulative across turns in streaming … each result carries the running
total so far" e que "resumed sessions start fresh" — semântica de contador
acumulado, não de assinatura determinística por chamada. Uma sessão persistente
multi-turno (exatamente o desenho do Tech Lead) pode legitimamente cair fora
dessa igualdade sem que nada tenha saído errado.

### A fonte explícita: `message.model` do próprio stream

Inspecionando o schema de eventos do CLI instalado (2.1.263): cada evento
`assistant` de `--output-format stream-json` é, textualmente,
"Shaped like an Anthropic Messages API Message object (role \"assistant\"):
**id, model**, content blocks…". Esse `model` é a identidade que a própria API
atribui à resposta — não uma inferência nossa, não uma contagem de tokens.

`resolveServedPrimaryModel` (`lib/claude-process.mjs`) lê exatamente isso:

1. `stream-telemetry.mjs` acumula, por invocação, os valores distintos de
   `message.model` vistos em eventos `assistant` (`parser.servedModels()`).
2. Zero valores → `PRIMARY_MODEL_EVIDENCE_MISSING`.
3. Mais de um valor distinto → `PRIMARY_MODEL_EVIDENCE_CONFLICT` (nunca deveria
   acontecer numa única invocação; falha fechado em vez de escolher um).
4. Exatamente um valor → é o `resolvedPrimaryModel`, confrontado com a família
   esperada por `assertNoSilentFallback` como antes (inalterado):
   divergência de família continua `MODEL_FALLBACK_DETECTED`.

Como `--output-format stream-json` agora é **sempre** solicitado (ver abaixo),
essa evidência existe em toda invocação real, streaming sendo renderizado para
um humano ou não.

`resolvePrimaryModel` (o mecanismo antigo, por accounting) não foi removido:
vira puramente **advisório**, calculado sempre e nunca lançado adiante. Seu
resultado fica em `outcome.usageAccounting = { matched, resolvedByAccounting,
error }`, só para observabilidade — um evento `MODEL_USAGE_ACCOUNTING_OBSERVED`
pode ser derivado dali por quem quiser correlacionar divergências de contagem,
mas nada no caminho de decisão volta a lê-lo.

### Streaming deixou de ser opcional

Antes, `invokeAgent` só pedia `stream-json` quando um `onTelemetryEvent` era
passado — `IA_LOOP_STREAM_EVENTS=0` voltava a `--output-format json`. Como a
evidência de identidade só existe no stream, isso teria transformado a flag de
debug num apagador silencioso de verificação de modelo. Em vez disso,
`invokeAgent` sempre roda em `stream-json` internamente; `onTelemetryEvent`
continua controlando apenas se esses mesmos eventos são **também** renderizados
para um humano. `IA_LOOP_STREAM_EVENTS=0` agora desliga só a renderização,
nunca a verificação de identidade — prompt, contexto, schema, modelo, effort e
sessão continuam idênticos, como já valia para o nível de log (V8).

### Ordem do pós-processamento: conteúdo antes de identidade

O bug real do Goal006 R1 não foi "não sabemos qual modelo respondeu" — foi que
essa dúvida **descartou uma resposta que já tinha sido extraída e validada**,
porque as duas verificações aconteciam no mesmo `try`, na ordem errada.
`invokeAgent` agora roda em passos independentes:

```
parseEnvelope
  → extrai e valida o candidate payload (papel, ok, schema do chamador)
  → SEPARADAMENTE: resolve identidade explícita do modelo + advisory accounting
  → só as duas coisas juntas publicam outcome.payload como confiável
```

`outcome.candidatePayload` guarda o payload estruturalmente válido **mesmo
quando a verificação de identidade falha** — é isso que faz `outcome.payload`
continuar `null` (nunca publicado como resultado confiável) enquanto o
conteúdo real da resposta não se perde.

### Candidate result: a resposta nunca se perde, mesmo sem confiança ainda

Quando `runWithCapacity` escala para `HUMAN_REQUIRED` e `agentOutcome
.candidatePayload` existe, `capacity-runner.mjs` chama
`store.publishCandidateResult`, que grava
`results/<role>/<jobId>.candidate-<attemptId>.json` **ao lado** do resultado
FAILED de sempre — nunca no lugar dele. Só campos já seguros: o payload
validado, o modelo pedido, os modelos observados e o erro de verificação;
nunca chain-of-thought, texto livre do assistant, saída bruta de tool ou
segredos. Isso é o que permite corrigir um bug de harness como este e
recuperar a resposta original sem gastar uma segunda inferência — sem nunca
publicá-la como verdade antes de alguém decidir que ela merece confiança.

### Taxonomia

`RESOLVED_MODEL_UNKNOWN` e `RESOLVED_MODEL_AMBIGUOUS` (mecanismo antigo, ainda
usado por quem chamar `resolvePrimaryModel`/`assertNoSilentFallback`
diretamente, como `developer-profiles.mjs`) e os dois códigos novos,
`PRIMARY_MODEL_EVIDENCE_MISSING`/`PRIMARY_MODEL_EVIDENCE_CONFLICT`, classificam
todos como `HARNESS_ERROR` — antes, os dois primeiros caíam em `UNKNOWN_FATAL`.
Continuam terminando em `HUMAN_REQUIRED` (nenhuma espera resolve uma falha de
harness), mas agora nomeados pelo que realmente são: uma falha local de
verificação, não um limite de modelo desconhecido. `MODEL_FALLBACK_DETECTED`
não muda — evidência de que o modelo ERRADO respondeu continua fatal, e
continua uma família à parte de "não sabemos".

## V14 — Adaptive Model Routing

Antes desta etapa o modelo era uma constante por papel: Tech Lead sempre Fable
(review, fechamento e planejamento), Developer sempre o perfil que o
planejamento tinha nomeado. Isso gastava o modelo de cota mais apertada em todo
Goal, inclusive nos triviais, e não havia como perguntar depois *por que* um
modelo foi escolhido — não havia escolha, havia constante.

Agora quem decide é `lib/model-routing.mjs`, uma política única para os dois
papéis e as três etapas.

```
                    GOAL
                     │
              Complexity Router
                     │
         ┌───────────┴───────────┐
         │                       │
    LOW/MEDIUM               HIGH/CRITICAL
         │                       │
     Opus Plan                Fable Plan
         │                       │
         └───────────┬───────────┘
                     │
                  PLAN
                     │
                Sonnet Dev
                     │
             difficulty?
               │         │
              no        yes
               │         │
               │      Opus Dev
               │         │
               └────┬────┘
                    │
                  DIFF
                    │
              Review Router
                    │
         ┌──────────┴───────────┐
         │                      │
    LOW/MEDIUM              HIGH/CRITICAL
         │                      │
    Opus Review             Fable Review
         │                      │
         └──────────┬───────────┘
                    │
                 RESULT
```

### A tabela

| Papel · etapa | LOW · MEDIUM | HIGH · CRITICAL |
| --- | --- | --- |
| Tech Lead · planning | Opus 5 `high` | Fable 5.1 `high` |
| Tech Lead · review | Opus 5 `high` | Fable 5.1 `high` |
| Developer | Sonnet 5 `high` (sempre o início) | escalation → Opus 5 `high`; deep → Opus 5 `xhigh` |

`max` não aparece: fica como decisão humana, nunca do router. A tabela inteira
vive em `ROUTING_CONFIG`, e os ids de modelo só existem em `MODELS` — nenhum
arquivo repete `claude-...` por conta própria.

### Classificação de complexidade — determinística, zero-token

Nenhum modelo é chamado para decidir qual modelo chamar. A pontuação soma
sinais, e os limiares (`RISK_THRESHOLDS`) são: `0–1 LOW`, `2–3 MEDIUM`,
`4–6 HIGH`, `7+ CRITICAL`.

| Fonte | Exemplos | Peso |
| --- | --- | --- |
| Evidência — arquivos | migration em `prisma/migrations`, caminho de auth/session/tenant, worker/lease/queue | +3 |
| Evidência — arquivos | infra/CI, 3+ apps tocados no mesmo diff | +2 |
| Evidência — escopo | ≥15 arquivos (+1), ≥40 (+2), ≥500 inserções (+1), ≥1500 (+2) | +1/+2 |
| Evidência — histórico | rodada anterior rejeitada, escalation do Developer, recovery de harness | +2 |
| Texto (PT e EN) | arquitetura, segurança, concorrência, migração de schema, breaking change, consistência, recovery, infra, contrato de API, cross-cutting | +2/+3, **somados até no máximo 3** |

O teto do texto (`TEXT_SIGNAL_CAP`) não é estética: **medido** contra os
documentos reais deste repositório, a pontuação por palavra-chave sem teto
colocava o `MASTER_PLAN` em 30 e **todo** Goal em CRITICAL — um documento longo
sobre um projeto de migração fala de migração, arquitetura e segurança porque é
longo, não porque a próxima mudança é perigosa. Com o teto, texto argumenta até
MEDIUM; HIGH e CRITICAL exigem evidência que não se resolve escrevendo melhor.

O planejamento **não** é pontuado pelo diff do Goal que acabou de fechar: aquele
diff é prova sobre o trabalho terminado, não sobre o próximo. Sobra o que de
fato prediz dificuldade — a leitura limitada do roadmap e o que deu errado antes.

### Developer: Sonnet começa, Opus só com prova

A escolha do planejamento (`developerProfile`) continua registrada e visível,
mas não decide mais a primeira attempt (`PROFILE_SOURCES.ADAPTIVE_DEFAULT`). Um
Goal pode ser difícil de **planejar** e comum de **executar** depois que
arquitetura, escopo e contratos estão resolvidos — `Fable Planning → Sonnet
Developer` é combinação válida e esperada.

Sonnet não escala por um teste vermelho, um lint ou um erro de tipo: isso é o
trabalho. Escala quando há evidência, declarada no contrato (não em texto
livre): `status: ESCALATION_REQUIRED` com `escalation.reason` ∈
`REPEATED_EXECUTION_FAILURE`, `PLAN_MISMATCH`,
`ARCHITECTURAL_DECISION_REQUIRED`, `LOW_CONFIDENCE`, e ao menos uma entrada de
`evidence`. **Pedir não é receber**: quem autoriza é o router
(`authorizeDeveloperEscalation`), e uma recusa também vira evento
(`MODEL_ESCALATION_REFUSED`). Uma attempt em Opus que peça de novo ganha `xhigh`
uma vez; além disso é decisão humana.

### Review: escala para cima, cai para o lado

Uma review classificada LOW/MEDIUM vai para Opus. Se o reviewer concluir que
não consegue concluir — `decision: HUMAN_REQUIRED` com `escalationRequest`
(`REVIEW_INCONCLUSIVE`, `ARCHITECTURAL_RISK_DISCOVERED`,
`SECURITY_RISK_DISCOVERED`) e evidência — o router autoriza **uma** nova attempt
em Fable antes de acordar um humano. A review anterior não é apagada: fica como
candidate result, com o que ela mesma disse.

### Fallback: disponibilidade, nunca disfarce de bug

`USAGE_LIMIT`, `RATE_LIMIT` e `MODEL_UNAVAILABLE` autorizam Fable → Opus e
Sonnet → Opus como **nova attempt**, imediatamente, em vez de estacionar o
pipeline até o reset semanal do Fable.

`HARNESS_ERROR`, `AUTH_ERROR`, `INVALID_CLAUDE_CLI_ARGS`, `BILLING_ERROR`,
`UNKNOWN_FATAL` e qualquer falha de contrato **nunca** caem para outro modelo —
seguem a política existente e param para um humano. Fallback existe para
disponibilidade; usar outro modelo para contornar um defeito nosso esconderia o
defeito e ainda pagaria por ele.

Cada modelo cai uma vez: um segundo limite espera, não procura um terceiro
modelo.

### Nada muda de modelo em silêncio

Fallback e escalation criam uma **attempt nova** do mesmo job, pelo mesmo
mecanismo que qualquer retry usa. O que a antecessora foi continua sendo:

- status próprio, `REROUTED` — nem `INTERRUPTED` (nada aprendido) nem `FAILED`
  (trabalho tentado e malsucedido). Algo *foi* aprendido, e a sucessora existe
  por causa disso;
- a resposta que pediu ajuda é preservada como candidate result, recuperável;
- `attemptHistory` guarda `reason` e `routedTo`, então o modelo de uma attempt é
  **derivado do disco** (`resolveRoutingForAttempt`) e um restart resolve a mesma
  resposta em vez de decidir de novo;
- Goal, round, stage, job, worktree, baseline e review packet seguem os mesmos.

Nenhuma attempt antiga é reescrita para parecer que rodou em outro modelo.

### Auditoria e telemetria

Quatro eventos, gravados no momento da decisão — `MODEL_ROUTED` (uma vez por
chamada roteada, emitido pelo capacity runner para que nenhum worker possa
esquecer), `MODEL_FALLBACK`, `MODEL_ESCALATED` e `MODEL_ESCALATION_REFUSED`.
`lib/routing-summary.mjs` deriva deles o bloco impresso ao fim de cada Goal e em
`npm run ia-loop:status`:

```
MODEL ROUTING
  Developer R1: n/a → sonnet high
    started on sonnet, ended on opus after 2 attempts
  Review R1: MEDIUM (score 3) → opus high
  Calls: sonnet 1 · opus 2 · fable 0
  Fallbacks: 0
  Escalations: 1
    developer R1: sonnet → opus (REPEATED_EXECUTION_FAILURE)
```

### Override manual

`IA_LOOP_ROUTING_MODE` = `AUTO` (padrão) | `FORCE_SONNET` | `FORCE_OPUS` |
`FORCE_FABLE`. Lido em um lugar (`resolveRoutingMode`), aparece na auditoria
como `MANUAL_OVERRIDE_*`, e preserva a classificação que o router *teria* usado.
Com o modo fixado, nada cai nem escala pelas costas do operador — quem fixou um
modelo quis dizer isso, inclusive quando a cota acaba.

## V15 — Temporary Resource Lifecycle

Um incidente real: Developer, Tech Lead e o orchestrator ficaram rodando por
horas, e três instâncias de PostgreSQL efêmero (`atendly-review-005-r2`,
`atendly-goal006-pg`, `atendly-pgtest`) sobreviveram aos jobs que as criaram,
consumindo CPU e emitindo erros de shared memory no Windows continuamente.

A causa não estava em código: `docs/migration/VALIDATION_GATE.md` documentava
um procedimento **manual** — `initdb`/`pg_ctl` cru, nome de diretório escolhido
pela sessão, um passo de "descarte do cluster" só no fim da receita. Qualquer
attempt (Developer ou Tech Lead) que precisasse rodar `validate:integration`
seguia essa receita via Bash livre. Se a attempt terminasse antes do último
passo — `USAGE_LIMIT`, crash, Ctrl+C, timeout — nada em disco sabia que aquele
processo existia, e nada o encerrava.

A partir de V15, todo recurso temporário (hoje: PostgreSQL efêmero) passa por
um registro central antes de existir:

```
Attempt
  ↓
TemporaryResourceRegistry (reserve → CREATING)
  ↓
spawn real (initdb + pg_ctl start)
  ↓
ACTIVE (pid, porta, PGDATA, ownerProcessId gravados)
  ↓
┌─────────────┬─────────────┬──────────────┐
│ COMPLETED   │ CAPACITY    │ CRASH        │
│ FAILED      │ USAGE_LIMIT │ Ctrl+C       │
│ etc.        │ RATE_LIMIT  │ reboot       │
└──────┬──────┴──────┬──────┴──────┬───────┘
       ↓             ↓             ↓
  cleanupResourcesForAttempt   scavengeOrphans (próximo startup)
       └─────────────┴─────────────┘
                     ↓
                  CLEANED
```

### Registro (`lib/resource-registry.mjs`)

Um arquivo por recurso em `.state/resources/<resourceId>.json`, reservado com
criação exclusiva (`open(path, 'wx')`, o mesmo primitivo de `leases.mjs`) e
escrito atomicamente (temp file + rename, como `job-store.mjs`). Estados:
`CREATING → ACTIVE → STOPPING → CLEANED`, mais `CLEANUP_FAILED`,
`ORPHAN_SUSPECTED` e `ORPHAN_CONFIRMED`. Um crash entre `reserve()` e o spawn
real deixa o registro em `CREATING` — auditável, nunca invisível.

### Prova de propriedade (`lib/postgres-ownership.mjs`)

Antes de tocar em um processo, TODAS as condições precisam se confirmar:

1. o pid existe;
2. seu horário de início bate com o gravado (Windows recicla pids —
   `process-inspector.mjs` já resolvia isso para leases; o mesmo princípio
   se aplica aqui);
3. sua linha de comando referencia o executável esperado;
4. sua linha de comando referencia o `PGDATA` esperado.

Qualquer divergência resulta em `UNKNOWN`, `PID_REUSED`, `EXECUTABLE_MISMATCH`
ou `DATA_DIR_MISMATCH` — nenhum desses autoriza matar ou apagar nada. Só
`CONFIRMED` autoriza `pg_ctl stop`; `CONFIRMED`, `PROCESS_GONE` e `PID_REUSED`
autorizam remover o diretório de dados (nos dois últimos, o processo já não
existe — não há o que matar, só um diretório para reclamar).

### Wrapper (`lib/temporary-postgres.mjs`)

`startTemporaryPostgres`/`stopTemporaryPostgres`/`withTemporaryPostgres`
centralizam `initdb` + seleção de porta + `pg_ctl start` + espera de prontidão
+ registro + `pg_ctl stop` + remoção do diretório. Idempotente (uma segunda
chamada para a mesma attempt reaproveita o cluster ACTIVE) e limitado por
concorrência (`IA_LOOP_MAX_TEMP_POSTGRES_PER_ATTEMPT=1`,
`_PER_JOB=1`, `_GLOBAL=2`, configuráveis). O diretório de dados fica sob
`tools/ia-loop/.tmp/postgres/`; toda remoção passa por
`lib/resource-paths.mjs#assertSafeTempPath`, que resolve symlinks/junctions e
recusa qualquer caminho fora dessa raiz — inclusive a raiz em si.

Escalonamento de parada: `pg_ctl stop -m fast` → (falha) reprova a
propriedade → `pg_ctl stop -m immediate` → (falha) mata o PID específico
(`taskkill /PID <pid> /F` no Windows — nunca `/IM postgres.exe`). Cada
degrau só é tentado se a propriedade continuar `CONFIRMED` no momento dele.

### Integração com o lifecycle (`lib/resource-lifecycle.mjs`)

`cleanupResourcesForAttempt(attemptId)` está no `finally` de
`worker-loop.mjs`, ao redor de `handleJob(...)` — o mesmo `finally` que já
libera leases. Como Developer e Tech Lead compartilham esse loop, isso cobre
os dois papéis e todo desfecho (`COMPLETED`, `FAILED`,
`WAITING_FOR_CAPACITY`, um erro não tratado) com um único ponto de chamada,
sem precisar de um `case` por estado.

`scavengeOrphans()` roda uma vez no startup de `runWorkerLoop`, antes de
reivindicar qualquer job: para cada recurso `ACTIVE` cujo processo QUE O
CRIOU (`ownerProcessId` + `ownerProcessStartTime`, não o PostgreSQL em si)
está provadamente morto, prova a propriedade do PostgreSQL separadamente —
duas provas independentes, porque o worker ter morrido não diz nada sobre se
o servidor que ele iniciou ainda está rodando sob o mesmo pid. Só quando as
duas provam que dá para agir o recurso vira `ORPHAN_CONFIRMED` e é limpo;
caso contrário fica `ORPHAN_SUSPECTED`, visível mas intocado.

`SIGINT`/`SIGTERM` em `worker-loop.mjs` agora limpam os recursos da attempt
em voo antes de sair — idempotente, e nunca uma varredura global.

### Inspeção e limpeza manual

```bash
npm run ia-loop:resources                          # lista recursos vivos, PID, porta, PGDATA, idade
npm run ia-loop:resources:cleanup -- --dry-run      # plano, sem mutação (padrão)
npm run ia-loop:resources:cleanup -- --apply        # age só sobre CONFIRMED; UNKNOWN nunca é tocado
```

`--apply` nunca mata ou apaga um recurso cuja propriedade não seja `CONFIRMED`
(ou, para um processo já morto, `PROCESS_GONE`/`PID_REUSED` — só o diretório é
reclamado). Essa é a mesma regra do scavenger e do wrapper: proteção do
PostgreSQL principal por construção, porque ele nunca tem um registro que o
descreva, e um recurso sem registro nunca é candidato a nada aqui.

### Descoberta de recursos legados (`discoverLegacyCandidates`)

Só leitura, nunca limpa nada: enumera processos `postgres.exe` (Windows) cuja
linha de comando referencia um padrão de diretório conhecido do incidente
(`atendly-review*`, `atendly-goal*-pg`, `atendly-pgtest`) e devolve evidência
para inspeção humana. Um diretório de dados sem processo anexado (o cluster já
foi encerrado, só sobrou disco) não aparece aqui — não há processo para
descobrir — e a limpeza desse disco é decisão manual do operador, não deste
harness.

### Limites conhecidos desta etapa

- `discoverLegacyCandidates` só está implementado para Windows (a plataforma
  onde o incidente ocorreu); em outra plataforma ele retorna vazio com
  `skipped`.
- Não há teste com um binário real de PostgreSQL nesta suíte — só um driver
  falso injetável (`createPostgresDriver()` é substituível por completo). Um
  smoke test real e opcional é intencional e não roda automaticamente; ver
  o relatório da entrega original para as pré-condições exigidas antes de
  rodá-lo manualmente.
- `docs/migration/VALIDATION_GATE.md` mantém a receita manual original para
  quem provisiona `validate:integration` fora do IA Loop (CI, humano local);
  ela não foi reescrita para usar este wrapper, e nada nele impede alguém de
  continuar seguindo `initdb`/`pg_ctl` cru manualmente. O que esta etapa
  fecha é o caminho pelo qual um Developer/Tech Lead cria um cluster efêmero
  livremente durante uma attempt — `npm run ia-loop:resources` mostra o que
  ficou vivo, mesmo que criado à mão.

## V16 — Resumir uma correção já concluída direto para Review

### O caso real: Goal 007, R2

R1 foi `CHANGES_REQUIRED` com 5 blockers. R2 rodou a correção em `SONNET_HIGH`
e completou com `REVIEW_REQUIRED` — o resultado do Developer já estava
persistido, a review de R2 nunca tinha sido despachada. Uma execução autônoma
nova reconciliou corretamente: `reconcileExecutionState` leu o ledger, viu a
correção da R2 `COMPLETED` e a review da R2 inexistente, e devolveu
`next.kind = REVIEW, round: 2` — a autoridade estava certa desde o início.

O laço de `run-goal.mjs`, porém, decidia se a rodada era "correção" olhando só
para o número da rodada: `isCorrection = startAsCorrection || round > 1`, que
é `true` para qualquer rodada além da primeira, sem nunca consultar
`reconciled.next.kind`. Isso levou o código a montar um job hipotético de
`CORRECTION` a partir de `pendingBlockers` — vazio, porque uma reconciliação do
tipo REVIEW não carrega blockers, não há nada a corrigir — e
`validateDeveloperJob` recusou corretamente essa forma: *"A CORRECTION job must
carry at least one blocker"*. A validação disparava **antes** do código chegar
ao ponto que reutilizaria o resultado do Developer já concluído, numa rodada
que não precisava de nenhum job novo.

O segundo efeito: essa exceção `CONTRACT_FIELD_INVALID`, não capturada, subia
até o catch de topo. `recordOrchestratorFault` ainda não classificava esse
código, então `runtime.escalationReason` continuou com o valor de um gate
**diferente**, já resolvido por humano (`POLICY_VIOLATION`, de um
`MAIN_CHECKOUT_MUTATED` anterior). `run-auto.mjs`, um processo separado que só
lê código de saída e disco, reportou a falha nova com a razão antiga.

### A correção: `next.kind` decide, nunca o número da rodada sozinho

`isCorrection` continua existindo — ele ainda nomeia corretamente o estágio
(`correction` vs. `implementation`) para fins de stage key e ledger. O que
mudou é onde a construção do job acontece: `validateDeveloperJob(...)` deixou
de rodar incondicionalmente e passou a viver atrás de um closure
(`buildDevJob()`), chamado **só** dentro do branch que efetivamente despacha um
job novo — nunca quando `alreadyDone` (o resultado já está no disco) é
verdadeiro. Uma rodada cujo Developer já terminou nunca constrói, nunca valida
e nunca publica um job de Developer, seja qual for `round`.

```
alreadyDone = store.hasCompletedResult('developer', devJobId)
buildDevJob = () => validateDeveloperJob(...)   // não é mais chamado aqui em cima

if (alreadyDone) devEnvelope = store.readResult(...)   // reusa; modelo NÃO é chamado
else            devJob = buildDevJob(); store.dispatchJob('developer', devJob, ...)
```

### Razão de human gate nunca herdada de uma falha anterior

Um gate resolvido por humano (`npm run ia-loop:auto -- --resolved "..."`) some
do caminho de decisão, mas até este fix continuava sentado em
`runtime.escalationReason`/`humanRequired`/`decision` até algo escrevê-lo por
cima. Uma falha nova e sem relação nenhuma herdava a razão antiga.

Logo após os dois early-return de `reconcileExecutionState` (HUMAN_REQUIRED e
CLOSE_GOAL) e antes de `let round = reconciled.next.round`, `run-goal.mjs`
agora lê o runtime e, se qualquer um desses três campos ainda estiver setado,
conclui que a reconciliação acabou de provar que a execução **não** está
bloqueada — logo, o que sobrou descreve um gate já fechado por humano, não esta
tentativa. Ele zera os três campos e registra `STALE_HUMAN_REASON_CLEARED` com
a razão/decisão anteriores, para que a resolução continue rastreável no
histórico de eventos em vez de simplesmente desaparecer.

Uma falha nova sempre ganha sua própria classificação: `CONTRACT_FIELD_INVALID`
entrou em `ORCHESTRATOR_FAULT_CODES` (`lib/orchestrator-fault.mjs`) — mas só
pelo call site que importa. `validateDeveloperJob`/`validateReviewJob` são
chamados direto em `run-goal.mjs` sobre um job que **este processo** está
montando para enviar; se falharem, a exceção sobe sem ser capturada até este
catch, e o defeito é deste harness, nunca do modelo ou do Goal.
`validateDeveloperResult`/`validateReviewDecision` lançam o mesmíssimo código
para um contrato que um **modelo** quebrou, mas só são chamados como
`validatePayload` de `invokeAgent`, que captura tudo internamente — nunca
chegam a este catch. O código sozinho não distingue os dois casos; o call site
distingue.

### Ciclo de vida dos blockers

Os 5 blockers da review de R1 continuam na review de R1 para sempre —
`buildStageLedger` não descarta resultado nenhum. Eles foram a entrada que
produziu a correção de R2; uma vez que R2 terminou, eles não precisam — e não
devem — ser reencontrados ou reenviados para despachar a review de R2, que não
carrega `blockers` nenhum porque não é uma correção.

### O que isso preserva

- Worktree, `worktreeInitialHead` e o diff de R2 intocados — a rodada nunca
  entra no branch que cria worktree ou roda o Developer de novo.
- O perfil efetivo de R2 (`SONNET_HIGH`) não é recalculado: ele é lido do job
  já persistido, nunca do roteamento adaptativo de uma escalada anterior que já
  foi aceita pelo humano.
- Zero commits, zero mudança de baseline, zero resultado apagado ou
  sobrescrito, zero attempt novo do Developer.

### Testes

`tests/goal007-resume-into-review.test.mjs` reproduz o incidente exato:
reconciliação chega em `REVIEW`/round 2 sem construir `CORRECTION`; a forma
antiga do código realmente lança `CONTRACT_FIELD_INVALID` e classifica como
`HARNESS_ERROR`; os blockers de R1 sobrevivem no ledger sem serem exigidos para
despachar a review; o perfil `SONNET_HIGH` é lido do job, não recalculado; o
bloco de limpeza de razão obsoleta zera `escalationReason`/`humanRequired`/
`decision` e registra `STALE_HUMAN_REASON_CLEARED`; reconciliar duas vezes
seguidas é idempotente (nenhum attempt novo, resultado bit-a-bit igual).
`tests/orchestrator-fault.test.mjs` cobre a classificação de
`CONTRACT_FIELD_INVALID` e que `recordOrchestratorFault` sobrescreve uma razão
obsoleta com a nova.

## V17 — Transição idempotente para a próxima correction

### O caso real: Goal 007, R2 → R3

A Review R2 devolveu `CHANGES_REQUIRED` com 1 blocker e uma escalada explícita
do Tech Lead para `SONNET_MEDIUM` na rodada 3. O mesmo processo (sem restart)
reagiu corretamente: `REVIEWER_RUNNING -> CHANGES_REQUIRED -> CORRECTION_QUEUED`
— o único par de arestas que o registry define para `CHANGES_REQUIRED` — e
persistiu round, blockers e perfil da R3 antes de voltar ao topo do laço
(`continue`) para começar a rodada 3. O topo do laço então pediu de novo,
incondicionalmente, `CORRECTION_QUEUED` — o estado exato em que a máquina já
estava — e o registry corretamente não tem aresta `CORRECTION_QUEUED ->
CORRECTION_QUEUED`: self-transition nunca foi um passo real. A mensagem foi
literal: *"Transition CORRECTION_QUEUED -> CORRECTION_QUEUED is not allowed"*.

### As duas escritas

```
run-goal.mjs:865  CHANGES_REQUIRED -> CORRECTION_QUEUED
                  a única aresta que o registry define para CHANGES_REQUIRED;
                  é aqui que round/blockers/perfil da próxima rodada são
                  persistidos — o verdadeiro passo de "preparar a rodada".

run-goal.mjs:594  WORKTREE_READY -> CORRECTION_QUEUED (ou DEVELOPER_QUEUED)
                  a entrada do laço por rodada, necessária quando um PROCESSO
                  FRIO retoma direto numa correction já enfileirada e nunca
                  tocou a máquina antes.
```

A segunda só é redundante quando o MESMO processo, com o MESMO objeto
`machine`, já executou a primeira nesta mesma passagem — o que é demonstrável
enumerando todos os `transitionTo` do arquivo: só existe UM outro call site
que escreve `CORRECTION_QUEUED`/`DEVELOPER_QUEUED` (a linha 865, a única
aresta de `CHANGES_REQUIRED`). Não há um terceiro fluxo escondido preparando a
mesma etapa duas vezes.

### O fix: um guard local, não uma aresta nova no registry

`lib/state-registry.mjs` não mudou — `CORRECTION_QUEUED -> CORRECTION_QUEUED`
continua inexistente no grafo, e uma chamada direta e desguarnecida a
`transitionTo` no mesmo estado continua lançando `INVALID_TRANSITION` (ver
teste "a genuine, unguarded self-transition still throws"). Liberar
self-transition genericamente esconderia um segundo dispatch de verdade caso
um dia exista; o que existe aqui é só o segundo pedido do MESMO passo já
concluído.

O guard vive só na linha 594, e só é seguro porque `machine` é um objeto por
processo: a única forma de `machine.state` já ser `phaseQueued` naquele ponto
é a linha 865 ter acabado de colocá-lo lá, no mesmo processo, na mesma
iteração.

```js
if (machine.state !== phaseQueued) machine.transitionTo(phaseQueued);
```

Nada além da transição em si é pulado: o `dispatchJob`/`buildDevJob` da
correção ainda não tinha rodado quando o crash acontecia (o crash era só a
transição de estado), então o guard não esconde nenhum dispatch duplicado —
prova disso são os testes de restart em QUEUED/RUNNING/COMPLETED, que
continuam idempotentes exatamente como antes.

### Ciclo de vida: preparar ≠ despachar

```
Review CHANGES_REQUIRED
  ↓ persiste round+1, blockers da PRÓPRIA review, developerProfile escalado
  ↓ machine: CHANGES_REQUIRED -> CORRECTION_QUEUED   (uma vez, aqui)
Runner entra na rodada seguinte
  ↓ vê que já está CORRECTION_QUEUED — não repete a transição
  ↓ publica/reutiliza o Developer job (identidade única: `{goal}:r{round}:correction`)
  ↓ machine: CORRECTION_QUEUED -> CORRECTION_RUNNING
```

Um processo frio que resume direto numa correction nunca passou pela primeira
seta nesta execução — para ele, a segunda é a única e é obrigatória. Os dois
casos compartilham a mesma linha porque o estado da máquina, não o histórico
do processo, é o que decide se a transição já aconteceu.

### Blockers e perfil: vêm da review que os produziu, nunca recalculados

Os blockers da R3 são exatamente os da Review R2 (`007-r2-tech_lead-be8887fc`)
— `decideNextDispatch` já carregava isso desde V10/V11 (`review.result?.blockers`).
Os da R1 nunca são reaproveitados; nenhum é inventado. O perfil `SONNET_MEDIUM`
escolhido pelo Tech Lead é lido do mesmo resultado
(`review.result?.nextDeveloperProfile`) e, uma vez persistido para a rodada 3,
`resolveProfileForRound` (regra 1, `lib/profile-routing.mjs`) o relê em
qualquer restart sem recalcular — a mesma garantia que já protegia escaladas
de rodadas anteriores contra downgrade por reinício.

### Taxonomia preservada

`INVALID_TRANSITION` já classificava como `HARNESS_ERROR` desde V16
(`ORCHESTRATOR_FAULT_CODES`); esta correção não mexeu na taxonomia, só na causa
raiz. Depois do fix, uma reconciliação real removeu o `escalationReason:
HARNESS_ERROR` que esse INVALID_TRANSITION específico deixou, registrando
`RUNTIME_RECONCILED_AFTER_HARNESS_FIX` (reason
`DUPLICATE_CORRECTION_QUEUED_TRANSITION`) sem apagar o evento
`ORCHESTRATOR_FAULT` original — os dois convivem no histórico.

### Testes

`tests/goal007-r3-correction-queued.test.mjs`: a seção A reproduz a máquina de
estados isolada (a aresta única de `CHANGES_REQUIRED`, a ausência de self-edge
em `CORRECTION_QUEUED`/`DEVELOPER_QUEUED`, a sequência antiga quebrando com a
mensagem exata, a sequência corrigida entrando em `CORRECTION_QUEUED` uma
única vez, o caso legítimo de processo frio, e a prova de que o guard não
mascara um alvo genuinamente inválido). A seção B reconcilia o Goal007 real via
`decideNextDispatch`: R3 recebe só o blocker da R2 e o `SONNET_MEDIUM` da
escalada; `resolveProfileForRound` preserva o perfil persistido num restart;
restart com R3 inexistente/QUEUED/RUNNING/COMPLETED dispara exatamente uma
vez, reutiliza, aguarda ou consome, respectivamente; Developer R2 e Review R2
não são rechamados; a reconciliação do human gate preserva o evento original.

## V18 — Work Unit Execution: DAG, roteamento por natureza e Context Slicing

Até aqui, um Goal era **uma tarefa monolítica para um único Developer Model**.
Tudo que o Goal tocava — um DTO de boilerplate, um service com regra de
negócio real e `npm run typecheck` — era pago no mesmo preço, no mesmo modelo,
com o mesmo contexto do Goal inteiro relido para cada um.

V18 decompõe a rodada do Developer em **Work Units** ligadas por um DAG, e
roteia cada unidade para o executor mais barato que consegue fazê-la
corretamente.

```text
GOAL
  ↓
TECH LEAD PLANNING ....................... Opus (LOW/MEDIUM) · Fable (HIGH/CRITICAL)
  ↓
EXECUTION PLAN (contrato PlanningDecision.executionPlan)
  ↓
WORK UNIT DAG ............................ validado antes de qualquer dispatch
  ↓
WORK UNIT ROUTER ......................... lib/model-routing.mjs
  ↓
┌──────────────────────────────────────────────────────────┐
│ DETERMINISTIC → ia-loop executa o comando (nenhum modelo) │
│ MECHANICAL    → Haiku 4.5      high                       │
│ STANDARD      → Sonnet 5       high                       │
│ COMPLEX       → Opus 5         high                       │
└──────────────────────────────────────────────────────────┘
  ↓
VERIFICATION (unidades DETERMINISTIC do próprio plano)
  ↓
AGGREGATE DeveloperResult ................ um único resultado da rodada
  ↓
TECH LEAD REVIEW ......................... Opus / Fable — no Goal, não por unidade
```

O que **não** mudou, de propósito: uma worktree por Goal, um lease por rodada,
um review por rodada, a state machine, o reconciler, o recovery, o fechamento.
A rodada continua publicando **um** `DeveloperResult` sob o mesmo `jobId` — é
por isso que a feature flag pode ser ligada e desligada a qualquer momento.

### O que é uma Work Unit

`lib/work-units.mjs`. Autocontida o bastante para ser executada, pequena o
bastante para receber contexto restrito, grande o bastante para entregar algo
coerente. Deliberadamente **não** é microtarefa: "adicionar import" não é uma
unidade, e o normalizador funde cadeias assim antes de qualquer execução.

| Campo | Papel |
| --- | --- |
| `id` | `WU-`, `VERIFY-`, `FIX-` ou `DIAG-` + até três dígitos |
| `objective` | o que a unidade entrega |
| `type` | `DETERMINISTIC` · `MECHANICAL` · `STANDARD` · `COMPLEX` |
| `complexity` / `risk` | `LOW`/`MEDIUM`/`HIGH` — derivados do `type` quando ausentes |
| `dependencies` | arestas do DAG |
| `expectedFiles` / `relevantFiles` | dicas de contexto, não permissões |
| `acceptanceCriteria` | obrigatório para tudo que um modelo executa |
| `verification` | actions determinísticas associadas |
| `action` / `scope` / `pattern` | só para `DETERMINISTIC` |

Três propriedades que o arquivo inteiro existe para sustentar:

- **DECLARATIVO.** O plano declara *natureza*, nunca modelo. Um plano que traz
  `model`, `modelKey`, `profile`, `developerProfile`, `effort` ou `executor` é
  **recusado** (`PLAN_DECLARES_MODEL`), não obedecido em silêncio. Ignorar um
  campo em que o planner acreditou é pior do que dizer não.
- **VALIDADO.** IDs únicos, dependências resolvíveis, sem ciclo, critérios de
  aceite presentes, tipos conhecidos, action determinística permitida,
  fragmentação sã. Um plano que falha em qualquer um é `PLAN_INVALID` e **nada
  é despachado** — ciclo descoberto por um worker é um worker que nunca termina.
- **ORDENADO.** Kahn deriva a ordem topológica e os níveis. Empate é resolvido
  por ordem de declaração, então um restart agenda a mesma coisa a seguir.

### Fragmentação e fusão

Bandas reportadas (`SMALL` 1–3, `MEDIUM` 3–8, `LARGE` 5–15) e um teto real de
20 unidades (`PLAN_FRAGMENTATION_EXCESSIVE`). "Este Goal tem mesmo dezoito
unidades" continua possível; "este Goal tem oitenta" não.

A fusão é conservadora de propósito: A e B só se fundem quando a única
dependência de B é A, nada mais depende de A, e ambas são `MECHANICAL` triviais
(objetivo do tipo "adicionar o export de X"). O resultado mantém o **id do
pai**, então toda aresta que apontava para ele continua válida, e registra o
que absorveu em `mergedFrom`. Cadeias fundem até quatro edições; além disso a
"unidade" viraria uma lista de compras com um único critério de aceite.

### DETERMINISTIC: comando, não inferência

`lib/deterministic-actions.mjs` e `lib/deterministic-executor.mjs`.

O registro de actions é **fechado**, e isso é a propriedade de segurança, não
uma conveniência. O plano nomeia uma *action*, nunca uma linha de comando: uma
string de shell escrita por modelo não é algo que este executor roda, por mais
plausível que pareça. `scope` e `pattern` são as únicas entradas vindas do
planner, ambas validadas contra padrões estreitos, e **nada passa por shell** —
tudo é `spawn` de argv, então não existe metacaractere para significar coisa
alguma.

Actions: `typecheck`, `lint`, `targeted-tests`, `unit-tests`, `tooling-tests`,
`gate-tests`, `git-diff-check`, `build`, `validate-core`, `validate-integration`.

O resultado vai para o store como qualquer outro: idempotência não é sobre
modelos, e um restart não deve reexecutar um build de quinze minutos cuja
resposta já está em disco.

### Router: uma tabela, um lugar

`lib/model-routing.mjs` — o mesmo arquivo que já era o único lugar onde um id
de modelo é escrito. Um router paralelo seria um segundo lugar para a política
divergir.

```text
DETERMINISTIC → executor: native      (nenhum modelo)
MECHANICAL    → haiku   effort high
STANDARD      → sonnet  effort high
COMPLEX       → opus    effort high
```

Um **piso de risco**: unidade `MECHANICAL` marcada com `risk: HIGH` ou
`complexity: HIGH` é promovida a `STANDARD` com razão `MECHANICAL_RISK_FLOOR` —
"Haiku decidindo arquitetura" é explicitamente algo que isto não pode produzir.
Não existe regra simétrica promovendo `STANDARD` a Opus por risco declarado:
Opus se alcança por evidência, não por adjetivo.

### Escalation entre tiers

Um degrau por vez: `MECHANICAL → STANDARD → COMPLEX`, e `COMPLEX` não escala
(isso é decisão humana, não de router). As razões admissíveis são **diferentes
por tier**, porque as duas perguntas são diferentes:

| Tier | Razões admissíveis |
| --- | --- |
| `MECHANICAL` | `NOT_AS_MECHANICAL_AS_CLASSIFIED`, `PATTERN_INSUFFICIENT`, `BEHAVIOUR_DECISION_REQUIRED`, `CROSS_MODULE_IMPACT_DISCOVERED`, `REPEATED_EXECUTION_FAILURE`, `LOW_CONFIDENCE` |
| `STANDARD` | `REPEATED_EXECUTION_FAILURE`, `UNEXPECTED_ARCHITECTURE`, `DEEP_DEBUGGING_REQUIRED`, `CONCURRENCY_ISSUE`, `STATE_INCONSISTENCY`, `PLAN_INCOMPATIBILITY`, `COMPLEXITY_DISCOVERED` |

`LOW_CONFIDENCE` é admissível no tier barato, onde errar é barato, e **não é**
razão para comprar Opus. `REPEATED_EXECUTION_FAILURE` exige pelo menos duas
tentativas falhas *que existam no histórico persistido* — uma falha não é uma
repetição, e chamar de repetição é como um teste vermelho vira uma chamada Opus.
Evidência concreta é obrigatória: confiança declarada não é evidência.

Toda mudança de modelo passa pela mesma maquinaria que já existia
(`runWithCapacity` + `createWorkUnitAttemptRouter`), então produz os mesmos
eventos auditáveis — `MODEL_ROUTED`, `MODEL_ESCALATED`, `MODEL_FALLBACK`,
`MODEL_ESCALATION_REFUSED` — e o predecessor mantém id, modelo e resposta.

Fallback de capacidade (disponibilidade, nunca disfarce de bug) ganhou um alvo
novo: `haiku → sonnet`. Um degrau, como todos os outros.

### Context Slicing

`lib/work-unit-context.mjs`. Um packet carrega, e **só** carrega:

```yaml
goalSummary:              # algumas linhas, não o documento
workUnit:                 # objetivo, tipo, critérios, hints
dependenciesCompleted:    # resumo + changedFiles de cada dependência
relevantFiles:            # dicas do plano + o que as dependências mudaram
constraints:              # o que não pode ser feito
previousRelevantFailures: # tentativas anteriores DESTA unidade
expandedContext:          # arquivos concedidos por expansão anterior
```

Deliberadamente **fora**: o corpo do documento do Goal, relatórios de outras
unidades, o histórico de tentativas da rodada, o review packet, o diff, o log
de eventos, o relatório da rodada anterior.

`goalPath` **está** dentro, e isso não é brecha: a unidade é dita onde o Goal
mora para que exploração legítima continue possível. A regra é "contexto
pequeno primeiro, expandir quando precisar", não "você não pode olhar". O que o
packet elimina é o *default* de mandar tudo para todo mundo.

### Context Expansion

Quando o recorte foi estreito demais, a unidade responde
`CONTEXT_EXPANSION_REQUIRED` com um `contextRequest` nomeando os arquivos que
faltam — estruturalmente, nunca em prosa. O harness concede, registra
`WORK_UNIT_CONTEXT_EXPANDED` (pedido, razão, arquivos adicionados, arquivos que
já estavam lá) e roda **uma nova tentativa no mesmo modelo**.

Isso ganhou um status de job próprio, `CONTEXT_EXPANDED`, e não reaproveita
`REROUTED`: colapsar os dois tornaria "o recorte foi estreito demais"
indistinguível de "o tier era baixo demais", e os dois têm correções opostas.

Limitado (2 por unidade, por padrão). Uma unidade que pediu duas vezes e ainda
não consegue não está sem contexto: está mal especificada ou sub-tierada, e
ambos se resolvem em outro lugar. No limite, a resposta vira o resultado da
unidade e a rodada fica `BLOCKED` — fingir o contrário esconderia exatamente a
medição que isto existe para produzir. Pedir arquivos que o packet já tinha não
é concedido.

### Verificação, atribuição de falha e unidades corretivas

Verificação determinística falhou → o harness extrai os caminhos de arquivo da
saída e **atribui** a falha à unidade cujos `changedFiles` (coletados do git,
não declarados pelo modelo) intersectam.

- atribuição inequívoca → `FIX-00N`, tipo **STANDARD**, escopada nos arquivos
  daquela unidade;
- ambígua ou sem interseção → `DIAG-00N`, **STANDARD**, dito explicitamente que
  a origem é desconhecida, com os candidatos — apontar com confiança para o
  lugar errado manda a correção para o lugar errado e depois reporta como
  corrigido;
- em ambos os casos a verificação é reexecutada em seguida (geração `-g2` do
  mesmo `id`, então a primeira falha continua legível ao lado do segundo passe).

Nunca Opus por padrão: "um teste ficou vermelho" é trabalho ordinário. O loop é
limitado (2 correções por verificação, 4 por rodada); esgotado o orçamento a
rodada segue para review **como `BLOCKED`**, com a falha registrada.

### Estado, idempotência e recovery

Uma Work Unit é um **job de verdade** no store, no namespace `work_unit`
(`lib/job-store.mjs`). Namespace, deliberadamente **não** um role: nada faz
polling nele. Quem executa é o worker Developer, dentro da attempt que já
segurou o lease e a worktree — um segundo reclamante seria um segundo escritor
na mesma árvore.

Com isso a unidade herda tudo que o store já dá a um job: resultado idempotente,
attempts numeradas com histórico preservado, fencing por attempt, e um status
que um restart consegue ler. O job id é **determinístico** —
`008-r1-unit-wu-001` — porque a identidade de uma unidade é (goal, round,
unitId): um restart procura exatamente o nome que o processo anterior escreveu
e acha o resultado, em vez de cunhar um novo.

O que isso preserva, verificado por teste:

- `WU-001` concluída não é reexecutada depois de um crash em `WU-002`;
- uma unidade determinística não reexecuta o comando;
- reconciliar três vezes não fabrica uma quarta attempt;
- uma unidade cuja dependência falhou fica `BLOCKED`, nunca é tentada;
- a decisão de que uma attempt foi interrompida continua sendo da camada de
  lease — de dentro do processo, uma attempt morta e uma viva em outro processo
  são indistinguíveis.

### Estados da Work Unit

`PENDING` · `READY` · `RUNNING` · `COMPLETED` · `FAILED` · `ESCALATED` ·
`BLOCKED` · `SKIPPED`.

### Review continua no Goal

Não há review do Tech Lead por unidade: isso destruiria a economia duas vezes.
O review packet ganhou o DAG **resumido** (unidades, executor, modelo, tier,
tentativas, escalations, expansões, arquivos por unidade, contagem de chamadas)
— evidência sobre a mudança, sem devolver o histórico inteiro da rodada para a
única chamada que a decomposição queria manter pequena.

### Feature flag

```bash
IA_LOOP_WORK_UNIT_EXECUTION=1   # execução por Work Units
IA_LOOP_WORK_UNIT_EXECUTION=0   # Developer legado (padrão)
```

Padrão **desligado**. Vira quando o caminho novo tiver executado um Goal real de
ponta a ponta — até lá, "a flag existe e os testes estão verdes" não é a mesma
afirmação que "é assim que Goals rodam agora", e ligar por padrão faria dela uma.

Orçamento do loop (nenhum deles nomeia modelo; essa política vive em
`model-routing.mjs`):

| Variável | Padrão |
| --- | --- |
| `IA_LOOP_WU_MAX_CONTEXT_EXPANSIONS` | 2 |
| `IA_LOOP_WU_MAX_FIX_UNITS` | 2 por verificação |
| `IA_LOOP_WU_MAX_FIX_UNITS_ROUND` | 4 |
| `IA_LOOP_WU_TIMEOUT_MS` | 90 min por unidade |
| `IA_LOOP_WU_ALLOW_FALLBACK` | ligado |

### Compatibilidade

Dois casos caem no plano de unidade única, e nenhum é defeito:

- **rodada de correção**: não existe DAG planejado, por construção — o que uma
  correção deve fazer é decidido pelo review que produziu os blockers, horas
  depois do plano. Vira uma unidade `STANDARD` escopada nos blockers, com um
  critério de aceite por blocker (`CORRECTION_ROUND_SINGLE_UNIT`);
- **Goal planejado antes de execution plans existirem**: uma unidade `STANDARD`
  cobrindo o Goal inteiro (`FALLBACK_SINGLE_STANDARD_UNIT`) — comportamentalmente
  o caminho antigo, expresso no vocabulário novo.

Nenhum dos dois sintetiza verificação determinística: inventar um gate que o
planner não pediu seria o harness decidindo qual é o critério do Goal.

O perfil que a rodada já tinha resolvido é **traduzido**, não descartado. Sob o
mecanismo anterior, o reviewer podia dizer "a próxima correção precisa de Opus"
nomeando um perfil, e a rodada rodava nele. Um plano de unidade única que
ignorasse isso rebaixaria em silêncio uma decisão tomada com a falha à vista.
`unitTypeForProfile` mapeia perfis da família Opus para `COMPLEX` e o resto para
`STANDARD`: o julgamento do Tech Lead é preservado pelo canal correto — a
natureza declarada — e a autoridade sobre ids de modelo continua não voltando
para ele.

O fallback é sempre registrado (`WORK_UNIT_PLAN_FALLBACK`): "este Goal rodou
como uma unidade só" é um fato que uma comparação futura entre execução
monolítica e decomposta precisa enxergar.

Um plano **gravado mas inválido** não é tratado como plano ausente: ciclo ou
dependência desconhecida é defeito em algo que o Tech Lead escreveu, e
substituí-lo em silêncio por uma unidade única esconderia um bug enquanto ainda
se cobra pela rodada.

### Telemetria

Derivada do log de eventos, nunca de um contador que alguém lembrou de
incrementar. `renderRoutingSummary` passou a reportar:

```text
Calls: haiku N · sonnet N · opus N · fable N
Work Units:
  declared: N MECHANICAL · N STANDARD · N DETERMINISTIC
  executed: N · states: N COMPLETED · N BLOCKED
  attempts: N · context expansions: N
  deterministic runs: N (N failed) — model calls avoided: N
```

Eventos novos: `WORK_UNIT_PLAN_RESOLVED`, `WORK_UNIT_PLAN_FALLBACK`,
`WORK_UNIT_STARTED`, `WORK_UNIT_COMPLETED`, `WORK_UNIT_BLOCKED`,
`WORK_UNIT_DETERMINISTIC_EXECUTED` (com `modelCalls: 0` explícito),
`WORK_UNIT_CONTEXT_EXPANDED`, `WORK_UNIT_VERIFICATION_FAILED`,
`WORK_UNIT_FIX_CREATED`, `EXECUTION_PLAN_RECORDED`, `EXECUTION_PLAN_ABSENT`.

### Testes

`tests/work-units.test.mjs` (27): schema, tipos, ids, critérios de aceite,
recusa de plano que nomeia modelo, action fora do registro, scope fora do
workspace, pattern com metacaractere, ciclos (curto, próprio e longo),
ordem topológica, níveis, estabilidade da ordem, bandas de fragmentação, teto,
fusão de triviais, preservação de arestas.

`tests/work-unit-routing.test.mjs` (23): a tabela inteira, ausência de `max`,
piso de risco, ausência de regra simétrica para Opus, escada de escalation,
razões admissíveis por tier, exigência de evidência, exigência de attempts reais
para `REPEATED_EXECUTION_FAILURE`, override manual, replay do tier a partir do
histórico.

`tests/work-unit-execution.test.mjs` (26): unidade determinística sem nenhuma
chamada de modelo, `MECHANICAL` só em Haiku, escalation Haiku→Sonnet com a
attempt 1 intacta e o payload preservado, escalation recusada, Sonnet→Opus,
context slicing (o que entra e o que comprovadamente não entra), expansão de
contexto concedida/redundante/no limite, ordem do DAG, níveis independentes,
dependência falha bloqueando, `FIX`/`DIAG` com atribuição, loop de correção
limitado, restart sem reexecução, resume como attempt 2 depois do veredito de
lease, idempotência tripla, `changedFiles` decididos pelo git, agregado válido
sob o contrato da rodada, telemetria.

`tests/work-unit-compatibility.test.mjs` (17): flag desligada por padrão,
grafias aceitas, contrato legado intacto, orçamento sem nomear modelo,
hand-off Goal→plano, recusa de plano cíclico na gravação, isolamento entre
Goals, os dois fallbacks de unidade única, `executionPlan` no contrato de
planning (presente, ausente, cíclico), ausência de campo de modelo no schema,
`spawn` sem shell, falha de spawn reportada, DAG no review packet e sua
ausência numa rodada legada.

## V19 — Closure documentation deixa de cair em Fable por padrão

Descoberto ao fechar o Goal007 de verdade: `ia-loop:close` publica o job de
`CLOSURE_DOCUMENTATION` sem `routing` — sempre publicou, porque fechamento é
bookkeeping sobre uma decisão já tomada, nunca classificada por risco, então
nunca existiu decisão de roteamento para anexar. O worker do Tech Lead lia essa
ausência como `stage: REVIEW`, o caminho de compatibilidade construído para uma
review real escrita antes do roteamento adaptativo existir, e todo fechamento
rodava no Fable com razão `LEGACY_UNROUTED_JOB` — contradizendo o próprio
comentário do código, que dizia que fechamento "runs on the standard model
unless the job says otherwise".

O fechamento ganhou stage e política próprios em `model-routing.mjs`, o único
lugar onde essa decisão pode viver:

```text
ROUTING_STAGES.CLOSURE
ROUTING_CONFIG.tech_lead.closure.standard = { model: 'opus', effort: 'high' }
routeClosureDocumentation({ mode })  → sempre Opus padrão; Fable só por
                                         override explícito de `mode`, nunca
                                         como default desta função
```

`routingOf`, no worker, passou a perguntar a essa função para `CLOSURE` e
manteve o fallback antigo — inalterado — para `REVIEW`/`PLANNING`, que é o
caso legítimo: uma review real do Goal003–006 escrita antes do V14 de fato
rodou inteira no especialista, e uma review roteada (com `routing` no job)
continua retornando exatamente o que já carregava, sem redecidir.

Nenhum id de modelo novo foi escrito no worker: a única mudança ali é qual
stage se pergunta e para qual função.

### Testes

`tests/closure-documentation-routing.test.mjs` (9): `routeClosureDocumentation`
sozinha (padrão Opus, sem classificação de risco, override manual incluindo
Fable, sem fallback do próprio Opus); `routingOf` reproduzindo o bug exato —
o job de fechamento tal como `run-close.mjs` de fato publica, sem `routing` —
e provando que resolve para Opus, não Fable; routing explícito de um job de
fechamento honrado sem redecisão; a review legada real (sem `routing`,
stage REVIEW) continuando a cair no Fable, prova de que o caminho legítimo não
foi tocado; uma review já roteada retornando o que já carregava; fechamento
fora da política de escalation de review.

## V20 — Usage telemetry e ledger bruto de consumo

Até aqui o loop sabia *o que* aconteceu (eventos, jobs, attempts, decisões de
roteamento) mas não sabia *quanto custou*. O consumo real de cada chamada de
modelo — tokens, cache, thinking, turns, duração, custo reportado — chegava no
envelope do CLI, era usado como cross-check advisory de identidade e depois
descartado. Esta etapa passa a persistir tudo isso.

O objetivo desta etapa é fundação, não análise: **capturar, normalizar,
persistir, rastrear e validar**. Não há pricing engine, não há dashboard, não há
comparação econômica, e nada aqui julga uma execução como produtiva ou
desperdiçada.

### Princípio: overhead de token igual a zero

Nada nesta camada fala com um modelo. Todo número é:

- copiado de um campo que o CLI já devolve no envelope `result`;
- contado a partir de eventos que o stream `stream-json` já emitia;
- lido do estado que o próprio ia-loop já mantém em disco.

O prompt, o schema, o modelo, o effort e o argv são byte-idênticos com ou sem
ledger. Nunca se pergunta ao modelo quantos tokens ele gastou, qual fase estava
executando ou quanto do output foi thinking.

### Arquitetura

```text
invokeAgent (lib/claude-process.mjs)
        │  abre a linha ANTES do spawn
        ▼
UsageCollector (lib/usage-collector.mjs)
        │  identidade ambiente (lib/usage-context.mjs)
        ▼
Normalizer (lib/usage-normalizer.mjs)
        │  extrai usage bruto, normaliza, sanitiza
        ▼
SQLite ledger (lib/usage-ledger.mjs)
        .state/telemetry/usage.sqlite
```

`invokeAgent` é o único ponto do pacote capaz de iniciar uma inferência —
`runClaudeProcess` é chamado de um lugar só, e há teste que falha se surgir um
segundo. Instrumentar ali é o que torna a cobertura uma propriedade da
arquitetura, e não um hábito de quem escreve o próximo worker.

A identidade (Goal, round, job, attempt, papel, roteamento) não é passada por
parâmetro: o `capacity-runner` publica esses fatos em torno da chamada, via
`AsyncLocalStorage`, e o ponto de gravação lê o que estiver em vigor. Uma
chamada feita fora de qualquer contexto **ainda gera linha**, com `operation =
UNKNOWN` e ids nulos — uma inferência não atribuída que é *registrada* é um bug
visível; uma que é pulada é um bug invisível.

### O que o runtime realmente fornece

Auditado contra o schema de eventos embutido no próprio CLI instalado
(Claude Code 2.1.263), não contra suposição.

Envelope `result` (subtype `success`):

```text
duration_ms, duration_api_ms, ttft_ms?, is_error, api_error_status?,
num_turns, result, stop_reason, total_cost_usd, usage, modelUsage,
subagent_stats?, permission_denials[], queued_turn_count?,
structured_output?, terminal_reason?, uuid, session_id
```

Subtypes de erro: `error_during_execution`, `error_max_turns`,
`error_max_budget_usd`, `error_max_structured_output_retries` — sem campo
`result`, com `errors[]`.

`usage` (shape cru da Messages API):

```text
input_tokens, output_tokens,
output_tokens_details.thinking_tokens,
cache_read_input_tokens, cache_creation_input_tokens,
cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens},
server_tool_use.{web_search_requests, web_fetch_requests},
service_tier
```

`modelUsage[<model>]` (camelCase, por modelo):

```text
inputTokens, outputTokens, thinkingTokens?,
cacheReadInputTokens, cacheCreationInputTokens, webSearchRequests,
costUSD, contextWindow, maxOutputTokens,
canonicalModel?, provider?, costBasis?
```

Duas semânticas documentadas pelo próprio CLI e que decidem se o ledger conta
em dobro:

1. **`thinkingTokens` já está dentro de `outputTokens`.** Os dois são gravados
   como vieram, e `total_tokens` nunca soma thinking por cima.
2. **`usage` é MAIN AGENT LOOP ONLY** — exclui subagents, sidechains e chamadas
   auxiliares; `modelUsage` é o campo que o CLI indica para contabilidade de
   token/custo. Por isso a preferência de leitura é
   `modelUsage[modelo servido]` → `modelUsage` com entrada única → `usage`, e a
   coluna `usage_source` diz qual das três respondeu.

Modelos auxiliares (um Haiku interno dentro de uma review em Opus) ficam em
`auxiliary_usage_json`, nunca somados ao modelo roteado: esconder isso tornaria
a pergunta "quanto cada modelo consumiu" impossível de responder.

Contadores derivados localmente do stream, sem inferência: `stream_events`,
`assistant_messages`, `user_messages`, `tool_call_count`, `tool_result_events`,
`tool_error_events`, e o breakdown por ferramenta em `model_usage_tool_call`.

### Banco

```text
.state/telemetry/usage.sqlite     (schema_version 1, collector_version 1.0.0)

model_usage              uma linha por execução real de modelo
model_usage_tool_call    breakdown por ferramenta
model_usage_event        trilha de metadados do stream (nunca conteúdo)
model_usage_correction   correções append-only sobre linhas já fechadas
model_usage_integrity    inconsistências registradas, nunca fatais
meta                     schema_version, collector_version, last_opened_at
```

SQLite em WAL com `busy_timeout`, porque Developer e Tech Lead são processos
distintos e podem escrever ao mesmo tempo. Sem lock global: observabilidade não
serializa o harness.

`model_usage` guarda identidade (project/run/goal/round/stage/job/attempt/work
unit), papel e operação, modelo pedido e modelo servido, effort, roteamento
completo (complexity, risk score, razão, sinais, modo, fallback e escalation com
o modelo de origem), resultado (status, subtype, stop_reason, exit code,
taxonomia de falha), tokens completos, turns, tools, tempos, sessão, custo
reportado e o payload bruto sanitizado.

### Fase

A coluna `phase` existe e tem vocabulário definido
(`development.implementation`, `review.validation`, …), mas **nada a preenche
hoje**: nenhum worker consegue provar deterministicamente em qual subfase estava,
e inventar uma seria exatamente o tipo de dado fabricado que este ledger existe
para não conter. Tudo grava `UNKNOWN` até que algo no harness possa provar o
contrário.

### O que existe como coluna e ainda não é preenchido

Duas colunas ficam nulas hoje, e por motivo, não por esquecimento:

- **`outcome`** (`accepted`, `review_rejected`, `required_rework`,
  `goal_completed`). O desfecho semântico só é conhecido *depois* que a linha é
  finalizada — a decisão do Tech Lead, a aceitação do Goal, a rodada de correção
  seguinte. Preenchê-la mais tarde seria reescrever história, que este ledger não
  faz. Enquanto isso o desfecho é obtido por join: `.state/events.jsonl` já
  carrega `jobId`/`attemptId` em `REVIEW_DECISION_PUBLISHED`,
  `DEVELOPER_RESULT_PUBLISHED` e afins, que são exatamente as chaves gravadas
  aqui.
- **`queue_wait_ms`**. O tempo entre despachar um job e um worker reivindicá-lo
  existe no job store, mas não é atribuível de forma confiável a *uma* chamada de
  modelo: uma attempt sucessora nasce dentro do worker, sem passar pela fila. É
  preferível nulo a um número que pareça uma espera e não seja.

Nada além disso é deixado de fora por escolha: campos do envelope que ainda não
foram normalizados continuam disponíveis em `raw_result_json`, `raw_usage_json`
e `raw_model_usage_json`, que é precisamente o motivo de eles serem preservados.

### Idempotência

A chave é a identidade que a própria máquina de estados já possui:

```text
idempotency_key = <role>::<jobId>::<attemptId>
```

Isso funciona porque o invariante do loop desde a V9 é que **toda chamada real
ao modelo é a sua própria attempt**. Reprocessar o mesmo resultado — numa
reconciliação, numa recuperação — produz a mesma chave, bate na constraint
`UNIQUE` e retorna `ALREADY_RECORDED`: nenhuma linha nova, nenhum token contado
duas vezes. Uma chamada sem job (spike, slice supervisionada) recebe chave
estável a partir do seu próprio session id.

### Crash e recovery

A linha é aberta com status `STARTED` **antes** do spawn e fechada depois. Um
worker morto no meio da inferência deixa uma linha nomeando o Goal, a attempt e
o modelo que estava rodando, em vez de não deixar nada. A reconciliação
posterior finaliza essa mesma linha — uma execução lógica, um registro
finalizado — e uma segunda passagem não muda nada.

`npm run ia-loop:usage -- --started` lista exatamente as linhas abertas e nunca
fechadas.

### Imutabilidade

Finalizar só move `STARTED → terminal`. Qualquer tentativa de reescrever uma
linha já fechada vira um registro em `model_usage_correction`, ao lado da
original: história não é sobrescrita em silêncio. Usage, breakdown de
ferramentas e trilha de eventos são gravados numa única transação, então nunca
existe linha com tokens sem modelo ou job.

### Sanitização

O payload bruto preservado passa por três camadas: as chaves pesadas são
descartadas (`result` e `structured_output` são a resposta do modelo e já estão
em `.state/results/` — copiá-las aqui faria do ledger um segundo transcript),
valores sob chaves com cara de credencial são substituídos, e todo string
restante passa pela **mesma tabela de redação** da telemetria de terminal.
Contadores como `inputTokens` e `maxOutputTokens` são explicitamente poupados:
um segredo nunca é um número.

Nada de prompt, diff, stdout, conteúdo de arquivo ou saída de ferramenta é
gravado. A trilha de eventos guarda tipo, índice, nome da ferramenta e duração —
não o comando nem o caminho.

### Política de falha da telemetria

Um problema de ledger é reportado e engolido operacionalmente. A falha aparece
no stderr com o marcador `TELEMETRY_WRITE_FAILED` e é anexada em
`.state/telemetry/usage-failures.jsonl`, mas um Goal corretamente concluído
nunca falha porque o SQLite estava ocupado. `openUsageLedger` degrada para
`UNAVAILABLE` (inclusive se `node:sqlite` não existir no runtime) e continua
respondendo a todas as chamadas.

### Integridade

Valores impossíveis são **registrados, não recusados**: contagem negativa,
`finished_at` anterior a `started_at`, thinking maior que output, tokens sem
chamada de modelo, chave de execução duplicada. Recusar a linha perderia os
tokens que ela carregava; sinalizar preserva os números e torna a inconsistência
visível.

### Falha de harness com custo zero

`model_call_started` só é verdadeiro com evidência positiva: um turn `assistant`
no stream, ou tokens/custo no envelope. Um argv inválido, um executável ausente
ou uma validação local que falha antes do spawn gravam `model_call_started =
false` com tokens nulos — é o que separa "falha de tooling que não custou nada"
de "attempt que queimou tokens e falhou".

### Consulta

```bash
npm run ia-loop:usage
npm run ia-loop:usage -- --goal 008
npm run ia-loop:usage -- --goal 008 --json
npm run ia-loop:usage -- --started
npm run ia-loop:usage -- --integrity
```

Deliberadamente uma tabela e um dump JSON, não um dashboard: esta etapa constrói
o ledger; a análise que o lê é trabalho separado, depois.

### Cobertura

Toda chamada de modelo do loop passa por `invokeAgent`: Tech Lead planning,
review, closure documentation e next goal planning; Developer round-level e por
Work Unit; todo fallback, escalation, retry e correction round; e as chamadas
legadas/auxiliares (`LEGACY_UNROUTED_JOB`, slice supervisionada V1, spikes), que
gravam com `operation = UNKNOWN` em vez de sumirem. Work Units DETERMINISTIC não
geram linha porque não chamam modelo nenhum.

### Testes

Todos zero-token, com stream falso reproduzindo shapes reais do CLI.

`tests/usage-normalizer.test.mjs` (29): breakdown completo de tokens; thinking
dentro de output; cache com split ephemeral 5m/1h; usage sem thinking e sem
cost; modelo auxiliar separado do roteado; as três fontes de usage; usage parcial
preservada em USAGE_LIMIT, RATE_LIMIT, MODEL_UNAVAILABLE e AUTH_ERROR; falha de
harness com zero token; timeout ainda atribuível; fase nunca inventada;
sanitização de API key, Bearer, cookie, token de ambiente e credencial em
comando; contadores de token não confundidos com credencial; resposta do modelo
descartada do payload; payload gigante marcado em vez de truncado; flags de
integridade.

`tests/usage-ledger.test.mjs` (13): criação automática de banco, schema e
versão; tabelas, índices e constraints; migration idempotente; recusa de schema
mais novo; WAL e busy timeout; dois handles escrevendo no mesmo arquivo;
`ALREADY_RECORDED` sem linha duplicada; finalização atômica; linha fechada
virando correção em vez de overwrite; linha `STARTED` sobrevivendo a crash;
falha de escrita como status, nunca exceção.

`tests/usage-collector.test.mjs` (17): uma chamada, uma linha, com identidade,
roteamento e usage completos; breakdown por ferramenta sem vazar comando nem
caminho; planning/developer/escalation/review cada um com seu modelo e razão;
fallback de capacidade com modelo de origem; usage parcial em falha; zero-token
de harness; timeout; chave de idempotência; mesmo resultado processado duas
vezes (linhas antes = 1, depois = 1); crash → `STARTED` → reconciliação →
exatamente um registro finalizado; ledger quebrado que não derruba a inferência;
falha registrada em disco; ledger desligado dentro de `node --test`;
**asserção de cobertura** provando que `runClaudeProcess` é chamado de um único
arquivo e que nenhuma saída de `invokeAgent` escapa sem gravar; chamada não
atribuída registrada como UNKNOWN; identidade publicada pelo `capacity-runner`,
incluindo Work Unit.

`tests/usage-cli.test.mjs` (6) e as adições em `tests/telemetry.test.mjs` (3):
filtros, parâmetros ligados em vez de interpolados, somas, e os contadores
determinísticos do parser com trilha limitada e sem conteúdo.

## V21 — Um worker por papel, provado em vez de assumido

A arquitetura sempre assumiu **um** Tech Lead e **um** Developer. Nada garantia
isso.

### O caso real: 2026-09-09

Um restart do Tech Lead não encerrou o processo anterior. Dois processos ficaram
polando a mesma fila por cinco horas:

```text
PID 16424  iniciado 14:28  código anterior à telemetria   ← executou o trabalho
PID 22748  iniciado 19:22  código atual                   ← SKIP a cada 1s
```

Todas as guardas existentes se comportaram **corretamente**: o lease de job
deixou exatamente um executar, e o outro recusou o job uma vez por segundo com
`ATTEMPT_ALREADY_RUNNING` — que é a guarda anti-duplicação da V6 fazendo
precisamente o seu trabalho. O `SKIP` é deliberadamente não memorizado, para que
uma recuperação ainda seja notada; daí a repetição de 1 em 1 segundo.

O problema não era nenhuma dessas guardas. Era a pergunta que **ninguém fazia**:

```text
lease de job       → "este job está sendo executado?"
lease de worktree  → "alguém está escrevendo aqui?"
(nada)             → "existe outro worker deste papel vivo?"
```

Sem a terceira, o duplicado nunca parava. E o trabalho caiu no processo **mais
antigo**, que rodava código anterior ao collector — então a chamada de
`NEXT_GOAL_PLANNING` do Goal 008 não deixou linha no ledger. Nenhum dado foi
corrompido e nenhuma inferência foi duplicada; o que se perdeu foi rastro.

### Identidade

Um terceiro tipo de lease, `leases/workers/<role>.lock`, adquirido antes de
qualquer outra coisa que o worker faça. A aquisição é o mesmo `open(path, 'wx')`
dos outros leases — a criação exclusiva é o árbitro, então dois processos em
corrida não podem ambos vencer.

O lease registra o suficiente para identificar o dono depois:

```text
role                 workerInstanceId (pid + nonce)   pid
processStartedAt     hostname                        bootAt
repoRoot             bootCodeVersion                 startedAt
heartbeatAt          expiresAt (TTL explícito)       version
```

Um segundo processo do mesmo papel **falha no startup**, nomeando o dono, em vez
de coexistir em silêncio:

```text
[REFUSING TO START] WORKER_ALREADY_RUNNING — held by instance 28988-3ecb7c58,
  pid 28988, on Borges, started 2026-09-09T19:58:18.032Z,
  last heartbeat 2026-09-09T19:59:58.117Z, code f09eb98159550b6d
```

Sai com código 1. O banner de "waiting for task" passou a ser impresso **só
depois** que o papel é de fato adquirido: um processo prestes a recusar não pode
antes anunciar que está esperando trabalho.

### Liveness nunca por PID sozinho

Windows e POSIX reciclam ids de processo. Um dono só é declarado ausente com
evidência **positiva**, nesta ordem:

```text
heartbeat dentro do TTL          → HELD_BY_LIVE_WORKER   recusa
bootAt anterior ao boot atual    → STALE_AFTER_REBOOT    takeover seguro
pid não existe                   → HOLDER_GONE           takeover seguro
pid existe, mas começou em outro
  instante que o lease registra  → PID_RECYCLED          takeover seguro
vivo, mesmo processo, calado     → UNCERTAIN             recusa
liveness indeterminável          → UNCERTAIN             recusa
```

`UNCERTAIN` falha fechado de propósito. Um worker pausado pelo SO, ou com disco
travado, continua sendo um worker — e dois workers é o desfecho pior.

O takeover é compare-and-swap contra exatamente o lease julgado, então um dono
que volte entre o julgamento e a troca mantém o papel. Ele registra
`WORKER_IDENTITY_TAKEOVER` com o veredito que o autorizou.

### Shutdown, crash e reboot

Um shutdown normal libera o lease, e o restart seguinte simplesmente funciona.
Um crash (kill sem handler, terminal fechado, reboot) deixa o lease para trás —
e isso é correto: dentro do TTL o restart é **recusado**, porque uma batida
recente não é prova de morte. Passado o TTL, a ausência do pid é prova, e o novo
processo assume registrando de quem assumiu.

### Frescor do código

A segunda metade do incidente: o processo que executou o Goal rodava código de
antes da telemetria existir. Um worker que continua pegando jobs depois que suas
próprias fontes mudaram está executando uma versão sobre a qual ninguém consegue
raciocinar.

O worker registra no boot um `bootCodeVersion` — hash de caminho, tamanho e
mtime de `lib/**.mjs`, `workers/**.mjs` e dos entrypoints `run-*.mjs`. Testes são
excluídos de propósito: editar um teste não muda o que um worker executa.

Antes de **aceitar um novo job** — nunca no meio de um, o que desperdiçaria a
inferência — ele recompara. Se mudou:

```text
[CODE CHANGED] booted with f09eb981…, on disk 3ac71f02… — refusing new jobs, restart required
```

Ele **mantém o lease** e para de aceitar trabalho. Manter o lease é intencional:
liberá-lo abriria a vaga para um processo que então correria com ele. A
verificação roda só quando existe um job realmente reivindicável, para não pagar
uma varredura de diretório a cada segundo de polling.

### Testes

`tests/worker-identity.test.mjs` (16): dono vivo nunca deslocado; lease obsoleto
com pid ausente; lease anterior ao boot atual (com o pid até "vivo", irrelevante
após reboot); pid reciclado detectado pelo instante de início; vivo-porém-calado
falhando fechado; liveness indeterminável tratada como incerta; primeiro worker
adquire e segundo é recusado; oito aquisições concorrentes produzindo exatamente
um dono; papéis diferentes sem contenção; recuperação de worker morto com
takeover registrado; shutdown normal liberando o papel; lease carregando todos os
campos de identidade; versão de código estável, mudando com edição de fonte e
**não** com edição de teste; detecção de código trocado sob o processo; `touch`
contando como mudança porque um checkout move mtime.
## Limitações conhecidas

1. **Auth não é herdável por subprocesso a partir do app desktop.** O que
   funciona é o CLI instalado e autenticado no host, visível no `PATH` — não o
   bundle interno do app. O runner deve depender do CLI do host.
2. **Kill em timeout usa `child.kill('SIGKILL')`**, que no Windows não mata a
   árvore inteira de processos. Suficiente para as etapas atuais; revisar se o
   orquestrador rodar agentes de longa duração.
3. **A identidade do modelo depende do stream carregar `message.model`.** Se
   uma versão futura do CLI parar de incluir esse campo nos eventos
   `assistant`, a verificação cai em `PRIMARY_MODEL_EVIDENCE_MISSING` — falha
   fechado, nunca finge saber. `usage`/`modelUsage` continuam disponíveis só
   como observabilidade (V13); não voltam a decidir identidade.
4. **Sem verificação de versão do CLI em runtime.** A versão encontrada é
   registrada, não exigida.
5. **Uma única tentativa por agente.** Não há retry: qualquer falha de contrato
   encerra a execução.
6. **O ledger de uso guarda `phase` mas não a preenche.** Nenhum worker consegue
   provar deterministicamente a subfase de uma chamada, então tudo grava
   `UNKNOWN`. A coluna existe para quando algo no harness puder prová-la.
7. **`total_cost_usd` é uma estimativa do provider, não uma fatura.** É gravado
   exatamente como recebido, em `provider_reported_cost_usd`, e não representa
   cobrança da assinatura. Nenhum cálculo econômico é feito sobre ele nesta
   etapa.
8. **O ledger depende de `node:sqlite`.** Em runtime sem esse builtin a
   telemetria degrada para `UNAVAILABLE` e o loop segue normalmente, sem trilha
   de consumo.
