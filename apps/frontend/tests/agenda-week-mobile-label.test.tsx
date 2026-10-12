// @vitest-environment jsdom
/**
 * Pedido de 2026-10-12: na Agenda, visão Semana no celular, o cartão de
 * atendimento era só um bloco colorido, sem texto. Agora mostra o nome da
 * cliente abreviado ("Felipe Borges" → "Felipe B."), numa linha, em fonte
 * pequena, na cor (branco ou preto) que dá contraste WCAG AA (>= 4,5:1) com o
 * traço do serviço. A abreviação é só visual: o nome acessível do cartão
 * continua com o nome inteiro, o serviço e o horário. Bloqueio não ganha nome.
 *
 * Layout (reticências, omissão em cartão estreito, overflow) não é provado
 * aqui — jsdom não tem layout; foi conferido no navegador em 360 e 390px.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { type Appointment, type ServiceColorToken, type TimeBlock } from "@/data";
import {
  abbreviateClientName,
  CARD_SWATCH_HEX,
  contrastRatio,
  DARK_INK,
  LIGHT_INK,
  NEUTRAL_SWATCH_HEX,
  SERVICE_SWATCH_HEX,
  weekBarLabelBackgrounds,
  weekBarLabelInk,
} from "@/features/agenda/weekBarLabel";
import { WeekView } from "@/features/agenda/WeekView";

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Felipe Borges", phone: "5511998887766" },
    customerId: "c1",
    date: "2026-09-28",
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
        serviceId: "s1",
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

const PALETTE = Object.keys(SERVICE_SWATCH_HEX) as ServiceColorToken[];

const agendaCss = readFileSync(
  path.join(__dirname, "../src/shared/styles/avenly-agenda.css"),
  "utf8",
);

describe("pedido de 2026-10-12: abreviação do nome da cliente", () => {
  test.each([
    ["Felipe Borges", "Felipe B."],
    ["Ana", "Ana"],
    ["  Felipe   Borges  ", "Felipe B."],
    ["   Ana   ", "Ana"],
    ["Felipe Borges da Rosa", "Felipe B."],
    ["Maria da Silva", "Maria S."],
    ["joana souza", "joana S."],
    ["   ", ""],
  ])("%j vira %j", (name, expected) => {
    expect(abbreviateClientName(name)).toBe(expected);
  });
});

describe("pedido de 2026-10-12: cor do texto pela luminância do traço", () => {
  // Pedido de 2026-10-12: nas cores do servico o nome e sempre branco, e as
  // quatro cores mais claras escurecem so no cartao para passar de 4,5:1.
  test.each(PALETTE)("%s: nome branco no cartão, com contraste >= 4,5", (token) => {
    expect(weekBarLabelInk([token], false)).toBe(LIGHT_INK);
    expect(contrastRatio(LIGHT_INK, CARD_SWATCH_HEX[token])).toBeGreaterThanOrEqual(4.5);
  });

  test("as cores do cartão no CSS batem com CARD_SWATCH_HEX", () => {
    for (const token of ["AMBER", "EMERALD", "ROSE", "VIOLET"] as const) {
      const rule = new RegExp(
        `\\.week-bar-stripe b\\[data-color="${token}"\\] \\{\\s*--swatch: (#[0-9a-f]{6});`,
      );
      expect(agendaCss.match(rule)?.[1]).toBe(CARD_SWATCH_HEX[token]);
    }
  });

  test("a sombra do nome branco existe no CSS do celular", () => {
    expect(agendaCss).toMatch(/\.week-bar-label\.is-light \{[^}]*text-shadow:/);
  });

  test("serviço sem cor (cinza padrão) também passa de 4,5", () => {
    expect(weekBarLabelBackgrounds([null], false)).toEqual([NEUTRAL_SWATCH_HEX]);
    expect(weekBarLabelBackgrounds([], false)).toEqual([NEUTRAL_SWATCH_HEX]);
    const ink = weekBarLabelInk([null], false);
    expect(ink).toBe(DARK_INK);
    expect(contrastRatio(ink, NEUTRAL_SWATCH_HEX)).toBeGreaterThanOrEqual(4.5);
  });

  test.each([...PALETTE, null])(
    "%s passado (traço esmaecido): contraste >= 4,5 sobre qualquer fundo da grade",
    (token) => {
      const ink = weekBarLabelInk([token], true);
      for (const background of weekBarLabelBackgrounds([token], true)) {
        expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  test("contraste da WCAG: branco sobre preto é 21", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  test("a paleta do cálculo é a mesma do CSS", () => {
    const strip = (file: string) =>
      readFileSync(path.join(process.cwd(), file), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
    const services = strip("src/shared/styles/avenly-services.css");
    for (const token of PALETTE) {
      const rule = new RegExp(`\\[data-color="${token}"\\]\\s*\\{([^}]*)\\}`).exec(
        services,
      );
      const swatch = /--swatch:\s*([^;]+);/.exec(rule?.[1] ?? "")?.[1]?.trim();
      expect(swatch?.toLowerCase()).toBe(SERVICE_SWATCH_HEX[token]);
    }
    const agenda = strip("src/shared/styles/avenly-agenda.css");
    expect(agenda).toMatch(
      new RegExp(
        `\\.week-bar-stripe b\\s*\\{[^}]*var\\(--swatch,\\s*${NEUTRAL_SWATCH_HEX}\\)`,
      ),
    );
  });
});

describe("pedido de 2026-10-12: cartão da Semana no celular", () => {
  test("mostra o nome abreviado e mantém o nome acessível completo", () => {
    window.innerWidth = 390;
    const appointment = appointmentFixture();
    render(
      <WeekView
        entries={[
          {
            appointment,
            date: "2026-09-28",
            endMinutes: 660,
            key: appointment.id,
            kind: "appointment",
            startMinutes: 600,
          },
        ]}
        onSelectDay={vi.fn()}
        serviceColors={new Map([["s1", "SKY"]])}
        start="2026-09-28"
      />,
    );

    const card = screen.getByRole("link", { name: /Felipe Borges/ });
    expect(card).toHaveAccessibleName(
      "Atendimento: Felipe Borges, Corte feminino · 60 min, 10:00–11:00, Confirmado",
    );
    const label = within(card).getByText("Felipe B.");
    expect(label).toHaveClass("week-bar-label");
    expect(label).toHaveAttribute("aria-hidden", "true");
    // SKY é escuro: texto branco.
    expect(label).toHaveStyle({ color: "rgb(255, 255, 255)" });
  });

  test("sem nome cadastrado, mostra o mesmo rótulo do desktop (o telefone), sem abreviar", () => {
    const appointment = appointmentFixture({
      customer: { id: "c1", name: null, phone: "5511998887766" },
    });
    render(
      <WeekView
        entries={[
          {
            appointment,
            date: "2026-09-28",
            endMinutes: 660,
            key: appointment.id,
            kind: "appointment",
            startMinutes: 600,
          },
        ]}
        onSelectDay={vi.fn()}
        start="2026-09-28"
      />,
    );
    const card = screen.getByRole("link", { name: /Corte feminino/ });
    const label = card.querySelector(".week-bar-label");
    const desktopName = card.querySelector(".week-bar-name");
    expect(label?.textContent).toBe(desktopName?.textContent);
    expect(label?.textContent).toMatch(/9\d{4}-\d{4}/);
    // Serviço sem cor: cinza padrão, texto preto.
    expect(label).toHaveStyle({ color: "rgb(0, 0, 0)" });
  });

  test("bloqueio não ganha nome de cliente", () => {
    const block: TimeBlock = {
      endAt: "2026-09-28T16:00:00.000Z",
      id: "block-1",
      kind: "BLOCK",
      reason: null,
      seriesId: null,
      startAt: "2026-09-28T15:00:00.000Z",
      title: "Almoço",
    };
    render(
      <WeekView
        entries={[
          {
            date: "2026-09-28",
            endMinutes: 780,
            key: block.id,
            kind: "block",
            startMinutes: 720,
            timeBlock: block,
          },
        ]}
        onSelectBlock={vi.fn()}
        onSelectDay={vi.fn()}
        start="2026-09-28"
      />,
    );
    const card = screen.getByRole("button", { name: /Bloqueio: Almoço/ });
    expect(card.querySelector(".week-bar-label")).toBeNull();
  });
});
