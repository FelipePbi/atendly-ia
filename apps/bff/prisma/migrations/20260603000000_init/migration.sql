CREATE TYPE "WhatsAppInstanceStatus" AS ENUM (
  'CREATED',
  'CONNECTING',
  'WAITING_QR',
  'CONNECTED',
  'DISCONNECTED',
  'LOGGED_OUT',
  'QR_EXPIRED',
  'ERROR'
);

CREATE TYPE "MessageType" AS ENUM (
  'TEXT',
  'AUDIO',
  'IMAGE',
  'DOCUMENT',
  'UNKNOWN'
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInstance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "evolutionInstanceId" TEXT,
  "evolutionInstanceName" TEXT NOT NULL,
  "evolutionInstanceToken" TEXT NOT NULL,
  "phoneNumber" TEXT,
  "status" "WhatsAppInstanceStatus" NOT NULL DEFAULT 'CREATED',
  "qrcode" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "contactJid" TEXT NOT NULL,
  "contactName" TEXT,
  "lastMessagePreview" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "fromMe" BOOLEAN NOT NULL DEFAULT false,
  "senderJid" TEXT,
  "senderName" TEXT,
  "type" "MessageType" NOT NULL DEFAULT 'UNKNOWN',
  "contentText" TEXT,
  "mediaType" TEXT,
  "mediaUrl" TEXT,
  "mediaBase64" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "WhatsAppInstance_userId_key" ON "WhatsAppInstance"("userId");
CREATE UNIQUE INDEX "WhatsAppInstance_evolutionInstanceName_key" ON "WhatsAppInstance"("evolutionInstanceName");
CREATE INDEX "WhatsAppInstance_evolutionInstanceId_idx" ON "WhatsAppInstance"("evolutionInstanceId");
CREATE INDEX "WhatsAppInstance_status_idx" ON "WhatsAppInstance"("status");
CREATE UNIQUE INDEX "Conversation_userId_contactJid_key" ON "Conversation"("userId", "contactJid");
CREATE INDEX "Conversation_userId_lastMessageAt_idx" ON "Conversation"("userId", "lastMessageAt");
CREATE INDEX "Conversation_instanceId_idx" ON "Conversation"("instanceId");
CREATE UNIQUE INDEX "Message_conversationId_externalMessageId_key" ON "Message"("conversationId", "externalMessageId");
CREATE INDEX "Message_conversationId_timestamp_idx" ON "Message"("conversationId", "timestamp");
CREATE INDEX "Message_userId_timestamp_idx" ON "Message"("userId", "timestamp");
CREATE INDEX "Message_instanceId_idx" ON "Message"("instanceId");
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

ALTER TABLE "WhatsAppInstance" ADD CONSTRAINT "WhatsAppInstance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
