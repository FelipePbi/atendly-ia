// @vitest-environment jsdom
/**
 * Goal069 (WU-04): os dias visíveis nunca deixam ocultar os sete dias
 * (observação 4 do review073). Com seis já ocultos, o sétimo (o único
 * visível) fica desabilitado e mostra o motivo. Se o servidor recusar pelo
 * mesmo motivo — sete dias em `hiddenWeekdays`, `agendaHiddenWeekdaysSchema`
 * em `apps/bff/src/modules/settings/routes.ts` — a mensagem é a mesma frase,
 * não a genérica de falha.
 *
 * Desde 2026-10-18 os dias visíveis só se escolhem na própria Agenda (a
 * seção "Como você vê a Agenda" saiu de Configurações › Agenda), então a
 * regra é provada na folha da Agenda.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";
import { AgendaVisibleDaysSheet } from "@/features/agenda/AgendaVisibleDaysSheet";

const REASON = "Pelo menos um dia precisa aparecer na Agenda.";

const updateAgendaViewPreference = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    settings: { updateAgendaViewPreference },
  }),
}));

beforeEach(() => {
  updateAgendaViewPreference.mockReset();
  updateAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [1, 2, 3, 4, 5, 6],
    initialView: null,
  });
});

function renderSheet(onSaved = vi.fn()) {
  render(
    <AgendaVisibleDaysSheet
      availableWeekdays={null}
      hiddenWeekdays={[1, 2, 3, 4, 5, 6]}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe("Seis dias ocultos: o sétimo não pode ocultar", () => {
  test("o único dia visível fica desabilitado e o motivo aparece", () => {
    renderSheet();

    const sunday = screen.getByRole("switch", { name: "Domingo" });
    expect(sunday).toBeDisabled();
    expect(sunday).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(REASON)).toBeVisible();
  });

  test("clicar no dia desabilitado não muda a seleção nem esconde os sete", async () => {
    const user = userEvent.setup();
    renderSheet();

    const sunday = screen.getByRole("switch", { name: "Domingo" });
    await user.click(sunday);
    expect(sunday).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenCalledWith(
        { hiddenWeekdays: [1, 2, 3, 4, 5, 6] },
        expect.any(AbortSignal),
      ),
    );
  });

  test("dias já ocultos continuam clicáveis para reaparecer", async () => {
    const user = userEvent.setup();
    renderSheet();

    const monday = screen.getByRole("switch", { name: "Segunda" });
    expect(monday).not.toBeDisabled();
    await user.click(monday);
    expect(monday).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenCalledWith(
        { hiddenWeekdays: [2, 3, 4, 5, 6] },
        expect.any(AbortSignal),
      ),
    );
  });
});

describe("Recusa do servidor pelo mesmo motivo", () => {
  test("mostra a mesma frase, não a genérica", async () => {
    updateAgendaViewPreference.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: {
            hiddenWeekdays: ["Array must contain at most 6 element(s)"],
          },
        },
        message: "Invalid request body.",
        requestId: "req-1",
        status: 400,
      }),
    );
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(REASON);
    expect(alert).not.toHaveTextContent("Não foi possível salvar");
  });

  test("outra falha do servidor continua com a mensagem genérica", async () => {
    updateAgendaViewPreference.mockRejectedValue(new Error("falha de rede"));
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar os dias visíveis.",
    );
  });
});
