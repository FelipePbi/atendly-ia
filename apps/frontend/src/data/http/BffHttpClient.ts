import { z } from "zod";

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
  requestId: z.string().min(1),
});

const responseEnvelopeSchema = z.object({
  data: z.unknown(),
  requestId: z.string().min(1),
});

type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
type QueryScalar = boolean | number | string;
type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

export interface BffHttpClientOptions {
  baseUrl: string;
  csrfHeaderName?: string;
  getCsrfToken?: () => string | undefined;
  fetchImplementation?: typeof fetch;
}

export interface BffRequestOptions<TSchema extends z.ZodType> {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  method?: HttpMethod;
  path: string;
  query?: Readonly<Record<string, QueryValue>>;
  requestId?: string;
  schema: TSchema;
  signal?: AbortSignal;
}

export class BffHttpError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly requestId: string;
  readonly status: number;

  constructor(options: {
    code: string;
    details?: unknown;
    message: string;
    requestId: string;
    status: number;
  }) {
    super(options.message);
    this.name = "BffHttpError";
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.status = options.status;
  }
}

export class BffHttpClient {
  private readonly baseUrl: URL;
  private readonly csrfHeaderName: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly getCsrfToken?: () => string | undefined;

  constructor(options: BffHttpClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.csrfHeaderName = options.csrfHeaderName ?? "x-csrf-token";
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.getCsrfToken = options.getCsrfToken;
  }

  async request<TSchema extends z.ZodType>(
    options: BffRequestOptions<TSchema>,
  ): Promise<z.output<TSchema>> {
    const method = options.method ?? "GET";
    const requestId = options.requestId ?? createRequestId();
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");
    headers.set("x-request-id", requestId);

    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    if (!isSafeMethod(method)) {
      const csrfToken = this.getCsrfToken?.();
      if (csrfToken) headers.set(this.csrfHeaderName, csrfToken);
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(
        buildUrl(this.baseUrl, options.path, options.query),
        {
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          credentials: "include",
          headers,
          method,
          signal: options.signal,
        },
      );
    } catch (error: unknown) {
      if (isAbortError(error) || options.signal?.aborted) {
        throw new BffHttpError({
          code: "REQUEST_ABORTED",
          message: "A requisição foi cancelada.",
          requestId,
          status: 0,
        });
      }

      throw new BffHttpError({
        code: "NETWORK_ERROR",
        details: error instanceof Error ? { name: error.name } : undefined,
        message: "Não foi possível acessar a Atendly.",
        requestId,
        status: 0,
      });
    }

    const responseRequestId = response.headers.get("x-request-id") ?? requestId;
    const payload = await parseJson(response, responseRequestId);

    if (!response.ok) {
      const parsedError = errorEnvelopeSchema.safeParse(payload);
      if (parsedError.success) {
        throw new BffHttpError({
          code: parsedError.data.error.code,
          details: parsedError.data.error.details,
          message: parsedError.data.error.message,
          requestId: parsedError.data.requestId,
          status: response.status,
        });
      }

      throw new BffHttpError({
        code: "HTTP_ERROR",
        details: payload,
        message: response.statusText || "A requisição falhou.",
        requestId: responseRequestId,
        status: response.status,
      });
    }

    const parsedEnvelope = responseEnvelopeSchema.safeParse(payload);
    if (!parsedEnvelope.success) {
      throw new BffHttpError({
        code: "INVALID_RESPONSE",
        details: parsedEnvelope.error.flatten(),
        message: "A Atendly retornou uma resposta inválida.",
        requestId: responseRequestId,
        status: response.status,
      });
    }

    const parsedData = options.schema.safeParse(parsedEnvelope.data.data);
    if (!parsedData.success) {
      throw new BffHttpError({
        code: "INVALID_RESPONSE",
        details: parsedData.error.flatten(),
        message: "A Atendly retornou dados inválidos.",
        requestId: parsedEnvelope.data.requestId,
        status: response.status,
      });
    }

    return parsedData.data;
  }
}

function normalizeBaseUrl(value: string): URL {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("BFF base URL is required.");

  const url = new URL(trimmed.endsWith("/") ? trimmed : `${trimmed}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BFF base URL must use HTTP or HTTPS.");
  }
  return url;
}

function buildUrl(
  baseUrl: URL,
  path: string,
  query?: Readonly<Record<string, QueryValue>>,
): URL {
  const url = new URL(path.replace(/^\//, ""), baseUrl);
  if (!query) return url;

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) url.searchParams.append(key, String(item));
  }
  return url;
}

async function parseJson(
  response: Response,
  requestId: string,
): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BffHttpError({
      code: "INVALID_JSON",
      message: "A Atendly retornou uma resposta inválida.",
      requestId,
      status: response.status,
    });
  }
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("-");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isSafeMethod(method: HttpMethod): boolean {
  return method === "GET";
}
