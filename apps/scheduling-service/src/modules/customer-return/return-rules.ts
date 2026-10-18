import {
  addDays,
  minutesFromTime,
  timeFromMinutes,
  weekdayIndex,
} from "../../shared/date-time/calendar-date-time.js";

/**
 * Regras puras do retorno de clientes (D-206, `06-Retorno-de-Clientes.md`).
 *
 * Nada aqui le banco nem relogio: quem chama entrega o historico ja no fuso
 * do negocio (`YYYY-MM-DD` e `HH:MM`) e o "hoje" local. E isso que deixa cada
 * regra do vault — prazo de volta, exclusoes, horarios de costume, ritmo e
 * prazo da cliente — provada sem PostgreSQL.
 */

export type ReturnKind = "RENEWAL" | "WINBACK";

/** Padroes do produto, valendo enquanto o negocio nao gravou configuracao. */
export const RETURN_SETTINGS_DEFAULTS = {
  dailyLimit: 10,
  windowDays: [1, 2, 3, 4, 5, 6],
  windowStartMinutes: 9 * 60,
  windowEndMinutes: 19 * 60,
  leadDays: 2,
  winbackDays: 60,
  winbackIncentive: null as string | null,
  renewalMessage: null as string | null,
  winbackMessage: null as string | null,
} as const;

export const RETURN_DAILY_LIMIT_MAX = 30;
/** Renovacao: ninguem recebe de novo dentro de 14 dias. */
export const RENEWAL_RECONTACT_DAYS = 14;
/** Resgate: ninguem recebe de novo dentro de 30 dias. */
export const WINBACK_RECONTACT_DAYS = 30;
/** Recusa ("agora nao"): sem mensagens de retorno por 90 dias. */
export const DECLINE_BLOCK_DAYS = 90;
/** Lembrete unico depois de 3 dias sem resposta. */
export const FOLLOW_UP_AFTER_DAYS = 3;
/** Intervalo sorteado entre dois envios do mesmo negocio, em minutos. */
export const SEND_GAP_MIN_MINUTES = 3;
export const SEND_GAP_MAX_MINUTES = 10;
/** Horarios de costume: ultimos 10 concluidos, padrao so com 3 ou mais. */
export const HABIT_SAMPLE_SIZE = 10;
export const HABIT_MIN_VISITS = 3;
export const HABIT_DAY_SHARE = 0.7;
export const HABIT_MAX_DAYS = 3;
export const HABIT_BAND_MINUTES = 90;
/** Busca de horarios livres: ate 7 dias depois da data esperada. */
export const SLOT_SEARCH_DAYS_AFTER_EXPECTED = 7;

/** Atendimento concluido, no fuso do negocio. */
export interface CompletedVisit {
  date: string;
  time: string;
  services: Array<{ id: string; name: string }>;
}

/** Horarios de costume (secao 3 do vault). */
export interface CustomerHabit {
  /** Dias mais frequentes (0 = domingo); vazio quando nao ha dia claro. */
  weekdays: number[];
  /** Faixa de inicio, mediana +-90 min (`HH:MM`). */
  bandStart: string;
  bandEnd: string;
  /** Todos os dias da semana em que ela ja veio na amostra. */
  usedWeekdays: number[];
  visits: number;
}

function compareVisit(left: CompletedVisit, right: CompletedVisit): number {
  return (
    left.date.localeCompare(right.date) || left.time.localeCompare(right.time)
  );
}

/**
 * Padrao da cliente a partir dos ultimos 10 atendimentos concluidos: os dias
 * que somam pelo menos 70% das vezes (ate 3) e a faixa de inicio (mediana
 * +-90 min). Sem pelo menos 3 concluidos, `null`: nao ha padrao e vale a
 * regra de hoje (os horarios livres mais proximos).
 */
