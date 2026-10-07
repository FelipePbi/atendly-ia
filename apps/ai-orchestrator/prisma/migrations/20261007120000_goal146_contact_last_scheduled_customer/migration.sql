-- Goal146, WU-01: a ultima pessoa agendada por um numero, separada de quem
-- escreve por ele.
--
-- ADITIVA: duas colunas anulaveis novas em `Contact`, sem default. Nada e
-- apagado nem renomeado. `customerId` passa a significar "quem escreve por este
-- numero"; as colunas novas guardam "a ultima pessoa agendada", que pode ser um
-- dependente (mae que agenda para o filho).
--
-- BACKFILL: todo contato com vinculo copia `customerId`/`customerLinkedAt` para
-- as colunas novas, e a pessoa provavel de cada contato existente fica como
-- hoje. O vinculo em si nao muda aqui: decidir se ele aponta para um dependente
-- exige ler o Scheduling, e a proxima confirmacao daquele numero o conserta.
--
-- ROLLBACK: as colunas podem ser removidas sem perda alem da ultima pessoa
-- agendada que elas guardam; `customerId` e `customerLinkedAt` seguem intactos.
--
-- RETOMAVEL/IDEMPOTENTE: `IF NOT EXISTS` deixa reaplicar o DDL sem falhar, e o
-- `UPDATE` so toca linhas com `lastScheduledCustomerId` nulo, entao reaplicar
-- nao muda nada.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lastScheduledCustomerId" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lastScheduledAt" TIMESTAMP(3);

UPDATE "Contact"
   SET "lastScheduledCustomerId" = "customerId",
       "lastScheduledAt" = "customerLinkedAt"
 WHERE "customerId" IS NOT NULL
   AND "lastScheduledCustomerId" IS NULL;
