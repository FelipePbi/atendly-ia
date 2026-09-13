-- Goal012 (WU-01) - conhecimento por servico, memoria do cliente e kind do AiRun.
--
-- Aditiva e retomavel. Nenhuma coluna existente muda de tipo e nenhuma linha e
-- reescrita: `KnowledgeDocument.serviceId` nasce nulo, entao todo documento
-- existente continua geral (sem servico) e ativo; `AiRun.kind` nasce com
-- default `TURN`, entao toda linha historica de turno permanece `TURN` sem
-- backfill explicito. `CustomerMemory` e tabela nova, sem estoque legado.
--
-- DIVERGENCIA DE SCHEMA CONHECIDA: `prisma migrate dev --create-only` contra
-- este schema tambem devolveu `DropForeignKey`/`RenameForeignKey` em
-- `Contact`/`Conversation`/`ConversationSession` e `ALTER COLUMN "updatedAt"
-- DROP DEFAULT` em `Contact`/`ConversationSession` — drift pre-existente entre
-- os nomes de constraint escritos a mao nas migrations dos Goals 005/006 e a
-- convencao do Prisma, sem relacao com este Goal. Essas instrucoes foram
-- removidas deste arquivo de proposito: nao fazem parte do escopo de WU-01 e
-- `prisma migrate diff` vai continuar relatando essa divergencia, como nos
-- Goals 005-011.
--
-- Guards idempotentes (`IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN
-- duplicate_object`), mesmo padrao das migrations de passo unico dos Goals
-- 009 e 011: sem eles, reaplicar este arquivo sobre um estado ja migrado
-- falharia em "already exists", quebrando a retomada que o paragrafo acima
-- ja declara.
DO $$ BEGIN
    CREATE TYPE "CustomerMemoryOrigin" AS ENUM ('CUSTOMER_STATED', 'AI_INFERRED', 'PROFESSIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AiRunKind" AS ENUM ('TURN', 'SUGGESTION', 'SUMMARY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "AiRun" ADD COLUMN IF NOT EXISTS "kind" "AiRunKind" NOT NULL DEFAULT 'TURN';

ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "serviceId" TEXT;
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_tenantId_serviceId_idx" ON "KnowledgeDocument"("tenantId", "serviceId");

CREATE TABLE IF NOT EXISTS "CustomerMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "origin" "CustomerMemoryOrigin" NOT NULL,
    "aiAllowed" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "sourceConversationId" TEXT,
    "sourceMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReinforcedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerMemory_tenantId_id_key" ON "CustomerMemory"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "CustomerMemory_tenantId_customerId_idx" ON "CustomerMemory"("tenantId", "customerId");
CREATE INDEX IF NOT EXISTS "CustomerMemory_tenantId_customerId_removedAt_idx" ON "CustomerMemory"("tenantId", "customerId", "removedAt");
