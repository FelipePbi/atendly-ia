@C:\Users\felip\.codex\RTK.md

# Atendly IA — instrucoes para agentes

## Visao geral

`atendly-ia` e um monorepo privado para atendimento automatizado de pequenos negocios pelo WhatsApp. A plataforma permite cadastrar usuario e negocio, conectar uma instancia WhatsApp, acompanhar conversas, controlar quando a IA responde e executar fluxos de agenda pela integracao Minha Agenda.

Apps principais:

- `apps/frontend`: painel web mobile-first. Next.js App Router, React e TypeScript.
- `apps/bff`: gateway da plataforma. Fastify, JWT em cookie `HttpOnly`, Prisma/PostgreSQL e integracoes internas.
- `apps/api`: motor de atendimento. Fastify, IA/OpenAI, orquestracao, handoff humano, agendamento e Minha Agenda.
- `apps/evolution-go`: gateway WhatsApp. Go, Gin, GORM e fork local de `whatsmeow`.
- `apps/health-worker`: servidor Node simples que expoe health e consulta alvos periodicamente.

Nao existem workspaces npm na raiz. Cada app Node possui `package-lock.json` proprio e deve ser instalado isoladamente com npm.

## Estrutura do repositorio

```text
apps/
  frontend/       UI Next.js, componentes, rotas de pagina e proxies /api/*.
  bff/            Auth, onboarding, configuracoes, inbox e gateway de servicos.
    prisma/       Schema e migrations do banco da plataforma.
    src/routes/   Rotas Fastify por dominio.
    src/services/ Adaptadores da API, Evolution Go e persona.
  api/            IA, automacao, canal WhatsApp, agenda e handoff.
    prisma/       Schema e migrations operacionais.
    src/modules/  Modulos de dominio e adaptadores.
    tests/        Testes Vitest unitarios, de rota e integracao opt-in.
  evolution-go/   Servidor Go e biblioteca whatsmeow vendorizada.
    cmd/           Entry point.
    pkg/           Handlers, services, repositories e integracoes.
    whatsmeow-lib/ Fork local referenciado por `replace` no `go.mod`.
  health-worker/  Worker HTTP sem dependencias externas.
docs/
  architecture/   Arquitetura atual, alvo, contrato BFF e deploy Render.
  qa/             Smokes e evidencias anteriores.
scripts/          Build agregado e smokes Render/producao.
render.yaml        Blueprint dos cinco servicos no Render.
```

Leia tambem `apps/frontend/AGENTS.md` antes de alterar frontend. Next.js 16 possui regras locais e documentacao instalada em `node_modules/next/dist/docs/`.

## Arquitetura e limites de responsabilidade

Fluxo de plataforma:

```text
Browser -> Frontend Next.js -> BFF -> API / Evolution Go / PostgreSQL da plataforma
```

Fluxo critico de mensagens:

```text
WhatsApp -> Evolution Go -> API /webhooks/evolution
         -> MessageOrchestrator -> Assistant/OpenAI/Minha Agenda
         -> Evolution Go /send/text -> WhatsApp
```

Fluxo de inbox e controle:

```text
Evolution Go -> BFF /webhooks/evolution-go
             -> banco da plataforma
             -> API /internal/* quando houver dispatch, bot ou handoff
```

Regras obrigatorias:

- Frontend consome somente BFF. Nao adicionar URLs ou tokens internos da API, Evolution Go, OpenAI ou Minha Agenda ao browser.
- Rotas Next.js em `src/app/api/**` sao proxies de compatibilidade; centralizar chamadas server-side em `src/lib/bff.ts`.
- BFF e dono de auth, sessao, onboarding, configuracoes, inbox e instancia associada ao usuario.
- API e dona de IA, prompts, memoria da conversa, ferramentas, handoff e Minha Agenda.
- Evolution Go e dono da sessao WhatsApp, QR, status, contatos e envio.
- Fluxo critico WhatsApp continua fora do BFF nesta fase, salvo mudanca arquitetural explicita.
- Rotas `/internal/*` da API exigem `INTERNAL_SERVICE_TOKEN` ou `ADMIN_API_TOKEN` legado.
- Preservar envelope BFF: sucesso `{ data, requestId }`; erro `{ error: { code, message, details }, requestId }`.
- Segredos reais nunca entram em `.env.example`, README, docs, logs ou codigo.

