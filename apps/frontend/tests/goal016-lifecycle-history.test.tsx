// @vitest-environment jsdom
/**
 * Goal016 (WU-08): ciclo de vida e histórico por evento.
 *
 * O que precisa ficar provado: concluir, marcar falta com nota, confirmar
 * presença e registrar valor final são eixos distintos — nenhum é inferido
 * dos outros —, a conclusão automática (`completionOrigin: "AUTO"`) aparece
 * como automática e nunca como ação da profissional, o histórico é
 * cronológico com desempate por `sequence` quando `occurredAt` empata, e cada
 * evento mostra tipo, origem, ator e motivo, com a origem `AI` lida como IA.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  type AppointmentEvent,
  type AppointmentLifecycle,
  type CalendarState,
} from "@/data";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const completeAppointment = vi.fn();
const confirmAppointmentPresence = vi.fn();
const getAppointment = vi.fn();
const getCalendar = vi.fn();
const listAppointmentEvents = vi.fn();
const markAppointmentNoShow = vi.fn();
const setAppointmentFinalValue = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      completeAppointment,
      confirmAppointmentPresence,
      getAppointment,
      getCalendar,
      listAppointmentEvents,
      markAppointmentNoShow,
      setAppointmentFinalValue,
    },
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
    customer: { id: "c1", name: "Ana Paula", phone: "+5511999990000" },
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

function lifecycleFixture(
  overrides: Partial<AppointmentLifecycle> = {},
): AppointmentLifecycle {
  return {
    completedAt: null,
    completedBy: null,
    completionOrigin: null,
    finalValue: null,
    finalValueSetAt: null,
    finalValueSetBy: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    status: "CONFIRMED",
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
    completeAppointment,
    confirmAppointmentPresence,
    getAppointment,
    getCalendar,
    listAppointmentEvents,
    markAppointmentNoShow,
    setAppointmentFinalValue,
  ]) {
    spy.mockReset();
  }
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointmentEvents.mockResolvedValue([eventFixture()]);
});

function renderDetail() {
  return render(
    <ShellConfigProvider>
      <AppointmentDetail appointmentId="apt-1" />
    </ShellConfigProvider>,
  );
}

/** O eixo "estado" repete o rótulo no cabeçalho e no painel de ciclo de vida
 * de propósito (contexto em dois lugares); os testes de eixo isolam o painel
 * para não confundir os dois. */
function lifecycleSection(): HTMLElement {
  return screen.getByRole("heading", { name: "Ciclo do atendimento" })
    .closest("section") as HTMLElement;
}

