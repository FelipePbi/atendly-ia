# Atendly Scheduling Service

Fonte canônica do domínio de agenda da Atendly.

## Estado atual

Fundação do serviço: schema tenant-aware, migration inicial, autenticação interna preparada e `GET /health` com verificação do PostgreSQL.

Ainda não existem CalendarProviders, CRUD de agenda ou integração com frontend. Minha Agenda entra somente no GOAL 05; Agenda Atendly, no GOAL 06.

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

Copie `.env.example` para `.env`. `DATABASE_URL` aponta para banco exclusivo. `INTERNAL_SERVICE_TOKEN` autentica futuras rotas internas.

Rotas internas futuras também exigirão `x-tenant-id`, `x-user-id` e `x-request-id`. `GET /health` permanece público para health checks.

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
