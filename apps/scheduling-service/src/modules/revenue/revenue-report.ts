import type { PrismaClient } from "../../generated/prisma/client.js";
import type { PriceType } from "../../generated/prisma/enums.js";
import {
  addDays,
  databaseDate,
  databaseTimeToMinutes,
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
 *
 * O que a IA fez (D-178) sai dos mesmos atendimentos, contando só o que dá
 * para provar: quem marcou (`source = AI`), o primeiro agendamento de cada
 * cliente, a hora em que a IA marcou contra o horário de atendimento e as
 * remarcações feitas pela IA. Nada é estimado.
 */

export const REVENUE_PERIODS = ["day", "week", "month", "year"] as const;
export type RevenuePeriod = (typeof REVENUE_PERIODS)[number];

export const REVENUE_TOP_CUSTOMERS = 5;

/** Nome do grupo dos atendimentos avulsos, sem serviço do catálogo. */
export const UNLISTED_SERVICE_NAME = "Outros atendimentos";

export interface RevenueAppointmentRow {
  status: string;
  startAt: Date;
  /** Quem marcou: `AI`, `USER` ou `INTEGRATION` (importação). */
  source?: string;
  /** Quando o atendimento foi marcado. */
  createdAt?: Date;
  /** A IA remarcou este atendimento ao menos uma vez. */
  rescheduledByAi?: boolean;
  customerId: string;
  customerName: string | null;
  finalValue: unknown;
  items: Array<{
    serviceId: string;
    serviceName: string;
    colorToken: string | null;
    colorHex?: string | null;
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
  /**
   * Quantos clientes vêm em `customers`, do que mais faturou para o que menos.
   * Ausente, os cinco do cartão (`REVENUE_TOP_CUSTOMERS`); `"all"`, todos com
   * valor no período — a lista completa do Faturamento (2026-10-18).
   */
  customers?: "top" | "all";
}

/** Uma faixa do horário de atendimento semanal, em minutos do dia. */
export interface OpeningWindow {
  /** 0 = domingo. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/**
 * O que o relatório precisa, além dos atendimentos do período, para dizer o
 * que a IA fez (D-178).
 */
export interface RevenueAiContext {
  /** Primeiro agendamento já criado para cada cliente, de qualquer status. */
  firstAppointments: ReadonlyMap<string, { createdAt: Date; source: string }>;
  /** Clientes que vieram de importação: nunca contam como trazidos pela IA. */
  importedCustomerIds: ReadonlySet<string>;
  /** Horário de atendimento semanal ativo. Vazio: nada conta como fora dele. */
  openingWindows: readonly OpeningWindow[];
  /** Dias inteiros fechados por exceção (`YYYY-MM-DD`). */
  closedDates?: ReadonlySet<string>;
  /** Atendimentos concluídos, de todo o histórico, dos clientes trazidos pela IA. */
  acquiredRows: readonly RevenueAppointmentRow[];
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
  /**
   * O período em instantes, cortado em agora: é o intervalo em que o BFF
   * conta as mensagens que chegaram (D-178).
   */
  window: { from: string; to: string };
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
    colorHex: string | null;
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
    /** Parte do faturado que veio de atendimentos marcados pela IA. */
    aiAmount: number;
  }>;
  ai: RevenueAiReport;
}

export interface RevenueAiReport {
  /** Concluídos no período que a IA marcou. */
  billed: { amount: number; count: number };
  /** Confirmados pela frente que a IA marcou. */
  expected: { amount: number; count: number };
  /** Parte do faturado do período que veio da IA; nula sem faturado. */
  share: number | null;
  /** Clientes cujo primeiro agendamento a IA marcou neste período. */
  newCustomers: { count: number; amount: number; names: string[] };
  /** Concluídos que a IA marcou fora do horário de atendimento. */
  afterHours: { count: number; amount: number };
  /** Concluídos que a IA remarcou, em vez de o horário se perder. */
  rescheduled: { count: number; amount: number };
  /** Desde sempre: clientes trazidos pela IA e o que já faturaram. */
  acquired: { customers: number; amount: number };
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

/**
 * Com o período correndo, o último dia do trecho comparável para na mesma
 * hora de agora: hoje às 13:40 compara com ontem até 13:40, e a semana até
 * quinta 13:40 com a anterior até quinta 13:40 — nunca com o dia inteiro.
 * Devolve o dia que leva o corte, ou nenhum.
 */
export function sameMomentCutDay(
  period: RevenuePeriod,
  previous: RevenueRange & { partial: boolean },
  today: string,
): string | null {
  if (!previous.partial) return null;
  const lastDay = addDays(previous.end, -1);
  return shiftByPeriod(today, period, -1) === lastDay ? lastDay : null;
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
export function agreementCents(row: RevenueAppointmentRow): number | null {
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

// --- IA ---------------------------------------------------------------------

/** Clientes trazidos pela IA: o primeiro agendamento foi dela e não vieram de importação. */
export function aiAcquiredCustomerIds(context: RevenueAiContext): Set<string> {
  const acquired = new Set<string>();
  for (const [customerId, first] of context.firstAppointments) {
    if (first.source !== "AI") continue;
    if (context.importedCustomerIds.has(customerId)) continue;
    acquired.add(customerId);
  }
  return acquired;
}

/**
 * Se o instante cai fora do horário de atendimento, no fuso do negócio. Sem
 * horário cadastrado não dá para afirmar nada: responde `false`.
 */
export function isOutsideOpeningHours(
  instant: Date,
  timeZone: string,
  windows: readonly OpeningWindow[],
  closedDates: ReadonlySet<string> = new Set(),
): boolean {
  if (windows.length === 0) return false;
  const local = instantToLocalDateTime(instant, timeZone);
  if (closedDates.has(local.date)) return true;
  const weekday = weekdayIndex(local.date);
  const [hour, minute] = local.time.split(":").map(Number) as [number, number];
  const minutes = hour * 60 + minute;
  return !windows.some(
    (window) =>
      window.weekday === weekday &&
      minutes >= window.startMinute &&
      minutes < window.endMinute,
  );
}

function periodWindow(
  range: RevenueRange,
  timeZone: string,
  now: Date,
): { from: string; to: string } {
  const from = localDateTimeToInstant(range.start, "00:00", timeZone);
  const end = localDateTimeToInstant(range.end, "00:00", timeZone);
  const to = end < now ? end : now;
  return {
    from: from.toISOString(),
    to: (to < from ? from : to).toISOString(),
  };
}

const EMPTY_AI_CONTEXT: RevenueAiContext = {
  firstAppointments: new Map(),
  importedCustomerIds: new Set(),
  openingWindows: [],
  acquiredRows: [],
};

// --- Relatório --------------------------------------------------------------

function seriesBuckets(period: RevenuePeriod, range: RevenueRange): string[] {
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
  aiContext: RevenueAiContext = EMPTY_AI_CONTEXT,
): RevenueReport {
  const { period, timeZone, now } = input;
  const { date: today, time: nowTime } = instantToLocalDateTime(now, timeZone);
  const range = revenuePeriodRange(period, input.date);
  const acquired = aiAcquiredCustomerIds(aiContext);
  // Clientes cujo primeiro agendamento a IA marcou dentro do período.
  const newByAi = new Map<string, { name: string | null; amount: number }>();
  for (const customerId of acquired) {
    const first = aiContext.firstAppointments.get(customerId);
    if (!first) continue;
    const createdOn = instantToLocalDateTime(first.createdAt, timeZone).date;
    if (createdOn >= range.start && createdOn < range.end) {
      newByAi.set(customerId, { name: null, amount: 0 });
    }
  }
  const ai = {
    billedAmount: 0,
    billedCount: 0,
    expectedAmount: 0,
    expectedCount: 0,
    afterHoursCount: 0,
    afterHoursAmount: 0,
    rescheduledCount: 0,
    rescheduledAmount: 0,
  };
  const previous = previousRevenueRange(period, range, today);
  const previousCutDay = sameMomentCutDay(period, previous, today);

  const billed ={ amount: 0, count: 0, unvaluedCount: 0, valuedCount: 0 };
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
      colorHex: string | null;
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
      { start, amount: 0, count: 0, expectedAmount: 0, aiAmount: 0 },
    ]),
  );

  for (const row of rows) {
    const local = instantToLocalDateTime(row.startAt, timeZone);
    const date = local.date;
    const inPeriod = date >= range.start && date < range.end;
    const inPrevious =
      date >= previous.start &&
      date < previous.end &&
      !(date === previousCutDay && local.time >= nowTime);

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

      if (row.source === "AI") {
        ai.billedCount += 1;
        ai.billedAmount += amount;
        if (bucket) bucket.aiAmount += amount;
        if (
          row.createdAt &&
          isOutsideOpeningHours(
            row.createdAt,
            timeZone,
            aiContext.openingWindows,
            aiContext.closedDates,
          )
        ) {
          ai.afterHoursCount += 1;
          ai.afterHoursAmount += amount;
        }
      }
      if (row.rescheduledByAi) {
        ai.rescheduledCount += 1;
        ai.rescheduledAmount += amount;
      }
      const newcomer = newByAi.get(row.customerId);
      if (newcomer) {
        newcomer.name = newcomer.name ?? row.customerName;
        newcomer.amount += amount;
      }

      const parts =
        row.items.length === 0 ? [amount] : splitAcrossItems(row, amount);
      const entries =
        row.items.length === 0
          ? [
              {
                key: "",
                serviceId: null,
                name: UNLISTED_SERVICE_NAME,
                colorToken: null,
                colorHex: null,
              },
            ]
          : row.items.map((item) => ({
              key: item.serviceId,
              serviceId: item.serviceId,
              name: item.serviceName,
              colorToken: item.colorToken,
              colorHex: item.colorHex ?? null,
            }));
      entries.forEach((entry, index) => {
        const service = services.get(entry.key) ?? {
          serviceId: entry.serviceId,
          name: entry.name,
          colorToken: entry.colorToken,
          colorHex: entry.colorHex,
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
      if (row.source === "AI") {
        ai.expectedCount += 1;
        ai.expectedAmount += value ?? 0;
      }
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

  let acquiredAmount = 0;
  for (const acquiredRow of aiContext.acquiredRows) {
    if (acquiredRow.status !== "COMPLETED") continue;
    if (!acquired.has(acquiredRow.customerId)) continue;
    acquiredAmount += appointmentValueCents(acquiredRow) ?? 0;
  }
  const newcomers = [...newByAi.values()].sort((a, b) => b.amount - a.amount);

  const byAmount = <T extends { amount: number; count: number }>(a: T, b: T) =>
    b.amount - a.amount || b.count - a.count;

  return {
    period,
    start: range.start,
    end: addDays(range.end, -1),
    today,
    timezone: timeZone,
    window: periodWindow(range, timeZone, now),
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
      .slice(0, input.customers === "all" ? undefined : REVENUE_TOP_CUSTOMERS)
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
      aiAmount: fromCents(bucket.aiAmount),
    })),
    ai: {
      billed: { amount: fromCents(ai.billedAmount), count: ai.billedCount },
      expected: {
        amount: fromCents(ai.expectedAmount),
        count: ai.expectedCount,
      },
      share: billed.amount > 0 ? ai.billedAmount / billed.amount : null,
      newCustomers: {
        count: newcomers.length,
        amount: fromCents(
          newcomers.reduce((sum, newcomer) => sum + newcomer.amount, 0),
        ),
        names: newcomers
          .map((newcomer) => newcomer.name)
          .filter((name): name is string => Boolean(name))
          .slice(0, 3),
      },
      afterHours: {
        count: ai.afterHoursCount,
        amount: fromCents(ai.afterHoursAmount),
      },
      rescheduled: {
        count: ai.rescheduledCount,
        amount: fromCents(ai.rescheduledAmount),
      },
      acquired: {
        customers: acquired.size,
        amount: fromCents(acquiredAmount),
      },
    },
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
  const aiContext = await loadRevenueAiContext(prisma, tenantId, input);
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
      source: true,
      createdAt: true,
      customerId: true,
      finalValue: true,
      customer: { select: { name: true } },
      events: {
        where: { type: "RESCHEDULED", source: "AI" },
        select: { id: true },
        take: 1,
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          serviceId: true,
          serviceNameSnapshot: true,
          priceTypeSnapshot: true,
          priceSnapshot: true,
          service: { select: { name: true, colorToken: true, colorHex: true } },
        },
      },
    },
  });
  return buildRevenueReport(
    rows.map((row) => ({
      status: row.status,
      startAt: row.startAt,
      source: row.source,
      createdAt: row.createdAt,
      rescheduledByAi: row.events.length > 0,
      customerId: row.customerId,
      customerName: row.customer.name,
      finalValue: row.finalValue,
      items: row.items.map((item) => ({
        serviceId: item.serviceId,
        // O nome de hoje agrupa o serviço mesmo que ele tenha sido renomeado;
        // o preço é sempre o do dia do atendimento.
        serviceName: item.service.name || item.serviceNameSnapshot,
        colorToken: item.service.colorToken,
        colorHex: item.service.colorHex,
        priceType: item.priceTypeSnapshot,
        price: item.priceSnapshot,
      })),
    })),
    input,
    aiContext,
  );
}

