// @vitest-environment jsdom
/**
 * Goal119 (WU-02): o conflito do quadro A7 dentro do formulário de novo
 * agendamento. A recusa de horário (hold ou criação) vira chip âmbar, aviso
 * `role="alert"`, campo "Motivo do encaixe" e rodapé de duas decisões — sem o
 * CTA de criar. Remarcar continua com o `ConflictPanel`.
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
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { chooseManualTime } from "./support/pickers";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const createAppointment =
  vi.fn<
    (
      input: CreateAppointmentInput,
      idempotencyKey: string,
      signal?: AbortSignal,
    ) => Promise<Appointment>
  >();
const createHold =
  vi.fn<
    (
      input: CreateHoldInput,
      idempotencyKey: string,
      signal?: AbortSignal,
    ) => Promise<AppointmentHold>
  >();
const getAppointment = vi.fn();
const getAvailability =
  vi.fn<
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

function holdFixture(
  overrides: Partial<AppointmentHold> = {},
): AppointmentHold {
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
    endTime: "13:00",
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
    startTime: "12:00",
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

/** Formato real do BFF: a recusa do domínio chega embrulhada em `UPSTREAM_ERROR`. */
function upstreamConflictError(): BffHttpError {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { upstreamCode: "SLOT_UNAVAILABLE" },
    message: "Upstream refused the request.",
    requestId: "req-up",
    status: 409,
  });
}

beforeEach(() => {
  replace.mockReset();
  for (const spy of [
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
  getCalendar.mockResolvedValue({
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
  } satisfies CalendarState);
  listServices.mockResolvedValue({
    editable: true,
    items: [
      serviceFixture(),
      serviceFixture({
        durationMinutes: 30,
        id: "svc-escova",
        name: "Escova",
        price: 60,
      }),
    ],
    source: "AVENLY",
  });
  listCustomers.mockResolvedValue({
    items: [customerFixture()],
    managedExternally: false,
    source: "AVENLY",
  });
  getAvailability.mockResolvedValue([
    { date: ISO_TODAY, endTime: "10:00", startTime: "09:00" },
    { date: ISO_TODAY, endTime: "11:00", startTime: "10:00" },
  ]);
  createHold.mockResolvedValue(holdFixture());
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  createAppointment.mockResolvedValue(appointmentFixture());
  listAppointments.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
});

function renderCreate() {
  return render(
    <ShellConfigProvider>
      <AppointmentForm customerId="cus-ana" />
    </ShellConfigProvider>,
  );
}

async function pickService() {
  renderCreate();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("checkbox", { name: /Corte feminino/ }),
  );
  await screen.findByRole("radio", { name: "09:00" });
  return user;
}

/** Recusa do hold num horário digitado em "Outro horário". */
async function openConflictByHold(time = "12:00") {
  createHold.mockRejectedValue(conflictError());
  const user = await pickService();
  await user.click(screen.getByRole("button", { name: "Outro horário" }));
  await chooseManualTime(user, time);
  await user.click(screen.getByRole("button", { name: "Usar este horário" }));
  await screen.findByRole("alert");
  return user;
}

function conflictNotice() {
  return screen.getByRole("alert");
}

async function settledNotice() {
  const override = await screen.findByRole("button", {
    name: "Encaixar mesmo assim",
  });
  await waitFor(() => expect(override).toBeEnabled());
  return conflictNotice();
}

describe("a recusa leva ao conflito do A7", () => {
  test("recusa do hold: chip âmbar, aviso em alert e rodapé de duas decisões, sem CTA de criar", async () => {
    listAppointments.mockResolvedValue([appointmentFixture()]);
    await openConflictByHold("12:00");
    const notice = await settledNotice();

    expect(notice).toHaveTextContent("Esse horário já está ocupado");
    const chip = screen.getByRole("radio", { name: /12:00/ });
    expect(chip).toBeChecked();
    expect(chip.closest(".agenda-new-chip")).toHaveClass("is-conflict");
    expect(screen.getByLabelText("Motivo do encaixe")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Encaixar mesmo assim" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^Criar agendamento/ }),
    ).not.toBeInTheDocument();
    expect(createAppointment).not.toHaveBeenCalled();
  });

  test("recusa de um horário oferecido: o próprio chip da lista fica âmbar", async () => {
    createHold.mockRejectedValue(conflictError());
    const user = await pickService();

    await user.click(screen.getByRole("radio", { name: "10:00" }));
    await settledNotice();

    const chip = screen.getByRole("radio", { name: /10:00/ });
    expect(chip.closest(".agenda-new-chip")).toHaveClass("is-conflict");
    expect(chip).toBeChecked();
    expect(screen.getAllByRole("radio", { name: /10:00/ })).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "09:00" })).not.toBeChecked();
  });

  test("recusa na criação (409 SLOT_UNAVAILABLE) libera a reserva e abre o conflito", async () => {
    createAppointment.mockRejectedValueOnce(conflictError());
    const user = await pickService();
    await user.click(screen.getByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    await user.click(
      await screen.findByRole("button", { name: /^Criar agendamento/ }),
    );

    await settledNotice();
    expect(releaseHold).toHaveBeenCalledWith("hold-1");
    expect(
      screen.queryByRole("button", { name: /^Criar agendamento/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Encaixar mesmo assim" }),
    ).toBeVisible();
  });

  test("a recusa embrulhada em UPSTREAM_ERROR pelo BFF também abre o conflito", async () => {
    createHold.mockRejectedValue(upstreamConflictError());
    const user = await pickService();

    await user.click(screen.getByRole("radio", { name: "09:00" }));
    await settledNotice();
    expect(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    ).toBeVisible();
  });

  test("UPSTREAM_ERROR de outro motivo não vira conflito", async () => {
    createHold.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "SOMETHING_ELSE" },
        message: "Upstream failed.",
        requestId: "req-x",
        status: 502,
      }),
    );
    const user = await pickService();

    await user.click(screen.getByRole("radio", { name: "09:00" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText("Motivo do encaixe"),
    ).not.toBeInTheDocument();
  });
});

