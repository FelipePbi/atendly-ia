// @vitest-environment jsdom
/**
 * Goal120 (WU-01): as recusas do Scheduling chegam às telas da Agenda como o
 * BFF as entrega — embrulhadas em `UPSTREAM_ERROR`, com o código original em
 * `details.upstreamCode` e o detalhe original em `details.upstreamDetails`.
 * Todo erro montado aqui tem esse envelope; o formato cru só aparece nos
 * testes do leitor, onde os dois formatos valem.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import {
  type Appointment,
  type AppointmentHold,
  type AvailabilitySlot,
  BffHttpClient,
  BffHttpError,
  type BlockSeries,
  type CalendarState,
  type Customer,
  type RescheduleAppointmentInput,
  type Service,
  type TimeBlock,
} from "@/data";
import {
  schedulingRefusalCode,
  schedulingRefusalDetails,
} from "@/data/http/schedulingRefusal";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { BlockForm } from "@/features/agenda/BlockForm";
import { BlockSeriesForm } from "@/features/agenda/BlockSeriesForm";
import { HOLD_LOST_MESSAGE } from "@/features/agenda/holdSession";
import { OccurrenceActions } from "@/features/agenda/OccurrenceActions";
import {
  RepeatReviewSheet,
  seriesFailure,
} from "@/features/agenda/RepeatReview";
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const confirmAppointmentSeries = vi.fn();
const createAppointment = vi.fn();
const createBlockSeries = vi.fn();
const createHold = vi.fn();
const createUnavailability = vi.fn();
const editBlockSeriesFromDate = vi.fn();
const getAppointment = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listCustomers = vi.fn();
const listServices = vi.fn();
const listTimeBlocks = vi.fn();
const releaseHold = vi.fn();
const rescheduleAppointment =
  vi.fn<
    (
      id: string,
      input: RescheduleAppointmentInput,
      idempotencyKey: string,
    ) => Promise<Appointment>
  >();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      confirmAppointmentSeries,
      createAppointment,
      createBlockSeries,
      createHold,
      createUnavailability,
      editBlockSeriesFromDate,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
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

const ENGLISH_SCHEDULING_MESSAGE =
  "The unavailability covers a confirmed appointment; a decision reason is required.";

/** O corpo que o BFF devolve para uma recusa do Scheduling, já como `BffHttpError`. */
function upstreamRefusal(
  upstreamCode: string,
  upstreamDetails?: unknown,
  status = 409,
): BffHttpError {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: {
      upstream: "scheduling",
      upstreamCode,
      upstreamRequestId: "up-req-1",
      ...(upstreamDetails === undefined ? {} : { upstreamDetails }),
    },
    message: ENGLISH_SCHEDULING_MESSAGE,
    requestId: "req-bff-1",
    status,
  });
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
    endAt: "2026-09-21T16:00:00.000Z",
    id: "block-1",
    kind: "BLOCK",
    reason: null,
    seriesId: null,
    startAt: "2026-09-21T15:00:00.000Z",
    title: null,
    ...overrides,
  };
}

function blockSeriesFixture(overrides: Partial<BlockSeries> = {}): BlockSeries {
  return {
    daysOfWeek: [1, 3],
    endTime: "10:00",
    id: "series-1",
    kind: "BLOCK",
    occurrenceCount: null,
    seriesEndDate: "2026-10-31",
    seriesStartDate: "2026-09-21",
    startTime: "09:00",
    status: "ACTIVE",
    supersededById: null,
    title: "Manutenção",
    ...overrides,
  };
}

beforeEach(() => {
  replace.mockReset();
  for (const spy of [
    confirmAppointmentSeries,
    createAppointment,
    createBlockSeries,
    createHold,
    createUnavailability,
    editBlockSeriesFromDate,
    getAppointment,
    getAvailability,
    getCalendar,
    listAppointments,
    listAvailabilityExceptions,
    listCustomers,
    listServices,
    listTimeBlocks,
    releaseHold,
    rescheduleAppointment,
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
    items: [serviceFixture()],
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
  ] satisfies AvailabilitySlot[]);
  createHold.mockResolvedValue(holdFixture());
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  createAppointment.mockResolvedValue(appointmentFixture());
  listAppointments.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
});

