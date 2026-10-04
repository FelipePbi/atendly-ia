-- Goal109, WU-01: o valor gravado da fonte da agenda passa a `AVENLY`.
--
-- RENOMEIA o rotulo do enum, nao acrescenta outro. O PostgreSQL guarda o valor
-- de enum pelo OID, entao `RENAME VALUE` nao reescreve linha nenhuma: toda
-- linha de `CalendarSettings` que dizia `ATENDLY` passa a ler `AVENLY` sem
-- `UPDATE`, `updatedAt` nao se move e `MigrationJob.source`/`target` continuam
-- dizendo de onde para onde a importacao foi (historico preservado, D-026).
-- `ADD VALUE` mais `UPDATE` reescreveria linhas e deixaria dois valores com o
-- mesmo significado.
--
-- A constraint do Goal027 continua valida sem ser recriada: ela compara com o
-- mesmo OID e segue recusando `MINHA_AGENDA` em `CalendarSettings`. So o nome
-- muda, para `CalendarSettings_source_avenly_check`.
--
-- A migration do Goal027 nao muda: o Prisma confere o checksum dela.
--
-- RETOMAVEL/IDEMPOTENTE: cada passo confere o catalogo antes de agir.
-- Reaplicar sobre banco ja migrado nao falha e nao muda nada.

-- 1. Rotulo do enum.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'CalendarSource'
           AND e.enumlabel = 'ATENDLY'
    ) THEN
        ALTER TYPE "CalendarSource" RENAME VALUE 'ATENDLY' TO 'AVENLY';
    END IF;
END $$;

-- 2. Nome da constraint de fonte unica.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = '"CalendarSettings"'::regclass
           AND conname = 'CalendarSettings_source_atendly_check'
    ) THEN
        ALTER TABLE "CalendarSettings"
            RENAME CONSTRAINT "CalendarSettings_source_atendly_check"
            TO "CalendarSettings_source_avenly_check";
    END IF;
END $$;
