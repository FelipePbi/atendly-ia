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
// Fictício (Goal060 §1): nunca o valor real do cliente OAuth do portal.
// Presente por padrão para que os testes que não são deste Goal continuem
// achando o sistema configurado; o teste de `MINHA_AGENDA_NOT_CONFIGURED`
// apaga `env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` e restaura no `afterEach`.
export const TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL =
  "test-minha-agenda-oauth-client-credential-fixture";
export const TEST_MINHA_AGENDA_API_BASE_URL =
  "https://minha-agenda.example.invalid";

process.env.INTERNAL_SERVICE_TOKEN = TEST_INTERNAL_SERVICE_TOKEN;
process.env.INTEGRATION_CREDENTIALS_KEY = TEST_INTEGRATION_CREDENTIALS_KEY;
process.env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL =
  TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL;
process.env.MINHA_AGENDA_API_BASE_URL = TEST_MINHA_AGENDA_API_BASE_URL;
