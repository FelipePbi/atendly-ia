-- Goal007 - passo de EXPANSAO do catalogo e do acordo comercial.
--
-- Aditiva e retomavel. Nenhum registro existente muda de tipo, preco ou
-- duracao: `FIXED` e `ON_REQUEST` guardam o significado original, e todo
-- servico/snapshot que hoje tem duracao e preco continua exatamente com os
-- mesmos valores. Este passo so acrescenta: dois valores novos ao enum de
-- preco, colunas opcionais e a possibilidade de duracao ausente.
--
-- Os dois valores novos do enum de preco entram em migration PROPRIA porque o
-- Postgres nao permite usar um valor de enum recem-adicionado dentro da MESMA
-- transacao que o criou (ALTER TYPE ... ADD VALUE so fica visivel a outras
-- transacoes apos commit). A migration seguinte, que referencia
-- 'STARTING_AT'/'NOT_INFORMED' nas constraints SQL, depende deste commit ja
-- ter acontecido — por isso os dois passos, nesta ordem, nunca podem ser
-- comprimidos em um so.
--
-- O binario anterior continua funcionando depois deste passo enquanto nao
-- existir servico com os tipos novos, duracao nula ou revisao pendente —
-- ver "Reversao" no cabecalho da migration seguinte e em DATA_MIGRATION.md.

-- 1. Dois significados novos de preco: "a partir de" e "nao informado".
ALTER TYPE "PriceType" ADD VALUE IF NOT EXISTS 'STARTING_AT';
ALTER TYPE "PriceType" ADD VALUE IF NOT EXISTS 'NOT_INFORMED';

-- 2. Origem do estado de revisao (importacao ou cadastro manual incompleto).
DO $$ BEGIN
    CREATE TYPE "ServiceReviewOrigin" AS ENUM ('IMPORT', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Identidade visual: token estavel, nao cor livre nem numero emprestado do
--    Minha Agenda.
DO $$ BEGIN
    CREATE TYPE "ServiceColorToken" AS ENUM ('ROSE', 'AMBER', 'EMERALD', 'SKY', 'VIOLET', 'SLATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Duracao deixa de ser obrigatoria: ausente e o unico jeito de existir em
--    revisao. `DROP NOT NULL` nao reescreve nenhuma linha existente.
ALTER TABLE "Service" ALTER COLUMN "durationMinutes" DROP NOT NULL;

-- 5. Estado de revisao, separado de `active`; e atributos do MVP previstos
--    para o catalogo (descricao, identidade visual, buffers, recorrencia de
--    referencia). Buffers e recorrencia nascem sem efeito operacional
--    (Goal009/Goal011 aplicam).
ALTER TABLE "Service"
    ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "reviewOrigin" "ServiceReviewOrigin",
    ADD COLUMN "description" TEXT,
    ADD COLUMN "colorToken" "ServiceColorToken",
    ADD COLUMN "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "recurrenceIntervalDays" INTEGER;

-- 6. Nenhum servico existente entra em revisao por causa desta migration:
--    todos ja tem duracao (coluna era NOT NULL ate o passo 4), entao
--    `needsReview` permanece `false` para tudo que ja existe.

-- 7. Item do acordo tambem passa a admitir duracao propria ausente — nunca
--    preenchida com a duracao total do atendimento (importacao multi-servico,
--    Goal010 fora de escopo aqui, mas o mapper para de fabricar esse valor).
ALTER TABLE "AppointmentItem" ALTER COLUMN "durationMinutesSnapshot" DROP NOT NULL;

-- 8. Constraints novas, independentes dos valores novos do enum: podem
--    conviver com o restante do passo de expansao porque nao referenciam
--    'STARTING_AT'/'NOT_INFORMED'.
ALTER TABLE "Service" ADD CONSTRAINT "Service_bufferBeforeMinutes_check"
CHECK ("bufferBeforeMinutes" >= 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_bufferAfterMinutes_check"
CHECK ("bufferAfterMinutes" >= 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_recurrenceIntervalDays_check"
CHECK ("recurrenceIntervalDays" IS NULL OR "recurrenceIntervalDays" > 0);
-- Revisao em lockstep com duracao ausente: nenhuma linha existente viola,
-- porque toda linha existente tem duracao e nasceu com `needsReview = false`.
ALTER TABLE "Service" ADD CONSTRAINT "Service_review_check"
CHECK (("durationMinutes" IS NULL) = "needsReview");
-- Origem so existe enquanto a revisao esta pendente.
ALTER TABLE "Service" ADD CONSTRAINT "Service_reviewOrigin_check"
CHECK (
    ("needsReview" = false AND "reviewOrigin" IS NULL)
    OR ("needsReview" = true AND "reviewOrigin" IS NOT NULL)
);