Documentos de autoridade:

- Estado atual: `docs/architecture/current-architecture.md`.
- Arquitetura alvo: `docs/architecture/target-architecture.md`.
- Contrato BFF: `docs/architecture/bff-contract.md`.
- Deploy: `docs/architecture/render-deploy.md`.
- Smoke manual: `docs/qa/manual-smoke-test.md`.

## Tecnologias e versoes

| Area | Tecnologia esperada |
| --- | --- |
| Runtime Node | Node.js `>=20`; Render fixa `24.13.0`; setup local validado com `24.18.0` |
| Gerenciador Node | npm e `package-lock.json` por app |
| Frontend | Next.js `16.2.7`, React `19.2.4`, TypeScript 5, Tailwind CSS 4, Zod 4, ESLint 9, Vitest 4 |
| BFF | Fastify 5, Prisma `7.8`, PostgreSQL, Zod 4, Jose/JWT, bcryptjs |
| API | Fastify 5, Prisma `6.19`, PostgreSQL, Zod 4, Vitest 3 |
| Evolution Go | Go `1.25.0`, release local `0.7.1`, Gin, GORM, whatsmeow local |
| Infra local | Docker Desktop/Engine, Docker Compose e PostgreSQL 15 |

Nao atualizar runtimes ou dependencias apenas por existir versao nova. API e BFF usam majors Prisma diferentes de forma intencional.

## Configuracao inicial

Pre-requisitos:

- Node.js 20 ou superior e npm.
- Go 1.25.0 para modulos e desenvolvimento Go.
- Docker com Compose para PostgreSQL e Evolution Go.
- Bash para `scripts/build-all.sh`. No Windows, Git Bash atende a parte Node; testes Go devem preferir Linux/Docker por CGO e semantica de file handles.

Instale exatamente pelos lockfiles:

```bash
cd apps/api && npm ci
cd ../bff && npm ci
cd ../frontend && npm ci
cd ../health-worker && npm ci
cd ../evolution-go && go mod download
```

Crie arquivos locais ignorados pelo Git a partir dos exemplos:

```text
apps/api/.env
apps/bff/.env
apps/frontend/.env.local
apps/evolution-go/.env
```

Suba infraestrutura definida em `apps/api/docker-compose.yml`:

```bash
cd apps/api
docker compose up -d --wait api-postgres evogo-postgres
docker compose exec -T api-postgres createdb -U app -O app atendly_bff
```

O `createdb` deve ser executado somente quando `atendly_bff` ainda nao existir. O Compose atual nao declara banco ou servico BFF; em desenvolvimento ele reutiliza o PostgreSQL exposto na porta local do `api-postgres` com database separado.

Aplique migrations e gere clients:

```bash
cd apps/api && npm run prisma:deploy && npm run prisma:generate
cd ../bff && npm run prisma:deploy && npm run prisma:generate
```

Suba Evolution Go, sabendo que primeira execucao pode exigir ativacao de licenca no Manager:

```bash
cd apps/api
docker compose up -d evolution-go
```

Inicie apps Node em terminais separados, a partir da raiz:

```bash
npm run dev:api
npm run dev:bff
npm run dev:frontend
cd apps/health-worker && npm start
```

Ordem recomendada: bancos, migrations, Evolution Go, API, BFF, frontend, health-worker.

## URLs e portas locais

| Servico | URL |
| --- | --- |
| Frontend | `http://localhost:3001` |
| BFF | `http://localhost:3002` |
| API | `http://localhost:3000` |
| Evolution Go | `http://localhost:8080` |
| Health worker | `http://localhost:10000` por padrao |
| PostgreSQL API/BFF | porta host `5433` no Compose atual |
| PostgreSQL Evolution Go | porta host `5434` no Compose atual |

Health endpoints: frontend `/login`, BFF `/health`, API `/health`, Evolution Go `/healthy`, worker `/health`. BFF `/health/dependencies` mostra API e Evolution individualmente; o HTTP geral pode continuar 200 mesmo com dependencia degradada.

