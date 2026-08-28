-- CreateTable
CREATE TABLE "CalendarMutationIdempotency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "lastErrorCode" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarMutationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarMutationIdempotency_tenantId_key_key" ON "CalendarMutationIdempotency"("tenantId", "key");

-- CreateIndex
CREATE INDEX "CalendarMutationIdempotency_tenantId_status_updatedAt_idx" ON "CalendarMutationIdempotency"("tenantId", "status", "updatedAt");
