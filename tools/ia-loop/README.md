# IA Loop — Spike 0: Agent Invocation Bootstrap

Escopo desta pasta: **somente** provar que é possível invocar programaticamente
dois agentes independentes do Claude Code — Tech Lead (Fable 5.1) e Developer
(Opus 5) — usando a autenticação da assinatura existente, sem API paga separada.

Não há orquestrador, state machine, execução de Goals, review automático,
commit automático nem worktree aqui. Não deve haver.

## Resultado

```
SPIKE_PASS
```

Ambos os modelos foram chamados headless, com seleção explícita de modelo,
saída estruturada válida e modelo primário verificado. Sem fallback.

## Ambiente confirmado

| Item | Valor |
| --- | --- |
| Claude Code (host) | `2.1.263` |
| Autenticação | assinatura Claude Max |
| `ANTHROPIC_API_KEY` | não usada |
| Billing da Claude API | não habilitado |
| Resolução do executável | encontrado no `PATH` |

## Mecanismo headless confirmado

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
deliberadamente evitado (há teste garantindo que nenhuma das duas coisas
apareça no argv). Cada invocação roda em diretório temporário vazio, fora do
repositório, em processo e sessão próprios.

## Identificadores de modelo aceitos

| Papel | Identificador |
| --- | --- |
| Tech Lead | `claude-fable-5-1` |
| Developer | `claude-opus-5` |

Ambos confirmados headless com a assinatura atual.

Nota operacional: o CLI valida **autenticação antes do nome do modelo**. Sem
login, um modelo inexistente e um modelo válido produzem exatamente o mesmo
erro (`Not logged in · Please run /login`), então nada pode ser concluído sobre
disponibilidade de modelo a partir de uma execução não autenticada.

## Modelo primário vs. modelos auxiliares

Esta é a parte não óbvia do envelope, e a razão de existir
`resolvePrimaryModel()`.

`modelUsage` **não** contém apenas o modelo solicitado. O Claude Code pode usar
modelos auxiliares internamente (Haiku, por exemplo) para trabalho próprio de
bookkeeping. A presença de outro modelo nessa coleção, **sozinha, não significa
fallback** — e tratá-la como tal produziria falso positivo.

Ao mesmo tempo, não se pode simplesmente ignorar Haiku, nem manter allowlist
dizendo "Haiku pode aparecer": isso mascararia um fallback real para Haiku.

Critério adotado, sem allowlist e sem heurística de preço/ordem:

1. O `usage` de topo do envelope reflete a **inferência principal**.
2. Normalizam-se os quatro contadores, que mudam de convenção entre os dois
   lugares:

   | topo (snake_case) | por modelo (camelCase) |
   | --- | --- |
   | `input_tokens` | `inputTokens` |
   | `output_tokens` | `outputTokens` |
   | `cache_read_input_tokens` | `cacheReadInputTokens` |
   | `cache_creation_input_tokens` | `cacheCreationInputTokens` |

3. A **única** entrada de `modelUsage` que reproduz exatamente esses quatro
   contadores é o `resolvedPrimaryModel`.
4. Todo o resto vira `auxiliaryModels`, preservado para observabilidade.

Contadores ausentes são tratados como zero. Nunca se escolhe "o primeiro", "o
último" nem "o mais caro".

Forma do resultado:

```json
{
  "requestedModel": "claude-opus-5",
  "resolvedPrimaryModel": "claude-opus-5",
  "auxiliaryModels": ["claude-haiku-4-5-20251001"]
}
```

Observação factual: na configuração isolada deste Spike (`--tools ""`,
`--safe-mode`), as execuções reais não acionaram modelo auxiliar algum —
`auxiliary: none`. O mecanismo existe porque o auxiliar **aparece** em
invocações menos restritas, como as capturadas manualmente no host. Ou seja, o
número de entradas em `modelUsage` varia com a configuração da chamada, e o
Spike não pode depender de ele ser 1.

## Anti-fallback

O Spike só passa quando `resolvedPrimaryModel` pertence à família solicitada.
Falha fechado em todos os casos duvidosos:

| Situação | Código |
| --- | --- |
| Primary de outra família (ex.: pediu Opus, veio Haiku) | `MODEL_FALLBACK_DETECTED` |
| Sem `modelUsage`, ou sem `usage` de topo | `RESOLVED_MODEL_UNKNOWN` |
| Nenhuma entrada corresponde ao `usage` de topo | `RESOLVED_MODEL_UNKNOWN` |
| Duas ou mais entradas indistinguíveis | `RESOLVED_MODEL_AMBIGUOUS` |

Em qualquer falha, `observedModels` preserva os ids crus reportados pelo CLI,
para diagnóstico.

## Formato de output confirmado

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "result": "{\"role\":\"developer\",\"ok\":true}",
  "usage": {
    "input_tokens": 2,
    "output_tokens": 15,
    "cache_read_input_tokens": 15175,
    "cache_creation_input_tokens": 10113
  },
  "modelUsage": {
    "claude-opus-5": {
      "inputTokens": 2,
      "outputTokens": 15,
      "cacheReadInputTokens": 15175,
      "cacheCreationInputTokens": 10113
    }
  }
}
```

O envelope é parseado com `JSON.parse`, sem regex sobre texto humano. O payload
do agente sai em `result` e é parseado num segundo passo — pode vir como string
JSON ou como objeto; os dois casos são suportados.

## Limitações conhecidas

1. **Auth não é herdável por subprocesso a partir do app desktop.** O Claude
   Desktop mantém o token em processo. O que desbloqueou este Spike foi o CLI
   instalado e autenticado no host, visível no `PATH` — não o bundle interno do
   app. Um runner do IA Loop deve depender do CLI do host.
2. **Kill em timeout usa `child.kill('SIGKILL')`**, que no Windows não mata a
   árvore inteira de processos. Suficiente para o Spike; revisar se o
   orquestrador rodar agentes de longa duração.
3. **A correspondência de usage é exata.** Se o CLI passar a arredondar ou
   agregar os contadores de topo, a resolução cai em `RESOLVED_MODEL_UNKNOWN` —
   falha fechado, como deve ser, mas exigirá revisão do critério.
4. **Sem verificação de versão do CLI em runtime.** O Spike registra a versão
   que encontrou; não recusa versões diferentes.

## Uso

```bash
npm run ia-loop:spike    # validação real (2 chamadas de modelo)
npm run test:ia-loop     # testes unitários, sem chamadas reais
```

| Variável | Efeito |
| --- | --- |
| `IA_LOOP_CLAUDE_BIN` | Caminho explícito do executável |
| `IA_LOOP_TECH_LEAD_MODEL` | Modelo do Tech Lead (padrão `claude-fable-5-1`) |
| `IA_LOOP_DEVELOPER_MODEL` | Modelo do Developer (padrão `claude-opus-5`) |
| `IA_LOOP_TIMEOUT_MS` | Timeout por processo (padrão `120000`) |

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `spike-agent-invocation.mjs` | Runner: dois processos independentes + resumo sanitizado |
| `lib/claude-process.mjs` | Resolução do binário, spawn, timeout, parsing, resolução de modelo, validação |
| `tests/claude-process.test.mjs` | 28 testes com processo fake; nenhuma chamada real |

O resumo impresso traz apenas versão do CLI, modelo pedido, modelo primário,
modelos auxiliares e status. Nunca tokens, credenciais, session ids ou dados
pessoais.
