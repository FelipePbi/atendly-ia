/**
 * Ida e volta entre a Agenda e o detalhe do agendamento (pedido de
 * 2026-10-12, D-167): quem abre o detalhe passa a origem em `voltar`, e o
 * "voltar" do detalhe leva a ela; sem origem, ao dia do próprio atendimento.
 * `/agenda?dia=AAAA-MM-DD` abre a Agenda nesse dia; a visualização continua a
 * lembrada no aparelho.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `AAAA-MM-DD` de um dia que existe; qualquer outra coisa vira `null`. */
export function agendaDayParam(value: string | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? value
    : null;
}

export function agendaDayHref(date: string): string {
  return `/agenda?dia=${date}`;
}

/** Só caminho interno: nada de outro site (`//`, `/\`) nem esquema. */
export function internalReturnTo(
  value: string | null | undefined,
): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export function appointmentHref(id: string, returnTo?: string | null): string {
  const origin = internalReturnTo(returnTo);
  const base = `/agenda/agendamento?id=${encodeURIComponent(id)}`;
  return origin ? `${base}&voltar=${encodeURIComponent(origin)}` : base;
}

/** Remarcar e Cancelar levam a origem junto, para o retorno seguir a mesma regra. */
export function appointmentFlowHref(
  flow: "cancelar" | "reagendar",
  id: string,
  returnTo?: string | null,
): string {
  const origin = internalReturnTo(returnTo);
  const base = `/agenda/${flow}?id=${encodeURIComponent(id)}`;
  return origin ? `${base}&voltar=${encodeURIComponent(origin)}` : base;
}

/** O destino do "voltar" do detalhe: a origem, o dia do atendimento ou a Agenda. */
export function appointmentBackHref(
  returnTo: string | null | undefined,
  date: string | null | undefined,
): string {
  return internalReturnTo(returnTo) ?? (date ? agendaDayHref(date) : "/agenda");
}
