-- Remove V1-incompatible profile, persona training, ignored contacts and
-- duplicate business settings while preserving the two approved AI tones.
DROP TABLE IF EXISTS "PersonaConversationImport";
DROP TABLE IF EXISTS "IgnoredContact";
DROP TABLE IF EXISTS "UserProfile";
DROP TABLE IF EXISTS "BusinessSettings";

CREATE TYPE "AiTone" AS ENUM ('PROFESSIONAL_OBJECTIVE', 'LIGHT_CLOSE');

CREATE TABLE "AiSettings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "tone" "AiTone",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSettings_tenantId_key" ON "AiSettings"("tenantId");

INSERT INTO "AiSettings" (
  "id",
  "tenantId",
  "enabled",
  "tone",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT ON (membership."tenantId")
  settings."id" || '_' || membership."tenantId",
  membership."tenantId",
  settings."aiEnabled",
  CASE settings."personaType"::text
    WHEN 'CORPORATE' THEN 'PROFESSIONAL_OBJECTIVE'::"AiTone"
    WHEN 'WARM' THEN 'LIGHT_CLOSE'::"AiTone"
    WHEN 'CUSTOM' THEN 'LIGHT_CLOSE'::"AiTone"
    ELSE NULL
  END,
  settings."createdAt",
  settings."updatedAt"
FROM "UserSettings" AS settings
INNER JOIN "TenantMember" AS membership
  ON membership."userId" = settings."userId"
ORDER BY membership."tenantId", membership."createdAt" ASC;

ALTER TABLE "AiSettings"
  ADD CONSTRAINT "AiSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "UserSettings";

DROP TYPE IF EXISTS "UserSex";
DROP TYPE IF EXISTS "IgnoredContactSource";
DROP TYPE IF EXISTS "VirtualAttendantActivationMode";
DROP TYPE IF EXISTS "VirtualAttendantAwayScope";
DROP TYPE IF EXISTS "VirtualAttendantIdentityMode";
DROP TYPE IF EXISTS "VirtualAttendantAssistantSex";
DROP TYPE IF EXISTS "CustomPersonaStatus";
DROP TYPE IF EXISTS "VirtualAttendantPersona";
