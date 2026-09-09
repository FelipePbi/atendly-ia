-- Goal007 - passo de CONSTRAINTS do catalogo e do acordo comercial.
--
-- So pode rodar depois do commit da migration de expansao anterior: e aqui
-- que as constraints passam a referenciar 'STARTING_AT' e 'NOT_INFORMED',
-- valores que so ficam visiveis a novas transacoes apos aquele commit.
--
-- `Service_price_check` e `AppointmentItem_priceSnapshot_check` sao
-- SUBSTITUIDAS, nao apenas reforcadas: a constraint antiga (dois ramos,
-- FIXED/ON_REQUEST) rejeitaria qualquer linha com um dos dois tipos novos, e
-- os dois tipos novos so existem a partir deste Goal. Por isso nao ha uma
-- janela intermediaria em que a constraint antiga convive com dado novo — ao
-- contrario do corte de unicidade de telefone do Goal006, aqui a troca e
-- atomica dentro desta migration. Todo consumer deste repositorio
-- (Scheduling, IA, BFF, frontend, importacao) e migrado no mesmo diff que
-- esta migration, entao nao existe periodo de release intermediario em que um
-- binario antigo dependeria da constraint antiga continuar de pe.
--
-- `Service_durationMinutes_check` e redefinida com o mesmo predicado
-- ("positivo quando presente"): CHECK em Postgres ja trata NULL como
-- aprovado, entao permitir duracao ausente (passo anterior) nao exigia
-- reescrever esta constraint para continuar correta. Ela e recriada aqui
-- mesmo assim, de forma explicita, para que o texto da constraint no banco
-- deixe de mencionar apenas o caso antigo e documente as duas condicoes.
--
-- Reversao: o binario anterior a este Goal continua funcionando enquanto nao
-- existir servico com `priceType` novo, duracao nula ou revisao pendente.
-- Assim que qualquer um desses aparecer, a versao anterior deixa de ser
-- destino seguro de rollback (ela nao sabe validar os quatro tipos nem tratar
-- ausencia como estado legitimo) — ver DATA_MIGRATION.md.

ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_price_check";
ALTER TABLE "Service" ADD CONSTRAINT "Service_price_check"
CHECK (
    ("priceType" IN ('FIXED', 'STARTING_AT') AND "price" IS NOT NULL AND "price" >= 0)
    OR ("priceType" IN ('ON_REQUEST', 'NOT_INFORMED') AND "price" IS NULL)
);

ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_durationMinutes_check";
ALTER TABLE "Service" ADD CONSTRAINT "Service_durationMinutes_check"
CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0);

ALTER TABLE "AppointmentItem" DROP CONSTRAINT IF EXISTS "AppointmentItem_priceSnapshot_check";
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_priceSnapshot_check"
CHECK (
    ("priceTypeSnapshot" IN ('FIXED', 'STARTING_AT') AND "priceSnapshot" IS NOT NULL AND "priceSnapshot" >= 0)
    OR ("priceTypeSnapshot" IN ('ON_REQUEST', 'NOT_INFORMED') AND "priceSnapshot" IS NULL)
);

ALTER TABLE "AppointmentItem" DROP CONSTRAINT IF EXISTS "AppointmentItem_durationMinutesSnapshot_check";
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_durationMinutesSnapshot_check"
CHECK ("durationMinutesSnapshot" IS NULL OR "durationMinutesSnapshot" > 0);
