import type { PrismaClient } from "../../generated/prisma/client.js";
import { AtendlyCalendarProvider } from "../integrations/atendly/provider.js";
import type { CalendarProvider } from "./calendar-provider.js";

/**
 * Retirada da fonte externa (Goal027): a Agenda Atendly e a unica fonte
 * operacional que existe, entao nao ha o que escolher aqui — esta factory
 * so instancia `AtendlyCalendarProvider`. O ramo de recusa por fonte saiu
 * junto com o codigo `MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED`: a
 * invariante que ele defendia mora agora na constraint `CHECK` de
 * `CalendarSettings.source`, e nao num `if` que nunca pode ser verdadeiro.
 *
 * Nao existe provider remoto para instanciar — `MinhaAgendaImportSourceReader`
 * nao implementa `CalendarProvider` e so serve a leitura da importacao unica
 * (`getImportSnapshot`, Goal010), chamada direto pelo modulo de importacao,
 * nunca por esta factory.
 */
export class CalendarProviderFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    tenantId: string;
    userId: string;
    timeZone: string;
  }): Promise<CalendarProvider> {
    return new AtendlyCalendarProvider(
      this.prisma,
      input.tenantId,
      input.userId,
      input.timeZone,
    );
  }
}
