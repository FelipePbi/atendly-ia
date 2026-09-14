-- Goal013 (WU-02) - kinds de midia, MessageAttachment e purga do base64 do
-- estoque concluido.
--
-- Aditiva e retomavel. `Message.kind` nasce com default 'TEXT', entao toda
-- linha existente continua TEXT sem backfill. `MessageAttachment` e tabela
-- nova, sem estoque legado.
--
-- Guards idempotentes (`IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN
-- duplicate_object`), mesmo padrao das migrations aditivas anteriores: sem
-- eles, reaplicar este arquivo sobre um estado ja migrado falharia em
-- "already exists".
DO $$ BEGIN
    CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'DOCUMENT', 'VIDEO', 'STICKER', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "MessageAttachmentKind" AS ENUM ('AUDIO', 'IMAGE', 'DOCUMENT', 'VIDEO', 'STICKER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "TranscriptStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "kind" "MessageKind" NOT NULL DEFAULT 'TEXT';

CREATE UNIQUE INDEX IF NOT EXISTS "Message_tenantId_id_key" ON "Message"("tenantId", "id");

CREATE TABLE IF NOT EXISTS "MessageAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "MessageAttachmentKind" NOT NULL,
    "mimetype" TEXT,
    "fileName" TEXT,
    "sizeBytes" INTEGER,
    "durationSeconds" INTEGER,
    "mediaUrl" TEXT,
    "tooLarge" BOOLEAN NOT NULL DEFAULT false,
    "transcript" TEXT,
    "transcriptStatus" "TranscriptStatus",
    "transcriptError" TEXT,
    "transcriptProvider" TEXT,
    "transcriptModel" TEXT,
    "transcribedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessageAttachment_tenantId_id_key" ON "MessageAttachment"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "MessageAttachment_tenantId_messageId_idx" ON "MessageAttachment"("tenantId", "messageId");
-- Fila e auditoria de transcricao por tenant: pendente, falha a retomar e
-- pulada por politica (Goal013). Sem ele, so restaria varredura completa da
-- tabela para responder "o que falta transcrever neste tenant".
CREATE INDEX IF NOT EXISTS "MessageAttachment_tenantId_transcriptStatus_idx" ON "MessageAttachment"("tenantId", "transcriptStatus");

DO $$ BEGIN
    ALTER TABLE "MessageAttachment"
        ADD CONSTRAINT "MessageAttachment_tenantId_messageId_fkey"
        FOREIGN KEY ("tenantId", "messageId")
        REFERENCES "Message"("tenantId", "id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: o base64 embutido so serve enquanto o evento esta pendente
-- (RECEIVED/PROCESSING); em qualquer estado concluido (DONE, FAILED, IGNORED)
-- ou legado (LEGACY) ele ja cumpriu o papel e vira so custo e superficie de
-- dado sensivel. Os demais campos do proto de midia (URL, mediaKey,
-- directPath, fileSHA256) sao preservados: sao a chave do download sob
-- demanda do Goal013/WU-03, nao os bytes em si.
UPDATE "ProcessedEvent"
SET "rawPayload" = "rawPayload" #- '{data,Message,base64}'
WHERE "status" IN ('DONE', 'FAILED', 'IGNORED', 'LEGACY')
  AND "rawPayload" #> '{data,Message,base64}' IS NOT NULL;
