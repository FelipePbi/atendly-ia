CREATE TYPE "IgnoredContactSource" AS ENUM (
  'MANUAL',
  'EVOLUTION_CONTACT_IMPORT',
  'WHATSAPP_COMMAND',
  'CHAT_ACTION',
  'AUTO_SAFETY',
  'SYSTEM'
);

CREATE TYPE "AiSuppressionReason" AS ENUM (
  'GLOBAL_AI_DISABLED',
  'IGNORED_CONTACT',
  'GROUP_CHAT',
  'HUMAN_HANDOFF',
  'COMMAND_RECEIVED',
  'INSTANCE_DISCONNECTED'
);

ALTER TABLE "Conversation" ADD COLUMN "aiPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "aiPausedReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "aiPausedUpdatedAt" TIMESTAMP(3);

CREATE TABLE "IgnoredContact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "jid" TEXT NOT NULL,
  "phoneNumber" TEXT,
  "displayName" TEXT,
  "pushName" TEXT,
  "businessName" TEXT,
  "source" "IgnoredContactSource" NOT NULL DEFAULT 'MANUAL',
  "reason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdByMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IgnoredContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSuppressionLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageId" TEXT,
  "contactJid" TEXT NOT NULL,
  "reason" "AiSuppressionReason" NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSuppressionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_userId_aiPaused_idx" ON "Conversation"("userId", "aiPaused");
CREATE UNIQUE INDEX "IgnoredContact_userId_instanceId_jid_key" ON "IgnoredContact"("userId", "instanceId", "jid");
CREATE INDEX "IgnoredContact_userId_instanceId_isActive_idx" ON "IgnoredContact"("userId", "instanceId", "isActive");
CREATE INDEX "IgnoredContact_instanceId_jid_idx" ON "IgnoredContact"("instanceId", "jid");
CREATE INDEX "AiSuppressionLog_userId_instanceId_contactJid_idx" ON "AiSuppressionLog"("userId", "instanceId", "contactJid");
CREATE INDEX "AiSuppressionLog_createdAt_idx" ON "AiSuppressionLog"("createdAt");

ALTER TABLE "IgnoredContact" ADD CONSTRAINT "IgnoredContact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IgnoredContact" ADD CONSTRAINT "IgnoredContact_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSuppressionLog" ADD CONSTRAINT "AiSuppressionLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSuppressionLog" ADD CONSTRAINT "AiSuppressionLog_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSuppressionLog" ADD CONSTRAINT "AiSuppressionLog_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
