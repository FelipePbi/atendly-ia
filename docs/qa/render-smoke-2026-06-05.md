# Render Smoke Test - 2026-06-05

## Escopo validado

- Render repo privado `FelipePbi/atendly-ia` acessivel.
- Repositorio GitHub confirmado como `PRIVATE`.
- Render conseguiu clonar/deployar o repo privado no commit `64fb050` via health-worker.
- Servicos Render em `live`:
  - `atendly-ia-frontend`
  - `atendly-ia-bff`
  - `atendly-ia-api`
  - `atendly-ia-evolution-go`
  - `atendly-ia-health-worker`
- Health checks publicos:
  - `https://atendly-ia-frontend.onrender.com/login` -> `200`
  - `https://atendly-ia-bff.onrender.com/health` -> `200`
  - `https://atendimeto-ia.onrender.com/health` -> `200`
  - `https://evolution-go-4pmo.onrender.com/healthy` -> `200`
  - `https://atendly-ia-health-worker.onrender.com/health` -> `200`
- BFF auth:
  - `POST /auth/register` -> `201`
  - `GET /auth/me` autenticado -> `200`
  - `POST /auth/logout` -> `200`
  - `POST /auth/login` -> `200`
- Frontend proxy auth:
  - `POST /api/auth/register` -> `201`
  - `GET /api/auth/me` autenticado -> `200`
  - `POST /api/auth/logout` -> `200`
  - `POST /api/auth/login` -> `200`
- Sessao expirada:
  - `GET /auth/me` com JWT expirado assinado pelo BFF -> `401 UNAUTHORIZED`
- WhatsApp via BFF e via frontend proxy, sem enviar mensagem real:
  - criar instancia -> `201`
  - conectar -> `200`
  - buscar QR -> `200` com QR presente
  - status -> `200`
  - deletar instancia temporaria -> `200`
- Chamadas sensiveis sem token:
  - `GET /internal/handoffs` na API -> `401`
  - `POST /internal/evolution/dispatch` na API -> `401`
  - `GET /instance/status` no Evolution Go sem `apikey` -> `401`
- Logs do BFF:
  - webhook com `?token=<valor>` aparece no Render como `?token=%5BREDACTED%5D`
  - marker de smoke nao apareceu no log apos o deploy `ea9e799`
- Script automatizado `npm run smoke:render`:
  - modo seguro sem credenciais: 8 checks, 0 falhas.
  - modo mutavel com `RUN_MUTATING=1` e `BFF_DATABASE_URL`: 32 checks, 0 falhas.
- Usuarios e instancias temporarios criados no smoke foram removidos.
- Verificacao no BFF DB confirmou `0` usuarios temporarios `codex-*-smoke-*`.

## Gates locais

- `npm run build:all` passou.
- `npm --prefix apps/api test` passou: 52 testes, 1 integracao readonly da Minha Agenda skipped.
- `npx vitest run tests/integration/minha-agenda.readonly.test.ts` passou com writes forcados para `false`.
- `npm --prefix apps/bff run check` passou.
- `npm run smoke:render` passou em modo seguro.
- `RUN_MUTATING=1 npm run smoke:render` passou usando `BFF_DATABASE_URL` do BFF no Render, sem imprimir segredo.

## Gaps restantes

Nao validado neste smoke por exigir WhatsApp real e/ou chamadas externas de negocio:

- recebimento de mensagem real no WhatsApp;
- envio de resposta real pela IA ao cliente;
- criacao/alteracao real de agendamento na Minha Agenda;

Esses itens seguem como smoke manual final antes de considerar a meta totalmente provada em producao.
