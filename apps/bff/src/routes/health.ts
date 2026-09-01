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
    const [aiOrchestrator, evolutionGo] = await Promise.allSettled([
      checkHealth(env.AI_ORCHESTRATOR_BASE_URL, "/health"),
      checkHealth(env.EVOLUTION_GO_BASE_URL, "/healthy"),
    ]);

    return dataResponse(request, {
      aiOrchestrator: resultValue(aiOrchestrator),
      evolutionGo: resultValue(evolutionGo),
    });
  });
}

async function checkHealth(
  baseUrl: string,
  path: string,
): Promise<{
  ok: boolean;
  status?: number;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    signal: AbortSignal.timeout(env.INTERNAL_HTTP_TIMEOUT_MS),
  });
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
