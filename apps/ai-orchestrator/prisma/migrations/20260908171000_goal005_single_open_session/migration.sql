-- Residuo do Goal005 - no maximo uma sessao aberta por conversa.
--
-- DIVERGENCIA DE SCHEMA INTENCIONAL: o Prisma nao modela indice unico parcial,
-- entao esta garantia existe so aqui, em SQL, e esta anotada no comentario de
-- `ConversationSession` em `schema.prisma`. `prisma migrate diff` vai relatar a
-- diferenca; ela e esperada e nao deve ser "corrigida" removendo o indice.
--
-- Antes disto, duas aberturas concorrentes da mesma conversa podiam criar duas
-- sessoes abertas, e `findFirst(endedAt: null)` passava a escolher uma delas de
-- forma nao deterministica - controle humano e categoria podiam ficar na sessao
-- que ninguem le. Com o indice, a segunda insercao falha e a aplicacao absorve
-- o conflito relendo a sessao ja aberta.
--
-- Passo de saneamento antes do indice: se o estoque ja tiver mais de uma sessao
-- aberta por conversa, as excedentes sao FECHADAS com motivo explicito - a mais
-- recente por `startedAt` fica de pe. Nenhuma linha e apagada e nenhuma decisao
-- (categoria, override, atendimento humano) e inventada.
UPDATE "ConversationSession" AS "s"
SET "endedAt" = CURRENT_TIMESTAMP,
    "endedReason" = 'superseded_duplicate_open_session'
WHERE "s"."endedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ConversationSession" AS "keep"
    WHERE "keep"."tenantId" = "s"."tenantId"
      AND "keep"."conversationId" = "s"."conversationId"
      AND "keep"."endedAt" IS NULL
      AND ("keep"."startedAt", "keep"."id") > ("s"."startedAt", "s"."id")
  );

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationSession_one_open_per_conversation"
    ON "ConversationSession"("tenantId", "conversationId")
    WHERE "endedAt" IS NULL;
