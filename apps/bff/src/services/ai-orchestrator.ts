import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export async function checkAiOrchestratorHealth(): Promise<{
  ok: boolean;
  status?: number;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const response = await fetch(
    `${env.AI_ORCHESTRATOR_BASE_URL.replace(/\/$/, "")}/health`,
    {
      headers: internalHeaders(undefined, "ai-orchestrator"),
    },
  ).catch(async () =>
    fetch(`${env.AI_ORCHESTRATOR_BASE_URL.replace(/\/$/, "")}/healthy`, {
      headers: internalHeaders(undefined, "ai-orchestrator"),
    }),
  );

  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt,
  };
}

export async function dispatchToAiOrchestrator(
  path: string,
  input: {
    method?: string;
    body?: unknown;
    tenantId?: string;
    userId?: string;
    requestId?: string;
  },
) {
  const response = await fetch(
    `${env.AI_ORCHESTRATOR_BASE_URL.replace(/\/$/, "")}${path}`,
    {
      method: input.method ?? "POST",
      headers: {
        "content-type": "application/json",
        ...internalHeaders(
          input.userId,
          "ai-orchestrator",
          input.requestId,
          input.tenantId,
        ),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    },
  );
  const body = await response.text();
  const parsed = body ? tryJson(body) : null;

  if (!response.ok) {
    throw new AppError(
      "UPSTREAM_ERROR",
      "AI Orchestrator returned an error.",
      response.status >= 500 ? 502 : response.status,
      parsed,
    );
  }

  return parsed;
}

export async function syncEvolutionChannelToAiOrchestrator(input: {
  tenantId: string;
  userId: string;
  requestId: string;
  externalInstanceId: string;
  displayName?: string;
}): Promise<void> {
  await dispatchToAiOrchestrator("/internal/channel-connections/evolution", {
    method: "PUT",
    tenantId: input.tenantId,
    userId: input.userId,
    requestId: input.requestId,
    body: {
      externalInstanceId: input.externalInstanceId,
      displayName: input.displayName,
    },
  });
}

export async function syncAiTenantConfig(input: {
  tenantId: string;
  userId: string;
  requestId: string;
  enabled: boolean;
  tone: "PROFESSIONAL_OBJECTIVE" | "LIGHT_CLOSE";
  businessSettings: unknown;
}): Promise<void> {
  await dispatchToAiOrchestrator("/internal/ai-tenant-config", {
    method: "PUT",
    tenantId: input.tenantId,
    userId: input.userId,
    requestId: input.requestId,
    body: {
      enabled: input.enabled,
      tone: input.tone,
      businessSettings: input.businessSettings,
    },
  });
}

function internalHeaders(
  userId?: string,
  audience?: string,
  requestId?: string,
  tenantId?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.INTERNAL_SERVICE_TOKEN) {
    headers.authorization = `Bearer ${env.INTERNAL_SERVICE_TOKEN}`;
  }
  if (userId) headers["x-user-id"] = userId;
  if (audience) headers["x-service-audience"] = audience;
  if (requestId) headers["x-request-id"] = requestId;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  return headers;
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
