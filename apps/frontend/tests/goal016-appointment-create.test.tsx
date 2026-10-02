// @vitest-environment jsdom
/**
 * Goal016 (WU-05): provas renderizadas da criação, remarcação e cancelamento.
 *
 * O que estes testes precisam garantir, porque é exatamente o que o review015
 * bloqueou duas rodadas seguidas e o que o Goal008 fechou no domínio:
 * identidade por `customerId` — telefone não identifica ninguém —, cliente sem
 * telefone agendável, cliente novo criado na confirmação, múltiplos serviços
 * com duração somada e disponibilidade consultada para o conjunto, nenhum
 * valor fechado quando algum serviço é `ON_REQUEST`/`NOT_INFORMED`, o ciclo
 * inteiro do hold (criar, consumir, liberar ao trocar, liberar ao abandonar,
 * expirar com mensagem própria) e sobreposição impossível sem motivo.
 *
 * As afirmações são sobre a requisição emitida e sobre o que a tela mostra —
 * nunca sobre classe CSS.
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
  type CreateAppointmentInput,
  type CreateHoldInput,
  type Customer,
  type Service,
  type TimeBlock,
} from "@/data";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { CancelFlow } from "@/features/agenda/CancelFlow";
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const cancelAppointment = vi.fn();
const createAppointment = vi.fn<
  (
    input: CreateAppointmentInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) => Promise<Appointment>
>();
const createHold = vi.fn<
  (
    input: CreateHoldInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) => Promise<AppointmentHold>
>();
const getAppointment = vi.fn();
const getAvailability = vi.fn<
  (
    query: AvailabilityQuery,
    signal?: AbortSignal,
  ) => Promise<AvailabilitySlot[]>
>();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listTimeBlocks = vi.fn();
const releaseHold = vi.fn();
const rescheduleAppointment = vi.fn();
const listCustomers = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      cancelAppointment,
      createAppointment,
      createHold,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointments,
      listTimeBlocks,
      releaseHold,
      rescheduleAppointment,
    },
    customers: { list: listCustomers },
    serviceCatalog: { list: listServices },
  }),
}));

const today = new Date();
const ISO_TODAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

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

function holdFixture(overrides: Partial<AppointmentHold> = {}): AppointmentHold {
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
    customer: customerFixture(),
    customerId: "cus-ana",
    date: ISO_TODAY,
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

function timeBlockFixture(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    // 15:00–16:00 UTC == 12:00–13:00 em America/Sao_Paulo (UTC-3, sem DST).
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

function conflictError(): BffHttpError {
  return new BffHttpError({
    code: "SLOT_UNAVAILABLE",
    message: "Slot is unavailable for the service duration.",
    requestId: "req-1",
    status: 409,
  });
}

function holdExpiredError(slotStillAvailable?: boolean): BffHttpError {
  return new BffHttpError({
    code: "APPOINTMENT_HOLD_EXPIRED",
    details:
      slotStillAvailable === undefined ? undefined : { slotStillAvailable },
    message: "Hold is no longer valid.",
    requestId: "req-2",
    status: 409,
  });
}

beforeEach(() => {
  replace.mockReset();
  for (const spy of [
    cancelAppointment,
    createAppointment,
    createHold,
    getAppointment,
    getAvailability,
    getCalendar,
    listAppointments,
    listTimeBlocks,
    releaseHold,
    rescheduleAppointment,
    listCustomers,
    listServices,
  ]) {
    spy.mockReset();
  }
  getCalendar.mockResolvedValue(calendarFixture());
  listServices.mockResolvedValue({
    editable: true,
    items: [
      serviceFixture(),
      serviceFixture({
        durationMinutes: 30,
        id: "svc-escova",
        name: "Escova",
        price: 60,
        priceType: "FIXED",
      }),
    ],
    source: "ATENDLY",
  });
  listCustomers.mockResolvedValue({
    items: [customerFixture()],
    managedExternally: false,
    source: "ATENDLY",
  });
  getAvailability.mockResolvedValue([
    { date: ISO_TODAY, endTime: "10:00", startTime: "09:00" },
    { date: ISO_TODAY, endTime: "11:00", startTime: "10:00" },
  ]);
  createHold.mockResolvedValue(holdFixture());
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  createAppointment.mockResolvedValue(appointmentFixture());
  rescheduleAppointment.mockResolvedValue(appointmentFixture());
  cancelAppointment.mockResolvedValue(
    appointmentFixture({ status: "CANCELLED" }),
  );
  listAppointments.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
});

/** O separador da soma é só para leitor de tela: compara o texto do bloco inteiro (A6, D-111). */
function totalText(expected: string | RegExp) {
  return (_content: string, element: Element | null) => {
    if (!element?.classList.contains("agenda-new-total")) return false;
    const text = (element.textContent ?? "").replace(/\s+/g, " ");
    return typeof expected === "string"
      ? text === expected
      : expected.test(text);
  };
}

