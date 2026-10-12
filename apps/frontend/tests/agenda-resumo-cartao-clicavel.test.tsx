// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { DaySummaryCard } from "@/features/agenda/DaySummaryCard";

import { expectNoA11yViolations } from "./support/a11y";

/**
 * Pedido de 2026-10-12: na Semana e no Mês, o cartão "Quarta, 14 · 4
 * atendimentos" inteiro abre o Dia, não só a área de "Abrir dia".
 */
describe("cartão de resumo do dia clicável por inteiro", () => {
  const css = readFileSync("src/shared/styles/avenly-agenda.css", "utf8");
  const ruleOf = (selector: string) =>
    new RegExp(`${selector.replace(/[.:]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(
      css,
    )?.[1] ?? "";

  test("o botão cobre o cartão: cartão posicionado e ::after em inset", () => {
    expect(ruleOf(".agenda-day-summary-card")).toMatch(/position:\s*relative/);
    expect(ruleOf(".agenda-day-summary-card")).toMatch(/cursor:\s*pointer/);
    const overlay = ruleOf(".agenda-summary-open::after");
    expect(overlay).toMatch(/position:\s*absolute/);
    expect(overlay).toMatch(/inset:\s*-1px/);
    expect(overlay).toMatch(/content:\s*""/);
  });

  test("o foco do teclado desenha a moldura do cartão inteiro", () => {
    expect(ruleOf(".agenda-summary-open:focus-visible::after")).toMatch(
      /outline:\s*2px solid/,
    );
  });

  test("um único alvo acessível, alcançável pelo teclado, que abre o Dia", async () => {
    const onOpenDay = vi.fn<(date: Date) => void>();
    const { container } = render(
      <DaySummaryCard
        date="2026-10-14"
        entries={[]}
        isToday={false}
        onOpenDay={onOpenDay}
        serviceColors={new Map()}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /abrir dia/i })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onOpenDay).toHaveBeenCalledTimes(1);
    expect(onOpenDay.mock.calls[0][0].getDate()).toBe(14);
    await expectNoA11yViolations(container);
  });
});