function withShell(node: ReactElement) {
  return render(<ShellConfigProvider>{node}</ShellConfigProvider>);
}

describe("o leitor da recusa do Scheduling", () => {
  test("no embrulho UPSTREAM_ERROR devolve upstreamCode e upstreamDetails", () => {
    const caught = upstreamRefusal("SLOT_UNAVAILABLE", {
      slotStillAvailable: false,
    });

    expect(schedulingRefusalCode(caught)).toBe("SLOT_UNAVAILABLE");
    expect(schedulingRefusalDetails(caught)).toEqual({
      slotStillAvailable: false,
    });
  });

  test("no formato cru devolve code e details", () => {
    const caught = new BffHttpError({
      code: "APPOINTMENT_HOLD_EXPIRED",
      details: { slotStillAvailable: true },
      message: "Hold is no longer valid.",
      requestId: "req-1",
      status: 409,
    });

    expect(schedulingRefusalCode(caught)).toBe("APPOINTMENT_HOLD_EXPIRED");
    expect(schedulingRefusalDetails(caught)).toEqual({
      slotStillAvailable: true,
    });
  });

  test("upstreamCode ausente ou que não é texto deixa o código do próprio BFF", () => {
    for (const details of [
      { upstream: "scheduling" },
      { upstream: "scheduling", upstreamCode: 409 },
      { upstream: "scheduling", upstreamCode: null },
      undefined,
    ]) {
      const caught = new BffHttpError({
        code: "UPSTREAM_ERROR",
        details,
        message: "Upstream failed.",
        requestId: "req-2",
        status: 502,
      });
      expect(schedulingRefusalCode(caught)).toBe("UPSTREAM_ERROR");
    }
  });

  test("o que não é BffHttpError não tem código e tem detalhe vazio", () => {
    for (const caught of [
      new Error("offline"),
      { code: "SLOT_UNAVAILABLE", details: { a: 1 } },
      "SLOT_UNAVAILABLE",
      null,
      undefined,
    ]) {
      expect(schedulingRefusalCode(caught)).toBeUndefined();
      expect(schedulingRefusalDetails(caught)).toEqual({});
    }
  });

  test("o detalhe é sempre um objeto: upstreamDetails ausente, nulo, lista ou texto viram {}", () => {
    expect(
      schedulingRefusalDetails(upstreamRefusal("SLOT_UNAVAILABLE")),
    ).toEqual({});
    for (const upstreamDetails of [null, ["x"], "texto", 3]) {
      expect(
        schedulingRefusalDetails(
          upstreamRefusal("SLOT_UNAVAILABLE", upstreamDetails),
        ),
      ).toEqual({});
    }
    const raw = new BffHttpError({
      code: "SLOT_UNAVAILABLE",
      details: null,
      message: "Slot is unavailable.",
      requestId: "req-3",
      status: 409,
    });
    expect(schedulingRefusalDetails(raw)).toEqual({});
  });

  test("o corpo real do BFF com status 409, pelo BffHttpClient, devolve o código e o detalhe", async () => {
    const body = {
      error: {
        code: "UPSTREAM_ERROR",
        details: {
          upstream: "scheduling",
          upstreamCode: "APPOINTMENT_HOLD_EXPIRED",
          upstreamDetails: { slotStillAvailable: true },
          upstreamRequestId: "up-req-9",
        },
        message: "Scheduling service request failed.",
      },
      requestId: "req-bff-9",
    };
    const fetchImplementation = vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
          status: 409,
        }),
    );
    const client = new BffHttpClient({
      baseUrl: "http://localhost:4000",
      fetchImplementation,
    });

    const caught = await client
      .request({
        body: { startTime: "09:00" },
        method: "POST",
        path: "/v1/appointments",
        schema: z.unknown(),
      })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(BffHttpError);
    expect((caught as BffHttpError).code).toBe("UPSTREAM_ERROR");
    expect((caught as BffHttpError).status).toBe(409);
    expect(schedulingRefusalCode(caught)).toBe("APPOINTMENT_HOLD_EXPIRED");
    expect(schedulingRefusalDetails(caught)).toEqual({
      slotStillAvailable: true,
    });
  });
});

