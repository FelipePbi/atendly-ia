-- Modo sandbox por negocio (D-199): ligado, a saida para o WhatsApp de quem
-- nao esta nas excecoes e gravada como enviada sem chamar o Evolution Go.
--
-- ADITIVA: tres colunas novas em `AiTenantConfig`, todas com default. Nada e
-- apagado nem renomeado.
--
-- SEM BACKFILL: todo negocio que ja existe nasce com o sandbox desligado e sem
-- excecoes, que e exatamente o comportamento de antes desta migration.
--
-- ROLLBACK: as colunas podem ser removidas; o binario anterior nao as le.
--
-- RETOMAVEL/IDEMPOTENTE: `IF NOT EXISTS` em cada coluna.
ALTER TABLE "AiTenantConfig" ADD COLUMN IF NOT EXISTS "sandboxEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiTenantConfig" ADD COLUMN IF NOT EXISTS "sandboxExceptionPhones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AiTenantConfig" ADD COLUMN IF NOT EXISTS "sandboxUpdatedAt" TIMESTAMP(3);
