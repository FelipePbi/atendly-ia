# GOAL 15 — Integrar Conversas + takeover + WhatsApp humano

## Objetivo

Eliminar de vez o domínio duplicado de conversas no BFF.

## Dependência

GOAL 14 concluído.

# 15.1 AI Orchestrator é source of truth

BFF deixa de persistir:

```text
Conversation
Message
Handoff
```

quando integração estiver concluída.

# 15.2 Conversations list

```text
Frontend
 ↓
BFF
 ↓
AI Orchestrator
```

# 15.3 Conversation detail/messages

Conectar:

```text
GET conversation
GET messages
```

# 15.4 Manual message

Novo fluxo:

```text
Frontend
 ↓
BFF
 ↓
AI Orchestrator
 ↓
persist Message
 ↓
Evolution
```

BFF não envia mais diretamente ao Evolution.

# 15.5 Takeover

```text
POST takeover
```

AI deve parar de responder naquela conversation.

# 15.6 Release

```text
POST release
```

Devolver conversa para AI.

# 15.7 Resolve

Marcar atendimento resolvido sem apagar histórico.

# 15.8 Eliminar modelos duplicados

Quando frontend estiver usando exclusivamente AI Orchestrator via BFF:

remover do schema BFF:

```text
Conversation
Message
AiSuppressionLog
```

e modelos diretamente associados que não tenham mais uso.

# 15.9 Remover rotas antigas

Remover:

```text
/conversations/consolidate
legacy pause routes
legacy duplicated handoff operations
```

se não houver consumidor.

## Gate GOAL 15

Fluxo:

```text
cliente envia WhatsApp
mensagem aparece no painel
AI responde
mensagem aparece
humano assume
AI para
humano envia
cliente recebe
humano devolve
AI volta
```

Sem:

```text
duplicação de Conversation
duplicação de Message
BFF persistindo message
BFF enviando diretamente
```

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 16.
