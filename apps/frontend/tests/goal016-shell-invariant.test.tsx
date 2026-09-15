// @vitest-environment jsdom
/**
 * Goal016 (WU-11): fecha a mesma invariante que goal015-shell-invariant.test.tsx
 * fechou para Clientes e Serviços — `ShellConfigProvider` mais cada tela real
 * de Agenda precisa sobreviver a montagem, carregamento e interação sem violar
 * a regra de uma chamada de `useShellConfig` por árvore. Se essa invariante for
 * violada (por exemplo, duas montagens concorrentes do mesmo config, ou um
 * efeito que nunca estabiliza), React lança "Maximum update depth exceeded" e a
 * interação abaixo lança essa mesma exceção, derrubando o teste — não há
 * necessidade de capturá-la explicitamente.
 *
 * Nove telas cobrem lista, as três visualizações e cada fluxo entregue pelo
 * Goal016: `AgendaBoard` (lista + Dia/Semana/Mês), `AppointmentForm` (novo
 * agendamento), `BlockForm` (bloqueio/compromisso), `BlockSeriesForm` (série de
 * bloqueio), `SeriesPreview` (série de atendimento), `AvailabilityExceptions`
 * (exceções de disponibilidade), `AppointmentDetail` (detalhe + ciclo de vida +
 * histórico), `RescheduleFlow` (remarcação) e `CancelFlow` (cancelamento).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  type AppointmentEvent,
  type CalendarState,
  type Customer,
  type CustomerList,
  type Service,
  type ServiceList,
  type TimeBlock,
} from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { AvailabilityExceptions } from "@/features/agenda/AvailabilityExceptions";
import { BlockForm } from "@/features/agenda/BlockForm";
import { BlockSeriesForm } from "@/features/agenda/BlockSeriesForm";
import { CancelFlow } from "@/features/agenda/CancelFlow";
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import { SeriesPreview } from "@/features/agenda/SeriesPreview";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const cancelAppointment = vi.fn();
const completeAppointment = vi.fn();
const confirmAppointmentPresence = vi.fn();
const confirmAppointmentSeries = vi.fn();
const createAppointment = vi.fn();
const createBlockSeries = vi.fn();
const createExtraAvailability = vi.fn();
const createHold = vi.fn();
const createTimeBlock = vi.fn();
const createUnavailability = vi.fn();
const deleteTimeBlock = vi.fn();
const getAppointment = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const markAppointmentNoShow = vi.fn();
const previewAppointmentSeries = vi.fn();
const releaseHold = vi.fn();
const removeAvailabilityException = vi.fn();
const rescheduleAppointment = vi.fn();
const setAppointmentFinalValue = vi.fn();
const listCustomers = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      cancelAppointment,
      completeAppointment,
      confirmAppointmentPresence,
      confirmAppointmentSeries,
      createAppointment,
      createBlockSeries,
      createExtraAvailability,
      createHold,
      createTimeBlock,
      createUnavailability,
      deleteTimeBlock,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
      markAppointmentNoShow,
      previewAppointmentSeries,
      releaseHold,
      removeAvailabilityException,
      rescheduleAppointment,
      setAppointmentFinalValue,
    },
    customers: { list: listCustomers },
    serviceCatalog: { list: listServices },
  }),
}));

const ISO_TODAY = "2026-09-14";

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

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 60,
    id: "svc-corte",
    name: "Corte feminino",
    needsReview: false,
    price: 90,
    priceType: "FIXED",
    recurrenceIntervalDays: 21,
    ...overrides,
  };
}

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cus-ana",
    name: "Ana Paula",
    phone: "+5511999990000",
    ...overrides,
  };
}

function customerListFixture(overrides: Partial<CustomerList> = {}): CustomerList {
  return { items: [], managedExternally: false, source: "ATENDLY", ...overrides };
}

function serviceListFixture(overrides: Partial<ServiceList> = {}): ServiceList {
  return { editable: true, items: [serviceFixture()], source: "ATENDLY", ...overrides };
}

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: customerFixture(),
    customerId: "cus-ana",
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
        serviceId: "svc-corte",
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

function timeBlockFixture(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    endAt: `${ISO_TODAY}T16:00:00.000Z`,
    id: "block-1",
    kind: "BLOCK",
    reason: "Almoço",
    seriesId: null,
    startAt: `${ISO_TODAY}T15:00:00.000Z`,
    title: null,
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
  for (const spy of [
    push,
    replace,
    cancelAppointment,
    completeAppointment,
    confirmAppointmentPresence,
    confirmAppointmentSeries,
    createAppointment,
    createBlockSeries,
    createExtraAvailability,
    createHold,
    createTimeBlock,
    createUnavailability,
    deleteTimeBlock,
    getAppointment,
    getAvailability,
    getCalendar,
    listAppointmentEvents,
    listAppointmentNotifications,
    listAppointments,
    listAvailabilityExceptions,
    listTimeBlocks,
    markAppointmentNoShow,
    previewAppointmentSeries,
    releaseHold,
    removeAvailabilityException,
    rescheduleAppointment,
    setAppointmentFinalValue,
    listCustomers,
    listServices,
  ]) {
    spy.mockReset();
  }
  getAvailability.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listCustomers.mockResolvedValue(customerListFixture());
  listServices.mockResolvedValue(serviceListFixture());
  listAppointmentNotifications.mockResolvedValue([]);
});

function renderWithShell(node: React.ReactElement) {
  return render(<ShellConfigProvider>{node}</ShellConfigProvider>);
}

describe("ShellConfigProvider + Agenda (lista e visualizações) não excede a profundidade de atualização", () => {
  test("carrega a lista e alterna Dia, Semana e Mês repetidamente", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([appointmentFixture()]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture()]);
    const user = userEvent.setup();

    renderWithShell(<AgendaBoard />);

    expect(await screen.findByRole("heading", { name: "Agenda" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Semana" }));
    expect(await screen.findByLabelText("Mapa da semana")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Mês" }));
    expect(await screen.findByLabelText("Mapa do mês")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Dia" }));
    await user.click(screen.getByRole("tab", { name: "Semana" }));
    await user.click(screen.getByRole("tab", { name: "Dia" }));

    expect(await screen.findByLabelText(/Agenda de/)).toBeVisible();
  });
});

describe("ShellConfigProvider + Novo agendamento não excede a profundidade de atualização", () => {
  test("responde a digitação contínua do nome do cliente", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    const user = userEvent.setup();

    renderWithShell(<AppointmentForm />);

    const nameField = await screen.findByLabelText("Nome do cliente");
    await user.type(nameField, "Camila Duarte");
    expect(nameField).toHaveValue("Camila Duarte");
  });
});

describe("ShellConfigProvider + Bloquear horário não excede a profundidade de atualização", () => {
  test("alterna repetidamente entre bloqueio e compromisso pessoal", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    const user = userEvent.setup();

    renderWithShell(<BlockForm />);

    await screen.findByRole("heading", { name: "Bloquear horário" });
    const personal = screen.getByRole("radio", { name: /^Compromisso pessoal/ });
    const block = screen.getByRole("radio", { name: /^Bloqueio operacional/ });
    await user.click(personal);
    await user.click(block);
    await user.click(personal);
    await user.click(block);

    expect(block).toBeChecked();
  });
});

describe("ShellConfigProvider + Série de bloqueio não excede a profundidade de atualização", () => {
  test("alterna repetidamente os dias da semana escolhidos", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    const user = userEvent.setup();

    renderWithShell(<BlockSeriesForm />);

    await screen.findByRole("heading", { name: "Criar série de bloqueio" });
    const monday = screen.getByRole("checkbox", { name: "Seg" });
    const wednesday = screen.getByRole("checkbox", { name: "Qua" });
    await user.click(monday);
    await user.click(wednesday);
    await user.click(monday);
    await user.click(wednesday);

    expect(monday).not.toBeChecked();
    expect(wednesday).not.toBeChecked();
  });
});

describe("ShellConfigProvider + Série de atendimento (pré-visualização) não excede a profundidade de atualização", () => {
  test("responde a digitação contínua do nome do cliente", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    const user = userEvent.setup();

    renderWithShell(<SeriesPreview />);

    const nameField = await screen.findByLabelText("Nome do cliente");
    await user.type(nameField, "Bruna Lima");
    expect(nameField).toHaveValue("Bruna Lima");
  });
});

describe("ShellConfigProvider + Exceções de disponibilidade não excede a profundidade de atualização", () => {
  test("alterna repetidamente entre disponibilidade extra e indisponibilidade", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    const user = userEvent.setup();

    renderWithShell(<AvailabilityExceptions />);

    await screen.findByRole("heading", { name: "Exceções de disponibilidade" });
    const extra = screen.getByRole("radio", { name: /^Disponibilidade extra/ });
    const unavailable = screen.getByRole("radio", { name: /^Indisponibilidade/ });
    await user.click(unavailable);
    await user.click(extra);
    await user.click(unavailable);
    await user.click(extra);

    expect(extra).toBeChecked();
  });
});

describe("ShellConfigProvider + Detalhe do agendamento (ciclo de vida e histórico) não excede a profundidade de atualização", () => {
  test("abre e fecha o formulário de falta repetidamente", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointmentEvents.mockResolvedValue([eventFixture()]);
    const user = userEvent.setup();

    renderWithShell(<AppointmentDetail appointmentId="apt-1" />);

    await screen.findByRole("heading", { name: "Ana Paula" });
    const toggle = await screen.findByRole("button", { name: "Marcar falta" });
    await user.click(toggle);
    await user.click(toggle);
    await user.click(toggle);
    await user.click(toggle);

    expect(await screen.findByText("Aguardando confirmação")).toBeVisible();
  });
});

describe("ShellConfigProvider + Reagendar não excede a profundidade de atualização", () => {
  test("responde a digitação contínua no horário manual", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    getCalendar.mockResolvedValue(calendarFixture());
    const user = userEvent.setup();

    renderWithShell(<RescheduleFlow appointmentId="apt-1" />);

    const manualTime = await screen.findByLabelText(
      "Outro horário, fora dos oferecidos",
    );
    await user.type(manualTime, "1400");
    expect(manualTime).toHaveValue("14:00");
  });
});

describe("ShellConfigProvider + Cancelar não excede a profundidade de atualização", () => {
  test("responde a digitação contínua no motivo do cancelamento", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    getCalendar.mockResolvedValue(calendarFixture());
    const user = userEvent.setup();

    renderWithShell(<CancelFlow appointmentId="apt-1" />);

    const reasonField = await screen.findByLabelText("Motivo ou observação (opcional)");
    await user.type(reasonField, "Cliente remarcou por telefone");
    expect(reasonField).toHaveValue("Cliente remarcou por telefone");
  });
});
