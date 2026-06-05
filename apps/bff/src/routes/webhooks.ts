import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { dataResponse } from "../lib/http.js";

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/evolution-go", async (request, reply) => {
    const query = request.query as { token?: string };
    if (!env.EVOLUTION_WEBHOOK_SECRET || query.token !== env.EVOLUTION_WEBHOOK_SECRET) {
      throw new AppError("UNAUTHORIZED", "Invalid webhook token.", 401);
    }

    if (!env.API_EVOLUTION_WEBHOOK_TOKEN) {
      return dataResponse(request, {
        received: true,
        forwarded: false
      });
    }

    const target = new URL("/webhooks/evolution", env.API_BASE_URL);
    target.searchParams.set("token", env.API_EVOLUTION_WEBHOOK_TOKEN);

    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request.body ?? {})
    });

    const responseBody = await response.text();
    reply.code(response.status).type(response.headers.get("content-type") ?? "application/json");
    return responseBody;
  });
}
