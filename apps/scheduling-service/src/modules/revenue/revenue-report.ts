import type { PrismaClient } from "../../generated/prisma/client.js";
import type { PriceType } from "../../generated/prisma/enums.js";
import {
  addDays,
  instantToLocalDateTime,
  localDateTimeToInstant,
  weekdayIndex,
} from "../../shared/date-time/calendar-date-time.js";

/**
 * Faturamento do negócio (D-177): quanto a profissional atendeu num dia,
 * semana, mês ou ano, somado no servidor a partir do snapshot comercial de
 * cada atendimento — mudar o preço do serviço depois nunca reescreve um mês
 * que já passou.
 *
 * Valor de um atendimento, nesta ordem:
 * 1. o valor final registrado pela profissional, quando existe;
 * 2. senão, a soma dos preços do acordo, só quando **todos** os itens têm
 *    preço fixo;
 * 3. senão, nenhum: "a partir de", "sob consulta", "não informado" e o
 *    atendimento avulso sem valor final não viram número — entram na
 *    contagem de atendimentos sem valor.
 *
 * Faturado é só o que foi concluído. Previsto é o que está confirmado e
 * ainda vai acontecer. Os dois nunca se somam.
 */

export const REVENUE_PERIODS = ["day", "week", "month", "year"] as const;
export type RevenuePeriod = (typeof REVENUE_PERIODS)[number];

export const REVENUE_TOP_CUSTOMERS = 5;

/** Nome do grupo dos atendimentos avulsos, sem serviço do catálogo. */
export const UNLISTED_SERVICE_NAME = "Outros atendimentos";

export interface RevenueAppointmentRow {
  status: string;
  startAt: Date;
  customerId: string;
  customerName: string | null;
  finalValue: unknown;
  items: Array<{
    serviceId: string;
    serviceName: string;
    colorToken: string | null;
    priceType: PriceType;
    price: unknown;
  }>;
}

export interface RevenueReportInput {
  period: RevenuePeriod;
  /** Qualquer dia do período pedido (`YYYY-MM-DD`, fuso do negócio). */
  date: string;
  timeZone: string;
  now: Date;
}

export interface RevenueRange {
  /** Primeiro dia, inclusivo. */
  start: string;
  /** Dia seguinte ao último, exclusivo. */
  end: string;
}

export interface RevenueReport {
  period: RevenuePeriod;
  start: string;
  /** Último dia do período, inclusivo. */
  end: string;
  today: string;
  timezone: string;
  billed: {
    amount: number;
    count: number;
    unvaluedCount: number;
    averageTicket: number | null;
  };
  expected: { amount: number; count: number; unvaluedCount: number };
  previous: {
    start: string;
    end: string;
    amount: number;
    count: number;
    /** O período pedido ainda está correndo: a comparação corta no mesmo ponto. */
    partial: boolean;
  };
  lost: {
    cancelledCount: number;
    cancelledAmount: number;
    noShowCount: number;
    noShowAmount: number;
  };
  services: Array<{
    serviceId: string | null;
    name: string;
    colorToken: string | null;
    amount: number;
    count: number;
    share: number;
  }>;
  customers: Array<{
    customerId: string;
    name: string | null;
    amount: number;
    count: number;
  }>;
  weekdays: Array<{ weekday: number; amount: number; count: number }>;
  series: Array<{
    start: string;
    amount: number;
    count: number;
    expectedAmount: number;
  }>;
}

// --- Períodos ---------------------------------------------------------------

function dateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Mesmo dia `amount` meses depois, preso ao fim do mês (31/03 − 1 = 28/02). */
function addMonthsClamped(date: string, amount: number): string {
  const { year, month, day } = dateParts(date);
  const index = year * 12 + (month - 1) + amount;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return formatDate(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  );
}

/** Desloca uma data por `amount` períodos inteiros. */
function shiftByPeriod(
  date: string,
  period: RevenuePeriod,
  amount: number,
): string {
  if (period === "day") return addDays(date, amount);
  if (period === "week") return addDays(date, amount * 7);
  if (period === "month") return addMonthsClamped(date, amount);
  return addMonthsClamped(date, amount * 12);
}

