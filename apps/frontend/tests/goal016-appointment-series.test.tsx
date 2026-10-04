// @vitest-environment jsdom
/**
 * Goal016 (WU-07): série de atendimento — pré-visualização e confirmação
 * atômica.
 *
 * O que estes testes precisam garantir, porque é exatamente o que o contrato
 * do Goal009 fechou: a pré-visualização mostra ocorrência `adjusted` como
 * ajustada e `unavailable` como indisponível — nenhuma das duas escondida nem
 * trocada por outro horário em silêncio; a confirmação é **uma só** chamada,
 * com `Idempotency-Key`, sobre os holds da pré-visualização; a tela nunca
 * oferece confirmar "as que deram certo"; e desistir devolve o que foi
 * reservado, em vez de deixar horário preso até o TTL.
 *
 * As afirmações são sobre a requisição emitida e sobre o que a tela mostra —
 * nunca sobre classe CSS.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  BffHttpError,
  type CalendarState,
  type ConfirmAppointmentSeriesInput,
  type Customer,
  type SeriesOccurrencePreview,
  type Service,
} from "@/data";
import { SeriesConfirm } from "@/features/agenda/SeriesConfirm";
import { SeriesPreview } from "@/features/agenda/SeriesPreview";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const confirmAppointmentSeries = vi.fn();
const getCalendar = vi.fn();
const previewAppointmentSeries = vi.fn();
const releaseHold = vi.fn();
const listCustomers = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      confirmAppointmentSeries,
      getCalendar,
      previewAppointmentSeries,
      releaseHold,
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

/** Três datas a 21 dias uma da outra, como o intervalo do serviço projeta. */
const OCCURRENCE_DATES = ["2026-10-05", "2026-10-26", "2026-11-16"];

function occurrenceFixture(
  index: number,
  overrides: Partial<SeriesOccurrencePreview> = {},
): SeriesOccurrencePreview {
  const date = OCCURRENCE_DATES[index] ?? "2026-12-07";
  return {
    adjusted: false,
    date,
    endTime: "10:00",
    holdId: `hold-${index + 1}`,
    index,
    requestedDate: date,
    startTime: "09:00",
    unavailable: false,
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
    date: "2026-10-05",
    durationMinutes: 60,
    endTime: "10:00",
    finalValue: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: "ser-1",
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

function httpError(code: string, details?: unknown): BffHttpError {
  return new BffHttpError({
    code,
    details,
    message: "Upstream refused the series.",
    requestId: "req-1",
    status: 409,
  });
}

/** Três ocorrências completas: o caminho em que a série pode ser confirmada. */
const COMPLETE_PREVIEW = [
  occurrenceFixture(0),
  occurrenceFixture(1, {
    adjusted: true,
    requestedDate: "2026-10-26",
    startTime: "14:00",
  }),
  occurrenceFixture(2),
];

beforeEach(() => {
  for (const spy of [
    confirmAppointmentSeries,
    getCalendar,
    previewAppointmentSeries,
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
    items: [customerFixture()],
    managedExternally: false,
    source: "AVENLY",
  });
  previewAppointmentSeries.mockResolvedValue(COMPLETE_PREVIEW);
  releaseHold.mockResolvedValue({ id: "hold-1", status: "RELEASED" });
  confirmAppointmentSeries.mockResolvedValue([
    appointmentFixture(),
    appointmentFixture({ date: "2026-10-26", id: "apt-2" }),
    appointmentFixture({ date: "2026-11-16", id: "apt-3" }),
  ]);
});

function renderSeries() {
  return render(
    <ShellConfigProvider>
      <SeriesPreview />
    </ShellConfigProvider>,
  );
}

/** Formulário mínimo até a pré-visualização: serviço, cliente e contagem. */
async function previewSeries(occurrences = 3) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox", { name: /Corte feminino/ }));
  await user.selectOptions(screen.getByLabelText("Cliente"), "cus-ana");
  const count = screen.getByLabelText("Quantas ocorrências");
  await user.clear(count);
  await user.type(count, String(occurrences));
  await user.click(screen.getByRole("button", { name: "Pré-visualizar série" }));
  await waitFor(() =>
    expect(previewAppointmentSeries).toHaveBeenCalledTimes(1),
  );
  return user;
}

describe("pré-visualização: cada ocorrência diz o que aconteceu com ela", () => {
  test("ajustada aparece como ajustada, com o dia que foi pedido", async () => {
    renderSeries();
    await previewSeries();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    const adjusted = items[1];
    expect(within(adjusted).getByText("Ajustada")).toBeVisible();
    expect(adjusted.textContent).toMatch(/Pedida para .*26 de outubro de 2026/);
    expect(adjusted.textContent).toMatch(/14:00/);
  });

  test("indisponível aparece como indisponível, e não some da lista", async () => {
    previewAppointmentSeries.mockResolvedValue([
      occurrenceFixture(0),
      occurrenceFixture(1, {
        adjusted: false,
        date: null,
        endTime: null,
        holdId: null,
        requestedDate: "2026-10-26",
        startTime: null,
        unavailable: true,
      }),
      occurrenceFixture(2),
    ]);
    renderSeries();
    await previewSeries();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    const unavailable = items[1];
    expect(within(unavailable).getByText("Indisponível")).toBeVisible();
    expect(unavailable.textContent).toMatch(/26 de outubro de 2026/);
    expect(unavailable.textContent).toMatch(/Nada foi reservado para ela/);
  });

  test("o intervalo parte do recurrenceIntervalDays do serviço e vai no pedido", async () => {
    renderSeries();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: /Corte feminino/ }),
    );
    // O intervalo do serviço (Goal007) é o ponto de partida visível, antes de
    // qualquer pedido — e continua editável.
    expect(
      screen.getByLabelText("Intervalo entre atendimentos (dias)"),
    ).toHaveValue(21);

    await user.selectOptions(screen.getByLabelText("Cliente"), "cus-ana");
    const count = screen.getByLabelText("Quantas ocorrências");
    await user.clear(count);
    await user.type(count, "3");
    await user.click(
      screen.getByRole("button", { name: "Pré-visualizar série" }),
    );

    await waitFor(() =>
      expect(previewAppointmentSeries).toHaveBeenCalledTimes(1),
    );
    expect(previewAppointmentSeries.mock.calls[0][0]).toEqual({
      customerId: "cus-ana",
      firstDate: ISO_TODAY,
      firstStartTime: "09:00",
      intervalDays: 21,
      occurrenceCount: 3,
      serviceIds: ["svc-corte"],
    });
  });

  test("a pré-visualização renderizada não tem violação de acessibilidade", async () => {
    const { container } = renderSeries();
    await previewSeries();
    await screen.findAllByRole("listitem");

    await expectNoA11yViolations(container);
  });
});

