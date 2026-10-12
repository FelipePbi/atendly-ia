import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EvolutionClient } from "../src/clients/evolution/index.js";
import { env } from "../src/config/env.js";

/**
 * Endereço do webhook registrado nas instâncias da Evolution Go. Validação de
 * 2026-10-11/12: a Evolution roda no Docker e o webhook era registrado como
 * http://localhost:3000 — o "localhost" do container, não a IA —, então
 * nenhuma mensagem chegava na IA. EVOLUTION_WEBHOOK_BASE_URL separa o
 * endereço visto pela Evolution do AI_ORCHESTRATOR_BASE_URL do BFF. Sem HTTP.
 */
describe("EvolutionClient.webhookUrl", () => {
  const original = {
    EVOLUTION_WEBHOOK_BASE_URL: env.EVOLUTION_WEBHOOK_BASE_URL,
    AI_ORCHESTRATOR_BASE_URL: env.AI_ORCHESTRATOR_BASE_URL,
    EVOLUTION_WEBHOOK_SECRET: env.EVOLUTION_WEBHOOK_SECRET,
  };

  beforeEach(() => {
    env.AI_ORCHESTRATOR_BASE_URL = "http://localhost:3000";
    env.EVOLUTION_WEBHOOK_SECRET = "segredo com espaço";
  });

  afterEach(() => {
    Object.assign(env, original);
  });

  it("usa EVOLUTION_WEBHOOK_BASE_URL quando definida, não o localhost do BFF", () => {
    env.EVOLUTION_WEBHOOK_BASE_URL = "http://host.docker.internal:3000/";

    const url = new EvolutionClient().webhookUrl();

    expect(url).toBe(
      "http://host.docker.internal:3000/webhooks/evolution?token=segredo%20com%20espa%C3%A7o",
    );
    expect(url).not.toContain("localhost");
  });

  it("vazia, cai no AI_ORCHESTRATOR_BASE_URL (produção: os dois lados veem a IA no mesmo endereço)", () => {
    env.EVOLUTION_WEBHOOK_BASE_URL = "";

    expect(new EvolutionClient().webhookUrl()).toBe(
      "http://localhost:3000/webhooks/evolution?token=segredo%20com%20espa%C3%A7o",
    );
  });
});
