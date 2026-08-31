ALTER TABLE "IgnoredContact" DROP COLUMN "createdByMessageId";

DROP TABLE "AiSuppressionLog";
DROP TABLE "Message";
DROP TABLE "Conversation";

DROP TYPE "AiSuppressionReason";
DROP TYPE "MessageType";
