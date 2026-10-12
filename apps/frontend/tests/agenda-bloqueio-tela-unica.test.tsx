// @vitest-environment jsdom
/**
 * "Bloquear horário" numa tela só (D-169, revisão de 2026-10-12).
 *
 * A primeira versão tinha duas etapas: a etapa 1 perguntava "O que você quer
 * bloquear?" (pausa no atendimento, compromisso pessoal, dia ou período
 * fechado) e a etapa 2, quando. A pessoa relatou que tocar no tipo já avançava
 * e, depois, que os três tipos pareciam a mesma coisa; a etapa 1 saiu. Agora a
 * tela abre direto no período:
 *
 * - "Dia inteiro" ligado grava o dia fechado (indisponibilidade sem horário);
 * - período, sempre bloqueio (`POST /v1/time-blocks`), `kind` `BLOCK`, ou
 *   `PERSONAL` com a chave "É um compromisso pessoal" em "Título e motivo";
 * - `?type=` só pré-configura as chaves.
 *
 * Período parcial de dia fechado não é mais criado aqui. Cada caminho envia o
 * mesmo payload de antes ao mesmo endpoint. A medida de "sem rolagem" é de
 * layout real e não cabe no jsdom; ela foi feita no navegador (390x844 e
 * 360x740).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type AvailabilityException,
  BffHttpError,
  type CalendarState,
  type TimeBlock,
} from "@/data";
import { BlockForm } from "@/features/agenda/BlockForm";
import { CalendarSettings } from "@/features/settings/CalendarSettings";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/agenda/bloquear",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getCalendar = vi.fn();
const createTimeBlock = vi.fn();
const deleteTimeBlock = vi.fn();
const createUnavailability = vi.fn();
const removeAvailabilityException = vi.fn();
const listAppointments = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getReminders = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      createTimeBlock,
      createUnavailability,
      deleteTimeBlock,
      getCalendar,
      listAppointments,
      listTimeBlocks,
      removeAvailabilityException,
    },
    settings: { getAgendaViewPreference, getReminders },
  }),
}));

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

function timeBlockFixture(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    endAt: "2026-10-20T19:00:00.000Z",
    id: "block-1",
    kind: "BLOCK",
    reason: null,
    seriesId: null,
    startAt: "2026-10-20T18:00:00.000Z",
    title: null,
    ...overrides,
  };
}

function exceptionFixture(
  overrides: Partial<AvailabilityException> = {},
): AvailabilityException {
  return {
    available: false,
    date: "2026-10-20",
    decidedBy: null,
    decidedReason: null,
    endTime: null,
    id: "exc-1",
    reason: null,
    startTime: null,
    ...overrides,
  };
}

function renderForm(url = "/agenda/bloquear") {
  window.history.pushState({}, "", url);
  return render(
    <ShellConfigProvider>
      <BlockForm />
    </ShellConfigProvider>,
  );
}

async function openForm() {
  return screen.findByRole("heading", { name: "Quando?" });
}

const SLOT_URL = "/agenda/bloquear?date=2026-10-20&time=15%3A00";
const PERSONAL = { name: "É um compromisso pessoal" };
const ALL_DAY = { name: "Dia inteiro" };

beforeEach(() => {
  vi.clearAllMocks();
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
});

describe("a tela abre direto no período, sem perguntar o tipo", () => {
  test("sem etapa 1, sem barra de etapas: Data, Dia inteiro desligado, Início e Fim", async () => {
    const { container } = renderForm();
    const heading = await openForm();

    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      screen.getByRole("heading", { level: 1, name: "Bloquear horário" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Fechar bloqueio" }),
    ).toHaveAttribute("href", "/agenda");
    expect(screen.queryByText("O que você quer bloquear?")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/Etapa \d de/)).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Etapas do bloqueio" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
    expect(screen.queryByText("Resumo")).toBeNull();

    expect(screen.getByLabelText("Data")).toBeVisible();
    expect(screen.getByRole("switch", ALL_DAY)).not.toBeChecked();
    expect(screen.getByLabelText("Início")).toBeVisible();
    expect(screen.getByLabelText("Fim")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Repetir em dias fixos" }),
    ).toHaveAttribute("href", "/agenda/bloquear/serie");
    expect(screen.queryByRole("switch", PERSONAL)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Confirmar bloqueio" }),
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("a hora vazia da Semana chega como Data, Início e Fim, com Dia inteiro desligado", async () => {
    renderForm(SLOT_URL);
    await openForm();

    expect(screen.getByLabelText("Data")).toHaveValue("20/10/2026");
    expect(screen.getByLabelText("Início")).toHaveValue("15:00");
    expect(screen.getByLabelText("Fim")).toHaveValue("16:00");
    expect(screen.getByRole("switch", ALL_DAY)).not.toBeChecked();
  });

  test("Título e motivo recolhidos; abrir mostra a chave pessoal e leva o foco a ela", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    await openForm();

    expect(screen.queryByLabelText("Título (opcional)")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Título e motivo" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    const personal = screen.getByRole("switch", PERSONAL);
    expect(personal).toHaveFocus();
    expect(personal).not.toBeChecked();
    expect(screen.getByLabelText("Título (opcional)")).toBeVisible();
    expect(screen.getByLabelText("Motivo (opcional)")).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("fim antes do início vira erro inline no campo Fim, sem enviar", async () => {
    const user = userEvent.setup();
    const { container } = renderForm(SLOT_URL);
    await openForm();

    await user.clear(screen.getByLabelText("Fim"));
    await user.type(screen.getByLabelText("Fim"), "14:00");
    await user.click(
      screen.getByRole("button", { name: "Confirmar bloqueio" }),
    );

    const end = screen.getByLabelText("Fim");
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(
      "O fim deve ser posterior ao início.",
    );
    expect(end).toHaveFocus();
    expect(createTimeBlock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});

describe("cada combinação grava o payload de antes no mesmo endpoint", () => {
  test("período com a chave pessoal desligada: POST /v1/time-blocks com kind BLOCK", async () => {
    createTimeBlock.mockResolvedValue(timeBlockFixture());
    const user = userEvent.setup();
    renderForm(SLOT_URL);
    await openForm();

    await user.click(
      screen.getByRole("button", { name: "Confirmar bloqueio" }),
    );

    await waitFor(() => expect(createTimeBlock).toHaveBeenCalledTimes(1));
    expect(createTimeBlock).toHaveBeenCalledWith({
      endAt: "2026-10-20T19:00:00.000Z",
      kind: "BLOCK",
      reason: null,
      startAt: "2026-10-20T18:00:00.000Z",
      title: null,
    });
    expect(createUnavailability).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Bloqueio operacional confirmado"),
    ).toBeVisible();

    deleteTimeBlock.mockResolvedValue({ deleted: true });
    await user.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() =>
      expect(deleteTimeBlock).toHaveBeenCalledWith("block-1"),
    );
  });

  test("período com a chave pessoal ligada: o mesmo, com kind PERSONAL, título e motivo", async () => {
    createTimeBlock.mockResolvedValue(
      timeBlockFixture({
        kind: "PERSONAL",
        reason: "Rotina",
        title: "Dentista",
      }),
    );
    const user = userEvent.setup();
    const { container } = renderForm(SLOT_URL);
    await openForm();

    await user.click(screen.getByRole("button", { name: "Título e motivo" }));
    await user.click(screen.getByRole("switch", PERSONAL));
    expect(screen.getByRole("switch", PERSONAL)).toBeChecked();
    await user.type(screen.getByLabelText("Título (opcional)"), " Dentista ");
    await user.type(screen.getByLabelText("Motivo (opcional)"), "Rotina");
    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole("button", { name: "Confirmar compromisso" }),
    );

    await waitFor(() => expect(createTimeBlock).toHaveBeenCalledTimes(1));
    expect(createTimeBlock).toHaveBeenCalledWith({
      endAt: "2026-10-20T19:00:00.000Z",
      kind: "PERSONAL",
      reason: "Rotina",
      startAt: "2026-10-20T18:00:00.000Z",
      title: "Dentista",
    });
    expect(createUnavailability).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Compromisso pessoal confirmado"),
    ).toBeVisible();
  });

  test("Dia inteiro ligado: indisponibilidade sem horário; a chave pessoal some", async () => {
    createUnavailability.mockResolvedValue(
      exceptionFixture({ reason: "Feriado local" }),
    );
    const user = userEvent.setup();
    const { container } = renderForm(SLOT_URL);
    await openForm();

    // Mesmo com os opcionais já abertos e a chave pessoal ligada, o dia
    // inteiro não tem título, chave pessoal nem série.
    await user.click(screen.getByRole("button", { name: "Título e motivo" }));
    await user.click(screen.getByRole("switch", PERSONAL));
    await user.click(screen.getByRole("switch", ALL_DAY));

    expect(screen.getByRole("switch", ALL_DAY)).toBeChecked();
    expect(screen.queryByLabelText("Início")).toBeNull();
    expect(screen.queryByLabelText("Fim")).toBeNull();
    expect(screen.queryByRole("switch", PERSONAL)).toBeNull();
    expect(screen.queryByLabelText("Título (opcional)")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Repetir em dias fixos" }),
    ).toBeNull();
    await expectNoA11yViolations(container);

    await user.type(
      screen.getByLabelText("Motivo (opcional)"),
      "Feriado local",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    );

    await waitFor(() => expect(createUnavailability).toHaveBeenCalledTimes(1));
    expect(createUnavailability).toHaveBeenCalledWith({
      date: "2026-10-20",
      decidedReason: undefined,
      endTime: undefined,
      reason: "Feriado local",
      startTime: undefined,
    });
    expect(createTimeBlock).not.toHaveBeenCalled();
    expect(await screen.findByText("Dia fechado confirmado")).toBeVisible();

    removeAvailabilityException.mockResolvedValue({ deleted: true });
    await user.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() =>
      expect(removeAvailabilityException).toHaveBeenCalledWith("exc-1"),
    );
  });

  test("dia inteiro sobre atendimento confirmado só reenvia com o motivo da decisão", async () => {
    createUnavailability
      .mockRejectedValueOnce(
        new BffHttpError({
          code: "EXCEPTION_APPOINTMENT_CONFLICT",
          message: "Conflict",
          requestId: "req-1",
          status: 409,
        }),
      )
      .mockResolvedValueOnce(
        exceptionFixture({ decidedReason: "Reforma", id: "exc-forced" }),
      );
    const user = userEvent.setup();
    const { container } = renderForm(
      "/agenda/bloquear?type=CLOSED&date=2026-10-20",
    );
    await openForm();
    await user.click(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Este fechamento cobre atendimento já confirmado",
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText(/decidedBy/i)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Confirmar mesmo assim" }),
    );
    const decided = screen.getByLabelText("Motivo da decisão");
    expect(decided).toHaveAttribute("aria-invalid", "true");
    expect(decided).toHaveFocus();
    expect(createUnavailability).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);

    await user.type(decided, "Reforma");
    await user.click(
      screen.getByRole("button", { name: "Confirmar mesmo assim" }),
    );
    await waitFor(() => expect(createUnavailability).toHaveBeenCalledTimes(2));
    expect(createUnavailability).toHaveBeenNthCalledWith(2, {
      date: "2026-10-20",
      decidedReason: "Reforma",
      endTime: undefined,
      reason: undefined,
      startTime: undefined,
    });
  });
});

describe("?type= de antes só pré-configura a tela", () => {
  test("PERSONAL: chave pessoal ligada e Título e motivo abertos", async () => {
    const { container } = renderForm(
      "/agenda/bloquear?type=PERSONAL&date=2026-10-20&time=15%3A00",
    );
    await openForm();

    expect(screen.getByRole("switch", PERSONAL)).toBeChecked();
    expect(screen.getByLabelText("Título (opcional)")).toBeVisible();
    expect(screen.getByRole("switch", ALL_DAY)).not.toBeChecked();
    expect(screen.getByLabelText("Início")).toHaveValue("15:00");
    expect(
      screen.getByRole("button", { name: "Confirmar compromisso" }),
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("CLOSED: Dia inteiro ligado, sem Início e Fim", async () => {
    renderForm("/agenda/bloquear?type=CLOSED&date=2026-10-20");
    await openForm();

    expect(screen.getByRole("switch", ALL_DAY)).toBeChecked();
    expect(screen.queryByLabelText("Início")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    ).toBeVisible();
  });

  test.each(["/agenda/bloquear?type=BLOCK", "/agenda/bloquear"])(
    "%s: o padrão, pausa no atendimento",
    async (url) => {
      const user = userEvent.setup();
      renderForm(url);
      await openForm();

      expect(screen.getByRole("switch", ALL_DAY)).not.toBeChecked();
      await user.click(screen.getByRole("button", { name: "Título e motivo" }));
      expect(screen.getByRole("switch", PERSONAL)).not.toBeChecked();
      expect(
        screen.getByRole("button", { name: "Confirmar bloqueio" }),
      ).toBeVisible();
    },
  );
});

describe("horário extra não é bloqueio: fica em Configurações > Agenda (D-169)", () => {
  test("a linha 'Horário extra' leva à tela de disponibilidade extra", () => {
    getReminders.mockReturnValue(new Promise(() => undefined));
    getAgendaViewPreference.mockReturnValue(new Promise(() => undefined));
    render(
      <ShellConfigProvider>
        <CalendarSettings
          settings={
            {
              availability: null,
              calendar: { source: "AVENLY" },
            } as unknown as Parameters<typeof CalendarSettings>[0]["settings"]
          }
        />
      </ShellConfigProvider>,
    );

    expect(
      screen.getByRole("link", { name: /^Horário extra/ }),
    ).toHaveAttribute("href", "/agenda/excecoes");
  });
});
