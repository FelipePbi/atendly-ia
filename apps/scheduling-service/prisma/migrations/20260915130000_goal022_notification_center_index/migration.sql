-- Goal022, WU-01: Central de notificacoes e alertas persistentes.
-- Aditiva de indice apenas — nenhuma coluna, tabela ou constraint nova.
--
-- Feed de compromissos criados pela IA (type=CREATED, source=AI), avancando
-- por `sequence` e atravessando todos os atendimentos do negocio. O indice
-- existente (tenantId, appointmentId, sequence) e por atendimento e nao
-- serve aqui; a leitura das falhas de entrega ja tem indice suficiente em
-- (tenantId, state, dueAt) e nao precisa de um novo.
CREATE INDEX IF NOT EXISTS "AppointmentEvent_tenantId_sequence_idx"
    ON "AppointmentEvent"("tenantId", "sequence");
