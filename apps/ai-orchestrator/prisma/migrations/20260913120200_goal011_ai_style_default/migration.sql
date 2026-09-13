-- Goal011 - estilo de conversa com tres valores: passo 3 de 3, default.
--
-- O default do banco sai de 'LIGHT_CLOSE' e passa a 'BALANCED', o equilibrado:
-- negocio sem configuracao fica no equilibrado, tanto no banco quanto na
-- projecao interna. So o default muda; nenhuma linha e reescrita aqui, porque
-- o passo 2 ja moveu as existentes.
ALTER TABLE "AiTenantConfig" ALTER COLUMN "tone" SET DEFAULT 'BALANCED';
