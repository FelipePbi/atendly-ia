import { describe, expect, it } from "vitest";

import {
  buildRevenueReport,
  previousRevenueRange,
  type RevenueAiContext,
  type RevenueAppointmentRow,
  revenuePeriodRange,
  splitAcrossItems,
  UNLISTED_SERVICE_NAME,
} from "../../src/modules/revenue/revenue-report.js";
import { localDateTimeToInstant } from "../../src/shared/date-time/calendar-date-time.js";

/**
 * Faturamento (D-177): soma no servidor, pelo snapshot do dia do atendimento.
 * Cada teste aqui falharia se uma regra da decisão voltasse atrás.
 */

const timeZone = "America/Sao_Paulo";
// Sexta, 16/10/2026, 15:00 no fuso do negócio.
const now = localDateTimeToInstant("2026-10-16", "15:00", timeZone);

function at(date: string, time = "10:00"): Date {
  return localDateTimeToInstant(date, time, timeZone);
}

type Item = RevenueAppointmentRow["items"][number];

function item(overrides: Partial<Item> = {}): Item {
  return {
    serviceId: "svc-cilios",
    serviceName: "Cílios 5D",
    colorToken: "ROSE",
    priceType: "FIXED",
    price: "150.00",
    ...overrides,
  };
}

function row(
  overrides: Partial<RevenueAppointmentRow> = {},
): RevenueAppointmentRow {
  return {
    status: "COMPLETED",
    startAt: at("2026-10-05"),
    customerId: "cus-ana",
    customerName: "Ana",
    finalValue: null,
    items: [item()],
    ...overrides,
  };
}

function report(
  rows: RevenueAppointmentRow[],
  period: "day" | "week" | "month" | "year" = "month",
  date = "2026-10-16",
) {
  return buildRevenueReport(rows, { period, date, timeZone, now });
}

describe("revenue report: faturado e previsto", () => {
  it("faturado é só o concluído; confirmado futuro é previsto e nunca entra no faturado", () => {
    const result = report([
      row({ status: "COMPLETED" }),
      row({ status: "CONFIRMED", startAt: at("2026-10-20") }),
      row({ status: "CANCELLED", startAt: at("2026-10-06") }),
      row({ status: "NO_SHOW", startAt: at("2026-10-07") }),
    ]);
    expect(result.billed).toEqual({
      amount: 150,
      count: 1,
      unvaluedCount: 0,
      averageTicket: 150,
    });
    expect(result.expected).toEqual({
      amount: 150,
      count: 1,
      unvaluedCount: 0,
    });
  });

  it("confirmado que já passou não é previsto nem faturado", () => {
    const result = report([
      row({ status: "CONFIRMED", startAt: at("2026-10-16", "09:00") }),
    ]);
    expect(result.expected.count).toBe(0);
    expect(result.billed.count).toBe(0);
  });

  it("falta e cancelamento contam à parte, pelo preço do acordo", () => {
    const result = report([
      row({ status: "CANCELLED", finalValue: "999.00" }),
      row({ status: "NO_SHOW", items: [item({ price: "80.00" })] }),
      row({
        status: "NO_SHOW",
        items: [item({ priceType: "ON_REQUEST", price: null })],
      }),
    ]);
    expect(result.lost).toEqual({
      cancelledCount: 1,
      cancelledAmount: 150,
      noShowCount: 2,
      noShowAmount: 80,
    });
    expect(result.billed.amount).toBe(0);
  });
});

