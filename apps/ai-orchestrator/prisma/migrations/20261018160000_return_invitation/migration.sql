-- Convite de retorno enviado (2026-10-18, D-202).
--
-- ADITIVA: uma tabela nova, sem FK para tabela existente e sem backfill.
-- Nenhuma coluna de modelo existente muda. `IF NOT EXISTS` deixa reaplicar
-- sobre banco ja alinhado sem efeito (ensaio de durabilidade do Goal074).
CREATE TABLE IF NOT EXISTS "ReturnInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serviceName" TEXT,
    "expectedDate" TEXT,
    "incentive" TEXT,
    "offeredSlots" JSONB,
    "habit" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "followUpSentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnInvitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReturnInvitation_kind_check" CHECK ("kind" IN ('RENEWAL', 'WINBACK')),
    CONSTRAINT "ReturnInvitation_answer_check" CHECK ("answer" IS NULL OR "answer" IN ('DECLINED', 'STOPPED'))
);

CREATE INDEX IF NOT EXISTS "ReturnInvitation_tenantId_conversationId_sentAt_idx" ON "ReturnInvitation"("tenantId", "conversationId", "sentAt");

CREATE INDEX IF NOT EXISTS "ReturnInvitation_repliedAt_sentAt_idx" ON "ReturnInvitation"("repliedAt", "sentAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ReturnInvitation_tenantId_targetId_key" ON "ReturnInvitation"("tenantId", "targetId");
