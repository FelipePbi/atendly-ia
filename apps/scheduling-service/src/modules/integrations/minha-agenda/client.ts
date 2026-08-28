import { AppError } from "../../../shared/errors/app-error.js";
import type { MinhaAgendaConnectionConfig } from "./config.js";
import type {
  AppointmentRangeQuery,
  CreateAppointmentInput,
  CreateCustomerInput,
  MinhaAgendaAppointment,
  MinhaAgendaAuthResponse,
  MinhaAgendaCustomer,
  MinhaAgendaService,
  UpdateAppointmentInput,
  WorkSchedule,
} from "./types.js";

interface TokenCache {
  accessToken: string;
  expiresAtMs: number;
}

export class MinhaAgendaClient {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: MinhaAgendaConnectionConfig) {}

  async listServices(): Promise<MinhaAgendaService[]> {
    return this.request<MinhaAgendaService[]>("/services");
  }

  async searchCustomers(query: string): Promise<MinhaAgendaCustomer[]> {
    return this.request<MinhaAgendaCustomer[]>(
      "/customers/search",
      {},
      {
        query,
      },
    );
  }

  async createCustomer(
    input: CreateCustomerInput,
    idempotencyKey: string,
  ): Promise<MinhaAgendaCustomer> {
    return this.request<MinhaAgendaCustomer>("/customers", {
      method: "POST",
      body: input,
      idempotencyKey,
    });
  }

  async findAppointmentsByDateRange(
    query: AppointmentRangeQuery,
  ): Promise<MinhaAgendaAppointment[]> {
    return this.request<MinhaAgendaAppointment[]>(
      "/appointments/appsByDateRange",
      {},
      { ...query },
    );
  }

  async appointmentExists(query: {
    employeeId: number;
    date: string;
    startTime: string;
    exceptForId?: number;
  }): Promise<boolean> {
    return this.request<boolean>("/appointments/exists", {}, query);
  }

  async getAppointment(id: number): Promise<MinhaAgendaAppointment> {
    return this.request<MinhaAgendaAppointment>(`/appointments/${id}`);
  }

  async createAppointment(
    input: CreateAppointmentInput,
    idempotencyKey: string,
  ): Promise<MinhaAgendaAppointment> {
    return this.request<MinhaAgendaAppointment>("/appointments", {
      method: "POST",
      body: input,
      idempotencyKey,
    });
  }

  async updateAppointment(
    id: number,
    input: UpdateAppointmentInput,
    idempotencyKey: string,
  ): Promise<MinhaAgendaAppointment> {
    return this.request<MinhaAgendaAppointment>(`/appointments/${id}`, {
      method: "PUT",
      body: input,
      idempotencyKey,
    });
  }

  async cancelWithComments(
    id: number,
    comments: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.request<void>(`/appointments/cancelWithComments/${id}`, {
      method: "PUT",
      body: { comments },
      idempotencyKey,
    });
  }

  async getCompanyWorkSchedule(): Promise<WorkSchedule> {
    return this.request<WorkSchedule>("/companyWorkSchedule");
  }

  async getEmployeeWorkScheduleByEmployeeId(
    employeeId: number,
  ): Promise<WorkSchedule> {
    return this.request<WorkSchedule>(
      `/employeeWorkScheduleByEmployeeId/${employeeId}`,
    );
  }

  private async request<T>(
    path: string,
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

    try {
      return await fetchJson<T>(url, options, headers, this.config.timeoutMs);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        this.tokenCache = null;
        const retryHeaders = await this.authHeaders(true);
        if (options.idempotencyKey) {
          retryHeaders["idempotency-key"] = options.idempotencyKey;
        }
        return fetchJson<T>(url, options, retryHeaders, this.config.timeoutMs);
      }
      throw error;
    }
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
    const response = await fetch(
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

    if (!response.ok) {
      await response.text();
      throw new AppError(
        "MINHA_AGENDA_AUTH_FAILED",
        `Minha Agenda authentication failed with HTTP ${response.status}.`,
        response.status,
      );
    }

    const parsed = (await response.json()) as MinhaAgendaAuthResponse;
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
  config: MinhaAgendaConnectionConfig,
): MinhaAgendaClient {
  return new MinhaAgendaClient(config);
}

async function fetchJson<T>(
  url: string,
  options: { method?: string; body?: unknown },
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<T> {
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
    throw error;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new AppError(
      "MINHA_AGENDA_HTTP_ERROR",
      `Minha Agenda returned HTTP ${response.status}.`,
      response.status,
    );
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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
