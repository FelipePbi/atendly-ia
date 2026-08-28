# GOAL 02 — Padronização de tooling + contratos compartilhados

## Objetivo

Criar a base técnica comum para que as futuras APIs não desenvolvam DTOs incompatíveis.

## Dependência

GOAL 01 deve estar concluído.

# 2.1 Padronizar qualidade de código

Garantir em:

```text
apps/frontend
apps/bff
apps/api
```

os comandos:

```text
lint
typecheck
format
format:check
build
```

O frontend já possui esse conjunto quase completo. BFF e API precisam ficar equivalentes.

## ESLint

Usar ESLint moderno.

Configurar regras para:

```text
unused imports
unused vars
consistent type imports
no floating promises
prefer const
no implicit any
imports organizados
```

Sem criar centenas de regras cosméticas que prejudiquem produtividade.

## TypeScript

Ativar ou manter:

```json
{
  "strict": true
}
```

Evitar:

```text
any
unknown sem narrowing
casts desnecessários
```

## Prettier

Configuração única ou equivalente em todos os Node apps.

# 2.2 Criar packages/contracts

Estrutura:

```text
packages/contracts/
├── package.json
├── tsconfig.json
└── src/
    ├── common/
    ├── auth/
    ├── tenant/
    ├── dashboard/
    ├── conversations/
    ├── calendar/
    ├── customers/
    ├── services/
    ├── settings/
    ├── onboarding/
    ├── whatsapp/
    ├── migrations/
    └── internal/
```

## Contratos devem ser schemas

Preferir:

```ts
export const appointmentSchema = z.object(...)
```

e:

```ts
export type Appointment =
  z.infer<typeof appointmentSchema>;
```

ao invés de duplicar:

```text
interface frontend
interface BFF
interface API
```

## Separar contratos públicos e internos

Exemplo:

```text
calendar/public.ts
calendar/internal.ts
```

Frontend deve importar apenas contratos públicos.

## Common schemas

Criar:

```text
id
ISO datetime
pagination
money
phone
timezone
error response
request id
```

## Contrato de erro

Padronizar:

```ts
{
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}
```

## Não definir ainda contratos especulativos

Não criar:

```text
KnowledgeManagement API
billing
teams
notifications
reminders
payments
```

sem necessidade de frontend.

# 2.3 Padronizar Prisma

Hoje BFF e API utilizam majors diferentes de Prisma.

Antes de criar serviços novos:

1. escolher uma major suportada;
2. atualizar de forma controlada;
3. validar geração;
4. validar migrations existentes;
5. validar build.

Não atualizar bancos e arquitetura simultaneamente.

## Gate GOAL 02

Todos:

```text
frontend lint PASS
frontend typecheck PASS
frontend format:check PASS
frontend build PASS

bff lint PASS
bff typecheck PASS
bff format:check PASS
bff build PASS

api lint PASS
api typecheck PASS
api format:check PASS
api build PASS

contracts build PASS
```

Nenhuma feature deve ter mudado de comportamento.

Somente então iniciar GOAL 03.
