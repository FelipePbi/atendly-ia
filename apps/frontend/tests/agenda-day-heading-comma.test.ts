import { describe, expect, test } from "vitest";

import { daySummaryHeading } from "@/features/agenda/occupancy";

/**
 * Validacao de 2026-10-12: o cabecalho do dia aberto mostrava "Terça 13",
 * sem virgula, enquanto o dia fechado e "Hoje, segunda 12" usam virgula.
 */
describe("cabecalho do dia na Agenda", () => {
  test("dia que nao e hoje leva virgula entre o dia da semana e o numero", () => {
    expect(daySummaryHeading("2026-10-13", false)).toBe("Terça, 13");
  });

  test("hoje continua Hoje, dia da semana e numero", () => {
    expect(daySummaryHeading("2026-10-12", true)).toBe("Hoje, segunda 12");
  });
});
