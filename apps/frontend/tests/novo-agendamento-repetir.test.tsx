// @vitest-environment jsdom
/**
 * Pedido do usuário de 2026-10-12 (D-171): a recorrência passa a fazer parte
 * do agendamento comum, e a tela "Série de atendimentos" sai.
 *
 * 1. Sem repetir, "Criar agendamento" cria um só, com o mesmo pedido de antes.
 * 2. Com o horário escolhido aparece "Repetir este atendimento"; ligado, a
 *    pessoa escolhe quantos atendimentos (2 a 12) e o intervalo (o do serviço
 *    sugerido, quando há) e o botão vira "Revisar N agendamentos".
 * 3. A revisão (folha padrão) lista cada agendamento com a data certa pelo
 *    intervalo, o horário e o serviço; destaca a ocorrência com conflito
 *    (ajustada) e a sem horário, com a opção que a API dá: pular a data.
 * 4. "Confirmar N agendamentos" chama a confirmação de série com a
 *    Idempotency-Key e os holds escolhidos; tentar de novo o mesmo conjunto
 *    repete a chave e não duplica.
 * 5. "Voltar" mantém o que foi escolhido e devolve as reservas da revisão.
 * 6. A rota antiga `/agenda/serie` redireciona para o novo agendamento com a
 *    repetição ligada.
 * 7. axe sem violações.
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AppointmentSeriesPage from "@/app/(platform)/agenda/serie/page";
import type {
  Appointment,
  AppointmentHold,
  AvailabilitySlot,
  CalendarState,
  CreateAppointmentInput,
  PreviewAppointmentSeriesInput,
  SeriesOccurrencePreview,
  Service,
} from "@/data";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { addDays, isoDate, parseDate } from "@/features/agenda/occupancy";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";
import { chooseManualTime } from "./support/pickers";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  redirect: navigation.redirect,
  usePathname: () => "/agenda/novo",
  useRouter: () => navigation.router,
}));

const confirmAppointmentSeries = vi.fn();
const createAppointment =
  vi.fn<(input: CreateAppointmentInput, key: string) => Promise<Appointment>>();
const createHold = vi.fn();
const customersList = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const previewAppointmentSeries =
  vi.fn<
    (input: PreviewAppointmentSeriesInput) => Promise<SeriesOccurrencePreview[]>
  >();
const releaseHold = vi.fn();
const serviceCatalogList = vi.fn();
const settingsGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      confirmAppointmentSeries,
      createAppointment,
      createHold,
      getAvailability,
      getCalendar,
      listAppointments: vi.fn().mockResolvedValue([]),
      listTimeBlocks: vi.fn().mockResolvedValue([]),
      previewAppointmentSeries,
      releaseHold,
    },
    customers: { list: customersList },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: settingsGet },
  }),
}));

const TODAY = isoDate(new Date());

function day(offset: number): string {
  return isoDate(addDays(parseDate(TODAY), offset));
}

function dayLabel(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(parseDate(value));
}

function service(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 45,
    id: "svc-corte",
    name: "Corte feminino",
    needsReview: false,
    price: 90,
    priceType: "FIXED",
    ...overrides,
  };
}

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

function holdFixture(
  overrides: Partial<AppointmentHold> = {},
): AppointmentHold {
  return {
    contactRef: null,
    customerId: "cus-ana",
    date: TODAY,
    durationMinutes: 45,
    endTime: "09:45",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    id: "hold-1",
    serviceIds: ["svc-corte"],
    source: "USER",
    startTime: "09:00",
    status: "ACTIVE",
    ...overrides,
  };
}

/** A prévia da API: cada ocorrência no horário pedido, com um hold. */
function projected(
  input: PreviewAppointmentSeriesInput,
): SeriesOccurrencePreview[] {
  return Array.from({ length: input.occurrenceCount }, (_, index) => {
    const date = isoDate(
      addDays(parseDate(input.firstDate), index * (input.intervalDays ?? 7)),
    );
    return {
      adjusted: false,
      date,
      endTime: "09:45",
      holdId: `series-hold-${index}`,
      index,
      requestedDate: date,
      startTime: input.firstStartTime,
      unavailable: false,
    };
  });
}