## Variaveis de ambiente

Liste valores apenas em arquivos locais ignorados ou no provedor de deploy. Nunca documente valor secreto.

### Frontend

- `NEXT_PUBLIC_BFF_URL`: URL publica do BFF usada pelo browser; obrigatoria fora do fallback local.
- `BFF_BASE_URL`: URL server-side do BFF; opcional, com fallback para `NEXT_PUBLIC_BFF_URL`.

### BFF

- `NODE_ENV`, `PORT`: ambiente e porta; possuem defaults locais.
- `DATABASE_URL`: PostgreSQL da plataforma; obrigatoria para rotas persistentes e migrations.
- `JWT_SECRET`: assinatura das sessoes; obrigatoria e forte em producao.
- `JWT_EXPIRES_IN`, `SESSION_COOKIE_NAME`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`: politica da sessao; possuem defaults.
- `FRONTEND_ORIGIN`: origem CORS permitida; possui default local.
- `API_BASE_URL`: base da API; possui default local.
- `API_EVOLUTION_WEBHOOK_TOKEN`: token usado pelo dispatch de webhook para API; necessario nesse fluxo.
- `EVOLUTION_GO_BASE_URL`: base do gateway; possui default local.
- `EVOLUTION_GO_API_KEY`: chave global do Evolution Go; necessaria para criar/deletar instancia.
- `EVOLUTION_GO_SEND_TEXT_PATH`: rota de envio; possui default.
- `INTERNAL_SERVICE_TOKEN`: token BFF -> API; necessario para rotas internas protegidas.
- `BFF_PUBLIC_URL`: base publica usada para montar webhook; possui default local.
- `EVOLUTION_WEBHOOK_SECRET`: valida webhook recebido pelo BFF; necessario para WhatsApp/inbox.

### API

- `NODE_ENV`, `API_PORT`, `PORT`: ambiente e porta; possuem defaults.
- `DATABASE_URL`: PostgreSQL operacional; obrigatoria para processamento persistente e migrations.
- `CHANNEL_PROVIDER`: provider do canal; apenas `evolution-go` e suportado.
- `EVOLUTION_WEBHOOK_TOKEN`: valida webhook recebido pela API.
- `FRONTEND_WEBHOOK_BASE_URL`: base legada/compatibilidade; possui default.
- `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_ID`, `EVOLUTION_INSTANCE_TOKEN`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_SEND_TEXT_PATH`: configuracao do canal. Envio exige base e token de instancia ou chave.
- `EVOLUTION_IGNORE_GROUPS`, `EVOLUTION_BOT_ENABLED`, `EVOLUTION_ALLOW_SELF_CHAT`, `HUMAN_HANDOFF_PAUSE_MINUTES`: comportamento do bot; possuem defaults.
- `AI_DEBOUNCE_MIN_SECONDS`, `AI_DEBOUNCE_MAX_SECONDS`, `AI_DEBOUNCE_MAX_WAIT_SECONDS`, `AI_BUFFER_BETWEEN_SERVICES_MINUTES`, `AI_PROMPT_VERSION`: orquestracao e auditoria; possuem defaults.
- `OPENAI_API_KEY`: obrigatoria somente nos caminhos que chamam OpenAI.
- `OPENAI_MODEL`, `OPENAI_MAX_OUTPUT_TOKENS`: modelo e limite; possuem defaults.
- `MINHA_AGENDA_BASE_URL`, `MINHA_AGENDA_BASIC_AUTH`, `MINHA_AGENDA_USERNAME`, `MINHA_AGENDA_PASSWORD`: leituras da Minha Agenda exigem credenciais completas.
- `MINHA_AGENDA_DEFAULT_EMPLOYEE_ID`, `MINHA_AGENDA_DEFAULT_PAYMENT_METHOD`, `MINHA_AGENDA_MODEL_VERSION`, `MINHA_AGENDA_TIMEOUT_MS`, `MINHA_AGENDA_TOKEN_REFRESH_SKEW_SECONDS`: defaults do contrato externo.
- `MINHA_AGENDA_ENABLE_WRITES`: trava de seguranca; manter desativada em desenvolvimento comum e testes read-only.
- `MINHA_AGENDA_RUN_INTEGRATION_TESTS`: flag test-only para integracao read-only; opcional e desativada por padrao.
- `ADMIN_API_TOKEN`, `INTERNAL_SERVICE_TOKEN`: autenticacao de rotas internas; ao menos um deve existir para consumidores autorizados.

