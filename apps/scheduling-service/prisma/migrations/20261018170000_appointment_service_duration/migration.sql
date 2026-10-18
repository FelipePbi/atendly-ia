-- Duracao do servico por atendimento (2026-10-18, D-207).
--
-- ADITIVA. `AppointmentItem.durationMinutesSnapshot` ja era a duracao
-- combinada de cada servico no atendimento; agora ela pode diferir do padrao
-- do catalogo (um caso especial de 60 min num servico de 40). A coluna nova
-- guarda o padrao do catalogo no instante em que o item nasceu, para a tela
-- mostrar "60 min · padrao 40 min" sem reler o catalogo, que pode ter mudado.
-- Os itens existentes nasceram com o padrao: o preenchimento copia a duracao
-- gravada, entao nenhum atendimento antigo aparece como ajustado.
ALTER TABLE "AppointmentItem" ADD COLUMN "defaultDurationMinutesSnapshot" INTEGER;

UPDATE "AppointmentItem"
SET "defaultDurationMinutesSnapshot" = "durationMinutesSnapshot"
WHERE "durationMinutesSnapshot" IS NOT NULL;

ALTER TABLE "AppointmentItem"
  ADD CONSTRAINT "AppointmentItem_defaultDurationMinutesSnapshot_check"
  CHECK ("defaultDurationMinutesSnapshot" IS NULL OR "defaultDurationMinutesSnapshot" > 0);

-- O hold guarda os ajustes da proposta: a serie de atendimento cria os itens
-- a partir do hold, e e dele que sai a duracao de cada servico. Nulo quando
-- todos os servicos usam o padrao.
ALTER TABLE "AppointmentHold" ADD COLUMN "proposedServiceDurations" JSONB;

-- Evento proprio no historico do atendimento: o inicio fica, o fim muda.
ALTER TYPE "AppointmentEventType" ADD VALUE IF NOT EXISTS 'DURATION_CHANGED';
