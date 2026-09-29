// @vitest-environment jsdom
/**
 * Goal021 (WU-011): Notificar cliente em cancelar/remarcar, marcado por
 * padrão e sempre enviado explicitamente (o default do contrato é o oposto);
 * e, no detalhe do agendamento, o estado do lembrete e da confirmação lido
 * das intenções de envio **deste** agendamento e do próprio agendamento —
 * nunca texto fixo e nunca da configuração do negócio, que responde outra
 * pergunta — com a ausência de confirmação apresentada discretamente e
 * nenhum estado de lembrete afirmado quando esta ocorrência não tem nenhuma
 * intenção.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  type AppointmentNotification,
  type CalendarState,
} from "@/data";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { CancelFlow } from "@/features/agenda/CancelFlow";
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const cancelAppointment = vi.fn();
const confirmAppointmentPresence = vi.fn();
const getAppointment = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const rescheduleAppointment = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      cancelAppointment,
      confirmAppointmentPresence,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
      rescheduleAppointment,
    },
  }),
  useProductRuntime: () => ({ session: null }),
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
    customer: { id: "cus-ana", name: "Ana Paula", phone: "+5511999990000" },
    customerId: "cus-ana",
    date: "2026-09-14",
    durationMinutes: 60,
    endTime: "10:00",
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
    startTime: "09:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

/**
 * Intenção de envio **desta** ocorrência: é ela, e não `ReminderSettings`,
 * que sabe se o lembrete deste agendamento saiu.
 */
function notificationFixture(
  overrides: Partial<AppointmentNotification> = {},
): AppointmentNotification {
  return {
    appointmentVersion: 1,
    dueAt: "2026-09-13T12:00:00.000Z",
    id: "ntf-1",
    kind: "REMINDER",
    reason: null,
    sentAt: null,
    settledAt: null,
    slot: "FIRST",
    state: "PENDING",
    ...overrides,
  };
}

beforeEach(() => {
  for (const spy of [
    replace,
    cancelAppointment,
    confirmAppointmentPresence,
    getAppointment,
    getAvailability,
    getCalendar,
    listAppointmentEvents,
    listAppointmentNotifications,
    rescheduleAppointment,
  ]) {
    spy.mockReset();
  }
  getCalendar.mockResolvedValue(calendarFixture());
  getAvailability.mockResolvedValue([]);
  listAppointmentEvents.mockResolvedValue([]);
  listAppointmentNotifications.mockResolvedValue([]);
});

describe("Notificar cliente em cancelar", () => {
  function renderCancel() {
    return render(
      <ShellConfigProvider>
        <CancelFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
  }

  test("vem marcado por padrão e com ênfase de alteração relevante", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    renderCancel();

    const checkbox = await screen.findByRole("checkbox", {
      name: /Notificar cliente/,
    });
    expect(checkbox).toBeChecked();
    expect(screen.getByText(/alteração relevante/i)).toBeVisible();
  });

  test("enviado explicitamente marcado, e explicitamente desmarcado quando o usuário desliga", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    cancelAppointment.mockResolvedValue(
      appointmentFixture({ status: "CANCELLED" }),
    );
    renderCancel();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("checkbox", { name: /Notificar cliente/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Revisar cancelamento" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirmar cancelamento" }),
    );

    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledTimes(1));
    expect(cancelAppointment.mock.calls[0][1]).toMatchObject({
      notifyCustomer: false,
    });
  });
});

describe("Notificar cliente em remarcar", () => {
  test("vem marcado por padrão e com ênfase de alteração relevante", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    render(
      <ShellConfigProvider>
        <RescheduleFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: /Notificar cliente/,
    });
    expect(checkbox).toBeChecked();
    expect(screen.getByText(/alteração relevante/i)).toBeVisible();
  });
});

