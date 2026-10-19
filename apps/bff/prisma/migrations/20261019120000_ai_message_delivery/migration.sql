-- D-208: como a plataforma envia as mensagens ao cliente.
--
-- ADITIVA: um tipo novo e uma coluna nova em `AiSettings`, com default
-- `PARTS`. Todo negocio que ja existe passa a receber as mensagens da
-- plataforma em varias partes curtas, que e a escolha do produto; quem
-- preferir volta para uma mensagem so em Configuracoes > IA.
--
-- ROLLBACK: a coluna e o tipo podem ser removidos; o binario anterior nao os
-- le. RETOMAVEL/IDEMPOTENTE: tipo criado so se faltar, `IF NOT EXISTS` na
-- coluna.
DO $$
BEGIN
  CREATE TYPE "AiMessageDelivery" AS ENUM ('PARTS', 'SINGLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "AiSettings" ADD COLUMN IF NOT EXISTS "messageDelivery" "AiMessageDelivery" NOT NULL DEFAULT 'PARTS';