describe("textos do aviso por caso", () => {
  test("atendimento sem presença: nome em destaque, serviço, horário e (em confirmação)", async () => {
    listAppointments.mockResolvedValue([appointmentFixture()]);
    await openConflictByHold();
    const notice = await settledNotice();

    expect(notice).toHaveTextContent(
      "Ana Paula tem Corte feminino às 12:00 (em confirmação). Você pode encaixar mesmo assim: os dois vão ficar no mesmo horário na sua agenda.",
    );
    expect(within(notice).getByText("Ana Paula").tagName).toBe("STRONG");
  });

  test("atendimento com presença confirmada", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({ presenceConfirmedAt: `${ISO_TODAY}T10:00:00.000Z` }),
    ]);
    await openConflictByHold();
    const notice = await settledNotice();

    expect(notice).toHaveTextContent(
      "Ana Paula tem Corte feminino às 12:00 (presença confirmada).",
    );
  });

  test("vários itens aparecem em ordem de horário e o fecho fala em todos", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: customerFixture({ id: "cus-dora", name: "Dora Lima" }),
        endTime: "13:00",
        id: "apt-dora",
        startTime: "12:30",
      }),
      appointmentFixture({
        customer: customerFixture({ id: "cus-eva", name: "Eva Reis" }),
        endTime: "12:30",
        id: "apt-eva",
        startTime: "12:00",
      }),
    ]);
    await openConflictByHold();
    const notice = await settledNotice();

    const text = notice.textContent ?? "";
    expect(text.indexOf("Eva Reis")).toBeGreaterThan(-1);
    expect(text.indexOf("Eva Reis")).toBeLessThan(text.indexOf("Dora Lima"));
    expect(notice).toHaveTextContent(
      "todos vão ficar no mesmo horário na sua agenda.",
    );
  });

  test("bloqueio e compromisso pessoal: nome do título, senão do motivo, senão só o tipo", async () => {
    listTimeBlocks.mockResolvedValue([
      timeBlockFixture({ id: "b-1", reason: null, title: "Almoço" }),
      timeBlockFixture({
        endAt: `${ISO_TODAY}T16:00:00.000Z`,
        id: "b-2",
        reason: "Reunião fixa",
        startAt: `${ISO_TODAY}T15:30:00.000Z`,
        title: null,
      }),
      timeBlockFixture({
        endAt: `${ISO_TODAY}T16:00:00.000Z`,
        id: "b-3",
        reason: null,
        startAt: `${ISO_TODAY}T15:45:00.000Z`,
        title: null,
      }),
      timeBlockFixture({
        endAt: `${ISO_TODAY}T16:00:00.000Z`,
        id: "b-4",
        kind: "PERSONAL",
        reason: null,
        startAt: `${ISO_TODAY}T15:50:00.000Z`,
        title: "Dentista",
      }),
      timeBlockFixture({
        endAt: `${ISO_TODAY}T16:00:00.000Z`,
        id: "b-5",
        kind: "PERSONAL",
        reason: null,
        startAt: `${ISO_TODAY}T15:55:00.000Z`,
        title: null,
      }),
    ]);
    await openConflictByHold();
    const notice = await settledNotice();

    expect(notice).toHaveTextContent('Bloqueio "Almoço" das 12:00 às 13:00.');
    expect(notice).toHaveTextContent(
      'Bloqueio "Reunião fixa" das 12:30 às 13:00.',
    );
    expect(notice).toHaveTextContent("Bloqueio das 12:45 às 13:00.");
    expect(notice).toHaveTextContent(
      'Compromisso pessoal "Dentista" das 12:50 às 13:00.',
    );
    expect(notice).toHaveTextContent("Compromisso pessoal das 12:55 às 13:00.");
  });

  test("intervalo entre atendimentos (buffer)", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        bufferAfterMinutes: 30,
        endTime: "12:00",
        startTime: "11:00",
      }),
    ]);
    await openConflictByHold();
    const notice = await settledNotice();

    expect(notice).toHaveTextContent(
      "Intervalo entre atendimentos das 12:00 às 12:30.",
    );
  });

  // Sem as regras do expediente (Configurações não lidas), a tela não afirma
  // "fora do horário de atendimento" (bug de 2026-10-12).
  test("nada ocupa o intervalo e o expediente não foi lido: não inventa motivo", async () => {
    await openConflictByHold();
    const notice = await settledNotice();

    expect(notice).toHaveTextContent(
      "Esse horário não foi liberado pela agenda",
    );
    expect(notice).toHaveTextContent(
      "Nada na sua agenda ocupa 12:00–13:00, mas a agenda não liberou o horário agora.",
    );
    expect(notice).toHaveTextContent("Você pode encaixar mesmo assim.");
    expect(notice).not.toHaveTextContent("fora do seu horário de atendimento");
  });

  test("leitura da ocupação falhou: nunca vira 'nada ocupa'", async () => {
    listAppointments.mockRejectedValue(new Error("offline"));
    await openConflictByHold();
    const notice = await settledNotice();

    expect(notice).toHaveTextContent(
      "Não foi possível ver o que ocupa este horário",
    );
    expect(notice).toHaveTextContent("A agenda recusou o horário.");
    expect(notice).not.toHaveTextContent("Nada na sua agenda ocupa");
    expect(
      screen.getByRole("button", { name: "Encaixar mesmo assim" }),
    ).toBeEnabled();
  });

  test("leitura pendente: aviso consulta e Encaixar fica desabilitado", async () => {
    listAppointments.mockReturnValue(new Promise(() => undefined));
    await openConflictByHold();

    expect(conflictNotice()).toHaveTextContent(
      "Consultando o que ocupa este horário…",
    );
    expect(
      screen.getByRole("button", { name: "Encaixar mesmo assim" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    ).toBeEnabled();
  });
});

