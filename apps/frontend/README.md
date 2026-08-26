# Atendly Frontend

Painel web mobile-first para pequenas empresas conectarem um unico WhatsApp, acompanharem conversas recebidas e controlarem quando a IA pode responder automaticamente.

## Stack

- Next.js App Router + React + TypeScript
- Tailwind CSS
- Rotas `/api/*` de compatibilidade que fazem proxy para o BFF
- Render Blueprint pelo monorepo

O frontend nao possui mais banco, Prisma, NextAuth, credenciais da API nem credenciais do Evolution Go. Autenticacao, sessao, onboarding, configuracoes, WhatsApp, inbox, persona e webhook do Evolution Go vivem no BFF.

## Variaveis de ambiente

Copie `.env.example` para `.env` em desenvolvimento.

```env
NEXT_PUBLIC_BFF_URL=http://localhost:3002
BFF_BASE_URL=http://localhost:3002
```

`NEXT_PUBLIC_BFF_URL` e usado pelo browser e por fallback server-side. `BFF_BASE_URL` pode apontar para uma URL interna do BFF no Render quando disponivel.

## Comandos locais

```bash
npm install
npm run dev
```

Verificacoes:

```bash
npm run lint
npm run build
npm test
```

Em desenvolvimento local, o BFF usa `http://localhost:3002` e o frontend usa `http://localhost:3001`.

## Rotas principais

- `/cadastro`: cadastro com email, senha e aceite versionado dos Termos de Uso; `/register` redireciona para esta rota.
- `/termos-de-uso`: template versionado dos Termos de Uso.
- `/politica-de-privacidade`: template versionado da Política de Privacidade.
- `/login`: login.
- `/onboarding`: dados iniciais, telefone esperado e conexao por QR Code.
- `/chat`: area principal de atendimento, com menu contextual de conversas.
- `/ia`: controle exclusivo para ativar ou pausar a IA.
- `/settings/account`: dados da conta e troca de senha.
- `/settings/whatsapp`: status, conexao, reconexao e QR Code do WhatsApp.
- `/settings`: redireciona para `/settings/account`.
- `/connect-whatsapp`: rota de compatibilidade que redireciona para `/settings/whatsapp`.

APIs internas do Next.js sao proxies para o BFF:

- Auth: `/api/auth/*`
- Onboarding: `/api/onboarding/*`
- Usuario: `/api/user/settings`
- WhatsApp: `/api/whatsapp/*`
- Automacao e Atendente Virtual: `/api/automation/*`, `/api/virtual-attendant/*`
- Inbox: `/api/conversations/*`
- Webhook legado: `/api/webhooks/evolution-go`

## Deploy no Render

O servico `atendly-ia-frontend` e criado pelo `render.yaml` da raiz do monorepo.

Configurar no Render:

- `NEXT_PUBLIC_BFF_URL`: URL publica do BFF.
- `BFF_BASE_URL`: URL publica ou privada do BFF usada nas chamadas server-side.
- Variáveis `ATENDLY_LEGAL_*`: identificação, contatos, fornecedores, retenção, foro, aprovação jurídica e estratégia de indexação. Consulte `docs/legal-review-checklist.md`.

O webhook publico do Evolution Go deve apontar para o BFF:

```text
https://<bff-render-url>/api/webhooks/evolution-go?token=<EVOLUTION_WEBHOOK_SECRET>
```

## Observacoes

- Cada usuario pode conectar apenas um numero de WhatsApp nesta versao.
- O header e informativo; ativar ou pausar IA acontece apenas em `/ia`.
- Envio manual de mensagens acontece no chat e tenta pausar a IA para atendimento humano.
