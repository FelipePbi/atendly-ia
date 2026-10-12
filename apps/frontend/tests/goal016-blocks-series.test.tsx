// @vitest-environment jsdom
/**
 * Goal016 (WU-06): compromisso pessoal, bloqueio e séries de bloqueio.
 *
 * O que estes testes precisam garantir: bloqueio operacional e compromisso
 * pessoal nascem com `kind` distinto e rótulo próprio; a série finita só
 * aceita um entre `seriesEndDate`/`occurrenceCount`; conflito de série
 * (`409 BLOCK_SERIES_APPOINTMENT_CONFLICT`) mostra o que será pulado antes de
 * perguntar pular ou forçar; e esta ocorrência (remover, mover) nunca é a
 * mesma chamada que a série a partir daqui (editar, remover) — a confusão das
 * duas apaga trabalho da profissional.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type BlockSeries,
  type CalendarState,
  type CreateBlockSeriesInput,
  type TimeBlock,
} from "@/data";
import { BlockForm } from "@/features/agenda/BlockForm";
import { BlockSeriesForm } from "@/features/agenda/BlockSeriesForm";
import { OccurrenceActions } from "@/features/agenda/OccurrenceActions";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getCalendar = vi.fn();
const createTimeBlock = vi.fn();
const deleteTimeBlock = vi.fn();
const createBlockSeries = vi.fn();
const removeBlockOccurrence = vi.fn();
const moveBlockOccurrence = vi.fn();
const removeBlockSeries = vi.fn();
const editBlockSeriesFromDate = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      createBlockSeries,
      createTimeBlock,
      deleteTimeBlock,
      editBlockSeriesFromDate,
      getCalendar,
      moveBlockOccurrence,
      removeBlockOccurrence,
      removeBlockSeries,
    },
  }),
}));

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

function conflictError(
  conflicts: Array<{ appointmentId: string; date: string }>,
): BffHttpError {
  return new BffHttpError({
    code: "BLOCK_SERIES_APPOINTMENT_CONFLICT",
    details: { conflicts },
    message: "One or more occurrences overlap a confirmed appointment.",
    requestId: "req-1",
    status: 409,
  });
}

function renderWithShell(node: ReactElement) {
  return render(<ShellConfigProvider>{node}</ShellConfigProvider>);
}

beforeEach(() => {
  getCalendar.mockReset();
  createTimeBlock.mockReset();
  deleteTimeBlock.mockReset();
  createBlockSeries.mockReset();
  removeBlockOccurrence.mockReset();
  moveBlockOccurrence.mockReset();
  removeBlockSeries.mockReset();
  editBlockSeriesFromDate.mockReset();
  getCalendar.mockResolvedValue(calendarFixture());
});

describe("BlockForm: bloqueio e compromisso pessoal são coisas distintas", () => {
  test("cria um bloqueio operacional por padrão, com rótulo próprio", async () => {
    createTimeBlock.mockResolvedValue(
      timeBlockFixture({ reason: "Manutenção", title: null }),
    );
    const user = userEvent.setup();

    const { container } = renderWithShell(<BlockForm />);
    await screen.findByRole("heading", { name: "Bloquear horário" });
    await expectNoA11yViolations(container);

    // Tela única desde a revisão de 2026-10-12 (D-169): abre direto no período.
    await user.click(
      screen.getByRole("button", { name: "Confirmar bloqueio" }),
    );

    await waitFor(() => expect(createTimeBlock).toHaveBeenCalledTimes(1));
    expect(createTimeBlock.mock.calls[0][0]).toMatchObject({ kind: "BLOCK" });
    expect(
      await screen.findByText("Bloqueio operacional confirmado"),
    ).toBeVisible();
  });

  test("cria um compromisso pessoal com título quando esse tipo é escolhido", async () => {
    createTimeBlock.mockResolvedValue(
      timeBlockFixture({ kind: "PERSONAL", title: "Dentista" }),
    );
    const user = userEvent.setup();

    renderWithShell(<BlockForm />);
    await screen.findByRole("heading", { name: "Bloquear horário" });

    // Desde a tela única de 2026-10-12 (D-169), o compromisso pessoal é a
    // chave dentro de "Título e motivo".
    await user.click(screen.getByRole("button", { name: "Título e motivo" }));
    await user.click(
      screen.getByRole("switch", { name: "É um compromisso pessoal" }),
    );
    await user.type(screen.getByLabelText("Título (opcional)"), "Dentista");
    await user.click(
      screen.getByRole("button", { name: "Confirmar compromisso" }),
    );

    await waitFor(() => expect(createTimeBlock).toHaveBeenCalledTimes(1));
    expect(createTimeBlock.mock.calls[0][0]).toMatchObject({
      kind: "PERSONAL",
      title: "Dentista",
    });
    expect(
      await screen.findByText("Compromisso pessoal confirmado"),
    ).toBeVisible();
  });
});

describe("BlockSeriesForm: série finita com exatamente um término", () => {
  test("envia seriesEndDate e nunca occurrenceCount quando o término é por data", async () => {
    createBlockSeries.mockResolvedValue(blockSeriesFixture());
    const user = userEvent.setup();

    renderWithShell(<BlockSeriesForm />);
    await screen.findByRole("heading", { name: "Criar série de bloqueio" });

    await user.click(screen.getByRole("checkbox", { name: "Seg" }));
    await user.click(screen.getByRole("checkbox", { name: "Qua" }));
    await user.click(screen.getByRole("button", { name: "Criar série" }));

    await waitFor(() => expect(createBlockSeries).toHaveBeenCalledTimes(1));
    const [input] = createBlockSeries.mock.calls[0] as [CreateBlockSeriesInput];
    expect(input.rule.daysOfWeek).toEqual([1, 3]);
    expect(input.rule.seriesEndDate).toEqual(expect.any(String));
    expect(input.rule.occurrenceCount).toBeUndefined();
  });

  test("envia occurrenceCount e nunca seriesEndDate quando o término é por contagem", async () => {
    createBlockSeries.mockResolvedValue(
      blockSeriesFixture({ occurrenceCount: 4, seriesEndDate: null }),
    );
    const user = userEvent.setup();

    renderWithShell(<BlockSeriesForm />);
    await screen.findByRole("heading", { name: "Criar série de bloqueio" });

    await user.click(screen.getByRole("checkbox", { name: "Ter" }));
    await user.click(
      screen.getByRole("radio", { name: "Número de repetições" }),
    );
    await user.click(screen.getByRole("button", { name: "Criar série" }));

    await waitFor(() => expect(createBlockSeries).toHaveBeenCalledTimes(1));
    const [input] = createBlockSeries.mock.calls[0] as [CreateBlockSeriesInput];
    expect(input.rule.occurrenceCount).toEqual(expect.any(Number));
    expect(input.rule.seriesEndDate).toBeUndefined();
  });

  test("conflito mostra antes o que será pulado, e oferece pular ou forçar com motivo", async () => {
    createBlockSeries
      .mockRejectedValueOnce(
        conflictError([
          { appointmentId: "apt-9", date: "2026-09-28" },
          { appointmentId: "apt-10", date: "2026-10-05" },
        ]),
      )
      .mockResolvedValueOnce(blockSeriesFixture());
    const user = userEvent.setup();

    renderWithShell(<BlockSeriesForm />);
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

    await user.click(
      screen.getByRole("button", { name: "Pular estas ocorrências" }),
    );

    await waitFor(() => expect(createBlockSeries).toHaveBeenCalledTimes(2));
    const [, secondInput] = createBlockSeries.mock.calls as [
      unknown,
      [CreateBlockSeriesInput],
    ];
    expect(secondInput[0]).toMatchObject({ skipConflicts: true });
    expect(secondInput[0].forceOverlapReason).toBeUndefined();
  });

  test("forçar sobreposição exige motivo e o envia ao repetir a chamada", async () => {
    createBlockSeries
      .mockRejectedValueOnce(
        conflictError([{ appointmentId: "apt-9", date: "2026-09-28" }]),
      )
      .mockResolvedValueOnce(blockSeriesFixture());
    const user = userEvent.setup();

    renderWithShell(<BlockSeriesForm />);
    await screen.findByRole("heading", { name: "Criar série de bloqueio" });
    await user.click(screen.getByRole("checkbox", { name: "Seg" }));
    await user.click(screen.getByRole("button", { name: "Criar série" }));
    await screen.findByText("1 ocorrência(s) cobrem um atendimento confirmado");

    await user.click(
      screen.getByRole("button", { name: "Forçar sobreposição" }),
    );
    expect(
      await screen.findByText("Informe o motivo da sobreposição."),
    ).toBeVisible();
    expect(createBlockSeries).toHaveBeenCalledTimes(1);

    await user.type(
      screen.getByLabelText("Motivo da sobreposição (para forçar)"),
      "Cliente avisado",
    );
    await user.click(
      screen.getByRole("button", { name: "Forçar sobreposição" }),
    );

    await waitFor(() => expect(createBlockSeries).toHaveBeenCalledTimes(2));
    const [, secondInput] = createBlockSeries.mock.calls as [
      unknown,
      [CreateBlockSeriesInput],
    ];
    expect(secondInput[0]).toMatchObject({
      forceOverlapReason: "Cliente avisado",
    });
    expect(secondInput[0].skipConflicts).toBeUndefined();
  });
});

describe("OccurrenceActions: esta ocorrência não é a série a partir daqui", () => {
  test("remover esta ocorrência chama só removeBlockOccurrence, nunca removeBlockSeries", async () => {
    const user = userEvent.setup();
    removeBlockOccurrence.mockResolvedValue({ deleted: true });

    render(
      <OccurrenceActions
        block={timeBlockFixture({ seriesId: "series-1" })}
        timezone="America/Sao_Paulo"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Remover esta ocorrência" }),
    );

    await waitFor(() =>
      expect(removeBlockOccurrence).toHaveBeenCalledWith("block-1"),
    );
    expect(removeBlockSeries).not.toHaveBeenCalled();
  });

  test("remover a série a partir daqui chama só removeBlockSeries, nunca removeBlockOccurrence", async () => {
    const user = userEvent.setup();
    removeBlockSeries.mockResolvedValue({ deleted: true });

    render(
      <OccurrenceActions
        block={timeBlockFixture({ seriesId: "series-1" })}
        timezone="America/Sao_Paulo"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Remover a série a partir daqui" }),
    );

    await waitFor(() =>
      expect(removeBlockSeries).toHaveBeenCalledWith("series-1"),
    );
    expect(removeBlockOccurrence).not.toHaveBeenCalled();
  });

  test("mover esta ocorrência chama moveBlockOccurrence com o novo horário, sem tocar a série", async () => {
    const user = userEvent.setup();
    moveBlockOccurrence.mockResolvedValue(timeBlockFixture());

    render(
      <OccurrenceActions
        block={timeBlockFixture({ seriesId: "series-1" })}
        timezone="America/Sao_Paulo"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Mover esta ocorrência" }),
    );
    const startInput = screen.getByLabelText("Início");
    await user.clear(startInput);
    await user.type(startInput, "11:00");
    await user.click(
      screen.getByRole("button", { name: "Confirmar novo horário" }),
    );

    await waitFor(() => expect(moveBlockOccurrence).toHaveBeenCalledTimes(1));
    expect(moveBlockOccurrence.mock.calls[0][0]).toBe("block-1");
    expect(removeBlockSeries).not.toHaveBeenCalled();
    expect(removeBlockOccurrence).not.toHaveBeenCalled();
  });

  test("editar a série a partir daqui chama editBlockSeriesFromDate com fromDate e nunca move a ocorrência isolada", async () => {
    const user = userEvent.setup();
    editBlockSeriesFromDate.mockResolvedValue(blockSeriesFixture());

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

    await waitFor(() =>
      expect(editBlockSeriesFromDate).toHaveBeenCalledTimes(1),
    );
    expect(editBlockSeriesFromDate.mock.calls[0][0]).toBe("series-1");
    expect(editBlockSeriesFromDate.mock.calls[0][1]).toMatchObject({
      fromDate: "2026-09-21",
    });
    expect(moveBlockOccurrence).not.toHaveBeenCalled();
    expect(removeBlockOccurrence).not.toHaveBeenCalled();
  });

  test("explica que editar a partir de uma data encerra a série atual e preserva o passado", () => {
    render(
      <OccurrenceActions
        block={timeBlockFixture({ seriesId: "series-1" })}
        timezone="America/Sao_Paulo"
      />,
    );

    expect(
      screen.getByText(/encerra/i, { selector: "p.muted" }),
    ).toHaveTextContent(/ocorrências passadas nunca são tocadas/);
  });

  test("bloco fora de série não mostra nenhuma ação de série", () => {
    render(<OccurrenceActions block={timeBlockFixture({ seriesId: null })} />);

    expect(
      screen.queryByRole("button", { name: "Remover a série a partir daqui" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar a série a partir daqui" }),
    ).not.toBeInTheDocument();
  });
});
