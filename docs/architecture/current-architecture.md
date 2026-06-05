# Arquitetura Atual

Data do inventario: 2026-06-05

## Visao geral

O workspace atual em `/home/felip/atendimeto-ia` ainda nao e um repositorio Git raiz. Ele contem quatro repositorios separados:

| Projeto | Path atual | Branch | Commit lido | Remote |
| --- | --- | --- | --- | --- |
| API | `api/` | `master` | `cc14edb010d46b73565539d4a1a1bf030a7315f0` | `https://github.com/FelipePbi/atendimeto-ia.git` |
| Evolution Go | `evolution-go/` | `main` | `465b1747e91b470844343ca931c648909fea74ad` | `git@github.com:FelipePbi/evolution-go.git` |
| Health worker | `health-worker/` | `main` | `7ac068ec55424dfee6b9cde398a91d494fe398ff` | `git@github.com:FelipePbi/atendimeto-ia-health-worker.git` |
| Frontend | `whatsapp-ai-inbox-frontend/` | `main` | `1c77945bc9fe6409fa1ee8bdc9b5773fd1eb5c8b` | `git@github.com:FelipePbi/whatsapp-ai-inbox-frontend.git` |

Alteracoes locais preexistentes:

- `api`: `docs/ENDPOINTS.MD`, `docs/PRD.md`, `docs/senha.md`.
- `evolution-go`: binario/arquivo `evolution-go`.
- `whatsapp-ai-inbox-frontend`: assets de marca em `public/brand/*`.

Essas alteracoes devem ser preservadas durante a migracao.

## Stacks e comandos

### API

- Stack: Node.js, TypeScript, Fastify, Prisma, PostgreSQL, Vitest, Zod.
- Package manager: npm com `package-lock.json`.
- Install: `npm ci`.
- Dev: `npm run dev`.
- Build: `npm run build`.
- Start: `npm start`.
- Tests: `npm test`.
- Prisma: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:deploy`.
- Docker: `Dockerfile` com Node 22 e `docker-compose.yml` com API, Postgres da API, Postgres do Evolution Go e imagem `evoapicloud/evolution-go:latest`.

Validacao executada:

- `npm run build`: passou.

### Evolution Go

- Stack: Go 1.25, Gin, GORM, PostgreSQL, Whatsmeow via `replace go.mau.fi/whatsmeow => ./whatsmeow-lib`.
- Package manager: Go modules.
- Dev: `make dev`.
- Run: `make run`.
- Build: `make build`.
- Tests: `make test` ou `go test ./...`.
- Docker: multi-stage `Dockerfile` com `golang:1.25.0-alpine` e runtime Alpine.

Validacao executada:

- `go test ./...`: passou, com warning de compilacao em dependencia C de `github.com/chai2010/webp`.

### Health worker

- Stack: Node.js ESM sem framework.
- Package manager: npm com `package-lock.json`.
- Install: `npm install`.
- Start: `npm start`.
- Check: `npm run check`.
- Deploy atual: `render.yaml` como worker Node.

Validacao executada:

- `npm run check`: passou.

### Frontend

- Stack: Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL, NextAuth, Tailwind CSS, Zod, Vitest.
- Package manager: npm com `package-lock.json`.
- Dev: `npm run dev`.
- Build: `npm run build`.
- Start: `npm run start`.
- Lint: `npm run lint`.
- Tests: `npm test`.
- Prisma: `npm run db:generate`, `npm run db:migrate`, `npm run db:migrate:dev`.
- Deploy atual: `render.yaml` como web service Node com banco `whatsapp-ai-inbox-db`.

Validacao executada:

- `npm run build`: passou.

## Variaveis de ambiente

### API

Variaveis principais identificadas em `api/.env.example` e `api/src/config/env.ts`:

- `NODE_ENV`, `API_PORT`, `PORT`
- `DATABASE_URL`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_OUTPUT_TOKENS`
- `CHANNEL_PROVIDER`
- `EVOLUTION_WEBHOOK_TOKEN`
- `FRONTEND_WEBHOOK_BASE_URL`
- `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_ID`, `EVOLUTION_INSTANCE_TOKEN`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_SEND_TEXT_PATH`
- `EVOLUTION_IGNORE_GROUPS`, `EVOLUTION_BOT_ENABLED`, `EVOLUTION_ALLOW_SELF_CHAT`
- `HUMAN_HANDOFF_PAUSE_MINUTES`
- `AI_DEBOUNCE_MIN_SECONDS`, `AI_DEBOUNCE_MAX_SECONDS`, `AI_DEBOUNCE_MAX_WAIT_SECONDS`
- `AI_BUFFER_BETWEEN_SERVICES_MINUTES`, `AI_PROMPT_VERSION`
- `MINHA_AGENDA_BASE_URL`, `MINHA_AGENDA_BASIC_AUTH`, `MINHA_AGENDA_USERNAME`, `MINHA_AGENDA_PASSWORD`
- `MINHA_AGENDA_DEFAULT_EMPLOYEE_ID`, `MINHA_AGENDA_DEFAULT_PAYMENT_METHOD`, `MINHA_AGENDA_MODEL_VERSION`
- `MINHA_AGENDA_TIMEOUT_MS`, `MINHA_AGENDA_TOKEN_REFRESH_SKEW_SECONDS`, `MINHA_AGENDA_ENABLE_WRITES`
- `ADMIN_API_TOKEN`

### Evolution Go

Variaveis principais identificadas:

- `SERVER_PORT`, `EVOLUTION_ENV`
- `POSTGRES_AUTH_DB`, `POSTGRES_USERS_DB`
- `DATABASE_SAVE_MESSAGES`
- `CLIENT_NAME`, `GLOBAL_API_KEY`
- `WADEBUG`, `LOGTYPE`, `WEBHOOK_FILES`, `CONNECT_ON_STARTUP`
- `OS_NAME`
- `AMQP_URL`, `AMQP_GLOBAL_ENABLED`
- `PROXY_*`
- `MINIO_*`

Observacao de seguranca: o arquivo `evolution-go/.env.example` contem valores que parecem credenciais reais. Antes do primeiro commit do monorepo, esse arquivo deve ser sanitizado e as credenciais devem ser rotacionadas se ja foram expostas.

### Health worker

Nao ha `.env.example` no projeto atual. O worker possui targets hardcoded em `src/index.js`.

Targets atuais:

- `api`: `https://atendimeto-ia.onrender.com/healthy`
- `evolution-go`: `https://evolution-go-4pmo.onrender.com/healthy`