/** O período que contém `date`; a semana vai de segunda a domingo. */
export function revenuePeriodRange(
  period: RevenuePeriod,
  date: string,
): RevenueRange {
  const { year, month } = dateParts(date);
  if (period === "day") return { start: date, end: addDays(date, 1) };
  if (period === "week") {
    const start = addDays(date, -((weekdayIndex(date) + 6) % 7));
    return { start, end: addDays(start, 7) };
  }
  if (period === "month") {
    const start = formatDate(year, month, 1);
    return { start, end: addMonthsClamped(start, 1) };
  }
  const start = formatDate(year, 1, 1);
  return { start, end: formatDate(year + 1, 1, 1) };
}

/**
 * Período anterior de mesmo tamanho. Se o pedido ainda está correndo (hoje
 * cai dentro dele), a comparação corta no mesmo ponto do anterior: 1 a 16 de
 * outubro contra 1 a 16 de setembro, nunca contra setembro inteiro.
 */
export function previousRevenueRange(
  period: RevenuePeriod,
  range: RevenueRange,
  today: string,
): RevenueRange & { partial: boolean } {
  const start = shiftByPeriod(range.start, period, -1);
  const fullEnd = range.start;
  const running = today >= range.start && today < range.end;
  if (!running) return { start, end: fullEnd, partial: false };
  const cut = shiftByPeriod(addDays(today, 1), period, -1);
  const end = cut < fullEnd ? cut : fullEnd;
  return { start, end: end > start ? end : addDays(start, 1), partial: true };
}

// --- Valor ------------------------------------------------------------------

function toCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function fromCents(cents: number): number {
  return cents / 100;
}

/** Valor do acordo pelo snapshot, sem olhar o valor final. */
function agreementCents(row: RevenueAppointmentRow): number | null {
  if (row.items.length === 0) return null;
  let total = 0;
  for (const item of row.items) {
    const price = item.priceType === "FIXED" ? toCents(item.price) : null;
    if (price === null) return null;
    total += price;
  }
  return total;
}

/** Valor do atendimento concluído: o final registrado vence o do acordo. */
export function appointmentValueCents(
  row: RevenueAppointmentRow,
): number | null {
  return toCents(row.finalValue) ?? agreementCents(row);
}

/**
 * Parte de cada item no valor do atendimento. Sem valor final, cada item
 * leva o próprio preço. Com valor final, ele é dividido na proporção dos
 * preços fixos do acordo; sem essa proporção (preço não fixo ou todos zero),
 * em partes iguais. Os centavos que sobram vão para os primeiros itens, para
 * a soma das partes fechar no valor exato.
 */
export function splitAcrossItems(
  row: RevenueAppointmentRow,
  totalCents: number,
): number[] {
  const count = row.items.length;
  if (count === 0) return [];
  const prices = row.items.map((item) =>
    item.priceType === "FIXED" ? toCents(item.price) : null,
  );
  const fixed = prices.filter((price): price is number => price !== null);
  const weights = fixed.length === count ? fixed : prices.map(() => 1);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const effective = weightTotal > 0 ? weights : weights.map(() => 1);
  const effectiveTotal = weightTotal > 0 ? weightTotal : count;
  const shares = effective.map((weight) =>
    Math.floor((totalCents * weight) / effectiveTotal),
  );
  let remainder = totalCents - shares.reduce((sum, share) => sum + share, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % count) {
    shares[index] = (shares[index] ?? 0) + 1;
    remainder -= 1;
  }
  return shares;
}

// --- Relatório --------------------------------------------------------------

function seriesBuckets(
  period: RevenuePeriod,
  range: RevenueRange,
): string[] {
  if (period === "day") return [];
  const buckets: string[] = [];
  if (period === "year") {
    for (let month = 0; month < 12; month += 1) {
      buckets.push(addMonthsClamped(range.start, month));
    }
    return buckets;
  }
  for (let day = range.start; day < range.end; day = addDays(day, 1)) {
    buckets.push(day);
  }
  return buckets;
}

