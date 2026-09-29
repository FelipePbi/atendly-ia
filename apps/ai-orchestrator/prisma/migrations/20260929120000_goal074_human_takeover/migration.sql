-- Goal074 - registro durável de tomada de controle humano.
--
-- Aditiva: nenhuma coluna existente muda de tipo e nenhuma linha e removida.
-- `HumanTakeover` guarda uma linha por transicao real de IA para humano,
-- escrita por `SessionService.assumeHumanControl` na mesma transacao que
-- atualiza `ConversationSession`. `BACKFILL` nunca grava aqui: reconstroi
-- estado passado, nao uma tomada que aconteceu agora.

CREATE TABLE "HumanTakeover" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "source" "HumanControlSource" NOT NULL,
    "actor" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanTakeover_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HumanTakeover_tenantId_takenAt_idx" ON "HumanTakeover"("tenantId", "takenAt");
CREATE INDEX "HumanTakeover_tenantId_conversationId_takenAt_idx" ON "HumanTakeover"("tenantId", "conversationId", "takenAt");

ALTER TABLE "HumanTakeover" ADD CONSTRAINT "HumanTakeover_session_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "ConversationSession"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
