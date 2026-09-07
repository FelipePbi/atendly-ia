# IA Loop — tooling

Ferramental isolado do IA Loop. Não faz parte do runtime do Atendly e não é
importado por `apps/` nem por `packages/`.

Duas etapas concluídas:

| Etapa | Status |
| --- | --- |
| Spike 0 — Agent Invocation Bootstrap | `PASS` |
| Vertical Slice Supervisionada V1 | `PASS` |
| Spike 1 — Persistent Dual Session | `BLOCKED` (Fable OK, Opus 5 não sustenta multi-turno) |

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

## Como executar

```bash
npm run test:ia-loop       # 55 testes locais, sem chamadas reais a modelo
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
| `lib/claude-process.mjs` | Executável, spawn, timeout, parsing, resolução de modelo |
| `lib/contracts.mjs` | Contratos Developer/Reviewer e handoff |
| `lib/state-machine.mjs` | Máquina de estados mínima |
| `lib/agents.mjs` | Papéis fixos e construção de prompt |
| `lib/persistent-session.mjs` | Sessão por agente: cria no 1º turno, resume nos seguintes |
| `lib/session-registry.mjs` | Registro durável de sessões, com escrita atômica |
| `fixtures/synthetic-goal.md` | Tarefa sintética, fora do runtime |
| `tests/*.test.mjs` | 68 testes com processo fake; nenhuma chamada real |

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
