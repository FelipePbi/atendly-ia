-- CreateEnum
CREATE TYPE "CalendarSource" AS ENUM ('ATENDLY', 'MINHA_AGENDA');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('MINHA_AGENDA');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('AI', 'USER', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "ExternalEntityType" AS ENUM ('SERVICE', 'CUSTOMER', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'ON_REQUEST');

-- CreateTable
CREATE TABLE "CalendarSettings" (
    "tenantId" TEXT NOT NULL,
    "source" "CalendarSource" NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" TEXT NOT NULL,
    "credentialsEncrypted" BYTEA NOT NULL,
    "config" JSONB NOT NULL,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceType" "PriceType" NOT NULL,
    "price" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIME(0),
    "endTime" TIME(0),
    "available" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" "AppointmentSource" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceNameSnapshot" TEXT NOT NULL,
    "durationMinutesSnapshot" INTEGER NOT NULL,
    "priceTypeSnapshot" "PriceType" NOT NULL,
    "priceSnapshot" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEntityMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "entityType" "ExternalEntityType" NOT NULL,
    "internalId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEntityMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "CalendarSource" NOT NULL,
    "target" "CalendarSource" NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationConflict" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "migrationJobId" TEXT NOT NULL,
    "entityType" "ExternalEntityType" NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConnection_tenantId_status_idx" ON "IntegrationConnection"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_key" ON "IntegrationConnection"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_id_key" ON "Customer"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Service_tenantId_active_name_idx" ON "Service"("tenantId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_tenantId_id_key" ON "Service"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AvailabilityRule_tenantId_dayOfWeek_active_idx" ON "AvailabilityRule"("tenantId", "dayOfWeek", "active");

-- CreateIndex
CREATE INDEX "AvailabilityException_tenantId_date_idx" ON "AvailabilityException"("tenantId", "date");

-- CreateIndex
CREATE INDEX "TimeBlock_tenantId_startAt_endAt_idx" ON "TimeBlock"("tenantId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_startAt_endAt_idx" ON "Appointment"("tenantId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_customerId_startAt_idx" ON "Appointment"("tenantId", "customerId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_status_startAt_idx" ON "Appointment"("tenantId", "status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_tenantId_id_key" ON "Appointment"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AppointmentItem_tenantId_appointmentId_idx" ON "AppointmentItem"("tenantId", "appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentItem_tenantId_serviceId_idx" ON "AppointmentItem"("tenantId", "serviceId");

-- CreateIndex
CREATE INDEX "ExternalEntityMap_tenantId_provider_entityType_internalId_idx" ON "ExternalEntityMap"("tenantId", "provider", "entityType", "internalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEntityMap_tenantId_provider_entityType_externalId_key" ON "ExternalEntityMap"("tenantId", "provider", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "MigrationJob_tenantId_status_createdAt_idx" ON "MigrationJob"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationJob_tenantId_id_key" ON "MigrationJob"("tenantId", "id");

-- CreateIndex
CREATE INDEX "MigrationConflict_tenantId_migrationJobId_status_idx" ON "MigrationConflict"("tenantId", "migrationJobId", "status");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_tenantId_appointmentId_fkey" FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId", "serviceId") REFERENCES "Service"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationConflict" ADD CONSTRAINT "MigrationConflict_tenantId_migrationJobId_fkey" FOREIGN KEY ("tenantId", "migrationJobId") REFERENCES "MigrationJob"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants
ALTER TABLE "Service" ADD CONSTRAINT "Service_durationMinutes_check"
CHECK ("durationMinutes" > 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_price_check"
CHECK (
    ("priceType" = 'FIXED' AND "price" IS NOT NULL AND "price" >= 0)
    OR ("priceType" = 'ON_REQUEST' AND "price" IS NULL)
);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_dayOfWeek_check"
CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_timeRange_check"
CHECK ("startTime" < "endTime");
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_timeRange_check"
CHECK (
    ("startTime" IS NULL AND "endTime" IS NULL)
    OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "startTime" < "endTime")
);
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_timeRange_check"
CHECK ("startAt" < "endAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_timeRange_check"
CHECK ("startAt" < "endAt");
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_durationMinutesSnapshot_check"
CHECK ("durationMinutesSnapshot" > 0);
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_priceSnapshot_check"
CHECK (
    ("priceTypeSnapshot" = 'FIXED' AND "priceSnapshot" IS NOT NULL AND "priceSnapshot" >= 0)
    OR ("priceTypeSnapshot" = 'ON_REQUEST' AND "priceSnapshot" IS NULL)
);
ALTER TABLE "MigrationJob" ADD CONSTRAINT "MigrationJob_sources_check"
CHECK ("source" <> "target");