describe("revenue report: preço do dia e atendimentos sem valor", () => {
  it("usa o preço gravado no atendimento, não o do catálogo de hoje", () => {
    // O preço de hoje do serviço não chega ao relatório: só o snapshot.
    const result = report([
      row({ startAt: at("2026-10-02"), items: [item({ price: "120.00" })] }),
      row({ startAt: at("2026-10-09"), items: [item({ price: "150.00" })] }),
    ]);
    expect(result.billed.amount).toBe(270);
    expect(result.services[0]).toMatchObject({ amount: 270, count: 2 });
  });

  it("valor final registrado vence o preço do acordo", () => {
    const result = report([row({ finalValue: "175.50" })]);
    expect(result.billed.amount).toBe(175.5);
  });

  it("sob consulta, a partir de e não informado sem valor final viram atendimento sem valor", () => {
    const result = report([
      row({ items: [item({ priceType: "ON_REQUEST", price: null })] }),
      row({ items: [item({ priceType: "STARTING_AT", price: "100.00" })] }),
      row({ items: [item({ priceType: "NOT_INFORMED", price: null })] }),
      row({ items: [], finalValue: null }),
      row(),
    ]);
    expect(result.billed).toEqual({
      amount: 150,
      count: 5,
      unvaluedCount: 4,
      averageTicket: 150,
    });
  });

  it("um item sem preço fixo deixa o atendimento todo sem valor", () => {
    const result = report([
      row({
        items: [
          item(),
          item({
            serviceId: "svc-sob",
            serviceName: "Design",
            priceType: "ON_REQUEST",
            price: null,
          }),
        ],
      }),
    ]);
    expect(result.billed.amount).toBe(0);
    expect(result.billed.unvaluedCount).toBe(1);
    expect(result.billed.averageTicket).toBeNull();
  });

  it("sob consulta com valor final registrado conta pelo valor final", () => {
    const result = report([
      row({
        items: [item({ priceType: "ON_REQUEST", price: null })],
        finalValue: "90.00",
      }),
    ]);
    expect(result.billed).toMatchObject({ amount: 90, unvaluedCount: 0 });
  });
});

