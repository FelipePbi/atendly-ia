import "server-only";

import { cookies } from "next/headers";

type BffEnvelope<T = unknown> = {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export function bffBaseUrl(): string {
  return (process.env.BFF_BASE_URL || process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:3002").replace(/\/$/, "");
}

export async function bffFetch<T>(
  path: string,
  init: RequestInit & { cookieHeader?: string | null } = {}
): Promise<{ response: Response; envelope: BffEnvelope<T> | null }> {
  const headers = new Headers(init.headers);
  const cookieHeader = init.cookieHeader ?? (await cookies()).toString();

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${bffBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const envelope = (await response.json().catch(() => null)) as BffEnvelope<T> | null;

  return { response, envelope };
}

export async function proxyBffJson<T>(
  request: Request,
  path: string,
  options: {
    method?: string;
    transform?: (data: T) => unknown;
  } = {}
): Promise<Response> {
  const method = options.method ?? request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  const { response, envelope } = await bffFetch<T>(path, {
    method,
    headers,
    body,
    cookieHeader: request.headers.get("cookie"),
  });

  const payload =
    response.ok && envelope?.data
      ? { ok: true, ...asObject(options.transform ? options.transform(envelope.data) : envelope.data) }
      : {
          ok: false,
          error: envelope?.error?.message ?? "Nao foi possivel concluir a operacao agora.",
          details: envelope?.error?.details,
        };

  const nextResponse = Response.json(payload, { status: response.status });
  copySetCookie(response, nextResponse);
  return nextResponse;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { data: value };
}

export function copySetCookie(upstream: Response, downstream: Response): void {
  const setCookie = upstream.headers.get("set-cookie");
  if (setCookie) {
    downstream.headers.set("set-cookie", setCookie);
  }
}
