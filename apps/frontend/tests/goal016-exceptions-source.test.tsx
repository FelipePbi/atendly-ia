// @vitest-environment jsdom
/**
 * Goal016 (WU-09): exceções de disponibilidade por data e guard explícito
 * por fonte.
 *
 * Cobre a criação e remoção de disponibilidade extra e indisponibilidade
 * (total e parcial); a indisponibilidade que cobre atendimento confirmado
 * mostrando o que será afetado e só reenviando com `decidedReason`; a
 * ausência de qualquer campo `decidedBy` no formulário; a ausência de
 * capability explicada por ela mesma, sem nenhuma leitura de agenda
 * requisitada; e o guard puro de `sourceGuard.ts`.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type Appointment, BffHttpError, type CalendarState } from "@/data";
import { AvailabilityExceptions } from "@/features/agenda/AvailabilityExceptions";
import { BlockForm } from "@/features/agenda/BlockForm";
import {
  canPerform,
  operationLabel,
  personAgendaGuard,
} from "@/features/agenda/sourceGuard";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getCalendar = vi.fn();
const listAvailabilityExceptions = vi.fn();
const createExtraAvailability = vi.fn();
const createUnavailability = vi.fn();
const removeAvailabilityException = vi.fn();
const listAppointments = vi.fn();
const listTimeBlocks = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      createExtraAvailability,
      createUnavailability,
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
      removeAvailabilityException,
    },
  }),
}));

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const today = new Date();
const ISO_TODAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

function calendarFixture(
  overrides: Partial<CalendarState> = {},
): CalendarState {
  const source = overrides.source ?? "AVENLY";
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: source === "AVENLY",
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source,
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "+5511999990000" },
    customerId: "c1",
    date: ISO_TODAY,
    durationMinutes: 60,
    endTime: "11:00",
    finalValue: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 60,
        name: "Corte feminino",
        price: 90,
        priceType: "FIXED",
        serviceId: "s1",
      },
    ],
    source: "USER",
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

beforeEach(() => {
  getCalendar.mockReset();
  listAvailabilityExceptions.mockReset();
  createExtraAvailability.mockReset();
  createUnavailability.mockReset();
  removeAvailabilityException.mockReset();
  listAppointments.mockReset();
  listTimeBlocks.mockReset();
  push.mockReset();
  replace.mockReset();
});

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <AvailabilityExceptions />
    </ShellConfigProvider>,
  );
}

// Pedido de 2026-10-12 (D-169): o dia fechado (indisponibilidade) é criado em
// "Bloquear horário", com "Dia inteiro" ligado (`?type=CLOSED` já abre assim,
// numa tela só desde a revisão do mesmo dia); a tela de /agenda/excecoes
// ficou só com o "Horário extra" e a lista das duas exceções.
function renderBlockForm() {
  window.history.pushState(
    {},
    "",
    `/agenda/bloquear?type=CLOSED&date=${ISO_TODAY}`,
  );
  return render(
    <ShellConfigProvider>
      <BlockForm />
    </ShellConfigProvider>,
  );
}

async function openClosedStep() {
  expect(
    await screen.findByRole("switch", { name: "Dia inteiro" }),
  ).toBeChecked();
}

describe("disponibilidade extra e indisponibilidade podem ser criadas e removidas por data", () => {
  test("cria horário extra e remove; o dia fechado listado também pode ser removido", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAvailabilityExceptions.mockResolvedValue([
      {
        available: false,
        date: ISO_TODAY,
        decidedBy: null,
        decidedReason: null,
        endTime: null,
        id: "exc-unavailable",
        reason: "Feriado local",
        startTime: null,
      },
    ]);
    createExtraAvailability.mockResolvedValue({
      available: true,
      date: ISO_TODAY,
      decidedBy: null,
      decidedReason: null,
      endTime: "18:00",
      id: "exc-extra",
      reason: null,
      startTime: "09:00",
    });
    removeAvailabilityException.mockResolvedValue({ deleted: true });
    const user = userEvent.setup();

    const { container } = renderScreen();

    await screen.findByRole("heading", { level: 1, name: "Horário extra" });
    const list = await screen.findByRole("list");
    expect(within(list).getByText("Fechado")).toBeVisible();
    expect(within(list).getByText("Feriado local")).toBeVisible();
    expect(within(list).getByText("Dia inteiro")).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole("button", { name: "Liberar horário extra" }),
    );
    expect(createExtraAvailability).toHaveBeenCalledWith({
      date: ISO_TODAY,
      endTime: "18:00",
      startTime: "09:00",
    });
    expect(await within(list).findByText("Horário extra")).toBeVisible();
    expect(
      within(list).getAllByRole("button", { name: "Remover" }),
    ).toHaveLength(2);

    const extraItem = within(list).getByText("Horário extra").closest("li");
    if (!extraItem) throw new Error("item de horário extra não encontrado");
    await user.click(
      within(extraItem).getByRole("button", { name: "Remover" }),
    );
    expect(removeAvailabilityException).toHaveBeenCalledWith("exc-extra");
    await screen.findByText("Fechado");
    expect(within(list).queryByText("Horário extra")).toBeNull();

    await user.click(within(list).getByRole("button", { name: "Remover" }));
    expect(removeAvailabilityException).toHaveBeenCalledWith("exc-unavailable");
    expect(
      await screen.findByText(
        "Nenhum horário extra ou dia fechado nos próximos 90 dias.",
      ),
    ).toBeVisible();
  });

  test("o dia fechado de dia inteiro nasce em Bloquear horário com o payload de antes", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    createUnavailability.mockResolvedValue({
      available: false,
      date: ISO_TODAY,
      decidedBy: null,
      decidedReason: null,
      endTime: null,
      id: "exc-unavailable",
      reason: "Feriado local",
      startTime: null,
    });
    const user = userEvent.setup();

    renderBlockForm();
    await openClosedStep();
    await user.click(screen.getByRole("button", { name: "Motivo" }));
    await user.type(
      screen.getByLabelText("Motivo (opcional)"),
      "Feriado local",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    );

    expect(createUnavailability).toHaveBeenCalledWith({
      date: ISO_TODAY,
      decidedReason: undefined,
      endTime: undefined,
      reason: "Feriado local",
      startTime: undefined,
    });
    expect(await screen.findByText("Dia fechado confirmado")).toBeVisible();
    expect(screen.getByText("Feriado local")).toBeVisible();
  });
});

describe("indisponibilidade que cobre atendimento confirmado", () => {
  test("mostra o que será afetado e só reenvia com decidedReason explícito", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([appointmentFixture()]);
    listTimeBlocks.mockResolvedValue([]);
    createUnavailability
      .mockRejectedValueOnce(
        new BffHttpError({
          code: "EXCEPTION_APPOINTMENT_CONFLICT",
          details: { appointmentId: "apt-1" },
          message: "conflict",
          requestId: "req-1",
          status: 409,
        }),
      )
      .mockResolvedValueOnce({
        available: false,
        date: ISO_TODAY,
        decidedBy: null,
        decidedReason: "Fechamento excepcional para reforma",
        endTime: null,
        id: "exc-forced",
        reason: null,
        startTime: null,
      });
    const user = userEvent.setup();

    renderBlockForm();
    await openClosedStep();
    await user.click(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    );

    expect(
      await screen.findByText(
        "Este fechamento cobre atendimento já confirmado",
      ),
    ).toBeVisible();
    expect(screen.getByText("Atendimento")).toBeVisible();
    expect(screen.getByText("Ana Paula")).toBeVisible();
    expect(createUnavailability).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Confirmar mesmo assim" }),
    );
    expect(
      await screen.findByText(
        "Descreva o motivo da decisão. Sem motivo, o fechamento não é enviado.",
      ),
    ).toBeVisible();
    expect(createUnavailability).toHaveBeenCalledTimes(1);

    await user.type(
      screen.getByLabelText("Motivo da decisão"),
      "Fechamento excepcional para reforma",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar mesmo assim" }),
    );

    expect(createUnavailability).toHaveBeenCalledTimes(2);
    expect(createUnavailability).toHaveBeenNthCalledWith(2, {
      date: ISO_TODAY,
      decidedReason: "Fechamento excepcional para reforma",
      endTime: undefined,
      reason: undefined,
      startTime: undefined,
    });
    expect(
      await screen.findByText("Fechamento excepcional para reforma"),
    ).toBeVisible();
  });
});

describe("nenhum campo decidedBy existe em formulário algum", () => {
  test("nem no formulário de criação nem no painel de conflito", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([appointmentFixture()]);
    listTimeBlocks.mockResolvedValue([]);
    createUnavailability.mockRejectedValueOnce(
      new BffHttpError({
        code: "EXCEPTION_APPOINTMENT_CONFLICT",
        details: { appointmentId: "apt-1" },
        message: "conflict",
        requestId: "req-1",
        status: 409,
      }),
    );
    const user = userEvent.setup();
    const { container } = renderBlockForm();

    await openClosedStep();
    expect(screen.queryByLabelText(/decidido por/i)).toBeNull();
    expect(screen.queryByText(/decidido por/i)).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    );
    await screen.findByText("Este fechamento cobre atendimento já confirmado");

    expect(screen.queryByLabelText(/decidido por/i)).toBeNull();
    expect(screen.queryByText(/decidido por/i)).toBeNull();
    expect(container.querySelector('[name="decidedBy"]')).toBeNull();
  });
});

describe("sem capability de manageAvailability nenhuma leitura de agenda por pessoa é requisitada", () => {
  test("a operação é explicada pela capability, sem nenhuma requisição de exceções ou atendimentos", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({
        capabilities: {
          createAppointments: true,
          manageAvailability: false,
          manageCustomers: true,
          manageServices: true,
          migrate: false,
        },
      }),
    );
    const { container } = renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Operação indisponível" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        `A configuração atual de Agenda Avenly não permite ${operationLabel("manageAvailability")} por aqui.`,
      ),
    ).toBeVisible();
    expect(screen.queryByText(/algo deu errado/i)).toBeNull();

    expect(listAvailabilityExceptions).not.toHaveBeenCalled();
    expect(listAppointments).not.toHaveBeenCalled();
    expect(listTimeBlocks).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});

describe("sourceGuard: guard explícito por calendar.source e calendar.capabilities", () => {
  test("canPerform e operationLabel refletem a capability, não um texto fixo", () => {
    expect(canPerform(calendarFixture(), "manageAvailability")).toBe(true);
    expect(
      canPerform(
        calendarFixture({
          capabilities: {
            createAppointments: true,
            manageAvailability: false,
            manageCustomers: true,
            manageServices: true,
            migrate: false,
          },
        }),
        "manageAvailability",
      ),
    ).toBe(false);
    expect(canPerform(null, "manageAvailability")).toBe(false);
    expect(operationLabel("createAppointments")).toBe("criar agendamentos");
  });

  test("personAgendaGuard recusa ausência de fonte e permite AVENLY", () => {
    expect(personAgendaGuard(calendarFixture()).allowed).toBe(true);
    expect(personAgendaGuard(calendarFixture()).reason).toBeNull();

    const unset = personAgendaGuard(calendarFixture({ source: null }));
    expect(unset.allowed).toBe(false);
    expect(unset.reason).toMatch(/fonte oficial/i);

    expect(personAgendaGuard(null).allowed).toBe(false);
  });
});
