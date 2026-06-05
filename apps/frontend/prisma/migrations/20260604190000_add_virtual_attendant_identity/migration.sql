CREATE TYPE "VirtualAttendantIdentityMode" AS ENUM ('PROFESSIONAL', 'SEPARATE_ASSISTANT');

CREATE TYPE "VirtualAttendantAssistantSex" AS ENUM ('FEMALE', 'MALE');

ALTER TABLE "UserSettings"
  ADD COLUMN "identityMode" "VirtualAttendantIdentityMode" NOT NULL DEFAULT 'PROFESSIONAL',
  ADD COLUMN "assistantSex" "VirtualAttendantAssistantSex";
