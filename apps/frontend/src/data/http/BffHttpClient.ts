import { findPublicApiRoute } from "@avenly-ia/public-api-contract";
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
  csrfCookieName?: string;
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

/**
 * Schema de `data` da rota pública, lido da tabela em
 * `@avenly-ia/public-api-contract` em vez de importado solto. `T` é o tipo
 * de saída esperado (o mesmo que a validação da tabela já produz); a tabela
 * é dona do schema, aqui só se recupera a instância pelo par método/padrão.
 */
export function routeSchema<T>(
  method: HttpMethod,
  pathPattern: string,
): z.ZodType<T> {
  const route = findPublicApiRoute(method, pathPattern);
  if (!route) {
    throw new Error(`Unknown public API route: ${method} ${pathPattern}`);
  }
  return route.schema as unknown as z.ZodType<T>;
}

/**
 * Aviso de que alguma chamada fora de `/v1/auth/*` voltou 401 (2026-10-16):
 * a sessão pode ter acabado. Quem guarda a sessão (ProductRuntime) a relê
 * para decidir; as rotas de login ficam de fora, porque nelas 401 é senha
 * errada, não sessão vencida.
 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function reportUnauthorized(path: string, status: number): void {
  if (status !== 401 || path.startsWith("/v1/auth/")) return;
  for (const listener of unauthorizedListeners) listener();
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

/** O que o adapter guarda de uma resposta, já com o corpo lido. */
interface ReceivedResponse {
  ok: boolean;
  payload: unknown;
  requestId: string;
  status: number;
  statusText: string;
}

interface InFlightRead {
  abort: () => void;
  callers: number;
  pendingAbort?: ReturnType<typeof setTimeout>;
  response: Promise<ReceivedResponse>;
}

/** Nome do cookie de CSRF antes da troca de marca. Fixo, não configurável. */
const LEGACY_CSRF_COOKIE_NAME = "atendly_csrf";

/**
 * Adapter HTTP do frontend contra o BFF.
 *
 * Sobre o token de CSRF: a Avenly publica frontend e BFF em hosts distintos,
 * sob um sufixo público, e o cookie legível `avenly_csrf` é gravado no host do
 * BFF. `document.cookie` do frontend nunca enxerga esse cookie, então lê-lo não
 * funciona no ambiente publicado — só em desenvolvimento, onde os dois estão em
 * `localhost`. Por isso o canal primário aqui é o header `x-csrf-token` da
 * resposta, exposto pelo CORS apenas para a origem permitida: o adapter guarda
 * o valor **em memória** e o reenvia na mutação seguinte. O cookie continua
 * sendo lido como segunda opção, para o caso mesma origem; na falta dele vale
 * `atendly_csrf`, o nome anterior, que uma sessão aberta antes da troca de
 * marca ainda pode ter.
 *
 * O token não autoriza nada sozinho: o par esperado fica no servidor, ligado à
 * sessão, e é lá que a comparação acontece.
 */
export class BffHttpClient {
  private readonly baseUrl: URL;
  private readonly csrfHeaderName: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly getCsrfToken: () => string | undefined;
  private csrfToken: string | undefined;
  private readonly inFlightReads = new Map<string, InFlightRead>();

  constructor(options: BffHttpClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.csrfHeaderName = options.csrfHeaderName ?? "x-csrf-token";
    this.fetchImplementation =
      options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    const cookieName = options.csrfCookieName ?? "avenly_csrf";
    this.getCsrfToken =
      options.getCsrfToken ??
      (() =>
        this.csrfToken ??
        readCookie(cookieName) ??
        readCookie(LEGACY_CSRF_COOKIE_NAME));
  }

  /**
   * Descarta o token guardado. Usado no logout: a sessão foi revogada no
   * servidor e o token dela não vale mais para nada.
   */
  resetCsrfToken(): void {
    this.csrfToken = undefined;
  }

