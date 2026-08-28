# GOAL 03 — Fundação multi-tenant no BFF

## Objetivo

Eliminar o conceito implícito de:

```text
User == negócio
```

antes de espalhar esse erro para novos serviços.

## Dependência

GOAL 02 concluído.

# 3.1 Novo modelo

Criar no BFF:

```text
Tenant
TenantMember
BusinessProfile
```

Manter:

```text
User
LegalAcceptance
WhatsAppInstance
```

temporariamente.

## Tenant

Campos mínimos:

```text
id
name
createdAt
updatedAt
```

Não adicionar slug se nenhuma funcionalidade utilizar.

## TenantMember

```text
id
tenantId
userId
role
createdAt
```

Role inicialmente:

```text
OWNER
```

Mesmo que V1 não possua equipes.

Unique:

```text
tenantId + userId
```

## BusinessProfile

Mover gradualmente dados de negócio para uma entidade tenant-scoped.

Campos do produto atual:

```text
businessName
category
timezone
language
currency
```

Não colocar:

```text
birthDate
sex
```

porque não pertencem ao domínio necessário do produto atual.

# 3.2 Registro transacional

Hoje o registro cria principalmente usuário/settings/legal.

Novo fluxo:

```text
BEGIN TRANSACTION

create User
create Tenant
create TenantMember OWNER
create BusinessProfile inicial
create LegalAcceptance

COMMIT
```

Falha em qualquer ponto:

```text
ROLLBACK
```

# 3.3 Migrar usuários existentes

Criar migration segura.

Para cada usuário legado sem tenant:

```text
create Tenant
create TenantMember OWNER
migrar businessName se existir
```

Migration deve ser idempotente ou protegida.

Nunca criar dois tenants para o mesmo usuário legado por execução repetida.

# 3.4 TenantContext

Criar:

```ts
export interface TenantContext {
  userId: string;
  tenantId: string;
  role: "OWNER";
}
```

Middleware/hook:

```text
requireAuth
    ↓
resolveTenantContext
    ↓
request.tenantContext
```

## Regra de segurança

Nunca:

```ts
const tenantId = request.body.tenantId;
```

para definir tenant ativo.

Sempre:

```text
session
 ↓
User
 ↓
TenantMember
 ↓
Tenant
```

# 3.5 Preparar sessão

A sessão pode continuar contendo `userId`.

Não é obrigatório colocar `tenantId` no JWT agora.

Resolver server-side reduz risco de sessão ficar inconsistente após futuras mudanças.

# 3.6 Remover dependências desnecessárias de perfil legado

Preparar remoção de:

```text
birthDate
sex
custom persona
assistant sex
separate assistant
```

Não remover ainda se alguma rota corrente quebrar.

Primeiro remover consumidores.

# 3.7 Todas as futuras queries BFF

Repositories devem exigir:

```text
tenantId
```

quando acessarem recurso de negócio.

## Gate GOAL 03

Verificar manualmente:

### Novo usuário

```text
register
→ User criado
→ Tenant criado
→ OWNER criado
→ BusinessProfile criado
→ login funciona
→ /auth/session resolve tenant
```

### Usuário legado

```text
login funciona
tenant existente
nenhuma duplicação
```

### Segurança

Não deve existir rota capaz de operar tenant diferente enviando `tenantId` pelo body/query.

### Qualidade

```text
lint PASS
typecheck PASS
format:check PASS
build PASS
prisma migration PASS
```

Somente então GOAL 04.