function appointment(id: string, date: string): Appointment {
  return { date, id, startTime: "09:00" } as Appointment;
}

beforeEach(() => {
  for (const mock of [
    confirmAppointmentSeries,
    createAppointment,
    createHold,
    customersList,
    getAvailability,
    getCalendar,
    previewAppointmentSeries,
    releaseHold,
    serviceCatalogList,
    settingsGet,
    navigation.redirect,
    navigation.router.replace,
  ]) {
    mock.mockReset();
  }
  getCalendar.mockResolvedValue(calendarFixture());
  settingsGet.mockResolvedValue({ availability: { rules: [] } });
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [
      service(),
      service({
        durationMinutes: 30,
        id: "svc-sobrancelha",
        name: "Sobrancelha",
        price: 40,
        recurrenceIntervalDays: 21,
      }),
    ],
    source: "AVENLY",
  });
  customersList.mockResolvedValue({
    items: [{ id: "cus-ana", name: "Ana Paula", phone: "+5511999990000" }],
    managedExternally: false,
    source: "AVENLY",
  });
  getAvailability.mockImplementation((query: { startDate: string }) =>
    Promise.resolve<AvailabilitySlot[]>([
      { date: query.startDate, endTime: "09:45", startTime: "09:00" },
    ]),
  );
  createHold.mockImplementation(() => Promise.resolve(holdFixture()));
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  createAppointment.mockResolvedValue(appointment("apt-1", TODAY));
  previewAppointmentSeries.mockImplementation((input) =>
    Promise.resolve(projected(input)),
  );
  confirmAppointmentSeries.mockImplementation(
    (input: { occurrences: Array<{ holdId: string }> }) =>
      Promise.resolve(
        input.occurrences.map((_, index) =>
          appointment(`apt-${index + 1}`, day(index * 7)),
        ),
      ),
  );
});

afterEach(() => {
  cleanup();
});

type User = ReturnType<typeof userEvent.setup>;

/** Cliente vindo do perfil, um serviço e o horário das 09:00. */
async function renderWithTime(
  serviceName: RegExp = /Corte feminino/,
  props: { initialRepeat?: boolean } = {},
) {
  const user = userEvent.setup();
  const utils = render(
    <ShellConfigProvider>
      <AppointmentForm customerId="cus-ana" {...props} />
    </ShellConfigProvider>,
  );
  await user.click(await screen.findByRole("checkbox", { name: serviceName }));
  await user.click(await screen.findByRole("radio", { name: "09:00" }));
  await waitFor(() => expect(createHold).toHaveBeenCalled());
  return { ...utils, user };
}

async function turnOnRepeat(user: User) {
  await user.click(
    await screen.findByRole("switch", { name: "Repetir este atendimento" }),
  );
}

describe("1. sem repetir, um agendamento como antes", () => {
  test("Repetir aparece só depois do horário e, desligado, cria um só com o mesmo pedido", async () => {
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <AppointmentForm customerId="cus-ana" />
      </ShellConfigProvider>,
    );
    await user.click(
      await screen.findByRole("checkbox", { name: /Corte feminino/ }),
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: "09:00" }));

    const toggle = await screen.findByRole("switch", {
      name: "Repetir este atendimento",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento · / }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toEqual({
      comments: undefined,
      customerId: "cus-ana",
      customerName: undefined,
      customerPhone: undefined,
      date: TODAY,
      durationMinutes: undefined,
      holdId: "hold-1",
      overlapOverride: undefined,
      overlapOverrideReason: undefined,
      serviceIds: ["svc-corte"],
      startTime: "09:00",
      title: undefined,
    });
    expect(previewAppointmentSeries).not.toHaveBeenCalled();
    expect(confirmAppointmentSeries).not.toHaveBeenCalled();
  });

  test("Outro, sem cadastro não oferece repetir", async () => {
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <AppointmentForm customerId="cus-ana" />
      </ShellConfigProvider>,
    );
    await user.click(
      await screen.findByRole("button", { name: "Outro, sem cadastro" }),
    );
    await user.type(screen.getByLabelText("Título do atendimento"), "Retoque");
    await user.type(screen.getByLabelText("Duração em minutos"), "20");
    await chooseManualTime(user, "11:00");
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});