function renderCreate() {
  return render(
    <ShellConfigProvider>
      <AppointmentForm />
    </ShellConfigProvider>,
  );
}

async function pickService(name: string | RegExp) {
  renderCreate();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox", { name }));
  return user;
}

describe("identidade por customerId", () => {
  test("cliente já cadastrado vai por ID: nem o hold nem a criação mandam telefone", async () => {
    const user = await pickService(/Corte feminino/);
    await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));

    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect(createHold.mock.calls[0][0]).toEqual({
      customerId: "cus-ana",
      date: ISO_TODAY,
      serviceIds: ["svc-corte"],
      startTime: "09:00",
    });

    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.customerId).toBe("cus-ana");
    expect(body.customerName).toBeUndefined();
    expect(body.customerPhone).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-1");
  });

  test("cliente cadastrado sem telefone nenhum continua agendável", async () => {
    listCustomers.mockResolvedValue({
      items: [customerFixture({ id: "cus-sem-fone", name: "Bia", phone: null })],
      managedExternally: false,
      source: "ATENDLY",
    });

    const user = await pickService(/Corte feminino/);
    await user.click(await screen.findByRole("button", { name: /Bia/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());

    const submit = screen.getByRole("button", { name: /^Criar agendamento/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0].customerId).toBe("cus-sem-fone");
    expect(createAppointment.mock.calls[0][0].customerPhone).toBeUndefined();
  });

  test("cliente novo é criado na confirmação, por nome e telefone", async () => {
    const user = await pickService(/Corte feminino/);
    await user.type(screen.getByLabelText("Nome do cliente"), "Carla Nunes");
    await user.type(
      screen.getByLabelText("Telefone (opcional)"),
      "+5511988887777",
    );

    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    // Cliente novo ainda não tem ID: o hold não inventa um.
    expect(createHold.mock.calls[0][0].customerId).toBeUndefined();

    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.customerId).toBeUndefined();
    expect(body.customerName).toBe("Carla Nunes");
    expect(body.customerPhone).toBe("+5511988887777");
  });
});

describe("múltiplos serviços e o total do acordo", () => {
  test("dois serviços somam a duração e a disponibilidade é consultada para o conjunto", async () => {
    const user = await pickService(/Corte feminino/);
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));

    expect(
      await screen.findByText(totalText("2 serviços · 1 h 30 · R$ 150,00")),
    ).toBeVisible();
    await waitFor(() => {
      const last = getAvailability.mock.calls.at(-1);
      expect(last?.[0].serviceIds).toEqual(["svc-corte", "svc-escova"]);
    });
  });

  test("com serviço sem preço informado nenhum valor fechado é exibido", async () => {
    listServices.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture(),
        serviceFixture({
          durationMinutes: 45,
          id: "svc-quimica",
          name: "Química",
          price: null,
          priceType: "NOT_INFORMED",
        }),
      ],
      source: "ATENDLY",
    });

    const user = await pickService(/Corte feminino/);
    expect(
      await screen.findByText(totalText("1 serviço · 1 h · R$ 90,00")),
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: /Química/ }));

    const total = await screen.findByText(totalText(/^2 serviços · 1 h 45/));
    expect(total).toHaveTextContent("Sob consulta");
    expect(total).not.toHaveTextContent(/R\$/);
  });
});

