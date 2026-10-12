// @vitest-environment jsdom
/**
 * O mini-calendário da Agenda (quadro A3) desenha sempre seis semanas, 42 dias.
 * Evita a folha mudando de altura e de espaçamento ao trocar entre um mês de
 * 5 linhas e um de 6 (validação de 2026-10-12: Outubro 2026 → Novembro 2026).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AgendaCalendarSheet } from "@/features/agenda/AgendaCalendarSheet";

const listAppointments = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      listAppointments,
      listAvailabilityExceptions: () => Promise.resolve([]),
      listTimeBlocks: () => Promise.resolve([]),
    },
  }),
}));

beforeEach(() => {
  listAppointments.mockReset();
  listAppointments.mockResolvedValue([]);
});

function gridDays() {
  const sheet = screen.getByRole("dialog", { name: "Calendário" });
  const grid = sheet.querySelector(".agenda-calendar-days") as HTMLElement;
  return within(grid).getAllByRole("button");
}

describe("mini-calendário da Agenda com seis semanas fixas", () => {
  test("um mês de 5 semanas (Outubro 2026) e um de 6 (Novembro 2026) têm as mesmas 42 células, de segunda a domingo", async () => {
    const user = userEvent.setup();
    render(
      <AgendaCalendarSheet
        avenly
        focusedDate={new Date(2026, 9, 12)}
        onClose={() => {}}
        onPick={() => {}}
      />,
    );

    expect(screen.getByText("Outubro 2026")).toBeVisible();
    let days = gridDays();
    expect(days).toHaveLength(42);
    expect(days.length / 7).toBe(6);
    expect(days[0]).toHaveAccessibleName(/^segunda-feira, 28 de setembro/);
    expect(days[41]).toHaveAccessibleName(/^domingo, 8 de novembro/);
    expect(days[41]).toHaveClass("is-outside");
    expect(listAppointments).toHaveBeenCalledWith(
      { endDate: "2026-11-08", startDate: "2026-09-28" },
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole("button", { name: "Ver próximo mês" }));

    expect(screen.getByText("Novembro 2026")).toBeVisible();
    days = gridDays();
    expect(days).toHaveLength(42);
    expect(days[0]).toHaveAccessibleName(/^segunda-feira, 26 de outubro/);
    expect(days[6]).toHaveAccessibleName(/^domingo, 1 de novembro/);
    expect(days[41]).toHaveAccessibleName(/^domingo, 6 de dezembro/);
  });
});
