# Deploy no Render

## Servicos

| Servico | Tipo | Root dir | Health |
| --- | --- | --- | --- |
| `atendly-ia-frontend` | web Node | `apps/frontend` | `/login` |
| `atendly-ia-bff` | web Node | `apps/bff` | `/health` |
| `atendly-ia-api` | web Node | `apps/api` | `/health` |
| `atendly-ia-evolution-go` | web Docker | `apps/evolution-go` | `/healthy` |
| `atendly-ia-health-worker` | web Node | `apps/health-worker` | `/health` |

O Blueprint usa `plan: free`. Nesse plano, o Render nao aceita `preDeployCommand`; por isso as migrations Prisma de BFF/API rodam dentro do `buildCommand` antes do build. O Render tambem nao aceita `background_worker` no plano free; o health-worker roda como web service leve com `/health` e mantem o polling interno.

URLs publicas atuais:

- Frontend: `https://atendly-ia-frontend.onrender.com`
- BFF: `https://atendly-ia-bff.onrender.com`
- API: `https://atendimeto-ia.onrender.com`
- Evolution Go: `https://evolution-go-4pmo.onrender.com`
- Health worker: `https://atendly-ia-health-worker.onrender.com/health`

## Variaveis sensiveis

Configurar no Render, nunca no Git:

- `JWT_SECRET`
- `DATABASE_URL`
- `EVOLUTION_GO_API_KEY`
- `EVOLUTION_WEBHOOK_SECRET`
- `API_EVOLUTION_WEBHOOK_TOKEN`
- `INTERNAL_SERVICE_TOKEN`
- `ADMIN_API_TOKEN`
- `OPENAI_API_KEY`
- `MINHA_AGENDA_BASIC_AUTH`
- `MINHA_AGENDA_USERNAME`
- `MINHA_AGENDA_PASSWORD`
- `POSTGRES_AUTH_DB`
- `POSTGRES_USERS_DB`
- `GLOBAL_API_KEY`

O frontend deve receber apenas URLs do BFF:

- `NEXT_PUBLIC_BFF_URL`
- `BFF_BASE_URL`

## Sequencia segura

1. Criar BFF no Render.
2. Validar `/health`.
3. Validar auth do BFF em staging.
4. Migrar chamadas do frontend para o BFF.
5. Atualizar `HEALTH_TARGETS`.
6. Endurecer CORS e tokens internos depois que os fluxos forem validados.

## Autorizacao do GitHub App

Antes de criar/sincronizar os servicos a partir do monorepo privado, o GitHub App do Render precisa ter acesso ao repositorio `FelipePbi/atendly-ia`.

Se o Render retornar `repository URL is invalid or unfetchable`, abra:

```text
https://github.com/apps/render/installations/new
```

Na instalacao existente do Render, confirme que `FelipePbi/atendly-ia` esta incluido em `Repository access`. Depois disso, a CLI/API do Render consegue criar os servicos com o `render.yaml` validado.
