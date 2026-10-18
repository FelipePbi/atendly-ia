// @vitest-environment jsdom
/**
 * D-196: Configurações > Disponibilidade usa as peças do onboarding (quadros
 * 2.5 a 2.7): pílulas dos dias com o resumo, o horário de sempre em dois
 * cartões com a régua de 24 h, "Personalizar dias diferentes" abrindo
 * "Horários por dia" na própria página e "Copiar … para outros dias". A grade
 * gravada continua a mesma: uma regra por intervalo de cada dia marcado, mais
 * as regras inativas lidas.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { SettingsState } from "@/data";
import { AvailabilitySettings } from "@/features/settings/AvailabilitySettings";

import { expectNoA11yViolations } from "./support/a11y";

const updateAvailability = vi.fn();
const showToast = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ settings: { updateAvailability } }),
}));
vi.mock("@/shared/ui/toastBus", () => ({
  showToast: (...args: unknown[]): unknown => showToast(...args),
}));

type Seed = [day: number, start: string, end: string, active?: boolean];

function settingsWith(seeds: Seed[]): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: seeds.map(([dayOfWeek, startTime, endTime, active = true], i) => ({
        active,
        dayOfWeek,
        endTime,
        id: `r${i}`,
        startTime,
      })),
      timezone: "America/Sao_Paulo",
    },
    business: {
      address: null,
      category: "Beleza",
      contextProjectionStatus: "PROJECTED",
      currency: "BRL",
      language: "pt-BR",
      modalities: ["ON_SITE"],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

const weekdays: Seed[] = [1, 2, 3, 4, 5].map((day) => [day, "09:00", "18:00"]);
const withSaturday: Seed[] = [...weekdays, [6, "09:00", "14:00"]];

function renderWith(seeds: Seed[]) {
  const settings = settingsWith(seeds);
  updateAvailability.mockImplementation((input: unknown) =>
    Promise.resolve({ ...settings.availability, ...(input as object) }),
  );
  const onSaved = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <AvailabilitySettings settings={settings} onSaved={onSaved} />,
  );
  return { ...view, onSaved, user };
}

type SavedRule = {
  active: boolean;
  dayOfWeek: number;
  endTime: string;
  startTime: string;
};

function savedRules(): SavedRule[] {
  const [input] = updateAvailability.mock.calls.at(-1) as [
    { rules: SavedRule[] },
  ];
  return input.rules;
}

const save = () => screen.getByRole("button", { name: "Salvar alterações" });
const personalize = () =>
  screen.getByRole("button", { name: "Personalizar dias diferentes" });
const dayRow = (day: string) =>
  screen.getByRole("button", { name: new RegExp(`^${day} `) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("o horário da semana como no onboarding", () => {
  test("dias em pílulas com o resumo e o horário de sempre em cartões", async () => {
    const { container } = renderWith(weekdays);

    expect(
      screen.getByRole("heading", { name: "Em quais dias você atende?" }),
    ).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Segunda" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sábado" })).not.toBeChecked();
    expect(screen.getByText("Segunda a sexta")).toBeVisible();
    expect(screen.getByText(/5 dias por semana/)).toBeVisible();
    expect(screen.getByLabelText("Começa")).toHaveValue("09:00");
    expect(screen.getByLabelText("Termina")).toHaveValue("18:00");
    expect(screen.getByText("Vale para segunda a sexta.")).toBeVisible();
    // Grade uniforme: a lista por dia começa fechada, como no onboarding.
    expect(personalize()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Horários por dia" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  test("dia com horário próprio abre a lista por dia, com o tom e o atalho de cópia", async () => {
    const { container, user } = renderWith(withSaturday);

    expect(personalize()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Vale para segunda a sexta. Sábado tem horário próprio."),
    ).toBeVisible();
    expect(dayRow("Sábado").closest(".hours-day")).toHaveClass("is-different");
    expect(dayRow("Segunda").closest(".hours-day")).not.toHaveClass(
      "is-different",
    );
    expect(screen.getByText("Não atende")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copiar sábado para outros dias" }),
    ).toBeVisible();

    await user.click(dayRow("Sábado"));
    expect(dayRow("Sábado")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Sábado · Início")).toHaveValue("09:00");
    expect(screen.getByLabelText("Sábado · Fim")).toHaveValue("14:00");
    await expectNoA11yViolations(container);
  });

  test("mudar o horário de sempre muda os dias que o seguem, não o dia com horário próprio", async () => {
    const { user } = renderWith(withSaturday);

    const end = screen.getByLabelText("Termina");
    await user.clear(end);
    await user.type(end, "19:00");
    await user.click(save());

    await waitFor(() => expect(updateAvailability).toHaveBeenCalled());
    expect(savedRules()).toEqual([
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
        active: true,
        dayOfWeek,
        endTime: "19:00",
        startTime: "09:00",
      })),
      { active: true, dayOfWeek: 6, endTime: "14:00", startTime: "09:00" },
    ]);
  });

  test("copiar sábado para outros dias grava o horário dele em todos os dias marcados", async () => {
    const { user } = renderWith(withSaturday);

    await user.click(
      screen.getByRole("button", { name: "Copiar sábado para outros dias" }),
    );
    expect(dayRow("Sábado").closest(".hours-day")).not.toHaveClass(
      "is-different",
    );
    expect(screen.getByLabelText("Termina")).toHaveValue("14:00");
    await user.click(save());

    await waitFor(() => expect(updateAvailability).toHaveBeenCalled());
    expect(savedRules()).toEqual(
      [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        active: true,
        dayOfWeek,
        endTime: "14:00",
        startTime: "09:00",
      })),
    );
  });

  test("a pílula liga e desliga o dia; o dia ligado segue o horário de sempre", async () => {
    const { user } = renderWith(weekdays);

    await user.click(screen.getByRole("checkbox", { name: "Sexta" }));
    await user.click(screen.getByRole("checkbox", { name: "Domingo" }));
    await user.click(save());

    await waitFor(() => expect(updateAvailability).toHaveBeenCalled());
    expect(savedRules().map((rule) => rule.dayOfWeek)).toEqual([1, 2, 3, 4, 0]);
    expect(savedRules().every((rule) => rule.endTime === "18:00")).toBe(true);
  });

  test("intervalo a mais no horário de sempre vale para todos os dias que o seguem", async () => {
    const { user } = renderWith([
      [1, "08:00", "12:00"],
      [2, "08:00", "12:00"],
    ]);

    await user.click(screen.getByRole("button", { name: "Adicionar intervalo" }));
    expect(screen.getByLabelText("Começa (2º)")).toHaveValue("13:00");
    expect(screen.getByLabelText("Termina (2º)")).toHaveValue("14:00");
    await user.click(save());

    await waitFor(() => expect(updateAvailability).toHaveBeenCalled());
    expect(savedRules()).toEqual([
      { active: true, dayOfWeek: 1, endTime: "12:00", startTime: "08:00" },
      { active: true, dayOfWeek: 1, endTime: "14:00", startTime: "13:00" },
      { active: true, dayOfWeek: 2, endTime: "12:00", startTime: "08:00" },
      { active: true, dayOfWeek: 2, endTime: "14:00", startTime: "13:00" },
    ]);
  });

  test("intervalo a mais num dia só vira horário próprio daquele dia, e Remover o desfaz", async () => {
    const { user } = renderWith(weekdays);

    await user.click(personalize());
    await user.click(dayRow("Quarta"));
    const quarta = dayRow("Quarta").closest<HTMLElement>(".hours-day")!;
    await user.click(
      within(quarta).getByRole("button", { name: "Adicionar intervalo" }),
    );

    expect(dayRow("Quarta")).toHaveAccessibleName(
      "Quarta 09:00 – 18:00, 19:00 – 20:00",
    );
    expect(quarta).toHaveClass("is-different");
    expect(screen.getByLabelText("Quarta · Início do intervalo 2")).toHaveValue(
      "19:00",
    );

    await user.click(
      screen.getByRole("button", { name: "Remover intervalo 2 de Quarta" }),
    );
    expect(dayRow("Quarta").closest(".hours-day")).not.toHaveClass(
      "is-different",
    );
  });

  test("intervalos sobrepostos num dia com horário próprio são recusados no próprio dia, sem PATCH", async () => {
    const { user } = renderWith([
      ...weekdays,
      [6, "09:00", "12:00"],
      [6, "11:00", "14:00"],
    ]);

    // O dia inválido fica aberto, com o erro dentro dele.
    const sabado = dayRow("Sábado").closest<HTMLElement>(".hours-day")!;
    expect(within(sabado).getByRole("alert")).toHaveTextContent(
      "Os intervalos não podem se sobrepor.",
    );
    await user.click(save());

    expect(updateAvailability).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sábado: Os intervalos não podem se sobrepor.",
    );
  });

  test("salvar mantém as regras inativas, avisa no status e no toast", async () => {
    const { onSaved, user } = renderWith([
      ...weekdays,
      [0, "10:00", "12:00", false],
    ]);

    await user.click(save());

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Disponibilidade salva.",
      ),
    );
    expect(savedRules().at(-1)).toEqual({
      active: false,
      dayOfWeek: 0,
      endTime: "12:00",
      startTime: "10:00",
    });
    expect(showToast).toHaveBeenCalledWith("Disponibilidade salva.");
    expect(onSaved).toHaveBeenCalled();
  });
});
