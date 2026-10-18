import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvolutionClient } from "../src/clients/evolution/index.js";
import { env } from "../src/config/env.js";

/**
 * D-205: aparelho vinculado online ou mensagem marcada como lida pela
 * plataforma tiram a notificação do celular do dono. A instância nasce com os
 * dois desligados, explícitos, sem depender do padrão do fork. Sem HTTP.
 */
describe("EvolutionClient.createInstance", () => {
  const original = { EVOLUTION_GO_API_KEY: env.EVOLUTION_GO_API_KEY };

  beforeEach(() => {
    env.EVOLUTION_GO_API_KEY = "chave-global";
  });

  afterEach(() => {
    Object.assign(env, original);
  });

  it("cria a instância sem alwaysOnline e sem marcar como lida", async () => {
    const client = new EvolutionClient();
    const request = vi.fn().mockResolvedValue({ data: {} });
    (client as unknown as { http: { request: typeof request } }).http.request =
      request;

    await client.createInstance({
      name: "negocio",
      token: "tok",
      webhookUrl: "http://ia/webhooks/evolution",
    });

    expect(request).toHaveBeenCalledTimes(1);
    const call = request.mock.calls[0][0] as {
      path: string;
      body: { advancedSettings: Record<string, unknown> };
    };
    expect(call.path).toBe("/instance/create");
    expect(call.body.advancedSettings).toEqual({
      ignoreGroups: true,
      alwaysOnline: false,
      readMessages: false,
    });
  });
});
