// @vitest-environment jsdom
/**
 * D-207 — duração do serviço por atendimento. Um serviço que leva 40 min por
 * padrão pode levar 60 para uma cliente específica: na criação (o stepper
 * em Serviços muda o fim, a disponibilidade, a reserva e a criação) e depois
 * de marcado ("Ajustar duração" no detalhe, com a mesma recusa e o mesmo
 * encaixe com motivo da remarcação). O padrão aparece ao lado sempre que a
 * duração difere dele.
 *
 * As afirmações são sobre o que a tela mostra e sobre a requisição emitida.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  type AppointmentHold,
  type AvailabilityQuery,
  type AvailabilitySlot,
  BffHttpError,
  type CalendarState,
  type ChangeAppointmentDurationInput,
  type CreateAppointmentInput,
  type CreateHoldInput,
  type Service,
} from "@/data";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const createAppointment =
  vi.fn<
    (input: CreateAppointmentInput, key: string) => Promise<Appointment>
  >();
const createHold =
  vi.fn<(input: CreateHoldInput, key: string) => Promise<AppointmentHold>>();
const getAvailability =
  vi.fn<(query: AvailabilityQuery) => Promise<AvailabilitySlot[]>>();
const changeAppointmentDuration =
  vi.fn<
    (
      id: string,
      input: ChangeAppointmentDurationInput,
      key: string,
    ) => Promise<Appointment>
  >();
const getAppointment = vi.fn();
const getCalendar = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const listAppointments = vi.fn();
const listTimeBlocks = vi.fn();
const releaseHold = vi.fn();
const listCustomers = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      changeAppointmentDuration,
      createAppointment,
      createHold,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
      listAppointments,
      listTimeBlocks,
      releaseHold,
    },
    customers: { list: listCustomers },
    serviceCatalog: { list: listServices },
  }),
  useProductRuntime: () => ({ session: null }),
}));

const today = new Date();
const ISO_TODAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const FUTURE = "2099-01-05";

function calendarFixture(): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 40,
    id: "svc-corte",
    name: "Corte",
    needsReview: false,
    price: 90,
    priceType: "FIXED",
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
    customer: { id: "cus-ana", name: "Ana Paula", phone: null },
    customerId: "cus-ana",
    date: FUTURE,
    durationMinutes: 40,
    endTime: "09:40",
    finalValue: null,
    id: "apt-duracao",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        defaultDurationMinutes: 40,
        durationMinutes: 40,
        name: "Corte",
        price: 90,
        priceType: "FIXED",
        serviceId: "svc-corte",
      },
    ],
    source: "USER",
    startTime: "09:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

function holdFixture(): AppointmentHold {
  return {
    contactRef: null,
    customerId: "cus-ana",
    date: ISO_TODAY,
    durationMinutes: 60,
    endTime: "10:00",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    id: "hold-1",
    serviceIds: ["svc-corte"],
    source: "USER",
    startTime: "09:00",
    status: "ACTIVE",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  getCalendar.mockResolvedValue(calendarFixture());
  listServices.mockResolvedValue({
    editable: true,
    items: [
      serviceFixture(),
      serviceFixture({ durationMinutes: 30, id: "svc-escova", name: "Escova" }),
    ],
    source: "AVENLY",
  });
  listCustomers.mockResolvedValue({
    items: [{ id: "cus-ana", name: "Ana Paula", phone: null }],
    managedExternally: false,
    source: "AVENLY",
  });
  getAvailability.mockResolvedValue([
    { date: ISO_TODAY, endTime: "10:00", startTime: "09:00" },
  ]);
  createHold.mockResolvedValue(holdFixture());
  releaseHold.mockResolvedValue({ ...holdFixture(), status: "RELEASED" });
  createAppointment.mockResolvedValue(appointmentFixture());
  listAppointmentEvents.mockResolvedValue([]);
  listAppointmentNotifications.mockResolvedValue([]);
  listAppointments.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
});

type User = ReturnType<typeof userEvent.setup>;

async function openCreateWithCorte(): Promise<User> {
  render(
    <ShellConfigProvider>
      <AppointmentForm />
    </ShellConfigProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));
  await user.click(await screen.findByRole("checkbox", { name: /Corte/ }));
  return user;
}

function lastAvailabilityQuery(): AvailabilityQuery | undefined {
  return getAvailability.mock.calls.at(-1)?.[0];
}

describe("criação: duração ajustada neste agendamento", () => {
  test("“Ajustar duração” abre o stepper; +5 em +5 muda o total, a consulta, a reserva e a criação", async () => {
    const user = await openCreateWithCorte();
    expect(
      screen.queryByRole("group", { name: "Duração de Corte" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajustar duração" }));
    const stepper = screen.getByRole("group", { name: "Duração de Corte" });
    expect(
      within(stepper).getByRole("spinbutton", {
        name: "Duração de Corte em minutos",
      }),
    ).toHaveValue(40);

    const plus = screen.getByRole("button", {
      name: "Aumentar duração de Corte",
    });
    for (let step = 0; step < 4; step += 1) await user.click(plus);

    expect(
      within(stepper).getByRole("spinbutton", {
        name: "Duração de Corte em minutos",
      }),
    ).toHaveValue(60);
    // O padrão aparece ao lado quando a duração difere dele.
    expect(screen.getByText("padrão 40 min")).toBeVisible();
    expect(screen.getByText(/1 h · R\$/u)).toBeVisible();
    await waitFor(() =>
      expect(lastAvailabilityQuery()?.serviceDurations).toEqual([
        { durationMinutes: 60, serviceId: "svc-corte" },
      ]),
    );

    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect(createHold.mock.calls[0][0].serviceDurations).toEqual([
      { durationMinutes: 60, serviceId: "svc-corte" },
    ]);
    // O fim do resumo usa a duração ajustada.
    expect(screen.getByText(/09:00 – 10:00/u)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /Criar agendamento/u }),
    );
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toMatchObject({
      holdId: "hold-1",
      serviceDurations: [{ durationMinutes: 60, serviceId: "svc-corte" }],
      serviceIds: ["svc-corte"],
    });
  });

  test("mudar a duração refaz o horário escolhido", async () => {
    const user = await openCreateWithCorte();
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Ajustar duração" }));
    await user.click(
      screen.getByRole("button", { name: "Aumentar duração de Corte" }),
    );
    await waitFor(() => expect(releaseHold).toHaveBeenCalledWith("hold-1"));
    expect(screen.getByRole("radio", { name: "09:00" })).not.toBeChecked();
  });

  test("digitar a duração vale, e “Usar padrão” volta e tira o ajuste do pedido", async () => {
    const user = await openCreateWithCorte();
    await user.click(screen.getByRole("button", { name: "Ajustar duração" }));
    const input = screen.getByRole("spinbutton", {
      name: "Duração de Corte em minutos",
    });
    await user.clear(input);
    await user.type(input, "75");
    await user.tab();
    await waitFor(() =>
      expect(lastAvailabilityQuery()?.serviceDurations).toEqual([
        { durationMinutes: 75, serviceId: "svc-corte" },
      ]),
    );

    await user.click(screen.getByRole("button", { name: /Usar padrão/u }));
    expect(input).toHaveValue(40);
    expect(screen.queryByText("padrão 40 min")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(lastAvailabilityQuery()?.serviceDurations).toBeUndefined(),
    );
  });

  test("desmarcar o serviço desfaz o ajuste dele", async () => {
    const user = await openCreateWithCorte();
    await user.click(screen.getByRole("button", { name: "Ajustar duração" }));
    await user.click(
      screen.getByRole("button", { name: "Aumentar duração de Corte" }),
    );
    await user.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await user.click(screen.getByRole("checkbox", { name: /Corte/ }));
    // A lista continua aberta, de volta ao padrão.
    expect(screen.queryByText("padrão 40 min")).not.toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Duração de Corte em minutos" }),
    ).toHaveValue(40);
  });

  test("o stepper aberto passa no axe", async () => {
    const user = await openCreateWithCorte();
    await user.click(screen.getByRole("button", { name: "Ajustar duração" }));
    await user.click(
      screen.getByRole("button", { name: "Aumentar duração de Corte" }),
    );
    await expectNoA11yViolations(document.body);
  });
});

function renderDetail() {
  return render(
    <ShellConfigProvider>
      <AppointmentDetail appointmentId="apt-duracao" />
    </ShellConfigProvider>,
  );
}

function conflictError(): BffHttpError {
  return new BffHttpError({
    code: "SLOT_UNAVAILABLE",
    message: "Slot is unavailable for the service duration.",
    requestId: "req-1",
    status: 409,
  });
}

describe("detalhe: duração ajustada depois de marcado", () => {
  test("mostra a duração deste atendimento com o padrão ao lado", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({
        durationMinutes: 60,
        endTime: "10:00",
        services: [
          {
            defaultDurationMinutes: 40,
            durationMinutes: 60,
            name: "Corte",
            price: 90,
            priceType: "FIXED",
            serviceId: "svc-corte",
          },
        ],
      }),
    );
    renderDetail();
    expect(
      await screen.findByText(
        "Duração ajustada neste agendamento · padrão 40 min",
      ),
    ).toBeVisible();
  });

  test("“Ajustar duração” salva a duração nova, o fim muda e o histórico relê", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    changeAppointmentDuration.mockResolvedValue(
      appointmentFixture({
        durationMinutes: 60,
        endTime: "10:00",
        services: [
          {
            defaultDurationMinutes: 40,
            durationMinutes: 60,
            name: "Corte",
            price: 90,
            priceType: "FIXED",
            serviceId: "svc-corte",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole("button", { name: "Ajustar duração" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Ajustar duração" });
    const save = within(dialog).getByRole("button", { name: "Salvar duração" });
    // Nada mudou ainda: não há o que salvar.
    expect(save).toBeDisabled();

    const plus = within(dialog).getByRole("button", {
      name: "Aumentar duração de Corte",
    });
    for (let step = 0; step < 4; step += 1) await user.click(plus);
    expect(within(dialog).getByText("09:00 – 10:00")).toBeVisible();
    expect(within(dialog).getByText("padrão 40 min")).toBeVisible();

    const historyReads = listAppointmentEvents.mock.calls.length;
    await user.click(save);
    await waitFor(() =>
      expect(changeAppointmentDuration).toHaveBeenCalledTimes(1),
    );
    expect(changeAppointmentDuration.mock.calls[0][0]).toBe("apt-duracao");
    expect(changeAppointmentDuration.mock.calls[0][1]).toEqual({
      overlapOverride: undefined,
      overlapOverrideReason: undefined,
      services: [{ durationMinutes: 60, serviceId: "svc-corte" }],
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("– 10:00")).toBeVisible();
    expect(
      screen.getByText("Duração ajustada neste agendamento · padrão 40 min"),
    ).toBeVisible();
    await waitFor(() =>
      expect(listAppointmentEvents.mock.calls.length).toBeGreaterThan(
        historyReads,
      ),
    );
  });

  test("aumentar sobre outro atendimento mostra o mesmo aviso de recusa, e o encaixe exige motivo", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointments.mockResolvedValue([
      appointmentFixture(),
      appointmentFixture({
        customer: { id: "cus-bia", name: "Bia", phone: null },
        customerId: "cus-bia",
        endTime: "10:30",
        id: "apt-bia",
        startTime: "09:45",
      }),
    ]);
    changeAppointmentDuration
      .mockRejectedValueOnce(conflictError())
      .mockResolvedValueOnce(
        appointmentFixture({ durationMinutes: 60, endTime: "10:00" }),
      );
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole("button", { name: "Ajustar duração" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Ajustar duração" });
    const plus = within(dialog).getByRole("button", {
      name: "Aumentar duração de Corte",
    });
    for (let step = 0; step < 4; step += 1) await user.click(plus);
    await user.click(
      within(dialog).getByRole("button", { name: "Salvar duração" }),
    );

    const alert = await within(dialog).findByText(
      "Esse horário já está ocupado",
    );
    expect(alert).toBeVisible();
    // Quem ocupa é a outra cliente; o próprio atendimento não conta.
    expect(within(dialog).getByText("Bia")).toBeVisible();
    expect(within(dialog).queryByText("Ana Paula")).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Encaixar mesmo assim" }),
    );
    expect(
      await within(dialog).findByText(
        "Descreva o motivo do encaixe. Sem motivo, a duração não é salva.",
      ),
    ).toBeVisible();
    expect(changeAppointmentDuration).toHaveBeenCalledTimes(1);

    await user.type(
      within(dialog).getByLabelText("Motivo do encaixe"),
      "Caso especial",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Encaixar mesmo assim" }),
    );
    await waitFor(() =>
      expect(changeAppointmentDuration).toHaveBeenCalledTimes(2),
    );
    expect(changeAppointmentDuration.mock.calls[1][1]).toMatchObject({
      overlapOverride: true,
      overlapOverrideReason: "Caso especial",
    });
  });

  test("o diálogo passa no axe e Esc fecha devolvendo o foco", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    const user = userEvent.setup();
    renderDetail();
    const open = await screen.findByRole("button", { name: "Ajustar duração" });
    await user.click(open);
    await screen.findByRole("dialog", { name: "Ajustar duração" });
    await expectNoA11yViolations(document.body);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(open).toHaveFocus();
  });

  test("concluído ou sem serviço do catálogo não oferece ajuste", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ status: "COMPLETED" }),
    );
    const { unmount } = renderDetail();
    await screen.findByText("Corte");
    expect(
      screen.queryByRole("button", { name: "Ajustar duração" }),
    ).not.toBeInTheDocument();
    unmount();

    window.sessionStorage.clear();
    getAppointment.mockResolvedValue(
      appointmentFixture({ services: [], title: "Avaliação" }),
    );
    renderDetail();
    await screen.findByText("Avaliação");
    expect(
      screen.queryByRole("button", { name: "Ajustar duração" }),
    ).not.toBeInTheDocument();
  });
});
