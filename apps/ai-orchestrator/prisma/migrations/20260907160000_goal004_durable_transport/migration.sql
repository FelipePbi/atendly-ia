-- Goal004 - inbox duravel do transporte e estado de entrega das saidas.
--
-- Aditiva e retomavel. Nenhuma coluna existente muda de tipo, nenhuma linha e
-- removida e todo backfill e condicionado ao estado nulo, para poder ser
-- reexecutado sem duplicar efeito. Binario anterior ignora as colunas novas.

CREATE TYPE "InboundEventStatus" AS ENUM (
    'RECEIVED',
    'PROCESSING',
    'DONE',
    'FAILED',
    'IGNORED',
    'LEGACY'
);

CREATE TYPE "MessageDeliveryState" AS ENUM (
    'PENDING',
    'SENT',
    'FAILED',
    'UNKNOWN'
);

-- Inbox: estado de execucao, lease e resultado ao lado do dedupe ja existente.
ALTER TABLE "ProcessedEvent" ADD COLUMN "eventType" TEXT;
ALTER TABLE "ProcessedEvent" ADD COLUMN "conversationKey" TEXT;
ALTER TABLE "ProcessedEvent" ADD COLUMN "status" "InboundEventStatus" NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE "ProcessedEvent" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProcessedEvent" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "ProcessedEvent" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "ProcessedEvent" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "ProcessedEvent" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "ProcessedEvent" ADD COLUMN "supersedeRequestedAt" TIMESTAMP(3);
ALTER TABLE "ProcessedEvent" ADD COLUMN "result" JSONB;
ALTER TABLE "ProcessedEvent" ADD COLUMN "error" TEXT;
ALTER TABLE "ProcessedEvent" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "ProcessedEvent_status_nextAttemptAt_idx" ON "ProcessedEvent"("status", "nextAttemptAt");
CREATE INDEX "ProcessedEvent_status_leaseExpiresAt_idx" ON "ProcessedEvent"("status", "leaseExpiresAt");
CREATE INDEX "ProcessedEvent_conversationKey_status_receivedAt_idx" ON "ProcessedEvent"("conversationKey", "status", "receivedAt");

-- Backfill do estoque legado. Antes deste Goal a linha provava recebimento, nao
-- conclusao; nao ha como saber se o processamento terminou. Ela vira
-- concluido-legado e nunca e reprocessada automaticamente. `completedAt IS NULL`
-- deixa a instrucao idempotente.
UPDATE "ProcessedEvent"
SET "status" = 'LEGACY',
    "completedAt" = "receivedAt"
WHERE "completedAt" IS NULL;

-- Outbox: a saida passa a existir antes do transporte e a carregar seu estado.
ALTER TABLE "Message" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "Message" ADD COLUMN "deliveryState" "MessageDeliveryState";
ALTER TABLE "Message" ADD COLUMN "deliveryDetail" TEXT;
ALTER TABLE "Message" ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN "deliveryUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Message_tenantId_channelId_correlationId_key" ON "Message"("tenantId", "channelId", "correlationId");
CREATE INDEX "Message_tenantId_deliveryState_deliveryUpdatedAt_idx" ON "Message"("tenantId", "deliveryState", "deliveryUpdatedAt");

-- Backfill conservador: OUTBOUND existente nao tem prova de entrega. Fica
-- UNKNOWN com motivo explicito, nunca SENT inventado, e sem correlationId
-- porque nenhum operation-id foi emitido para essas tentativas.
UPDATE "Message"
SET "deliveryState" = 'UNKNOWN',
    "deliveryDetail" = 'legacy_backfill_no_delivery_evidence',
    "deliveryUpdatedAt" = "createdAt"
WHERE "direction" = 'OUTBOUND'
  AND "deliveryState" IS NULL;

-- Goal003, residuo: o indice ja existia na migration daquele Goal, mas nao no
-- schema. Declarado la agora; aqui apenas garantimos convergencia em bases que
-- tenham recebido o schema sem ele.
CREATE INDEX IF NOT EXISTS "ChannelConnection_credentialVersion_idx" ON "ChannelConnection"("credentialVersion");
