import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { InternalHttpClient } from "../src/clients/internal-http-client.js";

/**
 * A IA responde erro no formato plano `{ ok, error, code, details }`. O BFF
 * precisa levar `code` como `upstreamCode`: sem isso, toda recusa nomeada da
 * IA (ex.: `PLATFORM_NUMBER_NOT_CONFIGURED` no teste real) virava uma falha
 * genérica na tela, que pedia para tentar de novo (QA R-05).
 */
describe("InternalHttpClient: código da recusa no formato plano", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("leva `code` e `details` do corpo plano para o erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: "Avenly platform WhatsApp number is not configured.",
            code: "PLATFORM_NUMBER_NOT_CONFIGURED",
            details: { missing: ["PLATFORM_WHATSAPP_NUMBER"] },
            requestId: "req-1",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const client = new InternalHttpClient("http://ia.local", "ai-orchestrator", "custom");

    await expect(
      client.request({ method: "POST", path: "/internal/activation-test", schema: z.unknown() }),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      statusCode: 502,
      details: expect.objectContaining({
        upstreamCode: "PLATFORM_NUMBER_NOT_CONFIGURED",
        upstreamRequestId: "req-1",
      }),
    });
  });
});
