# GOAL 12 — Infraestrutura real de dados no frontend

## Objetivo

Preparar o frontend para trocar mocks por BFF sem modificar cada tela de maneira improvisada.

## Dependência

GOAL 11 concluído.

# 12.1 Criar data layer

```text
src/data/
├── http/
│   └── BffHttpClient.ts
├── services/
└── mappers/
```

# 12.2 BffHttpClient

Responsável por:

```text
base URL
credentials include
content-type
CSRF se necessário
AbortSignal
requestId
response parsing
error mapping
```

# 12.3 Services

Criar:

```text
BffAuthService
BffOnboardingService
BffSettingsService
BffWhatsAppService
BffCalendarService
BffCustomerService
BffServiceCatalogService
BffConversationService
BffDashboardService
BffMigrationService
```

# 12.4 Não espalhar fetch

Proibido:

```ts
fetch(...)
```

diretamente em Screen/component.

# 12.5 Mock separation

Manter mocks para:

```text
/_preview/*
```

Produto real:

```text
BffServices
```

Preview:

```text
MockServices
```

# 12.6 Remover dados hardcoded do fluxo real

Hoje telas ainda possuem textos/dados demonstrativos embutidos.

Esses valores podem continuar apenas em preview.

Fluxo real deve receber dados do service.

## Gate GOAL 12

Nenhuma feature precisa estar completamente integrada ainda.

Mas:

```text
BffHttpClient existe
service registry existe
mocks isolados
nenhum novo fetch em component
lint PASS
typecheck PASS
format PASS
build PASS
```

Somente então GOAL 13.