function renderCreate() {
  return withShell(<AppointmentForm customerId="cus-ana" />);
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

async function settledCreateNotice() {
  const override = await screen.findByRole("button", {
    name: "Encaixar mesmo assim",
  });
  await waitFor(() => expect(override).toBeEnabled());
  return screen.getByRole("alert");
}

const HOLD_LOST_CASES: Array<{
  details: { slotStillAvailable: boolean } | undefined;
  label: string;
  suffix: string | null;
}> = [
  {
    details: { slotStillAvailable: true },
    label: "true",
    suffix: "O horário continuava livre nesta verificação.",
  },
  {
    details: { slotStillAvailable: false },
    label: "false",
    suffix: "O horário já não estava livre nesta verificação.",
  },
  { details: undefined, label: "ausente", suffix: null },
];

describe("criação: o envelope real chega às telas já aceitas", () => {
  test("a recusa do hold abre o conflito do Goal119", async () => {
    createHold.mockRejectedValue(upstreamRefusal("SLOT_UNAVAILABLE"));
    const user = await pickService();

    await user.click(screen.getByRole("radio", { name: "09:00" }));

    const notice = await settledCreateNotice();
    expect(notice).toHaveTextContent("Esse horário");
    expect(screen.getByLabelText("Motivo do encaixe")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Escolher outro horário" }),
    ).toBeVisible();
    expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();
  });

  test("a recusa da criação libera a reserva e abre o conflito", async () => {
    createAppointment.mockRejectedValueOnce(
      upstreamRefusal("SLOT_UNAVAILABLE"),
    );
    const user = await pickService();
    await user.click(screen.getByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    await user.click(
      await screen.findByRole("button", { name: /^Criar agendamento/ }),
    );

    await settledCreateNotice();
    expect(releaseHold).toHaveBeenCalledWith("hold-1");
    expect(
      screen.queryByRole("button", { name: /^Criar agendamento/ }),
    ).not.toBeInTheDocument();
  });

  test.each(HOLD_LOST_CASES)(
    "a perda do hold na criação volta à escolha do horário e a mensagem segue slotStillAvailable $label",
    async ({ details, suffix }) => {
      createAppointment.mockRejectedValueOnce(
        upstreamRefusal("APPOINTMENT_HOLD_EXPIRED", details),
      );
      const user = await pickService();
      await user.click(screen.getByRole("radio", { name: "09:00" }));
      await waitFor(() => expect(createHold).toHaveBeenCalled());

      await user.click(
        await screen.findByRole("button", { name: /^Criar agendamento/ }),
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(HOLD_LOST_MESSAGE);
      if (suffix) {
        expect(alert).toHaveTextContent(suffix);
      } else {
        expect(alert).not.toHaveTextContent("nesta verificação");
      }
      expect(screen.getByRole("radio", { name: "09:00" })).not.toBeChecked();
      expect(replace).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Encaixar mesmo assim" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();
    },
  );
});

function renderReschedule() {
  getAppointment.mockResolvedValue(
    appointmentFixture({ endTime: "10:00", startTime: "09:00" }),
  );
  listAppointments.mockResolvedValue([
    appointmentFixture({
      customer: customerFixture({ id: "cus-outra", name: "Dora" }),
      customerId: "cus-outra",
      endTime: "11:00",
      id: "apt-outra",
      startTime: "10:00",
    }),
  ]);
  return withShell(<RescheduleFlow appointmentId="apt-1" />);
}

async function findConflictPanel() {
  return screen.findByRole("region", {
    name: /não está livre nesta agenda/,
  });
}

async function overrideButton() {
  const button = await screen.findByRole("button", {
    name: "Sobrepor mesmo assim",
  });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("remarcação: o envelope real abre o ConflictPanel e o motivo manda", () => {
  test("a recusa do hold abre o ConflictPanel; sem motivo nada é enviado, com motivo envia uma vez", async () => {
    createHold.mockRejectedValue(upstreamRefusal("SLOT_UNAVAILABLE"));
    rescheduleAppointment.mockResolvedValue(
      appointmentFixture({ id: "apt-novo" }),
    );
    renderReschedule();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "10:00" }));

    expect(await findConflictPanel()).toBeVisible();
    expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();

    await user.click(await overrideButton());
    expect(
      await screen.findByText(/Descreva o motivo da sobreposição/),
    ).toBeVisible();
    expect(rescheduleAppointment).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Motivo da sobreposição"),
      "  Cliente antiga, combinado por telefone  ",
    );
    await user.click(
      screen.getByRole("button", { name: "Sobrepor mesmo assim" }),
    );

    await waitFor(() => expect(rescheduleAppointment).toHaveBeenCalledTimes(1));
    const [id, input] = rescheduleAppointment.mock.calls[0];
    expect(id).toBe("apt-1");
    expect(input.overlapOverride).toBe(true);
    expect(input.overlapOverrideReason).toBe(
      "Cliente antiga, combinado por telefone",
    );
    expect(input.startTime).toBe("10:00");
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-novo"),
    );
  });

  test("a recusa da remarcação libera a reserva e abre o ConflictPanel; o motivo reenvia uma vez", async () => {
    rescheduleAppointment
      .mockRejectedValueOnce(upstreamRefusal("SLOT_UNAVAILABLE"))
      .mockResolvedValueOnce(appointmentFixture({ id: "apt-novo" }));
    renderReschedule();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "10:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: "Confirmar novo horário" }),
    );

    expect(await findConflictPanel()).toBeVisible();
    expect(releaseHold).toHaveBeenCalledWith("hold-1");
    expect(rescheduleAppointment).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();

    await user.click(await overrideButton());
    expect(rescheduleAppointment).toHaveBeenCalledTimes(1);

    await user.type(
      screen.getByLabelText("Motivo da sobreposição"),
      "  Encaixe combinado  ",
    );
    await user.click(
      screen.getByRole("button", { name: "Sobrepor mesmo assim" }),
    );

    await waitFor(() => expect(rescheduleAppointment).toHaveBeenCalledTimes(2));
    const [, input] = rescheduleAppointment.mock.calls[1];
    expect(input.overlapOverride).toBe(true);
    expect(input.overlapOverrideReason).toBe("Encaixe combinado");
    expect(input.holdId).toBeUndefined();
  });

  test.each(HOLD_LOST_CASES)(
    "a perda do hold na remarcação volta à escolha do horário e a mensagem segue slotStillAvailable $label",
    async ({ details, suffix }) => {
      rescheduleAppointment.mockRejectedValueOnce(
        upstreamRefusal("APPOINTMENT_HOLD_EXPIRED", details),
      );
      renderReschedule();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("radio", { name: "10:00" }));
      await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
      await user.click(
        screen.getByRole("button", { name: "Confirmar novo horário" }),
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(HOLD_LOST_MESSAGE);
      if (suffix) {
        expect(alert).toHaveTextContent(suffix);
      } else {
        expect(alert).not.toHaveTextContent("nesta verificação");
      }
      expect(screen.getByRole("radio", { name: "10:00" })).not.toBeChecked();
      expect(
        screen.queryByRole("button", { name: "Sobrepor mesmo assim" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();
    },
  );
});

describe("exceção do dia: o envelope real abre a decisão com motivo", () => {
  test("indisponibilidade sobre atendimento confirmado só reenvia com decidedReason", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({ endTime: "11:00", startTime: "10:00" }),
    ]);
    createUnavailability
      .mockRejectedValueOnce(
        upstreamRefusal("EXCEPTION_APPOINTMENT_CONFLICT", {
          appointmentId: "apt-1",
        }),
      )
      .mockResolvedValueOnce({
        available: false,
        date: ISO_TODAY,
        decidedBy: null,
        decidedReason: "Fechamento excepcional",
        endTime: null,
        id: "exc-forced",
        reason: null,
        startTime: null,
      });
    const user = userEvent.setup();

    // Desde 2026-10-12 (D-169) o dia fechado nasce em "Bloquear horário".
    window.history.pushState(
      {},
      "",
      `/agenda/bloquear?type=CLOSED&date=${ISO_TODAY}`,
    );
    withShell(<BlockForm />);

    await user.click(
      await screen.findByRole("button", { name: "Confirmar fechamento" }),
    );

    expect(
      await screen.findByText(
        "Este fechamento cobre atendimento já confirmado",
      ),
    ).toBeVisible();
    expect(screen.getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();
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
      "Fechamento excepcional",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar mesmo assim" }),
    );

    await waitFor(() => expect(createUnavailability).toHaveBeenCalledTimes(2));
    expect(createUnavailability).toHaveBeenNthCalledWith(2, {
      date: ISO_TODAY,
      decidedReason: "Fechamento excepcional",
      endTime: undefined,
      reason: undefined,
      startTime: undefined,
    });
  });
});