function bucketOf(period: RevenuePeriod, date: string): string {
  return period === "year" ? `${date.slice(0, 7)}-01` : date;
}

export function buildRevenueReport(
  rows: readonly RevenueAppointmentRow[],
  input: RevenueReportInput,
): RevenueReport {
  const { period, timeZone, now } = input;
  const today = instantToLocalDateTime(now, timeZone).date;
  const range = revenuePeriodRange(period, input.date);
  const previous = previousRevenueRange(period, range, today);

  const billed = { amount: 0, count: 0, unvaluedCount: 0, valuedCount: 0 };
  const expected = { amount: 0, count: 0, unvaluedCount: 0 };
  const previousTotals = { amount: 0, count: 0 };
  const lost = {
    cancelledCount: 0,
    cancelledAmount: 0,
    noShowCount: 0,
    noShowAmount: 0,
  };
  const services = new Map<
    string,
    {
      serviceId: string | null;
      name: string;
      colorToken: string | null;
      amount: number;
      count: number;
    }
  >();
  const customers = new Map<
    string,
    { customerId: string; name: string | null; amount: number; count: number }
  >();
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    amount: 0,
    count: 0,
  }));
  const bucketKeys = seriesBuckets(period, range);
  const series = new Map(
    bucketKeys.map((start) => [
      start,
      { start, amount: 0, count: 0, expectedAmount: 0 },
    ]),
  );

  for (const row of rows) {
    const date = instantToLocalDateTime(row.startAt, timeZone).date;
    const inPeriod = date >= range.start && date < range.end;
    const inPrevious = date >= previous.start && date < previous.end;

    if (row.status === "COMPLETED") {
      const value = appointmentValueCents(row);
      if (inPrevious) {
        previousTotals.count += 1;
        previousTotals.amount += value ?? 0;
      }
      if (!inPeriod) continue;
      billed.count += 1;
      if (value === null) {
        billed.unvaluedCount += 1;
      } else {
        billed.valuedCount += 1;
        billed.amount += value;
      }
      const amount = value ?? 0;

      const customer = customers.get(row.customerId) ?? {
        customerId: row.customerId,
        name: row.customerName,
        amount: 0,
        count: 0,
      };
      customer.amount += amount;
      customer.count += 1;
      customers.set(row.customerId, customer);

      const weekday = weekdays[weekdayIndex(date)];
      if (weekday) {
        weekday.amount += amount;
        weekday.count += 1;
      }

      const bucket = series.get(bucketOf(period, date));
      if (bucket) {
        bucket.amount += amount;
        bucket.count += 1;
      }

      const parts =
        row.items.length === 0 ? [amount] : splitAcrossItems(row, amount);
      const entries =
        row.items.length === 0
          ? [{ key: "", serviceId: null, name: UNLISTED_SERVICE_NAME, colorToken: null }]
          : row.items.map((item) => ({
              key: item.serviceId,
              serviceId: item.serviceId,
              name: item.serviceName,
              colorToken: item.colorToken,
            }));
      entries.forEach((entry, index) => {
        const service = services.get(entry.key) ?? {
          serviceId: entry.serviceId,
          name: entry.name,
          colorToken: entry.colorToken,
          amount: 0,
          count: 0,
        };
        service.amount += parts[index] ?? 0;
        service.count += 1;
        services.set(entry.key, service);
      });
      continue;
    }

    if (!inPeriod) continue;

    if (row.status === "CONFIRMED") {
      // Confirmado que já passou e ainda não foi concluído é transitório (a
      // conclusão automática chega em 30 minutos): não é previsto nem faturado.
      if (row.startAt < now) continue;
      const value = appointmentValueCents(row);
      expected.count += 1;
      if (value === null) expected.unvaluedCount += 1;
      else expected.amount += value;
      const bucket = series.get(bucketOf(period, date));
      if (bucket) bucket.expectedAmount += value ?? 0;
      continue;
    }

    // O que deixou de entrar usa o preço do acordo: valor final é de
    // atendimento feito.
    const agreement = agreementCents(row) ?? 0;
    if (row.status === "CANCELLED") {
      lost.cancelledCount += 1;
      lost.cancelledAmount += agreement;
    } else if (row.status === "NO_SHOW") {
      lost.noShowCount += 1;
      lost.noShowAmount += agreement;
    }
  }

  const byAmount = <T extends { amount: number; count: number }>(
    a: T,
    b: T,
  ) => b.amount - a.amount || b.count - a.count;

  return {
    period,
    start: range.start,
    end: addDays(range.end, -1),
    today,
    timezone: timeZone,
    billed: {
      amount: fromCents(billed.amount),
      count: billed.count,
      unvaluedCount: billed.unvaluedCount,
      averageTicket:
        billed.valuedCount > 0
          ? fromCents(Math.round(billed.amount / billed.valuedCount))
          : null,
    },
    expected: {
      amount: fromCents(expected.amount),
      count: expected.count,
      unvaluedCount: expected.unvaluedCount,
    },
    previous: {
      start: previous.start,
      end: addDays(previous.end, -1),
      amount: fromCents(previousTotals.amount),
      count: previousTotals.count,
      partial: previous.partial,
    },
    lost: {
      cancelledCount: lost.cancelledCount,
      cancelledAmount: fromCents(lost.cancelledAmount),
      noShowCount: lost.noShowCount,
      noShowAmount: fromCents(lost.noShowAmount),
    },
    services: [...services.values()]
      .sort((a, b) => byAmount(a, b) || a.name.localeCompare(b.name, "pt-BR"))
      .map((service) => ({
        ...service,
        amount: fromCents(service.amount),
        share: billed.amount > 0 ? service.amount / billed.amount : 0,
      })),
    customers: [...customers.values()]
      .filter((customer) => customer.amount > 0)
      .sort(byAmount)
      .slice(0, REVENUE_TOP_CUSTOMERS)
      .map((customer) => ({ ...customer, amount: fromCents(customer.amount) })),
    weekdays: weekdays.map((weekday) => ({
      ...weekday,
      amount: fromCents(weekday.amount),
    })),
    // O Map guarda a ordem de inserção: a mesma de `bucketKeys`.
    series: [...series.values()].map((bucket) => ({
      ...bucket,
      amount: fromCents(bucket.amount),
      expectedAmount: fromCents(bucket.expectedAmount),
    })),
  };
}

