-- Goal077/WU-01 - espécie nova da central: AI_ACTIVATED.
--
-- Aditiva: só acrescenta valor ao vocabulário fechado de `NotificationKind`.
-- Não remove, não renomeia e não toca em nenhuma linha existente.
ALTER TYPE "NotificationKind" ADD VALUE 'AI_ACTIVATED';
