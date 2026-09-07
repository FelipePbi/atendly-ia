-- Goal003 — expansão: identidade de sessão revogável e vínculo tenant/instância.
--
-- Esta migration é aditiva. Ela não remove coluna, não reescreve migration
-- aplicada e não exige janela de indisponibilidade: o backfill do vínculo só
-- toca linhas com proveniência inequívoca e o restante permanece pendente e
-- inutilizável, nunca atribuído por fallback a outro negócio.

-- 1) Sessões revogáveis -------------------------------------------------------
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

ALTER TABLE "UserSession"
    ADD CONSTRAINT "UserSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Vínculo explícito da instância WhatsApp com o negócio ---------------------
ALTER TABLE "WhatsAppInstance" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "WhatsAppInstance" ADD COLUMN "credentialKeyId" TEXT;
ALTER TABLE "WhatsAppInstance" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WhatsAppInstance" ADD COLUMN "credentialRotatedAt" TIMESTAMP(3);

-- Backfill retomável e idempotente. Só recebe dono a instância cujo usuário tem
-- exatamente uma associação E cujo tenant resultante não é disputado por outra
-- instância. Duplicidade e órfão continuam NULL: pendência segura, não fallback.
WITH candidate AS (
    SELECT wi."id" AS instance_id, m."tenantId" AS tenant_id
    FROM "WhatsAppInstance" wi
    JOIN "TenantMember" m ON m."userId" = wi."userId"
    WHERE wi."tenantId" IS NULL
      AND (SELECT COUNT(*) FROM "TenantMember" m2 WHERE m2."userId" = wi."userId") = 1
),
unambiguous AS (
    SELECT tenant_id, MIN(instance_id) AS instance_id
    FROM candidate
    GROUP BY tenant_id
    HAVING COUNT(*) = 1
)
UPDATE "WhatsAppInstance" wi
SET "tenantId" = u.tenant_id
FROM unambiguous u
WHERE wi."id" = u.instance_id;

-- Cardinalidade aplicada depois do backfill: um número por negócio.
CREATE UNIQUE INDEX "WhatsAppInstance_tenantId_key" ON "WhatsAppInstance"("tenantId");
CREATE INDEX "WhatsAppInstance_credentialVersion_idx" ON "WhatsAppInstance"("credentialVersion");

ALTER TABLE "WhatsAppInstance"
    ADD CONSTRAINT "WhatsAppInstance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