export function computeHabit(visits: CompletedVisit[]): CustomerHabit | null {
  const sample = [...visits].sort(compareVisit).slice(-HABIT_SAMPLE_SIZE);
  if (sample.length < HABIT_MIN_VISITS) return null;

  const counts = new Map<number, number>();
  for (const visit of sample) {
    const day = weekdayIndex(visit.date);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  );
  const weekdays: number[] = [];
  let covered = 0;
  for (const [day, count] of ranked) {
    if (weekdays.length >= HABIT_MAX_DAYS) break;
    weekdays.push(day);
    covered += count;
    if (covered / sample.length >= HABIT_DAY_SHARE) break;
  }
  const clearDays = covered / sample.length >= HABIT_DAY_SHARE;

  const minutes = sample
    .map((visit) => minutesFromTime(visit.time))
    .sort((left, right) => left - right);
  const middle = Math.floor(minutes.length / 2);
  const median =
    minutes.length % 2 === 1
      ? minutes[middle]
      : (minutes[middle - 1] + minutes[middle]) / 2;
  // Meia hora redonda: "17h30", nunca "17h23".
  const rounded = Math.round(median / 30) * 30;
  const bandStart = Math.max(0, rounded - HABIT_BAND_MINUTES);
  const bandEnd = Math.min(23 * 60 + 30, rounded + HABIT_BAND_MINUTES);

  return {
    weekdays: clearDays
      ? [...weekdays].sort((left, right) => left - right)
      : [],
    bandStart: timeFromMinutes(bandStart),
    bandEnd: timeFromMinutes(bandEnd),
    usedWeekdays: [...counts.keys()].sort((left, right) => left - right),
    visits: sample.length,
  };
}

/** O que a selecao precisa saber de cada cliente. */
export interface CustomerReturnHistory {
  customerId: string;
  name: string | null;
  phone: string | null;
  deactivated: boolean;
  /** Bloqueio de retorno vigente (recusa recente ou pedido para parar). */
  blocked: boolean;
  hasFutureAppointment: boolean;
  /** Dia local da ultima mensagem de retorno enviada, de qualquer rodada. */
  lastReturnMessageDate: string | null;
  /** Ja esta na fila de uma rodada ativa ou pausada. */
  queued: boolean;
  completed: CompletedVisit[];
}

export interface ReturnServiceInfo {
  id: string;
  name: string;
  recurrenceIntervalDays: number | null;
}

export type ReturnExclusion =
  | "deactivated"
  | "noPhone"
  | "futureAppointment"
  | "blocked"
  | "recentlyContacted"
  | "queued";

export type ReturnExclusionCounts = Record<ReturnExclusion, number>;

export interface ReturnCandidate {
  customerId: string;
  name: string | null;
  phone: string;
  serviceId: string | null;
  serviceName: string | null;
  /** Renovacao: data esperada de volta. Resgate: nulo. */
  expectedDate: string | null;
  intervalDays: number | null;
  /** De onde veio o prazo: do servico ou da media da propria cliente. */
  intervalSource: "SERVICE" | "AVERAGE" | null;
  lastVisitDate: string;
  daysSinceLastVisit: number;
  habit: CustomerHabit | null;
}

export interface ReturnCandidateSelection {
  candidates: ReturnCandidate[];
  excluded: ReturnExclusionCounts;
}

/** Dias inteiros de `from` ate `to` (datas locais). */
export function daysBetween(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const end = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((end - start) / 86_400_000);
}

