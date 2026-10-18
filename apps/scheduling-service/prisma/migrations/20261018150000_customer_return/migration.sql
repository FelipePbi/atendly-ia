-- Retorno de clientes: Renovacao e Resgate (2026-10-18, D-202).
--
-- ADITIVA: tres tipos, tres tabelas novas e tres colunas nulas em "Customer".
-- Nenhuma linha existente muda. Sem linha em "ReturnSettings" valem os
-- padroes do produto; nenhuma rodada existe antes de a profissional aprovar.
-- CreateEnum
CREATE TYPE "ReturnCampaignKind" AS ENUM ('RENEWAL', 'WINBACK');

-- CreateEnum
CREATE TYPE "ReturnCampaignState" AS ENUM ('ACTIVE', 'PAUSED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnTargetState" AS ENUM ('QUEUED', 'CLAIMED', 'SENT', 'REPLIED', 'BOOKED', 'DECLINED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "returnBlockReason" TEXT,
ADD COLUMN     "returnBlockedAt" TIMESTAMP(3),
ADD COLUMN     "returnBlockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReturnSettings" (
    "tenantId" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "windowDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "windowStartMinutes" INTEGER NOT NULL DEFAULT 540,
    "windowEndMinutes" INTEGER NOT NULL DEFAULT 1140,
    "leadDays" INTEGER NOT NULL DEFAULT 2,
    "winbackDays" INTEGER NOT NULL DEFAULT 60,
    "winbackIncentive" TEXT,
    "renewalMessage" TEXT,
    "winbackMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "ReturnCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ReturnCampaignKind" NOT NULL,
    "state" "ReturnCampaignState" NOT NULL DEFAULT 'ACTIVE',
    "dailyLimit" INTEGER NOT NULL,
    "windowDays" INTEGER[],
    "windowStartMinutes" INTEGER NOT NULL,
    "windowEndMinutes" INTEGER NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "incentive" TEXT,
    "messageTemplate" TEXT,
    "weekStart" DATE,
    "winbackDays" INTEGER,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "nextSendNotBefore" TIMESTAMPTZ(3),

    CONSTRAINT "ReturnCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnCampaignTarget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "state" "ReturnTargetState" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "serviceId" TEXT,
    "serviceName" TEXT,
    "expectedDate" DATE,
    "intervalDays" INTEGER,
    "intervalSource" TEXT,
    "lastVisitDate" DATE,
    "sendBy" DATE,
    "plannedDate" DATE,
    "position" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseKind" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "outboundCorrelationId" TEXT,
    "offeredSlots" JSONB,
    "messageBody" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "repliedAt" TIMESTAMPTZ(3),
    "bookedAt" TIMESTAMPTZ(3),
    "appointmentId" TEXT,
    "declinedAt" TIMESTAMPTZ(3),
    "followUpState" TEXT,
    "followUpSentAt" TIMESTAMPTZ(3),
    "settledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnCampaignTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnCampaign_tenantId_state_createdAt_idx" ON "ReturnCampaign"("tenantId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnCampaign_state_idx" ON "ReturnCampaign"("state");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnCampaign_tenantId_id_key" ON "ReturnCampaign"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ReturnCampaignTarget_tenantId_state_idx" ON "ReturnCampaignTarget"("tenantId", "state");

-- CreateIndex
CREATE INDEX "ReturnCampaignTarget_tenantId_customerId_sentAt_idx" ON "ReturnCampaignTarget"("tenantId", "customerId", "sentAt");

-- CreateIndex
CREATE INDEX "ReturnCampaignTarget_state_leaseExpiresAt_idx" ON "ReturnCampaignTarget"("state", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnCampaignTarget_tenantId_id_key" ON "ReturnCampaignTarget"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnCampaignTarget_campaignId_customerId_key" ON "ReturnCampaignTarget"("campaignId", "customerId");

-- AddForeignKey
ALTER TABLE "ReturnCampaignTarget" ADD CONSTRAINT "ReturnCampaignTarget_campaign_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "ReturnCampaign"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCampaignTarget" ADD CONSTRAINT "ReturnCampaignTarget_customer_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Limites do esquema, alem da validacao das rotas.
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_returnBlockReason_check"
  CHECK ("returnBlockReason" IS NULL OR "returnBlockReason" IN ('DECLINED', 'STOPPED', 'OWNER'));

ALTER TABLE "ReturnSettings"
  ADD CONSTRAINT "ReturnSettings_bounds_check"
  CHECK (
    "dailyLimit" BETWEEN 1 AND 30
    AND "leadDays" BETWEEN 1 AND 5
    AND "winbackDays" BETWEEN 14 AND 365
    AND "windowStartMinutes" BETWEEN 0 AND 1439
    AND "windowEndMinutes" BETWEEN 1 AND 1440
    AND "windowStartMinutes" < "windowEndMinutes"
    AND ("winbackIncentive" IS NULL OR char_length("winbackIncentive") BETWEEN 1 AND 300)
    AND ("renewalMessage" IS NULL OR char_length("renewalMessage") BETWEEN 1 AND 600)
    AND ("winbackMessage" IS NULL OR char_length("winbackMessage") BETWEEN 1 AND 600)
  );

ALTER TABLE "ReturnCampaign"
  ADD CONSTRAINT "ReturnCampaign_bounds_check"
  CHECK (
    "dailyLimit" BETWEEN 1 AND 30
    AND "leadDays" BETWEEN 1 AND 5
    AND "windowStartMinutes" < "windowEndMinutes"
    AND ("kind" = 'WINBACK' OR "incentive" IS NULL)
  );
