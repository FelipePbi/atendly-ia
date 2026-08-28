import { z } from "zod";

import { AppError } from "../../../shared/errors/app-error.js";
import { decryptIntegrationCredentials } from "../credentials.js";

const credentialsSchema = z.object({
  basicAuth: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

const connectionConfigSchema = z.object({
  baseUrl: z.string().url(),
  employeeId: z.number().int().positive(),
  paymentMethod: z.string().min(1),
  modelVersion: z.number().int().positive().default(2),
  timeoutMs: z.number().int().positive().max(60_000).default(10_000),
  refreshSkewSeconds: z.number().int().nonnegative().max(3_600).default(300),
  enableWrites: z.boolean().default(false),
  bufferBetweenServicesMinutes: z.number().int().nonnegative().default(0),
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
  paymentMethod: string;
  modelVersion: number;
  timeoutMs: number;
  refreshSkewSeconds: number;
  enableWrites: boolean;
  bufferBetweenServicesMinutes: number;
}

export function parseMinhaAgendaConnection(
  connection: MinhaAgendaConnectionRecord,
): MinhaAgendaConnectionConfig {
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
    ...credentials.data,
    ...config.data,
  };
}