/** Segunda-feira da semana de `date` (semana de segunda a domingo). */
export function mondayOf(date: string): string {
  const weekday = weekdayIndex(date);
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

function emptyExclusions(): ReturnExclusionCounts {
  return {
    deactivated: 0,
    noPhone: 0,
    futureAppointment: 0,
    blocked: 0,
    recentlyContacted: 0,
    queued: 0,
  };
}

/**
 * Exclusoes que valem para as duas rotinas, na ordem do vault: desativada,
 * sem telefone, com agendamento futuro, bloqueada, ja chamada ha pouco e ja
 * na fila de outra rodada. Contato ignorado e conversa pessoal sao da IA e
 * ficam de fora no BFF, que pergunta a ela.
 */
function exclusionOf(
  customer: CustomerReturnHistory,
  today: string,
  recontactDays: number,
): ReturnExclusion | null {
  if (customer.deactivated) return "deactivated";
  if (!customer.phone?.trim()) return "noPhone";
  if (customer.hasFutureAppointment) return "futureAppointment";
  if (customer.blocked) return "blocked";
  if (
    customer.lastReturnMessageDate &&
    daysBetween(customer.lastReturnMessageDate, today) < recontactDays
  ) {
    return "recentlyContacted";
  }
  if (customer.queued) return "queued";
  return null;
}

/** Media de dias entre concluidos consecutivos; exige dois ou mais. */
export function averageIntervalDays(visits: CompletedVisit[]): number | null {
  const sorted = [...visits].sort(compareVisit);
  if (sorted.length < 2) return null;
  const total = daysBetween(sorted[0].date, sorted[sorted.length - 1].date);
  return total / (sorted.length - 1);
}

/**
 * Data esperada de volta (secao 1 do vault).
 *
 * O prazo vem **do servico** primeiro: para cada servico do historico com
 * `recurrenceIntervalDays`, ultimo concluido daquele servico + prazo — vale a
 * data mais cedo entre as que caem na janela pedida. So quando nenhum servico
 * do historico tem prazo vale a media da propria cliente (dois ou mais
 * concluidos), a partir do ultimo atendimento. Sem nenhum dos dois, `null`.
 */
export function expectedReturn(
  visits: CompletedVisit[],
  services: Map<string, ReturnServiceInfo>,
  window: { start: string; end: string },
): Pick<
  ReturnCandidate,
  | "serviceId"
  | "serviceName"
  | "expectedDate"
  | "intervalDays"
  | "intervalSource"
> | null {
  const sorted = [...visits].sort(compareVisit);
  if (sorted.length === 0) return null;

  const lastByService = new Map<string, { date: string; name: string }>();
  for (const visit of sorted) {
    for (const item of visit.services) {
      lastByService.set(item.id, { date: visit.date, name: item.name });
    }
  }
  let hasServiceInterval = false;
  let best: ReturnType<typeof expectedReturn> = null;
  for (const [serviceId, last] of lastByService) {
    const interval = services.get(serviceId)?.recurrenceIntervalDays ?? null;
    if (!interval || interval <= 0) continue;
    hasServiceInterval = true;
    const expectedDate = addDays(last.date, interval);
    if (expectedDate < window.start || expectedDate > window.end) continue;
    if (!best || expectedDate < (best.expectedDate as string)) {
      best = {
        serviceId,
        serviceName: services.get(serviceId)?.name ?? last.name,
        expectedDate,
        intervalDays: interval,
        intervalSource: "SERVICE",
      };
    }
  }
  if (hasServiceInterval) return best;

  const average = averageIntervalDays(sorted);
  if (average === null) return null;
  const intervalDays = Math.max(1, Math.round(average));
  const last = sorted[sorted.length - 1];
  const expectedDate = addDays(last.date, intervalDays);
  if (expectedDate < window.start || expectedDate > window.end) return null;
  const main = last.services[0] ?? null;
  return {
    serviceId: main?.id ?? null,
    serviceName: main ? (services.get(main.id)?.name ?? main.name) : null,
    expectedDate,
    intervalDays,
    intervalSource: "AVERAGE",
  };
}

/** O servico mais feito (empate: o mais recente), para o Resgate. */
export function mostFrequentService(
  visits: CompletedVisit[],
  services: Map<string, ReturnServiceInfo>,
): { id: string; name: string } | null {
  const counts = new Map<
    string,
    { count: number; last: string; name: string }
  >();
  for (const visit of [...visits].sort(compareVisit)) {
    for (const item of visit.services) {
      const current = counts.get(item.id);
      counts.set(item.id, {
        count: (current?.count ?? 0) + 1,
        last: visit.date,
        name: services.get(item.id)?.name ?? item.name,
      });
    }
  }
  let best: { id: string; count: number; last: string; name: string } | null =
    null;
  for (const [id, value] of counts) {
    if (
      !best ||
      value.count > best.count ||
      (value.count === best.count && value.last > best.last)
    ) {
      best = { id, ...value };
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

function lastVisitOf(visits: CompletedVisit[]): string | null {
  let last: string | null = null;
  for (const visit of visits) {
    if (!last || visit.date > last) last = visit.date;
  }
  return last;
}

/**
 * Renovacao: a data esperada de volta cai na semana pedida (segunda a
 * domingo). Quem vence antes aparece antes.
 */
export function selectRenewalCandidates(input: {
  customers: CustomerReturnHistory[];
  services: Map<string, ReturnServiceInfo>;
  today: string;
  weekStart: string;
}): ReturnCandidateSelection {
  const excluded = emptyExclusions();
  const candidates: ReturnCandidate[] = [];
  const window = { start: input.weekStart, end: addDays(input.weekStart, 6) };
  for (const customer of input.customers) {
    const expected = expectedReturn(customer.completed, input.services, window);
    if (!expected) continue;
    const exclusion = exclusionOf(
      customer,
      input.today,
      RENEWAL_RECONTACT_DAYS,
    );
    if (exclusion) {
      excluded[exclusion] += 1;
      continue;
    }
    const lastVisitDate = lastVisitOf(customer.completed) as string;
    candidates.push({
      customerId: customer.customerId,
      name: customer.name,
      phone: (customer.phone as string).trim(),
      ...expected,
      lastVisitDate,
      daysSinceLastVisit: daysBetween(lastVisitDate, input.today),
      habit: computeHabit(customer.completed),
    });
  }
  candidates.sort(
    (left, right) =>
      (left.expectedDate as string).localeCompare(
        right.expectedDate as string,
      ) ||
      (left.name ?? "").localeCompare(right.name ?? "", "pt-BR") ||
      left.customerId.localeCompare(right.customerId),
  );
  return { candidates, excluded };
}

/**
 * Resgate: o ultimo atendimento concluido foi ha N dias ou mais. Quem esta
 * longe ha menos tempo aparece antes — e quem tem mais chance de voltar.
 */
export function selectWinbackCandidates(input: {
  customers: CustomerReturnHistory[];
  services: Map<string, ReturnServiceInfo>;
  today: string;
  days: number;
}): ReturnCandidateSelection {
  const excluded = emptyExclusions();
  const candidates: ReturnCandidate[] = [];
  for (const customer of input.customers) {
    const lastVisitDate = lastVisitOf(customer.completed);
    if (!lastVisitDate) continue;
    const daysSinceLastVisit = daysBetween(lastVisitDate, input.today);
    if (daysSinceLastVisit < input.days) continue;
    const exclusion = exclusionOf(
      customer,
      input.today,
      WINBACK_RECONTACT_DAYS,
    );
    if (exclusion) {
      excluded[exclusion] += 1;
      continue;
    }
    const service = mostFrequentService(customer.completed, input.services);
    candidates.push({
      customerId: customer.customerId,
      name: customer.name,
      phone: (customer.phone as string).trim(),
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? null,
      expectedDate: null,
      intervalDays: null,
      intervalSource: null,
      lastVisitDate,
      daysSinceLastVisit,
      habit: computeHabit(customer.completed),
    });
  }
  candidates.sort(
    (left, right) =>
      left.daysSinceLastVisit - right.daysSinceLastVisit ||
      (left.name ?? "").localeCompare(right.name ?? "", "pt-BR") ||
      left.customerId.localeCompare(right.customerId),
  );
  return { candidates, excluded };
}

// --- Ritmo e prazo -----------------------------------------------------------

export interface PacingRules {
  dailyLimit: number;
  windowDays: number[];
  windowStartMinutes: number;
  windowEndMinutes: number;
  leadDays: number;
}

/**
 * Ultimo dia em que a mensagem da Renovacao ainda pode sair.
 *
 * Alvo: N dias antes da data esperada. Se a aprovacao ja passou desse alvo,
 * vale o ultimo dia antes da data — **ninguem recebe no proprio dia nem
 * depois**. Se a data ja chegou (ou passou) quando a rodada foi aprovada, nao
 * ha prazo: a mensagem sai assim que o ritmo deixar. Resgate nao tem prazo.
 */
export function sendByFor(
  expectedDate: string | null,
  leadDays: number,
  today: string,
): string | null {
  if (!expectedDate || expectedDate <= today) return null;
  const target = addDays(expectedDate, -leadDays);
  return target >= today ? target : addDays(expectedDate, -1);
}

/** O instante local esta dentro da janela de envio? */
export function withinSendWindow(
  rules: Pick<
    PacingRules,
    "windowDays" | "windowStartMinutes" | "windowEndMinutes"
  >,
  date: string,
  minutes: number,
): boolean {
  return (
    rules.windowDays.includes(weekdayIndex(date)) &&
    minutes >= rules.windowStartMinutes &&
    minutes < rules.windowEndMinutes
  );
}

export interface PlanTarget {
  customerId: string;
  sendBy: string | null;
}

export interface PlannedTarget extends PlanTarget {
  plannedDate: string | null;
  fits: boolean;
}

export interface PacingPlan {
  targets: PlannedTarget[];
  notFitting: string[];
  /** Menor limite diario (ate 30) em que todas cabem; nulo se nem 30 basta. */
  minimumDailyLimit: number | null;
}

/** Quantas mensagens ainda cabem hoje, pelo pior intervalo entre envios. */
function remainingToday(rules: PacingRules, nowMinutes: number): number {
  const from = Math.max(nowMinutes, rules.windowStartMinutes);
  if (from >= rules.windowEndMinutes) return 0;
  return Math.floor((rules.windowEndMinutes - from) / SEND_GAP_MAX_MINUTES) + 1;
}

function assign(
  ordered: PlanTarget[],
  rules: PacingRules,
  input: {
    today: string;
    nowMinutes: number;
    sentToday: number;
    queuedAhead: number;
  },
): PlannedTarget[] {
  const result: PlannedTarget[] = [];
  let day = input.today;
  let used = input.sentToday;
  let capacity = rules.windowDays.includes(weekdayIndex(day))
    ? Math.min(rules.dailyLimit, used + remainingToday(rules, input.nowMinutes))
    : 0;
  let ahead = input.queuedAhead;
  const advance = () => {
    do {
      day = addDays(day, 1);
    } while (!rules.windowDays.includes(weekdayIndex(day)));
    used = 0;
    capacity = rules.dailyLimit;
  };
  const take = (): string => {
    while (used >= capacity) advance();
    used += 1;
    return day;
  };
  if (rules.windowDays.length === 0) {
    return ordered.map((target) => ({
      ...target,
      plannedDate: null,
      fits: false,
    }));
  }
  while (ahead > 0) {
    take();
    ahead -= 1;
  }
  for (const target of ordered) {
    const plannedDate = take();
    result.push({
      ...target,
      plannedDate,
      fits: target.sendBy === null || plannedDate <= target.sendBy,
    });
  }
  return result;
}

/**
 * Simulacao do ritmo na aprovacao: quem vence antes recebe antes, N por dia,
 * so nos dias da janela, a partir de agora. Diz quem nao cabe ate o proprio
 * prazo e o menor limite diario que faria todas caberem.
 */
export function planSchedule(input: {
  targets: PlanTarget[];
  rules: PacingRules;
  today: string;
  nowMinutes: number;
  /** Envios deste negocio ja feitos hoje. */
  sentToday?: number;
  /** Clientes de outras rodadas ainda na fila, que saem antes. */
  queuedAhead?: number;
}): PacingPlan {
  const ordered = input.targets
    .map((target, index) => ({ target, index }))
    .sort(
      (left, right) =>
        (left.target.sendBy ?? "9999-12-31").localeCompare(
          right.target.sendBy ?? "9999-12-31",
        ) || left.index - right.index,
    )
    .map((entry) => entry.target);
  const context = {
    today: input.today,
    nowMinutes: input.nowMinutes,
    sentToday: input.sentToday ?? 0,
    queuedAhead: input.queuedAhead ?? 0,
  };
  const planned = assign(ordered, input.rules, context);
  const notFitting = planned
    .filter((target) => !target.fits)
    .map((target) => target.customerId);
  let minimumDailyLimit: number | null = input.rules.dailyLimit;
  if (notFitting.length > 0) {
    minimumDailyLimit = null;
    for (
      let limit = input.rules.dailyLimit + 1;
      limit <= RETURN_DAILY_LIMIT_MAX;
      limit += 1
    ) {
      const attempt = assign(
        ordered,
        { ...input.rules, dailyLimit: limit },
        context,
      );
      if (attempt.every((target) => target.fits)) {
        minimumDailyLimit = limit;
        break;
      }
    }
  }
  return { targets: planned, notFitting, minimumDailyLimit };
}

/** Intervalo sorteado entre dois envios, entre 3 e 10 minutos. */
export function randomSendGapMinutes(
  random: () => number = Math.random,
): number {
  const span = SEND_GAP_MAX_MINUTES - SEND_GAP_MIN_MINUTES;
  return SEND_GAP_MIN_MINUTES + Math.round(random() * span);
}

// --- Horarios oferecidos -----------------------------------------------------

export interface OfferSlot {
  date: string;
  time: string;
}

function bandDistance(habit: CustomerHabit, minutes: number): number {
  const start = minutesFromTime(habit.bandStart);
  const end = minutesFromTime(habit.bandEnd);
  if (minutes < start) return start - minutes;
  if (minutes > end) return minutes - end;
  return 0;
}

/**
 * Dois horarios livres pela ordem de busca do vault (secao 3):
 *
 * 1. no dia e na faixa de costume;
 * 2. no dia de costume, na faixa mais proxima;
 * 3. em outro dia que ela ja usou, na faixa de costume;
 * 4. qualquer horario livre, do mais proximo da data esperada para o mais
 *    distante.
 *
 * Com padrao claro, um dia que ela nunca usou so aparece no passo 4. Sem
 * padrao (menos de 3 concluidos), a regra de hoje: os mais proximos. Os dois
 * horarios ficam em dias diferentes quando da.
 */
export function pickOfferedSlots(input: {
  slots: OfferSlot[];
  habit: CustomerHabit | null;
  anchorDate: string;
  count?: number;
}): OfferSlot[] {
  const count = input.count ?? 2;
  const habit = input.habit;
  const tierOf = (slot: OfferSlot): number => {
    if (!habit) return 4;
    const day = weekdayIndex(slot.date);
    const usualDay =
      habit.weekdays.length === 0 || habit.weekdays.includes(day);
    const inBand = bandDistance(habit, minutesFromTime(slot.time)) === 0;
    if (usualDay && inBand) return 1;
    if (usualDay) return 2;
    if (inBand && habit.usedWeekdays.includes(day)) return 3;
    return 4;
  };
  const ranked = input.slots
    .map((slot) => ({
      slot,
      tier: tierOf(slot),
      distance: Math.abs(daysBetween(input.anchorDate, slot.date)),
      band: habit ? bandDistance(habit, minutesFromTime(slot.time)) : 0,
    }))
    .sort(
      (left, right) =>
        left.tier - right.tier ||
        left.distance - right.distance ||
        left.band - right.band ||
        left.slot.date.localeCompare(right.slot.date) ||
        left.slot.time.localeCompare(right.slot.time),
    );
  const chosen: OfferSlot[] = [];
  for (const entry of ranked) {
    if (chosen.length >= count) break;
    if (chosen.some((slot) => slot.date === entry.slot.date)) continue;
    chosen.push(entry.slot);
  }
  for (const entry of ranked) {
    if (chosen.length >= count) break;
    if (
      chosen.some(
        (slot) =>
          slot.date === entry.slot.date && slot.time === entry.slot.time,
      )
    ) {
      continue;
    }
    chosen.push(entry.slot);
  }
  return chosen.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.time.localeCompare(right.time),
  );
}
