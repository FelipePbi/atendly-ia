// @vitest-environment jsdom
/**
 * Goal016 (WU-11): prova transversal de acessibilidade das telas novas de
 * Agenda, com o que o axe sozinho não cobre.
 *
 * `expectNoA11yViolations` já roda nas superfícies de cada Work Unit
 * (goal016-appointment-create, goal016-blocks-series, goal016-exceptions-source,
 * goal016-lifecycle-history, goal016-appointment-series). Esta suíte fecha três
 * lacunas que nenhuma delas cobre: a grade da Agenda (Dia/Semana/Mês) nunca
 * passou pelo axe, e nenhuma suíte afirma foco por teclado — nem nas grades,
 * nem nos diálogos de confirmação, nem nos controles de decisão de
 * sobreposição. A regra `aria-allowed-role` é best-practice e fica fora do
 * `RULE_SET` de `tests/support/a11y.ts` (que só roda tags WCAG): o axe não
 * acusa um `<Link>` estilizado como botão ou um botão com papel trocado — por
 * isso o papel de cada controle aqui é afirmado explicitamente, não inferido
 * da classe CSS.
 *
 * O que esta suíte não prova: layout real, largura de viewport, contraste
 * computado. Isso é `npm run validate:ui`, não jsdom.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  type AppointmentHold,
  BffHttpError,
  type CalendarState,
  type Customer,
  type Service,
  type TimeBlock,
} from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { BlockSeriesForm } from "@/features/agenda/BlockSeriesForm";
import { CancelFlow } from "@/features/agenda/CancelFlow";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";
import { chooseManualTime } from "./support/pickers";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const cancelAppointment = vi.fn();
const createAppointment = vi.fn();
const createBlockSeries = vi.fn();
const createHold = vi.fn();
const getAppointment = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const releaseHold = vi.fn();
const listCustomers = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      cancelAppointment,
      createAppointment,
      createBlockSeries,
      createHold,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
      releaseHold,
    },
    customers: { list: listCustomers },
    serviceCatalog: { list: listServices },
  }),
}));

const ISO_TODAY = "2026-09-14";

function calendarFixture(
  overrides: Partial<CalendarState> = {},
): CalendarState {
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

function holdFixture(
  overrides: Partial<AppointmentHold> = {},
): AppointmentHold {
  return {
    contactRef: null,
    customerId: undefined,
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
  } as AppointmentHold;
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

function conflictError(): BffHttpError {
  return new BffHttpError({
    code: "SLOT_UNAVAILABLE",
    message: "Slot is unavailable for the service duration.",
    requestId: "req-1",
    status: 409,
  });
}

function seriesConflictError(
  conflicts: Array<{ appointmentId: string; date: string }>,
): BffHttpError {
  return new BffHttpError({
    code: "BLOCK_SERIES_APPOINTMENT_CONFLICT",
    details: { conflicts },
    message: "One or more occurrences overlap a confirmed appointment.",
    requestId: "req-2",
    status: 409,
  });
}

/** Avança Tab até o alvo receber foco, ou até o limite — nunca em loop indefinido. */
async function tabUntilFocused(
  user: UserEvent,
  target: HTMLElement,
  max = 40,
): Promise<void> {
  for (
    let attempt = 0;
    attempt < max && document.activeElement !== target;
    attempt += 1
  ) {
    await user.tab();
  }
}

