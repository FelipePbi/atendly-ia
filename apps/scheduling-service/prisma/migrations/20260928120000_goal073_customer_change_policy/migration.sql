-- Goal073, WU-01: antecedencia minima para o cliente (via IA) alterar o
-- proprio atendimento.
--
-- ADITIVA, SEM BACKFILL: toda linha existente de `CalendarSettings` recebe
-- `customerChangeMinNoticeMinutes = 0`, que e o comportamento que o motor ja
-- praticava (nenhuma restricao). Nenhum negocio ganha restricao nova so por
-- esta migration rodar; a decisao de configurar um prazo continua sendo do
-- negocio, via `PATCH /internal/availability-settings`.
--
-- Teto de 10080 minutos (sete dias): antecedencia maior que isso deixaria de
-- ser "prazo de cancelamento" e passaria a impedir cancelamento pratico para
-- qualquer atendimento marcado dentro da semana.
--
-- RETOMAVEL/IDEMPOTENTE: `ADD COLUMN IF NOT EXISTS` e a guarda
-- `duplicate_object` absorvem reexecucao sem falhar e sem tocar linha.

ALTER TABLE "CalendarSettings"
    ADD COLUMN IF NOT EXISTS "customerChangeMinNoticeMinutes" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    ALTER TABLE "CalendarSettings" ADD CONSTRAINT "CalendarSettings_customerChangeMinNoticeMinutes_check"
        CHECK ("customerChangeMinNoticeMinutes" BETWEEN 0 AND 10080);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
