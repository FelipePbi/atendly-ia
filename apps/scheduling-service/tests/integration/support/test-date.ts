/**
 * Dia de teste que não apodrece.
 *
 * As suítes de integração agendam contra o motor de oferta real, e o motor só
 * oferece o que ainda está por vir: um dia fixo no código deixa de ser
 * ofertável assim que o calendário passa por ele, e a suíte inteira começa a
 * falhar com `SLOT_UNAVAILABLE` por causa da data, não da regra que ela
 * deveria estar provando. O dia é sempre alguns dias à frente de hoje, dentro
 * do horizonte padrão (`maxLeadDays`), e as fixtures que dependem do dia da
 * semana o derivam desta data — nunca o contrário.
 */
export function upcomingDate(daysAhead = 2): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysAhead);
  return day.toISOString().slice(0, 10);
}

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
// Sem horário de verão desde 2019: o deslocamento do negócio é fixo.
const BUSINESS_UTC_OFFSET = "-03:00";
const DAY_MS = 86_400_000;

/**
 * Data civil (`YYYY-MM-DD`) de `America/Sao_Paulo` daqui a `daysAhead` dias,
 * calculada do relógio real. Serve às fixtures que o banco ou o motor de
 * oferta comparam com o agora: `vi.setSystemTime` não alcança `now()` do
 * PostgreSQL, então a data tem de nascer aqui, no momento do teste.
 */
export function localDateAhead(daysAhead: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + daysAhead * DAY_MS));
}

/**
 * Horário local do negócio (`HH:mm`) daqui a `daysAhead` dias, com o instante
 * correspondente. `daysAhead` fica dentro do horizonte padrão (`maxLeadDays`
 * = 90) e folgado em relação à duração da suíte.
 */
export function upcomingLocalSlot(
  daysAhead: number,
  startTime = "09:00",
): { date: string; startTime: string; startAt: Date } {
  const date = localDateAhead(daysAhead);
  return {
    date,
    startTime,
    startAt: new Date(`${date}T${startTime}:00.000${BUSINESS_UTC_OFFSET}`),
  };
}
