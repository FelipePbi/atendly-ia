import type { z } from "zod";

import { AppError } from "../../../shared/errors/app-error.js";
import type { MinhaAgendaClientConfig } from "./config.js";
import {
  type AppointmentRangeQuery,
  type MinhaAgendaAppointment,
  minhaAgendaAppointmentSchema,
  minhaAgendaAuthResponseSchema,
  type MinhaAgendaCustomer,
  minhaAgendaCustomerSchema,
  type MinhaAgendaProfessional,
  minhaAgendaProfessionalSchema,
  type MinhaAgendaService,
  minhaAgendaServiceSchema,
  type WorkSchedule,
  workScheduleSchema,
} from "./types.js";

interface TokenCache {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * Superficie publica usada por quem le a origem (provider/leitor de
 * importacao). Extraida para permitir um dublê nos testes sem depender da
 * implementacao HTTP concreta.
 */
export interface MinhaAgendaSourceClient {
  listServices(): Promise<MinhaAgendaService[]>;
  /**
   * Diretorio completo de clientes (Goal062, WU-01). Opcional na interface:
   * um dublê de teste sem este metodo faz o leitor recuar para a cobertura
   * so por agendamento/bloqueio ja lido, no mesmo espirito de antes.
   */
  listCustomers?(): Promise<MinhaAgendaCustomer[]>;
  findAppointmentsByDateRange(
    query: AppointmentRangeQuery,
  ): Promise<MinhaAgendaAppointment[]>;
  getCompanyWorkSchedule(): Promise<WorkSchedule>;
  getEmployeeWorkScheduleByEmployeeId(
    employeeId: number,
  ): Promise<WorkSchedule>;
}

export class MinhaAgendaClient implements MinhaAgendaSourceClient {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: MinhaAgendaClientConfig) {}

  async listServices(): Promise<MinhaAgendaService[]> {
    return this.request(
      "/services",
      minhaAgendaServiceSchema.array(),
      "services",
    );
  }

  /**
   * Descoberta do profissional (Goal060 §3): mesmo cliente autenticado, sem
   * outro filtro que a baseline (mapa historico) justifique.
   */
  async listProfessionals(): Promise<MinhaAgendaProfessional[]> {
    return this.request(
      "/employees/professionals",
      minhaAgendaProfessionalSchema.array(),
      "employees.professionals",
      {},
      { includeDeleted: false },
    );
  }

  async listCustomers(): Promise<MinhaAgendaCustomer[]> {
    return this.request(
      "/customers",
      minhaAgendaCustomerSchema.array(),
      "customers",
    );
  }

  async findAppointmentsByDateRange(
    query: AppointmentRangeQuery,
  ): Promise<MinhaAgendaAppointment[]> {
    return this.request(
      "/appointments/appsByDateRange",
      minhaAgendaAppointmentSchema.array(),
      "appointments.byDateRange",
      {},
      { ...query },
    );
  }

  async getCompanyWorkSchedule(): Promise<WorkSchedule> {
    return this.request(
      "/companyWorkSchedule",
      workScheduleSchema,
      "schedule.company",
    );
  }

