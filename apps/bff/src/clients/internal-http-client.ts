import type { z } from "zod";

import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import {
  type InternalAudience,
  internalToken,
  type InternalUse,
} from "../lib/internal-credentials.js";

export interface InternalRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export class InternalHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly audience: string,
    private readonly authMode: "internal" | "custom" = "internal",
  ) {}

  // `x-service-audience` continua sendo informação de roteamento/observação; a
  // autorização vem da credencial escolhida por (audiência, uso), distinta para
  // provisionamento e para comando comum.
  private credential(use: InternalUse): string {
    return internalToken(this.audience as InternalAudience, use);
  }

  async request<T>(input: {
    method: HttpMethod;
    path: string;
    context?: InternalRequestContext;
    schema: z.ZodType<T>;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    idempotencyKey?: string;
    headers?: Record<string, string>;
    requestId?: string;
    use?: InternalUse;
  }): Promise<T> {
    const attempts =
      input.method === "GET" ? env.INTERNAL_HTTP_GET_RETRIES + 1 : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.perform(input);
      } catch (error) {
        lastError = error;
        if (!shouldRetry(input.method, error) || attempt === attempts)
          throw error;
      }
    }

    throw lastError;
  }

  private async perform<T>(input: {
    method: HttpMethod;
    path: string;
    context?: InternalRequestContext;
    schema: z.ZodType<T>;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    idempotencyKey?: string;
    headers?: Record<string, string>;
    requestId?: string;
    use?: InternalUse;
  }): Promise<T> {
    const url = new URL(input.path, normalizedBaseUrl(this.baseUrl));
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const requestId = input.context?.requestId ?? input.requestId;

    let response: Response;
    try {
      response = await fetch(url, {
        method: input.method,
        headers: {
          accept: "application/json",
          ...(input.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          "x-service-audience": this.audience,
          ...(this.authMode === "internal"
            ? {
                authorization: `Bearer ${this.credential(input.use ?? "command")}`,
              }
            : {}),
          ...(input.context
            ? {
                "x-tenant-id": input.context.tenantId,
                "x-user-id": input.context.userId,
              }
            : {}),
          ...(requestId ? { "x-request-id": requestId } : {}),
          ...(input.idempotencyKey
            ? { "idempotency-key": input.idempotencyKey }
            : {}),
          ...input.headers,
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: AbortSignal.timeout(env.INTERNAL_HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError(
        "UPSTREAM_ERROR",
        `${this.audience} request failed.`,
        502,
        { cause: error instanceof Error ? error.name : "NETWORK_ERROR" },
      );
    }

    const payload = await parseJson(response);
    if (!response.ok) {
      const normalized = upstreamError(payload);
      throw new AppError(
        "UPSTREAM_ERROR",
        normalized.message,
        response.status >= 500 ? 502 : response.status,
        {
          upstream: this.audience,
          upstreamCode: normalized.code,
          upstreamRequestId: normalized.requestId,
          // Detalhe estruturado do serviço interno, quando existe (Goal009):
          // a falha de uma ocorrência de série só é acionável se disser QUAL
          // ocorrência caiu e quais alternativas existem. Vai aninhado, não
          // espalhado, para não colidir com as chaves acima.
          ...(normalized.details ? { upstreamDetails: normalized.details } : {}),
        },
      );
    }

    const parsed = input.schema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        "UPSTREAM_ERROR",
        `${this.audience} returned an invalid JSON response.`,
        502,
        { issues: parsed.error.issues },
      );
    }
    return parsed.data;
  }
}

function normalizedBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  const normalized = /^https?:\/\//u.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  return `${normalized}/`;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function upstreamError(value: unknown): {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
} {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const details = error as Record<string, unknown>;
      return {
        code:
          typeof details.code === "string" ? details.code : "UPSTREAM_ERROR",
        message:
          typeof details.message === "string"
            ? details.message
            : "Internal service returned an error.",
        requestId:
          typeof record.requestId === "string" ? record.requestId : undefined,
        details: details.details,
      };
    }
    if (typeof record.error === "string") {
      return {
        code: "UPSTREAM_ERROR",
        message: record.error,
        requestId:
          typeof record.requestId === "string" ? record.requestId : undefined,
      };
    }
  }
  return {
    code: "UPSTREAM_ERROR",
    message: "Internal service returned an error.",
  };
}

function shouldRetry(method: HttpMethod, error: unknown): boolean {
  return (
    method === "GET" &&
    error instanceof AppError &&
    error.code === "UPSTREAM_ERROR" &&
    error.statusCode >= 500
  );
}
