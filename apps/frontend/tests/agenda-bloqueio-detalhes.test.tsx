// @vitest-environment jsdom
/**
 * Pedido de 2026-10-12: tocar num bloqueio ou compromisso pessoal (Semana ou
 * Dia) abre a folha de ações (D-166), que mostrava só "BLOQUEIO OPERACIONAL",
 * "Esta ocorrência", o alcance e as duas ações. Agora a folha começa pelos
 * detalhes, no padrão do detalhe A5 (rótulo pequeno em caixa alta e o valor
 * embaixo): título, dia e horário com duração, motivo (só quando há), a
 * repetição quando é série e quando foi criado. O bloco não guarda autor, então
 * não há "por quem". "Mover" e "Remover" continuam abaixo, sem mudar.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type TimeBlock } from "@/data";
import {
  OccurrenceActions,
  occurrenceDayLabel,
  seriesPatternLabel,
} from "@/features/agenda/OccurrenceActions";

import { expectNoA11yViolations } from "./support/a11y";

const removeBlockOccurrence = vi.fn();
const moveBlockOccurrence = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { moveBlockOccurrence, removeBlockOccurrence },
  }),
}));

const TZ = "America/Sao_Paulo";

function block(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    // Terça, 13 de outubro de 2026, 10:00 às 11:15 em São Paulo.
    endAt: "2026-10-13T14:15:00.000Z",
    id: "block-1",
    kind: "BLOCK",
    reason: null,
    seriesId: null,
    startAt: "2026-10-13T13:00:00.000Z",
    title: "Almoço",
    ...overrides,
  };
}

function details() {
  return screen.getByRole("region", { name: /Almoço|Bloqueio operacional|Dentista/ });
}

function fact(label: string): string | null {
  const term = within(details()).queryByText(label, { selector: "dt" });
  return term?.nextElementSibling?.textContent ?? null;
}

beforeEach(() => {
  removeBlockOccurrence.mockReset();
  moveBlockOccurrence.mockReset();
});

describe("detalhes do bloqueio no topo da folha (pedido de 2026-10-12)", () => {
  test("título, dia e horário com duração, motivo, série e criado em", async () => {
    const { container } = render(
      <OccurrenceActions
        block={block({
          createdAt: "2026-10-11T21:59:00.000Z",
          reason: "Almoço da equipe",
          series: { daysOfWeek: [2], occurrenceCount: null, seriesEndDate: null },
          seriesId: "series-1",
        })}
        timezone={TZ}
      />,
    );

    expect(
      within(details()).getByRole("heading", { name: "Almoço" }),
    ).toBeVisible();
    expect(within(details()).getByText("Bloqueio operacional")).toBeVisible();
    expect(fact("Quando")).toBe(
      "Terça, 13 de outubro · 10:00 às 11:15 (1 h 15)",
    );
    expect(fact("Motivo")).toBe("Almoço da equipe");
    expect(fact("Repetição")).toBe("Repete toda terça");
    expect(fact("Criado em")).toBe("11/10 às 18:59");
    await expectNoA11yViolations(container);
  });

  test("sem motivo, sem série e sem data de criação, essas linhas não aparecem", () => {
    render(<OccurrenceActions block={block()} timezone={TZ} />);

    expect(fact("Quando")).toBe(
      "Terça, 13 de outubro · 10:00 às 11:15 (1 h 15)",
    );
    expect(fact("Motivo")).toBeNull();
    expect(fact("Repetição")).toBeNull();
    expect(fact("Criado em")).toBeNull();
  });

  test("compromisso pessoal sem título usa o tipo como título", () => {
    render(
      <OccurrenceActions
        block={block({ kind: "PERSONAL", title: null })}
        timezone={TZ}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Compromisso pessoal" }),
    ).toBeVisible();
  });

  test("série sem o resumo carregado ainda diz que é série", () => {
    render(
      <OccurrenceActions
        block={block({ seriesId: "series-1", series: null })}
        timezone={TZ}
      />,
    );

    expect(fact("Repetição")).toBe("Faz parte de uma série");
  });

  test("as ações continuam abaixo e funcionando", async () => {
    removeBlockOccurrence.mockResolvedValue({ deleted: true });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <OccurrenceActions block={block()} onChanged={onChanged} timezone={TZ} />,
    );

    const remove = screen.getByRole("button", {
      name: "Remover esta ocorrência",
    });
    const move = screen.getByRole("button", { name: "Mover esta ocorrência" });
    // Os detalhes vêm antes das ações na ordem do documento.
    expect(
      details().compareDocumentPosition(remove) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(move);
    expect(screen.getByRole("button", { name: "Confirmar novo horário" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(
      screen.getByRole("button", { name: "Remover esta ocorrência" }),
    );
    await waitFor(() =>
      expect(removeBlockOccurrence).toHaveBeenCalledWith("block-1"),
    );
    expect(onChanged).toHaveBeenCalledWith(null);
  });
});

describe("rótulos de dia e de série", () => {
  test("dia da semana com inicial maiúscula e mês por extenso", () => {
    expect(occurrenceDayLabel("2026-10-13")).toBe("Terça, 13 de outubro");
    expect(occurrenceDayLabel("2026-10-18")).toBe("Domingo, 18 de outubro");
  });

  test("padrão da série com gênero do dia, vários dias e término", () => {
    expect(
      seriesPatternLabel({ daysOfWeek: [6], occurrenceCount: null, seriesEndDate: null }),
    ).toBe("Repete todo sábado");
    expect(
      seriesPatternLabel({
        daysOfWeek: [1, 3, 5],
        occurrenceCount: null,
        seriesEndDate: "2026-12-31",
      }),
    ).toBe("Repete toda semana: segunda, quarta e sexta, até 31/12");
    expect(
      seriesPatternLabel({ daysOfWeek: [2], occurrenceCount: 8, seriesEndDate: null }),
    ).toBe("Repete toda terça, 8 vezes");
  });
});
