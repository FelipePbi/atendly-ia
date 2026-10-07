/**
 * Dia e mês (`dd/mm`) de um instante ISO, no fuso do negócio. Instante ausente
 * ou ilegível dá `null`: quem chama decide o que escrever sem a data.
 */
export function dayMonthLabel(
  isoDateTime: string | null,
  timeZone: string,
): string | null {
  if (!isoDateTime) return null;
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
  });
}