/**
 * Lê só o que o relatório precisa, do negócio pedido, entre o início do
 * período anterior e o fim do pedido. A soma acontece aqui, nunca no
 * navegador.
 */
export async function loadRevenueReport(
  prisma: PrismaClient,
  tenantId: string,
  input: RevenueReportInput,
): Promise<RevenueReport> {
  const today = instantToLocalDateTime(input.now, input.timeZone).date;
  const range = revenuePeriodRange(input.period, input.date);
  const previous = previousRevenueRange(input.period, range, today);
  const rows = await prisma.appointment.findMany({
    where: {
      tenantId,
      startAt: {
        gte: localDateTimeToInstant(previous.start, "00:00", input.timeZone),
        lt: localDateTimeToInstant(range.end, "00:00", input.timeZone),
      },
      status: { in: ["COMPLETED", "CONFIRMED", "CANCELLED", "NO_SHOW"] },
    },
    select: {
      status: true,
      startAt: true,
      customerId: true,
      finalValue: true,
      customer: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          serviceId: true,
          serviceNameSnapshot: true,
          priceTypeSnapshot: true,
          priceSnapshot: true,
          service: { select: { name: true, colorToken: true } },
        },
      },
    },
  });
  return buildRevenueReport(
    rows.map((row) => ({
      status: row.status,
      startAt: row.startAt,
      customerId: row.customerId,
      customerName: row.customer.name,
      finalValue: row.finalValue,
      items: row.items.map((item) => ({
        serviceId: item.serviceId,
        // O nome de hoje agrupa o serviço mesmo que ele tenha sido renomeado;
        // o preço é sempre o do dia do atendimento.
        serviceName: item.service.name || item.serviceNameSnapshot,
        colorToken: item.service.colorToken,
        priceType: item.priceTypeSnapshot,
        price: item.priceSnapshot,
      })),
    })),
    input,
  );
}
