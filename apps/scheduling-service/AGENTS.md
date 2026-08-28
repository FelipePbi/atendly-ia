# AGENTS.md — Scheduling Service

Leia `/AGENTS.md`, roadmap e goal atual antes de alterar.

## Ownership

Owner exclusivo de calendário, integrações de agenda, clientes, serviços, disponibilidade, bloqueios, appointments e migrações entre fontes.

## Boundaries

- Banco e Prisma próprios; não importe persistence de outro app.
- Toda persistência operacional é tenant-aware.
- Relações entre entidades devem preservar `tenantId`.
- Rotas internas exigem token e contexto confiável de tenant, usuário e request.
- Não exponha API pública ao frontend; frontend fala somente com BFF.
- Não implemente providers, CRUD ou regras de disponibilidade sem goal e consumidor reais.
- Credenciais de integração nunca ficam em plaintext.