beforeEach(() => {
  // AgendaBoard usa `new Date()` para o cursor inicial; as fixtures abaixo
  // são todas ancoradas em ISO_TODAY, então o relógio precisa ficar preso
  // nela — sem isso a suíte quebra sozinha assim que o dia real avança.
  vi.setSystemTime(new Date(`${ISO_TODAY}T12:00:00.000Z`));
  // Goal073: Automática abre em Semana a partir de 1024px (o padrão do
  // jsdom); a grade do Dia abaixo depende de Dia como abertura inicial.
  window.innerWidth = 390;
  for (const spy of [
    push,
    replace,
    cancelAppointment,
    createAppointment,
    createBlockSeries,
    createHold,
    getAppointment,
    getAvailability,
    getCalendar,
    listAppointments,
    listAvailabilityExceptions,
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
    items: [serviceFixture()],
    source: "AVENLY",
  });
  listCustomers.mockResolvedValue({
    items: [],
    managedExternally: false,
    source: "AVENLY",
  });
  listAppointments.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("grades da agenda (Dia, Semana e Mês)", () => {
  test("grade do Dia: sem violação de acessibilidade e atendimento alcançável por link e por teclado", async () => {
    listAppointments.mockResolvedValue([appointmentFixture()]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture()]);
    const user = userEvent.setup();

    const { container } = render(
      <ShellConfigProvider>
        <AgendaBoard />
      </ShellConfigProvider>,
    );

    const daySection = await screen.findByLabelText(/Agenda de/);
    await expectNoA11yViolations(container);

    // Atendimento e bloqueio levam a lugares diferentes e o papel diz isso:
    // o atendimento é um Link para o detalhe, o bloqueio é um botão que abre
    // as ações da ocorrência (remover/mover esta, ou a série a partir daqui).
    // A diferença não pode ser deduzida da classe CSS, só afirmada.
    const appointmentLink = within(daySection).getByRole("link", {
      name: /Ana Paula/,
    });
    expect(
      within(daySection).queryByRole("link", { name: /Almoço/ }),
    ).not.toBeInTheDocument();
    const blockButton = within(daySection).getByRole("button", {
      name: /Almoço/,
    });
    expect(blockButton).toHaveAttribute("aria-pressed", "false");

    await tabUntilFocused(user, appointmentLink);
    expect(appointmentLink).toHaveFocus();
  });

  test("grade da Semana: sem violação de acessibilidade e cabeçalho de dia alcançável por teclado", async () => {
    listAppointments.mockResolvedValue([appointmentFixture()]);
    const user = userEvent.setup();

    const { container } = render(
      <ShellConfigProvider>
        <AgendaBoard />
      </ShellConfigProvider>,
    );

    await screen.findByLabelText(/Agenda de/);
    await user.click(screen.getByRole("tab", { name: "Semana" }));
    const weekSection = await screen.findByLabelText("Mapa da semana");
    await expectNoA11yViolations(container);

    // Só os cabeçalhos: as horas vazias da grade também são botões ("Novo às …").
    const dayHeadButtons = within(weekSection).getAllByRole("button", {
      name: /, mostrar /,
    });
    expect(dayHeadButtons.length).toBe(7);
    const firstDayHead = dayHeadButtons[0];

    await tabUntilFocused(user, firstDayHead);
    expect(firstDayHead).toHaveFocus();
    await user.keyboard("{Enter}");

    // Desde 2026-10-12 o cabeçalho escolhe o dia para o resumo, sem sair da
    // Semana; quem abre o Dia é "Abrir dia" no resumo.
    expect(firstDayHead).toHaveAttribute("aria-pressed", "true");
    expect(firstDayHead).toHaveFocus();
    expect(screen.getByLabelText("Mapa da semana")).toBeVisible();
  });

  test("grade do Mês: sem violação de acessibilidade e seleção de dia alcançável por teclado", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <ShellConfigProvider>
        <AgendaBoard />
      </ShellConfigProvider>,
    );

    await screen.findByLabelText(/Agenda de/);
    await user.click(screen.getByRole("tab", { name: "Mês" }));
    const monthSection = await screen.findByLabelText("Mapa do mês");
    await expectNoA11yViolations(container);

    const dayButtons = within(monthSection).getAllByRole("button");
    const target = dayButtons[10];
    expect(target).toHaveAttribute("aria-pressed");

    await tabUntilFocused(user, target);
    expect(target).toHaveFocus();
    // Goal100: Enter segue a regra do toque — o primeiro seleciona, o segundo abre o Dia.
    await user.keyboard("{Enter}");
    expect(target).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText(/Agenda de/)).not.toBeInTheDocument();
    await user.keyboard("{Enter}");

    expect(await screen.findByLabelText(/Agenda de/)).toBeVisible();
  });
});

