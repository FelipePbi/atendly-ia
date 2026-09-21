import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import { type ActivationTestRun } from "../mappers/publicApiSchemas";

/**
 * Teste real da ativação (Goal019).
 *
 * Proxy fino de `GET/POST /v1/activation-test`. Não há aqui nenhum estado
 * local de progresso, nenhum temporizador e nenhum valor derivado: a tela lê
 * o que o servidor respondeu e nada mais. `null` em `get` é "nunca testou" —
 * distinto de falha, que sobe como erro do cliente HTTP.
 */
export class BffActivationTestService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/activation-test",
      schema: routeSchema<ActivationTestRun | null>(
        "GET",
        "/v1/activation-test",
      ),
      signal,
    });
  }

  /**
   * Inicia o teste. O BFF responde `202`: a execução já está persistida e
   * segue no servidor a partir daqui — fechar o navegador não a cancela.
   */
  start(tenantPhone: string, signal?: AbortSignal) {
    return this.http.request({
      body: { tenantPhone },
      method: "POST",
      path: "/v1/activation-test",
      schema: routeSchema<ActivationTestRun>("POST", "/v1/activation-test"),
      signal,
    });
  }

  /** Reinicia depois de interferência humana: a pausada é descartada. */
  restart(tenantPhone: string, signal?: AbortSignal) {
    return this.http.request({
      body: { tenantPhone },
      method: "POST",
      path: "/v1/activation-test/restart",
      schema: routeSchema<ActivationTestRun>(
        "POST",
        "/v1/activation-test/restart",
      ),
      signal,
    });
  }
}
