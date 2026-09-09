-- Goal008 - passo de EXPANSAO de transacoes, holds e historico da agenda.
--
-- Aditiva e retomavel. Nenhum atendimento existente muda de horario, acordo
-- ou cliente; nenhum e marcado concluido ou falta por esta migration; nenhum
-- evento retroativo e fabricado. Este passo so acrescenta: duas tabelas
-- novas (hold e evento), colunas opcionais no atendimento e na
-- idempotencia, e as constraints que nao dependem do corte de status do
-- passo seguinte.
--
-- A normalizacao de `Appointment.status` (SCHEDULED -> CONFIRMED) e a
-- constraint que restringe o conjunto de valores ficam na migration
-- SEGUINTE, de proposito: a normalizacao precisa de uma guarda que aborte
-- diante de valor desconhecido, e ela so faz sentido depois que a coluna de
-- status bruto (`statusRaw`, criada aqui) ja existe para preservar o valor
-- anterior. Separar os dois passos deixa o ensaio provar, em momentos
-- distintos, que a expansao nao mexe em nenhuma linha existente e que a
-- normalizacao preserva o bruto e recusa estado desconhecido.
--
-- Divergencia com o Prisma (documentada aqui porque o schema nao a
-- expressa): a obrigatoriedade de `Appointment.title` quando o atendimento
-- nao tem nenhum `AppointmentItem` (atendimento manual excepcional sem
-- servico cadastrado) e uma invariante ENTRE tabelas — Postgres nao permite
-- CHECK referenciando outra tabela. Ela e aplicada por uma constraint
-- trigger DEFERRABLE INITIALLY DEFERRED, que roda no fim da transacao
-- (depois que os `AppointmentItem` da mesma transacao ja foram gravados) e
-- nunca reavalia retroativamente uma linha que nao foi tocada — por isso a
-- criacao da trigger nao pode rejeitar nenhum atendimento existente: hoje
-- todos tem `AppointmentItem` (Goal007: `serviceId` com FK obrigatoria), e
-- essa capacidade de atendimento sem servico so passa a existir a partir
-- deste Goal.
--
-- O binario anterior continua funcionando depois deste passo: nenhuma
-- coluna nova e obrigatoria, e a constraint de status so chega no proximo
-- passo.