### Frontend

Variaveis principais identificadas em `.env.example`, `render.yaml` e codigo:

- `DATABASE_URL`
- `AUTH_SECRET`, `JWT_SECRET`
- `NEXT_PUBLIC_APP_URL`, `APP_PUBLIC_URL`, `NEXTAUTH_URL`
- `EVOLUTION_GO_BASE_URL`, `EVOLUTION_GO_API_KEY`, `EVOLUTION_GO_SEND_TEXT_PATH`
- `EVOLUTION_WEBHOOK_SECRET`
- `BACKEND_API_BASE_URL`, `BACKEND_ADMIN_API_TOKEN`

Variaveis que precisam sair do frontend na arquitetura alvo:

- `EVOLUTION_GO_BASE_URL`
- `EVOLUTION_GO_API_KEY`
- `EVOLUTION_GO_SEND_TEXT_PATH`
- `EVOLUTION_WEBHOOK_SECRET`
- `BACKEND_API_BASE_URL`
- `BACKEND_ADMIN_API_TOKEN`

## Bancos de dados

### API

Usa PostgreSQL via Prisma. Modelos principais:

- `Conversation`
- `Message`
- `ProcessedEvent`
- `ToolCall`
- `CustomerLink`
- `ExternalAppointment`
- `Handoff`

Esse banco guarda o estado operacional do atendimento, mensagens processadas, chamadas de ferramentas, agendamentos externos e handoff humano.

### Frontend

Usa PostgreSQL via Prisma 7. Modelos principais:

- `User`
- `UserProfile`
- `UserSettings`
- `BusinessSettings`
- `WhatsAppInstance`
- `Conversation`
- `Message`
- `IgnoredContact`
- `AiSuppressionLog`
- `PersonaConversationImport`

Esse banco atualmente concentra autenticacao da plataforma, onboarding, configuracoes de IA/negocio, instancia WhatsApp e inbox.

### Evolution Go

Usa PostgreSQL para bancos de autenticacao e usuarios do Evolution Go:

- `POSTGRES_AUTH_DB`
- `POSTGRES_USERS_DB`

Tambem suporta SQLite/Minio/RabbitMQ/NATS conforme configuracao do projeto.

## Endpoints e superficies atuais

### API

Health:

- `GET /health`
- `GET /healthy`

Webhook Evolution:

- `POST /api/webhooks/evolution-go`
- `POST /webhooks/evolution?token=...`

Internos/admin:

- `GET /internal/handoffs`
- `POST /internal/handoffs`
- `PATCH /internal/handoffs/:id/resolve`
- `POST /internal/bot/resume`
- `POST /internal/bot/status`
- `POST /internal/evolution/dispatch`

Rotas internas usam `ADMIN_API_TOKEN` via `Authorization: Bearer ...` ou `x-admin-token`.

### Frontend

O browser chama rotas relativas do proprio Next.js, todas em `/api/*`.

Auth:

- `POST /api/auth/register`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `/api/auth/[...nextauth]`

WhatsApp/Evolution:

- `POST /api/whatsapp/instance`
- `DELETE /api/whatsapp/instance`
- `POST /api/whatsapp/connect`
- `GET /api/whatsapp/status`
- `GET /api/whatsapp/qr`
- `POST /api/whatsapp/logout`

Automacao e IA:

