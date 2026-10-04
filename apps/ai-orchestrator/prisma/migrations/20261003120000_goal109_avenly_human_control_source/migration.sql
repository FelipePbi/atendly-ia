-- Goal109, WU-01: a tomada de controle pelo painel passa a gravar `AVENLY`.
--
-- RENOMEIA o rotulo do enum, nao acrescenta outro. O PostgreSQL guarda o valor
-- de enum pelo OID, entao `RENAME VALUE` nao reescreve linha nenhuma: toda
-- `ConversationSession.humanHandlingSource` e todo `HumanTakeover.source` que
-- diziam `ATENDLY` passam a ler `AVENLY` sem `UPDATE`. `WHATSAPP` e
-- `BACKFILL` nao mudam.
--
-- A migration do Goal005 nao muda: o Prisma confere o checksum dela.
--
-- RETOMAVEL/IDEMPOTENTE: o rename so roda enquanto o rotulo antigo existe.
-- Reaplicar sobre banco ja migrado nao falha e nao muda nada.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'HumanControlSource'
           AND e.enumlabel = 'ATENDLY'
    ) THEN
        ALTER TYPE "HumanControlSource" RENAME VALUE 'ATENDLY' TO 'AVENLY';
    END IF;
END $$;
