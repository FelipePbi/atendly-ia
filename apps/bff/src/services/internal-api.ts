import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export async function checkApiHealth(): Promise<{ ok: boolean; status?: number; latencyMs: number }> {
  const startedAt = Date.now();
  const response = await fetch(`${env.API_BASE_URL.replace(/\/$/, "")}/health`, {
    headers: internalHeaders(undefined, "api")
  }).catch(async () =>
    fetch(`${env.API_BASE_URL.replace(/\/$/, "")}/healthy`, {
      headers: internalHeaders(undefined, "api")
    })
  );

  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt
  };
}

export async function dispatchToApi(path: string, input: { method?: string; body?: unknown; userId?: string; requestId?: string }) {
  const response = await fetch(`${env.API_BASE_URL.replace(/\/$/, "")}${path}`, {
    method: input.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...internalHeaders(input.userId, "api", input.requestId)
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  });
  const body = await response.text();
  const parsed = body ? tryJson(body) : null;

  if (!response.ok) {
    throw new AppError("UPSTREAM_ERROR", "API returned an error.", response.status >= 500 ? 502 : response.status, parsed);
  }

  return parsed;
}

function internalHeaders(userId?: string, audience?: string, requestId?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.INTERNAL_SERVICE_TOKEN) {
    headers.authorization = `Bearer ${env.INTERNAL_SERVICE_TOKEN}`;
  }
  if (userId) headers["x-user-id"] = userId;
  if (audience) headers["x-service-audience"] = audience;
  if (requestId) headers["x-request-id"] = requestId;
  return headers;
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
