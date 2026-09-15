-- Goal023 - prazo de retencao configuravel por negocio (WU-01, G-29).
--
-- Aditiva e retomavel: toda forma usa IF NOT EXISTS (tabela, indice unico e
-- constraint de chave estrangeira), entao reaplicar esta migration sobre um
-- banco ja migrado nao falha. Nenhum UPDATE em linha existente e nenhuma
-- linha e fabricada para negocio nenhum aqui — a tabela nasce vazia, e a
-- ausencia de linha vale como Comercial 90 / Pessoal 30 em codigo
-- (`modules/retention/settings.ts`), nunca por backfill.

CREATE TABLE IF NOT EXISTS "RetentionSettings" (
    "tenantId" TEXT NOT NULL,
    "commercialRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "personalRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionSettings_pkey" PRIMARY KEY ("tenantId")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RetentionSettings_tenantId_fkey'
    ) THEN
        ALTER TABLE "RetentionSettings"
            ADD CONSTRAINT "RetentionSettings_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- `updatedBy` chegou depois do primeiro desenho desta migration: banco que ja
-- a tinha aplicado sem a coluna ganha a coluna aqui, sem reescrever historico
-- e sem UPDATE em linha existente. Nulavel de proposito — linha gravada antes
-- da coluna existir nao tem autor para inventar, e a ausencia de linha
-- continua valendo como o default do produto.
ALTER TABLE "RetentionSettings" ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;
