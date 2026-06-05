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
- Usuarios e instancias temporarios criados no smoke foram removidos.

## Gates locais

- `npm run build:all` passou.
- `npm --prefix apps/api test` passou: 52 testes, 1 integracao readonly da Minha Agenda skipped.
- `npm --prefix apps/bff run check` passou.

## Gaps restantes

Nao validado neste smoke por exigir WhatsApp real e/ou chamadas externas de negocio:

- recebimento de mensagem real no WhatsApp;
- envio de resposta real pela IA ao cliente;
- agendamento real na Minha Agenda;
- sessao expirada em tempo real.

Esses itens seguem como smoke manual final antes de considerar a meta totalmente provada em producao.