describe("ciclo de vida do hold", () => {
  test("trocar de horário libera a reserva anterior antes de pedir a nova", async () => {
    createHold
      .mockResolvedValueOnce(holdFixture())
      .mockResolvedValueOnce(
        holdFixture({ endTime: "11:00", id: "hold-2", startTime: "10:00" }),
      );

    const user = await pickService(/Corte feminino/);
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("radio", { name: "10:00" }));

    await waitFor(() => expect(releaseHold).toHaveBeenCalledWith("hold-1"));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(2));
    expect(createHold.mock.calls[1][0].startTime).toBe("10:00");
  });

  test("abandonar o fluxo libera a reserva", async () => {
    const { unmount } = renderCreate();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /Corte/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));

    unmount();

    await waitFor(() => expect(releaseHold).toHaveBeenCalledWith("hold-1"));
  });

  test("reserva vencida na própria tela pede um novo horário e trava o envio", async () => {
    createHold.mockResolvedValue(
      holdFixture({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    );

    const user = await pickService(/Corte feminino/);
    await user.click(await screen.findByRole("radio", { name: "09:00" }));

    expect(
      await screen.findByText(
        /A reserva deste horário venceu\. O horário não está mais garantido/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    ).toBeDisabled();
    expect(createAppointment).not.toHaveBeenCalled();
  });

  test("reserva recusada na confirmação tem mensagem própria e obriga a reescolher", async () => {
    createAppointment.mockRejectedValueOnce(holdExpiredError(true));

    const user = await pickService(/Corte feminino/);
    await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());

    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /A reserva deste horário venceu antes da confirmação\. Nada foi agendado/,
    );
    expect(alert).toHaveTextContent(/continuava livre nesta verificação/);
    expect(screen.getByRole("radio", { name: "09:00" })).not.toBeChecked();
    expect(replace).not.toHaveBeenCalled();
  });

  test("a confirmação consome a reserva: holdId vai no corpo", async () => {
    const user = await pickService(/Corte feminino/);
    await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());

    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalled());
    expect(createAppointment.mock.calls[0][0].holdId).toBe("hold-1");
    expect(createAppointment.mock.calls[0][1]).toEqual(expect.any(String));
  });
});

describe("conflito e sobreposição por decisão humana", () => {
  async function openConflict() {
    createHold.mockRejectedValue(conflictError());
    listAppointments.mockResolvedValue([
      appointmentFixture({
        endTime: "13:00",
        id: "apt-ocupa",
        startTime: "12:00",
      }),
    ]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture()]);

    const user = await pickService(/Corte feminino/);
    await screen.findByRole("radio", { name: "09:00" });
    await user.click(screen.getByRole("button", { name: "Outro horário" }));
    const manual = screen.getByLabelText("Outro horário, fora dos oferecidos");
    await user.clear(manual);
    await user.type(manual, "12:00");
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));
    return user;
  }

  test("o conflito mostra o que ocupa o intervalo", async () => {
    await openConflict();

    const panel = await screen.findByRole("region", {
      name: "O intervalo 12:00–13:00 não está livre nesta agenda",
    });
    expect(within(panel).getByText("Ana Paula")).toBeVisible();
    expect(within(panel).getByText("Atendimento")).toBeVisible();
    expect(within(panel).getByText("Almoço")).toBeVisible();
    expect(within(panel).getByText("Bloqueio")).toBeVisible();
    // Atendimento e bloqueio cobrem o mesmo intervalo: os dois são mostrados.
    expect(within(panel).getAllByText("12:00–13:00")).toHaveLength(2);
  });

  test("sobrepor sem motivo não envia; com motivo, overlapOverride vai no corpo", async () => {
    const user = await openConflict();
    await screen.findByText(
      "O intervalo 12:00–13:00 não está livre nesta agenda",
    );

    await user.click(screen.getByRole("button", { name: "Sobrepor mesmo assim" }));

    expect(
      await screen.findByText(
        "Descreva o motivo da sobreposição. Sem motivo, o agendamento não é enviado.",
      ),
    ).toBeVisible();
    expect(createAppointment).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Motivo da sobreposição"),
      "Cliente antigo, encaixe combinado",
    );
    await user.click(screen.getByRole("button", { name: "Sobrepor mesmo assim" }));

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.overlapOverride).toBe(true);
    expect(body.overlapOverrideReason).toBe("Cliente antigo, encaixe combinado");
    expect(body.startTime).toBe("12:00");
    // Conflito não gerou reserva: não há `holdId` a consumir.
    expect(body.holdId).toBeUndefined();
  });

  test("escolher outro horário sai do conflito sem enviar nada", async () => {
    const user = await openConflict();
    await screen.findByText(
      "O intervalo 12:00–13:00 não está livre nesta agenda",
    );

    await user.click(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText(
          "O intervalo 12:00–13:00 não está livre nesta agenda",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(createAppointment).not.toHaveBeenCalled();
  });
});