describe("criação sem diálogo de confirmação", () => {
  async function renderCreateReady(user: UserEvent) {
    getAvailability.mockResolvedValue([
      { date: ISO_TODAY, endTime: "10:00", startTime: "09:00" },
    ]);
    createHold.mockResolvedValue(holdFixture());
    createAppointment.mockResolvedValue(appointmentFixture());

    const result = render(
      <ShellConfigProvider>
        <AppointmentForm />
      </ShellConfigProvider>,
    );
    // Cliente antes do serviço: revelação progressiva (pedido de 2026-10-12, D-170).
    await user.type(
      await screen.findByLabelText("Nome do cliente"),
      "Carla Nunes",
    );
    // O nome digitado vira cliente novo pelo "Cadastrar" (D-170, 2026-10-12).
    await user.click(
      screen.getByRole("button", { name: /Cadastrar “Carla Nunes”/ }),
    );
    await user.click(
      await screen.findByRole("checkbox", { name: /Corte feminino/ }),
    );
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalled());
    return result;
  }

  test("o CTA diz dia e hora, cria com um clique, sem diálogo no caminho, e passa no axe", async () => {
    const user = userEvent.setup();
    const { container } = await renderCreateReady(user);

    await expectNoA11yViolations(container);
    const cta = screen.getByRole("button", { name: /^Criar agendamento · / });
    expect(cta).toHaveAccessibleName(/, 09:00$/);

    await user.click(cta);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
  });

  test("a falha na criação é anunciada por role=alert e devolve o CTA", async () => {
    createAppointment.mockRejectedValueOnce(new Error("falha de rede"));
    const user = userEvent.setup();
    await renderCreateReady(user);

    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento · / }),
    );

    expect(await screen.findByRole("alert")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Criar agendamento · / }),
      ).toBeEnabled(),
    );
  });

  test("cancelamento em um passo (A8): a sheet prende o foco, passa no axe e Esc volta ao detalhe sem cancelar", async () => {
    getAppointment.mockResolvedValue(appointmentFixture());
    cancelAppointment.mockResolvedValue(
      appointmentFixture({ status: "CANCELLED" }),
    );
    const user = userEvent.setup();

    const { container } = render(
      <ShellConfigProvider>
        <CancelFlow appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    // A sheet é a confirmação: já está aberta, sem botão "Revisar cancelamento".
    const dialog = await screen.findByRole("dialog");
    expect(
      screen.queryByRole("button", { name: "Revisar cancelamento" }),
    ).not.toBeInTheDocument();

    await expectNoA11yViolations(container);
    expect(dialog).toHaveFocus();

    // Tab e Shift+Tab giram dentro da sheet, nunca saem para o detalhe inerte.
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-1");
    expect(cancelAppointment).not.toHaveBeenCalled();
  });
});

describe("controles de decisão de sobreposição", () => {
  test("conflito de horário na criação: os dois botões de decisão são alcançáveis por teclado", async () => {
    getAvailability.mockResolvedValue([]);
    createHold.mockRejectedValue(conflictError());
    const user = userEvent.setup();

    const { container } = render(
      <ShellConfigProvider>
        <AppointmentForm />
      </ShellConfigProvider>,
    );
    // Cliente antes do serviço: revelação progressiva (pedido de 2026-10-12, D-170).
    await user.type(
      await screen.findByLabelText("Nome do cliente"),
      "Carla Nunes",
    );
    // O nome digitado vira cliente novo pelo "Cadastrar" (D-170, 2026-10-12).
    await user.click(
      screen.getByRole("button", { name: /Cadastrar “Carla Nunes”/ }),
    );
    await user.click(
      await screen.findByRole("checkbox", { name: /Corte feminino/ }),
    );
    await user.click(screen.getByRole("button", { name: "Outro horário" }));
    await chooseManualTime(user, "1200");
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));

    const chooseAnother = await screen.findByRole("button", {
      name: "Escolher outro horário",
    });
    const override = screen.getByRole("button", {
      name: "Encaixar mesmo assim",
    });
    await waitFor(() => expect(override).toBeEnabled());
    await expectNoA11yViolations(container);

    // Ordem do quadro A7: motivo, depois "Encaixar mesmo assim", depois "Escolher outro horário".
    await user.type(
      screen.getByLabelText("Motivo do encaixe"),
      "Retorno urgente",
    );
    await tabUntilFocused(user, override);
    expect(override).toHaveFocus();
    await user.tab();
    expect(chooseAnother).toHaveFocus();
  });

  test("conflito de série de bloqueio: os três botões de decisão são alcançáveis por teclado", async () => {
    createBlockSeries.mockRejectedValueOnce(
      seriesConflictError([{ appointmentId: "apt-9", date: "2026-09-28" }]),
    );
    const user = userEvent.setup();

    const { container } = render(
      <ShellConfigProvider>
        <BlockSeriesForm />
      </ShellConfigProvider>,
    );
    await screen.findByRole("heading", { name: "Criar série de bloqueio" });
    await user.click(screen.getByRole("checkbox", { name: "Seg" }));
    await user.click(screen.getByRole("button", { name: "Criar série" }));

    const adjust = await screen.findByRole("button", {
      name: "Ajustar a série",
    });
    const skip = screen.getByRole("button", {
      name: "Pular estas ocorrências",
    });
    const force = screen.getByRole("button", { name: "Forçar sobreposição" });
    await expectNoA11yViolations(container);

    await user.type(
      screen.getByLabelText("Motivo da sobreposição (para forçar)"),
      "Cliente avisado",
    );
    await tabUntilFocused(user, adjust);
    expect(adjust).toHaveFocus();
    await user.tab();
    expect(skip).toHaveFocus();
    await user.tab();
    expect(force).toHaveFocus();
  });
});
