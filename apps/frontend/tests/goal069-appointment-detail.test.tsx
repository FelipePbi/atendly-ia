// @vitest-environment jsdom
/**
 * Goal069 (WU-03), §6.8 a §6.10: histórico sem identificador interno (AG-07),
 * telefone formatado no detalhe (AG-08) e ações de fim só a partir do início
 * do atendimento (AG-09).
 *
 * Cada teste roda primeiro contra a baseline `37c7371` (colado no relatório
 * como vermelho) e depois contra o código deste Goal.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type Appointment, type AppointmentEvent, type CalendarState } from "@/data";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getAppointment = vi.fn();
const getCalendar = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();

let sessionUser: { email: string; id: string; name?: string | null } | null;

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getAppointment,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
    },
  }),
  useProductRuntime: () => ({
    session: sessionUser
      ? { tenant: { id: "t1", name: "Studio Teste" }, user: sessionUser }
      : null,
  }),
}));

function calendarFixture(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source: "ATENDLY",
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
    customer: { id: "c1", name: "Ana Paula", phone: "5511998887766" },
    customerId: "c1",
    date: "2026-09-14",
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

function eventFixture(overrides: Partial<AppointmentEvent> = {}): AppointmentEvent {
  return {
    actor: null,
    after: null,
    before: null,
    id: "evt-1",
    occurredAt: "2026-09-14T13:00:00.000Z",
    reason: null,
    sequence: "1",
    source: "USER",
    type: "CREATED",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  sessionUser = { email: "dono@teste.com", id: "user-dono", name: "Dono do negócio" };
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointmentNotifications.mockResolvedValue([]);
});

function renderDetail() {
  return render(
    <ShellConfigProvider>
      <AppointmentDetail appointmentId="apt-1" />
    </ShellConfigProvider>,
  );
}

describe("§6.8 — histórico sem identificador interno (AG-07)", () => {
  test("actor igual ao user.id da sessão mostra o nome da pessoa", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentEvents.mockResolvedValue([
      eventFixture({ actor: "user-dono" }),
    ]);
    renderDetail();

    const item = await screen.findByRole("listitem");
    expect(within(item).getByText("Dono do negócio")).toBeVisible();
  });

  test("actor sem nome na sessão mostra o e-mail", async () => {
    sessionUser = { email: "dono@teste.com", id: "user-dono", name: null };
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentEvents.mockResolvedValue([
      eventFixture({ actor: "user-dono" }),
    ]);
    renderDetail();

    const item = await screen.findByRole("listitem");
    expect(within(item).getByText("dono@teste.com")).toBeVisible();
  });

  test("actor desconhecido (ex.: user.id de outra pessoa) não mostra o valor", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentEvents.mockResolvedValue([
      eventFixture({ actor: "cmujca5al0000zoi4xr95yrxk" }),
    ]);
    renderDetail();

    const item = await screen.findByRole("listitem");
    // Sem nome para mostrar, a autoria cai em "equipe" (A5): nunca o id.
    expect(within(item).getByText("equipe")).toBeVisible();
    expect(
      screen.queryByText("cmujca5al0000zoi4xr95yrxk"),
    ).not.toBeInTheDocument();
  });
});

describe("§6.9 — ações de fim só a partir do início do atendimento (AG-09)", () => {
  test("CONFIRMED com início futuro não tem Concluir nem Marcar falta", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ date: "2099-01-01", startTime: "10:00" }),
    );
    listAppointmentEvents.mockResolvedValue([]);
    const user = userEvent.setup();
    renderDetail();

    // O ciclo vive no menu "•••" (A5): futuro só oferece presença e valor final.
    await user.click(
      await screen.findByRole("button", { name: "Mais ações do agendamento" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: "Concluir atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Não compareceu" }),
    ).not.toBeInTheDocument();
  });

  test("CONFIRMED com início já passado tem Concluir e Marcar falta", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ date: "2020-01-01", startTime: "10:00" }),
    );
    listAppointmentEvents.mockResolvedValue([]);
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole("button", { name: "Mais ações do agendamento" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Concluir atendimento" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Não compareceu" }),
    ).toBeVisible();
  });
});

describe("§6.10 — telefone do detalhe formatado (AG-08)", () => {
  test("telefone brasileiro reconhecido aparece formatado, nunca cru", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({
        customer: { id: "c1", name: "Ana Paula", phone: "5511998887766" },
      }),
    );
    listAppointmentEvents.mockResolvedValue([]);
    renderDetail();

    expect(await screen.findByText("(11) 99888-7766")).toBeVisible();
    expect(screen.queryByText("5511998887766")).not.toBeInTheDocument();
  });
});
