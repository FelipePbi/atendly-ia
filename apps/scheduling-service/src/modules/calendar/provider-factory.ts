import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AtendlyCalendarProvider } from "../integrations/atendly/provider.js";
import type { CalendarProvider } from "./calendar-provider.js";

/**
 * Corte do writer remoto (Goal010, WU-07): a Agenda Atendly e a unica fonte
 * operacional. `MinhaAgendaCalendarProvider` nao e importado aqui de
 * proposito — nenhum caminho operacional (escrita ou oferta de horarios)
 * pode instanciar o provider remoto, nem por engano. A leitura da origem
 * sobrevive apenas dentro da importacao (`getImportSnapshot`, Goal010),
 * chamada direto pelo modulo de importacao, nunca por esta factory.
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
