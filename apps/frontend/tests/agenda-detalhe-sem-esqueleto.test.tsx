// @vitest-environment jsdom
/**
 * Pedido de 2026-10-12: no F5 do detalhe do atendimento, o histórico e o
 * lembrete ainda nasciam como linhas de esqueleto (texto transparente e ponto
 * cinza) por alguns quadros. Agora só reservam o lugar, invisíveis, sem
 * nenhuma classe de esqueleto.
 */
import { readFileSync } from "node:fs";

import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AgendaDayColumnSkeleton } from "@/features/agenda/AgendaDayColumn";
import { AppointmentHistory } from "@/features/agenda/AppointmentHistory";
import { AppointmentReminder } from "@/features/agenda/LifecycleActions";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const never = () => new Promise<never>(() => undefined);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      listAppointmentEvents: never,
      listAppointmentNotifications: never,
    },
  }),
}));

describe("histórico e lembrete carregando no detalhe", () => {
  test("reservam o lugar sem nenhuma classe de esqueleto", () => {
    const history = render(
      <ShellConfigProvider>
        <AppointmentHistory appointmentId="a-9" />
      </ShellConfigProvider>,
    );
    const reminder = render(
      <ShellConfigProvider>
        <AppointmentReminder appointmentId="a-9" />
      </ShellConfigProvider>,
    );
    expect(
      history.container.querySelector(".agenda-appt-history-reserved"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      reminder.container.querySelector(".agenda-appt-reminder-reserved"),
    ).toHaveAttribute("aria-hidden", "true");
    for (const { container } of [history, reminder]) {
      expect(container.querySelector("[class*='skeleton']")).toBeNull();
    }
  });

  test("o lugar reservado é invisível: nem ponto, nem texto", () => {
    const css = readFileSync("src/shared/styles/avenly-agenda.css", "utf8");
    expect(css).toMatch(
      /\.agenda-appt-history-reserved,\s*\.agenda-appt-reminder-reserved,\s*\.agenda-day-skeleton,\s*\.agenda-command-bar-skeleton \{\s*visibility: hidden;/,
    );
  });
});

/**
 * Pedido de 2026-10-12: a coluna do Dia e a barra ao lado do detalhe (desktop)
 * também montavam esqueleto no F5. Agora só reservam o lugar, invisíveis.
 */
describe("coluna do Dia e barra carregando ao lado do detalhe", () => {
  test("reservam o lugar sem nenhuma classe de esqueleto", () => {
    const { container } = render(<AgendaDayColumnSkeleton days={7} />);
    expect(
      container.querySelector(".agenda-day-skeleton"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".skeleton, .skeleton-text")).toBeNull();
    expect(container.querySelectorAll(".agenda-day-item")).toHaveLength(3);
  });
});