describe("eixos distintos do ciclo de vida", () => {
  test("concluir chama a rota de conclusão e mostra o novo estado", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    completeAppointment.mockResolvedValue(
      lifecycleFixture({ completedAt: "2026-09-14T14:00:00.000Z", completionOrigin: "MANUAL", status: "COMPLETED" }),
    );
    renderDetail();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Concluir atendimento" }),
    );

    await waitFor(() => expect(completeAppointment).toHaveBeenCalledWith("apt-1"));
    const section = await waitFor(() => lifecycleSection());
    expect(within(section).getByText("Concluído")).toBeVisible();
    // Concluir não mexe nos outros dois eixos.
    expect(within(section).getByText("Presença ainda não confirmada")).toBeVisible();
    expect(within(section).getByText("Ainda não registrado")).toBeVisible();
  });

  test("conclusão automática aparece como automática, não como ação da profissional", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({
        completedAt: "2026-09-14T12:00:00.000Z",
        completionOrigin: "AUTO",
        status: "COMPLETED",
      }),
    );
    renderDetail();

    const section = await waitFor(() => lifecycleSection());
    expect(within(section).getByText("Concluído automaticamente")).toBeVisible();
    expect(within(section).queryByText("Concluído")).not.toBeInTheDocument();
  });

  test("marcar falta pede nota opcional e envia só o que foi preenchido", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    markAppointmentNoShow.mockResolvedValue(
      lifecycleFixture({ noShowAt: "2026-09-14T14:00:00.000Z", noShowNote: "Cliente avisou depois", status: "NO_SHOW" }),
    );
    renderDetail();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Marcar falta" }),
    );
    await user.type(
      screen.getByLabelText("Observação da falta (opcional)"),
      "Cliente avisou depois",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar falta" }));

    await waitFor(() =>
      expect(markAppointmentNoShow).toHaveBeenCalledWith("apt-1", {
        note: "Cliente avisou depois",
      }),
    );
    const section = await waitFor(() => lifecycleSection());
    expect(within(section).getByText("Não compareceu")).toBeVisible();
  });

  test("confirmar presença é uma ação própria, separada da conclusão", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    confirmAppointmentPresence.mockResolvedValue(
      lifecycleFixture({ presenceConfirmedAt: "2026-09-14T09:55:00.000Z" }),
    );
    renderDetail();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Confirmar presença" }),
    );

    await waitFor(() =>
      expect(confirmAppointmentPresence).toHaveBeenCalledWith("apt-1"),
    );
    expect(await screen.findByText("Presença confirmada")).toBeVisible();
    // O estado do atendimento continua confirmado: presença não conclui.
    expect(within(lifecycleSection()).getByText("Confirmado")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirmar presença" }),
    ).not.toBeInTheDocument();
  });

  test("valor final é separado do acordo comercial e nunca herda o preço previsto", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ status: "COMPLETED", completedAt: "2026-09-14T11:05:00.000Z" }),
    );
    setAppointmentFinalValue.mockResolvedValue(
      lifecycleFixture({
        finalValue: 120,
        finalValueSetAt: "2026-09-14T14:00:00.000Z",
        status: "COMPLETED",
      }),
    );
    renderDetail();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Registrar valor final" }),
    );
    await user.type(
      screen.getByLabelText("Valor efetivamente cobrado (R$)"),
      "120",
    );
    await user.click(screen.getByRole("button", { name: "Salvar valor final" }));

    await waitFor(() =>
      expect(setAppointmentFinalValue).toHaveBeenCalledWith("apt-1", {
        amount: 120,
      }),
    );
    expect(await screen.findByText("R$ 120,00")).toBeVisible();
    // O preço previsto do acordo (R$ 90,00) continua exibido à parte.
    expect(screen.getByText("R$ 90,00")).toBeVisible();
  });
});

describe("histórico cronológico com desempate por sequence", () => {
  test("occurredAt empatado é desempatado por sequence, não pela ordem de chegada", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentEvents.mockResolvedValue([
      eventFixture({
        actor: null,
        id: "evt-2",
        occurredAt: "2026-09-14T13:00:00.000Z",
        sequence: "20",
        type: "HOLD_CONSUMED",
      }),
      eventFixture({
        actor: "cus-ana",
        id: "evt-1",
        occurredAt: "2026-09-14T13:00:00.000Z",
        sequence: "9",
        type: "CREATED",
      }),
    ]);
    renderDetail();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    // sequence "9" vem antes de "20" mesmo com occurredAt igual — se o
    // desempate fosse por string, "20" venceria "9" na ordem errada.
    expect(within(items[0]).getByText(/Agendamento criado/)).toBeVisible();
    expect(within(items[1]).getByText(/Reserva consumida/)).toBeVisible();
  });

  test("cada evento mostra tipo, origem, ator e motivo, com origem AI lida como IA", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentEvents.mockResolvedValue([
      eventFixture({
        actor: "Assistente da Atendly",
        id: "evt-ai",
        occurredAt: "2026-09-14T13:00:00.000Z",
        reason: "Cliente pediu pelo WhatsApp",
        sequence: "1",
        source: "AI",
        type: "RESCHEDULED",
      }),
    ]);
    renderDetail();

    const item = await screen.findByRole("listitem");
    expect(within(item).getByText(/Reagendado/)).toBeVisible();
    expect(within(item).getByText(/IA/)).toBeVisible();
    expect(
      within(item).getByText("Por Assistente da Atendly"),
    ).toBeVisible();
    expect(
      within(item).getByText("Motivo: Cliente pediu pelo WhatsApp"),
    ).toBeVisible();
  });

  test("histórico vazio não trava a tela", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentEvents.mockResolvedValue([]);
    renderDetail();

    expect(
      await screen.findByText("Nenhum evento registrado ainda."),
    ).toBeVisible();
  });
});

describe("acessibilidade", () => {
  test("o detalhe com ciclo de vida e histórico passa no axe", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    const { container } = renderDetail();
    await screen.findByRole("button", { name: "Concluir atendimento" });
    await screen.findByRole("listitem");
    await expectNoA11yViolations(container);
  });
});
