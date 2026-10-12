-- Motivo e titulo de bloqueio sem nenhuma letra ou numero (ex. "." vindo da
-- importacao da Minha Agenda) passam a nulo: a Agenda mostrava o ponto como
-- se fosse o motivo (validacao de 2026-10-12). Idempotente.
UPDATE "TimeBlock" SET "reason" = NULL
WHERE "reason" IS NOT NULL AND "reason" !~ '[[:alnum:]]';
UPDATE "TimeBlock" SET "title" = NULL
WHERE "title" IS NOT NULL AND "title" !~ '[[:alnum:]]';