Variaveis `API_POSTGRES_*`, `EVOGO_POSTGRES_*` e `EVOGO_*` presentes em `apps/api/.env.example` alimentam Docker Compose, nao o schema runtime da API.

### Evolution Go

- `SERVER_PORT`, `PORT`: porta, com fallback interno.
- `POSTGRES_AUTH_DB`, `POSTGRES_USERS_DB`: bancos de auth e dados; usados no Compose. Auth cai para SQLite local quando a URL esta ausente.
- `GLOBAL_API_KEY`: autentica endpoints globais e websocket.
- `DATABASE_SAVE_MESSAGES`, `CLIENT_NAME`, `CONNECT_ON_STARTUP`, `WADEBUG`, `LOGTYPE`, `WEBHOOK_FILES`, `OS_NAME`: comportamento, reconexao e logging.
- `AMQP_URL`, `AMQP_GLOBAL_ENABLED` e demais `AMQP_*`: RabbitMQ opcional.
- `NATS_*`: NATS opcional quando configurado no codigo.
- `MINIO_ENABLED`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`: armazenamento de midia opcional.
- `PROXY_PROTOCOL`, `PROXY_HOST`, `PROXY_PORT`, `PROXY_USERNAME`, `PROXY_PASSWORD`: proxy opcional.

### Health worker

- `PORT`: porta HTTP; opcional.
- `HEALTH_TARGETS`: lista `nome=url` separada por virgula; opcional, com alvos Render como defaults.

## Comandos importantes

Da raiz:

```bash
npm run dev:api
npm run dev:bff
npm run dev:frontend
npm run build:api
npm run build:bff
npm run build:frontend
npm run check:health-worker
npm run test:evolution-go
npm run smoke:render
npm run smoke:final-audit
```

Build agregado:

```bash
npm run build:all
```

`build:all` chama Bash e termina com `go test ./...`. Em Windows nativo, use os builds Node individualmente e execute testes Go em Linux/Docker:

```bash
docker run --rm -v "<caminho-absoluto-evolution-go>:/src" -w /src golang:1.25.0-alpine sh -c "apk add --no-cache git build-base libjpeg-turbo-dev libwebp-dev && go test ./..."
```

Por app:

```bash
cd apps/api
npm test
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy

cd ../bff
npm run check
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy

cd ../frontend
npm run lint
npm test
npm run build

cd ../health-worker
npm run check

