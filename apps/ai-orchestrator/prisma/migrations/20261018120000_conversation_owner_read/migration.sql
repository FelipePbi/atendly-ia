-- Conversas nao lidas (D-195): ate quando a profissional ja viu a conversa no
-- app. Mensagem do cliente depois disto conta como nao lida.
--
-- ADITIVA: uma coluna anulavel nova em `Conversation`. Nada e apagado nem
-- renomeado.
--
-- BACKFILL: toda conversa que ja existe nasce lida no instante da migration.
-- Sem isso, o historico inteiro viraria "nao lido" de uma vez e o contador da
-- navegacao amanheceria com todas as conversas. Conversa criada depois nasce
-- nula (nunca aberta): toda mensagem do cliente nela conta.
--
-- ROLLBACK: a coluna pode ser removida sem perda alem das marcas de leitura.
--
-- RETOMAVEL/IDEMPOTENTE: `IF NOT EXISTS` no DDL e o backfill so toca linha
-- ainda nula.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "ownerReadAt" TIMESTAMP(3);

UPDATE "Conversation" SET "ownerReadAt" = CURRENT_TIMESTAMP WHERE "ownerReadAt" IS NULL;
