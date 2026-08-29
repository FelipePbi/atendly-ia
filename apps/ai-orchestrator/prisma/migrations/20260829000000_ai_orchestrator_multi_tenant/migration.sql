-- GOAL 07: isolate AI/conversation data by tenant and channel.
-- Records created before tenant mapping are preserved under an inactive,
-- quarantined channel and are never selected for new inbound traffic.

CREATE TYPE "ChannelProvider" AS ENUM ('EVOLUTION_GO');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');
CREATE TYPE "AiRunStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');
CREATE TYPE "AiTone" AS ENUM ('PROFESSIONAL_OBJECTIVE', 'LIGHT_CLOSE');

CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "externalInstanceId" TEXT NOT NULL,
    "displayName" TEXT,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ChannelConnection" (
    "id",
    "tenantId",
    "userId",
    "provider",
    "externalInstanceId",
    "displayName",
    "status",
    "updatedAt"
) VALUES (
    'legacy-evolution-channel',
    'legacy-unassigned',
    'legacy-unassigned',
    'EVOLUTION_GO',
    'legacy-unassigned',
    'Legacy quarantined data',
    'INACTIVE',
    CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ChannelConnection_provider_externalInstanceId_key"
    ON "ChannelConnection"("provider", "externalInstanceId");
CREATE UNIQUE INDEX "ChannelConnection_tenantId_provider_key"
    ON "ChannelConnection"("tenantId", "provider");
CREATE UNIQUE INDEX "ChannelConnection_tenantId_id_key"
    ON "ChannelConnection"("tenantId", "id");
CREATE INDEX "ChannelConnection_tenantId_status_idx"
    ON "ChannelConnection"("tenantId", "status");

ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_fkey";
ALTER TABLE "ToolCall" DROP CONSTRAINT "ToolCall_conversationId_fkey";
ALTER TABLE "ExternalAppointment"
    DROP CONSTRAINT "ExternalAppointment_conversationId_fkey";
ALTER TABLE "Handoff" DROP CONSTRAINT "Handoff_conversationId_fkey";

DROP INDEX "Conversation_whatsappPhone_key";
ALTER TABLE "Conversation"
    ADD COLUMN "tenantId" TEXT,
    ADD COLUMN "channelId" TEXT,
    ADD COLUMN "externalContactId" TEXT;
UPDATE "Conversation"
SET
    "tenantId" = 'legacy-unassigned',
    "channelId" = 'legacy-evolution-channel',
    "externalContactId" = "whatsappPhone";
ALTER TABLE "Conversation"
    ALTER COLUMN "tenantId" SET NOT NULL,
    ALTER COLUMN "channelId" SET NOT NULL,
    ALTER COLUMN "externalContactId" SET NOT NULL,
    DROP COLUMN "whatsappPhone";
CREATE UNIQUE INDEX "Conversation_tenantId_channelId_externalContactId_key"
    ON "Conversation"("tenantId", "channelId", "externalContactId");
CREATE UNIQUE INDEX "Conversation_tenantId_channelId_id_key"
    ON "Conversation"("tenantId", "channelId", "id");
CREATE INDEX "Conversation_tenantId_status_updatedAt_idx"
    ON "Conversation"("tenantId", "status", "updatedAt");
ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_tenantId_channelId_fkey"
    FOREIGN KEY ("tenantId", "channelId")
    REFERENCES "ChannelConnection"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Message_whatsappMessageId_key";
DROP INDEX "Message_conversationId_createdAt_idx";
ALTER TABLE "Message"
    RENAME COLUMN "whatsappMessageId" TO "externalMessageId";
ALTER TABLE "Message"
    ADD COLUMN "tenantId" TEXT,
    ADD COLUMN "channelId" TEXT;
UPDATE "Message" AS message
SET
    "tenantId" = conversation."tenantId",
    "channelId" = conversation."channelId"
FROM "Conversation" AS conversation
WHERE conversation."id" = message."conversationId";
ALTER TABLE "Message"
    ALTER COLUMN "tenantId" SET NOT NULL,
    ALTER COLUMN "channelId" SET NOT NULL;
CREATE UNIQUE INDEX "Message_tenantId_channelId_externalMessageId_key"
    ON "Message"("tenantId", "channelId", "externalMessageId");
CREATE INDEX "Message_tenantId_conversationId_createdAt_idx"
    ON "Message"("tenantId", "conversationId", "createdAt");
ALTER TABLE "Message"
    ADD CONSTRAINT "Message_tenantId_channelId_fkey"
    FOREIGN KEY ("tenantId", "channelId")
    REFERENCES "ChannelConnection"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message"
    ADD CONSTRAINT "Message_tenantId_channelId_conversationId_fkey"
    FOREIGN KEY ("tenantId", "channelId", "conversationId")
    REFERENCES "Conversation"("tenantId", "channelId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "ProcessedEvent_eventKey_key";
ALTER TABLE "ProcessedEvent"
    ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'legacy-unassigned',
    ADD COLUMN "channelId" TEXT NOT NULL DEFAULT 'legacy-evolution-channel';
ALTER TABLE "ProcessedEvent" DROP COLUMN "provider";
ALTER TABLE "ProcessedEvent"
    ADD COLUMN "provider" "ChannelProvider" NOT NULL DEFAULT 'EVOLUTION_GO';
ALTER TABLE "ProcessedEvent"
    ALTER COLUMN "tenantId" DROP DEFAULT,
    ALTER COLUMN "channelId" DROP DEFAULT,
    ALTER COLUMN "provider" DROP DEFAULT,
    DROP COLUMN "instanceId";
CREATE UNIQUE INDEX "ProcessedEvent_tenantId_provider_eventKey_key"
    ON "ProcessedEvent"("tenantId", "provider", "eventKey");
CREATE INDEX "ProcessedEvent_tenantId_channelId_receivedAt_idx"
    ON "ProcessedEvent"("tenantId", "channelId", "receivedAt");
ALTER TABLE "ProcessedEvent"
    ADD CONSTRAINT "ProcessedEvent_tenantId_channelId_fkey"
    FOREIGN KEY ("tenantId", "channelId")
    REFERENCES "ChannelConnection"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputMessageIds" TEXT[] NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'STARTED',
    "outputText" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiRun_tenantId_id_key" ON "AiRun"("tenantId", "id");
CREATE INDEX "AiRun_tenantId_conversationId_startedAt_idx"
    ON "AiRun"("tenantId", "conversationId", "startedAt");
ALTER TABLE "AiRun"
    ADD CONSTRAINT "AiRun_tenantId_channelId_fkey"
    FOREIGN KEY ("tenantId", "channelId")
    REFERENCES "ChannelConnection"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRun"
    ADD CONSTRAINT "AiRun_tenantId_channelId_conversationId_fkey"
    FOREIGN KEY ("tenantId", "channelId", "conversationId")
    REFERENCES "Conversation"("tenantId", "channelId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AiRun" (
    "id",
    "tenantId",
    "channelId",
    "conversationId",
    "provider",
    "model",
    "promptVersion",
    "inputMessageIds",
    "status",
    "startedAt",
    "completedAt",
    "error"
)
SELECT
    'legacy-run-' || tool_call."id",
    conversation."tenantId",
    conversation."channelId",
    tool_call."conversationId",
    'legacy-openai',
    'unknown',
    'legacy',
    ARRAY[]::TEXT[],
    CASE tool_call."status"::TEXT
        WHEN 'SUCCEEDED' THEN 'SUCCEEDED'::"AiRunStatus"
        WHEN 'FAILED' THEN 'FAILED'::"AiRunStatus"
        ELSE 'STARTED'::"AiRunStatus"
    END,
    tool_call."createdAt",
    tool_call."completedAt",
    tool_call."error"
FROM "ToolCall" AS tool_call
JOIN "Conversation" AS conversation
    ON conversation."id" = tool_call."conversationId";

DROP INDEX "ToolCall_conversationId_createdAt_idx";
ALTER TABLE "ToolCall" RENAME TO "AiToolCall";
ALTER TABLE "AiToolCall"
    ADD COLUMN "tenantId" TEXT,
    ADD COLUMN "aiRunId" TEXT,
    ADD COLUMN "externalCallId" TEXT;
UPDATE "AiToolCall" AS tool_call
SET
    "tenantId" = conversation."tenantId",
    "aiRunId" = 'legacy-run-' || tool_call."id"
FROM "Conversation" AS conversation
WHERE conversation."id" = tool_call."conversationId";
ALTER TABLE "AiToolCall"
    ALTER COLUMN "tenantId" SET NOT NULL,
    ALTER COLUMN "aiRunId" SET NOT NULL,
    DROP COLUMN "conversationId";
ALTER TABLE "AiToolCall"
    RENAME CONSTRAINT "ToolCall_pkey" TO "AiToolCall_pkey";
CREATE INDEX "AiToolCall_tenantId_aiRunId_createdAt_idx"
    ON "AiToolCall"("tenantId", "aiRunId", "createdAt");
ALTER TABLE "AiToolCall"
    ADD CONSTRAINT "AiToolCall_tenantId_aiRunId_fkey"
    FOREIGN KEY ("tenantId", "aiRunId")
    REFERENCES "AiRun"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Handoff_status_createdAt_idx";
DROP INDEX "Handoff_phone_idx";
ALTER TABLE "Handoff" RENAME COLUMN "phone" TO "externalContactId";
ALTER TABLE "Handoff"
    ADD COLUMN "tenantId" TEXT,
    ADD COLUMN "channelId" TEXT;
UPDATE "Handoff" AS handoff
SET
    "tenantId" = COALESCE(conversation."tenantId", 'legacy-unassigned'),
    "channelId" = COALESCE(
        conversation."channelId",
        'legacy-evolution-channel'
    )
FROM "Conversation" AS conversation
WHERE conversation."id" = handoff."conversationId";
UPDATE "Handoff"
SET
    "tenantId" = 'legacy-unassigned',
    "channelId" = 'legacy-evolution-channel'
WHERE "tenantId" IS NULL;
ALTER TABLE "Handoff"
    ALTER COLUMN "tenantId" SET NOT NULL,
    ALTER COLUMN "channelId" SET NOT NULL;
CREATE INDEX "Handoff_tenantId_status_createdAt_idx"
    ON "Handoff"("tenantId", "status", "createdAt");
CREATE INDEX "Handoff_tenantId_channelId_externalContactId_idx"
    ON "Handoff"("tenantId", "channelId", "externalContactId");
ALTER TABLE "Handoff"
    ADD CONSTRAINT "Handoff_tenantId_channelId_fkey"
    FOREIGN KEY ("tenantId", "channelId")
    REFERENCES "ChannelConnection"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Handoff"
    ADD CONSTRAINT "Handoff_tenantId_channelId_conversationId_fkey"
    FOREIGN KEY ("tenantId", "channelId", "conversationId")
    REFERENCES "Conversation"("tenantId", "channelId", "id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "AiTenantConfig" (
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tone" "AiTone" NOT NULL DEFAULT 'LIGHT_CLOSE',
    "promptVersion" TEXT NOT NULL DEFAULT 'scheduling_v1.0.0',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiTenantConfig_pkey" PRIMARY KEY ("tenantId")
);
INSERT INTO "AiTenantConfig" (
    "tenantId",
    "enabled",
    "tone",
    "promptVersion",
    "updatedAt"
) VALUES (
    'legacy-unassigned',
    false,
    'LIGHT_CLOSE',
    'legacy',
    CURRENT_TIMESTAMP
);

DROP TABLE "CustomerLink";
DROP TABLE "ExternalAppointment";
DROP TYPE "AppointmentStatus";
