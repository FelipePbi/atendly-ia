# Atendly Frontend

Painel web mobile-first para pequenas empresas conectarem um unico WhatsApp, acompanharem conversas recebidas e controlarem quando a IA pode responder automaticamente.

## Stack

- Next.js App Router + React + TypeScript
- Tailwind CSS
- Auth.js/NextAuth Credentials com cookie HttpOnly
- Prisma + PostgreSQL
- Evolution Go server-side
- Render Blueprint

## Variaveis de ambiente

Copie `.env.example` para `.env` em desenvolvimento.

```env
DATABASE_URL=
AUTH_SECRET=
JWT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3001
APP_PUBLIC_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3001
EVOLUTION_GO_BASE_URL=https://evolution-go-4pmo.onrender.com
EVOLUTION_GO_API_KEY=
EVOLUTION_WEBHOOK_SECRET=
BACKEND_API_BASE_URL=http://127.0.0.1:3000
BACKEND_ADMIN_API_TOKEN=
```

`EVOLUTION_GO_API_KEY`, `EVOLUTION_WEBHOOK_SECRET` e `BACKEND_ADMIN_API_TOKEN` nunca devem ser expostos no browser.

## Comandos locais

```bash
npm install
npm run db:generate
npm run db:migrate:dev
npm run dev
```

Em desenvolvimento local, a API Node usa `http://localhost:3000` e o frontend usa `http://localhost:3001`.
Por isso `APP_PUBLIC_URL` e `NEXTAUTH_URL` devem apontar para `http://localhost:3001`; caso contrario o Evolution Go enviara webhooks para a API errada e recebera `404 Not Found`.

Verificacoes usadas nesta V1:

```bash
npm run lint
npm run build
```

## Rotas principais

- `/register`: cadastro com email e senha.
- `/login`: login.
- `/onboarding`: dados iniciais, telefone esperado e conexao por QR Code.
- `/chat`: area principal de atendimento, com menu contextual de conversas.
- `/ia`: controle exclusivo para ativar ou pausar a IA.
- `/settings/account`: dados da conta e troca de senha.
- `/settings/whatsapp`: status, conexao, reconexao e QR Code do WhatsApp.
- `/settings`: redireciona para `/settings/account`.
- `/connect-whatsapp`: rota de compatibilidade que redireciona para `/settings/whatsapp`.

Navegacao V1:

- Header autenticado: logo curto, status do WhatsApp, status da IA e botao de menu no mobile.
- Menu lateral global: Chat, IA, WhatsApp, Conta e Sair.
- Chat: possui menu proprio para Todas, Nao lidas e Arquivadas.

APIs internas:

- `POST /api/auth/register`
- `POST /api/auth/change-password`
- `GET /api/auth/me`
- `GET /api/onboarding`
- `PATCH /api/onboarding/profile`
- `POST /api/onboarding/complete`
- `GET/PATCH /api/user/settings`
- `POST /api/whatsapp/instance`
- `POST /api/whatsapp/connect`
- `GET /api/whatsapp/qr`
- `GET /api/whatsapp/status`
- `POST /api/webhooks/evolution-go?token=<EVOLUTION_WEBHOOK_SECRET>`
- `GET /api/conversations`
- `PATCH /api/conversations/[id]`
- `GET /api/conversations/[id]/messages`
- `POST /api/conversations/[id]/messages`
- `POST /api/conversations/[id]/ai/resume`

## Fluxo Evolution Go

1. O usuario cadastrado entra em `/onboarding`.
2. O frontend cria no maximo uma instancia por usuario em `POST /instance/create`, usando a `EVOLUTION_GO_API_KEY` apenas no servidor.
3. A instancia recebe um token proprio salvo no banco.
4. As chamadas `connect`, `qr`, `status` e `logout` usam o token da instancia no header `apikey`.
5. A conclusao do onboarding exige status `CONNECTED` e numero conectado igual ao WhatsApp informado.
6. O webhook publico salva QR/status/mensagens e repassa mensagens ao backend de IA somente quando `aiEnabled=true`.

## Deploy no Render

O arquivo `render.yaml` cria:

- Web Service Node `whatsapp-ai-inbox-frontend`
- PostgreSQL `whatsapp-ai-inbox-db`
- Auto deploy em commit na branch `main`

Passos:

1. Faça push do repositório para `FelipePbi/whatsapp-ai-inbox-frontend`.
2. Abra o Blueprint no Render:
   `https://dashboard.render.com/blueprint/new?repo=https://github.com/FelipePbi/whatsapp-ai-inbox-frontend`
3. Preencha os segredos marcados como `sync: false`.
4. Após o primeiro deploy, configure `APP_PUBLIC_URL` e `NEXT_PUBLIC_APP_URL` com a URL final do serviço Render.
5. Garanta que o webhook do Evolution Go aponte para:
   `https://<frontend-render-url>/api/webhooks/evolution-go?token=<EVOLUTION_WEBHOOK_SECRET>`

## Observacoes V1

- Cada usuario pode conectar apenas um numero de WhatsApp nesta versao.
- O header e informativo; ativar ou pausar IA acontece apenas em `/ia`.
- Envio manual de mensagens acontece no chat e tenta pausar a IA para atendimento humano.
- A IA real depende de `BACKEND_API_BASE_URL`, `BACKEND_ADMIN_API_TOKEN` e `aiEnabled=true`.
- Nao ha testes automatizados nesta versao.
