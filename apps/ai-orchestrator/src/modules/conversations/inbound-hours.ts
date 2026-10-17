import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Mensagens de clientes por hora da semana (D-178), para o Faturamento dizer
 * a quem ainda não usa a IA quantas mensagens chegaram fora do horário de
 * atendimento. Só conta: nada de texto, contato ou conversa sai daqui.
 *
 * Índice `dia * 24 + hora` no fuso do negócio, com domingo = 0. Conversas
 * marcadas como pessoais ficam de fora: não são cliente.
 */
export const WEEK_HOURS = 7 * 24;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Posição do instante na semana do fuso: `dia * 24 + hora`. */
export function weekHourOf(
  instant: Date,
  formatter: Intl.DateTimeFormat,
): number {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const weekday = WEEKDAY_INDEX[parts.weekday ?? ""] ?? 0;
  const hour = Number(parts.hour ?? 0) % 24;
  return weekday * 24 + hour;
}

export function weekHourFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
}

export async function countInboundMessagesByWeekHour(
  prisma: PrismaClient,
  tenantId: string,
  input: { from: Date; to: Date; timeZone: string },
): Promise<number[]> {
  const messages = await prisma.message.findMany({
    where: {
      tenantId,
      direction: "INBOUND",
      createdAt: { gte: input.from, lt: input.to },
      conversation: {
        OR: [
          { contactId: null },
          { contact: { categoryOverride: null } },
          {
            contact: {
              categoryOverride: { in: ["COMMERCIAL", "UNCLASSIFIED"] },
            },
          },
        ],
      },
    },
    select: { createdAt: true },
  });
  const hours = Array.from({ length: WEEK_HOURS }, () => 0);
  const formatter = weekHourFormatter(input.timeZone);
  for (const message of messages) {
    const index = weekHourOf(message.createdAt, formatter);
    hours[index] = (hours[index] ?? 0) + 1;
  }
  return hours;
}
