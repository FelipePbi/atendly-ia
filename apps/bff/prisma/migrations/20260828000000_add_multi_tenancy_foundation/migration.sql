CREATE TYPE "TenantRole" AS ENUM ('OWNER');

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TenantRole" NOT NULL DEFAULT 'OWNER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "businessName" TEXT NOT NULL DEFAULT '',
  "category" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "language" TEXT NOT NULL DEFAULT 'pt-BR',
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantMember_tenantId_userId_key"
  ON "TenantMember"("tenantId", "userId");
CREATE INDEX "TenantMember_userId_idx" ON "TenantMember"("userId");
CREATE UNIQUE INDEX "BusinessProfile_tenantId_key"
  ON "BusinessProfile"("tenantId");

ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stable IDs plus NOT EXISTS/ON CONFLICT make legacy backfill safe to resume.
INSERT INTO "Tenant" ("id", "name", "createdAt", "updatedAt")
SELECT
  'legacy_tenant_' || "User"."id",
  COALESCE(
    NULLIF(BTRIM("UserProfile"."businessName"), ''),
    NULLIF(BTRIM("BusinessSettings"."businessName"), ''),
    NULLIF(SPLIT_PART("User"."email", '@', 1), ''),
    'Novo negócio'
  ),
  "User"."createdAt",
  "User"."updatedAt"
FROM "User"
LEFT JOIN "UserProfile" ON "UserProfile"."userId" = "User"."id"
LEFT JOIN "BusinessSettings" ON "BusinessSettings"."userId" = "User"."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "TenantMember" WHERE "TenantMember"."userId" = "User"."id"
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "TenantMember" ("id", "tenantId", "userId", "role", "createdAt")
SELECT
  'legacy_member_' || "User"."id",
  'legacy_tenant_' || "User"."id",
  "User"."id",
  'OWNER',
  "User"."createdAt"
FROM "User"
WHERE NOT EXISTS (
  SELECT 1 FROM "TenantMember" WHERE "TenantMember"."userId" = "User"."id"
)
ON CONFLICT ("tenantId", "userId") DO NOTHING;

INSERT INTO "BusinessProfile" (
  "id",
  "tenantId",
  "businessName",
  "category",
  "timezone",
  "language",
  "currency",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_business_profile_' || "TenantMember"."tenantId",
  "TenantMember"."tenantId",
  COALESCE(
    NULLIF(BTRIM("UserProfile"."businessName"), ''),
    NULLIF(BTRIM("BusinessSettings"."businessName"), ''),
    ''
  ),
  NULL,
  COALESCE(NULLIF(BTRIM("BusinessSettings"."timezone"), ''), 'America/Sao_Paulo'),
  'pt-BR',
  'BRL',
  "Tenant"."createdAt",
  "Tenant"."updatedAt"
FROM "TenantMember"
JOIN "Tenant" ON "Tenant"."id" = "TenantMember"."tenantId"
LEFT JOIN "UserProfile" ON "UserProfile"."userId" = "TenantMember"."userId"
LEFT JOIN "BusinessSettings" ON "BusinessSettings"."userId" = "TenantMember"."userId"
ON CONFLICT ("tenantId") DO NOTHING;
