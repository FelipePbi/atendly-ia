# GOAL 10 — RAG multi-tenant com PostgreSQL + pgvector

## Objetivo

Adicionar conhecimento não estruturado ao atendimento sem transformar RAG em banco de regras operacionais.

## Dependência

GOAL 09 concluído.

# 10.1 Ativar pgvector

Na base AI:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

# 10.2 KnowledgeDocument

```text
id
tenantId
type
title
source
version
checksum
status
createdAt
updatedAt
```

# 10.3 KnowledgeChunk

```text
id
tenantId
documentId
content
metadata
embedding
createdAt
updatedAt
```

# 10.4 Embeddings

Criar abstração:

```text
EmbeddingProvider
```

Não espalhar chamada de embedding pelo domínio.

# 10.5 VectorStore

Criar:

```text
KnowledgeVectorStore
```

implementação inicial:

```text
PGVectorKnowledgeStore
```

# 10.6 Filtro obrigatório

Toda retrieval deve exigir:

```text
tenantId
```

A API do repository não deve permitir chamar search sem tenant.

Exemplo desejado:

```ts
search({
  tenantId,
  query,
  limit,
});
```

Não expor:

```ts
search(query);
```

# 10.7 O que indexar

Permitido:

```text
FAQ
orientações
cuidados
procedimentos
descrições longas
informações do negócio
políticas textuais explicitamente configuradas
```

# 10.8 O que NÃO indexar como fonte operacional

Não usar RAG para:

```text
preço atual
serviço ativo
agenda
slot
appointment status
customer appointment
WhatsApp status
integração status
```

# 10.9 Tool

Criar:

```text
search_business_knowledge
```

Output deve conter contexto suficiente para resposta, mas sem expor embedding ou internals.

# 10.10 Integração Graph

Fluxo:

```text
pergunta relevante
      ↓
retrieveKnowledge
      ↓
context
      ↓
agent
```

Não recuperar conhecimento para toda mensagem.

Exemplo:

```text
"Tem horário amanhã?"
→ não precisa RAG
→ Scheduling tool
```

```text
"Posso lavar o cabelo depois da progressiva?"
→ RAG
```

# 10.11 Sem CRUD público ainda

Como frontend atual não possui módulo de Knowledge Base:

```text
NÃO criar /v1/knowledge
NÃO criar tela
NÃO criar upload
```

Pode existir apenas infraestrutura interna/seed controlado.

## Gate GOAL 10

Validar manualmente:

Tenant A:

```text
documento A
```

Tenant B:

```text
documento B
```

Busca do A nunca retorna chunk B.

Mesmo com consultas semanticamente semelhantes.

Além disso:

```text
pergunta de knowledge → RAG
pergunta disponibilidade → Scheduling
preço → Scheduling
appointment → Scheduling
```

Qualidade:

```text
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 11.
