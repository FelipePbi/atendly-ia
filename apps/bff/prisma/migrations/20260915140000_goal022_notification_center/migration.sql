-- Goal022 - central de notificacoes e alertas persistentes.
--
-- Aditiva. Tres tabelas novas que **nascem vazias**: nenhum UPDATE em linha
-- existente, nenhum backfill, nenhuma coluna removida ou renomeada. Nenhum
-- negocio ganha notificacao retroativa por esta migration — a central nao
-- inventa historia, ela materializa o que as fontes passarem a reportar a
-- partir da primeira reconciliacao (`NotificationSyncState.seededAt`).
--
-- A constraint que sustenta o produto e "TenantNotification_tenantId_dedupeKey_key":
-- a idempotencia da materializacao e **do banco**, nao de verificacao em
-- codigo. Reconciliar a mesma fonte dez vezes produz uma linha porque o
-- segundo INSERT colide com esta chave (ON CONFLICT DO NOTHING), e nao porque
-- alguem lembrou de consultar antes.

CREATE TYPE "NotificationKind" AS ENUM (
  'CUSTOMER_WAITING_HUMAN',
  'REMINDER_FAILED',
  'IMPORT_COMPLETED',
  'AI_APPOINTMENT_CREATED',
  'WHATSAPP_DISCONNECTED',
  'AI_UNAVAILABLE',
  'SETUP_INCOMPLETE'
);

CREATE TYPE "NotificationLevel" AS ENUM ('INFO', 'ATTENTION', 'CRITICAL');

CREATE TYPE "NotificationShape" AS ENUM ('EVENT', 'CONDITION');

-- 1) O registro duravel ------------------------------------------------------
CREATE TABLE "TenantNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "level" "NotificationLevel" NOT NULL,
    "shape" "NotificationShape" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "subjectId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantNotification_tenantId_dedupeKey_key"
    ON "TenantNotification"("tenantId", "dedupeKey");

-- As tres leituras reais da central, nesta ordem: nao lidas por negocio,
-- condicoes abertas por negocio e historico por instante decrescente.
CREATE INDEX "TenantNotification_tenantId_readAt_idx"
    ON "TenantNotification"("tenantId", "readAt");
CREATE INDEX "TenantNotification_tenantId_shape_resolvedAt_idx"
    ON "TenantNotification"("tenantId", "shape", "resolvedAt");
CREATE INDEX "TenantNotification_tenantId_occurredAt_idx"
    ON "TenantNotification"("tenantId", "occurredAt" DESC);

ALTER TABLE "TenantNotification"
    ADD CONSTRAINT "TenantNotification_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) A preferencia humana ----------------------------------------------------
-- Uma linha por negocio, criada sob demanda. A ausencia da linha e o default
-- desligado: negocio sem linha nao recebe AI_APPOINTMENT_CREATED, e ligar a
-- preferencia depois nao faz chover notificacao retroativa.
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aiAppointmentCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_tenantId_key"
    ON "NotificationPreference"("tenantId");

ALTER TABLE "NotificationPreference"
    ADD CONSTRAINT "NotificationPreference_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Throttle e cursores -----------------------------------------------------
-- `seededAt` nasce com o instante da primeira reconciliacao do negocio, e nao
-- com o inicio dos tempos: ligar a central nao pode despejar meses de
-- historico como se fosse novidade.
CREATE TABLE "NotificationSyncState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReconciledAt" TIMESTAMP(3),
    "reminderFailedCursor" TEXT,
    "aiAppointmentEventCursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationSyncState_tenantId_key"
    ON "NotificationSyncState"("tenantId");

ALTER TABLE "NotificationSyncState"
    ADD CONSTRAINT "NotificationSyncState_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
