import { describe, expect, it } from "vitest";

import {
  buildRevenueAppointmentList,
  REVENUE_APPOINTMENTS_LIMIT,
  type RevenueAppointmentRowWithChange,
} from "../../src/modules/revenue/revenue-appointments.js";
import { localDateTimeToInstant } from "../../src/shared/date-time/calendar-date-time.js";

/**
 * Os atendimentos por trás dos números do Faturamento (D-179): quais foram os
 * cancelados, as faltas e os concluídos sem valor, e quem fez cada mudança.
 */

const timeZone = "America/Sao_Paulo";

function at(date: string, time = "10:00"): Date {
  return localDateTimeToInstant(date, time, timeZone);
}

function row(
  overrides: Partial<RevenueAppointmentRowWithChange> = {},
): RevenueAppointmentRowWithChange {
  return {
    id: "apt-1",
    status: "CANCELLED",
    startAt: at("2026-10-05"),
    source: "USER",
    customerId: "cus-ana",
    customerName: "Ana",
    finalValue: null,
    change: { source: "USER", reason: null },
    items: [
      {
        serviceId: "svc-cilios",
        serviceName: "Cílios 5D",
        colorToken: null,
        priceType: "FIXED",
        price: "150.00",
      },
    ],
    ...overrides,
  };
}

const month = { period: "month" as const, date: "2026-10-16", timeZone };

describe("cancelados e faltas", () => {
  it("lista só o tipo pedido, do período, do mais recente para o mais antigo, com quem fez", () => {
    const list = buildRevenueAppointmentList(
      [
        row({ id: "a", startAt: at("2026-10-03"), source: "AI" }),
        row({
          id: "b",
          startAt: at("2026-10-12", "15:30"),
          change: { source: "AI", reason: "Cliente pediu pelo WhatsApp" },
        }),
        row({ id: "c", status: "NO_SHOW" }),
        row({ id: "d", startAt: at("2026-09-28") }),
        row({ id: "e", change: null }),
      ],
      { ...month, kind: "cancelled" },
    );
    expect(list.start).toBe("2026-10-01");
    expect(list.end).toBe("2026-10-31");
    expect(list.total).toBe(3);
    expect(list.items.map((item) => item.id)).toEqual(["b", "e", "a"]);
    expect(list.items[0]).toMatchObject({
      date: "2026-10-12",
      time: "15:30",
      customerName: "Ana",
      services: ["Cílios 5D"],
      amount: 150,
      bookedBy: "USER",
      changedBy: "AI",
      note: "Cliente pediu pelo WhatsApp",
      unvaluedReason: null,
    });
    // Sem registro de quem cancelou: não inventa.
    expect(list.items[1]?.changedBy).toBeNull();
    // Marcado pela IA, cancelado por você.
    expect(list.items[2]).toMatchObject({ bookedBy: "AI", changedBy: "USER" });
  });

  it("falta sem preço fixo no acordo não vira número", () => {
    const list = buildRevenueAppointmentList(
      [
        row({
          status: "NO_SHOW",
          items: [
            {
              serviceId: "svc-x",
              serviceName: "Mechas",
              colorToken: null,
              priceType: "ON_REQUEST",
              price: null,
            },
          ],
        }),
      ],
      { ...month, kind: "no_show" },
    );
    expect(list.items[0]?.amount).toBeNull();
  });

  it(`traz no máximo ${REVENUE_APPOINTMENTS_LIMIT}, e o total diz quantos havia`, () => {
    const rows = Array.from(
      { length: REVENUE_APPOINTMENTS_LIMIT + 5 },
      (_, index) => row({ id: `apt-${index}` }),
    );
    const list = buildRevenueAppointmentList(rows, {
      ...month,
      kind: "cancelled",
    });
    expect(list.total).toBe(REVENUE_APPOINTMENTS_LIMIT + 5);
    expect(list.items).toHaveLength(REVENUE_APPOINTMENTS_LIMIT);
  });
});

describe("concluídos sem valor", () => {
  it("lista só os concluídos que não viraram número, com o motivo", () => {
    const priced = (priceType: "ON_REQUEST" | "STARTING_AT" | "NOT_INFORMED") =>
      [
        {
          serviceId: `svc-${priceType}`,
          serviceName: priceType,
          colorToken: null,
          priceType,
          price: priceType === "STARTING_AT" ? "80.00" : null,
        },
      ] as RevenueAppointmentRowWithChange["items"];
    const list = buildRevenueAppointmentList(
      [
        row({ id: "fixo", status: "COMPLETED" }),
        row({
          id: "com-valor-final",
          status: "COMPLETED",
          finalValue: "90.00",
          items: priced("ON_REQUEST"),
        }),
        row({
          id: "consulta",
          status: "COMPLETED",
          startAt: at("2026-10-09"),
          items: priced("ON_REQUEST"),
        }),
        row({
          id: "a-partir",
          status: "COMPLETED",
          startAt: at("2026-10-08"),
          items: priced("STARTING_AT"),
        }),
        row({
          id: "sem-preco",
          status: "COMPLETED",
          startAt: at("2026-10-07"),
          items: priced("NOT_INFORMED"),
        }),
        row({
          id: "avulso",
          status: "COMPLETED",
          startAt: at("2026-10-06"),
          items: [],
        }),
      ],
      { ...month, kind: "unvalued" },
    );
    expect(list.items.map((item) => [item.id, item.unvaluedReason])).toEqual([
      ["consulta", "ON_REQUEST"],
      ["a-partir", "STARTING_AT"],
      ["sem-preco", "NOT_INFORMED"],
      ["avulso", "UNLISTED"],
    ]);
    expect(list.items.every((item) => item.amount === null)).toBe(true);
    expect(list.items.every((item) => item.changedBy === null)).toBe(true);
  });
});
