ALTER TYPE "ExternalEntityType" ADD VALUE IF NOT EXISTS 'AVAILABILITY';

ALTER TABLE "MigrationJob"
  ADD COLUMN "requestedBy" TEXT,
  ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentStep" TEXT,
  ADD COLUMN "summary" JSONB,
  ADD COLUMN "warnings" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "limitations" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessage" TEXT;

UPDATE "MigrationJob"
SET "requestedBy" = 'legacy'
WHERE "requestedBy" IS NULL;

ALTER TABLE "MigrationJob"
  ALTER COLUMN "requestedBy" SET NOT NULL;
