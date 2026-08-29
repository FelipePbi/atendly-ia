import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AtendlyCalendarProvider } from "../integrations/atendly/provider.js";
import { parseMinhaAgendaConnection } from "../integrations/minha-agenda/config.js";
import { MinhaAgendaCalendarProvider } from "../integrations/minha-agenda/provider.js";
import type { CalendarProvider } from "./calendar-provider.js";

export class CalendarProviderFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    tenantId: string;
    userId: string;
    timeZone: string;
    source: "ATENDLY" | "MINHA_AGENDA";
  }): Promise<CalendarProvider> {
    if (input.source === "ATENDLY") {
      return new AtendlyCalendarProvider(
        this.prisma,
        input.tenantId,
        input.userId,
        input.timeZone,
      );
    }

    const connection = await this.prisma.integrationConnection.findUnique({
      where: {
        tenantId_provider: {
          tenantId: input.tenantId,
          provider: "MINHA_AGENDA",
        },
      },
    });
    if (!connection) {
      throw new AppError(
        "INTEGRATION_CONNECTION_NOT_FOUND",
        "Minha Agenda connection was not found for this tenant.",
        404,
      );
    }

    return new MinhaAgendaCalendarProvider(
      parseMinhaAgendaConnection({
        tenantId: connection.tenantId,
        credentialsEncrypted: connection.credentialsEncrypted,
        config: connection.config,
      }),
    );
  }
}
