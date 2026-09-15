-- Goal019 (WU-004) - remocao dos dados de teste.
--
-- Estritamente aditiva e retomavel: um tipo novo e cinco colunas novas em
-- `ActivationTestRun`. Nenhuma coluna existente muda de tipo, de default ou de
-- significado, e **nao ha backfill** — execucao anterior a esta migration fica
-- com `cleanupState = 'PENDING'`, que e a verdade sobre ela: ninguem limpou.
-- Marcar as antigas como `CLEAN` seria afirmar uma limpeza que nao aconteceu.
--
-- Guards idempotentes, mesmo padrao das migrations aditivas anteriores.
DO $$ BEGIN
    CREATE TYPE "ActivationTestCleanupState" AS ENUM ('PENDING', 'CLEAN', 'RESIDUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `createdConversationId` / `createdContactId`: o que esta execucao **criou**,
-- nao o que ela encontrou. `conversationId`/`contactId` continuam sendo o alvo
-- por onde a execucao conversa e podem apontar para linha preexistente; so as
-- colunas abaixo autorizam remocao. Sem essa separacao, uma conversa que ja
-- existia com o numero da plataforma seria apagada por uma execucao que nao a
-- criou.
ALTER TABLE "ActivationTestRun"
    ADD COLUMN IF NOT EXISTS "createdConversationId" TEXT,
    ADD COLUMN IF NOT EXISTS "createdContactId" TEXT,
    ADD COLUMN IF NOT EXISTS "cleanupState" "ActivationTestCleanupState" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "cleanupAt" TIMESTAMP(3),
    -- O residuo e a lista do que ficou, com o ID gravado e a razao. `NULL`
    -- significa "nao ha registro de limpeza", nao "nada ficou": quem responde
    -- por isso e `cleanupState`.
    ADD COLUMN IF NOT EXISTS "cleanupResidue" JSONB;

-- Execucao terminada que ainda nao foi limpa e a pergunta operacional do
-- residuo ("o que ficou para tras?"), entao ela tem indice proprio.
CREATE INDEX IF NOT EXISTS "ActivationTestRun_tenantId_cleanupState_idx"
    ON "ActivationTestRun"("tenantId", "cleanupState");