describe("remarcar", () => {
  beforeEach(() => {
    getAppointment.mockResolvedValue(appointmentFixture());
  });

  function renderReschedule() {
    return render(
      <ShellConfigProvider>
        <RescheduleFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
  }

  test("o novo horário é reservado e a remarcação consome a reserva", async () => {
    createHold.mockResolvedValue(
      holdFixture({ endTime: "11:00", id: "hold-r", startTime: "10:00" }),
    );
    renderReschedule();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "10:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect(createHold.mock.calls[0][0]).toEqual({
      customerId: "cus-ana",
      date: ISO_TODAY,
      serviceIds: ["svc-corte"],
      startTime: "10:00",
    });

    // A9: um único "Confirmar novo horário", sem etapa de revisão.
    expect(
      screen.queryByRole("button", { name: "Revisar alteração" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirmar novo horário" }),
    );

    await waitFor(() => expect(rescheduleAppointment).toHaveBeenCalledTimes(1));
    expect(rescheduleAppointment.mock.calls[0][1]).toEqual({
      date: ISO_TODAY,
      holdId: "hold-r",
      // "Avisar a cliente pelo WhatsApp" vem marcado por padrão e é sempre
      // enviado explicitamente (Goal021), nunca omitido.
      notifyCustomer: true,
      overlapOverride: undefined,
      overlapOverrideReason: undefined,
      startTime: "10:00",
    });
  });

  test("remarcar sobre horário ocupado exige motivo e manda overlapOverride", async () => {
    createHold.mockRejectedValue(conflictError());
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: customerFixture({ id: "cus-outra", name: "Dora" }),
        customerId: "cus-outra",
        endTime: "15:00",
        id: "apt-outra",
        startTime: "14:00",
      }),
    ]);
    renderReschedule();
    const user = userEvent.setup();

    await screen.findByRole("radio", { name: "10:00" });
    // "Outro horário" abre o campo manual (A9).
    await user.click(screen.getByRole("button", { name: "Outro horário" }));
    const manual = screen.getByLabelText("Outro horário, fora dos oferecidos");
    await user.type(manual, "14:00");
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));

    expect(await screen.findByText("Dora")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sobrepor mesmo assim" }));
    expect(rescheduleAppointment).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Motivo da sobreposição"),
      "Retorno urgente",
    );
    await user.click(screen.getByRole("button", { name: "Sobrepor mesmo assim" }));

    await waitFor(() => expect(rescheduleAppointment).toHaveBeenCalledTimes(1));
    expect(rescheduleAppointment.mock.calls[0][1]).toMatchObject({
      overlapOverride: true,
      overlapOverrideReason: "Retorno urgente",
      startTime: "14:00",
    });
  });
});

describe("cancelar", () => {
  test("a sheet é a confirmação: explica o efeito e cancela em um toque", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    render(
      <ShellConfigProvider>
        <CancelFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    const user = userEvent.setup();

    // A8: a sheet já abre como confirmação, sem "Revisar cancelamento".
    const dialog = await screen.findByRole("dialog");
    expect(
      screen.queryByRole("button", { name: "Revisar cancelamento" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Cancelar este agendamento?"),
    ).toBeVisible();
    expect(cancelAppointment).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Cancelar agendamento" }),
    );

    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledTimes(1));
    expect(cancelAppointment.mock.calls[0][0]).toBe("apt-1");
    // "Avisar a cliente pelo WhatsApp" vem marcado por padrão e é sempre
    // enviado explicitamente (Goal021), nunca omitido.
    expect(cancelAppointment.mock.calls[0][1]).toEqual({
      comments: undefined,
      notifyCustomer: true,
    });
    expect(replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-1");
  });
});

describe("acessibilidade das superfícies desta unidade", () => {
  test("o formulário de criação e o painel de conflito passam no axe", async () => {
    const { container } = renderCreate();
    await screen.findByRole("checkbox", { name: /Corte feminino/ });
    await expectNoA11yViolations(container);

    createHold.mockRejectedValue(conflictError());
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await screen.findByRole("radio", { name: "09:00" });
    await user.click(screen.getByRole("button", { name: "Outro horário" }));
    await user.type(
      screen.getByLabelText("Outro horário, fora dos oferecidos"),
      "12:00",
    );
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));
    await screen.findByRole("button", { name: "Sobrepor mesmo assim" });

    await expectNoA11yViolations(container);
  });
});