describe("2. Repetir este atendimento", () => {
  test("ligado, o botão vira Revisar N agendamentos e o passo vai de 2 a 12", async () => {
    const { user } = await renderWithTime();
    await turnOnRepeat(user);

    expect(
      screen.getByRole("button", { name: "Revisar 4 agendamentos" }),
    ).toBeEnabled();
    const fewer = screen.getByRole("button", { name: "Menos um atendimento" });
    await user.click(fewer);
    await user.click(fewer);
    expect(fewer).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Revisar 2 agendamentos" }),
    ).toBeVisible();
    const more = screen.getByRole("button", { name: "Mais um atendimento" });
    for (let index = 0; index < 12; index += 1) {
      if (!(more as HTMLButtonElement).disabled) await user.click(more);
    }
    expect(more).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Revisar 12 agendamentos" }),
    ).toBeVisible();
    // Toda semana é o padrão sem recorrência no serviço.
    expect(screen.getByRole("radio", { name: "Toda semana" })).toBeChecked();
  });

  test("o intervalo do serviço é a sugestão", async () => {
    const { user } = await renderWithTime(/Sobrancelha/);
    await turnOnRepeat(user);

    expect(
      screen.getByRole("radio", { name: /A cada 3 semanas.*do serviço/ }),
    ).toBeChecked();
  });

  test("o link antigo abre com Repetir já ligado", async () => {
    await renderWithTime(/Corte feminino/, { initialRepeat: true });

    expect(
      await screen.findByRole("switch", { name: "Repetir este atendimento" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("button", { name: "Revisar 4 agendamentos" }),
    ).toBeVisible();
  });
});

