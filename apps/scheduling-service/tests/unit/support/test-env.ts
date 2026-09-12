/**
 * Efeito colateral de import: preenche as variáveis de ambiente que a
 * autenticação interna e a cifra de credenciais de integração exigem, antes
 * de `config/env.ts` ser avaliado pela primeira vez. Precisa ser o
 * **primeiro** import do arquivo de teste que o usa — depois de qualquer
 * outro import que alcance `config/env.ts`, os valores já teriam sido
 * congelados em `env`.
 */
export const TEST_INTERNAL_SERVICE_TOKEN =
  "test-internal-service-token-0123456789abcdef";
export const TEST_INTEGRATION_CREDENTIALS_KEY = Buffer.alloc(32, 7).toString(
  "base64",
);

process.env.INTERNAL_SERVICE_TOKEN = TEST_INTERNAL_SERVICE_TOKEN;
process.env.INTEGRATION_CREDENTIALS_KEY = TEST_INTEGRATION_CREDENTIALS_KEY;