describe("Estado do lembrete e da confirmação no detalhe, a partir da leitura", () => {
  function renderDetail() {
    return render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
  }

  test("lembrete ainda agendado desta ocorrência, e presença não confirmada discretamente", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([notificationFixture()]);
    renderDetail();

    expect(
      await screen.findByText(/^Lembrete · Agendado para /),
    ).toBeVisible();
    expect(screen.getByText("Aguardando confirmação")).toBeVisible();
    expect(listAppointmentNotifications).toHaveBeenCalledWith(
      "apt-1",
      expect.anything(),
    );
  });

  test("lembrete enviado é lido como enviado, com o instante do envio", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([
      notificationFixture({
        sentAt: "2026-09-13T12:00:04.000Z",
        settledAt: "2026-09-13T12:00:04.000Z",
        state: "SENT",
      }),
    ]);
    renderDetail();

    expect(await screen.findByText(/^Lembrete · Enviado em /)).toBeVisible();
  });

  test("não enviado traz o motivo do vocabulário fechado, nunca texto fixo", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([
      notificationFixture({
        reason: "CUSTOMER_WITHOUT_PHONE",
        settledAt: "2026-09-12T12:00:00.000Z",
        state: "DISMISSED",
      }),
    ]);
    renderDetail();

    expect(
      await screen.findByText(
        "Lembrete · Não enviado: o cliente não tem telefone",
      ),
    ).toBeVisible();
  });

  test("as duas posições configuradas viram duas linhas distinguíveis", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([
      notificationFixture({ id: "ntf-1", slot: "FIRST" }),
      notificationFixture({
        dueAt: "2026-09-14T10:00:00.000Z",
        id: "ntf-2",
        slot: "SECOND",
      }),
    ]);
    renderDetail();

    expect(await screen.findByText(/^1º lembrete · /)).toBeVisible();
    expect(screen.getByText(/^2º lembrete · /)).toBeVisible();
  });

  test("lembrete já enviado e aviso de alteração convivem depois da remarcação", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([
      notificationFixture({
        id: "ntf-enviado",
        sentAt: "2026-09-13T12:00:04.000Z",
        settledAt: "2026-09-13T12:00:04.000Z",
        state: "SENT",
      }),
      notificationFixture({
        appointmentVersion: 2,
        dueAt: "2026-09-13T13:00:00.000Z",
        id: "ntf-aviso",
        kind: "CHANGE_NOTICE",
        sentAt: "2026-09-13T13:00:02.000Z",
        settledAt: "2026-09-13T13:00:02.000Z",
        slot: "CHANGE_NOTICE",
        state: "SENT",
      }),
    ]);
    renderDetail();

    expect(await screen.findByText(/^Lembrete · Enviado em /)).toBeVisible();
    expect(screen.getByText("Aviso de alteração")).toBeVisible();
  });

  test("intenção cancelada pela remarcação não vira linha de tela", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([
      notificationFixture({
        reason: "APPOINTMENT_VERSION_SUPERSEDED",
        settledAt: "2026-09-12T18:00:00.000Z",
        state: "CANCELLED",
      }),
    ]);
    renderDetail();

    await screen.findByText("Aguardando confirmação");
    expect(screen.queryByText(/Lembrete/)).not.toBeInTheDocument();
  });

  test("sem nenhuma intenção: nenhum estado de lembrete é afirmado", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([]);
    renderDetail();

    await screen.findByText("Aguardando confirmação");
    expect(screen.queryByText(/Lembrete/)).not.toBeInTheDocument();
  });

  test("presença confirmada é lida do próprio agendamento, não do texto fixo de ausência", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ presenceConfirmedAt: "2026-09-14T09:55:00.000Z" }),
    );
    renderDetail();

    expect(await screen.findByText("Presença confirmada")).toBeVisible();
    expect(screen.queryByText("Aguardando confirmação")).not.toBeInTheDocument();
  });
});

describe("acessibilidade das superfícies novas", () => {
  test("cancelar com o campo de notificação passa no axe", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    const { container } = render(
      <ShellConfigProvider>
        <CancelFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    await screen.findByRole("checkbox", { name: /Notificar cliente/ });
    await expectNoA11yViolations(container);
  });

  test("remarcar com o campo de notificação passa no axe", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    const { container } = render(
      <ShellConfigProvider>
        <RescheduleFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    await screen.findByRole("checkbox", { name: /Notificar cliente/ });
    await expectNoA11yViolations(container);
  });

  test("detalhe com lembrete e confirmação passa no axe", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    listAppointmentNotifications.mockResolvedValue([notificationFixture()]);
    const { container } = render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    await screen.findByText(/^Lembrete · Agendado para /);
    await expectNoA11yViolations(container);
  });
});
