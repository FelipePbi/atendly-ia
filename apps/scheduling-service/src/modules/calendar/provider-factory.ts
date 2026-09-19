import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AtendlyCalendarProvider } from "../integrations/atendly/provider.js";
import type { CalendarProvider } from "./calendar-provider.js";

/**
 * Corte do writer remoto (Goal010, WU-07; retirado por completo no
 * Goal026): a Agenda Atendly e a unica fonte operacional. Nao existe mais
 * um provider remoto para instanciar — `MinhaAgendaImportSourceReader` nao
 * implementa `CalendarProvider` e so serve a leitura da importacao unica
 * (`getImportSnapshot`, Goal010), chamada direto pelo modulo de importacao,
 * nunca por esta factory.
 */
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

    throw new AppError(
      "MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED",
      "Minha Agenda no longer serves operational reads, writes or availability offers; it can only be read from during the one-time import.",
      409,
    );
  }
}