describe("série de bloqueio: o envelope real abre o SeriesConflictPanel com upstreamDetails.conflicts", () => {
  test("na criação (BlockSeriesForm)", async () => {
    createBlockSeries
      .mockRejectedValueOnce(
        upstreamRefusal("BLOCK_SERIES_APPOINTMENT_CONFLICT", {
          conflicts: [
            { appointmentId: "apt-9", date: "2026-09-28" },
            { appointmentId: "apt-10", date: "2026-10-05" },
          ],
        }),
      )
      .mockResolvedValueOnce(blockSeriesFixture());
    const user = userEvent.setup();

    withShell(<BlockSeriesForm />);
    await screen.findByRole("heading", { name: "Criar série de bloqueio" });
    await user.click(screen.getByRole("checkbox", { name: "Seg" }));
    await user.click(screen.getByRole("button", { name: "Criar série" }));

    expect(
      await screen.findByText(
        "2 ocorrência(s) cobrem um atendimento confirmado",
      ),
    ).toBeVisible();
    expect(screen.getByText("28 de setembro de 2026")).toBeVisible();
    expect(screen.getByText("5 de outubro de 2026")).toBeVisible();
    expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Forçar sobreposição" }),
    );
    expect(
      await screen.findByText("Informe o motivo da sobreposição."),
    ).toBeVisible();
    expect(createBlockSeries).toHaveBeenCalledTimes(1);
  });

  test("na edição (OccurrenceActions)", async () => {
    editBlockSeriesFromDate.mockRejectedValueOnce(
      upstreamRefusal("BLOCK_SERIES_APPOINTMENT_CONFLICT", {
        conflicts: [{ appointmentId: "apt-9", date: "2026-09-28" }],
      }),
    );
    const user = userEvent.setup();

    render(
      <OccurrenceActions
        block={timeBlockFixture({ seriesId: "series-1" })}
        timezone="America/Sao_Paulo"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Editar a série a partir daqui" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar a partir daqui" }),
    );

    expect(
      await screen.findByText(
        "1 ocorrência(s) cobrem um atendimento confirmado",
      ),
    ).toBeVisible();
    expect(screen.getByText("28 de setembro de 2026")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Pular estas ocorrências" }),
    ).toBeVisible();
    expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();
  });
});

