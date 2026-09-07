-- Goal003 - projecao cifrada da credencial de instancia no vinculo de canal.
--
-- Aditiva. Vinculos existentes ficam com credentialVersion 0 e sem cipher ate
-- serem reprovisionados pelo BFF; nesse estado o envio falha explicitamente em
-- vez de recair na chave global.

ALTER TABLE "ChannelConnection" ADD COLUMN "credentialCipher" TEXT;
ALTER TABLE "ChannelConnection" ADD COLUMN "credentialKeyId" TEXT;
ALTER TABLE "ChannelConnection" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChannelConnection" ADD COLUMN "credentialRotatedAt" TIMESTAMP(3);

CREATE INDEX "ChannelConnection_credentialVersion_idx" ON "ChannelConnection"("credentialVersion");
