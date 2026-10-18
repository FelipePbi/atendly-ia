import type { Service } from "@/data";

export function formatServiceDuration(
  durationMinutes: Service["durationMinutes"],
): string {
  if (durationMinutes === null) return "sem duração";
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes}`;
}

export function formatServicePrice(
  service: Pick<Service, "price" | "priceType">,
): string {
  if (service.priceType === "NOT_INFORMED") return "sem preço informado";
  if (service.priceType === "ON_REQUEST" || service.price === null) {
    return "sob consulta";
  }
  const amount = formatCurrency(service.price);
  return service.priceType === "STARTING_AT" ? `a partir de ${amount}` : amount;
}

export function formatServiceRecurrence(
  recurrenceIntervalDays: Service["recurrenceIntervalDays"],
): string | null {
  if (!recurrenceIntervalDays) return null;
  // "meses" da recorrência (quadro S6) grava 30 dias por mês (D-202).
  if (recurrenceIntervalDays % 30 === 0) {
    const months = recurrenceIntervalDays / 30;
    return `a cada ${months} ${months === 1 ? "mês" : "meses"}`;
  }
  if (recurrenceIntervalDays % 7 === 0) {
    const weeks = recurrenceIntervalDays / 7;
    return `a cada ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }
  return `a cada ${recurrenceIntervalDays} ${
    recurrenceIntervalDays === 1 ? "dia" : "dias"
  }`;
}

export function formatServicePreview({
  durationMinutes,
  name,
  priceCents,
  priceType,
}: {
  durationMinutes: number | null;
  name: string;
  priceCents: number | null;
  priceType: Service["priceType"];
}): string | null {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const duration =
    durationMinutes === null ? null : formatServiceDuration(durationMinutes);
  if (priceType === "FIXED" || priceType === "STARTING_AT") {
    if (priceCents === null) return null;
    const price = formatServicePrice({ price: priceCents / 100, priceType });
    return duration
      ? `${trimmedName} custa ${price} e leva ${duration}.`
      : `${trimmedName} custa ${price}.`;
  }
  if (priceType === "ON_REQUEST") {
    return duration
      ? `O valor de ${trimmedName} é combinado no atendimento, que leva ${duration}.`
      : `O valor de ${trimmedName} é combinado no atendimento.`;
  }
  return duration
    ? `${trimmedName} leva ${duration}; o valor você confirma com a cliente.`
    : `${trimmedName}; o valor você confirma com a cliente.`;
}

export function formatServiceLine(service: Service): string {
  const parts = [
    formatServiceDuration(service.durationMinutes),
    formatServicePrice(service),
  ];
  const recurrence = formatServiceRecurrence(service.recurrenceIntervalDays);
  if (recurrence) parts.push(recurrence);
  if (!service.active) parts.push("a IA não oferece");
  return parts.join(" · ");
}

function formatCurrency(amount: number): string {
  const hasCents = !Number.isInteger(amount);
  return `R$ ${amount.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: hasCents ? 2 : 0,
  })}`;
}
