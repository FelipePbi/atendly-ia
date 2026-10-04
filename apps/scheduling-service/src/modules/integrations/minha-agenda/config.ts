import { z } from "zod";

import { env } from "../../../config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { decryptIntegrationCredentials } from "../credentials.js";

// Credencial gravada (Goal060 §2): so e-mail e senha. `username` continua
// aceito para a linha antiga (Goal010), gravada como {basicAuth, username,
// password} antes deste Goal — ela permanece legivel, e o valor vira o mesmo
// campo interno (`username`) que o cliente usa no login.
const credentialsSchema = z
  .object({
    email: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1),
  })
  .refine((value) => Boolean(value.email ?? value.username), {
    message: "email or username is required",
  })
  .transform((value) => ({
    username: (value.email ?? value.username) as string,
    password: value.password,
  }));

// Configuracao gravada (Goal060 §1): so o profissional descoberto. Endereco,
// cliente OAuth, timeout e skew de renovacao viraram configuracao do sistema
// (env), nunca do negocio. A linha antiga, gravada com baseUrl, paymentMethod,
// modelVersion etc., continua legivel: `z.object` sem `.strict()` ignora as
// chaves que este schema nao declara.
const connectionConfigSchema = z.object({
  employeeId: z.number().int().positive(),
});

export interface MinhaAgendaConnectionRecord {
  tenantId: string;
  credentialsEncrypted: Uint8Array;
  config: unknown;
}

export interface MinhaAgendaConnectionConfig {
  tenantId: string;
  baseUrl: string;
  basicAuth: string;
  username: string;
  password: string;
  employeeId: number;
  timeoutMs: number;
  refreshSkewSeconds: number;
}

/** Superficie que `MinhaAgendaClient` de fato usa, sem o `employeeId` que so a leitura por categoria (import-source-reader) precisa. */
export type MinhaAgendaClientConfig = Pick<
  MinhaAgendaConnectionConfig,
  | "tenantId"
  | "baseUrl"
  | "basicAuth"
  | "username"
  | "password"
  | "timeoutMs"
  | "refreshSkewSeconds"
>;

// Timeout e skew de renovacao fixos do sistema (Goal060 §1): o 061 e quem
// decide mudar o timeout, nao este Goal.
const SYSTEM_TIMEOUT_MS = 10_000;
const SYSTEM_REFRESH_SKEW_SECONDS = 300;

export interface MinhaAgendaSystemSettings {
  baseUrl: string;
  basicAuth: string;
  timeoutMs: number;
  refreshSkewSeconds: number;
}

/**
 * Endereco e cliente OAuth do sistema (Goal060 §1), iguais para todo negocio.
 * Sem `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` (identificacao do app do portal,
 * fornecida pela operacao, nunca pela pessoa), conectar a Minha Agenda fica
 * indisponivel antes de qualquer chamada de rede ou escrita; o resto do
 * servico sobe normalmente, com um aviso no log (Goal082).
 */
export function minhaAgendaSystemSettings(): MinhaAgendaSystemSettings {
  if (!env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL) {
    throw new AppError(
      "MINHA_AGENDA_NOT_CONFIGURED",
      "The Minha Agenda origin is not configured on this environment.",
      503,
    );
  }
  return {
    baseUrl: env.MINHA_AGENDA_API_BASE_URL,
    basicAuth: env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL,
    timeoutMs: SYSTEM_TIMEOUT_MS,
    refreshSkewSeconds: SYSTEM_REFRESH_SKEW_SECONDS,
  };
}

/**
 * Regra de negocio da descoberta (Goal060 §3): o MVP importa um profissional
 * so. Zero ou mais de um nunca escolhem por conta propria — cada caso sai com
 * a classe de erro propria da tabela do §4.
 */
export function resolveDiscoveredEmployeeId(
  professionals: ReadonlyArray<{ id: number }>,
): number {
  if (professionals.length === 0) {
    throw new AppError(
      "MINHA_AGENDA_PROFESSIONAL_NOT_FOUND",
      "The Minha Agenda account has no professional to import.",
      422,
    );
  }
  if (professionals.length > 1) {
    throw new AppError(
      "MINHA_AGENDA_MULTIPLE_PROFESSIONALS",
      "The Minha Agenda account has more than one professional; Avenly imports a single professional's calendar for now.",
      422,
    );
  }
  return professionals[0].id;
}

export function parseMinhaAgendaConnection(
  connection: MinhaAgendaConnectionRecord,
): MinhaAgendaConnectionConfig {
  const settings = minhaAgendaSystemSettings();
  const credentials = credentialsSchema.safeParse(
    decryptIntegrationCredentials(
      connection.tenantId,
      connection.credentialsEncrypted,
    ),
  );
  const config = connectionConfigSchema.safeParse(connection.config);
  if (!credentials.success || !config.success) {
    throw new AppError(
      "INTEGRATION_CONFIGURATION_INVALID",
      "Minha Agenda connection configuration is invalid.",
      500,
    );
  }

  return {
    tenantId: connection.tenantId,
    baseUrl: settings.baseUrl,
    basicAuth: settings.basicAuth,
    username: credentials.data.username,
    password: credentials.data.password,
    employeeId: config.data.employeeId,
    timeoutMs: settings.timeoutMs,
    refreshSkewSeconds: settings.refreshSkewSeconds,
  };
}