describe("confirmação única, com Idempotency-Key, sobre os holds da prévia", () => {
  test("uma só chamada leva todos os holds e a chave de idempotência", async () => {
    renderSeries();
    const user = await previewSeries();

    await user.click(screen.getByRole("button", { name: "Confirmar série" }));

    await waitFor(() =>
      expect(confirmAppointmentSeries).toHaveBeenCalledTimes(1),
    );
    const [body, idempotencyKey] = confirmAppointmentSeries.mock.calls[0] as [
      ConfirmAppointmentSeriesInput,
      string,
    ];
    expect(body.occurrences).toEqual([
      { holdId: "hold-1" },
      { holdId: "hold-2" },
      { holdId: "hold-3" },
    ]);
    expect(body.customerId).toBe("cus-ana");
    expect(body.customerName).toBeUndefined();
    expect(body.customerPhone).toBeUndefined();
    expect(body.intervalDays).toBe(21);
    expect(body.serviceIds).toEqual(["svc-corte"]);
    expect(typeof idempotencyKey).toBe("string");
    expect(idempotencyKey.length).toBeGreaterThan(0);

    expect(
      await screen.findByRole("heading", { name: "3 atendimentos criados" }),
    ).toBeVisible();
    // Hold confirmado foi consumido pelo servidor: liberar seria mexer em
    // reserva que já virou atendimento.
    expect(releaseHold).not.toHaveBeenCalled();
  });

  test("tentar de novo o mesmo conjunto repete a chave, não cria uma segunda série", async () => {
    confirmAppointmentSeries
      .mockRejectedValueOnce(new Error("Falha de rede."))
      .mockResolvedValueOnce([appointmentFixture()]);
    renderSeries();
    const user = await previewSeries();

    await user.click(screen.getByRole("button", { name: "Confirmar série" }));
    await screen.findByText("Falha de rede.");
    await user.click(screen.getByRole("button", { name: "Confirmar série" }));

    await waitFor(() =>
      expect(confirmAppointmentSeries).toHaveBeenCalledTimes(2),
    );
    expect(confirmAppointmentSeries.mock.calls[1][1]).toBe(
      confirmAppointmentSeries.mock.calls[0][1],
    );
  });

  test("recusa diz qual ocorrência falhou, que nada foi criado e o que sobrou livre", async () => {
    confirmAppointmentSeries.mockRejectedValue(
      httpError("APPOINTMENT_HOLD_EXPIRED", {
        upstreamDetails: {
          alternatives: [
            { date: "2026-10-26", endTime: "16:00", startTime: "15:00" },
          ],
          holdId: "hold-2",
          occurrenceDate: "2026-10-26",
          occurrenceIndex: 1,
        },
      }),
    );
    renderSeries();
    const user = await previewSeries();

    await user.click(screen.getByRole("button", { name: "Confirmar série" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/2ª ocorrência/);
    expect(alert.textContent).toMatch(/26 de outubro de 2026/);
    expect(alert.textContent).toMatch(/Nada foi agendado/);
    expect(screen.getByText(/15:00/)).toBeVisible();
  });

  test("horário tomado depois da prévia não vira mensagem de reserva vencida", async () => {
    confirmAppointmentSeries.mockRejectedValue(
      httpError("SLOT_UNAVAILABLE", {
        upstreamDetails: { holdId: "hold-3", occurrenceIndex: 2 },
      }),
    );
    renderSeries();
    const user = await previewSeries();

    await user.click(screen.getByRole("button", { name: "Confirmar série" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/foi tomado depois da pré-visualização/);
    expect(alert.textContent).toMatch(/3ª ocorrência/);
  });
});

describe("a tela não oferece confirmação parcial", () => {
  test("ocorrência indisponível tira a confirmação da tela inteira", async () => {
    previewAppointmentSeries.mockResolvedValue([
      occurrenceFixture(0),
      occurrenceFixture(1, {
        date: null,
        endTime: null,
        holdId: null,
        startTime: null,
        unavailable: true,
      }),
      occurrenceFixture(2),
    ]);
    renderSeries();
    const user = await previewSeries();

    expect(
      screen.queryByRole("button", { name: /Confirmar/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "1 de 3 ocorrência(s) ficaram sem horário",
      }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Ajustar a série" }));
    expect(confirmAppointmentSeries).not.toHaveBeenCalled();
  });

  test("SeriesConfirm recusa confirmar um conjunto sem hold para toda ocorrência", async () => {
    render(
      <SeriesConfirm
        intervalDays={21}
        occurrences={[
          occurrenceFixture(0),
          occurrenceFixture(1, { holdId: null }),
        ]}
        onConfirmed={vi.fn()}
        onGiveUp={vi.fn()}
        onRestart={vi.fn()}
        serviceIds={["svc-corte"]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Confirmar/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/só é confirmada inteira/)).toBeVisible();
  });
});

describe("desistir libera o que a pré-visualização reservou", () => {
  test("desistir devolve todos os holds e nada é agendado", async () => {
    renderSeries();
    const user = await previewSeries();

    await user.click(screen.getByRole("button", { name: "Desistir da série" }));

    await waitFor(() => expect(releaseHold).toHaveBeenCalledTimes(3));
    const released = releaseHold.mock.calls as Array<[string]>;
    expect(released.map(([holdId]) => holdId)).toEqual([
      "hold-1",
      "hold-2",
      "hold-3",
    ]);
    expect(confirmAppointmentSeries).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Pré-visualizar série" }),
    ).toBeVisible();
    expect(
      screen.getByText(/reservas da pré-visualização foram liberadas/),
    ).toBeVisible();
  });

  test("ajustar a série também devolve o reservado antes de voltar ao formulário", async () => {
    previewAppointmentSeries.mockResolvedValue([
      occurrenceFixture(0),
      occurrenceFixture(1, {
        date: null,
        endTime: null,
        holdId: null,
        startTime: null,
        unavailable: true,
      }),
    ]);
    renderSeries();
    const user = await previewSeries(2);

    await user.click(screen.getByRole("button", { name: "Ajustar a série" }));

    await waitFor(() => expect(releaseHold).toHaveBeenCalledTimes(1));
    expect(releaseHold).toHaveBeenCalledWith("hold-1");
  });

  test("abandonar a tela com prévia aberta libera as reservas", async () => {
    const view = renderSeries();
    await previewSeries();

    view.unmount();

    await waitFor(() => expect(releaseHold).toHaveBeenCalledTimes(3));
  });
});
