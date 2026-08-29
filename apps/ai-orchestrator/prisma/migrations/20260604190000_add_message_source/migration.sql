CREATE TYPE "MessageSource" AS ENUM ('CUSTOMER', 'AI', 'OWNER');

ALTER TABLE "Message"
  ADD COLUMN "source" "MessageSource";
