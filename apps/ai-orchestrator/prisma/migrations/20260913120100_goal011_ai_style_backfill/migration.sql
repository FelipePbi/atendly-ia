-- Goal011 - estilo de conversa com tres valores: passo 2 de 3, backfill.
--
-- Mapa de backfill, deterministico e o unico declarado:
--   PROFESSIONAL_OBJECTIVE -> PROFESSIONAL  (o "profissional e objetiva" de hoje)
--   LIGHT_CLOSE            -> BALANCED      (o "leve e proxima", default atual)
-- CASUAL e estilo novo: nenhuma linha existente nasce nele, porque ninguem
-- sabe retroativamente qual negocio o escolheria.
--
-- Retomavel: as clausulas WHERE ja filtram pelo valor antigo, entao reexecutar
-- nao tem efeito. Nenhuma linha e removida e nenhuma coluna alem de "tone" e
-- tocada.
UPDATE "AiTenantConfig" SET "tone" = 'PROFESSIONAL' WHERE "tone" = 'PROFESSIONAL_OBJECTIVE';
UPDATE "AiTenantConfig" SET "tone" = 'BALANCED' WHERE "tone" = 'LIGHT_CLOSE';
