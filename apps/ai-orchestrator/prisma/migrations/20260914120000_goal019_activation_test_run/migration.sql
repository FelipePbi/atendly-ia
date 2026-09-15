-- Goal019 (WU-003) - execucao do teste real da IA.
--
-- Estritamente aditiva e retomavel: duas tabelas novas e quatro tipos novos.
-- Nenhuma coluna existente muda de tipo, de default ou de significado, e **nao
-- ha backfill**: tenant que nunca testou continua sem nenhuma linha em
-- `ActivationTestRun`, e isso e "nunca testou", nao "falhou". Fabricar uma
-- execucao aqui seria inventar estado que ninguem produziu.
--
-- Guards idempotentes (`IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN
-- duplicate_object`), mesmo padrao das migrations aditivas anteriores: sem
-- eles, reaplicar este arquivo sobre um estado ja migrado falharia em
-- "already exists".
DO $$ BEGIN
    CREATE TYPE "ActivationTestRunState" AS ENUM ('RUNNING', 'PAUSED_BY_HUMAN', 'SUCCEEDED', 'FAILED', 'DISCARDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ActivationTestStep" AS ENUM ('TEST_NOTICE', 'CLIENT_ASKS_PRICE', 'AI_IDENTIFIES_SERVICE', 'AI_ANSWERS_PRICE', 'CLIENT_ASKS_SLOT', 'AI_CHECKS_AVAILABILITY', 'CLIENT_ACCEPTS_SLOT', 'AI_CONFIRMS_APPOINTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ActivationTestMilestoneName" AS ENUM ('MESSAGE_SENT', 'SERVICE_IDENTIFIED', 'PRICE_INFORMED', 'AVAILABILITY_CHECKED', 'SLOT_SELECTED', 'APPOINTMENT_CONFIRMED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ActivationTestFactKind" AS ENUM ('MESSAGE', 'SERVICE', 'AVAILABILITY', 'APPOINTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ActivationTestRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "state" "ActivationTestRunState" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "currentStep" "ActivationTestStep",
    "completedStep" "ActivationTestStep",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "failedStep" "ActivationTestStep",
    "failureCode" TEXT,
    "failureReason" TEXT,
    "pausedAt" TIMESTAMP(3),
    "pausedByMessageId" TEXT,
    "channelId" TEXT NOT NULL,
    "tenantPhone" TEXT NOT NULL,
    "platformNumber" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT,
    "slotDate" TEXT,
    "slotStartTime" TEXT,
    "conversationId" TEXT,
    "contactId" TEXT,
    "createdMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appointmentId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivationTestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ActivationTestRun_tenantId_id_key" ON "ActivationTestRun"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "ActivationTestRun_tenantId_startedAt_idx" ON "ActivationTestRun"("tenantId", "startedAt");
CREATE INDEX IF NOT EXISTS "ActivationTestRun_tenantId_state_idx" ON "ActivationTestRun"("tenantId", "state");

-- No maximo UMA execucao viva por tenant.
--
-- DIVERGENCIA DE SCHEMA INTENCIONAL: o Prisma nao modela indice unico parcial,
-- entao esta garantia existe so aqui, em SQL, e esta anotada no comentario de
-- `ActivationTestRun` em `schema.prisma` — mesmo padrao do indice de sessao
-- aberta do Goal005. `prisma migrate diff` vai relatar a diferenca; ela e
-- esperada e nao deve ser "corrigida" removendo o indice.
--
-- Sem ele, dois cliques simultaneos em `Iniciar teste` criariam duas execucoes
-- vivas, e a tela passaria a ler uma delas de forma nao deterministica. Com
-- ele, a segunda insercao falha e a aplicacao absorve o conflito devolvendo a
-- recusa `ACTIVATION_TEST_ALREADY_RUNNING`.
CREATE UNIQUE INDEX IF NOT EXISTS "ActivationTestRun_one_live_per_tenant"
    ON "ActivationTestRun"("tenantId")
    WHERE "finishedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "ActivationTestMilestone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "milestone" "ActivationTestMilestoneName" NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NOT NULL nos dois: marco sem fonte nao e "marco incompleto", e um marco
    -- que nao existe. A regra vive no schema para que nem um caminho novo de
    -- codigo consiga afirmar progresso sem o fato que o sustenta.
    "factKind" "ActivationTestFactKind" NOT NULL,
    "factId" TEXT NOT NULL,
    "factDetail" JSONB,

    CONSTRAINT "ActivationTestMilestone_pkey" PRIMARY KEY ("id")
);

-- Um marco por execucao: repetir a observacao do mesmo fato nao duplica
-- progresso nem "reavanca" a tela.
CREATE UNIQUE INDEX IF NOT EXISTS "ActivationTestMilestone_tenantId_runId_milestone_key" ON "ActivationTestMilestone"("tenantId", "runId", "milestone");
CREATE INDEX IF NOT EXISTS "ActivationTestMilestone_tenantId_runId_reachedAt_idx" ON "ActivationTestMilestone"("tenantId", "runId", "reachedAt");

DO $$ BEGIN
    ALTER TABLE "ActivationTestMilestone"
        ADD CONSTRAINT "ActivationTestMilestone_tenantId_runId_fkey"
        FOREIGN KEY ("tenantId", "runId")
        REFERENCES "ActivationTestRun"("tenantId", "id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