- `GET/PATCH /api/automation/business-settings`
- `GET/PATCH /api/automation/ai`
- `GET /api/automation/evolution-contacts`
- `GET/POST /api/automation/ignored-contacts`
- `POST /api/automation/ignored-contacts/bulk`
- `DELETE /api/automation/ignored-contacts/:id`
- `GET/PATCH /api/virtual-attendant/settings`
- `GET /api/virtual-attendant/prompt-preview`
- `POST /api/virtual-attendant/persona/import`
- `GET /api/virtual-attendant/persona/imports`
- `POST /api/virtual-attendant/persona/generate`

Inbox:

- `GET /api/conversations`
- `GET/PATCH /api/conversations/:id`
- `GET/POST /api/conversations/:id/messages`
- `POST /api/conversations/:id/ai/pause`
- `POST /api/conversations/:id/ai/resume`
- `POST /api/conversations/consolidate`

Onboarding:

- `GET /api/onboarding`
- `POST /api/onboarding/profile`
- `POST /api/onboarding/complete`

Webhook:

- `POST /api/webhooks/evolution-go?token=...`

### Evolution Go

Health:

- `GET /healthy`

Rotas internas principais identificadas no frontend/API:

- `POST /instance/create`
- `POST /instance/connect`
- `GET /instance/qr`
- `GET /instance/status`
- `GET /instance/info/:id`
- `DELETE /instance/logout`
- `DELETE /instance/delete/:id`
- `POST /send/text`
- `GET /user/contacts`

Ha tambem interface `/manager`, websocket `/ws` e rotas adicionais em `pkg/*`.

## Fluxos atuais

### Browser para plataforma

```text
Browser
  -> Frontend Next.js
  -> Rotas /api do proprio frontend
  -> Banco PostgreSQL do frontend
  -> Evolution Go, quando envolve instancia/QR/status/envio/contatos
  -> API Node, quando envolve dispatch interno, handoff e status de bot
```

### WhatsApp

Fluxo principal preservado:

```text
WhatsApp
  -> Evolution Go
  -> API Node /webhooks/evolution
  -> API processa IA/agendamento
  -> Evolution Go /send/text
  -> WhatsApp
```

Fluxo legado ainda presente:

```text
Evolution Go
  -> API Node /api/webhooks/evolution-go
  -> Frontend /api/webhooks/evolution-go
  -> Banco do frontend e dispatch opcional para API
```

Esse fluxo legado e um acoplamento importante a remover ou encapsular cuidadosamente no BFF.

### Frontend para API Node

O frontend chama `BACKEND_API_BASE_URL` com `BACKEND_ADMIN_API_TOKEN` para:

- `POST /internal/evolution/dispatch`
- `POST /internal/handoffs`
- `POST /internal/bot/resume`
- `POST /internal/bot/status`

### Frontend para Evolution Go

O frontend chama `EVOLUTION_GO_BASE_URL` com `apikey` para:

- criar instancia;
- conectar instancia;
- buscar QR;
- consultar status;
- buscar dados da instancia;
- logout/delete;
- enviar texto;
- importar contatos.

## Dependencias externas

- OpenAI Responses API.
- API "Minha Agenda".
- Evolution Go.
- PostgreSQL.
- Render.
- NextAuth.
- RabbitMQ/NATS/Minio opcionais no Evolution Go.

## Problemas encontrados

1. O workspace raiz ainda nao e um repositorio Git.
2. Os quatro projetos estao separados e possuem historicos/remotes distintos.
3. O frontend concentra autenticacao, banco, rotas de API e chamadas diretas a Evolution Go/API Node.
4. O frontend possui variaveis server-side sensiveis para Evolution Go e API Node.
5. O arquivo `evolution-go/.env.example` contem valores que parecem segredos reais.
6. O health-worker tem URLs hardcoded e nao monitora frontend nem BFF.
7. A API aceita rotas internas com um token admin unico; nao ha JWT interno com audience.
8. O fluxo legado `API -> Frontend webhook` ainda existe e aumenta o acoplamento.

## Criterio de avancar

Comandos basicos foram validados com sucesso em 2026-06-05:

- API: `npm run build`.
- Frontend: `npm run build`.
- Health worker: `npm run check`.
- Evolution Go: `go test ./...`.
- BFF novo em `apps/bff`: `npm run build`.

Audits de dependencias apos instalar as copias em `apps/*`:

- `apps/api`: `npm audit` reportou 1 vulnerabilidade critica.
- `apps/frontend`: `npm audit` reportou 5 vulnerabilidades moderadas apos remover NextAuth.
- `apps/bff`: `npm audit` reportou 3 vulnerabilidades moderadas.
- `apps/health-worker`: sem vulnerabilidades reportadas.

A estrutura `apps/*`, o BFF base e os documentos de arquitetura alvo ja foram criados no monorepo. O frontend ja usa o BFF para autenticacao JWT, guards server-side, logout/login/register, onboarding, rotas WhatsApp principais, importacao de contatos, configuracoes de negocio, configuracoes da Atendente Virtual e lista de ignorados. A proxima etapa e migrar as rotas restantes de chat manual, webhook legado, handoff e persona customizada para remover as chamadas server-side diretas para API/Evolution Go.
