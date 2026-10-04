// @vitest-environment jsdom
/**
 * Goal016 (rodada 2, blockers 1 e 2).
 *
 * **Blocker 1 — alcançabilidade.** Os fluxos obrigatórios dos itens 5, 6 e 8
 * do escopo existiam como componentes sem nenhum importador de produção: o
 * usuário não tinha como chegar neles. Este arquivo prova o contrário pelo
 * que o usuário encontra — a página de cada rota monta a tela certa, e a tela
 * de onde se parte oferece o link para chegar lá.
 *
 * **Blocker 2 — a grade sem fonte escolhida.** `listAppointments`,
 * `listTimeBlocks` e `listAvailabilityExceptions` exigem calendário
 * configurado no Scheduling (`requireCalendar`). Pedidas incondicionalmente,
 * derrubavam a agenda inteira em tenant sem fonte escolhida. A consulta a
 * `calendar.source` acontece **antes** da leitura (item 9), então aqui se
 * afirma a chamada que NÃO é feita, além da tela que aparece.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState, TimeBlock } from "@/data";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const listCustomers = vi.fn();
const listServices = vi.fn();
const removeBlockOccurrence = vi.fn();
const moveBlockOccurrence = vi.fn();
const removeBlockSeries = vi.fn();
const editBlockSeriesFromDate = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      editBlockSeriesFromDate,
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
      moveBlockOccurrence,
      removeBlockOccurrence,
      removeBlockSeries,
    },
    customers: { list: listCustomers },
    serviceCatalog: { list: listServices },
  }),
}));

import BlockTimePage from "@/app/(platform)/agenda/bloquear/page";
import BlockSeriesPage from "@/app/(platform)/agenda/bloquear/serie/page";
import AvailabilityExceptionsPage from "@/app/(platform)/agenda/excecoes/page";
import NewAppointmentPage from "@/app/(platform)/agenda/novo/page";
import AgendaPage from "@/app/(platform)/agenda/page";
import AppointmentSeriesPage from "@/app/(platform)/agenda/serie/page";

const today = new Date();
const ISO_TODAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

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

beforeEach(() => {
  vi.clearAllMocks();
  // Goal073: Automática abre em Semana a partir de 1024px (o padrão do
  // jsdom); esta suíte afirma a grade do Dia, então fixa a viewport abaixo
  // do corte para manter Dia como abertura inicial, como antes do Goal073.
  window.innerWidth = 390;
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
  listCustomers.mockResolvedValue({
    items: [],
    managedExternally: false,
    source: "AVENLY",
  });
  listServices.mockResolvedValue({
    editable: true,
    items: [],
    source: "AVENLY",
  });
});

function renderPage(page: React.ReactElement) {
  return render(<ShellConfigProvider>{page}</ShellConfigProvider>);
}

describe("cada fluxo obrigatório tem rota própria e é alcançável", () => {
  test.each([
    ["/agenda/bloquear", BlockTimePage, "Bloquear horário"],
    ["/agenda/bloquear/serie", BlockSeriesPage, "Criar série de bloqueio"],
    ["/agenda/serie", AppointmentSeriesPage, "Série de atendimentos"],
    [
      "/agenda/excecoes",
      AvailabilityExceptionsPage,
      "Exceções de disponibilidade",
    ],
  ])("%s monta a tela do fluxo", async (_route, Page, title) => {
    renderPage(<Page />);

    expect(
      await screen.findByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
  });

  test("a agenda oferece o caminho para as exceções de disponibilidade", async () => {
    // Goal092: o botão solto "Exceções do dia" saiu; o caminho é o item
    // "Exceção do dia" do menu "Novo".
    const user = userEvent.setup();
    renderPage(<AgendaPage />);

    await user.click(await screen.findByRole("button", { name: "Novo" }));

    expect(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "Exceção do dia",
      }),
    ).toHaveAttribute("href", "/agenda/excecoes");
  });

  test("bloquear horário oferece o caminho para a série de bloqueio", async () => {
    renderPage(<BlockTimePage />);

    expect(
      await screen.findByRole("link", { name: "Repetir em dias fixos" }),
    ).toHaveAttribute("href", "/agenda/bloquear/serie");
  });

  test("novo agendamento oferece o caminho para a série de atendimento", async () => {
    // Goal075: a página lê `customerId` de `searchParams`, então é async
    // (padrão de componente de servidor) — chamar e aguardar antes de montar.
    renderPage(await NewAppointmentPage({ searchParams: Promise.resolve({}) }));

    expect(
      await screen.findByRole("link", { name: "Agendar série" }),
    ).toHaveAttribute("href", "/agenda/serie");
  });
});

describe("a grade consulta a fonte oficial antes de ler", () => {
  test("sem fonte escolhida a agenda explica a configuração e não lê nada", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ source: null, timezone: null }),
    );

    renderPage(<AgendaPage />);

    expect(
      await screen.findByText("Agenda ainda não configurada"),
    ).toBeVisible();
    expect(listAppointments).not.toHaveBeenCalled();
    expect(listTimeBlocks).not.toHaveBeenCalled();
    expect(listAvailabilityExceptions).not.toHaveBeenCalled();
  });

  test("na Agenda Atendly a janela inteira é lida, bloqueios e exceções inclusive", async () => {
    renderPage(<AgendaPage />);

    expect(await screen.findByText("Nenhum atendimento neste dia.")).toBeVisible();
    expect(listTimeBlocks).toHaveBeenCalledTimes(1);
    expect(listAvailabilityExceptions).toHaveBeenCalledTimes(1);
  });
});

describe("as ações da ocorrência partem da própria grade", () => {
  /**
   * `OccurrenceActions` era órfã: "esta ocorrência" e "a série a partir daqui"
   * existiam no código e não existiam no produto. O caminho é o bloqueio na
   * grade do Dia — é lá que a profissional o vê.
   */
  test("selecionar um bloqueio no Dia abre remover/mover esta ocorrência", async () => {
    listTimeBlocks.mockResolvedValue([timeBlockFixture()]);
    removeBlockOccurrence.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage(<AgendaPage />);

    const daySection = await screen.findByLabelText(/Agenda de/);
    await user.click(
      within(daySection).getByRole("button", { name: /Almoço/ }),
    );

    const panel = await screen.findByRole("region", {
      name: "Ações de Bloqueio operacional",
    });
    expect(
      within(panel).getByRole("heading", { name: "Esta ocorrência" }),
    ).toBeVisible();

    await user.click(
      within(panel).getByRole("button", { name: "Remover esta ocorrência" }),
    );

    expect(removeBlockOccurrence).toHaveBeenCalledWith("block-1");
  });

  test("ocorrência de série também oferece a série a partir daqui, como escopo distinto", async () => {
    listTimeBlocks.mockResolvedValue([
      timeBlockFixture({ seriesId: "series-1", title: "Manutenção" }),
    ]);
    const user = userEvent.setup();

    renderPage(<AgendaPage />);

    const daySection = await screen.findByLabelText(/Agenda de/);
    await user.click(
      within(daySection).getByRole("button", { name: /Manutenção/ }),
    );

    const panel = await screen.findByRole("region", {
      name: "Ações de Bloqueio operacional",
    });
    expect(
      within(panel).getByRole("heading", { name: "Esta ocorrência" }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("heading", { name: "A série a partir daqui" }),
    ).toBeVisible();
  });
});
