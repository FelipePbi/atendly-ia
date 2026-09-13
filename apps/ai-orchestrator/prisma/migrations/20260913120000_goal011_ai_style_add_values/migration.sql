-- Goal011 - estilo de conversa com tres valores: passo 1 de 3, so o vocabulario.
--
-- Aditiva e retomavel. `ADD VALUE IF NOT EXISTS` nao remove, nao renomeia e nao
-- toca em nenhuma linha: depois deste passo o tipo "AiTone" aceita cinco
-- valores e nenhuma linha usa os tres novos.
--
-- POR QUE TRES MIGRATIONS SEPARADAS: no PostgreSQL um valor de enum criado numa
-- transacao nao pode ser usado nela. O Prisma aplica cada migration numa
-- transacao, entao o backfill (passo 2) e o default (passo 3) precisam de
-- transacoes proprias, depois desta. Juntar os passos quebra o deploy.
--
-- DIVERGENCIA DE SCHEMA INTENCIONAL: o Prisma geraria `CREATE TYPE` novo com a
-- lista final de valores, o que reescreveria a coluna e derrubaria o binario
-- anterior. Os dois valores antigos continuam declarados em `schema.prisma`
-- porque o tipo do banco nao os perde e eles seguem legiveis ate o Goal024.
-- `prisma migrate diff` pode relatar a ordem dos valores; a diferenca e
-- esperada e nao deve ser "corrigida" recriando o tipo.
ALTER TYPE "AiTone" ADD VALUE IF NOT EXISTS 'PROFESSIONAL';
ALTER TYPE "AiTone" ADD VALUE IF NOT EXISTS 'BALANCED';
ALTER TYPE "AiTone" ADD VALUE IF NOT EXISTS 'CASUAL';
