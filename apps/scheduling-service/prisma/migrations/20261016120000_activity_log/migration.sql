-- Registro de atividade do negocio (D-176). So cresce: a trigger recusa
-- UPDATE. DELETE fica liberado apenas para a purga do negocio inteiro
-- (tenantPurge) e para os testes.
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "area" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "details" JSONB,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActivityLog_actor_type_check" CHECK ("actorType" IN ('AI', 'USER')),
    CONSTRAINT "ActivityLog_area_check" CHECK ("area" IN ('AGENDA', 'CUSTOMERS', 'SERVICES', 'SETTINGS', 'IMPORT', 'CONVERSATIONS'))
);

CREATE UNIQUE INDEX "ActivityLog_sequence_key" ON "ActivityLog"("sequence");
CREATE INDEX "ActivityLog_tenantId_occurredAt_sequence_idx" ON "ActivityLog"("tenantId", "occurredAt" DESC, "sequence" DESC);

CREATE FUNCTION "ActivityLog_reject_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ActivityLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityLog_append_only"
BEFORE UPDATE ON "ActivityLog"
FOR EACH ROW EXECUTE FUNCTION "ActivityLog_reject_update"();
