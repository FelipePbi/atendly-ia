-- Goal011 - estilo de conversa com tres valores: passo 1 de 2, so o vocabulario.
--
-- Aditiva e retomavel. `ADD VALUE IF NOT EXISTS` nao remove, nao renomeia e nao
-- toca em nenhuma linha: depois deste passo o tipo "AiTone" aceita cinco
-- valores e nenhuma linha usa os tres novos.
--
-- POR QUE DOIS PASSOS SEPARADOS: no PostgreSQL um valor de enum criado numa
-- transacao nao pode ser usado nela. O Prisma aplica cada migration numa
-- transacao, entao o backfill (passo 2) precisa de uma transacao propria,
-- depois desta. Juntar os passos quebra o deploy.
--
-- DIVERGENCIA DE SCHEMA INTENCIONAL: ver o comentario acima do enum "AiTone"
-- em schema.prisma. Diferente da IA (Goal011/WU-01), aqui nao existe um passo
-- 3 de "default": a coluna "AiSettings"."tone" nunca teve `DEFAULT` no banco, e
-- continua sem um — nulo significa "negocio ainda nao escolheu estilo",
-- distincao usada pela pendencia `AI_TONE_NOT_SELECTED` do onboarding. O
-- equilibrado como projecao padrao para a IA e regra de aplicacao, nunca valor
-- gravado silenciosamente aqui.
ALTER TYPE "AiTone" ADD VALUE IF NOT EXISTS 'PROFESSIONAL';
ALTER TYPE "AiTone" ADD VALUE IF NOT EXISTS 'BALANCED';
ALTER TYPE "AiTone" ADD VALUE IF NOT EXISTS 'CASUAL';
