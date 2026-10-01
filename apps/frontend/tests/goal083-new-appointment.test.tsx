// @vitest-environment jsdom
/**
 * Goal083 (WU-02): a tela Novo agendamento conforme o protótipo A6.
 *
 * Seis provas, todas sobre o que a pessoa encontra e sobre a requisição que
 * sai — nunca sobre classe CSS, exceto a prova 6, que existe justamente para
 * garantir que nenhum campo de texto chegue à tela sem a classe do design
 * system (R-11: o navegador desenhava borda `inset` e raio 0).
 *
 *  1. cliente cadastrado, dois serviços, um clique;
 *  2. cliente novo pelo mesmo campo;
 *  3. `customerId` vindo de `/clientes` chega escolhido e é trocável;
 *  4. "Outro, sem cadastro": sem serviço, sem hold, CTA travado se incompleto;
 *  5. conflito abre o ConflictPanel e sobrepor exige motivo;
 *  6. nenhum texto de bastidor e nenhum campo sem classe.
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
} from "@/data";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

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
const listCustomers = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      createAppointment,
      createHold,
      getAvailability,
      getCalendar,
      listAppointments,
      listTimeBlocks,
      releaseHold,
    },
    customers: { list: listCustomers },
    serviceCatalog: { list: listServices },
  }),
}));

const today = new Date();
const ISO_TODAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

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
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
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
    durationMinutes: 90,
    endTime: "10:30",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    id: "hold-1",
    serviceIds: ["svc-corte", "svc-escova"],
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
    services: [],
    source: "USER",
    startTime: "09:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
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

beforeEach(() => {
  replace.mockReset();
  for (const spy of [
    createAppointment,
    createHold,
    getAvailability,
    getCalendar,
    listAppointments,
    listTimeBlocks,
    releaseHold,
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
      }),
    ],
    source: "ATENDLY",
  });
  listCustomers.mockResolvedValue({
    items: [
      customerFixture(),
      customerFixture({ id: "cus-bia", name: "Bia Castro", phone: null }),
    ],
    managedExternally: false,
    source: "ATENDLY",
  });
  getAvailability.mockResolvedValue([
    { date: ISO_TODAY, endTime: "10:30", startTime: "09:00" },
    { date: ISO_TODAY, endTime: "11:30", startTime: "10:00" },
  ]);
  createHold.mockResolvedValue(holdFixture());
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  createAppointment.mockResolvedValue(appointmentFixture());
  listAppointments.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
});

function renderForm(customerId?: string) {
  return render(
    <ShellConfigProvider>
      <AppointmentForm customerId={customerId} />
    </ShellConfigProvider>,
  );
}

function createButton() {
  return screen.getByRole("button", { name: /^Criar agendamento/ });
}

describe("prova 1 — cliente cadastrado, dois serviços, um clique", () => {
  test("a soma aparece como no A6 e o CTA cria com um clique só", async () => {
    renderForm();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Nome do cliente"), "Ana");
    await user.click(screen.getByRole("button", { name: /Ana Paula/ }));
    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));

    expect(
      await screen.findByText("2 serviços · 1 h 30 · R$ 150,00"),
    ).toBeVisible();

    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect(createHold.mock.calls[0][0]).toEqual({
      customerId: "cus-ana",
      date: ISO_TODAY,
      serviceIds: ["svc-corte", "svc-escova"],
      startTime: "09:00",
    });

    const cta = createButton();
    expect(cta).toHaveAccessibleName(
      new RegExp(`^Criar agendamento · \\S+ ${today.getDate()}, 09:00$`),
    );
    expect(cta).toBeEnabled();
    expect(createAppointment).not.toHaveBeenCalled();

    await user.click(cta);

    // Um clique cria: nenhum diálogo de confirmação no meio do caminho.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.customerId).toBe("cus-ana");
    expect(body.customerName).toBeUndefined();
    expect(body.holdId).toBe("hold-1");
    expect(body.serviceIds).toEqual(["svc-corte", "svc-escova"]);
    expect(body.startTime).toBe("09:00");
    expect(replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-1");
  });
});

describe("prova 2 — cliente novo pelo mesmo campo", () => {
  test("cria com customerName e customerPhone, sem customerId", async () => {
    renderForm();
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText("Nome do cliente"),
      "Carla Nunes",
    );
    await user.type(
      screen.getByLabelText("Telefone (opcional)"),
      "+5511988887777",
    );
    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    // Cliente novo ainda não tem ID: o hold não inventa um.
    expect(createHold.mock.calls[0][0].customerId).toBeUndefined();

    await user.click(createButton());

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.customerId).toBeUndefined();
    expect(body.customerName).toBe("Carla Nunes");
    expect(body.customerPhone).toBe("+5511988887777");
  });

  test("sem telefone digitado, customerPhone não vai", async () => {
    renderForm();
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText("Nome do cliente"),
      "Carla Nunes",
    );
    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    await user.click(createButton());

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0].customerPhone).toBeUndefined();
  });
});

describe("prova 3 — customerId vindo de /clientes", () => {
  test("chega escolhido e pode ser trocado", async () => {
    renderForm("cus-ana");
    const user = userEvent.setup();

    const swap = await screen.findByRole("button", { name: "Trocar" });
    expect(screen.getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByLabelText("Nome do cliente")).not.toBeInTheDocument();

    await user.click(swap);
    await user.click(screen.getByRole("button", { name: /Bia Castro/ }));
    expect(screen.getByText("Bia Castro")).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    expect(createHold.mock.calls[0][0].customerId).toBe("cus-bia");
    await user.click(createButton());

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0].customerId).toBe("cus-bia");
  });
});

describe("prova 4 — Outro, sem cadastro", () => {
  async function openOther() {
    renderForm("cus-ana");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Outro, sem cadastro" }),
    );
    return user;
  }

  test("a tela diz por que não há horários sugeridos", async () => {
    await openOther();

    expect(
      screen.getByText(
        "Sem serviço cadastrado não há horários sugeridos. Digite o horário abaixo.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("radio", { name: /^\d{2}:\d{2}$/ })).toBeNull();
  });

  test("o CTA fica desabilitado até título, duração e horário estarem completos", async () => {
    const user = await openOther();

    expect(createButton()).toBeDisabled();

    await user.type(
      screen.getByLabelText("Título do atendimento"),
      "Retoque de franja",
    );
    expect(createButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Duração em minutos"), "25");
    expect(createButton()).toBeDisabled();

    await user.type(
      screen.getByLabelText("Outro horário, fora dos oferecidos"),
      "11:30",
    );
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));

    expect(createButton()).toBeEnabled();
  });

  test("cria com serviceIds vazio, title e durationMinutes, sem hold", async () => {
    const user = await openOther();
    await user.type(
      screen.getByLabelText("Título do atendimento"),
      "Retoque de franja",
    );
    await user.type(screen.getByLabelText("Duração em minutos"), "25");
    await user.type(
      screen.getByLabelText("Outro horário, fora dos oferecidos"),
      "11:30",
    );
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));
    await user.click(createButton());

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.serviceIds).toEqual([]);
    expect(body.title).toBe("Retoque de franja");
    expect(body.durationMinutes).toBe(25);
    expect(body.startTime).toBe("11:30");
    expect(body.customerId).toBe("cus-ana");
    expect(body.holdId).toBeUndefined();
    expect(createHold).not.toHaveBeenCalled();
    expect(getAvailability).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("prova 5 — conflito na criação", () => {
  test("abre o ConflictPanel; sobrepor sem motivo não envia e, com motivo, vai com overlapOverride", async () => {
    createHold.mockRejectedValue(conflictError());
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: customerFixture({ id: "cus-dora", name: "Dora Lima" }),
        endTime: "13:00",
        id: "apt-ocupa",
        startTime: "12:00",
      }),
    ]);
    renderForm("cus-ana");
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("checkbox", { name: /Corte feminino/ }),
    );
    await screen.findByRole("radio", { name: "09:00" });
    await user.click(screen.getByRole("button", { name: "Outro horário" }));
    await user.type(
      screen.getByLabelText("Outro horário, fora dos oferecidos"),
      "12:00",
    );
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));

    const panel = await screen.findByRole("region", {
      name: "O intervalo 12:00–13:00 não está livre nesta agenda",
    });
    expect(within(panel).getByText("Dora Lima")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Sobrepor mesmo assim" }),
    );
    expect(
      await screen.findByText(
        "Descreva o motivo da sobreposição. Sem motivo, o agendamento não é enviado.",
      ),
    ).toBeVisible();
    expect(createAppointment).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Motivo da sobreposição"),
      "Encaixe combinado",
    );
    await user.click(
      screen.getByRole("button", { name: "Sobrepor mesmo assim" }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.overlapOverride).toBe(true);
    expect(body.overlapOverrideReason).toBe("Encaixe combinado");
    expect(body.startTime).toBe("12:00");
    expect(body.holdId).toBeUndefined();
  });

  test("recusa na criação de Outro, sem cadastro, abre o painel com a duração digitada", async () => {
    createAppointment.mockRejectedValueOnce(conflictError());
    renderForm("cus-ana");
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Outro, sem cadastro" }),
    );
    await user.type(screen.getByLabelText("Título do atendimento"), "Retoque");
    await user.type(screen.getByLabelText("Duração em minutos"), "25");
    await user.type(
      screen.getByLabelText("Outro horário, fora dos oferecidos"),
      "11:30",
    );
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));
    await user.click(createButton());

    expect(
      await screen.findByRole("region", {
        name: "O intervalo 11:30–11:55 não está livre nesta agenda",
      }),
    ).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("prova 6 — sem texto de bastidor e sem campo nativo", () => {
  test("nenhum 'fonte oficial', 'Operacional' nem 'Avisar a cliente'", async () => {
    const { container } = renderForm("cus-ana");
    await screen.findByRole("checkbox", { name: /Corte feminino/ });

    expect(container.textContent).not.toMatch(/fonte oficial/i);
    expect(container.textContent).not.toMatch(/Operacional/);
    expect(container.textContent).not.toMatch(/Avisar a cliente/i);
    expect(screen.queryByText(/Confirmação/)).not.toBeInTheDocument();
  });

  test("todo input de texto, select e textarea do formulário tem classe do design system", async () => {
    const { container } = renderForm();
    const user = userEvent.setup();
    await screen.findByRole("checkbox", { name: /Corte feminino/ });

    // Abre tudo o que o A6 esconde atrás de um toque: observação, outra data,
    // outro horário e o ramo "Outro, sem cadastro".
    for (const name of [
      "Adicionar observação",
      "Escolher outra data",
      "Outro horário",
      "Outro, sem cadastro",
    ]) {
      const toggle = screen.queryByRole("button", { name });
      if (toggle) await user.click(toggle);
    }

    const controls = Array.from(
      container.querySelectorAll<HTMLElement>("input, select, textarea"),
    ).filter((element) => {
      if (element instanceof HTMLSelectElement) return true;
      if (element instanceof HTMLTextAreaElement) return true;
      const type = (element as HTMLInputElement).type;
      return !["checkbox", "radio", "hidden", "button", "submit"].includes(type);
    });

    expect(controls.length).toBeGreaterThan(1);
    const bare = controls
      .filter((element) => !/\b(input|select)\b/.test(element.className))
      .map((element) => element.outerHTML);
    expect(bare).toEqual([]);
    expect(
      screen.getByRole("form", { name: "Novo agendamento" }),
    ).toBeInTheDocument();
  });
});