/**
 * O primeiro agendamento de cada cliente, os clientes importados, o horário
 * de atendimento e o histórico concluído dos clientes trazidos pela IA.
 */
async function loadRevenueAiContext(
  prisma: PrismaClient,
  tenantId: string,
  input: RevenueReportInput,
): Promise<RevenueAiContext> {
  const [firsts, imported, rules, closed] = await Promise.all([
    prisma.appointment.findMany({
      where: { tenantId },
      orderBy: [{ customerId: "asc" }, { createdAt: "asc" }],
      distinct: ["customerId"],
      select: { customerId: true, createdAt: true, source: true },
    }),
    prisma.externalEntityMap.findMany({
      where: { tenantId, entityType: "CUSTOMER" },
      select: { internalId: true },
    }),
    prisma.availabilityRule.findMany({
      where: { tenantId, active: true },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.availabilityException.findMany({
      where: { tenantId, available: false, startTime: null },
      select: { date: true },
    }),
  ]);
  const context: RevenueAiContext = {
    firstAppointments: new Map(
      firsts.map((first) => [
        first.customerId,
        { createdAt: first.createdAt, source: first.source },
      ]),
    ),
    importedCustomerIds: new Set(imported.map((entry) => entry.internalId)),
    openingWindows: rules.map((rule) => ({
      weekday: rule.dayOfWeek,
      startMinute: databaseTimeToMinutes(rule.startTime),
      endMinute: databaseTimeToMinutes(rule.endTime),
    })),
    closedDates: new Set(
      closed.map((exception) => databaseDate(exception.date)),
    ),
    acquiredRows: [],
  };
  const acquired = [...aiAcquiredCustomerIds(context)];
  if (acquired.length === 0) return context;
  const history = await prisma.appointment.findMany({
    where: {
      tenantId,
      customerId: { in: acquired },
      status: "COMPLETED",
      startAt: { lt: input.now },
    },
    select: {
      status: true,
      startAt: true,
      customerId: true,
      finalValue: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          serviceId: true,
          serviceNameSnapshot: true,
          priceTypeSnapshot: true,
          priceSnapshot: true,
        },
      },
    },
  });
  return {
    ...context,
    acquiredRows: history.map((row) => ({
      status: row.status,
      startAt: row.startAt,
      customerId: row.customerId,
      customerName: null,
      finalValue: row.finalValue,
      items: row.items.map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.serviceNameSnapshot,
        colorToken: null,
        priceType: item.priceTypeSnapshot,
        price: item.priceSnapshot,
      })),
    })),
  };
}
