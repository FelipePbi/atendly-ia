// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DayView } from "@/features/agenda/DayView";

/**
 * Agenda > Dia sem atendimento, igual ao quadro A2 do protótipo
 * (Agenda.dc.html, Agenda-Tablet.dc.html e Agenda-Desktop.dc.html).
 *
 * Problema evitado: o dia ABERTO sem atendimento caía num layout próprio, só
 * "Nenhum atendimento neste dia." e um botão "Criar agendamento" alinhados à
 * esquerda (ajuste de 2026-10-12), enquanto o protótipo desenha um único vazio
 * centralizado (arte, título, frase em cinza e "+ Criar agendamento" em
 * verde). Agora aberto e fechado usam o mesmo bloco; só a frase muda. jsdom não
 * faz layout: a centralização é conferida na regra CSS portada do quadro.
 */
const stylesDir = path.join(__dirname, "../src/shared/styles");
const css = ["avenly.css", "avenly-agenda.css"]
  .map((file) => readFileSync(path.join(stylesDir, file), "utf8"))
  .join("\n");

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, "g"))]
    .map((match) => match[1])
    .join("\n");
}

// 2026-10-12 é segunda; 2026-10-11, domingo (o dia do quadro).
function renderDay(props: {
  canCreateAppointment?: boolean;
  date?: string;
  hasAvailability?: boolean | null;
}) {
  return render(
    <DayView
      canCreateAppointment={props.canCreateAppointment ?? true}
      date={props.date ?? "2026-10-12"}
      entries={[]}
      hasAvailability={props.hasAvailability ?? true}
      onSelectDay={vi.fn()}
    />,
  );
}

describe("Agenda Dia vazia (quadro A2)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("o CSS do vazio é o do quadro: coluna centralizada, gap 14, padding 0 40 120", () => {
    const empty = ruleBody(".agenda-day-empty");
    expect(empty).toMatch(/display: flex;/);
    expect(empty).toMatch(/flex-direction: column;/);
    expect(empty).toMatch(/align-items: center;/);
    expect(empty).toMatch(/justify-content: center;/);
    expect(empty).toMatch(/gap: 14px;/);
    expect(empty).toMatch(/padding: 0 40px 120px;/);
    expect(empty).toMatch(/text-align: center;/);
    expect(empty).not.toMatch(/justify-items: start/);
    expect(ruleBody(".agenda-day-empty-art")).toMatch(/width: 140px;/);
    expect(ruleBody(".agenda-day-empty-art > .agenda-day-empty-slot")).toMatch(
      /border: 1\.5px dashed #b9b1a6;/,
    );
    expect(ruleBody(".agenda-day-empty-title")).toMatch(/font-size: 17px;/);
    expect(ruleBody(".agenda-day-empty-copy")).toMatch(/color: #5f574e;/);
    const create = ruleBody(".agenda-day-empty-create");
    expect(create).toMatch(/color: #0f5f63;/);
    expect(create).toMatch(/font-size: 15px;/);
  });

  test("dia aberto: arte, título, frase e '+ Criar agendamento' como link de texto", () => {
    const { container } = renderDay({});
    const empty = container.querySelector(".agenda-day-empty")!;
    expect(empty).not.toBeNull();

    const art = empty.querySelector(".agenda-day-empty-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art?.querySelectorAll(":scope > span")).toHaveLength(5);
    expect(art?.querySelector(".agenda-day-empty-slot")).not.toBeNull();

    expect(screen.getByText("Nenhum atendimento neste dia.")).toHaveClass(
      "agenda-day-empty-title",
    );
    expect(
      screen.getByText(
        "Seu dia está livre. Quando a IA marcar um horário, ele aparece aqui.",
      ),
    ).toHaveClass("agenda-day-empty-copy");

    const create = screen.getByRole("link", { name: "Criar agendamento" });
    expect(create).toHaveAttribute("href", "/agenda/novo");
    expect(create).toHaveClass("agenda-day-empty-create");
    expect(create).not.toHaveClass("button");
    const plus = create.querySelector("svg");
    expect(plus).toHaveAttribute("aria-hidden", "true");
    expect(plus?.querySelector("path")).toHaveAttribute("d", "M12 5v14M5 12h14");
    expect(create.parentElement).toBe(empty);

    expect(container.querySelector(".agenda-day-summary")).toHaveTextContent(
      "0 atendimentos",
    );
    expect(screen.queryByText("você não atende neste dia")).toBeNull();
  });

  test("dia aberto sem permissão de criar: mesma frase e sem o link", () => {
    renderDay({ canCreateAppointment: false });
    expect(
      screen.getByText("Seu dia está livre. Quando a IA marcar um horário, ele aparece aqui."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Criar agendamento" })).toBeNull();
  });

  test("disponibilidade não lida: mesmo vazio do dia aberto, sem afirmar que o dia é fechado", () => {
    renderDay({ hasAvailability: null });
    expect(
      screen.getByText(/^Seu dia está livre\./),
    ).toBeVisible();
    expect(screen.queryByText(/você não atende/)).toBeNull();
    expect(screen.queryByText(/A IA não marca horários/)).toBeNull();
  });

  test("dia fechado: frase do quadro e 'você não atende neste dia' no cabeçalho", () => {
    const { container } = renderDay({
      date: "2026-10-11",
      hasAvailability: false,
    });
    const summary = container.querySelector(".agenda-day-summary");
    expect(summary).toHaveClass("is-closed");
    expect(summary).toHaveTextContent("Domingo, 11");
    expect(summary).toHaveTextContent("você não atende neste dia");
    expect(screen.getByText("Nenhum atendimento neste dia.")).toBeVisible();
    expect(
      screen.getByText(
        "A IA não marca horários aos domingos, mas você pode criar um atendimento por conta própria.",
      ),
    ).toHaveClass("agenda-day-empty-copy");
    expect(
      screen.getByRole("link", { name: "Criar agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
  });
});