describe("3. a revisão", () => {
  test("lista N agendamentos com as datas certas pelo intervalo, o horário, o serviço e o total", async () => {
    const { container, user } = await renderWithTime();
    await turnOnRepeat(user);
    await user.click(screen.getByRole("radio", { name: "A cada 2 semanas" }));
    await user.click(
      screen.getByRole("button", { name: "Revisar 4 agendamentos" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Revisar 4 agendamentos",
    });
    expect(previewAppointmentSeries).toHaveBeenCalledWith({
      customerId: "cus-ana",
      firstDate: TODAY,
      firstStartTime: "09:00",
      intervalDays: 14,
      occurrenceCount: 4,
      serviceIds: ["svc-corte"],
    });
    // A reserva avulsa sai antes da prévia, que reserva o mesmo horário.
    expect(releaseHold).toHaveBeenCalledWith("hold-1");
    const items = within(
      within(dialog).getByRole("list", { name: "Agendamentos" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    items.forEach((item, index) => {
      expect(item).toHaveTextContent(dayLabel(day(index * 14)));
      expect(item).toHaveTextContent("09:00");
      expect(item).toHaveTextContent("Corte feminino");
    });
    expect(dialog).toHaveTextContent("Ana Paula");
    expect(dialog).toHaveTextContent("4 atendimentos");
    expect(dialog).toHaveTextContent("R$ 360,00");
    expect(
      within(dialog).getByRole("button", { name: "Confirmar 4 agendamentos" }),
    ).toBeEnabled();
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(document.body);
  });

  test("conflito e data sem horário ficam em destaque; pular a data tira o hold da confirmação", async () => {
    previewAppointmentSeries.mockImplementationOnce((input) => {
      const [first, second, third] = projected({
        ...input,
        occurrenceCount: 3,
      });
      return Promise.resolve([
        first,
        {
          ...second,
          adjusted: true,
          date: day(8),
          startTime: "10:30",
        },
        {
          ...third,
          date: null,
          endTime: null,
          holdId: null,
          startTime: null,
          unavailable: true,
        },
      ]);
    });
    const { user } = await renderWithTime();
    await turnOnRepeat(user);
    await user.click(
      screen.getByRole("button", { name: "Menos um atendimento" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Revisar 3 agendamentos" }),
    );

    const dialog = await screen.findByRole("dialog");
    const [, adjusted, unavailable] = within(dialog).getAllByRole("listitem");
    expect(adjusted).toHaveTextContent(dayLabel(day(8)));
    expect(adjusted).toHaveTextContent("10:30");
    expect(adjusted).toHaveTextContent(
      /Conflito em .*a agenda ofereceu este horário/,
    );
    expect(unavailable).toHaveTextContent("Sem horário livre perto desta data");
    // A sem horário já fica de fora: são 2 a confirmar.
    expect(
      within(dialog).getByRole("button", { name: "Confirmar 2 agendamentos" }),
    ).toBeVisible();

    const skip = within(adjusted).getByRole("button", {
      name: "Pular esta data",
    });
    await user.click(skip);
    expect(
      within(adjusted).getByRole("button", { name: "Incluir de novo" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar 1 agendamento" }),
    );

    await waitFor(() =>
      expect(confirmAppointmentSeries).toHaveBeenCalledTimes(1),
    );
    expect(
      (confirmAppointmentSeries.mock.calls[0][0] as { occurrences: unknown })
        .occurrences,
    ).toEqual([{ holdId: "series-hold-0" }]);
    // A reserva da data pulada é devolvida.
    await waitFor(() =>
      expect(releaseHold).toHaveBeenCalledWith("series-hold-1"),
    );
  });
});

describe("4. confirmar", () => {
  test("uma chamada com a Idempotency-Key; tentar de novo repete a chave e não duplica", async () => {
    confirmAppointmentSeries.mockRejectedValueOnce(new Error("rede caiu"));
    const { user } = await renderWithTime();
    await turnOnRepeat(user);
    await user.click(
      screen.getByRole("button", { name: "Revisar 4 agendamentos" }),
    );
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Confirmar 4 agendamentos",
    });

    await user.click(confirm);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Nada foi agendado",
    );
    await user.click(confirm);

    await waitFor(() =>
      expect(confirmAppointmentSeries).toHaveBeenCalledTimes(2),
    );
    const [first, second] = confirmAppointmentSeries.mock.calls;
    expect(first[0]).toEqual({
      comments: undefined,
      customerId: "cus-ana",
      customerName: undefined,
      customerPhone: undefined,
      intervalDays: 7,
      occurrences: [0, 1, 2, 3].map((index) => ({
        holdId: `series-hold-${index}`,
      })),
      serviceIds: ["svc-corte"],
    });
    expect(first[1]).toEqual(expect.any(String));
    expect(second[1]).toBe(first[1]);
    expect(createAppointment).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith(
        "/agenda/agendamento?id=apt-1",
      ),
    );
  });
});

describe("5. Voltar", () => {
  test("mantém o que foi escolhido, devolve as reservas da revisão e reserva o horário de novo", async () => {
    const { user } = await renderWithTime();
    await turnOnRepeat(user);
    await user.click(screen.getByRole("radio", { name: "A cada 3 semanas" }));
    await user.click(
      screen.getByRole("button", { name: "Revisar 4 agendamentos" }),
    );
    const dialog = await screen.findByRole("dialog");
    const holdsBefore = createHold.mock.calls.length;

    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    for (let index = 0; index < 4; index += 1) {
      expect(releaseHold).toHaveBeenCalledWith(`series-hold-${index}`);
    }
    expect(
      screen.getByRole("checkbox", { name: /Corte feminino/ }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "09:00" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Repetir este atendimento" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "A cada 3 semanas" }),
    ).toBeChecked();
    await waitFor(() =>
      expect(createHold.mock.calls.length).toBeGreaterThan(holdsBefore),
    );
    expect(confirmAppointmentSeries).not.toHaveBeenCalled();
  });
});

describe("6. a rota antiga", () => {
  test("/agenda/serie redireciona para o novo agendamento com a repetição ligada", () => {
    AppointmentSeriesPage();

    expect(navigation.redirect).toHaveBeenCalledWith("/agenda/novo?repetir=1");
  });
});