  async getEmployeeWorkScheduleByEmployeeId(
    employeeId: number,
  ): Promise<WorkSchedule> {
    return this.request(
      `/employeeWorkScheduleByEmployeeId/${employeeId}`,
      workScheduleSchema,
      "schedule.employee",
    );
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    context: string,
    options: {
      method?: "GET" | "POST" | "PUT";
      body?: unknown;
      idempotencyKey?: string;
    } = {},
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<T> {
    const url = buildUrl(this.config.baseUrl, path, query);
    const headers = await this.authHeaders();
    if (options.idempotencyKey) {
      headers["idempotency-key"] = options.idempotencyKey;
    }

    let raw: unknown;
    try {
      raw = await fetchJson(url, options, headers, this.config.timeoutMs);
    } catch (error) {
      if (error instanceof AppError && originStatus(error) === 401) {
        this.tokenCache = null;
        const retryHeaders = await this.authHeaders(true);
        if (options.idempotencyKey) {
          retryHeaders["idempotency-key"] = options.idempotencyKey;
        }
        raw = await fetchJson(
          url,
          options,
          retryHeaders,
          this.config.timeoutMs,
        );
      } else {
        throw error;
      }
    }

    return parseSourceResponse(schema, raw, context);
  }

  private async authHeaders(
    forceRefresh = false,
  ): Promise<Record<string, string>> {
    const token = await this.getAccessToken(forceRefresh);
    return { app_is_web: "true", authorization: `Bearer ${token}` };
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.tokenCache && this.tokenCache.expiresAtMs > now) {
      return this.tokenCache.accessToken;
    }

    const auth = this.config.basicAuth.startsWith("Basic ")
      ? this.config.basicAuth
      : `Basic ${this.config.basicAuth}`;
    const body = new URLSearchParams({
      username: this.config.username,
      password: this.config.password,
      grant_type: "password",
    });

    let response: Response;
    try {
      response = await fetch(
        buildUrl(this.config.baseUrl, "/oauth/token", { isWeb: true }),
        {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            authorization: auth,
            app_is_web: "true",
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new AppError(
          "MINHA_AGENDA_TIMEOUT",
          "Minha Agenda authentication request timed out.",
          504,
        );
      }
      throw new AppError(
        "MINHA_AGENDA_UNREACHABLE",
        "Minha Agenda authentication endpoint could not be reached.",
        502,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      // De quem e a falha (Goal082 §1): `invalid_grant` e 400 sao a pessoa
      // (e-mail ou senha); 401 e a identificacao do app recusada, falha nossa.
      // O status da origem nunca vira o nosso — ele fica em `details`, nunca
      // no `statusCode`. Do corpo, so o campo `error` e lido.
      if (response.status === 400 || response.status === 401) {
        const personRefused =
          readOAuthErrorCode(errorBody) === "invalid_grant" ||
          response.status === 400;
        if (personRefused) {
          throw new AppError(
            "MINHA_AGENDA_AUTH_FAILED",
            "Minha Agenda authentication failed: invalid credentials.",
            422,
            { originStatus: response.status },
          );
        }
        throw new AppError(
          "MINHA_AGENDA_CLIENT_REJECTED",
          "Minha Agenda rejected the Avenly application credential.",
          503,
          { originStatus: response.status },
        );
      }
      throw new AppError(
        "MINHA_AGENDA_HTTP_ERROR",
        `Minha Agenda authentication endpoint returned HTTP ${response.status}.`,
        502,
        { originStatus: response.status },
      );
    }

    const rawAuth: unknown = await response.json();
    const parsed = parseSourceResponse(
      minhaAgendaAuthResponseSchema,
      rawAuth,
      "auth.token",
    );
    const ttlMs = Math.max(
      0,
      parsed.expires_in * 1_000 - this.config.refreshSkewSeconds * 1_000,
    );
    this.tokenCache = {
      accessToken: parsed.access_token,
      expiresAtMs: now + ttlMs,
    };
    return parsed.access_token;
  }
}

export function createMinhaAgendaClient(
  config: MinhaAgendaClientConfig,
): MinhaAgendaClient {
  return new MinhaAgendaClient(config);
}

/** Campo `error` do corpo de erro do `/oauth/token`, normalizado; `undefined` se vazio, nao JSON ou nao texto. Nada mais do corpo e lido. */
function readOAuthErrorCode(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const value = (parsed as { error?: unknown }).error;
    return typeof value === "string" ? value.trim().toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** Status HTTP da origem que causou o erro, quando conhecido (Goal060 §4). Nunca o `statusCode` do próprio erro — esse nunca é 401/403 para código `MINHA_AGENDA_*`. */
function originStatus(error: AppError): number | undefined {
  const details = error.details as { originStatus?: number } | undefined;
  return details?.originStatus;
}

/**
 * A resposta do Minha Agenda passa por schema antes de qualquer mapeamento
 * (Goal010): resposta fora do contrato falha identificada pela categoria da
 * chamada e por uma causa sanitizada — nunca vira `undefined` silencioso.
 * A causa fica limitada a caminho e codigo do erro Zod; o payload da origem
 * nunca entra na mensagem nem nos `details`.
 */
function parseSourceResponse<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  context: string,
): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError(
      "MINHA_AGENDA_INVALID_RESPONSE",
      `Minha Agenda response for "${context}" did not match the expected contract.`,
      502,
      { context, issues: sanitizeIssues(result.error) },
    );
  }
  return result.data;
}

function sanitizeIssues(
  error: z.ZodError,
): Array<{ path: string; code: string }> {
  return error.issues.slice(0, 10).map((issue) => ({
    path: issue.path.join(".") || "(root)",
    code: issue.code,
  }));
}

async function fetchJson(
  url: string,
  options: { method?: string; body?: unknown },
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AppError(
        "MINHA_AGENDA_TIMEOUT",
        "Minha Agenda request timed out.",
        504,
      );
    }
    throw new AppError(
      "MINHA_AGENDA_UNREACHABLE",
      "Minha Agenda could not be reached.",
      502,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    // O status da origem nunca vira o nosso (Goal060 §4): fica em `details`,
    // nunca no `statusCode` — por isso nenhum `MINHA_AGENDA_*` sai 401/403.
    throw new AppError(
      "MINHA_AGENDA_HTTP_ERROR",
      `Minha Agenda returned HTTP ${response.status}.`,
      502,
      { originStatus: response.status },
    );
  }
  if (!text) return undefined;
  return JSON.parse(text) as unknown;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
