-- Resposta da IA em varias mensagens curtas (decisao de produto 2026-10-11).
--
-- ADITIVA: uma coluna nova em `Message`, com default 0. A resposta continua
-- sendo uma linha so (texto completo, fonte da inbox e do historico da IA); a
-- coluna guarda quantas partes ja sairam, para o retry retomar sem reenviar
-- parte ja enviada.
--
-- ROLLBACK: a coluna pode ser removida sem perda alem do progresso de envios
-- em curso. RETOMAVEL/IDEMPOTENTE: `IF NOT EXISTS`.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveryPartsSent" INTEGER NOT NULL DEFAULT 0;