-- 1. Enums novos (Goal008).
DO $$ BEGIN
    CREATE TYPE "AppointmentHoldSource" AS ENUM ('AI', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentCompletionOrigin" AS ENUM ('MANUAL', 'AUTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentEventType" AS ENUM (
        'CREATED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW',
        'FINAL_VALUE_SET', 'PRESENCE_CONFIRMED', 'HOLD_CONSUMED', 'OVERLAP_OVERRIDE'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentEventSource" AS ENUM ('AI', 'USER', 'SYSTEM', 'INTEGRATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "CalendarEffectEntityType" AS ENUM ('APPOINTMENT', 'APPOINTMENT_HOLD', 'TIME_BLOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Hold: ocupacao temporaria de um horario em confirmacao. `expiresAt` e
--    TIMESTAMPTZ porque toda avaliacao de vigencia compara com `now()` do
--    banco e precisa continuar correta independente do fuso da sessao.
CREATE TABLE IF NOT EXISTS "AppointmentHold" (
    "id"                      TEXT NOT NULL,
    "tenantId"                TEXT NOT NULL,
    "startAt"                 TIMESTAMP(3) NOT NULL,
    "endAt"                   TIMESTAMP(3) NOT NULL,
    "proposedServiceIds"      JSONB NOT NULL,
    "proposedDurationMinutes" INTEGER NOT NULL,
    "customerId"              TEXT,
    "contactRef"              TEXT,
    "source"                  "AppointmentHoldSource" NOT NULL,
    "expiresAt"               TIMESTAMPTZ(3) NOT NULL,
    "consumedAt"              TIMESTAMP(3),
    "releasedAt"              TIMESTAMP(3),
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentHold_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentHold_tenantId_id_key" ON "AppointmentHold"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "AppointmentHold_tenantId_startAt_endAt_idx" ON "AppointmentHold"("tenantId", "startAt", "endAt");
CREATE INDEX IF NOT EXISTS "AppointmentHold_tenantId_expiresAt_idx" ON "AppointmentHold"("tenantId", "expiresAt");

DO $$ BEGIN
    ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_customer_fkey"
        FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Evento: historico operacional do atendimento, um por mutacao, gravado
--    na mesma transacao do efeito. Nunca apagado nem reescrito.
CREATE TABLE IF NOT EXISTS "AppointmentEvent" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type"          "AppointmentEventType" NOT NULL,
    "source"        "AppointmentEventSource" NOT NULL,
    "actor"         TEXT,
    "reason"        TEXT,
    "before"        JSONB,
    "after"         JSONB,
    "occurredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppointmentEvent_tenantId_appointmentId_occurredAt_idx" ON "AppointmentEvent"("tenantId", "appointmentId", "occurredAt");

DO $$ BEGIN
    ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointment_fkey"
        FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Colunas novas no atendimento: status bruto, titulo (atendimento
--    manual), conclusao (com origem), falta (com observacao), presenca e
--    valor final. Todas opcionais: nenhum atendimento existente muda.
ALTER TABLE "Appointment"
    ADD COLUMN IF NOT EXISTS "statusRaw"           TEXT,
    ADD COLUMN IF NOT EXISTS "title"                TEXT,
    ADD COLUMN IF NOT EXISTS "completedAt"          TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "completedBy"          TEXT,
    ADD COLUMN IF NOT EXISTS "completionOrigin"     "AppointmentCompletionOrigin",
    ADD COLUMN IF NOT EXISTS "noShowAt"             TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "noShowNote"           TEXT,
    ADD COLUMN IF NOT EXISTS "presenceConfirmedAt"  TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "finalValue"           DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS "finalValueSetAt"      TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "finalValueSetBy"      TEXT;

-- 5. Referencia de efeito na idempotencia: id do atendimento, hold ou
--    bloqueio, gravado no mesmo commit do efeito (passo 2 do escopo,
--    fora desta Work Unit). Nula para registros existentes.
ALTER TABLE "CalendarMutationIdempotency"
    ADD COLUMN IF NOT EXISTS "effectEntityType" "CalendarEffectEntityType",
    ADD COLUMN IF NOT EXISTS "effectEntityId"   TEXT;

-- 6. Constraints que nao dependem do corte de status do passo seguinte.
DO $$ BEGIN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_finalValue_check"
        CHECK ("finalValue" IS NULL OR "finalValue" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_expiresAt_check"
        CHECK ("expiresAt" > "startAt");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Titulo obrigatorio quando o atendimento nao tem nenhum item (ver nota
--    de divergencia com o Prisma no cabecalho). `CREATE OR REPLACE
--    FUNCTION` e naturalmente reexecutavel; a trigger e recriada via
--    DROP/CREATE para o mesmo efeito, sem duplicar em uma segunda aplicacao
--    manual deste arquivo.
CREATE OR REPLACE FUNCTION goal008_check_appointment_title() RETURNS TRIGGER AS $BODY$
DECLARE
    item_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO item_count
    FROM "AppointmentItem"
    WHERE "tenantId" = NEW."tenantId" AND "appointmentId" = NEW."id";

    IF item_count = 0 AND NEW."title" IS NULL THEN
        RAISE EXCEPTION 'Appointment % (tenant %) requires a title when it has no AppointmentItem', NEW."id", NEW."tenantId";
    END IF;

    RETURN NEW;
END;
$BODY$ LANGUAGE plpgsql;

-- `UPDATE OF "title"`, nao `UPDATE` puro: restringir aos casos que podem
-- violar a invariante (criacao e mudanca do proprio titulo) evita que uma
-- UPDATE que so toca outras colunas (por exemplo a normalizacao de status do
-- proximo passo) deixe evento de trigger pendente sobre "Appointment" — o
-- que impediria um ALTER TABLE na mesma transacao ("cannot ALTER TABLE
-- because it has pending trigger events").
DROP TRIGGER IF EXISTS "Appointment_title_required_without_items" ON "Appointment";
CREATE CONSTRAINT TRIGGER "Appointment_title_required_without_items"
    AFTER INSERT OR UPDATE OF "title" ON "Appointment"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION goal008_check_appointment_title();
