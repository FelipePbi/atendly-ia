# Atendly Scheduling Service

Fonte canônica do domínio de agenda da Atendly.

## Estado atual

Fonte canônica tenant-aware com `CalendarService`, port `CalendarProvider`, providers Agenda Atendly e Minha Agenda, API interna de calendário e migração assistida persistida. `CalendarSettings.source` seleciona exatamente uma fonte oficial por tenant. Frontend continua sem acesso direto.

## Stack

- Node.js 20+;
- TypeScript strict;
- Fastify 5;
- Zod;
- Prisma 7 + PostgreSQL.

## Ownership

- configurações e origem oficial da agenda;
- conexões de integração;
- clientes e serviços;
- disponibilidade, exceções e bloqueios;
- agendamentos e snapshots de serviço/preço;
- mapeamentos externos e migrações.

Serviço acessa somente banco próprio. BFF, AI Orchestrator e outros serviços usam contratos/clients explícitos nos goals correspondentes.

## Environment

Copie `.env.example` para `.env`. `DATABASE_URL` aponta para banco exclusivo. `INTERNAL_SERVICE_TOKEN` autentica rotas internas. `INTEGRATION_CREDENTIALS_KEY` é chave base64 de 32 bytes usada por AES-256-GCM.

Rotas internas exigem `x-tenant-id`, `x-user-id` e `x-request-id`. Mutations também exigem `Idempotency-Key`. `GET /health` permanece público para health checks.

Credenciais Minha Agenda pertencem a `IntegrationConnection.credentialsEncrypted`; configurações por tenant ficam em `IntegrationConnection.config`:

```json
{
  "baseUrl": "https://api.minhaagendaapp.com.br",
  "employeeId": 123,
  "paymentMethod": "CASH",
  "modelVersion": 2,
  "timeoutMs": 10000,
  "refreshSkewSeconds": 300,
  "enableWrites": false,
  "bufferBetweenServicesMinutes": 0
}
```

Payload cifrado contém `basicAuth`, `username` e `password`. `encryptIntegrationCredentials(tenantId, payload)` produz envelope autenticado e vinculado ao tenant. Nenhuma credencial de tenant é lida de env global.

Agenda Atendly persiste serviços, clientes, disponibilidade e appointments no banco próprio. Clientes usam telefone normalizado com unicidade por tenant. Appointments guardam snapshots de nome, duração, tipo de preço e preço; cancelamento preserva registro e reagendamento troca slot somente após persistência transacional.

## API interna

- `GET /internal/services`
- `GET /internal/appointments`
- `GET /internal/appointments/:id`
- `GET /internal/availability`
- `POST /internal/appointments`
- `POST /internal/appointments/:id/reschedule`
- `POST /internal/appointments/:id/cancel`
- `GET|PATCH /internal/calendar`
- `GET|POST /internal/service-catalog` e `PATCH /internal/service-catalog/:id`
- `GET|POST /internal/customers` e `GET /internal/customers/:id`
- `GET|PATCH /internal/availability-settings`
- `POST /internal/time-blocks` e `DELETE /internal/time-blocks/:id`
- `POST /internal/calendar-integration/connect|reconnect`, `DELETE /internal/calendar-integration` e `GET /internal/calendar-integration`
- `POST /internal/calendar-migrations/diagnose`, `POST /internal/calendar-migrations` e `GET /internal/calendar-migrations/:id`
- `GET /internal/dashboard`

Operações não confirmadas no provider externo retornam capacidade indisponível em vez de inventar sucesso. Troca de origem acontece somente por migração assistida concluída, nunca por `PATCH /internal/calendar`.

Migrações percorrem `PENDING`, `ANALYZING` e `RUNNING`, terminando em `PARTIAL`, `COMPLETED` ou `FAILED`. O diagnóstico informa entidades importáveis, conflitos, avisos e limitações. Na direção Minha Agenda → Agenda Atendly, serviços, clientes, agendamentos futuros e disponibilidade são importados antes do corte transacional; a origem oficial só muda após persistência bem-sucedida. A direção Agenda Atendly → Minha Agenda permanece indisponível enquanto o provider externo não confirmar as capacidades necessárias.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run prisma:generate
npm run prisma:deploy
npm run start
```

Porta padrão: `3003`.
