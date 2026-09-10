-- Goal009 - regras de oferta, buffers, excecoes geridas, series de bloqueio
-- e series de atendimento.
--
-- Aditiva e retomavel, em um passo unico: ao contrario do Goal006/008, nada
-- aqui precisa de uma janela intermediaria entre expansao e corte — todo
-- campo novo nasce com default seguro (o comportamento que o motor ja
-- praticava antes deste Goal) e nenhuma tabela muda de forma incompativel
-- com o binario anterior. Reversao documentada em DATA_MIGRATION.md: o
-- binario anterior continua funcionando enquanto nao existir serie, excecao
-- criada por rota, buffer diferente de zero em snapshot ou regra de oferta
-- diferente do default — a partir dai ele deixa de ser destino seguro porque
-- ignora buffer, antecedencia e serie.
--
-- Nenhuma linha existente muda de horario, ocupacao ou estado: atendimentos
-- existentes recebem snapshot de buffer zero (nao recalculado do catalogo, e
-- e exatamente isso que a ocupacao ja era antes deste Goal), blocos
-- existentes viram `BLOCK` sem serie (era o unico tipo que existia).

-- 1. Enums novos.
DO $$ BEGIN
    CREATE TYPE "TimeBlockKind" AS ENUM ('BLOCK', 'PERSONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BlockSeriesStatus" AS ENUM ('ACTIVE', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Valor novo no enum de efeito idempotente: a serie de atendimento e o efeito
-- de uma unica mutacao (Goal009), e e por ela que a chave idempotente
-- recupera os N atendimentos criados juntos. Aditivo; registro existente
-- continua com o valor que tinha. `IF NOT EXISTS` torna a migration
-- retomavel.
ALTER TYPE "CalendarEffectEntityType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_SERIES';

-- 2. Regras de oferta do negocio em `CalendarSettings`. Defaults iguais ao
--    que o motor ja praticava: sem antecedencia minima, noventa dias de
--    horizonte, passo de trinta minutos.
ALTER TABLE "CalendarSettings"
    ADD COLUMN IF NOT EXISTS "minLeadMinutes"     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "maxLeadDays"        INTEGER NOT NULL DEFAULT 90,
    ADD COLUMN IF NOT EXISTS "granularityMinutes" INTEGER NOT NULL DEFAULT 30;

DO $$ BEGIN
    ALTER TABLE "CalendarSettings" ADD CONSTRAINT "CalendarSettings_offer_rules_check"
        CHECK (
            "granularityMinutes" BETWEEN 5 AND 120
            AND "granularityMinutes" % 5 = 0
            AND "minLeadMinutes" >= 0
            AND "maxLeadDays" > 0
            AND "minLeadMinutes" < "maxLeadDays" * 1440
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Decisao humana explicita na excecao de disponibilidade (Goal009,
--    criterio 4): so preenchida quando uma indisponibilidade que cobre
--    atendimento confirmado foi criada mesmo assim.
ALTER TABLE "AvailabilityException"
    ADD COLUMN IF NOT EXISTS "decidedBy"     TEXT,
    ADD COLUMN IF NOT EXISTS "decidedReason" TEXT;

-- 4. Serie de bloqueio/compromisso: regra semanal, sempre finita por data OU
--    por contagem (nunca as duas, nunca nenhuma).
CREATE TABLE IF NOT EXISTS "BlockSeries" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "kind"            "TimeBlockKind" NOT NULL DEFAULT 'BLOCK',
    "title"           TEXT,
    "daysOfWeek"      INTEGER[] NOT NULL,
    "startTime"       TIME(0) NOT NULL,
    "endTime"         TIME(0) NOT NULL,
    "seriesStartDate" DATE NOT NULL,
    "seriesEndDate"   DATE,
    "occurrenceCount" INTEGER,
    "status"          "BlockSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersededById"  TEXT,
    "createdBy"       TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockSeries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlockSeries_tenantId_id_key" ON "BlockSeries"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "BlockSeries_tenantId_status_idx" ON "BlockSeries"("tenantId", "status");

DO $$ BEGIN
    ALTER TABLE "BlockSeries" ADD CONSTRAINT "BlockSeries_termination_check"
        CHECK (
            ("seriesEndDate" IS NOT NULL AND "occurrenceCount" IS NULL)
            OR ("seriesEndDate" IS NULL AND "occurrenceCount" IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BlockSeries" ADD CONSTRAINT "BlockSeries_occurrenceCount_check"
        CHECK ("occurrenceCount" IS NULL OR "occurrenceCount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BlockSeries" ADD CONSTRAINT "BlockSeries_time_check"
        CHECK ("startTime" < "endTime");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BlockSeries" ADD CONSTRAINT "BlockSeries_daysOfWeek_check"
        CHECK (cardinality("daysOfWeek") > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. `TimeBlock` ganha tipo, titulo e vinculo opcional com uma serie.
--    `BLOCK` e o default: todo bloco anterior a este Goal era um bloqueio
--    operacional, nunca um compromisso pessoal.
ALTER TABLE "TimeBlock"
    ADD COLUMN IF NOT EXISTS "kind"           "TimeBlockKind" NOT NULL DEFAULT 'BLOCK',
    ADD COLUMN IF NOT EXISTS "title"          TEXT,
    ADD COLUMN IF NOT EXISTS "seriesId"       TEXT,
    ADD COLUMN IF NOT EXISTS "occurrenceDate" DATE;

CREATE INDEX IF NOT EXISTS "TimeBlock_tenantId_seriesId_occurrenceDate_idx" ON "TimeBlock"("tenantId", "seriesId", "occurrenceDate");

DO $$ BEGIN
    ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_series_fkey"
        FOREIGN KEY ("tenantId", "seriesId") REFERENCES "BlockSeries"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Serie de atendimento a partir de um servico: so referencia de leitura
--    depois de confirmada.
CREATE TABLE IF NOT EXISTS "AppointmentSeries" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "serviceIds"      JSONB NOT NULL,
    "intervalDays"    INTEGER NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "customerId"      TEXT,
    "createdBy"       TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentSeries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentSeries_tenantId_id_key" ON "AppointmentSeries"("tenantId", "id");

DO $$ BEGIN
    ALTER TABLE "AppointmentSeries" ADD CONSTRAINT "AppointmentSeries_check"
        CHECK ("intervalDays" > 0 AND "occurrenceCount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. `Appointment` ganha snapshot de buffer e referencia de serie. Zero e o
--    valor que a ocupacao ja tinha (buffer sem efeito operacional ate este
--    Goal), entao nenhum atendimento existente muda de ocupacao.
ALTER TABLE "Appointment"
    ADD COLUMN IF NOT EXISTS "bufferBeforeMinutesSnapshot" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "bufferAfterMinutesSnapshot"  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "seriesId"                    TEXT;

CREATE INDEX IF NOT EXISTS "Appointment_tenantId_seriesId_idx" ON "Appointment"("tenantId", "seriesId");

DO $$ BEGIN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_series_fkey"
        FOREIGN KEY ("tenantId", "seriesId") REFERENCES "AppointmentSeries"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_bufferSnapshot_check"
        CHECK ("bufferBeforeMinutesSnapshot" >= 0 AND "bufferAfterMinutesSnapshot" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. `AppointmentHold` ganha buffer proposto, na mesma semantica do
--    snapshot do atendimento (maior buffer entre os servicos propostos).
ALTER TABLE "AppointmentHold"
    ADD COLUMN IF NOT EXISTS "proposedBufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "proposedBufferAfterMinutes"  INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_bufferProposed_check"
        CHECK ("proposedBufferBeforeMinutes" >= 0 AND "proposedBufferAfterMinutes" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