  /**
   * Leitura compartilhada: quem pede a mesma URL com os mesmos headers enquanto
   * ela ainda está em voo recebe a mesma resposta, sem outra ida ao BFF.
   *
   * Cada chamador mantém o próprio `signal`: ao abortar, só ele é rejeitado. A
   * requisição de rede só é cancelada quando nenhum chamador sobrou, e um tick
   * depois — é o intervalo em que o React (StrictMode em dev) desmonta e
   * remonta o efeito; a remontagem reaproveita a leitura em vez de abortar uma
   * e disparar outra igual.
   */
  private sharedRead(
    url: URL,
    headers: Headers,
    signal: AbortSignal | undefined,
  ): Promise<ReceivedResponse> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));

    const key = readKey(url, headers);
    let read = this.inFlightReads.get(key);
    if (!read) {
      const controller = new AbortController();
      const response = this.receive(url, {
        credentials: "include",
        headers,
        method: "GET",
        signal: controller.signal,
      });
      const created: InFlightRead = {
        abort: () => {
          if (this.inFlightReads.get(key) === created) {
            this.inFlightReads.delete(key);
          }
          controller.abort();
        },
        callers: 0,
        response,
      };
      const forget = () => {
        if (this.inFlightReads.get(key) === created) {
          this.inFlightReads.delete(key);
        }
      };
      response.then(forget, forget);
      this.inFlightReads.set(key, created);
      read = created;
    }

    const shared = read;
    if (shared.pendingAbort !== undefined) {
      clearTimeout(shared.pendingAbort);
      shared.pendingAbort = undefined;
    }
    shared.callers += 1;
    if (!signal) return shared.response;

    let leave = () => {};
    const left = new Promise<never>((_, reject) => {
      leave = () => {
        reject(abortReason(signal));
        shared.callers -= 1;
        if (shared.callers === 0) {
          shared.pendingAbort = setTimeout(shared.abort, 0);
        }
      };
      signal.addEventListener("abort", leave, { once: true });
    });
    return Promise.race([shared.response, left]).finally(() =>
      signal.removeEventListener("abort", leave),
    );
  }

  private async receive(
    url: URL,
    init: RequestInit,
  ): Promise<ReceivedResponse> {
    const response = await this.fetchImplementation(url, init);

    // Antes de qualquer decisão sobre o status: toda resposta autenticada por
    // cookie carrega o token vigente, inclusive as de erro. É assim que o
    // adapter se recupera de um reload — e de um 403 por token defasado.
    const issuedCsrfToken = response.headers.get(this.csrfHeaderName);
    if (issuedCsrfToken) this.csrfToken = issuedCsrfToken;

    const requestId =
      response.headers.get("x-request-id") ??
      new Headers(init.headers).get("x-request-id") ??
      "";
    return {
      ok: response.ok,
      payload: await parseJson(response, requestId),
      requestId,
      status: response.status,
      statusText: response.statusText,
    };
  }

  async request<TSchema extends z.ZodType>(
    options: BffRequestOptions<TSchema>,
  ): Promise<z.output<TSchema>> {
    const { data } = await this.requestWithStatus(options);
    return data;
  }

  /**
   * Igual a `request`, mas também devolve o status HTTP da resposta — a
   * maioria das chamadas não precisa disso (o envelope já diz sucesso ou
   * erro), mas o envio de mensagem distingue `201` confirmado de `202`
   * tentativa registrada, e só o status bruto carrega essa diferença.
   */
  async requestWithStatus<TSchema extends z.ZodType>(
    options: BffRequestOptions<TSchema>,
  ): Promise<{ data: z.output<TSchema>; status: number }> {
    const method = options.method ?? "GET";
    const requestId = options.requestId ?? createRequestId();
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");
    headers.set("x-request-id", requestId);

    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    if (!isSafeMethod(method)) {
      const csrfToken = this.getCsrfToken();
      if (csrfToken) headers.set(this.csrfHeaderName, csrfToken);
    }

    const url = buildUrl(this.baseUrl, options.path, options.query);
    let response: ReceivedResponse;
    try {
      if (isSafeMethod(method)) {
        response = await this.sharedRead(url, headers, options.signal);
      } else {
        // Uma leitura iniciada antes desta mutação pode trazer o estado
        // anterior a ela: quem ler depois começa uma requisição nova.
        this.inFlightReads.clear();
        response = await this.receive(url, {
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          credentials: "include",
          headers,
          method,
          signal: options.signal,
        });
      }
    } catch (error: unknown) {
      if (error instanceof BffHttpError) throw error;
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
        message: "Não foi possível acessar a Avenly.",
        requestId,
        status: 0,
      });
    }

    const { payload } = response;
    const responseRequestId = response.requestId || requestId;

    if (!response.ok) {
      reportUnauthorized(options.path, response.status);
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
        message: "A Avenly retornou uma resposta inválida.",
        requestId: responseRequestId,
        status: response.status,
      });
    }

    const parsedData = options.schema.safeParse(parsedEnvelope.data.data);
    if (!parsedData.success) {
      throw new BffHttpError({
        code: "INVALID_RESPONSE",
        details: parsedData.error.flatten(),
        message: "A Avenly retornou dados inválidos.",
        requestId: parsedEnvelope.data.requestId,
        status: response.status,
      });
    }

    return { data: parsedData.data, status: response.status };
  }

  /**
   * Corpo bruto (não JSON) de uma rota de mídia — proxy fino para o BFF, que
   * por sua vez repassa a rota interna da IA. Recusas próprias chegam como o
   * mesmo envelope de erro JSON das demais rotas.
   */
  async requestBinary(options: {
    path: string;
    headers?: Readonly<Record<string, string>>;
    requestId?: string;
    signal?: AbortSignal;
  }): Promise<{ blob: Blob; contentType: string; fileName: string | null }> {
    const requestId = options.requestId ?? createRequestId();
    const headers = new Headers(options.headers);
    headers.set("x-request-id", requestId);

    let response: Response;
    try {
      response = await this.fetchImplementation(
        buildUrl(this.baseUrl, options.path),
        {
          credentials: "include",
          headers,
          method: "GET",
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
        message: "Não foi possível acessar a Avenly.",
        requestId,
        status: 0,
      });
    }

    const issuedCsrfToken = response.headers.get(this.csrfHeaderName);
    if (issuedCsrfToken) this.csrfToken = issuedCsrfToken;
    const responseRequestId = response.headers.get("x-request-id") ?? requestId;

    if (!response.ok) {
      const payload = await parseJson(response, responseRequestId);
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

    return {
      blob: await response.blob(),
      contentType:
        response.headers.get("content-type") ?? "application/octet-stream",
      fileName: fileNameFromContentDisposition(
        response.headers.get("content-disposition"),
      ),
    };
  }
}

function normalizeBaseUrl(value: string): URL {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("BFF base URL is required.");

  const normalized = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  const url = trimmed.startsWith("/")
    ? new URL(normalized, globalThis.location?.origin ?? "http://localhost")
    : new URL(normalized);
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
      message: "A Avenly retornou uma resposta inválida.",
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

/** URL e headers enviados, menos o `x-request-id`, que é único por chamada. */
function readKey(url: URL, headers: Headers): string {
  const sent = [...headers].filter(([name]) => name !== "x-request-id");
  return JSON.stringify([url.href, sent]);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Aborted", "AbortError");
}

function isSafeMethod(method: HttpMethod): boolean {
  return method === "GET";
}

function fileNameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const match = /filename="([^"]*)"/u.exec(value);
  return match ? match[1] : null;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (!entry.startsWith(prefix)) continue;
    const value = decodeURIComponent(entry.slice(prefix.length));
    return value || undefined;
  }
  return undefined;
}
