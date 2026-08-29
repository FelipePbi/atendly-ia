-- Customer identity is tenant-scoped by normalized phone.
ALTER TABLE "Customer" ADD COLUMN "normalizedPhone" TEXT;

UPDATE "Customer"
SET "normalizedPhone" = regexp_replace("phone", '[^0-9]', '', 'g');

ALTER TABLE "Customer" ALTER COLUMN "normalizedPhone" SET NOT NULL;

DROP INDEX "Customer_tenantId_phone_key";
CREATE UNIQUE INDEX "Customer_tenantId_normalizedPhone_key"
ON "Customer"("tenantId", "normalizedPhone");

-- Internal appointments preserve notes while retaining historical rows.
ALTER TABLE "Appointment" ADD COLUMN "comments" TEXT;
