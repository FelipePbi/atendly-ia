-- Goal064/WU-01 - nome do dono da conta.
--
-- Aditiva: coluna nova, nulavel, sem DEFAULT, sem UPDATE e sem backfill.
-- Toda linha existente nasce com "name" nulo, que significa "nao informado" -
-- nunca um nome inventado por esta migration.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "name" TEXT;
