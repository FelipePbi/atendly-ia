-- Goal006 - o Contato do canal passa a referenciar a pessoa do Scheduling.
--
-- Aditiva e retomavel. Coluna opcional, sem backfill: ninguem afirma retro-
-- ativamente para quem eram agendamentos antigos. O binario anterior ignora a
-- coluna, entao esta migration nao tira o rollback de mesa.
--
-- A referencia e por ID e tenant e NAO tem FK: o cliente vive no banco do
-- Scheduling e nenhuma chave estrangeira atravessa bancos.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "customerLinkedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Contact_tenantId_customerId_idx"
    ON "Contact"("tenantId", "customerId");
