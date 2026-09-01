import type { FastifyInstance } from "fastify";

import { env } from "../config/env.js";
import { dataResponse } from "../lib/http.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/health", async (request) =>
    dataResponse(request, {
      status: "ok",
      service: "atendly-ia-bff",
      timestamp: new Date().toISOString(),
    }),
  );

  app.get("/health/dependencies", async (request) => {
    const [aiOrchestrator, schedulingService, evolutionGo] =
      await Promise.allSettled([
        checkHealth(env.AI_ORCHESTRATOR_BASE_URL, "/health", request.id),
        checkHealth(env.SCHEDULING_SERVICE_BASE_URL, "/health", request.id),
        checkHealth(env.EVOLUTION_GO_BASE_URL, "/health", request.id),
      ]);

    return dataResponse(request, {
      aiOrchestrator: resultValue(aiOrchestrator),
      schedulingService: resultValue(schedulingService),
      evolutionGo: resultValue(evolutionGo),
    });
  });
}

async function checkHealth(
  baseUrl: string,
  path: string,
  requestId: string,
): Promise<{
  ok: boolean;
  status?: number;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const normalizedBaseUrl = /^https?:\/\//u.test(baseUrl)
    ? baseUrl
    : `http://${baseUrl}`;
  const response = await fetch(
    `${normalizedBaseUrl.replace(/\/$/, "")}${path}`,
    {
      headers: { "x-request-id": requestId },
      signal: AbortSignal.timeout(env.INTERNAL_HTTP_TIMEOUT_MS),
    },
  );
  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt,
  };
}

function resultValue<T>(
  result: PromiseSettledResult<T>,
): T | { ok: false; error: string } {
  if (result.status === "fulfilled") return result.value;
  return {
    ok: false,
    error:
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
  };
}
