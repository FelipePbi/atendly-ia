# GOAL 17 — Remoção definitiva do legado

## Objetivo

Evitar que a nova arquitetura conviva indefinidamente com a antiga.

## Dependência

GOAL 16 concluído.

# 17.1 Frontend

Remover mocks do produto real.

Manter somente os realmente usados no preview.

Remover:

```text
unused scenarios
unused services
unused props
unused hardcoded fixtures
```

# 17.2 BFF

Remover:

```text
PersonaConversationImport
CustomPersonaStatus
CUSTOM persona
SEPARATE_ASSISTANT
assistantName
assistantSex
birthDate
sex
legacy webhook ingestion
legacy Evolution parser
duplicated Conversation
duplicated Message
duplicated handoff
ignored contacts se não houver feature
```

# 17.3 AI Orchestrator

Remover:

```text
legacy OpenAI client
old MessageOrchestrator
Minha Agenda module
legal module
legacy business settings
legacy virtual attendant
internal endpoints sem consumidor
```

# 17.4 Scheduling

Remover quaisquer adapters temporários usados somente durante migração.

# 17.5 Dependencies

Executar auditoria de packages.

Remover dependências não importadas.

# 17.6 Env

Remover:

```text
envs Minha Agenda globais
envs de persona antiga
envs de rotas removidas
```

Atualizar `.env.example`.

# 17.7 Código morto

Não criar:

```text
legacy/
old/
deprecated/
_backup/
```

Git é o histórico.

## Gate GOAL 17

Search no repositório por termos antigos.

Exemplos:

```text
CUSTOM
PersonaConversationImport
SEPARATE_ASSISTANT
MinhaAgendaServiceFacade no AI
whatsappPhone @unique global
Mock* em fluxo de produção
```

Resultado deve ser zero ou possuir justificativa documentada.

Depois:

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 18.