describe("encaixar mesmo assim", () => {
  test("sem motivo não envia e mostra a mensagem junto ao campo", async () => {
    const user = await openConflictByHold();
    await settledNotice();

    await user.click(
      screen.getByRole("button", { name: "Encaixar mesmo assim" }),
    );

    const message = await screen.findByText(
      "Descreva o motivo do encaixe. Sem motivo, o agendamento não é enviado.",
    );
    const field = screen.getByLabelText("Motivo do encaixe");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    expect(field).toHaveFocus();
    expect(createAppointment).not.toHaveBeenCalled();
  });

  test("motivo só com espaços também não envia", async () => {
    const user = await openConflictByHold();
    await settledNotice();

    await user.type(screen.getByLabelText("Motivo do encaixe"), "   ");
    await user.click(
      screen.getByRole("button", { name: "Encaixar mesmo assim" }),
    );

    expect(createAppointment).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Descreva o motivo do encaixe/),
    ).toBeVisible();
  });

  test("com motivo envia uma vez, com overlapOverride e o motivo aparado", async () => {
    const user = await openConflictByHold();
    await settledNotice();

    await user.type(
      screen.getByLabelText("Motivo do encaixe"),
      "  Cliente antiga, encaixe combinado  ",
    );
    await user.click(
      screen.getByRole("button", { name: "Encaixar mesmo assim" }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.overlapOverride).toBe(true);
    expect(body.overlapOverrideReason).toBe(
      "Cliente antiga, encaixe combinado",
    );
    expect(body.startTime).toBe("12:00");
    expect(body.date).toBe(ISO_TODAY);
    expect(body.serviceIds).toEqual(["svc-corte"]);
    expect(body.holdId).toBeUndefined();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-1"),
    );
  });

  test("sair do conflito pela troca de data limpa o aviso e volta ao CTA", async () => {
    const user = await openConflictByHold();
    await settledNotice();

    const dateGroup = screen.getByRole("group", { name: "Data" });
    await user.click(
      within(dateGroup).getByRole("button", { name: "Próxima semana" }),
    );
    const otherDay = within(dateGroup)
      .getAllByRole("gridcell")
      .find((cell) => cell.getAttribute("aria-selected") === "false");
    await user.click(otherDay as HTMLElement);

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText("Motivo do encaixe"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(createAppointment).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    ).toBeDisabled();
  });

  test("sair do conflito pela troca de cliente limpa o aviso e volta ao CTA", async () => {
    const user = await openConflictByHold();
    await settledNotice();

    await user.click(screen.getByRole("button", { name: "Trocar" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText("Motivo do encaixe"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(createAppointment).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    ).toBeVisible();
  });

  test("sair do conflito pela troca de serviço limpa o aviso e volta ao CTA", async () => {
    const user = await openConflictByHold();
    await settledNotice();

    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText("Motivo do encaixe"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    ).toBeVisible();
  });
});

describe("escolher outro horário", () => {
  test("não escreve, libera a reserva e leva o foco ao primeiro horário livre", async () => {
    createAppointment.mockRejectedValueOnce(conflictError());
    const user = await pickService();
    await user.click(screen.getByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    await user.click(
      await screen.findByRole("button", { name: /^Criar agendamento/ }),
    );
    await settledNotice();
    releaseHold.mockClear();
    createAppointment.mockClear();

    await user.click(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument(),
    );
    expect(createAppointment).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    ).toBeVisible();
    const first = screen.getAllByRole("radio")[0];
    expect(first).toHaveFocus();
    expect(first).not.toBeChecked();
  });

  test("o chip do horário oferecido volta ao normal e o motivo fica limpo ao reabrir o conflito", async () => {
    createHold.mockRejectedValue(conflictError());
    const user = await pickService();
    await user.click(screen.getByRole("radio", { name: "10:00" }));
    await settledNotice();
    expect(
      screen.getByRole("radio", { name: /10:00/ }).closest(".agenda-new-chip"),
    ).toHaveClass("is-conflict");
    await user.type(
      screen.getByLabelText("Motivo do encaixe"),
      "Encaixe antigo",
    );

    await user.click(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument(),
    );
    const chip = screen.getByRole("radio", { name: "10:00" });
    expect(chip.closest(".agenda-new-chip")).not.toHaveClass("is-conflict");
    expect(chip).not.toBeChecked();
    expect(screen.queryByText(/· ocupado/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "10:00" }));
    await settledNotice();
    expect(screen.getByLabelText("Motivo do encaixe")).toHaveValue("");
  });

  test("o chip extra de 'Outro horário' some depois de escolher outro horário", async () => {
    const user = await openConflictByHold("12:00");
    await settledNotice();
    expect(screen.getByRole("radio", { name: /12:00/ })).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("radio", { name: /12:00/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.getAttribute("name")),
    ).toEqual(["start-time", "start-time"]);
    expect(
      screen
        .getAllByRole("radio")
        .some((radio) =>
          radio.closest(".agenda-new-chip")?.classList.contains("is-conflict"),
        ),
    ).toBe(false);
  });

  test("sem horários livres, o foco vai para a legenda Horário", async () => {
    getAvailability.mockResolvedValue([]);
    createHold.mockRejectedValue(conflictError());
    renderCreate();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: /Corte feminino/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Outro horário" }),
    );
    await chooseManualTime(user, "12:00");
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));
    await settledNotice();

    await user.click(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    );

    await waitFor(() => expect(document.activeElement?.tagName).toBe("LEGEND"));
    expect(document.activeElement).toHaveTextContent("Horário");
    expect(createAppointment).not.toHaveBeenCalled();
  });
});

describe("remarcar não muda", () => {
  test("RescheduleFlow continua com o ConflictPanel e seus textos", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ endTime: "10:00", startTime: "09:00" }),
    );
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
    render(
      <ShellConfigProvider>
        <RescheduleFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    const user = userEvent.setup();

    await screen.findByRole("radio", { name: "10:00" });
    await user.click(screen.getByRole("button", { name: "Outro horário" }));
    await user.type(
      screen.getByLabelText("Outro horário, fora dos oferecidos"),
      "14:00",
    );
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));

    expect(
      await screen.findByRole("region", {
        name: "O intervalo 14:00–15:00 não está livre nesta agenda",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sobrepor mesmo assim" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Motivo da sobreposição")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Motivo do encaixe"),
    ).not.toBeInTheDocument();
  });
});
