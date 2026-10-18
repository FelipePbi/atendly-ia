-- Cliente desativado (2026-10-18).
--
-- ADITIVA: uma coluna nova, nula. Nulo e ativo; preenchida, a cliente sai da
-- lista principal de Clientes e aparece em "Inativos". Nada mais filtra por
-- ela: agenda, conversa, IA e historico continuam vendo a pessoa.
ALTER TABLE "Customer" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
