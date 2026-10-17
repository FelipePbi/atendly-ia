/**
 * Mensagens de clientes fora do horário de atendimento (D-178).
 *
 * A IA conta as mensagens recebidas por hora da semana (`dia * 24 + hora`,
 * domingo = 0, fuso do negócio). Uma hora só conta como "fora do horário"
 * quando nenhum minuto dela cai dentro do horário de atendimento daquele dia:
 * a conta erra para menos, nunca para mais.
 */

export const WEEK_HOURS = 7 * 24;

export interface OpeningRule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

/** Se alguma parte da hora `hour` do dia `weekday` está dentro do horário. */
function touchesOpening(
  weekday: number,
  hour: number,
  rules: readonly OpeningRule[],
): boolean {
  const start = hour * 60;
  const end = start + 60;
  return rules.some(
    (rule) =>
      rule.active &&
      rule.dayOfWeek === weekday &&
      minutesOf(rule.startTime) < end &&
      minutesOf(rule.endTime) > start,
  );
}

/**
 * Total de mensagens e quantas chegaram fora do horário. Sem horário
 * cadastrado não há o que comparar: devolve `null`.
 */
export function missedMessages(
  hours: readonly number[],
  rules: readonly OpeningRule[],
): { total: number; outsideHours: number } | null {
  if (!rules.some((rule) => rule.active)) return null;
  let total = 0;
  let outsideHours = 0;
  for (let index = 0; index < WEEK_HOURS; index += 1) {
    const count = hours[index] ?? 0;
    total += count;
    const weekday = Math.floor(index / 24);
    if (!touchesOpening(weekday, index % 24, rules)) outsideHours += count;
  }
  return { total, outsideHours };
}
