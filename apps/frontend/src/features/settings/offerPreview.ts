export interface OfferPreview {
  nowLabel: string;
  struck: string[];
  pills: string[];
  legend: string;
}

const MINUTES_PER_DAY = 1_440;

function localWallClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return Math.floor(
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    ) / 60_000,
  );
}

function clockLabel(minutes: number): string {
  const inDay =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = String(Math.floor(inDay / 60)).padStart(2, "0");
  const rest = String(inDay % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

function dayIndex(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY);
}

function dayLabel(offset: number, minutes: number): string {
  if (offset === 1) return "amanhã";
  const date = new Date(dayIndex(minutes) * MINUTES_PER_DAY * 60_000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * Exemplo ilustrativo de "Na prática": mostra, para a antecedência e o
 * intervalo escolhidos na tela, quais horários do passo ficam de fora e quais
 * a IA passaria a oferecer. Não lê a Agenda nem a disponibilidade.
 */
export function offerPreview({
  granularityMinutes,
  minLeadMinutes,
  now,
  timeZone,
}: {
  granularityMinutes: number;
  minLeadMinutes: number;
  now: Date;
  timeZone: string;
}): OfferPreview {
  const step = Math.max(1, granularityMinutes);
  const nowLocal = localWallClock(now, timeZone);
  const limit = nowLocal + Math.max(0, minLeadMinutes);
  const limitDay = dayIndex(limit);
  const dayOffset = limitDay - dayIndex(nowLocal);

  const firstAfterNow = (Math.floor(nowLocal / step) + 1) * step;
  const firstAllowed = Math.ceil(limit / step) * step;
  const lastBeforeLimit = firstAllowed - step;

  const struckMinutes = [firstAfterNow, lastBeforeLimit].filter(
    (slot, index, all) =>
      slot > nowLocal &&
      slot < limit &&
      dayIndex(slot) === limitDay &&
      all.indexOf(slot) === index,
  );

  const pills: string[] = [];
  for (let slot = firstAllowed; pills.length < 3; slot += step) {
    if (dayIndex(slot) !== dayIndex(firstAllowed)) break;
    pills.push(clockLabel(slot));
  }

  const from =
    dayOffset > 0
      ? `${dayLabel(dayOffset, limit)} às ${clockLabel(limit)}`
      : clockLabel(limit);
  return {
    legend: `Só a partir de ${from}, em passos de ${step} min. A IA mostra até três opções por vez.`,
    nowLabel: clockLabel(nowLocal),
    pills,
    struck: struckMinutes.map(clockLabel),
  };
}
