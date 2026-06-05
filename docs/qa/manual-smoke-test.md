# Smoke Test Manual

Resultado parcial em Render: ver `docs/qa/render-smoke-2026-06-05.md`.

## Local

1. API
   - `cd apps/api`
   - `npm run build`
   - `npm start`
   - Validar `GET /health`.

2. BFF
   - `cd apps/bff`
   - `npm run build`
   - `npm start`
   - Validar `GET /health`.
   - Validar `POST /auth/register`.
   - Validar `POST /auth/login`.
   - Validar cookie `HttpOnly`.
   - Validar `GET /auth/me`.

3. Frontend
   - `cd apps/frontend`
   - `npm run build`
   - `npm run start`
   - Validar `/login`, `/register`, `/onboarding`, `/settings/whatsapp`.

4. Evolution Go
   - `cd apps/evolution-go`
   - `go test ./...`
   - Validar `GET /healthy`.

5. Health worker
   - `cd apps/health-worker`
   - `npm run check`
   - Rodar com `HEALTH_TARGETS` apontando para os servicos locais.

## Staging Render

### Automatizado

Smoke seguro, sem criar dados:

```bash
npm run smoke:render
```

Smoke mutavel, criando e removendo usuarios/instancias temporarios:

```bash
RUN_MUTATING=1 BFF_DATABASE_URL=<bff-database-url> npm run smoke:render
```

O smoke mutavel valida auth pelo BFF, auth pelo proxy do frontend, criacao/conexao/QR/status/delete de instancia WhatsApp pelo BFF e pelo proxy do frontend. Ele nao envia mensagem WhatsApp real e nao escreve na Minha Agenda.

### Manual

1. Publicar BFF.
2. Validar `/health`.
3. Criar usuario pelo BFF.
4. Fazer login pelo BFF.
5. Validar `/auth/me`.
6. Criar instancia WhatsApp pelo BFF.
7. Conectar e buscar QR.
8. Validar status da instancia.
9. Validar API `/health`.
10. Validar Evolution Go `/healthy`.
11. Validar health-worker monitorando frontend, BFF, API e Evolution Go.

## Antes de producao

- Confirmar que o frontend nao carrega URLs diretas da API/Evolution Go.
- Confirmar que segredos existem apenas no Render.
- Confirmar que webhooks publicos continuam funcionando.
- Confirmar que a API ainda processa IA e agendamentos.
