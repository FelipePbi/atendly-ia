-- Goal011 - estilo de conversa com tres valores: passo 2 de 2, backfill.
--
-- Mesmo mapa de backfill do WU-01 (apps/ai-orchestrator), deterministico e o
-- unico declarado:
--   PROFESSIONAL_OBJECTIVE -> PROFESSIONAL  (o "profissional e objetiva" de hoje)
--   LIGHT_CLOSE            -> BALANCED      (o "leve e proxima", default atual)
-- CASUAL e estilo novo: nenhuma linha existente nasce nele.
--
-- Retomavel: as clausulas WHERE ja filtram pelo valor antigo, entao reexecutar
-- nao tem efeito. Linhas com "tone" nulo (negocio ainda nao escolheu) ficam
-- intocadas — nulo nao e alias de nada.
UPDATE "AiSettings" SET "tone" = 'PROFESSIONAL' WHERE "tone" = 'PROFESSIONAL_OBJECTIVE';
UPDATE "AiSettings" SET "tone" = 'BALANCED' WHERE "tone" = 'LIGHT_CLOSE';
