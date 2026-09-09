-- Goal008 - passo de NORMALIZACAO de `Appointment.status`.
--
-- So pode rodar depois do passo de expansao anterior: e ele que cria a
-- coluna `statusRaw` onde o valor bruto e preservado. Antes de tocar
-- qualquer linha, uma guarda aborta a migration inteira se existir um
-- status fora do universo conhecido — o par legado `SCHEDULED`/`CANCELLED`
-- (o unico gravado pelo codigo ate este Goal, ver `provider.ts` nos dois
-- integradores) UNIDO aos quatro estados do produto que esta propria
-- migration introduz. Sem essa guarda, um valor inesperado seria
-- silenciosamente perdido pela normalizacao; com ela, a migration falha e
-- exige inventario antes de prosseguir, sem inventar estado. A guarda
-- tolerar os estados do produto (nao so o par legado) e o que torna esta
-- migration retomavel: numa segunda aplicacao, depois que `SCHEDULED` ja
-- virou `CONFIRMED`, a guarda nao pode se recusar a rodar so porque o
-- proprio resultado do passo anterior deixou de ser `SCHEDULED`/`CANCELLED`.
--
-- Mapeamento: `SCHEDULED` -> `CONFIRMED` (estados do produto comecam
-- confirmados, nunca em rascunho); `CANCELLED` mantido. O bruto anterior
-- (o texto exatamente como estava gravado) vai para `statusRaw` em toda
-- linha, inclusive `CANCELLED`, que nao muda de valor em `status` mas ainda
-- assim registra o bruto para auditoria uniforme.
--
-- As duas UPDATEs sao retomaveis: a primeira so toca linha com
-- `statusRaw IS NULL`, a segunda so toca linha com `status = 'SCHEDULED'`
-- (nenhuma linha correspondera na segunda vez, depois da primeira
-- aplicacao). A constraint e adicionada dentro de um bloco que ignora
-- `duplicate_object`, pelo mesmo motivo.
--
-- Nenhum atendimento muda de horario, acordo ou cliente; nenhum e marcado
-- concluido ou falta; nenhum evento retroativo e fabricado. Sem backfill de
-- concluido pela data.
--
-- Reversao: o binario anterior a este Goal continua funcionando enquanto
-- nao existirem holds, eventos ou estados `COMPLETED`/`NO_SHOW` — ele grava
-- `SCHEDULED` e ignora hold. Assim que qualquer um desses aparecer, a
-- versao anterior deixa de ser destino seguro de rollback (ela nao sabe
-- validar os quatro estados do produto nem tratar hold como ocupacao).

-- 1. Guarda: aborta a transacao inteira (nenhuma UPDATE nem a constraint
--    abaixo chega a rodar) se existir um valor fora do par legado OU dos
--    quatro estados do produto — o segundo ramo e o que permite reaplicar
--    esta migration depois de um sucesso anterior sem falso positivo.
DO $$
DECLARE
    unknown_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO unknown_count
    FROM "Appointment"
    WHERE "status" NOT IN ('SCHEDULED', 'CANCELLED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW');

    IF unknown_count > 0 THEN
        RAISE EXCEPTION 'goal008: % appointment(s) have a status outside SCHEDULED/CANCELLED/CONFIRMED/COMPLETED/NO_SHOW; inventory required before normalization', unknown_count;
    END IF;
END $$;

-- 2. Bruto preservado para toda linha, antes de qualquer normalizacao.
UPDATE "Appointment" SET "statusRaw" = "status" WHERE "statusRaw" IS NULL;

-- 3. Normalizacao: SCHEDULED -> CONFIRMED. CANCELLED mantido.
UPDATE "Appointment" SET "status" = 'CONFIRMED' WHERE "status" = 'SCHEDULED';

-- 4. Constraint SQL explicita: `status` passa a aceitar so os quatro
--    estados do produto. So pode ser adicionada depois da normalizacao
--    acima, porque antes dela existem linhas com `SCHEDULED`.
DO $$ BEGIN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_status_check"
        CHECK ("status" IN ('CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
