-- Goal008 - correcao de duas invariantes introduzidas pelo passo de
-- expansao (20260909180000_goal008_agenda_expand).
--
-- Passo proprio, e nao edicao do arquivo anterior, porque aquele passo ja
-- foi aplicado em bancos de ensaio/gate: reescrever uma migration aplicada
-- muda seu checksum e faz `prisma migrate deploy` recusar o banco inteiro.
-- Aditivo e retomavel como os anteriores; nenhuma linha existente muda de
-- horario, acordo, cliente ou estado.
--
-- 1) `AppointmentHold_expiresAt_check` comparava `expiresAt` com `startAt`,
--    o **inicio do horario reservado**. Isso recusava qualquer hold real:
--    um hold vive um TTL curto (cinco minutos por padrao) contado da
--    criacao, enquanto o horario reservado esta quase sempre no futuro
--    distante — reservar amanha as 10h expiraria "antes de comecar" por
--    definicao. A invariante correta e sobre a vida do hold, nao sobre o
--    horario que ele segura: `expiresAt` e posterior ao **inicio do proprio
--    hold**, isto e, `createdAt`.
--
--    `createdAt` e TIMESTAMP (sem fuso, gravado em UTC pelo Prisma) e
--    `expiresAt` e TIMESTAMPTZ, entao a comparacao e feita com
--    `AT TIME ZONE 'UTC'` explicito: a conversao implicita usaria o
--    `TimeZone` da sessao, e uma constraint cujo resultado depende de quem
--    esta conectado nao e uma invariante. `timezone('UTC', timestamp)` e
--    IMMUTABLE, o que a torna valida dentro de um CHECK.
--
-- 2) O intervalo reservado nunca pode ser vazio nem invertido: `endAt` e
--    posterior a `startAt`. Essa e a checagem que o passo anterior queria
--    ter feito sobre `startAt` e nao fez.

ALTER TABLE "AppointmentHold" DROP CONSTRAINT IF EXISTS "AppointmentHold_expiresAt_check";

DO $$ BEGIN
    ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_expiresAt_check"
        CHECK ("expiresAt" > ("createdAt" AT TIME ZONE 'UTC'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_interval_check"
        CHECK ("endAt" > "startAt");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Ordem cronologica nao ambigua do historico (Goal008, criterio 5).
--
--    `occurredAt` tem DEFAULT CURRENT_TIMESTAMP, que em Postgres e o
--    instante de **inicio da transacao**: os eventos gravados juntos por uma
--    mesma mutacao (`CREATED` + `OVERLAP_OVERRIDE` + `HOLD_CONSUMED`)
--    recebem exatamente o mesmo valor, e ordenar so por ele deixa a leitura
--    do historico dependente da ordem fisica das linhas. A sequencia resolve
--    isso sem mentir sobre o instante: `occurredAt` continua sendo quando o
--    efeito aconteceu, e `sequence` desempata pela ordem real de gravacao.
--
--    Sequencia propria com DEFAULT, e nao IDENTITY: a coluna precisa nascer
--    anulavel para que as linhas ja gravadas possam ser preenchidas, e o
--    Postgres so aceita `ADD GENERATED ... AS IDENTITY` sobre coluna que ja
--    seja NOT NULL — o que so e possivel depois do preenchimento. A ordem
--    aqui e a unica que fecha o ciclo: coluna anulavel, sequencia, backfill,
--    default, NOT NULL. `OWNED BY` amarra a sequencia a coluna, entao ela
--    desaparece junto com a tabela e corresponde ao `autoincrement()` que o
--    Prisma declara no schema (mesma convencao de nome, `<tabela>_<coluna>_seq`).
ALTER TABLE "AppointmentEvent"
    ADD COLUMN IF NOT EXISTS "sequence" BIGINT;

CREATE SEQUENCE IF NOT EXISTS "AppointmentEvent_sequence_seq"
    AS BIGINT OWNED BY "AppointmentEvent"."sequence";

-- Backfill das linhas anteriores a esta migration, na ordem em que o
-- Postgres as varre. Nao ha ordem "verdadeira" a recuperar: elas foram
-- gravadas antes de a sequencia existir, e o unico compromisso e que a
-- leitura cronologica pare de depender da ordem fisica daqui em diante.
UPDATE "AppointmentEvent"
SET "sequence" = nextval('"AppointmentEvent_sequence_seq"')
WHERE "sequence" IS NULL;

ALTER TABLE "AppointmentEvent"
    ALTER COLUMN "sequence" SET DEFAULT nextval('"AppointmentEvent_sequence_seq"');
ALTER TABLE "AppointmentEvent" ALTER COLUMN "sequence" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentEvent_sequence_key" ON "AppointmentEvent"("sequence");
CREATE INDEX IF NOT EXISTS "AppointmentEvent_tenantId_appointmentId_sequence_idx" ON "AppointmentEvent"("tenantId", "appointmentId", "sequence");
