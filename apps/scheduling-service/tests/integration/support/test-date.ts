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
