import { describe, expect, test } from "vitest";

import { freeRefusalText } from "@/features/agenda/ConflictPanel";

/**
 * Validacao de 2026-10-12: no Remarcar, toda recusa sem nada ocupando dizia
 * "fora da grade de atendimento do negocio", mesmo com o horario dentro do
 * expediente. Agora o motivo segue o mesmo criterio do Novo agendamento.
 */
const availability = {
  granularityMinutes: 30,
  rules: [
    { active: true, dayOfWeek: 5, startTime: "08:00", endTime: "12:00" },
    { active: true, dayOfWeek: 5, startTime: "13:00", endTime: "19:00" },
  ],
};
// 16/10/2026 e sexta.
const friday = (startTime: string) => ({
  date: "2026-10-16",
  durationMinutes: 75,
  startTime,
});

describe("aviso de recusa no Remarcar", () => {
  test("fora do expediente: diz o horario de atendimento do dia", () => {
    expect(freeRefusalText({ availability, interval: friday("19:30") })).toBe(
      "Nenhum evento da agenda cobre este intervalo, mas ele fica fora do seu horário de atendimento: seu atendimento neste dia é das 08:00 às 12:00 e das 13:00 às 19:00.",
    );
  });

  test("dentro do expediente mas fora do passo: diz o passo da grade", () => {
    expect(freeRefusalText({ availability, interval: friday("13:15") })).toBe(
      "Nenhum evento da agenda cobre este intervalo, mas 13:15 não está entre os horários que a sua agenda oferece (de 30 em 30 minutos).",
    );
  });

  test("dentro do expediente e na grade: nunca diz fora do horario", () => {
    const text = freeRefusalText({ availability, interval: friday("13:30") });
    expect(text).not.toMatch(/fora do seu horário|fora da grade/);
    expect(text).toContain("pode estar reservado numa confirmação em andamento");
  });

  test("sem as regras lidas, nao inventa motivo", () => {
    expect(freeRefusalText({ availability: null, interval: friday("19:30") })).not.toMatch(
      /fora do seu horário/,
    );
  });
});