describe("confirmação da série: o código do embrulho dá a mensagem certa", () => {
  test("hold vencido, com a ocorrência que falhou", () => {
    const failure = seriesFailure(
      upstreamRefusal("APPOINTMENT_HOLD_EXPIRED", {
        occurrenceDate: "2026-09-28",
        occurrenceIndex: 1,
      }),
    );

    expect(failure.message).toBe(
      "A reserva do 2º atendimento (28 de setembro de 2026) venceu antes da confirmação. Nada foi agendado: revise os agendamentos de novo.",
    );
    expect(failure.alternatives).toEqual([]);
  });

  test("horário tomado, com as alternativas do detalhe", () => {
    const failure = seriesFailure(
      upstreamRefusal("SLOT_UNAVAILABLE", {
        alternatives: [
          { date: "2026-09-29", endTime: "10:00", startTime: "09:00" },
        ],
        occurrenceDate: "2026-09-28",
        occurrenceIndex: 1,
      }),
    );

    expect(failure.message).toBe(
      "O horário do 2º atendimento (28 de setembro de 2026) foi tomado depois da revisão. Nada foi agendado: revise os agendamentos de novo.",
    );
    expect(failure.alternatives).toEqual([
      { date: "2026-09-29", endTime: "10:00", startTime: "09:00" },
    ]);
  });

  test("limite da série, com o cap do detalhe e sem ele", () => {
    expect(
      seriesFailure(upstreamRefusal("APPOINTMENT_SERIES_TOO_LONG", { cap: 12 }))
        .message,
    ).toBe(
      "Esta agenda aceita no máximo 12 atendimentos repetidos de uma vez. Nada foi agendado.",
    );
    expect(
      seriesFailure(upstreamRefusal("APPOINTMENT_SERIES_TOO_LONG")).message,
    ).toBe("A repetição passou do limite desta agenda. Nada foi agendado.");
  });

  test("a tela mostra a mensagem e as alternativas, nunca o texto em inglês do Scheduling", async () => {
    confirmAppointmentSeries.mockRejectedValueOnce(
      upstreamRefusal("SLOT_UNAVAILABLE", {
        alternatives: [
          { date: "2026-09-29", endTime: "10:00", startTime: "09:00" },
        ],
        occurrenceDate: "2026-09-28",
        occurrenceIndex: 1,
      }),
    );
    const user = userEvent.setup();

    // A revisão da repetição no novo agendamento (D-171) substituiu a
    // confirmação da tela de série.
    render(
      <RepeatReviewSheet
        customer={{ customerId: "cus-ana" }}
        customerLabel="Ana Paula"
        intervalDays={7}
        occurrences={[
          {
            adjusted: false,
            date: "2026-09-21",
            endTime: "10:00",
            holdId: "hold-1",
            index: 0,
            requestedDate: "2026-09-21",
            startTime: "09:00",
            unavailable: false,
          },
          {
            adjusted: false,
            date: "2026-09-28",
            endTime: "10:00",
            holdId: "hold-2",
            index: 1,
            requestedDate: "2026-09-28",
            startTime: "09:00",
            unavailable: false,
          },
        ]}
        onBack={vi.fn()}
        onConfirmed={vi.fn()}
        onRetry={vi.fn()}
        serviceIds={["svc-corte"]}
        serviceLabel="Corte feminino"
        unitPrice={null}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar 2 agendamentos" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "O horário do 2º atendimento (28 de setembro de 2026) foi tomado depois da revisão.",
    );
    expect(
      within(alert.parentElement as HTMLElement).getByText(
        /29 de setembro de 2026 às 09:00/,
      ),
    ).toBeVisible();
    expect(screen.queryByText(ENGLISH_SCHEDULING_MESSAGE)).toBeNull();
  });
});
