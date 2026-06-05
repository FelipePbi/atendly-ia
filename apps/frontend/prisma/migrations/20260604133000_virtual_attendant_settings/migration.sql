CREATE TYPE "VirtualAttendantPersona" AS ENUM (
  'CORPORATE',
  'WARM',
  'CUSTOM'
);

CREATE TYPE "VirtualAttendantActivationMode" AS ENUM (
  'ALWAYS',
  'AWAY_FROM_WHATSAPP'
);

CREATE TYPE "VirtualAttendantAwayScope" AS ENUM (
  'GLOBAL',
  'CONVERSATION'
);

CREATE TYPE "CustomPersonaStatus" AS ENUM (
  'NOT_STARTED',
  'WAITING_UPLOADS',
  'PROCESSING',
  'READY',
  'FAILED',
  'NEEDS_PARTICIPANT'
);

ALTER TYPE "AiSuppressionReason" ADD VALUE IF NOT EXISTS 'VIRTUAL_ATTENDANT_INCOMPLETE';
ALTER TYPE "AiSuppressionReason" ADD VALUE IF NOT EXISTS 'AWAY_TIMEOUT_NOT_REACHED';

ALTER TABLE "UserSettings"
  ADD COLUMN "assistantName" TEXT,
  ADD COLUMN "personaType" "VirtualAttendantPersona",
  ADD COLUMN "customInstructions" TEXT,
  ADD COLUMN "activationMode" "VirtualAttendantActivationMode" NOT NULL DEFAULT 'ALWAYS',
  ADD COLUMN "awayTimeoutMinutes" INTEGER,
  ADD COLUMN "awayScope" "VirtualAttendantAwayScope",
  ADD COLUMN "customPersonaStatus" "CustomPersonaStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "customPersonaProfileJson" JSONB,
  ADD COLUMN "customPersonaGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "virtualAttendantOnboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WhatsAppInstance"
  ADD COLUMN "lastOwnerActivityAt" TIMESTAMP(3);

ALTER TABLE "Conversation"
  ADD COLUMN "lastOwnerActivityAt" TIMESTAMP(3);

CREATE TABLE "PersonaConversationImport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER,
  "status" "CustomPersonaStatus" NOT NULL DEFAULT 'PROCESSING',
  "extractedCount" INTEGER,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaConversationImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonaConversationImport_userId_createdAt_idx" ON "PersonaConversationImport"("userId", "createdAt");

ALTER TABLE "PersonaConversationImport" ADD CONSTRAINT "PersonaConversationImport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
