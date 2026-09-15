-- Goal023, WU-03: esvaziamento de conteudo das intencoes terminais.
-- Aditiva de indice apenas — nenhuma coluna, tabela ou constraint nova.
-- Retomavel: `IF NOT EXISTS` torna a migration segura sobre banco ja migrado.
--
-- A varredura de retencao filtra por (tenantId, state IN terminal, settledAt
-- < cutoff); nenhum indice existente cobre `settledAt`, so `dueAt`.
CREATE INDEX IF NOT EXISTS "AppointmentNotificationIntent_tenantId_state_settledAt_idx"
    ON "AppointmentNotificationIntent"("tenantId", "state", "settledAt");
