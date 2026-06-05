ALTER TABLE "Conversation" ADD COLUMN "profilePictureUrl" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Conversation_userId_archivedAt_lastMessageAt_idx" ON "Conversation"("userId", "archivedAt", "lastMessageAt");