cd ../evolution-go
go test ./...
```

Nao rode `prisma:migrate` contra producao. Deploy usa migrations versionadas via `prisma:deploy`.

## Convencoes de codigo

- API e BFF sao ESM (`type: module`) com TypeScript estrito e resolucao `NodeNext`; imports TS internos usam extensao `.js`.
- Validar env e payloads com Zod. Nao substituir validacao por casts, `any` ou regras desativadas.
- Fastify registra rotas por funcoes `register*Routes`; manter regras de dominio em services/modulos, nao inflar `server.ts`.
- API centraliza Prisma em `src/db/prisma.ts`; BFF em `src/lib/prisma.ts`.
- BFF converte entidades para DTOs em `src/lib/dto.ts` e responde pelo envelope de `src/lib/http.ts`.
- Erros esperados usam `AppError`; logs e detalhes devem passar por redacao. Nunca registrar headers de auth, cookies, senhas, tokens, telefones brutos ou payloads sensiveis.
- Frontend usa alias `@/*`, App Router e route handlers. Codigo server-only importa `server-only`; componentes interativos declaram `"use client"`.
- Estado global do dashboard vive em `DashboardContext`; estado de tela permanece local quando nao precisa ser compartilhado.
- Estilos vivem principalmente em Tailwind e `src/app/globals.css`; reutilize componentes de `src/components`.
- Go organiza dominio por `pkg/<dominio>/{handler,service,repository}`. Preserve interfaces e injecao feitas em `cmd/evolution-go/main.go`.
- O fork `whatsmeow-lib` e parte do build. Nao trocar pelo modulo remoto sem analise explicita.
- Testes TypeScript usam `*.test.ts`; mantenha teste proximo do modulo no frontend e sob `apps/api/tests/<dominio>` na API.

## Regras para alteracoes

- Leia arquivos relacionados, este documento e qualquer `AGENTS.md` mais proximo antes de editar.
- Preserve separacao frontend -> BFF -> servicos. Nao introduza acesso direto por conveniencia.
- Nao altere contratos publicos sem atualizar consumidores, docs e testes relacionados.
- Nao mover logica de IA/agendamento para BFF nem logica WhatsApp para frontend.
- Prefira mudanca minima. Evite dependencias, refatoracoes ou upgrades fora do escopo.
- Atualize migration Prisma quando schema mudar; nunca edite banco manualmente como substituto da migration.
- Preserve idempotencia de webhook, normalizacao de telefone/JID, deduplicacao e regras de handoff.
- Mantenha `MINHA_AGENDA_ENABLE_WRITES` desligada em testes automatizados, salvo teste real explicitamente autorizado.
- Nao execute `npm audit fix --force` nem atualizacao indiscriminada. Investigue impacto e majors primeiro.
- Nao mascarar falha com `any`, `@ts-ignore`, lint desativado, teste removido ou erro ignorado.
- Nao modificar `render.yaml`, recursos Render ou producao sem escopo e autorizacao explicitos.

## Estrategia de testes

### API

- Framework: Vitest 3.
- Local: `apps/api/tests/**`.
- Cobre assistant, orquestrador, mapper/provider Evolution, webhooks, rotas internas/legais, Minha Agenda, OpenAI tools e configuracao do atendente.
- Testes usam fakes/mocks de HTTP e Prisma quando apropriado.
- Integracao `tests/integration/minha-agenda.readonly.test.ts` e opt-in por env e deve manter writes desativados.

### Frontend

- Framework: Vitest 4 em ambiente Node.
- Testes atuais ficam em `src/lib/*.test.ts` e cobrem telefone/JID, deduplicacao e prontidao do atendente virtual.
- ESLint e `next build` fazem gates adicionais de tipos e App Router.

### BFF

- Nao possui suite automatizada no estado atual.
- Gates minimos: `npm run check`, `npm run build` e smoke de auth/proxy/dependencias.
- Ao alterar rota ou regra critica, adicionar teste e evitar depender apenas de smoke manual.

### Evolution Go

- Framework nativo `go test`.
- Em Windows, CGO do pacote WebP exige toolchain nativa e alguns testes de log dependem da semantica de unlink Unix. Preferir container Linux com dependencias do Dockerfile.

### Health worker

- Gate atual: `node --check src/index.js`.
- Smoke: validar `/health` e `/targets`, depois conferir logs de polling.

## Banco de dados

### BFF

- PostgreSQL com Prisma 7.
- Schema: `apps/bff/prisma/schema.prisma`.
- Migrations: `apps/bff/prisma/migrations/`.
- Client gerado: `apps/bff/src/generated/prisma/`, ignorado pelo Git.
- Entidades centrais: User, UserProfile, WhatsAppInstance, Conversation, Message, UserSettings, BusinessSettings, PersonaConversationImport, IgnoredContact e AiSuppressionLog.

### API

- PostgreSQL com Prisma 6.
- Schema: `apps/api/prisma/schema.prisma`.
- Migrations: `apps/api/prisma/migrations/`.
- Entidades centrais: Conversation, Message, ProcessedEvent, ToolCall, CustomerLink, ExternalAppointment e Handoff.

### Evolution Go

- GORM/PostgreSQL para instancias, mensagens e runtime; banco auth separado.
- O Compose inicializa databases por `apps/api/docker/postgres/evolution-init.sql`.
- SQLite e fallback local quando auth PostgreSQL nao e configurado.

Reset local seguro:

- `docker compose down` para containers sem apagar volumes.
- `docker compose down -v` apaga todos os dados locais dos volumes do projeto. Use somente em ambiente comprovadamente descartavel, depois de inspecionar `docker compose ps` e volumes. Nunca use contra banco compartilhado ou producao.
- Depois de reset intencional: subir bancos, recriar `atendly_bff` e reaplicar as duas suites de migrations.

## Fluxos importantes

### Cadastro e sessao

Frontend `/register` ou `/login` -> proxy Next -> BFF `/auth/*` -> bcrypt + JWT -> cookie `HttpOnly`. Dashboard consulta `/auth/me` e redireciona conforme onboarding.

### Onboarding e WhatsApp

BFF persiste perfil e configuracao, cria instancia no Evolution Go, monta webhook publico, inicia conexao e entrega QR. Cada usuario possui uma instancia.

### Inbox

Webhook Evolution no BFF normaliza evento, persiste conversa/mensagem, aplica lista de ignorados e pausas, registra supressao e despacha API apenas quando IA esta elegivel.

### IA e agendamento

API mapeia payload Evolution, garante idempotencia, agrupa mensagens por debounce, carrega memoria, decide resposta/ferramenta, consulta Minha Agenda e envia pelo provider Evolution.

### Handoff humano

Mensagem manual, comando ou regra de seguranca pausa bot/conversa. BFF e API sincronizam status por rotas internas; retomada deve preservar normalizacao do telefone.

### Health

Worker consulta URLs em `HEALTH_TARGETS` a cada intervalo e registra resultado. Seu `/health` informa saude do processo, nao garante que todos os alvos estejam saudaveis.

## Pontos de atencao

- Evolution Go exige ativacao de licenca na primeira execucao; sem ela `/healthy` retorna `503 LICENSE_REQUIRED` e rotas operacionais ficam bloqueadas.
- OpenAI, Minha Agenda e WhatsApp real exigem credenciais/conta externas. Configure restante localmente e documente o bloqueio; nao invente credenciais.
- O Compose referencia `evoapicloud/evolution-go:latest`; essa imagem pode divergir do codigo vendorizado `0.7.1`. Para reproducibilidade, fixe imagem ou build local somente em mudanca de infra deliberada.
- `scripts/build-all.sh` pressupoe Bash e Go/CGO Linux. Em Windows, valide Node por app e Go em Docker.
- API e BFF compartilham servidor PostgreSQL local no setup sugerido, mas usam databases e schemas Prisma independentes.
- Nao ha seed versionado. Dados de smoke devem usar identificadores claramente locais.
- Audits npm possuem vulnerabilidades conhecidas. Nao corrigir automaticamente; revisar cadeia, exploitabilidade e compatibilidade.
- Smoke real de WhatsApp/Minha Agenda foi dispensado em 2026-06-05; evidencias e gaps estao em `docs/qa/render-smoke-2026-06-05.md`.

## Checklist antes de concluir alteracao

- [ ] Leu `AGENTS.md` aplicavel e arquivos relacionados.
- [ ] Preservou frontend -> BFF -> API/Evolution Go.
- [ ] Validou env sem adicionar segredo ao Git ou logs.
- [ ] Rodou `npm --prefix apps/api test` quando API mudou.
- [ ] Rodou `npm --prefix apps/api run build` quando API mudou.
- [ ] Rodou `npm --prefix apps/bff run check` e `build` quando BFF mudou.
- [ ] Rodou `npm --prefix apps/frontend run lint`, `test` e `build` quando frontend mudou.
- [ ] Rodou `npm --prefix apps/health-worker run check` quando worker mudou.
- [ ] Rodou `go test ./...` em Linux/Docker quando Evolution Go mudou.
- [ ] Aplicou migrations em banco local quando schema mudou.
- [ ] Executou health/smoke proporcional ao fluxo alterado.
- [ ] Nao alterou contrato, regra de negocio, dependencia ou infra fora do escopo.
- [ ] Atualizou documentacao quando setup, contrato ou arquitetura mudou.