describe("revenue report: por serviço", () => {
  it("divide o atendimento com vários serviços e calcula a participação", () => {
    const result = report([
      row({
        items: [
          item(),
          item({
            serviceId: "svc-sobrancelha",
            serviceName: "Sobrancelha",
            colorToken: "AMBER",
            price: "50.00",
          }),
        ],
      }),
      row({ items: [item()] }),
    ]);
    expect(result.billed.amount).toBe(350);
    expect(result.services).toEqual([
      {
        serviceId: "svc-cilios",
        name: "Cílios 5D",
        colorToken: "ROSE",
        colorHex: null,
        amount: 300,
        count: 2,
        share: 300 / 350,
      },
      {
        serviceId: "svc-sobrancelha",
        name: "Sobrancelha",
        colorToken: "AMBER",
        colorHex: null,
        amount: 50,
        count: 1,
        share: 50 / 350,
      },
    ]);
  });

  it("valor final de vários serviços é dividido na proporção dos preços, sem perder centavo", () => {
    const shares = splitAcrossItems(
      row({
        items: [
          item({ price: "100.00" }),
          item({ serviceId: "b", price: "50.00" }),
        ],
      }),
      10_001,
    );
    expect(shares).toEqual([6_668, 3_333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10_001);
  });

  it("atendimento avulso com valor final entra em Outros atendimentos", () => {
    const result = report([row({ items: [], finalValue: "60.00" })]);
    expect(result.services).toEqual([
      {
        serviceId: null,
        name: UNLISTED_SERVICE_NAME,
        colorToken: null,
        colorHex: null,
        amount: 60,
        count: 1,
        share: 1,
      },
    ]);
  });
});

describe("revenue report: períodos e comparação", () => {
  it("semana vai de segunda a domingo; mês e ano fecham no último dia", () => {
    expect(revenuePeriodRange("week", "2026-10-16")).toEqual({
      start: "2026-10-12",
      end: "2026-10-19",
    });
    expect(revenuePeriodRange("month", "2026-02-10")).toEqual({
      start: "2026-02-01",
      end: "2026-03-01",
    });
    expect(revenuePeriodRange("year", "2026-10-16")).toEqual({
      start: "2026-01-01",
      end: "2027-01-01",
    });
  });

  it("mês correndo compara com o mesmo trecho do mês anterior", () => {
    expect(
      previousRevenueRange(
        "month",
        revenuePeriodRange("month", "2026-10-16"),
        "2026-10-16",
      ),
    ).toEqual({ start: "2026-09-01", end: "2026-09-17", partial: true });
    expect(
      previousRevenueRange(
        "month",
        revenuePeriodRange("month", "2026-03-31"),
        "2026-03-31",
      ),
    ).toEqual({ start: "2026-02-01", end: "2026-03-01", partial: true });
  });

  it("período fechado compara com o anterior inteiro", () => {
    expect(
      previousRevenueRange(
        "month",
        revenuePeriodRange("month", "2026-09-10"),
        "2026-10-16",
      ),
    ).toEqual({ start: "2026-08-01", end: "2026-09-01", partial: false });
  });

  it("o anterior soma só o que cabe no trecho comparável", () => {
    const result = report([
      row({ startAt: at("2026-09-10") }),
      row({ startAt: at("2026-09-25") }),
      row({ startAt: at("2026-10-05") }),
    ]);
    expect(result.previous).toEqual({
      start: "2026-09-01",
      end: "2026-09-16",
      amount: 150,
      count: 1,
      partial: true,
    });
  });

  it("o dia do atendimento é o do fuso do negócio", () => {
    // 23:30 de 31/10 em São Paulo já é 01/11 em UTC.
    const result = report([row({ startAt: at("2026-10-31", "23:30") })]);
    expect(result.billed.count).toBe(1);
  });

  it("ano traz doze meses na série; previsto entra à parte em cada mês", () => {
    const result = report(
      [
        row({ startAt: at("2026-03-10") }),
        row({ startAt: at("2026-03-20"), items: [item({ price: "100.00" })] }),
        row({ status: "CONFIRMED", startAt: at("2026-11-02") }),
      ],
      "year",
    );
    expect(result.series).toHaveLength(12);
    expect(result.series[2]).toEqual({
      start: "2026-03-01",
      amount: 250,
      count: 2,
      expectedAmount: 0,
      aiAmount: 0,
    });
    expect(result.series[10]).toEqual({
      start: "2026-11-01",
      amount: 0,
      count: 0,
      expectedAmount: 150,
      aiAmount: 0,
    });
  });

  it("clientes que mais faturaram e dia da semana", () => {
    const result = report([
      row({ customerId: "a", customerName: "Ana", startAt: at("2026-10-03") }),
      row({ customerId: "a", customerName: "Ana", startAt: at("2026-10-10") }),
      row({
        customerId: "b",
        customerName: "Bia",
        startAt: at("2026-10-06"),
        items: [item({ price: "80.00" })],
      }),
      row({
        customerId: "c",
        customerName: "Cris",
        items: [item({ priceType: "ON_REQUEST", price: null })],
      }),
    ]);
    expect(result.customers).toEqual([
      { customerId: "a", name: "Ana", amount: 300, count: 2 },
      { customerId: "b", name: "Bia", amount: 80, count: 1 },
    ]);
    // 03/10 e 10/10 são sábados.
    expect(result.weekdays[6]).toEqual({ weekday: 6, amount: 300, count: 2 });
  });
});

/**
 * O que a IA fez (D-178): só o que dá para provar a partir da agenda.
 */
describe("o que a IA fez", () => {
  // Seg a sex, 09:00 às 18:00.
  const openingWindows = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 9 * 60,
    endMinute: 18 * 60,
  }));

  function context(
    overrides: Partial<RevenueAiContext> = {},
  ): RevenueAiContext {
    return {
      firstAppointments: new Map(),
      importedCustomerIds: new Set(),
      openingWindows,
      acquiredRows: [],
      ...overrides,
    };
  }

  it("separa o faturado e o previsto que a IA marcou, e a parte dela no total", () => {
    const result = buildRevenueReport(
      [
        row({ source: "AI", finalValue: "400.00" }),
        row({ source: "USER", finalValue: "600.00" }),
        row({
          source: "AI",
          status: "CONFIRMED",
          startAt: at("2026-10-20"),
          finalValue: null,
        }),
      ],
      { period: "month", date: "2026-10-16", timeZone, now },
      context(),
    );
    expect(result.ai.billed).toEqual({ amount: 400, count: 1 });
    expect(result.ai.expected).toEqual({ amount: 150, count: 1 });
    expect(result.ai.share).toBeCloseTo(0.4);
    // Na barra do dia, a parte da IA fica separada.
    const day = result.series.find((bucket) => bucket.start === "2026-10-05");
    expect(day).toMatchObject({ amount: 1000, aiAmount: 400 });
  });

  it("sem faturado, a parte da IA é nula, não zero por cento", () => {
    const result = buildRevenueReport(
      [],
      { period: "month", date: "2026-10-16", timeZone, now },
      context(),
    );
    expect(result.ai.share).toBeNull();
  });

  it("cliente novo é quem teve o primeiro agendamento marcado pela IA no período, nunca importado", () => {
    const firstAppointments = new Map([
      ["cus-nova", { createdAt: at("2026-10-02", "21:00"), source: "AI" }],
      ["cus-antiga", { createdAt: at("2026-08-02"), source: "AI" }],
      ["cus-manual", { createdAt: at("2026-10-03"), source: "USER" }],
      ["cus-importada", { createdAt: at("2026-10-03"), source: "AI" }],
    ]);
    const result = buildRevenueReport(
      [
        row({ customerId: "cus-nova", customerName: "Bia", source: "AI" }),
        row({ customerId: "cus-nova", customerName: "Bia", source: "USER" }),
        row({ customerId: "cus-antiga", source: "AI" }),
        row({ customerId: "cus-manual", source: "USER" }),
        row({ customerId: "cus-importada", source: "AI" }),
      ],
      { period: "month", date: "2026-10-16", timeZone, now },
      context({
        firstAppointments,
        importedCustomerIds: new Set(["cus-importada"]),
        acquiredRows: [
          row({ customerId: "cus-nova" }),
          row({ customerId: "cus-antiga", startAt: at("2026-08-10") }),
          row({ customerId: "cus-antiga", status: "CANCELLED" }),
          row({ customerId: "cus-manual" }),
        ],
      }),
    );
    // A segunda visita da Bia, marcada por ela, também conta: a cliente veio pela IA.
    expect(result.ai.newCustomers).toEqual({
      count: 1,
      amount: 300,
      names: ["Bia"],
    });
    // Desde sempre: Bia e a cliente antiga; cancelado e cliente manual não entram.
    expect(result.ai.acquired).toEqual({ customers: 2, amount: 300 });
  });

  it("fora do horário conta só o que a IA marcou quando você não atendia", () => {
    const result = buildRevenueReport(
      [
        // Marcado às 23:00 de uma terça: fora.
        row({ source: "AI", createdAt: at("2026-10-06", "23:00") }),
        // Marcado num domingo à tarde: fora.
        row({ source: "AI", createdAt: at("2026-10-04", "15:00") }),
        // Marcado às 10:00 de uma quarta: dentro.
        row({ source: "AI", createdAt: at("2026-10-07", "10:00") }),
        // Marcado por você de madrugada: não é da IA.
        row({ source: "USER", createdAt: at("2026-10-06", "02:00") }),
        // Fechado por exceção o dia inteiro: fora.
        row({ source: "AI", createdAt: at("2026-10-12", "11:00") }),
      ],
      { period: "month", date: "2026-10-16", timeZone, now },
      context({ closedDates: new Set(["2026-10-12"]) }),
    );
    expect(result.ai.afterHours).toEqual({ count: 3, amount: 450 });
  });

  it("sem horário cadastrado, nada conta como fora do horário", () => {
    const result = buildRevenueReport(
      [row({ source: "AI", createdAt: at("2026-10-06", "23:00") })],
      { period: "month", date: "2026-10-16", timeZone, now },
      context({ openingWindows: [] }),
    );
    expect(result.ai.afterHours).toEqual({ count: 0, amount: 0 });
  });

  it("remarcação da IA conta só quando o atendimento foi concluído", () => {
    const result = buildRevenueReport(
      [
        row({ rescheduledByAi: true }),
        row({ rescheduledByAi: true, status: "CANCELLED" }),
        row({ rescheduledByAi: false }),
      ],
      { period: "month", date: "2026-10-16", timeZone, now },
      context(),
    );
    expect(result.ai.rescheduled).toEqual({ count: 1, amount: 150 });
  });

  it("sem o contexto da IA, o relatório de sempre continua igual", () => {
    const result = report([row({ source: "AI" })]);
    expect(result.billed.amount).toBe(150);
    expect(result.ai.newCustomers.count).toBe(0);
    expect(result.ai.afterHours.count).toBe(0);
  });
});
