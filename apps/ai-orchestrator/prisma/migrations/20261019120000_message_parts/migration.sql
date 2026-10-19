-- Mensagens da plataforma em varias partes curtas (D-208).
--
-- ADITIVA: um tipo novo, uma coluna nova em `AiTenantConfig` e uma em
-- `Message`, todas com default. Nada e apagado nem renomeado.
--
-- SEM BACKFILL: todo negocio que ja existe nasce em `PARTS` (a resposta da IA
-- ja saia em partes desde 2026-10-11; lembretes e retorno passam a sair assim
-- tambem), e toda mensagem ja gravada fica com `bodyParts` vazio, que e "uma
-- parte so" — a conversa do app continua mostrando um balao, como antes.
--
-- ROLLBACK: as colunas e o tipo podem ser removidos; o binario anterior nao
-- os le.
--
-- RETOMAVEL/IDEMPOTENTE: o tipo so e criado se nao existir e cada coluna usa
-- `IF NOT EXISTS`.
DO $$
BEGIN
  CREATE TYPE "AiMessageDelivery" AS ENUM ('PARTS', 'SINGLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "AiTenantConfig" ADD COLUMN IF NOT EXISTS "messageDelivery" "AiMessageDelivery" NOT NULL DEFAULT 'PARTS';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "bodyParts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
